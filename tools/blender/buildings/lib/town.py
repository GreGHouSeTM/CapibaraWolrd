"""Machiya (échoppes) et minka (maisons) : 3 variantes chacune, paramétrées par l'emprise w × d et le nombre de niveaux.

Machiya (ridge parallèle à la rue, avant-toit côté rue, pignons mitoyens à faible débord) :
  a : boutique à grilles koshi, étage bas (tsushi-2kai) à fenêtres mushiko enduites, auvent hisashi ;
  b : boutique ouverte sur deux travées avec estrades, étage plein à shōji et balcon à balustres ;
  c : façade à koshi et porte centrale, murs coupe-feu udatsu en saillie, étage enduit à fenêtres koshi.
Minka (maison d'habitation, 1 niveau + combles, ou 2 niveaux) :
  a : engawa en façade avec shōji et amado, entrée à porte de bois, toit kirizuma ;
  b : engawa sur le côté, lambris bas + enduit d'argile, toit irimoya ;
  c : pignon sur rue (tsuma-iri), bois brûlé noir (yakisugi) en soubassement, auvent sur toute la façade.
"""
import math
import random
from mathutils import Vector as V
from .geom import Builder, X, Y, Z, aabb, box, quad, poly, beam, post, tint, jitter, affine, rot_y, hexlin
from . import kit
from .kit import FL, POST, Pal
from .roof import gable_roof, hip_roof, pent_roof, roof_under, KAWARA
from .materials import C

PLASTERS = ['plaster_cream', 'plaster_white', 'plaster_ochre', 'plaster_clay']
WOODS = ['wood_dark', 'wood_mid', 'wood_old']


def _pal(rng, kind):
    if kind == 'machiya':
        pl = rng.choice(['plaster_cream', 'plaster_white', 'plaster_ochre'])
    else:
        pl = rng.choice(['plaster_clay', 'plaster_ochre', 'plaster_cream', 'plaster_clay'])
    wd = rng.choice(WOODS)
    board = rng.choice(['wood_mid', 'wood_dark', 'wood_grey'])
    return Pal(wood=wd, plaster=pl, board=board)


def _kawara_col(rng):
    k = rng.uniform(0.9, 1.06)
    warm = rng.uniform(-0.04, 0.04)
    return (k * (1 + warm), k, k * (1 - warm))


def _bays(L, mod=1.82):
    n = max(2, round(L / mod))
    return n


def _flip(bays, rng):
    return list(reversed(bays)) if rng.random() < 0.5 else bays


def infill(b, pal, side, VW, VD, off, slopes, y_base, lod, timber=True):
    """Pignon ou fermeture de combles sur le côté `side` du volume (VW × VD centré en off), jusqu'à la sous-face du toit."""
    M, L = kit.wall_frame(side, VW, VD)

    def ry(x):
        p = M @ V((x, 0, 0))
        return roof_under(slopes, p.x + off[0], p.z + off[1], default=y_base) - 0.04

    with b.at(affine(None, (off[0], 0, off[1]))):
        kit.gable_infill(b, pal, side, VW, VD, y_base, ry, lod, timber=timber)


def _finish(b, eave_y):
    b.weather(ground=0.0, eave_y=eave_y)
    return b


# ====================================================================== LOD2 (boîte texturée)
def lod2_body(b, pal, W, D, y_top, roof, kcol, lower_h=None, front_dark=True):
    kit.plinth(b, -W / 2, -D / 2, W / 2, D / 2, lod=2, y0=-0.6)
    lh = lower_h if lower_h else min(2.4, y_top - FL)
    for side in ('front', 'back', 'left', 'right'):
        M, L = kit.wall_frame(side, W, D)
        with b.at(M):
            if front_dark and side == 'front':
                quad(b, 'planks', (-0.075, FL - 0.12, 0.075), (L + 0.075, FL - 0.12, 0.075), (L + 0.075, FL + lh, 0.075), (-0.075, FL + lh, 0.075), pal.board, (1.2, 1.2), out=Z)
                quad(b, 'plaster', (-0.075, FL + lh, 0.075), (L + 0.075, FL + lh, 0.075), (L + 0.075, y_top + 0.2, 0.075), (-0.075, y_top + 0.2, 0.075), pal.plaster, (2.4, 2.4), out=Z)
            else:
                quad(b, 'plaster', (-0.075, FL - 0.12, 0.075), (L + 0.075, FL - 0.12, 0.075), (L + 0.075, y_top + 0.2, 0.075), (-0.075, y_top + 0.2, 0.075), pal.plaster, (2.4, 2.4), out=Z)
    return roof(2)


# ====================================================================== MACHIYA
def machiya(W, D, floors=2, variant='a', seed=1):
    rng = random.Random(seed)
    pal = _pal(rng, 'machiya')
    kcol = _kawara_col(rng)
    h1 = 3.0
    y1 = FL + h1                      # dessus du rez-de-chaussée (poutre d'étage)
    h2 = {'a': 2.0, 'b': 2.55, 'c': 2.3}[variant]
    y2 = y1 + 0.2 + h2 if floors >= 2 else y1
    yw = y2 + 0.2                     # dessus de sablière haute
    ov = 1.05
    nf = _bays(W - POST)
    ns = _bays(D - POST)
    layouts = {
        'a': ['door', 'koshi', 'koshi', 'shop'],
        'b': ['shop', 'shop', 'door', 'koshi'],
        'c': ['koshi', 'door', 'shop', 'koshi'],
    }
    lay = layouts[variant]
    front = [lay[i % len(lay)] if i < len(lay) else 'koshi' for i in range(nf)]
    if nf == 5:
        front = front[:2] + ['koshi'] + front[2:4]
    front = _flip(front, rng)
    lintel = FL + 2.05
    anchors_extra = []

    def roof_fn(lod, b):
        return gable_roof(b, W, D, yw, pitch=0.5, ov=ov, ovg=0.32, lod=lod, sag=0.18, oni=0.6, col=kcol)

    def build(lod):
        b = Builder(seed)
        bays_front = []
        for f in front:
            opt = {}
            if f == 'shop':
                opt = {'depth': 1.6, 'bench': True}
            if f == 'door':
                opt = {'open': 0.35}
            bays_front.append((1, f, dict(opt, top=lintel, ranma=True)))
        kit.plinth(b, -W / 2, -D / 2, W / 2, D / 2, lod=lod)
        kit.wall(b, pal, 'front', W, D, FL, y1, bays_front, lod, lintel=lintel)
        side_bays = [(1, 'boards_plaster', {'h': 1.0})] * ns
        kit.wall(b, pal, 'left', W, D, FL, y1, side_bays, lod)
        kit.wall(b, pal, 'right', W, D, FL, y1, side_bays, lod)
        back = ['plaster'] * nf
        back[1 % nf] = 'shoji'
        back[-1] = 'amado'
        kit.wall(b, pal, 'back', W, D, FL, y1, [(1, f, {'koshi_h': 0.3}) for f in back], lod)
        # étage
        if floors >= 2:
            yb = y1 + 0.2
            if variant == 'a':
                up = ['plaster'] + ['mushiko'] * (nf - 2) + ['plaster']
                kit.wall(b, pal, 'front', W, D, yb, y2, [(1, f, None) for f in up], lod, nuki=False)
            elif variant == 'b':
                kit.wall(b, pal, 'front', W, D, yb, y2, [(1, 'shoji', {'koshi_h': 0.35, 'top': y2 - 0.35})] * nf, lod)
            else:
                up = ['plaster'] + ['window'] * (nf - 2) + ['plaster']
                kit.wall(b, pal, 'front', W, D, yb, y2, [(1, f, {'wy0': yb + 0.7, 'wy1': yb + 1.7}) for f in up], lod)
            kit.wall(b, pal, 'left', W, D, yb, y2, [(1, 'plaster', None)] * ns, lod)
            kit.wall(b, pal, 'right', W, D, yb, y2, [(1, 'plaster', None)] * ns, lod)
            bk = ['plaster'] * nf
            bk[nf // 2] = 'window'
            kit.wall(b, pal, 'back', W, D, yb, y2, [(1, f, {'kind': 'shoji'}) for f in bk], lod)
            # auvent d'étage (hisashi) sur la rue et à l'arrière
            pent_roof(b, -W / 2 - 0.1, W / 2 + 0.1, y1 + 0.55, 1.0, pitch=0.38, lod=lod, z_wall=D / 2, col=kcol,
                      brackets=[-W / 2 + 0.1 + (W - 0.2) * i / nf for i in range(nf + 1)])
            pent_roof_back(b, W, D, y1 + 0.45, lod, kcol)
            if variant == 'b':
                # balcon à balustres devant les shōji
                kit.floor_deck(b, pal, -W / 2 + 0.1, D / 2, W / 2 - 0.1, D / 2 + 0.55, y1 + 0.62, along='x')
                with b.at(affine(None, (0, 0, D / 2))):
                    kit.railing(b, pal, -W / 2 + 0.1, W / 2 - 0.1, y1 + 0.62, h=0.75, z=0.5, lod=lod)
            if variant == 'c':
                for s in (-1, 1):
                    kit.udatsu(b, pal, s * (W / 2 - 0.15), D / 2 - 1.2, D / 2 + 0.55, y1 + 0.2, y2 + 0.35, lod)
        else:
            # échoppe à un niveau : auvent au-dessus de la boutique
            pent_roof(b, -W / 2 - 0.1, W / 2 + 0.1, lintel + 0.55, 0.8, pitch=0.35, lod=lod, z_wall=D / 2, col=kcol)
        slopes, ytop = roof_fn(lod, b)
        fr = slopes[0]

        for side in ('left', 'right'):
            infill(b, pal, side, W, D, (0, 0), slopes, yw, lod)
        # gouttière et chaînes de pluie côté rue
        ze = D / 2 + ov - 0.12
        ye = fr.point(0, 0).y - fr.th - 0.08
        kit.gutter(b, -W / 2 + 0.1, W / 2 - 0.1, ye, ze, lod)
        for s in (-1, 1):
            kit.rain_chain(b, s * (W / 2 - 0.35), ze, ye, 0.1, lod)
        # marche devant la porte
        for i, f in enumerate(front):
            if f == 'door':
                x = -W / 2 + POST / 2 + (W - POST) * (i + 0.5) / nf
                kit.steps(b, x, D / 2 + 0.04, 1.3, 1, rise=0.2, run=0.4, lod=lod)
        # accroches : lanternes sous l'auvent, enseignes, lumières d'étage, fumée de cuisine
        if lod == 0:
            zl = D / 2 + 0.55
            for i, f in enumerate(front):
                x = -W / 2 + POST / 2 + (W - POST) * i / nf
                if f in ('door', 'shop'):
                    b.anchor('anchor_lantern', (x + 0.25, lintel + 0.35, zl), 0.0, kind='chochin')
            b.anchor('anchor_kanban', (0, (y1 + 0.55 + y2) / 2 + 0.25 if floors >= 2 else lintel + 0.85, D / 2 + 0.12), 0.0, w=2.2, h=0.6, kind='horizontal')
            b.anchor('anchor_kanban', (W / 2 - 0.25, lintel - 0.6, D / 2 + 0.6), 0.0, w=0.45, h=1.6, kind='vertical')
            if floors >= 2:
                b.anchor('light_room', (0, y1 + 1.5, D / 2 - 1.2), 0.0, color='#ffb868', intensity=0.8)
            b.anchor('smoke_kitchen', (W * 0.25, ytop + 0.1, -D / 4), 0.0)
        return _finish(b, yw), ytop

    lods = []
    b0, ytop = build(0)
    b1, _ = build(1)
    b2 = Builder(seed)
    lod2_body(b2, pal, W, D, y2, lambda l: roof_fn(l, b2), kcol)
    if floors >= 2:
        pent_roof(b2, -W / 2 - 0.1, W / 2 + 0.1, y1 + 0.55, 1.0, pitch=0.38, lod=2, z_wall=D / 2, col=kcol, ends=False)
    _finish(b2, yw)
    meta = dict(height=round(ytop, 2), colliders=[dict(x=0, z=0, w=W, d=D, y0=-0.5, y1=round(yw, 2))])
    return [b0, b1, b2], meta


def pent_roof_back(b, W, D, y, lod, kcol):
    from .geom import rot_y
    with b.at(affine(rot_y(math.pi))):
        pent_roof(b, -W / 2 - 0.1, W / 2 + 0.1, y, 0.75, pitch=0.38, lod=lod, z_wall=D / 2, col=kcol, ends=True)


# ====================================================================== MINKA
def minka(W, D, floors=1, variant='a', seed=1):
    rng = random.Random(seed)
    pal = _pal(rng, 'minka')
    kcol = _kawara_col(rng)
    hw = 2.75
    y1 = FL + hw
    y2 = y1 + 0.2 + 2.2 if floors >= 2 else y1
    yw = y2 + 0.2
    ov = 1.0
    eng = 0.95                         # profondeur de l'engawa
    ridge_z = variant == 'c'

    if variant == 'a':
        vol = (-W / 2, -D / 2, W / 2, D / 2 - eng)     # x0, z0, x1, z1 du volume clos
    elif variant == 'b':
        vol = (-W / 2, -D / 2, W / 2 - eng, D / 2)
    else:
        vol = (-W / 2, -D / 2, W / 2, D / 2)
    vx0, vz0, vx1, vz1 = vol
    VW, VD = vx1 - vx0, vz1 - vz0
    vc = ((vx0 + vx1) / 2, (vz0 + vz1) / 2)
    nf = _bays(VW - POST)
    ns = _bays(VD - POST)
    mirror = rng.random() < 0.5

    def roof(lod, b):
        if variant == 'b':
            return hip_roof(b, W, D, yw, pitch=0.5, ov=ov, lod=lod, r_break=(D + 2 * ov) / 2 * 0.5, corner_lift=0.18,
                            oni=0.5, col=kcol)
        return gable_roof(b, W, D, yw, pitch=0.56, ov=ov, ovg=0.65, lod=lod, sag=0.15, oni=0.55, col=kcol,
                          ridge_axis='z' if ridge_z else 'x')

    def build(lod):
        b = Builder(seed)
        kit.plinth(b, vx0, vz0, vx1, vz1, lod=lod)
        with b.at(affine(None, (vc[0], 0, vc[1]))):
            if variant == 'a':
                fb = ['door'] + ['shoji'] * (nf - 2) + ['amado']
                if nf >= 4:
                    fb[1] = 'window'
            elif variant == 'b':
                fb = ['window', 'door'] + ['boards_plaster'] * (nf - 2)
                if nf >= 4:
                    fb[-1] = 'window'
            else:
                fb = ['boards_plaster', 'door'] + ['window'] * (nf - 3) + ['boards_plaster']
            if mirror:
                fb.reverse()
            fopts = {'door': {'open': 0.0}, 'shoji': {'koshi_h': 0.3}, 'window': {'kind': 'koshi'},
                     'boards_plaster': {'h': 1.1, 'black': variant == 'c'}}
            kit.wall(b, pal, 'front', VW, VD, FL, y1, [(1, f, fopts.get(f)) for f in fb], lod, lintel=FL + 1.85)
            if variant == 'b':
                rb = ['shoji'] * (ns - 1) + ['amado']
                kit.wall(b, pal, 'right', VW, VD, FL, y1, [(1, f, {'koshi_h': 0.3}) for f in rb], lod, lintel=FL + 1.85)
            else:
                sb = ['boards_plaster'] * ns
                sb[ns // 2] = 'window'
                kit.wall(b, pal, 'right', VW, VD, FL, y1, [(1, f, {'h': 1.0, 'black': variant == 'c'}) for f in sb], lod)
            lb = ['boards_plaster'] * ns
            if ns >= 3:
                lb[1] = 'window'
            kit.wall(b, pal, 'left', VW, VD, FL, y1, [(1, f, {'h': 1.0, 'black': variant == 'c', 'kind': 'shoji'}) for f in lb], lod)
            bk = ['plaster'] * nf
            bk[0] = 'window'
            bk[-2 if nf > 2 else -1] = 'shoji'
            kit.wall(b, pal, 'back', VW, VD, FL, y1, [(1, f, {'kind': 'koshi'}) for f in bk], lod)
            if floors >= 2:
                yb = y1 + 0.2
                up = ['plaster'] + ['shoji'] * (nf - 2) + ['plaster']
                kit.wall(b, pal, 'front', VW, VD, yb, y2, [(1, f, {'koshi_h': 0.3, 'top': y2 - 0.3}) for f in up], lod)
                kit.wall(b, pal, 'left', VW, VD, yb, y2, [(1, 'plaster', None)] * ns, lod)
                kit.wall(b, pal, 'right', VW, VD, yb, y2, [(1, 'plaster', None)] * ns, lod)
                bk2 = ['plaster'] * nf
                bk2[nf // 2] = 'window'
                kit.wall(b, pal, 'back', VW, VD, yb, y2, [(1, f, {'kind': 'shoji'}) for f in bk2], lod)
        # engawa + poteaux de rive
        colw = pal.wood
        if variant == 'a':
            kit.engawa(b, pal, -W / 2 + 0.08, W / 2 - 0.08, vz1 + 0.08, D / 2 - 0.02, FL, lod)
            n = nf
            for i in range(n + 1):
                x = -W / 2 + POST / 2 + (W - POST) * i / n
                post(b, 'wood', x, D / 2 - POST / 2, 0.15, y1, POST, col=jitter(colw, b.rng), chamfer=0.02 if lod == 0 else 0)
            aabb(b, 'wood', -W / 2, y1, D / 2 - 0.17, W / 2, y1 + 0.2, D / 2 + 0.01, col=colw, uvs=kit.UV_WOOD, grain=0)
            # pierre de déchaussage devant la porte
            idx = (nf - 1) if mirror else 0
            xd = vx0 + POST / 2 + (VW - POST) * (idx + 0.5) / nf
            kit.steps(b, xd, D / 2, 1.0, 1, rise=0.25, run=0.45, lod=lod)
        elif variant == 'b':
            with b.at(affine(rot_y(math.pi / 2))):
                # repère tourné : la rive de l'engawa (côté +x du bâtiment) devient +z
                kit.engawa(b, pal, -D / 2 + 0.08, D / 2 - 0.08, vx1 + 0.08, W / 2 - 0.02, FL, lod)
            for i in range(ns + 1):
                z = -D / 2 + POST / 2 + (D - POST) * i / ns
                post(b, 'wood', W / 2 - POST / 2, z, 0.15, y1, POST, col=jitter(colw, b.rng), chamfer=0.02 if lod == 0 else 0)
            aabb(b, 'wood', W / 2 - 0.17, y1, -D / 2, W / 2 + 0.01, y1 + 0.2, D / 2, col=colw, uvs=kit.UV_WOOD, grain=2)
            xd = vx0 + POST / 2 + (VW - POST) * ((nf - 2 if mirror else 1) + 0.5) / nf
            kit.steps(b, xd, D / 2 + 0.04, 1.2, 2, rise=0.17, run=0.3, lod=lod)
        else:
            xd = vx0 + POST / 2 + (VW - POST) * ((nf - 2 if mirror else 1) + 0.5) / nf
            kit.steps(b, xd, D / 2 + 0.04, 1.2, 2, rise=0.17, run=0.3, lod=lod)
            pent_roof(b, -W / 2 - 0.15, W / 2 + 0.15, FL + 2.75, 0.95, pitch=0.36, lod=lod, z_wall=D / 2, col=kcol,
                      brackets=[-W / 2 + 0.1 + (W - 0.2) * i / nf for i in range(nf + 1)])
        if floors >= 2 and variant != 'c':
            pent_roof(b, -W / 2 - 0.1, W / 2 + 0.1, y1 + 0.55, 1.0 if variant != 'a' else 0.6, pitch=0.38, lod=lod,
                      z_wall=D / 2 - (eng if variant == 'a' else 0), col=kcol)
        slopes, ytop = roof(lod, b)
        fr = slopes[0]
        # pignons et fermetures des combles au-dessus des engawa
        gables = {'a': ('left', 'right'), 'b': (), 'c': ('front', 'back')}[variant]
        for side in gables:
            infill(b, pal, side, VW, VD, vc, slopes, yw, lod)
        if variant == 'a':
            infill(b, pal, 'front', VW, VD, vc, slopes, yw, lod, timber=False)
        if variant == 'b':
            infill(b, pal, 'right', VW, VD, vc, slopes, yw, lod, timber=False)
        # chaînes de pluie aux angles avant
        ze = D / 2 + ov - 0.12
        ye = fr.point(0, 0).y - fr.th - 0.08
        if not ridge_z:
            kit.gutter(b, -W / 2 + 0.1, W / 2 - 0.1, ye, ze, lod)
            kit.rain_chain(b, (W / 2 - 0.4) * (1 if mirror else -1), ze, ye, 0.1, lod)
        if lod == 0:
            b.anchor('anchor_lantern', (xd + 0.75, FL + 2.2, D / 2 + 0.35), 0.0, kind='andon' if variant == 'a' else 'chochin')
            b.anchor('anchor_nameplate', (xd - 0.75, FL + 1.5, (vz1 if variant == 'a' else D / 2) + 0.1), 0.0)
            b.anchor('light_room', (vc[0], FL + 1.4, vc[1] + VD / 2 - 1.0), 0.0, color='#ffb868', intensity=0.8)
            b.anchor('smoke_hearth', (0, ytop + 0.1, 0), 0.0)
        return _finish(b, yw), ytop, xd

    b0, ytop, _ = build(0)
    b1, _, _ = build(1)
    b2 = Builder(seed)
    with b2.at(affine(None, (vc[0], 0, vc[1]))):
        kit.plinth(b2, -VW / 2, -VD / 2, VW / 2, VD / 2, lod=2, y0=-0.6)
        for side in ('front', 'back', 'left', 'right'):
            M, L = kit.wall_frame(side, VW, VD)
            with b2.at(M):
                quad(b2, 'plaster', (-0.075, FL - 0.12, 0.075), (L + 0.075, FL - 0.12, 0.075), (L + 0.075, y2 + 0.2, 0.075),
                     (-0.075, y2 + 0.2, 0.075), pal.plaster, (2.4, 2.4), out=Z)
    roof(2, b2)
    _finish(b2, yw)
    meta = dict(height=round(ytop, 2), colliders=[dict(x=round(vc[0], 2), z=round(vc[1], 2), w=round(VW, 2), d=round(VD, 2), y0=-0.5, y1=round(yw, 2))]
                + ([dict(x=0, z=round(D / 2 - eng / 2, 2), w=W, d=eng, y0=-0.5, y1=FL, walk=True)] if variant == 'a' else [])
                + ([dict(x=round(W / 2 - eng / 2, 2), z=0, w=eng, d=D, y0=-0.5, y1=FL, walk=True)] if variant == 'b' else []))
    return [b0, b1, b2], meta
