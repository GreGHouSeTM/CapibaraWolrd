# Revue du directeur artistique : preuve Unreal, Three.js face aux références (2026-11-25)

Base de jugement : planche `docs/references/prive/planche-preuve-unreal.jpg` (hors dépôt) et captures pleine taille.
- Three.js, qualité max : `threejs/foret-jour.webp` (cadrage démo), `threejs/foret-escalier.webp` (cadrage référence), `threejs/foret-nuit.webp`.
- Unreal 5.9, Épique, Lumen RT (fichiers `*-1600x900.webp`) : `unreal-jour-cadrage-demo`, `unreal-jour-cadrage-reference`, `unreal-nuit-cadrage-demo`, plus `unreal-sol-1m`, `unreal-sol-100m` et `personnage-2-sentier` pour le détail à hauteur de capybara.
- La vue `unreal-nuit-cadrage-reference` est ratée (caméra derrière une butte, voir le compte rendu) : elle n'est pas notée.
- Échelle : 5 = au niveau des références ; 3 = crédible mais lisiblement en dessous ; 1 = hors sujet.

## 1. Notes /5

| Critère | Three.js jour | Three.js nuit | Unreal jour | Unreal nuit |
| --- | --- | --- | --- | --- |
| **Forme et silhouette** | **2,5**. Sapins coniques lisibles, paroi en gros volumes et escalier bien posés. Mais troncs à bandes claires qui cassent la silhouette, sol fait de plaques plates posées dessus, aucune strate de sous-bois. | **2**. La lanterne est sur un monticule informe. La flaque est une forme noire plate. Au-delà de la clairière, plus aucune silhouette d'arbre. | **3**. Épicéas en vraie géométrie, paroi en relief, racines, rochers enterrés. Mais houppiers clairsemés en plumeau (ils lisent « mélèze »), troncs fins et réguliers (effet plantation), facettes à bords droits dans le relief (`sol-1m`, à gauche). | **2,5**. Cuvette de la flaque crédible, troncs en silhouette à gauche. Mais environ 60 % de l'image est un noir sans forme. |
| **Valeurs (clair/sombre)** | **2**. Voile laiteux sur toute l'image : tout se tient dans les moyens-clairs. Pas de premier plan sombre pour cadrer. Le sol beige est la plage la plus claire après le ciel et vole l'œil à l'escalier. | **2,5**. Le point focal central se lit. Mais une plage beige claire derrière la lanterne le concurrence, et le fond est bouché sans séparation des plans. | **3**. L'occlusion de contact et le sentier sombre guident vers l'escalier. Mais toute la moitié haute (houppiers et brume) est claire et uniforme, et il n'y a pas de masse sombre au premier plan. | **2**. Noirs écrasés : rien ne se lit hors du halo. La référence garde le fond lisible dans les gris très bas. |
| **Couleur** | **2,5**. Désaturée comme la référence, mais tirée vers le gris-beige chaud au lieu du vert froid. Taches de mousse vert vif isolées. | **2**. Dominante rouge-orangé sur tout le sol, aucune contre-note froide. | **2,5**. Houppiers vert olive-jaune et mousse vert pelouse saturée (effet « moquette »). Sol beige orangé. La gamme est plus chaude et plus jaune que la référence. | **2,5**. La teinte de la lanterne est juste. Mais le sol est orange boueux et il n'y a pas d'ambiance froide pour faire contraste. |
| **Détail à hauteur de capybara** | **2**. Feuilles et débris en cartes plates qui flottent, brindilles isolées sur un sol nu, fougères peu nombreuses. Seules les textures de la paroi et de l'escalier tiennent. | **1,5**. Sol en bruit flou, stries horizontales dans le fond (artefact), plantes rares. | **3,5**. Aiguilles en géométrie, racines, litière en relief, mousse sur le dessus des rochers. Il manque le tapis bas (oxalis, fougères denses). À 1 m, feuilles en cartes géantes et mousse tuilée. | **2,5**. Sol mouillé et reflets riches au premier plan. Sous-bois invisible, clairière nue et boueuse. |
| **Lumière et atmosphère** | **2**. Couvert plat, sans lumière clé ni tache de soleil sur le sentier. La brume donne de la profondeur mais délave tout. Peu d'occlusion : les rochers flottent. | **2**. La décroissance de la lanterne est là, avec un reflet en traînée. Mais pas de halo dans la brume, pas de lumière d'ambiance, et un éclat de type flare. | **3,5**. Lumière globale et occlusion crédibles, brouillard volumétrique bien étagé en profondeur. Il manque une percée de lumière sur le sentier : l'ensemble reste un peu plat. | **3,5**. Le bon type de lumière : lanterne à ombres, halo dans la brume, reflet ray tracing net dans la flaque. Il manque l'ambiance de ciel ou de lune, et le dosage. |
| **Moyenne** | **2,2** | **2,0** | **3,1** | **2,6** |

## 2. Les 3 défauts les plus visibles par moteur

### Three.js
1. **Image voilée et lumière plate (jour)** : pas de premier plan sombre, pas de tache de lumière, peu d'occlusion.
   - **Surtout corrigeable** (direction artistique et réglages) : exposition, densité et teinte du brouillard, masses sombres au premier plan, lumière clé qui perce sur le sentier.
   - **Part moteur** : sans éclairage global ni ombre douce du ciel, l'occlusion reste approximative (SSAO). Le contact au sol ne vaudra jamais celui d'Unreal.
2. **Sol et sous-bois en plaques plates** : cartes de feuilles posées, sol nu, aucun tapis végétal.
   - **Corrigeable par les assets** : vraies plantes basses, litière modelée, mélange de couches au sol.
   - **Plafond technique partiel** : la densité de géométrie est bornée par le budget WebGL. La démo affiche déjà 24 FPS (11 FPS sur le cadrage escalier) en qualité max.
3. **Nuit sans atmosphère** : flaque en trou noir, dominante orange, pas de halo, fond illisible.
   - **Corrigeable** : teinte du sol, lumière d'ambiance froide, halo en sprite ou en brouillard.
   - **Plafond technique** : des reflets justes dans l'eau et un brouillard éclairé par une lumière à ombres ne s'obtiennent qu'en approximations coûteuses.

### Unreal
1. **Couleur hors gamme** : houppiers olive-jaune, mousse en moquette vert saturé, sol beige orangé.
   - **Corrigeable** (assets et direction artistique) : un épicéa plus sombre et plus dense (Megaplants Norway Spruce), une mousse désaturée, un étalonnage froid.
2. **Forêt en plantation et sous-bois vide** : troncs réguliers et fins, sol beige nu au loin (`sol-100m`), pas de tapis bas, facettes dans le relief.
   - **Corrigeable** (assets et dispersion) : végétation basse en Nanite, PCG, masques peints à la main, relief plus fin.
3. **Nuit trop noire et boueuse** : rien n'est lisible hors du halo, et le sol de la clairière est orange.
   - **Corrigeable** (direction artistique) : lumière d'ambiance froide, exposition, sol herbeux.
   - **Coût moteur réel** : le p95 de la nuit tombe à 19 FPS en 1080p.

## 3. Avis du DA
Unreal a nettement plus de marge. Après environ 2 h de travail, sa lumière et son détail dépassent déjà la démo Three.js. Ses trois défauts relèvent des assets et de la direction artistique, alors que ceux de Three.js butent en partie sur le plafond du moteur (éclairage global, ombres douces, densité de géométrie, reflets).
Le coût visible : 34 à 45 FPS en Épique sur la RTX 5060 portable, et une nuit à 19 FPS en p95. Viser 60 FPS demandera de dégrader Lumen et les reflets, donc de perdre une partie de ce qui fait la différence.
Atteindre la référence ne se fera dans aucun des deux moteurs sans une vraie passe sur les assets (épicéas, végétation basse) et sur les couleurs.
