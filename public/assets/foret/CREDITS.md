# Crédits des assets de la zone « forêt » (preuve next-gen, `?demo=foret`)

Tout est sous licence **CC0 1.0** (domaine public) ou fait maison pour ce projet. Sources téléchargées par `tools/foret/fetch.py`.

## Fait maison (Blender par scripts, dossier `tools/foret/`)
- Relief, sentier, escalier (placement), masques du sol : `layout.py`, `terrain.py`.
- Paroi de granite (maillage, normales et AO cuites, masques mousse/lichen/coulures) : `bl_wall.py` (détail : déplacements photoscannés mossy_rock et lichen_rock ci-dessous).
- Escalier de pierre, bordure, borne : `bl_stairs.py`.
- Rameaux d’épicéa (atlas) : `bl_twig.py` ; épicéas, LOD et imposteurs : `bl_spruce.py`.

## Poly Haven et ambientCG (CC0)

| Asset | Type | Auteurs | Usage | Lien |
| --- | --- | --- | --- | --- |
| Ground037 | matériau ambientCG | ambientCG (Lennart Demes) | sol forestier humide et moussu | https://ambientcg.com/view?id=Ground037 |
| Lantern_01 | modèle Poly Haven | Rajil Jose Macatangay | voir CREDITS.md | https://polyhaven.com/a/Lantern_01 |
| Moss002 | matériau ambientCG | ambientCG (Lennart Demes) | mousse courte et dense (paroi, marches, sol) | https://ambientcg.com/view?id=Moss002 |
| boulder_01 | modèle Poly Haven | Rico Cilliers | voir CREDITS.md | https://polyhaven.com/a/boulder_01 |
| dead_tree_trunk | modèle Poly Haven | Rob Tuytel | voir CREDITS.md | https://polyhaven.com/a/dead_tree_trunk |
| dead_tree_trunk_02 | modèle Poly Haven | Jenelle van Heerden, Rico Cilliers | voir CREDITS.md | https://polyhaven.com/a/dead_tree_trunk_02 |
| dry_branches_medium_01 | modèle Poly Haven | Rico Cilliers | voir CREDITS.md | https://polyhaven.com/a/dry_branches_medium_01 |
| fern_02 | modèle Poly Haven | Rico Cilliers, Rob Tuytel | voir CREDITS.md | https://polyhaven.com/a/fern_02 |
| fir_sapling | modèle Poly Haven | Rico Cilliers, Rob Tuytel | voir CREDITS.md | https://polyhaven.com/a/fir_sapling |
| forest_ground_04 | texture Poly Haven | Rico Cilliers, Rob Tuytel | sentier : terre tassée et cailloux | https://polyhaven.com/a/forest_ground_04 |
| forrest_ground_03 | texture Poly Haven | Rob Tuytel | sol : litière d’aiguilles d’épicéa | https://polyhaven.com/a/forrest_ground_03 |
| knotted_pine_bark | texture Poly Haven | Dimitrios Savva | écorce des épicéas | https://polyhaven.com/a/knotted_pine_bark |
| lichen_rock | texture Poly Haven | Rico Cilliers | paroi et blocs : roche à lichens | https://polyhaven.com/a/lichen_rock |
| misty_pines | HDRI Poly Haven | Greg Zaal | éclairage du ciel (IBL) : pinède brumeuse, ciel couvert | https://polyhaven.com/a/misty_pines |
| mossy_rock | texture Poly Haven | Rob Tuytel | paroi : granite moussu (base) | https://polyhaven.com/a/mossy_rock |
| mud_forest | texture Poly Haven | eye-candy.xyz | sol humide, bord de flaque | https://polyhaven.com/a/mud_forest |
| pine_roots | modèle Poly Haven | Rob Tuytel | voir CREDITS.md | https://polyhaven.com/a/pine_roots |
| pine_sapling_small | modèle Poly Haven | Rico Cilliers, Rob Tuytel | voir CREDITS.md | https://polyhaven.com/a/pine_sapling_small |
| rock_01 | texture Poly Haven | Rob Tuytel | escalier : dessus des marches, pierre usée | https://polyhaven.com/a/rock_01 |
| rock_07 | modèle Poly Haven | Jenelle van Heerden | voir CREDITS.md | https://polyhaven.com/a/rock_07 |
| rock_09 | modèle Poly Haven | Jenelle van Heerden | voir CREDITS.md | https://polyhaven.com/a/rock_09 |
| rock_face_03 | texture Poly Haven | Dario Barresi, Rico Cilliers | escalier : flancs des dalles, pierre brute | https://polyhaven.com/a/rock_face_03 |
| rock_moss_set_01 | modèle Poly Haven | Kless Gyzen | voir CREDITS.md | https://polyhaven.com/a/rock_moss_set_01 |
| rock_moss_set_02 | modèle Poly Haven | Kless Gyzen | voir CREDITS.md | https://polyhaven.com/a/rock_moss_set_02 |
| root_cluster_01 | modèle Poly Haven | Jenelle van Heerden, Rico Cilliers | voir CREDITS.md | https://polyhaven.com/a/root_cluster_01 |
| root_cluster_02 | modèle Poly Haven | Jenelle van Heerden | voir CREDITS.md | https://polyhaven.com/a/root_cluster_02 |
| shrub_sorrel_01 | modèle Poly Haven | Rico Cilliers | voir CREDITS.md | https://polyhaven.com/a/shrub_sorrel_01 |
| single_root | modèle Poly Haven | Jenelle van Heerden | voir CREDITS.md | https://polyhaven.com/a/single_root |
| stone_01 | modèle Poly Haven | Dario Barresi, Rico Cilliers | voir CREDITS.md | https://polyhaven.com/a/stone_01 |
| tree_stump_01 | modèle Poly Haven | Rob Tuytel | voir CREDITS.md | https://polyhaven.com/a/tree_stump_01 |
| tree_stump_02 | modèle Poly Haven | Rob Tuytel | voir CREDITS.md | https://polyhaven.com/a/tree_stump_02 |

Modèles Poly Haven : textures 2K (1K pour les petits), LOD et compression meshopt (`tools/foret/models.py`, gltfpack).
Textures : retouchées (palette, anti-taches, ARH = occlusion/rugosité/hauteur) par `tools/foret/textures.py`.
