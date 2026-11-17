// Ciel procédural (dégradé atmosphérique, soleil, nuages, étoiles, aurores) et cycle jour/nuit.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/math';

const skyVert = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const skyFrag = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uZenith, uHorizon, uGround, uSunColor;
uniform float uTime, uNight, uAurora, uCloudCover;
varying vec3 vDir;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for(int i=0;i<5;i++){ s += a*vnoise(p); p = p*2.03 + 17.1; a *= 0.5; }
  return s;
}

void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  float sunDot = max(dot(d, uSunDir), 0.0);
  // dégradé du ciel
  float t = pow(clamp(h, 0.0, 1.0), 0.45);
  vec3 col = mix(uHorizon, uZenith, t);
  // halo du soleil (diffusion de Mie)
  col += uSunColor * (pow(sunDot, 8.0) * 0.35 + pow(sunDot, 64.0) * 0.6) * (1.0 - uNight);
  // disque solaire
  col += uSunColor * smoothstep(0.9993, 0.9997, sunDot) * 12.0 * (1.0 - uNight);
  // sous l'horizon
  col = mix(col, uGround, smoothstep(0.0, -0.08, h));

  // étoiles
  if (uNight > 0.01 && h > 0.0) {
    vec2 sp = d.xz / (d.y + 0.25) * 220.0;
    float st = step(0.996, hash(floor(sp))) * (0.5 + 0.5 * sin(uTime * 3.0 + hash(floor(sp)) * 50.0));
    col += vec3(st) * uNight * smoothstep(0.0, 0.25, h);
    // lune
    vec3 moonDir = -uSunDir;
    float md = dot(d, moonDir);
    col += vec3(0.9, 0.95, 1.0) * smoothstep(0.9990, 0.9994, md) * 2.0 * uNight;
    col += vec3(0.25, 0.3, 0.45) * pow(max(md,0.0), 30.0) * 0.4 * uNight;
  }

  // aurores boréales
  if (uAurora > 0.01 && h > 0.0) {
    vec2 ap = d.xz / (d.y + 0.3);
    float band = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float w = sin(ap.x * (2.0 + fi) + uTime * (0.15 + fi * 0.05) + fbm(ap * 1.5 + fi) * 3.0) * 0.5 + 0.5;
      band += smoothstep(0.08, 0.0, abs(ap.y - 0.4 - fi * 0.25 - w * 0.35)) * (0.6 - fi * 0.15);
    }
    vec3 ac = mix(vec3(0.1, 1.0, 0.5), vec3(0.5, 0.2, 1.0), smoothstep(0.3, 1.2, ap.y));
    col += ac * band * uAurora * smoothstep(0.02, 0.2, h) * 1.4;
  }

  // nuages (couche plane projetée)
  if (h > 0.0) {
    vec2 cp = d.xz / (d.y + 0.12) * 1.3 + vec2(uTime * 0.004, uTime * 0.0015);
    float c = fbm(cp);
    float cov = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.35, c);
    float shade = fbm(cp + uSunDir.xz * 0.08);
    vec3 cloudLit = mix(uHorizon * 1.1, vec3(1.0), 0.6) * (1.0 - uNight * 0.85);
    vec3 cloudCol = mix(cloudLit, cloudLit * 0.62, clamp((shade - c) * 4.0 + 0.4, 0.0, 1.0));
    cloudCol += uSunColor * pow(sunDot, 6.0) * 0.5 * (1.0 - uNight);
    col = mix(col, cloudCol, cov * smoothstep(0.0, 0.18, h) * 0.92);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export interface SkyState {
  hour: number;
  sunDir: THREE.Vector3;
  night: number; // 0 jour … 1 nuit
  dusk: number;
  horizon: THREE.Color;
}

export class SkySystem {
  mesh: THREE.Mesh;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  uniforms: Record<string, THREE.IUniform>;
  hour = 9.5;
  daySpeed = 24 / (16 * 60); // une journée = 16 minutes
  state: SkyState;
  private envScene = new THREE.Scene();
  private envMesh: THREE.Mesh;
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private envTimer = 999;
  private lastEnvHour = -10;
  aurora = 0;

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene) {
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uTime: { value: 0 },
      uNight: { value: 0 },
      uAurora: { value: 0 },
      uCloudCover: { value: 0.45 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
    this.mesh.scale.setScalar(2000);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    scene.add(this.mesh);

    this.envMesh = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat);
    this.envScene.add(this.envMesh);
    this.pmrem = new THREE.PMREMGenerator(renderer);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd7ff, 0x6b5a3a, 0.25);
    scene.add(this.hemi);
    this.state = { hour: this.hour, sunDir: new THREE.Vector3(), night: 0, dusk: 0, horizon: new THREE.Color() };
  }

  setShadowQuality(size: number, extent: number) {
    this.sun.shadow.mapSize.set(size, size);
    const c = this.sun.shadow.camera;
    c.left = -extent; c.right = extent; c.top = extent; c.bottom = -extent;
    c.near = 1; c.far = 600;
    c.updateProjectionMatrix();
    this.sun.shadow.map?.dispose();
    (this.sun.shadow as any).map = null;
    this.shadowExtent = extent;
  }
  private shadowExtent = 80;

  update(dt: number, time: number, focus: THREE.Vector3, auroraTarget: number) {
    this.hour = (this.hour + dt * this.daySpeed) % 24;
    const h = this.hour;
    // trajectoire du soleil
    const dayT = (h - 6) / 12; // 0 lever, 1 coucher
    const elev = Math.sin(dayT * Math.PI) * 1.15; // rad
    const az = lerp(-1.9, 1.9, dayT);
    const sunDir = this.state.sunDir.set(Math.sin(az) * Math.cos(elev), Math.sin(elev), Math.cos(az) * Math.cos(elev) * 0.6 - 0.4).normalize();
    const e = sunDir.y;
    const night = smoothstep(0.02, -0.18, e);
    const dusk = smoothstep(0.35, 0.02, Math.abs(e)) * (1 - night * 0.6);
    this.state.night = night;
    this.state.dusk = dusk;
    this.state.hour = h;

    const zenDay = new THREE.Color(0.18, 0.42, 0.85);
    const horDay = new THREE.Color(0.68, 0.82, 0.95);
    const zenDusk = new THREE.Color(0.2, 0.25, 0.5);
    const horDusk = new THREE.Color(1.0, 0.55, 0.3);
    const zenNight = new THREE.Color(0.025, 0.04, 0.11);
    const horNight = new THREE.Color(0.09, 0.12, 0.22);
    const zen = zenDay.clone().lerp(zenDusk, dusk).lerp(zenNight, night);
    const hor = horDay.clone().lerp(horDusk, dusk).lerp(horNight, night);
    const u = this.uniforms;
    (u.uZenith.value as THREE.Color).copy(zen);
    (u.uHorizon.value as THREE.Color).copy(hor);
    (u.uGround.value as THREE.Color).copy(hor).multiplyScalar(0.5);
    const sunCol = new THREE.Color(1.0, 0.96, 0.88).lerp(new THREE.Color(1.0, 0.55, 0.25), dusk);
    (u.uSunColor.value as THREE.Color).copy(sunCol);
    (u.uSunDir.value as THREE.Vector3).copy(sunDir);
    u.uTime.value = time;
    u.uNight.value = night;
    this.aurora = lerp(this.aurora, auroraTarget, 1 - Math.exp(-dt * 0.5));
    u.uAurora.value = this.aurora * (0.35 + night * 0.65);
    this.state.horizon.copy(hor);

    // Lumière du soleil (ou de la lune la nuit)
    const lightDir = night > 0.5 ? sunDir.clone().negate() : sunDir;
    this.sun.color.copy(night > 0.5 ? new THREE.Color(0.55, 0.65, 1.0) : sunCol);
    this.sun.intensity = night > 0.5 ? 1.1 * smoothstep(0.5, 1, night) : 3.2 * smoothstep(-0.05, 0.25, e) * (1 - night);
    // ombres stabilisées : on aligne la position sur la grille des texels
    const ext = this.shadowExtent;
    const texel = (ext * 2) / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + lightDir.x * 300, focus.y + Math.max(0.15, lightDir.y) * 300, fz + lightDir.z * 300);
    this.hemi.intensity = lerp(0.35, 0.32, night);
    this.hemi.color.copy(zen).lerp(new THREE.Color(1, 1, 1), 0.4);

    this.mesh.position.copy(focus);

    // Carte d'environnement (éclairage indirect et reflets) régénérée de temps en temps
    this.envTimer += dt;
    if (this.envTimer > 3 && Math.abs(this.hour - this.lastEnvHour) > 0.15) {
      this.envTimer = 0;
      this.lastEnvHour = this.hour;
      const old = this.envRT;
      this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 500);
      this.scene.environment = this.envRT.texture;
      old?.dispose();
    }
    this.scene.environmentIntensity = lerp(1.0, 0.6, night);
  }

  forceEnvUpdate() {
    this.envTimer = 999;
    this.lastEnvHour = -10;
  }
}
