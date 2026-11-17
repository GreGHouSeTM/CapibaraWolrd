// Kit de construction : géométries de bâtiments avec UV en « travées / étages », toits, et regroupement
// des géométries par matériau et par tuile pour limiter les appels de dessin.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FacadeSet } from './facades';

/** Matériaux dont l'émission (fenêtres) s'allume la nuit. */
export const nightMaterials: THREE.MeshStandardMaterial[] = [];

const matCache = new Map<FacadeSet, THREE.MeshStandardMaterial>();
export function facadeMaterial(set: FacadeSet, opts: { envMapIntensity?: number; metalness?: number; emissiveBoost?: number } = {}) {
  let m = matCache.get(set);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({
    map: set.map,
    normalMap: set.normalMap,
    roughnessMap: set.roughnessMap,
    emissiveMap: set.emissiveMap,
    emissive: new THREE.Color(1, 1, 1),
    emissiveIntensity: 0,
    roughness: 1,
    metalness: opts.metalness ?? 0.0,
    envMapIntensity: opts.envMapIntensity ?? 1,
  });
  m.normalScale.set(1, 1);
  m.userData.emissiveBoost = opts.emissiveBoost ?? 1;
  nightMaterials.push(m);
  matCache.set(set, m);
  return m;
}

export function setNight(night: number) {
  for (const m of nightMaterials) m.emissiveIntensity = ((m.userData.baseEmissive ?? 0) + night * 1.6) * (m.userData.emissiveBoost ?? 1);
}

// ------------------------------------------------------------------------------------------------
// Construction bas niveau de quadrilatères
export class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, uvs: [number, number][]) {
    // a,b,c,d dans le sens antihoraire vu de face
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
    const base = this.pos.length / 3;
    for (const [i, p] of [a, b, c, d].entries()) {
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(uvs[i][0], uvs[i][1]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, uvs: [number, number][]) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const base = this.pos.length / 3;
    for (const [i, p] of [a, b, c].entries()) {
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(uvs[i][0], uvs[i][1]);
    }
    this.idx.push(base, base + 1, base + 2);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    return g;
  }
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Boîte de façade centrée en (0, y0, 0) : largeur w (x), profondeur d (z), hauteur h.
 * Les UV sont exprimés pour que la texture (bays × floors) se répète tous les bayW / floorH mètres.
 */
export function facadeBox(w: number, d: number, y0: number, h: number, set: FacadeSet, bayW: number, floorH: number, uOff = 0, vOff = 0, top = false) {
  const gb = new GeoBuilder();
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2, y1 = y0 + h;
  const su = 1 / (bayW * set.bays), sv = 1 / (floorH * set.floors);
  const v0 = vOff, v1 = vOff + h * sv;
  const side = (a: THREE.Vector3, b: THREE.Vector3, len: number, u0: number) => {
    const u1 = u0 + len * su;
    gb.quad(a, b, V(b.x, y1, b.z), V(a.x, y1, a.z), [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
  };
  side(V(x0, y0, z1), V(x1, y0, z1), w, uOff);
  side(V(x1, y0, z1), V(x1, y0, z0), d, uOff + 0.25);
  side(V(x1, y0, z0), V(x0, y0, z0), w, uOff + 0.5);
  side(V(x0, y0, z0), V(x0, y0, z1), d, uOff + 0.75);
  if (top) gb.quad(V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0), V(x0, y1, z0), [[0, 0], [w / 8, 0], [w / 8, d / 8], [0, d / 8]]);
  return gb.build();
}

/** Simple dalle / boîte avec UV en mètres (divisés par `scale`). */
export function slab(w: number, d: number, y0: number, h: number, scale = 4) {
  const gb = new GeoBuilder();
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2, y1 = y0 + h;
  const s = 1 / scale;
  gb.quad(V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0), V(x0, y1, z0), [[x0 * s, z1 * s], [x1 * s, z1 * s], [x1 * s, z0 * s], [x0 * s, z0 * s]]);
  const side = (a: THREE.Vector3, b: THREE.Vector3, len: number) =>
    gb.quad(a, b, V(b.x, y1, b.z), V(a.x, y1, a.z), [[0, 0], [len * s, 0], [len * s, h * s], [0, h * s]]);
  side(V(x0, y0, z1), V(x1, y0, z1), w);
  side(V(x1, y0, z1), V(x1, y0, z0), d);
  side(V(x1, y0, z0), V(x0, y0, z0), w);
  side(V(x0, y0, z0), V(x0, y0, z1), d);
  return gb.build();
}

/** Toit à la Mansart (pente raide, terrasse au sommet). */
export function mansardRoof(w: number, d: number, y0: number, h: number, inset: number) {
  const gb = new GeoBuilder();
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  const y1 = y0 + h;
  const a = [V(x0, y0, z1), V(x1, y0, z1), V(x1, y0, z0), V(x0, y0, z0)];
  const b = [V(x0 + inset, y1, z1 - inset), V(x1 - inset, y1, z1 - inset), V(x1 - inset, y1, z0 + inset), V(x0 + inset, y1, z0 + inset)];
  const s = 0.25;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const len = a[i].distanceTo(a[j]);
    const sl = Math.hypot(inset, h);
    gb.quad(a[i], a[j], b[j], b[i], [[0, 0], [len * s, 0], [len * s - inset * s, sl * s], [inset * s, sl * s]]);
  }
  gb.quad(b[0], b[1], b[2], b[3], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  return gb.build();
}

/** Toit à deux pans (faîtage selon l'axe le plus long). Renvoie toit + pignons séparés. */
export function gableRoof(w: number, d: number, y0: number, h: number, over = 0.4) {
  const roof = new GeoBuilder();
  const gable = new GeoBuilder();
  const alongX = w >= d;
  const Lw = (alongX ? w : d) / 2, Sw = (alongX ? d : w) / 2;
  const L = Lw + over, S = Sw + over;
  const s = 0.25;
  const P = (l: number, y: number, sd: number) => (alongX ? V(l, y, sd) : V(sd, y, l));
  // le pan passe exactement par le haut du mur (Sw, y0) et le faîtage (0, y0 + h)
  const ridge = y0 + h;
  const eave = y0 - (h * over) / Sw;
  const sl = Math.hypot(S, ridge - eave);
  const flip = alongX;
  const q = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, dd: THREE.Vector3) =>
    flip ? roof.quad(a, b, c, dd, [[0, 0], [2 * L * s, 0], [2 * L * s, sl * s], [0, sl * s]]) : roof.quad(dd, c, b, a, [[0, 0], [2 * L * s, 0], [2 * L * s, sl * s], [0, sl * s]]);
  q(P(-L, eave, S), P(L, eave, S), P(L, ridge, 0), P(-L, ridge, 0));
  q(P(L, eave, -S), P(-L, eave, -S), P(-L, ridge, 0), P(L, ridge, 0));
  // pignons (triangles) avec UV en mètres
  const uvOf = (p: THREE.Vector3): [number, number] => [(alongX ? p.z : p.x) * s, (p.y - y0) * s];
  const t = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) =>
    flip ? gable.tri(a, b, c, [uvOf(a), uvOf(b), uvOf(c)]) : gable.tri(c, b, a, [uvOf(c), uvOf(b), uvOf(a)]);
  t(P(Lw, y0, Sw), P(Lw, y0, -Sw), P(Lw, ridge, 0));
  t(P(-Lw, y0, -Sw), P(-Lw, y0, Sw), P(-Lw, ridge, 0));
  return { roof: roof.build(), gable: gable.build(), ridge };
}

/** Toit à quatre pans avec débord (style japonais), légèrement relevé aux angles. */
export function hipRoof(w: number, d: number, y0: number, h: number, over = 1.2, lift = 0.35) {
  const gb = new GeoBuilder();
  const x0 = -w / 2 - over, x1 = w / 2 + over, z0 = -d / 2 - over, z1 = d / 2 + over;
  const r = Math.min(w, d) * 0.25;
  const top = y0 + h;
  const a = [V(x0, y0 + lift, z1), V(x1, y0 + lift, z1), V(x1, y0 + lift, z0), V(x0, y0 + lift, z0)];
  const mid = [V(0, 0, z1), V(0, 0, 0), V(0, 0, z0), V(0, 0, 0)];
  void mid;
  const ridgeA = w >= d ? V(-w / 2 + r, top, 0) : V(0, top, d / 2 - r);
  const ridgeB = w >= d ? V(w / 2 - r, top, 0) : V(0, top, -d / 2 + r);
  const s = 0.25;
  const uv4: [number, number][] = [[0, 0], [w * s, 0], [w * s * 0.7, 2], [w * s * 0.3, 2]];
  if (w >= d) {
    gb.quad(a[0], a[1], ridgeB, ridgeA, uv4);
    gb.quad(a[2], a[3], ridgeA, ridgeB, uv4);
    gb.tri(a[1], a[2], ridgeB, [[0, 0], [d * s, 0], [d * s * 0.5, 2]]);
    gb.tri(a[3], a[0], ridgeA, [[0, 0], [d * s, 0], [d * s * 0.5, 2]]);
  } else {
    gb.quad(a[1], a[2], ridgeB, ridgeA, uv4);
    gb.quad(a[3], a[0], ridgeA, ridgeB, uv4);
    gb.tri(a[0], a[1], ridgeA, [[0, 0], [w * s, 0], [w * s * 0.5, 2]]);
    gb.tri(a[2], a[3], ridgeB, [[0, 0], [w * s, 0], [w * s * 0.5, 2]]);
  }
  // sous-face
  gb.quad(a[3], a[2], a[1], a[0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  return gb.build();
}

// ------------------------------------------------------------------------------------------------
/** Regroupe les géométries par (matériau, tuile) puis fusionne. */
export class Batch {
  private groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; cast: boolean }>();
  constructor(private tileSize = 140) {}

  add(geo: THREE.BufferGeometry, mat: THREE.Material, m?: THREE.Matrix4, cast = true) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.getAttribute('uv')) {
      const n = g.getAttribute('position').count;
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    }
    if (g.getAttribute('color')) g.deleteAttribute('color');
    if (m) g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.computeBoundingBox();
    const c = g.boundingBox!.getCenter(new THREE.Vector3());
    const key = `${mat.uuid}|${Math.floor(c.x / this.tileSize)},${Math.floor(c.z / this.tileSize)}|${cast}`;
    let grp = this.groups.get(key);
    if (!grp) this.groups.set(key, (grp = { mat, geos: [], cast }));
    grp.geos.push(g);
  }

  addAt(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rotY = 0, cast = true) {
    const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z);
    this.add(geo, mat, m, cast);
  }

  /** Ajoute tous les maillages d'un objet (en respectant leurs transformations). */
  addObject(obj: THREE.Object3D, m?: THREE.Matrix4) {
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mm = mesh.matrixWorld.clone();
      if (m) mm.premultiply(m);
      this.add(mesh.geometry.clone(), mesh.material as THREE.Material, mm, mesh.castShadow !== false);
    });
  }

  build(name = 'batch'): THREE.Group {
    const root = new THREE.Group();
    root.name = name;
    for (const { mat, geos, cast } of this.groups.values()) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      root.add(mesh);
      for (const g of geos) g.dispose();
    }
    this.groups.clear();
    return root;
  }
}

export const std = (color: THREE.ColorRepresentation, roughness = 0.7, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

/** UV planes (projection du dessus) en mètres / scale. */
export function planarUV(geo: THREE.BufferGeometry, scale = 4) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / scale;
    uv[i * 2 + 1] = pos.getZ(i) / scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
