"""Création des objets Blender, export glTF, compression gltfpack, rendu de contrôle Cycles.

Chaîne : Builder (par LOD) -> objets Blender (`<id>_lod0..2` + vides d'accroche sous un nœud racine `<id>`)
-> glTF séparé (cache) -> matières réécrites depuis materials.py (textures externes partagées)
-> gltfpack (quantification KHR_mesh_quantization + compression EXT_meshopt_compression, noms conservés) -> .glb.
"""
import json
import math
import os
import shutil
import subprocess
import bpy
from mathutils import Vector, Matrix
from .materials import MATERIALS

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.abspath(os.path.join(HERE, '../../..'))
OUT_DIR = os.path.join(ROOT, 'public/assets/models/buildings')
CACHE = os.path.join(HERE, '.cache')
GLTFPACK = ['npx', '-y', 'gltfpack@0.22.0']


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def to_bl(v):
    """Repère Three.js (y haut, z façade) -> Blender (z haut) ; l'export glTF (+Y up) refait l'inverse."""
    return (v.x, -v.z, v.y)


_matcache = {}


def bl_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    spec = MATERIALS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = spec.get('rough', 0.8)
    bsdf.inputs['Metallic'].default_value = spec.get('metal', 0.0)
    vc = nt.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = 'Col'
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    nt.links.new(vc.outputs['Color'], mix.inputs['B'])
    if 'diff' in spec:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(os.path.join(OUT_DIR, spec['diff']), check_existing=True)
        nt.links.new(tex.outputs['Color'], mix.inputs['A'])
        if 'emis' in spec:
            em = nt.nodes.new('ShaderNodeMix')
            em.data_type = 'RGBA'
            em.blend_type = 'MULTIPLY'
            em.inputs['Factor'].default_value = 1.0
            em.inputs['B'].default_value = (*spec['emis_factor'], 1)
            nt.links.new(tex.outputs['Color'], em.inputs['A'])
            nt.links.new(em.outputs['Result'], bsdf.inputs['Emission Color'])
            bsdf.inputs['Emission Strength'].default_value = 0.0
    else:
        mix.inputs['A'].default_value = (*spec['color'], 1)
    nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    if 'nor' in spec:
        nt2 = nt.nodes.new('ShaderNodeTexImage')
        nt2.image = bpy.data.images.load(os.path.join(OUT_DIR, spec['nor']), check_existing=True)
        nt2.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = spec.get('nscale', 1.0)
        nt.links.new(nt2.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return m


def make_object(name, builder, parent=None):
    mats = sorted(builder.parts)
    verts, faces, uvs, cols, mi, sm = [], [], [], [], [], []
    for k, m in enumerate(mats):
        p = builder.parts[m]
        base = len(verts)
        verts.extend(to_bl(v) for v in p.co)
        for f, uv, cl, s in zip(p.faces, p.uv, p.col, p.sm):
            faces.append(tuple(i + base for i in f))
            for u in uv:
                uvs.extend((u[0], u[1]))
            for c in cl:
                cols.extend((c[0], c[1], c[2], 1.0))
            mi.append(k)
            sm.append(s)
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    uvl = me.uv_layers.new(name='UVMap')
    uvl.data.foreach_set('uv', uvs)
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    ca.data.foreach_set('color', cols)
    me.polygons.foreach_set('material_index', mi)
    me.polygons.foreach_set('use_smooth', sm)
    for m in mats:
        me.materials.append(bl_material(m))
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if parent:
        ob.parent = parent
    return ob


def build_scene(bid, lods, anchors):
    """lods = [Builder lod0, lod1, lod2] ; anchors = liste (nom, pos, yaw, extras)."""
    root = bpy.data.objects.new(bid, None)
    bpy.context.scene.collection.objects.link(root)
    obs = []
    for i, bl in enumerate(lods):
        obs.append(make_object(f'{bid}_lod{i}', bl, root))
    counts = {}
    for name, p, yaw, extras in anchors:
        k = counts.get(name, 0)
        counts[name] = k + 1
        e = bpy.data.objects.new(f'{name}_{k}', None)
        bpy.context.scene.collection.objects.link(e)
        e.parent = root
        e.location = to_bl(p)
        e.rotation_euler = (0, 0, yaw)  # yaw Three.js autour de +y = rotation Blender autour de +z
        e.empty_display_size = 0.2
        for kk, vv in extras.items():
            e[kk] = vv
    return root, obs


def _patch_gltf(path):
    d = json.load(open(path))
    images, textures = [], []
    imap = {}

    def tex(uri):
        if uri not in imap:
            images.append({'uri': uri, 'mimeType': 'image/jpeg'})
            textures.append({'source': len(images) - 1, 'sampler': 0})
            imap[uri] = len(textures) - 1
        return imap[uri]

    mats = []
    for m in d.get('materials', []):
        spec = MATERIALS[m['name']]
        pbr = {'metallicFactor': spec.get('metal', 0.0), 'roughnessFactor': spec.get('rough', 0.8)}
        nm = {'name': m['name']}
        if 'diff' in spec:
            pbr['baseColorTexture'] = {'index': tex(spec['diff'])}
        else:
            pbr['baseColorFactor'] = [*spec['color'], 1.0]
        nm['pbrMetallicRoughness'] = pbr
        if 'nor' in spec:
            nm['normalTexture'] = {'index': tex(spec['nor']), 'scale': spec.get('nscale', 1.0)}
        if 'emis' in spec:
            nm['emissiveTexture'] = {'index': tex(spec['emis'])}
            nm['emissiveFactor'] = list(spec['emis_factor'])
        if 'extras' in spec:
            nm['extras'] = spec['extras']
        mats.append(nm)
    d['materials'] = mats
    d['images'] = images
    d['textures'] = textures
    d['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]
    json.dump(d, open(path, 'w'))


def export(bid, out_name=None):
    out_name = out_name or bid
    tmp = os.path.join(CACHE, 'gltf', out_name)
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp, exist_ok=True)
    g = os.path.join(tmp, out_name + '.gltf')
    bpy.ops.export_scene.gltf(filepath=g, export_format='GLTF_SEPARATE', export_vertex_color='ACTIVE',
                              export_image_format='NONE', export_extras=True, export_yup=True, export_apply=False,
                              export_cameras=False, export_lights=False, export_animations=False, export_materials='EXPORT')
    _patch_gltf(g)
    # gltfpack attend les images à côté du fichier : on lui donne des chemins relatifs à la sortie finale (-tr)
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, out_name + '.glb')
    cmd = GLTFPACK + ['-i', g, '-o', out, '-cc', '-tr', '-kn', '-km', '-ke', '-vc', '10', '-vp', '14']
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError('gltfpack : ' + r.stdout + r.stderr)
    return out


# ====================================================================== rendu de contrôle (Cycles, lumière dorée)
def setup_render(target=(0, 3, 0), cam=(14, 16, 5), res=(720, 450), samples=24, night=False, lens=32, sun_az=-35):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception:
        pass
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    try:
        sc.view_settings.view_transform = 'AgX'
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    world = bpy.data.worlds.new('W')
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if night:
        bg.inputs['Color'].default_value = (0.012, 0.018, 0.04, 1)
        bg.inputs['Strength'].default_value = 1.0
    else:
        bg.inputs['Color'].default_value = (0.55, 0.42, 0.36, 1)
        bg.inputs['Strength'].default_value = 0.55
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 0.25 if night else 4.5
    sun.color = (0.6, 0.7, 1.0) if night else (1.0, 0.68, 0.38)
    sun.angle = math.radians(2.0)
    so = bpy.data.objects.new('sun', sun)
    sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(90 - 14), 0, math.radians(sun_az))
    # sol
    me = bpy.data.meshes.new('ground')
    s = 60
    me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
    gm = bpy.data.materials.new('ground')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.16, 0.13, 0.1, 1)
    gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0
    me.materials.append(gm)
    go = bpy.data.objects.new('ground', me)
    sc.collection.objects.link(go)
    go.location.z = -0.02
    camd = bpy.data.cameras.new('cam')
    camd.lens = lens
    co = bpy.data.objects.new('cam', camd)
    sc.collection.objects.link(co)
    sc.camera = co
    tb = Vector((target[0], -target[2], target[1]))
    cb = Vector((cam[0], -cam[2], cam[1]))
    co.location = cb
    co.rotation_euler = (tb - cb).to_track_quat('-Z', 'Y').to_euler()
    if night:
        for m in bpy.data.materials:
            if m.name == 'paper_shoji':
                m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 3.0
    return co


def render(path, show_lods=(0,), bid=None):
    for ob in bpy.data.objects:
        if '_lod' in ob.name:
            k = int(ob.name.rsplit('_lod', 1)[1])
            ob.hide_render = k not in show_lods
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
