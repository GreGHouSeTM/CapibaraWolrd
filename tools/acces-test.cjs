// Test automatique de franchissement (spécialité Conduite & accès). Usage :
//   node tools/acces-test.cjs <port> [qualité] [filtre]
// 1) Le capybara marche (au clavier simulé, en courant) le long de chaque chemin de PATHS et sur chaque pont de BRIDGES
//    (de 4 m avant la rive A à 4 m après la rive B). S'il n'avance plus pendant 1,2 s, on note un blocage : position et
//    collisions responsables (fichier:ligne de l'appel addBox/addCircle, grâce au mode diagnostic `?acces` de physics.ts),
//    puis on le pose 3 m plus loin et on continue.
// 2) Le cabriolet roule sur les six rues dallées, le raccord sud et les trois ponts-routes (bible §4.3) ; même détection.
// Le test est vert quand aucun blocage n'est trouvé et qu'il n'y a pas d'erreur console.
const { launch } = require('./browser.cjs');

(async () => {
  const [port, q, filter] = process.argv.slice(2);
  const browser = await launch();
  let failed = 0;
  const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'ÉCHEC ') + label); if (!cond) failed++; };
  try {
    const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console.error ' + m.text()); });
    await page.goto(`http://localhost:${port}/?manual&acces&q=${q || 'low'}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 300000 });
    await page.evaluate(() => {
      localStorage.clear();
      const g = window.__game;
      g.startPlay();
      g.ui.close?.();
      g.state = 'play';
      // les ennemis ne gênent pas la marche du test
      if (g.combat) g.combat.hurtBy = () => false;
    });

    // ------------------------------------------------------------------------------------------- outils communs (page)
    await page.evaluate(async () => {
      const { collidersNear, groundAt } = window.__physics;
      const Z = await import('/src/world/zones.ts');
      const T = {};
      window.__acces = T;
      T.Z = Z;
      /** échantillonne une polyligne tous les `step` mètres */
      T.sample = (pts, step) => {
        const out = [];
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
          const l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(l / step));
          for (let k = i ? 1 : 0; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
        }
        return out;
      };
      /** collisions qui touchent un cercle de rayon r autour de (x, z) à la hauteur du corps */
      T.culprits = (x, z, y, r, h) => {
        const seen = new Map();
        for (const c of collidersNear(x, z, r + 0.15, y + 0.05, y + h)) {
          if (y >= c.y1 - 0.45) continue; // on peut monter dessus
          const k = (c.src || '?') + (c.tag ? ' [' + c.tag + ']' : '');
          seen.set(k, (seen.get(k) || 0) + 1);
        }
        return [...seen].map(([k, n]) => (n > 1 ? `${k} ×${n}` : k));
      };
      /**
       * Marche le long de `pts`. Renvoie les blocages { at, culprits }.
       * Un point est « atteint » à moins de 0,7 m ; s'il ne se rapproche plus pendant 1,2 s, c'est un blocage.
       */
      T.walk = (pts, opts = {}) => {
        const g = window.__game; const V = g.player.pos.constructor;
        const P = T.sample(pts, 2.5);
        const blocks = [];
        let swim = 0;
        const [sx, sz] = P[0];
        g.teleport(new V(sx, groundAt(sx, sz, 200) + 0.3, sz), '');
        g.rig.override = null;
        for (let i = 0; i < 6; i++) g.frame(1 / 30, false);
        g.input.keys.add('KeyW');
        g.input.keys.add('ShiftLeft');
        let k = 1, best = Infinity, stall = 0, t = 0;
        const dt = 1 / 30;
        while (k < P.length && t < 400) {
          const p = g.player.pos;
          const [x, z] = P[k];
          const d = Math.hypot(x - p.x, z - p.z);
          if (d < 0.7) { k++; best = Infinity; stall = 0; continue; }
          if (d < best - 0.05) { best = d; stall = 0; } else stall += dt;
          if (stall > 1.2) {
            const y = g.player.pos.y;
            blocks.push({ at: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)], vers: [+x.toFixed(1), +z.toFixed(1)], culprits: T.culprits(p.x, p.z, y, g.player.radius + 0.25, 0.9) });
            // on repart 3 m plus loin sur le tracé
            const k2 = Math.min(P.length - 1, k + 1);
            const [nx, nz] = P[k2];
            g.teleport(new V(nx, groundAt(nx, nz, y + 3) + 0.3, nz), '');
            k = Math.min(P.length - 1, k2 + 1);
            best = Infinity; stall = 0;
            if (k2 === P.length - 1) break;
            continue;
          }
          g.rig.yaw = Math.atan2(x - p.x, z - p.z);
          g.frame(dt, false);
          if (g.player.state === 'swim') swim += dt;
          t += dt;
        }
        g.input.keys.delete('KeyW');
        g.input.keys.delete('ShiftLeft');
        return { blocks, swim: +swim.toFixed(1), time: +t.toFixed(1), n: P.length };
      };
      /** Conduit le véhicule le long de `pts` à vitesse modérée ; mêmes règles de blocage (2 s). */
      T.drive = (v, pts, opts = {}) => {
        const g = window.__game;
        const P = T.sample(pts, 4);
        const blocks = [];
        const [sx, sz] = P[0];
        v.pos.set(sx, groundAt(sx, sz, 200), sz);
        v.yaw = Math.atan2(P[1][0] - sx, P[1][1] - sz);
        v.speed = 0; v.vy = 0;
        if (v.vel) v.vel.set(0, 0, 0);
        v.sync();
        let k = 1, best = Infinity, stall = 0, t = 0, vmax = 0;
        const dt = 1 / 30;
        const keys = g.input.keys;
        while (k < P.length && t < 300) {
          const p = v.pos;
          const [x, z] = P[k];
          const d = Math.hypot(x - p.x, z - p.z);
          if (d < 3) { k++; best = Infinity; stall = 0; continue; }
          if (d < best - 0.05) { best = d; stall = 0; } else stall += dt;
          if (stall > 2) {
            blocks.push({ at: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)], vers: [+x.toFixed(1), +z.toFixed(1)], culprits: T.culprits(p.x, p.z, p.y + 0.3, v.spec.radius, 1.5) });
            const k2 = Math.min(P.length - 1, k + 1);
            const [nx, nz] = P[k2];
            v.pos.set(nx, groundAt(nx, nz, p.y + 3), nz);
            v.speed = 0;
            if (v.vel) v.vel.set(0, 0, 0);
            k = Math.min(P.length - 1, k2 + 1); best = Infinity; stall = 0;
            if (k2 === P.length - 1) break;
            continue;
          }
          // pilote automatique : on vise le point suivant
          const want = Math.atan2(x - p.x, z - p.z);
          let err = want - v.yaw;
          while (err > Math.PI) err -= Math.PI * 2;
          while (err < -Math.PI) err += Math.PI * 2;
          const steer = Math.max(-1, Math.min(1, -err * 2.5));
          keys.delete('KeyA'); keys.delete('KeyD'); keys.delete('KeyW'); keys.delete('KeyS');
          if (steer > 0.15) keys.add('KeyD'); else if (steer < -0.15) keys.add('KeyA');
          const target = opts.speed || 9;
          if (Math.abs(v.speed) < target) keys.add('KeyW');
          g.frame(dt, false);
          vmax = Math.max(vmax, Math.abs(v.speed));
          t += dt;
        }
        for (const c of ['KeyA', 'KeyD', 'KeyW', 'KeyS']) keys.delete(c);
        return { blocks, time: +t.toFixed(1), vmax: +vmax.toFixed(1) };
      };
    });

    // ------------------------------------------------------------------------------------------- 1) à pied
    const items = await page.evaluate(() => {
      const Z = window.__acces.Z;
      const out = Z.PATHS.map((p) => ({ kind: 'chemin', id: p.id, name: p.name, pts: p.pts }));
      for (const b of Z.BRIDGES) {
        const dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1], l = Math.hypot(dx, dz);
        const ux = dx / l, uz = dz / l;
        out.push({ kind: 'pont', id: b.id, name: b.name, pts: [[b.a[0] - ux * 4, b.a[1] - uz * 4], [b.b[0] + ux * 4, b.b[1] + uz * 4]] });
      }
      return out;
    });
    // Un tracé de PATHS est une polyligne grossière : là où il emprunte un pont (à moins de 1,5 m de son axe, entre
    // ses deux têtes), on suit l'axe du pont et on y entre par sa tête (point à 2 m dans l'axe), comme le ferait un joueur.
    await page.evaluate(() => {
      const T = window.__acces;
      const hit = (x, z) => {
        for (const b of T.Z.BRIDGES) {
          const dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1], l = Math.hypot(dx, dz);
          const t = ((x - b.a[0]) * dx + (z - b.a[1]) * dz) / (l * l);
          if (t < 0.05 || t > 0.95) continue;
          const px = b.a[0] + dx * t, pz = b.a[1] + dz * t;
          if (Math.hypot(x - px, z - pz) < 1.5) return { b, t, p: [px, pz], out: (s) => [s ? b.b[0] + (dx / l) * 2 : b.a[0] - (dx / l) * 2, s ? b.b[1] + (dz / l) * 2 : b.a[1] - (dz / l) * 2] };
        }
        return null;
      };
      T.onBridges = (pts) => {
        const out = [];
        let cur = null;
        for (const [x, z] of T.sample(pts, 1)) {
          const h = hit(x, z);
          if (h && (!cur || cur.b !== h.b)) { if (cur) out.push(cur.out(cur.t > 0.5)); out.push(h.out(h.t > 0.5)); cur = h; }
          if (!h && cur) { out.push(cur.out(cur.t > 0.5)); cur = null; }
          if (h) { cur.t = h.t; out.push(h.p); } else out.push([x, z]);
        }
        return out;
      };
    });
    let total = 0;
    for (const it of items) {
      if (filter && !it.id.includes(filter)) continue;
      const r = await page.evaluate((it) => window.__acces.walk(it.kind === 'chemin' ? window.__acces.onBridges(it.pts) : it.pts), it);
      total += r.blocks.length;
      const swim = it.kind === 'pont' && r.swim > 0.3 ? ` — NAGE ${r.swim} s` : r.swim > 0 ? ` (nage ${r.swim} s)` : '';
      ok(!r.blocks.length && !(it.kind === 'pont' && r.swim > 0.3), `${it.kind} ${it.id} (${it.name}) : ${r.blocks.length} blocage(s) en ${r.time} s${swim}`);
      for (const b of r.blocks) console.log(`       bloqué en ${JSON.stringify(b.at)} vers ${JSON.stringify(b.vers)} par ${b.culprits.length ? b.culprits.join(', ') : '(terrain ou pente)'}`);
    }

    // ------------------------------------------------------------------------------------------- 2) en cabriolet
    const roads = await page.evaluate(() => {
      const Z = window.__acces.Z;
      const out = Z.PATHS.filter((p) => p.kind === 'rue' || p.kind === 'axe').map((p) => ({ id: p.id, pts: p.pts }));
      for (const b of Z.BRIDGES.filter((b) => b.type === 'pont-route-bois')) {
        const dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1], l = Math.hypot(dx, dz);
        const ux = dx / l, uz = dz / l;
        out.push({ id: 'pont-' + b.id, pts: [[b.a[0] - ux * 8, b.a[1] - uz * 8], [b.b[0] + ux * 8, b.b[1] + uz * 8]] });
      }
      return out;
    });
    await page.evaluate(() => {
      const g = window.__game;
      const v = g.vehicles.find((x) => x.type === 'car');
      g.player.enter(v);
      window.__acces.car = v;
    });
    for (const r of roads) {
      if (filter && !r.id.includes(filter)) continue;
      // à l'aller puis au retour
      for (const dir of ['aller', 'retour']) {
        const pts = dir === 'aller' ? r.pts : [...r.pts].reverse();
        const res = await page.evaluate((pts) => window.__acces.drive(window.__acces.car, pts), pts);
        total += res.blocks.length;
        ok(!res.blocks.length, `cabriolet ${r.id} (${dir}) : ${res.blocks.length} blocage(s) en ${res.time} s, pointe ${res.vmax} m/s`);
        for (const b of res.blocks) console.log(`       bloqué en ${JSON.stringify(b.at)} vers ${JSON.stringify(b.vers)} par ${b.culprits.length ? b.culprits.join(', ') : '(terrain ou pente)'}`);
      }
    }
    await page.evaluate(() => { const g = window.__game; if (g.player.vehicle) g.player.exit(); });
    console.log(`blocages au total : ${total}`);
    console.log('erreurs :', errs.length ? errs.join('\n') : 'aucune');
    if (errs.length) failed++;
  } finally {
    await browser.close();
  }
  console.log(failed ? `${failed} ÉCHEC(S)` : 'TOUT EST VERT');
  process.exit(failed ? 1 : 0);
})();
