// Capture d'écran automatisée. Usage :
//   tools/shot-lock.sh node tools/shot.cjs <port> <dossier> <qualité> <vue1,vue2,...>
// Vues prédéfinies de Capyville ; ajoute les tiennes dans VIEWS si besoin.
const { chromium } = require('playwright');
const VIEWS = {
  place: { pos: [0, 18], yaw: Math.PI, pitch: 0.25, hour: 10.5, dist: 8 },
  rue: { pos: [38, 20], yaw: -2.2, pitch: 0.12, hour: 15, dist: 6 },
  maison: { pos: [30, 28], yaw: 0.9, pitch: 0.18, hour: 11, dist: 4 },
  prairie: { pos: [120, 30], yaw: 1.4, pitch: 0.15, hour: 17.5, dist: 7 },
  nuit: { pos: [0, 30], yaw: Math.PI, pitch: 0.2, hour: 22, dist: 8 },
  ruisseau: { pos: [112, 60], yaw: 2.6, pitch: 0.2, hour: 9, dist: 8 },
  vueaerienne: { cam: [70, 60, 90], look: [0, 6, 0], hour: 16 },
  // --- Assets Poly Haven : scène de démonstration (tools/polyhaven/demo.ts) autour de (0, 6, 0), lumière dorée.
  // `ground` : la hauteur y de cam et look est comptée au-dessus du terrain.
  polyhaven: { cam: [3, 2.6, 13], look: [-2, 0.6, -3], hour: 6.9, demo: '/tools/polyhaven/demo.ts', ground: true },
  'polyhaven-props': { cam: [7.5, 1.5, 4.8], look: [6.6, 0.45, -1.2], hour: 6.9, demo: '/tools/polyhaven/demo.ts', ground: true },
  'polyhaven-sol': { cam: [-3.2, 1.4, 5.5], look: [-6.5, 0.3, -1.5], hour: 6.9, demo: '/tools/polyhaven/demo.ts', ground: true },
};
(async () => {
  const [port, out, q, list] = process.argv.slice(2);
  const W = +(process.env.W || 800), H = +(process.env.H || 450);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const errs = [];
    page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console.error ' + m.text()); });
    await page.goto(`http://localhost:${port}/?manual&q=${q || 'medium'}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 300000 });
    await page.evaluate(() => { localStorage.clear(); window.__game.startPlay(); });
    for (const k of (list || 'place').split(',')) {
      const v = VIEWS[k];
      if (!v) { console.log('vue inconnue', k); continue; }
      if (v.demo) {
        // scène de démonstration chargée dynamiquement (une seule fois par page)
        const r = await page.evaluate(async (v) => {
          const g = window.__game;
          if (!g.__demos) g.__demos = {};
          if (!g.__demos[v.demo]) g.__demos[v.demo] = await (await import(v.demo)).setupDemo(g);
          if (v.ground) {
            const { heightAt } = await import('/src/world/heightmap.ts');
            v.cam = [v.cam[0], heightAt(v.cam[0], v.cam[2]) + v.cam[1], v.cam[2]];
            v.look = [v.look[0], heightAt(v.look[0], v.look[2]) + v.look[1], v.look[2]];
          }
          return { info: g.__demos[v.demo], cam: v.cam, look: v.look };
        }, v);
        Object.assign(v, { cam: r.cam, look: r.look, ground: false });
        console.log('démo', k, JSON.stringify(r.info));
      }
      await page.evaluate((v) => {
        const g = window.__game; const P = g.player.pos.constructor;
        g.rig.override = null;
        if (v.cam) { g.rig.override = { pos: new P(...v.cam), look: new P(...v.look) }; g.rig.camera.position.set(...v.cam); }
        else { g.teleport(new P(v.pos[0], 9, v.pos[1]), ''); g.player.yaw = v.yaw; g.rig.yaw = v.yaw; g.rig.pitch = v.pitch; g.rig.dist = v.dist; }
        g.sky.hour = v.hour; g.sky.forceEnvUpdate();
        g.step(25, 0.1);
      }, v);
      await page.screenshot({ path: `${out}/${k}.png`, timeout: 300000 });
      console.log('capture', k);
    }
    const info = await page.evaluate(() => { const g = window.__game; g.renderer.info.autoReset = false; g.renderer.info.reset(); g.renderer.render(g.scene, g.rig.camera); const r = { ...g.renderer.info.render }; g.renderer.info.autoReset = true; return r; });
    console.log('rendu direct : appels', info.calls, 'triangles', info.triangles);
    console.log('erreurs :', errs.length ? errs.join('\n') : 'aucune');
  } finally {
    await browser.close();
  }
})();
