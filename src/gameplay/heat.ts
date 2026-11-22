// Sources de chaleur pour la jauge de froid (spécialité Montagne) : feux, lanternes et vapeurs des Veines Tièdes,
// lues dans les registres du monde (registry.ts). Grille de 32 m pour une recherche rapide.
import { lightSpots, smokeSpots } from '../world/registry';
import { HOT_SPRING } from '../world/heightmap';

interface Heat { x: number; y: number; z: number; r: number }
const CELL = 32;
const grid = new Map<number, Heat[]>();
const key = (i: number, j: number) => (i + 512) * 1024 + (j + 512);
let built = false;

/** Rayon de chaleur (m) par sorte de source. */
export const HEAT_RADIUS = { fire: 8, lantern: 4.5, steam: 9, spring: 22 };

function add(h: Heat) {
  const i0 = Math.floor((h.x - h.r) / CELL), i1 = Math.floor((h.x + h.r) / CELL);
  const j0 = Math.floor((h.z - h.r) / CELL), j1 = Math.floor((h.z + h.r) / CELL);
  for (let i = i0; i <= i1; i++)
    for (let j = j0; j <= j1; j++) {
      const k = key(i, j);
      let a = grid.get(k);
      if (!a) grid.set(k, (a = []));
      a.push(h);
    }
}

/** (Re)construit la grille à partir des registres (à appeler après la construction du monde). */
export function buildHeatSources(extra: Heat[] = []) {
  grid.clear();
  for (const l of lightSpots) {
    if (l.kind === 'fire') add({ x: l.pos.x, y: l.pos.y, z: l.pos.z, r: HEAT_RADIUS.fire });
    else if (l.kind === 'lantern') add({ x: l.pos.x, y: l.pos.y, z: l.pos.z, r: HEAT_RADIUS.lantern });
  }
  for (const s of smokeSpots) if (s.kind === 'steam') add({ x: s.pos.x, y: s.pos.y, z: s.pos.z, r: HEAT_RADIUS.steam });
  add({ x: HOT_SPRING[0], y: 0, z: HOT_SPRING[1], r: HEAT_RADIUS.spring });
  for (const e of extra) add(e);
  built = true;
}

/** Chaleur reçue au point (0..1) : 1 contre la source, 0 au-delà de son rayon. */
export function heatAt(x: number, y: number, z: number): number {
  if (!built) buildHeatSources();
  const a = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!a) return 0;
  let best = 0;
  for (const h of a) {
    if (h.y && Math.abs(y - h.y) > 12) continue;
    const d = Math.hypot(x - h.x, z - h.z);
    if (d < h.r) best = Math.max(best, Math.sqrt(1 - d / h.r));
  }
  return best;
}
