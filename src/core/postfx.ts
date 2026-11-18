// Post-traitement (spécialité Lumière & atmosphère) :
// occlusion ambiante (N8AO) → atmosphère (taches de lumière des lanternes, teinte directionnelle du brouillard, brume au sol
// qui suit le relief, rayons de soleil) → bloom → tone mapping ACES → étalonnage par moment (exposition, saturation,
// ombres bleutées / hautes lumières chaudes) → SMAA.
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode, SMAAEffect, Effect, EffectAttribute, BlendFunction } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { QualityPreset } from './quality';
import { damp } from './math';
import type { SkyState } from '../world/sky';
import type { NightLights } from '../fx/lights';
import { heightAt } from '../world/heightmap';
import { WORLD_SIZE } from '../world/layout';

// ================================================================================================ étalonnage
const gradeFrag = /* glsl */ `
uniform float saturation;
uniform float contrast;
uniform float warmth;
uniform float vignette;
uniform float exposure;
uniform vec3 shadowTint;
uniform vec3 highTint;
uniform vec3 lift;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb * exposure;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.0 + saturation);
  c = (c - 0.5) * (1.0 + contrast) + 0.5;
  c *= vec3(1.0 + warmth * 0.06, 1.0 + warmth * 0.015, 1.0 - warmth * 0.07);
  // ombres bleutées, hautes lumières chaudes ; relèvement des noirs la nuit (lisibilité)
  float k = smoothstep(0.02, 0.55, l);
  c *= mix(shadowTint, highTint, k);
  c += lift * (1.0 - smoothstep(0.0, 0.35, l));
  float d = distance(uv, vec2(0.5));
  c *= 1.0 - smoothstep(0.45, 0.95, d) * vignette;
  outputColor = vec4(max(c, 0.0), inputColor.a);
}`;

type GradeKey = 'saturation' | 'contrast' | 'warmth' | 'vignette' | 'exposure';
export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', gradeFrag, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['saturation', new THREE.Uniform(0.1)],
        ['contrast', new THREE.Uniform(0.05)],
        ['warmth', new THREE.Uniform(0)],
        ['vignette', new THREE.Uniform(0.3)],
        ['exposure', new THREE.Uniform(1)],
        ['shadowTint', new THREE.Uniform(new THREE.Vector3(1, 1, 1))],
        ['highTint', new THREE.Uniform(new THREE.Vector3(1, 1, 1))],
        ['lift', new THREE.Uniform(new THREE.Vector3(0, 0, 0))],
      ]),
    });
  }
  set(key: GradeKey, v: number) {
    this.uniforms.get(key)!.value = v;
  }
  get(key: string) {
    return this.uniforms.get(key)!.value as number;
  }
  vec(key: 'shadowTint' | 'highTint' | 'lift') {
    return this.uniforms.get(key)!.value as THREE.Vector3;
  }
}

// ================================================================================================ atmosphère
const atmoFrag = /* glsl */ `
uniform mat4 uCamWorld;
uniform vec2 uProjInv;
uniform vec3 uCamPos, uSunDir, uSunCol, uFogBase, uFogSun, uFogAnti, uMistCol, uMistSun, uAmbient;
uniform float uFogDensity, uMistDensity, uMistHeight, uMistCeil, uClock, uRayStrength;
uniform sampler2D uFloor;
uniform vec4 uFloorRect;
uniform sampler2D uRays;
uniform sampler2D uPools;

float ah21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float avn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(ah21(i), ah21(i+vec2(1,0)), u.x), mix(ah21(i+vec2(0,1)), ah21(i+vec2(1,1)), u.x), u.y); }
float mistDensity(vec3 p){
  float f = texture2D(uFloor, (p.xz - uFloorRect.xy) * uFloorRect.z).r;
  float n = avn(p.xz * 0.011 + vec2(uClock * 0.018, uClock * 0.007)) * 0.65 + avn(p.xz * 0.04 - vec2(uClock * 0.03, -uClock * 0.01)) * 0.35;
  float d = uMistDensity * exp(-max(p.y - f, 0.0) / uMistHeight) * mix(0.25, 1.7, n);
  return d * (1.0 - smoothstep(uMistCeil - 25.0, uMistCeil + 25.0, p.y));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  bool sky = depth >= 0.999999;
  float viewZ = sky ? -1500.0 : getViewZ(depth);
  vec3 vp = vec3((uv * 2.0 - 1.0) * uProjInv * (-viewZ), viewZ);
  vec3 wp = (uCamWorld * vec4(vp, 1.0)).xyz;
  vec3 rv = wp - uCamPos;
  float dist = length(rv);
  vec3 rd = rv / max(dist, 1e-3);
  float mu = dot(rd, uSunDir);
  float fwd = max(mu, 0.0);

#ifdef USE_POOLS
  // taches de lumière : E (éclairement des lanternes) × albédo estimé (couleur / éclairement ambiant)
  if (!sky) {
    vec3 E = texture2D(uPools, uv).rgb;
    vec3 albPi = min(c / max(uAmbient, vec3(0.003)), vec3(0.3183));
    c += albPi * E + E * 0.0015;
  }
#endif

  // brouillard de distance : les matériaux l'ont appliqué avec une couleur unique ; on le teinte selon la direction
  // (doré vers le soleil, bleu-gris à l'opposé : les montagnes se fondent comme sur ref-4)
  if (!sky) {
    float fz = uFogDensity * (-viewZ);
    float f = 1.0 - exp(-fz * fz);
    vec3 dirCol = mix(uFogAnti, uFogSun, pow(mu * 0.5 + 0.5, 4.0));
    c = max(c + f * (dirCol - uFogBase), vec3(0.0));
  }

  // brume au sol : dense au fond de la vallée (texture du relief lissé), s'éclaircit en montant
  float L = min(dist, 1400.0);
  float tau = 0.0;
#if MIST_STEPS > 0
  float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  for (int i = 0; i < MIST_STEPS; i++) {
    float s0 = float(i) / float(MIST_STEPS), s1 = float(i + 1) / float(MIST_STEPS);
    float t0 = L * s0 * s0, t1 = L * s1 * s1;
    tau += mistDensity(uCamPos + rd * mix(t0, t1, j)) * (t1 - t0);
  }
#else
  {
    float b = 1.0 / uMistHeight;
    float a = uMistDensity * exp(-max(uCamPos.y - 5.0, 0.0) * b);
    float k = rd.y * b;
    tau = abs(k) > 1e-4 ? a * (1.0 - exp(-L * k)) / k : a * L;
  }
#endif
  float T = exp(-tau);
  vec3 mcol = uMistCol + uMistSun * (pow(fwd, 8.0) * 1.3 + pow(fwd, 2.0) * 0.25);
  c = c * T + mcol * (1.0 - T);

#ifdef USE_RAYS
  float rays = texture2D(uRays, uv).r;
  c += uSunCol * rays * uRayStrength * (0.45 + 0.9 * (1.0 - T));
#endif
  outputColor = vec4(c, inputColor.a);
}`;

const quadVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Rayons en espace écran : marche vers le soleil dans le masque du ciel (les silhouettes des arbres et des crêtes le découpent)
const raysFrag = (n: number) => /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 uSunUV;
uniform float uAspect;
varying vec2 vUv;
void main(){
  vec2 dl = uSunUV - vUv;
  vec2 stp = dl / ${n}.0;
  float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec2 p = vUv + stp * j;
  float acc = 0.0, w = 1.0;
  for (int i = 0; i < ${n}; i++) {
    vec2 q = clamp(p, 0.001, 0.999);
    float s = step(0.999999, texture2D(tDepth, q).r);
    float g = exp(-length((p - uSunUV) * vec2(uAspect, 1.0)) * 2.6);
    acc += s * g * w;
    w *= 0.965;
    p += stp;
  }
  gl_FragColor = vec4(acc / ${n}.0 * 2.2, 0.0, 0.0, 1.0);
}`;

// Volumes éclairants des lanternes : cube englobant par instance, position reconstruite depuis la profondeur,
// normale reconstruite par dérivées, atténuation identique à celle des PointLights de three.js.
const poolVert = /* glsl */ `
attribute vec4 aPosR;
attribute vec3 aColor;
varying vec4 vPosR;
varying vec3 vColor;
void main(){
  vPosR = aPosR;
  vColor = aColor;
  vec3 wp = aPosR.xyz + position * aPosR.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const poolFrag = /* glsl */ `
#include <packing>
uniform sampler2D tDepth;
uniform vec2 uInvRes;
uniform mat4 uCamWorld;
uniform vec2 uProjInv;
uniform float uNear, uFar;
varying vec4 vPosR;
varying vec3 vColor;
void main(){
  vec2 uv = gl_FragCoord.xy * uInvRes;
  float depth = texture2D(tDepth, uv).r;
  if (depth >= 0.999999) discard;
  float viewZ = perspectiveDepthToViewZ(depth, uNear, uFar);
  vec3 vp = vec3((uv * 2.0 - 1.0) * uProjInv * (-viewZ), viewZ);
  vec3 wp = (uCamWorld * vec4(vp, 1.0)).xyz;
  vec3 L = vPosR.xyz - wp;
  float d = length(L);
  if (d > vPosR.w) discard;
  vec3 n = normalize(cross(dFdx(wp), dFdy(wp)));
  if (dot(n, cameraPosition - wp) < 0.0) n = -n;
  float ndl = max(dot(n, L / max(d, 1e-3)), 0.0) * 0.8 + 0.2;
  float x = d / vPosR.w;
  float att = 1.0 / max(d * d, 0.25) * pow(clamp(1.0 - x * x * x * x, 0.0, 1.0), 2.0);
  gl_FragColor = vec4(vColor * ndl * att, 1.0);
}`;

/** Texture du « fond de vallée » : relief filtré au minimum puis lissé ; la brume s'y accumule et suit le relief. */
export const MIST_FLOOR_RES = 256;
export const mistFloor = new Float32Array(MIST_FLOOR_RES * MIST_FLOOR_RES);
function buildMistFloor() {
  const N = MIST_FLOOR_RES, cell = WORLD_SIZE / N, half = WORLD_SIZE / 2;
  const raw = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) raw[j * N + i] = heightAt(-half + (i + 0.5) * cell, -half + (j + 0.5) * cell);
  // érosion (minimum sur ~38 m) : la brume remplit les creux
  const R = 3, tmp = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let m = Infinity;
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      const ii = Math.min(N - 1, Math.max(0, i + di)), jj = Math.min(N - 1, Math.max(0, j + dj));
      m = Math.min(m, raw[jj * N + ii]);
    }
    tmp[j * N + i] = Math.max(m, 0);
  }
  // lissage (boîte 5 × 5)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let s = 0, c = 0;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
      s += tmp[jj * N + ii]; c++;
    }
    mistFloor[j * N + i] = s / c;
  }
  const tex = new THREE.DataTexture(mistFloor, N, N, THREE.RedFormat, THREE.FloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
/** Altitude du fond de brume en (x, z) (CPU, pour les particules ou l'audio). */
export function mistFloorAt(x: number, z: number) {
  const N = MIST_FLOOR_RES, cell = WORLD_SIZE / N, half = WORLD_SIZE / 2;
  const i = Math.min(N - 1, Math.max(0, Math.floor((x + half) / cell))), j = Math.min(N - 1, Math.max(0, Math.floor((z + half) / cell)));
  return mistFloor[j * N + i];
}

export class AtmosphereEffect extends Effect {
  private depthTex: THREE.Texture | null = null;
  private raysRT: THREE.WebGLRenderTarget | null = null;
  private poolRT: THREE.WebGLRenderTarget | null = null;
  private raysMat: THREE.ShaderMaterial | null = null;
  private poolMat: THREE.ShaderMaterial | null = null;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private poolScene = new THREE.Scene();
  private poolGeo: THREE.InstancedBufferGeometry | null = null;
  private poolMesh: THREE.Mesh | null = null;
  private size = new THREE.Vector2(1, 1);
  private clearCol = new THREE.Color();
  private tmpV = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  lights: NightLights | null = null;
  rayStrength = 0;

  constructor(private camera: THREE.PerspectiveCamera, private q: QualityPreset) {
    const defines = new Map<string, string>([['MIST_STEPS', String(q.fogSteps)]]);
    if (q.godRays > 0) defines.set('USE_RAYS', '1');
    if (q.lightPools > 0) defines.set('USE_POOLS', '1');
    super('AtmosphereEffect', atmoFrag, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH,
      defines,
      uniforms: new Map<string, THREE.Uniform>([
        ['uCamWorld', new THREE.Uniform(new THREE.Matrix4())],
        ['uProjInv', new THREE.Uniform(new THREE.Vector2(1, 1))],
        ['uCamPos', new THREE.Uniform(new THREE.Vector3())],
        ['uSunDir', new THREE.Uniform(new THREE.Vector3(0, 1, 0))],
        ['uSunCol', new THREE.Uniform(new THREE.Color())],
        ['uFogBase', new THREE.Uniform(new THREE.Color())],
        ['uFogSun', new THREE.Uniform(new THREE.Color())],
        ['uFogAnti', new THREE.Uniform(new THREE.Color())],
        ['uMistCol', new THREE.Uniform(new THREE.Color())],
        ['uMistSun', new THREE.Uniform(new THREE.Color())],
        ['uAmbient', new THREE.Uniform(new THREE.Color(0.1, 0.1, 0.1))],
        ['uFogDensity', new THREE.Uniform(0.002)],
        ['uMistDensity', new THREE.Uniform(0)],
        ['uMistHeight', new THREE.Uniform(7)],
        ['uMistCeil', new THREE.Uniform(70)],
        ['uClock', new THREE.Uniform(0)],
        ['uRayStrength', new THREE.Uniform(0)],
        ['uFloor', new THREE.Uniform(null)],
        ['uFloorRect', new THREE.Uniform(new THREE.Vector4(-WORLD_SIZE / 2, -WORLD_SIZE / 2, 1 / WORLD_SIZE, 0))],
        ['uRays', new THREE.Uniform(null)],
        ['uPools', new THREE.Uniform(null)],
      ]),
    });
    this.uniforms.get('uFloor')!.value = q.fogSteps > 0 ? buildMistFloor() : new THREE.DataTexture(new Float32Array([5]), 1, 1, THREE.RedFormat, THREE.FloatType);
    if (q.fogSteps === 0) (this.uniforms.get('uFloor')!.value as THREE.Texture).needsUpdate = true;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    if (q.godRays > 0) {
      this.raysRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
      this.raysMat = new THREE.ShaderMaterial({
        vertexShader: quadVert, fragmentShader: raysFrag(q.godRays), depthTest: false, depthWrite: false,
        uniforms: { tDepth: { value: null }, uSunUV: { value: new THREE.Vector2() }, uAspect: { value: 1 } },
      });
      this.uniforms.get('uRays')!.value = this.raysRT.texture;
    }
    if (q.lightPools > 0) {
      this.poolRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
      this.poolMat = new THREE.ShaderMaterial({
        vertexShader: poolVert, fragmentShader: poolFrag, side: THREE.BackSide, depthTest: false, depthWrite: false,
        transparent: true, blending: THREE.AdditiveBlending,
        uniforms: {
          tDepth: { value: null }, uInvRes: { value: new THREE.Vector2() }, uCamWorld: { value: new THREE.Matrix4() },
          uProjInv: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 1000 },
        },
      });
      this.uniforms.get('uPools')!.value = this.poolRT.texture;
    }
  }

  /** Branche le gestionnaire des lumières de nuit (taches de lumière). */
  attachLights(l: NightLights) {
    this.lights = l;
    if (!this.poolMat || l.maxPools === 0) return;
    const box = new THREE.BoxGeometry(2, 2, 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = box.index;
    g.setAttribute('position', box.getAttribute('position'));
    g.setAttribute('aPosR', new THREE.InstancedBufferAttribute(l.poolPosR, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.InstancedBufferAttribute(l.poolColor, 3).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    this.poolGeo = g;
    this.poolMesh = new THREE.Mesh(g, this.poolMat);
    this.poolMesh.frustumCulled = false;
    this.poolScene.add(this.poolMesh);
  }

  override setDepthTexture(depthTexture: THREE.Texture) {
    this.depthTex = depthTexture;
    if (this.raysMat) this.raysMat.uniforms.tDepth.value = depthTexture;
    if (this.poolMat) this.poolMat.uniforms.tDepth.value = depthTexture;
  }

  override setSize(width: number, height: number) {
    this.size.set(width, height);
    this.raysRT?.setSize(Math.max(1, Math.round(width / 2)), Math.max(1, Math.round(height / 2)));
    const ps = this.q.lightPools;
    this.poolRT?.setSize(Math.max(1, Math.round(width * ps)), Math.max(1, Math.round(height * ps)));
    if (this.poolMat && this.poolRT) this.poolMat.uniforms.uInvRes.value.set(1 / this.poolRT.width, 1 / this.poolRT.height);
  }

  /** Recopie l'état atmosphérique (appelé chaque image depuis PostFX.updateAtmosphere). */
  setState(st: SkyState, fogColor: THREE.Color, fogDensity: number, ambient: THREE.Color, clock: number) {
    const u = this.uniforms;
    (u.get('uSunDir')!.value as THREE.Vector3).copy(st.sunDir);
    (u.get('uSunCol')!.value as THREE.Color).copy(st.sunColor).multiplyScalar(Math.min(1, st.sunIntensity / 2.2) * (1 - st.night));
    (u.get('uFogBase')!.value as THREE.Color).copy(fogColor);
    (u.get('uFogSun')!.value as THREE.Color).copy(st.fogSun);
    (u.get('uFogAnti')!.value as THREE.Color).copy(st.fogAnti);
    (u.get('uMistCol')!.value as THREE.Color).copy(st.mistColor);
    (u.get('uMistSun')!.value as THREE.Color).copy(st.sunColor).multiplyScalar(0.5 * Math.min(1, st.sunIntensity / 2.2) * (1 - st.night));
    (u.get('uAmbient')!.value as THREE.Color).copy(ambient);
    u.get('uFogDensity')!.value = fogDensity;
    u.get('uMistDensity')!.value = st.mistDensity;
    u.get('uMistHeight')!.value = st.mistHeight;
    u.get('uClock')!.value = clock;
    u.get('uRayStrength')!.value = this.rayStrength * st.rays;
  }

  override update(renderer: THREE.WebGLRenderer, _inputBuffer: THREE.WebGLRenderTarget, _dt?: number) {
    const cam = this.camera;
    const u = this.uniforms;
    const pe = cam.projectionMatrix.elements;
    (u.get('uCamWorld')!.value as THREE.Matrix4).copy(cam.matrixWorld);
    (u.get('uProjInv')!.value as THREE.Vector2).set(1 / pe[0], 1 / pe[5]);
    (u.get('uCamPos')!.value as THREE.Vector3).setFromMatrixPosition(cam.matrixWorld);
    if (!this.depthTex) return;
    const prevRT = renderer.getRenderTarget();
    renderer.getClearColor(this.clearCol);
    const prevAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);

    // rayons : seulement si le soleil est devant la caméra
    if (this.raysMat && this.raysRT) {
      const sun = u.get('uSunDir')!.value as THREE.Vector3;
      cam.getWorldDirection(this.fwd);
      const facing = THREE.MathUtils.smoothstep(this.fwd.dot(sun), 0.0, 0.45);
      const strength = (u.get('uRayStrength')!.value as number) * facing;
      renderer.setRenderTarget(this.raysRT);
      renderer.clear(true, false, false);
      if (strength > 0.002) {
        this.tmpV.copy(cam.position).addScaledVector(sun, 1000).project(cam);
        this.raysMat.uniforms.uSunUV.value.set(this.tmpV.x * 0.5 + 0.5, this.tmpV.y * 0.5 + 0.5);
        this.raysMat.uniforms.uAspect.value = cam.aspect;
        this.quad.material = this.raysMat;
        renderer.render(this.quadScene, this.quadCam);
      }
      u.get('uRayStrength')!.value = strength;
    }
    // taches de lumière des lanternes
    if (this.poolMat && this.poolRT) {
      renderer.setRenderTarget(this.poolRT);
      renderer.clear(true, false, false);
      const l = this.lights;
      if (l && this.poolGeo && l.poolCount > 0) {
        (this.poolGeo.getAttribute('aPosR') as THREE.InstancedBufferAttribute).needsUpdate = true;
        (this.poolGeo.getAttribute('aColor') as THREE.InstancedBufferAttribute).needsUpdate = true;
        this.poolGeo.instanceCount = l.poolCount;
        const pu = this.poolMat.uniforms;
        pu.uCamWorld.value.copy(cam.matrixWorld);
        pu.uProjInv.value.set(1 / pe[0], 1 / pe[5]);
        pu.uNear.value = cam.near;
        pu.uFar.value = cam.far;
        renderer.render(this.poolScene, cam);
      }
    }
    renderer.setClearColor(this.clearCol, prevAlpha);
    renderer.setRenderTarget(prevRT);
  }
}

// ================================================================================================ chaîne complète
export class PostFX {
  composer: EffectComposer;
  grade = new GradeEffect();
  atmosphere: AtmosphereEffect;
  ao: N8AOPostPass | null = null;
  bloom: BloomEffect | null = null;
  private ambient = new THREE.Color();
  private tmp = new THREE.Color();

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private q: QualityPreset) {
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    this.composer.addPass(new RenderPass(scene, camera));
    const size = renderer.getSize(new THREE.Vector2());
    if (q.ao) {
      this.ao = new N8AOPostPass(scene, camera, size.x, size.y);
      const c = (this.ao as any).configuration;
      c.aoRadius = 2.0;
      c.distanceFalloff = 1.0;
      c.intensity = 1.8;
      c.color = new THREE.Color(0x10141f);
      c.halfRes = q.aoMode !== 'High';
      c.depthAwareUpsampling = true;
      c.gammaCorrection = false;
      (this.ao as any).setQualityMode?.(q.aoMode);
      this.composer.addPass(this.ao as any);
    }
    this.atmosphere = new AtmosphereEffect(camera, q);
    const effects: Effect[] = [this.atmosphere];
    if (q.bloom) {
      this.bloom = new BloomEffect({ intensity: 0.4, luminanceThreshold: 2, luminanceSmoothing: 0.35, mipmapBlur: true, radius: 0.62 });
      effects.push(this.bloom);
    }
    effects.push(new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }));
    effects.push(this.grade);
    if (q.smaa) effects.push(new SMAAEffect());
    this.composer.addPass(new EffectPass(camera, ...effects));
  }

  attachLights(l: NightLights) {
    this.atmosphere.attachLights(l);
  }

  /**
   * Met à jour l'atmosphère et l'étalonnage selon le moment de la journée (et un peu la région).
   * @param fog brouillard des matériaux (déjà mis à jour par SkySystem.applyFog)
   * @param hemi lumière hémisphérique et environnement : servent à estimer l'éclairement ambiant (taches de lumière)
   */
  updateAtmosphere(dt: number, time: number, st: SkyState, fog: THREE.FogExp2, reg: { saturation: number; contrast: number; warmth: number; id: string }, hemi: THREE.HemisphereLight, envIntensity: number) {
    // éclairement ambiant approximatif (hémisphère + environnement + lumière directionnelle moyenne)
    const amb = this.ambient.copy(hemi.color).multiplyScalar(hemi.intensity * 0.8)
      .add(this.tmp.copy(hemi.groundColor).multiplyScalar(hemi.intensity * 0.2))
      .add(this.tmp.copy(st.zenith).lerp(st.horizon, 0.5).multiplyScalar(envIntensity * Math.PI * 0.7))
      .add(this.tmp.copy(st.sunColor).multiplyScalar(st.sunIntensity * 0.25));
    this.atmosphere.rayStrength = this.q.godRays > 0 ? 0.9 : 0;
    this.atmosphere.setState(st, fog.color, fog.density, amb, time);
    // étalonnage : palette du moment, mêlée à la personnalité de la région hors de Capyville
    const g = this.grade;
    const rmix = reg.id === 'hub' ? 0 : 0.5;
    const k = 1.5;
    g.set('exposure', damp(g.get('exposure'), st.exposure, k, dt));
    g.set('saturation', damp(g.get('saturation'), st.saturation * (1 - rmix) + reg.saturation * rmix, k, dt));
    g.set('contrast', damp(g.get('contrast'), st.contrast * (1 - rmix) + reg.contrast * rmix, k, dt));
    g.set('warmth', damp(g.get('warmth'), st.warmth * (1 - rmix) + reg.warmth * rmix, k, dt));
    const golden = st.dusk * (1 - st.night);
    g.vec('shadowTint').set(1 - 0.05 * golden - 0.03 * st.night, 1 - 0.02 * golden, 1 + 0.07 * golden + 0.06 * st.night);
    g.vec('highTint').set(1 + 0.05 * golden, 1 + 0.01 * golden, 1 - 0.06 * golden);
    g.vec('lift').set(0.008, 0.013, 0.03).multiplyScalar(st.night);
    if (this.bloom) {
      (this.bloom as any).luminanceMaterial.threshold = st.bloomThreshold;
      this.bloom.intensity = st.bloomIntensity;
    }
  }

  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
  }

  render(dt: number) {
    this.composer.render(dt);
  }
}
