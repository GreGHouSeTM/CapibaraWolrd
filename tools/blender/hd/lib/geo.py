"""Géométrie du pipeline HD : accumulateur de maillages par matière et primitives détaillées (pur Python + mathutils).

Repère de travail = repère Three.js / glTF : x à droite, y en haut, z vers la façade principale (+Z).
Chaque face porte : sa matière (`hd_*`), ses UV (mètres / taille réelle de la texture), une teinte linéaire,
un drapeau (bits FLAG_*) qui guide la patine (usure d'arête, pas de mousse…) et un drapeau lisse/plat.

Primitive centrale : `cbox`, boîte **chanfreinée** (6 faces + 12 chanfreins + 8 coins), subdivisée au besoin pour que
l'occlusion cuite par sommet ait assez de résolution ; les faces de chanfrein portent FLAG_EDGE (usure des arêtes).
"""
import math
import random
from mathutils import Vector, Matrix
from .materials import HD_MATERIALS

V = Vector
FLAG_EDGE = 1      # face de chanfrein : arête usée, plus claire
FLAG_NOMOSS = 2    # jamais de mousse (dessous d'avant-toit, intérieur)
FLAG_NOWEATHER = 4  # aucune patine (papier, intérieur, métal)
FLAG_ROOF = 8      # couverture : coulures et mousse de toit


def newell(pts):
    n = V((0, 0, 0))
    for i, p in enumerate(pts):
        q = pts[(i + 1) % len(pts)]
        n.x += (p.y - q.y) * (p.z + q.z)
        n.y += (p.z - q.z) * (p.x + q.x)
        n.z += (p.x - q.x) * (p.y + q.y)
    return n.normalized() if n.length > 1e-12 else V((0, 1, 0))


def T(x=0.0, y=0.0, z=0.0):
    return Matrix.Translation((x, y, z))


def RY(a):
    return Matrix.Rotation(a, 4, 'Y')


def RX(a):
    return Matrix.Rotation(a, 4, 'X')


def RZ(a):
    return Matrix.Rotation(a, 4, 'Z')


def basis(o, xdir, ydir):
    """Matrice 4x4 : origine `o`, axe x local selon `xdir`, y local au plus près de `ydir`."""
    x = V(xdir).normalized()
    z = x.cross(V(ydir)).normalized()
    y = z.cross(x).normalized()
    M = Matrix((x, y, z)).transposed().to_4x4()
    M.translation = V(o)
    return M


class Part:
    __slots__ = ('co', 'faces', 'uv', 'tint', 'flag', 'smooth')

    def __init__(self):
        self.co, self.faces, self.uv, self.tint, self.flag, self.smooth = [], [], [], [], [], []


class Geo:
    """Maillage en construction, une `Part` par matière ; `warp` (fonction p -> p) déforme tout à l'ajout."""

    def __init__(self, seed=0):
        self.parts = {}
        self.rng = random.Random(seed)
        self.warp = None

    def part(self, mat):
        p = self.parts.get(mat)
        if p is None:
            p = self.parts[mat] = Part()
        return p

    def tris(self):
        return sum(sum(len(f) - 2 for f in p.faces) for p in self.parts.values())

    def _v(self, p, M):
        q = M @ V(p)
        if self.warp:
            q = self.warp(q)
        return (q.x, q.y, q.z)

    def face(self, mat, pts, uvs, tint, flag=0, smooth=False, M=None):
        """Face isolée (sommets propres). `pts` en local si `M` est donné."""
        P = self.part(mat)
        b = len(P.co)
        M = M or Matrix.Identity(4)
        P.co.extend(self._v(p, M) for p in pts)
        P.faces.append(tuple(range(b, b + len(pts))))
        P.uv.append([tuple(u) for u in uvs])
        P.tint.append(tuple(tint))
        P.flag.append(flag)
        P.smooth.append(smooth)

    def grid(self, mat, rows, uvrows, tint, flag=0, smooth=True, M=None, flip=False):
        """Grille de sommets partagés (rows[i][j] = point local) : surface lisse (tuile, tissu, tube)."""
        P = self.part(mat)
        M = M or Matrix.Identity(4)
        b = len(P.co)
        nj = len(rows[0])
        for r in rows:
            P.co.extend(self._v(p, M) for p in r)
        for i in range(len(rows) - 1):
            for j in range(nj - 1):
                a, c = b + i * nj + j, b + (i + 1) * nj + j
                f = (a, a + 1, c + 1, c) if not flip else (a, c, c + 1, a + 1)
                P.faces.append(f)
                uv = [uvrows[i][j], uvrows[i][j + 1], uvrows[i + 1][j + 1], uvrows[i + 1][j]]
                P.uv.append(uv if not flip else [uv[0], uv[3], uv[2], uv[1]])
                P.tint.append(tuple(tint))
                P.flag.append(flag)
                P.smooth.append(smooth)


def msize(mat):
    return HD_MATERIALS.get(mat, {}).get('size', 1.0)


def _lin(e, m):
    return [-e + 2 * e * i / m for i in range(m + 1)]


def cbox(g, mat, M, sx, sy, sz, c=0.012, grain=1, tint=(1, 1, 1), div=None, skip=(), flag=0, jitter=None, uvoff=None):
    """Boîte chanfreinée centrée sur l'origine locale de `M`, de tailles (sx, sy, sz).

    grain : axe local du fil du bois (la texture suit sa longueur) ; div : longueur max d'un segment (subdivision) ;
    skip : faces omises, couples (axe, signe) ex. (1, -1) = dessous ; jitter(p_local) -> décalage (pierres irrégulières).
    """
    h = [sx / 2, sy / 2, sz / 2]
    c = min(c, min(h) * 0.45) if c > 0 else 0.0
    n = [max(1, math.ceil(2 * h[a] / div)) if div else 1 for a in range(3)]
    s = msize(mat)
    if uvoff is None:
        uvoff = (g.rng.random() * 7.0, g.rng.random() * 7.0)
    quads = []  # (points locaux, chanfrein ?)
    for a in range(3):
        b, cc = (a + 1) % 3, (a + 2) % 3
        U, W = _lin(h[b] - c, n[b]), _lin(h[cc] - c, n[cc])
        for sg in (-1, 1):
            if (a, sg) in skip:
                continue
            for i in range(n[b]):
                for j in range(n[cc]):
                    q = []
                    for (ui, wj) in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)):
                        p = [0.0, 0.0, 0.0]
                        p[a], p[b], p[cc] = sg * h[a], U[ui], W[wj]
                        q.append(p)
                    quads.append((q, False))
    if c > 0:
        for cc in range(3):
            a, b = [x for x in range(3) if x != cc]
            Tl = _lin(h[cc] - c, n[cc])
            for sa in (-1, 1):
                for sb in (-1, 1):
                    if (a, sa) in skip and (b, sb) in skip:
                        continue
                    for j in range(n[cc]):
                        q = []
                        for (t, side) in ((Tl[j], 0), (Tl[j + 1], 0), (Tl[j + 1], 1), (Tl[j], 1)):
                            p = [0.0, 0.0, 0.0]
                            p[cc] = t
                            if side == 0:
                                p[a], p[b] = sa * h[a], sb * (h[b] - c)
                            else:
                                p[a], p[b] = sa * (h[a] - c), sb * h[b]
                            q.append(p)
                        quads.append((q, True))
        for sx_ in (-1, 1):
            for sy_ in (-1, 1):
                for sz_ in (-1, 1):
                    sg = (sx_, sy_, sz_)
                    if sum(1 for a in range(3) if (a, sg[a]) in skip) >= 2:
                        continue
                    tri = []
                    for a in range(3):
                        p = [sg[k] * (h[k] - c) for k in range(3)]
                        p[a] = sg[a] * h[a]
                        tri.append(p)
                    quads.append((tri, True))
    for q, ch in quads:
        pts = [V(p) for p in q]
        if jitter:
            pts = [p + jitter(p) for p in pts]
        nrm = newell(pts)
        cen = sum(pts, V((0, 0, 0))) / len(pts)
        if nrm.dot(cen) < 0:
            pts.reverse()
            nrm = -nrm
        d = max(range(3), key=lambda k: abs(nrm[k]))
        ax = [k for k in range(3) if k != d]
        if grain in ax:
            vax = grain
            uax = ax[0] if ax[1] == grain else ax[1]
        else:
            uax, vax = ax
        uvs = [(p[uax] / s + uvoff[0], p[vax] / s + uvoff[1]) for p in pts]
        g.face(mat, pts, uvs, tint, flag | (FLAG_EDGE if ch else 0), False, M)


def beam(g, mat, p0, p1, w, h, up=(0, 1, 0), **kw):
    """Poutre chanfreinée de section w × h entre p0 et p1 (fil du bois selon la longueur)."""
    p0, p1 = V(p0), V(p1)
    L = (p1 - p0).length
    M = basis((p0 + p1) / 2, p1 - p0, up)
    cbox(g, kw.pop('mat2', mat), M, L, h, w, grain=0, **kw)


def prism(g, mat, M, poly, depth, tint=(1, 1, 1), flag=0, caps=(True, True), uvscale=None, grain=0):
    """Extrusion d'un polygone (x, y) local selon z ∈ [-depth/2, depth/2] (faces plates, n-gones)."""
    s = uvscale or msize(mat)
    o = (g.rng.random() * 5, g.rng.random() * 5)
    z0, z1 = -depth / 2, depth / 2
    P0 = [V((x, y, z0)) for x, y in poly]
    P1 = [V((x, y, z1)) for x, y in poly]
    # orientation : le polygone doit être anti-horaire vu depuis +z
    area = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))
    if area < 0:
        P0.reverse()
        P1.reverse()
    nP = len(P0)
    if caps[1]:
        g.face(mat, P1, [(p.x / s + o[0], p.y / s + o[1]) for p in P1], tint, flag, False, M)
    if caps[0]:
        g.face(mat, list(reversed(P0)), [(p.x / s + o[0], p.y / s + o[1]) for p in reversed(P0)], tint, flag, False, M)
    acc = 0.0
    for i in range(nP):
        a, b = P0[i], P0[(i + 1) % nP]
        L = (b - a).length
        q = [a, b, P1[(i + 1) % nP], P1[i]]
        uv = [(acc / s + o[0], z0 / s), ((acc + L) / s + o[0], z0 / s), ((acc + L) / s + o[0], z1 / s), (acc / s + o[0], z1 / s)]
        if grain == 1:
            uv = [(v, u) for u, v in uv]
        g.face(mat, q, uv, tint, flag, False, M)
        acc += L


def tube(g, mat, path, r, seg=6, tint=(1, 1, 1), flag=0, M=None, caps=True):
    """Tube lisse le long d'un chemin (liste de points locaux)."""
    path = [V(p) for p in path]
    rows, uvr = [], []
    acc = 0.0
    for i, p in enumerate(path):
        d = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        ref = V((0, 1, 0)) if abs(d.y) < 0.9 else V((1, 0, 0))
        a = d.cross(ref).normalized()
        b = d.cross(a).normalized()
        if i:
            acc += (p - path[i - 1]).length
        rows.append([p + (a * math.cos(2 * math.pi * k / seg) + b * math.sin(2 * math.pi * k / seg)) * r for k in range(seg + 1)])
        uvr.append([(k / seg * 2 * math.pi * r / msize(mat), acc / msize(mat)) for k in range(seg + 1)])
    g.grid(mat, rows, uvr, tint, flag, True, M)


def cyl(g, mat, M, r, h, seg=8, tint=(1, 1, 1), flag=0, top=True, smooth=True):
    """Cylindre d'axe y local, de 0 à h."""
    rows = [[V((r * math.cos(2 * math.pi * k / seg), y, -r * math.sin(2 * math.pi * k / seg))) for k in range(seg + 1)] for y in (0, h)]
    s = msize(mat)
    uvr = [[(k / seg * 2 * math.pi * r / s, y / s) for k in range(seg + 1)] for y in (0, h)]
    g.grid(mat, rows, uvr, tint, flag, smooth, M)
    if top:
        pts = [V((r * math.cos(2 * math.pi * k / seg), h, -r * math.sin(2 * math.pi * k / seg))) for k in range(seg)]
        g.face(mat, pts, [(p.x / s, p.z / s) for p in pts], tint, flag, False, M)


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def hash3(ix, iy, iz, seed=0):
    h = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 1274126177) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


def vnoise(x, y, z, seed=0):
    """Bruit de valeur 3D (0..1), interpolation lisse."""
    ix, iy, iz = math.floor(x), math.floor(y), math.floor(z)
    fx, fy, fz = x - ix, y - iy, z - iz
    fx, fy, fz = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy), fz * fz * (3 - 2 * fz)
    r = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (fx if dx else 1 - fx) * (fy if dy else 1 - fy) * (fz if dz else 1 - fz)
                r += w * hash3(ix + dx, iy + dy, iz + dz, seed)
    return r


def stone_jitter(amp, freq, seed):
    """Décalage de sommets cohérent (même position -> même décalage) : pierres taillées irrégulières."""
    def j(p):
        return V(((vnoise(p.x * freq, p.y * freq, p.z * freq, seed) - 0.5) * amp,
                  (vnoise(p.x * freq, p.y * freq, p.z * freq, seed + 7) - 0.5) * amp,
                  (vnoise(p.x * freq, p.y * freq, p.z * freq, seed + 13) - 0.5) * amp))
    return j
