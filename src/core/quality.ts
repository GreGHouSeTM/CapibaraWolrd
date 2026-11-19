// Préréglages graphiques.
// « max » (preuve next-gen) : au-dessus de « high ». Sur le monde principal, max = high + réglages sans risque
// (occlusion ambiante pleine résolution, brume et rayons plus fins) ; la zone ?demo=foret y active tout son rendu coûteux.
export type Quality = 'low' | 'medium' | 'high' | 'max';
export const QUALITIES: Quality[] = ['low', 'medium', 'high', 'max'];

export interface QualityPreset {
  pixelRatio: number;
  shadowSize: number;
  shadowExtent: number;
  ao: boolean;
  bloom: boolean;
  grass: number;
  grassPatch: number;
  lodDist: number;
  treeDensity: number;
  smaa: boolean;
  // --- LUMIÈRE & ATMOSPHÈRE ---
  /** Nombre de PointLights du réservoir (fixe pour éviter les recompilations de shaders ; bible §9 : au plus 8). */
  dynLights: number;
  /** Pas de marche de la brume au sol (0 = formule analytique, sans texture du relief). */
  fogSteps: number;
  /** Rayons de soleil en espace écran (échantillons ; 0 = désactivés). */
  godRays: number;
  /** Échelle de résolution des taches de lumière au sol (0 = désactivées, 0,5 = demi-résolution). */
  lightPools: number;
  /** Nombre maximal de taches de lumière (lanternes) dessinées à la fois. */
  maxPools: number;
  /** Qualité de l'occlusion ambiante N8AO. */
  aoMode: 'Performance' | 'Low' | 'Medium' | 'High';
}

export const PRESETS: Record<Quality, QualityPreset> = {
  low: {
    pixelRatio: 0.75, shadowSize: 1024, shadowExtent: 50, ao: false, bloom: false, grass: 20000, grassPatch: 50, lodDist: 260, treeDensity: 0.5, smaa: false,
    dynLights: 2, fogSteps: 0, godRays: 0, lightPools: 0.5, maxPools: 48, aoMode: 'Performance',
  },
  medium: {
    pixelRatio: 1, shadowSize: 2048, shadowExtent: 70, ao: true, bloom: true, grass: 60000, grassPatch: 70, lodDist: 380, treeDensity: 0.8, smaa: true,
    dynLights: 8, fogSteps: 8, godRays: 36, lightPools: 0.5, maxPools: 160, aoMode: 'Low',
  },
  high: {
    pixelRatio: Math.min(2, window.devicePixelRatio || 1), shadowSize: 4096, shadowExtent: 95, ao: true, bloom: true, grass: 130000, grassPatch: 90, lodDist: 520, treeDensity: 1, smaa: true,
    dynLights: 8, fogSteps: 14, godRays: 56, lightPools: 1, maxPools: 320, aoMode: 'Medium',
  },
  max: {
    pixelRatio: Math.min(2, window.devicePixelRatio || 1), shadowSize: 4096, shadowExtent: 95, ao: true, bloom: true, grass: 130000, grassPatch: 90, lodDist: 520, treeDensity: 1, smaa: true,
    dynLights: 8, fogSteps: 16, godRays: 64, lightPools: 1, maxPools: 320, aoMode: 'High',
  },
};
