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
  // --- Eau : le torrent sur ses galets (tronçon sud), vue depuis la berge
  ruisseau: { cam: [36, 7.5, 147], look: [20, 3.6, 132], hour: 9 },
  'torrent-haut': { cam: [64, 9.5, -2], look: [66, 4.9, 14], hour: 10.5 },
  torrent: { cam: [57.5, 8.2, -14], look: [66, 4.6, 8], hour: 9.5 },
  cascade: { cam: [-112, 2.2, 100], look: [-94, 1.6, 110.5], hour: 16.5 },
  'cascade-gorge': { cam: [78, 21, -138], look: [92, 17, -157], hour: 11 },
  'etang-proche': { cam: [-110, 2.3, 72.5], look: [-117, -0.6, 83], hour: 10.5 },
  'etang-reflets': { cam: [-160, 3.2, 104], look: [-112, 2, 80], hour: 17.8 },
  yubatake: { cam: [29, 9.5, -27], look: [40, 6.2, -37], hour: 8.2 },
  ashiyu: { cam: [18.5, 7.6, 7.5], look: [22, 6.2, 2], hour: 10 },
  rizieres: { cam: [-130, 13, -40], look: [-170, 9, -4], hour: 17.6 },
  eaunuit: { cam: [64, 7.6, -9], look: [67, 4.8, 14], hour: 21.5 },
  vueaerienne: { cam: [70, 60, 90], look: [0, 6, 0], hour: 16 },
  // --- Assets Poly Haven : scène de démonstration (tools/polyhaven/demo.ts) autour de (0, 6, 0), lumière dorée.
  // `ground` : la hauteur y de cam et look est comptée au-dessus du terrain ; x et z sont relatifs au centre de la démo (DEMO_CENTER).
  polyhaven: { cam: [3, 2.6, 13], look: [-2, 0.6, -3], hour: 6.9, demo: '/tools/polyhaven/demo.ts', ground: true },
  'polyhaven-props': { cam: [7.5, 1.5, 4.8], look: [6.6, 0.45, -1.2], hour: 6.9, demo: '/tools/polyhaven/demo.ts', ground: true },
  'polyhaven-sol': { cam: [-3.2, 1.4, 5.5], look: [-6.5, 0.3, -1.5], hour: 6.9, demo: '/tools/polyhaven/demo.ts', ground: true },
  'polyhaven-plan': { cam: [-1, 60, 14], look: [-1, 0, -4], hour: 9, demo: '/tools/polyhaven/demo.ts', ground: true },
  // --- Terrain & relief : vues de contrôle du relief
  pagode: { pos: [-38, -108], yaw: 0.26, pitch: 0.12, hour: 8, dist: 6 },
  'place-ny': { pos: [0, 0], yaw: 2.09, pitch: 0.06, hour: 11, dist: 6 },
  'place-nord': { pos: [0, 10], yaw: Math.PI, pitch: 0.04, hour: 11, dist: 6 },
  lointain: { cam: [380, 240, 470], look: [0, 20, 0], hour: 15 },
  gorge: { cam: [40, 40, -60], look: [110, 20, -200], hour: 10 },
  etang: { cam: [-150, 14, 140], look: [-110, 2, 85], hour: 10 },
  paris: { cam: [60, 90, -470], look: [-60, 20, -800], hour: 12 },
  newyork: { cam: [480, 90, -230], look: [693, 40, -400], hour: 12 },
  // Lumière & atmosphère : même cadrage (vers l'est-sud-est, le lever du soleil) à trois heures, plus la sortie de la maison à l'aube
  aube: { pos: [-20, 4], yaw: 1.25, pitch: 0.1, hour: 6.75, dist: 8 },
  jour: { pos: [-20, 4], yaw: 1.25, pitch: 0.1, hour: 13, dist: 8 },
  crepuscule: { pos: [20, 4], yaw: -1.25, pitch: 0.1, hour: 18.4, dist: 8 },
  // --- Intégration village : sandō et mille torii, moulin à eau, pont des Lanternes, rotenburo
  sando: { cam: [-12, 10, -16], look: [-26, 12, -70], hour: 9 },
  moulin: { cam: [30, 12, -60], look: [55, 8, -72], hour: 10 },
  pont: { cam: [58, 9, 18], look: [70, 6, 2], hour: 10 },
  rotenburo: { cam: [44, 10, 82], look: [60, 5.5, 68], hour: 10 },
  departaube: { pos: [-3, 26], yaw: Math.PI, pitch: 0.12, hour: 6.75, dist: 7 },
  // nuit avec des lanternes provisoires autour de la place (test des lumières dynamiques et des taches de lumière)
  nuitlanternes: { pos: [0, 14], yaw: Math.PI, pitch: 0.22, hour: 22, dist: 8, testLights: true },
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
      if (v.demo) {
        // scène de démonstration chargée dynamiquement (une seule fois par page)
        const r = await page.evaluate(async (v) => {
          const g = window.__game;
          if (!g.__demos) g.__demos = {};
          const mod = await import(v.demo);
          if (!g.__demos[v.demo]) g.__demos[v.demo] = await mod.setupDemo(g);
          if (v.ground) {
            const { heightAt } = await import('/src/world/heightmap.ts');
            const c = mod.DEMO_CENTER || { x: 0, z: 0 };
            const at = (p) => [p[0] + c.x, heightAt(p[0] + c.x, p[2] + c.z) + p[1], p[2] + c.z];
            v.cam = at(v.cam);
            v.look = at(v.look);
          }
          return { info: g.__demos[v.demo], cam: v.cam, look: v.look };
        }, v);
        Object.assign(v, { cam: r.cam, look: r.look, ground: false });
        console.log('démo', k, JSON.stringify(r.info));
        v.stats = true;
      }
      await page.evaluate((v) => {
        const g = window.__game; const P = g.player.pos.constructor;
        g.rig.override = null;
        if (v.cam) { g.rig.override = { pos: new P(...v.cam), look: new P(...v.look) }; g.rig.camera.position.set(...v.cam); }
        else { g.teleport(new P(v.pos[0], 9, v.pos[1]), ''); g.player.yaw = v.yaw; g.rig.yaw = v.yaw; g.rig.pitch = v.pitch; g.rig.dist = v.dist; }
        if (v.testLights && !g.__testLights && g.lights) {
          g.__testLights = true;
          for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.lights.debugAdd(Math.cos(a) * 11, 7.6, Math.sin(a) * 11, 0xffb060, 1, 'lantern'); }
          for (let i = 0; i < 6; i++) g.lights.debugAdd(-6 + (i % 2) * 12, 7.2, -14 - Math.floor(i / 2) * 9, 0xffd8a0, 1, 'window');
        }
        g.sky.hour = v.hour; g.sky.forceEnvUpdate();
        g.step(25, 0.1);
      }, v);
      await page.screenshot({ path: `${out}/${k}.png`, timeout: 300000 });
      if (v.stats) console.log('  modèles Poly Haven :', JSON.stringify(await page.evaluate(async () => (await import('/src/core/models.ts')).Models.stats())));
      // appels de dessin et triangles de la vue (rendu direct de la scène, ombres comprises)
      const vi = await page.evaluate(() => { const g = window.__game; g.renderer.info.autoReset = false; g.renderer.info.reset(); g.renderer.render(g.scene, g.rig.camera); const r = { ...g.renderer.info.render }; g.renderer.info.autoReset = true; return r; });
      console.log('capture', k, '— appels', vi.calls, 'triangles', vi.triangles);
    }
    const info = await page.evaluate(() => { const g = window.__game; g.renderer.info.autoReset = false; g.renderer.info.reset(); g.renderer.render(g.scene, g.rig.camera); const r = { ...g.renderer.info.render }; g.renderer.info.autoReset = true; return r; });
    console.log('rendu direct : appels', info.calls, 'triangles', info.triangles);
    console.log('erreurs :', errs.length ? errs.join('\n') : 'aucune');
  } finally {
    await browser.close();
  }
})();
