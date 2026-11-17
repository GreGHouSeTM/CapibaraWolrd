# Équipe de développement de Capy World (un agent par spécialité)

Le chef de projet (session principale) répartit le travail, fixe la base commune, intègre les branches,
valide les captures contre `docs/QUALITE-CAPYVILLE.md` et pousse sur `main`.
Le **Lead open world & level design** est la référence artistique : sa bible `docs/BIBLE-CAPYVILLE.md`
s'impose à tous, et il relit les captures de chaque passage.

| Vague | Spécialité | Fichiers dont l'agent est propriétaire |
| --- | --- | --- |
| 0 | Lead open world & level design | `docs/BIBLE-CAPYVILLE.md`, `src/world/zones.ts` |
| 1 | Terrain & relief | `src/world/heightmap.ts`, `src/world/terrain.ts` |
| 1 | Végétation | `src/world/vegetation.ts`, `src/world/grass.ts`, `src/procgen/flora/**` |
| 1 | Modélisation Blender (bâtiments) | `tools/blender/buildings/**`, `public/assets/models/buildings/**` |
| 1 | Intégration village (placement, collisions) | `src/regions/hub.ts`, `src/procgen/village/**` |
| 1 | Assets photoscannés Poly Haven | `tools/polyhaven/**`, `public/assets/models/nature/**`, `public/assets/models/props/**`, `src/core/models.ts` |
| 1 | Textures & matériaux | `public/assets/tex/**`, `tools/textures/**`, `src/procgen/materials.ts`, `src/core/assets.ts` |
| 1 | Lumière & atmosphère | `src/world/sky.ts`, `src/core/postfx.ts`, `src/core/quality.ts`, `src/fx/lights.ts` |
| 1 | Combat (joueur) | `src/gameplay/combat.ts`, `src/ui/hearts.ts`, blocs `// --- COMBAT ---` de `src/game.ts` |
| 2 | Routes & chemins | `src/world/roads.ts`, `src/world/layout.ts` (routes) |
| 2 | Décor & accessoires | `src/procgen/village/props*.ts` |
| 2 | Effets visuels | `src/fx/**` (sauf lights.ts) |
| 2 | Eau | `src/world/water.ts`, `src/procgen/flora/aquatic.ts` |
| 2 | Ennemis & faune | `src/actors/enemies.ts`, `src/world/fauna.ts` |
| 2 | Rig & animation Blender (capybara) | `tools/blender/capybara/**`, `public/assets/models/capybara.glb`, `src/actors/capybara.ts` |
| 2 | Audio | `src/core/audio.ts` |

Règles communes : charte de `docs/QUALITE-CAPYVILLE.md` et bible du lead ; worktree isolé ; serveur Vite sur un port
propre ; captures uniquement via `tools/shot-lock.sh` (un seul navigateur à la fois) ; `tsc`, `vitest` et `build` verts ;
commentaires et textes en français ; aucun `git push` (le chef de projet intègre).
