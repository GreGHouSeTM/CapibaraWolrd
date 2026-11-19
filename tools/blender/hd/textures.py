"""Matières photoscannées Poly Haven (CC0) du pipeline « Modélisation HD ».

Télécharge (curl) les cartes 2k diffuse / normale OpenGL / ARM (AO, rugosité, métal = ORM du glTF) de chaque matière,
puis les convertit en WebP (Blender) dans public/assets/models/buildings/hd/tex/<nom>_{diff,nor,arm}.webp.
Relançable : ce qui est déjà téléchargé ou converti est gardé (supprimer le fichier pour le refaire).

  L:\\CLAUDE\\CapyWorld\\.venv-blender\\Scripts\\python.exe tools/blender/hd/textures.py
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from lib.materials import HD_MATERIALS, TEX_DIR  # noqa: E402

CACHE = os.path.join(HERE, '.cache', 'ph')
MAPS = {'diff': 'Diffuse', 'nor': 'nor_gl', 'arm': 'arm'}


def curl(url, out):
    if os.path.exists(out) and os.path.getsize(out) > 1000:
        return out
    os.makedirs(os.path.dirname(out), exist_ok=True)
    subprocess.run(['curl', '-sSL', '-o', out, url], check=True)
    return out


def fetch(ph_id, res):
    meta_p = os.path.join(CACHE, ph_id, 'files.json')
    os.makedirs(os.path.dirname(meta_p), exist_ok=True)
    if not os.path.exists(meta_p):
        curl(f'https://api.polyhaven.com/files/{ph_id}', meta_p)
    meta = json.load(open(meta_p, encoding='utf-8'))
    out = {}
    for k, key in MAPS.items():
        url = meta[key][res]['jpg']['url']
        out[k] = curl(url, os.path.join(CACHE, ph_id, os.path.basename(url)))
    return out


def to_webp(src, dst, size, quality=82, non_color=False):
    import bpy
    if os.path.exists(dst):
        return
    img = bpy.data.images.load(src)
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    if img.size[0] != size:
        img.scale(size, size)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    # enregistrement des octets tels quels (pas de gestion des couleurs) : valable pour les cartes non-couleur
    img.file_format = 'WEBP'
    img.save(filepath=dst, quality=quality)
    bpy.data.images.remove(img)


def main():
    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # pas de transformation de vue à l'enregistrement : on garde les valeurs telles quelles
    bpy.context.scene.view_settings.view_transform = 'Standard'
    for name, spec in HD_MATERIALS.items():
        if 'ph' not in spec:
            continue
        files = fetch(spec['ph'], '2k')
        size = spec.get('res', 2048)
        for k, src in files.items():
            dst = os.path.join(TEX_DIR, f'{name}_{k}.webp')
            to_webp(src, dst, size, quality=spec.get('q', 82), non_color=(k != 'diff'))
            print(name, k, os.path.getsize(dst) // 1024, 'Ko')


if __name__ == '__main__':
    main()
