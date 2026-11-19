// Disposition générale du monde (8 × 8 km, bible du monde) : Capyville au centre, six régions à 2,5-3,4 km.
// Positions, sols et voies lus dans world-map.ts (source de vérité du Lead) ; les régions gardent leur contenu.
import { colRoute } from './valley';
import { WAYS, WORLD, WORLD_REGIONS } from './world-map';
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

export const WORLD_SIZE = WORLD.size; // 8 000 m, de -4 000 à +4 000
export const WATER_LEVEL = 0;
// Brouillard des régions : densités de la brume de distance, réglées pour 8 km (bible §10 : l'horizon se fond vers 5 km,
// le mont Fuji reste visible depuis la place à 2,9 km). La brume au sol des vallées (sky.ts, postfx.ts) n'en dépend pas.

// --- TERRAIN & RELIEF : positions, sols et rayons d'influence des régions lus dans WORLD_REGIONS (world-map.ts) ;
// cityRadius garde l'emprise du contenu actuel des villes (aplatie par le relief cuit, tools/terrain/carve.py).
const WR = (id: RegionId) => WORLD_REGIONS.find((r) => r.id === id)!;
const at = (id: RegionId): { x: number; z: number; ground: number; radius: number } => {
  const r = WR(id);
  return { x: r.x, z: r.z, ground: r.ground, radius: Math.round(r.radius * 0.5) };
};

export const REGIONS: RegionDef[] = [
  {
    id: 'hub', name: 'Capyville', welcome: 'Bienvenue à Capyville !', x: 0, z: 0, radius: 330, cityRadius: 150, ground: 6,
    look: 'nature', fog: [0.72, 0.82, 0.9], fogDensity: 0.00016, saturation: 0.18, contrast: 0.06, warmth: 0.25, music: 'hub',
  },
  {
    id: 'paris', name: 'Paris', welcome: 'Bonjour Paris !', ...at('paris'), cityRadius: 280,
    look: 'city', fog: [0.78, 0.8, 0.84], fogDensity: 0.00018, saturation: 0.04, contrast: 0.1, warmth: 0.15, music: 'paris',
  },
  {
    id: 'newyork', name: 'New York', welcome: 'Welcome to New York !', ...at('newyork'), cityRadius: 280,
    look: 'city', fog: [0.74, 0.78, 0.85], fogDensity: 0.00018, saturation: 0.02, contrast: 0.12, warmth: -0.05, music: 'newyork',
  },
  {
    id: 'desert', name: 'Le Désert des Dunes', welcome: 'Le Désert des Dunes', ...at('desert'), cityRadius: 130,
    look: 'nature', fog: [0.93, 0.82, 0.66], fogDensity: 0.00014, saturation: 0.2, contrast: 0.06, warmth: 0.6, music: 'desert',
  },
  {
    id: 'japan', name: 'Le Japon', welcome: 'Konnichiwa ! Le Japon', ...at('japan'), cityRadius: 170,
    look: 'nature', fog: [0.78, 0.84, 0.92], fogDensity: 0.00016, saturation: 0.22, contrast: 0.05, warmth: 0.1, music: 'japan',
  },
  {
    id: 'pole', name: 'Le Pôle Nord', welcome: 'Brrr… le Pôle Nord !', ...at('pole'), cityRadius: 140,
    look: 'nature', fog: [0.85, 0.9, 0.97], fogDensity: 0.00019, saturation: 0.12, contrast: 0.04, warmth: -0.5, music: 'pole',
  },
  {
    id: 'london', name: 'Londres', welcome: 'Hello Londres !', ...at('london'), cityRadius: 260,
    look: 'city', fog: [0.74, 0.77, 0.8], fogDensity: 0.00021, saturation: 0.0, contrast: 0.08, warmth: -0.1, music: 'london',
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
  // Rayons : les six couloirs des cols de Capyville (valley.ts), dans l'ordre des régions (Paris d'abord : mission « Premier volant »)
  for (const r of outer) {
    const pass = colRoute(r.id);
    if (pass) {
      roads.push({ pts: pass.pts.map((p) => [p[0], p[1]] as [number, number]), width: 9 });
      continue;
    }
    const a = edge(hub, r, 28);
    const b = edge(r, hub, r.cityRadius * 0.82);
    roads.push({ pts: [a, b], width: 9 });
  }
  // --- TERRAIN & RELIEF : voies carrossables du monde (WAYS de world-map.ts : routes, routes de gravier, pistes)
  for (const w of WAYS) {
    if (!w.vehicles || w.width < 5) continue;
    roads.push({ pts: w.pts.map((p) => [p[0], p[1]] as [number, number]), width: w.kind === 'route' ? 9 : w.width + 1 });
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
