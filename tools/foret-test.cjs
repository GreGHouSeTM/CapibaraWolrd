// Test automatique de la zone de démonstration « forêt » (?demo=foret). Usage :
//   node tools/foret-test.cjs <port> [qualité]
// Vérifie que le capybara monte le sentier et les deux volées de l'escalier jusqu'au sentier haut, que la paroi
// l'arrête (pas d'escalade de la pente raide), que la caméra normale suit, et qu'aucune erreur GL ni console n'apparaît
// (jour puis nuit).
const { launch, rendererName } = require('./browser.cjs');

(async () => {
  const [port, q] = process.argv.slice(2);
  const browser = await launch();
  let failed = 0;
  const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'ÉCHEC ') + label); if (!cond) failed++; };
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' || /GL_INVALID|WebGL: INVALID|GL ERROR/i.test(m.text())) errs.push('console ' + m.type() + ' ' + m.text()); });
    await page.goto(`http://localhost:${port}/?manual&q=${q || 'high'}&demo=foret`, { waitUntil: 'load' });
    console.log('rendu :', await rendererName(page));
    await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 300000 });
    await page.evaluate(() => { localStorage.clear(); window.__game.startPlay(); });

    // 1) marche le long du sentier (suivi des points de la ligne médiane), escalier compris
    const walk = await page.evaluate(() => {
      const g = window.__game; const S = g.data.scene; const P = g.player.pos.constructor;
      const pts = S.path.filter((p) => p[1] < 28 && p[1] > -24);
      const sp = pts[0];
      g.teleport(new P(sp[0], sp[2] + 1, sp[1]), '');
      let k = 0, frames = 0, maxY = -1e9, stuck = 0, last = g.player.pos.clone();
      g.input.keys.add('KeyW');
      while (k < pts.length && frames < 2400) {
        const t = pts[k];
        const dx = t[0] - g.player.pos.x, dz = t[1] - g.player.pos.z;
        if (Math.hypot(dx, dz) < 0.8) { k++; continue; }
        g.rig.yaw = Math.atan2(dx, dz);
        g.frame(1 / 30, false);
        frames++;
        maxY = Math.max(maxY, g.player.pos.y);
        if (frames % 30 === 0) { if (g.player.pos.distanceTo(last) < 0.3) stuck++; last = g.player.pos.clone(); }
      }
      g.input.keys.delete('KeyW');
      const end = pts[pts.length - 1];
      return { reached: k >= pts.length, frames, y: g.player.pos.y, endY: end[2], maxY, stuck, pos: g.player.pos.toArray().map((v) => +v.toFixed(2)) };
    });
    console.log('  marche :', JSON.stringify(walk));
    ok(walk.reached, 'le capybara suit le sentier et gravit les deux volées jusqu’au sentier haut');
    ok(Math.abs(walk.y - walk.endY) < 0.6, `il arrive à la bonne hauteur (${walk.y.toFixed(2)} m pour ${walk.endY} m)`);
    ok(walk.stuck === 0, 'jamais bloqué en route');

    // 2) la paroi arrête le capybara (on fonce vers l'est au pied de l'escalier)
    const wall = await page.evaluate(() => {
      const g = window.__game; const P = g.player.pos.constructor;
      g.teleport(new P(-0.3, 9, 9.5), '');
      const y0 = g.player.pos.y;
      g.rig.yaw = Math.PI / 2; // vers +x (est)
      g.input.keys.add('KeyW'); g.input.keys.add('ShiftLeft');
      for (let i = 0; i < 150; i++) g.frame(1 / 30, false);
      g.input.keys.delete('KeyW'); g.input.keys.delete('ShiftLeft');
      return { x: g.player.pos.x, y: g.player.pos.y, y0 };
    });
    console.log('  paroi :', JSON.stringify(wall));
    ok(wall.x < 4.5 && wall.y - wall.y0 < 1.5, 'la paroi arrête le capybara (pas d’escalade)');

    // 3) caméra normale : derrière le capybara, au-dessus du sol
    const cam = await page.evaluate(() => {
      const g = window.__game;
      g.rig.override = null;
      for (let i = 0; i < 30; i++) g.frame(1 / 30, false);
      const c = g.rig.camera.position;
      return { d: c.distanceTo(g.player.pos), above: c.y - g.data.height(c.x, c.z) };
    });
    ok(cam.d > 1 && cam.d < 15 && cam.above > 0.2, `caméra normale (à ${cam.d.toFixed(1)} m, ${cam.above.toFixed(2)} m au-dessus du sol)`);

    // 4) rendu jour et nuit sans erreur
    await page.evaluate(() => { const g = window.__game; g.sky.hour = 10; g.step(20, 1 / 30); g.sky.hour = 22; g.step(20, 1 / 30); g.sky.hour = 10; g.step(5, 1 / 30); });
    const gl = await page.evaluate(() => window.__game.renderer.getContext().getError());
    ok(gl === 0, `aucune erreur WebGL (getError = ${gl})`);
    ok(errs.length === 0, 'aucune erreur console' + (errs.length ? ' :\n' + errs.slice(0, 8).join('\n') : ''));
  } finally {
    await browser.close();
  }
  console.log(failed ? `${failed} échec(s)` : 'tout est vert');
  process.exit(failed ? 1 : 0);
})();
