// Plan masse de Capyville, village thermal japonais de montagne (onsen), et de ses environs.
// Source de vérité partagée par toutes les spécialités (terrain, eau, routes, végétation, bâtiments, décor,
// ennemis, lumière). Le texte qui explique chaque choix est dans docs/BIBLE-CAPYVILLE.md.
//
// Conventions :
// - coordonnées monde en mètres ; x vers l'est (New York), z vers le sud (Japon, mont Fuji) ; donc nord = -z (Paris) ;
// - les altitudes `y` sont des altitudes monde (le sol de la place vaut 6, le plan d'eau global vaut 0) ;
// - orientation d'un bâtiment `yaw` = rotation.y de Three.js : sa façade principale (porte) est le +z local,
//   qui pointe vers (sin yaw, cos yaw) ; `w` = largeur de façade (x local), `d` = profondeur (z local) ;
// - un « cap » (bearing) se mesure en degrés depuis le nord, dans le sens horaire : 0 = Paris, 90 = est, 180 = Japon.

export type XZ = [number, number];

/** Orientation (yaw) d'une façade qui regarde dans la direction (dx, dz). */
export const facing = (dx: number, dz: number) => Math.atan2(dx, dz);

// =================================================================================================== VILLAGE
/** Centre et altitude de référence (la place est strictement plate à cette altitude). */
export const VILLAGE_CENTER = { x: 0, z: 0, y: 6 };

/** Rayon de l'emprise bâtie : à l'intérieur, rues en dalles de pierre, aucun ennemi, aucune voie en asphalte. */
export const VILLAGE_RADIUS = 110;

/** Place du Grand Cerisier : rectangle aux angles coupés, dallage de pierre irrégulier, plat à y = 6. */
export const PLAZA = { x: 0, z: 0, halfX: 28, halfZ: 22, chamfer: 8, y: 6 };

/** Point d'apparition du joueur : devant sa maison (angle de la place et de la Grand-Rue), regard vers le nord. */
export const SPAWN = { x: -3, z: 26, yaw: Math.PI };

// =================================================================================================== EAU
/**
 * Torrent « la Yuzawa » : descend de la gorge du mont Tanuki (nord-est), traverse le quartier des bains,
 * contourne le village par le sud et tombe dans l'étang aux koï par une cascade. Polyligne amont → aval.
 * Un point répété à 1 m d'écart marque une cascade (voir STREAM_WATER_Y et CASCADES).
 */
export const STREAM: XZ[] = [
  [160, -330], [150, -302], [149, -300], [140, -275], [118, -222], [117, -220], [108, -198], [92, -157], [91, -155],
  [84, -135], [70, -102], [61, -78], [61, -76], [61, -72], [63, -40], [66, 0], [72, 35], [82, 62], [74, 96], [45, 124],
  [5, 140], [-45, 138], [-80, 122], [-93, 112], [-95, 110], [-104, 103], [-120, 90],
];
/** Altitude de la surface de l'eau à chaque point de STREAM (le torrent est un ruban d'eau à hauteur locale). */
export const STREAM_WATER_Y: number[] = [
  46, 44, 38, 36, 30, 27, 24, 19, 16.5,
  14, 10, 7, 5.5, 5.5, 5.2, 4.9, 4.6, 4.4, 4.2, 4.0,
  3.8, 3.6, 3.4, 3.3, 0, 0, 0,
];
/** Largeur du lit mouillé à chaque point de STREAM (m). */
export const STREAM_WIDTHS: number[] = [
  4, 4, 4.5, 4.5, 5, 5, 5, 5, 5.5,
  5.5, 6, 6, 6, 6, 6.5, 6.5, 7, 7, 7, 7,
  7, 7, 7.5, 7.5, 8, 9, 10,
];
/** Largeur moyenne du torrent dans le village (compatibilité). */
export const STREAM_WIDTH = 7;
/** Profondeur du lit sous la surface de l'eau (m) : faible dans les rapides, plus forte dans le village. */
export const STREAM_BED_DEPTH = { rapids: 0.45, village: 0.8, pools: 1.2 };

export interface Cascade {
  id: string;
  name: string;
  x: number;
  z: number;
  /** altitude de l'eau en haut et en bas de la chute */
  top: number;
  bottom: number;
  width: number;
}
export const CASCADES: Cascade[] = [
  { id: 'dragon', name: 'Cascade du Dragon', x: 150, z: -301, top: 44, bottom: 38, width: 5 },
  { id: 'marches', name: 'Cascade des Trois Marches', x: 118, z: -221, top: 30, bottom: 27, width: 5 },
  { id: 'erables', name: 'Cascade des Érables', x: 92, z: -156, top: 19, bottom: 16.5, width: 5.5 },
  { id: 'moulin', name: 'Seuil du moulin', x: 61, z: -77, top: 7, bottom: 5.5, width: 6 },
  { id: 'koi', name: 'Cascade aux Koï', x: -94, z: 111, top: 3.3, bottom: 0, width: 6 },
];

/** Étang aux koï, dans une cuvette au sud-ouest ; sa surface est le plan d'eau global (y = 0). */
export const POND = {
  x: -120, z: 90, rx: 40, rz: 28, waterY: 0, depth: 2,
  /** îlot à la lanterne, relié par le pont vermillon et les planches en zigzag */
  island: { x: -138, z: 78, r: 5 },
};

/** Source chaude des bains extérieurs (rotenburo) : objectif de la mission « Bienvenue ». Position inchangée. */
export const HOT_SPRING_POOL = { x: 60, z: 70, r: 9, waterY: 5.4, deckY: 6.0 };

/** Champ de vapeur (yubatake) : canaux de bois où l'eau de source fume et refroidit avant d'aller aux bains. */
export const YUBATAKE = { x: 38, z: -36, w: 18, d: 8, yaw: 0, y: 6.2 };

// =================================================================================================== RELIEF
export type ReliefKind = 'plateau' | 'terrasse' | 'colline' | 'butte' | 'sommet' | 'col' | 'gorge' | 'cuvette' | 'falaise' | 'coteau';

export interface ReliefFeature {
  id: string;
  name: string;
  kind: ReliefKind;
  x: number;
  z: number;
  /** rayon du plat ou du sommet (m) */
  r: number;
  /** rayon de la base (fin de la pente) (m) */
  base: number;
  /** altitude cible du plat ou du sommet */
  y: number;
  notes: string;
}

/** Reliefs locaux autour du village (le terrain se raccorde en pentes douces entre eux). */
export const RELIEF: ReliefFeature[] = [
  { id: 'place', name: 'Replat du village', kind: 'plateau', x: 0, z: 0, r: 45, base: 95, y: 6, notes: 'place strictement à 6 ; rues entre 5,5 et 9 ; monte vers le nord' },
  { id: 'pagode', name: 'Colline de la Pagode', kind: 'colline', x: -42, z: -116, r: 12, base: 60, y: 24, notes: 'sommet plat pour la pagode ; face nord rocheuse (falaise 8 m) ; escaliers au sud' },
  { id: 'sanctuaire', name: 'Terrasse du sanctuaire', kind: 'terrasse', x: -30, z: -84, r: 13, base: 22, y: 12, notes: 'plateforme 26 × 20 tenue par un mur de pierres sèches (ishigaki) de 3 m' },
  { id: 'falaise-pagode', name: 'Falaise de la Pagode', kind: 'falaise', x: -46, z: -134, r: 14, base: 20, y: 22, notes: 'affleurement rocheux 8 m, face au nord-ouest, mousses et pins accrochés' },
  { id: 'rive-est', name: 'Rive des bains', kind: 'terrasse', x: 88, z: 10, r: 22, base: 40, y: 6.5, notes: 'quai haut du Grand Ryokan, 1,8 m au-dessus de l’eau, mur de pierre' },
  { id: 'the', name: 'Coteau du thé', kind: 'coteau', x: 128, z: -92, r: 10, base: 45, y: 16, notes: 'pente 25 % vers le sud-ouest, terrasses de théiers en courbes de niveau' },
  { id: 'belvedere', name: 'Éperon du Belvédère', kind: 'sommet', x: 176, z: -168, r: 7, base: 70, y: 60, notes: 'replat herbeux, falaise de 15 m à l’ouest au-dessus de la gorge' },
  { id: 'gorge', name: 'Gorge de la Yuzawa', kind: 'gorge', x: 112, z: -215, r: 6, base: 40, y: 30, notes: 'parois de 10 à 25 m, rochers moussus, cascades ; fond = torrent' },
  { id: 'verger', name: 'Coteau des Yuzus', kind: 'coteau', x: 110, z: 140, r: 20, base: 50, y: 11, notes: 'pente douce 8 % vers l’ouest, exposée au soleil du matin' },
  { id: 'levant', name: 'Prairie du Levant', kind: 'coteau', x: 158, z: 18, r: 24, base: 50, y: 14, notes: 'prairie de susuki en pente douce montant vers l’est' },
  { id: 'etang', name: 'Cuvette de l’étang', kind: 'cuvette', x: -120, z: 90, r: 34, base: 60, y: 0, notes: 'berge est abrupte (escarpement rocheux de 4 à 6 m avec la cascade) ; berges ouest et sud douces avec roseaux' },
  { id: 'rizieres', name: 'Rizières en terrasses', kind: 'coteau', x: -175, z: -5, r: 30, base: 55, y: 10, notes: 'gradins de 1 m, voir FIELDS' },
  { id: 'gue', name: 'Prés du Gué', kind: 'plateau', x: -92, z: 200, r: 30, base: 60, y: 5.5, notes: 'fond de vallée presque plat au sud du torrent' },
  { id: 'susuki-nord', name: 'Plateau des Susuki', kind: 'plateau', x: -100, z: -190, r: 26, base: 55, y: 31, notes: 'alpage derrière la colline de la pagode ; rochers épars' },
];

/** Grands sommets de la couronne de montagnes qui ferme la vallée (cache les villes voisines). */
export const PEAKS: { id: string; name: string; x: number; z: number; y: number; base: number }[] = [
  { id: 'kitsune', name: 'Mont Kitsune', x: 93, z: -348, y: 150, base: 170 },
  { id: 'tanuki', name: 'Mont Tanuki', x: 248, z: -275, y: 170, base: 190 },
  { id: 'brumes', name: 'Mont des Brumes', x: 335, z: 10, y: 140, base: 170 },
  { id: 'colline-sud', name: 'Crête des Lucioles', x: 160, z: 270, y: 75, base: 140 },
  { id: 'hibou', name: 'Mont Hibou', x: -160, z: 270, y: 95, base: 150 },
  { id: 'kuma', name: 'Mont Kuma', x: -335, z: 10, y: 150, base: 170 },
  { id: 'corbeau', name: 'Pic du Corbeau', x: -175, z: -300, y: 140, base: 170 },
];

/** Cols par lesquels les six grands axes quittent la vallée (altitude du passage, largeur du fond plat). */
export const COLS: { region: 'paris' | 'newyork' | 'desert' | 'japan' | 'pole' | 'london'; bearing: number; r: number; y: number; width: number }[] = [
  { region: 'paris', bearing: 0, r: 300, y: 22, width: 60 },
  { region: 'newyork', bearing: 60, r: 300, y: 24, width: 60 },
  { region: 'desert', bearing: 120, r: 300, y: 20, width: 70 },
  { region: 'japan', bearing: 180, r: 290, y: 12, width: 140 },
  { region: 'pole', bearing: 240, r: 300, y: 22, width: 60 },
  { region: 'london', bearing: 300, r: 300, y: 24, width: 60 },
];

/** Altitudes de contrôle (à respecter à ±0,3 m par le terrain). */
export const ALTITUDES: { x: number; z: number; y: number; what: string }[] = [
  { x: 0, z: 0, y: 6, what: 'place' },
  { x: -6, z: 120, y: 6.5, what: 'porte sud (grand torii)' },
  { x: 14, z: -102, y: 9, what: 'porte nord (vers Paris)' },
  { x: 100, z: -40, y: 7.5, what: 'porte du Levant (vers New York)' },
  { x: 106, z: 86, y: 7, what: 'porte des Yuzus (vers le Désert)' },
  { x: -100, z: 40, y: 6, what: 'porte de l’Étang (vers le Pôle)' },
  { x: -84, z: -67, y: 8.5, what: 'porte des Cèdres (vers Londres)' },
  { x: -30, z: -84, y: 12, what: 'terrasse du sanctuaire' },
  { x: -42, z: -116, y: 24, what: 'sommet de la pagode' },
  { x: 48, z: -72, y: 7.5, what: 'sol du moulin' },
  { x: 60, z: 70, y: 6, what: 'plancher du rotenburo' },
  { x: 90, z: 4, y: 6.5, what: 'Grand Ryokan' },
  { x: 176, z: -168, y: 60, what: 'belvédère' },
  { x: -114, z: -12, y: 7, what: 'ferme' },
  { x: -100, z: 68, y: 3.5, what: 'maison de thé de l’étang' },
];

// =================================================================================================== VOIES
/**
 * Revêtements :
 * - asphalte : uniquement les six grands axes, à partir des portes du village ;
 * - dalles : grandes dalles de pierre irrégulières (ishidatami) dans le village ;
 * - escalier : marches de pierre (0,18 m) ;
 * - pas-japonais : pierres plates espacées dans la mousse ou le gravier (tobi-ishi) ;
 * - gravier : gravier tassé avec bordure de bois ; terre : chemin de terre avec ornières ; planches : bois.
 */
export type Surface = 'asphalte' | 'dalles' | 'escalier' | 'pas-japonais' | 'gravier' | 'terre' | 'planches';
export type PathKind = 'axe' | 'rue' | 'ruelle' | 'sando' | 'sentier' | 'promenade';
export type Edge = 'caniveau-pierre' | 'bordure-pierre' | 'herbe' | 'mousse' | 'barriere-bambou' | 'garde-corps-bois' | 'mur-ishigaki' | 'talus';
export type PathLight = 'toro' | 'chochin' | 'andon' | 'aucun';

export interface PathDef {
  id: string;
  name: string;
  kind: PathKind;
  surface: Surface;
  /** largeur de la bande roulante ou marchable (m) */
  width: number;
  pts: XZ[];
  edge: Edge;
  light: PathLight;
  /** écart entre deux lanternes (m), 0 si aucune */
  lightSpacing: number;
  /** ornières de charrettes (chemins de terre) */
  ruts?: boolean;
  /** extrémité qui se raccorde à un grand axe (en asphalte au-delà de la porte) */
  axis?: 'paris' | 'newyork' | 'desert' | 'japan' | 'pole' | 'london';
}

export const PATHS: PathDef[] = [
  // --- rues du village (prolongent les axes jusqu'à la place)
  { id: 'grand-rue', name: 'Grand-Rue (rue de Fuji)', kind: 'rue', surface: 'dalles', width: 7, pts: [[0, 22], [1, 60], [0, 95], [-6, 120]], edge: 'caniveau-pierre', light: 'chochin', lightSpacing: 8, axis: 'japan' },
  { id: 'rue-col', name: 'Rue du Col', kind: 'rue', surface: 'dalles', width: 6, pts: [[0, -22], [3, -50], [8, -78], [14, -102]], edge: 'caniveau-pierre', light: 'chochin', lightSpacing: 10, axis: 'paris' },
  { id: 'rue-levant', name: 'Rue du Levant', kind: 'rue', surface: 'dalles', width: 6, pts: [[24, -14], [44, -21], [63, -28], [82, -34], [100, -40]], edge: 'caniveau-pierre', light: 'toro', lightSpacing: 12, axis: 'newyork' },
  { id: 'rue-yuzus', name: 'Rue des Yuzus', kind: 'rue', surface: 'dalles', width: 6, pts: [[24, 14], [46, 21], [70, 28], [90, 44], [100, 64], [106, 86]], edge: 'caniveau-pierre', light: 'toro', lightSpacing: 12, axis: 'desert' },
  { id: 'rue-etang', name: 'Rue de l’Étang', kind: 'rue', surface: 'dalles', width: 5, pts: [[-24, 14], [-50, 22], [-76, 31], [-100, 40]], edge: 'bordure-pierre', light: 'toro', lightSpacing: 12, axis: 'pole' },
  { id: 'rue-cedres', name: 'Rue des Cèdres', kind: 'rue', surface: 'dalles', width: 5, pts: [[-24, -14], [-46, -32], [-66, -50], [-84, -67]], edge: 'bordure-pierre', light: 'toro', lightSpacing: 12, axis: 'london' },
  // --- liaisons des portes vers les axes en asphalte (tronçons de raccord, hors village)
  { id: 'raccord-sud', name: 'Pont de Fuji et raccord sud', kind: 'axe', surface: 'asphalte', width: 7, pts: [[-6, 120], [-12, 139], [-24, 156]], edge: 'talus', light: 'aucun', lightSpacing: 0, axis: 'japan' },
  // --- ruelles, promenades et sentiers
  { id: 'sando', name: 'Allée du sanctuaire (sandō)', kind: 'sando', surface: 'escalier', width: 3.5, pts: [[-16, -22], [-20, -36], [-23, -52], [-26, -70], [-28, -76]], edge: 'mousse', light: 'toro', lightSpacing: 6 },
  { id: 'torii-mille', name: 'Escalier aux mille torii', kind: 'sando', surface: 'escalier', width: 2.6, pts: [[-38, -84], [-41, -96], [-42, -106]], edge: 'mousse', light: 'chochin', lightSpacing: 4 },
  { id: 'rue-bains', name: 'Promenade des Bains (rive ouest)', kind: 'promenade', surface: 'dalles', width: 3.5, pts: [[52, -46], [55, -20], [57, 8], [58, 36], [56, 50], [50, 60]], edge: 'garde-corps-bois', light: 'chochin', lightSpacing: 6 },
  { id: 'quai-ryokan', name: 'Quai du Grand Ryokan (rive est)', kind: 'promenade', surface: 'dalles', width: 3, pts: [[78, -30], [76, 6], [80, 32]], edge: 'mur-ishigaki', light: 'chochin', lightSpacing: 6 },
  { id: 'ruelle-vapeur', name: 'Ruelle de la Vapeur', kind: 'ruelle', surface: 'dalles', width: 2.8, pts: [[4, 65], [24, 64], [44, 64]], edge: 'barriere-bambou', light: 'andon', lightSpacing: 7 },
  { id: 'ruelle-lanternes', name: 'Ruelle des Lanternes', kind: 'ruelle', surface: 'escalier', width: 2.8, pts: [[-3, 83], [-30, 86], [-58, 96], [-84, 104]], edge: 'mousse', light: 'toro', lightSpacing: 7 },
  { id: 'chemin-moulin', name: 'Chemin du Moulin', kind: 'sentier', surface: 'gravier', width: 3, pts: [[6.8, -71], [26, -72], [42, -72]], edge: 'herbe', light: 'toro', lightSpacing: 14 },
  { id: 'rive-moulin', name: 'Sentier de la rive (yubatake → moulin)', kind: 'sentier', surface: 'pas-japonais', width: 1.8, pts: [[52, -46], [54, -60], [50, -68]], edge: 'mousse', light: 'aucun', lightSpacing: 0 },
  { id: 'sentier-gorge', name: 'Sentier de la Gorge', kind: 'sentier', surface: 'terre', width: 2, pts: [[50, -78], [62, -100], [76, -132], [86, -162], [98, -184], [110, -192]], edge: 'talus', light: 'aucun', lightSpacing: 0 },
  { id: 'sentier-belvedere', name: 'Sentier du Belvédère', kind: 'sentier', surface: 'terre', width: 2, pts: [[110, -192], [132, -188], [146, -176], [140, -160], [158, -150], [172, -162], [176, -168]], edge: 'talus', light: 'aucun', lightSpacing: 0 },
  { id: 'sentier-the', name: 'Sentier des Théiers', kind: 'sentier', surface: 'terre', width: 2.2, pts: [[100, -40], [112, -66], [126, -96], [140, -122], [158, -150]], edge: 'herbe', light: 'aucun', lightSpacing: 0, ruts: false },
  { id: 'chemin-verger', name: 'Chemin du Verger', kind: 'sentier', surface: 'terre', width: 2.5, pts: [[86, 84], [98, 104], [104, 124], [110, 148]], edge: 'herbe', light: 'aucun', lightSpacing: 0, ruts: true },
  { id: 'chemin-levant', name: 'Chemin des Susuki du Levant', kind: 'sentier', surface: 'terre', width: 2.2, pts: [[100, -40], [120, -18], [140, 2], [158, 18]], edge: 'herbe', light: 'aucun', lightSpacing: 0 },
  { id: 'chemin-ferme', name: 'Chemin de la Ferme', kind: 'sentier', surface: 'terre', width: 3, pts: [[-53, 21.5], [-55, 10], [-62, 2], [-80, -3], [-104, -6]], edge: 'herbe', light: 'aucun', lightSpacing: 0, ruts: true },
  { id: 'chemin-ferme-nord', name: 'Chemin des Rizières', kind: 'sentier', surface: 'terre', width: 2.5, pts: [[-66, -50], [-92, -42], [-125, -43], [-205, -44]], edge: 'herbe', light: 'aucun', lightSpacing: 0, ruts: true },
  { id: 'tour-etang', name: 'Tour de l’étang', kind: 'promenade', surface: 'pas-japonais', width: 1.8, pts: [[-100, 40], [-104, 62], [-126, 60], [-150, 66], [-162, 88], [-150, 112], [-124, 122], [-104, 116], [-88, 106]], edge: 'mousse', light: 'toro', lightSpacing: 10 },
  { id: 'chemin-gue', name: 'Chemin du Gué', kind: 'sentier', surface: 'terre', width: 2.2, pts: [[-24, 156], [-48, 172], [-72, 188], [-92, 200]], edge: 'herbe', light: 'aucun', lightSpacing: 0 },
  { id: 'chemin-susuki-nord', name: 'Chemin du Plateau', kind: 'sentier', surface: 'terre', width: 2, pts: [[-42, -128], [-60, -146], [-80, -166], [-100, -190]], edge: 'talus', light: 'aucun', lightSpacing: 0 },
  { id: 'gue-pierres', name: 'Gué de pierres', kind: 'sentier', surface: 'pas-japonais', width: 1.6, pts: [[22, 124], [26, 142], [32, 156]], edge: 'mousse', light: 'aucun', lightSpacing: 0 },
];

/** Portes du village : au-delà, l'axe devient une route asphaltée (bande blanche, bas-côtés, glissières de bois). */
export const VILLAGE_GATES: { axis: 'paris' | 'newyork' | 'desert' | 'japan' | 'pole' | 'london'; name: string; x: number; z: number; gate: 'torii' | 'portail-bois' | 'lanternes'; asphaltFrom: XZ }[] = [
  { axis: 'paris', name: 'Porte du Col', x: 14, z: -102, gate: 'portail-bois', asphaltFrom: [18, -116] },
  { axis: 'newyork', name: 'Porte du Levant', x: 100, z: -40, gate: 'lanternes', asphaltFrom: [114, -45] },
  { axis: 'desert', name: 'Porte des Yuzus', x: 106, z: 86, gate: 'lanternes', asphaltFrom: [116, 96] },
  { axis: 'japan', name: 'Grand Torii', x: -6, z: 120, gate: 'torii', asphaltFrom: [-12, 139] },
  { axis: 'pole', name: 'Porte de l’Étang', x: -100, z: 40, gate: 'portail-bois', asphaltFrom: [-114, 44] },
  { axis: 'london', name: 'Porte des Cèdres', x: -84, z: -67, gate: 'portail-bois', asphaltFrom: [-96, -78] },
];

export type BridgeType = 'pont-route-bois' | 'arche-bois' | 'taikobashi-vermillon' | 'planches-zigzag' | 'passerelle-cordes' | 'dalle-pierre' | 'gue-pierres';
export interface BridgeDef {
  id: string;
  name: string;
  type: BridgeType;
  /** extrémités (rive à rive) */
  a: XZ;
  b: XZ;
  width: number;
  /** flèche de l'arche au milieu (m) */
  arch: number;
}
export const BRIDGES: BridgeDef[] = [
  { id: 'levant', name: 'Pont du Levant', type: 'pont-route-bois', a: [56, -25.5], b: [70, -30.5], width: 6.5, arch: 0.4 },
  { id: 'vapeur', name: 'Pont de la Vapeur', type: 'pont-route-bois', a: [63, 26], b: [77, 30], width: 6.5, arch: 0.4 },
  { id: 'fuji', name: 'Pont de Fuji', type: 'pont-route-bois', a: [-9, 131], b: [-15, 147], width: 7.5, arch: 0.5 },
  { id: 'lanternes', name: 'Pont des Lanternes', type: 'arche-bois', a: [58, 6], b: [75, 6], width: 2.4, arch: 1.5 },
  { id: 'bain', name: 'Pont du Bain', type: 'arche-bois', a: [69, 79], b: [87, 83], width: 2.2, arch: 1.3 },
  { id: 'vermillon', name: 'Pont Vermillon', type: 'taikobashi-vermillon', a: [-138, 62], b: [-138, 74], width: 2.2, arch: 2.0 },
  { id: 'zigzag', name: 'Planches aux iris', type: 'planches-zigzag', a: [-143, 80], b: [-159, 85], width: 1.2, arch: 0 },
  { id: 'saut', name: 'Dalle du Saut (au-dessus de la cascade aux Koï)', type: 'dalle-pierre', a: [-99, 115], b: [-89, 108], width: 1.6, arch: 0 },
  { id: 'gue', name: 'Gué de pierres', type: 'gue-pierres', a: [24, 133], b: [27, 146], width: 1.2, arch: 0 },
  { id: 'brumes', name: 'Passerelle des Brumes', type: 'passerelle-cordes', a: [97, -184], b: [110, -191], width: 1.4, arch: -0.6 },
];

// =================================================================================================== BÂTIMENTS
export type BuildingType =
  | 'ryokan' | 'sento' | 'chaya' | 'machiya' | 'minka' | 'honjin' | 'kura' | 'gassho' | 'grange'
  | 'haiden' | 'honden' | 'temizuya' | 'shoro' | 'pagode' | 'moulin' | 'azumaya' | 'chashitsu'
  | 'ashiyu' | 'puits' | 'datsuijo' | 'yatai';
export type RoofType = 'kirizuma' | 'irimoya' | 'yosemune' | 'kayabuki' | 'pagode' | 'karahafu' | 'auvent';

export interface BuildingDef {
  id: string;
  type: BuildingType;
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  yaw: number;
  floors: number;
  roof: RoofType;
  /** quartier (voir QUARTERS) */
  quarter: QuarterId;
  /** rôle dans le jeu ou l'histoire */
  role?: string;
}

export type QuarterId = 'place' | 'grand-rue' | 'bains' | 'col' | 'sanctuaire' | 'cedres' | 'etang' | 'ferme' | 'campagne';

export const QUARTERS: { id: QuarterId; name: string; x: number; z: number; r: number; mood: string }[] = [
  { id: 'place', name: 'Place du Grand Cerisier', x: 0, z: 0, r: 30, mood: 'cœur animé : cerisier, puits couvert, bain de pieds, étals' },
  { id: 'grand-rue', name: 'Grand-Rue', x: 0, z: 70, r: 50, mood: 'rue marchande continue, noren, lanternes, vue sur le mont Fuji' },
  { id: 'bains', name: 'Quartier des Bains', x: 62, z: 20, r: 55, mood: 'torrent canalisé, vapeur, ryokans, ponts de bois' },
  { id: 'col', name: 'Quartier du Col', x: 10, z: -60, r: 40, mood: 'artisans, greniers, moulin, montée vers la porte nord' },
  { id: 'sanctuaire', name: 'Colline sacrée', x: -35, z: -95, r: 45, mood: 'cèdres géants, torii, escaliers moussus, pagode' },
  { id: 'cedres', name: 'Quartier des Cèdres', x: -50, z: -30, r: 30, mood: 'maisons d’habitation, jardins, haies de bambou' },
  { id: 'etang', name: 'Quartier de l’Étang', x: -50, z: 50, r: 45, mood: 'jardins, potagers, bambouseraie, descente vers l’étang' },
  { id: 'ferme', name: 'Ferme et rizières', x: -150, z: -10, r: 60, mood: 'chaume, séchoirs à riz, rizières en miroir' },
  { id: 'campagne', name: 'Campagne', x: 0, z: 0, r: 350, mood: 'tout le reste de la vallée' },
];

type LotSpec = [id: string, type: BuildingType, s: number, w: number, d: number, side: 'gauche' | 'droite', floors: number, roof: RoofType, name: string, role?: string];

/** Point et direction à l'abscisse curviligne `s` d'une polyligne. */
export function pointAlong(pts: XZ[], s: number) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const l = Math.hypot(bx - ax, bz - az);
    if (acc + l >= s || i === pts.length - 2) {
      const t = Math.min(1, Math.max(0, (s - acc) / l));
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / l, dz: (bz - az) / l };
    }
    acc += l;
  }
  return { x: pts[0][0], z: pts[0][1], dx: 0, dz: 1 };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Lots alignés sur une rue : façade parallèle à la rue, à 1,2 m du bord (gauche = à gauche en partant de la place). */
function lotsAlong(pathId: string, quarter: QuarterId, specs: LotSpec[]): BuildingDef[] {
  const p = PATHS.find((q) => q.id === pathId)!;
  return specs.map(([id, type, s, w, d, side, floors, roof, name, role]) => {
    const a = pointAlong(p.pts, s + w / 2);
    const sg = side === 'gauche' ? 1 : -1;
    const nx = a.dz * sg, nz = -a.dx * sg;
    const off = p.width / 2 + 1.2 + d / 2;
    return { id, type, name, x: r1(a.x + nx * off), z: r1(a.z + nz * off), w, d, yaw: Math.round(facing(-nx, -nz) * 100) / 100, floors, roof, quarter, role };
  });
}

const H = Math.PI / 2;

export const BUILDINGS: BuildingDef[] = [
  // --- autour de la place
  { id: 'chaya', type: 'chaya', name: 'Maison de thé du Cerisier', x: 17, z: -29, w: 12, d: 9, yaw: 0, floors: 2, roof: 'irimoya', quarter: 'place', role: 'lanterne 茶, banquette rouge en façade, PNJ buveurs de thé' },
  { id: 'sento', type: 'sento', name: 'Bains publics de la Croisée', x: 41, z: 2, w: 16, d: 12, yaw: -H, floors: 1, roof: 'karahafu', quarter: 'bains', role: 'grand noren 温泉, cheminée qui fume, repère de vapeur' },
  { id: 'ashiyu', type: 'ashiyu', name: 'Bain de pieds', x: 22, z: 2, w: 7, d: 3.5, yaw: -H, floors: 1, roof: 'auvent', quarter: 'place', role: 'bassin chaud couvert où des capybaras trempent leurs pattes' },
  { id: 'puits', type: 'puits', name: 'Puits couvert', x: 9, z: -7, w: 3, d: 3, yaw: 0, floors: 1, roof: 'kirizuma', quarter: 'place', role: 'centre visuel de la place avec le cerisier' },
  { id: 'honjin', type: 'honjin', name: 'Grande maison de Mamie Capy', x: -41, z: -1, w: 12, d: 12, yaw: H, floors: 2, roof: 'irimoya', quarter: 'place', role: 'maison de la doyenne, portail couvert, jardin sec' },
  { id: 'yatai-1', type: 'yatai', name: 'Étal de patates douces grillées', x: -18, z: 15, w: 3, d: 2, yaw: Math.PI, floors: 1, roof: 'auvent', quarter: 'place' },
  { id: 'yatai-2', type: 'yatai', name: 'Étal de masques et moulinets', x: -21, z: 6, w: 3, d: 2, yaw: H, floors: 1, roof: 'auvent', quarter: 'place' },
  { id: 'yatai-3', type: 'yatai', name: 'Étal d’œufs cuits à la source', x: 16, z: 16, w: 3, d: 2, yaw: Math.PI, floors: 1, roof: 'auvent', quarter: 'place' },
  // --- Grand-Rue (gauche = côté est)
  ...lotsAlong('grand-rue', 'grand-rue', [
    ['e1', 'machiya', 0.5, 8, 10, 'gauche', 2, 'kirizuma', 'Confiserie des manjū à la vapeur', 'paniers vapeur fumants en façade'],
    ['e2', 'machiya', 9.5, 8, 10, 'gauche', 2, 'kirizuma', 'Échoppe des lanternes de papier'],
    ['e3', 'ryokan', 18.5, 12, 12, 'gauche', 2, 'irimoya', 'Petit ryokan Momiji'],
    ['e4', 'machiya', 31.5, 8, 9, 'gauche', 2, 'kirizuma', 'Marchand de yuzus'],
    ['e5', 'machiya', 47, 8, 9, 'gauche', 1, 'kirizuma', 'Atelier de jouets en bois'],
    ['e6', 'minka', 57, 9, 8, 'gauche', 1, 'kirizuma', 'Maison aux glycines'],
    ['e7', 'kura', 68, 6, 6, 'gauche', 2, 'kirizuma', 'Grenier blanc'],
    ['e8', 'minka', 76, 8, 8, 'gauche', 1, 'kirizuma', 'Maison du potier'],
    ['w1', 'minka', 0.5, 9, 9, 'droite', 2, 'kirizuma', 'Maison de Capy', 'maison de départ du joueur'],
    ['w2', 'machiya', 10.5, 10, 11, 'droite', 2, 'kirizuma', 'Restaurant de nouilles soba'],
    ['w3', 'machiya', 21.5, 8, 9, 'droite', 2, 'kirizuma', 'Échoppe de dango'],
    ['w4', 'machiya', 30.5, 8, 9, 'droite', 2, 'kirizuma', 'Marchand de parapluies en papier'],
    ['w5', 'machiya', 40.5, 8, 9, 'droite', 1, 'kirizuma', 'Herboristerie et thé'],
    ['w6', 'minka', 50, 8, 8, 'droite', 1, 'kirizuma', 'Maison'],
    ['w7', 'minka', 65.5, 9, 8, 'droite', 1, 'kirizuma', 'Maison'],
    ['w8', 'minka', 79, 7, 7, 'droite', 1, 'kirizuma', 'Maison du gardien du torii'],
  ]),
  // --- Rue du Col (gauche = côté ouest)
  ...lotsAlong('rue-col', 'col', [
    ['n1', 'machiya', 0.5, 9, 9, 'gauche', 2, 'kirizuma', 'Chapellerie de Basile', 'boutique de chapeaux (mission photo)'],
    ['n2', 'kura', 11, 6, 6, 'gauche', 2, 'kirizuma', 'Grenier à riz'],
    ['n3', 'minka', 19, 9, 8, 'gauche', 1, 'kirizuma', 'Maison'],
    ['n4', 'minka', 31, 9, 8, 'gauche', 1, 'kirizuma', 'Maison'],
    ['n9', 'minka', 44, 9, 8, 'gauche', 1, 'kirizuma', 'Maison du veilleur de la porte'],
    ['n5', 'machiya', 16, 9, 9, 'droite', 2, 'kirizuma', 'Studio de Léo le photographe', 'mission photo du moulin'],
    ['n6', 'minka', 27, 10, 8, 'droite', 1, 'kirizuma', 'Maison'],
    ['n7', 'machiya', 38.5, 9, 9, 'droite', 1, 'kirizuma', 'Atelier du charpentier', 'bois empilé, copeaux, chevalet de sciage'],
    ['n8', 'minka', 57.5, 8, 8, 'droite', 1, 'kirizuma', 'Maison'],
  ]),
  // --- Rue des Cèdres (gauche = côté sud-ouest)
  ...lotsAlong('rue-cedres', 'cedres', [
    ['l1', 'minka', 8, 9, 8, 'gauche', 1, 'kirizuma', 'Maison'],
    ['l2', 'minka', 19, 9, 8, 'gauche', 1, 'kirizuma', 'Maison'],
    ['l3', 'minka', 30, 10, 8, 'gauche', 1, 'kirizuma', 'Maison du forgeron'],
    ['l7', 'minka', 42, 9, 8, 'gauche', 1, 'kirizuma', 'Maison'],
    ['l4', 'minka', 4, 9, 8, 'droite', 1, 'kirizuma', 'Maison'],
    ['l5', 'kura', 15, 6, 6, 'droite', 2, 'kirizuma', 'Grenier'],
    ['l6', 'minka', 23, 10, 8, 'droite', 1, 'kirizuma', 'Maison'],
  ]),
  // --- Rue de l'Étang (gauche = côté sud)
  ...lotsAlong('rue-etang', 'etang', [
    ['p1', 'minka', 10, 9, 8, 'gauche', 1, 'kirizuma', 'Maison'],
    ['p2', 'minka', 21, 9, 8, 'gauche', 1, 'kirizuma', 'Maison'],
    ['p3', 'minka', 33, 10, 8, 'gauche', 1, 'kirizuma', 'Maison du pêcheur', 'filets, nasses, seaux de koï'],
    ['p7', 'minka', 46, 9, 8, 'gauche', 1, 'kirizuma', 'Maison'],
    ['p4', 'minka', 16.5, 9, 8, 'droite', 1, 'kirizuma', 'Maison'],
    ['p5', 'minka', 33, 9, 8, 'droite', 1, 'kirizuma', 'Maison'],
    ['p6', 'minka', 44, 9, 8, 'droite', 1, 'kirizuma', 'Maison'],
  ]),
  // --- Rue des Yuzus (droite = côté sud)
  ...lotsAlong('rue-yuzus', 'bains', [
    ['y1', 'minka', 4, 9, 8, 'droite', 1, 'kirizuma', 'Maison du masseur'],
    ['y2', 'machiya', 14, 8, 8, 'droite', 1, 'kirizuma', 'Boutique de serviettes et de savons', 'serviettes suspendues, seaux de bois empilés'],
  ]),
  // --- cœurs d'îlots (desservis par les ruelles)
  { id: 'v1', type: 'minka', name: 'Maison de la Ruelle de la Vapeur', x: 26, z: 56, w: 9, d: 8, yaw: 0, floors: 1, roof: 'kirizuma', quarter: 'bains' },
  { id: 'v2', type: 'minka', name: 'Maison du baigneur', x: 30, z: 74, w: 9, d: 8, yaw: Math.PI, floors: 1, roof: 'kirizuma', quarter: 'bains' },
  { id: 'k1', type: 'minka', name: 'Maison du gardien des sources', x: 34, z: -54, w: 9, d: 8, yaw: 0, floors: 1, roof: 'kirizuma', quarter: 'col', role: 'surveille le yubatake ; outils à remuer l’eau' },
  { id: 'j1', type: 'minka', name: 'Maison', x: -32, z: 74, w: 9, d: 8, yaw: 0, floors: 1, roof: 'kirizuma', quarter: 'etang' },
  { id: 'j2', type: 'minka', name: 'Maison de la tisserande', x: -52, z: 81, w: 9, d: 8, yaw: 0.3, floors: 1, roof: 'kirizuma', quarter: 'etang', role: 'métier à tisser sous l’auvent, tissus qui sèchent' },
  // --- quartier des bains
  { id: 'grand-ryokan', type: 'ryokan', name: 'Grand Ryokan Yuzu-no-Yado', x: 90, z: 4, w: 26, d: 14, yaw: -H, floors: 3, roof: 'irimoya', quarter: 'bains', role: 'plus grand bâtiment du village, balcons sur le torrent' },
  { id: 'ryokan-annexe', type: 'chashitsu', name: 'Pavillon du jardin du Ryokan', x: 96, z: 30, w: 8, d: 7, yaw: -H, floors: 1, roof: 'irimoya', quarter: 'bains' },
  { id: 'ryokan-torrent', type: 'ryokan', name: 'Ryokan du Torrent', x: 46, z: 44, w: 16, d: 10, yaw: H, floors: 2, roof: 'irimoya', quarter: 'bains' },
  { id: 'datsuijo', type: 'datsuijo', name: 'Vestiaire des bains extérieurs', x: 46, z: 73, w: 7, d: 4, yaw: H, floors: 1, roof: 'kirizuma', quarter: 'bains', role: 'enseigne 温泉, paniers, serviettes' },
  { id: 'rotenburo-toit', type: 'azumaya', name: 'Auvent du rotenburo', x: 53, z: 63, w: 6, d: 5, yaw: 0.6, floors: 1, roof: 'auvent', quarter: 'bains', role: 'couvre un tiers du bassin, lanterne et enseigne' },
  { id: 'moulin', type: 'moulin', name: 'Moulin à eau', x: 48, z: -72, w: 8, d: 7, yaw: -H, floors: 1, roof: 'kayabuki', quarter: 'col', role: 'roue de 5,5 m côté torrent (est), cible de la mission photo' },
  // --- colline sacrée
  { id: 'haiden', type: 'haiden', name: 'Oratoire du sanctuaire', x: -30, z: -88, w: 10, d: 8, yaw: 0, floors: 1, roof: 'irimoya', quarter: 'sanctuaire' },
  { id: 'honden', type: 'honden', name: 'Sanctuaire principal', x: -30, z: -97, w: 6, d: 6, yaw: 0, floors: 1, roof: 'kirizuma', quarter: 'sanctuaire' },
  { id: 'temizuya', type: 'temizuya', name: 'Fontaine aux ablutions', x: -21, z: -79, w: 3, d: 2, yaw: -H, floors: 1, roof: 'kirizuma', quarter: 'sanctuaire' },
  { id: 'pagode', type: 'pagode', name: 'Pagode rouge à cinq étages', x: -42, z: -119, w: 8, d: 8, yaw: 0.35, floors: 5, roof: 'pagode', quarter: 'sanctuaire', role: 'repère principal, 27 m, visible de toute la vallée' },
  { id: 'shoro', type: 'shoro', name: 'Pavillon de la cloche', x: -32, z: -113, w: 4, d: 4, yaw: 0.35, floors: 1, roof: 'irimoya', quarter: 'sanctuaire' },
  // --- étang, ferme, campagne
  { id: 'chashitsu', type: 'chashitsu', name: 'Maison de thé de l’étang', x: -100, z: 68, w: 7, d: 6, yaw: facing(-20, 22), floors: 1, roof: 'kayabuki', quarter: 'etang', role: 'engawa sur pilotis au-dessus de l’eau' },
  { id: 'gassho', type: 'gassho', name: 'Ferme au toit de chaume', x: -114, z: -12, w: 16, d: 10, yaw: H, floors: 3, roof: 'kayabuki', quarter: 'ferme', role: 'toit de chaume très pentu (60°), fumée du foyer' },
  { id: 'ferme-kura', type: 'kura', name: 'Grenier de la ferme', x: -104, z: -28, w: 6, d: 6, yaw: H, floors: 2, roof: 'kirizuma', quarter: 'ferme' },
  { id: 'ferme-grange', type: 'grange', name: 'Remise aux outils', x: -126, z: 5, w: 10, d: 6, yaw: 0, floors: 1, roof: 'kirizuma', quarter: 'ferme' },
  { id: 'belvedere', type: 'azumaya', name: 'Pavillon du Belvédère', x: 176, z: -168, w: 4, d: 4, yaw: facing(-1, 1), floors: 1, roof: 'yosemune', quarter: 'campagne', role: 'point de vue sur toute la vallée et le mont Fuji' },
  { id: 'cabane-the', type: 'grange', name: 'Abri des cueilleurs de thé', x: 101, z: -72, w: 5, d: 4, yaw: facing(-1, 1), floors: 1, roof: 'kirizuma', quarter: 'campagne' },
];

/** Torii (portiques) : vermillon sauf mention. */
export const TORII: { id: string; x: number; z: number; yaw: number; h: number; kind: 'myojin' | 'shinmei' }[] = [
  { id: 'sando-1', x: -19, z: -32, yaw: facing(-0.35, -1), h: 6.5, kind: 'myojin' },
  { id: 'sando-2', x: -27, z: -73, yaw: facing(-0.2, -1), h: 5, kind: 'myojin' },
  { id: 'grand-torii', x: -6, z: 120, yaw: facing(-0.23, 1), h: 9, kind: 'myojin' },
  { id: 'etang', x: -138, z: 78, yaw: 0, h: 2.6, kind: 'shinmei' },
  { id: 'belvedere', x: 170, z: -160, yaw: facing(1, -1), h: 3, kind: 'shinmei' },
];
/** Escalier aux mille torii : un petit torii tous les 1,6 m le long du chemin 'torii-mille' (≈ 14 portiques de 3,2 m). */
export const TORII_TUNNEL = { pathId: 'torii-mille', spacing: 1.6, h: 3.2, w: 2.8 };

// =================================================================================================== CHAMPS, VERGER, JARDINS
export type FieldKind = 'riziere' | 'the' | 'potager' | 'verger' | 'fleurs' | 'jardin-sec' | 'jardin-mousse';
export interface FieldDef {
  id: string;
  name: string;
  kind: FieldKind;
  x: number;
  z: number;
  w: number;
  d: number;
  yaw: number;
  /** altitude du plat (gradin) */
  y?: number;
}

/** Rizières en terrasses : 8 gradins de 1 m qui montent vers l'ouest (eau miroir à y + 0,15). */
const RICE: FieldDef[] = Array.from({ length: 8 }, (_, i) => ({
  id: `riziere-${i + 1}`, name: `Rizière ${i + 1}`, kind: 'riziere' as const,
  x: -142 - i * 9.5, z: -6 + Math.sin(i * 0.9) * 3, w: 9, d: 58 - Math.abs(i - 3) * 4, yaw: 0.05 * (i - 3), y: 7 + i,
}));
/** Théiers : 6 terrasses en courbe de niveau sur le coteau du thé. */
const TEA: FieldDef[] = Array.from({ length: 6 }, (_, i) => ({
  id: `the-${i + 1}`, name: `Terrasse de thé ${i + 1}`, kind: 'the' as const,
  x: 116 + i * 5, z: -82 - i * 4.5, w: 42, d: 4.5, yaw: facing(-1, 1.2) + Math.PI / 2, y: 9 + i * 2,
}));

export const FIELDS: FieldDef[] = [
  ...RICE,
  ...TEA,
  { id: 'potager-capy', name: 'Potager de la maison de Capy', kind: 'potager', x: -24, z: 30, w: 7, d: 5, yaw: H },
  { id: 'potager-etang', name: 'Potagers de l’Étang', kind: 'potager', x: -58, z: 52, w: 14, d: 8, yaw: 0.3 },
  { id: 'potager-cedres', name: 'Potager des Cèdres', kind: 'potager', x: -60, z: -18, w: 10, d: 6, yaw: 0.7 },
  { id: 'potager-ferme', name: 'Potager de la ferme', kind: 'potager', x: -98, z: 8, w: 12, d: 8, yaw: 0 },
  { id: 'jardin-honjin', name: 'Jardin sec de Mamie', kind: 'jardin-sec', x: -54, z: -3, w: 8, d: 10, yaw: H },
  { id: 'jardin-ryokan', name: 'Jardin de mousse du Grand Ryokan', kind: 'jardin-mousse', x: 106, z: 8, w: 10, d: 14, yaw: 0 },
  { id: 'fleurs-gue', name: 'Prés fleuris du Gué', kind: 'fleurs', x: 5, z: 185, w: 36, d: 24, yaw: 0.4 },
  { id: 'fleurs-verger', name: 'Lisière fleurie du verger', kind: 'fleurs', x: 140, z: 150, w: 16, d: 40, yaw: 0.6 },
];

/** Verger de yuzus : arbres en quinconce espacés de 6 m (≈ 60 arbres). */
export const ORCHARD = { id: 'verger-yuzus', name: 'Verger des Yuzus', x: 114, z: 150, w: 54, d: 40, yaw: 0.6, spacing: 6, y: 11 };

/** Les 5 yuzus de la mission « Bienvenue », chacun au pied d'un arbre du verger (x, z). */
export const YUZU_SPOTS: XZ[] = [[100, 140], [110, 144], [120, 150], [106, 158], [118, 160]];

// =================================================================================================== VÉGÉTATION
export type ForestKind = 'cedres' | 'erables' | 'pins' | 'mixte' | 'bambous' | 'cerisiers';
/** Massifs boisés (x, z, r gardés pour compatibilité ; `density` en arbres par hectare). */
export const FOREST_BELTS: { x: number; z: number; r: number; id: string; name: string; kind: ForestKind; density: number }[] = [
  { id: 'bois-sacre', name: 'Bois sacré des cèdres', x: -62, z: -160, r: 32, kind: 'cedres', density: 260 },
  { id: 'gorge', name: 'Érablière de la gorge', x: 112, z: -215, r: 55, kind: 'erables', density: 220 },
  { id: 'nord', name: 'Forêt du Col', x: 10, z: -280, r: 100, kind: 'cedres', density: 200 },
  { id: 'est', name: 'Forêt des Brumes', x: 265, z: -30, r: 85, kind: 'mixte', density: 180 },
  { id: 'sud-est', name: 'Bois des Lucioles', x: 215, z: 200, r: 90, kind: 'mixte', density: 160 },
  { id: 'sud-ouest', name: 'Forêt du Hibou', x: -215, z: 215, r: 95, kind: 'cedres', density: 180 },
  { id: 'ouest', name: 'Forêt de Kuma', x: -285, z: -80, r: 100, kind: 'cedres', density: 200 },
  { id: 'nord-ouest', name: 'Pinède du Corbeau', x: -195, z: -265, r: 80, kind: 'pins', density: 140 },
  { id: 'bambous', name: 'Bambouseraie du Murmure', x: -52, z: 112, r: 14, kind: 'bambous', density: 2500 },
];

/** Arbres isolés remarquables (placés à la main). */
export const FEATURE_TREES: { id: string; kind: 'cerisier-pleureur' | 'cerisier' | 'erable' | 'pin-noir' | 'cedre-geant' | 'gingko'; x: number; z: number; h: number }[] = [
  { id: 'grand-cerisier', kind: 'cerisier-pleureur', x: -9, z: -7, h: 13 },
  { id: 'cedre-sanctuaire', kind: 'cedre-geant', x: -46, z: -92, h: 34 },
  { id: 'erable-pont', kind: 'erable', x: 71, z: 14, h: 9 },
  { id: 'erable-rotenburo', kind: 'erable', x: 70, z: 66, h: 8 },
  { id: 'cerisier-etang-1', kind: 'cerisier', x: -95, z: 60, h: 9 },
  { id: 'cerisier-etang-2', kind: 'cerisier', x: -162, z: 70, h: 8 },
  { id: 'pin-belvedere', kind: 'pin-noir', x: 180, z: -172, h: 10 },
  { id: 'pin-pagode', kind: 'pin-noir', x: -50, z: -110, h: 11 },
  { id: 'gingko-honjin', kind: 'gingko', x: -52, z: -10, h: 14 },
  { id: 'cerisier-torii', kind: 'cerisier', x: 4, z: 116, h: 8 },
];

// =================================================================================================== GAMEPLAY
/** Prairies de hautes herbes (susuki) où se cachent les ennemis. {x, z, r} gardés pour compatibilité. */
export const TALL_GRASS_ZONES: { x: number; z: number; r: number; id: string; name: string; y: number; enemies: number; difficulty: 1 | 2 | 3 }[] = [
  { id: 'levant', name: 'Prairie des Susuki du Levant', x: 158, z: 18, r: 26, y: 14, enemies: 5, difficulty: 1 },
  { id: 'gue', name: 'Prés du Gué', x: -92, z: 200, r: 26, y: 5.5, enemies: 5, difficulty: 2 },
  { id: 'plateau', name: 'Plateau des Susuki', x: -100, z: -190, r: 24, y: 31, enemies: 6, difficulty: 3 },
];

/** Cachettes des ennemis (2 à 3 par prairie) et boucle de patrouille (rayon relatif au rayon de la prairie). */
export const ENEMY_NESTS: { zone: string; x: number; z: number }[] = [
  { zone: 'levant', x: 150, z: 8 }, { zone: 'levant', x: 168, z: 26 }, { zone: 'levant', x: 152, z: 32 },
  { zone: 'gue', x: -100, z: 190 }, { zone: 'gue', x: -80, z: 206 }, { zone: 'gue', x: -98, z: 214 },
  { zone: 'plateau', x: -108, z: -180 }, { zone: 'plateau', x: -90, z: -198 }, { zone: 'plateau', x: -106, z: -204 },
];
export const ENEMY_RULES = { patrolRadius: 0.55, aggroRadius: 8, leash: 6, respawnSeconds: 90 };

/** Zones sûres : aucun ennemi n'y entre jamais. */
export const SAFE_ZONES: { id: string; x: number; z: number; r: number }[] = [
  { id: 'village', x: 0, z: 0, r: VILLAGE_RADIUS },
  { id: 'rotenburo', x: 60, z: 70, r: 25 },
  { id: 'etang', x: -120, z: 90, r: 55 },
  { id: 'belvedere', x: 176, z: -168, r: 15 },
  { id: 'ferme', x: -114, z: -12, r: 30 },
];

/** Emplacements des PNJ de Capyville (y = sol local + 0,2 ; l'intégration les applique dans le village). */
export const NPC_SPOTS: Record<string, { x: number; z: number; yaw: number; note: string }> = {
  mamie: { x: 5, z: -3, yaw: facing(-1, 1), note: 'sous le cerisier, près du puits ; donne la mission Bienvenue' },
  shop: { x: -6, z: -20.5, yaw: 0, note: 'Basile devant sa chapellerie, angle nord-ouest de la place' },
  photographer: { x: 2, z: -43, yaw: -H, note: 'Léo devant son studio, Rue du Col ; voit le moulin au nord-est' },
  coach: { x: 20, z: -108, yaw: facing(-1, 1), note: 'Coach Capy à l’aire des véhicules, juste après la porte du Col' },
  swimmer: { x: -110, z: 60, yaw: facing(-0.3, 1), note: 'Nina sur le ponton de la rive nord de l’étang' },
  onsen1: { x: 63, z: 68, yaw: -H, note: 'capybara zen dans le rotenburo' },
  onsen2: { x: 57, z: 73, yaw: H, note: 'capybara zen dans le rotenburo' },
  guardian: { x: 96, z: -33, yaw: facing(-1, 0.3), note: 'Gardienne Sora à la porte du Levant ; mission de combat (prairie du Levant)' },
  miller: { x: 44, z: -66, yaw: -H, note: 'Meunier devant le moulin' },
  tea: { x: 17, z: -22.5, yaw: Math.PI, note: 'Hôtesse de la maison de thé' },
};

/** Véhicules garés : hors du cœur piéton, aux portes. */
export const VEHICLE_SPOTS: { type: 'car' | 'scooter'; x: number; z: number; yaw: number }[] = [
  { type: 'car', x: 25, z: -112, yaw: Math.PI },
  { type: 'scooter', x: 2, z: 126, yaw: 0 },
];

/** Moulin (photo de la mission « Clic-clac ») : déplacé de (-75, -70) vers le torrent. */
export const MILL_POS: XZ = [48, -72];
/** Roue du moulin (axe est-ouest, plan de la roue parallèle au torrent). */
export const MILL_WHEEL = { x: 57.2, z: -72, diameter: 5.5, width: 1.2 };

// =================================================================================================== REPÈRES
export const LANDMARKS: { id: string; name: string; x: number; z: number; top: number; role: string }[] = [
  { id: 'pagode', name: 'Pagode rouge', x: -42, z: -119, top: 51, role: 'repère n°1, visible de partout ; indique la colline sacrée et le point de vue' },
  { id: 'cerisier', name: 'Grand Cerisier', x: -9, z: -7, top: 19, role: 'cœur de la place, se voit du bout de chaque rue' },
  { id: 'vapeur-yubatake', name: 'Colonne de vapeur du yubatake', x: 38, z: -36, top: 30, role: 'signale le quartier des bains' },
  { id: 'vapeur-rotenburo', name: 'Vapeur du rotenburo', x: 60, z: 70, top: 22, role: 'guide vers la mission de la source chaude' },
  { id: 'cheminee-sento', name: 'Cheminée des bains publics', x: 46, z: 7, top: 20, role: 'fumée blanche haute' },
  { id: 'grand-ryokan', name: 'Grand Ryokan', x: 90, z: 4, top: 19, role: 'masse de trois étages éclairée la nuit' },
  { id: 'moulin', name: 'Roue du moulin', x: 57, z: -72, top: 13, role: 'mouvement visible depuis la Rue du Col' },
  { id: 'grand-torii', name: 'Grand Torii', x: -6, z: 120, top: 15.5, role: 'ferme la perspective de la Grand-Rue, cadre le mont Fuji' },
  { id: 'cascade-koi', name: 'Cascade aux Koï', x: -94, z: 111, top: 4, role: 'son et brume, attire vers l’étang' },
  { id: 'belvedere', name: 'Pavillon du Belvédère', x: 176, z: -168, top: 64, role: 'silhouette sur l’éperon, récompense d’exploration' },
  { id: 'gassho', name: 'Toit de chaume de la ferme', x: -114, z: -12, top: 21, role: 'grand triangle de chaume à l’ouest' },
];

/** Vues composées (caméra au niveau du joueur, cap en degrés). Servent aussi aux captures de revue. */
export const VIEWPOINTS: { id: string; name: string; x: number; z: number; bearing: number; sees: string }[] = [
  { id: 'depart', name: 'Sortie de la maison', x: -3, z: 26, bearing: 0, sees: 'place, Grand Cerisier, torii du sandō, escaliers et pagode sur la colline ; vapeur à droite' },
  { id: 'place-sud', name: 'Place vers le sud', x: 0, z: 10, bearing: 180, sees: 'Grand-Rue, lanternes, Grand Torii et mont Fuji juste à droite' },
  { id: 'pont-lanternes', name: 'Pont des Lanternes', x: 66, z: 6, bearing: 5, sees: 'torrent canalisé, balcons du Grand Ryokan, roue du moulin, gorge et mont Tanuki dans la brume' },
  { id: 'rotenburo', name: 'Bain extérieur', x: 58, z: 72, bearing: 120, sees: 'pont du Bain, verger de yuzus, érable rouge, vapeur' },
  { id: 'pagode', name: 'Sommet de la pagode', x: -38, z: -108, bearing: 165, sees: 'toits du village, colonnes de vapeur, Grand-Rue jusqu’au torii, mont Fuji au fond' },
  { id: 'etang', name: 'Pont Vermillon', x: -138, z: 68, bearing: 110, sees: 'étang, îlot, cascade aux Koï, cerisiers, maison de thé' },
  { id: 'belvedere', name: 'Belvédère', x: 174, z: -166, bearing: 220, sees: 'toute la vallée, village, pagode, étang ; mont Fuji au sud' },
];

/** Position du mont Fuji (région Japon) pour les cadrages : voir FUJI_POS dans heightmap.ts. */
export const FUJI_BEARING_FROM_PLAZA = 6;

// =================================================================================================== PERFORMANCE
/** Budget par zone en qualité « Moyenne », caméra placée dans la zone (appels de dessin, triangles). */
export const PERF_BUDGET: { zone: string; drawCalls: number; triangles: number; lights: number }[] = [
  { zone: 'place + Grand-Rue', drawCalls: 650, triangles: 2_800_000, lights: 8 },
  { zone: 'quartier des bains', drawCalls: 600, triangles: 2_600_000, lights: 8 },
  { zone: 'colline sacrée', drawCalls: 450, triangles: 2_000_000, lights: 6 },
  { zone: 'étang', drawCalls: 450, triangles: 2_000_000, lights: 6 },
  { zone: 'prairies et forêts', drawCalls: 400, triangles: 2_500_000, lights: 2 },
];
/** Distances de LOD (m) : complet / simplifié / imposteur (carte ou boîte) / caché. */
export const LOD_DISTANCES = { building: [45, 140, 400], prop: [25, 60, 0], tree: [40, 120, 600], rock: [30, 90, 300], grass: [0, 60, 0] };

// =================================================================================================== OUTILS
/** Distance d'un point à une polyligne. */
export function distToPolyline(x: number, z: number, pts: XZ[]) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const vx = bx - ax, vz = bz - az;
    const l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
    best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return best;
}

/** Altitude de la surface du torrent au point le plus proche (interpolée), et distance à son axe. */
export function streamAt(x: number, z: number) {
  let best = { d: Infinity, y: 0, w: STREAM_WIDTH };
  for (let i = 0; i < STREAM.length - 1; i++) {
    const [ax, az] = STREAM[i], [bx, bz] = STREAM[i + 1];
    const vx = bx - ax, vz = bz - az;
    const l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
    const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
    if (d < best.d) best = { d, y: STREAM_WATER_Y[i] + (STREAM_WATER_Y[i + 1] - STREAM_WATER_Y[i]) * t, w: STREAM_WIDTHS[i] + (STREAM_WIDTHS[i + 1] - STREAM_WIDTHS[i]) * t };
  }
  return best;
}

/** Vrai si le point est dans une prairie à ennemis. */
export function inTallGrass(x: number, z: number) {
  return TALL_GRASS_ZONES.some((g) => Math.hypot(x - g.x, z - g.z) < g.r);
}

/** Vrai si le point est dans une zone sûre. */
export function inSafeZone(x: number, z: number) {
  return SAFE_ZONES.some((s) => Math.hypot(x - s.x, z - s.z) < s.r);
}
