// Intégration village : chargement des bâtiments Blender (public/assets/models/buildings), pose au sol, collisions,
// points d'accroche (lumières, fumées, lanternes, noren) et fusion par cellule / LOD / matière.
//
// Conventions du manifeste (rubrique `conventions`) : origine au sol au centre de l'emprise, façade +Z,
// position = (x, sol, z), rotation.y = yaw ; nœuds <id>_lod0/1/2 ; colliders en boîtes locales ; ponts avec walk.path.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { addBox } from '../../world/physics';
import { addLightSpot, addSmokeSpot, LightKind } from '../../world/registry';
import { MaterialMerger } from './merge';
import { CellLod } from './lod';
import { LOD_DISTANCES } from '../../world/zones';

const BASE = (import.meta.env?.BASE_URL ?? './') + 'assets/models/buildings/';

export interface BAnchor {
  name: string;
  pos: [number, number, number];
  yaw: number;
  w?: number;
  h?: number;
  kind?: string;
  color?: string;
  intensity?: number;
}
export interface BCollider { x: number; z: number; w: number; d: number; y0: number; y1: number; walk?: boolean }
export interface BInfo {
  id: string;
  type: string;
  name: string;
  file: string;
  w: number;
  d: number;
  height: number;
  lod: string[];
  triangles: number[];
  bytes: number;
  anchors?: BAnchor[];
  colliders?: BCollider[];
  walk?: { path: [number, number][]; width: number };
  placement?: { x: number; z: number; yaw: number };
  span?: number;
}
export interface BManifest {
  buildings: Record<string, BInfo>;
  kit: { file: string; bytes: number; pieces: Record<string, number> };
}

/** Pose d'un modèle : `node` choisit une pièce du kit (sinon le modèle complet avec ses LOD). */
export interface Placement {
  /** identifiant de pose (bâtiment, torii…) */
  id: string;
  model: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale?: [number, number, number];
  /** pièce du kit (kit.glb), posée dans les LOD 0 et 1 seulement */
  node?: string;
  /** garde la LOD2 visible au-delà de 400 m (repères : pagode, Grand Ryokan) */
  keepFar?: boolean;
  /** ajoute les boîtes de collision du manifeste (défaut : oui) */
  colliders?: boolean;
}

/** Point d'accroche en coordonnées monde. */
export interface WorldAnchor {
  owner: string;
  name: string;
  pos: THREE.Vector3;
  yaw: number;
  w?: number;
  h?: number;
  kind?: string;
}

let loader: GLTFLoader | null = null;
function getLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

let manifestP: Promise<BManifest> | null = null;
export function buildingManifest(): Promise<BManifest> {
  if (!manifestP) manifestP = fetch(BASE + 'manifest.json').then((r) => {
    if (!r.ok) throw new Error('Manifeste des bâtiments introuvable');
    return r.json();
  });
  return manifestP;
}

export function placementMatrix(p: { x: number; y: number; z: number; yaw: number; scale?: [number, number, number] }, out = new THREE.Matrix4()) {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
  const s = p.scale ? new THREE.Vector3(...p.scale) : new THREE.Vector3(1, 1, 1);
  return out.compose(new THREE.Vector3(p.x, p.y, p.z), q, s);
}

/** Local (x, z) d'un bâtiment de cap `yaw` → monde (rotation.y de Three.js). */
export function localToWorld(px: number, pz: number, yaw: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [px + lx * c + lz * s, pz - lx * s + lz * c];
}

const lightKindOf = (name: string): LightKind =>
  /room|shop|hall|bath|mill|tier/.test(name) ? 'window' : /fire|hearth/.test(name) ? 'fire' : 'lantern';

export interface VillageBuildings {
  lod: CellLod;
  wheel: THREE.LOD | null;
  anchors: WorldAnchor[];
  manifest: BManifest;
  /** fichiers glTF chargés (pour réutiliser une pièce du kit, par exemple) */
  gltf: Map<string, GLTF>;
}

/**
 * Charge les fichiers nécessaires aux poses, puis fusionne tout par cellule de 60 m, par LOD et par matière.
 * `onProgress(0..1)` suit les octets téléchargés puis la fusion.
 */
export async function buildVillageBuildings(placements: Placement[], wheelAt: { x: number; y: number; z: number; yaw: number } | null, onProgress: (p: number) => void): Promise<VillageBuildings> {
  const man = await buildingManifest();
  const fileOf = (p: Placement) => (p.node ? man.kit.file : man.buildings[p.model]?.file);
  const valid = placements.filter((p) => {
    const ok = !!fileOf(p);
    if (!ok) console.warn('Intégration village : modèle absent du manifeste', p.model);
    return ok;
  });
  const files = [...new Set([...valid.map(fileOf), ...(wheelAt ? [man.buildings['moulin-roue'].file] : [])])] as string[];
  const bytesOf = (f: string) => (f === man.kit.file ? man.kit.bytes : Object.values(man.buildings).find((b) => b.file === f)?.bytes ?? 100000);
  const total = files.reduce((s, f) => s + bytesOf(f), 0) || 1;
  const loaded = new Map<string, number>();
  const report = () => onProgress(0.85 * Math.min(1, [...loaded.values()].reduce((a, b) => a + b, 0) / total));
  const gltf = new Map<string, GLTF>();
  // téléchargements en parallèle par paquets (le décodage meshopt se fait dans un worker WebAssembly)
  const queue = files.slice();
  const worker = async () => {
    while (queue.length) {
      const f = queue.shift()!;
      const g = await getLoader().loadAsync(BASE + f, (e) => { loaded.set(f, Math.min(e.loaded, bytesOf(f))); report(); });
      g.scene.updateMatrixWorld(true);
      gltf.set(f, g);
      loaded.set(f, bytesOf(f));
      report();
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));

  const lod = new CellLod();
  lod.name = 'village-batiments';
  const merger = new MaterialMerger();
  const anchors: WorldAnchor[] = [];
  const M = new THREE.Matrix4(), R = new THREE.Matrix4(), inv = new THREE.Matrix4();
  for (const p of valid) {
    const g = gltf.get(fileOf(p)!)!;
    placementMatrix(p, M);
    const key = lod.cellKeyAt(p.x, p.z);
    if (p.keepFar) lod.cell(key).keepFar = true;
    const info = p.node ? null : man.buildings[p.model];
    const levels: (THREE.Object3D | undefined)[] = p.node
      ? [g.scene.getObjectByName(p.node), g.scene.getObjectByName(p.node), undefined]
      : info!.lod.map((n) => g.scene.getObjectByName(n));
    const root = p.node ? g.scene.getObjectByName(p.node) : g.scene.getObjectByName(p.model) ?? g.scene;
    inv.copy(root ? root.matrixWorld : new THREE.Matrix4()).invert();
    levels.forEach((node, l) => {
      if (!node) return;
      node.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        R.multiplyMatrices(inv, mesh.matrixWorld).premultiply(M);
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        merger.add(`${key}|${l}`, mats[0], mesh.geometry, R, l < 2);
      });
    });
    if (!info) continue;
    // collisions du manifeste (boîtes locales tournées avec le bâtiment ; rot physique = −rotation.y)
    if (p.colliders !== false)
      for (const c of info.colliders ?? []) {
        const [wx, wz] = localToWorld(p.x, p.z, p.yaw, c.x, c.z);
        addBox(wx, wz, c.w, c.d, p.y + c.y0, p.y + c.y1, -p.yaw, !!c.walk);
      }
    // points d'accroche
    for (const a of info.anchors ?? []) {
      const [wx, wz] = localToWorld(p.x, p.z, p.yaw, a.pos[0], a.pos[2]);
      const wy = p.y + a.pos[1];
      if (a.name.startsWith('light_')) {
        addLightSpot(wx, wy, wz, a.color ? new THREE.Color(a.color).getHex() : 0xffb060, a.intensity ?? 1, lightKindOf(a.name));
      } else if (a.name.startsWith('smoke_')) {
        addSmokeSpot(wx, wy, wz, a.name.includes('steam') ? 'steam' : 'smoke');
      }
      anchors.push({ owner: p.id, name: a.name, pos: new THREE.Vector3(wx, wy, wz), yaw: p.yaw + (a.yaw ?? 0), w: a.w, h: a.h, kind: a.kind });
    }
  }
  onProgress(0.9);
  await new Promise((r) => setTimeout(r, 0));
  merger.build((k, mesh) => {
    const [cellKey, l] = k.split('|');
    lod.addMesh(cellKey, +l, mesh);
  });
  // la roue du moulin : objet séparé (animé), avec ses LOD
  let wheel: THREE.LOD | null = null;
  if (wheelAt) {
    const info = man.buildings['moulin-roue'];
    const g = gltf.get(info.file)!;
    wheel = new THREE.LOD();
    wheel.name = 'roue-du-moulin';
    const dist = LOD_DISTANCES.building;
    info.lod.forEach((n, i) => {
      const node = g.scene.getObjectByName(n);
      if (!node) return;
      const grp = new THREE.Group();
      node.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const m = new THREE.Mesh(mesh.geometry, mesh.material);
        m.matrixAutoUpdate = false;
        m.matrix.copy(mesh.matrixWorld);
        m.castShadow = i < 2;
        m.receiveShadow = true;
        grp.add(m);
      });
      wheel!.addLevel(grp, i === 0 ? 0 : dist[i - 1]);
    });
    wheel.addLevel(new THREE.Object3D(), dist[2]);
    wheel.position.set(wheelAt.x, wheelAt.y, wheelAt.z);
    wheel.rotation.set(0, wheelAt.yaw, 0, 'YXZ');
  }
  onProgress(1);
  return { lod, wheel, anchors, manifest: man, gltf };
}
