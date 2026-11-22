// Chemins tracés (spécialité Montagne) : sur un chemin, un sentier ou à la tête d'un pont, les ressauts raides se franchissent
// toujours (marches et prises taillées, câbles) : on ralentit, mais on ne glisse pas et on n'est jamais bloqué.
// Hors des chemins, les règles de pente de mountain.ts s'appliquent (le dossier veut des voies balisées lisibles).
// Sources : PATHS et BRIDGES de zones.ts (Capyville), voies du monde posées par le Terrain (terrainData.meta.ways).
import { PATHS, BRIDGES } from '../world/zones';
import { terrainData } from '../world/terrain-data';

interface Seg { ax: number; az: number; bx: number; bz: number; r: number }
const CELL = 16;
const grid = new Map<number, Seg[]>();
const key = (i: number, j: number) => (i + 2048) * 4096 + (j + 2048);
let built = false;

function addSeg(s: Seg) {
  const i0 = Math.floor((Math.min(s.ax, s.bx) - s.r) / CELL), i1 = Math.floor((Math.max(s.ax, s.bx) + s.r) / CELL);
  const j0 = Math.floor((Math.min(s.az, s.bz) - s.r) / CELL), j1 = Math.floor((Math.max(s.az, s.bz) + s.r) / CELL);
  for (let i = i0; i <= i1; i++)
    for (let j = j0; j <= j1; j++) {
      const k = key(i, j);
      let a = grid.get(k);
      if (!a) grid.set(k, (a = []));
      a.push(s);
    }
}

function addLine(pts: [number, number][], r: number) {
  for (let i = 0; i < pts.length - 1; i++) addSeg({ ax: pts[i][0], az: pts[i][1], bx: pts[i + 1][0], bz: pts[i + 1][1], r });
}

/** Construit la grille des chemins (appelé au premier besoin ; à rappeler si le relief est rechargé). */
export function buildTrails() {
  grid.clear();
  for (const p of PATHS) addLine(p.pts as [number, number][], p.width / 2 + 1.2);
  // ponts : le tablier et 8 m d'approche de chaque côté, dans l'axe
  for (const b of BRIDGES) {
    const dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1], l = Math.hypot(dx, dz) || 1;
    const ux = dx / l, uz = dz / l;
    addLine([[b.a[0] - ux * 8, b.a[1] - uz * 8], [b.b[0] + ux * 8, b.b[1] + uz * 8]], b.width / 2 + 1.2);
  }
  for (const w of terrainData?.meta.ways ?? []) addLine(w.pts, w.width / 2 + 1.2);
  built = true;
}

/** Le point est-il sur un chemin tracé ? */
export function onTrail(x: number, z: number): boolean {
  if (!built) buildTrails();
  const a = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!a) return false;
  for (const s of a) {
    const dx = s.bx - s.ax, dz = s.bz - s.az;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / l2));
    if (Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) <= s.r) return true;
  }
  return false;
}
