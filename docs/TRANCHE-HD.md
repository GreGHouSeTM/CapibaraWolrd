# Tranche verticale « niveau PS5 » (décision du client, 2026-11-19)

Le client a testé le jeu : « plutôt fun, mais tout est super vide, on dirait l'alpha d'un jeu PS2 ». Décision : **on reste sur Three.js**
(jouable dans le navigateur) mais on **élève le niveau de détail des assets, de la modélisation et du rendu jusqu'à un niveau digne d'une PS5**.

Méthode : avant de tout refaire, on pousse **une petite zone** au niveau final (la tranche verticale). Elle sert d'étalon : outils,
générateurs, matériaux et réglages validés ici sont ensuite appliqués à tout Capyville puis au monde.

## Zone de la tranche : le quartier des Bains
Rotenburo (60, 70), Ryokan du Torrent (46, 44), vestiaire datsuijo (46, 73), auvent du rotenburo (53, 63), Pont du Bain, torrent entre ses
murs (x ≈ 61-82), érable rouge, Ruelle de la Vapeur, promenade des Bains. Références : `docs/references/ref-1.webp`, `ref-4.webp`,
`docs/references/monde/ref-13`, `ref-16` à `ref-18`.

Vues de contrôle (`tools/shot.cjs`, hauteurs comptées au-dessus du sol) : `hd-rotenburo`, `hd-ryokan`, `hd-torrent`, `hd-ensemble`,
`hd-detail` (gros plan à 2 m d'une façade), `hd-nuit`. Captures de référence « avant » : `test-shots/hd-avant/` (1280 × 720, Moyenne).

## Diagnostic de l'« effet PS2 » (captures avant)
1. Matières plates : enduit uni, bois sans veinage ni usure, noren en aplats, pas de salissure ni de mousse ni d'humidité.
2. Modélisation simple : arêtes vives sans chanfrein, peu de pièces (pas de chevrons, de clous, de liteaux), objets en primitives.
3. Faible densité de texels : textures 1k étirées, répétition visible ; sol d'herbe plat sans brins près de la caméra.
4. Lumière plate : pas d'occlusion cuite, peu d'ombres de contact, pas d'éclairage indirect, pas de reflets réels.
5. Effets grossiers : vapeur en disques visibles, eau du bassin en disque uni.

## Cible mesurable (ce qui doit se voir sur les captures)
| Domaine | Cible |
| --- | --- |
| Densité de texels | ≥ 512 px/m sur ce qui est à moins de 5 m de la caméra (textures 2k, détail superposé pour casser la répétition) |
| Bâtiments | modélisation fine (chanfreins sur toutes les arêtes, chevrons, liteaux, tuiles une à une, clous et ferrures, planches disjointes), **textures cuites dans Blender** (AO, courbure, masques de salissure, coulures, mousse côté nord, usure des arêtes), LOD0 jusqu'à 150-300 k triangles pour un bâtiment vedette, normales cuites depuis un modèle détaillé |
| Matières | PBR complet (couleur, normales, rugosité, AO) photoscanné Poly Haven 2k ; bois veiné patiné, enduit fissuré et taché, papier shōji translucide, tissus avec plis et bords effilochés |
| Sol | mélange par hauteur (dalles, terre, mousse, galets, herbe) sans bord net ; herbe en brins jusqu'à 25-30 m ; flaques et dalles mouillées réfléchissantes |
| Accessoires | modèles détaillés (pas de primitives), usure et mousse, bien posés (ombre de contact) |
| Lumière | soleil rasant avec ombres nettes et douces (cascades 4k), occlusion ambiante cuite + écran, ciel HDRI Poly Haven pour l'environnement, reflets (eau, dalles mouillées), rayons volumétriques, nuit avec vraies flaques de lumière |
| Effets | vapeur volumétrique douce (aucune forme de particule visible), eau du bassin laiteuse avec rides, reflets et vapeur rasante |
| Performance (GTX 1080 Ti, 1600 × 900) | Haute ≥ 40 FPS, Moyenne ≥ 50 FPS dans la tranche ; Basse reste fluide (≥ 60) même si moins détaillée |

## Organisation
- Agent **Modélisation HD** : pipeline Blender « haute définition » (générateur de bâtiment détaillé + cuisson des textures),
  appliqué d'abord au Ryokan du Torrent, au datsuijo et à l'auvent du rotenburo ; accessoires HD de la zone.
- Agent **Rendu HD** : lumière, ombres, environnement HDRI, reflets, sol par mélange de hauteur, herbe proche, vapeur et eau du bassin.
- Le chef de projet compare avant/après sur les 6 vues, mesure les FPS, intègre et montre les captures au client avant d'étendre.
