// Assemblage du monde : relief, terrain, eau, végétation, routes et régions.
import * as THREE from 'three';
import { bakeWorld, heightAt } from './heightmap';
import { groundAt, resolveCircle } from './physics';
import { bakeGrassMask, Grass } from './grass';
import { createTerrain, createTerrainMaterial } from './terrain';
import { Water } from './water';
import { Forest, scatterNature } from './vegetation';
import { buildRoads } from './roads';
import { buildParis } from '../regions/paris';
import { buildNewYork } from '../regions/newyork';
import { buildLondon } from '../regions/london';
import { buildJapan, buildDesert, buildPole, buildHub } from '../regions/nature';
import { BuildCtx, RegionContent } from '../regions/common';
import { REGIONS, RegionId } from './layout';
import { QualityPreset } from '../core/quality';

export interface World {
  terrain: THREE.Group;
  water: Water;
  grass: Grass;
  forest: Forest;
  roads: THREE.Group;
  contents: Record<RegionId, RegionContent>;
}

const frame = () => new Promise<void>((r) => setTimeout(r, 0));

export async function buildWorld(scene: THREE.Scene, q: QualityPreset, ctx: Omit<BuildCtx, 'forest'>, progress: (p: number, label: string) => void): Promise<World> {
  progress(0.22, 'Sculpture des montagnes et des dunes…');
  await frame();
  bakeWorld();
  progress(0.32, 'Plantation des prairies…');
  await frame();
  bakeGrassMask();
  progress(0.38, 'Modelage du terrain…');
  await frame();
  const terrain = createTerrain(createTerrainMaterial(), q.lodDist);
  scene.add(terrain);
  const water = new Water();
  scene.add(water.mesh);

  const forest = new Forest();
  const bctx: BuildCtx = { ...ctx, forest };
  const contents = {} as Record<RegionId, RegionContent>;
  const builders: [RegionId, string, (c: BuildCtx) => RegionContent][] = [
    ['hub', 'Construction de Capyville…', buildHub],
    ['paris', 'Construction de Paris et de la tour Eiffel…', buildParis],
    ['newyork', 'Construction des gratte-ciels de New York…', buildNewYork],
    ['london', 'Construction de Londres et de Big Ben…', buildLondon],
    ['japan', 'Construction du Japon et du mont Fuji…', buildJapan],
    ['desert', 'Construction des pyramides…', buildDesert],
    ['pole', 'Construction des igloos du Pôle Nord…', buildPole],
  ];
  let i = 0;
  for (const [id, label, fn] of builders) {
    progress(0.42 + (i / builders.length) * 0.38, label);
    await frame();
    const c = fn(bctx);
    contents[id] = c;
    c.group.name = 'region-' + id;
    c.group.userData.region = REGIONS.find((r) => r.id === id);
    scene.add(c.group);
    i++;
  }
  progress(0.82, 'Traçage des routes…');
  await frame();
  const roads = buildRoads();
  scene.add(roads);
  progress(0.86, 'Pousse des forêts…');
  await frame();
  scatterNature(forest, (x, z) => {
    const h = heightAt(x, z);
    return groundAt(x, z, 999) > h + 0.3 || resolveCircle(x, z, h, 1.2, 4).hit;
  }, q.treeDensity);
  scene.add(forest.build());
  const grass = new Grass(q.grass, q.grassPatch);
  grass.maskTex.needsUpdate = true;
  scene.add(grass.mesh);
  return { terrain, water, grass, forest, roads, contents };
}
