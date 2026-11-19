# Outils communs du générateur de relief (spécialité Terrain & relief).
# Grilles « nœuds » : l'échantillon (i, j) est en x = X0 + i * cell, z = Z0 + j * cell ; tableau indexé [j, i] = [z, x].
import json
import os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'cache')
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))

X0 = -4096.0  # bord ouest/nord de la grille cuite (la carte du monde couvre [-4000, 4000])
EXTENT = 8192.0


def load_world():
    with open(os.path.join(CACHE, 'world-map.json'), encoding='utf-8') as f:
        return json.load(f)


def grid(cell):
    n = int(round(EXTENT / cell))
    c = X0 + np.arange(n, dtype=np.float32) * cell
    X, Z = np.meshgrid(c, c)
    return X, Z, n


# ------------------------------------------------------------------------------------------------ bruit
def _hash(ix, iz, seed):
    h = (ix.astype(np.int64) * 374761393 + iz.astype(np.int64) * 668265263 + seed * 2147483647) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h = h ^ (h >> 16)
    return (h & 0xFFFFFF).astype(np.float32) / float(0xFFFFFF)


def vnoise(x, z, seed=0):
    """Bruit de valeur lissé dans [-1, 1]."""
    ix = np.floor(x)
    iz = np.floor(z)
    fx = (x - ix).astype(np.float32)
    fz = (z - iz).astype(np.float32)
    ix = ix.astype(np.int64)
    iz = iz.astype(np.int64)
    ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
    uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10)
    a = _hash(ix, iz, seed)
    b = _hash(ix + 1, iz, seed)
    c = _hash(ix, iz + 1, seed)
    d = _hash(ix + 1, iz + 1, seed)
    return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1


def fbm(x, z, octaves=4, seed=0, lac=2.03, gain=0.5):
    s = np.zeros_like(x, dtype=np.float32)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        # rotation légère à chaque octave pour casser l'alignement sur la grille
        c, sn = np.cos(0.5 * o), np.sin(0.5 * o)
        s += amp * vnoise(x * c - z * sn, x * sn + z * c, seed + 17 * o)
        norm += amp
        amp *= gain
        x = x * lac
        z = z * lac
    return s / norm


def ridged(x, z, octaves=4, seed=0):
    """Bruit de crêtes dans [0, 1] (crêtes nettes, vallons arrondis)."""
    s = np.zeros_like(x, dtype=np.float32)
    amp, norm, w = 1.0, 0.0, 1.0
    for o in range(octaves):
        c, sn = np.cos(0.7 * o), np.sin(0.7 * o)
        n = 1 - np.abs(vnoise(x * c - z * sn, x * sn + z * c, seed + 31 * o))
        n = n * n * w
        w = np.clip(n * 1.6, 0, 1)
        s += amp * n
        norm += amp
        amp *= 0.5
        x = x * 2.05
        z = z * 2.05
    return s / norm


# ------------------------------------------------------------------------------------------------ géométrie
def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def smax(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return a + (b - a) * h + k * h * (1 - h)


def smin(a, b, k):
    return -smax(-a, -b, k)


def poly_mask(poly, cell, n, scale=4):
    """Masque booléen d'un polygone (sur-échantillonné puis réduit pour des bords propres)."""
    m = n * scale if scale > 1 else n
    img = Image.new('L', (m, m), 0)
    pts = [((p[0] - X0) / cell * scale, (p[1] - X0) / cell * scale) for p in poly]
    ImageDraw.Draw(img).polygon(pts, fill=255)
    a = np.asarray(img, dtype=np.float32) / 255
    if scale > 1:
        a = a.reshape(n, scale, n, scale).mean(axis=(1, 3))
    return a > 0.5


def sdf(mask, cell):
    """Distance signée (m) : négative dedans, positive dehors."""
    dout = ndimage.distance_transform_edt(~mask) * cell
    din = ndimage.distance_transform_edt(mask) * cell
    return (dout - din).astype(np.float32)


def polyline_dist(X, Z, pts, vals=None, maxd=None):
    """Distance à une polyligne et valeurs interpolées (liste de tableaux par point).
    Les polylignes denses passent par un arbre k-d (point le plus proche puis segments voisins)."""
    if len(pts) > 24:
        return _polyline_dist_kd(X, Z, pts, vals)
    best = np.full(X.shape, np.inf, dtype=np.float32)
    seg = np.zeros(X.shape, dtype=np.int32)
    tt = np.zeros(X.shape, dtype=np.float32)
    P = np.asarray(pts, dtype=np.float64)
    for i in range(len(P) - 1):
        ax, az = P[i]
        bx, bz = P[i + 1]
        vx, vz = bx - ax, bz - az
        l2 = vx * vx + vz * vz or 1e-9
        t = np.clip(((X - ax) * vx + (Z - az) * vz) / l2, 0, 1)
        dx = X - ax - vx * t
        dz = Z - az - vz * t
        d = np.sqrt(dx * dx + dz * dz)
        sel = d < best
        best = np.where(sel, d, best)
        seg = np.where(sel, i, seg)
        tt = np.where(sel, t, tt)
    out = [best]
    if vals is not None:
        for v in vals:
            v = np.asarray(v, dtype=np.float32)
            out.append(v[seg] + (v[np.minimum(seg + 1, len(v) - 1)] - v[seg]) * tt)
    return out


def _polyline_dist_kd(X, Z, pts, vals):
    from scipy.spatial import cKDTree
    P = np.asarray(pts, dtype=np.float64)
    q = np.stack([X.ravel(), Z.ravel()], 1)
    _, k = cKDTree(P).query(q)
    best = np.full(q.shape[0], np.inf)
    seg = np.zeros(q.shape[0], dtype=np.int64)
    tt = np.zeros(q.shape[0])
    for off in (-1, 0):
        i = np.clip(k + off, 0, len(P) - 2)
        a = P[i]
        v = P[i + 1] - a
        l2 = (v * v).sum(1) + 1e-9
        t = np.clip(((q - a) * v).sum(1) / l2, 0, 1)
        d = np.hypot(*(q - a - v * t[:, None]).T)
        sel = d < best
        best = np.where(sel, d, best)
        seg = np.where(sel, i, seg)
        tt = np.where(sel, t, tt)
    out = [best.reshape(X.shape).astype(np.float32)]
    if vals is not None:
        for vv in vals:
            vv = np.asarray(vv, dtype=np.float32)
            out.append((vv[seg] + (vv[np.minimum(seg + 1, len(vv) - 1)] - vv[seg]) * tt).reshape(X.shape).astype(np.float32))
    return out


def bbox_slices(pts, pad, cell, n):
    P = np.asarray(pts)
    i0 = max(0, int((P[:, 0].min() - pad - X0) / cell))
    i1 = min(n, int((P[:, 0].max() + pad - X0) / cell) + 2)
    j0 = max(0, int((P[:, 1].min() - pad - X0) / cell))
    j1 = min(n, int((P[:, 1].max() + pad - X0) / cell) + 2)
    return slice(j0, j1), slice(i0, i1)


def slope_deg(h, cell):
    gz, gx = np.gradient(h, cell)
    return np.degrees(np.arctan(np.hypot(gx, gz)))


# ------------------------------------------------------------------------------------------------ images de contrôle
def hillshade(h, cell, az=315, alt=40):
    gz, gx = np.gradient(h, cell)
    slope = np.arctan(np.hypot(gx, gz))
    aspect = np.arctan2(-gx, gz)
    a = np.radians(az)
    e = np.radians(alt)
    s = np.sin(e) * np.cos(slope) + np.cos(e) * np.sin(slope) * np.cos(a - aspect)
    return np.clip(s, 0, 1)


def color_relief(h, cell, path, size=None):
    """Carte en couleurs hypsométriques + ombrage (PNG de contrôle)."""
    stops = [(-40, (20, 40, 90)), (-0.01, (60, 110, 170)), (0, (200, 190, 140)), (15, (110, 160, 80)), (60, (80, 140, 60)),
             (150, (150, 150, 90)), (300, (150, 120, 90)), (550, (130, 110, 100)), (700, (235, 235, 240)), (1000, (255, 255, 255))]
    hs = [s[0] for s in stops]
    rgb = np.zeros(h.shape + (3,), dtype=np.float32)
    for c in range(3):
        rgb[..., c] = np.interp(h, hs, [s[1][c] for s in stops])
    sh = hillshade(h, cell)
    land = h > 0
    rgb = rgb * np.where(land, 0.35 + 0.85 * sh, 0.9 + 0.1 * sh)[..., None]
    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    if size:
        img = img.resize((size, size), Image.LANCZOS)
    img.save(path)
