// Post-traitement : occlusion ambiante (N8AO), bloom, tone mapping AgX, étalonnage par région, SMAA.
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode, SMAAEffect, Effect, BlendFunction } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { QualityPreset } from './quality';

const gradeFrag = /* glsl */ `
uniform float saturation;
uniform float contrast;
uniform float warmth;
uniform float vignette;
uniform float exposure;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb * exposure;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.0 + saturation);
  c = (c - 0.5) * (1.0 + contrast) + 0.5;
  c *= vec3(1.0 + warmth * 0.06, 1.0 + warmth * 0.015, 1.0 - warmth * 0.07);
  float d = distance(uv, vec2(0.5));
  c *= 1.0 - smoothstep(0.45, 0.95, d) * vignette;
  outputColor = vec4(max(c, 0.0), inputColor.a);
}`;

export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', gradeFrag, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['saturation', new THREE.Uniform(0.1)],
        ['contrast', new THREE.Uniform(0.05)],
        ['warmth', new THREE.Uniform(0)],
        ['vignette', new THREE.Uniform(0.35)],
        ['exposure', new THREE.Uniform(1)],
      ]),
    });
  }
  set(key: 'saturation' | 'contrast' | 'warmth' | 'vignette' | 'exposure', v: number) {
    this.uniforms.get(key)!.value = v;
  }
  get(key: string) {
    return this.uniforms.get(key)!.value as number;
  }
}

export class PostFX {
  composer: EffectComposer;
  grade = new GradeEffect();
  ao: N8AOPostPass | null = null;
  bloom: BloomEffect | null = null;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, q: QualityPreset) {
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    this.composer.addPass(new RenderPass(scene, camera));
    const size = renderer.getSize(new THREE.Vector2());
    if (q.ao) {
      this.ao = new N8AOPostPass(scene, camera, size.x, size.y);
      const c = (this.ao as any).configuration;
      c.aoRadius = 2.5;
      c.distanceFalloff = 1.2;
      c.intensity = 2.2;
      c.halfRes = true;
      c.depthAwareUpsampling = true;
      c.gammaCorrection = false;
      (this.ao as any).setQualityMode?.('Low');
      this.composer.addPass(this.ao as any);
    }
    const effects: Effect[] = [];
    if (q.bloom) {
      this.bloom = new BloomEffect({ intensity: 0.9, luminanceThreshold: 0.85, luminanceSmoothing: 0.2, mipmapBlur: true, radius: 0.7 });
      effects.push(this.bloom);
    }
    effects.push(new ToneMappingEffect({ mode: ToneMappingMode.AGX }));
    effects.push(this.grade);
    if (q.smaa) effects.push(new SMAAEffect());
    this.composer.addPass(new EffectPass(camera, ...effects));
  }

  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
  }

  render(dt: number) {
    this.composer.render(dt);
  }
}
