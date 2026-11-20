# État de la preuve next-gen « forêt » (branche wip/preuve-foret)

Zone jouable : `?demo=foret&q=max` (application autonome `src/demo/foret/`, assets `public/assets/foret/`).

## Jalons
- J1 fait : relief 0,25 m, collisions (marches, pied de paroi, limites), niveau `max`, vues `foret-*`, `tools/foret-test.cjs`.
- J2 en cours : paroi (fait), escalier (fait, à affiner : blocs de bordure trop réguliers), sol 5 couches + POM (fait),
  modèles Poly Haven convertis (`models.json`, fait) ; reste : placement (scatter) des modèles et débris.
- J3 en cours : cartes de rameaux (`bl_twig.py`, fait), épicéas 6 variantes × 3 LOD + imposteurs (`bl_spruce.py`, fait en
  `--fast`) ; reste : affichage dans le jeu (instances, vent, translucidité), sous-bois.
- J4, J5 : à faire (lumière PCSS, brume volumétrique, TAA, nuit/lanterne, flaque ; mesures, planche, verdict).

## Relancer (Python du venv Blender : `L:\CLAUDE\CapyWorld\.venv-blender\Scripts\python.exe -I`)
Ordre : `tools/foret/fetch.py` (téléchargements CC0, 1 Go dans `.cache/`) → `terrain.py` → `textures.py` → `bl_wall.py`
→ `bl_stairs.py` → `models.py` → `bl_twig.py` → `bl_spruce.py`. `--fast` = version rapide pour essais.
Captures : `node tools/shot.cjs 5181 <dossier> max foret-jour,foret-nuit` ; test : `node tools/foret-test.cjs 5181 high`.

## Pièges
- gltfpack : `-kv` (sinon UV supprimées sans matière) et `-vtf` (sinon UV quantifiées sans transformation).
- PIL lit mal les PNG RVBA 16 bits : rendus Blender en 8 bits.
- Canevas 2D : alpha prémultiplié → masques en RVB seulement.
- GLSL : pas de `dFdx` dans le vertex shader (bibliothèque séparée `GLSL_FRAG`), pas de ternaire sur les structures.
- Console Windows cp1252 : `common.py` reconfigure stdout en UTF-8.
- `heightmap.ts` : seul crochet additif `setGroundOverride` (fichier de l'agent terrain).
