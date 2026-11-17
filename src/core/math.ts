// Petites fonctions mathématiques, générateur aléatoire déterministe et bruit de simplex 2D.

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const angleDiff = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
export const dampAngle = (a: number, b: number, lambda: number, dt: number) =>
  a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));

/** Générateur pseudo-aléatoire mulberry32 (déterministe : même monde à chaque partie). */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number) {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p: number) {
    return this.next() < p;
  }
}

// --- Bruit simplex 2D (domaine public, d'après S. Gustavson) ---
const grad3 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1],
];
const perm = new Uint8Array(512);
{
  const r = new Rng(1337);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r.next() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

export function noise2(xin: number, yin: number): number {
  const s = (xin + yin) * F2;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const t = (i + j) * G2;
  const x0 = xin - (i - t);
  const y0 = yin - (j - t);
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  const ii = i & 255;
  const jj = j & 255;
  let n0 = 0, n1 = 0, n2 = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) {
    const g = grad3[perm[ii + perm[jj]] & 7];
    t0 *= t0;
    n0 = t0 * t0 * (g[0] * x0 + g[1] * y0);
  }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) {
    const g = grad3[perm[ii + i1 + perm[jj + j1]] & 7];
    t1 *= t1;
    n1 = t1 * t1 * (g[0] * x1 + g[1] * y1);
  }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) {
    const g = grad3[perm[ii + 1 + perm[jj + 1]] & 7];
    t2 *= t2;
    n2 = t2 * t2 * (g[0] * x2 + g[1] * y2);
  }
  return 70 * (n0 + n1 + n2); // ~[-1, 1]
}

export function fbm(x: number, y: number, octaves = 5, lac = 2, gain = 0.5): number {
  let a = 1, f = 1, s = 0, n = 0;
  for (let o = 0; o < octaves; o++) {
    s += a * noise2(x * f, y * f);
    n += a;
    a *= gain;
    f *= lac;
  }
  return s / n;
}

export function ridged(x: number, y: number, octaves = 4): number {
  let a = 0.5, f = 1, s = 0;
  for (let o = 0; o < octaves; o++) {
    s += a * (1 - Math.abs(noise2(x * f, y * f)));
    a *= 0.5;
    f *= 2;
  }
  return s;
}

/** Distance d'un point à un segment, et paramètre t le long du segment. */
export function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1e-9;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
  const cx = ax + dx * t, cz = az + dz * t;
  return { d: Math.hypot(px - cx, pz - cz), t };
}
