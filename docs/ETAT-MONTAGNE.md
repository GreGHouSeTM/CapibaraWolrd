# État du chantier Montagne (agent Montagne, branche `wip/montagne`)

Mis à jour à chaque commit, pour pouvoir reprendre si le quota coupe.

## Partie A — dossier `docs/MONTAGNE-AURORE.md`
- **Fait** et envoyé ; décisions du client du 2026-11-22 au §9 (Pic 1 250 m en (-2600, 520), manteau d'hiver au lieu de la bergère,
  aucun dégât de froid hors survie, Pierre-Vapeur au sommet, chutes douces, escalade sur barres marquées).
- Figures `docs/montagne/*.png` ; script `tools/montagne/analyse_massif.py`.

## Partie B — se déplacer en montagne
- **Fait** : `src/gameplay/mountain.ts` (règles : pente, glissade, escalade, endurance, chute, chaleur, crochet survie),
  `src/gameplay/player.ts` (branchement), `src/gameplay/trails.ts` (chemins tracés : ressauts toujours franchissables),
  `src/gameplay/heat.ts` (feux, lanternes, vapeurs), `src/ui/mountain-hud.ts` + `mountain.css` (anneau d'endurance, jauge de chaleur,
  givre, souffle, poudre de glissade, fondu), bloc `// --- MONTAGNE ---` de `src/game.ts` (cœurs, secousse de caméra, note).
- Manteau d'hiver : `Player.winterCoat` (drapeau de test `?manteau`). Mode survie : `Player.survival` + `onColdHurt`.
- Tests : `tests/mountain.test.ts` (15 verts) ; `tools/montagne-test.cjs` vert ; village-test et combat-test verts ;
  acces-test : un dernier blocage limite (bord de l'étang, fin du Tour de l'étang) corrigé par le plancher de vitesse sur les chemins (à revérifier).

## Reprise
Revérifier acces-test, mesurer les FPS (vue `place`, Moyenne) contre main (serveur de main sur 5184), compte rendu, arrêter les serveurs 5183 et 5184.
