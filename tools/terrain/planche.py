"""Planche avant/après : une ligne par vue, une colonne par dossier de captures (légendes en haut de chaque image).

Usage : <python> tools/terrain/planche.py <sortie.jpg> <vue1,vue2,...> <dossier1>=<légende1> <dossier2>=<légende2> [...]
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont


def main():
    out, views, cols = sys.argv[1], sys.argv[2].split(','), [a.split('=', 1) for a in sys.argv[3:]]
    W, H = 800, 450
    try:
        font = ImageFont.truetype('arial.ttf', 22)
    except OSError:
        font = ImageFont.load_default()
    sheet = Image.new('RGB', (W * len(cols), H * len(views)), (20, 20, 24))
    d = ImageDraw.Draw(sheet)
    for r, v in enumerate(views):
        for c, (folder, label) in enumerate(cols):
            p = os.path.join(folder, v + '.png')
            if os.path.exists(p):
                sheet.paste(Image.open(p).convert('RGB').resize((W, H), Image.LANCZOS), (c * W, r * H))
            txt = f'{label} — {v}'
            d.rectangle([c * W, r * H, c * W + 12 + 12 * len(txt), r * H + 32], fill=(0, 0, 0))
            d.text((c * W + 8, r * H + 4), txt, fill=(255, 255, 255), font=font)
    sheet.save(out, quality=87)
    print('planche', out, sheet.size)


if __name__ == '__main__':
    main()
