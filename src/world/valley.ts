// Relief de la vallée de Capyville (spécialité Terrain & relief).
// Fonctions pures, sans dépendance au reste du monde (seulement zones.ts) : layout.ts peut donc importer
// les tracés des cols sans dépendance circulaire. La cuisson des grilles est dans heightmap.ts.
//
// Deux couches :
// - un relief « doux » (valleySmooth) évalué sur la grille globale : fond de vallée interpolé sur les altitudes
//   de la bible, collines, couronne de montagnes, cols et couloirs des axes, vallée en V de la gorge ;
// - des « tampons » nets (stampDetail) appliqués sur la grille de détail (0,5 m) : lit du torrent et murs,
//   vasques, étang, source chaude, plats exacts, gradins, emprises des bâtiments, chemins, falaises.
import {
  ALTITUDES, BUILDINGS, CASCADES, COLS, FIELDS, HOT_SPRING_POOL, PATHS, PEAKS, PLAZA, POND, STREAM, STREAM_BED_DEPTH,
  STREAM_WATER_Y, STREAM_WIDTHS, VILLAGE_GATES, YUBATAKE, XZ, facing,
} from './zones';
import { clamp, fbm, lerp, noise2, ridged, smoothstep } from '../core/math';
import { FOREST_BELTS, pointAlong } from './zones';

type Axis = (typeof COLS)[number]['region'];
const deg0 = Math.PI / 180;

// =============================================================================================== GRILLE DE DÉTAIL
/** Emprise et pas de la grille de détail (alignée sur les morceaux de 200 m du maillage). */
export const DETAIL = { x0: -400, z0: -400, x1: 200, z1: 400, cell: 0.5 };
export const DETAIL_NX = Math.round((DETAIL.x1 - DETAIL.x0) / DETAIL.cell) + 1;
export const DETAIL_NZ = Math.round((DETAIL.z1 - DETAIL.z0) / DETAIL.cell) + 1;

// =============================================================================================== OUTILS
/** Distance à une polyligne avec abscisse curviligne du point le plus proche. */
export function polyNearest(x: number, z: number, pts: XZ[]) {
  let best = Infinity, bi = 0, bt = 0, acc = 0, bs = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const vx = bx - ax, vz = bz - az;
    const l2 = vx * vx + vz * vz || 1e-9;
    const l = Math.sqrt(l2);
    const t = clamp(((x - ax) * vx + (z - az) * vz) / l2, 0, 1);
    const dx = x - ax - vx * t, dz = z - az - vz * t;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) { best = d2; bi = i; bt = t; bs = acc + t * l; }
    acc += l;
  }
  return { d: Math.sqrt(best), i: bi, t: bt, s: bs };
}

/** Maximum doux (raccord arrondi de rayon k). */
const smax = (a: number, b: number, k: number) => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return lerp(a, b, h) + k * h * (1 - h);
};
const smin = (a: number, b: number, k: number) => -smax(-a, -b, k);

/** Distance signée à un rectangle orienté (négative dedans). yaw = rotation.y Three.js. */
export function rectSdf(x: number, z: number, cx: number, cz: number, w: number, d: number, yaw: number) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const dx = x - cx, dz = z - cz;
  // repère local : x local = (cos yaw, -sin yaw), z local = (sin yaw, cos yaw)
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const qx = Math.abs(lx) - w / 2, qz = Math.abs(lz) - d / 2;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}

function plazaSdf(x: number, z: number) {
  const ax = Math.abs(x - PLAZA.x), az = Math.abs(z - PLAZA.z);
  const box = Math.hypot(Math.max(ax - PLAZA.halfX, 0), Math.max(az - PLAZA.halfZ, 0)) + Math.min(Math.max(ax - PLAZA.halfX, az - PLAZA.halfZ), 0);
  // coin coupé : demi-plan x + z <= halfX + halfZ - chamfer
  const ch = (ax + az - (PLAZA.halfX + PLAZA.halfZ - PLAZA.chamfer)) / Math.SQRT2;
  return Math.max(box, ch);
}

// =============================================================================================== FOND DE VALLÉE
/** Points d'ancrage du fond de vallée : disque plat (r) ou plan incliné (gx, gz par mètre). `keep` protège le plat des montagnes. */
interface Anchor { x: number; z: number; r: number; y: number; gx?: number; gz?: number; keep?: number }
const A: Anchor[] = [
  { x: 0, z: 0, r: 45, y: 6, keep: 40 }, // replat du village
  { x: 14, z: -102, r: 5, y: 9 }, // porte du Col
  { x: 100, z: -40, r: 5, y: 7.5 }, // porte du Levant
  { x: 106, z: 86, r: 5, y: 7 }, // porte des Yuzus
  { x: -6, z: 120, r: 5, y: 6.5 }, // Grand Torii
  { x: -100, z: 40, r: 5, y: 6 }, // porte de l'Étang
  { x: -84, z: -67, r: 5, y: 8.5 }, // porte des Cèdres
  { x: 48, z: -72, r: 6, y: 7.5 }, // moulin
  { x: 88, z: 10, r: 22, y: 6.5 }, // rive des bains (Grand Ryokan)
  { x: 60, z: 70, r: 14, y: 6 }, // rotenburo
  { x: 38, z: -36, r: 8, y: 6.2 }, // yubatake
  { x: -114, z: -12, r: 12, y: 7 }, // ferme
  { x: 40, z: 136, r: 8, y: 5.6 }, // fond de vallée au sud du torrent
  { x: -50, z: 134, r: 8, y: 5.0 },
  { x: 5, z: 185, r: 16, y: 5.8, keep: 30 }, // prés fleuris du Gué
  { x: -92, z: 200, r: 30, y: 5.5, keep: 40 }, // prés du Gué
  { x: -120, z: 90, r: 38, y: 1.4 }, // cuvette de l'étang (l'étang lui-même est un tampon)
  { x: 110, z: 140, r: 24, y: 11, gx: 0.08, keep: 30 }, // coteau des Yuzus, 8 % vers l'ouest
  { x: 158, z: 18, r: 24, y: 14, gx: 0.165, keep: 30 }, // prairie du Levant, 10 → 18 vers l'est
  { x: 128.5, z: -93, r: 24, y: 14, gx: 0.223, gz: -0.2, keep: 25 }, // coteau du thé, 30 % vers le sud-ouest
  { x: -175, z: -5, r: 36, y: 10.5, gx: -0.105, keep: 30 }, // rizières, montent vers l'ouest
];

function anchorValue(a: Anchor, x: number, z: number) {
  return a.y + (a.gx ?? 0) * (x - a.x) + (a.gz ?? 0) * (z - a.z);
}

/** Fond de vallée : interpolation de Shepard sur les ancrages (exacte et plate dans chaque disque). */
export function valleyFloor(x: number, z: number) {
  let sw = 0, sv = 0;
  for (const a of A) {
    const d = Math.max(0, Math.hypot(x - a.x, z - a.z) - a.r);
    const w = 1 / (d * d + 0.02);
    sw += w;
    sv += w * anchorValue(a, x, z);
  }
  return sv / sw;
}

/** Poids de protection des plats (1 dedans, 0 au-delà de r + keep). */
function keepWeight(x: number, z: number) {
  let k = 0;
  for (const a of A) {
    if (!a.keep) continue;
    const d = Math.hypot(x - a.x, z - a.z);
    k = Math.max(k, smoothstep(a.r + a.keep, a.r, d));
  }
  return k;
}

// =============================================================================================== COLLINES
interface Hill { x: number; z: number; r: number; base: number; y: number }
const HILLS: Hill[] = [
  { x: -42, z: -116, r: 12, base: 60, y: 24 }, // colline de la Pagode
  { x: -100, z: -190, r: 26, base: 64, y: 31 }, // plateau des Susuki
  { x: 176, z: -168, r: 7, base: 80, y: 60 }, // éperon du Belvédère
];
const hillProfile = (u: number) => 1 - (0.55 * u + 0.45 * smoothstep(0, 1, u));

// =============================================================================================== COULOIRS DES COLS
/**
 * Tracés conseillés des six axes, de la porte (`asphaltFrom`) jusqu'au pied des montagnes côté région.
 * `y` = altitude de la chaussée, `hw` = demi-largeur du fond plat creusé. Pour Paris, New York et Londres,
 * le tracé fait un S derrière le col pour passer derrière un épaulement : aucune ligne de vue droite
 * depuis la place ou la pagode ne traverse le couloir. Pente ≤ 8 % environ.
 */
export interface ColRoute { axis: Axis; pts: XZ[]; y: number[]; hw: number[] }
const gate = (a: Axis) => VILLAGE_GATES.find((g) => g.axis === a)!.asphaltFrom;
export const COL_ROUTES: ColRoute[] = [
  {
    axis: 'paris',
    pts: [gate('paris'), [12, -200], [0, -300], [-40, -332], [-100, -345], [-122, -395], [-95, -455], [-45, -505]],
    y: [9.3, 15.5, 22, 22, 21, 18, 13, 8],
    hw: [6, 8, 30, 9, 8, 7, 7, 7],
  },
  {
    axis: 'newyork',
    pts: [gate('newyork'), [160, -40], [215, -70], [245, -115], [262, -152], [300, -110], [345, -75], [405, -55], [470, -110], [500, -200]],
    y: [7.8, 11.4, 16.4, 20.6, 23.6, 23, 22, 20, 16, 11],
    hw: [6, 7, 8, 12, 30, 9, 8, 8, 8, 7],
  },
  {
    axis: 'desert',
    pts: [gate('desert'), [190, 124], [262, 150], [330, 176], [400, 200]],
    y: [7.4, 13.6, 19.6, 16, 12],
    hw: [6, 8, 35, 9, 7],
  },
  {
    axis: 'japan',
    pts: [gate('japan'), [-24, 156], [-15, 220], [0, 290], [5, 380], [0, 460]],
    y: [6.6, 6.8, 11.2, 16, 12, 8],
    hw: [5, 6, 12, 70, 12, 8],
  },
  {
    axis: 'pole',
    pts: [gate('pole'), [-165, 50], [-215, 95], [-260, 150], [-330, 190], [-400, 225]],
    y: [6.1, 9.8, 15.2, 21, 17, 12],
    hw: [6, 7, 8, 30, 9, 7],
  },
  {
    axis: 'london',
    pts: [gate('london'), [-145, -84], [-200, -112], [-262, -152], [-312, -125], [-372, -105], [-432, -140], [-472, -215]],
    y: [8.9, 12.6, 17.4, 23.6, 23.6, 21.5, 18, 12.5],
    hw: [6, 7, 8, 30, 9, 8, 8, 7],
  },
];
export const colRoute = (axis: string) => COL_ROUTES.find((r) => r.axis === axis);

// Chaque tracé se termine au point d'entrée de la région (même calcul que layout.ts : centre à 800 m,
// à 0,82 × cityRadius du centre), à l'altitude du sol de la région.
const REGION_EXIT: Record<Axis, { cityRadius: number; ground: number }> = {
  paris: { cityRadius: 280, ground: 6 }, newyork: { cityRadius: 280, ground: 6 }, desert: { cityRadius: 130, ground: 8 },
  japan: { cityRadius: 170, ground: 6 }, pole: { cityRadius: 140, ground: 4 }, london: { cityRadius: 260, ground: 6 },
};
for (const r of COL_ROUTES) {
  const b = COLS.find((c) => c.region === r.axis)!.bearing * deg0;
  const e = REGION_EXIT[r.axis];
  const d = 800 - e.cityRadius * 0.82;
  r.pts.push([Math.sin(b) * d, -Math.cos(b) * d]);
  r.y.push(e.ground);
  r.hw.push(7);
}

const ROUTE_BOX = COL_ROUTES.map((r) => {
  const xs = r.pts.map((p) => p[0]), zs = r.pts.map((p) => p[1]);
  return [Math.min(...xs) - 160, Math.min(...zs) - 160, Math.max(...xs) + 160, Math.max(...zs) + 160];
});

/** Épaulements derrière les cols des villes (crêtes en segment : hauteur de crête et demi-largeur à la base). */
const SHOULDERS: { a: XZ; b: XZ; y: number; hw: number }[] = [
  { a: [-60, -398], b: [95, -405], y: 100, hw: 55 }, // Paris
  { a: [300, -282], b: [402, -112], y: 150, hw: 70 }, // New York
  { a: [-300, -265], b: [-408, -155], y: 105, hw: 55 }, // Londres
];

// =============================================================================================== TORRENT
const NSEG = STREAM.length - 1;
/** Classe des tronçons : 0 gorge (rapides), 1 seuil, 2 village (murs), 3 sud (berges naturelles), 4 étang. */
const SEG_KIND: number[] = Array.from({ length: NSEG }, (_, i) => (i <= 10 ? 0 : i === 11 ? 1 : i <= 16 ? 2 : i <= 22 ? 3 : 4));
const isCascadeSeg = (i: number) => Math.abs(STREAM_WATER_Y[i] - STREAM_WATER_Y[i + 1]) > 0.9 && Math.hypot(STREAM[i + 1][0] - STREAM[i][0], STREAM[i + 1][1] - STREAM[i][1]) < 3;
const SEG_DEPTH = SEG_KIND.map((k) => (k === 2 ? STREAM_BED_DEPTH.village : k === 3 ? 0.6 : STREAM_BED_DEPTH.rapids));

/** Point du torrent le plus proche : distance à l'axe, altitude de l'eau, largeur mouillée, tronçon. */
// Cache : segment le plus proche par cellule de 2 m autour du torrent (accélère streamInfo).
const SC = 2, SB = { x0: 0, z0: 0, nx: 0, nz: 0 };
let segCache: Int8Array | null = null;
function buildSegCache() {
  let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
  for (const [x, z] of STREAM) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }
  SB.x0 = minx - 150; SB.z0 = minz - 150;
  SB.nx = Math.ceil((maxx - minx + 300) / SC) + 1; SB.nz = Math.ceil((maxz - minz + 300) / SC) + 1;
  segCache = new Int8Array(SB.nx * SB.nz);
  for (let j = 0; j < SB.nz; j++)
    for (let i = 0; i < SB.nx; i++) segCache[j * SB.nx + i] = polyNearest(SB.x0 + i * SC, SB.z0 + j * SC, STREAM).i;
}
const FAR = { d: 1e9, i: NSEG - 1, t: 0, waterY: 0, width: 10, kind: 4, walled: false };

export function streamInfo(x: number, z: number) {
  if (!segCache) buildSegCache();
  const ci = Math.round((x - SB.x0) / SC), cj = Math.round((z - SB.z0) / SC);
  if (ci < 0 || cj < 0 || ci >= SB.nx || cj >= SB.nz) return FAR;
  const c = segCache![cj * SB.nx + ci];
  let best = Infinity, i = c, t = 0;
  for (let k = Math.max(0, c - 2); k <= Math.min(NSEG - 1, c + 2); k++) {
    const [ax, az] = STREAM[k], [bx, bz] = STREAM[k + 1];
    const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1e-9;
    const tt = clamp(((x - ax) * vx + (z - az) * vz) / l2, 0, 1);
    const dx = x - ax - vx * tt, dz = z - az - vz * tt, d2 = dx * dx + dz * dz;
    if (d2 < best) { best = d2; i = k; t = tt; }
  }
  return {
    d: Math.sqrt(best),
    i,
    t,
    waterY: lerp(STREAM_WATER_Y[i], STREAM_WATER_Y[i + 1], t),
    width: lerp(STREAM_WIDTHS[i], STREAM_WIDTHS[i + 1], t),
    kind: SEG_KIND[i],
    walled: SEG_KIND[i] === 2,
  };
}

/** Altitude de la surface du torrent au point (x, z), ou null hors du lit mouillé (marge en m). */
export function streamWaterAt(x: number, z: number, margin = 0): number | null {
  const s = streamInfo(x, z);
  if (s.kind === 4 || s.d > s.width / 2 + margin) return null;
  return s.waterY;
}

/** Altitude du fond du lit (sous l'eau) au point le plus proche de l'axe. */
export function streamBedAt(x: number, z: number) {
  const s = streamInfo(x, z);
  return s.waterY - SEG_DEPTH[s.i] - poolDepthAt(x, z);
}

/** Surcreusement des vasques au pied des cascades (m, 0 ailleurs). */
const POOLS = CASCADES.filter((c) => c.bottom > 0.01).map((c) => {
  const k = STREAM.findIndex(([px, pz]) => Math.hypot(px - c.x, pz - c.z) < 2.5);
  const [bx, bz] = STREAM[k + 1], [nx, nz] = STREAM[Math.min(STREAM.length - 1, k + 2)];
  const l = Math.hypot(nx - bx, nz - bz) || 1;
  const fx = (nx - bx) / l, fz = (nz - bz) / l;
  return { cx: bx + fx * c.width * 0.7, cz: bz + fz * c.width * 0.7, fx, fz, w: c.width };
});
function poolDepthAt(x: number, z: number) {
  let best = 0;
  for (const p of POOLS) {
    const dx = x - p.cx, dz = z - p.cz;
    if (Math.abs(dx) > 12 || Math.abs(dz) > 12) continue;
    const along = dx * p.fx + dz * p.fz, side = -dx * p.fz + dz * p.fx;
    const e = Math.hypot(along / (p.w * 1.1), side / (p.w * 0.42));
    best = Math.max(best, (STREAM_BED_DEPTH.pools - STREAM_BED_DEPTH.rapids) * smoothstep(1, 0.35, e));
  }
  return best;
}

// =============================================================================================== RELIEF DOUX
const deg = Math.PI / 180;

function crown(x: number, z: number) {
  const r = Math.hypot(x, z);
  const th = Math.atan2(x, -z); // cap en radians
  const nr = fbm(Math.cos(th) * 1.7 + 3, Math.sin(th) * 1.7 - 2, 3);
  const rc = 335 + 18 * nr;
  const hc = 92 + 26 * fbm(Math.cos(th) * 2.3 - 5, Math.sin(th) * 2.3 + 1, 3);
  const sIn = smoothstep(rc - 160, rc, r), sOut = smoothstep(rc + 150, rc, r);
  let h = hc * Math.pow(Math.min(sIn, sOut), 1.25);
  for (const p of PEAKS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d >= p.base) continue;
    const u = d / p.base;
    h = smax(h, p.y * (1 - u * u) * (1 - u * u), 10);
  }
  for (const s of SHOULDERS) {
    const vx = s.b[0] - s.a[0], vz = s.b[1] - s.a[1];
    const t = clamp(((x - s.a[0]) * vx + (z - s.a[1]) * vz) / (vx * vx + vz * vz), 0, 1);
    const d = Math.hypot(x - s.a[0] - vx * t, z - s.a[1] - vz * t);
    if (d >= s.hw) continue;
    const u = d / s.hw;
    const crest = s.y * (0.82 + 0.18 * Math.sin(t * Math.PI));
    h = smax(h, crest * (1 - u * u) * (1 - u * u), 10);
  }
  // relief de détail : crêtes et ravines
  const rid = ridged(x / 140 + 7.3, z / 140 - 2.1, 4);
  h += h * 0.22 * (rid - 0.55) + 2.5 * fbm(x / 35, z / 35, 2) * smoothstep(5, 40, h);
  return Math.max(0, h);
}

/** Creusement des couloirs des axes (min). */
function routeCarve(x: number, z: number, h: number) {
  for (let k = 0; k < COL_ROUTES.length; k++) {
    const rt = COL_ROUTES[k], bb = ROUTE_BOX[k];
    if (x < bb[0] || x > bb[2] || z < bb[1] || z > bb[3]) continue;
    const n = polyNearest(x, z, rt.pts);
    if (n.d > 160) continue;
    const i = n.i, t = n.t;
    const bed = lerp(rt.y[i], rt.y[i + 1], t);
    const hw = lerp(rt.hw[i], rt.hw[i + 1], t);
    // fond plat (chaussée et bas-côtés), flancs de vallon irréguliers puis versant raide
    const e = Math.max(0, n.d - hw + 7 * fbm(x / 45 + k, z / 45, 2));
    const side = e < 22 ? e * e * 0.035 + e * 0.35 : 24.6 + (e - 22) * 1.9;
    const lim = bed + side;
    if (lim < h) h = smin(h, lim, 5);
    // remblai sous la chaussée si le terrain est plus bas
    const fill = bed - Math.max(0, n.d - hw) * 0.7;
    if (fill > h && n.d < hw + 25) h = smax(h, fill, 2);
  }
  return h;
}

/** Vallée du torrent (V de la gorge, berges douces ailleurs) : altitude maximale au voisinage du lit. */
function streamValley(x: number, z: number, h: number) {
  const s = streamInfo(x, z);
  if (s.kind === 4 || s.d > 140) return h;
  const e = Math.max(0, s.d - s.width / 2 - 0.4);
  const gorge = smoothstep(-96, -128, z);
  const wall = 13 * (0.8 + 0.5 * (noise2(s.i * 0.7 + s.t, 3.3) * 0.5 + 0.5));
  const vG = e < 9 ? e * (wall / 9) : e < 32 ? wall + (e - 9) * 0.55 : wall + 12.65 + (e - 32) * 2.2;
  const vS = e < 25 ? 0.9 + 0.3 * e : 8.4 + (e - 25) * 1.5;
  const lim = s.waterY + lerp(vS, vG, gorge);
  return lim < h ? smin(h, lim, 1.5) : h;
}

/** Fenêtre sur le mont Fuji : caps 163° à 192° vus de la place, sous 2° au-dessus de l'horizon (œil à 7 m). */
function fujiWindow(x: number, z: number, h: number) {
  const r = Math.hypot(x, z);
  if (r < 140 || r > 900) return h;
  const b = ((Math.atan2(x, -z) / deg) + 360) % 360;
  const w = smoothstep(159, 164, b) * smoothstep(196, 191, b) * smoothstep(900, 780, r);
  if (w <= 0) return h;
  const lim = 6.6 + 0.032 * r;
  return h > lim ? lerp(h, lim, w) : h;
}

/** Poids de la vallée par rapport au relief général du monde. */
export function valleyWeight(x: number, z: number) {
  return smoothstep(560, 470, Math.hypot(x, z));
}

/**
 * Relief doux de la vallée, raccordé au relief général `world` (déjà calculé, régions voisines comprises).
 * Ne contient pas les détails nets (voir stampDetail).
 */
export function valleySmooth(x: number, z: number, world: number) {
  const r = Math.hypot(x, z);
  const floor = valleyFloor(x, z);
  // fond de vallée → relief du monde au-delà de la couronne
  const wIn = smoothstep(330, 230, r);
  let h = lerp(world, floor + 1.2 * fbm(x / 60, z / 60, 2) * smoothstep(60, 160, r), wIn);
  // collines
  for (const hl of HILLS) {
    const d = Math.hypot(x - hl.x, z - hl.z);
    if (d >= hl.base) continue;
    const u = clamp((d - hl.r) / (hl.base - hl.r), 0, 1);
    const top = hl.y + (u > 0 ? 1.6 * fbm(x / 25, z / 25, 2) * u * (1 - u) * 4 : 0);
    h = Math.max(h, lerp(floor, top, hillProfile(u)));
  }
  // couronne de montagnes (sauf sur les plats protégés)
  const c = crown(x, z);
  const k = keepWeight(x, z);
  h = lerp(smax(h, c, 8), h, k);
  h = routeCarve(x, z, h);
  h = streamValley(x, z, h);
  h = fujiWindow(x, z, h);
  return h;
}

// =============================================================================================== TAMPONS NETS
/** Grille sur laquelle on applique les tampons. */
export interface Grid { h: Float32Array; x0: number; z0: number; cell: number; nx: number; nz: number }

function forBox(g: Grid, minx: number, minz: number, maxx: number, maxz: number, fn: (idx: number, x: number, z: number) => void) {
  const i0 = Math.max(0, Math.floor((minx - g.x0) / g.cell)), i1 = Math.min(g.nx - 1, Math.ceil((maxx - g.x0) / g.cell));
  const j0 = Math.max(0, Math.floor((minz - g.z0) / g.cell)), j1 = Math.min(g.nz - 1, Math.ceil((maxz - g.z0) / g.cell));
  for (let j = j0; j <= j1; j++) {
    const z = g.z0 + j * g.cell;
    for (let i = i0; i <= i1; i++) fn(j * g.nx + i, g.x0 + i * g.cell, z);
  }
}

export function sampleGrid(g: Grid, x: number, z: number) {
  const fx = clamp((x - g.x0) / g.cell, 0, g.nx - 1.001), fz = clamp((z - g.z0) / g.cell, 0, g.nz - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
  const o = j * g.nx + i;
  return lerp(lerp(g.h[o], g.h[o + 1], tx), lerp(g.h[o + g.nx], g.h[o + g.nx + 1], tx), tz);
}

/** Plat rectangulaire orienté : altitude y dans le rectangle (+ marge), raccord en `blend` m. */
function flatRect(g: Grid, cx: number, cz: number, w: number, d: number, yaw: number, y: number, margin: number, blend: number) {
  const R = Math.hypot(w, d) / 2 + margin + blend;
  forBox(g, cx - R, cz - R, cx + R, cz + R, (idx, x, z) => {
    const s = rectSdf(x, z, cx, cz, w, d, yaw) - margin;
    if (s >= blend) return;
    const t = s <= 0 ? 1 : smoothstep(blend, 0, s);
    g.h[idx] = lerp(g.h[idx], y, t);
  });
}
function flatDisk(g: Grid, cx: number, cz: number, r: number, y: number, blend: number) {
  forBox(g, cx - r - blend, cz - r - blend, cx + r + blend, cz + r + blend, (idx, x, z) => {
    const s = Math.hypot(x - cx, z - cz) - r;
    if (s >= blend) return;
    g.h[idx] = lerp(g.h[idx], y, s <= 0 ? 1 : smoothstep(blend, 0, s));
  });
}

/** Orientation corrigée des terrasses de thé : la longueur suit les courbes de niveau (voir compte rendu). */
export function teaYaw(f: { yaw: number }) {
  return f.yaw - Math.PI / 2;
}

/** Bâtiments sans plateforme propre (posés sur un plat déjà défini, sur l'eau ou sur le bassin). */
const NO_PAD = new Set(['pagode', 'shoro', 'haiden', 'honden', 'temizuya', 'chashitsu', 'belvedere', 'rotenburo-toit', 'puits', 'ashiyu', 'yatai-1', 'yatai-2', 'yatai-3']);
/** Altitudes imposées de certaines plateformes (ALTITUDES de la bible). */
const PAD_Y: Record<string, number> = { moulin: 7.5, 'grand-ryokan': 6.5, gassho: 7 };

/** Altitude retenue pour la plateforme de chaque bâtiment (remplie pendant la cuisson). */
export const PADS: Record<string, number> = {};

function pondE(x: number, z: number) {
  return Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz);
}

function pathWidthBlend(kind: string) {
  return kind === 'rue' ? { win: 7, blend: 1.4 } : kind === 'sentier' ? { win: 5, blend: 2.5 } : kind === 'sando' ? { win: 2, blend: 1.5 } : { win: 4, blend: 1.6 };
}

/** Applique tous les tampons nets sur la grille de détail (déjà remplie avec le relief doux). */
export const stampTimings: Record<string, number> = {};
export function stampDetail(g: Grid) {
  let t0 = performance.now();
  const lap = (k: string) => { const n = performance.now(); stampTimings[k] = Math.round(n - t0); t0 = n; };
  // ---------------------------------------------------------------- étang : cuvette, berges, escarpement est, îlot
  {
    const isl = POND.island;
    forBox(g, POND.x - POND.rx * 1.7, POND.z - POND.rz * 1.7, POND.x + POND.rx * 1.7, POND.z + POND.rz * 1.7, (idx, x, z) => {
      const e = pondE(x, z) + 0.035 * noise2(x / 9, z / 9);
      const phi = Math.atan2((z - POND.z) / POND.rz, (x - POND.x) / POND.rx);
      const esc = smoothstep(-0.65, -0.3, phi) * smoothstep(1.65, 1.3, phi);
      let h = g.h[idx];
      if (e < 1) {
        const soft = -POND.depth + POND.depth * smoothstep(0.5, 0.985, e);
        const steep = -POND.depth - 0.4 + (POND.depth + 0.4) * smoothstep(0.86, 0.995, e);
        h = lerp(soft, steep, esc) - 0.06;
      } else if (e < 1.7) {
        const rim = Math.max(h, 0.55 + (e - 1) * 3);
        const cliff = lerp(0.55, 5.6 + 0.6 * noise2(x / 6, z / 6), smoothstep(1.0, 1.05, e));
        const t = smoothstep(1.7, 1.25, e);
        h = lerp(h, Math.max(lerp(rim, cliff, esc), h * (1 - esc) + 0 * esc), t);
        if (esc > 0.01) h = Math.max(h, lerp(h, cliff, esc * smoothstep(1.3, 1.08, e)));
        h = Math.max(h, 0.55);
      }
      // îlot à la lanterne
      const di = Math.hypot(x - isl.x, z - isl.z);
      if (di < isl.r + 1.5) h = Math.max(h, lerp(-0.6, 0.9, smoothstep(isl.r + 1.2, isl.r - 2, di)));
      g.h[idx] = h;
    });
  }
  // avancée rocheuse de la maison de thé de l'étang (sol à 3,5 ; l'engawa sur pilotis surplombe l'eau)
  forBox(g, -112, 54, -88, 80, (idx, x, z) => {
    const n = polyNearest(x, z, [[-100, 68], [-95, 60]]);
    const s = n.d - 3.6;
    if (s > 3) return;
    g.h[idx] = Math.max(g.h[idx], lerp(g.h[idx], 3.5, s <= 0 ? 1 : smoothstep(3, 0, s) * 0.92));
  });
  // ---------------------------------------------------------------- plats exacts
  const exactFlats = () => {
    forBox(g, PLAZA.x - PLAZA.halfX - 8, PLAZA.z - PLAZA.halfZ - 8, PLAZA.x + PLAZA.halfX + 8, PLAZA.z + PLAZA.halfZ + 8, (idx, x, z) => {
      const s = plazaSdf(x, z) - 1;
      if (s >= 6) return;
      g.h[idx] = lerp(g.h[idx], PLAZA.y, s <= 0 ? 1 : smoothstep(6, 0, s));
    });
    flatRect(g, -30, -87.5, 26, 27, 0, 12, 0, 3); // terrasse du sanctuaire (et estrade du honden)
    flatDisk(g, -42, -116, 12, 24, 3); // sommet de la pagode
    flatDisk(g, 176, -168, 7, 60, 3); // belvédère
    flatDisk(g, HOT_SPRING_POOL.x, HOT_SPRING_POOL.z, HOT_SPRING_POOL.r + 4, HOT_SPRING_POOL.deckY, 4); // plancher du rotenburo
  };
  exactFlats();
  // mur ishigaki de 3 m au sud de la terrasse : pied à 9 m
  forBox(g, -47, -74, -13, -58, (idx, x, z) => {
    const lat = smoothstep(-47, -43, x) * smoothstep(-13, -17, x);
    const along = z < -73.7 ? 0 : smoothstep(-60, -67, z);
    if (along <= 0 || lat <= 0) return;
    g.h[idx] = lerp(g.h[idx], Math.min(g.h[idx], 9), along * lat);
  });
  flatRect(g, YUBATAKE.x, YUBATAKE.z, YUBATAKE.w, YUBATAKE.d, YUBATAKE.yaw, YUBATAKE.y, 0.5, 3);
  // gradins des rizières (du bas vers le haut) et diguettes de 0,35 m
  for (const f of FIELDS) {
    if (f.kind === 'riziere') {
      flatRect(g, f.x, f.z, f.w, f.d, f.yaw, f.y!, -0.05, 0.45);
      const R = Math.hypot(f.w, f.d) / 2 + 1;
      forBox(g, f.x - R, f.z - R, f.x + R, f.z + R, (idx, x, z) => {
        const s = rectSdf(x, z, f.x, f.z, f.w, f.d, f.yaw);
        if (s > -0.15 || s < -0.75) return;
        g.h[idx] = f.y! + 0.35 * smoothstep(-0.75, -0.5, s) * smoothstep(-0.15, -0.3, s);
      });
    } else if (f.kind === 'the') flatRect(g, f.x, f.z, f.w, f.d, teaYaw(f), f.y!, 0.2, 1.1);
    else if (f.kind === 'potager' || f.kind === 'jardin-sec' || f.kind === 'jardin-mousse') {
      flatRect(g, f.x, f.z, f.w, f.d, f.yaw, sampleGrid(g, f.x, f.z), 0.3, 2);
    }
  }
  lap('etang+plats');
  // ---------------------------------------------------------------- falaises (interrompues au passage des chemins)
  const cliffPaths = ['chemin-susuki-nord', 'sentier-belvedere', 'torii-mille'].map((id) => PATHS.find((p) => p.id === id)!.pts);
  const cliff = (cx: number, cz: number, nx: number, nz: number, len: number, drop: number) => {
    const R = len + 14;
    const top = sampleGrid(g, cx - nx * 1.5, cz - nz * 1.5);
    forBox(g, cx - R, cz - R, cx + R, cz + R, (idx, x, z) => {
      const s = (x - cx) * nx + (z - cz) * nz, t = -(x - cx) * nz + (z - cz) * nx;
      if (s < -0.3 || s > 12) return;
      let w = smoothstep(len, len * 0.6, Math.abs(t));
      for (const p of cliffPaths) w *= smoothstep(4, 9, polyNearest(x, z, p).d);
      if (w <= 0) return;
      const dropN = drop * (0.85 + 0.3 * (noise2(t / 5, 1.7) * 0.5 + 0.5));
      const foot = top - dropN + 0.35 * Math.max(0, s - 0.6);
      const target = s < 0.2 ? g.h[idx] : Math.min(g.h[idx], foot);
      g.h[idx] = lerp(g.h[idx], target, w * smoothstep(12, 7, s));
    });
  };
  cliff(-46, -134, -Math.SQRT1_2, -Math.SQRT1_2, 14, 8); // falaise de la Pagode (face nord-ouest)
  cliff(168.5, -168, -0.95, -0.3, 13, 15); // falaise du Belvédère (face ouest, au-dessus de la gorge)
  lap('falaises');
  // ---------------------------------------------------------------- chemins : profil en long lissé, dévers nul
  for (const p of PATHS) {
    if (p.kind === 'axe') continue;
    const { win, blend } = pathWidthBlend(p.kind);
    const hw = p.width / 2 + 0.3;
    const len = p.pts.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - p.pts[i][0], q[1] - p.pts[i][1]), 0);
    const n = Math.max(2, Math.ceil(len));
    const sx: number[] = [], sz: number[] = [];
    let ys: number[] = [];
    for (let k = 0; k <= n; k++) {
      const a = pointAlong(p.pts, (k / n) * len);
      sx.push(a.x); sz.push(a.z); ys.push(sampleGrid(g, a.x, a.z));
    }
    for (let pass = 0; pass < 2; pass++) {
      const o = ys.slice();
      for (let k = 0; k <= n; k++) {
        let s = 0, c = 0;
        for (let q = -win; q <= win; q++) { s += ys[clamp(k + q, 0, n)]; c++; }
        o[k] = s / c;
      }
      ys = o;
    }
    for (let k = 0; k < n; k++) {
      const ax = sx[k], az = sz[k], bx = sx[k + 1], bz = sz[k + 1];
      const R = hw + blend;
      forBox(g, Math.min(ax, bx) - R, Math.min(az, bz) - R, Math.max(ax, bx) + R, Math.max(az, bz) + R, (idx, x, z) => {
        const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1e-9;
        const t = clamp(((x - ax) * vx + (z - az) * vz) / l2, 0, 1);
        const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
        if (d > R) return;
        const st = streamInfo(x, z);
        if (st.kind !== 4 && st.d < st.width / 2 + 1.2) return; // pont : on ne comble pas le lit
        if (pondE(x, z) < 1.03) return;
        const w = d <= hw ? 1 : smoothstep(R, hw, d);
        g.h[idx] = lerp(g.h[idx], lerp(ys[k], ys[k + 1], t), w);
      });
    }
  }
  lap('chemins');
  // ---------------------------------------------------------------- emprises des bâtiments (plateformes de niveau)
  for (const b of BUILDINGS) {
    if (NO_PAD.has(b.id)) continue;
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    const y = PAD_Y[b.id] ?? sampleGrid(g, b.x + fx * (b.d / 2 + 0.6), b.z + fz * (b.d / 2 + 0.6));
    PADS[b.id] = y;
    flatRect(g, b.x, b.z, b.w, b.d, b.yaw, y, 0.6, 1.4);
  }
  exactFlats();
  // points de contrôle de la bible (portes, ferme…) : petits plats exacts
  for (const a of ALTITUDES) {
    if (a.what.includes('rotenburo') || a.what.includes('thé')) continue;
    flatDisk(g, a.x, a.z, 2.5, a.y, 6);
  }
  lap('batiments');
  // ---------------------------------------------------------------- source chaude : bassin
  forBox(g, HOT_SPRING_POOL.x - 10, HOT_SPRING_POOL.z - 10, HOT_SPRING_POOL.x + 10, HOT_SPRING_POOL.z + 10, (idx, x, z) => {
    const d = Math.hypot(x - HOT_SPRING_POOL.x, z - HOT_SPRING_POOL.z);
    if (d > HOT_SPRING_POOL.r + 0.3) return;
    g.h[idx] = lerp(HOT_SPRING_POOL.waterY - 0.75, HOT_SPRING_POOL.deckY, smoothstep(HOT_SPRING_POOL.r - 2.2, HOT_SPRING_POOL.r + 0.3, d));
  });
  lap('source');
  // ---------------------------------------------------------------- torrent : lit, murs du village, berges, vasques, bief
  {
    let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
    for (const [x, z] of STREAM) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }
    const band = 10;
    forBox(g, minx - band, minz - band, maxx + band, maxz + band, (idx, x, z) => {
      const s = streamInfo(x, z);
      if (s.kind === 4) return;
      const hw = s.width / 2;
      if (s.d > hw + 6) return;
      let h = g.h[idx];
      const depth = SEG_DEPTH[s.i] + poolDepthAt(x, z);
      if (s.walled) {
        if (s.d < hw) h = s.waterY - depth + 0.12 * smoothstep(hw - 1, hw, s.d);
        else h = Math.max(h, s.waterY + 1.3);
      } else {
        if (s.d < hw) h = s.waterY - depth + depth * smoothstep(hw - 1.3, hw, s.d) - (isCascadeSeg(s.i) ? 0.1 : 0);
        else {
          const x2 = s.d - hw;
          h = Math.max(Math.min(h, s.waterY + 0.1 + 0.5 * x2 + 3 * Math.max(0, x2 - 3)), s.waterY + 0.1 + 0.3 * x2);
        }
      }
      g.h[idx] = h;
    });
    // bief du moulin : canal de 2,6 m le long de la roue
    forBox(g, 54, -79, 60, -64, (idx, x, z) => {
      const s = rectSdf(x, z, 57.2, -71.5, 2.6, 12, 0);
      if (s < 0) g.h[idx] = Math.min(g.h[idx], 4.6);
    });
  }
  lap('torrent');
}

// =============================================================================================== COUCHES DE SURFACE
/**
 * Couches de surface de la grille de détail (1 texel par `cell` m) : R roche, G galets, B terre, A sous-bois,
 * plus un canal d'humidité (bord de l'eau). L'herbe est le complément ; elle devient herbe rase moussue dans le village.
 */
export function bakeDetailSurfaces(g: Grid, cell: number) {
  const nx = Math.round((DETAIL.x1 - DETAIL.x0) / cell) + 1, nz = Math.round((DETAIL.z1 - DETAIL.z0) / cell) + 1;
  const out = new Uint8Array(nx * nz * 4);
  const wet = new Uint8Array(nx * nz);
  const S: Grid = { h: new Float32Array(0), x0: DETAIL.x0, z0: DETAIL.z0, cell, nx, nz };
  const put = (idx: number, c: number, v: number) => { const o = idx * 4 + c; out[o] = Math.max(out[o], clamp(v, 0, 1) * 255); };
  // pente et sous-bois (par texel)
  for (let j = 0; j < nz; j++) {
    const z = DETAIL.z0 + j * cell;
    for (let i = 0; i < nx; i++) {
      const x = DETAIL.x0 + i * cell;
      const e = 1.0;
      const gx = (sampleGrid(g, x + e, z) - sampleGrid(g, x - e, z)) / (2 * e), gz = (sampleGrid(g, x, z + e) - sampleGrid(g, x, z - e)) / (2 * e);
      const slope = Math.hypot(gx, gz);
      const n = noise2(x / 7, z / 7) * 0.5 + 0.5;
      const idx = j * nx + i;
      put(idx, 0, smoothstep(0.78 + 0.15 * n, 1.12 + 0.15 * n, slope));
      const h = sampleGrid(g, x, z), r = Math.hypot(x, z);
      let f = 0;
      const nf = 10 * noise2(x / 23, z / 23);
      for (const b of FOREST_BELTS) {
        if (b.kind === 'bambous') continue;
        f = Math.max(f, smoothstep(b.r + 6, b.r - 12, Math.hypot(x - b.x, z - b.z) + nf));
      }
      // forêts de montagne : au-dessus du fond de vallée, sauf crêtes rocheuses
      f = Math.max(f, smoothstep(16, 30, h + 8 * noise2(x / 40 + 3, z / 40)) * smoothstep(150, 210, r) * smoothstep(1.0, 0.7, slope));
      put(idx, 3, f * (0.75 + 0.25 * n));
    }
  }
  // torrent : galets sur le lit et les berges, humidité
  {
    let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
    for (const [x, z] of STREAM) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }
    forBox(S, minx - 12, minz - 12, maxx + 12, maxz + 12, (idx, x, z) => {
      const s = streamInfo(x, z);
      if (s.kind === 4) return;
      const x2 = s.d - s.width / 2;
      if (x2 > 8) return;
      const n = noise2(x / 3, z / 3) * 0.5 + 0.5;
      if (s.walled) put(idx, 1, x2 < 0.2 ? 1 : 0);
      else put(idx, 1, smoothstep(1.8 + 2.2 * n, 0.3, x2));
      wet[idx] = Math.max(wet[idx], smoothstep(1.6, -0.2, x2) * 255);
    });
  }
  // étang : plage de galets sur les berges douces, vase au fond ; source chaude
  forBox(S, POND.x - POND.rx * 1.4, POND.z - POND.rz * 1.4, POND.x + POND.rx * 1.4, POND.z + POND.rz * 1.4, (idx, x, z) => {
    const e = pondE(x, z) + 0.035 * noise2(x / 9, z / 9);
    const n = noise2(x / 4, z / 4) * 0.5 + 0.5;
    put(idx, 1, smoothstep(0.86, 0.95, e) * smoothstep(1.06 + 0.06 * n, 1.0, e));
    put(idx, 2, smoothstep(0.9, 0.8, e));
    wet[idx] = Math.max(wet[idx], smoothstep(1.06, 0.97, e) * 255);
  });
  forBox(S, HOT_SPRING_POOL.x - 12, HOT_SPRING_POOL.z - 12, HOT_SPRING_POOL.x + 12, HOT_SPRING_POOL.z + 12, (idx, x, z) => {
    const d = Math.hypot(x - HOT_SPRING_POOL.x, z - HOT_SPRING_POOL.z);
    put(idx, 1, smoothstep(HOT_SPRING_POOL.r + 1.5, HOT_SPRING_POOL.r, d));
    wet[idx] = Math.max(wet[idx], smoothstep(HOT_SPRING_POOL.r + 0.8, HOT_SPRING_POOL.r - 0.5, d) * 255);
  });
  // chemins : terre tassée (sentiers, gravier) ; sous les dallages, terre ; pas japonais dans la mousse
  for (const p of PATHS) {
    const hw = p.width / 2;
    const ext = p.surface === 'terre' || p.surface === 'gravier' ? 0.8 : 0.5;
    for (let k = 0; k < p.pts.length - 1; k++) {
      const [ax, az] = p.pts[k], [bx, bz] = p.pts[k + 1];
      const R = hw + ext + 1.5;
      forBox(S, Math.min(ax, bx) - R, Math.min(az, bz) - R, Math.max(ax, bx) + R, Math.max(az, bz) + R, (idx, x, z) => {
        const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1e-9;
        const t = clamp(((x - ax) * vx + (z - az) * vz) / l2, 0, 1);
        const d = Math.hypot(x - ax - vx * t, z - az - vz * t) + 0.6 * noise2(x / 2.5, z / 2.5);
        const v = smoothstep(hw + ext, hw - 0.3, d);
        if (p.surface === 'pas-japonais') put(idx, 3, v * 0.6);
        else put(idx, 2, v);
      });
    }
  }
  // bas-côtés de gravier des axes
  for (const rt of COL_ROUTES) {
    for (let k = 0; k < rt.pts.length - 1; k++) {
      const [ax, az] = rt.pts[k], [bx, bz] = rt.pts[k + 1];
      const R = 9;
      forBox(S, Math.min(ax, bx) - R, Math.min(az, bz) - R, Math.max(ax, bx) + R, Math.max(az, bz) + R, (idx, x, z) => {
        const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1e-9;
        const t = clamp(((x - ax) * vx + (z - az) * vz) / l2, 0, 1);
        const d = Math.hypot(x - ax - vx * t, z - az - vz * t) + 0.8 * noise2(x / 3, z / 3);
        put(idx, 2, smoothstep(7.5, 5.5, d));
      });
    }
  }
  // champs, jardins, place
  for (const f of FIELDS) {
    const yaw = f.kind === 'the' ? teaYaw(f) : f.yaw;
    const R = Math.hypot(f.w, f.d) / 2 + 2;
    forBox(S, f.x - R, f.z - R, f.x + R, f.z + R, (idx, x, z) => {
      const s = rectSdf(x, z, f.x, f.z, f.w, f.d, yaw);
      if (f.kind === 'riziere' || f.kind === 'potager') put(idx, 2, smoothstep(0.1, -0.6, s));
      else if (f.kind === 'the') put(idx, 2, smoothstep(1.5, 0.5, s) * 0.55);
      else if (f.kind === 'jardin-sec') put(idx, 1, smoothstep(0.2, -0.3, s));
      else if (f.kind === 'jardin-mousse') put(idx, 3, smoothstep(0.4, -0.4, s) * 0.8);
    });
  }
  forBox(S, -40, -32, 40, 32, (idx, x, z) => put(idx, 2, smoothstep(0.5, -1, plazaSdf(x, z))));
  // bâtiments : terre sous l'emprise, galets en pied de mur (zone de pluie sous l'avant-toit)
  for (const b of BUILDINGS) {
    const R = Math.hypot(b.w, b.d) / 2 + 2;
    forBox(S, b.x - R, b.z - R, b.x + R, b.z + R, (idx, x, z) => {
      const s = rectSdf(x, z, b.x, b.z, b.w, b.d, b.yaw);
      put(idx, 2, smoothstep(0.2, -0.3, s));
      put(idx, 1, smoothstep(-0.3, 0.1, s) * smoothstep(1.2, 0.8, s));
    });
  }
  return { data: out, wet, nx, nz, cell };
}

/** Facteur « village » (herbe rase et moussue) : 1 dans le village, 0 dans la campagne. */
export function villageFactor(x: number, z: number) {
  return smoothstep(135, 105, Math.hypot(x, z));
}
