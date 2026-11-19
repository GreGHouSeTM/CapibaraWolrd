// Terrain en clipmaps géométriques sur GPU (spécialité Terrain & relief), méthode CDLOD :
// - un seul maillage (carreau de 32 × 32 mailles) instancié sur les nœuds d'un arbre quaternaire choisis chaque image
//   autour de la caméra : 0,5 m par maille aux pieds, puis 1, 2, 4… jusqu'à 128 m à l'horizon ;
// - la hauteur est lue dans le vertex shader (TERRAIN_HEIGHT_GLSL : tuiles de 2 m + grille de 0,5 m de Capyville),
//   exactement comme heightAt côté processeur (physique, placement) ;
// - pas de fissures : à l'approche de la limite de son niveau, chaque sommet « glisse » (morphing) vers la grille
//   du niveau suivant, qui est celle du voisin plus grossier ;
// - normales par pixel depuis la texture de hauteur ; un appel de dessin pour toute l'île (plus un par cascade d'ombre).
// Matériau : 9 couches PBR (herbe, herbe rase, sous-bois, terre, galets, roche moussue, roche, sable, neige) dans deux
// tableaux de textures, mélangées par hauteur ; roche en projection triplanaire sur les pentes ; masques lus dans les
// cartes dérivées (écoulement, humidité, dépôts, roche) et la carte des biomes (sable, neige, sol sec, mousse),
// fondus de biome de 300 à 600 m (bible du monde §4-5). Vallée de Capyville : couches fines d'origine (valley.ts).
// Textures : Poly Haven (CC0) — public/assets/tex/ et public/assets/tex/terrain/.
import * as THREE from 'three';
import { TERRAIN_HEIGHT_GLSL, getBiomeTexture, getDetailSplatTexture, getSurfaceTexture, terrainHeightUniforms } from './heightmap';
import { terrainData } from './terrain-data';
import { DETAIL } from './valley';
import { IMG } from '../core/assets';
import { beforeRender } from '../procgen/village/lod';

// ------------------------------------------------------------------------------------------- arbre quaternaire
const G = 32; // mailles par côté de carreau
const LEAF = 16; // côté d'un nœud du niveau 0 (0,5 m par maille)
const LEVELS = 10; // 16 m … 8 192 m
const ORIGIN = -4096;
/** Portée de chaque niveau (m) : distance caméra-nœud jusqu'à laquelle ce niveau suffit. */
const RANGE = Array.from({ length: LEVELS }, (_, k) => 64 * 2 ** k);
RANGE[LEVELS - 1] = 1e7;
const MORPH_START = RANGE.map((r, k) => { const p = k === 0 ? 0 : RANGE[k - 1]; return p + (r - p) * 0.62; });

/** Hauteurs min / max par nœud (pyramide), pour les tests de portée. */
class MinMax {
  mn: Float32Array[] = [];
  mx: Float32Array[] = [];
  n: number[] = [];
  constructor() {
    const td = terrainData!;
    const H = td.meta.height;
    const per = LEAF / H.cell; // échantillons par nœud feuille
    let n = H.n / per;
    const mn = new Float32Array(n * n).fill(Infinity), mx = new Float32Array(n * n).fill(-Infinity);
    for (let j = 0; j < H.n; j++) {
      const nj = Math.min(n - 1, Math.floor(j / per));
      for (let i = 0; i < H.n; i++) {
        const v = td.height[j * H.n + i];
        const k = nj * n + Math.min(n - 1, Math.floor(i / per));
        if (v < mn[k]) mn[k] = v;
        if (v > mx[k]) mx[k] = v;
      }
    }
    this.mn.push(mn); this.mx.push(mx); this.n.push(n);
    while (n > 1) {
      const m = n / 2, a = this.mn[this.mn.length - 1], b = this.mx[this.mx.length - 1];
      const mn2 = new Float32Array(m * m), mx2 = new Float32Array(m * m);
      for (let j = 0; j < m; j++)
        for (let i = 0; i < m; i++) {
          const q0 = 2 * j * n + 2 * i, q1 = q0 + 1, q2 = q0 + n, q3 = q2 + 1;
          mn2[j * m + i] = Math.min(a[q0], a[q1], a[q2], a[q3]);
          mx2[j * m + i] = Math.max(b[q0], b[q1], b[q2], b[q3]);
        }
      this.mn.push(mn2); this.mx.push(mx2); this.n.push(m);
      n = m;
    }
  }
  get(level: number, i: number, j: number): [number, number] {
    const k = j * this.n[level] + i;
    return [this.mn[level][k] - 2, this.mx[level][k] + 2];
  }
}

export interface TerrainStats { nodes: number; triangles: number }

export class TerrainClipmap {
  mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private attr: THREE.InstancedBufferAttribute;
  private data: Float32Array;
  private mm: MinMax;
  private count = 0;
  private cam = new THREE.Vector3();
  readonly uniforms = { uMorphCam: { value: new THREE.Vector3() } };
  stats: TerrainStats = { nodes: 0, triangles: 0 };
  private max = 4096;

  constructor(material: THREE.Material, depth: THREE.Material) {
    this.mm = new MinMax();
    const base = new THREE.PlaneGeometry(1, 1, G, G);
    base.rotateX(-Math.PI / 2);
    base.translate(0.5, 0, 0.5); // coordonnées locales 0..1 (x, z)
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.getAttribute('position'));
    this.data = new Float32Array(this.max * 4);
    this.attr = new THREE.InstancedBufferAttribute(this.data, 4);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aNode', this.attr);
    this.geo.instanceCount = 0;
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.mesh.customDepthMaterial = depth;
    this.mesh.name = 'terrain-clipmap';
  }

  /** Choix des nœuds pour la caméra (une fois par image, avant le rendu). */
  update(camera: THREE.Camera) {
    camera.getWorldPosition(this.cam);
    this.uniforms.uMorphCam.value.copy(this.cam);
    this.count = 0;
    this.select(0, 0, LEVELS - 1);
    this.geo.instanceCount = this.count;
    this.attr.clearUpdateRanges();
    this.attr.addUpdateRange(0, this.count * 4);
    this.attr.needsUpdate = true;
    this.stats.nodes = this.count;
    this.stats.triangles = this.count * G * G * 2;
  }

  /** Distance de la caméra à la boîte du nœud (i, j) du niveau `level`. */
  private dist(level: number, i: number, j: number) {
    const size = LEAF * 2 ** level;
    const x0 = ORIGIN + i * size, z0 = ORIGIN + j * size;
    const [y0, y1] = this.mm.get(level, i, j);
    const c = this.cam;
    const dx = Math.max(x0 - c.x, 0, c.x - (x0 + size));
    const dz = Math.max(z0 - c.z, 0, c.z - (z0 + size));
    const dy = Math.max(y0 - c.y, 0, c.y - y1);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private push(level: number, i: number, j: number, drawLevel: number) {
    if (this.count >= this.max) return;
    const size = LEAF * 2 ** level;
    const o = this.count++ * 4;
    this.data[o] = ORIGIN + i * size;
    this.data[o + 1] = ORIGIN + j * size;
    this.data[o + 2] = size;
    this.data[o + 3] = drawLevel;
  }

  private select(i: number, j: number, level: number): boolean {
    if (level < LEVELS - 1 && this.dist(level, i, j) > RANGE[level]) return false;
    if (level === 0) { this.push(0, i, j, 0); return true; }
    if (this.dist(level, i, j) > RANGE[level - 1]) { this.push(level, i, j, level); return true; }
    for (let q = 0; q < 4; q++) {
      const ci = 2 * i + (q & 1), cj = 2 * j + (q >> 1);
      if (!this.select(ci, cj, level - 1)) this.push(level - 1, ci, cj, level); // quart dessiné au niveau du parent
    }
    return true;
  }
}

// ------------------------------------------------------------------------------------------- shaders
/** Code de sommet commun (rendu et ombres) : position du carreau, morphing CDLOD, hauteur. */
const VERT_PARS = /* glsl */ `
attribute vec4 aNode;
uniform vec3 uMorphCam;
uniform float uRange[${LEVELS}];
uniform float uMorphStart[${LEVELS}];
varying vec3 vWPos;
${TERRAIN_HEIGHT_GLSL}
vec3 terrainVertex(vec3 local) {
  float size = aNode.z;
  float lvl = aNode.w;
  float cell = size / ${G}.0;
  float ls = ${(LEAF / G).toFixed(4)} * exp2(lvl); // pas de la grille du niveau dessiné
  float r = floor(ls / cell + 0.5);                 // 1, ou 2 pour un quart dessiné au niveau du parent
  vec2 idx = floor(local.xz * ${G}.0 + 0.5);
  idx = floor(idx / r + 0.001) * r;                 // ramène les sommets sur la grille du niveau
  vec2 p0 = aNode.xy + idx * cell;
  float h0 = terrainHeight(p0);
  int li = int(lvl + 0.5);
  float d = distance(uMorphCam, vec3(p0.x, h0, p0.y));
  float morph = clamp((d - uMorphStart[li]) / (uRange[li] - uMorphStart[li]), 0.0, 1.0);
  // sommets impairs (sur la grille du niveau) glissés vers le sommet pair voisin : grille du niveau suivant
  vec2 odd = mod(idx / r, 2.0);
  vec2 p = aNode.xy + (idx - odd * r * morph) * cell;
  return vec3(p.x, terrainHeight(p), p.y);
}
`;
const VERT_MAIN = /* glsl */ `
  vec3 tw = terrainVertex(position);
  vWPos = tw;
  vec3 transformed = tw;
`;

function patchVertex(shader: THREE.WebGLProgramParametersWithUniforms, uniforms: Record<string, THREE.IUniform>) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_PARS)
    .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
    .replace('#include <begin_vertex>', VERT_MAIN)
    // le carreau est déjà en coordonnées du monde (modelMatrix = identité)
    .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4(transformed, 1.0);');
}

// ------------------------------------------------------------------------------------------- matériau
/** Couches : [image ou chemin, échelle de répétition (m), rugosité]. */
const LAYERS: { diff: string; nor: string; scale: number; rough: number }[] = [
  { diff: 'grass_diff', nor: 'grass_nor', scale: 4.5, rough: 0.95 }, // 0 herbe des prés
  { diff: 'terrain/mosslawn_diff', nor: 'terrain/mosslawn_nor', scale: 3.2, rough: 0.92 }, // 1 herbe rase moussue (village)
  { diff: 'terrain/forestmoss_diff', nor: 'terrain/forestmoss_nor', scale: 3.6, rough: 0.95 }, // 2 sous-bois : mousse et feuilles
  { diff: 'dirtroad_diff', nor: 'dirtroad_nor', scale: 3.5, rough: 0.92 }, // 3 terre
  { diff: 'terrain/pebbles_diff', nor: 'terrain/pebbles_nor', scale: 2.4, rough: 0.7 }, // 4 galets
  { diff: 'terrain/mossrockgrey_diff', nor: 'terrain/mossrockgrey_nor', scale: 6, rough: 0.85 }, // 5 roche moussue
  { diff: 'rock_diff', nor: 'rock_nor', scale: 9, rough: 0.88 }, // 6 roche
  { diff: 'sand_diff', nor: 'sand_nor', scale: 6, rough: 0.95 }, // 7 sable
  { diff: 'snow_diff', nor: 'snow_nor', scale: 5, rough: 0.6 }, // 8 neige
];
const ALB = 1024, NOR = 512;

function makeArray(size: number, srgb: boolean) {
  const data = new Uint8Array(size * size * 4 * LAYERS.length);
  data.fill(128);
  const t = new THREE.DataArrayTexture(data, size, size, LAYERS.length);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

function fillLayer(tex: THREE.DataArrayTexture, layer: number, img: HTMLImageElement | ImageBitmap, size: number) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, size, size);
  const px = g.getImageData(0, 0, size, size).data;
  (tex.image.data as Uint8Array).set(px, layer * size * size * 4);
  tex.needsUpdate = true;
}

function loadLayerImages(alb: THREE.DataArrayTexture, nor: THREE.DataArrayTexture) {
  const base = import.meta.env.BASE_URL + 'assets/tex/';
  LAYERS.forEach((L, i) => {
    for (const [key, tex, size] of [[L.diff, alb, ALB], [L.nor, nor, NOR]] as const) {
      const have = IMG[key];
      if (have) { fillLayer(tex, i, have, size); continue; }
      const im = new Image();
      im.onload = () => fillLayer(tex, i, im, size);
      im.onerror = () => console.warn('Texture de terrain introuvable : ' + key);
      im.src = `${base}${key}.jpg`;
    }
  });
}

/** Uniformes partagés par le rendu et les ombres (hauteur, portées, position de morphing). */
const sharedUniforms: Record<string, THREE.IUniform> = {};
function initShared() {
  if (sharedUniforms.uTHGlobal) return;
  Object.assign(sharedUniforms, terrainHeightUniforms(), {
    uRange: { value: RANGE.slice() },
    uMorphStart: { value: MORPH_START.slice() },
    uMorphCam: { value: new THREE.Vector3() },
  });
}

export function createTerrainMaterial(): THREE.MeshStandardMaterial {
  initShared();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  const alb = makeArray(ALB, true), nor = makeArray(NOR, false);
  loadLayerImages(alb, nor);
  const ds = getDetailSplatTexture().image as { width: number; height: number };
  const td = terrainData!;
  const S = td.meta.surface, Bm = td.meta.biome;
  const extra = {
    uSplatD: { value: getDetailSplatTexture() },
    uSurf: { value: getSurfaceTexture() },
    uBiome: { value: getBiomeTexture() },
    uSurfRect: { value: new THREE.Vector4(S.x0, S.cell * S.n, Bm.x0, Bm.cell * Bm.n) },
    uSurfRes: { value: new THREE.Vector2(S.n, Bm.n) },
    uAlb: { value: alb },
    uNor: { value: nor },
    uDRect: { value: new THREE.Vector4(DETAIL.x0, DETAIL.z0, DETAIL.x1, DETAIL.z1) },
    uDRes: { value: new THREE.Vector2(ds.width, ds.height) },
  };
  const scales = LAYERS.map((l) => l.scale.toFixed(2)).join(', ');
  const roughs = LAYERS.map((l) => l.rough.toFixed(2)).join(', ');
  mat.onBeforeCompile = (shader) => {
    patchVertex(shader, sharedUniforms);
    Object.assign(shader.uniforms, extra);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        ${TERRAIN_HEIGHT_GLSL}
        uniform sampler2D uSplatD, uSurf, uBiome;
        uniform highp sampler2DArray uAlb, uNor;
        uniform vec4 uSurfRect;
        uniform vec2 uSurfRes;
        uniform vec4 uDRect;
        uniform vec2 uDRes;
        const float LSC[9] = float[9](${scales});
        const float LRO[9] = float[9](${roughs});
        float tW[9];
        vec3 tN;
        float tRough;
        float tH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float tNoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(tH(i), tH(i + vec2(1, 0)), u.x), mix(tH(i + vec2(0, 1)), tH(i + vec2(1, 1)), u.x), u.y); }
        // échantillon d'albédo anti-répétition : deux échelles et un décalage selon un bruit lent
        vec4 tAlb(int i, vec2 p) {
          float s = LSC[i];
          float n = tNoise(p / (s * 7.0));
          vec4 a = texture(uAlb, vec3(p / s, float(i)));
          vec4 b = texture(uAlb, vec3(p / (s * 2.7) + vec2(0.37, 0.71), float(i)));
          vec4 c = texture(uAlb, vec3(vec2(p.y, -p.x) / (s * 1.13) + 0.5, float(i)));
          return mix(mix(a, c, smoothstep(0.35, 0.65, n)), b, 0.3);
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `
        vec2 wp = vWPos.xz;
        float camD = length(vWPos - cameraPosition);
        // normale par pixel depuis la hauteur (pas adapté à la distance)
        float e = clamp(camD * 0.004, 0.3, 12.0);
        vec3 Nw = normalize(vec3(terrainHeight(wp - vec2(e, 0.0)) - terrainHeight(wp + vec2(e, 0.0)), 2.0 * e,
                                 terrainHeight(wp - vec2(0.0, e)) - terrainHeight(wp + vec2(0.0, e))));
        // cartes dérivées (4 m) et biomes (8 m)
        vec4 sf = texture(uSurf, (wp - uSurfRect.x) / uSurfRect.y + 0.5 / uSurfRes.x);
        vec4 bm = texture(uBiome, (wp - uSurfRect.z) / uSurfRect.w + 0.5 / uSurfRes.y);
        float flow = sf.r, wet = sf.g, depo = sf.b, rockM = sf.a;
        float sand = bm.r, snow = bm.g, dry = bm.b, lush = bm.a;
        // vallée de Capyville : couches fines d'origine (roche, galets, terre, sous-bois)
        vec2 dq = (wp - uDRect.xy) / (uDRect.zw - uDRect.xy);
        float dm = min(min(wp.x - uDRect.x, uDRect.z - wp.x), min(wp.y - uDRect.y, uDRect.w - wp.y));
        float inD = smoothstep(0.0, 12.0, dm);
        vec4 ds = texture(uSplatD, (clamp(dq, 0.0, 1.0) * (uDRes - 1.0) + 0.5) / uDRes);
        float dsum = ds.r + ds.g + ds.b + ds.a;
        if (dsum > 1.0) { ds /= dsum; dsum = 1.0; }
        float vill = smoothstep(135.0, 105.0, length(wp));
        float slopeY = Nw.y;
        // monde : neige, roche des pentes et affleurements, sable, lits et éboulis (galets), terre sèche, sous-bois, herbe
        float n1 = tNoise(wp / 23.0), n2 = tNoise(wp / 7.0);
        float rockW = max(smoothstep(0.86, 0.72, slopeY + 0.06 * (n1 - 0.5)), rockM * 0.9);
        float snowW = snow * smoothstep(0.55, 0.75, slopeY + 0.1 * n2);
        float sandW = sand * (1.0 - rockW);
        float bedW = smoothstep(0.62, 0.8, flow) * (0.6 + 0.4 * wet) * (1.0 - sand);
        float screeW = smoothstep(0.25, 0.7, depo) * smoothstep(0.97, 0.8, slopeY);
        float dirtW = dry * 0.55 * smoothstep(0.35, 0.75, n1 + 0.3 * depo) + 0.25 * depo;
        float mossW = lush * smoothstep(0.3, 0.8, wet + 0.3 * (n2 - 0.5));
        float wl = 1.0 - inD;
        float r0 = 1.0;
        tW[8] = snowW; r0 -= tW[8];
        tW[6] = r0 * rockW * (1.0 - 0.6 * lush);
        tW[5] = r0 * rockW * 0.6 * lush; r0 -= tW[6] + tW[5];
        tW[7] = r0 * sandW; r0 -= tW[7];
        tW[4] = r0 * clamp(bedW + screeW, 0.0, 1.0); r0 -= tW[4];
        tW[3] = r0 * clamp(dirtW, 0.0, 1.0); r0 -= tW[3];
        tW[2] = r0 * mossW; r0 -= tW[2];
        tW[0] = max(r0, 0.0);
        tW[1] = 0.0;
        for (int i = 0; i < 9; i++) tW[i] *= wl;
        float wg = 1.0 - dsum;
        tW[0] += inD * wg * (1.0 - 0.55 * vill);
        tW[1] += inD * wg * 0.55 * vill;
        tW[2] += inD * ds.a;
        tW[3] += inD * ds.b;
        tW[4] += inD * ds.g;
        tW[5] += inD * ds.r;
        // roche toujours présente sur les pentes très raides (falaises)
        float steep = smoothstep(0.72, 0.55, slopeY);
        for (int i = 0; i < 9; i++) tW[i] *= (1.0 - steep);
        tW[5] += steep * inD; tW[6] += steep * (1.0 - inD);
        // mélange par hauteur (luminance de l'albédo) et triplanaire pour la roche
        vec3 tCol = vec3(0.0); vec3 tNt = vec3(0.0); float tSum = 0.0; tRough = 0.0;
        vec3 tri = pow(abs(Nw), vec3(4.0)); tri /= (tri.x + tri.y + tri.z);
        for (int i = 0; i < 9; i++) {
          float w = tW[i];
          if (w < 0.004) continue;
          vec4 a; vec3 nt;
          if (i == 5 || i == 6) {
            vec2 px = vWPos.zy, pz = vWPos.xy;
            a = tAlb(i, wp) * tri.y + texture(uAlb, vec3(px / LSC[i], float(i))) * tri.x + texture(uAlb, vec3(pz / LSC[i], float(i))) * tri.z;
            nt = (texture(uNor, vec3(wp / LSC[i], float(i))).xyz * 2.0 - 1.0) * tri.y
               + (texture(uNor, vec3(px / LSC[i], float(i))).xyz * 2.0 - 1.0) * tri.x
               + (texture(uNor, vec3(pz / LSC[i], float(i))).xyz * 2.0 - 1.0) * tri.z;
          } else {
            a = tAlb(i, wp);
            nt = texture(uNor, vec3(wp / LSC[i], float(i))).xyz * 2.0 - 1.0;
          }
          float h = dot(a.rgb, vec3(0.3, 0.5, 0.2));
          float hw = w * pow(0.3 + h, 3.0) + 1e-4;
          tCol += a.rgb * hw; tNt += nt * hw; tRough += LRO[i] * hw; tSum += hw;
        }
        tCol /= tSum; tNt /= tSum; tRough /= tSum;
        // teinte de l'herbe selon le biome : vert profond (mousse), herbe blonde (sec), herbe rousse (froid)
        vec3 tintV = vec3(0.9, 1.22, 0.47);
        vec3 tintG = mix(tintV, vec3(1.25, 1.07, 0.62), dry);
        tintG = mix(tintG, vec3(0.75, 1.18, 0.55), lush * 0.6);
        tintG = mix(tintG, vec3(1.1, 0.98, 0.78), smoothstep(0.0, 0.6, snow) * (1.0 - snowW));
        tintG = mix(tintV, tintG, wl);
        tCol *= mix(vec3(1.0), tintG, clamp(tW[0] + tW[1], 0.0, 1.0) * 0.85);
        // variation lente de couleur (taches) pour casser l'uniformité au loin
        float macro = tNoise(wp / 37.0) * 0.6 + tNoise(wp / 113.0) * 0.4;
        tCol *= 0.84 + 0.32 * macro;
        // sol mouillé au bord de l'eau
        float vWet = wl * smoothstep(0.75, 1.0, wet) * 0.6;
        tCol *= mix(1.0, 0.62, vWet);
        tRough = mix(tRough, 0.35, vWet);
        // normale perturbée (repère : u le long de +x, v le long de +z)
        float nk = 1.0 / (1.0 + camD * 0.015);
        tNt.y = -tNt.y;
        vec3 T = normalize(vec3(1.0, 0.0, 0.0) - Nw * Nw.x);
        vec3 B = cross(T, Nw);
        tN = normalize(Nw + (T * tNt.x + B * tNt.y) * nk);
        diffuseColor.rgb = tCol;
        `,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(tN, 0.0)).xyz);');
  };
  mat.customProgramCacheKey = () => 'terrain-clipmap-v1';
  return mat;
}

function createDepthMaterial() {
  initShared();
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (shader) => patchVertex(shader, sharedUniforms);
  m.customProgramCacheKey = () => 'terrain-clipmap-depth-v1';
  return m;
}

/** Terrain de toute l'île (clipmap GPU). `lodDist` (réglage de qualité des anciens morceaux) n'est plus utilisé. */
export function createTerrain(material: THREE.Material, _lodDist: number) {
  initShared();
  const group = new THREE.Group();
  group.name = 'terrain';
  const clip = new TerrainClipmap(material, createDepthMaterial());
  // position de morphing partagée par le rendu et les ombres (toujours celle de la caméra principale)
  sharedUniforms.uMorphCam.value = clip.uniforms.uMorphCam.value;
  group.add(clip.mesh);
  group.userData.clipmap = clip;
  // choix des nœuds une fois par rendu de la scène, avec sa caméra (avant les ombres)
  let attached = false;
  group.addEventListener('added', () => {
    const sc = group.parent;
    if (attached || !(sc instanceof THREE.Scene)) return;
    attached = true;
    beforeRender(sc, (camera) => clip.update(camera));
  });
  return group;
}
