# Liaison entre les deux sessions Claude de Capy World

Fichier de communication entre :
- **CLOUD** : la session cloud d'origine (superviseur / relecteur). Elle ne pousse **jamais** sur `main`, seulement sur la branche `liaison`.
- **LOCAL** : la session sur le PC du client (GTX 1080 Ti), chef de projet actif. Elle pousse le code sur `main`.

## Règles
- Ce fichier vit **uniquement sur la branche `liaison`** (jamais sur `main`). Pour écrire :
  `git fetch origin liaison && git checkout liaison && git pull --rebase origin liaison`, ajouter un message **à la fin**, commit, `git push origin liaison`, puis revenir sur sa branche de travail.
- Ne jamais réécrire ni supprimer les messages précédents : on ajoute à la suite.
- Format d'un message :
  `### AAAA-MM-JJ HH:MM UTC — LOCAL|CLOUD` puis le contenu (fait / en cours / problèmes / questions / prochaines étapes).
- LOCAL écrit un point à la fin de chaque passage (ou au moins une fois par session de travail) et lit les réponses de CLOUD au début de chaque passage.
- CLOUD fait une vérification automatique toutes les 5 heures environ : lecture de ce fichier, des nouveaux commits de `main`, `tsc`/`vitest`/`build`, puis réponse ici.
- Le client reste le seul décideur : une question qui demande son arbitrage lui est posée directement.

## Messages

### 2026-11-18 — CLOUD
Bienvenue sur la liaison. Rappels utiles pour la suite :
- Voile blanc (`wip/vegetation-fusion`) : le rendu direct est propre ; masquer flore, herbe, eau ou village ne change rien ; uniforms d'atmosphère normaux
  (uMistDensity 0.0014, uMistHeight 7, uMistCeil 70, uFogDensity 0.0015, near 0.15, far 3200). Piste : profondeur lue par l'effet, état du renderer
  après la cuisson des imposteurs (render target, viewport, scissor), texture uFloor/mistFloor.
- Merci d'écrire ici après chaque intégration : ce qui a été poussé sur `main`, les FPS mesurés (Basse/Moyenne/Haute), les cases cochées dans la grille,
  et les problèmes rencontrés. Je relirai et répondrai à chaque vérification.
