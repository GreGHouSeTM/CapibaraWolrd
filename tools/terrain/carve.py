# Éléments imposés du relief : plats des villes et villages, lacs, rivières, vallée de Capyville (spécialité Terrain & relief).
import json
import os
import numpy as np
from scipy import ndimage
from common import CACHE, X0, smoothstep, smax, smin, polyline_dist, bbox_slices, fbm

# Emprise du contenu actuel des régions (ancien cityRadius de layout.ts) : on l'aplatit à l'altitude `ground` de world-map.ts.
REGION_FLAT = {'paris': 280, 'newyork': 280, 'desert': 130, 'japan': 170, 'pole': 140, 'london': 260}


def load_valley():
    meta = json.load(open(os.path.join(CACHE, 'valley-meta.json')))
    routes = json.load(open(os.path.join(CACHE, 'valley-routes.json')))
    r = meta['ref']
    ref = np.fromfile(os.path.join(CACHE, 'valley-ref.f32'), dtype='<f4').reshape(r['n'], r['n'])
    d = meta['detail']
    det = np.fromfile(os.path.join(CACHE, 'valley-detail.f32'), dtype='<f4').reshape(d['nz'], d['nx'])
    return meta, routes, ref, det


def sample_ref(ref, meta, X, Z):
    """Ancien heightAt (grille de 2 m) interpolé aux points X, Z (hors emprise : bord)."""
    r = meta['ref']
    fi = (X - r['x0']) / r['cell']
    fj = (Z - r['z0']) / r['cell']
    return ndimage.map_coordinates(ref, [fj, fi], order=1, mode='nearest').astype(np.float32)


def valley_mask(X, Z, routes):
    """1 = relief de Capyville imposé (couronne et couloirs des cols jusqu'à leur sortie), 0 = monde simulé."""
    r = np.hypot(X, Z)
    m = smoothstep(640, 480, r)
    for rt in routes['routes']:
        d = polyline_dist(X, Z, rt['pts'])[0]
        # couloir : fond et talus gardés, puis fondu ; la fin du tracé se raccorde au monde sur 120 m
        end = np.asarray(rt['pts'][-1])
        de = np.hypot(X - end[0], Z - end[1])
        # le couloir garde son profil jusqu'à sa fin ; au-delà, le replat de sortie (exit_pads) prend le relais
        w = smoothstep(70, 30, d) * smoothstep(-10, 30, de)
        m = np.maximum(m, w * smoothstep(900, 760, r))
    return m.astype(np.float32)


def exit_pads(h, routes, X, Z):
    """Sorties des cols : replat à l'altitude de fin du couloir (bible §4.5 : 8 à 15 m), raccord sur 180 m."""
    for rt in routes['routes']:
        ex, ez = rt['pts'][-1]
        y = rt['y'][-1]
        d = np.hypot(X - ex, Z - ez)
        w = smoothstep(260, 60, d)
        h = h + (y - h) * w
    return h


def flats(h, W, X, Z, strength=1.0):
    """Cœurs bâtis des régions et villages : plats à l'altitude imposée. Le raccord s'élargit avec l'écart de hauteur
    (au moins 120 m pour une ville, 40 m pour un village, et environ 3,5 m par mètre d'écart) pour rester praticable."""
    for reg in W['WORLD_REGIONS']:
        if reg['id'] == 'hub':
            continue
        R = REGION_FLAT[reg['id']]
        g = reg['ground']
        d = np.hypot(X - reg['x'], Z - reg['z']) + 18 * fbm(X / 120, Z / 120, 2, 41)
        Wd = np.clip(3.0 * np.abs(h - g), 120, 320)
        w = smoothstep(R + 10 + Wd, R + 10, d) * strength
        h = h + (g - h) * w
    # plats des pyramides (même calcul que PYRAMIDS de heightmap.ts)
    de = next(r for r in W['WORLD_REGIONS'] if r['id'] == 'desert')
    l = np.hypot(de['x'], de['z'])
    ox, oz = de['x'] / l, de['z'] / l
    for a, bx, bz, sz in ((230, -60, 70, 70), (300, 40, -10, 55), (200, 110, -90, 38)):
        px, pz = de['x'] + ox * a + bx, de['z'] + oz * a + bz
        d = np.hypot(X - px, Z - pz)
        w = smoothstep(sz * 1.6 + 60, sz * 1.15, d) * strength
        h = h + (de['ground'] - h) * w
    for s in W['SETTLEMENTS']:
        d = np.hypot(X - s['x'], Z - s['z']) + 8 * fbm(X / 60, Z / 60, 2, 43)
        Wd = np.clip(3.0 * np.abs(h - s['y']), 40, 220)
        w = smoothstep(s['r'] * 0.6 + Wd, s['r'] * 0.6, d) * strength
        if s['kind'] == 'village':
            w = w * 0.75  # village en pente (Clarines) : on garde une partie du relief
        h = h + (s['y'] - h) * w
    return h


def lakes(h, W, X, Z, cell, n):
    for lk in W['LAKES']:
        rx, rz = lk['rx'], lk['rz']
        R = max(rx, rz) * (1 + 320 / min(rx, rz)) + 400
        sj, si = bbox_slices([[lk['x'], lk['z']]], R, cell, n)
        x, z, hh = X[sj, si], Z[sj, si], h[sj, si]
        a = np.radians(lk['rot'])
        dx, dz = x - lk['x'], z - lk['z']
        lx = dx * np.cos(a) + dz * np.sin(a)
        lz = -dx * np.sin(a) + dz * np.cos(a)
        wob = 1 + 0.06 * fbm(x / 90, z / 90, 2, 51)
        e = np.hypot(lx / rx, lz / rz) * wob
        # distance approximative au rivage (m)
        dist = (e - 1) * min(rx, rz)
        y = lk['y']
        if lk.get('dry'):
            bed = y - 0.2 + 0.15 * fbm(x / 30, z / 30, 2, 52)
        else:
            depth = float(np.clip(min(rx, rz) * 0.05, 2.5, 12))
            bed = y - 0.6 - depth * np.clip(1 - e * e, 0, 1) ** 0.7
        inside = e < 1
        # rive : plage douce sur 60 m puis versant à 29° ; on ne touche plus au terrain au-delà de 320 m
        dd = np.maximum(dist, 0)
        shore = y + 0.35 + 0.14 * np.minimum(dd, 60) + 0.55 * np.maximum(0, dd - 60)
        out = hh + (smin(hh, shore, 2.5) - hh) * smoothstep(320, 260, dist)
        # berge émergée puis levée douce (8°) si le terrain voisin est plus bas que le lac
        out = np.where(dist > 0, np.maximum(out, y + 0.3 * smoothstep(0, 6, dist) - 0.22 * np.maximum(0, dist - 30)), out)
        out = np.where(inside, np.minimum(out, bed), out)
        h[sj, si] = out
    return h


def meander(rv, step=8.0):
    """Tracé dense d'une rivière avec méandres doux (amplitude ≤ 30 m) ; extrémités, lacs et chutes gardés en place."""
    P = np.asarray(rv['pts'], dtype=np.float64)
    ys, ws = np.asarray(rv['y'], dtype=np.float64), np.asarray(rv['w'], dtype=np.float64)
    # lissage de Chaikin (les tracés de la carte sont des lignes brisées) ; extrémités conservées
    V = np.column_stack([P, ys, ws])
    for _ in range(3):
        q = 0.75 * V[:-1] + 0.25 * V[1:]
        r = 0.25 * V[:-1] + 0.75 * V[1:]
        mid = np.empty((2 * len(q), 4))
        mid[0::2] = q
        mid[1::2] = r
        V = np.vstack([V[:1], mid, V[-1:]])
    P, ys, ws = V[:, :2], V[:, 2], V[:, 3]
    seg = np.hypot(*(P[1:] - P[:-1]).T)
    S = np.concatenate([[0], np.cumsum(seg)])
    s = np.arange(0, S[-1], step)
    s = np.append(s, S[-1])
    x = np.interp(s, S, P[:, 0])
    z = np.interp(s, S, P[:, 1])
    y = np.interp(s, S, ys)
    w = np.interp(s, S, ws)
    # direction lissée
    tx, tz = np.gradient(x), np.gradient(z)
    l = np.hypot(tx, tz) + 1e-9
    nx, nz = -tz / l, tx / l
    seed = sum(map(ord, rv['id']))
    # amplitude : grands méandres en plaine (jusqu'à 90 m), faibles dans les torrents
    gy0 = np.abs(np.gradient(y, s))
    A = np.minimum(120, 1.8 * w + 35) * np.clip(1 - gy0 / 0.03, 0.2, 1)
    taper = np.clip(s / 150, 0, 1) * np.clip((S[-1] - s) / 150, 0, 1)
    # pas de méandre sur les marches d'eau (chutes, rapides) : la pente locale du niveau d'eau fige le tracé
    gy = np.abs(np.gradient(y, s))
    calm = np.clip(1 - gy / 0.05, 0, 1)
    lam = 90 + 4 * w
    off = A * taper * calm * (np.sin(s / lam + seed) * 0.6 + np.sin(s / (0.43 * lam) + seed * 0.37) * 0.3 + np.sin(s / (2.3 * lam) + seed * 1.7) * 0.4)
    return np.stack([x + nx * off, z + nz * off], 1), y, w


def rivers(h, W, X, Z, cell, n, keep_banks=True, dense=None):
    for rv in W['RIVERS']:
        if dense is not None:
            pts, ys, ws = dense[rv['id']]
        else:
            pts, ys, ws = rv['pts'], rv['y'], rv['w']
        pad = float(np.max(ws)) / 2 + 300
        sj, si = bbox_slices(pts, pad, cell, n)
        x, z, hh = X[sj, si], Z[sj, si], h[sj, si]
        d, y, w = polyline_dist(x, z, pts, vals=[ys, ws])
        # méandres doux du lit autour du tracé (sans quitter la vallée creusée)
        e = d - w / 2
        depth = np.clip(0.5 + w * 0.035, 0.6, 3.0)
        bed = y - depth * np.sqrt(np.clip(1 - (d / np.maximum(w / 2, 0.5)) ** 2, 0, 1)) - 0.15
        # berges, plaine alluviale (terrasse 3 à 5 m au-dessus de l'eau) puis versant
        ee = np.maximum(e + 25 * fbm(x / 160, z / 160, 2, 61), 0)
        # vallée en berceau (parabolique) : plaine alluviale douce près de l'eau, versants qui se redressent
        sc = 1 + w / 40
        lim = y + 0.7 + 0.035 * ee + 0.0022 * ee * ee / sc
        out = hh + (smin(hh, lim, 12) - hh) * smoothstep(pad - 10, pad - 120, ee)
        if keep_banks:
            # berges et levées : le sol reste au-dessus de l'eau près du lit, puis redescend vers le terrain d'origine
            levee = np.where(e < 14, y + 0.45 * smoothstep(0, 3, e), y + 0.45 - 0.4 * (e - 14))
            out = np.where(e > 0, np.maximum(out, levee), out)
        out = np.where(e <= 0, np.minimum(out, bed), out)
        h[sj, si] = out
    return h


def water_mask(W, X, Z, cell, n, margin=6.0, dense=None, lake_edge=1.25, parts=False):
    """1 sur les lits des rivières et les lacs (protégés de l'érosion). parts=True : (rivières, lacs en eau) séparés."""
    m = np.zeros(X.shape, dtype=np.float32)
    for rv in W['RIVERS']:
        pts, _, ws = dense[rv['id']] if dense is not None else (rv['pts'], None, rv['w'])
        sj, si = bbox_slices(pts, float(np.max(ws)) + 40, cell, n)
        d, w = polyline_dist(X[sj, si], Z[sj, si], pts, vals=[ws])
        m[sj, si] = np.maximum(m[sj, si], smoothstep(w / 2 + margin + 10, w / 2 + margin, d))
    lm = np.zeros(X.shape, dtype=np.float32)
    for lk in W['LAKES']:
        a = np.radians(lk['rot'])
        dx, dz = X - lk['x'], Z - lk['z']
        lx = dx * np.cos(a) + dz * np.sin(a)
        lz = -dx * np.sin(a) + dz * np.cos(a)
        e = np.hypot(lx / lk['rx'], lz / lk['rz'])
        if parts:
            if not lk.get('dry'):
                lm = np.maximum(lm, smoothstep(lake_edge, lake_edge - 0.2, e))
            continue
        m = np.maximum(m, smoothstep(lake_edge, lake_edge - 0.2, e))
    return (m, lm) if parts else m


def protect_mask(W, X, Z, cell, n, dense=None):
    """Zones protégées de l'érosion : plats des villes et villages, lits et lacs, falaises voulues (érosion réduite)."""
    p = water_mask(W, X, Z, cell, n, dense=dense)
    for reg in W['WORLD_REGIONS']:
        if reg['id'] == 'hub':
            continue
        R = REGION_FLAT[reg['id']]
        d = np.hypot(X - reg['x'], Z - reg['z'])
        p = np.maximum(p, smoothstep(R + 30, R, d))
    for s in W['SETTLEMENTS']:
        d = np.hypot(X - s['x'], Z - s['z'])
        p = np.maximum(p, smoothstep(s['r'] * 0.8, s['r'] * 0.5, d))
    return p.astype(np.float32)


def cliff_mask(W, X, Z, cell, n):
    """Falaises voulues (CLIFF_ZONES et côtes à falaise) : 1 sur la paroi et son pied."""
    m = np.zeros(X.shape, dtype=np.float32)
    for c in W['CLIFF_ZONES']:
        sj, si = bbox_slices(c['pts'], 200, cell, n)
        d = polyline_dist(X[sj, si], Z[sj, si], c['pts'])[0]
        m[sj, si] = np.maximum(m[sj, si], smoothstep(140, 60, d))
    for seg in W['COAST_SEGMENTS']:
        if seg['kind'] != 'falaise':
            continue
        sj, si = bbox_slices(seg['pts'], 200, cell, n)
        d = polyline_dist(X[sj, si], Z[sj, si], seg['pts'])[0]
        m[sj, si] = np.maximum(m[sj, si], smoothstep(160, 90, d))
    return m


# routes du monde qui partent du bout des couloirs de Capyville (même table que roads.FROM_COL)
COL_WAY = {'paris': 'route-paris', 'newyork': 'route-ny', 'london': 'route-londres', 'japan': 'route-japon',
           'desert': 'piste-desert', 'pole': 'route-pole'}


def exit_valleys(h, routes, W, X, Z, cell, n):
    """Sorties des cols (bible §4.5 : le terrain descend vers 8 à 15 m au bout des couloirs, puis rejoint les fonds de relief).
    Au lieu d'une cuvette ronde (fossé de 60 à 80 m de profondeur), une vallée douce part du bout du couloir le long de la
    voie de la bible : fond montant à 4,5 % au plus, versants de 18°, jusqu'à rejoindre le relief naturel."""
    ways = {w['id']: w for w in W['WAYS']}
    for rt in routes['routes']:
        end = np.asarray(rt['pts'][-1], dtype=np.float64)
        y = rt['y'][-1]
        # petit replat de sortie (raccord des derniers mètres du couloir)
        d = np.hypot(X - end[0], Z - end[1])
        h = h + (y - h) * smoothstep(110, 40, d)
        w = ways.get(COL_WAY.get(rt['axis'], ''))
        if not w:
            continue
        P = np.vstack([end[None], np.asarray(w['pts'][1:], dtype=np.float64)])
        for _ in range(2):
            q, r = 0.75 * P[:-1] + 0.25 * P[1:], 0.25 * P[:-1] + 0.75 * P[1:]
            m = np.empty((2 * len(q), 2)); m[0::2] = q; m[1::2] = r
            P = np.vstack([P[:1], m, P[-1:]])
        seg = np.hypot(*(P[1:] - P[:-1]).T)
        S = np.concatenate([[0], np.cumsum(seg)])
        s = np.arange(0, S[-1], 8.0)
        C = np.stack([np.interp(s, S, P[:, 0]), np.interp(s, S, P[:, 1])], 1)
        hc = ndimage.map_coordinates(h, [(C[:, 1] - X0) / cell, (C[:, 0] - X0) / cell], order=1, mode='nearest')
        floor = y + 0.045 * s
        # la vallée s'arrête là où son fond rejoint le relief naturel (plus un fondu de 150 m)
        hit = np.nonzero(floor >= ndimage.minimum_filter1d(hc, 9) - 1.0)[0]
        hit = hit[s[hit] > 120]
        smax = min(float(s[hit[0]]) if len(hit) else float(s[-1]), 900.0)
        keep = s <= smax + 150
        C, s, floor = C[keep], s[keep], floor[keep]
        if len(C) < 3:
            continue
        sj, si = bbox_slices(C, 400, cell, n)
        dd, ss, fl = polyline_dist(X[sj, si], Z[sj, si], C, vals=[s, floor])
        lim = fl + np.maximum(0, dd - 28) * 0.33 + 5 * fbm(X[sj, si] / 70, Z[sj, si] / 70, 2, 77) * smoothstep(30, 90, dd)
        fade = smoothstep(smax + 150, smax, ss) * smoothstep(260, 170, dd)
        hh = h[sj, si]
        h[sj, si] = hh + (smin(hh, lim, 8) - hh) * fade
    return h
