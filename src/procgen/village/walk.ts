// Intégration village : points de marche des promeneurs (bible §10.2 : place, Grand-Rue, Promenade des Bains…).
// Les points sont espacés d'environ 5 m le long de l'axe des rues (légèrement décalés de part et d'autre) ; les
// promeneurs du village ne relient que des points voisins (pas > WALK_STEP), donc ils suivent les rues sans
// traverser les maisons (voir NpcManager.addWalkers, paramètre maxStep).
import * as THREE from 'three';
import { heightAt } from '../../world/heightmap';
import { BUILDINGS, PATHS, PLAZA } from '../../world/zones';
import { rectSdf, streamInfo } from '../../world/valley';
import { resample } from './ground';

/** Pas maximal entre deux points consécutifs d'un promeneur du village (m). */
export const WALK_STEP = 7.5;

const WALK_PATHS = ['grand-rue', 'rue-col', 'rue-levant', 'rue-yuzus', 'rue-etang', 'rue-cedres', 'rue-bains', 'ruelle-vapeur'];
/** Obstacles fixes de la place (cerisier, puits, bain de pieds, étals). */
const PLAZA_BLOCKS: [number, number, number][] = [[-9, -7, 4.5], [9, -7, 2.5], [22, 2, 4.5], [-18, 15, 2.5], [-21, 6, 2.5], [16, 16, 2.5]];

export function villageWalkPoints(): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const ok = (x: number, z: number) => {
    const s = streamInfo(x, z);
    if (s.kind !== 4 && s.d < s.width / 2 + 1.5) return false;
    return !BUILDINGS.some((b) => Math.abs(b.x - x) < 30 && Math.abs(b.z - z) < 30 && rectSdf(x, z, b.x, b.z, b.w, b.d, b.yaw) < 1.2);
  };
  for (const id of WALK_PATHS) {
    const p = PATHS.find((q) => q.id === id);
    if (!p) continue;
    const { pts } = resample(p.pts, 5);
    pts.forEach((q, i) => {
      const off = (i % 2 ? 1 : -1) * Math.min(1.4, p.width * 0.2);
      const x = q.x - q.dz * off, z = q.z + q.dx * off;
      if (ok(x, z)) out.push(new THREE.Vector3(x, heightAt(x, z), z));
    });
  }
  // place : grille de 6 m en évitant le cerisier, le puits, le bain de pieds et les étals
  for (let x = -PLAZA.halfX + 4; x <= PLAZA.halfX - 4; x += 6)
    for (let z = -PLAZA.halfZ + 4; z <= PLAZA.halfZ - 4; z += 6) {
      if (PLAZA_BLOCKS.some(([bx, bz, r]) => Math.hypot(x - bx, z - bz) < r)) continue;
      if (Math.abs(x) + Math.abs(z) > PLAZA.halfX + PLAZA.halfZ - PLAZA.chamfer - 3) continue;
      if (ok(x, z)) out.push(new THREE.Vector3(PLAZA.x + x, PLAZA.y, PLAZA.z + z));
    }
  return out;
}
