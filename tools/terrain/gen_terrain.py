# Générateur hors ligne du relief de l'Île aux Sept Sources (8 × 8 km) — spécialité Terrain & relief.
#
# Usage (depuis la racine du dépôt) :
#   npx vite-node tools/terrain/dump-valley.ts        # vallée de Capyville d'origine → tools/terrain/cache/
#   node tools/terrain/export-map.mjs                 # world-map.ts → tools/terrain/cache/world-map.json
#   <python> tools/terrain/gen_terrain.py [étapes]    # étapes : formes, erosion, export (toutes par défaut)
# <python> = L:\CLAUDE\CapyWorld\.venv-blender\Scripts\python.exe (numpy, scipy, pillow, numba).
#
# Chaîne (bible du monde §4.6) :
#  1. formes dirigées (forms.py, carve.py) sur la grille de 4 m : côte, fonds de relief, chaînes, sommets, cols,
#     plats des villes et villages, lacs, lits des rivières, vallée de Capyville imposée (masque) ;
#  2. érosion (erosion.py) : hydraulique par gouttes en trois passes (16 m, 8 m, 4 m), thermique (talus),
#     replats, puis passe fine à 2 m (gouttes, thermique, microrelief) ;
#  3. réimposition des éléments fixes, contrôles (pentes, altitudes) et exports (export.py).
import os
import sys
import time
import numpy as np
from common import CACHE, ROOT, grid, load_world, color_relief, slope_deg, smoothstep, fbm
import forms
import carve

OUT_IMG = os.path.join(ROOT, 'test-shots', 'terrain')
os.makedirs(OUT_IMG, exist_ok=True)
T0 = time.time()


def log(*a):
    print(f'[{time.time() - T0:6.1f} s]', *a, flush=True)


def stage_forms():
    W = load_world()
    cell = 4.0
    X, Z, n = grid(cell)
    log('grille', n, '×', n, 'au pas de', cell, 'm')
    d, cslope, cliffH = forms.coast(W, X, Z, cell, n)
    log('côte')
    h = forms.relief_zones(W, X, Z, cell, n)
    log('fonds de relief', float(h.min()), float(h.max()))
    # les fonds montent doucement depuis le rivage (sauf falaises, qui gardent leur plateau)
    h = 2 + (h - 2) * smoothstep(-20, 450, d) ** 0.7
    h = forms.chains(h, W, X, Z, cell, n)
    log('chaînes')
    h = forms.peaks(h, W, X, Z, cell, n)
    h, cwall = forms.cirques(h, W, X, Z, cell, n)
    log('sommets et cirques')
    h = forms.cols(h, W, X, Z, cell, n)
    meta, routes, ref, det = carve.load_valley()
    h = carve.exit_valleys(h, routes, W, X, Z, cell, n)
    h = carve.flats(h, W, X, Z)
    h = carve.lakes(h, W, X, Z, cell, n)
    dense = {rv['id']: carve.meander(rv) for rv in W['RIVERS']}
    np.save(os.path.join(CACHE, 'rivers.npy'), np.array([dense], dtype=object), allow_pickle=True)
    h = carve.rivers(h, W, X, Z, cell, n, dense=dense)
    h = forms.apply_coast(h, d, cslope, cliffH, W, X, Z)
    # les plats des villes reprennent la main sur les levées des rivières (hors du lit et des lacs)
    wmask = carve.water_mask(W, X, Z, cell, n, margin=3, dense=dense)
    hf = carve.flats(h.copy(), W, X, Z)
    h = h + (hf - h) * (1 - wmask) * (d > 15)
    log('plats, lacs, rivières, côte')
    m = carve.valley_mask(X, Z, routes)
    old = carve.sample_ref(ref, meta, X, Z)
    h = h + (old - h) * m
    log('vallée imposée')
    np.save(os.path.join(CACHE, 'forms4.npy'), h.astype(np.float32))
    # roche voulue : pyramides sommitales, parois de cirques, couronnes des mesas, pitons (pentes fortes admises)
    rock = forms.rock_wanted(W, X, Z, cell, n, cwall) * (1 - m)
    np.save(os.path.join(CACHE, 'roche4.npy'), rock.astype(np.float32))
    np.save(os.path.join(CACHE, 'coastd4.npy'), d.astype(np.float32))
    np.save(os.path.join(CACHE, 'valleym4.npy'), m.astype(np.float32))
    report(h, cell, 'formes')
    return h


def report(h, cell, tag):
    color_relief(h, cell, os.path.join(OUT_IMG, f'{tag}-relief.png'), size=1600)
    s = slope_deg(h, cell)
    land = h > 1
    vm = os.path.join(CACHE, 'valleym4.npy')
    wild = land
    if os.path.exists(vm) and h.shape[0] == 2048:
        wild = land & (np.load(vm) < 0.5)  # la vallée de Capyville (imposée) est exclue des statistiques
    sl = s[wild]
    pct = lambda a, b: 100 * float(((sl >= a) & (sl < b)).mean())
    log(f'{tag} : altitude max {float(h.max()):.0f} m ; terre {100 * float(land.mean()):.1f} % ; pentes : '
        f'≤15° {pct(0, 15):.1f} %, 15-33° {pct(15, 33):.1f} %, 33-42° {pct(33, 42):.1f} %, >42° {pct(42, 90):.2f} %')
    # carte des pentes (vert praticable, jaune grimpe, rouge glisse/falaise)
    from PIL import Image
    rgb = np.zeros(h.shape + (3,), dtype=np.uint8)
    rgb[...] = (40, 70, 120)
    rgb[land & (s < 15)] = (120, 190, 100)
    rgb[land & (s >= 15) & (s < 33)] = (60, 140, 60)
    rgb[land & (s >= 33) & (s < 42)] = (230, 200, 40)
    rgb[land & (s >= 42)] = (220, 40, 30)
    Image.fromarray(rgb).resize((1600, 1600), Image.NEAREST).save(os.path.join(OUT_IMG, f'{tag}-pentes.png'))




# ================================================================================================ ÉROSION
import erosion as ER
from scipy import ndimage


def resample(a, factor):
    """Change de résolution une grille de nœuds (facteur > 1 : affine ; < 1 : grossit)."""
    n = a.shape[0]
    m = int(round(n * factor))
    c = np.arange(m) / factor
    J, I = np.meshgrid(c, c, indexing='ij')
    return ndimage.map_coordinates(a, [J, I], order=3 if factor > 1 else 1, mode='nearest').astype(np.float32)


def talus_map(h, W, X, Z, cliff, cell, rock=None):
    """Angle de talus (tan) de l'érosion thermique : 33° en terre, 50° en roche voulue, 70° aux falaises voulues."""
    deg = np.full(h.shape, 33.0)
    if rock is not None:
        deg = deg + (50 - deg) * rock
    deg = deg + (70 - deg) * np.clip(cliff * 1.4, 0, 1)
    return np.tan(np.radians(deg)).astype(np.float64)


def slope_k(h, cliff, rock=None, W=None):
    """Pente maximale admise (tan) : 31-33° partout où l'on marche (versants irréguliers, jamais un plan),
    36° sur le haut du cône du Fuji, 55° en roche voulue, 70° aux falaises voulues."""
    n = h.shape[0]
    X, Z, _ = grid(EXTENT_CELL[n])
    deg = 33 - 2.0 * (fbm(X / 260, Z / 260, 3, 95) * 0.5 + 0.5)
    # haute montagne : la roche gagne au-dessus de 450 m (pentes à grimper, puis faces rocheuses vers 700 m)
    deg = deg + 5 * smoothstep(400, 600, h) + 5 * smoothstep(600, 800, h)
    if W is not None:
        fj = next(p for p in W['WORLD_PEAKS'] if p['id'] == 'fuji')
        deg = deg + (36 - deg) * smoothstep(0.55 * fj['base'], 0.35 * fj['base'], np.hypot(X - fj['x'], Z - fj['z']))
    if rock is not None:
        deg = deg + (55 - deg) * rock
    deg = deg + (70 - deg) * np.clip(cliff * 1.4, 0, 1)
    return np.tan(np.radians(deg)).astype(np.float64)


EXTENT_CELL = {2048: 4.0, 4096: 2.0, 1024: 8.0, 512: 16.0}
PEAK_K = {'alpin': 0.74, 'volcan': 0.70, 'dome': 0.60, 'arrondi': 0.62, 'butte': 0.55, 'dormeur': 0.8, 'mesa': 1.3}


def restore_peaks(h, forms_h, W, X, Z, cell, n, shrink=1.0, keep=None):
    """Les sommets repères gardent leur altitude (±5 %) : on reprend la forme d'origine sous un cône de pente
    bornée (40° en haute montagne) centré sur le sommet. Les versants plus bas restent ceux de la simulation."""
    from common import bbox_slices
    for pk in W['WORLD_PEAKS']:
        K = PEAK_K.get(pk['shape'])
        if K is None:
            continue
        K = K * shrink
        R = pk['y'] / K * 0.8 + 60
        sj, si = bbox_slices([[pk['x'], pk['z']]], R, cell, n)
        dx, dz = X[sj, si] - pk['x'], Z[sj, si] - pk['z']
        r = np.hypot(dx, dz)
        th = np.arctan2(dx, -dz)
        kk = K * np.ones_like(r)
        if pk['shape'] == 'alpin':
            kk = K * (1 + 0.16 * np.cos(3 * th + 1.3) + 0.05 * fbm(dx / 80, dz / 80, 2, 97))  # trois arêtes moins raides
        top = 60 if pk['shape'] == 'mesa' else 20
        y = pk['y'] / (0.93 if pk['shape'] == 'volcan' else 1)
        cone = y - kk * np.maximum(r - top, 0) - (0 if pk['shape'] == 'mesa' else 0.004 * np.minimum(r, top) ** 2)
        if pk['shape'] == 'volcan':
            cone = cone - 42 * smoothstep(70, 40, r)
            # barrancos rayonnants : ravines sur le cône, plus profondes à mi-pente
            u = np.clip(r / (pk['y'] / K), 0, 1)
            # barrancos irréguliers (crêtes d'un bruit en coordonnées polaires, plus de motif périodique)
            from common import ridged as _rd
            q = th * (5.5 + 9 * u) / np.pi + 1.8 * fbm(dx / 300, dz / 300, 3, 98)
            cone = cone - 12 * (1 - _rd(q, u * 3.0, 3, 99)) * smoothstep(0.08, 0.3, u)
        # le cône ne remplace que le haut du relief (au-dessus des deux tiers de la hauteur)
        hh = h[sj, si]
        w = smoothstep(pk['y'] * 0.3, pk['y'] * 0.55, cone)
        if keep is not None:
            w = w * (1 - keep[sj, si])  # lacs, lits et plats ne sont jamais remblayés
        h[sj, si] = np.maximum(hh, hh + (cone - hh) * w)
    return h


def limit_slopes(h, cell, cliff, fixed, rock=None, W=None):
    H = h.astype(np.float64)
    ER.slope_limit(H, slope_k(H, cliff, rock, W), fixed.astype(np.float64), cell, 6)
    return H


def stage_erosion():
    W = load_world()
    h4 = np.load(os.path.join(CACHE, 'forms4.npy')).astype(np.float64)
    m4 = np.load(os.path.join(CACHE, 'valleym4.npy'))
    dense = np.load(os.path.join(CACHE, 'rivers.npy'), allow_pickle=True)[0]
    X, Z, n = grid(4.0)
    prot = carve.protect_mask(W, X, Z, 4.0, n, dense=dense)
    cliff = carve.cliff_mask(W, X, Z, 4.0, n)
    rock = np.load(os.path.join(CACHE, 'roche4.npy')).astype(np.float64)
    # falaises et roche voulues : peu d'érosion par gouttes (plus de cannelures ni d'aiguilles sur les parois)
    E4 = np.clip((1 - m4) * (1 - prot) * (1 - 0.85 * cliff) * (1 - 0.6 * rock), 0, 1).astype(np.float64)
    log('masques d\'érosion')
    # pentes bornées dès les formes (la thermique ne déplace la matière que d'une maille par itération)
    fixed = ((m4 > 0.5) | (prot > 0.5)).astype(np.float32)
    forms_h = h4.copy()
    h4 = limit_slopes(h4, 4.0, cliff, fixed, rock, W)
    # les sommets repères reprennent leur altitude sous un cône borné (36-38°, ravines irrégulières) ; ce cône est de la
    # roche de haute montagne (masque roche voulue complété là où il dépasse 38°)
    pre = h4.copy()
    h4 = restore_peaks(h4, forms_h, W, X, Z, 4.0, n, keep=np.clip(np.maximum(prot, m4), 0, 1))
    raised = ((h4 - pre) > 3) & (slope_deg(h4.astype(np.float32), 4.0) > 38)
    rock = np.maximum(rock, ndimage.binary_dilation(raised, iterations=2).astype(np.float64) * 0.9)
    np.save(os.path.join(CACHE, 'roche4.npy'), rock.astype(np.float32))
    report(h4.astype(np.float32), 4.0, 'bornees')
    hyd = W['TERRAIN_RULES']['hydraulic']
    dep4 = np.zeros_like(h4)
    # trois passes du grossier au fin : chaque passe ajoute sa différence au relief de 4 m
    # capacité en mètres de sédiment par unité de pente et de vitesse (les facteurs de TERRAIN_RULES sont ramenés au mètre : 4 → 1,5 / 1,0 / 0,8)
    for cell, drops, rad, cap, er in ((16.0, 500_000, 2.5, 1.5, 0.3), (8.0, 1_200_000, 2.5, 1.0, 0.3), (4.0, hyd['droplets'], hyd['radius'], 0.8, hyd['erosion'])):
        f = 4.0 / cell
        hs = resample(h4, f).astype(np.float64) if f != 1 else h4.copy()
        Es = resample(E4, f).astype(np.float64) if f != 1 else E4
        ds = np.zeros_like(hs)
        before = hs.copy()
        ER.droplets(hs, Es, ds, drops, int(cell * 7), cell, hyd['inertia'], cap, 0.01, hyd['deposition'], er,
                    hyd['evaporation'], 4.0, rad, hyd['maxLifetime'], 0.2)
        diff = hs - before
        if f != 1:
            diff = resample(diff, 1 / f)[:n, :n]
            ds = resample(ds, 1 / f)[:n, :n]
        h4 += diff
        dep4 += ds
        log(f'gouttes au pas de {cell:.0f} m : {drops} gouttes, creusement max {float(-diff.min()):.1f} m, dépôt max {float(diff.max()):.1f} m')
    np.save(os.path.join(CACHE, 'forms_h4.npy'), forms_h.astype(np.float32))
    # érosion thermique (talus d'éboulis)
    scree = np.zeros_like(h4)
    tal = talus_map(h4, W, X, Z, cliff, 4.0, rock)
    Et = np.clip((1 - m4) * (1 - prot), 0, 1).astype(np.float64)
    ER.thermal(h4, tal, Et, 60, 4.0, 0.5, scree)
    log('érosion thermique')
    np.save(os.path.join(CACHE, 'eroded4.npy'), h4.astype(np.float32))
    np.save(os.path.join(CACHE, 'dep4.npy'), dep4.astype(np.float32))
    np.save(os.path.join(CACHE, 'scree4.npy'), scree.astype(np.float32))
    report(h4.astype(np.float32), 4.0, 'erosion')




def crops(h, cell, tag, centers=(('givre', -2000, 700), ('fuji', 300, 2700), ('dormeur', 1500, 0), ('seine', -300, -1500))):
    """Vues rapprochées (2 km de côté) en ombrage, pour juger le modelé."""
    from PIL import Image
    from common import X0
    for name, cx, cz in centers:
        i = int((cx - X0) / cell)
        j = int((cz - X0) / cell)
        r = int(1000 / cell)
        sub = h[max(0, j - r):j + r, max(0, i - r):i + r]
        color_relief(sub, cell, os.path.join(OUT_IMG, f'{tag}-zoom-{name}.png'), size=800)


def diag(h, cell, W):
    """Part des pentes > 42° par cause (falaises voulues, haute montagne, reste)."""
    X, Z, n = grid(cell)
    s = slope_deg(h, cell)
    m = np.load(os.path.join(CACHE, 'valleym4.npy')) < 0.5
    land = (h > 1) & m
    cl = carve.cliff_mask(W, X, Z, cell, n) > 0.3
    high = h > 300
    st = s > 42
    tot = land.sum()
    log(f'> 42° : falaises voulues {100 * (st & land & cl).sum() / tot:.2f} %, au-dessus de 300 m {100 * (st & land & ~cl & high).sum() / tot:.2f} %, '
        f'ailleurs {100 * (st & land & ~cl & ~high).sum() / tot:.2f} % ; ≤ 33° hors falaises et vallée : {100 * ((s <= 33) & land & ~cl).sum() / (land & ~cl).sum():.1f} %')


# ================================================================================================ REPLATS, PASSE FINE À 2 M
def replats(h, E, cell, W):
    """Replats naturels **rares et irréguliers** (haltes, emplacements de cabanes ou de belvédères) : au plus un par
    case de 200 m, seulement sur les versants de 14 à 30°, ellipse allongée le long des courbes de niveau, taille et
    position tirées au hasard. Jamais d'étagement périodique (l'ancien découpage par tranches d'altitude faisait des
    escaliers sur tous les versants)."""
    X, Z, n = grid(cell)
    hs = ndimage.gaussian_filter(h, 2)
    gz, gx = np.gradient(hs, cell)
    s = np.degrees(np.arctan(np.hypot(gx, gz)))
    from common import _hash
    C = 200.0
    ci = np.arange(int(-4096 / C), int(4096 / C) + 1)
    CI, CJ = np.meshgrid(ci, ci)
    px = (CI + 0.15 + 0.7 * _hash(CI, CJ, 611)) * C
    pz = (CJ + 0.15 + 0.7 * _hash(CI, CJ, 612)) * C
    keep = _hash(CI, CJ, 613) < 0.45
    cnt = 0
    for x, z in zip(px[keep], pz[keep]):
        i, j = int((x - X0g) / cell), int((z - X0g) / cell)
        if i < 12 or j < 12 or i >= n - 12 or j >= n - 12 or E[j, i] < 0.95 or not (14 <= s[j, i] <= 30):
            continue
        u = np.array([gx[j, i], gz[j, i]])
        u /= np.linalg.norm(u)
        r = 12
        sl = (slice(j - r, j + r + 1), slice(i - r, i + r + 1))
        dx, dz = X[sl] - x, Z[sl] - z
        a = dx * u[0] + dz * u[1]          # le long de la pente
        b = -dx * u[1] + dz * u[0]         # le long des courbes de niveau
        k1 = float(_hash(np.array([i]), np.array([j]), 614)[0])
        k2 = float(_hash(np.array([i]), np.array([j]), 615)[0])
        Ru, Rv = 14 + 16 * k1, 5 + 6 * k2
        e = ((b / Ru) ** 2 + (a / Rv) ** 2) * (1 + 0.25 * fbm(X[sl] / 9, Z[sl] / 9, 2, 616))
        w = smoothstep(1.3, 0.55, e) * 0.85 * E[sl]
        h[sl] = h[sl] + (h[j, i] - h[sl]) * w
        cnt += 1
    log(f'replats : {cnt}')
    return h


X0g = -4096.0


def despike(h, wanted, cell, thr=3.5):
    """Aiguilles parasites (pics isolés qui dominent leur anneau de 6 m) ramenées vers leur entourage, hors roche voulue."""
    for _ in range(3):
        ring = (ndimage.uniform_filter(h, 7) * 49 - ndimage.uniform_filter(h, 3) * 9) / 40
        mx = ndimage.maximum_filter(h, size=5) == h
        sp = mx & (h - ring > thr) & (wanted < 0.5)
        sp = ndimage.binary_dilation(sp, iterations=1)
        h = np.where(sp, np.minimum(h, ring + 1.0), h)
    return h


def stage_fine():
    from common import fbm as _fbm  # noqa
    W = load_world()
    h4 = np.load(os.path.join(CACHE, 'eroded4.npy')).astype(np.float64)
    m4 = np.load(os.path.join(CACHE, 'valleym4.npy'))
    dense = np.load(os.path.join(CACHE, 'rivers.npy'), allow_pickle=True)[0]
    X, Z, n = grid(4.0)
    prot = carve.protect_mask(W, X, Z, 4.0, n, dense=dense)
    cliff = carve.cliff_mask(W, X, Z, 4.0, n)
    rock = np.load(os.path.join(CACHE, 'roche4.npy')).astype(np.float64)
    E4 = np.clip((1 - m4) * (1 - prot), 0, 1).astype(np.float64)
    h4 = replats(h4, E4, 4.0, W)

    scree = np.zeros_like(h4)
    ER.thermal(h4, talus_map(h4, W, X, Z, cliff, 4.0, rock), E4, 40, 4.0, 0.5, scree)
    log('replats')
    report(h4.astype(np.float32), 4.0, 'replats')
    # passe à 2 m
    h2 = resample(h4.astype(np.float32), 2.0).astype(np.float64)
    del X, Z
    X2, Z2, n2 = grid(2.0)
    E2 = np.clip(resample(E4.astype(np.float32), 2.0), 0, 1).astype(np.float64)
    cl2 = np.clip(resample(cliff, 2.0), 0, 1)
    ro2 = np.clip(resample(rock.astype(np.float32), 2.0), 0, 1)
    E2d = E2 * (1 - 0.85 * cl2) * (1 - 0.6 * ro2)
    d2 = np.zeros_like(h2)
    hyd = W['TERRAIN_RULES']['hydraulic']
    ER.droplets(h2, E2d, d2, 3_000_000, 29, 2.0, hyd['inertia'], 0.35, 0.005, hyd['deposition'], 0.3, hyd['evaporation'], 4.0, 2.0, 48, 0.2)
    log('gouttes au pas de 2 m')
    sc2 = np.zeros_like(h2)
    tal2 = 34 + (50 - 34) * ro2
    tal2 = tal2 + (70 - tal2) * np.clip(cl2 * 1.4, 0, 1)
    ER.thermal(h2, np.tan(np.radians(tal2)).astype(np.float64), E2, 50, 2.0, 0.5, sc2)
    h2 = despike(h2, np.maximum(ro2, cl2), 2.0)

    log('thermique 2 m')
    # microrelief (0,3 à 1 m, longueurs d'onde 4 à 20 m) hors plats, lits et vallée
    mic = W['TERRAIN_RULES']['microRelief']['amplitude']
    h2 += E2 * (0.35 * mic * fbm(X2 / 9, Z2 / 9, 2, 91) + 0.3 * mic * fbm(X2 / 22, Z2 / 22, 2, 92))
    np.save(os.path.join(CACHE, 'preroutes2.npy'), h2.astype(np.float32))
    np.save(os.path.join(CACHE, 'scree2.npy'), (sc2 + resample(scree.astype(np.float32), 2.0)).astype(np.float32))
    np.save(os.path.join(CACHE, 'dep2.npy'), (d2 + resample(np.load(os.path.join(CACHE, 'dep4.npy')), 2.0)).astype(np.float32))
    stage_routes(h2, W, X2, Z2, n2, dense)


def stage_routes(h2=None, W=None, X2=None, Z2=None, n2=None, dense=None):
    """Voies posées sur le relief puis vallée de Capyville imposée (relançable seule : étape « routes »)."""
    if h2 is None:
        W = load_world()
        h2 = np.load(os.path.join(CACHE, 'preroutes2.npy')).astype(np.float64)
        X2, Z2, n2 = grid(2.0)
        dense = np.load(os.path.join(CACHE, 'rivers.npy'), allow_pickle=True)[0]
    # vallée de Capyville : relief d'origine exact (masque), raccord doux au-delà de la couronne
    meta, routes, ref, det = carve.load_valley()
    m2 = carve.valley_mask(X2, Z2, routes)
    # voies du monde : tracé de moindre coût (lacets), profil à pente bornée, ouvrages, plateforme et talus
    import roads as RD
    import json
    wat = carve.water_mask(W, X2, Z2, 2.0, n2, margin=2, dense=dense, lake_edge=1.04)
    riv, lake = carve.water_mask(W, X2, Z2, 2.0, n2, margin=2, dense=dense, lake_edge=1.04, parts=True)
    cl2 = carve.cliff_mask(W, X2, Z2, 2.0, n2)
    keep = np.clip(np.maximum(m2, wat), 0, 1)
    h2, ways, works = RD.stamp_ways(h2, W, 2.0, keep, log, water=riv, lake=lake, cliff=cl2, valley=m2, colroutes=routes['routes'])
    json.dump(ways, open(os.path.join(CACHE, 'ways.json'), 'w'))
    json.dump(works, open(os.path.join(CACHE, 'ouvrages.json'), 'w'), ensure_ascii=False)
    log(f'ouvrages : {len(works)} ({", ".join(sorted(set(o["kind"] for o in works)))})')
    sl = (slice(int((-1000 + 4096) / 2), int((1000 + 4096) / 2) + 1),) * 2
    old = carve.sample_ref(ref, meta, X2[sl], Z2[sl])
    h2[sl] = h2[sl] + (old - h2[sl]) * m2[sl]
    np.save(os.path.join(CACHE, 'final2.npy'), h2.astype(np.float32))
    np.save(os.path.join(CACHE, 'valleym2.npy'), m2[sl].astype(np.float32))
    log('vallée imposée (2 m)')
    h4f = h2[::2, ::2].astype(np.float32)
    report(h4f, 4.0, 'final')
    diag(h4f, 4.0, W)
    peaks_check(h4f, 4.0, W)
    crops(h2.astype(np.float32), 2.0, 'final')




def peaks_check(h, cell, W):
    from common import X0
    out = []
    for pk in W['WORLD_PEAKS']:
        i = int(round((pk['x'] - X0) / cell))
        j = int(round((pk['z'] - X0) / cell))
        r = int(60 / cell)
        top = float(h[j - r:j + r + 1, i - r:i + r + 1].max())
        out.append(f"{pk['id']} {top:.0f}/{pk['y']}")
    log('sommets : ' + ', '.join(out))


if __name__ == '__main__':
    steps = sys.argv[1:] or ['formes', 'erosion', 'fin', 'export']
    if 'formes' in steps:
        stage_forms()
    if 'erosion' in steps:
        stage_erosion()
    if 'fin' in steps:
        stage_fine()
    elif 'routes' in steps:
        stage_routes()
    if 'export' in steps:
        import export
        export.run(log)
