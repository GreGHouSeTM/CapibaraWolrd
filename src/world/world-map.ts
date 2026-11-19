// Carte du monde de 8 × 8 km : source de vérité chiffrée du Lead open world & level design.
// Le texte qui explique chaque choix est dans docs/BIBLE-MONDE.md ; la carte lisible est docs/plan-monde.svg
// (générée par `node tools/plan-monde.mjs` depuis ce fichier). Capyville elle-même reste décrite par zones.ts
// (village, couronne de sommets, cols, torrent) : ce fichier part des sorties des cols (`COL_ROUTES` de valley.ts).
//
// Conventions (identiques à zones.ts) :
// - mètres ; x vers l'est, z vers le sud ; le nord est -z ; centre du monde = place de Capyville (0, 0) ;
// - le monde couvre x, z ∈ [-4000, 4000] ; la mer (plan d'eau global) est à y = 0 ; les lacs et rivières ont
//   leur propre altitude d'eau (rubans et plans à hauteur locale, comme le torrent de Capyville) ;
// - un cap (bearing) se mesure en degrés depuis le nord, sens horaire : direction (sin b, -cos b) ;
// - polygones donnés dans le sens horaire sur la carte (nord en haut), polylignes d'amont en aval
//   pour l'eau et de départ vers arrivée pour les voies.
//
// Ce fichier ne dépend d'aucun module de rendu et n'est branché nulle part dans le jeu pour l'instant :
// le Terrain, la Végétation, les Routes, l'Eau, les Villes et les Points d'intérêt le liront.
// Il est volontairement autonome (pas d'import) pour pouvoir être lu directement par Node (outils hors ligne).

export type XZ = [number, number];
/** Point avec altitude cible : [x, z, y]. */
export type XZY = [number, number, number];

// =================================================================================================== MONDE
export const WORLD = {
  /** côté du carré (m) */
  size: 8000,
  half: 4000,
  seaLevel: 0,
  /** centre = place de Capyville */
  center: [0, 0] as XZ,
  /** point le plus haut (Pic de l'Aurore) */
  maxAltitude: 950,
  /** l'île-monde : surface émergée ≈ 44 km², dont ≈ 36 km² de terres sauvages */
  name: "l'Île aux Sept Sources",
};

/** Vitesses de déplacement (m/s), lues dans src/gameplay/player.ts et src/vehicles/vehicle.ts. */
export const SPEEDS = {
  marche: 4.2,
  sprint: 8.5, // à quatre pattes
  nage: 3.2,
  /** vitesses moyennes réalistes en voiture (virages, côtes), la vitesse de pointe est 30 m/s */
  voiture: { asphalte: 22, gravier: 14, piste: 10 },
  /** coefficient de marche hors piste et en sentier (pente, végétation) */
  sentier: 0.8,
};

/** Polygone régulier approché d'un cercle (aide pour les biomes ronds). */
export function circlePoly(cx: number, cz: number, r: number, n = 16): XZ[] {
  const out: XZ[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([Math.round(cx + Math.sin(a) * r), Math.round(cz - Math.cos(a) * r)]);
  }
  return out;
}

// =================================================================================================== CÔTE
/**
 * Trait de côte de l'île (sens horaire depuis le nord-ouest). Le terrain plonge sous la mer au-delà
 * (fond à -14 m à 300 m du rivage). Entre les points, le Terrain ajoute un bruit de 20 à 40 m d'amplitude
 * (criques, pointes) sauf sur les falaises (`COAST_CLIFFS`) qui restent nettes.
 */
export const COASTLINE: XZ[] = [
  // --- côte nord : lande et falaises blanches, estuaire de la Seine
  [-3300, -3000], [-2900, -3200], [-2450, -3320], [-2000, -3450], [-1700, -3600], [-1400, -3580], [-1250, -3560],
  [-1160, -3480], [-1060, -3580], [-700, -3700], [-200, -3730], [300, -3720], [900, -3680], [1500, -3600],
  // --- côte nord-est : criques, puis baie de New York
  [2100, -3420], [2700, -3000], [3100, -2600], [3350, -2150], [3400, -1850], [3050, -1780], [2780, -1640],
  [2640, -1520], [2620, -1380], [2760, -1220], [3080, -1130], [3420, -1050],
  // --- côte est : falaises des Hautes Plaines, embouchure de la Rivière Rouge, falaises des dunes
  [3550, -600], [3620, 0], [3640, 330], [3700, 900], [3650, 1500], [3580, 1800], [3400, 2350],
  // --- côte sud-est : jungle, embouchure de la Rivière de Jade, falaises noires du mont Fuji
  [3100, 2850], [2700, 3200], [2200, 3450], [1700, 3600], [1300, 3660], [1100, 3700], [900, 3680], [600, 3700],
  [300, 3720], [0, 3700], [-200, 3680], [-300, 3640], [-420, 3670], [-800, 3650], [-1200, 3620],
  // --- côte sud-ouest : côte des Embruns, baie gelée du Pôle
  [-1600, 3500], [-2000, 3300], [-2350, 3050], [-2450, 2850], [-2380, 2620], [-2450, 2450], [-2650, 2380],
  [-2850, 2400], [-3050, 2500], [-3250, 2700], [-3450, 2350], [-3600, 1800], [-3620, 1200],
  // --- côte ouest : fjord du glacier, landes, estuaire de la Tamise
  [-3550, 850], [-3350, 720], [-3180, 640], [-3380, 520], [-3650, 420], [-3720, 0], [-3680, -500], [-3500, -1000],
  [-3300, -1250], [-3050, -1330], [-2900, -1400], [-3050, -1500], [-3300, -1600], [-3600, -1800], [-3700, -2300],
  [-3550, -2700],
];

export type CoastKind = 'plage' | 'galets' | 'falaise' | 'rochers' | 'dunes' | 'glace' | 'quai' | 'mangrove';
/** Natures du rivage par tronçon (sinon : plage de sable ou de galets selon le biome). */
export const COAST_SEGMENTS: { id: string; name: string; kind: CoastKind; pts: XZ[]; height?: number; note: string }[] = [
  { id: 'falaises-blanches', name: 'Falaises Blanches', kind: 'falaise', height: 55, pts: [[-2900, -3200], [-2450, -3320], [-2000, -3450], [-1700, -3600], [-1400, -3580]], note: 'craie blanche striée de silex, pelouse rase au sommet, plages de galets au pied à marée basse ; cascade du Cap' },
  { id: 'cote-opale', name: 'Plages de la Seine', kind: 'plage', pts: [[-1250, -3560], [-1060, -3580], [-700, -3700], [300, -3720]], note: 'estuaire, prés salés, dunes grises à oyats' },
  { id: 'criques-nord', name: 'Criques des Érables', kind: 'rochers', pts: [[900, -3680], [2100, -3420], [3100, -2600]], note: 'granit rose arrondi, pins et érables jusqu’au rivage' },
  { id: 'quais-ny', name: 'Quais de New York', kind: 'quai', pts: [[2780, -1640], [2640, -1520], [2620, -1380], [2760, -1220]], note: 'quais de pierre, jetées de bois, entrepôts de brique' },
  { id: 'falaises-plaines', name: 'Falaises des Hautes Plaines', kind: 'falaise', height: 90, pts: [[3420, -1050], [3550, -600], [3620, 0]], note: 'grès rouge en gradins, arches marines' },
  { id: 'falaises-dunes', name: 'Falaise des Dunes', kind: 'falaise', height: 70, pts: [[3700, 900], [3650, 1500], [3580, 1800]], note: 'dunes perchées qui croulent en coulées de sable vers une plage blonde' },
  { id: 'plages-jungle', name: 'Plages de la Jungle', kind: 'mangrove', pts: [[2700, 3200], [1700, 3600], [1100, 3700]], note: 'sable blanc, cocotiers, palétuviers à l’embouchure de la Rivière de Jade' },
  { id: 'falaises-noires', name: 'Falaises Noires', kind: 'falaise', height: 60, pts: [[900, 3680], [600, 3700], [300, 3720]], note: 'lave noire en orgues, plage de sable noir, arches' },
  { id: 'embruns', name: 'Côte des Embruns', kind: 'rochers', pts: [[-800, 3650], [-1600, 3500], [-2350, 3050]], note: 'rochers sombres, pins tordus par le vent, puis glace' },
  { id: 'baie-gelee', name: 'Baie Gelée', kind: 'glace', pts: [[-2450, 2850], [-2380, 2620], [-2650, 2380], [-3050, 2500], [-3250, 2700]], note: 'banquise praticable à pied dans la baie, eau libre au-delà de l’embouchure' },
  { id: 'fjord', name: 'Fjord du Glacier', kind: 'falaise', height: 120, pts: [[-3550, 850], [-3350, 720], [-3180, 640], [-3380, 520], [-3650, 420]], note: 'parois de granite sombre, front du glacier au fond, cascade du Voile' },
  { id: 'estuaire-tamise', name: 'Estuaire de la Tamise', kind: 'galets', pts: [[-3300, -1250], [-2900, -1400], [-3300, -1600]], note: 'vasières, roselières, digues' },
];

/** Petites îles (toutes atteignables à la nage ou en bateau). */
export const ISLANDS: { id: string; name: string; x: number; z: number; r: number; y: number; note: string }[] = [
  { id: 'ile-statue', name: 'Île de la Statue', x: 2950, z: -1430, r: 45, y: 4, note: 'statue géante originale (une capybara tenant une lanterne), baie de New York' },
  { id: 'ile-tortues', name: 'Île aux Tortues', x: 1900, z: 3820, r: 70, y: 6, note: 'îlot de sable et de cocotiers au large de la jungle, tortues qui pondent' },
  { id: 'ile-torii', name: 'Rocher du Torii', x: -650, z: 3780, r: 18, y: 9, note: 'rocher marin couronné d’un torii et d’un pin, relié à la plage à marée basse' },
  { id: 'ile-phare', name: 'Écueil du Phare', x: -1850, z: -3720, r: 25, y: 3, note: 'écueil à phoques sous le phare du Cap Blanc' },
  { id: 'iceberg-arche', name: 'Iceberg de l’Arche', x: -2900, z: 2900, r: 60, y: 18, note: 'iceberg échoué percé d’une arche, au bord de la banquise' },
];

// =================================================================================================== RÉGIONS
export type RegionId = 'hub' | 'paris' | 'newyork' | 'london' | 'japan' | 'desert' | 'pole';
export type MacroZoneId = 'couronne' | 'seine' | 'albion' | 'amerique' | 'desert' | 'asie' | 'arctique';

export interface WorldRegion {
  id: RegionId;
  name: string;
  zone: MacroZoneId;
  x: number;
  z: number;
  /** cap depuis la place de Capyville (°) */
  bearing: number;
  /** rayon du cœur bâti (ville dense) */
  core: number;
  /** rayon d'influence (faubourgs, ambiance, musique) */
  radius: number;
  /** altitude du sol de référence du cœur (la ville suit le relief autour, ±15 m) */
  ground: number;
  /** distance de la place de Capyville (m) */
  distance: number;
  site: string;
}

const brg = (x: number, z: number) => (x === 0 && z === 0 ? 0 : Math.round(((Math.atan2(x, -z) * 180) / Math.PI + 360) % 360));
const region = (r: Omit<WorldRegion, 'bearing' | 'distance'>): WorldRegion => ({ ...r, bearing: brg(r.x, r.z), distance: Math.round(Math.hypot(r.x, r.z)) });

/**
 * Les sept régions. Les caps restent ceux des cols de Capyville (Paris 0°, New York 60°, Désert 120°, Japon 180°,
 * Pôle 240°, Londres 300°) à ±15° près ; chaque route se recourbe ensuite selon le relief.
 */
export const WORLD_REGIONS: WorldRegion[] = [
  region({ id: 'hub', name: 'Capyville', zone: 'couronne', x: 0, z: 0, core: 110, radius: 520, ground: 6, site: 'vallée en cuvette fermée par sept sommets (zones.ts) ; carrefour des six vieux chemins' }),
  region({ id: 'paris', name: 'Paris', zone: 'seine', x: -150, z: -2650, core: 520, radius: 950, ground: 11, site: 'méandre de la Seine, île de la Cité, butte aux moulins au nord, coteaux au sud' }),
  region({ id: 'newyork', name: 'New York', zone: 'amerique', x: 2350, z: -1450, core: 560, radius: 950, ground: 8, site: 'presqu’île rocheuse entre la Rivière des Érables et la baie, quais, grand parc sur un affleurement de granit' }),
  region({ id: 'desert', name: 'Le Désert des Dunes', zone: 'desert', x: 2300, z: 1350, core: 220, radius: 1150, ground: 38, site: 'oasis dans une cuvette de l’erg, ksar de terre crue, palmeraie ; pyramides au sud-est' }),
  region({ id: 'japan', name: 'Le Japon', zone: 'asie', x: -800, z: 2380, core: 430, radius: 950, ground: 8, site: 'ville au bord du Lac du Torii, au pied nord-ouest du mont Fuji ; vieille ville au nord, port au sud' }),
  region({ id: 'pole', name: 'Le Pôle Nord', zone: 'arctique', x: -2650, z: 2150, core: 220, radius: 950, ground: 4, site: 'station polaire au fond de la Baie Gelée, banquise, toundra et Lac de l’Aurore au-dessus' }),
  region({ id: 'london', name: 'Londres', zone: 'albion', x: -2400, z: -1350, core: 520, radius: 950, ground: 12, site: 'boucles de la Tamise avant l’estuaire, docks à l’ouest, collines du Couchant au nord-est' }),
];

/** Zones de grande échelle (ambiance, musique, météo) : chaque région et ses terres sauvages. */
export const MACRO_ZONES: { id: MacroZoneId; name: string; regions: RegionId[]; biomes: BiomeId[]; mood: string }[] = [
  { id: 'couronne', name: 'Pays de la Couronne', regions: ['hub'], biomes: ['couronne'], mood: 'vapeur, cèdres, cloches de temple, eau tiède' },
  { id: 'seine', name: 'Vallée de la Seine', regions: ['paris'], biomes: ['bocage-seine', 'lande'], mood: 'peupliers, clochers, moulins, matin brumeux sur l’eau' },
  { id: 'albion', name: 'Pays d’Albion', regions: ['london'], biomes: ['bocage-albion', 'cote-ouest'], mood: 'murets de pierre, moutons, collines vertes, pluie fine et arcs-en-ciel' },
  { id: 'amerique', name: 'Pays des Lacs et des Plaines', regions: ['newyork'], biomes: ['erables-lacs', 'prairies-ranch'], mood: 'érables flamboyants, lacs, granges rouges, grandes plaines, canyon' },
  { id: 'desert', name: 'Pays des Ocres', regions: ['desert'], biomes: ['garrigue', 'savane', 'dunes'], mood: 'cigales, ocres, lumière blanche, dunes, ciel immense' },
  { id: 'asie', name: 'Pays du Levant', regions: ['japan'], biomes: ['rizieres', 'foret-asiatique', 'volcan', 'jungle'], mood: 'rizières miroir, bambous, mont Fuji, jungle de brume' },
  { id: 'arctique', name: 'Pays du Givre', regions: ['pole'], biomes: ['piemont', 'alpages', 'haute-montagne', 'pinede-neige', 'toundra', 'banquise'], mood: 'clarines, chalets, neige dorée, silence, aurores' },
];

// =================================================================================================== VILLAGES ET HAMEAUX
export type Style =
  | 'onsen' | 'colombages-normands' | 'pierre-chaume' | 'bois-clapboard' | 'ranch' | 'mas-provencal' | 'ksar'
  | 'minka' | 'pilotis' | 'chalet-alpin' | 'cabane-nordique' | 'yourte' | 'pecheurs';

/** Lieux habités hors des sept régions (le village alpin est la porte d'entrée du Pays du Givre). */
export const SETTLEMENTS: { id: string; name: string; kind: 'village' | 'hameau' | 'ferme' | 'campement' | 'port'; x: number; z: number; y: number; r: number; style: Style; houses: number; note: string }[] = [
  { id: 'clarines', name: 'Les Clarines', kind: 'village', x: -1450, z: 900, y: 170, r: 160, style: 'chalet-alpin', houses: 34,
    note: 'village alpin (ref-9 à ref-11) : église au clocher à bulbe, fontaine, chalets à balcons fleuris sur soubassement de pierre, prés fleuris en pente, cascade des Clarines au-dessus ; porte d’entrée du Pays du Givre' },
  { id: 'gue-aux-saules', name: 'Le Gué-aux-Saules', kind: 'hameau', x: -450, z: -1500, y: 14, r: 70, style: 'colombages-normands', houses: 9, note: 'lavoir couvert, pont de pierre à deux arches, saules têtards' },
  { id: 'hameau-du-cap', name: 'Hameau du Cap', kind: 'hameau', x: -1550, z: -3330, y: 48, r: 60, style: 'pierre-chaume', houses: 7, note: 'maisons de pêcheurs blanchies, filets, chemin du phare' },
  { id: 'hameau-chaumes', name: 'Hameau des Chaumes', kind: 'hameau', x: -1750, z: -1150, y: 34, r: 70, style: 'pierre-chaume', houses: 10, note: 'cottages de pierre à toits de chaume, jardins de roses, salon de thé, pont à dos d’âne' },
  { id: 'port-aux-huards', name: 'Port-aux-Huards', kind: 'port', x: 860, z: -2050, y: 47, r: 70, style: 'bois-clapboard', houses: 8, note: 'cabanes de bois peintes, ponton, canoës, vue sur le château de l’île' },
  { id: 'ferme-erables', name: 'Ferme des Érables', kind: 'ferme', x: 1050, z: -1050, y: 42, r: 50, style: 'bois-clapboard', houses: 4, note: 'grange rouge, silo, cabane à sucre fumante, citrouilles' },
  { id: 'ranch-dormeur', name: 'Ranch du Dormeur', kind: 'ferme', x: 2100, z: -520, y: 150, r: 60, style: 'ranch', houses: 5, note: 'corral, éolienne de pompage, abreuvoir, vue sur le Dormeur' },
  { id: 'bastide-cigales', name: 'Bastide des Cigales', kind: 'hameau', x: 760, z: 620, y: 58, r: 70, style: 'mas-provencal', houses: 8, note: 'mas de pierre aux volets bleus, oliviers, champs de lavande, fontaine sous un platane' },
  { id: 'caravanserail', name: 'Caravansérail des Ocres', kind: 'hameau', x: 1900, z: 950, y: 46, r: 55, style: 'ksar', houses: 6, note: 'cour à arcades, puits, dromadaires, dernière étape avant l’oasis' },
  { id: 'hameau-rizieres', name: 'Hameau des Rizières', kind: 'hameau', x: -300, z: 1250, y: 7, r: 70, style: 'minka', houses: 9, note: 'minka à toit de chaume sur buttes, séchoirs à riz, petit sanctuaire, épouvantails' },
  { id: 'village-pilotis', name: 'Village sur pilotis', kind: 'village', x: 1250, z: 3150, y: 35, r: 90, style: 'pilotis', houses: 16, note: 'maisons de bambou et de palmes sur pilotis au-dessus de la Rivière de Jade, passerelles, pirogues' },
  { id: 'onsen-neiges', name: 'Onsen des Neiges', kind: 'hameau', x: -1700, z: 2420, y: 60, r: 45, style: 'minka', houses: 3, note: 'source chaude sauvage dans la neige, ryokan à moitié en ruine, vapeur visible de loin' },
  { id: 'campement-rennes', name: 'Campement des Rennes', kind: 'campement', x: -2250, z: 1750, y: 150, r: 45, style: 'yourte', houses: 5, note: 'tentes de bergers de rennes, feu, traîneaux ; on y loue une motoneige' },
  { id: 'port-aux-phoques', name: 'Port-aux-Phoques', kind: 'port', x: -3480, z: 440, y: 6, r: 60, style: 'pecheurs', houses: 9, note: 'maisons de bois rouges sur pilotis de pierre, séchoirs à poissons, vue sur le front du glacier' },
];

// =================================================================================================== RELIEF
/** Grands sommets du monde (hors couronne de Capyville, voir PEAKS de zones.ts). */
export type PeakShape = 'volcan' | 'alpin' | 'dome' | 'mesa' | 'butte' | 'arrondi' | 'dormeur';
export const WORLD_PEAKS: { id: string; name: string; x: number; z: number; y: number; base: number; shape: PeakShape; snow?: number; note: string }[] = [
  { id: 'aurore', name: 'Pic de l’Aurore', x: -2300, z: 450, y: 950, base: 1100, shape: 'alpin', snow: 600,
    note: 'point culminant ; pyramide à trois arêtes, glacier vers l’ouest jusqu’au fjord ; arête est praticable (sentier des Crêtes)' },
  { id: 'neiges', name: 'Mont des Neiges', x: -2550, z: 800, y: 820, base: 900, shape: 'alpin', snow: 600, note: 'grand dôme neigeux, se voit depuis les Clarines au-dessus de la cascade' },
  { id: 'dent-du-loup', name: 'Dent du Loup', x: -2050, z: 200, y: 680, base: 700, shape: 'alpin', snow: 620, note: 'aiguille rocheuse pointue, falaise lisible de 120 m face nord (non praticable), contournée par la Brèche' },
  { id: 'fuji', name: 'Mont Fuji', x: 305, z: 2899, y: 620, base: 1200, shape: 'volcan', snow: 430,
    note: 'volcan endormi, cône concave, cratère de 120 m ; vu de la place de Capyville au cap 174° à travers le Grand Torii' },
  { id: 'pic-de-jade', name: 'Pic de Jade', x: 1500, z: 1700, y: 420, base: 650, shape: 'arrondi', note: 'sommet couvert de forêt de nuages côté sud, rocailleux et sec côté nord' },
  { id: 'dormeur', name: 'Le Dormeur', x: 1300, z: 100, y: 330, base: 600, shape: 'dormeur',
    note: 'colline allongée nord-sud en forme de capybara endormi (tête au nord, deux rochers-oreilles, dos rond) ; se lit de profil depuis l’ouest et l’est' },
  { id: 'dome-guetteur', name: 'Dôme du Guetteur', x: 1450, z: -1200, y: 300, base: 500, shape: 'dome', note: 'dôme de granit nu poli par les glaciers, pentes de 25 à 32° praticables, belvédère au sommet' },
  { id: 'mont-fauve', name: 'Mont Fauve', x: 650, z: -1450, y: 260, base: 600, shape: 'arrondi', note: 'vieux mont arrondi couvert d’érables et de hêtres, tour de guet en ruine' },
  { id: 'butte-arbre', name: 'Butte du Grand Arbre', x: -1300, z: -1550, y: 130, base: 450, shape: 'butte', note: 'butte isolée dans le bocage, portée par le Grand Arbre de 70 m' },
  { id: 'citadelle', name: 'Mesa de la Citadelle', x: 1400, z: 750, y: 210, base: 300, shape: 'mesa', note: 'table de grès au sommet plat (r 120 m), falaises de 30 m lisibles, une rampe au sud-ouest ; ruines de la Citadelle des Ocres' },
  { id: 'mesa-rouge', name: 'Mesa Rouge', x: 1150, z: 1150, y: 170, base: 220, shape: 'mesa', note: 'petite table de grès rouge, aucun accès balisé : grimpe par l’éboulis nord' },
  { id: 'mesa-ocre', name: 'Mesa Ocre', x: 1750, z: 450, y: 190, base: 260, shape: 'mesa', note: 'avancée du plateau des Hautes Plaines, rebord en falaise au-dessus de la garrigue' },
  { id: 'cretes-blanches', name: 'Crêtes Blanches', x: -2100, z: 1750, y: 520, base: 500, shape: 'alpin', snow: 380, note: 'ligne de crêtes enneigées qui sépare le Pays du Givre du Pays du Levant' },
];

/** Chaînes : lignes de crête (x, z, altitude) et demi-largeur de la base. Le profil transversal suit `profile`. */
export const CHAINS: { id: string; name: string; crest: XZY[]; halfWidth: number; profile: 'alpin' | 'arrondi' | 'tabulaire' | 'colline'; steepSide?: 'ouest' | 'est' | 'nord' | 'sud'; note: string }[] = [
  { id: 'givre', name: 'Massif du Givre', halfWidth: 800, profile: 'alpin', steepSide: 'ouest',
    crest: [[-1500, -300, 220], [-1800, -50, 420], [-2050, 200, 680], [-2300, 450, 950], [-2550, 800, 820], [-2650, 1200, 600], [-2550, 1550, 420]],
    note: 'colonne vertébrale du Pays du Givre ; versant ouest raide (glacier, falaises du fjord), versant est en gradins vers les Clarines' },
  { id: 'cretes-blanches', name: 'Crêtes Blanches', halfWidth: 450, profile: 'alpin', steepSide: 'nord',
    crest: [[-2550, 1550, 420], [-2100, 1750, 520], [-1600, 1850, 420], [-1200, 1800, 260]],
    note: 'éperon sud-est du massif ; s’abaisse vers la plaine des rizières' },
  { id: 'jade', name: 'Monts de Jade', halfWidth: 600, profile: 'arrondi', steepSide: 'sud',
    crest: [[900, 1500, 240], [1500, 1700, 420], [2100, 2000, 380], [2700, 2450, 300], [3150, 2800, 200]],
    note: 'arrête les nuages venus de la mer du sud : forêt de nuages et jungle au sud, savane sèche puis désert au nord' },
  { id: 'fauves', name: 'Monts Fauves', halfWidth: 520, profile: 'arrondi',
    crest: [[450, -900, 170], [650, -1450, 260], [750, -2000, 220], [700, -2300, 140], [650, -2600, 170], [500, -3150, 130]],
    note: 'vieilles montagnes usées, forêt d’érables et de hêtres ; séparent la vallée de la Seine du Pays des Lacs' },
  { id: 'couchant', name: 'Collines du Couchant', halfWidth: 450, profile: 'colline',
    crest: [[-900, -1100, 90], [-1300, -1550, 130], [-1550, -1930, 80], [-1700, -2200, 110], [-2300, -2700, 100]],
    note: 'collines de bocage entre la Seine et la Tamise, portées par la butte du Grand Arbre' },
];

/** Cols et passages du monde (hors cols de Capyville, voir COLS de zones.ts). */
export const WORLD_COLS: { id: string; name: string; x: number; z: number; y: number; width: number; links: string; note: string }[] = [
  { id: 'col-aurores', name: 'Col des Aurores', x: -2350, z: 1450, y: 330, width: 120, links: 'Clarines → toundra et Pôle', note: 'neige toute l’année, cairns, refuge ; premier point d’où l’on voit la Baie Gelée' },
  { id: 'breche-loup', name: 'Brèche du Loup', x: -1900, z: 30, y: 400, width: 40, links: 'sources de la Tamise → fjord (sentier)', note: 'passage étroit entre deux tours rocheuses, névé, vue soudaine sur le glacier et la mer' },
  { id: 'col-de-jade', name: 'Col de Jade', x: 1850, z: 1880, y: 290, width: 100, links: 'oasis → jungle (piste puis sentier)', note: 'basculement climatique : sec et ocre au nord, brume verte au sud' },
  { id: 'col-fauves', name: 'Col des Fauves', x: 700, z: -2300, y: 95, width: 160, links: 'Paris → New York (asphalte)', note: 'col boisé, érables rouges ; le Grand Lac apparaît à la sortie est' },
  { id: 'seuil-arbre', name: 'Seuil du Grand Arbre', x: -1550, z: -1930, y: 80, width: 300, links: 'Paris → Londres (asphalte)', note: 'ensellement herbeux ; le Grand Arbre domine à 400 m au sud-est' },
  { id: 'seuil-cedres', name: 'Seuil des Cèdres', x: -1250, z: -680, y: 38, width: 250, links: 'Capyville → Londres (asphalte)', note: 'replat boisé qui sépare la couronne de la vallée de la Tamise' },
];

export type ReliefZoneKind = 'plaine' | 'plateau' | 'collines' | 'piemont' | 'vallee' | 'erg' | 'toundra' | 'montagne' | 'volcan';
/**
 * Fonds de relief à grande échelle : altitude de base (bord → cœur), amplitude du bruit, rugosité et motifs.
 * Les chaînes, sommets et rivières se superposent ensuite ; l'érosion lisse et creuse le tout (voir TERRAIN_RULES).
 */
export const RELIEF_ZONES: { id: string; name: string; kind: ReliefZoneKind; poly: XZ[]; base: [number, number]; amplitude: number; roughness: number; motifs: string }[] = [
  { id: 'plaine-seine', name: 'Plaine de la Seine', kind: 'plaine', base: [10, 30], amplitude: 18, roughness: 0.3,
    poly: [[-1000, -700], [-200, -560], [350, -900], [420, -2200], [350, -3100], [-900, -3350], [-1150, -2600], [-1100, -1500]],
    motifs: 'larges méandres, terrasses alluviales de 3 à 6 m, coteaux calcaires au sud de Paris' },
  { id: 'bocage-albion', name: 'Collines d’Albion', kind: 'collines', base: [8, 80], amplitude: 45, roughness: 0.45,
    poly: [[-1100, -1300], [-1250, -2700], [-2100, -2950], [-3400, -2200], [-3450, -900], [-2400, -550], [-1500, -500]],
    motifs: 'croupes rondes, vallons en V doux, haies sur talus, murets' },
  { id: 'lande', name: 'Lande des Falaises', kind: 'plateau', base: [45, 75], amplitude: 20, roughness: 0.35,
    poly: [[-1200, -2750], [-300, -3450], [-1700, -3600], [-2900, -3200], [-3500, -2700], [-2900, -2550]],
    motifs: 'plateau ondulé incliné vers la mer, coupé net par les falaises ; valleuses (vallons suspendus) qui descendent à la plage' },
  { id: 'pays-des-lacs', name: 'Pays des Lacs', kind: 'collines', base: [35, 110], amplitude: 60, roughness: 0.55,
    poly: [[450, -800], [1100, -500], [2000, -850], [3200, -1900], [2800, -2900], [1300, -3550], [550, -3000], [700, -1700]],
    motifs: 'relief glaciaire : roches moutonnées, cuvettes à lacs, eskers (cordons de graviers), blocs erratiques' },
  { id: 'hautes-plaines', name: 'Plateau des Hautes Plaines', kind: 'plateau', base: [110, 170], amplitude: 15, roughness: 0.2,
    poly: [[1700, -800], [2700, -1000], [3450, -900], [3600, 300], [3600, 600], [2700, 520], [1950, 420], [1700, 0]],
    motifs: 'table d’herbe rase très légèrement inclinée vers l’est, canyon de la Rivière Rouge (60 à 90 m), cheminées de fée' },
  { id: 'piemont-est', name: 'Basses terres du Dormeur', kind: 'collines', base: [20, 70], amplitude: 30, roughness: 0.35,
    poly: [[480, -300], [1100, -500], [1700, -800], [1700, 0], [1950, 420], [1350, 480], [800, 280], [520, 120]],
    motifs: 'prairies ondulées entre la couronne et le plateau, le Dormeur au milieu' },
  { id: 'garrigue', name: 'Collines des Ocres', kind: 'collines', base: [35, 110], amplitude: 50, roughness: 0.6,
    poly: [[380, 80], [800, 280], [1350, 480], [1950, 420], [2050, 750], [1750, 1050], [1500, 1400], [1050, 1550], [650, 1350], [450, 950], [330, 420]],
    motifs: 'calcaire raviné (badlands) : ravines, éboulis clairs, mesas, oued à sec' },
  { id: 'erg', name: 'Erg des Dunes', kind: 'erg', base: [35, 70], amplitude: 70, roughness: 0.15,
    poly: [[1950, 420], [2700, 550], [3650, 650], [3700, 1300], [3600, 1900], [3300, 2400], [2500, 2200], [2000, 1850], [1500, 1400], [1750, 1050], [2050, 750]],
    motifs: 'dunes linéaires orientées par le vent d’ouest (longueur d’onde 150 m, crêtes vives côté est), barkhanes en bordure, cuvette de l’oasis à 35 m, chott à 30 m' },
  { id: 'plateau-jade', name: 'Plateau de Jade', kind: 'plateau', base: [215, 250], amplitude: 15, roughness: 0.3,
    poly: [[1300, 1900], [1900, 2000], [2200, 2200], [1800, 2200], [1450, 2150]],
    motifs: 'replat suspendu sous la crête, marécages de mousse, bord net d’où tombe la Chute des Mille Voiles' },
  { id: 'jungle', name: 'Vallées de Jade', kind: 'vallee', base: [0, 160], amplitude: 70, roughness: 0.7,
    poly: [[850, 2250], [1450, 2200], [2200, 2350], [3300, 2850], [2200, 3450], [1100, 3700], [850, 3300]],
    motifs: 'vallées en V profondes, pitons calcaires (karst à tours) de 40 à 80 m, vasques et marmites, cascades étagées' },
  { id: 'volcan', name: 'Mont Fuji', kind: 'volcan', base: [8, 30], amplitude: 8, roughness: 0.25,
    poly: circlePoly(305, 2899, 1150, 32),
    motifs: 'cône concave, ravines rayonnantes (barrancos), coulées de lave anciennes, cônes secondaires, cratère sommital' },
  { id: 'rizieres', name: 'Plaine des Rizières', kind: 'plaine', base: [5, 12], amplitude: 4, roughness: 0.1,
    poly: [[-520, 400], [380, 420], [560, 900], [780, 1600], [420, 1950], [-250, 2000], [-1150, 1950], [-1350, 1650], [-1150, 1150], [-820, 640]],
    motifs: 'plaine plate quadrillée de diguettes ; buttes isolées de 15 à 40 m couvertes de rizières en terrasses et d’un sanctuaire' },
  { id: 'piemont-givre', name: 'Piémont du Givre', kind: 'piemont', base: [20, 260], amplitude: 60, roughness: 0.55,
    poly: [[-1750, -350], [-1250, -600], [-480, -380], [-420, 250], [-520, 400], [-820, 640], [-1150, 1150], [-1350, 1650], [-1700, 1500], [-2000, 1150], [-2050, 600], [-1900, 100]],
    motifs: 'gradins glaciaires, verrous rocheux, vallées en U, cônes d’éboulis au pied des parois, moraines boisées' },
  { id: 'vallee-clarines', name: 'Vallée des Clarines', kind: 'vallee', base: [120, 260], amplitude: 25, roughness: 0.35,
    poly: [[-1100, 700], [-1600, 560], [-1950, 780], [-1900, 1150], [-1500, 1250], [-1150, 1100]],
    motifs: 'vallée en U à fond plat, prés en pente douce (10 à 20 %), cascade suspendue au fond' },
  { id: 'toundra', name: 'Toundra de l’Aurore', kind: 'toundra', base: [10, 160], amplitude: 25, roughness: 0.3,
    poly: [[-2750, 1750], [-2250, 1700], [-2000, 2000], [-2150, 2450], [-2650, 2380], [-3300, 2600], [-3500, 2250], [-3200, 1950]],
    motifs: 'bosses (palses), mares gelées en chapelet, cordons de moraine, gros blocs erratiques' },
  { id: 'cote-ouest', name: 'Côte des Fjords', kind: 'collines', base: [10, 140], amplitude: 60, roughness: 0.6,
    poly: [[-2300, -500], [-3050, -450], [-3550, -900], [-3800, 300], [-3700, 1250], [-3350, 1350], [-2950, 1300], [-2850, 800], [-2450, 300], [-2100, -100]],
    motifs: 'landes rocheuses sur granite, vallons tourbeux, falaises du fjord' },
];

/**
 * Règles et paramètres pour le Terrain (procédural dirigé : ce fichier pose les grandes formes, la simulation fait le modelé).
 * Pentes en degrés. « Praticable » = le capybara marche ; « grimpe » = il monte lentement ; « glisse » = il redescend.
 */
export const TERRAIN_RULES = {
  /** résolution de la carte de hauteur cuite hors ligne (m par échantillon) et taille des tuiles */
  bakeCell: 2,
  tileSize: 256,
  /** pentes */
  slope: { walkMax: 33, climbMax: 42, slideFrom: 42, cliffFrom: 55, roadMax: 8 /* % */, trailMax: 18 /* % (marches au-delà) */ },
  /** part de la surface au-delà de 35° (hors falaises désignées) : ≤ 4 % de chaque tuile */
  steepShareMax: 0.04,
  /** falaises : seulement dans les zones désignées (COAST_SEGMENTS falaise, CLIFF_ZONES), toujours plus de 8 m de haut, roche franche et lisible */
  cliffMinHeight: 8,
  /** érosion hydraulique par gouttes (sur la grille de 4 m, puis de 2 m pour les zones proches des chemins) */
  hydraulic: { droplets: 2_400_000, inertia: 0.05, capacity: 4, deposition: 0.3, erosion: 0.3, evaporation: 0.012, radius: 3, maxLifetime: 64 },
  /** érosion thermique : talus d'éboulis à 34° (roche), 30° (terre) ; 40 itérations */
  thermal: { talusRock: 34, talusSoil: 30, iterations: 40 },
  /** replats naturels : un replat de 6 à 20 m de large tous les 25 à 45 m de dénivelé sur les versants de plus de 15° */
  benches: { every: [25, 45], width: [6, 20], minSlope: 15 },
  /** limite des neiges de base, abaissée par le Pays du Givre (snowLine = base - drop × influence arctique) */
  snow: { base: 650, drop: 700 },
  /** bruit de détail final (m) : rides et bosses de 0,3 à 1,5 m visibles à hauteur de capybara */
  microRelief: { amplitude: 0.8, wavelength: [3, 12] },
  /** aplanissements imposés (rayon de raccord en m) : villes, villages, routes (bande + 6 m), parvis des points d'intérêt */
  flatten: { city: 120, village: 40, road: 6, poi: 8 },
  /** fond marin */
  sea: { depthAt300m: -14, shelf: 120 },
};

/** Falaises voulues dans l'intérieur des terres (les falaises côtières sont dans COAST_SEGMENTS). */
export const CLIFF_ZONES: { id: string; name: string; pts: XZ[]; height: number; note: string }[] = [
  { id: 'canyon-rouge', name: 'Parois du Canyon Rouge', pts: [[1900, -560], [2350, -300], [2650, -150], [2950, 100], [3300, 250]], height: 80, note: 'gradins de grès rouge, vires praticables à mi-hauteur, deux descentes balisées' },
  { id: 'face-nord-dent', name: 'Face nord de la Dent du Loup', pts: [[-2150, 120], [-1950, 150]], height: 120, note: 'paroi verticale, repère de silhouette' },
  { id: 'rebord-jade', name: 'Rebord des Mille Voiles', pts: [[1450, 2180], [1615, 2225], [1800, 2220]], height: 80, note: 'falaise moussue d’où tombe la grande cascade' },
  { id: 'citadelle', name: 'Falaises de la Citadelle', pts: [[1300, 650], [1520, 700], [1480, 860], [1300, 820]], height: 30, note: 'couronne de grès autour de la mesa, rampe au sud-ouest' },
  { id: 'verrou-clarines', name: 'Verrou des Clarines', pts: [[-1700, 760], [-1650, 900]], height: 50, note: 'marche glaciaire au fond de la vallée, cascade des Clarines' },
  { id: 'rebord-plaines', name: 'Rebord des Hautes Plaines', pts: [[1700, 0], [1950, 420], [2700, 520], [3600, 600]], height: 40, note: 'escarpement discontinu (ravines tous les 300-500 m)' },
];

// =================================================================================================== BIOMES
export type BiomeId =
  | 'prairies' | 'couronne' | 'bocage-seine' | 'bocage-albion' | 'lande' | 'erables-lacs' | 'prairies-ranch' | 'garrigue' | 'savane'
  | 'dunes' | 'rizieres' | 'foret-asiatique' | 'volcan' | 'jungle' | 'piemont' | 'cote-ouest' | 'alpages' | 'haute-montagne'
  | 'pinede-neige' | 'toundra' | 'banquise';

export interface Biome {
  id: BiomeId;
  name: string;
  /** polygone du cœur du biome ; les polygones sont empilés dans l'ordre de la liste (le suivant recouvre le précédent) */
  poly: XZ[];
  /** largeur du fondu avec le biome voisin (m), centrée sur le bord du polygone */
  transition: number;
  /** couleur de carte et teinte dominante du sol vu de loin */
  color: string;
  ground: string;
  flora: string;
  hamlets: string;
  fog: { color: string; density: number };
  sounds: string;
  weather: string;
}


export const BIOMES: Biome[] = [
  { id: 'prairies', name: 'Prés et bosquets', poly: COASTLINE, transition: 400, color: '#9cc27a', ground: 'herbe moyenne, trèfle, chemins de terre',
    flora: 'chênes et châtaigniers isolés, bosquets, haies libres', hamlets: '—', fog: { color: '#c9d8e4', density: 0.00035 }, sounds: 'alouettes, vent dans l’herbe', weather: 'beau, cumulus' },
  { id: 'bocage-seine', name: 'Bocage de la Seine', transition: 500, color: '#a9c96e',
    poly: [[-1050, -650], [-480, -420], [150, -560], [420, -850], [480, -1500], [520, -2300], [420, -3050], [-250, -3450], [-950, -3350], [-1250, -2700], [-1150, -1900], [-1000, -1200]],
    ground: 'prés verts, champs de blé dorés et de colza, chemins blancs calcaires', flora: 'haies vives (aubépine, noisetier), peupliers d’Italie le long de l’eau, saules têtards, pommiers, chênes',
    hamlets: 'colombages, toits d’ardoise ou de tuiles plates, clochers pointus, lavoirs, moulins à eau', fog: { color: '#d4dde6', density: 0.0005 },
    sounds: 'cloches, coqs, eau du moulin, coucou', weather: 'matins brumeux sur l’eau, après-midi doux' },
  { id: 'bocage-albion', name: 'Bocage d’Albion', transition: 500, color: '#8fbf6a',
    poly: [[-1000, -1200], [-1150, -1900], [-1250, -2700], [-2000, -2950], [-3000, -2600], [-3550, -1900], [-3550, -900], [-3050, -450], [-2300, -500], [-1700, -400], [-1250, -600]],
    ground: 'prés très verts pâturés, murets de pierre sèche, chemins creux', flora: 'haies sur talus, chênes, frênes, digitales, fougère aigle',
    hamlets: 'cottages de pierre à toits de chaume ou d’ardoise, jardins de roses, ponts à dos d’âne', fog: { color: '#cdd6de', density: 0.0007 },
    sounds: 'moutons, merles, pluie fine sur les feuilles', weather: 'averses brèves et arcs-en-ciel, ciel changeant' },
  { id: 'lande', name: 'Lande et falaises', transition: 400, color: '#b9a86a',
    poly: [[-1250, -2700], [-950, -3350], [-250, -3450], [-500, -3800], [-1700, -3700], [-2900, -3300], [-3500, -2800], [-3600, -2000], [-3000, -2600], [-2000, -2950]],
    ground: 'bruyère mauve, ajoncs jaunes, herbe rase, affleurements de craie', flora: 'peu d’arbres, aubépines couchées par le vent',
    hamlets: 'maisons de pêcheurs blanchies, phare, pierres levées', fog: { color: '#d6dee4', density: 0.0006 }, sounds: 'goélands, ressac, vent', weather: 'vent, ciel rapide' },
  { id: 'erables-lacs', name: 'Forêt des Érables et des Lacs', transition: 600, color: '#c28a52',
    poly: [[420, -850], [150, -560], [480, -300], [900, -450], [1400, -650], [2100, -850], [2800, -1050], [3300, -1700], [3400, -2200], [2900, -2900], [2200, -3450], [1200, -3700], [420, -3050], [520, -2300], [480, -1500]],
    ground: 'feuilles rouges et or, mousse sur granit, plages de galets aux lacs', flora: 'érables à sucre flamboyants, bouleaux blancs, pins blancs, sapins baumiers, nénuphars',
    hamlets: 'maisons de planches peintes (clapboard), granges rouges, cabanes à sucre, ponts couverts', fog: { color: '#d8d2c6', density: 0.0006 },
    sounds: 'huards sur les lacs, pics, feuilles qui crissent', weather: 'automne doré permanent, brume du matin sur les lacs' },
  { id: 'prairies-ranch', name: 'Grandes Plaines', transition: 600, color: '#d2c07a',
    poly: [[480, -300], [900, -450], [1400, -650], [2100, -850], [2800, -1050], [3500, -900], [3650, 200], [3650, 650], [2700, 550], [1950, 420], [1350, 480], [800, 280], [520, 120]],
    ground: 'herbe haute blonde, armoise, terre rouge des sentiers', flora: 'herbes de prairie, peupliers deltoïdes au bord de l’eau, buissons d’armoise, rares chênes',
    hamlets: 'ranchs de bois, corrals, éoliennes de pompage, granges', fog: { color: '#e2d6bc', density: 0.0004 }, sounds: 'vent, sauterelles, cloches de bétail lointaines', weather: 'ciel immense, grands cumulus, orages lointains au crépuscule' },
  { id: 'garrigue', name: 'Garrigue des Ocres', transition: 500, color: '#c8b27a',
    poly: [[380, 80], [800, 280], [1350, 480], [1950, 420], [2050, 750], [1750, 1050], [1500, 1400], [1050, 1550], [650, 1350], [450, 950], [330, 420]],
    ground: 'cailloux calcaires blancs, terre ocre, thym et romarin', flora: 'chênes verts, pins d’Alep, oliviers, cyprès en rangées, lavande, cistes',
    hamlets: 'mas de pierre aux volets bleus, murets, bories (cabanes de pierre sèche), fontaines', fog: { color: '#e8dcc4', density: 0.00035 },
    sounds: 'cigales, grillons, vent chaud', weather: 'soleil fort, air qui tremble' },
  { id: 'savane', name: 'Savane sèche', transition: 450, color: '#cfae63',
    poly: [[1050, 1550], [1500, 1400], [2000, 1850], [2500, 2200], [3100, 2550], [2750, 2400], [2150, 2050], [1550, 1800], [1000, 1650]],
    ground: 'herbe jaune, latérite rouge', flora: 'acacias en parasol, baobabs isolés, buissons épineux',
    hamlets: 'greniers de terre ronds, enclos', fog: { color: '#e6d4b0', density: 0.0004 }, sounds: 'oiseaux tisserands, vent sec', weather: 'chaud, brume de chaleur' },
  { id: 'dunes', name: 'Erg des Dunes', transition: 500, color: '#e9c98a',
    poly: [[1950, 420], [2700, 550], [3650, 650], [3700, 1300], [3600, 1900], [3300, 2400], [2950, 2350], [2500, 2200], [2000, 1850], [1500, 1400], [1750, 1050], [2050, 750]],
    ground: 'sable doré à rides, reg caillouteux entre les dunes, sel blanc du chott', flora: 'presque rien ; touffes d’herbe, tamaris, palmiers à l’oasis',
    hamlets: 'ksar de terre crue, tentes nomades, caravansérail', fog: { color: '#f0dcb8', density: 0.00025 }, sounds: 'vent qui chante sur les crêtes, grelots de dromadaires', weather: 'ciel blanc à midi, mirages sur le chott' },
  { id: 'foret-asiatique', name: 'Forêts du Levant', transition: 500, color: '#5f9a5a',
    poly: [[-2100, 2250], [-1500, 2000], [-1150, 1950], [-250, 2000], [420, 1950], [780, 1600], [1100, 1900], [850, 2250], [900, 2850], [750, 3350], [950, 3750], [-300, 3750], [-1300, 3700], [-1900, 3450], [-2250, 3000]],
    ground: 'mousse, aiguilles, fougères, pas japonais sur les sentiers', flora: 'cèdres sugi, cyprès hinoki, bambouseraies, érables momiji, pins rouges, camélias',
    hamlets: 'minka à toit de chaume, petits sanctuaires, jizō au bord des chemins', fog: { color: '#cfdde0', density: 0.0007 }, sounds: 'bambous qui craquent, cloche lointaine, ruisseaux', weather: 'brume des pentes, petite pluie tiède' },
  { id: 'rizieres', name: 'Plaine des Rizières', transition: 400, color: '#9ed08a',
    poly: [[-520, 400], [380, 420], [560, 900], [780, 1600], [420, 1950], [-250, 2000], [-1150, 1950], [-1350, 1650], [-1150, 1150], [-820, 640]],
    ground: 'eau miroir des rizières, diguettes herbeuses, chemins de terre surélevés', flora: 'riz vert tendre, lotus dans les mares, saules, bosquets de bambou sur les buttes',
    hamlets: 'minka sur buttes, séchoirs à riz, moulins à eau, épouvantails', fog: { color: '#d8e4e4', density: 0.0006 }, sounds: 'grenouilles, hérons, eau qui coule entre les diguettes', weather: 'brume basse à l’aube, reflets du ciel' },
  { id: 'volcan', name: 'Pentes du mont Fuji', transition: 450, color: '#8c8f7e', poly: circlePoly(305, 2899, 900),
    ground: 'cendre sombre, scories rouges, lave en dalles, neige au-dessus de 430 m', flora: 'pins rouges et mélèzes en bas, buissons nains au milieu, rien au-dessus de 420 m',
    hamlets: 'refuges de pèlerins en pierre, torii de bois brut', fog: { color: '#d6dce2', density: 0.0005 }, sounds: 'vent, clochettes des pèlerins', weather: 'nuage en chapeau sur le sommet le matin' },
  { id: 'jungle', name: 'Jungle de Jade', transition: 550, color: '#2f7a46',
    poly: [[850, 2250], [1100, 1950], [1550, 1850], [2150, 2050], [2750, 2400], [3100, 2550], [3350, 2850], [2900, 3200], [2200, 3500], [1500, 3700], [950, 3750], [750, 3350], [1000, 2850]],
    ground: 'humus noir, racines, mousse épaisse, rochers moussus, eau claire', flora: 'arbres géants à contreforts (60 m), figuiers étrangleurs, lianes et mousses pendantes, fougères arborescentes, bananiers, palmiers',
    hamlets: 'maisons sur pilotis en bambou, temples envahis de mousse', fog: { color: '#bfd6c4', density: 0.0012 }, sounds: 'oiseaux exotiques, gouttes, cascades, insectes', weather: 'brume permanente, averses chaudes, rayons dans la vapeur' },
  { id: 'piemont', name: 'Forêt des Mousses', transition: 500, color: '#4f7f4e',
    poly: [[-1750, -350], [-1250, -600], [-480, -380], [-420, 250], [-520, 400], [-820, 640], [-1150, 1150], [-1350, 1650], [-1700, 1500], [-2000, 1150], [-2050, 600], [-1900, 100]],
    ground: 'tapis de mousse (ref-13), aiguilles, blocs moussus, champignons', flora: 'épicéas et sapins élancés, hêtres en bas, myrtilles, fougères',
    hamlets: 'scieries, cabanes de bûcherons, chapelles de bois', fog: { color: '#c8d4d0', density: 0.0009 }, sounds: 'torrents, pics, vent dans les sapins', weather: 'rayons obliques à travers les troncs le matin' },
  { id: 'cote-ouest', name: 'Côte des Fjords', transition: 500, color: '#7d9a78',
    poly: [[-2300, -500], [-3050, -450], [-3550, -900], [-3800, 300], [-3700, 1250], [-3350, 1350], [-2950, 1300], [-2850, 800], [-2450, 300], [-2100, -100]],
    ground: 'lande de bruyère sur granite, tourbières, mousses', flora: 'pins sylvestres tordus, bouleaux nains, bruyère',
    hamlets: 'maisons de bois rouges de pêcheurs, séchoirs, bateaux', fog: { color: '#c4d0d8', density: 0.0008 }, sounds: 'mouettes, phoques, craquements du glacier', weather: 'ciel bas changeant, éclaircies' },
  { id: 'alpages', name: 'Alpages des Clarines', transition: 400, color: '#a6d27c',
    poly: [[-1100, 650], [-1600, 520], [-1950, 750], [-1950, 1150], [-1600, 1350], [-1150, 1200], [-1000, 950]],
    ground: 'prés fleuris (gentianes, arnica, pissenlits), pierres claires', flora: 'mélèzes isolés, arolles, épicéas en lisière',
    hamlets: 'chalets à balcons fleuris, greniers sur pilotis de pierre, fontaines-abreuvoirs', fog: { color: '#d6e2ec', density: 0.00045 }, sounds: 'clarines des vaches, torrent, marmottes', weather: 'grand beau, gros cumulus au-dessus des sommets' },
  { id: 'haute-montagne', name: 'Haute montagne du Givre', transition: 350, color: '#b8bcc4',
    poly: [[-1700, -200], [-2100, -50], [-2450, 250], [-2800, 650], [-2950, 1100], [-2700, 1450], [-2400, 1350], [-2350, 950], [-2150, 600], [-1900, 300], [-1650, 50]],
    ground: 'éboulis gris, roche, névés, glacier bleuté', flora: 'aucune au-dessus de 600 m ; coussins de fleurs alpines dans les creux',
    hamlets: 'refuge de pierre', fog: { color: '#dfe6ee', density: 0.0004 }, sounds: 'vent, chutes de pierres lointaines', weather: 'clair et froid, nuages qui accrochent les sommets' },
  { id: 'pinede-neige', name: 'Pinèdes enneigées', transition: 500, color: '#dfe8ee',
    poly: [[-1950, 1150], [-2350, 1050], [-2950, 1300], [-3350, 1350], [-3550, 1800], [-3200, 1950], [-2750, 1750], [-2250, 1700], [-2000, 2000], [-2150, 2450], [-2000, 2900], [-1700, 2700], [-1550, 2350], [-1350, 2100], [-1250, 1850], [-1600, 1350]],
    ground: 'neige poudreuse, herbes rousses qui dépassent (ref-12), traces d’animaux', flora: 'pins sylvestres à troncs orangés, épicéas chargés de neige, bouleaux',
    hamlets: 'cabanes de rondins, chapelle des neiges', fog: { color: '#e6e2dc', density: 0.0008 }, sounds: 'neige qui tombe des branches, corbeaux, silence', weather: 'lumière dorée rasante, neige légère par moments' },
  { id: 'toundra', name: 'Toundra de l’Aurore', transition: 450, color: '#c7ccc0',
    poly: [[-2750, 1750], [-2250, 1700], [-2000, 2000], [-2150, 2450], [-2400, 2600], [-2650, 2380], [-3050, 2480], [-3300, 2600], [-3500, 2250], [-3200, 1950]],
    ground: 'neige par plaques, lichens gris-vert, mousses rousses, mares gelées', flora: 'bouleaux nains, saules rampants, linaigrettes',
    hamlets: 'yourtes de bergers de rennes, cairns, observatoire', fog: { color: '#dde4ec', density: 0.0005 }, sounds: 'vent, rennes, craquement de la glace', weather: 'froid sec ; aurores la nuit (ref-15)' },
  { id: 'banquise', name: 'Banquise de la Baie Gelée', transition: 300, color: '#f2f6fa',
    poly: [[-2420, 2560], [-2380, 2900], [-2700, 3250], [-3500, 3200], [-3850, 2500], [-3500, 2250], [-3100, 2450], [-2700, 2370]],
    ground: 'glace de mer blanche et bleue, crêtes de pression, trous de phoques', flora: 'aucune', hamlets: 'station polaire, igloos', fog: { color: '#eaf0f6', density: 0.0006 },
    sounds: 'glace qui chante, phoques, vent', weather: 'ciel pâle, poudrerie' },
  { id: 'couronne', name: 'Forêts de la Couronne', transition: 300, color: '#3f7a4a', poly: circlePoly(0, 0, 520),
    ground: 'voir docs/BIBLE-CAPYVILLE.md §6', flora: 'cèdres, érables, pins, bambous (zones.ts FOREST_BELTS)', hamlets: 'Capyville', fog: { color: '#cbd8e2', density: 0.0011 },
    sounds: 'torrent, cloche du sanctuaire, vent dans les cèdres', weather: 'aube dorée et brume de vallée' },
];

/**
 * Transitions entre régions voisines : bandes successives (de la première région vers la seconde), chacune avec sa largeur.
 * Règle : jamais moins de 300 m ni plus de 800 m par bande ; tout change en même temps mais pas au même endroit
 * (relief, essences, sol, couleur, architecture, brume, sons) pour que la frontière ne se voie pas.
 */
export const TRANSITIONS: { id: string; from: RegionId; to: RegionId; bands: { biome: BiomeId; width: number; what: string }[] }[] = [
  { id: 'capyville-paris', from: 'hub', to: 'paris', bands: [
    { biome: 'couronne', width: 300, what: 'cèdres puis chênes ; le col de Paris ouvre la vue sur la vallée de la Seine' },
    { biome: 'bocage-seine', width: 700, what: 'Fontaine de la Seine, haies, pommiers ; premières maisons à colombages au Gué-aux-Saules' },
    { biome: 'bocage-seine', width: 600, what: 'champs de blé, peupliers, moulin à eau ; clochers pointus' },
    { biome: 'bocage-seine', width: 500, what: 'faubourgs de Paris : murs de pierre blonde, toits de zinc, potagers, guinguette au bord de l’eau' } ] },
  { id: 'capyville-newyork', from: 'hub', to: 'newyork', bands: [
    { biome: 'couronne', width: 300, what: 'érables japonais rouges qui annoncent les érables à sucre' },
    { biome: 'erables-lacs', width: 600, what: 'forêt mixte hêtres-érables, lac du Tanuki, ferme des Érables' },
    { biome: 'erables-lacs', width: 700, what: 'érables flamboyants, bouleaux, roches moutonnées ; Dôme du Guetteur' },
    { biome: 'erables-lacs', width: 400, what: 'banlieue de maisons de planches peintes, puis brique et premiers gratte-ciel' } ] },
  { id: 'capyville-desert', from: 'hub', to: 'desert', bands: [
    { biome: 'couronne', width: 300, what: 'pins noirs puis pins d’Alep, sol qui blanchit' },
    { biome: 'garrigue', width: 700, what: 'garrigue : chênes verts, thym, lavande, Bastide des Cigales, cigales' },
    { biome: 'garrigue', width: 600, what: 'badlands ocre, mesas, Citadelle des Ocres ; oliviers puis plus rien' },
    { biome: 'dunes', width: 500, what: 'reg caillouteux puis premières dunes, caravansérail, palmeraie de l’oasis' } ] },
  { id: 'capyville-japon', from: 'hub', to: 'japan', bands: [
    { biome: 'couronne', width: 300, what: 'col sud, cèdres ; le mont Fuji dans l’axe' },
    { biome: 'rizieres', width: 800, what: 'rizières miroir, hameau des Rizières, buttes à terrasses' },
    { biome: 'rizieres', width: 600, what: 'rizières puis vergers de kakis, bosquets de bambou, jizō' },
    { biome: 'foret-asiatique', width: 300, what: 'faubourg de machiya et d’entrepôts au bord du lac' } ] },
  { id: 'capyville-pole', from: 'hub', to: 'pole', bands: [
    { biome: 'couronne', width: 300, what: 'col du Pôle ; vue sur les Clarines et le Pic de l’Aurore' },
    { biome: 'piemont', width: 700, what: 'forêt des Mousses (épicéas, rayons), scierie, lacets' },
    { biome: 'alpages', width: 400, what: 'prés fleuris, chalets, village des Clarines, cascade' },
    { biome: 'pinede-neige', width: 700, what: 'pinèdes enneigées dorées, neige qui épaissit, Col des Aurores' },
    { biome: 'toundra', width: 600, what: 'toundra, rennes, Lac de l’Aurore gelé, aurores la nuit' },
    { biome: 'banquise', width: 300, what: 'station polaire, banquise de la Baie Gelée' } ] },
  { id: 'capyville-londres', from: 'hub', to: 'london', bands: [
    { biome: 'couronne', width: 300, what: 'cèdres puis chênes et houx' },
    { biome: 'piemont', width: 500, what: 'Seuil des Cèdres boisé, sources de la Tamise au loin' },
    { biome: 'bocage-albion', width: 700, what: 'murets, moutons, Hameau des Chaumes, Vieux Pont' },
    { biome: 'bocage-albion', width: 500, what: 'faubourgs de briques et de terrasses victoriennes, parcs' } ] },
  { id: 'paris-newyork', from: 'paris', to: 'newyork', bands: [
    { biome: 'bocage-seine', width: 600, what: 'champs ouverts, coteaux de vignes' },
    { biome: 'erables-lacs', width: 500, what: 'Monts Fauves : hêtres puis érables, Col des Fauves' },
    { biome: 'erables-lacs', width: 800, what: 'rive nord du Grand Lac, château de l’île, Port-aux-Huards' },
    { biome: 'erables-lacs', width: 500, what: 'pont couvert, Chutes du Huard, faubourg de New York' } ] },
  { id: 'newyork-desert', from: 'newyork', to: 'desert', bands: [
    { biome: 'erables-lacs', width: 400, what: 'derniers érables, la route monte sur le plateau' },
    { biome: 'prairies-ranch', width: 800, what: 'Grandes Plaines : herbe blonde, ranch, éoliennes' },
    { biome: 'prairies-ranch', width: 600, what: 'Canyon Rouge, viaduc, cheminées de fée' },
    { biome: 'dunes', width: 600, what: 'Rebord des Plaines, reg, dunes, chott blanc' } ] },
  { id: 'desert-japon', from: 'desert', to: 'japan', bands: [
    { biome: 'dunes', width: 400, what: 'dunes qui s’abaissent, palmiers isolés' },
    { biome: 'savane', width: 500, what: 'savane sèche, acacias, baobabs, montée au Col de Jade' },
    { biome: 'jungle', width: 800, what: 'basculement : brume, Chute des Mille Voiles, arbres géants, temple du Gardien' },
    { biome: 'jungle', width: 600, what: 'Ruisseau Clair, village sur pilotis' },
    { biome: 'foret-asiatique', width: 600, what: 'bambouseraie au pied nord du Fuji, puis rizières et ville' } ] },
  { id: 'japon-pole', from: 'japan', to: 'pole', bands: [
    { biome: 'rizieres', width: 300, what: 'rizières en terrasses qui montent' },
    { biome: 'foret-asiatique', width: 600, what: 'cèdres et cyprès, côte des Embruns, pins tordus' },
    { biome: 'pinede-neige', width: 500, what: 'première neige, Onsen des Neiges fumant' },
    { biome: 'toundra', width: 500, what: 'toundra côtière, rochers glacés' },
    { biome: 'banquise', width: 300, what: 'station polaire' } ] },
  { id: 'pole-londres', from: 'pole', to: 'london', bands: [
    { biome: 'toundra', width: 500, what: 'toundra, bouleaux nains' },
    { biome: 'pinede-neige', width: 500, what: 'pinèdes enneigées sur la côte' },
    { biome: 'cote-ouest', width: 800, what: 'fjord, front du glacier, Port-aux-Phoques, landes de bruyère' },
    { biome: 'cote-ouest', width: 700, what: 'landes et tourbières, tour de guet de l’estuaire' },
    { biome: 'bocage-albion', width: 500, what: 'murets, moutons, docks de Londres' } ] },
  { id: 'londres-paris', from: 'london', to: 'paris', bands: [
    { biome: 'bocage-albion', width: 600, what: 'haies sur talus, manoir aux roses, labyrinthe de haies' },
    { biome: 'bocage-albion', width: 500, what: 'Seuil du Grand Arbre, vue sur la lande et le phare' },
    { biome: 'bocage-seine', width: 700, what: 'abbaye en ruine, champs de blé, colombages' },
    { biome: 'bocage-seine', width: 400, what: 'faubourgs de Paris rive gauche' } ] },
];

// =================================================================================================== EAU
export interface River {
  id: string;
  name: string;
  /** amont → aval */
  pts: XZ[];
  /** altitude de la surface de l'eau à chaque point */
  y: number[];
  /** largeur mouillée à chaque point (m) */
  w: number[];
  /** lit à sec la plupart du temps (oued) */
  dry?: boolean;
  /** surface gelée */
  frozen?: boolean;
  /** rivière dans laquelle elle se jette (ou 'mer', 'lac:<id>') */
  into: string;
  note: string;
}

export const RIVERS: River[] = [
  { id: 'seine', name: 'La Seine', into: 'mer', note: 'naît à la Fontaine de la Seine (résurgence au pied du Pic du Corbeau), rivière calme à méandres, peupliers ; traverse Paris',
    pts: [[-250, -620], [-330, -800], [-470, -1000], [-380, -1250], [-520, -1550], [-300, -1850], [-480, -2150], [-250, -2450], [-150, -2650], [-350, -2900], [-700, -3100], [-950, -3300], [-1100, -3420], [-1160, -3490]],
    y: [14, 12.5, 11.5, 10.5, 9.5, 8.5, 7.5, 6.5, 6, 5, 3.5, 2, 0.8, 0],
    w: [3, 6, 10, 14, 18, 22, 26, 30, 34, 38, 44, 52, 62, 80] },
  { id: 'tamise', name: 'La Tamise', into: 'mer', note: 'torrent au pied de la Brèche du Loup, puis rivière de bocage ; larges boucles à Londres, estuaire à vasières',
    pts: [[-1600, -200], [-1650, -430], [-1660, -460], [-1750, -650], [-1900, -850], [-2100, -1100], [-2400, -1350], [-2700, -1380], [-2900, -1420]],
    y: [150, 122, 100, 60, 30, 16, 7, 3, 0],
    w: [3, 4, 5, 8, 14, 22, 36, 48, 70] },
  { id: 'ruisseau-arbre', name: 'Ruisseau du Grand Arbre', into: 'tamise', note: 'naît au pied du Grand Arbre, gué de pierres',
    pts: [[-1350, -1450], [-1650, -1300], [-1900, -1150], [-2050, -1100]], y: [95, 50, 25, 17], w: [1.5, 2.5, 3.5, 4] },
  { id: 'yuzawa-amont', name: 'Haute Yuzawa', into: 'yuzawa', note: 'torrent qui sort du Lac du Tanuki et entre dans la gorge de Capyville (STREAM de zones.ts commence à (160, -330))',
    pts: [[430, -640], [360, -570], [355, -560], [300, -500], [220, -400], [160, -330]], y: [120, 115, 95, 80, 60, 46], w: [3, 3.5, 3.5, 4, 4, 4] },
  { id: 'erables', name: 'Rivière des Érables', into: 'mer', note: 'déversoir du Grand Lac ; rapides, Chutes du Huard en fer à cheval, se jette dans la baie de New York',
    pts: [[1650, -1750], [1900, -1680], [2140, -1740], [2160, -1745], [2400, -1700], [2660, -1580]], y: [45, 38, 30, 18, 8, 0], w: [18, 22, 30, 30, 40, 55] },
  { id: 'ruisseau-fauves', name: 'Ruisseau des Fauves', into: 'lac:grand-lac', note: 'descend du Mont Fauve par une suite de petites chutes',
    pts: [[780, -1500], [900, -1650], [1000, -1780], [1060, -1850]], y: [150, 90, 55, 45], w: [2, 3, 4, 5] },
  { id: 'rouge', name: 'Rivière Rouge', into: 'mer', note: 'naît au flanc est du Dormeur, creuse le Canyon Rouge (60 à 90 m) dans le plateau, chute Rouge',
    pts: [[1650, -150], [2000, -450], [2340, -300], [2360, -295], [2650, -150], [2950, 100], [3300, 250], [3640, 330]], y: [150, 120, 100, 92, 75, 50, 25, 0], w: [3, 6, 9, 9, 12, 15, 18, 25] },
  { id: 'oued', name: 'Oued des Ocres', into: 'lac:oasis', dry: true, note: 'lit de galets blancs à sec, lauriers-roses ; se remplit après les rares orages',
    pts: [[900, 400], [1300, 900], [1700, 1150], [2050, 1250], [2280, 1330]], y: [80, 60, 48, 41, 36], w: [6, 10, 14, 16, 18] },
  { id: 'jade', name: 'Rivière de Jade', into: 'mer', note: 'naît sur le Plateau de Jade, tombe par la Chute des Mille Voiles, coule en eau turquoise entre rochers moussus jusqu’à la mangrove',
    pts: [[1550, 1850], [1600, 2100], [1615, 2215], [1620, 2245], [1500, 2500], [1400, 2640], [1405, 2655], [1350, 2800], [1300, 2980], [1250, 3150], [1150, 3450], [1100, 3700]],
    y: [300, 235, 232, 150, 120, 105, 95, 80, 62, 35, 10, 0], w: [5, 10, 40, 30, 22, 20, 20, 24, 28, 32, 40, 60] },
  { id: 'ruisseau-clair', name: 'Ruisseau Clair', into: 'jade', note: 'ruisseau d’eau limpide sur rochers moussus (ref-18), petites cascades',
    pts: [[880, 2650], [995, 2795], [1000, 2810], [1150, 2900], [1300, 2980]], y: [130, 110, 100, 78, 62], w: [3, 4, 4, 5, 6] },
  { id: 'kawa', name: 'Rivière des Rizières', into: 'lac:lac-torii', note: 'descend des Crêtes Blanches, puis coule lentement entre les diguettes jusqu’au Lac du Torii',
    pts: [[-1250, 1750], [-1000, 1600], [-750, 1500], [-500, 1650], [-450, 2000], [-420, 2260]], y: [200, 60, 12, 8, 6.5, 5], w: [3, 6, 12, 16, 18, 20] },
  { id: 'lucioles', name: 'Ruisseau des Lucioles', into: 'kawa', note: 'naît au pied sud de la Crête des Lucioles ; lucioles la nuit',
    pts: [[150, 500], [50, 900], [-200, 1300], [-450, 1700], [-480, 1800]], y: [9, 8, 7, 6.8, 6.6], w: [2, 3, 4, 5, 6] },
  { id: 'torii-aval', name: 'Exutoire du Lac du Torii', into: 'mer', note: 'traverse le port de la ville du Japon',
    pts: [[-300, 2580], [-150, 3000], [-250, 3350], [-300, 3640]], y: [4.6, 3, 1.5, 0], w: [22, 26, 30, 40] },
  { id: 'clarines', name: 'Torrent des Clarines', into: 'kawa', note: 'sort du Lac de Cristal, tombe par la cascade des Clarines, traverse le village, puis la forêt des Mousses',
    pts: [[-1720, 860], [-1660, 870], [-1640, 880], [-1450, 900], [-1200, 900], [-950, 800], [-750, 650], [-620, 850], [-640, 1200], [-720, 1490]],
    y: [262, 255, 205, 165, 120, 70, 35, 22, 15, 12], w: [4, 5, 5, 6, 7, 8, 9, 10, 11, 12] },
  { id: 'aurores', name: 'Ruisseau des Aurores', into: 'lac:lac-aurore', frozen: true, note: 'eau de fonte du col, gelée en surface',
    pts: [[-2350, 1480], [-2300, 1700], [-2330, 1830]], y: [325, 140, 46], w: [2, 3, 4] },
  { id: 'gelee', name: 'Rivière Gelée', into: 'mer', frozen: true, note: 'déversoir du Lac de l’Aurore, cascade gelée, se perd sous la banquise',
    pts: [[-2380, 1990], [-2480, 2100], [-2560, 2205], [-2565, 2215], [-2620, 2300], [-2650, 2380]], y: [45, 38, 34, 14, 8, 0], w: [8, 10, 12, 12, 14, 20] },
  { id: 'glacier-emissaire', name: 'Émissaire du glacier', into: 'mer', note: 'eau laiteuse sous le front du glacier, pont de la Moraine',
    pts: [[-3020, 640], [-3120, 660], [-3180, 650]], y: [12, 5, 0], w: [10, 14, 20] },
  { id: 'ruisseau-cap', name: 'Ruisseau du Cap', into: 'mer', note: 'traverse la lande et tombe des falaises par la cascade du Cap',
    pts: [[-2200, -2700], [-2350, -3000], [-2450, -3260], [-2455, -3290]], y: [70, 60, 55, 0], w: [2, 3, 4, 4] },
];

export const LAKES: { id: string; name: string; x: number; z: number; rx: number; rz: number; rot: number; y: number; frozen?: boolean; dry?: boolean; note: string }[] = [
  { id: 'grand-lac', name: 'Grand Lac', x: 1300, z: -1900, rx: 480, rz: 260, rot: 20, y: 45, note: 'le plus grand lac ; île au château en ruine, plages de galets, huards, canoës' },
  { id: 'lac-torii', name: 'Lac du Torii', x: -400, z: 2420, rx: 260, rz: 170, rot: -10, y: 5, note: 'torii vermillon dans l’eau à (-560, 2390), reflet du mont Fuji vu de la rive ouest' },
  { id: 'lac-cristal', name: 'Lac de Cristal', x: -1760, z: 820, rx: 120, rz: 80, rot: 30, y: 262, note: 'lac alpin turquoise au-dessus du verrou des Clarines (ref-6, ref-7 pour l’eau)' },
  { id: 'lac-aurore', name: 'Lac de l’Aurore', x: -2350, z: 1930, rx: 220, rz: 140, rot: 15, y: 45, frozen: true, note: 'lac gelé, aurores la nuit (ref-15), patinage' },
  { id: 'lac-tanuki', name: 'Lac du Tanuki', x: 450, z: -660, rx: 70, rz: 55, rot: 0, y: 120, note: 'petit lac de montagne, source de la Yuzawa ; cabane du gardien' },
  { id: 'lac-huard', name: 'Lac du Huard', x: 1750, z: -2500, rx: 160, rz: 110, rot: 40, y: 70, note: 'barrage de castors, cabane, nénuphars' },
  { id: 'lac-miroir', name: 'Lac Miroir', x: 950, z: -2750, rx: 110, rz: 80, rot: -20, y: 85, note: 'lac rond très calme où se reflète le Mont Fauve' },
  { id: 'oasis', name: 'Bassin de l’oasis', x: 2330, z: 1320, rx: 38, rz: 30, rot: 0, y: 35, note: 'eau de source turquoise sous les palmiers' },
  { id: 'chott', name: 'Chott Blanc', x: 2850, z: 1550, rx: 350, rz: 200, rot: 10, y: 30, dry: true, note: 'lac de sel sec, croûte blanche en polygones, mirages' },
];

export const WATERFALLS: { id: string; name: string; x: number; z: number; top: number; bottom: number; width: number; frozen?: boolean; behind?: string; note: string }[] = [
  { id: 'mille-voiles', name: 'Chute des Mille Voiles', x: 1615, z: 2225, top: 232, bottom: 150, width: 40, behind: 'grotte-voiles',
    note: 'cascade géante (82 m) en rideaux sur une falaise moussue ; colonne de brume de 150 m visible à 3 km ; grotte derrière le rideau' },
  { id: 'chutes-huard', name: 'Chutes du Huard', x: 2150, z: -1742, top: 30, bottom: 18, width: 30, note: 'chute en fer à cheval, vue depuis le pont couvert' },
  { id: 'clarines', name: 'Cascade des Clarines', x: -1650, z: 875, top: 255, bottom: 205, width: 5, note: 'ruban blanc de 50 m qui tombe du verrou, visible depuis la fontaine du village' },
  { id: 'cap', name: 'Cascade du Cap', x: -2452, z: -3275, top: 55, bottom: 0, width: 4, note: 'tombe des falaises blanches sur la plage de galets ; arc-en-ciel l’après-midi' },
  { id: 'voile-fjord', name: 'Voile du Fjord', x: -3420, z: 760, top: 110, bottom: 0, width: 6, note: 'chute fine qui se disperse en brume le long de la paroi du fjord' },
  { id: 'chute-rouge', name: 'Chute Rouge', x: 2350, z: -298, top: 100, bottom: 92, width: 9, note: 'au fond du canyon, vasque où l’on peut nager' },
  { id: 'tamise', name: 'Cascade de la Tamise', x: -1655, z: -445, top: 122, bottom: 100, width: 4, note: 'dans la forêt des Mousses, grotte des sources derrière' },
  { id: 'tanuki', name: 'Cascade du Tanuki', x: 358, z: -565, top: 115, bottom: 95, width: 3.5, note: 'sortie du lac, rochers moussus' },
  { id: 'escalier-jade', name: 'Escalier de Jade', x: 1402, z: 2648, top: 105, bottom: 95, width: 20, note: 'cascades en marches et vasques turquoise (ref-17)' },
  { id: 'ruisseau-clair', name: 'Cascatelle du Ruisseau Clair', x: 997, z: 2802, top: 110, bottom: 100, width: 4, note: 'petite chute entre rochers moussus (ref-18)' },
  { id: 'gelee', name: 'Cascade Gelée', x: -2562, z: 2210, top: 34, bottom: 14, width: 12, frozen: true, note: 'cascade figée en orgues de glace bleue ; on passe derrière' },
];

/** Glaciers et névés. */
export const GLACIERS: { id: string; name: string; poly: XZ[]; note: string }[] = [
  { id: 'glacier-aurore', name: 'Glacier de l’Aurore', poly: [[-2350, 400], [-2600, 330], [-2850, 420], [-3050, 540], [-3180, 620], [-3120, 690], [-2900, 640], [-2650, 600], [-2400, 540]],
    note: 'langue de glace crevassée du Pic de l’Aurore jusqu’au fond du fjord ; front de 40 m qui vêle des icebergs' },
  { id: 'neve-neiges', name: 'Névé du Mont des Neiges', poly: [[-2450, 700], [-2650, 720], [-2700, 900], [-2500, 950], [-2380, 820]], note: 'grand névé qui alimente le Lac de Cristal' },
];

export type CrossingKind = 'pont-pierre' | 'pont-bois' | 'pont-couvert' | 'pont-fer' | 'viaduc' | 'passerelle' | 'pont-lianes' | 'pont-suspendu' | 'gue' | 'radier' | 'bac';
/** Ponts et gués (les ponts de Capyville sont dans zones.ts BRIDGES). */
export const CROSSINGS: { id: string; name: string; kind: CrossingKind; x: number; z: number; river: string; way?: string; length: number; note: string }[] = [
  { id: 'pont-saules', name: 'Pont du Gué-aux-Saules', kind: 'pont-pierre', x: -512, z: -1536, river: 'seine', way: 'chemin-saules', length: 22, note: 'deux arches, lavoir à côté' },
  { id: 'gue-seine', name: 'Gué de la Fontaine', kind: 'gue', x: -320, z: -790, river: 'seine', way: 'sentier-fontaine', length: 7, note: 'pierres plates, la Seine n’a que 6 m de large' },
  { id: 'moulin-seine', name: 'Passerelle du Moulin', kind: 'passerelle', x: -300, z: -1850, river: 'seine', length: 24, note: 'sur le bief du moulin' },
  { id: 'vieux-pont', name: 'Vieux Pont', kind: 'pont-pierre', x: -1885, z: -870, river: 'tamise', way: 'route-londres', length: 26, note: 'pont-route de pierre à trois arches' },
  { id: 'pont-dos-ane', name: 'Pont à dos d’âne', kind: 'pont-pierre', x: -1760, z: -680, river: 'tamise', way: 'chemin-chaumes', length: 10, note: 'pont de muletier très bombé' },
  { id: 'gue-arbre', name: 'Gué du Grand Arbre', kind: 'gue', x: -1650, z: -1300, river: 'ruisseau-arbre', way: 'chemin-arbre', length: 4, note: 'pierres de gué' },
  { id: 'pont-couvert', name: 'Pont couvert des Érables', kind: 'pont-couvert', x: 1960, z: -1690, river: 'erables', way: 'route-paris-ny', length: 34, note: 'pont de bois couvert peint en rouge ; vue sur les Chutes du Huard' },
  { id: 'passerelle-lac', name: 'Ponton du Château', kind: 'bac', x: 1050, z: -1970, river: 'grand-lac', length: 250, note: 'barque à louer de Port-aux-Huards à l’île' },
  { id: 'viaduc', name: 'Viaduc du Canyon Rouge', kind: 'viaduc', x: 2520, z: -230, river: 'rouge', way: 'piste-ranchs', length: 160, note: 'viaduc de bois et d’acier à chevalets, 85 m au-dessus de la rivière ; repère du plateau' },
  { id: 'gue-canyon', name: 'Gué du Canyon', kind: 'gue', x: 3045, z: 141, river: 'rouge', way: 'sentier-canyon', length: 15, note: 'au fond du canyon, galets rouges' },
  { id: 'passerelle-canyon', name: 'Passerelle de cordes', kind: 'pont-suspendu', x: 2280, z: -327, river: 'rouge', way: 'sentier-canyon', length: 60, note: 'passerelle suspendue au-dessus des gradins' },
  { id: 'radier-oued', name: 'Radier de l’oued', kind: 'radier', x: 1031, z: 564, river: 'oued', way: 'piste-desert', length: 14, note: 'dalle de béton dans le lit à sec' },
  { id: 'radier-citadelle', name: 'Radier de la Citadelle', kind: 'radier', x: 1290, z: 890, river: 'oued', way: 'piste-desert', length: 16, note: 'second passage de l’oued, au pied de la mesa' },
  { id: 'pont-lucioles', name: 'Pont des Lucioles', kind: 'pont-bois', x: -135, z: 1140, river: 'lucioles', way: 'route-japon', length: 12, note: 'pont de bois sur pieux, lanternes de pierre' },
  { id: 'pont-kawa', name: 'Pont du Kawa', kind: 'pont-bois', x: -480, z: 1700, river: 'kawa', way: 'route-japon', length: 22, note: 'pont-route de bois aux garde-corps vermillon' },
  { id: 'gue-kawa', name: 'Gué des Hérons', kind: 'gue', x: -880, z: 1550, river: 'kawa', way: 'chemin-rizieres', length: 10, note: 'pas japonais' },
  { id: 'pont-lianes', name: 'Pont de lianes', kind: 'pont-lianes', x: 1360, z: 2760, river: 'jade', way: 'sentier-jungle', length: 40, note: 'pont de lianes et de bambou, au-dessus des vasques' },
  { id: 'passerelles-pilotis', name: 'Passerelles du village', kind: 'passerelle', x: 1250, z: 3150, river: 'jade', way: 'sentier-jungle', length: 45, note: 'passerelles de bambou entre les maisons' },
  { id: 'gue-clair', name: 'Gué du Ruisseau Clair', kind: 'gue', x: 1150, z: 2900, river: 'ruisseau-clair', way: 'sentier-jungle', length: 6, note: 'rochers moussus' },
  { id: 'pont-clarines', name: 'Pont de la Fontaine', kind: 'pont-bois', x: -1450, z: 900, river: 'clarines', way: 'route-pole', length: 10, note: 'pont de bois couvert du village' },
  { id: 'pont-scierie', name: 'Pont de la Scierie', kind: 'pont-bois', x: -760, z: 660, river: 'clarines', way: 'route-pole', length: 14, note: 'à côté de la scierie à roue' },
  { id: 'pont-moraine', name: 'Pont de la Moraine', kind: 'pont-bois', x: -3120, z: 660, river: 'glacier-emissaire', way: 'route-fjords', length: 30, note: 'pont de bois sur l’émissaire laiteux, face au glacier' },
  { id: 'pont-gelee', name: 'Pont de glace', kind: 'gue', x: -2480, z: 2100, river: 'gelee', way: 'route-pole', length: 12, note: 'la rivière gelée se traverse à pied' },
  { id: 'deversoir-lac', name: 'Passerelle du Déversoir', kind: 'passerelle', x: 1650, z: -1750, river: 'erables', way: 'chemin-lac', length: 20, note: 'sur le seuil où le Grand Lac s’écoule' },
  { id: 'gue-fauves', name: 'Gué des Fauves', kind: 'gue', x: 960, z: -1726, river: 'ruisseau-fauves', way: 'chemin-lac', length: 5, note: 'pierres plates sous les érables' },
  { id: 'passerelle-fauves', name: 'Passerelle des Fauves', kind: 'passerelle', x: 1045, z: -1830, river: 'ruisseau-fauves', way: 'chemin-erables', length: 8, note: 'planches à l’embouchure dans le lac' },
  { id: 'gue-clarines', name: 'Gué des Clarines', kind: 'gue', x: -717, z: 1479, river: 'clarines', way: 'chemin-rizieres', length: 12, note: 'confluence avec le Kawa, pas japonais' },
  { id: 'passerelle-cristal', name: 'Planches du Lac de Cristal', kind: 'passerelle', x: -1720, z: 860, river: 'clarines', way: 'sentier-aurore', length: 6, note: 'sur l’exutoire, juste avant la chute' },
  { id: 'gue-sources', name: 'Gué des Sources', kind: 'gue', x: -1600, z: -200, river: 'tamise', way: 'sentier-breche', length: 3, note: 'la Tamise naissante se franchit d’un pas' },
  { id: 'gue-cap', name: 'Gué du Cap', kind: 'gue', x: -2452, z: -3270, river: 'ruisseau-cap', way: 'sentier-douaniers', length: 4, note: 'pierres' },
];

// =================================================================================================== VOIES
export type WayKind = 'route' | 'chemin' | 'piste' | 'sentier' | 'sentier-betes' | 'raccourci';
export type WaySurface = 'asphalte' | 'gravier' | 'terre' | 'sable' | 'neige' | 'pierre' | 'planches';

export interface Way {
  id: string;
  name: string;
  kind: WayKind;
  surface: WaySurface;
  width: number;
  /** départ → arrivée ; pour les six routes de Capyville, le premier point est la fin de COL_ROUTES (valley.ts) */
  pts: XZ[];
  vehicles: boolean;
  note: string;
}

/**
 * Réseau de déplacement. L'asphalte ne relie que les grandes villes (et Capyville, carrefour historique, vers Paris,
 * New York, Londres et le Japon). Les autres liaisons sont en gravier, terre ou sable.
 * Les tracés suivent les vallées et les courbes de niveau ; aucune ligne droite de plus de 400 m sans raison
 * (digue des rizières, plateau des Plaines).
 */
export const WAYS: Way[] = [
  // --- routes asphaltées (8-9 m, ligne axiale discontinue, bas-côtés, pas d'éclairage hors villes)
  { id: 'route-paris', name: 'Route de la Seine', kind: 'route', surface: 'asphalte', width: 8, vehicles: true,
    pts: [[-45, -505], [-160, -720], [-170, -980], [-290, -1180], [-230, -1420], [-120, -1650], [-160, -1900], [-140, -2140]], note: 'suit la rive droite de la Seine, alignements de platanes à l’approche de Paris' },
  { id: 'route-ny', name: 'Route des Érables', kind: 'route', surface: 'asphalte', width: 8, vehicles: true,
    pts: [[500, -200], [760, -430], [1050, -600], [1350, -720], [1550, -800], [1800, -900], [1980, -1080]], note: 'passe au pied sud du Dôme du Guetteur, longe des lacs' },
  { id: 'route-londres', name: 'Route de la Tamise', kind: 'route', surface: 'asphalte', width: 8, vehicles: true,
    pts: [[-472, -215], [-700, -420], [-980, -560], [-1250, -680], [-1550, -820], [-1885, -870], [-1980, -1080]], note: 'franchit le Seuil des Cèdres puis le Vieux Pont' },
  { id: 'route-japon', name: 'Route des Rizières', kind: 'route', surface: 'asphalte', width: 7, vehicles: true,
    pts: [[0, 460], [-80, 750], [-60, 1050], [-300, 1350], [-470, 1580], [-600, 1800], [-690, 1970]], note: 'sur une digue au-dessus des rizières miroir ; vue de conduite à l’aube (ref-5)' },
  { id: 'route-paris-londres', name: 'Route du Grand Arbre', kind: 'route', surface: 'asphalte', width: 8, vehicles: true,
    pts: [[-670, -2600], [-950, -2450], [-1250, -2200], [-1550, -1930], [-1800, -1720], [-1950, -1610]], note: 'haies sur talus, passe le Seuil du Grand Arbre' },
  { id: 'route-paris-ny', name: 'Route des Lacs', kind: 'route', surface: 'asphalte', width: 8, vehicles: true,
    pts: [[370, -2650], [560, -2520], [700, -2300], [1000, -2280], [1300, -2230], [1650, -2120], [1850, -1900], [1960, -1690], [1845, -1692]], note: 'Col des Fauves, rive nord du Grand Lac, pont couvert' },
  // --- routes de gravier et pistes
  { id: 'route-pole', name: 'Route du Givre', kind: 'chemin', surface: 'gravier', width: 6, vehicles: true,
    pts: [[-400, 225], [-600, 330], [-800, 520], [-1000, 650], [-1150, 760], [-1250, 700], [-1350, 820], [-1450, 900], [-1650, 1000], [-1800, 1150], [-1700, 1250], [-1950, 1300], [-1850, 1400], [-2150, 1420], [-2350, 1450], [-2450, 1650], [-2400, 1820], [-2480, 2100], [-2600, 2080], [-2650, 2150]],
    note: 'route de montagne gravillonnée à lacets jusqu’aux Clarines (glissières de bois), puis route enneigée balisée de perches jusqu’au Pôle (motoneige conseillée)' },
  { id: 'piste-desert', name: 'Piste des Ocres', kind: 'piste', surface: 'gravier', width: 6, vehicles: true,
    pts: [[400, 200], [650, 330], [900, 480], [1150, 640], [1290, 890], [1550, 900], [1750, 880], [1900, 950], [2100, 1150], [2140, 1200]], note: 'gravier blanc puis piste de sable balisée de cairns ; contourne la Citadelle par le sud' },
  { id: 'piste-ranchs', name: 'Piste des Ranchs', kind: 'piste', surface: 'terre', width: 6, vehicles: true,
    pts: [[2350, -890], [2300, -650], [2350, -420], [2520, -230], [2550, 100], [2420, 500], [2380, 850], [2320, 1130]], note: 'terre rouge, viaduc du Canyon Rouge, descente du Rebord en lacets' },
  { id: 'route-embruns', name: 'Route des Embruns', kind: 'chemin', surface: 'gravier', width: 6, vehicles: true,
    pts: [[-1230, 2380], [-1500, 2450], [-1700, 2420], [-1950, 2350], [-2200, 2250], [-2430, 2180]], note: 'corniche côtière, pins tordus puis neige' },
  { id: 'route-fjords', name: 'Route des Fjords', kind: 'chemin', surface: 'gravier', width: 6, vehicles: true,
    pts: [[-2800, 2000], [-3050, 1750], [-3250, 1400], [-3300, 1050], [-3050, 800], [-3120, 660], [-3300, 480], [-3480, 440], [-3550, 100], [-3450, -300], [-3200, -650], [-2950, -880], [-2750, -1000]], note: 'contourne le fond du fjord par le Pont de la Moraine, landes jusqu’à Londres' },
  { id: 'route-bambou', name: 'Route du Bambou', kind: 'chemin', surface: 'terre', width: 5, vehicles: true,
    pts: [[-420, 2200], [-100, 2080], [300, 2000], [700, 2080], [950, 2250]], note: 'pied nord du Fuji, tunnels de bambou ; s’arrête à la lisière de la jungle (parking des pirogues)' },
  { id: 'piste-jade', name: 'Piste du Col de Jade', kind: 'piste', surface: 'sable', width: 5, vehicles: true,
    pts: [[2150, 1500], [2000, 1650], [1900, 1780], [1850, 1880]], note: 'sable puis latérite, s’arrête au col (la jungle se traverse à pied ou en pirogue)' },
  // --- chemins de terre (2,5-4 m)
  { id: 'chemin-saules', name: 'Chemin des Saules', kind: 'chemin', surface: 'terre', width: 3.5, vehicles: true, pts: [[-230, -1420], [-400, -1480], [-560, -1560], [-700, -1500]], note: 'traverse la Seine au Gué-aux-Saules' },
  { id: 'chemin-arbre', name: 'Chemin du Grand Arbre', kind: 'chemin', surface: 'terre', width: 3, vehicles: true, pts: [[-1250, -680], [-1400, -950], [-1650, -1300], [-1450, -1480], [-1300, -1550], [-1550, -1930]], note: 'chemin creux entre deux haies jusqu’à la butte' },
  { id: 'chemin-chaumes', name: 'Chemin des Chaumes', kind: 'chemin', surface: 'terre', width: 3, vehicles: true, pts: [[-1550, -820], [-1760, -680], [-1750, -1150]], note: 'pont à dos d’âne, hameau' },
  { id: 'route-phare', name: 'Route du Phare', kind: 'chemin', surface: 'gravier', width: 4, vehicles: true, pts: [[-950, -2450], [-1250, -2800], [-1450, -3150], [-1550, -3330], [-1700, -3520]], note: 'traverse la lande, le phare grandit à chaque virage' },
  { id: 'chemin-lac', name: 'Tour du Grand Lac', kind: 'chemin', surface: 'terre', width: 3, vehicles: true, pts: [[1000, -2280], [860, -2050], [900, -1750], [1200, -1630], [1650, -1750], [1750, -1950], [1650, -2120]], note: 'boucle en rive, plages de galets, Port-aux-Huards' },
  { id: 'chemin-erables', name: 'Chemin de la Cabane à sucre', kind: 'chemin', surface: 'terre', width: 3, vehicles: true, pts: [[760, -430], [900, -800], [1050, -1050], [1000, -1500], [1060, -1850]], note: 'ferme des Érables, ruisseau des Fauves' },
  { id: 'chemin-dormeur', name: 'Chemin du Dormeur', kind: 'chemin', surface: 'terre', width: 3, vehicles: true, pts: [[1050, -600], [1150, -350], [1300, -280], [1600, -300], [1850, -560], [2100, -520], [2300, -650]], note: 'monte sur la tête du Dormeur puis rejoint le ranch' },
  { id: 'chemin-bastide', name: 'Chemin de la Bastide', kind: 'chemin', surface: 'gravier', width: 3, vehicles: true, pts: [[650, 330], [760, 620], [1050, 1100], [1150, 1150]], note: 'champs de lavande, Mesa Rouge' },
  { id: 'chemin-rizieres', name: 'Chemin des Rizières', kind: 'chemin', surface: 'terre', width: 2.5, vehicles: false, pts: [[-80, 750], [-300, 1250], [-650, 1450], [-880, 1550], [-1100, 1850]], note: 'sur les diguettes, jusqu’aux terrasses du Ciel' },
  { id: 'chemin-citadelle', name: 'Rampe de la Citadelle', kind: 'chemin', surface: 'pierre', width: 3, vehicles: false, pts: [[1150, 640], [1260, 720], [1330, 800], [1400, 760]], note: 'ancienne rampe dallée au sud-ouest de la mesa' },
  // --- sentiers (1,2-2 m)
  { id: 'sept-sommets', name: 'Sentier des Sept Sommets', kind: 'sentier', surface: 'terre', width: 1.6, vehicles: false,
    pts: [[93, -348], [248, -275], [335, 10], [160, 270], [-160, 270], [-335, 10], [-175, -300], [93, -348]], note: 'boucle de crête autour de Capyville (≈ 2,6 km en suivant les crêtes), belvédères sur chaque région' },
  { id: 'sentier-pelerin', name: 'Chemin du Pèlerin', kind: 'sentier', surface: 'terre', width: 1.6, vehicles: false,
    pts: [[300, 2000], [330, 2250], [420, 2400], [280, 2500], [430, 2600], [300, 2680], [400, 2760], [310, 2830], [305, 2899]], note: 'lacets réguliers jusqu’au cratère, dix stations à torii, refuge à mi-pente' },
  { id: 'sentier-aurore', name: 'Sentier des Crêtes', kind: 'sentier', surface: 'pierre', width: 1.4, vehicles: false,
    pts: [[-1650, 1000], [-1800, 700], [-1950, 550], [-2150, 350], [-2300, 450]], note: 'arête est du Pic de l’Aurore, refuge à 600 m, câbles dans le dernier ressaut' },
  { id: 'sentier-breche', name: 'Sentier de la Brèche', kind: 'sentier', surface: 'pierre', width: 1.4, vehicles: false,
    pts: [[-1600, -200], [-1750, -100], [-1900, 30], [-2200, 100], [-2700, 250], [-3050, 400], [-3300, 480]], note: 'des sources de la Tamise au fjord par la Brèche du Loup' },
  { id: 'sentier-douaniers', name: 'Sentier des Douaniers', kind: 'sentier', surface: 'terre', width: 1.2, vehicles: false,
    pts: [[-1160, -3480], [-1400, -3560], [-1700, -3560], [-2000, -3420], [-2350, -3300], [-2900, -3170], [-3300, -2980]], note: 'au bord des falaises, phare, cascade du Cap, épave' },
  { id: 'sentier-canyon', name: 'Sentier du Canyon', kind: 'sentier', surface: 'terre', width: 1.4, vehicles: false,
    pts: [[2100, -520], [2100, -470], [2300, -310], [2600, -170], [2900, 90], [3000, 200], [3150, 0]], note: 'descend par les vires, gué, grotte peinte, remonte aux cheminées de fée' },
  { id: 'sentier-jungle', name: 'Sentier de la Jungle', kind: 'sentier', surface: 'terre', width: 1.4, vehicles: false,
    pts: [[1850, 1880], [1720, 2150], [1660, 2300], [1600, 2480], [1480, 2620], [1450, 2720], [1360, 2760], [1150, 2900], [1250, 3150], [1050, 2600], [950, 2250]], note: 'col → haut des Mille Voiles → arbres géants → pont de lianes → village sur pilotis ; retour par le temple' },
  { id: 'sentier-cretes-blanches', name: 'Sentier des Crêtes Blanches', kind: 'sentier', surface: 'neige', width: 1.4, vehicles: false,
    pts: [[-1100, 1850], [-1600, 1850], [-2100, 1750], [-2350, 1450]], note: 'des terrasses du Ciel au Col des Aurores par la crête, vue sur deux mondes' },
  { id: 'sentier-fontaine', name: 'Sentier de la Fontaine', kind: 'sentier', surface: 'terre', width: 1.6, vehicles: false,
    pts: [[-175, -300], [-200, -450], [-235, -600]], note: 'du Pic du Corbeau à la Fontaine de la Seine' },
  { id: 'sentier-dome', name: 'Sentier du Guetteur', kind: 'sentier', surface: 'pierre', width: 1.4, vehicles: false,
    pts: [[1350, -720], [1420, -900], [1500, -1050], [1450, -1200]], note: 'sur le granit nu, cairns' },
  // --- sentiers de bêtes et raccourcis (exemples ; les autres sont semés par ANIMAL_TRAIL_RULES)
  { id: 'coulee-cerfs', name: 'Coulée des Cerfs', kind: 'sentier-betes', surface: 'terre', width: 0.8, vehicles: false,
    pts: [[-800, 520], [-900, 300], [-1100, 150], [-1300, 0], [-1500, -150]], note: 'trace étroite dans la forêt des Mousses, relie la Route du Givre aux sources de la Tamise' },
  { id: 'piste-rennes', name: 'Piste des Rennes', kind: 'sentier-betes', surface: 'neige', width: 1, vehicles: false,
    pts: [[-2350, 1450], [-2250, 1750], [-2150, 2000], [-1950, 2300], [-1700, 2420]], note: 'du col au campement, puis à l’Onsen des Neiges' },
  { id: 'trace-chevres', name: 'Trace des Chèvres', kind: 'sentier-betes', surface: 'pierre', width: 0.8, vehicles: false,
    pts: [[1150, 1150], [1250, 1050], [1350, 900], [1400, 800]], note: 'éboulis de la Mesa Rouge à la Citadelle' },
  { id: 'traverse-saules', name: 'Traverse des Saules', kind: 'raccourci', surface: 'terre', width: 1.4, vehicles: false,
    pts: [[-472, -215], [-700, -700], [-900, -1100], [-1300, -1550]], note: 'de Capyville au Grand Arbre à travers champs (échaliers dans les haies)' },
  { id: 'traverse-garrigue', name: 'Traverse des Cigales', kind: 'raccourci', surface: 'terre', width: 1.2, vehicles: false,
    pts: [[400, 200], [600, 600], [760, 620], [1050, 900], [1400, 750]], note: 'droit vers la Citadelle par les ravines' },
  { id: 'traverse-lucioles', name: 'Traverse des Lucioles', kind: 'raccourci', surface: 'terre', width: 1.2, vehicles: false,
    pts: [[160, 270], [300, 520], [450, 900], [600, 1500], [700, 2080]], note: 'de la Crête des Lucioles au pied du Fuji en coupant les rizières par l’est' },
];

/** Règles de semis des sentiers de bêtes (complètent les tracés à la main). */
export const ANIMAL_TRAIL_RULES = {
  /** relient : points d'eau ↔ lisières ↔ cols ↔ prairies, en suivant le coût de pente le plus faible (Dijkstra sur la grille de 8 m) */
  links: ['eau', 'lisiere', 'col', 'prairie', 'poi'],
  maxSlope: 30,
  width: [0.6, 1.0],
  /** densité cible : un sentier de bêtes croisé tous les 250 à 400 m de marche hors route */
  every: [250, 400],
  /** lacets automatiques au-delà de 18 % */
  switchbackFrom: 0.18,
};

// =================================================================================================== REPÈRES ET VUES
export const WORLD_LANDMARKS: { id: string; name: string; x: number; z: number; top: number; visibleKm: number; night?: boolean; role: string }[] = [
  { id: 'aurore', name: 'Pic de l’Aurore', x: -2300, z: 450, top: 950, visibleKm: 8, role: 'point le plus haut, neige et glacier ; se voit de presque toute l’île, pointe au-dessus du Mont Kuma depuis la place de Capyville (cap ≈ 260°)' },
  { id: 'fuji', name: 'Mont Fuji', x: 305, z: 2899, top: 620, visibleKm: 7, role: 'cône enneigé du sud ; axe de la Grand-Rue de Capyville (cap 174°)' },
  { id: 'mille-voiles', name: 'Chute des Mille Voiles', x: 1615, z: 2225, top: 380, visibleKm: 3.5, role: 'colonne de brume blanche au-dessus de la jungle' },
  { id: 'grand-arbre', name: 'Le Grand Arbre', x: -1300, z: -1550, top: 200, visibleKm: 4, night: true, role: 'arbre géant de 70 m (camphrier) sur sa butte, lanternes des voyageurs la nuit' },
  { id: 'phare', name: 'Phare du Cap Blanc', x: -1700, z: -3550, top: 95, visibleKm: 5, night: true, role: 'tour blanche et rouge ; faisceau tournant la nuit, visible de Paris, de Londres et du Grand Arbre' },
  { id: 'dormeur', name: 'Le Dormeur', x: 1300, z: 100, top: 330, visibleKm: 5, role: 'colline en forme de capybara endormi, lisible de profil depuis le belvédère de Capyville et les Plaines' },
  { id: 'citadelle', name: 'Citadelle des Ocres', x: 1400, z: 750, top: 235, visibleKm: 4, role: 'ruines de remparts et d’une tour sur la mesa' },
  { id: 'viaduc', name: 'Viaduc du Canyon Rouge', x: 2520, z: -230, top: 160, visibleKm: 3, role: 'ligne de chevalets sur le ciel du plateau' },
  { id: 'chateau-ile', name: 'Château de l’Île', x: 1200, z: -1980, top: 85, visibleKm: 3, role: 'donjon en ruine sur l’île du Grand Lac' },
  { id: 'dome', name: 'Dôme du Guetteur', x: 1450, z: -1200, top: 300, visibleKm: 4, role: 'dôme de granit clair au-dessus des érables' },
  { id: 'dent-du-loup', name: 'Dent du Loup', x: -2050, z: 200, top: 680, visibleKm: 6, role: 'aiguille sombre à côté du Pic, se reconnaît à sa forme' },
  { id: 'clocher-clarines', name: 'Clocher des Clarines', x: -1450, z: 900, top: 205, visibleKm: 2.5, night: true, role: 'clocher à bulbe ; vu depuis le col du Pôle de Capyville sous le Pic de l’Aurore' },
  { id: 'vapeur-onsen', name: 'Vapeur de l’Onsen des Neiges', x: -1700, z: 2420, top: 110, visibleKm: 2, role: 'colonne de vapeur dans la neige' },
  { id: 'tour-eiffel', name: 'Tour Eiffel', x: -290, z: -2475, top: 120, visibleKm: 4, night: true, role: 'se découpe dans la vallée de la Seine dès le col de Paris' },
  { id: 'skyline-ny', name: 'Gratte-ciel de New York', x: 2450, z: -1500, top: 140, visibleKm: 5, night: true, role: 'silhouette de tours depuis le Dôme et la Route des Lacs' },
  { id: 'horloge-londres', name: 'Tour de l’Horloge (Londres)', x: -2300, z: -1300, top: 96, visibleKm: 3, night: true, role: 'cadran éclairé au bord de la Tamise' },
  { id: 'pyramides', name: 'Pyramides des Sables', x: 2650, z: 1650, top: 75, visibleKm: 4, role: 'trois pyramides au bord du chott' },
  { id: 'torii-lac', name: 'Torii du Lac', x: -560, z: 2390, top: 16, visibleKm: 1.5, role: 'torii vermillon dans l’eau, au premier plan du Fuji' },
  { id: 'station-polaire', name: 'Station polaire et son radôme', x: -2650, z: 2150, top: 30, visibleKm: 2.5, night: true, role: 'boule blanche et lumières rouges au fond de la baie' },
];

/** Vues composées du monde (caméra à hauteur de joueur sauf mention) : cibles de composition et captures de revue. */
export const WORLD_VIEWPOINTS: { id: string; name: string; x: number; z: number; y?: number; bearing: number; time: string; ref?: string; sees: string }[] = [
  { id: 'promontoire-lucioles', name: 'Promontoire des Lucioles', x: 300, z: 520, y: 70, bearing: 195, time: '7 h 30', ref: 'ref-8',
    sees: 'premier plan de rochers et de fleurs ; plaine des Rizières qui brille, méandres du Kawa, ville du Japon et lac (cap 211°), mont Fuji enneigé (cap 180°), plans de collines bleuies' },
  { id: 'col-paris', name: 'Révélation de la Seine', x: 0, z: -300, y: 22, bearing: 350, time: '9 h', sees: 'vallée de la Seine qui s’ouvre, peupliers, clochers, la tour Eiffel à 2,2 km dans la brume' },
  { id: 'col-pole', name: 'Col du Pôle', x: -260, z: 150, y: 22, bearing: 250, time: '17 h', ref: 'ref-10', sees: 'clocher des Clarines (cap 238°) sous le Pic de l’Aurore (cap 262°) et la Dent du Loup, forêt des Mousses au premier plan' },
  { id: 'clarines-fontaine', name: 'Fontaine des Clarines', x: -1420, z: 920, bearing: 280, time: '8 h', ref: 'ref-9', sees: 'chalets fleuris, prés en pente, cascade des Clarines, Mont des Neiges et Pic de l’Aurore' },
  { id: 'pinede-doree', name: 'Pinède dorée', x: -2050, z: 1320, bearing: 230, time: '16 h 30', ref: 'ref-12', sees: 'route enneigée entre les pins à troncs orangés, herbes rousses, soleil bas dans la brume' },
  { id: 'lac-aurore-nuit', name: 'Aurore sur le lac', x: -2250, z: 1860, bearing: 215, time: '23 h', ref: 'ref-15', sees: 'lac gelé, sapins chargés de neige, aurore verte, montagnes au loin' },
  { id: 'foret-mousses', name: 'Forêt des Mousses', x: -1000, z: 300, bearing: 100, time: '7 h 15', ref: 'ref-13', sees: 'tapis de mousse, troncs élancés, rayons du soleil levant' },
  { id: 'mille-voiles', name: 'Pied des Mille Voiles', x: 1560, z: 2420, bearing: 20, time: '7 h', ref: 'ref-16', sees: 'chute géante entre deux arbres géants, vapeur dorée, vasques' },
  { id: 'vallee-jade', name: 'Vallée de Jade', x: 1520, z: 2460, y: 140, bearing: 200, time: '8 h', ref: 'ref-17', sees: 'la rivière qui serpente dans la vallée sous les lianes, rayons' },
  { id: 'ruisseau-clair', name: 'Ruisseau Clair', x: 1080, z: 2860, bearing: 300, time: '10 h', ref: 'ref-18', sees: 'eau limpide sur rochers moussus, fougères, cascatelle' },
  { id: 'temple-gardien', name: 'Temple du Gardien', x: 1050, z: 2640, bearing: 0, time: '15 h pluie', ref: 'ref-14', sees: 'sanctuaire moussu, statue du capybara gardien, escalier, pluie et rayons' },
  { id: 'grand-arbre', name: 'Sous le Grand Arbre', x: -1290, z: -1520, y: 140, bearing: 320, time: '21 h', sees: 'bocage bleu de nuit, faisceau du phare (cap 340°), lumières de Paris (cap 40°) et de Londres (cap 290°)' },
  { id: 'citadelle', name: 'Remparts de la Citadelle', x: 1450, z: 760, y: 212, bearing: 110, time: '18 h', sees: 'garrigue, reg puis dunes orangées, oasis, pyramides, chott blanc ; le Dormeur à gauche' },
  { id: 'dome-guetteur', name: 'Dôme du Guetteur', x: 1450, z: -1200, y: 300, bearing: 45, time: '16 h', sees: 'Grand Lac et son château, érables flamboyants, gratte-ciel de New York, la mer' },
  { id: 'viaduc', name: 'Viaduc du Canyon Rouge', x: 2480, z: -300, y: 160, bearing: 95, time: '19 h', sees: 'canyon rouge vers la mer, cheminées de fée, ombres longues' },
  { id: 'sommet-aurore', name: 'Sommet du Pic de l’Aurore', x: -2300, z: 450, y: 952, bearing: 100, time: '6 h 45', sees: 'toute l’île : Capyville et ses vapeurs, Fuji, la mer de trois côtés, le glacier sous les pieds' },
  { id: 'sommet-fuji', name: 'Cratère du Fuji', x: 305, z: 2840, y: 615, bearing: 0, time: '6 h 30', sees: 'mer de nuages sur les rizières, Capyville au nord, jungle à l’est, Pic de l’Aurore au nord-ouest' },
  { id: 'phare', name: 'Galerie du phare', x: -1700, z: -3550, y: 92, bearing: 140, time: '18 h 30', sees: 'falaises blanches, lande mauve, estuaire, Paris au loin' },
  { id: 'route-rizieres', name: 'Volant sur la digue', x: -150, z: 1200, y: 9, bearing: 200, time: '6 h 50', ref: 'ref-5', sees: 'route droite sur la digue, rizières qui reflètent l’aube, Fuji sur la gauche' },
];

/** Lignes de vue à garantir (le Terrain et la Végétation vérifient qu'aucun relief ou arbre ne les bouche). */
export const SIGHT_LINES: { from: string; to: string; rule: string }[] = [
  { from: 'place de Capyville (0, 10), œil 7 m', to: 'fuji', rule: 'cap 174°, sommet à ≈ 12° au-dessus de l’horizon, rien entre le Grand Torii et le cône' },
  { from: 'place de Capyville (0, 0), œil 7 m', to: 'aurore', rule: 'cap ≈ 260°, la pointe enneigée dépasse l’épaule du Mont Kuma de 3 à 6° (teaser)' },
  { from: 'belvédère de Capyville (176, -168), y 60', to: 'dormeur', rule: 'cap ≈ 96°, profil complet du Dormeur au-dessus des érables' },
  { from: 'col-pole', to: 'clocher-clarines', rule: 'clocher dégagé dans l’axe de la route ; Pic de l’Aurore 24° plus à droite' },
  { from: 'col-paris', to: 'tour-eiffel', rule: 'la tour se lit dans la brume au bout de la vallée' },
  { from: 'grand-arbre', to: 'phare', rule: 'faisceau visible la nuit au-dessus de la lande' },
  { from: 'citadelle', to: 'pyramides', rule: 'les trois pyramides au-delà des dunes' },
  { from: 'dome-guetteur', to: 'skyline-ny', rule: 'gratte-ciel au-dessus des érables' },
  { from: 'promontoire-lucioles', to: 'fuji', rule: 'composition ref-8 : ville et lac au tiers, Fuji au centre, plaine au premier tiers' },
  { from: 'toute la Route des Rizières', to: 'fuji', rule: 'le Fuji ne sort jamais du champ en conduisant vers le sud' },
];

// =================================================================================================== POINTS D'INTÉRÊT
export type PoiKind =
  | 'hameau' | 'ferme' | 'sanctuaire' | 'grotte' | 'cabane' | 'ruine' | 'belvedere' | 'source-chaude' | 'campement'
  | 'phare' | 'moulin' | 'arbre' | 'pierre-vapeur' | 'pont' | 'curiosite' | 'port' | 'refuge';

export interface Poi {
  id: string;
  name: string;
  kind: PoiKind;
  x: number;
  z: number;
  y?: number;
  biome: BiomeId;
  /** ce qui le signale de loin (silhouette, fumée, son, lumière, couleur) */
  signal: string;
  /** ce qu'on y trouve (récompense de lieu ; le gameplay viendra s'y accrocher) */
  reward: string;
}

/** Points d'intérêt posés à la main (les petits « quelque chose » intermédiaires sont semés par POI_RULES). */
export const POIS: Poi[] = [
  // --- Pierres-Vapeur : bornes anciennes des Voyageurs (fil rouge, futur voyage rapide)
  { id: 'pv-seine', name: 'Pierre-Vapeur de la Seine', kind: 'pierre-vapeur', x: -230, z: -1430, biome: 'bocage-seine', signal: 'filet de vapeur au bord de la route', reward: 'borne des Voyageurs à réveiller, carte de la vallée gravée' },
  { id: 'pv-albion', name: 'Pierre-Vapeur des Cèdres', kind: 'pierre-vapeur', x: -1250, z: -700, biome: 'piemont', signal: 'vapeur entre les cèdres', reward: 'borne des Voyageurs' },
  { id: 'pv-lande', name: 'Pierre-Vapeur de la Lande', kind: 'pierre-vapeur', x: -1450, z: -3100, biome: 'lande', signal: 'vapeur au milieu des bruyères', reward: 'borne des Voyageurs' },
  { id: 'pv-fauves', name: 'Pierre-Vapeur des Fauves', kind: 'pierre-vapeur', x: 720, z: -2320, biome: 'erables-lacs', signal: 'vapeur au col', reward: 'borne des Voyageurs' },
  { id: 'pv-plaines', name: 'Pierre-Vapeur des Plaines', kind: 'pierre-vapeur', x: 1650, z: -790, biome: 'prairies-ranch', signal: 'vapeur dans l’herbe blonde', reward: 'borne des Voyageurs' },
  { id: 'pv-garrigue', name: 'Pierre-Vapeur des Cigales', kind: 'pierre-vapeur', x: 900, z: 480, biome: 'garrigue', signal: 'vapeur sous un pin d’Alep', reward: 'borne des Voyageurs' },
  { id: 'pv-dunes', name: 'Pierre-Vapeur des Dunes', kind: 'pierre-vapeur', x: 1900, z: 990, biome: 'dunes', signal: 'vapeur dans la cour du caravansérail', reward: 'borne des Voyageurs' },
  { id: 'pv-jade', name: 'Pierre-Vapeur de Jade', kind: 'pierre-vapeur', x: 1850, z: 1900, biome: 'savane', signal: 'vapeur au col', reward: 'borne des Voyageurs' },
  { id: 'pv-jungle', name: 'Pierre-Vapeur des Pilotis', kind: 'pierre-vapeur', x: 1230, z: 3120, biome: 'jungle', signal: 'vapeur sur la place du village', reward: 'borne des Voyageurs' },
  { id: 'pv-rizieres', name: 'Pierre-Vapeur des Rizières', kind: 'pierre-vapeur', x: -250, z: 1330, biome: 'rizieres', signal: 'vapeur sur une butte', reward: 'borne des Voyageurs' },
  { id: 'pv-fuji', name: 'Pierre-Vapeur du Pèlerin', kind: 'pierre-vapeur', x: 330, z: 2250, biome: 'volcan', signal: 'vapeur au premier torii', reward: 'borne des Voyageurs' },
  { id: 'pv-clarines', name: 'Pierre-Vapeur des Clarines', kind: 'pierre-vapeur', x: -1430, z: 880, biome: 'alpages', signal: 'vapeur près de la fontaine', reward: 'borne des Voyageurs' },
  { id: 'pv-aurores', name: 'Pierre-Vapeur des Aurores', kind: 'pierre-vapeur', x: -2340, z: 1430, biome: 'pinede-neige', signal: 'seul point sans neige du col', reward: 'borne des Voyageurs' },
  { id: 'pv-embruns', name: 'Pierre-Vapeur des Embruns', kind: 'pierre-vapeur', x: -1680, z: 2400, biome: 'pinede-neige', signal: 'vapeur de l’onsen', reward: 'borne des Voyageurs' },
  { id: 'pv-fjords', name: 'Pierre-Vapeur des Fjords', kind: 'pierre-vapeur', x: -3460, z: 420, biome: 'cote-ouest', signal: 'vapeur sur le quai', reward: 'borne des Voyageurs' },
  // --- Couronne et abords
  { id: 'promontoire-lucioles', name: 'Promontoire des Lucioles', kind: 'belvedere', x: 300, z: 520, y: 70, biome: 'couronne', signal: 'pin solitaire sur un éperon rocheux', reward: 'vue ref-8 sur le Pays du Levant, banc, longue-vue' },
  { id: 'fontaine-seine', name: 'Fontaine de la Seine', kind: 'grotte', x: -250, z: -620, biome: 'bocage-seine', signal: 'bruit d’eau, saules', reward: 'résurgence bleue sous une voûte de roche, nymphée en ruine' },
  { id: 'cabane-tanuki', name: 'Cabane du Lac du Tanuki', kind: 'cabane', x: 480, z: -700, biome: 'erables-lacs', signal: 'fumée de cheminée au-dessus des érables', reward: 'gardien du lac, barque, vue sur la gorge' },
  // --- Vallée de la Seine
  { id: 'moulin-seine', name: 'Moulin de la Seine', kind: 'moulin', x: -300, z: -1860, biome: 'bocage-seine', signal: 'roue qui tourne, bruit d’eau', reward: 'meunier, farine, vue sur les peupliers' },
  { id: 'chapelle-coquelicots', name: 'Chapelle des Coquelicots', kind: 'sanctuaire', x: 150, z: -1250, y: 70, biome: 'bocage-seine', signal: 'petit clocher sur la colline, champ rouge', reward: 'chapelle romane abandonnée, cloche qu’on peut sonner' },
  { id: 'pigeonnier', name: 'Ferme du Pigeonnier', kind: 'ferme', x: -700, z: -1100, biome: 'bocage-seine', signal: 'tour ronde du pigeonnier', reward: 'cour de ferme, animaux, verger' },
  { id: 'guinguette', name: 'Guinguette des Peupliers', kind: 'curiosite', x: -420, z: -2180, biome: 'bocage-seine', signal: 'guirlandes de lumières sur l’eau', reward: 'barques, accordéon, bal le soir' },
  // --- Lande et falaises
  { id: 'phare', name: 'Phare du Cap Blanc', kind: 'phare', x: -1700, z: -3550, y: 60, biome: 'lande', signal: 'tour blanche et rouge, faisceau la nuit', reward: 'escalier de 140 marches, galerie, gardienne du phare' },
  { id: 'cercle-pierres', name: 'Cercle des Pierres Levées', kind: 'ruine', x: -2350, z: -2650, biome: 'lande', signal: 'silhouettes dressées sur la crête', reward: 'cercle de 13 pierres qui s’alignent sur le soleil couchant' },
  { id: 'grotte-falaises', name: 'Grotte marine', kind: 'grotte', x: -900, z: -3640, biome: 'lande', signal: 'arche dans la falaise', reward: 'grotte accessible à marée basse, coquillages' },
  { id: 'epave', name: 'Épave du « Voyageur »', kind: 'curiosite', x: -3000, z: -3150, biome: 'lande', signal: 'mâts penchés sur la plage', reward: 'vieux navire échoué des Voyageurs, cabine du capitaine' },
  // --- Pays d'Albion
  { id: 'grand-arbre', name: 'Le Grand Arbre', kind: 'arbre', x: -1300, z: -1550, y: 130, biome: 'bocage-albion', signal: 'silhouette géante, lanternes la nuit', reward: 'escalier autour du tronc, cabane dans les branches à 30 m, lanternes des Voyageurs' },
  { id: 'abbaye', name: 'Abbaye du Couchant', kind: 'ruine', x: -1000, z: -2000, biome: 'bocage-seine', signal: 'pignon gothique percé d’une rosace', reward: 'cloître envahi de lierre, jardin de simples' },
  { id: 'manoir-roses', name: 'Manoir aux Roses', kind: 'ruine', x: -2150, z: -2000, biome: 'bocage-albion', signal: 'cheminées de brique au-dessus des haies', reward: 'labyrinthe de haies et sa fontaine au centre' },
  { id: 'cascade-tamise', name: 'Grotte des Sources', kind: 'grotte', x: -1660, z: -450, biome: 'piemont', signal: 'cascade dans la forêt des Mousses', reward: 'grotte derrière la cascade de la Tamise' },
  { id: 'tour-guet-estuaire', name: 'Tour de l’Estuaire', kind: 'ruine', x: -3350, z: -1150, biome: 'cote-ouest', signal: 'tour ronde sur la pointe', reward: 'vue sur l’estuaire et les docks de Londres' },
  // --- Côte des Fjords
  { id: 'front-glacier', name: 'Belvédère du Glacier', kind: 'belvedere', x: -3150, z: 560, y: 60, biome: 'cote-ouest', signal: 'mur de glace bleue au fond du fjord', reward: 'on voit et entend le glacier vêler' },
  { id: 'cabane-berger', name: 'Cabane du Berger', kind: 'cabane', x: -3150, z: -250, biome: 'cote-ouest', signal: 'fumée sur la lande', reward: 'abri, moutons, chien de berger' },
  // --- Massif du Givre et Clarines
  { id: 'lac-cristal', name: 'Lac de Cristal', kind: 'curiosite', x: -1760, z: 820, y: 262, biome: 'alpages', signal: 'reflet turquoise au-dessus de la cascade', reward: 'eau transparente, ponton, truites' },
  { id: 'refuge-aurore', name: 'Refuge de l’Aurore', kind: 'refuge', x: -2150, z: 350, y: 600, biome: 'haute-montagne', signal: 'toit rouge sur l’arête', reward: 'gardien, soupe chaude, dernière étape avant le sommet' },
  { id: 'sommet-aurore', name: 'Sommet du Pic de l’Aurore', kind: 'belvedere', x: -2300, z: 450, y: 950, biome: 'haute-montagne', signal: 'le plus haut point de l’île', reward: 'panorama total, croix de sommet et livre d’or' },
  { id: 'alpage', name: 'Chalet d’alpage', kind: 'ferme', x: -1250, z: 1100, y: 160, biome: 'alpages', signal: 'clarines des vaches', reward: 'fromagerie, lait chaud, vaches' },
  { id: 'chapelle-neiges', name: 'Chapelle des Neiges', kind: 'sanctuaire', x: -1950, z: 1150, y: 300, biome: 'pinede-neige', signal: 'petit clocher dans les pins enneigés', reward: 'chapelle de bois, bougies, ex-voto des Voyageurs' },
  { id: 'grotte-glace', name: 'Grotte de glace', kind: 'grotte', x: -2480, z: 900, y: 520, biome: 'haute-montagne', signal: 'bouche bleue dans le névé', reward: 'couloirs de glace translucide' },
  { id: 'scierie', name: 'Scierie de la Forêt des Mousses', kind: 'moulin', x: -760, z: 640, biome: 'piemont', signal: 'bruit de la roue et de la scie, odeur de résine', reward: 'scieur, piles de planches, roue à aubes' },
  { id: 'sanctuaire-mousse', name: 'Sanctuaire Moussu', kind: 'sanctuaire', x: -1100, z: 200, biome: 'piemont', signal: 'lanterne de pierre au bout d’une allée de mousse', reward: 'statue de capybara gardien couverte de mousse (ref-14 transposée)' },
  // --- Pinèdes, toundra, Pôle
  { id: 'campement-rennes', name: 'Campement des Rennes', kind: 'campement', x: -2250, z: 1750, biome: 'toundra', signal: 'fumée de yourtes', reward: 'bergers, rennes, motoneige' },
  { id: 'observatoire', name: 'Observatoire des Aurores', kind: 'belvedere', x: -2150, z: 2000, y: 120, biome: 'toundra', signal: 'coupole sur une bosse', reward: 'télescope, aurores, carte du ciel' },
  { id: 'cascade-gelee', name: 'Cascade Gelée', kind: 'curiosite', x: -2562, z: 2210, biome: 'toundra', signal: 'orgues de glace bleue', reward: 'passage derrière la cascade figée' },
  { id: 'epave-glace', name: 'Navire pris dans les glaces', kind: 'curiosite', x: -2750, z: 2620, biome: 'banquise', signal: 'mâts au milieu de la banquise', reward: 'cale explorable' },
  { id: 'onsen-neiges', name: 'Onsen des Neiges', kind: 'source-chaude', x: -1700, z: 2420, biome: 'pinede-neige', signal: 'colonne de vapeur dans la neige', reward: 'bain chaud sauvage, ryokan en ruine' },
  // --- Pays du Levant
  { id: 'terrasses-ciel', name: 'Terrasses du Ciel', kind: 'curiosite', x: -1050, z: 1850, y: 70, biome: 'rizieres', signal: 'gradins de rizières qui brillent sur la pente', reward: 'cabane de veille, vue sur le lac et le Fuji' },
  { id: 'jizo-carrefour', name: 'Jizō du Carrefour', kind: 'sanctuaire', x: -520, z: 1650, biome: 'rizieres', signal: 'bonnets rouges au pied d’un camphrier', reward: 'six jizō, offrandes' },
  { id: 'moulin-rizieres', name: 'Moulin des Rizières', kind: 'moulin', x: -120, z: 900, biome: 'rizieres', signal: 'roue lente sur le ruisseau', reward: 'meunier, sacs de riz' },
  { id: 'refuge-fuji', name: 'Refuge du Pèlerin', kind: 'refuge', x: 430, z: 2600, y: 330, biome: 'volcan', signal: 'murs de pierre et drapeaux de prière', reward: 'thé, tampons des stations' },
  { id: 'sommet-fuji', name: 'Cratère du Fuji', kind: 'belvedere', x: 305, z: 2899, y: 620, biome: 'volcan', signal: 'le cône', reward: 'tour du cratère, lever de soleil sur la mer de nuages' },
  { id: 'grotte-lave', name: 'Tunnel de lave', kind: 'grotte', x: 700, z: 3300, biome: 'volcan', signal: 'bouche noire dans une coulée', reward: 'tunnel de 200 m qui débouche sur la plage noire' },
  { id: 'plage-noire', name: 'Plage noire', kind: 'curiosite', x: 300, z: 3650, biome: 'volcan', signal: 'sable noir et orgues de lave', reward: 'arches marines, rocher du Torii au loin' },
  { id: 'bambouseraie', name: 'Tunnel de bambous', kind: 'curiosite', x: 300, z: 2010, biome: 'foret-asiatique', signal: 'mur vert serré, bruit des tiges', reward: 'allée de bambous géants, petit sanctuaire' },
  // --- Jungle de Jade
  { id: 'mille-voiles', name: 'Chute des Mille Voiles', kind: 'curiosite', x: 1615, z: 2225, biome: 'jungle', signal: 'colonne de brume', reward: 'vasque au pied, arc-en-ciel le matin' },
  { id: 'grotte-voiles', name: 'Grotte des Voiles', kind: 'grotte', x: 1615, z: 2215, biome: 'jungle', signal: 'derrière le rideau d’eau', reward: 'salle aux cristaux, fresque des Voyageurs' },
  { id: 'colosses', name: 'Les Colosses', kind: 'arbre', x: 1450, z: 2550, biome: 'jungle', signal: 'troncs gigantesques au-dessus de la canopée', reward: 'arbres de 60 m à contreforts, passerelles dans la canopée' },
  { id: 'temple-gardien', name: 'Temple du Gardien de Jade', kind: 'sanctuaire', x: 1050, z: 2620, biome: 'jungle', signal: 'toit de pierre moussu entre les lianes', reward: 'statue originale de capybara gardien, escaliers, jarres (ref-14)' },
  { id: 'belvedere-canopee', name: 'Plate-forme de la Canopée', kind: 'belvedere', x: 1800, z: 2650, y: 180, biome: 'jungle', signal: 'échelles et plate-forme dans un arbre géant', reward: 'vue au-dessus de la canopée, la mer et le Fuji' },
  { id: 'ruisseau-clair', name: 'Vasques du Ruisseau Clair', kind: 'curiosite', x: 1000, z: 2810, biome: 'jungle', signal: 'bruit d’eau claire', reward: 'eau limpide, baignade (ref-18)' },
  // --- Savane, désert
  { id: 'arche-pierre', name: 'Arche de Pierre', kind: 'curiosite', x: 2050, z: 1600, biome: 'savane', signal: 'arche rocheuse sur le ciel', reward: 'on passe dessous et dessus' },
  { id: 'chott', name: 'Chott Blanc', kind: 'curiosite', x: 2850, z: 1550, biome: 'dunes', signal: 'blancheur éblouissante, mirages', reward: 'croûte de sel en polygones, flamants roses' },
  { id: 'campement-nomade', name: 'Campement nomade', kind: 'campement', x: 2700, z: 1950, biome: 'dunes', signal: 'tentes noires au creux des dunes, feu le soir', reward: 'thé, dromadaires, conteur' },
  { id: 'ksar-ruine', name: 'Ksar oublié', kind: 'ruine', x: 3150, z: 1100, biome: 'dunes', signal: 'tours de terre rongées par le sable', reward: 'greniers, puits, terrasse sur la mer' },
  { id: 'falaise-dunes', name: 'Belvédère des Dunes', kind: 'belvedere', x: 3550, z: 1700, y: 75, biome: 'dunes', signal: 'crête de sable au-dessus de la mer', reward: 'glissade dans la dune jusqu’à la plage' },
  // --- Garrigue
  { id: 'citadelle', name: 'Citadelle des Ocres', kind: 'ruine', x: 1400, z: 750, y: 210, biome: 'garrigue', signal: 'remparts sur la mesa', reward: 'rampe, remparts, citerne, tour de guet' },
  { id: 'arches-anciens', name: 'Arches des Anciens', kind: 'ruine', x: 650, z: 150, biome: 'garrigue', signal: 'rangée d’arches de pierre dans un vallon', reward: 'ancien aqueduc de l’eau tiède des Voyageurs, canal qui fume encore' },
  { id: 'source-tiede', name: 'Source Tiède des Ocres', kind: 'source-chaude', x: 1150, z: 350, biome: 'garrigue', signal: 'vapeur légère dans une ravine', reward: 'vasques de travertin blanc' },
  { id: 'lavandes', name: 'Champs de lavande', kind: 'curiosite', x: 1000, z: 1050, biome: 'garrigue', signal: 'bandes violettes', reward: 'abeilles, distillerie' },
  // --- Plaines et canyon
  { id: 'oreilles-dormeur', name: 'Les Oreilles du Dormeur', kind: 'belvedere', x: 1300, z: -280, y: 330, biome: 'prairies-ranch', signal: 'deux rochers sur la tête du Dormeur', reward: 'vue sur Capyville, les Plaines et la garrigue' },
  { id: 'grotte-canyon', name: 'Grotte peinte', kind: 'grotte', x: 2700, z: -130, biome: 'prairies-ranch', signal: 'ombre dans la paroi rouge', reward: 'peintures anciennes de capybaras voyageurs' },
  { id: 'cheminees-fees', name: 'Cheminées de fée', kind: 'curiosite', x: 3100, z: -400, biome: 'prairies-ranch', signal: 'colonnes coiffées de rochers', reward: 'labyrinthe de colonnes' },
  { id: 'campement-plaines', name: 'Campement des Plaines', kind: 'campement', x: 2200, z: 250, biome: 'prairies-ranch', signal: 'feu de camp et chariot bâché', reward: 'feu, harmonica, nuit étoilée' },
  // --- Pays des Lacs
  { id: 'chateau-ile', name: 'Château de l’Île', kind: 'ruine', x: 1200, z: -1980, biome: 'erables-lacs', signal: 'donjon sur l’île', reward: 'tour, salle des fêtes en ruine, souterrain' },
  { id: 'dome-guetteur', name: 'Dôme du Guetteur', kind: 'belvedere', x: 1450, z: -1200, y: 300, biome: 'erables-lacs', signal: 'dôme de granit clair', reward: 'vue sur le Grand Lac et New York' },
  { id: 'tour-fauve', name: 'Tour du Mont Fauve', kind: 'ruine', x: 650, z: -1450, y: 255, biome: 'erables-lacs', signal: 'tour carrée dans les érables', reward: 'vue sur Paris et le Grand Lac' },
  { id: 'cabane-castor', name: 'Cabane du Lac du Huard', kind: 'cabane', x: 1700, z: -2400, biome: 'erables-lacs', signal: 'fumée, barrage de castors', reward: 'canoë, castors' },
  { id: 'chutes-huard', name: 'Chutes du Huard', kind: 'curiosite', x: 2150, z: -1742, biome: 'erables-lacs', signal: 'grondement, embruns', reward: 'sentier derrière la chute' },
  { id: 'crique-loutres', name: 'Crique aux Loutres', kind: 'curiosite', x: 2300, z: -3250, biome: 'erables-lacs', signal: 'granit rose et pins sur la mer', reward: 'loutres, plage secrète' },
  // --- rivages et confins (le littoral est une promenade à part entière)
  { id: 'pointe-fous', name: 'Pointe des Fous', kind: 'belvedere', x: 1200, z: -3550, biome: 'erables-lacs', signal: 'nuées d’oiseaux blancs sur un cap de granit rose', reward: 'colonie d’oiseaux marins, banc face au large' },
  { id: 'cabane-homards', name: 'Cabane du Pêcheur de Homards', kind: 'cabane', x: 3000, z: -2650, biome: 'erables-lacs', signal: 'casiers empilés et bouées colorées', reward: 'ponton, barque, pêcheur qui raconte l’île' },
  { id: 'erabliere-lanternes', name: 'Érablière aux Lanternes', kind: 'curiosite', x: 1100, z: -2900, biome: 'erables-lacs', signal: 'seaux accrochés aux troncs, lanternes dans les érables', reward: 'cabane à sucre, tire d’érable sur la neige' },
  { id: 'oyats', name: 'Cabane des Oyats', kind: 'cabane', x: 500, z: -3620, biome: 'bocage-seine', signal: 'cabane de planches sur la dune grise', reward: 'cerfs-volants, vue sur l’estuaire' },
  { id: 'arche-rouge', name: 'Arche marine Rouge', kind: 'curiosite', x: 3550, z: 300, biome: 'prairies-ranch', signal: 'arche de grès dans la mer', reward: 'plage rouge à l’embouchure du canyon' },
  { id: 'epave-sables', name: 'Épave des Sables', kind: 'curiosite', x: 3300, z: 2450, biome: 'dunes', signal: 'coque à moitié ensablée sur la plage', reward: 'trésor de bric-à-brac, crabes' },
  { id: 'crique-cocotiers', name: 'Crique des Cocotiers', kind: 'curiosite', x: 2800, z: 3080, biome: 'jungle', signal: 'cocotiers penchés sur une plage blanche', reward: 'baignade, tortues au large (Île aux Tortues)' },
  { id: 'mangrove', name: 'Mangrove des Palétuviers', kind: 'curiosite', x: 2100, z: 3350, biome: 'jungle', signal: 'racines aériennes et eau verte', reward: 'pontons de bois, crabes violonistes, martins-pêcheurs' },
  { id: 'baobab', name: 'Baobab des Voyageurs', kind: 'arbre', x: 1000, z: 1750, biome: 'savane', signal: 'tronc énorme seul dans la savane', reward: 'tronc creux habitable, gravures des Voyageurs' },
  { id: 'plage-torii', name: 'Plage du Torii', kind: 'curiosite', x: -620, z: 3600, biome: 'foret-asiatique', signal: 'torii sur un rocher au large', reward: 'à marée basse, on marche jusqu’au rocher' },
  { id: 'torii-embruns', name: 'Torii des Embruns', kind: 'sanctuaire', x: -1600, z: 3430, biome: 'foret-asiatique', signal: 'torii rouge au bout d’une pointe battue par les vagues', reward: 'petit sanctuaire de la mer, cloches à vent' },
  { id: 'phoques-embruns', name: 'Rochers aux Phoques', kind: 'curiosite', x: -2200, z: 3040, biome: 'pinede-neige', signal: 'aboiements, formes grises sur les rochers', reward: 'colonie de phoques' },
  { id: 'cabane-glaces', name: 'Cabane du Guetteur des Glaces', kind: 'cabane', x: -3550, z: 1500, biome: 'pinede-neige', signal: 'cabane rouge sur la falaise enneigée', reward: 'longue-vue sur la mer des Glaces et les icebergs' },
  { id: 'grotte-contrebandiers', name: 'Grotte des Contrebandiers', kind: 'grotte', x: -3640, z: -2250, biome: 'lande', signal: 'escalier taillé qui descend dans la falaise', reward: 'grotte à marée, vieux coffres vides, lanterne' },
];

/**
 * Règles de semis des petits points d'intérêt (entre les POIS) pour qu'il y ait « quelque chose d'intéressant »
 * visible tous les 200 à 400 m. Distances minimales entre deux objets du même type et à tout POI.
 */
export const POI_RULES: { kind: string; biomes: BiomeId[] | 'tous'; spacing: number; where: string; examples: string }[] = [
  { kind: 'rocher-remarquable', biomes: 'tous', spacing: 350, where: 'crêtes, rebords, lisières ; jamais sur un chemin', examples: 'bloc erratique, rocher-champignon, rocher fendu, roche à cupules' },
  { kind: 'arbre-remarquable', biomes: 'tous', spacing: 400, where: 'isolé dans un pré ou sur une butte, visible de loin', examples: 'chêne creux, pin parasol, érable rouge seul, baobab, bouleau penché' },
  { kind: 'abri', biomes: ['bocage-seine', 'bocage-albion', 'lande', 'garrigue', 'alpages', 'cote-ouest', 'prairies-ranch'], spacing: 600, where: 'près d’un chemin, à flanc de coteau', examples: 'cabane de berger, borie, grange, abri de chasseur d’images, cabane de pêcheur' },
  { kind: 'petit-sanctuaire', biomes: ['foret-asiatique', 'rizieres', 'volcan', 'jungle', 'couronne', 'piemont'], spacing: 500, where: 'carrefours, sources, sous un grand arbre', examples: 'jizō, petit torii, lanterne de pierre, statue moussue' },
  { kind: 'calvaire-ou-cairn', biomes: ['bocage-seine', 'bocage-albion', 'lande', 'haute-montagne', 'toundra', 'pinede-neige', 'cote-ouest'], spacing: 500, where: 'cols, carrefours, sommets', examples: 'croix de chemin, cairn, borne gravée, mât de prières' },
  { kind: 'point-d-eau', biomes: 'tous', spacing: 450, where: 'creux humides (accumulation d’écoulement)', examples: 'mare, source, abreuvoir, puits, vasque' },
  { kind: 'ruine-mineure', biomes: 'tous', spacing: 700, where: 'replats, éperons', examples: 'muret effondré, four à pain, ancienne bergerie, colonne' },
  { kind: 'panorama', biomes: 'tous', spacing: 800, where: 'tout point haut dont la vue porte à plus de 2 km sans obstacle', examples: 'banc, table d’orientation, longue-vue' },
  { kind: 'trace-de-vie', biomes: 'tous', spacing: 300, where: 'le long des chemins et sentiers', examples: 'feu de camp éteint, charrette abandonnée, épouvantail, panneau, ruche, bateau retourné' },
  { kind: 'faune', biomes: 'tous', spacing: 250, where: 'clairières, berges, lisières', examples: 'troupeau, nid de cigognes, terrier, hérons, rennes, dromadaires, singes' },
];

/** Densité et rythme : contrôlés par le script de semis et par les captures de revue. */
export const POI_DENSITY = {
  /** distance maximale, depuis n'importe quel point des terres sauvages, au « quelque chose d'intéressant » visible le plus proche */
  visibleEvery: [200, 400] as [number, number],
  /** un lieu nommé (POIS) tous les 500 à 800 m le long des routes et chemins */
  namedEvery: [500, 800] as [number, number],
  /** un belvédère ou point haut atteignable dans un rayon de 1 km partout */
  viewpointWithin: 1000,
  /** une Pierre-Vapeur à moins de 1,5 km de tout point des terres sauvages */
  relayWithin: 1500,
};

/**
 * Balades : boucles composées à la main selon le rythme découverte → point de vue → récompense.
 * `steps` = ids de POIS, de SETTLEMENTS, de WORLD_LANDMARKS ou de WORLD_VIEWPOINTS, dans l'ordre de marche.
 */
export const BALADES: { id: string; name: string; zone: MacroZoneId; steps: string[]; km: number; note: string }[] = [
  { id: 'balade-seine', name: 'De la Fontaine au Moulin', zone: 'seine', km: 3.5, steps: ['fontaine-seine', 'pv-seine', 'gue-aux-saules', 'chapelle-coquelicots', 'moulin-seine'], note: 'découverte (bruit d’eau) → résurgence → hameau → vue de la chapelle sur toute la vallée → moulin' },
  { id: 'balade-arbre', name: 'La nuit du Grand Arbre', zone: 'albion', km: 4, steps: ['pv-albion', 'hameau-chaumes', 'grand-arbre', 'abbaye'], note: 'les lanternes de l’arbre se voient du hameau au crépuscule ; cabane dans l’arbre ; retour par l’abbaye' },
  { id: 'balade-falaises', name: 'Sentier des Douaniers', zone: 'seine', km: 4.5, steps: ['hameau-du-cap', 'phare', 'cascade-cap', 'cercle-pierres', 'epave'], note: 'phare → cascade sur la plage → pierres au couchant → épave' },
  { id: 'balade-lac', name: 'Tour du Grand Lac', zone: 'amerique', km: 5, steps: ['tour-fauve', 'port-aux-huards', 'chateau-ile', 'chutes-huard'], note: 'tour en ruine (vue) → barque → château (récompense) → chutes' },
  { id: 'balade-dormeur', name: 'Sur la tête du Dormeur', zone: 'amerique', km: 3, steps: ['ferme-erables', 'oreilles-dormeur', 'pv-plaines', 'ranch-dormeur'], note: 'silhouette vue de loin → montée → vue sur Capyville → ranch' },
  { id: 'balade-canyon', name: 'Au fond du Canyon Rouge', zone: 'amerique', km: 4, steps: ['viaduc', 'passerelle-canyon', 'grotte-canyon', 'gue-canyon', 'cheminees-fees'], note: 'viaduc (vue) → descente → grotte peinte → baignade à la chute Rouge' },
  { id: 'balade-citadelle', name: 'La Citadelle des Ocres', zone: 'desert', km: 3.5, steps: ['arches-anciens', 'source-tiede', 'bastide-cigales', 'citadelle'], note: 'arches (indice des Voyageurs) → source tiède → bastide → remparts au couchant' },
  { id: 'balade-jungle', name: 'Les Mille Voiles', zone: 'asie', km: 5, steps: ['pv-jade', 'mille-voiles', 'grotte-voiles', 'colosses', 'belvedere-canopee', 'village-pilotis'], note: 'brume vue du col → chute → grotte derrière l’eau → arbres géants → canopée → village' },
  { id: 'balade-fuji', name: 'Chemin du Pèlerin', zone: 'asie', km: 4, steps: ['bambouseraie', 'pv-fuji', 'refuge-fuji', 'sommet-fuji'], note: 'tunnel de bambous → dix torii → refuge → lever de soleil au cratère' },
  { id: 'balade-rizieres', name: 'Les Terrasses du Ciel', zone: 'asie', km: 3, steps: ['moulin-rizieres', 'hameau-rizieres', 'jizo-carrefour', 'terrasses-ciel'], note: 'moulin → hameau → jizō → terrasses avec vue sur le lac et le Fuji' },
  { id: 'balade-clarines', name: 'Le Lac de Cristal', zone: 'arctique', km: 3, steps: ['clarines', 'alpage', 'lac-cristal', 'chapelle-neiges'], note: 'cascade vue du village → alpage → lac turquoise au-dessus de la cascade → chapelle dans la première neige' },
  { id: 'balade-aurores', name: 'La nuit des Aurores', zone: 'arctique', km: 4, steps: ['pv-aurores', 'campement-rennes', 'observatoire', 'cascade-gelee'], note: 'col → bergers → observatoire à la nuit tombée → aurore sur le lac → cascade gelée' },
  { id: 'balade-fjord', name: 'Le Glacier', zone: 'arctique', km: 3.5, steps: ['port-aux-phoques', 'front-glacier', 'voile-fjord'], note: 'port → belvédère du glacier → cascade du Voile' },
];

// =================================================================================================== TECHNIQUE
/**
 * Streaming et distances de vue pour le navigateur (voir docs/BIBLE-MONDE.md §11 et docs/RETOURS-CLIENT.md §6).
 * Distances en mètres ; budgets en qualité « Moyenne ».
 */
export const WORLD_STREAMING = {
  /** tuile de streaming : 256 m (32 × 32 tuiles sur l'île) */
  tile: 256,
  /**
   * Clipmaps géométriques sur GPU : maillage centré sur la caméra, déformé dans le vertex shader par la texture de hauteur
   * 16 bits streamée par tuiles. Niveaux (pas de grille en m → rayon couvert) ; chaque niveau double le pas du précédent
   * (les pas intermédiaires 16 m existent dans le clipmap, regroupés ici avec le maillage global).
   */
  terrainLods: [
    { cell: 1, radius: 160 },
    { cell: 2, radius: 400 },
    { cell: 4, radius: 900 },
    { cell: 8, radius: 2000 },
    { cell: 32, radius: 8000 }, // maillage global de l'île, toujours chargé
  ],
  /** contenu chargé autour du joueur (tuiles complètes : objets, herbe, collisions) */
  loadRadius: 700,
  unloadRadius: 900,
  /** préchargement dans la direction du mouvement (s d'avance à la vitesse courante) */
  lookAhead: 6,
  /** distances d'affichage */
  view: {
    grass: 60,
    props: 120,
    treesFull: 45,
    treesLod1: 140,
    treeImpostors: 1000,
    forestCanopyMesh: 3500, // au-delà : teinte de canopée peinte dans la texture du terrain
    buildingsFull: 140,
    cityHlod: 400, // un maillage simplifié par îlot
    citySilhouette: 8000, // un maillage par ville (≤ 30 k triangles), toujours chargé
    landmarks: 8000, // repères toujours visibles (LOD dédiés)
  },
  /** brouillard : densité exponentielle + brume de hauteur ; la perspective aérienne fond les plans successifs */
  fog: { density: 0.00028, heightFalloff: 0.012, valleyMistBelow: 25 },
  budget: { drawCalls: 700, triangles: 3_000_000, frameMs: 16.6, uploadMsPerFrame: 2, gpuMemoryMB: 1500, downloadMB: 120 },
};
