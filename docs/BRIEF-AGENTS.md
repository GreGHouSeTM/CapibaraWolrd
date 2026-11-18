# Brief commun à tous les agents spécialistes de Capy World

Tu fais partie d'une équipe d'agents, **un par spécialité** (`docs/EQUIPE.md`), qui construit **Capyville**, le village de départ
de « Capy World » : un jeu open world en Three.js r170 (WebGL2, Vite, TypeScript) pour une fille de 9-12 ans, héros capybara.
Le client veut un rendu **le plus réaliste et détaillé possible** ; ses images de référence sont dans `docs/references/`
(regarde-les toutes avec l'outil Read : c'est la cible). Ne copie aucun jeu existant.

## À lire avant de coder (dans cet ordre)
1. `docs/BIBLE-CAPYVILLE.md` (bible du Lead open world : plan coté, relief, chemins, architecture, décor, lumière, gameplay,
   budget, **§13 : ta liste de production priorisée**). Elle s'impose à tous.
2. `src/world/zones.ts` : données partagées du plan (bâtiments, chemins, torrent, ponts, champs, nids d'ennemis, PNJ, véhicules…).
   Lis-les, ne les modifie pas (sinon signale-le dans ton compte rendu).
3. `docs/QUALITE-CAPYVILLE.md` : charte visuelle, chaîne de production (Blender `bpy` 5.3 installé dans `.venv-blender` ;
   Poly Haven CC0), budget, grille de qualité.
4. Le code existant de ton domaine (voir `docs/EQUIPE.md` pour tes fichiers).

## Outils et conventions du projet
- Monde : `src/world/heightmap.ts` (`heightAt`, `normalAt`), `src/world/physics.ts` (`addBox(x,z,w,d,y0,y1,rot,walkTop)` —
  **rot physique = −rotation.y Three.js** —, `addCircle`, `groundAt`, `resolveCircle`), `src/world/grass.ts` (`paveRect`,
  `paveCircle` retirent l'herbe), `src/world/registry.ts` (`addLightSpot`, `addSmokeSpot`), `src/procgen/kit.ts`
  (`Batch` : fusion par matériau, `std`, `planarUV`, `nightMaterials` + `userData.emissiveBoost/baseEmissive` pour les émissifs nocturnes),
  `src/core/assets.ts` (`pbr(name, {scale})`, textures CC0 de `public/assets/tex/`).
- Modèles 3D : `.glb` dans `public/assets/models/` ; scripts Blender relançables dans `tools/blender/` ; scripts Poly Haven dans
  `tools/polyhaven/` (API : `https://api.polyhaven.com/assets?type=models`, `https://api.polyhaven.com/files/<id>` ; télécharge avec `curl`).
  Chargement : `GLTFLoader` (three/examples/jsm). Instancie ce qui se répète. Respecte le budget de la bible.
- Le jeu a un mode test : `?manual&q=low|medium|high` ; `window.__game.startPlay()`, `window.__game.step(n, dt)` (avance et rend
  la dernière image), `window.__game.frame(dt, false)` (avance sans rendu), `g.teleport(vec3, '')`, `g.rig.override = {pos, look}`.
- Commentaires, textes et noms affichés en **français**.

## Méthode de travail (obligatoire)
- Tu es dans un **worktree git isolé** (PC Windows du client, PowerShell). À la racine du worktree, relie les dépendances :
  `New-Item -ItemType Junction -Path node_modules -Target L:\CLAUDE\CapyWorld\node_modules`.
- Serveur : `npx vite --port <ton port> --strictPort` en arrière-plan (port donné dans ta mission).
- Captures : `node tools/shot.cjs <port> <dossier> medium <vues>` (taille par `$env:W`, `$env:H` ; vues dans `tools/shot.cjs`,
  ajoutes-en si besoin). Chromium tourne sur la **carte graphique** (GTX 1080 Ti) : captures rapides, FPS fiables
  (`node tools/perf.cjs <port> low,medium,high <vues>`). Lance toujours Chromium via les outils de `tools/` : ils passent par
  `tools/browser.cjs`, qui garantit **un seul navigateur à la fois** pour toute l'équipe (verrou) ; ferme-le toujours.
- Blender : `L:\CLAUDE\CapyWorld\.venv-blender\Scripts\python.exe <script>` (Python 3.13 + bpy 5.3), **un seul processus
  Blender lourd à la fois** ; compression meshopt : `tools/polyhaven/node_modules/.bin/gltfpack`.
- Regarde tes captures (Read), compare-les aux références et à la bible, critique honnêtement, itère.
- Avant de finir : `npx tsc --noEmit -p .`, `npx vitest run`, `npm run build` verts ; aucune erreur console (affichée par shot.cjs).
- Commits dans ton worktree, terminés par :
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  **Pas de `git push`.** Ne modifie pas les fichiers des autres spécialités ; si un petit branchement est indispensable
  (ex. dans `src/game.ts` ou `src/world/world.ts`), fais un bloc court et commenté à ton nom de spécialité.
- Garde les fichiers binaires raisonnables (modèles et textures du village < 80 Mo au total pour toute l'équipe).

## Compte rendu attendu (ton dernier message)
Branche et dernier commit ; fichiers créés/modifiés ; ce qui est fait par rapport à ta liste §13 et à la grille (honnêtement) ;
chemins absolus des captures finales ; chiffres de performance ; points d'intégration et d'API pour les autres spécialités.
