// Végétation de la vallée de Capyville (spécialité Végétation) : placement d'après zones.ts (FOREST_BELTS, FEATURE_TREES,
// ORCHARD, TALL_GRASS_ZONES, FIELDS, PATHS, BUILDINGS…), forêts sur les pentes, lisières, sous-bois, berges, susuki,
// riz, théiers, pétales au sol. Tout est instancié (FloraLayer) avec LOD et imposteurs.
import * as THREE from 'three';
import {
  BRIDGES, BUILDINGS, FEATURE_TREES, FIELDS, FOREST_BELTS, ForestKind, HOT_SPRING_POOL, ORCHARD, PATHS, PLAZA, POND, STREAM,
  TALL_GRASS_ZONES, TORII, VILLAGE_GATES, YUBATAKE, YUZU_SPOTS, XZ,
} from '../../world/zones';
import { COL_ROUTES, rectSdf, streamInfo, teaYaw } from '../../world/valley';
import { heightAt, normalAt } from '../../world/heightmap';
import { REGIONS } from '../../world/layout';
import { addCircle, groundAt, resolveCircle } from '../../world/physics';
import { Rng, noise2, smoothstep, clamp } from '../../core/math';
import { Models } from '../../core/models';
import { FloraLayer } from './field';
import { FloraSpecies, SPECIES, bakeImposter, floraTex, getSpecies, loadSpecies } from './species';
import { floraMaterial, updateFloraWind } from './materials';
import { capyLegacyTrees } from './legacy';

// =============================================================================================== MASQUE D'OCCUPATION
/** Grille de 1 m sur [-HALF, HALF]² : bits d'interdiction. */
const HALF = 640, NX = HALF * 2 + 1;
const NO_TREE = 1, NO_PLANT = 2, GRASSZ = 4, ORCH = 8, FIELD = 16;
const mask = new Uint8Array(NX * NX);
const mi = (x: number, z: number) => {
  const i = Math.round(x + HALF), j = Math.round(z + HALF);
  return i < 0 || j < 0 || i >= NX || j >= NX ? -1 : j * NX + i;
};
export const maskAt = (x: number, z: number) => { const k = mi(x, z); return k < 0 ? 0 : mask[k]; };

function box(minx: number, minz: number, maxx: number, maxz: number, fn: (k: number, x: number, z: number) => void) {
  const i0 = Math.max(0, Math.floor(minx + HALF)), i1 = Math.min(NX - 1, Math.ceil(maxx + HALF));
  const j0 = Math.max(0, Math.floor(minz + HALF)), j1 = Math.min(NX - 1, Math.ceil(maxz + HALF));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * NX + i, i - HALF, j - HALF);
}
function rasterSeg(ax: number, az: number, bx: number, bz: number, rad: [number, number][]) {
  const R = Math.max(...rad.map((r) => r[0]));
  box(Math.min(ax, bx) - R, Math.min(az, bz) - R, Math.max(ax, bx) + R, Math.max(az, bz) + R, (k, x, z) => {
    const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1e-9;
    const t = clamp(((x - ax) * vx + (z - az) * vz) / l2, 0, 1);
    const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
    for (const [r, bit] of rad) if (d <= r + (bit & NO_TREE ? 0.75 : 0)) mask[k] |= bit;
  });
}
function rasterPoly(pts: XZ[], rad: [number, number][]) {
  for (let i = 0; i < pts.length - 1; i++) rasterSeg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], rad);
}
function rasterRect(cx: number, cz: number, w: number, d: number, yaw: number, rad: [number, number][]) {
  const R = Math.hypot(w, d) / 2 + Math.max(...rad.map((r) => r[0]));
  box(cx - R, cz - R, cx + R, cz + R, (k, x, z) => {
    const s = rectSdf(x, z, cx, cz, w, d, yaw);
    for (const [r, bit] of rad) if (s <= r + (bit & NO_TREE ? 0.75 : 0)) mask[k] |= bit;
  });
}
function rasterDisk(cx: number, cz: number, rad: [number, number][]) {
  const R = Math.max(...rad.map((r) => r[0]));
  box(cx - R, cz - R, cx + R, cz + R, (k, x, z) => {
    const d = Math.hypot(x - cx, z - cz);
    for (const [r, bit] of rad) if (d <= r + (bit & NO_TREE ? 0.75 : 0)) mask[k] |= bit;
  });
}
const pondE = (x: number, z: number) => Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz);

/** Cuisson du masque d'occupation (chemins, bâtiments, eau, champs, prairies…) ; appelée par CapyFlora.build. */
export function bakeFloraMask() {
  mask.fill(0);
  for (const p of PATHS) rasterPoly(p.pts, [[p.width / 2 + 0.4, NO_PLANT], [p.width / 2 + 3, NO_TREE]]);
  for (const r of COL_ROUTES) rasterPoly(r.pts, [[4.8, NO_PLANT], [8, NO_TREE]]);
  for (const b of BUILDINGS) rasterRect(b.x, b.z, b.w, b.d, b.yaw, [[0.8, NO_PLANT], [5, NO_TREE]]);
  rasterRect(PLAZA.x, PLAZA.z, PLAZA.halfX * 2, PLAZA.halfZ * 2, 0, [[0, NO_PLANT], [2, NO_TREE]]);
  for (const b of BRIDGES) rasterSeg(b.a[0], b.a[1], b.b[0], b.b[1], [[b.width / 2 + 1, NO_PLANT], [b.width / 2 + 3, NO_TREE]]);
  for (const t of TORII) rasterDisk(t.x, t.z, [[1.2, NO_PLANT], [t.h * 0.45 + 2, NO_TREE]]);
  for (const g of VILLAGE_GATES) rasterDisk(g.x, g.z, [[2, NO_PLANT], [8, NO_TREE]]);
  rasterDisk(HOT_SPRING_POOL.x, HOT_SPRING_POOL.z, [[HOT_SPRING_POOL.r + 1, NO_PLANT], [HOT_SPRING_POOL.r + 4, NO_TREE]]);
  rasterRect(YUBATAKE.x, YUBATAKE.z, YUBATAKE.w, YUBATAKE.d, YUBATAKE.yaw, [[1, NO_PLANT], [4, NO_TREE]]);
  for (const f of FIELDS) {
    const yaw = f.kind === 'the' ? teaYaw(f) : f.yaw;
    rasterRect(f.x, f.z, f.w, f.d, yaw, [[0.3, FIELD], [3, NO_TREE]]);
  }
  rasterRect(ORCHARD.x, ORCHARD.z, ORCHARD.w, ORCHARD.d, ORCHARD.yaw, [[2, ORCH | NO_TREE]]);
  for (const z of TALL_GRASS_ZONES) rasterDisk(z.x, z.z, [[z.r + 6, GRASSZ | NO_TREE]]);
  for (const t of FEATURE_TREES) rasterDisk(t.x, t.z, [[t.h * 0.42, NO_TREE]]);
  box(POND.x - POND.rx * 1.3, POND.z - POND.rz * 1.3, POND.x + POND.rx * 1.3, POND.z + POND.rz * 1.3, (k, x, z) => {
    const e = pondE(x, z);
    if (e < 1.0) mask[k] |= NO_PLANT;
    if (e < 1.1) mask[k] |= NO_TREE;
  });
}

/**
 * Vrai si un arbre peut pousser en (x, z) d'après les retraits de la bible (3 m des chemins, 5 m des bâtiments,
 * hors de l'eau, des champs, du verger et des prairies à susuki). Utilisable par le Décor et l'Intégration village.
 */
export function canPlantTree(x: number, z: number, streamGap = 2.5) {
  if (Math.abs(x) > HALF - 2 || Math.abs(z) > HALF - 2) return false;
  if (maskAt(x, z) & (NO_TREE | NO_PLANT | FIELD | ORCH | GRASSZ)) return false;
  if (streamEdge(x, z) < streamGap) return false;
  return heightAt(x, z) >= 0.8;
}

/** Distance au bord mouillé du torrent (négative dans l'eau), Infinity loin du torrent. */
function streamEdge(x: number, z: number) {
  const s = streamInfo(x, z);
  if (s.kind === 4) return Infinity;
  return s.d - s.width / 2;
}

function slopeAt(x: number, z: number) {
  const e = 1.2;
  const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e), gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return Math.hypot(gx, gz);
}

// =============================================================================================== FORÊTS
type Kind = ForestKind | 'crete' | 'bosquet';
interface ForestSample { f: number; kind: Kind; dens: number }
const SACRED_HILL = { x: -40, z: -108, r: 48 };
/** Villes voisines : pas de forêt de Capyville dans leur emprise. */
const OTHER_CITIES = REGIONS.filter((r) => r.id !== 'hub').map((r) => ({ x: r.x, z: r.z, r: r.cityRadius + 60 }));

/** Poids de forêt (0..1), type et densité (arbres / ha) au point. Cohérent avec la couche de sous-bois du terrain. */
export function forestAt(x: number, z: number, h = heightAt(x, z), slope = slopeAt(x, z)): ForestSample {
  let best: ForestSample = { f: 0, kind: 'mixte', dens: 0 };
  const nf = 10 * noise2(x / 23, z / 23);
  for (const b of FOREST_BELTS) {
    if (b.kind === 'bambous') continue;
    const w = smoothstep(b.r + 6, b.r - 12, Math.hypot(x - b.x, z - b.z) + nf);
    if (w > best.f) best = { f: w, kind: b.kind, dens: b.density };
  }
  const r = Math.hypot(x, z);
  // pentes de la couronne : forêt continue (ref-1, ref-4), clairières au bruit, roche nue au-dessus de 45° environ
  // (au-delà du fond de vallée, r > 250 : forêt quelle que soit l'altitude, jusqu'aux régions voisines)
  const s = Math.max(smoothstep(12, 22, h + 8 * noise2(x / 40 + 3, z / 40)), smoothstep(235, 275, r)) * smoothstep(140, 185, r) * smoothstep(1.45, 1.05, slope)
    * smoothstep(-0.55, -0.3, noise2(x / 70 - 13, z / 70 + 6));
  if (s > best.f * 0.98) {
    const alt = h + 12 * noise2(x / 90 - 7, z / 90 + 2);
    if (alt > 88) best = { f: Math.max(s, 0.7), kind: 'crete', dens: 40 };
    else if (alt > 42) best = { f: s, kind: noise2(x / 120, z / 120) > 0.2 ? 'mixte' : 'cedres', dens: 210 };
    else best = { f: s, kind: noise2(x / 80 + 5, z / 80) > -0.15 ? 'mixte' : 'erables', dens: 200 };
  }
  // crêtes nues au-dessus de la forêt : pins noirs épars
  if (best.f < 0.3 && h > 75 && r > 200 && slope < 1.3) best = { f: 0.6, kind: 'crete', dens: 28 };
  // colline sacrée : cèdres sur les pentes
  const dh = Math.hypot(x - SACRED_HILL.x, z - SACRED_HILL.z);
  if (dh < SACRED_HILL.r && h > 9.5) {
    const w = smoothstep(SACRED_HILL.r, SACRED_HILL.r - 14, dh + nf * 0.6) * smoothstep(9.5, 12, h);
    if (w > best.f) best = { f: w, kind: 'cedres', dens: 130 };
  }
  // bosquets dans la campagne (hors village)
  if (best.f < 0.2 && r > 125 && r < 230) {
    const g = smoothstep(0.42, 0.62, noise2(x / 55 + 11, z / 55 - 4) * 0.7 + noise2(x / 21, z / 21) * 0.3);
    if (g > best.f) best = { f: g, kind: 'bosquet', dens: 110 };
  }
  return best;
}

const MIX: Record<Kind, [FloraSpecies, number][]> = {
  cedres: [['sugi', 0.74], ['keyaki', 0.1], ['momiji', 0.07], ['matsu', 0.05], ['sakura', 0.04]],
  erables: [['momiji', 0.55], ['keyaki', 0.2], ['matsu', 0.1], ['sugi', 0.1], ['ichou', 0.05]],
  pins: [['matsu', 0.75], ['sugi', 0.15], ['keyaki', 0.1]],
  mixte: [['keyaki', 0.34], ['sugi', 0.3], ['momiji', 0.16], ['matsu', 0.1], ['sakura', 0.06], ['ichou', 0.04]],
  crete: [['matsu', 1]],
  bosquet: [['keyaki', 0.3], ['momiji', 0.25], ['sakura', 0.2], ['matsu', 0.15], ['sugi', 0.1]],
  bambous: [['take', 1]],
  cerisiers: [['sakura', 1]],
};
function pickMix(kind: Kind, u: number): FloraSpecies {
  let acc = 0;
  for (const [s, p] of MIX[kind]) { acc += p; if (u < acc) return s; }
  return MIX[kind][0][0];
}

// =============================================================================================== FLORE
const FEATURE_MAP: Record<string, [FloraSpecies, number]> = {
  'cerisier-pleureur': ['shidare', 13], cerisier: ['sakura', 8.5], erable: ['momiji', 8.5], 'pin-noir': ['matsu', 10.5], 'cedre-geant': ['sugi-geant', 34], gingko: ['ichou', 14],
};

/** Correspondance des anciennes essences (Forest.add) vers les nouvelles, dans la vallée. */
export const LEGACY_MAP: Record<string, FloraSpecies> = { oak: 'momiji', plane: 'momiji', birch: 'ichou', cherry: 'sakura', pine: 'matsu', snowpine: 'matsu', bamboo: 'take', palm: 'momiji', cactus: 'tsutsuji' };

export interface TreeRecord { species: FloraSpecies; x: number; y: number; z: number; scale: number }

export class CapyFlora {
  readonly group = new THREE.Group();
  readonly layers = new Map<FloraSpecies, FloraLayer>();
  /** Tous les arbres posés (pour les autres spécialités : ombres de feuillage, audio du vent, oiseaux…). */
  readonly trees: TreeRecord[] = [];
  private baked = false;
  private lastPos = new THREE.Vector3(1e9, 0, 0);
  private lastQuat = new THREE.Quaternion();
  private frustum = new THREE.Frustum();
  private pv = new THREE.Matrix4();
  private petals: THREE.InstancedMesh | null = null;
  private petalCenter = new THREE.Vector3();
  private hedges: THREE.Mesh[] = [];
  private usePH = false;

  layer(s: FloraSpecies) {
    let l = this.layers.get(s);
    if (!l) {
      l = new FloraLayer(getSpecies(s)!);
      this.layers.set(s, l);
      this.group.add(l.group);
    }
    return l;
  }

  /**
   * Plante un arbre ou une plante (API publique). y par défaut : sol − enfoncement. `collide` : tronc solide.
   * Retourne faux si l'emplacement est refusé (`respect` : respecte les retraits de la bible).
   */
  plant(s: FloraSpecies, x: number, z: number, o: { scale?: number; yaw?: number; variant?: number; y?: number; collide?: boolean; tilt?: THREE.Vector3 } = {}) {
    const sc = o.scale ?? 1;
    const def = SPECIES[s];
    const big = def.height > 3;
    const y = o.y ?? heightAt(x, z) - (big ? 0.12 : 0.03) * sc;
    const yaw = o.yaw ?? ((x * 12.9898 + z * 78.233) % 6.283);
    const v = o.variant ?? Math.abs(Math.floor(x * 7.31 + z * 3.17));
    this.layer(s).add(x, y, z, yaw, sc, v, o.tilt);
    if (big) this.trees.push({ species: s, x, y, z, scale: sc });
    if ((o.collide ?? true) && def.trunk > 0 && Math.hypot(x, z) < 400) addCircle(x, z, def.trunk * sc, y, y + Math.min(6, def.height * sc), false, 'thin');
    return true;
  }

  // ------------------------------------------------------------------------------------------ construction
  async build(density: number) {
    bakeFloraMask();
    const rng = new Rng(4242);
    const t0 = performance.now();
    this.featureTrees();
    this.orchard(rng);
    this.bamboo(rng);
    this.villageTrees(rng);
    this.legacy();
    this.forests(rng, density);
    this.banks(rng);
    this.susuki(rng);
    this.flowers(rng);
    this.rice();
    this.tea();
    await this.polyHaven(rng);
    this.petalsLayer(rng);
    for (const l of this.layers.values()) l.build();
    let n = 0;
    for (const l of this.layers.values()) n += l.count;
    console.info(`[végétation] ${n} instances (${this.trees.length} arbres) en ${Math.round(performance.now() - t0)} ms`);
  }

  private featureTrees() {
    for (const t of FEATURE_TREES) {
      const [s, h] = FEATURE_MAP[t.kind];
      const yaw = t.id === 'grand-cerisier' ? 0.6 : (t.x * 0.37) % 6.28;
      this.plant(s, t.x, t.z, { scale: t.h / h, yaw, variant: t.id.length });
    }
  }

  private orchard(rng: Rng) {
    const O = ORCHARD;
    const c = Math.cos(O.yaw), s = Math.sin(O.yaw);
    // repère local de rectSdf : x local = (cos yaw, -sin yaw), z local = (sin yaw, cos yaw)
    const toW = (lx: number, lz: number): XZ => [O.x + lx * c + lz * s, O.z - lx * s + lz * c];
    // un yuzu à 1,4 m de chaque yuzu de la mission (le fruit est « au pied de l'arbre »)
    const spotTrees: XZ[] = YUZU_SPOTS.map(([x, z], i) => {
      const a = i * 2.3 + 0.4;
      return [x + Math.cos(a) * 1.4, z + Math.sin(a) * 1.4];
    });
    for (const [x, z] of spotTrees) this.plant('yuzu', x, z, { scale: rng.range(0.95, 1.08) });
    const nx = Math.floor(O.w / O.spacing), nz = Math.floor(O.d / O.spacing);
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const lx = -O.w / 2 + 2 + i * O.spacing + (j % 2 ? O.spacing / 2 : 0);
        const lz = -O.d / 2 + 2 + j * O.spacing;
        if (lx > O.w / 2 - 1.5) continue;
        const [x, z] = toW(lx + rng.range(-0.4, 0.4), lz + rng.range(-0.4, 0.4));
        if (spotTrees.some(([a, b]) => Math.hypot(a - x, b - z) < 4.2)) continue;
        if (maskAt(x, z) & NO_PLANT) continue;
        if (streamEdge(x, z) < 2) continue;
        this.plant('yuzu', x, z, { scale: rng.range(0.85, 1.12) });
      }
  }

  private bamboo(rng: Rng) {
    const b = FOREST_BELTS.find((f) => f.kind === 'bambous')!;
    // bambouseraie : touffes de 5 à 9 chaumes (≈ 2 500 chaumes / ha)
    const step = 4.6;
    for (let x = b.x - b.r; x <= b.x + b.r; x += step)
      for (let z = b.z - b.r; z <= b.z + b.r; z += step) {
        const px = x + rng.range(-1.6, 1.6), pz = z + rng.range(-1.6, 1.6);
        if (Math.hypot(px - b.x, pz - b.z) > b.r + 2 * noise2(px / 6, pz / 6)) continue;
        if (maskAt(px, pz) & NO_PLANT || streamEdge(px, pz) < 1.5) continue;
        this.plant('take', px, pz, { scale: rng.range(0.85, 1.15) });
      }
    // haies de bambou à la sortie du village (village → jardins → bambou → pré)
    for (let a = 0; a < Math.PI * 2; a += 5.2 / 116) {
      const r = 116 + 6 * noise2(a * 3, 1.7);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (noise2(a * 5.5, 9.1) < 0.05) continue;
      const m = maskAt(x, z);
      if (m & (NO_PLANT | FIELD | ORCH | GRASSZ)) continue;
      if (PATHS.some((p) => distPoly(x, z, p.pts) < p.width / 2 + 2.5)) continue;
      if (streamEdge(x, z) < 2.5 || pondE(x, z) < 1.15) continue;
      if (resolveCircle(x, z, heightAt(x, z), 0.8, 3).hit) continue;
      this.plant('take', x, z, { scale: rng.range(0.55, 0.75), variant: 1 });
    }
  }

  private villageTrees(rng: Rng) {
    // arbres isolés : 1 par 400 m² d'espace libre (bible §6)
    const step = 20;
    for (let x = -115; x <= 115; x += step)
      for (let z = -115; z <= 115; z += step) {
        const px = x + rng.range(-8, 8), pz = z + rng.range(-8, 8);
        if (Math.hypot(px, pz) > 112) continue;
        if (!this.treeOk(px, pz, 2)) continue;
        if (resolveCircle(px, pz, heightAt(px, pz), 2.5, 5).hit) continue;
        const u = rng.next();
        const s: FloraSpecies = u < 0.3 ? 'sakura' : u < 0.6 ? 'momiji' : u < 0.85 ? 'matsu' : u < 0.93 ? 'keyaki' : 'ichou';
        this.plant(s, px, pz, { scale: rng.range(0.6, 0.9) });
      }
    // jardins : azalées autour des maisons (côtés et arrière, jamais devant la porte)
    for (const b of BUILDINGS) {
      if (!['minka', 'honjin', 'ryokan', 'chaya', 'chashitsu', 'gassho'].includes(b.type)) continue;
      const per = 2 * (b.w + b.d);
      const n = Math.floor(per / 3.2);
      const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
      for (let k = 0; k < n; k++) {
        // point sur le pourtour, décalé de 1,2 à 2,6 m
        const t = (k + rng.next() * 0.6) / n * per;
        let lx: number, lz: number, nx = 0, nz = 0;
        if (t < b.w) { lx = -b.w / 2 + t; lz = -b.d / 2; nz = -1; }
        else if (t < b.w + b.d) { lx = b.w / 2; lz = -b.d / 2 + (t - b.w); nx = 1; }
        else if (t < 2 * b.w + b.d) { lx = b.w / 2 - (t - b.w - b.d); lz = b.d / 2; nz = 1; }
        else { lx = -b.w / 2; lz = b.d / 2 - (t - 2 * b.w - b.d); nx = -1; }
        if (nz > 0) continue; // façade principale (+z local)
        const off = rng.range(1.3, 2.6);
        lx += nx * off; lz += nz * off;
        const x = b.x + lx * c + lz * s, z = b.z - lx * s + lz * c;
        if (maskAt(x, z) & (NO_PLANT | FIELD)) continue;
        if (streamEdge(x, z) < 0.6) continue;
        if (resolveCircle(x, z, heightAt(x, z), 0.5, 1.5).hit) continue;
        this.plant('tsutsuji', x, z, { scale: rng.range(0.6, 1.0), variant: rng.int(0, 2) });
      }
    }
    // jardin sec de Mamie : pins taillés et azalées ; jardin de mousse du Grand Ryokan : érable, azalées, fougères
    for (const f of FIELDS) {
      if (f.kind !== 'jardin-sec' && f.kind !== 'jardin-mousse') continue;
      const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
      const at = (u: number, v: number): XZ => { const lx = u * f.w / 2, lz = v * f.d / 2; return [f.x + lx * c + lz * s, f.z - lx * s + lz * c]; };
      if (f.kind === 'jardin-sec') {
        for (const [u, v] of [[-0.75, -0.7], [0.7, 0.75]] as XZ[]) { const [x, z] = at(u, v); this.plant('matsu', x, z, { scale: 0.32, variant: 1 }); }
        for (const [u, v] of [[-0.8, 0.2], [-0.6, 0.6], [0.8, -0.3], [0.5, -0.75], [0.85, 0.1]] as XZ[]) { const [x, z] = at(u, v); this.plant('tsutsuji', x, z, { scale: rng.range(0.6, 0.85), variant: rng.int(0, 2) }); }
      } else {
        { const [x, z] = at(0.55, -0.55); this.plant('momiji', x, z, { scale: 0.55, variant: 0 }); }
        for (let k = 0; k < 7; k++) { const [x, z] = at(rng.range(-0.9, 0.9), rng.range(-0.9, 0.9)); this.plant('tsutsuji', x, z, { scale: rng.range(0.55, 0.9), variant: rng.int(0, 2) }); }
        for (let k = 0; k < 18; k++) { const [x, z] = at(rng.range(-0.95, 0.95), rng.range(-0.95, 0.95)); this.plant('fern', x, z, { scale: rng.range(0.7, 1.1) }); }
      }
    }
  }

  /** Arbres demandés par les régions via l'ancien Forest.add (essences converties, retraits respectés). */
  private legacy() {
    for (const t of capyLegacyTrees) {
      if (!this.treeOk(t.x, t.z, 2)) continue;
      this.plant(LEGACY_MAP[t.kind] ?? 'keyaki', t.x, t.z, { scale: clamp(t.scale * 0.8, 0.5, 1.1) });
    }
    capyLegacyTrees.length = 0;
  }

  /** Emplacement acceptable pour un arbre (retraits de la bible). */
  private treeOk(x: number, z: number, streamGap = 2.5) {
    return canPlantTree(x, z, streamGap);
  }

  private forests(rng: Rng, density: number) {
    const step = 5; // 400 arbres / ha au plus
    let n = 0;
    for (let gx = -HALF + 4; gx < HALF - 4; gx += step)
      for (let gz = -HALF + 4; gz < HALF - 4; gz += step) {
        const x = gx + rng.range(-2.2, 2.2), z = gz + rng.range(-2.2, 2.2);
        const r = Math.hypot(x, z);
        if (r < 100 || r > 620) continue;
        if (r > 440 && OTHER_CITIES.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) continue;
        const h = heightAt(x, z);
        if (h < 0.8) continue;
        const sl = slopeAt(x, z);
        if (sl > 1.5) continue;
        const fs = forestAt(x, z, h, sl);
        if (fs.f < 0.06) continue;
        const p = (fs.dens / 400) * smoothstep(0.05, 0.55, fs.f) * density;
        if (rng.next() > p) continue;
        if (!this.treeOk(x, z)) continue;
        const s = pickMix(fs.kind, rng.next());
        const edge = smoothstep(0.1, 0.6, fs.f);
        let sc = rng.range(0.78, 1.18) * (0.55 + 0.45 * edge);
        if (fs.kind === 'crete') sc *= rng.range(0.7, 0.95);
        if (r < 200 && s === 'sugi') sc *= 0.9;
        // pentes : les arbres poussent droits (pas d'inclinaison), sauf les pins des crêtes
        const tilt = fs.kind === 'crete' ? normalAt(x, z).lerp(new THREE.Vector3(0, 1, 0), 0.75).normalize() : undefined;
        this.plant(s, x, z, { scale: sc, tilt, collide: r < 380 });
        n++;
      }
    // sous-bois (dans la vallée jouable) : fougères, azalées et jeunes arbres de lisière
    const fstep = 1.6;
    for (let gx = -380; gx < 380; gx += fstep)
      for (let gz = -380; gz < 380; gz += fstep) {
        const x = gx + rng.range(-0.75, 0.75), z = gz + rng.range(-0.75, 0.75);
        const r = Math.hypot(x, z);
        if (r < 100 || r > 360) continue;
        const nfast = noise2(x / 23, z / 23);
        // préfiltre rapide : loin de toute ceinture et du fond de vallée boisé
        const h = heightAt(x, z);
        if (h < 9 && r < 140) continue;
        const sl = slopeAt(x, z);
        if (sl > 1.2) continue;
        const fs = forestAt(x, z, h, sl);
        if (fs.f < 0.08) continue;
        const m = maskAt(x, z);
        if (m & (NO_PLANT | FIELD | ORCH | GRASSZ)) continue;
        if (streamEdge(x, z) < 0.4) continue;
        const sacred = Math.hypot(x - FOREST_BELTS[0].x, z - FOREST_BELTS[0].z) < FOREST_BELTS[0].r;
        const fernD = sacred ? 0.55 : fs.kind === 'crete' ? 0.02 : 0.14 + 0.1 * nfast;
        const lisiere = smoothstep(0.05, 0.25, fs.f) * smoothstep(0.7, 0.35, fs.f);
        const u = rng.next() / (fstep * fstep);
        if (u < fernD * smoothstep(0.1, 0.5, fs.f)) this.plant('fern', x, z, { scale: rng.range(0.7, 1.3) });
        else if (u < fernD + lisiere * 0.09) this.plant('tsutsuji', x, z, { scale: rng.range(0.7, 1.4), variant: rng.int(0, 2) });
        else if (u < fernD + lisiere * 0.09 + lisiere * 0.012 && !(m & NO_TREE)) this.plant(pickMix(fs.kind === 'crete' ? 'crete' : 'mixte', rng.next()), x, z, { scale: rng.range(0.35, 0.55) });
      }
    void n;
  }

  private banks(rng: Rng) {
    // berges du torrent : fougères (2 / m² sur 2 m), azalées, érables penchés au-dessus de l'eau
    let acc = 0;
    for (let i = 0; i < STREAM.length - 1; i++) {
      const [ax, az] = STREAM[i], [bx, bz] = STREAM[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / L, dz = (bz - az) / L;
      for (let s = 0; s < L; s += 0.5) {
        acc += 0.5;
        const px = ax + dx * s, pz = az + dz * s;
        const si = streamInfo(px, pz);
        if (si.walled) continue;
        for (const side of [-1, 1]) {
          for (let k = 0; k < 2; k++) {
            const off = si.width / 2 + rng.range(0.35, 2.6);
            const x = px - dz * side * off + rng.range(-0.25, 0.25), z = pz + dx * side * off + rng.range(-0.25, 0.25);
            if (maskAt(x, z) & (NO_PLANT | FIELD)) continue;
            if (streamEdge(x, z) < 0.3) continue;
            if (rng.next() < 0.82) this.plant('fern', x, z, { scale: rng.range(0.75, 1.35) });
            else if (rng.next() < 0.35) this.plant('tsutsuji', x, z, { scale: rng.range(0.5, 0.9), variant: rng.int(0, 2) });
          }
          if (acc % 34 < 0.5 && rng.next() < 0.7) {
            const off = si.width / 2 + rng.range(2.2, 3.5);
            const x = px - dz * side * off, z = pz + dx * side * off;
            if (!(maskAt(x, z) & (NO_TREE | NO_PLANT | FIELD | ORCH)) && heightAt(x, z) > 0.8) {
              const lean = new THREE.Vector3(dz * side, 6, -dx * side).normalize();
              this.plant('momiji', x, z, { scale: rng.range(0.6, 0.85), tilt: lean });
            }
          }
        }
      }
    }
  }

  private susuki(rng: Rng) {
    for (const zn of TALL_GRASS_ZONES) {
      const step = 0.8;
      const R = zn.r + 6;
      for (let x = zn.x - R; x <= zn.x + R; x += step)
        for (let z = zn.z - R; z <= zn.z + R; z += step) {
          const px = x + rng.range(-0.38, 0.38), pz = z + rng.range(-0.38, 0.38);
          const d = Math.hypot(px - zn.x, pz - zn.z) + 1.5 * noise2(px / 5, pz / 5);
          if (d > R) continue;
          const tr = d < zn.r ? 1 : 1 - (d - zn.r) / 6;
          if (d >= zn.r && rng.next() > tr * 0.85) continue;
          if (maskAt(px, pz) & NO_PLANT) continue;
          if (streamEdge(px, pz) < 0.6) continue;
          // hauteur : plumets de 1,2 à 1,6 m dans la prairie, plus bas sur la lisière de 6 m
          const sc = d < zn.r ? rng.range(0.94, 1.06) : 0.5 + 0.45 * tr;
          this.plant('susuki', px, pz, { scale: sc, yaw: rng.range(0, 6.28), variant: rng.int(0, 2) });
        }
    }
  }

  /** Fleurs des prés : prés fleuris (FIELDS « fleurs »), prairies de susuki (0,5 / m²), prés et bords de chemins (≈ 0,3 / m²). */
  private flowers(rng: Rng) {
    const step = 1.0;
    for (let gx = -262; gx < 262; gx += step)
      for (let gz = -262; gz < 262; gz += step) {
        const x = gx + rng.range(-0.5, 0.5), z = gz + rng.range(-0.5, 0.5);
        const r = Math.hypot(x, z);
        if (r > 262) continue;
        const m = maskAt(x, z);
        if (m & (NO_PLANT | ORCH)) continue;
        let p = 0, tiles = [0, 1, 2, 3];
        if (m & FIELD) {
          const f = FIELDS.find((q) => q.kind === 'fleurs' && rectSdf(x, z, q.x, q.z, q.w, q.d, q.yaw) < 0.3);
          if (!f) continue;
          p = 1.1;
        } else if (m & GRASSZ) {
          p = 0.5;
          tiles = [2, 3, 3, 0];
        } else {
          if (r < 108) continue;
          const u = rng.next();
          if (u > 0.4) { rng.next(); continue; } // préfiltre (densité moyenne ≈ 0,3 / m²)
          const n = noise2(x / 14 + 3, z / 14 - 8);
          const pp = 0.75 * (0.25 + 1.5 * smoothstep(-0.1, 0.5, n));
          if (u > 0.4 * Math.min(1, pp)) { rng.next(); continue; }
          const h = heightAt(x, z);
          if (h < 1 || slopeAt(x, z) > 0.7 || forestAt(x, z, h).f > 0.15 || streamEdge(x, z) < 0.5) continue;
          p = 1;
          tiles = n > 0.3 ? [0, 0, 1, 2] : [1, 0, 2, 3];
        }
        if (rng.next() > p) continue;
        if (streamEdge(x, z) < 0.5) continue;
        this.plant('hana', x, z, { scale: rng.range(0.75, 1.25), variant: tiles[rng.int(0, 3)] });
      }
  }

  private rice() {
    // 16 touffes / m² : rangs de 0,25 m, marge de 0,6 m pour les diguettes
    let k = 0;
    for (const f of FIELDS) {
      if (f.kind !== 'riziere') continue;
      const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
      for (let lx = -f.w / 2 + 0.6; lx <= f.w / 2 - 0.6; lx += 0.25)
        for (let lz = -f.d / 2 + 0.6; lz <= f.d / 2 - 0.6; lz += 0.25) {
          k++;
          const j1 = ((k * 0.618) % 1) - 0.5, j2 = ((k * 0.414) % 1) - 0.5;
          const x = f.x + (lx + j1 * 0.05) * c + (lz + j2 * 0.05) * s, z = f.z - (lx + j1 * 0.05) * s + (lz + j2 * 0.05) * c;
          this.plant('ine', x, z, { scale: 0.85 + 0.3 * ((k * 0.7548) % 1), yaw: (k * 2.39996) % 6.28, variant: k % 2, y: heightAt(x, z) - 0.02 });
        }
    }
  }

  /** Haies de théiers arrondies (0,9 × 1,2 m) en lignes continues sur chaque terrasse. */
  private tea() {
    const map = floraTex('cha_leaf.webp');
    const mat = floraMaterial({ name: 'cha', map, leaf: true, height: 1, flex: 0.02, branch: 0, flutter: 0.02, trans: 0.3 });
    for (const f of FIELDS) {
      if (f.kind !== 'the') continue;
      const yaw = teaYaw(f);
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const ax = new THREE.Vector3(c, 0, -s), az = new THREE.Vector3(s, 0, c);
      const pos: number[] = [], nor: number[] = [], uv: number[] = [], wind: number[] = [], idx: number[] = [];
      const L = f.w - 2, PROF = 9, seg = 0.5;
      const ctr = (t: number) => new THREE.Vector3(f.x, 0, f.z).addScaledVector(ax, -L / 2 + t);
      const ns = Math.round(L / seg);
      const rows: number[][] = [];
      for (let i = 0; i <= ns; i++) {
        const t = i * seg;
        const p = ctr(t);
        const gy = heightAt(p.x, p.z);
        const endT = Math.min(t, L - t);
        const taper = Math.sqrt(clamp(endT / 0.7, 0.05, 1));
        const bump = 0.88 + 0.12 * Math.abs(Math.sin(t * 2.4 + f.x));
        const row: number[] = [];
        for (let k = 0; k <= PROF; k++) {
          const a = (k / PROF) * Math.PI;
          const ca = Math.cos(a), sa = Math.sin(a);
          const rx = 0.6 * taper * bump, ry = 0.9 * taper * bump;
          const q = p.clone().addScaledVector(az, ca * rx);
          pos.push(q.x, gy - 0.05 + sa * ry, q.z);
          const n = az.clone().multiplyScalar(ca / rx).add(new THREE.Vector3(0, sa / ry, 0)).normalize();
          nor.push(n.x, n.y, n.z);
          // moitié gauche de l'atlas (raccordable) : u le long (0..0,5 tous les 1,5 m), v autour
          uv.push(((t / 1.5) % 1) * 0.5, k / PROF);
          wind.push(0, 0.15, 0.55 + 0.45 * sa);
          row.push(pos.length / 3 - 1);
        }
        rows.push(row);
      }
      for (let i = 0; i < ns; i++) {
        // le raccord de l'u tous les 1,5 m : on duplique les sommets de la rangée de départ si l'u repart à 0
        const A = rows[i], B = rows[i + 1];
        const uA = uv[A[0] * 2], uB = uv[B[0] * 2];
        let Bi = B;
        if (uB < uA) {
          Bi = B.map((vi) => {
            pos.push(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]);
            nor.push(nor[vi * 3], nor[vi * 3 + 1], nor[vi * 3 + 2]);
            uv.push(0.5, uv[vi * 2 + 1]);
            wind.push(wind[vi * 3], wind[vi * 3 + 1], wind[vi * 3 + 2]);
            return pos.length / 3 - 1;
          });
        }
        for (let k = 0; k < PROF; k++) idx.push(A[k], Bi[k], A[k + 1], A[k + 1], Bi[k], Bi[k + 1]);
      }
      // cartes de feuilles sur le dessus : silhouette ébouriffée
      const rng = new Rng(Math.round(f.x * 13));
      for (let t = 0.3; t < L - 0.3; t += 0.35) {
        for (let k = 0; k < 2; k++) {
          const a = rng.range(0.25, Math.PI - 0.25);
          const p = ctr(t).addScaledVector(az, Math.cos(a) * 0.55);
          const gy = heightAt(p.x, p.z);
          const n = az.clone().multiplyScalar(Math.cos(a)).add(new THREE.Vector3(0, Math.sin(a), 0)).normalize();
          const base = new THREE.Vector3(p.x, gy - 0.05 + Math.sin(a) * 0.8, p.z);
          const u = ax.clone().multiplyScalar(0.3);
          const v = n.clone().multiplyScalar(0.34);
          const tile = rng.int(0, 1);
          const v0 = pos.length / 3;
          const corners = [base.clone().sub(u), base.clone().add(u), base.clone().add(u).add(v), base.clone().sub(u).add(v)];
          for (const q of corners) { pos.push(q.x, q.y, q.z); nor.push(n.x, n.y, n.z); wind.push(0, 0.6, 1); }
          uv.push(0.5, tile * 0.5 + 0.5, 1, tile * 0.5 + 0.5, 1, tile * 0.5, 0.5, tile * 0.5);
          idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('aWind', new THREE.Float32BufferAttribute(wind, 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = 'theiers-' + f.id;
      this.hedges.push(m);
      this.group.add(m);
    }
  }

  /** Sous-bois photoscanné (Poly Haven) : souches, racines, troncs couchés, branches mortes, grandes fougères, arbustes. */
  private async polyHaven(rng: Rng) {
    const want = ['tree_stump_01', 'tree_stump_02', 'root_cluster_02_a', 'root_cluster_02_b', 'pine_roots_a', 'dead_tree_trunk', 'dry_branches_medium_01_a', 'fern_02_b', 'fern_02_c', 'shrub_03_a', 'shrub_03_b', 'shrub_02_b', 'shrub_04'];
    try {
      await Models.load(want);
    } catch (e) {
      console.warn('[végétation] modèles Poly Haven indisponibles', e);
      return;
    }
    this.usePH = true;
    const lists = new Map<string, THREE.Matrix4[]>();
    const put = (id: string, x: number, z: number, scale: number, yaw = rng.range(0, 6.28)) => {
      let l = lists.get(id);
      if (!l) lists.set(id, (l = []));
      l.push(Models.groundMatrix(id, x, z, heightAt, { yaw, scale, normalAt }));
    };
    // au pied des cèdres et des pins : racines ; dans les forêts : souches, troncs couchés, branches mortes
    const trees = this.trees.filter((t) => Math.hypot(t.x, t.z) < 330);
    for (const t of trees) {
      const u = rng.next();
      if ((t.species === 'sugi' || t.species === 'sugi-geant') && u < (t.species === 'sugi-geant' ? 1 : 0.12)) {
        const a = rng.range(0, 6.28);
        const d = t.species === 'sugi-geant' ? 1.2 : 0.35 * t.scale;
        put(rng.chance(0.5) ? 'root_cluster_02_a' : 'root_cluster_02_b', t.x + Math.cos(a) * d, t.z + Math.sin(a) * d, (t.species === 'sugi-geant' ? 2.2 : 1.1) * rng.range(0.8, 1.1), a);
      } else if (t.species === 'matsu' && u < 0.1) put('pine_roots_a', t.x, t.z, 0.7 * t.scale);
    }
    const step = 10;
    for (let gx = -330; gx < 330; gx += step)
      for (let gz = -330; gz < 330; gz += step) {
        const x = gx + rng.range(-4.5, 4.5), z = gz + rng.range(-4.5, 4.5);
        const r = Math.hypot(x, z);
        if (r < 105) continue;
        const h = heightAt(x, z);
        if (h < 1) continue;
        const fs = forestAt(x, z, h);
        const m = maskAt(x, z);
        if (m & (NO_PLANT | FIELD | ORCH)) continue;
        if (streamEdge(x, z) < 1) continue;
        const sacred = Math.hypot(x - FOREST_BELTS[0].x, z - FOREST_BELTS[0].z) < FOREST_BELTS[0].r;
        const u = rng.next();
        if (fs.f > 0.4) {
          // bois sacré : 1 souche / 100 m² ; ailleurs plus rare
          const pS = sacred ? 1.0 : 0.12;
          if (u < pS * 0.5) put(rng.chance(0.5) ? 'tree_stump_01' : 'tree_stump_02', x, z, rng.range(0.7, 1.1));
          else if (u < pS * 0.5 + 0.05) put('dead_tree_trunk', x, z, rng.range(0.6, 0.9));
          else if (u < pS * 0.5 + 0.14) put('dry_branches_medium_01_a', x, z, rng.range(0.8, 1.2));
          else if (u < pS * 0.5 + 0.3) put(rng.chance(0.5) ? 'fern_02_b' : 'fern_02_c', x, z, rng.range(0.8, 1.2));
        } else if (fs.f > 0.12 && !(m & (GRASSZ))) {
          // lisières : arbustes
          if (u < 0.45) put(rng.pick(['shrub_03_a', 'shrub_03_b', 'shrub_02_b', 'shrub_04']), x, z, rng.range(0.8, 1.3));
        } else if (m & GRASSZ && u < 0.08) put('tree_stump_02', x, z, rng.range(0.5, 0.8)); // souches dans les prairies
      }
    for (const [id, l] of lists) {
      const inst = Models.instances(id, l, { name: 'flore-ph:' + id });
      this.group.add(inst);
    }
  }

  /** Tapis de pétales de cerisier, de feuilles d'érable et d'aiguilles au pied des arbres du village et des rives. */
  private petalsLayer(rng: Rng) {
    const spots: { x: number; z: number; tile: number; s: number }[] = [];
    const add = (cx: number, cz: number, R: number, n: number, tile: number) => {
      for (let i = 0; i < n; i++) {
        const r = R * Math.sqrt(rng.next()) * (0.6 + 0.4 * rng.next());
        const a = rng.range(0, 6.28);
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (maskAt(x, z) & FIELD || streamEdge(x, z) < 0 || pondE(x, z) < 1) continue;
        spots.push({ x, z, tile, s: rng.range(0.6, 1.0) * (1 - 0.4 * r / R) });
      }
    };
    for (const t of this.trees) {
      const r = Math.hypot(t.x, t.z);
      const nearVillage = r < 140 || pondE(t.x, t.z) < 1.6 || Math.hypot(t.x - HOT_SPRING_POOL.x, t.z - HOT_SPRING_POOL.z) < 30;
      if (t.species === 'shidare') add(t.x, t.z, 10, 520, 0);
      else if (t.species === 'sakura' && (nearVillage || rng.chance(0.15))) add(t.x, t.z, 6 * t.scale, 70, 0);
      else if (t.species === 'momiji' && (nearVillage || rng.chance(0.15))) add(t.x, t.z, 5 * t.scale, 45, 1);
      else if (t.species === 'ichou' && nearVillage) add(t.x, t.z, 5 * t.scale, 50, 2);
      else if (t.species === 'matsu' && nearVillage) add(t.x, t.z, 3 * t.scale, 20, 3);
    }
    if (!spots.length) return;
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const tiles = new Float32Array(spots.length * 2);
    const im = new THREE.InstancedMesh(g, this.petalMaterial(), spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), qy = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const box = new THREE.Box3();
    spots.forEach((p, i) => {
      const h = heightAt(p.x, p.z);
      const y = groundAt(p.x, p.z, h + 1.0) + 0.035;
      q.setFromUnitVectors(up, normalAt(p.x, p.z));
      qy.setFromAxisAngle(up, rng.range(0, 6.28));
      m.compose(new THREE.Vector3(p.x, y, p.z), q.multiply(qy), new THREE.Vector3(p.s, 1, p.s));
      im.setMatrixAt(i, m);
      tiles[i * 2] = (p.tile % 2) * 0.5;
      tiles[i * 2 + 1] = Math.floor(p.tile / 2) * 0.5;
      box.expandByPoint(new THREE.Vector3(p.x, y, p.z));
    });
    g.setAttribute('aTile', new THREE.InstancedBufferAttribute(tiles, 2));
    im.receiveShadow = true;
    im.computeBoundingSphere();
    im.name = 'flore-petales';
    box.getCenter(this.petalCenter);
    this.petals = im;
    this.group.add(im);
  }

  private petalMaterial() {
    const m = new THREE.MeshStandardMaterial({ map: floraTex('ground_leaf.webp'), alphaTest: 0.22, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aTile;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMapUv = uv * 0.5 + aTile;');
    };
    m.customProgramCacheKey = () => 'flora-petals';
    return m;
  }

  // ------------------------------------------------------------------------------------------ mise à jour
  /** Une fois par image : vent, cuisson des imposteurs (première fois), choix des LOD et élimination hors champ. */
  update(camera: THREE.Camera, renderer: THREE.WebGLRenderer, time: number) {
    updateFloraWind(time);
    if (!this.baked) {
      this.baked = true;
      for (const l of this.layers.values()) bakeImposter(renderer, l.sp);
    }
    camera.updateMatrixWorld();
    const p = camera.getWorldPosition(new THREE.Vector3());
    const qq = camera.getWorldQuaternion(new THREE.Quaternion());
    if (p.distanceToSquared(this.lastPos) > 0.25 || qq.angleTo(this.lastQuat) > 0.01) {
      this.lastPos.copy(p);
      this.lastQuat.copy(qq);
      this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.pv);
      for (const l of this.layers.values()) l.update(p, this.frustum);
      if (this.petals) this.petals.visible = p.distanceTo(this.petalCenter) < 400;
      for (const h of this.hedges) h.visible = p.distanceTo(h.geometry.boundingSphere!.center) < 260;
    }
    if (this.usePH) Models.update(camera);
  }

  /** Statistiques (instances visibles par essence et par LOD). */
  stats() {
    const out: Record<string, number[]> = {};
    for (const [k, l] of this.layers) out[k] = [l.count, ...l.visible];
    return out;
  }
}

function distPoly(x: number, z: number, pts: XZ[]) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1e-9;
    const t = clamp(((x - ax) * vx + (z - az) * vz) / l2, 0, 1);
    best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return best;
}

/** Construit la végétation de la vallée (à appeler après les régions, avant les herbes). */
export async function buildCapyFlora(density = 1) {
  await loadSpecies((Object.keys(SPECIES) as FloraSpecies[]).filter((s) => s !== 'misc'));
  const f = new CapyFlora();
  await f.build(density);
  return f;
}
