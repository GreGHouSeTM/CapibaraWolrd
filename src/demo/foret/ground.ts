// Sol de la zone « forêt » : grille fine 0,25 m (100 × 80 m) et anneau lointain 2 m (640 m) qui la prolonge dans la brume.
// Matière : 5 photoscans CC0 retouchés en tableaux de textures (litière d'aiguilles, sol moussu, sentier, boue, mousse),
// mélangés par hauteur selon les masques cuits (sentier, mousse, humidité) ; parallax occlusion mapping sur les trois
// premières couches (hauteurs regroupées dans solh.webp) ; anti-répétition par décalages pilotés par un bruit.
import * as THREE from 'three';
import type { ForetData } from './data';
import type { ForetPreset } from './presets';
import { BASE } from './data';
import { patch } from './glsl';
import { tex } from './tex';

export const GROUND_LAYERS = ['aiguilles', 'solmousse', 'sentier', 'boue', 'mousse'] as const;
const TILE = 2.2; // pavé commun des couches 0-2 (parallaxe)
const TILES = [TILE, TILE, TILE, 2.0, 1.1];

export class Ground {
  group = new THREE.Group();
  hero!: THREE.Mesh;
  ring!: THREE.Mesh;

  constructor(private D: ForetData, private q: ForetPreset) {
    this.group.name = 'sol-foret';
  }

  async build(aniso: number) {
    const D = this.D, t = D.scene.terrain;
    const [alb, nor, arh, solh, masks] = await Promise.all([
      loadArray(GROUND_LAYERS.map((n) => `tex/${n}_diff.webp`), true, aniso),
      loadArray(GROUND_LAYERS.map((n) => `tex/${n}_nor.webp`), false, aniso),
      loadArray(GROUND_LAYERS.map((n) => `tex/${n}_arh.webp`), false, aniso),
      tex('tex/solh.webp', false),
      tex('masks.png', false, { flipY: false, repeat: false }),
    ]);
    const m = t.masks;
    const rect = new THREE.Vector4(m.x0, m.z0, 1 / (m.nx * m.cell), 1 / (m.nz * m.cell));
    const heroMat = groundMaterial({ alb, nor, arh, solh, masks, rect, pom: this.q.pom, far: false });
    const ringMat = groundMaterial({ alb, nor, arh, solh, masks, rect, pom: 0, far: true });
    this.hero = new THREE.Mesh(gridGeometry(D.heights, t.nx, t.nz, t.x0, t.z0, t.cell), heroMat);
    this.hero.receiveShadow = true;
    this.hero.castShadow = true;
    this.hero.name = 'sol-fin';
    const r = t.ring;
    const inner = (x: number, z: number) => !(x > t.x0 + 2 && x < t.x0 + (t.nx - 1) * t.cell - 2 && z > t.z0 + 2 && z < t.z0 + (t.nz - 1) * t.cell - 2);
    this.ring = new THREE.Mesh(gridGeometry(D.ring, r.n, r.n, r.x0, r.z0, r.cell, inner), ringMat);
    this.ring.receiveShadow = true;
    this.ring.name = 'sol-lointain';
    this.group.add(this.hero, this.ring);
  }
}

/** Tableau de textures (une couche par image, même taille), mipmaps et anisotropie. */
export async function loadArray(paths: string[], srgb: boolean, aniso: number): Promise<THREE.DataArrayTexture> {
  const bmps = await Promise.all(paths.map(async (p) => {
    const blob = await fetch(BASE() + p).then((r) => { if (!r.ok) throw new Error('Texture introuvable : ' + p); return r.blob(); });
    return createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  }));
  const w = bmps[0].width, h = bmps[0].height;
  const data = new Uint8Array(w * h * 4 * bmps.length);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  bmps.forEach((b, i) => {
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(b, 0, 0, w, h);
    data.set(ctx.getImageData(0, 0, w, h).data, i * w * h * 4);
    b.close();
  });
  const t = new THREE.DataArrayTexture(data, w, h, bmps.length);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

interface GroundTex {
  alb: THREE.DataArrayTexture; nor: THREE.DataArrayTexture; arh: THREE.DataArrayTexture;
  solh: THREE.Texture; masks: THREE.Texture; rect: THREE.Vector4; pom: number; far: boolean;
}

export function groundMaterial(g: GroundTex) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  return patch(mat, {
    uniforms: {
      tAlb: { value: g.alb }, tNor: { value: g.nor }, tArh: { value: g.arh }, tH: { value: g.solh }, tMask: { value: g.masks },
      uRect: { value: g.rect }, uPom: { value: 0.045 },
    },
    defines: { POM_STEPS: g.pom, FAR: g.far ? 1 : 0, TILE: TILE.toFixed(3), TILE3: TILES[3].toFixed(3), TILE4: TILES[4].toFixed(3) },
    vertexHead: 'varying vec3 vWp; varying vec3 vWn;',
    vertex: { '+worldpos_vertex': 'vWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vWn = normalize(mat3(modelMatrix) * objectNormal);' },
    fragmentHead: /* glsl */ `
      precision highp sampler2DArray;
      uniform sampler2DArray tAlb, tNor, tArh;
      uniform sampler2D tH, tMask;
      uniform vec4 uRect;
      uniform float uPom;
      varying vec3 vWp; varying vec3 vWn;
      vec4 aS(sampler2DArray t, NT n, vec2 o, float l) {
        return mix(textureGrad(t, vec3(n.a + o, l), n.dx, n.dy), textureGrad(t, vec3(n.b + o, l), n.dx, n.dy), n.f);
      }
      float pomH(NT n, vec2 o, vec3 w) {
        return mix(dot(textureGrad(tH, n.a + o, n.dx, n.dy).rgb, w), dot(textureGrad(tH, n.b + o, n.dx, n.dy).rgb, w), n.f);
      }`,
    fragment: {
      map_fragment: /* glsl */ `
        vec2 wxz = vWp.xz;
        vec3 mk = texture2D(tMask, (wxz - uRect.xy) * uRect.zw).rgb;
        float dist = length(cameraPosition - vWp);
        // couvertures cibles : sentier, boue, mousse ; le reste en litière d'aiguilles ou sol moussu (taches de 5-10 m)
        float varA = fbm3(wxz * 0.12 + 5.0);
        float cMossy = smoothstep(0.42, 0.68, varA + mk.g * 0.25) * (1.0 - mk.r);
        float b0 = (1.0 - mk.r) * (1.0 - cMossy), b1 = cMossy, b2 = mk.r, b3 = mk.b, b4 = mk.g;
        vec3 wPom = vec3(b0, b1, b2) / max(b0 + b1 + b2, 1e-3);
        vec3 Nw = normalize(vWn);
        vec3 Tw = normalize(vec3(1.0, 0.0, 0.0) - Nw * Nw.x);
        vec3 Bw = cross(Tw, Nw);
        NT n0 = ntSetup(wxz / TILE, 1.0);
        vec2 off = vec2(0.0);
        #if POM_STEPS > 0 && FAR == 0
        float fadeP = 1.0 - smoothstep(7.0, 13.0, dist);
        if (fadeP > 0.01) {
          vec3 Vw = normalize(cameraPosition - vWp);
          vec3 Vt = vec3(dot(Vw, Tw), dot(Vw, Bw), dot(Vw, Nw));
          vec2 P = Vt.xy / max(Vt.z, 0.3) * (uPom * fadeP / TILE);
          vec2 dlt = P / float(POM_STEPS);
          float lay = 1.0 / float(POM_STEPS);
          float cur = 1.0;
          float h = pomH(n0, off, wPom);
          float hPrev = h; float curPrev = cur;
          for (int i = 0; i < POM_STEPS; i++) {
            if (h >= cur) break;
            hPrev = h; curPrev = cur;
            cur -= lay; off -= dlt;
            h = pomH(n0, off, wPom);
          }
          // affinage linéaire entre les deux derniers pas
          float a = h - cur, bb = hPrev - curPrev;
          float k = clamp(a / max(a - bb, 1e-4), 0.0, 1.0);
          off += dlt * k;
        }
        #endif
        // lecture des couches actives
        vec3 cA = vec3(0.0), nA = vec3(0.0), hA = vec3(0.0);
        float wS = 0.0;
        float hh[5]; vec3 cc[5]; vec3 nn[5]; vec3 aa[5]; float ww[5];
        ww[0] = b0; ww[1] = b1; ww[2] = b2; ww[3] = b3; ww[4] = b4;
        NT n3 = ntSetup(wxz / TILE3, 3.0);
        NT n4 = ntSetup(wxz / TILE4, 4.0);
        float hmax = -1.0;
        for (int l = 0; l < 5; l++) {
          if (ww[l] < 0.01) { hh[l] = -9.0; continue; }
          NT n = n0;
          if (l == 3) n = n3;
          if (l == 4) n = n4;
          vec2 o = l < 3 ? off : off * (TILE / (l == 3 ? TILE3 : TILE4));
          vec4 a4 = aS(tArh, n, o, float(l));
          aa[l] = a4.rgb;
          hh[l] = a4.b + ww[l] * 1.2;
          hmax = max(hmax, hh[l]);
          cc[l] = aS(tAlb, n, o, float(l)).rgb;
          nn[l] = aS(tNor, n, o, float(l)).xyz * 2.0 - 1.0;
        }
        // mélange par hauteur : les couches les plus hautes (pondérées par leur couverture) l'emportent
        for (int l = 0; l < 5; l++) {
          if (hh[l] < -5.0) continue;
          float w = max(hh[l] - (hmax - 0.28), 0.0);
          cA += cc[l] * w; nA += nn[l] * w; hA += aa[l] * w; wS += w;
        }
        cA /= max(wS, 1e-4); nA /= max(wS, 1e-4); hA /= max(wS, 1e-4);
        // variations de valeur et de teinte à grande échelle (pas d'uniformité « tuilée »)
        cA *= mix(vec3(0.86, 0.86, 0.84), vec3(1.08, 1.04, 0.98), fbm3(wxz * 0.05 + 2.0)) * (0.9 + 0.2 * vnoise(wxz * 0.35));
        // humidité : sol sombre et brillant autour de la flaque
        float wet = smoothstep(0.15, 0.9, mk.b);
        cA *= mix(1.0, 0.55, wet);
        diffuseColor.rgb *= cA;
        float gAO = hA.r;
        float gRough = mix(hA.g, 0.22, wet * 0.85);
        vec3 gN = normalize(vec3(nA.xy, max(nA.z, 0.2)));
      `,
      roughnessmap_fragment: 'float roughnessFactor = gRough;',
      normal_fragment_maps: /* glsl */ `
        vec3 nWorld = normalize(Tw * gN.x + Bw * gN.y + Nw * gN.z);
        normal = normalize((viewMatrix * vec4(nWorld, 0.0)).xyz);
      `,
      aomap_fragment: /* glsl */ `
        float ambientOcclusion = gAO;
        reflectedLight.indirectDiffuse *= ambientOcclusion;
        #if defined( USE_ENVMAP ) && defined( STANDARD )
          float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
          reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
        #endif
      `,
    },
  }, 'foret-sol-' + g.pom + (g.far ? '-loin' : ''));
}

/** Grille indexée (nx × nz sommets) à partir d'un tableau de hauteurs ; `keep(x, z)` élimine des carreaux (trou de l'anneau). */
export function gridGeometry(h: Float32Array, nx: number, nz: number, x0: number, z0: number, cell: number, keep?: (x: number, z: number) => boolean) {
  const pos = new Float32Array(nx * nz * 3);
  const nor = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const o = j * nx + i;
      pos[o * 3] = x0 + i * cell;
      pos[o * 3 + 1] = h[o];
      pos[o * 3 + 2] = z0 + j * cell;
      const hl = h[j * nx + Math.max(0, i - 1)], hr = h[j * nx + Math.min(nx - 1, i + 1)];
      const hd = h[Math.max(0, j - 1) * nx + i], hu = h[Math.min(nz - 1, j + 1) * nx + i];
      const ddx = (hr - hl) / (cell * ((i > 0 && i < nx - 1) ? 2 : 1)), ddz = (hu - hd) / (cell * ((j > 0 && j < nz - 1) ? 2 : 1));
      const l = Math.hypot(ddx, 1, ddz);
      nor[o * 3] = -ddx / l; nor[o * 3 + 1] = 1 / l; nor[o * 3 + 2] = -ddz / l;
    }
  const idx: number[] = [];
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      if (keep && !keep(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell)) continue;
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      // diagonale alternée selon la pente (meilleur suivi des arêtes)
      if (Math.abs(h[a] - h[d]) < Math.abs(h[b] - h[c])) idx.push(a, c, d, a, d, b);
      else idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(nx * nz > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}
