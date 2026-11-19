# Export du relief cuit vers public/assets/terrain/ (spécialité Terrain & relief).
#
# Format (lu par src/world/terrain-data.ts) :
#  - meta.json : grilles, quantification, liste des fichiers, rivières denses (pour l'Eau et les Routes) ;
#  - h/<tx>_<tz>.bin : tuiles de hauteur de 512 m (256 × 256 échantillons au pas de 2 m), entiers 16 bits
#    h = u × scale + offset, prédiction planaire (gauche + haut − diagonale) puis zlib ;
#  - valley.bin : grille fine de Capyville (0,5 m, emprise DETAIL de valley.ts), même codage ;
#  - surface.bin : carte dérivée de 4 m (RGBA 8 bits) : R écoulement accumulé (log), G humidité, B dépôts
#    (sédiments et éboulis), A roche affleurante / falaise ; zlib ;
#  - biome.bin : carte de 8 m (RGBA 8 bits) : R sable, G neige, B sol sec (ocres, herbe blonde), A sous-bois humide (mousse) ; zlib.
import json
import os
import zlib
import numpy as np
from scipy import ndimage
from common import CACHE, ROOT, X0, grid, load_world, slope_deg, smoothstep, fbm, poly_mask, sdf
import carve
import erosion as ER

OUT = os.path.join(ROOT, 'public', 'assets', 'terrain')
H_SCALE, H_OFFSET = 0.016, -60.0        # -60 m … 988 m, pas de 1,6 cm
V_SCALE, V_OFFSET = 1 / 256, -16.0      # vallée : -16 m … 240 m, pas de 4 mm
TILE = 256


def encode16(a, scale, offset):
    u = np.clip(np.round((a - offset) / scale), 0, 65535).astype(np.int32)
    p = np.zeros_like(u)
    p[1:, 1:] = u[1:, :-1] + u[:-1, 1:] - u[:-1, :-1]
    p[0, 1:] = u[0, :-1]
    p[1:, 0] = u[:-1, 0]
    r = ((u - p) & 0xFFFF).astype('<u2')
    return zlib.compress(r.tobytes(), 9)


def decode16(b, shape, scale, offset):
    """Décodage de contrôle (même algorithme que terrain-data.ts)."""
    r = np.frombuffer(zlib.decompress(b), dtype='<u2').reshape(shape).astype(np.int64)
    u = np.zeros(shape, dtype=np.int64)
    for j in range(shape[0]):
        for i in range(shape[1]):
            if i == 0 and j == 0:
                p = 0
            elif j == 0:
                p = u[0, i - 1]
            elif i == 0:
                p = u[j - 1, 0]
            else:
                p = u[j, i - 1] + u[j - 1, i] - u[j - 1, i - 1]
            u[j, i] = (p + r[j, i]) & 0xFFFF
    return u * scale + offset


def biome_weights(W, X, Z, cell, n):
    """Biomes empilés dans l'ordre de la liste, fondus sur leur largeur de transition."""
    ids = [b['id'] for b in W['BIOMES']]
    acc = np.zeros((len(ids),) + X.shape, dtype=np.float32)
    for k, b in enumerate(W['BIOMES']):
        m = poly_mask(b['poly'], cell, n, scale=1)
        s = sdf(m, cell) + 60 * fbm(X / 400, Z / 400, 3, 300 + k)
        w = smoothstep(b['transition'] / 2, -b['transition'] / 2, s)
        acc *= (1 - w)[None]
        acc[k] += w
    return ids, acc


def run(log):
    os.makedirs(os.path.join(OUT, 'h'), exist_ok=True)
    W = load_world()
    h2 = np.load(os.path.join(CACHE, 'final2.npy'))
    n2 = h2.shape[0]
    assert n2 == 4096
    log(f'hauteurs : {float(h2.min()):.1f} … {float(h2.max()):.1f} m')
    # ---------------------------------------------------------------- tuiles de hauteur
    total = 0
    nt = n2 // TILE
    for tz in range(nt):
        for tx in range(nt):
            b = encode16(h2[tz * TILE:(tz + 1) * TILE, tx * TILE:(tx + 1) * TILE], H_SCALE, H_OFFSET)
            open(os.path.join(OUT, 'h', f'{tx}_{tz}.bin'), 'wb').write(b)
            total += len(b)
    log(f'tuiles de hauteur : {nt * nt} fichiers, {total / 1e6:.1f} Mo')
    # contrôle de décodage sur une tuile
    t = (8, 8)
    b = open(os.path.join(OUT, 'h', f'{t[0]}_{t[1]}.bin'), 'rb').read()
    dec = decode16(b, (TILE, TILE), H_SCALE, H_OFFSET)
    err = float(np.abs(dec - h2[t[1] * TILE:(t[1] + 1) * TILE, t[0] * TILE:(t[0] + 1) * TILE]).max())
    log(f'contrôle de décodage (tuile 8_8) : écart max {err * 100:.2f} cm')
    # ---------------------------------------------------------------- vallée de Capyville (0,5 m)
    meta, routes, ref, det = carve.load_valley()
    D = meta['detail']
    xs = D['x0'] + np.arange(D['nx']) * D['cell']
    zs = D['z0'] + np.arange(D['nz']) * D['cell']
    XD, ZD = np.meshgrid(xs.astype(np.float32), zs.astype(np.float32))
    mD = carve.valley_mask(XD, ZD, routes)
    newD = ndimage.map_coordinates(h2, [(ZD - X0) / 2.0, (XD - X0) / 2.0], order=1, mode='nearest')
    valley = det + (newD - det) * (1 - mD)
    vb = encode16(valley, V_SCALE, V_OFFSET)
    open(os.path.join(OUT, 'valley.bin'), 'wb').write(vb)
    log(f'vallée : {D["nx"]} × {D["nz"]}, {len(vb) / 1e6:.1f} Mo, écart à l\'origine là où le masque vaut 1 : '
        f'{float(np.abs(valley - det)[mD > 0.999].max()):.3f} m ; plage {float(valley.min()):.1f} … {float(valley.max()):.1f} m')
    total += len(vb)
    # ---------------------------------------------------------------- carte dérivée (4 m)
    h4 = h2[::2, ::2].astype(np.float64)
    X, Z, n = grid(4.0)
    A = ER.accumulate(h4, 4.0)
    flow = np.clip(np.log10(A) / 6.0, 0, 1)                       # 10 m² … 1 km²
    s = slope_deg(h4.astype(np.float32), 4.0)
    dense = np.load(os.path.join(CACHE, 'rivers.npy'), allow_pickle=True)[0]
    wm = carve.water_mask(W, X, Z, 4.0, n, margin=30, dense=dense)
    ids, bw = biome_weights(W, X, Z, 4.0, n)
    hum = {'jungle': 1.0, 'piemont': 0.85, 'bocage-seine': 0.55, 'bocage-albion': 0.65, 'erables-lacs': 0.6, 'foret-asiatique': 0.7,
           'couronne': 0.6, 'rizieres': 0.8, 'cote-ouest': 0.6, 'lande': 0.45, 'toundra': 0.5, 'alpages': 0.5, 'pinede-neige': 0.45,
           'volcan': 0.3, 'prairies': 0.45, 'prairies-ranch': 0.25, 'garrigue': 0.15, 'savane': 0.12, 'dunes': 0.02, 'haute-montagne': 0.3, 'banquise': 0.3}
    bh = sum(bw[k] * hum.get(i, 0.4) for k, i in enumerate(ids))
    wet = np.clip(0.55 * bh + 0.6 * smoothstep(0.55, 0.85, flow) + 0.5 * wm - 0.3 * smoothstep(25, 40, s), 0, 1)
    dep = np.load(os.path.join(CACHE, 'dep2.npy'))[::2, ::2]
    scree = np.load(os.path.join(CACHE, 'scree2.npy'))[::2, ::2]
    depo = np.clip(np.maximum(dep, 0) / 1.5 + scree / 2.0, 0, 1)
    cliff = carve.cliff_mask(W, X, Z, 4.0, n)
    rock = np.clip(smoothstep(30, 40, s) + cliff * smoothstep(25, 35, s) + smoothstep(600, 750, h4) * smoothstep(20, 30, s), 0, 1)
    surf = np.stack([flow, wet, depo, rock], -1)
    sb = zlib.compress((surf * 255 + 0.5).astype(np.uint8).tobytes(), 9)
    open(os.path.join(OUT, 'surface.bin'), 'wb').write(sb)
    total += len(sb)
    log(f'carte dérivée 4 m : {len(sb) / 1e6:.1f} Mo')
    # ---------------------------------------------------------------- biomes (8 m)
    h8 = h2[::4, ::4]
    X8, Z8, n8 = grid(8.0)
    ids8, bw8 = biome_weights(W, X8, Z8, 8.0, n8)
    g = lambda tab: sum(bw8[k] * tab.get(i, 0.0) for k, i in enumerate(ids8))
    sand = g({'dunes': 1.0, 'savane': 0.15})
    coast = -sdf(poly_mask(W['COASTLINE'], 8.0, n8, scale=1), 8.0)
    sand = np.maximum(sand, smoothstep(3.5, 1.2, h8) * smoothstep(-20, 10, coast) * (1 - g({'banquise': 1, 'toundra': 1})))
    arctic = g({'haute-montagne': 0.75, 'pinede-neige': 0.85, 'toundra': 1.0, 'banquise': 1.0, 'alpages': 0.3, 'piemont': 0.12, 'cote-ouest': 0.25})
    rules = W['TERRAIN_RULES']['snow']
    line = rules['base'] - rules['drop'] * arctic
    # sommets enneigés à part (Fuji 430 m, Crêtes Blanches 380 m…)
    for pk in W['WORLD_PEAKS']:
        if 'snow' in pk:
            r = np.hypot(X8 - pk['x'], Z8 - pk['z'])
            line = np.minimum(line, pk['snow'] + 400 * smoothstep(pk['base'] * 0.6, pk['base'] * 1.2, r))
    line = line + 25 * fbm(X8 / 150, Z8 / 150, 3, 401)
    s8 = slope_deg(h8, 8.0)
    snow = smoothstep(line - 25, line + 25, h8) * smoothstep(48, 38, s8)
    snow = np.maximum(snow, g({'banquise': 1.0, 'toundra': 0.55}) * (h8 > 0.3))
    dry = g({'garrigue': 0.85, 'savane': 1.0, 'prairies-ranch': 0.7, 'dunes': 0.6, 'lande': 0.35, 'volcan': 0.45, 'haute-montagne': 0.3})
    lush = g({'jungle': 1.0, 'piemont': 0.9, 'foret-asiatique': 0.6, 'erables-lacs': 0.5, 'couronne': 0.5, 'bocage-albion': 0.35, 'bocage-seine': 0.3, 'cote-ouest': 0.3})
    bio = np.stack([sand, snow, dry, lush], -1)
    bb = zlib.compress((np.clip(bio, 0, 1) * 255 + 0.5).astype(np.uint8).tobytes(), 9)
    open(os.path.join(OUT, 'biome.bin'), 'wb').write(bb)
    total += len(bb)
    log(f'biomes 8 m : {len(bb) / 1e6:.1f} Mo ; total exporté {total / 1e6:.1f} Mo')
    # images de contrôle des cartes
    from PIL import Image
    Image.fromarray((surf[..., :3] * 255).astype(np.uint8)).resize((1024, 1024)).save(os.path.join(ROOT, 'test-shots', 'terrain', 'carte-surface.png'))
    Image.fromarray((bio[..., [0, 1, 2]] * 255).astype(np.uint8)).resize((1024, 1024)).save(os.path.join(ROOT, 'test-shots', 'terrain', 'carte-biomes.png'))
    # ---------------------------------------------------------------- méta
    rivers = []
    for rv in W['RIVERS']:
        P, y, w = dense[rv['id']]
        k = slice(None, None, 3)
        rivers.append({'id': rv['id'], 'pts': np.round(P[k], 1).tolist() + [np.round(P[-1], 1).tolist()],
                       'y': np.round(y[k], 2).tolist() + [round(float(y[-1]), 2)], 'w': np.round(w[k], 1).tolist() + [round(float(w[-1]), 1)]})
    meta_out = {
        'version': 1,
        'height': {'x0': X0, 'z0': X0, 'cell': 2.0, 'n': n2, 'tile': TILE, 'tiles': nt, 'scale': H_SCALE, 'offset': H_OFFSET, 'path': 'h/{x}_{z}.bin'},
        'valley': {'x0': D['x0'], 'z0': D['z0'], 'cell': D['cell'], 'nx': D['nx'], 'nz': D['nz'], 'scale': V_SCALE, 'offset': V_OFFSET, 'path': 'valley.bin'},
        'surface': {'x0': X0, 'z0': X0, 'cell': 4.0, 'n': n, 'path': 'surface.bin', 'channels': ['ecoulement', 'humidite', 'depots', 'roche']},
        'biome': {'x0': X0, 'z0': X0, 'cell': 8.0, 'n': n8, 'path': 'biome.bin', 'channels': ['sable', 'neige', 'sec', 'mousse']},
        'rivers': rivers,
        # voies posées par le générateur : tracé dense lissé et altitude de la plateforme (pour les Routes)
        'ways': json.load(open(os.path.join(CACHE, 'ways.json'))),
        'bytes': total,
    }
    json.dump(meta_out, open(os.path.join(OUT, 'meta.json'), 'w'), separators=(',', ':'))
    log('meta.json écrit')
