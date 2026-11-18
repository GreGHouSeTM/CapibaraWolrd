"""Autres ouvrages : grenier kura, ferme gasshō (chaume à 60°), pavillon azumaya, puits couvert, bain de pieds (ashiyu),
échoppe ambulante (yatai)."""
import math
import random
from mathutils import Vector as V
from .geom import Builder, X, Y, Z, aabb, box, quad, beam, post, tube, cylinder, disc, lathe, tint, jitter, affine, rot_y
from . import kit
from .kit import FL, POST, Pal
from .roof import gable_roof, hip_roof, pent_roof, roof_under, KAWARA
from .materials import C
from .town import _pal, _kawara_col, _bays, infill


def _finish(b, eave_y=None):
    b.weather(ground=0.0, eave_y=eave_y, skip=('paper_shoji', 'interior', 'metal', 'water'))
    return b


def _three(build, meta):
    return [build(0), build(1), build(2)], meta


# ====================================================================== KURA
def kura(W=6.0, D=6.0, floors=2, seed=61):
    """Grenier kura : murs d'enduit épais (blanc ou noir), soubassement namako, petites fenêtres à volets épais,
    porte massive sous auvent, toit kirizuma lourd."""
    rng = random.Random(seed)
    black = rng.random() < 0.3
    wall = tint('plaster', '#2c2927' if black else C['plaster_white'])
    pal = Pal(plaster='plaster_white')
    pal.plaster = wall
    kcol = _kawara_col(rng)
    yt = 3.3 if floors == 1 else 5.6
    t = 0.12

    def build(lod):
        b = Builder(seed)
        kit.plinth(b, -W / 2 - 0.1, -D / 2 - 0.1, W / 2 + 0.1, D / 2 + 0.1, y1=0.3, lod=lod)
        aabb(b, 'plaster', -W / 2, 0.3, -D / 2, W / 2, yt, D / 2, col=wall, uvs=kit.UV_PLASTER, skip=('-y', '+y'))
        # namako en bas des murs, ceinture en saillie
        for side in ('front', 'back', 'left', 'right'):
            M, L = kit.wall_frame(side, W, D)
            with b.at(M):
                quad(b, 'namako', (-0.08, 0.3, 0.09), (L + 0.08, 0.3, 0.09), (L + 0.08, 1.4, 0.09), (-0.08, 1.4, 0.09), (1, 1, 1), (0.9, 0.9), out=Z)
                aabb(b, 'plaster', -0.08, 1.4, 0.06, L + 0.08, 1.52, 0.13, col=wall, uvs=kit.UV_PLASTER, grain=0, skip=('-z',))
                aabb(b, 'plaster', -0.08, yt - 0.3, 0.06, L + 0.08, yt, 0.16, col=wall, uvs=kit.UV_PLASTER, grain=0, skip=('-z',))
                # petites fenêtres à volets épais (étage)
                if floors >= 2 and side in ('front', 'left', 'right'):
                    xc = L / 2
                    wy0, wy1 = yt - 1.7, yt - 0.8
                    quad(b, 'interior', (xc - 0.4, wy0, 0.08), (xc + 0.4, wy0, 0.08), (xc + 0.4, wy1, 0.08), (xc - 0.4, wy1, 0.08), (1, 1, 1), out=Z)
                    if lod <= 1:
                        kit.koshi(b, pal, xc - 0.4, xc + 0.4, wy0, wy1, lod, slat=0.05, gap=0.08, z=0.1, rails=2, col=tint('wood', '#30302e'), paper_behind=False)
                    for s in (-1, 1):
                        aabb(b, 'plaster', xc + s * 0.4 - (0.42 if s < 0 else 0), wy0 - 0.05, 0.1, xc + s * 0.4 + (0.42 if s > 0 else 0), wy1 + 0.05, 0.25, col=wall, uvs=kit.UV_PLASTER)
                    aabb(b, 'kawara', xc - 0.75, wy1 + 0.1, 0.06, xc + 0.75, wy1 + 0.2, 0.45, col=kcol, uvs=(1.08, 1.2))
                if side == 'front':
                    xc = L / 2
                    aabb(b, 'plaster', xc - 0.95, 0.3, 0.08, xc + 0.95, 2.4, 0.3, col=wall, uvs=kit.UV_PLASTER, skip=('-z',))
                    quad(b, 'planks', (xc - 0.6, 0.3, 0.31), (xc + 0.6, 0.3, 0.31), (xc + 0.6, 2.1, 0.31), (xc - 0.6, 2.1, 0.31), tint('planks', C['wood_dark']), kit.UV_PLANKS, out=Z)
                    if lod == 0:
                        for k in range(4):
                            y = 0.5 + k * 0.45
                            aabb(b, 'metal', xc - 0.6, y, 0.31, xc + 0.6, y + 0.04, 0.33, col=(0.6, 0.6, 0.6), skip=('-z',))
                    b.anchor('anchor_nameplate', (xc + 0.7, 1.6, 0.31), 0.0)
        pent_roof(b, -1.3, 1.3, 2.75, 0.9, pitch=0.35, lod=lod, z_wall=D / 2 + 0.3, col=kcol)
        slopes, ytop = gable_roof(b, W, D, yt, pitch=0.6, ov=0.6, ovg=0.45, lod=lod, sag=0.12, oni=0.65, ridge_layers=4, col=kcol, rafter=False)
        for side in ('left', 'right'):
            M, L = kit.wall_frame(side, W, D)

            def ry(x, M=M):
                p = M @ V((x, 0, 0))
                return roof_under(slopes, p.x, p.z, default=yt) - 0.04
            n = 8
            with b.at(M):
                pts = [V((-0.075, yt, 0.076))] + [V((-0.075 + (L + 0.15) * i / n, max(yt, ry(-0.075 + (L + 0.15) * i / n)), 0.076)) for i in range(n + 1)] + [V((L + 0.075, yt, 0.076))]
                from .geom import poly
                poly(b, 'plaster', pts, wall, kit.UV_PLASTER, out=Z)
        return _finish(b, yt), ytop

    res = [build(0), build(1), build(2)]
    meta = dict(height=round(res[0][1], 2), colliders=[dict(x=0, z=0, w=W, d=D, y0=-0.5, y1=yt)])
    return [r[0] for r in res], meta


# ====================================================================== GASSHŌ
def gassho(W=16.0, D=10.0, seed=62):
    """Ferme gasshō-zukuri : chaume de 0,8 m à 60°, trois niveaux sous le toit, petites fenêtres dans les pignons, fumée du foyer."""
    rng = random.Random(seed)
    pal = _pal(rng, 'minka')
    y1 = FL + 2.8
    nf, ns = _bays(W - POST), _bays(D - POST)

    def build(lod):
        b = Builder(seed)
        kit.plinth(b, -W / 2, -D / 2, W / 2, D / 2, lod=lod)
        fb = ['shoji' if i % 3 else 'boards_plaster' for i in range(nf)]
        fb[nf // 2] = 'door'
        kit.wall(b, pal, 'front', W, D, FL, y1, [(1, t, {'koshi_h': 0.3, 'h': 1.0}) for t in fb], lod, lintel=FL + 1.85)
        kit.wall(b, pal, 'back', W, D, FL, y1, [(1, 'boards_plaster' if i % 2 else 'window', {'h': 1.0}) for i in range(nf)], lod)
        for s in ('left', 'right'):
            kit.wall(b, pal, s, W, D, FL, y1, [(1, 'shoji' if i % 2 else 'boards_plaster', {'koshi_h': 0.3, 'h': 1.0}) for i in range(ns)], lod, lintel=FL + 1.85)
        slopes, ytop = gable_roof(b, W, D, y1 + 0.2, pitch=1.65, ov=1.0, ovg=1.0, lod=lod, sag=0.0, oni=0, th=0.8, mat='thatch',
                                  col=(1.0, 0.95, 0.85), rafter=False, ridge_layers=2)
        # pignons : planches, petites fenêtres shōji sur trois niveaux
        for side in ('left', 'right'):
            infill(b, pal, side, W, D, (0, 0), slopes, y1 + 0.2, lod)
            M, L = kit.wall_frame(side, W, D)
            with b.at(M):
                for k, (yy, n) in enumerate(((y1 + 1.0, 3), (y1 + 3.2, 2), (y1 + 5.2, 1))):
                    for i in range(n):
                        x = L / 2 + (i - (n - 1) / 2) * 1.6
                        kit.shoji_panel(b, pal, x - 0.45, x + 0.45, yy, yy + 1.0, 0.07, lod, koshi_h=0)
                        if lod == 0 and k == 0:
                            b.anchor('light_room', (x, yy + 0.5, -0.5), 0.0, color='#ffb060', intensity=0.6)
        if lod == 0:
            b.anchor('smoke_hearth', (0, ytop - 1.5, D * 0.05), 0.0, kind='through-thatch')
            b.anchor('anchor_lantern', (W / (2 * nf), FL + 2.1, D / 2 + 0.4), 0.0, kind='andon')
        return _finish(b, y1), ytop

    res = [build(0), build(1), build(2)]
    meta = dict(height=round(res[0][1], 2), colliders=[dict(x=0, z=0, w=W, d=D, y0=-0.5, y1=y1 + 0.2)])
    return [r[0] for r in res], meta


# ====================================================================== AZUMAYA (pavillon)
def azumaya(W=4.0, D=4.0, seed=63, roof='yosemune'):
    rng = random.Random(seed)
    kcol = _kawara_col(rng)
    wood = tint('wood', C['wood_mid'])
    hp = 2.5

    def build(lod):
        b = Builder(seed)
        aabb(b, 'stone', -W / 2 - 0.2, -0.4, -D / 2 - 0.2, W / 2 + 0.2, 0.15, D / 2 + 0.2, col=(0.85, 0.84, 0.8), uvs=(1.6, 1.6), skip=('-y',))
        e = 0.12
        for sx in (-1, 1):
            for sz in (-1, 1):
                post(b, 'wood', sx * (W / 2 - e), sz * (D / 2 - e), 0.15, hp, 0.16, col=jitter(wood, b.rng), chamfer=0.025 if lod == 0 else 0)
        for sz in (-1, 1):
            aabb(b, 'wood', -W / 2, hp, sz * (D / 2 - e) - 0.08, W / 2, hp + 0.18, sz * (D / 2 - e) + 0.08, col=wood, uvs=kit.UV_WOOD, grain=0)
        for sx in (-1, 1):
            aabb(b, 'wood', sx * (W / 2 - e) - 0.08, hp + 0.18, -D / 2, sx * (W / 2 - e) + 0.08, hp + 0.34, D / 2, col=wood, uvs=kit.UV_WOOD, grain=2)
        # banc périphérique (sauf l'entrée)
        if lod <= 1:
            for side in ('back', 'left', 'right'):
                M, L = kit.wall_frame(side, W - 0.3, D - 0.3)
                with b.at(M):
                    aabb(b, 'planks', 0.1, 0.42, -0.4, L - 0.1, 0.48, 0.0, col=tint('planks', C['wood_old']), uvs=kit.UV_PLANKS, grain=0)
                    for x in (0.3, L - 0.3):
                        aabb(b, 'wood', x - 0.04, 0.15, -0.3, x + 0.04, 0.42, -0.1, col=wood, uvs=kit.UV_WOOD)
        slopes, ytop = hip_roof(b, W - 0.2, D - 0.2, hp + 0.34, pitch=0.6, ov=0.85, lod=lod, sag=0.22,
                                r_break=None if roof == 'yosemune' else (D + 1.5) / 2 * 0.5, corner_lift=0.25, Ld=1.2, oni=0.35, col=kcol)
        if abs(W - D) < 0.5:
            lathe(b, 'metal', [(0.18, ytop - 0.25), (0.2, ytop - 0.05), (0.12, ytop + 0.1), (0.0, ytop + 0.3)], seg=8, col=(1, 0.95, 0.85))
        if lod == 0:
            b.anchor('anchor_lantern', (0, hp - 0.1, 0), 0.0, kind='chochin')
            b.anchor('light_pavilion', (0, hp - 0.4, 0), 0.0, color='#ffb060', intensity=0.6)
        return _finish(b), ytop

    res = [build(0), build(1), build(2)]
    meta = dict(height=round(res[0][1], 2), colliders=[dict(x=sx * (W / 2 - 0.12), z=sz * (D / 2 - 0.12), w=0.2, d=0.2, y0=0, y1=hp) for sx in (-1, 1) for sz in (-1, 1)])
    return [r[0] for r in res], meta


# ====================================================================== PUITS
def puits(W=3.0, D=3.0, seed=64):
    rng = random.Random(seed)
    kcol = _kawara_col(rng)
    wood = tint('wood', C['wood_dark'])

    def build(lod):
        b = Builder(seed)
        seg = 16 if lod == 0 else 10
        aabb(b, 'stone', -W / 2, -0.3, -D / 2, W / 2, 0.08, D / 2, col=(0.85, 0.84, 0.8), uvs=(1.4, 1.4), skip=('-y',))
        lathe(b, 'stone', [(0.85, 0.05), (0.85, 0.72), (0.78, 0.8), (0.62, 0.8)], seg=seg, col=(0.9, 0.88, 0.85), uvs=(1.4, 1.4))
        disc(b, 'interior', (0, 0.62, 0), Y, 0.63, seg=seg)
        for sx in (-1, 1):
            post(b, 'wood', sx * 1.05, 0.0, 0.08, 2.5, 0.14, col=wood, chamfer=0.02 if lod == 0 else 0)
        aabb(b, 'wood', -1.2, 2.1, -0.07, 1.2, 2.22, 0.07, col=wood, uvs=kit.UV_WOOD, grain=0)
        aabb(b, 'wood', -1.15, 2.5, -0.6, 1.15, 2.62, 0.6, col=wood, uvs=kit.UV_WOOD, grain=0, skip=('-y',))
        gable_roof(b, 2.2, 1.6, 2.62, pitch=0.65, ov=0.45, ovg=0.35, lod=lod, sag=0.18, oni=0.32, ridge_layers=2, col=kcol, rafter=False)
        if lod <= 1:
            cylinder(b, 'wood', (-0.1, 2.0, 0), (0.1, 2.0, 0), 0.14, seg=10, caps=(True, True), col=tint('wood', C['wood_old']))
            cylinder(b, 'thatch', (0.0, 1.86, 0.0), (0.0, 1.0, 0.0), 0.012, seg=4, col=(0.9, 0.8, 0.6))
            lathe(b, 'planks', [(0.16, 0.86), (0.2, 1.0), (0.0, 1.0)], c=(0, 0, 0), seg=10, col=tint('planks', C['wood_old']))
        if lod == 0:
            b.anchor('anchor_bucket', (0.95, 0.8, 0.3), 0.0, kind='seau')
        return _finish(b), 3.6

    res = [build(0), build(1), build(2)]
    meta = dict(height=3.6, colliders=[dict(x=0, z=0, w=1.7, d=1.7, y0=0, y1=0.8)])
    return [r[0] for r in res], meta


# ====================================================================== ASHIYU (bain de pieds)
def ashiyu(W=7.0, D=3.5, seed=65):
    rng = random.Random(seed)
    kcol = _kawara_col(rng)
    wood = tint('wood', C['wood_mid'])

    def build(lod):
        b = Builder(seed)
        bw, bd = W - 0.6, D * 0.45
        zc = -D / 2 + 0.3 + bd / 2
        aabb(b, 'stone', -W / 2, -0.3, -D / 2, W / 2, 0.08, D / 2, col=(0.85, 0.84, 0.8), uvs=(1.4, 1.4), skip=('-y',))
        for (x0, z0, x1, z1) in ((-bw / 2, zc - bd / 2, bw / 2, zc - bd / 2 + 0.25), (-bw / 2, zc + bd / 2 - 0.25, bw / 2, zc + bd / 2),
                                 (-bw / 2, zc - bd / 2, -bw / 2 + 0.25, zc + bd / 2), (bw / 2 - 0.25, zc - bd / 2, bw / 2, zc + bd / 2)):
            aabb(b, 'stone', x0, 0.08, z0, x1, 0.45, z1, col=jitter((0.8, 0.8, 0.77), b.rng, 0.08), uvs=(1.2, 1.2), skip=('-y',))
        quad(b, 'water', (-bw / 2 + 0.25, 0.32, zc + bd / 2 - 0.25), (bw / 2 - 0.25, 0.32, zc + bd / 2 - 0.25), (bw / 2 - 0.25, 0.32, zc - bd / 2 + 0.25), (-bw / 2 + 0.25, 0.32, zc - bd / 2 + 0.25), (1, 1, 1), out=Y)
        # banc de bois côté façade (+z)
        aabb(b, 'planks', -bw / 2, 0.42, zc + bd / 2 + 0.05, bw / 2, 0.48, zc + bd / 2 + 0.5, col=tint('planks', C['wood_old']), uvs=kit.UV_PLANKS, grain=0)
        n = 3
        for i in range(n + 1):
            x = -W / 2 + 0.2 + (W - 0.4) * i / n
            for z in (-D / 2 + 0.15, D / 2 - 0.15):
                post(b, 'wood', x, z, 0.08, 2.4, 0.14, col=jitter(wood, b.rng), chamfer=0.02 if lod == 0 else 0)
        for z in (-D / 2 + 0.15, D / 2 - 0.15):
            aabb(b, 'wood', -W / 2, 2.4, z - 0.08, W / 2, 2.58, z + 0.08, col=wood, uvs=kit.UV_WOOD, grain=0)
        gable_roof(b, W - 0.3, D - 0.3, 2.58, pitch=0.45, ov=0.5, ovg=0.4, lod=lod, sag=0.15, oni=0.35, ridge_layers=2, col=kcol)
        if lod == 0:
            b.anchor('smoke_steam', (0, 0.5, zc), 0.0, kind='steam')
            b.anchor('anchor_water', (0, 0.32, zc), 0.0, w=round(bw - 0.5, 2), d=round(bd - 0.5, 2), hot=True)
            b.anchor('anchor_kanban', (0, 2.2, D / 2 - 0.05), 0.0, w=1.0, h=0.4, kind='湯')
            b.anchor('light_pavilion', (0, 2.1, 0), 0.0, color='#ffb060', intensity=0.6)
        return _finish(b), 4.0

    res = [build(0), build(1), build(2)]
    meta = dict(height=4.0, colliders=[dict(x=0, z=round(-D / 2 + 0.3 + D * 0.225, 2), w=W - 0.6, d=round(D * 0.45, 2), y0=0, y1=0.45)])
    return [r[0] for r in res], meta


# ====================================================================== YATAI
def yatai(W=3.0, D=2.0, seed=66):
    rng = random.Random(seed)
    cloth = tint('planks', rng.choice(['#8a2a22', '#2c3f66', '#6a5a2a']))
    wood = tint('wood', C['wood_old'])

    def build(lod):
        b = Builder(seed)
        cw, cd = W * 0.8, D * 0.5
        aabb(b, 'planks', -cw / 2, 0.45, -cd / 2, cw / 2, 0.95, cd / 2, col=tint('planks', C['wood_mid']), uvs=kit.UV_PLANKS)
        aabb(b, 'planks', -cw / 2 - 0.05, 0.95, -cd / 2 - 0.05, cw / 2 + 0.05, 1.0, cd / 2 + 0.25, col=tint('planks', C['wood_old']), uvs=kit.UV_PLANKS, grain=0)
        for s in (-1, 1):
            cylinder(b, 'wood', (s * (cw / 2 + 0.02), 0.42, 0), (s * (cw / 2 + 0.1), 0.42, 0), 0.42, seg=14 if lod == 0 else 8, caps=(True, True), col=wood)
        for sx in (-1, 1):
            for sz in (-1, 1):
                aabb(b, 'wood', sx * (cw / 2 - 0.05) - 0.03, 1.0, sz * (cd / 2 - 0.05) - 0.03, sx * (cw / 2 - 0.05) + 0.03, 2.1, sz * (cd / 2 - 0.05) + 0.03, col=wood, uvs=kit.UV_WOOD)
        # auvent de tissu tendu
        quad(b, 'planks', (-W / 2, 2.0, D / 2), (W / 2, 2.0, D / 2), (W / 2, 2.25, -cd / 2), (-W / 2, 2.25, -cd / 2), cloth, (1.2, 1.2), out=Y)
        quad(b, 'planks', (-W / 2, 2.0, D / 2), (-W / 2, 2.25, -cd / 2), (W / 2, 2.25, -cd / 2), (W / 2, 2.0, D / 2), cloth, (1.2, 1.2), out=-Y)
        quad(b, 'planks', (-W / 2, 1.75, D / 2 + 0.01), (W / 2, 1.75, D / 2 + 0.01), (W / 2, 2.0, D / 2 + 0.01), (-W / 2, 2.0, D / 2 + 0.01), cloth, (1.2, 1.2), out=Z)
        if lod == 0:
            b.anchor('anchor_noren', (0, 1.75, D / 2), 0.0, w=round(W - 0.4, 2), h=0.35, kind='court')
            b.anchor('anchor_lantern', (cw / 2 + 0.1, 1.95, D / 2 - 0.1), 0.0, kind='chochin-rouge')
            b.anchor('light_stall', (0, 1.6, 0.2), 0.0, color='#ff9a50', intensity=0.8)
            b.anchor('anchor_goods', (0, 1.0, 0.2), 0.0, w=round(cw, 2), d=round(cd, 2))
        return _finish(b), 2.3

    res = [build(0), build(1), build(2)]
    meta = dict(height=2.3, colliders=[dict(x=0, z=0, w=W * 0.8 + 0.2, d=D * 0.5, y0=0, y1=1.0)])
    return [r[0] for r in res], meta
