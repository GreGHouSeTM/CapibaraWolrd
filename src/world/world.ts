// Assemblage du monde : relief, terrain, eau, végétation, routes et régions.
import * as THREE from 'three';
import { bakeWorld, heightAt } from './heightmap';
import { groundAt, resolveCircle } from './physics';
import { bakeGrassMask, Grass } from './grass';
import { createTerrain, createTerrainMaterial } from './terrain';
import { Water } from './water';
import { Forest, scatterNature } from './vegetation';
import { buildCapyFlora, CapyFlora } from '../procgen/flora/capyville';
import { buildRoads } from './roads';
import { buildParis } from '../regions/paris';
import { buildNewYork } from '../regions/newyork';
import { buildLondon } from '../regions/london';
import { buildJapan, buildDesert, buildPole } from '../regions/nature';
// --- INTÉGRATION VILLAGE --- : Capyville (village onsen) et LOD de ses bâtiments
import { buildHub, updateVillage } from '../regions/hub';
import { beforeRender } from '../procgen/village/lod';
import { Models } from '../core/models';
import { BuildCtx, RegionContent } from '../regions/common';
import { REGIONS, RegionId } from './layout';
import { QualityPreset } from '../core/quality';

export interface World {
  terrain: THREE.Group;
  water: Water;
  grass: Grass;
  forest: Forest;
  /** VÉGÉTATION : arbres, sous-bois, susuki, riz et théiers de la vallée de Capyville (mise à jour : game.ts). */
  flora: CapyFlora;
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
  // --- INTÉGRATION VILLAGE --- : Capyville se construit de façon asynchrone (chargement des .glb), entre 0,42 et 0,64
  {
    const c = await buildHub(bctx, (p, l) => progress(0.42 + p * 0.22, l ?? 'Construction de Capyville…'));
    contents.hub = c;
    c.group.name = 'region-hub';
    c.group.userData.region = REGIONS.find((r) => r.id === 'hub');
    scene.add(c.group);
    beforeRender(scene, updateVillage);
    Models.autoUpdate(scene);
    // --- EAU --- : torrent, cascades et bassins (après le village : l'écume se cuit autour des rochers du lit)
    water.buildLocal(scene, c.group, q);
  }
  const builders: [RegionId, string, (c: BuildCtx) => RegionContent][] = [
    ['paris', 'Construction de Paris et de la tour Eiffel…', buildParis],
    ['newyork', 'Construction des gratte-ciels de New York…', buildNewYork],
    ['london', 'Construction de Londres et de Big Ben…', buildLondon],
    ['japan', 'Construction du Japon et du mont Fuji…', buildJapan],
    ['desert', 'Construction des pyramides…', buildDesert],
    ['pole', 'Construction des igloos du Pôle Nord…', buildPole],
  ];
  let i = 0;
  for (const [id, label, fn] of builders) {
    progress(0.64 + (i / builders.length) * 0.18, label);
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
  // --- INTÉGRATION VILLAGE --- : « occlusion de la cuvette » (bible §3.1 : la couronne de sommets cache les régions
  // voisines). Caméra au fond de la vallée (r < 330 m, y < 140 m) : les villes voisines et les massifs d'arbres à plus
  // de 480 m ne sont pas dessinés (ils ne peuvent pas être vus) ; cela retire environ 900 appels de dessin à la vue du village.
  {
    const forestMeshes = forest.group.children as THREE.Mesh[];
    const others = Object.values(contents).filter((c) => c.id !== 'hub').map((c) => c.group);
    const cam = new THREE.Vector3();
    let inside = false;
    beforeRender(scene, (camera) => {
      cam.setFromMatrixPosition(camera.matrixWorld);
      const now = Math.hypot(cam.x, cam.z) < 330 && cam.y < 140;
      for (const g of others) g.visible = !now;
      if (!now && !inside) return;
      inside = now;
      for (const m of forestMeshes) {
        const s = (m as THREE.InstancedMesh).boundingSphere;
        m.visible = !now || !s || s.center.distanceTo(cam) - s.radius < 480;
      }
    });
  }
  // --- VÉGÉTATION --- vallée de Capyville (remplace les arbres « boules » dans la vallée et sur ses pentes)
  progress(0.9, 'Pousse des cèdres et des cerisiers…');
  await frame();
  const flora = await buildCapyFlora(q.treeDensity >= 0.8 ? 1 : 0.7);
  scene.add(flora.group);
  const grass = new Grass(q.grass, q.grassPatch);
  grass.maskTex.needsUpdate = true;
  scene.add(grass.mesh);
  return { terrain, water, grass, forest, flora, roads, contents };
}
