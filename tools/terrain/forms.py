# Grandes formes dirigées du relief (avant érosion), lues dans world-map.ts (exporté en JSON).
# Spécialité Terrain & relief. Toutes les altitudes en mètres, mer = 0.
import numpy as np
from common import (fbm, ridged, smoothstep, smax, smin, poly_mask, sdf, polyline_dist, bbox_slices, vnoise)


# ------------------------------------------------------------------------------------------------ côte
COAST_SLOPE = {'plage': 0.045, 'galets': 0.07, 'dunes': 0.05, 'glace': 0.04, 'mangrove': 0.015, 'rochers': 0.2, 'quai': 1.2, 'falaise': 2.6}


def coast(W, X, Z, cell, n):
    """Distance signée au rivage (positive à terre), pente de rivage et hauteur des falaises."""
    land = poly_mask(W['COASTLINE'], cell, n)
    d = -sdf(land, cell)  # positive dedans
    # pente du rivage et falaises par tronçon
    slope = np.full(X.shape, COAST_SLOPE['plage'], dtype=np.float32)
    cliffH = np.zeros(X.shape, dtype=np.float32)
    calm = np.zeros(X.shape, dtype=np.float32)  # 1 = trait de côte net (pas de bruit)
    for seg in W['COAST_SEGMENTS']:
        dd = polyline_dist(X, Z, seg['pts'])[0]
        w = smoothstep(220, 90, dd)
        s = COAST_SLOPE.get(seg['kind'], 0.05)
        slope = slope + (s - slope) * w
        if seg['kind'] == 'falaise':
            cliffH = np.maximum(cliffH, seg.get('height', 40) * w)
            calm = np.maximum(calm, w)
        if seg['kind'] == 'quai':
            calm = np.maximum(calm, w)
    # criques et pointes (20 à 40 m) sauf sur les falaises et les quais
    d = d + (1 - calm) * (26 * fbm(X / 260, Z / 260, 3, seed=5) + 10 * fbm(X / 70, Z / 70, 2, seed=6))
    return d, slope, cliffH


def apply_coast(h, d, slope, cliffH, W, X, Z):
    """Profil de rivage : plage en pente douce ou falaise ; fond marin au-delà."""
    # plateau des falaises : le terrain tient sa hauteur jusqu'au bord
    plateau = cliffH * smoothstep(-5, 25, d) * smoothstep(500, 200, d)
    h = np.maximum(h, plateau + 3 * fbm(X / 90, Z / 90, 2, seed=8) * (cliffH > 1))
    # la pente de rivage ne vaut que sur la bande littorale : au-delà, la borne s'envole
    prof = 0.6 + slope * d + np.maximum(0, d - 120) ** 2 * 0.05
    h = smin(h, prof, 4)
    seabed = -14 - np.maximum(0, -d - 300) * 0.03 + 3 * fbm(X / 300, Z / 300, 2, seed=9)
    h = np.maximum(h, np.maximum(seabed, -40))
    h = np.where(d < -40, np.minimum(h, -1.0), h)
    # îles
    for il in W['ISLANDS']:
        r = np.hypot(X - il['x'], Z - il['z'])
        top = il['y'] * np.clip(1 - (r / il['r']) ** 2, 0, 1) ** 0.6
        isl = smin(top + 0.5, 0.6 + 0.08 * (il['r'] - r), 3)
        h = smax(h, isl, 2)
    return h


# ------------------------------------------------------------------------------------------------ fonds de relief
TOWERS = []  # pitons karstiques posés par zone_relief (roche voulue), recopiés dans TOWER_MAP par relief_zones
TOWER_MAP = None


def zone_relief(kind, z, X, Z, base, amp, rough, din, D, seed):
    t = smoothstep(0, D, din)
    b = base[0] + (base[1] - base[0]) * t
    oc = 3 + int(round(rough * 4))
    if kind == 'plaine':
        n = amp * (0.55 * (fbm(X / 600, Z / 600, oc, seed) * 0.5 + 0.5) + 0.25 * fbm(X / 160, Z / 160, 2, seed + 1))
    elif kind == 'plateau':
        n = amp * (0.5 * fbm(X / 700, Z / 700, 3, seed) + 0.2 * fbm(X / 150, Z / 150, 2, seed + 1))
    elif kind == 'collines':
        n = amp * (0.75 * (fbm(X / 420, Z / 420, oc, seed, gain=0.42 + rough * 0.15) * 0.5 + 0.5)
                   + 0.35 * (ridged(X / 650, Z / 650, 3, seed + 2) - 0.5))
    elif kind == 'piemont':
        n = amp * (1.1 * (ridged(X / 520, Z / 520, 4, seed) - 0.35) + 0.3 * fbm(X / 140, Z / 140, 2, seed + 1))
    elif kind == 'vallee':
        n = amp * (1.2 * (ridged(X / 380, Z / 380, 4, seed) - 0.4))
        # pitons calcaires (karst à tours)
        cx = np.floor(X / 260)
        cz = np.floor(Z / 260)
        jx = (vnoise(cx * 7.1, cz * 3.3, seed + 4) * 0.35 + 0.5 + cx) * 260
        jz = (vnoise(cx * 2.7, cz * 5.9, seed + 5) * 0.35 + 0.5 + cz) * 260
        pick = vnoise(cx * 1.3, cz * 1.7, seed + 6) > 0.35
        r = np.hypot(X - jx, Z - jz) * (1 + 0.12 * fbm(X / 40, Z / 40, 2, seed + 7))
        tower = np.where(pick, 55 * smoothstep(75, 38, r) ** 0.85, 0)
        n = np.maximum(n, tower * t)
        TOWERS.append(tower * t)
    elif kind == 'erg':
        # dunes transversales au vent d'ouest : dos doux à l'ouest, face d'avalanche à l'est ; draas de 800 m
        u = (X + 0.25 * Z + 60 * fbm(X / 400, Z / 400, 2, seed)) / 165
        f = u - np.floor(u)
        prof = np.where(f < 0.78, f / 0.78, (1 - f) / 0.22)
        prof = prof * prof * (3 - 2 * prof)
        env = 0.5 + 0.5 * fbm(X / 500, Z / 900, 3, seed + 1)
        n = 28 * prof * env + 25 * (fbm(X / 900, Z / 900, 2, seed + 2) * 0.5 + 0.5)
    elif kind == 'toundra':
        n = amp * (0.6 * (fbm(X / 400, Z / 400, 3, seed) * 0.5 + 0.5) + 0.25 * np.abs(fbm(X / 70, Z / 70, 2, seed + 1)))
    elif kind == 'montagne':
        n = amp * ridged(X / 500, Z / 500, 5, seed)
    else:  # volcan : le cône est un sommet
        n = amp * 0.3 * fbm(X / 300, Z / 300, 2, seed)
    return b + n


def relief_zones(W, X, Z, cell, n):
    acc = np.zeros(X.shape, dtype=np.float32)
    wsum = np.zeros(X.shape, dtype=np.float32)
    for k, rz in enumerate(W['RELIEF_ZONES']):
        m = poly_mask(rz['poly'], cell, n, scale=1)
        s = sdf(m, cell)
        w = smoothstep(260, -260, s)
        sl = w > 1e-4
        if not sl.any():
            continue
        din = np.maximum(0, -s)
        D = min(700.0, 0.55 * float(din.max()) + 1)
        TOWERS.clear()
        alt = zone_relief(rz['kind'], rz, X[sl], Z[sl], rz['base'], rz['amplitude'], rz['roughness'], din[sl], D, 100 + 13 * k)
        global TOWER_MAP
        if TOWER_MAP is None or TOWER_MAP.shape != X.shape:
            TOWER_MAP = np.zeros(X.shape, np.float32)
        if TOWERS:
            TOWER_MAP[sl] = np.maximum(TOWER_MAP[sl], TOWERS[0] * w[sl])
        acc[sl] += w[sl] * alt
        wsum[sl] += w[sl]
    # fond : prés et bosquets
    bg = 16 + 18 * (fbm(X / 550, Z / 550, 4, 3) * 0.5 + 0.5) + 5 * fbm(X / 130, Z / 130, 2, 4)
    wb = 0.04
    return (acc + bg * wb) / (wsum + wb)


# ------------------------------------------------------------------------------------------------ chaînes et sommets
def chains(h, W, X, Z, cell, n):
    for k, ch in enumerate(W['CHAINS']):
        crest = ch['crest']
        hw = ch['halfWidth']
        kpad = {'alpin': 0.6, 'arrondi': 0.45, 'colline': 0.38}.get(ch['profile'], 0.5)
        sj, si = bbox_slices([[p[0], p[1]] for p in crest], max(hw * 1.1, max(p[2] for p in crest) / kpad * 1.05), cell, n)
        x, z, hh = X[sj, si], Z[sj, si], h[sj, si]
        d, cy, sx, sz = polyline_dist(x, z, [[p[0], p[1]] for p in crest], vals=[[p[2] for p in crest],
                                      [p[0] for p in crest], [p[1] for p in crest]])
        # distance déformée : la crête serpente, les courbes de niveau ondulent (plus de versants plans)
        d = np.abs(d + 140 * fbm(x / 700, z / 700, 3, 210 + k) + 55 * fbm(x / 210, z / 210, 3, 220 + k))
        side = ch.get('steepSide')
        hws = np.full(d.shape, hw, dtype=np.float32)
        if side:
            dx, dz = x - sx, z - sz
            # passage progressif d'un versant à l'autre (sur 300 m) pour éviter une cassure le long de la crête
            on = {'ouest': smoothstep(150, -150, dx), 'est': smoothstep(-150, 150, dx), 'nord': smoothstep(150, -150, dz), 'sud': smoothstep(-150, 150, dz)}[side]
            hws = hw * (1 - 0.38 * on)
        prof = ch['profile']
        foot = hh
        rel = np.maximum(0, cy - foot)
        # demi-largeur élargie si nécessaire pour borner la pente moyenne du versant (bible §4.3 :
        # haute montagne praticable ou à grimper ; versant raide ≈ 42°, versant doux ≈ 30°, collines ≈ 22°)
        kmax = {'alpin': 0.6, 'arrondi': 0.45, 'colline': 0.38}.get(prof, 0.5)
        kk = kmax + (0.9 - kmax) * np.clip((hw - hws) / (0.38 * hw), 0, 1)
        hws = np.maximum(hws, rel / kk)
        u = np.clip(d / hws, 0, 1)
        if prof == 'alpin':
            p = (1 - u) ** 1.3
        elif prof == 'arrondi':
            p = (1 - u * u) ** 2
        else:
            p = 0.5 * (1 + np.cos(np.pi * u))
        # éperons et ravines perpendiculaires à la crête
        # éperons et vallons : multifractale de crêtes, plus forte en montagne
        sp = ridged(x / 520, z / 520, 5, 200 + k) - 0.45
        rough = 0.75 if prof == 'alpin' else 0.45
        # la modulation creuse et bombe les flancs mais ne dépasse jamais l'altitude de la crête (sommets de la bible)
        hc = foot + rel * p * np.clip(1 + rough * sp * (0.35 + 2.6 * u * (1 - u)), 0.25, 1.25 - 0.27 * smoothstep(0.7, 1.0, p))
        # le pied est le relief déjà posé : la chaîne ne fait que monter au-dessus (pas de biais de raccord)
        h[sj, si] = hc
    return h


def fuji_profile(u, H):
    """Cône concave : pente forte au sommet, douce au pied (profil intégré numériquement)."""
    uu = np.linspace(0, 1, 512)
    s = 0.5 + (1 - uu) ** 1.25
    prof = np.cumsum(s[::-1])[::-1]
    prof = (prof - prof[-1]) / (prof[0] - prof[-1])
    return np.interp(u, uu, prof) * H


# sommets alpins : (pente de la pyramide sommitale, rayon de la pyramide en m)
ALPINE = {'aurore': (1.07, 130.0), 'neiges': (0.85, 90.0), 'dent-du-loup': (1.3, 105.0), 'cretes-blanches': (0.95, 90.0)}


def peaks(h, W, X, Z, cell, n):
    for k, pk in enumerate(W['WORLD_PEAKS']):
        b = pk['base']
        cx, cz, y = pk['x'], pk['z'], pk['y']
        pad = b * 1.6 if pk['shape'] == 'dormeur' else max(b * 1.05, y / 0.45 * 1.06)
        sj, si = bbox_slices([[cx, cz]], pad, cell, n)
        x, z, hh = X[sj, si], Z[sj, si], h[sj, si]
        dx, dz = x - cx, z - cz
        r = np.hypot(dx, dz)
        th = np.arctan2(dx, -dz)
        foot = float(np.median(hh[(r > b * 0.9) & (r < b)])) if ((r > b * 0.9) & (r < b)).any() else 20.0
        sh = pk['shape']
        # rayon de base élargi pour borner la pente moyenne (alpin 31°, dôme 29°, croupe 24°)
        kb = {'alpin': 0.6, 'dome': 0.55, 'arrondi': 0.45, 'butte': 0.45}.get(sh)
        if kb:
            b = max(b, (y - foot) / kb)
            r_ok = r < b * 1.05
        # profil relatif P ∈ [0, 1] (1 au sommet) : h = sol + (y - sol) × P, continu au pied (P = 0)
        P = None
        if sh == 'alpin':
            # pyramide sommitale de roche (pente K1 sur r1) posée sur des épaules praticables (K2), raccord concave au pied ;
            # trois arêtes (moins raides, praticables) séparées par des faces et des couloirs
            K1, r1 = ALPINE.get(pk['id'], (1.07, 120.0))
            K2 = 0.55
            ra = r * (1 + 0.17 * np.cos(3 * th + k) + 0.07 * fbm(x / 140, z / 140, 3, 300 + k))
            # descente depuis le sommet : K1 sur la pyramide, K2 sur les épaules, genou arrondi sur ~40 m
            f = K2 * ra + (K1 - K2) * smin(ra, np.full_like(ra, r1), 40.0)
            hp_a = y - f
            # pied concave : la pente s'adoucit sur les 120 derniers mètres au-dessus du sol (alpages)
            rel = np.maximum(hp_a - hh, 0)
            hp_a = hh + rel - 60 * smoothstep(120, 0, rel) * (rel / 120) * (1 - rel / 120)
            h[sj, si] = np.maximum(hh, hp_a)
            continue
        elif sh == 'dome':
            u = np.clip(r / b, 0, 1)
            P = np.exp(-(u / 0.42) ** 2 / 2) * smoothstep(1, 0.8, u)
        elif sh == 'arrondi' or sh == 'butte':
            u = np.clip(r / b, 0, 1)
            P = (0.5 + 0.5 * np.cos(np.pi * u)) ** 1.2
        elif sh == 'volcan':
            y = y / 0.93  # le cratère (42 m) et les ravines retirent environ 7 % au rebord
            # base anisotrope : le lac du Torii et son exutoire sont à 500-850 m à l'ouest et au nord-ouest ;
            # le cône garde sa silhouette (620 m) mais son pied est plus court de ce côté (versant ouest à grimper)
            bb = np.radians(np.degrees(th) % 360)
            west = np.clip(0.5 + 0.5 * np.cos(bb - np.radians(285)), 0, 1) ** 1.5
            u = np.clip(r / (b * (1 - 0.36 * west)), 0, 1)
            P = fuji_profile(u, 1.0)
            # barrancos rayonnants irréguliers : crêtes d'un bruit en coordonnées polaires (leur nombre croît vers le pied)
            q = th * (5.5 + 9 * u) / np.pi + 1.8 * fbm(x / 300, z / 300, 3, 321)
            rav = 1 - ridged(q, u * 3.0 + 0.4 * fbm(x / 500, z / 500, 2, 322), 3, 323)
            P = P - (0.018 + 0.02 * (fbm(x / 400, z / 400, 2, 324) * 0.5 + 0.5)) * rav * u * (1 - u) * 4
            P = P - (42 / (y - foot)) * smoothstep(70, 40, r)  # cratère
        if P is not None:
            hp = hh + (y - hh) * np.clip(P, -0.2, 1)
        elif sh == 'mesa':
            rt = b * 0.4
            ramp = smoothstep(0.35, 0.05, np.abs(((th - np.radians(225) + np.pi) % (2 * np.pi)) - np.pi))  # rampe au sud-ouest
            rr = r * (1 + 0.04 * fbm(x / 60, z / 60, 2, 310 + k))
            cliff = smoothstep(rt + 10, rt, rr)  # couronne de falaise de 30 m
            uu = np.clip((rr - rt - 10) / (b - rt - 10), 0, 1)
            talus = hh + (y - 30 - hh) * (1 - uu) ** 1.2
            hp = np.where(rr < rt + 10, talus + (y - talus) * cliff, talus)
            rampH = hh + (y - hh) * np.clip(1 - (rr - rt) / (b - rt), 0, 1)
            hp = np.where(rr > rt, hp + (rampH - hp) * ramp, hp)
        elif sh == 'dormeur':
            # capybara couché : dos (corps), tête au nord, museau vers le nord-nord-est, deux oreilles
            body = 250 * np.exp(-(((x - cx) / 250) ** 2 + ((z - (cz + 90)) / 360) ** 2) / 2)
            hx, hz = cx + 40, cz - 330
            head = 295 * np.exp(-(((x - hx) / 215) ** 2 + ((z - hz) / 200) ** 2) / 2)
            snout = 220 * np.exp(-(((x - (hx + 110)) / 150) ** 2 + ((z - (hz - 190)) / 140) ** 2) / 2)
            S = smax(np.maximum(body, head), snout, 30)
            for ex in (-70, 70):
                er = np.hypot(x - (hx + ex), z - (hz + 40))
                S = S + 9 * np.clip(1 - (er / 22) ** 2, 0, 1)
            hp = foot + S - 60 * smoothstep(b * 1.2, b * 1.55, np.hypot((x - cx) / 0.75, z - cz))
        else:
            continue
        h[sj, si] = np.maximum(hh, hp)
    return h


def cols(h, W, X, Z, cell, n):
    """Cols : couloir de passage à travers la crête la plus proche (fond à l'altitude du col, pente d'approche ≤ 14 %)."""
    crests = [np.asarray([[p[0], p[1]] for p in ch['crest']]) for ch in W['CHAINS']]
    for c in W['WORLD_COLS']:
        p = np.array([c['x'], c['z']])
        best, v = 1e18, np.array([1.0, 0.0])
        for C in crests:
            for i in range(len(C) - 1):
                a, b = C[i], C[i + 1]
                ab = b - a
                t = np.clip(np.dot(p - a, ab) / np.dot(ab, ab), 0, 1)
                d = np.linalg.norm(p - a - ab * t)
                if d < best:
                    best, v = d, ab / np.linalg.norm(ab)
        ax = np.array([-v[1], v[0]])  # axe du couloir : perpendiculaire à la crête
        sj, si = bbox_slices([[c['x'], c['z']]], 1000, cell, n)
        x, z, hh = X[sj, si], Z[sj, si], h[sj, si]
        t = (x - c['x']) * ax[0] + (z - c['z']) * ax[1]
        q = (x - c['x']) * v[0] + (z - c['z']) * v[1]
        k = float(np.clip(60.0 / c['width'], 0.35, 1.0))
        qq = np.maximum(0, np.abs(q + 30 * fbm(x / 200, z / 200, 2, 71)) - c['width'] / 2)
        lim = c['y'] + 0.12 * np.abs(t) + qq * k * 0.5 + qq * qq * k / 400 + 12 * fbm(x / 90, z / 90, 3, 72) * smoothstep(0, 60, qq)
        w = smoothstep(650, 450, np.abs(t)) * smoothstep(c['width'] / 2 + 420, c['width'] / 2 + 260, np.abs(q))
        h[sj, si] = hh + (smin(hh, lim, 18) - hh) * w
    return h


# ------------------------------------------------------------------------------------------------ cirques et roche voulue
# cirques glaciaires (bible §4.4 : formes glaciaires au Givre) : (sommet, cap d'ouverture en degrés depuis le nord, distance
# du centre au sommet, rayon) ; fond plat (alpage, petit lac), paroi rocheuse en fer à cheval côté sommet, seuil côté aval
CIRQUES = [('aurore', 25, 520, 250), ('aurore', 125, 560, 230), ('neiges', 70, 430, 220), ('cretes-blanches', 5, 300, 190),
           ('neiges', 330, 420, 200), ('dent-du-loup', 120, 330, 170)]


def cirques(h, W, X, Z, cell, n):
    """Creuse les cirques ; renvoie aussi le masque de leurs parois (roche voulue)."""
    wall = np.zeros(h.shape, np.float32)
    pk = {p['id']: p for p in W['WORLD_PEAKS']}
    for k, (pid, cap, dist, R) in enumerate(CIRQUES):
        p = pk[pid]
        a = np.radians(cap)
        ux, uz = np.sin(a), -np.cos(a)
        cx, cz = p['x'] + ux * dist, p['z'] + uz * dist
        sj, si = bbox_slices([[cx, cz]], R * 1.4, cell, n)
        x, z, hh = X[sj, si], Z[sj, si], h[sj, si]
        dx, dz = x - cx, z - cz
        # contour irrégulier (festons de la paroi, lobes) : rayon modulé selon l'angle et par un bruit lent
        ang = np.arctan2(dz, dx)
        rc = np.hypot(dx, dz) * (1 + 0.16 * fbm(np.cos(ang) * 1.7 + k, np.sin(ang) * 1.7, 3, 510 + k)
                                 + 0.08 * fbm(x / 60, z / 60, 2, 500 + k))
        # côté sommet (1) ou côté ouverture vers l'aval (0)
        cosang = -(dx * ux + dz * uz) / np.maximum(np.hypot(dx, dz), 1e-6)
        back = smoothstep(-0.55, 0.1, cosang)
        i0, j0 = int((cx - X0g) / cell), int((cz - X0g) / cell)
        floor = float(np.median(h[max(0, j0 - 3):j0 + 4, max(0, i0 - 3):i0 + 4])) - 0.28 * R
        lim = floor + 9 * (rc / R) ** 2 + back * np.maximum(0, rc - 0.5 * R) * 1.25 + (1 - back) * np.maximum(0, rc - 0.62 * R) * 0.35
        w = smoothstep(R * 1.3, R * 1.05, rc)
        out = hh + (smin(hh, lim, 10) - hh) * w
        # seuil (verrou) à la sortie du cirque : bourrelet de 6 m
        out = out + 6 * (1 - back) * np.exp(-((rc - 0.75 * R) / (0.08 * R)) ** 2) * w
        h[sj, si] = out
        wall[sj, si] = np.maximum(wall[sj, si], back * smoothstep(0.5 * R, 0.62 * R, rc) * smoothstep(R * 1.15, R * 0.95, rc))
    return h, wall


X0g = -4096.0


def rock_wanted(W, X, Z, cell, n, cirque_wall):
    """Roche voulue (pentes fortes admises, lisibles en roche) : pyramides sommitales alpines, parois des cirques,
    couronnes des mesas, pitons karstiques. Les falaises de CLIFF_ZONES et de la côte sont comptées à part."""
    m = cirque_wall.copy()
    for p in W['WORLD_PEAKS']:
        r = np.hypot(X - p['x'], Z - p['z'])
        if p['shape'] == 'alpin':
            K1, r1 = ALPINE.get(p['id'], (1.07, 120.0))
            m = np.maximum(m, smoothstep(r1 * 1.45, r1 * 1.1, r))
        elif p['shape'] == 'mesa':
            rt = p['base'] * 0.4
            m = np.maximum(m, smoothstep(rt - 12, rt - 2, r) * smoothstep(rt + 28, rt + 16, r))
    if TOWER_MAP is not None and TOWER_MAP.shape == X.shape:
        m = np.maximum(m, smoothstep(4, 18, TOWER_MAP))
    return np.clip(m, 0, 1).astype(np.float32)
