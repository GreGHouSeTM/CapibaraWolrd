// Caméra à la troisième personne : orbite à la souris, se replace derrière le véhicule, évite les murs.
import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/math';
import { raycastFraction } from '../world/physics';
import { heightAt } from '../world/heightmap';
import { Player } from './player';
import { Input } from '../core/input';

export class CameraRig {
  camera: THREE.PerspectiveCamera;
  yaw = Math.PI;
  pitch = 0.32;
  dist = 6;
  private curDist = 6;
  private idle = 0;
  private focus = new THREE.Vector3();
  private shake = 0;
  baseFov = 62;
  sensitivity = 1;
  invertY = false;
  /** vue spéciale (ex : photo, grande roue) */
  override: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(this.baseFov, aspect, 0.15, 3200);
  }

  addShake(a: number) {
    this.shake = Math.min(1, this.shake + a);
  }

  update(dt: number, player: Player, input: Input) {
    const lx = input.look.x * 0.0026 * this.sensitivity;
    const ly = input.look.y * 0.0022 * this.sensitivity * (this.invertY ? -1 : 1);
    this.yaw -= lx;
    this.pitch = clamp(this.pitch + ly, -0.35, 1.25);
    if (Math.abs(lx) + Math.abs(ly) > 0.0005) this.idle = 0;
    else this.idle += dt;
    if (input.wheel) this.dist = clamp(this.dist + input.wheel * 0.8, 3, 14);

    const v = player.vehicle;
    const targetDist = v ? v.spec.camDist : this.dist;
    const target = player.focus(new THREE.Vector3());
    if (v) target.y += v.spec.camHeight - 2.2;
    // se replacer derrière en roulant
    if (v && this.idle > 0.8 && Math.abs(v.speed) > 2) {
      const behind = v.speed >= 0 ? v.yaw : v.yaw + Math.PI;
      this.yaw = dampAngle(this.yaw, behind, 2.2, dt);
      this.pitch = damp(this.pitch, 0.22, 1.5, dt);
    } else if (!v && this.idle > 2.5 && player.speed > 3) {
      this.yaw = dampAngle(this.yaw, player.yaw, 1.0, dt);
    }
    this.focus.lerp(target, 1 - Math.exp(-dt * (v ? 14 : 18)));
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = new THREE.Vector3(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp);
    const want = this.focus.clone().addScaledVector(dir, targetDist);
    const frac = raycastFraction(this.focus.x, this.focus.y, this.focus.z, want.x, want.y, want.z);
    const d = Math.max(1.2, targetDist * frac);
    this.curDist = d < this.curDist ? d : damp(this.curDist, d, 4, dt);
    const pos = this.focus.clone().addScaledVector(dir, this.curDist);
    const minY = heightAt(pos.x, pos.z) + 0.4;
    if (pos.y < minY) pos.y = minY;
    if (pos.y < 0.25 && player.state !== 'swim') pos.y = Math.max(pos.y, 0.25);

    if (this.override) {
      this.camera.position.lerp(this.override.pos, 1 - Math.exp(-dt * 4));
      this.camera.lookAt(this.override.look);
    } else {
      this.camera.position.copy(pos);
      this.camera.lookAt(this.focus);
    }
    // tremblement léger (chocs)
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.25;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.25;
      this.shake = damp(this.shake, 0, 6, dt);
    }
    const speed = player.speed;
    const fov = this.baseFov + clamp((speed - 6) / 25, 0, 1) * 14;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = damp(this.camera.fov, fov, 3, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  /** Direction horizontale de la caméra (pour orienter les déplacements). */
  get moveYaw() {
    return this.yaw;
  }
}
