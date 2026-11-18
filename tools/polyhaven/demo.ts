// Scène de démonstration des assets Poly Haven dans le jeu (captures de revue uniquement, pas d'intégration au village).
// Chargée dynamiquement par tools/shot.cjs (vues « polyhaven », « polyhaven-props », « polyhaven-sol ») :
//   const mod = await import('/tools/polyhaven/demo.ts'); await mod.setupDemo(window.__game);
// Pose sur le terrain, autour de (0, 6, 0), un jardin de rochers moussus façon rotenburo (ref-1, ref-4), du sous-bois
// (fougères, racines, souche, tronc), une paroi en fond et un coin d'accessoires (seaux, tonneaux, caisses, paniers,
// poteries, yuzus). Tout passe par l'API de src/core/models.ts (instances + LOD).
import * as THREE from 'three';
import { Models } from '../../src/core/models';
import { heightAt, normalAt } from '../../src/world/heightmap';

type M4 = THREE.Matrix4;
let rng = 12345;
const rand = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);

// Au sud-ouest de la place actuelle, entre les routes et hors de l'anneau de maisons (à ~60 m de (0, 6, 0)).
export const DEMO_CENTER = { x: -30, z: 55 };

export async function setupDemo(g: { scene: THREE.Scene }, cx = DEMO_CENTER.x, cz = DEMO_CENTER.z) {
  const man = await Models.manifest();
  const want = Object.keys(man.models);
  await Models.load(want);
  const root = new THREE.Group();
  root.name = 'demo-polyhaven';
  g.scene.add(root);
  Models.autoUpdate(g.scene);
  const sets = new Map<string, M4[]>();
  const put = (id: string, x: number, z: number, yaw = 0, scale = 1, o: { y?: number; sink?: number; align?: number } = {}) => {
    if (!man.models[id]) return;
    const m = Models.groundMatrix(id, cx + x, cz + z, heightAt, { yaw, scale, normalAt, ...o });
    if (!sets.has(id)) sets.set(id, []);
    sets.get(id)!.push(m);
    return m;
  };
  const top = (id: string, x: number, z: number) => heightAt(cx + x, cz + z) + man.models[id].dimensions[1] - man.models[id].sink;

  // --- jardin de rochers moussus (à gauche) : anneau de rochers autour d'un creux, comme un rotenburo
  const ring = ['rock_moss_set_01_a', 'rock_moss_set_01_b', 'rock_moss_set_01_c', 'rock_moss_set_01_d', 'rock_moss_set_01_e', 'rock_moss_set_01_f',
    'rock_moss_set_02_a', 'rock_moss_set_02_b', 'rock_moss_set_02_c'].filter((i) => man.models[i]);
  ring.forEach((id, i) => {
    const a = (i / ring.length) * Math.PI * 2;
    put(id, -6 + Math.cos(a) * 2.6, -1 + Math.sin(a) * 2.0, a + 1.3, 0.7 + rand() * 0.25);
  });
  put('boulder_01', -9.5, -5, 0.6, 1.0);
  put('rock_face_01', -4, -13, 0.2, 1.0);
  put('rock_face_02', 6, -14, -0.4, 1.1);
  put('mountainside', -16, -18, 0.9, 1.0);
  // sous-bois
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2, r = 3.8 + rand() * 3;
    put(['fern_02_a', 'fern_02_b', 'fern_02_c', 'fern_02_d'][i % 4], -6 + Math.cos(a) * r, -2 + Math.sin(a) * r * 0.8, rand() * 6, 1.1 + rand() * 0.6);
  }
  put('root_cluster_01', -12, -2, 1.2, 0.9);
  put('pine_roots_a', -2.5, -6, 0.4, 1.0);
  put('tree_stump_02', -10.5, 1.5, 0.3, 1.0);
  put('tree_stump_01', 1.5, -8, 2.0, 0.9);
  put('dead_tree_trunk_02', -1, -9.5, 1.4, 1.0);
  put('dead_tree_trunk', -13, 3.5, 0.2, 1.0);
  put('dry_branches_medium_01_a', -3, 2.8, 0.9, 0.8);
  put('single_root', -1.5, -3.6, 2.2, 1.0);
  put('root_cluster_02_a', -9, 4.2, 0.5, 0.8);
  for (const [id, x, z, s] of [['shrub_02_a', -14, -7, 1], ['shrub_02_b', -8, -8.5, 1.1], ['shrub_02_c', 2.5, -11, 1], ['shrub_02_d', 9, -9, 0.9],
    ['shrub_03_a', -2.2, 1.6, 1.2], ['shrub_03_b', 0.5, -4.8, 1.3], ['shrub_01', -11.5, 5.5, 1], ['shrub_01', -4.5, 4.6, 1], ['shrub_04', -0.5, 3.4, 1.4],
    ['shrub_sorrel_01', -5.2, 3.2, 1.2]] as [string, number, number, number][])
    put(id, x, z, rand() * 6, s);
  // pierres et galets en bordure d'un chemin (instanciés)
  for (let i = 0; i < 40; i++) {
    const t = i / 40;
    const x = -3 + t * 12 + (rand() - 0.5) * 1.2, z = 4.5 - t * 3 + (rand() > 0.5 ? 1 : -1) * (0.9 + rand() * 0.4);
    put(['stone_01', 'rock_07', 'rock_09'][i % 3], x, z, rand() * 6, 0.8 + rand() * 1.2);
  }

  // --- coin d'accessoires (à droite) : façade d'échoppe imaginaire
  put('wooden_barrels_01_a', 5.5, -3.5, 0.4, 1);
  put('wooden_barrels_01_b', 6.8, -3.2, 1.2, 1);
  put('wine_barrel_01', 8.0, -3.6, 0.2, 1);
  put('wooden_crate_02', 4.6, -1.8, 0.1, 1);
  const crate = man.models['wooden_crate_01'];
  put('wooden_crate_01', 6.3, -1.4, -0.1, 1);
  // cageot de yuzus : fruits posés dans la caisse
  if (crate) {
    const yb = top('wooden_crate_01', 6.3, -1.4) - 0.08;
    for (let i = 0; i < 14; i++) put('yuzu', 6.3 + (rand() - 0.5) * crate.dimensions[0] * 0.75, -1.4 + (rand() - 0.5) * crate.dimensions[2] * 0.7, rand() * 6, 1, { y: yb + rand() * 0.04, sink: 0, align: 0 });
  }
  put('wicker_basket_01', 7.6, -1.2, 0.5, 1);
  put('wicker_basket_02', 8.6, -1.9, 1.5, 1);
  put('wooden_bucket_01', 4.0, -0.2, 0.3, 1);
  put('wooden_bucket_02', 4.9, 0.3, 1.0, 1);
  put('wooden_bucket_02', 4.9, 0.3, 2.0, 1, { y: heightAt(cx + 4.9, cz + 0.3) + (man.models['wooden_bucket_02']?.dimensions[1] ?? 0.3) * 0.98, sink: 0, align: 0 });
  put('ceramic_pot', 9.4, -0.4, 0.2, 1);
  put('ceramic_vase_01', 8.4, 0.2, 0, 1);
  put('ceramic_vase_02', 8.9, 0.6, 0, 1);
  put('ceramic_vase_03', 7.8, 0.5, 0, 1);
  put('ceramic_vase_04', 7.3, 0.9, 0, 1);
  put('planter_pot_clay', 3.4, -2.6, 0, 1);
  put('jug_01', 6.9, 0.4, 0.8, 1);
  put('brass_pot_01', 5.9, 0.6, 0.3, 1);
  put('wooden_lantern_01', 3.6, 0.9, 0.4, 1);
  put('wooden_stool_01', 10.2, -2.2, 0.6, 1);
  put('stone_fire_pit', 11.5, 1.5, 0, 1);
  for (const [id, x, z] of [['food_pears_asian_01_a', 7.6, -1.2], ['sweet_potato', 7.5, -1.1], ['lemon', 8.6, -1.9], ['yellow_onion', 8.7, -1.8]] as [string, number, number][])
    if (man.models[id]) put(id, x, z, rand() * 6, 1, { y: heightAt(cx + x, cz + z) + 0.06, sink: 0, align: 0 });

  let n = 0;
  for (const [id, mats] of sets) {
    root.add(Models.instances(id, mats, { brightnessJitter: man.models[id].category === 'rocher' ? 0.12 : 0.05 }));
    n += mats.length;
  }
  return { sets: sets.size, instances: n };
}
