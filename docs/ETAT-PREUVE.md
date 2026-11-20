# État de la preuve next-gen « forêt » (branche wip/preuve-foret)

Zone jouable : `?demo=foret&q=max` (application autonome `src/demo/foret/`, assets `public/assets/foret/`, 97 Mo,
chargés seulement avec `?demo=foret`). Commandes : ZQSD/WASD, souris, Maj, Espace, **N jour/nuit**, Échap (réglages).

## Jalons : J1 à J5 faits
- J1 relief 0,25 m, collisions, niveau `max` (quality.ts, sauvegarde, sélecteur), vues `foret-*`, `tools/foret-test.cjs`.
- J2 paroi, escalier, sol 5 couches + POM, modèles Poly Haven, débris et sous-bois (`scatter.ts`).
- J3 épicéas Blender (6 variantes, 3 LOD, imposteurs 8 vues), rameaux aiguille par aiguille, vent, translucidité.
- J4 IBL (misty_pines), occlusion du ciel par la canopée, PCSS, N8AO, brume volumétrique (carte d'ombre du soleil),
  TAA, AgX ; nuit : lanterne (ombres cube), halo dans la brume, flaque réfléchissante.
- J5 mesures, planches (`test-shots/preuve-foret/planche-*.jpg`, `tools/foret/planches.py`), tests verts.

## Relancer (Python du venv Blender : `L:\CLAUDE\CapyWorld\.venv-blender\Scripts\python.exe -I`)
Ordre : `fetch.py` (1 Go dans `.cache/`) → `terrain.py` → `textures.py` → `bl_wall.py` → `bl_stairs.py` → `models.py`
→ `bl_twig.py` → `textures.py cartes` → `bl_spruce.py` → `textures.py cartes`. `--fast` = version d'essai.
Captures : `node tools/shot.cjs 5181 <dossier> max foret-jour,foret-nuit` ; test : `node tools/foret-test.cjs 5181 max`.

## Pièges
- gltfpack : `-kv` (sinon UV supprimées sans matière) et `-vtf` (sinon UV quantifiées sans transformation).
- Géométries glTF quantifiées : les convertir en flottants avant `applyMatrix4` (`bakeGeometry`), sinon débordement.
- Boucle de rétroaction GL 1282 : une passe qui lit la profondeur ne doit pas écrire dans le tampon du composeur qui la
  porte → brume + TAA dans des cibles privées (`taa.ts`), copie finale sans lecture de profondeur.
- Reflet de la flaque : sans les arbres (+76 ms par image : le reflet voit tout le houppier).
- PIL lit mal les PNG RVBA 16 bits ; canevas 2D = alpha prémultiplié (masques en RVB) ; console Windows cp1252.
- GLSL : pas de `dFdx` dans le vertex shader, pas de ternaire sur les structures.
- `heightmap.ts` : seul crochet additif `setGroundOverride`.
