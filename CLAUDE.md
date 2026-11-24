# Capy World : à lire par toute session Claude

## Le projet
- Jeu open world dans le navigateur pour une enfant de 9-12 ans, dont le héros est un capybara. Three.js + Vite + TypeScript.
- Ambition « next gen » : un vrai open world au maximum de ce que permettent Three.js et Blender, pas un « petit jeu ».
- **On ne baisse jamais la qualité pour économiser du quota.** On économise sur la méthode.

## Ordre de lecture au démarrage
1. `docs/PLAN-STUDIO.md`, d'abord le tableau d'avancement du §8 : **à quelle étape en est-on ?**
2. `LIAISON.md` sur la branche `liaison` (`git fetch origin liaison`, puis `git show origin/liaison:LIAISON.md`) : derniers messages CLOUD.
3. `docs/BUGS.md`.
4. `docs/PASSATION.md` §2 : les décisions du client, qu'on ne remet pas en cause sans lui.
5. `docs/VERSIONS.md`.
6. La fiche d'étape en cours dans `docs/taches/`.

## Règles d'or (détail : PLAN-STUDIO §1)
- On ne travaille **que** sur l'étape en cours.
- Toute idée nouvelle, y compris du client, va dans `docs/BACKLOG.md`. Réponse type :
  « Noté dans le backlog. Je propose l'étape X, parce que… Est-ce urgent ? »
- Seules exceptions : un bug bloquant (noté dans `BUGS.md`) ou une demande du client marquée « urgent » (journal du §8).
- Rien d'inachevé n'est présenté comme « à tester ».

## Rôles
- **La session locale est le producteur.** Elle est seule à écrire sur `main`. Elle lance l'agent du bon poste (`.claude/agents/`), jamais un généraliste,
  et ne produit pas elle-même d'assets ni de fonctionnalités.
- Le directeur artistique et le QA valident avant chaque intégration.
- **Une session cloud n'écrit jamais sur `main`**, seulement sur `liaison`. Elle n'a pas de carte graphique : elle ne juge ni le rendu ni les FPS.
- Le client est le directeur du jeu, seul décideur.

## Commandes (Windows : `npm.cmd`, pas `npm`)
- `npm.cmd run dev` : serveur de développement (port 5173).
- `npx.cmd tsc --noEmit`, `npm.cmd test` (vitest), `npm.cmd run build`.
- Tests de jeu : `node tools/village-test.cjs`, `montagne-test.cjs`, `acces-test.cjs`, `combat-test.cjs`, `foret-test.cjs`, `terrain-qa.cjs`.
- Captures et mesures : `node tools/shot.cjs` et `node tools/perf.cjs`.
- **Toujours sur la RTX** : la ligne « rendu : » de `shot.cjs` doit montrer la NVIDIA, pas l'Intel. Portable branché sur secteur.
- Blender : `.venv-blender\Scripts\python.exe` (bpy 5.3), exécution locale uniquement. `blender-asset-qa` est obligatoire avant de livrer un asset.

## Pièges
- Redémarrer Vite après une fusion qui touche `physics.ts` ou `heightmap.ts`.
- Arrêter un serveur par son port, jamais en tuant tous les `node.exe`.
- Comparer les FPS côte à côte, dans les mêmes conditions, jamais à d'anciens chiffres.

## Fin de session
- Compte rendu au format du §9 de PLAN-STUDIO, au client et dans `LIAISON.md` (message LOCAL, poussé sur `liaison` uniquement).
- Tableau du §8 à jour, mémoire à jour.

## Interdits
- Copier un jeu existant (nom, personnages, art, niveaux) : on s'inspire, on ne copie jamais.
- Tout est en français : jeu, code, commentaires, documents, conversation.
- Chaque commit se termine par la ligne d'attribution.
- Les références de `docs/references/prive/` ne vont jamais dans le dépôt (droits).
