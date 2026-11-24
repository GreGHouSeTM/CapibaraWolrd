// Test de la montagne dans le vrai jeu (spécialité Montagne). Usage : node tools/montagne-test.cjs <port> [qualité]
// 1) montée réelle depuis les Clarines vers le Pic de l'Aurore (60 s de marche) : dénivelé, pente, état ;
// 2) chute de 10 m sur un relief de synthèse : roulade et 2 demi-cœurs en moins, jamais zéro ;
// 3) froid de nuit en altitude : givre et jauge, aucun dégât ; manteau d'hiver : plus de froid ; près d'un feu : remontée.
const { launch } = require('./browser.cjs');

(async () => {
  const [port, q] = process.argv.slice(2);
  const browser = await launch();
  let failed = 0;
  const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'ÉCHEC ') + label); if (!cond) failed++; };
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console.error ' + m.text()); });
    await page.goto(`http://localhost:${port}/?manual&q=${q || 'low'}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 300000 });
    await page.evaluate(() => { localStorage.clear(); window.__game.startPlay(); });

    // 1) montée réelle vers le Pic
    const climb = await page.evaluate(() => {
      const g = window.__game; const V = g.player.pos.constructor;
      g.sky.hour = 12;
      g.teleport(new V(-1700, 300, 830), '');
      for (let i = 0; i < 5; i++) g.frame(1 / 30, false);
      const y0 = g.player.pos.y;
      const target = [-2300, 450];
      let maxSlope = 0, slid = 0, t = 0;
      g.input.keys.add('KeyW');
      for (; t < 60; t += 1 / 30) {
        const p = g.player.pos;
        g.rig.yaw = Math.atan2(target[0] - p.x, target[1] - p.z);
        g.frame(1 / 30, false);
        maxSlope = Math.max(maxSlope, g.player.slopeDeg);
        if (g.player.sliding) slid += 1 / 30;
      }
      g.input.keys.delete('KeyW');
      const p = g.player.pos;
      return { y0: +y0.toFixed(1), y1: +p.y.toFixed(1), x: +p.x.toFixed(0), z: +p.z.toFixed(0), maxSlope: +maxSlope.toFixed(0), slid: +slid.toFixed(1), stamina: +g.player.stamina.value.toFixed(0) };
    });
    console.log('montée réelle (60 s vers le Pic, relief actuel) :', JSON.stringify(climb));
    ok(climb.y1 - climb.y0 < 70, `la montée directe est lente : ${(climb.y1 - climb.y0).toFixed(1)} m de dénivelé en 60 s (sans la règle : jusqu'à 250 m)`);

    // 2) chute de 10 m dans le jeu : cœurs
    const fall = await page.evaluate(async () => {
      const g = window.__game; const V = g.player.pos.constructor;
      const hm = await import('/src/world/heightmap.ts');
      hm.setGroundOverride((x) => (x < 0 ? 60 : 50));
      g.combat.core.halves = g.combat.core.max;
      g.teleport(new V(-6, 61, 3000), '');
      g.rig.yaw = Math.PI / 2;
      g.input.keys.add('KeyW');
      let rolled = false;
      for (let i = 0; i < 120; i++) { g.frame(1 / 30, false); rolled ||= g.player.rollT > 0; }
      g.input.keys.delete('KeyW');
      const res = { halves: g.combat.core.halves, rolled, y: +g.player.pos.y.toFixed(1) };
      // grande chute : fondu et retour en haut
      hm.setGroundOverride((x) => (x < 0 ? 80 : 50));
      g.teleport(new V(-6, 81, 3000), '');
      g.input.keys.add('KeyW');
      let fade = 0;
      for (let i = 0; i < 40; i++) { g.frame(1 / 30, false); }
      g.input.keys.delete('KeyW');
      for (let i = 0; i < 200; i++) { g.frame(1 / 30, false); fade = Math.max(fade, +document.getElementById('rescue-fade').style.opacity); }
      res.big = { halves: g.combat.core.halves, fade, y: +g.player.pos.y.toFixed(1) };
      hm.setGroundOverride(null);
      return res;
    });
    console.log('chutes :', JSON.stringify(fall));
    ok(fall.rolled && fall.halves === 8, `chute de 10 m : roulade, 2 demi-cœurs en moins (${fall.halves}/10)`);
    ok(fall.big.fade > 0.9 && fall.big.y > 79 && fall.big.halves >= 1, `chute de 30 m : fondu (${fall.big.fade}), retour en haut (y ${fall.big.y}), cœurs ${fall.big.halves}/10`);

    // 3) froid de nuit en altitude (relief de synthèse à 1 150 m), manteau, feu
    const cold = await page.evaluate(async () => {
      const g = window.__game; const V = g.player.pos.constructor;
      const hm = await import('/src/world/heightmap.ts');
      hm.setGroundOverride(() => 1150);
      g.sky.hour = 23;
      g.combat.core.halves = g.combat.core.max;
      g.teleport(new V(0, 1151, 3000), '');
      g.player.warmth.value = 100;
      for (let i = 0; i < 30 * 200; i++) g.frame(1 / 30, false);
      const r = { night: +g.sky.state.night.toFixed(2), warmth: +g.player.warmth.value.toFixed(0), frost: +document.getElementById('frost').style.opacity, halves: g.combat.core.halves, gauge: document.getElementById('warmth').classList.contains('on'), puffs: g.mountainHud.puffs.length };
      g.step(1, 1 / 30);
      return r;
    });
    const shots = process.env.SHOTDIR || '.';
    await page.screenshot({ path: `${shots}/montagne-froid.png` });
    Object.assign(cold, await page.evaluate(async () => {
      const g = window.__game;
      const hm = await import('/src/world/heightmap.ts');
      const r = {};
      g.player.winterCoat = true;
      g.player.warmth.value = 100;
      for (let i = 0; i < 30 * 60; i++) g.frame(1 / 30, false);
      r.coat = +g.player.warmth.value.toFixed(0);
      g.player.winterCoat = false;
      g.player.warmth.value = 10;
      g.player.climate = { night: () => 1, heatAt: () => 1 };
      for (let i = 0; i < 30 * 5; i++) g.frame(1 / 30, false);
      r.fire = +g.player.warmth.value.toFixed(0);
      hm.setGroundOverride(null);
      return r;
    }));
    console.log('froid :', JSON.stringify(cold));
    ok(cold.warmth < 30 && cold.frost > 0.3 && cold.gauge, `nuit à 1 150 m : chaleur ${cold.warmth}, givre ${cold.frost}, jauge affichée`);
    ok(cold.halves === 10, `aucun dégât de froid hors mode survie (${cold.halves}/10)`);
    ok(cold.coat === 100, `manteau d'hiver : plus de froid (${cold.coat})`);
    ok(cold.fire > 60, `près d'un feu, la chaleur remonte (${cold.fire} après 5 s)`);
    // 4) escalade d'une paroi rocheuse de synthèse (anneau d'endurance visible), de jour
    const grimpe = await page.evaluate(async () => {
      const g = window.__game; const V = g.player.pos.constructor;
      const hm = await import('/src/world/heightmap.ts');
      const mt = await import('/src/gameplay/mountain.ts');
      hm.setGroundOverride((x) => 60 + Math.min(14, Math.max(0, x - 10) * Math.tan((70 * Math.PI) / 180)));
      window.__rock0 = mt.mountainTerrain.rock;
      mt.mountainTerrain.rock = () => 1;
      g.sky.hour = 10;
      g.player.climate = { night: () => 0, heatAt: () => 0 };
      g.teleport(new V(6, 61, 3000), '');
      g.input.keys.add('KeyW');
      let climbing = 0;
      for (let i = 0; i < 30 * 7; i++) { g.rig.yaw = Math.PI / 2; g.frame(1 / 30, false); if (g.player.climbing) climbing++; }
      g.step(1, 1 / 30);
      return { y: +g.player.pos.y.toFixed(1), climbing: climbing / 30, stamina: +g.player.stamina.value.toFixed(0), ring: document.getElementById('stamina-ring').classList.contains('on') };
    });
    await page.screenshot({ path: `${shots}/montagne-escalade.png` });
    await page.evaluate(async () => {
      window.__game.input.keys.delete('KeyW');
      (await import('/src/world/heightmap.ts')).setGroundOverride(null);
      (await import('/src/gameplay/mountain.ts')).mountainTerrain.rock = window.__rock0;
    });
    console.log('escalade :', JSON.stringify(grimpe));
    ok(grimpe.climbing > 2 && grimpe.y > 62 && grimpe.ring, `escalade de la paroi : ${grimpe.climbing.toFixed(1)} s accroché, y ${grimpe.y}, anneau d'endurance affiché (${grimpe.stamina})`);
    console.log('erreurs :', errs.length ? errs.join('\n') : 'aucune');
    if (errs.length) failed++;
  } finally {
    await browser.close();
  }
  console.log(failed ? `${failed} ÉCHEC(S)` : 'TOUT EST VERT');
  process.exit(failed ? 1 : 0);
})();
