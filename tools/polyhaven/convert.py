"""Conversion d'un modèle Poly Haven (glTF 1k téléchargé) en .glb compact pour Capy World.

Lancé par fetch.py, un processus Blender (`bpy`) par modèle :
    flock /tmp/capy-blender.lock python3 -I tools/polyhaven/convert.py <job.json>

Le fichier job (écrit par fetch.py) contient :
    src       chemin du .gltf téléchargé (avec ses textures)
    out       chemin du .glb à écrire
    stats     chemin du JSON de statistiques à écrire (lu par fetch.py pour le manifeste)
    name      préfixe des nœuds (id Capy World)
    tex       taille max des textures (1024, 512, 256)
    tint      profil de teinte : rock | moss | plant | wood | miso | yuzu | pear | none
    lods      [max triangles LOD0, ratio LOD1, ratio LOD2…] (ratios relatifs au LOD0)
    split     "objects" (une pièce par objet du fichier), "loose" (une pièce par morceau détaché), ou false (tout fusionné)
    only      expression régulière facultative : ne garde que les objets dont le nom correspond
    keep      liste facultative de pièces à garder (indices après tri) ; maxparts : nombre max de pièces
    foliage   true : LOD par élagage de cartes de feuilles au lieu de la décimation
    hard      true : normales par angle (objets manufacturés) ; sinon lissage complet (organique)
    quality   qualité WebP des textures

Ce que fait le script : teinte et réduction des textures (PIL), import glTF, application des transformations, découpage des
ensembles en pièces, origine au sol (centre du bas de la boîte englobante), décimation par LOD, export GLB (textures WebP).
Nœuds exportés : `<name>[_<pièce>]_lod0`, `_lod1`, `_lod2` (toutes les LOD dans un seul fichier : textures partagées).
"""
import json
import math
import os
import random
import shutil
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector
from PIL import Image

job = json.load(open(sys.argv[1]))
NAME = job['name']
random.seed(hash(NAME) & 0xFFFF)


# ------------------------------------------------------------------------------------------------ textures
def rgb_to_hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rc = np.where(m, (mx - r) / np.maximum(d, 1e-6), 0)
    gc = np.where(m, (mx - g) / np.maximum(d, 1e-6), 0)
    bc = np.where(m, (mx - b) / np.maximum(d, 1e-6), 0)
    h = np.where(r == mx, bc - gc, np.where(g == mx, 2.0 + rc - bc, 4.0 + gc - rc))
    h = np.where(m, (h / 6.0) % 1.0, 0)
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return np.stack([h, s, mx], -1)


def hsv_to_rgb(hsv):
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    i = np.floor(h * 6.0)
    f = h * 6.0 - i
    p = v * (1 - s)
    q = v * (1 - s * f)
    t = v * (1 - s * (1 - f))
    i = i.astype(int) % 6
    r = np.choose(i, [v, q, p, p, t, v])
    g = np.choose(i, [t, v, v, q, p, p])
    b = np.choose(i, [p, p, t, v, v, q])
    return np.stack([r, g, b], -1)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def hue_lerp(h, target, k):
    d = ((target - h + 0.5) % 1.0) - 0.5
    return (h + d * k) % 1.0


# Palette de la bible (§9) : mousse #5f7a3a (teinte 85°), pierre grise chaude #8f8a80 (teinte 40°, s 0,10).
MOSS_H, MOSS_S = 85 / 360, 0.52
STONE_H, STONE_S, STONE_V = 38 / 360, 0.12, 0.42


def tint(img, profile):
    a = np.asarray(img).astype(np.float32) / 255.0
    alpha = a[..., 3:4] if a.shape[-1] == 4 else None
    rgb = a[..., :3]
    hsv = rgb_to_hsv(rgb)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    hd = h * 360
    # masque « végétal » : teintes jaune-vert à vert-bleu un peu saturées
    green = smooth(0.06, 0.18, s) * smooth(45, 65, hd) * (1 - smooth(165, 190, hd))
    if profile == 'rock':
        # sur la pierre, la mousse photoscannée est souvent olive (40-60°) : masque élargi mais plus exigeant en saturation
        green = smooth(0.12, 0.26, s) * smooth(36, 52, hd) * (1 - smooth(165, 190, hd))
        # mousse vers #5f7a3a, pierre vers un gris chaud
        h = np.where(green > 0, hue_lerp(h, MOSS_H, 0.55 * green), h)
        s = s + (np.maximum(s, 0.42) - s) * 0.5 * green
        stone = 1 - green
        h = hue_lerp(h, STONE_H, 0.4 * stone)
        s = s + (STONE_S - s) * 0.4 * stone
        # luminosité moyenne de la pierre ramenée (en partie) vers la palette
        w = stone.mean()
        if w > 0.05:
            mean_v = float((v * stone).sum() / max(stone.sum(), 1))
            k = np.clip((STONE_V / max(mean_v, 1e-3)) ** 0.6, 0.9, 1.2)
            v = np.clip(v * (1 + (k - 1) * stone), 0, 1)
        # la mousse un rien plus lumineuse et plus jaune au soleil doré
        v = np.clip(v * (1 + 0.06 * green), 0, 1)
    elif profile in ('moss', 'plant'):
        k = 0.55 if profile == 'moss' else 0.35
        h = np.where(green > 0, hue_lerp(h, MOSS_H, k * green), h)
        s = s * (1 - 0.12 * green) if profile == 'plant' else s
        # parties brunes (bois, terre) un peu réchauffées
        brown = (1 - green) * smooth(0.08, 0.2, s)
        h = hue_lerp(h, 28 / 360, 0.25 * brown)
    elif profile in ('wood', 'miso'):
        # bois réchauffé vers #5a3a24-#7a5236, sans saturer les métaux gris
        wk = smooth(0.12, 0.3, s)
        h = hue_lerp(h, 25 / 360, 0.35 * wk)
        if profile == 'miso':
            # tonneau de miso : bois plus sombre et plus rouge
            v = v * 0.82
            s = np.clip(s * 1.08, 0, 1)
    elif profile == 'yuzu':
        # citron vert -> yuzu jaune d'or
        fruit = smooth(0.15, 0.3, s)
        h = hue_lerp(h, 46 / 360, 0.95 * fruit)
        s = np.clip(s * (1 + 0.1 * fruit), 0, 1)
        v = np.clip(v * (1 + 0.35 * fruit), 0, 1)
    out = hsv_to_rgb(np.stack([h, s, v], -1))
    if alpha is not None:
        out = np.concatenate([out, alpha], -1)
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), img.mode)


def prepare_textures(src_dir, work_dir):
    """Copie le glTF dans un dossier de travail, réduit les textures et teinte les couleurs de base."""
    if os.path.isdir(work_dir):
        shutil.rmtree(work_dir)
    shutil.copytree(src_dir, work_dir)
    for root, _, files in os.walk(work_dir):
        for f in files:
            if not f.lower().endswith(('.jpg', '.jpeg', '.png')):
                continue
            p = os.path.join(root, f)
            img = Image.open(p)
            img.load()
            if img.mode not in ('RGB', 'RGBA'):
                img = img.convert('RGBA' if 'A' in img.mode else 'RGB')
            size = job['tex']
            if max(img.size) > size:
                r = size / max(img.size)
                img = img.resize((max(4, round(img.width * r)), max(4, round(img.height * r))), Image.LANCZOS)
            if ('_diff' in f or '_col' in f or 'albedo' in f.lower()) and job.get('tint', 'none') != 'none':
                img = tint(img, job['tint'])
            # même nom, même format (le glTF y fait référence)
            if f.lower().endswith('.png'):
                img.save(p)
            else:
                img.convert('RGB').save(p, quality=95)


# ------------------------------------------------------------------------------------------------ géométrie
def tri_count(obj):
    me = obj.data
    me.calc_loop_triangles()
    return len(me.loop_triangles)


def select_only(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def bake_transforms():
    """Fusionne les hiérarchies : chaque maillage porte sa transformation monde, plus de parents ni de vides."""
    scene = bpy.context.scene
    meshes = [o for o in scene.objects if o.type == 'MESH']
    select_only(meshes)
    bpy.ops.object.make_single_user(object=True, obdata=True)
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    select_only(meshes)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(scene.objects):
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    import re
    only = job.get('only')
    if only:
        for o in [m for m in meshes if not re.search(only, m.name)]:
            bpy.data.objects.remove(o, do_unlink=True)
        meshes = [m for m in bpy.context.scene.objects if m.type == 'MESH']
    # soudure des sommets : le glTF coupe le maillage à chaque couture d'UV ou de normale (bords partout) ; les UV restent
    # portées par les coins de faces dans Blender, et les normales sont recalculées ensuite (set_normals)
    for o in meshes:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bm.to_mesh(o.data)
        bm.free()
    return meshes


def bbox(objs):
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for v in o.data.vertices:
            co = o.matrix_world @ v.co
            mn = Vector(map(min, mn, co))
            mx = Vector(map(max, mx, co))
    return mn, mx


def join(objs):
    if len(objs) == 1:
        return objs[0]
    select_only(objs)
    bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def make_parts(meshes):
    mode = job.get('split', False)
    if mode == 'objects':
        parts = list(meshes)
    elif mode == 'loose':
        o = join(meshes)
        select_only([o])
        bpy.ops.mesh.separate(type='LOOSE')
        parts = [x for x in bpy.context.scene.objects if x.type == 'MESH']
        # fusionne les miettes (< 3 % des triangles) avec la pièce la plus proche
        tot = sum(tri_count(p) for p in parts)
        big = [p for p in parts if tri_count(p) >= 0.03 * tot]
        small = [p for p in parts if p not in big]
        centers = {p.name: sum((bbox([p])[0], bbox([p])[1]), Vector()) / 2 for p in parts}
        groups = {p.name: [p] for p in big}
        for s in small:
            best = min(big, key=lambda b: (centers[b.name] - centers[s.name]).length)
            groups[best.name].append(s)
        parts = [join(g) for g in groups.values()]
    else:
        parts = [join(meshes)]
    # tri stable : par position x puis y (l'ordre des lettres a, b, c… suit la disposition du fichier Poly Haven)
    def key(p):
        mn, mx = bbox([p])
        return (round((mn.x + mx.x) / 2, 2), round((mn.y + mx.y) / 2, 2))
    parts.sort(key=key)
    keep = job.get('keep')
    if keep is not None:
        drop = [p for i, p in enumerate(parts) if i not in keep]
        parts = [p for i, p in enumerate(parts) if i in keep]
        for p in drop:
            bpy.data.objects.remove(p, do_unlink=True)
    mp = job.get('maxparts')
    if mp and len(parts) > mp:
        # garde les plus grosses pièces
        parts.sort(key=lambda p: -tri_count(p))
        for p in parts[mp:]:
            bpy.data.objects.remove(p, do_unlink=True)
        parts = sorted(parts[:mp], key=key)
    return parts


def ground_origin(o):
    """Origine au centre du bas de la boîte englobante (posé au sol), objet ramené à l'origine du monde."""
    mn, mx = bbox([o])
    off = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    o.data.transform(Matrix.Translation(-off))
    o.matrix_world = Matrix.Identity(4)
    return off


def set_normals(o):
    me = o.data
    try:
        if me.has_custom_normals:
            bpy.context.view_layer.objects.active = o
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
    except Exception:
        pass
    if job.get('hard'):
        me.set_sharp_from_angle(angle=math.radians(40))
    else:
        me.shade_smooth()


def decimate(o, target):
    n = tri_count(o)
    if target >= n * 0.97:
        return
    m = o.modifiers.new('dec', 'DECIMATE')
    m.decimate_type = 'COLLAPSE'
    m.ratio = max(0.0005, target / n)
    m.use_collapse_triangulate = True
    select_only([o])
    bpy.ops.object.modifier_apply(modifier=m.name)


def prune_cards(o, target):
    """LOD de feuillage : supprime au hasard des cartes (îlots) et grossit un peu les cartes restantes."""
    n = tri_count(o)
    if target >= n * 0.97:
        return
    f = target / n
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.faces.ensure_lookup_table()
    seen = set()
    islands = []
    for face in bm.faces:
        if face.index in seen:
            continue
        stack = [face]
        isl = []
        seen.add(face.index)
        while stack:
            cur = stack.pop()
            isl.append(cur)
            for e in cur.edges:
                for lf in e.link_faces:
                    if lf.index not in seen:
                        seen.add(lf.index)
                        stack.append(lf)
        islands.append(isl)
    # gros îlots (tiges, branches) gardés en priorité ; les cartes sont tirées au sort
    islands.sort(key=lambda i: -len(i))
    total = sum(len(i) for i in islands)
    kept = 0
    remove = []
    grow = 1 / max(f, 0.05) ** 0.22
    for idx, isl in enumerate(islands):
        big = len(isl) > total * 0.05
        if big or (random.random() < f and kept < target * 1.05):
            kept += len(isl)
            if not big and grow > 1.01:
                verts = {v for fc in isl for v in fc.verts}
                c = sum((v.co for v in verts), Vector()) / len(verts)
                for v in verts:
                    v.co = c + (v.co - c) * grow
        else:
            remove.extend(isl)
    bmesh.ops.delete(bm, geom=list({fc for fc in remove}), context='FACES')
    bm.to_mesh(o.data)
    bm.free()
    if tri_count(o) > target * 1.3:
        decimate(o, target)


def dims_yup(o):
    mn, mx = bbox([o])
    d = mx - mn
    # Blender Z-up -> glTF Y-up : (x, y, z) = (x, z, y)
    return [round(d.x, 3), round(d.z, 3), round(d.y, 3)]


def radius(o):
    r = 0.0
    for v in o.data.vertices:
        r = max(r, v.co.length)
    return round(r, 3)


# ------------------------------------------------------------------------------------------------ programme
def main():
    work = job['work']
    prepare_textures(os.path.dirname(job['src']), work)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    src = os.path.join(work, os.path.basename(job['src']))
    # merge_vertices : le glTF duplique les sommets aux coutures d'UV et de normales ; sans fusion, la décimation
    # ne peut pas réduire les bords (maillage en morceaux) et plafonne à ~25 % de l'original.
    bpy.ops.import_scene.gltf(filepath=src, merge_vertices=True)
    meshes = bake_transforms()
    src_tris = sum(tri_count(o) for o in meshes)
    parts = make_parts(meshes)
    lods = job['lods']
    letters = 'abcdefghijklmnopqrstuvwxyz'
    stats = {'name': NAME, 'sourceTriangles': src_tris, 'parts': []}
    for i, p in enumerate(parts):
        pname = NAME if len(parts) == 1 else f'{NAME}_{letters[i]}'
        off = ground_origin(p)
        base_tris = tri_count(p)
        lod0_target = min(base_tris, lods[0])
        objs = []
        for li in range(len(lods)):
            o = p if li == 0 else p.copy()
            if li > 0:
                o.data = p.data.copy()
                bpy.context.scene.collection.objects.link(o)
            target = lod0_target if li == 0 else max(48, int(lod0_target * lods[li]))
            changed = target < tri_count(o) * 0.97
            if job.get('foliage'):
                prune_cards(o, target)
            else:
                decimate(o, target)
            set_normals(o)
            o.name = f'{pname}_lod{li}'
            o.data.name = o.name
            objs.append(o)
            if li == 0:
                p = o
        # LOD ultérieures construites à partir du LOD0 : on décime le LOD0 (déjà réduit), pas l'original
        stats['parts'].append({
            'name': pname,
            'offset': [round(off.x, 3), round(off.z, 3), round(-off.y, 3)],
            'dimensions': dims_yup(objs[0]),
            'radius': radius(objs[0]),
            'lods': [{'node': o.name, 'triangles': tri_count(o), 'vertices': len(o.data.vertices)} for o in objs],
        })
    mats = {m.name: m for o in bpy.context.scene.objects if o.type == 'MESH' for m in o.data.materials if m}
    # faces arrière éliminées sauf pour le feuillage (cartes de feuilles vues des deux côtés)
    for m in mats.values():
        m.use_backface_culling = not job.get('foliage')
    stats['materials'] = len(mats)
    stats['alpha'] = any(m.blend_method != 'OPAQUE' or getattr(m, 'surface_render_method', '') == 'BLENDED' for m in mats.values()) or bool(job.get('foliage'))
    os.makedirs(os.path.dirname(job['out']), exist_ok=True)
    kw = dict(
        filepath=job['out'], export_format='GLB', use_selection=False, export_image_format='WEBP',
        export_image_quality=job.get('quality', 80), export_tangents=False, export_yup=True, export_apply=True,
        export_texcoords=True, export_normals=True, export_materials='EXPORT', export_animations=False,
        export_cameras=False, export_lights=False, export_extras=False, export_vertex_color='NONE',
    )
    # (pas de Draco : la bibliothèque d'encodage n'est pas fournie avec le module bpy ; fetch.py compresse ensuite
    #  la géométrie avec gltfpack -> EXT_meshopt_compression + KHR_mesh_quantization, décodeur inclus dans three)
    bpy.ops.export_scene.gltf(**kw)
    stats['bytes'] = os.path.getsize(job['out'])
    json.dump(stats, open(job['stats'], 'w'), indent=1)
    print('OK', NAME, stats['bytes'], 'octets', [[l['triangles'] for l in pp['lods']] for pp in stats['parts']])


main()
