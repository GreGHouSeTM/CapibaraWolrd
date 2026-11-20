# Voies du monde (WAYS de world-map.ts) tracées comme de vraies routes de montagne (spécialité Terrain & relief).
#
# 1. Tracé : chemin de moindre coût sur une grille (8 m pour les voies carrossables, 4 m pour les sentiers) dont l'état
#    porte le cap (32 directions) : coût de pente en long (bornée par nature de voie), de déblai et remblai (bosses le long
#    de l'arête, dévers du versant sous la plateforme), d'eau (ponts seulement aux franchissements prévus, lacs et mer
#    interdits), de falaise, d'éloignement du tracé de la bible ; coût de virage. Les **épingles** sont des arêtes
#    spéciales : demi-tour sur un arc de rayon ≥ 12 m (voiture), placé là où le versant le permet (coût du mur).
# 2. Géométrie : arêtes droites + arcs d'épingle, lissage (sauf arcs et extrémités), contrôle du rayon, rééchantillonnage.
# 3. Profil en long : au plus près du sol, pente bornée, raccords verticaux ; extrémités imposées (fin des couloirs de
#    Capyville, jonctions avec une voie déjà posée).
# 4. Ouvrages : au-delà de 3 m de déblai ou de remblai, le tronçon est un mur de soutènement, un pont ou un viaduc,
#    déclaré dans meta.json (« ouvrages ») pour la spécialité Routes. Sous un pont ou un viaduc, le relief reste naturel.
# 5. Plateforme écrite dans la grille de 2 m par projection exacte sur le tracé (plus d'escaliers du plus proche voisin),
#    talus progressifs raccordés au terrain (33° en remblai, 40° en déblai, 72° le long d'un mur), sans fossé.
# Le ruban des routes (src/world/roads.ts) suit ensuite exactement heightAt, sauf sur les ponts où il suit le tablier.
import math
import numpy as np
from numba import njit
from scipy import ndimage
from scipy.spatial import cKDTree
from common import X0, smoothstep, smax, smin, polyline_dist

GRADE = {'route': 0.08, 'piste': 0.10, 'chemin': 0.12, 'sentier': 0.25}
# grandes voies d'abord : les chemins et sentiers se raccordent ensuite aux voies déjà posées
ORDER = ['route', 'piste', 'chemin', 'sentier']
# départs des voies au bout des couloirs des cols de Capyville (COL_ROUTES de valley.ts)
FROM_COL = {'route-paris': 'paris', 'route-ny': 'newyork', 'route-londres': 'london', 'route-japon': 'japan',
            'piste-desert': 'desert', 'route-pole': 'pole'}
TALUS_FILL, TALUS_CUT, TALUS_WALL = math.tan(math.radians(33)), math.tan(math.radians(40)), math.tan(math.radians(72))
OUVRAGE_MIN = 3.0  # m de déblai ou de remblai au-delà desquels le tronçon devient un ouvrage

# 32 directions : vecteurs primitifs de norme infinie ≤ 3, triés par angle
_V = sorted({(a, b) for a in range(-3, 4) for b in range(-3, 4) if (a, b) != (0, 0) and math.gcd(abs(a), abs(b)) == 1},
            key=lambda v: math.atan2(v[1], v[0]))
DV = np.array(_V, dtype=np.int64)
ND = len(DV)
ANG = np.arctan2(DV[:, 1], DV[:, 0])


def _turn_table(kt):
    TC = np.full((ND, 7), np.inf)
    for d in range(ND):
        for k in range(7):
            e = (d + k - 3) % ND
            th = abs((ANG[e] - ANG[d] + np.pi) % (2 * np.pi) - np.pi)
            if th <= np.radians(41):
                TC[d, k] = kt * th * th
    return TC


@njit(cache=True)
def _bil(A, x, z):
    fx = (x - (-4096.0)) / 2.0
    fz = (z - (-4096.0)) / 2.0
    n = A.shape[0]
    if fx < 0:
        fx = 0.0
    if fz < 0:
        fz = 0.0
    if fx > n - 1.001:
        fx = n - 1.001
    if fz > n - 1.001:
        fz = n - 1.001
    i = int(fx)
    j = int(fz)
    tx = fx - i
    tz = fz - j
    return (A[j, i] * (1 - tx) + A[j, i + 1] * tx) * (1 - tz) + (A[j + 1, i] * (1 - tx) + A[j + 1, i + 1] * tx) * tz


@njit(cache=True)
def _edge_costs(hs, riv, lake, cliff, valley, attr, gx0, gz0, cell, nx, nz, DVv, gmax, hw, sx, sz, ex, ez, XS, XR):
    """Coût (par arête) de chaque nœud vers ses 32 voisins ; inf = interdit."""
    D = DVv.shape[0]
    C = np.full((nz, nx, D), np.inf, dtype=np.float32)
    for j in range(nz):
        for i in range(nx):
            x0 = gx0 + i * cell
            z0 = gz0 + j * cell
            at = attr[j, i]
            for d in range(D):
                a = DVv[d, 0]
                b = DVv[d, 1]
                ii = i + a
                jj = j + b
                if ii < 0 or jj < 0 or ii >= nx or jj >= nz:
                    continue
                x1 = gx0 + ii * cell
                z1 = gz0 + jj * cell
                L = math.sqrt(float(a * a + b * b)) * cell
                K = int(L / 4.0) + 2
                h0 = _bil(hs, x0, z0)
                h1 = _bil(hs, x1, z1)
                dev = 0.0
                wmax = 0.0
                cl = 0.0
                bad = False
                for k in range(K + 1):
                    t = k / K
                    x = x0 + (x1 - x0) * t
                    z = z0 + (z1 - z0) * t
                    h = _bil(hs, x, z)
                    if h < 0.4 or _bil(lake, x, z) > 0.5:
                        bad = True
                        break
                    if _bil(valley, x, z) > 0.5 and (x - sx) ** 2 + (z - sz) ** 2 > 80.0 ** 2:
                        bad = True
                        break
                    e = abs(h - (h0 + (h1 - h0) * t))
                    if e > dev:
                        dev = e
                    w = _bil(riv, x, z)
                    if w > wmax:
                        wmax = w
                    cl += _bil(cliff, x, z)
                if bad:
                    continue
                cl /= K + 1
                g = abs(h1 - h0) / L
                xm = 0.5 * (x0 + x1)
                zm = 0.5 * (z0 + z1)
                # franchissement prévu (pont, gué, viaduc) : la voie passe tout droit, le relief dessous ne compte pas
                cross = False
                for c in range(XS.shape[0]):
                    if (xm - XS[c, 0]) ** 2 + (zm - XS[c, 1]) ** 2 < XR[c] ** 2:
                        cross = True
                if cross:
                    if g > 1.4 * gmax:
                        continue
                    C[j, i, d] = L * (1.6 + at)
                    continue
                # abords immédiats des extrémités imposées (fin de couloir, jonction) : la plateforme y sera taillée
                free = (xm - sx) ** 2 + (zm - sz) ** 2 < 60.0 ** 2 or (xm - ex) ** 2 + (zm - ez) ** 2 < 60.0 ** 2
                if not free and (g > 1.35 * gmax or dev > 7.0):
                    continue
                cost = 1.0 + at
                if g > 0.6 * gmax:
                    u = (g - 0.6 * gmax) / (0.4 * gmax)
                    cost += 3.0 * u * u
                if dev > 1.5:
                    cost += 0.5 * (dev - 1.5) ** 2
                # dévers : déblai ou remblai au bord de la plateforme sur un versant de pente S
                gxm = (_bil(hs, xm + 2.0, zm) - _bil(hs, xm - 2.0, zm)) / 4.0
                gzm = (_bil(hs, xm, zm + 2.0) - _bil(hs, xm, zm - 2.0)) / 4.0
                S2 = gxm * gxm + gzm * gzm
                Sc = math.sqrt(max(S2 - g * g, 0.0))
                eh = hw * Sc
                if eh > 2.5:
                    cost += 0.8 * (eh - 2.5) ** 2
                if Sc > 1.11:
                    cost += 15.0
                cost += 6.0 * cl
                # rivière hors des franchissements prévus : pont non prévu, très cher
                if wmax > 0.3:
                    cost += 40.0 * wmax
                C[j, i, d] = L * cost
    return C


@njit(cache=True)
def _hairpin_costs(hs, riv, lake, valley, attr, gx0, gz0, cell, nx, nz, DVv, HOFF, gmax, Rmin, H0, sx, sz):
    """Coût d'une épingle depuis (nœud, cap) vers le nœud décalé de 2R sur le côté, cap opposé ; inf = impossible."""
    D = DVv.shape[0]
    C = np.full((nz, nx, D, 2), np.inf, dtype=np.float32)
    for j in range(nz):
        for i in range(nx):
            x0 = gx0 + i * cell
            z0 = gz0 + j * cell
            at = attr[j, i]
            for d in range(D):
                ux = DVv[d, 0] / math.sqrt(float(DVv[d, 0] ** 2 + DVv[d, 1] ** 2))
                uz = DVv[d, 1] / math.sqrt(float(DVv[d, 0] ** 2 + DVv[d, 1] ** 2))
                for side in range(2):
                    oi = HOFF[d, side, 0]
                    oj = HOFF[d, side, 1]
                    ii = i + oi
                    jj = j + oj
                    if ii < 0 or jj < 0 or ii >= nx or jj >= nz:
                        continue
                    x1 = gx0 + ii * cell
                    z1 = gz0 + jj * cell
                    R = 0.5 * math.sqrt((x1 - x0) ** 2 + (z1 - z0) ** 2)
                    if R < Rmin:
                        continue
                    cx = 0.5 * (x0 + x1)
                    cz = 0.5 * (z0 + z1)
                    nxv = (x1 - x0) / (2 * R)
                    nzv = (z1 - z0) / (2 * R)
                    h0 = _bil(hs, x0, z0)
                    h1 = _bil(hs, x1, z1)
                    Larc = math.pi * R
                    g = abs(h1 - h0) / Larc
                    if g > 1.2 * gmax:
                        continue
                    dev = 0.0
                    bad = False
                    for k in range(13):
                        ph = math.pi * k / 12
                        x = cx - R * math.cos(ph) * nxv + R * math.sin(ph) * ux
                        z = cz - R * math.cos(ph) * nzv + R * math.sin(ph) * uz
                        # la plateforme déborde de l'arc : on regarde aussi le bord extérieur
                        for f in (1.0, 1.35):
                            xx = cx + (x - cx) * f
                            zz = cz + (z - cz) * f
                            h = _bil(hs, xx, zz)
                            if h < 0.4 or _bil(lake, xx, zz) > 0.5 or _bil(riv, xx, zz) > 0.3:
                                bad = True
                            if _bil(valley, xx, zz) > 0.5 and (xx - sx) ** 2 + (zz - sz) ** 2 > 80.0 ** 2:
                                bad = True
                            e = abs(h - (h0 + (h1 - h0) * k / 12))
                            if e > dev:
                                dev = e
                    if bad or dev > 14.0:
                        continue
                    C[j, i, d, side] = Larc * (1.0 + at) + H0 + 2.0 * max(0.0, dev - 2.5) ** 2
    return C


@njit(cache=True)
def _heap_push(hk, hv, pos, n, key, val):
    i = n
    hk[i] = key
    hv[i] = val
    pos[val] = i
    while i > 0:
        p = (i - 1) >> 1
        if hk[p] <= hk[i]:
            break
        hk[p], hk[i] = hk[i], hk[p]
        hv[p], hv[i] = hv[i], hv[p]
        pos[hv[i]] = i
        pos[hv[p]] = p
        i = p
    return n + 1


@njit(cache=True)
def _heap_decrease(hk, hv, pos, i, key):
    hk[i] = key
    while i > 0:
        p = (i - 1) >> 1
        if hk[p] <= hk[i]:
            break
        hk[p], hk[i] = hk[i], hk[p]
        hv[p], hv[i] = hv[i], hv[p]
        pos[hv[i]] = i
        pos[hv[p]] = p
        i = p


@njit(cache=True)
def _heap_pop(hk, hv, pos, n):
    v = hv[0]
    pos[v] = -2
    n -= 1
    if n > 0:
        hk[0] = hk[n]
        hv[0] = hv[n]
        pos[hv[0]] = 0
        i = 0
        while True:
            l = 2 * i + 1
            r = l + 1
            m = i
            if l < n and hk[l] < hk[m]:
                m = l
            if r < n and hk[r] < hk[m]:
                m = r
            if m == i:
                break
            hk[m], hk[i] = hk[i], hk[m]
            hv[m], hv[i] = hv[i], hv[m]
            pos[hv[i]] = i
            pos[hv[m]] = m
            i = m
    return v, n


@njit(cache=True)
def _dijkstra(CE, CH, HOFF, DVv, TC, nx, nz, starts, gi, gj, gr):
    D = DVv.shape[0]
    NS = nx * nz * D
    dist = np.full(NS, np.inf)
    pred = np.full(NS, -1, dtype=np.int64)
    hp = np.zeros(NS, dtype=np.int8)
    pos = np.full(NS, -1, dtype=np.int64)
    hk = np.empty(NS, dtype=np.float64)
    hv = np.empty(NS, dtype=np.int64)
    n = 0
    for s in starts:
        dist[s] = 0.0
        n = _heap_push(hk, hv, pos, n, 0.0, s)
    while n > 0:
        s, n = _heap_pop(hk, hv, pos, n)
        node = s // D
        d = s % D
        j = node // nx
        i = node % nx
        if (i - gi) ** 2 + (j - gj) ** 2 <= gr * gr:
            return s, dist[s], pred, hp
        ds = dist[s]
        for k in range(7):
            tc = TC[d, k]
            if tc == np.inf:
                continue
            e = (d + k - 3) % D
            ce = CE[j, i, e]
            if ce == np.inf:
                continue
            ii = i + DVv[e, 0]
            jj = j + DVv[e, 1]
            ns = (jj * nx + ii) * D + e
            nd = ds + ce + tc
            if nd < dist[ns]:
                dist[ns] = nd
                pred[ns] = s
                hp[ns] = 0
                if pos[ns] >= 0:
                    _heap_decrease(hk, hv, pos, pos[ns], nd)
                elif pos[ns] == -1:
                    n = _heap_push(hk, hv, pos, n, nd, ns)
        for side in range(2):
            ch = CH[j, i, d, side]
            if ch == np.inf:
                continue
            ii = i + HOFF[d, side, 0]
            jj = j + HOFF[d, side, 1]
            e = (d + D // 2) % D
            ns = (jj * nx + ii) * D + e
            nd = ds + ch
            if nd < dist[ns]:
                dist[ns] = nd
                pred[ns] = s
                hp[ns] = 1
                if pos[ns] >= 0:
                    _heap_decrease(hk, hv, pos, pos[ns], nd)
                elif pos[ns] == -1:
                    n = _heap_push(hk, hv, pos, n, nd, ns)
    return -1, np.inf, pred, hp


def _hairpin_offsets(cell, R):
    H = np.zeros((ND, 2, 2), dtype=np.int64)
    for d in range(ND):
        u = DV[d] / np.hypot(*DV[d])
        for side, nrm in enumerate(((-u[1], u[0]), (u[1], -u[0]))):
            best = None
            for f in (1.0, 1.1, 1.2, 1.3, 0.95):
                o = np.round(np.array(nrm) * 2 * R * f / cell).astype(np.int64)
                L = np.hypot(*o) * cell
                if L >= 2 * R * 0.999 and (best is None or L < best[1]):
                    best = (o, L)
            H[d, side] = best[0]
    return H


@njit(cache=True)
def clamp_grade(y, ds, g, pin0, pin1, y0, y1):
    n = len(y)
    if pin0:
        y[0] = y0
    for i in range(1, n):
        y[i] = min(max(y[i], y[i - 1] - g * ds[i - 1]), y[i - 1] + g * ds[i - 1])
    if pin1:
        y[n - 1] = y1
    for i in range(n - 2, -1, -1):
        y[i] = min(max(y[i], y[i + 1] - g * ds[i]), y[i + 1] + g * ds[i])
    if pin0 and abs(y[0] - y0) > 1e-6:
        y[0] = y0
        for i in range(1, n):
            y[i] = min(max(y[i], y[i - 1] - g * ds[i - 1]), y[i - 1] + g * ds[i - 1])
    return y


def fit_profile(p, s, g, pin0=None, pin1=None, iters=60):
    """Profil au plus près du sol p(s) à pente ≤ g, extrémités éventuellement imposées, raccords verticaux doux."""
    ds = np.diff(s)
    y = ndimage.uniform_filter1d(p, 7, mode='nearest')
    a0, a1 = pin0 is not None, pin1 is not None
    v0, v1 = (pin0 or 0.0), (pin1 or 0.0)
    for _ in range(iters):
        f = clamp_grade(y.copy(), ds, g, a0, a1, v0, v1)
        y = f + 0.2 * (p - f)
    y = clamp_grade(y, ds, g, a0, a1, v0, v1)
    # raccords verticaux (paraboles d'environ 20 m) puis pente re-bornée
    for _ in range(3):
        y = ndimage.uniform_filter1d(y, 9, mode='nearest')
        y = clamp_grade(y, ds, g * 0.995, a0, a1, v0, v1)
    return y


def resample(P, step):
    seg = np.hypot(*(P[1:] - P[:-1]).T)
    keep = np.concatenate([[True], seg > 1e-6])
    P = P[keep]
    seg = np.hypot(*(P[1:] - P[:-1]).T)
    S = np.concatenate([[0], np.cumsum(seg)])
    s = np.append(np.arange(0, S[-1], step), S[-1]) if S[-1] > step else np.array([0, S[-1]])
    return np.stack([np.interp(s, S, P[:, 0]), np.interp(s, S, P[:, 1])], 1), s


def radius(P, q=3):
    R = np.full(len(P), np.inf)
    if len(P) > 2 * q:
        a, b, c = P[:-2 * q], P[q:-q], P[2 * q:]
        ab, bc, ca = np.hypot(*(b - a).T), np.hypot(*(c - b).T), np.hypot(*(a - c).T)
        cr = np.abs((b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0]))
        R[q:-q] = np.where(cr > 1e-9, ab * bc * ca / np.maximum(2 * cr, 1e-12), np.inf)
    return R


def smooth_path(P, fixed, iters, lam=0.5):
    P = P.copy()
    free = ~fixed
    free[0] = free[-1] = False
    for _ in range(iters):
        Q = P.copy()
        Q[1:-1] = P[1:-1] + lam * (0.5 * (P[:-2] + P[2:]) - P[1:-1])
        P[free] = Q[free]
    return P


class Planner:
    def __init__(self, h2, hs, riv, lake, cliff, valley, W, log):
        self.h2, self.hs, self.riv, self.lake, self.cliff, self.valley = h2, hs, riv, lake, cliff, valley
        self.W, self.log = W, log
        self.TC = {}

    def plan(self, way, anchors, start_heading, gmax, hw, cell, Rmin, corridor):
        """Tracé sans recoupement : si le chemin de moindre coût se recoupe (spirale) ou se longe à moins d'une
        plateforme, la zone du second passage est pénalisée et on recommence (trois fois au plus)."""
        bans = []
        res = None
        for it in range(4):
            res = self._plan(way, anchors, start_heading, gmax, hw, cell, Rmin, corridor, bans)
            if res is None:
                return None
            P, s, F = res
            tr = cKDTree(P)
            gap = 2 * hw + 3.0
            bad = []
            for i, j in tr.query_pairs(gap):
                if abs(s[i] - s[j]) > max(6 * Rmin, 4 * gap):
                    bad.append(P[max(i, j)])
            if not bad:
                return res
            B = np.asarray(bad)
            keep = [B[0]]
            for b in B[1:]:
                if min(np.hypot(*(np.asarray(keep) - b).T)) > 15:
                    keep.append(b)
            bans += keep
            self.log(f"  {way['id']} : recoupement du tracé ({len(keep)} zones), nouveau calcul")
        return res

    def _plan(self, way, anchors, start_heading, gmax, hw, cell, Rmin, corridor, bans):
        """Chemin de moindre coût passant par les ancres ; renvoie la polyligne (pas de 2 m) et le masque des arcs d'épingle."""
        A = np.asarray(anchors, dtype=np.float64)
        allp = np.vstack([A, np.asarray(corridor)])
        pad = 450.0 if cell >= 8 else 300.0
        gx0 = math.floor((allp[:, 0].min() - pad) / cell) * cell
        gz0 = math.floor((allp[:, 1].min() - pad) / cell) * cell
        nx = int((allp[:, 0].max() + pad - gx0) / cell) + 1
        nz = int((allp[:, 1].max() + pad - gz0) / cell) + 1
        gx0 = max(gx0, -4090.0)
        gz0 = max(gz0, -4090.0)
        nx = min(nx, int((4090 - gx0) / cell))
        nz = min(nz, int((4090 - gz0) / cell))
        gx = gx0 + np.arange(nx) * cell
        gz = gz0 + np.arange(nz) * cell
        GX, GZ = np.meshgrid(gx.astype(np.float32), gz.astype(np.float32))
        dco = polyline_dist(GX, GZ, [list(p) for p in corridor])[0]
        attr = np.minimum(0.35 * np.maximum(0, (dco - 120) / 120) ** 2, 4.0).astype(np.float64)
        for bx, bz in bans:
            attr += 30.0 * smoothstep(2 * hw + 14, 2 * hw + 4, np.hypot(GX - bx, GZ - bz))
        XS = np.array([[c['x'], c['z']] for c in self.W['CROSSINGS'] if c.get('way') == way['id']] or [[1e9, 1e9]], dtype=np.float64)
        XR = np.array([max(30.0, c.get('length', 20) * 0.6 + 15) for c in self.W['CROSSINGS'] if c.get('way') == way['id']] or [1.0], dtype=np.float64)
        sx, sz = A[0]
        ex, ez = A[-1]
        CE = _edge_costs(self.hs, self.riv, self.lake, self.cliff, self.valley, attr, gx0, gz0, cell, nx, nz, DV, gmax, hw, sx, sz, ex, ez, XS, XR)
        HOFF = _hairpin_offsets(cell, Rmin * 1.08)
        CH = _hairpin_costs(self.hs, self.riv, self.lake, self.valley, attr, gx0, gz0, cell, nx, nz, DV, HOFF, gmax, Rmin, 45.0 if cell >= 8 else 12.0, sx, sz)
        kt = 30.0 if cell >= 8 else 8.0
        TC = self.TC.setdefault(kt, _turn_table(kt))
        pieces, hpmask = [], []
        nhp_total = 0
        heading = start_heading
        for k in range(len(A) - 1):
            a, b = A[k], A[k + 1]
            ai, aj = int(round((a[0] - gx0) / cell)), int(round((a[1] - gz0) / cell))
            bi, bj = int(round((b[0] - gx0) / cell)), int(round((b[1] - gz0) / cell))
            node = aj * nx + ai
            if heading is None:
                starts = np.array([node * ND + d for d in range(ND)], dtype=np.int64)
            else:
                ang = math.atan2(heading[1], heading[0])
                dd = np.abs((ANG - ang + np.pi) % (2 * np.pi) - np.pi)
                starts = np.array([node * ND + d for d in np.argsort(dd)[:3]], dtype=np.int64)
            s, cost, pred, hp = _dijkstra(CE, CH, HOFF, DV, TC, nx, nz, starts, bi, bj, 2)
            if s < 0:
                # diagnostic : point atteint le plus proche du but
                reach = np.nonzero(pred.reshape(-1, ND).max(1) >= 0)[0]
                if len(reach):
                    ri, rj = reach % nx, reach // nx
                    kk = int(np.argmin((ri - bi) ** 2 + (rj - bj) ** 2))
                    self.log(f"  {way['id']} : tronçon {k} ({a[0]:.0f}, {a[1]:.0f}) → ({b[0]:.0f}, {b[1]:.0f}) impossible à {100 * gmax:.0f} % ; "
                             f"point atteint le plus proche ({gx0 + ri[kk] * cell:.0f}, {gz0 + rj[kk] * cell:.0f})")
                return None
            chain = []
            while s >= 0:
                chain.append((s, int(hp[s])))
                s = pred[s]
            chain.reverse()
            nhp_total += sum(c[1] for c in chain)
            pts, fx = [], []
            for idx, (st, ishp) in enumerate(chain):
                node, d = st // ND, st % ND
                p = np.array([gx0 + (node % nx) * cell, gz0 + (node // nx) * cell])
                if idx == 0:
                    pts.append(p)
                    fx.append(True)
                    continue
                q0 = pts[-1]
                if ishp:
                    # arc d'épingle : demi-cercle tangent au cap entrant (approché par une courbe de Bézier cubique)
                    dprev = chain[idx - 1][0] % ND
                    u = DV[dprev] / np.hypot(*DV[dprev])
                    R = np.hypot(*(p - q0)) / 2
                    c1, c2 = q0 + u * R * 4 / 3, p + u * R * 4 / 3
                    for t in np.linspace(0, 1, max(8, int(math.pi * R / 2)))[1:]:
                        pts.append((1 - t) ** 3 * q0 + 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t * t * c2 + t ** 3 * p)
                        fx.append(True)
                else:
                    L = np.hypot(*(p - q0))
                    for t in np.linspace(0, 1, max(2, int(L / 2)) + 1)[1:]:
                        pts.append(q0 + (p - q0) * t)
                        fx.append(False)
            pts[0] = a
            pts[-1] = b
            fx[-1] = True
            if pieces:
                pts, fx = pts[1:], fx[1:]
            pieces += pts
            hpmask += fx
            last = chain[-1][0] % ND
            heading = (float(DV[last][0]), float(DV[last][1]))
        P = np.asarray(pieces)
        F = np.asarray(hpmask)
        # lissage (les arcs d'épingle restent tels quels, leurs abords se raccordent)
        self.last_hp = nhp_total
        P = smooth_path(P, F, 160 if cell >= 8 else 40)
        P, s = resample(P, 2.0)
        # rayon minimal : lissage local supplémentaire là où il manque
        Fd = np.zeros(len(P), bool)
        if F.any():
            tr = cKDTree(np.asarray(pieces)[F])
            Fd = tr.query(P, distance_upper_bound=1.0)[0] < 1.0
        for _ in range(6):
            R = radius(P)
            low = (R < Rmin) & ~Fd
            if not low.any():
                break
            grow = ndimage.binary_dilation(low, iterations=8)
            P = smooth_path(P, ~grow, 20)
        return P, s, Fd


def proj_s(pts, p):
    """Abscisse curviligne de la projection de p sur la polyligne pts."""
    best, sb, acc = 1e18, 0.0, 0.0
    for a, b in zip(pts[:-1], pts[1:]):
        vx, vz = b[0] - a[0], b[1] - a[1]
        l2 = vx * vx + vz * vz or 1e-9
        t = min(1, max(0, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / l2))
        d = math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vz * t)
        if d < best:
            best, sb = d, acc + t * math.sqrt(l2)
        acc += math.sqrt(l2)
    return sb


def way_anchors(w, W, planned, colends):
    """Ancres d'une voie : départ (fin de couloir ou jonction), cols, villages, franchissements prévus, arrivée."""
    pts = [list(p) for p in w['pts']]
    head = None
    pin0 = pin1 = None
    if w['id'] in FROM_COL:
        ce = colends[FROM_COL[w['id']]]
        pts[0] = list(ce['pt'])
        head = ce['dir']
        pin0 = ce['y']

    def snap(p):
        best = None
        for o in planned.values():
            for q in o['orig']:
                if math.hypot(q[0] - p[0], q[1] - p[1]) < 25:
                    k = int(np.argmin(np.hypot(*(o['P'] - np.asarray(p)).T)))
                    return list(o['P'][k]), float(o['y'][k])
        return best

    if w['id'] not in FROM_COL:
        sn = snap(pts[0])
        if sn:
            pts[0], pin0 = sn
    sn = snap(pts[-1])
    if sn:
        pts[-1], pin1 = sn
    via = []
    for p in pts[1:-1]:
        keep = False
        for s in W['SETTLEMENTS']:
            if math.hypot(p[0] - s['x'], p[1] - s['z']) < max(40, s['r'] * 0.6):
                keep = True
        for c in W['WORLD_COLS']:
            if math.hypot(p[0] - c['x'], p[1] - c['z']) < max(40, c['width'] * 0.6):
                keep = True
        for x in W['CROSSINGS']:
            if x.get('way') == w['id'] and math.hypot(p[0] - x['x'], p[1] - x['z']) < 40:
                keep = True
        if keep:
            via.append(p)
    # franchissements prévus qui ne sont pas des sommets du tracé : on y passe aussi, dans l'ordre du tracé d'origine
    mid = list(via)
    for x in W['CROSSINGS']:
        if x.get('way') == w['id'] and not any(math.hypot(x['x'] - p[0], x['z'] - p[1]) < 40 for p in [pts[0], pts[-1]] + mid):
            mid.append([x['x'], x['z']])
    mid.sort(key=lambda p: proj_s(w['pts'], p))
    seq = [pts[0]] + mid + [pts[-1]]
    return seq, head, pin0, pin1


def profile_and_works(w, P, s, h2, riv, gmax, pin0, pin1, XS):
    """Profil en long et ouvrages (murs, ponts, viaducs) d'un tracé."""
    fi, fj = (P[:, 0] - X0) / 2.0, (P[:, 1] - X0) / 2.0
    p = ndimage.map_coordinates(h2, [fj, fi], order=1, mode='nearest')
    wet = ndimage.map_coordinates(riv, [fj, fi], order=1, mode='nearest') > 0.3
    near_x = np.zeros(len(P), bool)
    for x, z, r in XS:
        near_x |= np.hypot(P[:, 0] - x, P[:, 1] - z) < r
    # au-dessus de l'eau et dans les franchissements prévus, le profil cherche les berges (pont)
    span = wet | near_x
    pb = p.copy()
    if span.any() and (~span).sum() > 2:
        pb = np.where(span, np.interp(s, s[~span], p[~span]), p)
    y = fit_profile(pb, s, gmax, pin0, pin1)
    works = []
    lab, nl = ndimage.label(np.abs(y - p) > OUVRAGE_MIN)
    for k in range(1, nl + 1):
        idx = np.nonzero(lab == k)[0]
        i0, i1 = max(0, idx[0] - 1), min(len(s) - 1, idx[-1] + 1)
        seg = slice(i0, i1 + 1)
        fill = float((y[seg] - p[seg]).max())
        cut = float((p[seg] - y[seg]).max())
        over_water = bool(span[seg].any())
        L = float(s[i1] - s[i0])
        if fill >= cut:
            kind = 'pont' if over_water else ('viaduc' if fill > 9 or L > 120 else 'mur-remblai')
            if over_water and (fill > 12 or L > 60):
                kind = 'viaduc'
        else:
            kind = 'tunnel' if cut > 12 and L > 40 else 'mur-deblai'
        works.append({'way': w['id'], 'kind': kind, 's0': round(float(s[i0]), 1), 's1': round(float(s[i1]), 1),
                      'hmax': round(max(fill, cut), 1), 'from': np.round(P[i0], 1).tolist(), 'to': np.round(P[i1], 1).tolist()})
    # sur les ponts et viaducs, le tablier va droit d'une culée à l'autre (si la pente le permet)
    for o in works:
        if o['kind'] in ('pont', 'viaduc'):
            i0, i1 = int(np.searchsorted(s, o["s0"])), min(len(s) - 1, int(np.searchsorted(s, o["s1"])))
            if i1 > i0 and abs(y[i1] - y[i0]) / max(s[i1] - s[i0], 1) <= gmax:
                y[i0:i1 + 1] = np.linspace(y[i0], y[i1], i1 - i0 + 1)
    return y, p, works


def stamp(h, nat, roads, keep):
    """Écrit les plateformes et leurs talus dans la grille de 2 m (projection exacte sur chaque tracé)."""
    n = h.shape[0]
    plat = []
    for r in roads:
        P, y, hw = r['P'], r['y'], r['hw']
        S = r['s']
        bridge = np.zeros(len(P), bool)
        wall = np.zeros(len(P), bool)
        for o in r['works']:
            m = (S >= o['s0'] - 2) & (S <= o['s1'] + 2)
            if o['kind'] in ('pont', 'viaduc'):
                bridge |= (S > o['s0'] + 3) & (S < o['s1'] - 3)
            else:
                wall |= m
        fall = hw + 34
        i0 = max(0, int((P[:, 0].min() - fall - X0) / 2)); i1 = min(n, int((P[:, 0].max() + fall - X0) / 2) + 2)
        j0 = max(0, int((P[:, 1].min() - fall - X0) / 2)); j1 = min(n, int((P[:, 1].max() + fall - X0) / 2) + 2)
        XX, ZZ = np.meshgrid(X0 + np.arange(i0, i1) * 2.0, X0 + np.arange(j0, j1) * 2.0)
        q = np.stack([XX.ravel(), ZZ.ravel()], 1)
        dist, k = cKDTree(P).query(q, distance_upper_bound=fall + 3)
        ok = np.isfinite(dist)
        q, k = q[ok], k[ok]
        # projection exacte sur le segment voisin le plus proche (avant ou après le point le plus proche)
        best = np.full(len(q), np.inf); yy = np.zeros(len(q)); bb = np.zeros(len(q), bool); ww = np.zeros(len(q), bool)
        for off in (-1, 0):
            a = np.clip(k + off, 0, len(P) - 2)
            A, B = P[a], P[a + 1]
            v = B - A
            t = np.clip(((q - A) * v).sum(1) / np.maximum((v * v).sum(1), 1e-9), 0, 1)
            d = np.hypot(*(q - A - v * t[:, None]).T)
            sel = d < best
            best = np.where(sel, d, best)
            yy = np.where(sel, y[a] + (y[a + 1] - y[a]) * t, yy)
            bb = np.where(sel, bridge[a] & bridge[a + 1], bb)
            ww = np.where(sel, wall[a] | wall[a + 1], ww)
        plat.append((j0, j1, i0, i1, ok, best, yy, bb, ww, hw))
    # 1. talus de chaque voie (cône de pente bornée autour de la plateforme), raccord arrondi au terrain naturel
    for (j0, j1, i0, i1, ok, d, yy, bb, ww, hw) in plat:
        sub = h[j0:j1, i0:i1].ravel()
        cur = sub[ok]
        e = np.maximum(d - hw, 0)
        kc = np.where(ww, TALUS_WALL, TALUS_CUT)
        kf = np.where(ww, TALUS_WALL, TALUS_FILL)
        lo, hi = yy - kf * e, yy + kc * e
        # cône borné par les talus, raccord arrondi (sur ~1,5 m) au pied et en tête de talus
        new = smin(smax(cur, lo, 1.5), hi, 1.5)
        far = (cur > lo + 1.5) & (cur < hi - 1.5)
        new = np.where(far, cur, new)
        new = np.where(bb, cur, new)
        kp = keep[j0:j1, i0:i1].ravel()[ok]
        sub[ok] = cur + (new - cur) * (1 - kp)
        h[j0:j1, i0:i1] = sub.reshape(j1 - j0, i1 - i0)
    # 2. plateformes (les grandes voies, posées en dernier, l'emportent aux carrefours)
    for (j0, j1, i0, i1, ok, d, yy, bb, ww, hw) in reversed(plat):
        sub = h[j0:j1, i0:i1].ravel()
        cur = sub[ok]
        w = smoothstep(hw + 0.6, hw - 0.4, d) * (~bb)
        kp = keep[j0:j1, i0:i1].ravel()[ok]
        sub[ok] = cur + (yy - cur) * w * (1 - kp)
        h[j0:j1, i0:i1] = sub.reshape(j1 - j0, i1 - i0)
    return h


def stamp_ways(h, W, cell, keep, log, water=None, lake=None, cliff=None, valley=None, colroutes=None):
    """Trace et pose toutes les voies ; renvoie la grille et les voies (meta.ways) et ouvrages (meta.ouvrages)."""
    nat = h.copy()
    hs = ndimage.gaussian_filter(h, 1.5)
    riv = water if water is not None else np.zeros_like(h)
    lake = lake if lake is not None else np.zeros_like(h)
    cliff = cliff if cliff is not None else np.zeros_like(h)
    valley = valley if valley is not None else keep
    pl = Planner(h, hs.astype(np.float64), riv.astype(np.float64), lake.astype(np.float64), cliff.astype(np.float64), valley.astype(np.float64), W, log)
    colends = {}
    for rt in (colroutes or []):
        a, b = np.asarray(rt['pts'][-2]), np.asarray(rt['pts'][-1])
        u = (b - a) / np.linalg.norm(b - a)
        colends[rt['axis']] = {'pt': b.tolist(), 'dir': (float(u[0]), float(u[1])), 'y': float(rt['y'][-1])}
    ways = [w for w in W['WAYS'] if w['kind'] in GRADE]
    ways.sort(key=lambda w: ORDER.index(w['kind']))
    planned, roads, out, works_all = {}, [], [], []
    for w in ways:
        # les sentiers de la couronne de Capyville (vallée imposée) ne sont pas retracés
        if w['kind'] == 'sentier' and any(math.hypot(*p) < 700 for p in w['pts']):
            continue
        g = GRADE[w['kind']]
        veh = w['kind'] != 'sentier'
        Wr = 9.0 if w['kind'] == 'route' else w['width'] + 1.0  # largeur du ruban (src/world/roads.ts)
        hw = 0.56 * Wr + 1.0 if veh else w['width'] / 2 + 0.5
        cellw = 8.0 if veh else 4.0
        Rmin = 12.0 if veh else 3.5
        anchors, head, pin0, pin1 = way_anchors(w, W, planned, colends)
        res = None
        for relax in (1.0, 1.3, 1.7, 2.4):
            res = pl.plan(w, anchors, head, g * relax, hw, cellw, Rmin, w['pts'])
            if res is not None:
                break
        if res is None:
            log(f"voie {w['id']} : aucun tracé trouvé (gardée hors de la grille)")
            continue
        P, s, F = res
        XS = [(c['x'], c['z'], max(30.0, c.get('length', 20) * 0.6 + 15)) for c in W['CROSSINGS'] if c.get('way') == w['id']]
        y, p, works = profile_and_works(w, P, s, nat, riv, g * (relax if relax > 1 else 1.0), pin0, pin1, XS)
        planned[w['id']] = {'P': P, 'y': y, 'orig': w['pts']}
        roads.append({'P': P, 's': s, 'y': y, 'hw': hw, 'works': works, 'id': w['id']})
        works_all += works
        k = slice(None, None, 2)
        out.append({'id': w['id'], 'kind': w['kind'], 'surface': w['surface'], 'width': w['width'], 'vehicles': w['vehicles'],
                    'pts': np.round(P[k], 2).tolist() + ([np.round(P[-1], 2).tolist()] if (len(P) - 1) % 2 else []),
                    'y': np.round(y[k], 2).tolist() + ([round(float(y[-1]), 2)] if (len(P) - 1) % 2 else [])})
        gr = np.abs(np.diff(y)) / np.maximum(np.diff(s), 1e-6)
        R = radius(P)
        nhp = pl.last_hp
        log(f"voie {w['id']} : {s[-1]:.0f} m (bible {sum(math.hypot(b[0]-a[0], b[1]-a[1]) for a, b in zip(w['pts'][:-1], w['pts'][1:])):.0f} m), "
            f"pente max {100 * gr.max():.1f} % (cible {100 * g:.0f} %{', relâchée ×' + str(relax) if relax > 1 else ''}), "
            f"écart au sol max {float(np.abs(y - p).max()):.1f} m, épingles {nhp}, rayon min {float(R.min()):.1f} m, ouvrages {len(works)}")
    h = stamp(h, nat, roads, keep)
    return h, out, works_all
