// Eau globale (mer, lacs, étang aux koï) au niveau y = 0 (spécialité Eau).
// - Couleur et transparence selon la profondeur (grille fine de l'étang, relief global ailleurs), écume légère
//   qui lèche les rives, caustiques en eau peu profonde.
// - Étang : surface presque calme (rides de vent fines, ronds de koï et d'insectes qui s'élargissent).
// - Reflets : réflexion planaire (rendu miroir à demi-résolution) en qualité haute près de l'étang,
//   carte cubique locale mise à jour de temps en temps en qualité moyenne, ciel seul en basse.
// L'eau locale de la vallée (torrent, cascades, bains, rizières) est dans rivers.ts ; la flore aquatique
// et les koï dans procgen/flora/aquatic.ts.
import * as THREE from 'three';
import { getHeightTexture, heightAt } from './heightmap';
import { WORLD_SIZE, WATER_LEVEL } from './layout';
import { buildRivers, riverUniforms, Rivers, WATER_FX, waterDetailTexture } from './rivers';
import { POND } from './zones';
import { ATMO } from './sky';
import { PRESETS, QualityPreset } from '../core/quality';
import { buildAquatic, Aquatic } from '../procgen/flora/aquatic';

/** Boîte de la grille fine de profondeur autour de l'étang (m). */
const PB = { x0: POND.x - POND.rx * 1.35, z0: POND.z - POND.rz * 1.45, x1: POND.x + POND.rx * 1.35, z1: POND.z + POND.rz * 1.45, cell: 0.4 };

export class Water {
  mesh: THREE.Mesh;
  /** eau locale de la vallée (torrent, cascades, bassins), construite après le village */
  rivers: Rivers | null = null;
  aquatic: Aquatic | null = null;
  uniforms = {
    uTime: { value: 0 },
    uHeight: { value: null as THREE.Texture | null },
    uWorld: { value: WORLD_SIZE },
    uShallow: { value: new THREE.Color(0.2, 0.85, 0.78) },
    uDeep: { value: new THREE.Color(0.02, 0.2, 0.35) },
    uFoam: { value: 1 },
    uDet: riverUniforms.uDet,
    uPond: { value: null as THREE.Texture | null },
    uPondBox: { value: new THREE.Vector4(PB.x0, PB.z0, PB.x1 - PB.x0, PB.z1 - PB.z0) },
    uPondC: { value: new THREE.Vector4(POND.x, POND.z, POND.rx, POND.rz) },
    uPondShallow: { value: new THREE.Color(0.085, 0.2, 0.16) },
    uPondDeep: { value: new THREE.Color(0.012, 0.05, 0.052) },
    uRefl: { value: null as THREE.Texture | null },
    uReflW: { value: 0 },
    uReflMat: { value: new THREE.Matrix4() },
    uNight: { value: 0 },
  };
  private quality: QualityPreset | null = null;
  private refl: { rt: THREE.WebGLRenderTarget; cam: THREE.PerspectiveCamera; lastT: number } | null = null;
  private cube: { rt: THREE.WebGLCubeRenderTarget; cam: THREE.CubeCamera; hour: number; pos: THREE.Vector3; lastT: number } | null = null;

  constructor() {
    this.uniforms.uHeight.value = getHeightTexture();
    this.uniforms.uDet.value = waterDetailTexture();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.05,
      metalness: 0.0,
      transparent: true,
      envMapIntensity: 1.0,
    });
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec4 vReflUv; uniform mat4 uReflMat;')
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vReflUv = uReflMat * vec4(vWPos, 1.0);`);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vWPos; varying vec4 vReflUv;
          uniform float uTime, uWorld, uFoam, uReflW, uNight;
          uniform sampler2D uHeight, uDet, uPond, uRefl;
          uniform vec4 uPondBox, uPondC;
          uniform vec3 uShallow, uDeep, uPondShallow, uPondDeep;
          float wDepth, gFoamW, gPondW;
          vec3 gWN, gV;
          float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
          float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
            return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
          vec2 waveGrad(vec2 p, float t){
            vec2 g = vec2(0.0);
            // somme de vagues directionnelles (houle de la mer et des grands lacs)
            vec2 dirs[5]; dirs[0]=vec2(1.0,0.2); dirs[1]=vec2(-0.4,1.0); dirs[2]=vec2(0.7,-0.7); dirs[3]=vec2(-1.0,-0.3); dirs[4]=vec2(0.2,0.9);
            float fr[5]; fr[0]=0.21; fr[1]=0.37; fr[2]=0.63; fr[3]=1.1; fr[4]=1.9;
            for(int i=0;i<5;i++){
              vec2 d = normalize(dirs[i]);
              float ph = dot(d, p) * fr[i] + t * (1.2 + float(i) * 0.4);
              g += d * cos(ph) * (0.22 / (1.0 + float(i)));
            }
            g += (vec2(vn(p*1.7 + t*0.5), vn(p*1.7 - t*0.4 + 7.0)) - 0.5) * 0.5;
            return g;
          }
          // ronds dans l'eau : une cellule de 4 m = une source qui pulse de temps en temps
          vec2 rings(vec2 p, float t, float sc) {
            vec2 g = vec2(0.0);
            vec2 c = floor(p / sc);
            for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
              vec2 id = c + vec2(float(i), float(j));
              vec2 ctr = (id + vec2(h21(id), h21(id + 7.1))) * sc;
              float per = 5.0 + 9.0 * h21(id + 3.3);
              float age = mod(t + h21(id + 1.7) * per, per);
              vec2 d = p - ctr;
              float r = length(d);
              float front = age * 0.55;
              float env = exp(-age * 0.9) * smoothstep(front + 0.35, front, r) * smoothstep(front - 1.1, front - 0.2, r);
              g += d / max(r, 1e-3) * sin((r - front) * 18.0) * env * 0.9;
            }
            return g;
          }`,
        )
        .replace(
          '#include <map_fragment>',
          `
          vec2 huv = (vWPos.xz + uWorld*0.5) / uWorld;
          float ground = texture2D(uHeight, huv).r;
          // grille fine autour de l'étang
          vec2 puv = (vWPos.xz - uPondBox.xy) / uPondBox.zw;
          float inBox = step(0.0, puv.x) * step(puv.x, 1.0) * step(0.0, puv.y) * step(puv.y, 1.0);
          vec4 pd = texture2D(uPond, clamp(puv, 0.0, 1.0));
          wDepth = mix(max(0.0, -ground), pd.r * 4.0, inBox);
          float pe = length((vWPos.xz - uPondC.xy) / uPondC.zw);
          gPondW = inBox * smoothstep(1.35, 1.1, pe);
          vec3 V = normalize(cameraPosition - vWPos);
          float dist = length(vWPos - cameraPosition);
          float fade = 1.0 / (1.0 + dist * 0.01);
          // normales : houle (mer) ou rides fines + ronds (étang)
          vec2 g = waveGrad(vWPos.xz * 0.9, uTime) * fade * 0.55;
          vec2 q = vWPos.xz;
          vec4 d1 = texture2D(uDet, q * 0.11 + vec2(uTime * 0.012, uTime * 0.007));
          vec4 d2 = texture2D(uDet, q * 0.37 - vec2(uTime * 0.02, -uTime * 0.013));
          vec2 gp = ((d1.rg * 2.0 - 1.0) * 0.6 + (d2.rg * 2.0 - 1.0) * 0.4) * 0.12;
          gp += rings(q, uTime, 4.0) * 0.12 * smoothstep(1.0, 0.85, pe);
          g = mix(g, gp * (0.4 + 0.6 * fade), gPondW);
          gWN = normalize(vec3(-g.x, 1.0, -g.y));
          gV = V;
          vec3 sh = mix(uShallow, uPondShallow, gPondW), dp = mix(uDeep, uPondDeep, gPondW);
          float k = 1.0 - exp(-wDepth * mix(0.32, 0.85, gPondW));
          vec3 wcol = mix(sh, dp, k) * 0.85;
          // caustiques douces en eau peu profonde
          float ca = vn(vWPos.xz * 0.6 + uTime * 0.3) * vn(vWPos.xz * 0.9 - uTime * 0.25);
          wcol += sh * 1.4 * ca * smoothstep(2.5, 0.2, wDepth) * (1.0 - uNight) * mix(0.4, 0.7, gPondW);
          // écume légère qui lèche les rives (vagues plus fortes en mer)
          float lap = 0.5 + 0.5 * sin(uTime * 1.3 + vn(vWPos.xz * 0.4) * 9.0);
          float foamLine = smoothstep(mix(0.5, 0.12, gPondW), 0.0, wDepth) * lap;
          float foam = foamLine * smoothstep(0.45, 0.8, d2.b + foamLine * 0.3) * uFoam * mix(1.0, 0.6, gPondW);
          gFoamW = foam;
          wcol = mix(wcol, vec3(0.9), foam * 0.85);
          float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(gWN, V), 0.0, 1.0), 5.0);
          float alpha = mix(mix(0.62, 0.96, smoothstep(0.0, 6.0, wDepth)), 0.08 + 0.6 * k, gPondW);
          alpha = mix(alpha, 1.0, fres * 0.7 * gPondW);
          alpha *= mix(1.0, smoothstep(0.0, 0.1, wDepth), gPondW);
          diffuseColor.rgb = wcol;
          diffuseColor.a = alpha + foam * 0.3;
          `,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          normal = normalize((viewMatrix * vec4(gWN, 0.0)).xyz);`,
        )
        .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(roughness, 0.03, gPondW) + gFoamW * 0.6;`)
        .replace(
          '#include <lights_fragment_maps>',
          `#include <lights_fragment_maps>
          if (uReflW > 0.0) {
            // réflexion planaire (qualité haute) : remplace le ciel par le reflet de la scène, déformé par les rides
            vec4 ruv = vReflUv;
            ruv.xy += gWN.xz * 0.6 * ruv.w * 0.05;
            vec3 rc = texture2DProj(uRefl, ruv).rgb;
            radiance = mix(radiance, rc, uReflW * gPondW);
          }`,
        );
    };
    mat.customProgramCacheKey = () => 'water-v2';
    const geo = new THREE.PlaneGeometry(WORLD_SIZE * 2.5, WORLD_SIZE * 2.5, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = WATER_LEVEL;
    this.mesh.renderOrder = 1;
    this.mesh.receiveShadow = true;
    this.uniforms.uPond.value = bakePondDepth();
    this.mesh.onBeforeRender = (renderer, scene, camera) => this.reflections(renderer, scene, camera);
  }

  /**
   * Construit l'eau locale (torrent, cascades, bassins, rizières), la flore aquatique et les koï.
   * `village` : groupe de Capyville (rochers du lit pour l'écume) ; `q` : préréglage graphique (reflets).
   */
  buildLocal(scene: THREE.Scene, village?: THREE.Object3D, q?: QualityPreset) {
    this.quality = q ?? null;
    this.rivers = buildRivers(village);
    scene.add(this.rivers.group);
    this.aquatic = buildAquatic();
    scene.add(this.aquatic.group);
    return this.rivers;
  }

  update(time: number, shallow: THREE.Color, deep: THREE.Color, dt: number) {
    this.uniforms.uTime.value = time;
    this.uniforms.uNight.value = ATMO.night;
    this.rivers?.update(time, dt);
    this.aquatic?.update(time, dt);
    const k = 1 - Math.exp(-dt * 0.8);
    this.uniforms.uShallow.value.lerp(shallow, k);
    this.uniforms.uDeep.value.lerp(deep, k);
  }

  // ------------------------------------------------------------------------------------------- reflets
  private pondBox = new THREE.Box3(new THREE.Vector3(POND.x - POND.rx, -1, POND.z - POND.rz), new THREE.Vector3(POND.x + POND.rx, 1, POND.z + POND.rz));
  private frustum = new THREE.Frustum();
  private tmpM = new THREE.Matrix4();

  private reflections(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const q = this.quality;
    if (!q || scene.overrideMaterial || !(camera as THREE.PerspectiveCamera).isPerspectiveCamera) return;
    const t = this.uniforms.uTime.value;
    const cam = camera as THREE.PerspectiveCamera;
    const cp = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const near = Math.hypot(cp.x - POND.x, cp.z - POND.z) < 320 && cp.y < 160 && cp.y > WATER_LEVEL + 0.05;
    if (q === PRESETS.high) {
      this.frustum.setFromProjectionMatrix(this.tmpM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      const vis = near && this.frustum.intersectsBox(this.pondBox);
      this.uniforms.uReflW.value = vis ? 1 : 0;
      if (vis && this.refl?.lastT !== t) this.renderPlanar(renderer, scene, cam);
    } else if (q === PRESETS.medium) {
      this.updateCube(renderer, scene, cp, near);
    }
  }

  private renderPlanar(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(64, Math.round(size.x * 0.5)), h = Math.max(64, Math.round(size.y * 0.5));
    if (!this.refl) {
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0 });
      rt.texture.generateMipmaps = false;
      this.refl = { rt, cam: new THREE.PerspectiveCamera(), lastT: -1 };
      this.uniforms.uRefl.value = rt.texture;
    }
    const R = this.refl;
    if (R.rt.width !== w || R.rt.height !== h) R.rt.setSize(w, h);
    R.lastT = this.uniforms.uTime.value;
    // caméra virtuelle sous le plan y = WATER_LEVEL (même construction que Reflector de three : vraie rotation,
    // l'image n'est pas retournée, c'est la projection de la surface qui fait le miroir)
    const vc = R.cam;
    const nrm = new THREE.Vector3(0, 1, 0);
    const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const rp = new THREE.Vector3(camPos.x, WATER_LEVEL, camPos.z);
    const rot = new THREE.Matrix4().extractRotation(camera.matrixWorld);
    const view = rp.clone().sub(camPos).reflect(nrm).negate().add(rp);
    const lookAt = new THREE.Vector3(0, 0, -1).applyMatrix4(rot).add(camPos);
    const target = rp.clone().sub(lookAt).reflect(nrm).negate().add(rp);
    vc.position.copy(view);
    vc.up.set(0, 1, 0).applyMatrix4(rot).reflect(nrm);
    vc.lookAt(target);
    vc.near = camera.near;
    vc.far = camera.far;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);
    // plan de coupe oblique (on ne dessine que ce qui est au-dessus de l'eau)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -WATER_LEVEL).applyMatrix4(vc.matrixWorldInverse);
    const cpl = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const P = vc.projectionMatrix.elements;
    const qv = new THREE.Vector4((Math.sign(cpl.x) + P[8]) / P[0], (Math.sign(cpl.y) + P[9]) / P[5], -1, (1 + P[10]) / P[14]);
    cpl.multiplyScalar(2 / cpl.dot(qv));
    P[2] = cpl.x; P[6] = cpl.y; P[10] = cpl.z + 1 - 0.003; P[14] = cpl.w;
    vc.projectionMatrixInverse.copy(vc.projectionMatrix).invert();
    this.uniforms.uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    // l'eau elle-même et l'eau locale ne se reflètent pas
    const cur = renderer.getRenderTarget();
    const shadowAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    this.mesh.visible = false;
    const hidden = this.hideForReflection(scene);
    renderer.setRenderTarget(R.rt);
    renderer.state.buffers.depth.setMask(true);
    if (renderer.autoClear === false) renderer.clear();
    renderer.render(scene, vc);
    for (const o of hidden) o.visible = true;
    this.mesh.visible = true;
    renderer.shadowMap.autoUpdate = shadowAuto;
    renderer.setRenderTarget(cur);
    const vp = (camera as unknown as { viewport?: THREE.Vector4 }).viewport;
    if (vp) renderer.state.viewport(vp);
  }

  /** Objets non dessinés dans les reflets (eau locale, brume) : économie et pas de reflet de reflet. */
  private hideForReflection(_scene: THREE.Scene) {
    const out: THREE.Object3D[] = [];
    if (this.rivers?.group.visible) { this.rivers.group.visible = false; out.push(this.rivers.group); }
    return out;
  }

  private updateCube(renderer: THREE.WebGLRenderer, scene: THREE.Scene, cp: THREE.Vector3, nearPond: boolean) {
    const at = nearPond ? new THREE.Vector3(POND.x, WATER_LEVEL + 1.2, POND.z) : new THREE.Vector3(cp.x, WATER_LEVEL + 1.5, cp.z);
    if (!this.cube) {
      const rt = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: false });
      const cam = new THREE.CubeCamera(0.5, 2500, rt);
      this.cube = { rt, cam, hour: -99, pos: new THREE.Vector3(1e9, 0, 0), lastT: -1 };
      const mat = this.mesh.material as THREE.MeshStandardMaterial;
      mat.envMap = rt.texture;
      mat.needsUpdate = true;
    }
    const C = this.cube;
    const t = this.uniforms.uTime.value;
    let dh = Math.abs(ATMO.hour - C.hour);
    dh = Math.min(dh, 24 - dh);
    if (C.lastT === t || (dh < 0.35 && C.pos.distanceTo(at) < 60)) return;
    C.lastT = t;
    C.hour = ATMO.hour;
    C.pos.copy(at);
    C.cam.position.copy(at);
    const shadowAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    this.mesh.visible = false;
    const hidden = this.hideForReflection(scene);
    C.cam.update(renderer, scene);
    for (const o of hidden) o.visible = true;
    this.mesh.visible = true;
    renderer.shadowMap.autoUpdate = shadowAuto;
    C.rt.texture.needsPMREMUpdate = true;
  }
}

/** Grille de profondeur de l'étang (R = profondeur / 4 m), pas de 0,4 m. */
function bakePondDepth() {
  const nx = Math.ceil((PB.x1 - PB.x0) / PB.cell), nz = Math.ceil((PB.z1 - PB.z0) / PB.cell);
  const data = new Uint8Array(nx * nz * 4);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = PB.x0 + ((i + 0.5) / nx) * (PB.x1 - PB.x0), z = PB.z0 + ((j + 0.5) / nz) * (PB.z1 - PB.z0);
      const d = Math.max(0, WATER_LEVEL - heightAt(x, z));
      const k = (j * nx + i) * 4;
      data[k] = Math.round(Math.min(1, d / 4) * 255);
      data[k + 3] = 255;
    }
  const t = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

void WATER_FX;
