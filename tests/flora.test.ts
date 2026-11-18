// Contrôles de la végétation de Capyville (spécialité Végétation) : retraits de la bible autour des chemins,
// des bâtiments et de l'eau, forêts sur les pentes de la couronne, prairies de susuki sans arbres.
import { describe, it, expect, beforeAll } from 'vitest';
import { bakeWorld } from '../src/world/heightmap';
import { BUILDINGS, PATHS, TALL_GRASS_ZONES, pointAlong, FOREST_BELTS } from '../src/world/zones';
import { bakeFloraMask, canPlantTree, forestAt } from '../src/procgen/flora/capyville';

beforeAll(() => { bakeWorld(); bakeFloraMask(); }, 120000);

describe('végétation de Capyville', () => {
  it('aucun arbre à moins de 3 m d’un chemin', () => {
    for (const p of PATHS) {
      let len = 0;
      for (let i = 0; i < p.pts.length - 1; i++) len += Math.hypot(p.pts[i + 1][0] - p.pts[i][0], p.pts[i + 1][1] - p.pts[i][1]);
      for (let s = 0; s < len; s += 2) {
        const a = pointAlong(p.pts, s);
        for (const off of [0, p.width / 2 + 2.5]) expect(canPlantTree(a.x - a.dz * off, a.z + a.dx * off), p.id).toBe(false);
      }
    }
  });
  it('aucun arbre à moins de 5 m d’un bâtiment', () => {
    for (const b of BUILDINGS) {
      expect(canPlantTree(b.x, b.z), b.id).toBe(false);
      const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
      const lx = b.w / 2 + 4.5;
      expect(canPlantTree(b.x + lx * c, b.z - lx * s), b.id).toBe(false);
    }
  });
  it('pas d’arbre dans les prairies de susuki', () => {
    for (const z of TALL_GRASS_ZONES) for (let a = 0; a < 6.28; a += 0.5) expect(canPlantTree(z.x + Math.cos(a) * z.r * 0.8, z.z + Math.sin(a) * z.r * 0.8)).toBe(false);
  });
  it('les ceintures forestières et les pentes de la couronne sont boisées', () => {
    for (const b of FOREST_BELTS) if (b.kind !== 'bambous') expect(forestAt(b.x, b.z).f, b.id).toBeGreaterThan(0.6);
    let wooded = 0, n = 0;
    for (let a = 0; a < 6.28; a += 0.2) {
      const x = Math.sin(a) * 300, z = -Math.cos(a) * 300;
      n++;
      if (forestAt(x, z).f > 0.3) wooded++;
    }
    expect(wooded / n).toBeGreaterThan(0.5);
  });
});
