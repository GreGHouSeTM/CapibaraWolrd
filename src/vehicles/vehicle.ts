// Véhicules : modèles procéduraux et conduite « arcade » adaptée aux enfants.
import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp } from '../core/math';
import { groundAt, resolveCircle } from '../world/physics';
import { WATER_LEVEL } from '../world/layout';
import { std, nightMaterials } from '../procgen/kit';
import { signTexture } from '../procgen/facades';
import type { VehicleType } from '../regions/common';

export interface VehicleSpec {
  name: string;
  maxSpeed: number;
  accel: number;
  turn: number;
  radius: number;
  seat: THREE.Vector3;
  camDist: number;
  camHeight: number;
  boat?: boolean;
  wheelBase: number;
  track: number;
  sitStyle: 'inside' | 'ride';
}

export const SPECS: Record<VehicleType, VehicleSpec> = {
  car: { name: 'Cabriolet', maxSpeed: 30, accel: 11, turn: 1.9, radius: 1.6, seat: new THREE.Vector3(0.35, 0.42, -0.25), camDist: 9, camHeight: 3.2, wheelBase: 2.5, track: 1.6, sitStyle: 'inside' },
  taxi: { name: 'Taxi', maxSpeed: 30, accel: 11, turn: 1.8, radius: 1.7, seat: new THREE.Vector3(0.35, 0.42, -0.1), camDist: 9.5, camHeight: 3.4, wheelBase: 2.6, track: 1.6, sitStyle: 'inside' },
  jeep: { name: 'Jeep des sables', maxSpeed: 27, accel: 10, turn: 1.8, radius: 1.7, seat: new THREE.Vector3(0.38, 0.62, -0.2), camDist: 9.5, camHeight: 3.4, wheelBase: 2.5, track: 1.7, sitStyle: 'inside' },
  bus: { name: 'Bus à impériale', maxSpeed: 20, accel: 6, turn: 1.1, radius: 2.4, seat: new THREE.Vector3(0.6, 1.2, 3.6), camDist: 15, camHeight: 5.5, wheelBase: 6, track: 2.2, sitStyle: 'inside' },
  scooter: { name: 'Scooter', maxSpeed: 22, accel: 12, turn: 2.6, radius: 0.9, seat: new THREE.Vector3(0, 0.62, -0.25), camDist: 6.5, camHeight: 2.4, wheelBase: 1.3, track: 0.1, sitStyle: 'ride' },
  snowmobile: { name: 'Motoneige', maxSpeed: 26, accel: 12, turn: 2.2, radius: 1.2, seat: new THREE.Vector3(0, 0.75, -0.3), camDist: 7.5, camHeight: 2.8, wheelBase: 2.2, track: 1, sitStyle: 'ride' },
  boat: { name: 'Bateau', maxSpeed: 22, accel: 8, turn: 1.4, radius: 2, seat: new THREE.Vector3(0, 0.55, -0.7), camDist: 10, camHeight: 3.6, boat: true, wheelBase: 3.5, track: 1.5, sitStyle: 'ride' },
};

// ----------------------------------------------------------------------------- matériaux partagés
const tireMat = std(0x161616, 0.85);
const rimMat = std(0xd0d4d8, 0.25, 1);
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x1a2430, roughness: 0.05, metalness: 0.1, clearcoat: 1, transparent: true, opacity: 0.55 });
const chrome = std(0xe0e4e8, 0.15, 1);
const black = std(0x1c1c1e, 0.6);
const seatMat = std(0x7a3a20, 0.7);
const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d0, emissiveIntensity: 0.4, roughness: 0.2 });
headMat.userData.emissiveBoost = 3;
headMat.userData.baseEmissive = 0.2;
nightMaterials.push(headMat);
const tailMat = new THREE.MeshStandardMaterial({ color: 0xa01010, emissive: 0xff2020, emissiveIntensity: 0.3, roughness: 0.3 });
tailMat.userData.emissiveBoost = 2;
tailMat.userData.baseEmissive = 0.2;
nightMaterials.push(tailMat);

const paint = (color: number) => new THREE.MeshPhysicalMaterial({ color, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });

function wheel(r: number, w: number) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 20), tireMat);
  tire.rotation.z = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.02, 14), rimMat);
  rim.rotation.z = Math.PI / 2;
  g.add(tire, rim);
  return g;
}

function profileBody(pts: [number, number][], width: number, mat: THREE.Material, bevel = 0.08) {
  const s = new THREE.Shape();
  pts.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  return new THREE.Mesh(g, mat);
}

export function buildVehicleModel(type: VehicleType, color?: number) {
  const g = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  const addWheels = (positions: [number, number, number][], r: number, w: number) => {
    for (const p of positions) {
      const wh = wheel(r, w);
      wh.position.set(...p);
      g.add(wh);
      wheels.push(wh);
    }
  };
  switch (type) {
    case 'car':
    case 'taxi':
    case 'jeep': {
      const body = paint(color ?? (type === 'taxi' ? 0xf5c400 : type === 'jeep' ? 0xc8a86a : 0x3fa8d8));
      const roof = type === 'taxi';
      const pts: [number, number][] = type === 'jeep'
        ? [[-1.85, 0.45], [-1.9, 1.2], [-0.9, 1.25], [0.6, 1.25], [0.95, 1.2], [1.85, 1.15], [1.95, 0.8], [1.9, 0.45]]
        : [[-1.9, 0.32], [-1.98, 0.78], [-1.75, 0.95], [-1.0, 0.98], [0.75, 0.98], [1.75, 0.82], [1.98, 0.6], [1.92, 0.32]];
      g.add(profileBody(pts, 1.72, body));
      if (roof) {
        const cabin = profileBody([[-1.15, 0.95], [-0.85, 1.42], [0.42, 1.45], [0.92, 0.95]], 1.6, body, 0.06);
        g.add(cabin);
        const win = profileBody([[-1.08, 0.98], [-0.82, 1.36], [0.38, 1.39], [0.84, 0.98]], 1.64, glassMat, 0.04);
        g.add(win);
        const ts = signTexture(['TAXI'], '#ffe680', '#1a1a1a', 256, 96);
        const tm = new THREE.MeshStandardMaterial({ map: ts.map, emissiveMap: ts.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.5 });
        const sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.28, 0.3), tm);
        sign.position.set(0, 1.6, -0.2);
        sign.rotation.y = Math.PI / 2;
        g.add(sign);
        // damier
        const check = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.12, 2.2), std(0x111111, 0.5));
        check.position.set(0, 0.7, 0.1);
        g.add(check);
      } else {
        // pare-brise de cabriolet
        const ws = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.05), glassMat);
        ws.position.set(0, 1.2, 0.72);
        ws.rotation.x = -0.45;
        g.add(ws);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.05, 0.07), chrome);
        frame.position.set(0, 1.43, 0.62);
        g.add(frame);
        // sièges
        for (const sx of [-0.4, 0.4]) {
          const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.15), seatMat);
          back.position.set(sx, 1.05, -0.55);
          back.rotation.x = -0.15;
          g.add(back);
        }
        if (type === 'jeep') {
          const bar = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.05, 6, 16, Math.PI), black);
          bar.position.set(0, 1.25, -0.6);
          g.add(bar);
          const spare = wheel(0.38, 0.25);
          spare.rotation.y = Math.PI / 2;
          spare.position.set(0, 1.0, -2.05);
          g.add(spare);
        }
      }
      // phares et feux
      for (const sx of [-0.62, 0.62]) {
        const h = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), headMat);
        h.position.set(sx, 0.68, 1.96);
        h.scale.z = 0.4;
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.05), tailMat);
        t.position.set(sx, 0.72, -1.99);
        g.add(h, t);
      }
      const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.12), chrome);
      bumperF.position.set(0, 0.38, 1.98);
      const bumperR = bumperF.clone();
      bumperR.position.z = -1.98;
      g.add(bumperF, bumperR);
      const r = type === 'jeep' ? 0.42 : 0.34;
      addWheels([[0.83, r, 1.25], [-0.83, r, 1.25], [0.83, r, -1.25], [-0.83, r, -1.25]], r, 0.26);
      break;
    }
    case 'bus': {
      const red = paint(0xc8102e);
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3.8, 9.6), red);
      body.position.y = 2.35;
      g.add(body);
      const winTex = signTexture([''], '#20262c', '#20262c', 64, 64, false);
      void winTex;
      for (const yy of [1.95, 3.45])
        for (const sx of [-1.26, 1.26]) {
          const w = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.85, 8.6), glassMat);
          w.position.set(sx, yy, 0);
          g.add(w);
        }
      const front = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.4, 0.02), glassMat);
      front.position.set(0, 2.6, 4.81);
      g.add(front);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.52, 0.18, 9.62), std(0xf0e6c0, 0.6));
      stripe.position.y = 2.7;
      g.add(stripe);
      const sign = signTexture(['CAPYVILLE ★ 11'], '#101010', '#ffcf3a', 512, 64);
      const sm = new THREE.MeshStandardMaterial({ map: sign.map, emissiveMap: sign.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.6 });
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.3), sm);
      sg.position.set(0, 3.95, 4.82);
      g.add(sg);
      for (const sx of [-0.9, 0.9]) {
        const h = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), headMat);
        h.position.set(sx, 0.9, 4.81);
        g.add(h);
      }
      addWheels([[1.1, 0.5, 3.2], [-1.1, 0.5, 3.2], [1.1, 0.5, -3], [-1.1, 0.5, -3]], 0.5, 0.35);
      break;
    }
    case 'scooter': {
      const mint = paint(color ?? 0x8fd8c0);
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 6, 12), mint);
      body.rotation.x = Math.PI / 2;
      body.position.set(0, 0.42, -0.2);
      body.scale.set(1, 1, 0.8);
      const front = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.9, 0.12), mint);
      front.position.set(0, 0.7, 0.42);
      front.rotation.x = -0.25;
      const fender = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mint);
      fender.position.set(0, 0.28, 0.6);
      const seat = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.45, 4, 8), std(0x5a3a2a, 0.6));
      seat.rotation.x = Math.PI / 2;
      seat.position.set(0, 0.72, -0.28);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7), chrome);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, 1.16, 0.5);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), headMat);
      lamp.position.set(0, 1.1, 0.6);
      g.add(body, front, fender, seat, bar, lamp);
      addWheels([[0, 0.22, 0.62], [0, 0.22, -0.55]], 0.22, 0.12);
      break;
    }
    case 'snowmobile': {
      const col = paint(color ?? 0xe8402a);
      const body = profileBody([[-1.1, 0.35], [-1.1, 0.7], [0.2, 0.75], [0.9, 0.62], [1.2, 0.35]], 0.9, col, 0.1);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 1.0), black);
      seat.position.set(0, 0.86, -0.45);
      const shield = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.4, 0.04), glassMat);
      shield.position.set(0, 1.0, 0.35);
      shield.rotation.x = -0.5;
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 1.6), black);
      track.position.set(0, 0.2, -0.45);
      g.add(body, seat, shield, track);
      for (const sx of [-0.45, 0.45]) {
        const ski = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 1.3), chrome);
        ski.position.set(sx, 0.04, 0.85);
        const tip = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 10, Math.PI / 2), chrome);
        tip.rotation.y = Math.PI / 2;
        tip.position.set(sx, 0.19, 1.5);
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4), black);
        strut.position.set(sx, 0.25, 0.8);
        g.add(ski, tip, strut);
      }
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), headMat);
      h.position.set(0, 0.62, 1.15);
      g.add(h);
      break;
    }
    case 'boat': {
      const hullMat = paint(0xf6f6f2);
      const s = new THREE.Shape();
      s.moveTo(-0.95, -1.9); s.lineTo(0.95, -1.9); s.lineTo(1.0, 0.6); s.quadraticCurveTo(0.8, 1.8, 0, 2.3); s.quadraticCurveTo(-0.8, 1.8, -1.0, 0.6); s.closePath();
      const hull = new THREE.ExtrudeGeometry(s, { depth: 0.9, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 });
      hull.rotateX(Math.PI / 2);
      hull.translate(0, 0.9, 0);
      const pos = hull.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const k = lerp(0.45, 1, clamp(y / 0.9, 0, 1));
        pos.setX(i, pos.getX(i) * k);
      }
      hull.computeVertexNormals();
      g.add(new THREE.Mesh(hull, hullMat));
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.12, 3.5), std(0x1f5fa8, 0.5));
      stripe.position.set(0, 0.72, -0.1);
      g.add(stripe);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 3.2), std(0xb08a5a, 0.8));
      deck.position.set(0, 0.88, -0.2);
      const ws = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 0.04), glassMat);
      ws.position.set(0, 1.15, 0.55);
      ws.rotation.x = -0.4;
      const motor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.4), black);
      motor.position.set(0, 0.8, -2.05);
      g.add(deck, ws, motor);
      break;
    }
  }
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
  });
  return { group: g, wheels };
}

const tmpV = new THREE.Vector3();

export class Vehicle {
  root = new THREE.Group();
  model: THREE.Group;
  wheels: THREE.Object3D[];
  spec: VehicleSpec;
  speed = 0;
  yaw: number;
  pitch = 0;
  roll = 0;
  vy = 0;
  steer = 0;
  driven = false;
  pos: THREE.Vector3;
  home: THREE.Vector3;
  homeYaw: number;
  bump = 0;
  light: THREE.SpotLight | null = null;

  constructor(public type: VehicleType, pos: THREE.Vector3, yaw: number, color?: number) {
    this.spec = SPECS[type];
    const m = buildVehicleModel(type, color);
    this.model = m.group;
    this.wheels = m.wheels;
    this.root.add(this.model);
    this.pos = pos.clone();
    this.home = pos.clone();
    this.yaw = yaw;
    this.homeYaw = yaw;
    this.pos.y = this.spec.boat ? WATER_LEVEL : groundAt(pos.x, pos.z, pos.y + 2);
    this.sync();
  }

  get forward() {
    return tmpV.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  setHeadlight(on: boolean, scene: THREE.Scene) {
    if (on && !this.light) {
      this.light = new THREE.SpotLight(0xfff2d8, 60, 60, 0.55, 0.5, 1.4);
      this.light.position.set(0, 1, 1.8);
      this.light.target.position.set(0, 0, 12);
      this.model.add(this.light, this.light.target);
    } else if (!on && this.light) {
      this.model.remove(this.light, this.light.target);
      this.light.dispose();
      this.light = null;
    }
    void scene;
  }

  update(dt: number, throttle: number, steerIn: number, handbrake: boolean, others: Vehicle[]) {
    const s = this.spec;
    // accélération / freinage
    if (this.driven) {
      const target = throttle * (throttle > 0 ? s.maxSpeed : s.maxSpeed * 0.4);
      const k = Math.sign(target - this.speed) === Math.sign(this.speed) || this.speed === 0 ? s.accel : s.accel * 2.2;
      if (Math.abs(throttle) > 0.05) this.speed += clamp(target - this.speed, -k * dt, k * dt);
      else this.speed = damp(this.speed, 0, 1.2, dt);
      if (handbrake) this.speed = damp(this.speed, 0, 3, dt);
    } else this.speed = damp(this.speed, 0, 3, dt);
    this.steer = damp(this.steer, steerIn, 8, dt);
    const speedFactor = clamp(Math.abs(this.speed) / 6, 0, 1) * (1 - clamp(Math.abs(this.speed) / (s.maxSpeed * 2.2), 0, 0.5));
    this.yaw -= this.steer * s.turn * speedFactor * Math.sign(this.speed || 1) * dt * (handbrake ? 1.6 : 1);

    const f = this.forward;
    let nx = this.pos.x + f.x * this.speed * dt;
    let nz = this.pos.z + f.z * this.speed * dt;
    // terrain interdit (eau pour les voitures, terre pour le bateau)
    const g = groundAt(nx, nz, this.pos.y + 1.5);
    const blocked = s.boat ? g > WATER_LEVEL - 0.45 : g < WATER_LEVEL - 0.9 && this.pos.y > WATER_LEVEL - 0.4;
    if (blocked) {
      nx = this.pos.x; nz = this.pos.z;
      this.speed *= -0.25;
      this.bump = 1;
    }
    // collisions avec les obstacles
    const r = resolveCircle(nx, nz, this.pos.y + 0.3, s.radius, 1.8);
    if (r.hit) {
      const dot = f.x * -r.nx + f.z * -r.nz;
      if (dot > 0.3) { this.speed *= 0.4; this.bump = Math.min(1, Math.abs(this.speed) / 10 + 0.3); }
      nx = r.x; nz = r.z;
    }
    for (const o of others) {
      if (o === this) continue;
      const dx = nx - o.pos.x, dz = nz - o.pos.z;
      const d = Math.hypot(dx, dz), min = s.radius + o.spec.radius;
      if (d < min && d > 0.001) {
        nx = o.pos.x + (dx / d) * min;
        nz = o.pos.z + (dz / d) * min;
        o.speed += this.speed * 0.3;
        this.speed *= 0.6;
      }
    }
    this.pos.x = nx; this.pos.z = nz;

    // suivi du sol (4 points)
    if (s.boat) {
      this.pos.y = WATER_LEVEL - 0.25 + Math.sin(performance.now() / 600) * 0.05;
      this.pitch = damp(this.pitch, -this.speed / s.maxSpeed * 0.12, 3, dt);
      this.roll = damp(this.roll, this.steer * clamp(this.speed / s.maxSpeed, 0, 1) * 0.15, 3, dt);
    } else {
      const fx = f.x * s.wheelBase / 2, fz = f.z * s.wheelBase / 2;
      const rx = f.z * s.track / 2, rz = -f.x * s.track / 2;
      const top = this.pos.y + 1.2;
      const hf = groundAt(this.pos.x + fx, this.pos.z + fz, top);
      const hb = groundAt(this.pos.x - fx, this.pos.z - fz, top);
      const hl = groundAt(this.pos.x - rx, this.pos.z - rz, top);
      const hr = groundAt(this.pos.x + rx, this.pos.z + rz, top);
      const gy = Math.max((hf + hb) / 2, groundAt(this.pos.x, this.pos.z, top));
      if (this.pos.y > gy + 0.05) {
        this.vy -= 22 * dt;
        this.pos.y += this.vy * dt;
        if (this.pos.y < gy) { this.pos.y = gy; this.vy = 0; }
      } else {
        this.pos.y = gy;
        this.vy = 0;
      }
      this.pitch = damp(this.pitch, -Math.atan2(hf - hb, s.wheelBase), 10, dt);
      this.roll = damp(this.roll, s.track > 0.3 ? Math.atan2(hr - hl, s.track) : this.steer * clamp(this.speed / s.maxSpeed, 0, 1) * 0.35, 10, dt);
    }
    // roues
    for (const w of this.wheels) w.rotation.x += (this.speed * dt) / 0.35;
    if (this.wheels.length >= 2 && this.type !== 'scooter') {
      this.wheels[0].rotation.y = this.wheels[1].rotation.y = this.steer * 0.45;
    } else if (this.type === 'scooter' && this.wheels[0]) this.wheels[0].rotation.y = this.steer * 0.35;
    this.bump = damp(this.bump, 0, 6, dt);
    this.sync();
  }

  respawn() {
    this.pos.copy(this.home);
    this.yaw = this.homeYaw;
    this.speed = 0;
    this.pos.y = this.spec.boat ? WATER_LEVEL : groundAt(this.pos.x, this.pos.z, this.pos.y + 50);
    this.sync();
  }

  sync() {
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0);
    this.model.rotation.set(this.pitch, 0, -this.roll, 'YXZ');
  }

  seatWorld(out = new THREE.Vector3()) {
    return out.copy(this.spec.seat).applyEuler(new THREE.Euler(this.pitch, this.yaw, -this.roll, 'YXZ')).add(this.pos);
  }
}

export { dampAngle };
