# Placement géologique des rochers et affleurements (spécialité Terrain & relief).
#
# Usage (depuis la racine du dépôt) :
#   <python> tools/terrain/rochers.py          # écrit public/assets/terrain/rochers.bin (+ carte de contrôle)
# <python> = L:\CLAUDE\CapyWorld\.venv-blender\Scripts\python.exe
#
# Ne lit que ce que le jeu lit (public/assets/terrain : tuiles de hauteur, carte dérivée, biomes, voies de meta.json) et
# la liste des modèles (rochers/rochers.json, tools/terrain/bl_rochers.py) : se relance tel quel sur un relief régénéré.
# Règles (un géologue qui lit le relief) :
#  - barres litées : bancs affleurant sur les pentes de 30 à 70° des zones de roche, à intervalles réguliers d'altitude
#    (strates à léger pendage, épaisseur 7 à 12 m selon le massif), long axe le long des courbes de niveau, front vers
#    l'aval, dos enterré dans la pente ; dalles de lapiaz sur les replats rocheux (15-30°) ;
#  - arêtes : gendarmes et blocs fracturés sur les crêtes convexes (courbure du relief à 8 m), d'autant plus hauts
#    que l'arête est fine et haute ; faces sommitales (au-dessus de 600 m ou roche voulue) semées de blocs et de barres
#    pour casser les silhouettes lisses ;
#  - cônes d'éboulis : là où la carte des dépôts est forte (talus thermiques), sous les barres ; granoclassement : petits
#    fragments en haut du cône (pente 34-40°), gros blocs au pied (22-28°) ;
#  - roches moutonnées : fonds glaciaires du Pays du Givre (pente < 22°, au-dessus de 150 m), axe dans le sens de
#    l'écoulement de la glace (pente du relief lissé à 60 m), face arrachée vers l'aval ;
#  - blocs erratiques épars dans les alpages et les forêts.
# Densité pleine sur le massif de l'Aurore et des Clarines (zone de qualité), densité de base ailleurs.
# Exclusions : voies (plateforme + 3 m), eau, villages et villes, vallée de Capyville.
# Sortie : rochers.bin = zlib( en-tête 'ROC1', n (u32), n × 8 flottants [x, z, dy, échelle, cap, tangage, roulis, modèle],
#          n × 4 octets [mousse, neige, lichen, teinte] ) ; dy = altitude de la base moins heightAt(x, z) au centre.
import json
import math
import os
import sys
import time
import zlib

import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import ROOT, X0, load_world, poly_mask, smoothstep  # noqa: E402
from qa import load_heights  # noqa: E402

TER = os.path.join(ROOT, 'public', 'assets', 'terrain')
OUTIMG = os.path.join(ROOT, 'test-shots', 'terrain')
T0 = time.time()
rng = np.random.default_rng(4242)
# zone de qualité : massif du Pic de l'Aurore, Mont des Neiges, Dent du Loup et vallée des Clarines
FOCUS = dict(x0=-3150, x1=-1200, z0=-300, z1=1650, edge=250)
BASE = 0.12  # densité hors de la zone de qualité


def log(*a):
    print(f'[{time.time() - T0:6.1f} s]', *a, flush=True)


def load_map(meta, key):
    m = meta[key]
    raw = zlib.decompress(open(os.path.join(TER, m['path']), 'rb').read())
    return np.frombuffer(raw, np.uint8).reshape(m['n'], m['n'], 4).astype(np.float32) / 255.0, m


def sampler(A, x0, cell):
    def f(x, z, order=1):
        return ndimage.map_coordinates(A, [(np.asarray(z) - x0) / cell, (np.asarray(x) - x0) / cell], order=order, mode='nearest')
    return f


def main():
    meta, H = load_heights()
    W = load_world()
    models = json.load(open(os.path.join(TER, 'rochers', 'rochers.json'), encoding='utf-8'))
    ids = sorted(models)
    MID = {k: i for i, k in enumerate(ids)}
    log('relief chargé', H.shape, 'modèles', len(ids))
    cell = meta['height']['cell']
    Hs = ndimage.gaussian_filter(H, 1.0)
    gz, gx = np.gradient(Hs, cell)
    S = np.degrees(np.arctan(np.hypot(gx, gz))).astype(np.float32)
    # courbure à 8 m (convexe < 0) et relief lissé à 60 m (écoulement de la glace)
    lap = ndimage.laplace(ndimage.gaussian_filter(H, 4.0)).astype(np.float32) / (cell * cell)
    Hg = ndimage.gaussian_filter(H, 30.0)
    ggz, ggx = np.gradient(Hg, cell)
    # sources d'éboulis : parois raides ou roche franche à moins de 50 m (les cônes naissent au pied des barres)
    src = ndimage.maximum_filter((S > 38).astype(np.float32), size=25)
    src = ndimage.gaussian_filter(src, 4.0)
    hS, sS, gxS, gzS, lapS = (sampler(a, X0, cell) for a in (H, S, gx.astype(np.float32), gz.astype(np.float32), lap))
    srcS = sampler(src.astype(np.float32), X0, cell)
    ggxS, ggzS = sampler(ggx.astype(np.float32), X0, cell), sampler(ggz.astype(np.float32), X0, cell)
    surf, sm = load_map(meta, 'surface')
    bio, bm = load_map(meta, 'biome')
    surfS = [sampler(surf[..., c], sm['x0'], sm['cell']) for c in range(4)]
    bioS = [sampler(bio[..., c], bm['x0'], bm['cell']) for c in range(4)]
    # teinte de la roche par biome (0 granite gris, 1 calcaire clair, 2 grès ocre, 3 basalte, 4 schiste verdâtre)
    n8 = bm['n']
    tint = np.zeros((n8, n8), np.uint8)
    TINT = {'volcan': 3, 'dunes': 2, 'savane': 2, 'garrigue': 2, 'prairies-ranch': 2, 'jungle': 4, 'foret-asiatique': 1, 'rizieres': 1}
    for b in W['BIOMES']:
        if b['id'] in TINT:
            tint[poly_mask(b['poly'], bm['cell'], n8, scale=1)] = TINT[b['id']]
    tintS = sampler(tint.astype(np.float32), bm['x0'], bm['cell'])
    # exclusions : distance aux voies (points denses), villages
    wp = []
    for w in meta.get('ways', []):
        P = np.asarray(w['pts'], np.float64)
        seg = np.hypot(*(P[1:] - P[:-1]).T)
        for a, b, L in zip(P[:-1], P[1:], seg):
            k = max(1, int(L / 2))
            t = np.linspace(0, 1, k, endpoint=False)[:, None]
            wp.append(np.hstack([a + (b - a) * t, np.full((k, 1), w['width'] / 2 + (4.5 if w['kind'] == 'route' else 1.5))]))
    WP = np.vstack(wp)
    wtree = cKDTree(WP[:, :2])
    sett = np.array([[s['x'], s['z'], s['r'] * 1.1] for s in W['SETTLEMENTS']] + [[0, 0, 720]], np.float64)

    def focus(x, z):
        e = FOCUS['edge']
        f = smoothstep(FOCUS['x0'] - e, FOCUS['x0'], x) * smoothstep(FOCUS['x1'] + e, FOCUS['x1'], x)
        f *= smoothstep(FOCUS['z0'] - e, FOCUS['z0'], z) * smoothstep(FOCUS['z1'] + e, FOCUS['z1'], z)
        return BASE + (1 - BASE) * f

    def free(x, z, r):
        d, i = wtree.query(np.stack([x, z], 1), distance_upper_bound=60)
        ok = ~(d < WP[np.minimum(i, len(WP) - 1), 2] + 3.0 + r)
        for sx, sz, sr in sett:
            ok &= np.hypot(x - sx, z - sz) > sr
        return ok

    def candidates(step, box=(-4000, 4000, -4000, 4000)):
        xs = np.arange(box[0], box[1], step)
        zs = np.arange(box[2], box[3], step)
        X, Z = np.meshgrid(xs, zs)
        X = X.ravel() + rng.uniform(0, step, X.size)
        Z = Z.ravel() + rng.uniform(0, step, Z.size)
        return X, Z

    out = []  # (x, z, scale, yaw, pitch, roll, model, r_foot, prio)

    def emit(x, z, model, scale, yaw, pitch=None, roll=None):
        n = len(x)
        pitch = np.zeros(n) if pitch is None else pitch
        roll = np.zeros(n) if roll is None else roll
        fx, fz = models[model]['foot']
        r = np.maximum(fx, fz) * scale
        ok = free(x, z, r * 0.8)
        for a in (x, z, scale, yaw, pitch, roll, r):
            pass
        out.append(np.stack([x[ok], z[ok], scale[ok], yaw[ok], pitch[ok], roll[ok], np.full(ok.sum(), MID[model]), r[ok]], 1))
        return int(ok.sum())

    def pick(p):
        return rng.uniform(0, 1, len(p)) < p

    def downhill_yaw(x, z):
        # +z local (front) vers l'aval : rotation Y d'angle θ : (0, 0, 1) → (sin θ, 0, cos θ)
        dx, dz = -gxS(x, z), -gzS(x, z)
        return np.arctan2(dx, dz)

    land = lambda x, z: hS(x, z) > 1.5  # noqa: E731
    # ------------------------------------------------------------------ 1. barres litées
    X, Z = candidates(6.0)
    h, s = hS(X, Z), sS(X, Z)
    rock = surfS[3](X, Z)
    # strates : pendage léger variable par massif, épaisseur 7-12 m
    T = 9.5 + 2.5 * np.sin(X / 900.0 + 1.3) * np.cos(Z / 1100.0)
    zeta = h + 0.035 * X + 0.02 * Z + 6.0 * np.sin(X / 230.0) * np.sin(Z / 310.0)
    frac = np.mod(zeta / T, 1.0)
    band = smoothstep(0.22, 0.05, np.minimum(frac, 1 - frac) * 2)
    rocky = np.maximum(rock, smoothstep(600, 760, h) * 0.7)
    p = band * smoothstep(28, 36, s) * smoothstep(72, 62, s) * smoothstep(0.25, 0.6, rocky) * focus(X, Z) * land(X, Z) * 0.85
    k = pick(p)
    X1, Z1, h1 = X[k], Z[k], h[k]
    big = rng.uniform(0, 1, len(X1))
    mdl = np.where(big < 0.34, 'barre-a', np.where(big < 0.62, 'barre-c', 'barre-b'))
    sc = rng.uniform(0.55, 1.15, len(X1)) * (0.8 + 0.4 * smoothstep(400, 800, h1))
    yaw = downhill_yaw(X1, Z1) + rng.normal(0, 0.12, len(X1))
    n1 = sum(emit(X1[mdl == m], Z1[mdl == m], m, sc[mdl == m], yaw[mdl == m]) for m in ('barre-a', 'barre-b', 'barre-c'))
    log(f'barres litées : {n1}')
    # dalles de lapiaz : replats rocheux 12-30°
    X, Z = candidates(14.0)
    h, s, rock = hS(X, Z), sS(X, Z), surfS[3](X, Z)
    p = smoothstep(10, 16, s) * smoothstep(32, 26, s) * smoothstep(0.2, 0.5, np.maximum(rock, smoothstep(450, 650, hS(X, Z)) * 0.6)) * focus(X, Z) * land(X, Z) * 0.5
    k = pick(p)
    X1, Z1 = X[k], Z[k]
    yaw = downhill_yaw(X1, Z1)
    # la dalle suit le versant : tangage vers l'aval (rotation X locale)
    pitch = np.radians(np.minimum(sS(X1, Z1), 28)) * 0.8
    n2 = emit(X1, Z1, 'dalle', rng.uniform(0.6, 1.3, len(X1)), yaw, pitch)
    log(f'dalles : {n2}')
    # ------------------------------------------------------------------ 2. arêtes et faces sommitales
    X, Z = candidates(7.0)
    h, s, lp = hS(X, Z), sS(X, Z), lapS(X, Z)
    ridge = smoothstep(0.004, 0.02, -lp)
    alt = smoothstep(250, 600, h)
    p = ridge * alt * smoothstep(12, 25, s) * smoothstep(75, 60, s) * focus(X, Z) * land(X, Z) * 0.75
    k = pick(p)
    X1, Z1, h1, r1 = X[k], Z[k], h[k], ridge[k]
    gend = rng.uniform(0, 1, len(X1)) < 0.35 + 0.4 * r1 * smoothstep(450, 800, h1)
    yaw = rng.uniform(0, 2 * np.pi, len(X1))
    n3 = emit(X1[gend], Z1[gend], 'gendarme', rng.uniform(0.6, 1.5, gend.sum()) * (0.7 + 0.5 * r1[gend]), yaw[gend],
              rng.normal(0, 0.08, gend.sum()), rng.normal(0, 0.08, gend.sum()))
    m = np.array(['bloc-a', 'bloc-b', 'bloc-c'])[rng.integers(0, 3, (~gend).sum())]
    for mm in ('bloc-a', 'bloc-b', 'bloc-c'):
        sel = m == mm
        n3 += emit(X1[~gend][sel], Z1[~gend][sel], mm, rng.uniform(0.9, 2.6, sel.sum()), yaw[~gend][sel],
                   rng.normal(0, 0.2, sel.sum()), rng.normal(0, 0.2, sel.sum()))
    log(f'arêtes : {n3}')
    # faces sommitales : blocs et barres sur les grandes faces lisses en altitude
    X, Z = candidates(11.0)
    h, s, rock = hS(X, Z), sS(X, Z), surfS[3](X, Z)
    p = smoothstep(520, 700, h) * smoothstep(18, 30, s) * smoothstep(70, 55, s) * focus(X, Z) * 0.6
    k = pick(p)
    X1, Z1 = X[k], Z[k]
    m = np.array(['bloc-a', 'bloc-b', 'bloc-c', 'barre-c', 'gendarme'])[rng.choice(5, len(X1), p=[0.25, 0.25, 0.15, 0.2, 0.15])]
    yaw = np.where(np.isin(m, ['barre-c']), downhill_yaw(X1, Z1), rng.uniform(0, 2 * np.pi, len(X1)))
    n4 = 0
    for mm in set(m.tolist()):
        sel = m == mm
        sc = rng.uniform(0.6, 1.0, sel.sum()) if mm in ('barre-c', 'gendarme') else rng.uniform(1.2, 3.0, sel.sum())
        n4 += emit(X1[sel], Z1[sel], mm, sc, yaw[sel], rng.normal(0, 0.15, sel.sum()), rng.normal(0, 0.15, sel.sum()))
    log(f'faces sommitales : {n4}')
    # ------------------------------------------------------------------ 3. cônes d'éboulis (granoclassement)
    X, Z = candidates(3.2)
    keep = focus(X, Z) > BASE * 0.99
    X, Z = X[keep], Z[keep]
    h, s, depo = hS(X, Z), sS(X, Z), surfS[2](X, Z)
    p = smoothstep(0.18, 0.55, depo) * smoothstep(16, 22, s) * smoothstep(44, 38, s) * smoothstep(0.15, 0.6, srcS(X, Z)) * focus(X, Z) * land(X, Z) * 0.7
    k = pick(p)
    X1, Z1, s1 = X[k], Z[k], s[k]
    toe = smoothstep(36, 24, s1)  # 1 au pied du cône
    size = np.exp(rng.normal(np.log(0.45 + 1.1 * toe), 0.45))  # m (diamètre visé)
    size = np.clip(size, 0.3, 3.2)
    m = np.array(['eboulis-a', 'eboulis-b', 'eboulis-c'])[rng.integers(0, 3, len(X1))]
    huge = size > 2.2
    m[huge] = np.array(['bloc-a', 'bloc-b'])[rng.integers(0, 2, huge.sum())]
    yaw = rng.uniform(0, 2 * np.pi, len(X1))
    n5 = 0
    for mm in set(m.tolist()):
        sel = m == mm
        canon = max(models[mm]['size'][0], models[mm]['size'][2])
        n5 += emit(X1[sel], Z1[sel], mm, size[sel] / canon, yaw[sel], rng.normal(0, 0.35, sel.sum()), rng.normal(0, 0.35, sel.sum()))
    log(f'éboulis : {n5}')
    # ------------------------------------------------------------------ 4. roches moutonnées (fonds glaciaires du Givre)
    X, Z = candidates(22.0)
    h, s = hS(X, Z), sS(X, Z)
    glac = smoothstep(0.2, 0.45, bioS[1](X, Z) + 0.6 * smoothstep(-1200, -1600, X))
    X, Z = candidates(16.0)
    h, s = hS(X, Z), sS(X, Z)
    glac = smoothstep(0.2, 0.45, bioS[1](X, Z) + 0.6 * smoothstep(-1200, -1600, X))
    p = smoothstep(120, 200, h) * smoothstep(26, 18, s) * smoothstep(1, 4, s) * glac * focus(X, Z) * land(X, Z) * 0.6
    k = pick(p)
    X1, Z1 = X[k], Z[k]
    # +x local vers l'aval de la glace : rotation Y d'angle θ : (1, 0, 0) → (cos θ, 0, −sin θ)
    yaw = np.arctan2(ggzS(X1, Z1), -ggxS(X1, Z1)) + rng.normal(0, 0.1, len(X1))
    m = np.where(rng.uniform(0, 1, len(X1)) < 0.55, 'moutonnee-a', 'moutonnee-b')
    n6 = sum(emit(X1[m == mm], Z1[m == mm], mm, rng.uniform(0.6, 1.5, (m == mm).sum()), yaw[m == mm]) for mm in ('moutonnee-a', 'moutonnee-b'))
    log(f'roches moutonnées : {n6}')
    # ------------------------------------------------------------------ 5. blocs erratiques épars
    X, Z = candidates(30.0)
    h, s = hS(X, Z), sS(X, Z)
    p = smoothstep(30, 60, h) * smoothstep(28, 18, s) * focus(X, Z) * land(X, Z) * 0.12 * (1 - bioS[0](X, Z))
    k = pick(p)
    X1, Z1 = X[k], Z[k]
    m = np.where(rng.uniform(0, 1, len(X1)) < 0.6, 'bloc-c', 'bloc-a')
    n7 = sum(emit(X1[m == mm], Z1[m == mm], mm, rng.uniform(0.5, 1.6, (m == mm).sum()), rng.uniform(0, 6.28, (m == mm).sum()),
                  rng.normal(0, 0.15, (m == mm).sum())) for mm in ('bloc-c', 'bloc-a'))
    log(f'blocs erratiques : {n7}')
    # ------------------------------------------------------------------ chevauchements (les plus gros d'abord)
    A = np.vstack(out)
    A = A[np.argsort(-A[:, 7])]
    tree = cKDTree(A[:, :2])
    rmax = A[:, 7].max()
    alive = np.ones(len(A), bool)
    for i in range(len(A)):
        if not alive[i]:
            continue
        for j in tree.query_ball_point(A[i, :2], A[i, 7] + rmax):
            if j > i and alive[j] and math.hypot(A[j, 0] - A[i, 0], A[j, 1] - A[i, 1]) < 0.75 * (A[i, 7] + A[j, 7]):
                # les éboulis se touchent (amas) ; les gros blocs ne s'interpénètrent pas
                if A[j, 7] > 0.7 or A[i, 7] < 0.9:
                    alive[j] = False
    A = A[alive]
    log(f'après chevauchements : {len(A)} rochers')
    # ------------------------------------------------------------------ altitude de la base (enfoncement)
    x, z, sc, yaw, mid = A[:, 0], A[:, 1], A[:, 2], A[:, 3], A[:, 6].astype(int)
    fam = np.array([models[ids[i]]['family'] for i in mid])
    fx = np.array([models[ids[i]]['foot'][0] for i in mid]) * sc
    fz = np.array([models[ids[i]]['foot'][1] for i in mid]) * sc
    hy = np.array([models[ids[i]]['size'][1] for i in mid]) * sc
    c, sn = np.cos(yaw), np.sin(yaw)
    hc = hS(x, z)
    # empreinte : centre, avant, arrière, côtés (repère local : x long axe, z avant)
    pts = []
    for lx, lz in ((0, 0), (0, 1), (0, -1), (1, 0), (-1, 0), (0.7, 0.7), (-0.7, -0.7), (0.7, -0.7), (-0.7, 0.7)):
        wx = x + (lx * fx * c + lz * fz * sn) * 0.8
        wz = z + (-lx * fx * sn + lz * fz * c) * 0.8
        pts.append(hS(wx, wz))
    P = np.stack(pts, 1)
    front = P[:, 1]
    base = np.where(fam == 'barre', np.minimum(front, hc) - 0.25 * hy,          # front posé, dos enterré dans la pente
           np.where(fam == 'moutonnee', P.min(1) - 0.3 * hy,                    # dos de baleine à moitié pris dans le sol
           np.where(fam == 'eboulis', P.min(1) - 0.18 * hy,                    # fragments posés, un peu enfouis
                    P.min(1) - (0.12 + 0.2 * rng.uniform(0, 1, len(x))) * hy)))  # blocs et gendarmes enfoncés
    dy = base - hc
    # mousse, neige, lichen, teinte
    wet, lush, snow = surfS[1](x, z), bioS[3](x, z), bioS[1](x, z)
    moss = np.clip(0.7 * lush + 0.6 * wet - 0.4 * smoothstep(500, 800, hc), 0, 1)
    lich = np.clip(0.3 + 0.6 * smoothstep(200, 700, hc) - 0.5 * moss, 0, 1)
    tn = np.round(tintS(x, z, order=0)).astype(np.uint8)
    F = np.stack([x, z, dy, sc, yaw, A[:, 4], A[:, 5], mid], 1).astype(np.float32)
    U = (np.stack([moss, snow, lich, tn / 255.0], 1) * 255 + 0.5).clip(0, 255).astype(np.uint8)
    U[:, 3] = tn
    blob = b'ROC1' + np.uint32(len(F)).tobytes() + F.tobytes() + U.tobytes()
    zb = zlib.compress(blob, 9)
    open(os.path.join(TER, 'rochers.bin'), 'wb').write(zb)
    stats = {ids[i]: int((mid == i).sum()) for i in range(len(ids))}
    inF = focus(x, z) > 0.5
    log(f'rochers.bin : {len(F)} rochers ({inF.sum()} sur le massif de l\'Aurore), {len(zb) / 1e6:.2f} Mo ; {stats}')
    json.dump({'n': int(len(F)), 'massif': int(inF.sum()), 'models': stats, 'bytes': len(zb), 'focus': FOCUS},
              open(os.path.join(TER, 'rochers', 'placement.json'), 'w', encoding='utf-8'), indent=1)
    # carte de contrôle du massif
    try:
        from PIL import Image
        x0, x1, z0, z1 = FOCUS['x0'] - 100, FOCUS['x1'] + 100, FOCUS['z0'] - 100, FOCUS['z1'] + 100
        sl = (slice(int((z0 - X0) / cell), int((z1 - X0) / cell)), slice(int((x0 - X0) / cell), int((x1 - X0) / cell)))
        sub = H[sl]
        ls = ndimage.sobel(sub, 1) * -0.7 + ndimage.sobel(sub, 0) * -0.7
        img = np.clip(150 + ls * 4, 0, 255).astype(np.uint8)
        rgb = np.stack([img] * 3, -1)
        colors = {'barre': (220, 60, 40), 'bloc': (250, 200, 30), 'eboulis': (40, 120, 240), 'moutonnee': (40, 220, 90)}
        sel = (x > x0) & (x < x1) & (z > z0) & (z < z1)
        for xi, zi, f in zip(x[sel], z[sel], fam[sel]):
            i, j = int((xi - x0) / cell), int((zi - z0) / cell)
            if 0 <= j < rgb.shape[0] and 0 <= i < rgb.shape[1]:
                rgb[max(0, j - 1):j + 2, max(0, i - 1):i + 2] = colors[f]
        Image.fromarray(rgb).save(os.path.join(OUTIMG, 'rochers-massif.png'))
    except Exception as e:  # noqa: BLE001
        log('carte de contrôle :', e)


if __name__ == '__main__':
    main()
