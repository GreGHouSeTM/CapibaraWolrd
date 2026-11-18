// Capture de la visionneuse des bâtiments (tools/viewer.html) avec Playwright.
// Usage : W=960 H=540 tools/shot-lock.sh node tools/blender/preview.cjs <port> <sortie.png> "<query>"
//   ex. query = "ids=e1,e2,e4&night=0&lod=0"
const { chromium } = require('playwright');
(async () => {
  const [port, out, query] = process.argv.slice(2);
  const W = +(process.env.W || 960), H = +(process.env.H || 540);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const errs = [];
    page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
    page.on('requestfailed', (r) => errs.push('REQFAIL ' + r.url()));
    await page.goto(`http://localhost:${port}/tools/viewer.html?${query || ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready, null, { timeout: 300000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: out, timeout: 300000 });
    console.log('stats', JSON.stringify(await page.evaluate(() => window.__stats)));
    console.log('erreurs :', errs.length ? errs.join('\n') : 'aucune');
  } finally {
    await browser.close();
  }
})();
