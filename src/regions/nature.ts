// Régions « nature » : Japon, Désert, Pôle Nord et Capyville (village central).
import * as THREE from 'three';
import { Rng, lerp } from '../core/math';
import { regionById, REGIONS } from '../world/layout';
import { buildCity, CityStyle, building, addLamp } from '../procgen/city';
import { machiya, tokyoModern, adobe, cottage, roofTexture } from '../procgen/facades';
import { Batch, hipRoof, gableRoof, std, facadeMaterial, facadeBox, slab, planarUV } from '../procgen/kit';
import { torii, pagoda, stoneLantern, pyramid, sphinxCapy, igloo, christmasTree, windmill, glowMat, makeSignMesh } from '../procgen/monuments';
import { BuildCtx, RegionContent, emptyContent, rock, signpost, fountain, bench } from './common';
import { FUJI_POS, JP_LAKE, OASIS_POS, PYRAMIDS, HOT_SPRING, HUB_POND, heightAt } from '../world/heightmap';
import { paveCircle, paveRect } from '../world/grass';
import { addBox, addCircle } from '../world/physics';
import { pbr } from '../core/assets';

const groundY = (x: number, z: number) => heightAt(x, z);

// =============================================================================== JAPON
export function buildJapan(ctx: BuildCtx): RegionContent {
  const R = regionById('japan');
  const out = emptyContent('japan');
  const rng = new Rng(81);
  const kawara = roofTexture('kawara');
  const roofMat = new THREE.MeshStandardMaterial({ map: kawara.map, normalMap: kawara.normalMap, roughness: 0.6, color: 0xc0c4c8 });
  const style: CityStyle = {
    facades: [machiya(1), machiya(2), machiya(3)], floorH: 3, bayW: 2.6, shopH: 0,
    floors: (r) => r.int(2, 2), lotWidth: [8, 12], lotDepth: [8, 11], lamp: 'japan', streetTree: 'cherry', roadTex: 'cobble',
    roof: (b, x, z, w, d, top) => b.addAt(hipRoof(w, d, 0, 2.6, 1.3, 0.4), roofMat, x, top, z),
    custom: (b, x, z, w, d, y0, r) => {
      if (r.chance(0.72)) return null;
      const set = r.pick(modern);
      const floors = r.int(4, 8);
      b.addAt(facadeBox(w, d, 0, floors * 3.4, set, 3, 3.4, r.int(0, 3) * 0.25, r.int(0, 3) * 0.25, true), facadeMaterial(set, { emissiveBoost: 1.4 }), x, y0, z);
      return floors * 3.4;
    },
  };
  const modern = [tokyoModern(1), tokyoModern(2), tokyoModern(3), tokyoModern(4)];
  const tc = new THREE.Vector3(R.x + 70, 0, R.z - 20);
  const city = buildCity({
    region: { ...R, x: tc.x, z: tc.z }, halfX: 100, halfZ: 110, block: 34, street: 9, style, seed: 17, forest: ctx.forest,
    kindOf: () => (rng.chance(0.1) ? 'plaza' : 'buildings'),
  });
  out.group.add(city.group);
  out.walkPoints = city.sidewalkPoints;
  out.roadPoints = city.roadPoints;
  out.loops = city.loops;

  const b = new Batch(120);
  // Torii dans le lac (comme sur les cartes postales)
  const toriiPos = new THREE.Vector3(JP_LAKE[0] + 42, -0.5, JP_LAKE[1] + 10);
  torii(b, toriiPos.x, -1.2, toriiPos.z, 1.6, Math.PI / 2 - 0.3);
  torii(b, JP_LAKE[0] + 62, groundY(JP_LAKE[0] + 62, JP_LAKE[1] + 20), JP_LAKE[1] + 20, 0.8, Math.PI / 2 - 0.3);
  out.spots.torii = toriiPos.clone().setY(6);
  out.photos.push({ id: 'torii', name: 'Le torii sur le lac', region: 'japan', target: out.spots.torii, radius: 140 });
  // rochers autour du lac (ambiance image 1)
  const rockMat = pbr('rock', { scale: 4, color: 0xd8d0c0 });
  for (let i = 0; i < 26; i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(52, 78);
    const x = JP_LAKE[0] + Math.cos(a) * d * 1.2, z = JP_LAKE[1] + Math.sin(a) * d;
    rock(b, rockMat, x, groundY(x, z), z, rng.range(1.5, 4.5), i);
  }
  // pagode
  const pg = new THREE.Vector3(R.x - 40, 0, R.z + 110);
  pg.y = groundY(pg.x, pg.z);
  pagoda(b, pg.x, pg.y, pg.z, 5);
  paveCircle(pg.x, pg.z, 10);
  out.spots.pagoda = pg.clone().setY(pg.y + 15);
  out.photos.push({ id: 'pagoda', name: 'La pagode', region: 'japan', target: out.spots.pagoda, radius: 160 });
  out.spots.fuji = new THREE.Vector3(FUJI_POS[0], 180, FUJI_POS[1]);
  out.photos.push({ id: 'fuji', name: 'Le mont Fuji', region: 'japan', target: out.spots.fuji, radius: 700 });
  // allée de lanternes vers la pagode
  for (let t = 0.1; t < 1; t += 0.1) {
    const x = lerp(tc.x - 80, pg.x, t), z = lerp(tc.z + 40, pg.z - 12, t);
    for (const s of [-1, 1]) stoneLantern(b, x + s * 4, groundY(x + s * 4, z), z);
  }
  // cerisiers et bambous
  for (let i = 0; i < 140; i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(85, 220);
    const x = R.x - 60 + Math.cos(a) * d, z = R.z + Math.sin(a) * d;
    if (Math.hypot(x - tc.x, z - tc.z) < 140) continue;
    if (groundY(x, z) < 1) continue;
    ctx.forest.add(rng.chance(0.75) ? 'cherry' : 'bamboo', x, z, rng.range(0.8, 1.3));
  }
  // lanternes de papier suspendues dans la rue principale
  const lanternMat = glowMat(0xff5a3a, 2.5, 0.5);
  for (const p of city.roadPoints.slice(0, 40)) {
    b.addAt(new THREE.SphereGeometry(0.35, 10, 8).scale(1, 1.3, 1).translate(0, 5.6, 0), lanternMat, p.x + 3, p.y, p.z, 0, false);
  }
  out.npcs.push(
    { id: 'monk', name: 'Maître Kenji', pos: pg.clone().add(new THREE.Vector3(6, 0.2, -8)), fur: 0x8a6040, hat: 'kasa', scarf: 0xff8a20 },
    { id: 'boatgirl', name: 'Hana la batelière', pos: new THREE.Vector3(JP_LAKE[0] + 78, groundY(JP_LAKE[0] + 78, JP_LAKE[1] - 6) + 0.1, JP_LAKE[1] - 6), fur: 0xa97b52, hat: 'flower', scarf: 0xff6fa8 },
  );
  out.vehicles.push(
    { type: 'boat', pos: new THREE.Vector3(JP_LAKE[0] + 60, 0, JP_LAKE[1] - 6), rot: -Math.PI / 2 },
    { type: 'scooter', pos: city.roadPoints[4].clone(), rot: 0 },
    { type: 'car', pos: city.roadPoints[10].clone(), rot: Math.PI / 2 },
  );
  // ponton de la batelière
  const dock = new THREE.Vector3(JP_LAKE[0] + 70, 0, JP_LAKE[1] - 6);
  b.addAt(slab(16, 4, -0.4, 0.5, 2), std(0x7a5a3a, 0.9), dock.x, 0.6, dock.z, 0);
  addBox(dock.x, dock.z, 16, 4, -1, 0.7, 0, true);
  out.spots.lake = new THREE.Vector3(JP_LAKE[0], 0, JP_LAKE[1]);
  out.group.add(b.build('japan-props'));
  return out;
}

// =============================================================================== DÉSERT
export function buildDesert(ctx: BuildCtx): RegionContent {
  const R = regionById('desert');
  const out = emptyContent('desert');
  const rng = new Rng(33);
  const b = new Batch(120);
  const sets = [adobe(1), adobe(2), adobe(3)];
  const style: CityStyle = {
    facades: sets, floorH: 3, bayW: 3, shopH: 0, floors: (r) => r.int(1, 2), lotWidth: [6, 10], lotDepth: [6, 9], lamp: 'japan',
    roof: (bb, x, z, w, d, top, r, set) => {
      bb.addAt(facadeBox(w, d, 0, 0.8, set, 3, 3, 0, 0.9, true), facadeMaterial(set), x, top, z);
      if (r.chance(0.2)) bb.addAt(new THREE.SphereGeometry(Math.min(w, d) * 0.35, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0x3a8ac0, 0.5), x, top + 0.8, z);
    },
  };
  // village d'adobe autour de l'oasis
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + rng.range(-0.1, 0.1);
    const d = rng.range(48, 95);
    const x = OASIS_POS[0] + 30 + Math.cos(a) * d, z = OASIS_POS[1] - 20 + Math.sin(a) * d;
    const w = rng.range(6, 10), dd = rng.range(6, 9);
    const y = groundY(x, z);
    building(b, style, x, z, w, dd, y - 0.3, rng);
    paveRect(x, z, w + 2, dd + 2);
    out.walkPoints.push(new THREE.Vector3(x + w / 2 + 1.5, y, z));
  }
  // palmiers autour de l'eau
  for (let i = 0; i < 40; i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(24, 40);
    const x = OASIS_POS[0] + 30 + Math.cos(a) * d, z = OASIS_POS[1] - 20 + Math.sin(a) * d;
    ctx.forest.add('palm', x, z, rng.range(0.9, 1.3));
  }
  // marché : tentes colorées
  const cloths = [0xc83a2a, 0x2a6ac8, 0xe8b02a, 0x2a9a5a, 0x9a2ac8].map((c) => std(c, 0.9, 0, { side: THREE.DoubleSide }));
  for (let i = 0; i < 8; i++) {
    const a = 2.2 + i * 0.22;
    const x = OASIS_POS[0] + 30 + Math.cos(a) * 42, z = OASIS_POS[1] - 20 + Math.sin(a) * 42;
    const y = groundY(x, z);
    const tent = new THREE.ConeGeometry(2.6, 1.6, 4, 1, true);
    tent.rotateY(Math.PI / 4);
    b.addAt(tent.translate(0, 3.2, 0), cloths[i % cloths.length], x, y, z);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.addAt(new THREE.CylinderGeometry(0.06, 0.06, 2.6).translate(sx * 1.7, 1.3, sz * 1.7), std(0x6a4a2a), x, y, z);
    b.addAt(new THREE.BoxGeometry(2.4, 0.8, 1.2).translate(0, 0.4, 0), std(0x8a6a4a), x, y, z);
    addBox(x, z, 2.4, 1.2, y, y + 0.9);
  }
  // pyramides et sphinx
  for (const p of PYRAMIDS) pyramid(b, p.x, groundY(p.x, p.z), p.z, p.s);
  const P0 = PYRAMIDS[0];
  const sph = new THREE.Vector3(lerp(P0.x, R.x, 0.45), 0, lerp(P0.z, R.z, 0.45));
  sph.y = groundY(sph.x, sph.z);
  sphinxCapy(b, sph.x, sph.y - 0.2, sph.z, Math.atan2(R.x - sph.x, R.z - sph.z));
  out.spots.pyramids = new THREE.Vector3(P0.x, groundY(P0.x, P0.z) + 22, P0.z);
  out.spots.sphinx = sph.clone().setY(sph.y + 8);
  out.photos.push(
    { id: 'pyramids', name: 'Les pyramides', region: 'desert', target: out.spots.pyramids, radius: 400 },
    { id: 'sphinx', name: 'Le Sphinx-Capybara', region: 'desert', target: out.spots.sphinx, radius: 120 },
  );
  // grandes roches sculptées par le vent
  const rockMat = pbr('rock', { scale: 5, color: 0xe8b88a });
  for (let i = 0; i < 18; i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(160, 330);
    const x = R.x + Math.cos(a) * d, z = R.z + Math.sin(a) * d;
    if (PYRAMIDS.some((p) => Math.hypot(p.x - x, p.z - z) < p.s * 1.4)) continue;
    const y = groundY(x, z);
    rock(b, rockMat, x, y + 2, z, rng.range(5, 11), i * 3.1);
    if (rng.chance(0.5)) rock(b, rockMat, x + rng.range(-4, 4), y + 9, z + rng.range(-4, 4), rng.range(3, 6), i * 7.7);
    ctx.forest.add('cactus', x + 14, z + 6, rng.range(0.8, 1.3));
  }
  // trésors cachés dans les dunes (mission)
  const scarabs: THREE.Vector3[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.6, d = 150 + i * 30;
    const x = R.x + Math.cos(a) * d, z = R.z + Math.sin(a) * d;
    scarabs.push(new THREE.Vector3(x, groundY(x, z) + 0.6, z));
  }
  (out.spots as any).scarabList = scarabs;
  out.spots.tomb = new THREE.Vector3(P0.x, groundY(P0.x, P0.z + P0.s * 0.55) + 0.2, P0.z + P0.s * 0.55);

  out.npcs.push(
    { id: 'explorer', name: 'Professeure Nefer', pos: sph.clone().add(new THREE.Vector3(14, 0.2, 10)), fur: 0xb8905e, hat: 'safari', scarf: 0x2a6ac8 },
  );
  out.vehicles.push({ type: 'jeep', pos: new THREE.Vector3(R.x - 80, groundY(R.x - 80, R.z + 40), R.z + 40), rot: 0.5 });
  out.spots.oasis = new THREE.Vector3(OASIS_POS[0] + 30, 0, OASIS_POS[1] - 20);
  out.group.add(b.build('desert-props'));
  return out;
}

// =============================================================================== PÔLE NORD
export function buildPole(ctx: BuildCtx): RegionContent {
  const R = regionById('pole');
  const out = emptyContent('pole');
  const rng = new Rng(25);
  const b = new Batch(120);
  const c = new THREE.Vector3(R.x, R.ground, R.z);
  // village d'igloos
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = c.x + Math.cos(a) * 55, z = c.z + Math.sin(a) * 55;
    igloo(b, x, groundY(x, z), z, rng.range(3, 4.5), -a + Math.PI / 2 + Math.PI);
    out.walkPoints.push(new THREE.Vector3(c.x + Math.cos(a) * 46, groundY(x, z), c.z + Math.sin(a) * 46));
  }
  // grand sapin et poteau du Pôle
  christmasTree(b, c.x, groundY(c.x, c.z), c.z, 1.4);
  const pole = new THREE.CylinderGeometry(0.35, 0.35, 7, 16).translate(0, 3.5, 0);
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 256;
  const g2 = cv.getContext('2d')!;
  for (let i = 0; i < 16; i++) { g2.fillStyle = i % 2 ? '#ffffff' : '#d81e2a'; g2.save(); g2.translate(0, i * 16); g2.transform(1, 0.25, 0, 1, 0, 0); g2.fillRect(-20, 0, 120, 16); g2.restore(); }
  const ptex = new THREE.CanvasTexture(cv);
  ptex.colorSpace = THREE.SRGBColorSpace;
  b.addAt(pole, new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.4 }), c.x + 20, groundY(c.x + 20, c.z), c.z);
  b.addAt(new THREE.SphereGeometry(0.7, 16, 12).translate(0, 7.4, 0), std(0xffd23b, 0.2, 1), c.x + 20, groundY(c.x + 20, c.z), c.z);
  addCircle(c.x + 20, c.z, 0.5, 0, 20);
  out.spots.northpole = new THREE.Vector3(c.x + 20, groundY(c.x + 20, c.z) + 4, c.z);
  out.photos.push({ id: 'northpole', name: 'Le Pôle Nord', region: 'pole', target: out.spots.northpole, radius: 40 });
  out.spots.tree = new THREE.Vector3(c.x, groundY(c.x, c.z) + 8, c.z);
  // atelier en bois (chalet)
  const ws = new THREE.Vector3(c.x - 30, 0, c.z - 26);
  ws.y = groundY(ws.x, ws.z);
  const cab = cottage(9);
  const woodSet = cab;
  b.addAt(facadeBox(16, 10, 0, 6, woodSet, 3, 3, 0, 0), facadeMaterial(woodSet), ws.x, ws.y, ws.z);
  const gr = gableRoof(16, 10, ws.y + 6, 4, 0.8);
  const snowRoof = pbr('snow', { scale: 3 });
  b.addAt(gr.roof, snowRoof, ws.x, 0, ws.z);
  b.addAt(gr.gable, std(0x7a4a2a, 0.9), ws.x, 0, ws.z);
  addBox(ws.x, ws.z, 16, 10, ws.y, ws.y + 9, 0, true);
  const sign = makeSignMesh(['ATELIER', 'DES CADEAUX'], '#7a1a1a', '#ffe9b0', 6, 2);
  sign.position.set(ws.x, ws.y + 4.6, ws.z + 5.06);
  out.group.add(sign);
  // guirlandes lumineuses
  const bulbs = [0xff3040, 0x40ff80, 0xffd040, 0x40a0ff].map((col) => glowMat(col, 4, 0.5));
  for (let k = 0; k < 24; k++) b.addAt(new THREE.SphereGeometry(0.12, 6, 4).translate(-8 + k * 0.7, 6.1 - Math.sin((k / 23) * Math.PI) * 0.4, 5.3), bulbs[k % 4], ws.x, ws.y, ws.z, 0, false);
  out.spots.workshop = new THREE.Vector3(ws.x, ws.y, ws.z + 8);
  // banquise : plaques de glace dérivant en mer
  const iceMat = new THREE.MeshStandardMaterial({ color: 0xe8f6ff, roughness: 0.25, metalness: 0 });
  const floes: THREE.Mesh[] = [];
  const outDir = new THREE.Vector2(R.x, R.z).normalize();
  for (let i = 0; i < 40; i++) {
    const d = rng.range(420, 620), sp = rng.range(-260, 260);
    const x = R.x + outDir.x * d - outDir.y * sp, z = R.z + outDir.y * d + outDir.x * sp;
    if (heightAt(x, z) > -1.5) continue;
    const sh = new THREE.Shape();
    const n = 7, rr = rng.range(4, 12);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, r = rr * rng.range(0.7, 1.2);
      if (k === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 1.2, bevelEnabled: true, bevelSize: 0.5, bevelThickness: 0.3, bevelSegments: 2 });
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, iceMat);
    m.position.set(x, -0.6, z);
    m.receiveShadow = true;
    out.group.add(m);
    floes.push(m);
    addCircle(x, z, rr * 0.8, -2, 0.85, true);
  }
  out.update.push((t) => floes.forEach((f, i) => (f.position.y = -0.6 + Math.sin(t * 0.8 + i) * 0.08)));
  // cadeaux à livrer (mission)
  const gifts: THREE.Vector3[] = [];
  for (let i = 0; i < 4; i++) gifts.push(out.walkPoints[i * 3].clone());
  (out.spots as any).giftList = gifts;
  // circuit de motoneige
  const track: THREE.Vector3[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = 150 + Math.sin(a * 3) * 40;
    const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
    track.push(new THREE.Vector3(x, groundY(x, z), z));
  }
  (out.spots as any).snowTrack = track;
  out.npcs.push(
    { id: 'santa', name: 'Papy Noël', pos: out.spots.workshop.clone().add(new THREE.Vector3(3, 0.2, 2)), fur: 0xcfc4b8, hat: 'bonnet', scarf: 0xd81e2a, size: 1.15 },
    { id: 'penguin1', name: 'Pingouin', pos: new THREE.Vector3(c.x + 30, groundY(c.x + 30, c.z + 30), c.z + 30), kind: 'penguin' },
    { id: 'penguin2', name: 'Pingouin', pos: new THREE.Vector3(c.x + 34, groundY(c.x + 34, c.z + 28), c.z + 28), kind: 'penguin' },
    { id: 'penguin3', name: 'Pingouin', pos: new THREE.Vector3(c.x + 31, groundY(c.x + 31, c.z + 35), c.z + 35), kind: 'penguin' },
  );
  out.vehicles.push(
    { type: 'snowmobile', pos: new THREE.Vector3(c.x + 12, groundY(c.x + 12, c.z - 30), c.z - 30), rot: 0 },
    { type: 'snowmobile', pos: new THREE.Vector3(c.x + 16, groundY(c.x + 16, c.z - 30), c.z - 30), rot: 0 },
  );
  out.group.add(b.build('pole-props'));
  return out;
}

// =============================================================================== CAPYVILLE
export function buildHub(ctx: BuildCtx): RegionContent {
  const R = regionById('hub');
  const out = emptyContent('hub');
  const rng = new Rng(3);
  const b = new Batch(120);
  const tiles = roofTexture('tiles');
  const tileMat = new THREE.MeshStandardMaterial({ map: tiles.map, normalMap: tiles.normalMap, roughness: 0.8, color: 0xffffff });
  const sets = [cottage(1), cottage(2), cottage(3), cottage(4)];
  const gableMat = std(0xf2e6cf, 0.95);
  const plaza = pbr('cobble', { scale: 3.5, color: 0xf0e4cc });
  // place centrale pavée et fontaine
  b.addAt(planarUV(new THREE.CylinderGeometry(26, 26, 0.3, 48), 1), plaza, 0, R.ground, 0, 0, false);
  addCircle(0, 0, 26, R.ground - 1, R.ground + 0.15, true);
  paveCircle(0, 0, 27);
  fountain(b, 0, R.ground + 0.15, 0, 5);
  // maisons en couronne
  const houses: THREE.Vector3[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.11;
    const d = 46 + (i % 2) * 14;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const ang = Math.atan2(-x, -z);
    // on évite les routes (directions des régions)
    if (REGIONS.slice(1).some((r) => Math.abs(Math.atan2(r.x, r.z) - Math.atan2(x, z)) < 0.17)) continue;
    const y = groundY(x, z);
    const w = rng.range(8, 11), dd = rng.range(7, 9);
    const set = rng.pick(sets);
    const m = new THREE.Matrix4().makeRotationY(ang).setPosition(x, y - 0.3, z);
    b.add(facadeBox(w, dd, 0, 6.4, set, 3, 3.2, rng.int(0, 3) * 0.25, 0), facadeMaterial(set), m);
    const gr = gableRoof(w, dd, 6.4, 3.4, 0.7);
    b.add(gr.roof, tileMat, m);
    b.add(gr.gable, gableMat, m);
    // porte
    const door = new THREE.BoxGeometry(1.3, 2.2, 0.2).translate(0, 1.1, dd / 2);
    b.add(door, std(0x6a3a1c, 0.7), m);
    const cs = Math.cos(ang), sn = Math.sin(ang);
    void cs; void sn;
    addBox(x, z, w, dd, y - 1, y + 9, -ang, true);
    paveRect(x, z, w + 2, dd + 2, -ang);
    houses.push(new THREE.Vector3(x, y, z));
    addLamp(b, 'paris', x * 0.82, groundY(x * 0.82, z * 0.82), z * 0.82);
  }
  out.spots.home = houses[0].clone().multiplyScalar(0.84).setY(R.ground + 0.2);
  // source chaude
  const hs = new THREE.Vector3(HOT_SPRING[0], 0, HOT_SPRING[1]);
  hs.y = groundY(hs.x, hs.z);
  const rockMat = pbr('rock', { scale: 3, color: 0xb8b0a8 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    rock(b, rockMat, hs.x + Math.cos(a) * 10.5, hs.y + 0.2, hs.z + Math.sin(a) * 10.5, rng.range(1.2, 2), i);
  }
  const spring = new THREE.MeshStandardMaterial({ color: 0x7fd8d0, roughness: 0.05, transparent: true, opacity: 0.85 });
  b.addAt(new THREE.CircleGeometry(10, 32).rotateX(-Math.PI / 2), spring, hs.x, hs.y + 0.55, hs.z, 0, false);
  paveCircle(hs.x, hs.z, 12);
  out.spots.spring = hs.clone().setY(hs.y + 0.6);
  // vapeur
  const steam = new THREE.Group();
  const steamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false });
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), steamMat);
    s.position.set(hs.x + rng.range(-6, 6), hs.y + 1, hs.z + rng.range(-6, 6));
    s.userData.base = s.position.clone();
    s.userData.ph = rng.range(0, 6);
    steam.add(s);
  }
  out.group.add(steam);
  out.update.push((t) => steam.children.forEach((s) => {
    const k = (t * 0.25 + s.userData.ph) % 1;
    s.position.set(s.userData.base.x, s.userData.base.y + k * 6, s.userData.base.z);
    s.scale.setScalar(0.6 + k * 1.4);
    (s as THREE.Mesh).visible = true;
  }));
  // capybaras qui se prélassent dans l'eau chaude
  out.npcs.push(
    { id: 'mamie', name: 'Mamie Capy', pos: new THREE.Vector3(6, R.ground + 0.2, 8), fur: 0xa88a6a, hat: 'flower', scarf: 0x9a5ac8, size: 1.05 },
    { id: 'shop', name: 'Basile le chapelier', pos: new THREE.Vector3(-14, R.ground + 0.2, -20), fur: 0x8a6040, hat: 'tophat', scarf: 0x3a8a4a },
    { id: 'onsen1', name: 'Capy zen', pos: new THREE.Vector3(hs.x + 3, hs.y + 0.1, hs.z - 2), fur: 0x9a6a43, hat: 'yuzu' },
    { id: 'onsen2', name: 'Capy zen', pos: new THREE.Vector3(hs.x - 3, hs.y + 0.1, hs.z + 3), fur: 0x8a5a33, hat: 'yuzu' },
  );
  // boutique de chapeaux
  const kiosk = new THREE.Vector3(-14, R.ground, -24);
  b.addAt(new THREE.BoxGeometry(6, 3, 3).translate(0, 1.5, 0), std(0xe8d8b8, 0.8), kiosk.x, kiosk.y, kiosk.z);
  b.addAt(new THREE.ConeGeometry(4.6, 2, 4).rotateY(Math.PI / 4).translate(0, 4, 0), std(0xc83a4a, 0.8), kiosk.x, kiosk.y, kiosk.z);
  const ks = makeSignMesh(['CHAPEAUX'], '#2a5a3a', '#ffe9b0', 4, 1);
  ks.position.set(kiosk.x, kiosk.y + 2.6, kiosk.z + 1.55);
  out.group.add(ks);
  addBox(kiosk.x, kiosk.z, 6, 3, kiosk.y, kiosk.y + 4);
  out.spots.shop = new THREE.Vector3(-14, R.ground + 0.2, -20);
  // moulin
  const wm = windmill(-75, groundY(-75, -70), -70);
  out.group.add(wm.group);
  out.update.push((t) => wm.update(t));
  out.photos.push({ id: 'windmill', name: 'Le moulin de Capyville', region: 'hub', target: new THREE.Vector3(-75, groundY(-75, -70) + 10, -70), radius: 120 });
  // étang avec ponton
  const pond = new THREE.Vector3(HUB_POND[0], 0, HUB_POND[1]);
  out.spots.pond = pond.clone();
  out.spots.windmill = new THREE.Vector3(-75, groundY(-75, -70), -70);
  b.addAt(slab(3, 14, -0.3, 0.4, 2), std(0x8a6a48, 0.9), pond.x + 24, 0.9, pond.z, 0.6);
  // panneaux vers les régions
  const arrows = REGIONS.slice(1).map((r) => ({ text: r.name.replace('Le Désert des Dunes', 'Désert').replace('Le ', ''), angle: Math.atan2(r.x, r.z) - Math.PI / 2 }));
  signpost(b, 14, R.ground + 0.15, 14, arrows.slice(0, 3));
  signpost(b, -14, R.ground + 0.15, 14, arrows.slice(3));
  for (let i = 0; i < 8; i++) bench(b, Math.cos(i * 0.785 + 0.4) * 22, R.ground + 0.15, Math.sin(i * 0.785 + 0.4) * 22, -i * 0.785 - 0.4 + Math.PI / 2);
  // vergers de yuzus
  const yuzus: THREE.Vector3[] = [];
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3 + 0.5, d = 80 + i * 10;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    yuzus.push(new THREE.Vector3(x, groundY(x, z) + 0.6, z));
    ctx.forest.add('oak', x + 2.5, z + 2.5, 0.8);
  }
  (out.spots as any).yuzuList = yuzus;
  out.vehicles.push(
    { type: 'car', pos: new THREE.Vector3(30, R.ground, -12), rot: 0.6 },
    { type: 'scooter', pos: new THREE.Vector3(-28, R.ground, 6), rot: -0.4 },
  );
  out.spots.start = new THREE.Vector3(0, R.ground + 0.3, 16);
  // moniteurs des mini-missions de test
  const sw = new THREE.Vector3(HUB_POND[0] + 34, 0, HUB_POND[1] - 6);
  sw.y = groundY(sw.x, sw.z);
  out.npcs.push(
    { id: 'coach', name: 'Coach Capy', pos: new THREE.Vector3(24, R.ground + 0.2, -6), fur: 0x8a5a33, hat: 'cap', scarf: 0x1e4fa8 },
    { id: 'swimmer', name: 'Nina la nageuse', pos: sw, fur: 0xa87a52, hat: 'flower', scarf: 0x3fd0ff },
    { id: 'photographer', name: 'Léo le photographe', pos: new THREE.Vector3(-22, R.ground + 0.2, 8), fur: 0x9b6a43, hat: 'beret', scarf: 0xffc83a },
  );
  out.group.add(b.build('hub-props'));
  void bench;
  return out;
}
