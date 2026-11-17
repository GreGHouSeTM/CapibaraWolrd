// Circulation : voitures qui tournent autour des pâtés de maisons et s'arrêtent devant le joueur.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildVehicleModel } from './vehicle';
import { Rng, dampAngle } from '../core/math';
import { groundAt } from '../world/physics';
import type { VehicleType } from '../regions/common';
import type { RegionId } from '../world/layout';

/** Fusionne les maillages d'un modèle par matériau (moins d'appels de dessin). */
export function mergeModel(g: THREE.Group) {
  g.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    let geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
    geo = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.getAttribute('uv')) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.getAttribute('position').count * 2), 2));
    const mat = m.material as THREE.Material;
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat)!.push(geo);
  });
  const out = new THREE.Group();
  for (const [mat, geos] of byMat) {
    const mesh = new THREE.Mesh(mergeGeometries(geos)!, mat);
    mesh.castShadow = true;
    out.add(mesh);
  }
  return out;
}

export interface TrafficCar {
  obj: THREE.Group;
  loop: THREE.Vector3[];
  seg: number;
  t: number;
  pos: THREE.Vector3;
  yaw: number;
  speed: number;
  radius: number;
}

export class Traffic {
  group = new THREE.Group();
  cars: TrafficCar[] = [];

  addRegion(id: RegionId, loops: THREE.Vector3[][], count: number, seed: number) {
    if (!loops.length) return;
    const rng = new Rng(seed);
    const colors = [0xd8d8d8, 0x2a2a2e, 0xb81e1e, 0x1e4fa8, 0x3a7a4a, 0xe8b02a, 0x7a3aa8, 0xf0f0f0];
    for (let i = 0; i < count; i++) {
      const base = loops[(i * 7) % loops.length];
      const loop = id === 'london' ? base : [base[0], base[3], base[2], base[1]];
      const type: VehicleType = id === 'newyork' && rng.chance(0.5) ? 'taxi' : 'car';
      const model = buildVehicleModel(type, type === 'taxi' ? undefined : rng.pick(colors)).group;
      const obj = new THREE.Group();
      obj.add(mergeModel(model));
      this.group.add(obj);
      this.cars.push({ obj, loop, seg: rng.int(0, 3), t: rng.next(), pos: loop[0].clone(), yaw: 0, speed: 8 + rng.range(0, 3), radius: 1.7 });
    }
  }

  update(dt: number, player: THREE.Vector3, playerVehicle: { pos: THREE.Vector3 } | null) {
    for (const c of this.cars) {
      const visible = c.pos.distanceTo(player) < 320;
      c.obj.visible = visible;
      const a = c.loop[c.seg], b = c.loop[(c.seg + 1) % c.loop.length];
      const len = a.distanceTo(b);
      // arrêt si le joueur est devant
      const fwd = new THREE.Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw));
      const targets = [player, ...(playerVehicle ? [playerVehicle.pos] : [])];
      let blocked = false;
      for (const t of targets) {
        const to = new THREE.Vector3(t.x - c.pos.x, 0, t.z - c.pos.z);
        const ahead = to.dot(fwd);
        const side = Math.abs(to.x * fwd.z - to.z * fwd.x);
        if (ahead > 0 && ahead < 9 && side < 2.4) blocked = true;
      }
      const v = blocked ? 0 : c.speed;
      c.t += (v * dt) / len;
      if (c.t >= 1) {
        c.t -= 1;
        c.seg = (c.seg + 1) % c.loop.length;
      }
      const a2 = c.loop[c.seg], b2 = c.loop[(c.seg + 1) % c.loop.length];
      c.pos.lerpVectors(a2, b2, c.t);
      if (!visible) continue;
      c.pos.y = groundAt(c.pos.x, c.pos.z, c.pos.y + 1.5);
      const target = Math.atan2(b2.x - a2.x, b2.z - a2.z);
      c.yaw = dampAngle(c.yaw, target, 5, dt);
      c.obj.position.copy(c.pos);
      c.obj.rotation.y = c.yaw;
    }
  }
}
