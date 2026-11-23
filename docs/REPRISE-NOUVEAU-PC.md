# Dossier de reprise : nouvelle session sur le PC portable RTX 5060 (2026-11-24)

À lire **en entier** au premier démarrage, avant toute action. Ensuite, lire dans l'ordre :
1. `docs/MIGRATION-PC.md` : installation, restauration de l'archive privée, forcer la RTX.
2. `docs/PASSATION.md` : historique, §2 décisions validées par le client (on ne les remet jamais en cause sans lui demander).
3. `docs/PROCESSUS.md` puis `docs/BACKLOG.md` : comment on travaille désormais.
4. `docs/BIBLE-MONDE.md`, `docs/RETOURS-CLIENT.md` (§1 à §12 bis), `docs/MONTAGNE-AURORE.md` (sur `wip/montagne`).
5. La mémoire restaurée (`memory/MEMORY.md` et ses fichiers).

## 1. L'ambition (mots du client, non négociable)
> « Il est important que ce jeu, certes pour ma fille, ne soit pas traité juste comme un petit jeu mais un vrai open world avec une qualité
> graphique et de détail au max de ce qui se fait aujourd'hui sur three.js, blender, unreal etc. »

Concrètement :
- **La cible visuelle est le « next gen ».** Les références sont des rendus Unreal 5 (`docs/references/prive/nextgen/`), et la démo forêt atteint environ 60 à 70 % de leur niveau. La DA actuelle du monde est jugée « Switch ».
- **La sensation visée** : un monde immense où l'on se sent libre, avec de vraies montagnes (ascension, hauteur, froid, danger, grottes, se perdre), dans l'esprit des grands open worlds. On s'inspire, on ne copie jamais.
- **On ne baisse jamais la qualité pour économiser du quota.** On économise sur la méthode : scripts relançables, mesures automatiques, une seule chose à la fois.
- **Ce que le client apprécie :**
  - l'honnêteté (dire ce qui ne va pas, avec des chiffres mesurés côte à côte) ;
  - des captures à chaque étape ;
  - les vraies décisions posées clairement.
- **Les assets comptent autant que la lumière.** Il veut de la créativité, de l'ingéniosité et du talent dans Blender. Objectifs de rendu cités :
  - la voiture « style GTA 6 » modélisée par Claude, pour la modélisation et les reflets ;
  - le désert « Dune » en Three.js ;
  - le feuillage AAA du post Reddit (RETOURS §12 bis).

## 2. Rôles et méthode
- **Le chef de projet, c'est toi (Claude).**
  - Tu intègres, vérifies, fusionnes dans `main` et pousses, et uniquement s'il n'y a aucune régression.
  - Avant toute fusion : tsc, vitest, build, tests de jeu, captures et FPS mesurés côte à côte avec main.
- **Les agents.**
  - Un agent par spécialité, chacun dans son propre worktree et sur sa branche `wip/...`.
  - Deux ou trois en parallèle au maximum : le quota de 5 h part vite.
  - Ils ne poussent jamais et ne touchent jamais à `main`.
  - Ils font des commits WIP toutes les 20 min, avec une ligne « Reprise : », et tiennent un fichier `docs/ETAT-*.md`.
  - Ils exécutent tout ce qu'ils écrivent, avec une capture à chaque jalon.
- **Les skills Blender.** 28 skills `blender-*` sont installés (dans l'archive de transfert). Ils s'exécutent **en local uniquement**, jamais via le cloud Patch. `blender-asset-qa` est **obligatoire** avant de livrer un asset.
- **Liaison avec la session cloud.** On lit et on écrit `LIAISON.md` sur la branche `liaison` (jamais sur main) : lire les réponses CLOUD au début d'une passe, ajouter un message LOCAL à la fin.
- **Langue et commits.** Tout est en français : jeu, code, commentaires, documents, conversation. Chaque commit se termine par la ligne d'attribution.
- **Quota.** Le client prévient vers 80-95 %. À ce moment : commit WIP partout, push de toutes les branches `wip/...`, mise à jour de la mémoire.

## 3. Processus (depuis le 2026-11-22, voir `docs/PROCESSUS.md`)
Le client a dit : « garde ce qui est fait, on ne repart pas en arrière, mais ce processus à partir de maintenant ».

Les étapes, une seule active à la fois :
- 0 : pré-production (faite) ;
- 1 : **blockout gris de toute l'île** ;
- 2 : déplacement et caméra ;
- 3 : premier jouable ;
- 4 : tranche verticale jouable (massif de l'Aurore) ;
- 5 : production zone par zone ;
- 6 : finitions.

Les idées nouvelles vont dans `docs/BACKLOG.md`.

## 4. État exact des branches (toutes poussées sur GitHub le 2026-11-24)
| Branche | Dernier commit | État | À faire à la reprise |
| --- | --- | --- | --- |
| `main` | 7da8bb0 | jeu jouable (GitHub Pages) ; terrain 8 km, démo forêt `?demo=foret&q=max`, niveau Max, processus et backlog | — |
| `wip/terrain-v2` | 0610bd1 | J0-J2 faits (routes en lacets, ruban posé au sol, pentes, plus de marches) ; J3 : détail de près + **13 rochers Blender** validés par asset-qa, placement `rochers.py`, `src/world/rocks.ts` | consigne : rochers **en l'état**, pas de nouvel habillage ; finir **J4** (QA, tests, FPS côte à côte avec main), compte rendu, puis fusion. État : `docs/ETAT-TERRAIN-V2.md` |
| `wip/montagne` | 854c9ca | dossier `docs/MONTAGNE-AURORE.md` (décisions du client intégrées) ; déplacement en montagne fait (`src/gameplay/mountain.ts`, `trails.ts`, `heat.ts`, HUD, manteau `?manteau`, secousse de chute), 15 tests verts | revérifier `acces-test` (bord de l'étang), FPS contre main, compte rendu, fusion. État : `docs/ETAT-MONTAGNE.md` |
| `wip/lumiere-v2` | ace99c7 | J1 en cours : three 0.170 → **0.187**, postprocessing 6.39.6, n8ao 2.1.0, WebGL sans régression ; début des matières TSL | consigne : finir **J1 + J2** (démo forêt en WebGPU avec SSGI et TRAA, secours WebGL) puis **s'arrêter** (J3 et J4 au backlog, étape 4). Ce worktree a son **propre `node_modules`** (`npm install` dedans). État : `docs/ETAT-LUMIERE-V2.md` |
| `wip/preuve-foret` | 28610c0 | fusionnée dans main | rien |
| `wip/gemini` | 4043d60 | Gemini **mis de côté** (connexion Google refusée, renvoi vers Antigravity) ; réactivable avec une clé `GEMINI_API_KEY` créée par le client | rien |
| En pause (à puiser aux étapes 4-5) | `wip/hd-modelisation`, `wip/hd-rendu` (erreur 1282 expliquée : boucle de rétroaction), `wip/eau-2`, `wip/decor`, `wip/conduite` | | |

**Ordre de reprise conseillé :**
1. Relancer Terrain v2 (J4) et Montagne (fin), puis les fusionner. Ce sont des étapes 1 et 2.
2. Lancer l'agent **Blockout** (étape 1) : toute l'île en gris, avec :
   - le massif de l'Aurore remodelé à **1 250 m**, sommet en (-2600, 520) ;
   - des blocs pour les villes et les bâtiments, en tracés organiques ;
   - des marqueurs pour les grottes, lacs, refuges et Pierres-Vapeur.

   **Définition de « fini » :** le client et sa fille font le tour de l'île.
3. Lumière v2 en tâche de fond, avec J1 et J2 seulement.

Les anciens agents ne se reprennent pas d'un PC à l'autre. Lance de **nouveaux agents** avec : le worktree recréé, la branche, le fichier ETAT, et les consignes ci-dessus.

## 5. Questions et décisions en attente
- **Moteur** : Three.js ou Unreal 5. Le client a testé la preuve. Il n'a pas tranché formellement, mais il continue en Three.js et vise le maximum de ce que Three.js, Blender et compagnie permettent. Avec la RTX 5060 (cœurs RT), on peut réévaluer ThreeRT (natif, path tracing) et Unreal si la qualité plafonne. À reposer au moment de l'étape 4.
- **Squishy dumplings** : raretés, obtention, album, récompenses. À poser au client à l'étape 3.

## 6. Ce que la RTX 5060 change
- Toutes les mesures de FPS sont à refaire : les anciennes viennent de la GTX 1080 Ti.
- Cycles OptiX accélère les cuissons. Le ray tracing matériel devient disponible. WebGPU fonctionne.
- Environ 8 Go de VRAM : surveiller les textures en qualité Max. Ne pas lancer deux cuissons Blender lourdes en même temps.
- Sur un portable, toujours vérifier que le navigateur de test utilise la RTX : ligne « rendu : » de `tools/shot.cjs`. Rester sur secteur pendant les mesures.

## 7. Pièges connus
- **Vite** : après une fusion qui modifie `physics.ts` ou `heightmap.ts`, redémarrer Vite, sinon les tests de collision sont faux.
- **Serveurs** : arrêter un serveur par son port, jamais en tuant tous les `node.exe` (le système de permissions l'a refusé).
- **PowerShell** :
  - `npm` est bloqué par la politique des scripts : utiliser `npm.cmd` ;
  - les here-strings échouent avec `git commit -F -` : écrire le message dans un fichier ou passer par Bash.
- **Fins de ligne** : les remplacements par script cassent sur les CRLF. Normaliser d'abord, puis relire le résultat (une ligne a déjà été abîmée).
- **Worktrees** : créés à la main (l'isolation automatique de l'outil Agent échoue), avec `node_modules` en jonction (`New-Item -ItemType Junction`). Exception : `-lumiere`, qui a son propre `node_modules`.
- **Captures et FPS** : les agents annoncent parfois des gains en comparant à d'anciens chiffres. Toujours remesurer côte à côte.
- **Reddit et X** : reddit.com est inaccessible à nos outils ; X se lit dans le navigateur intégré.
