// Collisions simples et robustes : boîtes orientées et cylindres rangés dans une grille spatiale,
// plus des surfaces « marchables » (ponts, quais, plateformes) au-dessus du terrain.
import { heightAt } from './heightmap';
import { WATER_LEVEL } from './layout';

export interface BoxCollider {
  kind: 'box';
  x: number; z: number; hx: number; hz: number; rot: number;
  y0: number; y1: number;
  /** Si vrai, le dessus de la boîte est marchable (toit, pont, plateforme). */
  walkTop?: boolean;
  tag?: string;
  /** origine (fichier:ligne de l'appel), renseignée seulement en mode diagnostic `?acces` */
  src?: string;
}
export interface CircleCollider {
  kind: 'circle';
  x: number; z: number; r: number; y0: number; y1: number; walkTop?: boolean; tag?: string; src?: string;
}
export type Collider = BoxCollider | CircleCollider;

const CELL = 24;
const grid = new Map<number, Collider[]>();
const key = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);

// --- CONDUITE & ACCÈS --- mode diagnostic (`?acces` dans l'URL) : chaque collision retient le fichier et la ligne
// qui l'ont créée, pour que tools/acces-test.cjs nomme l'objet qui bloque un chemin ou un pont.
const TRACE = typeof location !== 'undefined' && /[?&]acces(&|=|$)/.test(location.search);
function callerOf(stack: string) {
  // deux appelants (ex. « bollard ← buildVillageGround ») ; les lignes sont celles du code servi par Vite
  const lines = stack.split('\n').slice(1).map((l) => l.trim()).filter((l) => !/physics\.ts/.test(l)).slice(0, 2);
  return lines.map((l) => {
    const m = l.match(/at (?:([\w$.<>]+) )?\(?.*\/src\/([^?:)]+)(?:\?[^:)]*)?:(\d+)/);
    return m ? `${m[1] ?? '?'} (${m[2]}:${m[3]})` : l;
  }).join(' ← ');
}

export function addCollider(c: Collider) {
  if (TRACE && !c.src) c.src = callerOf(new Error().stack ?? '');
  let rx: number, rz: number;
  if (c.kind === 'box') {
    const cos = Math.abs(Math.cos(c.rot)), sin = Math.abs(Math.sin(c.rot));
    rx = c.hx * cos + c.hz * sin;
    rz = c.hx * sin + c.hz * cos;
  } else {
    rx = rz = c.r;
  }
  const i0 = Math.floor((c.x - rx) / CELL), i1 = Math.floor((c.x + rx) / CELL);
  const j0 = Math.floor((c.z - rz) / CELL), j1 = Math.floor((c.z + rz) / CELL);
  for (let i = i0; i <= i1; i++)
    for (let j = j0; j <= j1; j++) {
      const k = key(i, j);
      let arr = grid.get(k);
      if (!arr) grid.set(k, (arr = []));
      arr.push(c);
    }
}

export function addBox(x: number, z: number, w: number, d: number, y0: number, y1: number, rot = 0, walkTop = false, tag?: string) {
  addCollider({ kind: 'box', x, z, hx: w / 2, hz: d / 2, rot, y0, y1, walkTop, tag });
}
export function addCircle(x: number, z: number, r: number, y0: number, y1: number, walkTop = false, tag?: string) {
  addCollider({ kind: 'circle', x, z, r, y0, y1, walkTop, tag });
}

const seen = new Set<Collider>();
function query(x: number, z: number, r: number, cb: (c: Collider) => void) {
  seen.clear();
  const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
  const j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
  for (let i = i0; i <= i1; i++)
    for (let j = j0; j <= j1; j++) {
      const arr = grid.get(key(i, j));
      if (!arr) continue;
      for (const c of arr) {
        if (seen.has(c)) continue;
        seen.add(c);
        cb(c);
      }
    }
}

function toLocal(c: BoxCollider, x: number, z: number) {
  const dx = x - c.x, dz = z - c.z;
  const cs = Math.cos(-c.rot), sn = Math.sin(-c.rot);
  return [dx * cs - dz * sn, dx * sn + dz * cs];
}

function inside(c: Collider, x: number, z: number, pad: number) {
  if (c.kind === 'circle') return Math.hypot(x - c.x, z - c.z) < c.r + pad;
  const [lx, lz] = toLocal(c, x, z);
  return Math.abs(lx) < c.hx + pad && Math.abs(lz) < c.hz + pad;
}

/** Hauteur du sol sous (x, z) en tenant compte des surfaces marchables sous `fromY`. */
export function groundAt(x: number, z: number, fromY = Infinity, pad = 0): number {
  let g = heightAt(x, z);
  query(x, z, 1, (c) => {
    if (!c.walkTop) return;
    if (c.y1 > g && c.y1 <= fromY + 0.7 && inside(c, x, z, pad)) g = c.y1;
  });
  return g;
}

export interface PushResult {
  x: number; z: number; hit: boolean; nx: number; nz: number;
}

/** Repousse un cercle (rayon r, entre y et y+height) hors des obstacles. */
export function resolveCircle(x: number, z: number, y: number, r: number, height: number): PushResult {
  const out: PushResult = { x, z, hit: false, nx: 0, nz: 0 };
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    query(out.x, out.z, r + 1, (c) => {
      if (y + height < c.y0 || y >= c.y1 - 0.45) return; // au-dessus (on peut marcher dessus) ou en dessous
      if (c.kind === 'circle') {
        const dx = out.x - c.x, dz = out.z - c.z;
        const d = Math.hypot(dx, dz);
        const min = c.r + r;
        if (d < min && d > 1e-6) {
          out.x = c.x + (dx / d) * min;
          out.z = c.z + (dz / d) * min;
          out.hit = moved = true;
          out.nx = dx / d; out.nz = dz / d;
        }
      } else {
        const [lx, lz] = toLocal(c, out.x, out.z);
        const cx = Math.max(-c.hx, Math.min(c.hx, lx));
        const cz = Math.max(-c.hz, Math.min(c.hz, lz));
        let dx = lx - cx, dz = lz - cz;
        let d = Math.hypot(dx, dz);
        let nlx: number, nlz: number, nx: number, nz: number;
        if (d < 1e-6) {
          // centre à l'intérieur : on sort par le côté le plus proche
          const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
          if (px < pz) { nlx = (Math.sign(lx) || 1) * (c.hx + r); nlz = lz; dx = Math.sign(lx) || 1; dz = 0; }
          else { nlz = (Math.sign(lz) || 1) * (c.hz + r); nlx = lx; dz = Math.sign(lz) || 1; dx = 0; }
          d = 1;
        } else if (d < r) {
          nlx = cx + (dx / d) * r;
          nlz = cz + (dz / d) * r;
        } else return;
        const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
        out.x = c.x + nlx * cs - nlz * sn;
        out.z = c.z + nlx * sn + nlz * cs;
        nx = (dx / d) * cs - (dz / d) * sn;
        nz = (dx / d) * sn + (dz / d) * cs;
        out.nx = nx; out.nz = nz;
        out.hit = moved = true;
      }
    });
    if (!moved) break;
  }
  return out;
}

export const isWater = (x: number, z: number) => groundAt(x, z) < WATER_LEVEL - 0.6;

/** Lancer de rayon grossier pour la caméra : renvoie la fraction libre du trajet. */
export function raycastFraction(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const steps = 16;
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
    if (y < heightAt(x, z) + 0.3) return Math.max(0, (s - 1) / steps);
    let blocked = false;
    query(x, z, 0.5, (c) => {
      if (!blocked && y > c.y0 && y < c.y1 && inside(c, x, z, 0.3) && c.tag !== 'thin') blocked = true;
    });
    if (blocked) return Math.max(0, (s - 1) / steps);
  }
  return 1;
}

/** --- CONDUITE & ACCÈS --- collisions (non marchables) qui touchent le disque (x, z, r) entre y0 et y1 (diagnostic). */
export function collidersNear(x: number, z: number, r: number, y0 = -Infinity, y1 = Infinity): Collider[] {
  const out: Collider[] = [];
  query(x, z, r + 1, (c) => {
    if (c.y1 < y0 || c.y0 > y1) return;
    if (inside(c, x, z, r)) out.push(c);
  });
  return out;
}

// diagnostic : accès direct depuis les outils de test (indépendant du rechargement à chaud de Vite)
if (TRACE) (globalThis as unknown as { __physics: object }).__physics = { collidersNear, groundAt, resolveCircle };

export function clearPhysics() {
  grid.clear();
}
