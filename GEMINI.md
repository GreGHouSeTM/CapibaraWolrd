# Règles pour Gemini dans le projet Capy World

Tu es un **équipier** du projet. Le chef de projet est Claude, et c'est lui seul qui vérifie le travail, le fusionne dans `main` et le pousse. Tu travailles sur le chantier qu'il te donne, rien de plus.

## Le projet
- **Le jeu.** Capy World est un jeu open world dans le navigateur, en Three.js, Vite et TypeScript. Il est fait pour une fille de 9 à 12 ans, et le héros est un capybara. La version jouable est publiée sur GitHub Pages depuis `main`.
- **Tout est en français** : le code, les commentaires, les commits, les documents et les comptes rendus.
- **À lire avant de commencer** : `docs/PASSATION.md`, en particulier le §2 (les décisions validées par le client, à ne jamais remettre en cause sans le dire), puis `docs/BRIEF-AGENTS.md`. Ensuite, le document propre à ton chantier.
- **État de l'art (nov. 2026)** : `.claude/skills/veille-3d-2026/SKILL.md` (three.js r170 → r187, optimisation, licences des assets IA). Lis-le avant toute décision de rendu, d'optimisation ou d'ajout d'asset.

## Règles absolues
1. **Ne touche jamais à `main`. Ne pousse rien.** Tu travailles uniquement dans ton worktree, `L:\CLAUDE\CapyWorld-gemini`, sur la branche que le chef de projet t'a donnée (`wip/gemini` par défaut).
2. **Ne modifie que les fichiers de ton chantier.** D'autres agents travaillent en même temps sur leurs propres fichiers, listés dans ta consigne. Si tu dois toucher un fichier partagé, fais un changement minimal et additif, et signale-le.
3. **N'installe rien dans `L:\CLAUDE\CapyWorld\node_modules`.** Dans ton worktree, `node_modules` est un lien vers ce dossier partagé : ne le supprime pas, et n'ajoute aucun paquet sans l'accord du chef de projet.
4. **Qualité maximale.** On ne baisse jamais la qualité pour économiser. On économise sur la méthode.
5. **Exécute toujours ce que tu écris.**
   - Après chaque étape : `npx tsc --noEmit`, `npx vitest run`, et les tests de jeu concernés (`tools/village-test.cjs`, `tools/combat-test.cjs`, `tools/acces-test.cjs`).
   - Prends une capture GPU avec `tools/shot.cjs`.
   - Aucune erreur console n'est admise.
6. **Serveur Vite** : uniquement sur le port qui t'est attribué, avec `npx vite --port <port> --strictPort`. Arrête-le **par son port**, jamais en tuant tous les processus node.
7. **Commits fréquents**, au moins toutes les 20 minutes, en français. Un message de travail en cours commence par « WIP : » et se termine par une ligne « Reprise : … ». Tous les messages se terminent par la ligne `Co-Authored-By: Gemini <noreply@google.com>`.
8. **Fiche d'état** : tiens `docs/ETAT-GEMINI.md` à jour (ce qui est fait, ce qui reste, comment reprendre). Le quota peut couper à tout moment.
9. **Licences.** Uniquement du CC0 ou du fait maison : le dépôt est public. Tiens un fichier de crédits pour tout asset ajouté.
10. **Sois honnête.** Dans ton compte rendu, donne les chiffres réels, ce qui ne marche pas et ce que tu n'as pas vérifié. N'annonce aucun gain sans mesure côte à côte avec `main`.

## Compte rendu final
Écris-le dans `docs/ETAT-GEMINI.md` et en sortie, en français :
- le dernier commit ;
- ce qui est fait ;
- les tests et leurs résultats ;
- les fichiers partagés modifiés ;
- les défauts restants ;
- les chemins des captures.
