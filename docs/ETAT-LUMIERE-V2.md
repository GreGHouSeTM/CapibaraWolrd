# État « Lumière v2 » (branche wip/lumiere-v2, worktree L:\CLAUDE\CapyWorld-lumiere)

Mission : lumière indirecte de la démo forêt (`?demo=foret&q=max`) dans le navigateur, GTX 1080 Ti.
Volets : 1) Three.js r187 + WebGPURenderer + post TSL (SSGI, SSR, TRAA, GTAO, brume) avec secours WebGL2 ;
2) sondes d'irradiance cuites (aube, midi, soir, nuit-lanterne) en fondu ; 3) réglages d'image face à la référence.

## Où on en est
- J1 en cours : three 0.170 → 0.187, @types/three 0.187, postprocessing 6.36.4 → 6.39.6, n8ao 1.9.3 → 2.1.0.
  `tsc` propre (seule correction : `isMatrix4` → `instanceof` dans `src/core/models.ts`).
- Les avertissements D3D « X3595 gradient instruction used in a loop » existaient déjà en r170 (mêmes nombres :
  1 sur le monde, 20 sur la démo) ; ce ne sont pas des erreurs.

## Mesures de référence (avant montée, = main 6021f69, GPU, 1600×900)
| Vue | Qualité | FPS |
| --- | --- | --- |
| place | medium | 33,4 |
| foret-jour | max | 34,6 |
| foret-nuit | max | 31,4 |
| foret-jour | high | 63,9 |
| foret-nuit | high | 39,2 |
Tests de base : village, combat, accès, forêt : tous verts ; vitest 43/43.

## Outils ajoutés
- `tools/lumiere/console.cjs <port> "<requête>"` : relevé des erreurs et avertissements de la console, moteur actif.

## Reprise
Serveur : `npx vite --port 5182 --strictPort` dans le worktree (s'arrête par son port).
