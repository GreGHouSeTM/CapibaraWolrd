// Générateur de ville générique : grille de rues, trottoirs surélevés, îlots d'immeubles, parcs, places,
// ponts et quais. Chaque ville fournit son « style » (façades, hauteurs, toits, mobilier urbain).
import * as THREE from 'three';
import { Rng } from '../core/math';
import { pbr } from '../core/assets';
import { Batch, facadeBox, slab, std, nightMaterials, GeoBuilder } from './kit';
import { FacadeSet } from './facades';
import { addBox } from '../world/physics';
import { paveRect } from '../world/grass';
import { riverDistance, RIVERS, heightAt } from '../world/heightmap';
import { RegionDef } from '../world/layout';
import { Forest, TreeKind } from '../world/vegetation';
import { facadeMaterial } from './kit';

export type BlockKind = 'buildings' | 'park' | 'plaza' | 'skip' | 'special';

export interface Block {
  i: number; j: number;
  x: number; z: number; // centre
  w: number; d: number; // taille (sans la rue)
  kind: BlockKind;
}

export interface CityStyle {
  facades: FacadeSet[];
  shops?: FacadeSet[];
  floorH: number;
  bayW: number;
  shopH: number;
  /** nombre d'étages (hors rez-de-chaussée commerçant) */
  floors: (rng: Rng, x: number, z: number) => number;
  lotWidth: [number, number];
  lotDepth: [number, number];
  roof: (b: Batch, x: number, z: number, w: number, d: number, top: number, rng: Rng, facade: FacadeSet) => void;
  /** Bâtiment entier personnalisé (ex : tours à gradins de New York). Renvoie la hauteur ou null. */
  custom?: (b: Batch, x: number, z: number, w: number, d: number, y0: number, rng: Rng) => number | null;
  lamp: 'paris' | 'london' | 'ny' | 'japan';
  streetTree?: TreeKind;
  roadTex?: 'asphalt' | 'cobble';
}

export interface CityParams {
  region: RegionDef;
  halfX: number;
  halfZ: number;
  block: number;
  street: number;
  style: CityStyle;
  seed: number;
  kindOf: (b: Block) => BlockKind;
  forest: Forest;
}

export interface City {
  group: THREE.Group;
  blocks: Block[];
  streetsX: number[]; // abscisses des rues nord-sud
  streetsZ: number[];
  ground: number;
  /** points de trottoir utiles pour placer PNJ, collectibles… */
  sidewalkPoints: THREE.Vector3[];
  roadPoints: THREE.Vector3[];
  /** boucles de circulation autour des îlots (sens antihoraire, voie de droite) */
  loops: THREE.Vector3[][];
}

/** Emprise des villes (cellules rue + îlot), pour que les routes s'arrêtent à leur bord. */
export const cityFootprints: { x: number; z: number; half: number }[] = [];
export function insideCity(x: number, z: number, margin = 0) {
  for (const c of cityFootprints) if (Math.abs(x - c.x) < c.half + margin && Math.abs(z - c.z) < c.half + margin) return true;
  return false;
}

let lampMats: Record<string, THREE.Material> | null = null;
function lampMaterials() {
  if (lampMats) return lampMats;
  const glow = new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffd27a, emissiveIntensity: 0, roughness: 0.3 });
  glow.userData.emissiveBoost = 4;
  nightMaterials.push(glow);
  lampMats = {
    iron: std(0x1c2420, 0.5, 0.6),
    black: std(0x121212, 0.45, 0.7),
    grey: std(0x707880, 0.4, 0.8),
    glow,
  };
  return lampMats;
}

export function addLamp(b: Batch, kind: CityStyle['lamp'], x: number, y: number, z: number, rot = 0) {
  const m = lampMaterials();
  const post = new THREE.CylinderGeometry(0.07, 0.11, 4.6, 8);
  post.translate(0, 2.3, 0);
  const base = new THREE.CylinderGeometry(0.2, 0.25, 0.6, 8);
  base.translate(0, 0.3, 0);
  b.addAt(base, kind === 'ny' ? m.grey : m.iron, x, y, z, rot);
  b.addAt(post, kind === 'ny' ? m.grey : kind === 'london' ? m.black : m.iron, x, y, z, rot);
  if (kind === 'ny') {
    const arm = new THREE.BoxGeometry(0.1, 0.1, 1.6);
    arm.translate(0, 4.6, 0.7);
    b.addAt(arm, m.grey, x, y, z, rot);
    const head = new THREE.BoxGeometry(0.35, 0.15, 0.6);
    head.translate(0, 4.55, 1.4);
    b.addAt(head, m.glow, x, y, z, rot, false);
  } else if (kind === 'japan') {
    const box = new THREE.BoxGeometry(0.5, 0.6, 0.5);
    box.translate(0, 4.4, 0);
    b.addAt(box, m.glow, x, y, z, rot, false);
    const cap = new THREE.ConeGeometry(0.5, 0.3, 4);
    cap.rotateY(Math.PI / 4);
    cap.translate(0, 4.85, 0);
    b.addAt(cap, m.black, x, y, z, rot);
  } else {
    // lanterne (Paris / Londres)
    const lan = new THREE.CylinderGeometry(0.22, 0.14, 0.6, 6);
    lan.translate(0, 4.95, 0);
    b.addAt(lan, m.glow, x, y, z, rot, false);
    const cap = new THREE.ConeGeometry(0.32, 0.35, 6);
    cap.translate(0, 5.4, 0);
    b.addAt(cap, kind === 'london' ? m.black : m.iron, x, y, z, rot);
  }
}

export function buildCity(p: CityParams): City {
  const { region, halfX, halfZ, block, street, style, seed, forest } = p;
  const rng = new Rng(seed);
  const G = region.ground;
  const batch = new Batch(120);
  const pitch = block + street;
  const nx = Math.floor((halfX * 2) / pitch), nz = Math.floor((halfZ * 2) / pitch);
  const x0 = region.x - (nx * pitch) / 2, z0 = region.z - (nz * pitch) / 2;
  const streetsX: number[] = [], streetsZ: number[] = [];
  for (let i = 0; i <= nx; i++) streetsX.push(x0 + i * pitch);
  for (let j = 0; j <= nz; j++) streetsZ.push(z0 + j * pitch);

  const roadMat = pbr(style.roadTex ?? 'asphalt', { scale: style.roadTex === 'cobble' ? 3 : 6, roughness: 1 });
  const walkMat = pbr('sidewalk', { scale: 3, roughness: 1, color: 0xd8d4cc });
  const plazaMat = pbr('cobble', { scale: 3, roughness: 1, color: 0xe0d8c8 });
  const curbMat = std(0xa8a49c, 0.85);
  const lineMat = std(0xf2f2ea, 0.6);
  const quayMat = pbr('cobble', { scale: 2.5, roughness: 1, color: 0xd8ccb4 });

  const blocks: Block[] = [];
  const sidewalkPoints: THREE.Vector3[] = [];
  const roadPoints: THREE.Vector3[] = [];

  const riverHit = (cx: number, cz: number, w: number, d: number) => {
    for (let a = -0.5; a <= 0.5; a += 0.25)
      for (let c = -0.5; c <= 0.5; c += 0.25) {
        const r = riverDistance(cx + a * w, cz + c * d);
        if (r.river && r.d < r.river.width / 2 + 4) return true;
      }
    return false;
  };

  // --- Cellules : chaussée + îlot ---
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const cx = x0 + (i + 0.5) * pitch, cz = z0 + (j + 0.5) * pitch;
      const bl: Block = { i, j, x: cx, z: cz, w: block, d: block, kind: 'buildings' };
      // forme arrondie de la ville
      const ex = (cx - region.x) / halfX, ez = (cz - region.z) / halfZ;
      if (ex * ex + ez * ez > 1.05) continue;
      const wet = riverHit(cx, cz, pitch, pitch);
      if (!wet && Math.min(heightAt(cx - pitch / 2, cz - pitch / 2), heightAt(cx + pitch / 2, cz + pitch / 2), heightAt(cx + pitch / 2, cz - pitch / 2), heightAt(cx - pitch / 2, cz + pitch / 2)) < G - 2.5) continue;
      bl.kind = wet ? 'skip' : p.kindOf(bl);
      blocks.push(bl);
      cityFootprints.push({ x: cx, z: cz, half: pitch / 2 });
      if (!wet) {
        // chaussée
        batch.addAt(slab(pitch, pitch, -0.3, 0.32, 1), roadMat, cx, G, cz, 0, false);
        paveRect(cx, cz, pitch, pitch, 0, 0);
        addBox(cx, cz, pitch, pitch, G - 2, G + 0.02, 0, true);
      }
    }

  // --- Ponts là où une rue traverse la rivière ---
  const bridgeMat = pbr('cobble', { scale: 3, roughness: 1, color: 0xcfc2a8 });
  const deckMat = roadMat;
  for (const bl of blocks) {
    if (bl.kind !== 'skip') continue;
    // rues nord-sud (x = rue à gauche de la cellule)
    for (const sx of [bl.x - pitch / 2]) {
      // seulement si cette rue sort sur une cellule sèche des deux côtés
      const north = blocks.find((b) => b.i === bl.i && b.j === bl.j - 1);
      const south = blocks.find((b) => b.i === bl.i && b.j === bl.j + 1);
      if (!north || !south) continue;
      if (bl.i % 2 === 1) continue; // un pont sur deux
      const len = pitch;
      const w = street + 4;
      batch.addAt(slab(w, len, -1.4, 1.45, 3), bridgeMat, sx, G, bl.z, 0);
      batch.addAt(slab(street, len, 0.03, 0.03, 6), deckMat, sx, G, bl.z, 0, false);
      for (const s of [-1, 1]) {
        batch.addAt(slab(0.6, len, 0.05, 1.0, 2), bridgeMat, sx + s * (w / 2 - 0.3), G, bl.z, 0);
        addBox(sx + s * (w / 2 - 0.3), bl.z, 0.6, len, G, G + 1.05);
        for (let k = -len / 2 + 8; k < len / 2; k += 16) addLamp(batch, style.lamp, sx + s * (w / 2 - 0.3), G + 1.05, bl.z + k);
      }
      // arches sous le tablier
      const pier = new THREE.BoxGeometry(w, 4.5, 3);
      for (const k of [-len / 4, len / 4]) {
        const r = riverDistance(sx, bl.z + k);
        if (r.river && r.d < r.river.width / 2) batch.addAt(pier, bridgeMat, sx, G - 3.7, bl.z + k);
      }
      addBox(sx, bl.z, w, len, G - 1.4, G + 0.06, 0, true);
      roadPoints.push(new THREE.Vector3(sx, G, bl.z));
    }
  }

  // --- Quais le long des rivières ---
  for (const rv of RIVERS) {
    if (rv.region !== region.id) continue;
    for (const side of [-1, 1]) {
      const gb = new GeoBuilder();
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < rv.pts.length - 1; i++) {
        const [ax, az] = rv.pts[i], [bx, bz] = rv.pts[i + 1];
        const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 6);
        for (let k = 0; k < n; k++) {
          const t = k / n;
          pts.push(new THREE.Vector3(ax + (bx - ax) * t, 0, az + (bz - az) * t));
        }
      }
      let u = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const dir = new THREE.Vector3().subVectors(b, a).normalize();
        const nrm = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side * (rv.width / 2 + 0.5));
        const pa = a.clone().add(nrm), pb = b.clone().add(nrm);
        if (Math.abs(pa.x - region.x) > halfX + 30 || Math.abs(pa.z - region.z) > halfZ + 30) continue;
        const len = pa.distanceTo(pb);
        const lo = -3.6, hi = G + 0.25;
        const A = new THREE.Vector3(pa.x, lo, pa.z), B = new THREE.Vector3(pb.x, lo, pb.z);
        const C = new THREE.Vector3(pb.x, hi, pb.z), D = new THREE.Vector3(pa.x, hi, pa.z);
        const s = 1 / 2.5;
        if (side > 0) gb.quad(B, A, D, C, [[u + len * s, 0], [u, 0], [u, (hi - lo) * s], [u + len * s, (hi - lo) * s]]);
        else gb.quad(A, B, C, D, [[u, 0], [u + len * s, 0], [u + len * s, (hi - lo) * s], [u, (hi - lo) * s]]);
        u += len * s;
        // garde-corps
        const mid = pa.clone().add(pb).multiplyScalar(0.5);
        const rail = new THREE.BoxGeometry(0.5, 0.9, len + 0.1);
        batch.add(rail, curbMat, new THREE.Matrix4().makeRotationY(Math.atan2(dir.x, dir.z)).setPosition(mid.x, G + 0.45, mid.z));
        addBox(mid.x, mid.z, 0.5, len + 0.2, G - 0.5, G + 0.9, Math.atan2(dir.x, dir.z) * -1 + 0, false);
      }
      batch.add(gb.build(), quayMat, undefined, false);
    }
  }

  // --- Îlots ---
  const walkH = 0.18;
  for (const bl of blocks) {
    if (bl.kind === 'skip') continue;
    const { x, z, w, d } = bl;
    if (bl.kind === 'park') {
      // bordure + allées : le terrain d'herbe reste visible
      for (const [ox, oz, ww, dd] of [[0, d / 2 - 1.5, w, 3], [0, -d / 2 + 1.5, w, 3], [w / 2 - 1.5, 0, 3, d - 6], [-w / 2 + 1.5, 0, 3, d - 6]] as const) {
        batch.addAt(slab(ww, dd, 0, walkH, 3), walkMat, x + ox, G, z + oz, 0, false);
        addBox(x + ox, z + oz, ww, dd, G - 1, G + walkH, 0, true);
      }
      batch.addAt(slab(w - 6, d - 6, -0.25, 0.3, 4), pbr('grass', { scale: 4, color: 0x9ccf6a }), x, G, z, 0, false);
      paveRect(x, z, w - 6, d - 6, 0, 230);
      addBox(x, z, w - 6, d - 6, G - 1, G + 0.05, 0, true);
      // allées en croix
      batch.addAt(slab(3, d - 6, 0, 0.08, 3), plazaMat, x, G, z, 0, false);
      batch.addAt(slab(w - 6, 3, 0, 0.08, 3), plazaMat, x, G, z, 0, false);
      paveRect(x, z, 3.5, d - 6); paveRect(x, z, w - 6, 3.5);
      for (let k = 0; k < 10; k++) {
        const tx = x + rng.range(-w / 2 + 6, w / 2 - 6), tz = z + rng.range(-d / 2 + 6, d / 2 - 6);
        if (Math.abs(tx - x) < 4 || Math.abs(tz - z) < 4) continue;
        forest.add(style.streetTree ?? 'oak', tx, tz, rng.range(0.9, 1.3), undefined, G);
      }
      sidewalkPoints.push(new THREE.Vector3(x, G + 0.1, z));
      continue;
    }
    const mat = bl.kind === 'plaza' ? plazaMat : walkMat;
    batch.addAt(slab(w, d, 0, walkH, 3), mat, x, G, z, 0, false);
    // bordure de trottoir
    batch.addAt(slab(w + 0.3, d + 0.3, 0, walkH - 0.02, 2), curbMat, x, G, z, 0, false);
    addBox(x, z, w, d, G - 1, G + walkH, 0, true);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      sidewalkPoints.push(new THREE.Vector3(x + Math.cos(a) * (w / 2 - 1.5), G + walkH, z + Math.sin(a) * (d / 2 - 1.5)));
    }
    // lampadaires aux coins
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) addLamp(batch, style.lamp, x + sx * (w / 2 - 0.8), G + walkH, z + sz * (d / 2 - 0.8), Math.atan2(-sx, -sz));
    if (bl.kind === 'plaza' || bl.kind === 'special') continue;
    buildBlockBuildings(batch, style, x, z, w - 5, d - 5, G + walkH, rng);
  }

  // --- Marquages au sol : lignes et passages piétons ---
  const lineGeoH = new THREE.BoxGeometry(0.15, 0.02, 3);
  const zebra = new THREE.BoxGeometry(0.6, 0.02, 3.2);
  for (const bl of blocks) {
    if (bl.kind === 'skip') continue;
    // ligne centrale sur la rue à l'est et au sud de chaque îlot
    for (let k = -block / 2 + 4; k < block / 2 - 4; k += 6) {
      batch.addAt(lineGeoH, lineMat, bl.x + pitch / 2, G + 0.03, bl.z + k, 0, false);
      batch.addAt(lineGeoH, lineMat, bl.x + k, G + 0.03, bl.z + pitch / 2, Math.PI / 2, false);
    }
    for (let k = -street / 2 + 1; k < street / 2 - 1; k += 1.2) {
      batch.addAt(zebra, lineMat, bl.x + pitch / 2 + k, G + 0.03, bl.z + block / 2 - 2.2, Math.PI / 2 + Math.PI / 2, false);
      batch.addAt(zebra, lineMat, bl.x + block / 2 - 2.2, G + 0.03, bl.z + pitch / 2 + k, Math.PI / 2, false);
    }
    roadPoints.push(new THREE.Vector3(bl.x + pitch / 2, G, bl.z), new THREE.Vector3(bl.x, G, bl.z + pitch / 2));
    // arbres d'alignement
    if (style.streetTree && bl.kind === 'buildings' && rng.chance(0.5)) {
      for (let k = -block / 2 + 6; k < block / 2 - 4; k += 10) forest.add(style.streetTree, bl.x + k, bl.z + block / 2 - 1.6, rng.range(0.7, 0.9), undefined, G + walkH);
    }
  }

  // boucles de circulation
  const loops: THREE.Vector3[][] = [];
  const dry = (x: number, z: number) => heightAt(x, z) > G - 1.5 && !(riverDistance(x, z).river && riverDistance(x, z).d < 30);
  blocks.forEach((bl, k) => {
    if (bl.kind === 'skip' || k % 3 !== 0) return;
    const h = pitch / 2 - street * 0.25;
    const pts = [[-h, -h], [-h, h], [h, h], [h, -h]].map(([a, c]) => new THREE.Vector3(bl.x + a, G, bl.z + c));
    if (pts.every((p) => dry(p.x, p.z))) loops.push(pts);
  });
  const group = batch.build('city-' + region.id);
  return { group, blocks, streetsX, streetsZ, ground: G, sidewalkPoints, roadPoints, loops };
}

/** Remplit le pourtour d'un îlot avec des immeubles mitoyens. */
export function buildBlockBuildings(batch: Batch, style: CityStyle, cx: number, cz: number, w: number, d: number, y0: number, rng: Rng) {
  const lots: { x: number; z: number; w: number; d: number }[] = [];
  const depth = () => rng.range(style.lotDepth[0], style.lotDepth[1]);
  const dS = Math.min(depth(), d / 2), dN = Math.min(depth(), d / 2);
  // façades sud et nord sur toute la largeur
  for (const [zc, dd] of [[cz + d / 2 - dS / 2, dS], [cz - d / 2 + dN / 2, dN]] as const) {
    let x = cx - w / 2;
    while (x < cx + w / 2 - 1) {
      let lw = rng.range(style.lotWidth[0], style.lotWidth[1]);
      if (cx + w / 2 - (x + lw) < style.lotWidth[0]) lw = cx + w / 2 - x;
      lots.push({ x: x + lw / 2, z: zc, w: lw, d: dd });
      x += lw;
    }
  }
  // côtés est et ouest entre les deux
  const inner = d - dS - dN;
  if (inner > 4) {
    const zc = cz - d / 2 + dN + inner / 2;
    for (const s of [-1, 1]) {
      const dd = Math.min(depth(), w / 2);
      let z = zc - inner / 2;
      while (z < zc + inner / 2 - 1) {
        let lw = rng.range(style.lotWidth[0], style.lotWidth[1]);
        if (zc + inner / 2 - (z + lw) < style.lotWidth[0]) lw = zc + inner / 2 - z;
        lots.push({ x: cx + s * (w / 2 - dd / 2), z: z + lw / 2, w: dd, d: lw });
        z += lw;
      }
    }
  }
  for (const l of lots) building(batch, style, l.x, l.z, l.w - 0.05, l.d - 0.05, y0, rng);
}

export function building(batch: Batch, style: CityStyle, x: number, z: number, w: number, d: number, y0: number, rng: Rng) {
  if (style.custom) {
    const h = style.custom(batch, x, z, w, d, y0, rng);
    if (h !== null) {
      addBox(x, z, w, d, y0 - 1, y0 + h, 0, true, 'building');
      return;
    }
  }
  const set = rng.pick(style.facades);
  const mat = facadeMaterial(set);
  const floors = style.floors(rng, x, z);
  let y = y0;
  if (style.shops && style.shops.length) {
    const shop = rng.pick(style.shops);
    const sm = facadeMaterial(shop, { emissiveBoost: 1.2 });
    batch.addAt(facadeBox(w, d, 0, style.shopH, shop, style.bayW, style.shopH, rng.int(0, 3) * 0.25, 0), sm, x, y, z);
    y += style.shopH;
  }
  const h = floors * style.floorH;
  batch.addAt(facadeBox(w, d, 0, h, set, style.bayW, style.floorH, rng.int(0, 3) * 0.25, rng.int(0, 3) * 0.25), mat, x, y, z);
  y += h;
  style.roof(batch, x, z, w, d, y, rng, set);
  addBox(x, z, w, d, y0 - 1, y, 0, true, 'building');
}
