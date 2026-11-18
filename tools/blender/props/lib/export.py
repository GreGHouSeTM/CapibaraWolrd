"""Objets Blender des accessoires (LOD0 chanfreiné, LOD1 décimé), export glTF et compression gltfpack."""
import os
import json
import shutil
import subprocess
import bpy
from mathutils import Vector

MAT_NAMES = ['decor_atlas', 'decor_glow']


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def to_bl(v):
    return (v.x, -v.z, v.y)


def materials():
    out = []
    for n in MAT_NAMES:
        m = bpy.data.materials.get(n) or bpy.data.materials.new(n)
        m.use_nodes = True
        out.append(m)
    return out


def make_object(name, mesh, parent, bevel=0.0, decimate=None):
    """Mesh (lib.mesh) -> objet Blender ; bevel en m (0 = aucun) ; decimate = ratio de réduction (LOD1)."""
    me = bpy.data.meshes.new(name)
    verts = [to_bl(p) for p in mesh.co]
    faces = [f[0] for f in mesh.faces]
    me.from_pydata(verts, [], faces)
    uvl = me.uv_layers.new(name='UVMap')
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    uvs, cols = [], []
    for fi in range(len(mesh.faces)):
        for u in mesh.uv[fi]:
            uvs.extend(u)
        for c in mesh.col[fi]:
            cols.extend((c[0], c[1], c[2], 1.0))
    uvl.data.foreach_set('uv', uvs)
    ca.data.foreach_set('color', cols)
    me.polygons.foreach_set('material_index', [f[1] for f in mesh.faces])
    me.polygons.foreach_set('use_smooth', [bool(f[2]) for f in mesh.faces])
    for m in materials():
        me.materials.append(m)
    me.validate()
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    bpy.context.view_layer.objects.active = ob
    if bevel > 0:
        md = ob.modifiers.new('bevel', 'BEVEL')
        md.width = bevel
        md.segments = 2
        md.limit_method = 'ANGLE'
        md.angle_limit = 0.6
        md.harden_normals = True
        md.use_clamp_overlap = True
        md.miter_outer = 'MITER_ARC'
    if decimate:
        md = ob.modifiers.new('dec', 'DECIMATE')
        md.ratio = decimate
        md.use_collapse_triangulate = True
    md = ob.modifiers.new('tri', 'TRIANGULATE')
    deps = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(deps)
    me2 = bpy.data.meshes.new_from_object(ev)
    ob.modifiers.clear()
    ob.data = me2
    return ob, len(me2.polygons)


def export(out_glb, gltfpack, cache):
    shutil.rmtree(cache, ignore_errors=True)
    os.makedirs(cache, exist_ok=True)
    g = os.path.join(cache, 'decor.gltf')
    bpy.ops.export_scene.gltf(filepath=g, export_format='GLTF_SEPARATE', export_vertex_color='ACTIVE',
                              export_image_format='NONE', export_extras=True, export_yup=True, export_apply=False,
                              export_cameras=False, export_lights=False, export_animations=False, export_materials='EXPORT')
    # matières réduites à leur nom : le jeu fournit l'atlas (src/procgen/village/props.ts)
    d = json.load(open(g))
    d['materials'] = [{'name': m['name'], 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': 0.8}} for m in d.get('materials', [])]
    d.pop('images', None)
    d.pop('textures', None)
    d.pop('samplers', None)
    json.dump(d, open(g, 'w'))
    cmd = [gltfpack, '-i', g, '-o', out_glb, '-cc', '-kn', '-km', '-ke', '-vtf', '-vp', '14', '-vc', '10']
    r = subprocess.run(cmd, capture_output=True, text=True, shell=gltfpack.endswith('.cmd'))
    if r.returncode != 0:
        raise RuntimeError('gltfpack : ' + r.stdout + r.stderr)
    return out_glb
