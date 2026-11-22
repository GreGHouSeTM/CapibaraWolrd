// Éclairage indirect de la zone « forêt » en WebGPU.
//  - ForetGINode remplace l'IBL de three.js pour toutes les matières de la démo : la lumière diffuse indirecte vient de la
//    grille de sondes d'irradiance cuite (harmoniques sphériques L1, plusieurs heures en fondu) ; tant qu'aucune sonde
//    n'est chargée (ou hors de la grille), elle vient du ciel (HDRI) atténué par la carte de densité de la canopée.
//    Le spéculaire indirect reste l'HDRI préfiltrée, occultée par la canopée et par le rapport sonde / ciel.
//  - ForetLightingModel : modèle physique de three.js plus, au besoin, translucidité des aiguilles et des feuilles
//    (lumière du soleil vue à contre-jour) et atténuation de la lumière directe (occlusion propre du houppier).
//  - ForetMaterial : MeshStandardNodeMaterial qui branche les deux.
import * as THREE from 'three';
import * as WG from 'three/webgpu';
const { LightingNode, MeshStandardNodeMaterial, PhysicalLightingModel } = WG as any;
import * as TSL from 'three/tsl';
// les types TSL de @types/three sont trop stricts pour des fonctions génériques : nœuds manipulés en « any »
const {
  Fn, float, vec2, vec3, vec4, uniform, texture, texture3D, mix, clamp, max, min, dot, pow, smoothstep, normalize,
  positionWorld, normalWorld, positionViewDirection, normalView, cameraWorldMatrix, roughness, diffuseColor,
  pmremTexture, luminance, select, abs, If,
} = TSL as any;

type N = any;

/** État global (une seule scène « forêt » à la fois). */
export const GI = {
  env: null as THREE.Texture | null,
  envIntensity: uniform(1.0),
  envTint: uniform(new THREE.Color(1, 1, 1)),
  canopyTex: null as THREE.Texture | null,
  canopyRect: uniform(new THREE.Vector4(-120, -125, 1 / 240, 1 / 240)),
  canopyStr: uniform(1.0),
  /** 0 = ciel occulté par la canopée seulement ; 1 = sondes */
  probeMix: uniform(0.0),
  /** mode de cuisson : 0 normal, 1 = ciel occulté seul (première passe de cuisson) */
  probes: null as null | ProbeSet,
};

/** Grille de sondes (repère : x, z sur le sol, y = hauteur au-dessus du relief). */
export interface ProbeSet {
  /** 3 textures 3D (R, G, B) × N heures ; chaque texel = (L0, L1x, L1y, L1z) */
  tex: THREE.Data3DTexture[][];
  height: THREE.DataTexture;
  /** x0, z0, 1/largeur, 1/profondeur */
  rect: THREE.Vector4;
  /** hauteur couverte par la grille au-dessus du sol (m) */
  top: number;
  /** clés : indice de l'heure A, B, et fondu (uniformes) */
  a: { value: number }; b: { value: number }; t: N;
  /** textures liées dans les nœuds : la clé A et la clé B (on échange les .value) */
  slotA: N[]; slotB: N[];
}

export const canopyVis = Fn(([p]: [N]) => {
  const d = texture(GI.canopyTex!, p.xz.sub(GI.canopyRect.xy).mul(GI.canopyRect.zw)).r;
  return mix(float(1), float(0.16), d.mul(GI.canopyStr));
});

/** Irradiance L1 d'une texture de sonde (coefficients déjà convolués par le cosinus). */
const shEval = (c: N, n: N): N => max(c.x.add(dot(c.yzw, n)), 0);

/** Irradiance des sondes au point p (normale n, monde), et poids de validité (1 dans la grille, 0 au-delà). */
export function probeIrradiance(p: N, n: N): { E: N; w: N } {
  const P = GI.probes!;
  const R = uniform(P.rect);
  const uvxz = p.xz.sub(R.xy).mul(R.zw);
  const gh = texture(P.height, uvxz).r;
  // décalage le long de la normale : évite que la sonde voisine, enfouie ou derrière la surface, déborde
  const q = p.add(n.mul(0.35));
  const w = clamp(q.y.sub(gh).div(P.top), 0, 1);
  const uvw = vec3(q.xz.sub(R.xy).mul(R.zw), w);
  const ev = (slots: N[]) => vec3(shEval(slots[0].sample(uvw), n), shEval(slots[1].sample(uvw), n), shEval(slots[2].sample(uvw), n));
  const E = mix(ev(P.slotA), ev(P.slotB), P.t);
  const edge = min(min(uvxz.x, uvxz.x.oneMinus()), min(uvxz.y, uvxz.y.oneMinus()));
  return { E, w: smoothstep(0.0, 0.04, edge) };
}

export class ForetGINode extends LightingNode {
  static get type() { return 'ForetGINode'; }

  setup(builder: any) {
    const ctx = builder.context;
    const env = pmremTexture(GI.env!);
    const nW = normalWorld;
    const wp = positionWorld;
    const cv = canopyVis(wp);
    // spéculaire : direction réfléchie (mélangée à la normale pour les surfaces rugueuses, comme three.js)
    const rv = positionViewDirection.negate().reflect(normalView);
    const rvm = pow(roughness, 4).mix(rv, normalView).normalize().transformDirection(cameraWorldMatrix);
    const tint = vec3(GI.envTint);
    const rad = pmremTexture(GI.env!, rvm, roughness).rgb.mul(GI.envIntensity).mul(tint);
    const sky = pmremTexture(GI.env!, nW, float(1)).rgb.mul(Math.PI).mul(GI.envIntensity).mul(tint);
    let E: N = sky.mul(cv);
    let spec: N = cv;
    if (GI.probes) {
      const pr = probeIrradiance(wp, nW);
      const k = pr.w.mul(GI.probeMix);
      E = mix(E, pr.E, k);
      // occlusion spéculaire : part du ciel que voit la sonde (rapport des luminances), bornée
      const occ = clamp(luminance(pr.E).div(max(luminance(sky), 1e-4)), 0.05, 1.0);
      spec = mix(cv, occ, k);
    }
    void env;
    ctx.iblIrradiance.addAssign(E);
    ctx.radiance.addAssign(rad.mul(spec));
  }
}

export interface Translucency { tint: THREE.Color; k: number; pow: number; amp: number; base: number }

export class ForetLightingModel extends PhysicalLightingModel {
  constructor(private mat: ForetMaterial) { super(); }

  direct(params: any, builder: any) {
    const m = this.mat;
    const p = m.directScale ? { ...params, lightColor: params.lightColor.mul(m.directScale) } : params;
    super.direct(p, builder);
    const T = m.translucency;
    if (T && params.lightNode?.light?.isDirectionalLight) {
      const back = pow(clamp(dot(positionViewDirection.negate(), params.lightDirection), 0, 1), T.pow).mul(T.amp).add(T.base);
      params.reflectedLight.directDiffuse.addAssign(diffuseColor.rgb.mul(vec3(T.tint)).mul(params.lightColor).mul(back).mul(T.k));
    }
  }
}

export class ForetMaterial extends MeshStandardNodeMaterial {
  translucency: Translucency | null = null;
  /** facteur appliqué à la lumière directe (nœud), ou null */
  directScale: N = null;
  constructor(params?: any) {
    super();
    this.setValues(params ?? {});
  }
  setupEnvironment(_builder: any): any { return GI.env ? new ForetGINode() : null; }
  setupLightingModel(): any { return new ForetLightingModel(this); }
}

/** Convertit une matière classique (capybara, chapeau…) en ForetMaterial (même apparence, éclairage de la forêt). */
export function toForetMaterial(src: THREE.Material): any {
  const s = src as THREE.MeshStandardMaterial;
  if ((src as any).isNodeMaterial) return src;
  if (!(s.isMeshStandardMaterial || (src as any).isMeshLambertMaterial || (src as any).isMeshPhongMaterial)) return src;
  const m = new ForetMaterial();
  const keys = ['name', 'color', 'map', 'normalMap', 'normalScale', 'roughness', 'metalness', 'roughnessMap', 'metalnessMap', 'aoMap', 'aoMapIntensity',
    'emissive', 'emissiveMap', 'emissiveIntensity', 'alphaMap', 'alphaTest', 'transparent', 'opacity', 'side', 'vertexColors', 'flatShading',
    'depthWrite', 'depthTest', 'envMapIntensity', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'visible', 'toneMapped', 'fog'];
  for (const k of keys) {
    const v = (src as any)[k];
    if (v === undefined) continue;
    const cur = (m as any)[k];
    if (cur && cur.copy && v && v.copy) cur.copy(v); else (m as any)[k] = v;
  }
  if (!s.isMeshStandardMaterial) { m.roughness = 0.75; m.metalness = 0; }
  m.userData = src.userData;
  return m;
}

export { vec2, vec4, select, abs, If, texture3D };
