// Catalogue des essences de Capyville : fichiers .glb (tools/blender/flora/trees.py), textures, vent, LOD, ombres.
// Chargement GLTF, préparation des géométries et cuisson des imposteurs (8 vues autour de l'axe vertical).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { floraDepthMaterial, floraMaterial, fruitMaterial, propMaterial, WindOpts } from './materials';

export type FloraSpecies =
  | 'sugi' | 'sugi-geant' | 'matsu' | 'momiji' | 'keyaki' | 'sakura' | 'shidare' | 'ichou' | 'yuzu' | 'take'
  | 'tsutsuji' | 'fern' | 'susuki' | 'ine' | 'hana' | 'misc';

export interface SpeciesDef {
  file: string;
  /** nom de base des textures d'écorce (public/assets/models/flora/tex/<bark>_bark.jpg) */
  bark?: string;
  barkTint?: number;
  /** répétition verticale de l'écorce (bambou : texture de chaume) */
  barkTex?: string;
  leaf: string;
  leafTint?: number;
  wind: WindOpts;
  trans?: number;
  /** distances : fin du LOD0, fin du LOD1, fin de l'imposteur (0 = pas d'imposteur, caché après le LOD1) */
  lod: [number, number, number];
  shadow: 0 | 1 | 2; // 0 aucune, 1 LOD0 seulement, 2 LOD0 et LOD1
  /** rayon de collision du tronc à l'échelle 1 (0 = traversable) */
  trunk: number;
  /** hauteur nominale du modèle (m) */
  height: number;
  /** capacité des InstancedMesh par variante : [LOD0, LOD1] */
  cap?: [number, number];
}

/** Bible §11 : LOD0 < 40 m, LOD1 < 120 m ; imposteurs jusqu'à 1 100 m (la brume fond les montagnes au loin). */
const L = [40, 120, 1100] as [number, number, number];
export const SPECIES: Record<FloraSpecies, SpeciesDef> = {
  sugi: { file: 'sugi', bark: 'sugi', leaf: 'sugi', wind: { height: 24, flex: 0.35, branch: 0.14, flutter: 0.03 }, trans: 0.3, lod: [35, 130, 1100], shadow: 1, trunk: 0.45, height: 24 },
  'sugi-geant': { file: 'sugi-geant', bark: 'sugi', leaf: 'sugi', wind: { height: 34, flex: 0.3, branch: 0.12, flutter: 0.03 }, trans: 0.3, lod: [70, 200, 700], shadow: 2, trunk: 1.6, height: 34 },
  matsu: { file: 'matsu', bark: 'matsu', leaf: 'matsu', wind: { height: 10, flex: 0.18, branch: 0.1, flutter: 0.025 }, trans: 0.3, lod: L, shadow: 1, trunk: 0.3, height: 10.5 },
  momiji: { file: 'momiji', bark: 'momiji', barkTint: 0x9a9088, leaf: 'momiji', wind: { height: 8.5, flex: 0.2, branch: 0.16, flutter: 0.05 }, trans: 0.75, lod: L, shadow: 1, trunk: 0.25, height: 8.5 },
  keyaki: { file: 'keyaki', bark: 'momiji', barkTint: 0x8a8478, leaf: 'keyaki', wind: { height: 12, flex: 0.25, branch: 0.16, flutter: 0.05 }, trans: 0.7, lod: L, shadow: 1, trunk: 0.4, height: 12 },
  sakura: { file: 'sakura', bark: 'sakura', leaf: 'sakura', wind: { height: 8.5, flex: 0.15, branch: 0.14, flutter: 0.04 }, trans: 0.6, lod: L, shadow: 1, trunk: 0.35, height: 8.5 },
  shidare: { file: 'shidare', bark: 'sakura', leaf: 'sakura', wind: { height: 13, flex: 0.12, branch: 0.32, flutter: 0.05, flutterFreq: 3.5 }, trans: 0.6, lod: [60, 180, 650], shadow: 2, trunk: 0.7, height: 13 },
  ichou: { file: 'ichou', bark: 'momiji', barkTint: 0x8a8070, leaf: 'ichou', wind: { height: 14, flex: 0.22, branch: 0.12, flutter: 0.06 }, trans: 0.7, lod: L, shadow: 1, trunk: 0.42, height: 14 },
  yuzu: { file: 'yuzu', bark: 'momiji', barkTint: 0x8c8a78, leaf: 'yuzu', wind: { height: 3.6, flex: 0.06, branch: 0.06, flutter: 0.03 }, trans: 0.35, lod: [35, 110, 400], shadow: 2, trunk: 0.1, height: 3.6 },
  take: { file: 'take', barkTex: 'take_culm', leaf: 'take', wind: { height: 12, flex: 0.55, branch: 0.12, flutter: 0.06, flutterFreq: 8 }, trans: 0.7, lod: [40, 110, 450], shadow: 2, trunk: 0.55, height: 12 },
  tsutsuji: { file: 'tsutsuji', bark: 'momiji', leaf: 'tsutsuji', wind: { height: 1.4, flex: 0.03, branch: 0.03, flutter: 0.025 }, trans: 0.4, lod: [22, 60, 0], shadow: 1, trunk: 0, height: 1.4 },
  fern: { file: 'fern', leaf: 'fern', wind: { height: 0.7, flex: 0.04, branch: 0, flutter: 0.05, flutterFreq: 4 }, trans: 0.6, lod: [14, 38, 0], shadow: 0, trunk: 0, height: 0.7, cap: [3000, 10000] },
  susuki: { file: 'susuki', leaf: 'susuki', wind: { height: 1.4, flex: 0.22, branch: 0, flutter: 0.07, flutterFreq: 3.2 }, trans: 0.8, lod: [30, 90, 0], shadow: 0, trunk: 0, height: 1.4, cap: [6000, 12000] },
  ine: { file: 'ine', leaf: 'ine', wind: { height: 0.75, flex: 0.08, branch: 0, flutter: 0.03, flutterFreq: 3 }, trans: 0.5, lod: [30, 140, 0], shadow: 0, trunk: 0, height: 0.75, cap: [20000, 40000] },
  hana: { file: 'hana', leaf: 'hana', wind: { height: 0.35, flex: 0.05, branch: 0, flutter: 0.03, flutterFreq: 3.5 }, trans: 0.4, lod: [18, 45, 0], shadow: 0, trunk: 0, height: 0.35, cap: [8000, 20000] },
  misc: { file: 'misc', bark: 'sugi', barkTint: 0x8a8a78, leaf: 'sugi', wind: { height: 1, flex: 0, branch: 0, flutter: 0 }, lod: [30, 80, 0], shadow: 1, trunk: 0.35, height: 1 },
};

export interface Parts {
  bark?: THREE.BufferGeometry;
  leaf?: THREE.BufferGeometry;
  fruit?: THREE.BufferGeometry;
  prop?: THREE.BufferGeometry;
}
export interface SpeciesModel {
  id: FloraSpecies;
  def: SpeciesDef;
  variants: { lod: [Parts, Parts]; box: THREE.Box3 }[];
  mats: { bark?: THREE.Material; leaf: THREE.Material; fruit?: THREE.Material; prop?: THREE.Material; barkDepth?: THREE.Material; leafDepth: THREE.Material };
  imposter?: { tex: THREE.Texture; size: number; y0: number; rows: number; material: THREE.Material; geometry: THREE.BufferGeometry };
}

const BASE = 'assets/models/flora/';
const texCache = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();
export function floraTex(name: string, srgb = true, repeat = false) {
  const key = name + srgb + repeat;
  let t = texCache.get(key);
  if (t) return t;
  t = loader.load(BASE + 'tex/' + name);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  t.flipY = false; // convention glTF (UV des modèles Blender)
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texCache.set(key, t);
  return t;
}

function prepGeometry(g: THREE.BufferGeometry, keepColor: boolean) {
  const c = g.getAttribute('color');
  if (c && !keepColor) {
    // COLOR_0 → aWind (vec3)
    const arr = new Float32Array(c.count * 3);
    for (let i = 0; i < c.count; i++) { arr[i * 3] = c.getX(i); arr[i * 3 + 1] = c.getY(i); arr[i * 3 + 2] = c.getZ(i); }
    g.setAttribute('aWind', new THREE.BufferAttribute(arr, 3));
    g.deleteAttribute('color');
  }
  if (!g.getAttribute('aWind') && !keepColor) g.setAttribute('aWind', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3));
  g.computeBoundingSphere();
  return g;
}

const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const models = new Map<FloraSpecies, SpeciesModel>();
export const getSpecies = (id: FloraSpecies) => models.get(id);

export async function loadSpecies(ids: FloraSpecies[]) {
  await Promise.all(ids.map(async (id) => {
    if (models.has(id)) return;
    const def = SPECIES[id];
    const res = await gltf.loadAsync(BASE + def.file + '.glb');
    const variants: SpeciesModel['variants'] = [];
    res.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mt = /^v(\d+)_lod(\d)_(\w+)$/.exec(m.name);
      if (!mt) return;
      const k = +mt[1], lod = +mt[2], part = mt[3] as keyof Parts;
      while (variants.length <= k) variants.push({ lod: [{}, {}], box: new THREE.Box3() });
      const g = prepGeometry(m.geometry, part === 'prop');
      variants[k].lod[lod][part] = g;
      if (lod === 0) { g.computeBoundingBox(); variants[k].box.union(g.boundingBox!); }
    });
    const leafMap = floraTex(def.leaf + '_leaf.webp');
    let barkMap: THREE.Texture | undefined, barkNor: THREE.Texture | undefined;
    if (def.bark) { barkMap = floraTex(def.bark + '_bark.jpg', true, true); barkNor = floraTex(def.bark + '_barknor.jpg', false, true); }
    else if (def.barkTex) barkMap = floraTex(def.barkTex + '.webp', true, true);
    const mats: SpeciesModel['mats'] = {
      leaf: floraMaterial({ ...def.wind, name: id + '-leaf', map: leafMap, leaf: true, trans: def.trans, color: def.leafTint }),
      leafDepth: floraDepthMaterial({ ...def.wind, map: leafMap, leaf: true }),
    };
    if (barkMap) {
      mats.bark = floraMaterial({ ...def.wind, name: id + '-bark', map: barkMap, normalMap: barkNor, color: def.barkTint });
      mats.barkDepth = floraDepthMaterial({ ...def.wind });
    }
    mats.fruit = fruitMaterial(def.wind);
    mats.prop = propMaterial();
    models.set(id, { id, def, variants, mats });
  }));
}

// =============================================================================================== IMPOSTEURS
const FRAMES = 8;
const FRAME_PX = 192;

const bakeVert = /* glsl */ `
attribute vec3 aWind;
varying vec2 vUv; varying float vAo; varying vec3 vN;
void main(){ vUv = uv; vAo = aWind.b; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const bakeFrag = /* glsl */ `
uniform sampler2D map; uniform float alphaTest; uniform vec3 tint;
varying vec2 vUv; varying float vAo; varying vec3 vN;
void main(){
  vec4 t = texture2D(map, vUv);
  if (t.a < alphaTest) discard;
  float l = 0.78 + 0.22 * clamp(vN.y * 0.5 + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(t.rgb * tint * vAo * l, 1.0);
}`;

/** Cuit l'atlas d'imposteurs d'une essence (8 vues × variantes) avec le moteur de rendu du jeu. */
export function bakeImposter(renderer: THREE.WebGLRenderer, sp: SpeciesModel) {
  if (sp.imposter || !sp.def.lod[2]) return;
  const rows = sp.variants.length;
  const rt = new THREE.WebGLRenderTarget(FRAMES * FRAME_PX, rows * FRAME_PX, { depthBuffer: true, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const scene = new THREE.Scene();
  const mk = (map: THREE.Texture, alpha: number, tint: THREE.ColorRepresentation | undefined) =>
    new THREE.ShaderMaterial({ uniforms: { map: { value: map }, alphaTest: { value: alpha }, tint: { value: new THREE.Color(tint ?? 0xffffff) } }, vertexShader: bakeVert, fragmentShader: bakeFrag, side: THREE.DoubleSide });
  const leafMat = mk((sp.mats.leaf as THREE.MeshStandardMaterial).map!, 0.5, sp.def.leafTint);
  const barkMat = sp.mats.bark ? mk((sp.mats.bark as THREE.MeshStandardMaterial).map!, 0, sp.def.barkTint) : null;
  // taille commune du cadre : la plus grande variante
  let size = 0, y0 = 0;
  for (const v of sp.variants) {
    const b = v.box;
    const rxz = Math.max(Math.abs(b.min.x), Math.abs(b.max.x), Math.abs(b.min.z), Math.abs(b.max.z));
    const h = b.max.y - Math.min(0, b.min.y);
    if (Math.max(2 * rxz, h) * 1.04 > size) size = Math.max(2 * rxz, h) * 1.04;
  }
  const hMax = Math.max(...sp.variants.map((v) => v.box.max.y));
  // la base du cadre est au pied (y0 = 0) si l'arbre est plus haut que large ; sinon centrée sur le houppier
  y0 = Math.min(0, hMax / 2 - size / 2 + size * 0.0);
  y0 = hMax >= size * 0.96 ? 0 : Math.max(hMax - size, -size * 0.5);
  const cam = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0.1, size * 4);
  const prevRT = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevAuto = renderer.autoClear;
  const prevShadow = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = false;
  renderer.setRenderTarget(rt);
  // fond = teinte moyenne du feuillage, alpha nul : pas de liseré sombre au filtrage
  renderer.setClearColor(new THREE.Color(0.18, 0.24, 0.14), 0);
  renderer.autoClear = false;
  renderer.clear(true, true, true);
  for (let r = 0; r < rows; r++) {
    const v = sp.variants[r];
    scene.clear();
    const p = v.lod[0];
    if (p.bark && barkMat) scene.add(new THREE.Mesh(p.bark, barkMat));
    if (p.leaf) scene.add(new THREE.Mesh(p.leaf, leafMat));
    if (p.fruit) scene.add(new THREE.Mesh(p.fruit, new THREE.MeshBasicMaterial({ color: 0xe8b020 })));
    for (let k = 0; k < FRAMES; k++) {
      const a = (k / FRAMES) * Math.PI * 2;
      const cy = y0 + size / 2;
      cam.position.set(Math.sin(a) * size * 2, cy, Math.cos(a) * size * 2);
      cam.lookAt(0, cy, 0);
      cam.updateMatrixWorld();
      rt.viewport.set(k * FRAME_PX, r * FRAME_PX, FRAME_PX, FRAME_PX);
      rt.scissor.set(k * FRAME_PX, r * FRAME_PX, FRAME_PX, FRAME_PX);
      rt.scissorTest = true;
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
    }
  }
  rt.scissorTest = false;
  renderer.setRenderTarget(prevRT);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.autoClear = prevAuto;
  renderer.shadowMap.enabled = prevShadow;
  leafMat.dispose();
  barkMat?.dispose();
  const geometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  sp.imposter = { tex: rt.texture, size, y0, rows, geometry, material: imposterMaterial(rt.texture, size, y0, rows) };
}

function imposterMaterial(tex: THREE.Texture, size: number, y0: number, rows: number) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  const u = { uImp: { value: new THREE.Vector4(size, y0, rows, FRAMES) }, uImpTex: { value: tex } };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uImp;\nattribute float aImpRow;\nvarying vec2 vImpUv;\nvarying vec2 vImpQ;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          mat3 iR = mat3(instanceMatrix);
          vec3 iT = instanceMatrix[3].xyz;
          float iS2 = dot(iR[0], iR[0]);
          float iS = sqrt(iS2);
          vec3 to = cameraPosition - iT; to.y = 0.0;
          to = normalize(to + vec3(1e-4, 0.0, 0.0));
          vec3 right = vec3(to.z, 0.0, -to.x);
          // au loin, les houppiers s'élargissent un peu : la canopée se referme comme sur une vraie forêt
          float iW = 1.0 + 0.35 * smoothstep(150.0, 700.0, length(cameraPosition - iT));
          vec3 wp = iT + right * (position.x * uImp.x * iS * iW) + vec3(0.0, (position.y * uImp.x + uImp.y) * iS, 0.0);
          transformed = (transpose(iR) * (wp - iT)) / iS2;
          float yaw = atan(iR[2].x, iR[2].z);
          float la = atan(to.x, to.z) - yaw;
          float fr = mod(floor(la / (6.2831853 / uImp.w) + 0.5), uImp.w);
          vImpUv = vec2((fr + uv.x) / uImp.w, (aImpRow + uv.y) / uImp.z);
          vImpQ = position.xy;
        }`,
      )
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  objectNormal = vec3(0.0, 1.0, 0.0);');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uImpTex;\nvarying vec2 vImpUv;\nvarying vec2 vImpQ;')
      .replace('#include <map_fragment>', 'vec4 impT = texture2D(uImpTex, vImpUv);\n  if (impT.a < 0.5) discard;\n  diffuseColor.rgb *= impT.rgb;')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vec3(vImpQ.x * 1.1, (vImpQ.y - 0.5) * 0.7 + 0.25, 0.7));');
  };
  m.customProgramCacheKey = () => 'flora-imposter';
  return m;
}
