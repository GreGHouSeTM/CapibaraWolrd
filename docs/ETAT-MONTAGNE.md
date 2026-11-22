# État du chantier Montagne (agent Montagne, branche `wip/montagne`)

Mis à jour à chaque commit, pour pouvoir reprendre si le quota coupe.

## Partie A — dossier `docs/MONTAGNE-AURORE.md`
- **Fait** et envoyé ; décisions du client du 2026-11-22 reportées au §9 (Pic 1 250 m en (-2600, 520), manteau d'hiver au lieu de la bergère,
  aucun dégât de froid hors survie, Pierre-Vapeur au sommet, chutes douces, escalade sur barres marquées).
- Figures : `docs/montagne/*.png` ; script `tools/montagne/analyse_massif.py`.

## Partie B — se déplacer en montagne
- **Fait** : règles `src/gameplay/mountain.ts` (pente, glissade, escalade, endurance, chute, chaleur, crochet survie),
  branchement `src/gameplay/player.ts`, sources de chaleur `src/gameplay/heat.ts`, HUD `src/ui/mountain-hud.ts` + `mountain.css`
  (anneau d'endurance, jauge de chaleur, givre, souffle, poudre de glissade, fondu), bloc `// --- MONTAGNE ---` dans `src/game.ts`.
- Tests : `tests/mountain.test.ts` (15 tests verts), `tools/montagne-test.cjs` (navigateur).
- En cours : vérification village-test, acces-test, combat-test, montagne-test ; FPS (vue place, Moyenne) contre main.

## Reprise
Relancer les tests navigateur (serveur `npx vite --port 5183 --strictPort`), mesurer les FPS, compte rendu.
