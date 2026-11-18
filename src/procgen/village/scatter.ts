// Intégration village : premier passage de décor avec les modèles photoscannés Poly Haven (src/core/models.ts).
// Rochers moussus le long du torrent et autour du rotenburo, fougères sur les berges et au pied de la colline sacrée,
// seaux, tonneaux, caisses, paniers et pots devant les échoppes. Le remplissage fin (bandes de 1 objet / 1,5 m,
// listes du §8.1) revient à la spécialité Décor : ce module ne pose que la base « village habité ».
import * as THREE from 'three';
import { Models } from '../../core/models';
import { Rng } from '../../core/math';
import { heightAt, normalAt } from '../../world/heightmap';
import { addCircle } from '../../world/physics';
import { streamInfo, streamBedAt, rectSdf } from '../../world/valley';
import { BRIDGES, BUILDINGS, HOT_SPRING_POOL, PATHS, POND, STREAM, distToPolyline } from '../../world/zones';

export const ROCKS = ['rock_moss_set_01_a', 'rock_moss_set_01_b', 'rock_moss_set_01_c', 'rock_moss_set_02_a', 'rock_moss_set_02_b', 'rock_moss_set_02_d', 'boulder_01'];
export const FERNS = ['fern_02_a', 'fern_02_d'];
export const GOODS = ['wooden_bucket_01', 'wooden_bucket_02', 'wooden_barrels_01_a', 'wine_barrel_01', 'wooden_crate_01', 'wooden_crate_02', 'wicker_basket_02', 'planter_pot_clay', 'potted_plant_02', 'ceramic_pot'];
export const SCATTER_IDS = [...ROCKS, ...FERNS, ...GOODS];

type Bag = Map<string, THREE.Matrix4[]>;
const push = (bag: Bag, id: string, m: THREE.Matrix4) => {
  let a = bag.get(id);
  if (!a) bag.set(id, (a = []));
  a.push(m);
};

const ROAD_PATHS = PATHS.filter((p) => p.kind !== 'sentier' || p.surface !== 'terre');
function clearOfPaths(x: number, z: number, m = 0.6) {
  for (const p of ROAD_PATHS) if (distToPolyline(x, z, p.pts) < p.width / 2 + m) return false;
  return true;
}
function clearOfBuildings(x: number, z: number, m = 1) {
  for (const b of BUILDINGS) if (Math.abs(b.x - x) < 40 && Math.abs(b.z - z) < 40 && rectSdf(x, z, b.x, b.z, b.w, b.d, b.yaw) < m) return false;
  return true;
}
function clearOfBridges(x: number, z: number, m = 2.5) {
  return BRIDGES.every((br) => distToPolyline(x, z, [br.a, br.b]) > br.width / 2 + m);
}

/** Pose les modèles et renvoie le groupe d'instances (une InstancedMesh par modèle, LOD et primitive). */
export function scatterVillageDecor(): { group: THREE.Group; counts: Record<string, number> } {
  const rng = new Rng(777);
  const bag: Bag = new Map();
  const dims = (id: string) => Models.get(id).info.dimensions;
  // --- torrent : rochers sur les berges naturelles, quelques blocs dans le lit entre les murs du village
  {
    let acc = 0;
    for (let i = 7; i < STREAM.length - 3; i++) {
      const [ax, az] = STREAM[i], [bx, bz] = STREAM[i + 1];
      const l = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / l, dz = (bz - az) / l;
      for (let s = 0; s < l; s += 2.6) {
        acc++;
        const cx = ax + dx * s, cz = az + dz * s;
        const info = streamInfo(cx, cz);
        if (Math.hypot(cx, cz) > 300) continue;
        for (const side of [-1, 1]) {
          if (!rng.chance(info.walled ? 0.22 : 0.75)) continue;
          const id = rng.pick(ROCKS);
          const hw = info.width / 2;
          const off = info.walled ? hw - rng.range(0.6, 1.4) : hw + rng.range(-0.4, 2.4);
          const x = cx - dz * off * side + rng.range(-0.8, 0.8), z = cz + dx * off * side + rng.range(-0.8, 0.8);
          if (!clearOfBridges(x, z) || !clearOfPaths(x, z, 0.8) || !clearOfBuildings(x, z, 1.5)) continue;
          const sc = info.walled ? rng.range(0.35, 0.6) : rng.range(0.45, 1.15);
          const y = info.walled ? streamBedAt(x, z) + 0.1 : heightAt(x, z);
          push(bag, id, Models.groundMatrix(id, x, z, heightAt, { y, yaw: rng.range(0, 6.28), scale: sc, normalAt: info.walled ? undefined : (px, pz) => normalAt(px, pz), align: 0.6 }));
          const d = dims(id);
          if (!info.walled) addCircle(x, z, Math.min(d[0], d[2]) * 0.36 * sc, y - 1, y + d[1] * sc * 0.85, true);
          // fougères au pied des rochers de berge
          if (!info.walled && rng.chance(0.7)) {
            const fid = rng.pick(FERNS);
            const fx = x + rng.range(-1.6, 1.6) * side, fz = z + rng.range(-1.6, 1.6);
            const fi = streamInfo(fx, fz);
            if (fi.d > fi.width / 2 + 0.6 && clearOfPaths(fx, fz, 0.4)) push(bag, fid, Models.groundMatrix(fid, fx, fz, heightAt, { yaw: rng.range(0, 6.28), scale: rng.range(0.9, 1.5), normalAt: (px, pz) => normalAt(px, pz) }));
          }
        }
      }
    }
    void acc;
  }
  // --- rotenburo : couronne de gros rochers plats, avec une entrée côté vestiaire (ouest)
  {
    const P = HOT_SPRING_POOL;
    const gap = Math.atan2(73 - P.z, 46 - P.x);
    const n = 30;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rng.range(-0.05, 0.05);
      let da = Math.abs(a - gap) % (Math.PI * 2);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da < 0.22) continue;
      const id = rng.pick(['rock_moss_set_02_a', 'rock_moss_set_02_b', 'rock_moss_set_02_d', 'rock_moss_set_01_c']);
      const r = P.r + rng.range(-0.2, 0.5);
      const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
      const sc = rng.range(0.75, 1.05);
      const y = P.deckY;
      push(bag, id, Models.groundMatrix(id, x, z, heightAt, { y: y - 0.05, yaw: a + rng.range(-0.4, 0.4), scale: sc }));
      const d = dims(id);
      addCircle(x, z, Math.min(d[0], d[2]) * 0.4 * sc, y - 1, y + Math.min(0.55, d[1] * sc * 0.8), true);
    }
    // fougères autour
    for (let k = 0; k < 18; k++) {
      const a = rng.range(0, Math.PI * 2), r = P.r + rng.range(1.6, 3.5);
      const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
      if (!clearOfPaths(x, z, 0.4) || !clearOfBuildings(x, z, 0.8)) continue;
      const fid = rng.pick(FERNS);
      push(bag, fid, Models.groundMatrix(fid, x, z, heightAt, { yaw: rng.range(0, 6.28), scale: rng.range(0.9, 1.4), normalAt: (px, pz) => normalAt(px, pz) }));
    }
  }
  // --- étang : rochers et fougères sur la rive nord (près du ponton de Nina) et à l'est (cascade)
  for (let k = 0; k < 26; k++) {
    const a = rng.range(-Math.PI, Math.PI);
    const e = rng.range(1.04, 1.22);
    const x = POND.x + Math.cos(a) * POND.rx * e, z = POND.z + Math.sin(a) * POND.rz * e;
    if (!clearOfPaths(x, z, 0.6) || !clearOfBridges(x, z, 2) || !clearOfBuildings(x, z, 1.5)) continue;
    if (Math.hypot(x + 110, z - 64) < 6) continue; // ponton
    const id = rng.pick(ROCKS);
    const sc = rng.range(0.5, 1.1);
    push(bag, id, Models.groundMatrix(id, x, z, heightAt, { yaw: rng.range(0, 6.28), scale: sc, normalAt: (px, pz) => normalAt(px, pz), align: 0.6 }));
    const d = dims(id);
    addCircle(x, z, Math.min(d[0], d[2]) * 0.36 * sc, heightAt(x, z) - 1, heightAt(x, z) + d[1] * sc * 0.85, true);
    const fid = rng.pick(FERNS);
    const fx = x + rng.range(-1.5, 1.5), fz = z + rng.range(-1.5, 1.5);
    if (clearOfPaths(fx, fz, 0.4) && heightAt(fx, fz) > 0.4) push(bag, fid, Models.groundMatrix(fid, fx, fz, heightAt, { yaw: rng.range(0, 6.28), scale: rng.range(0.9, 1.4), normalAt: (px, pz) => normalAt(px, pz) }));
  }
  // --- colline sacrée : fougères le long du sandō et de l'escalier aux mille torii
  for (const id of ['sando', 'torii-mille']) {
    const p = PATHS.find((q) => q.id === id)!;
    for (let k = 0; k < 40; k++) {
      const i = rng.int(0, p.pts.length - 2);
      const t = rng.range(0, 1);
      const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1];
      const l = Math.hypot(bx - ax, bz - az);
      const side = rng.chance(0.5) ? 1 : -1, off = p.width / 2 + rng.range(0.8, 3.5);
      const x = ax + (bx - ax) * t - ((bz - az) / l) * off * side, z = az + (bz - az) * t + ((bx - ax) / l) * off * side;
      if (!clearOfPaths(x, z, 0.5) || !clearOfBuildings(x, z, 1)) continue;
      const fid = rng.pick(FERNS);
      push(bag, fid, Models.groundMatrix(fid, x, z, heightAt, { yaw: rng.range(0, 6.28), scale: rng.range(1, 1.6), normalAt: (px, pz) => normalAt(px, pz) }));
      if (rng.chance(0.15)) {
        const rid = rng.pick(ROCKS);
        push(bag, rid, Models.groundMatrix(rid, x + 1, z, heightAt, { yaw: rng.range(0, 6.28), scale: rng.range(0.3, 0.6), normalAt: (px, pz) => normalAt(px, pz) }));
      }
    }
  }
  // --- devant les échoppes : seaux, tonneaux, caisses, paniers et pots dans la bande de 1,2 m
  const shopPools: Record<string, string[]> = {
    machiya: ['wooden_crate_01', 'wooden_crate_02', 'wicker_basket_02', 'wooden_barrels_01_a', 'ceramic_pot', 'planter_pot_clay', 'potted_plant_02'],
    sento: ['wooden_bucket_01', 'wooden_bucket_02', 'wooden_bucket_02', 'wooden_bucket_01'],
    chaya: ['potted_plant_02', 'planter_pot_clay', 'wine_barrel_01'],
    ryokan: ['potted_plant_02', 'planter_pot_clay', 'wooden_bucket_01'],
    datsuijo: ['wooden_bucket_01', 'wooden_bucket_02', 'wicker_basket_02'],
    yatai: ['wicker_basket_02', 'wooden_crate_01'],
    minka: ['planter_pot_clay', 'wooden_bucket_01', 'potted_plant_02', 'wine_barrel_01'],
    kura: ['wooden_barrels_01_a', 'wine_barrel_01', 'wooden_crate_02'],
    moulin: ['wooden_crate_02', 'wooden_barrels_01_a', 'wicker_basket_02'],
    gassho: ['wooden_barrels_01_a', 'wooden_crate_02', 'wooden_bucket_02'],
  };
  for (const b of BUILDINGS) {
    const pool = shopPools[b.type];
    if (!pool) continue;
    const n = b.type === 'machiya' || b.type === 'sento' ? 4 : b.type === 'yatai' ? 2 : 2;
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), rx = Math.cos(b.yaw), rz = -Math.sin(b.yaw);
    for (let k = 0; k < n; k++) {
      const id = pool[(k + b.id.length) % pool.length];
      // de part et d'autre de l'entrée (centre de façade dégagé sur 1,6 m)
      const side = k % 2 ? 1 : -1;
      const lx = side * rng.range(1.0, Math.max(1.1, b.w / 2 - 0.5));
      const lz = b.d / 2 + (b.type === 'yatai' ? 0.7 : rng.range(0.4, 0.8));
      const x = b.x + rx * lx + fx * lz, z = b.z + rz * lx + fz * lz;
      if (!clearOfPaths(x, z, -0.2)) continue;
      const y = heightAt(x, z) + 0.05;
      push(bag, id, Models.groundMatrix(id, x, z, heightAt, { y, yaw: b.yaw + rng.range(-0.6, 0.6), scale: rng.range(0.9, 1.1) }));
      const d = dims(id);
      if (Math.max(d[0], d[2]) > 0.45) addCircle(x, z, Math.max(d[0], d[2]) * 0.45, y, y + d[1]);
      // petite pile : un seau sur un tonneau, une caisse sur une caisse
      if ((id === 'wooden_crate_01' || id === 'wooden_barrels_01_a') && rng.chance(0.4)) {
        const top = id === 'wooden_crate_01' ? 'wicker_basket_02' : 'wooden_bucket_01';
        push(bag, top, Models.groundMatrix(top, x, z, heightAt, { y: y + d[1] - 0.02, yaw: rng.range(0, 6.28) }));
      }
    }
  }
  const group = new THREE.Group();
  group.name = 'village-decor-polyhaven';
  const counts: Record<string, number> = {};
  for (const [id, list] of bag) {
    counts[id] = list.length;
    const cat = Models.get(id).info.category;
    group.add(Models.instances(id, list, { brightnessJitter: cat === 'rocher' ? 0.12 : 0.06, name: 'decor:' + id }));
  }
  return { group, counts };
}
