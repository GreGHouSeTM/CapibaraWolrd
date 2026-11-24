# Contrôle automatique du relief et des voies (spécialité Terrain & relief), sur les données exportées.
#
# Usage (depuis la racine du dépôt) :
#   <python> tools/terrain/qa.py [étiquette]        # écrit test-shots/terrain/qa-<étiquette>.json et des cartes PNG
# <python> = L:\CLAUDE\CapyWorld\.venv-blender\Scripts\python.exe
#
# Lit ce que le jeu lit (public/assets/terrain : tuiles 16 bits et meta.json), plus le relief naturel d'avant les voies
# (tools/terrain/cache/preroutes2.npy) pour mesurer les déblais et remblais. Mesures :
#  - voies : pente en long (p50, p95, max), déblai et remblai (max, part > 3 m et > 6 m, hors ouvrages déclarés),
#    profil posé sur le sol (écart profil / sol), rayon de courbure minimal, épingles et longueur en lacets ;
#  - relief : part des pentes > 35° et > 45° hors falaises voulues (et pire tuile de 512 m), détecteur de marches
#    régulières (oscillation périodique de la pente le long des lignes de plus grande pente), part de replats isolés
#    sur les versants, détecteur d'aiguilles (pics à laplacien extrême) et de parois en colonnes (cannelures
#    périodiques le long des courbes de niveau des faces raides).
# L'écart entre le ruban des routes et le sol se mesure dans le navigateur sur le maillage réel (tools/terrain-qa.cjs).
import json
import os
import sys
import zlib
import numpy as np
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import CACHE, ROOT, X0, grid, load_world, smoothstep  # noqa: E402
import carve  # noqa: E402

TER = os.path.join(ROOT, 'public', 'assets', 'terrain')
OUT = os.path.join(ROOT, 'test-shots', 'terrain')
GRADE = {'route': 0.08, 'piste': 0.10, 'chemin': 0.12, 'sentier': 0.25}


def load_heights():
    meta = json.load(open(os.path.join(TER, 'meta.json'), encoding='utf-8'))
    Hm = meta['height']
    n, T = Hm['n'], Hm['tile']
    H = np.zeros((n, n), dtype=np.float32)
    for tz in range(Hm['tiles']):
        for tx in range(Hm['tiles']):
            raw = zlib.decompress(open(os.path.join(TER, 'h', f'{tx}_{tz}.bin'), 'rb').read())
            r = np.frombuffer(raw, dtype='<u2').reshape(T, T).astype(np.int64)
            # prédiction planaire : le résidu est la différence croisée, donc u = somme cumulée 2D (modulo 2¹⁶)
            u = np.cumsum(np.cumsum(r, axis=0), axis=1) & 0xFFFF
            H[tz * T:(tz + 1) * T, tx * T:(tx + 1) * T] = u * Hm['scale'] + Hm['offset']
    return meta, H


def bil(H, x, z, cell=2.0):
    fi = (np.asarray(x) - X0) / cell
    fj = (np.asarray(z) - X0) / cell
    return ndimage.map_coordinates(H, [fj, fi], order=1, mode='nearest')


def pct(a, q):
    return float(np.percentile(a, q)) if len(a) else 0.0


# ------------------------------------------------------------------------------------------------ voies
def way_metrics(w, H, N0, ouvrages):
    P = np.asarray(w['pts'], dtype=np.float64)
    y = np.asarray(w['y'], dtype=np.float64)
    seg = np.hypot(*(P[1:] - P[:-1]).T)
    s = np.concatenate([[0], np.cumsum(seg)])
    L = float(s[-1])
    ok = seg > 0.5
    gr = np.abs(np.diff(y))[ok] / seg[ok]
    # pente sur 20 m glissants (la plateforme réelle), plus parlante que le pas des points
    k = max(1, int(round(20 / max(float(np.median(seg)), 0.5))))
    gw = np.abs(y[k:] - y[:-k]) / np.maximum(s[k:] - s[:-k], 1e-6) if len(y) > k else gr
    # tronçons déclarés en ouvrage (pont, viaduc, mur de soutènement) : exclus des déblais et remblais « nus »
    inside = np.zeros(len(P), bool)
    for o in ouvrages:
        if o.get('way') == w['id']:
            inside |= (s >= o['s0'] - 1) & (s <= o['s1'] + 1)
    nat = bil(N0, P[:, 0], P[:, 1]) if N0 is not None else bil(H, P[:, 0], P[:, 1])
    fin = bil(H, P[:, 0], P[:, 1])
    cut = nat - y   # > 0 : déblai (tranchée)
    fill = y - nat  # > 0 : remblai
    bare = ~inside
    seglen = np.gradient(s)
    on = np.abs(fin - y)
    # rayon de courbure (cercle circonscrit à des triplets espacés d'environ 6 m)
    q = max(1, int(round(6 / max(float(np.median(seg)), 0.5))))
    R = np.full(len(P), np.inf)
    if len(P) > 2 * q:
        a, b, c = P[:-2 * q], P[q:-q], P[2 * q:]
        ab, bc, ca = np.hypot(*(b - a).T), np.hypot(*(c - b).T), np.hypot(*(a - c).T)
        cr = np.abs((b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0]))
        R[q:-q] = np.where(cr > 1e-6, ab * bc * ca / np.maximum(2 * cr, 1e-9), np.inf)
    # épingles : rotation cumulée ≥ 120° sur 60 m de tracé
    head = np.unwrap(np.arctan2(*(P[1:] - P[:-1])[:, ::-1].T))
    hs = np.concatenate([[0], np.cumsum(np.abs(np.diff(head)))])
    sm = (s[1:] + s[:-1]) / 2
    hp = []
    i = 0
    while i < len(sm):
        j = np.searchsorted(sm, sm[i] + 60)
        if j < len(sm) and hs[min(j, len(hs) - 1)] - hs[i] >= np.radians(120):
            hp.append(float(sm[(i + j) // 2]))
            i = j
        else:
            i += 1
    lac = 0.0
    for a_, b_ in zip(hp[:-1], hp[1:]):
        if b_ - a_ < 400:
            lac += b_ - a_
    return {
        'id': w['id'], 'kind': w['kind'], 'longueur': round(L),
        'pente_p50': round(100 * pct(gw, 50), 1), 'pente_p95': round(100 * pct(gw, 95), 1), 'pente_max': round(100 * float(gw.max() if len(gw) else 0), 1),
        'cible': round(100 * GRADE.get(w['kind'], 0.12)),
        'deblai_max': round(float(np.max(cut[bare], initial=0)), 1), 'remblai_max': round(float(np.max(fill[bare], initial=0)), 1),
        'part_3m': round(100 * float(seglen[bare & (np.abs(cut) > 3)].sum() / L), 1),
        'part_6m': round(100 * float(seglen[bare & (np.abs(cut) > 6)].sum() / L), 1),
        'deblai6_m': round(float(seglen[bare & (cut > 6)].sum())), 'remblai6_m': round(float(seglen[bare & (fill > 6)].sum())),
        'ouvrages_m': round(float(seglen[inside].sum())),
        'profil_sol_p95': round(pct(on, 95), 2), 'profil_sol_max': round(float(on.max()), 2),
        'rayon_min': round(float(R.min()), 1) if np.isfinite(R.min()) else None,
        'epingles': len(hp), 'lacets_m': round(lac),
    }


# ------------------------------------------------------------------------------------------------ relief
def autocorr_peak(sig, lag0, lag1):
    sig = sig - sig.mean()
    v = float((sig * sig).sum())
    if v <= 1e-9:
        return 0.0
    best = 0.0
    for lag in range(lag0, min(lag1, len(sig) // 2)):
        c = float((sig[:-lag] * sig[lag:]).sum()) / v
        best = max(best, c)
    return best


def periodic_score(H, S, gx, gz, mask, along_contour, rng, n_seeds, length=240.0, step=2.0):
    """Part des profils dont la pente locale oscille périodiquement (marches, cannelures)."""
    cand = np.argwhere(mask)
    if len(cand) == 0:
        return 0.0, 0, []
    pick = cand[rng.choice(len(cand), size=min(n_seeds, len(cand)), replace=False)]
    t = np.arange(-length / 2, length / 2 + step / 2, step)
    hits, tot, where = 0, 0, []
    for j, i in pick:
        dx, dz = gx[j, i], gz[j, i]
        l = np.hypot(dx, dz)
        if l < 1e-6:
            continue
        ux, uz = dx / l, dz / l
        if along_contour:
            ux, uz = -uz, ux
        x0, z0 = X0 + i * 4.0, X0 + j * 4.0
        px, pz = x0 + ux * t, z0 + uz * t
        h = bil(H, px, pz)
        if along_contour:
            sig = h - ndimage.uniform_filter1d(h, 21, mode='nearest')  # cannelures : écarts au profil moyen
            amp = float(np.std(sig))
            ok = amp > 0.8
        else:
            sl = np.gradient(h, step)
            sig = sl - ndimage.uniform_filter1d(sl, 21, mode='nearest')
            amp = float(np.std(sig))
            ok = amp > 0.12
        tot += 1
        pk = autocorr_peak(sig, 4, 60) if ok else 0.0
        if pk > 0.45:
            hits += 1
            where.append((float(x0), float(z0)))
    return (hits / tot if tot else 0.0), tot, where


def relief_metrics(H, W, meta):
    n = H.shape[0]
    cell = 2.0
    gz, gx = np.gradient(H.astype(np.float64), cell)
    S = np.degrees(np.arctan(np.hypot(gx, gz)))
    X4, Z4, n4 = grid(4.0)
    cliff4 = carve.cliff_mask(W, X4, Z4, 4.0, n4)
    vm4 = np.load(os.path.join(CACHE, 'valleym4.npy'))
    wanted4 = cliff4 > 0.3
    # roche voulue (J2) : pyramides sommitales, parois de cirques, couronnes des mesas, pitons (gen_terrain.py)
    if os.path.exists(os.path.join(CACHE, 'roche4.npy')):
        wanted4 |= np.load(os.path.join(CACHE, 'roche4.npy')) > 0.5
    up = lambda a: np.repeat(np.repeat(a, 2, 0), 2, 1)
    wanted = up(wanted4)
    valley = up(vm4 > 0.5)
    land = (H > 0.5) & ~valley
    wild = land & ~wanted
    nl = wild.sum()
    out = {}
    for th in (30, 35, 40, 45, 55):
        out[f'part_{th}'] = round(100 * float((S[wild] > th).sum()) / nl, 2)
    out['part_45_falaises'] = round(100 * float((S[land & wanted] > 45).sum()) / max(1, (land & wanted).sum()), 1)
    # part des terres classées en falaise ou roche voulue (pentes fortes admises) : à surveiller, pour ne pas tricher
    out['part_voulue'] = round(100 * float((land & wanted).sum()) / max(1, land.sum()), 2)
    # pire tuile de 512 m (part > 35° hors falaises)
    T = 256
    worst = (0.0, None)
    tiles35 = []
    for tz in range(n // T):
        for tx in range(n // T):
            sl = (slice(tz * T, (tz + 1) * T), slice(tx * T, (tx + 1) * T))
            m = wild[sl]
            if m.sum() < 0.2 * T * T:
                continue
            p = float((S[sl][m] > 35).mean())
            tiles35.append(p)
            if p > worst[0]:
                worst = (p, (round(X0 + (tx + 0.5) * 512), round(X0 + (tz + 0.5) * 512)))
    out['tuile_35_pire'] = round(100 * worst[0], 1)
    out['tuile_35_pire_xz'] = worst[1]
    out['tuiles_35_sup4'] = int(sum(p > 0.04 for p in tiles35))
    # versants (pente régionale lissée sur ~30 m)
    Hs = ndimage.gaussian_filter(H.astype(np.float64), 7)
    gzs, gxs = np.gradient(Hs, cell)
    Sr = np.degrees(np.arctan(np.hypot(gxs, gzs)))
    # replats isolés sur les versants : pente locale (8 m) < 8° au milieu d'un versant de 18 à 40°
    H8 = ndimage.uniform_filter(H.astype(np.float64), 4)
    gz8, gx8 = np.gradient(H8, cell)
    S8 = np.degrees(np.arctan(np.hypot(gx8, gz8)))
    vers = wild & (Sr > 18) & (Sr < 40)
    out['replats_versants'] = round(100 * float((S8[vers] < 8).sum()) / max(1, vers.sum()), 2)
    # marches régulières : profils de 240 m le long de la plus grande pente (graines tirées sur les versants)
    rng = np.random.default_rng(7)
    m4 = (Sr[::2, ::2] > 15) & (Sr[::2, ::2] < 42) & wild[::2, ::2]
    sc, nt, wh = periodic_score(H, Sr, gxs[::2, ::2], gzs[::2, ::2], m4, False, rng, 3000)
    out['marches_profils'] = round(100 * sc, 2)
    out['marches_n'] = nt
    # parois en colonnes : profils le long des courbes de niveau sur les faces > 45° (hors falaises voulues et avec)
    m4c = (S[::2, ::2] > 45) & land[::2, ::2]
    sc2, nt2, wh2 = periodic_score(H, S, gxs[::2, ::2], gzs[::2, ::2], m4c, True, rng, 1500, length=160.0)
    out['colonnes_profils'] = round(100 * sc2, 2)
    out['colonnes_n'] = nt2
    # aiguilles : sommets locaux qui dominent leur anneau de 6 m de plus de 5 m (pente moyenne > 40°)
    ring = ndimage.uniform_filter(H.astype(np.float64), 7) * 49 - ndimage.uniform_filter(H.astype(np.float64), 5) * 25
    ring /= 24
    mx = ndimage.maximum_filter(H, size=5) == H
    spike = mx & (H - ring > 5.0) & land
    area_km2 = land.sum() * 4 / 1e6
    out['aiguilles'] = int(spike.sum())
    out['aiguilles_km2'] = round(float(spike.sum()) / area_km2, 2)
    lap = (np.roll(H, 1, 0) + np.roll(H, -1, 0) + np.roll(H, 1, 1) + np.roll(H, -1, 1) - 4 * H) / (cell * cell)
    out['laplacien_p999'] = round(float(np.percentile(np.abs(lap[land]), 99.9)), 3)
    sp = np.argwhere(spike)
    out['aiguilles_xz'] = [[round(X0 + i * 2), round(X0 + j * 2)] for j, i in sp[:12]]
    out['marches_xz'] = [[round(a), round(b)] for a, b in wh[:12]]
    out['colonnes_xz'] = [[round(a), round(b)] for a, b in wh2[:12]]
    return out, S, wild, wanted, spike, wh, wh2


def save_maps(tag, H, S, wild, wanted, spike, wh, wh2, ways):
    from PIL import Image, ImageDraw
    from common import hillshade
    sh = hillshade(H[::2, ::2].astype(np.float64), 4.0)
    rgb = np.stack([sh * 200 + 30] * 3, -1)
    s4, w4, c4 = S[::2, ::2], wild[::2, ::2], wanted[::2, ::2]
    rgb[(H[::2, ::2] <= 0.5)] = (40, 70, 120)
    rgb[w4 & (s4 > 35)] = (240, 200, 40)
    rgb[w4 & (s4 > 45)] = (230, 40, 30)
    rgb[c4 & (s4 > 45)] = (150, 60, 160)
    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    f = lambda x, z: ((x - X0) / 4.0, (z - X0) / 4.0)
    for w in ways:
        pts = [f(*p) for p in w['pts']]
        d.line(pts, fill=(30, 220, 255) if w.get('vehicles') else (255, 255, 255), width=2)
    for j, i in np.argwhere(spike)[:4000]:
        d.ellipse([i / 2 - 3, j / 2 - 3, i / 2 + 3, j / 2 + 3], outline=(255, 0, 255))
    for x, z in wh:
        a, b = f(x, z)
        d.rectangle([a - 4, b - 4, a + 4, b + 4], outline=(0, 255, 0))
    for x, z in wh2:
        a, b = f(x, z)
        d.rectangle([a - 4, b - 4, a + 4, b + 4], outline=(255, 128, 0))
    img.save(os.path.join(OUT, f'qa-{tag}-carte.png'))


def main():
    tag = sys.argv[1] if len(sys.argv) > 1 else 'courant'
    os.makedirs(OUT, exist_ok=True)
    W = load_world()
    meta, H = load_heights()
    pre = os.path.join(CACHE, 'preroutes2.npy')
    N0 = np.load(pre) if os.path.exists(pre) else None
    ways = meta.get('ways', [])
    ouvrages = meta.get('ouvrages', [])
    rows = [way_metrics(w, H, N0, ouvrages) for w in ways]
    rel, S, wild, wanted, spike, wh, wh2 = relief_metrics(H, W, meta)
    res = {'voies': rows, 'relief': rel, 'ouvrages': len(ouvrages)}
    json.dump(res, open(os.path.join(OUT, f'qa-{tag}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    save_maps(tag, H, S, wild, wanted, spike, wh, wh2, ways)
    cols = ['id', 'kind', 'longueur', 'pente_p50', 'pente_p95', 'pente_max', 'cible', 'deblai_max', 'remblai_max', 'part_3m', 'part_6m',
            'deblai6_m', 'remblai6_m', 'ouvrages_m', 'profil_sol_p95', 'profil_sol_max', 'rayon_min', 'epingles', 'lacets_m']
    print('| ' + ' | '.join(cols) + ' |')
    print('|' + ' --- |' * len(cols))
    for r in rows:
        print('| ' + ' | '.join(str(r[c]) for c in cols) + ' |')
    veh = [r for r in rows if r['kind'] in ('route', 'piste', 'chemin')]
    tot = sum(r['longueur'] for r in veh) or 1
    print(f"\nvoies carrossables : {len(veh)} voies, {tot / 1000:.1f} km ; pente p95 > cible : "
          f"{sum(r['pente_p95'] > r['cible'] for r in veh)} voies ; déblai > 6 m sans ouvrage : {sum(r['deblai6_m'] for r in veh)} m ; "
          f"remblai > 6 m sans ouvrage : {sum(r['remblai6_m'] for r in veh)} m ; épingles : {sum(r['epingles'] for r in rows)} ; "
          f"lacets : {sum(r['lacets_m'] for r in rows)} m ; ouvrages déclarés : {len(ouvrages)}")
    print('relief :', json.dumps({k: v for k, v in rel.items() if not k.endswith('_xz')}, ensure_ascii=False))
    print('aiguilles (exemples) :', rel['aiguilles_xz'][:6], '; marches :', rel['marches_xz'][:6], '; colonnes :', rel['colonnes_xz'][:6])


if __name__ == '__main__':
    main()
