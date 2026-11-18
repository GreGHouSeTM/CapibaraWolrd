# Peinture procédurale des cartes de feuilles (atlas RGBA) de la végétation de Capyville.
# Usage : python3 tools/blender/flora/paint_leaves.py  (sortie : public/assets/models/flora/tex/*.png)
# Chaque atlas fait 512 × 512 px ; la disposition des tuiles est documentée dans flora_common.py (ATLAS).
# Les formes sont dessinées en sur-échantillonnage ×2 puis réduites (anticrénelage), et les couleurs sont
# « dilatées » sous les pixels transparents pour éviter les liserés sombres au filtrage des mipmaps.
import math
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'models', 'flora', 'tex')
S = 2  # sur-échantillonnage
SIZE = 512


def clamp(v, a=0, b=255):
    return max(a, min(b, int(v)))


def jitter(col, rng, amt=18, light=0.0):
    return tuple(clamp(c * (1 + light) + rng.uniform(-amt, amt)) for c in col)


class Canvas:
    def __init__(self, w=SIZE, h=SIZE):
        self.w, self.h = w, h
        self.img = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def poly(self, pts, col):
        self.d.polygon([(x * S, y * S) for x, y in pts], fill=col)

    def line(self, pts, col, width):
        self.d.line([(x * S, y * S) for x, y in pts], fill=col, width=max(1, int(width * S)), joint='curve')

    def ellipse(self, cx, cy, rx, ry, col):
        self.d.ellipse([(cx - rx) * S, (cy - ry) * S, (cx + rx) * S, (cy + ry) * S], fill=col)

    def save(self, name, opaque=False):
        im = self.img.resize((self.w, self.h), Image.LANCZOS)
        if not opaque:
            im = dilate(im)
        else:
            im = im.convert('RGB')
        name = name.replace('.png', '.webp')
        path = os.path.join(OUT, name)
        im.save(path, quality=90, method=6)
        print('écrit', path, os.path.getsize(path) // 1024, 'Ko')


def dilate(im):
    """Étend les couleurs des pixels opaques sous les pixels transparents (alpha conservé)."""
    a = np.asarray(im).astype(np.float32)
    rgb, al = a[..., :3], a[..., 3:4] / 255.0
    solid = (al >= 0.5).astype(np.float32)
    acc = rgb * solid
    out = rgb.copy()
    filled = solid[..., 0] > 0
    avg = (acc.reshape(-1, 3).sum(0) / max(1.0, solid.sum()))
    for r in (2, 5, 12, 30, 80):
        pa = Image.fromarray(np.clip(acc, 0, 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(r))
        pw = Image.fromarray((solid[..., 0] * 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(r))
        ca = np.asarray(pa).astype(np.float32)
        cw = np.asarray(pw).astype(np.float32) / 255.0
        fill = ca / np.maximum(cw[..., None], 1e-3)
        m = (~filled) & (cw > 0.004)
        out[m] = fill[m]
        filled |= m
    out[~filled] = avg
    res = np.concatenate([np.clip(out, 0, 255), a[..., 3:4]], axis=-1).astype(np.uint8)
    return Image.fromarray(res, 'RGBA')


# --------------------------------------------------------------------------------------------- formes de base
def leaf_shape(cx, cy, ang, length, width, kind='ellipse', n=14):
    """Contour d'une feuille (base en cx, cy, orientée selon ang en radians, 0 = vers le haut de l'image)."""
    pts = []
    for i in range(n + 1):
        t = i / n
        if kind == 'ellipse':
            w = math.sin(math.pi * t) ** 0.8 * width
        elif kind == 'lance':  # bambou : effilée
            w = math.sin(math.pi * t ** 0.7) * width * (1 - t) ** 0.3
        elif kind == 'petal':
            w = math.sin(math.pi * t) ** 0.6 * width * (1 - 0.35 * t)
        else:
            w = math.sin(math.pi * t) * width
        pts.append((t * length, w))
    pts += [(x, -y) for x, y in reversed(pts[1:-1])]
    ca, sa = math.cos(ang), math.sin(ang)
    return [(cx + x * sa + y * ca, cy - x * ca + y * sa) for x, y in pts]


def dir_pt(cx, cy, ang, d):
    return cx + math.sin(ang) * d, cy - math.cos(ang) * d


def draw_leaf(c, cx, cy, ang, length, width, col, rng, kind='ellipse', vein=True):
    c.poly(leaf_shape(cx, cy, ang, length, width, kind), col + (255,))
    # moitié éclairée : léger dégradé par une seconde forme plus étroite et plus claire
    c.poly(leaf_shape(cx, cy, ang + 0.02, length * 0.96, width * 0.45, kind), jitter(col, rng, 6, 0.12) + (255,))
    if vein:
        x1, y1 = dir_pt(cx, cy, ang, length * 0.92)
        c.line([(cx, cy), (x1, y1)], jitter(col, rng, 4, 0.3) + (255,), max(0.6, width * 0.08))


def maple_leaf(c, cx, cy, ang, size, col, rng):
    """Feuille palmée d'érable du Japon (7 lobes fins et dentés)."""
    lobes = 7
    pts = []
    spread = 2.4
    for k in range(lobes):
        a = ang + (k / (lobes - 1) - 0.5) * spread * 2
        L = size * (1.0 - 0.45 * abs(k / (lobes - 1) - 0.5) * 2) * rng.uniform(0.9, 1.05)
        w = size * 0.16
        # lobe : base, flanc gauche denté, pointe, flanc droit
        for j in range(5):
            t = j / 5
            r = L * t
            ww = w * math.sin(math.pi * min(1, t * 1.15)) * (1.15 if j % 2 else 0.9)
            pts.append(dir_pt(cx, cy, a - ww / max(r, 1e-3) * 0.9 if r > 0 else a, r if r > 0 else size * 0.08))
        pts.append(dir_pt(cx, cy, a, L))
        for j in range(4, 0, -1):
            t = j / 5
            r = L * t
            ww = w * math.sin(math.pi * min(1, t * 1.15)) * (1.15 if j % 2 else 0.9)
            pts.append(dir_pt(cx, cy, a + ww / max(r, 1e-3) * 0.9, r))
    c.poly(pts, col + (255,))
    for k in range(lobes):
        a = ang + (k / (lobes - 1) - 0.5) * spread * 2
        L = size * (1.0 - 0.45 * abs(k / (lobes - 1) - 0.5) * 2) * 0.85
        c.line([(cx, cy), dir_pt(cx, cy, a, L)], jitter(col, rng, 5, -0.18) + (255,), 0.7)
    # pétiole
    c.line([(cx, cy), dir_pt(cx, cy, ang + math.pi, size * 0.55)], (120, 40, 30, 255), 1.0)


def fan_leaf(c, cx, cy, ang, size, col, rng):
    """Feuille en éventail du ginkgo."""
    pts = [(cx, cy)]
    for i in range(13):
        a = ang + (i / 12 - 0.5) * 1.9
        r = size * (1 - 0.18 * (abs(i - 6) < 1)) * rng.uniform(0.95, 1.03)
        pts.append(dir_pt(cx, cy, a, r))
    c.poly(pts, col + (255,))
    for i in range(7):
        a = ang + (i / 6 - 0.5) * 1.6
        c.line([(cx, cy), dir_pt(cx, cy, a, size * 0.9)], jitter(col, rng, 4, -0.1) + (255,), 0.5)
    c.line([(cx, cy), dir_pt(cx, cy, ang + math.pi, size * 0.6)], (110, 100, 40, 255), 0.9)


def blossom(c, cx, cy, r, rng, base=(250, 205, 220)):
    """Fleur de cerisier à cinq pétales échancrés, cœur rose foncé."""
    rot = rng.uniform(0, math.tau)
    col = jitter(base, rng, 10)
    for k in range(5):
        a = rot + k * math.tau / 5
        c.poly(leaf_shape(cx, cy, a, r, r * 0.62, 'petal', 10), col + (255,))
        # échancrure
        tx, ty = dir_pt(cx, cy, a, r * 0.98)
        c.ellipse(tx, ty, r * 0.12, r * 0.12, (0, 0, 0, 0))
    c.ellipse(cx, cy, r * 0.28, r * 0.28, (205, 85, 120, 255))
    for k in range(6):
        a = rot + k * math.tau / 6
        x, y = dir_pt(cx, cy, a, r * 0.36)
        c.ellipse(x, y, r * 0.07, r * 0.07, (240, 210, 120, 255))


def twig(c, pts, col, w0, w1):
    n = len(pts) - 1
    for i in range(n):
        w = w0 + (w1 - w0) * i / max(1, n - 1)
        c.line([pts[i], pts[i + 1]], col + (255,), w)


def wander(x, y, ang, length, steps, rng, curl=0.25, grav=0.0):
    pts = [(x, y)]
    seg = length / steps
    for _ in range(steps):
        ang += rng.uniform(-curl, curl) + grav
        x, y = dir_pt(x, y, ang, seg)
        pts.append((x, y))
    return pts, ang


# --------------------------------------------------------------------------------------------- atlas par essence
def tile_box(i, j, n=2):
    s = SIZE // n
    return i * s, j * s, s


def sakura():
    """Cerisier : 2 bandes verticales (rameaux pleureurs, 128 × 512) à gauche, 2 grappes (256 × 256) à droite."""
    rng = random.Random(11)
    c = Canvas()
    for k in range(2):
        x0 = k * 128
        pts, _ = wander(x0 + 64, 0, math.pi, 512, 24, rng, 0.06)
        twig(c, pts, (70, 45, 40), 3, 1.2)
        for i, (x, y) in enumerate(pts[1:]):
            for _ in range(10):
                bx, by = x + rng.gauss(0, 20), y + rng.gauss(0, 9)
                if 6 < bx - x0 < 122:
                    blossom(c, bx, by, rng.uniform(7.5, 11), rng, (240, 168, 196) if rng.random() < 0.55 else (250, 205, 222))
    for k in range(2):
        x0, y0, s = 256, k * 256, 256
        cx, cy = x0 + 128, y0 + 128
        # rameau principal et ramilles
        main, ang = wander(x0 + 10, y0 + 240, 0.7, 260, 14, rng, 0.15)
        twig(c, main, (66, 42, 36), 4, 1.5)
        spots = []
        for i in range(3, len(main), 2):
            sub, _ = wander(*main[i], ang + rng.choice([-1, 1]) * rng.uniform(0.6, 1.2), rng.uniform(40, 90), 6, rng, 0.2)
            twig(c, sub, (70, 45, 40), 2, 0.8)
            spots += sub
        spots += main
        for (x, y) in spots:
            for _ in range(5):
                bx, by = x + rng.gauss(0, 16), y + rng.gauss(0, 16)
                if x0 + 8 < bx < x0 + s - 8 and y0 + 8 < by < y0 + s - 8:
                    blossom(c, bx, by, rng.uniform(7, 11), rng, (244, 178, 202) if rng.random() < 0.6 else (252, 214, 228))
        # quelques jeunes feuilles rouge-bronze
        for _ in range(10):
            x, y = rng.choice(spots)
            if x0 + 15 < x < x0 + s - 15 and y0 + 15 < y < y0 + s - 15:
                draw_leaf(c, x, y, rng.uniform(0, math.tau), 16, 6, jitter((140, 90, 60), rng, 15), rng)
    c.save('sakura_leaf.png')


def momiji():
    """Érable : 4 tuiles (rouge, cramoisi, orangé, jaune-vert) de rameaux de feuilles palmées."""
    rng = random.Random(23)
    c = Canvas()
    cols = [(200, 48, 30), (170, 28, 34), (226, 104, 30), (196, 168, 52)]
    for t in range(4):
        x0, y0, s = tile_box(t % 2, t // 2)
        base = cols[t]
        main, ang = wander(x0 + s * 0.5, y0 + s - 4, 0.0, s * 0.9, 10, rng, 0.2)
        twig(c, main, (90, 40, 34), 2.5, 1)
        for i in range(2, len(main), 2):
            sub, a2 = wander(*main[i], ang + rng.choice([-1, 1]) * rng.uniform(0.6, 1.0), s * 0.32, 5, rng, 0.2)
            twig(c, sub, (100, 40, 32), 1.4, 0.7)
            for (x, y) in sub[1:]:
                sz = rng.uniform(22, 34)
                if x0 + sz * 0.8 < x < x0 + s - sz * 0.8 and y0 + sz * 0.8 < y < y0 + s - sz * 0.8:
                    maple_leaf(c, x, y, a2 + rng.uniform(-0.9, 0.9), sz, jitter(base, rng, 22), rng)
        for i in range(1, len(main)):
            for side in (-1, 1):
                if rng.random() < 0.8:
                    a = ang + side * rng.uniform(0.6, 1.3)
                    x, y = dir_pt(*main[i], a, rng.uniform(10, 26))
                    c.line([main[i], (x, y)], (110, 40, 30, 255), 1)
                    sz = rng.uniform(26, 40) * (1 - 0.3 * i / len(main))
                    if x0 + sz * 0.8 < x < x0 + s - sz * 0.8 and y0 + sz * 0.8 < y < y0 + s - sz * 0.8:
                        maple_leaf(c, x, y, a + rng.uniform(-0.3, 0.3), sz, jitter(base, rng, 22), rng)
        maple_leaf(c, *main[-1], ang, 34, jitter(base, rng, 15), rng)
    c.save('momiji_leaf.png')


def needles_spray(c, x0, y0, s, rng, base, tip, kind):
    if kind == 'sugi':
        # rameau de cryptomère : axes ramifiés couverts d'aiguilles courtes en spirale, masse dense
        for _ in range(15):
            pts, ang = wander(x0 + s * rng.uniform(0.25, 0.75), y0 + s * 0.98, rng.uniform(-0.5, 0.5), s * rng.uniform(0.55, 0.9), 12, rng, 0.12)
            allp = list(pts)
            for i in range(2, len(pts) - 1, 2):
                sub, _ = wander(*pts[i], ang + rng.choice([-1, 1]) * rng.uniform(0.5, 1.0), s * rng.uniform(0.12, 0.25), 5, rng, 0.15)
                allp += sub
            for (x, y) in allp:
                for _ in range(12):
                    a = rng.uniform(0, math.tau)
                    L = rng.uniform(5, 11)
                    x1, y1 = dir_pt(x, y, a, L)
                    if x0 + 2 < x1 < x0 + s - 2 and y0 + 2 < y1 < y0 + s - 2:
                        k = (1 - (y - y0) / s)
                        col = tuple(int(base[j] + (tip[j] - base[j]) * k * rng.uniform(0.5, 1.0)) for j in range(3))
                        c.line([(x, y), (x1, y1)], jitter(col, rng, 10) + (255,), 2.2)
    else:
        # pin noir : touffes d'aiguilles longues en étoile
        for _ in range(17):
            cx, cy = x0 + s * rng.uniform(0.2, 0.8), y0 + s * rng.uniform(0.25, 0.8)
            for _ in range(70):
                a = rng.uniform(-math.pi * 0.85, math.pi * 0.85)
                L = rng.uniform(22, 44)
                x1, y1 = dir_pt(cx, cy, a, L)
                if x0 + 2 < x1 < x0 + s - 2 and y0 + 2 < y1 < y0 + s - 2:
                    k = rng.random()
                    col = tuple(int(base[j] + (tip[j] - base[j]) * k) for j in range(3))
                    c.line([(cx, cy), (x1, y1)], jitter(col, rng, 8) + (255,), 1.3)
            c.ellipse(cx, cy, 3, 3, (90, 70, 50, 255))


def sugi():
    rng = random.Random(31)
    c = Canvas()
    for t in range(4):
        x0, y0, s = tile_box(t % 2, t // 2)
        needles_spray(c, x0, y0, s, rng, (36, 62, 40) if t < 3 else (60, 70, 36), (92, 120, 62) if t < 3 else (130, 120, 60), 'sugi')
    c.save('sugi_leaf.png')


def matsu():
    rng = random.Random(37)
    c = Canvas()
    for t in range(4):
        x0, y0, s = tile_box(t % 2, t // 2)
        needles_spray(c, x0, y0, s, rng, (30, 54, 34), (80, 112, 58), 'matsu')
    c.save('matsu_leaf.png')


def take():
    """Bambou : rameaux de feuilles lancéolées (4 tuiles) ; bande de chaume dans culm.png."""
    rng = random.Random(41)
    c = Canvas()
    for t in range(4):
        x0, y0, s = tile_box(t % 2, t // 2)
        main, ang = wander(x0 + s * 0.15, y0 + s * 0.1, 2.3, s * 0.95, 10, rng, 0.08, 0.0)
        twig(c, main, (120, 140, 60), 1.8, 0.8)
        for i in range(2, len(main)):
            fan = rng.randint(2, 4)
            for k in range(fan):
                a = ang + (k / max(1, fan - 1) - 0.5) * 1.4 + rng.uniform(-0.2, 0.2) + 0.5
                L = rng.uniform(60, 95)
                x, y = main[i]
                tip = dir_pt(x, y, a, L)
                if x0 + 4 < tip[0] < x0 + s - 4 and y0 + 4 < tip[1] < y0 + s - 4:
                    draw_leaf(c, x, y, a, L, rng.uniform(7, 10), jitter((96, 140, 52), rng, 18), rng, 'lance')
    c.save('take_leaf.png')
    # chaume : texture opaque 128 × 512 (nœud en haut de chaque répétition)
    cc = Canvas(128, 512)
    for y in range(512):
        k = y / 512
        col = (int(110 + 30 * k), int(140 + 20 * k), int(62 + 8 * k))
        cc.d.line([(0, y * S), (128 * S, y * S)], fill=col + (255,), width=S)
    for x in range(0, 128, 3):
        cc.d.line([(x * S, 0), (x * S, 512 * S)], fill=(98, 128, 54, 70), width=S)
    cc.d.rectangle([0, 0, 128 * S, 10 * S], fill=(150, 160, 90, 255))
    cc.d.rectangle([0, 10 * S, 128 * S, 16 * S], fill=(80, 100, 44, 255))
    cc.save('take_culm.png', opaque=True)


def broad(name, seed, cols, kind, size=(30, 14), count=34, fruit=False):
    rng = random.Random(seed)
    c = Canvas()
    for t in range(4):
        x0, y0, s = tile_box(t % 2, t // 2)
        main, ang = wander(x0 + s * 0.5, y0 + s - 4, rng.uniform(-0.3, 0.3), s * 0.85, 10, rng, 0.22)
        twig(c, main, (80, 60, 40), 2.5, 1)
        pts = list(main)
        for i in range(1, len(main)):
            sub, _ = wander(*main[i], ang + (1 if i % 2 else -1) * rng.uniform(0.5, 1.1), s * 0.32, 5, rng, 0.2)
            twig(c, sub, (80, 60, 40), 1.4, 0.7)
            pts += sub
        for _ in range(count):
            x, y = rng.choice(pts)
            a = rng.uniform(0, math.tau)
            L = rng.uniform(size[0] * 0.75, size[0] * 1.15)
            tip = dir_pt(x, y, a, L)
            if x0 + 4 < tip[0] < x0 + s - 4 and y0 + 4 < tip[1] < y0 + s - 4:
                col = jitter(rng.choice(cols), rng, 14)
                if kind == 'fan':
                    fan_leaf(c, x, y, a, L * 0.8, col, rng)
                else:
                    draw_leaf(c, x, y, a, L, size[1] * rng.uniform(0.8, 1.1), col, rng)
        if fruit and t == 3:
            pass
    c.save(name)


def tsutsuji():
    """Azalée : tuiles 0-2 feuillage dense, tuile 3 fleurs roses."""
    rng = random.Random(53)
    c = Canvas()
    for t in range(4):
        x0, y0, s = tile_box(t % 2, t // 2)
        for _ in range(150):
            x, y = x0 + rng.uniform(16, s - 16), y0 + rng.uniform(16, s - 16)
            if math.hypot(x - x0 - s / 2, y - y0 - s / 2) > s * 0.46:
                continue
            draw_leaf(c, x, y, rng.uniform(0, math.tau), rng.uniform(12, 18), 5, jitter((52, 92, 40), rng, 16), rng)
        if t == 3:
            for _ in range(36):
                x, y = x0 + rng.uniform(24, s - 24), y0 + rng.uniform(24, s - 24)
                if math.hypot(x - x0 - s / 2, y - y0 - s / 2) > s * 0.42:
                    continue
                rot = rng.uniform(0, math.tau)
                col = jitter((226, 90, 150), rng, 14)
                for k in range(5):
                    c.poly(leaf_shape(x, y, rot + k * math.tau / 5, 11, 7, 'petal', 8), col + (255,))
                c.ellipse(x, y, 2.5, 2.5, (250, 220, 120, 255))
    c.save('tsutsuji_leaf.png')


def susuki():
    """Susuki : tuile 0..383 = touffe de feuilles arquées ; bande 384..511 = 2 plumets argentés (128 × 256)."""
    rng = random.Random(61)
    c = Canvas()
    # feuilles : longues lames arquées, vert passé à blond
    for _ in range(70):
        x = 192 + rng.gauss(0, 26)
        lean = rng.uniform(-1.0, 1.0)
        L = rng.uniform(260, 500)
        pts = []
        steps = 16
        for i in range(steps + 1):
            t = i / steps
            a = lean * t * 1.25
            pts.append((x + math.sin(a) * L * t * 0.62, 512 - math.cos(a * 0.9) * L * t))
        w0 = rng.uniform(4.5, 7)
        k = rng.random()
        base = (int(120 + 60 * k), int(130 + 40 * k), int(70 + 40 * k))
        for i in range(steps):
            t = i / steps
            w = w0 * (1 - t) ** 0.7 + 0.6
            col = tuple(int(base[j] * (0.75 + 0.45 * t)) for j in range(3))
            a, b = pts[i], pts[i + 1]
            if 2 < b[0] < 382 and b[1] > 2:
                c.line([a, b], jitter(col, rng, 6) + (255,), w)
    # plumets : panicules soyeuses argentées
    for k in range(2):
        x0, y0 = 384, k * 256
        stem = [(x0 + 64 + math.sin(i * 0.2) * 3, y0 + 256 - i * 10) for i in range(25)]
        c.line(stem[:6], (170, 160, 120, 255), 2)
        for i in range(5, 25):
            sx, sy = stem[i]
            for _ in range(16):
                a = rng.uniform(-0.55, 0.55) + (0.35 if rng.random() < 0.5 else -0.35)
                L = rng.uniform(14, 40) * (1 - 0.5 * (i - 5) / 20)
                x1, y1 = dir_pt(sx, sy, a, L)
                if x0 + 2 < x1 < x0 + 126 and y0 + 2 < y1:
                    col = jitter((196, 180, 150) if rng.random() < 0.6 else (176, 150, 130), rng, 14)
                    c.line([(sx, sy), (x1, y1)], col + (200,), 1.4)
        c.line(stem[5:], (190, 176, 140, 255), 1.5)
    c.save('susuki_leaf.png')


def fern():
    """Fougère : 4 frondes verticales (128 × 512), base en bas."""
    rng = random.Random(71)
    c = Canvas()
    for k in range(4):
        x0 = k * 128
        cx = x0 + 64
        base = jitter((62, 104, 44) if k < 3 else (96, 112, 50), rng, 8)
        n = 30
        c.line([(cx, 510), (cx, 14)], (80, 90, 40, 255), 2.4)
        for i in range(n):
            t = i / n
            y = 500 - t * 480
            L = 56 * math.sin(math.pi * (0.12 + 0.88 * (1 - t))) * (1 - t * 0.5) + 6
            for side in (-1, 1):
                a = side * (1.35 - 0.25 * t)
                # foliole pennée : petites pinnules
                for j in range(int(L / 5)):
                    u = j / max(1, L / 5)
                    px, py = dir_pt(cx, y, a, u * L)
                    draw_leaf(c, px, py, a - side * 0.9, 7 * (1 - u * 0.6) + 2, 2.6, jitter(base, rng, 8, 0.1 * (1 - t)), rng, vein=False)
                    draw_leaf(c, px, py, a + side * 0.9 - math.pi * 0.0, 6 * (1 - u * 0.6) + 2, 2.4, jitter(base, rng, 8, -0.05), rng, vein=False)
    c.save('fern_leaf.png')


def ine():
    """Riz : 2 touffes (256 × 512) de feuilles fines vert tendre, épis courbés à la pointe."""
    rng = random.Random(83)
    c = Canvas()
    for k in range(2):
        x0 = k * 256
        for _ in range(46):
            x = x0 + 128 + rng.gauss(0, 10)
            lean = rng.uniform(-0.7, 0.7)
            L = rng.uniform(300, 500)
            pts = []
            for i in range(13):
                t = i / 12
                a = lean * t
                pts.append((x + math.sin(a) * L * t * 0.5, 512 - math.cos(a) * L * t))
            for i in range(12):
                t = i / 12
                b = pts[i + 1]
                if x0 + 2 < b[0] < x0 + 254 and b[1] > 2:
                    col = (int(80 + 60 * t), int(140 + 40 * t), int(50 + 20 * t))
                    c.line([pts[i], b], jitter(col, rng, 10) + (255,), 4 * (1 - t) + 1)
        for _ in range(6):
            x, y = x0 + 128 + rng.gauss(0, 30), rng.uniform(40, 140)
            pts, _ = wander(x, y, rng.choice([-1, 1]) * 1.2, 90, 8, rng, 0.08, 0.06)
            for (px, py) in pts:
                if x0 + 6 < px < x0 + 250:
                    c.ellipse(px, py, 3, 5, (200, 190, 110, 255))
    c.save('ine_leaf.png')


def ground():
    """Sol : tuiles de pétales roses, feuilles d'érable rouges, feuilles mortes, aiguilles."""
    rng = random.Random(97)
    c = Canvas()
    for t in range(4):
        x0, y0, s = tile_box(t % 2, t // 2)
        cx, cy = x0 + s / 2, y0 + s / 2
        for _ in range(140 if t == 0 else 26 if t < 3 else 160):
            r = s * 0.46 * math.sqrt(rng.random())
            a = rng.uniform(0, math.tau)
            x, y = cx + math.cos(a) * r, cy + math.sin(a) * r
            if t == 0:
                c.poly(leaf_shape(x, y, rng.uniform(0, math.tau), 9, 6, 'petal', 8), jitter((250, 205, 220), rng, 12) + (255,))
            elif t == 1:
                maple_leaf(c, x, y, rng.uniform(0, math.tau), rng.uniform(18, 26), jitter((196, 48, 32), rng, 26), rng)
            elif t == 2:
                col = rng.choice([(150, 90, 40), (180, 120, 50), (120, 80, 50), (196, 150, 60)])
                draw_leaf(c, x, y, rng.uniform(0, math.tau), rng.uniform(22, 32), 10, jitter(col, rng, 14), rng)
            else:
                x1, y1 = dir_pt(x, y, rng.uniform(0, math.tau), rng.uniform(10, 20))
                c.line([(x, y), (x1, y1)], jitter((150, 110, 60), rng, 18) + (255,), 1.4)
    c.save('ground_leaf.png')


def cha():
    """Théier : moitié gauche = surface de haie raccordable (opaque dans le RGB, alpha = 1), moitié droite = 2 cartes."""
    rng = random.Random(101)
    c = Canvas()
    c.d.rectangle([0, 0, 256 * S, 512 * S], fill=(40, 66, 30, 255))
    for _ in range(1400):
        x, y = rng.uniform(0, 256), rng.uniform(0, 512)
        col = jitter((70, 112, 44), rng, 18, rng.uniform(-0.25, 0.25))
        for dx in (-256, 0, 256):  # raccord horizontal
            draw_leaf(c, x + dx, y, rng.uniform(0, math.tau), rng.uniform(12, 18), 6, col, rng)
    c.d.rectangle([256 * S, 0, 512 * S, 512 * S], fill=(0, 0, 0, 0))
    for k in range(2):
        x0, y0 = 256, k * 256
        for _ in range(60):
            x, y = x0 + rng.uniform(20, 236), y0 + rng.uniform(40, 236)
            if math.hypot(x - x0 - 128, (y - y0 - 150) * 1.5) > 110:
                continue
            draw_leaf(c, x, y, rng.uniform(-1.2, 1.2), rng.uniform(14, 20), 6.5, jitter((84, 132, 50), rng, 16), rng)
    c.save('cha_leaf.png')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    which = sys.argv[1:] or ['sakura', 'momiji', 'sugi', 'matsu', 'take', 'yuzu', 'ichou', 'keyaki', 'tsutsuji', 'susuki', 'fern', 'ine', 'ground', 'cha']
    for w in which:
        if w == 'yuzu':
            broad('yuzu_leaf.png', 43, [(34, 70, 30), (44, 84, 34), (52, 92, 38)], 'ellipse', (32, 14), 120)
        elif w == 'keyaki':
            broad('keyaki_leaf.png', 49, [(70, 110, 40), (86, 124, 46), (58, 96, 36), (120, 136, 52), (150, 140, 56)], 'ellipse', (26, 11), 130)
        elif w == 'ichou':
            broad('ichou_leaf.png', 47, [(226, 188, 50), (240, 206, 70), (200, 170, 40), (160, 160, 50)], 'fan', (28, 14), 110)
        else:
            globals()[w]()
