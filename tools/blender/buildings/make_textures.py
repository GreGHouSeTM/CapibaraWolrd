"""Textures partagées des bâtiments de Capyville (relançable).

Usage : python3 tools/blender/buildings/make_textures.py

Produit dans public/assets/models/buildings/tex/ :
  - versions « neutres » (gris clair, contraste conservé) du bois, des planches et de l'enduit de public/assets/tex/ :
    la teinte réelle vient des couleurs de sommets des modèles (une seule matière bois sert au bois sombre patiné,
    au bois clair des shōji et à la laque vermillon) ; les cartes de normales restent celles de public/assets/tex/.
  - pierre sèche (Poly Haven « japanese_stone_wall », CC0, téléchargée en 1k) ;
  - tuiles kawara procédurales (couvre-joints ronds, tuiles plates concaves, rangs en escalier) + normales ;
  - papier de shōji procédural avec le quadrillage kumiko peint (sert de lumière la nuit) ;
  - enduit namako (carreaux noirs à joints blancs en losange) des greniers kura ;
  - cuivre vert-de-gris des toits de sanctuaire ; chaume (Poly Haven « thatch_roof_angled », CC0).
Aucune dépendance autre que numpy et Pillow.
"""
import os
import subprocess
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../..'))
SRC = os.path.join(ROOT, 'public/assets/tex')
OUT = os.path.join(ROOT, 'public/assets/models/buildings/tex')
CACHE = os.path.join(HERE, '.cache', 'polyhaven')
rng = np.random.default_rng(7)


def load(path, size=None):
    im = Image.open(path).convert('RGB')
    if size:
        im = im.resize((size, size), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0


def save(arr, name, q=86):
    arr = np.clip(arr, 0, 1)
    im = Image.fromarray((arr * 255 + 0.5).astype(np.uint8))
    im.save(os.path.join(OUT, name), quality=q, optimize=True)
    print('  ', name, os.path.getsize(os.path.join(OUT, name)) // 1024, 'Ko')


def ph(asset, kind='diff', res='1k'):
    """Télécharge (une fois) une carte Poly Haven CC0."""
    os.makedirs(CACHE, exist_ok=True)
    f = os.path.join(CACHE, f'{asset}_{kind}_{res}.jpg')
    if not os.path.exists(f):
        url = f'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/{res}/{asset}/{asset}_{kind}_{res}.jpg'
        subprocess.run(['curl', '-sSfL', '-o', f, url], check=True)
    return f


def blur(a, r):
    if a.ndim == 2:
        im = Image.fromarray((np.clip(a, 0, 1) * 65535).astype(np.uint16).astype(np.int32), mode='I')
        im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))
        return np.asarray(im).astype(np.float32) / 255.0
    return np.stack([blur(a[..., i], r) for i in range(a.shape[2])], -1)


def tile_noise(n, freq, seed):
    """Bruit lisse et raccordable (somme de sinus aléatoires périodiques)."""
    g = np.random.default_rng(seed)
    y, x = np.mgrid[0:n, 0:n] / n
    acc = np.zeros((n, n), np.float32)
    amp = 1.0
    for o in range(5):
        f = freq * (2 ** o)
        for _ in range(6):
            kx, ky = g.integers(-f, f + 1), g.integers(-f, f + 1)
            ph_ = g.random() * 6.283
            acc += amp * np.sin(6.283 * (kx * x + ky * y) + ph_)
        amp *= 0.55
    acc -= acc.min()
    return acc / max(acc.max(), 1e-6)


def neutral(src, mean_target, contrast=1.0, size=1024):
    """Gris neutre de moyenne donnée (sRGB) en gardant les détails : la couleur viendra des sommets."""
    a = load(src, size)
    lum = a @ np.array([0.299, 0.587, 0.114], np.float32)
    m = lum.mean()
    out = mean_target * (lum / m) ** contrast
    return np.repeat(out[..., None], 3, -1)


def normal_from_height(h, strength):
    """Carte de normales OpenGL (+Y vers le haut de l'image) à partir d'un champ de hauteur raccordable."""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, 1, 0) - np.roll(h, -1, 0)) * 0.5  # ligne 0 = haut de l'image
    nx, ny, nz = -dx * strength, -dy * strength, np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / l * 0.5 + 0.5, ny / l * 0.5 + 0.5, nz / l * 0.5 + 0.5], -1)


def kawara(n=512):
    """Tuiles kawara : 4 couvre-joints (marugawara) × 4 rangs. u = travers du toit, v = vers le faîtage (haut de l'image).
    Couvre-joint centré sur u = (k + 0,5) / 4, rayon 0,26 pas ; tuile plate concave entre deux couvre-joints."""
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    u = x / n
    v = 1.0 - (y + 0.5) / n
    cu = (u * 4) % 1.0
    col = np.floor(u * 4).astype(int)
    cv = (v * 4) % 1.0
    row = np.floor(v * 4).astype(int)
    r = 0.30
    dcov = np.abs(cu - 0.5) / r
    cover = dcov < 1
    hc = np.sqrt(np.clip(1 - dcov ** 2, 0, 1))
    # tuile plate : creux centré entre deux couvre-joints (cu = 0 ou 1)
    dp = np.minimum(cu, 1 - cu) / (0.5 - r * 0.6)
    hp = -0.35 * np.cos(np.clip(dp, 0, 1) * np.pi / 2) ** 2
    # rangs : la tuile du dessus recouvre celle du dessous -> petite marche à chaque rang
    step = 0.22 * (1 - cv)
    h = np.where(cover, 0.35 + 0.75 * hc, hp) + step
    h += 0.012 * tile_noise(n, 3, 11)
    # couleurs : anthracite avec variation par tuile, traces claires d'usure et de lichen
    g = np.random.default_rng(5)
    var_cov = g.normal(0, 0.06, (4, 4))
    var_pan = g.normal(0, 0.07, (4, 4))
    colshift = ((col + np.where(cover, 0, 2)) % 4)
    tv = np.where(cover, var_cov[row % 4, col % 4], var_pan[row % 4, colshift])
    base = np.array([0.255, 0.27, 0.29], np.float32)  # ≈ #41454a en sRGB
    c = base[None, None, :] * (1 + tv[..., None])
    # ombre au pied de chaque marche et au fond du creux
    shade = 1 - 0.45 * np.clip((cv - 0.86) / 0.14, 0, 1) * np.where(cover, 0.6, 1)
    shade *= 1 - 0.25 * np.where(cover, 0, np.clip(1 - dp, 0, 1) ** 2)
    shade *= 1 - 0.3 * np.where(cover, np.clip((dcov - 0.8) / 0.2, 0, 1), 0)
    c *= shade[..., None]
    # reflet sur le dessus des couvre-joints (vernis mat)
    c += np.where(cover, 0.05 * hc ** 4, 0)[..., None]
    nz = tile_noise(n, 4, 21)
    lich = np.clip((nz - 0.78) * 5, 0, 1) * 0.5
    c = c * (1 - lich[..., None]) + np.array([0.42, 0.43, 0.36]) * lich[..., None]
    c *= (0.93 + 0.14 * tile_noise(n, 6, 31))[..., None]
    save(c, 'kawara_diff.jpg')
    save(normal_from_height(h, 18.0), 'kawara_nor.jpg', q=90)


def paper(n=512):
    """Papier washi avec quadrillage kumiko peint : 4 × 4 cases par motif (la géométrie LOD0 recouvre exactement les traits)."""
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    u, v = x / n, 1 - (y + 0.5) / n
    fib = tile_noise(n, 8, 41)
    fib2 = np.asarray(Image.fromarray((rng.random((n, n)) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))) / 255.0
    base = np.array([0.95, 0.91, 0.82], np.float32)
    c = base * (0.94 + 0.06 * fib[..., None]) * (0.97 + 0.05 * fib2[..., None])
    # traits du quadrillage (bois clair) : 7 % de la case
    du = np.abs(((u * 4) + 0.5) % 1.0 - 0.5)
    dv = np.abs(((v * 4) + 0.5) % 1.0 - 0.5)
    line = (du < 0.035) | (dv < 0.03)
    wood = np.array([0.62, 0.50, 0.36], np.float32)
    c = np.where(line[..., None], wood * (0.9 + 0.1 * fib[..., None]), c)
    # légère ombre de part et d'autre des traits
    soft = np.clip(1 - np.minimum(du / 0.08, dv / 0.07), 0, 1)
    c *= (1 - 0.06 * soft)[..., None]
    save(c, 'paper_diff.jpg', q=88)


def namako(n=512):
    """Carreaux noirs posés sur pointe à joints blancs bombés (soubassement des kura). 2 × 2 carreaux par motif."""
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    u, v = x / n * 2, y / n * 2
    a, b = (u + v) % 1.0, (u - v) % 1.0
    d = np.minimum(np.minimum(a, 1 - a), np.minimum(b, 1 - b))
    joint = d < 0.07
    hj = np.clip(1 - d / 0.07, 0, 1)
    tile = np.array([0.09, 0.095, 0.10], np.float32) * (0.9 + 0.2 * tile_noise(n, 5, 51))[..., None]
    white = np.array([0.86, 0.85, 0.81], np.float32) * (0.92 + 0.08 * tile_noise(n, 9, 52))[..., None]
    c = np.where(joint[..., None], white, tile)
    save(c, 'namako_diff.jpg')
    h = np.where(joint, 0.6 * np.sin(hj * np.pi / 2), 0.0) + 0.02 * tile_noise(n, 6, 53)
    save(normal_from_height(h, 10.0), 'namako_nor.jpg', q=90)


def copper(n=512):
    """Cuivre vert-de-gris en lés à joints debout (toits des sanctuaires). 6 lés par motif."""
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    u = x / n * 6
    cu = u % 1.0
    seam = np.abs(cu - 0.5) > 0.46
    nz = tile_noise(n, 4, 61)
    nz2 = tile_noise(n, 12, 62)
    verd = np.array([0.33, 0.55, 0.47]) * (0.85 + 0.25 * nz[..., None])
    dark = np.array([0.20, 0.30, 0.26])
    c = verd * (1 - 0.35 * nz2[..., None]) + dark * 0.35 * nz2[..., None]
    c = np.where(seam[..., None], c * 0.8, c)
    save(c, 'copper_diff.jpg')
    h = np.where(seam, 1.0, 0.0) + 0.04 * nz2
    save(normal_from_height(blur(h, 1.2), 6.0), 'copper_nor.jpg', q=90)


def main():
    os.makedirs(OUT, exist_ok=True)
    print('textures ->', OUT)
    # bois patiné neutre (grain fort), planches, enduit
    save(neutral(os.path.join(SRC, 'roughwood_diff.jpg'), 0.80, 1.15), 'wood_diff.jpg')
    save(neutral(os.path.join(SRC, 'planks_diff.jpg'), 0.80, 1.0), 'planks_diff.jpg')
    pl = neutral(os.path.join(SRC, 'plaster_diff.jpg'), 0.90, 1.2)
    stains = tile_noise(1024, 3, 71)
    pl *= (0.95 + 0.05 * stains)[..., None]
    save(pl, 'plaster_diff.jpg')
    # pierre sèche
    st = load(ph('japanese_stone_wall', 'diff'))
    save(st, 'stone_diff.jpg', q=84)
    save(load(ph('japanese_stone_wall', 'nor_gl')), 'stone_nor.jpg', q=88)
    # chaume
    save(load(ph('thatch_roof_angled', 'diff')), 'thatch_diff.jpg', q=84)
    save(load(ph('thatch_roof_angled', 'nor_gl')), 'thatch_nor.jpg', q=88)
    kawara()
    paper()
    namako()
    copper()


if __name__ == '__main__':
    main()
