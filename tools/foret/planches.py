"""Planches de la preuve next-gen : « référence | notre rendu » (jour, nuit) et planche des assets principaux.

Usage : .venv-blender/Scripts/python.exe -I tools/foret/planches.py <dossier des captures> <dossier des références>
Écrit dans <dossier des captures>/.. : planche-jour.jpg, planche-nuit.jpg, planche-assets.jpg.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

shots, refs = sys.argv[1], sys.argv[2]
out = os.path.dirname(os.path.abspath(shots))
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
try:
    font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 30)
    small = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 22)
except Exception:
    font = small = ImageFont.load_default()


def fit(im, w, h):
    """Recadre au même rapport puis redimensionne (même cadrage pour la comparaison)."""
    r = w / h
    W, H = im.size
    if W / H > r:
        nw = int(H * r); im = im.crop(((W - nw) // 2, 0, (W - nw) // 2 + nw, H))
    else:
        nh = int(W / r); im = im.crop((0, (H - nh) // 2, W, (H - nh) // 2 + nh))
    return im.resize((w, h), Image.LANCZOS)


def label(d, xy, text, f=font):
    x, y = xy
    d.rectangle((x - 8, y - 4, x + d.textlength(text, font=f) + 8, y + f.size + 10), fill=(0, 0, 0))
    d.text((x, y), text, fill=(255, 255, 255), font=f)


def compare(ref, ours, name, title):
    w, h = 1280, 720
    a = fit(Image.open(os.path.join(refs, ref)).convert('RGB'), w, h)
    # notre capture sans l'interface (le bandeau du haut est rogné de la même façon des deux côtés)
    b = fit(Image.open(os.path.join(shots, ours)).convert('RGB'), w, h)
    im = Image.new('RGB', (w * 2 + 12, h + 60), (14, 14, 14))
    im.paste(a, (0, 60)); im.paste(b, (w + 12, 60))
    d = ImageDraw.Draw(im)
    d.text((16, 12), title, fill=(230, 230, 230), font=font)
    label(d, (20, 80), 'Référence (Unreal Engine 5)')
    label(d, (w + 32, 80), 'Capy World — Three.js, qualité Max (GTX 1080 Ti)')
    im.save(os.path.join(out, name), quality=90)


compare('foret-escalier.webp', 'foret-jour.png', 'planche-jour.jpg', 'Jour diffus — même cadrage')
compare('foret-nuit-lanterne.webp', 'foret-nuit.png', 'planche-nuit.jpg', 'Nuit, lanterne et flaque')

# planche des assets : captures dans le jeu + atlas Cycles des rameaux + cuissons de la paroi
cells = [
    ('foret-paroi.png', 'Paroi de granite — maillage Blender 1,9 M → 118 k, normales/AO Cycles, mousse, lichen, coulures'),
    ('foret-marches.png', 'Escalier — dalles usées une à une, joints moussus, blocs de bordure, borne'),
    ('foret-cime.png', 'Épicéas Blender 22-34 m — cartes de rameaux, 3 LOD + imposteur, vent'),
    ('foret-clairiere.png', 'Clairière — souche, troncs, racines, flaque (nuit : reflet), bois mort'),
    ('foret-sousbois.png', 'Sous-bois — jeunes épicéas, fougères, oxalis, brindilles, canopée'),
    ('foret-capy.png', 'Le capybara actuel dans la zone (caméra normale)'),
]
W, H = 960, 540
im = Image.new('RGB', (W * 2, H * 4 + 60), (14, 14, 14))
d = ImageDraw.Draw(im)
d.text((16, 12), 'Preuve next-gen — assets principaux (captures dans le jeu, qualité Max)', fill=(230, 230, 230), font=font)
for i, (f, t) in enumerate(cells):
    x, y = (i % 2) * W, 60 + (i // 2) * H
    im.paste(fit(Image.open(os.path.join(shots, f)).convert('RGB'), W, H), (x, y))
    label(d, (x + 14, y + H - 44), t, small)
# rangée du bas : atlas des rameaux (Cycles) et cuisson de la paroi
y = 60 + 3 * H
tw = Image.open(os.path.join(ROOT, 'public', 'assets', 'foret', 'tex', 'rameau_diff.webp')).convert('RGBA')
bg = Image.new('RGBA', tw.size, (190, 190, 186, 255)); bg.alpha_composite(tw)
im.paste(fit(bg.convert('RGB'), H, H), (0, y))
label(d, (14, y + H - 44), 'Rameaux d’épicéa modélisés aiguille par aiguille (Cycles)', small)
nor = Image.open(os.path.join(ROOT, 'public', 'assets', 'foret', 'paroi_nor.jpg')).convert('RGB').resize((W * 2 - H, (H - 10) // 2))
mk = Image.open(os.path.join(ROOT, 'public', 'assets', 'foret', 'paroi_masks.png')).convert('RGB').resize((W * 2 - H, (H - 10) // 2))
im.paste(nor, (H, y)); im.paste(mk, (H, y + (H - 10) // 2 + 10))
label(d, (H + 14, y + 10), 'Paroi : normales cuites (Cycles)', small)
label(d, (H + 14, y + (H - 10) // 2 + 20), 'Paroi : masques mousse (R), lichen (V), coulures (B)', small)
im.save(os.path.join(out, 'planche-assets.jpg'), quality=88)
print('planches écrites dans', out)
