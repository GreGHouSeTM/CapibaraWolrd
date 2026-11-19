"""Pièces d'architecture HD (bible §7.1) : soubassement de pierres sèches, poteaux à tenons, enduit, shōji, kōshi,
engawa en planches disjointes, avant-toits (chevrons, voliges, rive) et couverture en kawara modélisées une à une.

Les fonctions travaillent dans un repère de mur `Mw` (matrice 4x4) : x le long du mur, y en haut, z vers l'extérieur.
`lod` : 0 = détail complet ; 1 = mêmes volumes, sans chanfreins ni petites pièces (environ un quart des triangles).
"""
import math
from mathutils import Vector, Matrix
from .geo import (V, T, RY, RX, RZ, basis, cbox, beam, prism, tube, cyl, smoothstep, stone_jitter,
                  FLAG_EDGE, FLAG_NOMOSS, FLAG_NOWEATHER, FLAG_ROOF)
from .materials import T as TINT


def _j(g, c, amt=0.07):
    f = 1 + g.rng.uniform(-amt, amt)
    return tuple(min(1.0, x * f) for x in c)


def C(lod, c):
    """Chanfrein selon la LOD."""
    return c if lod == 0 else 0.0


# ------------------------------------------------------------------------------------------------ soubassement
def stone_base(g, Mw, x0, x1, y0, y1, z0, z1, lod=0, tint=None):
    """Mur de pierres sèches irrégulières (assises de hauteurs variables), face extérieure à z1."""
    tint = tint or TINT['pierre']
    rng = g.rng
    if lod:
        cbox(g, 'hd_pierre', Mw @ T((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), x1 - x0, y1 - y0, z1 - z0, c=0,
             tint=tint, div=0.5, skip=((1, -1),))
        return
    y = y0
    courses = []
    while y < y1 - 0.05:
        h = rng.uniform(0.2, 0.34)
        if y1 - (y + h) < 0.14:
            h = y1 - y
        courses.append((y, h))
        y += h
    for ci, (yc, h) in enumerate(courses):
        x = x0 - (rng.uniform(0, 0.25) if ci % 2 else 0)
        while x < x1 - 0.02:
            L = rng.uniform(0.32, 0.62)
            xa, xb = max(x, x0), min(x + L, x1)
            if xb - xa > 0.06:
                out = rng.uniform(-0.015, 0.025)
                M = Mw @ T((xa + xb) / 2, yc + h / 2, (z0 + z1) / 2 + out / 2) @ RZ(rng.uniform(-0.03, 0.03)) @ RY(rng.uniform(-0.02, 0.02))
                cbox(g, 'hd_pierre', M, xb - xa - 0.012, h - 0.012, z1 - z0 + out, c=0.04, grain=0, div=0.11,
                     tint=_j(g, tint, 0.14), skip=((2, -1), (1, -1)) if ci == 0 else ((2, -1),),
                     jitter=stone_jitter(0.035, 7.0, rng.randrange(999)))
            x += L
    # mortier sombre (joints) derrière les pierres
    cbox(g, 'hd_pierre', Mw @ T((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2 - 0.02), x1 - x0, y1 - y0, z1 - z0 - 0.04, c=0,
         tint=(0.25, 0.24, 0.22), skip=((1, -1), (2, -1)), flag=FLAG_NOMOSS)


# ------------------------------------------------------------------------------------------------ ossature
def post(g, Mw, x, y0, y1, s=0.15, z=0.0, lod=0, tint=None):
    tint = tint or TINT['bois_sombre']
    cbox(g, 'hd_bois', Mw @ T(x, (y0 + y1) / 2, z), s, y1 - y0, s, c=C(lod, 0.014), grain=1, div=0.35 if lod == 0 else None,
         tint=_j(g, tint), skip=((1, -1),))
    if lod == 0:
        # pied de poteau : petite pierre de fondation (soseki) visible sous le seuil
        pass


def hbeam(g, Mw, x0, x1, y, h, w, z=0.0, lod=0, tint=None, tenon=0.0, skip=()):
    """Poutre horizontale le long du mur ; `tenon` > 0 : about traversant visible aux deux bouts, avec clavette."""
    tint = tint or TINT['bois_sombre']
    cbox(g, 'hd_bois', Mw @ T((x0 + x1) / 2, y, z), x1 - x0, h, w, c=C(lod, 0.01), grain=0, div=0.5 if lod == 0 else None,
         tint=_j(g, tint), skip=skip)
    if tenon and lod == 0:
        for sx in (-1, 1):
            xe = (x1 if sx > 0 else x0) + sx * tenon / 2
            cbox(g, 'hd_bois', Mw @ T(xe, y, z), tenon, h * 0.62, w * 0.62, c=0.006, grain=0, tint=_j(g, tint))
            # clavette (kusabi) traversant l'about
            cbox(g, 'hd_bois', Mw @ T(xe, y, z), 0.025, h * 1.05, w * 0.3, c=0.003, grain=1, tint=_j(g, TINT['bois_moyen']))


def nails(g, Mw, pts, r=0.009, lod=0):
    """Têtes de clous forgés (petites pyramides tronquées) en saillie de la face z."""
    if lod:
        return
    for (x, y, z) in pts:
        cbox(g, 'hd_metal', Mw @ T(x, y, z + 0.003), r * 2, r * 2, 0.008, c=0.003, tint=(1, 1, 1), flag=FLAG_NOWEATHER)


def plaster(g, Mw, x0, x1, y0, y1, z, t=0.06, lod=0, tint=None):
    """Panneau d'enduit entre poteaux (subdivisé pour l'occlusion cuite par sommet)."""
    tint = tint or TINT['enduit']
    cbox(g, 'hd_enduit', Mw @ T((x0 + x1) / 2, (y0 + y1) / 2, z - t / 2), x1 - x0, y1 - y0, t, c=C(lod, 0.006), grain=1,
         div=0.14 if lod == 0 else 0.6, tint=_j(g, tint, 0.03), skip=((2, -1),))


def boards(g, Mw, x0, x1, y0, y1, z, lod=0, tint=None, w=0.2, batten=True):
    """Bardage vertical (shitami / itabari) : planches disjointes et couvre-joints cloués."""
    tint = tint or TINT['planche_sombre']
    if lod:
        cbox(g, 'hd_planches', Mw @ T((x0 + x1) / 2, (y0 + y1) / 2, z - 0.02), x1 - x0, y1 - y0, 0.04, c=0, grain=1, tint=tint,
             skip=((2, -1),))
        return
    n = max(1, round((x1 - x0) / w))
    pw = (x1 - x0) / n
    for i in range(n):
        xa = x0 + i * pw
        cbox(g, 'hd_planches', Mw @ T(xa + pw / 2, (y0 + y1) / 2, z - 0.015 + g.rng.uniform(-0.003, 0.003)), pw - 0.006, y1 - y0, 0.025,
             c=0.004, grain=1, div=0.4, tint=_j(g, tint, 0.12), skip=((2, -1),))
        if batten and i:
            cbox(g, 'hd_planches', Mw @ T(xa, (y0 + y1) / 2, z + 0.008), 0.035, y1 - y0, 0.018, c=0.004, grain=1, tint=_j(g, tint, 0.1))
            nails(g, Mw, [(xa, y0 + 0.12, z + 0.017), (xa, (y0 + y1) / 2, z + 0.017), (xa, y1 - 0.12, z + 0.017)])
    # traverse basse
    cbox(g, 'hd_bois', Mw @ T((x0 + x1) / 2, y0 + 0.04, z + 0.02), x1 - x0, 0.08, 0.03, c=0.005, grain=0, tint=_j(g, TINT['bois_sombre']))


# ------------------------------------------------------------------------------------------------ menuiseries
def shoji(g, Mw, x0, x1, y0, y1, z, panels=2, cols=3, rows=5, koshiita=0.32, lod=0, light=False):
    """Shōji coulissants (deux rails) : cadre, kumiko en relief, papier (émissif la nuit), panneau bas en bois."""
    W = (x1 - x0) / panels
    ov = 0.02
    fw, fd = 0.035, 0.03
    wood = TINT['bois_clair']
    for p in range(panels):
        xa = x0 + p * W - (ov if p else 0)
        xb = x0 + (p + 1) * W + (ov if p < panels - 1 else 0)
        zz = z - (0.035 if p % 2 else 0.0)
        cx = (xa + xb) / 2
        pw = xb - xa
        # cadre
        cbox(g, 'hd_bois', Mw @ T(xa + fw / 2, (y0 + y1) / 2, zz - fd / 2), fw, y1 - y0, fd, c=C(lod, 0.004), grain=1, tint=_j(g, wood, 0.05))
        cbox(g, 'hd_bois', Mw @ T(xb - fw / 2, (y0 + y1) / 2, zz - fd / 2), fw, y1 - y0, fd, c=C(lod, 0.004), grain=1, tint=_j(g, wood, 0.05))
        for yy, hh in ((y0 + 0.025, 0.05), (y1 - 0.02, 0.04), (y0 + koshiita, 0.03)):
            cbox(g, 'hd_bois', Mw @ T(cx, yy, zz - fd / 2), pw - 2 * fw, hh, fd, c=C(lod, 0.004), grain=0, tint=_j(g, wood, 0.05))
        # panneau bas (koshiita)
        if koshiita > 0.06:
            cbox(g, 'hd_planches', Mw @ T(cx, y0 + (0.05 + koshiita) / 2, zz - fd / 2 - 0.004), pw - 2 * fw, koshiita - 0.065, 0.012,
                 c=0, grain=0, tint=_j(g, TINT['planche'], 0.08))
        # kumiko + papier
        ya, yb = y0 + koshiita + 0.015, y1 - 0.04
        xi0, xi1 = xa + fw, xb - fw
        g.face('hd_papier', [V((xi0, ya, zz - fd + 0.006)), V((xi1, ya, zz - fd + 0.006)), V((xi1, yb, zz - fd + 0.006)), V((xi0, yb, zz - fd + 0.006))],
               [(0, 0), ((xi1 - xi0) / 0.9, 0), ((xi1 - xi0) / 0.9, (yb - ya) / 0.9), (0, (yb - ya) / 0.9)], (1, 1, 1), FLAG_NOWEATHER, False, Mw)
        if lod == 0 or True:
            kd = 0.018 if lod == 0 else 0.0
            if kd:
                for i in range(1, cols):
                    xk = xi0 + (xi1 - xi0) * i / cols
                    cbox(g, 'hd_bois', Mw @ T(xk, (ya + yb) / 2, zz - fd + 0.006 + kd / 2), 0.012, yb - ya, kd, c=0, grain=1, tint=_j(g, wood, 0.05),
                         skip=((2, -1),))
                for j in range(1, rows):
                    yk = ya + (yb - ya) * j / rows
                    cbox(g, 'hd_bois', Mw @ T((xi0 + xi1) / 2, yk, zz - fd + 0.006 + kd / 2), xi1 - xi0, 0.012, kd, c=0, grain=0,
                         tint=_j(g, wood, 0.05), skip=((2, -1),))
    # rails haut et bas (shikii / kamoi)
    cbox(g, 'hd_bois', Mw @ T((x0 + x1) / 2, y0 - 0.02, z - 0.05), x1 - x0, 0.04, 0.12, c=C(lod, 0.006), grain=0, tint=_j(g, TINT['bois_moyen']))
    cbox(g, 'hd_bois', Mw @ T((x0 + x1) / 2, y1 + 0.03, z - 0.05), x1 - x0, 0.06, 0.12, c=C(lod, 0.006), grain=0, tint=_j(g, TINT['bois_sombre']))


def koshi(g, Mw, x0, x1, y0, y1, z, lod=0, pitch=0.055, tint=None, behind='papier'):
    """Grille kōshi (lattes verticales serrées, alternance longues / courtes en haut), papier ou nuit derrière."""
    tint = tint or TINT['bois_sombre']
    n = max(2, round((x1 - x0) / pitch))
    pit = (x1 - x0) / n
    for i in range(n + 1):
        xs = x0 + i * pit
        top = y1 if (i % 3 == 0 or lod) else y1 - 0.0
        cbox(g, 'hd_bois', Mw @ T(xs, (y0 + top) / 2, z - 0.02), 0.026, top - y0, 0.04, c=C(lod, 0.004), grain=1, tint=_j(g, tint, 0.05),
             skip=((2, -1), (1, -1), (1, 1)) if lod == 0 else ((2, -1),))
    for yy in (y0 + 0.03, y1 - 0.03, y0 + (y1 - y0) * 0.62):
        cbox(g, 'hd_bois', Mw @ T((x0 + x1) / 2, yy, z - 0.045), x1 - x0, 0.04, 0.03, c=C(lod, 0.004), grain=0, tint=_j(g, tint, 0.05))
    # fond : papier (lumineux la nuit) ou pièce sombre
    zb = z - 0.09
    mat = 'hd_papier' if behind == 'papier' else 'hd_interieur'
    g.face(mat, [V((x0, y0, zb)), V((x1, y0, zb)), V((x1, y1, zb)), V((x0, y1, zb))],
           [(0, 0), ((x1 - x0) / 0.9, 0), ((x1 - x0) / 0.9, (y1 - y0) / 0.9), (0, (y1 - y0) / 0.9)], (1, 1, 1), FLAG_NOWEATHER, False, Mw)


def opening(g, Mw, x0, x1, y0, y1, z, depth=1.2):
    """Ouverture (entrée) : intérieur sombre en retrait, avec un sol de bois."""
    zb = z - depth
    g.face('hd_interieur', [V((x0, y0, zb)), V((x1, y0, zb)), V((x1, y1, zb)), V((x0, y1, zb))], [(0, 0)] * 4, (1, 1, 1), FLAG_NOWEATHER, False, Mw)
    for xs, sg in ((x0, 1), (x1, -1)):
        g.face('hd_interieur', [V((xs, y0, z)), V((xs, y0, zb)), V((xs, y1, zb)), V((xs, y1, z))][::sg], [(0, 0)] * 4, (1, 1, 1), FLAG_NOWEATHER, False, Mw)
    g.face('hd_interieur', [V((x0, y1, z)), V((x1, y1, z)), V((x1, y1, zb)), V((x0, y1, zb))], [(0, 0)] * 4, (1, 1, 1), FLAG_NOWEATHER, False, Mw)
    g.face('hd_bois_gris', [V((x0, y0, zb)), V((x1, y0, zb)), V((x1, y0, z)), V((x0, y0, z))],
           [(x0, zb), (x1, zb), (x1, z), (x0, z)], (0.35, 0.3, 0.26), FLAG_NOMOSS, False, Mw)


def noren(g, Mw, x0, x1, y_top, h, z, strips=3, lod=0, tint=None, seed=0):
    """Noren de coton : bandes fendues, plis ondulés en géométrie, bas légèrement effiloché, hampe de bambou."""
    tint = tint or TINT['indigo']
    W = (x1 - x0) / strips
    nu, nv = (10, 8) if lod == 0 else (3, 2)
    for s in range(strips):
        xa, xb = x0 + s * W + 0.012, x0 + (s + 1) * W - 0.012
        rows, uvr = [], []
        for i in range(nv + 1):
            t = i / nv
            y = y_top - t * h
            row, ur = [], []
            for j in range(nu + 1):
                u = j / nu
                x = xa + (xb - xa) * u
                fold = 0.022 * math.sin(u * math.pi * 4 + s * 1.3) * (0.4 + 0.6 * t) + 0.03 * t * t * math.sin(s * 2.1 + 0.7)
                yy = y - (0.012 * math.sin(u * 17 + s) * t if i == nv else 0)
                row.append(V((x, yy, z + fold)))
                ur.append(((x - x0) / 0.27, (y_top - yy) / 0.27))
            rows.append(row)
            uvr.append(ur)
        g.grid('hd_tissu', rows, uvr, _j(g, tint, 0.05), FLAG_NOMOSS, True, Mw)
        # envers (recto-verso)
        g.grid('hd_tissu', rows, uvr, _j(g, tint, 0.05), FLAG_NOMOSS, True, Mw, flip=True)
        if lod == 0:
            # motif blanc (cercle du blason, 湯 stylisé) sur la bande centrale
            if s == strips // 2:
                cx, cy = (xa + xb) / 2, y_top - h * 0.42
                pts = [V((cx + 0.11 * math.cos(a), cy + 0.11 * math.sin(a), z + 0.0 + 0.022 * math.sin(((cx + 0.11 * math.cos(a)) - xa) / (xb - xa) * math.pi * 4 + s * 1.3) * (0.4 + 0.6 * 0.42) + 0.003))
                       for a in [k * math.pi / 8 for k in range(16)]]
                g.face('hd_tissu', pts, [(p.x / 0.27, p.y / 0.27) for p in pts], TINT['blanc'], FLAG_NOMOSS, False, Mw)
    # hampe de bambou
    tube(g, 'hd_bois', [V((x0 - 0.12, y_top + 0.03, z)), V((x1 + 0.12, y_top + 0.03, z))], 0.018, seg=6 if lod == 0 else 4, tint=(0.75, 0.62, 0.38),
         flag=FLAG_NOMOSS, M=Mw)


def engawa(g, Mw, x0, x1, z0, z1, y, lod=0, w=0.11, gap=0.007, posts_every=1.8):
    """Galerie en planches disjointes (le long de x), solives et petits poteaux sur pierres."""
    if lod:
        cbox(g, 'hd_bois_gris', Mw @ T((x0 + x1) / 2, y - 0.02, (z0 + z1) / 2), x1 - x0, 0.04, z1 - z0, c=0, grain=0, tint=TINT['gris'])
    else:
        n = max(1, int((z1 - z0) / (w + gap)))
        pw = (z1 - z0) / n
        for i in range(n):
            zc = z0 + (i + 0.5) * pw
            cbox(g, 'hd_bois_gris', Mw @ T((x0 + x1) / 2, y - 0.015 + g.rng.uniform(-0.002, 0.002), zc), x1 - x0, 0.03, pw - gap,
                 c=0.004, grain=0, div=0.6, tint=_j(g, TINT['gris'], 0.1))
        # nez de galerie (planche de rive)
    cbox(g, 'hd_bois', Mw @ T((x0 + x1) / 2, y - 0.07, z1 - 0.03), x1 - x0, 0.1, 0.06, c=C(lod, 0.008), grain=0, tint=_j(g, TINT['bois_sombre']))
    nx = max(1, round((x1 - x0) / posts_every))
    for i in range(nx + 1):
        xs = x0 + 0.06 + (x1 - x0 - 0.12) * i / nx
        cbox(g, 'hd_bois', Mw @ T(xs, (y - 0.12 + 0.05) / 2, z1 - 0.12), 0.1, y - 0.12 - 0.05, 0.1, c=C(lod, 0.008), grain=1, tint=_j(g, TINT['bois_sombre']))
        cbox(g, 'hd_pierre', Mw @ T(xs, 0.03, z1 - 0.12), 0.22, 0.12, 0.22, c=C(lod, 0.03), tint=_j(g, TINT['pierre'], 0.1),
             jitter=stone_jitter(0.03, 8, g.rng.randrange(99)) if lod == 0 else None, skip=((1, -1),))
    cbox(g, 'hd_bois', Mw @ T((x0 + x1) / 2, y - 0.09, z1 - 0.12), x1 - x0, 0.07, 0.08, c=C(lod, 0.006), grain=0, tint=_j(g, TINT['bois_sombre']))
