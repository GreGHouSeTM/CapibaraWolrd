// Capyville, village thermal japonais (spécialité Intégration village).
// Construit le village à partir de src/world/zones.ts (BUILDINGS, TORII, BRIDGES, VILLAGE_GATES, PATHS, positions de jeu)
// et des modèles Blender (public/assets/models/buildings) et Poly Haven (public/assets/models/manifest.json) :
// - bâtiments, torii et ponts fusionnés par cellule de 60 m, LOD et matière (procgen/village/buildings.ts, lod.ts) ;
// - collisions du manifeste, ponts franchissables (walk.path), escaliers physiques, bornes (procgen/village/ground.ts) ;
// - dalles, caniveaux, place, pas japonais ; lanternes, noren, portes et panneaux (procgen/village/furniture.ts) ;
// - premier passage de décor photoscanné (procgen/village/scatter.ts) ; points de marche (procgen/village/walk.ts).
// API pour les autres spécialités : `updateVillage(camera)` (LOD des cellules, branché dans world.ts) et
// `villageInfo` (anchors des bâtiments, statistiques) une fois `buildHub` terminé.
import * as THREE from 'three';
import { Batch, std } from '../procgen/kit';
import { BuildCtx, RegionContent, emptyContent, NpcDef } from './common';
import { heightAt } from '../world/heightmap';
import { addBox, groundAt } from '../world/physics';
import { paveRect } from '../world/grass';
import { PADS } from '../world/valley';
import { REGIONS } from '../world/layout';
import { addLightSpot, addSmokeSpot } from '../world/registry';
import { pbr } from '../core/assets';
import { Models } from '../core/models';
import {
  BRIDGES, BUILDINGS, HOT_SPRING_POOL, MILL_POS, MILL_WHEEL, NPC_SPOTS, ORCHARD, PATHS, POND, SPAWN, TORII, TORII_TUNNEL,
  VEHICLE_SPOTS, VILLAGE_GATES, YUZU_SPOTS, FEATURE_TREES, pointAlong, distToPolyline,
} from '../world/zones';
import { buildVillageBuildings, localToWorld, Placement, VillageBuildings, WorldAnchor } from '../procgen/village/buildings';
import { buildVillageGround, resample } from '../procgen/village/ground';
import { Instancer, Signs, andon, chochin, noren, toro, woodenGate, mats as fmats, poseM } from '../procgen/village/furniture';
import { SCATTER_IDS, scatterVillageDecor } from '../procgen/village/scatter';
import { villageWalkPoints } from '../procgen/village/walk';
import type { CellLod } from '../procgen/village/lod';

let lodRef: CellLod | null = null;
/** Choix des LOD des bâtiments du village (appelé avant chaque rendu, cf. world.ts). */
export function updateVillage(camera: THREE.Camera) {
  lodRef?.update(camera);
}
/** Informations exposées aux autres spécialités (Décor, Effets…) après la construction. */
export const villageInfo: { anchors: WorldAnchor[]; stats: Record<string, unknown> } = { anchors: [], stats: {} };

const NOREN_COLORS = [0x2a3a5c, 0x7a2a24, 0x2e4a36, 0x4a3426, 0x23324a, 0x8a5a2a].map((c) => new THREE.Color(c));
const hashStr = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export async function buildHub(ctx: BuildCtx, progress: (p: number, label?: string) => void = () => {}): Promise<RegionContent> {
  const out = emptyContent('hub');
  const inst = new Instancer();
  const b = new Batch(60);
  const frame = () => new Promise<void>((r) => setTimeout(r, 0));

  // ------------------------------------------------------------------ sols, escaliers (avant les poses : les torii s'y posent)
  progress(0.02, 'Pose des dalles de pierre…');
  const ground = buildVillageGround(inst);
  out.group.add(ground.group);
  const floorAt = (x: number, z: number) => groundAt(x, z, heightAt(x, z) + 0.6);
  /** sol marchable d'un escalier (marches éventuellement portées au-dessus du terrain) */
  const stairAt = (x: number, z: number) => groundAt(x, z, heightAt(x, z) + 14);

  // ------------------------------------------------------------------ poses des modèles Blender
  const placements: Placement[] = [];
  for (const bd of BUILDINGS) {
    placements.push({ id: bd.id, model: bd.id, x: bd.x, z: bd.z, y: PADS[bd.id] ?? heightAt(bd.x, bd.z), yaw: bd.yaw, keepFar: bd.id === 'pagode' || bd.id === 'grand-ryokan' });
    paveRect(bd.x, bd.z, bd.w + 2, bd.d + 2, -bd.yaw);
  }
  for (const t of TORII) placements.push({ id: 'torii-' + t.id, model: 'torii-' + t.id, x: t.x, z: t.z, y: floorAt(t.x, t.z), yaw: t.yaw });
  const tunnel = PATHS.find((p) => p.id === TORII_TUNNEL.pathId)!;
  const tunnelPts = resample(tunnel.pts, TORII_TUNNEL.spacing).pts.slice(1, -1);
  tunnelPts.forEach((q, i) => placements.push({ id: 'torii-tunnel-' + i, model: 'torii-tunnel', x: q.x, z: q.z, y: stairAt(q.x, q.z), yaw: Math.atan2(q.dx, q.dz) }));
  const bridgeBase: Record<string, number> = {};
  for (const br of BRIDGES) {
    const y = (heightAt(br.a[0], br.a[1]) + heightAt(br.b[0], br.b[1])) / 2;
    bridgeBase[br.id] = y;
    placements.push({ id: 'pont-' + br.id, model: 'pont-' + br.id, x: (br.a[0] + br.b[0]) / 2, z: (br.a[1] + br.b[1]) / 2, y, yaw: Math.atan2(-(br.b[1] - br.a[1]), br.b[0] - br.a[0]), colliders: false });
  }
  const millY = PADS['moulin'] ?? heightAt(MILL_POS[0], MILL_POS[1]);
  const wheelAt = { x: MILL_WHEEL.x, y: millY + 1.9, z: MILL_WHEEL.z, yaw: 0 };
  progress(0.05, 'Construction des maisons de Capyville…');
  const vb: VillageBuildings = await buildVillageBuildings(placements, wheelAt, (p) => progress(0.05 + p * 0.6, 'Construction des maisons de Capyville…'));
  lodRef = vb.lod;
  out.group.add(vb.lod);
  if (vb.wheel) {
    out.group.add(vb.wheel);
    const wheel = vb.wheel;
    out.update.push((t) => (wheel.rotation.x = -t * 0.55));
  }
  villageInfo.anchors = vb.anchors;
  await frame();

  // ------------------------------------------------------------------ ponts franchissables (walk.path du manifeste)
  for (const br of BRIDGES) {
    const info = vb.manifest.buildings['pont-' + br.id];
    if (!info?.walk || !info.placement) continue;
    const { x: px, z: pz, yaw } = info.placement;
    const base = bridgeBase[br.id];
    const path = info.walk.path, w = info.walk.width;
    const rails = br.type === 'arche-bois' || br.type === 'taikobashi-vermillon' || br.type === 'pont-route-bois' || br.type === 'passerelle-cordes';
    const x0 = path[0][0], x1 = path[path.length - 1][0];
    const yAt = (lx: number) => {
      for (let i = 0; i < path.length - 1; i++) if (lx <= path[i + 1][0]) return path[i][1] + ((path[i + 1][1] - path[i][1]) * (lx - path[i][0])) / (path[i + 1][0] - path[i][0] || 1);
      return path[path.length - 1][1];
    };
    const sl = 0.4;
    for (let lx = x0; lx < x1 - 1e-3; lx += sl) {
      const mx = Math.min(x1, lx + sl / 2 + sl / 2) - sl / 2;
      const top = base + Math.max(yAt(lx), yAt(Math.min(x1, lx + sl))) + 0.02;
      const [wx, wz] = localToWorld(px, pz, yaw, mx, 0);
      addBox(wx, wz, sl + 0.05, w, top - 0.6, top, -yaw, true);
      if (rails && lx > x0 + 0.6 && lx < x1 - 1) for (const s of [-1, 1]) {
        const [rx, rz] = localToWorld(px, pz, yaw, mx, s * (w / 2 + 0.08));
        addBox(rx, rz, sl + 0.05, 0.14, top - 0.3, top + 1.0, -yaw, false, 'thin');
      }
    }
    paveRect(px, pz, x1 - x0 + 2, w + 1, -yaw);
  }

  // ------------------------------------------------------------------ lanternes, noren et accroches des bâtiments
  progress(0.67, 'Lanternes et noren…');
  for (const a of vb.anchors) {
    if (a.name.startsWith('anchor_lantern')) {
      const k = a.kind ?? 'chochin';
      if (k.startsWith('chochin')) {
        chochin(inst, a.pos.x, a.pos.y - 0.36, a.pos.z, k !== 'chochin' || hashStr(a.owner) % 3 === 0);
        addLightSpot(a.pos.x, a.pos.y - 0.36, a.pos.z, 0xffa850, 0.8, 'lantern');
      } else if (k === 'andon') {
        const y = andon(inst, a.pos.x, floorAt(a.pos.x, a.pos.z), a.pos.z, a.yaw);
        addLightSpot(a.pos.x, y, a.pos.z, 0xffc070, 0.7, 'lantern');
      } else if (k === 'giboshi') {
        chochin(inst, a.pos.x, a.pos.y + 0.35, a.pos.z, false, 0.7);
        addLightSpot(a.pos.x, a.pos.y + 0.35, a.pos.z, 0xffc070, 0.5, 'lantern');
      } else {
        const y = toro(inst, a.pos.x, a.pos.y, a.pos.z, a.yaw, 0.8);
        addLightSpot(a.pos.x, y, a.pos.z, 0xffb060, 0.7, 'lantern');
      }
    } else if (a.name.startsWith('anchor_noren')) {
      const col = NOREN_COLORS[hashStr(a.owner) % NOREN_COLORS.length];
      noren(inst, a.pos, a.yaw, a.w ?? 1.6, Math.min(a.h ?? 0.9, 1.0), col, a.kind !== 'court');
    }
  }

  // ------------------------------------------------------------------ lanternes des voies (PATHS.light / lightSpacing)
  const buildingClear = (x: number, z: number, m: number) => !BUILDINGS.some((bd) => Math.hypot(bd.x - x, bd.z - z) < Math.hypot(bd.w, bd.d) / 2 + m);
  const pathClear = (x: number, z: number, self: string) => PATHS.every((q) => q.id === self || distToPolyline(x, z, q.pts) > q.width / 2 + 0.5);
  for (const p of PATHS) {
    if (p.light === 'aucun' || p.lightSpacing <= 0) continue;
    if (p.light === 'chochin' && (p.id === 'grand-rue' || p.id === 'rue-col')) continue; // chōchin sous les avant-toits (accroches)
    const { pts } = resample(p.pts, p.lightSpacing);
    pts.forEach((q, i) => {
      if (i === 0 && p.kind === 'rue') return;
      const side = i % 2 ? 1 : -1;
      if (p.id === 'torii-mille') {
        // chōchin suspendus sous les torii, au milieu du passage
        const y = stairAt(q.x, q.z);
        chochin(inst, q.x, y + 2.45, q.z, true, 0.9);
        addLightSpot(q.x, y + 2.45, q.z, 0xffa040, 0.6, 'lantern');
        return;
      }
      const off = p.width / 2 + (p.light === 'andon' ? 0.45 : 0.8);
      const x = q.x - q.dz * off * side, z = q.z + q.dx * off * side;
      if (!buildingClear(x, z, 0.8) || !pathClear(x, z, p.id)) return;
      const y = floorAt(x, z);
      if (p.light === 'toro') {
        const ly = toro(inst, x, y, z, Math.atan2(q.dx, q.dz));
        addLightSpot(x, ly, z, 0xffb060, 0.8, 'lantern');
      } else if (p.light === 'andon') {
        const ly = andon(inst, x, y, z, Math.atan2(q.dx, q.dz));
        addLightSpot(x, ly, z, 0xffc070, 0.7, 'lantern');
      } else {
        // poteau de bois à potence avec chōchin (promenades au bord de l'eau)
        const yaw = Math.atan2(q.dx, q.dz);
        const W = fmats().wood;
        b.addAt(new THREE.BoxGeometry(0.12, 2.6, 0.12).translate(0, 1.3, 0), W, x, y, z, yaw);
        b.add(new THREE.BoxGeometry(0.7, 0.08, 0.08).translate(-0.3 * side, 2.5, 0), W, poseM(x, y, z, yaw));
        const [lx, lz] = [x - Math.cos(yaw) * 0.55 * side, z + Math.sin(yaw) * 0.55 * side];
        chochin(inst, lx, y + 2.12, lz, i % 3 === 0);
        addLightSpot(lx, y + 2.12, lz, 0xffa850, 0.8, 'lantern');
        addBox(x, z, 0.2, 0.2, y, y + 2.6, -yaw, false, 'thin');
      }
    });
  }

  // ------------------------------------------------------------------ portes du village et panneaux indicateurs
  const signs = new Signs();
  const regionName = (axis: string) => {
    const r = REGIONS.find((q) => q.id === axis);
    return (r?.name ?? axis).replace('Le Désert des Dunes', 'Le Désert').replace(/^Le /, '');
  };
  for (const g of VILLAGE_GATES) {
    const street = PATHS.find((p) => p.axis === g.axis && (p.kind === 'rue'))!;
    const n = street.pts.length;
    const [ax, az] = street.pts[n - 2], [bx, bz] = street.pts[n - 1];
    const l = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / l, dz = (bz - az) / l;
    const yaw = Math.atan2(dx, dz);
    const gx = g.x - dx * 2, gz = g.z - dz * 2;
    const y = heightAt(gx, gz);
    if (g.gate === 'portail-bois') woodenGate(b, gx, y, gz, yaw, street.width + 1.4);
    else if (g.gate === 'lanternes') {
      for (const s of [-1, 1]) {
        const x = gx + dz * s * (street.width / 2 + 1.3), z = gz - dx * s * (street.width / 2 + 1.3);
        const ly = toro(inst, x, heightAt(x, z), z, yaw, 1.4);
        addLightSpot(x, ly, z, 0xffb060, 1, 'lantern');
      }
    }
    // poteau indicateur sur le bas-côté droit, juste à l'intérieur de la porte
    const sx = gx - dx * 3 - dz * (street.width / 2 + 1.8), sz = gz - dz * 3 + dx * (street.width / 2 + 1.8);
    const arrows = [{ text: regionName(g.axis), dir: yaw }, { text: 'Place du Cerisier', dir: Math.atan2(-sx, -sz) }];
    if (g.axis === 'newyork') arrows.push({ text: 'Prairie du Levant', dir: Math.atan2(158 - sx, 18 - sz) });
    if (g.axis === 'desert') arrows.push({ text: 'Verger des Yuzus', dir: Math.atan2(114 - sx, 150 - sz) });
    signs.add(sx, heightAt(sx, sz), sz, arrows);
  }
  // grand panneau à six flèches sur la place, au pied du cerisier
  signs.add(-4, 6.05, -13, VILLAGE_GATES.map((g) => ({ text: regionName(g.axis), dir: Math.atan2(g.x + 4, g.z + 13) })).slice(0, 6));
  signs.add(-1, heightAt(-1, 60), 60, [{ text: 'Bains ♨ Rotenburo', dir: Math.atan2(60 - -1, 70 - 60) }, { text: 'Pont de Fuji', dir: Math.PI * 0.98 }]);
  signs.build(b);

  // ------------------------------------------------------------------ rotenburo (bassin de la mission), ponton de Nina
  {
    const P = HOT_SPRING_POOL;
    const water = new THREE.MeshStandardMaterial({ color: 0x9adcd4, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.82 });
    b.addAt(new THREE.CircleGeometry(P.r + 0.2, 40).rotateX(-Math.PI / 2), water, P.x, P.waterY, P.z, 0, false);
    // vapeur légère (une seule InstancedMesh)
    const steamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false });
    const n = 16;
    const steam = new THREE.InstancedMesh(new THREE.SphereGeometry(1.4, 10, 8), steamMat, n);
    steam.name = 'vapeur-rotenburo';
    steam.frustumCulled = false;
    const seeds = Array.from({ length: n }, (_, i) => [P.x + Math.cos(i * 2.4) * (i % 5) * 1.4, P.z + Math.sin(i * 2.4) * (i % 5) * 1.4, i * 0.37]);
    const m = new THREE.Matrix4();
    out.update.push((t) => {
      seeds.forEach(([x, z, ph], i) => {
        const k = (t * 0.22 + ph) % 1;
        m.compose(new THREE.Vector3(x, P.waterY + 0.4 + k * 5, z), new THREE.Quaternion(), new THREE.Vector3().setScalar(0.6 + k * 1.5));
        steam.setMatrixAt(i, m);
      });
      steam.instanceMatrix.needsUpdate = true;
    });
    out.group.add(steam);
    addSmokeSpot(P.x, P.waterY + 0.3, P.z, 'steam');
    // ponton de Nina sur la rive nord de l'étang
    const dx = -110, dz0 = 61, dz1 = 70.5;
    const planks = pbr('planks', { scale: 2, color: 0x9a7a5a });
    const dl = dz1 - dz0;
    b.addAt(new THREE.BoxGeometry(2.2, 0.14, dl).translate(0, 0, dl / 2), planks, dx, 0.85, dz0);
    for (let k = 0; k <= 3; k++) for (const s of [-1, 1]) b.addAt(new THREE.CylinderGeometry(0.09, 0.09, 2.4).translate(0, -0.3, 0), std(0x5a4030, 0.9), dx + s * 0.95, 0.85, dz0 + 1 + k * (dl - 1.5) / 3);
    addBox(dx, dz0 + dl / 2, 2.2, dl, -1.5, 0.92, 0, true);
  }

  // ------------------------------------------------------------------ arbres provisoires (la Végétation les remplacera)
  for (const t of FEATURE_TREES) {
    const kind = t.kind.startsWith('cerisier') ? 'cherry' : t.kind === 'pin-noir' || t.kind === 'cedre-geant' ? 'pine' : 'oak';
    ctx.forest.add(kind, t.x, t.z, t.h / (kind === 'pine' ? 11 : 8));
  }
  {
    const c = Math.cos(ORCHARD.yaw), s = Math.sin(ORCHARD.yaw);
    for (let u = -ORCHARD.w / 2 + 3; u <= ORCHARD.w / 2 - 3; u += ORCHARD.spacing)
      for (let v = -ORCHARD.d / 2 + 3, r = 0; v <= ORCHARD.d / 2 - 3; v += ORCHARD.spacing, r++) {
        const uu = u + (r % 2) * ORCHARD.spacing * 0.5;
        const x = ORCHARD.x + uu * c + v * s, z = ORCHARD.z - uu * s + v * c;
        if (PATHS.some((p) => distToPolyline(x, z, p.pts) < p.width / 2 + 2)) continue;
        ctx.forest.add('oak', x, z, 0.5);
      }
    for (const [x, z] of YUZU_SPOTS) ctx.forest.add('oak', x + 1.6, z + 1.2, 0.5);
  }

  // ------------------------------------------------------------------ décor Poly Haven
  progress(0.72, 'Rochers moussus, seaux et tonneaux…');
  try {
    await Models.load(SCATTER_IDS, (p) => progress(0.72 + p * 0.2, 'Rochers moussus, seaux et tonneaux…'));
    const d = scatterVillageDecor();
    out.group.add(d.group);
    villageInfo.stats.decor = d.counts;
  } catch (e) {
    console.warn('Intégration village : décor Poly Haven indisponible', e);
  }

  out.group.add(b.build('village-mobilier'));
  out.group.add(inst.build('village-instances'));

  // ------------------------------------------------------------------ positions de jeu
  const at = (x: number, z: number, dy = 0.2) => new THREE.Vector3(x, floorAt(x, z) + dy, z);
  out.spots.start = new THREE.Vector3(SPAWN.x, heightAt(SPAWN.x, SPAWN.z) + 0.3, SPAWN.z);
  out.spots.startYaw = new THREE.Vector3(SPAWN.yaw, 0, 0);
  out.spots.spring = new THREE.Vector3(HOT_SPRING_POOL.x, HOT_SPRING_POOL.waterY + 0.2, HOT_SPRING_POOL.z);
  out.spots.pond = new THREE.Vector3(POND.x, 0, POND.z);
  out.spots.windmill = new THREE.Vector3(MILL_POS[0], millY, MILL_POS[1]);
  out.spots.shop = at(NPC_SPOTS.shop.x, NPC_SPOTS.shop.z);
  out.spots.home = out.spots.start.clone();
  (out.spots as any).yuzuList = YUZU_SPOTS.map(([x, z]) => new THREE.Vector3(x, heightAt(x, z) + 0.6, z));
  out.photos.push({ id: 'windmill', name: 'Le moulin à eau', region: 'hub', target: new THREE.Vector3(wheelAt.x, wheelAt.y, wheelAt.z), radius: 120 });
  out.photos.push({ id: 'pagode-capyville', name: 'La pagode rouge', region: 'hub', target: new THREE.Vector3(-42, 38, -119), radius: 260 });

  const S = NPC_SPOTS;
  const npc = (id: keyof typeof S, d: Omit<NpcDef, 'id' | 'pos' | 'rot'>, y?: number): NpcDef => ({
    id, pos: y === undefined ? at(S[id].x, S[id].z) : new THREE.Vector3(S[id].x, y, S[id].z), rot: S[id].yaw, ...d,
  });
  out.npcs.push(
    npc('mamie', { name: 'Mamie Capy', fur: 0xa88a6a, hat: 'flower', scarf: 0x9a5ac8, size: 1.05 }),
    npc('shop', { name: 'Basile le chapelier', fur: 0x8a6040, hat: 'tophat', scarf: 0x3a8a4a }),
    npc('onsen1', { name: 'Capy zen', fur: 0x9a6a43, hat: 'yuzu' }, HOT_SPRING_POOL.waterY - 0.3),
    npc('onsen2', { name: 'Capy zen', fur: 0x8a5a33, hat: 'yuzu' }, HOT_SPRING_POOL.waterY - 0.3),
    npc('coach', { name: 'Coach Capy', fur: 0x8a5a33, hat: 'cap', scarf: 0x1e4fa8 }),
    npc('swimmer', { name: 'Nina la nageuse', fur: 0xa87a52, hat: 'flower', scarf: 0x3fd0ff }),
    npc('photographer', { name: 'Léo le photographe', fur: 0x9b6a43, hat: 'beret', scarf: 0xffc83a }),
    npc('miller', { name: 'Le meunier', fur: 0x7a5232, hat: 'kasa', scarf: 0xe8dcc0 }),
    npc('tea', { name: 'Hôtesse Momo', fur: 0xb58a60, hat: 'flower', scarf: 0xc8303a }),
  );
  for (const v of VEHICLE_SPOTS) out.vehicles.push({ type: v.type, pos: new THREE.Vector3(v.x, heightAt(v.x, v.z), v.z), rot: v.yaw });
  out.walkPoints = villageWalkPoints();

  villageInfo.stats.lod = vb.lod.stats();
  villageInfo.stats.placements = placements.length;
  progress(1, 'Capyville est prête');
  void pointAlong;
  return out;
}
