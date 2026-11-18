"""Quartier des bains et place : ryokan (Grand Ryokan, ryokan du Torrent, petit ryokan Momiji), bains publics (sentō),
maison de thé du Cerisier (chaya), moulin à eau (toit de chaume) et sa roue séparée (animable).
"""
import math
import random
from mathutils import Vector as V
from .geom import Builder, X, Y, Z, aabb, box, quad, beam, post, tube, cylinder, tint, jitter, affine, rot_y, lathe
from . import kit
from .kit import FL, POST, Pal
from .roof import gable_roof, hip_roof, pent_roof, roof_under, KAWARA
from .materials import C
from .town import _pal, _kawara_col, _bays, infill


def _finish(b, eave_y=None):
    b.weather(ground=0.0, eave_y=eave_y)
    return b


def _porch(b, pal, x, z_wall, w, depth, y_post, kcol, lod, mat='kawara'):
    """Porche d'entrée à pignon sur rue (genkan sous karahafu simplifié) : deux poteaux, toit à deux pans perpendiculaire."""
    for s in (-1, 1):
        post(b, 'wood', x + s * (w / 2 - 0.12), z_wall + depth - 0.15, 0.0, y_post, 0.2, col=pal.wood, chamfer=0.03 if lod == 0 else 0)
        aabb(b, 'wood', x + s * (w / 2 - 0.12) - 0.1, y_post, z_wall, x + s * (w / 2 - 0.12) + 0.1, y_post + 0.22, z_wall + depth, col=pal.wood, uvs=kit.UV_WOOD, grain=2)
    aabb(b, 'wood', x - w / 2, y_post, z_wall + depth - 0.25, x + w / 2, y_post + 0.25, z_wall + depth - 0.05, col=pal.wood, uvs=kit.UV_WOOD, grain=0)
    with b.at(affine(None, (x, 0, z_wall + depth / 2))):
        sl, yt = gable_roof(b, w, depth, y_post + 0.22, pitch=0.62, ov=0.55, ovg=0.6, lod=lod, sag=0.35, oni=0.5, col=kcol,
                            ridge_axis='z', mat=mat, rafter=True)
    # pignon du porche : planches et poutres
    if lod <= 1:
        zg = z_wall + depth + 0.55
        aabb(b, 'wood', x - w / 2, y_post + 0.25, zg - 0.6, x + w / 2, y_post + 0.45, zg - 0.45, col=pal.wood, uvs=kit.UV_WOOD, grain=0)
    b.anchor('anchor_noren', (x, y_post - 0.05, z_wall + 0.15), 0.0, w=round(w - 0.6, 2), h=1.0, kind='grand')
    b.anchor('anchor_lantern', (x - w / 2 - 0.3, y_post - 0.2, z_wall + depth), 0.0, kind='chochin-rouge')
    b.anchor('anchor_lantern', (x + w / 2 + 0.3, y_post - 0.2, z_wall + depth), 0.0, kind='chochin-rouge')
    b.anchor('anchor_kanban', (x, y_post + 0.9, z_wall + depth + 0.62), 0.0, w=1.4, h=0.5, kind='gable')
    return yt


def ryokan(W, D, floors=2, seed=1, kind='ryokan'):
    """Ryokan à 2-3 niveaux : rangées de shōji lumineux, balcons à balustres, auvents d'étage, toit irimoya, porche d'entrée.
    kind = 'chaya' : rez-de-chaussée ouvert (banquettes), auvent profond."""
    rng = random.Random(seed)
    pal = _pal(rng, 'machiya')
    pal.plaster = tint('plaster', C['plaster_cream'])
    kcol = _kawara_col(rng)
    hs = [3.0] + [2.7] * (floors - 1)
    ys = [FL]
    for h in hs:
        ys.append(ys[-1] + h + 0.2)
    yw = ys[-1]
    nf = _bays(W - POST)
    ns = _bays(D - POST)

    def build(lod):
        b = Builder(seed)
        kit.plinth(b, -W / 2, -D / 2, W / 2, D / 2, lod=lod)
        for f in range(floors):
            y0, y1 = ys[f], ys[f] + hs[f]
            if f == 0:
                if kind == 'chaya':
                    fb = ['shop'] * nf
                    fb[nf // 2] = 'door'
                else:
                    fb = ['koshi' if i % 3 == 0 else 'shoji' for i in range(nf)]
                    fb[nf // 2] = 'open'
                kit.wall(b, pal, 'front', W, D, y0, y1, [(1.4 if (i == nf // 2) else 1, t, {'depth': 1.4, 'koshi_h': 0.3, 'bench': True}) for i, t in enumerate(fb)], lod, lintel=y0 + 2.05)
                sides = ['plaster', 'window'] * ns
                for s in ('left', 'right'):
                    kit.wall(b, pal, s, W, D, y0, y1, [(1, t, None) for t in sides[:ns]], lod)
                kit.wall(b, pal, 'back', W, D, y0, y1, [(1, 'shoji' if i % 2 else 'plaster', {'koshi_h': 0.3}) for i in range(nf)], lod)
            else:
                yb = y0
                kit.wall(b, pal, 'front', W, D, yb, y1, [(1, 'shoji', {'koshi_h': 0.4, 'top': y1 - 0.35})] * nf, lod)
                # arrière et côtés : quadrillage peint (LOD1) pour tenir le budget ; façade : kumiko en relief
                wl = max(lod, 1)
                kit.wall(b, pal, 'back', W, D, yb, y1, [(1, 'shoji', {'koshi_h': 0.4, 'top': y1 - 0.35})] * nf, wl)
                for s in ('left', 'right'):
                    kit.wall(b, pal, s, W, D, yb, y1, [(1, 'shoji' if i % 2 else 'plaster', {'koshi_h': 0.4, 'top': y1 - 0.35}) for i in range(ns)], wl)
                # balcons avant et arrière (sur le torrent)
                for rot in (0, math.pi):
                    with b.at(affine(rot_y(rot))):
                        kit.floor_deck(b, pal, -W / 2 + 0.1, D / 2, W / 2 - 0.1, D / 2 + 0.8, y0 + 0.05, along='x')
                        aabb(b, 'wood', -W / 2 + 0.1, y0 - 0.2, D / 2 + 0.65, W / 2 - 0.1, y0 - 0.01, D / 2 + 0.8, col=pal.wood, uvs=kit.UV_WOOD, grain=0)
                        with b.at(affine(None, (0, 0, D / 2))):
                            kit.railing(b, pal, -W / 2 + 0.1, W / 2 - 0.1, y0 + 0.05, h=0.8, z=0.72, lod=lod, baluster=0.22)
                if lod == 0:
                    b.anchor('light_room', (0, y0 + 1.4, D / 2 - 1.5), 0.0, color='#ffb868', intensity=1.0)
            if f < floors - 1:
                # auvents d'étage sur les quatre côtés (avant/arrière : tuiles ; côtés : courts)
                yt = ys[f + 1] + 0.35
                dep = 1.1 if f == 0 else 0.9
                for rot in (0, math.pi):
                    with b.at(affine(rot_y(rot))):
                        pent_roof(b, -W / 2 - 0.15, W / 2 + 0.15, yt, dep, pitch=0.38, lod=lod, z_wall=D / 2 + (0.8 if f > 0 else 0), col=kcol)
        # porche d'entrée
        if kind == 'chaya':
            pent_roof(b, -W / 2 - 0.2, W / 2 + 0.2, ys[0] + 2.75, 2.0, pitch=0.3, lod=lod, z_wall=D / 2, col=kcol,
                      brackets=[-W / 2 + 0.1 + (W - 0.2) * i / nf for i in range(nf + 1)])
            for i in range(nf + 1):
                x = -W / 2 + 0.15 + (W - 0.3) * i / nf
                post(b, 'wood', x, D / 2 + 1.75, 0.05, ys[0] + 2.1, 0.14, col=pal.wood, chamfer=0.02 if lod == 0 else 0)
            if lod == 0:
                for k in range(2):
                    b.anchor('anchor_bench', (-W / 4 + k * W / 2, 0.0, D / 2 + 1.2), 0.0, kind='banquette-rouge', w=1.8)
                b.anchor('anchor_umbrella', (W / 2 + 0.6, 0.0, D / 2 + 1.6), 0.0, kind='ombrelle-rouge')
                b.anchor('anchor_lantern', (-W / 2 + 1.0, ys[0] + 2.0, D / 2 + 1.8), 0.0, kind='chochin-茶')
        else:
            _porch(b, pal, 0, D / 2, min(4.2, W * 0.28), 2.2, ys[0] + 2.3, kcol, lod)
        kit.steps(b, 0, D / 2 + (2.2 if kind != 'chaya' else 0.04), 2.4, 1, rise=0.2, run=0.45, lod=lod)
        slopes, ytop = hip_roof(b, W, D, yw, pitch=0.52, ov=1.25 if floors > 1 else 1.4, lod=lod, sag=0.2,
                                r_break=(D + 2.5) / 2 * 0.5, corner_lift=0.3, Ld=2.0, oni=0.65, col=kcol)
        if lod == 0:
            for i in range(nf):
                x = -W / 2 + (i + 0.5) * W / nf
                if i % 2 == 0:
                    b.anchor('anchor_lantern', (x, ys[1] - 0.25, D / 2 + 1.0), 0.0, kind='chochin-rouge')
            b.anchor('light_entrance', (0, ys[0] + 1.6, D / 2 - 0.6), 0.0, color='#ffb060', intensity=1.2)
            b.anchor('smoke_kitchen', (W * 0.3, ytop - 0.6, -D * 0.25), 0.0)
        return _finish(b, yw), ytop

    def build2():
        b = Builder(seed)
        kit.plinth(b, -W / 2, -D / 2, W / 2, D / 2, lod=2, y0=-0.6)
        for side in ('front', 'back', 'left', 'right'):
            M, L = kit.wall_frame(side, W, D)
            with b.at(M):
                for f in range(floors):
                    y0, y1 = ys[f], ys[f] + hs[f]
                    if f > 0 and side in ('front', 'back'):
                        kit.paper(b, -0.075, L + 0.075, y0, y1, 0.075, 0.25, 0.3)
                    else:
                        quad(b, 'plaster' if f else 'planks', (-0.075, y0 - 0.12, 0.075), (L + 0.075, y0 - 0.12, 0.075), (L + 0.075, y1 + 0.2, 0.075),
                             (-0.075, y1 + 0.2, 0.075), pal.plaster if f else pal.board, (2.4, 2.4), out=Z)
        for f in range(floors - 1):
            for rot in (0, math.pi):
                with b.at(affine(rot_y(rot))):
                    pent_roof(b, -W / 2 - 0.15, W / 2 + 0.15, ys[f + 1] + 0.35, 1.0, pitch=0.38, lod=2, z_wall=D / 2, col=kcol, ends=False)
        hip_roof(b, W, D, yw, pitch=0.52, ov=1.25 if floors > 1 else 1.4, lod=2, sag=0.2, r_break=(D + 2.5) / 2 * 0.5,
                 corner_lift=0.3, Ld=2.0, oni=0.65, col=kcol)
        return _finish(b, yw)

    b0, ytop = build(0)
    b1, _ = build(1)
    b2 = build2()
    meta = dict(height=round(ytop, 2), colliders=[dict(x=0, z=0, w=W, d=D, y0=-0.5, y1=round(yw, 2))])
    return [b0, b1, b2], meta


def sento(W=16.0, D=12.0, seed=41):
    """Bains publics : grand volume haut (7 m), irimoya à lanterneau d'aération (koshi-yane), porche d'entrée,
    cheminée de briques de 14 m qui fume, claire-voie haute."""
    rng = random.Random(seed)
    pal = _pal(rng, 'machiya')
    pal.plaster = tint('plaster', C['plaster_white'])
    kcol = _kawara_col(rng)
    y1 = FL + 4.6
    nf, ns = _bays(W - POST, 2.0), _bays(D - POST, 2.0)

    def build(lod):
        b = Builder(seed)
        kit.plinth(b, -W / 2, -D / 2, W / 2, D / 2, lod=lod)
        fb = ['koshi', 'boards_plaster'] * nf
        fb = fb[:nf]
        fb[nf // 2] = 'open'
        fb[nf // 2 - 1] = 'door'
        kit.wall(b, pal, 'front', W, D, FL, y1, [(1.3 if i == nf // 2 else 1, t, {'depth': 1.6, 'h': 1.2, 'top': FL + 2.2}) for i, t in enumerate(fb)], lod, lintel=FL + 2.2)
        for s in ('left', 'right', 'back'):
            n = ns if s != 'back' else nf
            kit.wall(b, pal, s, W, D, FL, y1, [(1, 'boards_plaster', {'h': 1.4}) for i in range(n)], lod)
        # claire-voie haute (lattes devant le papier) sur les côtés
        for s in ('left', 'right'):
            M, L = kit.wall_frame(s, W, D)
            with b.at(M):
                kit.koshi(b, pal, 0.3, L - 0.3, y1 - 1.2, y1 - 0.25, lod, slat=0.04, gap=0.06, z=0.09, rails=2)
        slopes, ytop = hip_roof(b, W, D, y1 + 0.2, pitch=0.5, ov=1.3, lod=lod, sag=0.18, r_break=(D + 2.6) / 2 * 0.5,
                                corner_lift=0.3, Ld=2.0, oni=0.7, col=kcol)
        # lanterneau d'aération sur le faîtage
        yr = ytop - 0.45
        lw = W * 0.45
        for sx in (-1, 1):
            for sz in (-1, 1):
                aabb(b, 'wood', sx * lw / 2 - 0.08, yr, sz * 0.9 - 0.08, sx * lw / 2 + 0.08, yr + 1.0, sz * 0.9 + 0.08, col=pal.wood, uvs=kit.UV_WOOD)
        for sz in (-1, 1):
            with b.at(affine(rot_y(0 if sz > 0 else math.pi))):
                kit.koshi(b, pal, -lw / 2, lw / 2, yr + 0.1, yr + 0.95, lod, slat=0.05, gap=0.07, z=0.9, rails=2, paper_behind=False)
        gable_roof(b, lw + 0.2, 1.8, yr + 1.0, pitch=0.6, ov=0.5, ovg=0.3, lod=lod, sag=0.15, oni=0.4, col=kcol, rafter=False)
        # porche d'entrée
        _porch(b, pal, -W / (2 * nf) + 0.3, D / 2, 4.6, 2.4, FL + 2.6, kcol, lod)
        # cheminée de briques (14 m)
        cx, cz = W / 2 - 1.6, -D / 2 + 1.4
        aabb(b, 'brick', cx - 0.7, -0.6, cz - 0.7, cx + 0.7, 2.0, cz + 0.7, col=(0.95, 0.9, 0.88), uvs=(1.5, 1.5))
        n = 6 if lod == 0 else 2
        for i in range(n):
            y0 = 2.0 + 12.0 * i / n
            y1c = 2.0 + 12.0 * (i + 1) / n
            r0 = 0.6 - 0.18 * i / n
            r1 = 0.6 - 0.18 * (i + 1) / n
            from .geom import poly
            for k in range(4):
                ang = [(1, 1), (-1, 1), (-1, -1), (1, -1), (1, 1)]
                a, c = ang[k], ang[k + 1]
                quad(b, 'brick', (cx + a[0] * r0, y0, cz + a[1] * r0), (cx + c[0] * r0, y0, cz + c[1] * r0), (cx + c[0] * r1, y1c, cz + c[1] * r1), (cx + a[0] * r1, y1c, cz + a[1] * r1),
                     (0.95, 0.9, 0.88), (1.5, 1.5), out=V((a[0] + c[0], 0, a[1] + c[1])))
        aabb(b, 'brick', cx - 0.5, 14.0, cz - 0.5, cx + 0.5, 14.35, cz + 0.5, col=(0.7, 0.65, 0.62), uvs=(1.5, 1.5))
        quad(b, 'interior', (cx - 0.38, 14.34, cz + 0.38), (cx + 0.38, 14.34, cz + 0.38), (cx + 0.38, 14.34, cz - 0.38), (cx - 0.38, 14.34, cz - 0.38), (1, 1, 1), out=Y)
        if lod == 0:
            b.anchor('smoke_chimney', (cx, 14.5, cz), 0.0)
            b.anchor('smoke_steam', (0, ytop + 0.8, 0), 0.0, kind='steam')
            b.anchor('anchor_buckets', (W / 2 - 1.5, 0.0, D / 2 + 0.8), 0.0, kind='pyramide-seaux')
            b.anchor('light_bath', (0, FL + 2.0, D / 2 - 1.2), 0.0, color='#ffb060', intensity=1.2)
        return _finish(b, y1 + 0.2), max(ytop + 1.6, 14.35)

    b0, ytop = build(0)
    b1, _ = build(1)
    b2, _ = build(2)
    meta = dict(height=round(ytop, 2), colliders=[dict(x=0, z=0, w=W, d=D, y0=-0.5, y1=round(y1 + 0.2, 2)),
                                                  dict(x=W / 2 - 1.6, z=-D / 2 + 1.4, w=1.4, d=1.4, y0=-0.5, y1=14.35)])
    return [b0, b1, b2], meta


def moulin(W=8.0, D=7.0, seed=51, wheel_local=(0.0, 1.9, -9.2)):
    """Moulin à eau : murs de planches et d'argile, toit de chaume épais à croupes, arbre de roue vers l'arrière (−z).
    La roue est un modèle séparé (moulin-roue.glb) posé sur l'accroche anchor_wheel_0."""
    rng = random.Random(seed)
    pal = _pal(rng, 'minka')
    y1 = FL + 2.6

    def build(lod):
        b = Builder(seed)
        kit.plinth(b, -W / 2, -D / 2, W / 2, D / 2, lod=lod)
        nf, ns = _bays(W - POST), _bays(D - POST)
        fb = ['boards'] * nf
        fb[nf // 2] = 'open'
        kit.wall(b, pal, 'front', W, D, FL, y1, [(1.2 if i == nf // 2 else 1, t, {'depth': 2.0}) for i, t in enumerate(fb)], lod, lintel=FL + 2.0)
        for s in ('left', 'right'):
            kit.wall(b, pal, s, W, D, FL, y1, [(1, 'boards_plaster' if i % 2 else 'window', {'h': 1.2, 'kind': 'koshi'}) for i in range(ns)], lod)
        kit.wall(b, pal, 'back', W, D, FL, y1, [(1, 'boards', None)] * nf, lod)
        slopes, ytop = hip_roof(b, W, D, y1 + 0.2, pitch=0.85, ov=0.9, lod=lod, sag=0.05, r_break=(D + 1.8) / 2 * 0.62,
                                corner_lift=0.0, th=0.55, mat='thatch', col=(1.0, 0.95, 0.85), rafter=False,
                                tsuma_mat='planks', under_col=tint('planks', C['wood_grey']))
        # faîtage de chaume lié (bambou)
        aabb(b, 'thatch', -W * 0.25, ytop - 0.1, -0.35, W * 0.25, ytop + 0.25, 0.35, col=(0.8, 0.75, 0.62), uvs=(1.5, 1.5))
        if lod <= 1:
            for k in range(5):
                x = -W * 0.22 + k * W * 0.11
                aabb(b, 'wood', x - 0.04, ytop + 0.2, -0.4, x + 0.04, ytop + 0.3, 0.4, col=tint('wood', C['wood_dark']), uvs=kit.UV_WOOD, grain=2)
        # arbre de la roue et palier
        wx, wy, wz = wheel_local
        cylinder(b, 'wood', (wx, wy, -D / 2 + 0.1), (wx, wy, wz + 0.7), 0.16, seg=8, caps=(False, True), col=tint('wood', C['wood_dark']))
        aabb(b, 'stone', wx - 0.4, -0.8, wz + 0.7, wx + 0.4, wy - 0.15, wz + 1.3, col=(0.85, 0.85, 0.82), uvs=(1.0, 1.0))
        aabb(b, 'stone', wx - 0.4, -0.8, wz - 1.3, wx + 0.4, wy - 0.15, wz - 0.7, col=(0.85, 0.85, 0.82), uvs=(1.0, 1.0))
        if lod <= 1:
            # meules et sacs visibles par la porte
            lathe(b, 'stone', [(0.0, FL), (0.6, FL), (0.6, FL + 0.25), (0.55, FL + 0.5), (0.0, FL + 0.5)], c=(0, 0, D / 2 - 1.8), seg=12, col=(0.85, 0.84, 0.8))
        b.anchor('anchor_wheel', V(wheel_local), 0.0, diameter=5.5, width=1.2, axis='x local du modèle de roue = axe z local du moulin')
        if lod == 0:
            b.anchor('light_mill', (0, FL + 1.8, D / 2 - 1.0), 0.0, color='#ffb060', intensity=0.6)
            b.anchor('anchor_sacks', (W / 2 - 1.0, FL, D / 2 + 0.5), 0.0, kind='sacs')
        return _finish(b, y1), ytop + 0.3

    b0, ytop = build(0)
    b1, _ = build(1)
    b2, _ = build(2)
    meta = dict(height=round(ytop, 2), colliders=[dict(x=0, z=0, w=W, d=D, y0=-0.5, y1=round(y1 + 0.2, 2))])
    return [b0, b1, b2], meta


def wheel(diameter=5.5, width=1.2, seed=52, n_buckets=24):
    """Roue à augets, axe = x local, origine au centre de l'axe. Tourner le nœud moulin-roue autour de x."""
    R = diameter / 2

    def build(lod):
        b = Builder(seed)
        col = tint('wood', C['wood_old'])
        dark = tint('wood', C['wood_dark'])
        seg = 32 if lod == 0 else (16 if lod == 1 else 10)
        for sx in (-1, 1):
            x = sx * width / 2
            pts = [V((x, R * math.cos(2 * math.pi * i / seg), R * math.sin(2 * math.pi * i / seg))) for i in range(seg + 1)]
            from .geom import sweep_rect
            sweep_rect(b, 'wood', pts, 0.1, 0.22, up=X, col=col, caps=(False, False))
            pts2 = [V((x, (R * 0.55) * math.cos(2 * math.pi * i / seg), (R * 0.55) * math.sin(2 * math.pi * i / seg))) for i in range(seg + 1)]
            if lod <= 1:
                sweep_rect(b, 'wood', pts2, 0.08, 0.14, up=X, col=col, caps=(False, False))
            ns = 8 if lod <= 1 else 4
            for k in range(ns):
                a = math.pi * k / ns
                d = V((0, math.cos(a), math.sin(a)))
                beam(b, 'wood', V((x, 0, 0)) - d * (R - 0.05), V((x, 0, 0)) + d * (R - 0.05), 0.1, 0.12, up=X, col=dark)
        cylinder(b, 'wood', (-width / 2 - 0.5, 0, 0), (width / 2 + 0.3, 0, 0), 0.17, seg=10 if lod == 0 else 6, caps=(True, True), col=dark)
        nb = n_buckets if lod <= 1 else 12
        for k in range(nb):
            a = 2 * math.pi * k / nb
            d = V((0, math.cos(a), math.sin(a)))
            t = V((0, -math.sin(a), math.cos(a)))
            c = d * (R - 0.18)
            # auget : planche de fond + planche radiale
            box(b, 'planks', c, (width, 0.04, 0.36), None if False else _frame(d, t), col=jitter(col, b.rng, 0.06), uvs=(1.2, 1.2))
            if lod == 0:
                box(b, 'planks', c + t * 0.16 + d * 0.05, (width, 0.3, 0.035), _frame(d, t), col=col, uvs=(1.2, 1.2))
        return b

    b0, b1, b2 = build(0), build(1), build(2)
    meta = dict(height=diameter, colliders=[])
    return [b0, b1, b2], meta


def _frame(d, t):
    from mathutils import Matrix
    return Matrix((X, d, t)).transposed()
