// Détail de près du relief (spécialité Terrain & relief) : bosses et arêtes de 0,1 à 0,4 m sur la roche, les éboulis et
// les pentes fortes, là où la grille de 2 m reste lisse. Même calcul exact sur le processeur (heightAt : physique,
// placement) et sur la carte graphique (sommets des anneaux proches du clipmap et normales par pixel) : une seule
// source de vérité. Hachage entier 32 bits identique en JavaScript (Math.imul) et en GLSL (uint).
// Le détail est nul sur les voies (pente faible), dans les plats et dans la vallée de Capyville (relief d'origine).

/** Amplitude maximale (m) et longueurs d'onde (m) des trois octaves. */
export const DETAIL_AMP = 0.42;
const L1 = 3.3, L2 = 1.45, L3 = 0.62;

function hash(ix: number, iz: number, seed: number) {
  // indices décalés de 65 536 : toujours positifs, même conversion entière en JavaScript et en GLSL
  let h = (Math.imul(ix + 65536, 374761393) + Math.imul(iz + 65536, 668265263) + Math.imul(seed, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h & 0xffffff) / 0xffffff;
}

function vnoise(x: number, z: number, seed: number) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
}

/** Forme du détail (sans le masque), en mètres pour un masque de 1 : arêtes de roche anguleuses + bosses. */
export function detailShape(x: number, z: number) {
  const r = 1 - Math.abs(vnoise(x / L1, z / L1, 11)); // arêtes (bruit « en crêtes »)
  return DETAIL_AMP * (0.55 * (r * r - 0.45) + 0.3 * vnoise(x / L2 + 0.37, z / L2 - 0.21, 12) + 0.15 * vnoise(x / L3, z / L3, 13));
}

/** Masque 0..1 : roche (carte dérivée), éboulis, pente (tan) ; nul près de Capyville. */
export function detailMask(rock: number, depo: number, slopeTan: number, x: number, z: number) {
  const st = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const m = Math.max(rock, 0.8 * depo) * st(0.3, 0.55, slopeTan) + 0.6 * st(0.65, 1.0, slopeTan);
  return Math.min(1, m) * st(640, 720, Math.hypot(x, z));
}

export const TERRAIN_DETAIL_GLSL = /* glsl */ `
float tdHash(int ix, int iz, int seed) {
  uint h = uint(ix + 65536) * 374761393u + uint(iz + 65536) * 668265263u + uint(seed) * 1442695041u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h = h ^ (h >> 16u);
  return float(h & 16777215u) / 16777215.0;
}
float tdNoise(vec2 p, int seed) {
  vec2 i = floor(p), f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  int ix = int(i.x), iz = int(i.y);
  float a = tdHash(ix, iz, seed), b = tdHash(ix + 1, iz, seed), c = tdHash(ix, iz + 1, seed), d = tdHash(ix + 1, iz + 1, seed);
  return (a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y) * 2.0 - 1.0;
}
float terrainDetailShape(vec2 p) {
  float r = 1.0 - abs(tdNoise(p / ${L1.toFixed(3)}, 11));
  return ${DETAIL_AMP.toFixed(3)} * (0.55 * (r * r - 0.45) + 0.3 * tdNoise(p / ${L2.toFixed(3)} + vec2(0.37, -0.21), 12) + 0.15 * tdNoise(p / ${L3.toFixed(3)}, 13));
}
float terrainDetailMask(float rock, float depo, float slopeTan, vec2 p) {
  float m = max(rock, 0.8 * depo) * smoothstep(0.3, 0.55, slopeTan) + 0.6 * smoothstep(0.65, 1.0, slopeTan);
  return min(1.0, m) * smoothstep(640.0, 720.0, length(p));
}
`;
