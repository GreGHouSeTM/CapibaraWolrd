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
  // Lumière & atmosphère : même cadrage (vers l'est-sud-est, le lever du soleil) à trois heures, plus la sortie de la maison à l'aube
  aube: { pos: [-20, 4], yaw: 1.25, pitch: 0.1, hour: 6.75, dist: 8 },
  jour: { pos: [-20, 4], yaw: 1.25, pitch: 0.1, hour: 13, dist: 8 },
  crepuscule: { pos: [20, 4], yaw: -1.25, pitch: 0.1, hour: 18.4, dist: 8 },
  departaube: { pos: [-3, 26], yaw: Math.PI, pitch: 0.12, hour: 6.75, dist: 7 },
  brume: { cam: [-60, 34, 150], look: [60, 6, -60], hour: 6.9 },
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
