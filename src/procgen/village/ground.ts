// Intégration village : sols minéraux du village (bible §4) posés sur le terrain.
// - dalles de pierre (ishidatami) des rues, promenades et ruelles de PATHS, avec caniveau de pierre et bordures ;
// - place du Grand Cerisier (plate à 6 m) ;
// - escaliers de pierre physiques (sandō, mille torii, ruelle des Lanternes) : une boîte marchable par marche ;
// - gravier du Chemin du Moulin, pas japonais, garde-corps de la Promenade des Bains, barrière de bambou ;
// - bornes anti-véhicules à l'entrée des ruelles et des escaliers.
// Toutes les UV sont planes en coordonnées monde : deux dallages qui se recouvrent (rue sur place) se confondent.
import * as THREE from 'three';
import { pbr } from '../../core/assets';
import { Batch, std } from '../kit';
import { heightAt } from '../../world/heightmap';
import { addBox } from '../../world/physics';
import { paveRect } from '../../world/grass';
import { streamInfo, rectSdf } from '../../world/valley';
import { BRIDGES, BUILDINGS, PATHS, PLAZA, PathDef, XZ, distToPolyline, pointAlong } from '../../world/zones';
import { Instancer, bollard, mats as fmats, stepStone } from './furniture';

const STEP = 0.18;
const GIRON = 0.35;

let GM: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  const off = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  const dalles = pbr('stonewall', { scale: 6.5, color: 0xe2dbcc, roughness: 0.78, ...off });
  const curb = pbr('sidewalk', { scale: 1.6, color: 0xb8b2a6, roughness: 0.9, ...off });
  const gutter = pbr('cobble', { scale: 1.2, color: 0x8a8a80, ...off });
  const gutterWater = new THREE.MeshStandardMaterial({ color: 0x40585a, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.7, ...off });
  const gravel = pbr('gravel', { scale: 2.5, color: 0xd8cfc0, ...off });
  const granite = pbr('cobble', { scale: 2.2, color: 0xc4bcb0, ...off });
  const steps = pbr('sidewalk', { scale: 1.8, color: 0xc4beb2, roughness: 0.95 });
  const rail = pbr('roughwood', { scale: 1.5, color: 0x7a5236 });
  const bamboo = std(0xa8a060, 0.55);
  return { dalles, curb, gutter, gutterWater, gravel, granite, steps, rail, bamboo };
}
export function groundMats() {
  return (GM ??= makeMats());
}

/** Polyligne rééchantillonnée tous les `step` m : points, directions et abscisses. */
export function resample(pts: XZ[], step: number) {
  const len = pts.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);
  const n = Math.max(1, Math.ceil(len / step));
  const out: { x: number; z: number; dx: number; dz: number; s: number }[] = [];
  for (let k = 0; k <= n; k++) {
    const s = (k / n) * len;
    out.push({ ...pointAlong(pts, s), s });
  }
  return { pts: out, len };
}

const overStream = (x: number, z: number, margin = 1.2) => {
  const s = streamInfo(x, z);
  return s.kind !== 4 && s.d < s.width / 2 + margin;
};

/** Profil en travers d'une voie : suite de points (décalage latéral, Δy) et matière de chaque intervalle. */
type Profile = { off: number; dy: number }[];
type ProfileMats = (keyof ReturnType<typeof makeMats>)[];

function profileFor(p: PathDef): { prof: Profile; pm: ProfileMats } {
  const hw = p.width / 2;
  const prof: Profile = [];
  const pm: ProfileMats = [];
  const inner = (a: number, b: number) => {
    const n = Math.max(1, Math.ceil((b - a) / 0.7));
    for (let k = 1; k <= n; k++) { prof.push({ off: a + ((b - a) * k) / n, dy: 0.05 }); pm.push('dalles'); }
  };
  if (p.edge === 'caniveau-pierre') {
    // bordure 0,22 | caniveau 0,3 | dalles | caniveau | bordure
    prof.push({ off: -hw, dy: 0.12 });
    prof.push({ off: -hw + 0.22, dy: 0.12 }); pm.push('curb');
    prof.push({ off: -hw + 0.22, dy: -0.05 }); pm.push('curb');
    prof.push({ off: -hw + 0.52, dy: -0.05 }); pm.push('gutter');
    prof.push({ off: -hw + 0.52, dy: 0.05 }); pm.push('gutter');
    inner(-hw + 0.52, hw - 0.52);
    prof.push({ off: hw - 0.52, dy: -0.05 }); pm.push('gutter');
    prof.push({ off: hw - 0.22, dy: -0.05 }); pm.push('gutter');
    prof.push({ off: hw - 0.22, dy: 0.12 }); pm.push('curb');
    prof.push({ off: hw, dy: 0.12 }); pm.push('curb');
  } else if (p.edge === 'bordure-pierre') {
    prof.push({ off: -hw, dy: 0.1 });
    prof.push({ off: -hw + 0.25, dy: 0.1 }); pm.push('curb');
    prof.push({ off: -hw + 0.25, dy: 0.05 }); pm.push('curb');
    inner(-hw + 0.25, hw - 0.25);
    prof.push({ off: hw - 0.25, dy: 0.1 }); pm.push('curb');
    prof.push({ off: hw, dy: 0.1 }); pm.push('curb');
  } else {
    prof.push({ off: -hw, dy: 0.05 });
    inner(-hw, hw);
  }
  return { prof, pm };
}

/** Ruban drapé sur le terrain suivant un profil en travers ; les quadrilatères au-dessus du torrent sont omis (ponts). */
function ribbon(b: Batch, pts: XZ[], prof: Profile, pm: ProfileMats, matOverride?: THREE.Material, step = 1) {
  const M = groundMats();
  const { pts: S } = resample(pts, step);
  const byMat = new Map<THREE.Material, { pos: number[]; idx: number[] }>();
  const rows: THREE.Vector3[][] = S.map((p) => {
    const nx = -p.dz, nz = p.dx; // normale à gauche
    return prof.map((c) => {
      const x = p.x + nx * c.off, z = p.z + nz * c.off;
      return new THREE.Vector3(x, heightAt(x, z) + c.dy, z);
    });
  });
  const skip = S.map((p) => overStream(p.x, p.z, 1.4));
  for (let i = 0; i < S.length - 1; i++) {
    if (skip[i] || skip[i + 1]) continue;
    for (let k = 0; k < prof.length - 1; k++) {
      const mat = matOverride ?? M[pm[k]];
      let e = byMat.get(mat);
      if (!e) byMat.set(mat, (e = { pos: [], idx: [] }));
      const base = e.pos.length / 3;
      for (const v of [rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]]) e.pos.push(v.x, v.y, v.z);
      e.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  for (const [mat, e] of byMat) {
    if (!e.idx.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(e.pos, 3));
    g.setIndex(e.idx);
    g.computeVertexNormals();
    // si l'ordre des sommets donne des normales vers le bas, on retourne les faces
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    let sumY = 0;
    for (let i = 0; i < n.count; i++) sumY += n.getY(i);
    if (sumY < 0) {
      for (let i = 0; i < e.idx.length; i += 3) { const t = e.idx[i + 1]; e.idx[i + 1] = e.idx[i + 2]; e.idx[i + 2] = t; }
      g.setIndex(e.idx);
      g.computeVertexNormals();
    }
    worldUV(g, mat === M.curb ? 1.6 : 1);
    b.add(g, mat, undefined, false);
  }
}

/** UV planes en coordonnées monde (les matériaux pbr répètent la texture tous les `scale` m). */
function worldUV(g: THREE.BufferGeometry, k = 1) {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    // faces verticales (bordures) : projection sur le plan le plus favorable
    const vertical = Math.abs(n.getY(i)) < 0.5;
    uv[i * 2] = (vertical ? p.getX(i) + p.getZ(i) : p.getX(i)) * k;
    uv[i * 2 + 1] = (vertical ? p.getY(i) : p.getZ(i)) * k;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function paveAlong(pts: XZ[], width: number) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    paveRect((ax + bx) / 2, (az + bz) / 2, width, Math.hypot(bx - ax, bz - az) + 1, -Math.atan2(bx - ax, bz - az));
  }
}

const nearBuilding = (x: number, z: number, m: number) => BUILDINGS.some((b) => Math.abs(b.x - x) < 30 && Math.abs(b.z - z) < 30 && rectSdf(x, z, b.x, b.z, b.w, b.d, b.yaw) < m);

// ------------------------------------------------------------------------------------------------ escaliers
export interface StairInfo { id: string; treads: { x: number; z: number; yaw: number; top: number; s: number }[] }

/** Escalier de pierre physique le long d'un chemin : marches de 0,18 m, giron ≥ 0,35 m, paliers là où la pente faiblit. */
function stairs(b: Batch, p: PathDef): StairInfo {
  const M = groundMats();
  const { pts: S, len } = resample(p.pts, GIRON);
  const h0 = heightAt(S[0].x, S[0].z);
  const treads: StairInfo['treads'] = [];
  // hauteur de marche quantifiée au-dessus du terrain (on ne creuse jamais : la marche couvre le talus)
  let lev = S.map((q, i) => {
    const nxt = S[Math.min(i + 1, S.length - 1)];
    const hm = Math.max(heightAt(q.x, q.z), heightAt(nxt.x, nxt.z));
    return Math.ceil((hm - h0) / STEP - 0.15);
  });
  // terrain trop raide par endroits (ressaut > 2 marches) : escalier à pente régulière d'un bout à l'autre,
  // porté par un massif de pierre là où il passe au-dessus du sol (à signaler au Terrain : talus à régler)
  if (lev.some((l, i) => i > 0 && Math.abs(l - lev[i - 1]) > 2)) {
    const h1 = heightAt(S[S.length - 1].x, S[S.length - 1].z);
    lev = S.map((q) => Math.round(((h1 - h0) * (q.s / len)) / STEP));
  }
  // regroupe les tranches de même niveau en marches
  let start = 0;
  for (let i = 1; i <= S.length; i++) {
    if (i < S.length && lev[i] === lev[start] && S[i].s - S[start].s < 6) continue;
    const a = S[start], c = S[Math.min(i, S.length - 1)];
    const run = Math.max(GIRON, c.s - a.s);
    const mid = pointAlong(p.pts, Math.min(len, a.s + run / 2));
    const top = h0 + lev[start] * STEP + 0.06;
    const yaw = Math.atan2(mid.dx, mid.dz);
    let low = Infinity;
    for (const o of [-1, 1]) for (const t of [0, 1]) {
      const q = pointAlong(p.pts, a.s + run * t);
      low = Math.min(low, heightAt(q.x - q.dz * o * p.width / 2, q.z + q.dx * o * p.width / 2));
    }
    const bottom = Math.min(low, top - 0.18) - 0.35;
    if (!overStream(mid.x, mid.z, 0.8)) {
      const g = new THREE.BoxGeometry(p.width, top - bottom, run + 0.04).translate(0, (top + bottom) / 2, 0);
      b.addAt(boxUV(g), M.steps, mid.x, 0, mid.z, yaw, false);
      addBox(mid.x, mid.z, p.width, run + 0.04, bottom, top, -yaw, true);
      treads.push({ x: mid.x, z: mid.z, yaw, top, s: a.s + run / 2 });
    }
    start = i;
  }
  paveAlong(p.pts, p.width + 1.2);
  return { id: p.id, treads };
}

/** UV en mètres sur une boîte (BoxGeometry : UV 0..1 par face → mise à l'échelle de chaque face). */
function boxUV(g: THREE.BufferGeometry) {
  const p = g.getAttribute('position') as THREE.BufferAttribute, n = g.getAttribute('normal') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ay > 0.5) uv.setXY(i, p.getX(i), p.getZ(i));
    else if (ax > 0.5) uv.setXY(i, p.getZ(i), p.getY(i));
    else uv.setXY(i, p.getX(i), p.getY(i));
  }
  return g;
}

// ------------------------------------------------------------------------------------------------ bordures en bois et bambou
/**
 * --- CONDUITE & ACCÈS --- vrai là où une bordure (garde-corps, barrière) doit s'interrompre : têtes de pont
 * (BRIDGES) et croisements avec un autre chemin de PATHS. Vérifié par tools/acces-test.cjs.
 */
function edgeGap(x: number, z: number, self: string) {
  for (const br of BRIDGES) {
    const m = br.width / 2 + 1.6;
    if (Math.hypot(x - br.a[0], z - br.a[1]) < m || Math.hypot(x - br.b[0], z - br.b[1]) < m) return true;
  }
  return PATHS.some((q) => q.id !== self && distToPolyline(x, z, q.pts) < q.width / 2 + 0.9);
}

/** Garde-corps de bois côté torrent (Promenade des Bains) : poteaux tous les 1,82 m, main courante ; collisions. */
function waterRail(b: Batch, p: PathDef) {
  const M = groundMats();
  const { pts: S } = resample(p.pts, 1.82);
  const hw = p.width / 2 + 0.15;
  let prev: THREE.Vector3 | null = null;
  for (const q of S) {
    const nx = -q.dz, nz = q.dx;
    // côté le plus proche de l'eau
    const sL = streamInfo(q.x + nx * hw, q.z + nz * hw).d, sR = streamInfo(q.x - nx * hw, q.z - nz * hw).d;
    const sgn = sL < sR ? 1 : -1;
    const x = q.x + nx * hw * sgn, z = q.z + nz * hw * sgn;
    if (overStream(x, z, 0.3) || streamInfo(x, z).d > 9 || edgeGap(x, z, p.id)) { prev = null; continue; }
    const y = heightAt(x, z);
    b.addAt(new THREE.BoxGeometry(0.12, 1.05, 0.12).translate(0, 0.52, 0), M.rail, x, y, z);
    const cur = new THREE.Vector3(x, y, z);
    if (prev && prev.distanceTo(cur) < 2.6) {
      const mid = prev.clone().add(cur).multiplyScalar(0.5);
      const l = prev.distanceTo(cur);
      const yaw = Math.atan2(cur.x - prev.x, cur.z - prev.z);
      const tilt = Math.atan2(cur.y - prev.y, Math.hypot(cur.x - prev.x, cur.z - prev.z));
      for (const hy of [0.98, 0.5]) {
        const g = new THREE.BoxGeometry(0.09, 0.09, l + 0.06).rotateX(-tilt).translate(0, hy, 0);
        b.addAt(g, M.rail, mid.x, mid.y, mid.z, yaw);
      }
      addBox(mid.x, mid.z, 0.16, l, mid.y - 0.3, mid.y + 1.05, -yaw, false, 'thin');
    }
    prev = cur;
  }
}

/** Barrière de bambou (yotsume-gaki) des deux côtés d'une ruelle, interrompue devant les bâtiments. */
function bambooFence(b: Batch, p: PathDef) {
  const M = groundMats();
  const { pts: S } = resample(p.pts, 1.8);
  const hw = p.width / 2 + 0.25;
  for (const sgn of [-1, 1]) {
    let prev: THREE.Vector3 | null = null;
    for (const q of S) {
      const x = q.x - q.dz * hw * sgn, z = q.z + q.dx * hw * sgn;
      if (nearBuilding(x, z, 1.2) || overStream(x, z, 1) || edgeGap(x, z, p.id)) { prev = null; continue; }
      const y = heightAt(x, z);
      b.addAt(new THREE.CylinderGeometry(0.045, 0.05, 1.1, 6).translate(0, 0.55, 0), M.bamboo, x, y, z);
      const cur = new THREE.Vector3(x, y, z);
      if (prev) {
        const mid = prev.clone().add(cur).multiplyScalar(0.5);
        const l = prev.distanceTo(cur), yaw = Math.atan2(cur.x - prev.x, cur.z - prev.z);
        for (const hy of [0.35, 0.7, 1.0]) b.addAt(new THREE.CylinderGeometry(0.03, 0.03, l, 5).rotateX(Math.PI / 2).translate(0, hy, 0), M.bamboo, mid.x, mid.y, mid.z, yaw);
        for (let k = -2; k <= 2; k++) b.addAt(new THREE.CylinderGeometry(0.025, 0.025, 1.05, 5).translate(k * l / 5, 0.52, 0), M.bamboo, mid.x, mid.y, mid.z, yaw + Math.PI / 2);
        addBox(mid.x, mid.z, 0.12, l, mid.y, mid.y + 1.1, -yaw, false, 'thin');
      }
      prev = cur;
    }
  }
}

// ------------------------------------------------------------------------------------------------ assemblage
export interface VillageGround {
  group: THREE.Group;
  stairs: StairInfo[];
}

/** Ids des voies du village revêtues ici (dalles, escaliers, gravier, pas japonais). */
const VILLAGE_KINDS = new Set(['rue', 'ruelle', 'promenade', 'sando']);

export function buildVillageGround(inst: Instancer): VillageGround {
  const b = new Batch(60);
  const M = groundMats();
  const out: StairInfo[] = [];
  // --- place du Grand Cerisier (rectangle aux angles coupés, strictement plat)
  {
    const { halfX: hx, halfZ: hz, chamfer: c } = PLAZA;
    const sh = new THREE.Shape();
    const P: XZ[] = [[-hx + c, -hz], [hx - c, -hz], [hx, -hz + c], [hx, hz - c], [hx - c, hz], [-hx + c, hz], [-hx, hz - c], [-hx, -hz + c]];
    P.forEach(([x, z], i) => (i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)));
    sh.closePath();
    const g = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2);
    g.translate(PLAZA.x, PLAZA.y + 0.05, PLAZA.z);
    worldUV(g);
    b.add(g, M.dalles, undefined, false);
    // marche de pierre tout autour (la place est le point bas plat ; les rues la rejoignent)
    for (let i = 0; i < P.length; i++) {
      const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length];
      const l = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
      const cg = new THREE.BoxGeometry(0.35, 0.28, l + 0.3).translate(0, PLAZA.y - 0.1, 0);
      b.addAt(boxUV(cg), M.curb, (ax + bx) / 2 + PLAZA.x, 0, (az + bz) / 2 + PLAZA.z, yaw, false);
    }
    paveRect(PLAZA.x, PLAZA.z, hx * 2 + 1, hz * 2 + 1);
  }
  // --- voies
  for (const p of PATHS) {
    if (!VILLAGE_KINDS.has(p.kind) && p.surface !== 'gravier' && p.surface !== 'pas-japonais') continue;
    if (p.surface === 'escalier') {
      out.push(stairs(b, p));
      continue;
    }
    if (p.surface === 'dalles') {
      const { prof, pm } = profileFor(p);
      ribbon(b, p.pts, prof, pm);
      // filet d'eau dans les caniveaux
      if (p.edge === 'caniveau-pierre') {
        const hw = p.width / 2;
        for (const sg of [-1, 1]) {
          const a = sg * (hw - 0.37);
          ribbon(b, p.pts, [{ off: a - 0.12, dy: -0.03 }, { off: a + 0.12, dy: -0.03 }], ['gutterWater'], M.gutterWater, 2);
        }
      }
      if (p.edge === 'garde-corps-bois') waterRail(b, p);
      if (p.edge === 'barriere-bambou') bambooFence(b, p);
      paveAlong(p.pts, p.width + 1);
    } else if (p.surface === 'gravier') {
      const hw = p.width / 2;
      ribbon(b, p.pts, [{ off: -hw, dy: 0.04 }, { off: 0, dy: 0.05 }, { off: hw, dy: 0.04 }], ['gravel', 'gravel'], M.gravel);
      paveAlong(p.pts, p.width + 0.6);
    } else if (p.surface === 'pas-japonais') {
      const { pts: S } = resample(p.pts, 0.95);
      S.forEach((q, i) => {
        if (overStream(q.x, q.z, 0.2) && p.id !== 'gue-pierres') return;
        const side = (i % 2 ? 1 : -1) * p.width * 0.16;
        const x = q.x - q.dz * side, z = q.z + q.dx * side;
        const s = 0.55 + ((i * 37) % 10) / 30;
        stepStone(inst, x, heightAt(x, z), z, i * 1.7, s);
      });
      paveAlong(p.pts, p.width * 0.6);
    }
  }
  // --- bornes anti-véhicules (ruelles, escaliers, promenades)
  for (const p of PATHS) {
    if (!['ruelle', 'sando', 'promenade'].includes(p.kind)) continue;
    for (const end of [0, 1]) {
      const pts = end ? p.pts.slice().reverse() : p.pts;
      const isStreet = (x: number, z: number, m: number) => PATHS.some((r) => r.kind === 'rue' && r.pts.some((_, i) => i < r.pts.length - 1 && distSeg(x, z, r.pts[i], r.pts[i + 1]) < r.width / 2 + m));
      // seulement si l'extrémité touche une rue carrossable
      const q0 = pointAlong(pts, 0.8);
      const touchesStreet = isStreet(q0.x, q0.z, 3.5);
      if (!touchesStreet && p.kind !== 'sando') continue;
      // --- CONDUITE & ACCÈS --- les bornes se posent sur la ruelle, en retrait de la rue (jamais sur la chaussée),
      // une de chaque côté : le passage du milieu reste libre à pied (≥ 1,8 m) mais trop étroit pour une voiture
      let sAt = 0.8;
      while (sAt < 8 && isStreet(pointAlong(pts, sAt).x, pointAlong(pts, sAt).z, 0.9)) sAt += 0.5;
      const q = pointAlong(pts, sAt);
      if (overStream(q.x, q.z, 1)) continue;
      for (const sg of [-1, 1]) {
        const t = sg * (p.width / 2 - 0.3);
        const x = q.x - q.dz * t, z = q.z + q.dx * t;
        bollard(inst, x, heightAt(x, z), z);
      }
    }
  }
  const group = b.build('village-sols');
  return { group, stairs: out };
}

function distSeg(x: number, z: number, a: XZ, c: XZ) {
  const vx = c[0] - a[0], vz = c[1] - a[1], l2 = vx * vx + vz * vz || 1e-9;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / l2));
  return Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t);
}

export { fmats };
