// Sol de la zone « forêt » : grille fine 0,25 m (100 × 80 m) et anneau lointain 2 m (640 m) qui la prolonge dans la brume.
import * as THREE from 'three';
import type { ForetData } from './data';
import type { ForetPreset } from './presets';

export class Ground {
  group = new THREE.Group();
  hero: THREE.Mesh;
  ring: THREE.Mesh;
  material: THREE.Material;

  constructor(private D: ForetData, _q: ForetPreset) {
    this.group.name = 'sol-foret';
    const t = D.scene.terrain;
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    this.hero = new THREE.Mesh(this.heroGeometry(), this.material);
    this.hero.receiveShadow = true;
    this.hero.castShadow = true;
    this.hero.name = 'sol-fin';
    const r = t.ring;
    this.ring = new THREE.Mesh(gridGeometry(D.ring, r.n, r.n, r.x0, r.z0, r.cell, (x, z) => !(x > t.x0 + 2 && x < t.x0 + (t.nx - 1) * t.cell - 2 && z > t.z0 + 2 && z < t.z0 + (t.nz - 1) * t.cell - 2)), this.material);
    this.ring.receiveShadow = true;
    this.ring.name = 'sol-lointain';
    const col = new Float32Array(this.ring.geometry.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) { col[i] = 0.16; col[i + 1] = 0.13; col[i + 2] = 0.09; }
    this.ring.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.group.add(this.hero, this.ring);
  }

  private heroGeometry() {
    const D = this.D, t = D.scene.terrain;
    const g = gridGeometry(D.heights, t.nx, t.nz, t.x0, t.z0, t.cell);
    // J1 : couleur provisoire tirée des masques (litière brune, sentier clair, mousse verte, humidité sombre)
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const m = [0, 0, 0, 0];
    for (let i = 0; i < pos.count; i++) {
      D.mask(pos.getX(i), pos.getZ(i), m);
      let r = 0.2, gg = 0.15, b = 0.1;
      r = r + (0.33 - r) * m[0]; gg = gg + (0.27 - gg) * m[0]; b = b + (0.2 - b) * m[0];
      r = r + (0.12 - r) * m[1]; gg = gg + (0.2 - gg) * m[1]; b = b + (0.06 - b) * m[1];
      const w = 1 - 0.5 * m[2];
      col[i * 3] = r * w; col[i * 3 + 1] = gg * w; col[i * 3 + 2] = b * w;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
}

/** Grille indexée (nx × nz sommets) à partir d'un tableau de hauteurs ; `keep(x, z)` élimine des carreaux (trou de l'anneau). */
export function gridGeometry(h: Float32Array, nx: number, nz: number, x0: number, z0: number, cell: number, keep?: (x: number, z: number) => boolean) {
  const pos = new Float32Array(nx * nz * 3);
  const nor = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
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
      uv[o * 2] = i / (nx - 1); uv[o * 2 + 1] = j / (nz - 1);
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
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(nx * nz > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}
