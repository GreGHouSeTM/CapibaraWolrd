// Génère docs/plan-monde.svg depuis src/world/world-map.ts (et la couronne de Capyville depuis zones.ts).
// Usage : node tools/plan-monde.mjs [--png chemin.png]   (Node ≥ 23.6 : lit directement les fichiers .ts)
//
// La carte comporte : un relief schématique ombré (calculé ici à partir des chaînes, sommets, fonds de relief,
// rivières et lacs : ce n'est PAS le terrain final, seulement une illustration lisible), les biomes en couleurs fondues
// sur leur largeur de transition, l'eau, les voies, les régions, villages, repères, cols, points d'intérêt et vues.
// Le script imprime aussi des contrôles : longueurs et temps de parcours, croisements voie × rivière sans pont,
// distance maximale à un point d'intérêt nommé.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = await import(pathToFileURL(path.join(root, 'src/world/world-map.ts')).href);
const Z = await import(pathToFileURL(path.join(root, 'src/world/zones.ts')).href);

// ------------------------------------------------------------------------------------------------ géométrie
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
  return { d: Math.hypot(px - ax - dx * t, pz - az - dz * t), t };
}
function inPoly(x, z, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
/** distance signée au polygone (positive à l'intérieur) */
function sdPoly(x, z, poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, segDist(x, z, poly[j][0], poly[j][1], poly[i][0], poly[i][1]).d);
  return inPoly(x, z, poly) ? d : -d;
}
function polyLen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }
function nearestOnPolyline(x, z, pts) {
  let best = { d: Infinity, i: 0, t: 0 };
  for (let i = 0; i < pts.length - 1; i++) { const s = segDist(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]); if (s.d < best.d) best = { d: s.d, i, t: s.t }; }
  return best;
}
// bruit de valeur
function hash(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash(i, j), hash(i + 1, j), u), lerp(hash(i, j + 1), hash(i + 1, j + 1), u), v) * 2 - 1;
}
function fbm(x, z, o = 4) { let s = 0, a = 0.5, f = 1; for (let k = 0; k < o; k++) { s += a * vnoise(x * f, z * f); a *= 0.5; f *= 2.03; } return s; }
function ridged(x, z, o = 4) { let s = 0, a = 0.5, f = 1; for (let k = 0; k < o; k++) { s += a * (1 - Math.abs(vnoise(x * f + 17, z * f - 9))); a *= 0.5; f *= 2.1; } return s; }

// ------------------------------------------------------------------------------------------------ relief schématique
const chainSegs = W.CHAINS.flatMap((c) => c.crest.slice(0, -1).map((p, i) => ({ c, a: p, b: c.crest[i + 1] })));
function height(x, z) {
  const sCoast = sdPoly(x, z, W.COASTLINE);
  if (sCoast < 0) return -14 * smooth(0, 300, -sCoast) - 1;
  // fond : moyenne pondérée des zones de relief
  let hs = 18 + 14 * fbm(x / 900, z / 900, 3), ws = 0.08;
  hs *= ws;
  for (const r of W.RELIEF_ZONES) {
    const sd = sdPoly(x, z, r.poly);
    const w = smooth(-250, 250, sd);
    if (w <= 0) continue;
    const t = smooth(0, 700, sd);
    let b = lerp(r.base[0], r.base[1], t);
    if (r.kind === 'erg') b += r.amplitude * Math.pow(ridged((x * 0.9 + z * 0.25) / 160, (z - x * 0.2) / 420, 2), 3) * t;
    else b += r.amplitude * r.roughness * fbm(x / 260, z / 260, 4);
    hs += b * w; ws += w;
  }
  let h = hs / ws;
  // chaînes
  for (const { c, a, b } of chainSegs) {
    const s = segDist(x, z, a[0], a[1], b[0], b[1]);
    const u = s.d / c.halfWidth;
    if (u >= 1) continue;
    const hc = lerp(a[2], b[2], s.t);
    const rough = c.profile === 'alpin' ? 0.35 : c.profile === 'tabulaire' ? 0.05 : 0.18;
    const prof = c.profile === 'tabulaire' ? smooth(1, 0.55, u) : Math.pow(1 - u, c.profile === 'alpin' ? 1.5 : 1.9);
    const r = h + (hc - h) * prof * (1 + rough * (ridged(x / 220, z / 220, 4) - 0.6));
    if (r > h) h = r;
  }
  // sommets
  for (const p of W.WORLD_PEAKS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (p.shape === 'dormeur') {
      // corps allongé nord-sud + tête au nord
      const body = Math.hypot((x - p.x) / 330, (z - p.z - 80) / 520);
      const head = Math.hypot((x - p.x) / 230, (z - p.z + 360) / 200);
      const hb = body < 1 ? h + (280 - h) * Math.sqrt(1 - body * body) : h;
      const hh = head < 1 ? h + (p.y - h) * Math.sqrt(1 - head * head) : h;
      h = Math.max(h, hb, hh);
      continue;
    }
    if (d >= p.base) continue;
    const u = d / p.base;
    let r;
    if (p.shape === 'mesa') r = h + (p.y - h) * smooth(0.62, 0.42, u);
    else if (p.shape === 'volcan') r = h + (p.y - h) * Math.pow(1 - u, 1.8) - 25 * smooth(0.06, 0.0, u);
    else if (p.shape === 'dome') r = h + (p.y - h) * Math.sqrt(Math.max(0, 1 - u * u)) ** 1.3;
    else if (p.shape === 'alpin') r = h + (p.y - h) * Math.pow(1 - u, 1.4) * (1 + 0.3 * (ridged(x / 150, z / 150, 3) - 0.6));
    else r = h + (p.y - h) * Math.pow(1 - u, 1.8);
    if (r > h) h = r;
  }
  // couronne de Capyville (zones.ts)
  for (const p of Z.PEAKS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.base * 1.4) h = Math.max(h, 6 + (p.y - 6) * Math.pow(1 - d / (p.base * 1.4), 1.6));
  }
  const dv = Math.hypot(x, z);
  if (dv < 300) h = lerp(6, h, smooth(200, 300, dv));
  // rivières : vallée et lit
  for (const r of W.RIVERS) {
    const n = nearestOnPolyline(x, z, r.pts);
    if (n.d > 260) continue;
    const y = lerp(r.y[n.i], r.y[n.i + 1], n.t), w = lerp(r.w[n.i], r.w[n.i + 1], n.t);
    const valley = 40 + w * 2;
    h = Math.min(h, lerp(Math.max(y - 1, 0.4), h, smooth(w / 2, w / 2 + valley, n.d)));
  }
  for (const l of W.LAKES) {
    const a = (l.rot * Math.PI) / 180, dx = x - l.x, dz = z - l.z;
    const u = Math.hypot((dx * Math.cos(a) + dz * Math.sin(a)) / l.rx, (-dx * Math.sin(a) + dz * Math.cos(a)) / l.rz);
    if (u < 1.6) h = Math.min(h, lerp(l.y - 2, h, smooth(1, 1.6, u)));
  }
  // villes, villages : aplanis vers leur sol de référence (TERRAIN_RULES.flatten)
  for (const r of W.WORLD_REGIONS) {
    if (r.id === 'hub') continue;
    const d = Math.hypot(x - r.x, z - r.z);
    if (d < r.core + 200) h = lerp(h, r.ground + 6 * fbm(x / 200, z / 200, 2), smooth(r.core + 200, r.core * 0.6, d));
  }
  for (const s of W.SETTLEMENTS) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < s.r + 60) h = lerp(h, s.y, smooth(s.r + 60, s.r * 0.5, d) * 0.85);
  }
  // rivage
  return lerp(1, h, smooth(0, 90, sCoast));
}

// ------------------------------------------------------------------------------------------------ couleurs des biomes
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const biomeCols = W.BIOMES.map((b) => ({ b, c: hex(b.color) }));
const ARCTIC = new Set(['pinede-neige', 'toundra', 'banquise', 'haute-montagne']);
function biomeColor(x, z, land) {
  let c = biomeCols[0].c.slice(), arctic = 0;
  for (let i = 1; i < biomeCols.length; i++) {
    const { b, c: bc } = biomeCols[i];
    const sd = sdPoly(x, z, b.poly);
    const half = b.transition * 0.5;
    if (sd < -half) continue;
    const w = smooth(-half, half, sd);
    if (b.id === 'banquise' && land) continue;
    for (let k = 0; k < 3; k++) c[k] = lerp(c[k], bc[k], w);
    if (ARCTIC.has(b.id)) arctic = Math.max(arctic, w);
  }
  return { c, arctic };
}

// ------------------------------------------------------------------------------------------------ raster
const N = 800, CELL = W.WORLD.size / N, HALF = W.WORLD.half;
const H = new Float32Array(N * N);
const t0 = Date.now();
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = height(-HALF + (i + 0.5) * CELL, -HALF + (j + 0.5) * CELL);
const img = Buffer.alloc(N * (N * 3 + 1));
const banquise = W.BIOMES.find((b) => b.id === 'banquise').poly;
for (let j = 0; j < N; j++) {
  img[j * (N * 3 + 1)] = 0;
  for (let i = 0; i < N; i++) {
    const x = -HALF + (i + 0.5) * CELL, z = -HALF + (j + 0.5) * CELL;
    const h = H[j * N + i];
    const hl = H[j * N + Math.max(0, i - 1)], hr = H[j * N + Math.min(N - 1, i + 1)];
    const hu = H[Math.max(0, j - 1) * N + i], hd = H[Math.min(N - 1, j + 1) * N + i];
    const gx = (hr - hl) / (2 * CELL), gz = (hd - hu) / (2 * CELL);
    // lumière du nord-ouest
    const nx = -gx * 2.2, nz = -gz * 2.2, ny = 1, nl = Math.hypot(nx, ny, nz);
    const shade = clamp((nx * -0.6 + ny * 0.62 + nz * -0.5) / nl, 0, 1);
    let rgb;
    if (h < 0) {
      const t = smooth(0, 14, -h);
      rgb = [lerp(150, 70, t), lerp(200, 140, t), lerp(225, 195, t)];
      const sb = sdPoly(x, z, banquise);
      if (sb > -120) { const w = smooth(-120, 60, sb); rgb = rgb.map((v, k) => lerp(v, [236, 243, 250][k], w * (0.85 + 0.15 * fbm(x / 90, z / 90, 3)))); }
    } else {
      const { c, arctic } = biomeColor(x, z, true);
      // teinte d'altitude : pâlit et grisaille en montagne, neige au-dessus de la limite
      const alt = smooth(250, 900, h);
      rgb = c.map((v, k) => lerp(v, [176, 172, 166][k], alt * 0.7));
      let snowLine = W.TERRAIN_RULES.snow.base - W.TERRAIN_RULES.snow.drop * arctic;
      for (const p of W.WORLD_PEAKS) if (p.snow && Math.hypot(x - p.x, z - p.z) < p.base * 0.7) snowLine = Math.min(snowLine, p.snow);
      const snow = smooth(snowLine - 30, snowLine + 60, h + 20 * fbm(x / 120, z / 120, 2));
      rgb = rgb.map((v, k) => lerp(v, [246, 248, 252][k], snow));
      // plages
      const sc = sdPoly(x, z, W.COASTLINE);
      const beach = sc < 40 && h < 8 ? 0.6 * smooth(40, 5, sc) : 0;
      if (beach) rgb = rgb.map((v, k) => lerp(v, [214, 202, 166][k], beach));
      const k = 0.62 + (0.55 - 0.3 * beach) * shade;
      rgb = rgb.map((v) => v * k);
    }
    const o = j * (N * 3 + 1) + 1 + i * 3;
    img[o] = clamp(rgb[0], 0, 255); img[o + 1] = clamp(rgb[1], 0, 255); img[o + 2] = clamp(rgb[2], 0, 255);
  }
}
console.log(`relief et biomes : ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// PNG minimal
const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(img, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);

// ------------------------------------------------------------------------------------------------ SVG
const S = 0.2, M = 50, MAP = W.WORLD.size * S, TOP = 70, LEG = 470;
const WIDTH = M * 2 + MAP + LEG, HEIGHT = TOP + MAP + M + 10;
const X = (x) => +(M + (x + HALF) * S).toFixed(1), Y = (z) => +(TOP + (z + HALF) * S).toFixed(1);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function catmull(pts, closed = false) {
  const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${X(P[1][0])},${Y(P[1][1])}`;
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${X(c1[0])},${Y(c1[1])} ${X(c2[0])},${Y(c2[1])} ${X(p2[0])},${Y(p2[1])}`;
  }
  return d + (closed ? 'Z' : '');
}
const line = (pts) => 'M' + pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' L');
const out = [];
const add = (s) => out.push(s);
const text = (x, y, s, o = {}) => add(`<text x="${x}" y="${y}" font-size="${o.size || 11}" ${o.anchor ? `text-anchor="${o.anchor}"` : ''} fill="${o.fill || '#222'}" ${o.weight ? `font-weight="${o.weight}"` : ''} ${o.italic ? 'font-style="italic"' : ''} class="${o.halo === false ? '' : 'h'}">${esc(s)}</text>`);

add(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="Segoe UI, Helvetica, Arial, sans-serif">`);
add(`<style>.h{paint-order:stroke;stroke:#fbf8f0;stroke-width:3px;stroke-linejoin:round}</style>`);
add(`<defs><clipPath id="carte"><rect x="${M}" y="${TOP}" width="${MAP}" height="${MAP}"/></clipPath>
<pattern id="glace" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><rect width="6" height="6" fill="#e4f0fa"/><line x1="0" y1="0" x2="0" y2="6" stroke="#9cc0dc" stroke-width="1.2"/></pattern>
<pattern id="ville" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#e9dcd2" opacity="0.85"/><rect x="0.5" y="0.5" width="2.5" height="2.5" fill="#b49a8a"/></pattern></defs>`);
add(`<rect width="${WIDTH}" height="${HEIGHT}" fill="#fbf8f0"/>`);
text(M, 34, 'Capy World — plan du monde (8 × 8 km)', { size: 24, weight: 700, halo: false });
text(M, 56, 'Généré par tools/plan-monde.mjs depuis src/world/world-map.ts. Relief schématique (illustration, pas le terrain final). x vers l’est, z vers le sud, origine = place de Capyville.', { size: 12, fill: '#555', halo: false });
add(`<g clip-path="url(#carte)">`);
add(`<image x="${M}" y="${TOP}" width="${MAP}" height="${MAP}" href="data:image/png;base64,${png.toString('base64')}" image-rendering="optimizeQuality"/>`);
// quadrillage km
for (let k = -4; k <= 4; k++) {
  add(`<line x1="${X(k * 1000)}" y1="${TOP}" x2="${X(k * 1000)}" y2="${TOP + MAP}" stroke="#ffffff" stroke-opacity="0.28" stroke-width="${k === 0 ? 1.2 : 0.7}"/>`);
  add(`<line x1="${M}" y1="${Y(k * 1000)}" x2="${M + MAP}" y2="${Y(k * 1000)}" stroke="#ffffff" stroke-opacity="0.28" stroke-width="${k === 0 ? 1.2 : 0.7}"/>`);
}
// côte, falaises
add(`<path d="${catmull(W.COASTLINE, true)}" fill="none" stroke="#3d6f8f" stroke-width="1.4" stroke-opacity="0.8"/>`);
for (const c of W.COAST_SEGMENTS) {
  if (c.kind === 'falaise') add(`<path d="${line(c.pts)}" fill="none" stroke="#5a4a3a" stroke-width="3.2" stroke-dasharray="1.5 2" />`);
  if (c.kind === 'glace') add(`<path d="${line(c.pts)}" fill="none" stroke="#ffffff" stroke-width="3" stroke-opacity="0.9"/>`);
}
for (const c of W.CLIFF_ZONES) add(`<path d="${line(c.pts)}" fill="none" stroke="#6a3a28" stroke-width="2.6" stroke-dasharray="1.5 2"/>`);
// glaciers
for (const g of W.GLACIERS) add(`<path d="${catmull(g.poly, true)}" fill="url(#glace)" stroke="#7aa6c8" stroke-width="0.8"/>`);
// lacs
for (const l of W.LAKES) {
  const fill = l.dry ? '#f4f1ea' : l.frozen ? '#d8ecf8' : '#7cb8d8';
  add(`<ellipse cx="${X(l.x)}" cy="${Y(l.z)}" rx="${l.rx * S}" ry="${l.rz * S}" transform="rotate(${-l.rot} ${X(l.x)} ${Y(l.z)})" fill="${fill}" stroke="#3d6f8f" stroke-width="0.8" ${l.dry ? 'stroke-dasharray="3 2"' : ''}/>`);
}
// rivières
for (const r of W.RIVERS) {
  const wmax = Math.max(...r.w);
  const col = r.dry ? '#c8a878' : r.frozen ? '#b8d8ee' : '#3f86b8';
  add(`<path d="${catmull(r.pts)}" fill="none" stroke="${col}" stroke-width="${(0.9 + wmax * 0.035).toFixed(2)}" stroke-linecap="round" ${r.dry ? 'stroke-dasharray="4 3"' : ''}/>`);
}
// torrent de Capyville et étang (zones.ts)
add(`<path d="${catmull(Z.STREAM)}" fill="none" stroke="#3f86b8" stroke-width="1"/>`);
add(`<ellipse cx="${X(Z.POND.x)}" cy="${Y(Z.POND.z)}" rx="${Z.POND.rx * S}" ry="${Z.POND.rz * S}" fill="#7cb8d8"/>`);
// îles
for (const i of W.ISLANDS) add(`<circle cx="${X(i.x)}" cy="${Y(i.z)}" r="${Math.max(2, i.r * S)}" fill="${i.id === 'iceberg-arche' ? '#ffffff' : '#d8c890'}" stroke="#5a4a3a" stroke-width="0.6"/>`);
// voies
const wayStyle = {
  route: { asphalte: ['#fbf8f0', 5.2, '#3a3a3a', 3, ''] },
  chemin: { gravier: ['#fbf8f0', 3.6, '#8a6a42', 2.2, ''], terre: ['', 0, '#9a6a3a', 1.8, ''], pierre: ['', 0, '#7a6a5a', 1.6, ''] },
  piste: { gravier: ['#fbf8f0', 3.4, '#b08a52', 2, '6 3'], terre: ['#fbf8f0', 3.4, '#b05a3a', 2, '6 3'], sable: ['#fbf8f0', 3.4, '#c49a5a', 2, '6 3'] },
  sentier: { _: ['', 0, '#5a3a22', 1.2, '3 2.5'] },
  'sentier-betes': { _: ['', 0, '#5a3a22', 0.9, '1 2.5'] },
  raccourci: { _: ['', 0, '#b0306a', 1.2, '2 3'] },
};
// raccords des six axes de Capyville (portes → fin des couloirs de cols de valley.ts)
const starts = { paris: 'route-paris', newyork: 'route-ny', london: 'route-londres', japan: 'route-japon', pole: 'route-pole', desert: 'piste-desert' };
for (const g of Z.VILLAGE_GATES) {
  const way = W.WAYS.find((w) => w.id === starts[g.axis]);
  add(`<path d="M${X(g.asphaltFrom[0])},${Y(g.asphaltFrom[1])} L${X(way.pts[0][0])},${Y(way.pts[0][1])}" stroke="#3a3a3a" stroke-width="2.2" stroke-dasharray="2 2" fill="none"/>`);
}
const order = ['raccourci', 'sentier-betes', 'sentier', 'chemin', 'piste', 'route'];
for (const kind of order) for (const w of W.WAYS.filter((v) => v.kind === kind)) {
  const st = wayStyle[kind][w.surface] || wayStyle[kind]._ || wayStyle[kind][Object.keys(wayStyle[kind])[0]];
  const d = catmull(w.pts);
  if (st[1]) add(`<path d="${d}" fill="none" stroke="${st[0]}" stroke-width="${st[1]}" stroke-linecap="round" stroke-linejoin="round"/>`);
  add(`<path d="${d}" fill="none" stroke="${w.surface === 'neige' && kind !== 'route' ? '#5a7a9a' : st[2]}" stroke-width="${st[3]}" ${st[4] ? `stroke-dasharray="${st[4]}"` : ''} stroke-linecap="round" stroke-linejoin="round"/>`);
}
// ponts et gués
for (const c of W.CROSSINGS) {
  const isFord = c.kind === 'gue' || c.kind === 'radier';
  add(`<circle cx="${X(c.x)}" cy="${Y(c.z)}" r="2.2" fill="${isFord ? '#ffffff' : '#222'}" stroke="#222" stroke-width="0.8"/>`);
}
// vues composées (cônes de 60°)
for (const v of W.WORLD_VIEWPOINTS) {
  const L = 300, a1 = ((v.bearing - 28) * Math.PI) / 180, a2 = ((v.bearing + 28) * Math.PI) / 180;
  add(`<path d="M${X(v.x)},${Y(v.z)} L${X(v.x + Math.sin(a1) * L)},${Y(v.z - Math.cos(a1) * L)} L${X(v.x + Math.sin(a2) * L)},${Y(v.z - Math.cos(a2) * L)} Z" fill="#ff8a2a" fill-opacity="0.28" stroke="#d0601a" stroke-width="0.7"/>`);
}
// régions
for (const r of W.WORLD_REGIONS) {
  if (r.id === 'hub') continue;
  add(`<circle cx="${X(r.x)}" cy="${Y(r.z)}" r="${r.radius * S}" fill="none" stroke="#7a3a5a" stroke-width="0.8" stroke-dasharray="5 4" stroke-opacity="0.7"/>`);
  add(`<circle cx="${X(r.x)}" cy="${Y(r.z)}" r="${r.core * S}" fill="url(#ville)" stroke="#7a3a5a" stroke-width="1.4"/>`);
}
// Capyville
add(`<circle cx="${X(0)}" cy="${Y(0)}" r="${Z.VILLAGE_RADIUS * S}" fill="url(#ville)" stroke="#b8342a" stroke-width="1.6"/>`);
for (const p of Z.PEAKS) add(`<path d="M${X(p.x)},${Y(p.z) - 4} l3.5,6 l-7,0 Z" fill="#3a3a3a"/>`);
// cols
for (const c of [...W.WORLD_COLS, ...Z.COLS.map((c) => ({ x: Math.sin((c.bearing * Math.PI) / 180) * c.r, z: -Math.cos((c.bearing * Math.PI) / 180) * c.r, name: '', y: c.y }))]) {
  add(`<path d="M${X(c.x) - 4},${Y(c.z) - 3} q4,3 0,6 M${X(c.x) + 4},${Y(c.z) - 3} q-4,3 0,6" stroke="#222" stroke-width="1.2" fill="none"/>`);
  if (c.name) text(X(c.x) + 7, Y(c.z) + 4, `${c.name} ${c.y} m`, { size: 9.5, fill: '#333', italic: true });
}
// sommets
for (const p of W.WORLD_PEAKS) {
  add(`<path d="M${X(p.x)},${Y(p.z) - 6} l5,8.5 l-10,0 Z" fill="${p.snow ? '#ffffff' : '#6a4a32'}" stroke="#222" stroke-width="1"/>`);
  text(X(p.x) + 8, Y(p.z) + 2, `${p.name} ${p.y} m`, { size: 11, weight: 600, fill: '#2a2a2a' });
}
// points d'intérêt
const poiCol = { 'pierre-vapeur': '#18a0b8', belvedere: '#d0601a', ruine: '#7a5a3a', grotte: '#3a3a3a', sanctuaire: '#b8342a', 'source-chaude': '#e05a8a', arbre: '#2a7a3a', phare: '#d02020', curiosite: '#6a3ab8', moulin: '#8a6a2a', ferme: '#a07a3a', cabane: '#8a5a2a', refuge: '#8a5a2a', campement: '#c07a20', hameau: '#7a3a5a', port: '#2a5a8a', pont: '#222' };
const nearLabel = new Set(['pierre-vapeur']);
for (const p of W.POIS) {
  if (p.kind === 'pierre-vapeur') { add(`<path d="M${X(p.x)},${Y(p.z) - 4.5} l4.5,4.5 l-4.5,4.5 l-4.5,-4.5 Z" fill="${poiCol[p.kind]}" stroke="#fff" stroke-width="0.8"/>`); continue; }
  add(`<circle cx="${X(p.x)}" cy="${Y(p.z)}" r="3.2" fill="${poiCol[p.kind] || '#444'}" stroke="#fff" stroke-width="0.9"/>`);
  if (!nearLabel.has(p.kind) && !W.WORLD_PEAKS.some((k) => Math.hypot(k.x - p.x, k.z - p.z) < 30)) text(X(p.x) + 5, Y(p.z) - 4, p.name, { size: 8.5, fill: '#333' });
}
// villages et hameaux
for (const s of W.SETTLEMENTS) {
  const big = s.kind === 'village';
  add(`<rect x="${X(s.x) - (big ? 5 : 3.5)}" y="${Y(s.z) - (big ? 5 : 3.5)}" width="${big ? 10 : 7}" height="${big ? 10 : 7}" fill="#7a3a5a" stroke="#fff" stroke-width="1"/>`);
  text(X(s.x) + 8, Y(s.z) + 12, s.name, { size: big ? 13 : 9.5, weight: big ? 700 : 500, fill: '#5a2a44' });
}
// repères non déjà nommés
for (const l of W.WORLD_LANDMARKS) {
  const inCity = W.WORLD_REGIONS.some((r) => r.id !== 'hub' && Math.hypot(r.x - l.x, r.z - l.z) < r.core);
  if (inCity) { add(`<path d="M${X(l.x)},${Y(l.z) - 6} l1.8,4 4.2,0.4 -3.2,2.8 1,4.2 -3.8,-2.2 -3.8,2.2 1,-4.2 -3.2,-2.8 4.2,-0.4 Z" fill="#f0c020" stroke="#5a4a10" stroke-width="0.8"/>`); continue; }
  if (W.WORLD_PEAKS.some((p) => Math.hypot(p.x - l.x, p.z - l.z) < 60) || W.POIS.some((p) => Math.hypot(p.x - l.x, p.z - l.z) < 40) || W.SETTLEMENTS.some((p) => Math.hypot(p.x - l.x, p.z - l.z) < 40)) continue;
  add(`<path d="M${X(l.x)},${Y(l.z) - 6} l1.8,4 4.2,0.4 -3.2,2.8 1,4.2 -3.8,-2.2 -3.8,2.2 1,-4.2 -3.2,-2.8 4.2,-0.4 Z" fill="#f0c020" stroke="#5a4a10" stroke-width="0.8"/>`);
  text(X(l.x) + 7, Y(l.z) + 12, l.name, { size: 9, fill: '#5a4a10' });
}
// noms des régions
for (const r of W.WORLD_REGIONS) {
  if (r.id === 'hub') { text(X(0), Y(0) + 34, 'CAPYVILLE', { size: 15, weight: 800, anchor: 'middle', fill: '#8a1a1a' }); continue; }
  text(X(r.x), Y(r.z) + 5, r.name.toUpperCase(), { size: 17, weight: 800, anchor: 'middle', fill: '#4a1a34' });
  text(X(r.x), Y(r.z) + 21, `alt. ${r.ground} m — cap ${r.bearing}° — ${(r.distance / 1000).toFixed(1)} km`, { size: 9.5, anchor: 'middle', fill: '#4a1a34' });
}
// noms des biomes (au barycentre)
const biomeLabel = { 'bocage-seine': [-650, -1900], 'bocage-albion': [-2700, -1900], lande: [-2200, -3100], 'erables-lacs': [1500, -2950], 'prairies-ranch': [2900, -500], garrigue: [900, 900], savane: [2350, 2050], dunes: [3000, 850], rizieres: [-450, 900], 'foret-asiatique': [-1300, 3200], volcan: [305, 3350], jungle: [2300, 2900], piemont: [-1000, -150], 'cote-ouest': [-3300, -200], alpages: [-1200, 1250], 'haute-montagne': [-2650, 200], 'pinede-neige': [-3000, 1550], toundra: [-3200, 1980], banquise: [-3300, 2950] };
for (const b of W.BIOMES) { const p = biomeLabel[b.id]; if (p) text(X(p[0]), Y(p[1]), b.name, { size: 12, italic: true, anchor: 'middle', fill: '#24402a' }); }
text(X(-3500), Y(-3850), 'MER DU NORD', { size: 12, italic: true, fill: '#1e4e6e' });
text(X(3700), Y(-500), 'MER DU LEVANT', { size: 12, italic: true, fill: '#1e4e6e', anchor: 'end' });
text(X(1500), Y(3900), 'MER DE JADE', { size: 12, italic: true, fill: '#1e4e6e' });
text(X(-3900), Y(3600), 'MER DES GLACES', { size: 12, italic: true, fill: '#1e4e6e' });
add(`</g>`);
add(`<rect x="${M}" y="${TOP}" width="${MAP}" height="${MAP}" fill="none" stroke="#333" stroke-width="1.2"/>`);
for (let k = -4; k <= 4; k++) {
  text(X(k * 1000), TOP + MAP + 16, `${k} km`, { size: 10, anchor: 'middle', fill: '#555', halo: false });
  text(M - 6, Y(k * 1000) + 4, `${k}`, { size: 10, anchor: 'end', fill: '#555', halo: false });
}
// légende
let ly = TOP + 10;
const LX = M + MAP + 30;
const head = (s) => { text(LX, ly + 14, s, { size: 14, weight: 700, halo: false }); ly += 24; };
add(`<path d="M${LX + 380},${ly + 40} l12,30 l-12,-8 l-12,8 Z" fill="#333"/>`); text(LX + 380, ly + 30, 'N', { size: 14, weight: 700, anchor: 'middle', halo: false });
head('Biomes (fondus sur leur largeur de transition)');
for (const b of W.BIOMES) {
  const col = ly; add(`<rect x="${LX}" y="${col}" width="16" height="11" fill="${b.color}" stroke="#666" stroke-width="0.5"/>`);
  text(LX + 22, col + 10, `${b.name} (${b.transition} m)`, { size: 10.5, halo: false }); ly += 15;
}
ly += 8; head('Voies');
const legWay = [['route', 'asphalte', 'Route asphaltée (grandes villes)'], ['chemin', 'gravier', 'Route de gravier / montagne'], ['piste', 'sable', 'Piste (sable, terre rouge)'], ['chemin', 'terre', 'Chemin de terre'], ['sentier', '_', 'Sentier'], ['sentier-betes', '_', 'Sentier de bêtes'], ['raccourci', '_', 'Raccourci de promenade']];
for (const [k, s, label] of legWay) {
  const st = wayStyle[k][s];
  if (st[1]) add(`<line x1="${LX}" y1="${ly + 6}" x2="${LX + 40}" y2="${ly + 6}" stroke="${st[0]}" stroke-width="${st[1]}"/>`);
  add(`<line x1="${LX}" y1="${ly + 6}" x2="${LX + 40}" y2="${ly + 6}" stroke="${st[2]}" stroke-width="${st[3]}" ${st[4] ? `stroke-dasharray="${st[4]}"` : ''}/>`);
  text(LX + 48, ly + 10, label, { size: 10.5, halo: false }); ly += 16;
}
ly += 8; head('Eau et relief');
const legLines = [
  [`<line x1="${LX}" y1="${ly + 6}" x2="${LX + 40}" y2="${ly + 6}" stroke="#3f86b8" stroke-width="2.4"/>`, 'Rivière (épaisseur ∝ largeur)'],
  [`<line x1="${LX}" y1="${ly + 22}" x2="${LX + 40}" y2="${ly + 22}" stroke="#c8a878" stroke-width="2" stroke-dasharray="4 3"/>`, 'Oued (lit à sec)'],
  [`<line x1="${LX}" y1="${ly + 38}" x2="${LX + 40}" y2="${ly + 38}" stroke="#5a4a3a" stroke-width="3.2" stroke-dasharray="1.5 2"/>`, 'Falaise lisible (seule zone non praticable)'],
  [`<rect x="${LX}" y="${ly + 48}" width="40" height="11" fill="url(#glace)" stroke="#7aa6c8"/>`, 'Glacier, banquise'],
  [`<path d="M${LX + 20},${ly + 64} l5,8.5 l-10,0 Z" fill="#fff" stroke="#222"/>`, 'Sommet (blanc = enneigé)'],
  [`<path d="M${LX + 16},${ly + 79} q4,3 0,6 M${LX + 24},${ly + 79} q-4,3 0,6" stroke="#222" stroke-width="1.2" fill="none"/>`, 'Col'],
  [`<circle cx="${LX + 14}" cy="${ly + 98}" r="2.2" fill="#222"/><circle cx="${LX + 26}" cy="${ly + 98}" r="2.2" fill="#fff" stroke="#222"/>`, 'Pont / gué'],
];
legLines.forEach(([svg, label], k) => { add(svg); text(LX + 48, ly + 10 + k * 16, label, { size: 10.5, halo: false }); });
ly += legLines.length * 16 + 10; head('Lieux');
const legPoi = [['#7a3a5a', 'Ville (cœur bâti) et rayon d’influence', 'ville'], ['#7a3a5a', 'Village, hameau, ferme', 'rect'], ['#18a0b8', 'Pierre-Vapeur (borne des Voyageurs)', 'pv'], ['#d0601a', 'Belvédère', 'c'], ['#b8342a', 'Sanctuaire, chapelle', 'c'], ['#7a5a3a', 'Ruine', 'c'], ['#3a3a3a', 'Grotte', 'c'], ['#6a3ab8', 'Curiosité naturelle', 'c'], ['#e05a8a', 'Source chaude', 'c'], ['#2a7a3a', 'Arbre remarquable', 'c'], ['#8a5a2a', 'Cabane, refuge, moulin, campement', 'c'], ['#f0c020', 'Grand repère visible de loin', 'star'], ['#ff8a2a', 'Vue composée (capture de revue)', 'cone']];
for (const [col, label, sh] of legPoi) {
  if (sh === 'c') add(`<circle cx="${LX + 20}" cy="${ly + 6}" r="3.6" fill="${col}" stroke="#fff"/>`);
  if (sh === 'rect') add(`<rect x="${LX + 16}" y="${ly + 2}" width="8" height="8" fill="${col}"/>`);
  if (sh === 'pv') add(`<path d="M${LX + 20},${ly + 1} l5,5 l-5,5 l-5,-5 Z" fill="${col}"/>`);
  if (sh === 'ville') add(`<circle cx="${LX + 20}" cy="${ly + 6}" r="6" fill="url(#ville)" stroke="${col}"/>`);
  if (sh === 'star') add(`<path d="M${LX + 20},${ly} l1.8,4 4.2,0.4 -3.2,2.8 1,4.2 -3.8,-2.2 -3.8,2.2 1,-4.2 -3.2,-2.8 4.2,-0.4 Z" fill="${col}" stroke="#5a4a10" stroke-width="0.8"/>`);
  if (sh === 'cone') add(`<path d="M${LX + 10},${ly + 10} l26,-8 l0,12 Z" fill="${col}" fill-opacity="0.35" stroke="#d0601a"/>`);
  text(LX + 48, ly + 10, label, { size: 10.5, halo: false }); ly += 16;
}
ly += 12;
add(`<line x1="${LX}" y1="${ly}" x2="${LX + 1000 * S}" y2="${ly}" stroke="#222" stroke-width="3"/><line x1="${LX}" y1="${ly - 5}" x2="${LX}" y2="${ly + 5}" stroke="#222"/><line x1="${LX + 1000 * S}" y1="${ly - 5}" x2="${LX + 1000 * S}" y2="${ly + 5}" stroke="#222"/>`);
text(LX + 1000 * S + 10, ly + 4, '1 km (≈ 4 min de marche, 2 min à quatre pattes)', { size: 10.5, halo: false });
add(`</svg>`);
const svgPath = path.join(root, 'docs/plan-monde.svg');
fs.writeFileSync(svgPath, out.join('\n'));
console.log(`écrit ${path.relative(root, svgPath)} (${(fs.statSync(svgPath).size / 1024).toFixed(0)} Ko)`);

// ------------------------------------------------------------------------------------------------ contrôles
const sp = W.SPEEDS;
const fmt = (s) => `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')}`;
console.log('\nVoies : longueur, à pied, à quatre pattes, en voiture');
for (const w of W.WAYS.filter((w) => ['route', 'chemin', 'piste'].includes(w.kind))) {
  const L = polyLen(w.pts) * 1.06; // courbes et relief
  const car = w.vehicles ? L / (w.surface === 'asphalte' ? sp.voiture.asphalte : w.surface === 'gravier' ? sp.voiture.gravier : sp.voiture.piste) : NaN;
  console.log(`  ${w.id.padEnd(22)} ${(L / 1000).toFixed(2)} km  ${fmt(L / sp.marche)}  ${fmt(L / sp.sprint)}  ${isNaN(car) ? '—' : fmt(car)}`);
}
// croisements voie × rivière sans pont ni gué déclaré à moins de 60 m
const segX = (a, b, c, d) => {
  const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
  const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] : null;
};
const missing = [];
for (const w of W.WAYS) for (const r of W.RIVERS) for (let i = 0; i < w.pts.length - 1; i++) for (let k = 0; k < r.pts.length - 1; k++) {
  const p = segX(w.pts[i], w.pts[i + 1], r.pts[k], r.pts[k + 1]);
  if (p && !W.CROSSINGS.some((c) => Math.hypot(c.x - p[0], c.z - p[1]) < 90) && !W.SETTLEMENTS.some((s) => Math.hypot(s.x - p[0], s.z - p[1]) < s.r) && !W.WORLD_REGIONS.some((g) => Math.hypot(g.x - p[0], g.z - p[1]) < g.core))
    missing.push(`${w.id} × ${r.id} vers (${Math.round(p[0])}, ${Math.round(p[1])})`);
}
console.log(`\nCroisements sans pont ni gué déclaré : ${missing.length ? '\n  ' + missing.join('\n  ') : 'aucun'}`);
// densité des lieux nommés
const named = [...W.POIS, ...W.SETTLEMENTS, ...W.WORLD_REGIONS.map((r) => ({ ...r, r: r.core }))];
let worst = 0, worstAt = null, sum = 0, n = 0; const gaps = [];
for (let z = -3800; z <= 3800; z += 100) for (let x = -3800; x <= 3800; x += 100) {
  if (sdPoly(x, z, W.COASTLINE) < 0) continue;
  const d = Math.min(...named.map((p) => Math.max(0, Math.hypot(p.x - x, p.z - z) - (p.r || 0))));
  sum += d; n++;
  if (d > worst) { worst = d; worstAt = [x, z]; }
  if (d > 600) gaps.push([d, x, z]);
}
gaps.sort((a, b) => b[0] - a[0]);
const spread = []; for (const g of gaps) if (spread.every((o) => Math.hypot(o[1] - g[1], o[2] - g[2]) > 700)) spread.push(g);
console.log('Trous de plus de 600 m :', spread.slice(0, 14).map((g) => `(${g[1]}, ${g[2]}) ${Math.round(g[0])} m`).join(' ; '));
console.log(`\nLieux nommés : ${W.POIS.length} points d'intérêt, ${W.SETTLEMENTS.length} villages et hameaux ; distance moyenne au plus proche ${Math.round(sum / n)} m, pire ${Math.round(worst)} m en (${worstAt})`);
// relief : altitudes aux régions
console.log('\nAltitudes schématiques :', [...W.WORLD_REGIONS, ...W.WORLD_PEAKS, ...W.SETTLEMENTS].map((r) => `${r.id} ${height(r.x, r.z).toFixed(0)} m`).join(', '));

const pngArg = process.argv.indexOf('--png');
if (pngArg > 0) {
  const target = path.resolve(process.argv[pngArg + 1]);
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { launch } = require('./browser.cjs');
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.goto('file:///' + svgPath.replace(/\\/g, '/'));
  await page.screenshot({ path: target });
  await browser.close();
  console.log(`PNG : ${target}`);
}
