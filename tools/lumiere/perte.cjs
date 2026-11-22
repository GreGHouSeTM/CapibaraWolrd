// Reproduit une capture de tools/shot.cjs en surveillant la perte de contexte GL. Usage : node tools/lumiere/perte.cjs <port> <qualité> <vue>
const { launch } = require('../browser.cjs');
const { VIEWS } = require('../shot.cjs');
(async () => {
  const [port, q, k] = process.argv.slice(2);
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  page.on('console', (m) => { if (m.type() === 'error' || /lost|perdu/i.test(m.text())) console.log('console.' + m.type(), m.text().slice(0, 200)); });
  const v = VIEWS[k];
  await page.goto(`http://localhost:${port}/?manual&q=${q}&${v.query}${process.env.FP ? '&fp=' + process.env.FP : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 300000 });
  const r = await page.evaluate(async (v) => {
    const g = window.__game; const P = g.player.pos.constructor;
    const log = [];
    g.canvas.addEventListener('webglcontextlost', () => log.push('CONTEXTE PERDU à ' + performance.now().toFixed(0)));
    g.startPlay();
    const { heightAt } = await import('/src/world/heightmap.ts');
    const at = (p) => [p[0], heightAt(p[0], p[2]) + p[1], p[2]];
    g.rig.override = { pos: new P(...at(v.cam)), look: new P(...at(v.look)) };
    g.sky.hour = v.hour; g.sky.forceEnvUpdate();
    for (let i = 0; i < 25; i++) { const t = performance.now(); g.step(1, 0.1); const gl = g.renderer.getContext(); const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); log.push(i + ':' + (performance.now() - t).toFixed(0) + 'ms err' + gl.getError()); }
    return log.join(' ');
  }, v);
  console.log(r);
  await browser.close();
})();
