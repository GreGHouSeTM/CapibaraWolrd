// Bibliothèque TSL commune aux matières de la zone « forêt » en WebGPU : portage fidèle de glsl.ts (bruits,
// anti-répétition, triplanaire, mélanges par hauteur). Les fonctions renvoient des nœuds ; les structures GLSL (NT, TP)
// deviennent de simples objets JavaScript de nœuds.
import * as TSL from 'three/tsl';
// les types TSL de @types/three sont trop stricts pour des fonctions génériques : nœuds manipulés en « any »
const { Fn, float, vec2, vec3, vec4, fract, dot, floor, mix, sin, cos, smoothstep, pow, abs, normalize, clamp, max, dFdx, dFdy, If, texture } = TSL as any;
import type * as THREE from 'three';

type N = any; // nœud TSL (les types de @types/three pour TSL sont trop stricts pour des fonctions génériques)

export const fh21 = Fn(([p0]: [N]) => {
  const p = fract(p0.mul(vec2(123.34, 456.21))).toVar();
  p.addAssign(dot(p, p.add(45.32)));
  return fract(p.x.mul(p.y));
});

export const vnoise = Fn(([p]: [N]) => {
  const i = floor(p), f = fract(p);
  const u = f.mul(f).mul(f.mul(-2).add(3));
  return mix(mix(fh21(i), fh21(i.add(vec2(1, 0))), u.x), mix(fh21(i.add(vec2(0, 1))), fh21(i.add(vec2(1, 1))), u.x), u.y);
});

export const fbm3 = Fn(([p]: [N]) =>
  vnoise(p).mul(0.55).add(vnoise(p.mul(2.07).add(7.3)).mul(0.3)).add(vnoise(p.mul(4.13).sub(3.1)).mul(0.15)));

export const rot2 = (p: N, a: number) => {
  const c = Math.cos(a), s = Math.sin(a);
  return vec2(p.x.mul(c).sub(p.y.mul(s)), p.x.mul(s).add(p.y.mul(c)));
};

/** Anti-répétition (I. Quilez, variante 3) : deux lectures décalées selon un bruit basse fréquence. */
export interface NT { a: N; b: N; dx: N; dy: N; f: N }
export function ntSetup(uv: N, seed: number): NT {
  const k = vnoise(uv.mul(0.21).add(seed * 17)).mul(8).toVar();
  const ia = floor(k);
  const f = smoothstep(0.25, 0.75, fract(k)).toVar();
  const a = uv.add(sin(vec2(3, 7).mul(ia.add(seed)))).toVar();
  const b = uv.add(sin(vec2(3, 7).mul(ia.add(1 + seed)))).toVar();
  return { a, b, dx: dFdx(uv).toVar(), dy: dFdy(uv).toVar(), f };
}
export const ntS = (t: THREE.Texture, n: NT, o: N = null): N => {
  const a = o ? n.a.add(o) : n.a, b = o ? n.b.add(o) : n.b;
  return mix(texture(t, a).grad(n.dx, n.dy), texture(t, b).grad(n.dx, n.dy), n.f);
};
/** Lecture anti-répétition dans un tableau de textures (couche `l`). */
export const ntA = (t: THREE.Texture, n: NT, o: N, l: number): N =>
  mix(texture(t, n.a.add(o)).depth(l).grad(n.dx, n.dy), texture(t, n.b.add(o)).depth(l).grad(n.dx, n.dy), n.f);

export const unpackN = (t: N): N => t.xyz.mul(2).sub(1);

/** Projection triplanaire (repère du monde, « whiteout ») : poids aiguisés, plans négligeables ignorés. */
export interface TP { ux: N; uy: N; uz: N; w: N }
export function tpSetup(p: N, n: N, scale: number): TP {
  const w0 = pow(abs(n), vec3(6));
  const w = w0.div(w0.x.add(w0.y).add(w0.z)).toVar();
  return { ux: p.zy.div(scale), uy: p.xz.div(scale), uz: p.xy.div(scale), w };
}
export function tpS(s: THREE.Texture, t: TP): N {
  const c = vec4(0).toVar(), k = float(0).toVar();
  If(t.w.x.greaterThan(0.02), () => { c.addAssign(texture(s, t.ux).mul(t.w.x)); k.addAssign(t.w.x); });
  If(t.w.y.greaterThan(0.02), () => { c.addAssign(texture(s, t.uy).mul(t.w.y)); k.addAssign(t.w.y); });
  If(t.w.z.greaterThan(0.02), () => { c.addAssign(texture(s, t.uz).mul(t.w.z)); k.addAssign(t.w.z); });
  return c.div(max(k, 1e-4));
}
export function tpN(s: THREE.Texture, t: TP, nW: N): N {
  const r = vec3(0).toVar();
  If(t.w.x.greaterThan(0.02), () => {
    const a = unpackN(texture(s, t.ux));
    const b = vec3(a.xy.add(nW.zy), abs(a.z).mul(nW.x));
    r.addAssign(b.zyx.mul(t.w.x));
  });
  If(t.w.y.greaterThan(0.02), () => {
    const a = unpackN(texture(s, t.uy));
    const b = vec3(a.xy.add(nW.xz), abs(a.z).mul(nW.y));
    r.addAssign(b.xzy.mul(t.w.y));
  });
  If(t.w.z.greaterThan(0.02), () => {
    const a = unpackN(texture(s, t.uz));
    const b = vec3(a.xy.add(nW.xy), abs(a.z).mul(nW.z));
    r.addAssign(b.mul(t.w.z));
  });
  return normalize(r);
}
/** mélange de normales en espace tangent (« whiteout ») */
export const blendN = (a: N, b: N): N => normalize(vec3(a.xy.add(b.xy), a.z.mul(b.z)));
/** poids de mélange par hauteur : transition étroite au sommet des reliefs */
export const hblend = (hBase: N, hTop: N, cover: N, sharp: number): N =>
  clamp(cover.mul(1.6).sub(0.6).add(hTop.sub(hBase).mul(0.5)).mul(sharp).add(0.5), 0, 1);

export { cos };
