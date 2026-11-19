"""Couvertures HD : versants en kawara posées une à une (hongawara : tuiles plates creuses + tuiles rondes sur les joints),
tuiles d'égout à disque tomoe, faîtage en noshi empilés + couvre-faîte, onigawara, arêtiers ; sous-face : chevrons,
voliges, coyau, rive (kayaoi). Un versant est décrit par sa ligne d'égout et une fonction de longueur utile `umax(s)`
(longueur de rampant disponible à l'abscisse s), ce qui découpe naturellement les croupes (arêtiers) et les pignons.
"""
import math
from mathutils import Vector
from .geo import V, basis, cbox, tube, prism, FLAG_NOMOSS, FLAG_ROOF, FLAG_NOWEATHER, FLAG_EDGE
from .materials import T as TINT
from .parts import _j, C

P_TILE = 0.31     # entraxe des colonnes de tuiles (m)
L_TILE = 0.27     # pureau (longueur visible d'une tuile)
H_TILE = 0.07     # épaisseur du lit de tuiles au-dessus des voliges


class Slope:
    """Versant plan : o = point d'égout (s = 0) sur le dessus des voliges, ex = direction de l'égout, out = vers l'extérieur."""

    def __init__(self, o, ex, out, pitch, s0, s1, umax, u_wall):
        self.o, self.ex, self.out = V(o), V(ex).normalized(), V(out).normalized()
        up = V((0, 1, 0))
        self.p = pitch
        self.eu = (-self.out * math.cos(pitch) + up * math.sin(pitch)).normalized()   # vers le faîtage
        self.n = self.ex.cross(self.eu).normalized()
        if self.n.y < 0:
            self.n = -self.n
        self.s0, self.s1, self.umax, self.u_wall = s0, s1, umax, u_wall

    def P(self, s, u, h=0.0):
        return self.o + self.ex * s + self.eu * u + self.n * h


def _pan(g, S, sc, u0, Lt, th, dip, w, first, lod, tint):
    nu = 4
    rows, uvr = [], []
    for k, (u, hh) in enumerate(((u0, H_TILE - 0.045 + th), (u0 + Lt, H_TILE - 0.045))):
        row, ur = [], []
        for j in range(nu + 1):
            a = j / nu
            s = sc - w / 2 + w * a
            d = dip * math.sin(a * math.pi)
            row.append(S.P(s, u, hh - d))
            ur.append((s / 0.5, u / 0.5))
        rows.append(row)
        uvr.append(ur)
    g.grid('hd_tuile', rows, uvr, tint, FLAG_ROOF, True)
    # chant avant (épaisseur) ; tuile d'égout : bavette retombante (manjū)
    drop = 0.05 if first else 0.018
    front = [rows[0], [p - S.n * drop + (S.eu * -0.004) for p in rows[0]]]
    g.grid('hd_tuile', front, [uvr[0], [(a, b + 0.05) for a, b in uvr[0]]], tint, FLAG_ROOF | FLAG_EDGE, True, flip=True)


def _cap(g, S, sj, u0, Lt, th, rc, first, lod, tint):
    seg = 5
    rows, uvr = [], []
    base = H_TILE - 0.045
    for (u, hh) in ((u0, base + th + 0.012), (u0 + Lt, base + 0.012)):
        row, ur = [], []
        for k in range(seg + 1):
            a = math.pi * k / seg
            row.append(S.P(sj + rc * math.cos(a), u, hh + rc * 0.9 * math.sin(a)))
            ur.append((a * rc / 0.5, u / 0.5))
        rows.append(row)
        uvr.append(ur)
    g.grid('hd_tuile', rows, uvr, tint, FLAG_ROOF, True, flip=True)
    if first:
        # disque tomoe de la tuile d'égout ronde (face vers l'aval), avec bossage central
        c = S.P(sj, u0 - 0.01, base + th + 0.012 + rc * 0.25)
        R = rc * 1.12
        ring = [c + S.ex * (R * math.cos(2 * math.pi * k / 10)) + S.n * (R * math.sin(2 * math.pi * k / 10)) for k in range(10)]
        g.face('hd_tuile', ring[::-1], [(p.x, p.y) for p in ring[::-1]], tint, FLAG_ROOF | FLAG_EDGE)
        if lod == 0:
            r2 = R * 0.45
            c2 = c - S.eu * 0.015
            ring2 = [c2 + S.ex * (r2 * math.cos(2 * math.pi * k / 8)) + S.n * (r2 * math.sin(2 * math.pi * k / 8)) for k in range(8)]
            g.face('hd_tuile', ring2[::-1], [(p.x, p.y) for p in ring2[::-1]], tint, FLAG_ROOF)
            for k in range(8):
                a, b = ring2[k], ring2[(k + 1) % 8]
                g.face('hd_tuile', [a, b, b + S.eu * 0.015, a + S.eu * 0.015], [(0, 0), (0.05, 0), (0.05, 0.05), (0, 0.05)], tint, FLAG_ROOF)
    else:
        # chant avant de la tuile ronde
        inner = [S.P(sj + rc * 0.75 * math.cos(math.pi * k / seg), u0, base + th + 0.012 + rc * 0.7 * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
        g.grid('hd_tuile', [rows[0], inner], [uvr[0], uvr[0]], tint, FLAG_ROOF | FLAG_EDGE, True)


def tiles(g, S, lod=0, tint=None, overhang=0.08):
    """Couverture en kawara sur le versant S (colonnes clipées par umax(s))."""
    tint = tint or TINT['tuile']
    n = max(1, round((S.s1 - S.s0) / P_TILE))
    P = (S.s1 - S.s0) / n
    th = 0.028
    rc = 0.068
    if lod:
        # LOD1 : une tôle ondulée par colonne (creux + rond), sans tuiles individuelles
        for i in range(n + 1):
            for kind in ('pan', 'cap'):
                if kind == 'pan' and i == n:
                    continue
                s = S.s0 + (i + 0.5) * P if kind == 'pan' else S.s0 + i * P
                um = S.umax(s)
                if um <= 0.05:
                    continue
                if kind == 'pan':
                    rows = [[S.P(s - P / 2 + P * a, u, H_TILE - 0.03 - 0.02 * math.sin(a * math.pi)) for a in (0, 0.5, 1)] for u in (-overhang, um)]
                else:
                    rows = [[S.P(s + rc * math.cos(a), u, H_TILE - 0.03 + rc * 0.9 * math.sin(a)) for a in (0, math.pi / 2, math.pi)] for u in (-overhang, um)]
                uvr = [[(0, 0)] * 3, [(0, 1)] * 3]
                g.grid('hd_tuile', rows, uvr, _j(g, tint, 0.05), FLAG_ROOF, True, flip=(kind == 'cap'))
        return
    for i in range(n + 1):
        for kind in ('pan', 'cap'):
            if kind == 'pan' and i == n:
                continue
            s = S.s0 + (i + 0.5) * P if kind == 'pan' else S.s0 + i * P
            um = S.umax(s)
            u = -overhang
            k = 0
            while u < um - 0.03:
                Lt = min(L_TILE, um - u) + (0.0 if u + L_TILE >= um else 0.0)
                tt = _j(g, tint, 0.09)
                if kind == 'pan':
                    _pan(g, S, s, u, Lt, th, 0.022, P + 0.004, k == 0, lod, tt)
                else:
                    _cap(g, S, s, u, Lt, th, rc, k == 0, lod, tt)
                u += L_TILE
                k += 1


def underside(g, S, lod=0, spacing=0.42, fascia=True, tint=None):
    """Chevrons (taruki), voliges (nojiita) et rive (kayaoi) dans le débord, entre l'égout et le mur (u_wall)."""
    tint = tint or TINT['bois_sombre']
    hw, hr = 0.06, 0.075
    # voliges en planches le long du rampant
    if lod == 0:
        bw = 0.19
        n = max(1, int((S.s1 - S.s0) / bw))
        for i in range(n):
            s = S.s0 + (i + 0.5) * (S.s1 - S.s0) / n
            um = min(S.u_wall, S.umax(s)) + 0.1
            if um <= 0.02:
                continue
            a, b = S.P(s, 0.0, -0.01), S.P(s, um, -0.01)
            M = basis((a + b) / 2, b - a, S.n)
            cbox(g, 'hd_planches', M, (b - a).length, 0.018, (S.s1 - S.s0) / n - 0.004, c=0, grain=0, tint=_j(g, TINT['planche'], 0.12),
                 flag=FLAG_NOMOSS, skip=((1, 1),))
    else:
        quad = [S.P(S.s0, 0, -0.01), S.P(S.s1, 0, -0.01), S.P(S.s1, S.u_wall, -0.01), S.P(S.s0, S.u_wall, -0.01)]
        g.face('hd_planches', quad[::-1], [(0, 0), (1, 0), (1, 1), (0, 1)], TINT['planche'], FLAG_NOMOSS)
    # chevrons
    n = max(1, round((S.s1 - S.s0) / spacing))
    for i in range(n + 1):
        s = S.s0 + 0.04 + (S.s1 - S.s0 - 0.08) * i / n
        um = min(S.u_wall, S.umax(s)) + 0.05
        if um <= 0.05:
            continue
        a, b = S.P(s, 0.02, -0.018 - hr / 2), S.P(s, um, -0.018 - hr / 2)
        M = basis((a + b) / 2, b - a, S.n)
        cbox(g, 'hd_bois', M, (b - a).length, hr, hw, c=C(lod, 0.008), grain=0, tint=_j(g, tint, 0.08), flag=FLAG_NOMOSS,
             skip=((1, 1),))
    if fascia:
        # rive : planche de rive (kayaoi) + chant
        a, b = S.P(S.s0 - 0.02, -0.02, -0.05), S.P(S.s1 + 0.02, -0.02, -0.05)
        M = basis((a + b) / 2, b - a, S.n)
        cbox(g, 'hd_bois', M, (b - a).length, 0.13, 0.07, c=C(lod, 0.01), grain=0, tint=_j(g, tint), div=0.8 if lod == 0 else None)


def ridge(g, p0, p1, lod=0, layers=4, w=0.26, oni=(True, True), tint=None, cap_r=0.085):
    """Faîtage (ou arêtier) : noshi-gawara empilées par assises, couvre-faîte arrondi (kanmuri), onigawara aux bouts."""
    tint = tint or TINT['tuile_faitage']
    p0, p1 = V(p0), V(p1)
    d = (p1 - p0)
    L = d.length
    up = V((0, 1, 0))
    M = basis((p0 + p1) / 2, d, up)
    if lod:
        cbox(g, 'hd_tuile', M @ _T(0, layers * 0.04 / 2, 0), L, layers * 0.04, w, c=0, grain=0, tint=tint, flag=FLAG_ROOF)
    else:
        for k in range(layers):
            ww = w - 0.025 * k
            y = 0.02 + k * 0.04
            n = max(1, round(L / 0.28))
            pl = L / n
            for i in range(n):
                x = -L / 2 + (i + 0.5) * pl
                cbox(g, 'hd_tuile', M @ _T(x, y, g.rng.uniform(-0.004, 0.004)), pl - 0.006, 0.034, ww, c=0.006, grain=0,
                     tint=_j(g, tint, 0.08), flag=FLAG_ROOF, skip=((1, -1),))
    yc = 0.02 + layers * 0.04
    rows = [[V((x, yc + cap_r * 0.5 * math.sin(math.pi * k / 6), cap_r * math.cos(math.pi * k / 6))) for k in range(7)] for x in (-L / 2, L / 2)]
    g.grid('hd_tuile', rows, [[(k * 0.1, 0) for k in range(7)], [(k * 0.1, L) for k in range(7)]], tint, FLAG_ROOF, True, M=M)
    for end, flag in ((-1, oni[0]), (1, oni[1])):
        if flag:
            onigawara(g, M @ _T(end * (L / 2 + 0.02), 0, 0), end, yc + 0.04, lod, tint)


def _T(x, y, z):
    from mathutils import Matrix
    return Matrix.Translation((x, y, z))


def onigawara(g, M, end, h, lod, tint):
    """Onigawara : plaque terminale en arc avec oreilles, bordure en relief et blason circulaire."""
    from mathutils import Matrix
    H = max(0.45, h + 0.3)
    W = 0.48
    pts = [(-W / 2, 0), (W / 2, 0), (W / 2, H * 0.55), (W / 2 + 0.06, H * 0.78)]
    for k in range(1, 12):
        a = math.pi * k / 12
        pts.append((math.cos(a) * W * 0.42, H * 0.62 + math.sin(a) * H * 0.38))
    pts += [(-W / 2 - 0.06, H * 0.78), (-W / 2, H * 0.55)]
    R = Matrix.Rotation(math.pi / 2, 4, 'Y')   # plaque dans le plan (z, y), épaisseur selon l'axe du faîtage
    prism(g, 'hd_tuile', M @ R, pts, 0.12, tint=tint, flag=FLAG_ROOF)
    if lod == 0:
        inner = [(x * 0.8, 0.05 + y * 0.8) for x, y in pts]
        prism(g, 'hd_tuile', M @ _T(end * 0.07, 0, 0) @ R, inner, 0.03, tint=_j(g, tint, 0.05), flag=FLAG_ROOF, caps=(False, True))
        circ = [(0.09 * math.cos(2 * math.pi * k / 12), H * 0.52 + 0.09 * math.sin(2 * math.pi * k / 12)) for k in range(12)]
        prism(g, 'hd_tuile', M @ _T(end * 0.095, 0, 0) @ R, circ, 0.03, tint=_j(g, tint, 0.05), flag=FLAG_ROOF, caps=(False, True))


def verge(g, S, s, lod=0, tint=None, h=0.24):
    """Planche de rive de pignon (hafu) le long du rampant, à l'abscisse s du versant."""
    tint = tint or TINT['bois_sombre']
    um = S.umax(s)
    a, b = S.P(s, -0.1, -0.02), S.P(s, um + 0.02, -0.02)
    M = basis((a + b) / 2, b - a, S.n)
    cbox(g, 'hd_bois', M, (b - a).length, h, 0.05, c=C(lod, 0.01), grain=0, div=0.8 if lod == 0 else None, tint=_j(g, tint))
