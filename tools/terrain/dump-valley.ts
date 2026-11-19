// Extraction de la vallée de Capyville depuis le relief d'origine (spécialité Terrain & relief).
// Usage : npx vite-node tools/terrain/dump-valley.ts
// Exécute la cuisson figée (tools/terrain/legacy/heightmap.ts, monde de 3,2 km) et écrit dans tools/terrain/cache/ :
//   - valley-detail.f32 : grille fine de la vallée (pas de 0,5 m, emprise DETAIL de valley.ts), float32 petit-boutiste ;
//   - valley-ref.f32    : ancien heightAt au pas de 2 m sur [-1000, 1000]² (1001 × 1001), pour le masque de la simulation ;
//   - valley-meta.json  : emprises et tailles.
// À relancer si zones.ts ou valley.ts changent, puis relancer tools/terrain/gen_terrain.py.
import { mkdirSync, writeFileSync } from 'node:fs';
import { bakeWorld, detailHeights, heightAt } from './legacy/heightmap';
import { DETAIL, DETAIL_NX, DETAIL_NZ } from '../../src/world/valley';

const out = new URL('./cache/', import.meta.url);
mkdirSync(out, { recursive: true });
const t0 = performance.now();
bakeWorld();
console.log(`cuisson d'origine : ${Math.round(performance.now() - t0)} ms`);

writeFileSync(new URL('valley-detail.f32', out), Buffer.from(detailHeights.buffer));

const R = 1000, STEP = 2, N = R / STEP * 2 + 1;
const ref = new Float32Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) ref[j * N + i] = heightAt(-R + i * STEP, -R + j * STEP);
writeFileSync(new URL('valley-ref.f32', out), Buffer.from(ref.buffer));

writeFileSync(new URL('valley-meta.json', out), JSON.stringify({
  detail: { ...DETAIL, nx: DETAIL_NX, nz: DETAIL_NZ },
  ref: { x0: -R, z0: -R, cell: STEP, n: N },
}, null, 1));
console.log('écrit :', DETAIL_NX, '×', DETAIL_NZ, 'et', N, '×', N);

// Tracés des couloirs des cols et sommets de la couronne (pour le raccord du monde à la vallée)
import { COL_ROUTES } from '../../src/world/valley';
import { PEAKS, COLS } from '../../src/world/zones';
writeFileSync(new URL('valley-routes.json', out), JSON.stringify({ routes: COL_ROUTES, peaks: PEAKS, cols: COLS }));
