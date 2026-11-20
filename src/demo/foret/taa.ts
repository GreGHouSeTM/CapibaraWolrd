// Passe « brume volumétrique + anti-crénelage temporel » de la zone « forêt ».
// Elle lit la profondeur de la scène mais n'écrit JAMAIS dans un tampon qui porte cette texture de profondeur :
// brume et historique TAA vivent dans des cibles privées, puis une simple copie (sans lecture de profondeur) remplit le
// tampon de sortie du composeur. C'est ce qui évite la boucle de rétroaction (erreur GL 1282) de la branche wip/hd-rendu.
import * as THREE from 'three';
import { Pass } from 'postprocessing';

const vert = /* glsl */ `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const fogFrag = (steps: number) => /* glsl */ `
#include <packing>
uniform sampler2D tColor, tDepth, tShadow;
uniform mat4 uCamWorld, uShadowMat; uniform vec2 uProjInv; uniform vec3 uCamPos;
uniform float uNear, uFar;
uniform vec3 uSunDir, uSunCol, uAmb, uLampPos, uLampCol;
uniform float uDens, uHeight, uBase, uTime, uFrame, uMaxD;
varying vec2 vUv;
float hh(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh(i), hh(i + vec2(1, 0)), u.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), u.x), u.y); }
float dens(vec3 p) {
  float n = vn(p.xz * 0.05 + vec2(uTime * 0.012, 0.0)) * 0.6 + vn(p.xz * 0.19 - vec2(0.0, uTime * 0.02) + p.y * 0.1) * 0.4;
  return uDens * exp(-max(p.y - uBase, 0.0) / uHeight) * (0.4 + 1.2 * n);
}
float sunVis(vec3 p) {
  vec4 sc = uShadowMat * vec4(p, 1.0);
  sc.xyz /= sc.w;
  if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
  return step(sc.z - 0.0015, unpackRGBAToDepth(texture2D(tShadow, sc.xy)));
}
void main() {
  vec4 col = texture2D(tColor, vUv);
  float depth = texture2D(tDepth, vUv).r;
  bool sky = depth >= 0.999999;
  float viewZ = sky ? -uMaxD : perspectiveDepthToViewZ(depth, uNear, uFar);
  vec3 vp = vec3((vUv * 2.0 - 1.0) * uProjInv * (-viewZ), viewZ);
  vec3 wp = (uCamWorld * vec4(vp, 1.0)).xyz;
  vec3 rv = wp - uCamPos;
  float L = min(length(rv), uMaxD);
  vec3 rd = rv / max(length(rv), 1e-4);
  float mu = dot(rd, uSunDir);
  float g = 0.6;
  float hg = (1.0 - g * g) / (12.566 * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  float j = fract(hh(gl_FragCoord.xy) + uFrame * 0.618034);
  vec3 scat = vec3(0.0); float T = 1.0; float t0 = 0.0;
  for (int i = 0; i < ${steps}; i++) {
    float s1 = float(i + 1) / float(${steps});
    float t1 = L * s1 * s1;
    vec3 p = uCamPos + rd * mix(t0, t1, j);
    float d = dens(p);
    vec3 lv = uLampPos - p;
    vec3 Li = uAmb + uSunCol * sunVis(p) * hg * 6.0 + uLampCol / (dot(lv, lv) + 0.25) * 0.08;
    float a = exp(-d * (t1 - t0));
    scat += T * (1.0 - a) * Li;
    T *= a;
    t0 = t1;
  }
  gl_FragColor = vec4(col.rgb * T + scat, col.a);
}`;

const taaFrag = /* glsl */ `
#include <packing>
uniform sampler2D tCur, tHist, tDepth;
uniform mat4 uCamWorld, uPrevVP; uniform vec2 uProjInv, uTexel; uniform float uNear, uFar, uReset;
varying vec2 vUv;
vec3 toY(vec3 c) { return vec3(dot(c, vec3(0.25, 0.5, 0.25)), dot(c, vec3(0.5, 0.0, -0.5)), dot(c, vec3(-0.25, 0.5, -0.25))); }
vec3 fromY(vec3 y) { return vec3(y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z); }
void main() {
  vec3 cur = texture2D(tCur, vUv).rgb;
  // voisinage 3×3 (espace YCoCg, couleurs compressées pour les hautes lumières)
  vec3 mn = vec3(1e9), mx = vec3(-1e9), m1 = vec3(0.0), m2 = vec3(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 c = toY(texture2D(tCur, vUv + vec2(x, y) * uTexel).rgb / (1.0 + max(texture2D(tCur, vUv + vec2(x, y) * uTexel).g, 0.0)));
    m1 += c; m2 += c * c;
  }
  m1 /= 9.0; vec3 sd = sqrt(max(m2 / 9.0 - m1 * m1, 0.0));
  mn = m1 - sd * 1.25; mx = m1 + sd * 1.25;
  float depth = texture2D(tDepth, vUv).r;
  float viewZ = depth >= 0.999999 ? -2000.0 : perspectiveDepthToViewZ(depth, uNear, uFar);
  vec3 vp = vec3((vUv * 2.0 - 1.0) * uProjInv * (-viewZ), viewZ);
  vec4 wp = uCamWorld * vec4(vp, 1.0);
  vec4 pc = uPrevVP * wp;
  vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
  vec3 res = cur;
  if (uReset < 0.5 && all(greaterThan(puv, vec2(0.0))) && all(lessThan(puv, vec2(1.0)))) {
    vec3 h = texture2D(tHist, puv).rgb;
    vec3 hy = toY(h / (1.0 + max(h.g, 0.0)));
    hy = clamp(hy, mn, mx);
    vec3 hc = fromY(hy); hc = hc / max(1.0 - hc.g, 1e-3);
    float vel = length((puv - vUv) / uTexel);
    float a = mix(0.1, 0.35, clamp(vel / 6.0, 0.0, 1.0));
    res = mix(hc, cur, a);
  }
  gl_FragColor = vec4(max(res, 0.0), 1.0);
}`;

const copyFrag = /* glsl */ `uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tSrc, vUv); }`;

const HALTON = Array.from({ length: 16 }, (_, i) => {
  const h = (b: number, n: number) => { let f = 1, r = 0; while (n > 0) { f /= b; r += f * (n % b); n = Math.floor(n / b); } return r; };
  return [h(2, i + 1) - 0.5, h(3, i + 1) - 0.5];
});

export class FogTAAPass extends Pass {
  fogMat: THREE.ShaderMaterial;
  taaMat: THREE.ShaderMaterial | null;
  copyMat: THREE.ShaderMaterial;
  private fogRT: THREE.WebGLRenderTarget;
  private hist: THREE.WebGLRenderTarget[] = [];
  private cur = 0;
  private prevVP = new THREE.Matrix4();
  private frameI = 0;
  private reset = true;
  private jx = 0; private jy = 0;
  private quad: THREE.Mesh;
  private qScene = new THREE.Scene();
  private qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private w = 1; private h = 1;

  constructor(private cam: THREE.PerspectiveCamera, steps: number, taa: boolean) {
    super('FogTAAPass');
    this.needsDepthTexture = true;
    this.needsSwap = true;
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.fogRT = new THREE.WebGLRenderTarget(1, 1, opts);
    this.fogMat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: fogFrag(Math.max(4, steps)), depthTest: false, depthWrite: false,
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, tShadow: { value: null }, uCamWorld: { value: new THREE.Matrix4() }, uShadowMat: { value: new THREE.Matrix4() },
        uProjInv: { value: new THREE.Vector2() }, uCamPos: { value: new THREE.Vector3() }, uNear: { value: 0.1 }, uFar: { value: 1000 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uAmb: { value: new THREE.Color() },
        uLampPos: { value: new THREE.Vector3() }, uLampCol: { value: new THREE.Color(0, 0, 0) },
        uDens: { value: 0.02 }, uHeight: { value: 8 }, uBase: { value: 4 }, uTime: { value: 0 }, uFrame: { value: 0 }, uMaxD: { value: 220 },
      },
    });
    this.taaMat = taa ? new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: taaFrag, depthTest: false, depthWrite: false,
      uniforms: { tCur: { value: null }, tHist: { value: null }, tDepth: { value: null }, uCamWorld: { value: new THREE.Matrix4() }, uPrevVP: { value: new THREE.Matrix4() },
        uProjInv: { value: new THREE.Vector2() }, uTexel: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 1000 }, uReset: { value: 1 } },
    }) : null;
    if (taa) this.hist = [new THREE.WebGLRenderTarget(1, 1, opts), new THREE.WebGLRenderTarget(1, 1, opts)];
    this.copyMat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: copyFrag, depthTest: false, depthWrite: false, uniforms: { tSrc: { value: null } } });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.fogMat);
    this.quad.frustumCulled = false;
    this.qScene.add(this.quad);
  }

  override setDepthTexture(t: THREE.Texture) {
    this.fogMat.uniforms.tDepth.value = t;
    if (this.taaMat) this.taaMat.uniforms.tDepth.value = t;
  }

  override setSize(w: number, h: number) {
    this.w = w; this.h = h;
    this.fogRT.setSize(w, h);
    for (const r of this.hist) r.setSize(w, h);
    if (this.taaMat) this.taaMat.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.reset = true;
  }

  /** Décalage sous-pixel de la projection (suite de Halton) avant le rendu de l'image. */
  jitter() {
    if (!this.taaMat) return;
    const [x, y] = HALTON[this.frameI % 16];
    this.jx = x * 2 / this.w; this.jy = y * 2 / this.h;
    const e = this.cam.projectionMatrix.elements;
    e[8] += this.jx; e[9] += this.jy;
    this.cam.projectionMatrixInverse.copy(this.cam.projectionMatrix).invert();
  }

  unjitter() {
    if (!this.taaMat) return;
    const e = this.cam.projectionMatrix.elements;
    e[8] -= this.jx; e[9] -= this.jy;
    this.cam.projectionMatrixInverse.copy(this.cam.projectionMatrix).invert();
    // matrice vue-projection (sans décalage) de cette image : sert à reprojeter l'historique à l'image suivante
    this.prevVP.multiplyMatrices(this.cam.projectionMatrix, this.cam.matrixWorldInverse);
  }

  resetHistory() { this.reset = true; }

  private draw(r: THREE.WebGLRenderer, m: THREE.Material, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = m;
    r.setRenderTarget(target);
    r.render(this.qScene, this.qCam);
  }

  override render(r: THREE.WebGLRenderer, input: THREE.WebGLRenderTarget, output: THREE.WebGLRenderTarget) {
    const c = this.cam, pe = c.projectionMatrix.elements;
    const fu = this.fogMat.uniforms;
    fu.tColor.value = input.texture;
    fu.uCamWorld.value.copy(c.matrixWorld);
    fu.uProjInv.value.set(1 / pe[0], 1 / pe[5]);
    fu.uCamPos.value.setFromMatrixPosition(c.matrixWorld);
    fu.uNear.value = c.near; fu.uFar.value = c.far;
    fu.uFrame.value = this.frameI % 64;
    this.draw(r, this.fogMat, this.fogRT);
    let result = this.fogRT;
    if (this.taaMat) {
      const tu = this.taaMat.uniforms;
      const prev = this.hist[this.cur], next = this.hist[1 - this.cur];
      tu.tCur.value = this.fogRT.texture;
      tu.tHist.value = prev.texture;
      tu.uCamWorld.value.copy(c.matrixWorld);
      tu.uProjInv.value.set(1 / pe[0], 1 / pe[5]);
      tu.uPrevVP.value.copy(this.prevVP);
      tu.uNear.value = c.near; tu.uFar.value = c.far;
      tu.uReset.value = this.reset ? 1 : 0;
      this.draw(r, this.taaMat, next);
      this.cur = 1 - this.cur;
      this.reset = false;
      result = next;
    }
    this.copyMat.uniforms.tSrc.value = result.texture;
    this.draw(r, this.copyMat, this.renderToScreen ? null : output);
    this.frameI++;
  }
}
