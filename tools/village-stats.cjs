// Intégration village : répartition des appels de dessin par grand groupe de la scène pour quelques vues.
// Usage : tools/shot-lock.sh node tools/village-stats.cjs <port> [qualité]
// Compte les maillages visibles dans le champ (vue principale) et dans les ombres, par ancêtre de premier niveau.
const { launch, rendererName } = require('./browser.cjs');
const VIEWS = {
  departaube: { pos: [-3, 26], yaw: Math.PI, pitch: 0.12, dist: 7 },
  place: { pos: [0, 18], yaw: Math.PI, pitch: 0.25, dist: 8 },
  vueaerienne: { cam: [70, 60, 90], look: [0, 6, 0] },
};
(async () => {
  const [port, q] = process.argv.slice(2);
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
    await page.goto(`http://localhost:${port}/?manual&q=${q || 'medium'}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 300000 });
    await page.evaluate(() => { localStorage.clear(); window.__game.startPlay(); });
    for (const [k, v] of Object.entries(VIEWS)) {
      const r = await page.evaluate((v) => {
        const g = window.__game; const P = g.player.pos.constructor;
        g.rig.override = null;
        if (v.cam) { g.rig.override = { pos: new P(...v.cam), look: new P(...v.look) }; g.rig.camera.position.set(...v.cam); }
        else { g.teleport(new P(v.pos[0], 9, v.pos[1]), ''); g.player.yaw = v.yaw; g.rig.yaw = v.yaw; g.rig.pitch = v.pitch; g.rig.dist = v.dist; }
        g.step(3, 0.1);
        const counts = {};
        const top = (o) => { let n = o; const names = []; while (n.parent && n.parent !== g.scene) { names.push(n.name); n = n.parent; } return (n.name || n.type) + (names.length ? '/' + (names[names.length - 2] || names[names.length - 1] || '') : ''); };
        g.renderer.info.autoReset = false;
        const orig = g.renderer.renderBufferDirect.bind(g.renderer);
        g.renderer.renderBufferDirect = (cam, scene, geo, mat, obj, grp) => { const t = top(obj).replace(/\d+,-?\d+/g, '#').replace(/-lod\d/, ''); const key = (cam.isOrthographicCamera ? 'ombre:' : '') + t; counts[key] = (counts[key] || 0) + 1; return orig(cam, scene, geo, mat, obj, grp); };
        g.renderer.info.reset();
        g.renderer.render(g.scene, g.rig.camera);
        g.renderer.renderBufferDirect = orig;
        const total = g.renderer.info.render.calls;
        g.renderer.info.autoReset = true;
        return { total, counts: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 30) };
      }, v);
      console.log('==', k, 'appels', r.total);
      for (const [n, c] of r.counts) console.log('  ', c, n);
    }
  } finally {
    await browser.close();
  }
})();
