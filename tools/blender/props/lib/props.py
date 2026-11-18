"""Générateurs paramétrés des accessoires de Capyville (bible §7.1, §8.1, §8.3).

Chaque générateur reçoit un `random.Random` (graine = variante) et renvoie (Mesh, méta). Les variantes changent
proportions, teintes, usure et mousse : jamais deux objets voisins identiques. Méta :
  light   : hauteur locale du centre lumineux (lanternes) ou None
  collide : ('cercle', r) | ('boite', w, d) | None  (collision physique posée par le jeu ; rien sous 0,5 m)
  bevel   : chanfrein du LOD0 (m)
  cat     : famille (eclairage, mobilier, etal, contenant, plante, cloture, outil, statue)
Matériaux : mat=0 atlas, mat=1 papier lumineux (decor_glow).
"""
import math
import random
from mathutils import Vector, Matrix
from .mesh import Mesh, srgb, mul, lerp3

GEN = {}


def gen(name, variants=1, cat='divers'):
    def deco(fn):
        GEN[name] = (fn, variants, cat)
        return fn
    return deco


def rotY(a):
    return Matrix.Rotation(a, 3, 'Y')


def rotX(a):
    return Matrix.Rotation(a, 3, 'X')


def rotZ(a):
    return Matrix.Rotation(a, 3, 'Z')


# palette (sRGB de la charte) ; les tuiles photo sont déjà colorées : teintes proches du blanc
WOOD = ['#d8c8b8', '#c8b4a0', '#e6d6c4', '#b8a898']       # multiplicateurs du bois sombre
WOOD_LIGHT = ['#f4e2c4', '#ffe8c8', '#f0d8b0']
STONE = ['#d8d4cc', '#c8c4bc', '#e0dcd0', '#bcb8ae']
BAMBOO_G = ['#a8b070', '#b8b878', '#98a868']
BAMBOO_D = ['#d8c08a', '#e0c890', '#c8b07a']
LACQ_BLACK = '#262220'
RED = '#b8342a'


def pick(rng, a):
    return srgb(rng.choice(a))


# ================================================================================================ ÉCLAIRAGE
@gen('toro_kasuga', 4, 'eclairage')
def toro_kasuga(rng):
    """Lanterne de pierre kasuga : socle, fût, plateau, chambre à lumière, toit à coins relevés, bouton (hōju)."""
    m = Mesh(rng.randint(0, 9999))
    H = rng.uniform(1.55, 2.25)
    k = H / 2.0
    sides = rng.choice([6, 6, 4])
    st = pick(rng, STONE)
    ph = math.pi / sides
    rad = lambda r: r / math.cos(math.pi / sides) if sides == 4 else r
    # socle en deux marches
    m.lathe([(rad(0.42 * k), 0), (rad(0.42 * k), 0.12 * k), (rad(0.34 * k), 0.17 * k), (rad(0.3 * k), 0.24 * k)], sides, 'stone', st, cap_top=True, cap_bot=True, smooth=False, phase=ph, tex=0.6)
    # fût (rond, renflé, avec bague)
    y0 = 0.24 * k
    sh = 0.78 * k
    m.lathe([(0.13 * k, y0), (0.15 * k, y0 + sh * 0.1), (0.13 * k, y0 + sh * 0.5), (0.155 * k, y0 + sh * 0.52), (0.155 * k, y0 + sh * 0.56),
             (0.13 * k, y0 + sh * 0.58), (0.12 * k, y0 + sh)], 14, 'stone', st, tex=0.6)
    # plateau (chūdai)
    y1 = y0 + sh
    m.lathe([(rad(0.18 * k), y1), (rad(0.36 * k), y1 + 0.13 * k), (rad(0.36 * k), y1 + 0.18 * k)], sides, 'stone', st, cap_top=True, smooth=False, phase=ph, tex=0.6)
    # chambre à lumière (hibukuro) : montants + papier lumineux
    y2 = y1 + 0.18 * k
    hh = 0.34 * k
    rr = 0.24 * k
    for i in range(sides):
        a = ph + 2 * math.pi * i / sides
        m.box((math.cos(a) * rr, y2 + hh / 2, math.sin(a) * rr), (0.075 * k, hh, 0.075 * k), 'stone', st, rot=rotY(-a), tex=0.4)
    m.lathe([(rr * 0.86, y2), (rr * 0.86, y2 + hh)], sides, 'paper', srgb('#f6e8c8'), mat=1, smooth=False, phase=0, cap_top=True, cap_bot=True)
    # toit (kasa) : pyramide à rebord épais et coins relevés (warabite)
    y3 = y2 + hh
    R = 0.52 * k
    roof_rad = lambda a, y: 1 + (0.09 if abs(y - (y3 + 0.05 * k)) < 1e-6 else 0) * max(0, math.cos(sides * (a - ph)))
    m.lathe([(rad(0.26 * k), y3), (rad(R), y3 + 0.0), (rad(R), y3 + 0.05 * k), (rad(0.34 * k), y3 + 0.2 * k), (rad(0.12 * k), y3 + 0.3 * k), (0.07 * k, y3 + 0.33 * k)],
            sides, 'stone', st, cap_bot=True, smooth=False, phase=ph, radial=roof_rad, tex=0.8)
    # bouton (hōju) en forme d'oignon
    y4 = y3 + 0.33 * k
    m.lathe([(0.06 * k, y4), (0.09 * k, y4 + 0.03 * k), (0.06 * k, y4 + 0.06 * k), (0.085 * k, y4 + 0.1 * k), (0.07 * k, y4 + 0.15 * k), (0.0, y4 + 0.21 * k)], 10, 'stone', st, tex=0.4)
    m.finish(moss_amount=rng.uniform(0.35, 0.85), seed=rng.random() * 9, ao_k=0.5, wet=0.25)
    return m, dict(light=y2 + hh / 2, collide=('cercle', 0.42 * k), bevel=0.012, cat='eclairage')


@gen('toro_yukimi', 2, 'eclairage')
def toro_yukimi(rng):
    """Lanterne « à regarder la neige » : grand toit plat sur 3 ou 4 pieds courbes, au bord de l'eau et dans les jardins."""
    m = Mesh(rng.randint(0, 9999))
    legs = rng.choice([3, 4])
    st = pick(rng, STONE)
    H = rng.uniform(0.85, 1.15)
    for i in range(legs):
        a = 2 * math.pi * i / legs + 0.3
        pts = []
        for t in range(6):
            tt = t / 5
            r = 0.42 - 0.22 * tt + 0.06 * math.sin(tt * math.pi)
            pts.append((math.cos(a) * r, tt * 0.42 * H, math.sin(a) * r))
        m.tube(pts, 0.05, 6, 'stone', st, tex=0.5)
    y = 0.42 * H
    m.lathe([(0.24, y), (0.24, y + 0.06)], 6, 'stone', st, cap_top=True, cap_bot=True, smooth=False)
    m.lathe([(0.15, y + 0.06), (0.15, y + 0.3 * H)], 6, 'paper', srgb('#f6e8c8'), mat=1, smooth=False, cap_top=True)
    for i in range(6):
        a = 2 * math.pi * i / 6 + math.pi / 6
        m.box((math.cos(a) * 0.17, y + 0.06 + 0.15 * H, math.sin(a) * 0.17), (0.05, 0.3 * H, 0.05), 'stone', st, rot=rotY(-a), tex=0.3)
    y2 = y + 0.06 + 0.3 * H
    R = rng.uniform(0.6, 0.75)
    m.lathe([(0.2, y2), (R, y2 + 0.02), (R * 1.02, y2 + 0.07), (0.3, y2 + 0.22), (0.08, y2 + 0.3), (0.0, y2 + 0.36)], 6, 'stone', st, cap_bot=True, smooth=False, tex=1.2,
            radial=lambda a, yy: 1 + (0.08 if yy > y2 + 0.06 and yy < y2 + 0.08 else 0) * max(0, math.cos(6 * a)))
    m.finish(moss_amount=rng.uniform(0.5, 0.95), seed=rng.random() * 9, ao_k=0.55, wet=0.3)
    return m, dict(light=y + 0.06 + 0.15 * H, collide=('cercle', 0.45), bevel=0.01, cat='eclairage')


@gen('toro_oki', 3, 'eclairage')
def toro_oki(rng):
    """Petite lanterne posée (oki-dōrō), jardins et bords de ruelles."""
    m = Mesh(rng.randint(0, 9999))
    st = pick(rng, STONE)
    s = rng.uniform(0.55, 0.75)
    m.box((0, 0.06 * s, 0), (0.34 * s, 0.12 * s, 0.34 * s), 'stone', st, jitter=0.006)
    m.box((0, 0.27 * s, 0), (0.26 * s, 0.3 * s, 0.26 * s), 'stone', st, jitter=0.004)
    m.box((0, 0.27 * s, 0.131 * s), (0.12 * s, 0.14 * s, 0.004), 'paper', srgb('#f6e8c8'), mat=1)
    m.box((0, 0.27 * s, -0.131 * s), (0.12 * s, 0.14 * s, 0.004), 'paper', srgb('#f6e8c8'), mat=1)
    m.lathe([(0.29 * s, 0.42 * s), (0.29 * s, 0.46 * s), (0.08 * s, 0.6 * s), (0.0, 0.64 * s)], 4, 'stone', st, cap_bot=True, smooth=False, phase=math.pi / 4)
    m.sphere((0, 0.66 * s, 0), 0.045 * s, 0.05 * s, 0.045 * s, 8, 5, 'stone', st)
    m.finish(moss_amount=rng.uniform(0.6, 1.0), seed=rng.random() * 9, ao_k=0.5, wet=0.3)
    return m, dict(light=0.27 * s, collide=None, bevel=0.006, cat='eclairage')


@gen('chochin', 6, 'eclairage')
def chochin(rng):
    """Lanterne de papier à côtes (origine = point d'accroche, la lanterne pend vers le bas)."""
    m = Mesh(rng.randint(0, 9999))
    kind = rng.choice(['ovale', 'ovale', 'long', 'rond'])
    H = {'ovale': 0.5, 'long': 0.75, 'rond': 0.38}[kind] * rng.uniform(0.9, 1.15)
    R = {'ovale': 0.2, 'long': 0.19, 'rond': 0.2}[kind] * rng.uniform(0.92, 1.1)
    col = srgb(rng.choice(['#d8402e', '#c8362a', '#f6ead4', '#f6ead4', '#e86a3a']))
    ribs = int(H / 0.035)
    top = -0.08
    prof = []
    n = 24
    for j in range(n + 1):
        t = j / n
        y = top - 0.04 - (H - 0.08) * (1 - t)
        s = math.sin(math.pi * (0.08 + 0.84 * t))
        e = 0.6 if kind == 'long' else 0.85
        r = R * (0.55 + 0.45 * s ** e) if kind != 'rond' else R * (0.35 + 0.65 * s)
        prof.append((r, y))
    # côtes : léger renflement entre deux baleines
    m.lathe(prof, 20, 'paper', col, mat=1, radial=lambda a, y: 1 - 0.035 * abs(math.sin((y / (H - 0.08)) * ribs * math.pi)))
    # bagues laquées noires haut et bas
    rb = prof[-1][0] * 1.05
    rt = prof[0][0] * 1.05
    m.lathe([(rb, top - 0.05), (rb, top - 0.01)], 16, 'plain', srgb(LACQ_BLACK), cap_top=True, cap_bot=True)
    m.lathe([(rt, top - H + 0.005), (rt, top - H + 0.05)], 16, 'plain', srgb(LACQ_BLACK), cap_top=True, cap_bot=True)
    m.cyl((0, top - 0.01, 0), (0, 0, 0), 0.006, 0.006, 4, 'metal', srgb('#403830'), caps=False)
    if rng.random() < 0.5:
        # gland rouge sous la lanterne
        m.cyl((0, top - H - 0.12, 0), (0, top - H, 0), 0.02, 0.006, 6, 'cloth', srgb('#b02a20'))
    return m, dict(light=top - H / 2, collide=None, bevel=0.0, cat='eclairage', hang=True)


@gen('andon', 3, 'eclairage')
def andon(rng):
    """Lanterne de bois sur pied (ruelles) : cadre de bois sombre, papier lumineux, petit toit."""
    m = Mesh(rng.randint(0, 9999))
    w = pick(rng, WOOD)
    H = rng.uniform(1.05, 1.3)
    s = rng.uniform(0.3, 0.38)
    for x in (-1, 1):
        for z in (-1, 1):
            m.box((x * s / 2, H / 2, z * s / 2), (0.045, H, 0.045), 'wood', w, tex=0.6)
    for yy in (0.12, H * 0.45, H - 0.02):
        for (cx, cz, sx, sz) in ((0, s / 2, s, 0.03), (0, -s / 2, s, 0.03), (s / 2, 0, 0.03, s), (-s / 2, 0, 0.03, s)):
            m.box((cx, yy, cz), (sx + 0.03, 0.035, sz + 0.03), 'wood', w, tex=0.6)
    m.box((0, (H * 0.45 + H) / 2, 0), (s - 0.02, H * 0.55 - 0.04, s - 0.02), 'paper', srgb('#f4e4c0'), mat=1)
    # quadrillage fin sur le papier (deux côtés)
    for k in (-1, 1):
        m.box((0, (H * 0.45 + H) / 2, k * (s / 2 - 0.006)), (0.015, H * 0.55 - 0.05, 0.012), 'wood', w)
        m.box((k * (s / 2 - 0.006), (H * 0.45 + H) / 2, 0), (0.012, H * 0.55 - 0.05, 0.015), 'wood', w)
    m.lathe([(s * 0.78, H), (s * 0.78, H + 0.03), (0.04, H + 0.14)], 4, 'wood', mul(w, 0.8), cap_bot=True, smooth=False, phase=math.pi / 4)
    m.finish(moss_wood=0.15, seed=rng.random() * 9, ao_k=0.6)
    return m, dict(light=(H * 0.45 + H) / 2, collide=('cercle', 0.3), bevel=0.006, cat='eclairage')


# ================================================================================================ MOBILIER
@gen('banc', 4, 'mobilier')
def banc(rng):
    """Banquette de bois (shōgi), parfois couverte d'un tissu rouge (maisons de thé, dango)."""
    m = Mesh(rng.randint(0, 9999))
    L = rng.uniform(1.6, 2.0)
    D = rng.uniform(0.5, 0.65)
    H = rng.uniform(0.4, 0.46)
    w = pick(rng, WOOD_LIGHT if rng.random() < 0.4 else WOOD)
    planks = rng.choice([3, 4])
    for i in range(planks):
        z = -D / 2 + D * (i + 0.5) / planks
        m.box((rng.uniform(-0.01, 0.01), H - 0.025, z), (L, 0.05, D / planks - 0.012), 'planks', mul(w, rng.uniform(0.9, 1.08)), tex=1.5)
    for x in (-L / 2 + 0.12, L / 2 - 0.12):
        for z in (-D / 2 + 0.06, D / 2 - 0.06):
            m.box((x, (H - 0.05) / 2, z), (0.07, H - 0.05, 0.07), 'wood', w)
        m.box((x, H - 0.09, 0), (0.06, 0.07, D - 0.04), 'wood', w)
        m.box((x, 0.12, 0), (0.045, 0.045, D - 0.1), 'wood', w)
    m.box((0, 0.12, D / 2 - 0.06), (L - 0.3, 0.045, 0.04), 'wood', w)
    if rng.random() < 0.45:
        cc = srgb(rng.choice(['#b8342a', '#a82a22', '#c84a2a']))
        m.box((0, H + 0.008, 0), (L * 0.86, 0.016, D + 0.02), 'cloth', cc)
        for z in (-1, 1):
            m.box((0, H - 0.06, z * (D / 2 + 0.018)), (L * 0.86, 0.13, 0.008), 'cloth', cc)
    m.finish(seed=rng.random() * 9, ao_k=0.55, moss_wood=rng.uniform(0, 0.12))
    return m, dict(light=None, collide=('boite', L, D), bevel=0.008, cat='mobilier')


@gen('kosatsu', 1, 'mobilier')
def kosatsu(rng):
    """Tableau d'affichage des missions (kōsatsu) : panneau sous un petit toit, affiches de papier, socle de pierre."""
    m = Mesh(77)
    w = srgb('#c8b4a0')
    W, H = 2.6, 2.7
    for x in (-W / 2, W / 2):
        m.box((x, 0.12, 0), (0.36, 0.24, 0.36), 'stone', srgb('#d0ccc0'), jitter=0.01)
        m.box((x, H / 2, 0), (0.16, H, 0.16), 'wood', w)
    m.box((0, 1.55, 0), (W - 0.1, 1.1, 0.06), 'planks', srgb('#e8d8c4'), tex=2.6)
    m.box((0, 2.12, 0.02), (W + 0.2, 0.08, 0.1), 'wood', w)
    m.box((0, 0.98, 0.02), (W + 0.1, 0.08, 0.1), 'wood', w)
    rr = random.Random(5)
    for i in range(7):
        x = -W / 2 + 0.3 + i * (W - 0.55) / 6 + rr.uniform(-0.05, 0.05)
        y = rr.uniform(1.25, 1.85)
        m.box((x, y, 0.035), (rr.uniform(0.24, 0.32), rr.uniform(0.3, 0.42), 0.006), 'paper', srgb(rr.choice(['#fff6e4', '#f4ecd8', '#fff0d0'])), rot=rotZ(rr.uniform(-0.06, 0.06)))
        m.box((x, y + 0.17, 0.04), (0.02, 0.02, 0.01), 'metal', srgb('#303030'))
    # toit à deux pans couvert de bardeaux
    for s in (-1, 1):
        m.box((0, H + 0.13, s * 0.26), (W + 0.7, 0.05, 0.62), 'roughwood', srgb('#b0a090'), rot=rotX(s * 0.42), tex=1.5)
    m.box((0, H + 0.26, 0), (W + 0.75, 0.07, 0.08), 'wood', mul(w, 0.8))
    m.finish(seed=3.3, ao_k=0.6, moss_wood=0.25, moss_amount=0.6)
    return m, dict(light=None, collide=('boite', W + 0.3, 0.45), bevel=0.01, cat='mobilier')


@gen('nobori', 4, 'mobilier')
def nobori(rng):
    """Bannière verticale (nobori) sur perche de bambou, lestée d'un pied de pierre."""
    m = Mesh(rng.randint(0, 9999))
    col = srgb(rng.choice(['#b8342a', '#2a3a5c', '#e8d8b0', '#3a6a4a', '#c8902e', '#7a3a6a']))
    bam = pick(rng, BAMBOO_D)
    H = rng.uniform(2.9, 3.4)
    m.lathe([(0.17, 0), (0.17, 0.1), (0.12, 0.16)], 8, 'stone', srgb('#c8c4b8'), cap_top=True, cap_bot=True, smooth=False)
    m.cyl((0, 0.1, 0), (0, H, 0), 0.025, 0.02, 8, 'bamboo', bam, rings=1)
    m.cyl((0, H - 0.08, 0), (0.5, H - 0.08, 0), 0.012, 0.012, 6, 'bamboo', bam)
    m.cloth((0.27, H - 0.1, 0), 0.46, H - 1.0, 'cloth', col, nx=3, ny=10, wave=0.04, seed=rng.random() * 6)
    # bande blanche décorative en haut
    m.box((0.27, H - 0.2, 0), (0.46, 0.12, 0.016), 'cloth', srgb('#f4ece0'))
    return m, dict(light=None, collide=('cercle', 0.18), bevel=0.0, cat='mobilier')


@gen('daisha', 2, 'mobilier')
def daisha(rng):
    """Charrette à bras (daisha) : plateau de planches, deux roues à rayons, brancards."""
    m = Mesh(rng.randint(0, 9999))
    w = pick(rng, WOOD)
    L, W = rng.uniform(1.6, 1.9), rng.uniform(0.8, 0.95)
    R = rng.uniform(0.36, 0.42)
    y = R + 0.06
    for i in range(5):
        m.box((0, y, -W / 2 + W * (i + 0.5) / 5), (L, 0.04, W / 5 - 0.01), 'planks', mul(w, rng.uniform(0.9, 1.1)), tex=2)
    for s in (-1, 1):
        m.box((-0.2, y - 0.05, s * W / 2), (L + 1.0, 0.07, 0.07), 'wood', w)
        m.box((0, y + 0.12, s * W / 2), (L, 0.2, 0.03), 'planks', w, tex=2)
        # roue
        zc = s * (W / 2 + 0.08)
        m.lathe([(R, -0.035), (R, 0.035)], 24, 'wood', mul(w, 0.85), c=(0.1, R, zc), rot=rotX(math.pi / 2), smooth=False)
        m.lathe([(R - 0.04, 0.036), (R - 0.04, -0.036)], 24, 'metal', srgb('#3a342e'), c=(0.1, R, zc), rot=rotX(math.pi / 2), smooth=False)
        for k in range(8):
            a = k * math.pi / 4
            m.box((0.1 + math.cos(a) * R / 2, R + math.sin(a) * R / 2, zc), (R, 0.03, 0.025), 'wood', w, rot=rotZ(a))
        m.cyl((0.1, R, zc - 0.06), (0.1, R, zc + 0.06), 0.06, 0.06, 10, 'wood', mul(w, 0.7))
    m.box((-L / 2 - 0.65, y - 0.05, 0), (0.06, 0.06, W), 'wood', w)
    # pied d'appui avant pour que le plateau reste horizontal
    m.box((-L / 2 - 0.3, (y - 0.08) / 2, 0), (0.06, y - 0.08, 0.06), 'wood', w)
    # chargement : sacs de riz ou caisse
    if rng.random() < 0.6:
        for i in range(rng.randint(1, 3)):
            sack(m, (rng.uniform(-0.5, 0.5), y + 0.02, rng.uniform(-0.2, 0.2)), rng, rot=rotY(rng.uniform(-0.3, 0.3)) @ rotZ(math.pi / 2), scale=0.85)
    m.finish(seed=rng.random() * 9, ao_k=0.6, moss_wood=0.05)
    return m, dict(light=None, collide=('boite', L + 0.8, W + 0.3), bevel=0.006, cat='mobilier')


@gen('kanban', 3, 'mobilier')
def kanban(rng):
    """Enseigne debout (tate-kanban) devant les échoppes : planche verticale sur un pied, bordure sombre."""
    m = Mesh(rng.randint(0, 9999))
    w = pick(rng, WOOD)
    H = rng.uniform(1.1, 1.4)
    m.box((0, 0.05, 0), (0.5, 0.1, 0.34), 'wood', mul(w, 0.8))
    m.box((0, H / 2 + 0.05, 0), (0.36, H - 0.1, 0.05), 'planks', srgb(rng.choice(['#f4ead8', '#e8d8b8', '#3a2a20'])), tex=1.5)
    for x in (-0.19, 0.19):
        m.box((x, H / 2 + 0.05, 0), (0.035, H, 0.06), 'wood', w)
    m.box((0, H + 0.06, 0), (0.46, 0.05, 0.1), 'wood', w)
    m.finish(seed=rng.random() * 9, ao_k=0.6)
    return m, dict(light=None, collide=('cercle', 0.25), bevel=0.006, cat='mobilier')


# ================================================================================================ CONTENANTS
def staves(n, amp=0.012):
    return lambda a, y: 1 + amp * abs(math.sin(a * n / 2))


@gen('taru', 4, 'contenant')
def taru(rng):
    """Tonneau de miso ou de sauce : douelles, cerclages de bambou tressé, couvercle, étiquette de papier."""
    m = Mesh(rng.randint(0, 9999))
    H = rng.uniform(0.55, 0.85)
    R = rng.uniform(0.25, 0.34)
    w = pick(rng, WOOD_LIGHT)
    prof = [(R * 0.92, 0), (R * 0.98, H * 0.25), (R, H * 0.5), (R * 0.98, H * 0.75), (R * 0.93, H)]
    m.lathe(prof, 28, 'planks', w, cap_bot=True, radial=staves(28), tex=1.2)
    m.lathe([(R * 0.88, H - 0.02), (R * 0.88, H - 0.005)], 20, 'planks', mul(w, 0.85), cap_top=True)
    bam = pick(rng, BAMBOO_D)
    for t in (0.1, 0.32, 0.68, 0.9):
        y = H * t
        r = R * (0.92 + 0.08 * math.sin(math.pi * t)) + 0.012
        m.lathe([(r, y - 0.025), (r + 0.008, y), (r, y + 0.025)], 24, 'straw', bam)
    if rng.random() < 0.7:
        # étiquette de papier
        m.lathe([(R + 0.004, H * 0.38), (R + 0.004, H * 0.62)], 20, 'paper', srgb('#f4ead0'), radial=None, phase=0)
        m.faces[-20:] = m.faces[-20:][:6]
        m.uv[-20:] = m.uv[-20:][:6]
        m.col[-20:] = m.col[-20:][:6]
    if rng.random() < 0.5:
        # couvercle de bois et pierre de pressage (tsukemono)
        m.lathe([(R * 0.8, H), (R * 0.8, H + 0.03)], 18, 'planks', mul(w, 0.9), cap_top=True, smooth=False)
        m.sphere((0, H + 0.09, 0), 0.12, 0.07, 0.1, 10, 6, 'stone', srgb('#c8c4b8'), bump=0.15, seed=rng.random() * 5)
    m.finish(seed=rng.random() * 9, ao_k=0.55, moss_wood=0.05, wet=0.2)
    return m, dict(light=None, collide=('cercle', R + 0.03) if H > 0.5 else None, bevel=0.0, cat='contenant')


@gen('oke', 4, 'contenant')
def oke(rng):
    """Seau de bois cerclé (te-oke, avec anse ou poignées), parfois avec une louche."""
    m = Mesh(rng.randint(0, 9999))
    H = rng.uniform(0.22, 0.36)
    R = rng.uniform(0.15, 0.21)
    w = pick(rng, WOOD_LIGHT)
    m.lathe([(R * 0.86, 0), (R, H)], 20, 'planks', w, cap_bot=True, radial=staves(20, 0.01), tex=1)
    m.lathe([(R * 0.95, H), (R * 0.86, 0.02)], 20, 'planks', mul(w, 0.7), cap_bot=True)
    for t in (0.18, 0.78):
        r = R * (0.86 + 0.14 * t) + 0.006
        m.lathe([(r, H * t - 0.012), (r, H * t + 0.012)], 20, 'metal' if rng.random() < 0.5 else 'straw', srgb('#605040'))
    kind = rng.random()
    if kind < 0.4:
        # anse : deux montants prolongés + barre
        for s in (-1, 1):
            m.box((s * (R - 0.01), H + 0.07, 0), (0.025, 0.16, 0.05), 'planks', w)
        m.box((0, H + 0.14, 0), (2 * R, 0.03, 0.04), 'wood', w)
    elif kind < 0.7:
        m.tube([(0, H + 0.02, 0), (0.12, H + 0.16, 0.05), (0.25, H + 0.3, 0.1)], 0.01, 5, 'bamboo', pick(rng, BAMBOO_D))
        m.sphere((0, H - 0.01, 0), 0.05, 0.025, 0.05, 8, 4, 'bamboo', pick(rng, BAMBOO_D))
    m.finish(seed=rng.random() * 9, ao_k=0.6, wet=0.3)
    return m, dict(light=None, collide=None, bevel=0.0, cat='contenant')


@gen('oke_pile', 2, 'contenant')
def oke_pile(rng):
    """Pyramide de petits baquets jaunes des bains (devant le sentō et le vestiaire)."""
    m = Mesh(rng.randint(0, 9999))
    col = srgb(rng.choice(['#f0c850', '#e8d0a0']))
    rows = [4, 3, 2, 1] if rng.random() < 0.6 else [3, 2, 1]
    r, h = 0.13, 0.13
    for j, n in enumerate(rows):
        for i in range(n):
            x = (i - (n - 1) / 2) * (2 * r + 0.01)
            y = j * h
            if j % 2 == 0:
                m.lathe([(r * 0.85, y), (r, y + h)], 16, 'plain', col, cap_bot=True, c=(x, 0, 0))
                m.lathe([(r * 0.95, y + h), (r * 0.85, y + 0.01)], 16, 'plain', mul(col, 0.7), cap_bot=True, c=(x, 0, 0))
            else:
                # baquets retournés
                m.lathe([(r, y), (r * 0.85, y + h)], 16, 'plain', col, cap_top=True, c=(x, 0, 0))
    m.finish(seed=rng.random() * 9, ao_k=0.75, grime_amt=0.05)
    return m, dict(light=None, collide=('boite', len(rows) * 0.28, 0.3), bevel=0.0, cat='contenant')


@gen('kame', 8, 'contenant')
def kame(rng):
    """Poteries (jarres, tsubo, vases, pots à couvercle) en grès émaillé : profils et émaux variés."""
    m = Mesh(rng.randint(0, 9999))
    kind = rng.choice(['tsubo', 'jarre', 'vase', 'pot', 'bol'])
    s = rng.uniform(0.8, 1.25)
    glaze = srgb(rng.choice(['#8a5a3a', '#6a4a32', '#3a4a6a', '#8a9a80', '#d8ccb0', '#4a3a30', '#a8683a', '#5a6a5a']))
    if kind == 'tsubo':
        prof = [(0.1, 0), (0.17, 0.06), (0.2, 0.18), (0.18, 0.3), (0.1, 0.38), (0.08, 0.41), (0.09, 0.43), (0.07, 0.43)]
    elif kind == 'jarre':
        prof = [(0.16, 0), (0.24, 0.12), (0.27, 0.32), (0.24, 0.5), (0.16, 0.6), (0.17, 0.63), (0.14, 0.63)]
    elif kind == 'vase':
        prof = [(0.06, 0), (0.1, 0.06), (0.11, 0.16), (0.06, 0.3), (0.04, 0.4), (0.06, 0.46), (0.05, 0.46)]
    elif kind == 'pot':
        prof = [(0.12, 0), (0.16, 0.08), (0.16, 0.22), (0.13, 0.26), (0.13, 0.28)]
    else:
        prof = [(0.07, 0), (0.08, 0.015), (0.17, 0.08), (0.2, 0.12), (0.18, 0.12)]
    prof = [(r * s, y * s) for r, y in prof]
    m.lathe(prof, 22, 'ceramic', glaze, cap_bot=True, tex=0.8)
    # coulure d'émail : bas non émaillé (terre brute)
    m.lathe([(prof[0][0] * 1.01, 0), (prof[0][0] * 1.06 + 0.01, 0.035 * s)], 22, 'clay', srgb('#c8a888'))
    if kind == 'pot' and rng.random() < 0.7:
        r = prof[-1][0] + 0.01
        m.lathe([(r, prof[-1][1]), (r, prof[-1][1] + 0.02), (r * 0.6, prof[-1][1] + 0.05), (0.025, prof[-1][1] + 0.07)], 18, 'ceramic', mul(glaze, 0.9))
    elif kind in ('tsubo', 'jarre', 'vase', 'pot'):
        # intérieur sombre
        m.lathe([(prof[-1][0] * 0.95, prof[-1][1]), (prof[-1][0] * 0.6, prof[-1][1] - 0.06 * s)], 18, 'clay', srgb('#3a2a22'), cap_bot=True)
    m.finish(seed=rng.random() * 9, ao_k=0.7, grime_amt=0.06)
    H = max(y for _, y in prof)
    return m, dict(light=None, collide=('cercle', max(r for r, _ in prof)) if H > 0.5 else None, bevel=0.0, cat='contenant')


def yuzu_ball(m, c, rng, r=0.035, col=None):
    col = col or srgb(rng.choice(['#e8b820', '#f0c428', '#e0a818', '#d8c030']))
    m.sphere(c, r, r * 0.92, r, 7, 5, 'plain', col, bump=0.05, seed=rng.random() * 7)


def crate(m, c, L, W, H, rng, wcol, slats=3, rot=None):
    """Cagette ajourée : lattes sur 4 côtés, fond plein, coins renforcés."""
    cx, cy, cz = c
    R = rot or Matrix.Identity(3)

    def b(p, s, tile, col):
        pv = R @ Vector(p)
        m.box((cx + pv.x, cy + pv.y, cz + pv.z), s, tile, col, rot=R, tex=0.8)
    b((0, 0.01, 0), (L, 0.02, W), 'planks', wcol)
    for i in range(slats):
        y = 0.03 + (H - 0.04) * (i + 0.5) / slats
        hh = (H - 0.04) / slats * 0.6
        for s in (-1, 1):
            b((0, y, s * W / 2), (L, hh, 0.012), 'planks', mul(wcol, rng.uniform(0.85, 1.1)))
            b((s * L / 2, y, 0), (0.012, hh, W), 'planks', mul(wcol, rng.uniform(0.85, 1.1)))
    for sx in (-1, 1):
        for sz in (-1, 1):
            b((sx * (L / 2 - 0.015), H / 2, sz * (W / 2 - 0.015)), (0.03, H, 0.03), 'wood', wcol)


@gen('cagette', 6, 'etal')
def cagette(rng):
    """Cagette de bois garnie : yuzus, patates douces, daikons, choux, ou vide."""
    m = Mesh(rng.randint(0, 9999))
    L, W, H = rng.uniform(0.5, 0.62), rng.uniform(0.34, 0.42), rng.uniform(0.2, 0.26)
    w = pick(rng, WOOD_LIGHT)
    crate(m, (0, 0, 0), L, W, H, rng, w)
    fill = rng.choice(['yuzu', 'yuzu', 'yuzu', 'patate', 'daikon', 'chou'])
    if fill == 'yuzu':
        for layer in range(2):
            for i in range(6):
                for j in range(4):
                    x = -L / 2 + 0.05 + (L - 0.1) * i / 5 + rng.uniform(-0.008, 0.008) + layer * 0.02
                    z = -W / 2 + 0.05 + (W - 0.1) * j / 3 + rng.uniform(-0.008, 0.008)
                    if layer and rng.random() < 0.35:
                        continue
                    yuzu_ball(m, (x, H - 0.04 + layer * 0.05, z), rng)
    elif fill == 'patate':
        for i in range(14):
            x, z = rng.uniform(-L / 2 + 0.07, L / 2 - 0.07), rng.uniform(-W / 2 + 0.05, W / 2 - 0.05)
            m.sphere((x, H - 0.03 + rng.uniform(0, 0.03), z), 0.07, 0.035, 0.035, 8, 5, 'plain', srgb(rng.choice(['#8a3a4a', '#7a3040', '#9a4a50'])), bump=0.12, seed=i)
    elif fill == 'daikon':
        for i in range(5):
            z = -W / 2 + 0.06 + (W - 0.12) * i / 4
            m.lathe([(0.0, 0), (0.03, 0.06), (0.035, 0.3), (0.03, 0.42)], 10, 'plain', srgb('#f4f0e6'), c=(-L / 2 + 0.05, H - 0.02, z), rot=rotZ(-math.pi / 2), cap_top=True)
            m.sphere((L / 2 - 0.05, H, z), 0.05, 0.04, 0.05, 6, 4, 'plain', srgb('#4a7a2a'), bump=0.3, seed=i)
    elif fill == 'chou':
        for i in range(3):
            m.sphere((-L / 3 + i * L / 3, H + 0.02, 0), 0.1, 0.09, 0.1, 10, 7, 'cloth', srgb('#8aa850'), bump=0.12, seed=i * 3.1)
    m.finish(seed=rng.random() * 9, ao_k=0.6, grime_amt=0.08)
    return m, dict(light=None, collide=None, bevel=0.0, cat='etal')


def sack(m, c, rng, rot=None, scale=1.0):
    """Sac de riz en paille tressée (tawara) : cylindre bombé, extrémités tressées, cordes."""
    st = pick(rng, ['#e8d0a0', '#d8c090', '#e0c898'])
    L, R = 0.62 * scale, 0.17 * scale
    rot = rot or rotZ(math.pi / 2)
    prof = [(R * 0.5, 0), (R * 0.85, 0.03 * scale), (R, 0.12 * scale), (R, L - 0.12 * scale), (R * 0.85, L - 0.03 * scale), (R * 0.5, L)]
    cc = Vector(c) + rot @ Vector((0, -L / 2, 0)) + Vector((0, R, 0))
    m.lathe(prof, 14, 'straw', st, c=cc, rot=rot, cap_top=True, cap_bot=True, tex=0.8)
    for t in (0.2, 0.5, 0.8):
        m.lathe([(R + 0.006, L * t - 0.012), (R + 0.006, L * t + 0.012)], 14, 'straw', mul(st, 0.65), c=cc, rot=rot)


@gen('tawara', 3, 'contenant')
def tawara(rng):
    """Pile de sacs de riz (tawara) : greniers, moulin, ferme."""
    m = Mesh(rng.randint(0, 9999))
    n = rng.choice([1, 2, 3, 3])
    pos = [(0, 0, -0.18), (0, 0, 0.18), (0, 0.3, 0)][:n]
    for p in pos:
        sack(m, p, rng, rot=rotY(rng.uniform(-0.08, 0.08)) @ rotZ(math.pi / 2))
    m.finish(seed=rng.random() * 9, ao_k=0.55)
    return m, dict(light=None, collide=('boite', 0.7, 0.7) if n == 3 else None, bevel=0.0, cat='contenant')


@gen('maki', 3, 'outil')
def maki(rng):
    """Bois de chauffage empilé contre un mur, sur deux traverses."""
    m = Mesh(rng.randint(0, 9999))
    L = rng.uniform(1.0, 1.6)
    rows = rng.randint(3, 5)
    D = 0.42
    w = pick(rng, WOOD)
    for s in (-1, 1):
        m.box((s * (L / 2 - 0.1), 0.04, 0), (0.08, 0.08, D + 0.1), 'roughwood', w)
    y = 0.08
    for j in range(rows):
        n = int(L / 0.13)
        r = 0.055
        for i in range(n):
            x = -L / 2 + r + i * (L - 2 * r) / max(1, n - 1) + (j % 2) * 0.03
            rr = r * rng.uniform(0.8, 1.15)
            z0 = -D / 2 + rng.uniform(-0.04, 0.04)
            m.cyl((x, y + rr, z0), (x, y + rr, z0 + D), rr, rr, 6, 'bark', mul(w, rng.uniform(0.85, 1.1)), caps=True, tex=0.6)
        y += 2 * r * 0.92
    m.finish(seed=rng.random() * 9, ao_k=0.5, moss_wood=0.15)
    return m, dict(light=None, collide=('boite', L, D + 0.1) if y > 0.5 else None, bevel=0.0, cat='outil')


@gen('seiro', 4, 'etal')
def seiro(rng):
    """Paniers vapeur de bambou empilés (seiro) sur un petit fourneau d'argile (kamado), manjū sur le dessus."""
    m = Mesh(rng.randint(0, 9999))
    clay = srgb(rng.choice(['#c8b090', '#b89878', '#d0b898']))
    Hs = rng.uniform(0.6, 0.72)
    R = rng.uniform(0.26, 0.3)
    # fourneau
    m.lathe([(R + 0.08, 0), (R + 0.06, Hs - 0.05), (R + 0.09, Hs - 0.03), (R + 0.09, Hs)], 18, 'clay', clay, cap_bot=True, cap_top=True, smooth=False, tex=1)
    m.box((0, 0.18, R + 0.07), (0.22, 0.2, 0.04), 'metal', srgb('#2a2420'))
    m.box((0, 0.17, R + 0.08), (0.18, 0.12, 0.02), 'plain', srgb('#ff7a30'))   # braises (rougeoiement léger)
    # marmite
    m.lathe([(R * 0.9, Hs), (R + 0.02, Hs + 0.08), (R + 0.03, Hs + 0.1)], 18, 'metal', srgb('#3a3430'))
    y = Hs + 0.1
    bam = pick(rng, BAMBOO_D)
    n = rng.randint(2, 4)
    for i in range(n):
        h = 0.11
        m.lathe([(R, y), (R, y + h)], 22, 'wicker' if i % 2 else 'bamboo', bam, tex=0.6)
        m.lathe([(R + 0.008, y + 0.004), (R + 0.008, y + 0.025)], 22, 'bamboo', mul(bam, 0.8))
        m.lathe([(R + 0.008, y + h - 0.025), (R + 0.008, y + h - 0.004)], 22, 'bamboo', mul(bam, 0.8))
        y += h
    if rng.random() < 0.5:
        # couvercle bombé tressé
        m.lathe([(R + 0.01, y), (R * 0.8, y + 0.05), (0.04, y + 0.08), (0, y + 0.085)], 22, 'wicker', bam, tex=0.6)
    else:
        # panier ouvert : manjū blancs et bruns
        m.lathe([(R - 0.01, y - 0.01), (0, y - 0.01)], 18, 'wicker', mul(bam, 0.9))
        for i in range(7):
            a = i * 2 * math.pi / 6
            r = 0 if i == 6 else R * 0.6
            col = srgb(rng.choice(['#f6eee0', '#f2e4cc', '#c89060', '#f6eee0']))
            m.sphere((math.cos(a) * r, y + 0.02, math.sin(a) * r), 0.065, 0.045, 0.065, 10, 6, 'plain', col, bump=0.04, seed=i)
    m.finish(seed=rng.random() * 9, ao_k=0.6, grime_amt=0.08)
    return m, dict(light=None, collide=('cercle', R + 0.1), bevel=0.0, cat='etal', steam=y)


def stand(m, rng, L, D, H, tiers=1, w=None):
    """Étal : estrade de planches à 1 à 3 gradins (tiers), pieds et traverses ; renvoie les hauteurs des plateaux."""
    w = w or pick(rng, WOOD)
    tops = []
    for t in range(tiers):
        d = D / tiers
        z = -D / 2 + d * (t + 0.5)
        h = H + t * 0.28
        m.box((0, h - 0.02, z), (L, 0.04, d), 'planks', mul(w, rng.uniform(0.9, 1.1)), tex=1.6)
        m.box((0, h - 0.07, z + d / 2 - 0.02), (L, 0.07, 0.03), 'wood', w)
        for x in (-L / 2 + 0.05, L / 2 - 0.05):
            m.box((x, h / 2, z + d / 2 - 0.03), (0.06, h, 0.06), 'wood', w)
            m.box((x, h / 2, z - d / 2 + 0.03), (0.06, h, 0.06), 'wood', w)
        tops.append((h, z, d))
    for x in (-L / 2 + 0.05, L / 2 - 0.05):
        m.box((x, 0.12, 0), (0.04, 0.04, D - 0.06), 'wood', w)
    return tops


@gen('etal_manju', 3, 'etal')
def etal_manju(rng):
    """Étal de la confiserie : estrade, plateaux laqués de manjū, petits paniers vapeur, boîtes enveloppées."""
    m = Mesh(rng.randint(0, 9999))
    L = rng.uniform(1.2, 1.5)
    tops = stand(m, rng, L, 0.6, rng.uniform(0.62, 0.7), tiers=rng.choice([1, 2]))
    bam = pick(rng, BAMBOO_D)
    for (h, z, d) in tops:
        x = -L / 2 + 0.2
        while x < L / 2 - 0.15:
            k = rng.random()
            if k < 0.45:
                R = 0.14
                m.lathe([(R, h), (R, h + 0.07)], 18, 'bamboo', bam, cap_bot=True)
                for i in range(4):
                    a = i * math.pi / 2 + 0.4
                    m.sphere((x + math.cos(a) * 0.06, h + 0.085, z + math.sin(a) * 0.06), 0.045, 0.032, 0.045, 8, 5, 'plain', srgb(rng.choice(['#f6eee0', '#c89060', '#f0d8e0'])), seed=i)
                x += 0.32
            elif k < 0.75:
                m.box((x, h + 0.012, z), (0.3, 0.024, 0.22), 'plain', srgb('#2a1e1a'))
                for i in range(3):
                    for j in range(2):
                        m.sphere((x - 0.09 + i * 0.09, h + 0.04, z - 0.05 + j * 0.1), 0.038, 0.028, 0.038, 8, 5, 'plain', srgb(rng.choice(['#f6eee0', '#c89060', '#9ab878', '#f0c8d0'])), seed=i + j)
                x += 0.36
            else:
                for i in range(rng.randint(1, 3)):
                    m.box((x, h + 0.04 + i * 0.08, z), (0.18, 0.075, 0.14), 'paper', srgb(rng.choice(['#f4ead8', '#d8a0a0', '#a8c0a0'])), rot=rotY(rng.uniform(-0.2, 0.2)))
                x += 0.26
    m.finish(seed=rng.random() * 9, ao_k=0.6)
    return m, dict(light=None, collide=('boite', L, 0.6), bevel=0.005, cat='etal')


@gen('etal_lanternes', 3, 'etal')
def etal_lanternes(rng):
    """Échoppe des lanternes : portique de bambou avec 3 à 5 chōchin pendus, et lanternes posées sur l'estrade."""
    m = Mesh(rng.randint(0, 9999))
    L = rng.uniform(1.3, 1.6)
    bam = pick(rng, BAMBOO_D)
    H = 2.05
    for x in (-L / 2, L / 2):
        m.cyl((x, 0, 0.2), (x, H, 0.2), 0.025, 0.022, 8, 'bamboo', bam)
        m.lathe([(0.08, 0), (0.08, 0.05)], 8, 'stone', srgb('#c8c4b8'), c=(x, 0, 0.2), cap_top=True, smooth=False)
    m.cyl((-L / 2 - 0.05, H - 0.05, 0.2), (L / 2 + 0.05, H - 0.05, 0.2), 0.02, 0.02, 8, 'bamboo', bam)
    tops = stand(m, rng, L - 0.1, 0.4, 0.55, tiers=1)
    n = rng.randint(3, 5)
    for i in range(n):
        x = -L / 2 + 0.2 + (L - 0.4) * i / max(1, n - 1)
        col = srgb(rng.choice(['#d8402e', '#f6ead4', '#e86a3a', '#f6ead4', '#c8362a']))
        hgt = rng.uniform(0.34, 0.55)
        y0 = H - 0.12 - rng.uniform(0, 0.15)
        m.cyl((x, y0, 0.2), (x, H - 0.05, 0.2), 0.004, 0.004, 4, 'metal', srgb('#403830'), caps=False)
        r = rng.uniform(0.13, 0.18)
        prof = [(r * (0.55 + 0.45 * math.sin(math.pi * (0.08 + 0.84 * j / 12))), y0 - 0.03 - hgt * (1 - j / 12)) for j in range(13)]
        m.lathe(prof, 16, 'paper', col, mat=1, c=(x, 0, 0.2), radial=lambda a, y, hh=hgt: 1 - 0.035 * abs(math.sin(y / hh * 14 * math.pi)))
        m.lathe([(prof[-1][0] * 1.05, y0 - 0.04), (prof[-1][0] * 1.05, y0)], 12, 'plain', srgb(LACQ_BLACK), c=(x, 0, 0.2), cap_top=True, cap_bot=True)
        m.lathe([(prof[0][0] * 1.05, y0 - 0.03 - hgt), (prof[0][0] * 1.05, y0 - hgt)], 12, 'plain', srgb(LACQ_BLACK), c=(x, 0, 0.2), cap_top=True, cap_bot=True)
    h, z, d = tops[0]
    for i in range(3):
        x = -L / 2 + 0.3 + i * (L - 0.6) / 2
        col = srgb(rng.choice(['#f6ead4', '#d8402e', '#f6ead4']))
        m.sphere((x, h + 0.11, z), 0.1, 0.11, 0.1, 12, 7, 'paper', col, mat=1)
    m.finish(seed=rng.random() * 9, ao_k=0.6)
    return m, dict(light=1.6, collide=('boite', L, 0.5), bevel=0.0, cat='etal')


@gen('etal_yuzu', 3, 'etal')
def etal_yuzu(rng):
    """Étal incliné du marchand de yuzus : cagettes pleines en gradins, panier, petite ardoise."""
    m = Mesh(rng.randint(0, 9999))
    L = rng.uniform(1.2, 1.5)
    tops = stand(m, rng, L, 0.7, 0.45, tiers=2)
    w = pick(rng, WOOD_LIGHT)
    for (h, z, d) in tops:
        n = int(L / 0.5)
        for i in range(n):
            x = -L / 2 + (L / n) * (i + 0.5)
            crate(m, (x, h, z), L / n - 0.04, d - 0.06, 0.12, rng, w, slats=1, rot=rotY(rng.uniform(-0.04, 0.04)))
            for a in range(5):
                for b in range(3):
                    if rng.random() < 0.15:
                        continue
                    yuzu_ball(m, (x - (L / n) / 2 + 0.06 + a * ((L / n) - 0.12) / 4, h + 0.1 + rng.uniform(0, 0.03), z - d / 2 + 0.07 + b * (d - 0.14) / 2), rng, r=0.038)
    m.finish(seed=rng.random() * 9, ao_k=0.6)
    return m, dict(light=None, collide=('boite', L, 0.7), bevel=0.005, cat='etal')


def kokeshi(m, c, rng, s=1.0):
    x, y, z = c
    body = srgb(rng.choice(['#c8402a', '#2a4a7a', '#e8c050', '#3a7a4a', '#d87090']))
    m.lathe([(0.03 * s, 0), (0.035 * s, 0.02 * s), (0.03 * s, 0.11 * s), (0.022 * s, 0.13 * s)], 10, 'plain', body, c=(x, y, z), cap_bot=True)
    m.sphere((x, y + 0.165 * s, z), 0.035 * s, 0.038 * s, 0.035 * s, 10, 6, 'plain', srgb('#f4e8d4'))
    m.sphere((x, y + 0.18 * s, z - 0.005 * s), 0.036 * s, 0.03 * s, 0.036 * s, 10, 5, 'plain', srgb('#1e1a18'))


@gen('etal_jouets', 3, 'etal')
def etal_jouets(rng):
    """Atelier de jouets en bois : étagère à gradins de kokeshi, toupies (koma), daruma rouges, petits chevaux."""
    m = Mesh(rng.randint(0, 9999))
    L = rng.uniform(1.1, 1.4)
    tops = stand(m, rng, L, 0.66, 0.5, tiers=3, w=pick(rng, WOOD_LIGHT))
    for (h, z, d) in tops:
        x = -L / 2 + 0.1
        while x < L / 2 - 0.08:
            k = rng.random()
            if k < 0.4:
                kokeshi(m, (x, h, z), rng, rng.uniform(0.9, 1.5))
                x += 0.1
            elif k < 0.7:
                col = srgb(rng.choice(['#c8402a', '#2a6aa8', '#e8b830', '#3a8a5a']))
                m.lathe([(0.0, h), (0.04, h + 0.03), (0.05, h + 0.045), (0.012, h + 0.06), (0.008, h + 0.1)], 12, 'plain', col, c=(x, 0, z))
                m.lathe([(0.05, h + 0.04), (0.051, h + 0.05)], 12, 'plain', srgb('#f4ead8'), c=(x, 0, z))
                x += 0.12
            else:
                m.sphere((x, h + 0.06, z), 0.055, 0.06, 0.05, 12, 7, 'plain', srgb('#c42a20'), seed=1)
                m.box((x, h + 0.065, z + 0.045), (0.045, 0.035, 0.01), 'plain', srgb('#f4ead8'))
                x += 0.13
    m.finish(seed=rng.random() * 9, ao_k=0.65)
    return m, dict(light=None, collide=('boite', L, 0.66), bevel=0.005, cat='etal')


@gen('etal_poterie', 3, 'etal')
def etal_poterie(rng):
    """Étal du potier : planches sur parpaings de pierre, bols retournés, assiettes empilées, petites jarres."""
    m = Mesh(rng.randint(0, 9999))
    L = rng.uniform(1.2, 1.6)
    w = pick(rng, WOOD)
    for j, h in enumerate((0.2, 0.48)):
        z = 0.12 - j * 0.22
        m.box((0, h, z), (L, 0.04, 0.28), 'planks', w, tex=1.6)
        for x in (-L / 2 + 0.12, L / 2 - 0.12):
            m.box((x, (h - 0.02) / 2, z), (0.16, h - 0.02, 0.2), 'stone', pick(rng, STONE), jitter=0.006)
        x = -L / 2 + 0.12
        while x < L / 2 - 0.1:
            glaze = srgb(rng.choice(['#8a5a3a', '#3a4a6a', '#8a9a80', '#d8ccb0', '#4a3a30', '#a8683a']))
            k = rng.random()
            if k < 0.35:
                for i in range(rng.randint(2, 5)):
                    m.lathe([(0.05, h + 0.02 + i * 0.018), (0.12, h + 0.035 + i * 0.018)], 18, 'ceramic', glaze, c=(x, 0, z), cap_bot=True)
                x += 0.27
            elif k < 0.65:
                m.lathe([(0.1, h + 0.02), (0.08, h + 0.08), (0.035, h + 0.1), (0.0, h + 0.1)], 16, 'ceramic', glaze, c=(x, 0, z), cap_bot=True)
                x += 0.22
            else:
                s = rng.uniform(0.35, 0.6)
                m.lathe([(0.06 * s / 0.5, h + 0.02), (0.1 * s / 0.5, h + 0.02 + 0.08 * s), (0.08 * s / 0.5, h + 0.02 + 0.18 * s), (0.05 * s / 0.5, h + 0.02 + 0.22 * s)], 16, 'ceramic', glaze, c=(x, 0, z), cap_bot=True)
                x += 0.2
    m.finish(seed=rng.random() * 9, ao_k=0.6)
    return m, dict(light=None, collide=('boite', L, 0.55), bevel=0.005, cat='etal')


@gen('etal_herbes', 3, 'etal')
def etal_herbes(rng):
    """Herboristerie : étagère à bocaux (couvercles de bois), boîtes à thé, bouquets d'herbes séchées pendus."""
    m = Mesh(rng.randint(0, 9999))
    L = rng.uniform(1.1, 1.3)
    w = pick(rng, WOOD)
    H = 1.45
    for x in (-L / 2, L / 2):
        for z in (-0.16, 0.16):
            m.box((x, H / 2, z), (0.05, H, 0.05), 'wood', w)
    for h in (0.3, 0.72, 1.12):
        m.box((0, h, 0), (L + 0.04, 0.03, 0.38), 'planks', w, tex=1.4)
        x = -L / 2 + 0.1
        while x < L / 2 - 0.08:
            if rng.random() < 0.6:
                # bocal de céramique claire à couvercle de bois
                c = srgb(rng.choice(['#e8e0d0', '#d8d8c8', '#c8d0c0']))
                m.lathe([(0.055, h + 0.015), (0.06, h + 0.03), (0.06, h + 0.16), (0.045, h + 0.18)], 14, 'ceramic', c, c=(x, 0, 0.04), cap_bot=True)
                m.lathe([(0.05, h + 0.18), (0.05, h + 0.21), (0.0, h + 0.215)], 14, 'wood', w, c=(x, 0, 0.04))
                m.box((x, h + 0.1, 0.098), (0.06, 0.05, 0.004), 'paper', srgb('#f4ead0'))
                x += 0.14
            else:
                c = srgb(rng.choice(['#3a5a3a', '#7a3a2a', '#2a3a5a', '#c8a050']))
                m.box((x + 0.04, h + 0.085, 0.02), (0.13, 0.14, 0.12), 'paper', c)
                m.box((x + 0.04, h + 0.09, 0.081), (0.07, 0.09, 0.003), 'paper', srgb('#f4ead0'))
                x += 0.17
    m.box((0, H, 0), (L + 0.1, 0.04, 0.42), 'planks', w)
    # bouquets séchés sous l'étagère du haut... devant le montant
    for i in range(rng.randint(3, 5)):
        x = -L / 2 + 0.15 + i * 0.25
        c = srgb(rng.choice(['#7a8a4a', '#8a7a4a', '#6a7a3a', '#9a8a5a']))
        m.cyl((x, H - 0.04, 0.21), (x, H - 0.12, 0.21), 0.006, 0.006, 4, 'straw', srgb('#a08060'), caps=False)
        m.lathe([(0.012, H - 0.12), (0.05, H - 0.2), (0.06, H - 0.3), (0.02, H - 0.36)], 8, 'straw', c, c=(x, 0, 0.21), radial=lambda a, y: 1 + 0.25 * math.sin(a * 5 + y * 40))
    m.finish(seed=rng.random() * 9, ao_k=0.6)
    return m, dict(light=None, collide=('boite', L + 0.1, 0.42), bevel=0.005, cat='etal')


@gen('soba_sechoir', 2, 'etal')
def soba_sechoir(rng):
    """Séchoir à nouilles du restaurant de soba : perches de bambou et rideaux de nouilles crème."""
    m = Mesh(rng.randint(0, 9999))
    L = rng.uniform(1.2, 1.5)
    bam = pick(rng, BAMBOO_D)
    H = 1.5
    for x in (-L / 2, L / 2):
        m.cyl((x, 0, -0.15), (x, H, 0), 0.022, 0.02, 8, 'bamboo', bam)
        m.cyl((x, 0, 0.15), (x, H, 0), 0.022, 0.02, 8, 'bamboo', bam)
    for k, y in enumerate((H - 0.05, H - 0.5)):
        m.cyl((-L / 2 - 0.05, y, 0), (L / 2 + 0.05, y, 0), 0.016, 0.016, 8, 'bamboo', bam)
    noo = srgb(rng.choice(['#e8dcc0', '#d8c8a0', '#c8b898']))   # soba au sarrasin : beige gris
    x = -L / 2 + 0.12
    while x < L / 2 - 0.1:
        ln = rng.uniform(0.35, 0.42)
        m.cloth((x, H - 0.04, 0.004), 0.12, ln, 'straw', noo, nx=2, ny=4, wave=0.008, thick=0.01, seed=x * 9)
        x += 0.16
    m.finish(seed=rng.random() * 9, ao_k=0.7)
    return m, dict(light=None, collide=('boite', L, 0.35), bevel=0.0, cat='etal')


@gen('etal_dango', 2, 'etal')
def etal_dango(rng):
    """Banc-étal de l'échoppe de dango : tissu rouge, plateaux de brochettes trois couleurs, théière."""
    m = Mesh(rng.randint(0, 9999))
    L, D, H = 1.4, 0.55, 0.62
    w = pick(rng, WOOD)
    for x in (-L / 2 + 0.08, L / 2 - 0.08):
        for z in (-D / 2 + 0.06, D / 2 - 0.06):
            m.box((x, H / 2, z), (0.06, H, 0.06), 'wood', w)
    m.box((0, H - 0.02, 0), (L, 0.04, D), 'planks', w, tex=1.5)
    cc = srgb('#b8342a')
    m.box((0, H + 0.006, 0), (L * 0.8, 0.012, D + 0.02), 'cloth', cc)
    m.box((0, H - 0.07, D / 2 + 0.012), (L * 0.8, 0.15, 0.006), 'cloth', cc)
    for t in range(2):
        tx = -0.35 + t * 0.6
        m.box((tx, H + 0.025, 0), (0.42, 0.02, 0.26), 'plain', srgb('#2a1e1a'))
        for i in range(6):
            z = -0.1 + i * 0.04
            m.cyl((tx - 0.16, H + 0.05, z), (tx + 0.16, H + 0.05, z), 0.003, 0.003, 4, 'bamboo', srgb('#e0c890'), caps=False)
            for j, col in enumerate(('#f0b0c0', '#f6f0e4', '#9ac080')):
                m.sphere((tx - 0.06 + j * 0.055, H + 0.05, z), 0.022, 0.022, 0.022, 8, 5, 'plain', srgb(col))
    m.lathe([(0.04, H + 0.01), (0.07, H + 0.04), (0.07, H + 0.09), (0.05, H + 0.11), (0.0, H + 0.12)], 14, 'metal', srgb('#3a3430'), c=(0.55, 0, 0.1), cap_bot=True)
    m.finish(seed=rng.random() * 9, ao_k=0.6)
    return m, dict(light=None, collide=('boite', L, D), bevel=0.005, cat='etal')


@gen('etal_serviettes', 2, 'etal')
def etal_serviettes(rng):
    """Boutique de serviettes et de savons : portant de bambou avec serviettes pendues, panier de savons."""
    m = Mesh(rng.randint(0, 9999))
    L = rng.uniform(1.2, 1.5)
    bam = pick(rng, BAMBOO_D)
    H = 1.35
    for x in (-L / 2, L / 2):
        m.cyl((x, 0, 0), (x, H, 0), 0.022, 0.02, 8, 'bamboo', bam)
        m.box((x, 0.03, 0), (0.08, 0.06, 0.4), 'wood', pick(rng, WOOD))
    m.cyl((-L / 2 - 0.04, H - 0.04, 0), (L / 2 + 0.04, H - 0.04, 0), 0.016, 0.016, 8, 'bamboo', bam)
    x = -L / 2 + 0.16
    while x < L / 2 - 0.12:
        col = srgb(rng.choice(['#f4f0e8', '#3a5a8a', '#f4f0e8', '#c84a3a', '#8ab0c8', '#f0e0b0']))
        m.cloth((x, H - 0.03, 0), 0.24, rng.uniform(0.55, 0.7), 'cloth', col, nx=3, ny=5, wave=0.015, thick=0.01, seed=x * 7)
        m.box((x, H - 0.035, 0), (0.25, 0.035, 0.04), 'cloth', col)
        x += 0.28
    m.finish(seed=rng.random() * 9, ao_k=0.7)
    return m, dict(light=None, collide=('boite', L, 0.42), bevel=0.0, cat='etal')


@gen('etal_chapeaux', 2, 'etal')
def etal_chapeaux(rng):
    """Chapellerie : chapeaux de paille coniques (kasa) sur une estrade et sur des patères."""
    m = Mesh(rng.randint(0, 9999))
    L = rng.uniform(1.1, 1.4)
    tops = stand(m, rng, L, 0.5, 0.6, tiers=1)
    h, z, d = tops[0]
    x = -L / 2 + 0.2
    while x < L / 2 - 0.15:
        st = srgb(rng.choice(['#e0c890', '#d8b878', '#c8a868', '#e8d4a0']))
        R = rng.uniform(0.16, 0.22)
        for i in range(rng.randint(1, 3)):
            y = h + i * 0.03
            m.lathe([(R, y), (R * 0.95, y + 0.012), (0.03, y + R * 0.55), (0.0, y + R * 0.6)], 18, 'straw', st, c=(x, 0, z))
        if rng.random() < 0.4:
            m.lathe([(R * 0.98, h + 0.03), (R * 0.98, h + 0.045)], 18, 'cloth', srgb(rng.choice(['#b8342a', '#2a3a5c'])), c=(x, 0, z))
        x += 2 * R + 0.06
    m.finish(seed=rng.random() * 9, ao_k=0.6)
    return m, dict(light=None, collide=('boite', L, 0.5), bevel=0.005, cat='etal')


@gen('planches', 2, 'outil')
def planches(rng):
    """Atelier du charpentier : planches empilées sur cales, chevalet de sciage, rondins."""
    m = Mesh(rng.randint(0, 9999))
    w = srgb(rng.choice(['#f4dcc0', '#ffe8cc', '#e8d0b0']))
    L = rng.uniform(1.6, 2.0)
    for s in (-1, 1):
        m.box((s * (L / 2 - 0.25), 0.05, 0), (0.09, 0.1, 0.5), 'roughwood', srgb('#b0a090'))
    y = 0.1
    for j in range(rng.randint(4, 7)):
        for i in range(2):
            m.box((rng.uniform(-0.04, 0.04), y + 0.015, -0.11 + i * 0.22), (L + rng.uniform(-0.1, 0.05), 0.03, 0.2), 'planks', mul(w, rng.uniform(0.85, 1.05)), tex=2)
        y += 0.032
        if j % 2 == 1:
            m.box((-0.3, y + 0.01, 0), (0.03, 0.02, 0.48), 'roughwood', srgb('#a09080'))
            y += 0.02
    m.finish(seed=rng.random() * 9, ao_k=0.55)
    return m, dict(light=None, collide=('boite', L, 0.5) if y > 0.45 else None, bevel=0.004, cat='outil')


@gen('chevalet', 1, 'outil')
def chevalet(rng):
    """Chevalet de sciage avec un rondin et une scie japonaise posée."""
    m = Mesh(31)
    w = srgb('#d0bca8')
    for s in (-1, 1):
        for t in (-1, 1):
            m.box((s * 0.4, 0.33, t * 0.12), (0.05, 0.75, 0.05), 'roughwood', w, rot=rotX(t * 0.32))
    m.box((0, 0.66, 0), (0.95, 0.07, 0.08), 'roughwood', w)
    m.cyl((-0.7, 0.78, 0.0), (0.5, 0.78, 0.0), 0.11, 0.1, 10, 'bark', srgb('#d8c8b8'), tex=1.2)
    m.box((0.62, 0.7, 0.2), (0.4, 0.004, 0.09), 'metal', srgb('#8a8a88'), rot=rotZ(-0.2))
    m.finish(seed=1.2, ao_k=0.55)
    return m, dict(light=None, collide=('boite', 1.0, 0.4), bevel=0.004, cat='outil')


# ================================================================================================ PARAPLUIES
def wagasa(m, c, R, col, rng, rot, open_=True, ribs=32):
    """Ombrelle de papier huilé (wagasa) : dôme peu bombé à baleines, cercle central contrasté, manche de bambou."""
    cx, cy, cz = c
    H = R * 0.42
    prof = [(R * (1 - j / 10), H * (1 - (1 - j / 10) ** 1.6)) for j in range(11)]
    rad = lambda a, y: 1 + 0.015 * math.cos(a * ribs)  # festons entre les baleines
    m.lathe(prof, ribs, 'paper', col, c=c, rot=rot, radial=rad, tex=2 * R)
    # même dôme vu de dessous (papier double face) avec les baleines
    m.lathe([(r * 0.995, y - 0.008) for r, y in prof][::-1], ribs, 'paper', mul(col, 0.8), c=c, rot=rot, radial=rad, tex=2 * R)
    ring = srgb('#f4ead8') if rng.random() < 0.6 else srgb('#2a2420')
    m.lathe([(R * 0.36, H * (1 - 0.64 ** 1.6) + 0.004), (R * 0.3, H * (1 - 0.7 ** 1.6) + 0.006)], ribs, 'paper', ring, c=c, rot=rot)
    hub = Vector(c) + rot @ Vector((0, H + 0.01, 0))
    tip = Vector(c) + rot @ Vector((0, H - R * 1.25, 0))
    m.cyl(tip, hub, 0.012, 0.01, 6, 'bamboo', srgb('#c8a870'))
    m.sphere(tuple(hub + rot @ Vector((0, 0.015, 0))), 0.022, 0.018, 0.022, 8, 4, 'plain', srgb('#2a2420'))
    for k in range(0, ribs, 4):
        a = 2 * math.pi * k / ribs
        p1 = Vector(c) + rot @ Vector((math.cos(a) * R * 0.55, H * 0.55, math.sin(a) * R * 0.55))
        p0 = Vector(c) + rot @ Vector((0, H - R * 0.5, 0))
        m.cyl(p0, p1, 0.004, 0.004, 3, 'bamboo', srgb('#c8a870'), caps=False)


@gen('kasa_seche', 6, 'etal')
def kasa_seche(rng):
    """Parapluie de papier ouvert qui sèche au soleil, posé incliné sur son bord et le bout du manche."""
    m = Mesh(rng.randint(0, 9999))
    R = rng.uniform(0.42, 0.52)
    col = srgb(rng.choice(['#c8362a', '#2a4a7a', '#d8a030', '#3a6a5a', '#a83a5a', '#e8d8b8', '#5a3a6a']))
    tilt = rng.uniform(1.0, 1.2)
    rot = rotY(rng.uniform(0, 6.28)) @ rotX(tilt)
    # place le bord le plus bas au sol
    low = min((rot @ Vector((math.cos(a) * R, 0, math.sin(a) * R))).y for a in [i * 0.1 for i in range(63)])
    tipy = (rot @ Vector((0, R * 0.42 - R * 1.25, 0))).y
    lift = -min(low, tipy) + 0.005
    wagasa(m, (0, lift, 0), R, col, rng, rot)
    return m, dict(light=None, collide=None, bevel=0.0, cat='etal')


@gen('nodategasa', 2, 'mobilier')
def nodategasa(rng):
    """Grande ombrelle rouge de maison de thé (nodate-gasa), 2,4 m, plantée dans un pied de pierre."""
    m = Mesh(rng.randint(0, 9999))
    R = rng.uniform(1.15, 1.35)
    col = srgb(rng.choice(['#b8342a', '#c83a2a']))
    m.lathe([(0.2, 0), (0.2, 0.18), (0.14, 0.24)], 8, 'stone', srgb('#c8c4b8'), cap_top=True, cap_bot=True, smooth=False)
    wagasa(m, (0, 2.0, 0), R, col, rng, Matrix.Identity(3), ribs=40)
    m.cyl((0, 0.2, 0), (0, 2.0, 0), 0.03, 0.025, 8, 'bamboo', srgb('#c8a870'))
    return m, dict(light=None, collide=('cercle', 0.22), bevel=0.0, cat='mobilier')


@gen('kasa_porte', 2, 'etal')
def kasa_porte(rng):
    """Parapluies fermés dressés dans un tonneau."""
    m = Mesh(rng.randint(0, 9999))
    R = 0.2
    w = pick(rng, WOOD_LIGHT)
    m.lathe([(R * 0.9, 0), (R, 0.45)], 18, 'planks', w, cap_bot=True, radial=staves(18))
    m.lathe([(R * 0.95, 0.45), (R * 0.8, 0.05)], 18, 'planks', mul(w, 0.6), cap_bot=True)
    for t in (0.1, 0.38):
        m.lathe([(R * (0.9 + 0.1 * t / 0.45) + 0.008, t - 0.015), (R * (0.9 + 0.1 * t / 0.45) + 0.008, t + 0.015)], 18, 'straw', srgb('#a08050'))
    for i in range(rng.randint(5, 8)):
        a = i * 2.4
        r = rng.uniform(0.02, 0.12)
        b = Vector((math.cos(a) * r, 0.05, math.sin(a) * r))
        top = b + Vector((math.cos(a) * 0.15, 1.05 + rng.uniform(-0.08, 0.08), math.sin(a) * 0.15))
        col = srgb(rng.choice(['#c8362a', '#2a4a7a', '#d8a030', '#3a6a5a', '#e8d8b8']))
        mid = b + (top - b) * 0.55
        m.cyl(b, top, 0.01, 0.01, 5, 'bamboo', srgb('#c8a870'))
        m.cyl(mid, top - (top - b) * 0.05, 0.05, 0.02, 10, 'paper', col, caps=True)
    m.finish(seed=rng.random() * 9, ao_k=0.6)
    return m, dict(light=None, collide=None, bevel=0.0, cat='etal')


# ================================================================================================ PLANTES
def foliage(m, c, r, rng, col, n=5, flat=0.6):
    """Masse de feuillage : grappes de sphères bosselées (pins taillés, buissons)."""
    for i in range(n):
        a = rng.uniform(0, 6.28)
        rr = r * rng.uniform(0.0, 0.55)
        cc = (c[0] + math.cos(a) * rr, c[1] + rng.uniform(-0.2, 0.2) * r, c[2] + math.sin(a) * rr)
        s = r * rng.uniform(0.5, 0.75)
        m.sphere(cc, s, s * flat, s, 10, 6, 'cloth', mul(col, rng.uniform(0.85, 1.12)), bump=0.28, seed=rng.random() * 20)


@gen('bonsai', 4, 'plante')
def bonsai(rng):
    """Pin taillé en pot (bonsaï de façade) : tronc tordu, plateaux de feuillage, pot émaillé rectangulaire ou rond."""
    m = Mesh(rng.randint(0, 9999))
    s = rng.uniform(0.8, 1.3)
    glaze = srgb(rng.choice(['#3a4a6a', '#6a4a32', '#8a9a80', '#4a3a30', '#a8683a']))
    if rng.random() < 0.5:
        m.box((0, 0.08 * s, 0), (0.5 * s, 0.16 * s, 0.34 * s), 'ceramic', glaze)
        for x in (-1, 1):
            for z in (-1, 1):
                m.box((x * 0.21 * s, 0.015, z * 0.13 * s), (0.05 * s, 0.03, 0.05 * s), 'ceramic', glaze)
    else:
        m.lathe([(0.15 * s, 0), (0.22 * s, 0.14 * s), (0.23 * s, 0.17 * s)], 18, 'ceramic', glaze, cap_bot=True)
    m.box((0, 0.165 * s, 0), (0.44 * s, 0.01, 0.3 * s), 'clay', srgb('#4a3a2a'))
    pts = [(0, 0.16 * s, 0)]
    x, y, z = 0, 0.16 * s, 0
    for i in range(5):
        x += rng.uniform(-0.06, 0.08) * s
        z += rng.uniform(-0.04, 0.04) * s
        y += 0.09 * s
        pts.append((x, y, z))
    m.tube(pts, 0.035 * s, 7, 'bark', srgb('#a89080'), rfn=lambda t: 1.2 - 0.6 * t)
    green = srgb(rng.choice(['#3a5a2a', '#4a6a2a', '#35502a']))
    foliage(m, (x, y + 0.05 * s, z), 0.18 * s, rng, green, n=4, flat=0.45)
    for i in range(rng.randint(2, 3)):
        p = pts[rng.randint(2, 4)]
        a = rng.uniform(0, 6.28)
        tip = (p[0] + math.cos(a) * 0.2 * s, p[1] + 0.02, p[2] + math.sin(a) * 0.12 * s)
        m.tube([p, tip], 0.015 * s, 5, 'bark', srgb('#a89080'))
        foliage(m, tip, 0.13 * s, rng, green, n=3, flat=0.4)
    m.finish(seed=rng.random() * 9, ao_k=0.6)
    return m, dict(light=None, collide=None, bevel=0.0, cat='plante')


@gen('pot_fleurs', 6, 'plante')
def pot_fleurs(rng):
    """Pot de terre ou bac de bois garni : feuillage bosselé et fleurs (hortensias, azalées, chrysanthèmes)."""
    m = Mesh(rng.randint(0, 9999))
    kind = rng.choice(['terre', 'terre', 'bac', 'seau'])
    s = rng.uniform(0.85, 1.3)
    if kind == 'terre':
        prof = [(0.11 * s, 0), (0.16 * s, 0.22 * s), (0.17 * s, 0.24 * s), (0.17 * s, 0.26 * s)]
        m.lathe(prof, 18, 'clay', srgb(rng.choice(['#c87a50', '#b8704a', '#a86a4a'])), cap_bot=True)
        top, R = 0.24 * s, 0.17 * s
    elif kind == 'bac':
        m.box((0, 0.13 * s, 0), (0.6 * s, 0.26 * s, 0.26 * s), 'planks', pick(rng, WOOD), tex=0.8)
        top, R = 0.25 * s, 0.25 * s
    else:
        m.lathe([(0.14 * s, 0), (0.16 * s, 0.28 * s)], 18, 'planks', pick(rng, WOOD_LIGHT), cap_bot=True, radial=staves(18))
        top, R = 0.27 * s, 0.16 * s
    green = srgb(rng.choice(['#4a6a2a', '#3a5a2a', '#5a7a3a']))
    foliage(m, (0, top + R * 0.45, 0), R * 1.2, rng, green, n=5 if kind != 'bac' else 7, flat=0.7)
    flower = rng.choice(['#e87aa0', '#f4f0f0', '#a878c8', '#e85a4a', '#f0c040', '#7a9ae0'])
    for i in range(rng.randint(10, 22)):
        a = rng.uniform(0, 6.28)
        rr = R * rng.uniform(0.2, 1.1)
        ff = srgb(flower) if rng.random() < 0.8 else srgb('#f4f0e8')
        m.sphere((math.cos(a) * rr * (1.6 if kind == 'bac' else 1), top + R * rng.uniform(0.6, 1.1), math.sin(a) * rr * 0.9), 0.03 * s, 0.025 * s, 0.03 * s, 6, 4, 'cloth', ff, bump=0.3, seed=i)
    m.finish(seed=rng.random() * 9, ao_k=0.6)
    return m, dict(light=None, collide=None, bevel=0.0, cat='plante')


@gen('jardiniere', 4, 'plante')
def jardiniere(rng):
    """Jardinière de fenêtre (bac étroit de 0,9 à 1,4 m) débordante de fleurs, à poser sur un rebord ou une console."""
    m = Mesh(rng.randint(0, 9999))
    L = rng.uniform(0.9, 1.4)
    w = pick(rng, WOOD)
    m.box((0, 0.09, 0), (L, 0.18, 0.2), 'planks', w, tex=1.4)
    for s in (-1, 1):
        m.box((s * (L / 2 - 0.08), -0.08, 0.0), (0.04, 0.16, 0.18), 'wood', mul(w, 0.8))
    green = srgb(rng.choice(['#4a6a2a', '#3a5a2a', '#5a7a3a']))
    for i in range(int(L / 0.18)):
        foliage(m, (-L / 2 + 0.1 + i * 0.18, 0.22, 0), 0.12, rng, green, n=2, flat=0.7)
    flower = rng.choice(['#e85a4a', '#e87aa0', '#f4f0f0', '#a878c8', '#f0a040'])
    for i in range(int(L * 30)):
        x = rng.uniform(-L / 2 + 0.04, L / 2 - 0.04)
        ff = srgb(flower) if rng.random() < 0.85 else srgb('#f4f0e8')
        m.sphere((x, rng.uniform(0.2, 0.32), rng.uniform(-0.1, 0.14)), 0.025, 0.02, 0.025, 6, 4, 'cloth', ff, seed=i)
    # retombées sur l'avant
    for i in range(int(L / 0.2)):
        x = -L / 2 + 0.1 + i * 0.2 + rng.uniform(-0.04, 0.04)
        m.tube([(x, 0.18, 0.1), (x + 0.02, 0.1, 0.13), (x, -0.02, 0.12)], 0.025, 5, 'cloth', mul(green, 0.9))
    m.finish(seed=rng.random() * 9, ao_k=0.75)
    return m, dict(light=None, collide=None, bevel=0.0, cat='plante')


@gen('potager_rang', 3, 'plante')
def potager_rang(rng):
    """Rang de potager (3 m) : butte de terre, choux, poireaux ou tuteurs de bambou avec plants."""
    m = Mesh(rng.randint(0, 9999))
    L = 3.0
    soil = srgb(rng.choice(['#7a5a40', '#6a4a34', '#8a6a4a']))
    m.lathe([(0.32, 0), (0.28, 0.1), (0.15, 0.16), (0.0, 0.17)], 10, 'clay', soil, rot=rotZ(math.pi / 2), c=(-L / 2, 0, 0), radial=None)
    for vi in range(len(m.co)):
        pass
    # étire la butte le long de x (le profil tourné donne un ellipsoïde) : on refait une butte en boîte arrondie
    m.co.clear(); m.faces.clear(); m.uv.clear(); m.col.clear()
    m.box((0, 0.06, 0), (L, 0.12, 0.55), 'clay', soil, tex=1.5, jitter=0.01)
    m.box((0, 0.14, 0), (L - 0.1, 0.05, 0.4), 'clay', mul(soil, 0.9), tex=1.5, jitter=0.01)
    kind = rng.choice(['chou', 'poireau', 'tuteur'])
    n = int(L / 0.35)
    for i in range(n):
        x = -L / 2 + 0.2 + i * (L - 0.4) / (n - 1)
        if kind == 'chou':
            m.sphere((x, 0.24, rng.uniform(-0.05, 0.05)), 0.13, 0.1, 0.13, 10, 6, 'cloth', srgb(rng.choice(['#7a9a48', '#8aa858', '#6a8a40'])), bump=0.2, seed=i)
        elif kind == 'poireau':
            for k in range(2):
                z = -0.1 + k * 0.2
                for j in range(4):
                    a = j * 1.6 + i
                    m.tube([(x, 0.16, z), (x + math.cos(a) * 0.05, 0.38, z + math.sin(a) * 0.05), (x + math.cos(a) * 0.12, 0.5, z + math.sin(a) * 0.12)], 0.012, 4, 'cloth', srgb('#5a8a3a'))
        else:
            m.cyl((x, 0.1, 0), (x + 0.02, 1.2, 0.01), 0.008, 0.008, 4, 'bamboo', srgb('#c8b080'), caps=False)
            foliage(m, (x, 0.4, 0), 0.12, rng, srgb('#4a7a2a'), n=2, flat=1.2)
            foliage(m, (x, 0.75, 0), 0.09, rng, srgb('#4a7a2a'), n=2, flat=1.2)
            if rng.random() < 0.6:
                m.sphere((x + 0.06, 0.55, 0.05), 0.03, 0.03, 0.03, 6, 4, 'plain', srgb('#c83a2a'))
    if kind == 'tuteur':
        m.cyl((-L / 2, 1.15, 0), (L / 2, 1.15, 0), 0.008, 0.008, 4, 'bamboo', srgb('#c8b080'))
    m.finish(seed=rng.random() * 9, ao_k=0.6)
    return m, dict(light=None, collide=None, bevel=0.0, cat='plante')


# ================================================================================================ CLÔTURES
@gen('inuyarai', 3, 'cloture')
def inuyarai(rng):
    """Barrière courbe de bambou au pied des murs (inu-yarai), 1,8 m de long : arcs de bambou et liens."""
    m = Mesh(rng.randint(0, 9999))
    L = 1.8
    bam = pick(rng, BAMBOO_D if rng.random() < 0.7 else BAMBOO_G)
    H = rng.uniform(0.75, 0.9)
    D = rng.uniform(0.35, 0.45)
    n = 14
    for i in range(n):
        x = -L / 2 + L * (i + 0.5) / n
        pts = []
        for k in range(7):
            t = k / 6
            # du sol (devant) vers le mur (arrière, en haut) : quart d'arc
            a = t * math.pi / 2
            pts.append((x, H * math.sin(a), D * (1 - math.cos(a)) - D))
        pts = [(p[0], p[1], -p[2] - D) for p in pts]
        m.tube(pts, 0.014, 5, 'bamboo', mul(bam, rng.uniform(0.85, 1.1)), tex=1)
    for t in (0.35, 0.7):
        a = t * math.pi / 2
        y = H * math.sin(a)
        zz = -(D * (1 - math.cos(a)) - D) - D
        m.cyl((-L / 2, y, zz + 0.016), (L / 2, y, zz + 0.016), 0.012, 0.012, 5, 'bamboo', mul(bam, 0.9))
    m.finish(seed=rng.random() * 9, ao_k=0.6, grime_amt=0.12, moss_wood=0.1)
    return m, dict(light=None, collide=None, bevel=0.0, cat='cloture', length=L)


@gen('kenninji', 3, 'cloture')
def kenninji(rng):
    """Panneau de clôture kenninji (1,8 m) : bambous fendus verticaux jointifs, liteaux horizontaux, poteaux."""
    m = Mesh(rng.randint(0, 9999))
    L = 1.82
    H = rng.uniform(1.5, 1.8)
    bam = pick(rng, BAMBOO_D)
    post = pick(rng, WOOD)
    for x in (-L / 2, L / 2):
        m.cyl((x, 0, 0), (x, H + 0.05, 0), 0.045, 0.04, 8, 'roughwood', post, tex=1.5)
    n = int(L / 0.045)
    for i in range(n):
        x = -L / 2 + 0.05 + (L - 0.1) * i / (n - 1)
        hh = H - 0.05 + rng.uniform(-0.01, 0.01)
        m.box((x, hh / 2 + 0.05, 0), (0.042, hh, 0.012), 'bamboo', mul(bam, rng.uniform(0.82, 1.12)), tex=2)
    for y in (0.35, H * 0.55, H - 0.12):
        for s in (-1, 1):
            m.cyl((-L / 2, y, s * 0.018), (L / 2, y, s * 0.018), 0.016, 0.016, 6, 'bamboo', mul(bam, 0.85))
    m.box((0, H + 0.06, 0), (L + 0.06, 0.06, 0.09), 'bamboo', mul(bam, 0.8))
    m.finish(seed=rng.random() * 9, ao_k=0.5, grime_amt=0.15, moss_wood=0.15, wet=0.3)
    return m, dict(light=None, collide=None, bevel=0.0, cat='cloture', length=L)


@gen('yotsume', 3, 'cloture')
def yotsume(rng):
    """Clôture yotsume-gaki (1,8 m, ajourée) : grille de bambous liés de cordelettes noires."""
    m = Mesh(rng.randint(0, 9999))
    L = 1.82
    H = rng.uniform(0.9, 1.15)
    bam = pick(rng, BAMBOO_D)
    for x in (-L / 2, L / 2):
        m.cyl((x, 0, 0), (x, H + 0.04, 0), 0.04, 0.038, 8, 'roughwood', pick(rng, WOOD), tex=1)
    for i in range(1, 6):
        x = -L / 2 + L * i / 6
        m.cyl((x, 0, 0.03), (x, H - 0.02, 0.03), 0.014, 0.013, 6, 'bamboo', mul(bam, rng.uniform(0.85, 1.1)))
    for y in (0.25, 0.55, H - 0.12):
        m.cyl((-L / 2, y, -0.0), (L / 2, y, 0.0), 0.016, 0.016, 6, 'bamboo', bam)
        for i in range(1, 6):
            x = -L / 2 + L * i / 6
            m.box((x, y, 0.015), (0.04, 0.03, 0.03), 'cloth', srgb('#1e1a18'), rot=rotZ(0.78))
    m.finish(seed=rng.random() * 9, ao_k=0.55, moss_wood=0.12)
    return m, dict(light=None, collide=None, bevel=0.0, cat='cloture', length=L)


# ================================================================================================ OUTILS, DIVERS
@gen('hoki', 2, 'outil')
def hoki(rng):
    """Balai de bambou (hōki) adossé : manche, botte de ramilles liée."""
    m = Mesh(rng.randint(0, 9999))
    lean = rng.uniform(0.2, 0.28)
    rot = rotX(-lean)
    base = Vector((0, 0, 0))
    top = base + rot @ Vector((0, 1.5, 0))
    m.cyl(base + rot @ Vector((0, 0.35, 0)), top, 0.016, 0.015, 6, 'bamboo', srgb('#d8c08a'))
    m.lathe([(0.17, 0.0), (0.12, 0.18), (0.035, 0.38), (0.02, 0.42)], 12, 'straw', srgb(rng.choice(['#a08a5a', '#8a7a4a'])), rot=rot @ Matrix.Diagonal((1, 1, 0.35)), radial=lambda a, y: 1 + 0.1 * math.sin(a * 9 + y * 30))
    m.lathe([(0.04, 0.34), (0.04, 0.38)], 10, 'straw', srgb('#5a4030'), rot=rot)
    m.finish(seed=rng.random() * 9, ao_k=0.7)
    return m, dict(light=None, collide=None, bevel=0.0, cat='outil')


@gen('joro', 2, 'outil')
def joro(rng):
    """Arrosoir (jōro) de cuivre ou de fer-blanc, pour mouiller le dallage le matin."""
    m = Mesh(rng.randint(0, 9999))
    col = srgb(rng.choice(['#a8683a', '#8a8a80', '#6a7a6a']))
    m.lathe([(0.12, 0), (0.13, 0.02), (0.13, 0.24), (0.1, 0.27)], 18, 'metal', col, cap_bot=True, cap_top=True)
    m.tube([(0.1, 0.05, 0), (0.22, 0.18, 0), (0.32, 0.3, 0)], 0.018, 6, 'metal', col, rfn=lambda t: 1 - 0.3 * t)
    m.lathe([(0.04, 0), (0.025, 0.04)], 10, 'metal', col, c=(0.33, 0.29, 0), rot=rotZ(-0.8), cap_top=True)
    m.tube([(-0.08, 0.27, 0), (-0.03, 0.4, 0), (0.06, 0.4, 0), (0.1, 0.27, 0)], 0.012, 6, 'metal', col)
    m.finish(seed=rng.random() * 9, ao_k=0.7)
    return m, dict(light=None, collide=None, bevel=0.0, cat='outil')


@gen('geta', 2, 'outil')
def geta(rng):
    """Rangée de sandales de bois (geta) sur une marche de pierre, devant les bains et les ryokans."""
    m = Mesh(rng.randint(0, 9999))
    L = rng.uniform(0.9, 1.3)
    m.box((0, 0.06, 0), (L, 0.12, 0.42), 'stone', pick(rng, STONE), jitter=0.008, tex=1.2)
    x = -L / 2 + 0.12
    while x < L / 2 - 0.08:
        for s in (-1, 1):
            xx = x + s * 0.055
            w = srgb(rng.choice(['#e8d0b0', '#d8b890', '#c8a880']))
            m.box((xx, 0.155, 0), (0.09, 0.022, 0.22), 'planks', w)
            for zz in (-0.06, 0.06):
                m.box((xx, 0.132, zz), (0.08, 0.025, 0.02), 'planks', mul(w, 0.8))
            m.tube([(xx - 0.03, 0.166, 0.03), (xx, 0.19, 0.08), (xx + 0.03, 0.166, 0.03)], 0.006, 4, 'cloth', srgb(rng.choice(['#b8342a', '#2a3a5c', '#1e1a18'])), caps=False)
        x += 0.24
    m.finish(seed=rng.random() * 9, ao_k=0.6, moss_amount=0.4)
    return m, dict(light=None, collide=None, bevel=0.004, cat='outil')


@gen('jizo', 3, 'statue')
def jizo(rng):
    """Petite statue de jizō au bavoir rouge, couverte de mousse, sur un socle (bords de chemins, portes)."""
    m = Mesh(rng.randint(0, 9999))
    st = pick(rng, STONE)
    s = rng.uniform(0.85, 1.15)
    m.box((0, 0.07 * s, 0), (0.36 * s, 0.14 * s, 0.32 * s), 'stone', st, jitter=0.01)
    m.lathe([(0.11 * s, 0.14 * s), (0.13 * s, 0.2 * s), (0.12 * s, 0.38 * s), (0.08 * s, 0.46 * s)], 12, 'stone', st, tex=0.5)
    m.sphere((0, 0.53 * s, 0), 0.085 * s, 0.095 * s, 0.085 * s, 12, 8, 'stone', st, bump=0.05)
    # bavoir rouge (yodarekake) et bonnet
    m.lathe([(0.12 * s, 0.33 * s), (0.135 * s, 0.4 * s), (0.09 * s, 0.45 * s)], 12, 'cloth', srgb('#c42a20'), radial=lambda a, y: 1 + (0.25 if math.sin(a) > 0.3 else 0) * (0.4 - y) * 4)
    if rng.random() < 0.6:
        m.lathe([(0.09 * s, 0.56 * s), (0.08 * s, 0.6 * s), (0.04 * s, 0.65 * s), (0.0, 0.66 * s)], 12, 'cloth', srgb('#c42a20'))
    m.finish(moss_amount=rng.uniform(0.6, 1.0), seed=rng.random() * 9, ao_k=0.5, wet=0.3)
    return m, dict(light=None, collide=None, bevel=0.0, cat='statue')


@gen('hokora', 2, 'statue')
def hokora(rng):
    """Petit autel de bois (hokora) sur un socle de pierre moussu, offrandes, petits papiers en zigzag."""
    m = Mesh(rng.randint(0, 9999))
    st = pick(rng, STONE)
    w = pick(rng, WOOD)
    m.box((0, 0.18, 0), (0.62, 0.36, 0.52), 'stone', st, jitter=0.015, tex=0.8)
    m.box((0, 0.42, 0), (0.5, 0.08, 0.42), 'stone', st, jitter=0.006)
    m.box((0, 0.62, 0), (0.36, 0.32, 0.3), 'wood', w)
    m.box((0, 0.62, 0.151), (0.2, 0.24, 0.004), 'plain', srgb('#2a2018'))
    for s in (-1, 1):
        m.box((0, 0.86, s * 0.14), (0.52, 0.03, 0.34), 'kawara' if rng.random() < 0.5 else 'roughwood', srgb('#9a9a98'), rot=rotX(s * 0.55))
    m.box((0, 0.93, 0), (0.56, 0.04, 0.05), 'wood', mul(w, 0.8))
    for i in range(3):
        m.box((-0.1 + i * 0.1, 0.5, 0.2), (0.025, 0.09, 0.004), 'paper', srgb('#fffaf0'), rot=rotZ((i - 1) * 0.15))
    m.lathe([(0.03, 0.46), (0.04, 0.52), (0.02, 0.55)], 10, 'ceramic', srgb('#f0ece0'), c=(0.16, 0, 0.12), cap_bot=True)
    m.sphere((-0.16, 0.48, 0.13), 0.03, 0.028, 0.03, 7, 5, 'plain', srgb('#e8b820'))
    m.finish(moss_amount=rng.uniform(0.7, 1.0), moss_wood=0.3, seed=rng.random() * 9, ao_k=0.5, wet=0.35)
    return m, dict(light=None, collide=('cercle', 0.4), bevel=0.006, cat='statue')


@gen('borne_pierre', 3, 'statue')
def borne_pierre(rng):
    """Borne de pierre gravée (dōhyō) aux portes et carrefours : stèle mal équarrie, moussue."""
    m = Mesh(rng.randint(0, 9999))
    st = pick(rng, STONE)
    H = rng.uniform(0.8, 1.25)
    m.box((0, 0.06, 0), (0.5, 0.12, 0.4), 'stone', st, jitter=0.015)
    m.box((0, H / 2 + 0.1, 0), (0.24, H, 0.2), 'stone', st, jitter=0.012, tex=1.2)
    m.lathe([(0.17, H + 0.1), (0.0, H + 0.2)], 4, 'stone', st, phase=math.pi / 4, smooth=False, radial=lambda a, y: 1)
    # inscription (sillons sombres)
    for i in range(4):
        m.box((0, H * 0.85 - i * 0.12, 0.101), (0.06, 0.07, 0.004), 'stone', mul(st, 0.45))
    m.finish(moss_amount=rng.uniform(0.5, 0.9), seed=rng.random() * 9, ao_k=0.5, wet=0.3)
    return m, dict(light=None, collide=('cercle', 0.22), bevel=0.006, cat='statue')


@gen('pierres_jardin', 3, 'statue')
def pierres_jardin(rng):
    """Groupe de pierres de jardin moussues (3 à 5), avec tapis de mousse."""
    m = Mesh(rng.randint(0, 9999))
    for i in range(rng.randint(3, 5)):
        a = rng.uniform(0, 6.28)
        r = rng.uniform(0, 0.5)
        s = rng.uniform(0.15, 0.4)
        m.sphere((math.cos(a) * r, s * 0.35, math.sin(a) * r), s * 1.2, s * 0.8, s, 10, 7, 'mossrock', srgb('#d8d4cc'), bump=0.25, seed=rng.random() * 20)
    m.lathe([(0.9, 0.0), (0.6, 0.03), (0.0, 0.05)], 14, 'cloth', srgb('#4a6a2a'), radial=lambda a, y: 1 + 0.2 * math.sin(a * 5))
    m.finish(moss_amount=0.9, seed=rng.random() * 9, ao_k=0.5, moss_tiles=('mossrock',))
    return m, dict(light=None, collide=None, bevel=0.0, cat='statue')


@gen('panneau_grignoteurs', 1, 'mobilier')
def panneau_grignoteurs(rng):
    """Petit panneau de bois planté (sert aux avertissements et aux plaques de nom)."""
    m = Mesh(9)
    w = srgb('#d0bca8')
    m.box((0, 0.6, 0), (0.08, 1.2, 0.08), 'roughwood', w)
    m.box((0, 1.05, 0.05), (0.7, 0.32, 0.03), 'planks', srgb('#e8d8c0'), rot=rotZ(0.04))
    m.finish(seed=2.2, ao_k=0.55, moss_wood=0.2)
    return m, dict(light=None, collide=('cercle', 0.12), bevel=0.004, cat='mobilier')
