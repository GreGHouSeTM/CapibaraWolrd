// Bibliothèque des modèles 3D photoscannés (Poly Haven, CC0) : chargement, cache, instanciation et LOD.
//
// Les .glb sont produits par `tools/polyhaven/fetch.py` dans `public/assets/models/nature|props/` et décrits par
// `public/assets/models/manifest.json` (id, fichier, nœuds par LOD, triangles, dimensions, distances de LOD, ombre…).
// Un fichier peut contenir plusieurs modèles (ensembles découpés : `rock_moss_set_01_a`, `_b`…) ; toutes les LOD d'un
// modèle sont dans le même fichier (nœuds `<id>_lod0`, `_lod1`, `_lod2`) et partagent ses textures (WebP).
// La géométrie est compressée par gltfpack (EXT_meshopt_compression + KHR_mesh_quantization) : décodeur meshopt de three.
//
// Unités : mètres, Y vers le haut, origine au centre du bas de la boîte englobante (l'objet est « posé » en y = 0).
//
// Utilisation typique (Végétation, Décor, Intégration village) :
//
//   import { Models } from '../core/models';
//   await Models.load(['rock_moss_set_01_a', 'fern_02', 'wooden_bucket_01'], (p) => ui.setLoading(0.2 + p * 0.1));
//   const mats = spots.map(([x, z], i) => Models.groundMatrix('rock_moss_set_01_a', x, z, heightAt, { yaw: i * 2.1, scale: 0.8 }));
//   scene.add(Models.instances('rock_moss_set_01_a', mats));        // InstancedMesh par LOD et par primitive
//   const seau = Models.object('wooden_bucket_01');                  // objet unique (THREE.LOD), à placer à la main
//   // dans la boucle de jeu, une fois par image (choix des LOD + élimination hors champ) :
//   Models.update(camera);
//
// Règles de la bible (§11) appliquées par défaut : distances de LOD du manifeste (objets 25/60 m, rochers 30/90/300 m),
// objets cachés au-delà de la dernière distance, ombres seulement à moins de `Models.shadowDistance` (80 m) et pas pour les
// objets marqués `castShadow: false` (petits objets < 0,5 m).
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// ------------------------------------------------------------------------------------------------ manifeste
export interface ModelLodInfo {
  /** Fichier .glb (relatif à assets/models/). */
  file: string;
  /** Nom du nœud glTF de cette LOD. */
  node: string;
  triangles: number;
}

export interface ModelInfo {
  file: string;
  /** Id Poly Haven d'origine. */
  source: string;
  url: string;
  license: 'CC0';
  authors: string[];
  /** rocher, paroi, mousse, fougere, racine, souche, tronc, arbuste, seau, tonneau, caisse, panier, poterie, fruit… */
  category: string;
  usage: string;
  lods: ModelLodInfo[];
  /** Bascule LOD0→LOD1, LOD1→LOD2… ; la dernière distance masque l'objet (m). */
  lodDistances: number[];
  /** Taille [x, y, z] en mètres (y = hauteur). */
  dimensions: [number, number, number];
  /** Rayon de la sphère englobante centrée sur l'origine (m). */
  radius: number;
  castShadow: boolean;
  /** Enfoncement conseillé dans le sol (m, à l'échelle 1) pour que la base irrégulière ne flotte pas. */
  sink: number;
  /** Matériau à transparence découpée (feuillage). */
  alpha: boolean;
  texture: number;
  tint: string;
}

export interface ModelManifest {
  version: number;
  totalBytes: number;
  files: Record<string, { bytes: number; source: string }>;
  models: Record<string, ModelInfo>;
}

/** Une primitive d'une LOD : géométrie + matériau + matrice locale (inclut la déquantification de gltfpack). */
export interface ModelPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrix: THREE.Matrix4;
}

export interface ModelLod {
  parts: ModelPart[];
  triangles: number;
}

export interface Model {
  id: string;
  info: ModelInfo;
  lods: ModelLod[];
  /** Boîte englobante du LOD0 (repère du modèle). */
  box: THREE.Box3;
  /** Sphère englobante du LOD0 (repère du modèle). */
  sphere: THREE.Sphere;
}

export interface InstanceOptions {
  /** Distances de LOD (remplace celles du manifeste). La dernière masque l'objet. */
  lodDistances?: number[];
  /** Projette une ombre (défaut : manifeste). */
  castShadow?: boolean;
  /** Reçoit les ombres (défaut : vrai). */
  receiveShadow?: boolean;
  /** Distance au-delà de laquelle les LOD ne projettent plus d'ombre (défaut : Models.shadowDistance). */
  shadowDistance?: number;
  /** Teinte par instance (multiplie la texture) : une couleur par matrice. */
  colors?: (THREE.Color | number)[];
  /** Variation aléatoire de luminosité par instance (0 = aucune, 0,15 = ±15 %), si `colors` n'est pas fourni. */
  brightnessJitter?: number;
  /** Nom de l'objet (débogage). */
  name?: string;
}

const BASE = (import.meta.env?.BASE_URL ?? './') + 'assets/models/';

// ------------------------------------------------------------------------------------------------ chargement
let manifestPromise: Promise<ModelManifest> | null = null;
let loader: GLTFLoader | null = null;
const fileCache = new Map<string, Promise<GLTF>>();
const models = new Map<string, Model>();
const live = new Set<ModelInstances>();
let anisotropy = 4;

function getLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

function loadManifest(): Promise<ModelManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch(BASE + 'manifest.json').then((r) => {
      if (!r.ok) throw new Error('Manifeste des modèles introuvable : ' + BASE + 'manifest.json');
      return r.json() as Promise<ModelManifest>;
    });
  }
  return manifestPromise;
}

function loadFile(file: string, onBytes: (loaded: number) => void): Promise<GLTF> {
  let p = fileCache.get(file);
  if (!p) {
    p = getLoader().loadAsync(BASE + file, (e) => onBytes(e.loaded));
    fileCache.set(file, p);
  }
  return p;
}

/** Réglage des matériaux importés : feuillage en transparence découpée (pas de tri), textures filtrées. */
function prepareMaterial(m: THREE.Material, alpha: boolean) {
  const sm = m as THREE.MeshStandardMaterial;
  if (alpha || sm.alphaTest > 0 || sm.transparent) {
    sm.transparent = false;
    sm.alphaTest = Math.max(sm.alphaTest, 0.5);
    sm.depthWrite = true;
    sm.side = THREE.DoubleSide;
    // le feuillage photoscanné est très mat
    if (!sm.roughnessMap) sm.roughness = Math.max(sm.roughness, 0.8);
  } else {
    sm.side = THREE.FrontSide;
  }
  for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'] as const) {
    const t = sm[k];
    if (t) t.anisotropy = anisotropy;
  }
  // l'occlusion ambiante cuite de Poly Haven est discrète ; le N8AO du jeu fait le reste
  if (sm.aoMap) sm.aoMapIntensity = 0.8;
}

function buildModel(id: string, info: ModelInfo, gltf: GLTF): Model {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const lods: ModelLod[] = info.lods.map((l) => {
    const node = root.getObjectByName(l.node);
    if (!node) throw new Error(`Modèle ${id} : nœud ${l.node} absent de ${l.file}`);
    const parts: ModelPart[] = [];
    node.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) prepareMaterial(mat, info.alpha);
      // une primitive glTF = un Mesh three ; les multi-matériaux (groupes) restent rares ici
      parts.push({ geometry: mesh.geometry, material: mats[0], matrix: mesh.matrixWorld.clone() });
    });
    return { parts, triangles: l.triangles };
  });
  const box = new THREE.Box3();
  for (const p of lods[0].parts) {
    if (!p.geometry.boundingBox) p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox!.clone().applyMatrix4(p.matrix));
  }
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  return { id, info, lods, box, sphere };
}

// ------------------------------------------------------------------------------------------------ instances
const _m = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();
const _cam = new THREE.Vector3();
const _sphere = new THREE.Sphere();
const _v = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * Ensemble d'instances d'un modèle : une `InstancedMesh` par LOD et par primitive (donc 1 à 3 appels de dessin par
 * primitive, quel que soit le nombre d'instances). `update(camera)` répartit les instances entre les LOD selon leur
 * distance à la caméra, élimine celles hors du champ ou trop lointaines et ne réécrit les tampons que si la caméra a bougé.
 */
export class ModelInstances extends THREE.Group {
  readonly model: Model;
  readonly count: number;
  /** Matrices monde des instances (16 nombres par instance). Après modification : `markDirty()`. */
  readonly matrices: Float32Array;
  /** Meshes instanciés : [lod][primitive]. */
  readonly meshes: THREE.InstancedMesh[][];
  readonly distances: number[];
  /** Instances visibles par LOD après la dernière mise à jour. */
  readonly visibleByLod: number[];
  private centers: Float32Array;
  private radii: Float32Array;
  private colors: Float32Array | null = null;
  private dirty = true;
  private lastCam = new Float32Array(32);
  private lodOf: Int8Array;

  constructor(model: Model, matrices: ArrayLike<number> | THREE.Matrix4[], opts: InstanceOptions = {}) {
    super();
    this.model = model;
    this.name = opts.name ?? 'modeles:' + model.id;
    const arr = matrices as THREE.Matrix4[];
    const n = Array.isArray(arr) && arr.length && arr[0] instanceof THREE.Matrix4 ? arr.length : Math.floor((matrices as ArrayLike<number>).length / 16);
    this.count = n;
    this.matrices = new Float32Array(n * 16);
    if (n && arr[0] instanceof THREE.Matrix4) arr.forEach((m, i) => m.toArray(this.matrices, i * 16));
    else this.matrices.set(Array.from(matrices as ArrayLike<number>).slice(0, n * 16));
    this.centers = new Float32Array(n * 3);
    this.radii = new Float32Array(n);
    this.lodOf = new Int8Array(n).fill(-2);
    this.distances = (opts.lodDistances ?? model.info.lodDistances).slice(0, Math.max(1, model.lods.length));
    const nl = Math.min(model.lods.length, this.distances.length);
    this.visibleByLod = new Array(nl).fill(0);
    // couleurs par instance
    if (opts.colors || opts.brightnessJitter) {
      this.colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        if (opts.colors) _c.set(opts.colors[i % opts.colors.length] as THREE.ColorRepresentation);
        else {
          const k = 1 + (hash(i * 7.31 + model.id.length) * 2 - 1) * (opts.brightnessJitter ?? 0);
          _c.setRGB(k, k, k);
        }
        _c.toArray(this.colors, i * 3);
      }
    }
    const castDefault = opts.castShadow ?? model.info.castShadow;
    const shadowDist = opts.shadowDistance ?? Models.shadowDistance;
    this.meshes = [];
    for (let l = 0; l < nl; l++) {
      const start = l === 0 ? 0 : this.distances[l - 1];
      const row: THREE.InstancedMesh[] = [];
      for (const part of model.lods[l].parts) {
        const im = new THREE.InstancedMesh(part.geometry, part.material, Math.max(1, n));
        im.name = `${model.id}_lod${l}`;
        im.count = 0;
        im.frustumCulled = false; // élimination faite par instance dans update()
        im.castShadow = castDefault && start < shadowDist;
        im.receiveShadow = opts.receiveShadow ?? true;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (this.colors) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3), 3);
        im.matrixAutoUpdate = false;
        row.push(im);
        this.add(im);
      }
      this.meshes.push(row);
    }
    this.matrixAutoUpdate = false;
    this.computeBounds();
    live.add(this);
  }

  /** À appeler après avoir modifié `matrices`. */
  markDirty() {
    this.computeBounds();
    this.dirty = true;
  }

  private computeBounds() {
    const s = this.model.sphere;
    for (let i = 0; i < this.count; i++) {
      _m.fromArray(this.matrices, i * 16);
      _v.copy(s.center).applyMatrix4(_m);
      _v.toArray(this.centers, i * 3);
      this.radii[i] = s.radius * _m.getMaxScaleOnAxis();
    }
  }

  /** Choix des LOD et élimination hors champ ; ne fait rien si la caméra n'a pas bougé (sauf `force`). */
  update(camera: THREE.Camera, force = false) {
    camera.updateMatrixWorld();
    const e1 = camera.matrixWorld.elements, e2 = camera.projectionMatrix.elements;
    let same = !this.dirty && !force && Models.lodBias === this.lastBias;
    for (let k = 0; k < 16 && same; k++) if (this.lastCam[k] !== e1[k] || this.lastCam[16 + k] !== e2[k]) same = false;
    if (same) return;
    this.lastCam.set(e1, 0);
    this.lastCam.set(e2, 16);
    this.lastBias = Models.lodBias;
    this.dirty = false;
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    // le groupe peut être déplacé dans la scène : on travaille dans son repère monde
    this.updateMatrixWorld();
    const world = this.matrixWorld;
    const identity = isIdentity(world);
    _frustum.setFromProjectionMatrix(identity ? _pv : _m.multiplyMatrices(_pv, world));
    _cam.setFromMatrixPosition(camera.matrixWorld);
    if (!identity) _cam.applyMatrix4(_m.copy(world).invert());
    const bias = Models.lodBias;
    const nl = this.meshes.length;
    const d2 = this.distances.slice(0, nl).map((d) => (d * bias) ** 2);
    const counts = new Array(nl).fill(0);
    const c = this.centers;
    for (let i = 0; i < this.count; i++) {
      const dx = c[i * 3] - _cam.x, dy = c[i * 3 + 1] - _cam.y, dz = c[i * 3 + 2] - _cam.z;
      const dd = dx * dx + dy * dy + dz * dz;
      let lod = -1;
      for (let l = 0; l < nl; l++) if (dd < d2[l]) { lod = l; break; }
      if (lod >= 0) {
        // marge de 2 m : les ombres des objets juste hors champ restent visibles
        _sphere.center.set(c[i * 3], c[i * 3 + 1], c[i * 3 + 2]);
        _sphere.radius = this.radii[i] + 2;
        if (!_frustum.intersectsSphere(_sphere)) lod = -1;
      }
      if (lod < 0) continue;
      const slot = counts[lod]++;
      _m.fromArray(this.matrices, i * 16);
      const row = this.meshes[lod];
      for (let p = 0; p < row.length; p++) {
        const im = row[p];
        _mm.multiplyMatrices(_m, this.model.lods[lod].parts[p].matrix);
        _mm.toArray(im.instanceMatrix.array as Float32Array, slot * 16);
        if (this.colors && im.instanceColor) {
          const a = im.instanceColor.array as Float32Array;
          a[slot * 3] = this.colors[i * 3];
          a[slot * 3 + 1] = this.colors[i * 3 + 1];
          a[slot * 3 + 2] = this.colors[i * 3 + 2];
        }
      }
    }
    for (let l = 0; l < nl; l++) {
      this.visibleByLod[l] = counts[l];
      for (const im of this.meshes[l]) {
        im.count = counts[l];
        im.visible = counts[l] > 0;
        if (counts[l] > 0) {
          im.instanceMatrix.clearUpdateRanges();
          im.instanceMatrix.addUpdateRange(0, counts[l] * 16);
          im.instanceMatrix.needsUpdate = true;
          if (im.instanceColor) {
            im.instanceColor.clearUpdateRanges();
            im.instanceColor.addUpdateRange(0, counts[l] * 3);
            im.instanceColor.needsUpdate = true;
          }
        }
      }
    }
  }
  private lastBias = 1;

  /** Triangles affichés après la dernière mise à jour. */
  visibleTriangles() {
    let t = 0;
    this.visibleByLod.forEach((n, l) => (t += n * this.model.lods[l].triangles));
    return t;
  }

  /** Retire l'ensemble de la scène et libère ses tampons d'instances (la géométrie partagée reste en cache). */
  dispose() {
    live.delete(this);
    this.removeFromParent();
    for (const row of this.meshes) for (const im of row) im.dispose();
  }
}
const _mm = new THREE.Matrix4();

function isIdentity(m: THREE.Matrix4) {
  const e = m.elements;
  return e[0] === 1 && e[5] === 1 && e[10] === 1 && e[15] === 1 && e[12] === 0 && e[13] === 0 && e[14] === 0 && e[1] === 0 && e[2] === 0 && e[4] === 0 && e[6] === 0 && e[8] === 0 && e[9] === 0;
}

function hash(x: number) {
  const s = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ------------------------------------------------------------------------------------------------ API publique
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _qy = new THREE.Quaternion();

export const Models = {
  /** Multiplicateur global des distances de LOD (ex. 0,7 en qualité basse, 1,3 en haute). */
  lodBias: 1,
  /** Au-delà, les LOD ne projettent plus d'ombre (bible §11 : 80 m). */
  shadowDistance: 80,

  /** Manifeste (chargé une seule fois). */
  manifest: loadManifest as () => Promise<ModelManifest>,

  /** Ids disponibles, éventuellement filtrés par catégorie (« rocher », « fougere », « seau »…). */
  async ids(category?: string | string[]) {
    const m = await loadManifest();
    const cats = category == null ? null : Array.isArray(category) ? category : [category];
    return Object.keys(m.models).filter((id) => !cats || cats.includes(m.models[id].category));
  },

  /** Réglage de l'anisotropie des textures chargées ensuite (cf. `renderer.capabilities.getMaxAnisotropy()`). */
  setAnisotropy(a: number) {
    anisotropy = a;
  },

  /**
   * Charge (une seule fois) les modèles demandés et les met en cache. `onProgress(0..1)` suit les octets téléchargés,
   * pour l'écran de chargement. Les fichiers partagés par plusieurs ids ne sont téléchargés qu'une fois.
   */
  async load(ids: string[], onProgress?: (p: number) => void): Promise<Model[]> {
    const man = await loadManifest();
    const missing = ids.filter((id) => !man.models[id]);
    if (missing.length) throw new Error('Modèles inconnus du manifeste : ' + missing.join(', '));
    const files = [...new Set(ids.map((id) => man.models[id].file))];
    const total = files.reduce((s, f) => s + (man.files[f]?.bytes ?? 1), 0) || 1;
    const loaded = new Map<string, number>();
    const report = () => onProgress?.(Math.min(1, [...loaded.values()].reduce((a, b) => a + b, 0) / total));
    onProgress?.(0);
    await Promise.all(
      files.map(async (f) => {
        const gltf = await loadFile(f, (b) => {
          loaded.set(f, Math.min(b, man.files[f]?.bytes ?? b));
          report();
        });
        loaded.set(f, man.files[f]?.bytes ?? 1);
        report();
        for (const id of ids) if (man.models[id].file === f && !models.has(id)) models.set(id, buildModel(id, man.models[id], gltf));
      }),
    );
    onProgress?.(1);
    return ids.map((id) => models.get(id)!);
  },

  /** Modèle déjà chargé (sinon erreur : appeler `load` avant). */
  get(id: string): Model {
    const m = models.get(id);
    if (!m) throw new Error(`Modèle ${id} non chargé : appeler await Models.load(['${id}']) d'abord`);
    return m;
  },

  has(id: string) {
    return models.has(id);
  },

  /**
   * Instances d'un modèle à partir d'une liste de matrices monde (`THREE.Matrix4[]` ou 16 nombres par instance).
   * Renvoie un `THREE.Group` à ajouter à la scène ; ses LOD sont mises à jour par `Models.update(camera)`.
   */
  instances(id: string, matrices: THREE.Matrix4[] | ArrayLike<number>, opts?: InstanceOptions) {
    return new ModelInstances(Models.get(id), matrices, opts);
  },

  /**
   * Objet unique avec LOD automatiques (THREE.LOD, mis à jour par le moteur de rendu) : pour un objet posé à la main.
   * Les géométries et matériaux sont partagés avec le cache (ne pas les libérer).
   */
  object(id: string, opts: { castShadow?: boolean; receiveShadow?: boolean; lodDistances?: number[] } = {}) {
    const model = Models.get(id);
    const dist = opts.lodDistances ?? model.info.lodDistances;
    const lod = new THREE.LOD();
    lod.name = id;
    model.lods.forEach((l, i) => {
      if (i >= dist.length) return;
      const g = new THREE.Group();
      for (const p of l.parts) {
        const mesh = new THREE.Mesh(p.geometry, p.material);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(p.matrix);
        mesh.castShadow = (opts.castShadow ?? model.info.castShadow) && (i === 0 ? 0 : dist[i - 1]) < Models.shadowDistance;
        mesh.receiveShadow = opts.receiveShadow ?? true;
        g.add(mesh);
      }
      lod.addLevel(g, i === 0 ? 0 : dist[i - 1]);
    });
    // au-delà de la dernière distance : rien
    lod.addLevel(new THREE.Object3D(), dist[Math.min(dist.length, model.lods.length) - 1] ?? 1e9);
    return lod;
  },

  /** Matrice de placement : position, rotation autour de y (rad), échelle uniforme, inclinaison facultative (rad). */
  matrix(x: number, y: number, z: number, yaw = 0, scale = 1, tiltX = 0, tiltZ = 0, out = new THREE.Matrix4()) {
    _q.setFromEuler(new THREE.Euler(tiltX, yaw, tiltZ, 'YXZ'));
    return out.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(scale, scale, scale));
  },

  /**
   * Matrice posée au sol : y = heightAt(x, z) − sink × échelle (enfoncement du manifeste, sauf `sink` fourni).
   * Avec `normalAt`, l'objet suit la pente (fraction `align`, 0..1 ; défaut 1 pour les rochers et racines, 0 sinon).
   */
  groundMatrix(
    id: string,
    x: number,
    z: number,
    heightAt: (x: number, z: number) => number,
    o: { yaw?: number; scale?: number; sink?: number; normalAt?: (x: number, z: number) => THREE.Vector3; align?: number; y?: number } = {},
  ) {
    const info = Models.get(id).info;
    const s = o.scale ?? 1;
    const y = (o.y ?? heightAt(x, z)) - (o.sink ?? info.sink) * s;
    const out = new THREE.Matrix4();
    _qy.setFromAxisAngle(_up, o.yaw ?? 0);
    const organic = ['rocher', 'paroi', 'mousse', 'racine', 'souche', 'tronc', 'bois_mort', 'fougere', 'arbuste'].includes(info.category);
    const align = o.align ?? (organic ? 1 : 0);
    if (o.normalAt && align > 0) {
      const n = o.normalAt(x, z).clone().normalize().lerp(_up, 1 - align).normalize();
      _q.setFromUnitVectors(_up, n).multiply(_qy);
    } else _q.copy(_qy);
    return out.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(s, s, s));
  },

  /** Met à jour les LOD de tous les ensembles d'instances vivants (une fois par image, avec la caméra de jeu). */
  update(camera: THREE.Camera) {
    for (const g of live) if (g.parent) g.update(camera);
  },

  /**
   * Variante sans branchement dans la boucle de jeu : met à jour les LOD juste avant chaque rendu de `scene`
   * (via `scene.onBeforeRender`, en conservant un éventuel gestionnaire existant). Les ombres du même rendu en profitent.
   */
  autoUpdate(scene: THREE.Scene) {
    if ((scene.userData as any).__modelsAuto) return;
    (scene.userData as any).__modelsAuto = true;
    const prev = scene.onBeforeRender.bind(scene);
    scene.onBeforeRender = (renderer, sc, camera, target, material, group) => {
      prev(renderer, sc, camera, target, material, group);
      if (!(camera as THREE.Camera & { isCubeCamera?: boolean }).isCubeCamera) Models.update(camera);
    };
  },

  /** Statistiques pour le débogage : modèles chargés, ensembles, instances et triangles visibles. */
  stats() {
    let instances = 0, visible = 0, triangles = 0;
    for (const g of live) {
      instances += g.count;
      visible += g.visibleByLod.reduce((a, b) => a + b, 0);
      triangles += g.visibleTriangles();
    }
    return { models: models.size, files: fileCache.size, sets: live.size, instances, visible, triangles };
  },
};

export default Models;
