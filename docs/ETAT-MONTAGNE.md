# État du chantier Montagne (agent Montagne, branche `wip/montagne`)

Mis à jour à chaque commit, pour pouvoir reprendre si le quota coupe.

## Partie A — dossier `docs/MONTAGNE-AURORE.md`
- **Fait** : dossier, figures `docs/montagne/plan-aurore.png` et `profil-aurore.png`, script `tools/montagne/analyse_massif.py`
  (relance : `PYTHONIOENCODING=utf-8 L:\CLAUDE\CapyWorld\.venv-blender\Scripts\python.exe tools/montagne/analyse_massif.py`).
- Recommandation : Pic à 1 250 m, sommet en (-2600, 520) ; questions au client au §9.

## Partie B — se déplacer en montagne
- Pas commencée. Plan : `src/gameplay/mountain.ts` (règles pures testables : pente, endurance, chute, chaleur),
  branchement dans `player.ts`, HUD (anneau d'endurance, givre), bloc `// --- MONTAGNE ---` dans `game.ts`, tests vitest + `tools/montagne-test.cjs`.

## Reprise
Attaquer la partie B (voir plan ci-dessus).
