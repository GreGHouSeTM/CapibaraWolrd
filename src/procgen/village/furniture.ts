// Intégration village : petit mobilier procédural instancié (un appel de dessin par pièce et par matière, quel que soit
// le nombre d'exemplaires) : lanternes de pierre (tōrō), lanternes de papier (chōchin), andon, noren, bornes,
// panneaux indicateurs (atlas de textes : un seul matériau pour tous les panneaux) et portes du village.
// Les modèles Blender définitifs de ces objets (bible §8.3) pourront remplacer ces géométries sans changer les poses.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pbr } from '../../core/assets';
import { Batch, gableRoof, nightMaterials, std } from '../kit';
import { addBox, addCircle } from '../../world/physics';

// ------------------------------------------------------------------------------------------------ instanciation
/** Regroupe des poses par (géométrie, matériau) et produit une InstancedMesh par couple. */
export class Instancer {
  private sets = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; mats: THREE.Matrix4[]; colors: THREE.Color[]; cast: boolean }>();
  add(name: string, geo: THREE.BufferGeometry, mat: THREE.Material, m: THREE.Matrix4, color?: THREE.Color, cast = true) {
    const k = name + '|' + mat.uuid;
    let s = this.sets.get(k);
    if (!s) this.sets.set(k, (s = { geo, mat, mats: [], colors: [], cast }));
    s.mats.push(m.clone());
    if (color) s.colors.push(color);
  }
  build(name = 'instances') {
    const g = new THREE.Group();
    g.name = name;
    for (const [k, s] of this.sets) {
      const im = new THREE.InstancedMesh(s.geo, s.mat, s.mats.length);
      im.name = k.split('|')[0];
      s.mats.forEach((m, i) => im.setMatrixAt(i, m));
      if (s.colors.length === s.mats.length) s.colors.forEach((c, i) => im.setColorAt(i, c));
      im.castShadow = s.cast;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      g.add(im);
    }
    this.sets.clear();
    return g;
  }
}

export const poseM = (x: number, y: number, z: number, yaw = 0, s: number | [number, number, number] = 1) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
    typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s),
  );

// ------------------------------------------------------------------------------------------------ matériaux
let MAT: ReturnType<typeof makeMats> | null = null;
function glow(color: number, base = 0.06, boost = 1.4, extra: THREE.MeshStandardMaterialParameters = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, emissive: new THREE.Color(0xffa850), emissiveIntensity: base, ...extra });
  m.userData.baseEmissive = base;
  m.userData.emissiveBoost = boost;
  nightMaterials.push(m);
  return m;
}
function makeMats() {
  return {
    stone: pbr('rock', { scale: 1.4, color: 0xb9b3a7, roughness: 1 }),
    lightBox: glow(0xf6e6c0, 0.04, 1.6),
    paperRed: glow(0xc8362a, 0.08, 1.2, { side: THREE.DoubleSide }),
    paperWhite: glow(0xf4ead4, 0.06, 1.1, { side: THREE.DoubleSide }),
    lacquer: std(0x1c1a18, 0.5),
    wood: pbr('roughwood', { scale: 1.2, color: 0x8a6448 }),
    cloth: std(0xffffff, 0.95, 0, { side: THREE.DoubleSide }),
    crest: std(0xf2ecdf, 0.9, 0, { side: THREE.DoubleSide }),
    bamboo: std(0x9a9a52, 0.6),
    roof: pbr('rooftiles', { scale: 2, color: 0x7a7e84 }),
  };
}
export function mats() {
  return (MAT ??= makeMats());
}

// ------------------------------------------------------------------------------------------------ géométries
const cyl = (rt: number, rb: number, h: number, seg: number, y: number) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, y + h / 2, 0);
const box = (w: number, h: number, d: number, y: number) => new THREE.BoxGeometry(w, h, d).translate(0, y + h / 2, 0);

let G: ReturnType<typeof makeGeos> | null = null;
function makeGeos() {
  // tōrō kasuga (2,1 m) : socle, fût, plateau, chambre à lumière, toit hexagonal, bouton
  const toroStone = mergeGeometries([
    cyl(0.36, 0.42, 0.16, 6, 0), cyl(0.3, 0.36, 0.12, 6, 0.16), cyl(0.12, 0.14, 0.82, 10, 0.28),
    cyl(0.34, 0.2, 0.16, 6, 1.1), cyl(0.3, 0.3, 0.06, 6, 1.26),
    // montants de la chambre
    ...[0, 1, 2, 3].map((k) => box(0.07, 0.34, 0.07, 1.32).translate(Math.cos(k * Math.PI / 2 + Math.PI / 4) * 0.19, 0, Math.sin(k * Math.PI / 2 + Math.PI / 4) * 0.19)),
    new THREE.ConeGeometry(0.5, 0.32, 6).translate(0, 1.82, 0), cyl(0.06, 0.08, 0.08, 6, 1.98),
    new THREE.SphereGeometry(0.075, 8, 6).translate(0, 2.12, 0),
  ].map((g) => g.toNonIndexed()))!;
  const toroLight = box(0.3, 0.3, 0.3, 1.33);
  // chōchin : lanterne de papier ovale avec ses deux bagues noires (centre en y = 0)
  const chochin = new THREE.SphereGeometry(0.2, 14, 10).scale(1, 1.45, 1);
  const chochinCaps = mergeGeometries([cyl(0.12, 0.12, 0.05, 12, 0.27), cyl(0.12, 0.12, 0.05, 12, -0.32), cyl(0.008, 0.008, 0.25, 4, 0.32)].map((g) => g.toNonIndexed()))!;
  // andon de rue : pied de bois et caisson de papier
  const andonWood = mergeGeometries([
    box(0.06, 1.05, 0.06, 0).translate(-0.17, 0, -0.17), box(0.06, 1.05, 0.06, 0).translate(0.17, 0, -0.17),
    box(0.06, 1.05, 0.06, 0).translate(-0.17, 0, 0.17), box(0.06, 1.05, 0.06, 0).translate(0.17, 0, 0.17),
    box(0.46, 0.05, 0.46, 1.05), box(0.4, 0.04, 0.4, 0.45),
  ].map((g) => g.toNonIndexed()))!;
  const andonPaper = box(0.34, 0.55, 0.34, 0.5);
  // noren : trois pans de tissu (repère : haut de l'ouverture en y = 0, largeur et hauteur 1)
  const pans: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) pans.push(new THREE.PlaneGeometry(0.31, 1, 1, 4).translate(-0.335 + k * 0.335, -0.5, 0));
  const noren = mergeGeometries(pans)!;
  const crest = new THREE.CircleGeometry(0.12, 18).translate(0, -0.42, 0.004);
  // borne de pierre
  const bollard = mergeGeometries([cyl(0.15, 0.17, 0.62, 10, 0).toNonIndexed(), new THREE.SphereGeometry(0.15, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.62, 0).toNonIndexed()])!;
  // pierre de pas japonais
  const stepStone = new THREE.CylinderGeometry(0.5, 0.55, 0.16, 9).translate(0, 0.02, 0);
  return { toroStone, toroLight, chochin, chochinCaps, andonWood, andonPaper, noren, crest, bollard, stepStone };
}
export function geos() {
  return (G ??= makeGeos());
}

/** Lanterne de pierre (tōrō) ; renvoie la hauteur de la lumière. */
export function toro(inst: Instancer, x: number, y: number, z: number, yaw = 0, s = 1) {
  const m = poseM(x, y, z, yaw, s);
  inst.add('toro', geos().toroStone, mats().stone, m);
  inst.add('toro-lumiere', geos().toroLight, mats().lightBox, m, undefined, false);
  addCircle(x, z, 0.4 * s, y, y + 2.1 * s);
  return y + 1.48 * s;
}
/** Lanterne de papier suspendue (centre en y). */
export function chochin(inst: Instancer, x: number, y: number, z: number, red = true, s = 1) {
  const m = poseM(x, y, z, 0, s);
  inst.add(red ? 'chochin-rouge' : 'chochin-blanc', geos().chochin, red ? mats().paperRed : mats().paperWhite, m, undefined, false);
  inst.add('chochin-bagues', geos().chochinCaps, mats().lacquer, m, undefined, false);
}
export function andon(inst: Instancer, x: number, y: number, z: number, yaw = 0) {
  const m = poseM(x, y, z, yaw);
  inst.add('andon-bois', geos().andonWood, mats().wood, m);
  inst.add('andon-papier', geos().andonPaper, mats().paperWhite, m, undefined, false);
  addCircle(x, z, 0.3, y, y + 1.1);
  return y + 0.8;
}
/** Noren accroché en haut d'une ouverture (pos), face `yaw`, de largeur w et hauteur h. */
export function noren(inst: Instancer, pos: THREE.Vector3, yaw: number, w: number, h: number, color: THREE.Color, crest = true) {
  const fx = Math.sin(yaw) * 0.06, fz = Math.cos(yaw) * 0.06;
  const m = poseM(pos.x + fx, pos.y, pos.z + fz, yaw, [w, h, 1]);
  inst.add('noren', geos().noren, mats().cloth, m, color, false);
  if (crest) inst.add('noren-blason', geos().crest, mats().crest, poseM(pos.x + fx, pos.y, pos.z + fz, yaw, [h, h, 1]), undefined, false);
}
export function bollard(inst: Instancer, x: number, y: number, z: number) {
  inst.add('borne', geos().bollard, mats().stone, poseM(x, y - 0.04, z, x * 3.1 + z));
  addCircle(x, z, 0.2, y - 0.2, y + 0.75);
}
export function stepStone(inst: Instancer, x: number, y: number, z: number, yaw: number, s: number) {
  inst.add('pas-japonais', geos().stepStone, mats().stone, poseM(x, y, z, yaw, [s, 1, s * 0.8]), undefined, false);
}

// ------------------------------------------------------------------------------------------------ panneaux indicateurs
/** Panneaux de bois à flèches ; tous les textes vont dans un même atlas (un seul matériau). */
export class Signs {
  private items: { x: number; y: number; z: number; arrows: { text: string; dir: number }[] }[] = [];
  add(x: number, y: number, z: number, arrows: { text: string; dir: number }[]) {
    this.items.push({ x, y, z, arrows });
    addCircle(x, z, 0.18, y, y + 3);
  }
  build(b: Batch) {
    const rows = this.items.reduce((n, it) => n + it.arrows.length, 0);
    if (!rows) return;
    const RH = 56;
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = THREE.MathUtils.ceilPowerOfTwo(rows * RH);
    const g = cv.getContext('2d')!;
    const H = cv.height;
    let row = 0;
    const arrowGeo = (r: number) => {
      const shape = new THREE.Shape();
      shape.moveTo(0, -0.16); shape.lineTo(1.45, -0.16); shape.lineTo(1.7, 0); shape.lineTo(1.45, 0.16); shape.lineTo(0, 0.16); shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false });
      const uv = geo.attributes.uv as THREE.BufferAttribute, pos = geo.attributes.position as THREE.BufferAttribute, nrm = geo.attributes.normal as THREE.BufferAttribute;
      const v0 = 1 - ((r + 1) * RH) / H, v1 = 1 - (r * RH) / H;
      for (let k = 0; k < uv.count; k++) {
        const u = pos.getX(k) / 1.7;
        uv.setXY(k, nrm.getZ(k) < -0.5 ? 1 - u : u, v0 + ((pos.getY(k) + 0.16) / 0.32) * (v1 - v0));
      }
      return geo.translate(0.08, 0, -0.025);
    };
    const boards: THREE.BufferGeometry[] = [];
    for (const it of this.items) {
      b.addAt(new THREE.CylinderGeometry(0.08, 0.1, 3, 8).translate(0, 1.5, 0), mats().wood, it.x, it.y, it.z);
      b.addAt(new THREE.ConeGeometry(0.16, 0.18, 4).rotateY(Math.PI / 4).translate(0, 3.05, 0), mats().wood, it.x, it.y, it.z);
      it.arrows.forEach((a, i) => {
        // texte (bois clair, lettres brûlées)
        const y0 = row * RH;
        g.fillStyle = '#c9a16a'; g.fillRect(0, y0, 512, RH);
        g.fillStyle = 'rgba(90,60,30,0.25)';
        for (let k = 0; k < 6; k++) g.fillRect(0, y0 + 6 + k * 8, 512, 2);
        g.strokeStyle = '#6a4424'; g.lineWidth = 4; g.strokeRect(2, y0 + 2, 508, RH - 4);
        g.fillStyle = '#2e1c0c'; g.font = 'bold 30px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(a.text, 236, y0 + RH / 2 + 1, 440);
        const geo = arrowGeo(row);
        // flèche vers le cap `dir` (rad, direction (sin, cos) comme les yaw) : l'axe +x local doit viser (sin dir, cos dir)
        geo.rotateY(dir2rot(a.dir)).translate(0, 2.6 - i * 0.42, 0);
        geo.translate(it.x, it.y, it.z);
        boards.push(geo);
        row++;
      });
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    for (const geo of boards) b.add(geo, mat);
  }
}
/** Rotation y qui envoie l'axe +x local vers la direction (sin d, cos d). */
const dir2rot = (d: number) => d - Math.PI / 2;

// ------------------------------------------------------------------------------------------------ portes du village
/** Portail de bois couvert (Col, Étang, Cèdres) : deux poteaux, deux traverses et un petit toit à deux pans. */
export function woodenGate(b: Batch, x: number, y: number, z: number, yaw: number, span: number) {
  const M = mats();
  const half = span / 2;
  const m = (gx: number, gy: number, gz: number) => new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeTranslation(gx, gy, gz)).premultiply(new THREE.Matrix4().makeTranslation(x, y, z));
  for (const s of [-1, 1]) {
    b.add(new THREE.BoxGeometry(0.32, 3.6, 0.32).translate(0, 1.8, 0), M.wood, m(s * half, 0, 0));
    b.add(new THREE.BoxGeometry(0.5, 0.35, 0.5).translate(0, 0.17, 0), M.stone, m(s * half, -0.1, 0));
    // contrefiches
    b.add(new THREE.BoxGeometry(0.16, 2.4, 0.16).translate(0, 1.2, 0), M.wood, m(s * half, 0, -0.9).multiply(new THREE.Matrix4().makeRotationX(0.38)));
    const [wx, wz] = [x + Math.cos(yaw) * s * half, z - Math.sin(yaw) * s * half];
    addBox(wx, wz, 0.45, 0.45, y, y + 3.6, -yaw);
  }
  b.add(new THREE.BoxGeometry(span + 0.6, 0.22, 0.22).translate(0, 2.75, 0), M.wood, m(0, 0, 0));
  b.add(new THREE.BoxGeometry(span + 1.2, 0.26, 0.4).translate(0, 3.5, 0), M.wood, m(0, 0, 0));
  const gr = gableRoof(span + 1.4, 1.4, 3.62, 0.8, 0.45);
  b.add(gr.roof, M.roof, m(0, 0, 0));
  b.add(gr.gable, M.wood, m(0, 0, 0));
}
