// Se déplacer en montagne (spécialité Montagne) : règles pures, sans scène ni DOM, testées par Vitest.
// - vitesse selon la pente dans le sens de la marche (montée lente, descente un peu plus rapide) ;
// - pentes infranchissables à pied au-delà de 41° (glissade), escalade sur la roche au-delà de 45° ;
// - endurance (course et escalade), chute (roulade ou retour au dernier point sûr), chaleur (froid d'altitude et de nuit).
// Les réglages sont dans MONTAGNE ; le dossier de conception est docs/MONTAGNE-AURORE.md (§2.2 et §6).
import { clamp, lerp } from '../core/math';
import { heightAt, surfaceAt, biomeAt } from '../world/heightmap';
import { terrainData } from '../world/terrain-data';

const DEG = Math.PI / 180;

export const MONTAGNE = {
  /** pentes (degrés) */
  slope: {
    /** au-delà, la marche ne monte plus et le capybara glisse (hors roche grimpable) */
    blockFrom: 41,
    /** glissade sur la neige dès cette pente */
    slideSnow: 32,
    /** on ressort d'une glissade quand la pente redescend sous le seuil moins cette marge */
    slideHyst: 4,
    /** escalade possible sur la roche au-delà de cette pente */
    climbFrom: 45,
    /** au-delà, la course à quatre pattes est impossible en montée */
    runMax: 30,
    /** une glissade sur une pente plus raide compte comme une chute (paroi) */
    wallFrom: 55,
  },
  /** facteur de vitesse en montée selon la pente dans le sens de la marche (degrés → facteur) */
  uphill: [[0, 1], [8, 1], [15, 0.8], [25, 0.5], [35, 0.24], [41, 0.12]] as [number, number][],
  /** facteur de vitesse en descente */
  downhill: [[0, 1], [15, 1.12], [30, 1.0], [41, 0.85]] as [number, number][],
  /** glissade : frottement (coefficient), vitesse maximale (m/s), part de contrôle latéral */
  slide: { friction: 0.35, maxSpeed: 10, steer: 1.6 },
  /** endurance (points par seconde) */
  stamina: { max: 100, run: 9, runPerDeg: 0.35, climb: 6.5, climbHold: 2.5, regenRest: 28, regenWalk: 14, delay: 0.9, recoverAt: 25 },
  /** escalade : vitesse verticale (m/s) et latérale (m/s) */
  climb: { vertical: 0.85, lateral: 0.7 },
  /** chute (m) : en dessous de `safe` rien ; jusqu'à `rescue`, roulade et demi-cœurs ; au-delà, retour au dernier point sûr */
  fall: { safe: 4, perHalf: 4, maxHalves: 3, rescue: 14, rescueHalves: 2, rollTime: 0.9 },
  /** fondu du retour au point sûr (s) : noir à mi-parcours */
  rescueTime: 1.4,
  /** chaleur (0..100) */
  cold: {
    /** altitude où le froid commence, altitude où il est « plein » (perte `lossFull` par seconde) */
    altStart: 650, altFull: 1150, lossFull: 0.42,
    /** nuit : perte ajoutée au-dessus de `nightFrom` m, multipliée par l'altitude */
    nightFrom: 300, nightLoss: 0.22,
    /** remontée : près d'une source de chaleur, et sous la limite du froid de jour */
    heatGain: 14, valleyGain: 3,
    /** sous ce niveau, le capybara grelotte et récupère son endurance moins vite (jusqu'à `regenAtZero`) */
    shiverBelow: 25, regenAtZero: 0.6,
    /** mode survie (option, pas encore implémentée) : seul ce mode fait perdre de la vie au froid,
     *  un demi-cœur toutes les `survivalEvery` s à jauge vide. Hors survie, le froid ne fait AUCUN dégât (décision du client). */
    survivalEvery: 20,
  },
};

/** Interpolation linéaire par morceaux d'une courbe [x, y] croissante en x. */
export function curve(pts: [number, number][], x: number) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [a, fa] = pts[i - 1], [b, fb] = pts[i];
      return fa + ((fb - fa) * (x - a)) / (b - a);
    }
  }
  return pts[pts.length - 1][1];
}

/** Facteur de vitesse de marche pour une pente φ (degrés) dans le sens de la marche (φ > 0 : montée). */
export function slopeSpeedFactor(phi: number) {
  if (phi >= 0) return phi > MONTAGNE.slope.blockFrom ? 0 : curve(MONTAGNE.uphill, phi);
  return curve(MONTAGNE.downhill, -phi);
}

/** Demi-cœurs perdus et gravité d'une chute de `h` mètres. */
export function fallOutcome(h: number): { halves: number; kind: 'rien' | 'roulade' | 'secours' } {
  const f = MONTAGNE.fall;
  if (h < f.safe) return { halves: 0, kind: 'rien' };
  if (h >= f.rescue) return { halves: f.rescueHalves, kind: 'secours' };
  return { halves: Math.min(f.maxHalves, 1 + Math.floor((h - f.safe) / f.perHalf)), kind: 'roulade' };
}

/**
 * Perte (ou gain) de chaleur par seconde.
 * @param alt altitude (m) ; @param night 0..1 ; @param heat 0..1 (proximité d'un feu, d'une lanterne, d'une vapeur)
 * @param gear 0..1 (part du froid arrêtée par la tenue : bonnet 0,25 ; manteau d'hiver 1 = plus aucun froid)
 */
export function warmthRate(alt: number, night: number, heat: number, gear: number) {
  const c = MONTAGNE.cold;
  const k = clamp((alt - c.altStart) / (c.altFull - c.altStart), 0, 1.6);
  const kn = clamp((alt - c.nightFrom) / (c.altFull - c.nightFrom), 0, 1.6);
  const loss = (c.lossFull * k + c.nightLoss * night * (0.4 + kn)) * (1 - clamp(gear, 0, 1));
  if (heat > 0.01) return c.heatGain * heat - loss * (1 - heat);
  if (loss < 1e-4) return c.valleyGain;
  return -loss;
}

/** Ce que le capybara sait du terrain (remplaçable dans les tests). */
export const mountainTerrain = {
  height: (x: number, z: number) => heightAt(x, z),
  /** part de roche affleurante (0..1), carte dérivée du Terrain */
  rock: (x: number, z: number) => (terrainData ? surfaceAt(x, z)[3] : 0),
  /** part de neige au sol (0..1) */
  snow: (x: number, z: number) => (terrainData ? biomeAt(x, z)[1] : 0),
};

export interface SlopeInfo {
  /** pente du sol (degrés) */
  deg: number;
  /** gradient horizontal (montée par mètre) */
  gx: number; gz: number;
}

/** Pente du terrain au point (différences centrées sur ±e m). */
export function terrainSlope(x: number, z: number, e = 1, out: SlopeInfo = { deg: 0, gx: 0, gz: 0 }): SlopeInfo {
  const h = mountainTerrain.height;
  out.gx = (h(x + e, z) - h(x - e, z)) / (2 * e);
  out.gz = (h(x, z + e) - h(x, z - e)) / (2 * e);
  out.deg = Math.atan(Math.hypot(out.gx, out.gz)) / DEG;
  return out;
}

/** Endurance : consommée par la course et l'escalade, rechargée au repos. */
export class Stamina {
  value = MONTAGNE.stamina.max;
  /** vidée : il faut attendre `recoverAt` avant de recourir ou de regrimper */
  exhausted = false;
  private rest = 0;

  /** Consomme `rate` points par seconde (0 : pas d'effort). `moving` : marche (recharge plus lente). */
  /** `regen` : facteur de récupération (le froid la ralentit un peu, jamais à zéro). */
  update(dt: number, rate: number, moving: boolean, regen = 1) {
    const s = MONTAGNE.stamina;
    if (rate > 0) {
      this.value = Math.max(0, this.value - rate * dt);
      this.rest = 0;
      if (this.value === 0) this.exhausted = true;
    } else {
      this.rest += dt;
      if (this.rest > s.delay) this.value = Math.min(s.max, this.value + (moving ? s.regenWalk : s.regenRest) * regen * dt);
    }
    if (this.exhausted && this.value >= s.recoverAt) this.exhausted = false;
  }

  get ratio() {
    return this.value / MONTAGNE.stamina.max;
  }
  get canEffort() {
    return !this.exhausted && this.value > 0;
  }
}

/**
 * Jauge de chaleur. `gear` : crochet des tenues chaudes (voir Player.warmthGear ; le manteau d'hiver vaut 1 : plus de froid).
 * Hors mode survie, c'est une sensation (givre, souffle, frissons, endurance un peu plus lente à revenir), jamais un dégât.
 */
export class Warmth {
  value = 100;
  /** temps passé à zéro (s) */
  numb = 0;
  /** dernière variation (points/s), pour l'affichage */
  rate = 0;

  update(dt: number, alt: number, night: number, heat: number, gear: number, survival = false): number {
    this.rate = warmthRate(alt, night, heat, gear);
    this.value = clamp(this.value + this.rate * dt, 0, 100);
    // point d'entrée du mode survie : renvoie le nombre de demi-cœurs à retirer (toujours 0 hors survie)
    this.numb = survival && this.value <= 0 ? this.numb + dt : 0;
    if (this.numb < MONTAGNE.cold.survivalEvery) return 0;
    this.numb = 0;
    return 1;
  }

  /** facteur de récupération de l'endurance dû au froid */
  get regenFactor() {
    const c = MONTAGNE.cold;
    return lerp(c.regenAtZero, 1, clamp(this.value / c.shiverBelow, 0, 1));
  }
  /** intensité du givre à l'écran (0..1) */
  get frost() {
    return clamp((40 - this.value) / 40, 0, 1);
  }
}
