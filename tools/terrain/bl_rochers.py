"""Rochers et affleurements du monde (spécialité Terrain & relief) : sculptés par champs de distance, cuits dans Blender.

Usage : L:\\CLAUDE\\CapyWorld\\.venv-blender\\Scripts\\python.exe -I tools/terrain/bl_rochers.py [--fast] [id ...]

Logique « géologue » : chaque famille a sa forme et sa raison d'être sur le relief (voir rochers.py pour le placement).
  - barres litées (barre-a, barre-b, barre-c, dalle) : bancs de calcaire ou de grès empilés ; chaque banc a sa dureté
    (recul plus ou moins fort du front), ses joints de stratification creusés en gorges, des diaclases verticales qui
    traversent les bancs en couloirs, une corniche en surplomb (barre-c), un dessus de lapiaz fissuré (dalle) ;
  - blocs fracturés (bloc-a, bloc-b, bloc-c, gendarme) : polyèdres de diaclases (trois familles orthogonales
    + plans obliques), arêtes écornées, cicatrices conchoïdales, fissures qui s'arrêtent dans la masse ; le gendarme est
    une tour de crête à joints horizontaux qui casse les silhouettes des arêtes ;
  - éboulis anguleux (eboulis-a, b, c) : fragments vifs, plats ou trapus, de 0,3 à 2,5 m ;
  - roches moutonnées (moutonnee-a, b) : dos de baleine poli par le glacier côté amont (stries parallèles au sens de
    l'écoulement, cannelures), face aval arrachée en gradins de diaclases.
Chaîne : champ de distance (numba) sur une grille → maillage « surface nets » → projection exacte sur le champ → Blender :
LOD0/1/2 par décimation (UV partagées), cuisson Cycles (GPU) des normales et de l'occlusion ambiante du maillage haute
définition, courbure et variation en couleur de sommet cuites en émission. Sorties dans public/assets/terrain/rochers/ :
<id>.glb (nœuds <id>_lod0.._lod2), <id>_nor.webp, <id>_mask.webp (R occlusion, V courbure, B variation), rochers.json.
"""
import json
import math
import os
import shutil
import subprocess
import sys
import time

import numpy as np
from numba import njit, prange
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'terrain', 'rochers')
CACHE = os.path.join(HERE, 'cache', 'rochers')
FAST = '--fast' in sys.argv
ONLY = [a for a in sys.argv[1:] if not a.startswith('--')]
GLTFPACK = os.path.join(ROOT, '..', 'CapyWorld', 'tools', 'polyhaven', 'node_modules', 'gltfpack', 'cli.js')


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


# ------------------------------------------------------------------------------------------------ bruit (numba)
@njit(cache=True, inline='always')
def _h3(ix, iy, iz, s):
    h = (ix * 374761393 + iy * 668265263 + iz * 1274126177 + s * 1442695041) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h = h ^ (h >> 16)
    return (h & 0xFFFFFF) / 16777215.0


@njit(cache=True)
def vn3(x, y, z, s):
    ix, iy, iz = math.floor(x), math.floor(y), math.floor(z)
    fx, fy, fz = x - ix, y - iy, z - iz
    ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
    uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
    uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10)
    ix, iy, iz = int(ix), int(iy), int(iz)
    a = _h3(ix, iy, iz, s) + (_h3(ix + 1, iy, iz, s) - _h3(ix, iy, iz, s)) * ux
    b = _h3(ix, iy + 1, iz, s) + (_h3(ix + 1, iy + 1, iz, s) - _h3(ix, iy + 1, iz, s)) * ux
    c = _h3(ix, iy, iz + 1, s) + (_h3(ix + 1, iy, iz + 1, s) - _h3(ix, iy, iz + 1, s)) * ux
    d = _h3(ix, iy + 1, iz + 1, s) + (_h3(ix + 1, iy + 1, iz + 1, s) - _h3(ix, iy + 1, iz + 1, s)) * ux
    e = a + (b - a) * uy
    f = c + (d - c) * uy
    return (e + (f - e) * uz) * 2.0 - 1.0


@njit(cache=True)
def fbm3(x, y, z, oc, s):
    t, a, n = 0.0, 1.0, 0.0
    for o in range(oc):
        # rotation entre octaves (pas d'alignement sur la grille)
        x, y, z = 0.8 * x - 0.6 * z + 0.31, y * 1.0 + 0.17, 0.6 * x + 0.8 * z - 0.23
        t += a * vn3(x, y, z, s + o * 7)
        n += a
        a *= 0.5
        x, y, z = x * 2.03, y * 2.03, z * 2.03
    return t / n


@njit(cache=True)
def ridge3(x, y, z, oc, s):
    """Bruit en crêtes (0..1) : arêtes vives, fissures."""
    t, a, n = 0.0, 1.0, 0.0
    for o in range(oc):
        v = 1.0 - abs(vn3(x, y, z, s + o * 13))
        t += a * v * v
        n += a
        a *= 0.5
        x, y, z = x * 2.1 + 0.4, y * 2.1 - 0.3, z * 2.1 + 0.2
    return t / n


@njit(cache=True, inline='always')
def smax(a, b, k):
    if k <= 0:
        return max(a, b)
    h = max(k - abs(a - b), 0.0) / k
    return max(a, b) + h * h * k * 0.25


@njit(cache=True, inline='always')
def smin(a, b, k):
    return -smax(-a, -b, k)


@njit(cache=True, inline='always')
def gauss(u, w):
    return math.exp(-(u / w) * (u / w))


# ------------------------------------------------------------------------------------------------ champs des familles
# Paramètres : G (scalaires), BED (bancs : y0, y1, recul avant, recul arrière, recul côtés, gorge, arrondi, ondulation),
# PL (plans : nx, ny, nz, o), SP (cicatrices : cx, cy, cz, r), CR (fissures : nx, ny, nz, o, largeur, cx, cy, cz, rayon),
# JT (diaclases : position x, angle, profondeur, largeur)

KIND_BAR, KIND_POLY, KIND_MOUT = 0, 1, 2


@njit(cache=True)
def sdf(x, y, z, kind, G, BED, PL, SP, CR, JT):
    seed = int(G[0])
    ybot = G[1]
    if kind == KIND_BAR:
        L2, D2, dip, dipz = G[2], G[3], G[4], G[5]
        zeta = y - dip * x - dipz * z
        d = 1e9
        nb = BED.shape[0]
        for k in range(nb):
            y0, y1, rf, rb, rs, gr, rr, wob = BED[k, 0], BED[k, 1], BED[k, 2], BED[k, 3], BED[k, 4], BED[k, 5], BED[k, 6], BED[k, 7]
            if k == 0:
                y0 = ybot - 1.0
            # contour du banc : front (z > 0) et dos (z < 0) reculés selon la dureté, bords ondulés
            ow = wob * (fbm3(x / 2.7, k * 3.1, z / 2.7, 3, seed + 11) + 0.35 * fbm3(x / 0.9, k * 1.7 + 0.5, z / 0.9, 2, seed + 12))
            qx = abs(x) - (L2 - rs) - 0.4 * wob * fbm3(z / 1.9, k * 2.3, 0.0, 2, seed + 13)
            qz = (z - (D2 - rf)) if z > 0 else (-z - (D2 - rb))
            ox, oz = max(qx, 0.0), max(qz, 0.0)
            d2 = math.sqrt(ox * ox + oz * oz) + min(max(qx, qz), 0.0) + ow
            dy = max(y0 - zeta, zeta - y1)
            db = smax(d2, dy, rr)
            d = min(d, db)
        # gorges des joints de stratification (le front se creuse au droit de chaque plan)
        g = 0.0
        for k in range(1, nb):
            g = max(g, BED[k, 5] * gauss(zeta - BED[k, 0], 0.05 + 0.6 * BED[k, 5]))
        d += g * (0.7 + 0.3 * fbm3(x / 1.3, zeta / 1.3, z / 1.3, 2, seed + 14))
        # diaclases verticales : couloirs étroits qui traversent les bancs
        for j in range(JT.shape[0]):
            ca, sa = math.cos(JT[j, 1]), math.sin(JT[j, 1])
            u = (x - JT[j, 0]) * ca + z * sa + 0.12 * fbm3(y / 0.8, z / 0.8, x / 3.0, 2, seed + 20 + j)
            d += JT[j, 2] * gauss(u, JT[j, 3]) * (0.6 + 0.4 * smax(0.0, (zeta - ybot) / max(G[6], 0.1), 0.2))
        # lapiaz (dessus de la dalle) : rigoles de dissolution en réseau
        if G[7] > 0:
            top = BED[nb - 1, 1]
            r = ridge3(x / 1.6, 0.0, z / 1.6, 3, seed + 30)
            d += G[7] * r * r * r * gauss(zeta - top, 0.35)
        # usure : grandes bosses, grain, écailles
        d += G[8] * fbm3(x / 2.4, y / 2.4, z / 2.4, 3, seed + 40)
        d += G[9] * fbm3(x / 0.45, y / 0.45, z / 0.45, 3, seed + 41)
        d += G[10] * (ridge3(x / 0.7, y / 0.25, z / 0.7, 2, seed + 42) - 0.5) * max(0.0, fbm3(x / 2.5, y / 2.5, z / 2.5, 2, seed + 43) + 0.25)
    elif kind == KIND_POLY:
        # polyèdre de diaclases à arêtes adoucies (maximum « doux » des plans, rayon G[2])
        k = G[2]
        m = -1e9
        for i in range(PL.shape[0]):
            v = PL[i, 0] * x + PL[i, 1] * y + PL[i, 2] * z - PL[i, 3]
            if v > m:
                m = v
        acc = 0.0
        for i in range(PL.shape[0]):
            v = PL[i, 0] * x + PL[i, 1] * y + PL[i, 2] * z - PL[i, 3]
            acc += math.exp((v - m) / k)
        d = m + k * math.log(acc) - k * 0.55
        # cicatrices conchoïdales (éclats arrachés)
        for i in range(SP.shape[0]):
            dx, dy, dz = x - SP[i, 0], y - SP[i, 1], z - SP[i, 2]
            d = smax(d, SP[i, 3] - math.sqrt(dx * dx + dy * dy + dz * dz), 0.03)
        # fissures qui s'arrêtent dans la masse
        for i in range(CR.shape[0]):
            v = CR[i, 0] * x + CR[i, 1] * y + CR[i, 2] * z - CR[i, 3] + 0.04 * fbm3(x / 0.5, y / 0.5, z / 0.5, 2, seed + 50 + i)
            dx, dy, dz = x - CR[i, 5], y - CR[i, 6], z - CR[i, 7]
            reach = max(0.0, 1.0 - math.sqrt(dx * dx + dy * dy + dz * dz) / CR[i, 8])
            w = CR[i, 4] * reach
            if w > 0:
                d = smax(d, w - abs(v), 0.01)
        # joints horizontaux (gendarme, bloc de granite en écailles)
        if G[3] > 0:
            ph = y / G[4] + 0.6 * fbm3(x / 2.0, y / 6.0, z / 2.0, 2, seed + 60)
            f = ph - math.floor(ph)
            d += G[3] * gauss(min(f, 1.0 - f), 0.06)
        # effilement vers le haut (tour de crête)
        if G[5] != 0:
            d += G[5] * max(0.0, y) * (0.6 + 0.4 * fbm3(x / 1.5, y / 2.0, z / 1.5, 2, seed + 61))
        d += G[8] * fbm3(x / 1.6, y / 1.6, z / 1.6, 3, seed + 40)
        d += G[9] * fbm3(x / 0.35, y / 0.35, z / 0.35, 3, seed + 41)
        d += G[10] * (ridge3(x / 0.5, y / 0.5, z / 0.5, 3, seed + 42) - 0.5) * max(0.0, fbm3(x / 1.8, y / 1.8, z / 1.8, 2, seed + 43) + 0.2)
    else:
        # roche moutonnée : dos poli (amont, x < 0) et face arrachée en gradins (aval, x > 0)
        A0, A1, B, C, e = G[2], G[3], G[4], G[5], G[6]
        ax = A0 if x < 0 else A1
        u = abs(x) / ax
        w = abs(z) / C
        v = max(y, 0.0) / B
        r = (u ** e + w ** e) ** (2.2 / e) + v ** 2.2
        d = (r ** (1.0 / 2.2) - 1.0) * min(B, C) * 0.9
        if y < 0:
            d = max(((u ** e + w ** e) ** (1.0 / e) - 1.0) * min(ax, C) * 0.9, -1.0)
        # gradins d'arrachement : union des quadrants (x ≤ xj et y ≤ yj), plans de diaclases inclinés
        st = 1e9
        for j in range(JT.shape[0]):
            xj, yj, tilt = JT[j, 0], JT[j, 1], JT[j, 2]
            sx = (x - xj) * math.cos(tilt) + y * math.sin(tilt) + 0.05 * fbm3(y / 0.7, z / 0.7, x, 2, seed + 70 + j)
            sy = y - yj + 0.04 * fbm3(x / 0.8, z / 0.8, y, 2, seed + 80 + j)
            st = min(st, smax(sx, sy, 0.04))
        if JT.shape[0] > 0:
            d = smax(d, st, 0.05)
        polish = max(0.0, min(1.0, 0.5 - x / ax)) * max(0.0, min(1.0, y / (0.3 * B)))
        # stries glaciaires et cannelures, parallèles à l'écoulement (axe x)
        zz = z + 0.25 * fbm3(x / 4.0, y, z / 4.0, 2, seed + 90)
        stri = math.sin(zz * 31.0 + 2.0 * fbm3(x / 0.9, y, z * 3.0, 2, seed + 91))
        flute = math.sin(zz * 2.3 + 0.7) ** 6
        d += polish * (G[7] * stri * gauss(fbm3(x / 1.5, y / 1.5, z / 1.5, 2, seed + 92) - 0.2, 0.5) + G[8] * flute)
        rough = 1.0 - polish
        d += G[9] * fbm3(x / 1.8, y / 1.8, z / 1.8, 3, seed + 40) + rough * G[10] * fbm3(x / 0.3, y / 0.3, z / 0.3, 3, seed + 41)
    return max(d, ybot - y)


@njit(cache=True, parallel=True)
def sample_grid(o, vox, nx, ny, nz, kind, G, BED, PL, SP, CR, JT):
    F = np.empty((nx, ny, nz), np.float32)
    for i in prange(nx):
        x = o[0] + i * vox
        for j in range(ny):
            y = o[1] + j * vox
            for k in range(nz):
                F[i, j, k] = sdf(x, y, o[2] + k * vox, kind, G, BED, PL, SP, CR, JT)
    return F


@njit(cache=True, parallel=True)
def project(P, eps, steps, maxmove, kind, G, BED, PL, SP, CR, JT):
    """Projection exacte des sommets sur la surface (Newton sur le champ)."""
    out = P.copy()
    for n in prange(P.shape[0]):
        x, y, z = P[n, 0], P[n, 1], P[n, 2]
        x0, y0, z0 = x, y, z
        for s in range(steps):
            f = sdf(x, y, z, kind, G, BED, PL, SP, CR, JT)
            gx = (sdf(x + eps, y, z, kind, G, BED, PL, SP, CR, JT) - sdf(x - eps, y, z, kind, G, BED, PL, SP, CR, JT)) / (2 * eps)
            gy = (sdf(x, y + eps, z, kind, G, BED, PL, SP, CR, JT) - sdf(x, y - eps, z, kind, G, BED, PL, SP, CR, JT)) / (2 * eps)
            gz = (sdf(x, y, z + eps, kind, G, BED, PL, SP, CR, JT) - sdf(x, y, z - eps, kind, G, BED, PL, SP, CR, JT)) / (2 * eps)
            g2 = gx * gx + gy * gy + gz * gz + 1e-12
            x -= f * gx / g2
            y -= f * gy / g2
            z -= f * gz / g2
        dx, dy, dz = x - x0, y - y0, z - z0
        dl = math.sqrt(dx * dx + dy * dy + dz * dz)
        if dl > maxmove:
            x, y, z = x0 + dx / dl * maxmove, y0 + dy / dl * maxmove, z0 + dz / dl * maxmove
        out[n, 0], out[n, 1], out[n, 2] = x, y, z
    return out


@njit(cache=True)
def surface_nets(F, o, vox):
    """Maillage « surface nets » : un sommet par cellule traversée (moyenne des passages par zéro), un quadrilatère
    par arête de la grille qui change de signe."""
    nx, ny, nz = F.shape
    idx = -np.ones((nx, ny, nz), np.int64)
    V = np.empty((nx * ny * 6, 3), np.float64)
    nv = 0
    E = np.array([[0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1], [0, 1, 1, 1, 1, 1],
                  [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0], [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1],
                  [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1]])
    for i in range(nx - 1):
        for j in range(ny - 1):
            for k in range(nz - 1):
                neg = 0
                for a in range(2):
                    for b in range(2):
                        for c in range(2):
                            if F[i + a, j + b, k + c] < 0:
                                neg += 1
                if neg == 0 or neg == 8:
                    continue
                sx = sy = sz = 0.0
                cnt = 0
                for e in range(12):
                    f0 = F[i + E[e, 0], j + E[e, 1], k + E[e, 2]]
                    f1 = F[i + E[e, 3], j + E[e, 4], k + E[e, 5]]
                    if (f0 < 0) != (f1 < 0):
                        t = f0 / (f0 - f1)
                        sx += E[e, 0] + (E[e, 3] - E[e, 0]) * t
                        sy += E[e, 1] + (E[e, 4] - E[e, 1]) * t
                        sz += E[e, 2] + (E[e, 5] - E[e, 2]) * t
                        cnt += 1
                if nv >= V.shape[0]:
                    V2 = np.empty((V.shape[0] * 2, 3), np.float64)
                    V2[:nv] = V[:nv]
                    V = V2
                V[nv, 0] = o[0] + (i + sx / cnt) * vox
                V[nv, 1] = o[1] + (j + sy / cnt) * vox
                V[nv, 2] = o[2] + (k + sz / cnt) * vox
                idx[i, j, k] = nv
                nv += 1
    Q = np.empty((nv * 3, 4), np.int64)
    nq = 0
    for i in range(nx - 1):
        for j in range(ny - 1):
            for k in range(nz - 1):
                f0 = F[i, j, k] < 0
                # arête +x : cellules (i, j-1..j, k-1..k)
                if j > 0 and k > 0 and f0 != (F[i + 1, j, k] < 0):
                    q = (idx[i, j - 1, k - 1], idx[i, j, k - 1], idx[i, j, k], idx[i, j - 1, k])
                    if q[0] >= 0 and q[1] >= 0 and q[2] >= 0 and q[3] >= 0:
                        if f0:
                            Q[nq] = (q[0], q[1], q[2], q[3])
                        else:
                            Q[nq] = (q[3], q[2], q[1], q[0])
                        nq += 1
                if i > 0 and k > 0 and f0 != (F[i, j + 1, k] < 0):
                    q = (idx[i - 1, j, k - 1], idx[i - 1, j, k], idx[i, j, k], idx[i, j, k - 1])
                    if q[0] >= 0 and q[1] >= 0 and q[2] >= 0 and q[3] >= 0:
                        if f0:
                            Q[nq] = (q[0], q[1], q[2], q[3])
                        else:
                            Q[nq] = (q[3], q[2], q[1], q[0])
                        nq += 1
                if i > 0 and j > 0 and f0 != (F[i, j, k + 1] < 0):
                    q = (idx[i - 1, j - 1, k], idx[i, j - 1, k], idx[i, j, k], idx[i - 1, j, k])
                    if q[0] >= 0 and q[1] >= 0 and q[2] >= 0 and q[3] >= 0:
                        if f0:
                            Q[nq] = (q[0], q[1], q[2], q[3])
                        else:
                            Q[nq] = (q[3], q[2], q[1], q[0])
                        nq += 1
                if nq + 3 >= Q.shape[0]:
                    Q2 = np.empty((Q.shape[0] * 2, 4), np.int64)
                    Q2[:nq] = Q[:nq]
                    Q = Q2
    return V[:nv], Q[:nq]


# ------------------------------------------------------------------------------------------------ recettes
E0 = np.zeros((0, 9))


def arr(a, w):
    a = np.asarray(a, np.float64)
    return a.reshape(-1, w) if a.size else np.zeros((0, w))


def bar_recipe(seed, L, H, D, beds, dip=0.05, dipz=0.0, joints=(), lapiaz=0.0, lump=0.10, grain=0.025, flake=0.03):
    """beds : (épaisseur relative, recul avant, recul arrière, recul côtés, gorge, arrondi, ondulation)."""
    rng = np.random.default_rng(seed)
    th = np.array([b[0] for b in beds], np.float64)
    ys = np.concatenate([[0.0], np.cumsum(th / th.sum() * H)])
    B = []
    for k, b in enumerate(beds):
        B.append([ys[k], ys[k + 1], b[1], b[2], b[3], b[4], b[5], b[6]])
    G = np.zeros(12)
    G[:11] = [seed, -0.6, L / 2, D / 2, dip, dipz, H, lapiaz, lump, grain, flake]
    J = [[x, a, dep, w] for (x, a, dep, w) in joints]
    ext = (L / 2 + 0.6, H + 0.5, D / 2 + 0.6)
    return dict(kind=KIND_BAR, G=G, BED=arr(B, 8), PL=arr([], 4), SP=arr([], 4), CR=arr([], 9), JT=arr(J, 4),
                box=((-ext[0], -0.6, -ext[2]), (ext[0], ext[1], ext[2])))


def poly_recipe(seed, half, n_obl=4, chamfer=10, k=0.04, scoops=4, cracks=2, joints=0.0, jstep=0.9, taper=0.0,
                lump=0.05, grain=0.012, flake=0.02, flat_base=True):
    """Polyèdre de diaclases inscrit dans la demi-boîte `half` (x, y, z) ; base à y = 0."""
    rng = np.random.default_rng(seed)
    hx, hy, hz = half
    P = []
    # trois familles orthogonales (légèrement désaxées) : les faces principales
    yaw = rng.uniform(-0.25, 0.25)
    for (ax, h) in ((np.array([1.0, 0, 0]), hx), (np.array([0, 1.0, 0]), hy), (np.array([0, 0, 1.0]), hz)):
        for sgn in (1, -1):
            n = ax * sgn + rng.normal(0, 0.09, 3)
            n = n / np.linalg.norm(n)
            c, s = math.cos(yaw), math.sin(yaw)
            n = np.array([c * n[0] - s * n[2], n[1], s * n[0] + c * n[2]])
            off = h * rng.uniform(0.82, 1.0)
            if ax[1] == 1 and sgn == -1 and flat_base:
                n, off = np.array([0.0, -1.0, 0.0]), hy  # base horizontale en y = 0 (après recentrage)
            P.append([*n, off])
    # plans obliques (diaclases secondaires) qui tronquent la masse
    for _ in range(n_obl):
        n = rng.normal(0, 1, 3)
        n[1] = abs(n[1]) * 0.8 + 0.1
        n /= np.linalg.norm(n)
        r = abs(n[0]) * hx + abs(n[1]) * hy + abs(n[2]) * hz
        P.append([*n, r * rng.uniform(0.55, 0.8)])
    # arêtes et coins écornés
    for _ in range(chamfer):
        n = np.array([rng.choice([-1, 1]) * rng.uniform(0.4, 1), rng.uniform(0.2, 1), rng.choice([-1, 1]) * rng.uniform(0.4, 1)])
        n /= np.linalg.norm(n)
        r = abs(n[0]) * hx + abs(n[1]) * hy + abs(n[2]) * hz
        P.append([*n, r * rng.uniform(0.72, 0.9)])
    # recentrage vertical : la base est à y = 0, le sommet à 2 hy
    PL = np.asarray(P, np.float64)
    PL[:, 3] += PL[:, 1] * hy  # décalage du centre en (0, hy, 0)
    S = []
    for _ in range(scoops):
        d = rng.normal(0, 1, 3)
        d[1] = abs(d[1]) * 0.7
        d /= np.linalg.norm(d)
        r = rng.uniform(0.25, 0.5) * min(hx, hy, hz) * 2
        c = d * np.array([hx, hy, hz]) * 1.05 + d * r * 0.78
        S.append([c[0], c[1] + hy, c[2], r])
    C = []
    for _ in range(cracks):
        n = rng.normal(0, 1, 3)
        n /= np.linalg.norm(n)
        cp = rng.uniform(-1, 1, 3) * np.array([hx, hy, hz]) * 0.6
        cp[1] += hy
        edge = cp + rng.normal(0, 1, 3) * np.array([hx, hy, hz])
        C.append([*n, float(n @ cp), rng.uniform(0.012, 0.03) * max(hx, hy, hz), *edge, max(hx, hy, hz) * rng.uniform(0.7, 1.2)])
    G = np.zeros(12)
    G[:11] = [seed, -0.4 * hy, k * max(hx, hy, hz), joints, jstep, taper, 0, 0, lump * max(hx, hy, hz), grain * max(hx, hy, hz), flake * max(hx, hy, hz)]
    m = max(hx, hz) * 1.15 + 0.1
    return dict(kind=KIND_POLY, G=G, BED=arr([], 8), PL=PL, SP=arr(S, 4), CR=arr(C, 9), JT=arr([], 4),
                box=((-m, -0.4 * hy - 0.05, -m), (m, 2 * hy * 1.1 + 0.1, m)))


def mout_recipe(seed, A0, A1, B, C, steps, e=2.6, stri=0.006, flute=0.05, lump=0.06, rough=0.03):
    """steps : (x du gradin, hauteur, inclinaison du plan de diaclase)."""
    G = np.zeros(12)
    G[:11] = [seed, -0.8, A0, A1, B, C, e, stri, flute, lump, rough]
    return dict(kind=KIND_MOUT, G=G, BED=arr([], 8), PL=arr([], 4), SP=arr([], 4), CR=arr([], 9), JT=arr(steps, 4 if False else 3).tolist() and arr([list(s) + [0] for s in steps], 4),
                box=((-A0 - 0.4, -0.8, -C - 0.4), (A1 + 0.4, B + 0.4, C + 0.4)))


def recipes():
    R = {}
    # barre-a : barre litée de calcaire, cinq bancs, front en gradins doux, diaclases tous les 2-3 m
    R['barre-a'] = dict(family='barre', res=300, tex=2048, lod=(9000, 2200, 520), rec=bar_recipe(
        101, 12.0, 3.4, 4.6,
        [(1.3, 0.0, 0.5, 0.2, 0.0, 0.10, 0.25), (0.8, 0.45, 0.6, 0.4, 0.10, 0.06, 0.18), (1.1, 0.15, 0.7, 0.3, 0.09, 0.12, 0.22),
         (0.6, 0.75, 1.0, 0.6, 0.12, 0.05, 0.15), (0.9, 0.55, 1.2, 0.8, 0.08, 0.18, 0.28)],
        dip=0.05, joints=((-3.4, 0.12, 0.22, 0.10), (-0.6, -0.08, 0.16, 0.08), (2.3, 0.2, 0.25, 0.12), (4.6, 0.0, 0.14, 0.07))))
    # barre-b : gradins (sept bancs minces de dureté alternée), escalier naturel
    R['barre-b'] = dict(family='barre', res=300, tex=2048, lod=(10000, 2500, 560), rec=bar_recipe(
        202, 9.0, 4.6, 4.2,
        [(1.0, 0.0, 0.4, 0.2, 0.0, 0.06, 0.2), (0.5, 0.55, 0.6, 0.5, 0.08, 0.04, 0.12), (0.8, 0.35, 0.7, 0.4, 0.06, 0.06, 0.16),
         (0.45, 1.0, 0.9, 0.7, 0.1, 0.04, 0.12), (0.7, 0.85, 1.0, 0.8, 0.07, 0.05, 0.15), (0.4, 1.45, 1.2, 1.0, 0.1, 0.04, 0.1),
         (0.6, 1.35, 1.4, 1.1, 0.06, 0.12, 0.2)],
        dip=-0.04, dipz=0.03, joints=((-2.2, 0.3, 0.2, 0.09), (1.4, -0.15, 0.24, 0.11))))
    # barre-c : trois bancs épais, le banc sommital dur fait corniche (surplomb), banc tendre creusé dessous
    R['barre-c'] = dict(family='barre', res=320, tex=2048, lod=(10000, 2500, 560), rec=bar_recipe(
        303, 14.0, 3.0, 5.2,
        [(1.2, 0.2, 0.6, 0.3, 0.0, 0.12, 0.3), (0.7, 1.1, 0.9, 0.9, 0.16, 0.10, 0.25), (1.0, -0.15, 0.5, 0.1, 0.12, 0.08, 0.22)],
        dip=0.03, joints=((-5.0, 0.1, 0.3, 0.12), (-1.8, 0.25, 0.22, 0.10), (1.2, -0.1, 0.28, 0.13), (4.4, 0.05, 0.2, 0.1))))
    # dalle : banc unique incliné, dessus de lapiaz (rigoles de dissolution), bord éclaté
    R['dalle'] = dict(family='barre', res=300, tex=2048, lod=(7000, 1800, 420), rec=bar_recipe(
        404, 7.0, 1.2, 5.0, [(1.0, 0.1, 0.3, 0.1, 0.0, 0.06, 0.3), (0.5, 0.4, 0.5, 0.35, 0.07, 0.04, 0.25)],
        dip=0.0, joints=((-1.6, 0.6, 0.12, 0.06), (1.1, -0.4, 0.14, 0.06), (2.6, 1.2, 0.1, 0.05)), lapiaz=0.07, lump=0.06))
    # blocs fracturés
    R['bloc-a'] = dict(family='bloc', res=240, tex=1024, lod=(4200, 1100, 260), rec=poly_recipe(505, (1.6, 1.3, 1.4), n_obl=4, chamfer=12, scoops=5, cracks=2))
    R['bloc-b'] = dict(family='bloc', res=240, tex=1024, lod=(4200, 1100, 260), rec=poly_recipe(606, (2.3, 0.8, 1.5), n_obl=5, chamfer=10, scoops=4, cracks=3, joints=0.03, jstep=0.45))
    R['bloc-c'] = dict(family='bloc', res=220, tex=1024, lod=(4000, 1000, 240), rec=poly_recipe(707, (1.1, 0.9, 1.0), n_obl=6, chamfer=14, k=0.11, scoops=3, cracks=1, joints=0.025, jstep=0.6, lump=0.07))
    R['gendarme'] = dict(family='bloc', res=280, tex=2048, lod=(6000, 1500, 340), rec=poly_recipe(808, (1.2, 3.3, 1.1), n_obl=6, chamfer=10, scoops=4, cracks=3, joints=0.07, jstep=0.85, taper=0.035, lump=0.035))
    # éboulis anguleux (frais : arêtes vives, peu d'usure)
    R['eboulis-a'] = dict(family='eboulis', res=150, tex=512, lod=(900, 260, 80), rec=poly_recipe(909, (0.5, 0.24, 0.4), n_obl=3, chamfer=5, k=0.02, scoops=2, cracks=0, lump=0.04, grain=0.008, flake=0.015))
    R['eboulis-b'] = dict(family='eboulis', res=150, tex=512, lod=(900, 260, 80), rec=poly_recipe(1010, (0.45, 0.36, 0.45), n_obl=4, chamfer=6, k=0.025, scoops=2, cracks=1, lump=0.04, grain=0.008, flake=0.015))
    R['eboulis-c'] = dict(family='eboulis', res=150, tex=512, lod=(800, 240, 70), rec=poly_recipe(1111, (0.62, 0.17, 0.45), n_obl=3, chamfer=6, k=0.02, scoops=1, cracks=1, lump=0.03, grain=0.008, flake=0.012))
    # roches moutonnées
    R['moutonnee-a'] = dict(family='moutonnee', res=300, tex=2048, lod=(7000, 1800, 420), rec=mout_recipe(
        1212, 5.8, 3.2, 1.9, 2.7, [(1.0, 1.45, 0.25), (1.9, 0.95, 0.15), (2.6, 0.45, 0.3)]))
    R['moutonnee-b'] = dict(family='moutonnee', res=280, tex=2048, lod=(6000, 1500, 360), rec=mout_recipe(
        1313, 3.8, 2.4, 1.5, 2.3, [(0.3, 1.15, 0.35), (1.1, 0.75, 0.2), (1.8, 0.35, 0.25)], e=2.3, stri=0.008, flute=0.07))
    return R


# ------------------------------------------------------------------------------------------------ maillage HD
def build_hi(rid, R):
    rec = R['rec']
    (x0, y0, z0), (x1, y1, z1) = rec['box']
    ext = max(x1 - x0, y1 - y0, z1 - z0)
    res = R['res'] // (2 if FAST else 1)
    vox = ext / res
    o = np.array([x0 - 2 * vox, y0 - 2 * vox, z0 - 2 * vox])
    nx, ny, nz = (int(math.ceil((x1 - x0) / vox)) + 5, int(math.ceil((y1 - y0) / vox)) + 5, int(math.ceil((z1 - z0) / vox)) + 5)
    a = (rec['kind'], rec['G'], rec['BED'], rec['PL'], rec['SP'], rec['CR'], rec['JT'])
    t = time.time()
    F = sample_grid(o, vox, nx, ny, nz, *a)
    # bords de la grille : toujours dehors (maillage fermé)
    F[0], F[-1], F[:, 0], F[:, -1], F[:, :, 0], F[:, :, -1] = 1, 1, 1, 1, 1, 1
    V, Q = surface_nets(F, o, vox)
    # plus grande composante connexe (les grains de bruit isolés sont jetés)
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    e = np.concatenate([Q[:, [0, 1]], Q[:, [1, 2]], Q[:, [2, 3]], Q[:, [3, 0]]])
    g = coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(len(V), len(V)))
    nc, lab = connected_components(g, directed=False)
    if nc > 1:
        big = np.argmax(np.bincount(lab))
        keepv = lab == big
        remap = -np.ones(len(V), np.int64)
        remap[keepv] = np.arange(keepv.sum())
        Q = remap[Q]
        Q = Q[(Q >= 0).all(1)]
        V = V[keepv]
    V = project(V, vox * 0.25, 4, vox * 0.9, *a)
    log(f'{rid} : grille {nx}×{ny}×{nz} ({vox * 100:.1f} cm), {len(V)} sommets, {len(Q)} quads en {time.time() - t:.1f} s')
    return V, Q, vox


def vertex_fields(V, Q, rid):
    """Courbure moyenne (convexe > 0.5) et variation lente, par sommet du maillage HD."""
    n = len(V)
    e = np.concatenate([Q[:, [0, 1]], Q[:, [1, 2]], Q[:, [2, 3]], Q[:, [3, 0]]])
    e = np.concatenate([e, e[:, ::-1]])
    deg = np.bincount(e[:, 0], minlength=n).astype(np.float64)
    # normales par sommet (somme des normales des quads)
    a, b, c, d = V[Q[:, 0]], V[Q[:, 1]], V[Q[:, 2]], V[Q[:, 3]]
    fn = np.cross(c - a, d - b)
    N = np.zeros_like(V)
    for k in range(4):
        np.add.at(N, Q[:, k], fn)
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
    curv = np.zeros(n)
    for scale in range(3):
        lap = np.zeros_like(V)
        np.add.at(lap, e[:, 0], V[e[:, 1]])
        lap = lap / np.maximum(deg, 1)[:, None] - V
        el = np.linalg.norm(V[e[:, 1]] - V[e[:, 0]], axis=1)
        L2 = np.bincount(e[:, 0], el * el, minlength=n) / np.maximum(deg, 1)
        k = -np.sum(lap * N, axis=1) / np.maximum(L2, 1e-12)
        curv += k * (0.5 ** scale)
    # lissage du champ (quelques passes), puis normalisation robuste
    for _ in range(6):
        s = np.bincount(e[:, 0], curv[e[:, 1]], minlength=n) / np.maximum(deg, 1)
        curv = 0.5 * curv + 0.5 * s
    q = np.percentile(np.abs(curv), 97) + 1e-9
    cv = np.clip(0.5 - 0.5 * curv / q, 0, 1)  # convexe → clair (les normales sortantes donnent un laplacien opposé)
    from numba import prange as _p  # noqa: F401
    rng = np.random.default_rng(abs(hash(rid)) % (2 ** 31))
    off = rng.uniform(-50, 50, 3)
    var = np.array([fbm3(x / 1.7 + off[0], y / 1.7 + off[1], z / 1.7 + off[2], 4, 7) for x, y, z in V])
    var = np.clip(0.5 + 0.9 * var, 0, 1)
    return cv, var, N


# ------------------------------------------------------------------------------------------------ Blender
def to_bl(V):
    """Repère du jeu (y vers le haut) → repère de Blender (z vers le haut) ; l'export glTF (export_yup) fait l'inverse."""
    return np.stack([V[:, 0], -V[:, 2], V[:, 1]], 1)


def from_bl(B):
    return np.stack([B[:, 0], B[:, 2], -B[:, 1]], 1)


def bl_mesh(name, V, Q, cols=None):
    import bpy
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(V))
    me.vertices.foreach_set('co', to_bl(V).astype(np.float32).ravel())
    me.loops.add(len(Q) * 4)
    me.loops.foreach_set('vertex_index', Q.ravel().astype(np.int32))
    me.polygons.add(len(Q))
    me.polygons.foreach_set('loop_start', (np.arange(len(Q)) * 4).astype(np.int32))
    me.polygons.foreach_set('loop_total', np.full(len(Q), 4, np.int32))
    me.update(calc_edges=True)
    me.validate()
    if cols is not None:
        at = me.color_attributes.new('champs', 'FLOAT_COLOR', 'POINT')
        c4 = np.concatenate([cols, np.ones((len(cols), 1))], 1).astype(np.float32)
        at.data.foreach_set('color', c4.ravel())
    me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def select_only(ob):
    import bpy
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def fix_normals(ob):
    import bpy
    select_only(ob)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')


def decimate_copy(src, name, tris):
    import bpy
    ob = src.copy()
    ob.data = src.data.copy()
    ob.name = name
    bpy.context.scene.collection.objects.link(ob)
    cur = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if tris < cur:
        m = ob.modifiers.new('dec', 'DECIMATE')
        m.decimate_type = 'COLLAPSE'
        m.ratio = tris / cur
        m.use_collapse_triangulate = True
        select_only(ob)
        bpy.ops.object.modifier_apply(modifier='dec')
    else:
        m = ob.modifiers.new('tri', 'TRIANGULATE')
        select_only(ob)
        bpy.ops.object.modifier_apply(modifier='tri')
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


def bake(lo, hi, kind, size, path, samples, extrusion, dist):
    import bpy
    setup_cycles(samples)
    img = bpy.data.images.new('bake_' + kind, size, size, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    nt = lo.data.materials[0].node_tree
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
    sc.render.bake.margin = 6
    sc.render.bake.normal_space = 'TANGENT'
    t = time.time()
    bpy.ops.object.bake(type=kind)
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    nt.nodes.remove(node)
    bpy.data.images.remove(img)
    return time.time() - t


def apercu(rid, hi, lods, ext):
    """Rendu argile du maillage HD (à gauche) et de la LOD0 avec ses normales cuites (à droite) : contrôle des formes."""
    import bpy
    from mathutils import Vector
    sc = bpy.context.scene
    setup_cycles(48)
    sc.render.resolution_x, sc.render.resolution_y = 900, 450
    sc.view_settings.view_transform = 'AgX'
    w = sc.world
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.62, 0.72, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
    sun = bpy.data.objects.new('soleil', bpy.data.lights.new('soleil', 'SUN'))
    sun.data.energy = 4.0
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    sc.collection.objects.link(sun)
    clay = bpy.data.materials.new('argile')
    clay.use_nodes = True
    clay.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.42, 0.4, 0.37, 1)
    clay.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9
    lo = lods[0]
    nm = bpy.data.materials.new('cuite')
    nm.use_nodes = True
    nt = nm.node_tree
    bs = nt.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (0.42, 0.4, 0.37, 1)
    tx = nt.nodes.new('ShaderNodeTexImage')
    tx.image = bpy.data.images.load(os.path.join(CACHE, rid + '_nor.png'))
    tx.image.colorspace_settings.name = 'Non-Color'
    nmap = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(tx.outputs['Color'], nmap.inputs['Color'])
    nt.links.new(nmap.outputs['Normal'], bs.inputs['Normal'])
    hi_mats = list(hi.data.materials)
    hi.data.materials.clear()
    hi.data.materials.append(clay)
    lo_mats = list(lo.data.materials)
    lo.data.materials.clear()
    lo.data.materials.append(nm)
    for ob in lods[1:]:
        ob.hide_render = True
    sz = Vector((np.ptp([v.co.x for v in lo.data.vertices]), 0, 0))
    off = sz.x * 0.6 + ext * 0.1
    hi.location.x = -off
    lo.location.x = off
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.lens = 40
    tgt = Vector((0, ext * 0.18, 0))
    cam.location = tgt + Vector((0.35, 0.42, 1.0)).normalized() * (off * 2 + ext) * 1.25
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(CACHE, 'apercu_' + rid + '.png')
    bpy.ops.render.render(write_still=True)
    hi.location.x = lo.location.x = 0
    hi.data.materials.clear()
    for m in hi_mats:
        hi.data.materials.append(m)
    lo.data.materials.clear()
    for m in lo_mats:
        lo.data.materials.append(m)
    for ob in lods[1:]:
        ob.hide_render = False
    bpy.data.objects.remove(cam, do_unlink=True)
    bpy.data.objects.remove(sun, do_unlink=True)


def render_preview(hi, V, path):
    """Aperçu « argile » du maillage HD (trois quarts face, soleil rasant) pour juger la forme."""
    import bpy
    from mathutils import Vector
    mat = bpy.data.materials.new('argile')
    mat.use_nodes = True
    bs = mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (0.55, 0.53, 0.5, 1)
    bs.inputs['Roughness'].default_value = 0.9
    old = list(hi.data.materials)
    hi.data.materials.clear()
    hi.data.materials.append(mat)
    Vb = to_bl(V)
    c = (Vb.min(0) + Vb.max(0)) / 2
    ext = float(np.ptp(Vb, axis=0).max())
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    bpy.context.scene.collection.objects.link(cam)
    pos = Vector((c[0] + ext * 0.9, c[1] - ext * 1.1, c[2] + ext * 0.5))
    cam.location = pos
    cam.rotation_euler = (Vector((c[0], c[1], c[2])) - pos).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 40
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 4
    sun.rotation_euler = (math.radians(55), math.radians(10), math.radians(-35))
    bpy.context.scene.collection.objects.link(sun)
    sc = bpy.context.scene
    sc.camera = cam
    sc.world.color = (0.25, 0.28, 0.33)
    setup_cycles(32)
    sc.render.resolution_x, sc.render.resolution_y = 800, 520
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    hi.data.materials.clear()
    for m in old:
        hi.data.materials.append(m)


def make_rock(rid, R):
    import bpy
    os.makedirs(CACHE, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    world = bpy.data.worlds.new('w')
    bpy.context.scene.world = world
    V, Q, vox = build_hi(rid, R)
    # remaillage voxel (OpenVDB) : variété fermée sans arêtes multiples (sinon la décimation se bloque), puis nouvelle
    # projection exacte sur le champ
    tmp = bl_mesh(rid + '_sn', V, Q)
    m = tmp.modifiers.new('vox', 'REMESH')
    m.mode = 'VOXEL'
    m.voxel_size = vox
    m.adaptivity = 0.0
    select_only(tmp)
    bpy.ops.object.modifier_apply(modifier='vox')
    me = tmp.data
    V = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get('co', V)
    V = from_bl(V.reshape(-1, 3).astype(np.float64))
    lt = np.empty(len(me.polygons), np.int32)
    me.polygons.foreach_get('loop_total', lt)
    li = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get('vertex_index', li)
    assert (lt == 4).all(), 'remaillage : polygones non quadrangulaires'
    Q = li.reshape(-1, 4).astype(np.int64)
    bpy.data.objects.remove(tmp, do_unlink=True)
    rec = R['rec']
    if os.environ.get("SANS_PROJ") != "1":
        V = project(V, vox * 0.25, 4, vox * 0.9, rec['kind'], rec['G'], rec['BED'], rec['PL'], rec['SP'], rec['CR'], rec['JT'])
    cv, var, N = vertex_fields(V, Q, rid)
    cols = np.stack([cv, var, np.zeros_like(cv)], 1)
    hi = bl_mesh(rid + '_hd', V, Q, cols)
    fix_normals(hi)
    mh = bpy.data.materials.new('hd')
    mh.use_nodes = True
    nt = mh.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_name = 'champs'
    em = nt.nodes.new('ShaderNodeEmission')
    outn = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(at.outputs['Color'], em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], outn.inputs['Surface'])
    hi.data.materials.append(mh)
    # LOD0 : décimation du HD, UV par projection intelligente ; LOD1 et LOD2 décimés depuis LOD0 (UV partagées)
    lo0 = decimate_copy(hi, rid + '_lod0', R['lod'][0])
    lo0.data.materials.clear()
    if lo0.data.color_attributes.get('champs'):
        lo0.data.color_attributes.remove(lo0.data.color_attributes['champs'])
    select_only(lo0)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(62), island_margin=0.006, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=0.004, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    ml = bpy.data.materials.new(rid)
    ml.use_nodes = True
    lo0.data.materials.append(ml)
    lods = [lo0]
    for k in (1, 2):
        lods.append(decimate_copy(lo0, f'{rid}_lod{k}', R['lod'][k]))
    for ob in lods:
        ob.data.name = ob.name
    size = R['tex'] // (2 if FAST else 1)
    ext = max(np.ptp(V[:, 0]), np.ptp(V[:, 1]), np.ptp(V[:, 2]))
    tn = bake(lo0, hi, 'NORMAL', size, os.path.join(CACHE, rid + '_nor.png'), 1, ext * 0.012, ext * 0.03)
    world.light_settings.distance = ext * 0.25
    ta = bake(lo0, hi, 'AO', size // 2, os.path.join(CACHE, rid + '_ao.png'), 24 if FAST else 96, ext * 0.012, ext * 0.03)
    te = bake(lo0, hi, 'EMIT', size // 2, os.path.join(CACHE, rid + '_emit.png'), 1, ext * 0.012, ext * 0.03)
    log(f'{rid} : cuissons normales {tn:.0f} s, occlusion {ta:.0f} s, champs {te:.0f} s ({size} px)')
    # textures du jeu
    Image.open(os.path.join(CACHE, rid + '_nor.png')).convert('RGB').save(os.path.join(OUT, rid + '_nor.webp'), quality=92, method=6)
    ao = Image.open(os.path.join(CACHE, rid + '_ao.png')).convert('L')
    emc = Image.open(os.path.join(CACHE, rid + '_emit.png')).convert('RGB')
    r, g, b = emc.split()
    Image.merge('RGB', (ao, r, g)).save(os.path.join(OUT, rid + '_mask.webp'), quality=90, method=6)
    if '--apercu' in sys.argv:
        apercu(rid, hi, lods, ext)
    if '--apercu' in sys.argv:
        render_preview(hi, V, os.path.join(CACHE, 'apercu_' + rid + '.png'))
    # export des trois LOD dans un seul .glb (tangentes MikkTSpace : cohérentes avec la cuisson)
    bpy.data.objects.remove(hi, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    info = {'tris': [], 'vertices': []}
    for ob in lods:
        ob.select_set(True)
        info['tris'].append(sum(len(p.vertices) - 2 for p in ob.data.polygons))
        info['vertices'].append(len(ob.data.vertices))
    raw = os.path.join(CACHE, rid + '_raw.glb')
    bpy.ops.export_scene.gltf(filepath=raw, export_format='GLB', use_selection=True, export_tangents=True,
                              export_texcoords=True, export_normals=True, export_materials='NONE', export_yup=True)
    out = os.path.join(OUT, rid + '.glb')
    r = subprocess.run(['node', GLTFPACK, '-i', raw, '-o', out, '-cc', '-kn', '-km', '-kv', '-vp', '14', '-vtf', '-vn', '10'], capture_output=True, text=True)
    if r.returncode != 0:
        log('gltfpack :', r.stderr[-400:])
        shutil.copyfile(raw, out)
    # emprise au sol (pour les collisions et le placement) : demi-axes de l'ellipse et hauteur au-dessus de y = 0
    up = V[V[:, 1] > 0.15 * V[:, 1].max()]
    info.update(family=R['family'], size=[round(float(np.ptp(V[:, 0])), 3), round(float(V[:, 1].max()), 3), round(float(np.ptp(V[:, 2])), 3)],
                foot=[round(float(np.abs(up[:, 0]).max()), 3), round(float(np.abs(up[:, 2]).max()), 3)], tex=size,
                voxel=round(float(vox), 4), bytes=os.path.getsize(out) + os.path.getsize(os.path.join(OUT, rid + '_nor.webp')) + os.path.getsize(os.path.join(OUT, rid + '_mask.webp')))
    log(f'{rid} : LOD {info["tris"]} triangles, {info["bytes"] / 1e6:.2f} Mo')
    return info


def main():
    os.makedirs(OUT, exist_ok=True)
    R = recipes()
    jp = os.path.join(OUT, 'rochers.json')
    allinfo = json.load(open(jp, encoding='utf-8')) if os.path.exists(jp) else {}
    for rid, rr in R.items():
        if ONLY and rid not in ONLY:
            continue
        allinfo[rid] = make_rock(rid, rr)
        json.dump(allinfo, open(jp, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    log('écrit', jp)


if __name__ == '__main__':
    main()


# ------------------------------------------------------------------------------------------------ textures de détail
# Sources CC0 déjà téléchargées par tools/foret/fetch.py (branche main) : Poly Haven rock_face_03, lichen_rock,
# ambientCG Moss002. Converties en WebP 1024 dans public/assets/terrain/rochers/ (crédits : CREDITS.md du dossier).
DETAIL_TEX = [
    ('roche_diff', 'ph/rock_face_03/rock_face_03_diff_2k.jpg'), ('roche_nor', 'ph/rock_face_03/rock_face_03_nor_2k.jpg'),
    ('lichen_diff', 'ph/lichen_rock/lichen_rock_diff_2k.jpg'), ('mousse_diff', 'acg/Moss002/Moss002_2K-JPG_Color.jpg'),
    ('mousse_nor', 'acg/Moss002/Moss002_2K-JPG_NormalGL.jpg'),
]


def detail_textures():
    roots = [os.path.join(ROOT, 'tools', 'foret', '.cache', 'dl')] + [
        os.path.join(os.path.dirname(ROOT), d, 'tools', 'foret', '.cache', 'dl') for d in ('CapyWorld', 'CapyWorld-vegetation')]
    for name, rel in DETAIL_TEX:
        dst = os.path.join(OUT, name + '.webp')
        if os.path.exists(dst):
            continue
        src = next((os.path.join(r, rel) for r in roots if os.path.exists(os.path.join(r, rel))), None)
        if not src:
            log('texture source absente (lancer tools/foret/fetch.py) :', rel)
            continue
        Image.open(src).convert('RGB').resize((1024, 1024), Image.LANCZOS).save(dst, quality=90, method=6)
        log('texture', name, '←', rel)


if __name__ == '__main__' and '--textures' in sys.argv:
    detail_textures()
