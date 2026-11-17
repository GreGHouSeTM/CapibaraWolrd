// Repères visuels : colonnes de lumière, anneaux de passage, objets à ramasser, pièces.
import * as THREE from 'three';

export type ItemKind = 'croissant' | 'yuzu' | 'umbrella' | 'scarab' | 'gift' | 'star' | 'coin' | 'baby';

const beamMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(1, 0.85, 0.2) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
    void main(){ float a = (1.0 - vUv.y) * (0.5 + 0.5 * sin(vUv.y * 20.0 - uTime * 4.0)) * 0.6 + (1.0 - vUv.y) * 0.25;
      float edge = 1.0 - abs(vUv.x - 0.5) * 2.0; gl_FragColor = vec4(uColor * 2.0, a * edge); }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
});

function itemMesh(kind: ItemKind): THREE.Object3D {
  const g = new THREE.Group();
  const m = (c: number, r = 0.4, me = 0, e = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: me, emissive: c, emissiveIntensity: e });
  switch (kind) {
    case 'coin': {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 24), m(0xffc83a, 0.25, 1, 0.25));
      c.rotation.x = Math.PI / 2;
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 24), m(0xffe27a, 0.3, 1, 0.2));
      inner.rotation.x = Math.PI / 2;
      g.add(c, inner);
      break;
    }
    case 'croissant': {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.16, 10, 16, Math.PI * 1.3), m(0xd89a4a, 0.6, 0, 0.15));
      g.add(t);
      break;
    }
    case 'yuzu': {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), m(0xffa31a, 0.4, 0, 0.25)));
      break;
    }
    case 'umbrella': {
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.35, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, side: THREE.DoubleSide, roughness: 0.5 }));
      top.position.y = 0.5;
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1), m(0x6a4a2a));
      g.add(top, stick);
      break;
    }
    case 'scarab': {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 10), m(0x2fc8a0, 0.2, 1, 0.3));
      s.scale.set(1, 0.6, 1.3);
      const gold = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 6, 20), m(0xffc83a, 0.2, 1, 0.3));
      gold.rotation.x = Math.PI / 2;
      g.add(s, gold);
      break;
    }
    case 'gift': {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), m(0xd81e2a, 0.5, 0, 0.15)));
      const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.12), m(0xffd23b, 0.3, 0.5, 0.2));
      const r2 = r1.clone();
      r2.rotation.y = Math.PI / 2;
      g.add(r1, r2);
      break;
    }
    case 'star': {
      const s = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.25 : 0.6;
        if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.15, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05 });
      geo.center();
      g.add(new THREE.Mesh(geo, m(0xffe24a, 0.2, 1, 0.5)));
      break;
    }
    case 'baby': {
      break;
    }
  }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

export class Markers {
  group = new THREE.Group();
  private beacon: THREE.Mesh;
  private ring: THREE.Mesh;
  private ringNext: THREE.Mesh;
  private items: { obj: THREE.Object3D; pos: THREE.Vector3 }[] = [];
  private arrow: THREE.Mesh;
  beaconPos: THREE.Vector3 | null = null;

  constructor() {
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 90, 16, 1, true), beamMat);
    this.beacon.geometry.translate(0, 45, 0);
    this.beacon.visible = false;
    this.beacon.renderOrder = 5;
    const rmat = new THREE.MeshStandardMaterial({ color: 0x40e0ff, emissive: 0x40e0ff, emissiveIntensity: 1.5, transparent: true, opacity: 0.85 });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(5, 0.35, 10, 48), rmat);
    this.ringNext = new THREE.Mesh(new THREE.TorusGeometry(5, 0.2, 8, 48), new THREE.MeshBasicMaterial({ color: 0x40e0ff, transparent: true, opacity: 0.25 }));
    this.ring.visible = this.ringNext.visible = false;
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.4, 4), new THREE.MeshStandardMaterial({ color: 0xffd23b, emissive: 0xffa000, emissiveIntensity: 1 }));
    this.arrow.rotation.x = Math.PI;
    this.arrow.visible = false;
    this.group.add(this.beacon, this.ring, this.ringNext, this.arrow);
  }

  setBeacon(p: THREE.Vector3 | null, color = 0xffd23b) {
    this.beaconPos = p;
    this.beacon.visible = !!p;
    this.arrow.visible = !!p;
    if (p) {
      this.beacon.position.copy(p);
      (beamMat.uniforms.uColor.value as THREE.Color).setHex(color);
    }
  }

  setRings(cur: THREE.Vector3 | null, next: THREE.Vector3 | null, size = 5) {
    this.ring.visible = !!cur;
    this.ringNext.visible = !!next;
    if (cur) {
      this.ring.position.copy(cur).setY(cur.y + size * 0.7);
      this.ring.scale.setScalar(size / 5);
      if (next) this.ring.lookAt(next.clone().setY(cur.y + size * 0.7));
    }
    if (next) {
      this.ringNext.position.copy(next).setY(next.y + size * 0.7);
      this.ringNext.scale.setScalar(size / 5);
      this.ringNext.lookAt(cur ? cur.clone().setY(next.y + size * 0.7) : next);
    }
  }

  setItems(list: { pos: THREE.Vector3; kind: ItemKind }[]) {
    for (const it of this.items) this.group.remove(it.obj);
    this.items = list.map((l) => {
      const obj = itemMesh(l.kind);
      obj.position.copy(l.pos);
      this.group.add(obj);
      return { obj, pos: l.pos };
    });
  }

  hideItem(i: number) {
    if (this.items[i]) this.items[i].obj.visible = false;
  }

  update(time: number) {
    beamMat.uniforms.uTime.value = time;
    for (const [i, it] of this.items.entries()) {
      it.obj.rotation.y = time * 2 + i;
      it.obj.position.y = it.pos.y + 0.3 + Math.sin(time * 3 + i) * 0.15;
    }
    if (this.arrow.visible && this.beaconPos) {
      this.arrow.position.copy(this.beaconPos).setY(this.beaconPos.y + 4 + Math.sin(time * 3) * 0.5);
      this.arrow.rotation.y = time * 2;
    }
    this.ring.rotation.z = time;
  }
}

/** Pièces dispersées dans le monde (instanciées). */
export class CoinField {
  mesh: THREE.InstancedMesh;
  positions: THREE.Vector3[];
  taken: Set<number>;
  private dummy = new THREE.Object3D();
  constructor(positions: THREE.Vector3[], taken: number[]) {
    this.positions = positions;
    this.taken = new Set(taken);
    const geo = new THREE.CylinderGeometry(0.42, 0.42, 0.09, 20);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffc83a, roughness: 0.22, metalness: 1, emissive: 0xffa020, emissiveIntensity: 0.25 });
    this.mesh = new THREE.InstancedMesh(geo, mat, positions.length);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
  }
  update(time: number) {
    const d = this.dummy;
    for (let i = 0; i < this.positions.length; i++) {
      if (this.taken.has(i)) d.scale.setScalar(0);
      else d.scale.setScalar(1);
      d.position.copy(this.positions[i]);
      d.position.y += 0.8 + Math.sin(time * 2.5 + i) * 0.12;
      d.rotation.set(0, time * 2.4 + i, 0);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  /** Ramasse les pièces proches ; renvoie les indices pris. */
  collect(p: THREE.Vector3, r: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.positions.length; i++) {
      if (this.taken.has(i)) continue;
      const q = this.positions[i];
      if (Math.abs(q.x - p.x) < r && Math.abs(q.z - p.z) < r && Math.abs(q.y + 0.8 - p.y) < r + 1.2) {
        this.taken.add(i);
        out.push(i);
      }
    }
    return out;
  }
}

export { itemMesh };
