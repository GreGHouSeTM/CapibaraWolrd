// Flore aquatique et koï de Capyville (spécialité Eau).
// - Nénuphars en colonies le long des rives calmes de l'étang (feuilles échancrées, veinées, teintes variées),
//   quelques fleurs blanches et roses ; iris du Japon (hanashōbu) en touffes au bord de l'eau, surtout près des
//   planches en zigzag ; roseaux et massettes sur les rives ouest et sud, roselière à l'exutoire, touffes sur les
//   berges naturelles du torrent.
// - Carpes koï (kohaku, sanke, showa, yamabuki, ogon, asagi) instanciées : nage d'errance, évitement de l'îlot et
//   des hauts-fonds, ondulation de la queue dans le nuanceur.
// Tout est généré par code (textures sur canvas), en 6 appels de dessin. API : `buildAquatic()` → { group, update }.
import * as THREE from 'three';
import { Rng, clamp, lerp, noise2 } from '../../core/math';
import { heightAt } from '../../world/heightmap';
import { streamInfo } from '../../world/valley';
import { BRIDGES, CASCADES, PATHS, POND, distToPolyline } from '../../world/zones';
import { WATER_LEVEL } from '../../world/layout';

export interface Aquatic {
  group: THREE.Group;
  update: (t: number, dt: number) => void;
  counts: Record<string, number>;
}

const U = { uTime: { value: 0 } };
const pondE = (x: number, z: number) => Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz);
const depthAt = (x: number, z: number) => WATER_LEVEL - heightAt(x, z);
const clearOfBridges = (x: number, z: number, m: number) => BRIDGES.every((b) => distToPolyline(x, z, [b.a, b.b]) > b.width / 2 + m);
const PONDPATHS = PATHS.filter((p) => p.id === 'tour-etang' || p.id === 'rue-etang');
const clearOfPaths = (x: number, z: number, m: number) => PONDPATHS.every((p) => distToPolyline(x, z, p.pts) > p.width / 2 + m);
const KOI_FALL = CASCADES.find((c) => c.id === 'koi');
const nearPonton = (x: number, z: number) => Math.abs(x + 110) < 2.2 && z > 59 && z < 72;
const nearFall = (x: number, z: number, r: number) => !!KOI_FALL && Math.hypot(x - KOI_FALL.x, z - KOI_FALL.z) < r;

/** Balancement au vent (hauteur locale × phase par instance). */
function swayMaterial(mat: THREE.MeshStandardMaterial, amp: number, key: string) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float h = max(0.0, position.y);
        float ph = ip.x * 0.37 + ip.z * 0.23;
        float w = sin(uTime * 1.3 + ph) * 0.7 + sin(uTime * 2.9 + ph * 1.7) * 0.3;
        transformed.x += w * ${amp.toFixed(3)} * h * h;
        transformed.z += cos(uTime * 1.1 + ph) * ${(amp * 0.6).toFixed(3)} * h * h;
      }`,
    );
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

// =============================================================================================== NÉNUPHARS
function padTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const cx = S / 2;
  const grd = g.createRadialGradient(cx, cx, 4, cx, cx, cx);
  grd.addColorStop(0, '#6f9a3a');
  grd.addColorStop(0.7, '#4f7f2c');
  grd.addColorStop(1, '#3a6224');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  // taches et usure
  const rng = new Rng(17);
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(${rng.int(40, 120)},${rng.int(80, 130)},${rng.int(20, 50)},${rng.range(0.05, 0.2)})`;
    g.beginPath();
    g.arc(rng.range(0, S), rng.range(0, S), rng.range(2, 14), 0, Math.PI * 2);
    g.fill();
  }
  // nervures rayonnantes
  g.strokeStyle = 'rgba(190,210,140,0.35)';
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(cx, cx);
    for (let r = 0; r <= 1; r += 0.1) g.lineTo(cx + Math.cos(a + Math.sin(r * 5 + i) * 0.03) * r * cx, cx + Math.sin(a + Math.sin(r * 5 + i) * 0.03) * r * cx);
    g.stroke();
  }
  // bord brun-rouge
  g.strokeStyle = 'rgba(120,60,40,0.45)';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(cx, cx, cx - 3, 0, Math.PI * 2);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function padGeometry() {
  const N = 24, notch = 0.32;
  const pos: number[] = [0, 0.012, 0], uv: number[] = [0.5, 0.5], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const a = notch / 2 + (i / N) * (Math.PI * 2 - notch);
    const r = 1 + 0.03 * Math.sin(a * 7);
    pos.push(Math.cos(a) * r, 0.03 * Math.pow(Math.abs(Math.sin(a * 0.5)), 2), Math.sin(a) * r);
    uv.push(0.5 + Math.cos(a) * 0.5 * r, 0.5 + Math.sin(a) * 0.5 * r);
  }
  for (let i = 1; i <= N; i++) idx.push(0, i + 1, i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function lilyFlowerGeometry() {
  // deux couronnes de 8 pétales (blanc au cœur, extrémité teintée par l'instance), cœur jaune
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const petal = (a: number, len: number, tilt: number, wid: number, y0: number) => {
    const b = pos.length / 3;
    const ca = Math.cos(a), sa = Math.sin(a);
    const pts: [number, number, number, number][] = [
      [0, 0, 0, 0], [wid, 0.35, 0.02, 0.4], [-wid, 0.35, 0.02, 0.4], [wid * 0.7, 0.75, 0.05, 0.8], [-wid * 0.7, 0.75, 0.05, 0.8], [0, 1, 0.07, 1],
    ];
    for (const [w, l, up, k] of pts) {
      const r = l * len;
      const y = y0 + r * Math.sin(tilt) + up * len;
      const h = r * Math.cos(tilt);
      pos.push(ca * h - sa * w * len, y, sa * h + ca * w * len);
      col.push(1, lerp(1, 0.92, k), lerp(1, 0.95, k));
    }
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2, b + 2, b + 3, b + 4, b + 3, b + 5, b + 4);
  };
  for (let i = 0; i < 8; i++) petal((i / 8) * Math.PI * 2, 1, 0.25, 0.22, 0.02);
  for (let i = 0; i < 8; i++) petal(((i + 0.5) / 8) * Math.PI * 2, 0.75, 0.7, 0.2, 0.05);
  // cœur
  const b = pos.length / 3;
  pos.push(0, 0.22, 0);
  col.push(1, 0.82, 0.25);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    pos.push(Math.cos(a) * 0.16, 0.12, Math.sin(a) * 0.16);
    col.push(0.95, 0.7, 0.2);
  }
  for (let i = 0; i < 8; i++) idx.push(b, b + 1 + ((i + 1) % 8), b + 1 + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// =============================================================================================== IRIS ET ROSEAUX
/** Feuille en lame (quad effilé, courbé) ajoutée à des tableaux de géométrie. */
function blade(pos: number[], col: number[], idx: number[], x: number, z: number, a: number, h: number, w: number, bend: number, c0: [number, number, number], c1: [number, number, number], segs = 4) {
  const b = pos.length / 3;
  const dx = Math.cos(a), dz = Math.sin(a);
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const y = h * t;
    const off = bend * t * t;
    const ww = w * (1 - t * 0.92);
    const cx = x + dx * off, cz = z + dz * off;
    // la lame est perpendiculaire à sa direction de courbure
    pos.push(cx - dz * ww, y, cz + dx * ww, cx + dz * ww, y, cz - dx * ww);
    const c = [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
    col.push(...c, ...c);
  }
  for (let s = 0; s < segs; s++) {
    const q = b + s * 2;
    idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
  }
}

function irisGeometry(seed: number) {
  const rng = new Rng(seed);
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const n = rng.int(9, 14);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0, 0.12);
    blade(pos, col, idx, Math.cos(a) * r, Math.sin(a) * r, a + rng.range(-0.3, 0.3), rng.range(0.55, 0.95), rng.range(0.02, 0.032), rng.range(0.05, 0.22), [0.13, 0.22, 0.07], [0.3, 0.5, 0.14]);
  }
  // tiges fleuries (2-3) : trois sépales retombants violets à cœur jaune, trois pétales dressés
  const nf = rng.int(2, 3);
  for (let f = 0; f < nf; f++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(0.03, 0.1);
    const fx = Math.cos(a) * r, fz = Math.sin(a) * r, fh = rng.range(0.75, 1.05);
    blade(pos, col, idx, fx, fz, a, fh, 0.008, 0.02, [0.18, 0.3, 0.09], [0.25, 0.4, 0.12], 2);
    const purple: [number, number, number] = [0.32, 0.12, 0.6], deep: [number, number, number] = [0.2, 0.06, 0.42];
    for (let k = 0; k < 3; k++) {
      const pa = (k / 3) * Math.PI * 2 + a;
      const b = pos.length / 3;
      const ca = Math.cos(pa), sa = Math.sin(pa);
      // sépale retombant
      pos.push(fx, fh, fz, fx + ca * 0.06 - sa * 0.03, fh + 0.01, fz + sa * 0.06 + ca * 0.03, fx + ca * 0.06 + sa * 0.03, fh + 0.01, fz + sa * 0.06 - ca * 0.03, fx + ca * 0.11, fh - 0.05, fz + sa * 0.11);
      col.push(0.85, 0.7, 0.2, ...purple, ...purple, ...deep);
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      // pétale dressé
      const pb = pos.length / 3;
      const qa = pa + Math.PI / 3, cq = Math.cos(qa), sq = Math.sin(qa);
      pos.push(fx - sq * 0.02, fh, fz + cq * 0.02, fx + sq * 0.02, fh, fz - cq * 0.02, fx + cq * 0.03, fh + 0.08, fz + sq * 0.03);
      col.push(...purple, ...purple, 0.42, 0.22, 0.72);
      idx.push(pb, pb + 1, pb + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function reedGeometry(seed: number) {
  const rng = new Rng(seed);
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const n = rng.int(14, 20);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(0, 0.3);
    const h = rng.range(1.1, 2.1);
    const dry = rng.chance(0.3);
    blade(pos, col, idx, Math.cos(a) * r, Math.sin(a) * r, a + rng.range(-0.5, 0.5), h, rng.range(0.012, 0.02), rng.range(0.1, 0.45),
      dry ? [0.32, 0.27, 0.13] : [0.16, 0.24, 0.08], dry ? [0.6, 0.52, 0.3] : [0.42, 0.52, 0.2], 5);
  }
  // massettes (épis bruns) sur tige
  const nc = rng.int(2, 5);
  for (let k = 0; k < nc; k++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(0, 0.22);
    const x = Math.cos(a) * r, z = Math.sin(a) * r, h = rng.range(1.3, 1.9);
    blade(pos, col, idx, x, z, a, h, 0.006, 0.03, [0.22, 0.3, 0.1], [0.4, 0.45, 0.2], 2);
    const b = pos.length / 3;
    const R = 0.025, L0 = h - 0.32, L1 = h - 0.08;
    for (let s = 0; s < 6; s++) {
      const th = (s / 6) * Math.PI * 2;
      pos.push(x + Math.cos(th) * R, L0, z + Math.sin(th) * R, x + Math.cos(th) * R, L1, z + Math.sin(th) * R);
      col.push(0.1, 0.055, 0.03, 0.13, 0.075, 0.04);
    }
    for (let s = 0; s < 6; s++) {
      const p = b + s * 2, q = b + ((s + 1) % 6) * 2;
      idx.push(p, q, p + 1, p + 1, q, q + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// =============================================================================================== KOÏ
function koiGeometry() {
  // corps fuselé (axe +z = tête), section ovale, queue en éventail, nageoires pectorales
  const pos: number[] = [], idx: number[] = [], lz: number[] = [];
  const NZ = 14, NS = 10;
  const prof = (t: number) => {
    // t : 0 queue, 1 tête
    const head = t > 0.82 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.82) / 0.18, 2))) : 1;
    return 0.11 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.62 + 0.38)), 0.9) * head + 0.012;
  };
  for (let i = 0; i <= NZ; i++) {
    const t = i / NZ, z = t - 0.5;
    const r = prof(t);
    for (let s = 0; s < NS; s++) {
      const th = (s / NS) * Math.PI * 2;
      pos.push(Math.cos(th) * r * 0.78, Math.sin(th) * r * (th > Math.PI ? 0.85 : 1.05) + 0.0, z);
      lz.push(z);
    }
  }
  for (let i = 0; i < NZ; i++)
    for (let s = 0; s < NS; s++) {
      const a = i * NS + s, b = i * NS + ((s + 1) % NS);
      idx.push(a, a + NS, b, b, a + NS, b + NS);
    }
  const fin = (pts: [number, number, number][]) => {
    const b = pos.length / 3;
    for (const p of pts) { pos.push(...p); lz.push(p[2]); }
    for (let k = 1; k < pts.length - 1; k++) idx.push(b, b + k, b + k + 1, b, b + k + 1, b + k);
  };
  // queue (deux lobes)
  fin([[0, 0, -0.48], [0, 0.11, -0.66], [0, 0.04, -0.6], [0, 0, -0.62], [0, -0.04, -0.6], [0, -0.11, -0.66]]);
  // pectorales
  fin([[0.07, -0.05, 0.18], [0.2, -0.07, 0.08], [0.16, -0.06, 0.0], [0.07, -0.05, 0.08]]);
  fin([[-0.07, -0.05, 0.18], [-0.2, -0.07, 0.08], [-0.16, -0.06, 0.0], [-0.07, -0.05, 0.08]]);
  // dorsale
  fin([[0, 0.1, 0.15], [0, 0.17, 0.02], [0, 0.13, -0.18], [0, 0.07, -0.2]]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aZ', new THREE.Float32BufferAttribute(lz, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function koiMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; attribute float aZ; attribute vec4 aKoi; varying vec3 vLoc; varying vec4 vKoi;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          // ondulation : amplitude croissante vers la queue, fréquence selon l'allure (aKoi.z)
          float back = clamp(0.35 - aZ, 0.0, 1.0);
          float w = sin(uTime * (4.0 + aKoi.z * 6.0) + aKoi.y * 40.0 - aZ * 6.0);
          transformed.x += w * back * back * 0.22;
          vLoc = position;
          vKoi = aKoi;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vLoc; varying vec4 vKoi;
        float kh(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float kn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(kh(i), kh(i+vec3(1,0,0)), f.x), mix(kh(i+vec3(0,1,0)), kh(i+vec3(1,1,0)), f.x), f.y),
                     mix(mix(kh(i+vec3(0,0,1)), kh(i+vec3(1,0,1)), f.x), mix(kh(i+vec3(0,1,1)), kh(i+vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float type = vKoi.x, sd = vKoi.y * 17.0;
          vec3 white = vec3(0.92, 0.9, 0.86), red = vec3(0.85, 0.2, 0.05), black = vec3(0.04, 0.04, 0.05),
               gold = vec3(0.95, 0.62, 0.12), plat = vec3(0.8, 0.82, 0.8), blue = vec3(0.32, 0.42, 0.52);
          vec3 p = vLoc * vec3(9.0, 9.0, 7.0) + sd;
          float n1 = kn(p), n2 = kn(p * 1.9 + 3.1);
          float top = smoothstep(-0.02, 0.05, vLoc.y);
          vec3 c = white;
          if (type < 0.5) c = mix(white, red, smoothstep(0.45, 0.55, n1) * top);                       // kohaku
          else if (type < 1.5) { c = mix(white, red, smoothstep(0.45, 0.55, n1) * top); c = mix(c, black, smoothstep(0.62, 0.7, n2) * top); } // sanke
          else if (type < 2.5) { c = mix(black, red, smoothstep(0.42, 0.52, n1)); c = mix(c, white, smoothstep(0.55, 0.65, n2) * (1.0 - top * 0.5)); } // showa
          else if (type < 3.5) c = gold * (0.85 + 0.25 * n2);                                         // yamabuki
          else if (type < 4.5) c = plat * (0.9 + 0.2 * n2);                                           // ogon
          else { c = mix(blue, red, smoothstep(0.0, -0.06, vLoc.y)); c = mix(c, white, 0.2 * n2); }   // asagi
          // ventre plus clair, nageoires translucides
          c = mix(c, white * 0.95, smoothstep(0.0, -0.08, vLoc.y) * 0.5);
          diffuseColor.rgb = c * 1.25;
        }`);
  };
  mat.customProgramCacheKey = () => 'eau-koi-v1';
  return mat;
}

interface Fish { x: number; z: number; y: number; h: number; v: number; turn: number; tx: number; tz: number; s: number; timer: number }

// =============================================================================================== CONSTRUCTION
export function buildAquatic(): Aquatic {
  const group = new THREE.Group();
  group.name = 'eau-flore-koi';
  const rng = new Rng(2024);
  const counts: Record<string, number> = {};
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const put = (im: THREE.InstancedMesh, i: number, x: number, y: number, z: number, yaw: number, sc: number, tilt = 0) => {
    e.set(tilt * rng.range(-1, 1), yaw, tilt * rng.range(-1, 1));
    m4.compose(v.set(x, y, z), q.setFromEuler(e), s.setScalar(sc));
    im.setMatrixAt(i, m4);
  };

  // ---------------------------------------------------------------- nénuphars
  {
    type P = { x: number; z: number; r: number };
    const pads: P[] = [];
    const flowers: P[] = [];
    let tries = 0;
    for (let c = 0; c < 13 && tries < 400; tries++) {
      const a = rng.range(-Math.PI, Math.PI), rr = rng.range(0.55, 0.92);
      const cx = POND.x + Math.cos(a) * POND.rx * rr, cz = POND.z + Math.sin(a) * POND.rz * rr;
      const d = depthAt(cx, cz);
      if (d < 0.35 || d > 2.2 || nearFall(cx, cz, 14) || nearPonton(cx, cz) || !clearOfBridges(cx, cz, 2.5)) continue;
      if (Math.hypot(cx - POND.island.x, cz - POND.island.z) < POND.island.r + 2) continue;
      c++;
      const n = rng.int(7, 20), R = rng.range(1.6, 3.6);
      for (let k = 0; k < n * 3 && pads.length < 260; k++) {
        const pa = rng.range(0, Math.PI * 2), pr = Math.sqrt(rng.next()) * R;
        const x = cx + Math.cos(pa) * pr, z = cz + Math.sin(pa) * pr * 0.8;
        const r = rng.range(0.16, 0.42) * (1 - 0.35 * (pr / R));
        const dd = depthAt(x, z);
        if (dd < 0.2 || pondE(x, z) > 1 || !clearOfBridges(x, z, 1.4) || nearPonton(x, z)) continue;
        if (pads.some((p) => Math.hypot(p.x - x, p.z - z) < (p.r + r) * 0.82)) continue;
        pads.push({ x, z, r });
        if (rng.chance(0.09) && r > 0.24) flowers.push({ x: x + rng.range(-0.08, 0.08), z: z + rng.range(-0.08, 0.08), r: rng.range(0.07, 0.1) });
      }
    }
    const pm = new THREE.MeshStandardMaterial({ map: padTexture(), roughness: 0.42, metalness: 0, side: THREE.DoubleSide });
    pm.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        { vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
          transformed.y += sin(uTime * 1.1 + ip.x * 1.3 + ip.z) * 0.12 * (position.x * 0.6 + position.z * 0.4); }`,
      );
    };
    pm.customProgramCacheKey = () => 'eau-nenuphar-v1';
    const pim = new THREE.InstancedMesh(padGeometry(), pm, pads.length);
    pads.forEach((p, i) => {
      put(pim, i, p.x, WATER_LEVEL + 0.005 + rng.range(0, 0.012), p.z, rng.range(0, Math.PI * 2), p.r, 0.03);
      const c = new THREE.Color().setHSL(lerp(0.2, 0.3, rng.next()), lerp(0.35, 0.6, rng.next()), lerp(0.62, 0.95, rng.next()));
      if (rng.chance(0.12)) c.setHSL(0.04, 0.4, 0.6); // feuilles rougies
      pim.setColorAt(i, c);
    });
    pim.name = 'eau-nenuphars';
    pim.receiveShadow = true;
    pim.computeBoundingSphere();
    group.add(pim);
    const fm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide, emissive: 0x1a1210 });
    const fim = new THREE.InstancedMesh(lilyFlowerGeometry(), fm, Math.max(1, flowers.length));
    flowers.forEach((p, i) => {
      put(fim, i, p.x, WATER_LEVEL + 0.01, p.z, rng.range(0, 6.28), p.r * rng.range(0.9, 1.4), 0.08);
      const pick = rng.next();
      fim.setColorAt(i, pick < 0.45 ? new THREE.Color(1, 1, 1) : pick < 0.8 ? new THREE.Color(1, 0.72, 0.8) : new THREE.Color(1, 0.5, 0.65));
    });
    fim.count = flowers.length;
    fim.name = 'eau-fleurs-nenuphar';
    fim.computeBoundingSphere();
    group.add(fim);
    counts.nenuphars = pads.length;
    counts.fleurs = flowers.length;
  }

  // ---------------------------------------------------------------- iris et roseaux
  {
    const iris: [number, number, number][] = [], reeds: [number, number, number][] = [];
    // tour de l'étang : on longe l'ellipse et on garde les points de rive (eau très peu profonde à terre humide)
    for (let k = 0; k < 2600; k++) {
      const a = rng.range(-Math.PI, Math.PI), rr = rng.range(0.85, 1.12);
      const x = POND.x + Math.cos(a) * POND.rx * rr, z = POND.z + Math.sin(a) * POND.rz * rr;
      const d = depthAt(x, z);
      if (d > 0.3 || d < -0.45) continue;
      if (!clearOfPaths(x, z, 0.5) || !clearOfBridges(x, z, 0.8) || nearPonton(x, z) || nearFall(x, z, 9)) continue;
      // berge est escarpée : peu de plantes
      const phi = Math.atan2((z - POND.z) / POND.rz, (x - POND.x) / POND.rx);
      const east = phi > -0.65 && phi < 1.65;
      if (east && rng.chance(0.85)) continue;
      const westSouth = Math.cos(phi) < -0.2 || Math.sin(phi) > 0.5;
      // les plantes de rive poussent en massifs : densité modulée par un bruit à grande échelle
      const patch = noise2(x / 9 + 4.2, z / 9 - 1.3) * 0.5 + 0.5;
      if (patch < 0.48 || rng.next() > (patch - 0.48) * 3) continue;
      const nearPlanks = distToPolyline(x, z, [[-143, 80], [-159, 85]]) < 7;
      if (nearPlanks || (rng.chance(0.4) && !westSouth)) iris.push([x, z, rng.range(0.8, 1.25)]);
      else if (westSouth && rng.chance(0.75)) reeds.push([x, z, rng.range(0.8, 1.3)]);
      else if (rng.chance(0.5)) iris.push([x, z, rng.range(0.8, 1.2)]);
    }
    // îlot : quelques iris
    for (let k = 0; k < 14; k++) {
      const a = rng.range(0, Math.PI * 2), r = POND.island.r * rng.range(0.85, 1.15);
      const x = POND.island.x + Math.cos(a) * r, z = POND.island.z + Math.sin(a) * r;
      if (depthAt(x, z) < 0.25 && depthAt(x, z) > -0.5 && clearOfBridges(x, z, 0.8)) iris.push([x, z, rng.range(0.8, 1.1)]);
    }
    // roselière de l'exutoire (sud-ouest)
    for (let k = 0; k < 70; k++) {
      const x = -158 + rng.range(-9, 9), z = 104 + rng.range(-6, 8);
      const d = depthAt(x, z);
      if (d < 0.5 && d > -0.6 && clearOfPaths(x, z, 0.4)) reeds.push([x, z, rng.range(0.9, 1.4)]);
    }
    // berges naturelles du torrent (tronçon sud) : touffes éparses au ras de l'eau
    for (let k = 0; k < 500; k++) {
      const x = rng.range(-90, 85), z = rng.range(60, 145);
      const si = streamInfo(x, z);
      if (si.kind !== 3) continue;
      const off = si.d - si.width / 2;
      if (off < -0.2 || off > 0.9) continue;
      if (!clearOfBridges(x, z, 1.5) || PATHS.some((p) => distToPolyline(x, z, p.pts) < p.width / 2 + 0.6)) continue;
      if (rng.chance(0.55)) reeds.push([x, z, rng.range(0.6, 1.0)]);
      else iris.push([x, z, rng.range(0.7, 1.0)]);
    }
    const spread = (list: [number, number, number][], minD: number) => {
      const out: [number, number, number][] = [];
      for (const p of list) if (out.every((o) => Math.hypot(o[0] - p[0], o[1] - p[1]) > minD)) out.push(p);
      return out;
    };
    const irisL = spread(iris, 0.45), reedL = spread(reeds, 0.4);
    const variants = 3;
    for (let vI = 0; vI < variants; vI++) {
      const il = irisL.filter((_, i) => i % variants === vI), rl = reedL.filter((_, i) => i % variants === vI);
      if (il.length) {
        const im = new THREE.InstancedMesh(irisGeometry(11 + vI), swayMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }), 0.06, 'eau-iris'), il.length);
        il.forEach(([x, z, sc], i) => {
          put(im, i, x, heightAt(x, z) - 0.03, z, rng.range(0, 6.28), sc, 0.06);
          im.setColorAt(i, new THREE.Color().setHSL(0.27 + rng.range(-0.04, 0.04), 0.18, rng.range(0.42, 0.55)).multiplyScalar(2));
        });
        im.name = 'eau-iris-' + vI;
        im.computeBoundingSphere();
        group.add(im);
      }
      if (rl.length) {
        const rm = new THREE.InstancedMesh(reedGeometry(21 + vI), swayMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }), 0.05, 'eau-roseaux'), rl.length);
        rl.forEach(([x, z, sc], i) => {
          put(rm, i, x, heightAt(x, z) - 0.05, z, rng.range(0, 6.28), sc, 0.05);
          rm.setColorAt(i, new THREE.Color().setHSL(0.24 + rng.range(-0.05, 0.04), 0.14, rng.range(0.38, 0.52)).multiplyScalar(2));
        });
        rm.name = 'eau-roseaux-' + vI;
        rm.castShadow = true;
        rm.computeBoundingSphere();
        group.add(rm);
      }
    }
    counts.iris = irisL.length;
    counts.roseaux = reedL.length;
  }

  // ---------------------------------------------------------------- koï
  const NK = 26;
  const fish: Fish[] = [];
  const kg = koiGeometry();
  const aKoi = new Float32Array(NK * 4);
  for (let i = 0; i < NK; i++) {
    let x = POND.x, z = POND.z;
    for (let k = 0; k < 50; k++) {
      x = POND.x + rng.range(-0.8, 0.8) * POND.rx;
      z = POND.z + rng.range(-0.8, 0.8) * POND.rz;
      if (depthAt(x, z) > 0.8 && Math.hypot(x - POND.island.x, z - POND.island.z) > POND.island.r + 2) break;
    }
    const type = [0, 0, 0, 1, 1, 2, 2, 3, 4, 5][rng.int(0, 9)];
    const sc = rng.range(0.42, 0.78);
    fish.push({ x, z, y: -rng.range(0.25, 0.6), h: rng.range(0, Math.PI * 2), v: rng.range(0.2, 0.45), turn: 0, tx: x, tz: z, s: sc, timer: 0 });
    aKoi.set([type, rng.next(), 0.3, 0], i * 4);
  }
  const koiAttr = new THREE.InstancedBufferAttribute(aKoi, 4);
  koiAttr.setUsage(THREE.DynamicDrawUsage);
  kg.setAttribute('aKoi', koiAttr);
  const koi = new THREE.InstancedMesh(kg, koiMaterial(), NK);
  koi.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  koi.name = 'eau-koi';
  koi.frustumCulled = false;
  group.add(koi);
  counts.koi = NK;
  const pickTarget = (f: Fish) => {
    for (let k = 0; k < 20; k++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(3, 14);
      const x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
      if (pondE(x, z) < 0.92 && depthAt(x, z) > 0.7 && Math.hypot(x - POND.island.x, z - POND.island.z) > POND.island.r + 1.5) {
        f.tx = x; f.tz = z;
        return;
      }
    }
    f.tx = POND.x + rng.range(-10, 10);
    f.tz = POND.z + rng.range(-6, 6);
  };
  fish.forEach(pickTarget);

  const update = (t: number, dt: number) => {
    U.uTime.value = t;
    const step = clamp(dt, 0, 0.1);
    for (let i = 0; i < NK; i++) {
      const f = fish[i];
      f.timer -= step;
      const dx = f.tx - f.x, dz = f.tz - f.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.2 || f.timer < 0) { pickTarget(f); f.timer = rng.range(6, 16); }
      // cap vers la cible, avec un peu d'hésitation
      let want = Math.atan2(dx, dz) + noise2(t * 0.15 + i * 3.1, i) * 0.6;
      // évite les hauts-fonds : on sonde devant
      const ax = f.x + Math.sin(f.h) * 1.2, az = f.z + Math.cos(f.h) * 1.2;
      if (depthAt(ax, az) < 0.6 || pondE(ax, az) > 0.95) want = f.h + 1.6;
      let dh = want - f.h;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      f.turn = lerp(f.turn, clamp(dh, -1, 1) * 1.1, 1 - Math.exp(-step * 2));
      f.h += f.turn * step;
      const sp = f.v * (0.7 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.3 + i)));
      f.x += Math.sin(f.h) * sp * step;
      f.z += Math.cos(f.h) * sp * step;
      e.set(0, f.h, -f.turn * 0.25);
      m4.compose(v.set(f.x, WATER_LEVEL + f.y + Math.sin(t * 0.4 + i) * 0.04, f.z), q.setFromEuler(e), s.setScalar(f.s));
      koi.setMatrixAt(i, m4);
      aKoi[i * 4 + 2] = sp;
    }
    koi.instanceMatrix.needsUpdate = true;
    koiAttr.needsUpdate = true;
  };
  update(0, 0);
  return { group, update, counts };
}
