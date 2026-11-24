// HUD et effets de montagne (spécialité Montagne) : anneau d'endurance près du capybara, jauge de chaleur sous les cœurs,
// givre au bord de l'écran, souffle visible, poudre de glissade et fondu doux du retour au point sûr.
import './mountain.css';
import * as THREE from 'three';
import type { Player } from '../gameplay/player';
import { MONTAGNE, mountainTerrain, warmthRate } from '../gameplay/mountain';

const R = 15, CIRC = 2 * Math.PI * R;

/** Texture de givre (cristaux ramifiés depuis les bords), dessinée une fois. */
function frostTexture(w = 1024, h = 576) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  // voile laiteux sur les bords
  const grad = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.hypot(w, h) * 0.55);
  grad.addColorStop(0, 'rgba(220,238,255,0)');
  grad.addColorStop(0.65, 'rgba(220,238,255,0.18)');
  grad.addColorStop(1, 'rgba(240,248,255,0.75)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // cristaux : branches qui partent des bords vers le centre
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.lineCap = 'round';
  const branch = (x: number, y: number, a: number, len: number, depth: number) => {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    g.strokeStyle = `rgba(255,255,255,${0.25 + 0.12 * depth})`;
    g.lineWidth = 0.6 + depth * 0.5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x2, y2);
    g.stroke();
    if (depth <= 0) return;
    for (let k = 0; k < 3; k++) {
      const t = 0.3 + rnd() * 0.6;
      const bx = x + (x2 - x) * t, by = y + (y2 - y) * t;
      branch(bx, by, a + (rnd() < 0.5 ? -1 : 1) * (0.7 + rnd() * 0.5), len * (0.35 + rnd() * 0.25), depth - 1);
    }
  };
  for (let i = 0; i < 70; i++) {
    const side = i % 4;
    const u = rnd();
    const [x, y] = side === 0 ? [u * w, 0] : side === 1 ? [w, u * h] : side === 2 ? [u * w, h] : [0, u * h];
    const a = Math.atan2(h / 2 - y, w / 2 - x) + (rnd() - 0.5) * 0.9;
    branch(x, y, a, 40 + rnd() * 90, 3);
  }
  return c.toDataURL();
}

/** Petite texture ronde et douce pour le souffle et la poudre. */
function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Puff { s: THREE.Sprite; vel: THREE.Vector3; life: number; max: number; size: number; alpha: number }

export class MountainHud {
  private ring: SVGSVGElement;
  private ringVal: SVGCircleElement;
  private warm: HTMLDivElement;
  private warmBar: HTMLDivElement;
  private warmIco: HTMLSpanElement;
  private frost: HTMLDivElement;
  private fade: HTMLDivElement;
  private group = new THREE.Group();
  private puffs: Puff[] = [];
  private tex = puffTexture();
  private breathT = 0;
  private dustT = 0;
  private ringShown = false;
  private v = new THREE.Vector3();
  private frostLevel = 0;

  constructor(scene: THREE.Scene, parent: HTMLElement | null = document.getElementById('hud')) {
    const host = parent ?? document.body;
    const ns = 'http://www.w3.org/2000/svg';
    this.ring = document.createElementNS(ns, 'svg');
    this.ring.id = 'stamina-ring';
    this.ring.setAttribute('viewBox', '0 0 38 38');
    this.ring.innerHTML = `<circle class="track" cx="19" cy="19" r="${R}"/><circle class="val" cx="19" cy="19" r="${R}" stroke-dasharray="${CIRC}" stroke-dashoffset="0"/>`;
    this.ringVal = this.ring.querySelector('.val')!;
    host.appendChild(this.ring);
    this.warm = document.createElement('div');
    this.warm.id = 'warmth';
    this.warm.setAttribute('aria-label', 'Chaleur');
    this.warm.innerHTML = '<span class="ico">❄</span><div class="bar"><div></div></div>';
    this.warmBar = this.warm.querySelector('.bar > div')!;
    this.warmIco = this.warm.querySelector('.ico')!;
    host.appendChild(this.warm);
    const app = document.getElementById('app') ?? document.body;
    this.frost = document.createElement('div');
    this.frost.id = 'frost';
    this.frost.style.backgroundImage = `url(${frostTexture()})`;
    app.appendChild(this.frost);
    this.fade = document.createElement('div');
    this.fade.id = 'rescue-fade';
    app.appendChild(this.fade);
    scene.add(this.group);
  }

  update(dt: number, player: Player, camera: THREE.Camera, night: number, visible: boolean) {
    const on = visible && !player.vehicle;
    // anneau d'endurance : à côté du capybara, seulement quand il n'est pas plein
    const st = player.stamina;
    const showRing = on && (st.ratio < 0.995 || player.climbing);
    if (showRing) {
      this.v.copy(player.pos).add(new THREE.Vector3(0, 0.9, 0)).project(camera);
      if (this.v.z < 1) {
        const x = (this.v.x * 0.5 + 0.5) * window.innerWidth + 46, y = (-this.v.y * 0.5 + 0.5) * window.innerHeight - 10;
        this.ring.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      }
      this.ringVal.setAttribute('stroke-dashoffset', (CIRC * (1 - st.ratio)).toFixed(2));
      this.ring.classList.toggle('low', st.ratio < 0.3 && !st.exhausted);
      this.ring.classList.toggle('empty', st.exhausted);
    }
    if (showRing !== this.ringShown) { this.ring.classList.toggle('on', showRing); this.ringShown = showRing; }

    // jauge de chaleur : visible dès qu'il fait froid ou qu'elle n'est pas pleine
    const w = player.warmth;
    const ambient = warmthRate(player.pos.y, night, 0, 0); // froid de l'air, tenue mise à part
    const cold = ambient < 0;
    this.warm.classList.toggle('on', on && (w.value < 99.5 || (cold && player.warmthGear < 1) || (cold && player.winterCoat)));
    this.warm.classList.toggle('cold', w.value < MONTAGNE.cold.shiverBelow);
    this.warm.classList.toggle('coat', player.winterCoat);
    this.warmIco.textContent = player.winterCoat ? '🧥' : player.heat > 0.05 ? '🔥' : '❄';
    this.warmBar.style.width = `${w.value.toFixed(1)}%`;
    // givre au bord de l'écran
    this.frostLevel += ((on ? w.frost : 0) - this.frostLevel) * Math.min(1, dt * 2);
    this.frost.style.opacity = this.frostLevel.toFixed(3);
    // fondu doux du retour au point sûr
    this.fade.style.opacity = player.rescueFade.toFixed(3);

    // souffle visible dans l'air froid (même avec le manteau : c'est l'air qui est froid)
    if (on && cold && player.state !== 'swim') {
      this.breathT -= dt;
      const pace = player.climbing || st.ratio < 0.5 ? 0.9 : 1.7;
      if (this.breathT <= 0) {
        this.breathT = pace;
        const fwd = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
        const nose = player.pos.clone().add(new THREE.Vector3(0, player.climbing ? 0.45 : 0.62, 0)).addScaledVector(fwd, 0.42);
        for (let i = 0; i < 3; i++)
          this.emit(nose, fwd.clone().multiplyScalar(0.5 + i * 0.12).add(new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.12, (Math.random() - 0.5) * 0.1)), 1.1, 0.12, 0.32, 0xf4f8ff);
      }
    }
    // poudre de glissade (neige ou terre)
    if (on && player.sliding && player.speed > 1) {
      this.dustT -= dt;
      if (this.dustT <= 0) {
        this.dustT = 0.06;
        const snow = mountainTerrain.snow(player.pos.x, player.pos.z) > 0.4;
        const p = player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.1, (Math.random() - 0.5) * 0.4));
        this.emit(p, new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8), 0.8, 0.25, snow ? 0.55 : 0.4, snow ? 0xffffff : 0xc9b08a);
      }
    }
    // particules
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const q = this.puffs[i];
      q.life += dt;
      const u = q.life / q.max;
      if (u >= 1) { this.group.remove(q.s); q.s.material.dispose(); this.puffs.splice(i, 1); continue; }
      q.s.position.addScaledVector(q.vel, dt);
      q.vel.multiplyScalar(1 - dt * 1.5);
      q.s.scale.setScalar(q.size * (1 + u * 2.2));
      q.s.material.opacity = q.alpha * (1 - u) * Math.min(1, u * 6);
    }
  }

  private emit(p: THREE.Vector3, vel: THREE.Vector3, life: number, size: number, alpha: number, color: number) {
    if (this.puffs.length > 80) return;
    const m = new THREE.SpriteMaterial({ map: this.tex, color, transparent: true, depthWrite: false, opacity: 0 });
    const s = new THREE.Sprite(m);
    s.position.copy(p);
    s.scale.setScalar(size);
    this.group.add(s);
    this.puffs.push({ s, vel, life: 0, max: life, size, alpha });
  }
}
