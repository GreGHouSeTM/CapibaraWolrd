// Contrôle du ruban des routes contre le sol, sur le maillage réellement construit par le jeu (spécialité Terrain & relief).
// Usage : node tools/terrain-qa.cjs <port> [étiquette]
// Pour chaque triangle des routes (chaussée et marquages), on échantillonne la surface (sommets, milieux, centre)
// et on compare son altitude à heightAt(x, z) (la même fonction que la physique et le shader du terrain) :
//   écart > 0 : le ruban est au-dessus du sol (il « flotte » au-delà de quelques centimètres) ;
//   écart < 0 : le sol passe au-dessus du ruban (chaussée enterrée, marquage caché).
// Les résultats sont regroupés par voie (point de tracé le plus proche de roadSamples) et écrits dans
// test-shots/terrain/qa-ruban-<étiquette>.json. Le relief et les profils en long sont mesurés par tools/terrain/qa.py.
const { launch } = require('./browser.cjs');
const fs = require('fs');

(async () => {
  const [port, tag = 'courant'] = process.argv.slice(2);
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console.error ' + m.text()); });
    await page.goto(`http://localhost:${port}/?manual&q=low`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 300000 });
    const res = await page.evaluate(async () => {
      const hm = await import('/src/world/heightmap.ts');
      const { heightAt } = hm;
      const roadSamples = [...hm.roadSamples, ...(hm.pathSamples || [])];
      const { terrainData } = await import('/src/world/terrain-data.ts');
      const g = window.__game;
      let roads = null;
      g.scene.traverse((o) => { if (o.name === 'roads') roads = o; });
      if (!roads) return { error: 'groupe « roads » introuvable' };
      // noms des voies : 6 couloirs de Capyville puis les voies du monde dessinées (même filtre que buildRoadSamples)
      const names = roadSamples.map((r, i) => r.id || (i < 6 ? `capyville-${i}` : `voie-${i}`));
      if (!roadSamples[6] || !roadSamples[6].id) {
        // ancien format (avant le tracé v2) : voies du monde dessinées dans l'ordre de meta.ways
        const drawn = (terrainData.meta.ways || []).filter((w) => w.vehicles && w.width >= 5);
        for (let i = 6, k = 0; i < roadSamples.length; i++, k++) names[i] = drawn[k] ? drawn[k].id : `voie-${i}`;
      }
      // ponts et viaducs déclarés : le ruban y suit le tablier, ces points sont comptés à part
      const decks = (terrainData.meta.ouvrages || []).filter((o) => o.kind === 'pont' || o.kind === 'viaduc');
      const onDeck = (x, z) => decks.some((o) => {
        const [ax, az] = o.from, [bx, bz] = o.to, vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
        return Math.hypot(x - ax - vx * t, z - az - vz * t) < 9;
      });
      let deckPts = 0;
      // grille de recherche du point de tracé le plus proche (cases de 32 m)
      const C = 32, bins = new Map();
      roadSamples.forEach((r, ri) => r.pts.forEach((p) => {
        const key = Math.floor(p[0] / C) + ',' + Math.floor(p[1] / C);
        if (!bins.has(key)) bins.set(key, []);
        bins.get(key).push([p[0], p[1], ri]);
      }));
      const nearest = (x, z) => {
        const ci = Math.floor(x / C), cj = Math.floor(z / C);
        let best = 1e9, br = -1;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
          const l = bins.get(ci + a + ',' + (cj + b));
          if (l) for (const q of l) { const d = (q[0] - x) ** 2 + (q[1] - z) ** 2; if (d < best) { best = d; br = q[2]; } }
        }
        return br;
      };
      const per = {};
      const all = { chaussee: [], marquage: [] };
      const worst = [];
      const W = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
      roads.traverse((o) => {
        if (!o.isMesh) return;
        const m = o.material;
        // chaussée : matériau texturé (ou nommé « chaussee ») ; marquages : blanc et jaune des lignes (ou nommés « marquage ») ;
        // le reste (lampadaires) est ignoré
        const hex = m.color ? m.color.getHex() : -1;
        const kind = m.name && m.name.includes('marquage') ? 'marquage' : m.name && m.name.includes('chaussee') ? 'chaussee'
          : m.map ? 'chaussee' : hex === 0xf4f4ec || hex === 0xf2d14a ? 'marquage' : null;
        if (!kind) return;
        const pos = o.geometry.getAttribute('position');
        const ix = o.geometry.index;
        const tri = ix ? ix.count / 3 : pos.count / 3;
        const v = (k) => (ix ? ix.getX(k) : k);
        for (let t = 0; t < tri; t++) {
          const a = v(3 * t), b = v(3 * t + 1), c = v(3 * t + 2);
          const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
          const bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b);
          const cx = pos.getX(c), cy = pos.getY(c), cz = pos.getZ(c);
          // les lampadaires et autres objets verticaux ne sont pas des surfaces de route
          const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
          const nl = Math.hypot(nx, ny, nz) || 1;
          if (Math.abs(ny) / nl < 0.5) continue;
          const ri = nearest((ax + bx + cx) / 3, (az + bz + cz) / 3);
          const name = ri >= 0 ? names[ri] : 'inconnue';
          const P = (per[name] ??= { chaussee: [], marquage: [] });
          for (const [u, w, s] of W) {
            const x = u * ax + w * bx + s * cx, y = u * ay + w * by + s * cy, z = u * az + w * bz + s * cz;
            const d = y - heightAt(x, z);
            if (d > 0.1 && decks.length && onDeck(x, z)) { deckPts++; continue; }
            P[kind].push(d);
            all[kind].push(d);
            if (kind === 'chaussee' && Math.abs(d) > 0.3 && worst.length < 200000) worst.push([Math.round(x), Math.round(z), +d.toFixed(2), name]);
          }
        }
      });
      const stat = (a) => {
        if (!a.length) return null;
        const s = Float64Array.from(a).sort();
        const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
        const share = (f) => +(100 * a.filter(f).length / a.length).toFixed(2);
        return { n: a.length, min: +s[0].toFixed(3), p05: +q(0.05).toFixed(3), p50: +q(0.5).toFixed(3), p95: +q(0.95).toFixed(3), max: +s[s.length - 1].toFixed(3),
          flotte_10cm: share((d) => d > 0.1), flotte_50cm: share((d) => d > 0.5), enterre_2cm: share((d) => d < -0.02) };
      };
      const out = { global: { chaussee: stat(all.chaussee), marquage: stat(all.marquage) }, voies: {} };
      for (const [k, P] of Object.entries(per)) out.voies[k] = { chaussee: stat(P.chaussee), marquage: stat(P.marquage) };
      worst.sort((p, q) => Math.abs(q[2]) - Math.abs(p[2]));
      out.pires = worst.slice(0, 20);
      out.points_tablier = deckPts;
      return out;
    });
    if (res.error) throw new Error(res.error);
    fs.mkdirSync('test-shots/terrain', { recursive: true });
    fs.writeFileSync(`test-shots/terrain/qa-ruban-${tag}.json`, JSON.stringify(res, null, 1));
    const f = (s) => (s ? `max ${s.max} m, p95 ${s.p95} m, min ${s.min} m, flotte > 10 cm ${s.flotte_10cm} %, > 50 cm ${s.flotte_50cm} %, enterré ${s.enterre_2cm} %` : '—');
    console.log('chaussée :', f(res.global.chaussee));
    console.log('marquages :', f(res.global.marquage));
    console.log('points sur tablier de pont ou viaduc déclaré (exclus) :', res.points_tablier);
    console.log('\n| Voie | Chaussée max (m) | p95 (m) | flotte > 10 cm | > 50 cm | enterrée | Marquages max (m) |\n| --- | --- | --- | --- | --- | --- | --- |');
    for (const [k, v] of Object.entries(res.voies)) {
      const c = v.chaussee, m = v.marquage;
      if (!c) continue;
      console.log(`| ${k} | ${c.max} | ${c.p95} | ${c.flotte_10cm} % | ${c.flotte_50cm} % | ${c.enterre_2cm} % | ${m ? m.max : '—'} |`);
    }
    console.log('\npires écarts (x, z, écart, voie) :', JSON.stringify(res.pires.slice(0, 8)));
    console.log('erreurs :', errs.length ? errs.join('\n') : 'aucune');
  } finally {
    await browser.close();
  }
})();
