// Réglages de la zone « forêt » par niveau de qualité. « max » active tout ce que la preuve sait faire de plus coûteux.
import type { Quality } from '../../core/quality';

export interface ForetPreset {
  /** multiplicateur de la densité de pixels (× devicePixelRatio, plafonné à 2) */
  pixelRatio: number;
  shadowSize: number;
  /** échantillons des ombres douces PCSS (recherche des bloqueurs / filtrage) ; 0 = PCF de three.js */
  pcss: number;
  /** pas du parallax occlusion mapping du sol (0 = normales seules) */
  pom: number;
  /** pas de la marche volumétrique de la brume (0 = brume analytique) */
  fogSteps: number;
  /** anti-crénelage temporel */
  taa: boolean;
  ao: 'off' | 'Low' | 'Medium' | 'High';
  /** densité de la végétation (fraction des instances) */
  density: number;
  /** distance (m) du LOD0 des épicéas */
  treeLod0: number;
  /** résolution du reflet de la flaque (fraction de l'écran) */
  reflection: number;
  /** ombres de la lanterne (taille d'une face du cube) */
  lanternShadow: number;
  bloom: boolean;
}

export const FORET_PRESETS: Record<Quality, ForetPreset> = {
  low: { pixelRatio: 0.75, shadowSize: 2048, pcss: 0, pom: 0, fogSteps: 0, taa: false, ao: 'off', density: 0.35, treeLod0: 12, reflection: 0, lanternShadow: 0, bloom: false },
  medium: { pixelRatio: 1, shadowSize: 2048, pcss: 0, pom: 8, fogSteps: 12, taa: false, ao: 'Low', density: 0.6, treeLod0: 18, reflection: 0.25, lanternShadow: 256, bloom: true },
  high: { pixelRatio: 1, shadowSize: 4096, pcss: 16, pom: 16, fogSteps: 24, taa: true, ao: 'Medium', density: 0.85, treeLod0: 26, reflection: 0.35, lanternShadow: 512, bloom: true },
  max: { pixelRatio: 1, shadowSize: 8192, pcss: 32, pom: 32, fogSteps: 48, taa: true, ao: 'High', density: 1, treeLod0: 40, reflection: 0.5, lanternShadow: 768, bloom: true },
};
