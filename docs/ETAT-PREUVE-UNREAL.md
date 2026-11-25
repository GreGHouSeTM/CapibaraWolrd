# État de la preuve Unreal 5 « forêt » (poste unreal-preuve)

Projet : `C:\Users\greg7\Documents\CLAUDE\CapyForet-UE\CapyForet.uproject` (UE 5.9, hors dépôt). Fiche : `docs/taches/preuve-unreal.md`.
Captures et compte rendu : `docs/preuve-unreal/`. Les chemins `Outils\...` sont relatifs à `C:\Users\greg7\Documents\CLAUDE\CapyForet-UE\`.
Lancer un script dans l'éditeur : `node Outils\ue.cjs py Outils\py\<script>.py [args]` (ajouter `C:\Program Files\nodejs` au PATH).

Reprise (04:05) : PREUVE TERMINÉE. Compte rendu : `docs/preuve-unreal/COMPTE-RENDU.md`. 14 captures finales en jeu autonome dans
`docs/preuve-unreal/unreal-*.webp` (dont 2 cadrages ratés, signalés : nuit-cadrage-reference, sol-10m). Éditeur relancé et ouvert sur la carte
Foret avec MCP (PID 25276), tout sauvegardé. Suites possibles (non commencées) : refaire les 2 cadrages ratés (`cameras.py`, puis `captures.ps1`
éditeur fermé), corriger les pointes de la nuit, Megaplants si le client accepte la licence.
Relancer l'éditeur : `"C:\Users\greg7\Epic Games\UE_5.9\Engine\Binaries\Win64\UnrealEditor.exe" "C:\Users\greg7\Documents\CLAUDE\CapyForet-UE\CapyForet.uproject" -ModelContextProtocolStartServer`.

## Ce qui est fait
- Carte `/Game/Foret/Cartes/Foret` (jour) et sa copie `/Game/Foret/Cartes/Foret_Nuit` ; carte de démarrage de l'éditeur et du jeu.
- Relief et composition identiques à la démo Three.js : relief `terrain.bin` → maillages Nanite (0,25 m / 2 m), paroi et escalier de la démo,
  2 541 épicéas et ~7 400 objets placés par portage exact de `trees.ts` / `scatter.ts` (mêmes graines). Épicéas : Poly Haven fir_tree_01
  (2,3 à 4,2 M de triangles par arbre, aiguilles en vraie géométrie, Nanite) et fir_sapling_medium pour les jeunes.
- Matériaux par nœud HLSL (`Content\Python\capy_mat.py`) : sol 5 couches 4K avec mélange par hauteur, anti-répétition et déplacement Nanite
  (tessellation, 7 cm) ; paroi et escalier portés des shaders de la démo ; mousse sur le dessus des rochers ; feuillage deux faces ; eau.
- Jour couvert brumeux (Lumen GI + réflexions en ray tracing matériel, ombres virtuelles, brouillard volumétrique) ; nuit : lanterne Poly Haven
  avec vraie lumière ponctuelle à ombres et halo volumétrique, flaque dans une cuvette creusée dans le relief.
- Personnage provisoire `BP_CapyProvisoire` (formes simples, pas de mannequin Epic installé), caméra à ~0,85 m, ZQSD/WASD + souris.
- Mesures en jeu autonome (éditeur fermé) : voir tableau.

## Mesures (RTX 5060 portable 8 Go, i5-13420H, 16 Go, secteur ; 2026-11-25 ; UE 5.9 « -game » non cuit, plein écran, VSync coupée,
scalabilité Épique, Lumen HWRT, ombres virtuelles, Nanite, TSR ; 40 s de profil CSV après 8 s de chauffe ; `Outils\analyse_csv.cjs`)
| Scène | Résolution | Échelle d'écran | FPS moyen | p95 temps d'image | FPS au p95 | GPU moyen | RAM jeu (pic) | VRAM dédiée (pic) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Jour, cadrage démo | 1920×1080 | 100 % (TSR = anticrénelage seul) | 34,0 | 29,4 ms | 34,0 | 28,0 ms | 3,7 Go | 4,7 Go |
| Jour, cadrage démo | 1920×1080 | 67 % (TSR remonte à 1080p) | 48,4 | 21,2 ms | 47,2 | 19,5 ms | 3,6 Go | 4,4 Go |
| Jour, cadrage démo | 1600×900 | 100 % | 45,6 | 22,5 ms | 44,5 | 20,9 ms | 3,7 Go | 4,4 Go |
| Marche sur le sentier | 1920×1080 | 100 % | 39,0 | 28,4 ms | 35,3 | 23,7 ms | 3,7 Go | 4,7 Go |
| Nuit, lanterne et flaque | 1920×1080 | 100 % | 30,4 | 52,6 ms | 19,0 | 31,3 ms | 3,6 Go | 4,6 Go |
| Nuit, lanterne et flaque | 1600×900 | 100 % | 40,5 | 42,3 ms | 23,6 | 23,1 ms | 3,6 Go | 4,5 Go |
Autres chiffres : démarrage de l'éditeur sur la carte 42,9 s à froid, 17,4 s à chaud (chargement de la carte elle-même ~1 s, le reste en
streaming) ; jeu autonome : ~25 s jusqu'à la première image ; projet 4,2 Go (dont Content 2,1 Go ; sources téléchargées 1,9 Go hors Content) ;
éditeur : 5 à 7,6 Go de mémoire vive, jusqu'à 21 Go de mémoire engagée pendant les imports 4K. Pas d'exécutable empaqueté (voir compte rendu).
Mesures invalides écartées : jeu lancé éditeur ouvert (budget VRAM 2,5 Go, 2 FPS) et campagne en fenêtre bridée à 1536×960 (`Mesures\_fenetre_1536x960`).

## Ordre complet de reconstruction (si tout est perdu)
`nouvelle_carte.py` → `importer.py` (groupes de 3 : source, dossier, nom|-) → `importer_textures.py` → `fix_nor.py` → `mat_sol.py` → `mi_sol.py 0.62`
→ `mat_paroi.py` → `mat_modeles.py` → `scene_base.py` → `dispersion.py` → `nettoyer_dispersion.py` → `nuit.py` → `personnage.py` →
`personnage_mesure.py` → `capy_couleur.py` → `collisions.py` → `collisions_jeu.py` → `collisions_arbres.py` → `cameras.py` → `lumiere.py jour` →
`sauver.py` → `lumiere.py nuit` → `carte_nuit.py`. Hors éditeur : `telecharger.cjs`, `decompresser.cjs`, `terrain.cjs`, `disposition.cjs`.

## Pièges
- `unreal.Color(a, b, c, d)` est en ordre BGRA → toujours `unreal.Color(r=…, g=…, b=…, a=…)`.
- Ne jamais supprimer puis recréer un Blueprint du même nom dans la même session d'éditeur : plantage (assertion « Outer != nullptr »).
- Captures de l'éditeur : couper « Use Less CPU when in Background » (`editeur_reglages.py`), sinon rien ne se rend en arrière-plan.
  HighResShot dans le petit viewport PIE = rendu en tuiles (coutures) → captures finales en jeu autonome plein écran.
- Le jeu autonome doit tourner éditeur fermé (mémoire vidéo) et en `-fullscreen` (en fenêtre, Windows le bride à 1536×960).
- Le PlayerStart n'est pas retenu par le mode de jeu (« NO PLAYERSTART with positive rating ») : le personnage s'y téléporte au BeginPlay.
- Les maillages importés par glTF ont des collisions simples en boîte : arbres sans collision, rochers en enveloppes convexes, sol en collision complexe.
- WebP non importable dans UE 5.9 ; r.PathTracing=False (sinon 3 min de compilation au démarrage du jeu).

## Journal
- 02:09 lecture ; 02:12-02:20 sources ; 02:24 blocage MCP (éditeur sans projet) ; 02:31 débloqué par le producteur.
- 02:33-03:05 imports, matériaux, forêt, jour, nuit. 03:06 plantage éditeur (Blueprint recréé), relancé 03:07, rien perdu.
- 03:08-03:20 personnage. 03:22-03:46 mesures (1re tentative invalide, 2e en fenêtre bridée, 3e valide plein écran).
- 03:47-03:50 vues de référence, retouches (lichen des marches, rides de la flaque), copie de nuit ; captures finales.
