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

## 7. Conseils techniques transmis par le client (proposition d'une autre IA, 2026-11-19) et décision du chef de projet
| Proposition | Où on en est | Décision |
| --- | --- | --- |
| Terrain en clipmaps ou quadtree LOD sur GPU, heightmap lue dans le vertex shader | morceaux CPU de 200 m à 2 niveaux + tuiles détaillées au village | **adopté pour le terrain 8 km** (clipmaps GPU, heightmap 16 bits streamée par tuiles) |
| Triplanar mapping + splatting selon pente et altitude | splat par pente sans triplanar : textures étirées sur les pentes fortes | **adopté** (roche triplanar, mélange par hauteur des matières PBR) |
| Heightmap avec érosion générée dans Gaea ou Blender | relief procédural calculé en JS, sans érosion | **adopté sur le principe**, avec notre propre simulation d'érosion hors ligne (pas de logiciel à installer, relançable, paramétrée) |
| Végétation massive en InstancedMesh, vent, frustum culling | déjà en place (11 347 arbres, herbe, susuki) | gardé ; ajouter culling par cellule et imposteurs plus loin |
| Ciel procédural, brouillard d'altitude, ombres en cascade, ACES, SSAO, bloom | déjà en place ; ombres en cascade faites sur `wip/hd-rendu` | gardé |
| Assets Poly Haven ou Fab/Megascans | Poly Haven (CC0) utilisé | Poly Haven en priorité ; Fab seulement après vérification de la licence de chaque asset (dépôt public) |
| WebGPU, React Three Fiber | WebGL2, Three.js direct | WebGPU plus tard (phase optimisation) ; pas de React Three Fiber (aucun gain pour nous) |
Ce que la proposition ne couvre pas et qui reste nécessaire : streaming des objets, occlusion culling, HLOD, budget d'appels de dessin,
et surtout la qualité des assets et de la lumière (voir `docs/TRANCHE-HD.md`).

## 8. Menu (retour du 2026-11-19)
« Nouvelle partie » donne l'impression de relancer tout le chargement. À vérifier : ne pas reconstruire le monde, seulement remettre
la sauvegarde et le joueur à zéro ; sinon un écran de transition court. Petite tâche, à glisser dans la phase gameplay (ou avant si rapide).

## 9. Ajouts souhaités par le client (2026-11-19, « pour le moment venu »)
| Souhait | Phase prévue |
| --- | --- |
| **Lens flare** de certaines lumières : phares et feux de voitures, lanternes, soleil | 3 (graphismes) |
| **Panneaux de signalisation** et **marquage au sol** des routes | 1 (routes du monde) pour le tracé, 3 pour le détail |
| **Simulation de conduite** : boîte manuelle (mode au choix), **compteur de vitesse** en vue 3e personne, **mode 4x4**, franchissement d'obstacles, **dégâts de collision** (adaptés à l'âge : bosses, pare-chocs, pas de violence) | 2 (gameplay, avec la physique et la vue POV de `wip/conduite`) |
| **Météo** : pluie, flaques, éclaboussures, boue, brouillard volumétrique, ombres des nuages, vent qui fait bouger arbres et herbe selon sa force | 3 (le vent des arbres et de l'herbe existe déjà, à piloter par la météo) |
| **PNJ bipèdes** (debout, comme le héros) | 2 (avec le rig du capybara) |
| **Mode survie** (option) : barres de faim, de soif et de vie, inventaire, magasins, cueillette | 2 (gameplay) |
| **Traces de pas** dans le sable, la neige et la boue (et traces de roues) | 3 (effets) |

## 10. Test du terrain 8 km (retour du 2026-11-20)
Constat du client : « beaucoup de bugs de terrain, des pentes trop pentues, des fossés énormes, des routes sans logique ou pas à la bonne
hauteur ; les montagnes sont encore beaucoup trop lisses, je veux me balader en montagne, pas sur une colline toute lisse ». Direction
artistique jugée encore « Switch » et non « next gen » ; trois rendus de référence fournis (forêt et escalier moussu, forêt de nuit à la
lanterne, village en bois), gardés hors dépôt (`docs/references/prive/nextgen/`, droits), avec ses captures de bugs (`prive/terrain-bugs/`).
Diagnostic du chef de projet : voies quasi droites avec déblais et remblais jusqu'à 15 m (tranchées) ; ruban de route posé au-dessus du sol
quand le profil passe plus haut (routes et lignes flottantes) ; replats réguliers qui font des marches sur les versants ; aucun détail sous 2 m
ni roche en relief. Chantier : **Terrain v2** (`wip/terrain-v2`) : contrôle automatique, routes de moindre coût en lacets à la hauteur du sol,
relief alpin sans marches, détail de près et affleurements rocheux photoscannés.

## 11. De vraies montagnes (retour du 2026-11-21)
« Je veux des montagnes réalistes avec une vraie ascension, un vrai sentiment de hauteur, de toit du monde, de froid, de danger de tomber,
d'exploration, forêt, lac, roches escarpées, grottes, faune, flore, qu'on s'y perde. » Le client trouve aussi qu'on fait du surplace.
Constat : la vitesse du joueur ignore la pente (`player.ts` : 4,2 / 8,5 m/s partout, une paroi à 70° se gravit à > 20 m/s de dénivelé) ;
sommet à 950 m, versants lisses, aucun repère d'échelle. Décision du chef de projet : **concevoir d'abord, puis construire un seul massif
au niveau maximum** (tranche verticale : Pic de l'Aurore et Clarines). Agent Montagne (`wip/montagne`) : dossier `docs/MONTAGNE-AURORE.md`
(échelle, étages, itinéraires, grottes, lacs, faune, froid, mécaniques, questions au client) puis déplacement en montagne (vitesse selon
la pente, endurance, glissade, escalade, chute douce, froid). Terrain v2 recentré : rochers validés d'abord sur ce massif.

## 12. Liens transmis par le client (2026-11-22) : analyse et décisions
| Lien | Ce que c'est | Décision |
| --- | --- | --- |
| patch.gg / `patch-gg/cloud-blender-skills` (MIT) | 29 « skills » pour agents qui pilotent Blender 5.2-5.3 : sculpture, retopologie et UV, PBR, texturage (usure, salissure), cuisson haute → basse, Geometry Nodes, rig, poil et fourrure, optimisation jeu, export web (GLB, meshopt, WebP), éclairage, météo, et une **porte de contrôle qualité** (`blender-asset-qa` : z-fighting, pièces flottantes, normales, UV, planches multi-angles) | **Adopté** : 28 skills installés pour tous les agents (`~/.claude/skills`), en **local uniquement** (le skill `blender-cloud` est écarté : il enverrait nos fichiers sur leurs serveurs, payant). `blender-asset-qa` devient obligatoire avant de livrer un asset. Copie du dépôt : `L:\CLAUDE\outils-externes\cloud-blender-skills`. |
| itch.io « Flesh Dynamics UE » | plugin payant de chair molle pour Unreal 5.6-5.8 | **Inutilisable** (Unreal seulement). Idée retenue : un **ventre rond qui rebondit** sur le capybara (ressorts simples sur deux ou trois os, en Three.js) pour le futur modèle HD. |
| Reddit r/TopologyAI (photos → modèles) | non lu : Reddit est bloqué pour nos outils | à recoller en texte si le client veut l'analyse |
| X @MrTacticalX : voiture « style GTA 6 » faite par Claude dans Blender | modèle très détaillé, entièrement fait main par script ; **12 h 40 et 365 $** de calcul pour un seul véhicule | Confirme que le niveau est atteignable par nos agents, à condition d'y passer le temps : on réserve des sessions longues et dédiées aux assets emblématiques (capybara HD, véhicules) avec boucle rendu → critique → correction, plutôt que des centaines d'assets moyens. |
| X @chetanankola : désert « Dune » en Three.js | dunes, rides de sable, traces de pneus, tempête de poussière, dans le navigateur | Preuve qu'un désert de très bon niveau est faisable en Three.js. Inspiration pour la région du Désert (phase 3) : traces de roues et de pas déformant le sable (souhait déjà noté §9), brume de sable, rides. |
