// Exporte en JSON les données de src/world/zones.ts utiles à la modélisation (BUILDINGS, TORII, BRIDGES, MILL_WHEEL…).
// Usage : node tools/blender/buildings/dump_zones.mjs <sortie.json>
// zones.ts reste la seule source de vérité : les scripts Blender lisent ce JSON, ils ne recopient aucune cote.
import { build } from 'esbuild';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const out = process.argv[2] || path.join(here, '.cache', 'zones.json');

const res = await build({
  entryPoints: [path.join(root, 'src/world/zones.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
});
const code = res.outputFiles[0].text;
const mod = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const data = {
  BUILDINGS: mod.BUILDINGS,
  TORII: mod.TORII,
  TORII_TUNNEL: mod.TORII_TUNNEL,
  BRIDGES: mod.BRIDGES,
  MILL_POS: mod.MILL_POS,
  MILL_WHEEL: mod.MILL_WHEEL,
  VILLAGE_GATES: mod.VILLAGE_GATES,
};
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(data, null, 1));
console.log('zones ->', out, data.BUILDINGS.length, 'bâtiments');
