// Gestionnaire d'instances de végétation : cellules de 32 m, choix du LOD par distance, élimination hors champ,
// imposteurs au loin. Une InstancedMesh par (variante, LOD, partie) + une par essence pour les imposteurs :
// le nombre d'appels de dessin ne dépend pas du nombre d'arbres.
import * as THREE from 'three';
import { SpeciesModel } from './species';

const CELL = 32;

interface Cell {
  cx: number; cy: number; cz: number; r: number;
  idx: number[];
}

export interface FloraStats { instances: number; visible: number[]; drawCalls: number; triangles: number }

export class FloraLayer {
  readonly group = new THREE.Group();
  readonly sp: SpeciesModel;
  /** 16 nombres par instance (matrice monde). */
  private mats: number[] = [];
  private variant: number[] = [];
  private cells = new Map<number, Cell>();
  private cellList: Cell[] = [];
  /** [variante][lod] → meshes des parties */
  private meshes: THREE.InstancedMesh[][][] = [];
  private imp: THREE.InstancedMesh | null = null;
  private impRow: THREE.InstancedBufferAttribute | null = null;
  private built = false;
  lodScale = 1;
  readonly visible = [0, 0, 0];

  constructor(sp: SpeciesModel) {
    this.sp = sp;
    this.group.name = 'flore:' + sp.id;
  }

  get count() { return this.variant.length; }

  add(x: number, y: number, z: number, yaw: number, scale: number, variant = 0, tilt?: THREE.Vector3) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    if (tilt) q.premultiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tilt));
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(scale, scale, scale));
    const i = this.variant.length;
    for (let k = 0; k < 16; k++) this.mats.push(m.elements[k]);
    this.variant.push(variant % this.sp.variants.length);
    const key = Math.floor(x / CELL) * 4096 + Math.floor(z / CELL);
    let c = this.cells.get(key);
    if (!c) {
      c = { cx: (Math.floor(x / CELL) + 0.5) * CELL, cy: y, cz: (Math.floor(z / CELL) + 0.5) * CELL, r: CELL * 0.75, idx: [] };
      this.cells.set(key, c);
      this.cellList.push(c);
    }
    c.idx.push(i);
    const h = this.sp.def.height * scale;
    c.cy = (c.cy * (c.idx.length - 1) + y + h * 0.5) / c.idx.length;
    c.r = Math.max(c.r, CELL * 0.72 + h * 0.6);
  }

  /** Crée les InstancedMesh (après tous les add). */
  build() {
    if (this.built) return;
    this.built = true;
    const sp = this.sp, def = sp.def;
    const perVar = sp.variants.map((_, k) => this.variant.filter((v) => v === k).length);
    sp.variants.forEach((v, k) => {
      const row: THREE.InstancedMesh[][] = [];
      for (let lod = 0; lod < 2; lod++) {
        const parts: THREE.InstancedMesh[] = [];
        const p = v.lod[lod];
        const cap = Math.max(1, Math.min(perVar[k], lod === 0 ? def.cap?.[0] ?? 1500 : def.cap?.[1] ?? 8000));
        const shadow = def.shadow === 2 || (def.shadow === 1 && lod === 0);
        const mk = (g: THREE.BufferGeometry | undefined, mat: THREE.Material | undefined, depth?: THREE.Material) => {
          if (!g || !mat || !perVar[k]) return;
          const im = new THREE.InstancedMesh(g, mat, cap);
          im.count = 0;
          im.frustumCulled = false;
          im.castShadow = shadow;
          im.receiveShadow = true;
          if (depth) im.customDepthMaterial = depth;
          im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          im.name = `${sp.id}-v${k}-lod${lod}`;
          parts.push(im);
          this.group.add(im);
        };
        mk(p.bark, sp.mats.bark, sp.mats.barkDepth);
        mk(p.leaf, sp.mats.leaf, sp.mats.leafDepth);
        mk(p.fruit, sp.mats.fruit);
        mk(p.prop, sp.mats.prop);
        row.push(parts);
      }
      this.meshes.push(row);
    });
  }

  /** Crée la couche d'imposteurs (après la cuisson de l'atlas). */
  private buildImposter() {
    const im = this.sp.imposter!;
    const n = this.count;
    const g = im.geometry.clone();
    this.impRow = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    this.impRow.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aImpRow', this.impRow);
    this.imp = new THREE.InstancedMesh(g, im.material, n);
    this.imp.count = 0;
    this.imp.frustumCulled = false;
    this.imp.castShadow = false;
    this.imp.receiveShadow = true;
    this.imp.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.imp.name = this.sp.id + '-imposteurs';
    this.group.add(this.imp);
  }

  update(cam: THREE.Vector3, frustum: THREE.Frustum) {
    if (!this.built) this.build();
    if (this.sp.imposter && !this.imp && this.count) this.buildImposter();
    const [l0, l1, l2] = this.sp.def.lod.map((d) => d * this.lodScale);
    const far = l2 > 0 && this.imp ? l2 : l1;
    // compteurs par mesh
    const counts = this.meshes.map((r) => r.map(() => 0));
    let ni = 0;
    this.visible[0] = this.visible[1] = this.visible[2] = 0;
    const sph = new THREE.Sphere();
    const M = this.mats;
    for (const c of this.cellList) {
      const dx = c.cx - cam.x, dy = c.cy - cam.y, dz = c.cz - cam.z;
      const dc = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dc - c.r > far) continue;
      sph.center.set(c.cx, c.cy, c.cz);
      sph.radius = c.r;
      const near = dc - c.r < 28; // ombres des arbres juste hors champ
      if (!near && !frustum.intersectsSphere(sph)) continue;
      for (const i of c.idx) {
        const o = i * 16;
        const ex = M[o + 12] - cam.x, ey = M[o + 13] - cam.y, ez = M[o + 14] - cam.z;
        const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
        if (d > far) continue;
        const v = this.variant[i];
        if (d < l1 || !this.imp) {
          if (d >= l1) continue;
          const lod = d < l0 ? 0 : 1;
          const parts = this.meshes[v][lod];
          const n = counts[v][lod]++;
          for (const im of parts) {
            if (n >= im.instanceMatrix.count) continue;
            const a = im.instanceMatrix.array as Float32Array;
            for (let k = 0; k < 16; k++) a[n * 16 + k] = M[o + k];
          }
          this.visible[lod]++;
        } else {
          const a = this.imp.instanceMatrix.array as Float32Array;
          for (let k = 0; k < 16; k++) a[ni * 16 + k] = M[o + k];
          (this.impRow!.array as Float32Array)[ni] = v;
          ni++;
          this.visible[2]++;
        }
      }
    }
    this.meshes.forEach((r, v) => r.forEach((parts, lod) => {
      for (const im of parts) {
        im.count = Math.min(counts[v][lod], im.instanceMatrix.count);
        im.visible = im.count > 0;
        if (im.count) im.instanceMatrix.needsUpdate = true;
      }
    }));
    if (this.imp) {
      this.imp.count = ni;
      this.imp.visible = ni > 0;
      if (ni) { this.imp.instanceMatrix.needsUpdate = true; this.impRow!.needsUpdate = true; }
    }
  }
}
