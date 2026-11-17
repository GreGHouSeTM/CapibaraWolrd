// Relief du monde, calculé une fois au chargement dans une grille de hauteurs.
// Toutes les requêtes (terrain, herbe, physique, eau) utilisent cette même grille.
import * as THREE from 'three';
import { clamp, fbm, lerp, noise2, ridged, smoothstep, distToSegment } from '../core/math';
import { COAST_RADIUS, REGIONS, ROADS, WORLD_SIZE, regionById, sampleRoad, RegionId } from './layout';

export const HM_RES = 1024;
const CELL = WORLD_SIZE / (HM_RES - 1);
const HALF = WORLD_SIZE / 2;

export const heights = new Float32Array(HM_RES * HM_RES);
/** Surfaces : herbe, sable, neige, roche (0..255). */
export const splat = new Uint8Array(HM_RES * HM_RES * 4);

// ---------- Éléments particuliers du relief (rivières, lacs, îles…) ----------
interface Carve {
  /** Retourne la hauteur imposée et le poids, ou null. */
  fn: (x: number, z: number, h: number) => number;
}

const paris = regionById('paris');
const london = regionById('london');
const ny = regionById('newyork');
const japan = regionById('japan');
const desert = regionById('desert');
const pole = regionById('pole');

/** Rivières : polylignes (coordonnées monde). */
export const RIVERS: { pts: [number, number][]; width: number; region: RegionId }[] = [
  {
    region: 'paris', width: 34,
    pts: [
      [paris.x - 420, paris.z + 40], [paris.x - 200, paris.z + 90], [paris.x, paris.z + 70],
      [paris.x + 200, paris.z + 40], [paris.x + 420, paris.z + 90],
    ],
  },
  {
    region: 'london', width: 40,
    pts: [
      [london.x - 420, london.z + 60], [london.x - 180, london.z + 110], [london.x + 40, london.z + 80],
      [london.x + 220, london.z + 40], [london.x + 420, london.z + 70],
    ],
  },
];

export function riverDistance(x: number, z: number): { d: number; river: (typeof RIVERS)[number] | null } {
  let best = Infinity;
  let br: (typeof RIVERS)[number] | null = null;
  for (const r of RIVERS) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const s = distToSegment(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]);
      if (s.d < best) {
        best = s.d;
        br = r;
      }
    }
  }
  return { d: best, river: br };
}

const outDir = (r: { x: number; z: number }) => {
  const l = Math.hypot(r.x, r.z);
  return [r.x / l, r.z / l];
};
const nyOut = outDir(ny);
export const LIBERTY_POS: [number, number] = [ny.x + nyOut[0] * 400, ny.z + nyOut[1] * 400];
const jpOut = outDir(japan);
export const FUJI_POS: [number, number] = [japan.x + jpOut[0] * 330 + 120, japan.z + jpOut[1] * 330];
export const JP_LAKE: [number, number] = [japan.x - 150, japan.z - 40];
export const OASIS_POS: [number, number] = [desert.x, desert.z];
const dsOut = outDir(desert);
export const PYRAMIDS: { x: number; z: number; s: number }[] = [
  { x: desert.x + dsOut[0] * 230 - 60, z: desert.z + dsOut[1] * 230 + 70, s: 70 },
  { x: desert.x + dsOut[0] * 300 + 40, z: desert.z + dsOut[1] * 300 - 10, s: 55 },
  { x: desert.x + dsOut[0] * 200 + 110, z: desert.z + dsOut[1] * 200 - 90, s: 38 },
];
export const HOT_SPRING: [number, number] = [60, 70];
export const HUB_POND: [number, number] = [-120, 90];

const carves: Carve[] = [
  // Rivières (Seine, Tamise) : lit à -3 m, quais verticaux
  {
    fn: (x, z, h) => {
      const { d, river } = riverDistance(x, z);
      if (!river) return h;
      const half = river.width / 2;
      if (d > half + 2) return h;
      const t = smoothstep(half + 2, half - 1, d);
      return lerp(h, -3.2, t);
    },
  },
  // Baie de New York + île de la Liberté
  {
    fn: (x, z, h) => {
      const along = (x - ny.x) * nyOut[0] + (z - ny.z) * nyOut[1];
      const side = Math.abs((x - ny.x) * -nyOut[1] + (z - ny.z) * nyOut[0]);
      const bay = smoothstep(270, 310, along) * smoothstep(420, 300, side);
      let r = lerp(h, -8, bay);
      const di = Math.hypot(x - LIBERTY_POS[0], z - LIBERTY_POS[1]);
      r = lerp(r, 3, smoothstep(34, 24, di));
      return r;
    },
  },
  // Lac du torii au Japon + mont Fuji
  {
    fn: (x, z, h) => {
      const dl = Math.hypot((x - JP_LAKE[0]) * 0.8, z - JP_LAKE[1]) + noise2(x / 30, z / 30) * 8;
      let r = lerp(h, -4, smoothstep(80, 58, dl));
      const df = Math.hypot(x - FUJI_POS[0], z - FUJI_POS[1]);
      const cone = Math.max(0, 1 - df / 340);
      const fuji = 230 * Math.pow(cone, 1.7) - 25 * smoothstep(0.93, 1, cone);
      if (cone > 0) r = Math.max(r, fuji + fbm(x / 60, z / 60, 3) * 6 * cone);
      return r;
    },
  },
  // Oasis et plateaux des pyramides
  {
    fn: (x, z, h) => {
      const doa = Math.hypot(x - OASIS_POS[0] - 30, z - OASIS_POS[1] + 20) + noise2(x / 20, z / 20) * 5;
      let r = lerp(h, -2.5, smoothstep(32, 20, doa));
      for (const p of PYRAMIDS) {
        const d = Math.hypot(x - p.x, z - p.z);
        r = lerp(r, desert.ground, smoothstep(p.s * 1.6, p.s * 1.1, d));
      }
      return r;
    },
  },
  // Capyville : source chaude et étang
  {
    fn: (x, z, h) => {
      const ds = Math.hypot(x - HOT_SPRING[0], z - HOT_SPRING[1]);
      let r = lerp(h, 5.2, smoothstep(13, 9, ds));
      const dp = Math.hypot((x - HUB_POND[0]) * 0.7, z - HUB_POND[1]) + noise2(x / 15, z / 15) * 4;
      r = lerp(r, -2, smoothstep(30, 20, dp));
      return r;
    },
  },
];

function baseHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const coast = COAST_RADIUS + fbm(x / 350, z / 350, 3) * 110;
  const land = smoothstep(coast + 70, coast - 50, r);

  let h = 7 + 16 * fbm(x / 520 + 3.1, z / 520 - 1.7, 4) + 5 * fbm(x / 110, z / 110, 3);
  h = Math.max(h, 2.5 + 2 * fbm(x / 80, z / 80, 2));

  // Désert : dunes allongées
  const wd = smoothstep(desert.radius * 1.35, desert.radius * 0.7, Math.hypot(x - desert.x, z - desert.z));
  if (wd > 0) {
    const dune = 12 * Math.pow(ridged((x * 0.8 + z * 0.3) / 140, (z * 0.9 - x * 0.2) / 70, 3), 2) + 4 * fbm(x / 60, z / 60, 2);
    h = lerp(h, 6 + dune, wd);
  }
  // Pôle : banquise plate avec crêtes de glace
  const wp = smoothstep(pole.radius * 1.35, pole.radius * 0.7, Math.hypot(x - pole.x, z - pole.z));
  if (wp > 0) {
    const ice = 3.5 + 2 * fbm(x / 140, z / 140, 3) + 6 * Math.pow(ridged(x / 220, z / 220, 2), 4);
    h = lerp(h, ice, wp);
  }
  // Japon : collines plus marquées
  const wj = smoothstep(japan.radius * 1.3, japan.radius * 0.6, Math.hypot(x - japan.x, z - japan.z));
  if (wj > 0) h += wj * 14 * Math.max(0, fbm(x / 160, z / 160, 3));

  // Zones aplaties (villes, village)
  for (const reg of REGIONS) {
    const d = Math.hypot(x - reg.x, z - reg.z) + noise2(x / 90, z / 90) * 14;
    const f = smoothstep(reg.cityRadius + 80, reg.cityRadius + 5, d);
    if (f > 0) h = lerp(h, reg.ground, f);
  }

  for (const c of carves) h = c.fn(x, z, h);

  // Océan autour du continent
  const seabed = -14 + 4 * fbm(x / 200, z / 200, 2);
  h = lerp(seabed, h, land);
  // Plages : on abaisse doucement vers la mer
  return h;
}

/** Hauteur cible des routes (lissée le long du tracé). */
export const roadSamples: { pts: [number, number][]; h: number[]; width: number }[] = [];

function rasterRoads() {
  for (const road of ROADS) {
    const pts = sampleRoad(road, 5);
    let hs = pts.map(([x, z]) => Math.max(2.2, heightAt(x, z)));
    // lissage (moyenne glissante)
    for (let pass = 0; pass < 6; pass++) {
      const n = hs.slice();
      for (let i = 1; i < hs.length - 1; i++) {
        let s = 0, c = 0;
        for (let k = -6; k <= 6; k++) {
          const j = clamp(i + k, 0, hs.length - 1);
          s += hs[j];
          c++;
        }
        n[i] = s / c;
      }
      hs = n;
    }
    roadSamples.push({ pts, h: hs, width: road.width });
    const half = road.width / 2;
    const fall = 14;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const minx = Math.min(ax, bx) - half - fall, maxx = Math.max(ax, bx) + half + fall;
      const minz = Math.min(az, bz) - half - fall, maxz = Math.max(az, bz) + half + fall;
      const i0 = Math.max(0, Math.floor((minx + HALF) / CELL)), i1 = Math.min(HM_RES - 1, Math.ceil((maxx + HALF) / CELL));
      const j0 = Math.max(0, Math.floor((minz + HALF) / CELL)), j1 = Math.min(HM_RES - 1, Math.ceil((maxz + HALF) / CELL));
      for (let j = j0; j <= j1; j++) {
        for (let ii = i0; ii <= i1; ii++) {
          const x = ii * CELL - HALF, z = j * CELL - HALF;
          const s = distToSegment(x, z, ax, az, bx, bz);
          if (s.d > half + fall) continue;
          const target = lerp(hs[i], hs[i + 1], s.t) - 0.15;
          const w = smoothstep(half + fall, half + 1, s.d);
          const idx = j * HM_RES + ii;
          heights[idx] = lerp(heights[idx], target, w);
        }
      }
    }
  }
}

export function bakeWorld(onProgress?: (p: number) => void) {
  for (let j = 0; j < HM_RES; j++) {
    const z = j * CELL - HALF;
    for (let i = 0; i < HM_RES; i++) {
      const x = i * CELL - HALF;
      heights[j * HM_RES + i] = baseHeight(x, z);
    }
    if (onProgress && j % 64 === 0) onProgress(j / HM_RES);
  }
  rasterRoads();
  bakeSplat();
}

function bakeSplat() {
  for (let j = 0; j < HM_RES; j++) {
    const z = j * CELL - HALF;
    for (let i = 0; i < HM_RES; i++) {
      const x = i * CELL - HALF;
      const idx = j * HM_RES + i;
      const h = heights[idx];
      const hx = heights[j * HM_RES + Math.min(HM_RES - 1, i + 1)] - heights[j * HM_RES + Math.max(0, i - 1)];
      const hz = heights[Math.min(HM_RES - 1, j + 1) * HM_RES + i] - heights[Math.max(0, j - 1) * HM_RES + i];
      const slope = Math.hypot(hx, hz) / (2 * CELL);
      const dd = Math.hypot(x - desert.x, z - desert.z);
      const dp = Math.hypot(x - pole.x, z - pole.z);
      const n = noise2(x / 40, z / 40) * 0.5 + 0.5;
      let sand = smoothstep(desert.radius * 1.25 + n * 60, desert.radius * 0.85, dd);
      sand = Math.max(sand, smoothstep(2.6 + n, 0.9, h) * (h > -6 ? 1 : 0.6)); // plages et fonds
      let snow = smoothstep(pole.radius * 1.25 + n * 60, pole.radius * 0.85, dp);
      snow = Math.max(snow, smoothstep(120 + n * 30, 160, h));
      let rock = smoothstep(0.55, 0.95, slope) * (1 - snow * 0.6);
      const total = Math.max(1e-3, 1);
      const grass = Math.max(0, 1 - sand - snow - rock);
      const o = idx * 4;
      splat[o] = clamp(grass / total, 0, 1) * 255;
      splat[o + 1] = clamp(sand, 0, 1) * 255;
      splat[o + 2] = clamp(snow, 0, 1) * 255;
      splat[o + 3] = clamp(rock, 0, 1) * 255;
    }
  }
}

export function heightAt(x: number, z: number): number {
  const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
  const i = clamp(Math.floor(fx), 0, HM_RES - 2), j = clamp(Math.floor(fz), 0, HM_RES - 2);
  const tx = clamp(fx - i, 0, 1), tz = clamp(fz - j, 0, 1);
  const a = heights[j * HM_RES + i], b = heights[j * HM_RES + i + 1];
  const c = heights[(j + 1) * HM_RES + i], d = heights[(j + 1) * HM_RES + i + 1];
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}

export function splatAt(x: number, z: number): [number, number, number, number] {
  const i = clamp(Math.round((x + HALF) / CELL), 0, HM_RES - 1), j = clamp(Math.round((z + HALF) / CELL), 0, HM_RES - 1);
  const o = (j * HM_RES + i) * 4;
  return [splat[o] / 255, splat[o + 1] / 255, splat[o + 2] / 255, splat[o + 3] / 255];
}

export function normalAt(x: number, z: number, out = new THREE.Vector3()) {
  const e = 1.5;
  const hl = heightAt(x - e, z), hr = heightAt(x + e, z), hd = heightAt(x, z - e), hu = heightAt(x, z + e);
  return out.set(hl - hr, 2 * e, hd - hu).normalize();
}

let heightTex: THREE.DataTexture | null = null;
let splatTex: THREE.DataTexture | null = null;

/** Texture de hauteur (demi-flottants) pour les shaders d'herbe et d'eau. */
export function getHeightTexture() {
  if (heightTex) return heightTex;
  const data = new Uint16Array(HM_RES * HM_RES);
  for (let i = 0; i < data.length; i++) data[i] = THREE.DataUtils.toHalfFloat(heights[i]);
  heightTex = new THREE.DataTexture(data, HM_RES, HM_RES, THREE.RedFormat, THREE.HalfFloatType);
  heightTex.magFilter = THREE.LinearFilter;
  heightTex.minFilter = THREE.LinearFilter;
  heightTex.needsUpdate = true;
  return heightTex;
}

export function getSplatTexture() {
  if (splatTex) return splatTex;
  splatTex = new THREE.DataTexture(splat, HM_RES, HM_RES, THREE.RGBAFormat);
  splatTex.magFilter = THREE.LinearFilter;
  splatTex.minFilter = THREE.LinearMipmapLinearFilter;
  splatTex.generateMipmaps = true;
  splatTex.needsUpdate = true;
  return splatTex;
}

export const WORLD_HALF = HALF;
