// Ciel procédural et cycle jour/nuit (spécialité Lumière & atmosphère).
// - Course du soleil de la bible §9 : lever au cap 110° (est-sud-est), midi plein sud à 60° d'élévation, coucher au cap 250°.
// - Palettes par moment (aube, jour, crépuscule, nuit) interpolées heure par heure : ciel, nuages, soleil, brouillard,
//   brume au sol, lumière ambiante, exposition et étalonnage (lus par postfx.ts).
// - Nuages en deux couches (cumulus éclairés par le soleil rasant, cirrus en filaments), étoiles, lune, aurores.
// API pour les autres spécialités : `ATMO` (état courant, voir SkyState), `sunDirectionAt(h)`, `lanternLevelAt(h)`.
import * as THREE from 'three';
import { clamp, damp, lerp, smoothstep } from '../core/math';

/** Heure de départ d'une nouvelle partie : 6 h 45, l'aube dorée des références. */
export const START_HOUR = 6.75;
export const SUNRISE = 6;
export const SUNSET = 19;
/** Lanternes : allumées à 18 h, éteintes à 7 h (bible §9). */
export const LANTERNS_ON = 18;
export const LANTERNS_OFF = 7;
const MAX_ELEV = (60 * Math.PI) / 180;
const DEG = Math.PI / 180;

const skyVert = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const skyFrag = /* glsl */ `
uniform vec3 uSunDir, uMoonDir;
uniform vec3 uZenith, uHorizon, uHorizonSun, uBelt, uGround, uSunColor, uCloudLit, uCloudShade;
uniform float uTime, uNight, uAurora, uCloudCover, uCirrus, uSunDisk, uStars;
varying vec3 vDir;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for(int i=0;i<5;i++){ s += a*vnoise(p); p = p*2.03 + 17.1; a *= 0.5; }
  return s;
}
float fbm3(vec2 p){
  float s = 0.0, a = 0.5;
  for(int i=0;i<3;i++){ s += a*vnoise(p); p = p*2.07 + 9.3; a *= 0.5; }
  return s;
}

void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  float mu = dot(d, uSunDir);
  float sunDot = max(mu, 0.0);
  // côté soleil / côté opposé (azimut) : l'horizon est plus chaud et plus clair vers le soleil
  vec2 dh = normalize(d.xz + 1e-5), sh = normalize(uSunDir.xz + 1e-5);
  float side = dot(dh, sh) * 0.5 + 0.5;
  float hp = clamp(h, 0.0, 1.0);
  vec3 hor = mix(uHorizon, uHorizonSun, pow(side, 2.2));
  // ceinture de Vénus : bande rose du côté opposé au soleil, juste au-dessus de l'horizon
  hor = mix(hor, uBelt, (1.0 - side) * smoothstep(0.0, 0.08, hp) * (1.0 - smoothstep(0.08, 0.35, hp)) * 0.85);
  vec3 col = mix(hor, uZenith, pow(hp, 0.42));
  // lueur d'horizon autour du soleil (diffusion de Mie, étirée sur l'horizon quand le soleil est bas)
  float low = 1.0 - smoothstep(0.0, 0.45, uSunDir.y);
  col += uSunColor * (pow(sunDot, 5.0) * 0.28 + pow(sunDot, 48.0) * 0.55 + pow(sunDot, 600.0) * 2.0) * (1.0 - uNight);
  col += uHorizonSun * pow(side, 6.0) * exp(-hp * 9.0) * low * 0.35 * (1.0 - uNight);
  // disque solaire (avec assombrissement du limbe)
  float disk = smoothstep(0.99955, 0.99972, mu);
  col += uSunColor * disk * uSunDisk * (0.7 + 0.3 * smoothstep(0.99972, 0.99995, mu));
  // sous l'horizon : on rejoint la couleur du brouillard (les montagnes s'y fondent)
  col = mix(col, uGround, smoothstep(0.0, -0.06, h));

  // étoiles et lune
  if (uStars > 0.01 && h > 0.0) {
    vec2 sp = d.xz / (d.y + 0.25) * 220.0;
    float hs = hash(floor(sp));
    float st = step(0.9965, hs) * (0.55 + 0.45 * sin(uTime * 2.0 + hs * 60.0));
    col += vec3(0.85, 0.9, 1.0) * st * uStars * smoothstep(0.0, 0.3, h) * 1.4;
    // voie lactée discrète
    float band = exp(-pow(dot(d, normalize(vec3(0.4, 0.25, -0.88))) * 3.2, 2.0));
    col += vec3(0.16, 0.18, 0.26) * band * fbm(d.xz / (d.y + 0.4) * 6.0) * uStars * 0.35;
  }
  float md = dot(d, uMoonDir);
  col += vec3(0.85, 0.9, 1.0) * smoothstep(0.99935, 0.9996, md) * 3.0 * uNight;
  col += vec3(0.32, 0.38, 0.55) * pow(max(md, 0.0), 24.0) * 0.35 * uNight;

  // aurores boréales
  if (uAurora > 0.01 && h > 0.0) {
    vec2 ap = d.xz / (d.y + 0.3);
    float band = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float w = sin(ap.x * (2.0 + fi) + uTime * (0.15 + fi * 0.05) + fbm(ap * 1.5 + fi) * 3.0) * 0.5 + 0.5;
      band += smoothstep(0.08, 0.0, abs(ap.y - 0.4 - fi * 0.25 - w * 0.35)) * (0.6 - fi * 0.15);
    }
    vec3 ac = mix(vec3(0.1, 1.0, 0.5), vec3(0.5, 0.2, 1.0), smoothstep(0.3, 1.2, ap.y));
    col += ac * band * uAurora * smoothstep(0.02, 0.2, h) * 1.4;
  }

  if (h > 0.0) {
    float fade = smoothstep(0.0, 0.16, h);
    // cirrus : filaments hauts, éclairés longtemps par le soleil sous l'horizon (rose à l'aube et au crépuscule)
    vec2 cq = d.xz / (d.y + 0.05) * 0.55 + vec2(uTime * 0.0025, uTime * 0.001);
    vec2 cr = vec2(cq.x * 0.9 + cq.y * 0.5, (cq.y - cq.x * 0.5) * 5.0);
    float ci = fbm3(cr + fbm3(cq * 1.7) * 1.4);
    float cirrus = smoothstep(0.52, 0.85, ci) * uCirrus * fade;
    vec3 ciCol = mix(uCloudShade, uCloudLit * 1.25, 0.55 + 0.45 * pow(side, 1.5)) + uSunColor * pow(sunDot, 8.0) * 0.6 * (1.0 - uNight);
    col = mix(col, ciCol, cirrus * 0.75);

    // cumulus : couche plane projetée, densité fbm, éclairage par l'épaisseur traversée vers le soleil
    vec2 cp = d.xz / (d.y + 0.11) * 1.25 + vec2(uTime * 0.004, uTime * 0.0015);
    float c = fbm(cp);
    float edge0 = 1.0 - uCloudCover;
    float cov = smoothstep(edge0, edge0 + 0.32, c);
    vec2 toSun = normalize(uSunDir.xz + 1e-4) * 0.06;
    float thick = 0.0;
    for (int k = 1; k <= 3; k++) thick += smoothstep(edge0, edge0 + 0.32, fbm(cp + toSun * float(k)));
    float lit = exp(-thick * 0.9);
    // bas des nuages éclairés par le soleil rasant, cœurs ombrés lavande, liseré argenté à contre-jour
    vec3 cloudCol = mix(uCloudShade, uCloudLit, lit);
    cloudCol += uSunColor * pow(sunDot, 6.0) * (1.0 - cov) * 1.4 * (1.0 - uNight);
    cloudCol = mix(cloudCol, hor, (1.0 - fade) * 0.6);
    col = mix(col, cloudCol, cov * fade * 0.94);
  }
  gl_FragColor = vec4(max(col, 0.0), 1.0);
  #include <colorspace_fragment>
}`;

type Moment = 'aube' | 'jour' | 'crepuscule' | 'nuit';

export interface SkyState {
  hour: number;
  /** Direction (unitaire) vers le soleil, même sous l'horizon. */
  sunDir: THREE.Vector3;
  /** Direction vers la lune. */
  moonDir: THREE.Vector3;
  /** Direction de la lumière directionnelle active (soleil le jour, lune la nuit), toujours au-dessus de l'horizon. */
  lightDir: THREE.Vector3;
  night: number; // 0 jour … 1 nuit
  dusk: number; // lumière rasante (aube ou crépuscule)
  /** 0..1 : poids de chaque moment (somme ≈ 1). */
  dawn: number;
  day: number;
  evening: number;
  moment: Moment;
  horizon: THREE.Color;
  zenith: THREE.Color;
  sunColor: THREE.Color;
  sunIntensity: number;
  /** Brouillard de distance (couleur moyenne, vers le soleil, à l'opposé) et densité de base (FogExp2). */
  fogColor: THREE.Color;
  fogSun: THREE.Color;
  fogAnti: THREE.Color;
  fogDensity: number;
  /** Brume au sol : couleur, densité (par mètre au niveau du fond de vallée), épaisseur (m). */
  mistColor: THREE.Color;
  mistDensity: number;
  mistHeight: number;
  /** Lumière ambiante (ciel / sol). */
  ambientSky: THREE.Color;
  ambientGround: THREE.Color;
  /** Niveau des lanternes allumées (0 éteintes … 1 allumées), suit l'horaire 18 h → 7 h. */
  lanterns: number;
  /** Réglages de rendu dérivés de la palette (lus par postfx.ts). */
  exposure: number;
  saturation: number;
  contrast: number;
  warmth: number;
  bloomThreshold: number;
  bloomIntensity: number;
  rays: number;
}

// ------------------------------------------------------------------------------------------ palettes
interface Key {
  h: number;
  zen: number; hor: number; horSun: number; belt: number;
  sun: number; sunI: number; disk: number;
  cLit: number; cShade: number; cover: number; cirrus: number; stars: number;
  fog: number; fogSun: number; fogAnti: number; fogD: number;
  mist: number; mistD: number; mistH: number;
  aSky: number; aGnd: number; hemi: number; env: number;
  exp: number; sat: number; con: number; warm: number; bloomT: number; bloomI: number; rays: number;
}
const NIGHT: Omit<Key, 'h'> = {
  zen: 0x0b1226, hor: 0x1a2440, horSun: 0x1e2a48, belt: 0x1a2440,
  sun: 0x8aa0d0, sunI: 0.55, disk: 0,
  cLit: 0x2c3858, cShade: 0x121a2e, cover: 0.38, cirrus: 0.2, stars: 1,
  fog: 0x18223a, fogSun: 0x1c2844, fogAnti: 0x161f36, fogD: 0.0019,
  mist: 0x34446a, mistD: 0.0026, mistH: 7,
  aSky: 0x4a64a8, aGnd: 0x22222e, hemi: 1.0, env: 0.7,
  exp: 2.1, sat: 0.04, con: 0.05, warm: -0.08, bloomT: 0.85, bloomI: 1.0, rays: 0,
};
const KEYS: Key[] = [
  { h: 0, ...NIGHT },
  { h: 4.6, ...NIGHT },
  // heure bleue avant le lever : la lueur monte à l'est
  { h: 5.5, zen: 0x26355e, hor: 0x8a7a92, horSun: 0xe09068, belt: 0x7a6a8a, sun: 0x8aa0d0, sunI: 0.0, disk: 0,
    cLit: 0xd08878, cShade: 0x4a4a6a, cover: 0.34, cirrus: 0.6, stars: 0.3,
    fog: 0x6a6a80, fogSun: 0xb08878, fogAnti: 0x56607e, fogD: 0.0024, mist: 0x8a8ca4, mistD: 0.0062, mistH: 6.5,
    aSky: 0x4a5a88, aGnd: 0x2a2630, hemi: 0.6, env: 0.65, exp: 1.6, sat: 0.1, con: 0.05, warm: 0.15, bloomT: 1.0, bloomI: 0.9, rays: 0.2 },
  // aube dorée (bible : horizon #f6b26b → #f8d0a0, zénith #8fa8c8, soleil #ffb070 2,2, ombres #6a7aa0, brume dense)
  { h: 6.3, zen: 0x7f9cc4, hor: 0xf2c4a0, horSun: 0xf6a860, belt: 0xe0aab0, sun: 0xffa060, sunI: 1.5, disk: 9,
    cLit: 0xffb27a, cShade: 0x7a7a9c, cover: 0.34, cirrus: 0.62, stars: 0,
    fog: 0xa8a6b2, fogSun: 0xf2b27c, fogAnti: 0x8494b4, fogD: 0.0025, mist: 0xaea6ae, mistD: 0.005, mistH: 6,
    aSky: 0x6a7aa0, aGnd: 0x6a5040, hemi: 0.75, env: 0.7, exp: 1.1, sat: 0.2, con: 0.08, warm: 0.38, bloomT: 1.6, bloomI: 0.6, rays: 1 },
  { h: 6.75, zen: 0x8fa8c8, hor: 0xf8d0a0, horSun: 0xf6b26b, belt: 0xe8b8b4, sun: 0xffb070, sunI: 2.2, disk: 10,
    cLit: 0xffc490, cShade: 0x8a8aa6, cover: 0.34, cirrus: 0.6, stars: 0,
    fog: 0xb4b2bc, fogSun: 0xf6c088, fogAnti: 0x8e9ebc, fogD: 0.0024, mist: 0xb8b0b4, mistD: 0.0048, mistH: 6,
    aSky: 0x6a7aa0, aGnd: 0x7a5a42, hemi: 0.7, env: 0.75, exp: 0.98, sat: 0.2, con: 0.08, warm: 0.36, bloomT: 1.8, bloomI: 0.55, rays: 1 },
  { h: 7.6, zen: 0x86a8d2, hor: 0xf0dcc0, horSun: 0xf4c088, belt: 0xd8c8c8, sun: 0xffc488, sunI: 2.6, disk: 10,
    cLit: 0xffe0c0, cShade: 0x9a9eb6, cover: 0.36, cirrus: 0.5, stars: 0,
    fog: 0xc4c6cc, fogSun: 0xf0d0a8, fogAnti: 0xa4b4c8, fogD: 0.0021, mist: 0xc8c6c6, mistD: 0.0032, mistH: 7,
    aSky: 0x7a8cb0, aGnd: 0x7a6048, hemi: 0.6, env: 0.85, exp: 1.08, sat: 0.19, con: 0.07, warm: 0.28, bloomT: 2.2, bloomI: 0.45, rays: 0.75 },
  { h: 9, zen: 0x6c9fd6, hor: 0xd8e4ec, horSun: 0xe8e6dc, belt: 0xd8e4ec, sun: 0xffeccc, sunI: 2.9, disk: 10,
    cLit: 0xffffff, cShade: 0xa6b0c4, cover: 0.4, cirrus: 0.3, stars: 0,
    fog: 0xc6d4e2, fogSun: 0xe6e6e0, fogAnti: 0xb2c4d8, fogD: 0.0017, mist: 0xe4eaf0, mistD: 0.0016, mistH: 7,
    aSky: 0x9cc4e8, aGnd: 0x6b5a3a, hemi: 0.4, env: 1.0, exp: 1.0, sat: 0.17, con: 0.06, warm: 0.14, bloomT: 3.0, bloomI: 0.35, rays: 0.25 },
  // plein jour (bible : soleil #fff4e0 3, ciel #9cc4e8, voile #d8e4ec)
  { h: 12.5, zen: 0x5f95d2, hor: 0xd8e4ec, horSun: 0xe4e8e8, belt: 0xd8e4ec, sun: 0xfff4e0, sunI: 3.0, disk: 10,
    cLit: 0xffffff, cShade: 0xa8b4c8, cover: 0.44, cirrus: 0.25, stars: 0,
    fog: 0xc8d6e4, fogSun: 0xe2e6e6, fogAnti: 0xb6c8dc, fogD: 0.0016, mist: 0xe4ecf2, mistD: 0.0011, mistH: 7,
    aSky: 0x9cc4e8, aGnd: 0x6b5a3a, hemi: 0.38, env: 1.0, exp: 1.0, sat: 0.16, con: 0.06, warm: 0.1, bloomT: 3.2, bloomI: 0.3, rays: 0.15 },
  { h: 16, zen: 0x6a9cd4, hor: 0xdce2e6, horSun: 0xece4d2, belt: 0xdce2e6, sun: 0xfff0d4, sunI: 2.9, disk: 10,
    cLit: 0xfffaf0, cShade: 0xa8b0c4, cover: 0.42, cirrus: 0.3, stars: 0,
    fog: 0xc8d2de, fogSun: 0xeae2d2, fogAnti: 0xb4c4d8, fogD: 0.0017, mist: 0xe4e6ea, mistD: 0.0013, mistH: 7,
    aSky: 0x98bce0, aGnd: 0x6b5a3a, hemi: 0.4, env: 1.0, exp: 1.0, sat: 0.17, con: 0.06, warm: 0.16, bloomT: 3.0, bloomI: 0.35, rays: 0.3 },
  // fin d'après-midi dorée
  { h: 17.3, zen: 0x6e90c4, hor: 0xf0d4ac, horSun: 0xf6b874, belt: 0xd8c0c0, sun: 0xffbc70, sunI: 2.5, disk: 10,
    cLit: 0xffd6a0, cShade: 0x9890ac, cover: 0.4, cirrus: 0.45, stars: 0,
    fog: 0xc6c0c0, fogSun: 0xf2c690, fogAnti: 0xa2acc4, fogD: 0.0019, mist: 0xdcd4cc, mistD: 0.0022, mistH: 7,
    aSky: 0x7f8cb4, aGnd: 0x74583e, hemi: 0.5, env: 0.9, exp: 1.08, sat: 0.2, con: 0.08, warm: 0.36, bloomT: 2.2, bloomI: 0.45, rays: 0.8 },
  // crépuscule (bible : soleil #ff8a40 1,8, ciel orange-rose-violet, ombres violettes, brume qui remonte des berges)
  { h: 18.4, zen: 0x4a5490, hor: 0xe8a07a, horSun: 0xfa8a4a, belt: 0xb08ab4, sun: 0xff8a40, sunI: 1.8, disk: 9,
    cLit: 0xf8a070, cShade: 0x625a88, cover: 0.38, cirrus: 0.6, stars: 0,
    fog: 0xa096a8, fogSun: 0xe89a6a, fogAnti: 0x8088aa, fogD: 0.0021, mist: 0xa89cac, mistD: 0.003, mistH: 7,
    aSky: 0x7a76b0, aGnd: 0x5a3c34, hemi: 0.75, env: 0.8, exp: 1.08, sat: 0.12, con: 0.07, warm: 0.22, bloomT: 1.5, bloomI: 0.65, rays: 1 },
  // après le coucher : lueur rouge à l'ouest, ciel violet
  { h: 19.3, zen: 0x2a3266, hor: 0x8e6a8c, horSun: 0xd8704a, belt: 0x6a5a88, sun: 0xff7040, sunI: 0.0, disk: 0,
    cLit: 0xc06a6a, cShade: 0x3c3a5c, cover: 0.38, cirrus: 0.55, stars: 0.25,
    fog: 0x4a4866, fogSun: 0x9a6458, fogAnti: 0x3e4462, fogD: 0.002, mist: 0x5a5a7a, mistD: 0.003, mistH: 7,
    aSky: 0x4a5088, aGnd: 0x2a2228, hemi: 0.6, env: 0.65, exp: 1.6, sat: 0.14, con: 0.06, warm: 0.12, bloomT: 1.0, bloomI: 0.9, rays: 0 },
  { h: 20.4, ...NIGHT },
  { h: 24, ...NIGHT },
];
const COLOR_KEYS = ['zen', 'hor', 'horSun', 'belt', 'sun', 'cLit', 'cShade', 'fog', 'fogSun', 'fogAnti', 'mist', 'aSky', 'aGnd'] as const;
const NUM_KEYS = ['sunI', 'disk', 'cover', 'cirrus', 'stars', 'fogD', 'mistD', 'mistH', 'hemi', 'env', 'exp', 'sat', 'con', 'warm', 'bloomT', 'bloomI', 'rays'] as const;
type Palette = { [K in (typeof COLOR_KEYS)[number]]: THREE.Color } & { [K in (typeof NUM_KEYS)[number]]: number };
// couleurs des clés converties une fois (hex sRGB → espace linéaire de travail)
const KEY_COLORS = KEYS.map((k) => Object.fromEntries(COLOR_KEYS.map((c) => [c, new THREE.Color(k[c])])) as Record<(typeof COLOR_KEYS)[number], THREE.Color>);

function samplePalette(hour: number, out: Palette) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  // interpolation douce entre deux clés
  const t = smoothstep(0, 1, (h - a.h) / Math.max(1e-3, b.h - a.h));
  for (const c of COLOR_KEYS) out[c].copy(KEY_COLORS[i][c]).lerp(KEY_COLORS[i + 1][c], t);
  for (const n of NUM_KEYS) out[n] = lerp(a[n], b[n], t);
}
function newPalette(): Palette {
  const p = {} as Palette;
  for (const c of COLOR_KEYS) (p as any)[c] = new THREE.Color();
  for (const n of NUM_KEYS) (p as any)[n] = 0;
  return p;
}

// ------------------------------------------------------------------------------------------ astres
/** Direction vers le soleil à l'heure h (bible §9). x = est, z = sud ; cap b → (sin b, −cos b). */
export function sunDirectionAt(hour: number, out = new THREE.Vector3()) {
  const h = ((hour % 24) + 24) % 24;
  let bearing: number, elev: number;
  if (h >= SUNRISE && h <= SUNSET) {
    const t = (h - SUNRISE) / (SUNSET - SUNRISE);
    bearing = 110 + 140 * t;
    elev = Math.sin(t * Math.PI) * MAX_ELEV;
  } else {
    const t = (h > SUNSET ? h - SUNSET : h + 24 - SUNSET) / (24 - (SUNSET - SUNRISE));
    bearing = 250 + 220 * t;
    elev = -Math.sin(t * Math.PI) * 0.75;
  }
  const b = bearing * DEG;
  return out.set(Math.sin(b) * Math.cos(elev), Math.sin(elev), -Math.cos(b) * Math.cos(elev));
}
/** Direction vers la lune : arc haut au sud pendant la nuit (lumière lisible venue d'en haut). */
export function moonDirectionAt(hour: number, out = new THREE.Vector3()) {
  const h = ((hour % 24) + 24) % 24;
  const t = (h >= 18 ? h - 18 : h + 6) / 13; // 18 h → 7 h
  const elev = (8 + Math.sin(clamp(t, 0, 1) * Math.PI) * 44) * DEG * (t > 1 ? -1 : 1);
  const b = (105 + 150 * clamp(t, 0, 1)) * DEG;
  return out.set(Math.sin(b) * Math.cos(elev), Math.sin(elev), -Math.cos(b) * Math.cos(elev));
}
/** Niveau des lanternes à l'heure h : allumage progressif de 18 h à 18 h 30, extinction de 6 h 30 à 7 h. */
export function lanternLevelAt(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  return Math.max(smoothstep(LANTERNS_ON, LANTERNS_ON + 0.5, h), 1 - smoothstep(LANTERNS_OFF - 0.5, LANTERNS_OFF, h));
}

/** État atmosphérique courant, partagé (lecture seule pour les autres modules : effets, eau, audio…). */
export const ATMO: SkyState = {
  hour: START_HOUR,
  sunDir: new THREE.Vector3(0, 1, 0), moonDir: new THREE.Vector3(0, 1, 0), lightDir: new THREE.Vector3(0, 1, 0),
  night: 0, dusk: 0, dawn: 0, day: 1, evening: 0, moment: 'aube',
  horizon: new THREE.Color(), zenith: new THREE.Color(), sunColor: new THREE.Color(), sunIntensity: 0,
  fogColor: new THREE.Color(), fogSun: new THREE.Color(), fogAnti: new THREE.Color(), fogDensity: 0.002,
  mistColor: new THREE.Color(), mistDensity: 0, mistHeight: 7,
  ambientSky: new THREE.Color(), ambientGround: new THREE.Color(),
  lanterns: 0, exposure: 1, saturation: 0.15, contrast: 0.06, warmth: 0.1, bloomThreshold: 2, bloomIntensity: 0.4, rays: 0,
};

export class SkySystem {
  mesh: THREE.Mesh;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  uniforms: Record<string, THREE.IUniform>;
  hour = START_HOUR;
  daySpeed = 24 / (16 * 60); // une journée = 16 minutes (les heures dorées sont ralenties)
  state: SkyState = ATMO;
  /** Multiplicateur appliqué à la densité de brume (ex. 0 pour la couper dans une région sans vallée). */
  mistScale = 1;
  private pal = newPalette();
  private envScene = new THREE.Scene();
  private envMesh: THREE.Mesh;
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private envTimer = 999;
  private lastEnvHour = -10;
  private camFwd = new THREE.Vector3();
  aurora = 0;

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene) {
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uHorizonSun: { value: new THREE.Color() },
      uBelt: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uCloudLit: { value: new THREE.Color() },
      uCloudShade: { value: new THREE.Color() },
      uTime: { value: 0 },
      uNight: { value: 0 },
      uAurora: { value: 0 },
      uCloudCover: { value: 0.4 },
      uCirrus: { value: 0.3 },
      uSunDisk: { value: 10 },
      uStars: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
    this.mesh.scale.setScalar(2000);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    scene.add(this.mesh);

    this.envMesh = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat);
    this.envScene.add(this.envMesh);
    this.pmrem = new THREE.PMREMGenerator(renderer);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.035;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd7ff, 0x6b5a3a, 0.25);
    scene.add(this.hemi);
  }

  setShadowQuality(size: number, extent: number) {
    this.sun.shadow.mapSize.set(size, size);
    const c = this.sun.shadow.camera;
    c.left = -extent; c.right = extent; c.top = extent; c.bottom = -extent;
    c.near = 1; c.far = 700;
    c.updateProjectionMatrix();
    this.sun.shadow.map?.dispose();
    (this.sun.shadow as any).map = null;
    this.shadowExtent = extent;
  }
  private shadowExtent = 80;

  /** Vitesse du temps : les heures dorées (aube, fin d'après-midi) passent deux fois moins vite. */
  private timeRate(h: number) {
    const golden = Math.max(smoothstep(5.2, 6.2, h) * (1 - smoothstep(7.8, 8.8, h)), smoothstep(16.6, 17.4, h) * (1 - smoothstep(19.2, 20, h)));
    return 1 - golden * 0.5;
  }

  /**
   * @param focus point suivi (joueur) : centre des ombres et du dôme céleste
   * @param camera caméra de rendu (facultative) : la zone d'ombre est avancée dans la direction du regard
   */
  update(dt: number, time: number, focus: THREE.Vector3, auroraTarget: number, camera?: THREE.Camera) {
    this.hour = (this.hour + dt * this.daySpeed * this.timeRate(this.hour)) % 24;
    const h = this.hour;
    const st = this.state;
    const p = this.pal;
    samplePalette(h, p);

    const sunDir = sunDirectionAt(h, st.sunDir);
    const moonDir = moonDirectionAt(h, st.moonDir);
    const e = sunDir.y;
    const night = smoothstep(0.02, -0.16, e);
    const dusk = smoothstep(0.42, 0.03, Math.abs(e)) * (1 - night * 0.6);
    st.hour = h;
    st.night = night;
    st.dusk = dusk;
    st.dawn = h < 12 ? dusk * (1 - night) : 0;
    st.evening = h >= 12 ? dusk * (1 - night) : 0;
    st.day = clamp(1 - night - st.dawn - st.evening, 0, 1);
    st.moment = night > 0.5 ? 'nuit' : st.dawn > 0.35 ? 'aube' : st.evening > 0.35 ? 'crepuscule' : 'jour';
    st.horizon.copy(p.hor);
    st.zenith.copy(p.zen);
    st.sunColor.copy(p.sun);
    st.sunIntensity = p.sunI;
    st.fogColor.copy(p.fog);
    st.fogSun.copy(p.fogSun);
    st.fogAnti.copy(p.fogAnti);
    st.fogDensity = p.fogD;
    st.mistColor.copy(p.mist);
    st.mistDensity = p.mistD * this.mistScale;
    st.mistHeight = p.mistH;
    st.ambientSky.copy(p.aSky);
    st.ambientGround.copy(p.aGnd);
    st.lanterns = lanternLevelAt(h);
    st.exposure = p.exp;
    st.saturation = p.sat;
    st.contrast = p.con;
    st.warmth = p.warm;
    st.bloomThreshold = p.bloomT;
    st.bloomIntensity = p.bloomI;
    st.rays = p.rays;

    const u = this.uniforms;
    (u.uZenith.value as THREE.Color).copy(p.zen);
    (u.uHorizon.value as THREE.Color).copy(p.hor);
    (u.uHorizonSun.value as THREE.Color).copy(p.horSun);
    (u.uBelt.value as THREE.Color).copy(p.belt);
    (u.uGround.value as THREE.Color).copy(p.fog);
    (u.uSunColor.value as THREE.Color).copy(p.sun);
    (u.uCloudLit.value as THREE.Color).copy(p.cLit);
    (u.uCloudShade.value as THREE.Color).copy(p.cShade);
    (u.uSunDir.value as THREE.Vector3).copy(sunDir);
    (u.uMoonDir.value as THREE.Vector3).copy(moonDir);
    u.uTime.value = time;
    u.uNight.value = night;
    u.uCloudCover.value = p.cover;
    u.uCirrus.value = p.cirrus;
    u.uSunDisk.value = p.disk;
    u.uStars.value = p.stars;
    this.aurora = lerp(this.aurora, auroraTarget, 1 - Math.exp(-dt * 0.5));
    u.uAurora.value = this.aurora * (0.35 + night * 0.65);

    // Lumière directionnelle : le soleil de 5 h 30 à 19 h 20, la lune sinon (l'intensité de la palette passe par 0 aux bascules)
    const useSun = h > 5.5 && h < 19.3;
    const ld = st.lightDir.copy(useSun ? sunDir : moonDir);
    if (ld.y < 0.035) { ld.y = 0.035; ld.normalize(); }
    this.sun.color.copy(p.sun);
    this.sun.intensity = p.sunI;
    // ombres stabilisées : zone avancée dans la direction du regard, alignée sur la grille des texels
    const ext = this.shadowExtent;
    let cx = focus.x, cz = focus.z;
    if (camera) {
      camera.getWorldDirection(this.camFwd);
      const l = Math.hypot(this.camFwd.x, this.camFwd.z) || 1;
      cx += (this.camFwd.x / l) * ext * 0.35;
      cz += (this.camFwd.z / l) * ext * 0.35;
    }
    const texel = (ext * 2) / this.sun.shadow.mapSize.x;
    const fx = Math.round(cx / texel) * texel;
    const fz = Math.round(cz / texel) * texel;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + ld.x * 320, focus.y + ld.y * 320, fz + ld.z * 320);
    this.hemi.color.copy(p.aSky);
    this.hemi.groundColor.copy(p.aGnd);
    this.hemi.intensity = p.hemi;

    this.mesh.position.copy(focus);

    // Carte d'environnement (éclairage indirect et reflets) régénérée de temps en temps
    this.envTimer += dt;
    if (this.envTimer > 3 && Math.abs(this.hour - this.lastEnvHour) > 0.12) {
      this.envTimer = 0;
      this.lastEnvHour = this.hour;
      const old = this.envRT;
      this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 500);
      this.scene.environment = this.envRT.texture;
      old?.dispose();
    }
    this.scene.environmentIntensity = p.env;
  }

  /** Brouillard de distance (FogExp2 des matériaux) : palette du moment, teintée par la région. */
  applyFog(fog: THREE.FogExp2, reg: { id: string; fog: [number, number, number]; fogDensity: number }, dt: number) {
    const st = this.state;
    const tint = reg.id === 'hub' ? 0 : 0.3 * (1 - st.night);
    const target = this.tmpColor.copy(st.fogColor).lerp(this.tmpColor2.setRGB(reg.fog[0], reg.fog[1], reg.fog[2]), tint);
    fog.color.lerp(target, 1 - Math.exp(-dt * 2));
    fog.density = damp(fog.density, st.fogDensity * (reg.fogDensity / 0.0011), 1.5, dt);
    (this.uniforms.uGround.value as THREE.Color).copy(fog.color);
  }
  private tmpColor = new THREE.Color();
  private tmpColor2 = new THREE.Color();

  forceEnvUpdate() {
    this.envTimer = 999;
    this.lastEnvHour = -10;
  }
}
