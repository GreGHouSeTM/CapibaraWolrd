// New York : gratte-ciels à gradins, Central Park, Times Square et ses écrans, tour Art déco, Statue de la Liberté.
import * as THREE from 'three';
import { Rng } from '../core/math';
import { regionById } from '../world/layout';
import { buildCity, CityStyle } from '../procgen/city';
import { nyGlass, nyBrick, nyDeco, shopfront, roofTexture, signTexture, FacadeSet } from '../procgen/facades';
import { Batch, facadeBox, facadeMaterial, std, slab } from '../procgen/kit';
import { decoTower, libertyStatue, makeSignMesh, glowMat } from '../procgen/monuments';
import { BuildCtx, RegionContent, emptyContent, hydrant, bench } from './common';
import { LIBERTY_POS, heightAt } from '../world/heightmap';
import { addBox } from '../world/physics';

export function buildNewYork(ctx: BuildCtx): RegionContent {
  const R = regionById('newyork');
  const out = emptyContent('newyork');
  const rng = new Rng(212);
  const glass = [nyGlass(1), nyGlass(2), nyGlass(3), nyGlass(4)];
  const brick = [nyBrick(5), nyBrick(6), nyBrick(7)];
  const deco = [nyDeco(8), nyDeco(9)];
  const shops = [shopfront(21, 'ny'), shopfront(22, 'ny')];
  const tar = roofTexture('tar');
  const tarMat = new THREE.MeshStandardMaterial({ map: tar.map, roughness: 0.9, color: 0x9a9a9a });
  const waterTowerMat = std(0x7a5236, 0.9);
  const metal = std(0x8a9096, 0.4, 0.8);
  const mid = new THREE.Vector3(R.x - 10, 0, R.z + 30);

  const shopsMat = shops.map((s) => facadeMaterial(s, { emissiveBoost: 1.3 }));
  const style: CityStyle = {
    facades: brick, floorH: 3.6, bayW: 3.2, shopH: 4.8,
    floors: (r) => r.int(4, 8), lotWidth: [14, 22], lotDepth: [14, 20], lamp: 'ny', streetTree: 'oak',
    roof: () => {},
    custom: (b, x, z, w, d, y0, r) => {
      const dist = Math.hypot(x - mid.x, z - mid.z);
      const tall = 30 + 150 * Math.exp(-(dist * dist) / (2 * 130 * 130)) * r.range(0.4, 1.2);
      const h = Math.max(16, tall);
      let set: FacadeSet;
      if (h < 40) set = r.pick(brick);
      else if (h > 90 && r.chance(0.7)) set = r.pick(glass);
      else set = r.pick([...glass, ...deco]);
      // rez-de-chaussée commerçant
      const si = r.int(0, shops.length - 1);
      b.addAt(facadeBox(w, d, 0, 4.8, shops[si], 3.2, 4.8, r.int(0, 3) * 0.25, 0), shopsMat[si], x, y0, z);
      let y = y0 + 4.8;
      // gradins (retraits successifs)
      let ww = w, dd = d, remaining = h - 4.8;
      const tiers = h > 60 ? r.int(2, 3) : 1;
      for (let t = 0; t < tiers; t++) {
        const th = t === tiers - 1 ? remaining : remaining * r.range(0.45, 0.65);
        b.addAt(facadeBox(ww, dd, 0, th, set, 3.2, 3.6, r.int(0, 3) * 0.25, r.int(0, 3) * 0.25), facadeMaterial(set), x, y, z);
        b.addAt(slab(ww, dd, 0, 0.3, 6), tarMat, x, y + th, z, 0, false);
        y += th;
        remaining -= th;
        ww *= 0.78; dd *= 0.78;
      }
      // toit : château d'eau ou antenne
      if (h < 50 && r.chance(0.5)) {
        const tower = new THREE.CylinderGeometry(1.6, 1.6, 3.2, 12).translate(0, 4.4, 0);
        b.addAt(tower, waterTowerMat, x + r.range(-2, 2), y, z + r.range(-2, 2));
        b.addAt(new THREE.ConeGeometry(1.8, 1.2, 12).translate(0, 6.6, 0), waterTowerMat, x, y, z);
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.addAt(new THREE.CylinderGeometry(0.08, 0.08, 2.8).translate(sx, 1.4, sz), metal, x, y, z);
      } else if (h > 90) {
        b.addAt(new THREE.CylinderGeometry(0.2, 0.4, 14, 6).translate(0, 7, 0), metal, x, y, z);
        const light = glowMat(0xff3030, 3, 0.3);
        b.addAt(new THREE.SphereGeometry(0.5, 8, 6).translate(0, 14.2, 0), light, x, y, z, 0, false);
      } else {
        b.addAt(new THREE.BoxGeometry(3, 1.6, 2).translate(0, 0.8, 0), metal, x + r.range(-ww / 4, ww / 4), y, z + r.range(-dd / 4, dd / 4));
      }
      return h;
    },
  };

  const parkI = [5, 6], parkJ = [1, 2, 3];
  const city = buildCity({
    region: R, halfX: 275, halfZ: 275, block: 42, street: 14, style, seed: 9, forest: ctx.forest,
    kindOf: (b) => {
      if (parkI.includes(b.i) && parkJ.includes(b.j)) return 'park';
      if (b.i === 3 && (b.j === 4 || b.j === 5)) return 'plaza'; // Times Square
      if (b.i === 4 && b.j === 6) return 'special'; // tour Art déco
      return 'buildings';
    },
  });
  out.group.add(city.group);
  out.walkPoints = city.sidewalkPoints;
  out.roadPoints = city.roadPoints;
  out.loops = city.loops;
  const blockAt = (i: number, j: number) => city.blocks.find((b) => b.i === i && b.j === j)!;

  const b = new Batch(120);
  // Tour Art déco
  const db = blockAt(4, 6);
  if (db) {
    const top = decoTower(b, deco[0], db.x, R.ground + 0.18, db.z);
    out.spots.deco = new THREE.Vector3(db.x, top * 0.6, db.z);
    out.photos.push({ id: 'deco', name: 'Le gratte-ciel Art déco', region: 'newyork', target: out.spots.deco, radius: 320 });
  }
  // Times Square : écrans géants
  const ts1 = blockAt(3, 4), ts2 = blockAt(3, 5);
  if (ts1 && ts2) {
    const cx = ts1.x, cz = (ts1.z + ts2.z) / 2;
    out.spots.times = new THREE.Vector3(cx, R.ground + 0.2, cz);
    const ads: [string[], string, string][] = [
      [['CAPY', 'COLA'], '#d81e2a', '#ffffff'], [['YUZU', 'JUICE'], '#ff9a1a', '#2a1a00'], [['BROADWAY', 'CAPY SHOW'], '#1a1a40', '#ffd23b'],
      [['PIZZA', '24/7'], '#106030', '#ffffff'], [['I ♥ NY'], '#ffffff', '#d81e2a'], [['MEGA', 'BURGER'], '#ffcc00', '#a01010'],
      [['CAPY', 'NEWS'], '#0a3a8a', '#ffffff'], [['SUPER', 'SNEAKERS'], '#101010', '#3bffb0'],
    ];
    const screens: THREE.Mesh[] = [];
    ads.forEach((ad, i) => {
      const side = i % 2 ? 1 : -1;
      const z = cz - 40 + Math.floor(i / 2) * 26;
      const x = cx + side * 18;
      const pole = new THREE.CylinderGeometry(0.35, 0.45, 15, 10).translate(0, 7.5, 0);
      b.addAt(pole, std(0x9aa0a6, 0.35, 0.9), x, R.ground, z);
      const frame = new THREE.BoxGeometry(0.6, 8.4, 14.4).translate(0, 0, 0);
      b.addAt(frame, std(0x1a1a1a, 0.5, 0.5), x, R.ground + 15 + (i % 3) * 1.5, z);
      const sign = makeSignMesh(ad[0], ad[1], ad[2], 14, 8);
      sign.position.set(x - side * 0.32, R.ground + 15 + (i % 3) * 1.5, z);
      sign.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      out.group.add(sign);
      screens.push(sign);
      addBox(x, z, 0.9, 0.9, R.ground, R.ground + 11);
    });
    // panneau défilant
    const ticker = signTexture(['★ BIENVENUE À NEW YORK ★ CAPY WORLD ★'], '#000000', '#ffd23b', 1024, 64);
    ticker.map.wrapS = THREE.RepeatWrapping;
    const tm = new THREE.MeshStandardMaterial({ map: ticker.map, emissiveMap: ticker.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.2 });
    const tick = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 2, 48, 1, true), tm);
    tick.position.set(cx, R.ground + 10, cz + 44);
    out.group.add(tick);
    out.update.push((t) => {
      ticker.map.offset.x = (t * 0.05) % 1;
      ticker.emissiveMap.offset.x = ticker.map.offset.x;
    });
    out.photos.push({ id: 'times', name: 'Times Square', region: 'newyork', target: out.spots.times.clone().setY(R.ground + 15), radius: 90 });
  }
  // bornes à incendie et bancs
  for (let i = 0; i < 30; i++) {
    const p = city.sidewalkPoints[rng.int(0, city.sidewalkPoints.length - 1)];
    if (rng.chance(0.6)) hydrant(b, p.x + 1, p.y, p.z, 0xd02020);
    else bench(b, p.x, p.y, p.z, rng.range(0, 6.28));
  }
  // Statue de la Liberté
  const ly = Math.max(3, heightAt(LIBERTY_POS[0], LIBERTY_POS[1]));
  const lib = libertyStatue(LIBERTY_POS[0], ly, LIBERTY_POS[1]);
  lib.rotation.y = Math.atan2(R.x - LIBERTY_POS[0], R.z - LIBERTY_POS[1]);
  out.group.add(lib);
  out.spots.liberty = new THREE.Vector3(LIBERTY_POS[0], ly + 40, LIBERTY_POS[1]);
  out.spots.libertyIsland = new THREE.Vector3(LIBERTY_POS[0] - 20, ly + 6.1, LIBERTY_POS[1] + 12);
  out.photos.push({ id: 'liberty', name: 'La statue de la Liberté', region: 'newyork', target: out.spots.liberty, radius: 380 });

  // ponton vers l'île
  const dir = new THREE.Vector2(LIBERTY_POS[0] - R.x, LIBERTY_POS[1] - R.z).normalize();
  const pier = new THREE.Vector3(R.x + dir.x * 285, R.ground, R.z + dir.y * 285);
  b.addAt(new THREE.BoxGeometry(8, 1, 30).translate(0, -0.5, 0), std(0x7a5a3a, 0.9), pier.x, R.ground + 0.1, pier.z, Math.atan2(dir.x, dir.y));
  out.spots.pier = pier;

  out.npcs.push(
    { id: 'cabbie', name: 'Tony le taxi', pos: city.sidewalkPoints[10].clone(), fur: 0x7a5232, hat: 'cap', scarf: 0xffd200 },
    { id: 'tourist', name: 'Grace la guide', pos: out.spots.pier.clone().add(new THREE.Vector3(4, 0.2, 0)), fur: 0xb58a60, hat: 'cap', scarf: 0x3a8a4a },
  );
  out.vehicles.push(
    { type: 'taxi', pos: city.roadPoints[12].clone(), rot: 0 },
    { type: 'taxi', pos: city.roadPoints[30].clone(), rot: Math.PI / 2 },
    { type: 'boat', pos: new THREE.Vector3(pier.x + dir.x * 22, 0, pier.z + dir.y * 22), rot: Math.atan2(dir.x, dir.y) },
    { type: 'car', pos: city.roadPoints[40].clone(), rot: 0 },
  );
  out.spots.taxiStart = city.roadPoints[12].clone();
  out.group.add(b.build('ny-props'));
  return out;
}
