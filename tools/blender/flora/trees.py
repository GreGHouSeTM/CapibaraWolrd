# Générateur Blender (bpy 5.x) des arbres et plantes de Capyville, exportés en .glb (2 LOD par variante).
#
# Usage : flock /tmp/capy-blender.lock python3 tools/blender/flora/trees.py [espèce …]
# Sortie : public/assets/models/flora/<espèce>.glb
#
# Chaque fichier contient, pour chaque variante k, des objets nommés `v<k>_lod<n>_<partie>` :
#   partie = bark (écorce, texture <espèce>_bark), leaf (cartes de feuilles alpha, atlas <espèce>_leaf),
#            fruit (yuzus), prop (béquilles, corde : couleur de sommet = albédo).
# Attribut de couleur des sommets (COLOR_0, linéaire) des parties bark/leaf :
#   R = poids de balancement des branches (0 tronc → 1 bout des rameaux),
#   G = poids de frémissement des feuilles (0 écorce, 0,3 base de carte → 1 pointe),
#   B = occlusion ambiante cuite (0,3 cœur du houppier → 1 extérieur).
# Repère : y vers le haut (Three.js), pied de l'arbre à l'origine, mètres.
# Les arbres sont générés dans un repère « Three » puis convertis vers Blender (z vers le haut) ; l'export glTF
# (export_yup) les ramène en y vers le haut.
import math
import os
import random
import sys

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'models', 'flora')

UP = np.array([0.0, 1.0, 0.0])


def norm(v):
    n = np.linalg.norm(v)
    return v / n if n > 1e-9 else np.array([0.0, 1.0, 0.0])


def perp(v):
    a = np.array([1.0, 0, 0]) if abs(v[0]) < 0.9 else np.array([0, 0, 1.0])
    return norm(np.cross(v, a))


def rot(v, axis, ang):
    """Rotation de Rodrigues."""
    axis = norm(axis)
    return v * math.cos(ang) + np.cross(axis, v) * math.sin(ang) + axis * np.dot(axis, v) * (1 - math.cos(ang))


def gn(rng, s):
    return np.array([rng.gauss(0, s), rng.gauss(0, s), rng.gauss(0, s)])


def smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


# ============================================================================================ ATLAS
# Tuiles de chaque atlas en coordonnées image (u vers la droite, v vers le bas), avec le point d'attache
# (ax, ay) du rameau dans la tuile (0..1) et la direction du rameau dans l'image (pour orienter la carte).
def T2(t, ax=0.5, ay=1.0):
    return dict(u0=(t % 2) * 0.5, v0=(t // 2) * 0.5, du=0.5, dv=0.5, ax=ax, ay=ay)


ATLAS = {
    'sakura': {'strip': [dict(u0=0.0, v0=0, du=0.25, dv=1, ax=0.5, ay=0.0), dict(u0=0.25, v0=0, du=0.25, dv=1, ax=0.5, ay=0.0)],
               'cluster': [dict(u0=0.5, v0=0.0, du=0.5, dv=0.5, ax=0.1, ay=0.95), dict(u0=0.5, v0=0.5, du=0.5, dv=0.5, ax=0.1, ay=0.95)]},
    'momiji': {'leaf': [T2(i) for i in range(4)]},
    'sugi': {'leaf': [T2(i) for i in range(4)]},
    'matsu': {'leaf': [T2(i, 0.5, 0.5) for i in range(4)]},
    'take': {'leaf': [T2(i, 0.12, 0.08) for i in range(4)]},
    'yuzu': {'leaf': [T2(i) for i in range(4)]},
    'keyaki': {'leaf': [T2(i) for i in range(4)]},
    'ichou': {'leaf': [T2(i) for i in range(4)]},
    'tsutsuji': {'leaf': [T2(i, 0.5, 0.5) for i in range(4)]},
    'susuki': {'blade': [dict(u0=0.0, v0=0.0, du=0.75, dv=1.0, ax=0.5, ay=1.0)],
               'plume': [dict(u0=0.75, v0=0.0, du=0.25, dv=0.5, ax=0.5, ay=1.0), dict(u0=0.75, v0=0.5, du=0.25, dv=0.5, ax=0.5, ay=1.0)]},
    'fern': {'frond': [dict(u0=k * 0.25, v0=0, du=0.25, dv=1, ax=0.5, ay=1.0) for k in range(4)]},
    'ine': {'tuft': [dict(u0=k * 0.5, v0=0, du=0.5, dv=1, ax=0.5, ay=1.0) for k in range(2)]},
}


# ============================================================================================ MAILLAGE
class MeshBuf:
    def __init__(self):
        self.p, self.n, self.uv, self.c, self.f = [], [], [], [], []

    def add_vert(self, p, n, uv, c):
        self.p.append(np.asarray(p, float))
        self.n.append(norm(np.asarray(n, float)))
        self.uv.append(uv)
        self.c.append(c)
        return len(self.p) - 1

    def tri(self, a, b, c):
        self.f.append((a, b, c))

    def quad(self, a, b, c, d):
        self.f.append((a, b, c))
        self.f.append((a, c, d))

    @property
    def tris(self):
        return len(self.f)


class Branch:
    def __init__(self, pts, radii, level, sway0=0.0, sway_len=4.0):
        self.pts = [np.asarray(p, float) for p in pts]
        self.radii = list(radii)
        self.level = level
        self.flare = 0.0  # évasement racinaire (tronc)
        self.flare_h = 1.0
        self.lobes = 5
        # poids de balancement le long de la branche
        acc = [0.0]
        for i in range(1, len(self.pts)):
            acc.append(acc[-1] + np.linalg.norm(self.pts[i] - self.pts[i - 1]))
        self.s = acc
        self.sway = [min(1.0, sway0 + (a / sway_len if level > 0 else 0.0)) for a in acc]

    def length(self):
        return self.s[-1]

    def at(self, t):
        """Point, tangente, rayon et poids de balancement à l'abscisse relative t (0..1)."""
        L = self.s[-1] * t
        for i in range(1, len(self.pts)):
            if self.s[i] >= L or i == len(self.pts) - 1:
                seg = max(1e-6, self.s[i] - self.s[i - 1])
                k = min(1.0, max(0.0, (L - self.s[i - 1]) / seg))
                p = self.pts[i - 1] * (1 - k) + self.pts[i] * k
                d = norm(self.pts[i] - self.pts[i - 1])
                r = self.radii[i - 1] * (1 - k) + self.radii[i] * k
                w = self.sway[i - 1] * (1 - k) + self.sway[i] * k
                return p, d, r, w
        return self.pts[-1], UP, self.radii[-1], self.sway[-1]


def curve(p0, d0, length, nseg, rng, curl=0.1, up=0.0, grav=0.0, hold=None):
    """Polyligne qui part de p0 dans la direction d0 avec ondulations, tropisme (up > 0) et gravité (grav > 0)."""
    pts = [np.asarray(p0, float)]
    d = norm(np.asarray(d0, float))
    seg = length / nseg
    side = perp(d)
    for i in range(nseg):
        side = rot(side, d, rng.uniform(-0.6, 0.6))
        d = norm(rot(d, side, rng.uniform(-curl, curl)) + UP * up - UP * grav * (i + 1) / nseg)
        if hold is not None:
            d = norm(d * (1 - hold) + norm(np.asarray(d0, float)) * hold)
        pts.append(pts[-1] + d * seg)
    return pts


def child_dir(parent_d, angle, az):
    """Direction d'un rameau : écarté de `angle` (rad) de l'axe parent, azimut `az` autour de lui."""
    s = perp(parent_d)
    s = rot(s, parent_d, az)
    return norm(rot(parent_d, s, angle))


def tube(mb, br, sides, every=1, uv_scale=1.0, ao_base=0.55, ao_h=3.0, lod=0):
    """Tube d'écorce le long d'une branche (anneaux alignés sur la tangente, UV u autour, v le long)."""
    idx = list(range(0, len(br.pts), every))
    if idx[-1] != len(br.pts) - 1:
        idx.append(len(br.pts) - 1)
    rings = []
    prev_side = None
    for k, i in enumerate(idx):
        p = br.pts[i]
        if i == 0:
            d = norm(br.pts[1] - br.pts[0])
        elif i == len(br.pts) - 1:
            d = norm(br.pts[i] - br.pts[i - 1])
        else:
            d = norm(br.pts[i + 1] - br.pts[i - 1])
        side = perp(d) if prev_side is None else norm(prev_side - d * np.dot(prev_side, d))
        prev_side = side
        other = np.cross(d, side)
        r = br.radii[i]
        circ = 2 * math.pi * max(r, 0.01)
        v = br.s[i] / max(0.05, circ) * uv_scale * 0.5 if br.level == 0 else br.s[i] / 0.6
        ring = []
        h = p[1]
        ao = min(1.0, ao_base + (1 - ao_base) * min(1.0, h / ao_h)) if br.level == 0 else 0.85
        for j in range(sides + 1):
            a = 2 * math.pi * j / sides
            rr = r
            if br.flare > 0 and br.s[i] < br.flare_h:
                f = (1 - br.s[i] / br.flare_h) ** 2
                rr = r * (1 + br.flare * f * (0.55 + 0.45 * math.cos(br.lobes * a + 0.7)))
            n = side * math.cos(a) + other * math.sin(a)
            q = p + n * rr
            u = j / sides * (2 if br.level == 0 and r > 0.3 else 1)
            ring.append(mb.add_vert(q, n, (u, -v), (br.sway[i], 0.0, ao)))
        rings.append(ring)
    for a, b in zip(rings[:-1], rings[1:]):
        for j in range(sides):
            mb.quad(a[j], a[j + 1], b[j + 1], b[j])


def card(mb, anchor, vdir, udir, w, h, tile, sway, ao, nrm=None, segs=1, bend=0.0, gdir=None, flut=(0.3, 1.0)):
    """Carte de feuilles : le point d'attache de la tuile est posé sur `anchor`, l'axe v de l'image (vers le haut
    de la tuile) suit `vdir`, l'axe u suit `udir`. `segs` > 1 subdivise la carte le long de v (courbure `bend`
    vers `gdir`). `nrm` : normale lissée imposée (sinon la normale de la carte)."""
    vdir, udir = norm(vdir), norm(udir)
    n0 = norm(np.cross(udir, vdir))
    ax, ay = tile['ax'], tile['ay']
    # coordonnées locales : x le long de u (0..w), y le long de « haut de tuile » (0..h)
    ox, oy = ax * w, (1 - ay) * h  # attache dans le repère local (y = 0 en bas de la tuile)
    gdir = UP * -1 if gdir is None else norm(gdir)
    verts = []
    for s in range(segs + 1):
        t = s / segs
        y = t * h
        off = gdir * bend * (t * t) * h
        row = []
        for x in (0.0, w):
            p = anchor + udir * (x - ox) + vdir * (y - oy) + off
            # UV image : v vers le bas, le haut de la tuile en v0
            u = tile['u0'] + tile['du'] * (x / w)
            vv = tile['v0'] + tile['dv'] * (1 - t)
            dist_from_anchor = abs(y - oy) / max(1e-6, h)
            g = flut[0] + (flut[1] - flut[0]) * min(1.0, dist_from_anchor * 1.6)
            nn = n0 if nrm is None else norm(n0 * 0.35 + nrm * 0.65 * (1 if np.dot(n0, nrm) >= 0 else -1))
            row.append(mb.add_vert(p, nn, (u, vv), (sway, g, ao)))
        verts.append(row)
    for a, b in zip(verts[:-1], verts[1:]):
        mb.quad(a[0], a[1], b[1], b[0])


def icosphere(mb, c, r, col, sub=1):
    t = (1 + 5 ** 0.5) / 2
    vs = [norm(np.array(v)) for v in [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t), (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]]
    fs = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    for _ in range(sub):
        cache = {}
        nf = []

        def mid(a, b):
            k = (min(a, b), max(a, b))
            if k not in cache:
                vs.append(norm(vs[a] + vs[b]))
                cache[k] = len(vs) - 1
            return cache[k]
        for a, b, cc in fs:
            ab, bc, ca = mid(a, b), mid(b, cc), mid(cc, a)
            nf += [(a, ab, ca), (b, bc, ab), (cc, ca, bc), (ab, bc, ca)]
        fs = nf
    base = len(mb.p)
    for v in vs:
        mb.add_vert(c + v * r * np.array([1, 1.08, 1]), v, (0.5, 0.5), col)
    for a, b, cc in fs:
        mb.tri(base + a, base + b, base + cc)


# ============================================================================================ OUTILS D'ARBRE
class Tree:
    def __init__(self, name, height):
        self.name = name
        self.H = height
        self.branches = []
        self.cards = []  # (anchor, vdir, udir, w, h, tile, sway, ao, nrm, segs, bend, keep1)
        self.fruits = []  # (c, r)
        self.props = MeshBuf()
        self.crown_c = np.array([0, height * 0.6, 0])
        self.crown_r = height * 0.35

    def ao_at(self, p, k=1.0):
        d = np.linalg.norm((p - self.crown_c) / np.array([1, 0.8, 1])) / max(0.1, self.crown_r)
        return float(min(1.0, 0.32 + 0.68 * smooth(0.0, 1.05, d) ** 0.8 * k + 0.12 * (p[1] / self.H)))

    def out_n(self, p):
        return norm((p - self.crown_c) / np.array([1, 0.7, 1]) + UP * 0.25)

    def add_card(self, anchor, vdir, udir, w, h, tile, sway, keep1=False, segs=1, bend=0.0, nrm=None, flut=(0.3, 1.0), gdir=None):
        self.cards.append(dict(anchor=np.asarray(anchor, float), vdir=vdir, udir=udir, w=w, h=h, tile=tile, sway=sway,
                               ao=self.ao_at(np.asarray(anchor, float)), nrm=self.out_n(np.asarray(anchor, float)) if nrm is None else nrm,
                               segs=segs, bend=bend, keep1=keep1, flut=flut, gdir=gdir))

    def build(self, lod, rng):
        bark, leaf = MeshBuf(), MeshBuf()
        for br in self.branches:
            if lod == 0:
                sides = {0: 12 if br.radii[0] > 0.6 else 9, 1: 5, 2: 4}.get(br.level, 3)
                if br.radii[0] < 0.035 and br.level > 0:
                    sides = 3
                tube(bark, br, sides)
            else:
                if br.level > getattr(self, 'lod1_level', 1) or br.radii[0] < 0.025:
                    continue
                sides = {0: 6, 1: 4}.get(br.level, 3)
                tube(bark, br, sides, every=2)
        cards = self.cards
        if lod == 1:
            keep = getattr(self, 'lod1_keep', 0.3)
            sel = [c for c in cards if c['keep1'] or rng.random() < keep]
            k = 1 / max(0.15, keep) ** 0.5 * 0.85
            for c in sel:
                card(leaf, c['anchor'], c['vdir'], c['udir'], c['w'] * k, c['h'] * k, c['tile'], c['sway'], c['ao'], c['nrm'], 1, c['bend'], c['gdir'], c['flut'])
        else:
            for c in cards:
                card(leaf, c['anchor'], c['vdir'], c['udir'], c['w'], c['h'], c['tile'], c['sway'], c['ao'], c['nrm'], c['segs'], c['bend'], c['gdir'], c['flut'])
        fruit = MeshBuf()
        for i, (c, r) in enumerate(self.fruits):
            if lod == 1 and i % 2:
                continue
            col = (0.95, 0.72, 0.08) if i % 5 else (0.85, 0.62, 0.06)
            icosphere(fruit, c, r * (1.25 if lod else 1), col, 1 if lod == 0 else 0)
        return {'bark': bark, 'leaf': leaf, 'fruit': fruit, 'prop': self.props if lod == 0 else None}


def broad_cards(tree, br, tiles, every, size, rng, t0=0.3, face='out', count=2, hang=0.0):
    """Sème des cartes le long d'une branche."""
    L = br.length()
    n = max(1, int(L * (1 - t0) / every))
    for i in range(n + 1):
        t = t0 + (1 - t0) * i / max(1, n)
        p, d, r, w = br.at(t)
        for _ in range(count):
            s = size * rng.uniform(0.8, 1.15)
            if face == 'out':
                vdir = norm(d * 0.6 + tree.out_n(p) * 0.6 + UP * rng.uniform(-0.2, 0.5) - UP * hang)
            elif face == 'flat':  # feuilles étagées (érable) : cartes proches de l'horizontale
                vdir = norm(d + gn(rng, 0.35))
                vdir[1] *= 0.35
                vdir = norm(vdir)
            else:
                vdir = norm(d + gn(rng, 0.4))
            udir = perp(vdir)
            udir = rot(udir, vdir, rng.uniform(0, math.pi))
            if face == 'flat':
                # u horizontal-ish pour que la carte soit presque couchée
                udir = norm(np.cross(vdir, UP) + gn(rng, 0.25))
            tree.add_card(p, vdir, udir, s, s, tiles[rng.randrange(len(tiles))], min(1.0, w + 0.2), keep1=(i == n))


# ============================================================================================ ESSENCES
def sugi(seed, H, giant=False):
    rng = random.Random(seed)
    nrng = np.random.default_rng(seed)
    t = Tree('sugi', H)
    r0 = 1.05 if giant else H * 0.017
    nseg = 30
    tr = curve([0, 0, 0], [0, 1, 0], H, nseg, rng, curl=0.02, up=0.02)
    trunk = Branch(tr, [r0 * (1 - k / nseg) ** 1.1 + 0.03 for k in range(nseg + 1)], 0)
    trunk.flare = 0.9 if giant else 0.55
    trunk.flare_h = 3.2 if giant else 1.4
    trunk.lobes = 6 if giant else 5
    t.branches.append(trunk)
    cb = H * (0.42 if giant else rng.uniform(0.38, 0.52))
    Rmax = H * (0.14 if giant else 0.12)
    t.crown_c = np.array([0, (cb + H) / 2, 0])
    t.crown_r = Rmax * 1.3
    tiles = ATLAS['sugi']['leaf']
    n1 = int(H * (2.3 if giant else 2.0))
    az = rng.uniform(0, 6.28)
    for i in range(n1):
        u = i / n1
        h = cb + (H * 0.985 - cb) * u + rng.uniform(-0.2, 0.2)
        p, d, r, _ = trunk.at(h / H)
        az += 2.4 + rng.uniform(-0.3, 0.3)
        L = Rmax * (1 - u) ** 0.85 + 0.5 + rng.uniform(-0.3, 0.3)
        down = math.radians(70 + 30 * (1 - u) + rng.uniform(-8, 8))
        dd = child_dir(UP, down, az)
        pts = curve(p, dd, L, 6, rng, curl=0.12, up=0.05 + 0.1 * u, grav=0.06)
        br = Branch(pts, [0.03 + 0.018 * L * (1 - k / 6) for k in range(7)], 1, 0.15, 3.0)
        t.branches.append(br)
        # rameaux secondaires (LOD0 seulement, gros arbres)
        if L > 1.6:
            for k in range(2):
                tp = rng.uniform(0.35, 0.75)
                q, qd, _, w = br.at(tp)
                sd = child_dir(qd, math.radians(50), rng.uniform(0, 6.28))
                sd[1] = -abs(sd[1]) * 0.4
                spts = curve(q, sd, L * 0.35, 3, rng, curl=0.15)
                t.branches.append(Branch(spts, [0.025, 0.018, 0.012, 0.008], 2, w, 2.0))
        # gerbes de feuillage : grappes denses vers l'extérieur, retombantes
        nc = max(2, int(L / 0.42))
        for k in range(nc):
            tp = 0.25 + 0.75 * k / max(1, nc - 1)
            q, qd, _, w = br.at(tp)
            for _ in range(3):
                s = (0.8 + 0.4 * L / Rmax) * rng.uniform(0.8, 1.15) * (1.15 if giant else 1)
                vdir = norm(qd * 0.6 + t.out_n(q) * 0.4 + gn(rng, 0.45) + UP * rng.uniform(-0.5, 0.35))
                udir = rot(perp(vdir), vdir, rng.uniform(0, math.pi))
                q2 = q + gn(rng, 0.18) * (0.5 + L / Rmax)
                t.add_card(q2 - vdir * s * 0.3, vdir, udir, s, s, tiles[rng.randrange(3)], min(1.0, w + 0.25), keep1=(k == nc - 1))
                # carte croisée : la gerbe a du volume vue de profil comme de dessous
                if rng.random() < 0.7:
                    t.add_card(q2 - vdir * s * 0.3, vdir, norm(np.cross(vdir, udir)), s * 0.85, s * 0.85, tiles[rng.randrange(3)], min(1.0, w + 0.25))
    # flèche sommitale
    for k in range(7):
        q = np.array([0, H - 0.4 - k * 0.45, 0]) + rng.uniform(-0.05, 0.05)
        vdir = norm(np.array([math.cos(k * 2.4), 1.6, math.sin(k * 2.4)]))
        s = 1.1 + 0.15 * k
        t.add_card(q, vdir, rot(perp(vdir), vdir, rng.uniform(0, 3)), s, s, tiles[rng.randrange(3)], 0.5, keep1=True)
    # chicots de branches mortes sous le houppier (aspect des cèdres de forêt)
    for k in range(int(cb / 1.5)):
        h = rng.uniform(2.5, cb - 0.5)
        p, d, r, _ = trunk.at(h / H)
        dd = child_dir(UP, math.radians(rng.uniform(70, 100)), rng.uniform(0, 6.28))
        pts = curve(p, dd, rng.uniform(0.3, 0.9), 2, rng, curl=0.2)
        t.branches.append(Branch(pts, [0.035, 0.02, 0.008], 2))
    if giant:
        sugi_rope(t, r0)
    t.lod1_keep = 0.35
    return t


def sugi_rope(t, r0):
    """Shimenawa : corde de paille tressée autour du cèdre géant, avec papiers en zigzag (shide)."""
    mb = t.props
    h0 = 2.6
    R = r0 * 1.12 + 0.12
    n = 40
    rope = (0.76, 0.66, 0.42)
    # tore épais (corde) en 2 brins torsadés
    for strand in range(2):
        ring_prev = None
        for i in range(n + 1):
            a = 2 * math.pi * i / n
            c = np.array([math.cos(a) * R, h0 + 0.08 * math.sin(a * 3), math.sin(a) * R])
            tang = np.array([-math.sin(a), 0, math.cos(a)])
            tw = a * 6 + strand * math.pi
            c = c + (np.array([math.cos(a), 0, math.sin(a)]) * math.cos(tw) + UP * math.sin(tw)) * 0.06
            side = np.array([math.cos(a), 0, math.sin(a)])
            ring = []
            for j in range(7):
                b = 2 * math.pi * j / 6
                nn = side * math.cos(b) + UP * math.sin(b)
                ring.append(mb.add_vert(c + nn * 0.085, nn, (0, 0), rope))
            if ring_prev:
                for j in range(6):
                    mb.quad(ring_prev[j], ring[j], ring[j + 1], ring_prev[j + 1])
            ring_prev = ring
    # shide : 6 papiers blancs en zigzag
    for k in range(6):
        a = k / 6 * 2 * math.pi + 0.3
        c = np.array([math.cos(a) * (R + 0.08), h0 - 0.1, math.sin(a) * (R + 0.08)])
        tang = np.array([-math.sin(a), 0, math.cos(a)])
        nn = np.array([math.cos(a), 0, math.sin(a)])
        y = 0.0
        for z in range(4):
            off = tang * (0.07 if z % 2 else -0.07)
            a0 = mb.add_vert(c + off - tang * 0.07 - UP * y, nn, (0, 0), (0.95, 0.95, 0.92))
            a1 = mb.add_vert(c + off + tang * 0.07 - UP * y, nn, (0, 0), (0.95, 0.95, 0.92))
            a2 = mb.add_vert(c + off + tang * 0.07 - UP * (y + 0.12), nn, (0, 0), (0.95, 0.95, 0.92))
            a3 = mb.add_vert(c + off - tang * 0.07 - UP * (y + 0.12), nn, (0, 0), (0.95, 0.95, 0.92))
            mb.quad(a0, a3, a2, a1)
            mb.quad(a0, a1, a2, a3)
            y += 0.12


def matsu(seed, H):
    rng = random.Random(seed)
    t = Tree('matsu', H)
    lean_az = rng.uniform(0, 6.28)
    d0 = child_dir(UP, math.radians(rng.uniform(10, 22)), lean_az)
    nseg = 16
    tr = curve([0, 0, 0], d0, H * 1.02, nseg, rng, curl=0.22, up=0.05)
    trunk = Branch(tr, [0.3 * (1 - k / nseg) ** 0.9 + 0.04 for k in range(nseg + 1)], 0)
    trunk.flare, trunk.flare_h = 0.35, 0.8
    t.branches.append(trunk)
    top = tr[-1]
    t.crown_c = np.array([top[0] * 0.6, H * 0.68, top[2] * 0.6])
    t.crown_r = H * 0.38
    tiles = ATLAS['matsu']['leaf']
    pads = []
    n1 = rng.randint(9, 12)
    for i in range(n1):
        u = i / n1
        p, d, r, _ = trunk.at(0.32 + 0.6 * u)
        az = lean_az + math.pi + i * 2.4 + rng.uniform(-0.4, 0.4)
        L = (3.6 - 2.2 * u) * rng.uniform(0.8, 1.15) * H / 10
        dd = norm(np.array([math.cos(az), rng.uniform(-0.05, 0.25), math.sin(az)]))
        pts = curve(p, dd, L, 7, rng, curl=0.22, up=0.04)
        br = Branch(pts, [0.09 * (1 - 0.8 * k / 7) * (1.2 - u) + 0.015 for k in range(8)], 1, 0.1, 3.0)
        t.branches.append(br)
        pads.append((pts[-1], 0.9 + 0.5 * (1 - u), br.sway[-1]))
        for k in range(rng.randint(1, 3)):
            q, qd, _, w = br.at(rng.uniform(0.55, 0.85))
            sd = norm(child_dir(qd, math.radians(55), rng.uniform(0, 6.28)) * np.array([1, 0.25, 1]))
            spts = curve(q, sd, rng.uniform(0.6, 1.1), 3, rng, curl=0.2, up=0.1)
            t.branches.append(Branch(spts, [0.03, 0.022, 0.015, 0.01], 2, w, 2.0))
            pads.append((spts[-1], 0.6 + 0.3 * rng.random(), w))
    pads.append((top + np.array([0, 0.2, 0]), 1.2, 0.4))
    for c, R, w in pads:
        n = int(7 + R * 6)
        for k in range(n):
            off = np.array([rng.gauss(0, R * 0.45), rng.gauss(0, R * 0.12) + R * 0.1, rng.gauss(0, R * 0.45)])
            q = c + off
            if k < n * 0.7:  # cartes presque couchées (dessus du coussin)
                nrm = norm(UP + np.array([rng.gauss(0, 0.35), 0, rng.gauss(0, 0.35)]))
                vdir = norm(np.cross(nrm, perp(nrm)))
                vdir = rot(vdir, nrm, rng.uniform(0, 6.28))
                udir = np.cross(vdir, nrm)
            else:  # bord du coussin
                hd = norm(off * np.array([1, 0, 1]) + 1e-3)
                vdir = norm(UP * 0.3 + hd * 0.3 + np.array([0, 0.5, 0]))
                udir = norm(np.cross(UP, hd))
            s = R * rng.uniform(0.9, 1.3)
            t.add_card(q, vdir, udir, s, s, tiles[rng.randrange(4)], min(1, w + 0.2), keep1=(k < 2), nrm=norm(UP * 0.8 + norm(off) * 0.5))
    t.lod1_keep = 0.4
    return t


def deciduous(seed, H, kind):
    """Érable, cerisier, ginkgo, yuzu : tronc court ou flèche, charpentières, rameaux, cartes."""
    rng = random.Random(seed)
    t = Tree(kind, H)
    if kind == 'momiji':
        trunk_h, r0, n_lead, lead_ang, spread, lead_len = rng.uniform(1.4, 2.2), 0.24, rng.randint(3, 4), (22, 40), 0.55, H - 1.6
    elif kind == 'sakura':
        trunk_h, r0, n_lead, lead_ang, spread, lead_len = rng.uniform(1.6, 2.2), 0.34, rng.randint(4, 5), (45, 62), 0.8, H * 0.72
    elif kind == 'keyaki':
        trunk_h, r0, n_lead, lead_ang, spread, lead_len = rng.uniform(2.2, 3.0), 0.4, rng.randint(4, 6), (18, 38), 0.6, H * 0.68
    elif kind == 'yuzu':
        trunk_h, r0, n_lead, lead_ang, spread, lead_len = rng.uniform(0.5, 0.8), 0.085, rng.randint(4, 5), (30, 50), 0.6, H * 0.62
    else:  # ichou : flèche
        trunk_h, r0, n_lead, lead_ang, spread, lead_len = H * 0.98, 0.42, 0, (0, 0), 0, 0
    nseg = 8 if kind != 'ichou' else 20
    tr = curve([0, 0, 0], child_dir(UP, math.radians(rng.uniform(0, 6)), rng.uniform(0, 6.28)), trunk_h, nseg, rng, curl=0.08 if kind != 'ichou' else 0.03, up=0.05)
    taper = (lambda k: r0 * (1 - 0.25 * k / nseg)) if kind != 'ichou' else (lambda k: r0 * (1 - k / nseg) ** 1.1 + 0.04)
    trunk = Branch(tr, [taper(k) for k in range(nseg + 1)], 0)
    trunk.flare, trunk.flare_h = (0.45, 0.7) if kind != 'yuzu' else (0.3, 0.3)
    t.branches.append(trunk)
    leaf_tiles = ATLAS['sakura']['cluster'] if kind == 'sakura' else ATLAS[kind]['leaf']
    if kind == 'momiji':
        v = seed % 3
        leaf_tiles = [leaf_tiles[i] for i in ([0, 0, 1], [0, 1, 2], [2, 3, 2])[v]]
    crown_y = {'keyaki': H * 0.66, 'momiji': H * 0.62, 'sakura': H * 0.62, 'yuzu': H * 0.6, 'ichou': H * 0.6}[kind]
    crown_r = {'keyaki': H * 0.45, 'momiji': H * 0.55, 'sakura': H * 0.75, 'yuzu': H * 0.48, 'ichou': H * 0.28}[kind]
    t.crown_c, t.crown_r = np.array([0, crown_y, 0]), crown_r
    leaders = []
    top = tr[-1]
    if kind != 'ichou':
        az0 = rng.uniform(0, 6.28)
        for i in range(n_lead):
            az = az0 + i * 2 * math.pi / n_lead + rng.uniform(-0.4, 0.4)
            ang = math.radians(rng.uniform(*lead_ang))
            dd = child_dir(UP, ang, az)
            L = lead_len * rng.uniform(0.85, 1.1)
            pts = curve(top, dd, L, 9, rng, curl=0.16, up=0.06 if kind != 'sakura' else 0.02, grav=0.08 if kind == 'sakura' else 0.0)
            br = Branch(pts, [r0 * 0.62 * (1 - 0.82 * k / 9) + 0.02 for k in range(10)], 1, 0.0, 5.0)
            t.branches.append(br)
            leaders.append(br)
    else:
        # ginkgo : charpentières ascendantes le long de la flèche
        n1 = rng.randint(18, 24)
        for i in range(n1):
            u = i / n1
            p, d, r, _ = trunk.at(0.28 + 0.68 * u)
            dd = child_dir(UP, math.radians(48 + 10 * u + rng.uniform(-8, 8)), i * 2.4 + rng.uniform(-0.3, 0.3))
            L = (H * 0.32) * (1 - 0.65 * u) + 0.8
            pts = curve(p, dd, L, 6, rng, curl=0.12, up=0.04)
            br = Branch(pts, [0.09 * (1 - 0.7 * u) * (1 - 0.8 * k / 6) + 0.012 for k in range(7)], 1, 0.05, 3.0)
            t.branches.append(br)
            leaders.append(br)
    # rameaux de 2e ordre
    l2 = []
    for br in leaders:
        L = br.length()
        n2 = {'keyaki': 8, 'momiji': 7, 'sakura': 8, 'yuzu': 6, 'ichou': 3}[kind]
        for k in range(n2):
            tp = (0.25 if kind != 'ichou' else 0.3) + 0.7 * (k + rng.random() * 0.6) / n2
            q, qd, rq, w = br.at(min(0.98, tp))
            ang = math.radians(rng.uniform(40, 70))
            sd = child_dir(qd, ang, rng.uniform(0, 6.28))
            if kind in ('momiji', 'sakura', 'keyaki'):
                sd = norm(sd * np.array([1, 0.45, 1]) + t.out_n(q) * 0.4)
            ll = {'keyaki': rng.uniform(1.8, 3.2), 'momiji': rng.uniform(1.4, 2.8), 'sakura': rng.uniform(1.8, 3.2), 'yuzu': rng.uniform(0.5, 0.9), 'ichou': rng.uniform(0.7, 1.4)}[kind] * (1.1 - 0.4 * tp)
            pts = curve(q, sd, ll, 5, rng, curl=0.2, up=0.04, grav=0.05 if kind == 'sakura' else 0.02)
            b2 = Branch(pts, [max(0.012, rq * 0.45) * (1 - 0.75 * j / 5) + 0.006 for j in range(6)], 2, w, 2.5)
            t.branches.append(b2)
            l2.append(b2)
    # rameaux fins (3e ordre) et cartes
    every = {'keyaki': 0.32, 'momiji': 0.34, 'sakura': 0.36, 'yuzu': 0.22, 'ichou': 0.32}[kind]
    size = {'keyaki': 1.25, 'momiji': 0.95, 'sakura': 1.05, 'yuzu': 0.62, 'ichou': 0.9}[kind]
    face = {'keyaki': 'out', 'momiji': 'flat', 'sakura': 'out', 'yuzu': 'out', 'ichou': 'out'}[kind]
    for b2 in l2:
        if kind in ('momiji', 'sakura', 'keyaki'):
            for k in range(rng.randint(2, 3)):
                q, qd, rq, w = b2.at(rng.uniform(0.35, 0.9))
                sd = norm(child_dir(qd, math.radians(50), rng.uniform(0, 6.28)) * np.array([1, 0.4, 1]))
                pts = curve(q, sd, rng.uniform(0.5, 1.0), 3, rng, curl=0.25)
                b3 = Branch(pts, [0.012, 0.009, 0.007, 0.005], 3, w, 1.5)
                t.branches.append(b3)
                broad_cards(t, b3, leaf_tiles, every, size, rng, 0.3, face, 1)
        broad_cards(t, b2, leaf_tiles, every, size, rng, 0.25, face, 2 if kind != 'ichou' else 2)
    for br in leaders:
        broad_cards(t, br, leaf_tiles, every * 1.6, size, rng, 0.75, face, 1)
    if kind == 'ichou':
        for k in range(6):
            q = np.array([0, H - 0.3 - k * 0.5, 0])
            vdir = norm(np.array([math.cos(k * 2.4), 1.3, math.sin(k * 2.4)]))
            t.add_card(q, vdir, rot(perp(vdir), vdir, rng.uniform(0, 3)), 1.0, 1.0, leaf_tiles[rng.randrange(4)], 0.5, keep1=True)
    if kind == 'yuzu':
        # houppier dense et arrondi : coquille de cartes
        for k in range(150):
            a = rng.uniform(0, 6.28)
            el = rng.uniform(-0.5, 1.3)
            d = np.array([math.cos(a) * math.cos(el), math.sin(el) * 0.8, math.sin(a) * math.cos(el)])
            c = t.crown_c + d * t.crown_r * rng.uniform(0.6, 0.95)
            nrm = norm(d)
            vdir = rot(perp(nrm), nrm, rng.uniform(0, 6.28))
            s_ = rng.uniform(0.55, 0.75)
            t.add_card(c - vdir * s_ * 0.5, vdir, np.cross(vdir, nrm), s_, s_, leaf_tiles[rng.randrange(4)], 0.5, keep1=(k % 3 == 0), nrm=nrm)
        # fruits : sous la surface extérieure du houppier
        n = rng.randint(42, 55)
        for k in range(n):
            a = rng.uniform(0, 6.28)
            el = rng.uniform(-0.6, 0.7)
            d = np.array([math.cos(a) * math.cos(el), math.sin(el) * 0.75, math.sin(a) * math.cos(el)])
            c = t.crown_c + d * t.crown_r * rng.uniform(0.9, 1.04)
            t.fruits.append((c, rng.uniform(0.065, 0.08)))
    t.lod1_keep = 0.3 if kind != 'yuzu' else 0.35
    return t


def shidare(seed, H):
    """Cerisier pleureur (shidare-zakura) : vieux tronc, charpentières en arc, rameaux pendants fleuris, béquilles."""
    rng = random.Random(seed)
    t = Tree('sakura', H)
    nseg = 10
    tr = curve([0, 0, 0], child_dir(UP, 0.08, 1.0), 3.2, nseg, rng, curl=0.1, up=0.03)
    trunk = Branch(tr, [0.62 * (1 - 0.3 * k / nseg) for k in range(nseg + 1)], 0)
    trunk.flare, trunk.flare_h, trunk.lobes = 0.55, 1.0, 6
    t.branches.append(trunk)
    t.crown_c = np.array([0, H * 0.55, 0])
    t.crown_r = H * 0.55
    strips = ATLAS['sakura']['strip']
    clusters = ATLAS['sakura']['cluster']
    top = tr[-1]
    arcs = []
    limbs = []
    for i in range(5):
        az = i * 2 * math.pi / 5 + rng.uniform(-0.3, 0.3)
        dd = child_dir(UP, math.radians(rng.uniform(28, 45)), az)
        pts = curve(top, dd, H * 0.62, 10, rng, curl=0.12, up=0.0, grav=0.18)
        br = Branch(pts, [0.36 * (1 - 0.8 * k / 10) + 0.03 for k in range(11)], 1, 0.0, 6.0)
        t.branches.append(br)
        limbs.append((br, az))
        for k in range(6):
            q, qd, rq, w = br.at(0.3 + 0.12 * k)
            sd = child_dir(qd, math.radians(rng.uniform(40, 70)), rng.uniform(0, 6.28))
            sd = norm(sd + t.out_n(q) * 0.6 + UP * 0.3)
            p2 = curve(q, sd, rng.uniform(2.2, 4.0), 6, rng, curl=0.15, up=0.0, grav=0.35)
            b2 = Branch(p2, [rq * 0.5 * (1 - 0.8 * j / 6) + 0.01 for j in range(7)], 2, w, 3.0)
            t.branches.append(b2)
            arcs.append(b2)
    # rameaux pendants
    for b2 in arcs:
        L = b2.length()
        n = int(L / 0.4)
        for k in range(n):
            q, qd, rq, w = b2.at(0.2 + 0.8 * k / max(1, n - 1))
            ln = min(q[1] - 0.9, rng.uniform(3.0, 7.0))
            if ln < 1.0:
                continue
            outw = norm(t.out_n(q) * np.array([1, 0, 1]) + 1e-3)
            sp = curve(q, norm(-UP + outw * 0.18), ln, 5, rng, curl=0.04, hold=0.6)
            st = Branch(sp, [0.012, 0.01, 0.009, 0.008, 0.007, 0.006], 3, min(1, w + 0.3), 2.0)
            t.branches.append(st)
            # cartes en bande verticale le long du rameau (tuile : rameau partant du haut)
            nc = max(1, int(ln / 1.5))
            for c in range(nc):
                p0, d0, _, ww = st.at(c / nc)
                hgt = ln / nc * 1.15
                a = rng.uniform(0, 6.28)
                udir = np.array([math.cos(a), 0, math.sin(a)])
                vdir = -d0  # haut de la tuile = haut du rameau
                t.add_card(p0, vdir, udir, 0.85, hgt, strips[rng.randrange(2)], min(1, ww + 0.1), keep1=(c == 0), nrm=norm(outw + UP * 0.2), flut=(0.6, 1.0))
                if True:
                    t.add_card(p0, vdir, np.cross(UP, udir), 0.75, hgt, strips[rng.randrange(2)], min(1, ww + 0.1), nrm=norm(outw + UP * 0.2), flut=(0.6, 1.0))
    # dôme fleuri au-dessus des charpentières
    for b2 in arcs:
        broad_cards(t, b2, clusters, 0.6, 1.15, rng, 0.1, 'out', 1)
    for br, az in limbs:
        broad_cards(t, br, clusters, 0.8, 1.2, rng, 0.45, 'out', 1)
    # béquilles de bois (4) sous les charpentières et corde autour du tronc
    wood = (0.40, 0.29, 0.19)
    for br, az in limbs[:4]:
        q, qd, rq, w = br.at(0.42)
        foot = np.array([q[0] * 1.05, 0.0, q[2] * 1.05])
        prop_pole(t.props, foot, q - UP * (rq + 0.05), 0.07, wood)
    t.lod1_keep = 0.28
    t.lod1_level = 2
    return t


def prop_pole(mb, a, b, r, col, sides=6):
    d = norm(b - a)
    s = perp(d)
    o = np.cross(d, s)
    rings = []
    for p in (a, b):
        ring = []
        for j in range(sides + 1):
            ang = 2 * math.pi * j / sides
            n = s * math.cos(ang) + o * math.sin(ang)
            ring.append(mb.add_vert(p + n * r, n, (0, 0), col))
        rings.append(ring)
    for j in range(sides):
        mb.quad(rings[0][j], rings[0][j + 1], rings[1][j + 1], rings[1][j])
    # fourche en Y au sommet
    for sgn in (-1, 1):
        tip = b + s * 0.22 * sgn + d * 0.25
        q = []
        for p, rr in ((b, r * 0.8), (tip, r * 0.6)):
            dd = norm(tip - b)
            ss = perp(dd)
            oo = np.cross(dd, ss)
            ring = []
            for j in range(sides + 1):
                ang = 2 * math.pi * j / sides
                n = ss * math.cos(ang) + oo * math.sin(ang)
                ring.append(mb.add_vert(p + n * rr, n, (0, 0), col))
            q.append(ring)
        for j in range(sides):
            mb.quad(q[0][j], q[0][j + 1], q[1][j + 1], q[1][j])


def take(seed, n_culms):
    """Touffe de bambous : chaumes à nœuds (texture take_culm), rameaux aux nœuds hauts, cartes de feuilles."""
    rng = random.Random(seed)
    t = Tree('take', 12)
    t.crown_c = np.array([0, 9.5, 0])
    t.crown_r = 3.5
    tiles = ATLAS['take']['leaf']
    for c in range(n_culms):
        a = rng.uniform(0, 6.28)
        rr = rng.uniform(0, 0.7)
        base = np.array([math.cos(a) * rr, 0, math.sin(a) * rr])
        H = rng.uniform(9, 13)
        lean = child_dir(UP, math.radians(rng.uniform(2, 8)), a if rr > 0.1 else rng.uniform(0, 6.28))
        nseg = 12
        pts = curve(base, lean, H, nseg, rng, curl=0.012, grav=0.025)
        R = rng.uniform(0.045, 0.07)
        br = Branch(pts, [R * (1 - 0.55 * k / nseg) for k in range(nseg + 1)], 0)
        br.sway = [0.0 + 0.6 * (k / nseg) ** 2 for k in range(nseg + 1)]
        br.is_culm = True
        t.branches.append(br)
        node = 0.38
        s = H * 0.5
        while s < H - 0.2:
            q, qd, rq, w = br.at(s / H)
            for k in range(rng.randint(1, 2)):
                sd = child_dir(qd, math.radians(rng.uniform(50, 70)), rng.uniform(0, 6.28))
                ln = rng.uniform(0.5, 1.1) * (1.2 - 0.4 * s / H)
                tw = curve(q, sd, ln, 3, rng, curl=0.2, grav=0.12)
                b2 = Branch(tw, [0.008, 0.006, 0.005, 0.004], 2, w, 1.0)
                t.branches.append(b2)
                for j in range(rng.randint(1, 2)):
                    p, d, _, ww = b2.at(rng.uniform(0.4, 1.0))
                    vdir = norm(-(d * np.array([1, 0, 1])) * 0.3 - UP * 0.15 + gn(rng, 0.2))
                    # tuile : le rameau part du coin haut-gauche et descend vers la droite
                    udir = norm(np.cross(UP, d) + gn(rng, 0.2))
                    t.add_card(p, norm(UP * 0.6 + d * 0.5), udir, 0.95, 0.95, tiles[rng.randrange(4)], min(1, ww + 0.25), keep1=(j == 0 and k == 0))
            s += node * rng.uniform(1.6, 2.4)
        # bouquet sommital retombant
        tip = pts[-1]
        for k in range(5):
            vdir = norm(np.array([math.cos(k * 1.3), 0.6, math.sin(k * 1.3)]))
            t.add_card(tip - UP * 0.3 * k, vdir, norm(np.cross(UP, vdir)), 1.0, 1.0, tiles[rng.randrange(4)], 0.7, keep1=True)
    t.lod1_keep = 0.3
    return t


def tsutsuji(seed, H, flowers):
    rng = random.Random(seed)
    t = Tree('tsutsuji', H)
    W = H * rng.uniform(1.3, 1.7)
    t.crown_c = np.array([0, H * 0.5, 0])
    t.crown_r = W * 0.5
    tiles = ATLAS['tsutsuji']['leaf']
    for k in range(5):
        dd = child_dir(UP, math.radians(rng.uniform(20, 50)), rng.uniform(0, 6.28))
        pts = curve([0, 0, 0], dd, H * 0.7, 3, rng, curl=0.3)
        t.branches.append(Branch(pts, [0.025, 0.02, 0.014, 0.01], 1, 0.0, 1.5))
    n = int(40 + 30 * H)
    for k in range(n):
        a = rng.uniform(0, 6.28)
        el = rng.uniform(-0.15, 1.2)
        d = np.array([math.cos(a) * math.cos(el), math.sin(el), math.sin(a) * math.cos(el)])
        c = np.array([0, H * 0.45, 0]) + d * np.array([W * 0.5, H * 0.55, W * 0.5]) * rng.uniform(0.7, 1.0)
        nrm = norm(d)
        vdir = rot(perp(nrm), nrm, rng.uniform(0, 6.28))
        udir = np.cross(vdir, nrm)
        tile = tiles[3] if flowers and rng.random() < 0.45 else tiles[rng.randrange(3)]
        s = rng.uniform(0.45, 0.6) * (0.7 + 0.3 * H)
        t.add_card(c - vdir * s * 0.5, vdir, udir, s, s, tile, 0.3 + 0.4 * (c[1] / H), keep1=(k % 4 == 0), nrm=nrm, flut=(0.4, 0.8))
    t.lod1_keep = 0.35
    return t


def fern(seed):
    rng = random.Random(seed)
    t = Tree('fern', 0.8)
    t.crown_c = np.array([0, 0.1, 0])
    t.crown_r = 0.8
    tiles = ATLAS['fern']['frond']
    n = rng.randint(9, 13)
    for k in range(n):
        a = k / n * 6.28 + rng.uniform(-0.2, 0.2)
        L = rng.uniform(0.55, 0.95)
        hd = np.array([math.cos(a), 0, math.sin(a)])
        vdir = norm(UP * rng.uniform(1.4, 2.4) + hd)
        udir = norm(np.cross(UP, hd))
        tile = tiles[3] if rng.random() < 0.15 else tiles[rng.randrange(3)]
        t.add_card(hd * 0.04, vdir, udir, 0.26, L, tile, 0.0, keep1=(k % 2 == 0), segs=4, bend=0.32, gdir=norm(hd - UP), nrm=norm(UP + hd * 0.3), flut=(0.0, 1.0))
    t.lod1_keep = 0.5
    return t


def susuki(seed, top):
    """Touffe d'eulalie : lames arquées (3 cartes croisées) et plumets argentés qui dépassent jusqu'à `top` m."""
    rng = random.Random(seed)
    t = Tree('susuki', top)
    t.crown_c = np.array([0, 0.4, 0])
    t.crown_r = 1.0
    bl = ATLAS['susuki']['blade'][0]
    pl = ATLAS['susuki']['plume']
    hb = top * 0.68
    for k in range(3):
        a = k / 3 * math.pi + rng.uniform(-0.2, 0.2)
        udir = np.array([math.cos(a), 0, math.sin(a)])
        t.add_card([0, 0, 0], UP, udir, hb * 1.05, hb, bl, 0.0, keep1=(k < 2), segs=3, bend=0.0, nrm=norm(UP + np.cross(UP, udir) * 0.3), flut=(0.0, 1.0))
    for k in range(rng.randint(3, 5)):
        a = rng.uniform(0, 6.28)
        hd = np.array([math.cos(a), 0, math.sin(a)])
        tilt = rng.uniform(0.08, 0.32)
        vdir = norm(UP + hd * tilt)
        L = top * rng.uniform(0.5, 0.62)
        base = vdir * (top - L) * 1.0 + hd * 0.04
        udir = np.cross(UP, hd)
        t.add_card(base, vdir, udir, L * 0.42, L, pl[rng.randrange(2)], 0.0, keep1=(k < 3), segs=2, bend=0.06, gdir=hd, nrm=norm(UP * 0.5 + hd), flut=(0.5, 1.0))
    t.lod1_keep = 0.6
    return t


def ine(seed):
    rng = random.Random(seed)
    t = Tree('ine', 0.75)
    t.crown_c = np.array([0, 0.3, 0])
    t.crown_r = 0.4
    tiles = ATLAS['ine']['tuft']
    a0 = rng.uniform(0, 3)
    for k in range(2):
        a = a0 + k * math.pi / 2
        udir = np.array([math.cos(a), 0, math.sin(a)])
        h = rng.uniform(0.65, 0.8)
        t.add_card([0, 0, 0], UP, udir, h * 0.5, h, tiles[k], 0.0, keep1=True, segs=2, nrm=UP, flut=(0.0, 1.0))
    return t


def stump(seed, kind):
    """Souche (kind = 'souche') ou tronc couché moussu (kind = 'tronc')."""
    rng = random.Random(seed)
    t = Tree('misc', 1.0)
    if kind == 'souche':
        pts = [np.array([0, -0.2, 0]), np.array([0, 0.25, 0]), np.array([0.02, rng.uniform(0.5, 0.8), 0])]
        br = Branch(pts, [0.45, 0.36, 0.33], 0)
        br.flare, br.flare_h, br.lobes = 0.8, 0.6, 5
    else:
        L = rng.uniform(4, 7)
        pts = curve([-L / 2, 0.3, 0], [1, 0.02, 0], L, 6, rng, curl=0.04)
        br = Branch(pts, [0.32 * (1 - 0.3 * k / 6) for k in range(7)], 0)
    t.branches.append(br)
    return t


# ============================================================================================ EXPORT BLENDER
def to_blender(mb, name, coll):
    import bpy
    P = np.array(mb.p)
    verts = [(x, -z, y) for x, y, z in P]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], mb.f)
    me.update()
    # UV par coin (image : v vers le bas → Blender : v vers le haut)
    uvl = me.uv_layers.new(name='UVMap')
    uv = np.array(mb.uv, float)
    loops = np.zeros(len(me.loops), int)
    me.loops.foreach_get('vertex_index', loops)
    luv = uv[loops]
    luv[:, 1] = 1 - luv[:, 1]
    uvl.data.foreach_set('uv', luv.ravel())
    col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    C = np.ones((len(mb.c), 4))
    C[:, :3] = np.array(mb.c, float)
    col.data.foreach_set('color', C.ravel())
    me.color_attributes.active_color = col
    N = np.array(mb.n)
    me.normals_split_custom_set_from_vertices([(x, -z, y) for x, y, z in N])
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def export(species, trees):
    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)
    coll = bpy.context.scene.collection
    stats = []
    for k, tree in enumerate(trees):
        for lod in (0, 1):
            parts = tree.build(lod, random.Random(1000 + k))
            for part, mb in parts.items():
                if mb is None or not mb.f:
                    continue
                to_blender(mb, f'v{k}_lod{lod}_{part}', coll)
                stats.append(f'v{k} lod{lod} {part}: {mb.tris} tri')
    path = os.path.join(OUT, species + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=False, export_yup=True,
                              export_texcoords=True, export_normals=True, export_vertex_color='ACTIVE',
                              export_materials='NONE', export_animations=False, export_apply=False)
    print(species, os.path.getsize(path) // 1024, 'Ko :', '; '.join(stats))


SPECIES = {
    'sugi': lambda: [sugi(1, 24), sugi(2, 28), sugi(3, 20)],
    'sugi-geant': lambda: [sugi(7, 34, giant=True)],
    'matsu': lambda: [matsu(11, 10.5), matsu(12, 8.5), matsu(13, 12)],
    'momiji': lambda: [deciduous(21, 8.5, 'momiji'), deciduous(22, 7.5, 'momiji'), deciduous(23, 9, 'momiji')],
    'sakura': lambda: [deciduous(31, 8.5, 'sakura'), deciduous(32, 7.5, 'sakura')],
    'shidare': lambda: [shidare(41, 13)],
    'ichou': lambda: [deciduous(51, 14, 'ichou')],
    'keyaki': lambda: [deciduous(131, 12, 'keyaki'), deciduous(132, 10.5, 'keyaki'), deciduous(133, 13, 'keyaki')],
    'yuzu': lambda: [deciduous(61, 3.6, 'yuzu'), deciduous(62, 3.2, 'yuzu'), deciduous(63, 3.9, 'yuzu')],
    'take': lambda: [take(71, 7), take(72, 5), take(73, 9)],
    'tsutsuji': lambda: [tsutsuji(81, 1.1, False), tsutsuji(82, 1.4, True), tsutsuji(83, 1.8, False)],
    'fern': lambda: [fern(91), fern(92), fern(93)],
    'susuki': lambda: [susuki(101, 1.25), susuki(102, 1.45), susuki(103, 1.6)],
    'ine': lambda: [ine(111), ine(112)],
    'misc': lambda: [stump(121, 'souche'), stump(122, 'souche'), stump(123, 'tronc')],
}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    names = sys.argv[1:] or list(SPECIES)
    for s in names:
        export(s, SPECIES[s]())
