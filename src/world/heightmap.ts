// Relief du monde (spécialité Terrain & relief) : lu dans le relief cuit hors ligne (tools/terrain/gen_terrain.py,
// public/assets/terrain/), chargé par loadTerrainData (terrain-data.ts) avant bakeWorld.
// - heightAt(x, z) : grille fine de Capyville (0,5 m) dans l'emprise DETAIL de valley.ts, tuiles de 2 m ailleurs
//   (interpolation bilinéaire) ; c'est la même fonction que le shader du terrain (TERRAIN_HEIGHT_GLSL).
// - heights / splat : grille de synthèse (HM_RES × HM_RES sur WORLD_SIZE) pour la carte, l'herbe, l'eau et la flore.
import * as THREE from 'three';
import { clamp, distToSegment, lerp, smoothstep } from '../core/math';
import { ROADS, WORLD_SIZE, regionById, sampleRoad, RegionId } from './layout';
import { COL_ROUTES, DETAIL, DETAIL_NX, DETAIL_NZ, Grid, bakeDetailSurfaces, polyNearest } from './valley';
import { terrainData } from './terrain-data';
import { LAKES, ISLANDS, WORLD_PEAKS } from './world-map';
import { detailMask, detailShape } from './terrain-detail';

/** Résolution de la grille de synthèse (pas de 3,9 m sur 8 km). */
export const HM_RES = 2049;
const CELL = WORLD_SIZE / (HM_RES - 1);
const HALF = WORLD_SIZE / 2;

export const heights = new Float32Array(HM_RES * HM_RES);
/** Grille de détail de Capyville (pas de 0,5 m, voir DETAIL dans valley.ts) : utilisée en priorité par heightAt. */
export let detailHeights = new Float32Array(DETAIL_NX * DETAIL_NZ);
export const detailGrid: Grid = { h: detailHeights, x0: DETAIL.x0, z0: DETAIL.z0, cell: DETAIL.cell, nx: DETAIL_NX, nz: DETAIL_NZ };
/** Couches de surface de la vallée (1 m) : R roche, G galets, B terre, A sous-bois ; et humidité. */
export let detailSplat: { data: Uint8Array; wet: Uint8Array; nx: number; nz: number; cell: number } | null = null;
/** Surfaces de synthèse : herbe, sable, neige, roche (0..255). */
export const splat = new Uint8Array(HM_RES * HM_RES * 4);

// Grille de 2 m de toute l'île (référence vers les données chargées)
let fine: Float32Array = new Float32Array(4);
let FN = 2, FX0 = 0, FC = 2;

// ---------- Éléments particuliers du relief, lus dans world-map.ts (bible du monde, annexe) ----------
const paris = regionById('paris');
const london = regionById('london');
const desert = regionById('desert');

/** Rivières des villes (Paris : la Seine, Londres : la Tamise) : tronçon du tracé dense qui traverse la ville. */
export const RIVERS: { pts: [number, number][]; width: number; region: RegionId }[] = [];

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

const isle = ISLANDS.find((i) => i.id === 'ile-statue')!;
export const LIBERTY_POS: [number, number] = [isle.x, isle.z];
const fujiPk = WORLD_PEAKS.find((p) => p.id === 'fuji')!;
export const FUJI_POS: [number, number] = [fujiPk.x, fujiPk.z];
const torii = LAKES.find((l) => l.id === 'lac-torii')!;
export const JP_LAKE: [number, number] = [torii.x, torii.z];
const oasis = LAKES.find((l) => l.id === 'oasis')!;
export const OASIS_POS: [number, number] = [oasis.x - 30, oasis.z + 20];
const dsOut = (() => { const l = Math.hypot(desert.x, desert.z); return [desert.x / l, desert.z / l]; })();
/** Pyramides au bord du chott (plats cuits par tools/terrain/carve.py, même calcul). */
export const PYRAMIDS: { x: number; z: number; s: number }[] = [
  { x: desert.x + dsOut[0] * 230 - 60, z: desert.z + dsOut[1] * 230 + 70, s: 70 },
  { x: desert.x + dsOut[0] * 300 + 40, z: desert.z + dsOut[1] * 300 - 10, s: 55 },
  { x: desert.x + dsOut[0] * 200 + 110, z: desert.z + dsOut[1] * 200 - 90, s: 38 },
];
export const HOT_SPRING: [number, number] = [60, 70];
export const HUB_POND: [number, number] = [-120, 90];

/** Voie à dessiner : tracé, profil en long h (altitude de la plateforme), largeur du ruban, revêtement,
 *  tronçons en pont ou viaduc [s0, s1] (abscisses depuis le début de la voie, où le ruban suit h au lieu du sol). */
export interface RoadSample { pts: [number, number][]; h: number[]; width: number; id?: string; kind?: string; surface?: string; bridges?: [number, number][] }
/** Voies carrossables (couloirs de Capyville puis voies du monde posées par le générateur). */
export const roadSamples: RoadSample[] = [];
/** Chemins étroits et sentiers posés par le générateur (lacets vers les sommets) : dessinés en bandes de terre. */
export const pathSamples: RoadSample[] = [];

const inDetail = (x: number, z: number, m = 0) => x > DETAIL.x0 + m && x < DETAIL.x1 - m && z > DETAIL.z0 + m && z < DETAIL.z1 - m;

function buildRoadSamples() {
  roadSamples.length = 0;
  pathSamples.length = 0;
  // 1. les six couloirs des cols de Capyville (ROADS[0..5] de layout.ts) : profil en long du couloir (pente ≤ 8 %)
  for (const road of ROADS.slice(0, COL_ROUTES.length)) {
    const pts = sampleRoad(road, 5);
    let hs = pts.map(([x, z]) => Math.max(0.3, heightAt(x, z)));
    const rt = COL_ROUTES.find((r) => Math.hypot(r.pts[0][0] - pts[0][0], r.pts[0][1] - pts[0][1]) < 1);
    if (rt) {
      for (let i = 0; i < pts.length; i++) {
        const nn = polyNearest(pts[i][0], pts[i][1], rt.pts);
        if (nn.d < 12) hs[i] = lerp(rt.y[nn.i], rt.y[nn.i + 1], nn.t) - 0.15;
      }
    }
    // profil lissé (moyenne glissante sur 65 m)
    for (let pass = 0; pass < 3; pass++) {
      const n = hs.slice();
      for (let i = 0; i < hs.length; i++) {
        let s = 0, c = 0;
        for (let k = -6; k <= 6; k++) { const j = i + k; if (j < 0 || j >= hs.length) continue; s += hs[j]; c++; }
        n[i] = s / c;
      }
      hs = n;
    }
    roadSamples.push({ pts, h: hs, width: road.width });
  }
  // 2. voies du monde, tracées et posées par le générateur (tools/terrain/roads.py : lacets, plateforme, ouvrages)
  const works = terrainData!.meta.ouvrages ?? [];
  for (const w of terrainData!.meta.ways ?? []) {
    const bridges = works.filter((o) => o.way === w.id && (o.kind === 'pont' || o.kind === 'viaduc')).map((o) => [o.s0, o.s1] as [number, number]);
    const base = { pts: w.pts, h: w.y, id: w.id, kind: w.kind, surface: w.surface, bridges };
    if (w.vehicles && w.width >= 5) roadSamples.push({ ...base, width: w.kind === 'route' ? 9 : w.width + 1 });
    else pathSamples.push({ ...base, width: w.width });
  }
}

let detailReady = false;

/** Durées de cuisson par étape (ms), pour le suivi des performances. */
export const bakeTimings: Record<string, number> = {};

/** Rivières des villes : on garde le tronçon du tracé dense à moins de 700 m du centre. */
function cityRivers() {
  RIVERS.length = 0;
  const td = terrainData!;
  const pick = (id: string, reg: typeof paris, rid: RegionId) => {
    const rv = td.meta.rivers.find((r) => r.id === id);
    if (!rv) return;
    const pts: [number, number][] = [];
    let w = 30;
    rv.pts.forEach((p, i) => {
      if (Math.hypot(p[0] - reg.x, p[1] - reg.z) < 700) { pts.push(p); w = rv.w[i]; }
    });
    if (pts.length > 1) RIVERS.push({ pts, width: w, region: rid });
  };
  pick('seine', paris, 'paris');
  pick('tamise', london, 'london');
}

/**
 * Prépare le relief : à appeler après loadTerrainData (chargement asynchrone des tuiles).
 * Branche la grille fine de Capyville, cuit ses couches de surface, la grille de synthèse et les profils des routes.
 */
export function bakeWorld(onProgress?: (p: number) => void) {
  const td = terrainData;
  if (!td) throw new Error('bakeWorld : relief non chargé (appeler loadTerrainData avant)');
  let t = performance.now();
  const lap = (k: string) => { const n = performance.now(); bakeTimings[k] = Math.round(n - t); t = n; };
  fine = td.height;
  FN = td.meta.height.n;
  FX0 = td.meta.height.x0;
  FC = td.meta.height.cell;
  detailHeights = td.valley;
  detailGrid.h = detailHeights;
  detailReady = true;
  heightTex = fineTex = splatTex = detailHeightTex = detailSplatTex = null;
  lap('donnees');
  for (let j = 0; j < HM_RES; j++) {
    const z = j * CELL - HALF;
    for (let i = 0; i < HM_RES; i++) heights[j * HM_RES + i] = heightBaseAt(i * CELL - HALF, z);
    if (onProgress && j % 256 === 0) onProgress(j / HM_RES);
  }
  lap('synthese');
  detailSplat = bakeDetailSurfaces(detailGrid, 1);
  lap('surfacesDetail');
  bakeSplat();
  lap('surfaces');
  cityRivers();
  buildRoadSamples();
  lap('routes');
}

/** Échantillon (bilinéaire) d'une carte RGBA 8 bits de terrainData, canal c (0..1). */
function mapAt(m: { x0: number; cell: number; n: number }, data: Uint8Array, x: number, z: number, c: number) {
  const fx = clamp((x - m.x0) / m.cell, 0, m.n - 1.001), fz = clamp((z - m.x0) / m.cell, 0, m.n - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
  const o = (j * m.n + i) * 4 + c, o2 = o + m.n * 4;
  return lerp(lerp(data[o], data[o + 4], tx), lerp(data[o2], data[o2 + 4], tx), tz) / 255;
}

/** Couches de la carte dérivée en un point : écoulement, humidité, dépôts, roche (0..1). Pour la Végétation et les rochers. */
export function surfaceAt(x: number, z: number): [number, number, number, number] {
  const td = terrainData!;
  const m = td.meta.surface;
  return [mapAt(m, td.surface, x, z, 0), mapAt(m, td.surface, x, z, 1), mapAt(m, td.surface, x, z, 2), mapAt(m, td.surface, x, z, 3)];
}
/** Sol du biome en un point : sable, neige, sol sec, mousse (0..1). */
export function biomeAt(x: number, z: number): [number, number, number, number] {
  const td = terrainData!;
  const m = td.meta.biome;
  return [mapAt(m, td.biome, x, z, 0), mapAt(m, td.biome, x, z, 1), mapAt(m, td.biome, x, z, 2), mapAt(m, td.biome, x, z, 3)];
}

function bakeSplat() {
  const ds = detailSplat!;
  for (let j = 0; j < HM_RES; j++) {
    const z = j * CELL - HALF;
    for (let i = 0; i < HM_RES; i++) {
      const x = i * CELL - HALF;
      const idx = j * HM_RES + i;
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
      const sand = biomeAt(x, z)[0], snow = biomeAt(x, z)[1];
      const rock = surfaceAt(x, z)[3];
      const h = heights[idx];
      const sa = Math.max(sand, h < 1.5 ? 1 : 0) * (1 - snow);
      const ro = rock * (1 - snow * 0.5);
      const gr = Math.max(0, 1 - sa - snow - ro);
      splat[o] = clamp(gr, 0, 1) * 255;
      splat[o + 1] = clamp(sa, 0, 1) * 255;
      splat[o + 2] = clamp(snow, 0, 1) * 255;
      splat[o + 3] = clamp(ro, 0, 1) * 255;
    }
  }
}

/** Altitude de la grille de 2 m (bilinéaire). */
export function fineHeightAt(x: number, z: number): number {
  const fx = clamp((x - FX0) / FC, 0, FN - 1.001), fz = clamp((z - FX0) / FC, 0, FN - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz);
  const tx = fx - i, tz = fz - j;
  const o = j * FN + i;
  return lerp(lerp(fine[o], fine[o + 1], tx), lerp(fine[o + FN], fine[o + FN + 1], tx), tz);
}

// --- PREUVE NEXT-GEN (?demo=foret) : crochet additif, sol de remplacement de la zone de démonstration (null = monde normal)
let groundOverride: ((x: number, z: number) => number) | null = null;
export function setGroundOverride(fn: ((x: number, z: number) => number) | null) {
  groundOverride = fn;
}


/** Détail de près (terrain-detail.ts) : roche, éboulis et pentes fortes ; nul sur les voies, les plats et à Capyville. */
export function detailAt(x: number, z: number): number {
  const td = terrainData;
  if (!td || Math.hypot(x, z) < 640) return 0;
  const sx = (fineHeightAt(x + 2, z) - fineHeightAt(x - 2, z)) / 4, sz = (fineHeightAt(x, z + 2) - fineHeightAt(x, z - 2)) / 4;
  const S = td.meta.surface;
  const m = detailMask(mapAt(S, td.surface, x, z, 3), mapAt(S, td.surface, x, z, 2), Math.hypot(sx, sz), x, z);
  return m > 0.001 ? m * detailShape(x, z) : 0;
}

/** Altitude du sol : grille de détail (0,5 m) dans la vallée de Capyville, tuiles de 2 m ailleurs, plus le détail de près. */
export function heightAt(x: number, z: number): number {
  if (groundOverride) return groundOverride(x, z);
  return heightBaseAt(x, z) + detailAt(x, z);
}

/** Altitude du sol sans le détail de près (grille de synthèse, cartes). */
export function heightBaseAt(x: number, z: number): number {

  if (detailReady && x > DETAIL.x0 && x < DETAIL.x1 && z > DETAIL.z0 && z < DETAIL.z1) {
    const fx = (x - DETAIL.x0) / DETAIL.cell, fz = (z - DETAIL.z0) / DETAIL.cell;
    const i = Math.min(DETAIL_NX - 2, Math.floor(fx)), j = Math.min(DETAIL_NZ - 2, Math.floor(fz));
    const tx = fx - i, tz = fz - j;
    const o = j * DETAIL_NX + i;
    const h = lerp(lerp(detailHeights[o], detailHeights[o + 1], tx), lerp(detailHeights[o + DETAIL_NX], detailHeights[o + DETAIL_NX + 1], tx), tz);
    const m = Math.min(x - DETAIL.x0, DETAIL.x1 - x, z - DETAIL.z0, DETAIL.z1 - z);
    return m >= 10 ? h : lerp(fineHeightAt(x, z), h, smoothstep(0, 10, m));
  }
  return fineHeightAt(x, z);
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

// ------------------------------------------------------------------------------------------- textures GPU
let heightTex: THREE.DataTexture | null = null;
let fineTex: THREE.DataTexture | null = null;
let splatTex: THREE.DataTexture | null = null;
let detailHeightTex: THREE.DataTexture | null = null;
let detailSplatTex: THREE.DataTexture | null = null;
let surfaceTex: THREE.DataTexture | null = null;
let biomeTex: THREE.DataTexture | null = null;

function floatTex(data: Float32Array, w: number, h: number) {
  const t = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.FloatType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

/** Texture de hauteur de synthèse (HM_RES², flottants 32 bits) pour l'eau. */
export function getHeightTexture() {
  return (heightTex ??= floatTex(heights, HM_RES, HM_RES));
}
/** Texture de hauteur de 2 m de toute l'île (flottants 32 bits, 4096², 64 Mo sur la carte graphique). */
export function getFineHeightTexture() {
  return (fineTex ??= floatTex(fine, FN, FN));
}
/** Texture de hauteur fine de la vallée (0,5 m) ; emprise DETAIL (voir terrainHeightUniforms). */
export function getDetailHeightTexture() {
  return (detailHeightTex ??= floatTex(detailHeights, DETAIL_NX, DETAIL_NZ));
}

function byteTex(data: Uint8Array, w: number, h: number, mip = true) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = mip;
  t.needsUpdate = true;
  return t;
}
export function getSplatTexture() {
  return (splatTex ??= byteTex(splat, HM_RES, HM_RES));
}
/** Couches de surface fines de la vallée (1 m) : R roche, G galets, B terre, A sous-bois. */
export function getDetailSplatTexture() {
  const ds = detailSplat!;
  return (detailSplatTex ??= byteTex(ds.data, ds.nx, ds.nz));
}
/** Carte dérivée de 4 m : R écoulement, G humidité, B dépôts, A roche. */
export function getSurfaceTexture() {
  const td = terrainData!;
  return (surfaceTex ??= byteTex(td.surface, td.meta.surface.n, td.meta.surface.n));
}
/** Carte des biomes de 8 m : R sable, G neige, B sol sec, A mousse. */
export function getBiomeTexture() {
  const td = terrainData!;
  return (biomeTex ??= byteTex(td.biome, td.meta.biome.n, td.meta.biome.n));
}

/**
 * Uniformes pour lire l'altitude du sol dans un shader (herbe, eau, terrain) avec la précision de heightAt.
 * À utiliser avec TERRAIN_HEIGHT_GLSL : `float h = terrainHeight(worldPos.xz);`
 */
export function terrainHeightUniforms() {
  return {
    uTHGlobal: { value: getFineHeightTexture() },
    uTHDetail: { value: getDetailHeightTexture() },
    uTHRect: { value: new THREE.Vector4(DETAIL.x0, DETAIL.z0, DETAIL.x1, DETAIL.z1) },
    // x : taille de la grille de 2 m, y z : taille de la grille de la vallée, w : origine de la grille de 2 m
    uTHRes: { value: new THREE.Vector4(FN, DETAIL_NX, DETAIL_NZ, FX0) },
    uTHCell: { value: FC },
  };
}
export const TERRAIN_HEIGHT_GLSL = /* glsl */ `
uniform highp sampler2D uTHGlobal, uTHDetail;
uniform vec4 uTHRect, uTHRes;
uniform float uTHCell;
float terrainHeightFine(vec2 p) {
  // grille de 2 m : nœud i en x0 + i × cell, centre de texel en (i + 0.5) / n
  vec2 g = (p - uTHRes.w) / uTHCell;
  return texture(uTHGlobal, (g + 0.5) / uTHRes.x).r;
}
float terrainHeight(vec2 p) {
  float hg = terrainHeightFine(p);
  vec2 q = (p - uTHRect.xy) / (uTHRect.zw - uTHRect.xy);
  if (q.x <= 0.0 || q.y <= 0.0 || q.x >= 1.0 || q.y >= 1.0) return hg;
  vec2 res = uTHRes.yz;
  float hd = texture(uTHDetail, (q * (res - 1.0) + 0.5) / res).r;
  float m = min(min(p.x - uTHRect.x, uTHRect.z - p.x), min(p.y - uTHRect.y, uTHRect.w - p.y));
  return mix(hg, hd, smoothstep(0.0, 10.0, m));
}
`;

export const WORLD_HALF = HALF;
