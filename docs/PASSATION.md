# Passation du projet Capy World (à lire en premier par toute nouvelle session)

Ce document transmet tout le contexte de la première session (cloud, novembre 2026) à une nouvelle session,
par exemple une session locale sur le PC du client avec sa carte graphique. Le reste de la documentation est dans `docs/`.

## 1. Le client et le projet
- Un père qui crée un jeu pour sa **fille de 9-12 ans**, joué sur PC dans le navigateur. Langue : **français** (code commenté et jeu en français).
- Jeu : open world d'exploration et de missions, héros **capybara**, 7 régions (Capyville au centre, Paris, New York, Londres,
  Japon, Désert, Pôle Nord). Inspirations de genre (grands open worlds d'exploration) **sans rien copier**.
- Exigence n°1 du client : **un rendu le plus réaliste et détaillé possible**. Il a jugé la première version « beaucoup trop vide, trop simpliste ».
  Il ne veut jamais qu'on baisse la qualité pour économiser du quota : on économise sur la méthode, pas sur le résultat.
- Il apprécie : être tenu au courant avec des captures, les explications honnêtes (limites, risques), qu'on lui pose les vraies décisions.
- Dépôt : `GreGHouSeTM/CapibaraWolrd` (branche `main` = version jouable ; publiée sur GitHub Pages :
  https://greghousetm.github.io/CapibaraWolrd/ via `.github/workflows/pages.yml`).
  La branche de travail de la session cloud était `claude/capy-world-v1` (identique à `main` à la passation).

## 2. Décisions validées par le client (ne pas les remettre en cause)
| Sujet | Décision |
| --- | --- |
| Technique | Three.js r170 + Vite + TypeScript, jouable dans le navigateur, rien à installer pour jouer |
| Capyville | **Village thermal japonais de montagne (onsen)** — références `docs/references/ref-1` à `ref-8` |
| Assets | **Blender par scripts** (module Python `bpy`) + **modèles photoscannés CC0 Poly Haven** |
| Équipe | **Un agent par spécialité**, coordonnés par un chef de projet, avec un **Lead open world & level design** (voir `docs/EQUIPE.md`) |
| Capybara | **Debout** pour marcher et à l'arrêt, **à quatre pattes** pour sprinter et nager, transitions animées fluides (annexe de la bible) |
| Monde | **8 × 8 km**, terres sauvages en **procédural dirigé** (érosion, rivières simulées, végétation écologique, points d'intérêt), aucun mur invisible (annexe de la bible) |
| Méthode | Boucle d'amélioration : intégrer → vérifier → captures → critique contre la grille → pousser sur `main` sans régression |
| Niveau visuel (2026-11-19) | **On reste sur Three.js** (navigateur) mais on vise un **niveau de détail PS5** : assets, modélisation et rendu à élever ; méthode par tranche verticale, voir `docs/TRANCHE-HD.md` |
| Mini-carte | Réduite (110-150 px), demandée par le client |
| Zones du monde 8 km (2026-11-18) | **Village alpin** (ref-9 à ref-11) = porte d'entrée de la zone Pôle Nord / arctique (puis pinèdes enneigées ref-12, aurores ref-15) ; **jungle** (ref-14, ref-16 à ref-18) = dans la zone Asie (autour de la région Japon) |
| 2 joueurs | Plus tard (code déjà prévu pour plusieurs joueurs / caméras) |

## 3. Documents de référence
- `docs/BIBLE-CAPYVILLE.md` : bible du Lead (plan coté, relief, chemins, architecture, décor, lumière, gameplay, budget, **§13 liste de production par spécialité**, annexes postures et monde 8 km).
- `docs/QUALITE-CAPYVILLE.md` : direction artistique, charte, chaîne de production, principes, **grille de qualité** et **journal des passages**.
- `docs/EQUIPE.md` : spécialités et fichiers dont chacune est propriétaire. `docs/BRIEF-AGENTS.md` : règles communes à donner à chaque agent.
- `src/world/zones.ts` : toutes les données du plan de Capyville (bâtiments, chemins, torrent, ponts, PNJ, nids d'ennemis…).

## 4. État à la passation (ce qui est sur `main`)
- **Combat** : combo 3 coups (clic gauche), roulade (clic droit / C), 5 cœurs, Grignoteurs cachés dans les hautes herbes, mission de la Gardienne Sora. Test : `tools/combat-test.cjs`.
- **Terrain de la vallée** : grille fine 0,5 m, 7 sommets, 6 cols, lit du torrent (sec), étang, plateformes (`src/world/valley.ts`).
- **Lumière** : aube dorée 6 h 45, brume de vallée, rayons, nuit lisible, pool de lumières dynamiques (`src/world/sky.ts`, `src/core/postfx.ts`, `src/fx/lights.ts`).
- **Bâtiments Blender** : 88 modèles (kit, machiya, minka, pagode, sanctuaire, ryokan, bains, moulin, ponts, torii) — `tools/blender/buildings/`, `public/assets/models/buildings/`.
- **Poly Haven** : 97 modèles photoscannés + chargeur `src/core/models.ts` — `tools/polyhaven/`.
- **Village onsen intégré** (`src/regions/hub.ts`, `src/procgen/village/`) : bâtiments posés, rues dallées, escaliers, ponts, premier décor. Test : `tools/village-test.cjs`.
- Les anciennes missions (Mamie, mini-missions de conduite, nage, photo) et les autres régions fonctionnent toujours.

## 5. Chantiers en cours, sauvegardés sur des branches (à reprendre)
| Branche | Contenu | Reste à faire |
| --- | --- | --- |
| `wip/vegetation-fusion` | **Intégrée dans `main` le 2026-11-18 (session locale)** : le voile blanc ne se reproduit ni sur le GPU du client ni en SwiftShader sous Windows (probablement propre au rendu logiciel Linux du conteneur cloud). Historique : Végétation complète (11 347 arbres à cartes de feuilles : cerisiers, érables, cèdres dont géant 34 m, pins, bambous, yuzus, keyaki ; susuki 1,2-1,6 m, rizières, théiers, sous-bois) **déjà fusionnée** avec `main` | **Bug à corriger avant de pousser** : un voile blanc couvre la moitié basse de l'écran. Le rendu direct (`renderer.render`) est correct : le problème vient de l'effet d'atmosphère de `src/core/postfx.ts` (brume/brouillard calculés depuis la profondeur) combiné à la flore (piste : cuisson des imposteurs dans `src/procgen/flora/species.ts` appelée au premier `flora.update`, ou matériaux de feuillage et profondeur). Masquer la flore, l'herbe, l'eau ou le village ne fait pas disparaître le voile ; il n'existait pas avant la fusion (ni sur `main`, ni dans les captures de l'agent Végétation). |
| `wip/eau` | Torrent à hauteur locale (flux animé, écume, seuils, bief), cascades et brume | Finir : étang (reflets, nénuphars, koï), bains laiteux, rizières miroir ; tests village/combat |
| `wip/vegetation`, `wip/integration-village`, `wip/terrain`, `wip/lumiere`, `wip/polyhaven`, `wip/batiments-blender`, `wip/integration-passage-1` | Sauvegardes intermédiaires déjà intégrées dans `main` | Rien (historique) |

Points notés pendant l'intégration : **trop de pièces d'or dans les rues** du village (à réduire et replacer) ;
arbres provisoires dans le village tant que la végétation n'est pas fusionnée ; appels de dessin encore au-dessus du budget
sur les vues larges (budget 700 ; ~1 000 au sol, plus en vue aérienne) ; escalier des mille torii : la pente du terrain est à reprendre ;
plus de texture de dalles dédiée (on utilise `stonewall`).

## 6. Prochaines étapes (ordre prévu)
0. **Tranche verticale niveau PS5** (`docs/TRANCHE-HD.md`), prioritaire : elle fixe les outils et la qualité appliqués ensuite partout.
   Les chantiers Eau (`wip/eau-2`, torrent corrigé) et Décor (`wip/decor`, générateur d'accessoires) reprendront à ce nouveau niveau.
1. ~~Corriger le voile blanc puis pousser la végétation~~ (fait) ; finir et intégrer l'Eau.
2. Décor (bande devant les façades, place, enseignes ; pièces d'or), Effets (fumée, vapeur, pétales, lucioles ; brancher `setHitFxHandler` du combat), Routes (chemins de terre en campagne), Ennemis & faune.
3. **Rig & animation Blender du capybara** (postures debout / quatre pattes).
4. **Phase Optimisation** (demandée par le client le 2026-11-18) : gagner en FPS et en fluidité sans perte visuelle. Constat des
   mesures (`tools/perf.cjs`) : ~25-30 ms par image en Moyenne quelle que soit la résolution, donc limite côté processeur
   (≈ 950 appels de dessin au sol, ≈ 4 900 en vue lointaine, simulation) plutôt que côté carte graphique. Pistes : fusion du décor
   statique par cellule et par matériau, instanciation, LOD et imposteurs du décor lointain, ombres limitées aux objets proches.
5. Audio, **passe dédiée Lumière & ombres** (ombres de la vallée et des montagnes, AO cuite, ombres de contact, reflets).
6. **Gameplay, quêtes et histoire** (souhait du client, 2026-11-18) : **pas de missions basiques** du type « ramasser les pièces » ;
   un vrai système de quêtes intéressantes (chaînes de quêtes, choix, énigmes, personnages attachants) porté par une histoire et un lore
   cohérents avec la bible (§1). **Fil rouge du jeu : les collectionnables « Squishy dumplings »** : tendance actuelle chez les enfants, des squishies
   en forme de brioches vapeur asiatiques (bao / manjū) aux plis du dessus, petit visage kawaii (yeux noirs, joues roses), vendus dans
   un **panier vapeur en bambou** et souvent en **boîte mystère**. Variantes de matière qui font naturellement la rareté : mat pastel
   (basique), nacré ou pailleté (rare), arc-en-ciel (épique), doré ou spécial (légendaire)… Designs **originaux** à créer (aucun emballage,
   logo ni personnage de marque copié). Lien naturel avec Capyville : les paniers vapeur de manjū de la Grand-Rue (bible §8.1).
   À préciser avec le client : liste exacte des raretés, obtention (quêtes, cachettes, échanges, paniers mystère), album, récompenses. Le Lead écrira une bible gameplay avant toute production.
7. Chantier **Monde 8 km** (Lead → Terrain → Végétation et points d'intérêt → Routes → Eau → Lumière).

## 7. Méthode et outils
- Lancer le jeu : `npm install`, `npm run dev` (http://localhost:5173). Tests : `npx tsc --noEmit -p .`, `npx vitest run`, `npm run build`.
- Mode test : `?manual&q=low|medium|high` ; `window.__game.startPlay()`, `step(n, dt)`, `frame(dt, false)`, `teleport`, `rig.override`.
- Captures : `node tools/shot.cjs <port> <dossier> <qualité> <vues>` (vues prédéfinies ; `SHOT_STEPS=8` pour les vues lourdes).
  Depuis la session locale (PC Windows du client, GTX 1080 Ti), tous les outils lancent Chromium **sur le GPU** via `tools/browser.cjs`
  (verrou « un navigateur à la fois » intégré, qui remplace `shot-lock.sh` ; `CAPY_GL=swiftshader` pour le rendu logiciel).
  FPS réels : `node tools/perf.cjs <port> low,medium,high <vues> [dossier]`.
- Poste local : Node 24, Git, Python 3.13 + bpy 5.3 dans `.venv-blender` (lancer son `python.exe` directement, une conversion lourde
  à la fois), gltfpack via `npm install --prefix tools/polyhaven`, Chromium Playwright.
- Agents : un worktree isolé par agent, brief `docs/BRIEF-AGENTS.md`, 2 ou 3 agents en parallèle au maximum (la limite de 5 h
  du forfait se consomme vite : 300 000 à 400 000 jetons par chantier), commits fréquents, pas de push par les agents ;
  le chef de projet intègre et ne pousse sur `main` qu'en l'absence de régression.
- Commits terminés par les lignes d'attribution `Co-Authored-By` (voir l'historique git).
