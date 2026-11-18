// Maillage du terrain et son matériau à couches (spécialité Terrain & relief).
// - Hors de la vallée : morceaux de 200 m à deux niveaux de détail.
// - Vallée de Capyville (emprise DETAIL) : chaque morceau de 200 m se découpe de près en 16 tuiles de 50 m
//   construites à la demande en 0,5 m, 1 m ou 2,5 m selon la distance (grille fine de heightmap.ts).
// - Jupes verticales sur les bords pour masquer les fissures entre niveaux de détail.
// - Matériau : 9 couches PBR (herbe, herbe rase moussue, sous-bois, terre, galets, roche moussue, roche,
//   sable, neige) dans deux tableaux de textures, mélange par masque de surface et par hauteur, roche
//   en projection triplanaire sur les pentes, sol mouillé au bord de l'eau.
// Textures : Poly Haven (CC0) — celles de public/assets/tex/ et, pour la vallée, public/assets/tex/terrain/
// (mossy_rock, river_small_rocks, forest_leaves_02, sparse_grass).
import * as THREE from 'three';
import {
  HM_RES, WORLD_HALF, getDetailSplatTexture, getSplatTexture, heightAt, normalAt, wetAt,
} from './heightmap';
import { DETAIL } from './valley';
import { REGIONS, RegionId, WORLD_SIZE } from './layout';
import { IMG } from '../core/assets';

const CHUNK = 200;
const TILE = 50;

const GRASS_TINT: Record<RegionId, [number, number, number]> = {
  hub: [0.62, 0.84, 0.32],
  paris: [0.5, 0.68, 0.3],
  newyork: [0.48, 0.66, 0.32],
  london: [0.42, 0.62, 0.3],
  japan: [0.5, 0.86, 0.38],
  desert: [0.85, 0.74, 0.45],
  pole: [0.9, 0.95, 1.0],
};

function tintAt(x: number, z: number, out: THREE.Color) {
  let r = 0, g = 0, b = 0, sum = 0;
  for (const reg of REGIONS) {
    const d = Math.hypot(x - reg.x, z - reg.z);
    const w = Math.pow(Math.max(0, 1 - d / (reg.radius * 1.7)), 3) + 1e-4;
    const t = GRASS_TINT[reg.id];
    r += t[0] * w; g += t[1] * w; b += t[2] * w; sum += w;
  }
  return out.setRGB(r / sum, g / sum, b / sum);
}

// ------------------------------------------------------------------------------------------- géométrie
const indexCache = new Map<number, THREE.BufferAttribute>();
/** Indices d'une grille seg × seg suivie de sa jupe (4 bords, les deux faces). */
function gridIndex(seg: number) {
  let a = indexCache.get(seg);
  if (a) return a;
  const n = seg + 1;
  const idx: number[] = [];
  for (let j = 0; j < seg; j++)
    for (let i = 0; i < seg; i++) {
      const p = j * n + i;
      idx.push(p, p + n, p + 1, p + 1, p + n, p + n + 1);
    }
  // jupe : sommets n*n + k (k le long du contour)
  const ring = edgeRing(seg);
  const base = n * n;
  for (let k = 0; k < ring.length; k++) {
    const a0 = ring[k], a1 = ring[(k + 1) % ring.length];
    const b0 = base + k, b1 = base + ((k + 1) % ring.length);
    idx.push(a0, b0, a1, a1, b0, b1, a0, a1, b0, a1, b1, b0);
  }
  const total = base + ring.length;
  a = new THREE.BufferAttribute(total > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1);
  indexCache.set(seg, a);
  return a;
}
const ringCache = new Map<number, number[]>();
function edgeRing(seg: number) {
  let r = ringCache.get(seg);
  if (r) return r;
  const n = seg + 1;
  r = [];
  for (let i = 0; i < seg; i++) r.push(i); // nord
  for (let j = 0; j < seg; j++) r.push(j * n + seg); // est
  for (let i = seg; i > 0; i--) r.push(seg * n + i); // sud
  for (let j = seg; j > 0; j--) r.push(j * n); // ouest
  ringCache.set(seg, r);
  return r;
}

/** Grille de terrain carrée centrée en (cx, cz), coordonnées locales au centre. */
function buildGrid(cx: number, cz: number, size: number, seg: number, skirt: number) {
  const n = seg + 1;
  const ring = edgeRing(seg);
  const count = n * n + ring.length;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const wet = new Float32Array(count);
  const v = new THREE.Vector3(), c = new THREE.Color();
  const step = size / seg;
  const e = Math.max(0.5, step);
  let minY = Infinity, maxY = -Infinity;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const lx = -size / 2 + i * step, lz = -size / 2 + j * step;
      const x = cx + lx, z = cz + lz;
      const y = heightAt(x, z);
      const k = j * n + i;
      pos[k * 3] = lx; pos[k * 3 + 1] = y; pos[k * 3 + 2] = lz;
      normalAt(x, z, v, e);
      nor[k * 3] = v.x; nor[k * 3 + 1] = v.y; nor[k * 3 + 2] = v.z;
      tintAt(x, z, c);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      wet[k] = wetAt(x, z);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  for (let k = 0; k < ring.length; k++) {
    const s = ring[k], d = n * n + k;
    pos[d * 3] = pos[s * 3]; pos[d * 3 + 1] = pos[s * 3 + 1] - skirt; pos[d * 3 + 2] = pos[s * 3 + 2];
    nor.copyWithin(d * 3, s * 3, s * 3 + 3);
    col.copyWithin(d * 3, s * 3, s * 3 + 3);
    wet[d] = wet[s];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aWet', new THREE.BufferAttribute(wet, 1));
  geo.setIndex(gridIndex(seg));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return { geo, minY, maxY };
}

// ------------------------------------------------------------------------------------------- tuiles à la demande
const TILE_LEVELS = [
  { seg: 100, dist: 0, skirt: 0.4 }, // 0,5 m
  { seg: 50, dist: 75, skirt: 0.8 }, // 1 m
  { seg: 20, dist: 180, skirt: 1.5 }, // 2,5 m
];
const _cam = new THREE.Vector3(), _me = new THREE.Vector3();

/** Tuile de 50 m dont les niveaux de détail sont construits à la demande (et le plus fin libéré de loin). */
class LazyTile extends THREE.LOD {
  private built: boolean[] = [];
  constructor(private cx: number, private cz: number, private material: THREE.Material) {
    super();
    this.position.set(cx, 0, cz);
    for (const L of TILE_LEVELS) {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), material);
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      this.addLevel(m, L.dist);
      this.built.push(false);
    }
  }
  update(camera: THREE.Camera) {
    _cam.setFromMatrixPosition(camera.matrixWorld);
    _me.setFromMatrixPosition(this.matrixWorld);
    const d = _cam.distanceTo(_me);
    let lvl = 0;
    for (let i = 1; i < TILE_LEVELS.length; i++) if (d >= TILE_LEVELS[i].dist) lvl = i;
    if (!this.built[lvl]) this.build(lvl);
    // la version la plus fine coûte de la mémoire : on la libère quand on s'éloigne
    if (this.built[0] && d > TILE_LEVELS[1].dist * 2.2) {
      const m = this.levels[0].object as THREE.Mesh;
      m.geometry.dispose();
      m.geometry = new THREE.BufferGeometry();
      this.built[0] = false;
    }
    super.update(camera);
  }
  private build(lvl: number) {
    const L = TILE_LEVELS[lvl];
    const m = this.levels[lvl].object as THREE.Mesh;
    m.geometry.dispose();
    m.geometry = buildGrid(this.cx, this.cz, TILE, L.seg, L.skirt).geo;
    this.built[lvl] = true;
  }
}

const chunkInDetail = (cx: number, cz: number) =>
  cx - CHUNK / 2 >= DETAIL.x0 - 0.01 && cx + CHUNK / 2 <= DETAIL.x1 + 0.01 && cz - CHUNK / 2 >= DETAIL.z0 - 0.01 && cz + CHUNK / 2 <= DETAIL.z1 + 0.01;

export function createTerrain(material: THREE.Material, lodDist: number) {
  const group = new THREE.Group();
  group.name = 'terrain';
  const n = Math.round(WORLD_SIZE / CHUNK);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const cx = -WORLD_HALF + CHUNK / 2 + i * CHUNK;
      const cz = -WORLD_HALF + CHUNK / 2 + j * CHUNK;
      const lod = new THREE.LOD();
      const high = buildGrid(cx, cz, CHUNK, 64, 2);
      if (high.maxY < -9) { high.geo.dispose(); continue; } // fond marin profond : l'eau suffit
      const low = buildGrid(cx, cz, CHUNK, 16, 4);
      const mh = new THREE.Mesh(high.geo, material);
      const ml = new THREE.Mesh(low.geo, material);
      mh.receiveShadow = true;
      ml.receiveShadow = true;
      if (chunkInDetail(cx, cz)) {
        // vallée : tuiles fines de près
        const tiles = new THREE.Group();
        for (let tj = 0; tj < CHUNK / TILE; tj++)
          for (let ti = 0; ti < CHUNK / TILE; ti++)
            tiles.add(new LazyTile(cx - CHUNK / 2 + TILE / 2 + ti * TILE, cz - CHUNK / 2 + TILE / 2 + tj * TILE, material));
        // les tuiles sont positionnées en absolu : le groupe compense la position du LOD
        tiles.position.set(-cx, 0, -cz);
        lod.addLevel(tiles, 0);
        lod.addLevel(mh, 300);
        lod.addLevel(ml, Math.max(lodDist, 700));
      } else {
        lod.addLevel(mh, 0);
        lod.addLevel(ml, lodDist);
      }
      lod.position.set(cx, 0, cz);
      lod.autoUpdate = true;
      group.add(lod);
    }
  }
  return group;
}

// ------------------------------------------------------------------------------------------- matériau
/** Couches : [image ou chemin, échelle de répétition (m), rugosité]. */
const LAYERS: { diff: string; nor: string; scale: number; rough: number }[] = [
  { diff: 'grass_diff', nor: 'grass_nor', scale: 4.5, rough: 0.95 }, // 0 herbe des prés
  { diff: 'terrain/mosslawn_diff', nor: 'terrain/mosslawn_nor', scale: 3.2, rough: 0.92 }, // 1 herbe rase moussue (village)
  { diff: 'terrain/forestmoss_diff', nor: 'terrain/forestmoss_nor', scale: 3.6, rough: 0.95 }, // 2 sous-bois : mousse et feuilles
  { diff: 'dirtroad_diff', nor: 'dirtroad_nor', scale: 3.5, rough: 0.92 }, // 3 terre des chemins
  { diff: 'terrain/pebbles_diff', nor: 'terrain/pebbles_nor', scale: 2.4, rough: 0.7 }, // 4 galets
  { diff: 'terrain/mossrockgrey_diff', nor: 'terrain/mossrockgrey_nor', scale: 6, rough: 0.85 }, // 5 roche moussue
  { diff: 'rock_diff', nor: 'rock_nor', scale: 9, rough: 0.88 }, // 6 roche (reste du monde)
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

export function createTerrainMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const alb = makeArray(ALB, true), nor = makeArray(NOR, false);
  loadLayerImages(alb, nor);
  const ds = getDetailSplatTexture().image as { width: number; height: number };
  const uniforms = {
    uSplat: { value: getSplatTexture() },
    uSplatD: { value: getDetailSplatTexture() },
    uAlb: { value: alb },
    uNor: { value: nor },
    uWorld: { value: WORLD_SIZE },
    uGRes: { value: HM_RES },
    uDRect: { value: new THREE.Vector4(DETAIL.x0, DETAIL.z0, DETAIL.x1, DETAIL.z1) },
    uDRes: { value: new THREE.Vector2(ds.width, ds.height) },
  };
  const scales = LAYERS.map((l) => l.scale.toFixed(2)).join(', ');
  const roughs = LAYERS.map((l) => l.rough.toFixed(2)).join(', ');
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNor;\nattribute float aWet;\nvarying float vWet;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;\nvWNor = normalize(mat3(modelMatrix) * objectNormal);\nvWet = aWet;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        varying vec3 vWNor;
        varying float vWet;
        uniform sampler2D uSplat, uSplatD;
        uniform highp sampler2DArray uAlb, uNor;
        uniform float uWorld, uGRes;
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
        vec3 Nw = normalize(vWNor);
        // masques : grille globale (herbe, sable, neige, roche) et grille fine de la vallée (roche, galets, terre, sous-bois)
        vec2 gq = (wp + uWorld * 0.5) / uWorld * (uGRes - 1.0);
        vec4 gs = texture(uSplat, (gq + 0.5) / uGRes);
        gs /= max(0.001, gs.r + gs.g + gs.b + gs.a);
        vec2 dq = (wp - uDRect.xy) / (uDRect.zw - uDRect.xy);
        float dm = min(min(wp.x - uDRect.x, uDRect.z - wp.x), min(wp.y - uDRect.y, uDRect.w - wp.y));
        float inD = smoothstep(0.0, 12.0, dm);
        vec4 ds = texture(uSplatD, (clamp(dq, 0.0, 1.0) * (uDRes - 1.0) + 0.5) / uDRes);
        float dsum = ds.r + ds.g + ds.b + ds.a;
        if (dsum > 1.0) { ds /= dsum; dsum = 1.0; }
        float wg = 1.0 - dsum;
        float vill = smoothstep(135.0, 105.0, length(wp));
        tW[0] = mix(gs.r, wg * (1.0 - vill), inD);
        tW[1] = inD * wg * vill;
        tW[2] = inD * ds.a;
        tW[3] = inD * ds.b;
        tW[4] = inD * ds.g;
        tW[5] = inD * ds.r;
        tW[6] = (1.0 - inD) * gs.a;
        tW[7] = (1.0 - inD) * gs.g;
        tW[8] = (1.0 - inD) * gs.b;
        // roche toujours présente sur les pentes très raides (falaises fines)
        float steep = smoothstep(0.72, 0.55, Nw.y);
        for (int i = 0; i < 9; i++) tW[i] *= (1.0 - steep);
        tW[5] += steep * inD; tW[6] += steep * (1.0 - inD);
        // mélange par hauteur (luminance de l'albédo) et triplanaire pour la roche
        vec3 tCol = vec3(0.0); vec3 tNt = vec3(0.0); float tSum = 0.0; tRough = 0.0;
        vec3 tri = pow(abs(Nw), vec3(4.0)); tri /= (tri.x + tri.y + tri.z);
        float camD = length(vWPos - cameraPosition);
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
        // teintes : herbe des prés selon la région (couleurs de sommet), herbe du village plus profonde
        float grassW = (tW[0] + tW[1]) ;
        vec3 tint = mix(vec3(1.0), vColor.rgb * 1.45, clamp(tW[0] / max(0.001, grassW + tW[2] + tW[3] + tW[4] + tW[5] + tW[6] + tW[7] + tW[8]), 0.0, 1.0) * 0.85);
        tCol *= tint;
        // variation lente de couleur (taches) pour casser l'uniformité au loin
        float macro = tNoise(wp / 37.0) * 0.6 + tNoise(wp / 113.0) * 0.4;
        tCol *= 0.84 + 0.32 * macro;
        // sol mouillé au bord de l'eau
        tCol *= mix(1.0, 0.58, vWet);
        tRough = mix(tRough, 0.32, vWet);
        // normale perturbée (repère : u le long de +x, v le long de +z)
        float nk = 1.0 / (1.0 + camD * 0.015);
        tNt.y = -tNt.y;
        vec3 T = normalize(vec3(1.0, 0.0, 0.0) - Nw * Nw.x);
        vec3 B = cross(T, Nw);
        tN = normalize(Nw + (T * tNt.x + B * tNt.y) * nk);
        diffuseColor.rgb = tCol;
        `,
      )
      .replace('#include <color_fragment>', '')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(tN, 0.0)).xyz);');
  };
  mat.customProgramCacheKey = () => 'terrain-v2';
  return mat;
}
