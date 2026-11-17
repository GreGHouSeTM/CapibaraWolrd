// Paris : immeubles haussmanniens, toits en zinc, Seine et ponts, tour Eiffel, Arc de Triomphe, cafés.
import * as THREE from 'three';
import { Rng } from '../core/math';
import { regionById } from '../world/layout';
import { buildCity, CityStyle } from '../procgen/city';
import { haussmann, shopfront, roofTexture } from '../procgen/facades';
import { Batch, facadeMaterial, mansardRoof, std, facadeBox, planarUV } from '../procgen/kit';
import { pbr } from '../core/assets';
import { eiffelTower, arcDeTriomphe } from '../procgen/monuments';
import { BuildCtx, RegionContent, emptyContent, cafeTable, morrisColumn, bench } from './common';
import { paveCircle, paveRect } from '../world/grass';
import { addBox } from '../world/physics';

export function buildParis(ctx: BuildCtx): RegionContent {
  const R = regionById('paris');
  const out = emptyContent('paris');
  const rng = new Rng(75);
  const zinc = roofTexture('zinc');
  const zincMat = new THREE.MeshStandardMaterial({ map: zinc.map, normalMap: zinc.normalMap, roughness: 0.45, metalness: 0.55, color: 0xc8d0d8 });
  const chimMat = std(0xc9a888, 0.9);
  const potMat = std(0xb0603a, 0.8);
  const facades = [haussmann(1), haussmann(2), haussmann(3), haussmann(4)];
  const shops = [shopfront(11, 'paris'), shopfront(12, 'paris'), shopfront(13, 'paris')];

  const style: CityStyle = {
    facades, shops,
    floorH: 3.3, bayW: 3.3, shopH: 4.6,
    floors: (r) => r.int(4, 5),
    lotWidth: [11, 17], lotDepth: [11, 15],
    lamp: 'paris', streetTree: 'plane',
    roof: (b, x, z, w, d, top, r, set) => {
      b.addAt(mansardRoof(w, d, 0, 4.2, 1.7), zincMat, x, top, z);
      // lucarnes
      const dormer = facadeBox(1.6, 1.2, 0, 2.2, set, 3.3, 3.3, 0.3, 0.5);
      for (let k = -w / 2 + 3; k < w / 2 - 2; k += 3.3) {
        b.addAt(dormer, facadeMaterial(set), x + k, top + 0.6, z + d / 2 - 1.0);
        b.addAt(dormer, facadeMaterial(set), x + k, top + 0.6, z - d / 2 + 1.0);
      }
      // souches de cheminée en terre cuite
      const n = r.int(1, 3);
      for (let k = 0; k < n; k++) {
        const cx = x + r.range(-w / 2 + 2.5, w / 2 - 2.5), cz = z + (r.chance(0.5) ? 1 : -1) * (d / 2 - 2);
        b.addAt(new THREE.BoxGeometry(2.4, 2.6, 0.8).translate(0, 4.2 + 1.0, 0), chimMat, cx, top, cz);
        for (let p = 0; p < 4; p++) b.addAt(new THREE.CylinderGeometry(0.12, 0.14, 0.6, 6).translate(-0.9 + p * 0.6, 6.8, 0), potMat, cx, top, cz);
      }
    },
  };

  const eiffel = new THREE.Vector3(R.x - 140, R.ground, R.z + 175);
  const arc = new THREE.Vector3(R.x + 60, R.ground, R.z - 170);
  const city = buildCity({
    region: R, halfX: 265, halfZ: 265, block: 46, street: 12, style, seed: 7, forest: ctx.forest,
    kindOf: (b) => {
      if (Math.abs(b.x - eiffel.x) < 70 && b.z > eiffel.z - 70 && b.z < eiffel.z + 130) return 'plaza';
      if (Math.hypot(b.x - arc.x, b.z - arc.z) < 62) return 'plaza';
      if (rng.chance(0.06)) return 'park';
      if (rng.chance(0.05)) return 'plaza';
      return 'buildings';
    },
  });
  out.group.add(city.group);
  out.walkPoints = city.sidewalkPoints;
  out.roadPoints = city.roadPoints;
  out.loops = city.loops;

  const b = new Batch(120);
  // Tour Eiffel au milieu du Champ-de-Mars
  const tower = eiffelTower(eiffel.x, eiffel.y + 0.18, eiffel.z);
  out.group.add(tower.group);
  out.update.push((t, _dt, c) => tower.update(t, c.night));
  // pelouses du Champ-de-Mars
  const lawn = pbr('grass', { scale: 4, color: 0xa8d878 });
  for (const dz of [55, 100]) {
    b.addAt(planarUV(new THREE.BoxGeometry(50, 0.1, 34).translate(0, 0.2, 0), 1), lawn, eiffel.x, eiffel.y, eiffel.z + dz, 0, false);
    for (let k = -20; k <= 20; k += 10) ctx.forest.add('plane', eiffel.x + k, eiffel.z + dz + 22, 0.8, undefined, eiffel.y + 0.18);
  }
  out.spots.eiffelBase = new THREE.Vector3(eiffel.x, eiffel.y + 0.2, eiffel.z + 30);
  out.spots.eiffelTop = new THREE.Vector3(eiffel.x + 3, tower.platform2 + 0.05, eiffel.z + 5);
  out.spots.eiffel = eiffel.clone().setY(eiffel.y + 60);
  out.interact.push(
    {
      id: 'eiffel-up', pos: new THREE.Vector3(eiffel.x, eiffel.y, eiffel.z + 2), radius: 6, label: 'Prendre l’ascenseur',
      action: () => ctx.teleport(out.spots.eiffelTop, 'Deuxième étage de la tour Eiffel !'),
    },
    {
      id: 'eiffel-down', pos: out.spots.eiffelTop.clone().setZ(eiffel.z), radius: 4, label: 'Redescendre',
      action: () => ctx.teleport(out.spots.eiffelBase, 'Retour sur le Champ-de-Mars'),
    },
  );
  b.addAt(new THREE.BoxGeometry(3, 3, 3).translate(0, 1.5, 0), std(0x6a5540, 0.5, 0.6), eiffel.x, eiffel.y + 43.2 + 1.6, eiffel.z, 0);
  b.addAt(new THREE.BoxGeometry(3, 2.8, 3).translate(0, 1.4, 0), std(0x6a5540, 0.5, 0.6), eiffel.x, eiffel.y, eiffel.z);
  addBox(eiffel.x, eiffel.z, 3, 3, eiffel.y, eiffel.y + 2.8);

  // Arc de Triomphe sur sa place
  arcDeTriomphe(b, arc.x, arc.y + 0.18, arc.z, 0);
  paveCircle(arc.x, arc.z, 60);
  out.spots.arc = arc.clone().setY(arc.y + 25);

  // cafés, colonnes Morris, bancs
  const cafes: THREE.Vector3[] = [];
  for (let i = 0; i < 6; i++) {
    const p = city.sidewalkPoints[rng.int(0, city.sidewalkPoints.length - 1)];
    cafes.push(p);
    for (let k = 0; k < 3; k++) cafeTable(b, p.x + (k - 1) * 2.4, p.y, p.z, rng.pick([0xc8303a, 0x2a5a8a, 0x2f6f3a]));
  }
  for (let i = 0; i < 10; i++) {
    const p = city.sidewalkPoints[rng.int(0, city.sidewalkPoints.length - 1)];
    if (rng.chance(0.5)) morrisColumn(b, p.x + 1.5, p.y, p.z + 1.5);
    else bench(b, p.x, p.y, p.z, rng.range(0, 6.28));
  }
  out.spots.bakery = city.sidewalkPoints[3] ?? R as unknown as THREE.Vector3;
  out.spots.cafe1 = cafes[0];
  out.spots.cafe2 = cafes[2];
  out.spots.cafe3 = cafes[4];

  out.npcs.push(
    { id: 'baker', name: 'Pierre le boulanger', pos: out.spots.bakery.clone(), fur: 0xa87a52, hat: 'chef', scarf: 0x2a5a8a },
    { id: 'painter', name: 'Amélie la peintre', pos: new THREE.Vector3(eiffel.x + 18, eiffel.y + 0.2, eiffel.z + 40), fur: 0x8f6040, hat: 'beret', scarf: 0xc8303a },
  );
  out.vehicles.push(
    { type: 'scooter', pos: new THREE.Vector3(out.spots.bakery.x + 3, R.ground, out.spots.bakery.z + 4), rot: 0 },
    { type: 'car', pos: new THREE.Vector3(R.x + 6, R.ground, R.z + 230), rot: Math.PI },
  );
  out.photos.push(
    { id: 'eiffel', name: 'La tour Eiffel', region: 'paris', target: out.spots.eiffel, radius: 260 },
    { id: 'arc', name: 'L’Arc de Triomphe', region: 'paris', target: out.spots.arc, radius: 160 },
  );
  paveRect(eiffel.x, eiffel.z + 30, 140, 200, 0, 0);
  out.group.add(b.build('paris-props'));
  return out;
}
