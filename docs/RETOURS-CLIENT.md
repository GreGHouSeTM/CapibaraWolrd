# Retours du client après test (2026-11-19) et plan de traitement

## 1. Bugs (en cours, agent Conduite & accès, branche `wip/conduite`)
- Voiture : va très vite en montée, aucun ressenti de conduite → gravité sur la pente, couple moteur, adhérence, transfert de masse,
  suspension, sensation de vitesse ; reste facile pour un enfant.
- Vue POV (conducteur) manquante.
- Barrières qui bloquent des ponts et des routes dans les villages → interruptions aux croisements et têtes de pont,
  test automatique de franchissement de tous les chemins et ponts (`tools/acces-test.cjs`).

## 2. Relief : montagnes trop abruptes et trop « plates »
Constat : pentes impraticables à pied, surfaces lisses sans modelé. Cible (genre open world d'exploration) :
- pentes **praticables** sur la majorité des flancs (≤ 30-35° là où l'on marche), falaises seulement par endroits, lisibles ;
- **modelé** à toutes les échelles : érosion hydraulique et thermique (ravines, éperons, éboulis, cônes de déjection), replats,
  petites terrasses naturelles, rochers affleurants, sentiers de bêtes en lacets ;
- grimpe facilitée sur les pentes moyennes (le capybara peut gravir lentement, glisser sur les plus fortes) ;
- détail de près : textures de roche par pente, normales détaillées, rochers photoscannés posés dans les zones raides.
Chantier : **Terrain** (avec le Monde 8 km, qui prévoit déjà l'érosion simulée).

## 3. Transitions entre zones plus fluides et progressives
Aujourd'hui on passe d'une région à l'autre trop brutalement. Cible : 300 à 800 m de transition par biome, où tout change
progressivement (relief, végétation, couleurs du sol, architecture des hameaux, ambiance lumineuse et sonore, brume).
Exemples : rizières et jungle vers l'Asie, village alpin puis pinèdes enneigées vers le Pôle Nord, bocage vers Paris et Londres,
garrigue puis dunes vers le Désert. Chantier : **Monde 8 km** (Lead → Terrain → Végétation).

## 4. Villes trop « carrées »
Paris, New York, Londres, la ville du Japon : grilles trop régulières et blocs identiques. Cible : tracés organiques (rues
courbes qui suivent le relief et l'histoire, places, impasses, parcs, quais), îlots variés, hauteurs et styles mélangés, rez-de-chaussée vivants.
Chantier : **Villes** (après la tranche HD, avec les outils HD validés).

## 5. Bâtiments explorables et trompe-l'œil (« interior mapping »)
- **Interior mapping** (technique des grandes villes de jeux récents) : derrière chaque fenêtre, un shader simule une pièce en 3D
  (murs, sol, plafond, mobilier, éclairage) à partir de quelques textures, sans géométrie ; parallaxe correcte selon le point de vue,
  variantes par fenêtre, pièces allumées la nuit. Très peu coûteux : à mettre sur toutes les fenêtres des villes et sur les
  shōji ouverts des ryokans.
- **Intérieurs explorables** pour les lieux qui comptent pour l'histoire (maison de Capy, maison de Mamie, ryokan, boutiques des
  quêtes, sanctuaire) : vrais intérieurs modélisés au niveau HD, chargés à l'approche, porte sans écran de chargement.
Chantier : **Modélisation HD** (pipeline Blender) + **Rendu HD** (shader d'interior mapping), après la tranche.

## 6. Optimisation : ne rendre que ce que le joueur voit (techniques des jeux AAA)
Déjà en place : frustum culling (objets hors du champ ignorés), LOD des arbres et bâtiments, imposteurs d'arbres, instanciation.
Mesures : ≈ 25-30 ms par image en Moyenne, presque indépendant de la résolution → limite côté processeur (≈ 950 appels de dessin
au sol, ≈ 4 900 sur la vue lointaine). Plan, par gain attendu :
1. **Occlusion culling** : ne pas dessiner ce qui est caché derrière un bâtiment ou une montagne (requêtes d'occlusion WebGL2
   avec tampon de profondeur de l'image précédente, ou occulteurs simplifiés : boîtes des bâtiments, profil du relief).
2. **Regroupement en cellules + HLOD** (« hierarchical LOD ») : au-delà de ~150 m, un îlot entier de bâtiments et de décor devient un seul
   maillage simplifié et texturé, cuit dans Blender → des centaines d'appels deviennent un seul.
3. **Fusion et atlas** : décor statique fusionné par cellule et par matériau, atlas de textures (moins de changements d'état).
4. **Ombres** : cascades mises à jour à des fréquences différentes (la plus lointaine une image sur 4), seuls les objets proches projettent
   une ombre dynamique, ombres lointaines cuites dans la texture du terrain.
5. **Streaming** du monde par morceaux (indispensable pour 8 km) : chargement et déchargement autour du joueur, en arrière-plan.
6. **Imposteurs et cartes de relief lointain** : montagnes et forêts lointaines en imposteurs / maillages très simples, brume qui fond le reste.
7. Plus tard : **WebGPU** (le nouveau moteur de rendu de Three.js) qui permet le dessin indirect et le culling sur la carte graphique,
   comme les moteurs AAA récents.
Chantier : **Optimisation** (prévu au plan, étape 4 de PASSATION.md), à lancer dès la tranche HD validée, car le niveau PS5 en a besoin.
