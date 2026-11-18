"""Générateur des accessoires du décor de Capyville (spécialité Décor & accessoires). Relançable.

Usage (depuis la racine du worktree) :
    L:/CLAUDE/CapyWorld/.venv-blender/Scripts/python.exe tools/blender/props/build_props.py [--preview] [--only toro_kasuga,banc]

Sorties :
  public/assets/models/props/decor.glb       tous les accessoires : nœud racine <id>_<variante>, enfants _lod0 (chanfreiné)
                                              et _lod1 (décimé à 35 %) ; matières « decor_atlas » et « decor_glow »
  public/assets/models/props/decor.json      méta par variante : famille, dimensions, triangles, lumière, collision…
  public/assets/models/props/tex/decor_*.jpg atlas couleur / normales / ORM (4 x 4 tuiles de 512 px)
  tools/blender/props/.cache/preview.png     planche de contrôle (option --preview, rendu Workbench couleurs de sommets)
"""
import os
import sys
import json
import math
import random
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
from lib.atlas import build_atlas  # noqa: E402
from lib.export import reset, make_object, export  # noqa: E402
from lib.props import GEN  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '../../..'))
OUT = os.path.join(ROOT, 'public/assets/models/props')
CACHE = os.path.join(HERE, '.cache')
GLTFPACK = os.environ.get('GLTFPACK') or next((p for p in [
    os.path.join(ROOT, 'tools/polyhaven/node_modules/.bin/gltfpack.cmd'),
    'L:/CLAUDE/CapyWorld/tools/polyhaven/node_modules/.bin/gltfpack.cmd'] if os.path.exists(p)), 'gltfpack')


def main():
    args = sys.argv[1:]
    preview = '--preview' in args
    only = None
    if '--only' in args:
        only = set(args[args.index('--only') + 1].split(','))
    t0 = time.time()
    reset()
    means = build_atlas(ROOT, os.path.join(OUT, 'tex'))
    print('atlas :', json.dumps(means))
    meta = {}
    roots = []
    for name, (fn, variants, cat) in GEN.items():
        if only and name not in only:
            continue
        for v in range(variants):
            rng = random.Random(hash((name, v)) & 0xffffffff if False else (sum(map(ord, name)) * 131 + v * 7919))
            mesh, info = fn(rng)
            vid = f'{name}_{v}'
            root = bpy.data.objects.new(vid, None)
            bpy.context.scene.collection.objects.link(root)
            ob0, t0n = make_object(vid + '_lod0', mesh, root, bevel=info.get('bevel', 0.0))
            ob1, t1n = make_object(vid + '_lod1', mesh, root, decimate=0.35)
            xs = [p.x for p in mesh.co]
            ys = [p.y for p in mesh.co]
            zs = [p.z for p in mesh.co]
            dims = [round(max(xs) - min(xs), 3), round(max(ys) - min(ys), 3), round(max(zs) - min(zs), 3)]
            meta[vid] = {
                'id': name, 'variant': v, 'cat': info.get('cat', cat),
                'min': [round(min(xs), 3), round(min(ys), 3), round(min(zs), 3)],
                'max': [round(max(xs), 3), round(max(ys), 3), round(max(zs), 3)],
                'dims': dims, 'tris': [t0n, t1n],
                'light': None if info.get('light') is None else round(info['light'], 3),
                'collide': info.get('collide'),
                'cast': dims[1] >= 0.5 or max(dims[0], dims[2]) >= 1.2,
                'hang': bool(info.get('hang')),
                'steam': info.get('steam'),
                'length': info.get('length'),
            }
            roots.append(root)
            print(f'{vid:22s} {t0n:6d} / {t1n:5d} tris  dims {dims}')
    if only:
        # planche partielle : on n'écrase pas le glb complet
        render_preview(roots, meta)
        return
    os.makedirs(OUT, exist_ok=True)
    out = export(os.path.join(OUT, 'decor.glb'), GLTFPACK, os.path.join(CACHE, 'gltf'))
    json.dump({'version': 1, 'file': 'decor.glb', 'atlas': {'diff': 'tex/decor_diff.jpg', 'nor': 'tex/decor_nor.jpg', 'orm': 'tex/decor_orm.jpg'},
               'props': meta}, open(os.path.join(OUT, 'decor.json'), 'w'), indent=1, ensure_ascii=False)
    print('glb :', out, os.path.getsize(out), 'octets ;', len(meta), 'variantes ;', round(time.time() - t0, 1), 's')
    if preview:
        render_preview(roots, meta)


def render_preview(roots, meta, elev=28):
    """Planche de contrôle : toutes les variantes en grille (avec étiquettes), rendu Workbench (couleurs de sommets).
    La pas de la grille s'adapte au plus grand objet affiché : `--only` donne donc une planche agrandie."""
    n = len(roots)
    big = max(max(m['dims'][0], m['dims'][2], m['dims'][1] * 0.8) for m in meta.values())
    step = max(1.6, min(3.6, big * 1.15))
    cols = int(math.ceil(math.sqrt(n * 1.6)))
    sc = bpy.context.scene
    for i, (r, (vid, m)) in enumerate(zip(roots, meta.items())):
        cx, cz = (i % cols) * step, (i // cols) * step
        r.location = (cx, -cz, 0)
        for ch in r.children:
            ch.hide_render = ch.name.endswith('_lod1')
        if m.get('hang'):
            r.location.z = -m['min'][1] + 0.05   # objets suspendus : remontés au-dessus du sol
        cu = bpy.data.curves.new('t' + vid, 'FONT')
        cu.body = vid
        cu.size = step * 0.075
        cu.align_x = 'CENTER'
        tx = bpy.data.objects.new('t' + vid, cu)
        sc.collection.objects.link(tx)
        tx.location = (cx, -cz - step * 0.42, 0.01)
    # sol clair et fond gris : on juge les silhouettes et les teintes
    bpy.ops.mesh.primitive_plane_add(size=1, location=((cols - 1) * step / 2, -(n // cols) * step / 2, 0))
    gp = bpy.context.active_object
    gp.scale = (cols * step + 4, (n // cols + 1) * step + 4, 1)
    ca = gp.data.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for d_ in ca.data:
        d_.color = (0.12, 0.13, 0.12, 1)
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'VERTEX'
    sc.display.shading.show_cavity = True
    sc.display.shading.show_shadows = True
    sc.display.shading.shadow_intensity = 0.35
    sc.view_settings.view_transform = 'Standard'
    if sc.world is None:
        sc.world = bpy.data.worlds.new('w')
    sc.world.color = (0.35, 0.36, 0.38)
    sc.render.resolution_x, sc.render.resolution_y = 2400, 1500
    rows = (n + cols - 1) // cols
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    w, h = cols * step, rows * step
    cam.data.type = 'ORTHO'
    e = math.radians(elev)
    cam.data.ortho_scale = max(w, h * math.sin(e) * 1.6 + step) * 1.04
    d = 40
    cam.location = ((cols - 1) * step / 2, -(rows - 1) * step / 2 - d * math.cos(e), d * math.sin(e) + 0.5)
    cam.rotation_euler = (math.pi / 2 - e, 0, 0)
    cam.data.clip_end = 200
    sc.render.filepath = os.path.join(CACHE, 'preview.png' if len(sys.argv) < 4 else 'preview_only.png')
    bpy.ops.render.render(write_still=True)
    print('aperçu :', sc.render.filepath)

main()
