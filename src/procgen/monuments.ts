// Monuments « carte postale », tous construits par programme.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng, lerp } from '../core/math';
import { Batch, std, nightMaterials, facadeMaterial, facadeBox, hipRoof, slab } from './kit';
import { limestone, gothic, FacadeSet, signTexture } from './facades';
import { addBox, addCircle } from '../world/physics';
import { pbr } from '../core/assets';

const up = new THREE.Vector3(0, 1, 0);

/** Poutre entre deux points (section carrée t). */
export function beam(a: THREE.Vector3, b: THREE.Vector3, t: number) {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(t, t, len);
  const m = new THREE.Matrix4().lookAt(a, b, Math.abs(b.clone().sub(a).normalize().y) > 0.99 ? new THREE.Vector3(1, 0, 0) : up);
  m.setPosition(a.clone().add(b).multiplyScalar(0.5));
  g.applyMatrix4(m);
  return g;
}

function stoneMat(set: FacadeSet, metersPerTile = 6) {
  const m = new THREE.MeshStandardMaterial({ roughness: 1 });
  const clone = (t: THREE.Texture) => {
    const c = t.clone();
    c.repeat.set(1 / metersPerTile, 1 / metersPerTile);
    c.needsUpdate = true;
    return c;
  };
  m.map = clone(set.map);
  m.normalMap = clone(set.normalMap);
  m.roughnessMap = clone(set.roughnessMap);
  return m;
}

export function glowMat(color: number, boost = 3, base = 0) {
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: base, roughness: 0.4 });
  m.userData.emissiveBoost = boost;
  m.userData.baseEmissive = base;
  nightMaterials.push(m);
  return m;
}

// =================================================================== Tour Eiffel
export function eiffelTower(x: number, y: number, z: number) {
  const H = 125;
  const hw = (h: number) => 2.4 + 23.6 * Math.exp(-h / 29);
  const geos: THREE.BufferGeometry[] = [];
  const V = (a: number, b: number, c: number) => new THREE.Vector3(a, b, c);
  const corners = (h: number, w: number): THREE.Vector3[] => [V(-w, h, -w), V(w, h, -w), V(w, h, w), V(-w, h, w)];
  const levels: number[] = [];
  for (let h = 0; h < 22; h += 2.75) levels.push(h);
  for (let h = 22; h < 44; h += 3.2) levels.push(h);
  for (let h = 44; h <= 112; h += 4.5) levels.push(h);
  // jambes séparées jusqu'au premier étage
  const legW = (h: number) => lerp(7.5, hw(22), Math.min(1, h / 22));
  for (let li = 0; li < levels.length - 1; li++) {
    const h0 = levels[li], h1 = levels[li + 1];
    const w0 = hw(h0), w1 = hw(h1);
    const th = h1 < 22 ? 0.75 : h1 < 44 ? 0.6 : 0.45;
    if (h1 <= 22) {
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const lw0 = legW(h0), lw1 = legW(h1);
        // 4 arêtes de chaque jambe
        const q0 = [V(sx * w0, h0, sz * w0), V(sx * (w0 - lw0), h0, sz * w0), V(sx * (w0 - lw0), h0, sz * (w0 - lw0)), V(sx * w0, h0, sz * (w0 - lw0))];
        const q1 = [V(sx * w1, h1, sz * w1), V(sx * (w1 - lw1), h1, sz * w1), V(sx * (w1 - lw1), h1, sz * (w1 - lw1)), V(sx * w1, h1, sz * (w1 - lw1))];
        for (let k = 0; k < 4; k++) {
          geos.push(beam(q0[k], q1[k], th * 1.3));
          geos.push(beam(q1[k], q1[(k + 1) % 4], th * 0.7));
          geos.push(beam(q0[k], q1[(k + 1) % 4], th * 0.5));
          geos.push(beam(q0[(k + 1) % 4], q1[k], th * 0.5));
        }
      }
    } else {
      const c0 = corners(h0, w0), c1 = corners(h1, w1);
      for (let k = 0; k < 4; k++) {
        const n = (k + 1) % 4;
        geos.push(beam(c0[k], c1[k], th * 1.6));
        geos.push(beam(c1[k], c1[n], th * 0.8));
        geos.push(beam(c0[k], c1[n], th * 0.6));
        geos.push(beam(c0[n], c1[k], th * 0.6));
        // montants intermédiaires
        const m0 = c0[k].clone().lerp(c0[n], 0.5), m1 = c1[k].clone().lerp(c1[n], 0.5);
        geos.push(beam(m0, m1, th * 0.6));
      }
    }
  }
  // arches décoratives entre les jambes
  for (let k = 0; k < 4; k++) {
    const ang = (k * Math.PI) / 2;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const xx = lerp(-1, 1, t);
      const h = 9 + 11 * Math.sqrt(1 - xx * xx);
      const w = hw(h) - legW(h) * 0.6;
      const px = xx * w, pz = hw(h) - 0.5;
      pts.push(V(px * Math.cos(ang) - pz * Math.sin(ang), h, px * Math.sin(ang) + pz * Math.cos(ang)));
    }
    for (let i = 0; i < pts.length - 1; i++) geos.push(beam(pts[i], pts[i + 1], 0.9));
  }
  // plateformes
  const plats: [number, number, number][] = [[22, hw(22) + 2.5, 2.2], [44, hw(44) + 1.8, 1.6], [112, hw(112) + 1.2, 1.2]];
  for (const [h, w, t] of plats) {
    const p = new THREE.BoxGeometry(w * 2, t, w * 2);
    p.translate(0, h, 0);
    geos.push(p);
    // garde-corps
    for (let k = 0; k < 4; k++) {
      const r = new THREE.BoxGeometry(w * 2, 1.2, 0.15);
      r.translate(0, h + t / 2 + 0.6, w);
      r.rotateY((k * Math.PI) / 2);
      geos.push(r);
    }
  }
  // sommet
  const cab = new THREE.BoxGeometry(4.2, 5, 4.2);
  cab.translate(0, 115, 0);
  geos.push(cab);
  const spire = new THREE.CylinderGeometry(0.25, 0.6, 12, 6);
  spire.translate(0, 123, 0);
  geos.push(spire);

  const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)))!;
  geos.forEach((g) => g.dispose());
  const mat = new THREE.MeshStandardMaterial({ color: 0x7a5f45, roughness: 0.55, metalness: 0.55, emissive: 0xffa040, emissiveIntensity: 0 });
  mat.userData.emissiveBoost = 0.18;
  nightMaterials.push(mat);
  const mesh = new THREE.Mesh(merged, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  g.position.set(x, y, z);

  // scintillement nocturne
  const N = 400;
  const sp = new Float32Array(N * 3);
  const rng = new Rng(5);
  for (let i = 0; i < N; i++) {
    const h = rng.range(2, 118);
    const w = hw(h) * (h < 22 ? 1 : 1);
    const side = rng.int(0, 3);
    const t = rng.range(-1, 1) * w;
    const pts = [[t, -w], [w, t], [t, w], [-w, t]][side];
    sp.set([pts[0], h, pts[1]], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const smat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const sparkles = new THREE.Points(sg, smat);
  g.add(sparkles);

  // collisions : 4 pieds, plateformes marchables
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) addBox(x + sx * (hw(0) - 3.5), z + sz * (hw(0) - 3.5), 8, 8, y, y + 20, 0, false);
  addBox(x, z, (hw(44) + 1.8) * 2, (hw(44) + 1.8) * 2, y + 43, y + 44.8, 0, true, 'eiffel2');
  addBox(x, z, (hw(22) + 2.5) * 2, (hw(22) + 2.5) * 2, y + 21, y + 23.1, 0, true, 'eiffel1');
  const update = (time: number, night: number) => {
    const on = night > 0.5 && Math.floor(time / 20) % 3 === 0;
    smat.opacity = on ? 0.9 : 0;
    if (on) {
      const arr = sg.attributes.position.array as Float32Array;
      void arr;
      smat.size = 1.2 + Math.random() * 1.2;
      sparkles.rotation.y = Math.floor(time * 8) % 2 ? 0 : 0.0001;
    }
  };
  return { group: g, update, platform1: y + 23.1, platform2: y + 44.8, hw };
}

// =================================================================== Arc de Triomphe
export function arcDeTriomphe(b: Batch, x: number, y: number, z: number, rot = 0) {
  const mat = stoneMat(limestone(11, '#e6dcc6', 20), 5);
  const W = 45, D = 22, Ht = 50;
  const g = new THREE.Group();
  // piliers : profil latéral avec l'arche transversale
  const pierShape = new THREE.Shape();
  pierShape.moveTo(-D / 2, 0); pierShape.lineTo(-4.2, 0); pierShape.lineTo(-4.2, 14.8);
  pierShape.absarc(0, 14.8, 4.2, Math.PI, 0, true);
  pierShape.lineTo(4.2, 0); pierShape.lineTo(D / 2, 0); pierShape.lineTo(D / 2, 21); pierShape.lineTo(-D / 2, 21); pierShape.closePath();
  for (const s of [-1, 1]) {
    const pg = new THREE.ExtrudeGeometry(pierShape, { depth: 15, bevelEnabled: false });
    pg.rotateY(Math.PI / 2);
    pg.translate(s > 0 ? 7.5 : -22.5, 0, 0);
    const m = new THREE.Mesh(pg, mat);
    g.add(m);
  }
  // partie haute avec la grande arche
  const top = new THREE.Shape();
  top.moveTo(-W / 2, 21); top.lineTo(-7.5, 21);
  top.absarc(0, 21, 7.5, Math.PI, 0, true);
  top.lineTo(W / 2, 21); top.lineTo(W / 2, Ht - 6); top.lineTo(-W / 2, Ht - 6); top.closePath();
  const tg = new THREE.ExtrudeGeometry(top, { depth: D, bevelEnabled: false });
  tg.translate(0, 0, -D / 2);
  g.add(new THREE.Mesh(tg, mat));
  // corniche et attique
  const cor = new THREE.BoxGeometry(W + 1.6, 1.6, D + 1.6);
  cor.translate(0, Ht - 6.8, 0);
  g.add(new THREE.Mesh(cor, mat));
  const att = new THREE.BoxGeometry(W, 5.2, D);
  att.translate(0, Ht - 3.2, 0);
  g.add(new THREE.Mesh(att, mat));
  const cor2 = new THREE.BoxGeometry(W + 0.8, 0.8, D + 0.8);
  cor2.translate(0, Ht - 0.4, 0);
  g.add(new THREE.Mesh(cor2, mat));
  // frise et bas-reliefs (panneaux en relief)
  for (const s of [-1, 1])
    for (const sx of [-1, 1]) {
      const panel = new THREE.BoxGeometry(9, 11, 0.6);
      panel.translate(sx * 15, 8, s * (D / 2 + 0.2));
      g.add(new THREE.Mesh(panel, mat));
    }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  const m = new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z);
  b.addObject(g, m);
  // collisions des 4 piliers (axes alignés si rot = 0)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBox(x + sx * 15, z + sz * 7.6, 15, 6.8, y, y + Ht);
  addBox(x, z, W, D, y + 21, y + Ht, 0, true);
}

// =================================================================== Statue de la Liberté (stylisée)
export function libertyStatue(x: number, y: number, z: number) {
  const g = new THREE.Group();
  const copper = new THREE.MeshStandardMaterial({ color: 0x5fa38a, roughness: 0.55, metalness: 0.35 });
  const stone = stoneMat(limestone(21, '#cfc3a8', 18), 5);
  // socle étoilé + piédestal
  const star = new THREE.Shape();
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const r = i % 2 ? 22 : 30;
    const px = Math.cos(a) * r, pz = Math.sin(a) * r;
    if (i === 0) star.moveTo(px, pz);
    else star.lineTo(px, pz);
  }
  const sg = new THREE.ExtrudeGeometry(star, { depth: 6, bevelEnabled: false });
  sg.rotateX(-Math.PI / 2);
  g.add(new THREE.Mesh(sg, stone));
  const ped = new THREE.CylinderGeometry(7, 9, 26, 4);
  ped.rotateY(Math.PI / 4);
  ped.translate(0, 19, 0);
  g.add(new THREE.Mesh(ped, stone));
  const ped2 = new THREE.BoxGeometry(11, 3, 11);
  ped2.translate(0, 33, 0);
  g.add(new THREE.Mesh(ped2, stone));
  // robe drapée (tour)
  const pts: THREE.Vector2[] = [];
  const prof = [[3.6, 0], [3.9, 3], [3.5, 8], [3.2, 13], [3.4, 17], [3.0, 20], [1.8, 22], [1.2, 23.5], [0, 24]];
  for (const [r, h] of prof) pts.push(new THREE.Vector2(r, h));
  const robe = new THREE.LatheGeometry(pts, 28);
  const rp = robe.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < rp.count; i++) {
    const a = Math.atan2(rp.getZ(i), rp.getX(i));
    const k = 1 + Math.sin(a * 9 + rp.getY(i) * 0.4) * 0.05;
    rp.setX(i, rp.getX(i) * k);
    rp.setZ(i, rp.getZ(i) * k);
  }
  robe.computeVertexNormals();
  robe.translate(0, 34.5, 0);
  g.add(new THREE.Mesh(robe, copper));
  // tête et couronne
  const head = new THREE.SphereGeometry(1.5, 20, 16);
  head.translate(0, 59.6, 0.2);
  g.add(new THREE.Mesh(head, copper));
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + ((i - 3) / 3) * 1.1;
    const ray = new THREE.ConeGeometry(0.22, 2.2, 5);
    ray.translate(0, 1.1, 0);
    ray.rotateX(Math.PI / 2 - 0.3);
    ray.rotateY(a + Math.PI / 2);
    ray.translate(Math.cos(a) * -1.2 * 0 + 0, 60.6, 0);
    g.add(new THREE.Mesh(ray, copper));
  }
  // bras levé et flambeau
  const arm = beam(new THREE.Vector3(1.6, 56, 0), new THREE.Vector3(2.8, 67, 0.5), 1.1);
  g.add(new THREE.Mesh(arm, copper));
  const torch = new THREE.CylinderGeometry(0.9, 0.5, 2.2, 10);
  torch.translate(2.9, 68.2, 0.5);
  g.add(new THREE.Mesh(torch, copper));
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.2, 10), glowMat(0xffc34a, 3, 0.8));
  flame.position.set(2.9, 70.3, 0.5);
  g.add(flame);
  // tablette
  const tab = new THREE.BoxGeometry(1.2, 3.2, 2.2);
  tab.rotateZ(0.2);
  tab.translate(-3.4, 52, 0.6);
  g.add(new THREE.Mesh(tab, copper));
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
  });
  g.position.set(x, y, z);
  addCircle(x, z, 24, y, y + 6, true);
  addCircle(x, z, 8.5, y, y + 34, false);
  return g;
}

// =================================================================== Tour Art déco (type « Empire »)
export function decoTower(b: Batch, facade: FacadeSet, x: number, y: number, z: number) {
  const mat = facadeMaterial(facade);
  const tiers: [number, number, number][] = [[40, 40, 24], [32, 32, 80], [26, 26, 40], [18, 18, 22], [12, 12, 12]];
  let h = y;
  for (const [w, d, th] of tiers) {
    b.addAt(facadeBox(w, d, 0, th, facade, 3.2, 3.8, 0, 0, true), mat, x, h, z);
    h += th;
  }
  const crown = glowMat(0xe8e0c8, 1.5);
  const c1 = new THREE.CylinderGeometry(4, 6, 10, 8);
  c1.translate(0, 5, 0);
  b.addAt(c1, crown, x, h, z);
  const spire = new THREE.CylinderGeometry(0.4, 1.4, 22, 8);
  spire.translate(0, 21, 0);
  b.addAt(spire, std(0xbfc6cc, 0.3, 0.9), x, h, z);
  addBox(x, z, 40, 40, y, y + 24, 0, true);
  addBox(x, z, 32, 32, y, h, 0, true);
  return h + 32;
}

// =================================================================== Big Ben + Parlement
export function bigBen(b: Batch, x: number, y: number, z: number) {
  const stone = facadeMaterial(gothic(31));
  const tower = gothic(31);
  b.addAt(facadeBox(12, 12, 0, 58, tower, 3, 4.5, 0, 0), stone, x, y, z);
  // cadran
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c9a84a'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#f6f0de'; g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#1a1a1a'; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#1a1a1a';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.save(); g.translate(128 + Math.sin(a) * 92, 128 - Math.cos(a) * 92); g.rotate(a); g.fillRect(-4, -12, 8, 24); g.restore();
  }
  const clockTex = new THREE.CanvasTexture(c);
  clockTex.colorSpace = THREE.SRGBColorSpace;
  const clockMat = new THREE.MeshStandardMaterial({ map: clockTex, emissiveMap: clockTex, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.4 });
  clockMat.userData.emissiveBoost = 0.6;
  nightMaterials.push(clockMat);
  const block = new THREE.BoxGeometry(14, 14, 14);
  block.translate(0, 58 + 7, 0);
  b.addAt(block, stoneMat(limestone(41, '#cdb88c', 18), 4), x, y, z);
  const faces = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), clockMat);
    f.position.set(Math.sin((k * Math.PI) / 2) * 7.05, 65, Math.cos((k * Math.PI) / 2) * 7.05);
    f.rotation.y = (k * Math.PI) / 2;
    faces.add(f);
  }
  // aiguilles (animées)
  const hands: THREE.Mesh[] = [];
  const handMat = std(0x111111, 0.4, 0.6);
  for (let k = 0; k < 4; k++) {
    for (const [len, w] of [[3.4, 0.35], [4.4, 0.22]] as const) {
      const hgeo = new THREE.BoxGeometry(w, len, 0.1);
      hgeo.translate(0, len / 2, 0);
      const hm = new THREE.Mesh(hgeo, handMat);
      hm.position.set(Math.sin((k * Math.PI) / 2) * 7.15, 65, Math.cos((k * Math.PI) / 2) * 7.15);
      hm.rotation.y = (k * Math.PI) / 2;
      faces.add(hm);
      hands.push(hm);
    }
  }
  faces.position.set(x, y, z);
  // beffroi et flèche
  const bel = new THREE.BoxGeometry(11, 8, 11);
  bel.translate(0, 76, 0);
  b.addAt(bel, stone, x, y, z);
  const roof = new THREE.ConeGeometry(8.2, 22, 4);
  roof.rotateY(Math.PI / 4);
  roof.translate(0, 91, 0);
  b.addAt(roof, std(0x3a4a48, 0.5, 0.6), x, y, z);
  const pin = new THREE.CylinderGeometry(0.15, 0.4, 8, 6);
  pin.translate(0, 105, 0);
  b.addAt(pin, std(0xd8b04a, 0.3, 1), x, y, z);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const p = new THREE.ConeGeometry(0.8, 5, 4);
    p.translate(sx * 6, 74.5, sz * 6);
    b.addAt(p, std(0xd8b04a, 0.3, 1), x, y, z);
  }
  addBox(x, z, 14, 14, y, y + 90);
  const update = (hour: number) => {
    for (let i = 0; i < hands.length; i += 2) {
      hands[i].rotation.z = -((hour % 12) / 12) * Math.PI * 2;
      hands[i + 1].rotation.z = -((hour % 1)) * Math.PI * 2;
    }
  };
  return { group: faces, update };
}

export function parliament(b: Batch, x: number, y: number, z: number, length: number) {
  const set = gothic(32);
  const mat = facadeMaterial(set);
  b.addAt(facadeBox(length, 26, 0, 22, set, 3, 4.5, 0, 0), mat, x, y, z);
  const roofMat = std(0x3e4a4c, 0.6, 0.4);
  const r = new THREE.BoxGeometry(length - 2, 6, 20);
  r.translate(0, 25, 0);
  b.addAt(r, roofMat, x, y, z);
  for (let i = -length / 2 + 6; i < length / 2 - 4; i += 12) {
    for (const s of [-1, 1]) {
      const t = new THREE.CylinderGeometry(0.6, 0.9, 10, 6);
      t.translate(i, 27, s * 12.5);
      b.addAt(t, mat, x, y, z);
      const sp = new THREE.ConeGeometry(1, 4, 6);
      sp.translate(i, 34, s * 12.5);
      b.addAt(sp, roofMat, x, y, z);
    }
  }
  // Tour Victoria
  b.addAt(facadeBox(18, 18, 0, 60, set, 3, 4.5, 0, 0, true), mat, x - length / 2 + 9, y, z);
  addBox(x, z, length, 26, y, y + 30, 0, true);
  addBox(x - length / 2 + 9, z, 18, 18, y, y + 60, 0, true);
}

// =================================================================== Grande roue (London Eye)
export function ferrisWheel(x: number, y: number, z: number, rotY: number) {
  const g = new THREE.Group();
  const white = std(0xf2f4f6, 0.35, 0.6);
  const R = 45;
  const legs = new THREE.Group();
  for (const s of [-1, 1]) {
    legs.add(new THREE.Mesh(beam(new THREE.Vector3(-20, 0, s * 9), new THREE.Vector3(0, R + 4, s * 2), 1.6), white));
    legs.add(new THREE.Mesh(beam(new THREE.Vector3(20, 0, s * 9), new THREE.Vector3(0, R + 4, s * 2), 1.6), white));
  }
  g.add(legs);
  const wheel = new THREE.Group();
  wheel.position.y = R + 4;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.7, 8, 96), white);
  const rim2 = rim.clone();
  rim.position.z = 1.5;
  rim2.position.z = -1.5;
  wheel.add(rim, rim2);
  const spokes: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    for (const zz of [-1.5, 1.5]) spokes.push(beam(new THREE.Vector3(0, 0, zz * 0.3), new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, zz), 0.15));
  }
  wheel.add(new THREE.Mesh(mergeGeometries(spokes)!, white));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 5, 16), white);
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);
  const podMat = new THREE.MeshPhysicalMaterial({ color: 0xcfe8ff, roughness: 0.05, metalness: 0, transmission: 0.3, transparent: true, opacity: 0.75 });
  const podLight = glowMat(0x9fd3ff, 1.2);
  const pods: THREE.Group[] = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const pod = new THREE.Group();
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.8, 16, 10), podMat);
    cap.scale.set(1.6, 1, 1);
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.12, 6, 20), podLight);
    band.rotation.x = Math.PI / 2;
    band.scale.set(1.6, 1, 1);
    pod.add(cap, band);
    pod.position.set(Math.cos(a) * (R + 2.4), Math.sin(a) * (R + 2.4), 0);
    wheel.add(pod);
    pods.push(pod);
  }
  g.add(wheel);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  addCircle(x, z, 4, y, y + 10);
  const update = (time: number) => {
    wheel.rotation.z = time * 0.012;
    for (const p of pods) p.rotation.z = -wheel.rotation.z;
  };
  return { group: g, update, wheel, pods, R };
}

// =================================================================== Tower Bridge
export function towerBridge(b: Batch, x: number, y: number, z: number, span: number, waterY: number) {
  const set = limestone(51, '#cbbd9e', 16);
  const stone = stoneMat(set, 4);
  const blue = std(0x5d8fc4, 0.5, 0.5);
  const deckY = y;
  // tours
  for (const s of [-1, 1]) {
    const tx = x, tz = z + s * span * 0.2;
    const t = new THREE.BoxGeometry(16, 48, 12);
    t.translate(0, waterY + 24 - 3, 0);
    b.addAt(t, stone, tx, 0, tz);
    const roof = new THREE.ConeGeometry(9, 12, 4);
    roof.rotateY(Math.PI / 4);
    roof.translate(0, waterY + 45 + 6, 0);
    b.addAt(roof, std(0x3c4447, 0.6, 0.4), tx, 0, tz);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const tur = new THREE.CylinderGeometry(1.2, 1.2, 8, 8);
      tur.translate(sx * 7.6, waterY + 49, sz * 5.6);
      b.addAt(tur, stone, tx, 0, tz);
      const sp = new THREE.ConeGeometry(1.6, 4, 8);
      sp.translate(sx * 7.6, waterY + 55, sz * 5.6);
      b.addAt(sp, std(0x3c4447, 0.6, 0.4), tx, 0, tz);
    }
    addBox(tx, tz, 16, 12, waterY - 4, waterY + 48);
  }
  // passerelles hautes
  for (const off of [-3, 3]) {
    const w = new THREE.BoxGeometry(3, 3.5, span * 0.4 - 12);
    w.translate(off, waterY + 40, 0);
    b.addAt(w, blue, x, 0, z);
  }
  // tablier routier
  const deck = new THREE.BoxGeometry(14, 1.2, span);
  deck.translate(0, deckY - 0.6, 0);
  b.addAt(deck, blue, x, 0, z);
  const road = slab(10, span, 0, 0.05, 6);
  b.addAt(road, pbr('asphalt', { scale: 6 }), x, deckY - 0.05, z, 0, false);
  for (const s of [-1, 1]) {
    const rail = new THREE.BoxGeometry(0.4, 1.2, span);
    rail.translate(s * 6.8, deckY + 0.6, 0);
    b.addAt(rail, blue, x, 0, z);
    addBox(x + s * 6.8, z, 0.4, span, deckY - 1, deckY + 1.2);
  }
  addBox(x, z, 14, span, deckY - 1.2, deckY, 0, true);
}

// =================================================================== Japon
export function torii(b: Batch, x: number, y: number, z: number, scale = 1, rot = 0) {
  const red = std(0xd23a22, 0.55);
  const black = std(0x1d1a18, 0.6);
  const g = new THREE.Group();
  const s = scale;
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * s, 0.42 * s, 8 * s, 12), red);
    p.position.set(sx * 3.2 * s, 4 * s, 0);
    g.add(p);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * s, 0.5 * s, 0.8 * s, 12), black);
    foot.position.set(sx * 3.2 * s, 0.4 * s, 0);
    g.add(foot);
  }
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(8 * s, 0.45 * s, 0.4 * s), red);
  nuki.position.y = 6.2 * s;
  g.add(nuki);
  // kasagi incurvé
  const shape = new THREE.Shape();
  shape.moveTo(-5.4 * s, 0.6 * s);
  shape.quadraticCurveTo(0, -0.2 * s, 5.4 * s, 0.6 * s);
  shape.lineTo(5.4 * s, 1.1 * s);
  shape.quadraticCurveTo(0, 0.3 * s, -5.4 * s, 1.1 * s);
  shape.closePath();
  const kg = new THREE.ExtrudeGeometry(shape, { depth: 0.8 * s, bevelEnabled: false });
  kg.translate(0, 7.6 * s, -0.4 * s);
  g.add(new THREE.Mesh(kg, black));
  const sh = shape.clone();
  const kg2 = new THREE.ExtrudeGeometry(sh, { depth: 0.6 * s, bevelEnabled: false });
  kg2.translate(0, 7.1 * s, -0.3 * s);
  g.add(new THREE.Mesh(kg2, red));
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  b.addObject(g, new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z));
  for (const sx of [-1, 1]) {
    const cs = Math.cos(rot), sn = Math.sin(rot);
    addCircle(x + sx * 3.2 * s * cs, z - sx * 3.2 * s * sn, 0.5 * s, y - 5, y + 8 * s);
  }
}

export function pagoda(b: Batch, x: number, y: number, z: number, levels = 5) {
  const wood = std(0x9a2f22, 0.7);
  const wall = std(0xf0e6d2, 0.9);
  const roofTex = std(0x3a3d42, 0.6, 0.2);
  let h = y + 1.2;
  const base = new THREE.BoxGeometry(14, 1.2, 14);
  base.translate(0, 0.6, 0);
  b.addAt(base, pbr('cobble', { scale: 2 }), x, y, z);
  for (let i = 0; i < levels; i++) {
    const w = 9 - i * 1.1;
    const fh = 4.2 - i * 0.2;
    b.addAt(new THREE.BoxGeometry(w, fh, w).translate(0, fh / 2, 0), wall, x, h, z);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const post = new THREE.BoxGeometry(0.5, fh, 0.5);
      post.translate(sx * w / 2, fh / 2, sz * w / 2);
      b.addAt(post, wood, x, h, z);
    }
    h += fh;
    b.addAt(hipRoof(w, w, 0, 1.6, 2.6 - i * 0.2, 0.6), roofTex, x, h - 0.2, z);
    h += 1.4;
  }
  const sorin = new THREE.CylinderGeometry(0.12, 0.3, 7, 8);
  sorin.translate(0, 3.5, 0);
  b.addAt(sorin, std(0xc9a44a, 0.3, 1), x, h, z);
  for (let k = 0; k < 6; k++) {
    const ring = new THREE.TorusGeometry(0.5, 0.08, 6, 16);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, 1 + k * 0.7, 0);
    b.addAt(ring, std(0xc9a44a, 0.3, 1), x, h, z);
  }
  addBox(x, z, 10, 10, y, h, 0, true);
}

export function stoneLantern(b: Batch, x: number, y: number, z: number) {
  const stone = std(0x9a9a92, 0.95);
  const parts: [THREE.BufferGeometry, number][] = [
    [new THREE.CylinderGeometry(0.5, 0.6, 0.3, 6), 0.15],
    [new THREE.CylinderGeometry(0.18, 0.22, 1.2, 8), 0.9],
    [new THREE.CylinderGeometry(0.5, 0.4, 0.25, 6), 1.6],
    [new THREE.BoxGeometry(0.6, 0.55, 0.6), 2.0],
    [new THREE.ConeGeometry(0.75, 0.5, 6), 2.5],
  ];
  for (const [g, yy] of parts) b.addAt(g.translate(0, yy, 0), stone, x, y, z);
  const glow = glowMat(0xffb060, 2.5);
  b.addAt(new THREE.BoxGeometry(0.4, 0.35, 0.62).translate(0, 2.0, 0), glow, x, y, z, 0, false);
  addCircle(x, z, 0.55, y, y + 2.8);
}

// =================================================================== Désert
export function pyramid(b: Batch, x: number, y: number, z: number, s: number) {
  const set = limestone(61, '#d9bb84', 12);
  const mat = stoneMat(set, 3);
  const g = new THREE.ConeGeometry(s * 0.71, s * 0.64, 4, 1);
  g.rotateY(Math.PI / 4);
  g.translate(0, (s * 0.64) / 2, 0);
  // UV en mètres
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + pos.getZ(i)) * 0.7, pos.getY(i) * 1.2);
  b.addAt(g, mat, x, y - 0.5, z);
  // collision en gradins (on peut grimper un peu !)
  for (let k = 0; k < 6; k++) {
    const t = k / 6;
    const half = (s / 2) * (1 - t);
    addBox(x, z, half * 2, half * 2, y - 1, y + s * 0.64 * (t + 1 / 6) * 0.98, 0, true);
  }
}

export function sphinxCapy(b: Batch, x: number, y: number, z: number, rot: number) {
  const mat = stoneMat(limestone(71, '#d4b47e', 14), 3);
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(10, 7, 26), mat);
  body.position.set(0, 3.5, -4);
  const head = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 9), mat);
  head.position.set(0, 10, 9);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 4), mat);
  snout.position.set(0, 8.5, 14.5);
  const paws = [-3, 3].map((sx) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 10), mat);
    p.position.set(sx, 1.25, 12);
    return p;
  });
  const ears = [-3, 3].map((sx) => {
    const e = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1.2), mat);
    e.position.set(sx, 14.6, 6.5);
    return e;
  });
  const nemes = new THREE.Mesh(new THREE.BoxGeometry(9.5, 7, 3), std(0x3a6fb0, 0.8));
  nemes.position.set(0, 9.5, 5.2);
  g.add(body, head, snout, ...paws, ...ears, nemes);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  b.addObject(g, new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z));
  addCircle(x, z, 11, y, y + 12);
}

// =================================================================== Pôle Nord
export function igloo(b: Batch, x: number, y: number, z: number, r = 3.5, rot = 0) {
  const snow = pbr('snow', { scale: 2, color: 0xffffff });
  const dome = new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  // rangées de blocs de glace
  const pos = dome.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const yy = pos.getY(i);
    const k = 1 - Math.abs(Math.sin((yy / r) * Math.PI * 4)) * 0.025;
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  dome.computeVertexNormals();
  b.addAt(dome, snow, x, y - 0.2, z, rot);
  const tunnel = new THREE.CylinderGeometry(1.2, 1.2, 2.4, 12, 1, false, 0, Math.PI);
  tunnel.rotateZ(Math.PI / 2);
  tunnel.rotateY(Math.PI / 2);
  tunnel.translate(0, 0, r - 0.3);
  const m = new THREE.Matrix4().makeRotationY(rot).setPosition(x, y - 0.2, z);
  b.add(tunnel, snow, m);
  const glow = glowMat(0xffb060, 2);
  const door = new THREE.CircleGeometry(0.95, 16, 0, Math.PI);
  door.translate(0, 0, r + 0.92);
  b.add(door, glow, m, false);
  addCircle(x, z, r, y - 1, y + r - 0.5, true);
}

export function christmasTree(b: Batch, x: number, y: number, z: number, s = 1) {
  const green = std(0x1f5a32, 0.85);
  for (let i = 0; i < 5; i++) {
    const c = new THREE.ConeGeometry((4.5 - i * 0.8) * s, 3.6 * s, 14);
    c.translate(0, (2.5 + i * 2.2) * s, 0);
    b.addAt(c, green, x, y, z);
  }
  b.addAt(new THREE.CylinderGeometry(0.5 * s, 0.6 * s, 2 * s).translate(0, 1, 0), std(0x5a3a22), x, y, z);
  const star = glowMat(0xffd84a, 4, 0.6);
  b.addAt(new THREE.OctahedronGeometry(0.9 * s).translate(0, 14.2 * s, 0), star, x, y, z, 0, false);
  const rng = new Rng(9);
  const cols = [0xff3040, 0x40a0ff, 0xffd040, 0xffffff];
  const balls = cols.map((c) => glowMat(c, 3, 0.4));
  for (let i = 0; i < 60; i++) {
    const t = rng.next();
    const hy = (1.5 + t * 11.5) * s;
    const r = (4.6 - t * 4.2) * s * 0.95;
    const a = rng.next() * Math.PI * 2;
    b.addAt(new THREE.SphereGeometry(0.28 * s, 8, 6).translate(Math.cos(a) * r, hy, Math.sin(a) * r), balls[i % 4], x, y, z, 0, false);
  }
  addCircle(x, z, 2.5 * s, y, y + 14 * s);
}

// =================================================================== Capyville
export function windmill(x: number, y: number, z: number) {
  const g = new THREE.Group();
  const set = limestone(81, '#efe6d6', 22);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.4, 13, 16), stoneMat(set, 3));
  tower.position.y = 6.5;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(4, 4, 16), std(0x8a3b2a, 0.8));
  cap.position.y = 15;
  g.add(tower, cap);
  const blades = new THREE.Group();
  blades.position.set(0, 13, 3.8);
  const wood = std(0x6e4a2c, 0.9);
  const sail = std(0xf6efe0, 0.95, 0, { side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.z = (i * Math.PI) / 2;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 10, 0.3), wood);
    bar.position.y = 5;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 7.5), sail);
    cloth.position.set(1.05, 5.8, 0);
    arm.add(bar, cloth);
    blades.add(arm);
  }
  g.add(blades);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  g.position.set(x, y, z);
  addCircle(x, z, 4.4, y, y + 14);
  return { group: g, update: (t: number) => (blades.rotation.z = t * 0.6) };
}

export function makeSignMesh(lines: string[], bg: string, fg: string, w: number, h: number) {
  const set = signTexture(lines, bg, fg);
  const mat = new THREE.MeshStandardMaterial({ map: set.map, emissiveMap: set.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.5 });
  mat.userData.emissiveBoost = 1.2;
  mat.userData.baseEmissive = 0.5;
  nightMaterials.push(mat);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}
