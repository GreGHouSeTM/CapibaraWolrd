// Le joueur : un capybara qui marche, court, saute, nage… et conduit. Indépendant de la caméra (prêt pour 2 joueurs).
// --- MONTAGNE --- : en montagne, la vitesse dépend de la pente, les pentes trop raides font glisser, la roche raide
// se grimpe avec de l'endurance, les chutes font rouler (ou ramènent au dernier point sûr) et le froid d'altitude
// se combat près des feux (règles et réglages dans mountain.ts, conception dans docs/MONTAGNE-AURORE.md).
import * as THREE from 'three';
import { Capybara, HatId } from '../actors/capybara';
import { clamp, damp, dampAngle, lerp } from '../core/math';
import { groundAt, resolveCircle } from '../world/physics';
import { WATER_LEVEL } from '../world/layout';
import { heightAt } from '../world/heightmap';
import { Vehicle } from '../vehicles/vehicle';
import { Input } from '../core/input';
import { onTrail } from './trails';
import { MONTAGNE, SlopeInfo, Stamina, Warmth, fallOutcome, mountainTerrain, slopeSpeedFactor, terrainSlope } from './mountain';

export type MoveState = 'ground' | 'air' | 'swim' | 'drive';

// --- MONTAGNE ---
/** Environnement fourni par le jeu : nuit (0..1) et chaleur proche (0..1) au point donné. */
export interface Climate {
  night(): number;
  heatAt(x: number, y: number, z: number): number;
}
/** Part du froid arrêtée par chaque chapeau (les tenues complètes passent par `outfitWarmth`). */
const HAT_WARMTH: Partial<Record<HatId, number>> = { bonnet: 0.25 };
const DEG = Math.PI / 180;

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

  // --- MONTAGNE ---
  stamina = new Stamina();
  warmth = new Warmth();
  climbing = false;
  sliding = false;
  /** roulade après une chute (s restantes) */
  rollT = 0;
  /** retour au point sûr en cours (s écoulées, -1 : aucun) */
  rescueT = -1;
  /** crochet « tenue chaude » : part du froid arrêtée par une tenue (0..1), à brancher sur les tenues débloquées */
  outfitWarmth = 0;
  /** équipé : manteau d'hiver (objet de l'inventaire, débloqué plus tard par une quête) → plus aucun froid jusqu'au sommet.
   *  Drapeau de test : `?manteau` dans l'adresse, ou `__game.player.winterCoat = true`. */
  winterCoat = typeof location !== 'undefined' && /[?&]manteau(&|=|$)/.test(location.search);
  /** mode survie (option à venir) : seul ce mode fait perdre de la vie au froid, via `onColdHurt` */
  survival = false;
  climate: Climate = { night: () => 0, heatAt: () => 0 };
  /** chute : demi-cœurs perdus et gravité (le jeu retire les cœurs, sans jamais les faire tomber à zéro) */
  onFall: ((halves: number, kind: 'roulade' | 'secours') => void) | null = null;
  /** mode survie seulement : le froid retire `halves` demi-cœurs (jamais appelé hors survie) */
  onColdHurt: ((halves: number) => void) | null = null;
  /** pente du sol sous le capybara (degrés, 0 sur un escalier, un pont ou un quai) et pente dans le sens de la marche */
  slopeDeg = 0;
  slopePhi = 0;
  /** sur un chemin tracé (ressauts franchissables) */
  onTrail = false;
  /** chaleur proche (0..1) */
  heat = 0;
  private sl: SlopeInfo = { deg: 0, gx: 0, gz: 0 };
  private slAhead: SlopeInfo = { deg: 0, gx: 0, gz: 0 };
  private fallTop = -Infinity;
  private falling = false;
  private safeT = 0;
  private rescueTo = new THREE.Vector3();
  private rescueDone = false;
  private heatT = 0;

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
    // --- MONTAGNE ---
    this.climbing = this.sliding = false;
    this.falling = false;
    this.fallTop = -Infinity;
    this.rollT = 0;
  }

  /** Part du froid arrêtée par la tenue et le chapeau (0..1 ; 1 avec le manteau d'hiver). */
  get warmthGear() {
    if (this.winterCoat) return 1;
    return Math.min(0.9, (HAT_WARMTH[this.capy.hatId] ?? 0) + this.outfitWarmth);
  }

  /** Opacité du fondu de retour au point sûr (0..1). */
  get rescueFade() {
    if (this.rescueT < 0) return 0;
    const u = this.rescueT / MONTAGNE.rescueTime;
    return u < 0.5 ? u * 2 : Math.max(0, 2 - u * 2);
  }

  update(dt: number, input: Input, camYaw: number, time: number) {
    if (this.vehicle) {
      this.driveUpdate(dt, input, time);
      return;
    }
    // --- MONTAGNE --- retour au point sûr : fondu, déplacement au noir, puis on rend la main
    if (this.rescueT >= 0) {
      this.updateRescue(dt, time);
      return;
    }
    const mv = input.move();
    const swimming = this.state === 'swim';
    // direction relative à la caméra
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -fz, rz = fx;
    let dx = fx * mv.y + rx * mv.x;
    let dz = fz * mv.y + rz * mv.x;
    let mag = Math.hypot(dx, dz);
    if (mag > 1) { dx /= mag; dz /= mag; mag = 1; }
    const rolling = this.rollT > 0;
    if (rolling) { this.rollT = Math.max(0, this.rollT - dt); dx = dz = mag = 0; }

    // --- MONTAGNE --- pente sous le capybara (terrain ; un escalier, un pont ou un quai comptent comme plats)
    const M = MONTAGNE.slope;
    const sl = terrainSlope(this.pos.x, this.pos.z, 1, this.sl);
    const terrainY = heightAt(this.pos.x, this.pos.z);
    const onBuilt = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5, this.radius * 0.5) > terrainY + 0.05;
    const slope = onBuilt || swimming ? 0 : sl.deg;
    const glen = Math.hypot(sl.gx, sl.gz);
    const ux = glen > 1e-5 ? sl.gx / glen : 0, uz = glen > 1e-5 ? sl.gz / glen : 0; // sens de la montée
    const nearGround = this.pos.y - terrainY < 3;
    const ground = this.grounded && !swimming;
    const push = mag > 0.1 ? dx * ux + dz * uz : 0; // part de la commande vers le haut de la pente
    // sur un chemin tracé ou à la tête d'un pont, les ressauts raides se franchissent toujours (marches et prises taillées)
    const trail = slope > M.slideSnow && onTrail(this.pos.x, this.pos.z);
    this.onTrail = trail;
    const steep = slope > M.blockFrom && !trail;
    const rock = steep ? mountainTerrain.rock(this.pos.x, this.pos.z) : 0;
    const snow = slope > M.slideSnow ? mountainTerrain.snow(this.pos.x, this.pos.z) : 0;
    // escalade : roche raide, on pousse vers la paroi, il reste de l'endurance
    if (this.climbing) {
      if (!ground || slope < M.climbFrom - 6 || rock < 0.2) this.climbing = false;
      else if (this.stamina.value <= 0) { this.climbing = false; this.sliding = true; }
    } else if (ground && !rolling && steep && rock > 0.35 && push > 0.35 && this.stamina.canEffort) {
      // la paroi devant (à 0,8 m) est assez raide pour s'y accrocher
      const ahead = terrainSlope(this.pos.x + dx / mag * 0.8, this.pos.z + dz / mag * 0.8, 1, this.slAhead);
      if (ahead.deg >= M.climbFrom || slope >= M.climbFrom) this.climbing = true;
    }
    // glissade : trop raide pour tenir debout (moins raide sur la neige)
    const slideFrom = snow > 0.5 ? M.slideSnow : M.blockFrom;
    if (this.climbing || !ground || onBuilt || trail) this.sliding = this.sliding && ground && !this.climbing && !onBuilt && !trail;
    else if (slope > slideFrom) this.sliding = true;
    else if (slope < slideFrom - M.slideHyst) this.sliding = false;

    // vitesse selon la pente dans le sens de la marche
    this.slopeDeg = slope;
    this.slopePhi = mag > 0.1 && slope > 0 ? Math.atan((dx * sl.gx + dz * sl.gz) / mag) / DEG : 0;
    const phi = this.slopePhi;
    const moving = Math.hypot(this.vel.x, this.vel.z) > 0.5;
    const running = input.held_('run') && !swimming && !this.climbing && !this.sliding && !rolling && mag > 0.1 && phi <= M.runMax && this.stamina.canEffort;
    const base = swimming ? 3.2 : running ? 8.5 : 4.2;
    const slopeK = swimming ? 1 : Math.max(slopeSpeedFactor(Math.min(phi, trail ? M.trailCap : M.blockFrom)), 0.08);
    const maxSpeed = base * slopeK;
    let tx = dx * maxSpeed, tz = dz * maxSpeed;
    // pente infranchissable : la marche ne monte plus (au sol et juste au-dessus, pour qu'on ne la gravisse pas en sautant)
    if (!this.climbing && steep && nearGround) {
      const up = tx * ux + tz * uz;
      if (up > 0) { tx -= ux * up; tz -= uz * up; }
      const vu = this.vel.x * ux + this.vel.z * uz;
      if (vu > 0) { this.vel.x -= ux * vu; this.vel.z -= uz * vu; }
    }
    // endurance : la course (plus chère en montée) et l'escalade la consomment
    const S = MONTAGNE.stamina;
    const effort = this.climbing ? (mag > 0.1 ? S.climb : S.climbHold) : running && moving ? S.run + S.runPerDeg * Math.max(0, phi) : 0;
    this.stamina.update(dt, effort, moving, this.warmth.regenFactor);

    const accel = this.grounded || swimming ? 14 : 4;
    if (this.climbing) {
      // on avance le long de la paroi : la montée se fait à vitesse verticale constante
      const C = MONTAGNE.climb;
      const lat = mag > 0.1 ? dx * -uz + dz * ux : 0;
      const vh = (C.vertical / Math.max(0.3, Math.tan(slope * DEG))) * push;
      this.vel.x = ux * vh - uz * lat * C.lateral;
      this.vel.z = uz * vh + ux * lat * C.lateral;
      this.yaw = dampAngle(this.yaw, Math.atan2(ux, uz), 8, dt);
    } else if (this.sliding) {
      // glissade vers le bas de la pente, un peu dirigeable sur les côtés
      const P = MONTAGNE.slide;
      const th = slope * DEG;
      const a = Math.max(1.5, 9.8 * (Math.sin(th) - P.friction * Math.cos(th)));
      const lat = mag > 0.1 ? dx * -uz + dz * ux : 0;
      this.vel.x += (-ux * a - uz * lat * P.steer) * dt;
      this.vel.z += (-uz * a + ux * lat * P.steer) * dt;
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (hs > P.maxSpeed) { this.vel.x *= P.maxSpeed / hs; this.vel.z *= P.maxSpeed / hs; }
      const vu = this.vel.x * ux + this.vel.z * uz;
      if (vu > 0) { this.vel.x -= ux * vu; this.vel.z -= uz * vu; }
      if (hs > 0.5) this.yaw = dampAngle(this.yaw, Math.atan2(-ux, -uz), 4, dt);
    } else {
      const k = rolling ? 3 : accel;
      this.vel.x = damp(this.vel.x, tx, k, dt);
      this.vel.z = damp(this.vel.z, tz, k, dt);
      if (mag > 0.1) this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), swimming ? 5 : 12, dt);
    }

    // saut (pas pendant une glissade ou une roulade ; pendant l'escalade, on lâche la paroi)
    this.coyote -= dt;
    if (this.grounded) this.coyote = 0.12;
    if (input.consume('jump') && !rolling) {
      if (this.climbing) {
        this.climbing = false;
        this.vel.set(-ux * 1.5, 2, -uz * 1.5);
        this.grounded = false;
        this.state = 'air';
      } else if (this.coyote > 0 && !this.sliding) {
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
      this.falling = false; // --- MONTAGNE --- l'eau amortit la chute
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
    } else if (ny < g + 0.45 && this.grounded && this.vel.y <= 0) {
      ny = g; // descente de marche : on colle au sol
      this.vel.y = 0;
    } else if (this.sliding && this.grounded && ny < g + 1.5 && this.vel.y <= 0) {
      ny = g; // --- MONTAGNE --- glissade : on reste plaqué à la pente
      this.vel.y = 0;
    } else {
      this.grounded = false;
      this.airTime += dt;
      if (this.state !== 'swim') this.state = 'air';
    }
    // ne pas tomber sous le monde
    if (ny < heightAt(nx, nz) - 2) ny = heightAt(nx, nz);
    this.pos.set(nx, ny, nz);

    // --- MONTAGNE --- chute : du point le plus haut (en l'air, ou en glissant le long d'une paroi) jusqu'à l'arrêt
    const inFall = this.state === 'air' || (this.sliding && slope > M.wallFrom);
    if (inFall) {
      if (!this.falling) { this.falling = true; this.fallTop = this.pos.y; }
      this.fallTop = Math.max(this.fallTop, this.pos.y);
    } else if (this.falling) {
      this.falling = false;
      if (this.state !== 'swim') this.land(this.fallTop - this.pos.y);
    }
    // dernier point sûr : posé, pas en glissade, pente douce, depuis un instant
    if (this.grounded && !this.sliding && !this.climbing && slope < 33 && g > WATER_LEVEL) {
      this.safeT += dt;
      if (this.safeT > 0.5) { this.lastSafe.set(nx, ny, nz); this.safeT = 0.25; }
    } else this.safeT = 0;
    // chaleur (la chaleur proche est cherchée quatre fois par seconde)
    this.heatT -= dt;
    if (this.heatT <= 0) { this.heatT = 0.25; this.heat = this.climate.heatAt(nx, ny, nz); }
    const coldHurt = this.warmth.update(dt, ny, this.climate.night(), this.heat, this.warmthGear, this.survival);
    if (coldHurt) this.onColdHurt?.(coldHurt);

    // pas
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded && hs > 1 && !this.sliding) {
      this.stepTimer -= dt * hs;
      if (this.stepTimer < 0) { this.stepTimer = 1.6; this.onStep?.(); }
    }
    const animState = this.state === 'drive' ? 'sit' : (this.state as 'ground' | 'air' | 'swim');
    this.capy.animate(dt, this.climbing ? 1.2 + 2.5 * hs : this.sliding ? 0 : hs, animState, time);
    this.mountainPose(dt, time);
    this.capy.root.position.copy(this.pos);
    this.capy.root.rotation.set(0, this.yaw, 0);
  }

  // --- MONTAGNE --- atterrissage après une chute de `h` mètres
  private land(h: number) {
    const o = fallOutcome(h);
    if (o.kind === 'rien') return;
    this.onFall?.(o.halves, o.kind);
    if (o.kind === 'roulade') {
      this.rollT = MONTAGNE.fall.rollTime;
      this.climbing = false;
    } else this.startRescue(this.lastSafe);
  }

  private startRescue(to: THREE.Vector3) {
    this.rescueTo.copy(to);
    this.rescueT = 0;
    this.rescueDone = false;
    this.vel.set(0, 0, 0);
    this.climbing = this.sliding = false;
    this.rollT = 0;
  }

  private updateRescue(dt: number, time: number) {
    this.rescueT += dt;
    if (!this.rescueDone && this.rescueT >= MONTAGNE.rescueTime * 0.5) {
      this.rescueDone = true;
      const to = this.rescueTo.clone();
      to.y = groundAt(to.x, to.z, to.y + 0.5);
      this.setPosition(to);
    }
    if (this.rescueT >= MONTAGNE.rescueTime) this.rescueT = -1;
    this.vel.set(0, 0, 0);
    this.capy.animate(dt, 0, 'ground', time);
    this.capy.root.position.copy(this.pos);
    this.capy.root.rotation.set(0, this.yaw, 0);
  }

  /** Poses procédurales de montagne, après la marche : penché dans la pente, accroché, en glissade, roulade, frissons. */
  private mountainPose(dt: number, time: number) {
    // le corps du modèle procédural (champ privé de Capybara, spécialité Rig) : on ne fait que l'incliner
    const b = (this.capy as unknown as { body: THREE.Group }).body;
    const k = 1 - Math.exp(-dt * 8);
    if (this.rollT > 0) {
      this.capy.combatPose({ kind: 'roulade', t: 1 - this.rollT / MONTAGNE.fall.rollTime });
      return;
    }
    if (this.climbing) {
      b.rotation.x = lerp(b.rotation.x, -1.05, k); // à plat ventre contre la paroi
      return;
    }
    if (this.sliding) {
      b.rotation.x = lerp(b.rotation.x, 0.32, k); // assis sur le derrière, pattes en avant
      b.position.y = lerp(b.position.y, 0.3, k);
      return;
    }
    if (this.state === 'ground' && this.slopeDeg > 4) b.rotation.x += clamp(-this.slopePhi * DEG * 0.45, -0.3, 0.25);
    const shiver = 1 - this.warmth.value / MONTAGNE.cold.shiverBelow;
    if (shiver > 0) b.rotation.z += Math.sin(time * 60) * 0.025 * shiver;
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
