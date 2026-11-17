// Image de la carte (générée depuis le relief) + mini-carte tournante.
import * as THREE from 'three';
import { HM_RES, heights, splat } from '../world/heightmap';
import { grassMask } from '../world/grass';
import { roadSamples } from '../world/heightmap';
import { WORLD_SIZE } from '../world/layout';

export const worldToMap = (x: number, z: number) => ({ u: (x + WORLD_SIZE / 2) / WORLD_SIZE, v: (z + WORLD_SIZE / 2) / WORLD_SIZE });

export function buildMapImage(size = 2048): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(HM_RES, HM_RES);
  for (let j = 0; j < HM_RES; j++)
    for (let i = 0; i < HM_RES; i++) {
      const k = j * HM_RES + i;
      const h = heights[k];
      let r: number, gg: number, b: number;
      if (h < 0) {
        const d = Math.min(1, -h / 12);
        r = 90 - d * 60; gg = 190 - d * 80; b = 215 - d * 40;
      } else {
        const gr = splat[k * 4] / 255, sa = splat[k * 4 + 1] / 255, sn = splat[k * 4 + 2] / 255, ro = splat[k * 4 + 3] / 255;
        r = gr * 120 + sa * 232 + sn * 245 + ro * 150;
        gg = gr * 180 + sa * 206 + sn * 250 + ro * 140;
        b = gr * 80 + sa * 150 + sn * 255 + ro * 130;
        const paved = grassMask[k * 4 + 3] < 20 && gr > 0.5;
        if (paved) { r = 196; gg = 190; b = 182; }
        // ombrage du relief
        const hx = heights[k + 1 < heights.length ? k + 1 : k] - h;
        const hz = heights[k + HM_RES < heights.length ? k + HM_RES : k] - h;
        const shade = Math.max(0.6, Math.min(1.25, 1 - (hx + hz) * 0.08));
        r *= shade; gg *= shade; b *= shade;
      }
      img.data[k * 4] = r; img.data[k * 4 + 1] = gg; img.data[k * 4 + 2] = b; img.data[k * 4 + 3] = 255;
    }
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = HM_RES;
  tmp.getContext('2d')!.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(tmp, 0, 0, size, size);
  // routes
  g.strokeStyle = '#fdf6e6';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const r of roadSamples) {
    g.lineWidth = (r.width / WORLD_SIZE) * size * 1.6;
    g.beginPath();
    r.pts.forEach(([x, z], i) => {
      const m = worldToMap(x, z);
      if (i) g.lineTo(m.u * size, m.v * size);
      else g.moveTo(m.u * size, m.v * size);
    });
    g.stroke();
  }
  return c;
}

export class Minimap {
  private ctx: CanvasRenderingContext2D;
  constructor(private canvas: HTMLCanvasElement, private img: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }
  draw(px: number, pz: number, camYaw: number, playerYaw: number, markers: { pos: THREE.Vector3; color: string; icon?: string }[], range = 220) {
    const g = this.ctx;
    const W = this.canvas.width;
    const S = this.img.width;
    const scale = (W / 2) / ((range / WORLD_SIZE) * S);
    const m = worldToMap(px, pz);
    g.save();
    g.fillStyle = '#5ab0d0';
    g.fillRect(0, 0, W, W);
    g.translate(W / 2, W / 2);
    g.rotate(camYaw + Math.PI);
    g.scale(scale, scale);
    g.drawImage(this.img, -m.u * S, -m.v * S);
    g.restore();
    // marqueurs
    const rot = camYaw + Math.PI;
    for (const mk of markers) {
      const dx = mk.pos.x - px, dz = mk.pos.z - pz;
      let x = dx * Math.cos(rot) - dz * Math.sin(rot);
      let y = dx * Math.sin(rot) + dz * Math.cos(rot);
      const k = (W / 2) / range;
      x *= k; y *= k;
      const l = Math.hypot(x, y);
      const lim = W / 2 - 14;
      if (l > lim) { x *= lim / l; y *= lim / l; }
      g.fillStyle = mk.color;
      g.strokeStyle = '#fff';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(W / 2 + x, W / 2 + y, mk.icon ? 11 : 7, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      if (mk.icon) {
        g.fillStyle = '#3a2200';
        g.font = 'bold 15px Arial';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(mk.icon, W / 2 + x, W / 2 + y + 1);
      }
    }
    // joueur
    g.save();
    g.translate(W / 2, W / 2);
    g.rotate(-(playerYaw - camYaw));
    g.fillStyle = '#ff3b3b';
    g.strokeStyle = '#fff';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, -12); g.lineTo(9, 10); g.lineTo(0, 5); g.lineTo(-9, 10);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
