"""Paroi de granite moussue de la zone « forêt » : maillage sculpté par champs de déplacement, cuisson Cycles.

Usage : .venv-blender/Scripts/python.exe -I tools/foret/bl_wall.py [--fast]

Logique « artiste » (référence foret-escalier) :
  - forme : une face de granite qui suit le sentier côté est, inclinée de 74 à 83°, bombée en grandes masses, qui
    s'arrondit au sommet (front) et s'enfonce dans le plateau boisé ;
  - sous-forme : blocs de granite arrondis séparés par des diaclases (Voronoï anisotrope : joints horizontaux de
    desquamation plus serrés que les joints verticaux), 2 à 3 corniches horizontales où la mousse s'accumule ;
  - micro-détail : déplacement photoscanné (mossy_rock, lichen_rock) et petites fissures.
Deux maillages : haute définition (2,5 cm) et jeu (10 cm) ; Cycles (GPU) cuit les normales et l'occlusion ambiante du
haut vers le bas. Les masques de mousse, lichen et coulures sont calculés sur les mêmes champs (numpy) :
  - mousse : surfaces tournées vers le haut (corniches, front), creux ombragés, pied humide de la paroi ;
  - lichen : faces verticales exposées et bombées, en colonies rondes ;
  - coulures : traînées sombres sous les corniches (l'eau ruisselle de la mousse vers le bas).
Sorties : public/assets/foret/paroi.glb, paroi_nor.jpg, paroi_ao.jpg, paroi_masks.png (+ aperçus dans .cache/).
"""
import json
import math
import os
import subprocess
import sys
import time

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import layout as L  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'foret')
CACHE = os.path.join(HERE, '.cache', 'wall')
DL = os.path.join(HERE, '.cache', 'dl')
FAST = '--fast' in sys.argv
HI_STEP = 0.05 if FAST else 0.025
LO_STEP = 0.10
TEX_W, TEX_H = (2048, 640) if FAST else (4096, 1280)
MASK_W, MASK_H = 2048, 640
rng = np.random.default_rng(11)


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


# ------------------------------------------------------------------------------------------------ courbe du pied
def foot_curve(F):
    """Pied de la paroi le long du sentier (z de +32 à -28), rééchantillonné tous les `step` m."""
    c, t = F.c, F.t
    zs = c[:, 1]
    sel = (zs < 32.5) & (zs > -28.5)
    c, t = c[sel], t[sel]
    n = np.stack([-t[:, 1], t[:, 0]], 1)  # vers l'est
    w = c[:, 3] + L.wall_strip(c[:, 1])
    p = c[:, :2] + n * w[:, None]
    # lissage (le décalage d'une courbe peut faire des crans aux raccords sentier/escalier)
    k = 121
    pad = np.pad(p, ((k, k), (0, 0)), mode='edge')
    ker = np.hanning(2 * k + 1); ker /= ker.sum()
    p = np.stack([np.convolve(pad[:, i], ker, mode='same')[k:-k] for i in range(2)], 1)
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))]
    return p, d


def resample(p, d, step):
    L_ = d[-1]
    n = int(L_ / step) + 1
    s = np.linspace(0, L_, n)
    x = np.interp(s, d, p[:, 0]); z = np.interp(s, d, p[:, 1])
    pts = np.stack([x, z], 1)
    tg = np.gradient(pts, axis=0); tg /= np.linalg.norm(tg, axis=1, keepdims=True)
    nrm = np.stack([-tg[:, 1], tg[:, 0]], 1)
    return s, pts, nrm


# ------------------------------------------------------------------------------------------------ profil en travers
NT_PROFILE = 600


def profiles(z, foot_y):
    """Profil (e, y) de chaque colonne, paramétré par t ∈ [0, 1] le long de l'abscisse curviligne.
    Renvoie e[t], y[t] (n_col × NT_PROFILE) et la longueur de chaque profil."""
    H = np.maximum(L.wall_height(z), 0.6)
    th = L.wall_angle(z)
    etop = L.wall_top_e(z)
    R = np.clip(0.22 * H, 0.4, 2.4)
    cot = 1 / np.tan(th)
    rows_e, rows_y = [], []
    for k in range(len(z)):
        h, c, r, et = H[k], cot[k], R[k], etop[k]
        # face : de -1,3 m (enterrée) jusqu'au départ de l'arrondi du front
        yA = np.linspace(-1.3, h - r, 160)
        eA = yA * c
        # front arrondi : arc tangent à la face, qui finit horizontal à h + 0,2
        fdir = np.array([c, 1.0]) / math.hypot(c, 1.0)  # montée le long de la face
        out = np.array([-fdir[1], fdir[0]])  # normale extérieure (ouest-haut)
        p0 = np.array([eA[-1], yA[-1]])
        center = p0 - out * r
        a0 = math.atan2(out[1], out[0])
        a1 = math.pi / 2
        aa = np.linspace(a0, a1, 80)
        eB = center[0] + r * np.cos(aa)
        yB = center[1] + r * np.sin(aa)
        top = yB[-1]
        yB += np.linspace(0, h + 0.2 - top, len(aa))
        # dessus : replat puis descente sous le plateau
        e_end = max(et + 3.0, eB[-1] + 1.5)
        eC = np.linspace(eB[-1], max(et + 0.5, eB[-1] + 0.4), 40)
        yC = np.full_like(eC, h + 0.2)
        eD = np.linspace(eC[-1], e_end, 60)
        tD = (eD - eD[0]) / max(eD[-1] - eD[0], 1e-3)
        yD = h + 0.2 - (0.24 + 0.12 * 3.0) * (tD ** 1.5) + 0.12 * (eD - et).clip(0)
        e_ = np.concatenate([eA, eB[1:], eC[1:], eD[1:]])
        y_ = np.concatenate([yA, yB[1:], yC[1:], yD[1:]])
        seg = np.r_[0, np.cumsum(np.hypot(np.diff(e_), np.diff(y_)))]
        t = np.linspace(0, 1, NT_PROFILE)
        rows_e.append(np.interp(t * seg[-1], seg, e_))
        rows_y.append(np.interp(t * seg[-1], seg, y_))
    E, Y = np.array(rows_e), np.array(rows_y)
    Lu = np.r_[[np.sum(np.hypot(np.diff(E[k]), np.diff(Y[k]))) for k in range(len(z))]]
    return E, Y, Lu, H


# ------------------------------------------------------------------------------------------------ champs de déplacement
def hash2(ix, iy, seed):
    h = (ix * 374761393 + iy * 668265263 + seed * 2246822519) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return (h ^ (h >> 16)) / 4294967295.0


def voronoi(x, y, cx, cy, seed, jit=0.85):
    """F1, F2 (m) et identifiants des deux cellules les plus proches, réseau cx × cy (m) à germes décalés."""
    gx, gy = x / cx, y / cy
    ix, iy = np.floor(gx).astype(np.int64), np.floor(gy).astype(np.int64)
    F1 = np.full(x.shape, 1e9); F2 = np.full(x.shape, 1e9); id1 = np.zeros(x.shape); id2 = np.zeros(x.shape)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            ax, ay = ix + dx, iy + dy
            jx = 0.5 + (hash2(ax, ay, seed) - 0.5) * jit
            jy = 0.5 + (hash2(ax, ay, seed + 7) - 0.5) * jit
            # décalage d'une rangée sur deux (appareil de blocs naturel)
            px = (ax + jx + 0.5 * (ay & 1)) * cx
            py = (ay + jy) * cy
            d = np.hypot(x - px, y - py)
            v = hash2(ax, ay, seed + 13)
            c1 = d < F1
            c2 = (~c1) & (d < F2)
            F2 = np.where(c1, F1, np.where(c2, d, F2))
            id2 = np.where(c1, id1, np.where(c2, v, id2))
            F1 = np.where(c1, d, F1)
            id1 = np.where(c1, v, id1)
    return F1, F2, id1, id2


def tex_sampler(path, tile):
    """Échantillonneur bilinéaire répété d'une carte de hauteur photoscannée (0..1, moyenne retirée)."""
    im = Image.open(path)
    a = np.asarray(im).astype(np.float32)
    if a.ndim == 3:
        a = a[..., 0]
    a = a / (65535.0 if a.max() > 255 else 255.0)
    a -= a.mean()
    h, w = a.shape

    def f(x, y):
        fx = (x / tile) % 1.0 * w
        fy = (y / tile) % 1.0 * h
        i = np.floor(fx).astype(np.int64); j = np.floor(fy).astype(np.int64)
        tx, ty = fx - i, fy - j
        i1, j1 = (i + 1) % w, (j + 1) % h
        return (a[j, i] * (1 - tx) + a[j, i1] * tx) * (1 - ty) + (a[j1, i] * (1 - tx) + a[j1, i1] * tx) * ty
    return f


DISP_A = DISP_B = None


def displacement(s, u, y, part, fine=True):
    """Déplacement (m, positif = vers l'extérieur) selon l'abscisse s le long de la paroi, l'abscisse u du profil,
    la hauteur y au-dessus du pied et la part du profil (0 face → 1 dessus)."""
    global DISP_A, DISP_B
    sstep = L.sstep
    # grandes masses bombées
    D = 0.6 * L.fbm(s / 12.0, u / 9.0, 3, off=3.0)
    # domaine déformé : les limites des masses de granite sont sinueuses, jamais des segments droits
    ws = s + 1.3 * L.fbm(s / 4.0, u / 4.0, 3, off=13.0)
    wu = u + 1.0 * L.fbm(s / 4.0 + 5.2, u / 4.0 - 2.1, 3, off=17.0)
    # masses de granite (Voronoï déformé, grandes cellules) : seule une partie des limites devient une vraie fissure
    F1, F2, cid, cid2 = voronoi(ws, wu, 7.5, 4.2, 5)
    edge = (F2 - F1) * 0.5
    crack = L.sstep(0.18, 0.45, np.abs(cid - cid2))
    pillow = 0.15 + 0.55 * cid
    D += pillow * (1 - np.exp(-edge / 0.9)) - (0.06 + 0.24 * crack) * (1 - sstep(0.0, 0.06 + 0.05 * crack, edge))
    # joints de desquamation (quasi horizontaux) et diaclases verticales : fissures fines qui courent puis s'éteignent
    jh = np.abs(L.perlin(s / 16.0, wu / 1.9 + 0.3))
    D -= 0.07 * (1 - sstep(0.0, 0.05, jh)) * sstep(-0.1, 0.35, L.perlin(s / 6.0 + 3.0, u / 6.0))
    jv = np.abs(L.perlin(ws / 2.3 + 0.7, u / 15.0))
    D -= 0.09 * (1 - sstep(0.0, 0.04, jv)) * sstep(0.0, 0.4, L.perlin(s / 5.0 - 2.0, u / 4.0 + 1.0))
    # bosses moyennes (desquamation en écailles)
    D += 0.09 * np.maximum(L.fbm(ws / 1.7, wu / 1.4, 3, off=23.0), -0.3)
    # corniches : la face recule au-dessus de 2 ou 3 lignes horizontales ondulantes
    for k, (yk, ak) in enumerate(((2.3, 0.22), (5.1, 0.18), (8.6, 0.16))):
        yy = yk + 0.7 * L.perlin(s / 7.0 + k * 3.3, 0.5 + k)
        D -= ak * sstep(yy - 0.12, yy + 0.3, y) * (1 - part)
    # ondulations moyennes
    D += 0.07 * L.fbm(s / 1.6, u / 1.6, 3, off=8.0)
    if fine:
        if DISP_A is None:
            DISP_A = tex_sampler(os.path.join(DL, 'ph', 'mossy_rock', 'mossy_rock_disp_2k.png'), 2.6)
            DISP_B = tex_sampler(os.path.join(DL, 'ph', 'lichen_rock', 'lichen_rock_disp_2k.png'), 1.9)
        mix = sstep(-0.3, 0.3, L.perlin(s / 5.0 + 9.1, u / 5.0))
        D += 0.11 * (DISP_A(s, u) * (1 - mix) + DISP_B(u * 0.93 + 3.1, s * 0.93) * mix)
        f1, f2, _, _ = voronoi(s * 1.0, u * 1.0, 0.42, 0.3, 29, 0.95)
        D -= 0.012 * (1 - sstep(0.0, 0.012, (f2 - f1) * 0.5))
    # dessus : pas de creux profonds (le plateau ne doit pas apparaître)
    D = np.where(part > 0.5, np.maximum(D, -0.08), D)
    # pied enterré : déplacement atténué sous le sol
    D *= sstep(-1.3, -0.4, y) * 0.8 + 0.2
    return D


# ------------------------------------------------------------------------------------------------ surface
class Wall:
    def __init__(self):
        self.F = L.Field()
        p, d = foot_curve(self.F)
        self.p, self.d = p, d
        self.Ls = d[-1]
        log(f'paroi : {self.Ls:.1f} m le long du sentier')

    def surface(self, ds, nt, fine):
        """Positions (ns × nt × 3), normales extérieures de base, (s, u) en m, y, part, uv0."""
        s, pts, nrm = resample(self.p, self.d, ds)
        z = pts[:, 1]
        foot_y = self.F.height(pts[:, 0], pts[:, 1], detail=False)
        E, Y, Lu, H = profiles(z, foot_y)
        t = np.linspace(0, 1, nt)
        # rééchantillonne les profils en nt points
        Eg = np.array([np.interp(t, np.linspace(0, 1, NT_PROFILE), E[k]) for k in range(len(s))])
        Yg = np.array([np.interp(t, np.linspace(0, 1, NT_PROFILE), Y[k]) for k in range(len(s))])
        U = t[None, :] * Lu[:, None]
        S = np.repeat(s[:, None], nt, 1)
        part = L.sstep(0.0, 1.0, (Yg - (H[:, None] - 0.25 * H[:, None])) / np.maximum(0.25 * H[:, None], 0.3))
        part = np.maximum(part, (Eg > (L.wall_top_e(z)[:, None] - L.WALL_INSIDE + 0.2)) * 1.0)
        X = pts[:, 0:1] + nrm[:, 0:1] * Eg
        Zw = pts[:, 1:2] + nrm[:, 1:2] * Eg
        Yw = foot_y[:, None] + Yg
        P = np.stack([X, Yw, Zw], -1)
        # normale extérieure de la surface de base (produit vectoriel des dérivées)
        dPs = np.gradient(P, axis=0)
        dPt = np.gradient(P, axis=1)
        N = np.cross(dPt, dPs)
        N /= np.linalg.norm(N, axis=-1, keepdims=True) + 1e-9
        # orientation : la normale doit pointer vers l'ouest (côté sentier) sur la face
        flip = bool(np.mean(N[:, nt // 5, 0] * -nrm[:, 0] + N[:, nt // 5, 2] * -nrm[:, 1]) < 0)
        if flip:
            N = -N
        Dm = displacement(S, U, Yg, part, fine)
        P = P + N * Dm[..., None]
        uv0 = np.stack([S / self.Ls, np.repeat(t[None, :], len(s), 0)], -1)
        return dict(P=P, N0=N, S=S, U=U, Y=Yg, part=part, uv0=uv0, D=Dm, H=H, z=z, flip=flip)


# ------------------------------------------------------------------------------------------------ Blender
def build_mesh(name, P, flip, uv0=None, uv1=None):
    import bpy
    ns, nt, _ = P.shape
    me = bpy.data.meshes.new(name)
    verts = P.reshape(-1, 3)
    # repère Blender (Z haut) : (x, -z, y)
    vb = np.stack([verts[:, 0], -verts[:, 2], verts[:, 1]], 1).astype(np.float32)
    me.vertices.add(len(vb))
    me.vertices.foreach_set('co', vb.ravel())
    i = np.arange(ns - 1)[:, None] * nt + np.arange(nt - 1)[None, :]
    # enroulement : normale de face = dP/dt × dP/ds (vers l'extérieur) sauf si le champ a été retourné
    quads = np.stack([i, i + nt, i + nt + 1, i + 1] if flip else [i, i + 1, i + nt + 1, i + nt], -1).reshape(-1, 4)
    me.loops.add(quads.size)
    me.loops.foreach_set('vertex_index', quads.ravel().astype(np.int32))
    me.polygons.add(len(quads))
    me.polygons.foreach_set('loop_start', (np.arange(len(quads)) * 4).astype(np.int32))
    me.polygons.foreach_set('loop_total', np.full(len(quads), 4, np.int32))
    for nm, uv in (('UVMap', uv0), ('metres', uv1)):
        if uv is None:
            continue
        lay = me.uv_layers.new(name=nm)
        uvv = uv.reshape(-1, 2)[quads.ravel()]
        lay.data.foreach_set('uv', uvv.astype(np.float32).ravel())
    me.update(calc_edges=True)
    me.validate()
    me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def setup_cycles(samples):
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


def bake(lo, hi, kind, w, h, path, samples=1, extrusion=0.2, dist=0.4):
    import bpy
    setup_cycles(samples)
    img = bpy.data.images.new('bake_' + kind, w, h, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    mat = lo.data.materials[0]
    nt = mat.node_tree
    for n in nt.nodes:
        n.select = False
    node = nt.nodes.new('ShaderNodeTexImage')
    node.image = img
    node.select = True
    nt.nodes.active = node
    bpy.ops.object.select_all(action='DESELECT')
    hi.select_set(True)
    lo.select_set(True)
    bpy.context.view_layer.objects.active = lo
    sc = bpy.context.scene
    sc.render.bake.use_selected_to_active = True
    sc.render.bake.cage_extrusion = extrusion
    sc.render.bake.max_ray_distance = dist
    sc.render.bake.margin = 8
    sc.render.bake.normal_space = 'TANGENT'
    lo.data.uv_layers.active = lo.data.uv_layers['UVMap']
    t = time.time()
    bpy.ops.object.bake(type=kind)
    log(f'cuisson {kind} {w}×{h} en {time.time() - t:.0f} s')
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    nt.nodes.remove(node)
    return path


# ------------------------------------------------------------------------------------------------ masques
def masks(W, ao_path):
    """Mousse, lichen, coulures sur la grille de texture (MASK_W × MASK_H), à partir des champs haute définition."""
    sf = W.surface(W.Ls / (MASK_W - 1), MASK_H, True)
    P, S, U, Y, part = sf['P'], sf['S'], sf['U'], sf['Y'], sf['part']
    dPs = np.gradient(P, axis=0); dPt = np.gradient(P, axis=1)
    N = np.cross(dPt, dPs); N /= np.linalg.norm(N, axis=-1, keepdims=True) + 1e-9
    if sf['flip']:
        N = -N
    up = N[..., 1]
    # courbure (convexe > 0) : laplacien du déplacement, en m⁻¹
    D = sf['D']
    lap = (np.roll(D, 1, 0) + np.roll(D, -1, 0) + np.roll(D, 1, 1) + np.roll(D, -1, 1) - 4 * D)
    curv = -lap / max((W.Ls / MASK_W) ** 2, 1e-6) * 0.004
    ao = np.asarray(Image.open(ao_path).convert('L').resize((MASK_W, MASK_H)), np.float32) / 255.0
    ao = ao[::-1].T  # image (ligne 0 = t = 1) → [s, t]
    sst = L.sstep
    n1 = L.fbm(S / 1.3, U / 1.3, 4, off=61.0)
    n2 = L.fbm(S / 0.35, U / 0.35, 3, off=71.0)
    # mousse : corniches et front (vers le haut), puis elle déborde vers le bas sur 0,3 à 1 m ; creux ombragés ; pied humide
    src = sst(0.32, 0.72, up + 0.15 * n1)
    du_m = sf['U'][:, -1:] / MASK_H  # mètres par texel le long du profil (par colonne)
    spill = np.zeros_like(src)
    acc = np.zeros(src.shape[0])
    dec = np.exp(-du_m[:, 0] / (0.35 + 0.5 * (0.5 + 0.5 * L.perlin(S[:, 0] / 3.0, 0.7))))
    for j in range(MASK_H - 1, -1, -1):
        acc = np.maximum(src[:, j], acc * dec)
        spill[:, j] = acc
    moss = np.maximum(src, spill * sst(-0.3, 0.3, n1 + 0.1) * 0.9)
    moss = np.maximum(moss, sst(0.55, 0.25, ao) * sst(-0.25, 0.25, n1) * 0.75)
    foot = sst(1.8, 0.2, Y) * sst(-0.2, 0.3, n1 + 0.05)
    moss = np.maximum(moss, foot)
    moss = np.maximum(moss, part * sst(0.1, 0.5, up))
    moss *= sst(-0.5, -0.12, n2 * 0.6 + n1 * 0.4 + 0.3)
    moss = np.clip(moss + 0.2 * sst(0.0, -0.5, curv) * sst(0.0, 0.4, up + 0.3), 0, 1)
    # lichen : grandes plaques crustacées pâles sur les faces verticales exposées, bord irrégulier
    expo = sst(-0.4, 0.05, up) * sst(0.6, 0.25, up) * sst(0.3, 0.7, ao)
    broad = sst(-0.05, 0.4, L.fbm(S / 3.2, U / 2.6, 4, off=91.0))
    mid = sst(-0.15, 0.35, L.fbm(S / 0.7, U / 0.6, 3, off=95.0))
    lich = np.clip(broad * (0.45 + 0.55 * mid) * expo * (0.75 + 0.5 * sst(-0.1, 0.3, curv)), 0, 1)
    lich *= 1 - moss
    # coulures : depuis la mousse des corniches, l'eau descend (u décroissant) en traînées fines
    src2 = src * moss
    stripe = sst(0.1, 0.6, L.perlin(S * 2.2, 0.3) * 0.7 + L.perlin(S * 7.0, 1.7) * 0.5 + 0.2)
    wet = np.zeros_like(src2)
    acc = np.zeros(src2.shape[0])
    dec = np.exp(-du_m[:, 0] / 2.5)
    for j in range(MASK_H - 1, -1, -1):
        acc = np.maximum(src2[:, j], acc * dec)
        wet[:, j] = acc
    wet = np.clip(wet * stripe * (1 - part) * sst(0.15, -0.2, up), 0, 1)
    wet = np.maximum(wet, foot * 0.4)
    return np.stack([moss, lich, wet], -1)


def to_image(a):
    """(ns × nt × c) → image (H = nt de haut en bas = u décroissant… on garde t vers le haut : ligne 0 = t=1)."""
    a = np.transpose(a, (1, 0, 2))[::-1]
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))


def main():
    import bpy
    os.makedirs(CACHE, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    W = Wall()
    nt_lo = int(np.ceil(18.5 / LO_STEP))
    lo = W.surface(LO_STEP, nt_lo, False)
    log('maillage jeu :', lo['P'].shape[:2], 'sommets', lo['P'].shape[0] * lo['P'].shape[1])
    uv1 = np.stack([lo['S'], lo['U']], -1)
    olo = build_mesh('paroi', lo['P'], lo['flip'], lo['uv0'], uv1)
    mat = bpy.data.materials.new('paroi')
    mat.use_nodes = True
    olo.data.materials.append(mat)
    nt_hi = int(np.ceil(18.5 / HI_STEP))
    t = time.time()
    hi = W.surface(HI_STEP, nt_hi, True)
    log(f'maillage HD : {hi["P"].shape[:2]} ({hi["P"].shape[0] * hi["P"].shape[1] / 1e6:.2f} M sommets) en {time.time() - t:.0f} s')
    ohi = build_mesh('paroi_hd', hi['P'], hi['flip'])
    del hi
    # monde gris uniforme pour l'AO
    world = bpy.data.worlds.new('w')
    bpy.context.scene.world = world
    world.light_settings.distance = 2.5
    nor = bake(olo, ohi, 'NORMAL', TEX_W, TEX_H, os.path.join(CACHE, 'paroi_nor.png'), 1)
    ao = bake(olo, ohi, 'AO', TEX_W // 2, TEX_H // 2, os.path.join(CACHE, 'paroi_ao.png'), 64 if not FAST else 16)
    # masques
    t = time.time()
    M = masks(W, ao)
    log(f'masques en {time.time() - t:.0f} s')
    to_image(M).save(os.path.join(OUT, 'paroi_masks.png'), optimize=True)
    Image.open(nor).convert('RGB').save(os.path.join(OUT, 'paroi_nor.jpg'), quality=94, subsampling=0)
    Image.open(ao).convert('L').save(os.path.join(OUT, 'paroi_ao.jpg'), quality=92)
    # export du maillage jeu (tangentes MikkTSpace : cohérentes avec la cuisson)
    bpy.data.objects.remove(ohi, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    olo.select_set(True)
    raw = os.path.join(CACHE, 'paroi_raw.glb')
    bpy.ops.export_scene.gltf(filepath=raw, export_format='GLB', use_selection=True, export_tangents=True,
                              export_texcoords=True, export_normals=True, export_materials='NONE', export_yup=True)
    out = os.path.join(OUT, 'paroi.glb')
    gp = os.path.join(ROOT, '..', 'CapyWorld', 'tools', 'polyhaven', 'node_modules', 'gltfpack', 'cli.js')
    r = subprocess.run(['node', gp, '-i', raw, '-o', out, '-cc', '-kn', '-kv', '-vp', '16', '-vtf', '-vn', '10'], capture_output=True, text=True)
    if r.returncode != 0:
        log('gltfpack :', r.stderr[-400:])
        import shutil
        shutil.copyfile(raw, out)
    info = dict(length=W.Ls, tex=[TEX_W, TEX_H], masks=[MASK_W, MASK_H], vertices=int(lo['P'].shape[0] * lo['P'].shape[1]))
    json.dump(info, open(os.path.join(OUT, 'paroi.json'), 'w'), indent=1)
    log('écrit', out, f'{os.path.getsize(out) / 1e6:.1f} Mo')
    # aperçus
    to_image(M).save(os.path.join(CACHE, 'masks_preview.png'))


if __name__ == '__main__':
    main()
