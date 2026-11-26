// Analyse d'un profil CSV d'Unreal (CsvProfile) : FPS moyen, temps d'image p50/p95/p99, part GPU, nombre d'images.
// node analyse_csv.cjs <profil.csv> [secondes_a_ignorer_au_debut]
const fs = require('fs');
const txt = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('['));
const head = txt[0].split(',');
const rows = txt.slice(1).map((l) => l.split(',')).filter((r) => r.length >= head.length - 5 && !isNaN(parseFloat(r[head.indexOf('FrameTime')])));
const col = (n) => { const i = head.indexOf(n); return i < 0 ? null : rows.map((r) => parseFloat(r[i])); };
const ft = col('FrameTime');
const gpu = col('GPU/Total') || col('GPUTime') || col('RHI/GPUFrameTime');
const gt = col('GameThreadTime'), rt = col('RenderThreadTime');
const ign = parseFloat(process.argv[3] || '0');
let t = 0, start = 0;
for (let i = 0; i < ft.length; i++) { t += ft[i] / 1000; if (t >= ign) { start = i; break; } }
const sl = (a) => (a ? a.slice(start).filter((x) => !isNaN(x)) : null);
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const F = sl(ft), G = sl(gpu), GT = sl(gt), RT = sl(rt);
const res = {
  images: F.length, duree_s: +(F.reduce((s, x) => s + x, 0) / 1000).toFixed(1),
  fps_moyen: +(1000 * F.length / F.reduce((s, x) => s + x, 0)).toFixed(1),
  temps_image_moyen_ms: +mean(F).toFixed(2), p50_ms: +pct(F, 0.5).toFixed(2), p95_ms: +pct(F, 0.95).toFixed(2), p99_ms: +pct(F, 0.99).toFixed(2),
  fps_p95: +(1000 / pct(F, 0.95)).toFixed(1),
  gpu_moyen_ms: G ? +mean(G).toFixed(2) : null, gpu_p95_ms: G ? +pct(G, 0.95).toFixed(2) : null,
  thread_jeu_moyen_ms: GT ? +mean(GT).toFixed(2) : null, thread_rendu_moyen_ms: RT ? +mean(RT).toFixed(2) : null,
  images_plus_de_50ms: F.filter((x) => x > 50).length,
};
console.log(JSON.stringify(res));
if (process.argv.includes('--colonnes')) console.log(head.filter((h) => /GPU|Memory|Frame|Thread|Texture|Nanite/i.test(h)).join(' | '));
