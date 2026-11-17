import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MissionRunner, Mission, goto, collect, checkpoints, GameAPI } from '../src/gameplay/missions';
import { addBox, resolveCircle, groundAt, clearPhysics } from '../src/world/physics';
import { Rng, angleDiff, smoothstep } from '../src/core/math';
import { loadSave, defaultSave } from '../src/core/save';
import { REGIONS, nearestRegion, ROADS, sampleRoad } from '../src/world/layout';

function fakeApi(pos: THREE.Vector3, vehicle: string | null = null): GameAPI {
  return {
    playerPos: () => pos,
    vehicleType: () => vehicle as any,
    npcPos: () => new THREE.Vector3(),
    content: () => ({}) as any,
    lastPhoto: () => null,
    time: () => 0,
  };
}

describe('missions', () => {
  it('enchaîne les étapes et termine la mission', () => {
    const pos = new THREE.Vector3(0, 0, 0);
    const api = fakeApi(pos);
    const items = [new THREE.Vector3(10, 0, 0), new THREE.Vector3(20, 0, 0)];
    const m: Mission = {
      id: 't', title: 'Test', region: 'hub', giver: 'x', intro: [], outro: [], reward: 5,
      steps: () => [goto('aller', () => new THREE.Vector3(5, 0, 0), 2), collect('ramasser', items, 'yuzu')],
    };
    const r = new MissionRunner();
    let done = false;
    r.onComplete = () => (done = true);
    r.start(m, api);
    r.update(api, 0.1);
    expect(r.stepIndex).toBe(0);
    pos.set(5, 0, 0);
    r.update(api, 0.1);
    expect(r.stepIndex).toBe(1);
    pos.set(10, 0, 0);
    r.update(api, 0.1);
    expect(r.view(api)?.progress).toBe('1 / 2');
    pos.set(20, 0, 0);
    r.update(api, 0.1);
    expect(done).toBe(true);
    expect(r.mission).toBeNull();
  });

  it('les checkpoints exigent le bon véhicule', () => {
    const pos = new THREE.Vector3(0, 0, 0);
    let veh: string | null = null;
    const api: GameAPI = { ...fakeApi(pos), vehicleType: () => veh as any };
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(50, 0, 0)];
    const m: Mission = { id: 'c', title: 'C', region: 'hub', giver: 'x', intro: [], outro: [], reward: 1, steps: () => [checkpoints('course', () => pts, 'boat')] };
    const r = new MissionRunner();
    r.start(m, api);
    r.update(api, 0.1);
    expect(r.state.idx).toBe(0);
    veh = 'boat';
    r.update(api, 0.1);
    expect(r.state.idx).toBe(1);
  });
});

describe('physique', () => {
  it('repousse hors d’une boîte et permet de marcher dessus', () => {
    clearPhysics();
    addBox(0, 0, 4, 4, 0, 2, 0, true);
    const r = resolveCircle(1.5, 0, 0, 0.5, 1);
    expect(r.hit).toBe(true);
    expect(Math.abs(r.x)).toBeGreaterThanOrEqual(2.49);
    expect(groundAt(0, 0, 3)).toBeCloseTo(2);
    expect(groundAt(0, 0, 0)).toBeCloseTo(0);
  });
  it('boîte tournée', () => {
    clearPhysics();
    addBox(0, 0, 10, 1, 0, 3, Math.PI / 2);
    expect(resolveCircle(0, 3, 0, 0.4, 1).hit).toBe(true);
    expect(resolveCircle(3, 0, 0, 0.4, 1).hit).toBe(false);
  });
});

describe('outils', () => {
  it('aléatoire déterministe', () => {
    const a = new Rng(5), b = new Rng(5);
    expect(a.next()).toBe(b.next());
  });
  it('angles et interpolation', () => {
    expect(angleDiff(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(-0.2);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
    expect(smoothstep(80, 58, 40)).toBe(1);
  });
  it('sauvegarde par défaut sans navigateur', () => {
    const s = loadSave();
    expect(s.coins).toBe(defaultSave().coins);
    expect(s.hats).toContain('yuzu');
  });
  it('monde : 7 régions et des routes', () => {
    expect(REGIONS.length).toBe(7);
    expect(nearestRegion(0, -800).id).toBe('paris');
    expect(ROADS.length).toBe(12);
    expect(sampleRoad(ROADS[0]).length).toBeGreaterThan(50);
  });
});
