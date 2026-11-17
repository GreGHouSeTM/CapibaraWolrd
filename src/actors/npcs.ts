// Personnages non joueurs : donneurs de missions, promeneurs, pingouins, bébés capybaras cachés.
import * as THREE from 'three';
import { Capybara } from './capybara';
import { NpcDef } from '../regions/common';
import { Rng, dampAngle } from '../core/math';
import { groundAt } from '../world/physics';

export function makePenguin() {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.5 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf8f8f4, roughness: 0.6 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xff9a1a, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 16), black);
  body.scale.set(1, 1.45, 0.95);
  body.position.y = 0.48;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 16), white);
  belly.scale.set(0.95, 1.35, 0.8);
  belly.position.set(0, 0.45, 0.09);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), black);
  head.position.y = 0.98;
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 8), orange);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.95, 0.22);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), white);
    eye.position.set(s * 0.08, 1.02, 0.16);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), black);
    pupil.position.set(s * 0.08, 1.02, 0.19);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.18), orange);
    foot.position.set(s * 0.1, 0.02, 0.05);
    const wing = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), black);
    wing.scale.set(0.3, 1.4, 0.8);
    wing.position.set(s * 0.32, 0.55, 0);
    wing.name = 'wing';
    g.add(eye, pupil, foot, wing);
  }
  g.add(body, belly, head, beak);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

export interface Npc {
  def: NpcDef;
  obj: THREE.Object3D;
  capy: Capybara | null;
  yaw: number;
  bang: THREE.Sprite | null;
}

function bangSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffd23b';
  g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#7a4a00'; g.lineWidth = 8; g.stroke();
  g.fillStyle = '#3a2200'; g.font = 'bold 84px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('!', 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.setScalar(0.8);
  s.renderOrder = 10;
  return s;
}

export class NpcManager {
  group = new THREE.Group();
  list: Npc[] = [];
  walkers: { capy: Capybara; path: THREE.Vector3[]; i: number; pos: THREE.Vector3; yaw: number; wait: number }[] = [];

  add(def: NpcDef) {
    let obj: THREE.Object3D, capy: Capybara | null = null;
    if (def.kind === 'penguin') obj = makePenguin();
    else {
      capy = new Capybara({ fur: def.fur, hat: def.hat, scarf: def.scarf ?? null, size: def.size ?? 1 });
      obj = capy.root;
    }
    obj.position.copy(def.pos);
    obj.position.y = groundAt(def.pos.x, def.pos.z, def.pos.y + 1);
    const npc: Npc = { def, obj, capy, yaw: def.rot ?? Math.random() * 6, bang: null };
    this.group.add(obj);
    this.list.push(npc);
    return npc;
  }

  setMissionFlag(id: string, on: boolean) {
    const n = this.list.find((x) => x.def.id === id);
    if (!n) return;
    if (on && !n.bang) {
      n.bang = bangSprite();
      n.bang.position.set(0, 1.6, 0);
      n.obj.add(n.bang);
    } else if (!on && n.bang) {
      n.obj.remove(n.bang);
      n.bang = null;
    }
  }

  get(id: string) {
    return this.list.find((n) => n.def.id === id);
  }

  addWalkers(points: THREE.Vector3[], count: number, seed: number) {
    if (points.length < 4) return;
    const rng = new Rng(seed);
    const furs = [0x9b6a43, 0x8a5a33, 0xa87a52, 0x7a5232, 0xb58a60, 0x6e4a30];
    const hats = ['none', 'none', 'beret', 'cap', 'tophat', 'flower', 'yuzu', 'none'] as const;
    for (let k = 0; k < count; k++) {
      const capy = new Capybara({ fur: rng.pick(furs), hat: rng.pick(hats), size: rng.range(0.85, 1.1), scarf: rng.chance(0.4) ? rng.pick([0xc8303a, 0x2a5a8a, 0xffd23b, 0x3a8a4a]) : null });
      const path: THREE.Vector3[] = [];
      let p = rng.pick(points);
      for (let i = 0; i < 5; i++) {
        path.push(p);
        const cand = points.filter((q) => q !== p && q.distanceTo(p) < 70);
        p = cand.length ? rng.pick(cand) : rng.pick(points);
      }
      const pos = path[0].clone();
      capy.root.position.copy(pos);
      this.group.add(capy.root);
      this.walkers.push({ capy, path, i: 1, pos, yaw: 0, wait: rng.range(0, 3) });
    }
  }

  update(dt: number, time: number, player: THREE.Vector3) {
    for (const n of this.list) {
      const d = n.obj.position.distanceTo(player);
      n.obj.visible = d < 260;
      if (!n.obj.visible) continue;
      const target = d < 8 ? Math.atan2(player.x - n.obj.position.x, player.z - n.obj.position.z) : n.yaw;
      n.obj.rotation.y = dampAngle(n.obj.rotation.y, target, 4, dt);
      if (n.capy) n.capy.animate(dt, 0, 'ground', time + n.def.pos.x);
      else {
        // pingouin qui se dandine
        n.obj.rotation.z = Math.sin(time * 4 + n.def.pos.x) * 0.08;
        n.obj.children.filter((c) => c.name === 'wing').forEach((w, i) => (w.rotation.z = Math.sin(time * 6 + i) * 0.3));
      }
      if (n.bang) n.bang.position.y = 1.6 + Math.sin(time * 3) * 0.1;
    }
    for (const w of this.walkers) {
      const d = w.pos.distanceTo(player);
      w.capy.root.visible = d < 220;
      if (!w.capy.root.visible) continue;
      let speed = 0;
      if (w.wait > 0) w.wait -= dt;
      else {
        const t = w.path[w.i];
        const dx = t.x - w.pos.x, dz = t.z - w.pos.z;
        const l = Math.hypot(dx, dz);
        if (l < 0.6) {
          w.i = (w.i + 1) % w.path.length;
          w.wait = Math.random() < 0.4 ? 2 + Math.random() * 3 : 0;
        } else if (d > 1.4) {
          speed = 1.6;
          w.pos.x += (dx / l) * speed * dt;
          w.pos.z += (dz / l) * speed * dt;
          w.yaw = dampAngle(w.yaw, Math.atan2(dx, dz), 6, dt);
          w.pos.y = groundAt(w.pos.x, w.pos.z, w.pos.y + 0.6);
        }
      }
      w.capy.root.position.copy(w.pos);
      w.capy.root.rotation.y = w.yaw;
      w.capy.animate(dt, speed, 'ground', time);
    }
  }
}
