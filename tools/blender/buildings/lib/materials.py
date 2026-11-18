"""Table des matières partagées par tous les bâtiments.

Les noms sont stables : l'intégrateur peut fusionner les maillages de plusieurs bâtiments par matière (même nom = même
matériau Three.js). Les textures sont référencées en externe (pas copiées dans chaque .glb) :
  - `tex/...`       -> public/assets/models/buildings/tex/ (textures propres aux bâtiments, voir make_textures.py)
  - `../../tex/...` -> public/assets/tex/ (cartes de normales communes du projet)
La teinte vient des couleurs de sommets (COLOR_0, linéaires) multipliées par la texture.
"""

MATERIALS = {
    # bois de structure, bois clair des shōji, laque : texture neutre, teinte par sommet
    'wood': dict(diff='tex/wood_diff.jpg', nor='../../tex/roughwood_nor.jpg', uv=1.0, rough=0.82, nscale=0.8),
    'planks': dict(diff='tex/planks_diff.jpg', nor='../../tex/planks_nor.jpg', rough=0.85, nscale=0.8),
    'plaster': dict(diff='tex/plaster_diff.jpg', nor='../../tex/plaster_nor.jpg', rough=0.95, nscale=0.5),
    'stone': dict(diff='tex/stone_diff.jpg', nor='tex/stone_nor.jpg', rough=0.92, nscale=1.0),
    'kawara': dict(diff='tex/kawara_diff.jpg', nor='tex/kawara_nor.jpg', rough=0.55, nscale=1.0),
    'thatch': dict(diff='tex/thatch_diff.jpg', nor='tex/thatch_nor.jpg', rough=0.95, nscale=1.0),
    'copper': dict(diff='tex/copper_diff.jpg', nor='tex/copper_nor.jpg', rough=0.55, metal=0.35, nscale=0.6),
    'namako': dict(diff='tex/namako_diff.jpg', nor='tex/namako_nor.jpg', rough=0.6, nscale=0.8),
    'lacquer': dict(diff='tex/wood_diff.jpg', nor='../../tex/roughwood_nor.jpg', rough=0.42, nscale=0.25),
    # papier des shōji : émissif (lumière intérieure la nuit) ; l'intégrateur règle emissiveIntensity jour/nuit
    'paper_shoji': dict(diff='tex/paper_diff.jpg', emis='tex/paper_diff.jpg', emis_factor=(1.0, 0.62, 0.30), rough=0.9,
                        extras={'night': True, 'emissiveBoost': 1.0}),
    # fond sombre des boutiques ouvertes et des portes entrouvertes
    'interior': dict(color=(0.035, 0.026, 0.02), rough=1.0),
    # eau immobile (vasque du temizuya) ; l'équipe Eau peut la remplacer par son matériau
    'water': dict(color=(0.03, 0.07, 0.07), rough=0.04),
    # fer, bronze (chaînes de pluie, flèche de la pagode, clous)
    'metal': dict(color=(0.30, 0.24, 0.17), rough=0.45, metal=0.85),
}

# Couleurs cibles (sRGB) de la charte (docs/QUALITE-CAPYVILLE.md)
C = {
    'wood_dark': '#463426',
    'wood_mid': '#56412f',
    'wood_old': '#604b38',
    'wood_grey': '#6b6058',     # bois très patiné, gris
    'wood_light': '#9c8668',    # kumiko et cadres des shōji
    'wood_black': '#2a211c',    # yakisugi (bois brûlé)
    'plaster_cream': '#f1e4c6',
    'plaster_white': '#f4f0e6',
    'plaster_clay': '#c9a77c',  # mur d'argile des minka
    'plaster_ochre': '#d9bf92',
    'lacquer_red': '#b8342a',
    'lacquer_black': '#1c1a19',
    'ochre': '#c8902e',
    'bronze': '#6b5a3a',
    'wood_raw': '#a58a68',     # bois brut (torii shinmei, hinoki)
}
