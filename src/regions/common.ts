// Types partagés par les régions et petits éléments de mobilier.
import * as THREE from 'three';
import { Batch, std } from '../procgen/kit';
import { glowMat } from '../procgen/monuments';
import { addBox, addCircle } from '../world/physics';
import { RegionId } from '../world/layout';
import { Forest } from '../world/vegetation';
import type { HatId } from '../actors/capybara';

export type VehicleType = 'car' | 'taxi' | 'scooter' | 'bus' | 'snowmobile' | 'boat' | 'jeep';

export interface NpcDef {
  id: string;
  name: string;
  pos: THREE.Vector3;
  rot?: number;
  fur?: number;
  hat?: HatId;
  scarf?: number;
  size?: number;
  kind?: 'capy' | 'penguin';
}

export interface PhotoSpot {
  id: string;
  name: string;
  region: RegionId;
  target: THREE.Vector3; // point visé
  radius: number; // distance max pour réussir la photo
}

export interface Interactable {
  id: string;
  pos: THREE.Vector3;
  radius: number;
  label: string;
  action: () => void;
}

export interface RegionContent {
  id: RegionId;
  group: THREE.Group;
  update: ((time: number, dt: number, ctx: UpdateCtx) => void)[];
  spots: Record<string, THREE.Vector3>;
  npcs: NpcDef[];
  vehicles: { type: VehicleType; pos: THREE.Vector3; rot: number }[];
  photos: PhotoSpot[];
  interact: Interactable[];
  walkPoints: THREE.Vector3[];
  roadPoints: THREE.Vector3[];
  loops: THREE.Vector3[][];
}

export interface UpdateCtx {
  hour: number;
  night: number;
  playerPos: THREE.Vector3;
}

export interface BuildCtx {
  forest: Forest;
  teleport: (pos: THREE.Vector3, label: string) => void;
}

export function emptyContent(id: RegionId): RegionContent {
  return { id, group: new THREE.Group(), update: [], spots: {}, npcs: [], vehicles: [], photos: [], interact: [], walkPoints: [], roadPoints: [], loops: [] };
}

// --------------------------------------------------------------- mobilier
const M = {
  wood: std(0x8a5a36, 0.85),
  iron: std(0x22262a, 0.5, 0.7),
  white: std(0xf4f1ea, 0.6),
  red: std(0xc8202a, 0.5),
  green: std(0x2f5f3a, 0.6),
  cloth: std(0xc8303a, 0.9, 0, { side: THREE.DoubleSide }),
  clothW: std(0xf5efe0, 0.9, 0, { side: THREE.DoubleSide }),
};

export function bench(b: Batch, x: number, y: number, z: number, rot: number) {
  const seat = new THREE.BoxGeometry(1.8, 0.08, 0.45).translate(0, 0.45, 0);
  const back = new THREE.BoxGeometry(1.8, 0.4, 0.06).translate(0, 0.75, -0.2);
  b.addAt(seat, M.wood, x, y, z, rot);
  b.addAt(back, M.wood, x, y, z, rot);
  for (const s of [-0.8, 0.8]) b.addAt(new THREE.BoxGeometry(0.06, 0.45, 0.45).translate(s, 0.22, 0), M.iron, x, y, z, rot);
  addCircle(x, z, 0.7, y, y + 0.8);
}

export function cafeTable(b: Batch, x: number, y: number, z: number, color = 0xc8303a) {
  const top = new THREE.CylinderGeometry(0.45, 0.45, 0.04, 16).translate(0, 0.75, 0);
  b.addAt(top, M.white, x, y, z);
  b.addAt(new THREE.CylinderGeometry(0.04, 0.06, 0.75).translate(0, 0.37, 0), M.iron, x, y, z);
  for (let k = 0; k < 2; k++) {
    const a = k * Math.PI + 0.4;
    const cx = x + Math.cos(a) * 0.75, cz = z + Math.sin(a) * 0.75;
    b.addAt(new THREE.BoxGeometry(0.42, 0.05, 0.42).translate(0, 0.45, 0), M.wood, cx, y, cz, a);
    b.addAt(new THREE.BoxGeometry(0.42, 0.45, 0.05).translate(0, 0.68, 0.2), M.wood, cx, y, cz, a + Math.PI / 2);
  }
  // parasol
  const umb = new THREE.ConeGeometry(1.4, 0.5, 8, 1, true).translate(0, 2.4, 0);
  b.addAt(umb, color === 0xc8303a ? M.cloth : std(color, 0.9, 0, { side: THREE.DoubleSide }), x, y, z);
  b.addAt(new THREE.CylinderGeometry(0.03, 0.03, 2.4).translate(0, 1.2, 0), M.iron, x, y, z);
  addCircle(x, z, 0.9, y, y + 1);
}

export function phoneBooth(b: Batch, x: number, y: number, z: number, rot: number) {
  b.addAt(new THREE.BoxGeometry(1, 2.5, 1).translate(0, 1.25, 0), M.red, x, y, z, rot);
  b.addAt(new THREE.BoxGeometry(1.1, 0.25, 1.1).translate(0, 2.6, 0), M.red, x, y, z, rot);
  const glass = glowMat(0xfff2c4, 0.8);
  for (let k = 0; k < 4; k++) b.addAt(new THREE.PlaneGeometry(0.7, 1.4).translate(0, 1.4, 0.51), glass, x, y, z, rot + (k * Math.PI) / 2, false);
  addBox(x, z, 1, 1, y, y + 2.7);
}

export function hydrant(b: Batch, x: number, y: number, z: number, color = 0xc8202a) {
  const m = std(color, 0.5, 0.3);
  b.addAt(new THREE.CylinderGeometry(0.15, 0.18, 0.7, 10).translate(0, 0.35, 0), m, x, y, z);
  b.addAt(new THREE.SphereGeometry(0.16, 10, 6).translate(0, 0.72, 0), m, x, y, z);
}

export function morrisColumn(b: Batch, x: number, y: number, z: number) {
  b.addAt(new THREE.CylinderGeometry(0.75, 0.75, 3, 16).translate(0, 1.5, 0), std(0x2f5a3c, 0.6), x, y, z);
  b.addAt(new THREE.CylinderGeometry(0.85, 0.9, 0.6, 16).translate(0, 3.2, 0), std(0x2f5a3c, 0.6), x, y, z);
  b.addAt(new THREE.SphereGeometry(0.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 3.5, 0), std(0x2f5a3c, 0.6), x, y, z);
  b.addAt(new THREE.CylinderGeometry(0.77, 0.77, 2, 16, 1, true).translate(0, 1.7, 0), std(0xe8c070, 0.9), x, y, z);
  addCircle(x, z, 0.8, y, y + 3.6);
}

export function fountain(b: Batch, x: number, y: number, z: number, r = 5) {
  const stone = std(0xd8cfbf, 0.9);
  const ring = new THREE.TorusGeometry(r, 0.4, 8, 32);
  ring.rotateX(Math.PI / 2);
  b.addAt(ring.translate(0, 0.5, 0), stone, x, y, z);
  b.addAt(new THREE.CylinderGeometry(r, r, 0.2, 32).translate(0, 0.1, 0), stone, x, y, z);
  b.addAt(new THREE.CylinderGeometry(0.4, 0.6, 2.4, 12).translate(0, 1.2, 0), stone, x, y, z);
  b.addAt(new THREE.CylinderGeometry(1.6, 1, 0.4, 16).translate(0, 2.4, 0), stone, x, y, z);
  const water = new THREE.MeshStandardMaterial({ color: 0x5fb8c8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.8 });
  b.addAt(new THREE.CylinderGeometry(r - 0.2, r - 0.2, 0.05, 32).translate(0, 0.6, 0), water, x, y, z, 0, false);
  addCircle(x, z, r + 0.4, y, y + 0.9);
}

/** Panneau indicateur en bois avec plusieurs flèches. */
export function signpost(b: Batch, x: number, y: number, z: number, arrows: { text: string; angle: number }[]) {
  b.addAt(new THREE.CylinderGeometry(0.1, 0.12, 3.4, 8).translate(0, 1.7, 0), M.wood, x, y, z);
  arrows.forEach((a, i) => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 48;
    const g = c.getContext('2d')!;
    g.fillStyle = '#d8b27a'; g.fillRect(0, 0, 256, 48);
    g.strokeStyle = '#7a5530'; g.lineWidth = 4; g.strokeRect(2, 2, 252, 44);
    g.fillStyle = '#3a2410'; g.font = 'bold 26px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(a.text, 120, 25);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.18); shape.lineTo(1.5, -0.18); shape.lineTo(1.75, 0); shape.lineTo(1.5, 0.18); shape.lineTo(0, 0.18); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false });
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const nrm = geo.attributes.normal as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) {
      const u = pos.getX(k) / 1.75;
      // face arrière : texture retournée pour que le texte ne soit pas en miroir
      uv.setXY(k, nrm.getZ(k) < -0.5 ? 1 - u : u, (pos.getY(k) + 0.18) / 0.36);
    }
    geo.translate(0.1, 2.9 - i * 0.45, -0.025);
    b.addAt(geo, mat, x, y, z, a.angle);
  });
  addCircle(x, z, 0.2, y, y + 3.4);
}

export function rock(b: Batch, mat: THREE.Material, x: number, y: number, z: number, s: number, seed: number) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
    const n = 1 + Math.sin(vx * 3.1 + seed) * 0.15 + Math.sin(vy * 4.3 + seed * 2) * 0.12 + Math.sin(vz * 2.7 - seed) * 0.15;
    pos.setXYZ(i, vx * n, vy * n * 0.75, vz * n);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) + pos.getZ(i), pos.getY(i));
  b.add(g, mat, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, seed, 0)), new THREE.Vector3(s, s, s)));
  addCircle(x, z, s * 0.9, y - s, y + s * 0.7, true);
}
