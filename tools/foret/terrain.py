"""Relief de la zone « forêt » : grille fine 0,25 m (100 × 80 m), anneau lointain 2 m (640 m), masques du sol 0,1 m.

Usage : .venv-blender/Scripts/python.exe -I tools/foret/terrain.py [--preview]
Écrit public/assets/foret/terrain.bin (Float32 : zone fine puis anneau), masks.png (RGBA) et complète scene.json.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import layout as L  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'foret')
CACHE = os.path.join(ROOT, 'tools', 'foret', '.cache')


def grid(x0, z0, cell, nx, nz):
    xs = x0 + np.arange(nx) * cell
    zs = z0 + np.arange(nz) * cell
    return np.meshgrid(xs, zs)


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(CACHE, exist_ok=True)
    F = L.Field()
    nx = int(round((L.X1 - L.X0) / L.CELL)) + 1
    nz = int(round((L.Z1 - L.Z0) / L.CELL)) + 1
    X, Z = grid(L.X0, L.Z0, L.CELL, nx, nz)
    H = F.height(X, Z).astype(np.float32)
    R = L.RING
    RX, RZ = grid(R['x0'], R['z0'], R['cell'], R['n'], R['n'])
    RH = F.height(RX, RZ, detail=False).astype(np.float32)
    # l'anneau passe 0,4 m sous la zone fine là où elles se recouvrent (pas de scintillement)
    inside = (RX > L.X0 + 1) & (RX < L.X1 - 1) & (RZ > L.Z0 + 1) & (RZ < L.Z1 - 1)
    RH[inside] -= 0.4
    with open(os.path.join(OUT, 'terrain.bin'), 'wb') as f:
        f.write(H.tobytes())
        f.write(RH.tobytes())
    np.save(os.path.join(CACHE, 'height.npy'), H)
    # masques du sol
    mx = int(round((L.X1 - L.X0) / L.MASK_CELL))
    mz = int(round((L.Z1 - L.Z0) / L.MASK_CELL))
    MX, MZ = grid(L.X0 + L.MASK_CELL / 2, L.Z0 + L.MASK_CELL / 2, L.MASK_CELL, mx, mz)
    M = F.masks(MX, MZ)
    np.save(os.path.join(CACHE, 'masks.npy'), M.astype(np.float16))
    # RVB seulement : le canevas 2D du navigateur prémultiplie l'alpha (perte des couleurs) ; la variation (A) est procédurale
    Image.fromarray((M[..., :3] * 255 + 0.5).astype(np.uint8), 'RGB').save(os.path.join(OUT, 'masks.png'), optimize=True)

    scene_p = os.path.join(OUT, 'scene.json')
    scene = json.load(open(scene_p, encoding='utf-8')) if os.path.exists(scene_p) else {}
    c, s = F.c, F.s
    k = np.arange(0, len(c), 10)
    scene.update({
        'version': 1,
        'terrain': {'x0': L.X0, 'z0': L.Z0, 'cell': L.CELL, 'nx': nx, 'nz': nz,
                    'ring': {'x0': R['x0'], 'z0': R['z0'], 'cell': R['cell'], 'n': R['n']},
                    'masks': {'x0': L.X0, 'z0': L.Z0, 'cell': L.MASK_CELL, 'nx': mx, 'nz': mz},
                    'min': float(H.min()), 'max': float(H.max())},
        'path': [[round(float(c[i, 0]), 3), round(float(c[i, 1]), 3), round(float(c[i, 2]), 3), round(float(c[i, 3]), 2), int(c[i, 4])] for i in k],
        'steps': [{kk: (round(v, 4) if isinstance(v, float) else v) for kk, v in st.items()} for st in L.steps()],
        'clearing': L.CLEARING, 'puddle': L.PUDDLE, 'lantern': L.LANTERN, 'spawn': L.SPAWN,
    })
    # pied de paroi (pour les collisions) : un point tous les 0,5 m le long du sentier, côté est
    foot = []
    for i in range(0, len(c), 10):
        x, z, y, w = c[i, :4]
        hgt = float(L.wall_height(z))
        if hgt < 1.2:
            continue
        t = F.t[i]
        n = np.array([-t[1], t[0]])
        d = w + float(L.wall_strip(z)) + 0.05
        foot.append([round(float(x + n[0] * d), 3), round(float(z + n[1] * d), 3), round(float(y), 3), round(hgt, 2)])
    scene['wallFoot'] = foot
    json.dump(scene, open(scene_p, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f'terrain {nx}×{nz} ({H.min():.2f}..{H.max():.2f} m), anneau {R["n"]}², masques {mx}×{mz}, '
          f'{len(scene["steps"])} marches, {len(foot)} points de pied de paroi')
    if '--preview' in sys.argv:
        # ombrage + courbes de niveau + masques, pour vérifier le plan
        gz, gx = np.gradient(H, L.CELL)
        nrm = np.stack([-gx, np.ones_like(H), -gz], -1)
        nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
        sun = np.array([-0.5, 0.7, -0.5]); sun /= np.linalg.norm(sun)
        shade = np.clip(nrm @ sun, 0, 1)
        iso = (np.abs((H % 1.0) - 0.5) > 0.47).astype(np.float32)
        Mi = np.array(Image.fromarray((M * 255).astype(np.uint8), 'RGBA').resize((nx, nz)))[..., :3] / 255.0
        rgb = np.stack([shade] * 3, -1) * 0.75 + 0.2
        rgb = rgb * (1 - 0.5 * Mi[..., 0:1]) + np.array([0.5, 0.35, 0.2]) * 0.5 * Mi[..., 0:1]
        rgb = rgb * (1 - 0.4 * Mi[..., 1:2]) + np.array([0.2, 0.5, 0.1]) * 0.4 * Mi[..., 1:2]
        rgb = rgb * (1 - 0.6 * Mi[..., 2:3]) + np.array([0.1, 0.2, 0.5]) * 0.6 * Mi[..., 2:3]
        rgb *= 1 - iso[..., None] * 0.35
        Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8)).save(os.path.join(CACHE, 'preview.png'))
        print('aperçu :', os.path.join(CACHE, 'preview.png'))


if __name__ == '__main__':
    main()
