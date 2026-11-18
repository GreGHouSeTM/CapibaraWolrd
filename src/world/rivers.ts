// Eau courante et bassins de Capyville (spécialité Eau).
//
// - Torrent Yuzawa : ruban d'eau à hauteur locale le long de STREAM (zones.ts), élargi sous les berges ;
//   écoulement animé dans le sens de la pente (carte de flux à deux phases, motif étiré dans le courant,
//   vitesse selon la pente et plus forte au milieu du lit), écume cuite dans une texture (sillage des rochers,
//   rapides, seuils, pied des cascades), transparence et couleur selon la profondeur (on voit les galets du lit),
//   reflets du ciel (carte d'environnement) et des lanternes (lumières dynamiques), petites vagues stationnaires
//   dans les rapides. Au village, l'eau descend par petits seuils de pierre de 0,2 m (bible §2.6).
// - Cascades (CASCADES) : nappes paraboliques à double face, écume bouillonnante et brume au pied.
// - Bief du moulin, yubatake turquoise, rizières en miroir, eau laiteuse des bains (rotenburo, ashiyu).
//
// API : `waterAt(x, z)` (surface et profondeur de nage, pour le joueur), `WATER_FX` (points d'écume et de brume
// pour la spécialité Effets), `buildRivers(root)` (construit tout ; renvoie `update(t, dt)`), `bathWater()`,
// `replaceModelWater()`, `waterDetailTexture()` (texture de détail partagée : normales, écume, bruit).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CASCADES, FIELDS, HOT_SPRING_POOL, STREAM, STREAM_WATER_Y, STREAM_WIDTHS, YUBATAKE } from './zones';
import { streamInfo, streamWaterAt } from './valley';
import { heightAt } from './heightmap';
import { addBox } from './physics';
import { addSmokeSpot } from './registry';
import { WATER_LEVEL } from './layout';
import { Rng, clamp, lerp, noise2, smoothstep } from '../core/math';
import { pbr } from '../core/assets';
import { ATMO } from './sky';

// =============================================================================================== API DE JEU
/** Bassins chauds (rotenburo) : surface connue, trop peu profonds pour nager. */
const BATH = HOT_SPRING_POOL;

/**
 * Surface d'eau au point (x, z) et profondeur minimale de nage : `y` altitude de la surface, `swim` profondeur
 * d'eau au-delà de laquelle le capybara nage (sinon il marche dans l'eau). null hors de l'eau locale
 * (le plan d'eau global y = 0, mer et étang, reste géré par WATER_LEVEL).
 */
export function waterAt(x: number, z: number): { y: number; swim: number; kind: 'torrent' | 'bain' | 'etang' } {
  const y = streamWaterAt(x, z, 0.2);
  if (y !== null) return { y: y + localOffset(x, z), swim: 0.72, kind: 'torrent' };
  const db = Math.hypot(x - BATH.x, z - BATH.z);
  if (db < BATH.r) return { y: BATH.waterY, swim: 9, kind: 'bain' };
  return { y: WATER_LEVEL, swim: 0.55, kind: 'etang' };
}

/** Points d'intégration pour la spécialité Effets (brume, embruns, éclaboussures). */
export const WATER_FX: {
  /** pied des cascades : position, largeur, hauteur de chute, direction du courant */
  cascades: { id: string; pos: THREE.Vector3; width: number; height: number; dir: THREE.Vector2 }[];
  /** seuils de pierre du village (petite écume) */
  weirs: { pos: THREE.Vector3; width: number }[];
} = { cascades: [], weirs: [] };

// =============================================================================================== TEXTURE DE DÉTAIL
let detailTex: THREE.DataTexture | null = null;
/**
 * Texture de détail de l'eau, répétable (256², RGBA) : RG normale de vagues (somme d'ondes périodiques),
 * B motif d'écume (réseau de bulles de Worley), A bruit doux.
 */
export function waterDetailTexture() {
  if (detailTex) return detailTex;
  const N = 256;
  const rng = new Rng(4242);
  const waves: { kx: number; ky: number; a: number; p: number }[] = [];
  for (let i = 0; i < 48; i++) {
    const r = Math.round(lerp(2, 26, Math.pow(rng.next(), 1.6)));
    const th = rng.range(0, Math.PI * 2);
    const kx = Math.round(Math.cos(th) * r), ky = Math.round(Math.sin(th) * r);
    if (kx === 0 && ky === 0) continue;
    waves.push({ kx, ky, a: 1 / Math.pow(Math.hypot(kx, ky), 1.15), p: rng.range(0, Math.PI * 2) });
  }
  const waves2: typeof waves = [];
  for (let i = 0; i < 20; i++) {
    const r = rng.int(1, 6), th = rng.range(0, Math.PI * 2);
    const kx = Math.round(Math.cos(th) * r), ky = Math.round(Math.sin(th) * r);
    if (kx || ky) waves2.push({ kx, ky, a: 1 / Math.hypot(kx, ky), p: rng.range(0, 6.28) });
  }
  // cellules de Worley (16 × 16, périodiques)
  const C = 14;
  const pts: number[] = [];
  for (let i = 0; i < C * C; i++) pts.push(rng.next(), rng.next());
  const gx = new Float32Array(N * N), gy = new Float32Array(N * N), fo = new Float32Array(N * N), nz = new Float32Array(N * N);
  let mg = 0, mn = -1e9, mnn = 1e9;
  const TAU = Math.PI * 2;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const u = i / N, v = j / N;
      let dx = 0, dy = 0;
      for (const w of waves) {
        const c = Math.cos(TAU * (w.kx * u + w.ky * v) + w.p) * w.a;
        dx += c * w.kx;
        dy += c * w.ky;
      }
      const k = j * N + i;
      gx[k] = dx; gy[k] = dy;
      mg = Math.max(mg, Math.abs(dx), Math.abs(dy));
      // Worley F2 - F1
      const cu = u * C, cv = v * C;
      const ci = Math.floor(cu), cj = Math.floor(cv);
      let f1 = 9, f2 = 9;
      for (let b = -1; b <= 1; b++)
        for (let a = -1; a <= 1; a++) {
          const ii = (ci + a + C) % C, jj = (cj + b + C) % C;
          const px = ci + a + pts[(jj * C + ii) * 2], py = cj + b + pts[(jj * C + ii) * 2 + 1];
          const d = Math.hypot(px - cu, py - cv);
          if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
        }
      let s = 0;
      for (const w of waves2) s += Math.sin(TAU * (w.kx * u + w.ky * v) + w.p) * w.a;
      nz[k] = s;
      mn = Math.max(mn, s); mnn = Math.min(mnn, s);
      // bulles : bords de cellules fins, modulés par le bruit doux
      fo[k] = (1 - smoothstep(0.0, 0.16, f2 - f1)) * 0.75 + (1 - smoothstep(0.0, 0.5, f1)) * 0.25;
    }
  const data = new Uint8Array(N * N * 4);
  for (let k = 0; k < N * N; k++) {
    data[k * 4] = Math.round((gx[k] / mg) * 127 + 128);
    data[k * 4 + 1] = Math.round((gy[k] / mg) * 127 + 128);
    const n = (nz[k] - mnn) / (mn - mnn);
    data[k * 4 + 2] = Math.round(clamp(fo[k] * (0.55 + 0.6 * n), 0, 1) * 255);
    data[k * 4 + 3] = Math.round(n * 255);
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  detailTex = t;
  return t;
}

/** Fonctions GLSL communes (flux à deux phases, repère du courant). */
export const WATER_GLSL = /* glsl */ `
  uniform sampler2D uDet;
  uniform float uTime;
  vec2 wRot(vec2 v, vec2 f) { return vec2(dot(v, f), dot(v, vec2(-f.y, f.x))); }
  // échantillonne la texture de détail le long d'un courant (deux phases fondues : pas d'étirement à la longue)
  vec4 wFlow(vec2 q, float spd, float per, float sc, float seed) {
    float ph0 = fract(uTime / per + seed), ph1 = fract(uTime / per + seed + 0.5);
    float w0 = 1.0 - abs(1.0 - 2.0 * ph0);
    vec4 a = texture2D(uDet, (q - vec2(spd * ph0 * per, 0.0)) * sc + seed);
    vec4 b = texture2D(uDet, (q - vec2(spd * ph1 * per, 0.0)) * sc + seed + vec2(0.47, 0.29));
    return mix(b, a, w0);
  }
`;

// =============================================================================================== TORRENT : TRACÉ
const NSEG = STREAM.length - 1;
/** Même classement que valley.ts : 0 gorge, 1 seuil du moulin, 2 village (murs), 3 sud, 4 étang. */
const segKind = (i: number) => (i <= 10 ? 0 : i === 11 ? 1 : i <= 16 ? 2 : i <= 22 ? 3 : 4);
const segLen = (i: number) => Math.hypot(STREAM[i + 1][0] - STREAM[i][0], STREAM[i + 1][1] - STREAM[i][1]);
const isCascadeSeg = (i: number) => Math.abs(STREAM_WATER_Y[i] - STREAM_WATER_Y[i + 1]) > 0.9 && segLen(i) < 3;

interface Sample {
  x: number; z: number;
  /** normale (gauche du courant) */
  nx: number; nz: number;
  /** direction du courant */
  fx: number; fz: number;
  y: number; hw: number; s: number; speed: number; turb: number; kind: number;
  /** couleur du corps de l'eau (linéaire) et sinus de la hauteur de l'horizon des berges (reflets occultés) */
  tint: [number, number, number, number];
}
interface Strip {
  samples: Sample[];
  /** décalage de la bande dans la texture d'écume (m) */
  u0: number;
  len: number;
  /** demi-largeur ajoutée sous les berges (m) */
  ext: number;
}

/** Décalages locaux de la surface (seuils du village, débordements doux des berges naturelles), par tronçon et abscisse. */
const stepTable: { i: number; s0: number; s1: number; fn: (s: number) => number }[] = [];
function localOffset(x: number, z: number) {
  if (!stepTable.length) return 0;
  const s = streamInfo(x, z);
  for (const e of stepTable) if (e.i === s.i) return e.fn(s.t);
  return 0;
}

/** Hauteur (sinus) de l'horizon des berges vu depuis l'eau : gorge encaissée, murs du village, berges basses au sud. */
const HORIZON: Record<number, number> = { 0: 0.55, 1: 0.5, 2: 0.4, 3: 0.14 };
const TINTS: Record<number, [number, number, number]> = {
  0: [0.055, 0.13, 0.105], // gorge : vert sombre (forêt, ombre des parois)
  1: [0.06, 0.14, 0.115],
  2: [0.08, 0.18, 0.15], // village : eau claire sur galets (#5a8a7a)
  3: [0.07, 0.165, 0.13],
};

/** Découpe le torrent en bandes continues (interrompues par les cascades) et les échantillonne. */
function buildStrips(): Strip[] {
  const runs: [number, number][] = [];
  let a = 0;
  for (let i = 0; i <= NSEG; i++) {
    const brk = i === NSEG || segKind(i) === 4 || isCascadeSeg(i);
    if (brk) {
      if (i > a) runs.push([a, i]);
      a = i + 1;
      if (segKind(i) === 4) break;
    }
  }
  const strips: Strip[] = [];
  let u0 = 0;
  const rng = new Rng(99);
  for (const [ia, ib] of runs) {
    // longueurs cumulées
    const cum = [0];
    for (let i = ia; i < ib; i++) cum.push(cum[cum.length - 1] + segLen(i));
    const L = cum[cum.length - 1];
    const afterCascade = ia > 0 && isCascadeSeg(ia - 1);
    const s0 = afterCascade ? -1.2 : 0;
    const at = (s: number) => {
      if (s <= 0) {
        const [x0, z0] = STREAM[ia], [x1, z1] = STREAM[ia + 1];
        const l = segLen(ia);
        return { x: x0 + ((x1 - x0) / l) * s, z: z0 + ((z1 - z0) / l) * s, y: STREAM_WATER_Y[ia], w: STREAM_WIDTHS[ia], i: ia, t: 0 };
      }
      let k = 0;
      while (k < cum.length - 2 && cum[k + 1] < s) k++;
      const i = ia + k;
      const t = clamp((s - cum[k]) / (cum[k + 1] - cum[k] || 1), 0, 1);
      const [x0, z0] = STREAM[i], [x1, z1] = STREAM[i + 1];
      return { x: lerp(x0, x1, t), z: lerp(z0, z1, t), y: lerp(STREAM_WATER_Y[i], STREAM_WATER_Y[i + 1], t), w: lerp(STREAM_WIDTHS[i], STREAM_WIDTHS[i + 1], t), i, t };
    };
    // abscisses : pas régulier + resserrement autour des seuils du village
    const walled: number[] = [];
    for (let k = 0; k < cum.length - 1; k++) if (segKind(ia + k) === 2) walled.push(k);
    let steps: number[] = [];
    let sA = 0, sB = 0, yA = 0, yB = 0;
    if (walled.length) {
      sA = cum[walled[0]]; sB = cum[walled[walled.length - 1] + 1];
      yA = at(sA + 1e-3).y; yB = at(sB - 1e-3).y;
      const n = Math.max(1, Math.round((yA - yB) / 0.18));
      steps = Array.from({ length: n }, (_, k) => sA + ((k + 0.5 + rng.range(-0.25, 0.25)) * (sB - sA)) / n);
    }
    const sList: number[] = [];
    for (let s = s0; s < L; s += 0.8) sList.push(s);
    sList.push(L);
    for (const sk of steps) sList.push(sk - 0.25, sk - 0.05, sk + 0.12, sk + 0.4);
    sList.sort((p, q) => p - q);
    const uniq = sList.filter((s, k) => k === 0 || s - sList[k - 1] > 0.04);
    // surface en paliers au village
    const stepY = (s: number, yLin: number) => {
      if (!steps.length || s <= sA || s >= sB) return yLin;
      // plateaux légèrement inclinés, chute franche à chaque seuil (sur 0,17 m)
      let lvl = 0;
      for (const sk of steps) lvl += smoothstep(sk, sk + 0.17, s);
      return lerp(yA - ((yA - yB) * lvl) / steps.length, yLin, 0.22);
    };
    const seed = rng.range(0, 100);
    const samples: Sample[] = uniq.map((s) => {
      const p = at(s);
      const pa = at(Math.max(s0, s - 1.4)), pb = at(Math.min(L, s + 1.4));
      let fx = pb.x - pa.x, fz = pb.z - pa.z;
      const fl = Math.hypot(fx, fz) || 1;
      fx /= fl; fz /= fl;
      const kind = segKind(p.i);
      let y = stepY(s, p.y);
      // berges naturelles : la surface monte parfois de quelques centimètres et noie le pied des berges
      if (kind === 0 || kind === 3) {
        const fade = smoothstep(0, 4, s - s0) * smoothstep(0, 4, L - s);
        y += Math.max(0, noise2(s / 19 + seed, 0.5)) * 0.16 * fade;
      }
      const slope = Math.max(0, (pa.y - pb.y) / Math.max(0.5, Math.min(L, s + 1.4) - Math.max(s0, s - 1.4)));
      let speed = clamp(0.32 + 4.2 * Math.sqrt(slope), 0.28, 3.2);
      let turb = smoothstep(0.015, 0.11, slope) * 0.75;
      if (afterCascade) {
        const w = STREAM_WIDTHS[ia];
        const k = Math.exp(-Math.max(0, s - s0) / (w * 0.6));
        turb = Math.max(turb, k * 1.1);
        speed = lerp(speed, 0.45, smoothstep(0, 1, k) * 0.5);
      }
      for (const sk of steps) if (s > sk - 0.1 && s < sk + 3) turb = Math.max(turb, 0.85 * Math.exp(-(s - sk) / 0.9));
      const n = noise2(s / 37 + seed * 3, 2.1) * 0.5 + 0.5;
      const base = TINTS[kind] ?? TINTS[3];
      const tint: [number, number, number, number] = [base[0] * lerp(0.85, 1.12, n), base[1] * lerp(0.9, 1.08, 1 - n), base[2] * lerp(0.85, 1.15, n), HORIZON[kind] ?? 0.15];
      return { x: p.x, z: p.z, nx: -fz, nz: fx, fx, fz, y, hw: p.w / 2, s: s - s0, speed, turb, kind, tint };
    });
    // abscisse de la table des seuils (pour waterAt)
    if (steps.length) {
      for (const k of walled) {
        const i = ia + k, c0 = cum[k], c1 = cum[k + 1];
        stepTable.push({ i, s0: c0, s1: c1, fn: (t) => stepY(lerp(c0, c1, t), at(lerp(c0, c1, t)).y) - at(lerp(c0, c1, t)).y });
      }
      for (const sk of steps) {
        const p = at(sk);
        WATER_FX.weirs.push({ pos: new THREE.Vector3(p.x, stepY(sk + 0.3, p.y), p.z), width: p.w });
      }
    }
    strips.push({ samples, u0, len: L - s0, ext: 1.0 });
    u0 += L - s0 + 3;
  }
  return strips;
}

/** Bief du moulin : canal creusé à côté du torrent, sous la roue (eau du torrent). */
function biefStrip(u0: number): Strip {
  const y = 5.5;
  const samples: Sample[] = [];
  for (let z = -77; z <= -64.6; z += 0.8)
    samples.push({ x: 57.4, z, nx: -1, nz: 0, fx: 0, fz: 1, y, hw: 1.6, s: z + 77, speed: 0.55, turb: 0.08, kind: 2, tint: [...TINTS[2], 0.55] as [number, number, number, number] });
  return { samples, u0, len: samples[samples.length - 1].s, ext: 0.4 };
}

// =============================================================================================== TORRENT : ÉCUME CUITE
interface Rock { x: number; z: number; r: number; top: number }

/** Rochers posés dans et autour du lit (InstancedMesh « decor:rock… » du village), lus après sa construction. */
function collectRocks(root: THREE.Object3D): Rock[] {
  const out: Rock[] = [];
  const m = new THREE.Matrix4(), box = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const im = o as THREE.InstancedMesh;
    if (!im.isInstancedMesh || !/^(rock|boulder)/.test(im.name) || !/_lod0$/.test(im.name)) return;
    const g = im.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    for (let k = 0; k < im.count; k++) {
      im.getMatrixAt(k, m);
      m.premultiply(im.matrixWorld);
      box.copy(g.boundingBox!).applyMatrix4(m);
      const x = (box.min.x + box.max.x) / 2, z = (box.min.z + box.max.z) / 2;
      const s = streamInfo(x, z);
      if (s.kind === 4 || s.d > s.width / 2 + 3) continue;
      out.push({ x, z, r: Math.min(box.max.x - box.min.x, box.max.z - box.min.z) * 0.42, top: box.max.y });
    }
  });
  return out;
}

const BAKE_DS = 0.2; // m par texel le long du courant
const BAKE_NV = 32; // texels en travers

/**
 * Cuisson de la texture du torrent (u le long des bandes, v en travers) :
 * R écume (sillage des rochers et des émergences), G profondeur / 2 m, B turbulence (pente, seuils, pieds de cascade).
 */
function bakeStream(strips: Strip[], rocks: Rock[]) {
  const total = strips[strips.length - 1].u0 + strips[strips.length - 1].len + 1;
  const NU = Math.min(4096, Math.ceil(total / BAKE_DS));
  const ds = total / NU;
  const NV = BAKE_NV;
  const obst = new Float32Array(NU * NV), depth = new Float32Array(NU * NV), turb = new Float32Array(NU * NV);
  // grille des rochers
  const RC = 4, rg = new Map<number, Rock[]>();
  const rk = (i: number, j: number) => (i + 500) * 1000 + j + 500;
  for (const r of rocks) {
    const i = Math.floor(r.x / RC), j = Math.floor(r.z / RC);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const k = rk(i + a, j + b);
      if (!rg.has(k)) rg.set(k, []);
      rg.get(k)!.push(r);
    }
  }
  for (const st of strips) {
    const S = st.samples;
    let j = 0;
    const i0 = Math.max(0, Math.floor(st.u0 / ds)), i1 = Math.min(NU - 1, Math.ceil((st.u0 + st.len) / ds));
    for (let i = i0; i <= i1; i++) {
      const s = (i + 0.5) * ds - st.u0;
      if (s < 0 || s > st.len) continue;
      while (j < S.length - 2 && S[j + 1].s < s) j++;
      const A = S[j], B = S[j + 1];
      const t = clamp((s - A.s) / (B.s - A.s || 1), 0, 1);
      const cx = lerp(A.x, B.x, t), cz = lerp(A.z, B.z, t), nx = lerp(A.nx, B.nx, t), nz = lerp(A.nz, B.nz, t);
      const y = lerp(A.y, B.y, t), half = lerp(A.hw, B.hw, t) + st.ext, tb = lerp(A.turb, B.turb, t);
      for (let m = 0; m < NV; m++) {
        const v = ((m + 0.5) / NV) * 2 - 1;
        const x = cx + nx * v * half, z = cz + nz * v * half;
        const k = i * NV + m;
        let d = y - heightAt(x, z);
        let o = 0;
        const list = rg.get(rk(Math.floor(x / RC), Math.floor(z / RC)));
        if (list) for (const r of list) {
          if (r.top < y - 0.12) continue;
          const dd = Math.hypot(x - r.x, z - r.z);
          if (dd < r.r) { o = 1; d = Math.min(d, 0); }
          else o = Math.max(o, smoothstep(r.r + 0.45, r.r, dd) * 0.8);
        }
        // émergences (galets, bord de berge) : faible écume dans les rapides
        if (d < 0.07 && d > -0.3) o = Math.max(o, 0.35 * smoothstep(0.0, 0.5, tb) + 0.12);
        obst[k] = o;
        depth[k] = d;
        // un peu plus de turbulence au milieu du courant, moins le long des berges
        turb[k] = tb * (1 - 0.45 * v * v);
      }
    }
  }
  // sillage : l'écume s'étire vers l'aval (u croissant) en s'élargissant un peu
  const data = new Uint8Array(NU * NV * 4);
  const K = Math.round(3.2 / ds);
  for (let i = 0; i < NU; i++)
    for (let m = 0; m < NV; m++) {
      let f = obst[i * NV + m];
      for (let k = 1; k <= K && i - k >= 0; k++) {
        const spread = Math.floor(k / 7);
        const w = Math.pow(1 - k / (K + 1), 1.4);
        for (let q = -spread; q <= spread; q++) {
          const mm = m + q;
          if (mm < 0 || mm >= NV) continue;
          f = Math.max(f, obst[(i - k) * NV + mm] * w * (q === 0 ? 1 : 0.7));
        }
      }
      const k = (i * NV + m) * 4;
      data[k] = Math.round(clamp(f, 0, 1) * 255);
      data[k + 1] = Math.round(clamp(depth[i * NV + m] / 2, 0, 1) * 255);
      data[k + 2] = Math.round(clamp(turb[i * NV + m], 0, 1) * 255);
      data[k + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, NV, NU, THREE.RGBAFormat);
  // la texture est stockée « debout » (NV de large, NU de haut) : v en x, u en y
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return { tex, total: NU * ds };
}

// =============================================================================================== TORRENT : MAILLAGE ET MATIÈRE
function stripGeometry(strips: Strip[], total: number) {
  const NC = 10; // colonnes en travers
  const pos: number[] = [], uv: number[] = [], flow: number[] = [], tint: number[] = [], idx: number[] = [];
  for (const st of strips) {
    const base = pos.length / 3;
    for (const p of st.samples) {
      const half = p.hw + st.ext;
      for (let c = 0; c <= NC; c++) {
        const v = (c / NC) * 2 - 1;
        pos.push(p.x + p.nx * v * half, p.y, p.z + p.nz * v * half);
        uv.push(c / NC, (st.u0 + p.s) / total); // x : travers (texels de la cuisson), y : le long des bandes
        // plus rapide au milieu du lit
        flow.push(p.fx, p.fz, p.speed * (1 - 0.55 * v * v));
        tint.push(...p.tint);
      }
    }
    for (let r = 0; r < st.samples.length - 1; r++)
      for (let c = 0; c < NC; c++) {
        const a = base + r * (NC + 1) + c, b = a + NC + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aUv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 3));
  g.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 4));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Uniformes partagées par toutes les eaux de ce module (temps, nuit, texture de détail). */
export const riverUniforms = {
  uTime: { value: 0 },
  uNight: { value: 0 },
  uDet: { value: null as THREE.Texture | null },
};

function streamMaterial(bake: THREE.Texture) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0, transparent: true, envMapIntensity: 1.0 });
  const U = { ...riverUniforms, uBake: { value: bake }, uDeepMul: { value: new THREE.Vector3(0.22, 0.42, 0.55) }, uBank: { value: new THREE.Vector3(0.1, 0.12, 0.08) } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aUv; attribute vec3 aFlow; attribute vec4 aTint;
        uniform sampler2D uBake; uniform float uTime;
        varying vec3 vWPos; varying vec2 vUvW; varying vec3 vFlow; varying vec4 vTint;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          // petites vagues stationnaires dans les rapides et sous les seuils
          float tb = texture2D(uBake, aUv).b;
          float al = dot(position.xz, aFlow.xy);
          transformed.y += tb * 0.07 * (0.6 * sin(al * 2.1 + sin(position.x * 0.6 + position.z * 0.4) * 2.5)
                         + 0.4 * sin(al * 3.7 - uTime * 1.7 + position.z * 1.3));
        }`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vUvW = aUv; vFlow = aFlow; vTint = aTint;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        ${WATER_GLSL}
        uniform sampler2D uBake; uniform vec3 uDeepMul; uniform float uNight;
        varying vec3 vWPos; varying vec2 vUvW; varying vec3 vFlow; varying vec4 vTint;
        uniform vec3 uBank;
        vec3 gWN; vec3 gV; float gFoam; float gTurb;`)
      .replace('#include <map_fragment>', `
        {
          vec4 bk = texture2D(uBake, vUvW);
          float depth = bk.g * 2.0, foamO = bk.r, turb = bk.b;
          vec2 fd = normalize(vFlow.xy + vec2(1e-5));
          float spd = vFlow.z;
          vec2 q = wRot(vWPos.xz, fd);
          q.x *= 0.5; // motif étiré dans le sens du courant
          vec4 A = wFlow(q, spd * 0.5, 1.7, 0.3, 0.0);
          vec4 B = wFlow(q * vec2(1.0, 0.8), spd * 0.62, 1.1, 0.85, 0.37);
          vec2 nq = (A.rg * 2.0 - 1.0) * 0.55 + (B.rg * 2.0 - 1.0) * 0.45;
          nq *= 0.11 + turb * 0.7 + min(spd, 2.5) * 0.06 + foamO * 0.25;
          vec2 nW = fd * nq.x + vec2(-fd.y, fd.x) * nq.y;
          float dist = length(vWPos - cameraPosition);
          nW *= 1.0 / (1.0 + dist * 0.012);
          vec3 wn = normalize(vec3(-nW.x, 1.0, -nW.y));
          // écume : sillages + turbulence, découpée par le motif de bulles qui court avec l'eau
          float pat = A.b * 0.55 + B.b * 0.6;
          float amt = foamO * 1.05 + turb * 0.8;
          float foam = smoothstep(0.32, 0.85, amt * (0.35 + pat) - 0.18 * B.a);
          foam *= smoothstep(-0.02, 0.04, depth + foamO * 0.05);
          // couleur et opacité selon la profondeur (galets visibles en eau peu profonde)
          float k = 1.0 - exp(-depth * 1.15);
          vec3 col = mix(vTint.rgb, vTint.rgb * uDeepMul, k);
          float ca = smoothstep(0.42, 0.85, A.a * 0.6 + B.a * 0.6 - 0.1);
          col += vTint.rgb * 1.6 * ca * (1.0 - k) * (1.0 - uNight) * (1.0 - foam);
          vec3 V = normalize(cameraPosition - vWPos);
          float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(wn, V), 0.0, 1.0), 5.0);
          float alpha = 0.08 + 0.66 * k;
          alpha = mix(alpha, 1.0, fres * 0.8);
          alpha *= smoothstep(0.0, 0.08, depth);
          col = mix(col, vec3(0.86, 0.9, 0.9), foam);
          alpha = mix(alpha, 0.96, foam);
          diffuseColor.rgb = col;
          diffuseColor.a = alpha;
          gWN = wn; gV = V; gFoam = foam; gTurb = turb;
        }`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.04 + gTurb * 0.1, 0.8, gFoam);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(gWN, 0.0)).xyz);`)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
        {
          // les berges et les murs cachent le ciel aux reflets rasants : on y voit leur reflet sombre
          vec3 Rw = reflect(-gV, gWN);
          float occ = smoothstep(vTint.w - 0.1, vTint.w + 0.18, Rw.y);
          radiance *= mix(uBank, vec3(1.0), occ);
        }`);
  };
  mat.customProgramCacheKey = () => 'eau-torrent-v2';
  return mat;
}

// =============================================================================================== CASCADES
interface CascadeGeo { pos: number[]; uv: number[]; aux: number[]; idx: number[] }
const G = 9.81;

function cascadeGeometry() {
  const sheet: CascadeGeo = { pos: [], uv: [], aux: [], idx: [] };
  const foam: CascadeGeo = { pos: [], uv: [], aux: [], idx: [] };
  const mist: { p: THREE.Vector3; size: number }[] = [];
  const rng = new Rng(31);
  for (const c of CASCADES) {
    const k = STREAM.findIndex(([px, pz]) => Math.hypot(px - c.x, pz - c.z) < 2.5);
    if (k < 0 || k >= NSEG) continue;
    const [lx, lz] = STREAM[k], [bx, bz] = STREAM[k + 1];
    const l = Math.hypot(bx - lx, bz - lz) || 1;
    const fx = (bx - lx) / l, fz = (bz - lz) / l, nx = -fz, nz = fx;
    const H = c.top - c.bottom;
    const v0 = 1.1 + 0.25 * Math.min(H, 4);
    const T = Math.sqrt((2 * (H + 0.25)) / G);
    const W = c.width * 0.92;
    // nappes : une principale et une seconde, plus étroite, en retrait (épaisseur, filets qui se croisent).
    // Quelques rangs avant la lèvre (eau lisse qui s'incurve), puis la parabole de chute.
    for (const [wsc, back, seed, vsc] of [[1, 0, rng.range(0, 1), 1], [0.7, -0.22, rng.range(0, 1), 0.8]]) {
      const NR = 22, NC = 14, base = sheet.pos.length / 3;
      const lengths: number[] = [];
      let prev: THREE.Vector3 | null = null, acc = 0;
      for (let r = 0; r <= NR; r++) {
        const u = r / NR;
        const t = lerp(-0.35, T, Math.pow(u, 1.15));
        const tt = Math.max(0, t);
        for (let cc = 0; cc <= NC; cc++) {
          const a = (cc / NC) * 2 - 1;
          const spread = 1 + 0.14 * (tt / T);
          const ox = a * W * 0.5 * wsc * spread + noise2(a * 3 + c.x + seed * 9, tt * 2) * 0.16 * (tt / T);
          // le bord de la nappe tombe un peu plus vite (moins d'eau sur les côtés)
          const v = v0 * vsc * (1 - 0.3 * a * a);
          const h = v * t + back;
          const y = t <= 0 ? c.top - 0.01 : c.top - 0.5 * G * t * t + 0.01;
          sheet.pos.push(lx + fx * h + nx * ox, y, lz + fz * h + nz * ox);
          sheet.uv.push(cc / NC, u);
          sheet.aux.push(0, W * wsc, v0 + G * tt * 0.5, seed);
        }
        const cp = new THREE.Vector3(v0 * t, t <= 0 ? 0 : -0.5 * G * t * t, 0);
        if (prev) acc += cp.distanceTo(prev);
        lengths.push(acc);
        prev = cp;
      }
      for (let r = 0; r <= NR; r++) for (let cc = 0; cc <= NC; cc++) sheet.aux[(base + r * (NC + 1) + cc) * 4] = lengths[NR] || 1;
      for (let r = 0; r < NR; r++)
        for (let cc = 0; cc < NC; cc++) {
          const a = base + r * (NC + 1) + cc, b = a + NC + 1;
          sheet.idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
    }
    // écume bouillonnante au pied (disque allongé dans le courant)
    const land = v0 * T;
    const cx = lx + fx * land * 0.9, cz = lz + fz * land * 0.9, cy = c.bottom + 0.035;
    const R = c.width * (0.75 + 0.08 * H), fb = foam.pos.length / 3, NS = 28, NRr = 5;
    foam.pos.push(cx, cy, cz); foam.uv.push(0, 0); foam.aux.push(R, 1, 0, 0);
    for (let rr = 1; rr <= NRr; rr++)
      for (let s = 0; s < NS; s++) {
        const th = (s / NS) * Math.PI * 2, rf = rr / NRr;
        const ex = Math.cos(th), ez = Math.sin(th);
        // ellipse : plus longue vers l'aval
        const along = ez * R * rf * (ez > 0 ? 1.5 : 0.7), side = ex * R * rf;
        foam.pos.push(cx + fx * along + nx * side, cy, cz + fz * along + nz * side);
        foam.uv.push(ex * rf, ez * rf);
        foam.aux.push(R, 1, 0, 0);
      }
    for (let s = 0; s < NS; s++) foam.idx.push(fb, fb + 1 + ((s + 1) % NS), fb + 1 + s);
    for (let rr = 1; rr < NRr; rr++)
      for (let s = 0; s < NS; s++) {
        const a = fb + 1 + (rr - 1) * NS + s, b = fb + 1 + (rr - 1) * NS + ((s + 1) % NS);
        const a2 = a + NS, b2 = b + NS;
        foam.idx.push(a, b, b2, a, b2, a2);
      }
    // brume : bouffées au pied, plus nombreuses pour les hautes chutes
    const nm = Math.round(4 + H * 1.6);
    for (let m = 0; m < nm; m++)
      mist.push({ p: new THREE.Vector3(cx + nx * rng.range(-0.5, 0.5) * W + fx * rng.range(-0.5, 2), c.bottom + rng.range(0.2, 0.9), cz + nz * rng.range(-0.5, 0.5) * W + fz * rng.range(-0.5, 2)), size: rng.range(1.2, 2.2) * (0.7 + 0.12 * H) });
    WATER_FX.cascades.push({ id: c.id, pos: new THREE.Vector3(cx, c.bottom, cz), width: c.width, height: H, dir: new THREE.Vector2(fx, fz) });
  }
  const toGeo = (d: CascadeGeo) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
    g.setAttribute('aUv', new THREE.Float32BufferAttribute(d.uv, 2));
    g.setAttribute('aCas', new THREE.Float32BufferAttribute(d.aux, 4));
    g.setIndex(d.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  };
  return { sheet: toGeo(sheet), foam: toGeo(foam), mist };
}

function sheetMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, riverUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aUv; attribute vec4 aCas; varying vec2 vUvC; varying vec4 vCas;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvUvC = aUv; vCas = aCas;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        ${WATER_GLSL}
        varying vec2 vUvC; varying vec4 vCas; vec2 gPert; float gWhite;`)
      .replace('#include <map_fragment>', `
        {
          float L = vCas.x, W = vCas.y, spd = vCas.z, sd = vCas.w;
          float yy = vUvC.y * L;
          vec4 s1 = texture2D(uDet, vec2(vUvC.x * W * 0.16 + sd, yy * 0.045 - uTime * spd * 0.045));
          vec4 s2 = texture2D(uDet, vec2(vUvC.x * W * 0.41 + 0.3 + sd, yy * 0.1 - uTime * spd * 0.1));
          // débit variable en travers : filets épais, rideaux minces, quelques trous
          float cols = texture2D(uDet, vec2(vUvC.x * W * 0.05 + sd * 1.7, 0.31)).a;
          float streak = s1.a * 0.55 + s2.a * 0.45;
          float ragged = 0.08 * (s2.a - 0.5);
          float edge = smoothstep(0.0, 0.16 + ragged, vUvC.x) * smoothstep(1.0, 0.84 - ragged, vUvC.x);
          float dens = smoothstep(0.3, 0.75, streak * (0.55 + 0.9 * cols) + 0.1 * sin(vUvC.x * 21.0 + s1.b * 4.0));
          float white = smoothstep(0.04, 0.35, vUvC.y);
          float a = mix(0.45, 0.06 + 0.9 * dens, white) * edge * smoothstep(0.0, 0.03, vUvC.y + 0.01);
          a *= mix(1.0, 0.8 + 0.2 * s2.b, white);
          vec3 col = mix(vec3(0.07, 0.16, 0.13), vec3(0.88, 0.92, 0.93), white * (0.45 + 0.55 * dens));
          diffuseColor.rgb = col;
          diffuseColor.a = a;
          gPert = (s1.rg * 2.0 - 1.0) * 0.6;
          gWhite = white;
        }`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.08, 0.7, gWhite);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(normal + (viewMatrix * vec4(gPert.x, gPert.y * 0.3, gPert.y, 0.0)).xyz * 0.5);`);
  };
  mat.customProgramCacheKey = () => 'eau-cascade-v1';
  return mat;
}

function foamMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, riverUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aUv; attribute vec4 aCas; varying vec2 vUvC; varying vec3 vWPosF;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vUvC = aUv;
        // bouillonnement : la surface se soulève par bouffées
        float rr = length(aUv);
        transformed.y += (1.0 - rr) * 0.06 * (0.5 + 0.5 * sin(uTime * 4.0 + position.x * 2.3 + position.z * 1.7));`)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPosF = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      .replace('#include <common>', '#include <common>\nuniform float uTime;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        ${WATER_GLSL}
        varying vec2 vUvC; varying vec3 vWPosF; vec2 gPertF;`)
      .replace('#include <map_fragment>', `
        {
          float r = length(vUvC);
          vec2 dir = vUvC / max(r, 1e-3);
          vec4 f1 = texture2D(uDet, vWPosF.xz * 0.32 - dir * uTime * 0.22);
          vec4 f2 = texture2D(uDet, vWPosF.xz * 0.75 + vec2(uTime * 0.05, -uTime * 0.04));
          float boil = 0.5 + 0.5 * sin(uTime * 3.1 + f2.a * 14.0);
          float body = 1.0 - smoothstep(0.15, 1.0, r);
          float foam = smoothstep(0.22, 0.7, (f1.b * 0.65 + f2.b * 0.5 + boil * 0.25) * body * 1.5 + body * 0.25);
          diffuseColor.rgb = vec3(0.88, 0.92, 0.92);
          diffuseColor.a = foam * 0.95 * smoothstep(1.0, 0.75, r);
          gPertF = (f1.rg * 2.0 - 1.0);
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(normal + (viewMatrix * vec4(gPertF.x, 0.0, gPertF.y, 0.0)).xyz * 0.6);`);
  };
  mat.customProgramCacheKey = () => 'eau-ecume-v1';
  return mat;
}

/** Brume au pied des cascades : bouffées tournées vers la caméra, éclairées par le ciel (1 appel de dessin). */
function mistMesh(spots: { p: THREE.Vector3; size: number }[]) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute('position', quad.getAttribute('position'));
  const a = new Float32Array(spots.length * 4), ph = new Float32Array(spots.length * 2);
  const rng = new Rng(5);
  spots.forEach((s, i) => {
    a.set([s.p.x, s.p.y, s.p.z, s.size], i * 4);
    ph.set([rng.next(), rng.next()], i * 2);
  });
  g.setAttribute('aMist', new THREE.InstancedBufferAttribute(a, 4));
  g.setAttribute('aPh', new THREE.InstancedBufferAttribute(ph, 2));
  g.instanceCount = spots.length;
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...riverUniforms, uCol: { value: new THREE.Color(0.8, 0.85, 0.9) } },
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute vec4 aMist; attribute vec2 aPh;
      uniform float uTime;
      varying vec2 vUv; varying float vA; varying vec2 vSeed;
      void main() {
        float life = fract(uTime * 0.085 * (0.7 + aPh.y) + aPh.x);
        vec3 c = aMist.xyz + vec3(sin(aPh.x * 20.0 + uTime * 0.2), 0.0, cos(aPh.x * 13.0 + uTime * 0.17)) * 0.7 * life;
        c.y += life * aMist.w * 0.7;
        float size = aMist.w * (0.7 + life * 1.1);
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 wp = c + (right * position.x + up * position.y) * size;
        vA = smoothstep(0.0, 0.25, life) * (1.0 - smoothstep(0.5, 1.0, life));
        vUv = position.xy;
        vSeed = aPh + life * 0.3;
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform sampler2D uDet; uniform vec3 uCol;
      varying vec2 vUv; varying float vA; varying vec2 vSeed;
      void main() {
        float r2 = dot(vUv, vUv) * 4.0;
        float n = texture2D(uDet, vUv * 0.35 + vSeed).a;
        float a = exp(-r2 * 2.2) * (0.55 + 0.7 * n) * vA * 0.3;
        gl_FragColor = vec4(uCol, a);
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.name = 'eau-brume-cascades';
  m.renderOrder = 3;
  return { mesh: m, mat };
}

// =============================================================================================== SEUILS DE PIERRE
function rockGeometry(seed: number) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + 0.22 * noise2(x * 1.7 + seed, z * 1.7 + y) + 0.1 * noise2(x * 4 + y * 3, z * 4 - seed);
    p.setXYZ(i, x * n, y * n * (y > 0 ? 0.85 : 1), z * n);
  }
  g.computeVertexNormals();
  return g;
}

function weirStones(group: THREE.Group) {
  const rng = new Rng(808);
  const mats: THREE.Matrix4[] = [];
  for (const w of WATER_FX.weirs) {
    const s = streamInfo(w.pos.x, w.pos.z);
    const k = s.i;
    const [ax, az] = STREAM[k], [bx, bz] = STREAM[k + 1];
    const l = Math.hypot(bx - ax, bz - az);
    const fx = (bx - ax) / l, fz = (bz - az) / l;
    const n = Math.round(w.width / 0.5);
    for (let i = 0; i < n; i++) {
      if (rng.chance(0.12)) continue; // brèche : l'eau passe plus fort
      const off = (i / (n - 1) - 0.5) * (w.width - 0.3) + rng.range(-0.1, 0.1);
      const back = -0.3 + rng.range(-0.12, 0.12);
      const x = w.pos.x - fz * off + fx * back, z = w.pos.z + fx * off + fz * back;
      const sx = rng.range(0.26, 0.42), sy = rng.range(0.45, 0.6), sz = rng.range(0.22, 0.34);
      // crête juste sous la surface amont ; quelques pierres émergent
      const top = w.pos.y + (rng.chance(0.25) ? rng.range(0.16, 0.24) : rng.range(0.02, 0.12));
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x, top - sy * 0.85, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.15, 0.15), Math.atan2(fx, fz) + rng.range(-0.4, 0.4), rng.range(-0.15, 0.15))),
        new THREE.Vector3(sx, sy, sz),
      );
      mats.push(m);
    }
  }
  if (!mats.length) return;
  const mat = typeof document === 'undefined' ? new THREE.MeshStandardMaterial() : pbr('rock', { scale: 1.2, color: 0x8a8578, roughness: 0.85 });
  const im = new THREE.InstancedMesh(rockGeometry(3.7), mat, mats.length);
  mats.forEach((m, i) => {
    im.setMatrixAt(i, m);
    const c = new THREE.Color().setHSL(0.1 + rng.range(-0.03, 0.03), 0.08, rng.range(0.38, 0.52));
    im.setColorAt(i, c);
  });
  im.name = 'eau-seuils';
  im.receiveShadow = true;
  im.castShadow = false;
  im.computeBoundingSphere();
  group.add(im);
}

// =============================================================================================== CONSTRUCTION
export interface Rivers {
  group: THREE.Group;
  update: (t: number, dt: number) => void;
  stats: Record<string, number>;
}

/**
 * Construit l'eau locale de la vallée. `village` : groupe du village déjà construit (on y lit les rochers du lit
 * pour cuire l'écume ; facultatif).
 */
export function buildRivers(village?: THREE.Object3D): Rivers {
  riverUniforms.uDet.value = waterDetailTexture();
  const group = new THREE.Group();
  group.name = 'eau-locale';
  const t0 = performance.now();
  // --- torrent
  const strips = buildStrips();
  const last = strips[strips.length - 1];
  strips.push(biefStrip(last.u0 + last.len + 3));
  const rocks = village ? collectRocks(village) : [];
  const { tex, total } = bakeStream(strips, rocks);
  const stream = new THREE.Mesh(stripGeometry(strips, total), streamMaterial(tex));
  stream.name = 'eau-torrent';
  stream.receiveShadow = true;
  stream.renderOrder = 1;
  group.add(stream);
  // --- cascades
  const cg = cascadeGeometry();
  const sheet = new THREE.Mesh(cg.sheet, sheetMaterial());
  sheet.name = 'eau-cascades';
  sheet.renderOrder = 2;
  sheet.receiveShadow = true;
  const foam = new THREE.Mesh(cg.foam, foamMaterial());
  foam.name = 'eau-ecume';
  foam.renderOrder = 2;
  foam.receiveShadow = true;
  const mist = mistMesh(cg.mist);
  group.add(sheet, foam, mist.mesh);
  weirStones(group);
  // --- yubatake, rizières, brume rasante des eaux chaudes (le rotenburo et l'ashiyu s'y ajoutent via bathWater / replaceModelWater)
  buildYubatake(group);
  buildRice(group);
  const stats = { rocks: rocks.length, triangles: (stream.geometry.index!.count + cg.sheet.index!.count + cg.foam.index!.count) / 3, ms: Math.round(performance.now() - t0) };

  let steam: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial } | null = null;
  const update = (t: number) => {
    riverUniforms.uTime.value = t;
    // la brume rasante se construit au premier passage (les bains du village se sont ajoutés entre-temps)
    if (!steam && steamParts.length) {
      steam = steamMesh();
      if (steam) group.add(steam.mesh);
    }
    if (steam) {
      const sc = steam.mat.uniforms.uCol.value as THREE.Color;
      sc.copy(ATMO.ambientSky).multiplyScalar(1.1).add(ATMO.sunColor.clone().multiplyScalar(ATMO.sunIntensity * 0.15 * (1 - ATMO.night)));
    }
    riverUniforms.uNight.value = ATMO.night;
    // brume : lumière du ciel + une part du soleil
    const c = mist.mat.uniforms.uCol.value as THREE.Color;
    c.copy(ATMO.ambientSky).multiplyScalar(0.9).add(ATMO.sunColor.clone().multiplyScalar(ATMO.sunIntensity * 0.12 * (1 - ATMO.night)));
  };
  return { group, update, stats };
}

// =============================================================================================== EAUX CALMES
export type CalmKind = 'bain' | 'source' | 'bassin' | 'riziere';
const CALM: Record<CalmKind, { color: [number, number, number]; alpha: number; rough: number; ripple: number; milky: number }> = {
  // eau de source laiteuse (#9adcd4) : diffusion forte, peu de transparence
  bain: { color: [0.3, 0.66, 0.6], alpha: 0.93, rough: 0.07, ripple: 0.05, milky: 1 },
  // yubatake : turquoise plus saturé, eau qui court dans les canaux
  source: { color: [0.12, 0.55, 0.5], alpha: 0.9, rough: 0.05, ripple: 0.08, milky: 0.8 },
  // bassin d'ablutions : eau claire et froide
  bassin: { color: [0.03, 0.08, 0.07], alpha: 0.55, rough: 0.03, ripple: 0.04, milky: 0 },
  // rizière : eau boueuse, miroir du ciel
  riziere: { color: [0.035, 0.045, 0.03], alpha: 0.86, rough: 0.02, ripple: 0.025, milky: 0 },
};
const calmMats = new Map<CalmKind, THREE.MeshStandardMaterial>();

/** Matière d'eau calme partagée (bains, canaux, rizières) : rides fines (et courant si aFlow), reflets du ciel. */
export function calmWaterMaterial(kind: CalmKind) {
  const got = calmMats.get(kind);
  if (got) return got;
  riverUniforms.uDet.value = waterDetailTexture();
  const P = CALM[kind];
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: P.rough, metalness: 0, transparent: true, envMapIntensity: 1 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, riverUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aFlow; varying vec3 vWPosC; varying vec3 vFlowC;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPosC = (modelMatrix * vec4(transformed, 1.0)).xyz; vFlowC = aFlow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        ${WATER_GLSL}
        uniform float uNight;
        varying vec3 vWPosC; varying vec3 vFlowC; vec3 gWNc;`)
      .replace('#include <map_fragment>', `
        {
          vec2 fd = length(vFlowC.xy) > 0.01 ? normalize(vFlowC.xy) : vec2(1.0, 0.0);
          vec2 q = wRot(vWPosC.xz, fd);
          vec4 A = wFlow(q * vec2(0.6, 1.0), vFlowC.z, 1.6, 0.9, 0.11);
          vec4 B = texture2D(uDet, vWPosC.xz * 0.23 + vec2(uTime * 0.01, -uTime * 0.013));
          vec2 nq = (A.rg * 2.0 - 1.0) * (0.6 + vFlowC.z) + (B.rg * 2.0 - 1.0) * 0.5;
          nq *= ${P.ripple.toFixed(3)} * (1.0 + vFlowC.z * 2.0);
          vec2 nW = fd * nq.x + vec2(-fd.y, fd.x) * nq.y;
          gWNc = normalize(vec3(-nW.x, 1.0, -nW.y));
          vec3 col = vec3(${P.color.map((c) => c.toFixed(3)).join(', ')});
          // eau laiteuse : nuages de minéraux en suspension qui dérivent lentement
          col *= 1.0 + ${P.milky.toFixed(2)} * (0.22 * (B.a - 0.5) + 0.12 * (A.a - 0.5));
          vec3 V = normalize(cameraPosition - vWPosC);
          float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(gWNc, V), 0.0, 1.0), 5.0);
          diffuseColor.rgb = col;
          diffuseColor.a = mix(${P.alpha.toFixed(2)}, 1.0, fres * 0.7);
        }`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(gWNc, 0.0)).xyz);');
  };
  mat.customProgramCacheKey = () => 'eau-calme-' + kind;
  calmMats.set(kind, mat);
  return mat;
}

/** Ajoute un attribut aFlow (direction x, z et vitesse) constant à une géométrie. */
function withFlow(g: THREE.BufferGeometry, fx = 0, fz = 0, speed = 0) {
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([fx, fz, speed], i * 3);
  g.setAttribute('aFlow', new THREE.BufferAttribute(a, 3));
  return g;
}

/** Brume rasante au-dessus des eaux chaudes (nappes superposées, bruit animé ; 1 appel de dessin). */
const steamParts: THREE.BufferGeometry[] = [];
function addSteamSheet(g: THREE.BufferGeometry, y: number, strength: number) {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let k = 0; k < 3; k++) {
    const c = g.clone();
    const cp = c.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < cp.count; i++) cp.setY(i, y + 0.12 + k * 0.28);
    const a = new Float32Array(cp.count * 2);
    for (let i = 0; i < cp.count; i++) a.set([k / 2, strength], i * 2);
    c.setAttribute('aSteam', new THREE.BufferAttribute(a, 2));
    c.deleteAttribute('normal');
    c.deleteAttribute('aFlow');
    if (c.getAttribute('uv')) c.deleteAttribute('uv');
    steamParts.push(c.index ? c.toNonIndexed() : c);
  }
  void p;
}
function steamMesh() {
  if (!steamParts.length) return null;
  const g = mergeGeometries(steamParts, false);
  if (!g) return null;
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...riverUniforms, uCol: { value: new THREE.Color(0.9, 0.9, 0.9) } },
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute vec2 aSteam; varying vec2 vSteam; varying vec3 vW;
      void main() {
        vSteam = aSteam;
        vW = (modelMatrix * vec4(position, 1.0)).xyz;
        vec4 mvPosition = viewMatrix * vec4(vW, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform sampler2D uDet; uniform float uTime; uniform vec3 uCol;
      varying vec2 vSteam; varying vec3 vW;
      void main() {
        float lvl = vSteam.x;
        vec2 p = vW.xz * (0.11 - lvl * 0.03) + vec2(uTime * 0.018, uTime * 0.011) * (1.0 + lvl);
        float n = texture2D(uDet, p).a * 0.6 + texture2D(uDet, p * 2.3 - uTime * 0.02).a * 0.4;
        float a = smoothstep(0.42, 0.85, n) * vSteam.y * (1.0 - lvl * 0.55) * 0.32;
        gl_FragColor = vec4(uCol, a);
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.name = 'eau-brume-bains';
  m.renderOrder = 3;
  return { mesh: m, mat };
}

/** Eau laiteuse du rotenburo (remplace le disque provisoire du village). */
export function bathWater() {
  const P = HOT_SPRING_POOL;
  const g = withFlow(new THREE.CircleGeometry(P.r + 0.35, 72).rotateX(-Math.PI / 2).translate(P.x, P.waterY, P.z), 0.3, 1, 0.04);
  const m = new THREE.Mesh(g, calmWaterMaterial('bain'));
  m.name = 'eau-rotenburo';
  m.renderOrder = 1;
  m.receiveShadow = true;
  addSteamSheet(new THREE.CircleGeometry(P.r - 0.6, 40).rotateX(-Math.PI / 2).translate(P.x, 0, P.z), P.waterY, 1);
  return m;
}

/**
 * Remplace l'eau des modèles Blender (matière « water » : ashiyu, temizuya) par l'eau du module :
 * laiteuse et fumante pour le bain de pieds, claire pour le bassin d'ablutions.
 * `anchors` : accroches monde du village (villageInfo.anchors) ; `sizes` : w et d des accroches « anchor_water ».
 */
export function replaceModelWater(root: THREE.Object3D, anchors: { owner: string; name: string; pos: THREE.Vector3; yaw: number; w?: number }[], sizes: (owner: string) => { w: number; d: number } | null) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mt of Array.isArray(m.material) ? m.material : [m.material]) if (mt && mt.name === 'water') mt.visible = false;
  });
  const out = new THREE.Group();
  out.name = 'eau-bassins-modeles';
  for (const a of anchors) {
    if (!a.name.startsWith('anchor_water')) continue;
    const sz = sizes(a.owner) ?? { w: a.w ?? 1, d: 1 };
    const hot = a.owner.startsWith('ashiyu');
    const g = withFlow(new THREE.PlaneGeometry(sz.w + 0.5, sz.d + 0.5).rotateX(-Math.PI / 2).rotateY(a.yaw).translate(a.pos.x, a.pos.y + 0.006, a.pos.z), 1, 0, hot ? 0.05 : 0);
    const m = new THREE.Mesh(g, calmWaterMaterial(hot ? 'bain' : 'bassin'));
    m.name = 'eau-' + a.owner;
    m.renderOrder = 1;
    out.add(m);
    if (hot) addSteamSheet(new THREE.PlaneGeometry(sz.w, sz.d).rotateX(-Math.PI / 2).rotateY(a.yaw).translate(a.pos.x, 0, a.pos.z), a.pos.y, 0.8);
  }
  return out;
}

/** Yubatake : canaux de bois en serpentin où l'eau de source turquoise fume et refroidit (bible §2.6). */
function buildYubatake(group: THREE.Group) {
  const Y = YUBATAKE;
  const rng = new Rng(61);
  const wood: THREE.BufferGeometry[] = [], crust: THREE.BufferGeometry[] = [], water: THREE.BufferGeometry[] = [];
  const c = Math.cos(Y.yaw), s = Math.sin(Y.yaw);
  // repère local : u le long des canaux (x), v en travers (z)
  const place = (g: THREE.BufferGeometry, u: number, y: number, v: number, rot = 0) =>
    g.rotateY(Y.yaw + rot).translate(Y.x + u * c + v * s, y, Y.z - u * s + v * c);
  const box = (w: number, h: number, d: number, u: number, y: number, v: number, list = wood, rot = 0) => list.push(place(new THREE.BoxGeometry(w, h, d), u, y, v, rot));
  const N = 6, L = Y.w - 0.8, pitch = Y.d / N, inner = 0.78, wall = 0.07;
  const lvl = (k: number) => Y.y + 0.55 - k * 0.075;
  for (let k = 0; k < N; k++) {
    const v = -Y.d / 2 + pitch * (k + 0.5);
    const yw = lvl(k), floor = yw - 0.16;
    const dir = k % 2 === 0 ? 1 : -1;
    // fond, parois, têtes
    box(L, 0.05, inner + 2 * wall, 0, floor - 0.025, v);
    for (const sd of [-1, 1]) {
      box(L, 0.3, wall, 0, floor + 0.12, v + sd * (inner / 2 + wall / 2));
      // dépôts minéraux (jaunes et blancs) sur la paroi, au ras de l'eau
      box(L - 0.1, 0.045, 0.012, 0, yw + 0.012, v + sd * (inner / 2 - 0.004), crust);
    }
    for (const e of [-1, 1]) box(wall, 0.3, inner + 2 * wall, e * (L / 2 - wall / 2), floor + 0.12, v);
    // pieds tous les 2 m
    for (let u = -L / 2 + 0.4; u <= L / 2; u += 2) for (const sd of [-1, 1]) {
      const h = floor - 0.05 - Y.y;
      if (h > 0.03) box(0.09, h, 0.09, u, Y.y + h / 2, v + sd * (inner / 2 + wall));
    }
    // eau du canal (légère pente dans le sens du courant)
    const wg = new THREE.PlaneGeometry(L - 2 * wall, inner, 24, 1).rotateX(-Math.PI / 2);
    const wp = wg.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < wp.count; i++) wp.setY(i, -dir * wp.getX(i) * 0.002);
    water.push(withFlow(place(wg, 0, yw, v), dir * c, -dir * s, 0.45 + rng.range(-0.08, 0.1)));
    // dépôt au fond (croûte jaune sous l'eau turquoise)
    box(L - 0.2, 0.01, inner - 0.05, 0, floor + 0.005, v, crust);
    // goulotte vers le canal suivant, au bout aval
    if (k < N - 1) {
      const ue = dir * (L / 2 - 0.25), v2 = v + pitch;
      const yy = lvl(k + 1) + 0.04;
      box(0.36, 0.04, pitch - inner, ue, yy - 0.05, v + pitch / 2);
      const sg = new THREE.PlaneGeometry(0.26, pitch - inner + 0.1).rotateX(-Math.PI / 2);
      water.push(withFlow(place(sg, ue, yy, (v + v2) / 2), s * 0, 1 * c, 0.9));
      box(0.3, 0.06, pitch - inner, ue, yy - 0.01, v + pitch / 2, crust);
    }
  }
  // bac de source à l'amont et bac de sortie
  const v0 = -Y.d / 2 + pitch * 0.5;
  box(1.1, 0.9, 1.2, -L / 2 - 0.65, Y.y + 0.45, v0);
  water.push(withFlow(place(new THREE.PlaneGeometry(0.95, 1.05).rotateX(-Math.PI / 2), -L / 2 - 0.65, Y.y + 0.86, v0), 1, 0, 0.1));
  // barrière basse autour (poteaux et deux lisses)
  const mx = Y.w / 2 + 0.9, mz = Y.d / 2 + 0.5;
  for (const [ax, az, bx, bz] of [[-mx, -mz, mx, -mz], [mx, -mz, mx, mz], [mx, mz, -mx, mz], [-mx, mz, -mx, -mz]]) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 1.6);
    const rot = Math.atan2(-(bz - az), bx - ax);
    for (let i = 0; i <= n; i++) box(0.08, 0.95, 0.08, lerp(ax, bx, i / n), Y.y + 0.47, lerp(az, bz, i / n));
    for (const h of [0.45, 0.85]) box(len, 0.06, 0.05, (ax + bx) / 2, Y.y + h, (az + bz) / 2, wood, rot);
  }
  addBox(Y.x, Y.z, Y.w + 1.8, Y.d + 1.0, Y.y - 0.5, Y.y + 0.95, -Y.yaw, false);
  // vapeur (registre partagé, lu par les Effets) et brume rasante
  for (let k = 0; k < 5; k++) addSmokeSpot(Y.x + (k - 2) * 3.6, Y.y + 0.6, Y.z + rng.range(-2, 2), 'steam');
  addSteamSheet(place(new THREE.PlaneGeometry(Y.w, Y.d).rotateX(-Math.PI / 2), 0, 0, 0), Y.y + 0.35, 1.2);
  // assemblage
  const woodMat = typeof document === 'undefined' ? new THREE.MeshStandardMaterial() : pbr('roughwood', { scale: 1.5, color: 0x8a735a, roughness: 0.85 });
  const crustCol = (g: THREE.BufferGeometry) => {
    const n = g.getAttribute('position').count, a = new Float32Array(n * 3);
    const yel = rng.chance(0.6);
    for (let i = 0; i < n; i++) a.set(yel ? [0.86, 0.78, 0.42] : [0.92, 0.9, 0.82], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    return g;
  };
  const wg = mergeGeometries(wood, false)!, cg = mergeGeometries(crust.map(crustCol), false)!, ag = mergeGeometries(water, false)!;
  const wm = new THREE.Mesh(wg, woodMat);
  wm.name = 'yubatake-bois';
  wm.castShadow = wm.receiveShadow = true;
  const cm = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
  cm.name = 'yubatake-depots';
  cm.receiveShadow = true;
  const am = new THREE.Mesh(ag, calmWaterMaterial('source'));
  am.name = 'yubatake-eau';
  am.renderOrder = 1;
  group.add(wm, cm, am);
}

/** Rizières en terrasses : eau miroir à y + 0,15 dans chaque gradin, en retrait des diguettes (bible §2.8). */
function buildRice(group: THREE.Group) {
  const parts: THREE.BufferGeometry[] = [];
  for (const f of FIELDS) {
    if (f.kind !== 'riziere' || f.y === undefined) continue;
    const g = new THREE.PlaneGeometry(f.w - 1.4, f.d - 1.4).rotateX(-Math.PI / 2).rotateY(f.yaw).translate(f.x, f.y + 0.15, f.z);
    parts.push(withFlow(g));
  }
  if (!parts.length) return;
  const m = new THREE.Mesh(mergeGeometries(parts, false)!, calmWaterMaterial('riziere'));
  m.name = 'eau-rizieres';
  m.renderOrder = 1;
  m.receiveShadow = true;
  group.add(m);
}
