"""Toits japonais en vraies tuiles kawara : pans paramétriques, faîtages, onigawara, rives, chevrons.

Un pan (`Slope`) est décrit par (a, r) :
  a = position le long de l'égout (m, 0 au milieu du pan), r = retrait horizontal depuis l'égout vers l'intérieur.
  point(a, r) = O + U·a − out·r + Y·(montée(r) + relevé(a, r))
La montée est concave (sori : plus raide près du faîtage) ; le relevé soulève les coins d'égout (irimoya, pagode).
Deux pans voisins d'un toit à croupes ont la même montée en fonction de r : l'arêtier (ligne de croupe) coïncide.

LOD : 0 = couvre-joints ronds modélisés, about des tuiles, faîtage en couches + onigawara, chevrons ;
      1 = pans texturés (couvre-joints peints dans la texture) + faîtage simple ; 2 = pans minces.
"""
import math
from mathutils import Vector as V
from .geom import X, Y, Z, box, beam, quad, prism, tube, disc, tint, jitter, frame
from .materials import C

PITCH_TILE = 0.27          # pas des couvre-joints (m)
COURSE = 0.30              # pas des rangs (m) ; la texture kawara couvre 4 pas × 4 rangs
TEX_U = 4 * PITCH_TILE
TEX_V = 4 * COURSE
KAWARA = (1.0, 1.0, 1.0)


class Slope:
    def __init__(self, O, out, ye, R, pitch, hw, sag=0.18, lift=None, gable_edges=(False, False), r_wall=0.0, th=0.17):
        self.O = V(O)
        self.out = V(out).normalized()
        self.U = Y.cross(self.out).normalized()
        self.ye, self.R, self.pitch, self.hw_fn, self.sag = ye, R, pitch, hw, sag
        self.lift_fn = lift
        self.gable_edges = gable_edges
        self.r_wall = r_wall
        self.th = th
        n = int(2 * hw(0) / PITCH_TILE)
        self.a_start = -n * PITCH_TILE / 2
        self.nrows = n

    def rise(self, r):
        c, R = self.sag, max(self.R, 1e-6)
        return self.pitch * (r - c * r + c * r * r / R) if self.sag else self.pitch * r

    def hw(self, r):
        return self.hw_fn(r)

    def lift(self, a, r):
        return self.lift_fn(self.hw(r) - abs(a), r) if self.lift_fn else 0.0

    def point(self, a, r, dy=0.0):
        return self.O + self.U * a - self.out * r + Y * (self.ye + self.rise(r) + self.lift(a, r) + dy)

    def slope_len(self, r, n=8):
        s, prev = 0.0, self.point(0, 0)
        for i in range(1, n + 1):
            p = self.point(0, r * i / n)
            s += (p - prev).length
            prev = p
        return s

    def normal(self, a, r):
        e = 0.05
        pa = self.point(a + e, r) - self.point(a - e, r)
        pr = self.point(a, r + e) - self.point(a, max(0, r - e))
        n = pa.cross(pr).normalized()
        return n if n.y > 0 else -n


def _rs(sl, n, extra=()):
    rs = sorted(set([sl.R * i / n for i in range(n + 1)] + [r for r in extra if 0 < r < sl.R]))
    return rs


def _ss(sl, lod):
    if sl.lift_fn is None:
        return [-1.0, 1.0]
    if lod >= 2:
        return [-1.0, -0.6, 0.0, 0.6, 1.0]
    return [-1.0, -0.94, -0.84, -0.68, -0.4, 0.0, 0.4, 0.68, 0.84, 0.94, 1.0]


def slope_surface(b, sl, lod=0, mat='kawara', under='planks', fascia=True, rs_extra=(), col=KAWARA, under_col=None):
    """Pan de toit épais : dessus en tuiles plates (texture kawara alignée sur les couvre-joints), sous-face en planches,
    about (égout) en deux bandes (lèvre des tuiles + planche de rive)."""
    nr = 6 if lod == 0 else (4 if lod == 1 else 2)
    rs = _rs(sl, nr, rs_extra)
    ss = _ss(sl, lod)
    th = sl.th if lod < 2 else 0.1
    under_col = under_col or tint('planks', C['wood_mid'])
    vlen = [sl.slope_len(r) for r in rs]
    top = [[sl.point(s * sl.hw(r), r) for s in ss] for r in rs]
    bot = [[p - Y * th for p in row] for row in top]
    uvt = [[((s * sl.hw(r) - sl.a_start) / TEX_U, vlen[i] / TEX_V) for s in ss] for i, r in enumerate(rs)]
    uvb = [[(s * sl.hw(r) / 1.2, vlen[i] / 1.2) for s in ss] for i, r in enumerate(rs)]
    b.grid(mat, top, uvt, col, smooth=False, out_fn=lambda i, j: Y)
    b.grid(under, bot, uvb, under_col, smooth=False, out_fn=lambda i, j: -Y)
    # égout : lèvre des tuiles (kawara) puis planche de rive (bois)
    row0t, row0b = top[0], bot[0]
    lip = 0.07 if lod < 2 else th
    for j in range(len(ss) - 1):
        a0, a1 = row0t[j], row0t[j + 1]
        m0, m1 = a0 - Y * lip, a1 - Y * lip
        quad(b, mat, m0, m1, a1, a0, col, uvs=(TEX_U, TEX_V), uax=sl.U, vax=Y, out=sl.out)
        if lod < 2 and fascia:
            quad(b, 'wood', row0b[j], row0b[j + 1], m1, m0, tint('wood', C['wood_dark']), uvs=(2.0, 0.5), uax=sl.U, vax=Y, out=sl.out)
    # rives libres (pignons) : chant du pan
    for side, is_gable in zip((0, -1), sl.gable_edges):
        if not is_gable:
            continue
        outv = -sl.U if side == 0 else sl.U
        for i in range(len(rs) - 1):
            p0t, p1t = top[i][side], top[i + 1][side]
            quad(b, under, p0t - Y * th, p1t - Y * th, p1t, p0t, under_col, uvs=(1.2, 1.2), out=outv)
    return top


def cover_rows(b, sl, lod=0, mat='kawara', col=KAWARA, r_end_fn=None, seg=3, tomoe=True, nr=6, tomoe_seg=8):
    """Couvre-joints ronds (marugawara) le long de la pente + tuiles d'about rondes (tomoe) à l'égout."""
    if lod > 0:
        return
    if mat != 'kawara':
        return
    rc = 0.30 * PITCH_TILE
    for k in range(sl.nrows):
        a = sl.a_start + (k + 0.5) * PITCH_TILE
        # fin du rang : sous le faîtage ou à l'arêtier
        r_end = sl.R - 0.12
        if abs(a) + rc > sl.hw(0):
            continue
        lo, hi = 0.0, sl.R
        if sl.hw(sl.R) < abs(a) + rc:
            for _ in range(24):
                mid = (lo + hi) / 2
                if sl.hw(mid) >= abs(a) + rc * 1.3:
                    lo = mid
                else:
                    hi = mid
            r_end = lo
        if r_end_fn:
            r_end = min(r_end, r_end_fn(a))
        if r_end < 0.15:
            continue
        ne = 1 if (not sl.sag and not sl.lift_fn) else min(nr, 4)
        rs = [r_end * i / ne for i in range(ne + 1)]
        path = [sl.point(a, r, 0.005) for r in rs]
        rings, uvr = [], []
        dist = 0.0
        for i, p in enumerate(path):
            if i:
                dist += (path[i] - path[i - 1]).length
            T = (path[min(i + 1, ne)] - path[max(i - 1, 0)]).normalized()
            S = T.cross(Y).normalized()
            N = S.cross(T).normalized()
            ring, ur = [], []
            for j in range(seg + 1):
                th = math.pi * j / seg
                ring.append(p + (S * math.cos(th) + N * math.sin(th)) * rc)
                sgn = S.dot(sl.U)
                ur.append(((a + sgn * rc * math.cos(th) - sl.a_start) / TEX_U, dist / TEX_V))
            rings.append(ring)
            uvr.append(ur)
        cc = jitter(col, b.rng, 0.05)
        b.grid(mat, rings, uvr, cc, smooth=True, out_fn=lambda i, j, rings=rings, path=path: rings[i][j] - path[i])
        if tomoe:
            T0 = (path[1] - path[0]).normalized()
            c0 = path[0] - T0 * 0.015 - Y * 0.01
            disc(b, mat, c0, -T0, rc * 1.15, seg=tomoe_seg, col=cc, up=Y, uvs=(TEX_U, TEX_V))


def rafters(b, sl, lod=0, spacing=0.45, w=0.07, h=0.09, col=None, double=False, mat='wood', beam_col=None):
    """Chevrons (taruki) visibles sous l'avant-toit, de l'égout au mur."""
    if lod > 0 or sl.r_wall <= 0.05:
        return
    col = col or tint('wood', C['wood_dark'])
    hw0 = sl.hw(sl.r_wall)
    n = int(2 * (hw0 - 0.1) / spacing)
    a0 = -n * spacing / 2
    r1 = sl.r_wall + 0.25
    for k in range(n + 1):
        a = a0 + k * spacing
        if abs(a) > sl.hw(sl.r_wall) - 0.12:
            continue
        p0 = sl.point(a, 0.06, -sl.th - h / 2 - 0.015)
        p1 = sl.point(a, r1, -sl.th - h / 2 - 0.015)
        beam(b, mat, p0, p1, w, h, up=Y, col=jitter(col, b.rng, 0.05), skip=('+y',))
    # panne d'égout sous les chevrons, au droit du mur
    pa = sl.point(-hw0 + 0.05, sl.r_wall, -sl.th - h - 0.09)
    pb = sl.point(hw0 - 0.05, sl.r_wall, -sl.th - h - 0.09)
    beam(b, mat, pa, pb, 0.16, 0.18, col=beam_col or col)


def ridge(b, p0, p1, lod=0, layers=3, w=0.42, col=KAWARA, cap=True, mat='kawara'):
    """Faîtage (munagawara) entre p0 et p1 : couches de tuiles noshi en retrait + couvre-faîte rond (kanmuri)."""
    p0, p1 = V(p0), V(p1)
    d = (p1 - p0).normalized()
    R = frame(d, Y)
    L = (p1 - p0).length
    if lod >= 2:
        box(b, mat, (p0 + p1) / 2 + Y * 0.12, (L, 0.24, 0.3), R, col)
        return 0.24
    y = 0.0
    lh = 0.075
    nl = layers if lod == 0 else 1
    for i in range(nl):
        ww = w - i * 0.035
        hh = lh if lod == 0 else lh * layers
        box(b, mat, (p0 + p1) / 2 + Y * (y + hh / 2), (L - i * 0.02, hh, ww), R, jitter(col, b.rng, 0.04),
            uvs=(TEX_U, TEX_V), skip=('-y',))
        y += hh
    if cap:
        r = w * 0.28
        tube(b, mat, [p0 + Y * y + d * 0.01, p1 + Y * y - d * 0.01], r, seg=4 if lod == 0 else 2, arc=(0, math.pi), up=Y,
             col=col, uvs=(TEX_U, TEX_V), caps=(True, True) if lod == 0 else (False, False))
        y += r
    return y


def ridge_along(b, pts, lod=0, w=0.3, h=0.16, col=KAWARA, mat='kawara'):
    """Arêtier ou faîtage descendant le long d'une polyligne (suite de blocs + couvre-joint rond)."""
    pts = [V(p) for p in pts]
    for i in range(len(pts) - 1):
        p0, p1 = pts[i], pts[i + 1]
        d = (p1 - p0)
        R = frame(d, Y)
        box(b, mat, (p0 + p1) / 2 + R.col[1] * (h / 2), (d.length + 0.04, h, w), R, col, uvs=(TEX_U, TEX_V), skip=('-y',))
    if lod == 0 and mat == 'kawara':
        tube(b, mat, [p + Y * h for p in pts], w * 0.3, seg=3, arc=(0, math.pi), up=Y, col=col, uvs=(TEX_U, TEX_V), caps=(True, True))


ONI_SHAPE = [(-0.5, 0.0), (0.5, 0.0), (0.52, 0.42), (0.62, 0.78), (0.44, 0.7), (0.34, 0.9), (0.14, 1.0), (-0.14, 1.0),
             (-0.34, 0.9), (-0.44, 0.7), (-0.62, 0.78), (-0.52, 0.42)]


def onigawara(b, base, outward, size=0.6, lod=0, col=KAWARA, th=0.14):
    """Tuile d'about du faîtage (onigawara) : bouclier à cornes avec bordure en relief, tourné vers `outward`."""
    base, outward = V(base), V(outward).normalized()
    side = Y.cross(outward).normalized()
    if lod >= 2:
        box(b, 'kawara', base + Y * size * 0.45, (size * 0.9, size * 0.9, th), frame(side, Y), col)
        return
    shape = ONI_SHAPE if lod == 0 else [ONI_SHAPE[i] for i in (0, 1, 3, 6, 7, 10)]
    poly2d = [(p[0] * size, p[1] * size) for p in shape]
    prism(b, 'kawara', poly2d, base - outward * (th / 2), side, Y, outward * th, col, uvs=(0.5, 0.5))
    if lod == 0:
        # médaillon central en relief (mon)
        inner = [(p[0] * size * 0.45, 0.18 * size + p[1] * size * 0.5) for p in ONI_SHAPE[:2] + ONI_SHAPE[5:9]]
        inner = [(0.2 * size * math.cos(t), 0.48 * size + 0.2 * size * math.sin(t)) for t in [k * math.pi / 4 for k in range(8)]]
        prism(b, 'kawara', inner, base + outward * (th / 2), side, Y, outward * 0.04, jitter(col, b.rng, 0.1), uvs=(0.5, 0.5),
              caps=(False, True))


def hafu(b, sl, side, lod=0, h=0.28, t=0.06, col=None, r0=0.0, r1=None, out_off=0.03, mat='wood'):
    """Planche de rive (hafu) le long du bord libre d'un pan (côté a = −hw si side = 0, +hw si side = 1)."""
    col = col or tint('wood', C['wood_dark'])
    r1 = sl.R if r1 is None else r1
    n = 6 if lod == 0 else 3
    rs = [r0 + (r1 - r0) * i / n for i in range(n + 1)]
    sgn = -1 if side == 0 else 1
    outv = sl.U * sgn
    top, bot, inn_t, inn_b = [], [], [], []
    for r in rs:
        a = sgn * (sl.hw(r) + out_off)
        p = sl.point(a, r, 0.05)
        top.append(p + outv * t)
        bot.append(p + outv * t - Y * h)
        inn_t.append(p)
        inn_b.append(p - Y * h)
    for i in range(n):
        quad(b, mat, bot[i], bot[i + 1], top[i + 1], top[i], col, uvs=(0.3, 2.0), uax=Y, vax=(top[i + 1] - top[i]).normalized(), out=outv)
        quad(b, mat, inn_b[i], bot[i], bot[i + 1], inn_b[i + 1], col, uvs=(0.3, 2.0), out=-Y)
        quad(b, mat, inn_t[i], top[i], top[i + 1], inn_t[i + 1], col, uvs=(0.3, 2.0), out=Y)
        if lod == 0:
            quad(b, mat, inn_b[i], inn_b[i + 1], inn_t[i + 1], inn_t[i], col, uvs=(0.3, 2.0), out=-outv)
    quad(b, mat, inn_b[0], bot[0], top[0], inn_t[0], col, uvs=(0.3, 0.3), out=sl.out)


def roof_under(slopes, x, z, default=None):
    """Hauteur de la sous-face du toit au-dessus du point (x, z) du repère du bâtiment (min des pans qui le couvrent)."""
    best = None
    p = V((x, 0, z))
    for sl in slopes:
        rel = p - sl.O
        a = rel.dot(sl.U)
        r = -rel.dot(sl.out)
        if -0.01 <= r <= sl.R + 0.01 and abs(a) <= sl.hw(min(max(r, 0), sl.R)) + 0.01:
            y = sl.point(a, min(max(r, 0), sl.R)).y - sl.th
            best = y if best is None else min(best, y)
    return default if best is None else best


# ====================================================================== types de toits complets
def gable_roof(b, W, D, y_wall, pitch=0.48, ov=1.0, ovg=0.6, lod=0, sag=0.16, ridge_layers=3, oni=0.62,
               th=0.17, rafter=True, back=True, ridge_extra=0.12, col=KAWARA, ridge_axis='x', mat='kawara',
               rafter_mat='wood', rafter_col=None, hafu_col=None):
    """Toit à deux pans (kirizuma), faîtage selon x (ou z si ridge_axis='z'). y_wall = dessus de la sablière au droit du mur.
    Retourne (slopes, y_ridge_top)."""
    if ridge_axis == 'z':
        from .geom import rot_y, affine
        M = affine(rot_y(math.pi / 2))
        with b.at(M):
            slopes, yt = gable_roof(b, D, W, y_wall, pitch, ov, ovg, lod, sag, ridge_layers, oni, th, rafter, back, ridge_extra, col,
                                    'x', mat, rafter_mat, rafter_col, hafu_col)
        R3 = rot_y(math.pi / 2)
        for sl in slopes:
            sl.O, sl.out, sl.U = R3 @ sl.O, R3 @ sl.out, R3 @ sl.U
        return slopes, yt
    R = D / 2 + ov
    hw = W / 2 + ovg
    slopes = []
    for sgn in ((1, -1) if back else (1,)):
        out = Z * sgn
        tmp = Slope((0, 0, sgn * R), out, 0, R, pitch, lambda r: hw, sag, gable_edges=(True, True), r_wall=ov, th=th)
        ye = y_wall + th - tmp.rise(ov) + 0.1
        sl = Slope((0, 0, sgn * R), out, ye, R, pitch, lambda r: hw, sag, gable_edges=(True, True), r_wall=ov, th=th)
        slope_surface(b, sl, lod, mat=mat, col=col)
        cover_rows(b, sl, lod, mat=mat, col=col)
        if rafter:
            rafters(b, sl, lod, mat=rafter_mat, col=rafter_col)
        hafu(b, sl, 0, lod, col=hafu_col, mat=rafter_mat)
        hafu(b, sl, 1, lod, col=hafu_col, mat=rafter_mat)
        slopes.append(sl)
    sl = slopes[0]
    top = sl.point(0, sl.R)
    p0 = V((-hw - ridge_extra, top.y - 0.03, 0))
    p1 = V((hw + ridge_extra, top.y - 0.03, 0))
    hr = ridge(b, p0, p1, lod, ridge_layers, col=col, mat=mat)
    if oni and mat == 'kawara':
        for s in (-1, 1):
            onigawara(b, V((s * (hw + ridge_extra - 0.02), top.y - 0.12, 0)), X * s, oni, lod, col)
    return slopes, top.y + hr


def hip_roof(b, W, D, y_wall, pitch=0.5, ov=1.0, lod=0, sag=0.16, r_break=None, corner_lift=0.25, th=0.17,
             oni=0.55, ridge_layers=3, col=KAWARA, tsuma_mat='planks', skirt=False, R_top=None, rafter=True, hips=True,
             mat='kawara', cover_nr=6, rafter_mat='wood', rafter_col=None, tsuma_col=None, under_col=None, Ld=None):
    """Toit à croupes (yosemune), à croupes et pignons (irimoya, `r_break` = retrait du pignon) ou jupe de pagode (`skirt`).
    W, D = emprise des murs ; ov = débord ; y_wall = dessus de sablière. Retourne (slopes, y_top)."""
    We, De = W + 2 * ov, D + 2 * ov
    Rfb = De / 2 if R_top is None else R_top          # front/arrière : jusqu'au faîtage
    rb = De / 2 if r_break is None else r_break       # croupe latérale : jusqu'à rb
    rb = min(rb, De / 2)
    Ld = Ld or (1.6 if corner_lift else 1.0)

    def lift(d, r, Lmax=corner_lift):
        if not Lmax:
            return 0.0
        return Lmax * max(0.0, 1 - d / Ld) ** 2 * max(0.0, 1 - r / (ov * 1.8 + 0.5))

    lf = lift if corner_lift else None
    slopes = []
    tmp = Slope((0, 0, De / 2), Z, 0, Rfb, pitch, lambda r: We / 2, sag, r_wall=ov, th=th)
    ye = y_wall + th - tmp.rise(ov) + 0.1
    specs = []
    for sgn in (1, -1):  # avant / arrière
        hwf = (lambda r, We=We: We / 2 - min(r, rb)) if True else None
        specs.append(((0, 0, sgn * De / 2), Z * sgn, Rfb, hwf, (r_break is not None and r_break < De / 2)))
    for sgn in (1, -1):  # croupes latérales
        hws = (lambda r, De=De: De / 2 - r)
        specs.append(((sgn * We / 2, 0, 0), X * sgn, rb if not skirt else Rfb, hws, False))
    for O, out, R, hwfn, gab in specs:
        sl = Slope(O, out, ye, R, pitch, hwfn, sag if not skirt else sag * 0.5, lift=lf, r_wall=ov, th=th)
        sl.rb = rb
        extra = (rb,) if R > rb else ()
        slope_surface(b, sl, lod, mat=mat, rs_extra=extra, col=col, under_col=under_col)
        cover_rows(b, sl, lod, mat=mat, col=col, nr=cover_nr, tomoe_seg=6 if cover_nr < 6 else 8)
        if rafter:
            rafters(b, sl, lod, mat=rafter_mat, col=rafter_col)
        slopes.append(sl)
    front, backs, right, left = slopes
    # rives des pignons d'irimoya
    y_top = front.point(0, Rfb).y
    if r_break is not None and r_break < De / 2 and not skirt:
        for sl in (front, backs):
            hafu(b, sl, 0, lod, r0=rb - 0.05)
            hafu(b, sl, 1, lod, r0=rb - 0.05)
        # tympan (tsuma) en retrait : planches verticales
        for s in (-1, 1):
            xg = s * (We / 2 - rb - 0.12)
            ys = front.point(0, rb).y
            prof = []
            n = 6
            for i in range(n + 1):
                r = rb + (Rfb - rb) * i / n
                p = front.point(0, r)
                prof.append((De / 2 - r, p.y - th))
            pts2 = prof + [(-z, y) for (z, y) in reversed(prof)]
            pts3 = [V((xg, y, z)) for z, y in pts2]
            from .geom import poly
            poly(b, tsuma_mat, pts3, tsuma_col or tint('planks', C['wood_mid']), uvs=(1.2, 1.2), uax=Z, vax=Y, out=X * s)
            # fermeture inférieure du tympan (pied du pignon), au-dessus de la croupe
            if lod == 0:
                beam(b, 'wood', (xg, ys - th + 0.05, -De / 2 + rb), (xg, ys - th + 0.05, De / 2 - rb), 0.14, 0.16,
                     col=tint('wood', C['wood_dark']))
                # lattes verticales du tympan (kitsune-goshi)
                zmax = De / 2 - rb
                k = int(zmax / 0.18)
                for i in range(-k, k + 1):
                    z = i * 0.18
                    yt = front.point(0, De / 2 - abs(z)).y - th - 0.05 if abs(z) < De / 2 - rb else ys
                    if yt - ys < 0.15:
                        continue
                    box(b, 'wood', (xg + s * 0.02, (ys + yt) / 2, z), (0.03, yt - ys, 0.035), col=tint('wood', C['wood_dark']), skip=('-x' if s > 0 else '+x',))
    # faîtage principal + onigawara
    if not skirt:
        hwr = front.hw(Rfb)
        if hwr > 0.05:
            p0 = V((-hwr - 0.1, y_top - 0.03, 0))
            p1 = V((hwr + 0.1, y_top - 0.03, 0))
            hr = ridge(b, p0, p1, lod, ridge_layers, col=col, mat=mat)
            if oni and mat == 'kawara':
                for s in (-1, 1):
                    onigawara(b, V((s * (hwr + 0.08), y_top - 0.12, 0)), X * s, oni, lod, col)
        else:
            hr = 0.2
        y_top += hr
    # arêtiers (de l'égout d'angle jusqu'à la cassure du pignon ou au faîtage)
    if hips and lod < 2:
        for sl in (front, backs):
            for side in (-1, 1):
                rtop = min(rb, sl.R) if not skirt else sl.R
                n = 6
                pts = [sl.point(side * sl.hw(rtop * i / n), rtop * i / n, 0.02) for i in range(n + 1)]
                ridge_along(b, pts, lod, w=0.26, h=0.14, col=col, mat=mat)
                if oni and lod == 0 and mat == 'kawara':
                    d = (pts[0] - pts[1])
                    d.y = 0
                    onigawara(b, pts[0] + d.normalized() * 0.05 + Y * 0.08, d, oni * 0.55, lod, col, th=0.1)
                if r_break is not None and r_break < De / 2 and not skirt:
                    # faîtage descendant le long de la rive du pignon
                    m = 4
                    pts2 = [sl.point(side * (sl.hw(Rfb) - 0.05), rb + (Rfb - rb) * i / m, 0.02) for i in range(m + 1)]
                    ridge_along(b, pts2, lod, w=0.26, h=0.16, col=col, mat=mat)
    return slopes, y_top


def pent_roof(b, x0, x1, y_top, depth, pitch=0.35, lod=0, z_wall=0.0, th=0.12, col=KAWARA, ends=True, brackets=None, sag=0.0,
              mat='kawara', wood='wood', wood_col=None):
    """Auvent (hisashi) à un pan fixé au mur (plan z = z_wall), de x0 à x1, dessus au mur à y_top, débord `depth`."""
    R = depth
    hw = (x1 - x0) / 2
    xc = (x0 + x1) / 2
    tmp = Slope((xc, 0, z_wall + R), Z, 0, R, pitch, lambda r: hw, sag, gable_edges=(ends, ends), r_wall=depth, th=th)
    ye = y_top - tmp.rise(R)
    sl = Slope((xc, 0, z_wall + R), Z, ye, R, pitch, lambda r: hw, sag, gable_edges=(ends, ends), r_wall=depth - 0.05, th=th)
    slope_surface(b, sl, lod, mat=mat, col=col)
    cover_rows(b, sl, lod, mat=mat, col=col, r_end_fn=lambda a: R - 0.04)
    if lod == 0:
        # chevrons et solin contre le mur
        col_w = wood_col or tint('wood', C['wood_dark'])
        n = int(2 * hw / 0.45)
        for k in range(n + 1):
            a = -n * 0.45 / 2 + k * 0.45
            p0 = sl.point(a, 0.05, -th - 0.035)
            p1 = sl.point(a, R, -th - 0.035)
            beam(b, wood, p0, p1, 0.05, 0.07, col=jitter(col_w, b.rng, 0.05), skip=('+y',))
        beam(b, mat, (x0, y_top + 0.02, z_wall + 0.06), (x1, y_top + 0.02, z_wall + 0.06), 0.14, 0.1, col=col)
    if ends:
        hafu(b, sl, 0, lod, h=0.18, t=0.04, mat=wood, col=wood_col)
        hafu(b, sl, 1, lod, h=0.18, t=0.04, mat=wood, col=wood_col)
    # consoles (udegi) sous l'auvent
    if brackets:
        col_w = wood_col or tint('wood', C['wood_dark'])
        for x in brackets:
            p_out = sl.point(x - xc, depth - 0.12, -th - 0.1)
            beam(b, wood, (x, p_out.y, z_wall), (x, p_out.y, p_out.z + 0.08), 0.1, 0.12, col=col_w)
    return sl
