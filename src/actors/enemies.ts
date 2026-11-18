// Ennemis des prairies de susuki (première version, écrite par la spécialité Combat).
// Le Grignoteur : petite boule de ronces aux yeux grincheux, cachée dans les hautes herbes, qui surgit, prévient
// (télégraphe), roule vers le joueur, recule quand on la touche et disparaît en « pouf » de feuilles en laissant des pièces.
//
// Organisation (à enrichir par l'agent « Ennemis & faune ») :
//  - `EnemyParams` / `grignoteurParams()` : réglages par type d'ennemi et par difficulté de prairie ;
//  - `Enemy` : logique commune sans rendu (zone, nid, points de vie, recul, confinement, réapparition) — testable ;
//  - `Grignoteur` : comportement propre (cachette, surgissement, poursuite, télégraphe, roulade, étourdi, patrouille) ;
//  - `GrignoteurView` : modèle 3D procédural et animation, séparés de la logique (interface `EnemyView`) ;
//  - `EnemyManager` : création depuis `ENEMY_NESTS`, mise à jour, séparation, compteurs pour les missions.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ENEMY_NESTS, ENEMY_RULES, SAFE_ZONES, TALL_GRASS_ZONES } from '../world/zones';
import { groundAt, resolveCircle } from '../world/physics';
import { clamp, damp, dampAngle, lerp, Rng } from '../core/math';

export type Zone = (typeof TALL_GRASS_ZONES)[number];
export type Nest = (typeof ENEMY_NESTS)[number];

// ================================================================================================ réglages
export interface EnemyParams {
  hp: number;
  /** rayon de collision (m) */
  radius: number;
  /** distance de repérage du joueur (m) */
  aggroRadius: number;
  /** marge autorisée hors de la prairie (m) */
  leash: number;
  respawnSeconds: number;
  /** rayon de la boucle de patrouille, relatif au rayon de la prairie */
  patrolRadius: number;
  chaseSpeed: number;
  patrolSpeed: number;
  /** distance à laquelle il prépare sa roulade (m) */
  attackRange: number;
  /** durée du signal avant la roulade (s) */
  telegraph: number;
  /** fraction du télégraphe pendant laquelle il vise encore le joueur ; ensuite la direction est figée */
  aimFraction: number;
  rollSpeed: number;
  rollDistance: number;
  /** pause après une roulade : c'est le moment de le frapper (s) */
  dizzy: number;
  /** pause minimale entre deux roulades (s) */
  attackCooldown: number;
  /** durée du recul quand il est touché (s) */
  knockTime: number;
  /** dégâts au joueur, en demi-cœurs */
  damage: number;
  /** pièces laissées au « pouf » */
  coins: number;
  surgeTime: number;
  /** au-delà, il abandonne la poursuite (m) */
  giveUpRadius: number;
  patrolTime: number;
  /** hauteur des yeux au-dessus du sol quand il est caché (m) ; à ajuster à la hauteur des susuki */
  hideEyeHeight: number;
}

export const GRIGNOTEUR: EnemyParams = {
  hp: 3,
  radius: 0.34,
  aggroRadius: ENEMY_RULES.aggroRadius,
  leash: ENEMY_RULES.leash,
  respawnSeconds: ENEMY_RULES.respawnSeconds,
  patrolRadius: ENEMY_RULES.patrolRadius,
  chaseSpeed: 2.8,
  patrolSpeed: 1.4,
  attackRange: 4.5,
  telegraph: 0.6,
  aimFraction: 0.5,
  rollSpeed: 8.5,
  rollDistance: 6,
  dizzy: 0.9,
  attackCooldown: 0.7,
  knockTime: 0.35,
  damage: 1,
  coins: 3,
  surgeTime: 0.45,
  giveUpRadius: 13,
  patrolTime: 7,
  hideEyeHeight: 0.45,
};

/** Réglages du Grignoteur selon la difficulté de la prairie (1 Levant, 2 Gué, 3 Plateau). */
export function grignoteurParams(difficulty: 1 | 2 | 3): EnemyParams {
  const p = { ...GRIGNOTEUR };
  if (difficulty >= 2) Object.assign(p, { chaseSpeed: 3.2, rollSpeed: 9.5, telegraph: 0.55, coins: 4, dizzy: 0.8 });
  if (difficulty >= 3) Object.assign(p, { chaseSpeed: 3.6, rollSpeed: 10.5, telegraph: 0.5, coins: 5, dizzy: 0.7, damage: 2 });
  return p;
}

// ================================================================================================ zones
/**
 * Garde un point dans sa prairie (rayon + laisse) et hors de toutes les zones sûres.
 * Renvoie le point corrigé et `clamped` s'il a fallu le déplacer.
 */
export function confine(x: number, z: number, zone: { x: number; z: number; r: number }, leash: number, safe = SAFE_ZONES) {
  let cx = x, cz = z, clamped = false;
  for (let pass = 0; pass < 2; pass++) {
    const dx = cx - zone.x, dz = cz - zone.z, d = Math.hypot(dx, dz), max = zone.r + leash;
    if (d > max) {
      cx = zone.x + (dx / d) * max;
      cz = zone.z + (dz / d) * max;
      clamped = true;
    }
    for (const s of safe) {
      const sx = cx - s.x, sz = cz - s.z, sd = Math.hypot(sx, sz);
      if (sd >= s.r) continue;
      const nx = sd > 1e-6 ? sx / sd : 1, nz = sd > 1e-6 ? sz / sd : 0;
      cx = s.x + nx * (s.r + 0.01);
      cz = s.z + nz * (s.r + 0.01);
      clamped = true;
    }
  }
  return { x: cx, z: cz, clamped };
}

// ================================================================================================ logique commune
export type EnemyState =
  | 'cache' // caché dans les herbes, seuls les yeux dépassent
  | 'surgit' // bondit hors de sa cachette
  | 'poursuite'
  | 'telegraphe' // signal lisible avant d'attaquer
  | 'roule' // attaque : roule vers le joueur
  | 'etourdi' // pause après la roulade
  | 'recul' // vient d'être touché
  | 'patrouille'
  | 'retour' // rentre au nid
  | 'pouf' // disparaît en feuilles
  | 'absent'; // attend sa réapparition

export interface EnemyContext {
  player: THREE.Vector3;
  /** le joueur peut être pris pour cible (à pied, pas KO, hors zone sûre) */
  targetable: boolean;
  playerRadius: number;
}

export interface EnemyEvents {
  /** l'ennemi touche le joueur ; renvoie vrai si le coup a porté (faux si le joueur est invulnérable) */
  hitPlayer?(e: Enemy, damage: number, dirX: number, dirZ: number): boolean;
  defeated?(e: Enemy): void;
  fx?(pos: THREE.Vector3, kind: 'surgit' | 'pouf'): void;
}

/** Rendu d'un ennemi, séparé de sa logique. */
export interface EnemyView {
  root: THREE.Object3D;
  sync(e: Enemy, dt: number, time: number): void;
}

export abstract class Enemy {
  readonly pos = new THREE.Vector3();
  /** vitesse horizontale (x, z) */
  readonly vel = new THREE.Vector2();
  readonly home = new THREE.Vector3();
  yaw = 0;
  hp: number;
  state: EnemyState = 'cache';
  stateT = 0;
  respawnT = 0;
  /** 1 au moment d'un coup reçu, retombe à 0 (flash) */
  hitFlash = 0;
  view: EnemyView | null = null;
  /** a heurté un obstacle ou le bord de sa zone pendant ce pas */
  protected bumped = false;
  private invuln = 0;
  private poufSent = false;

  constructor(readonly type: string, readonly zone: Zone, home: { x: number; z: number }, readonly params: EnemyParams, readonly id: number) {
    this.hp = params.hp;
    const c = confine(home.x, home.z, zone, 0);
    this.home.set(c.x, groundAt(c.x, c.z), c.z);
    this.pos.copy(this.home);
    this.yaw = (id * 2.399) % (Math.PI * 2);
  }

  /** présent dans le monde (ni « pouf » ni en attente de réapparition) */
  get alive() {
    return this.state !== 'pouf' && this.state !== 'absent';
  }

  /** engagé dans un combat (sert à suspendre la régénération du joueur) */
  get engaged() {
    return this.state === 'surgit' || this.state === 'poursuite' || this.state === 'telegraphe' || this.state === 'roule' || this.state === 'etourdi' || this.state === 'recul';
  }

  setState(s: EnemyState) {
    this.state = s;
    this.stateT = 0;
  }

  /** Le joueur peut-il être poursuivi ? (cible valide et pas trop loin de la prairie) */
  protected reachable(ctx: EnemyContext) {
    return ctx.targetable && Math.hypot(ctx.player.x - this.zone.x, ctx.player.z - this.zone.z) <= this.zone.r + this.params.leash;
  }

  /**
   * Reçoit un coup. `knock` = vitesse de recul (m/s). Renvoie vrai si le coup compte.
   * Une courte invulnérabilité évite qu'un même coup compte deux fois.
   */
  hit(damage: number, fromX: number, fromZ: number, knock: number): boolean {
    if (!this.alive || this.invuln > 0) return false;
    this.hp -= damage;
    this.hitFlash = 1;
    this.invuln = 0.12;
    let dx = this.pos.x - fromX, dz = this.pos.z - fromZ;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    this.yaw = Math.atan2(-dx, -dz); // regarde celui qui l'a touché
    if (this.hp <= 0) {
      this.hp = 0;
      this.vel.set(dx * knock * 0.4, dz * knock * 0.4);
      this.setState('pouf');
    } else {
      this.vel.set(dx * knock, dz * knock);
      this.setState('recul');
    }
    return true;
  }

  update(dt: number, ctx: EnemyContext, ev: EnemyEvents = {}) {
    this.stateT += dt;
    this.invuln -= dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    if (this.state === 'absent') {
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.respawn();
      return;
    }
    if (this.state === 'pouf') {
      if (!this.poufSent) {
        this.poufSent = true;
        ev.fx?.(this.pos.clone().setY(this.pos.y + this.params.radius), 'pouf');
        ev.defeated?.(this);
      }
      this.vel.multiplyScalar(Math.exp(-10 * dt));
      this.move(dt);
      if (this.stateT > 0.3) {
        this.setState('absent');
        this.respawnT = this.params.respawnSeconds;
      }
      return;
    }
    this.think(dt, ctx, ev);
    this.move(dt);
  }

  /** Comportement propre au type d'ennemi : règle `vel`, `yaw` et les changements d'état. */
  protected abstract think(dt: number, ctx: EnemyContext, ev: EnemyEvents): void;

  /** Intègre la vitesse : obstacles, confinement dans la prairie et hors des zones sûres, sol. */
  protected move(dt: number) {
    this.bumped = false;
    if (this.vel.lengthSq() < 1e-8) return;
    const r = resolveCircle(this.pos.x + this.vel.x * dt, this.pos.z + this.vel.y * dt, this.pos.y, this.params.radius, 0.6);
    const c = confine(r.x, r.z, this.zone, this.params.leash);
    this.bumped = r.hit || c.clamped;
    this.pos.x = c.x;
    this.pos.z = c.z;
    this.pos.y = groundAt(c.x, c.z, this.pos.y + 0.6);
  }

  /** Réapparition au nid, caché, avec tous ses points de vie. */
  respawn() {
    this.hp = this.params.hp;
    this.pos.copy(this.home);
    this.pos.y = groundAt(this.home.x, this.home.z, this.home.y + 1);
    this.vel.set(0, 0);
    this.poufSent = false;
    this.setState('cache');
  }

  /** Retour immédiat au nid (après un « Ouf ! » du joueur). `revive` fait aussi revenir les absents. */
  reset(revive = false) {
    if (this.alive || revive) this.respawn();
  }
}

// ================================================================================================ Grignoteur
export class Grignoteur extends Enemy {
  /** direction de la roulade (figée pendant la fin du télégraphe) */
  readonly rollDir = new THREE.Vector2(0, 1);
  private rollLeft = 0;
  private cooldown = 0;

  constructor(zone: Zone, home: { x: number; z: number }, params: EnemyParams, id: number) {
    super('grignoteur', zone, home, params, id);
  }

  protected think(dt: number, ctx: EnemyContext, ev: EnemyEvents) {
    const P = this.params;
    const dx = ctx.player.x - this.pos.x, dz = ctx.player.z - this.pos.z;
    const dP = Math.hypot(dx, dz) || 1e-6;
    const ux = dx / dP, uz = dz / dP;
    const reach = this.reachable(ctx);
    this.cooldown -= dt;
    const steer = (tx: number, tz: number, speed: number, k = 8) => {
      this.vel.x = damp(this.vel.x, tx * speed, k, dt);
      this.vel.y = damp(this.vel.y, tz * speed, k, dt);
    };
    switch (this.state) {
      case 'cache':
        this.vel.set(0, 0);
        if (reach && dP < P.aggroRadius) {
          this.yaw = Math.atan2(ux, uz);
          this.setState('surgit');
          ev.fx?.(this.pos.clone().setY(this.pos.y + 0.4), 'surgit');
        }
        break;
      case 'surgit':
        // petit bond hors des herbes, vers le joueur
        steer(ux, uz, 1.6, 10);
        this.yaw = dampAngle(this.yaw, Math.atan2(ux, uz), 10, dt);
        if (this.stateT >= P.surgeTime) this.setState('poursuite');
        break;
      case 'poursuite':
        if (!reach || dP > P.giveUpRadius) {
          this.setState('patrouille');
          break;
        }
        this.yaw = dampAngle(this.yaw, Math.atan2(ux, uz), 8, dt);
        steer(ux, uz, dP > 1.4 ? P.chaseSpeed : 0);
        if (dP < P.attackRange && this.cooldown <= 0) {
          this.rollDir.set(ux, uz);
          this.setState('telegraphe');
        }
        break;
      case 'telegraphe':
        steer(0, 0, 0, 14);
        // vise le joueur au début, puis la direction est figée (la flèche au sol la montre)
        if (this.stateT < P.telegraph * P.aimFraction) this.rollDir.set(ux, uz);
        this.yaw = dampAngle(this.yaw, Math.atan2(this.rollDir.x, this.rollDir.y), 14, dt);
        if (this.stateT >= P.telegraph) {
          this.rollLeft = P.rollDistance;
          this.setState('roule');
        }
        break;
      case 'roule': {
        this.vel.set(this.rollDir.x * P.rollSpeed, this.rollDir.y * P.rollSpeed);
        this.yaw = Math.atan2(this.rollDir.x, this.rollDir.y);
        this.rollLeft -= P.rollSpeed * dt;
        if (ctx.targetable && dP < P.radius + ctx.playerRadius + 0.15) {
          if (ev.hitPlayer?.(this, P.damage, this.rollDir.x, this.rollDir.y)) {
            // rebondit sur le joueur
            this.vel.set(-this.rollDir.x * 3, -this.rollDir.y * 3);
            this.setState('etourdi');
            break;
          }
        }
        if (this.rollLeft <= 0 || (this.bumped && this.stateT > 0.05)) this.setState('etourdi');
        break;
      }
      case 'etourdi':
        steer(0, 0, 0, 6);
        if (this.stateT >= P.dizzy) {
          this.cooldown = P.attackCooldown;
          this.setState('poursuite');
        }
        break;
      case 'recul':
        this.vel.multiplyScalar(Math.exp(-8 * dt));
        if (this.stateT >= P.knockTime) {
          this.cooldown = P.attackCooldown;
          this.setState(reach ? 'poursuite' : 'patrouille');
        }
        break;
      case 'patrouille': {
        if (reach && dP < P.aggroRadius) {
          this.setState('poursuite');
          break;
        }
        // boucle autour du centre de la prairie (sens horaire), à patrolRadius × rayon
        const R = this.zone.r * P.patrolRadius;
        const a = Math.atan2(this.pos.z - this.zone.z, this.pos.x - this.zone.x) + 0.45;
        const tx = this.zone.x + Math.cos(a) * R - this.pos.x, tz = this.zone.z + Math.sin(a) * R - this.pos.z;
        const l = Math.hypot(tx, tz) || 1;
        steer(tx / l, tz / l, P.patrolSpeed, 4);
        this.yaw = dampAngle(this.yaw, Math.atan2(tx, tz), 5, dt);
        if (this.stateT > P.patrolTime) this.setState('retour');
        break;
      }
      case 'retour': {
        if (reach && dP < P.aggroRadius) {
          this.setState('poursuite');
          break;
        }
        const tx = this.home.x - this.pos.x, tz = this.home.z - this.pos.z;
        const l = Math.hypot(tx, tz);
        if (l < 0.3) {
          this.vel.set(0, 0);
          this.pos.copy(this.home);
          this.setState('cache');
          break;
        }
        steer(tx / l, tz / l, P.patrolSpeed * 1.4, 6);
        this.yaw = dampAngle(this.yaw, Math.atan2(tx, tz), 6, dt);
        break;
      }
    }
    // ne se colle pas au joueur (sauf quand il roule sur lui)
    if (this.state !== 'roule' && this.state !== 'cache') {
      const min = P.radius + ctx.playerRadius + 0.1;
      if (dP < min) {
        this.pos.x -= ux * (min - dP);
        this.pos.z -= uz * (min - dP);
      }
    }
  }
}

// ================================================================================================ rendu du Grignoteur
let shared: {
  body: THREE.BufferGeometry;
  whites: THREE.BufferGeometry;
  pupils: THREE.BufferGeometry;
  brows: THREE.BufferGeometry;
  bodyMat: THREE.MeshStandardMaterial;
  whiteMat: THREE.MeshStandardMaterial;
  pupilMat: THREE.MeshStandardMaterial;
  browMat: THREE.MeshStandardMaterial;
  bang: THREE.SpriteMaterial;
  arrowMat: THREE.MeshBasicMaterial;
  tuft: THREE.BufferGeometry;
  tuftMat: THREE.MeshStandardMaterial;
} | null = null;

/** Prépare une géométrie pour la fusion : non indexée, avec position, normal, uv et couleur unie. */
function prep(g: THREE.BufferGeometry, color: number | THREE.Color) {
  const n = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color);
  const count = n.attributes.position.count;
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) col.set([c.r, c.g, c.b], i * 3);
  n.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) n.deleteAttribute(k);
  return n;
}

/** Point sur la sphère de rayon r selon (azimut, hauteur). */
const onSphere = (r: number, az: number, el: number) => new THREE.Vector3(Math.cos(el) * Math.sin(az) * r, Math.sin(el) * r, Math.cos(el) * Math.cos(az) * r);

function buildShared() {
  if (shared) return shared;
  const R = GRIGNOTEUR.radius;
  const rng = new Rng(77);
  const parts: THREE.BufferGeometry[] = [];

  // boule de ronces : sphère bosselée, vert olive taché de violet
  // (sommets fusionnés pour des normales lisses, puis dé-indexée pour la fusion avec le reste)
  const ico = new THREE.IcosahedronGeometry(R * 0.92, 3);
  ico.deleteAttribute('uv');
  ico.deleteAttribute('normal');
  const ball = mergeVertices(ico);
  const pos = ball.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const col = new Float32Array(pos.count * 3);
  const green = new THREE.Color(0x4d5f2a), purple = new THREE.Color(0x5b3352), moss = new THREE.Color(0x6f7f34);
  const bump = (p: THREE.Vector3) => Math.sin(p.x * 23 + 1.3) * Math.sin(p.y * 19 + 0.4) * Math.sin(p.z * 21 + 2.1);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = bump(v);
    v.multiplyScalar(1 + n * 0.07);
    pos.setXYZ(i, v.x, v.y, v.z);
    const c = green.clone().lerp(purple, clamp(0.5 + n * 0.9, 0, 1)).lerp(moss, clamp(v.y / R, 0, 1) * 0.35);
    col.set([c.r, c.g, c.b], i * 3);
  }
  ball.setAttribute('color', new THREE.BufferAttribute(col, 3));
  ball.computeVertexNormals();
  const ballFlat = ball.toNonIndexed();
  ballFlat.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ballFlat.attributes.position.count * 2), 2));
  parts.push(ballFlat);

  // tiges de ronce enroulées autour de la boule
  for (let k = 0; k < 7; k++) {
    const pts: THREE.Vector3[] = [];
    const az0 = rng.range(0, Math.PI * 2), tilt = rng.range(-1, 1);
    for (let i = 0; i <= 10; i++) {
      const a = az0 + (i / 10) * Math.PI * 1.6;
      const el = Math.sin(a * 1.3 + k) * 0.7 * tilt;
      pts.push(onSphere(R * rng.range(0.97, 1.04), a, el));
    }
    parts.push(prep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, R * 0.07, 5), k % 2 ? 0x6b3a5e : 0x553047));
  }
  // épines arrondies, couleur crème rosée (mignonnes, pas menaçantes)
  for (let k = 0; k < 34; k++) {
    const az = rng.range(0, Math.PI * 2), el = rng.range(-0.9, 1.3);
    if (Math.abs(az) < 0.9 && el > -0.3 && el < 0.6) continue; // laisse le visage dégagé
    const n = onSphere(1, az, el);
    const cone = new THREE.ConeGeometry(R * 0.08, R * 0.3, 6);
    cone.translate(0, R * 0.15, 0);
    cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n));
    cone.translate(n.x * R * 0.96, n.y * R * 0.96, n.z * R * 0.96);
    parts.push(prep(cone, 0xe6c3a8));
  }
  // deux feuilles et une mûre sur le dessus
  for (const s of [-1, 1]) {
    const leaf = new THREE.SphereGeometry(R * 0.32, 10, 6);
    leaf.scale(1, 0.18, 0.55);
    leaf.rotateZ(s * 0.6);
    leaf.translate(s * R * 0.32, R * 1.02, -R * 0.1);
    parts.push(prep(leaf, 0x77b03c));
  }
  for (let i = 0; i < 7; i++) {
    const d = new THREE.SphereGeometry(R * 0.07, 6, 5);
    const a = (i / 7) * Math.PI * 2;
    d.translate(Math.cos(a) * R * 0.08 + R * 0.05, R * 1.05 + (i % 2) * R * 0.05, Math.sin(a) * R * 0.08 - R * 0.35);
    parts.push(prep(d, 0x2f1638));
  }
  const body = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;

  // yeux : grands, blancs, avec reflets ; pupilles ; sourcils froncés (l'air grincheux)
  const eyeY = R * 0.18, eyeZ = R * 0.86, eyeX = R * 0.36;
  const whites: THREE.BufferGeometry[] = [], pupils: THREE.BufferGeometry[] = [], brows: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const w = new THREE.SphereGeometry(R * 0.27, 16, 12);
    w.scale(1, 1.1, 0.55);
    w.translate(s * eyeX, eyeY, eyeZ);
    whites.push(prep(w, 0xfbf7ee));
    const p = new THREE.SphereGeometry(R * 0.13, 12, 10);
    p.scale(1, 1.1, 0.5);
    p.translate(s * eyeX * 0.86, eyeY - R * 0.02, eyeZ + R * 0.13);
    pupils.push(prep(p, 0x1b120e));
    const shine = new THREE.SphereGeometry(R * 0.04, 8, 6);
    shine.translate(s * eyeX * 0.86 + R * 0.05, eyeY + R * 0.06, eyeZ + R * 0.19);
    whites.push(prep(shine, 0xffffff));
    const b = new THREE.BoxGeometry(R * 0.62, R * 0.13, R * 0.14);
    b.rotateZ(s * 0.42); // côté intérieur plus bas = sourcils froncés
    b.translate(s * eyeX, eyeY + R * 0.3, eyeZ + R * 0.06);
    brows.push(prep(b, 0x3a2032));
  }

  // touffe d'herbes du nid : brins argentés comme les susuki (remplacée plus tard par la Végétation)
  const tuftParts: THREE.BufferGeometry[] = [];
  const base = new THREE.Color(0x4f6b2e), tip = new THREE.Color(0xcfc9a2);
  for (let i = 0; i < 54; i++) {
    const a = rng.range(0, Math.PI * 2), d = i < 14 ? rng.range(0.05, 0.3) : rng.range(0.3, 0.85);
    const h = rng.range(0.55, 0.95), w = rng.range(0.035, 0.06);
    const blade = new THREE.PlaneGeometry(w, h, 1, 4);
    blade.translate(0, h / 2, 0);
    const bp = blade.attributes.position as THREE.BufferAttribute;
    const bc = new Float32Array(bp.count * 3);
    const lean = rng.range(0.15, 0.5);
    for (let j = 0; j < bp.count; j++) {
      const y = bp.getY(j), t = y / h;
      bp.setX(j, bp.getX(j) * (1 - t * 0.85));
      bp.setZ(j, t * t * lean * h);
      const c = base.clone().lerp(tip, t * t);
      bc.set([c.r, c.g, c.b], j * 3);
    }
    blade.setAttribute('color', new THREE.BufferAttribute(bc, 3));
    blade.rotateY(rng.range(0, Math.PI * 2));
    blade.translate(Math.cos(a) * d, -0.02, Math.sin(a) * d);
    blade.computeVertexNormals();
    tuftParts.push(blade.toNonIndexed());
  }

  shared = {
    body,
    whites: mergeGeometries(whites)!,
    pupils: mergeGeometries(pupils)!,
    brows: mergeGeometries(brows)!,
    bodyMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }),
    whiteMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25 }),
    pupilMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15 }),
    browMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    bang: new THREE.SpriteMaterial({ map: bangTexture(), depthTest: false, transparent: true }),
    arrowMat: new THREE.MeshBasicMaterial({ map: arrowTexture(), transparent: true, depthWrite: false, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }),
    tuft: mergeGeometries(tuftParts)!,
    tuftMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }),
  };
  return shared;
}

/** Bulle « ! » orange au-dessus d'un Grignoteur qui va foncer. */
function bangTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ff8a2a';
  g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#fff4dc'; g.lineWidth = 9; g.stroke();
  g.fillStyle = '#fff'; g.font = 'bold 86px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('!', 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Chevrons au sol qui montrent la direction de la roulade. */
function arrowTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 256, 0, 0);
  grad.addColorStop(0, 'rgba(255,170,60,0.0)');
  grad.addColorStop(0.15, 'rgba(255,170,60,0.55)');
  grad.addColorStop(1, 'rgba(255,120,40,0.0)');
  g.fillStyle = grad;
  g.fillRect(8, 0, 48, 256);
  g.strokeStyle = 'rgba(255,248,230,0.9)';
  g.lineWidth = 7;
  g.lineCap = 'round';
  for (let y = 40; y < 250; y += 52) {
    g.beginPath(); g.moveTo(14, y + 16); g.lineTo(32, y); g.lineTo(50, y + 16); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Modèle 3D et animation d'un Grignoteur (lit l'état de la logique, ne le modifie jamais). */
export class GrignoteurView implements EnemyView {
  root = new THREE.Group();
  private bob = new THREE.Group();
  private spin = new THREE.Group();
  private face = new THREE.Group();
  private pupils: THREE.Mesh;
  private brows: THREE.Mesh;
  private bodyMat: THREE.MeshStandardMaterial;
  private bang: THREE.Sprite;
  private arrow: THREE.Mesh;
  private spinAngle = 0;
  private blinkT = 1 + Math.random() * 3;
  private wasState: EnemyState = 'cache';
  private hop = Math.random() * 6;

  constructor(e: Enemy) {
    const S = buildShared();
    this.bodyMat = S.bodyMat.clone();
    const body = new THREE.Mesh(S.body, this.bodyMat);
    body.castShadow = true;
    const whites = new THREE.Mesh(S.whites, S.whiteMat);
    this.pupils = new THREE.Mesh(S.pupils, S.pupilMat);
    this.brows = new THREE.Mesh(S.brows, S.browMat);
    this.face.add(whites, this.pupils, this.brows);
    this.spin.add(body, this.face);
    this.bob.add(this.spin);
    this.root.add(this.bob);
    this.bang = new THREE.Sprite(S.bang);
    this.bang.scale.setScalar(0.5);
    this.bang.renderOrder = 10;
    this.bang.visible = false;
    this.root.add(this.bang);
    const L = e.params.rollDistance;
    this.arrow = new THREE.Mesh(new THREE.PlaneGeometry(0.7, L).rotateX(-Math.PI / 2).translate(0, 0.06, L / 2 + 0.3), S.arrowMat.clone());
    this.arrow.visible = false;
    this.arrow.renderOrder = 2;
    this.root.add(this.arrow);
    this.root.name = 'grignoteur';
  }

  sync(e: Enemy, dt: number, time: number) {
    const P = e.params, R = P.radius;
    this.root.visible = e.state !== 'absent';
    if (!this.root.visible) return;
    this.root.position.copy(e.pos);
    this.root.rotation.y = e.yaw;
    const st = e.state;
    if (st !== this.wasState) this.wasState = st;
    let y = R, sx = 1, sy = 1, tilt = 0, shake = 0, wobble = 0, browDrop = 0;
    let px = Math.sin(time * 0.8 + e.id) * R * 0.03, py = 0;
    // centre de la boule quand il est caché : seuls les yeux dépassent des herbes
    const hideY = P.hideEyeHeight - R * 0.65;
    const T = 2 * Math.PI;
    switch (st) {
      case 'cache':
        y = hideY + Math.sin(time * 1.3 + e.id) * 0.025;
        tilt = -0.65;
        px = Math.sin(time * 0.6 + e.id * 1.7) * R * 0.06;
        break;
      case 'surgit': {
        const u = clamp(e.stateT / P.surgeTime, 0, 1);
        y = lerp(hideY, R, u) + Math.sin(Math.PI * u) * 0.75;
        tilt = lerp(-0.65, 0, u);
        this.spinAngle = -T * u * u * (3 - 2 * u); // petite pirouette arrière
        break;
      }
      case 'telegraphe': {
        const u = clamp(e.stateT / P.telegraph, 0, 1);
        sx = 1 + 0.16 * u;
        sy = 1 - 0.2 * u;
        y = R * sy;
        shake = Math.sin(time * 55) * 0.035 * (0.3 + u);
        browDrop = R * 0.08 * u;
        break;
      }
      case 'roule':
        this.spinAngle += (P.rollSpeed / R) * dt;
        break;
      case 'etourdi':
        wobble = Math.sin(time * 11) * 0.22 * (1 - clamp(e.stateT / P.dizzy, 0, 1));
        px = Math.cos(time * 12) * R * 0.05;
        py = Math.sin(time * 12) * R * 0.05;
        break;
      case 'recul': {
        const u = clamp(e.stateT / P.knockTime, 0, 1);
        sy = lerp(0.75, 1, u);
        sx = lerp(1.18, 1, u);
        y = R * sy;
        tilt = -0.35 * (1 - u);
        break;
      }
      case 'pouf': {
        const u = clamp(e.stateT / 0.3, 0, 1);
        const s = u < 0.35 ? 1 + u * 0.8 : 1.28 * (1 - (u - 0.35) / 0.65);
        sx = sy = Math.max(0.001, s);
        break;
      }
      default: {
        // poursuite, patrouille, retour : petits bonds
        const speed = e.vel.length();
        this.hop += dt * (4 + speed * 2.2);
        const h = Math.abs(Math.sin(this.hop));
        y = R + h * Math.min(0.14, speed * 0.05);
        sy = 1 - (1 - h) * 0.08 * Math.min(1, speed);
        sx = 1 + (1 - h) * 0.05 * Math.min(1, speed);
      }
    }
    // fin de roulade : la boule se remet à l'endroit (yeux devant)
    if (st !== 'roule' && st !== 'surgit') {
      const target = Math.round(this.spinAngle / T) * T;
      this.spinAngle = damp(this.spinAngle, target, 9, dt);
      if (Math.abs(this.spinAngle - target) < 1e-3) this.spinAngle = 0;
    }
    this.bob.position.set(shake, y, 0);
    this.bob.scale.set(sx, sy, sx);
    this.bob.rotation.z = wobble;
    this.spin.rotation.x = this.spinAngle + tilt;
    // regard et clignement
    this.pupils.position.set(px, py, 0);
    this.brows.position.y = -browDrop;
    this.blinkT -= dt;
    if (this.blinkT < 0) this.blinkT = 1.5 + Math.random() * 3.5;
    this.face.scale.y = this.blinkT < 0.1 && st !== 'telegraphe' ? 0.15 : 1;
    // flash blanc quand il est touché
    this.bodyMat.emissive.setScalar(e.hitFlash * 0.7);
    // télégraphe : bulle « ! » et chevrons au sol
    const tele = st === 'telegraphe';
    this.bang.visible = tele;
    this.arrow.visible = tele;
    if (tele) {
      const u = clamp(e.stateT / P.telegraph, 0, 1);
      this.bang.position.y = R * 2 + 0.45 + Math.abs(Math.sin(time * 14)) * 0.08;
      this.bang.scale.setScalar(0.35 + 0.2 * Math.min(1, u * 3));
      (this.arrow.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.6 * u;
      // la flèche suit la direction de la roulade (le corps peut encore tourner)
      const g = e as Grignoteur;
      if (g.rollDir) this.arrow.rotation.y = Math.atan2(g.rollDir.x, g.rollDir.y) - e.yaw;
    }
  }
}

// ================================================================================================ gestionnaire
export class EnemyManager {
  enemies: Enemy[] = [];
  group = new THREE.Group();
  /** nombre de « pouf » par prairie depuis le début de la partie (missions) */
  defeated: Record<string, number> = {};
  private tufts: { mesh: THREE.Mesh; x: number; z: number }[] = [];
  readonly withViews: boolean;

  constructor(opts: { views?: boolean; zones?: Zone[]; nests?: Nest[] } = {}) {
    this.withViews = opts.views ?? true;
    const zones = opts.zones ?? TALL_GRASS_ZONES;
    const nests = opts.nests ?? ENEMY_NESTS;
    let id = 0;
    for (const zone of zones) {
      const zn = nests.filter((n) => n.zone === zone.id);
      if (!zn.length) continue;
      const params = grignoteurParams(zone.difficulty);
      for (let i = 0; i < zone.enemies; i++) {
        const nest = zn[i % zn.length];
        const ring = Math.floor(i / zn.length);
        const a = i * 2.4;
        const home = { x: nest.x + Math.cos(a) * ring * 1.6, z: nest.z + Math.sin(a) * ring * 1.6 };
        const e = new Grignoteur(zone, home, params, id++);
        if (this.withViews) {
          e.view = new GrignoteurView(e);
          this.group.add(e.view.root);
        }
        this.enemies.push(e);
      }
      if (this.withViews) {
        const S = buildShared();
        for (const e of this.enemies.filter((x) => x.zone === zone)) {
          const m = new THREE.Mesh(S.tuft, S.tuftMat);
          m.position.copy(e.home);
          m.rotation.y = e.id * 1.3;
          m.receiveShadow = true;
          this.group.add(m);
          this.tufts.push({ mesh: m, x: e.home.x, z: e.home.z });
        }
      }
    }
    this.group.name = 'ennemis';
  }

  update(dt: number, time: number, ctx: EnemyContext, ev: EnemyEvents = {}) {
    const events: EnemyEvents = {
      ...ev,
      defeated: (e) => {
        this.defeated[e.zone.id] = (this.defeated[e.zone.id] ?? 0) + 1;
        ev.defeated?.(e);
      },
    };
    for (const e of this.enemies) e.update(dt, ctx, events);
    // séparation : les Grignoteurs ne se chevauchent pas
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (!a.alive || a.state === 'cache') continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (!b.alive || b.state === 'cache' || a.zone !== b.zone) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = a.params.radius + b.params.radius + 0.1;
        if (d < min && d > 1e-6) {
          const k = (min - d) / d / 2;
          a.pos.x -= dx * k; a.pos.z -= dz * k;
          b.pos.x += dx * k; b.pos.z += dz * k;
        }
      }
    }
    if (!this.withViews) return;
    const p = ctx.player;
    for (const e of this.enemies) {
      if (!e.view) continue;
      const near = Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < 90;
      if (!near) {
        e.view.root.visible = false;
        continue;
      }
      e.view.sync(e, dt, time);
    }
    for (const t of this.tufts) t.mesh.visible = Math.hypot(t.x - p.x, t.z - p.z) < 110;
  }

  /** Un ennemi est-il en plein combat près de ce point ? */
  engagedNear(p: THREE.Vector3, r: number) {
    return this.enemies.some((e) => e.engaged && Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < r);
  }

  /** Ennemi présent le plus proche (pour l'aide à la visée). */
  nearest(p: THREE.Vector3, maxD: number): Enemy | null {
    let best: Enemy | null = null, bd = maxD;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** Tous les ennemis retournent au nid (après un « Ouf ! »). */
  resetAll(revive = false) {
    for (const e of this.enemies) e.reset(revive);
  }

  /** Nombre d'ennemis présents dans une prairie. */
  aliveIn(zone: string) {
    return this.enemies.filter((e) => e.zone.id === zone && e.alive).length;
  }
}
