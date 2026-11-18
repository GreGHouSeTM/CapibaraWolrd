// Intégration village : niveaux de détail par cellule (regroupement spatial, bible §11).
// Chaque cellule de CELL m contient, pour chaque LOD, un maillage fusionné par matière ; on choisit la LOD de la cellule
// selon la distance caméra → boîte englobante de la cellule (LOD_DISTANCES.building), au-delà la cellule est cachée,
// sauf si elle porte un repère lointain (pagode, Grand Ryokan) : elle reste alors en LOD2.
import * as THREE from 'three';
import { LOD_DISTANCES } from '../../world/zones';
import { Models } from '../../core/models';

export const CELL = 60;

export interface LodCell {
  key: string;
  box: THREE.Box3;
  levels: THREE.Group[];
  keepFar: boolean;
  current: number;
}

const _cam = new THREE.Vector3();

export class CellLod extends THREE.Group {
  cells = new Map<string, LodCell>();
  /** Distances de bascule LOD0→1, 1→2, et de disparition. */
  distances = LOD_DISTANCES.building.slice();
  private last = new THREE.Vector3(1e9, 0, 0);
  private lastBias = -1;

  cellKeyAt(x: number, z: number) {
    return `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  }

  cell(key: string): LodCell {
    let c = this.cells.get(key);
    if (!c) {
      c = { key, box: new THREE.Box3(), levels: [0, 1, 2].map(() => new THREE.Group()), keepFar: false, current: -2 };
      c.levels.forEach((g, i) => { g.name = `village-${key}-lod${i}`; g.visible = false; g.matrixAutoUpdate = false; this.add(g); });
      this.cells.set(key, c);
    }
    return c;
  }

  addMesh(key: string, lod: number, mesh: THREE.Mesh) {
    const c = this.cell(key);
    c.levels[lod].add(mesh);
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    c.box.union(mesh.geometry.boundingBox!);
  }

  /** Choix des LOD (ne fait rien si la caméra n'a presque pas bougé). */
  update(camera: THREE.Camera) {
    _cam.setFromMatrixPosition(camera.matrixWorld);
    if (_cam.distanceToSquared(this.last) < 0.25 && this.lastBias === Models.lodBias) return;
    this.last.copy(_cam);
    this.lastBias = Models.lodBias;
    const [d0, d1, d2] = this.distances.map((d) => d * Models.lodBias);
    for (const c of this.cells.values()) {
      const d = c.box.distanceToPoint(_cam);
      let l = d < d0 ? 0 : d < d1 ? 1 : d < d2 ? 2 : -1;
      if (l < 0 && c.keepFar) l = 2;
      // une cellule sans LOD demandée (pièce absente) retombe sur la LOD disponible la plus proche
      while (l >= 0 && l < 2 && !c.levels[l].children.length) l++;
      if (l === c.current) continue;
      c.current = l;
      c.levels.forEach((g, i) => (g.visible = i === l));
    }
  }

  /** Appels de dessin potentiels (maillages) par LOD, pour le compte rendu. */
  stats() {
    const per = [0, 0, 0];
    let tris = [0, 0, 0];
    for (const c of this.cells.values())
      c.levels.forEach((g, i) => {
        per[i] += g.children.length;
        for (const m of g.children) tris[i] += ((m as THREE.Mesh).geometry.index?.count ?? 0) / 3;
      });
    tris = tris.map(Math.round);
    return { cells: this.cells.size, meshesByLod: per, trianglesByLod: tris };
  }
}

/** Branche une fonction de mise à jour juste avant chaque rendu de la scène (comme Models.autoUpdate). */
export function beforeRender(scene: THREE.Scene, fn: (camera: THREE.Camera) => void) {
  const prev = scene.onBeforeRender.bind(scene);
  scene.onBeforeRender = (renderer, sc, camera, target, material, group) => {
    prev(renderer, sc, camera, target, material, group);
    if (!(camera as THREE.Camera & { isCubeCamera?: boolean }).isCubeCamera) fn(camera);
  };
}
