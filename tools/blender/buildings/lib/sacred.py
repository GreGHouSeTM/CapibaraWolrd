"""Colline sacrée : pagode rouge à cinq étages, oratoire (haiden), sanctuaire principal (honden), fontaine aux ablutions
(temizuya), pavillon de la cloche (shōrō) et torii (myōjin, shinmei).

Bois laqué vermillon = matière 'lacquer' (teinte par sommet), enduit blanc, toits de tuiles (pagode, shōrō)
ou de cuivre vert-de-gris (haiden, honden, temizuya), ferrures et flèche en bronze ('metal').
"""
import math
from mathutils import Vector as V
from .geom import (Builder, Part, X, Y, Z, aabb, box, quad, poly, beam, post, tube, cylinder, disc, prism, sweep_rect,
                   lathe, tint, jitter, affine, rot_y, frame)
from . import kit
from .kit import Pal, POST
from .roof import gable_roof, hip_roof, pent_roof, roof_under, KAWARA
from .materials import C

RED = tint('lacquer', C['lacquer_red'])
BLACK = tint('wood', C['lacquer_black'])
OCHRE = tint('lacquer', C['ochre'])
WHITE = tint('plaster', C['plaster_white'])
COPPER = (1.0, 1.0, 1.0)
BRONZE = (1.0, 0.95, 0.85)


def lacquerize(b):
    """Le bois de structure de ces bâtiments est laqué : on bascule la partie 'wood' vers la matière 'lacquer'."""
    if 'wood' not in b.parts:
        return b
    w = b.parts.pop('wood')
    q = b.parts.setdefault('lacquer', Part())
    base = len(q.co)
    q.co.extend(w.co)
    q.faces.extend(tuple(i + base for i in f) for f in w.faces)
    q.uv.extend(w.uv)
    q.col.extend(w.col)
    q.sm.extend(w.sm)
    return b


def red_pal():
    p = Pal()
    p.wood = p.wood2 = p.light = RED
    p.plaster = WHITE
    p.board = tint('planks', '#7c2e22')
    return p


def _finish(b, eave_y=None, lac=True):
    if lac:
        lacquerize(b)
    b.weather(ground=0.0, eave_y=eave_y, skip=('paper_shoji', 'interior', 'metal', 'water'))
    return b


# ====================================================================== PAGODE
def _brackets(b, bw, yw, lod, h=0.55, proj=1.0):
    """Consoles (tokyō) sous l'avant-toit : poutres en encorbellement + blocs, bandes d'enduit blanc."""
    for side in ('front', 'back', 'left', 'right'):
        M, L = kit.wall_frame(side, bw, bw)
        with b.at(M):
            quad(b, 'plaster', (-0.1, yw, 0.05), (L + 0.1, yw, 0.05), (L + 0.1, yw + h, 0.05), (-0.1, yw + h, 0.05), WHITE, (2.4, 2.4), out=Z)
            for k, (dz, dy, hh, c) in enumerate(((0.12, 0.0, 0.16, RED), (0.36, 0.2, 0.14, OCHRE), (0.62, 0.38, 0.16, RED))):
                dz *= proj
                aabb(b, 'wood', -0.35 - dz * 0.5, yw + dy, dz - 0.1, L + 0.35 + dz * 0.5, yw + dy + hh, dz + 0.1, col=c, uvs=kit.UV_WOOD, grain=0)
            if lod == 0:
                for x in (0.0, L / 3, 2 * L / 3, L):
                    aabb(b, 'wood', x - 0.1, yw + 0.02, -0.05, x + 0.1, yw + 0.5, 0.85 * proj, col=RED, uvs=kit.UV_WOOD, grain=2, skip=('-z',))
                    for dz in (0.35 * proj, 0.8 * proj):
                        aabb(b, 'wood', x - 0.13, yw + 0.5 - (0.8 - dz) * 0.3, dz - 0.1, x + 0.13, yw + 0.6 - (0.8 - dz) * 0.3, dz + 0.1, col=OCHRE, uvs=kit.UV_WOOD)


def _bells(b, slopes, lod):
    if lod > 0:
        return
    for sl in slopes[:2]:
        for s in (-1, 1):
            p = sl.point(s * sl.hw(0), 0, -sl.th)
            cylinder(b, 'metal', p - Y * 0.05, p - Y * 0.4, 0.06, seg=6, caps=(True, True))
            b.anchor('anchor_bell', p - Y * 0.42, 0.0, kind='futaku')


def _spire(b, y0, lod):
    """Flèche de bronze (sōrin) : socle, coupe, 9 anneaux, flamme et joyau ; ≈ 7 m."""
    seg = 12 if lod == 0 else 6
    aabb(b, 'metal', -0.55, y0 - 0.2, -0.55, 0.55, y0 + 0.35, 0.55, col=BRONZE)
    lathe(b, 'metal', [(0.5, y0 + 0.35), (0.55, y0 + 0.5), (0.48, y0 + 0.72), (0.12, y0 + 0.82)], seg=seg, col=BRONZE)
    cylinder(b, 'metal', (0, y0 + 0.8, 0), (0, y0 + 6.3, 0), 0.08, seg=6, caps=(False, True), col=BRONZE)
    for i in range(9):
        y = y0 + 1.05 + i * 0.5
        r = 0.62 - i * 0.022
        if lod == 0:
            lathe(b, 'metal', [(0.09, y), (r, y + 0.03), (r, y + 0.09), (0.09, y + 0.12)], seg=seg, col=BRONZE)
        else:
            lathe(b, 'metal', [(r, y), (r, y + 0.12)], seg=seg, col=BRONZE)
    yf = y0 + 5.6
    fl = [(-0.05, 0), (0.05, 0), (0.32, 0.3), (0.22, 0.55), (0.36, 0.8), (0.0, 1.05), (-0.36, 0.8), (-0.22, 0.55), (-0.32, 0.3)]
    for ang in (0, math.pi / 2):
        A = V((math.cos(ang), 0, math.sin(ang)))
        prism(b, 'metal', fl, V((0, yf, 0)) - V((-math.sin(ang), 0, math.cos(ang))) * 0.015, A, Y, V((-math.sin(ang), 0, math.cos(ang))) * 0.03, BRONZE)
    lathe(b, 'metal', [(0.0, yf + 1.0), (0.14, yf + 1.08), (0.17, yf + 1.2), (0.1, yf + 1.33), (0.0, yf + 1.42)], seg=seg, col=BRONZE)
    return yf + 1.42


def pagoda(W=8.0, seed=11):
    tiers = 5
    widths = [W - 0.8 * i for i in range(tiers)]
    ov = 2.2

    def build(lod):
        b = Builder(seed)
        pal = red_pal()
        kit.plinth(b, -5, -5, 5, 5, y1=1.0, y0=-1.2, batter=0.08, lod=lod)
        kit.steps(b, 0, 5.0, 2.6, 4, rise=0.2, run=0.34, y_top=0.8, lod=lod)
        y = 1.0
        ytop = 0
        for i, bw in enumerate(widths):
            hwall = 3.0 if i == 0 else 2.15
            if lod <= 1:
                lf = 'koshi' if i == 0 else 'plaster'
                bays = [(1, lf, {'top': y + hwall - 0.4}), (1.25, 'itado', {'top': y + hwall - 0.35}), (1, lf, {'top': y + hwall - 0.4})]
                for side in ('front', 'back', 'left', 'right'):
                    kit.wall(b, pal, side, bw, bw, y, y + hwall, bays, lod, nuki=False)
            else:
                for side in ('front', 'back', 'left', 'right'):
                    M, L = kit.wall_frame(side, bw, bw)
                    with b.at(M):
                        quad(b, 'planks', (-0.08, y, 0.075), (L + 0.08, y, 0.075), (L + 0.08, y + hwall, 0.075), (-0.08, y + hwall, 0.075), pal.board, (1.2, 1.2), out=Z)
            yw = y + hwall + 0.2
            _brackets(b, bw, yw, lod)
            last = i == tiers - 1
            nxt = widths[i + 1] if not last else 0
            rtop = ov + (bw - nxt) / 2 + 0.3
            slopes, yt = hip_roof(b, bw, bw, yw + 0.55, pitch=0.3, ov=ov, lod=lod, sag=0.12, corner_lift=0.8, Ld=3.0, th=0.2,
                                  skirt=not last, R_top=None if last else rtop, oni=0.42, mat='kawara', cover_nr=4,
                                  rafter_mat='wood', rafter_col=RED, under_col=tint('planks', '#8a3528'))
            _bells(b, slopes, lod)
            if not last:
                y = slopes[0].point(0, ov + (bw - nxt) / 2).y + 0.05
                if lod <= 1:
                    # balcon (koran) autour de l'étage suivant
                    e = nxt / 2 + 0.55
                    for side in ('front', 'back', 'left', 'right'):
                        M, L = kit.wall_frame(side, nxt + 1.1, nxt + 1.1)
                        with b.at(M):
                            aabb(b, 'planks', -0.08, y - 0.05, -0.08, L + 0.08, y + 0.05, 0.6, col=pal.board, uvs=kit.UV_PLANKS, grain=0)
                            aabb(b, 'wood', -0.08, y - 0.3, 0.45, L + 0.08, y - 0.05, 0.6, col=RED, uvs=kit.UV_WOOD, grain=0)
                            kit.railing(b, pal, 0, L, y + 0.05, h=0.7, z=0.5, lod=lod, baluster=0.35)
            else:
                ytop = _spire(b, slopes[0].point(0, slopes[0].R).y + 0.1, lod)
            if lod == 0:
                b.anchor('light_tier', (0, y + 1.2, bw / 2 + 0.2), 0.0, color='#ffb060', intensity=0.6)
        if lod == 0:
            for s in (-1, 1):
                b.anchor('anchor_lantern', (s * 3.2, 1.0, 4.6), 0.0, kind='toro')
        return _finish(b), ytop

    b0, ytop = build(0)
    b1, _ = build(1)
    b2, _ = build(2)
    meta = dict(height=round(ytop, 2), colliders=[dict(x=0, z=0, w=10, d=10, y0=-1.2, y1=1.0, walk=True), dict(x=0, z=0, w=W, d=W, y0=1.0, y1=round(ytop - 7, 2))])
    return [b0, b1, b2], meta


# ====================================================================== SANCTUAIRE
def _raised_hall(b, pal, W, D, y_floor, ver, lod, stairs_w=2.4, rail=True):
    """Socle d'un bâtiment de sanctuaire : plancher surélevé, coursive à garde-corps, poteaux sur pierres, escalier avant."""
    iw, idp = W - 2 * ver, D - 2 * ver
    kit.plinth(b, -iw / 2, -idp / 2, iw / 2, idp / 2, y1=y_floor - 0.25, y0=-0.9, lod=lod)
    kit.floor_deck(b, pal, -W / 2, -D / 2, W / 2, D / 2, y_floor, t=0.12, col=tint('planks', '#6a4a34'))
    aabb(b, 'wood', -W / 2, y_floor - 0.35, -D / 2, W / 2, y_floor - 0.12, D / 2, col=RED, uvs=kit.UV_WOOD, grain=0, skip=('+y', '-y'))
    if lod <= 1:
        n = max(2, round(W / 1.8))
        m = max(2, round(D / 1.8))
        pts = [(-W / 2 + 0.1 + (W - 0.2) * i / n, s * (D / 2 - 0.1)) for i in range(n + 1) for s in (-1, 1)]
        pts += [(s * (W / 2 - 0.1), -D / 2 + 0.1 + (D - 0.2) * j / m) for j in range(1, m) for s in (-1, 1)]
        for x, z in pts:
            aabb(b, 'wood', x - 0.08, 0.1, z - 0.08, x + 0.08, y_floor - 0.3, z + 0.08, col=RED, uvs=kit.UV_WOOD, skip=('-y',))
            if lod == 0:
                aabb(b, 'stone', x - 0.18, -0.2, z - 0.18, x + 0.18, 0.12, z + 0.18, col=(0.85, 0.85, 0.82), uvs=(0.8, 0.8), skip=('-y',))
    if rail:
        for side in ('front', 'back', 'left', 'right'):
            M, L = kit.wall_frame(side, W, D)
            with b.at(M):
                if side == 'front':
                    a = (L - stairs_w) / 2
                    kit.railing(b, pal, -0.05, a, y_floor, h=0.75, z=0.0, lod=lod, baluster=0.4)
                    kit.railing(b, pal, L - a, L + 0.05, y_floor, h=0.75, z=0.0, lod=lod, baluster=0.4)
                else:
                    kit.railing(b, pal, -0.05, L + 0.05, y_floor, h=0.75, z=0.0, lod=lod, baluster=0.4)
    # escalier de bois avant
    n = int(round(y_floor / 0.2))
    rise = y_floor / n
    for i in range(n):
        yt = y_floor - rise * (i + 1) + 0.02
        z0 = D / 2 + 0.3 * i
        aabb(b, 'planks', -stairs_w / 2, yt - 0.06, z0, stairs_w / 2, yt, z0 + 0.32, col=tint('planks', '#6a4a34'), uvs=kit.UV_PLANKS, grain=0)
    for s in (-1, 1):
        p0 = V((s * (stairs_w / 2 + 0.05), y_floor + 0.75, D / 2))
        p1 = V((s * (stairs_w / 2 + 0.05), 0.85, D / 2 + 0.3 * n))
        beam(b, 'wood', p0, p1, 0.07, 0.07, col=RED)
        beam(b, 'wood', V((p0.x, y_floor - 0.1, D / 2)), V((p1.x, 0.0, p1.z)), 0.08, 0.3, col=RED)
        aabb(b, 'wood', p1.x - 0.07, 0.0, p1.z - 0.07, p1.x + 0.07, 1.0, p1.z + 0.07, col=RED, uvs=kit.UV_WOOD)
    stone_step = D / 2 + 0.3 * n
    aabb(b, 'stone', -stairs_w / 2 - 0.2, -0.3, stone_step, stairs_w / 2 + 0.2, 0.05, stone_step + 0.5, col=(0.9, 0.88, 0.84), uvs=(1.4, 1.4), skip=('-y',))
    return stone_step + 0.5


def _shimenawa(b, x0, x1, y, z, lod, r=0.12):
    n = 10 if lod == 0 else 4
    pts = [V((x0 + (x1 - x0) * i / n, y - 0.22 * math.sin(math.pi * i / n), z)) for i in range(n + 1)]
    tube(b, 'thatch', pts, [r * (0.7 + 0.3 * math.sin(math.pi * i / n)) for i in range(n + 1)], seg=6 if lod == 0 else 4, col=(1.0, 0.95, 0.75), uvs=(0.4, 0.6), caps=(True, True))
    if lod == 0:
        for i in (2, 4, 6, 8):
            p = pts[i] - Y * 0.1
            zz = [(0, 0), (0.08, -0.12), (-0.02, -0.2), (0.08, -0.32), (-0.02, -0.42)]
            for k in range(len(zz) - 1):
                a, c = zz[k], zz[k + 1]
                quad(b, 'plaster', p + V((a[0], a[1], 0.02)), p + V((a[0] + 0.07, a[1], 0.02)), p + V((c[0] + 0.07, c[1], 0.02)), p + V((c[0], c[1], 0.02)),
                     WHITE, (1, 1), out=Z)


def haiden(W=10.0, D=8.0, seed=21):
    ver, yf = 1.0, 1.0

    def build(lod):
        b = Builder(seed)
        pal = red_pal()
        front = _raised_hall(b, pal, W, D, yf, ver, lod, stairs_w=2.6)
        iw, idp = W - 2 * ver, D - 2 * ver
        y1 = yf + 3.0
        with b.at(affine(None, (0, 0, 0))):
            kit.wall(b, pal, 'front', iw, idp, yf, y1, [(1, 'koshi', None), (1.4, 'open', {'depth': 1.5}), (1, 'koshi', None)], lod, lintel=yf + 2.3)
            for s in ('left', 'right'):
                kit.wall(b, pal, s, iw, idp, yf, y1, [(1, 'plaster', None), (1, 'koshi', None), (1, 'plaster', None)], lod, lintel=yf + 2.2)
            kit.wall(b, pal, 'back', iw, idp, yf, y1, [(1, 'plaster', None), (1, 'itado', None), (1, 'plaster', None)], lod, lintel=yf + 2.2)
        _brackets(b, iw, y1 + 0.2, lod, h=0.6, proj=0.6)
        slopes, ytop = hip_roof(b, iw, idp, y1 + 0.95, pitch=0.55, ov=ver + 0.95, lod=lod, sag=0.22, r_break=(idp + 2 * (ver + 0.95)) / 2 * 0.45,
                                corner_lift=0.35, Ld=2.2, mat='copper', rafter_col=RED, under_col=tint('planks', '#7a3a2a'),
                                tsuma_mat='planks', tsuma_col=tint('planks', '#5a3a2a'))
        # auvent d'escalier (kōhai) sur deux poteaux
        ye = roof_under(slopes, 0, D / 2 + 0.3, default=y1) - 0.05
        pent_roof(b, -1.8, 1.8, ye, 2.0, pitch=0.3, lod=lod, z_wall=D / 2 + 0.3, mat='copper', th=0.12, wood_col=RED)
        for s in (-1, 1):
            post(b, 'wood', s * 1.6, D / 2 + 2.1, 0.0, ye - 0.65, 0.2, col=RED, chamfer=0.03 if lod == 0 else 0)
            if lod == 0:
                aabb(b, 'stone', s * 1.6 - 0.25, -0.2, D / 2 + 1.85, s * 1.6 + 0.25, 0.12, D / 2 + 2.35, col=(0.85, 0.85, 0.82), uvs=(0.8, 0.8), skip=('-y',))
        beam(b, 'wood', (-1.75, ye - 0.65, D / 2 + 2.1), (1.75, ye - 0.65, D / 2 + 2.1), 0.2, 0.25, col=RED)
        # corde sacrée, cloche et boîte à offrandes
        _shimenawa(b, -1.5, 1.5, ye - 0.85, D / 2 + 2.0, lod)
        if lod <= 1:
            aabb(b, 'planks', -0.8, yf, D / 2 - 0.75, 0.8, yf + 0.65, D / 2 - 0.2, col=tint('planks', '#5c3d29'), uvs=kit.UV_PLANKS, grain=0)
            if lod == 0:
                for k in range(7):
                    x = -0.7 + k * 0.233
                    aabb(b, 'wood', x - 0.03, yf + 0.65, D / 2 - 0.73, x + 0.03, yf + 0.72, D / 2 - 0.22, col=BLACK, uvs=kit.UV_WOOD, grain=2)
            lathe(b, 'metal', [(0.02, ye - 1.0), (0.14, ye - 1.08), (0.18, ye - 1.22), (0.14, ye - 1.36), (0.03, ye - 1.42)], c=(0, 0, D / 2 + 1.0), seg=10, col=(1.0, 0.85, 0.5))
            tube(b, 'thatch', [(0, ye - 1.42, D / 2 + 1.0), (0.02, 0.9, D / 2 + 1.05)], 0.035, seg=5, col=(0.95, 0.35, 0.3))
        if lod == 0:
            b.anchor('anchor_guardian', (-2.2, 0.0, front + 0.8), math.pi / 2, kind='capybara-pierre')
            b.anchor('anchor_guardian', (2.2, 0.0, front + 0.8), -math.pi / 2, kind='capybara-pierre')
            for s in (-1, 1):
                b.anchor('anchor_lantern', (s * (iw / 2 + 0.4), y1 - 0.2, idp / 2 + 0.6), 0.0, kind='kasuga-bronze')
            b.anchor('light_hall', (0, yf + 1.4, idp / 2 - 1.0), 0.0, color='#ffb060', intensity=1.0)
        return _finish(b), ytop

    b0, ytop = build(0)
    b1, _ = build(1)
    b2, _ = build(2)
    meta = dict(height=round(ytop, 2), colliders=[dict(x=0, z=0, w=W, d=D, y0=-0.5, y1=yf, walk=True), dict(x=0, z=0, w=W - 2 * ver, d=D - 2 * ver, y0=yf, y1=yf + 3.2)])
    return [b0, b1, b2], meta


def _chigi(b, slopes, hw, ytop, lod, n_katsuo=3):
    """Chigi (planches croisées aux pignons) et katsuogi (rondins sur le faîtage)."""
    sl = slopes[0]
    for s in (-1, 1):
        x = s * (hw + 0.05)
        for zs in (-1, 1):
            p0 = sl.point(s * hw, sl.R * 0.55) if zs > 0 else slopes[1].point(-s * hw, slopes[1].R * 0.55)
            p0 = V((x, p0.y + 0.05, p0.z))
            top = V((x, ytop + 0.9, -zs * 0.5))
            beam(b, 'copper', p0, top, 0.07, 0.22, up=X, col=COPPER)
    if lod <= 1:
        for k in range(n_katsuo):
            xk = -hw * 0.6 + 1.2 * hw * k / max(1, n_katsuo - 1)
            cylinder(b, 'copper', (xk, ytop + 0.12, -0.45), (xk, ytop + 0.12, 0.45), 0.13, seg=8 if lod == 0 else 5, caps=(True, True), col=COPPER)


def honden(W=6.0, D=6.0, seed=22):
    ver, yf = 0.75, 1.2

    def build(lod):
        b = Builder(seed)
        pal = red_pal()
        _raised_hall(b, pal, W, D, yf, ver, lod, stairs_w=1.6)
        iw, idp = W - 2 * ver, D - 2 * ver
        y1 = yf + 2.6
        kit.wall(b, pal, 'front', iw, idp, yf, y1, [(1, 'plaster', None), (1.3, 'itado', None), (1, 'plaster', None)], lod, lintel=yf + 2.0)
        for s in ('left', 'right', 'back'):
            kit.wall(b, pal, s, iw, idp, yf, y1, [(1, 'plaster', None)] * 3, lod)
        slopes, ytop = gable_roof(b, iw, idp, y1 + 0.2, pitch=0.62, ov=ver + 0.8, ovg=ver + 0.5, lod=lod, sag=0.2, mat='copper',
                                  rafter_col=RED, hafu_col=RED, oni=0)
        kit.gable_infill(b, pal, 'left', iw, idp, y1 + 0.2, lambda x: roof_under(slopes, -iw / 2, -idp / 2 + x) - 0.04, lod)
        kit.gable_infill(b, pal, 'right', iw, idp, y1 + 0.2, lambda x: roof_under(slopes, iw / 2, idp / 2 - x) - 0.04, lod)
        _chigi(b, slopes, iw / 2 + ver + 0.5, ytop, lod)
        if lod == 0:
            b.anchor('light_hall', (0, yf + 1.2, 0), 0.0, color='#ffb060', intensity=0.6)
        return _finish(b), ytop + 0.9

    b0, ytop = build(0)
    b1, _ = build(1)
    b2, _ = build(2)
    meta = dict(height=round(ytop, 2), colliders=[dict(x=0, z=0, w=W, d=D, y0=-0.5, y1=round(yf + 2.8, 2))])
    return [b0, b1, b2], meta


def temizuya(W=3.0, D=2.0, seed=23):
    def build(lod):
        b = Builder(seed)
        aabb(b, 'stone', -W / 2 - 0.2, -0.4, -D / 2 - 0.2, W / 2 + 0.2, 0.12, D / 2 + 0.2, col=(0.85, 0.84, 0.8), uvs=(1.6, 1.6), skip=('-y',))
        for sx in (-1, 1):
            for sz in (-1, 1):
                post(b, 'wood', sx * (W / 2 - 0.15), sz * (D / 2 - 0.15), 0.12, 2.6, 0.18, col=RED, chamfer=0.025 if lod == 0 else 0)
        for sz in (-1, 1):
            aabb(b, 'wood', -W / 2, 2.6, sz * (D / 2 - 0.15) - 0.1, W / 2, 2.85, sz * (D / 2 - 0.15) + 0.1, col=RED, uvs=kit.UV_WOOD, grain=0)
            aabb(b, 'wood', -W / 2 + 0.05, 2.0, sz * (D / 2 - 0.15) - 0.06, W / 2 - 0.05, 2.12, sz * (D / 2 - 0.15) + 0.06, col=RED, uvs=kit.UV_WOOD, grain=0)
        for sx in (-1, 1):
            aabb(b, 'wood', sx * (W / 2 - 0.15) - 0.09, 2.6, -D / 2, sx * (W / 2 - 0.15) + 0.09, 2.85, D / 2, col=RED, uvs=kit.UV_WOOD, grain=2)
        slopes, ytop = gable_roof(b, W - 0.3, D - 0.3, 2.85, pitch=0.62, ov=0.55, ovg=0.45, lod=lod, sag=0.2, mat='copper',
                                  rafter_col=RED, hafu_col=RED, oni=0, ridge_layers=2)
        # vasque de pierre et eau
        bw, bd, bh = W * 0.62, D * 0.4, 0.75
        aabb(b, 'stone', -bw / 2, 0.12, -bd / 2, bw / 2, bh, bd / 2, col=(0.8, 0.8, 0.77), uvs=(1.2, 1.2), skip=('-y', '+y'))
        t = 0.1
        for (x0, z0, x1, z1) in ((-bw / 2, -bd / 2, bw / 2, -bd / 2 + t), (-bw / 2, bd / 2 - t, bw / 2, bd / 2),
                                 (-bw / 2, -bd / 2, -bw / 2 + t, bd / 2), (bw / 2 - t, -bd / 2, bw / 2, bd / 2)):
            quad(b, 'stone', (x0, bh, z1), (x1, bh, z1), (x1, bh, z0), (x0, bh, z0), (0.8, 0.8, 0.77), (1.2, 1.2), uax=X, vax=-Z, out=Y)
        quad(b, 'water', (-bw / 2 + t, bh - 0.06, bd / 2 - t), (bw / 2 - t, bh - 0.06, bd / 2 - t), (bw / 2 - t, bh - 0.06, -bd / 2 + t), (-bw / 2 + t, bh - 0.06, -bd / 2 + t), (1, 1, 1), out=Y)
        if lod <= 1:
            # bec de bambou (kakehi) qui alimente la vasque
            cylinder(b, 'wood', (bw / 2 + 0.05, 1.05, 0), (bw / 2 - 0.35, 0.98, 0), 0.04, seg=6, caps=(True, True), col=tint('wood', '#8a8a50'))
            aabb(b, 'wood', bw / 2 + 0.02, 0.12, -0.06, bw / 2 + 0.12, 1.1, 0.06, col=tint('wood', '#8a8a50'), uvs=kit.UV_WOOD)
        if lod == 0:
            b.anchor('anchor_water', (0, bh - 0.06, 0), 0.0, w=round(bw - 2 * t, 2), d=round(bd - 2 * t, 2))
            b.anchor('anchor_ladle', (0, bh, bd / 2 - 0.05), 0.0, kind='hishaku')
        return _finish(b, lac=True), ytop

    b0, ytop = build(0)
    b1, _ = build(1)
    b2, _ = build(2)
    meta = dict(height=round(ytop, 2), colliders=[dict(x=0, z=0, w=round(W * 0.62, 2), d=round(D * 0.4, 2), y0=0, y1=0.75)]
                + [dict(x=sx * (W / 2 - 0.15), z=sz * (D / 2 - 0.15), w=0.2, d=0.2, y0=0, y1=2.6) for sx in (-1, 1) for sz in (-1, 1)])
    return [b0, b1, b2], meta


def shoro(W=4.0, D=4.0, seed=24):
    def build(lod):
        b = Builder(seed)
        pal = red_pal()
        yb = 1.1
        kit.plinth(b, -W / 2, -D / 2, W / 2, D / 2, y1=yb, y0=-0.9, batter=0.18, lod=lod)
        kit.steps(b, 0, D / 2 + 0.15, 1.3, 5, rise=0.2, run=0.3, y_top=yb - 0.2, lod=lod)
        e = W / 2 - 0.45
        for sx in (-1, 1):
            for sz in (-1, 1):
                post(b, 'wood', sx * e, sz * e, yb, 4.4, 0.24, col=tint('wood', C['wood_dark']), chamfer=0.03 if lod == 0 else 0)
        for y in (yb + 0.25, 3.3):
            for sz in (-1, 1):
                aabb(b, 'wood', -e - 0.25, y, sz * e - 0.07, e + 0.25, y + 0.18, sz * e + 0.07, col=tint('wood', C['wood_dark']), uvs=kit.UV_WOOD, grain=0)
            for sx in (-1, 1):
                aabb(b, 'wood', sx * e - 0.07, y + 0.18, -e - 0.25, sx * e + 0.07, y + 0.36, e + 0.25, col=tint('wood', C['wood_dark']), uvs=kit.UV_WOOD, grain=2)
        aabb(b, 'wood', -e - 0.3, 4.4, -0.12, e + 0.3, 4.65, 0.12, col=tint('wood', C['wood_dark']), uvs=kit.UV_WOOD, grain=0)
        slopes, ytop = hip_roof(b, 2 * e + 0.3, 2 * e + 0.3, 4.7, pitch=0.55, ov=1.05, lod=lod, sag=0.22, r_break=(2 * e + 2.4) / 2 * 0.5,
                                corner_lift=0.3, Ld=1.6, oni=0.45, mat='kawara')
        # cloche de bronze et poutre de frappe (shumoku)
        prof = [(0.06, 4.4), (0.2, 4.32), (0.36, 4.2), (0.42, 3.9), (0.45, 3.3), (0.5, 3.05), (0.5, 2.98)]
        lathe(b, 'metal', prof, seg=14 if lod == 0 else 8, col=(0.55, 0.62, 0.5))
        if lod <= 1:
            cylinder(b, 'wood', (-1.6, 3.1, 0.0), (-0.6, 3.1, 0.0), 0.11, seg=8, caps=(True, True), col=tint('wood', '#8a7050'))
            for x in (-1.4, -0.8):
                cylinder(b, 'thatch', (x, 3.1, 0), (x, 4.4, 0), 0.02, seg=4, col=(1, 0.95, 0.8))
        return _finish(b, lac=False), ytop

    b0, ytop = build(0)
    b1, _ = build(1)
    b2, _ = build(2)
    meta = dict(height=round(ytop, 2), colliders=[dict(x=0, z=0, w=W, d=D, y0=-0.9, y1=1.1, walk=True)])
    return [b0, b1, b2], meta


# ====================================================================== TORII
def torii(h=6.5, kind='myojin', span=None, seed=31):
    """Torii myōjin (piliers vermillon, socles noirs, double linteau dont le supérieur noir et courbe) ou shinmei (bois brut, droit).
    `span` = entraxe des piliers ; origine au sol au milieu, passage selon z."""
    d = max(0.18, h * 0.075)
    s = span or h * (0.78 if kind == 'myojin' else 0.82)
    if kind == 'myojin':
        cp, ck = RED, BLACK
        mat = 'lacquer'
    else:
        cp = ck = tint('lacquer', C['wood_raw'])
        mat = 'lacquer'

    def build(lod):
        b = Builder(seed)
        seg = 14 if lod == 0 else (8 if lod == 1 else 6)
        r = d / 2
        for sx in (-1, 1):
            x = sx * s / 2
            if lod <= 1:
                aabb(b, 'stone', x - r * 1.5, -0.5, -r * 1.5, x + r * 1.5, 0.08, r * 1.5, col=(0.8, 0.79, 0.75), uvs=(1, 1), skip=('-y',))
            lathe(b, mat, [(r, 0.05), (r * 0.94, h * 0.93)], c=(x, 0, 0), seg=seg, col=cp, uvs=(0.5, 2.0))
            if kind == 'myojin':
                lathe(b, mat, [(r * 1.32, 0.05), (r * 1.32, h * 0.07), (r * 1.15, h * 0.085), (r * 0.99, h * 0.09)], c=(x, 0, 0), seg=seg, col=BLACK)
        # nuki (traverse)
        yn = h * 0.7
        ln = s + (d * 2.6 if kind == 'myojin' else d * 1.2)
        aabb(b, mat, -ln / 2, yn, -d * 0.24, ln / 2, yn + d * 0.62, d * 0.24, col=cp, uvs=(0.5, 2.0), grain=0)
        if kind == 'myojin':
            ys = h * 0.88
            aabb(b, mat, -s * 0.62, ys, -d * 0.32, s * 0.62, ys + d * 0.5, d * 0.32, col=cp, uvs=(0.5, 2.0), grain=0)
            # gakuzuka et plaque (gaku)
            aabb(b, mat, -d * 0.2, yn + d * 0.62, -d * 0.18, d * 0.2, ys, d * 0.18, col=cp, uvs=(0.5, 2.0))
            if lod <= 1 and h >= 3:
                gw, gh = d * 1.5, (ys - yn) * 0.8
                aabb(b, 'wood', -gw / 2, (yn + ys) / 2 - gh / 2 + d * 0.3, d * 0.18, gw / 2, (yn + ys) / 2 + gh / 2 + d * 0.3, d * 0.3, col=BLACK, uvs=(1, 1))
                b.anchor('anchor_plaque', (0, (yn + ys) / 2 + d * 0.3, d * 0.31), 0.0, w=round(gw * 0.8, 2), h=round(gh * 0.8, 2))
            # kasagi courbe (sori)
            L = s * 1.5
            n = 10 if lod == 0 else 4
            pts = []
            for i in range(n + 1):
                x = -L / 2 + L * i / n
                t = abs(x) / (L / 2)
                pts.append(V((x, ys + d * 0.5 + d * 0.38 + h * 0.035 * t ** 2.4, 0)))
            sweep_rect(b, 'wood', pts, d * 0.95, d * 0.75, up=Y, col=ck, uvs=(0.5, 2.0))
            # bandeau inférieur (shimaki) sous le kasagi, noir aussi
            sweep_rect(b, 'wood', [p - Y * d * 0.5 for p in pts[1:-1]], d * 0.8, d * 0.3, up=Y, col=ck, uvs=(0.5, 2.0))
        else:
            yk = h * 0.94
            lk = s + d * 2.4
            cylinder(b, mat, (-lk / 2, yk, 0), (lk / 2, yk, 0), d * 0.48, seg=seg, caps=(True, True), col=ck)
        return _finish(b, lac=False)

    b0 = build(0)
    b1 = build(1)
    b2 = build(2)
    meta = dict(height=round(h + d, 2), colliders=[dict(x=sx * s / 2, z=0, w=d * 1.2, d=d * 1.2, y0=0, y1=h) for sx in (-1, 1)], span=round(s, 2))
    return [b0, b1, b2], meta
