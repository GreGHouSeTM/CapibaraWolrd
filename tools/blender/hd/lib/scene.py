"""Côté Blender du pipeline HD : objets, matières de prévisualisation, cuisson Cycles (occlusion ambiante dans une couleur
de sommet), patine procédurale (usure d'arêtes, salissure de pied, coulures, mousse au nord, humidité), rendu de
contrôle et export glTF -> gltfpack (meshopt).
"""
import json
import math
import os
import shutil
import subprocess
import numpy as np
import bpy
from mathutils import Vector
from .materials import HD_MATERIALS, OUT_DIR, TEX_DIR
from .geo import FLAG_EDGE, FLAG_NOMOSS, FLAG_NOWEATHER, FLAG_ROOF

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.abspath(os.path.join(HERE, '../../..'))
CACHE = os.path.join(HERE, '.cache')
GLTFPACK = os.path.join(ROOT, 'tools/polyhaven/node_modules/.bin/gltfpack' + ('.cmd' if os.name == 'nt' else ''))
if not os.path.exists(GLTFPACK):
    GLTFPACK = os.path.join('L:/CLAUDE/CapyWorld', 'tools/polyhaven/node_modules/.bin/gltfpack.cmd')


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def to_bl(p):
    return (p[0], -p[2], p[1])


# ------------------------------------------------------------------------------------------------ matières Blender
def bl_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    spec = HD_MATERIALS[name]
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
    nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])

    def img(path, noncolor=False):
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = bpy.data.images.load(path, check_existing=True)
        if noncolor:
            t.image.colorspace_settings.name = 'Non-Color'
        return t
    if 'ph' in spec:
        d = img(os.path.join(TEX_DIR, f'{name}_diff.webp'))
        nt.links.new(d.outputs['Color'], mix.inputs['A'])
        n = img(os.path.join(TEX_DIR, f'{name}_nor.webp'), True)
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = spec.get('nscale', 1.0)
        nt.links.new(n.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
        a = img(os.path.join(TEX_DIR, f'{name}_arm.webp'), True)
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(a.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    elif 'diff' in spec:
        d = img(os.path.normpath(os.path.join(OUT_DIR, spec['diff'])))
        nt.links.new(d.outputs['Color'], mix.inputs['A'])
        if 'emis' in spec:
            em = nt.nodes.new('ShaderNodeMix')
            em.data_type = 'RGBA'
            em.blend_type = 'MULTIPLY'
            em.inputs['Factor'].default_value = 1.0
            em.inputs['B'].default_value = (*spec['emis_factor'], 1)
            nt.links.new(d.outputs['Color'], em.inputs['A'])
            nt.links.new(em.outputs['Result'], bsdf.inputs['Emission Color'])
            bsdf.inputs['Emission Strength'].default_value = 0.0
    else:
        mix.inputs['A'].default_value = (*spec['color'], 1)
    return m


# ------------------------------------------------------------------------------------------------ objets
def make_object(name, g, parent=None):
    mats = sorted(g.parts)
    verts, faces, uvs, mi, sm, tint, flag = [], [], [], [], [], [], []
    for k, m in enumerate(mats):
        p = g.parts[m]
        base = len(verts)
        verts.extend(to_bl(v) for v in p.co)
        for f, uv, tc, fl, s in zip(p.faces, p.uv, p.tint, p.flag, p.smooth):
            faces.append(tuple(i + base for i in f))
            for u in uv:
                uvs.extend((u[0], u[1]))
            mi.append(k)
            sm.append(s)
            tint.extend((tc[0], tc[1], tc[2], 1.0))
            flag.append(fl)
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.uv_layers.new(name='UVMap').data.foreach_set('uv', uvs)
    me.polygons.foreach_set('material_index', mi)
    me.polygons.foreach_set('use_smooth', sm)
    me.attributes.new('tint', 'FLOAT_COLOR', 'FACE').data.foreach_set('color', tint)
    me.attributes.new('hdflag', 'INT', 'FACE').data.foreach_set('value', flag)
    for m in mats:
        me.materials.append(bl_material(m))
    # couleur finale (teinte × patine), remplie par weather()
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    me.color_attributes.active_color = ca
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if parent:
        ob.parent = parent
    return ob


def merge_doubles(ob, dist=1e-4):
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bm.to_mesh(ob.data)
    bm.free()


def ground(size=40, y=0.0, color=(0.12, 0.11, 0.08)):
    me = bpy.data.meshes.new('sol')
    s = size
    me.from_pydata([(-s, -s, y), (s, -s, y), (s, s, y), (-s, s, y)], [], [(0, 1, 2, 3)])
    gm = bpy.data.materials.new('sol')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*color, 1)
    gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0
    me.materials.append(gm)
    go = bpy.data.objects.new('sol', me)
    bpy.context.scene.collection.objects.link(go)
    return go


# ------------------------------------------------------------------------------------------------ cuisson + patine
def cycles(samples=32, gpu=True):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.cycles.device = 'CPU'
    if gpu:
        try:
            prefs = bpy.context.preferences.addons['cycles'].preferences
            for kind in ('OPTIX', 'CUDA'):
                try:
                    prefs.compute_device_type = kind
                    prefs.get_devices()
                    devs = [d for d in prefs.devices if d.type == kind]
                    if devs:
                        for d in prefs.devices:
                            d.use = d.type == kind
                        sc.cycles.device = 'GPU'
                        break
                except Exception:
                    continue
        except Exception:
            pass
    return sc.cycles.device


def bake_ao(ob, samples=48, distance=1.2):
    """Occlusion ambiante Cycles cuite dans la couleur de sommet 'AO' de l'objet (les autres LOD sont masqués)."""
    sc = bpy.context.scene
    cycles(samples)
    if sc.world is None:
        sc.world = bpy.data.worlds.new('W')
    sc.world.light_settings.distance = distance
    me = ob.data
    ao = me.color_attributes.get('AO') or me.color_attributes.new('AO', 'BYTE_COLOR', 'CORNER')
    me.color_attributes.active_color = ao
    hidden = []
    for o in sc.objects:
        if o.type == 'MESH' and o is not ob and '_lod' in o.name:
            hidden.append((o, o.hide_render))
            o.hide_render = True
    for o in sc.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    sc.render.bake.target = 'VERTEX_COLORS'
    sc.cycles.bake_type = 'AO'
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    for o, h in hidden:
        o.hide_render = h
    me.color_attributes.active_color = me.color_attributes['Col']


def _vn(p, f, seed=0):
    """Bruit de valeur vectorisé (numpy) : p (N, 3) -> (N,) dans [0, 1]."""
    q = p * f + seed * 17.13
    i = np.floor(q).astype(np.int64)
    t = q - i
    t = t * t * (3 - 2 * t)

    def h(ix, iy, iz):
        v = (ix * 374761393 + iy * 668265263 + iz * 1442695041 + seed * 1274126177) & 0xFFFFFFFF
        v = ((v ^ (v >> 13)) * 1274126177) & 0xFFFFFFFF
        return ((v ^ (v >> 16)) & 0xFFFF) / 65535.0
    r = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (t[:, 0] if dx else 1 - t[:, 0]) * (t[:, 1] if dy else 1 - t[:, 1]) * (t[:, 2] if dz else 1 - t[:, 2])
                r = r + w * h(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz)
    return r


def _fbm(p, f, seed, oct=3):
    s, a, tot = 0.0, 1.0, 0.0
    for k in range(oct):
        s = s + a * _vn(p, f * (2 ** k), seed + k)
        tot += a
        a *= 0.5
    return s / tot


def weather(ob, yaw=0.0, ground_y=0.0, eave_y=None, ao_strength=1.0, moss=1.0, dirt=1.0, seed=1):
    """Couleur finale par coin = teinte × occlusion cuite × patine.

    - usure des arêtes : faces de chanfrein (FLAG_EDGE) éclaircies, bois délavé ;
    - salissure de pied de mur (éclaboussures de terre) sur 0,6 m ; humidité (assombrissement) sur 1,2 m ;
    - coulures verticales sous les avant-toits (bruit étiré en y) sur les murs ;
    - mousse : faces tournées vers le haut ou vers le nord (monde : −z ; repère local tourné de `yaw`), à l'ombre, sur
      pierres, tuiles basses et bois proches du sol ; jamais sur FLAG_NOMOSS / FLAG_NOWEATHER.
    """
    me = ob.data
    nl = len(me.loops)
    np_ = len(me.polygons)
    vco = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', vco)
    vco = vco.reshape(-1, 3)
    lv = np.empty(nl, dtype=np.int64)
    me.loops.foreach_get('vertex_index', lv)
    pn = np.empty(np_ * 3)
    me.polygons.foreach_get('normal', pn)
    pn = pn.reshape(-1, 3)
    ls = np.empty(np_, dtype=np.int64)
    me.polygons.foreach_get('loop_start', ls)
    lt = np.empty(np_, dtype=np.int64)
    me.polygons.foreach_get('loop_total', lt)
    pm = np.empty(np_, dtype=np.int64)
    me.polygons.foreach_get('material_index', pm)
    poly_of_loop = np.repeat(np.arange(np_), lt)
    tint = np.empty(np_ * 4)
    me.attributes['tint'].data.foreach_get('color', tint)
    tint = tint.reshape(-1, 4)[:, :3]
    fl = np.empty(np_, dtype=np.int64)
    me.attributes['hdflag'].data.foreach_get('value', fl)
    # positions Blender (x, -z, y) -> repère Three.js local (x, y, z)
    P = vco[lv]
    P = np.stack([P[:, 0], P[:, 2], -P[:, 1]], 1)
    N = pn[poly_of_loop]
    N = np.stack([N[:, 0], N[:, 2], -N[:, 1]], 1)
    F = fl[poly_of_loop]
    col = tint[poly_of_loop].copy()
    mats = [m.name for m in me.materials]
    mat = np.array([mats[i] for i in pm[poly_of_loop]]) if nl else np.array([])
    is_ = lambda *names: np.isin(mat, names)
    aoa = me.color_attributes.get('AO')
    if aoa is not None:
        ao = np.empty(nl * 4)
        aoa.data.foreach_get('color', ao)
        ao = ao.reshape(-1, 4)[:, 0]
        # l'AO cuit est en espace linéaire ; on l'adoucit (lumière indirecte du jeu) et on garde des noirs de contact
        ao = np.clip(ao, 0, 1) ** (0.85 * ao_strength)
    else:
        ao = np.ones(nl)
    noweather = (F & FLAG_NOWEATHER) > 0
    y = P[:, 1] - ground_y
    # ---- usure des arêtes (bois) : éclaircit et désature légèrement
    edge = ((F & FLAG_EDGE) > 0) & is_('hd_bois', 'hd_planches', 'hd_bois_gris') & ~noweather
    wear_n = _fbm(P, 3.0, seed + 1)
    wear = edge * np.clip((wear_n - 0.35) * 2.2, 0, 1) * 0.55
    col = col * (1 + wear[:, None] * np.array([0.9, 0.8, 0.65]))
    # arêtes de pierre et de tuile : légèrement plus claires (poussière)
    edge2 = ((F & FLAG_EDGE) > 0) & is_('hd_pierre', 'hd_tuile') & ~noweather
    col = col * (1 + edge2[:, None] * 0.18)
    # ---- humidité et salissure de pied de mur
    vert = np.abs(N[:, 1]) < 0.6
    damp = np.clip(1 - y / 1.1, 0, 1) ** 1.5 * (0.55 + 0.45 * _fbm(P, 2.2, seed + 3)) * dirt
    splash = np.clip(1 - y / 0.55, 0, 1) ** 2 * (0.5 + 0.5 * _fbm(P, 6.0, seed + 4)) * dirt
    k = ~noweather
    col = col * (1 - (damp * 0.32 * k)[:, None])
    mud = np.array([0.42, 0.33, 0.24])
    sp = (splash * 0.55 * k * vert)[:, None]
    col = col * (1 - sp) + (col * mud * 1.25) * sp
    # ---- coulures sous les avant-toits (murs : enduit et bois), bruit étiré verticalement
    if eave_y is not None:
        streak_n = _vn(np.stack([P[:, 0] * 9 + P[:, 2] * 9, P[:, 1] * 0.6, P[:, 2] * 0.0], 1), 1.0, seed + 5)
        top = np.clip((y - (eave_y - 2.2)) / 2.2, 0, 1)
        streak = np.clip((streak_n - 0.55) * 3.0, 0, 1) * top * vert * k * is_('hd_enduit', 'hd_planches', 'hd_bois') * dirt
        col = col * (1 - streak[:, None] * np.array([0.32, 0.34, 0.36]))
    # coulures sur les tuiles (traînées sombres dans le sens de la pente) et taches
    roof = (F & FLAG_ROOF) > 0
    rs = _fbm(np.stack([P[:, 0] * 3.5, P[:, 1] * 0.5, P[:, 2] * 3.5], 1), 1.0, seed + 6)
    col = col * (1 - (roof * np.clip(rs - 0.4, 0, 1) * 0.5)[:, None])
    # ---- mousse
    c, s = math.cos(yaw), math.sin(yaw)
    nz_world = -N[:, 0] * s + N[:, 2] * c
    north = np.clip(-nz_world, 0, 1)
    upf = np.clip(N[:, 1], 0, 1)
    shade = np.clip(1.15 - ao, 0, 1)
    mn = _fbm(P, 1.8, seed + 7, 4)
    low = np.clip(1 - y / 1.4, 0, 1)
    m_stone = is_('hd_pierre') * (0.35 * upf + 0.45 * north + 0.35 * low) * (0.6 + shade)
    m_roof = roof * (0.25 * north + 0.2) * (0.4 + shade) * upf
    m_wood = is_('hd_bois', 'hd_planches', 'hd_bois_gris') * low * (0.25 * north + 0.15 * upf) * (0.5 + shade)
    mossf = (m_stone + m_roof + m_wood) * np.clip((mn - 0.42) * 3.2, 0, 1) * moss
    mossf = np.clip(mossf, 0, 0.85) * k * ((F & FLAG_NOMOSS) == 0)
    moss_c = np.array([0.075, 0.105, 0.035]) * (0.7 + 0.6 * _vn(P, 9.0, seed + 8))[:, None]
    col = col * (1 - mossf[:, None]) + moss_c * mossf[:, None]
    # ---- variation basse fréquence (lots de bois, enduit refait…) puis occlusion
    var = 0.9 + 0.2 * _fbm(P, 0.6, seed + 9)
    col = col * np.where(noweather, 1.0, var)[:, None]
    aok = np.where(is_('hd_papier'), 0.6 + 0.4 * ao, ao)
    col = col * aok[:, None]
    col = np.clip(col, 0, 1)
    out = np.concatenate([col, np.ones((nl, 1))], 1).ravel()
    me.color_attributes['Col'].data.foreach_set('color', out)
    me.color_attributes.active_color = me.color_attributes['Col']
    me.update()


# ------------------------------------------------------------------------------------------------ rendu de contrôle
def setup_render(target, cam, res=(1280, 720), samples=64, lens=35, sun_elev=18, sun_az=-40, night=False):
    sc = bpy.context.scene
    dev = cycles(samples)
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    try:
        sc.view_settings.view_transform = 'AgX'
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    world = sc.world or bpy.data.worlds.new('W')
    sc.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes.get('Background')
    sky = nt.nodes.new('ShaderNodeTexSky')
    try:
        sky.sky_type = 'NISHITA'
        sky.sun_elevation = math.radians(sun_elev)
        sky.sun_rotation = math.radians(sun_az)
        sky.sun_disc = False
    except Exception:
        pass
    nt.links.new(sky.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.02 if night else 0.35
    sun = bpy.data.lights.new('soleil', 'SUN')
    sun.energy = 0.05 if night else 4.0
    sun.color = (1.0, 0.78, 0.55)
    sun.angle = math.radians(1.5)
    so = bpy.data.objects.new('soleil', sun)
    sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(90 - sun_elev), 0, math.radians(sun_az))
    camd = bpy.data.cameras.new('cam')
    camd.lens = lens
    co = bpy.data.objects.new('cam', camd)
    sc.collection.objects.link(co)
    sc.camera = co
    tb, cb = Vector(to_bl(target)), Vector(to_bl(cam))
    co.location = cb
    co.rotation_euler = (tb - cb).to_track_quat('-Z', 'Y').to_euler()
    if night:
        m = bpy.data.materials.get('hd_papier')
        if m:
            m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 2.5
    return dev


def render(path, lod=0):
    for ob in bpy.data.objects:
        if '_lod' in ob.name:
            ob.hide_render = int(ob.name.rsplit('_lod', 1)[1]) != lod
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


# ------------------------------------------------------------------------------------------------ export
def _patch_gltf(path):
    d = json.load(open(path))
    images, textures, imap = [], [], {}

    def tex(uri):
        if uri not in imap:
            mime = 'image/webp' if uri.endswith('.webp') else 'image/jpeg'
            images.append({'uri': uri, 'mimeType': mime})
            textures.append({'source': len(images) - 1, 'sampler': 0})
            imap[uri] = len(textures) - 1
        return imap[uri]
    mats = []
    for m in d.get('materials', []):
        spec = HD_MATERIALS[m['name']]
        pbr = {'metallicFactor': spec.get('metal', 0.0), 'roughnessFactor': spec.get('rough', 0.8)}
        nm = {'name': m['name']}
        if 'ph' in spec:
            n = m['name']
            pbr['baseColorTexture'] = {'index': tex(f'tex/{n}_diff.webp')}
            pbr['metallicRoughnessTexture'] = {'index': tex(f'tex/{n}_arm.webp')}
            pbr['metallicFactor'] = 0.0
            nm['normalTexture'] = {'index': tex(f'tex/{n}_nor.webp'), 'scale': spec.get('nscale', 1.0)}
            nm['occlusionTexture'] = {'index': tex(f'tex/{n}_arm.webp'), 'strength': 0.6}
        elif 'diff' in spec:
            pbr['baseColorTexture'] = {'index': tex(spec['diff'])}
        else:
            pbr['baseColorFactor'] = [*spec['color'], 1.0]
        nm['pbrMetallicRoughness'] = pbr
        if 'emis' in spec:
            nm['emissiveTexture'] = {'index': tex(spec['emis'])}
            nm['emissiveFactor'] = list(spec['emis_factor'])
        if 'extras' in spec:
            nm['extras'] = spec['extras']
        if m['name'] == 'hd_tissu':
            nm['doubleSided'] = True
        mats.append(nm)
    d['materials'] = mats
    d['images'] = images
    d['textures'] = textures
    d['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]
    json.dump(d, open(path, 'w'))


def export(bid):
    tmp = os.path.join(CACHE, 'gltf', bid)
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp, exist_ok=True)
    g = os.path.join(tmp, bid + '.gltf')
    for o in bpy.data.objects:
        o.select_set(False)
    keep = [o for o in bpy.data.objects if o.name == bid or (o.parent and o.parent.name == bid)]
    for o in keep:
        o.select_set(True)
    # seule la couleur 'Col' est exportée (COLOR_0)
    for o in keep:
        if o.type == 'MESH':
            me = o.data
            for nm in ('AO',):
                a = me.color_attributes.get(nm)
                if a:
                    me.color_attributes.remove(a)
            me.color_attributes.active_color = me.color_attributes['Col']
            for nm in ('tint', 'hdflag'):
                a = me.attributes.get(nm)
                if a:
                    me.attributes.remove(a)
    bpy.ops.export_scene.gltf(filepath=g, export_format='GLTF_SEPARATE', use_selection=True, export_vertex_color='ACTIVE',
                              export_image_format='NONE', export_extras=True, export_yup=True, export_apply=False,
                              export_cameras=False, export_lights=False, export_animations=False, export_materials='EXPORT')
    _patch_gltf(g)
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, bid + '.glb')
    cmd = [GLTFPACK, '-i', g, '-o', out, '-cc', '-tr', '-kn', '-km', '-ke', '-vc', '10', '-vp', '14']
    r = subprocess.run(cmd, capture_output=True, text=True, shell=(os.name == 'nt'))
    if r.returncode != 0:
        raise RuntimeError('gltfpack : ' + r.stdout + r.stderr)
    if r.stderr.strip():
        print('gltfpack :', r.stderr.strip()[:500])
    return out
