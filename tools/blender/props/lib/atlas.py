"""Atlas de matières du décor : 4 x 4 tuiles de 512 px (couleur, normales, ORM = occlusion/rugosité/métal).

Les tuiles « photo » viennent des textures CC0 déjà présentes dans le projet (bois, planches, pierre, papier, écorce…) ;
les autres (bambou, tissu, céramique, paille, vannerie, métal, uni) sont générées ici au bruit (numpy), en tons neutres
pour être teintées par les couleurs de sommets. Sorties : public/assets/models/props/tex/decor_{diff,nor,orm}.jpg.
Les images Blender ont leur ligne 0 en bas, comme les UV Blender : tout est cohérent tant qu'on reste dans Blender.
"""
import os
import numpy as np
import bpy
from .mesh import TILES, ATLAS_N

T = 512
S = T * ATLAS_N


def _load(path):
    im = bpy.data.images.load(path, check_existing=True)
    w, h = im.size
    a = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(a)
    return a.reshape(h, w, 4)[:, :, :3]


def _fit(a):
    """Ramène une image carrée à T x T (moyenne par blocs)."""
    h = a.shape[0]
    if h == T:
        return a
    k = h // T
    if k >= 1 and h % T == 0:
        return a.reshape(T, k, T, k, 3).mean(axis=(1, 3))
    idx = (np.arange(T) * h / T).astype(int)
    return a[idx][:, idx]


def _vnoise(rng, size, cells, octaves=4):
    out = np.zeros((size, size), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        c = cells * (2 ** o)
        g = rng.random((c + 1, c + 1)).astype(np.float32)
        g[-1, :] = g[0, :]
        g[:, -1] = g[:, 0]
        x = np.linspace(0, c, size, endpoint=False)
        i = x.astype(int)
        f = x - i
        f = f * f * (3 - 2 * f)
        a = g[i][:, i] * (1 - f)[None, :] + g[i][:, i + 1] * f[None, :]
        b = g[i + 1][:, i] * (1 - f)[None, :] + g[i + 1][:, i + 1] * f[None, :]
        out += amp * (a * (1 - f)[:, None] + b * f[:, None])
        tot += amp
        amp *= 0.5
    return out / tot


def _height_to_normal(h, strength=2.0):
    gy, gx = np.gradient(h)
    n = np.dstack([-gx * strength * T / 64, -gy * strength * T / 64, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5


def _proc(name, rng):
    """Tuiles procédurales : (couleur sRGB HxWx3, hauteur HxW)."""
    y, x = np.mgrid[0:T, 0:T].astype(np.float32) / T
    n1 = _vnoise(rng, T, 8)
    n2 = _vnoise(rng, T, 32, 3)
    if name == 'bamboo':
        # fibres longitudinales (le long de v) et petites taches
        fib = np.tile(_vnoise(rng, T, 64, 2)[0:1, :], (T, 1))
        h = 0.6 * fib + 0.25 * n2
        v = 0.70 + 0.12 * (fib - 0.5) + 0.10 * (n1 - 0.5)
        col = np.dstack([v * 1.0, v * 0.97, v * 0.86])
    elif name == 'cloth':
        wx = 0.5 + 0.5 * np.sin(x * T * np.pi / 2.0)
        wy = 0.5 + 0.5 * np.sin(y * T * np.pi / 2.0)
        h = np.where(((x * T // 4 + y * T // 4) % 2) == 0, wx, wy) * 0.7 + 0.3 * n2
        v = 0.80 + 0.08 * (h - 0.5) + 0.08 * (n1 - 0.5)
        col = np.dstack([v, v, v * 0.98])
    elif name == 'ceramic':
        h = 0.3 * n1 + 0.1 * n2
        v = 0.78 + 0.18 * (n1 - 0.5) + 0.05 * (n2 - 0.5)
        spk = (rng.random((T, T)) > 0.996).astype(np.float32)
        v = v - spk * 0.35
        col = np.dstack([v, v * 0.98, v * 0.95])
    elif name == 'straw':
        fib = np.tile(_vnoise(rng, T, 96, 2)[0:1, :], (T, 1)) * 0.7 + 0.3 * _vnoise(rng, T, 48, 2)
        h = fib
        v = 0.70 + 0.25 * (fib - 0.5)
        col = np.dstack([v * 1.0, v * 0.92, v * 0.68])
    elif name == 'wicker':
        k = 16
        bx = (x * k) % 1.0
        by = (y * k) % 1.0
        cell = ((np.floor(x * k) + np.floor(y * k)) % 2) == 0
        h = np.where(cell, np.sin(by * np.pi), np.sin(bx * np.pi)) * 0.8 + 0.2 * n2
        v = 0.55 + 0.35 * h
        col = np.dstack([v, v * 0.88, v * 0.64])
    elif name == 'metal':
        h = 0.5 * n1 + 0.5 * n2
        v = 0.55 + 0.15 * (n1 - 0.5) + 0.1 * (n2 - 0.5)
        col = np.dstack([v, v * 0.97, v * 0.93])
    else:  # plain
        h = 0.2 * n2
        v = 0.86 + 0.05 * (n1 - 0.5) + 0.03 * (n2 - 0.5)
        col = np.dstack([v, v, v])
    return np.clip(col, 0, 1), h


# rugosité, métal par tuile
ORM = {
    'wood': (0.82, 0), 'planks': (0.85, 0), 'stone': (0.93, 0), 'paper': (0.9, 0), 'roughwood': (0.86, 0),
    'bamboo': (0.45, 0), 'cloth': (0.96, 0), 'ceramic': (0.28, 0), 'straw': (0.95, 0), 'mossrock': (0.95, 0),
    'metal': (0.42, 0.85), 'plain': (0.55, 0), 'bark': (0.95, 0), 'clay': (0.95, 0), 'wicker': (0.8, 0), 'kawara': (0.5, 0),
}


def build_atlas(root, out_dir):
    bt = os.path.join(root, 'public/assets/models/buildings/tex')
    gt = os.path.join(root, 'public/assets/tex')
    photo = {
        'wood': (os.path.join(bt, 'wood_diff.jpg'), os.path.join(gt, 'roughwood_nor.jpg')),
        'planks': (os.path.join(bt, 'planks_diff.jpg'), os.path.join(gt, 'planks_nor.jpg')),
        'stone': (os.path.join(bt, 'stone_diff.jpg'), os.path.join(bt, 'stone_nor.jpg')),
        'paper': (os.path.join(bt, 'paper_diff.jpg'), None),
        'roughwood': (os.path.join(gt, 'roughwood_diff.jpg'), os.path.join(gt, 'roughwood_nor.jpg')),
        'mossrock': (os.path.join(gt, 'mossrock_diff.jpg'), os.path.join(gt, 'mossrock_nor.jpg')),
        'bark': (os.path.join(gt, 'bark_diff.jpg'), os.path.join(gt, 'bark_nor.jpg')),
        'clay': (os.path.join(gt, 'plaster_diff.jpg'), os.path.join(gt, 'plaster_nor.jpg')),
        'kawara': (os.path.join(bt, 'kawara_diff.jpg'), os.path.join(bt, 'kawara_nor.jpg')),
    }
    rng = np.random.default_rng(7)
    diff = np.zeros((S, S, 3), np.float32)
    nor = np.zeros((S, S, 3), np.float32)
    orm = np.zeros((S, S, 3), np.float32)
    means = {}
    for name, t in TILES.items():
        c, r = t % ATLAS_N, t // ATLAS_N
        sl = (slice(r * T, (r + 1) * T), slice(c * T, (c + 1) * T))
        if name in photo:
            d, n = photo[name]
            col = _fit(_load(d))
            nm = _fit(_load(n)) if n else np.dstack([np.full((T, T), 0.5), np.full((T, T), 0.5), np.ones((T, T))]).astype(np.float32)
        else:
            col, h = _proc(name, rng)
            nm = _height_to_normal(h, 1.5 if name in ('wicker', 'cloth', 'straw') else 0.8)
        diff[sl] = col
        nor[sl] = nm
        rough, metal = ORM[name]
        rn = _vnoise(rng, T, 16, 3)
        orm[sl] = np.dstack([np.ones((T, T)), np.clip(rough + (rn - 0.5) * 0.12, 0, 1), np.full((T, T), metal)])
        means[name] = [round(float(x), 3) for x in col.reshape(-1, 3).mean(0)]
    os.makedirs(out_dir, exist_ok=True)
    for nm_, arr in (('decor_diff', diff), ('decor_nor', nor), ('decor_orm', orm)):
        im = bpy.data.images.new(nm_, S, S, alpha=False)
        rgba = np.dstack([arr, np.ones((S, S), np.float32)]).astype(np.float32)
        im.pixels.foreach_set(rgba.ravel())
        im.filepath_raw = os.path.join(out_dir, nm_ + '.jpg')
        im.file_format = 'JPEG'
        im.save(quality=88)
    return means
