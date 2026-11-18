"""Constructeur de maillages des bâtiments (pur Python + mathutils).

Repère de travail = repère Three.js / glTF : x vers la droite, y vers le haut, z vers la façade principale (+Z).
La conversion vers Blender (Z en haut) se fait à la création des objets (export.py).

Chaque face porte : sa matière (nom partagé entre tous les modèles), ses UV (en mètres / échelle de la matière),
une couleur de sommet linéaire (teinte réelle : les textures « neutres » sont grises) et un drapeau lisse/plat.
"""
import math
import random
from contextlib import contextmanager
from mathutils import Vector, Matrix

V = Vector
X = V((1, 0, 0))
Y = V((0, 1, 0))
Z = V((0, 0, 1))

# moyenne linéaire des textures neutres (voir make_textures.py) : sert à convertir une teinte cible en couleur de sommet
TEX_MEAN = {'wood': 0.60, 'planks': 0.60, 'plaster': 0.79, 'lacquer': 0.60}


def srgb2lin(x):
    return x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4


def hexlin(h):
    h = h.lstrip('#')
    return tuple(srgb2lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))


def tint(mat, h, k=1.0):
    """Couleur de sommet qui donne la teinte sRGB `h` une fois multipliée par la texture neutre de `mat`."""
    c = hexlin(h) if isinstance(h, str) else h
    m = TEX_MEAN.get(mat, 1.0)
    return tuple(min(1.0, ci * k / m) for ci in c)


def jitter(c, rng, amt=0.06):
    f = 1 + rng.uniform(-amt, amt)
    return tuple(min(1.0, ci * f) for ci in c)


def frame(xdir, up=Y):
    """Matrice 3x3 (colonnes = axes locaux) avec x local selon `xdir`, y local au plus près de `up`."""
    x = V(xdir).normalized()
    upv = V(up)
    if abs(x.dot(upv.normalized())) > 0.999:
        upv = Z if abs(x.z) < 0.9 else X
    z = x.cross(upv).normalized()
    y = z.cross(x).normalized()
    return Matrix((x, y, z)).transposed()


def rot_y(a):
    return Matrix.Rotation(a, 3, 'Y')


def affine(R=None, t=(0, 0, 0)):
    M = Matrix.Identity(4)
    if R is not None:
        for i in range(3):
            for j in range(3):
                M[i][j] = R[i][j]
    M[0][3], M[1][3], M[2][3] = t
    return M


def newell(pts):
    n = V((0, 0, 0))
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    return n


class Part:
    __slots__ = ('co', 'faces', 'uv', 'col', 'sm')

    def __init__(self):
        self.co, self.faces, self.uv, self.col, self.sm = [], [], [], [], []


class Builder:
    """Accumule la géométrie par matière. `xf` = transformation courante (pile via `at()`)."""

    def __init__(self, seed=0):
        self.parts = {}
        self.rng = random.Random(seed)
        self.xf = Matrix.Identity(4)
        self.anchors = []   # (nom, position, yaw, extras)

    # ------------------------------------------------------------------ transformations
    @contextmanager
    def at(self, M):
        old = self.xf
        self.xf = old @ M
        try:
            yield self
        finally:
            self.xf = old

    def P(self, p):
        return (self.xf @ V(p).to_4d()).to_3d()

    def D(self, d):
        return (self.xf.to_3x3() @ V(d))

    def anchor(self, name, p, yaw=0.0, **extras):
        """Point d'accroche (nœud vide exporté) ; `yaw` relatif au repère courant."""
        d = self.D(V((math.sin(yaw), 0, math.cos(yaw))))
        self.anchors.append((name, self.P(p), math.atan2(d.x, d.z), extras))

    # ------------------------------------------------------------------ primitives de base
    def face(self, mat, pts, uvs, col, smooth=False, out=None):
        """Ajoute un polygone (points dans le repère courant). `out` : direction extérieure (repère courant) pour orienter."""
        P = [self.P(p) for p in pts]
        if out is not None:
            n = newell(P)
            if n.dot(self.D(out)) < 0:
                P.reverse()
                uvs = list(reversed(uvs))
                if isinstance(col, list):
                    col = list(reversed(col))
        part = self.parts.setdefault(mat, Part())
        base = len(part.co)
        part.co.extend(P)
        part.faces.append(tuple(range(base, base + len(P))))
        part.uv.append(list(uvs))
        part.col.append(col if isinstance(col, list) else [col] * len(P))
        part.sm.append(smooth)

    def grid(self, mat, rows, uvrows, col, smooth=True, out_fn=None):
        """Surface en grille à sommets partagés (lissage). rows[i][j] = point ; out_fn(i, j) = direction extérieure."""
        part = self.parts.setdefault(mat, Part())
        base = len(part.co)
        nr, nc = len(rows), len(rows[0])
        for r in rows:
            part.co.extend(self.P(p) for p in r)
        idx = lambda i, j: base + i * nc + j
        for i in range(nr - 1):
            for j in range(nc - 1):
                f = [idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)]
                uv = [uvrows[i][j], uvrows[i + 1][j], uvrows[i + 1][j + 1], uvrows[i][j + 1]]
                cc = col(i, j) if callable(col) else col
                if out_fn is not None:
                    n = newell([part.co[k] for k in f])
                    if n.dot(self.D(out_fn(i, j))) < 0:
                        f.reverse()
                        uv.reverse()
                part.faces.append(tuple(f))
                part.uv.append(uv)
                part.col.append([cc] * 4)
                part.sm.append(smooth)

    def tris(self):
        return sum(len(f) - 2 for p in self.parts.values() for f in p.faces)

    def merge(self, other):
        for m, p in other.parts.items():
            q = self.parts.setdefault(m, Part())
            base = len(q.co)
            q.co.extend(p.co)
            q.faces.extend(tuple(i + base for i in f) for f in p.faces)
            q.uv.extend(p.uv)
            q.col.extend(p.col)
            q.sm.extend(p.sm)
        self.anchors.extend(other.anchors)

    # ------------------------------------------------------------------ salissures et occlusion approchée
    def weather(self, skip=('paper_shoji', 'interior', 'metal', 'glow'), ground=0.0, eave_y=None, seed=3):
        """Assombrit le pied des murs (éclaboussures), les sous-faces (avant-toits) et varie légèrement chaque face."""
        rng = random.Random(seed)
        for m, part in self.parts.items():
            if m in skip:
                continue
            for fi, f in enumerate(part.faces):
                pts = [part.co[k] for k in f]
                n = newell(pts)
                n = n.normalized() if n.length > 1e-9 else Y
                jit = 1 + rng.uniform(-0.035, 0.035)
                cols = part.col[fi]
                out = []
                for k, p in enumerate(pts):
                    h = p.y - ground
                    a = 1.0
                    if abs(n.y) < 0.6 and m not in ('kawara', 'copper', 'thatch'):
                        a *= 0.62 + 0.38 * min(1.0, max(0.0, (h + 0.1) / 1.0)) ** 0.7
                    if n.y < -0.5:
                        a *= 0.55
                    elif n.y < 0.2 and eave_y is not None and h > eave_y - 0.6 and m in ('plaster', 'wood', 'planks'):
                        a *= 0.82
                    c = cols[k]
                    out.append(tuple(min(1.0, ci * a * jit) for ci in c))
                part.col[fi] = out


# ====================================================================== primitives volumiques
def _uvc(p, ax, s, o):
    return p.dot(ax) / s + o


def box(b, mat, c, size, R=None, col=(1, 1, 1), uvs=(1.0, 1.0), grain=1, skip=(), off=None, smooth=False):
    """Pavé centré en `c`, demi-tailles size/2, axes locaux = colonnes de R. `grain` = axe local du fil du bois (0, 1, 2) :
    sur chaque face, v suit ce fil. `skip` : faces à omettre ('-x', '+y', ...)."""
    R = R if R is not None else Matrix.Identity(3)
    c = V(c)
    ax = [V(R.col[0]), V(R.col[1]), V(R.col[2])]
    h = [size[0] / 2, size[1] / 2, size[2] / 2]
    if off is None:
        off = (b.rng.random(), b.rng.random())
    names = 'xyz'
    for k in range(3):
        for s in (1, -1):
            if (('+' if s > 0 else '-') + names[k]) in skip:
                continue
            ua, va = (k + 1) % 3, (k + 2) % 3
            corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
            if s < 0:
                corners = [(-1, -1), (-1, 1), (1, 1), (1, -1)]
            pts, uv = [], []
            for cu, cv in corners:
                loc = [0, 0, 0]
                loc[k] = s * h[k]
                loc[ua] = cu * h[ua]
                loc[va] = cv * h[va]
                p = c + ax[0] * loc[0] + ax[1] * loc[1] + ax[2] * loc[2]
                pts.append(p)
                if grain in (ua, va):
                    gu = va if grain == ua else ua
                    uv.append((loc[gu] / uvs[0] + off[0], loc[grain] / uvs[1] + off[1]))
                else:
                    uv.append((loc[ua] / uvs[0] + off[0], loc[va] / uvs[1] + off[1]))
            b.face(mat, pts, uv, col, smooth)


def aabb(b, mat, x0, y0, z0, x1, y1, z1, **kw):
    box(b, mat, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (abs(x1 - x0), abs(y1 - y0), abs(z1 - z0)), **kw)


def beam(b, mat, p0, p1, w, h, up=Y, col=(1, 1, 1), uvs=(0.5, 2.0), skip=(), off=None):
    """Poutre de section w (largeur, axe z local) × h (hauteur, axe y local) entre p0 et p1 (fil du bois selon la longueur)."""
    p0, p1 = V(p0), V(p1)
    d = p1 - p0
    R = frame(d, up)
    box(b, mat, (p0 + p1) / 2, (d.length, h, w), R, col, uvs, grain=0, skip=skip, off=off)


def post(b, mat, x, z, y0, y1, s=0.15, col=(1, 1, 1), chamfer=0.02, uvs=(0.4, 2.0)):
    """Poteau carré à arêtes chanfreinées (mentori) : prisme à 8 pans."""
    if chamfer <= 0:
        box(b, mat, (x, (y0 + y1) / 2, z), (s, y1 - y0, s), col=col, uvs=uvs, grain=1, skip=('-y',))
        return
    hs, c = s / 2, chamfer
    ring = [(hs, -hs + c), (hs, hs - c), (hs - c, hs), (-hs + c, hs), (-hs, hs - c), (-hs, -hs + c), (-hs + c, -hs), (hs - c, -hs)]
    off = b.rng.random()
    u = 0.0
    for i in range(8):
        a, bb = ring[i], ring[(i + 1) % 8]
        seg = math.hypot(bb[0] - a[0], bb[1] - a[1])
        pts = [V((x + a[0], y0, z + a[1])), V((x + bb[0], y0, z + bb[1])), V((x + bb[0], y1, z + bb[1])), V((x + a[0], y1, z + a[1]))]
        uv = [(u / uvs[0] + off, y0 / uvs[1]), ((u + seg) / uvs[0] + off, y0 / uvs[1]), ((u + seg) / uvs[0] + off, y1 / uvs[1]), (u / uvs[0] + off, y1 / uvs[1])]
        mid = V((x + (a[0] + bb[0]) / 2, 0, z + (a[1] + bb[1]) / 2)) - V((x, 0, z))
        b.face(mat, pts, uv, col, out=mid)
        u += seg
    top = [V((x + p[0], y1, z + p[1])) for p in ring]
    b.face(mat, top, [(p[0] / uvs[0], p[1] / uvs[0]) for p in ring], col, out=Y)


def quad(b, mat, p0, p1, p2, p3, col=(1, 1, 1), uvs=(1.0, 1.0), uax=None, vax=None, off=(0, 0), out=None):
    """Quadrilatère avec UV planaires : u selon `uax`, v selon `vax` (défaut : p0->p1 et p0->p3)."""
    pts = [V(p0), V(p1), V(p2), V(p3)]
    ua = V(uax) if uax is not None else (pts[1] - pts[0]).normalized()
    va = V(vax) if vax is not None else (pts[3] - pts[0]).normalized()
    uv = [(_uvc(p, ua, uvs[0], off[0]), _uvc(p, va, uvs[1], off[1])) for p in pts]
    b.face(mat, pts, uv, col, out=out)


def poly(b, mat, pts, col=(1, 1, 1), uvs=(1.0, 1.0), uax=X, vax=Y, off=(0, 0), out=None):
    pts = [V(p) for p in pts]
    uv = [(_uvc(p, V(uax), uvs[0], off[0]), _uvc(p, V(vax), uvs[1], off[1])) for p in pts]
    b.face(mat, pts, uv, col, out=out)


def prism(b, mat, poly2d, origin, A, B, E, col=(1, 1, 1), uvs=(1.0, 1.0), caps=(True, True), smooth=False):
    """Extrude un polygone 2D (coordonnées sur les axes A, B à partir de `origin`) selon le vecteur E."""
    origin, A, B, E = V(origin), V(A), V(B), V(E)
    P0 = [origin + A * p[0] + B * p[1] for p in poly2d]
    P1 = [p + E for p in P0]
    cen = sum(P0, V((0, 0, 0))) / len(P0)
    el = E.length
    per = 0.0
    n = len(P0)
    for i in range(n):
        j = (i + 1) % n
        seg = (P0[j] - P0[i]).length
        out = ((P0[i] + P0[j]) / 2 - cen)
        uv = [(0, per / uvs[1]), (0, (per + seg) / uvs[1]), (el / uvs[0], (per + seg) / uvs[1]), (el / uvs[0], per / uvs[1])]
        b.face(mat, [P0[i], P0[j], P1[j], P1[i]], uv, col, smooth, out=out)
        per += seg
    if caps[0]:
        b.face(mat, list(P0), [(p[0] / uvs[0], p[1] / uvs[1]) for p in poly2d], col, out=-E)
    if caps[1]:
        b.face(mat, list(P1), [(p[0] / uvs[0], p[1] / uvs[1]) for p in poly2d], col, out=E)


def tube(b, mat, path, radius, seg=6, arc=(0.0, 2 * math.pi), up=Y, col=(1, 1, 1), uvs=(0.5, 1.0), caps=(False, False),
         smooth=True, uoff=0.0, flat_bottom=False):
    """Tube (ou demi-tube si arc partiel) le long d'une polyligne ; section orientée par `up`.
    radius : nombre ou liste (un par point). Retourne les anneaux."""
    path = [V(p) for p in path]
    n = len(path)
    rads = radius if isinstance(radius, (list, tuple)) else [radius] * n
    rings, uvr = [], []
    dist = 0.0
    full = abs(arc[1] - arc[0] - 2 * math.pi) < 1e-6
    nseg = seg if full else seg
    for i, p in enumerate(path):
        if i == 0:
            T = path[1] - path[0]
        elif i == n - 1:
            T = path[-1] - path[-2]
        else:
            T = (path[i + 1] - path[i]).normalized() + (path[i] - path[i - 1]).normalized()
        T.normalize()
        S = T.cross(V(up))
        if S.length < 1e-6:
            S = T.cross(X)
        S.normalize()
        N = S.cross(T).normalized()
        if i > 0:
            dist += (path[i] - path[i - 1]).length
        ring, ur = [], []
        cnt = nseg if full else nseg + 1
        for k in range(cnt):
            a = arc[0] + (arc[1] - arc[0]) * k / nseg
            ring.append(p + (S * math.cos(a) + N * math.sin(a)) * rads[i])
            ur.append((uoff + (a - arc[0]) * rads[i] / uvs[0], dist / uvs[1]))
        if full:
            ur.append((uoff + (arc[1] - arc[0]) * rads[i] / uvs[0], dist / uvs[1]))
        rings.append(ring)
        uvr.append(ur)
    centers = path

    def out_fn(i, j):
        return rings[i][j % len(rings[i])] - centers[i]

    if full:
        # grille fermée : on duplique la couture pour les UV
        rows = [r + [r[0]] for r in rings]
        b.grid(mat, rows, uvr, col, smooth, out_fn=lambda i, j: rows[i][j] - centers[i])
    else:
        b.grid(mat, rings, uvr, col, smooth, out_fn=out_fn)
        if flat_bottom:
            for i in range(n - 1):
                quad(b, mat, rings[i][0], rings[i + 1][0], rings[i + 1][-1], rings[i][-1], col, out=-(rings[i][nseg // 2] - centers[i]))
    T0 = (path[1] - path[0]).normalized()
    T1 = (path[-1] - path[-2]).normalized()
    if caps[0]:
        pts = list(rings[0]) if full else list(rings[0])
        b.face(mat, pts, [((q - path[0]).dot(T0.orthogonal().normalized()) / uvs[0], 0) for q in pts], col, out=-T0)
    if caps[1]:
        pts = list(rings[-1])
        b.face(mat, pts, [((q - path[-1]).dot(T1.orthogonal().normalized()) / uvs[0], 0) for q in pts], col, out=T1)
    return rings


def cylinder(b, mat, p0, p1, r, seg=10, col=(1, 1, 1), uvs=(0.5, 1.0), caps=(False, True), smooth=True):
    p0, p1 = V(p0), V(p1)
    up = X if abs((p1 - p0).normalized().dot(Y)) > 0.9 else Y
    tube(b, mat, [p0, p1], r, seg, up=up, col=col, uvs=uvs, caps=caps, smooth=smooth)


def disc(b, mat, c, nrm, r, seg=8, col=(1, 1, 1), up=Y, uvs=(1.0, 1.0)):
    c, nrm = V(c), V(nrm).normalized()
    S = nrm.cross(V(up))
    if S.length < 1e-6:
        S = nrm.cross(X)
    S.normalize()
    T = S.cross(nrm)
    pts = [c + (S * math.cos(2 * math.pi * k / seg) + T * math.sin(2 * math.pi * k / seg)) * r for k in range(seg)]
    b.face(mat, pts, [((p - c).dot(S) / uvs[0] + 0.5, (p - c).dot(T) / uvs[1] + 0.5) for p in pts], col, out=nrm)


def smoothstep(a, b_, x):
    t = min(1.0, max(0.0, (x - a) / (b_ - a)))
    return t * t * (3 - 2 * t)


def sweep_rect(b, mat, path, w, h, up=Y, col=(1, 1, 1), uvs=(0.5, 2.0), caps=(True, True), ws=None, hs=None):
    """Section rectangulaire w × h (h selon la normale N) balayée le long d'une polyligne (linteaux courbes de torii)."""
    path = [V(p) for p in path]
    n = len(path)
    frames = []
    for i, p in enumerate(path):
        T = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        S = T.cross(V(up)).normalized()
        N = S.cross(T).normalized()
        frames.append((T, S, N))
    rings = []
    for i, p in enumerate(path):
        T, S, N = frames[i]
        ww = (ws[i] if ws else w) / 2
        hh = (hs[i] if hs else h) / 2
        rings.append([p + S * ww + N * hh, p - S * ww + N * hh, p - S * ww - N * hh, p + S * ww - N * hh])
    dist = 0.0
    for i in range(n - 1):
        seg = (path[i + 1] - path[i]).length
        for k in range(4):
            a, c = rings[i][k], rings[i][(k + 1) % 4]
            a2, c2 = rings[i + 1][k], rings[i + 1][(k + 1) % 4]
            out = (a + c) / 2 - path[i]
            uv = [(k * 0.25, dist / uvs[1]), ((k + 1) * 0.25, dist / uvs[1]), ((k + 1) * 0.25, (dist + seg) / uvs[1]), (k * 0.25, (dist + seg) / uvs[1])]
            b.face(mat, [a, c, c2, a2], uv, col, out=out)
        dist += seg
    if caps[0]:
        b.face(mat, list(rings[0]), [(0, 0), (1, 0), (1, 1), (0, 1)], col, out=-frames[0][0])
    if caps[1]:
        b.face(mat, list(rings[-1]), [(0, 0), (1, 0), (1, 1), (0, 1)], col, out=frames[-1][0])


def lathe(b, mat, profile, c=(0, 0, 0), seg=12, col=(1, 1, 1), smooth=True, uvs=(1.0, 1.0)):
    """Solide de révolution autour de l'axe y : profile = [(rayon, y)] de bas en haut."""
    c = V(c)
    rows, uvr = [], []
    for k, (r, y) in enumerate(profile):
        rows.append([c + V((r * math.cos(2 * math.pi * j / seg), y, r * math.sin(2 * math.pi * j / seg))) for j in range(seg + 1)])
        uvr.append([(j / seg * 2 * math.pi * max(r, 0.01) / uvs[0], y / uvs[1]) for j in range(seg + 1)])

    def out(i, j):
        d = rows[i][j] - V((c.x, rows[i][j].y, c.z))
        return d if d.length > 1e-6 else Y

    b.grid(mat, rows, uvr, col, smooth, out_fn=out)
