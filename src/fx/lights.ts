// Lumières de nuit (spécialité Lumière & atmosphère).
// - Réservoir FIXE de PointLights (taille selon la qualité, 8 au plus, bible §9) : le nombre de lumières de la scène ne change
//   jamais, donc aucun shader n'est recompilé ; chaque lumière est attribuée à l'un des points de `lightSpots` les plus proches
//   de la caméra, avec fondu à l'entrée et à la sortie.
// - Toutes les autres lanternes allumées sont rendues en « taches de lumière » (volumes éclairants calculés en espace écran
//   dans postfx.ts) : ce module en fournit la liste (position, rayon, couleur × intensité).
// - Horaire : lanternes et lampadaires allumés à 18 h (un par un, comme un allumeur de réverbères), éteints vers 7 h ;
//   shōji qui s'éclairent progressivement entre 17 h 30 et 19 h 30 ; feux toujours allumés, avec scintillement.
// API : `NEAR_LIGHTS` (les lumières dynamiques actives, pour les reflets de l'eau ou la vapeur éclairée), `spotLevel(i)`.
import * as THREE from 'three';
import { lightSpots, LightKind } from '../world/registry';
import { QualityPreset } from '../core/quality';
import { SkyState, lanternLevelAt } from '../world/sky';
import { smoothstep } from '../core/math';

/** Intensité (candelas, avant le facteur du point) et rayon d'action (m) par type de lumière. */
const KIND: Record<LightKind, { cd: number; radius: number; flicker: number }> = {
  lamp: { cd: 16, radius: 15, flicker: 0.02 },
  lantern: { cd: 8, radius: 10, flicker: 0.07 },
  window: { cd: 5, radius: 7, flicker: 0.0 },
  fire: { cd: 18, radius: 13, flicker: 0.25 },
};
const DYN_MAX_DIST = 70;
const POOL_MAX_DIST = 280;

export interface NearLight {
  pos: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  radius: number;
}
/** Lumières dynamiques actives cette image (copie lisible par les autres modules). */
export const NEAR_LIGHTS: NearLight[] = [];

interface SpotInfo {
  delay: number; // décalage d'allumage (h)
  late: boolean; // fenêtre qui reste allumée tard
  phase: number;
  color: THREE.Color;
  level: number;
  dynW: number; // part rendue par une vraie PointLight (0..1)
}

function hash(i: number) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export class NightLights {
  readonly lights: THREE.PointLight[] = [];
  private slots: { spot: number; w: number; target: number }[] = [];
  private info: SpotInfo[] = [];
  /** Niveau global des lanternes (0..1), pour les émissifs (`setNight`). */
  level = 0;
  /** Taches de lumière : (x, y, z, rayon) et (r, g, b) par instance ; `poolCount` instances valides. */
  readonly poolPosR: Float32Array;
  readonly poolColor: Float32Array;
  poolCount = 0;
  readonly maxPools: number;
  private frustum = new THREE.Frustum();
  private projView = new THREE.Matrix4();
  private sphere = new THREE.Sphere();
  private cand: { i: number; d: number }[] = [];

  constructor(scene: THREE.Scene, q: QualityPreset) {
    for (let i = 0; i < q.dynLights; i++) {
      const l = new THREE.PointLight(0xffb060, 0, 10, 2);
      l.castShadow = false;
      l.name = 'lumiere-dynamique-' + i;
      // hors de vue tant qu'elle n'est pas attribuée (intensité nulle : aucun coût visuel, aucun changement de shader)
      l.position.set(0, -500, 0);
      scene.add(l);
      this.lights.push(l);
      this.slots.push({ spot: -1, w: 0, target: 0 });
    }
    this.maxPools = q.lightPools > 0 ? q.maxPools : 0;
    this.poolPosR = new Float32Array(Math.max(1, this.maxPools) * 4);
    this.poolColor = new Float32Array(Math.max(1, this.maxPools) * 3);
  }

  /** Ajoute un point de lumière provisoire (tests visuels uniquement). */
  debugAdd(x: number, y: number, z: number, color = 0xffb060, intensity = 1, kind: LightKind = 'lantern') {
    lightSpots.push({ pos: new THREE.Vector3(x, y, z), color, intensity, kind });
  }

  private syncInfo() {
    while (this.info.length < lightSpots.length) {
      const i = this.info.length;
      const s = lightSpots[i];
      const r = hash(i + 1);
      this.info.push({
        delay: s.kind === 'window' ? r * 1.8 : r * 0.45,
        late: hash(i + 7) > 0.45,
        phase: hash(i + 3) * 100,
        color: new THREE.Color(s.color),
        level: 0,
        dynW: 0,
      });
    }
  }

  /** Niveau d'allumage d'un point à l'heure h (0..1). */
  private spotLevelAt(kind: LightKind, inf: SpotInfo, h: number) {
    if (kind === 'fire') return 1;
    if (kind === 'window') {
      // shōji : s'éclairent un par un de 17 h 30 à 19 h 30, une partie s'éteint dans la nuit, certains se rallument au petit matin
      const evening = smoothstep(17.5 + inf.delay, 17.9 + inf.delay, h);
      const bed = inf.late ? 1 : 1 - smoothstep(23 + inf.delay, 23.3 + inf.delay, h);
      const hm = h < 12 ? h : -1;
      const nightOn = inf.late ? 1 : 0;
      const morning = hm >= 0 ? Math.max(nightOn * (1 - smoothstep(6.5, 7.2, hm)), smoothstep(5 + inf.delay * 0.4, 5.3 + inf.delay * 0.4, hm) * (1 - smoothstep(6.8, 7.4, hm))) : 0;
      return h >= 12 ? evening * bed : morning;
    }
    // lanternes et lampadaires : l'allumeur passe de 18 h à 18 h 30
    return lanternLevelAt(h - inf.delay);
  }

  update(dt: number, time: number, st: SkyState, camera: THREE.Camera) {
    this.syncInfo();
    const h = st.hour;
    this.level = lanternLevelAt(h);
    const cam = camera.position;
    camera.updateMatrixWorld();
    this.projView.multiplyMatrices((camera as THREE.PerspectiveCamera).projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);

    // niveaux et candidats
    const cand = this.cand;
    cand.length = 0;
    for (let i = 0; i < lightSpots.length; i++) {
      const s = lightSpots[i];
      const inf = this.info[i];
      inf.level = this.spotLevelAt(s.kind, inf, h);
      if (inf.level < 0.01) continue;
      const d = s.pos.distanceTo(cam);
      if (d > POOL_MAX_DIST) continue;
      cand.push({ i, d: d / (0.6 + 0.4 * Math.min(2, s.intensity)) });
    }
    cand.sort((a, b) => a.d - b.d);

    // attribution des PointLights (les N plus proches à moins de DYN_MAX_DIST), avec fondu
    const n = this.slots.length;
    const wanted: number[] = [];
    for (let k = 0; k < cand.length && wanted.length < n; k++) if (cand[k].d < DYN_MAX_DIST) wanted.push(cand[k].i);
    for (const sl of this.slots) sl.target = sl.spot >= 0 && wanted.includes(sl.spot) ? 1 : 0;
    for (const wi of wanted) {
      if (this.slots.some((sl) => sl.spot === wi)) continue;
      const free = this.slots.find((sl) => sl.spot < 0) ?? this.slots.find((sl) => sl.target === 0 && sl.w < 0.05);
      if (free) { free.spot = wi; free.w = 0; free.target = 1; }
    }
    for (const inf of this.info) inf.dynW = 0;
    NEAR_LIGHTS.length = 0;
    const fadeRate = 3.5;
    for (let k = 0; k < n; k++) {
      const sl = this.slots[k];
      const l = this.lights[k];
      sl.w += Math.sign(sl.target - sl.w) * Math.min(Math.abs(sl.target - sl.w), dt * fadeRate);
      if (sl.spot >= 0 && sl.target === 0 && sl.w <= 0.001) sl.spot = -1;
      if (sl.spot < 0) { l.intensity = 0; l.position.y = -500; continue; }
      const s = lightSpots[sl.spot];
      const inf = this.info[sl.spot];
      const kd = KIND[s.kind];
      inf.dynW = sl.w;
      const fl = 1 + kd.flicker * (Math.sin(time * 9.1 + inf.phase) * 0.6 + Math.sin(time * 23.7 + inf.phase * 1.7) * 0.4);
      l.position.copy(s.pos);
      l.color.copy(inf.color);
      l.distance = kd.radius * Math.sqrt(Math.max(0.3, s.intensity));
      l.intensity = kd.cd * s.intensity * inf.level * sl.w * fl;
      NEAR_LIGHTS.push({ pos: l.position, color: l.color, intensity: l.intensity, radius: l.distance });
    }

    // taches de lumière : toutes les autres lanternes allumées dans le champ (les plus proches d'abord)
    let c = 0;
    if (this.maxPools > 0) {
      for (let k = 0; k < cand.length && c < this.maxPools; k++) {
        const i = cand[k].i;
        const s = lightSpots[i];
        const inf = this.info[i];
        const kd = KIND[s.kind];
        const rest = 1 - inf.dynW;
        if (rest < 0.01) continue;
        const r = kd.radius * Math.sqrt(Math.max(0.3, s.intensity));
        this.sphere.center.copy(s.pos);
        this.sphere.radius = r;
        if (!this.frustum.intersectsSphere(this.sphere)) continue;
        const fl = 1 + kd.flicker * (Math.sin(time * 9.1 + inf.phase) * 0.6 + Math.sin(time * 23.7 + inf.phase * 1.7) * 0.4);
        const e = kd.cd * s.intensity * inf.level * rest * fl;
        this.poolPosR[c * 4] = s.pos.x;
        this.poolPosR[c * 4 + 1] = s.pos.y;
        this.poolPosR[c * 4 + 2] = s.pos.z;
        this.poolPosR[c * 4 + 3] = r;
        this.poolColor[c * 3] = inf.color.r * e;
        this.poolColor[c * 3 + 1] = inf.color.g * e;
        this.poolColor[c * 3 + 2] = inf.color.b * e;
        c++;
      }
    }
    this.poolCount = c;
  }

  /** Niveau d'allumage courant du point `i` de `lightSpots` (0..1). */
  spotLevel(i: number) {
    return this.info[i]?.level ?? 0;
  }
}
