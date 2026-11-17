// Herbe instanciée sur GPU autour du joueur (brins animés par le vent, quelques fleurs).
import * as THREE from 'three';
import { HM_RES, WORLD_HALF, getHeightTexture, heights, splat } from './heightmap';
import { REGIONS, WORLD_SIZE } from './layout';
import { Rng } from '../core/math';

/** Masque d'herbe : RGB = teinte, A = densité. Les villes y « pavent » leurs rues. */
export const grassMask = new Uint8Array(HM_RES * HM_RES * 4);
const CELL = WORLD_SIZE / (HM_RES - 1);

const TINT: Record<string, [number, number, number]> = {
  hub: [0.5, 0.78, 0.22], paris: [0.42, 0.62, 0.22], newyork: [0.4, 0.6, 0.24], london: [0.36, 0.56, 0.22],
  japan: [0.42, 0.8, 0.3], desert: [0.75, 0.68, 0.32], pole: [0.75, 0.82, 0.7],
};

export function bakeGrassMask() {
  for (let j = 0; j < HM_RES; j++)
    for (let i = 0; i < HM_RES; i++) {
      const x = i * CELL - WORLD_HALF, z = j * CELL - WORLD_HALF;
      const idx = j * HM_RES + i;
      let r = 0, g = 0, b = 0, sum = 0;
      for (const reg of REGIONS) {
        const d = Math.hypot(x - reg.x, z - reg.z);
        const w = Math.pow(Math.max(0, 1 - d / (reg.radius * 1.7)), 3) + 1e-4;
        const t = TINT[reg.id];
        r += t[0] * w; g += t[1] * w; b += t[2] * w; sum += w;
      }
      const h = heights[idx];
      const dens = (splat[idx * 4] / 255) * (h > 0.8 ? 1 : 0);
      grassMask[idx * 4] = (r / sum) * 255;
      grassMask[idx * 4 + 1] = (g / sum) * 255;
      grassMask[idx * 4 + 2] = (b / sum) * 255;
      grassMask[idx * 4 + 3] = Math.min(255, dens * 255);
    }
}

/** Retire l'herbe d'un rectangle orienté (rues, bâtiments, places). */
export function paveRect(cx: number, cz: number, w: number, d: number, rot = 0, value = 0) {
  const r = Math.hypot(w, d) / 2;
  const i0 = Math.max(0, Math.floor((cx - r + WORLD_HALF) / CELL)), i1 = Math.min(HM_RES - 1, Math.ceil((cx + r + WORLD_HALF) / CELL));
  const j0 = Math.max(0, Math.floor((cz - r + WORLD_HALF) / CELL)), j1 = Math.min(HM_RES - 1, Math.ceil((cz + r + WORLD_HALF) / CELL));
  const cs = Math.cos(-rot), sn = Math.sin(-rot);
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const x = i * CELL - WORLD_HALF - cx, z = j * CELL - WORLD_HALF - cz;
      const lx = x * cs - z * sn, lz = x * sn + z * cs;
      if (Math.abs(lx) <= w / 2 + CELL * 0.5 && Math.abs(lz) <= d / 2 + CELL * 0.5) grassMask[(j * HM_RES + i) * 4 + 3] = value;
    }
}
export function paveCircle(cx: number, cz: number, r: number, value = 0) {
  const i0 = Math.max(0, Math.floor((cx - r + WORLD_HALF) / CELL)), i1 = Math.min(HM_RES - 1, Math.ceil((cx + r + WORLD_HALF) / CELL));
  const j0 = Math.max(0, Math.floor((cz - r + WORLD_HALF) / CELL)), j1 = Math.min(HM_RES - 1, Math.ceil((cz + r + WORLD_HALF) / CELL));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const x = i * CELL - WORLD_HALF, z = j * CELL - WORLD_HALF;
      if (Math.hypot(x - cx, z - cz) < r) grassMask[(j * HM_RES + i) * 4 + 3] = value;
    }
}
export function grassDensityAt(x: number, z: number) {
  const i = Math.round((x + WORLD_HALF) / CELL), j = Math.round((z + WORLD_HALF) / CELL);
  if (i < 0 || j < 0 || i >= HM_RES || j >= HM_RES) return 0;
  return grassMask[(j * HM_RES + i) * 4 + 3] / 255;
}

const vert = /* glsl */ `
uniform sampler2D uHeight, uMask;
uniform float uTime, uWorld, uPatch;
uniform vec3 uCenter;
uniform vec4 uPushers[4];
attribute vec3 aOffset; // x, z, aléa
attribute float aFlower;
varying vec3 vCol;
varying float vH;
varying vec3 vWorld;
#include <common>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>
void main(){
  vec2 off = aOffset.xy;
  vec2 rel = off - uCenter.xz;
  vec2 wp2 = off - floor(rel / uPatch + 0.5) * uPatch;
  vec2 uv = (wp2 + uWorld * 0.5) / uWorld;
  vec4 mask = texture2D(uMask, uv);
  float ground = texture2D(uHeight, uv).r;
  float rnd = aOffset.z;
  float dist = length(wp2 - uCenter.xz);
  float fade = 1.0 - smoothstep(uPatch * 0.32, uPatch * 0.5, dist);
  float dens = mask.a * fade;
  float keep = step(rnd, dens);
  float h = (0.22 + 0.3 * fract(rnd * 13.7)) * keep * (0.4 + 0.6 * dens);
  float ang = rnd * 6.2831 * 7.0;
  vec3 p = position;
  // orientation aléatoire + largeur
  float w = 0.08 + 0.05 * fract(rnd * 31.1);
  p.x *= w;
  vec2 rot = vec2(cos(ang), sin(ang));
  vec3 lp = vec3(p.x * rot.x, p.y * h, p.x * rot.y);
  // vent
  float t = position.y;
  float wind = sin(uTime * 1.7 + wp2.x * 0.15 + wp2.y * 0.11) * 0.5 + sin(uTime * 3.1 + wp2.x * 0.5) * 0.18;
  vec2 bend = vec2(0.6, 0.3) * wind * 0.22 * t * t;
  // les personnages couchent l'herbe
  for (int i = 0; i < 4; i++) {
    vec2 d = wp2 - uPushers[i].xy;
    float l = length(d);
    float k = smoothstep(uPushers[i].z, 0.0, l) * uPushers[i].w;
    bend += normalize(d + 0.0001) * k * 0.45 * t;
    lp.y *= 1.0 - k * 0.5;
  }
  lp.xz += bend;
  vec3 world = vec3(wp2.x, ground, wp2.y) + lp;
  vWorld = world;
  vH = t;
  vec3 tint = mask.rgb;
  vec3 base = tint * 0.45;
  vec3 tip = mix(tint * 1.25, vec3(0.95, 0.95, 0.55), 0.18);
  vCol = mix(base, tip, t);
  if (aFlower > 0.5 && t > 0.7) {
    float k = fract(rnd * 97.0);
    vCol = k < 0.33 ? vec3(1.0, 0.95, 0.95) : k < 0.66 ? vec3(1.0, 0.85, 0.2) : vec3(0.95, 0.45, 0.75);
  }
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vec4 worldPosition = vec4(world, 1.0);
  vec3 transformedNormal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  #include <shadowmap_vertex>
  #include <fog_vertex>
}`;

const frag = /* glsl */ `
uniform vec3 uSunDir, uSunColor, uAmbient;
varying vec3 vCol;
varying float vH;
varying vec3 vWorld;
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main(){
  float sh = getShadowMask();
  vec3 col = vCol * (uAmbient + uSunColor * (0.35 + 0.65 * sh) * max(0.2, uSunDir.y));
  // diffusion translucide quand le soleil est en face
  col += vCol * uSunColor * 0.15 * vH * sh;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class Grass {
  mesh: THREE.Mesh;
  uniforms: Record<string, THREE.IUniform>;
  maskTex: THREE.DataTexture;
  constructor(count: number, patch: number) {
    const blade = new THREE.BufferGeometry();
    // brin effilé de 5 sommets
    const p = [-0.5, 0, 0, 0.5, 0, 0, -0.35, 0.5, 0, 0.35, 0.5, 0, 0, 1, 0];
    blade.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    blade.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4]);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = blade.index;
    geo.attributes.position = blade.attributes.position;
    const offs = new Float32Array(count * 3);
    const flowers = new Float32Array(count);
    const r = new Rng(99);
    for (let i = 0; i < count; i++) {
      offs[i * 3] = (r.next() - 0.5) * patch;
      offs[i * 3 + 1] = (r.next() - 0.5) * patch;
      offs[i * 3 + 2] = r.next();
      flowers[i] = r.chance(0.025) ? 1 : 0;
    }
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offs, 3));
    geo.setAttribute('aFlower', new THREE.InstancedBufferAttribute(flowers, 1));
    geo.instanceCount = count;
    this.maskTex = new THREE.DataTexture(grassMask, HM_RES, HM_RES, THREE.RGBAFormat);
    this.maskTex.magFilter = THREE.LinearFilter;
    this.maskTex.minFilter = THREE.LinearFilter;
    this.maskTex.needsUpdate = true;
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.lights, THREE.UniformsLib.fog]);
    Object.assign(this.uniforms, {
      uHeight: { value: getHeightTexture() },
      uMask: { value: this.maskTex },
      uTime: { value: 0 },
      uWorld: { value: WORLD_SIZE },
      uPatch: { value: patch },
      uCenter: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uAmbient: { value: new THREE.Color(0.4, 0.45, 0.5) },
      uPushers: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    });
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vert,
      fragmentShader: frag,
      lights: true,
      fog: true,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
  }
  update(time: number, center: THREE.Vector3, sunDir: THREE.Vector3, sunColor: THREE.Color, sunIntensity: number, ambient: THREE.Color, pushers: THREE.Vector4[]) {
    const u = this.uniforms;
    u.uTime.value = time;
    (u.uCenter.value as THREE.Vector3).copy(center);
    (u.uSunDir.value as THREE.Vector3).copy(sunDir);
    (u.uSunColor.value as THREE.Color).copy(sunColor).multiplyScalar(sunIntensity / 3.2);
    (u.uAmbient.value as THREE.Color).copy(ambient);
    const arr = u.uPushers.value as THREE.Vector4[];
    for (let i = 0; i < 4; i++) arr[i].copy(pushers[i] ?? new THREE.Vector4(0, 0, 1, 0));
  }
}
