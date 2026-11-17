// Le capybara : modèle procédural (corps, tête carrée, petites oreilles), fourrure et animations procédurales.
import * as THREE from 'three';
import { Rng, clamp, lerp } from '../core/math';

let furTextures: { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } | null = null;

/** Texture de fourrure générée : fines mèches orientées. */
function makeFurTextures() {
  if (furTextures) return furTextures;
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, S, S);
  const r = new Rng(42);
  for (let i = 0; i < 9000; i++) {
    const x = r.next() * S, y = r.next() * S;
    const l = 6 + r.next() * 14;
    const v = Math.floor(90 + r.next() * 90);
    g.strokeStyle = `rgba(${v},${v},${v},0.55)`;
    g.lineWidth = 1 + r.next() * 1.2;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + r.range(-2, 2), y + l * 0.5, x + r.range(-3, 3), y + l);
    g.stroke();
  }
  // carte de normales approchée à partir des niveaux de gris
  const src = g.getImageData(0, 0, S, S).data;
  const nc = document.createElement('canvas');
  nc.width = nc.height = S;
  const ng = nc.getContext('2d')!;
  const out = ng.createImageData(S, S);
  const H = (x: number, y: number) => src[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = (H(x - 1, y) - H(x + 1, y)) * 2.5;
      const dy = (H(x, y - 1) - H(x, y + 1)) * 2.5;
      const l = Math.hypot(dx, dy, 1);
      const o = (y * S + x) * 4;
      out.data[o] = ((dx / l) * 0.5 + 0.5) * 255;
      out.data[o + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      out.data[o + 2] = (1 / l) * 255;
      out.data[o + 3] = 255;
    }
  ng.putImageData(out, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.NoColorSpace;
  const normal = new THREE.CanvasTexture(nc);
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  furTextures = { map, normal };
  return furTextures;
}

/** Déforme une sphère : forme « super-ellipsoïde » (plus carrée quand p < 1). */
function superSphere(rx: number, ry: number, rz: number, p: number, seg = 40, shape?: (v: THREE.Vector3) => void) {
  const geo = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75));
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.set(Math.sign(v.x) * Math.abs(v.x) ** p, Math.sign(v.y) * Math.abs(v.y) ** p, Math.sign(v.z) * Math.abs(v.z) ** p);
    v.set(v.x * rx, v.y * ry, v.z * rz);
    shape?.(v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export type HatId = 'none' | 'beret' | 'tophat' | 'cap' | 'kasa' | 'bonnet' | 'yuzu' | 'crown' | 'flower' | 'chef' | 'safari';

export const HATS: { id: HatId; name: string; price: number }[] = [
  { id: 'none', name: 'Tête nue', price: 0 },
  { id: 'yuzu', name: 'Le yuzu', price: 0 },
  { id: 'flower', name: 'Couronne de fleurs', price: 30 },
  { id: 'beret', name: 'Béret parisien', price: 40 },
  { id: 'cap', name: 'Casquette de New York', price: 40 },
  { id: 'tophat', name: 'Chapeau haut-de-forme', price: 50 },
  { id: 'kasa', name: 'Chapeau de paille', price: 50 },
  { id: 'safari', name: 'Chapeau d’explorateur', price: 50 },
  { id: 'bonnet', name: 'Bonnet de Noël', price: 60 },
  { id: 'chef', name: 'Toque de chef', price: 60 },
  { id: 'crown', name: 'Couronne royale', price: 150 },
];

export function makeHat(id: HatId): THREE.Object3D | null {
  const g = new THREE.Group();
  const std = (color: number, rough = 0.7, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
  switch (id) {
    case 'none':
      return null;
    case 'beret': {
      const m = new THREE.Mesh(superSphere(0.17, 0.05, 0.17, 1, 24), std(0x1d1d2b, 0.9));
      m.position.y = 0.03;
      m.rotation.z = 0.25;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.04), std(0x1d1d2b));
      stem.position.set(0, 0.09, 0);
      g.add(m, stem);
      break;
    }
    case 'tophat': {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.015, 32), std(0x111111, 0.5));
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.24, 32), std(0x111111, 0.45));
      top.position.y = 0.12;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.122, 0.122, 0.04, 32), std(0xaa1122));
      band.position.y = 0.03;
      g.add(brim, top, band);
      break;
    }
    case 'cap': {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(0x1e4fa8));
      const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.012, 24, 1, false, -Math.PI / 2, Math.PI), std(0x163a7d));
      visor.position.set(0, 0.0, 0.1);
      visor.scale.z = 1.2;
      g.add(dome, visor);
      break;
    }
    case 'kasa': {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.14, 32), std(0xd8b56a, 0.95));
      cone.position.y = 0.07;
      g.add(cone);
      break;
    }
    case 'bonnet': {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 24), std(0xc8102e, 0.8));
      cone.position.set(0, 0.15, -0.03);
      cone.rotation.x = -0.5;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 12, 24), std(0xffffff, 1));
      rim.rotation.x = Math.PI / 2;
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), std(0xffffff, 1));
      pom.position.set(0, 0.25, -0.17);
      g.add(cone, rim, pom);
      break;
    }
    case 'yuzu': {
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), std(0xffa31a, 0.45));
      fruit.position.y = 0.09;
      fruit.scale.y = 0.9;
      const leaf = new THREE.Mesh(superSphere(0.05, 0.008, 0.025, 1, 10), std(0x2f8f2f));
      leaf.position.set(0.03, 0.185, 0);
      leaf.rotation.z = 0.4;
      g.add(fruit, leaf);
      break;
    }
    case 'crown': {
      const gold = std(0xffc83d, 0.25, { metalness: 1 });
      const ringG = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 24, 1, true), gold);
      ringG.position.y = 0.03;
      g.add(ringG);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 8), gold);
        sp.position.set(Math.sin(a) * 0.12, 0.1, Math.cos(a) * 0.12);
        const gem = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), std(i % 2 ? 0xe0115f : 0x1a7fe0, 0.1));
        gem.position.set(Math.sin(a) * 0.123, 0.03, Math.cos(a) * 0.123);
        g.add(sp, gem);
      }
      break;
    }
    case 'flower': {
      const cols = [0xff6fa8, 0xffe14d, 0xffffff, 0xb07cff, 0xff8a3d];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), std(cols[i % cols.length], 0.6));
        f.position.set(Math.sin(a) * 0.14, 0.01, Math.cos(a) * 0.14);
        f.scale.y = 0.6;
        g.add(f);
      }
      break;
    }
    case 'chef': {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 24), std(0xffffff, 0.9));
      base.position.y = 0.05;
      const puff = new THREE.Mesh(superSphere(0.17, 0.12, 0.17, 1, 24), std(0xffffff, 0.95));
      puff.position.y = 0.17;
      g.add(base, puff);
      break;
    }
    case 'safari': {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.015, 32), std(0xcbb27c, 0.9));
      const top = new THREE.Mesh(superSphere(0.15, 0.1, 0.15, 1, 24), std(0xcbb27c, 0.9));
      top.position.y = 0.04;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.152, 0.03, 32), std(0x5a3d22));
      band.position.y = 0.02;
      g.add(brim, top, band);
      break;
    }
  }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

export interface CapyOptions {
  fur?: number;
  size?: number;
  hat?: HatId;
  scarf?: number | null;
}

export class Capybara {
  root = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private legs: THREE.Group[] = [];
  private eyes: THREE.Mesh[] = [];
  private ears: THREE.Mesh[] = [];
  private hatAnchor = new THREE.Group();
  private hat: THREE.Object3D | null = null;
  hatId: HatId = 'none';
  private phase = Math.random() * 10;
  private blinkT = 2;
  private earT = 3;
  furMat: THREE.MeshPhysicalMaterial;

  constructor(opts: CapyOptions = {}) {
    const tex = makeFurTextures();
    const furColor = new THREE.Color(opts.fur ?? 0x9b6a43);
    this.furMat = new THREE.MeshPhysicalMaterial({
      color: furColor,
      roughness: 0.92,
      roughnessMap: tex.map,
      normalMap: tex.normal,
      normalScale: new THREE.Vector2(0.6, 0.6),
      sheen: 1,
      sheenRoughness: 0.55,
      sheenColor: furColor.clone().lerp(new THREE.Color(1, 0.9, 0.75), 0.5),
    });
    tex.map.repeat.set(3, 3);
    const darkMat = new THREE.MeshPhysicalMaterial({
      color: furColor.clone().multiplyScalar(0.55),
      roughness: 0.95,
      normalMap: tex.normal,
      sheen: 0.6,
      sheenColor: furColor,
    });
    const noseMat = new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.55 });
    const eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x0a0605, roughness: 0.05, clearcoat: 1 });
    const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // Corps en forme de tonneau, arrière-train plus fort
    const bodyGeo = superSphere(0.3, 0.27, 0.5, 0.85, 48, (v) => {
      const rear = clamp(-v.z / 0.5, 0, 1);
      v.x *= 1 + rear * 0.12;
      v.y *= 1 + rear * 0.1;
      if (v.y < 0) v.y *= 0.85; // ventre légèrement aplati
      v.y += rear * 0.03;
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, this.furMat);
    bodyMesh.castShadow = true;
    this.body.add(bodyMesh);
    this.body.position.y = 0.36;
    this.root.add(this.body);

    // Tête : grosse et carrée, museau haut
    this.head.position.set(0, 0.17, 0.4);
    this.body.add(this.head);
    const headGeo = superSphere(0.2, 0.21, 0.32, 0.6, 40, (v) => {
      const front = clamp(v.z / 0.32, 0, 1);
      v.x *= 1 - front * 0.12;
      v.y -= front * 0.02;
      // dessus du crâne plat, joues larges
      if (v.y > 0.12) v.y = 0.12 + (v.y - 0.12) * 0.5;
    });
    const headMesh = new THREE.Mesh(headGeo, this.furMat);
    headMesh.position.set(0, 0.02, 0.14);
    headMesh.rotation.x = 0.22;
    headMesh.castShadow = true;
    this.head.add(headMesh);
    // truffe
    const nose = new THREE.Mesh(superSphere(0.075, 0.045, 0.025, 0.8, 20), noseMat);
    nose.position.set(0, 0.0, 0.455);
    nose.rotation.x = 0.1;
    this.head.add(nose);
    for (const s of [-1, 1]) {
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      nostril.position.set(s * 0.03, 0.005, 0.475);
      this.head.add(nostril);
      // yeux placés haut sur la tête
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.033, 16, 12), eyeMat);
      eye.position.set(s * 0.17, 0.1, 0.12);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), shineMat);
      shine.position.set(s * 0.008, 0.014, 0.026);
      eye.add(shine);
      this.head.add(eye);
      this.eyes.push(eye);
      // oreilles
      const ear = new THREE.Mesh(superSphere(0.055, 0.06, 0.028, 1, 16), darkMat);
      ear.position.set(s * 0.13, 0.19, -0.06);
      ear.rotation.set(-0.2, s * 0.3, s * -0.3);
      ear.castShadow = true;
      this.head.add(ear);
      this.ears.push(ear);
    }
    // bouche (petit trait sombre)
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.01), noseMat);
    mouth.position.set(0, -0.09, 0.44);
    mouth.rotation.x = 0.4;
    this.head.add(mouth);

    // pattes
    const legGeo = new THREE.CapsuleGeometry(0.08, 0.12, 6, 12);
    legGeo.translate(0, -0.1, 0);
    const footGeo = superSphere(0.085, 0.04, 0.1, 1, 12);
    const legPos: [number, number, number][] = [
      [0.16, -0.12, 0.28], [-0.16, -0.12, 0.28], [0.18, -0.12, -0.3], [-0.18, -0.12, -0.3],
    ];
    for (const p of legPos) {
      const pivot = new THREE.Group();
      pivot.position.set(...p);
      const leg = new THREE.Mesh(legGeo, darkMat);
      leg.castShadow = true;
      const foot = new THREE.Mesh(footGeo, darkMat);
      foot.position.set(0, -0.22, 0.03);
      pivot.add(leg, foot);
      this.body.add(pivot);
      this.legs.push(pivot);
    }

    // Écharpe optionnelle (PNJ)
    if (opts.scarf != null) {
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 10, 24), new THREE.MeshStandardMaterial({ color: opts.scarf, roughness: 0.9 }));
      scarf.position.set(0, 0.08, 0.36);
      scarf.rotation.x = Math.PI / 2 + 0.5;
      scarf.scale.set(1, 1.15, 1);
      this.body.add(scarf);
    }

    this.hatAnchor.position.set(0, 0.17, 0.08);
    this.head.add(this.hatAnchor);
    this.setHat(opts.hat ?? 'none');
    this.root.scale.setScalar(opts.size ?? 1);
  }

  setHat(id: HatId) {
    if (this.hat) this.hatAnchor.remove(this.hat);
    this.hatId = id;
    this.hat = makeHat(id);
    if (this.hat) this.hatAnchor.add(this.hat);
  }

  /**
   * Anime le capybara.
   * @param speed vitesse horizontale (m/s)
   * @param state 'ground' | 'air' | 'swim' | 'sit'
   */
  animate(dt: number, speed: number, state: 'ground' | 'air' | 'swim' | 'sit', time: number) {
    const s = this.root.scale.x;
    const gait = clamp(speed / 6, 0, 1.6);
    this.phase += dt * (3 + speed * 2.6) / s;
    const p = this.phase;
    const legAmp = state === 'swim' ? 0.9 : state === 'air' ? 0.5 : 0.75 * Math.min(1, gait * 1.6);
    const legs = this.legs;
    if (state === 'sit') {
      legs.forEach((l, i) => (l.rotation.x = lerp(l.rotation.x, i < 2 ? -1.2 : 1.3, 1 - Math.exp(-dt * 8))));
      this.body.rotation.x = lerp(this.body.rotation.x, 0, 1 - Math.exp(-dt * 6));
      this.body.position.y = lerp(this.body.position.y, 0.22, 1 - Math.exp(-dt * 6));
    } else {
      const a = Math.sin(p) * legAmp, b = Math.sin(p + Math.PI) * legAmp;
      if (state === 'air') {
        legs[0].rotation.x = -0.7; legs[1].rotation.x = -0.7; legs[2].rotation.x = 0.8; legs[3].rotation.x = 0.8;
      } else {
        legs[0].rotation.x = a; legs[3].rotation.x = a; legs[1].rotation.x = b; legs[2].rotation.x = b;
      }
      const bob = state === 'ground' ? Math.abs(Math.sin(p)) * 0.035 * Math.min(1, gait * 2) : 0;
      const breathe = Math.sin(time * 2.2) * 0.006;
      const baseY = state === 'swim' ? 0.28 : 0.36;
      this.body.position.y = lerp(this.body.position.y, baseY + bob + breathe, 1 - Math.exp(-dt * 12));
      this.body.rotation.z = Math.sin(p) * 0.03 * gait;
      const pitch = state === 'air' ? -0.12 : state === 'swim' ? -0.08 : Math.sin(p * 2) * 0.02 * gait;
      this.body.rotation.x = lerp(this.body.rotation.x, pitch, 1 - Math.exp(-dt * 8));
    }
    // tête : léger balancement
    this.head.rotation.x = Math.sin(p * 2) * 0.03 * gait + (state === 'swim' ? -0.25 : 0);
    this.head.rotation.y = Math.sin(time * 0.6) * 0.08 * (1 - Math.min(1, gait));
    // clignement des yeux
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12 ? 0.1 : 1;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 4;
    for (const e of this.eyes) e.scale.y = blink;
    // oreilles qui frétillent
    this.earT -= dt;
    const twitch = this.earT < 0.25 ? Math.sin(this.earT * 60) * 0.3 : 0;
    if (this.earT < 0) this.earT = 2 + Math.random() * 5;
    this.ears[0].rotation.z = -0.3 + twitch;
    this.ears[1].rotation.z = 0.3 - twitch;
  }
}
