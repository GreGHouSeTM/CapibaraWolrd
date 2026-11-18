// Test automatique de l'intégration du village (spécialité Intégration village). Usage :
//   tools/shot-lock.sh node tools/village-test.cjs <port> [qualité]
// Vérifie que Mamie, Coach Capy, Nina, Léo et Basile sont joignables (invite « Parler à » puis dialogue),
// qu'on peut monter dans le cabriolet, que la photo du moulin vise la roue, que les escaliers et les ponts portent
// le joueur, et que le bassin, l'étang et les yuzus sont aux positions de zones.ts.
const { launch, rendererName } = require('./browser.cjs');

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

    // 1) PNJ joignables
    const npcs = await page.evaluate(() => {
      const g = window.__game; const V = g.player.pos.constructor;
      const res = [];
      for (const id of ['mamie', 'coach', 'swimmer', 'photographer', 'shop']) {
        const n = g.npcs.get(id);
        if (!n) { res.push({ id, found: false }); continue; }
        const p = n.obj.position;
        // on se place à 1,6 m du PNJ, du côté le plus dégagé
        let best = null;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const t = new V(p.x + Math.cos(a) * 1.6, p.y + 1, p.z + Math.sin(a) * 1.6);
          g.teleport(t, '');
          for (let i = 0; i < 8; i++) g.frame(1 / 30, false);
          const d = g.player.pos.distanceTo(p);
          if (!best || d < best.d) best = { d, a };
          if (d < 2.6 && g.interactTarget) break;
        }
        const label = g.interactTarget ? g.interactTarget.label : '';
        let dialog = false;
        if (g.interactTarget && /Parler/.test(label)) {
          g.interactTarget.run();
          dialog = !!g.ui.dialogOpen;
          for (let i = 0; i < 20 && g.ui.dialogOpen; i++) g.ui.advanceDialog();
          for (let i = 0; i < 4; i++) g.frame(1 / 30, false);
        }
        res.push({ id, found: true, name: n.def.name, pos: [p.x, p.y, p.z].map((v) => +v.toFixed(1)), dist: +best.d.toFixed(2), label: label.replace(/<[^>]+>/g, ''), dialog });
      }
      return res;
    });
    for (const n of npcs) ok(n.found && /Parler/.test(n.label) && n.dialog, `${n.name || n.id} joignable en ${JSON.stringify(n.pos)} (${n.label}, dialogue ${n.dialog})`);

    // 2) le cabriolet de Coach Capy
    const car = await page.evaluate(() => {
      const g = window.__game; const V = g.player.pos.constructor;
      g.ui.close?.();
      g.state = 'play';
      const v = g.vehicles.find((x) => x.type === 'car' && Math.hypot(x.pos.x - 25, x.pos.z + 112) < 8);
      if (!v) return { found: false };
      g.teleport(new V(v.pos.x + 2.4, v.pos.y + 1, v.pos.z), '');
      for (let i = 0; i < 10; i++) g.frame(1 / 30, false);
      const label = g.interactTarget ? g.interactTarget.label.replace(/<[^>]+>/g, '') : '';
      if (g.interactTarget && /Monter/.test(label)) g.interactTarget.run();
      for (let i = 0; i < 10; i++) g.frame(1 / 30, false);
      // petit trajet en avant sur la route de Paris
      g.input.keys.add('KeyW');
      const p0 = g.player.pos.clone();
      for (let i = 0; i < 60; i++) g.frame(1 / 30, false);
      g.input.keys.delete('KeyW');
      const moved = g.player.pos.distanceTo(p0);
      const inCar = g.player.vehicle ? g.player.vehicle.type : null;
      return { found: true, label, inCar, moved: +moved.toFixed(1), pos: [v.pos.x, v.pos.y, v.pos.z].map((x) => +x.toFixed(1)) };
    });
    ok(car.found && car.inCar === 'car', `on monte dans le cabriolet (${car.label}) en ${JSON.stringify(car.pos)}`);
    ok(car.moved > 3, `le cabriolet roule (${car.moved} m en 2 s)`);

    // 3) positions de jeu, photo du moulin, escaliers et ponts
    const r3 = await page.evaluate(async () => {
      const g = window.__game; const V = g.player.pos.constructor;
      const { groundAt } = await import('/src/world/physics.ts');
      const { heightAt } = await import('/src/world/heightmap.ts');
      if (g.player.vehicle) g.player.exit?.();
      const hub = g.world.contents.hub;
      const s = hub.spots;
      // photo : caméra à 30 m du moulin, regard sur la roue
      g.rig.override = { pos: new V(30, 12, -60), look: new V(57.2, 9.4, -72) };
      g.step(2, 0.05);
      g.takePhoto();
      const photo = g.lastPhoto && g.lastPhoto.photoId;
      g.rig.override = null;
      // escaliers du sandō et des mille torii : la hauteur marchable monte par marches
      const prof = (pts) => pts.map(([x, z]) => +(groundAt(x, z, heightAt(x, z) + 0.8) - heightAt(x, z)).toFixed(2));
      const sando = prof([[-17, -26], [-20, -36], [-23, -52], [-26, -70]]);
      const top = groundAt(-42, -104, 40);
      const mille = [[-38, -84], [-39.5, -90], [-41, -96], [-41.5, -101], [-42, -104]].map(([x, z]) => [+heightAt(x, z).toFixed(1), +groundAt(x, z, 40).toFixed(1)]);
      console.log('mille', JSON.stringify(mille));
      // ponts : le dessus du Pont des Lanternes est à ~1,5 m au-dessus des rives
      const pl = groundAt(66.5, 6, 30), bank = heightAt(58, 6);
      const pv = groundAt(70, 28, 30);
      return { mille, photo, sando, top: +top.toFixed(2), pont: +(pl - bank).toFixed(2), vapeur: +pv.toFixed(2), spring: [s.spring.x, s.spring.z], pond: [s.pond.x, s.pond.z], windmill: [s.windmill.x, s.windmill.z], yuzus: s.yuzuList.length, start: [s.start.x, s.start.z], walk: hub.walkPoints.length };
    });
    ok(r3.photo === 'windmill', `photo « windmill » réussie en visant la roue (${r3.photo})`);
    ok(r3.sando.every((d) => d > 0 && d < 0.5), `marches du sandō au-dessus du sol (${r3.sando.join(', ')})`);
    console.log('mille torii (terrain, marchable) :', JSON.stringify(r3.mille));
    ok(r3.top > 18, `haut de l'escalier aux mille torii marchable (y = ${r3.top})`);
    ok(r3.pont > 1.2 && r3.pont < 1.9, `dessus du Pont des Lanternes à ${r3.pont} m au-dessus de la rive`);
    ok(r3.spring[0] === 60 && r3.spring[1] === 70 && r3.pond[0] === -120 && r3.pond[1] === 90 && r3.windmill[0] === 48 && r3.yuzus === 5, `spots : source ${r3.spring}, étang ${r3.pond}, moulin ${r3.windmill}, ${r3.yuzus} yuzus, départ ${r3.start}`);
    ok(r3.walk > 40, `${r3.walk} points de marche des promeneurs`);
    // 4) on gravit vraiment l'escalier aux mille torii (marche au clavier vers le haut)
    const climb = await page.evaluate(() => {
      const g = window.__game; const V = g.player.pos.constructor;
      if (g.player.vehicle) g.player.exit();
      g.rig.override = null;
      const pts = [[-38, -84], [-41, -96], [-42, -106]];
      g.teleport(new V(-37.6, 13, -82.5), '');
      for (let i = 0; i < 10; i++) g.frame(1 / 30, false);
      let k = 1;
      for (let t = 0; t < 14 && k < pts.length; t += 1 / 30) {
        const p = g.player.pos;
        const [x, z] = pts[k];
        if (Math.hypot(x - p.x, z - p.z) < 1.2) k++;
        g.rig.yaw = Math.atan2(x - p.x, z - p.z);
        g.input.keys.add('KeyW');
        g.frame(1 / 30, false);
      }
      g.input.keys.delete('KeyW');
      return { y: +g.player.pos.y.toFixed(2), x: +g.player.pos.x.toFixed(1), z: +g.player.pos.z.toFixed(1) };
    });
    ok(climb.y > 22, `le joueur gravit l'escalier aux mille torii jusqu'à la pagode (${JSON.stringify(climb)})`);
    console.log('erreurs :', errs.length ? errs.join('\n') : 'aucune');
    if (errs.length) failed++;
  } finally {
    await browser.close();
  }
  console.log(failed ? `${failed} ÉCHEC(S)` : 'TOUT EST VERT');
  process.exit(failed ? 1 : 0);
})();
