// Combat du joueur (spécialité Combat) : combo de 3 coups (coup de tête, coup de patte, ruade), roulade d'esquive
// avec invulnérabilité, cœurs (demi-cœurs, régénération lente hors combat), « Ouf ! » et réveil au bain extérieur,
// pièces laissées par les ennemis et effets d'impact.
//
// - `CombatCore` : règles pures (minuteries, cœurs, enchaînements) — sans scène ni DOM, testées par Vitest.
// - `Combat` : branchement dans le jeu (joueur, caméra, ennemis, HUD, pièces, effets).
// - `onHitFx(pos, kind)` : POINT D'ACCROCHE UNIQUE des effets de combat. L'agent Effets visuels y branche son système
//   avec `setHitFxHandler()` ; en attendant, un petit jet de feuilles local (`LeafBurst`) sert d'effet par défaut.
import * as THREE from 'three';
import { clamp, dampAngle } from '../core/math';
import { groundAt, resolveCircle } from '../world/physics';
import { WATER_LEVEL } from '../world/layout';
import { inSafeZone, inTallGrass } from '../world/zones';
import { EnemyManager, Enemy } from '../actors/enemies';
import { HeartsUI } from '../ui/hearts';
import type { CombatPose } from '../actors/capybara';
import type { Player } from './player';
import type { CameraRig } from './camera';
import type { Input } from '../core/input';

// ================================================================================================ réglages
export type AttackId = 'tete' | 'patte' | 'ruade';

export interface AttackDef {
  id: AttackId;
  name: string;
  /** durée totale du coup (s) */
  duration: number;
  /** fenêtre de frappe (s depuis le début du coup) */
  hitFrom: number;
  hitTo: number;
  /** portée devant le capybara (m) et ouverture de l'arc (rad) */
  range: number;
  arc: number;
  /** dégâts (points de vie ennemis) */
  damage: number;
  /** vitesse de recul donnée à l'ennemi (m/s) */
  knockback: number;
  /** petit élan vers l'avant pendant le coup (m) */
  lunge: number;
  shake: number;
  hitstop: number;
  fx: HitFxKind;
}

const deg = (d: number) => (d * Math.PI) / 180;

/** Le combo : trois coups à enchaîner au clic. */
export const COMBO: AttackDef[] = [
  { id: 'tete', name: 'coup de tête', duration: 0.34, hitFrom: 0.09, hitTo: 0.2, range: 1.55, arc: deg(110), damage: 1, knockback: 3.5, lunge: 0.7, shake: 0.16, hitstop: 0.06, fx: 'coup' },
  { id: 'patte', name: 'coup de patte', duration: 0.36, hitFrom: 0.1, hitTo: 0.22, range: 1.7, arc: deg(150), damage: 1, knockback: 3.5, lunge: 0.6, shake: 0.18, hitstop: 0.06, fx: 'coup' },
  { id: 'ruade', name: 'ruade', duration: 0.56, hitFrom: 0.18, hitTo: 0.34, range: 1.95, arc: deg(200), damage: 2, knockback: 8, lunge: 0.5, shake: 0.38, hitstop: 0.1, fx: 'ruade' },
];

export const COMBAT = {
  /** 5 cœurs = 10 demi-cœurs */
  maxHalves: 10,
  /** temps laissé après un coup pour enchaîner le suivant (s) */
  chainWindow: 0.32,
  /** aide à la visée : le capybara se tourne vers l'ennemi le plus proche à cette distance (m) */
  aimAssist: 3.2,
  dodge: { distance: 3, duration: 0.42, invuln: 0.4, cooldown: 0.6 },
  /** touché : recul, durée du sursaut, invulnérabilité (clignotement) */
  hurt: { knock: 1.6, duration: 0.3, invuln: 1.1 },
  /** régénération : un demi-cœur toutes les `every` s, après `delay` s sans combat ni dégât */
  regen: { delay: 6, every: 3.5 },
  /** séquence « Ouf ! » : téléportation au milieu, fin de l'écran à `duration` */
  ko: { teleportAt: 1.3, duration: 2.8, invulnAfter: 1.5 },
};

/** Réveil après « Ouf ! » : au bord du bain extérieur (bible §10.1). */
export const WAKE_POINT = { x: 52, z: 66 };

// ================================================================================================ effets
/**
 * Types d'effets : `coup` (coup simple qui touche), `ruade` (3e coup), `pouf` (ennemi qui disparaît),
 * `degat` (le capybara est touché), `roulade` (poussière au départ d'une esquive), `surgit` (un ennemi sort des herbes).
 */
export type HitFxKind = 'coup' | 'ruade' | 'pouf' | 'degat' | 'roulade' | 'surgit';
export type HitFxHandler = (pos: THREE.Vector3, kind: HitFxKind) => void;

let fxHandler: HitFxHandler | null = null;
let fxFallback: HitFxHandler = () => {};

/** Branche le système d'effets visuels (agent Effets visuels). `null` revient à l'effet par défaut. */
export function setHitFxHandler(h: HitFxHandler | null) {
  fxHandler = h;
}

/** Point d'accroche unique de tous les effets de combat. */
export function onHitFx(pos: THREE.Vector3, kind: HitFxKind) {
  (fxHandler ?? fxFallback)(pos, kind);
}

// ================================================================================================ règles pures
export type CombatAction = 'libre' | 'attaque' | 'roulade' | 'sursaut' | 'ko';
export type MoveMode = 'ground' | 'air' | 'swim' | 'drive';

/** Une cible est-elle dans l'arc d'attaque ? (yaw : 0 = +z, comme `rotation.y`) */
export function inArc(ox: number, oz: number, yaw: number, tx: number, tz: number, range: number, arc: number, targetR = 0) {
  const dx = tx - ox, dz = tz - oz;
  const d = Math.hypot(dx, dz);
  if (d > range + targetR) return false;
  if (d < targetR + 0.25) return true; // collé : toujours touché
  const cos = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / d;
  const ang = Math.acos(clamp(cos, -1, 1));
  return ang <= arc / 2 + Math.asin(Math.min(1, targetR / d));
}

export class CombatCore {
  max = COMBAT.maxHalves;
  halves = COMBAT.maxHalves;
  action: CombatAction = 'libre';
  /** temps écoulé dans l'action en cours (s) */
  t = 0;
  /** indice du coup en cours ou du dernier coup (-1 : aucun) */
  combo = -1;
  invuln = 0;
  /** l'invulnérabilité vient d'un coup reçu (le capybara clignote) */
  hurtInvuln = false;
  dodgeCooldown = 0;
  sinceDamage = 999;
  hitstop = 0;
  /** cibles déjà touchées par le coup en cours */
  readonly struck = new Set<unknown>();
  private buffered = false;
  private chainT = 0;
  private regenT = 0;

  get attack(): AttackDef | null {
    return this.action === 'attaque' ? COMBO[this.combo] : null;
  }

  get invulnerable() {
    return this.invuln > 0 || this.action === 'ko';
  }

  /** On ne se bat qu'à pied, sur le sol : pas en voiture, pas à la nage, pas en l'air. */
  canFight(mode: MoveMode) {
    return mode === 'ground' && this.action !== 'ko' && this.action !== 'sursaut';
  }

  /** Appui sur « attaque ». Renvoie l'indice du coup lancé, ou -1 (coup mémorisé pour l'enchaînement, ou refusé). */
  pressAttack(mode: MoveMode): number {
    if (!this.canFight(mode) || this.action === 'roulade') return -1;
    if (this.action === 'attaque') {
      if (this.combo < COMBO.length - 1) this.buffered = true;
      return -1;
    }
    const next = this.chainT > 0 && this.combo >= 0 && this.combo < COMBO.length - 1 ? this.combo + 1 : 0;
    this.startAttack(next);
    return next;
  }

  /** Appui sur « esquive ». Une roulade peut interrompre un coup. */
  pressDodge(mode: MoveMode): boolean {
    if (!this.canFight(mode) || this.action === 'roulade' || this.dodgeCooldown > 0) return false;
    this.action = 'roulade';
    this.t = 0;
    this.invuln = Math.max(this.invuln, COMBAT.dodge.invuln);
    this.hurtInvuln = false;
    this.dodgeCooldown = COMBAT.dodge.duration + COMBAT.dodge.cooldown;
    this.combo = -1;
    this.chainT = 0;
    this.buffered = false;
    return true;
  }

  /** Dégâts reçus (demi-cœurs). */
  damage(n: number): 'esquive' | 'touche' | 'ko' {
    if (this.invulnerable) return 'esquive';
    this.halves = Math.max(0, this.halves - n);
    this.sinceDamage = 0;
    this.regenT = 0;
    this.combo = -1;
    this.buffered = false;
    this.t = 0;
    if (this.halves === 0) {
      this.action = 'ko';
      return 'ko';
    }
    this.action = 'sursaut';
    this.invuln = COMBAT.hurt.invuln;
    this.hurtInvuln = true;
    return 'touche';
  }

  addHitstop(s: number) {
    this.hitstop = Math.max(this.hitstop, s);
  }

  /** La fenêtre de frappe du coup en cours est-elle ouverte ? */
  inHitWindow() {
    const a = this.attack;
    return !!a && this.t >= a.hitFrom && this.t <= a.hitTo;
  }

  /**
   * Avance les minuteries. `fighting` : un ennemi est engagé près du joueur (bloque la régénération).
   * Renvoie vrai pendant un arrêt sur image (hit-stop) : rien ne bouge.
   */
  update(dt: number, fighting: boolean): boolean {
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return true;
    }
    this.t += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.invuln === 0) this.hurtInvuln = false;
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    // temps « au calme » : remis à zéro par un dégât ou tant qu'un ennemi est engagé
    this.sinceDamage = fighting ? 0 : this.sinceDamage + dt;
    this.chainT -= dt;
    switch (this.action) {
      case 'attaque': {
        const a = COMBO[this.combo];
        if (this.t >= a.duration) {
          if (this.buffered && this.combo < COMBO.length - 1) this.startAttack(this.combo + 1);
          else {
            this.action = 'libre';
            this.chainT = COMBAT.chainWindow;
            this.buffered = false;
          }
        }
        break;
      }
      case 'roulade':
        if (this.t >= COMBAT.dodge.duration) this.action = 'libre';
        break;
      case 'sursaut':
        if (this.t >= COMBAT.hurt.duration) this.action = 'libre';
        break;
    }
    // régénération lente hors combat
    if (this.action !== 'ko' && this.sinceDamage > COMBAT.regen.delay && this.halves < this.max) {
      this.regenT += dt;
      if (this.regenT >= COMBAT.regen.every) {
        this.regenT = 0;
        this.halves++;
      }
    } else this.regenT = 0;
    return false;
  }

  /** Réveil après « Ouf ! » : tous les cœurs, courte invulnérabilité. */
  revive() {
    this.halves = this.max;
    this.action = 'libre';
    this.t = 0;
    this.combo = -1;
    this.invuln = COMBAT.ko.invulnAfter;
    this.hurtInvuln = false;
    this.sinceDamage = 999;
  }

  private startAttack(i: number) {
    this.action = 'attaque';
    this.combo = i;
    this.t = 0;
    this.buffered = false;
    this.chainT = 0;
    this.struck.clear();
  }
}

// ================================================================================================ effet par défaut
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
interface Particle {
  pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; life: number; max: number; size: number; drag: number; grav: number;
}

/** Petit système de particules (feuilles, éclats, bouffées) : effet de combat par défaut, en 2 appels de dessin. */
export class LeafBurst {
  group = new THREE.Group();
  private leaves: THREE.InstancedMesh;
  private puffs: THREE.InstancedMesh;
  private lp: (Particle | null)[];
  private pp: (Particle | null)[];
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();

  constructor(cap = 220, puffCap = 48) {
    const leaf = new THREE.PlaneGeometry(0.13, 0.075);
    leaf.translate(0.03, 0, 0);
    this.leaves = new THREE.InstancedMesh(leaf, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.75 }), cap);
    this.leaves.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0x4a3a28, roughness: 1 }), puffCap);
    for (const m of [this.leaves, this.puffs]) {
      m.frustumCulled = false;
      m.count = 0;
      this.group.add(m);
    }
    this.lp = new Array(cap).fill(null);
    this.pp = new Array(puffCap).fill(null);
    this.group.name = 'effets-combat';
  }

  emit(pos: THREE.Vector3, kind: HitFxKind) {
    const r = Math.random;
    const leafCols = [0x6f9a35, 0x4f7a2a, 0x8fb04a, 0x6b3a5e, 0xa3b86a];
    const add = (n: number, cols: number[], speed: number, up: number, size: number, life: number, grav = 5) => {
      for (let i = 0; i < n; i++) {
        const k = this.lp.findIndex((p) => !p);
        if (k < 0) return;
        const a = r() * Math.PI * 2, s = speed * (0.4 + r() * 0.8);
        this.lp[k] = {
          pos: pos.clone(), vel: new THREE.Vector3(Math.cos(a) * s, up * (0.5 + r()), Math.sin(a) * s),
          rot: new THREE.Euler(r() * 6, r() * 6, r() * 6), spin: new THREE.Vector3(r() * 14 - 7, r() * 14 - 7, r() * 14 - 7),
          life: life * (0.7 + r() * 0.5), max: life, size: size * (0.7 + r() * 0.6), drag: 2.2, grav,
        };
        this.leaves.setColorAt(k, this.color.setHex(cols[Math.floor(r() * cols.length)]));
      }
      this.leaves.instanceColor!.needsUpdate = true;
    };
    const puff = (n: number, speed: number, size: number, life: number) => {
      for (let i = 0; i < n; i++) {
        const k = this.pp.findIndex((p) => !p);
        if (k < 0) return;
        const a = (i / n) * Math.PI * 2 + r() * 0.4;
        this.pp[k] = {
          pos: pos.clone().add(new THREE.Vector3(Math.cos(a) * 0.15, r() * 0.2, Math.sin(a) * 0.15)),
          vel: new THREE.Vector3(Math.cos(a) * speed, 0.6 + r() * 0.6, Math.sin(a) * speed),
          rot: new THREE.Euler(), spin: new THREE.Vector3(), life, max: life, size: size * (0.7 + r() * 0.6), drag: 4, grav: -0.5,
        };
      }
    };
    switch (kind) {
      case 'coup': add(10, leafCols, 3, 3, 1, 0.8); add(4, [0xfff2a0, 0xffffff], 4, 2, 1.4, 0.25, 0); break;
      case 'ruade': add(18, leafCols, 4.5, 4, 1.1, 0.95); add(7, [0xfff2a0, 0xffffff], 5, 2.5, 1.7, 0.3, 0); puff(5, 2.5, 0.22, 0.45); break;
      case 'pouf': add(30, leafCols, 3.5, 4.5, 1.2, 1.2, 4); puff(9, 2.2, 0.32, 0.6); break;
      case 'degat': add(6, [0xfff2a0, 0xffd23b, 0xffffff], 3.5, 3, 1.4, 0.35, 0); break;
      case 'roulade': puff(4, 1.2, 0.14, 0.4); break;
      case 'surgit': add(16, [0x8fae55, 0xcfc9a2, 0x5f7a3a], 2.2, 5, 1.1, 1.1, 6); break;
    }
  }

  update(dt: number) {
    const d = this.dummy;
    let n = 0;
    for (let i = 0; i < this.lp.length; i++) {
      const p = this.lp[i];
      if (!p) continue;
      p.life -= dt;
      if (p.life <= 0) { this.lp[i] = null; continue; }
      p.vel.y -= p.grav * dt;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      p.rot.set(p.rot.x + p.spin.x * dt, p.rot.y + p.spin.y * dt, p.rot.z + p.spin.z * dt);
      d.position.copy(p.pos);
      d.rotation.copy(p.rot);
      d.scale.setScalar(p.size * Math.min(1, p.life / (p.max * 0.35)));
      d.updateMatrix();
      this.leaves.setMatrixAt(i, d.matrix);
      n = i + 1;
    }
    this.leaves.count = n;
    for (let i = 0; i < n; i++) if (!this.lp[i]) this.leaves.setMatrixAt(i, ZERO);
    this.leaves.instanceMatrix.needsUpdate = true;
    let m = 0;
    for (let i = 0; i < this.pp.length; i++) {
      const p = this.pp[i];
      if (!p) continue;
      p.life -= dt;
      if (p.life <= 0) { this.pp[i] = null; continue; }
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.vel.y -= p.grav * dt;
      p.pos.addScaledVector(p.vel, dt);
      const u = 1 - p.life / p.max;
      d.position.copy(p.pos);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(p.size * (0.6 + u * 0.9) * (1 - u * u));
      d.updateMatrix();
      this.puffs.setMatrixAt(i, d.matrix);
      m = i + 1;
    }
    this.puffs.count = m;
    for (let i = 0; i < m; i++) if (!this.pp[i]) this.puffs.setMatrixAt(i, ZERO);
    this.puffs.instanceMatrix.needsUpdate = true;
  }
}

// ================================================================================================ pièces laissées
/** Pièces qui jaillissent d'un « pouf », rebondissent puis filent vers le joueur. */
export class CoinDrops {
  mesh: THREE.InstancedMesh;
  private coins: { pos: THREE.Vector3; vel: THREE.Vector3; age: number; phase: number }[] = [];
  private dummy = new THREE.Object3D();
  readonly cap: number;

  constructor(cap = 48) {
    this.cap = cap;
    const geo = new THREE.CylinderGeometry(0.2, 0.2, 0.045, 18).rotateX(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffc83a, roughness: 0.22, metalness: 1, emissive: 0xffa020, emissiveIntensity: 0.3 });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.name = 'pieces-butin';
  }

  get active() {
    return this.coins.length;
  }

  spawn(pos: THREE.Vector3, n: number) {
    for (let i = 0; i < n && this.coins.length < this.cap; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      this.coins.push({ pos: pos.clone(), vel: new THREE.Vector3(Math.cos(a) * 1.8, 4.5 + Math.random() * 1.5, Math.sin(a) * 1.8), age: 0, phase: Math.random() * 6 });
    }
  }

  /** Avance les pièces ; renvoie le nombre de pièces ramassées par le joueur. */
  update(dt: number, time: number, player: THREE.Vector3): number {
    let got = 0;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.age += dt;
      const to = new THREE.Vector3(player.x - c.pos.x, player.y + 0.5 - c.pos.y, player.z - c.pos.z);
      const d = to.length();
      if (c.age > 0.6 && d < 3.5) {
        // aimant : file vers le capybara
        c.vel.lerp(to.normalize().multiplyScalar(9), 1 - Math.exp(-dt * 10));
      } else {
        c.vel.y -= 14 * dt;
      }
      c.pos.addScaledVector(c.vel, dt);
      const g = groundAt(c.pos.x, c.pos.z, c.pos.y + 0.5) + 0.25;
      if (c.pos.y < g) {
        c.pos.y = g;
        c.vel.y = Math.abs(c.vel.y) * 0.35;
        c.vel.x *= 0.6;
        c.vel.z *= 0.6;
      }
      if ((c.age > 0.6 && d < 0.8) || c.age > 30) {
        if (c.age <= 30) got++;
        this.coins.splice(i, 1);
      }
    }
    const dd = this.dummy;
    this.coins.forEach((c, i) => {
      dd.position.copy(c.pos);
      dd.rotation.set(0, time * 5 + c.phase, 0);
      dd.scale.setScalar(1);
      dd.updateMatrix();
      this.mesh.setMatrixAt(i, dd.matrix);
    });
    this.mesh.count = this.coins.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    return got;
  }
}

// ================================================================================================ intégration
export type CombatSfx = 'coup' | 'touche' | 'aie' | 'roulade' | 'pouf' | 'piece' | 'ouf' | 'surgit';

/** Ce dont le combat a besoin du jeu. */
export interface CombatHost {
  player: Player;
  rig: CameraRig;
  input: Input;
  scene: THREE.Scene;
  teleport(p: THREE.Vector3, label: string): void;
  addCoins(n: number): void;
  sfx(name: CombatSfx): void;
  note(text: string): void;
}

export class Combat {
  core = new CombatCore();
  enemies: EnemyManager;
  hearts: HeartsUI;
  drops = new CoinDrops();
  fx = new LeafBurst();
  private yaw = 0;
  private moveDir = new THREE.Vector2(0, 1);
  private lungeLeft = 0;
  private koTeleported = false;
  private tipShown = false;
  private pose: CombatPose | null = null;

  constructor(private host: CombatHost) {
    this.enemies = new EnemyManager({ views: true });
    this.hearts = new HeartsUI();
    host.scene.add(this.enemies.group, this.drops.mesh, this.fx.group);
    fxFallback = (p, k) => this.fx.emit(p, k);
  }

  private mode(): MoveMode {
    const p = this.host.player;
    return p.vehicle ? 'drive' : p.state === 'drive' ? 'drive' : p.state;
  }

  /**
   * Avant le déplacement du joueur : lit les commandes, lance coups et roulades.
   * Renvoie vrai si le combat pilote le capybara pendant cette image (le déplacement normal est alors sauté).
   */
  update(dt: number, time: number): boolean {
    const { player, input, rig } = this.host;
    const core = this.core;
    const mode = this.mode();
    const wantAttack = input.consume('attack');
    const wantDodge = input.consume('dodge');
    const fighting = this.enemies.engagedNear(player.pos, 14);
    const frozen = core.update(dt, fighting);
    if (frozen) return true;

    if (wantDodge && core.pressDodge(mode)) this.startDodge(input, rig.moveYaw);
    if (wantAttack) {
      const i = core.pressAttack(mode);
      if (i >= 0) this.startAttack(i);
    }

    if (core.action === 'ko') {
      this.updateKo(dt, time);
      return true;
    }
    if (core.action === 'libre') {
      this.pose = null;
      return false;
    }
    this.drive(dt, time);
    return true;
  }

  /** Après le déplacement du joueur : ennemis, frappe, pièces, cœurs, effets, clignotement. */
  lateUpdate(dt: number, time: number) {
    const { player, rig } = this.host;
    const core = this.core;
    const frozen = core.hitstop > 0;
    const sdt = frozen ? 0 : dt;
    const mode = this.mode();
    const targetable = (mode === 'ground' || mode === 'air') && core.action !== 'ko' && !inSafeZone(player.pos.x, player.pos.z);

    // frappe : tous les ennemis dans l'arc pendant la fenêtre du coup
    const atk = core.attack;
    if (atk && core.inHitWindow()) {
      for (const e of this.enemies.enemies) {
        if (!e.alive || core.struck.has(e)) continue;
        if (Math.abs(e.pos.y - player.pos.y) > 1.6) continue;
        if (!inArc(player.pos.x, player.pos.z, this.yaw, e.pos.x, e.pos.z, atk.range, atk.arc, e.params.radius)) continue;
        core.struck.add(e);
        if (e.hit(atk.damage, player.pos.x, player.pos.z, atk.knockback)) {
          core.addHitstop(atk.hitstop);
          rig.addShake(atk.shake);
          const at = player.pos.clone().lerp(e.pos, 0.6).setY(e.pos.y + e.params.radius * 1.1);
          onHitFx(at, atk.fx);
          this.host.sfx('touche');
        }
      }
    }

    this.enemies.update(sdt, time, { player: player.pos, targetable, playerRadius: player.radius }, {
      hitPlayer: (e, dmg, dx, dz) => this.hurtBy(e, dmg, dx, dz),
      defeated: (e) => {
        this.drops.spawn(e.pos.clone().setY(e.pos.y + 0.4), e.params.coins);
        this.host.sfx('pouf');
      },
      fx: (p, k) => {
        onHitFx(p, k);
        if (k === 'surgit') this.host.sfx('surgit');
      },
    });

    const got = this.drops.update(sdt, time, player.pos);
    if (got) {
      this.host.addCoins(got);
      this.host.sfx('piece');
    }
    this.fx.update(sdt);
    this.hearts.set(core.halves, core.max);

    // pose et clignotement (invulnérabilité après un coup reçu)
    player.capy.combatPose(this.pose);
    player.object.visible = !(core.hurtInvuln && core.action !== 'ko' && Math.floor(time * 14) % 2 === 0);

    // conseil la première fois qu'on entre dans une prairie
    if (!this.tipShown && inTallGrass(player.pos.x, player.pos.z) && !player.vehicle) {
      this.tipShown = true;
      this.host.note('Des Grignoteurs se cachent ici ! Clic gauche : coup · Clic droit ou C : roulade');
    }
  }

  /** Coup reçu d'un ennemi : renvoie vrai si le coup porte. */
  private hurtBy(_e: Enemy, dmg: number, dx: number, dz: number): boolean {
    const res = this.core.damage(dmg);
    if (res === 'esquive') return false;
    const { player, rig } = this.host;
    this.moveDir.set(dx, dz).normalize();
    this.lungeLeft = COMBAT.hurt.knock;
    rig.addShake(0.45);
    this.hearts.hurt();
    onHitFx(player.pos.clone().setY(player.pos.y + 0.6), 'degat');
    this.host.sfx(res === 'ko' ? 'ouf' : 'aie');
    if (res === 'ko') {
      this.koTeleported = false;
      this.hearts.showOuf();
    }
    return true;
  }

  private startAttack(i: number) {
    const { player } = this.host;
    let yaw = player.yaw;
    // direction voulue (stick / ZQSD) sinon devant ; puis aide à la visée vers le Grignoteur le plus proche
    const mv = this.host.input.move();
    if (Math.hypot(mv.x, mv.y) > 0.3) {
      const cy = this.host.rig.moveYaw, fx = Math.sin(cy), fz = Math.cos(cy);
      yaw = Math.atan2(fx * mv.y - fz * mv.x, fz * mv.y + fx * mv.x);
    }
    const target = this.enemies.nearest(player.pos, COMBAT.aimAssist);
    if (target) yaw = Math.atan2(target.pos.x - player.pos.x, target.pos.z - player.pos.z);
    this.yaw = yaw;
    this.lungeLeft = COMBO[i].lunge;
    this.host.sfx('coup');
  }

  private startDodge(input: Input, camYaw: number) {
    const { player } = this.host;
    const mv = input.move();
    let dx = Math.sin(player.yaw), dz = Math.cos(player.yaw);
    if (Math.hypot(mv.x, mv.y) > 0.3) {
      const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
      dx = fx * mv.y - fz * mv.x;
      dz = fz * mv.y + fx * mv.x;
    }
    this.moveDir.set(dx, dz).normalize();
    this.yaw = Math.atan2(this.moveDir.x, this.moveDir.y);
    this.lungeLeft = COMBAT.dodge.distance;
    onHitFx(player.pos.clone().setY(player.pos.y + 0.1), 'roulade');
    this.host.sfx('roulade');
  }

  /** Pilote le capybara pendant un coup, une roulade ou un sursaut. */
  private drive(dt: number, time: number) {
    const { player } = this.host;
    const core = this.core;
    let speed = 0;
    let dirX = Math.sin(this.yaw), dirZ = Math.cos(this.yaw);
    if (core.action === 'attaque') {
      const a = core.attack!;
      // élan pendant la préparation et la frappe, arrêté au contact d'un ennemi
      const near = this.enemies.nearest(player.pos, 0.95);
      if (core.t < a.hitTo && !near) speed = a.lunge / a.hitTo;
      player.yaw = dampAngle(player.yaw, this.yaw, 30, dt);
      this.pose = { kind: a.id, t: core.t / a.duration };
    } else if (core.action === 'roulade') {
      // vitesse décroissante : 3 m en 0,42 s
      const u = core.t / COMBAT.dodge.duration;
      speed = ((2 * COMBAT.dodge.distance) / COMBAT.dodge.duration) * Math.max(0, 1 - u);
      dirX = this.moveDir.x; dirZ = this.moveDir.y;
      player.yaw = this.yaw;
      this.pose = { kind: 'roulade', t: u };
    } else if (core.action === 'sursaut') {
      const u = core.t / COMBAT.hurt.duration;
      speed = ((2 * COMBAT.hurt.knock) / COMBAT.hurt.duration) * Math.max(0, 1 - u);
      dirX = this.moveDir.x; dirZ = this.moveDir.y;
      this.pose = { kind: 'sursaut', t: u };
    }
    const step = Math.min(speed * dt, Math.max(0, this.lungeLeft));
    this.lungeLeft -= step;
    if (step > 0) this.slide(dirX * step, dirZ * step);
    player.vel.set(dirX * speed * 0.5, 0, dirZ * speed * 0.5);
    player.capy.animate(dt, 0, 'ground', time);
    player.capy.root.position.copy(player.pos);
    player.capy.root.rotation.set(0, player.yaw, 0);
  }

  /** Déplacement piloté : murs, marches, pas de chute dans l'eau ni du haut d'un rebord. */
  private slide(dx: number, dz: number) {
    const p = this.host.player;
    const r = resolveCircle(p.pos.x + dx, p.pos.z + dz, p.pos.y, p.radius, 0.9);
    const g = groundAt(r.x, r.z, p.pos.y + 0.5, p.radius * 0.5);
    if (g < WATER_LEVEL - 0.55) return; // ne roule pas dans l'eau
    if (g > p.pos.y + 0.55 || g < p.pos.y - 0.6) return; // mur ou rebord : on s'arrête
    p.pos.set(r.x, g, r.z);
    p.grounded = true;
    if (g > WATER_LEVEL) p.lastSafe.copy(p.pos);
  }

  /** « Ouf ! » : couché, écran crème, réveil au bord du bain extérieur avec tous ses cœurs (rien n'est perdu). */
  private updateKo(dt: number, time: number) {
    const { player } = this.host;
    const core = this.core;
    this.pose = { kind: 'ko', t: Math.min(1, core.t / 0.5) };
    if (!this.koTeleported && core.t >= COMBAT.ko.teleportAt) {
      this.koTeleported = true;
      const wake = new THREE.Vector3(WAKE_POINT.x, 30, WAKE_POINT.z);
      wake.y = groundAt(wake.x, wake.z, 40);
      this.host.teleport(wake, '');
      player.yaw = Math.atan2(60 - WAKE_POINT.x, 70 - WAKE_POINT.z); // regarde le bain
      this.host.rig.yaw = player.yaw;
      this.enemies.resetAll();
    }
    if (core.t >= COMBAT.ko.duration) {
      core.revive();
      this.pose = null;
      this.hearts.hideOuf();
      this.host.note('Tout reposé ! ♨ Tes cœurs sont revenus.');
    }
    player.vel.set(0, 0, 0);
    player.capy.animate(dt, 0, 'ground', time);
    player.capy.root.position.copy(player.pos);
    player.capy.root.rotation.set(0, player.yaw, 0);
  }
}
