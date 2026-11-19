# Voies du monde (WAYS de world-map.ts) posées sur le relief : profil en long à pente bornée, plateforme plate,
# talus de déblai et de remblai à 33° au plus (spécialité Terrain & relief ; les rubans et les ponts restent aux Routes).
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree
from common import X0

# pente maximale en long par nature de voie (bible §4.3 et §7.1) et déblai / remblai admis (m) : au-delà, le tracé
# de world-map.ts demande des lacets (à poser par les Routes) ; on ne creuse pas de tranchée dans les montagnes.
MAX_GRADE = {'route': 0.08, 'piste': 0.10, 'chemin': 0.12}
MAX_CUT = {'route': 15.0, 'piste': 12.0, 'chemin': 8.0}
TALUS = float(np.tan(np.radians(33)))


def chaikin(P, it=2):
    for _ in range(it):
        q = 0.75 * P[:-1] + 0.25 * P[1:]
        r = 0.25 * P[:-1] + 0.75 * P[1:]
        m = np.empty((2 * len(q), P.shape[1]))
        m[0::2] = q
        m[1::2] = r
        P = np.vstack([P[:1], m, P[-1:]])
    return P


def densify(P, step):
    seg = np.hypot(*(P[1:] - P[:-1]).T)
    S = np.concatenate([[0], np.cumsum(seg)])
    s = np.append(np.arange(0, S[-1], step), S[-1])
    return np.stack([np.interp(s, S, P[:, 0]), np.interp(s, S, P[:, 1])], 1), s


def clamp_grade(y, ds, g):
    for i in range(1, len(y)):
        y[i] = min(max(y[i], y[i - 1] - g * ds[i - 1]), y[i - 1] + g * ds[i - 1])
    for i in range(len(y) - 2, -1, -1):
        y[i] = min(max(y[i], y[i + 1] - g * ds[i]), y[i + 1] + g * ds[i])
    return y


def grade_profile(p, s, g, iters=40):
    """Profil proche du terrain p(s) dont la pente reste ≤ g (passes avant/arrière, rappel vers le terrain)."""
    ds = np.diff(s)
    k = max(1, int(round(30 / max(float(ds.mean()), 1e-6))))
    y = ndimage.uniform_filter1d(p, 2 * k + 1, mode='nearest')
    for _ in range(iters):
        f = clamp_grade(y.copy(), ds, g)
        y = f + 0.15 * (p - f)
    return clamp_grade(y, ds, g)


def stamp_ways(h, W, cell, keep, log, water=None):
    """Pose les voies sur la grille h (pas `cell`) ; `keep` = 1 là où l'on ne touche pas (eau, vallée de Capyville)."""
    n = h.shape[0]
    out = []
    if water is None:
        water = keep
    for w in W['WAYS']:
        # seules les voies carrossables sont posées ; les sentiers suivent le relief (marches et lacets : Routes)
        if not w['vehicles'] or w['kind'] not in MAX_GRADE:
            continue
        g = MAX_GRADE[w['kind']]
        P = chaikin(np.asarray(w['pts'], dtype=np.float64), 2)
        D, s = densify(P, 4.0)
        fi, fj = (D[:, 0] - X0) / cell, (D[:, 1] - X0) / cell
        p = ndimage.map_coordinates(h, [fj, fi], order=1, mode='nearest')
        # franchissements : au-dessus des lits et des lacs, le profil passe en ligne droite (pont, gué : Routes)
        wet = ndimage.map_coordinates(water, [fj, fi], order=1, mode='nearest') > 0.3
        # seulement les franchissements courts (≤ 80 m) : une voie qui longe une rivière reste posée sur sa berge
        lab, nl = ndimage.label(wet)
        for k in range(1, nl + 1):
            idx = np.nonzero(lab == k)[0]
            if s[idx[-1]] - s[idx[0]] > 80:
                wet[idx] = False
        pb = p
        if wet.any() and (~wet).sum() > 2:
            pb = np.where(wet, np.interp(s, s[~wet], p[~wet]), p)
        y = grade_profile(pb, s, g)
        cap = MAX_CUT[w['kind']]
        y = np.where(wet, y, np.clip(y, p - cap, p + cap))
        # là où le déblai est plafonné, la voie suit le relief (lacets à poser par les Routes) ; lissage final
        y = ndimage.uniform_filter1d(y, 9, mode='nearest')
        hw = w['width'] / 2 + (1.0 if w['vehicles'] else 0.3)  # plateforme : chaussée et accotements
        fall = hw + 40
        i0 = max(0, int((D[:, 0].min() - fall - X0) / cell)); i1 = min(n, int((D[:, 0].max() + fall - X0) / cell) + 2)
        j0 = max(0, int((D[:, 1].min() - fall - X0) / cell)); j1 = min(n, int((D[:, 1].max() + fall - X0) / cell) + 2)
        XX, ZZ = np.meshgrid(X0 + np.arange(i0, i1) * cell, X0 + np.arange(j0, j1) * cell)
        q = np.stack([XX.ravel(), ZZ.ravel()], 1)
        dist, k = cKDTree(D).query(q, distance_upper_bound=fall)
        ok = np.isfinite(dist)
        sub = h[j0:j1, i0:i1].ravel().copy()
        kp = keep[j0:j1, i0:i1].ravel()
        yy = y[np.minimum(k[ok], len(y) - 1)]
        d = dist[ok]
        e = np.maximum(d - hw, 0)
        cur = sub[ok]
        new = np.clip(cur, yy - TALUS * e, yy + TALUS * e)
        new = np.where(d <= hw, yy, new)
        sub[ok] = cur + (new - cur) * (1 - kp[ok])
        h[j0:j1, i0:i1] = sub.reshape(XX.shape)
        cf = np.abs(y - p)
        out.append({'id': w['id'], 'kind': w['kind'], 'surface': w['surface'], 'width': w['width'], 'vehicles': w['vehicles'],
                    'pts': np.round(D[::2], 1).tolist() + [np.round(D[-1], 1).tolist()],
                    'y': np.round(y[::2], 2).tolist() + [round(float(y[-1]), 2)]})
        gr = np.abs(np.diff(y)) / np.maximum(np.diff(s), 1.0)
        log(f"voie {w['id']} : {s[-1]:.0f} m, pente ≤ {100 * g:.0f} % sur {100 * float((gr <= g + 0.005).mean()):.0f} % du tracé "
            f"(max {100 * float(gr.max()):.0f} %), déblai/remblai max {float(cf.max()):.0f} m (moyen {float(cf.mean()):.1f} m)")
    return h, out
