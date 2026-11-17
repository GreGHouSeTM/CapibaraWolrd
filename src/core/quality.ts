// Préréglages graphiques.
export type Quality = 'low' | 'medium' | 'high';

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
}

export const PRESETS: Record<Quality, QualityPreset> = {
  low: { pixelRatio: 0.75, shadowSize: 1024, shadowExtent: 60, ao: false, bloom: false, grass: 20000, grassPatch: 50, lodDist: 260, treeDensity: 0.5, smaa: false },
  medium: { pixelRatio: 1, shadowSize: 2048, shadowExtent: 80, ao: true, bloom: true, grass: 60000, grassPatch: 70, lodDist: 380, treeDensity: 0.8, smaa: true },
  high: { pixelRatio: Math.min(2, window.devicePixelRatio || 1), shadowSize: 4096, shadowExtent: 110, ao: true, bloom: true, grass: 130000, grassPatch: 90, lodDist: 520, treeDensity: 1, smaa: true },
};
