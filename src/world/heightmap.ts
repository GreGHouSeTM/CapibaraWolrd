// Relief du monde, calculé une fois au chargement dans une grille de hauteurs.
// Toutes les requêtes (terrain, herbe, physique, eau) utilisent cette même grille.
import * as THREE from 'three';
import { clamp, fbm, lerp, noise2, ridged, smoothstep, distToSegment } from '../core/math';
import { COAST_RADIUS, REGIONS, ROADS, WORLD_SIZE, regionById, sampleRoad, RegionId } from './layout';
import {
  COL_ROUTES, DETAIL, DETAIL_NX, DETAIL_NZ, Grid, bakeDetailSurfaces, polyNearest, sampleGrid, stampDetail, streamInfo, valleySmooth, valleyWeight,
} from './valley';
import { POND } from './zones';

export const HM_RES = 1024;
const CELL = WORLD_SIZE / (HM_RES - 1);
const HALF = WORLD_SIZE / 2;

export const heights = new Float32Array(HM_RES * HM_RES);
/** Grille de détail de Capyville (pas de 0,5 m, voir DETAIL dans valley.ts) : utilisée en priorité par heightAt. */
export const detailHeights = new Float32Array(DETAIL_NX * DETAIL_NZ);
const coarseGrid: Grid = { h: heights, x0: -WORLD_SIZE / 2, z0: -WORLD_SIZE / 2, cell: WORLD_SIZE / (HM_RES - 1), nx: HM_RES, nz: HM_RES };
export const detailGrid: Grid = { h: detailHeights, x0: DETAIL.x0, z0: DETAIL.z0, cell: DETAIL.cell, nx: DETAIL_NX, nz: DETAIL_NZ };
/** Couches de surface de la vallée (1 m) : R roche, G galets, B terre, A sous-bois ; et humidité. */
export let detailSplat: { data: Uint8Array; wet: Uint8Array; nx: number; nz: number; cell: number } | null = null;
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
      // les rivières prennent leur source au pied des montagnes de Capyville
      const t = smoothstep(half + 2, half - 1, d) * (1 - valleyWeight(x, z));
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
    if (reg.id === 'hub') continue; // Capyville : vallée de montagne (valley.ts)
    const d = Math.hypot(x - reg.x, z - reg.z) + noise2(x / 90, z / 90) * 14;
    const f = smoothstep(reg.cityRadius + 80, reg.cityRadius + 5, d);
    if (f > 0) h = lerp(h, reg.ground, f);
  }

  for (const c of carves) h = c.fn(x, z, h);
  // Capyville : vallée, couronne de montagnes et cols
  const wv = valleyWeight(x, z);
  if (wv > 0) h = lerp(h, valleySmooth(x, z, h), wv);

  // Océan autour du continent
  const seabed = -14 + 4 * fbm(x / 200, z / 200, 2);
  h = lerp(seabed, h, land);
  // Plages : on abaisse doucement vers la mer
  return h;
}

/** Hauteur cible des routes (lissée le long du tracé). */
export const roadSamples: { pts: [number, number][]; h: number[]; width: number }[] = [];

const inDetail = (x: number, z: number, m = 0) => x > DETAIL.x0 + m && x < DETAIL.x1 - m && z > DETAIL.z0 + m && z < DETAIL.z1 - m;

/** Pas de chaussée dans le lit du torrent ni dans l'étang : les ponts les franchissent. */
function waterProtect(x: number, z: number) {
  if (!inDetail(x, z)) return 0;
  const s = streamInfo(x, z);
  let p = s.kind !== 4 ? smoothstep(s.width / 2 + 3, s.width / 2 + 0.5, s.d) : 0;
  const e = Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz);
  p = Math.max(p, smoothstep(1.15, 1.0, e));
  return p;
}

function stampRoadOn(g: Grid, pts: [number, number][], hs: number[], half: number, fall: number, skipDetail: boolean) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const minx = Math.min(ax, bx) - half - fall, maxx = Math.max(ax, bx) + half + fall;
    const minz = Math.min(az, bz) - half - fall, maxz = Math.max(az, bz) + half + fall;
    const i0 = Math.max(0, Math.floor((minx - g.x0) / g.cell)), i1 = Math.min(g.nx - 1, Math.ceil((maxx - g.x0) / g.cell));
    const j0 = Math.max(0, Math.floor((minz - g.z0) / g.cell)), j1 = Math.min(g.nz - 1, Math.ceil((maxz - g.z0) / g.cell));
    for (let j = j0; j <= j1; j++) {
      for (let ii = i0; ii <= i1; ii++) {
        const x = g.x0 + ii * g.cell, z = g.z0 + j * g.cell;
        if (skipDetail && inDetail(x, z, -2 * g.cell)) continue;
        const s = distToSegment(x, z, ax, az, bx, bz);
        if (s.d > half + fall) continue;
        const target = lerp(hs[i], hs[i + 1], s.t) - 0.15;
        let w = smoothstep(half + fall, half + 1, s.d);
        if (w <= 0) continue;
        w *= 1 - waterProtect(x, z);
        const idx = j * g.nx + ii;
        g.h[idx] = lerp(g.h[idx], target, w);
      }
    }
  }
}

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
    // axes de Capyville : profil en long imposé par le couloir du col (pente ≤ 8 %)
    const rt = COL_ROUTES.find((r) => Math.hypot(r.pts[0][0] - pts[0][0], r.pts[0][1] - pts[0][1]) < 1);
    if (rt) {
      for (let i = 0; i < pts.length; i++) {
        const nn = polyNearest(pts[i][0], pts[i][1], rt.pts);
        if (nn.d > 12) continue;
        const bed = lerp(rt.y[nn.i], rt.y[nn.i + 1], nn.t);
        hs[i] = bed;
      }
      for (let pass = 0; pass < 2; pass++) {
        const n = hs.slice();
        for (let i = 1; i < hs.length - 1; i++) n[i] = (hs[i - 1] + 2 * hs[i] + hs[i + 1]) / 4;
        hs = n;
      }
    }
    roadSamples.push({ pts, h: hs, width: road.width });
    stampRoadOn(coarseGrid, pts, hs, road.width / 2, 14, true);
    stampRoadOn(detailGrid, pts, hs, road.width / 2, 14, false);
  }
}

/** Interpolation bicubique (Catmull-Rom) de la grille globale. */
function bicubicCoarse(x: number, z: number) {
  const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
  const cr = (p0: number, p1: number, p2: number, p3: number, t: number) =>
    p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  const row = (jj: number) => {
    const o = clamp(jj, 0, HM_RES - 1) * HM_RES;
    const g = (ii: number) => heights[o + clamp(ii, 0, HM_RES - 1)];
    return cr(g(i - 1), g(i), g(i + 1), g(i + 2), tx);
  };
  return cr(row(j - 1), row(j), row(j + 1), row(j + 2), tz);
}

function bakeDetail() {
  const g = detailGrid;
  for (let j = 0; j < g.nz; j++) {
    const z = g.z0 + j * g.cell;
    for (let i = 0; i < g.nx; i++) g.h[j * g.nx + i] = bicubicCoarse(g.x0 + i * g.cell, z);
  }
  stampDetail(g);
}

/** La grille globale reprend, dans l'emprise de détail, la moyenne de la grille fine (cohérence des textures et du lointain). */
function downsampleDetail() {
  const r = CELL / 2;
  const i0 = Math.ceil((DETAIL.x0 + HALF) / CELL), i1 = Math.floor((DETAIL.x1 + HALF) / CELL);
  const j0 = Math.ceil((DETAIL.z0 + HALF) / CELL), j1 = Math.floor((DETAIL.z1 + HALF) / CELL);
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const x = i * CELL - HALF, z = j * CELL - HALF;
      let s = 0, c = 0;
      for (let dz = -r; dz <= r + 1e-6; dz += DETAIL.cell)
        for (let dx = -r; dx <= r + 1e-6; dx += DETAIL.cell) {
          s += sampleGrid(detailGrid, x + dx, z + dz);
          c++;
        }
      const m = Math.min(x - DETAIL.x0, DETAIL.x1 - x, z - DETAIL.z0, DETAIL.z1 - z);
      const idx = j * HM_RES + i;
      heights[idx] = lerp(heights[idx], s / c, smoothstep(0, 8, m));
    }
}

let detailReady = false;

/** Durées de cuisson par étape (ms), pour le suivi des performances. */
export const bakeTimings: Record<string, number> = {};

export function bakeWorld(onProgress?: (p: number) => void) {
  let t = performance.now();
  const lap = (k: string) => { const n = performance.now(); bakeTimings[k] = Math.round(n - t); t = n; };
  detailReady = false;
  roadSamples.length = 0;
  for (let j = 0; j < HM_RES; j++) {
    const z = j * CELL - HALF;
    for (let i = 0; i < HM_RES; i++) {
      const x = i * CELL - HALF;
      heights[j * HM_RES + i] = baseHeight(x, z);
    }
    if (onProgress && j % 64 === 0) onProgress(j / HM_RES);
  }
  lap('global');
  bakeDetail();
  detailReady = true;
  lap('detail');
  rasterRoads();
  lap('routes');
  downsampleDetail();
  lap('reduction');
  detailSplat = bakeDetailSurfaces(detailGrid, 1);
  lap('surfacesDetail');
  bakeSplat();
  lap('surfaces');
}

function bakeSplat() {
  const ds = detailSplat!;
  for (let j = 0; j < HM_RES; j++) {
    const z = j * CELL - HALF;
    for (let i = 0; i < HM_RES; i++) {
      const x = i * CELL - HALF;
      const idx = j * HM_RES + i;
      const h = heights[idx];
      const o = idx * 4;
      if (inDetail(x, z, 1)) {
        // vallée : résumé des couches fines (herbe = complément ; galets → canal « sable » ; roche)
        const di = Math.round((x - DETAIL.x0) / ds.cell), dj = Math.round((z - DETAIL.z0) / ds.cell);
        const q = (dj * ds.nx + di) * 4;
        const rock = ds.data[q] / 255, peb = ds.data[q + 1] / 255, dirt = ds.data[q + 2] / 255, forest = ds.data[q + 3] / 255;
        const grass = clamp(1 - rock - peb - dirt - forest * 0.6, 0, 1);
        splat[o] = grass * 255;
        splat[o + 1] = clamp(peb, 0, 1) * 255;
        splat[o + 2] = 0;
        splat[o + 3] = clamp(rock, 0, 1) * 255;
        continue;
      }
      const hx = heights[j * HM_RES + Math.min(HM_RES - 1, i + 1)] - heights[j * HM_RES + Math.max(0, i - 1)];
      const hz = heights[Math.min(HM_RES - 1, j + 1) * HM_RES + i] - heights[Math.max(0, j - 1) * HM_RES + i];
      const slope = Math.hypot(hx, hz) / (2 * CELL);
      const dd = Math.hypot(x - desert.x, z - desert.z);
      const dp = Math.hypot(x - pole.x, z - pole.z);
      const n = noise2(x / 40, z / 40) * 0.5 + 0.5;
      let sand = smoothstep(desert.radius * 1.25 + n * 60, desert.radius * 0.85, dd);
      sand = Math.max(sand, smoothstep(2.6 + n, 0.9, h) * (h > -6 ? 1 : 0.6)); // plages et fonds
      let snow = smoothstep(pole.radius * 1.25 + n * 60, pole.radius * 0.85, dp);
      snow = Math.max(snow, smoothstep(120 + n * 30, 160, h) * (1 - valleyWeight(x, z)));
      const rock = smoothstep(0.55, 0.95, slope) * (1 - snow * 0.6);
      const grass = Math.max(0, 1 - sand - snow - rock);
      splat[o] = clamp(grass, 0, 1) * 255;
      splat[o + 1] = clamp(sand, 0, 1) * 255;
      splat[o + 2] = clamp(snow, 0, 1) * 255;
      splat[o + 3] = clamp(rock, 0, 1) * 255;
    }
  }
}

function coarseHeightAt(x: number, z: number): number {
  const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
  const i = clamp(Math.floor(fx), 0, HM_RES - 2), j = clamp(Math.floor(fz), 0, HM_RES - 2);
  const tx = clamp(fx - i, 0, 1), tz = clamp(fz - j, 0, 1);
  const a = heights[j * HM_RES + i], b = heights[j * HM_RES + i + 1];
  const c = heights[(j + 1) * HM_RES + i], d = heights[(j + 1) * HM_RES + i + 1];
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}

/** Altitude du sol : grille de détail (0,5 m) dans la vallée de Capyville, grille globale ailleurs. */
export function heightAt(x: number, z: number): number {
  if (detailReady && x > DETAIL.x0 && x < DETAIL.x1 && z > DETAIL.z0 && z < DETAIL.z1) {
    const fx = (x - DETAIL.x0) / DETAIL.cell, fz = (z - DETAIL.z0) / DETAIL.cell;
    const i = Math.min(DETAIL_NX - 2, Math.floor(fx)), j = Math.min(DETAIL_NZ - 2, Math.floor(fz));
    const tx = fx - i, tz = fz - j;
    const o = j * DETAIL_NX + i;
    const h = lerp(lerp(detailHeights[o], detailHeights[o + 1], tx), lerp(detailHeights[o + DETAIL_NX], detailHeights[o + DETAIL_NX + 1], tx), tz);
    const m = Math.min(x - DETAIL.x0, DETAIL.x1 - x, z - DETAIL.z0, DETAIL.z1 - z);
    return m >= 10 ? h : lerp(coarseHeightAt(x, z), h, smoothstep(0, 10, m));
  }
  return coarseHeightAt(x, z);
}

/** Humidité du sol (0..1) au bord de l'eau dans la vallée. */
export function wetAt(x: number, z: number): number {
  const ds = detailSplat;
  if (!ds || !inDetail(x, z)) return 0;
  const i = Math.round((x - DETAIL.x0) / ds.cell), j = Math.round((z - DETAIL.z0) / ds.cell);
  return ds.wet[j * ds.nx + i] / 255;
}

export function splatAt(x: number, z: number): [number, number, number, number] {
  const i = clamp(Math.round((x + HALF) / CELL), 0, HM_RES - 1), j = clamp(Math.round((z + HALF) / CELL), 0, HM_RES - 1);
  const o = (j * HM_RES + i) * 4;
  return [splat[o] / 255, splat[o + 1] / 255, splat[o + 2] / 255, splat[o + 3] / 255];
}

export function normalAt(x: number, z: number, out = new THREE.Vector3(), e = 1.5) {
  const hl = heightAt(x - e, z), hr = heightAt(x + e, z), hd = heightAt(x, z - e), hu = heightAt(x, z + e);
  return out.set(hl - hr, 2 * e, hd - hu).normalize();
}

let heightTex: THREE.DataTexture | null = null;
let splatTex: THREE.DataTexture | null = null;
let detailHeightTex: THREE.DataTexture | null = null;
let detailSplatTex: THREE.DataTexture | null = null;

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

/** Texture de hauteur fine de la vallée (0,5 m, demi-flottants) ; emprise DETAIL (voir terrainHeightUniforms). */
export function getDetailHeightTexture() {
  if (detailHeightTex) return detailHeightTex;
  const data = new Uint16Array(DETAIL_NX * DETAIL_NZ);
  for (let i = 0; i < data.length; i++) data[i] = THREE.DataUtils.toHalfFloat(detailHeights[i]);
  detailHeightTex = new THREE.DataTexture(data, DETAIL_NX, DETAIL_NZ, THREE.RedFormat, THREE.HalfFloatType);
  detailHeightTex.magFilter = THREE.LinearFilter;
  detailHeightTex.minFilter = THREE.LinearFilter;
  detailHeightTex.needsUpdate = true;
  return detailHeightTex;
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

/** Couches de surface fines de la vallée (1 m) : R roche, G galets, B terre, A sous-bois. */
export function getDetailSplatTexture() {
  if (detailSplatTex) return detailSplatTex;
  const ds = detailSplat!;
  detailSplatTex = new THREE.DataTexture(ds.data, ds.nx, ds.nz, THREE.RGBAFormat);
  detailSplatTex.magFilter = THREE.LinearFilter;
  detailSplatTex.minFilter = THREE.LinearMipmapLinearFilter;
  detailSplatTex.generateMipmaps = true;
  detailSplatTex.needsUpdate = true;
  return detailSplatTex;
}

/**
 * Uniformes pour lire l'altitude du sol dans un shader (herbe, eau…) avec la précision de la grille fine.
 * À utiliser avec TERRAIN_HEIGHT_GLSL : `float h = terrainHeight(worldPos.xz);`
 */
export function terrainHeightUniforms() {
  return {
    uTHGlobal: { value: getHeightTexture() },
    uTHDetail: { value: getDetailHeightTexture() },
    uTHRect: { value: new THREE.Vector4(DETAIL.x0, DETAIL.z0, DETAIL.x1, DETAIL.z1) },
    uTHRes: { value: new THREE.Vector4(HM_RES, DETAIL_NX, DETAIL_NZ, WORLD_SIZE) },
  };
}
export const TERRAIN_HEIGHT_GLSL = /* glsl */ `
uniform sampler2D uTHGlobal, uTHDetail;
uniform vec4 uTHRect, uTHRes;
float terrainHeight(vec2 p) {
  // grille globale : nœud i en i * W / (N - 1) - W / 2, centre de texel en (i + 0.5) / N
  float n = uTHRes.x;
  vec2 g = (p + uTHRes.w * 0.5) / uTHRes.w * (n - 1.0);
  float hg = texture2D(uTHGlobal, (g + 0.5) / n).r;
  vec2 q = (p - uTHRect.xy) / (uTHRect.zw - uTHRect.xy);
  if (q.x <= 0.0 || q.y <= 0.0 || q.x >= 1.0 || q.y >= 1.0) return hg;
  vec2 res = uTHRes.yz;
  float hd = texture2D(uTHDetail, (q * (res - 1.0) + 0.5) / res).r;
  float m = min(min(p.x - uTHRect.x, uTHRect.z - p.x), min(p.y - uTHRect.y, uTHRect.w - p.y));
  return mix(hg, hd, smoothstep(0.0, 10.0, m));
}
`;

export const WORLD_HALF = HALF;
