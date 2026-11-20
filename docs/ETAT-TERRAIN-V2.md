# État du chantier Terrain & relief v2 (branche `wip/terrain-v2`)

## Jalons
- **J0 fait** (commit 5d1ef5e) : `tools/terrain/qa.py` (relief + voies, sur les données exportées) et `tools/terrain-qa.cjs`
  (ruban réel contre heightAt) ; vues `qa-*` et `qa-*-nuit` dans `tools/shot.cjs`.
- **J1 en cours** : `tools/terrain/roads.py` réécrit (moindre coût avec cap, épingles R ≥ 12 m, sans recoupement, profil,
  ouvrages dans meta.json, plateforme par projection exacte) ; `src/world/roads.ts` (ruban = heightAt + 3 cm, tablier sur
  ponts, revêtement par voie, sentiers dessinés). Reste : régler les détours (attraction du tracé), rayon < 12 m par endroits.
- **J2 en cours** : `forms.py` (pyramides alpines + épaules ≈ 29°, ravines du Fuji irrégulières, cirques, masque de roche
  voulue `roche4.npy`), `carve.exit_valleys` (vallées douces aux sorties des cols au lieu des cuvettes), `gen_terrain.py`
  (plus de `restore_peaks` ni de `benches` ; replats rares ; pentes admises 31-33°, 55° roche voulue, 70° falaises ;
  érosion réduite sur les parois ; thermique 2 m à 34° ; suppression des aiguilles).
- **J3 préparé** : `src/world/terrain-detail.ts` (détail 0,4 m identique CPU/GPU), pas encore branché.
- J4 : à faire.

## Chiffres QA avant (relief d'origine)
16 voies / 21 au-dessus de la pente cible ; 11,7 km de déblai > 6 m ; ruban flottant > 50 cm 9,2 % (max 34,9 m) ;
pentes > 35° hors falaises 10,9 %, > 45° 3,3 % ; 387 aiguilles ; colonnes 15,7 % des faces raides.

## Relance
Python : `L:\CLAUDE\CapyWorld\.venv-blender\Scripts\python.exe` (préfixer `PYTHONIOENCODING=utf-8`).
- tout : `gen_terrain.py` (≈ 25 min) ; formes seules : `gen_terrain.py formes` (3,5 min) ; reste : `gen_terrain.py erosion fin export` ;
  voies seules : `gen_terrain.py routes export`.
- contrôle : `tools/terrain/qa.py <étiquette>` puis `node tools/terrain-qa.cjs 5180 <étiquette>` (Vite sur 5180, redémarré).
