# Érosion hydraulique (gouttes) et thermique (talus), accumulation d'écoulement — spécialité Terrain & relief.
# Noyaux numba ; les hauteurs sont manipulées en mètres, les pentes converties avec la taille de maille.
import math
import numpy as np
from numba import njit


@njit(cache=True)
def _bil(H, x, z):
    ix = int(x)
    iz = int(z)
    fx = x - ix
    fz = z - iz
    return (H[iz, ix] * (1 - fx) * (1 - fz) + H[iz, ix + 1] * fx * (1 - fz)
            + H[iz + 1, ix] * (1 - fx) * fz + H[iz + 1, ix + 1] * fx * fz)


@njit(cache=True)
def droplets(H, E, dep, n_drops, seed, cell, inertia, capacity, min_cap, deposition, erosion, evaporation,
             gravity, radius, max_life, sea):
    """Érosion par gouttes (algorithme classique de particules d'eau qui arrachent et déposent des sédiments).
    H : hauteurs (m), modifiées en place ; E : érodabilité 0..1 ; dep : cumul des dépôts (m), pour la carte dérivée."""
    N = H.shape[0]
    M = H.shape[1]
    np.random.seed(seed)
    # pinceau d'érosion (disque de rayon `radius` mailles)
    R = int(math.ceil(radius))
    offs = []
    wts = []
    for dz in range(-R, R + 1):
        for dx in range(-R, R + 1):
            d = math.sqrt(dx * dx + dz * dz)
            if d < radius:
                offs.append((dx, dz))
                wts.append(1 - d / radius)
    s = 0.0
    for w in wts:
        s += w
    nb = len(offs)
    ox = np.empty(nb, np.int64)
    oz = np.empty(nb, np.int64)
    ow = np.empty(nb, np.float64)
    for k in range(nb):
        ox[k] = offs[k][0]
        oz[k] = offs[k][1]
        ow[k] = wts[k] / s
    inv = 1.0 / cell
    for d in range(n_drops):
        x = 1 + np.random.random() * (M - 3)
        z = 1 + np.random.random() * (N - 3)
        dx = 0.0
        dz = 0.0
        speed = 1.0
        water = 1.0
        sed = 0.0
        for life in range(max_life + 1):
            if life == max_life:
                # fin de vie : la goutte dépose ce qu'elle transporte (cônes de déjection)
                ix = int(x)
                iz = int(z)
                for k in range(nb):
                    jx = ix + ox[k]
                    jz = iz + oz[k]
                    if jx < 0 or jz < 0 or jx >= M or jz >= N or H[jz, jx] < sea:
                        continue
                    a = min(sed * ow[k], 1.0) * E[jz, jx]
                    H[jz, jx] += a
                    dep[jz, jx] += a
                break
            ix = int(x)
            iz = int(z)
            fx = x - ix
            fz = z - iz
            h00 = H[iz, ix]
            h10 = H[iz, ix + 1]
            h01 = H[iz + 1, ix]
            h11 = H[iz + 1, ix + 1]
            h = h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz
            if h < sea:
                break
            gx = ((h10 - h00) * (1 - fz) + (h11 - h01) * fz) * inv
            gz = ((h01 - h00) * (1 - fx) + (h11 - h10) * fx) * inv
            dx = dx * inertia - gx * (1 - inertia)
            dz = dz * inertia - gz * (1 - inertia)
            l = math.sqrt(dx * dx + dz * dz)
            if l < 1e-9:
                a = np.random.random() * 6.2831853
                dx = math.cos(a)
                dz = math.sin(a)
            else:
                dx /= l
                dz /= l
            nx = x + dx
            nz = z + dz
            if nx < 1 or nz < 1 or nx >= M - 2 or nz >= N - 2:
                break
            nh = _bil(H, nx, nz)
            dh = nh - h  # m
            slope = -dh * inv
            cap = max(slope * speed * water * capacity, min_cap)
            if sed > cap or dh > 0:
                amount = min(dh, sed) if dh > 0 else (sed - cap) * deposition
                if amount > 2.0:
                    amount = 2.0
                sed -= amount
                # dépôt bilinéaire sur les quatre coins
                e00 = E[iz, ix]
                e10 = E[iz, ix + 1]
                e01 = E[iz + 1, ix]
                e11 = E[iz + 1, ix + 1]
                a00 = amount * (1 - fx) * (1 - fz) * e00
                a10 = amount * fx * (1 - fz) * e10
                a01 = amount * (1 - fx) * fz * e01
                a11 = amount * fx * fz * e11
                H[iz, ix] += a00
                H[iz, ix + 1] += a10
                H[iz + 1, ix] += a01
                H[iz + 1, ix + 1] += a11
                dep[iz, ix] += a00
                dep[iz, ix + 1] += a10
                dep[iz + 1, ix] += a01
                dep[iz + 1, ix + 1] += a11
            else:
                amount = min((cap - sed) * erosion, -dh)
                for k in range(nb):
                    jx = ix + ox[k]
                    jz = iz + oz[k]
                    if jx < 0 or jz < 0 or jx >= M or jz >= N:
                        continue
                    hk = H[jz, jx]
                    if hk < sea:
                        continue
                    a = amount * ow[k] * E[jz, jx]
                    # jamais sous l'altitude d'arrivée de la goutte (pas de puits creusés par le pinceau)
                    lim = hk - nh
                    if a > lim:
                        a = lim if lim > 0 else 0.0
                    H[jz, jx] -= a
                    dep[jz, jx] -= a
                    sed += a
            v2 = speed * speed - dh * gravity
            speed = math.sqrt(v2) if v2 > 0 else 0.0
            if speed > 6.0:
                speed = 6.0
            water *= (1 - evaporation)


@njit(cache=True)
def thermal(H, talus, E, iters, cell, rate, scree):
    """Érosion thermique : là où la pente dépasse le talus (tan, par maille), la matière glisse vers l'aval.
    scree cumule l'épaisseur d'éboulis déposée (carte dérivée « dépôts »)."""
    N, M = H.shape
    DX = (-1, 0, 1, -1, 1, -1, 0, 1)
    DZ = (-1, -1, -1, 0, 0, 1, 1, 1)
    DD = (1.41421356, 1.0, 1.41421356, 1.0, 1.0, 1.41421356, 1.0, 1.41421356)
    D = np.zeros_like(H)
    for it in range(iters):
        D[:, :] = 0
        for z in range(1, N - 1):
            for x in range(1, M - 1):
                e = E[z, x]
                if e <= 0:
                    continue
                h = H[z, x]
                t = talus[z, x]
                tot = 0.0
                mx = 0.0
                for k in range(8):
                    d = h - H[z + DZ[k], x + DX[k]] - t * DD[k] * cell
                    if d > 0:
                        tot += d
                        if d > mx:
                            mx = d
                if tot <= 0:
                    continue
                move = rate * mx * 0.5 * e
                D[z, x] -= move
                for k in range(8):
                    d = h - H[z + DZ[k], x + DX[k]] - t * DD[k] * cell
                    if d > 0:
                        # les mailles protégées (lits, plats) ne reçoivent pas d'éboulis
                        D[z + DZ[k], x + DX[k]] += move * d / tot * E[z + DZ[k], x + DX[k]]
        for z in range(N):
            for x in range(M):
                H[z, x] += D[z, x]
                if D[z, x] > 0:
                    scree[z, x] += D[z, x]


@njit(cache=True)
def flow_accum(H, order, sea, cell):
    """Accumulation d'écoulement multidirectionnelle (m² drainés), en traitant les mailles de la plus haute à la plus basse."""
    N, M = H.shape
    A = np.full((N, M), cell * cell)
    DX = (-1, 0, 1, -1, 1, -1, 0, 1)
    DZ = (-1, -1, -1, 0, 0, 1, 1, 1)
    DD = (1.41421356, 1.0, 1.41421356, 1.0, 1.0, 1.41421356, 1.0, 1.41421356)
    w = np.zeros(8)
    for q in range(order.size):
        idx = order[q]
        z = idx // M
        x = idx % M
        if z < 1 or x < 1 or z >= N - 1 or x >= M - 1:
            continue
        h = H[z, x]
        if h < sea:
            continue
        s = 0.0
        for k in range(8):
            d = (h - H[z + DZ[k], x + DX[k]]) / DD[k]
            if d > 0:
                w[k] = d ** 1.1
                s += w[k]
            else:
                w[k] = 0.0
        if s <= 0:
            continue
        a = A[z, x]
        for k in range(8):
            if w[k] > 0:
                A[z + DZ[k], x + DX[k]] += a * w[k] / s
    return A


def accumulate(h, cell, sea=-0.5):
    order = np.argsort(-h, axis=None, kind='stable')
    return flow_accum(h.astype(np.float64), order, sea, cell)


@njit(cache=True)
def slope_limit(H, K, F, cell, sweeps):
    """Enveloppe à pente bornée : h(x) ≤ h(y) + K(x) · |x - y| (passes avant/arrière d'une transformée de distance
    à 16 directions, pour des versants sans facettes alignées sur la grille). On ne fait que raboter (jamais de remblai).
    F = 1 : maille figée."""
    N, M = H.shape
    # demi-voisinage « avant » (lignes précédentes et maille de gauche) ; l'arrière est son opposé
    FX = (-1, 0, -1, 1, -2, -1, 1, 2)
    FZ = (0, -1, -1, -1, -1, -2, -2, -1)
    FD = np.empty(8)
    for k in range(8):
        FD[k] = math.sqrt(FX[k] * FX[k] + FZ[k] * FZ[k]) * cell
    for sw in range(sweeps):
        for z in range(2, N - 2):
            for x in range(2, M - 2):
                if F[z, x] > 0.5:
                    continue
                k0 = K[z, x]
                h = H[z, x]
                for k in range(8):
                    v = H[z + FZ[k], x + FX[k]] + k0 * FD[k]
                    if v < h:
                        h = v
                H[z, x] = h
        for z in range(N - 3, 1, -1):
            for x in range(M - 3, 1, -1):
                if F[z, x] > 0.5:
                    continue
                k0 = K[z, x]
                h = H[z, x]
                for k in range(8):
                    v = H[z - FZ[k], x - FX[k]] + k0 * FD[k]
                    if v < h:
                        h = v
                H[z, x] = h
