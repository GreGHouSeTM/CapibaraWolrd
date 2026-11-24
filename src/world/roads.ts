// Routes, pistes, chemins et sentiers du monde : rubans posés **exactement** sur le sol.
// Une seule source de vérité pour l'altitude : heightAt (la même que la physique et le shader du terrain). Le générateur
// (tools/terrain/roads.py) a déjà taillé la plateforme dans le relief ; le ruban en suit la surface à quelques
// centimètres près (LIFT), avec un décalage de profondeur pour ne pas scintiller. Seule exception : les ponts et viaducs
// déclarés (meta.ouvrages), où le ruban suit le tablier (profil en long) en attendant leur modèle (spécialité Routes).
// Revêtement selon la voie : asphalte avec marquages (routes), gravier, terre ou sable (pistes, chemins), terre (sentiers).
import * as THREE from 'three';
import { roadSamples, pathSamples, heightAt, RoadSample } from './heightmap';
import { pbr } from '../core/assets';
import { Batch, std } from '../procgen/kit';
import { addLamp, insideCity } from '../procgen/city';
import { paveRect } from './grass';

/** Hauteur du ruban au-dessus du sol (m) ; le décalage de profondeur du matériau fait le reste. */
export const ROAD_LIFT = 0.03;
const STEP = 1; // pas des sommets le long de la voie (m) : moitié de la maille du relief, le ruban épouse sa surface

/** Points rééchantillonnés tous les `step` m (Catmull-Rom centripète sur les points de la voie) avec l'abscisse curviligne. */
function densify(pts: [number, number][], h: number[], step: number) {
  const out: { x: number; z: number; s: number; y: number }[] = [];
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      const x = f(p0[0], p1[0], p2[0], p3[0]), z = f(p0[1], p1[1], p2[1], p3[1]);
      if (out.length) s += Math.hypot(x - out[out.length - 1].x, z - out[out.length - 1].z);
      out.push({ x, z, s, y: h[i] + (h[i + 1] - h[i]) * t });
    }
  }
  const last = pts[pts.length - 1];
  s += Math.hypot(last[0] - out[out.length - 1].x, last[1] - out[out.length - 1].z);
  out.push({ x: last[0], z: last[1], s, y: h[h.length - 1] });
  return out;
}

interface Mats { surf: THREE.Material; line?: THREE.Material; dash?: THREE.Material }

function ribbon(b: Batch, road: RoadSample, width: number, mats: Mats, lamps: boolean) {
  const D = densify(road.pts, road.h, STEP);
  const s0 = D[0].s;
  // tablier : abscisses des ponts et viaducs de la voie (meta.ouvrages), comptées depuis le début de la voie
  const deck = (s: number) => (road.bridges ?? []).some(([a, c]) => s >= a && s <= c);
  const W = width / 2;
  const across = Math.max(2, Math.ceil(width / 1.2));
  // sur un tablier, jamais sous le sol (raccord des culées)
  const yAt = (x: number, z: number, i: number) => (deck(D[i].s) ? Math.max(D[i].y, heightAt(x, z)) : heightAt(x, z)) + ROAD_LIFT;
  // découpage en tronçons hors des villes (les rues de la ville prennent le relais)
  const runs: number[][] = [];
  let cur: number[] | null = null;
  D.forEach((p, i) => {
    if (insideCity(p.x, p.z, 2)) { cur = null; return; }
    if (!cur) runs.push((cur = []));
    cur.push(i);
  });
  for (const run of runs) {
    if (run.length < 2) continue;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const lines: { pos: number[]; idx: number[] }[] = [{ pos: [], idx: [] }, { pos: [], idx: [] }, { pos: [], idx: [] }];
    run.forEach((i, r) => {
      const p = D[i];
      const q = D[Math.min(i + 1, D.length - 1)], o = D[Math.max(i - 1, 0)];
      const dx = q.x - o.x, dz = q.z - o.z;
      const l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l;
      for (let k = 0; k <= across; k++) {
        const t = k / across - 0.5;
        const x = p.x + nx * t * width, z = p.z + nz * t * width;
        pos.push(x, yAt(x, z, i), z);
        uv.push((t * width) / 7, (p.s - s0) / 7);
      }
      if (mats.line) {
        // marquages : bandes de 18 cm posées sur la même surface (pas de boîtes tendues entre deux points)
        for (const [li, off] of [[0, -W + 0.5], [1, W - 0.5], [2, 0]] as const) {
          for (const e of [-0.09, 0.09]) {
            const x = p.x + nx * (off + e), z = p.z + nz * (off + e);
            lines[li].pos.push(x, yAt(x, z, i) + 0.008, z);
          }
        }
      }
      if (r > 0) {
        const a = (r - 1) * (across + 1), c = r * (across + 1);
        for (let k = 0; k < across; k++) idx.push(a + k, c + k, a + k + 1, a + k + 1, c + k, c + k + 1);
        for (let li = 0; li < 3; li++) {
          // ligne axiale discontinue : 4 m peints, 4 m vides
          if (li === 2 && Math.floor((p.s - s0) / 4) % 2 === 1) continue;
          const a2 = (r - 1) * 2, c2 = r * 2;
          lines[li].idx.push(a2, c2, a2 + 1, a2 + 1, c2, c2 + 1);
        }
      }
      // herbe retirée sur la chaussée et ses accotements
      if (i % 6 === 0) paveRect(p.x, p.z, width + 3, STEP * 7, -Math.atan2(dx, dz));
      if (lamps && i % 56 === 28) {
        const x = p.x + nx * (W + 1.6), z = p.z + nz * (W + 1.6);
        if (!insideCity(x, z, 4)) addLamp(b, 'paris', x, heightAt(x, z), z, Math.atan2(nx, nz) + Math.PI);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    b.add(g, mats.surf, undefined, false);
    if (mats.line)
      lines.forEach((ln, li) => {
        if (!ln.idx.length) return;
        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.Float32BufferAttribute(ln.pos, 3));
        lg.setIndex(ln.idx);
        lg.computeVertexNormals();
        b.add(lg, li === 2 ? mats.dash! : mats.line!, undefined, false);
      });
  }
}

/** Matériau collé au sol : décalage de profondeur vers la caméra (le ruban n'est qu'à quelques centimètres du relief). */
function decal<T extends THREE.Material>(m: T, name: string, k = 1): T {
  m.name = name;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -1 * k;
  m.polygonOffsetUnits = -2 * k;
  return m;
}

export function buildRoads(): THREE.Group {
  const S: Record<string, () => THREE.Material> = {
    asphalte: () => decal(pbr('asphalt', { scale: 7, roughness: 1 }), 'route-chaussee-asphalte'),
    gravier: () => decal(pbr('gravel', { scale: 5, roughness: 1 }), 'route-chaussee-gravier'),
    terre: () => decal(pbr('dirtroad', { scale: 5, roughness: 1 }), 'route-chaussee-terre'),
    sable: () => decal(pbr('sand', { scale: 6, roughness: 1 }), 'route-chaussee-sable'),
    pierre: () => decal(pbr('gravel', { scale: 4, roughness: 1 }), 'route-chaussee-pierre'),
    neige: () => decal(pbr('gravel', { scale: 4, roughness: 1 }), 'route-chaussee-neige'),
  };
  const cache: Record<string, THREE.Material> = {};
  const surf = (k: string | undefined) => (cache[k ?? 'asphalte'] ??= (S[k ?? 'asphalte'] ?? S.asphalte)());
  const line = decal(std(0xf4f4ec, 0.6), 'route-marquage', 2);
  const dash = decal(std(0xf2d14a, 0.6), 'route-marquage-axe', 2);
  const b = new Batch(200);
  for (const road of roadSamples) {
    const asph = (road.surface ?? 'asphalte') === 'asphalte';
    ribbon(b, road, road.width, asph ? { surf: surf('asphalte'), line, dash } : { surf: surf(road.surface) }, asph);
  }
  // chemins étroits et sentiers (lacets vers les sommets) : bandes de terre ou de pierre, sans marquage
  for (const p of pathSamples) ribbon(b, p, p.width, { surf: surf(p.surface === 'asphalte' ? 'terre' : p.surface) }, false);
  return b.build('roads');
}
