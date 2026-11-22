// Vérifie que WebGPU est actif dans le Chromium des outils et que l'adaptateur est la vraie carte graphique.
//   node tools/lumiere/webgpu-check.cjs <port>
const { launch } = require('../browser.cjs');
(async () => {
  const [port] = process.argv.slice(2);
  const browser = await launch();
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/tools/viewer.html`).catch(() => {});
  const r = await page.evaluate(async () => {
    if (!navigator.gpu) return { gpu: false };
    const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!a) return { gpu: true, adapter: null };
    const i = a.info || {};
    return { gpu: true, vendor: i.vendor, architecture: i.architecture, device: i.device, description: i.description, features: [...a.features].join(' ') };
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})();
