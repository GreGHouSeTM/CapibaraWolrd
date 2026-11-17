// Arbres stylisés instanciés (feuillage « nuage » à l'éclairage doux), répartis par cellules pour le culling.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng, fbm } from '../core/math';
import { heightAt, splatAt } from './heightmap';
import { grassDensityAt } from './grass';
import { REGIONS, RegionId } from './layout';
import { addCircle } from './physics';

export type TreeKind = 'oak' | 'pine' | 'cherry' | 'palm' | 'plane' | 'cactus' | 'birch' | 'snowpine' | 'bamboo';

export const windUniform = { value: 0 };

function foliageMaterial(color: THREE.ColorRepresentation, emissive = 0) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, vertexColors: true, emissive: new THREE.Color(color), emissiveIntensity: emissive });
  m.onBeforeCompile = (s) => {
    s.uniforms.uWind = windUniform;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float sway = sin(uWind * 1.3 + ip.x * 0.07 + ip.z * 0.05) * 0.5 + sin(uWind * 2.7 + ip.x * 0.3) * 0.2;
        transformed.x += sway * 0.08 * max(0.0, position.y);
        transformed.z += sway * 0.05 * max(0.0, position.y);`,
      );
  };
  m.customProgramCacheKey = () => 'foliage';
  return m;
}

/** Boule de feuillage avec normales « sphériques » (rendu doux type peinture). */
function blob(cx: number, cy: number, cz: number, r: number, rng: Rng, detail = 2) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = 1 + (fbm(x * 2 + cx, z * 2 + cy * 3, 2) * 0.22 + rng.range(-0.05, 0.05));
    pos.setXYZ(i, x * n + cx, y * n * 0.9 + cy, z * n + cz);
    const l = Math.hypot(x, y, z);
    nor.setXYZ(i, x / l, y / l, z / l);
    const shade = 0.6 + 0.4 * ((y / r) * 0.5 + 0.5);
    col.set([shade, shade, shade], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function colorize(g: THREE.BufferGeometry, v = 1) {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3).fill(v);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

interface TreeModel {
  trunk: THREE.BufferGeometry;
  leaves: THREE.BufferGeometry;
  trunkMat: THREE.Material;
  leafMat: THREE.Material;
  radius: number;
}

const ni = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);

const models = new Map<TreeKind, TreeModel>();
function model(kind: TreeKind): TreeModel {
  const m = models.get(kind);
  if (m) return m;
  const rng = new Rng(kind.length * 977);
  const bark = new THREE.MeshStandardMaterial({ color: 0x6a4a32, roughness: 0.95 });
  let trunk: THREE.BufferGeometry, leaves: THREE.BufferGeometry, leafMat: THREE.Material, trunkMat: THREE.Material = bark, radius = 0.5;
  switch (kind) {
    case 'oak':
    case 'plane':
    case 'birch':
    case 'cherry': {
      const h = kind === 'birch' ? 5 : 3.2;
      trunk = new THREE.CylinderGeometry(0.22, 0.38, h + 1, 8);
      trunk.translate(0, (h + 1) / 2, 0);
      const parts: THREE.BufferGeometry[] = [];
      const n = kind === 'birch' ? 4 : 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
        const rr = i === 0 ? 0 : rng.range(1.0, 1.8);
        parts.push(blob(Math.cos(a) * rr, h + 1.2 + rng.range(-0.4, 1.4), Math.sin(a) * rr, rng.range(1.5, 2.2) * (kind === 'birch' ? 0.75 : 1), rng));
      }
      parts.push(blob(0, h + 2.6, 0, 1.9, rng));
      leaves = mergeGeometries(parts.map((p) => p.index ? p.toNonIndexed() : p))!;
      const color = kind === 'cherry' ? 0xffb0c8 : kind === 'birch' ? 0x9cc94a : kind === 'plane' ? 0x6f9a3c : 0x5f9c38;
      leafMat = foliageMaterial(color, kind === 'cherry' ? 0.08 : 0.0);
      if (kind === 'birch') trunkMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d8, roughness: 0.8 });
      if (kind === 'cherry') trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3028, roughness: 0.9 });
      radius = 0.5;
      break;
    }
    case 'pine':
    case 'snowpine': {
      trunk = new THREE.CylinderGeometry(0.18, 0.3, 3, 7);
      trunk.translate(0, 1.5, 0);
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 4; i++) {
        const r = 2.4 - i * 0.5, y = 2 + i * 1.6;
        const c = new THREE.ConeGeometry(r, 2.8, 9, 1);
        c.translate(0, y + 1.4, 0);
        const pos = c.attributes.position as THREE.BufferAttribute;
        const col = new Float32Array(pos.count * 3);
        for (let k = 0; k < pos.count; k++) {
          const yy = pos.getY(k) - y;
          const snow = kind === 'snowpine' && yy > 0.6 ? 1 : 0;
          const s = 0.65 + 0.35 * (yy / 2.8 + 0.5);
          col.set(snow ? [2.2, 2.3, 2.4] : [s, s, s], k * 3);
        }
        c.setAttribute('color', new THREE.BufferAttribute(col, 3));
        parts.push(ni(c));
      }
      leaves = mergeGeometries(parts)!;
      leafMat = foliageMaterial(kind === 'snowpine' ? 0x3c6a4a : 0x2f6a3a);
      radius = 0.45;
      break;
    }
    case 'palm': {
      const segs: THREE.BufferGeometry[] = [];
      let x = 0, y = 0;
      for (let i = 0; i < 8; i++) {
        const c = new THREE.CylinderGeometry(0.2 - i * 0.01, 0.25 - i * 0.01, 1.0, 7);
        c.translate(x, y + 0.5, 0);
        segs.push(c);
        y += 0.98;
        x += 0.06 * i;
      }
      trunk = mergeGeometries(segs)!;
      const fr: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 9; i++) {
        const leaf = new THREE.PlaneGeometry(0.9, 3.6, 1, 6);
        const pos = leaf.attributes.position as THREE.BufferAttribute;
        for (let k = 0; k < pos.count; k++) {
          const t = (pos.getY(k) + 1.8) / 3.6;
          pos.setXYZ(k, pos.getX(k) * (1 - t * 0.7), 0, t * 3.4);
          pos.setY(k, -t * t * 1.4 + t * 0.6);
        }
        leaf.computeVertexNormals();
        leaf.rotateY((i / 9) * Math.PI * 2);
        leaf.translate(x, y, 0);
        colorize(leaf, 1);
        fr.push(leaf);
      }
      const coco = blob(x, y - 0.2, 0, 0.35, rng, 1);
      fr.push(ni(coco));
      leaves = mergeGeometries(fr.map((g) => (g.index ? g.toNonIndexed() : g)))!;
      leafMat = foliageMaterial(0x4f8f2f);
      (leafMat as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.95 });
      radius = 0.4;
      break;
    }
    case 'cactus': {
      const parts: THREE.BufferGeometry[] = [];
      const main = new THREE.CapsuleGeometry(0.35, 3, 4, 10);
      main.translate(0, 1.85, 0);
      parts.push(main);
      for (const s of [-1, 1]) {
        const arm = new THREE.CapsuleGeometry(0.22, 1.1, 4, 8);
        arm.translate(s * 0.75, 2.2 + s * 0.3, 0);
        const join = new THREE.CapsuleGeometry(0.2, 0.5, 4, 8);
        join.rotateZ(Math.PI / 2);
        join.translate(s * 0.45, 1.7 + s * 0.3, 0);
        parts.push(arm, join);
      }
      leaves = mergeGeometries(parts.map((g) => colorize(ni(g), 1)))!;
      trunk = new THREE.CylinderGeometry(0.01, 0.01, 0.01);
      leafMat = new THREE.MeshStandardMaterial({ color: 0x4f8a3f, roughness: 0.7, vertexColors: true });
      radius = 0.5;
      break;
    }
    case 'bamboo': {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 7; i++) {
        const c = new THREE.CylinderGeometry(0.06, 0.07, 7 + rng.range(0, 3), 6);
        c.translate(rng.range(-0.8, 0.8), 4, rng.range(-0.8, 0.8));
        parts.push(colorize(ni(c), 1));
      }
      trunk = mergeGeometries(parts)!;
      const lv: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 6; i++) lv.push(ni(blob(rng.range(-0.6, 0.6), 7 + rng.range(0, 2), rng.range(-0.6, 0.6), 0.9, rng, 1)));
      leaves = mergeGeometries(lv)!;
      leafMat = foliageMaterial(0x7fb84a);
      trunkMat = new THREE.MeshStandardMaterial({ color: 0x9cbf5a, roughness: 0.6 });
      radius = 0.8;
      break;
    }
  }
  const mm: TreeModel = { trunk: trunk!, leaves: leaves!, trunkMat, leafMat: leafMat!, radius };
  models.set(kind, mm);
  return mm;
}

/** Collection d'instances d'arbres, regroupées par (espèce, cellule). */
export class Forest {
  group = new THREE.Group();
  private items = new Map<string, { kind: TreeKind; mats: THREE.Matrix4[] }>();
  private cell = 220;

  add(kind: TreeKind, x: number, z: number, scale = 1, rot = Math.random() * 6.28, y?: number, collide = true) {
    const key = `${kind}|${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`;
    let it = this.items.get(key);
    if (!it) this.items.set(key, (it = { kind, mats: [] }));
    const yy = y ?? heightAt(x, z) - 0.2;
    it.mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, yy, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(scale, scale, scale)));
    if (collide) addCircle(x, z, model(kind).radius * scale, yy, yy + 6 * scale, false, 'thin');
  }

  build() {
    for (const { kind, mats } of this.items.values()) {
      const md = model(kind);
      for (const [geo, mat] of [[md.trunk, md.trunkMat], [md.leaves, md.leafMat]] as const) {
        const im = new THREE.InstancedMesh(geo, mat, mats.length);
        mats.forEach((m, i) => im.setMatrixAt(i, m));
        im.castShadow = true;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        this.group.add(im);
      }
    }
    this.items.clear();
    return this.group;
  }
}

/** Plante la végétation naturelle sur tout le continent. */
export function scatterNature(forest: Forest, avoid: (x: number, z: number) => boolean, density = 1) {
  const rng = new Rng(2024);
  const kindsFor = (id: RegionId, x: number, z: number): TreeKind[] => {
    switch (id) {
      case 'japan': return ['cherry', 'cherry', 'pine', 'oak', 'bamboo'];
      case 'desert': return ['palm', 'cactus', 'cactus'];
      case 'pole': return ['snowpine'];
      case 'london': return ['oak', 'birch', 'plane'];
      case 'paris': return ['plane', 'oak'];
      case 'newyork': return ['oak', 'birch', 'pine'];
      default: return fbm(x / 300, z / 300, 2) > 0.1 ? ['pine', 'oak'] : ['oak', 'oak', 'birch'];
    }
  };
  const N = Math.round(26000 * density);
  for (let i = 0; i < N; i++) {
    const x = rng.range(-1250, 1250), z = rng.range(-1250, 1250);
    const h = heightAt(x, z);
    if (h < 1.2) continue;
    if (avoid(x, z)) continue;
    // forêts regroupées par bruit
    const f = fbm(x / 260 + 11, z / 260 - 5, 3);
    let near = REGIONS[0], bd = Infinity;
    for (const r of REGIONS) {
      const d = Math.hypot(x - r.x, z - r.z) / r.radius;
      if (d < bd) { bd = d; near = r; }
    }
    const [g, sand, snow, rock] = splatAt(x, z);
    let p = 0;
    if (near.id === 'desert') p = sand > 0.5 ? 0.03 : 0.2;
    else if (near.id === 'pole') p = snow > 0.5 ? (f > 0.05 ? 0.35 : 0.05) : 0.3;
    else p = g > 0.4 ? (f > 0.08 ? 0.9 : f > -0.1 ? 0.12 : 0.02) : 0.02;
    if (rock > 0.5) p *= 0.2;
    if (rng.next() > p) continue;
    if (grassDensityAt(x, z) < 0.1 && near.id !== 'pole' && near.id !== 'desert') continue;
    const kind = rng.pick(kindsFor(near.id, x, z));
    forest.add(kind, x, z, rng.range(0.8, 1.35));
  }
}
