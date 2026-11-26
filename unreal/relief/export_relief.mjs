// Alpha U1 : export du relief cuit du jeu Three.js vers Unreal (poste unreal-monde).
// Source unique : le vrai code du jeu (src/world/heightmap.ts, loadTerrainData + bakeWorld), chargé sans modification.
// Sorties (dossier donné, par défaut CapyWorld-UE\Sources\relief) :
//   hauteur.r16          carte de hauteur 16 bits du Landscape (4065 × 4065 sommets, pas de 2 m, de -4064 à +4064 m)
//   masques_a.png        4096² RGBA au pas de 2 m (grille cuite, de -4096 m) : R roche, G sable, B neige, A route revêtue
//   masques_b.png        4096² RGBA : R sol sec, G mousse et sous-bois, B humidité, A chemin de terre
//   eau.glb              maillages d'eau (lacs, rivières, glace) dans le repère Three.js (mètres, y en haut)
//   points_controle.json 20 points de contrôle (villes, cols, sommets, rives) avec heightAt du jeu
//   regions.json         8 destinations du menu « Aller à »
//   relief_info.json     réglages du Landscape (échelle, position, codage)
// Repère : Unreal (X, Y, Z) en cm = Three.js (x, z, y) en m × 100.
// Codage : valeur stockée v = round((h + 60) / 0,016), le codage même des tuiles du jeu ; Landscape à Scale.Z = 204,8
// (pas de 1,6 cm) et Location.Z = 46 428,8 cm, si bien que la hauteur Unreal vaut exactement v × 0,016 − 60 m.
// Usage : node unreal/relief/export_relief.mjs [dossier_sortie]
import { chargerRelief } from './charger_jeu.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import path from 'node:path';

const OUT = process.argv[2] || 'C:/Users/greg7/Documents/CLAUDE/CapyWorld-UE/Sources/relief';
mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const lap = (m) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s : ${m}`);
const { td, hm, wm, valley } = await chargerRelief();
lap('relief du jeu chargé (loadTerrainData + bakeWorld)');

// ------------------------------------------------------------------ Landscape
const H = td.meta.height; // grille cuite : n = 4096, x0 = -4096, pas 2 m
const SCALE = H.scale, OFFSET = H.offset; // 0,016 et -60
const NV = 4065; // 16 composants × 2 sections × 127 quads + 1 (limite de create_landscape en World Partition : 16 composants par axe)
const X0 = -((NV - 1) / 2) * H.cell; // -4064 m
const r16 = new Uint16Array(NV * NV);
let hmin = Infinity, hmax = -Infinity, ecr = 0;
for (let j = 0; j < NV; j++) {
  const z = X0 + j * H.cell;
  for (let i = 0; i < NV; i++) {
    const x = X0 + i * H.cell;
    const h = hm.heightBaseAt(x, z); // grille de 2 m, et grille fine de 0,5 m dans Capyville (même fonction que le jeu)
    let v = Math.round((h - OFFSET) / SCALE);
    if (v < 0 || v > 65535) { ecr++; v = Math.min(65535, Math.max(0, v)); }
    r16[j * NV + i] = v;
    if (h < hmin) hmin = h;
    if (h > hmax) hmax = h;
  }
}
writeFileSync(path.join(OUT, 'hauteur.r16'), Buffer.from(r16.buffer));
// relief hors de l'emprise du Landscape (bande de 32 m au bord de la grille cuite) : doit être sous la mer
let horsMax = -Infinity;
for (let j = 0; j < H.n; j++)
  for (let i = 0; i < H.n; i++) {
    const x = H.x0 + i * H.cell, z = H.z0 + j * H.cell;
    if (Math.abs(x) <= -X0 && Math.abs(z) <= -X0) continue;
    horsMax = Math.max(horsMax, td.height[j * H.n + i]);
  }
lap(`hauteur.r16 : ${NV}², ${hmin.toFixed(2)} à ${hmax.toFixed(2)} m, ${ecr} valeurs écrêtées, relief hors emprise ≤ ${horsMax.toFixed(2)} m`);

// ------------------------------------------------------------------ masques des surfaces (4096², pas de 2 m)
const N = H.n;
const A = new Uint8Array(N * N * 4), B = new Uint8Array(N * N * 4);
const { DETAIL } = valley;
const ds = hm.detailSplat;
const c8 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
for (let j = 0; j < N; j++) {
  const z = H.z0 + j * H.cell;
  for (let i = 0; i < N; i++) {
    const x = H.x0 + i * H.cell, o = (j * N + i) * 4;
    const [sable, neige, sec, mousse] = hm.biomeAt(x, z);
    const [, humid, , roche] = hm.surfaceAt(x, z);
    const h = td.height[j * N + i];
    if (x > DETAIL.x0 + 1 && x < DETAIL.x1 - 1 && z > DETAIL.z0 + 1 && z < DETAIL.z1 - 1) {
      // vallée de Capyville : couches fines (1 m) R roche, G galets, B terre, A sous-bois
      const di = Math.round((x - DETAIL.x0) / ds.cell), dj = Math.round((z - DETAIL.z0) / ds.cell), q = (dj * ds.nx + di) * 4;
      A[o] = ds.data[q]; A[o + 1] = 0; A[o + 2] = 0;
      B[o] = 0; B[o + 1] = ds.data[q + 3]; B[o + 2] = ds.wet[dj * ds.nx + di]; B[o + 3] = Math.max(ds.data[q + 1], ds.data[q + 2]);
      continue;
    }
    // même règle que bakeSplat (heightmap.ts) : plage sous 1,5 m, la neige recouvre le reste
    const sa = Math.max(sable, h < 1.5 ? 1 : 0) * (1 - neige);
    A[o] = c8(roche * (1 - neige * 0.5)); A[o + 1] = c8(sa); A[o + 2] = c8(neige);
    B[o] = c8(sec); B[o + 1] = c8(mousse); B[o + 2] = c8(humid);
  }
}
// voies : rubans posés sur la grille (largeur du jeu, bord adouci sur 1,5 m)
function tracer(dst, canal, voie, largeur) {
  const p = voie.pts, demi = largeur / 2;
  for (let k = 0; k < p.length - 1; k++) {
    const [ax, az] = p[k], [bx, bz] = p[k + 1];
    const i0 = Math.floor((Math.min(ax, bx) - demi - 2 - H.x0) / H.cell), i1 = Math.ceil((Math.max(ax, bx) + demi + 2 - H.x0) / H.cell);
    const j0 = Math.floor((Math.min(az, bz) - demi - 2 - H.z0) / H.cell), j1 = Math.ceil((Math.max(az, bz) + demi + 2 - H.z0) / H.cell);
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    for (let j = Math.max(0, j0); j <= Math.min(N - 1, j1); j++)
      for (let i = Math.max(0, i0); i <= Math.min(N - 1, i1); i++) {
        const x = H.x0 + i * H.cell, z = H.z0 + j * H.cell;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        const d = Math.hypot(x - ax - t * dx, z - az - t * dz);
        const w = c8(Math.max(0, Math.min(1, (demi + 0.75 - d) / 1.5)));
        const o = (j * N + i) * 4 + canal;
        if (w > dst[o]) dst[o] = w;
      }
  }
}
let nRoutes = 0, nChemins = 0;
for (const r of hm.roadSamples) {
  if (!r.surface || /asphalte|pav/.test(r.surface)) { tracer(A, 3, r, r.width); nRoutes++; } else { tracer(B, 3, r, r.width); nChemins++; }
}
for (const r of hm.pathSamples) { tracer(B, 3, r, Math.max(1.6, r.width)); nChemins++; }
// PNG RGBA 8 bits (lignes = z croissant = Y Unreal croissant)
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function png(file, w, h, data) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(data.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]));
}
png(path.join(OUT, 'masques_a.png'), N, N, A);
png(path.join(OUT, 'masques_b.png'), N, N, B);
// aperçu 512² pour contrôle visuel : rouge roche, jaune sable, blanc neige, noir route, brun chemin, vert herbe
{ const M = 512, k = N / M, P = new Uint8Array(M * M * 4);
  for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
    const o = ((y * k) * N + x * k) * 4, q = (y * M + x) * 4, h = td.height[(y * k) * N + x * k];
    let c = h < 0 ? [40, 70, 120] : [90, 140, 60];
    const mix = (col, w) => { c = c.map((v, i) => v + (col[i] - v) * w / 255); };
    mix([150, 70, 60], A[o]); mix([220, 200, 120], A[o + 1]); mix([250, 250, 250], A[o + 2]); mix([160, 120, 70], B[o + 3]); mix([20, 20, 20], A[o + 3]);
    P.set([...c.map(Math.round), 255], q);
  }
  png(path.join(OUT, 'apercu_surfaces.png'), M, M, P); }
lap(`masques 4096² : ${nRoutes} routes revêtues, ${nChemins} chemins`);

// ------------------------------------------------------------------ eau (repère Three.js, mètres)
const prims = [];
function grilleEau(cx, cz, rx, rz, niveau, mat, pas = 4) {
  // grille sur l'emprise du plan d'eau ; on garde les cases où le sol passe sous le niveau (rive exacte, + 1 case de marge)
  const R = Math.max(rx, rz) * 1.45, nx = Math.ceil((2 * R) / pas);
  const sous = (x, z) => hm.heightAt(x, z) < niveau + 0.05;
  const pos = [], idx = [], uv = [], map = new Map();
  const vtx = (i, j) => { const k = i * 100000 + j; if (map.has(k)) return map.get(k); const x = cx - R + i * pas, z = cz - R + j * pas; map.set(k, pos.length / 3); pos.push(x, niveau, z); uv.push(x / 20, z / 20); return map.get(k); };
  for (let j = 0; j < nx; j++)
    for (let i = 0; i < nx; i++) {
      const x = cx - R + (i + 0.5) * pas, z = cz - R + (j + 0.5) * pas;
      let ok = false;
      for (const [ox, oz] of [[0, 0], [-pas, 0], [pas, 0], [0, -pas], [0, pas]]) if (sous(x + ox, z + oz)) { ok = true; break; }
      if (!ok) continue;
      const a = vtx(i, j), b = vtx(i + 1, j), c = vtx(i + 1, j + 1), d = vtx(i, j + 1);
      idx.push(a, c, b, a, d, c); // face vers +y
    }
  if (idx.length) prims.push({ pos: new Float32Array(pos), nor: new Float32Array(pos.length).map((_, k) => (k % 3 === 1 ? 1 : 0)), uv0: new Float32Array(uv), idx: new Uint32Array(idx), mat });
  return idx.length / 6;
}
const lacs = [];
for (const l of wm.LAKES) {
  if (l.dry) continue;
  const n = grilleEau(l.x, l.z, l.rx, l.rz, l.y, l.frozen ? 'M_Glace' : 'M_Eau_Lac');
  lacs.push(`${l.id} ${n}`);
}
// rivières : ruban au niveau d'eau du jeu (y et w à chaque point du tracé dense), élargi de 20 % pour mordre les rives
let nRiv = 0;
for (const r of td.meta.rivers) {
  const pos = [], idx = [], uv = [];
  let s = 0;
  for (let k = 0; k < r.pts.length; k++) {
    const [x, z] = r.pts[k], a = r.pts[Math.max(0, k - 1)], b = r.pts[Math.min(r.pts.length - 1, k + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    if (k) s += Math.hypot(x - r.pts[k - 1][0], z - r.pts[k - 1][1]);
    const w = (r.w[k] * 1.2) / 2 + 1, y = r.y[k];
    pos.push(x - tz * w, y, z + tx * w, x + tz * w, y, z - tx * w);
    uv.push(0, s / 10, (2 * w) / 10, s / 10);
    if (k) { const o = (k - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
  // orientation : on force la face vers +y
  for (let q = 0; q < idx.length; q += 3) {
    const [a, b, c] = [idx[q], idx[q + 1], idx[q + 2]];
    const ux = pos[b * 3] - pos[a * 3], uz = pos[b * 3 + 2] - pos[a * 3 + 2], vx = pos[c * 3] - pos[a * 3], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    if (uz * vx - ux * vz < 0) { idx[q + 1] = c; idx[q + 2] = b; }
  }
  prims.push({ pos: new Float32Array(pos), nor: new Float32Array(pos.length).map((_, k) => (k % 3 === 1 ? 1 : 0)), uv0: new Float32Array(uv), idx: new Uint32Array(idx), mat: 'M_Eau_Riviere' });
  nRiv++;
}
const req = createRequire(import.meta.url);
req('../outils/glbecrire.cjs').writeGlb(path.join(OUT, 'eau.glb'), 'Eau', prims);
lap(`eau.glb : lacs [${lacs.join(', ')}], ${nRiv} rivières`);

// ------------------------------------------------------------------ points de contrôle (20)
const pts = [];
const reg = (id) => wm.WORLD_REGIONS.find((r) => r.id === id);
for (const id of ['hub', 'paris', 'newyork', 'london', 'desert', 'japan', 'pole']) { const r = reg(id); pts.push({ type: 'ville', id, nom: r.name, x: r.x + 3.3, z: r.z + 1.7 }); }
for (const id of ['col-aurores', 'breche-loup', 'col-de-jade', 'col-fauves']) { const c = wm.WORLD_COLS.find((k) => k.id === id); pts.push({ type: 'col', id, nom: c.name, x: c.x + 0.9, z: c.z + 1.3 }); }
for (const id of ['aurore', 'neiges', 'dent-du-loup', 'fuji', 'pic-de-jade']) {
  const p = wm.WORLD_PEAKS.find((k) => k.id === id);
  let best = { h: -Infinity };
  for (let dz = -60; dz <= 60; dz += 2) for (let dx = -60; dx <= 60; dx += 2) { const h = hm.heightBaseAt(p.x + dx, p.z + dz); if (h > best.h) best = { h, x: p.x + dx, z: p.z + dz }; }
  pts.push({ type: 'sommet', id, nom: p.name, x: best.x, z: best.z });
}
for (const id of ['grand-lac', 'lac-torii', 'lac-cristal']) {
  const l = wm.LAKES.find((k) => k.id === id);
  // rive la plus proche du centre sur 16 directions (le déversoir est exclu d'office : on n'y trouve pas de rive)
  let best = null;
  for (let a = 0; a < 16; a++) {
    const ux = Math.cos((a * Math.PI) / 8), uz = Math.sin((a * Math.PI) / 8);
    let d = 0; while (hm.heightAt(l.x + d * ux, l.z + d * uz) < l.y + 0.3 && d < 800) d += 0.25;
    if (d < 800 && (!best || d < best.d)) best = { d, x: l.x + d * ux, z: l.z + d * uz };
  }
  pts.push({ type: 'rive', id, nom: 'Rive du ' + l.name, x: best.x, z: best.z });
}
{ // rive de la mer : plage de la Seine, depuis le large vers la terre
  let z = -3900; while (hm.heightAt(-700, z) < 0.3 && z < -3000) z += 0.25;
  pts.push({ type: 'rive', id: 'mer', nom: 'Plage de la Seine (mer)', x: -700.4, z });
}
for (const p of pts) { p.h_jeu = +hm.heightAt(p.x, p.z).toFixed(3); p.h_base = +hm.heightBaseAt(p.x, p.z).toFixed(3); }
writeFileSync(path.join(OUT, 'points_controle.json'), JSON.stringify(pts, null, 1));
lap(`points de contrôle : ${pts.length}`);

// ------------------------------------------------------------------ destinations du menu « Aller à » (8 régions)
const dest = ['hub', 'paris', 'newyork', 'london', 'desert', 'japan', 'pole'].map((id) => { const r = reg(id); return { id, nom: r.name, x: r.x, z: r.z }; });
const au = pts.find((p) => p.id === 'col-aurores'); // Pic de l'Aurore : on arrive au col, au pied du sommet (le sommet n'est pas praticable)
dest.push({ id: 'aurore', nom: 'Pic de l’Aurore (col des Aurores)', x: au.x, z: au.z });
for (const d of dest) {
  // point d'arrivée : le plus proche du centre qui soit hors de l'eau et peu pentu
  let best = null;
  for (let r = 0; r <= 120 && !best; r += 4)
    for (let a = 0; a < 360; a += 15) {
      const x = d.x + r * Math.cos((a * Math.PI) / 180), z = d.z + r * Math.sin((a * Math.PI) / 180), h = hm.heightAt(x, z);
      const pente = Math.hypot(hm.heightAt(x + 2, z) - hm.heightAt(x - 2, z), hm.heightAt(x, z + 2) - hm.heightAt(x, z - 2)) / 4;
      const eau = wm.LAKES.some((l) => !l.dry && Math.hypot((x - l.x) / l.rx, (z - l.z) / l.rz) < 1.1 && h < l.y + 0.5)
        || td.meta.rivers.some((rv) => rv.pts.some((q, k) => Math.hypot(x - q[0], z - q[1]) < rv.w[k] * 0.6 + 12));
      if (h > 0.8 && pente < 0.35 && !eau) { best = { x, z, h }; break; }
    }
  Object.assign(d, best ?? { h: hm.heightAt(d.x, d.z) });
  d.ue = [Math.round(d.x * 100), Math.round(d.z * 100), Math.round(d.h * 100 + 60)];
}
writeFileSync(path.join(OUT, 'regions.json'), JSON.stringify(dest, null, 1));

const info = {
  sommets: NV, pas_m: H.cell, x0_m: X0, composants: 16, sections: 2, quads_par_section: 127, grille_wp: 2,
  echelle_cm: [H.cell * 100, H.cell * 100, (SCALE * 100 * 128)], centre_cm: [0, 0, (OFFSET + 32768 * SCALE) * 100],
  codage: 'h_m = v * 0.016 - 60', hmin, hmax, masques: { n: N, x0_m: H.x0, pas_m: H.cell },
  source: 'public/assets/terrain (gen_terrain.py), lu par src/world/heightmap.ts heightBaseAt', duree_s: (Date.now() - t0) / 1000,
};
writeFileSync(path.join(OUT, 'relief_info.json'), JSON.stringify(info, null, 1));
lap('terminé');
