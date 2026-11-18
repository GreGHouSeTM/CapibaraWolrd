// Planches de contrôle des modèles Poly Haven (galerie tools/polyhaven/gallery.html).
// Usage : W=1200 H=700 tools/shot-lock.sh node tools/polyhaven/shot-gallery.cjs <port> <dossier> <nom>=<requête> [...]
//   ex. tools/shot-lock.sh node tools/polyhaven/shot-gallery.cjs 5193 test-shots/ph rochers='cat=rocher' lods='ids=rock_07&lod=all'
const { launch, rendererName } = require('../browser.cjs');
(async () => {
  const [port, out, ...shots] = process.argv.slice(2);
  const W = +(process.env.W || 1200), H = +(process.env.H || 700);
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const errs = [];
    page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console.error ' + m.text()); });
    for (const s of shots) {
      const [name, q] = s.split(/=(.*)/s);
      await page.goto(`http://localhost:${port}/tools/polyhaven/gallery.html?still&${q}`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__galleryReady === true, null, { timeout: 300000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}/${name}.png`, timeout: 300000 });
      console.log('capture', name, await page.evaluate(() => document.getElementById('info').textContent));
    }
    console.log('erreurs :', errs.length ? errs.join('\n') : 'aucune');
  } finally {
    await browser.close();
  }
})();
