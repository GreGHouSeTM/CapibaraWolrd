// Export de world-map.ts en JSON pour le générateur Python (spécialité Terrain & relief).
// Usage : node tools/terrain/export-map.mjs   (Node ≥ 23 lit directement le TypeScript sans types particuliers)
import { mkdirSync, writeFileSync } from 'node:fs';
const m = await import('../../src/world/world-map.ts');
mkdirSync(new URL('./cache/', import.meta.url), { recursive: true });
writeFileSync(new URL('./cache/world-map.json', import.meta.url), JSON.stringify(m));
console.log('world-map.json écrit');
