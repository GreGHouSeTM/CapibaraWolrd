// Épicéas (tools/foret/bl_spruce.py) : 6 variantes × 3 LOD + imposteurs 8 vues ; écorce photoscannée, rameaux en cartes
// (bl_twig.py) avec translucidité, ombrage de volume du houppier et vent ; placement écologique dans la zone et l'anneau.
import * as THREE from 'three';
import { bakeGeometry, glb, tex, texSet } from './tex';
import { BASE, ForetData } from './data';
import { patch } from './glsl';
import { addCircle } from '../../world/physics';

interface Variant { name: string; H: number; R: number; young?: boolean }
export interface TreeInst { x: number; y: number; z: number; ry: number; s: number; v: string }

const ADULTS = ['a', 'b', 'c', 'd'];

/** Placement : disques de Poisson (espacement 3,2-4,5 m), hors sentier, escalier, flaque et roche ; jeunes en lisière. */
export function placeTrees(D: ForetData, density: number): TreeInst[] {
  let seed = 9173;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out: TreeInst[] = [];
  const S = D.scene;
  const m = [0, 0, 0, 0];
  const steps = S.steps;
  const nearStairs = (x: number, z: number) => steps.some((s) => Math.abs(x - s.x) < s.width / 2 + 1.2 && z < s.z + 0.8 && z > s.z - s.run - 0.8);
  const slope = (x: number, z: number) => Math.hypot(D.height(x + 0.5, z) - D.height(x - 0.5, z), D.height(x, z + 0.5) - D.height(x, z - 0.5));
  const grid = new Map<string, TreeInst[]>();
  const key = (x: number, z: number) => `${Math.floor(x / 6)},${Math.floor(z / 6)}`;
  const tooClose = (x: number, z: number, r: number) => {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const a = grid.get(`${Math.floor(x / 6) + i},${Math.floor(z / 6) + j}`);
      if (a) for (const t of a) if (Math.hypot(t.x - x, t.z - z) < r * (t.v.startsWith('j') ? 0.55 : 1)) return true;
    }
    return false;
  };
  const tryAdd = (x: number, z: number, v: string, r: number, s: number) => {
    if (tooClose(x, z, r)) return false;
    const t = { x, y: D.height(x, z) - 0.12, z, ry: rnd() * Math.PI * 2, s, v };
    out.push(t);
    const k = key(x, z);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k)!.push(t);
    return true;
  };
  const ok = (x: number, z: number, pathMargin: number) => {
    if (D.inZone(x, z)) {
      D.mask(x, z, m);
      if (m[0] > pathMargin || m[2] > 0.3 || nearStairs(x, z)) return false;
      if (Math.hypot(x - S.clearing.x, z - S.clearing.z) < S.clearing.r * 0.55) return false;
      // dégagement des points de vue des captures (nuit : derrière la flaque ; jour : premier plan du sentier)
      if (Math.hypot(x + 15.6, z - 25.4) < 3.2 || Math.hypot(x + 0.9, z - 11.5) < 2.2) return false;
    }
    return slope(x, z) < 0.75;
  };
  // adultes : zone (dense) puis anneau jusqu'à 230 m (impostors), densité décroissante
  const N = Math.round(5200 * density);
  for (let i = 0; i < N; i++) {
    const R = 230 * Math.sqrt(rnd());
    const a = rnd() * Math.PI * 2;
    const x = Math.cos(a) * R, z = -5 + Math.sin(a) * R;
    if (R > 60 && rnd() > 0.55) continue;
    if (!ok(x, z, 0.05)) continue;
    const v = ADULTS[Math.floor(rnd() * 4)];
    tryAdd(x, z, v, 3.4 + rnd() * 1.3, 0.85 + rnd() * 0.3);
  }
  // jeunes épicéas : trouées et bords du sentier côté vallée (premier plan de la référence)
  for (let i = 0; i < Math.round(900 * density); i++) {
    const x = -48 + rnd() * 96, z = -43 + rnd() * 76;
    if (!ok(x, z, 0.02)) continue;
    D.mask(x, z, m);
    tryAdd(x, z, rnd() < 0.5 ? 'j1' : 'j2', 1.9, 0.7 + rnd() * 0.6);
  }
  return out;
}

export class Forest {
  group = new THREE.Group();
  wind = { value: 0 };
  private lodMeshes = new Map<string, THREE.InstancedMesh[][]>(); // variante → [lod][primitive]
  private imp = new Map<string, THREE.InstancedMesh>();
  private byVar = new Map<string, TreeInst[]>();
  private mats = new Map<string, THREE.Matrix4[]>();
  private last = new THREE.Vector3(1e9, 0, 0);
  variants: Variant[] = [];
  lod: number[] = [26, 70, 140];

  async build(D: ForetData, trees: TreeInst[], lod0: number, shadows: boolean) {
    this.group.name = 'epiceas';
    this.lod = [lod0, 75, 150];
    const [g, info, bark, rDiff, rNor, iDiff, iNor] = await Promise.all([
      glb('epiceas.glb'), fetch(BASE() + 'epiceas.json').then((r) => r.json()), texSet('ecorce'),
      tex('tex/rameau_diff.webp', true), tex('tex/rameau_nor.webp', false), tex('tex/epicea_imp_diff.webp', true, { repeat: false }), tex('tex/epicea_imp_nor.webp', false, { repeat: false }),
    ]);
    this.variants = info.variants;
    g.scene.updateMatrixWorld(true);
    const barkMat = this.barkMaterial(bark);
    const folMat = this.foliageMaterial(rDiff, rNor);
    for (const t of trees) {
      if (!this.byVar.has(t.v)) this.byVar.set(t.v, []);
      this.byVar.get(t.v)!.push(t);
      // collision du fût dans la zone jouable
      if (D.inZone(t.x, t.z, -2)) {
        const V = info.variants.find((v: Variant) => v.name === t.v);
        addCircle(t.x, t.z, (V.young ? 0.12 : 0.012 * V.H + 0.1) * t.s, t.y - 1, t.y + 8, false, 'arbre');
      }
    }
    const q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const [v, list] of this.byVar) {
      this.mats.set(v, list.map((t) => new THREE.Matrix4().compose(p.set(t.x, t.y, t.z), q.setFromAxisAngle(up, t.ry), sc.setScalar(t.s))));
      const lods: THREE.InstancedMesh[][] = [];
      for (let l = 0; l < 3; l++) {
        const row: THREE.InstancedMesh[] = [];
        for (const part of ['ecorce', 'rameaux']) {
          const o = g.scene.getObjectByName(`epicea_${v}_${part}_lod${l}`);
          if (!o) throw new Error('épicéa absent : ' + v + part + l);
          o.traverse((c) => {
            const mm = c as THREE.Mesh;
            if (!mm.isMesh) return;
            const geo = bakeGeometry(mm.geometry, mm.matrixWorld);
            const im = new THREE.InstancedMesh(geo, part === 'ecorce' ? barkMat : folMat, list.length);
            im.count = 0;
            im.castShadow = shadows && l < 2;
            im.receiveShadow = true;
            row.push(im);
            this.group.add(im);
          });
        }
        lods.push(row);
      }
      this.lodMeshes.set(v, lods);
      const ir = info.impostor.rows[v];
      if (ir) {
        const pg = new THREE.PlaneGeometry(1, 1);
        pg.translate(0, 0.5, 0);
        const im = new THREE.InstancedMesh(pg, this.impostorMaterial(iDiff, iNor, ir.row, Object.keys(info.impostor.rows).length, ir.width, ir.H), list.length);
        im.count = 0;
        im.castShadow = false;
        im.receiveShadow = false;
        im.frustumCulled = false;
        this.imp.set(v, im);
        this.group.add(im);
      }
    }
  }

  /** Calque des reflets : LOD2 et imposteurs seulement. */
  reflectionLayer(l: number) {
    for (const lods of this.lodMeshes.values()) for (const m of lods[2]) m.layers.enable(l);
    for (const m of this.imp.values()) m.layers.enable(l);
  }

  update(cam: THREE.Vector3, t: number) {
    this.wind.value = t;
    if (cam.distanceToSquared(this.last) < 1) return;
    this.last.copy(cam);
    for (const [v, list] of this.byVar) {
      const lods = this.lodMeshes.get(v)!;
      const imp = this.imp.get(v);
      const mats = this.mats.get(v)!;
      const c = [0, 0, 0, 0];
      for (let k = 0; k < list.length; k++) {
        const tr = list[k];
        const d = Math.hypot(tr.x - cam.x, tr.z - cam.z);
        let l = d < this.lod[0] ? 0 : d < this.lod[1] ? 1 : d < this.lod[2] ? 2 : 3;
        if (l === 3 && !imp) l = 2;
        if (l < 3) for (const m of lods[l]) m.setMatrixAt(c[l], mats[k]);
        else imp!.setMatrixAt(c[3], mats[k]);
        c[l]++;
      }
      lods.forEach((row, l) => row.forEach((m) => { m.count = c[l]; m.instanceMatrix.needsUpdate = true; m.visible = c[l] > 0; if (c[l]) m.computeBoundingSphere(); }));
      if (imp) { imp.count = c[3]; imp.instanceMatrix.needsUpdate = true; imp.visible = c[3] > 0; }
    }
  }

  private barkMaterial(b: { diff: THREE.Texture; nor: THREE.Texture; arh: THREE.Texture }) {
    const rep = (t: THREE.Texture) => { const c = t.clone(); c.repeat.set(1 / 1.2, 1 / 1.2); c.needsUpdate = true; return c; };
    const m = new THREE.MeshStandardMaterial({ map: rep(b.diff), normalMap: rep(b.nor), roughnessMap: rep(b.arh), aoMap: rep(b.arh), roughness: 1, color: 0x8c857c });
    m.roughnessMap!.channel = 0;
    return patch(m, {
      uniforms: { uWind: this.wind },
      vertexHead: 'attribute vec2 uv1; varying vec3 vWp; uniform float uWind;',
      vertex: {
        '+begin_vertex': windGlsl,
        '+worldpos_vertex': 'vWp = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;',
      },
      fragmentHead: 'varying vec3 vWp;',
      fragment: {
        // écorce : lichens gris-vert et mousse au pied du fût, plus sombre et humide en bas
        '+map_fragment': `
          float lic = smoothstep(0.55, 0.75, vnoise(vWp.xz * 7.0 + vWp.y * 1.3)) * 0.4;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.46, 0.38), lic);
        `,
      },
    }, 'foret-ecorce');
  }

  private foliageMaterial(diff: THREE.Texture, nor: THREE.Texture) {
    const m = new THREE.MeshStandardMaterial({ map: diff, normalMap: nor, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.78, color: 0xd8dccf });
    m.normalScale.set(0.7, 0.7);
    return patch(m, {
      uniforms: { uWind: this.wind },
      vertexHead: 'attribute vec2 uv1; varying vec2 vVent; uniform float uWind;',
      vertex: { '+begin_vertex': windGlsl + 'vVent = uv1;' },
      fragmentHead: 'varying vec2 vVent;',
      fragment: {
        // occlusion du houppier : l'intérieur (près du fût) et le bas de la couronne sont plus sombres
        '+map_fragment': `
          float inner = smoothstep(0.2, 2.6, vVent.x);
          float crownAO = mix(0.28, 1.0, inner) * mix(0.7, 1.0, smoothstep(0.35, 0.9, vVent.y));
          diffuseColor.rgb *= mix(vec3(0.92, 0.96, 1.0), vec3(1.04, 1.0, 0.92), vnoise(vVent * 3.0));
        `,
        aomap_fragment: `
          reflectedLight.indirectDiffuse *= crownAO;
          reflectedLight.indirectSpecular *= crownAO * crownAO;
          reflectedLight.directDiffuse *= mix(0.55, 1.0, crownAO);
        `,
        '+lights_fragment_end': translucency,
      },
    }, 'foret-rameaux');
  }

  private impostorMaterial(diff: THREE.Texture, nor: THREE.Texture, row: number, rows: number, width: number, H: number) {
    const m = new THREE.MeshStandardMaterial({ map: diff, alphaTest: 0.5, roughness: 0.85, color: 0xd8dccf, side: THREE.DoubleSide });
    return patch(m, {
      uniforms: { tNor: { value: nor }, uRow: { value: row }, uRows: { value: rows }, uSize: { value: new THREE.Vector2(width, H * 1.04) } },
      vertexHead: 'uniform float uRow, uRows; uniform vec2 uSize; varying vec2 vImp; varying float vBlend; varying vec2 vImp2; varying vec3 vR; varying vec3 vF;',
      vertex: {
        project_vertex: /* glsl */ `
          vec3 ip = instanceMatrix[3].xyz;
          float isc = length(instanceMatrix[0].xyz);
          vec3 toC = cameraPosition - ip; toC.y = 0.0; toC = normalize(toC);
          vec3 rgt = normalize(cross(vec3(0.0, 1.0, 0.0), toC));
          vec3 wp = ip + rgt * position.x * uSize.x * isc + vec3(0.0, 1.0, 0.0) * position.y * uSize.y * isc;
          vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          // vue la plus proche dans le repère propre de l'arbre (lacet de l'instance)
          float ry = atan(instanceMatrix[2].x, instanceMatrix[2].z);
          float az = atan(toC.x, toC.z) - ry;
          float f = mod(az / 6.2831853 * 8.0 + 16.0, 8.0);
          float k0 = floor(f); vBlend = f - k0;
          float k1 = mod(k0 + 1.0, 8.0);
          vec2 cu = vec2(position.x + 0.5, position.y);
          vImp = vec2((k0 + cu.x) / 8.0, (uRows - 1.0 - uRow + cu.y) / uRows);
          vImp2 = vec2((k1 + cu.x) / 8.0, vImp.y);
          vR = rgt; vF = toC;
        `,
      },
      fragmentHead: 'uniform sampler2D tNor; varying vec2 vImp; varying float vBlend; varying vec2 vImp2; varying vec3 vR; varying vec3 vF;',
      fragment: {
        map_fragment: `
          vec4 i0 = texture2D(map, vImp), i1 = texture2D(map, vImp2);
          vec4 sampledDiffuseColor = mix(i0, i1, vBlend);
          diffuseColor *= sampledDiffuseColor;
        `,
        normal_fragment_maps: `
          vec3 nn = mix(texture2D(tNor, vImp).xyz, texture2D(tNor, vImp2).xyz, vBlend) * 2.0 - 1.0;
          vec3 nw = normalize(vR * nn.x + vec3(0.0, 1.0, 0.0) * nn.y + vF * nn.z);
          normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
        `,
      },
    }, 'foret-imposteur-' + row);
  }
}

// vent : balancement des branches (distance au fût) et léger roulis du houppier (hauteur), phase par arbre
const windGlsl = /* glsl */ `
  {
    vec3 ip = instanceMatrix[3].xyz;
    float ph = dot(ip.xz, vec2(0.13, 0.29));
    float dist = uv1.x, hh = uv1.y;
    float sway = sin(uWind * 0.6 + ph) * 0.06 * hh * hh;
    float br = (sin(uWind * 1.9 + ph * 3.0 + position.y * 0.4) * 0.5 + sin(uWind * 3.7 + ph * 5.0 + position.x) * 0.25) * 0.025 * dist;
    transformed.x += sway + br * 0.6;
    transformed.z += sway * 0.6;
    transformed.y += br;
  }
`;

export const translucency = /* glsl */ `
  #if NUM_DIR_LIGHTS > 0
  {
    vec3 L = directionalLights[0].direction;
    float back = pow(saturate(dot(-geometryViewDir, L)), 4.0) * 0.8 + 0.15;
    float sh = 1.0;
    #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    sh = getShadow(directionalShadowMap[0], directionalLightShadows[0].shadowMapSize, directionalLightShadows[0].shadowIntensity, directionalLightShadows[0].shadowBias, directionalLightShadows[0].shadowRadius, vDirectionalShadowCoord[0]);
    #endif
    reflectedLight.directDiffuse += diffuseColor.rgb * vec3(0.75, 1.0, 0.45) * directionalLights[0].color * back * sh * 0.45;
  }
  #endif
`;
