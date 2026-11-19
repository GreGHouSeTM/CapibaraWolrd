// Mesure des performances réelles (GPU) sur les vues de tools/shot.cjs. Usage :
//   node tools/perf.cjs <port> <qualités low,medium,high> <vue1,vue2,...> [dossier de captures]
// Pour chaque qualité et chaque vue : temps moyen d'une image complète (simulation + post-traitement), FPS équivalent,
// 95e centile, appels de dessin et triangles (rendu direct, ombres comprises), puis tableau récapitulatif.
// Les images sont enchaînées sans attendre la synchro écran (pas de plafond à 60) ; chaque image est terminée sur le GPU
// (lecture d'un pixel) pour que le temps compte vraiment le travail de la carte graphique.
// Taille : W × H (défaut 1600 × 900, proche d'un écran de jeu). N images mesurées (défaut 120).
const { launch, rendererName } = require('./browser.cjs');
const { VIEWS } = require('./shot.cjs');

(async () => {
  const [port, qs, list, out] = process.argv.slice(2);
  const W = +(process.env.W || 1600), H = +(process.env.H || 900), N = +(process.env.N || 120);
  if (out) require('fs').mkdirSync(out, { recursive: true });
  const rows = [];
  const browser = await launch();
  try {
    for (const q of (qs || 'low,medium,high').split(',')) {
      const page = await browser.newPage({ viewport: { width: W, height: H } });
      const errs = [];
      page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error') errs.push('console.error ' + m.text()); });
      // les vues d'une même page partagent la même requête (ex. `demo=foret`, voir shot.cjs) : la première fait foi
      const v0 = VIEWS[(list || 'departaube').split(',')[0]] || {};
      await page.goto(`http://localhost:${port}/?manual&q=${q}${v0.query ? '&' + v0.query : ''}`, { waitUntil: 'load' });
      if (!rows.length) console.log('rendu :', await rendererName(page), `· ${W}×${H} · ${N} images par vue`);
      await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 300000 });
      await page.evaluate(() => { localStorage.clear(); window.__game.startPlay(); });
      for (const k of (list || 'departaube').split(',')) {
        const v = VIEWS[k];
        if (!v || v.demo) { console.log('vue inconnue ou démo', k); continue; }
        if ((v.query || '') !== (v0.query || '')) { console.log('vue', k, ': requête différente de la première vue, ignorée'); continue; }
        if (v.ground) {
          // vue posée sur le relief (voir shot.cjs)
          const r = await page.evaluate(async (v) => {
            const { heightAt } = await import('/src/world/heightmap.ts');
            const at = (p) => [p[0], heightAt(p[0], p[2]) + p[1], p[2]];
            return { cam: at(v.cam), look: at(v.look) };
          }, v);
          Object.assign(v, r, { ground: false });
        }
        const r = await page.evaluate(({ v, N }) => {
          const g = window.__game; const P = g.player.pos.constructor;
          g.rig.override = null;
          if (v.cam) { g.rig.override = { pos: new P(...v.cam), look: new P(...v.look) }; g.rig.camera.position.set(...v.cam); }
          else { g.teleport(new P(v.pos[0], 9, v.pos[1]), ''); g.player.yaw = v.yaw; g.rig.yaw = v.yaw; g.rig.pitch = v.pitch; g.rig.dist = v.dist; }
          g.sky.hour = v.hour; g.sky.forceEnvUpdate();
          const gl = g.renderer.getContext();
          const px = new Uint8Array(4);
          const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          // préchauffage : chargements, compilation des shaders, LOD et ombres stabilisés
          g.step(30, 1 / 60); sync();
          const times = [];
          const t0 = performance.now();
          for (let i = 0; i < N; i++) { const a = performance.now(); g.step(1, 1 / 60); sync(); times.push(performance.now() - a); }
          const total = performance.now() - t0;
          times.sort((a, b) => a - b);
          g.renderer.info.autoReset = false; g.renderer.info.reset(); g.renderer.render(g.scene, g.rig.camera);
          const info = { ...g.renderer.info.render }; g.renderer.info.autoReset = true;
          const mem = g.renderer.info.memory;
          return { ms: total / N, p95: times[Math.floor(N * 0.95)], calls: info.calls, tris: info.triangles, geo: mem.geometries, tex: mem.textures };
        }, { v, N });
        if (out) await page.screenshot({ path: `${out}/${q}-${k}.png` });
        const row = { q, vue: k, fps: +(1000 / r.ms).toFixed(1), ms: +r.ms.toFixed(1), p95: +r.p95.toFixed(1), calls: r.calls, tris: r.tris };
        rows.push(row);
        console.log(`${q.padEnd(6)} ${k.padEnd(12)} ${String(row.fps).padStart(6)} FPS  ${String(row.ms).padStart(6)} ms (p95 ${row.p95})  appels ${r.calls}  triangles ${(r.tris / 1e6).toFixed(2)} M`);
      }
      if (errs.length) console.log('erreurs :', errs.join('\n'));
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log('\n| Qualité | Vue | FPS | ms/image | p95 ms | Appels | Triangles |\n| --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows) console.log(`| ${r.q} | ${r.vue} | ${r.fps} | ${r.ms} | ${r.p95} | ${r.calls} | ${(r.tris / 1e6).toFixed(2)} M |`);
})();
