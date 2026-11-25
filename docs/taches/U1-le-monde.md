# Fiche — Alpha U1 « Le monde » (première Alpha sous Unreal 5, décidée par le client le 2026-11-25)

## Objectif (une phrase)
Le client parcourt l'île entière de 8 km dans Unreal, de jour et de nuit, avec le capybara provisoire. Le relief est grossier, mais la nuit est lisible et le jeu tient au moins 45 images par seconde.

## Ce qui sera fait (dit au client)
1. Un projet Unreal neuf `CapyWorld-UE`, hors du dépôt, découpé en zones chargées à la demande (World Partition). La forêt de la preuve reste à part.
2. Le relief cuit du jeu Three.js (`public/assets/terrain/`, produit par `tools/terrain/gen_terrain.py`) est exporté en carte de hauteur 16 bits, puis importé comme Landscape Unreal. Le pas est de 2 m, avec la grille fine de Capyville si le Landscape le permet.
3. Le sol reçoit un matériau simple par grandes surfaces (herbe, roche, sable, neige), d'après la carte des surfaces existante. Pas de végétation, ou très peu.
4. Les lacs, la mer et les rivières sont posés en eau simple. Les routes et les régions sont marquées au sol pour se repérer.
5. Le capybara provisoire de la preuve est repris, avec des collisions et une caméra à hauteur de capybara. Un menu « Aller à » permet de se téléporter vers les régions.
6. Le jour, la nuit et la nuit lisible : lune froide, exposition réglée, cause des saccades de la preuve trouvée et corrigée.
7. Le jeu est empaqueté en exécutable Windows, lancé d'un double-clic. On mesure son poids et son temps de chargement.

## Postes mobilisés
| Poste | Rôle |
| --- | --- |
| `unreal-monde` (fiche `.claude/agents/unreal-monde.md`, qui fait aussi l'export du relief, en lecture seule sur `tools/terrain/`) | Landscape, World Partition, matériaux, lumière, empaquetage |
| `terrain-artist` | en appui, seulement si l'export du relief bloque |
| `directeur-artistique` | nuit lisible, lecture des distances |
| `qa-testeur` | parcours de l'île, collisions, mesures |

## Critères d'acceptation (tous obligatoires)
- [ ] Le relief Unreal est fidèle au relief Three.js : écart de hauteur ≤ 0,5 m sur 20 points de contrôle (villes, cols, sommets, rives). Preuve : tableau.
- [ ] Toute l'île se parcourt à pied, sans trou ni chute sous le sol. Le menu « Aller à » mène à chaque région. Preuve : captures de 8 régions.
- [ ] La nuit est lisible hors de toute lanterne, avec une lune froide, et notée ≥ 3,5/5 en « valeurs » par le DA. Preuve : captures.
- [ ] En 1920×1080 sur la RTX 5060, sur secteur : ≥ 45 images/s de moyenne au sol et ≥ 35 en p95, de jour comme de nuit. Preuve : tableau.
- [ ] L'éditeur ne dépasse pas la mémoire physique (16 Go) pendant le travail : imports par lots, textures 2K si le 4K ne se voit pas. Preuve : relevés.
- [ ] Le jeu est un exécutable Windows qui se lance d'un double-clic. Preuve : poids, temps jusqu'à la première image.
- [ ] Le projet se reconstruit depuis les scripts versionnés dans le dépôt (`unreal/`), à partir des seules sources. Preuve : reconstruction de zéro.
- [ ] La licence de chaque asset est notée, et elle autorise la vente du jeu.

## Hors-périmètre
- Le village au propre (U2), la forêt de la preuve (U3), la végétation dense.
- Le gameplay, les quêtes, le capybara final, le son.

## Durée
Une à deux sessions. Si le Landscape de 8 km ne tient pas en 16 Go, on le dit tout de suite, puis on passe en tuiles plus grossières ou en zones séparées, avec l'accord du client.
