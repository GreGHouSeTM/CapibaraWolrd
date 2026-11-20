"""Cartes de rameaux d'épicéa : rameaux modélisés aiguille par aiguille dans Blender, rendus de dessus (Cycles GPU).

Usage : .venv-blender/Scripts/python.exe -I tools/foret/bl_twig.py [--fast]

Un rameau d'épicéa (Picea abies) : axe principal légèrement arqué, rameaux secondaires alternés à 50-65°, aiguilles
de 12 à 20 mm insérées tout autour des rameaux en spirale (4 faces), pointées vers l'avant ; pousses de l'année vert
tendre à l'extrémité, aiguilles anciennes vert sombre bleuté ; rameaux bruns. Trois cartes : rameau long (milieu des
branches), rameau court dense (extrémités), rameau mort (bas du tronc, brindilles nues et quelques aiguilles rousses).
Rendus : couleur (passe d'émission = albédo), normales (espace de la carte), occlusion (AO), opacité (alpha du film).
Sortie : public/assets/foret/tex/rameau_diff.png (RVBA, alpha = opacité, couleurs dilatées sous les trous),
rameau_nor.png (RVB = normale, A = épaisseur/translucidité) et rameau.json (rectangles UV des cartes).
"""
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import CACHE, OUT, log, setup_cycles  # noqa: E402

FAST = '--fast' in sys.argv
rng = np.random.default_rng(5)
PX = 1024 if FAST else 2048  # hauteur de l'atlas


def needle_mesh(verts, faces, cols, base, d, up, length, width, col):
    """Aiguille à 4 faces (losange) de `base` dans la direction d."""
    d = d / np.linalg.norm(d)
    side = np.cross(d, up); side /= np.linalg.norm(side) + 1e-9
    nrm = np.cross(side, d)
    i0 = len(verts)
    tip = base + d * length
    mid = base + d * length * 0.35
    verts += [base, mid + side * width, mid + nrm * width * 0.7, mid - side * width, mid - nrm * width * 0.7, tip]
    for a, b in ((1, 2), (2, 3), (3, 4), (4, 1)):
        faces.append((i0, i0 + a, i0 + b))
        faces.append((i0 + a, i0 + 5, i0 + b))
    cols += [col * 0.7] + [col] * 4 + [col * 1.15]


def tube(verts, faces, cols, pts, r0, r1, col, sides=6):
    pts = np.asarray(pts)
    n = len(pts)
    for i in range(n):
        t = i / (n - 1)
        d = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
        d /= np.linalg.norm(d)
        a = np.cross(d, [0, 0, 1.0])
        if np.linalg.norm(a) < 1e-3:
            a = np.cross(d, [1.0, 0, 0])
        a /= np.linalg.norm(a)
        b = np.cross(d, a)
        r = r0 + (r1 - r0) * t
        for k in range(sides):
            ang = 2 * math.pi * k / sides
            verts.append(pts[i] + (a * math.cos(ang) + b * math.sin(ang)) * r)
            cols.append(col)
    base = len(verts) - n * sides
    for i in range(n - 1):
        for k in range(sides):
            a = base + i * sides + k
            b = base + i * sides + (k + 1) % sides
            faces.append((a, b, b + sides))
            faces.append((a, b + sides, a + sides))


def twig(verts, faces, cols, p0, d0, length, rad, level, tipness, dead=False):
    """Rameau récursif : axe arqué, aiguilles en spirale, rameaux secondaires alternés."""
    nseg = max(6, int(length / 0.012))
    pts = [p0]
    d = d0 / np.linalg.norm(d0)
    bend = rng.normal(0, 0.25) * np.array([1, 0, 0])
    for i in range(nseg):
        d = d + (bend + np.array([0, 0, -0.08])) * (length / nseg) * 0.6
        d /= np.linalg.norm(d)
        pts.append(pts[-1] + d * length / nseg)
    pts = np.array(pts)
    bark = np.array([0.16, 0.085, 0.045]) * rng.uniform(0.8, 1.2)
    tube(verts, faces, cols, pts[::2], rad, rad * 0.35, bark, 5 if level == 0 else 4)
    # aiguilles
    if not dead or rng.random() < 0.5:
        step = 0.0014 if level == 0 else 0.0016
        L = length
        s = 0.0
        ang = rng.uniform(0, 6.28)
        while s < L:
            t = s / L
            i = min(int(t * (len(pts) - 1)), len(pts) - 2)
            p = pts[i] + (pts[i + 1] - pts[i]) * ((t * (len(pts) - 1)) - i)
            ax = pts[i + 1] - pts[i]; ax /= np.linalg.norm(ax)
            ang += 2.39996  # angle d'or
            ref = np.array([0, 0, 1.0])
            u = np.cross(ax, ref); u /= np.linalg.norm(u) + 1e-9
            v = np.cross(ax, u)
            rad_dir = u * math.cos(ang) + v * math.sin(ang)
            # les aiguilles se relèvent vers le haut (lumière) et pointent vers l'avant
            fw = 0.38 + 0.22 * rng.random()
            nd = ax * fw + rad_dir * (1 - fw) + np.array([0, 0, 0.25])
            ln = rng.uniform(0.014, 0.022) * (0.8 + 0.2 * (1 - t * 0.6))
            young = tipness * max(0.0, (t - 0.72) / 0.28)
            old = np.array([0.045, 0.075, 0.04]) * rng.uniform(0.75, 1.25)
            new = np.array([0.16, 0.27, 0.07]) * rng.uniform(0.85, 1.15)
            col = old * (1 - young) + new * young
            if dead:
                col = np.array([0.32, 0.17, 0.07]) * rng.uniform(0.6, 1.2)
            needle_mesh(verts, faces, cols, p + rad_dir * rad * 0.8, nd, ref, ln, 0.0008, col)
            s += step * (2.5 if dead else 1)
    # rameaux secondaires
    if level < 2:
        s = 0.03 if level == 0 else 0.02
        side = 1
        while s < length * 0.88:
            t = s / length
            i = min(int(t * (len(pts) - 1)), len(pts) - 2)
            p = pts[i]
            ax = pts[i + 1] - pts[i]; ax /= np.linalg.norm(ax)
            perp = np.cross(ax, [0, 0, 1.0]); perp /= np.linalg.norm(perp)
            a = math.radians(rng.uniform(48, 66))
            dd = ax * math.cos(a) + perp * side * math.sin(a) + np.array([0, 0, rng.uniform(-0.05, 0.12)])
            sl = length * (0.4 if level == 0 else 0.42) * (1 - t) ** 0.55 * rng.uniform(0.8, 1.15)
            if sl > 0.025:
                twig(verts, faces, cols, p, dd, sl, rad * 0.55, level + 1, tipness, dead)
            s += rng.uniform(0.019, 0.028) if level == 0 else rng.uniform(0.013, 0.019)
            side = -side


def build(name, length, tipness, dead=False):
    import bpy
    verts, faces, cols = [], [], []
    twig(verts, faces, cols, np.array([0.0, 0.0, 0.0]), np.array([0.0, 1.0, 0.0]), length, 0.0028 if not dead else 0.0022, 0, tipness, dead)
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    ca = me.color_attributes.new('col', 'FLOAT_COLOR', 'POINT')
    ca.data.foreach_set('color', np.hstack([np.array(cols), np.ones((len(cols), 1))]).astype(np.float32).ravel())
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    log(f'{name} : {len(faces)} triangles')
    return ob


def material(kind):
    import bpy
    m = bpy.data.materials.new(kind)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(em.outputs[0], out.inputs[0])
    if kind == 'albedo':
        a = nt.nodes.new('ShaderNodeAttribute'); a.attribute_name = 'col'
        nt.links.new(a.outputs['Color'], em.inputs['Color'])
    elif kind == 'normal':
        g = nt.nodes.new('ShaderNodeNewGeometry')
        vm = nt.nodes.new('ShaderNodeVectorMath'); vm.operation = 'MULTIPLY_ADD'
        vm.inputs[1].default_value = (0.5, 0.5, 0.5); vm.inputs[2].default_value = (0.5, 0.5, 0.5)
        nt.links.new(g.outputs['Normal'], vm.inputs[0])
        nt.links.new(vm.outputs[0], em.inputs['Color'])
    elif kind == 'ao':
        ao = nt.nodes.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.025; ao.samples = 16
        nt.links.new(ao.outputs['AO'], em.inputs['Color'])
    return m


def render(ob, kind, w, h, extent, path, samples):
    import bpy
    sc = bpy.context.scene
    ob.data.materials.clear()
    ob.data.materials.append(material(kind))
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.film_transparent = True
    sc.render.filter_size = 0.9
    sc.cycles.samples = samples
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.color_depth = '8'  # (PIL lit mal le RVBA 16 bits)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def main():
    import bpy
    from PIL import Image
    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup_cycles(16)
    sc = bpy.context.scene
    sc.display_settings.display_device = 'sRGB'
    world = bpy.data.worlds.new('w'); sc.world = world
    world.use_nodes = True
    cam_d = bpy.data.cameras.new('cam'); cam_d.type = 'ORTHO'
    cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
    cards = [('long', 0.62, 0.9, False, (0, 0, 0.5, 1.0)), ('court', 0.36, 1.0, False, (0.5, 0, 1.0, 0.5)), ('mort', 0.4, 0.0, True, (0.5, 0.5, 1.0, 1.0))]
    atl_c = np.zeros((PX, PX, 4), np.float32)
    atl_n = np.zeros((PX, PX, 4), np.float32)
    rects = {}
    cd = os.path.join(CACHE, 'twig'); os.makedirs(cd, exist_ok=True)
    for name, length, tip, dead, (u0, v0, u1, v1) in cards:
        ob = build(name, length, tip, dead)
        # cadrage : la carte couvre [-l/2, l/2] en x et [0, l] en y (rameau vers +y), vue de dessus
        bb = np.array([ob.matrix_world @ v.co for v in ob.data.vertices])
        xmin, xmax = bb[:, 0].min(), bb[:, 0].max()
        ymin, ymax = bb[:, 1].min(), bb[:, 1].max()
        cx, cy = (xmin + xmax) / 2, (ymin + ymax) / 2
        W = int((u1 - u0) * PX); H = int((v1 - v0) * PX)
        ext = max((xmax - xmin) * 1.04, (ymax - ymin) * 1.04 * W / H)
        cam_d.ortho_scale = ext * max(1, H / W)
        cam.location = (cx, cy, 2.0)
        cam.rotation_euler = (0, 0, 0)
        res = {}
        for kind in ('albedo', 'normal', 'ao'):
            p = render(ob, kind, W, H, ext, os.path.join(cd, f'{name}_{kind}.png'), 64 if kind != 'normal' else 16)
            v = np.asarray(Image.open(p).convert('RGBA')).astype(np.float32) / 255.0
            # le PNG est encodé sRGB par la transformation d'affichage : retour aux valeurs linéaires
            v[..., :3] = np.where(v[..., :3] <= 0.04045, v[..., :3] / 12.92, ((v[..., :3] + 0.055) / 1.055) ** 2.4)
            res[kind] = v
        alpha = res['albedo'][..., 3]
        col = res['albedo'][..., :3] * (0.55 + 0.45 * res['ao'][..., :1])
        nrm = res['normal'][..., :3]
        # épaisseur (translucidité) : opacité floutée (zones denses = plus épaisses)
        im = Image.fromarray((alpha * 255).astype(np.uint8)).filter(__import__('PIL.ImageFilter', fromlist=['x']).GaussianBlur(3))
        thick = np.asarray(im).astype(np.float32) / 255
        r0, c0 = int(v0 * PX), int(u0 * PX)
        # (ligne 0 de l'atlas = haut de l'image = v élevé en convention three.js flipY)
        atl_c[r0:r0 + H, c0:c0 + W, :3] = col
        atl_c[r0:r0 + H, c0:c0 + W, 3] = alpha
        atl_n[r0:r0 + H, c0:c0 + W, :3] = nrm
        atl_n[r0:r0 + H, c0:c0 + W, 3] = thick
        # rectangle UV (origine en bas à gauche, flipY), extension réelle de la carte en mètres
        sw, sh = cam_d.ortho_scale * W / max(W, H), cam_d.ortho_scale * H / max(W, H)
        # size : taille réelle de la carte (m) ; base : position du départ du rameau dans la carte (0..1)
        rects[name] = dict(uv=[u0, 1 - v1, u1, 1 - v0], size=[float(sw), float(sh)],
                           base=[float((0 - (cx - sw / 2)) / sw), float((0 - (cy - sh / 2)) / sh)])
        bpy.data.objects.remove(ob, do_unlink=True)
    # dilatation des couleurs sous les pixels transparents (pas de franges sombres avec les mipmaps)
    a = atl_c[..., 3]
    c = atl_c[..., :3].copy(); n = atl_n[..., :3].copy()
    known = a > 0.05
    for it in range(24):
        if known.all():
            break
        acc = np.zeros_like(c); accn = np.zeros_like(n); cnt = np.zeros(a.shape, np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            kk = np.roll(known, (dy, dx), (0, 1))
            acc += np.roll(c, (dy, dx), (0, 1)) * kk[..., None]
            accn += np.roll(n, (dy, dx), (0, 1)) * kk[..., None]
            cnt += kk
        grow = (~known) & (cnt > 0)
        c[grow] = acc[grow] / cnt[grow][:, None]
        n[grow] = accn[grow] / cnt[grow][:, None]
        known = known | grow
    n[~known] = (0.5, 0.5, 1.0)
    os.makedirs(os.path.join(OUT, 'tex'), exist_ok=True)
    srgb = np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.clip(c, 0, 1), 1 / 2.4) - 0.055)
    Image.fromarray((np.dstack([np.clip(srgb, 0, 1), a]) * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'tex', 'rameau_diff.png'), optimize=True)
    Image.fromarray((np.dstack([np.clip(n, 0, 1), atl_n[..., 3]]) * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'tex', 'rameau_nor.png'), optimize=True)
    json.dump(rects, open(os.path.join(OUT, 'rameau.json'), 'w'), indent=1)
    log('atlas des rameaux écrit', rects)


if __name__ == '__main__':
    main()
