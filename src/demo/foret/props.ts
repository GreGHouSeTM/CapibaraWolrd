// Modèles photoscannés (Poly Haven, CC0) de la zone « forêt » : chargement des pièces et LOD, matières retouchées
// (variation de teinte par instance, mousse sur les faces tournées vers le haut, terre et humidité au pied),
// instanciation avec choix du LOD par instance selon la distance à la caméra.
import * as THREE from 'three';
import { bakeGeometry, glb, texSet, TexSet } from './tex';
import { BASE } from './data';
import { patch } from './glsl';

export interface PartInfo { name: string; dims: number[]; radius: number; lods: string[]; tris: number[] }
export interface ModelInfo { file: string; bytes: number; parts: PartInfo[] }

export interface PropStyle {
  /** mousse sur les faces tournées vers le haut (0..1) */
  moss?: number;
  /** assombrissement (terre, humidité) sur les `foot` premiers mètres au-dessus de la base */
  foot?: number;
  /** feuillage : test alpha, deux faces, vent et translucidité */
  foliage?: boolean;
  /** distances de bascule des LOD (la dernière masque) */
  lodDist?: number[];
  shadow?: boolean;
  /** dispersion de teinte par instance */
  tint?: number;
  /** multiplicateur de couleur (retouche de la palette) */
  color?: [number, number, number];
}

export class PropLib {
  info: Record<string, ModelInfo> = {};
  private parts = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material }[][]>();
  moss!: TexSet;
  wind = { value: 0 };

  async load(ids: string[], styles: Record<string, PropStyle>) {
    this.info = await fetch(BASE() + 'models.json').then((r) => r.json());
    this.moss = await texSet('mousse');
    await Promise.all(ids.map(async (id) => {
      const mi = this.info[id];
      if (!mi) throw new Error('modèle absent de models.json : ' + id);
      const g = await glb(mi.file);
      g.scene.updateMatrixWorld(true);
      const st = styles[id] ?? {};
      const mats = new Map<THREE.Material, THREE.Material>();
      for (const p of mi.parts) {
        const lods: { geo: THREE.BufferGeometry; mat: THREE.Material }[][] = [];
        for (const node of p.lods) {
          const o = g.scene.getObjectByName(node);
          if (!o) throw new Error(`nœud ${node} absent de ${mi.file}`);
          const list: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
          o.traverse((c) => {
            const m = c as THREE.Mesh;
            if (!m.isMesh) return;
            const geo = bakeGeometry(m.geometry, m.matrixWorld);
            const src = m.material as THREE.Material;
            let mat = mats.get(src);
            if (!mat) { mat = this.styled(src as THREE.MeshStandardMaterial, st, id); mats.set(src, mat); }
            list.push({ geo, mat });
          });
          lods.push(list);
        }
        this.parts.set(p.name, lods);
      }
    }));
  }

  part(name: string) {
    const p = this.parts.get(name);
    if (!p) throw new Error('pièce inconnue : ' + name);
    return p;
  }

  partInfo(name: string): PartInfo {
    for (const m of Object.values(this.info)) for (const p of m.parts) if (p.name === name) return p;
    throw new Error('pièce inconnue : ' + name);
  }

  private styled(src: THREE.MeshStandardMaterial, st: PropStyle, id: string) {
    const m = src.clone() as THREE.MeshStandardMaterial;
    if (st.color) m.color.setRGB(...st.color);
    if (st.foliage) {
      m.side = THREE.DoubleSide;
      m.alphaTest = 0.45;
      m.transparent = false;
      m.alphaToCoverage = false;
    }
    m.envMapIntensity = 1;
    const M = this.moss;
    return patch(m, {
      uniforms: { tMd: { value: M.diff }, tMn: { value: M.nor }, tMa: { value: M.arh }, uMoss: { value: st.moss ?? 0 }, uFoot: { value: st.foot ?? 0 }, uWind: this.wind },
      defines: { FOLIAGE: st.foliage ? 1 : 0 },
      vertexHead: 'varying vec3 vWp; varying vec3 vWn; varying float vH; uniform float uWind;',
      vertex: {
        '+begin_vertex': /* glsl */ `
          vH = transformed.y;
          #if FOLIAGE == 1
          {
            // vent léger : balancement croissant avec la hauteur, phase propre à chaque instance
            #ifdef USE_INSTANCING
            vec3 ip = instanceMatrix[3].xyz;
            #else
            vec3 ip = vec3(0.0);
            #endif
            float ph = dot(ip.xz, vec2(0.37, 0.71));
            float k = smoothstep(0.0, 1.2, transformed.y) * 0.035;
            transformed.x += sin(uWind * 1.7 + ph) * k + sin(uWind * 4.3 + ph * 2.0 + transformed.y * 3.0) * k * 0.35;
            transformed.z += cos(uWind * 1.3 + ph * 1.3) * k * 0.7;
          }
          #endif`,
        '+worldpos_vertex': /* glsl */ `
          #ifdef USE_INSTANCING
          vWp = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
          vWn = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
          vH *= length(instanceMatrix[1].xyz);
          #else
          vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vWn = normalize(mat3(modelMatrix) * objectNormal);
          #endif`,
      },
      fragmentHead: /* glsl */ `
        uniform sampler2D tMd, tMn, tMa; uniform float uMoss, uFoot;
        varying vec3 vWp; varying vec3 vWn; varying float vH;`,
      fragment: {
        '+map_fragment': /* glsl */ `
          float wMossP = 0.0;
          vec3 nMossP = vec3(0.0, 0.0, 1.0);
          if (uMoss > 0.0) {
            vec3 nW = normalize(vWn);
            float n1 = fbm3(vWp.xz * 1.3 + vWp.y * 0.7);
            float cover = smoothstep(0.25, 0.85, nW.y + (n1 - 0.5) * 0.6) * uMoss;
            vec2 muv = vWp.xz / 0.7;
            vec4 ma = texture2D(tMa, muv);
            wMossP = clamp((cover * 1.6 - 0.6 + (ma.b - 0.5) * 0.5) * 3.0 + 0.5, 0.0, 1.0) * smoothstep(0.03, 0.2, cover);
            vec3 mc = texture2D(tMd, muv).rgb * mix(vec3(0.62, 0.7, 0.5), vec3(0.85, 0.88, 0.58), vnoise(vWp.xz * 0.8));
            diffuseColor.rgb = mix(diffuseColor.rgb, mc, wMossP);
            nMossP = unpackN(texture2D(tMn, muv));
          }
          if (uFoot > 0.0) diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(0.0, uFoot, vH));
        `,
        '+roughnessmap_fragment': 'roughnessFactor = mix(roughnessFactor, 0.93, wMossP);',
        '+normal_fragment_maps': 'normal = normalize(mix(normal, normalize(normal + (viewMatrix * vec4(nMossP.x, 0.0, nMossP.y, 0.0)).xyz * 0.6), wMossP));',
        ...(st.foliage ? {
          // translucidité : la lumière du soleil traverse les feuilles vues à contre-jour
          '+lights_fragment_end': /* glsl */ `
            #if NUM_DIR_LIGHTS > 0
            {
              vec3 L = directionalLights[0].direction;
              float back = pow(saturate(dot(-geometryViewDir, L)), 3.0) * 0.6 + 0.12;
              float sh = 1.0;
              #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
              sh = getShadow(directionalShadowMap[0], directionalLightShadows[0].shadowMapSize, directionalLightShadows[0].shadowIntensity, directionalLightShadows[0].shadowBias, directionalLightShadows[0].shadowRadius, vDirectionalShadowCoord[0]);
              #endif
              reflectedLight.directDiffuse += diffuseColor.rgb * vec3(0.9, 1.0, 0.55) * directionalLights[0].color * back * sh * 0.5;
            }
            #endif`,
        } : {}),
      },
    }, 'foret-prop-' + id + (st.foliage ? '-f' : '') + ((st.moss ?? 0) > 0 ? '-m' : '') + ((st.foot ?? 0) > 0 ? '-p' : ''));
  }
}

export interface Inst { x: number; y: number; z: number; ry: number; s: number; rx?: number; rz?: number; tint?: number }

/** Lot d'instances d'une pièce, avec un InstancedMesh par LOD et répartition par distance. */
export class PropBatch {
  group = new THREE.Group();
  private meshes: THREE.InstancedMesh[][] = [];
  private mats: THREE.Matrix4[] = [];
  private cols: THREE.Color[] = [];
  private last = new THREE.Vector3(1e9, 0, 0);

  constructor(lib: PropLib, public part: string, public inst: Inst[], private st: PropStyle) {
    const lods = lib.part(part);
    const q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const tint = st.tint ?? 0.12;
    for (const i of inst) {
      e.set(i.rx ?? 0, i.ry, i.rz ?? 0, 'YXZ');
      q.setFromEuler(e);
      this.mats.push(new THREE.Matrix4().compose(p.set(i.x, i.y, i.z), q, s.setScalar(i.s)));
      const k = i.tint ?? (Math.random() - 0.5);
      this.cols.push(new THREE.Color(1 + k * tint, 1 + k * tint * 0.8, 1 + k * tint * 0.5));
    }
    for (const lod of lods) {
      const row: THREE.InstancedMesh[] = [];
      for (const { geo, mat } of lod) {
        const m = new THREE.InstancedMesh(geo, mat, Math.max(1, inst.length));
        m.count = 0;
        m.castShadow = st.shadow ?? true;
        m.receiveShadow = true;
        m.frustumCulled = true;
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, inst.length) * 3), 3);
        row.push(m);
        this.group.add(m);
      }
      this.meshes.push(row);
    }
  }

  update(cam: THREE.Vector3, force = false) {
    if (!force && cam.distanceToSquared(this.last) < 1.5 * 1.5) return;
    this.last.copy(cam);
    const d = this.st.lodDist ?? [25, 70, 180];
    const n = this.meshes.length;
    const counts = new Array(n).fill(0);
    for (let k = 0; k < this.inst.length; k++) {
      const i = this.inst[k];
      const dist = Math.hypot(i.x - cam.x, i.y - cam.y, i.z - cam.z) / Math.max(0.5, Math.sqrt(i.s));
      let l = 0;
      while (l < d.length && dist > d[l]) l++;
      if (l >= n) { if (l >= d.length) continue; l = n - 1; }
      for (const m of this.meshes[l]) {
        m.setMatrixAt(counts[l], this.mats[k]);
        m.setColorAt(counts[l], this.cols[k]);
      }
      counts[l]++;
    }
    this.meshes.forEach((row, l) => row.forEach((m) => {
      m.count = counts[l];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.visible = counts[l] > 0;
      if (counts[l] > 0) m.computeBoundingSphere();
    }));
  }
}
