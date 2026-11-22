// Lumière de la zone « forêt » :
//  - occlusion du ciel par la canopée : carte de densité des houppiers (vue de dessus) qui atténue l'éclairage du ciel
//    (IBL diffus et spéculaire) sous les arbres selon la hauteur — sous-bois sombre, clairières plus claires ;
//  - ombres douces PCSS (recherche des bloqueurs + filtrage de Poisson) pour le soleil voilé ;
//  - post-traitement : occlusion ambiante N8AO, brume volumétrique (marche dans la carte d'ombre du soleil : rayons à
//    travers la canopée, halo de la lanterne), bloom, AgX, étalonnage, SMAA ou anti-crénelage temporel.
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode, SMAAEffect, Effect, BlendFunction } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import type { TreeInst } from './trees';
import type { ForetPreset } from './presets';
import { FogTAAPass } from './taa';

export const canopy = {
  tex: null as THREE.DataTexture | null,
  rect: new THREE.Vector4(-120, -125, 1 / 240, 1 / 240),
  strength: { value: 1.0 },
};

/** Carte de densité des houppiers (512² sur 240 m) : disques flous autour de chaque arbre adulte. */
export function buildCanopy(trees: TreeInst[]) {
  const N = 512, size = 240, x0 = -120, z0 = -125;
  const a = new Float32Array(N * N);
  for (const t of trees) {
    const young = t.v.startsWith('j');
    const r = (young ? 1.3 : 3.2) * t.s, k = young ? 0.25 : 0.55;
    const ci = (t.x - x0) / size * N, cj = (t.z - z0) / size * N, rr = r / size * N;
    for (let j = Math.floor(cj - rr); j <= cj + rr; j++) for (let i = Math.floor(ci - rr); i <= ci + rr; i++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const d = Math.hypot(i - ci, j - cj) / rr;
      if (d < 1) a[j * N + i] += k * (1 - d * d);
    }
  }
  // flou (la lumière diffuse passe entre les houppiers) puis saturation
  const b = new Float32Array(N * N);
  const R = 4;
  for (let pass = 0; pass < 2; pass++) {
    const src = pass ? b : a, dst = pass ? a : b;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let s = 0, c = 0;
      for (let d = -R; d <= R; d++) {
        const ii = pass ? i : Math.min(N - 1, Math.max(0, i + d)), jj = pass ? Math.min(N - 1, Math.max(0, j + d)) : j;
        s += src[jj * N + ii]; c++;
      }
      dst[j * N + i] = s / c;
    }
  }
  const data = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) data[i] = Math.min(255, Math.round(Math.min(1, a[i]) * 255));
  const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  canopy.tex = tex;
  canopy.rect.set(x0, z0, 1 / size, 1 / size);
  return tex;
}

/** Morceaux de shader globaux de la démo (la démo est une application à part : le monde principal n'est pas touché). */
export function installShaderChunks(q: ForetPreset) {
  const C = THREE.ShaderChunk as Record<string, string>;
  if ((C as any).__foret) return;
  (C as any).__foret = true;
  C.common = C.common + '\nvarying vec3 vCanW;\n';
  C.worldpos_vertex = C.worldpos_vertex + `
    #ifdef USE_INSTANCING
      vCanW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
    #else
      vCanW = (modelMatrix * vec4(transformed, 1.0)).xyz;
    #endif
  `;
  C.lights_pars_begin = C.lights_pars_begin + `
    uniform sampler2D tCanopy; uniform vec4 uCanRect; uniform float uCanStr;
    float canopyVis(vec3 p) {
      float d = texture2D(tCanopy, (p.xz - uCanRect.xy) * uCanRect.zw).r;
      // sous les houppiers (le sol est vers 0-30 m) : forte atténuation ; au-dessus de la canopée, ciel ouvert
      return mix(1.0, 0.16, d * uCanStr);
    }
  `;
  C.lights_fragment_maps = C.lights_fragment_maps + `
    {
      float cv = canopyVis(vCanW);
      iblIrradiance *= cv; irradiance *= mix(1.0, cv, 0.7); radiance *= cv;
    }
  `;
  // Ombres (three.js r18x : cartes d'ombre en textures de profondeur). La démo utilise BasicShadowMap (lecture brute de
  // la profondeur, sampler2D) pour pouvoir chercher les bloqueurs : PCSS pour le soleil voilé, filtrage de Vogel sinon ;
  // la lanterne (cube) reçoit un filtrage de Vogel à 12 lectures.
  const n = q.pcss;
  C.shadowmap_pars_fragment = C.shadowmap_pars_fragment.replace('#ifdef USE_SHADOWMAP', `#ifdef USE_SHADOWMAP
    #define PCSS_N ${Math.max(n, 8)}
    vec2 pcssDisk(int i, float ang) { float r = sqrt((float(i) + 0.5) / float(PCSS_N)); float a = float(i) * 2.39996 + ang; return vec2(cos(a), sin(a)) * r; }
    float foretIGN() { return fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853; }
    float pcss(sampler2D sm, vec2 texel, vec4 sc) {
      float ang = foretIGN();
      ${n > 0 ? `
      float light = 34.0;
      float sb = 0.0; float nb = 0.0;
      for (int i = 0; i < PCSS_N; i++) {
        vec2 o = pcssDisk(i, ang) * light * texel;
        float d = texture2D(sm, sc.xy + o).r;
        if (d < sc.z) { sb += d; nb += 1.0; }
      }
      if (nb < 0.5) return 1.0;
      float avg = sb / nb;
      float pen = clamp((sc.z - avg) / max(avg, 1e-3) * light * 2.5, 1.2, light);` : 'float pen = 1.6;'}
      float s = 0.0;
      for (int i = 0; i < PCSS_N; i++) {
        vec2 o = pcssDisk(i, ang + 1.7) * pen * texel;
        s += step(sc.z, texture2D(sm, sc.xy + o).r);
      }
      return s / float(PCSS_N);
    }`).replace('float depth = texture2D( shadowMap, shadowCoord.xy ).r;', `return mix( 1.0, pcss( shadowMap, 1.0 / shadowMapSize, shadowCoord ), shadowIntensity );
        float depth = texture2D( shadowMap, shadowCoord.xy ).r;`).replace(`float depth = textureCube( shadowMap, bd3D ).r;`, `float depth = 1.0;
      {
        // lanterne : 12 lectures sur un disque de Vogel autour de la direction (ombres douces)
        float ph = foretIGN();
        vec3 tg = normalize(cross(bd3D, abs(bd3D.x) > abs(bd3D.z) ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 bt = cross(bd3D, tg);
        float ts = 3.0 / shadowMapSize.x;
        float acc = 0.0;
        for (int k = 0; k < 12; k++) {
          float r = sqrt((float(k) + 0.5) / 12.0); float th = float(k) * 2.39996 + ph;
          vec3 dd = normalize(bd3D + (tg * cos(th) + bt * sin(th)) * r * ts);
          acc += step(dp, textureCube(shadowMap, dd).r);
        }
        return mix(1.0, acc / 12.0, shadowIntensity);
      }`);
  if (!C.shadowmap_pars_fragment.includes('pcss( shadowMap')) throw new Error('morceau d’ombres de three.js inattendu');
}

/** Uniformes de la canopée ajoutés aux matériaux éclairés de three.js (copiés à la compilation de chaque matériau). */
export function canopyUniforms() {
  for (const k of ['standard', 'physical', 'lambert', 'phong', 'toon']) {
    const lib = (THREE.ShaderLib as any)[k];
    if (!lib) continue;
    lib.uniforms.tCanopy = { value: canopy.tex };
    lib.uniforms.uCanRect = { value: canopy.rect };
    lib.uniforms.uCanStr = { value: 1.0 };
  }
}

export class ForetPost {
  composer: EffectComposer;
  fog: FogTAAPass;
  bloom: BloomEffect;
  ao: N8AOPostPass | null = null;
  grade: Effect;
  exposure = new THREE.Uniform(1);

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, q: ForetPreset) {
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    this.composer.addPass(new RenderPass(scene, camera));
    const size = renderer.getSize(new THREE.Vector2());
    if (q.ao !== 'off') {
      this.ao = new N8AOPostPass(scene, camera, size.x, size.y);
      const c = (this.ao as any).configuration;
      c.aoRadius = 1.6; c.distanceFalloff = 0.8; c.intensity = 2.6; c.color = new THREE.Color(0x0a0c08);
      c.halfRes = q.aoHalf; c.depthAwareUpsampling = true; c.gammaCorrection = false;
      (this.ao as any).setQualityMode?.(q.ao);
      this.composer.addPass(this.ao as any);
    }
    this.fog = new FogTAAPass(camera, q.fogSteps, q.taa);
    this.bloom = new BloomEffect({ intensity: 0.5, luminanceThreshold: 1.2, luminanceSmoothing: 0.4, mipmapBlur: true, radius: 0.7 });
    this.grade = new Effect('Grade', /* glsl */ `
      uniform float uExposure;
      void mainImage(const in vec4 c, const in vec2 uv, out vec4 o) {
        vec3 x = c.rgb;
        float l = dot(x, vec3(0.2126, 0.7152, 0.0722));
        x = mix(vec3(l), x, 1.06);
        x = (x - 0.5) * 1.12 + 0.5;
        x = pow(max(x, 0.0), vec3(1.06));
        x *= vec3(0.985, 1.0, 1.02);
        float v = distance(uv, vec2(0.5));
        x *= 1.0 - smoothstep(0.42, 0.95, v) * 0.35;
        o = vec4(x, c.a);
      }`, { blendFunction: BlendFunction.NORMAL, uniforms: new Map([['uExposure', this.exposure]]) });
    // brume (lit la profondeur) + anti-crénelage temporel, avant l'étalonnage ; cibles privées (pas de rétroaction)
    this.composer.addPass(this.fog);
    const fx: Effect[] = [];
    if (q.bloom) fx.push(this.bloom);
    const tm = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
    fx.push(tm, this.grade);
    if (!q.taa) fx.push(new SMAAEffect());
    this.composer.addPass(new EffectPass(camera, ...fx));
  }

  setSize(w: number, h: number) { this.composer.setSize(w, h); }

  render(dt: number) {
    this.fog.jitter();
    this.composer.render(dt);
    this.fog.unjitter();
  }
}
