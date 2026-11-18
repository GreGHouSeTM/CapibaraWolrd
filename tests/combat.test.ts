// Tests de la logique de combat : dégâts, invulnérabilité, recharge, combo, régénération, Grignoteurs, zones.
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CombatCore, COMBAT, COMBO, inArc } from '../src/gameplay/combat';
import { EnemyManager, Grignoteur, GRIGNOTEUR, confine, grignoteurParams, EnemyContext } from '../src/actors/enemies';
import { ENEMY_NESTS, SAFE_ZONES, TALL_GRASS_ZONES, inSafeZone } from '../src/world/zones';
import { clearPhysics } from '../src/world/physics';
import { MissionRunner, MISSIONS, GameAPI } from '../src/gameplay/missions';

const run = (c: CombatCore, seconds: number, fighting = false, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) c.update(dt, fighting);
};

describe('combat du joueur', () => {
  it('enchaîne les 3 coups du combo si on clique pendant le coup', () => {
    const c = new CombatCore();
    expect(c.pressAttack('ground')).toBe(0);
    run(c, 0.1);
    expect(c.pressAttack('ground')).toBe(-1); // mémorisé
    run(c, COMBO[0].duration);
    expect(c.combo).toBe(1);
    c.pressAttack('ground');
    run(c, COMBO[1].duration);
    expect(c.combo).toBe(2);
    expect(c.attack?.id).toBe('ruade');
    run(c, COMBO[2].duration + 0.01);
    expect(c.action).toBe('libre');
    // après la ruade, on repart au coup de tête
    expect(c.pressAttack('ground')).toBe(0);
  });

  it('le combo retombe à zéro si on attend trop', () => {
    const c = new CombatCore();
    c.pressAttack('ground');
    run(c, COMBO[0].duration + COMBAT.chainWindow + 0.1);
    expect(c.pressAttack('ground')).toBe(0);
  });

  it('pas d’attaque ni de roulade en voiture, à la nage ou en l’air', () => {
    const c = new CombatCore();
    for (const m of ['drive', 'swim', 'air'] as const) {
      expect(c.pressAttack(m)).toBe(-1);
      expect(c.pressDodge(m)).toBe(false);
    }
    expect(c.action).toBe('libre');
  });

  it('roulade : invulnérable environ 0,4 s puis temps de recharge', () => {
    const c = new CombatCore();
    expect(c.pressDodge('ground')).toBe(true);
    expect(c.damage(1)).toBe('esquive');
    run(c, 0.35);
    expect(c.invulnerable).toBe(true);
    run(c, 0.1);
    expect(c.invulnerable).toBe(false);
    run(c, 0.1);
    expect(c.action).toBe('libre');
    expect(c.pressDodge('ground')).toBe(false); // recharge
    run(c, COMBAT.dodge.duration + COMBAT.dodge.cooldown);
    expect(c.pressDodge('ground')).toBe(true);
    expect(c.halves).toBe(COMBAT.maxHalves);
  });

  it('dégâts en demi-cœurs, invulnérabilité après un coup reçu', () => {
    const c = new CombatCore();
    expect(c.damage(1)).toBe('touche');
    expect(c.halves).toBe(COMBAT.maxHalves - 1);
    expect(c.hurtInvuln).toBe(true);
    expect(c.damage(1)).toBe('esquive');
    run(c, COMBAT.hurt.invuln + 0.05, true);
    expect(c.damage(2)).toBe('touche');
    expect(c.halves).toBe(COMBAT.maxHalves - 3);
  });

  it('à zéro : « Ouf ! », puis réveil avec tous les cœurs', () => {
    const c = new CombatCore();
    c.halves = 1;
    expect(c.damage(2)).toBe('ko');
    expect(c.halves).toBe(0);
    expect(c.action).toBe('ko');
    expect(c.pressAttack('ground')).toBe(-1);
    c.revive();
    expect(c.halves).toBe(c.max);
    expect(c.action).toBe('libre');
    expect(c.invulnerable).toBe(true);
  });

  it('régénération lente seulement hors combat', () => {
    const c = new CombatCore();
    c.damage(3);
    run(c, 20, true);
    expect(c.halves).toBe(COMBAT.maxHalves - 3);
    run(c, COMBAT.regen.delay + COMBAT.regen.every * 2 + 0.2, false);
    expect(c.halves).toBe(COMBAT.maxHalves - 1);
    run(c, 60);
    expect(c.halves).toBe(COMBAT.maxHalves);
  });

  it('hit-stop : les minuteries se figent', () => {
    const c = new CombatCore();
    c.pressAttack('ground');
    c.addHitstop(0.1);
    expect(c.update(0.05, false)).toBe(true);
    expect(c.t).toBe(0);
    c.update(0.06, false);
    c.update(0.05, false);
    expect(c.t).toBeCloseTo(0.05);
  });

  it('zone d’impact en arc devant le capybara', () => {
    // capybara en (0, 0) qui regarde +z
    expect(inArc(0, 0, 0, 0, 1.5, 1.6, Math.PI / 2)).toBe(true);
    expect(inArc(0, 0, 0, 0, -1.5, 1.6, Math.PI / 2)).toBe(false); // derrière
    expect(inArc(0, 0, 0, 1.5, 0.2, 1.6, Math.PI / 2)).toBe(false); // sur le côté, arc étroit
    expect(inArc(0, 0, 0, 1.5, 0.2, 1.6, (200 * Math.PI) / 180)).toBe(true); // la ruade couvre large
    expect(inArc(0, 0, 0, 0, 3, 1.6, Math.PI)).toBe(false); // trop loin
    expect(inArc(0, 0, Math.PI / 2, 1.4, 0, 1.6, 0.5)).toBe(true); // regarde +x
  });
});

const levant = TALL_GRASS_ZONES.find((z) => z.id === 'levant')!;
const ctx = (x: number, z: number, targetable = true): EnemyContext => ({ player: new THREE.Vector3(x, 0, z), targetable, playerRadius: 0.38 });
const tick = (e: Grignoteur, c: EnemyContext, s: number, ev = {}, dt = 1 / 30) => {
  for (let t = 0; t < s; t += dt) e.update(dt, c, ev);
};

describe('Grignoteurs', () => {
  beforeEach(() => clearPhysics());

  it('reste caché, puis surgit quand le joueur approche', () => {
    const nest = ENEMY_NESTS[0];
    const e = new Grignoteur(levant, nest, GRIGNOTEUR, 0);
    tick(e, ctx(nest.x + 20, nest.z), 2);
    expect(e.state).toBe('cache');
    tick(e, ctx(nest.x + 5, nest.z), 0.1);
    expect(e.state).toBe('surgit');
  });

  it('ne repère pas un joueur en voiture ou dans une zone sûre', () => {
    const nest = ENEMY_NESTS[0];
    const e = new Grignoteur(levant, nest, GRIGNOTEUR, 0);
    tick(e, ctx(nest.x + 2, nest.z, false), 2);
    expect(e.state).toBe('cache');
  });

  it('télégraphe ~0,6 s avant de rouler, puis touche le joueur', () => {
    const nest = ENEMY_NESTS[0];
    const e = new Grignoteur(levant, nest, GRIGNOTEUR, 0);
    const c = ctx(nest.x + 3.5, nest.z);
    let hits = 0;
    const ev = { hitPlayer: () => (hits++, true) };
    let teleAt = -1, rollAt = -1, t = 0;
    for (; t < 4 && rollAt < 0; t += 1 / 60) {
      e.update(1 / 60, c, ev);
      if (e.state === 'telegraphe' && teleAt < 0) teleAt = t;
      if (e.state === 'roule') rollAt = t;
    }
    expect(teleAt).toBeGreaterThan(0);
    expect(rollAt - teleAt).toBeGreaterThan(0.55);
    expect(rollAt - teleAt).toBeLessThan(0.7);
    tick(e, c, 1, ev, 1 / 60);
    expect(hits).toBe(1);
  });

  it('recule quand il est touché ; 3 points de vie ; « pouf » ; réapparaît après le délai', () => {
    const nest = ENEMY_NESTS[0];
    const e = new Grignoteur(levant, nest, GRIGNOTEUR, 0);
    e.setState('poursuite');
    const from = { x: e.pos.x - 1, z: e.pos.z };
    expect(e.hit(1, from.x, from.z, 4)).toBe(true);
    expect(e.state).toBe('recul');
    expect(e.hit(1, from.x, from.z, 4)).toBe(false); // même coup : ignoré
    const x0 = e.pos.x;
    tick(e, ctx(from.x - 30, from.z), 0.3);
    expect(e.pos.x).toBeGreaterThan(x0); // repoussé à l'opposé
    expect(e.hit(2, e.pos.x - 1, e.pos.z, 8)).toBe(true);
    expect(e.state).toBe('pouf');
    let defeated = 0;
    tick(e, ctx(nest.x + 40, nest.z), 0.5, { defeated: () => defeated++ });
    expect(defeated).toBe(1);
    expect(e.state).toBe('absent');
    expect(e.alive).toBe(false);
    tick(e, ctx(nest.x + 40, nest.z), GRIGNOTEUR.respawnSeconds - 1, {}, 0.5);
    expect(e.state).toBe('absent');
    tick(e, ctx(nest.x + 40, nest.z), 2, {}, 0.5);
    expect(e.state).toBe('cache');
    expect(e.hp).toBe(3);
  });

  it('ne sort jamais de sa prairie (laisse de 6 m) en poursuivant', () => {
    const nest = ENEMY_NESTS[0];
    const e = new Grignoteur(levant, nest, GRIGNOTEUR, 0);
    // le joueur s'éloigne lentement vers le village : le Grignoteur suit puis abandonne
    for (let t = 0; t < 30; t += 1 / 30) {
      const c = ctx(nest.x - 2 - t * 3, nest.z - t * 1.5);
      e.update(1 / 30, c);
      const d = Math.hypot(e.pos.x - levant.x, e.pos.z - levant.z);
      expect(d).toBeLessThanOrEqual(levant.r + GRIGNOTEUR.leash + 1e-6);
      expect(inSafeZone(e.pos.x, e.pos.z)).toBe(false);
    }
    expect(['patrouille', 'retour', 'cache']).toContain(e.state);
  });

  it('confinement : jamais dans une zone sûre', () => {
    // prairie fictive collée au village : le point est repoussé hors du village
    const zone = { x: 120, z: 0, r: 26 };
    const p = confine(100, 0, zone, 6);
    expect(p.clamped).toBe(true);
    expect(inSafeZone(p.x, p.z)).toBe(false);
    const far = confine(levant.x + 100, levant.z, levant, 6);
    expect(Math.hypot(far.x - levant.x, far.z - levant.z)).toBeCloseTo(levant.r + 6);
  });

  it('aucun nid ni aucune prairie dans une zone sûre', () => {
    for (const n of ENEMY_NESTS) expect(inSafeZone(n.x, n.z)).toBe(false);
    for (const z of TALL_GRASS_ZONES)
      for (const s of SAFE_ZONES) expect(Math.hypot(z.x - s.x, z.z - s.z)).toBeGreaterThan(z.r + 6 + s.r);
  });

  it('le gestionnaire crée le bon nombre d’ennemis et compte les « pouf »', () => {
    const m = new EnemyManager({ views: false });
    for (const z of TALL_GRASS_ZONES) expect(m.aliveIn(z.id)).toBe(z.enemies);
    const e = m.enemies.find((x) => x.zone.id === 'levant')!;
    e.setState('poursuite');
    e.hit(5, e.pos.x - 1, e.pos.z, 4);
    m.update(1 / 30, 0, ctx(0, 0, false));
    expect(m.defeated.levant).toBe(1);
    expect(m.aliveIn('levant')).toBe(levant.enemies - 1);
  });

  it('difficulté : plus rapides au Plateau, télégraphe toujours lisible', () => {
    const p3 = grignoteurParams(3);
    expect(p3.rollSpeed).toBeGreaterThan(grignoteurParams(1).rollSpeed);
    expect(p3.telegraph).toBeGreaterThanOrEqual(0.5);
    expect(p3.hp).toBe(3);
  });
});

describe('mission « Les Grignoteurs du Levant »', () => {
  it('donnée par la Gardienne Sora, avance avec les « pouf » de la prairie', () => {
    const m = MISSIONS.find((x) => x.id === 'grignoteurs')!;
    expect(m.giver).toBe('guardian');
    const pos = new THREE.Vector3(0, 0, 0);
    let count = 2; // deux Grignoteurs chassés avant la mission ne comptent pas
    const api: GameAPI = {
      playerPos: () => pos, vehicleType: () => null, npcPos: () => new THREE.Vector3(), content: () => ({}) as any,
      lastPhoto: () => null, time: () => 0, hat: () => 'none', defeated: (z) => (z === 'levant' ? count : 0),
    };
    const r = new MissionRunner();
    let done = false;
    r.onComplete = () => (done = true);
    r.start(m, api);
    r.update(api, 0.1);
    expect(r.stepIndex).toBe(0);
    pos.set(levant.x, 0, levant.z);
    r.update(api, 0.1);
    expect(r.stepIndex).toBe(1);
    count += 3;
    r.update(api, 0.1);
    expect(r.view(api)?.progress).toBe('3 / 5');
    count += 2;
    r.update(api, 0.1);
    expect(r.stepIndex).toBe(2);
    pos.set(0, 0, 0); // talkPos par défaut : origine
    r.update(api, 0.1);
    expect(done).toBe(true);
  });
});
