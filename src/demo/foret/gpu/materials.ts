// Matières de la zone « forêt » en nœuds TSL (chemin WebGPU). Portage fidèle des correctifs GLSL de ground.ts,
// wall.ts, stairs.ts, trees.ts et props.ts : mêmes textures, mêmes mélanges, mêmes constantes. Toutes héritent de
// ForetMaterial (éclairage indirect par sondes, translucidité).
import * as THREE from 'three';
import * as TSL from 'three/tsl';
// les types TSL de @types/three sont trop stricts pour des fonctions génériques : nœuds manipulés en « any »
const {
  Fn, float, vec2, vec3, vec4, uniform, texture, attribute, referenceAttribute, uv, mix, clamp, max, min, dot, pow, smoothstep,
  normalize, length, cross, exp, abs, sin, cos, atan, mod, floor, If, Loop, Break, select, transpose, mat3,
  positionWorld, positionLocal, normalWorldGeometry, cameraPosition, cameraWorldMatrix, cameraViewMatrix, transformNormalToView,
  normalMap, materialColor, materialRoughness, materialNormal, varying,
} = TSL as any;
import { ForetMaterial } from './gi';
import { vnoise, fbm3, ntSetup, ntS, ntA, unpackN, tpSetup, tpS, tpN, blendN, hblend, rot2 } from './lib';
import type { TexSet } from '../tex';

type N = any;

// ------------------------------------------------------------------------------------------------ sol
export interface GroundTexGPU {
  alb: THREE.DataArrayTexture; nor: THREE.DataArrayTexture; arh: THREE.DataArrayTexture;
  solh: THREE.Texture; masks: THREE.Texture; rect: THREE.Vector4; pom: number; far: boolean;
  tile: number; tiles: number[];
}

export function groundMaterialGPU(g: GroundTexGPU) {
  const m = new ForetMaterial({ roughness: 0.9, metalness: 0 });
  m.name = 'foret-sol' + (g.far ? '-loin' : '');
  const TILE = g.tile, TILE3 = g.tiles[3], TILE4 = g.tiles[4];
  const rect = uniform(g.rect);
  const uPom = 0.045;
  const shade = Fn(() => {
    const wp = positionWorld;
    const wxz = wp.xz.toVar();
    const mk = texture(g.masks, wxz.sub(rect.xy).mul(rect.zw)).rgb.toVar();
    const dist = length(cameraPosition.sub(wp));
    const varA = fbm3(wxz.mul(0.12).add(5.0));
    const cMossy = smoothstep(0.55, 0.78, varA.add(mk.g.mul(0.2))).mul(mk.r.oneMinus()).mul(0.85).toVar();
    const b0 = mk.r.oneMinus().mul(cMossy.oneMinus()).toVar(), b1 = cMossy, b2 = mk.r, b3 = mk.b, b4 = mk.g;
    const wPom = vec3(b0, b1, b2).div(max(b0.add(b1).add(b2), 1e-3)).toVar();
    const Nw = normalize(normalWorldGeometry).toVar();
    const Tw = normalize(vec3(1, 0, 0).sub(Nw.mul(Nw.x))).toVar();
    const Bw = cross(Tw, Nw).toVar();
    const n0 = ntSetup(wxz.div(TILE), 1.0);
    const off = vec2(0).toVar();
    const pomH = (o: N) => mix(dot(texture(g.solh, n0.a.add(o)).grad(n0.dx, n0.dy).rgb, wPom), dot(texture(g.solh, n0.b.add(o)).grad(n0.dx, n0.dy).rgb, wPom), n0.f);
    if (g.pom > 0 && !g.far) {
      const fadeP = smoothstep(7.0, 13.0, dist).oneMinus().toVar();
      If(fadeP.greaterThan(0.01), () => {
        const Vw = normalize(cameraPosition.sub(wp));
        const Vt = vec3(dot(Vw, Tw), dot(Vw, Bw), dot(Vw, Nw));
        const P = Vt.xy.div(max(Vt.z, 0.3)).mul(fadeP.mul(uPom / TILE));
        const dlt = P.div(g.pom).toVar();
        const lay = 1 / g.pom;
        const cur = float(1).toVar();
        const h = pomH(off).toVar();
        const hPrev = h.toVar(), curPrev = cur.toVar();
        Loop(g.pom, () => {
          If(h.greaterThanEqual(cur), () => { Break(); });
          hPrev.assign(h); curPrev.assign(cur);
          cur.subAssign(lay); off.subAssign(dlt);
          h.assign(pomH(off));
        });
        // affinage linéaire entre les deux derniers pas
        const a = h.sub(cur), bb = hPrev.sub(curPrev);
        const k = clamp(a.div(max(a.sub(bb), 1e-4)), 0, 1);
        off.addAssign(dlt.mul(k));
      });
    }
    const ww = [b0, b1, b2, b3, b4];
    const n3 = ntSetup(wxz.div(TILE3), 3.0);
    const n4 = ntSetup(wxz.div(TILE4), 4.0);
    const hh: N[] = [], cc: N[] = [], nn: N[] = [], aa: N[] = [];
    const hmax = float(-1).toVar();
    for (let l = 0; l < 5; l++) {
      hh[l] = float(-9).toVar(); cc[l] = vec3(0).toVar(); nn[l] = vec3(0, 0, 1).toVar(); aa[l] = vec3(1).toVar();
      const n = l === 3 ? n3 : l === 4 ? n4 : n0;
      const o = l < 3 ? off : off.mul(TILE / (l === 3 ? TILE3 : TILE4));
      If(ww[l].greaterThanEqual(0.01), () => {
        const a4 = ntA(g.arh, n, o, l);
        aa[l].assign(a4.rgb);
        hh[l].assign(a4.b.add(ww[l].mul(1.2)));
        hmax.assign(max(hmax, hh[l]));
        cc[l].assign(ntA(g.alb, n, o, l).rgb);
        nn[l].assign(ntA(g.nor, n, o, l).xyz.mul(2).sub(1));
      });
    }
    // mélange par hauteur : les couches les plus hautes (pondérées par leur couverture) l'emportent
    const cA = vec3(0).toVar(), nA = vec3(0).toVar(), hA = vec3(0).toVar(), wS = float(0).toVar();
    for (let l = 0; l < 5; l++) {
      const w = max(hh[l].sub(hmax.sub(0.28)), 0).mul(select(hh[l].lessThan(-5.0), 0.0, 1.0));
      cA.addAssign(cc[l].mul(w)); nA.addAssign(nn[l].mul(w)); hA.addAssign(aa[l].mul(w)); wS.addAssign(w);
    }
    cA.divAssign(max(wS, 1e-4)); nA.divAssign(max(wS, 1e-4)); hA.divAssign(max(wS, 1e-4));
    // retouche : le sol moussu photoscanné est trop clair pour un sous-bois d'épicéas
    const sAll = max(b0.add(b1).add(b2).add(b3).add(b4), 1e-3);
    cA.mulAssign(mix(mix(float(0.5), float(0.3), b1.div(max(b0.add(b1), 1e-3))), float(0.85), b2.add(b3).add(b4).div(sAll)));
    cA.assign(mix(cA, vec3(dot(cA, vec3(0.3, 0.55, 0.15))).mul(vec3(1.05, 0.95, 0.8)), 0.25));
    // variations de valeur et de teinte à grande échelle
    cA.mulAssign(mix(vec3(0.86, 0.86, 0.84), vec3(1.08, 1.04, 0.98), fbm3(wxz.mul(0.05).add(2.0))).mul(vnoise(wxz.mul(0.35)).mul(0.2).add(0.9)));
    // humidité : sol sombre et brillant autour de la flaque
    const wet = smoothstep(0.15, 0.9, mk.b);
    cA.mulAssign(mix(float(1), float(0.55), wet));
    const gRough = mix(max(hA.g, 0.82), float(0.22), wet.mul(0.85));
    const gN = normalize(vec3(nA.xy, max(nA.z, 0.2)));
    const nWorld = normalize(Tw.mul(gN.x).add(Bw.mul(gN.y)).add(Nw.mul(gN.z)));
    return { col: cA, ao: hA.r, rough: gRough, nW: nWorld };
  });
  const r = shade() as N;
  // les quatre sorties partagent le même calcul (une seule fonction, membres d'une structure)
  m.colorNode = vec4(r.get ? r.get('col') : r.col, 1);
  m.aoNode = r.get ? r.get('ao') : r.ao;
  m.roughnessNode = r.get ? r.get('rough') : r.rough;
  m.normalNode = transformNormalToView(r.get ? r.get('nW') : r.nW);
  return m;
}

// ------------------------------------------------------------------------------------------------ paroi
export function wallMaterialGPU(nor: THREE.Texture, ao: THREE.Texture, masks: THREE.Texture, A: TexSet, B: TexSet, M: TexSet) {
  const m = new ForetMaterial({ roughness: 0.85, metalness: 0 });
  m.name = 'foret-paroi';
  const um = attribute('uvm', 'vec2').toVar();
  const vuv = uv();
  const na = ntSetup(um.div(2.6), 0.0);
  const nb = ntSetup(rot2(um, 1.3).div(1.9), 3.0);
  const nm = ntSetup(um.div(0.8), 7.0);
  const cA = ntS(A.diff, na).rgb, cB = ntS(B.diff, nb).rgb, cM = ntS(M.diff, nm).rgb;
  const hA = ntS(A.arh, na).rgb.toVar(), hB = ntS(B.arh, nb).rgb.toVar(), hM = ntS(M.arh, nm).rgb.toVar();
  const mk = texture(masks, vuv).rgb.toVar();
  const bakedAO = texture(ao, vuv).r;
  const big = fbm3(um.mul(0.17).add(3.0));
  const wB = smoothstep(0.42, 0.62, big.add(hB.b.sub(hA.b).mul(0.25))).toVar();
  const rock = mix(cA, cB, wB).toVar();
  const rH = mix(hA, hB, wB).toVar();
  const vt = fbm3(um.mul(0.06).add(11.0));
  rock.mulAssign(mix(vec3(0.92, 0.95, 1.0), vec3(1.05, 1.0, 0.92), vt).mul(vnoise(um.mul(0.4)).mul(0.3).add(0.82)));
  const lg = vnoise(um.mul(7.0)).mul(0.5).add(vnoise(um.mul(19.0)).mul(0.3)).add(vnoise(um.mul(41.0)).mul(0.2)).toVar();
  const wL = smoothstep(0.22, 0.62, mk.g.mul(lg.mul(0.8).add(0.6)).add(rH.b.sub(0.5).mul(0.2))).toVar();
  const rl = dot(rock, vec3(0.299, 0.587, 0.114));
  const lichen = mix(vec3(0.5, 0.55, 0.46), vec3(0.66, 0.69, 0.58), lg).mul(rl.mul(0.6).add(0.7));
  rock.assign(mix(rock, lichen, wL.mul(0.62)));
  const wW = mk.b.mul(vnoise(vec2(um.x.mul(6.0), um.y.mul(0.7))).mul(0.3).add(0.7)).toVar();
  rock.assign(mix(rock, rock.mul(vec3(0.42, 0.46, 0.4)), wW.mul(0.85)));
  const wM = hblend(rH.b, hM.b, mk.r, 3.5).mul(smoothstep(0.02, 0.2, mk.r)).toVar();
  const moss = cM.mul(mix(vec3(0.5, 0.58, 0.4), vec3(0.74, 0.76, 0.5), smoothstep(0.3, 0.8, vnoise(um.mul(0.55)))));
  const aoAll = bakedAO.mul(mix(rH.r, hM.r, wM)).toVar();
  m.colorNode = vec4(mix(rock, moss, wM).mul(mix(float(1), aoAll, 0.35)), 1);
  const fRough = mix(mix(rH.g, float(0.95), wL), hM.g.mul(0.92).add(0.08), wM).toVar();
  m.roughnessNode = mix(fRough, float(0.32), wW.mul(wM.oneMinus()));
  const nDet0 = mix(unpackN(ntS(A.nor, na)), unpackN(ntS(B.nor, nb)), wB);
  const nDet = normalize(mix(nDet0, unpackN(ntS(M.nor, nm)), wM));
  const mapN = texture(nor, vuv).xyz.mul(2).sub(1);
  const bl = blendN(mapN, vec3(nDet.xy.mul(0.9), nDet.z));
  m.normalNode = normalMap(bl.mul(0.5).add(0.5));
  m.aoNode = aoAll;
  return m;
}

// ------------------------------------------------------------------------------------------------ escalier
export function stairsMaterialGPU(nor: THREE.Texture, ao: THREE.Texture, T: TexSet, S: TexSet, M: TexSet, axis: { x1: number; x2: number; zSplit: number }) {
  const m = new ForetMaterial({ roughness: 0.8, metalness: 0 });
  m.name = 'foret-escalier';
  const wp = positionWorld.toVar();
  const nG = normalize(normalWorldGeometry).toVar();
  const up = nG.y;
  const tpT = tpSetup(wp, nG, 1.6);
  const tpS2 = tpSetup(wp.add(3.1), nG, 1.3);
  const tpM = tpSetup(wp.add(7.7), nG, 0.75);
  const bao = texture(ao, uv()).r.toVar();
  const wTop = smoothstep(0.55, 0.85, up).toVar();
  const cT = tpS(T.diff, tpT).rgb, cS = tpS(S.diff, tpS2).rgb, cM = tpS(M.diff, tpM).rgb;
  const aT = tpS(T.arh, tpT).rgb, aS2 = tpS(S.arh, tpS2).rgb, aM = tpS(M.arh, tpM).rgb.toVar();
  const stone = mix(cS, cT.mul(0.62), wTop).mul(0.8).toVar();
  const sA = mix(aS2, aT, wTop).toVar();
  stone.mulAssign(mix(vec3(0.9, 0.93, 0.98), vec3(1.06, 1.02, 0.95), vnoise(wp.xz.mul(0.9).add(wp.y))).mul(vnoise(wp.xz.mul(2.3)).mul(0.25).add(0.85)));
  const ax = select(wp.z.greaterThan(axis.zSplit), float(axis.x1), float(axis.x2));
  const lat = abs(wp.x.sub(ax)).toVar();
  const walked = exp(pow(lat.div(0.62), 2.0).negate()).toVar();
  const dirt = smoothstep(0.82, 0.5, bao).mul(smoothstep(0.4, 0.8, up)).mul(vnoise(wp.xz.mul(6.0)).mul(0.4).add(0.6));
  stone.assign(mix(stone, vec3(0.16, 0.12, 0.085).mul(vnoise(wp.xz.mul(11.0)).mul(0.4).add(0.8)), dirt.mul(0.8)));
  const n1 = fbm3(wp.xz.mul(1.7).add(wp.y.mul(0.5))).toVar();
  const stoneVar = smoothstep(0.25, 0.75, vnoise(wp.xz.mul(0.9).add(4.0)));
  const cover = max(smoothstep(0.7, 0.35, bao).mul(0.95), smoothstep(0.35, 0.8, up).mul(smoothstep(0.9, 1.5, lat)).mul(mix(float(0.25), float(1.0), stoneVar))).toVar();
  cover.assign(max(cover, smoothstep(0.3, 0.8, up).mul(walked.oneMinus()).mul(smoothstep(0.45, 0.7, n1)).mul(0.8)));
  cover.mulAssign(smoothstep(0.25, 0.5, n1.add(0.25).sub(walked.mul(0.35))));
  const wM = hblend(sA.b, aM.b, cover, 3.0).mul(smoothstep(0.03, 0.2, cover)).toVar();
  const moss = cM.mul(mix(vec3(0.38, 0.45, 0.3), vec3(0.62, 0.66, 0.42), vnoise(wp.xz.mul(0.8)))).mul(mix(float(0.7), float(1.1), vnoise(wp.xz.mul(3.7))));
  const lich = smoothstep(0.62, 0.78, vnoise(wp.xz.mul(3.1).add(wp.y.mul(2.7)))).mul(wTop.mul(walked).oneMinus()).mul(wM.oneMinus());
  stone.assign(mix(stone, vec3(0.58, 0.62, 0.52).mul(dot(stone, vec3(0.33)).mul(0.4).add(0.8)), lich.mul(0.45)));
  const aoAll = bao.mul(mix(sA.r, aM.r, wM)).toVar();
  m.colorNode = vec4(mix(stone, moss, wM).mul(mix(float(1), aoAll, 0.3)), 1);
  m.roughnessNode = mix(mix(sA.g, sA.g.mul(0.85), walked.mul(wTop)), float(0.92), wM);
  const nD = normalize(mix(mix(tpN(S.nor, tpS2, nG), tpN(T.nor, tpT, nG), wTop), tpN(M.nor, tpM, nG), wM));
  // normale cuite (espace tangent, dérivées d'écran) puis détail triplanaire du monde autour d'elle
  const nb = normalMap(texture(nor, uv()).xyz);
  const nbW = normalize(nb.transformDirection(cameraWorldMatrix));
  m.normalNode = transformNormalToView(normalize(nbW.add(nD.sub(nG).mul(0.85))));
  m.aoNode = aoAll;
  return m;
}

// ------------------------------------------------------------------------------------------------ épicéas
/** Position de l'instance (colonne de translation de instanceMatrix), ou l'origine hors instanciation. */
const instPos = Fn((_: any, builder: any) => (builder.object?.isInstancedMesh ? referenceAttribute('instanceMatrix', 'mat4').element(3).xyz : vec3(0)));

/** Vent des épicéas : balancement (distance au fût) et roulis du houppier (hauteur), phase par arbre. */
export function spruceWind(wind: { value: number }) {
  const uW = uniform(wind.value).onFrameUpdate(() => wind.value);
  return Fn(() => {
    const ip = instPos();
    const ph = dot(ip.xz, vec2(0.13, 0.29));
    const v = attribute('uv1', 'vec2');
    const dist = v.x, hh = v.y;
    const p = positionLocal;
    const sway = sin(uW.mul(0.6).add(ph)).mul(0.06).mul(hh).mul(hh);
    const br = sin(uW.mul(1.9).add(ph.mul(3.0)).add(p.y.mul(0.4))).mul(0.5).add(sin(uW.mul(3.7).add(ph.mul(5.0)).add(p.x)).mul(0.25)).mul(0.025).mul(dist);
    return p.add(vec3(sway.add(br.mul(0.6)), br, sway.mul(0.6)));
  })();
}

export function barkMaterialGPU(b: TexSet, wind: { value: number }) {
  const m = new ForetMaterial({ roughness: 1, metalness: 0, color: 0x8c857c });
  m.name = 'foret-ecorce';
  const u = uv().mul(1 / 1.2);
  const wp = positionWorld;
  const arh = texture(b.arh, u);
  const lic = smoothstep(0.55, 0.75, vnoise(wp.xz.mul(7.0).add(wp.y.mul(1.3)))).mul(0.4);
  m.colorNode = vec4(mix(texture(b.diff, u).rgb.mul(vec3(m.color)), vec3(0.42, 0.46, 0.38), lic), 1);
  m.roughnessNode = arh.g;
  m.aoNode = arh.r;
  m.normalNode = normalMap(texture(b.nor, u).xyz);
  m.positionNode = spruceWind(wind);
  return m;
}

export function foliageMaterialGPU(diff: THREE.Texture, nor: THREE.Texture, wind: { value: number }) {
  const m = new ForetMaterial({ roughness: 0.78, metalness: 0, color: 0xd8dccf, alphaTest: 0.5, side: THREE.DoubleSide });
  m.name = 'foret-rameaux';
  const vv = attribute('uv1', 'vec2');
  const inner = smoothstep(0.2, 2.6, vv.x);
  const crownAO = mix(float(0.28), float(1.0), inner).mul(mix(float(0.7), float(1.0), smoothstep(0.35, 0.9, vv.y))).toVar();
  const t = texture(diff, uv());
  m.colorNode = vec4(t.rgb.mul(vec3(m.color)).mul(mix(vec3(0.92, 0.96, 1.0), vec3(1.04, 1.0, 0.92), vnoise(vv.mul(3.0)))), t.a);
  m.normalNode = normalMap(texture(nor, uv()).xyz, vec2(0.7, 0.7));
  m.aoNode = crownAO;
  m.directScale = mix(float(0.55), float(1.0), crownAO);
  m.translucency = { tint: new THREE.Color(0.75, 1.0, 0.45), k: 0.45, pow: 4, amp: 0.8, base: 0.15 };
  m.positionNode = spruceWind(wind);
  return m;
}

export function impostorMaterialGPU(diff: THREE.Texture, nor: THREE.Texture, row: number, rows: number, width: number, H: number) {
  const m = new ForetMaterial({ roughness: 0.85, metalness: 0, color: 0xd8dccf, alphaTest: 0.5, side: THREE.DoubleSide });
  m.name = 'foret-imposteur-' + row;
  const IM = referenceAttribute('instanceMatrix', 'mat4');
  const ip = IM.element(3).xyz;
  const c0 = IM.element(0).xyz, c2 = IM.element(2).xyz;
  const isc = length(c0);
  const toC0 = cameraPosition.sub(ip);
  const toC = normalize(vec3(toC0.x, 0, toC0.z)).toVar();
  const rgt = normalize(cross(vec3(0, 1, 0), toC)).toVar();
  const p = positionLocal;
  const wpos = ip.add(rgt.mul(p.x.mul(width).mul(isc))).add(vec3(0, 1, 0).mul(p.y.mul(H * 1.04).mul(isc)));
  // la chaîne de three.js applique ensuite instanceMatrix : on lui donne la position locale équivalente
  // (instanceMatrix = T·R·S uniforme → inverse = Rᵀ·(x − t) / s)
  const IM3 = mat3(IM.element(0).xyz, IM.element(1).xyz, IM.element(2).xyz);
  m.positionNode = transpose(IM3).mul(wpos.sub(ip)).div(isc.mul(isc));
  const ry = atan(c2.x, c2.z);
  const az = atan(toC.x, toC.z).sub(ry);
  const f = mod(az.div(6.2831853).mul(8.0).add(16.0), 8.0);
  const k0 = floor(f);
  const blend = varying(f.sub(k0));
  const k1 = mod(k0.add(1.0), 8.0);
  const cu = vec2(p.x.add(0.5), p.y);
  const vImp = varying(vec2(k0.add(cu.x).div(8.0), cu.y.add(rows - 1 - row).div(rows)));
  const vImp2 = varying(vec2(k1.add(cu.x).div(8.0), cu.y.add(rows - 1 - row).div(rows)));
  const vR = varying(rgt), vF = varying(toC);
  const i0 = texture(diff, vImp), i1 = texture(diff, vImp2);
  const s = mix(i0, i1, blend);
  m.colorNode = vec4(s.rgb.mul(vec3(m.color)), s.a);
  const nn = mix(texture(nor, vImp).xyz, texture(nor, vImp2).xyz, blend).mul(2).sub(1);
  m.normalNode = transformNormalToView(normalize(vR.mul(nn.x).add(vec3(0, 1, 0).mul(nn.y)).add(vF.mul(nn.z))));
  return m;
}

// ------------------------------------------------------------------------------------------------ modèles Poly Haven
export interface PropStyleGPU { moss?: number; foot?: number; foliage?: boolean }

export function propMaterialGPU(base: ForetMaterial, st: PropStyleGPU, moss: TexSet, wind: { value: number }) {
  const m = base;
  const uW = uniform(wind.value).onFrameUpdate(() => wind.value);
  const IMs = Fn((_: any, builder: any) => (builder.object?.isInstancedMesh ? length(referenceAttribute('instanceMatrix', 'mat4').element(1).xyz) : float(1)));
  const vH = varying(positionLocal.y.mul(IMs()));
  if (st.foliage) {
    m.positionNode = Fn(() => {
      const ip = instPos();
      const ph = dot(ip.xz, vec2(0.37, 0.71));
      const p = positionLocal;
      const k = smoothstep(0.0, 1.2, p.y).mul(0.035);
      const dx = sin(uW.mul(1.7).add(ph)).mul(k).add(sin(uW.mul(4.3).add(ph.mul(2.0)).add(p.y.mul(3.0))).mul(k).mul(0.35));
      const dz = cos(uW.mul(1.3).add(ph.mul(1.3))).mul(k).mul(0.7);
      return p.add(vec3(dx, 0, dz));
    })();
    m.translucency = { tint: new THREE.Color(0.9, 1.0, 0.55), k: 0.5, pow: 3, amp: 0.6, base: 0.12 };
  }
  let col: N = materialColor.rgb;
  let rough: N = materialRoughness;
  let nrm: N = null;
  if ((st.moss ?? 0) > 0) {
    const wp = positionWorld;
    const nW = normalize(normalWorldGeometry);
    const n1 = fbm3(wp.xz.mul(1.3).add(wp.y.mul(0.7))).toVar();
    const cover = smoothstep(0.35, 0.9, nW.y.add(n1.sub(0.5).mul(1.1))).mul(st.moss!).mul(smoothstep(0.2, 0.55, n1.add(0.15))).toVar();
    const muv = wp.xz.div(0.7);
    const ma = texture(moss.arh, muv);
    const wMoss = clamp(cover.mul(1.6).sub(0.6).add(ma.b.sub(0.5).mul(0.5)).mul(3.0).add(0.5), 0, 1).mul(smoothstep(0.03, 0.2, cover)).toVar();
    const mc = texture(moss.diff, muv).rgb.mul(mix(vec3(0.34, 0.41, 0.27), vec3(0.56, 0.6, 0.38), vnoise(wp.xz.mul(0.8)))).mul(mix(float(0.7), float(1.1), vnoise(wp.xz.mul(3.7))));
    col = mix(col, mc, wMoss);
    rough = mix(rough, float(0.93), wMoss);
    const nM = unpackN(texture(moss.nor, muv));
    nrm = mix(materialNormal, normalize(materialNormal.add(cameraViewMatrix.mul(vec4(nM.x, 0, nM.y, 0)).xyz.mul(0.6))), wMoss);
  }
  if ((st.foot ?? 0) > 0) col = col.mul(mix(float(0.55), float(1.0), smoothstep(0.0, st.foot!, vH)));
  m.colorNode = vec4(col, materialColor.a);
  if ((st.moss ?? 0) > 0) { m.roughnessNode = rough; m.normalNode = nrm; }
  return m;
}

export { min };
