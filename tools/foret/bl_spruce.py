"""Épicéas de la zone « forêt » (Picea abies) générés dans Blender : 4 adultes de 22 à 34 m, 2 jeunes, 3 LOD + imposteur.

Usage : .venv-blender/Scripts/python.exe -I tools/foret/bl_spruce.py [--fast]

Morphologie (référence foret-escalier, forêt dense) :
  - fût long et droit, empattement à 5 contreforts racinaires, écorce photoscannée ; houppier haut (la base vivante est à
    45-60 % de la hauteur), chicots et branches mortes sur le bas du fût ;
  - verticilles tous les 35-60 cm (5 à 7 branches, décalage en angle d'or), branches qui partent à l'horizontale,
    retombent puis relèvent la pointe (port « en peigne ») ; longueur selon un profil conique irrégulier, branches
    manquantes ou cassées, flèche terminale fine ;
  - feuillage : cartes de rameaux (bl_twig.py) le long des branches, de chaque côté, inclinées et pendantes, une carte
    courte en bout ; normales « de volume » (mêlées à la direction depuis l'axe du houppier) pour un ombrage de masse.
LOD0 complet, LOD1 (1 carte sur 3, agrandies), LOD2 (1 sur 8, sans branches) ; imposteur : 8 vues azimutales rendues par
Cycles (couleur + alpha, normales) dans un atlas commun. Sorties : public/assets/foret/epiceas.glb, epiceas.json,
tex/epicea_imp_diff.png, tex/epicea_imp_nor.png.
"""
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import CACHE, OUT, export_glb, log, pack, setup_cycles  # noqa: E402

FAST = '--fast' in sys.argv
RECT = json.load(open(os.path.join(OUT, 'rameau.json')))
IMP_W, IMP_H, IMP_N = (128, 512, 8) if FAST else (256, 1024, 8)

VARIANTS = [
    dict(name='a', H=31.0, crown=0.55, R=2.9, seed=1),
    dict(name='b', H=26.0, crown=0.5, R=2.6, seed=2),
    dict(name='c', H=34.0, crown=0.6, R=3.1, seed=3),
    dict(name='d', H=22.5, crown=0.45, R=2.4, seed=4),
    dict(name='j1', H=4.2, crown=0.04, R=1.25, seed=5, young=True),
    dict(name='j2', H=6.5, crown=0.06, R=1.7, seed=6, young=True),
]


class Mesh:
    def __init__(self):
        self.v, self.f, self.uv, self.uv2, self.n = [], [], [], [], []

    def add(self, verts, faces, uv, uv2, nrm=None):
        o = len(self.v)
        self.v += list(verts); self.uv += list(uv); self.uv2 += list(uv2)
        self.n += list(nrm) if nrm is not None else [None] * len(verts)
        self.f += [tuple(i + o for i in fc) for fc in faces]


def frame(d):
    d = d / np.linalg.norm(d)
    a = np.cross(d, [0, 0, 1.0])
    if np.linalg.norm(a) < 1e-4:
        a = np.cross(d, [1.0, 0, 0])
    a /= np.linalg.norm(a)
    return d, a, np.cross(d, a)


def tube(m, pts, radii, sides, uscale, trunk_xy, H, vstart=0.0):
    """Tube le long de pts (Blender, Z haut) ; UV écorce en mètres ; uv2 = (distance à l'axe du tronc, h/H)."""
    pts = np.asarray(pts); n = len(pts)
    verts, uv, uv2, faces = [], [], [], []
    acc = vstart
    for i in range(n):
        d = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
        _, a, b = frame(d)
        if i > 0:
            acc += np.linalg.norm(pts[i] - pts[i - 1])
        for k in range(sides + 1):
            ang = 2 * math.pi * k / sides
            p = pts[i] + (a * math.cos(ang) + b * math.sin(ang)) * radii[i]
            verts.append(p)
            uv.append((k / sides * uscale, acc))
            uv2.append((float(np.hypot(p[0] - trunk_xy[0], p[1] - trunk_xy[1])), float(p[2] / H)))
    for i in range(n - 1):
        for k in range(sides):
            a0 = i * (sides + 1) + k
            faces.append((a0, a0 + 1, a0 + sides + 2, a0 + sides + 1))
    m.add(verts, faces, uv, uv2)


def card(m, base, fwd, up_hint, size, rect, droop, bend, H, trunk_xy, center):
    """Carte de rameau pliée en V léger (2 quads) ; base = départ du rameau ; normales de volume."""
    w, h = size
    f, s, _ = frame(fwd)
    side = np.cross(up_hint, f); side /= np.linalg.norm(side) + 1e-9
    upn = np.cross(f, side)
    bx, by = RECT[rect]['base']
    u0, v0, u1, v1 = RECT[rect]['uv']
    # coins : x en travers (-bx..1-bx) × w, y le long (−by..1−by) × h ; pli au milieu (le centre plus haut)
    xs = np.array([-bx, 0.5 - bx, 1 - bx]) * w
    ys = np.array([-by, 1 - by]) * h
    verts, uv, uv2, nrm = [], [], [], []
    for j, y in enumerate(ys):
        for i, x in enumerate(xs):
            lift = bend * w * (1 - abs(i - 1))
            fall = droop * (y / h) ** 2 * h
            p = base + side * x + f * y + upn * (lift - fall)
            verts.append(p)
            uv.append((u0 + (u1 - u0) * i / 2, v0 + (v1 - v0) * j))
            uv2.append((float(np.hypot(p[0] - trunk_xy[0], p[1] - trunk_xy[1])), float(p[2] / H)))
            vol = p - center; vol[2] *= 0.6
            vn = vol / (np.linalg.norm(vol) + 1e-6)
            cn = upn if upn[2] >= 0 else -upn
            nn = cn * 0.45 + vn * 0.55
            nrm.append(nn / np.linalg.norm(nn))
    faces = [(0, 1, 4, 3), (1, 2, 5, 4)]
    m.add(verts, faces, uv, uv2, nrm)


def branch_curve(origin, az, length, rng, young):
    """Branche : part à l'horizontale (un peu vers le bas), retombe, relève la pointe."""
    pts = [origin]
    dirh = np.array([math.cos(az), math.sin(az), 0.0])
    n = 7
    pitch0 = rng.uniform(-0.25, 0.05) if not young else rng.uniform(0.05, 0.3)
    for i in range(1, n + 1):
        t = i / n
        sag = -0.32 * math.sin(t * math.pi) * (0.7 + 0.6 * rng.random()) if not young else -0.12 * math.sin(t * math.pi)
        tipup = 0.35 * max(0, t - 0.7) / 0.3
        d = dirh + np.array([0, 0, pitch0 + sag * 1.2 + tipup])
        d /= np.linalg.norm(d)
        pts.append(pts[-1] + d * length / n)
    return np.array(pts)


def tree(V, lod):
    rng = np.random.default_rng(V['seed'] * 101 + 7)
    H, R = V['H'], V['R']
    young = V.get('young', False)
    bark, fol = Mesh(), Mesh()
    lean = rng.normal(0, 0.008, 2)
    trunk_xy = (0.0, 0.0)
    r0 = 0.012 * H + 0.08 if not young else 0.045 + 0.01 * H
    # fût
    sides = [20, 9, 6][lod]
    hs = np.r_[np.linspace(0, 1.2, 7 if lod == 0 else 3), np.linspace(1.6, H, max(8, int(H / (0.6 if lod == 0 else 2.5))))]
    pts, radii = [], []
    for h in hs:
        t = h / H
        sway = np.array([math.sin(h * 0.37 + V['seed']) * 0.05 * t, math.cos(h * 0.29 + V['seed']) * 0.05 * t])
        pts.append(np.array([lean[0] * h + sway[0], lean[1] * h + sway[1], h]))
        radii.append(max(0.01, r0 * (1 - t) ** 0.85 * (1 + 0.55 * math.exp(-h / 0.55))))
    tube(bark, pts, radii, sides, 2.2 * math.pi * r0 / 1.2, trunk_xy, H)
    # contreforts : déformation des sommets du bas (lobes)
    nb = len(bark.v)
    lobes, ph = 5, rng.uniform(0, 6.28)
    for i in range(nb):
        p = bark.v[i]
        if p[2] < 1.4:
            ang = math.atan2(p[1], p[0])
            k = math.exp(-p[2] / 0.45) * (0.35 + 0.25 * math.cos(lobes * ang + ph + 0.6 * math.sin(3 * ang)))
            bark.v[i] = np.array([p[0] * (1 + k), p[1] * (1 + k), p[2] - (0.08 if p[2] < 0.01 else 0)])
    hb = V['crown'] * H
    center_of = lambda h: np.array([lean[0] * h, lean[1] * h, h])  # noqa: E731
    # chicots et branches mortes (bas du fût)
    if not young and lod < 2:
        h = 2.2
        while h < hb:
            for k in range(rng.integers(1, 4)):
                az = rng.uniform(0, 6.28)
                ln = rng.uniform(0.15, 0.4) if rng.random() < 0.6 else rng.uniform(0.6, 1.4)
                o = center_of(h)
                d = np.array([math.cos(az), math.sin(az), rng.uniform(-0.5, -0.1)])
                d /= np.linalg.norm(d)
                bp = [o + d * t * ln for t in (0, 0.5, 1)]
                tube(bark, bp, [0.018, 0.01, 0.004], 4 if lod == 0 else 3, 0.2, trunk_xy, H)
                if ln > 0.6 and rng.random() < 0.5:
                    card(fol, bp[1], d + np.array([0, 0, -0.3]), np.array([0, 0, 1.0]), np.array(RECT['mort']['size']) * rng.uniform(0.9, 1.5),
                         'mort', 0.1, 0.1, H, trunk_xy, center_of(h))
            h += rng.uniform(0.5, 1.1)
    # verticilles
    h = hb
    az0 = rng.uniform(0, 6.28)
    keep_every = [1, 3, 8][lod]
    scale = [1.0, 1.55, 2.5][lod]
    card_i = 0
    while h < H - 0.25:
        t = (h - hb) / max(H - hb, 1e-3)
        prof = (1 - t) ** 0.85 if not young else (1 - t) ** 0.95
        nbr = rng.integers(5, 8)
        for k in range(nbr):
            if rng.random() < (0.12 if not young else 0.04):
                continue  # branche manquante
            az = az0 + k * 2 * math.pi / nbr + rng.normal(0, 0.25)
            ln = max(0.25, R * prof * rng.uniform(0.7, 1.25) + 0.15)
            if rng.random() < 0.05:
                ln *= 0.4  # cassée
            o = center_of(h) + np.array([0, 0, rng.normal(0, 0.05)])
            bp = branch_curve(o, az, ln, rng, young)
            if lod == 0 or (lod == 1 and ln > 1.2):
                rad0 = 0.012 + 0.012 * ln
                tube(bark, bp, np.linspace(rad0, 0.004, len(bp)), [5, 3, 3][lod], 0.25, trunk_xy, H)
            # cartes le long de la branche
            L = np.r_[0, np.cumsum(np.linalg.norm(np.diff(bp, axis=0), axis=1))]
            s = 0.25 if not young else 0.12
            while s < L[-1] - 0.1:
                i = np.searchsorted(L, s) - 1
                p = bp[i] + (bp[i + 1] - bp[i]) * ((s - L[i]) / max(L[i + 1] - L[i], 1e-6))
                tdir = (bp[i + 1] - bp[i]) / np.linalg.norm(bp[i + 1] - bp[i])
                for sd in (-1, 1):
                    card_i += 1
                    if card_i % keep_every:
                        continue
                    side = np.cross(tdir, [0, 0, 1.0]); side /= np.linalg.norm(side)
                    a = math.radians(rng.uniform(35, 60))
                    fw = tdir * math.cos(a) + side * sd * math.sin(a)
                    hang = rng.random() < 0.25
                    fw = fw + np.array([0, 0, -rng.uniform(0.15, 0.45) - (0.8 if hang else 0)])
                    sz = np.array(RECT['long']['size']) * rng.uniform(0.75, 1.15) * scale * (0.65 + 0.35 * (1 - s / L[-1])) * (0.8 if young else 1)
                    card(fol, p, fw, np.array([0, 0, 1.0]), sz, 'long', rng.uniform(0.1, 0.3), rng.uniform(0.05, 0.15), H, trunk_xy, center_of(h))
                s += (0.24 if not young else 0.16) * rng.uniform(0.8, 1.2)
            card_i += 1
            if card_i % max(1, keep_every // 2) == 0:
                tip = bp[-1]; tdir = bp[-1] - bp[-2]
                card(fol, tip - tdir * 0.3, tdir + np.array([0, 0, 0.15]), np.array([0, 0, 1.0]), np.array(RECT['court']['size']) * 1.1 * scale,
                     'court', 0.05, 0.08, H, trunk_xy, center_of(h))
        h += rng.uniform(0.35, 0.6) if not young else rng.uniform(0.25, 0.4)
        az0 += 2.39996
    # flèche : cartes courtes autour du sommet
    for k in range(3 if lod < 2 else 1):
        o = center_of(H - 0.9 - k * 0.3)
        card(fol, o, np.array([math.cos(k * 2.1), math.sin(k * 2.1), 2.5]), np.array([1.0, 0, 0]), np.array(RECT['court']['size']) * 1.2 * scale, 'court',
             0.0, 0.05, H, trunk_xy, center_of(H - 1))
    return bark, fol


def to_blender(name, m, mat):
    import bpy
    v = np.array([np.asarray(p, np.float32) for p in m.v])
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(p) for p in v], [], m.f)
    me.update()
    for lay, data in (('UVMap', m.uv), ('vent', m.uv2)):
        uvl = me.uv_layers.new(name=lay)
        loops_v = np.zeros(len(me.loops), np.int32)
        me.loops.foreach_get('vertex_index', loops_v)
        uvl.data.foreach_set('uv', np.asarray(data, np.float32)[loops_v].ravel())
    me.shade_smooth()
    if any(n is not None for n in m.n):
        nn = [tuple(n) if n is not None else (0, 0, 1) for n in m.n]
        me.normals_split_custom_set_from_vertices(nn)
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def materials():
    """Matières Blender (pour les rendus d'imposteurs ; l'export glTF n'emporte pas de matière)."""
    import bpy
    out = {}
    for kind, img, alpha in (('ecorce', os.path.join(OUT, 'tex', 'ecorce_diff.webp'), False), ('rameau', os.path.join(OUT, 'tex', 'rameau_diff.png'), True)):
        m = bpy.data.materials.new(kind)
        m.use_nodes = True
        nt = m.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        o = nt.nodes.new('ShaderNodeOutputMaterial')
        tx = nt.nodes.new('ShaderNodeTexImage')
        tx.image = bpy.data.images.load(img)
        uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'UVMap'
        nt.links.new(uvn.outputs[0], tx.inputs[0])
        if kind == 'ecorce':
            mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / 1.2, 1 / 1.2, 1)
            nt.links.new(uvn.outputs[0], mp.inputs[0]); nt.links.new(mp.outputs[0], tx.inputs[0])
        out[kind] = dict(mat=m, tex=tx, nt=nt, out=o, alpha=alpha)
    return out


def set_mode(mats, mode):
    """mode : 'albedo' (émission de la couleur, alpha) ou 'normal' (émission de la normale monde)."""
    for k, d in mats.items():
        nt, tx, o = d['nt'], d['tex'], d['out']
        for n in list(nt.nodes):
            if n.type in ('EMISSION', 'BSDF_TRANSPARENT', 'MIX_SHADER', 'NEW_GEOMETRY', 'VECT_MATH'):
                nt.nodes.remove(n)
        em = nt.nodes.new('ShaderNodeEmission')
        if mode == 'albedo':
            nt.links.new(tx.outputs['Color'], em.inputs['Color'])
            if k == 'ecorce':
                em.inputs['Strength'].default_value = 0.8
        else:
            g = nt.nodes.new('ShaderNodeNewGeometry')
            vm = nt.nodes.new('ShaderNodeVectorMath'); vm.operation = 'MULTIPLY_ADD'
            vm.inputs[1].default_value = (0.5, 0.5, 0.5); vm.inputs[2].default_value = (0.5, 0.5, 0.5)
            nt.links.new(g.outputs['Normal'], vm.inputs[0]); nt.links.new(vm.outputs[0], em.inputs['Color'])
        if d['alpha']:
            tr = nt.nodes.new('ShaderNodeBsdfTransparent')
            mx = nt.nodes.new('ShaderNodeMixShader')
            nt.links.new(tx.outputs['Alpha'], mx.inputs[0])
            nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2])
            nt.links.new(mx.outputs[0], d['out'].inputs[0])
        else:
            nt.links.new(em.outputs[0], d['out'].inputs[0])


def render_impostors(objs, mats, variants):
    """8 vues orthographiques par variante adulte → atlas (colonnes = vues, lignes = variantes)."""
    import bpy
    from PIL import Image
    sc = bpy.context.scene
    setup_cycles(32)
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.color_depth = '8'
    sc.render.resolution_x, sc.render.resolution_y = IMP_W, IMP_H
    cam_d = bpy.data.cameras.new('cam'); cam_d.type = 'ORTHO'
    cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
    nv = len(variants)
    atl = {m: np.zeros((IMP_H * nv, IMP_W * IMP_N, 4), np.float32) for m in ('albedo', 'normal')}
    info = {}
    cd = os.path.join(CACHE, 'spruce'); os.makedirs(cd, exist_ok=True)
    for r, V in enumerate(variants):
        group = objs[V['name']]
        for o in bpy.data.objects:
            if o.type == 'MESH':
                o.hide_render = o not in group
        H = V['H']
        half_w = H / 4 * 1.0
        cam_d.ortho_scale = H * 1.04
        for mode in ('albedo', 'normal'):
            set_mode(mats, mode)
            for k in range(IMP_N):
                az = 2 * math.pi * k / IMP_N
                dist = 60
                cam.location = (math.sin(az) * dist, -math.cos(az) * dist, H * 0.5)
                cam.rotation_euler = (math.pi / 2, 0, az)
                p = os.path.join(cd, f'{V["name"]}_{mode}_{k}.png')
                sc.render.filepath = p
                bpy.ops.render.render(write_still=True)
                im = np.asarray(Image.open(p).convert('RGBA')).astype(np.float32) / 255
                rgb = im[..., :3]
                lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
                if mode == 'normal':
                    # normale monde (Blender) → repère de la vue : x = droite caméra, y = haut, z = vers la caméra
                    n = lin * 2 - 1
                    right = np.array([math.cos(az), math.sin(az), 0]); fwd = np.array([-math.sin(az), math.cos(az), 0])
                    nv_ = np.stack([n @ right, n[..., 2], -(n @ fwd)], -1)
                    lin = nv_ * 0.5 + 0.5
                # ortho_scale = H*1.04 couvre la hauteur ; la largeur (H/4) est la bande centrale du rendu
                atl[mode][r * IMP_H:(r + 1) * IMP_H, k * IMP_W:(k + 1) * IMP_W, :3] = lin
                atl[mode][r * IMP_H:(r + 1) * IMP_H, k * IMP_W:(k + 1) * IMP_W, 3] = im[..., 3]
        info[V['name']] = dict(row=r, H=H, width=H * 1.04 * IMP_W / IMP_H)
        log('imposteur', V['name'])
    a = atl['albedo'][..., 3]
    known = a > 0.05
    c, n = atl['albedo'][..., :3].copy(), atl['normal'][..., :3].copy()
    for it in range(12):
        acc = np.zeros_like(c); accn = np.zeros_like(n); cnt = np.zeros(a.shape, np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            kk = np.roll(known, (dy, dx), (0, 1))
            acc += np.roll(c, (dy, dx), (0, 1)) * kk[..., None]; accn += np.roll(n, (dy, dx), (0, 1)) * kk[..., None]; cnt += kk
        grow = (~known) & (cnt > 0)
        c[grow] = acc[grow] / cnt[grow][:, None]; n[grow] = accn[grow] / cnt[grow][:, None]
        known |= grow
    srgb = np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.clip(c, 0, 1), 1 / 2.4) - 0.055)
    Image.fromarray((np.dstack([srgb, a]) * 255 + 0.5).clip(0, 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'tex', 'epicea_imp_diff.png'), optimize=True)
    Image.fromarray((np.clip(n, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB').save(os.path.join(OUT, 'tex', 'epicea_imp_nor.png'), optimize=True)
    return info


def main():
    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = materials()
    objs = {}
    stats = {}
    for V in VARIANTS:
        group = []
        for lod in range(3):
            bark, fol = tree(V, lod)
            ob = to_blender(f'epicea_{V["name"]}_ecorce_lod{lod}', bark, mats['ecorce']['mat'])
            of = to_blender(f'epicea_{V["name"]}_rameaux_lod{lod}', fol, mats['rameau']['mat'])
            stats.setdefault(V['name'], {})[f'lod{lod}'] = dict(ecorce=len(bark.f) * 2, rameaux=len(fol.f) * 2)
            if lod == 0:
                group += [ob, of]
        objs[V['name']] = group
        log('épicéa', V['name'], stats[V['name']])
    imp = render_impostors(objs, mats, [V for V in VARIANTS if not V.get('young')])
    raw = os.path.join(CACHE, 'spruce', 'raw.glb')
    for o in bpy.data.objects:
        o.hide_render = False
    export_glb([o for o in bpy.data.objects if o.type == 'MESH'], raw, tangents=False)
    pack(raw, os.path.join(OUT, 'epiceas.glb'))
    json.dump(dict(variants=[{k: v for k, v in V.items()} for V in VARIANTS], tris=stats, impostor=dict(views=IMP_N, w=IMP_W, h=IMP_H, rows=imp)),
              open(os.path.join(OUT, 'epiceas.json'), 'w'), indent=1)
    log('écrit epiceas.glb', f'{os.path.getsize(os.path.join(OUT, "epiceas.glb")) / 1e6:.1f} Mo')


if __name__ == '__main__':
    main()
