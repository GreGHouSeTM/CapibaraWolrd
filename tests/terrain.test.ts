// Contrôles du relief de Capyville (spécialité Terrain & relief) : altitudes de la bible, place plate,
// torrent encaissé, étang, pentes des axes et masquage des villes voisines.
import { describe, it, expect, beforeAll } from 'vitest';
import { heightAt, roadSamples, biomeAt, surfaceAt } from '../src/world/heightmap';
import { loadTestTerrain } from './helpers/terrain';
import { terrainData } from '../src/world/terrain-data';
import * as legacy from '../tools/terrain/legacy/heightmap';
import { WAYS, WORLD_PEAKS, WORLD_REGIONS, LAKES } from '../src/world/world-map';
import { streamInfo, streamWaterAt, streamBedAt } from '../src/world/valley';
import { ALTITUDES, POND, STREAM, HOT_SPRING_POOL } from '../src/world/zones';
import { REGIONS } from '../src/world/layout';

beforeAll(async () => { await loadTestTerrain(); legacy.bakeWorld(); }, 180000);

describe('raccord du monde de 8 km à Capyville', () => {
  it('garde la vallée de Capyville identique au relief d’origine (grille de 2 m, r < 420 m)', () => {
    let worst = 0, sum = 0, n = 0, wx = 0, wz = 0;
    for (let x = -440; x <= 440; x += 2)
      for (let z = -440; z <= 440; z += 2) {
        if (Math.hypot(x, z) > 420) continue;
        const d = Math.abs(heightAt(x, z) - legacy.heightAt(x, z));
        sum += d; n++;
        if (d > worst) { worst = d; wx = x; wz = z; }
      }
    // « au mètre près » ; en pratique quelques millimètres (quantification des tuiles de 2 m à l'est de x = 200)
    expect(worst, `écart max en (${wx}, ${wz})`).toBeLessThan(1);
    expect(sum / n).toBeLessThan(0.02);
  });

  it('pose les régions sur leur sol (cœur bâti à l’altitude de world-map.ts, ±1 m)', () => {
    for (const r of WORLD_REGIONS) {
      if (r.id === 'hub') continue;
      // le centre peut tomber dans un lit de rivière (Paris, Londres) : on regarde la médiane d'un anneau de 120 m
      const hs: number[] = [];
      for (let a = 0; a < 6.28; a += 0.2) hs.push(heightAt(r.x + Math.cos(a) * 120, r.z + Math.sin(a) * 120));
      hs.sort((a, b) => a - b);
      expect(Math.abs(hs[hs.length >> 1] - r.ground), r.id).toBeLessThan(1.5);
    }
  });

  it('atteint les grands repères (sommets à ±8 %)', () => {
    for (const id of ['aurore', 'neiges', 'fuji', 'dormeur', 'dome-guetteur', 'butte-arbre']) {
      const p = WORLD_PEAKS.find((q) => q.id === id)!;
      let top = -Infinity;
      for (let dx = -60; dx <= 60; dx += 4) for (let dz = -60; dz <= 60; dz += 4) top = Math.max(top, heightAt(p.x + dx, p.z + dz));
      expect(Math.abs(top - p.y) / p.y, `${id} : ${top.toFixed(0)} m pour ${p.y} m`).toBeLessThan(0.08);
    }
  });

  it('fournit des cartes dérivées cohérentes (neige au Pic, sable dans l’erg, roche aux falaises)', () => {
    expect(biomeAt(-2300, 470)[1], 'neige au Pic de l’Aurore').toBeGreaterThan(0.6);
    expect(biomeAt(3000, 1100)[0], 'sable de l’erg').toBeGreaterThan(0.6);
    expect(biomeAt(0, 0)[1], 'pas de neige à Capyville').toBeLessThan(0.05);
    // falaises côtières des Hautes Plaines : roche franche dans les 300 m autour du point de contrôle
    let rk = 0;
    for (let dx = -300; dx <= 300; dx += 20) for (let dz = -300; dz <= 300; dz += 20) rk = Math.max(rk, surfaceAt(3500 + dx, -400 + dz)[3]);
    expect(rk, 'roche des falaises des Hautes Plaines').toBeGreaterThan(0.5);
  });

  it('creuse les lacs sous leur niveau d’eau, avec des rives émergées', () => {
    for (const l of LAKES) {
      if (l.dry) continue;
      expect(heightAt(l.x, l.z), l.id).toBeLessThan(l.y - 0.5);
    }
  });

  it('pose les voies du monde à pente bornée, sur leur plateforme (routes ≤ 8 %, pistes ≤ 10 %, chemins ≤ 12 %, sentiers ≤ 25 %)', () => {
    const G: Record<string, number> = { route: 0.08, piste: 0.1, chemin: 0.12, sentier: 0.25 };
    const ways = terrainData!.meta.ways!;
    const works = terrainData!.meta.ouvrages ?? [];
    expect(ways.length).toBeGreaterThan(20);
    for (const w of ways) {
      const spans = works.filter((o) => o.way === w.id);
      const inWork = (s: number) => spans.some((o) => s >= o.s0 - 4 && s <= o.s1 + 4);
      const gr: number[] = [];
      let n = 0, on = 0, s = 0;
      for (let i = 1; i < w.pts.length; i++) {
        const l = Math.hypot(w.pts[i][0] - w.pts[i - 1][0], w.pts[i][1] - w.pts[i - 1][1]);
        s += l;
        if (l < 1) continue;
        gr.push(Math.abs(w.y[i] - w.y[i - 1]) / l);
        if (inWork(s)) continue;
        n++;
        // la chaussée est posée sur le relief (hors ouvrages déclarés et vallée de Capyville)
        if (Math.abs(heightAt(w.pts[i][0], w.pts[i][1]) - w.y[i]) < 0.6 || Math.hypot(w.pts[i][0], w.pts[i][1]) < 700) on++;
      }
      gr.sort((a, b) => a - b);
      const p95 = gr[Math.floor(gr.length * 0.95)];
      // Route du Givre (col à 330 m sur un massif raide), pistes de Jade et des Ocres : pente relâchée (docs/ETAT-TERRAIN-V2.md)
      const tol = w.id === 'route-pole' ? 1.75 : w.id === 'piste-jade' || w.id === 'piste-desert' ? 1.35 : 1.06;
      expect(p95, `${w.id} : pente p95`).toBeLessThanOrEqual(G[w.kind] * tol);
      // aux carrefours, la plateforme de la voie prioritaire l'emporte (le ruban suit heightAt) : 85 % au moins posés sur leur profil
      expect(on / Math.max(1, n), `${w.id} : posée`).toBeGreaterThan(0.85);
    }
  });
});

describe('relief de Capyville', () => {
  it('respecte les altitudes de contrôle (±0,3 m)', () => {
    for (const a of ALTITUDES) {
      // le plancher du rotenburo est le pourtour du bassin ; la maison de thé est sur une avancée rocheuse
      const [x, z] = a.what.includes('rotenburo') ? [a.x + HOT_SPRING_POOL.r + 2, a.z] : [a.x, a.z];
      expect(Math.abs(heightAt(x, z) - a.y), a.what).toBeLessThanOrEqual(0.3);
    }
  });

  it('garde la place strictement plate', () => {
    for (let x = -26; x <= 26; x += 2) for (let z = -20; z <= 20; z += 2) if (Math.abs(x) + Math.abs(z) < 40) expect(heightAt(x, z)).toBeCloseTo(6, 2);
  });

  it('creuse le lit du torrent sous l’eau avec des berges au-dessus', () => {
    let bad = 0, n = 0;
    for (let i = 0; i < STREAM.length - 4; i++) {
      const [ax, az] = STREAM[i], [bx, bz] = STREAM[i + 1];
      const l = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s < l; s += 2) {
        const x = ax + ((bx - ax) * s) / l, z = az + ((bz - az) * s) / l;
        const st = streamInfo(x, z);
        const nx = -(bz - az) / l, nz = (bx - ax) / l;
        n += 3;
        if (heightAt(x, z) > st.waterY - 0.2) bad++;
        for (const sg of [-1, 1]) if (heightAt(x + nx * sg * (st.width / 2 + 0.8), z + nz * sg * (st.width / 2 + 0.8)) < st.waterY) bad++;
      }
    }
    expect(bad / n).toBeLessThan(0.02);
    expect(streamWaterAt(66, 0)).toBeCloseTo(4.9, 1);
    expect(streamBedAt(66, 0)).toBeCloseTo(4.1, 1);
  });

  it('a un étang sous l’eau et des rives émergées', () => {
    expect(heightAt(POND.x, POND.z)).toBeLessThan(-1.5);
    for (let a = 0; a < 6.28; a += 0.2) {
      const x = POND.x + Math.cos(a) * POND.rx * 1.25, z = POND.z + Math.sin(a) * POND.rz * 1.25;
      expect(heightAt(x, z)).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('garde les axes sous 9 % de pente', () => {
    for (const r of roadSamples.slice(0, 6))
      for (let i = 1; i < r.pts.length; i++) {
        const l = Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
        if (l > 1) expect(Math.abs(r.h[i] - r.h[i - 1]) / l).toBeLessThan(0.09);
      }
  });

  it('masque Paris, New York et Londres depuis la place et la pagode', () => {
    const reg = (id: string) => REGIONS.find((r) => r.id === id)!;
    const P = reg('paris'), N = reg('newyork'), L = reg('london');
    const targets: [number, number, number][] = [[P.x - 140, P.z + 175, 118], [L.x, L.z, 100]];
    for (let a = 0; a < 6.28; a += 0.4)
      for (const d of [0, 100, 200, 260]) {
        targets.push([P.x + Math.cos(a) * d, P.z + Math.sin(a) * d, 31]);
        targets.push([N.x + Math.cos(a) * d, N.z + Math.sin(a) * d, 36 + 180 * Math.exp(-(d * d) / (2 * 130 * 130))]);
        targets.push([L.x + Math.cos(a) * d, L.z + Math.sin(a) * d, 22]);
      }
    const eyes: [number, number][] = [[0, 0], [0, 10], [-38, -108], [-46, -124]];
    for (const [ex, ez] of eyes) {
      const ey = heightAt(ex, ez) + 1.5;
      for (const [tx, tz, top] of targets) {
        const D = Math.hypot(tx - ex, tz - ez);
        let hidden = false;
        for (let s = 10; s < D - 30 && !hidden; s += 4) {
          const x = ex + ((tx - ex) * s) / D, z = ez + ((tz - ez) * s) / D;
          if (heightAt(x, z) > ey + ((top - ey) * s) / D) hidden = true;
        }
        expect(hidden, `cible (${tx.toFixed(0)}, ${tz.toFixed(0)}) vue depuis (${ex}, ${ez})`).toBe(true);
      }
    }
  });
});
