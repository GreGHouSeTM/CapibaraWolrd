// Contrôle de l'export AVANT import : relit hauteur.r16 et compare, aux 20 points de contrôle, la hauteur interpolée
// (triangles comme le Landscape d'Unreal) à heightAt du jeu Three.js. Écrit points_controle_export.json.
// Usage : node unreal/relief/verifier_export.mjs [dossier]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const D = process.argv[2] || 'C:/Users/greg7/Documents/CLAUDE/CapyWorld-UE/Sources/relief';
const info = JSON.parse(readFileSync(path.join(D, 'relief_info.json'), 'utf8'));
const b = readFileSync(path.join(D, 'hauteur.r16'));
const v = new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2);
const N = info.sommets, X0 = info.x0_m, C = info.pas_m;
const h = (i, j) => v[j * N + i] * 0.016 - 60;
// Landscape : chaque quad est coupé en deux triangles par la diagonale (0,0)-(1,1)
function hTri(x, z) {
  const fx = (x - X0) / C, fz = (z - X0) / C, i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
  const a = h(i, j), bb = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
  return tx >= tz ? a + (bb - a) * tx + (d - bb) * tz : a + (d - c) * tx + (c - a) * tz;
}
const pts = JSON.parse(readFileSync(path.join(D, 'points_controle.json'), 'utf8'));
let max = 0;
for (const p of pts) { p.h_export = +hTri(p.x, p.z).toFixed(3); p.ecart_export = +(p.h_export - p.h_jeu).toFixed(3); max = Math.max(max, Math.abs(p.ecart_export)); }
writeFileSync(path.join(D, 'points_controle_export.json'), JSON.stringify(pts, null, 1));
for (const p of pts) console.log(`${p.type.padEnd(6)} ${p.nom.padEnd(36)} x ${p.x.toFixed(1).padStart(8)} z ${p.z.toFixed(1).padStart(8)}  jeu ${p.h_jeu.toFixed(2).padStart(7)}  export ${p.h_export.toFixed(2).padStart(7)}  écart ${p.ecart_export.toFixed(3)}`);
console.log(`écart maximal : ${max.toFixed(3)} m (critère ≤ 0,5 m) → ${max <= 0.5 ? 'OK' : 'ÉCHEC'}`);
