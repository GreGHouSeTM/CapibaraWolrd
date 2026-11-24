# Plan de studio de Capy World : organisation, postes, étapes (obligatoire)

> **Décision du client du 2026-11-24.** Ce document est le cadre de travail de toute session qui développe Capy World.
> Il remplace la feuille de route de `docs/PROCESSUS.md`, dont la règle « une Alpha par session » reste en vigueur.
> **Il se suit étape par étape.** On ne saute pas d'étape, on n'en ajoute pas et on ne démarre aucun chantier hors étape,
> sauf si le client le demande explicitement avec le mot « urgent ». Écrit par la session cloud à la demande du client.

## 0. Pourquoi ce plan
Le client constate que **les idées nouvelles sont réalisées tout de suite**, même quand elles ne sont pas prioritaires,
pendant que des chantiers importants restent sur des branches :
- 149 objets de décor générés mais jamais posés ;
- eau inachevée ;
- montagne brute présentée comme « à tester ».

Un vrai studio fonctionne autrement :
1. **Un plan de production** découpé en jalons, qui fixe ce que contient chaque jalon et ce qu'il ne contient pas.
2. **Des postes**, chacun tenu par une personne qualifiée qui a son périmètre, ses livrables et ses critères de qualité.
3. **Un contrôle des changements** : toute idée nouvelle est notée et estimée, puis placée dans un jalon futur par la direction.
   Elle n'est jamais faite « en passant ».
4. **Des validations** : direction artistique, assurance qualité, producteur. Aucune livraison sans elles.

---

## 1. Les règles d'or (non négociables)

1. **Le plan prime.** Chaque session commence par la question « à quelle étape en est-on ? » et ne travaille **que** sur cette étape.
2. **Toute idée nouvelle va dans `docs/BACKLOG.md`, pas dans le code.** Cela vaut quelle qu'en soit la source : le client, un agent, le producteur, une référence vue en ligne.
   - Le producteur l'estime en sessions, propose un jalon et l'écrit.
   - Elle n'est réalisée que le jour où son jalon est en cours.
3. **Exceptions**, et seulement celles-ci :
   - **un bug bloquant**, qui empêche de jouer, fait planter ou corrompt la sauvegarde. On le corrige tout de suite et on le note dans `docs/BUGS.md` ;
   - **une demande du client marquée « urgent »**. Le producteur dit alors ce qui est repoussé pour lui faire de la place, et l'écrit dans le journal du §8.
4. **Quand le client propose une idée en cours de session**, le producteur répond en trois points, puis continue l'étape en cours :
   - « Noté dans le backlog. » ;
   - « Je propose de la placer dans le jalon X, parce que… » ;
   - « Est-ce urgent ? »
5. **Une étape n'est terminée que lorsque tous ses critères d'acceptation sont remplis**, preuves à l'appui : captures, mesures et tests.
   Sinon elle reste en cours. On ne passe pas à la suivante « en gardant un reste pour plus tard ».
6. **Une étape trop grosse pour une session est découpée** en sous-Alphas numérotées (0.3a, 0.3b…), toujours jouables.
7. **Rien d'inachevé n'est montré au client comme « à tester ».** Ce qui est brut va dans « Limites connues ».
8. **On ne baisse jamais la qualité pour économiser du quota** : on économise sur la méthode (décision du client depuis le premier jour).
9. **Les décisions validées par le client** (`PASSATION.md` §2, `RETOURS-CLIENT.md`) ne se remettent pas en cause sans lui demander.

---

## 2. L'organisation du studio

### 2.1 La direction
| Poste | Qui | Rôle |
| --- | --- | --- |
| **Directeur du jeu** | **Le client** | Fixe la vision, valide chaque Alpha, arbitre les priorités, seul à pouvoir déclarer une urgence ou modifier ce plan. |
| **Producteur / chef de projet** | **La session Claude locale** (session principale) | Tient le plan et les jalons, découpe les étapes en fiches de tâche, lance les agents, intègre, publie, rend compte. **Il ne produit pas lui-même** d'assets ni de fonctionnalités : il orchestre, intègre et corrige les conflits de fusion. |
| **Conseil extérieur** | La session cloud | Relit les Alphas sur demande du client, via `LIAISON.md`. Ne touche jamais à `main`. |

### 2.2 Les équipes et les postes
Chaque poste est un **vrai agent qualifié** : un fichier `.claude/agents/<poste>.md` (voir §3) qui fixe son métier, ses références,
ses fichiers, ses livrables et sa définition du « terminé ». Le producteur lance **toujours** le bon agent pour le bon travail.
Il ne prend jamais un agent généraliste pour une tâche de spécialiste.

| Équipe | Poste (nom de l'agent) | Métier réel équivalent | Périmètre (fichiers dont il est propriétaire) |
| --- | --- | --- | --- |
| **Direction créative** | `directeur-artistique` | Art director | `docs/QUALITE-*.md`, `docs/references/**`, planches de comparaison. **Ne code pas.** Valide visuellement chaque livraison contre les références et rédige les retours chiffrés. |
| | `lead-level-design` | Lead open world & level designer | `docs/BIBLE-*.md`, `docs/MONTAGNE-*.md`, `src/world/zones.ts`, `src/world/layout.ts` (plan). Plans cotés, blockouts, flux du joueur, points de vue et repères. |
| | `narrative-designer` | Scénariste / narrative designer jeunesse | `docs/HISTOIRE.md`, `docs/quetes/**`, textes de dialogue (`src/gameplay/quests/data/**`). Lore, quêtes, dialogues en français pour 9-12 ans. |
| **Monde** | `terrain-artist` | Technical artist terrain / géomorphologie | `src/world/heightmap.ts`, `terrain*.ts`, `valley.ts`, `tools/terrain/**`. Relief, érosion, modelé, cartes de roche et de neige. |
| | `vegetation-artist` | Artiste environnement / végétation | `src/world/vegetation.ts`, `grass.ts`, `src/procgen/flora/**`. Écologie par étage, densités, variété, LOD et imposteurs de la flore. |
| | `water-artist` | Technical artist eau | `src/world/water.ts`, `src/procgen/flora/aquatic.ts`. Torrents, lacs, cascades, reflets, écume. |
| | `routes-ouvrages` | Concepteur routes et ouvrages d'art | `src/world/roads.ts`, ponts, talus, panneaux. Tracés cohérents avec le relief et le type de voie. |
| **Art 3D** | `modeleur-environnement` | Environment artist Blender | `tools/blender/buildings/**`, `tools/blender/props/**`, `public/assets/models/buildings|props/**`. Bâtiments, accessoires, rochers (avec `blender-asset-qa`). |
| | `integrateur-decor` | Set dresser / level artist | `src/procgen/village/**`, `src/regions/*.ts` (placement). Pose du décor, densité, composition, jonctions sol-objet. |
| | `materiaux-textures` | Material / texture artist | `public/assets/tex/**`, `tools/textures/**`, `src/procgen/materials.ts`. Matières PBR, atlas, usure, mousse, neige. |
| | `personnages-animation` | Character artist + animateur | `tools/blender/capybara/**`, `src/actors/capybara.ts`, PNJ, faune. Modèles, rigs, animations, postures debout et à quatre pattes. |
| **Rendu** | `lighting-rendu` | Lighting artist / rendering engineer | `src/world/sky.ts`, `src/core/postfx.ts`, `src/core/quality.ts`, `src/fx/lights.ts`. Lumière, ombres, atmosphère, post-traitement, migration de Three.js. |
| | `vfx-artist` | Artiste effets visuels | `src/fx/**` (sauf `lights.ts`). Fumée, vapeur, pétales, lucioles, impacts, neige soufflée. |
| **Gameplay** | `gameplay-programmer` | Programmeur gameplay | `src/gameplay/player.ts`, `mountain.ts`, `combat.ts`, `src/vehicles/**`. Déplacement, escalade, combat, conduite et sensations. |
| | `systemes-programmer` | Programmeur systèmes | `src/gameplay/quests/**`, `src/core/save.ts`, collectionnables, économie, inventaire. Quêtes, sauvegarde rétrocompatible. |
| | `ui-ux-designer` | UI/UX designer jeunesse | `src/ui/**`. HUD, menus, carte, journal, lisibilité pour une enfant, accessibilité, tout en français. |
| **Audio** | `sound-designer` | Sound designer | `src/core/audio.ts`, `public/assets/audio/**`. Ambiances par lieu, pas, eau, vent, musique (CC0). |
| **Technique** | `moteur-performance` | Engine / performance engineer | `src/world/streaming*.ts`, LOD, HLOD, fusion des lots, chargement à la demande, poids publié. Budgets de FPS, d'appels et de Mo. |
| | `outils-build` | Tools & build engineer | `tools/*.cjs`, `vite.config.ts`, `.github/workflows/**`, `tests/**` (infrastructure). Outils de capture, de mesure et de test, CI, reproductibilité sur tout PC. |
| **Qualité** | `qa-testeur` | Testeur QA | `docs/BUGS.md`, `tools/*-test.cjs` (scénarios). **Ne corrige jamais**, il trouve, reproduit et documente. Teste chaque livraison avant intégration, et chaque Alpha avant publication. |

Les postes vides au moment d'une étape ne coûtent rien : on ne lance que les agents dont l'étape a besoin.
**Limite matérielle** : 2 agents de production en parallèle au maximum, sur des fichiers différents. Le DA et le QA passent
en fin de chantier, ce qui coûte peu car ils ne font que lire, capturer et mesurer.

### 2.3 Fichiers partagés
`src/game.ts`, `src/gameplay/player.ts` et `tools/shot.cjs` sont partagés. Leur modification est **minimale et additive**,
en blocs commentés `// --- <POSTE> ---`, et elle est signalée dans le compte rendu. Les conflits sont résolus par le producteur, jamais par un agent.

---

## 3. Fiche de poste d'un agent (à créer en premier, étape 0)

Chaque poste du §2.2 devient un fichier `.claude/agents/<poste>.md`, versionné dans le dépôt. Modèle à suivre :

```markdown
---
name: terrain-artist
description: Technical artist terrain de Capy World. À utiliser pour tout travail de relief, d'érosion, de modelé du sol,
  de cartes de roche et de neige. Ne pas utiliser pour la végétation, l'eau ou les routes.
---
Tu es technical artist terrain dans un studio d'open world. Tu as l'expérience des grands mondes ouverts d'exploration :
géomorphologie, érosion hydraulique et thermique, lecture des reliefs à toutes les échelles. On s'inspire, on ne copie jamais.

## Ton périmètre
- Fichiers que tu possèdes : ...
- Fichiers que tu ne touches pas : tout le reste ; fichiers partagés en blocs `// --- TERRAIN ---` seulement.

## Ce que tu reçois
Une fiche de tâche du producteur (`docs/taches/<id>.md`) : objectif, critères d'acceptation, hors-périmètre, références.

## Ce que tu livres
- Commits WIP toutes les 20 min avec une ligne « Reprise : » ; `docs/ETAT-<chantier>.md` tenu à jour.
- Captures avant / après des vues de la fiche (GPU, qualité Moyenne et Haute).
- Mesures : FPS, appels de dessin, triangles, poids ajouté.

## Ta définition du « terminé »
- Tous les critères de la fiche cochés, preuves jointes.
- tsc, vitest, build verts ; tests de jeu verts ; aucune erreur console.
- Critères métier : pentes praticables ≤ 30-35° sur les itinéraires, aucune facette ni prisme visible à hauteur de capybara,
  modelé lisible à 3 échelles (100 m, 10 m, 1 m), transitions roche / neige / terre progressives.

## Interdits
- Démarrer un travail hors de la fiche (une idée → section « Idées » du compte rendu).
- Pousser, toucher à `main`, installer un paquet sans accord du producteur.
- Baisser la qualité pour gagner du temps.
```

Chaque fiche contient **des critères métier propres au poste**, pas seulement des règles générales. Quelques exemples :
- `directeur-artistique` : comparaison côte à côte avec 2 références par vue, une note de 1 à 5 sur la forme, les valeurs, la couleur, le détail et la lumière, et 3 corrections prioritaires.
- `qa-testeur` : un scénario par critère d'acceptation ; chaque bug noté avec étapes de reproduction, vue, capture, gravité (bloquant, majeur, mineur, cosmétique) et poste responsable.
- `moteur-performance` : budgets du §6 mesurés sur les vues de référence, avant / après.
- `ui-ux-designer` : texte lisible à 1 m d'un écran de portable, aucune information vitale par la couleur seule, tout en français.
- `systemes-programmer` : une ancienne sauvegarde se charge sans perte, et les clés des objets sont stables (position, pas index).

---

## 4. Le cycle de chaque étape (comme dans un studio)

Chaque étape du §5 se déroule **toujours** dans cet ordre :

1. **Lancement** (producteur, 10 min) :
   - relire `LIAISON.md`, ce plan, `BUGS.md` et `RETOURS-CLIENT.md` ;
   - écrire la **fiche d'étape** `docs/taches/<alpha>.md` : objectif, postes mobilisés, fiches de tâche par poste, critères d'acceptation, hors-périmètre, vues de capture, budgets ;
   - dire au client en 5 lignes ce qui sera fait cette session.
2. **Pré-production** (`lead-level-design` + `directeur-artistique`), seulement si l'étape crée un lieu :
   plan coté, blockout gris jouable, références choisies. **Le client valide le blockout** avant l'habillage.
3. **Production** (les 1 ou 2 agents de production de l'étape) : chacun suit sa fiche de tâche, dans son worktree.
4. **Revue artistique** (`directeur-artistique`) : planche avant / après / références, notes, corrections.
   Une seule boucle de correction est prévue. Au-delà, le reste est noté et replanifié.
5. **QA** (`qa-testeur`) : scénarios, tests automatiques, bugs dans `BUGS.md`. Un bug bloquant ou majeur empêche l'intégration.
6. **Intégration** (producteur) :
   - fusion dans `main` ;
   - tsc, vitest, build ;
   - tous les tests de jeu ;
   - captures et mesures côte à côte avec l'Alpha précédente ;
   - aucune régression.
7. **Publication** : Alpha taguée, `VERSIONS.md` complété :
   - ce qui est nouveau ;
   - quoi tester, uniquement ce qui est prêt ;
   - limites connues ;
   - planche avant / après ;
   - FPS, appels de dessin, poids de `dist/`, téléchargement au démarrage.
8. **Clôture** : mise à jour du tableau d'avancement (§8), de la mémoire et d'un message LOCAL dans `LIAISON.md`.
9. **Retours du client** : notés dans `RETOURS-CLIENT.md`. Ils ne changent **pas** l'étape suivante, sauf décision explicite du client.
   Ils sont rangés dans le backlog ou dans `BUGS.md`.

**Vers 75 % du quota**, on n'ouvre plus rien : on passe directement aux points 5 à 8 avec ce qui est fini, et le reste devient une sous-Alpha.

---

## 5. Le plan, étape par étape

Chaque étape indique ses postes, ses livrables, ses **critères d'acceptation** (tous obligatoires) et son **hors-périmètre**
(ce qu'on ne fait surtout pas pendant cette étape, même si c'est tentant).

### Étape 0 — Mise en place du studio (1 session, avant toute nouvelle Alpha)
- **Postes** : producteur, `outils-build`, `qa-testeur`.
- **Livrables** :
  1. Les 20 fiches de poste `.claude/agents/*.md` du §2.2, rédigées selon le §3, avec des critères métier précis.
  2. `docs/BUGS.md` (tableau : id, gravité, poste, statut, reproduction, Alpha visée), alimenté avec les bugs connus :
     - erreur shader 1282 ;
     - nom de zone dans le HUD ;
     - pièces flottantes ;
     - « Nouvelle partie » qui recharge ;
     - voiture qui grimpe tout.
  3. `docs/taches/` créé, avec la fiche d'étape modèle.
  4. **Outils et carte graphique** :
     - verrou vide de `browser.cjs` : **déjà corrigé** (réponse LOCAL du 2026-11-24) ;
     - Playwright : déjà prévu dans `MIGRATION-PC.md`.
     - **Bloquant : le portable RTX 5060 donne 2 FPS dans la démo et 5 dans le jeu.** Tant que `chrome://gpu` ne montre pas la RTX
       (et non la puce intégrée ou SwiftShader), aucune mesure n'a de valeur et aucune Alpha ne peut être jugée. Avec le client :
       - accélération matérielle de Chrome activée ;
       - Paramètres Windows > Affichage > Graphismes : Chrome en « Hautes performances » ;
       - panneau NVIDIA : processeur graphique préféré = NVIDIA pour Chrome ;
       - portable branché sur secteur.

       Ensuite, vérifier dans le jeu le nom de la carte graphique (Réglages), puis reprendre les mesures.
  5. **Mesures de référence de l'Alpha 0.1 sur le nouveau PC**, consignées :
     - FPS en Basse, Moyenne et Haute ;
     - appels de dessin et triangles ;
     - poids de `dist/` ;
     - Mo téléchargés au démarrage du monde.

     Mesures sur les vues de référence du §6.
  6. **`wip/lumiere-v2`** : **déjà tranché** par le producteur. La montée en r187 seule, sans TSL, va dans l'Alpha 0.2 si elle est sans régression ;
     WebGPU et TSL attendent l'étape 6.
- **Acceptation** :
  - tous les agents existent et se lancent ;
  - le jeu tourne sur la RTX 5060 du client, preuve par `chrome://gpu` et par le nom de la carte dans les Réglages ;
  - les captures marchent sur le nouveau PC ;
  - les mesures de référence sont publiées dans `VERSIONS.md`.
- **Hors-périmètre** : aucune fonctionnalité, aucun asset.

### Étape 1 — Alpha 0.2 « Village vivant » (1 session)
- **Postes** : `integrateur-decor` (avec `modeleur-environnement` en appui sur les 149 variantes), `water-artist`, puis `directeur-artistique` et `qa-testeur`.
- **Livrables** :
  - **Décor** :
    - pose des accessoires de `wip/decor` ;
    - place centrale ≥ 60 objets ;
    - bande de façade devant chaque maison ;
    - lanternes avec lumière la nuit ;
    - objets fusionnés par cellule, avec LOD.
  - **Pièces d'or** : taille réaliste, posées au sol ou sur un support, en nombre réduit, à des endroits qui récompensent l'exploration, avec une clé stable dans la sauvegarde.
  - **Torrent** de `wip/eau-2` intégré : erreur 1282 corrigée ou contournée sans perte visuelle. L'étang attend l'étape 5.
  - **Bug du HUD « nom de zone »** vérifié et corrigé si réel.
  - **Démo forêt chargée à la demande** : 0 Mo de la démo téléchargé au démarrage du monde.
  - Outils de test déjà décidés par le producteur : FPS et nom de la carte graphique dans les Réglages, menu « Aller à ».
  - **Montée en Three.js r187** (J1 de `wip/lumiere-v2`, par `lighting-rendu`), seulement si elle est sans régression mesurée ; sinon reportée,
    sans bloquer l'Alpha.
- **Acceptation** :
  - vues `place`, `rue`, `maison`, `nuit`, `torrent-pont` notées ≥ 4/5 par le DA sur le détail ;
  - aucune grande surface vide à hauteur de capybara ;
  - appels de dessin au sol ≤ budget ;
  - une ancienne sauvegarde se charge ;
  - tous les tests sont verts.
- **Hors-périmètre** : la montagne, la flore hors du village, les nouvelles régions, les effets du backlog.

### Étape 2 — Alpha 0.3 « Aurore : blockout » (1 session)
- **Postes** : `lead-level-design`, `terrain-artist`, `routes-ouvrages`, puis `qa-testeur`.
- **Livrables** :
  - massif remodelé à 1 250 m selon `docs/MONTAGNE-AURORE.md`, en **blockout** : relief juste, matières simples ;
  - voie normale en lacets, avec panneaux ;
  - étages lisibles ;
  - blocs pour le refuge et les chalets ;
  - marqueurs du lac, de la grotte et de la crevasse ;
  - Pierre-Vapeur au sommet, fonctionnelle (voyage rapide).
- **Acceptation** :
  - ascension complète par la voie normale en 20 à 30 min, sans blocage (test d'accès) ;
  - pentes ≤ 30-35° sur l'itinéraire ;
  - sommet et Pierre-Vapeur fonctionnels ;
  - **blockout validé par le client** avant l'étape 3.
- **Hors-périmètre** : rochers détaillés, flore, eau, quête, beauté. **C'est un blockout, et il est présenté comme tel.**

### Étape 3 — Alpha 0.4 « Aurore : sol, roche et neige » (1 à 2 sessions)
- **Postes** : `terrain-artist`, `materiaux-textures`, avec `modeleur-environnement` pour les rochers, puis le DA et le QA.
- **Méthode imposée** (celle de la démo forêt) :
  1. modelé du sol d'abord : ravines, éperons, cônes d'éboulis, congères, replats, affleurements dans la carte de roche ;
  2. puis pierriers et rochers posés selon la pente : couchés dans la ligne de plus grande pente, enterrés de 20 à 40 %, plus denses au pied des parois et dans les couloirs ;
  3. enfin les matières : neige soufflée, transitions neige / terre / roche par pente et par exposition.
- Les talus des lacets deviennent des talus de terre végétalisés, avec des enrochements ponctuels. **Plus aucun prisme.**
- **Acceptation** :
  - vues `qa-aurore-*` et `qa-lacets-*` notées ≥ 4/5 par le DA ;
  - aucun rocher flottant ou « planté » ;
  - aucune facette visible à hauteur de capybara ;
  - FPS dans le budget.
- **Hors-périmètre** : flore, eau, faune, quête.

### Étape 4 — Alpha 0.5 « Le manteau d'hiver » (1 à 2 sessions)
- **Postes** : `narrative-designer`, `systemes-programmer`, `ui-ux-designer`, `personnages-animation` (PNJ et manteau), puis le QA.
- **Livrables** :
  - système de quêtes et journal ;
  - un PNJ des Clarines avec ses dialogues ;
  - la quête complète, avec le manteau en récompense (le froid disparaît) ;
  - le premier Squishy dumpling et son album ;
  - « Nouvelle partie » sans rechargement.
- **Acceptation** :
  - quête jouable du début à la fin par le test automatique ;
  - textes relus pour une enfant de 9-12 ans ;
  - sauvegarde rétrocompatible.
- **Hors-périmètre** : autres quêtes, autres collectionnables, intérieurs.

### Étape 5 — Alpha 0.6 « Aurore vivante » (2 sessions : 0.6a flore, 0.6b eau, faune et son)
- **Postes** :
  - 0.6a : `vegetation-artist`, selon la méthode flore AAA (`RETOURS-CLIENT.md` §12 bis) ;
  - 0.6b : `water-artist`, `personnages-animation` (faune), `sound-designer` ;
  - puis le DA et le QA.
- **Livrables** :
  - flore par étage : forêt de vallée, pinèdes, alpages, limite des arbres ;
  - torrent, lac d'altitude, cascade, étang du village (reflets, koï, nénuphars) ;
  - marmottes, bouquetins, aigles ;
  - ambiances sonores par étage.
- **Acceptation** :
  - vues notées ≥ 4/5 ;
  - transition d'étage progressive sur ≥ 300 m ;
  - FPS et poids dans le budget.

### Étape 6 — Alpha 0.7 « Tranche verticale » (1 à 2 sessions)
- **Postes** : `modeleur-environnement` (grotte), `lighting-rendu` (passe lumière et ombres complète, WebGPU si décidé à l'étape 0), `vfx-artist`, `moteur-performance`, puis le DA et le QA.
- **Livrables** :
  - grotte explorable ;
  - lumière finale du massif, de jour, à l'aube et de nuit ;
  - effets : neige soufflée, souffle, vapeur de la Pierre ;
  - passe d'optimisation ;
  - polissage.
- **Acceptation** :
  - **revue de tranche verticale avec le client** : « est-ce le niveau du jeu ? » ;
  - si oui, le massif devient la **référence de qualité** de toutes les régions, et l'on passe en production ;
  - si non, les écarts sont notés et une étape 6b est ajoutée.

### Étape 7 et suivantes — Production, une région ou un système par Alpha
**Ordre proposé**, à valider par le client à la fin de l'étape 6 :
1. Capyville et ses alentours, au niveau de la tranche ;
2. le Pôle Nord, avec le village alpin en entrée ;
3. le Japon et l'Asie, avec la jungle ;
4. Paris ;
5. Londres ;
6. New York ;
7. le Désert.

Les systèmes s'intercalent entre les régions : conduite (physique et vue conducteur), villes organiques, interior mapping, PNJ, autres quêtes.

Chaque région suit le même mini-cycle, en 3 Alphas :
1. **blockout** : plan, relief et voies, validé par le client ;
2. **habillage** : terrain, flore, décor, eau, lumière ;
3. **vie** : quêtes, PNJ, faune, sons, effets.

**Toutes les 2 Alphas** : une demi-session `moteur-performance` (budgets du §6) et une passe `qa-testeur` de non-régression sur tout le monde.

### Finitions
Les effets du backlog viennent ici, sauf décision contraire du client :
- lens flare ;
- pluie et boue sur la caméra ;
- post-traitements ;
- météo ;
- traces de pas et de roues.

---

## 6. Budgets suivis à chaque Alpha (mesurés par `moteur-performance`, vérifiés par `qa-testeur`)
| Mesure | Budget | Vues de référence |
| --- | --- | --- |
| FPS qualité Moyenne, 1600×900, PC du client | ≥ 50 au sol, ≥ 35 en vue lointaine | `place`, `rue`, `departaube`, `nuit`, `lointain`, plus les vues de l'étape |
| Appels de dessin | ≤ 700 au sol, ≤ 1 500 en vue lointaine | idem |
| Triangles | ≤ 3 M au sol, ≤ 8 M en vue lointaine | idem |
| Téléchargé au démarrage du monde | ≤ 60 Mo | premier chargement, cache vide |
| Poids total de `dist/` | suivi, et justifié s'il augmente de plus de 10 % | — |
| Erreurs console | 0 | toutes |

Ces chiffres sont des cibles. Une Alpha qui les dépasse peut être publiée seulement si `VERSIONS.md` le dit et qu'une étape prévoit le correctif.

---

## 7. Contrôle des changements (idées nouvelles)
Pour chaque idée, une ligne dans `docs/BACKLOG.md` :
- l'idée ;
- sa source et sa date ;
- le poste concerné ;
- l'estimation en sessions ;
- l'étape proposée ;
- le statut : `proposée`, `planifiée`, `en cours` ou `faite`.

- **Le producteur ne démarre jamais une idée** dont l'étape n'est pas en cours.
- **Un agent** qui a une idée l'écrit dans la section « Idées » de son compte rendu, et ne la code pas.
- **À la fin de chaque Alpha**, le producteur présente au client les 3 idées du backlog qu'il propose de rapprocher, et c'est le client qui choisit.

---

## 8. Tableau d'avancement (à tenir à jour par le producteur, à chaque clôture)
| Étape | Alpha | Statut | Début | Fin | Critères remplis | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Mise en place du studio | en cours | 2026-11-24 | | 4 / 6 | faits : 20 fiches d'agents (.claude/agents, suivies dans git), BUGS.md (8 bugs), docs/taches/MODELE.md, verrou et Playwright, décision r187. Restent : RTX 5060 du client (BUG-01) et mesures de référence de l'Alpha 0.1 sur le portable |
| 1 | 0.2 Village vivant | à faire | | | | |
| 2 | 0.3 Aurore : blockout | à faire | | | | |
| 3 | 0.4 Aurore : sol, roche, neige | à faire | | | | |
| 4 | 0.5 Le manteau d'hiver | à faire | | | | |
| 5 | 0.6a/b Aurore vivante | à faire | | | | |
| 6 | 0.7 Tranche verticale | à faire | | | | |

**Journal des écarts au plan** (urgences du client, reports) :
| Date | Écart | Décidé par | Ce qui a été repoussé |
| --- | --- | --- | --- |

---

## 9. Compte rendu de fin de session (modèle obligatoire, dans `LIAISON.md` et au client)
1. Étape en cours, et critères remplis sur le total.
2. Ce qui est publié (Alpha, tag, lien).
3. Mesures avant / après (tableau du §6).
4. Bugs ouverts et fermés (`BUGS.md`).
5. Idées reçues et où elles ont été placées dans le backlog.
6. Écarts au plan, avec leur justification.
7. Première tâche de la prochaine session.
