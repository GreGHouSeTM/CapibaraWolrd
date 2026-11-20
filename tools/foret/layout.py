"""Plan de la zone de démonstration « forêt » (preuve next-gen, ?demo=foret).

Source unique de vérité pour le relief (terrain.py), la paroi rocheuse et l'escalier (scripts Blender) et la scène
servie au jeu (scene.json). Repère du jeu : x vers l'est, z vers le sud, y vers le haut, en mètres.

Composition (cadrage de la référence foret-escalier) : on arrive par le sud sur un sentier de terre qui monte vers le nord ;
à droite (est) une paroi de granite moussue de 10 à 13 m ; l'escalier de pierre (2 volées de 14 marches) grimpe entre la
paroi et la pente boisée qui tombe vers l'ouest ; une petite clairière humide avec une flaque à l'ouest du sentier bas
(scène de nuit) ; le sentier repart dans la forêt en haut des marches.
"""
import math
import numpy as np

# --- zone détaillée (0,25 m) et anneau lointain (2 m)
X0, X1, Z0, Z1 = -50.0, 50.0, -45.0, 35.0
CELL = 0.25
RING = dict(x0=-320.0, z0=-320.0, cell=2.0, n=321)
MASK_CELL = 0.1

SEED = 7

# ------------------------------------------------------------------------------------------------ bruit
_rng = np.random.default_rng(SEED)
_PERM = np.concatenate([_rng.permutation(256)] * 2).astype(np.int32)
_ANG = _rng.random(256) * 2 * math.pi
_GX, _GY = np.cos(_ANG), np.sin(_ANG)


def perlin(x, y):
    """Bruit de gradient 2D vectorisé (-1..1 environ)."""
    xi = np.floor(x).astype(np.int64)
    yi = np.floor(y).astype(np.int64)
    xf, yf = x - xi, y - yi
    xi &= 255
    yi &= 255
    u = xf * xf * xf * (xf * (xf * 6 - 15) + 10)
    v = yf * yf * yf * (yf * (yf * 6 - 15) + 10)

    def g(ix, iy, dx, dy):
        h = _PERM[_PERM[ix] + iy] & 255
        return _GX[h] * dx + _GY[h] * dy

    n00 = g(xi, yi, xf, yf)
    n10 = g(xi + 1, yi, xf - 1, yf)
    n01 = g(xi, yi + 1, xf, yf - 1)
    n11 = g(xi + 1, yi + 1, xf - 1, yf - 1)
    return (n00 + u * (n10 - n00)) * (1 - v) + (n01 + u * (n11 - n01)) * v


def fbm(x, y, octaves=4, lac=2.03, gain=0.5, off=0.0):
    a, f, s, n = 1.0, 1.0, 0.0, 0.0
    for o in range(octaves):
        s += a * perlin(x * f + off + o * 17.3, y * f - off + o * 31.7)
        n += a
        a *= gain
        f *= lac
    return s / n * 1.4


def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------------------------------------ sentier et escalier
# points de contrôle du sentier bas (x, z, y) ; le pied de l'escalier est en (0,2 ; 4,8)
LOWER = [(-30.0, 330.0, -12.0), (-16.0, 140.0, -3.0), (-9.0, 52.0, 2.6), (-7.0, 36.0, 3.7), (-4.2, 27.0, 4.5), (-1.8, 18.0, 5.35), (-0.3, 10.5, 6.25), (0.2, 4.8, 6.95)]
# sentier haut (au-dessus de la seconde volée), qui tourne vers l'ouest dans la forêt
UPPER = [(0.75, -15.2, 11.85), (0.2, -19.5, 12.15), (-2.4, -26.5, 12.75), (-7.8, -33.5, 13.35), (-15.0, -40.5, 13.95),
         (-23.0, -47.0, 14.6), (-40.0, -60.0, 15.6), (-120.0, -140.0, 22.0), (-330.0, -330.0, 40.0)]

STEP_RUN = 0.6
STEP_N = 14
FLIGHT1 = dict(x=0.25, z=4.8, y=6.95, n=STEP_N, run=STEP_RUN, rise=0.172, width=2.5, yaw=0.0)
LANDING = 2.8
FLIGHT2 = dict(x=0.5, z=4.8 - STEP_N * STEP_RUN - LANDING, y=6.95 + STEP_N * 0.172 + 0.04, n=STEP_N, run=STEP_RUN, rise=0.172,
               width=2.4, yaw=0.035)


def catmull(pts, step=0.05):
    """Échantillonne une spline de Catmull-Rom (x, z, y) tous les ~`step` m."""
    p = np.array(pts, dtype=np.float64)
    p = np.vstack([2 * p[0] - p[1], p, 2 * p[-1] - p[-2]])
    out = []
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        seg = np.linalg.norm(p2[:2] - p1[:2])
        n = max(2, int(seg / step))
        t = np.linspace(0, 1, n, endpoint=False)[:, None]
        t2, t3 = t * t, t * t * t
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(p[-2][None])
    return np.vstack(out)


def flight_line(f, step=0.05):
    """Ligne médiane d'une volée (x, z, y) : y suit le nez des marches (rampe)."""
    L = f['n'] * f['run']
    n = int(L / step) + 1
    t = np.linspace(0, 1, n)[:, None]
    dx = math.sin(f['yaw'])
    x = f['x'] - dx * L * t
    z = f['z'] - math.cos(f['yaw']) * L * t
    y = f['y'] + f['n'] * f['rise'] * t
    return np.hstack([x, z, y])


def centerline():
    """Ligne médiane complète (x, z, y, demi-largeur, type) : 0 sentier, 1 escalier, 2 palier."""
    lo = catmull(LOWER)
    f1 = flight_line(FLIGHT1)
    f2 = flight_line(FLIGHT2)
    land = np.linspace(f1[-1], f2[0], 40)
    up = catmull(UPPER)
    parts = [(lo, 1.15, 0), (f1, 1.3, 1), (land, 1.3, 2), (f2, 1.25, 1), (up, 1.1, 0)]
    rows = []
    for arr, w, k in parts:
        rows.append(np.hstack([arr, np.full((len(arr), 1), w), np.full((len(arr), 1), k)]))
    c = np.vstack(rows)
    # abscisse curviligne
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(c[:, :2], axis=0), axis=1))]
    return c, d


# ------------------------------------------------------------------------------------------------ paroi
# La paroi suit le sentier côté est : pied à `strip` m du bord, hauteur H (m) selon z.
def _pchip(xs, ys):
    from scipy.interpolate import PchipInterpolator
    f = PchipInterpolator(xs, ys, extrapolate=False)
    return lambda z: np.nan_to_num(f(np.clip(z, xs[0], xs[-1])))


_STRIP = _pchip([-60, -30, -16, -14, 4, 6, 14, 24, 34, 60], [6.0, 3.5, 0.6, 0.12, 0.12, 0.7, 1.8, 2.6, 3.2, 5.0])
_WALLH = _pchip([-60, -34, -26, -18, -8, 0, 8, 16, 26, 34, 60], [0.0, 0.0, 2.5, 9.5, 12.8, 13.0, 11.0, 7.5, 3.2, 0.0, 0.0])


_WALLTH = _pchip([-60, -26, -14, -4, 6, 16, 26, 60], [78.0, 78.0, 80.0, 82.5, 79.0, 76.0, 74.0, 74.0])
WALL_INSIDE = 1.8  # le relief reste à 1,8 m derrière la face de la paroi (il ne perce jamais la roche)


def wall_angle(z):
    """Inclinaison de la face (radians depuis l'horizontale)."""
    return np.radians(_WALLTH(z))


def wall_top_e(z):
    """Distance horizontale (m, depuis le pied) où le relief atteint le haut de la paroi."""
    return wall_height(z) / np.tan(wall_angle(z)) + WALL_INSIDE


def wall_strip(z):
    """Largeur de la bande de sol (blocs, trèfles) entre le bord du sentier et le pied de la paroi."""
    return _STRIP(z)


def wall_height(z):
    return _WALLH(z)


# ------------------------------------------------------------------------------------------------ clairière et flaque
CLEARING = dict(x=-13.5, z=21.0, r=7.5, y=3.55)
PUDDLE = dict(x=-12.6, z=21.6, rx=2.6, rz=1.7, rot=0.35, depth=0.28)
LANTERN = dict(x=-3.4, z=13.6, h=1.7)  # poteau au bord du sentier, côté ouest, à l'approche de l'escalier
SPAWN = dict(x=-4.6, z=29.0, yaw=math.pi)  # yaw = pi : regarde vers le nord (-z)


def puddle_field(X, Z):
    """Distance normalisée à la flaque (<1 dedans), bord déformé par du bruit."""
    c, s = math.cos(PUDDLE['rot']), math.sin(PUDDLE['rot'])
    dx, dz = X - PUDDLE['x'], Z - PUDDLE['z']
    u = (dx * c - dz * s) / PUDDLE['rx']
    v = (dx * s + dz * c) / PUDDLE['rz']
    r = np.sqrt(u * u + v * v)
    return r * (1 + 0.22 * perlin(X * 0.9 + 3.1, Z * 0.9 - 7.7) + 0.08 * perlin(X * 2.7, Z * 2.7))


# ------------------------------------------------------------------------------------------------ relief
class Field:
    """Relief et masques évalués sur des grilles numpy (même fonction pour la zone fine et l'anneau lointain)."""

    def __init__(self):
        from scipy.spatial import cKDTree
        self.c, self.s = centerline()
        self.tree = cKDTree(self.c[:, :2])
        t = np.gradient(self.c[:, :2], axis=0)
        self.t = t / np.linalg.norm(t, axis=1, keepdims=True)
        self._base()

    def _base(self):
        """Hauteur de base lissée loin du sentier : interpolation harmonique (Laplace) des hauteurs du sentier,
        résolue en pyramide sur une grille de 1 m couvrant l'anneau (pas de discontinuité quand le point le plus
        proche du sentier saute d'un tronçon à l'autre)."""
        x0, z0, n, cell = RING['x0'], RING['z0'], 640, 1.0
        self.bx0, self.bz0, self.bcell, self.bn = x0, z0, cell, n
        sol = None
        for lvl in (32, 16, 8, 4, 2, 1):
            m = n // lvl
            cs = cell * lvl
            acc = np.zeros((m, m)); cnt = np.zeros((m, m))
            i = np.clip(((self.c[:, 0] - x0) / cs).astype(int), 0, m - 1)
            j = np.clip(((self.c[:, 1] - z0) / cs).astype(int), 0, m - 1)
            np.add.at(acc, (j, i), self.c[:, 2]); np.add.at(cnt, (j, i), 1)
            fix = cnt > 0
            val = np.where(fix, acc / np.maximum(cnt, 1), 0)
            if sol is None:
                g = np.full((m, m), val[fix].mean())
            else:
                g = np.kron(sol, np.ones((2, 2)))[:m, :m]
            g[fix] = val[fix]
            for _ in range(400 if lvl >= 8 else 160):
                p = np.pad(g, 1, mode='edge')
                g = 0.25 * (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:])
                g[fix] = val[fix]
            sol = g
        self.base = sol

    def base_at(self, X, Z):
        fx = (X - self.bx0) / self.bcell - 0.5
        fz = (Z - self.bz0) / self.bcell - 0.5
        i = np.clip(np.floor(fx).astype(int), 0, self.bn - 2)
        j = np.clip(np.floor(fz).astype(int), 0, self.bn - 2)
        tx = np.clip(fx - i, 0, 1); tz = np.clip(fz - j, 0, 1)
        b = self.base
        return (b[j, i] * (1 - tx) + b[j, i + 1] * tx) * (1 - tz) + (b[j + 1, i] * (1 - tx) + b[j + 1, i + 1] * tx) * tz

    def lateral(self, X, Z):
        """Distance signée au sentier (positive vers l'est = côté paroi) et données du point le plus proche."""
        q = np.stack([X.ravel(), Z.ravel()], 1)
        dist, idx = self.tree.query(q)
        c = self.c[idx]
        t = self.t[idx]
        dx, dz = q[:, 0] - c[:, 0], q[:, 1] - c[:, 1]
        # vers l'est pour un sentier orienté vers le nord : normale = (-tz, tx)
        side = np.sign(dx * (-t[:, 1]) + dz * t[:, 0])
        side[side == 0] = 1
        d = (dist * side).reshape(X.shape)
        return d, c[:, 2].reshape(X.shape), c[:, 3].reshape(X.shape), c[:, 4].reshape(X.shape), c[:, 1].reshape(X.shape)

    def height(self, X, Z, detail=True):
        d, yn, w, kind, zc = self.lateral(X, Z)
        # près du sentier : hauteur exacte du point le plus proche (rampe des marches) ; plus loin : base harmonique
        yc = yn + (self.base_at(X, Z) - yn) * sstep(2.0, 9.0, np.abs(d))
        strip = wall_strip(Z)
        H = wall_height(Z)
        # sentier : légère cuvette d'usure, ornières
        path = yc - 0.05 * (1 - np.clip((d / w) ** 2, 0, 1)) - 0.14 * (kind == 1)
        if detail:
            path += 0.025 * fbm(X * 1.3, Z * 1.3, 3, off=5.0) - 0.03 * sstep(0.4, 1.0, np.abs(perlin(X * 0.35, Z * 2.2)))
        # ouest : pente boisée qui tombe, bosselée (racines, souches anciennes)
        dw = np.maximum(-d - w, 0)
        fall = 0.34 * dw * sstep(0.0, 2.5, dw) + 0.0016 * dw * dw
        west = yc - np.minimum(fall, 3.2 + 0.18 * np.maximum(dw - 9, 0))
        west += 0.55 * fbm(X * 0.06, Z * 0.06, 3, off=1.0) * sstep(1.5, 6, dw)
        # est : bande de sol puis paroi puis plateau / versant qui monte
        e = d - w
        foot = yc + 0.22 * sstep(0, np.maximum(strip, 0.2), e)
        ef = e - strip
        # derrière le pied : le relief monte à WALL_INSIDE m derrière la face (caché dans la roche), puis le plateau
        etop = wall_top_e(Z)
        inside = foot + H * np.clip((ef - WALL_INSIDE) / np.maximum(etop - WALL_INSIDE, 0.05), 0, 1)
        plateau = foot + H + 0.12 * np.maximum(ef - etop, 0) + 0.8 * fbm(X * 0.05, Z * 0.05, 3, off=9.0) * sstep(4, 14, ef - etop)
        east = np.where(ef < etop, inside, plateau)
        h = np.where(d < -w, west, np.where(d > w, east, path))
        # raccord doux sentier/pentes (évite une marche nette au bord)
        edge = sstep(w - 0.35, w + 0.25, np.abs(d))
        h = path * (1 - edge) + h * edge
        # clairière : replat humide à l'ouest du sentier bas
        cl = np.hypot(X - CLEARING['x'], Z - CLEARING['z'])
        k = 1 - sstep(CLEARING['r'] * 0.45, CLEARING['r'], cl)
        h = h * (1 - k) + (CLEARING['y'] + 0.12 * fbm(X * 0.4, Z * 0.4, 2, off=3.0)) * k
        # flaque
        pf = puddle_field(X, Z)
        h -= PUDDLE['depth'] * (1 - sstep(0.55, 1.35, pf))
        if detail:
            # micro-relief du sol forestier (buttes de racines, mottes), plus faible sur le sentier
            m = 0.07 * fbm(X * 0.9, Z * 0.9, 4, off=11.0) + 0.05 * np.maximum(perlin(X * 0.45 + 9, Z * 0.45), 0) ** 2 * 4
            h += m * edge
        return h

    def masks(self, X, Z):
        """Masques du sol : R sentier (terre tassée, cailloux), G mousse, B humidité, A variation de litière."""
        d, yc, w, kind, zc = self.lateral(X, Z)
        strip = wall_strip(Z)
        wob = 0.28 * fbm(X * 0.8, Z * 0.8, 3, off=21.0) + 0.1 * perlin(X * 3.1, Z * 3.1)
        path = 1 - sstep(w * 0.55, w * 1.05 + 0.25, np.abs(d) + wob)
        path *= (kind != 1) * 1.0  # sous l'escalier : rien (la pierre couvre)
        # mousse : pied de paroi (ombre, ruissellement), talus ouest par plaques, bords du sentier, clairière
        e = d - w
        foot = sstep(-0.4, 0.2, e - strip * 0.35) * (1 - sstep(strip + 0.2, strip + 1.5, e))
        patches = sstep(0.05, 0.45, fbm(X * 0.18, Z * 0.18, 4, off=31.0))
        slope_w = sstep(1.0, 3.0, -d - w)
        cl = np.hypot(X - CLEARING['x'], Z - CLEARING['z'])
        clear = 1 - sstep(CLEARING['r'] * 0.6, CLEARING['r'] * 1.1, cl)
        moss = np.clip(foot * 0.85 + patches * slope_w * 0.8 + clear * 0.45 * patches + 0.25 * (1 - path) * sstep(0.5, 0.8, fbm(X * 0.6, Z * 0.6, 3, off=41)), 0, 1)
        moss *= 1 - path * 0.9
        pf = puddle_field(X, Z)
        wet = np.clip(1 - sstep(0.7, 2.1, pf), 0, 1)
        wet = np.maximum(wet, 0.35 * path * sstep(0.45, 0.9, np.abs(perlin(X * 0.35, Z * 2.2))))
        var = 0.5 + 0.5 * fbm(X * 0.11, Z * 0.11, 4, off=51.0)
        return np.clip(np.stack([path, moss, wet, var], -1), 0, 1)


def steps():
    """Marches des deux volées : (x, z avant, y dessus, giron, largeur, lacet, index)."""
    out = []
    for fi, f in enumerate((FLIGHT1, FLIGHT2)):
        for i in range(f['n']):
            zf = f['z'] - math.cos(f['yaw']) * i * f['run']
            xf = f['x'] - math.sin(f['yaw']) * i * f['run']
            out.append(dict(flight=fi, i=i, x=xf, z=zf, y=f['y'] + (i + 1) * f['rise'], run=f['run'], rise=f['rise'],
                            width=f['width'], yaw=f['yaw']))
    return out
