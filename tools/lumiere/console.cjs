// Relevé de toute la console (erreurs, avertissements) d'une page du jeu. Usage :
//   node tools/lumiere/console.cjs <port> "<requête>" [secondes]
// ex. node tools/lumiere/console.cjs 5182 "q=medium" ; node tools/lumiere/console.cjs 5182 "demo=foret&q=max&gpu=webgpu"
const { launch, rendererName } = require('../browser.cjs');
(async () => {
  const [port, query, secs] = process.argv.slice(2);
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: +(process.env.W || 1600), height: +(process.env.H || 900) } });
  const seen = new Map();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => {
    const k = m.type() + ' ' + m.text().slice(0, +(process.env.LEN || 300));
    if (m.type() === 'log' || m.type() === 'debug' || m.type() === 'info') return;
    seen.set(k, (seen.get(k) || 0) + 1);
  });
  await page.goto(`http://localhost:${port}/?manual&${query || ''}`, { waitUntil: 'load' });
  console.log('rendu :', await rendererName(page));
  await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 300000 });
  const info = await page.evaluate(async (s) => {
    const g = window.__game; g.startPlay(); g.sky.hour = 10; g.sky.forceEnvUpdate();
    for (let i = 0; i < (s || 3) * 30; i++) { g.step(1, 1 / 30); if (g.renderer.backend?.isWebGPUBackend) await new Promise((r) => setTimeout(r, 0)); }
    const gl = g.renderer.getContext?.();
    return { backend: g.renderer.backend ? (g.renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2 (secours)') : 'WebGLRenderer', glErr: gl && gl.getError ? gl.getError() : null };
  }, +secs || 3);
  console.log('moteur :', info.backend, '· getError :', info.glErr);
  for (const [k, n] of seen) console.log(`${n}×`, k);
  if (!seen.size) console.log('console : rien');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
