# Alpha U1 « Le monde » : compte rendu intermédiaire (démo jouable), poste unreal-monde, 2026-11-26

Première passe, arrêtée à la demande du producteur pour que le client joue. La nuit en jeu, l'empaquetage et les mesures complètes viennent
en seconde passe. État et reprise : `docs/ETAT-U1.md`.

## Jouer
`C:\Users\greg7\Documents\CLAUDE\CapyWorld-UE\Jouer-U1.bat` (éditeur Unreal fermé). Jeu non cuit, plein écran 1920×1080.
ZQSD/WASD + souris ; Maj : courir ; Espace : sauter ; 1 à 8 : aller à Capyville, Paris, New York, Londres, Désert, Japon, Pôle Nord,
col des Aurores (Pic de l'Aurore) ; Tab : liste ; Alt+F4 : quitter. Le capybara est provisoire (sphères), c'est écrit à l'écran.

## Critères de la fiche
- [x] Relief fidèle : écart max **0,128 m** sur 20 points (7 villes, 4 cols, 5 sommets, 4 rives), lancer de rayon sur la collision du
  Landscape contre `heightAt` du jeu exécuté tel quel. Preuve : `docs/u1/points-controle.md` (+ `.json`).
- [ ] Parcours de toute l'île et captures des 8 régions : menu « Aller à » en place ; captures et parcours automatique en seconde passe.
- [ ] Nuit lisible : réglage fait dans l'éditeur (lune froide, ciel bleu nuit, exposition fixe), pas encore basculable en jeu ni noté par le DA.
- [ ] ≥ 45 FPS jour et nuit : premier chiffre, jour à Capyville, 1920×1080 plein écran, Épique, Lumen RT : **61 FPS de moyenne, p95 16,7 ms
  (60 FPS), GPU 13,7 ms**, 1 image > 50 ms sur 11 s. Preuve : `docs/u1/mesures/demo-capyville-jour.csv`. Campagne complète à faire.
- [x] Mémoire de l'éditeur : pic de mémoire de travail **5,6 Go** (import du Landscape), mémoire privée engagée max 14,6 Go (sur 16 Go
  physiques + fichier d'échange). Preuve : `docs/u1/mesures/memoire-editeur.csv` (relevé toutes les 5 s, `unreal/outils/memoire.ps1`).
- [ ] Exécutable empaqueté : pas encore (le `.bat` lance le jeu non cuit). Chargement de la carte 0,75 s ; jeu complet ≈ 14 s jusqu'à la
  première image (lancement 21:41:10, « Starting Game » 21:41:22, carte chargée 21:41:22,8).
- [~] Reconstruction depuis `unreal/` : tous les scripts et l'ordre sont écrits (`docs/ETAT-U1.md`) ; reconstruction de zéro pas encore rejouée.
- [x] Licences : tout est CC0 (liste plus bas).

## Capture
`docs/u1/captures/demo-capyville-jour.png` (jeu autonome lancé par `Jouer-U1.bat`, 1920×1200 de l'écran ; WebP à produire).

## Licences (CC0 1.0, vente autorisée)
- Poly Haven via le jeu (`public/assets/tex`, 1K) : herbe, sable, neige, asphalte, chemin de terre, mousse de sous-bois.
- Poly Haven `rock_face_03` (Dario Barresi, Rico Cilliers), https://polyhaven.com/a/rock_face_03 ; ambientCG `Ground037`,
  https://ambientcg.com/view?id=Ground037 (sources 4K de la preuve, ramenées à 2K).
- Fait maison : relief et masques (export du jeu), eau, matériaux HLSL, capybara provisoire. Moteur : ciel, nuages, formes de base.

## Problèmes
- 3 plantages de l'éditeur, causes exactes et correctifs dans `docs/ETAT-U1.md` (macro HLSL mal formée ; écriture de graphe refusée puis annulée).
- Rivières : coutures visibles sur l'eau (rubans qui se chevauchent aux méandres). Le Landscape est toujours chargé en entier (pas de HLOD).
- Le nom de région passe par PrintString : il disparaîtra dans un empaquetage Shipping (à porter dans le HUD).

## Idées
- Un mode « vue de capybara » avec légère profondeur de champ ; une lanterne portée la nuit (déjà proposée par la preuve).
