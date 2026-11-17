// Zones partagées entre les chantiers (terrain, village, nature, combat) pour que tout reste cohérent.
// Coordonnées monde en mètres, Capyville est centré en (0, 0) au sol à y = 6.

/** Rayon du cœur du village (maisons, place, rues pavées). */
export const VILLAGE_RADIUS = 85;

/** Ruisseau qui contourne Capyville par le sud-est et se jette dans l'étang (polyligne x, z). */
export const STREAM: [number, number][] = [
  [190, -150], [150, -95], [128, -30], [118, 40], [96, 105], [40, 150], [-40, 150], [-95, 118], [-120, 90],
];
export const STREAM_WIDTH = 7;

/** Prairies de hautes herbes où se cachent les ennemis (hors routes, hors village). */
export const TALL_GRASS_ZONES: { x: number; z: number; r: number }[] = [
  { x: 150, z: 25, r: 24 },
  { x: -60, z: 190, r: 26 },
  { x: -40, z: -160, r: 24 },
];

/** Lisières de forêt autour du village (pour la densité d'arbres). */
export const FOREST_BELTS: { x: number; z: number; r: number }[] = [
  { x: -190, z: -40, r: 80 },
  { x: 200, z: 160, r: 70 },
  { x: 60, z: -230, r: 70 },
];
