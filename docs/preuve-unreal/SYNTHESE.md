# Preuve Unreal 5 : synthèse du producteur (2026-11-25)

Pièces : compte rendu du poste `unreal-preuve` (`COMPTE-RENDU.md`), revue du DA (`REVUE-DA.md`), planche publique `planche-threejs-unreal.jpg`.
La planche à 3 colonnes avec les références reste hors du dépôt (`docs/references/prive/planche-preuve-unreal.jpg`, droits).

## Conditions
- RTX 5060 Laptop, sur secteur, le même jour (nuit du 24 au 25 novembre), un moteur à la fois.
- La démo Three.js a été mesurée éditeur Unreal fermé.
- Three.js : démo `?demo=foret`, qualité `max`, Chrome sur la RTX (ANGLE D3D11), `tools/perf.cjs` (120 images, chaque image terminée sur le GPU).
- Unreal 5.9 :
  - jeu autonome non cuit (`-game`), plein écran, scalabilité Épique ;
  - Lumen en ray tracing matériel, ombres virtuelles, Nanite, TSR ;
  - 40 s de profil CSV.
- Mêmes sources CC0 (Poly Haven, ambientCG), même relief, même dispersion (mêmes graines).

## Images par seconde (FPS moyen, avec le p95 du temps d'image entre parenthèses)
| Vue | Three.js max 1600×900 | Unreal 1600×900 | Three.js max 1920×1080 | Unreal 1920×1080 | Unreal 1920×1080, TSR 67 % |
| --- | --- | --- | --- | --- | --- |
| Jour | 37,4 (28,7 ms) | 45,6 (22,5 ms) | 31,3 (34,1 ms) | 34,0 (29,4 ms) | 48,4 (21,2 ms) |
| Nuit | 30,2 (33,8 ms) | 40,5 (42,3 ms) | 25,3 (41,1 ms) | 30,4 (52,6 ms) | non mesuré |
| Marche de jour | — | — | — | 39,0 (28,4 ms) | — |

- À qualité maximale, sur ce PC, **Unreal est au moins aussi rapide que Three.js**, avec un rendu bien plus riche. Il a en plus une réserve que Three.js n'a pas : l'image est rendue en plus petit puis agrandie (TSR à 67 %), ce qui fait +40 % de FPS.
- Point noir d'Unreal : la nuit a des pointes régulières, qui font tomber le p95 à 19 FPS en 1080p. Cause non analysée, peut-être les ombres de la lanterne ou le brouillard éclairé.
- Le compteur affiché sur les captures Three.js (11 à 24 FPS) n'est pas une mesure : il tourne pendant la simulation forcée de la capture. Le chiffre qui fait foi est celui de `perf.cjs`.

## Mémoire, chargement, poids
| | Three.js max | Unreal |
| --- | --- | --- |
| Mémoire vidéo | +3,3 Go (4,2 Go au total sur la carte) | 4,4 à 4,7 Go |
| Mémoire vive | ≈ 3,7 Go (Chrome) | ≈ 3,7 Go (jeu) ; éditeur 5 à 7,6 Go, jusqu'à 21 Go engagés pendant les imports 4K |
| Chargement | 3,1 s jusqu'au menu (serveur de dév., cache chaud) | ≈ 25 s jusqu'à la première image (non cuit) ; éditeur 43 s à froid, 17 s à chaud |
| Poids | démo 97 Mo d'assets web | projet 4,2 Go (2,1 Go de Content) ; exécutable non empaqueté, poids inconnu |

## Notes du DA (/5, face aux références)
| | Forme | Valeurs | Couleur | Détail | Lumière | Moyenne |
| --- | --- | --- | --- | --- | --- | --- |
| Three.js jour | 2,5 | 2 | 2,5 | 2 | 2 | **2,2** |
| Three.js nuit | 2 | 2,5 | 2 | 1,5 | 2 | **2,0** |
| Unreal jour | 3 | 3 | 2,5 | 3,5 | 3,5 | **3,1** |
| Unreal nuit | 2,5 | 2 | 2,5 | 2,5 | 3,5 | **2,6** |

Lecture du DA :
- Les défauts d'Unreal se corrigent tous par les assets et la direction artistique :
  - couleurs : épicéas trop jaunes, mousse trop saturée ;
  - forêt en « plantation » et sous-bois vide ;
  - nuit trop noire.
- Ceux de Three.js butent en partie sur le plafond du moteur : pas d'éclairage global, pas de brume éclairée, pas de reflets justes, densité limitée par WebGL.

## Coût de production
- Unreal :
  - forêt complète en **≈ 1 h 55** par un agent, tout piloté par MCP et Python ;
  - une seule intervention humaine : rebrancher le serveur MCP sur le bon éditeur ;
  - un plantage de l'éditeur, sans perte ;
  - deux cadrages ratés « à l'aveugle » (nuit au cadrage de la référence, sol à 10 m).
- La démo Three.js, moins bien notée, a demandé plusieurs sessions.
- À la main, il resterait : cadrer en regardant, peindre les masques du sol, animer le personnage, profiler.

## Ce que la preuve ne dit pas encore
- Rien n'est empaqueté : ni exécutable, ni son poids, ni son temps de chargement réel.
- Le monde de 8 km n'est pas testé dans Unreal (World Partition, streaming).
- Le personnage est fait de sphères, non animé, et le portage du gameplay n'est pas chiffré.
- 16 Go de mémoire vive suffisent tout juste :
  - l'éditeur a dépassé la mémoire physique pendant les imports ;
  - il faut fermer l'éditeur pour mesurer le jeu.

## Recommandation du producteur
**Passer sous Unreal 5, si le jeu se joue sur ce PC (ou un PC de jeu équivalent), et non dans un navigateur.**
- L'ambition fixée par le client (« le maximum du photoréalisme », un vrai open world de 8 km) est hors de portée de Three.js :
  - en qualité max, la démo est déjà à 31 FPS en 1080p sans éclairage global ;
  - le DA y voit des plafonds du moteur.
- Unreal fait mieux dès un premier jet de 2 h, aussi vite sur la même carte, et tout ce qui manque se corrige par des assets et du travail artistique.
- Prix à payer :
  - le jeu ne s'ouvre plus dans un navigateur : il faut installer un exécutable sur un PC équipé d'une carte graphique récente ;
  - l'Alpha 0.1 (village, monde, gameplay) est à porter, et le plan de studio à réécrire avec le client avant tout nouveau chantier ;
  - 32 Go de mémoire vive sont fortement conseillés pour produire sereinement ;
  - les assets Fab (Megaplants gratuits) demandent d'accepter la licence Fab au nom du client.
- **Si le navigateur est indispensable**, on garde Three.js. On reprend l'Alpha 0.2 avec les leçons d'Unreal : exposition fixe, brouillard plus dense, couleurs refroidies, mousse désaturée, végétation basse. Le plafond reste celui noté par le DA.

Décision : au client.
