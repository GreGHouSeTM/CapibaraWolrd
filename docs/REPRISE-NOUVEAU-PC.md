# Dossier de reprise : nouvelle session sur le PC portable RTX 5060 (2026-11-24)

> **À LIRE EN PREMIER : `docs/PLAN-STUDIO.md`.** C'est le cadre de travail obligatoire (décision du client du 2026-11-24). On y trouve les postes et
> les 20 agents de `.claude/agents/`, les étapes 0 à 7, le contrôle des changements et le tableau d'avancement du §8.
> **Où on en est** : étape 0 (mise en place du studio), 4 critères remplis sur 6. **Reste** :
> 1. faire tourner Chrome sur la RTX 5060 (BUG-01 de `docs/BUGS.md`), preuve par `chrome://gpu` ;
> 2. faire les mesures de référence de l'Alpha 0.1 sur le portable.
>
> **Ensuite** : étape 1 = Alpha 0.2 « Village vivant », selon le cycle du §4 (fiche d'étape dans `docs/taches/`). Les sections 3 et 4 de ce
> document restent valables pour le détail technique. En cas d'écart, c'est `PLAN-STUDIO.md` qui fait foi.


À lire **en entier** au premier démarrage, avant toute action. Ensuite, lire dans l'ordre :
1. `docs/MIGRATION-PC.md` : installation, restauration de l'archive privée, forcer la RTX.
2. `docs/PASSATION.md` : historique, §2 décisions validées par le client (on ne les remet jamais en cause sans lui demander).
3. `docs/PROCESSUS.md` (le plan du lead), `docs/VERSIONS.md` (Alphas publiées) puis `docs/BACKLOG.md`.
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

## 3. Plan de production (décidé par le chef de projet le 2026-11-24 : voir `docs/PROCESSUS.md`)
Le client ne connaît pas le métier. Il a demandé que **le lead choisisse le processus le plus adapté** et le fasse suivre, pour que le projet
avance et que ses idées prennent vie. Son reproche : « on traîne, rien n'est poussé dans main, pas de version alpha à tester ».

La règle d'or : **une session de quota = une Alpha jouable publiée sur main**, avec ses notes dans `docs/VERSIONS.md`.
- Chaque chantier est taillé pour 2 à 3 h.
- Deux agents au maximum en même temps.
- Vers 75 % du quota, on fusionne, on publie, et on met à jour LIAISON et la mémoire.
- Les idées nouvelles vont dans `docs/BACKLOG.md`.
- Le fil conducteur est de faire du massif de l'Aurore la première expérience complète, puis d'étendre lieu par lieu. Pour chaque lieu : blockout en blocs, puis test, puis habillage.

## 4. État au 2026-11-24 et prochaine Alpha
**L'Alpha 0.1 est publiée** (main `823b9f2`, tag `alpha-0.1`). Elle réunit :
- le terrain v2 : routes en lacets au sol, relief corrigé, 13 rochers Blender ;
- la montagne : pente, endurance, escalade, chutes, froid sans dégâts, manteau `?manteau` ;
- le bouton « Démo forêt » dans le menu.

Les notes de version sont dans `docs/VERSIONS.md`.

| Branche | État |
| --- | --- |
| `wip/terrain-v2`, `wip/montagne` | **fusionnées** dans l'Alpha 0.1 |
| `wip/lumiere-v2` (ace99c7) | J1 en cours : three 0.187, sans régression en WebGL, début des matières TSL. À finir : J1, puis J2 (démo forêt en WebGPU, SSGI, TRAA, secours WebGL). Prévue pour l'Alpha 0.5. Ce worktree a **son propre `node_modules`**. État : `docs/ETAT-LUMIERE-V2.md` |
| `wip/preuve-foret`, `wip/gemini` | fusionnée, et Gemini mis de côté (une clé `GEMINI_API_KEY` serait nécessaire) |
| En pause | `wip/hd-modelisation`, `wip/hd-rendu` (erreur 1282 = boucle de rétroaction), `wip/eau-2`, `wip/decor`, `wip/conduite` : à puiser plus tard |

**Prochaine session = Alpha 0.2 « Village vivant »** (décidée après la revue cloud du 2026-11-24, voir `LIAISON.md` et `docs/PROCESSUS.md`).
- **Agent Décor.** Il pose les 149 objets de `wip/decor` : place ≥ 60 objets, bandes de façade, lanternes. Il réduit les pièces d'or et les pose au sol, avec une clé stable par position.
- **Agent Outils.** Il travaille en parallèle sur d'autres fichiers :
  - FPS et nom de la carte graphique dans les Réglages ;
  - menu « Aller à » vers les nouveautés ;
  - vérification du nom de zone dans le HUD ;
  - montée en Three.js r187 depuis `wip/lumiere-v2` (J1 seulement), si elle est sans régression.
- **Si le temps le permet** : le torrent de `wip/eau-2`, une fois l'erreur 1282 corrigée (boucle de rétroaction : cibles de rendu privées, comme dans la démo).
- **Fin de session** : captures avant / après, FPS, poids publié et volume téléchargé au démarrage dans `VERSIONS.md`, puis publication.

**Puis l'Alpha 0.3 : le massif de l'Aurore remodelé à 1 250 m**, selon `docs/MONTAGNE-AURORE.md` et **avec la méthode de la démo forêt** (modelé du sol d'abord, rochers posés selon la pente, matières), en relançant les outils `tools/terrain/` (`docs/ETAT-TERRAIN-V2.md`).

**Point urgent sur le portable** : le client mesure 2 FPS dans la démo et 5 dans le jeu sous Chrome. C'est presque sûrement Chrome qui tourne sur la puce graphique intégrée, ou en rendu logiciel. À vérifier :
- `chrome://gpu` (lignes WebGL2 et GL_RENDERER) ;
- l'accélération matérielle de Chrome ;
- Windows > Graphiques > Chrome en « Hautes performances » ;
- le panneau NVIDIA ;
- le branchement sur secteur.

Les anciens agents ne se reprennent pas d'un PC à l'autre : lance de nouveaux agents avec leur worktree recréé, la branche et les fichiers ETAT.

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
