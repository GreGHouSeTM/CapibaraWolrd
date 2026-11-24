// Tests de la montagne (spécialité Montagne) : vitesse selon la pente, mur infranchissable, escalade, chute, chaleur.
// Le vrai capybara (Player) marche sur des reliefs de synthèse (setGroundOverride), image par image à 30 i/s.
import './helpers/dom';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Player } from '../src/gameplay/player';
import { MONTAGNE, Stamina, Warmth, fallOutcome, mountainTerrain, slopeSpeedFactor, warmthRate } from '../src/gameplay/mountain';
import { setGroundOverride } from '../src/world/heightmap';
import { clearPhysics } from '../src/world/physics';
import type { Input } from '../src/core/input';

const DT = 1 / 30;
const T30 = Math.tan((30 * Math.PI) / 180);
const T70 = Math.tan((70 * Math.PI) / 180);

/** Commandes simulées : avancer (y = 1) dans le sens de la caméra, courir ou non. */
function fakeInput(o: { y?: number; x?: number; run?: boolean } = {}) {
  const st = { y: o.y ?? 1, x: o.x ?? 0, run: !!o.run };
  const inp = { move: () => ({ x: st.x, y: st.y }), held_: (a: string) => a === 'run' && st.run, consume: () => false };
  return { st, input: inp as unknown as Input };
}
/** Caméra tournée vers +x (direction de marche (sin yaw, cos yaw) = (1, 0)). */
const EAST = Math.PI / 2;

function spawn(x: number, z: number, h: (x: number, z: number) => number) {
  setGroundOverride(h);
  const p = new Player('none');
  p.setPosition(new THREE.Vector3(x, h(x, z), z));
  return p;
}

const rockDefault = mountainTerrain.rock;
beforeEach(() => clearPhysics());
afterEach(() => {
  setGroundOverride(null);
  mountainTerrain.rock = rockDefault;
});

describe('règles de pente', () => {
  it('ralentit nettement au-delà de 15°, très lent vers 35°, bloque au-delà de 41°', () => {
    expect(slopeSpeedFactor(5)).toBe(1);
    expect(slopeSpeedFactor(15)).toBeCloseTo(0.8, 5);
    expect(slopeSpeedFactor(25)).toBeCloseTo(0.5, 5);
    expect(slopeSpeedFactor(35)).toBeLessThan(0.3);
    expect(slopeSpeedFactor(42)).toBe(0);
    // descente : un peu plus rapide
    expect(slopeSpeedFactor(-15)).toBeGreaterThan(1.05);
  });
  it('chute : rien sous 4 m, roulade jusqu’à 14 m, secours au-delà', () => {
    expect(fallOutcome(3).kind).toBe('rien');
    expect(fallOutcome(6)).toEqual({ halves: 1, kind: 'roulade' });
    expect(fallOutcome(10)).toEqual({ halves: 2, kind: 'roulade' });
    expect(fallOutcome(20)).toEqual({ halves: MONTAGNE.fall.rescueHalves, kind: 'secours' });
  });
  it('endurance : se vide en courant, se recharge au repos, plus lentement dans le froid', () => {
    const s = new Stamina();
    for (let t = 0; t < 20; t += DT) s.update(DT, MONTAGNE.stamina.run, true);
    expect(s.value).toBe(0);
    expect(s.canEffort).toBe(false);
    const warm = new Stamina(), cold = new Stamina();
    warm.value = cold.value = 0;
    for (let t = 0; t < 3; t += DT) { warm.update(DT, 0, false, 1); cold.update(DT, 0, false, 0.6); }
    expect(warm.value).toBeGreaterThan(cold.value);
    expect(cold.value).toBeGreaterThan(0);
  });
});

describe('montée réelle du capybara', () => {
  it('gravit 100 m de dénivelé sur une pente de 30° en environ 2 minutes (au lieu de 24 s sans la règle)', () => {
    const h = (x: number) => 50 + Math.max(0, x) * T30;
    const p = spawn(0, 0, h);
    const { input } = fakeInput();
    let t = 0;
    while (p.pos.y < 150 && t < 400) { p.update(DT, input, EAST, t); t += DT; }
    console.log(`100 m de dénivelé à 30° : ${t.toFixed(1)} s (vitesse ${p.speed.toFixed(2)} m/s)`);
    expect(p.pos.y).toBeGreaterThanOrEqual(150);
    expect(t).toBeGreaterThan(95);
    expect(t).toBeLessThan(140);
  });
  it('en courant, monte plus vite au début mais l’endurance s’épuise', () => {
    const h = (x: number) => 50 + Math.max(0, x) * Math.tan((20 * Math.PI) / 180);
    const p = spawn(0, 0, h);
    const { input } = fakeInput({ run: true });
    let t = 0, minSt = 100;
    while (p.pos.y < 150 && t < 400) { p.update(DT, input, EAST, t); t += DT; minSt = Math.min(minSt, p.stamina.value); }
    console.log(`100 m de dénivelé à 20° en courant : ${t.toFixed(1)} s, endurance minimale ${minSt.toFixed(0)}`);
    expect(minSt).toBe(0);
    expect(t).toBeLessThan(110);
  });
  it('marche normalement sur le plat (4,2 m/s)', () => {
    const p = spawn(0, 0, () => 50);
    const { input } = fakeInput();
    for (let i = 0; i < 60; i++) p.update(DT, input, EAST, i * DT);
    expect(p.speed).toBeCloseTo(4.2, 1);
  });
});

describe('mur à 70°', () => {
  // plat jusqu'à x = 10, puis paroi à 70° de `H` m, puis plat
  const wall = (H: number) => (x: number) => 50 + Math.min(H, Math.max(0, x - 10) * T70);
  it('est infranchissable à pied sans escalade : le capybara glisse et reste en bas', () => {
    const p = spawn(0, 0, wall(25));
    mountainTerrain.rock = () => 0; // pas de roche grimpable
    const { input } = fakeInput({ run: true });
    let maxY = 0, slid = false;
    for (let i = 0; i < 30 * 20; i++) {
      p.update(DT, input, EAST, i * DT);
      maxY = Math.max(maxY, p.pos.y - 50);
      slid ||= p.sliding;
      // on essaie aussi de sauter contre la paroi
      if (i % 20 === 0) (input as unknown as { consume: (a: string) => boolean }).consume = (a) => a === 'jump';
      else (input as unknown as { consume: () => boolean }).consume = () => false;
    }
    console.log(`mur de 70° sans escalade : hauteur maximale atteinte ${maxY.toFixed(2)} m, glissade ${slid}`);
    expect(maxY).toBeLessThan(2.5);
    expect(p.pos.y - 50).toBeLessThan(1);
  });
  it('se grimpe lentement sur la roche (8 m) en consommant de l’endurance', () => {
    const p = spawn(0, 0, wall(8));
    mountainTerrain.rock = () => 1;
    const { input } = fakeInput();
    let t = 0, climbed = false, minSt = 100;
    while (p.pos.y < 57.9 && t < 60) { p.update(DT, input, EAST, t); t += DT; climbed ||= p.climbing; minSt = Math.min(minSt, p.stamina.value); }
    console.log(`paroi rocheuse de 8 m à 70° : ${t.toFixed(1)} s d'escalade, endurance minimale ${minSt.toFixed(0)}`);
    expect(climbed).toBe(true);
    expect(p.pos.y).toBeGreaterThan(57.9);
    expect(minSt).toBeLessThan(60);
  });
  it('trop haute (25 m) : l’endurance se vide et le capybara glisse sans atteindre le haut', () => {
    const p = spawn(0, 0, wall(25));
    mountainTerrain.rock = () => 1;
    const { input } = fakeInput();
    let maxY = 0, emptied = false;
    for (let i = 0; i < 30 * 40; i++) { p.update(DT, input, EAST, i * DT); maxY = Math.max(maxY, p.pos.y - 50); emptied ||= p.stamina.value === 0; }
    console.log(`paroi rocheuse de 25 m : hauteur maximale ${maxY.toFixed(1)} m`);
    expect(emptied).toBe(true);
    expect(maxY).toBeLessThan(25);
  });
});

describe('chute', () => {
  const ledge = (drop: number) => (x: number) => (x < 0 ? 50 + drop : 50);
  it('10 m : roulade, se relève, 2 demi-cœurs en moins', () => {
    const p = spawn(-6, 0, ledge(10));
    const falls: [number, string][] = [];
    p.onFall = (n, k) => falls.push([n, k]);
    const { input } = fakeInput();
    let rolled = false;
    for (let i = 0; i < 150; i++) { p.update(DT, input, EAST, i * DT); rolled ||= p.rollT > 0; }
    console.log('chute de 10 m :', JSON.stringify(falls));
    expect(falls).toEqual([[2, 'roulade']]);
    expect(rolled).toBe(true);
    expect(p.pos.x).toBeGreaterThan(0);
    expect(p.rollT).toBe(0); // relevé
  });
  it('3 m : rien', () => {
    const p = spawn(-6, 0, ledge(3));
    const falls: unknown[] = [];
    p.onFall = (n, k) => falls.push([n, k]);
    const { input } = fakeInput();
    for (let i = 0; i < 60; i++) p.update(DT, input, EAST, i * DT);
    expect(falls).toEqual([]);
  });
  it('25 m : fondu et retour au dernier point sûr, en haut', () => {
    const p = spawn(-8, 0, ledge(25));
    const falls: [number, string][] = [];
    p.onFall = (n, k) => falls.push([n, k]);
    const { st, input } = fakeInput();
    let fade = 0;
    for (let i = 0; i < 150; i++) {
      p.update(DT, input, EAST, i * DT);
      fade = Math.max(fade, p.rescueFade);
      if (p.rescueT >= 0) st.y = 0; // on lâche la commande pendant le fondu
    }
    console.log('chute de 25 m :', JSON.stringify(falls), 'arrivée', p.pos.x.toFixed(1), p.pos.y.toFixed(1));
    expect(falls).toEqual([[MONTAGNE.fall.rescueHalves, 'secours']]);
    expect(fade).toBeGreaterThan(0.9);
    expect(p.pos.y).toBeCloseTo(75, 0);
    expect(p.pos.x).toBeLessThan(0);
    expect(p.rescueT).toBe(-1);
  });
});

describe('chaleur', () => {
  it('baisse en altitude et la nuit, remonte près d’un feu', () => {
    expect(warmthRate(300, 0, 0, 0)).toBeGreaterThan(0); // vallée de jour : on se réchauffe
    expect(warmthRate(1100, 0, 0, 0)).toBeLessThan(0);
    expect(warmthRate(1100, 1, 0, 0)).toBeLessThan(warmthRate(1100, 0, 0, 0));
    const p = spawn(0, 0, () => 1150);
    p.climate = { night: () => 1, heatAt: () => 0 };
    const { input } = fakeInput({ y: 0 });
    for (let i = 0; i < 30 * 60; i++) p.update(DT, input, EAST, i * DT);
    const cold = p.warmth.value;
    console.log(`une minute de nuit à 1 150 m : chaleur ${cold.toFixed(0)} / 100`);
    expect(cold).toBeLessThan(60);
    p.climate = { night: () => 1, heatAt: () => 1 }; // près d'un feu
    let t = 0;
    while (p.warmth.value < 99 && t < 60) { p.update(DT, input, EAST, t); t += DT; }
    console.log(`remontée près du feu : ${t.toFixed(1)} s`);
    expect(p.warmth.value).toBeGreaterThanOrEqual(99);
    expect(t).toBeLessThan(10);
  });
  it('hors mode survie, le froid ne fait aucun dégât ni ne déplace le capybara', () => {
    const p = spawn(0, 0, () => 1250);
    p.climate = { night: () => 1, heatAt: () => 0 };
    let hurt = 0;
    p.onColdHurt = (n) => (hurt += n);
    const { input } = fakeInput({ y: 0 });
    for (let i = 0; i < 30 * 600; i++) p.update(DT, input, EAST, i * DT);
    expect(p.warmth.value).toBe(0);
    expect(hurt).toBe(0);
    expect(p.rescueT).toBe(-1);
    expect(p.pos.x).toBeCloseTo(0, 3);
    // mode survie (option à venir) : le froid coûte alors de la vie
    p.survival = true;
    for (let i = 0; i < 30 * 45; i++) p.update(DT, input, EAST, i * DT);
    expect(hurt).toBe(2);
  });
  it('avec le manteau d’hiver, le froid disparaît jusqu’au sommet', () => {
    const p = spawn(0, 0, () => 1250);
    p.climate = { night: () => 1, heatAt: () => 0 };
    p.winterCoat = true;
    const { input } = fakeInput({ y: 0 });
    for (let i = 0; i < 30 * 120; i++) p.update(DT, input, EAST, i * DT);
    expect(p.warmth.value).toBe(100);
    const w = new Warmth();
    w.value = 10;
    expect(w.regenFactor).toBeLessThan(1);
  });
});
