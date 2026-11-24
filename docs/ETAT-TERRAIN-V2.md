# État du chantier Terrain & relief v2 (branche `wip/terrain-v2`)

## Jalons
- **J0 fait** : `tools/terrain/qa.py` (relief + voies, sur les données exportées) et `tools/terrain-qa.cjs`
  (ruban réel contre heightAt) ; vues `qa-*` et `qa-*-nuit` dans `tools/shot.cjs` (+ `qa-lacets-air`, `qa-lacets-sol`).
- **J1 fait (avec réserves)** : `tools/terrain/roads.py` (moindre coût avec cap, épingles R ≥ 12 m, sans recoupement, profil,
  ouvrages dans `meta.ouvrages`, plateforme par projection exacte, talus 33-40°, 55° le long des murs) ;
  `src/world/roads.ts` (ruban = heightAt + 3 cm au pas de 1 m, tablier sur ponts, revêtement par voie, sentiers dessinés).
  Réserves : Route des Fjords et Sentier des Douaniers non tracés (crête de 260 m entre le Pont de la Moraine et
  Port-aux-Phoques : tracé de la bible à revoir) ; Route du Givre à 15,5 % (relâchée) et 9,9 km de long ; pistes des Ocres
  et de Jade à 13 % ; épingles parfois empilées (« pièce montée ») au-dessus des Clarines.
- **J2 fait (avec réserves)** : pyramides alpines + épaules, cirques, ravines du Fuji irrégulières, vallées de sortie des cols,
  plus d'escaliers (replats rares), pentes admises 31-33° (+5-10° au-dessus de 400-600 m), roche voulue `roche4.npy`,
  sommets restaurés sous cône borné 36-38° (marqué roche). Réserves : faces sommitales encore lisses et uniformes ;
  la roche voulue couvre 12,3 % des terres ; « colonnes » 25,6 % et « aiguilles » 347 (surtout bords de falaises côtières,
  détecteur à affiner).
- **J3** : `src/world/terrain-detail.ts` (détail 0,4 m identique CPU/GPU, anneaux proches, normales) branché.
  **Rochers** (priorité client : massif de l'Aurore et des Clarines d'abord, densité de base ailleurs) :
  - modèles : `tools/terrain/bl_rochers.py` (13 modèles : barre-a/b/c, dalle, bloc-a/b/c, gendarme, eboulis-a/b/c,
    moutonnee-a/b ; champ de distance numba → surface nets → remaillage voxel → projection exacte → LOD0/1/2 par
    décimation, UV partagées, cuisson Cycles normales + AO + courbure/variation ; `--apercu` rend une vue argile dans
    `tools/terrain/cache/rochers/`, `--textures` convertit les textures de détail CC0) ; sorties `public/assets/terrain/rochers/`
    (crédits : `CREDITS.md` du dossier). Lancer **un modèle par processus** (mémoire GPU partagée avec les autres agents).
  - contrôle des assets (blender-asset-qa, obligatoire) : `tools/terrain/qa_rochers.py` → `test-shots/terrain/rochers-qa.json`,
    planches `rochers-qa-random.png` et `rochers-qa-wire.png`.
  - placement : `tools/terrain/rochers.py` (lit seulement les données exportées du jeu : se relance tel quel sur un relief
    remodelé) → `public/assets/terrain/rochers.bin` ; zone de qualité `FOCUS` (massif de l'Aurore), `BASE` ailleurs ;
    carte de contrôle `test-shots/terrain/rochers-massif.png`.
  - jeu : `src/world/rocks.ts` (un InstancedMesh par modèle et LOD, tri par cellules de 64 m quand la caméra bouge,
    distances selon la taille, collisions boîtes/cercles > 0,9 m, matériau triplanaire + mousse/lichen/neige par instance) ;
    branché dans `world.ts` avant la végétation. Vues `qa-aurore-*` (et `-nuit`) dans `tools/shot.cjs`.
- **Réserves J1 (Givre 15,5 %, épingles des Clarines)** : essai « relâchement par tronçon + abords libres autour des
  ancres » (copie `tools/terrain/cache/roads-essai-relachement-par-troncon.py`, journal `test-shots/terrain/gen-routes-essai.log`) :
  pas d'amélioration (le Col des Aurores est perché sur une bosse à 376 m, parois de 50-59° au sud ; la voie doit ensuite
  descendre de 320 m vers la Baie Gelée en 660 m). C'est un défaut du relief du massif : à traiter avec le plan de level
  design du massif (remodelage), pas en retouchant les voies. Essai abandonné, `roads.py` inchangé.
- **J4** : QA avant/après, captures `test-shots/terrain/planche-avant-apres.jpg`, `planche-lacets.jpg`.

## Chiffres QA (avant → après)
- Voies au-dessus de la pente cible (p95) : 16/21 → 3/22 ; déblai > 6 m sans ouvrage : 11,7 km → 52 m ;
  remblai > 6 m sans ouvrage : 6,2 km → 183 m ; épingles 1 → 349 (28,7 km de lacets).
- Ruban (maillage réel) : flottant > 50 cm 9,2 % → 0,02 % ; p95 0,72 m → 0,034 m ; max 34,9 m → 6,8 m (sentier de la Brèche).
- Relief hors falaises et roche voulue : > 35° 10,9 % → 4,3 % ; > 45° 3,3 % → 0,43 % ; marches 0,9 % → 1,1 % des profils.

## Relance
Python : `L:\CLAUDE\CapyWorld\.venv-blender\Scripts\python.exe` (préfixer `PYTHONIOENCODING=utf-8`).
- tout : `gen_terrain.py` (≈ 30 min) ; formes : `gen_terrain.py formes` (3,5 min) ; reste : `gen_terrain.py erosion fin export` (14 min) ;
  voies seules : `gen_terrain.py routes export` (11 min).
- contrôle : `tools/terrain/qa.py <étiquette>` puis `node tools/terrain-qa.cjs 5180 <étiquette>` (Vite sur 5180, redémarré).
