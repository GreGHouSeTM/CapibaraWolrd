"""Escalier de pierre de la zone « forêt » : dalles de granite usées, bordure de blocs, borne. Cuisson Cycles.

Usage : .venv-blender/Scripts/python.exe -I tools/foret/bl_stairs.py [--fast]

Logique « artiste » (référence foret-escalier) :
  - chaque marche est faite de 1 à 3 dalles de largeurs inégales, posées de travers (tassement de 1 à 2 cm,
    basculement de 1°), joints de 1,5 à 3 cm où la mousse et la terre s'installent ;
  - usure : creux de 1 à 2 cm sur la ligne de passage, nez de marche arrondi (plus fort au centre), éclats aux arêtes,
    flancs bruts (pierre fendue), dessus adouci ;
  - bordure côté vallée : blocs arrondis à demi enterrés qui suivent la pente ; une borne de pierre au pied.
Haute définition (remaillage voxel 1,6 cm + déplacements numpy) → maillage jeu décimé ; normales et AO cuites dans un
atlas 4096² (dépliage automatique). Sorties : public/assets/foret/escalier.glb, escalier_nor.jpg, escalier_ao.jpg.
"""
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import layout as L  # noqa: E402
from common import CACHE, OUT, bake, export_glb, log, pack, set_verts, verts_np, normals_np  # noqa: E402

FAST = '--fast' in sys.argv
VOXEL = 0.03 if FAST else 0.016
ATLAS = 2048 if FAST else 4096
rng = np.random.default_rng(23)


# ------------------------------------------------------------------------------------------------ bruit 3D
def _h3(ix, iy, iz, seed):
    h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 2654435761)
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) & 0xFFFFFF) / float(0xFFFFFF)


def vnoise3(p, seed=0):
    f = np.floor(p).astype(np.int64)
    t = p - f
    u = t * t * (3 - 2 * t)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (u[:, 0] if dx else 1 - u[:, 0]) * (u[:, 1] if dy else 1 - u[:, 1]) * (u[:, 2] if dz else 1 - u[:, 2])
                out = out + w * _h3(f[:, 0] + dx, f[:, 1] + dy, f[:, 2] + dz, seed)
    return out * 2 - 1


def fbm3(p, oct=4, seed=0):
    s, a, n = 0, 1.0, 0
    for o in range(oct):
        s = s + a * vnoise3(p * (2.03 ** o) + o * 7.1, seed + o)
        n += a
        a *= 0.5
    return s / n


# ------------------------------------------------------------------------------------------------ primitives Blender
def cube(name, sx, sy, sz):
    import bpy
    import bmesh
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx; v.co.y *= sy; v.co.z *= sz
    bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=min(sx, sy, sz) * 0.09, segments=3, profile=0.5, affect='EDGES')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def remesh(ob, voxel):
    import bpy
    m = ob.modifiers.new('rm', 'REMESH')
    m.mode = 'VOXEL'
    m.voxel_size = voxel
    m.adaptivity = 0.0
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.ops.object.modifier_apply(modifier='rm')


def decimate(ob, ratio):
    import bpy
    m = ob.modifiers.new('dc', 'DECIMATE')
    m.ratio = ratio
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier='dc')


# ------------------------------------------------------------------------------------------------ dalles
def slab(name, W, D, T, wear_c, wear_w, nose_r, seed):
    """Dalle en repère local (x en travers depuis le bord gauche, y vers l'avant… Blender : x travers, y vers l'arrière
    de la marche, z haut ; dessus à z = 0, nez à y = 0)."""
    ob = cube(name, W, D, T)
    remesh(ob, VOXEL)
    v = verts_np(ob)
    # repère : x ∈ [0, W], y ∈ [0, D] (0 = nez), z ∈ [-T, 0]
    v[:, 0] += W / 2; v[:, 1] += D / 2; v[:, 2] -= T / 2
    x, y, z = v[:, 0], v[:, 1], v[:, 2]
    # nez arrondi par l'usure (rayon plus fort sur la ligne de passage)
    walk = np.exp(-((x - wear_c) / wear_w) ** 2)
    r = nose_r * (0.45 + 0.55 * walk)
    cy, cz = r, -r
    dy, dz = y - cy, z - cz
    corner = (y < cy) & (z > cz)
    d = np.hypot(dy, dz) + 1e-9
    k = np.where(corner & (d > r), r / d, 1.0)
    y2 = cy + dy * k
    z2 = cz + dz * k
    v[:, 1] = np.where(corner, y2, y)
    v[:, 2] = np.where(corner, z2, z)
    x, y, z = v[:, 0], v[:, 1], v[:, 2]
    top = z > -0.03
    # creux d'usure sur la ligne de passage (dessus seulement), plus marqué vers l'avant
    prof = np.exp(-((y - 0.22) / 0.28) ** 2)
    v[:, 2] -= 0.02 * walk * prof * np.clip((z + 0.06) / 0.06, 0, 1)
    p = v * np.array([1.0, 1.0, 1.0]) + seed * 3.7
    # flancs bruts (pierre fendue) : bosses de 5-12 mm, dessus adouci (3 mm)
    n = normals_np(ob)
    side = 1 - np.clip(np.abs(n[:, 2]), 0, 1)
    rough = fbm3(p * 9.0, 4, seed) * (0.003 + 0.009 * side) + fbm3(p * 2.5, 3, seed + 3) * 0.006 * side
    v += n * rough[:, None]
    # éclats aux arêtes : quelques creux sphériques près des arêtes vives
    for c in range(rng.integers(3, 7)):
        ex = rng.uniform(0.05, max(0.06, W - 0.05))
        ey = rng.choice([0.0, rng.uniform(0.05, max(0.06, D - 0.05))])
        ez = 0.0 if rng.random() < 0.7 else rng.uniform(-T, 0)
        if rng.random() < 0.5:
            ex = rng.choice([0.0, W])
        R = rng.uniform(0.03, 0.08)
        dd = np.linalg.norm(v - np.array([ex, ey, ez]), axis=1)
        cut = np.clip(R - dd, 0, None) * (0.55 + 0.3 * fbm3(p * 20, 2, seed + 9))
        v -= n * cut[:, None]
    set_verts(ob, v)
    return ob


def place(ob, origin, yaw, tilt_x, tilt_y, sink):
    """Pose la dalle locale (x travers, y vers l'arrière, z haut) dans le repère Blender du monde."""
    from mathutils import Matrix, Euler, Vector
    ob.matrix_world = (Matrix.Translation(Vector(origin)) @ Euler((tilt_x, tilt_y, yaw), 'ZXY').to_matrix().to_4x4()
                       @ Matrix.Translation(Vector((0, 0, -sink))))


def g2b(x, y, z):
    return (x, -z, y)


# ------------------------------------------------------------------------------------------------ blocs de bordure
def boulder(name, size, seed):
    import bpy
    import bmesh
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=0.5)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    v = verts_np(ob)
    v *= np.array(size)
    v[:, 2] = np.maximum(v[:, 2], -size[2] * 0.32)  # dessous aplati (enterré)
    set_verts(ob, v)
    remesh(ob, VOXEL * 1.4)
    v = verts_np(ob)
    n = normals_np(ob)
    p = v / max(size) * 2.2 + seed * 5.3
    d = fbm3(p * 1.0, 3, seed) * 0.12 * max(size) + fbm3(p * 4.0, 3, seed + 1) * 0.025 * max(size) + fbm3(p * 14, 2, seed + 2) * 0.006
    # facettes de rupture : plans tronqués
    for k in range(3):
        dirv = rng.normal(size=3); dirv[2] = abs(dirv[2]) * 0.6; dirv /= np.linalg.norm(dirv)
        off = rng.uniform(0.32, 0.42) * max(size)
        proj = v @ dirv
        d -= np.clip(proj - off, 0, None) * 0.8
    v += n * d[:, None]
    set_verts(ob, v)
    return ob


def main():
    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(os.path.join(CACHE, 'stairs'), exist_ok=True)
    steps = L.steps()
    F = L.Field()
    his = []
    walk_c = []
    for st in steps:
        W, run, rise, yaw = st['width'], st['run'], st['rise'], st['yaw']
        # découpe en dalles : 1 à 3 morceaux inégaux
        n = rng.choice([1, 2, 2, 2, 3], p=[0.15, 0.25, 0.25, 0.15, 0.2])
        if n == 2:
            cuts = np.array([rng.uniform(0.3, 0.7)]) * W
        elif n == 3:
            c1 = rng.uniform(0.22, 0.4); cuts = np.array([c1, rng.uniform(c1 + 0.22, 0.8)]) * W
        else:
            cuts = np.array([])
        edges = np.r_[0, cuts, W]
        wc = W * 0.5 + rng.normal(0, 0.12)
        for k in range(len(edges) - 1):
            gap0 = 0.0 if k == 0 else rng.uniform(0.008, 0.016)
            gap1 = 0.0 if k == len(edges) - 2 else rng.uniform(0.008, 0.016)
            a0, a1 = edges[k] + gap0, edges[k + 1] - gap1
            Ws = a1 - a0
            D = run + rng.uniform(0.1, 0.16)
            T = rng.uniform(0.3, 0.38)
            ob = slab(f'dalle_{st["flight"]}_{st["i"]}_{k}', Ws, D, T, wc - a0, 0.5, rng.uniform(0.05, 0.085), int(rng.integers(0, 999)))
            # origine : coin gauche du nez, au dessus de la marche (repère jeu → Blender)
            fx, fz = -math.sin(yaw), -math.cos(yaw)  # vers le haut de l'escalier
            rx, rz = math.cos(yaw), -math.sin(yaw)   # vers la droite (est)
            front = rng.normal(0, 0.012)
            ox = st['x'] + rx * (a0 - W / 2) + fx * front
            oz = st['z'] + rz * (a0 - W / 2) + fz * front
            # Blender : y = -z_jeu ; la dalle avance vers +y local = vers le haut de l'escalier (z_jeu décroissant)
            place(ob, g2b(ox, st['y'], oz), -yaw, rng.normal(0, 0.012), rng.normal(0, 0.016), abs(rng.normal(0.008, 0.007)))
            his.append(ob)
        walk_c.append(wc)
    # borne au pied de la première volée, côté vallée
    f1 = L.FLIGHT1
    post = slab('borne', 0.26, 0.24, 1.25, 0.13, 0.2, 0.03, 77)
    place(post, g2b(f1['x'] - f1['width'] / 2 - 0.42, f1['y'] + 0.95, f1['z'] + 0.25), -0.15, 0.03, -0.04, 0.0)
    his.append(post)
    # bordure de blocs côté ouest de chaque volée (suit la pente)
    for fl in (L.FLIGHT1, L.FLIGHT2):
        Lf = fl['n'] * fl['run']
        t = 0.0
        while t < Lf + 0.6:
            # tailles très variées : gros blocs couchés, moellons, petites pierres de calage
            k = rng.random()
            if k < 0.25:
                sz = (rng.uniform(0.8, 1.15), rng.uniform(0.6, 0.95), rng.uniform(0.45, 0.7))
            elif k < 0.75:
                sz = (rng.uniform(0.45, 0.75), rng.uniform(0.35, 0.6), rng.uniform(0.28, 0.5))
            else:
                sz = (rng.uniform(0.25, 0.4), rng.uniform(0.2, 0.35), rng.uniform(0.18, 0.3))
            x = fl['x'] - math.sin(fl['yaw']) * t - fl['width'] / 2 - 0.18 - sz[0] * 0.35 + rng.normal(0, 0.05)
            z = fl['z'] - math.cos(fl['yaw']) * t
            y = fl['y'] + min(t / fl['run'], fl['n']) * fl['rise']
            gy = float(F.height(np.array([x]), np.array([z]))[0])
            ob = boulder(f'bloc_{len(his)}', sz, int(rng.integers(0, 999)))
            ob.location = g2b(x, max(gy, y - 0.35) + sz[2] * 0.12, z)
            ob.rotation_euler = (rng.normal(0, 0.1), rng.normal(0, 0.1), rng.uniform(0, 6.28))
            his.append(ob)
            t += sz[1] * rng.uniform(0.6, 1.05) + (rng.uniform(0.1, 0.45) if rng.random() < 0.2 else 0.0)
    # quelques blocs au pied de la paroi, à droite du bas de l'escalier
    for (x, z, s) in ((2.1, 6.4, 0.75), (2.6, 8.2, 0.55), (1.9, -5.2, 0.5)):
        gy = float(F.height(np.array([x]), np.array([z]))[0])
        ob = boulder(f'bloc_{len(his)}', (s, s * 0.9, s * 0.7), int(rng.integers(0, 999)))
        ob.location = g2b(x, gy + s * 0.12, z)
        ob.rotation_euler = (0, 0, rng.uniform(0, 6.28))
        his.append(ob)
    # haute définition : réunion ; jeu : copie décimée
    bpy.ops.object.select_all(action='DESELECT')
    for o in his:
        o.select_set(True)
    bpy.context.view_layer.objects.active = his[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    hi = bpy.context.view_layer.objects.active
    hi.name = 'escalier_hd'
    nh = len(hi.data.polygons)
    lo = hi.copy(); lo.data = hi.data.copy(); lo.name = 'escalier'
    bpy.context.scene.collection.objects.link(lo)
    decimate(lo, min(1.0, 160000 / nh))
    log(f'escalier : {nh} faces HD → {len(lo.data.polygons)} jeu')
    for p in hi.data.polygons:
        p.use_smooth = True
    for p in lo.data.polygons:
        p.use_smooth = True
    # dépliage automatique dans un atlas
    bpy.ops.object.select_all(action='DESELECT')
    lo.select_set(True)
    bpy.context.view_layer.objects.active = lo
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0015, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    mat = bpy.data.materials.new('escalier')
    mat.use_nodes = True
    lo.data.materials.append(mat)
    world = bpy.data.worlds.new('w')
    bpy.context.scene.world = world
    world.light_settings.distance = 0.8
    cd = os.path.join(CACHE, 'stairs')
    nor = bake(lo, 'NORMAL', ATLAS, ATLAS, os.path.join(cd, 'nor.png'), 1, hi=hi, extrusion=0.02, dist=0.05)
    ao = bake(lo, 'AO', ATLAS // 2, ATLAS // 2, os.path.join(cd, 'ao.png'), 64 if not FAST else 16, hi=hi, extrusion=0.02, dist=0.05)
    from PIL import Image
    Image.open(nor).convert('RGB').save(os.path.join(OUT, 'escalier_nor.jpg'), quality=93, subsampling=0)
    Image.open(ao).convert('L').save(os.path.join(OUT, 'escalier_ao.jpg'), quality=92)
    bpy.data.objects.remove(hi, do_unlink=True)
    raw = os.path.join(cd, 'raw.glb')
    export_glb([lo], raw)
    pack(raw, os.path.join(OUT, 'escalier.glb'))
    json.dump({'walk': walk_c}, open(os.path.join(OUT, 'escalier.json'), 'w'))
    log('écrit escalier.glb', f'{os.path.getsize(os.path.join(OUT, "escalier.glb")) / 1e6:.1f} Mo')


if __name__ == '__main__':
    main()
