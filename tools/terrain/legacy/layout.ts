// COPIE FIGÉE de src/world/layout.ts (main 2171281, monde de 3,2 km), utilisée seulement par legacy/heightmap.ts. Ne pas modifier.
// Disposition générale du monde : une prairie centrale (Capyville) entourée de six régions.
import { colRoute } from '../../../src/world/valley';
export type RegionId = 'hub' | 'paris' | 'newyork' | 'london' | 'japan' | 'desert' | 'pole';
export type Look = 'city' | 'nature';

export interface RegionDef {
  id: RegionId;
  name: string; // nom affiché
  welcome: string;
  x: number;
  z: number;
  radius: number; // rayon d'influence
  cityRadius: number; // zone aplatie (ville / village)
  ground: number; // altitude de la zone aplatie
  look: Look;
  /** Réglages d'ambiance : brouillard, étalonnage. */
  fog: [number, number, number];
  fogDensity: number;
  saturation: number;
  contrast: number;
  warmth: number; // -1 froid … +1 chaud
  music: 'hub' | 'paris' | 'newyork' | 'london' | 'japan' | 'desert' | 'pole';
}

export const WORLD_SIZE = 3200; // mètres, de -1600 à +1600
export const WATER_LEVEL = 0;
export const COAST_RADIUS = 1230;

const ring = 800;
const at = (deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [Math.sin(a) * ring, -Math.cos(a) * ring];
};

export const REGIONS: RegionDef[] = [
  {
    id: 'hub', name: 'Capyville', welcome: 'Bienvenue à Capyville !', x: 0, z: 0, radius: 330, cityRadius: 150, ground: 6,
    look: 'nature', fog: [0.72, 0.82, 0.9], fogDensity: 0.0011, saturation: 0.18, contrast: 0.06, warmth: 0.25, music: 'hub',
  },
  {
    id: 'paris', name: 'Paris', welcome: 'Bonjour Paris !', x: at(0)[0], z: at(0)[1], radius: 380, cityRadius: 280, ground: 6,
    look: 'city', fog: [0.78, 0.8, 0.84], fogDensity: 0.0012, saturation: 0.04, contrast: 0.1, warmth: 0.15, music: 'paris',
  },
  {
    id: 'newyork', name: 'New York', welcome: 'Welcome to New York !', x: at(60)[0], z: at(60)[1], radius: 380, cityRadius: 280, ground: 6,
    look: 'city', fog: [0.74, 0.78, 0.85], fogDensity: 0.0012, saturation: 0.02, contrast: 0.12, warmth: -0.05, music: 'newyork',
  },
  {
    id: 'desert', name: 'Le Désert des Dunes', welcome: 'Le Désert des Dunes', x: at(120)[0], z: at(120)[1], radius: 420, cityRadius: 130, ground: 8,
    look: 'nature', fog: [0.93, 0.82, 0.66], fogDensity: 0.0011, saturation: 0.2, contrast: 0.06, warmth: 0.6, music: 'desert',
  },
  {
    id: 'japan', name: 'Le Japon', welcome: 'Konnichiwa ! Le Japon', x: at(180)[0], z: at(180)[1], radius: 400, cityRadius: 170, ground: 6,
    look: 'nature', fog: [0.78, 0.84, 0.92], fogDensity: 0.0011, saturation: 0.22, contrast: 0.05, warmth: 0.1, music: 'japan',
  },
  {
    id: 'pole', name: 'Le Pôle Nord', welcome: 'Brrr… le Pôle Nord !', x: at(240)[0], z: at(240)[1], radius: 420, cityRadius: 140, ground: 4,
    look: 'nature', fog: [0.85, 0.9, 0.97], fogDensity: 0.0013, saturation: 0.12, contrast: 0.04, warmth: -0.5, music: 'pole',
  },
  {
    id: 'london', name: 'Londres', welcome: 'Hello Londres !', x: at(300)[0], z: at(300)[1], radius: 380, cityRadius: 260, ground: 6,
    look: 'city', fog: [0.74, 0.77, 0.8], fogDensity: 0.0014, saturation: 0.0, contrast: 0.08, warmth: -0.1, music: 'london',
  },
];

export const regionById = (id: RegionId) => REGIONS.find((r) => r.id === id)!;

/** Pondération d'influence de chaque région en un point (somme normalisée). */
export function regionWeights(x: number, z: number): { id: RegionId; w: number }[] {
  const out: { id: RegionId; w: number }[] = [];
  let sum = 0;
  for (const r of REGIONS) {
    const d = Math.hypot(x - r.x, z - r.z);
    const w = Math.max(0, 1 - d / (r.radius * 1.6)) ** 3;
    out.push({ id: r.id, w });
    sum += w;
  }
  if (sum < 1e-6) return [{ id: 'hub', w: 1 }];
  for (const o of out) o.w /= sum;
  return out;
}

/** Région la plus proche (pour l'ambiance et l'affichage). */
export function nearestRegion(x: number, z: number): RegionDef {
  let best = REGIONS[0];
  let bd = Infinity;
  for (const r of REGIONS) {
    const d = Math.hypot(x - r.x, z - r.z) / r.radius;
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  return best;
}

// --- Routes entre régions ---
export interface RoadDef {
  pts: [number, number][]; // points de contrôle (x, z)
  width: number;
}

function edge(r: RegionDef, toward: { x: number; z: number }, dist: number): [number, number] {
  const dx = toward.x - r.x, dz = toward.z - r.z;
  const l = Math.hypot(dx, dz);
  return [r.x + (dx / l) * dist, r.z + (dz / l) * dist];
}

function buildRoads(): RoadDef[] {
  const roads: RoadDef[] = [];
  const hub = REGIONS[0];
  const outer = REGIONS.slice(1);
  // Rayons : du village vers chaque région
  for (const r of outer) {
    // --- TERRAIN & RELIEF : l'axe part de la porte du village et suit le couloir creusé dans le col (valley.ts) ---
    const pass = colRoute(r.id);
    if (pass) {
      roads.push({ pts: pass.pts.map((p) => [p[0], p[1]] as [number, number]), width: 9 });
      continue;
    }
    // --- fin du bloc TERRAIN & RELIEF ---
    const a = edge(hub, r, 28);
    const b = edge(r, hub, r.cityRadius * 0.82);
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const px = -(b[1] - a[1]) * 0.08, pz = (b[0] - a[0]) * 0.08;
    roads.push({ pts: [a, [mx + px, mz + pz], b], width: 9 });
  }
  // Anneau extérieur reliant les régions voisines
  for (let i = 0; i < outer.length; i++) {
    const r1 = outer[i], r2 = outer[(i + 1) % outer.length];
    const a = edge(r1, r2, r1.cityRadius * 0.8);
    const b = edge(r2, r1, r2.cityRadius * 0.8);
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const ml = Math.hypot(mx, mz);
    const push = 1.0 + 60 / ml;
    roads.push({ pts: [a, [mx * push, mz * push], b], width: 9 });
  }
  return roads;
}

export const ROADS = buildRoads();

/** Catmull-Rom échantillonné tous les `step` mètres. */
export function sampleRoad(road: RoadDef, step = 6): [number, number][] {
  const P = [road.pts[0], ...road.pts, road.pts[road.pts.length - 1]];
  const out: [number, number][] = [];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(road.pts[road.pts.length - 1]);
  return out;
}
