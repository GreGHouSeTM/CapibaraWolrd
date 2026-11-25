# Preuve Unreal 5.9 : la forêt au maximum du photoréalisme. Compte rendu du poste unreal-preuve (2026-11-25)

Projet : `C:\Users\greg7\Documents\CLAUDE\CapyForet-UE` (hors dépôt). État détaillé et procédure de reprise : `docs/ETAT-PREUVE-UNREAL.md`.

## Ce qui est fait
- Carte `Foret` (jour) et `Foret_Nuit`. On y trouve la même composition que la démo Three.js : même relief, même paroi et même escalier, et les mêmes graines de dispersion, portées exactement depuis `trees.ts` et `scatter.ts`.
- La forêt compte 2 541 épicéas en vraie géométrie Nanite : Poly Haven fir_tree_01, de 2,3 à 4,2 millions de triangles par arbre, aiguille par aiguille, et fir_sapling_medium pour les jeunes arbres. Le sol porte environ 7 400 objets.
- Matériaux écrits en HLSL par script :
  - sol en 5 couches 4K, mélangées par hauteur, avec anti-répétition et vrai relief Nanite (tessellation, 7 cm) ;
  - paroi moussue et escalier portés des shaders de la démo ;
  - mousse sur le dessus des rochers, feuillage deux faces, eau.
- Lumière :
  - jour : ciel couvert et brumeux, Lumen GI et réflexions en ray tracing matériel, ombres virtuelles, brouillard volumétrique ;
  - nuit : lanterne avec vraie lumière à ombres et halo dans la brume, flaque réfléchissante dans une cuvette creusée dans le relief.
- Personnage provisoire à la troisième personne, à hauteur de capybara (caméra à environ 0,85 m) :
  - en formes simples, car le mannequin d'Epic n'est pas installé sur ce poste ;
  - se joue en ZQSD/WASD et souris ;
  - peut avancer seul pour les mesures.
- Mesures en jeu autonome, captures, recherche Fab en lecture seule.

## Critères de la fiche
- [x] Mêmes vues que la démo et les références, en 1600×900 et 1920×1080, rendues en jeu autonome plein écran :
  - `unreal-jour-cadrage-demo-*.webp` : même caméra que `foret-jour` ;
  - `unreal-jour-cadrage-reference-*.webp` : cadrage de `foret-escalier` ;
  - `unreal-nuit-cadrage-demo-*.webp` : même caméra que `foret-nuit`, avec la lanterne et la flaque.
  - Défaut : `unreal-nuit-cadrage-reference-*.webp` est raté. La caméra est derrière une butte : la lanterne n'est qu'une lueur et la flaque est cachée. La vue de nuit à retenir est `nuit-cadrage-demo`.
  - La planche à 3 colonnes reste à monter avec les captures Three.js, qui ne sont pas dans cette copie du dépôt (`tools/foret/planches.py`).
- [x] Promenade avec le personnage :
  - `personnage-1-depart-1600x900.webp` et `personnage-2-sentier-1600x900.webp` ;
  - mesure « marche » (avance automatique sur le sentier) dans le tableau.
  - Défaut : ces deux captures viennent du viewport PIE et sont rendues en tuiles, avec des coutures visibles.
- [x] Mesures sur la RTX en 1600×900 et 1920×1080 : tableau ci-dessous.
  - Pas d'exécutable empaqueté : la cuisson n'a pas été tentée, faute de temps et de mémoire vive. Les mesures sont faites en `-game` non cuit, ce qui est proche d'un jeu empaqueté sans en être un.
- [ ] Mêmes mesures pour la démo Three.js le même jour : non faites. Ce n'est pas mon poste, et je ne devais pas lancer de navigateur à côté de l'éditeur.
- [ ] Notes /5 du directeur artistique : à faire par le poste DA.
- [x] Licences : tout est en CC0 (liste plus bas). Aucun asset Fab ni Megascans installé.
- [x] Coût de production mesuré (plus bas).

Critères métier :
- Sol à 3 échelles :
  - 1 m : `unreal-sol-1m-*` est réussi en détail (relief réel, mousse, feuilles), mais on voit des facettes à bords droits dans la litière, à gauche ;
  - 10 m : `unreal-sol-10m-*` est raté, la caméra est dans un jeune sapin ;
  - 100 m : `unreal-sol-100m-*` est convaincant en sous-bois, mais au loin le sol est trop uniforme, beige et nu.
- Feuillage : je n'ai pas vu de scintillement sur les captures. Les aiguilles sont de la vraie géométrie et TSR est actif. Ce n'est pas vérifié en vidéo.
- Rochers : rochers et souches sont enfoncés de 22 % de leur hauteur, et les objets tombés dans la paroi ou l'escalier sont retirés par lancer de rayons. Quelques plaques de rocher restent plates sur le sentier.
- Exposition et noirs : le jour est proche de la référence. La nuit est lisible à la lanterne, mais le sol de la clairière est trop orange et boueux.
- Journal de l'éditeur : seules erreurs, les auto-tests du moteur au démarrage (`LogAutomationTest: Condition failed`). Elles étaient déjà là avant tout contenu. Rien ne vient de la scène.

## Mesures
Conditions :
- RTX 5060 portable 8 Go, i5-13420H, 16 Go, sur secteur ;
- jeu autonome lancé éditeur fermé, plein écran, VSync coupée, scalabilité Épique ;
- Lumen en ray tracing matériel, ombres virtuelles, Nanite et tessellation, TSR ;
- 40 s de profil CSV après 8 s de chauffe.

| Scène | Résolution | Échelle d'écran | FPS moyen | p95 temps d'image (FPS) | GPU moyen | RAM jeu | VRAM dédiée |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Jour | 1920×1080 | 100 % | 34,0 | 29,4 ms (34,0) | 28,0 ms | 3,7 Go | 4,7 Go |
| Jour | 1920×1080 | 67 % + TSR | 48,4 | 21,2 ms (47,2) | 19,5 ms | 3,6 Go | 4,4 Go |
| Jour | 1600×900 | 100 % | 45,6 | 22,5 ms (44,5) | 20,9 ms | 3,7 Go | 4,4 Go |
| Marche (jour) | 1920×1080 | 100 % | 39,0 | 28,4 ms (35,3) | 23,7 ms | 3,7 Go | 4,7 Go |
| Nuit | 1920×1080 | 100 % | 30,4 | 52,6 ms (19,0) | 31,3 ms | 3,6 Go | 4,6 Go |
| Nuit | 1600×900 | 100 % | 40,5 | 42,3 ms (23,6) | 23,1 ms | 3,6 Go | 4,5 Go |

Autres chiffres :
- Nuit : des pointes régulières (163 images au-dessus de 50 ms en 1080p) font chuter le p95. La cause n'est pas analysée ; je soupçonne les ombres de la lanterne ou le brouillard volumétrique éclairé.
- Ouverture de l'éditeur sur la carte : 42,9 s à froid, 17,4 s à chaud. La carte elle-même se charge en environ 1 s, le reste arrive en streaming.
- Jeu autonome : environ 25 s jusqu'à la première image.
- Mémoire vive de l'éditeur : 5 à 7,6 Go en travail, jusqu'à 21 Go engagés pendant les imports 4K. La mémoire virtuelle de Windows a grandi jusqu'à 48 Go.
- Poids du projet : 4,2 Go, dont 2,1 Go de Content. Les sources CC0 téléchargées pèsent 1,9 Go en plus.
- Mesures écartées :
  - jeu lancé avec l'éditeur ouvert : budget de 2,5 Go de mémoire vidéo dépassé, 2 FPS ;
  - fenêtre bridée à 1536×960 par la mise à l'échelle de Windows.

## Coût de production
- Temps : environ 1 h 55 de 02:09 à 04:05, dont 7 min de blocage (le serveur MCP était sur un éditeur sans projet), 1 min de plantage et de relance, et environ 25 min de mesures et de captures.
- Ce que MCP et Python ont fait seuls :
  - tous les imports ;
  - tous les matériaux (graphes HLSL) ;
  - le placement d'environ 10 000 instances ;
  - lumières, brouillard, post-traitement, caméras ;
  - le Blueprint du personnage, son graphe écrit en DSL ;
  - collisions, cartes jour et nuit, captures, profils CSV.
- Hors de l'éditeur, des scripts Node ont fait le reste : téléchargement, décompression des glb web, relief en maillage, portage de la dispersion, analyse des CSV.
- Ce qui a demandé une main humaine : relancer le serveur MCP sur le bon éditeur (le producteur). Rien d'autre.
- Ce qu'une main humaine ferait mieux et plus vite dans l'éditeur :
  - placer les caméras en regardant (deux vues sont ratées à l'aveugle) ;
  - peindre les masques du sol et la mousse ;
  - régler le personnage et l'animation (mannequin, Animation Blueprint) ;
  - analyser la performance avec Unreal Insights.
- Incidents :
  - recréer un Blueprint du même nom fait planter l'éditeur ;
  - l'éditeur bridé en arrière-plan ne rend plus rien, il faut couper ce réglage ;
  - `unreal.Color` est en ordre BGRA ;
  - le WebP n'est pas importable.

## Assets et licences (tout CC0 1.0)
- **Poly Haven, textures 4K** :
  - forrest_ground_03, forest_leaves_02, mossy_rock, rock_01 (Rob Tuytel) ;
  - forest_ground_04 (Rob Tuytel, Rico Cilliers) ;
  - mud_forest (eye-candy.xyz) ;
  - lichen_rock (Rico Cilliers) ;
  - rock_face_03 (Dario Barresi, Rico Cilliers) ;
  - pine_bark, knotted_pine_bark (Dimitrios Savva).
- **Poly Haven, HDRI** : misty_pines (Greg Zaal), téléchargé mais pas utilisé (le ciel vient de l'atmosphère du moteur).
- **ambientCG, 4K** : Moss002, Ground037 (Lennart Demes).
- **Poly Haven, modèles** :
  - fir_tree_01, fir_sapling, fir_sapling_medium, pine_sapling_small, fern_02, nettle_plant (Rob Tuytel, Rico Cilliers) ;
  - moss_01 et nettle_plant importés mais pas placés ;
  - shrub_sorrel_01, boulder_01, dry_branches_medium_01 (Rico Cilliers) ;
  - rock_moss_set_01/02 (Kless Gyzen) ;
  - tree_stump_01/02, dead_tree_trunk, pine_roots (Rob Tuytel) ;
  - dead_tree_trunk_02, root_cluster_01 (Jenelle van Heerden, Rico Cilliers) ;
  - root_cluster_02, single_root, rock_07, rock_09 (Jenelle van Heerden) ;
  - stone_01 (Dario Barresi, Rico Cilliers) ;
  - Lantern_01 (Rajil Jose Macatangay).
- **Fait maison** (démo Three.js) : relief, masques du sol, paroi, escalier.
- **Moteur** : ciel, nuages, brouillard, formes de base (sphère du personnage provisoire).
- Détail avec les URL : `CapyForet-UE\Sources\credits.json`.

## Propositions Fab (non installées, à soumettre au client ; cherchées en lecture seule)
1. Megaplants: Norway Spruce (Quixel, gratuit, UE 5.8). C'est l'espèce exacte de la référence, en Nanite foliage. https://www.fab.com/listings/f87364c9-10a2-4834-8566-a0291c717758
2. Megaplants: Bracken Fern (Quixel, gratuit). https://www.fab.com/listings/4d60e635-7a49-4f19-818c-d018046be39f
3. Megaplants: Lingonberry (Quixel, gratuit), pour le tapis bas du sous-bois. https://www.fab.com/listings/9c7557e5-2104-424e-902c-fccd9adbeb59
4. Megaplants: Common Heather (Quixel, gratuit). https://www.fab.com/listings/5d88b60a-524c-4774-a9d7-7e1cd4510be6
5. Nordic Forest Vegetation – Wooden Sorrels (Mosaic Environments, payant), pour l'oxalis du premier plan de la référence. https://www.fab.com/listings/5b3a7b8d-0789-4f0d-aa07-330e89ce2795
6. Conifer Forest Floor Collection (Pixelgoat Store, payant), pour la litière d'aiguilles et les débris au sol. https://www.fab.com/listings/37b81594-163f-4125-b5ae-96a53bde2719
7. Nordic Conifer Biome (Pixelgoat Store, payant, 4,58/5 sur 66 avis). https://www.fab.com/listings/08cb8dfa-bfad-4a46-a358-d45dca077663
8. Mossy Forest Rock (rDPDYw) (ScansLibrary, payant), rocher moussu photoscanné. https://www.fab.com/listings/f29d49fc-e69b-40fb-b019-738df2716a45
9. Stinging Nettle v1.3 | Nanite Foliage (PineCore3D, payant). https://www.fab.com/listings/d851db4e-6898-44d9-b3a1-ac6152728617

Les 4 Megaplants sont gratuits mais demandent d'accepter la licence Fab au nom du client.

## Ce qui manque pour atteindre la référence
- **Sol** : la litière manque de débris en géométrie (aiguilles, cônes, brindilles fines, oxalis dense au premier plan). Il faut aussi casser les grandes plages beiges uniformes au loin et supprimer les facettes à bords droits vues à 1 m.
- **Mousse** : trop verte et trop saturée sur les rochers, effet « moquette ». Il manque des coussins de mousse en géométrie (moss_01 n'est pas placé).
- **Épicéas** : il n'y a qu'un modèle adulte (fir_tree_01, en 3 variantes). La référence montre des épicéas plus sombres et plus denses, avec des branches basses mortes.
- **Vent et animation** : pas de vent dans le feuillage, personnage non animé, pas de collision sur les troncs.
- **Nuit** : il manque un porteur de lanterne au loin (cadrage de la référence). Le sol de la clairière doit être herbeux, pas boueux, et il faut corriger les pointes de temps d'image.
- **Mesure** : pas d'exécutable cuit. Les mesures Three.js du même jour et la planche à 3 colonnes restent à faire.

## Mon avis sur le plafond visuel d'Unreal sur ce PC pour ce jeu
Sur la même composition et les mêmes sources CC0, Unreal donne dès le premier jet ce que Three.js ne peut pas faire :
- des épicéas en vraie géométrie (des millions de triangles par arbre, 2 541 arbres) ;
- un éclairage global et des reflets en ray tracing (la flaque reflète la lanterne et les troncs) ;
- des ombres douces partout et un vrai brouillard volumétrique éclairé par la lanterne ;
- du relief réel au sol.

Le plafond sur cette RTX 5060 portable est fixé par le GPU, pas par le processeur (thread de jeu à 4 ms) :
- au maximum, 34 FPS en 1080p natif, 48 FPS en 1080p avec TSR à 67 %, 45 FPS en 1600×900 ;
- la nuit tombe à environ 30 FPS avec un p95 à 19 FPS.

Pour un jeu jouable à 60 FPS sur ce PC, il faudra baisser un cran : TSR à 50-60 %, Lumen en mode logiciel ou réflexions limitées, moins de lumières à ombres. On garderait Nanite et la géométrie des arbres, qui ne coûtent presque rien en processeur.

Sur la qualité visuelle, le moteur n'est plus la limite : ce sont les assets (sol, mousse, végétation basse) et la direction artistique qu'il faut pousser. Avec les Megaplants gratuits et une passe humaine sur les masques, on peut viser une image très proche de la référence sur ce PC, à environ 30-45 FPS.

Les vrais coûts pour le studio sont ailleurs :
- 16 Go de mémoire vive suffisent tout juste (21 Go engagés pendant les imports, et il faut fermer l'éditeur pour mesurer le jeu) ;
- le pilotage par MCP est déjà efficace, mais fragile (plantages, réglages cachés) ;
- tout le savoir-faire Three.js du projet (gameplay, monde de 8 km, outils) serait à reporter.

## Idées
- Un mode « vue de capybara » natif : caméra basse, profondeur de champ légère. À cette hauteur, la forêt est déjà spectaculaire (`personnage-2-sentier`).
- Utiliser PCG d'Unreal pour la dispersion du monde de 8 km, au lieu de scripts Python.
- Remplacer les rochers posés par des rochers photoscannés enterrés grâce au mélange au sol de Nanite.
- Une lanterne portée par le capybara la nuit, comme petite mécanique de jeu.
- Reprendre les leçons de lumière d'Unreal dans Three.js si Three.js est gardé : exposition fixe, brouillard plus dense, mousse désaturée.
