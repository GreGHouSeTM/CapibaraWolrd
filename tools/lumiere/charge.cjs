// Suit le chargement d'une page (état, texte de chargement, console) jusqu'à l'écran titre. Usage :
//   node tools/lumiere/charge.cjs <port> "<requête>" [largeur] [hauteur]
const { launch } = require('../browser.cjs');
(async () => {
  const [port, query, w, h] = process.argv.slice(2);
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: +w || 960, height: +h || 540 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message, e.stack));
  page.on('console', (m) => { if (m.type() !== 'log' && m.type() !== 'debug') console.log('console.' + m.type(), m.text().slice(0, 400)); });
  await page.goto(`http://localhost:${port}/?manual&${query || ''}`, { waitUntil: 'load' });
  for (let i = 0; i < 120; i++) {
    const s = await page.evaluate(() => ({ st: window.__game && window.__game.state, txt: (document.querySelector('#loading') || {}).innerText }));
    console.log(i, s.st, (s.txt || '').replace(/\s+/g, ' ').slice(0, 80));
    if (s.st === 'title') break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  await browser.close();
})();
