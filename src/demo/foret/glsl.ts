// Bibliothèque GLSL commune aux matières de la zone « forêt » (bruits, anti-répétition, mélanges par hauteur).
import * as THREE from 'three';

export const GLSL_LIB = /* glsl */ `
float fh21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fh21(i), fh21(i + vec2(1, 0)), u.x), mix(fh21(i + vec2(0, 1)), fh21(i + vec2(1, 1)), u.x), u.y);
}
float fbm3(vec2 p) { return vnoise(p) * 0.55 + vnoise(p * 2.07 + 7.3) * 0.3 + vnoise(p * 4.13 - 3.1) * 0.15; }
vec2 rot2(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
`;

/** Partie réservée au fragment shader (dérivées d'écran). */
export const GLSL_FRAG = /* glsl */ `

// Anti-répétition (I. Quilez, variante 3) : deux lectures décalées selon un bruit à basse fréquence, mêmes décalages
// pour toutes les cartes d'une matière (couleur, normales, ARH).
struct NT { vec2 a; vec2 b; vec2 dx; vec2 dy; float f; };
NT ntSetup(vec2 uv, float seed) {
  NT n;
  float k = vnoise(uv * 0.21 + seed * 17.0) * 8.0;
  float ia = floor(k);
  n.f = smoothstep(0.25, 0.75, fract(k));
  n.a = uv + sin(vec2(3.0, 7.0) * (ia + seed));
  n.b = uv + sin(vec2(3.0, 7.0) * (ia + 1.0 + seed));
  n.dx = dFdx(uv); n.dy = dFdy(uv);
  return n;
}
vec4 ntS(sampler2D t, NT n) { return mix(textureGrad(t, n.a, n.dx, n.dy), textureGrad(t, n.b, n.dx, n.dy), n.f); }

vec3 unpackN(vec4 t) { return t.xyz * 2.0 - 1.0; }
// mélange de normales en espace tangent (« whiteout »)
vec3 blendN(vec3 a, vec3 b) { return normalize(vec3(a.xy + b.xy, a.z * b.z)); }
// poids de mélange par hauteur (hauteurs h, couverture c) : transition étroite au sommet des reliefs
float hblend(float hBase, float hTop, float cover, float sharp) {
  return clamp((cover * 1.6 - 0.6 + (hTop - hBase) * 0.5) * sharp + 0.5, 0.0, 1.0);
}
`;

export interface Patch {
  uniforms?: Record<string, THREE.IUniform>;
  defines?: Record<string, string | number>;
  vertexHead?: string;
  vertex?: Record<string, string>;
  fragmentHead?: string;
  fragment?: Record<string, string>;
}

/** Remplace des morceaux (#include <x>) d'un matériau standard de three.js ; la bibliothèque GLSL est ajoutée. */
export function patch<M extends THREE.Material>(mat: M, p: Patch, key: string): M {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, p.uniforms ?? {});
    sh.defines = { ...(sh.defines ?? {}), ...(p.defines ?? {}) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + GLSL_LIB + (p.vertexHead ?? ''));
    for (const [k, v] of Object.entries(p.vertex ?? {})) sh.vertexShader = replaceChunk(sh.vertexShader, k, v);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + GLSL_LIB + GLSL_FRAG + (p.fragmentHead ?? ''));
    for (const [k, v] of Object.entries(p.fragment ?? {})) sh.fragmentShader = replaceChunk(sh.fragmentShader, k, v);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

function replaceChunk(src: string, name: string, code: string) {
  // « +nom » : ajoute après le morceau d'origine ; « nom » : remplace
  const after = name.startsWith('+');
  const n = after ? name.slice(1) : name;
  const tag = `#include <${n}>`;
  if (!src.includes(tag)) throw new Error('morceau de shader absent : ' + n);
  return src.replace(tag, after ? tag + '\n' + code : code);
}
