# État de l'Alpha U1 « Le monde » (poste unreal-monde)

Fiche : `docs/taches/U1-le-monde.md`. Projet : `C:\Users\greg7\Documents\CLAUDE\CapyWorld-UE\CapyWorld.uproject` (UE 5.9, hors dépôt).
Scripts : `unreal/` du dépôt. Preuves : `docs/u1/`. Lancer un script dans l'éditeur : `node unreal\outils\ue.cjs py unreal\py\<script>.py [args]`
(ajouter `C:\Program Files\nodejs` au PATH).

Lancer l'éditeur (sans surveillance : pas de dialogue « Restore Packages » ; MCP, captures et Python vérifiés dans ce mode le 2026-11-26) :
`"C:\Users\greg7\Epic Games\UE_5.9\Engine\Binaries\Win64\UnrealEditor.exe" "C:\Users\greg7\Documents\CLAUDE\CapyWorld-UE\CapyWorld.uproject" -ModelContextProtocolStartServer -unattended -nosplash`
puis TOUJOURS `charger_tout.py` (charge les 64 parcelles World Partition du Landscape ; sans lui, les lancers de rayon ne touchent rien).

Reprise (2026-11-26 21:45) : DÉMO JOUABLE LIVRÉE au producteur (première passe). Éditeur fermé, tout sauvegardé.
`C:\Users\greg7\Documents\CLAUDE\CapyWorld-UE\Jouer-U1.bat` testé (jeu non cuit, plein écran, 61 FPS à Capyville, se ferme seul avec `-duree=10`).
Seconde passe à faire, dans l'ordre : nuit lisible en jeu (bascule touche N : le graphe `Ambiance` de l'ancienne version de 09 est à
réécrire avec les noms de nœuds vérifiés par Schema), nom de région par le HUD au lieu de PrintString (Shipping), coutures de l'eau des
rivières, empaquetage Windows, mesures jour/nuit (campagne à réécrire : `campagne.ps1`/`captures.ps1` de la preuve retirés), captures des
8 régions en WebP, parcours sans chute, compte rendu final.

## Fait
- Export du relief (`unreal/relief/export_relief.mjs`, exécute le vrai `heightmap.ts` du jeu dans Node, avec esbuild) : `hauteur.r16` 4065²,
  masques 4096², `eau.glb`, 20 points de contrôle, 8 destinations hors de l'eau. Contrôle avant import (`verifier_export.mjs`) : écart max 0,131 m.
- Projet (`unreal/creer_projet.ps1`), carte World Partition `/Game/Monde/Cartes/Monde`.
- Landscape 4065 × 4065 sommets (pas de 2 m, 16 × 16 composants, 64 parcelles) importé en 44 s. 20 points mesurés par lancer de rayon
  dans l'éditeur : écart max **0,128 m** (`docs/u1/points-controle.md`) ; revérifié identique après le plantage.
- Matériaux HLSL : M_Sol_Ile + MI_Sol_Ile (8 couches CC0, masques du jeu, roche triplanaire, étage alpin, fondu « très loin » sans motif répété),
  M_Eau (Single Layer Water), M_Glace, M_Repere. Eau (lacs, 18 rivières, mer), 8 bornes de région, jour (exposition fixe), caméras Vue_*.
- Capybara provisoire (formes simples, signalé à l'écran), caméra basse, ZQSD/WASD + souris, Maj pour courir, Espace pour sauter ;
  touches 1 à 8 = « Aller à » (arrivées posées par lancer de rayon), nom de la région affiché 4 s, Tab = liste ; filet anti-chute.
- `Jouer-U1.bat` (copie versionnée : `unreal/Jouer-U1.bat`).

## Ordre de reconstruction (de zéro)
1. `powershell -File unreal\creer_projet.ps1`
2. `node unreal\relief\export_relief.mjs` puis `node unreal\relief\verifier_export.mjs`
3. Lancer l'éditeur (commande ci-dessus), puis dans l'ordre : `01_carte.py`, `02_landscape.py`, `sauver.py`, `charger_tout.py`,
   `03_controle_points.py`, `04_textures.py`, `05_materiaux.py`, `06_scene.py`, `07_lumiere.py jour`, `08_cameras.py`, `sauver.py`,
   `09_personnage.py`, `sauver.py`, `10_graphes.py` (vérifier d'abord avec `10_graphes.py apercu`), `quitter.py`.
4. Copier `unreal\Jouer-U1.bat` dans `CapyWorld-UE\`.

## Pièges rencontrés
- Éditeur réduit dans la barre des tâches : il ne rend plus rien (captures bloquées). `unreal\outils\fenetre_editeur.ps1` le restaure.
- Masques en BC7 : jamais reconstruits → le matériau lisait du blanc. Compression par défaut (BC3).
- Single Layer Water : créer le nœud de sortie SLW avant de passer le modèle d'ombrage en SLW.
- **Plantage 1 (2026-11-25 22:49 UTC)** : assertion du préprocesseur de shaders (stb_preprocess). Cause exacte : dans M_Sol_Ile, une macro
  `#define COUCHE(...)` sur plusieurs lignes contenait, après un `\` de continuation, la suite littérale `\n` (barre oblique + n) insérée par un
  remplacement de texte : directive mal formée. Correctif : plus aucune directive (`#define`, `#if`, `#include`) dans les nœuds Custom ;
  la couche est une méthode de structure HLSL (`CapyCouche.echantillon`).
- **Plantages 2 et 3** (2026-11-26 00:05 et 21:24) : assertion « Outer != nullptr » quand une écriture de graphe DSL est refusée puis
  annulée (undo). Le premier cas sur un Blueprint créé dans le même appel, le second sur un Blueprint déjà sauvegardé ; la cause des refus :
  `Character.GetCharacterMovement` n'existe pas (c'est la variable `self.CharacterMovement`). Correctifs : création des Blueprints (09) et
  graphes (10) dans deux appels séparés, sauvegarde entre les deux, noms de nœuds vérifiés avec l'outil Schema, relecture `apercu` avant
  écriture, pas d'événement personnalisé à paramètres. Les refus suivants (arguments `self` mal placés) n'ont pas fait planter.
- Lancement depuis Git Bash : les chemins `/Game/...` sont convertis en `C:/Program Files/Git/Game/...` → `MSYS_NO_PATHCONV=1`.
- Un premier essai de mesure visait encore `CapyWorld-UE\CapyForet.uproject` (script recopié de la preuve) : boîte Windows chez le client.
  Corrigé dans `mesure.ps1` ; `campagne.ps1` et `captures.ps1` de la preuve retirés de `unreal/outils` (à réécrire pour U1).

## Retour du client sur la démo (2026-11-26) : décision du producteur
- **Constat :**
  - Le relief porté « fidèlement » reprend tous les défauts du relief Three.js : marches et dents le long des rivières, formes sans logique, transitions brutales.
  - L'eau des rivières est en plans coupés.
  - Les hauteurs et le pic de l'Aurore impressionnent le client.
  - L'erreur vient du critère « fidélité à 0,5 m » de la fiche, qui a recopié les défauts.
- **Décision :** le terrain est plafonné à **une seule demi-session**, outils natifs d'Unreal uniquement, puis on passe à Capyville et au gameplay :
  1. lissage et érosion de la carte de hauteur à l'export (suppression des marches, sauf aux falaises voulues) ;
  2. rivières refaites avec le plugin Water d'Unreal (rivières sur splines qui creusent le Landscape), d'après les tracés du jeu ;
  3. pente plafonnée sur un chemin d'accès au sommet de l'Aurore.
- Le critère de fidélité devient : mêmes régions et mêmes sommets à ±5 m, sans marche ni dent visible.
