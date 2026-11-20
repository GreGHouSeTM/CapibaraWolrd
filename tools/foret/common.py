"""Outils communs aux scripts Blender de la zone « forêt » (bpy 5.3) : Cycles GPU, cuisson, export, gltfpack."""
import os
import shutil
import subprocess
import time

import sys

import numpy as np

try:  # console Windows (cp1252) : on écrit en UTF-8 sans planter sur les caractères spéciaux
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'foret')
CACHE = os.path.join(HERE, '.cache')
DL = os.path.join(CACHE, 'dl')


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def gltfpack_cli():
    for base in (os.path.join(ROOT, 'tools', 'polyhaven'), os.path.join(ROOT, '..', 'CapyWorld', 'tools', 'polyhaven')):
        p = os.path.join(base, 'node_modules', 'gltfpack', 'cli.js')
        if os.path.exists(p):
            return p
    raise RuntimeError('gltfpack absent : npm install --prefix tools/polyhaven')


def pack(raw, out, extra=()):
    """Compression meshopt ; textures laissées telles quelles ; UV en flottants (pas de transformation de texture)."""
    r = subprocess.run(['node', gltfpack_cli(), '-i', raw, '-o', out, '-cc', '-kn', '-km', '-kv', '-vp', '16', '-vtf', '-vn', '10', *extra],
                       capture_output=True, text=True)
    if r.returncode != 0:
        log('gltfpack a échoué, copie brute :', r.stderr[-300:])
        shutil.copyfile(raw, out)


def setup_cycles(samples=1):
    import bpy
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'CUDA'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == 'CUDA'
    sc.cycles.device = 'GPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False


def bake(obj, kind, w, h, path, samples=1, hi=None, extrusion=0.05, dist=0.1, uv='UVMap', margin=8):
    """Cuisson Cycles d'une carte (NORMAL, AO…) dans la couche UV `uv` de `obj` (depuis `hi` si fourni)."""
    import bpy
    setup_cycles(samples)
    img = bpy.data.images.new('bake_' + kind, w, h, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    for m in obj.data.materials:
        nt = m.node_tree
        for n in nt.nodes:
            n.select = False
        node = nt.nodes.new('ShaderNodeTexImage')
        node.image = img
        node.select = True
        nt.nodes.active = node
    bpy.ops.object.select_all(action='DESELECT')
    if hi is not None:
        hi.select_set(True)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    b = bpy.context.scene.render.bake
    b.use_selected_to_active = hi is not None
    b.cage_extrusion = extrusion
    b.max_ray_distance = dist
    b.margin = margin
    b.normal_space = 'TANGENT'
    obj.data.uv_layers.active = obj.data.uv_layers[uv]
    t = time.time()
    bpy.ops.object.bake(type=kind)
    log(f'cuisson {kind} {w}×{h} en {time.time() - t:.0f} s')
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    for m in obj.data.materials:
        nt = m.node_tree
        for n in list(nt.nodes):
            if n.type == 'TEX_IMAGE' and n.image == img:
                nt.nodes.remove(n)
    return path


def export_glb(objs, raw, tangents=True):
    import bpy
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=raw, export_format='GLB', use_selection=True, export_tangents=tangents,
                              export_texcoords=True, export_normals=True, export_materials='NONE', export_yup=True,
                              export_apply=True)


def mesh_from_arrays(name, verts, faces, uv=None):
    """Maillage Blender depuis des tableaux numpy (repère Blender, Z haut)."""
    import bpy
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(verts))
    me.vertices.foreach_set('co', np.asarray(verts, np.float32).ravel())
    f = np.asarray(faces, np.int32)
    n = f.shape[1]
    me.loops.add(f.size)
    me.loops.foreach_set('vertex_index', f.ravel())
    me.polygons.add(len(f))
    me.polygons.foreach_set('loop_start', (np.arange(len(f)) * n).astype(np.int32))
    me.polygons.foreach_set('loop_total', np.full(len(f), n, np.int32))
    if uv is not None:
        lay = me.uv_layers.new(name='UVMap')
        lay.data.foreach_set('uv', np.asarray(uv, np.float32)[f.ravel()].ravel())
    me.update(calc_edges=True)
    me.validate()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def verts_np(ob):
    me = ob.data
    a = np.zeros(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get('co', a)
    return a.reshape(-1, 3)


def set_verts(ob, v):
    ob.data.vertices.foreach_set('co', np.asarray(v, np.float32).ravel())
    ob.data.update()


def normals_np(ob):
    me = ob.data
    a = np.zeros(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get('normal', a)
    return a.reshape(-1, 3)
