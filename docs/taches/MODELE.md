# Fiche d'étape <alpha> — <titre> (modèle, PLAN-STUDIO §4)

> Copier ce fichier en `docs/taches/<alpha>.md` (par exemple `0.2.md`) au lancement de l'étape, puis une fiche par poste :
> `docs/taches/<alpha>-<poste>.md`.

## Objectif (une phrase)

## Ce qui sera fait cette session (5 lignes, dites au client)

## Postes mobilisés
| Poste | Fiche de tâche | Worktree / branche / port |
| --- | --- | --- |

## Critères d'acceptation (tous obligatoires, avec la preuve attendue)
- [ ] … — preuve : capture / mesure / test

## Hors-périmètre (à ne surtout pas faire pendant cette étape)

## Références et vues de capture
- Références : `docs/references/...`
- Vues `tools/shot.cjs` : …

## Budgets (PLAN-STUDIO §6)
| Mesure | Avant (Alpha précédente) | Budget | Après |
| --- | --- | --- | --- |
| FPS Moyenne 1600×900 au sol | | ≥ 50 | |
| FPS vue lointaine | | ≥ 35 | |
| Appels de dessin au sol / lointain | | ≤ 700 / ≤ 1 500 | |
| Triangles au sol / lointain | | ≤ 3 M / ≤ 8 M | |
| Téléchargé au démarrage du monde | | ≤ 60 Mo | |
| Poids de `dist/` | | +10 % max sans justification | |
| Erreurs console | | 0 | |

## Revue DA, QA, intégration
- DA : notes /5 par vue, 3 corrections prioritaires.
- QA : scénarios, bugs ouverts (`BUGS.md`), verdict.
- Intégration : commit, tag, `VERSIONS.md`.

## Clôture
- Tableau d'avancement (PLAN-STUDIO §8) mis à jour.
- Mémoire et message LOCAL dans `LIAISON.md` (modèle §9).
