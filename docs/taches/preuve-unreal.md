# Fiche — Preuve Unreal 5 : la forêt au maximum du photoréalisme (écart au plan décidé par le client le 2026-11-25)

## Objectif (une phrase)
Donner au client les faits pour choisir le moteur : la même forêt que la démo Three.js, refaite dans Unreal 5 au maximum du photoréalisme,
comparée côte à côte en image, en FPS et en coût de production.

## Ce qui sera fait (dit au client)
1. Le client installe Unreal 5 et Visual Studio (compte Epic et licences à son nom), selon la liste ci-dessous.
2. Je relie Claude à l'éditeur par le serveur MCP d'Unreal, sur un projet neuf `CapyForet-UE` hors du dépôt du jeu.
3. Un agent dédié construit la forêt de jour et de nuit, à partir de zéro (aucune scène d'exemple d'Epic reprise telle quelle).
4. Mesures et captures sur la RTX 5060, aux mêmes cadrages que la démo Three.js et que les références.
5. Une planche « référence / Three.js / Unreal » et un tableau de chiffres, avec ma recommandation. Le client tranche.

## Prérequis sur le PC du client
- **Unreal Engine** : la dernière version 5.x du Epic Games Launcher qui contient le plugin `ModelContextProtocol`.
  Options d'installation : plateforme Windows seule, **sans** symboles de débogage de l'éditeur, sans les autres plateformes.
- **Visual Studio 2026 Community** (recommandé à partir d'Unreal 5.8 ; Visual Studio 2022 seulement pour une version d'Unreal plus ancienne) :
  charge de travail « Développement de jeux en C++ ». À recouper avec la page « Setting up Visual Studio » d'Epic pour la version installée.
- **Disque** : environ 100 Go libres après installation (157 Go libres le 2026-11-25). Projet et cache sur C:.
- **Limite connue** : 16 Go de mémoire vive, contre 32 Go recommandés pour l'éditeur en monde ouvert. On ne lance ni Blender ni la démo Three.js en même temps.

## Poste mobilisé
| Poste | Fiche | Emplacement |
| --- | --- | --- |
| `unreal-preuve` (technical artist Unreal : Nanite, Lumen, PCG, matériaux, éclairage), fiche de poste à créer dans `.claude/agents/` avant le lancement | cette fiche | projet `C:\Users\greg7\Documents\CLAUDE\CapyForet-UE`, hors du dépôt du jeu ; seuls les captures et le compte rendu entrent dans le dépôt |
| `directeur-artistique` | revue de la planche | — |

## Critères d'acceptation (tous obligatoires)
- [x] Mêmes vues que la démo Three.js (`?demo=foret`) et que les références `prive/nextgen/foret-escalier` (jour) et `foret-nuit-lanterne` (nuit) — preuve : planche à 3 colonnes.
- [x] La forêt se parcourt avec un personnage provisoire à la troisième personne, à hauteur de capybara — preuve : courte vidéo ou série de captures.
- [~] Mesures sur la RTX 5060, sur secteur, en 1600×900 et en 1920×1080 : FPS moyen et p95, mémoire vidéo, mémoire vive, temps de chargement, poids du projet et d'un exécutable — preuve : tableau.
- [x] Mêmes mesures pour la démo Three.js en Max, prises le même jour — preuve : tableau.
- [x] Notes /5 du DA sur la forme, les valeurs, la couleur, le détail et la lumière, pour les deux moteurs, face aux références.
- [x] Licence de chaque asset notée (CC0, licence standard Fab, Megascans…) — preuve : liste dans le compte rendu.
- [x] Coût de production mesuré : temps passé, ce que Claude pilote seul et ce qui demande l'intervention du client dans l'éditeur.

## Hors-périmètre
- Porter le jeu, le monde de 8 km, le gameplay ou le capybara final dans Unreal.
- Utiliser une scène d'exemple d'Epic : la comparaison doit porter sur ce que nous savons produire.
- Toucher à `main` ou aux branches du jeu en dehors du compte rendu et des captures.

## Durée
Une session. Si la preuve n'est pas concluante à 75 % du quota, on publie les mesures partielles et on le dit.

## Ce que la décision changera
- **Three.js gardé** : on reprend à l'étape 1 (Alpha 0.2), avec les leçons d'Unreal sur la lumière et les assets.
- **Unreal choisi** : le plan de studio est réécrit avec le client (portage, outils, postes) avant tout nouveau chantier.

## Bilan (2026-11-25)
- 6 critères sur 7 sont remplis.
- Les mesures sont partielles : il manque le poids et le chargement d'un exécutable empaqueté.
- La nuit est comparée au cadrage de la démo : le cadrage de la référence est raté dans Unreal.
- Synthèse et recommandation : `docs/preuve-unreal/SYNTHESE.md`. Décision du moteur : au client.
