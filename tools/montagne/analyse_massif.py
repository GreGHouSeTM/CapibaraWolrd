# Analyse du massif du Pic de l'Aurore dans le relief cuit actuel (agent Montagne).
# Lit public/assets/terrain (tuiles 16 bits) et produit :
# - des chiffres (sommet, pentes, profils des voies) imprimés en sortie ;
# - docs/montagne/plan-aurore.png (plan schématique avec altitudes et itinéraires proposés) ;
# - docs/montagne/profil-aurore.png (profil en long de la voie normale proposée, avec étages et durées).
# Usage : python tools/montagne/analyse_massif.py
import json, math, os, sys, zlib
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TER = os.path.join(ROOT, 'public', 'assets', 'terrain')
OUT = os.path.join(ROOT, 'docs', 'montagne')
os.makedirs(OUT, exist_ok=True)

meta = json.load(open(os.path.join(TER, 'meta.json'), encoding='utf-8'))
H = meta['height']
N, T, C, X0 = H['n'], H['tile'], H['cell'], H['x0']


def decode(raw, w, h):
    res = np.frombuffer(raw, dtype=np.uint16).reshape(h, w).astype(np.int64)
    u = np.zeros((h, w), dtype=np.int64)
    for j in range(h):
        for i in range(w):
            if j == 0:
                p = 0 if i == 0 else u[j, i - 1]
            elif i == 0:
                p = u[j - 1, 0]
            else:
                p = u[j, i - 1] + u[j - 1, i] - u[j - 1, i - 1]
            u[j, i] = (p + res[j, i]) & 0xFFFF
    return u


def decode_fast(raw, w, h):
    # prédiction planaire : u = cumsum 2D des résidus (mod 2^16)
    res = np.frombuffer(raw, dtype=np.uint16).reshape(h, w).astype(np.int64)
    # ligne 0 et colonne 0 : cumul simple ; le reste : u[j,i] = u[j,i-1]+u[j-1,i]-u[j-1,i-1]+r → cumsum 2D
    u = np.cumsum(np.cumsum(res, axis=0), axis=1)
    return u & 0xFFFF


# zone d'étude : x ∈ [-3900, -700], z ∈ [-700, 2300]
XA, XB, ZA, ZB = -3900, -700, -700, 2300
ti0, ti1 = int((XA - X0) // (T * C)), int((XB - X0) // (T * C))
tj0, tj1 = int((ZA - X0) // (T * C)), int((ZB - X0) // (T * C))
nx, nz = (ti1 - ti0 + 1) * T, (tj1 - tj0 + 1) * T
hm = np.zeros((nz, nx), dtype=np.float32)
for tj in range(tj0, tj1 + 1):
    for ti in range(ti0, ti1 + 1):
        raw = zlib.decompress(open(os.path.join(TER, 'h', f'{ti}_{tj}.bin'), 'rb').read())
        u = decode_fast(raw, T, T)
        hm[(tj - tj0) * T:(tj - tj0 + 1) * T, (ti - ti0) * T:(ti - ti0 + 1) * T] = u * H['scale'] + H['offset']
ox, oz = X0 + ti0 * T * C, X0 + tj0 * T * C


def h_at(x, z):
    fx, fz = (x - ox) / C, (z - oz) / C
    i, j = int(math.floor(fx)), int(math.floor(fz))
    tx, tz = fx - i, fz - j
    a, b = hm[j, i], hm[j, i + 1]
    c, d = hm[j + 1, i], hm[j + 1, i + 1]
    return float((a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz)


# --- chiffres du relief actuel
gz, gx = np.gradient(hm, C)
slope = np.degrees(np.arctan(np.hypot(gx, gz)))
j, i = np.unravel_index(np.argmax(hm), hm.shape)
print(f'point le plus haut de la zone : {hm[j, i]:.1f} m en ({ox + i * C:.0f}, {oz + j * C:.0f})')
print(f'plafond du codage 16 bits : {65535 * H["scale"] + H["offset"]:.1f} m')
for name, (x, z) in {'Pic de l’Aurore': (-2300, 450), 'Mont des Neiges': (-2550, 800), 'Dent du Loup': (-2050, 200),
                     'Clarines': (-1450, 900), 'Lac de Cristal': (-1760, 820), 'Refuge (bible)': (-2150, 350),
                     'Brèche du Loup': (-1900, 30), 'Col des Aurores': (-2350, 1450)}.items():
    print(f'{name:18s} y = {h_at(x, z):6.1f} m')
# pentes dans un rayon de 1 200 m autour du Pic
yy, xx = np.mgrid[0:nz, 0:nx]
rr = np.hypot(ox + xx * C + 2300, oz + yy * C - 450)
for r0, r1 in [(0, 300), (300, 700), (700, 1200)]:
    m = (rr >= r0) & (rr < r1)
    s = slope[m]
    print(f'anneau {r0}-{r1} m : pente médiane {np.median(s):4.1f}°, > 33° : {100 * np.mean(s > 33):4.1f} %, > 42° : {100 * np.mean(s > 42):4.1f} %')
# rugosité : écart à la surface lissée sur 60 m (modelé)
from numpy.lib.stride_tricks import sliding_window_view as swv
k = 15
pad = np.pad(hm, k, mode='edge')
sm = swv(pad, (2 * k + 1, 2 * k + 1))[::4, ::4].mean(axis=(2, 3))
sub = hm[::4, ::4][:sm.shape[0], :sm.shape[1]]
m = (rr[::4, ::4][:sm.shape[0], :sm.shape[1]] < 1200)
print(f'modelé (écart à la surface lissée sur 60 m) dans 1,2 km : médiane {np.median(np.abs(sub - sm)[m]):.2f} m')


def profile(pts, step=4.0):
    out = []
    d = 0.0
    for a, b in zip(pts[:-1], pts[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        n = max(1, int(L / step))
        for k2 in range(n):
            t = k2 / n
            x, z = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            out.append((d + L * t, x, z, h_at(x, z)))
        d += L
    out.append((d, pts[-1][0], pts[-1][1], h_at(*pts[-1])))
    return out


sentier = [(-1650, 1000), (-1800, 700), (-1950, 550), (-2150, 350), (-2300, 450)]
pr = profile(sentier)
dplus = sum(max(0, b[3] - a[3]) for a, b in zip(pr[:-1], pr[1:]))
steep = [math.degrees(math.atan2(b[3] - a[3], b[0] - a[0])) for a, b in zip(pr[:-1], pr[1:])]
print(f'Sentier des Crêtes actuel : {pr[-1][0]:.0f} m, D+ {dplus:.0f} m, pente moyenne {math.degrees(math.atan(dplus / pr[-1][0])):.1f}°, '
      f'max {max(steep):.0f}°, part > 33° : {100 * np.mean(np.array(steep) > 33):.0f} %')


# --- modèle de vitesse de marche selon la pente (identique à src/gameplay/mountain.ts)
def walk_factor(phi):
    """facteur de vitesse en montée pour une pente φ (degrés) dans le sens de la marche"""
    if phi <= 0:
        return min(1.12, 1 + (-phi) / 15 * 0.12) if phi > -30 else 1.12
    pts = [(0, 1.0), (8, 1.0), (15, 0.8), (25, 0.5), (35, 0.24), (41, 0.12)]
    for (a, fa), (b, fb) in zip(pts[:-1], pts[1:]):
        if phi <= b:
            return fa + (fb - fa) * (phi - a) / (b - a)
    return 0.0


WALK = 4.2
print('vitesse de marche et vitesse verticale :')
for phi in (0, 10, 15, 20, 25, 30, 35, 40):
    v = WALK * walk_factor(phi)
    print(f'  {phi:2d}° : {v:4.2f} m/s, verticale {v * math.tan(math.radians(phi)):4.2f} m/s')


def ascent_time(prof):
    t = 0.0
    for a, b in zip(prof[:-1], prof[1:]):
        dx = b[0] - a[0]
        phi = math.degrees(math.atan2(b[3] - a[3], dx))
        f = walk_factor(phi)
        t += dx / (WALK * max(f, 0.05))
    return t


print(f'temps de marche (modèle) sur le Sentier des Crêtes actuel : {ascent_time(pr) / 60:.1f} min')

# --- voie normale proposée (relief cible) : profil en long schématique, étage par étage
# (distance horizontale cumulée en m, altitude cible en m, nom du repère)
VOIE = [
    (0, 170, 'Les Clarines'),
    (500, 262, 'Lac de Cristal'),
    (950, 400, 'Cascade des Marmottes'),
    (1500, 560, 'Lacs Jumeaux'),
    (1950, 700, 'Chalet d’estive'),
    (2450, 850, 'Limite des arbres'),
    (2800, 950, 'Refuge de l’Aurore'),
    (3200, 1060, 'Pierrier du Chamois'),
    (3550, 1150, 'Col du Névé'),
    (3800, 1210, 'Arête des Vents'),
    (3950, 1250, 'Sommet'),
]
DIFF = [(2800, 950), (2930, 1060), (3060, 1170), (3150, 1250)]  # voie de l'Éperon (escalade), depuis le refuge

# temps de marche sur la voie cible : lacets à pente régulière entre les repères
t = 0
rows = []
for (d0, y0, n0), (d1, y1, n1) in zip(VOIE[:-1], VOIE[1:]):
    dx, dy = d1 - d0, y1 - y0
    phi = math.degrees(math.atan2(dy, dx))
    tt = dx / (WALK * walk_factor(phi))
    t += tt
    rows.append((n0, n1, dx, dy, phi, tt))
print('voie normale cible :')
for n0, n1, dx, dy, phi, tt in rows:
    print(f'  {n0:24s} → {n1:24s} {dx:5.0f} m  +{dy:4.0f} m  {phi:4.1f}°  {tt / 60:4.1f} min')
print(f'  total marche pure : {t / 60:.1f} min ; D+ {VOIE[-1][1] - VOIE[0][1]} m ; {VOIE[-1][0] / 1000:.1f} km')

# =============================================================================================== figures
def font(sz, bold=False):
    for f in (('segoeuib.ttf' if bold else 'segoeui.ttf'), ('arialbd.ttf' if bold else 'arial.ttf')):
        p = os.path.join('C:\\Windows\\Fonts', f)
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


INK, MUTE, GRID = (40, 44, 52), (110, 116, 126), (226, 229, 234)
STAGES = [  # (de, à, nom, couleur)
    (150, 450, 'Forêt de vallée, torrent', (92, 140, 88)),
    (450, 620, 'Lacs d’altitude', (110, 160, 170)),
    (620, 800, 'Alpages, chalets d’estive', (160, 196, 110)),
    (800, 900, 'Pinède claire, limite des arbres', (128, 150, 100)),
    (900, 1060, 'Éboulis, barres rocheuses', (160, 150, 140)),
    (1060, 1180, 'Névés, glacier', (190, 210, 225)),
    (1180, 1260, 'Arête sommitale', (225, 232, 240)),
]

# --- profil en long
W, Hh = 1800, 900
img = Image.new('RGB', (W, Hh), (250, 250, 247))
dr = ImageDraw.Draw(img)
L, R, TOP, BOT = 120, W - 360, 90, Hh - 110
xmax, ymin, ymax = 4200, 100, 1300
X = lambda d: L + (R - L) * d / xmax
Y = lambda y: BOT - (BOT - TOP) * (y - ymin) / (ymax - ymin)
for y0, y1, name, col in STAGES:
    dr.rectangle([L, Y(y1), R, Y(y0)], fill=tuple(int(c * 0.25 + 250 * 0.75) for c in col))
    dr.text((R + 14, (Y(y0) + Y(y1)) / 2 - 10), f'{name}  ({y0}-{y1} m)', fill=INK, font=font(17))
for y in range(200, 1400, 100):
    dr.line([L, Y(y), R, Y(y)], fill=GRID, width=1)
    dr.text((L - 60, Y(y) - 10), f'{y} m', fill=MUTE, font=font(15))
for d in range(0, 4500, 500):
    dr.line([X(d), BOT, X(d), BOT + 6], fill=MUTE)
    dr.text((X(d) - 16, BOT + 10), f'{d / 1000:.1f} km', fill=MUTE, font=font(15))
# mer de nuages
dr.rectangle([L, Y(740), R, Y(660)], fill=(255, 255, 255))
dr.text((X(100), Y(732)), 'mer de nuages du matin (660-740 m)', fill=MUTE, font=font(15))
# relief actuel (Sentier des Crêtes) en pointillé
pts = [(X(p[0]), Y(p[3])) for p in pr]
for a, b in list(zip(pts[:-1], pts[1:]))[::2]:
    dr.line([a, b], fill=(200, 90, 80), width=3)
dr.text((X(pr[-1][0]) + 10, Y(pr[-1][3]) - 26), f'relief actuel : Sentier des Crêtes\n{pr[-1][0] / 1000:.1f} km, {ascent_time(pr) / 60:.0f} min', fill=(180, 70, 60), font=font(15))
# voie normale
vp = [(X(d), Y(y)) for d, y, _ in VOIE]
dr.line(vp, fill=(30, 80, 160), width=5, joint='curve')
cum = 0
for k2, (d, y, name) in enumerate(VOIE):
    if k2:
        cum += rows[k2 - 1][5]
    x, y2 = X(d), Y(y)
    dr.ellipse([x - 6, y2 - 6, x + 6, y2 + 6], fill=(30, 80, 160))
    dy = -44 if k2 % 2 == 0 else 14
    dr.text((x - 50, y2 + dy), f'{name}\n{y} m · {cum / 60:.0f} min', fill=INK, font=font(14))
dp = [(X(d), Y(y)) for d, y in DIFF]
dr.line(dp, fill=(200, 120, 20), width=4)
dr.text((X(DIFF[1][0]) - 210, Y(DIFF[1][1]) - 8), 'voie de l’Éperon\n(escalade, 8-10 min)', fill=(170, 100, 10), font=font(15))
dr.text((L, 24), 'Pic de l’Aurore : profil en long de la voie normale proposée (sommet proposé à 1 250 m)', fill=INK, font=font(28, True))
dr.text((L, 60), f'Temps de marche pure au modèle de vitesse en pente : {t / 60:.0f} min ; 20 à 30 min avec les détours, les pauses et l’exploration.', fill=MUTE, font=font(17))
img.save(os.path.join(OUT, 'profil-aurore.png'))

# --- plan schématique : relief actuel en estompage + itinéraires proposés (coordonnées monde)
PA, PB, QA, QB = -3300, -1300, -150, 1250
PX = 0.55  # pixels par mètre
pw, ph = int((PB - PA) * PX), int((QB - QA) * PX)
i0, i1 = int((PA - ox) / C), int((PB - ox) / C)
j0, j1 = int((QA - oz) / C), int((QB - oz) / C)
sub = hm[j0:j1, i0:i1]
gz2, gx2 = np.gradient(sub, C)
shade = np.clip(0.62 + (gx2 * -0.5 + gz2 * -0.5) * 0.6, 0.25, 1)
hn = np.clip(sub / 1000, 0, 1)
base = np.stack([170 + 70 * hn, 190 + 55 * hn, 160 + 90 * hn], -1) * shade[..., None]
im = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).resize((pw, ph))
plan = Image.new('RGB', (pw + 430, ph + 70), (250, 250, 247))
plan.paste(im, (0, 60))
d2 = ImageDraw.Draw(plan)
P = lambda x, z: ((x - PA) * PX, (z - QA) * PX + 60)
# courbes de niveau tous les 100 m (relief actuel)
for lev in range(100, 1000, 100):
    msk = ((sub[:-1, :-1] < lev) != (sub[1:, :-1] < lev)) | ((sub[:-1, :-1] < lev) != (sub[:-1, 1:] < lev))
    ys, xs = np.nonzero(msk)
    for yy2, xx2 in zip(ys[::3], xs[::3]):
        d2.point(P(PA + xx2 * C, QA + yy2 * C), fill=(110, 110, 110))
# emprise proposée du massif rehaussé
ell = [P(-2600 + 1000 * math.cos(a) * (0.9 if math.cos(a) > 0 else 0.75), 520 + 850 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 90)]
ell = [q for q in ell + [ell[0]] if 60 <= q[1] <= ph + 60 and 0 <= q[0] <= pw]
for a2, b2 in zip(ell[:-1], ell[1:]):
    if math.dist(a2, b2) < 80: d2.line([a2, b2], fill=(150, 60, 160), width=3)
NOR = [(-1450, 900), (-1760, 820), (-1880, 700), (-2050, 820), (-2150, 650), (-2250, 480), (-2380, 330), (-2520, 300), (-2580, 420), (-2600, 520)]
ROUTES = {
    'Voie normale (lacets ×3 sur le terrain)': (NOR, (30, 80, 160), 6),
    'Voie de l’Éperon (escalade)': ([(-2250, 480), (-2430, 500), (-2600, 520)], (210, 120, 20), 4),
    'Raccourci des Chamois (raide)': ([(-1880, 700), (-2000, 600), (-2150, 650)], (60, 150, 60), 3),
    'Boucle des Lacs (pour se perdre)': ([(-2050, 820), (-2250, 930), (-2450, 930), (-2600, 780), (-2420, 680), (-2150, 650)], (110, 110, 110), 3),
    'Traversée du glacier (après le sommet)': ([(-2600, 520), (-2800, 560), (-2960, 580), (-3200, 640)], (70, 150, 210), 3),
    'Mine (cul-de-sac)': ([(-2150, 650), (-2030, 500)], (120, 80, 50), 3),
}
for name, (pts2, col, wd) in ROUTES.items():
    d2.line([P(*q) for q in pts2], fill=col, width=wd, joint='curve')
LIEUX = [  # x, z, nom, sorte, décalage de l'étiquette
    (-1450, 900, 'Les Clarines 170', 'v', (10, -8)), (-1760, 820, 'Lac de Cristal 262', 'l', (-60, -32)),
    (-1880, 700, 'Cascade des Marmottes 400', 'c', (10, -24)), (-2050, 820, 'Lacs Jumeaux 560', 'l', (8, 6)),
    (-2150, 650, 'Chalet d’estive 700', 'v', (10, 4)), (-2030, 500, 'Mine abandonnée 820', 'g', (10, -6)),
    (-2250, 480, 'Refuge 950', 'r', (10, -2)), (-2380, 330, 'Pierrier du Chamois 1 060', 'p', (10, -6)),
    (-2520, 300, 'Col du Névé 1 150', 'p', (-150, -26)), (-2580, 420, 'Arête des Vents 1 210', 'p', (-190, -10)),
    (-2600, 520, 'SOMMET 1 250 · Pierre-Vapeur', 's', (-120, 16)), (-2450, 930, 'Grotte de glace', 'g', (-60, 10)),
    (-2250, 930, 'Ermitage', 'r', (8, -26)), (-2050, 200, 'Dent du Loup', 'p', (10, -8)),
    (-2960, 580, 'Crevasse, pont de neige', 'c', (-80, 12)), (-1900, 30, 'Brèche du Loup', 'p', (10, -8)),
    (-2600, 780, 'Belvédère des Neiges', 'c', (-170, -6)), (-2420, 680, 'Grotte des Veines Tièdes', 'g', (8, -2)),
]
for x, z, name, kind, (lx, lz) in LIEUX:
    px, pz = P(x, z)
    col = {'s': (200, 30, 40), 'r': (190, 70, 40), 'g': (55, 55, 55), 'l': (40, 120, 190), 'v': (120, 60, 120)}.get(kind, (40, 44, 52))
    rad = 10 if kind == 's' else 6
    d2.ellipse([px - rad, pz - rad, px + rad, pz + rad], fill=col, outline=(255, 255, 255), width=2)
    tx, tz = px + lx, pz + lz
    f = font(16, kind == 's')
    bb = d2.textbbox((tx, tz), name, font=f)
    d2.rectangle([bb[0] - 3, bb[1] - 2, bb[2] + 3, bb[3] + 2], fill=(255, 255, 255))
    d2.text((tx, tz), name, fill=INK, font=f)
d2.text((10, 14), 'Pic de l’Aurore : plan schématique des itinéraires proposés', fill=INK, font=font(24, True))
d2.text((pw + 20, 64), 'Nord en haut. Fond : relief actuel\n(courbes tous les 100 m). Altitudes et\nlieux : relief cible proposé.', fill=MUTE, font=font(16))
ly = 140
for name, (_, col, wd) in ROUTES.items():
    d2.line([pw + 20, ly + 10, pw + 70, ly + 10], fill=col, width=wd)
    d2.text((pw + 80, ly), name, fill=INK, font=font(16))
    ly += 30
d2.line([pw + 20, ly + 10, pw + 70, ly + 10], fill=(150, 60, 160), width=3)
d2.text((pw + 80, ly), 'Emprise du massif rehaussé\n(≈ 1,7 × 1,7 km au-dessus de 300 m)', fill=INK, font=font(16))
ly += 70
d2.text((pw + 20, ly), 'Échelle : 500 m', fill=MUTE, font=font(16))
d2.line([pw + 20, ly + 30, pw + 20 + 500 * PX, ly + 30], fill=INK, width=4)
plan.save(os.path.join(OUT, 'plan-aurore.png'))
print('figures écrites dans', OUT)
