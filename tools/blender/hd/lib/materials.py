"""Matières du pipeline « Modélisation HD » (bâtiments vedettes, tranche verticale).

Chaque matière est une matière photoscannée Poly Haven 2k (CC0) : diffuse + normale OpenGL + ARM (= ORM du glTF :
R occlusion, G rugosité, B métal). Les UV sont en mètres divisés par `size` (taille réelle de la texture, en m).
La teinte réelle, l'occlusion cuite (Cycles), l'usure des arêtes, la salissure, les coulures et la mousse sont portées
par la couleur de sommet (COLOR_0, linéaire), multipliée par la texture dans Three.js comme dans les autres bâtiments.

Les noms commencent par `hd_` : ils ne se mélangent pas aux matières partagées du reste du village (fusion par nom).
"""
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.abspath(os.path.join(HERE, '../../..'))
OUT_DIR = os.path.join(ROOT, 'public/assets/models/buildings/hd')
TEX_DIR = os.path.join(OUT_DIR, 'tex')

HD_MATERIALS = {
    # bois de structure (poteaux, poutres, chevrons, kōshi) : hinoki veiné, teinté sombre par sommet
    'hd_bois': dict(ph='hinoki_planks', size=1.9, rough=1.0, nscale=1.0),
    # bardage et planches (soubassements de bois, volets, pignons)
    'hd_planches': dict(ph='japanese_cedar_planks', size=1.13, rough=1.0, nscale=1.0),
    # planches patinées grises (engawa, tablier du pont, marches)
    'hd_bois_gris': dict(ph='weathered_planks', size=2.0, rough=1.0, nscale=1.0),
    # enduit à la chaux (murs entre poteaux)
    'hd_enduit': dict(ph='white_plaster_rough_01', size=2.0, rough=1.0, nscale=0.9),
    # céramique des kawara (ibushi-gawara gris argent) : grain fin, teinte par sommet
    'hd_tuile': dict(ph='grey_plaster_02', size=1.0, rough=0.75, nscale=0.6, res=1024),
    # pierres sèches du soubassement, pas japonais
    'hd_pierre': dict(ph='rock_boulder_dry', size=1.8, rough=1.0, nscale=1.0),
    # coton des noren (toile de chanvre, teinte indigo par sommet)
    'hd_tissu': dict(ph='hessian_230', size=0.27, rough=1.0, nscale=0.7, res=1024),
    # papier des shōji : émissif la nuit (même convention que paper_shoji : extras.night)
    'hd_papier': dict(diff='../tex/paper_diff.jpg', emis='../tex/paper_diff.jpg', emis_factor=(1.0, 0.62, 0.30), rough=0.9,
                      extras={'night': True, 'emissiveBoost': 1.0}),
    # fer forgé, cuivre des chaînes de pluie et des gouttières, clous
    'hd_metal': dict(color=(0.32, 0.22, 0.14), rough=0.5, metal=0.85),
    # fond sombre des pièces ouvertes
    'hd_interieur': dict(color=(0.03, 0.022, 0.017), rough=1.0),
}


def srgb2lin(x):
    return x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4


def hexlin(h):
    h = h.lstrip('#')
    return tuple(srgb2lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))


# Teintes (multiplicateurs linéaires de la texture) : les photos sont claires, la couleur de sommet les assombrit.
T = {
    'bois_sombre': (0.30, 0.20, 0.135),   # hinoki -> cèdre vieilli brun sombre (ref-1, ref-4)
    'bois_moyen': (0.48, 0.34, 0.23),
    'bois_clair': (0.85, 0.70, 0.52),     # cadres de shōji, kumiko
    'bois_noir': (0.13, 0.095, 0.075),    # yakisugi
    'planche': (0.55, 0.40, 0.29),
    'planche_sombre': (0.33, 0.23, 0.165),
    'gris': (0.85, 0.80, 0.74),
    'enduit': (0.93, 0.88, 0.78),         # chaux crème
    'tuile': (0.20, 0.215, 0.235),        # gris anthracite légèrement bleuté
    'tuile_faitage': (0.17, 0.18, 0.20),
    'pierre': (0.62, 0.60, 0.56),
    'indigo': (0.035, 0.06, 0.15),
    'blanc': (0.9, 0.88, 0.82),
    'metal': (1.0, 1.0, 1.0),
    'cuivre': (1.0, 1.0, 1.0),
}
