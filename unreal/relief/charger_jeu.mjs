// Charge le vrai code du relief du jeu Three.js (src/world/*.ts) dans Node, sans le modifier :
// ce crochet ajoute l'extension .ts aux imports sans extension et traduit le TypeScript par esbuild (dépendance de Vite du dépôt).
import { registerHooks, createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
export const DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const esbuild = createRequire(import.meta.url)(path.join(DEPOT, 'node_modules', 'esbuild'));
registerHooks({
  resolve(spec, ctx, next) {
    if ((spec.startsWith('.') || spec.startsWith('/')) && !path.extname(spec) && ctx.parentURL?.startsWith('file:')) {
      const base = path.resolve(path.dirname(fileURLToPath(ctx.parentURL)), spec);
      for (const c of [base + '.ts', path.join(base, 'index.ts')]) if (existsSync(c)) return next(pathToFileURL(c).href, ctx);
    }
    return next(spec, ctx);
  },
  load(url, ctx, next) {
    if (url.startsWith('file:') && url.endsWith('.ts')) {
      const f = fileURLToPath(url);
      const code = esbuild.transformSync(readFileSync(f, 'utf8'), { loader: 'ts', format: 'esm', sourcefile: f }).code;
      return { format: 'module', shortCircuit: true, source: code };
    }
    return next(url, ctx);
  },
});
const TERRAIN = path.join(DEPOT, 'public', 'assets', 'terrain');
const mod = (p) => import(pathToFileURL(path.join(DEPOT, p)).href);
/** Charge le relief cuit et prépare heightAt exactement comme le jeu (loadTerrainData puis bakeWorld). */
export async function chargerRelief() {
  const td = await mod('src/world/terrain-data.ts');
  const hm = await mod('src/world/heightmap.ts');
  const lecteur = async (p) => { const b = readFileSync(path.join(TERRAIN, p)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
  await td.loadTerrainData(lecteur);
  hm.bakeWorld();
  return { td: td.terrainData, hm, wm: await mod('src/world/world-map.ts'), lay: await mod('src/world/layout.ts'), valley: await mod('src/world/valley.ts') };
}
