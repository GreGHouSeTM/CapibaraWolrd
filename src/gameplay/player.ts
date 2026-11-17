// Le joueur : un capybara qui marche, court, saute, nage… et conduit. Indépendant de la caméra (prêt pour 2 joueurs).
import * as THREE from 'three';
import { Capybara, HatId } from '../actors/capybara';
import { clamp, damp, dampAngle, lerp } from '../core/math';
import { groundAt, resolveCircle } from '../world/physics';
import { WATER_LEVEL } from '../world/layout';
import { heightAt } from '../world/heightmap';
import { Vehicle } from '../vehicles/vehicle';
import { Input } from '../core/input';

export type MoveState = 'ground' | 'air' | 'swim' | 'drive';

export class Player {
  capy: Capybara;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  state: MoveState = 'ground';
  vehicle: Vehicle | null = null;
  grounded = true;
  coyote = 0;
  stepTimer = 0;
  onStep: (() => void) | null = null;
  onSplash: (() => void) | null = null;
  onJump: (() => void) | null = null;
  lastSafe = new THREE.Vector3();
  private airTime = 0;
  readonly radius = 0.38;
  others: Vehicle[] = [];

  constructor(hat: HatId) {
    this.capy = new Capybara({ hat, fur: 0x9b6a43 });
  }

  get object() {
    return this.capy.root;
  }

  setPosition(p: THREE.Vector3) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.lastSafe.copy(p);
    this.state = 'ground';
  }

  update(dt: number, input: Input, camYaw: number, time: number) {
    if (this.vehicle) {
      this.driveUpdate(dt, input, time);
      return;
    }
    const mv = input.move();
    const running = input.held_('run');
    const swimming = this.state === 'swim';
    const maxSpeed = swimming ? 3.2 : running ? 8.5 : 4.2;
    // direction relative à la caméra
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -fz, rz = fx;
    let dx = fx * mv.y + rx * mv.x;
    let dz = fz * mv.y + rz * mv.x;
    const mag = Math.hypot(dx, dz);
    if (mag > 1) { dx /= mag; dz /= mag; }
    const accel = this.grounded || swimming ? 14 : 4;
    this.vel.x = damp(this.vel.x, dx * maxSpeed, accel, dt);
    this.vel.z = damp(this.vel.z, dz * maxSpeed, accel, dt);
    if (mag > 0.1) this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), swimming ? 5 : 12, dt);

    // saut
    this.coyote -= dt;
    if (this.grounded) this.coyote = 0.12;
    if (input.consume('jump')) {
      if (this.coyote > 0) {
        this.vel.y = 6.6;
        this.grounded = false;
        this.coyote = 0;
        this.state = 'air';
        this.onJump?.();
      } else if (swimming) {
        this.vel.y = 5.5; // sortie de l'eau
        this.state = 'air';
      }
    }

    // gravité
    if (!swimming) this.vel.y -= 20 * dt;
    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    let ny = this.pos.y + this.vel.y * dt;

    // obstacles
    const res = resolveCircle(nx, nz, this.pos.y, this.radius, 0.9);
    nx = res.x; nz = res.z;

    // sol (marches de 0.5 m autorisées)
    const g = groundAt(nx, nz, this.pos.y + 0.5, this.radius * 0.5);
    const waterSurface = WATER_LEVEL - 0.42;
    if (g < WATER_LEVEL - 0.55 && ny <= waterSurface + 0.05) {
      // nage
      if (this.state !== 'swim') this.onSplash?.();
      this.state = 'swim';
      ny = damp(ny, waterSurface + Math.sin(time * 2) * 0.04, 6, dt);
      this.vel.y = 0;
      this.grounded = false;
      // aide pour remonter sur un quai proche
      if (mag > 0.1) {
        const ax = nx + dx * 0.9, az = nz + dz * 0.9;
        const ahead = groundAt(ax, az, 12);
        if (ahead > WATER_LEVEL - 0.3 && ahead < WATER_LEVEL + 7.5) {
          const blockedAhead = resolveCircle(ax, az, ahead, this.radius, 0.9).hit;
          if (!blockedAhead) { nx = ax; nz = az; ny = ahead + 0.05; this.state = 'ground'; this.grounded = true; }
        }
      }
    } else if (ny <= g + 0.02) {
      if (!this.grounded && this.airTime > 0.35) this.onStep?.();
      ny = g;
      this.vel.y = 0;
      this.grounded = true;
      this.state = 'ground';
      this.airTime = 0;
      if (g > WATER_LEVEL) this.lastSafe.set(nx, ny, nz);
    } else if (ny < g + 0.45 && this.grounded && this.vel.y <= 0) {
      ny = g; // descente de marche : on colle au sol
      this.vel.y = 0;
    } else {
      this.grounded = false;
      this.airTime += dt;
      if (this.state !== 'swim') this.state = 'air';
    }
    // ne pas tomber sous le monde
    if (ny < heightAt(nx, nz) - 2) ny = heightAt(nx, nz);
    this.pos.set(nx, ny, nz);

    // pas
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded && hs > 1) {
      this.stepTimer -= dt * hs;
      if (this.stepTimer < 0) { this.stepTimer = 1.6; this.onStep?.(); }
    }
    const animState = this.state === 'drive' ? 'sit' : (this.state as 'ground' | 'air' | 'swim');
    this.capy.animate(dt, hs, animState, time);
    this.capy.root.position.copy(this.pos);
    this.capy.root.rotation.set(0, this.yaw, 0);
  }

  private driveUpdate(dt: number, input: Input, time: number) {
    const v = this.vehicle!;
    const mv = input.move();
    v.update(dt, mv.y, mv.x, input.held_('brake'), this.others);
    const seat = v.seatWorld();
    this.pos.copy(seat);
    this.yaw = v.yaw;
    this.capy.root.position.copy(seat);
    this.capy.root.rotation.set(v.pitch, v.yaw, -v.roll, 'YXZ');
    this.capy.animate(dt, 0, 'sit', time);
    this.vel.set(0, 0, 0);
  }

  enter(v: Vehicle) {
    this.vehicle = v;
    v.driven = true;
    this.state = 'drive';
  }

  exit(): THREE.Vector3 {
    const v = this.vehicle!;
    v.driven = false;
    this.vehicle = null;
    // descendre sur le côté gauche
    const side = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw)).multiplyScalar(v.spec.radius + 0.9);
    let p = v.pos.clone().add(side);
    if (v.spec.boat) {
      // depuis le bateau : on cherche la terre ferme la plus proche
      let best: THREE.Vector3 | null = null;
      for (let r = 2; r < 30 && !best; r += 2)
        for (let a = 0; a < Math.PI * 2; a += 0.4) {
          const x = v.pos.x + Math.cos(a) * r, z = v.pos.z + Math.sin(a) * r;
          if (groundAt(x, z) > WATER_LEVEL + 0.1) { best = new THREE.Vector3(x, groundAt(x, z), z); break; }
        }
      p = best ?? v.pos.clone().setY(WATER_LEVEL - 0.4);
    } else {
      const r = resolveCircle(p.x, p.z, p.y, this.radius, 0.9);
      p.set(r.x, groundAt(r.x, r.z, p.y + 2), r.z);
    }
    this.setPosition(p);
    this.yaw = v.yaw;
    this.state = groundAt(p.x, p.z) < WATER_LEVEL - 0.55 ? 'swim' : 'ground';
    return p;
  }

  /** Point de référence pour la caméra. */
  focus(out = new THREE.Vector3()) {
    if (this.vehicle) return out.copy(this.vehicle.pos).add(new THREE.Vector3(0, 1.2, 0));
    return out.copy(this.pos).add(new THREE.Vector3(0, this.state === 'swim' ? 0.5 : 0.75, 0));
  }

  /** Vitesse horizontale actuelle. */
  get speed() {
    return this.vehicle ? Math.abs(this.vehicle.speed) : Math.hypot(this.vel.x, this.vel.z);
  }
}

export { clamp, lerp };
