// Test automatique du combat (spécialité Combat). Usage :
//   tools/shot-lock.sh node tools/combat-test.cjs <port> <dossier> [qualité]
// Prend la mission de la Gardienne Sora, va dans la prairie du Levant, attend un Grignoteur, esquive sa roulade,
// le frappe jusqu'au « pouf », vérifie que la mission avance puis se termine, et capture la scène de combat.
// Les longues simulations avancent sans rendu (`frame(dt, false)`) ; seules les captures sont rendues.
const { launch, rendererName } = require('./browser.cjs');

(async () => {
  const [port, out, q] = process.argv.slice(2);
  const W = +(process.env.W || 800), H = +(process.env.H || 450);
  const browser = await launch();
  let failed = 0;
  const ok = (cond, label) => {
    console.log((cond ? 'OK   ' : 'ÉCHEC ') + label);
    if (!cond) failed++;
  };
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const errs = [];
    page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console.error ' + m.text()); });
    await page.goto(`http://localhost:${port}/?manual&q=${q || 'medium'}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 300000 });
    await page.evaluate(() => { localStorage.clear(); window.__game.startPlay(); });

    // outils de simulation dans la page
    await page.evaluate(() => {
      const g = window.__game;
      const V = g.player.pos.constructor;
      const DT = 1 / 30;
      const levant = () => g.combat.enemies.enemies.filter((e) => e.zone.id === 'levant');
      const sim = (s, each) => { for (let t = 0; t < s; t += DT) { if (each && each(t) === true) return true; g.frame(DT, false); } return false; };
      // petit « joueur automatique » : marche vers le Grignoteur le plus proche, frappe, roule sur le côté s'il va foncer
      const bot = () => {
        const p = g.player.pos;
        const alive = levant().filter((e) => e.alive);
        g.input.keys.delete('KeyW'); g.input.keys.delete('KeyD');
        if (!alive.length) return;
        alive.sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p));
        const e = alive[0];
        const dx = e.pos.x - p.x, dz = e.pos.z - p.z, d = Math.hypot(dx, dz);
        g.rig.yaw = Math.atan2(dx, dz);
        const threat = alive.find((x) => x.state === 'telegraphe' && x.stateT > x.params.telegraph * 0.6);
        if (threat && g.combat.core.dodgeCooldown <= 0 && g.combat.core.action !== 'roulade') {
          g.rig.yaw = Math.atan2(threat.pos.x - p.x, threat.pos.z - p.z);
          g.input.keys.add('KeyD');
          g.input.pressed.add('dodge');
          g.__stats.dodges++;
          return;
        }
        if (d > 1.9) g.input.keys.add('KeyW');
        else if (g.combat.core.action !== 'roulade') g.input.pressed.add('attack');
      };
      g.__stats = { dodges: 0 };
      g.__t = { V, DT, levant, sim, bot };
    });

    // 1) mission donnée par la Gardienne Sora
    const r1 = await page.evaluate(() => {
      const g = window.__game, { V, sim } = g.__t;
      const sora = g.npcs.get('guardian');
      if (!sora) return { sora: false };
      g.teleport(sora.obj.position.clone().add(new V(1.5, 0, 0)), '');
      sim(0.3);
      g.talkTo('guardian');
      for (let i = 0; i < 20 && g.ui.dialogOpen; i++) g.ui.advanceDialog();
      sim(0.2);
      return { sora: true, mission: g.runner.mission && g.runner.mission.id, hearts: document.querySelectorAll('#hearts .heart').length };
    });
    ok(r1.sora, 'la Gardienne Sora est au village');
    ok(r1.mission === 'grignoteurs', 'mission « Les Grignoteurs du Levant » lancée');
    ok(r1.hearts === 5, '5 cœurs dans le HUD');

    // 2) dans la prairie : un Grignoteur surgit
    const r2 = await page.evaluate(() => {
      const g = window.__game, { V, sim, levant } = g.__t;
      g.teleport(new V(146, 20, 5), '');
      g.player.yaw = g.rig.yaw = Math.atan2(4, 3);
      const seen = sim(6, () => levant().some((e) => e.state === 'poursuite' || e.state === 'telegraphe'));
      return { seen, step: g.runner.stepIndex, states: levant().map((e) => e.state).join(',') };
    });
    ok(r2.seen, `un Grignoteur surgit et poursuit (${r2.states})`);
    ok(r2.step === 1, 'étape « Fais déguerpir les Grignoteurs » atteinte');

    // 3) esquive d'une roulade
    const r3 = await page.evaluate(() => {
      const g = window.__game, { sim, levant } = g.__t;
      const before = g.combat.core.halves;
      let rolled = false, sawRoulade = false;
      sim(8, () => {
        const e = levant().find((x) => x.state === 'telegraphe' && x.stateT > 0.4);
        if (e && !rolled) {
          rolled = true;
          g.rig.yaw = Math.atan2(e.pos.x - g.player.pos.x, e.pos.z - g.player.pos.z);
          g.input.keys.add('KeyD');
          g.input.pressed.add('dodge');
        }
        if (g.combat.core.action === 'roulade') sawRoulade = true;
        if (rolled && sawRoulade && g.combat.core.action === 'libre') return true;
      });
      g.input.keys.delete('KeyD');
      sim(0.8);
      return { rolled, sawRoulade, before, after: g.combat.core.halves };
    });
    ok(r3.rolled && r3.sawRoulade, 'roulade déclenchée pendant le télégraphe');
    ok(r3.after === r3.before, `roulade réussie : aucun cœur perdu (${r3.before} → ${r3.after})`);

    // 4) attaque jusqu'au « pouf » de 5 Grignoteurs
    const r4 = await page.evaluate(() => {
      const g = window.__game, { sim, levant, bot } = g.__t;
      const base = g.combat.enemies.defeated.levant || 0;
      const coins0 = g.save.coins;
      let firstPouf = -1, combo3 = false, hitSeen = false, minHalves = 99;
      const done = sim(150, (t) => {
        bot();
        if (g.combat.core.combo === 2) combo3 = true;
        if (levant().some((e) => e.state === 'recul')) hitSeen = true;
        minHalves = Math.min(minHalves, g.combat.core.halves);
        const n = (g.combat.enemies.defeated.levant || 0) - base;
        if (n >= 1 && firstPouf < 0) firstPouf = t;
        return n >= 5 && g.combat.drops.active === 0;
      });
      g.input.keys.delete('KeyW'); g.input.keys.delete('KeyD');
      return {
        done, firstPouf, combo3, hitSeen, minHalves, defeated: (g.combat.enemies.defeated.levant || 0) - base, step: g.runner.stepIndex,
        coins: g.save.coins - coins0, alive: levant().filter((e) => e.alive).length, dodges: g.__stats.dodges, ko: g.combat.core.action,
      };
    });
    ok(r4.hitSeen, 'un Grignoteur recule quand il est touché');
    ok(r4.combo3, 'le combo atteint la ruade (3e coup)');
    ok(r4.firstPouf >= 0, `premier « pouf » après ${r4.firstPouf.toFixed(1)} s de combat`);
    ok(r4.defeated >= 5 && r4.alive === 0, `5 Grignoteurs chassés (${r4.defeated}), prairie vide`);
    ok(r4.coins >= 15, `pièces ramassées : ${r4.coins}`);
    ok(r4.step === 2, 'la mission avance : retour à la Gardienne');
    console.log(`     (roulades du bot : ${r4.dodges}, cœurs au plus bas : ${r4.minHalves}/10)`);

    // 5) fin de mission
    const r5 = await page.evaluate(() => {
      const g = window.__game, { V, sim } = g.__t;
      const sora = g.npcs.get('guardian');
      g.teleport(sora.obj.position.clone().add(new V(1.5, 0, 0)), '');
      sim(0.5);
      for (let i = 0; i < 20 && g.ui.dialogOpen; i++) g.ui.advanceDialog();
      return { done: g.save.done.includes('grignoteurs') };
    });
    ok(r5.done, 'mission réussie auprès de la Gardienne Sora');

    // 6) réapparition et « Ouf ! » (cœurs à zéro → réveil au bain extérieur, sans perte)
    const r6 = await page.evaluate(() => {
      const g = window.__game, { V, sim, levant } = g.__t;
      const coins = g.save.coins;
      const respawned = sim(95, () => levant().every((e) => e.alive));
      g.teleport(new V(146, 20, 5), '');
      g.combat.core.halves = 1;
      const hit = sim(20, () => g.combat.core.action === 'ko');
      const oufShown = !!document.querySelector('#ouf.on');
      sim(3.5);
      const p = g.player.pos;
      return { respawned, hit, oufShown, dist: Math.hypot(p.x - 52, p.z - 66), halves: g.combat.core.halves, coinsKept: g.save.coins >= coins };
    });
    ok(r6.respawned, 'les Grignoteurs réapparaissent après le délai');
    ok(r6.hit && r6.oufShown, 'cœurs à zéro : écran « Ouf ! »');
    ok(r6.dist < 3 && r6.halves === 10 && r6.coinsKept, `réveil au bord du bain (à ${r6.dist.toFixed(1)} m de (52, 66)), cœurs pleins, rien perdu`);

    // 7) captures : Grignoteur caché, télégraphe, combo
    const shot = async (name) => { await page.evaluate(() => { const t = document.querySelector('#toast'); if (t) t.style.display = 'none'; const n = document.querySelector('#notice'); if (n) n.innerHTML = ''; }); await page.screenshot({ path: `${out}/${name}.png`, timeout: 300000 }); console.log('capture', name); };
    const setCam = (from, to) => page.evaluate(([f, t]) => {
      const g = window.__game, { V } = g.__t;
      const p = g.player.pos;
      const yaw = g.player.yaw;
      // f = [côté, hauteur, recul] dans le repère du capybara ; t = point visé (décalage avant)
      const s = Math.sin(yaw), c = Math.cos(yaw);
      const pos = new V(p.x + c * f[0] - s * f[2], p.y + f[1], p.z - s * f[0] - c * f[2]);
      const look = new V(p.x + s * t[2], p.y + t[1], p.z + c * t[2]);
      g.rig.override = { pos, look };
      g.rig.camera.position.copy(pos);
      g.rig.camera.lookAt(look);
    }, [from, to]);

    await page.evaluate(() => {
      const g = window.__game, { V, sim } = g.__t;
      g.sky.hour = 10.5; g.sky.forceEnvUpdate();
      g.combat.enemies.resetAll(true);
      g.combat.core.revive();
      // à 11 m du nid (150, 8), en regardant vers lui
      g.teleport(new V(139, 20, 2), '');
      g.player.yaw = Math.atan2(150 - 139, 8 - 2);
      sim(0.5);
    });
    // caméra basse à 4 m du nid : seuls les yeux dépassent des herbes
    await page.evaluate(() => {
      const g = window.__game, { V, levant } = g.__t;
      const e = levant().find((x) => x.state === 'cache');
      const look = e.pos.clone().setY(e.pos.y + 0.35);
      const out = new V(Math.sin(e.yaw), 0, Math.cos(e.yaw));
      const pos = look.clone().addScaledVector(out, 3.6).add(new V(0.8, 0.75, 0));
      g.rig.override = { pos, look };
      g.rig.camera.position.copy(pos);
      g.rig.camera.lookAt(look);
      g.step(1, 0.001);
    });
    await shot('grignoteur-cache');

    const tele = await page.evaluate(() => {
      const g = window.__game, { V, sim, levant } = g.__t;
      g.rig.override = null;
      g.teleport(new V(146.5, 20, 5.5), '');
      g.player.yaw = Math.atan2(3.5, 2.5);
      return sim(6, () => levant().some((e) => e.state === 'telegraphe' && e.stateT > 0.35 && e.pos.distanceTo(g.player.pos) < 6));
    });
    if (tele) {
      await page.evaluate(() => {
        const g = window.__game, { levant } = g.__t;
        const e = levant().find((x) => x.state === 'telegraphe');
        g.player.yaw = Math.atan2(e.pos.x - g.player.pos.x, e.pos.z - g.player.pos.z);
      });
      await setCam([1.6, 1.3, 3.0], [0, 0.3, 2.6]);
      await page.evaluate(() => window.__game.step(1, 0.001));
      await shot('telegraphe');
    } else ok(false, 'pas de télégraphe à capturer');

    const fight = await page.evaluate(() => {
      const g = window.__game, { sim, levant, bot } = g.__t;
      g.rig.override = null;
      // combat jusqu'à la frappe de la ruade sur un Grignoteur
      return sim(30, () => {
        const c = g.combat.core;
        if (c.combo === 1 && c.action === 'attaque' && c.t >= 0.2 && levant().some((e) => e.state === 'recul' && e.stateT < 0.2 && e.pos.distanceTo(g.player.pos) < 3)) return true;
        bot();
      });
    });
    if (fight) {
      await setCam([3.4, 1.3, 0.6], [0, 0.35, 1.3]);
      await page.evaluate(() => { const g = window.__game; g.step(1, 0.03); });
      await shot('combat');
    } else ok(false, 'pas de coup à capturer');

    const info = await page.evaluate(() => { const g = window.__game; g.renderer.info.autoReset = false; g.renderer.info.reset(); g.renderer.render(g.scene, g.rig.camera); const r = { ...g.renderer.info.render }; g.renderer.info.autoReset = true; return r; });
    const own = await page.evaluate(() => {
      const g = window.__game, c = g.combat;
      const objs = [c.enemies.group, c.fx.group, c.drops.mesh];
      objs.forEach((o) => (o.visible = false));
      g.renderer.info.autoReset = false; g.renderer.info.reset(); g.renderer.render(g.scene, g.rig.camera);
      const r = { ...g.renderer.info.render };
      g.renderer.info.autoReset = true;
      objs.forEach((o) => (o.visible = true));
      return r;
    });
    console.log('rendu direct (scène de combat) : appels', info.calls, 'triangles', info.triangles,
      `· part du combat (ennemis, nids, effets, pièces) : ${info.calls - own.calls} appels, ${info.triangles - own.triangles} triangles`);
    ok(errs.length === 0, 'aucune erreur console' + (errs.length ? ' :\n' + errs.join('\n') : ''));
  } finally {
    await browser.close();
  }
  console.log(failed ? `${failed} échec(s)` : 'Tout est vert.');
  process.exit(failed ? 1 : 0);
})();
