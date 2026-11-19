// Chargement du relief cuit dans les tests (lecture directe de public/assets/terrain/).
// @ts-expect-error : le projet n'embarque pas les types de Node (tests seulement)
import { readFile } from 'node:fs/promises';
import { loadTerrainData } from '../../src/world/terrain-data';
import { bakeWorld } from '../../src/world/heightmap';

let ready: Promise<void> | null = null;
export function loadTestTerrain() {
  ready ??= (async () => {
    await loadTerrainData(async (p) => {
      const b = await readFile(new URL(`../../public/assets/terrain/${p}`, import.meta.url));
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    });
    bakeWorld();
  })();
  return ready;
}
