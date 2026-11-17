// Londres : maisons de briques, toits d'ardoise, Tamise, Big Ben, Parlement, grande roue, Tower Bridge.
import * as THREE from 'three';
import { Rng } from '../core/math';
import { regionById } from '../world/layout';
import { buildCity, CityStyle } from '../procgen/city';
import { londonBrick, shopfront, roofTexture } from '../procgen/facades';
import { Batch, gableRoof, std, facadeMaterial } from '../procgen/kit';
import { bigBen, parliament, ferrisWheel, towerBridge } from '../procgen/monuments';
import { BuildCtx, RegionContent, emptyContent, phoneBooth, bench } from './common';
import { riverDistance, RIVERS } from '../world/heightmap';
import { paveRect } from '../world/grass';
import { pbr } from '../core/assets';

export function buildLondon(ctx: BuildCtx): RegionContent {
  const R = regionById('london');
  const out = emptyContent('london');
  const rng = new Rng(44);
  const slate = roofTexture('slate');
  const slateMat = new THREE.MeshStandardMaterial({ map: slate.map, normalMap: slate.normalMap, roughness: 0.75, color: 0xb8bcc4 });
  const chim = std(0x9a5a42, 0.9);
  const gableMat = pbr('brick', { scale: 3, color: 0xd8b89a });
  const pot = std(0xb86a40, 0.85);
  const facades = [londonBrick(1), londonBrick(2), londonBrick(3), londonBrick(4)];
  const shops = [shopfront(31, 'london'), shopfront(32, 'london'), shopfront(33, 'london')];

  const style: CityStyle = {
    facades, shops, floorH: 3.2, bayW: 3.4, shopH: 4.4,
    floors: (r) => r.int(2, 4), lotWidth: [7, 11], lotDepth: [10, 13], lamp: 'london', streetTree: 'plane',
    roof: (b, x, z, w, d, top, r, set) => {
      const g = gableRoof(w, d, top, Math.min(w, d) * 0.32, 0.3);
      const tm = new THREE.Matrix4().makeTranslation(x, 0, z);
      b.add(g.roof, slateMat, tm);
      b.add(g.gable, gableMat, tm);
      if (r.chance(0.8)) {
        const alongX = w >= d;
        const cx = x + (alongX ? (r.chance(0.5) ? 1 : -1) * (w / 2 - 0.6) : 0);
        const cz = z + (alongX ? 0 : (r.chance(0.5) ? 1 : -1) * (d / 2 - 0.6));
        b.addAt(new THREE.BoxGeometry(alongX ? 0.9 : 2.6, 4.5, alongX ? 2.6 : 0.9).translate(0, 2.2, 0), chim, cx, top, cz);
        for (let p = 0; p < 3; p++)
          b.addAt(new THREE.CylinderGeometry(0.14, 0.16, 0.7, 6).translate(alongX ? 0 : -0.8 + p * 0.8, 4.8, alongX ? -0.8 + p * 0.8 : 0), pot, cx, top, cz);
      }
    },
  };

  const river = RIVERS.find((r) => r.region === 'london')!;
  const riverZAt = (x: number) => {
    let best = 0, bd = Infinity;
    for (let z = R.z - 100; z < R.z + 250; z += 2) {
      const d = riverDistance(x, z).d;
      if (d < bd) { bd = d; best = z; }
    }
    return best;
  };
  const benX = R.x - 60;
  const rz = riverZAt(benX);
  const parl = new THREE.Vector3(benX + 70, R.ground + 0.18, rz - river.width / 2 - 22);
  const eye = new THREE.Vector3(R.x + 30, R.ground, riverZAt(R.x + 30) + river.width / 2 + 24);
  const tbX = R.x + 220;
  const tbZ = riverZAt(tbX);

  const city = buildCity({
    region: R, halfX: 265, halfZ: 255, block: 50, street: 11, style, seed: 13, forest: ctx.forest,
    kindOf: (b) => {
      if (Math.abs(b.x - parl.x) < 110 && Math.abs(b.z - parl.z) < 40) return 'plaza';
      if (Math.abs(b.x - eye.x) < 50 && Math.abs(b.z - eye.z) < 50) return 'plaza';
      if (Math.abs(b.x - tbX) < 40 && Math.abs(b.z - tbZ) < 90) return 'plaza';
      if (rng.chance(0.07)) return 'park';
      return 'buildings';
    },
  });
  out.group.add(city.group);
  out.walkPoints = city.sidewalkPoints;
  out.roadPoints = city.roadPoints;
  out.loops = city.loops;

  const b = new Batch(120);
  const ben = bigBen(b, benX, R.ground + 0.18, parl.z);
  out.group.add(ben.group);
  out.update.push((_t, _dt, c) => ben.update(c.hour));
  parliament(b, parl.x + 10, parl.y, parl.z, 130);
  out.spots.bigben = new THREE.Vector3(benX, R.ground + 65, parl.z);
  out.photos.push({ id: 'bigben', name: 'Big Ben', region: 'london', target: out.spots.bigben, radius: 260 });

  const wheel = ferrisWheel(eye.x, R.ground + 0.18, eye.z, 0);
  out.group.add(wheel.group);
  out.update.push((t) => wheel.update(t));
  out.spots.eye = new THREE.Vector3(eye.x, R.ground + 50, eye.z);
  out.photos.push({ id: 'eye', name: 'La grande roue', region: 'london', target: out.spots.eye, radius: 260 });

  towerBridge(b, tbX, R.ground + 0.06, tbZ, river.width + 46, -3);
  paveRect(tbX, tbZ, 16, river.width + 46);
  out.spots.towerbridge = new THREE.Vector3(tbX, R.ground + 30, tbZ);
  out.photos.push({ id: 'towerbridge', name: 'Tower Bridge', region: 'london', target: out.spots.towerbridge, radius: 240 });

  for (let i = 0; i < 24; i++) {
    const p = city.sidewalkPoints[rng.int(0, city.sidewalkPoints.length - 1)];
    if (rng.chance(0.45)) phoneBooth(b, p.x + 1.2, p.y, p.z + 1.2, rng.range(0, 6.28));
    else bench(b, p.x, p.y, p.z, rng.range(0, 6.28));
  }
  // parapluies perdus (collectibles de mission)
  out.spots.umbrellas = new THREE.Vector3();
  const ups: THREE.Vector3[] = [];
  for (let i = 0; i < 5; i++) ups.push(city.sidewalkPoints[rng.int(0, city.sidewalkPoints.length - 1)].clone().add(new THREE.Vector3(0, 0.6, 0)));
  (out.spots as any).umbrellaList = ups;

  out.npcs.push(
    { id: 'guard', name: 'Sir Reginald', pos: new THREE.Vector3(benX + 12, R.ground + 0.2, parl.z + 20), fur: 0x6a4a30, hat: 'tophat', scarf: 0xb01020 },
    { id: 'busdriver', name: 'Maggie la conductrice', pos: city.sidewalkPoints[20].clone(), fur: 0x9a7048, hat: 'cap', scarf: 0xc8202a },
  );
  out.vehicles.push(
    { type: 'bus', pos: city.roadPoints[16].clone(), rot: 0 },
    { type: 'car', pos: city.roadPoints[28].clone(), rot: Math.PI / 2 },
  );
  out.spots.busStart = city.roadPoints[16].clone();
  out.group.add(b.build('london-props'));
  return out;
}
