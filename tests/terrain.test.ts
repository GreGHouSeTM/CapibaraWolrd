// Contrôles du relief de Capyville (spécialité Terrain & relief) : altitudes de la bible, place plate,
// torrent encaissé, étang, pentes des axes et masquage des villes voisines.
import { describe, it, expect, beforeAll } from 'vitest';
import { bakeWorld, heightAt, roadSamples } from '../src/world/heightmap';
import { streamInfo, streamWaterAt, streamBedAt } from '../src/world/valley';
import { ALTITUDES, POND, STREAM, HOT_SPRING_POOL } from '../src/world/zones';
import { REGIONS } from '../src/world/layout';

beforeAll(() => bakeWorld(), 120000);

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
