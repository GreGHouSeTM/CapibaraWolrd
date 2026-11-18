"""Constructeur de maillages pour les accessoires du décor (spécialité Décor & accessoires).

Repère : celui de Three.js (y vers le haut, z vers l'avant / la rue) ; la conversion vers Blender (z haut) se fait à la
création de l'objet, l'export glTF (+Y up) refait l'inverse. Unités : mètres. Origine des objets : centre du pied (y = 0).

Toutes les pièces d'un accessoire partagent UN seul matériau « atlas » (decor_atlas) ou le matériau lumineux des
lanternes (decor_glow) : la matière est choisie par la *tuile* de l'atlas (bois, pierre, papier, bambou…) dans laquelle
on projette les UV, la teinte et l'usure sont des couleurs de sommets (COLOR_0, linéaires). Résultat : un objet entier,
voire toute une cellule du village, se dessine en un ou deux appels de dessin.
"""
import math
import random
from mathutils import Vector, noise

# ------------------------------------------------------------------------------------------------ atlas
ATLAS_N = 4            # 4 x 4 tuiles
PAD = 0.035            # marge dans chaque tuile (fraction) contre les fuites de mipmaps
TILES = {
    'wood': 0, 'planks': 1, 'stone': 2, 'paper': 3,
    'roughwood': 4, 'bamboo': 5, 'cloth': 6, 'ceramic': 7,
    'straw': 8, 'mossrock': 9, 'metal': 10, 'plain': 11,
    'bark': 12, 'clay': 13, 'wicker': 14, 'kawara': 15,
}


def tile_rect(tile):
    t = TILES[tile]
    c, r = t % ATLAS_N, t // ATLAS_N
    s = 1.0 / ATLAS_N
    return c * s + PAD * s, r * s + PAD * s, s * (1 - 2 * PAD)


def srgb(h):
    """'#rrggbb' -> couleur linéaire (r, g, b)."""
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def mul(c, k):
    return tuple(max(0.0, min(1.0, x * k)) for x in c)


def lerp3(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


class Mesh:
    """Accumulateur de faces (sommets par face : ombrage plat ou lisse au choix), UV d'atlas et couleurs."""

    def __init__(self, seed=1):
        self.co = []            # positions (Vector, repère Three.js)
        self.faces = []         # (indices, mat, smooth)
        self.uv = []            # par face : liste d'UV (u, v)
        self.col = []           # par face : liste de couleurs linéaires
        self.rng = random.Random(seed)
        self.glow_tris = 0

    # -------------------------------------------------------------------------------- bas niveau
    def v(self, p):
        self.co.append(Vector(p))
        return len(self.co) - 1

    def face(self, idx, uvs, cols, mat=0, smooth=False):
        self.faces.append((list(idx), mat, smooth))
        self.uv.append(list(uvs))
        self.col.append(list(cols))

    def transform(self, start, m):
        """Applique une matrice 4x4 (mathutils) aux sommets créés depuis `start`."""
        for i in range(start, len(self.co)):
            self.co[i] = m @ self.co[i]

    def mark(self):
        return len(self.co), len(self.faces)

    def face_tile(self, fi):
        """Tuile de l'atlas d'une face (déduite de ses UV)."""
        u, v = self.uv[fi][0]
        c, r = min(ATLAS_N - 1, int(u * ATLAS_N)), min(ATLAS_N - 1, int(v * ATLAS_N))
        t = r * ATLAS_N + c
        return next(k for k, i in TILES.items() if i == t)

    def finish(self, moss_amount=0.0, ao_k=0.6, ao_h=0.25, grime_amt=0.1, seed=0.0, moss_tiles=('stone', 'mossrock', 'clay', 'kawara'),
               moss_wood=0.0, wet=0.0):
        """Passe finale : occlusion au pied, salissures, mousse (pierre surtout ; bois si `moss_wood`), humidité en bas."""
        for fi, (idx, mat, _sm) in enumerate(self.faces):
            if mat == 1:
                continue  # papier lumineux : pas d'usure
            tile = self.face_tile(fi)
            pts = [self.co[i] for i in idx]
            nrm = (pts[1] - pts[0]).cross(pts[2] - pts[0])
            if nrm.length > 1e-12:
                nrm.normalize()
            m_amt = moss_amount if tile in moss_tiles else (moss_wood if tile in ('wood', 'roughwood', 'planks', 'bark') else 0.0)
            out = []
            for k, p in enumerate(pts):
                c = self.col[fi][k]
                c = grime(p, c, grime_amt, 3.0, seed)
                if m_amt > 0:
                    c = moss(p, c, nrm.y, m_amt, seed=seed)
                if wet > 0 and p.y < 0.35:
                    c = mul(c, 1 - wet * (0.35 - p.y) / 0.35)
                c = ao_ground(p, c, ao_k, ao_h)
                out.append(c)
            self.col[fi] = out

    def colorize(self, mark, fn):
        """Recalcule les couleurs des faces créées depuis `mark` : fn(position, couleur) -> couleur."""
        _, f0 = mark
        for fi in range(f0, len(self.faces)):
            idx = self.faces[fi][0]
            self.col[fi] = [fn(self.co[i], self.col[fi][k]) for k, i in enumerate(idx)]

    # -------------------------------------------------------------------------------- primitives
    def box(self, c, s, tile, color, rot=None, tex=1.0, mat=0, jitter=0.0, ao=True, uvoff=None):
        """Pavé de centre c, tailles s ; rot = matrice 3x3 facultative ; UV projetées par face, à l'échelle `tex` m/tuile."""
        cx, cy, cz = c
        hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
        P = [Vector((x, y, z)) for x in (-hx, hx) for y in (-hy, hy) for z in (-hz, hz)]
        if jitter:
            P = [p + Vector((self.rng.uniform(-1, 1), self.rng.uniform(-1, 1), self.rng.uniform(-1, 1))) * jitter for p in P]
        if rot is not None:
            P = [rot @ p for p in P]
        P = [p + Vector(c) for p in P]
        ids = [self.v(p) for p in P]
        # (indices, axes de projection u, v en coordonnées locales)
        quads = [((0, 1, 3, 2), 2, 1, s[2], s[1]), ((4, 6, 7, 5), 2, 1, s[2], s[1]),   # -x, +x
                 ((0, 4, 5, 1), 0, 2, s[0], s[2]), ((2, 3, 7, 6), 0, 2, s[0], s[2]),   # -y, +y
                 ((0, 2, 6, 4), 0, 1, s[0], s[1]), ((1, 5, 7, 3), 0, 1, s[0], s[1])]   # -z, +z
        u0, v0, ts = tile_rect(tile)
        off = uvoff if uvoff is not None else (self.rng.random(), self.rng.random())
        for q, au, av, eu, ev in quads:
            sc = max(tex, eu, ev)
            fu = (1 - eu / sc) * off[0]
            fv = (1 - ev / sc) * off[1]
            uvs = []
            for k in q:
                lp = Vector(((k >> 2) & 1, (k >> 1) & 1, k & 1))
                uu = lp[au] * eu / sc + fu
                vv = lp[av] * ev / sc + fv
                uvs.append((u0 + uu * ts, v0 + vv * ts))
            self.face([ids[k] for k in q], uvs, [color] * 4, mat, False)
        return ids

    def lathe(self, prof, seg, tile, color, c=(0, 0, 0), tex=1.0, mat=0, smooth=True, cap_top=False, cap_bot=False,
              radial=None, rot=None, phase=0.0, flat_rows=()):
        """Révolution d'un profil [(r, y)] autour de l'axe y ; `radial(a, y) -> facteur` module le rayon (côtes, douelles)."""
        rows = []
        circ = 2 * math.pi * max(r for r, _ in prof)
        length = sum(math.hypot(prof[i + 1][0] - prof[i][0], prof[i + 1][1] - prof[i][1]) for i in range(len(prof) - 1)) or 1
        sc = max(tex, circ, length)
        u0, v0, ts = tile_rect(tile)
        acc = [0.0]
        for i in range(len(prof) - 1):
            acc.append(acc[-1] + math.hypot(prof[i + 1][0] - prof[i][0], prof[i + 1][1] - prof[i][1]))
        cen = Vector(c)
        for j, (r, y) in enumerate(prof):
            row = []
            for i in range(seg + 1):
                a = phase + 2 * math.pi * i / seg
                k = radial(a, y) if radial else 1.0
                p = Vector((math.cos(a) * r * k, y, math.sin(a) * r * k))
                if rot is not None:
                    p = rot @ p
                row.append(self.v(p + cen))
            rows.append(row)
        for j in range(len(prof) - 1):
            for i in range(seg):
                q = [rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]]
                uvs = [(u0 + (ii / seg) * circ / sc * ts, v0 + acc[jj] / sc * ts) for ii, jj in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))]
                self.face(q[::-1], uvs[::-1], [color] * 4, mat, smooth and j not in flat_rows)
        for cap, j in ((cap_bot, 0), (cap_top, len(prof) - 1)):
            if not cap or prof[j][0] < 1e-4:
                continue
            r = prof[j][0]
            ids = rows[j][:-1]
            uvs = [(u0 + (0.5 + 0.5 * math.cos(phase + 2 * math.pi * i / seg) * min(1, 2 * r / sc)) * ts * 0.98,
                    v0 + (0.5 + 0.5 * math.sin(phase + 2 * math.pi * i / seg) * min(1, 2 * r / sc)) * ts * 0.98) for i in range(seg)]
            if j == 0:
                self.face(ids, uvs, [color] * seg, mat, False)
            else:
                self.face(ids[::-1], uvs[::-1], [color] * seg, mat, False)
        return rows

    def cyl(self, p0, p1, r0, r1, seg, tile, color, tex=1.0, mat=0, caps=True, smooth=True, rings=1):
        """Cylindre (tronc de cône) entre deux points quelconques."""
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        L = d.length
        prof = [(r0 + (r1 - r0) * k / rings, L * k / rings) for k in range(rings + 1)]
        rot = Vector((0, 1, 0)).rotation_difference(d.normalized()).to_matrix()
        return self.lathe(prof, seg, tile, color, c=p0, tex=tex, mat=mat, smooth=smooth, cap_top=caps, cap_bot=caps, rot=rot)

    def sphere(self, c, rx, ry, rz, seg, rings, tile, color, mat=0, tex=1.0, bump=0.0, seed=0.0):
        prof = []
        for j in range(rings + 1):
            t = -math.pi / 2 + math.pi * j / rings
            prof.append((math.cos(t), math.sin(t)))
        rad = None
        if bump:
            rad = lambda a, y: 1 + bump * noise.noise(Vector((math.cos(a) * 2.3 + seed, y * 2.3, math.sin(a) * 2.3)))
        rows = self.lathe([(r * 1.0, y) for r, y in prof], seg, tile, color, c=(0, 0, 0), mat=mat, tex=tex, radial=rad)
        # mise à l'échelle des sommets de la sphère (ils viennent d'être ajoutés)
        first = rows[0][0]
        for i in range(first, len(self.co)):
            p = self.co[i]
            self.co[i] = Vector((c[0] + p.x * rx, c[1] + p.y * ry, c[2] + p.z * rz))
        return rows

    def tube(self, pts, r, seg, tile, color, tex=1.0, mat=0, caps=True, rfn=None):
        """Tube le long d'une polyligne (cordes, bambous courbés, anses)."""
        pts = [Vector(p) for p in pts]
        n = len(pts)
        frames = []
        up = Vector((0, 1, 0))
        for i in range(n):
            t = (pts[min(n - 1, i + 1)] - pts[max(0, i - 1)]).normalized()
            if abs(t.dot(up)) > 0.95:
                up = Vector((1, 0, 0))
            b = t.cross(up).normalized()
            nn = b.cross(t).normalized()
            frames.append((nn, b))
        L = [0.0]
        for i in range(1, n):
            L.append(L[-1] + (pts[i] - pts[i - 1]).length)
        circ = 2 * math.pi * r
        sc = max(tex, L[-1], circ)
        u0, v0, ts = tile_rect(tile)
        rows = []
        for i in range(n):
            nn, b = frames[i]
            rr = r * (rfn(i / (n - 1)) if rfn else 1)
            rows.append([self.v(pts[i] + (nn * math.cos(2 * math.pi * k / seg) + b * math.sin(2 * math.pi * k / seg)) * rr) for k in range(seg + 1)])
        for i in range(n - 1):
            for k in range(seg):
                q = [rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]]
                uvs = [(u0 + kk / seg * circ / sc * ts, v0 + L[ii] / sc * ts) for kk, ii in ((k, i), (k + 1, i), (k + 1, i + 1), (k, i + 1))]
                self.face(q, uvs, [color] * 4, mat, True)
        if caps:
            for i, rev in ((0, True), (n - 1, False)):
                ids = rows[i][:-1]
                uvs = [(u0 + 0.5 * ts, v0 + 0.5 * ts)] * seg
                self.face(ids[::-1] if rev else ids, uvs, [color] * seg, mat, False)

    def quad(self, a, b, c, d, tile, color, mat=0, uvq=None, two=False):
        ids = [self.v(a), self.v(b), self.v(c), self.v(d)]
        u0, v0, ts = tile_rect(tile)
        uvq = uvq or [(0, 0), (1, 0), (1, 1), (0, 1)]
        uvs = [(u0 + u * ts, v0 + v * ts) for u, v in uvq]
        self.face(ids, uvs, [color] * 4, mat, False)
        if two:
            ids2 = [self.v(a), self.v(b), self.v(c), self.v(d)]
            self.face(ids2[::-1], uvs[::-1], [color] * 4, mat, False)

    def cloth(self, origin, w, h, tile, color, nx=4, ny=6, wave=0.03, thick=0.012, mat=0, rot=None, seed=0.0, sag=0.0):
        """Pan de tissu pendant (noren, bannière, serviette) : plaque mince ondulée, haut en origin, vers -y."""
        u0, v0, ts = tile_rect(tile)
        sc = max(1.0, w, h)
        o = Vector(origin)
        grid = {}
        for side in (0, 1):
            for j in range(ny + 1):
                for i in range(nx + 1):
                    x = -w / 2 + w * i / nx
                    y = -h * j / ny
                    z = wave * math.sin(x * 9 + seed) * (j / ny) + sag * (1 - (2 * i / nx - 1) ** 2) * (j / ny) ** 0.5
                    z += (thick / 2 if side else -thick / 2)
                    p = Vector((x, y, z))
                    if rot is not None:
                        p = rot @ p
                    grid[side, i, j] = self.v(o + p)
        for side in (0, 1):
            for j in range(ny):
                for i in range(nx):
                    q = [grid[side, i, j], grid[side, i + 1, j], grid[side, i + 1, j + 1], grid[side, i, j + 1]]
                    uvs = [(u0 + (ii * w / nx) / sc * ts, v0 + (1 - jj * h / ny / sc) * ts * 0.999) for ii, jj in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))]
                    if side == 1:
                        q, uvs = q[::-1], uvs[::-1]
                    self.face(q, uvs, [color] * 4, mat, True)


# ------------------------------------------------------------------------------------------------ usure, AO, mousse
def ao_ground(p, c, k=0.55, h=0.22):
    """Assombrit le pied des objets (occlusion du sol)."""
    t = max(0.0, min(1.0, p.y / h))
    f = k + (1 - k) * (t * t * (3 - 2 * t))
    return mul(c, f)


def grime(p, c, amt=0.12, scale=3.0, seed=0.0):
    n = noise.noise(Vector((p.x * scale + seed, p.y * scale, p.z * scale)))
    return mul(c, 1 + n * amt)


def moss(p, c, normal_up, amount=0.5, color=None, seed=0.0):
    """Mousse sur les faces tournées vers le ciel et dans les creux, modulée par un bruit."""
    color = color or srgb('#5a7433')
    n = noise.noise(Vector((p.x * 4 + seed, p.y * 4, p.z * 4))) * 0.5 + 0.5
    t = max(0.0, min(1.0, (normal_up * 0.7 + 0.3) * amount * 1.6 * n * 1.4 - 0.15))
    return lerp3(c, color, t)
