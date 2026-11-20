"""Préparation des textures CC0 de la zone « forêt » : retouche, regroupement des canaux, compression WebP.

Usage : .venv-blender/Scripts/python.exe -I tools/foret/textures.py [nom…]

Pour chaque matière : <nom>_diff.webp (couleur, sRGB), <nom>_nor.webp (normales OpenGL), <nom>_arh.webp
(R = occlusion, G = rugosité, B = hauteur). Les photoscans sont retouchés pour la palette de la référence (sous-bois
froid et désaturé, mousse riche) et pour casser la répétition (grandes variations de valeur retirées : elles sont
recréées par les masques et le bruit du shader, à l'échelle du monde).
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
DL = os.path.join(HERE, '.cache', 'dl')
OUT = os.path.join(ROOT, 'public', 'assets', 'foret', 'tex')


def ph(aid, k, res='2k'):
    ext = 'png' if k == 'disp' else 'jpg'
    return os.path.join(DL, 'ph', aid, f'{aid}_{k}_{res}.{ext}')


def acg(aid, k):
    m = {'diff': 'Color', 'nor': 'NormalGL', 'ao': 'AmbientOcclusion', 'rough': 'Roughness', 'disp': 'Displacement'}[k]
    return os.path.join(DL, 'acg', aid, f'{aid}_2K-JPG_{m}.jpg')


def load(path, size, mode='RGB'):
    im = Image.open(path)
    if im.mode in ('I;16', 'I;16B', 'I'):
        a = np.asarray(im).astype(np.float32) / 65535.0
        im = Image.fromarray((a * 255).astype(np.uint8), 'L')
    im = im.convert(mode)
    if im.size != (size, size):
        im = im.resize((size, size), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0


def flatten(rgb, radius_frac=0.08, amount=0.75):
    """Retire les grandes variations de luminosité (taches qui trahissent la répétition)."""
    im = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8))
    r = max(4, int(im.size[0] * radius_frac))
    low = np.asarray(im.filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255.0
    lum_low = low.mean(-1, keepdims=True)
    mean = rgb.mean((0, 1), keepdims=True).mean(-1, keepdims=True)
    return rgb * (1 + amount * (mean / np.maximum(lum_low, 1e-3) - 1))


def grade(rgb, sat=1.0, gain=(1, 1, 1), gamma=1.0, lift=0.0):
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722])
    out = lum[..., None] + (rgb - lum[..., None]) * sat
    out = np.clip(out, 0, 1) ** gamma * np.array(gain) + lift
    return np.clip(out, 0, 1)


def save(name, diff, nor, arh, size, q=(86, 84, 84)):
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray((np.clip(diff, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, f'{name}_diff.webp'), quality=q[0], method=6)
    Image.fromarray((np.clip(nor, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, f'{name}_nor.webp'), quality=q[1], method=6)
    Image.fromarray((np.clip(arh, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, f'{name}_arh.webp'), quality=q[2], method=6)
    kb = sum(os.path.getsize(os.path.join(OUT, f'{name}_{k}.webp')) for k in ('diff', 'nor', 'arh')) / 1024
    print(f'{name:14s} {size}² {kb:7.0f} Ko', flush=True)


def norm_height(h):
    lo, hi = np.percentile(h, 1), np.percentile(h, 99)
    return np.clip((h - lo) / max(hi - lo, 1e-4), 0, 1)


def ph_mat(name, aid, size=2048, sat=1.0, gain=(1, 1, 1), gamma=1.0, flat=0.7, rough_mul=1.0, rough_add=0.0):
    d = load(ph(aid, 'diff'), size)
    if flat:
        d = flatten(d, amount=flat)
    d = grade(d, sat, gain, gamma)
    n = load(ph(aid, 'nor'), size)
    arm = load(ph(aid, 'arm'), size)
    h = norm_height(load(ph(aid, 'disp'), size, 'L'))
    arh = np.stack([arm[..., 0], np.clip(arm[..., 1] * rough_mul + rough_add, 0, 1), h], -1)
    save(name, d, n, arh, size)


def acg_mat(name, aid, size=2048, sat=1.0, gain=(1, 1, 1), gamma=1.0, flat=0.6, rough_mul=1.0, rough_add=0.0):
    d = load(acg(aid, 'diff'), size)
    if flat:
        d = flatten(d, amount=flat)
    d = grade(d, sat, gain, gamma)
    n = load(acg(aid, 'nor'), size)
    ao = load(acg(aid, 'ao'), size, 'L')
    r = load(acg(aid, 'rough'), size, 'L')
    h = norm_height(load(acg(aid, 'disp'), size, 'L'))
    arh = np.stack([ao, np.clip(r * rough_mul + rough_add, 0, 1), h], -1)
    save(name, d, n, arh, size)


MATS = {
    # paroi : granite moussu froid (gris-vert-bleu), lichen_rock plus sombre en variation
    'rocA': lambda: ph_mat('rocA', 'mossy_rock', sat=0.72, gain=(0.94, 0.98, 1.0), flat=0.65),
    'rocB': lambda: ph_mat('rocB', 'lichen_rock', sat=0.65, gain=(0.98, 1.0, 1.02), flat=0.6),
    # mousse courte (paroi, marches, sol) : vert profond, légèrement jaune dans les hautes lumières
    'mousse': lambda: acg_mat('mousse', 'Moss002', sat=0.82, gain=(0.86, 0.92, 0.7), gamma=1.12, flat=0.5),
    # 'mousse2' (Moss003) et 'litiere' (forest_leaves_02) : essayées, non retenues (poids)
    '_mousse2': lambda: acg_mat('mousse2', 'Moss003', sat=0.85, gain=(0.95, 1.0, 0.8), gamma=1.05, flat=0.5),
    # sol : litière d'aiguilles, litière moussue, sentier, boue
    'aiguilles': lambda: ph_mat('aiguilles', 'forrest_ground_03', sat=0.7, gain=(0.95, 0.93, 0.9), flat=0.7),
    '_litiere': lambda: ph_mat('litiere', 'forest_leaves_02', sat=0.72, gain=(0.92, 0.95, 0.88), flat=0.6),
    'sentier': lambda: ph_mat('sentier', 'forest_ground_04', sat=0.65, gain=(0.96, 0.95, 0.94), flat=0.65),
    'boue': lambda: ph_mat('boue', 'mud_forest', sat=0.75, gain=(0.9, 0.9, 0.9), flat=0.5, rough_mul=0.8),
    'solmousse': lambda: acg_mat('solmousse', 'Ground037', sat=0.75, gain=(0.9, 0.95, 0.85), flat=0.55),
    # escalier : dessus usé (rock_01), flancs bruts (rock_face_03)
    'marche': lambda: ph_mat('marche', 'rock_01', sat=0.45, gain=(0.95, 0.97, 1.0), gamma=1.05, flat=0.55),
    'marcheflanc': lambda: ph_mat('marcheflanc', 'rock_face_03', sat=0.4, gain=(0.95, 0.97, 1.0), flat=0.5),
    # écorces
    'ecorce': lambda: ph_mat('ecorce', 'knotted_pine_bark', sat=0.7, gain=(0.95, 0.95, 0.95), flat=0.4),
}



def pom_heights():
    """Hauteurs du sol regroupées pour le parallax occlusion mapping : R aiguilles, G sol moussu, B sentier (même pavé)."""
    hs = []
    for n in ('aiguilles', 'solmousse', 'sentier'):
        hs.append(np.asarray(Image.open(os.path.join(OUT, f'{n}_arh.webp')).convert('RGB'))[..., 2])
    Image.fromarray(np.stack(hs, -1)).save(os.path.join(OUT, 'solh.webp'), quality=90, method=6)
    print('solh', os.path.getsize(os.path.join(OUT, 'solh.webp')) // 1024, 'Ko')


MATS['solh'] = pom_heights



def cards_webp():
    """Atlas des rameaux et des imposteurs (PNG des scripts Blender) → WebP (alpha conservé) : −60 % de poids."""
    for n in ('rameau_diff', 'rameau_nor', 'epicea_imp_diff', 'epicea_imp_nor'):
        p = os.path.join(OUT, n + '.png')
        if not os.path.exists(p):
            continue
        im = Image.open(p)
        im.save(os.path.join(OUT, n + '.webp'), quality=90, alpha_quality=100, method=6)
        os.remove(p)
        print(n, os.path.getsize(os.path.join(OUT, n + '.webp')) // 1024, 'Ko')


MATS['cartes'] = cards_webp


if __name__ == '__main__':
    want = sys.argv[1:] or [k for k in MATS if not k.startswith('_')]
    for k in want:
        MATS[k]()
