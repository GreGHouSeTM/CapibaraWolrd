// Routes entre les régions : rubans d'asphalte qui suivent le relief, avec bandes blanches et lampadaires.
import * as THREE from 'three';
import { roadSamples, heightAt } from './heightmap';
import { pbr } from '../core/assets';
import { Batch, std } from '../procgen/kit';
import { addLamp, insideCity } from '../procgen/city';
import { paveRect } from './grass';

function ribbon(b: Batch, pts: [number, number][], h: number[], width: number, asphalt: THREE.Material, line: THREE.Material, dash: THREE.Material) {
  {
    const pos: number[] = [], uv: number[] = [], nor: number[] = [], idx: number[] = [];
    const lines: number[][] = [[], [], []];
    let along = 0;
    const W = width / 2;
    const across = 4;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[Math.min(i + 1, pts.length - 1)];
      const o = pts[Math.max(i - 1, 0)];
      const dx = q[0] - o[0], dz = q[1] - o[1];
      const l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l;
      if (i > 0) along += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      for (let k = 0; k <= across; k++) {
        const t = k / across - 0.5;
        const x = p[0] + nx * t * width * 1.12, z = p[1] + nz * t * width * 1.12;
        const y = Math.max(h[i], heightAt(x, z)) + 0.12;
        pos.push(x, y, z);
        nor.push(0, 1, 0);
        uv.push((t * width) / 7, along / 7);
      }
      for (const [li, off] of [[0, -W + 0.5], [1, W - 0.5], [2, 0]] as const) {
        const x = p[0] + nx * off, z = p[1] + nz * off;
        lines[li].push(x, Math.max(h[i], heightAt(x, z)) + 0.15, z);
      }
      // herbe retirée sur toute la chaussée et ses bas-côtés
      paveRect(p[0], p[1], width + 4, 7, -Math.atan2(dx, dz));
      if (i % 14 === 7) {
        const x = p[0] + nx * (W + 1.6), z = p[1] + nz * (W + 1.6);
        if (!insideCity(x, z, 4)) addLamp(b, 'paris', x, heightAt(x, z), z, Math.atan2(nx, nz) + Math.PI);
      }
    }
    const row = across + 1;
    for (let i = 0; i < pts.length - 1; i++)
      for (let k = 0; k < across; k++) {
        const a = i * row + k, c = (i + 1) * row + k;
        idx.push(a, c, a + 1, a + 1, c, c + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    b.add(g, asphalt, undefined, false);
    lines.forEach((ln, li) => {
      for (let i = 0; i < ln.length / 3 - 1; i++) {
        if (li === 2 && i % 2 === 1) continue;
        const a = new THREE.Vector3(ln[i * 3], ln[i * 3 + 1], ln[i * 3 + 2]);
        const c = new THREE.Vector3(ln[i * 3 + 3], ln[i * 3 + 4], ln[i * 3 + 5]);
        const len = a.distanceTo(c);
        const geo = new THREE.BoxGeometry(0.18, 0.02, li === 2 ? len * 0.6 : len);
        const m = new THREE.Matrix4().lookAt(a, c, new THREE.Vector3(0, 1, 0)).setPosition(a.clone().lerp(c, 0.5));
        b.add(geo, li === 2 ? dash : line, m, false);
      }
    });
  }
}

export function buildRoads(): THREE.Group {
  const asphalt = pbr('asphalt', { scale: 7, roughness: 1 });
  const line = std(0xf4f4ec, 0.6);
  const dash = std(0xf2d14a, 0.6);
  const b = new Batch(200);
  for (const road of roadSamples) {
    // on découpe la route en tronçons hors des villes (les rues de la ville prennent le relais)
    const runs: { pts: [number, number][]; h: number[] }[] = [];
    let cur: { pts: [number, number][]; h: number[] } | null = null;
    road.pts.forEach((p, i) => {
      if (insideCity(p[0], p[1], 2)) { cur = null; return; }
      if (!cur) runs.push((cur = { pts: [], h: [] }));
      cur.pts.push(p);
      cur.h.push(road.h[i]);
    });
    for (const run of runs) if (run.pts.length > 1) ribbon(b, run.pts, run.h, road.width, asphalt, line, dash);
  }
  return b.build('roads');
}
