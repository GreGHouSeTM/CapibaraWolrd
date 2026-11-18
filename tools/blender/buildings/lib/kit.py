"""Kit commun des façades japonaises (repère de mur).

Repère de mur : x le long du mur (vers la droite vu de l'extérieur), y vers le haut, z vers l'extérieur.
z = 0 = plan des axes des poteaux ; face extérieure des poteaux en z = +POST/2 ; enduit en retrait de 3 cm.
`wall_frame(side, W, D)` donne la matrice qui place ce repère sur un côté de l'emprise (origine = axe du poteau d'angle gauche).

Pièces : poteaux et poutres en bois patiné, panneaux d'enduit, lambris (koshi-ita), shōji (papier translucide + kumiko),
grilles koshi, volets amado, portes coulissantes, boutique ouverte avec estrade (shōgi), fenêtres à barreaux enduits
(mushiko-mado), balcons à balustres, soubassement de pierres sèches, marches, engawa, chaînes de pluie (kusari-doi).
"""
import math
from mathutils import Vector as V
from .geom import X, Y, Z, box, aabb, beam, post, quad, poly, tube, cylinder, tint, jitter, affine, Matrix
from .materials import C

POST = 0.15
FL = 0.45          # plancher au-dessus du sol
PL_Z = 0.045       # plan de l'enduit
UV_WOOD = (0.45, 2.0)
UV_PLASTER = (2.4, 2.4)
UV_PLANKS = (1.2, 1.2)
UV_STONE = (2.0, 2.0)


def wall_frame(side, W, D):
    """Matrice 4×4 : repère de mur -> repère du bâtiment. Retourne (M, longueur entre axes des poteaux d'angle)."""
    h = POST / 2
    if side == 'front':
        R = Matrix(((1, 0, 0), (0, 1, 0), (0, 0, 1)))
        o, L = (-W / 2 + h, 0, D / 2 - h), W - POST
    elif side == 'back':
        R = Matrix(((-1, 0, 0), (0, 1, 0), (0, 0, -1)))
        o, L = (W / 2 - h, 0, -D / 2 + h), W - POST
    elif side == 'left':
        R = Matrix(((0, 0, -1), (0, 1, 0), (1, 0, 0)))
        o, L = (-W / 2 + h, 0, -D / 2 + h), D - POST
    else:  # right
        R = Matrix(((0, 0, 1), (0, 1, 0), (-1, 0, 0)))
        o, L = (W / 2 - h, 0, D / 2 - h), D - POST
    return affine(R, o), L


class Pal:
    """Palette d'un bâtiment (couleurs de sommets) : variantes de bois, d'enduit, d'usure."""

    def __init__(self, wood='wood_dark', plaster='plaster_cream', light='wood_light', board='wood_mid', wear=1.0):
        self.wood = tint('wood', C[wood])
        self.wood2 = tint('wood', C['wood_old'])
        self.light = tint('wood', C[light])
        self.plaster = tint('plaster', C[plaster])
        self.board = tint('planks', C[board])
        self.black = tint('planks', C['wood_black'])
        self.stone = (0.95, 0.93, 0.9)
        self.wear = wear


# ====================================================================== remplissages d'une travée (repère de mur)
def plaster(b, pal, x0, x1, y0, y1, z=PL_Z, col=None):
    quad(b, 'plaster', (x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), col or pal.plaster, UV_PLASTER, out=Z,
         off=(b.rng.random(), b.rng.random()))


def boards(b, pal, x0, x1, y0, y1, z=0.06, col=None, rail=True):
    """Lambris de planches verticales (koshi-ita / yakisugi) avec couvre-joint haut."""
    c = col or pal.board
    quad(b, 'planks', (x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), c, UV_PLANKS, out=Z, off=(b.rng.random(), 0))
    if rail:
        aabb(b, 'wood', x0, y1 - 0.04, z - 0.01, x1, y1, z + 0.03, col=pal.wood, uvs=UV_WOOD, grain=0, skip=('-z',))


def paper(b, x0, x1, y0, y1, z, cw, ch):
    """Papier de shōji : UV calées pour que le quadrillage peint coïncide avec les kumiko (cases cw × ch)."""
    uvs = [((x - x0) / (cw * 4), (y - y0) / (ch * 4)) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
    b.face('paper_shoji', [V((x0, y0, z)), V((x1, y0, z)), V((x1, y1, z)), V((x0, y1, z))], uvs, (1, 1, 1), out=Z)


def shoji_panel(b, pal, x0, x1, y0, y1, z, lod, koshi_h=0.28, cell=(0.25, 0.30)):
    """Un panneau de shōji : cadre, soubassement de bois, papier et quadrillage kumiko en relief."""
    fw, rt, rb = 0.035, 0.04, 0.05
    wl = pal.light
    if lod <= 1:
        aabb(b, 'wood', x0, y0, z - 0.015, x0 + fw, y1, z + 0.02, col=wl, uvs=UV_WOOD, skip=('-z', '-y'))
        aabb(b, 'wood', x1 - fw, y0, z - 0.015, x1, y1, z + 0.02, col=wl, uvs=UV_WOOD, skip=('-z', '-y'))
        aabb(b, 'wood', x0 + fw, y1 - rt, z - 0.015, x1 - fw, y1, z + 0.02, col=wl, uvs=UV_WOOD, grain=0, skip=('-z', '-x', '+x'))
    yb = y0 + (koshi_h if koshi_h else rb)
    if koshi_h:
        quad(b, 'planks', (x0 + fw, y0, z), (x1 - fw, y0, z), (x1 - fw, yb, z), (x0 + fw, yb, z), pal.board, UV_PLANKS, out=Z)
    aabb(b, 'wood', x0 + fw, yb - 0.03, z - 0.015, x1 - fw, yb, z + 0.02, col=wl, uvs=UV_WOOD, grain=0, skip=('-z', '-x', '+x'))
    xi0, xi1, yi0, yi1 = x0 + fw, x1 - fw, yb, y1 - rt
    nx = max(1, round((xi1 - xi0) / cell[0]))
    ny = max(1, round((yi1 - yi0) / cell[1]))
    cw, ch = (xi1 - xi0) / nx, (yi1 - yi0) / ny
    paper(b, xi0 - cw * 0, xi1, yi0, yi1, z - 0.012, cw, ch)
    if lod == 0:
        t, dz = 0.012, 0.012
        for i in range(1, nx):
            x = xi0 + i * cw
            aabb(b, 'wood', x - t / 2, yi0, z - 0.012, x + t / 2, yi1, z - 0.012 + dz, col=wl, uvs=UV_WOOD, skip=('-z', '-y', '+y'))
        for j in range(1, ny):
            y = yi0 + j * ch
            aabb(b, 'wood', xi0, y - t / 2, z - 0.012, xi1, y + t / 2, z - 0.012 + dz, col=wl, uvs=UV_WOOD, grain=0, skip=('-z', '-x', '+x'))


def tracks(b, pal, x0, x1, y0, y1, z=0.0, sill=True, d=0.12):
    """Seuil (shikii) et linteau (kamoi) d'une ouverture."""
    if sill:
        aabb(b, 'wood', x0, y0 - 0.05, z - d / 2, x1, y0, z + d / 2, col=pal.wood2, uvs=UV_WOOD, grain=0, skip=('-y',))
    aabb(b, 'wood', x0, y1, z - d / 2, x1, y1 + 0.1, z + d / 2, col=pal.wood, uvs=UV_WOOD, grain=0)


def shoji(b, pal, x0, x1, y0, y1, lod, n=2, koshi_h=0.28, z=0.0):
    tracks(b, pal, x0, x1, y0, y1, z)
    w = (x1 - x0) / n
    for i in range(n):
        zz = z + (0.03 if i % 2 else 0.0)
        shoji_panel(b, pal, x0 + i * w - (0.01 if i else 0), x0 + (i + 1) * w + (0.01 if i < n - 1 else 0), y0, y1, zz, lod, koshi_h)


def koshi(b, pal, x0, x1, y0, y1, lod, slat=0.03, gap=0.028, z=0.06, rails=3, col=None, paper_behind=True):
    """Grille koshi : lattes verticales fines devant un papier (lueur la nuit entre les lattes)."""
    c = col or pal.wood
    if paper_behind:
        paper(b, x0, x1, y0, y1, z - 0.05, 0.25, 0.30)
    else:
        quad(b, 'interior', (x0, y0, z - 0.05), (x1, y0, z - 0.05), (x1, y1, z - 0.05), (x0, y1, z - 0.05), (1, 1, 1), out=Z)
    step = slat + gap if lod == 0 else 0.1
    n = int((x1 - x0) / step)
    xs = x0 + ((x1 - x0) - n * step) / 2
    for i in range(n + 1):
        x = xs + i * step
        cc = jitter(c, b.rng, 0.05)
        if lod == 0:
            aabb(b, 'wood', x - slat / 2, y0, z - 0.02, x + slat / 2, y1, z + 0.015, col=cc, uvs=UV_WOOD, skip=('-z', '-y', '+y'))
        else:
            quad(b, 'wood', (x - 0.02, y0, z), (x + 0.02, y0, z), (x + 0.02, y1, z), (x - 0.02, y1, z), cc, UV_WOOD, out=Z)
    for k in range(rails):
        y = y0 + (y1 - y0) * k / max(1, rails - 1) if rails > 1 else y0
        y = min(max(y, y0 + 0.03), y1 - 0.03)
        aabb(b, 'wood', x0, y - 0.03, z, x1, y + 0.03, z + 0.035, col=c, uvs=UV_WOOD, grain=0, skip=('-z',))


def amado(b, pal, x0, x1, y0, y1, lod, z=0.08):
    """Volets coulissants amado (planches + traverses)."""
    quad(b, 'planks', (x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), pal.board, UV_PLANKS, out=Z, off=(b.rng.random(), 0))
    n = max(1, round((x1 - x0) / 0.9))
    if lod == 0:
        w = (x1 - x0) / n
        for i in range(1, n):
            x = x0 + i * w
            aabb(b, 'wood', x - 0.015, y0, z, x + 0.015, y1, z + 0.02, col=pal.wood, uvs=UV_WOOD, skip=('-z',))
        for k in range(4):
            y = y0 + 0.1 + (y1 - y0 - 0.2) * k / 3
            aabb(b, 'wood', x0, y - 0.025, z, x1, y + 0.025, z + 0.025, col=pal.wood, uvs=UV_WOOD, grain=0, skip=('-z',))
    aabb(b, 'wood', x0, y1, z - 0.05, x1, y1 + 0.08, z + 0.05, col=pal.wood, uvs=UV_WOOD, grain=0)


def door(b, pal, x0, x1, y0, y1, lod, kind='koshido', z=0.0, open_frac=0.0):
    """Porte coulissante d'entrée : koshido (grille + papier en haut, planches en bas) ou itado (planches)."""
    tracks(b, pal, x0, x1, y0, y1, z)
    n = 2
    w = (x1 - x0) / n
    for i in range(n):
        a = x0 + i * w
        e = a + w
        zz = z + (0.035 if i else 0.0)
        if i == 1 and open_frac > 0:
            a -= w * open_frac
            e -= w * open_frac
        aabb(b, 'wood', a, y0, zz - 0.02, a + 0.05, y1, zz + 0.02, col=pal.wood, uvs=UV_WOOD, skip=('-z',))
        aabb(b, 'wood', e - 0.05, y0, zz - 0.02, e, y1, zz + 0.02, col=pal.wood, uvs=UV_WOOD, skip=('-z',))
        aabb(b, 'wood', a + 0.05, y1 - 0.06, zz - 0.02, e - 0.05, y1, zz + 0.02, col=pal.wood, uvs=UV_WOOD, grain=0, skip=('-z',))
        ym = y0 + 0.75
        if kind == 'itado':
            quad(b, 'planks', (a + 0.05, y0, zz), (e - 0.05, y0, zz), (e - 0.05, y1 - 0.06, zz), (a + 0.05, y1 - 0.06, zz), pal.board, UV_PLANKS, out=Z)
        else:
            quad(b, 'planks', (a + 0.05, y0, zz), (e - 0.05, y0, zz), (e - 0.05, ym, zz), (a + 0.05, ym, zz), pal.board, UV_PLANKS, out=Z)
            koshi(b, pal, a + 0.05, e - 0.05, ym, y1 - 0.06, lod, slat=0.025, gap=0.045, z=zz + 0.03, rails=2)
    if open_frac > 0:
        ox = x0 + w - w * open_frac
        quad(b, 'interior', (ox, y0, z - 0.05), (x0 + w, y0, z - 0.05), (x0 + w, y1, z - 0.05), (ox, y1, z - 0.05), (1, 1, 1), out=Z)


def shop_open(b, pal, x0, x1, y0, y1, lod, depth=1.6, bench=True, z=0.0, ground=0.0):
    """Façade de boutique ouverte : intérieur sombre (sol de planches, fond, plafond), estrade shōgi rabattue."""
    zi = z - depth
    tracks(b, pal, x0, x1, y0, y1, z, sill=True)
    # sol, fond, côtés, plafond (intérieur)
    quad(b, 'planks', (x0, y0, zi), (x1, y0, zi), (x1, y0, z), (x0, y0, z), pal.board, UV_PLANKS, uax=X, vax=Z, out=Y)
    quad(b, 'interior', (x0, y0, zi), (x1, y0, zi), (x1, y1, zi), (x0, y1, zi), (1, 1, 1), out=Z)
    quad(b, 'interior', (x0, y1, z), (x1, y1, z), (x1, y1, zi), (x0, y1, zi), (1, 1, 1), out=-Y)
    quad(b, 'interior', (x0, y0, z), (x0, y0, zi), (x0, y1, zi), (x0, y1, z), (1, 1, 1), out=X)
    quad(b, 'interior', (x1, y0, zi), (x1, y0, z), (x1, y1, z), (x1, y1, zi), (1, 1, 1), out=-X)
    if lod == 0:
        # étagères du fond (les produits sont posés par l'équipe Décor)
        for k, yy in enumerate((y0 + 0.5, y0 + 1.05)):
            aabb(b, 'wood', x0 + 0.1, yy - 0.03, zi, x1 - 0.1, yy, zi + 0.35, col=pal.wood2, uvs=UV_WOOD, grain=0)
    if bench and lod <= 1:
        hb = ground + 0.5
        zb0, zb1 = z + 0.12, z + 0.85
        aabb(b, 'planks', x0 + 0.08, hb - 0.05, zb0, x1 - 0.08, hb, zb1, col=pal.board, uvs=UV_PLANKS, grain=0)
        if lod == 0:
            for xx in (x0 + 0.2, x1 - 0.2):
                for zz in (zb1 - 0.1,):
                    aabb(b, 'wood', xx - 0.03, ground, zz - 0.03, xx + 0.03, hb - 0.05, zz + 0.03, col=pal.wood, uvs=UV_WOOD, skip=('-y',))
    b.anchor('anchor_noren', ((x0 + x1) / 2, y1, z + 0.08), 0.0, w=round(x1 - x0, 2), h=round(min(1.0, (y1 - y0) * 0.45), 2))
    b.anchor('light_shop', ((x0 + x1) / 2, y0 + 1.6, zi + 0.4), 0.0, color='#ffb060', intensity=1.0)


def mushiko(b, pal, x0, x1, y0, y1, lod, z=PL_Z):
    """Fenêtre d'étage à barreaux d'enduit (mushiko-mado) dans un mur enduit."""
    m = 0.18
    plaster(b, pal, x0, x1, y0, y0 + m, z)
    plaster(b, pal, x0, x1, y1 - m, y1, z)
    quad(b, 'interior', (x0, y0 + m, z - 0.12), (x1, y0 + m, z - 0.12), (x1, y1 - m, z - 0.12), (x0, y1 - m, z - 0.12), (1, 1, 1), out=Z)
    bw, gp = 0.07, 0.07
    n = int((x1 - x0) / (bw + gp))
    xs = x0 + ((x1 - x0) - n * (bw + gp) + gp) / 2
    for i in range(n):
        x = xs + i * (bw + gp)
        if lod == 0:
            aabb(b, 'plaster', x, y0 + m, z - 0.06, x + bw, y1 - m, z + 0.01, col=pal.plaster, uvs=UV_PLASTER, skip=('-z', '-y', '+y'))
        else:
            quad(b, 'plaster', (x, y0 + m, z), (x + bw, y0 + m, z), (x + bw, y1 - m, z), (x, y1 - m, z), pal.plaster, UV_PLASTER, out=Z)
    if xs > x0:
        plaster(b, pal, x0, xs, y0 + m, y1 - m, z)
        plaster(b, pal, xs + n * (bw + gp) - gp, x1, y0 + m, y1 - m, z)


def window(b, pal, x0, x1, y0, y1, lod, wy0, wy1, wx0=None, wx1=None, kind='koshi'):
    """Mur enduit percé d'une fenêtre (koshi ou shōji) avec appui."""
    wx0 = x0 + 0.2 if wx0 is None else wx0
    wx1 = x1 - 0.2 if wx1 is None else wx1
    plaster(b, pal, x0, x1, y0, wy0)
    plaster(b, pal, x0, x1, wy1, y1)
    plaster(b, pal, x0, wx0, wy0, wy1)
    plaster(b, pal, wx1, x1, wy0, wy1)
    aabb(b, 'wood', wx0 - 0.04, wy0 - 0.05, -0.02, wx1 + 0.04, wy0, 0.1, col=pal.wood, uvs=UV_WOOD, grain=0)
    aabb(b, 'wood', wx0 - 0.04, wy1, -0.02, wx1 + 0.04, wy1 + 0.05, 0.09, col=pal.wood, uvs=UV_WOOD, grain=0)
    if kind == 'koshi':
        koshi(b, pal, wx0, wx1, wy0, wy1, lod, slat=0.035, gap=0.035, z=0.07, rails=2)
    else:
        shoji(b, pal, wx0, wx1, wy0, wy1, lod, n=2, koshi_h=0, z=0.0)


def railing(b, pal, x0, x1, y, h=0.8, z=0.55, lod=0, baluster=0.12):
    """Garde-corps de balcon (tesuri) : main courante, lisse basse, balustres."""
    aabb(b, 'wood', x0, y + h - 0.06, z - 0.04, x1, y + h, z + 0.04, col=pal.wood, uvs=UV_WOOD, grain=0)
    aabb(b, 'wood', x0, y + 0.08, z - 0.03, x1, y + 0.14, z + 0.03, col=pal.wood, uvs=UV_WOOD, grain=0)
    step = baluster if lod == 0 else 0.3
    n = int((x1 - x0) / step)
    for i in range(n + 1):
        x = x0 + i * (x1 - x0) / max(1, n)
        aabb(b, 'wood', x - 0.015, y + 0.14, z - 0.015, x + 0.015, y + h - 0.06, z + 0.015, col=pal.wood, uvs=UV_WOOD, skip=('-y', '+y'))


# ====================================================================== mur complet
def wall(b, pal, side, W, D, y0, y1, bays, lod, lintel=None, nuki=True, corner_last=False, posts=True, top_beam=True,
         xstart=0.0, xend=None):
    """Mur d'un côté : poteaux aux limites des travées, remplissages, sablière haute et linteau.
    bays = [(largeur, remplissage, options)] ; la somme est ramenée à la longueur du mur.
    remplissages : plaster, boards, boards_plaster, shoji, koshi, amado, door, itado, shop, mushiko, window, open, none."""
    M, L = wall_frame(side, W, D)
    xend = L if xend is None else xend
    L2 = xend - xstart
    tot = sum(w for w, _, _ in bays)
    xs = [xstart]
    for w, _, _ in bays:
        xs.append(xs[-1] + w * L2 / tot)
    lt = lintel if lintel is not None else min(y1 - 0.35, y0 + 1.85)
    with b.at(M):
        for i, (w, fill, opt) in enumerate(bays):
            a, e = xs[i] + POST / 2, xs[i + 1] - POST / 2
            ya, ye_ = y0, y1
            op = opt or {}
            if fill == 'plaster':
                if nuki and lod == 0:
                    plaster(b, pal, a, e, ya, ye_)
                    yn = ya + (ye_ - ya) * 0.55
                    aabb(b, 'wood', a, yn - 0.05, PL_Z - 0.01, e, yn + 0.05, PL_Z + 0.012, col=pal.wood2, uvs=UV_WOOD, grain=0, skip=('-z',))
                else:
                    plaster(b, pal, a, e, ya, ye_)
            elif fill == 'boards':
                boards(b, pal, a, e, ya, ye_, col=pal.black if op.get('black') else None, rail=False)
            elif fill == 'boards_plaster':
                hb = op.get('h', 0.95)
                boards(b, pal, a, e, ya, ya + hb, col=pal.black if op.get('black') else None)
                plaster(b, pal, a, e, ya + hb, ye_)
            elif fill in ('shoji', 'koshi', 'amado', 'door', 'itado', 'shop', 'open', 'window_shoji'):
                top = op.get('top', lt)
                if fill == 'shoji':
                    shoji(b, pal, a, e, ya, top, lod, n=op.get('n', 2), koshi_h=op.get('koshi_h', 0.28))
                elif fill == 'koshi':
                    tracks(b, pal, a, e, ya + 0.05, top, sill=True)
                    koshi(b, pal, a, e, ya + 0.05, top, lod)
                elif fill == 'amado':
                    amado(b, pal, a, e, ya, top, lod)
                elif fill in ('door', 'itado'):
                    door(b, pal, a, e, ya, top, lod, kind='itado' if fill == 'itado' else 'koshido', open_frac=op.get('open', 0.0))
                    b.anchor('anchor_noren', ((a + e) / 2, top, 0.12), 0.0, w=round(e - a, 2), h=round(min(1.0, (top - ya) * 0.45), 2))
                elif fill == 'shop':
                    shop_open(b, pal, a, e, ya, top, lod, depth=op.get('depth', 1.6), bench=op.get('bench', True), ground=op.get('ground', 0.0))
                elif fill == 'open':
                    shop_open(b, pal, a, e, ya, top, lod, depth=op.get('depth', 1.2), bench=False)
                if top < ye_ - 0.02:
                    if op.get('ranma') and lod == 0:
                        koshi(b, pal, a, e, top + 0.1, ye_, lod, slat=0.02, gap=0.05, z=0.03, rails=2)
                    else:
                        plaster(b, pal, a, e, top + 0.1, ye_)
            elif fill == 'mushiko':
                mushiko(b, pal, a, e, ya, ye_, lod)
            elif fill == 'window':
                window(b, pal, a, e, ya, ye_, lod, op.get('wy0', ya + 0.8), op.get('wy1', min(ye_ - 0.3, ya + 1.8)),
                       kind=op.get('kind', 'koshi'))
            # 'none' : rien (ouverture ou mur traité ailleurs)
        if posts:
            last = len(xs) if corner_last else len(xs) - 1
            for k in range(last):
                x = xs[k]
                post(b, 'wood', x, 0, y0 - 0.12, y1, POST, col=jitter(pal.wood, b.rng, 0.06), chamfer=0.02 if lod == 0 else 0, uvs=UV_WOOD)
        # sablière basse (dodai) et haute (keta / linteau d'étage)
        aabb(b, 'wood', xstart - POST / 2, y0 - 0.12, -0.08, xend + POST / 2, y0, 0.085, col=pal.wood2, uvs=UV_WOOD, grain=0, skip=('-y',))
        if top_beam:
            aabb(b, 'wood', xstart - POST / 2, y1, -0.09, xend + POST / 2, y1 + 0.2, 0.09, col=pal.wood, uvs=UV_WOOD, grain=0)
    return M, xs


def gable_infill(b, pal, side, W, D, y_base, roof_y, lod, mat='plaster', timber=True):
    """Pignon triangulaire sous le toit (côté `side`), au plan du mur : enduit + poutres apparentes.
    roof_y(z_mur) = hauteur de la sous-face du toit au point du mur (repère de mur : x = position le long du mur)."""
    M, L = wall_frame(side, W, D)
    n = 8
    with b.at(M):
        pts = [V((0, y_base, PL_Z))]
        for i in range(n + 1):
            x = L * i / n
            pts.append(V((x, max(y_base, roof_y(x)), PL_Z)))
        pts.append(V((L, y_base, PL_Z)))
        col = pal.plaster if mat == 'plaster' else pal.board
        poly(b, mat, pts, col, UV_PLASTER if mat == 'plaster' else UV_PLANKS, uax=X, vax=Y, out=Z)
        if timber:
            ytop = roof_y(L / 2)
            # entrait, poinçon (tsuka) et deux contrefiches
            aabb(b, 'wood', -0.05, y_base + 0.25, 0.0, L + 0.05, y_base + 0.45, 0.09, col=pal.wood, uvs=UV_WOOD, grain=0, skip=('-z',))
            if ytop - y_base > 1.0:
                aabb(b, 'wood', L / 2 - 0.07, y_base + 0.45, 0.0, L / 2 + 0.07, ytop - 0.05, 0.08, col=pal.wood, uvs=UV_WOOD, skip=('-z', '-y', '+y'))
                for f in (0.25, 0.75):
                    x = L * f
                    yt = roof_y(x)
                    if yt - y_base > 0.8:
                        aabb(b, 'wood', x - 0.06, y_base + 0.45, 0.0, x + 0.06, yt - 0.03, 0.075, col=pal.wood, uvs=UV_WOOD, skip=('-z', '-y', '+y'))
                ym = y_base + 0.45 + (ytop - y_base - 0.45) * 0.55
                if lod == 0:
                    x0 = L * 0.25
                    x1 = L * 0.75
                    aabb(b, 'wood', x0, ym - 0.05, 0.0, x1, ym + 0.05, 0.085, col=pal.wood2, uvs=UV_WOOD, grain=0, skip=('-z',))


# ====================================================================== soubassement, sols, marches
def plinth(b, x0, z0, x1, z1, y1=FL - 0.12, y0=-0.9, batter=0.04, lod=0, skip=()):
    """Soubassement de pierres sèches (emprise x0..x1, z0..z1), fruit léger ; descend sous le sol pour les terrains en pente."""
    col = (1, 1, 1)
    o = (0.3, 0.1)
    t = batter
    sides = {
        'front': ((x0, y0, z1 + t), (x1, y0, z1 + t), (x1, y1, z1), (x0, y1, z1), Z),
        'back': ((x1, y0, z0 - t), (x0, y0, z0 - t), (x0, y1, z0), (x1, y1, z0), -Z),
        'left': ((x0 - t, y0, z0), (x0 - t, y0, z1), (x0, y1, z1), (x0, y1, z0), -X),
        'right': ((x1 + t, y0, z1), (x1 + t, y0, z0), (x1, y1, z0), (x1, y1, z1), X),
    }
    for k, (p0, p1, p2, p3, out) in sides.items():
        if k in skip:
            continue
        quad(b, 'stone', p0, p1, p2, p3, col, UV_STONE, uax=(V(p1) - V(p0)).normalized(), vax=Y, off=(b.rng.random(), 0.2), out=out)
    quad(b, 'stone', (x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0), (0.8, 0.8, 0.8), UV_STONE, uax=X, vax=-Z, out=Y)


def steps(b, xc, z_face, w, n, rise=0.18, run=0.3, out=1, y_top=None, ground=0.0, lod=0):
    """Marches de pierre devant une entrée (vers +z si out=1)."""
    for i in range(n):
        h = ground + rise * (n - i) if y_top is None else y_top - rise * i
        zf = z_face + out * run * (i + 1)
        zb = z_face + out * run * i
        ww = w + 0.06 * i
        aabb(b, 'stone', xc - ww / 2, -0.3, min(zb, zf), xc + ww / 2, h, max(zb, zf), col=jitter((0.92, 0.9, 0.86), b.rng, 0.06),
             uvs=(1.4, 1.4), skip=('-y',))


def floor_deck(b, pal, x0, z0, x1, z1, y, t=0.06, along='x', col=None):
    """Plancher de planches (engawa, balcon)."""
    c = col or tint('planks', C['wood_old'])
    aabb(b, 'planks', x0, y - t, z0, x1, y, z1, col=c, uvs=UV_PLANKS, grain=0 if along == 'x' else 2)


def engawa(b, pal, x0, x1, z_wall, z_edge, y=FL, lod=0, posts_at=None, ground=0.0):
    """Coursive engawa : plancher, poutre de rive, petits poteaux sur pierres (repère du bâtiment, côté +z)."""
    floor_deck(b, pal, x0, z_wall, x1, z_edge, y)
    aabb(b, 'wood', x0, y - 0.2, z_edge - 0.12, x1, y - 0.06, z_edge, col=pal.wood, uvs=UV_WOOD, grain=0)
    if lod <= 1:
        n = max(1, round((x1 - x0) / 1.82))
        for i in range(n + 1):
            x = x0 + 0.06 + (x1 - x0 - 0.12) * i / n
            aabb(b, 'wood', x - 0.05, ground + 0.12, z_edge - 0.11, x + 0.05, y - 0.2, z_edge - 0.01, col=pal.wood, uvs=UV_WOOD, skip=('-y',))
            if lod == 0:
                aabb(b, 'stone', x - 0.12, ground - 0.1, z_edge - 0.18, x + 0.12, ground + 0.12, z_edge + 0.06, col=(0.85, 0.85, 0.82), uvs=(0.8, 0.8), skip=('-y',))
        # dessous sombre
        quad(b, 'interior', (x0, ground - 0.1, z_edge - 0.15), (x1, ground - 0.1, z_edge - 0.15), (x1, y - 0.2, z_edge - 0.15), (x0, y - 0.2, z_edge - 0.15), (1, 1, 1), out=Z)


def rain_chain(b, x, z, y_top, y_bot, lod=0):
    """Chaîne de pluie (kusari-doi) : godets en cuivre bruni sous l'égout + crapaudine de galets au pied."""
    if lod > 0:
        return
    n = int((y_top - y_bot) / 0.13)
    for i in range(n):
        y = y_top - i * 0.13
        cylinder(b, 'metal', (x, y - 0.07, z), (x, y, z), 0.035, seg=6, caps=(True, False), smooth=True)
    aabb(b, 'stone', x - 0.25, -0.2, z - 0.25, x + 0.25, 0.05, z + 0.25, col=(0.75, 0.75, 0.72), uvs=(0.6, 0.6), skip=('-y',))


def gutter(b, x0, x1, y, z, lod=0):
    if lod > 0:
        return
    tube(b, 'metal', [(x0, y, z), (x1, y, z)], 0.06, seg=3, arc=(math.pi, 2 * math.pi), up=Y, col=(1, 1, 1), caps=(True, True))


def udatsu(b, pal, x, z0, z1, y0, y1, lod=0, t=0.3):
    """Mur coupe-feu udatsu en saillie sur le côté (plan x), coiffé d'un petit toit de tuiles."""
    aabb(b, 'plaster', x - t / 2, y0, z0, x + t / 2, y1, z1, col=pal.plaster, uvs=UV_PLASTER, grain=1)
    aabb(b, 'kawara', x - t / 2 - 0.08, y1, z0 - 0.08, x + t / 2 + 0.08, y1 + 0.1, z1 + 0.1, col=(1, 1, 1), uvs=(1.08, 1.2))
    if lod == 0:
        from .geom import prism
        prism(b, 'kawara', [(-(t / 2 + 0.1), 0), (t / 2 + 0.1, 0), (0, 0.18)], (x, y1 + 0.1, z0 - 0.1), X, Y, Z * (z1 - z0 + 0.2), (1, 1, 1), uvs=(1.08, 1.2))
