// Composition du sol de la zone « forêt » : éléments vedettes posés à la main (premier plan, pied de paroi, clairière)
// puis remplissage procédural (fougères, oxalis, jeunes sapins, bois mort, racines, cailloux, brindilles) guidé par les
// masques, la pente et la proximité du sentier, de la paroi et des arbres.
import * as THREE from 'three';
import type { ForetData } from './data';
import { Inst, PropBatch, PropLib, PropStyle } from './props';
import type { TreeInst } from './trees';
import { addCircle } from '../../world/physics';

export const PROP_IDS = ['fern_02', 'shrub_sorrel_01', 'rock_moss_set_01', 'rock_moss_set_02', 'boulder_01', 'tree_stump_01', 'tree_stump_02',
  'dead_tree_trunk', 'dead_tree_trunk_02', 'pine_roots', 'root_cluster_01', 'root_cluster_02', 'single_root', 'dry_branches_medium_01',
  'stone_01', 'rock_07', 'rock_09', 'Lantern_01', 'fir_sapling'];

export const STYLES: Record<string, PropStyle> = {
  fern_02: { foliage: true, lodDist: [12, 35], shadow: true, tint: 0.25, color: [0.78, 0.85, 0.7] },
  shrub_sorrel_01: { foliage: true, lodDist: [7, 22], shadow: false, tint: 0.2, color: [0.85, 0.95, 0.75] },
  fir_sapling: { foliage: true, lodDist: [18, 45, 90], shadow: true, tint: 0.15, color: [0.75, 0.8, 0.72] },
  rock_moss_set_01: { color: [0.62, 0.66, 0.6], moss: 0.9, foot: 0.25, lodDist: [25, 70, 160] },
  rock_moss_set_02: { color: [0.62, 0.66, 0.6], moss: 0.9, foot: 0.2, lodDist: [25, 70, 160] },
  boulder_01: { color: [0.62, 0.66, 0.6], moss: 1.0, foot: 0.3, lodDist: [30, 80, 180] },
  tree_stump_01: { moss: 0.7, foot: 0.2, lodDist: [25, 70, 140] },
  tree_stump_02: { moss: 0.7, foot: 0.2, lodDist: [25, 70, 140] },
  dead_tree_trunk: { moss: 0.6, foot: 0.08, lodDist: [25, 60, 120] },
  dead_tree_trunk_02: { moss: 0.8, foot: 0.15, lodDist: [25, 70, 140] },
  pine_roots: { moss: 0.4, lodDist: [18, 45], shadow: false },
  root_cluster_01: { moss: 0.5, foot: 0.15, lodDist: [25, 70] },
  root_cluster_02: { moss: 0.4, lodDist: [18, 45], shadow: false },
  single_root: { moss: 0.3, lodDist: [15, 35], shadow: false },
  dry_branches_medium_01: { lodDist: [12, 30], shadow: false, tint: 0.2 },
  stone_01: { moss: 0.3, lodDist: [10, 25], shadow: false },
  rock_07: { moss: 0.4, lodDist: [12, 30], shadow: false },
  rock_09: { moss: 0.3, lodDist: [10, 25], shadow: false },
  Lantern_01: { lodDist: [40, 200], shadow: true, tint: 0 },
};

export class Scatter {
  group = new THREE.Group();
  batches: PropBatch[] = [];
  lantern = new THREE.Vector3();

  build(lib: PropLib, D: ForetData, trees: TreeInst[], density: number) {
    let seed = 4401;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const S = D.scene;
    const sets = new Map<string, Inst[]>();
    const m = [0, 0, 0, 0];
    const add = (part: string, x: number, z: number, s: number, o: Partial<Inst> = {}, sink = 0.03) => {
      const y = D.height(x, z) - sink * s;
      if (!sets.has(part)) sets.set(part, []);
      sets.get(part)!.push({ x, y, z, ry: o.ry ?? rnd() * 6.283, s, rx: o.rx, rz: o.rz, tint: o.tint });
    };
    const steps = S.steps;
    const onStairs = (x: number, z: number, pad = 0.3) => steps.some((st) => Math.abs(x - st.x) < st.width / 2 + pad && z < st.z + pad && z > st.z - st.run - pad);
    const slope = (x: number, z: number) => Math.hypot(D.height(x + 0.3, z) - D.height(x - 0.3, z), D.height(x, z + 0.3) - D.height(x, z - 0.3)) / 0.6;
    const nearTree = (x: number, z: number, r: number) => trees.some((t) => Math.abs(t.x - x) < r && Math.abs(t.z - z) < r && Math.hypot(t.x - x, t.z - z) < r);
    const free = (x: number, z: number, pathMax = 0.25) => {
      if (!D.inZone(x, z, 1.5) || onStairs(x, z)) return false;
      D.mask(x, z, m);
      return m[0] < pathMax && m[2] < 0.55 && slope(x, z) < 0.9;
    };
    const parts = (id: string) => lib.info[id].parts.map((p) => p.name);
    const pick = (id: string) => { const p = parts(id); return p[Math.floor(rnd() * p.length)]; };

    // --- vedettes : bloc moussu au premier plan, blocs au pied de la paroi, souches et troncs couchés, clairière
    add('boulder_01', -2.9, 9.2, 1.25, { ry: 0.6 }, 0.12);
    addCircle(-2.9, 9.2, 0.9, D.height(-2.9, 9.2), D.height(-2.9, 9.2) + 1.2);
    const foot = S.wallFoot;
    for (let i = 0; i < foot.length; i += 3) {
      const [x, z] = foot[i];
      if (z > 4.5 && z < 31 && rnd() < 0.8) {
        const p = rnd() < 0.5 ? pick('rock_moss_set_01') : pick('rock_moss_set_02');
        const s = 0.35 + rnd() * 0.45;
        add(p, x - 0.25 - rnd() * 0.5, z + (rnd() - 0.5), s, {}, 0.15);
      }
    }
    add('tree_stump_02', -9.8, 18.5, 1.0, { ry: 1.1 }, 0.05);
    add('tree_stump_01', -7.5, 2.0, 1.1, {}, 0.05);
    add('dead_tree_trunk_02', -15.8, 18.2, 1.0, { ry: 0.45, rz: 0.04 }, 0.18);
    add('dead_tree_trunk', -6.0, 12.6, 1.0, { ry: 2.25, rz: -0.25 }, 0.02); // branche morte en diagonale (premier plan gauche)
    add('root_cluster_01', -10.6, 23.6, 0.9, { ry: 2.6 }, 0.1);
    add('root_cluster_02_a', -14.6, 22.8, 1.1, { ry: 0.3 }, 0.02);
    add('root_cluster_02_d', -11.4, 19.8, 1.2, { ry: 1.9 }, 0.02);
    add('dead_tree_trunk', -18.5, 24.5, 1.1, { ry: 1.2 }, 0.05);
    // lanterne posée sur la souche moussue au bord de la clairière, derrière la flaque (cadrage de la référence de nuit)
    const lx = -9.8, lz = 18.5;
    this.lantern.set(lx, D.height(lx, lz) - 0.05 + 0.5, lz);
    sets.set('lantern_01', [{ x: lx, y: this.lantern.y, z: lz, ry: 0.4, s: 1.6 }]);

    // --- remplissage procédural
    const N = density;
    for (let i = 0; i < 4200 * N; i++) {
      const x = -48 + rnd() * 96, z = -43 + rnd() * 76;
      if (!free(x, z)) continue;
      D.mask(x, z, m);
      const r = rnd();
      // fougères : sous-bois, plus sur les pentes moussues, jamais sur le sentier
      if (r < 0.3 && m[0] < 0.05) add(pick('fern_02'), x, z, 0.9 + rnd() * 0.9, {}, 0.0);
      // oxalis en colonies (pied de paroi, bords du sentier, mousse)
      else if (r < 0.62 && (m[1] > 0.3 || rnd() < 0.3)) {
        const n = 4 + Math.floor(rnd() * 9);
        for (let k = 0; k < n; k++) {
          const a = rnd() * 6.283, d = Math.sqrt(rnd()) * 0.9;
          const xx = x + Math.cos(a) * d, zz = z + Math.sin(a) * d;
          if (free(xx, zz, 0.45)) add('shrub_sorrel_01', xx, zz, 0.8 + rnd() * 0.7, {}, 0.0);
        }
      } else if (r < 0.7) add(pick('dry_branches_medium_01'), x, z, 0.7 + rnd() * 0.8, { rx: (rnd() - 0.5) * 0.2 }, 0.01);
      else if (r < 0.74 && nearTree(x, z, 2.2)) add(pick('pine_roots'), x, z, 0.9 + rnd() * 0.5, {}, 0.02);
      else if (r < 0.78) add(pick('root_cluster_02'), x, z, 0.7 + rnd() * 0.6, {}, 0.02);
      else if (r < 0.8) add('single_root', x, z, 0.8 + rnd() * 0.6, {}, 0.02);
      else if (r < 0.83) add(rnd() < 0.5 ? 'tree_stump_01' : 'tree_stump_02', x, z, 0.6 + rnd() * 0.6, {}, 0.05);
      else if (r < 0.86) add(rnd() < 0.6 ? 'dead_tree_trunk' : 'dead_tree_trunk_02', x, z, 0.7 + rnd() * 0.5, { rz: (rnd() - 0.5) * 0.1 }, 0.08);
      else if (r < 0.9) add(pick(rnd() < 0.5 ? 'rock_moss_set_01' : 'rock_moss_set_02'), x, z, 0.25 + rnd() * 0.5, {}, 0.12);
      else if (r < 0.92) add('fir_sapling', x, z, 0.6 + rnd() * 0.7, {}, 0.0);
      else add(rnd() < 0.5 ? 'rock_07' : 'stone_01', x, z, 1 + rnd() * 2.5, {}, 0.02);
    }
    // débris sur et au bord du sentier : cailloux, brindilles, racines qui le traversent
    for (const p of S.path) {
      const [px, pz, , w, kind] = p;
      if (kind === 1 || !D.inZone(px, pz, 2)) continue;
      for (let k = 0; k < 6 * N; k++) {
        const a = (rnd() - 0.5) * 2 * (w + 0.6), ox = px + a, oz = pz + (rnd() - 0.5) * 0.5;
        if (onStairs(ox, oz, 0.1)) continue;
        const r = rnd();
        if (r < 0.45) add(rnd() < 0.6 ? 'rock_09' : 'stone_01', ox, oz, 0.8 + rnd() * 1.6, {}, 0.01);
        else if (r < 0.75) add(pick('dry_branches_medium_01'), ox, oz, 0.4 + rnd() * 0.5, {}, 0.0);
        else if (r < 0.8) add('rock_07', ox, oz, 0.7 + rnd(), {}, 0.03);
        else if (r < 0.83) add('single_root', ox, oz, 0.7 + rnd() * 0.5, {}, 0.03);
      }
    }
    for (const [part, list] of sets) {
      const id = Object.keys(lib.info).find((k) => lib.info[k].parts.some((p) => p.name === part))!;
      const b = new PropBatch(lib, part, list, STYLES[id] ?? {});
      this.batches.push(b);
      this.group.add(b.group);
    }
    return this;
  }

  update(cam: THREE.Vector3) {
    for (const b of this.batches) b.update(cam);
  }

  count() {
    return this.batches.reduce((s, b) => s + b.inst.length, 0);
  }
}
