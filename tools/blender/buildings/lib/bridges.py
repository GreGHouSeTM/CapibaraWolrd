"""Ponts de BRIDGES (zones.ts), à la géométrie exacte : longueur = |b − a|, largeur, flèche de l'arche.

Repère : origine au milieu de a–b, au niveau des rives (y = 0 aux deux extrémités du tablier) ; tablier selon l'axe X local,
de a (x = −L/2) à b (x = +L/2). Placement : position = milieu (a, b) au sol, rotation.y = atan2(−(bz − az), bx − ax).
Le dessus du tablier suit y(x) = flèche · (1 − (2x/L)²) (négative = creux, passerelle de cordes).
"""
import math
import random
from mathutils import Vector as V
from .geom import Builder, X, Y, Z, aabb, box, quad, beam, post, tube, cylinder, lathe, sweep_rect, tint, jitter, frame
from . import kit
from .materials import C
from .sacred import RED, lacquerize

WOOD = tint('wood', C['wood_mid'])
DARK = tint('wood', C['wood_dark'])
DECK = tint('planks', C['wood_old'])


def _y(x, L, arch):
    return arch * (1 - (2 * x / L) ** 2)


def _path(L, arch, n, dy=0.0, z=0.0, ext=0.0):
    return [V((-L / 2 - ext + (L + 2 * ext) * i / n, _y(-L / 2 - ext + (L + 2 * ext) * i / n, L, arch) + dy, z)) for i in range(n + 1)]


def _railing(b, L, arch, z, h, step, lod, col, mat='wood', knobs=False):
    n = 12 if lod == 0 else 6
    sweep_rect(b, mat, _path(L, arch, n, h, z), 0.08, 0.08, col=col)
    if lod == 0:
        sweep_rect(b, mat, _path(L, arch, n, h * 0.45, z), 0.05, 0.06, col=col)
    k = max(2, int(L / step))
    for i in range(k + 1):
        x = -L / 2 + L * i / k
        y = _y(x, L, arch)
        aabb(b, mat, x - 0.06, y, z - 0.06, x + 0.06, y + h + 0.05, z + 0.06, col=col, uvs=kit.UV_WOOD)
        if knobs and lod <= 1:
            lathe(b, 'metal', [(0.07, y + h + 0.05), (0.09, y + h + 0.12), (0.0, y + h + 0.28)], c=(x, 0, z), seg=8, col=(1.0, 0.9, 0.6))


def _deck(b, L, arch, w, lod, th=0.14, col=DECK, mat='planks', ext=0.0):
    n = 14 if lod == 0 else 6
    sweep_rect(b, mat, _path(L, arch, n, -th / 2, 0, ext), w, th, col=col, uvs=(1.2, 1.2))
    if lod == 0:
        # planches transversales visibles (joints) : lattes fines en surface
        k = int(L / 0.6)
        for i in range(k + 1):
            x = -L / 2 + L * i / k
            y = _y(x, L, arch)
            aabb(b, mat, x - 0.02, y, -w / 2, x + 0.02, y + 0.012, w / 2, col=jitter(col, b.rng, 0.15), uvs=(1.2, 1.2), skip=('-y',))


def _abutments(b, L, w, lod):
    for s in (-1, 1):
        x = s * L / 2
        aabb(b, 'stone', x - (0.6 if s > 0 else 1.4) + (0.8 if s > 0 else 0), -2.5, -w / 2 - 0.4, x + (1.4 if s > 0 else 0.6) - (0.8 if s < 0 else 0), -0.12, w / 2 + 0.4,
             col=(0.9, 0.88, 0.84), uvs=(2.0, 2.0), skip=('-y',))


def bridge(kind, L, w, arch, seed=71):
    rng = random.Random(seed)

    def build(lod):
        b = Builder(seed)
        if kind == 'pont-route-bois':
            _deck(b, L, arch, w, lod, th=0.18, ext=0.3)
            for z in (-w / 2 + 0.25, 0.0, w / 2 - 0.25):
                sweep_rect(b, 'wood', _path(L, arch, 10, -0.45, z, 0.3), 0.3, 0.5, col=DARK)
            _abutments(b, L, w, lod)
            for x in (-L / 6, L / 6):
                y = _y(x, L, arch)
                for z in (-w / 2 + 0.3, w / 2 - 0.3):
                    cylinder(b, 'wood', (x, -2.6, z), (x, y - 0.7, z), 0.16, seg=8 if lod == 0 else 5, col=DARK, caps=(False, True))
                aabb(b, 'wood', x - 0.15, y - 0.95, -w / 2 + 0.1, x + 0.15, y - 0.7, w / 2 - 0.1, col=DARK, uvs=kit.UV_WOOD, grain=2)
            for z in (-w / 2 + 0.1, w / 2 - 0.1):
                _railing(b, L, arch, z, 0.85, 1.8, lod, WOOD)
            for s in (-1, 1):
                for z in (-w / 2 + 0.1, w / 2 - 0.1):
                    aabb(b, 'wood', s * L / 2 - 0.12, 0, z - 0.12, s * L / 2 + 0.12, 1.25, z + 0.12, col=DARK, uvs=kit.UV_WOOD)
                    b.anchor('anchor_lantern', (s * L / 2, 1.25, z), 0.0, kind='giboshi')
        elif kind == 'arche-bois':
            _deck(b, L, arch, w, lod, th=0.12)
            for z in (-w / 2 + 0.1, w / 2 - 0.1):
                sweep_rect(b, 'wood', _path(L, arch, 14 if lod == 0 else 6, -0.35, z), 0.18, 0.45, col=DARK)
                _railing(b, L, arch, z, 0.85, 1.2, lod, WOOD)
            for x in (-L / 4, L / 4):
                y = _y(x, L, arch)
                for z in (-w / 2 + 0.15, w / 2 - 0.15):
                    cylinder(b, 'wood', (x, -1.8, z), (x, y - 0.4, z), 0.12, seg=8 if lod == 0 else 5, col=DARK)
            _abutments(b, L, w, lod)
            b.anchor('anchor_lantern', (-L / 2, 1.0, w / 2), 0.0, kind='chochin')
            b.anchor('anchor_lantern', (L / 2, 1.0, -w / 2), 0.0, kind='chochin')
        elif kind == 'taikobashi-vermillon':
            _deck(b, L, arch, w, lod, th=0.12, col=tint('planks', '#6a4a34'))
            for z in (-w / 2 + 0.08, w / 2 - 0.08):
                sweep_rect(b, 'wood', _path(L, arch, 16 if lod == 0 else 6, -0.3, z), 0.16, 0.4, col=RED)
                _railing(b, L, arch, z, 0.8, 1.0, lod, RED, knobs=True)
            for x in (-L / 3, 0.0, L / 3):
                y = _y(x, L, arch)
                for z in (-w / 2 + 0.2, w / 2 - 0.2):
                    cylinder(b, 'wood', (x, -2.0, z), (x, y - 0.35, z), 0.13, seg=10 if lod == 0 else 5, col=RED)
                aabb(b, 'wood', x - 0.1, y - 0.55, -w / 2, x + 0.1, y - 0.35, w / 2, col=RED, uvs=kit.UV_WOOD, grain=2)
            _abutments(b, L, w, lod)
            lacquerize(b)
        elif kind == 'planches-zigzag':
            n = max(3, round(L / 4.0))
            seg = L / n
            for i in range(n):
                x0 = -L / 2 + seg * i
                z = (0.35 if i % 2 else -0.35)
                aabb(b, 'planks', x0 - 0.05, -0.06, z - w / 2, x0 + seg + 0.05, 0.06, z + w / 2, col=jitter(DECK, b.rng, 0.1), uvs=kit.UV_PLANKS, grain=0)
                for xx in (x0 + 0.2, x0 + seg - 0.2):
                    for zz in (z - w / 2 + 0.1, z + w / 2 - 0.1):
                        aabb(b, 'wood', xx - 0.06, -1.6, zz - 0.06, xx + 0.06, -0.06, zz + 0.06, col=DARK, uvs=kit.UV_WOOD)
        elif kind == 'dalle-pierre':
            aabb(b, 'stone', -L / 2 - 0.4, -0.38, -w / 2, L / 2 + 0.4, 0.02, w / 2, col=(0.82, 0.8, 0.76), uvs=(2.0, 2.0))
            for s in (-1, 1):
                aabb(b, 'stone', s * L / 2 - 0.9, -1.8, -w / 2 - 0.3, s * L / 2 + 0.9, -0.38, w / 2 + 0.3, col=(0.75, 0.74, 0.7), uvs=(2.0, 2.0), skip=('-y',))
        elif kind == 'gue-pierres':
            k = max(4, round(L / 0.85))
            for i in range(k + 1):
                x = -L / 2 + L * i / k
                z = rng.uniform(-0.2, 0.2)
                r = rng.uniform(0.32, 0.42)
                lathe(b, 'stone', [(r * 0.9, -0.9), (r, -0.1), (r * 0.92, 0.1), (r * 0.6, 0.16), (0.0, 0.17)], c=(x, 0, z),
                      seg=9 if lod == 0 else 6, col=jitter((0.85, 0.83, 0.8), b.rng, 0.08), smooth=True)
        elif kind == 'passerelle-cordes':
            k = int(L / 0.3)
            for i in range(k + 1):
                x = -L / 2 + L * i / k
                y = _y(x, L, arch)
                aabb(b, 'planks', x - 0.11, y - 0.05, -w / 2, x + 0.11, y, w / 2, col=jitter(DECK, b.rng, 0.15), uvs=kit.UV_PLANKS, grain=2)
            rope = (1.0, 0.92, 0.75)
            for z in (-w / 2, w / 2):
                tube(b, 'thatch', _path(L, arch, 12, -0.06, z), 0.03, seg=4, col=rope)
                tube(b, 'thatch', _path(L, arch * 0.7, 12, 1.0, z), 0.035, seg=4, col=rope)
                if lod <= 1:
                    for i in range(0, k + 1, 3):
                        x = -L / 2 + L * i / k
                        tube(b, 'thatch', [(x, _y(x, L, arch) - 0.05, z), (x, _y(x, L, arch * 0.7) + 1.0, z)], 0.015, seg=3, col=rope)
            for s in (-1, 1):
                for z in (-w / 2 - 0.1, w / 2 + 0.1):
                    aabb(b, 'wood', s * L / 2 - 0.1, -0.8, z - 0.1, s * L / 2 + 0.1, 1.4, z + 0.1, col=DARK, uvs=kit.UV_WOOD)
        b.weather(ground=-3.0, skip=('paper_shoji', 'interior', 'metal', 'water'))
        return b

    lods = [build(0), build(1), build(2)]
    walk = dict(path=[[round(-L / 2 + L * i / 8, 2), round(_y(-L / 2 + L * i / 8, L, arch) if kind not in ('gue-pierres',) else 0.17, 3)] for i in range(9)], width=w)
    meta = dict(height=round(max(arch, 0) + 1.3, 2), colliders=[], walk=walk)
    return lods, meta
