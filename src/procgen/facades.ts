// Textures de façades peintes par programme : couleur, relief (→ normales), rugosité et fenêtres allumées la nuit.
import * as THREE from 'three';
import { Rng } from '../core/math';
import { IMG } from '../core/assets';

export interface FacadeSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  emissiveMap: THREE.Texture;
  /** nombre de travées et d'étages représentés par la texture */
  bays: number;
  floors: number;
}

interface Paint { c?: string; h?: number; r?: number; e?: string }

class Painter {
  W: number; H: number;
  alb: CanvasRenderingContext2D; hgt: CanvasRenderingContext2D; rgh: CanvasRenderingContext2D; emi: CanvasRenderingContext2D;
  canv: HTMLCanvasElement[] = [];
  constructor(W: number, H: number) {
    this.W = W; this.H = H;
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      this.canv.push(c);
      return c.getContext('2d', { willReadFrequently: true })!;
    };
    this.alb = mk(); this.hgt = mk(); this.rgh = mk(); this.emi = mk();
    this.hgt.fillStyle = '#808080'; this.hgt.fillRect(0, 0, W, H);
    this.rgh.fillStyle = '#d8d8d8'; this.rgh.fillRect(0, 0, W, H);
    this.emi.fillStyle = '#000'; this.emi.fillRect(0, 0, W, H);
  }
  rect(x: number, y: number, w: number, h: number, p: Paint) {
    if (p.c) { this.alb.fillStyle = p.c; this.alb.fillRect(x, y, w, h); }
    if (p.h !== undefined) { const v = Math.round(p.h * 255); this.hgt.fillStyle = `rgb(${v},${v},${v})`; this.hgt.fillRect(x, y, w, h); }
    if (p.r !== undefined) { const v = Math.round(p.r * 255); this.rgh.fillStyle = `rgb(0,${v},0)`; this.rgh.fillRect(x, y, w, h); }
    if (p.e) { this.emi.fillStyle = p.e; this.emi.fillRect(x, y, w, h); }
  }
  /** Vitre : dégradé, reflet diagonal et éventuel éclairage nocturne. */
  glass(x: number, y: number, w: number, h: number, rng: Rng, lit: boolean, tint = [40, 52, 66]) {
    const g = this.alb.createLinearGradient(x, y, x, y + h);
    const [r, gg, b] = tint;
    g.addColorStop(0, `rgb(${r + 45},${gg + 50},${b + 55})`);
    g.addColorStop(0.5, `rgb(${r},${gg},${b})`);
    g.addColorStop(1, `rgb(${r - 15},${gg - 15},${b - 12})`);
    this.alb.fillStyle = g;
    this.alb.fillRect(x, y, w, h);
    this.alb.save();
    this.alb.beginPath();
    this.alb.rect(x, y, w, h);
    this.alb.clip();
    this.alb.fillStyle = 'rgba(255,255,255,0.08)';
    this.alb.beginPath();
    const o = rng.range(-w, w);
    this.alb.moveTo(x + o, y + h);
    this.alb.lineTo(x + o + w * 0.4, y + h);
    this.alb.lineTo(x + o + w * 1.2, y);
    this.alb.lineTo(x + o + w * 0.8, y);
    this.alb.fill();
    this.alb.restore();
    this.rect(x, y, w, h, { h: 0.3, r: 0.06 });
    if (lit) {
      const warm = rng.chance(0.8);
      const eg = this.emi.createLinearGradient(x, y, x, y + h);
      eg.addColorStop(0, warm ? '#ffd9a0' : '#d8e8ff');
      eg.addColorStop(1, warm ? '#c98a40' : '#8aa6d8');
      this.emi.fillStyle = eg;
      this.emi.fillRect(x, y, w, h);
      // silhouette de rideau
      if (rng.chance(0.5)) { this.emi.fillStyle = 'rgba(0,0,0,0.45)'; this.emi.fillRect(x, y, w * rng.range(0.2, 0.4), h); }
    }
  }
  noise(alpha: number, scale = 1, rng = new Rng(7)) {
    const { W, H } = this;
    for (let i = 0; i < (W * H) / 30; i++) {
      const v = rng.range(0, 255);
      this.alb.fillStyle = `rgba(${v},${v},${v},${alpha})`;
      this.alb.fillRect(rng.next() * W, rng.next() * H, rng.range(1, 3) * scale, rng.range(1, 3) * scale);
    }
  }
  /** Taches d'usure verticales (salissures sous les appuis). */
  grime(alpha: number, rng: Rng) {
    const { W, H } = this;
    for (let i = 0; i < 60; i++) {
      const x = rng.next() * W, y = rng.next() * H, w = rng.range(4, 30), h = rng.range(20, 120);
      const g = this.alb.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, `rgba(40,35,30,${alpha})`);
      g.addColorStop(1, 'rgba(40,35,30,0)');
      this.alb.fillStyle = g;
      this.alb.fillRect(x, y, w, h);
    }
  }
  text(s: string, x: number, y: number, size: number, color: string, font = 'bold', emissive?: string, family = 'Georgia, serif') {
    for (const [ctx, col] of [[this.alb, color], ...(emissive ? [[this.emi, emissive]] : [])] as [CanvasRenderingContext2D, string][]) {
      ctx.font = `${font} ${size}px ${family}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = col;
      ctx.fillText(s, x, y);
    }
  }
  drawImage(img: HTMLImageElement, tint: string, alpha = 1, scale = 1) {
    const { W, H } = this;
    const pat = this.alb.createPattern(this.scaleImg(img, scale), 'repeat')!;
    this.alb.fillStyle = pat;
    this.alb.fillRect(0, 0, W, H);
    this.alb.globalCompositeOperation = 'multiply';
    this.alb.globalAlpha = alpha;
    this.alb.fillStyle = tint;
    this.alb.fillRect(0, 0, W, H);
    this.alb.globalCompositeOperation = 'source-over';
    this.alb.globalAlpha = 1;
  }
  private scaleImg(img: HTMLImageElement, s: number) {
    const c = document.createElement('canvas');
    c.width = Math.max(8, Math.round(img.width * s));
    c.height = Math.max(8, Math.round(img.height * s));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  /** Ajoute le relief de la photo dans la carte de hauteur (briques, pierres). */
  heightFromImage(img: HTMLImageElement, scale: number, amount: number) {
    const c = this.scaleImg(img, scale);
    this.hgt.globalAlpha = amount;
    this.hgt.fillStyle = this.hgt.createPattern(c, 'repeat')!;
    this.hgt.globalCompositeOperation = 'overlay';
    this.hgt.fillRect(0, 0, this.W, this.H);
    this.hgt.globalCompositeOperation = 'source-over';
    this.hgt.globalAlpha = 1;
  }

  finish(bays: number, floors: number, strength = 3): FacadeSet {
    const { W, H } = this;
    // relief → normales (filtre de Sobel)
    const src = this.hgt.getImageData(0, 0, W, H).data;
    const nc = document.createElement('canvas');
    nc.width = W; nc.height = H;
    const ng = nc.getContext('2d')!;
    const img = ng.createImageData(W, H);
    const Hh = (x: number, y: number) => src[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const dx = (Hh(x - 1, y - 1) + 2 * Hh(x - 1, y) + Hh(x - 1, y + 1) - Hh(x + 1, y - 1) - 2 * Hh(x + 1, y) - Hh(x + 1, y + 1)) * strength;
        const dy = (Hh(x - 1, y - 1) + 2 * Hh(x, y - 1) + Hh(x + 1, y - 1) - Hh(x - 1, y + 1) - 2 * Hh(x, y + 1) - Hh(x + 1, y + 1)) * strength;
        const l = Math.hypot(dx, dy, 1);
        const o = (y * W + x) * 4;
        img.data[o] = (dx / l * 0.5 + 0.5) * 255;
        img.data[o + 1] = (-dy / l * 0.5 + 0.5) * 255;
        img.data[o + 2] = (1 / l) * 255;
        img.data[o + 3] = 255;
      }
    ng.putImageData(img, 0, 0);
    const tex = (c: HTMLCanvasElement, srgb: boolean) => {
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      return t;
    };
    return {
      map: tex(this.canv[0], true),
      normalMap: tex(nc, false),
      roughnessMap: tex(this.canv[2], false),
      emissiveMap: tex(this.canv[3], true),
      bays, floors,
    };
  }
}

const B = 4; // travées par texture
const F = 4; // étages par texture

// ---------------------------------------------------------------- Paris
export function haussmann(seed: number): FacadeSet {
  const rng = new Rng(seed);
  const S = 512, cw = S / B, ch = S / F;
  const p = new Painter(S, S);
  const tones = ['#ddd0b6', '#e3d7bf', '#d6c7a8', '#e8dcc4'];
  const base = rng.pick(tones);
  p.rect(0, 0, S, S, { c: base, h: 0.55, r: 0.85 });
  p.noise(0.05, 1, rng);
  // joints de pierre de taille
  for (let y = 0; y < S; y += 16) {
    p.rect(0, y, S, 1, { c: 'rgba(120,105,85,0.35)', h: 0.45 });
    const off = (y / 16) % 2 ? 0 : 24;
    for (let x = off; x < S; x += 48) p.rect(x, y, 1, 16, { c: 'rgba(120,105,85,0.25)', h: 0.47 });
  }
  const balconyFloor = rng.int(0, 3);
  for (let f = 0; f < F; f++) {
    const y0 = f * ch;
    // corniche entre étages
    p.rect(0, y0 + ch - 8, S, 8, { c: '#efe6d2', h: 0.8, r: 0.8 });
    p.rect(0, y0 + ch - 9, S, 1, { c: 'rgba(60,50,40,0.5)' });
    for (let b = 0; b < B; b++) {
      const x0 = b * cw;
      const ww = cw * 0.46, wh = ch * 0.64;
      const wx = x0 + (cw - ww) / 2, wy = y0 + ch * 0.12;
      // encadrement mouluré
      p.rect(wx - 6, wy - 8, ww + 12, wh + 10, { c: '#efe5cf', h: 0.72 });
      p.rect(wx - 10, wy - 16, ww + 20, 8, { c: '#f2ead8', h: 0.85 }); // linteau
      // fenêtre (deux battants)
      p.rect(wx, wy, ww, wh, { c: '#f4f1ea', h: 0.4, r: 0.5 });
      p.glass(wx + 3, wy + 3, ww / 2 - 4, wh - 6, rng, rng.chance(0.3));
      p.glass(wx + ww / 2 + 1, wy + 3, ww / 2 - 4, wh - 6, rng, false);
      for (let k = 1; k < 3; k++) p.rect(wx, wy + (wh * k) / 3, ww, 2, { c: '#f4f1ea', h: 0.42 });
      // balcon en fer forgé
      const full = f === balconyFloor;
      const bx = full ? x0 : wx - 4, bw = full ? cw : ww + 8;
      const by = wy + wh - 26;
      p.rect(bx, by, bw, 2, { c: '#1a1a1a', h: 0.9, r: 0.4 });
      p.rect(bx, by + 24, bw, 4, { c: '#1a1a1a', h: 0.9, r: 0.4 });
      for (let x = bx; x < bx + bw; x += 5) p.rect(x, by, 1.5, 26, { c: '#161616', h: 0.88, r: 0.4 });
      for (let x = bx + 8; x < bx + bw - 8; x += 16) {
        p.alb.strokeStyle = '#161616';
        p.alb.lineWidth = 1.5;
        p.alb.beginPath();
        p.alb.arc(x + 4, by + 12, 5, 0, Math.PI * 2);
        p.alb.stroke();
      }
    }
  }
  p.grime(0.08, rng);
  return p.finish(B, F);
}

const PARIS_SHOPS: [string, string, string][] = [
  ['BOULANGERIE', '#2e5a3a', '#f3e3b0'], ['CAFÉ DE LA CAPY', '#8a1c24', '#f6e7c1'], ['FROMAGERIE', '#1f3d6b', '#f2e8cf'],
  ['PÂTISSERIE', '#d998a8', '#3a1a20'], ['LIBRAIRIE', '#3b2a1c', '#e8d5a8'], ['FLEURISTE', '#41643a', '#fbefcf'],
  ['BISTROT', '#5b1a1a', '#f0d890'], ['CRÊPERIE', '#244a64', '#ffe9b0'],
];
export const LONDON_SHOPS: [string, string, string][] = [
  ['THE CAPY ARMS', '#1d3b2a', '#e7c768'], ['TEA ROOM', '#6b1f2b', '#f3e2c2'], ['FISH & CHIPS', '#123b6b', '#ffffff'],
  ['BOOKS', '#2b2b2b', '#e7c768'], ['BAKERY', '#7a3b12', '#f6e7c1'], ['TOYS', '#a0122a', '#ffe9b0'],
];
const NY_SHOPS: [string, string, string][] = [
  ['DELI', '#202020', '#ffd24a'], ['PIZZA', '#9b1c1c', '#ffffff'], ['BAGELS', '#1b3f7a', '#ffe9b0'],
  ['DINER', '#c0c7cf', '#b3122a'], ['DRUGSTORE', '#1d5a3a', '#ffffff'], ['COFFEE', '#4a2c1a', '#f0d890'],
];

/** Rez-de-chaussée commerçant : 4 travées, 1 étage. */
export function shopfront(seed: number, style: 'paris' | 'london' | 'ny'): FacadeSet {
  const rng = new Rng(seed);
  const W = 512, H = 192, cw = W / B;
  const p = new Painter(W, H);
  const list = style === 'paris' ? PARIS_SHOPS : style === 'london' ? LONDON_SHOPS : NY_SHOPS;
  const wall = style === 'paris' ? '#d9ccb2' : style === 'london' ? '#cfc6b8' : '#8b8580';
  p.rect(0, 0, W, H, { c: wall, h: 0.55, r: 0.85 });
  if (style === 'london' && IMG.brick_diff) {
    p.drawImage(IMG.brick_diff, '#c8a090', 0.6, 0.25);
    p.heightFromImage(IMG.brick_nor, 0.25, 0.4);
  }
  p.noise(0.05, 1, rng);
  for (let pair = 0; pair < 2; pair++) {
    const [name, col, txt] = rng.pick(list);
    const x0 = pair * cw * 2;
    const w = cw * 2;
    // devanture peinte
    p.rect(x0 + 6, 18, w - 12, H - 18, { c: col, h: 0.68, r: 0.35 });
    // enseigne
    p.rect(x0 + 10, 22, w - 20, 34, { c: col, h: 0.75, r: 0.3 });
    p.rect(x0 + 10, 56, w - 20, 3, { c: '#c9a85a', h: 0.85, r: 0.25 });
    p.text(name, x0 + w / 2, 40, name.length > 11 ? 19 : 24, txt, 'bold', '#ffcf7a');
    // vitrines
    const gw = (w - 40) / 2;
    p.glass(x0 + 14, 66, gw, H - 82, rng, true, [30, 38, 44]);
    p.glass(x0 + 26 + gw, 66, gw, H - 82, rng, true, [30, 38, 44]);
    // petits bois de vitrine
    for (let k = 1; k < 3; k++) {
      p.rect(x0 + 14 + (gw * k) / 3, 66, 2, H - 82, { c: col, h: 0.7 });
      p.rect(x0 + 26 + gw + (gw * k) / 3, 66, 2, H - 82, { c: col, h: 0.7 });
    }
    p.rect(x0 + 6, H - 14, w - 12, 14, { c: '#3a3530', h: 0.7, r: 0.6 });
  }
  return p.finish(B, 1, 2);
}

// ---------------------------------------------------------------- New York
export function nyGlass(seed: number): FacadeSet {
  const rng = new Rng(seed);
  const S = 512, cw = S / B, ch = S / F;
  const p = new Painter(S, S);
  const tints = [[38, 62, 80], [30, 48, 58], [52, 70, 72], [44, 52, 70], [70, 74, 68]];
  const tint = rng.pick(tints);
  const frame = rng.pick(['#9aa3ab', '#2b2f33', '#c4c9cc', '#54595e']);
  p.rect(0, 0, S, S, { c: frame, h: 0.6, r: 0.35 });
  for (let f = 0; f < F; f++)
    for (let b = 0; b < B; b++) {
      const x0 = b * cw, y0 = f * ch;
      p.glass(x0 + 3, y0 + 3, cw - 6, ch * 0.72, rng, rng.chance(0.4), tint);
      // allège
      p.rect(x0 + 3, y0 + ch * 0.72 + 6, cw - 6, ch * 0.28 - 9, { c: `rgb(${tint[0] - 10},${tint[1] - 10},${tint[2] - 8})`, h: 0.5, r: 0.15 });
      p.rect(x0 + cw / 2 - 1, y0, 2, ch * 0.75, { c: frame, h: 0.62 });
    }
  return p.finish(B, F, 2);
}

export function nyBrick(seed: number): FacadeSet {
  const rng = new Rng(seed);
  const S = 512, cw = S / B, ch = S / F;
  const p = new Painter(S, S);
  const tint = rng.pick(['#b07a62', '#9a6a5a', '#c49a80', '#8a5e4e', '#b8a28a']);
  if (IMG.brick_diff) {
    p.drawImage(IMG.brick_diff, tint, 1, 0.3);
    p.heightFromImage(IMG.brick_nor, 0.3, 0.5);
  } else p.rect(0, 0, S, S, { c: tint });
  p.rect(0, 0, 0, 0, { r: 0.9 });
  p.rgh.fillStyle = 'rgb(0,225,0)'; p.rgh.fillRect(0, 0, S, S);
  for (let f = 0; f < F; f++)
    for (let b = 0; b < B; b++) {
      const x0 = b * cw, y0 = f * ch;
      const ww = cw * 0.5, wh = ch * 0.6;
      const wx = x0 + (cw - ww) / 2, wy = y0 + ch * 0.2;
      p.rect(wx - 5, wy - 10, ww + 10, 8, { c: '#d8d0c0', h: 0.8 }); // linteau
      p.rect(wx - 4, wy + wh, ww + 8, 6, { c: '#d8d0c0', h: 0.8 }); // appui
      p.rect(wx, wy, ww, wh, { c: '#e8e4dc', h: 0.35, r: 0.5 });
      p.glass(wx + 4, wy + 4, ww - 8, wh / 2 - 6, rng, rng.chance(0.35));
      p.glass(wx + 4, wy + wh / 2 + 2, ww - 8, wh / 2 - 6, rng, false);
    }
  // escalier de secours (fer noir)
  if (rng.chance(0.6)) {
    for (let f = 0; f < F; f++) {
      const y = f * ch + ch * 0.82;
      p.rect(cw * 0.6, y, cw * 1.8, 4, { c: '#1a1a1a', h: 0.95, r: 0.5 });
      for (let x = cw * 0.6; x < cw * 2.4; x += 6) p.rect(x, y - 18, 1.5, 18, { c: '#1a1a1a', h: 0.9 });
      p.rect(cw * 0.6, y - 18, cw * 1.8, 2, { c: '#1a1a1a', h: 0.9 });
    }
  }
  p.grime(0.1, rng);
  return p.finish(B, F);
}

export function nyDeco(seed: number): FacadeSet {
  const rng = new Rng(seed);
  const S = 512, cw = S / B, ch = S / F;
  const p = new Painter(S, S);
  p.rect(0, 0, S, S, { c: '#cfc3ad', h: 0.6, r: 0.8 });
  p.noise(0.06, 1, rng);
  for (let b = 0; b < B; b++) {
    const x0 = b * cw;
    p.rect(x0, 0, cw * 0.22, S, { c: '#ddd2bd', h: 0.85 }); // pilastres verticaux
    for (let f = 0; f < F; f++) {
      const y0 = f * ch;
      p.glass(x0 + cw * 0.3, y0 + 10, cw * 0.6, ch * 0.7, rng, rng.chance(0.4), [36, 40, 46]);
      p.rect(x0 + cw * 0.3, y0 + ch * 0.8 + 4, cw * 0.6, ch * 0.18, { c: '#6f6658', h: 0.45 }); // allège sombre
    }
  }
  p.grime(0.06, rng);
  return p.finish(B, F);
}

// ---------------------------------------------------------------- Londres
export function londonBrick(seed: number): FacadeSet {
  const rng = new Rng(seed);
  const S = 512, cw = S / B, ch = S / F;
  const p = new Painter(S, S);
  const tint = rng.pick(['#c9a27c', '#b78466', '#d8b88e', '#a86a52']);
  if (IMG.brick_diff) {
    p.drawImage(IMG.brick_diff, tint, 1, 0.3);
    p.heightFromImage(IMG.brick_nor, 0.3, 0.5);
  } else p.rect(0, 0, S, S, { c: tint });
  p.rgh.fillStyle = 'rgb(0,225,0)'; p.rgh.fillRect(0, 0, S, S);
  for (let f = 0; f < F; f++) {
    p.rect(0, f * ch + ch - 6, S, 6, { c: '#e9e3d6', h: 0.8, r: 0.8 }); // bandeau de pierre
    for (let b = 0; b < B; b++) {
      const x0 = b * cw, y0 = f * ch;
      const ww = cw * 0.44, wh = ch * 0.62;
      const wx = x0 + (cw - ww) / 2, wy = y0 + ch * 0.16;
      p.rect(wx - 6, wy - 9, ww + 12, 9, { c: '#efe9dd', h: 0.85 });
      p.rect(wx - 5, wy + wh, ww + 10, 7, { c: '#efe9dd', h: 0.85 });
      // fenêtre à guillotine, 6 carreaux
      p.rect(wx, wy, ww, wh, { c: '#f7f5f0', h: 0.4, r: 0.45 });
      const lit = rng.chance(0.35);
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 3; j++) {
          const gx = wx + 3 + (i * (ww - 6)) / 2, gy = wy + 3 + (j * (wh - 6)) / 3;
          p.glass(gx + 1, gy + 1, (ww - 6) / 2 - 2, (wh - 6) / 3 - 2, rng, lit);
        }
    }
  }
  p.grime(0.09, rng);
  return p.finish(B, F);
}

export function gothic(seed: number): FacadeSet {
  const rng = new Rng(seed);
  const S = 512, cw = S / B, ch = S / F;
  const p = new Painter(S, S);
  p.rect(0, 0, S, S, { c: '#c9b48a', h: 0.6, r: 0.85 });
  p.noise(0.08, 1, rng);
  for (let b = 0; b < B * 2; b++) {
    const x0 = (b * cw) / 2;
    p.rect(x0, 0, 8, S, { c: '#d9c69c', h: 0.9 });
    for (let f = 0; f < F; f++) {
      const y0 = f * ch;
      const wx = x0 + 18, ww = cw / 2 - 28, wy = y0 + 18, wh = ch - 40;
      p.alb.fillStyle = '#3a3a3e';
      p.alb.beginPath();
      p.alb.moveTo(wx, wy + wh);
      p.alb.lineTo(wx, wy + ww / 2);
      p.alb.quadraticCurveTo(wx + ww / 2, wy - ww / 2, wx + ww, wy + ww / 2);
      p.alb.lineTo(wx + ww, wy + wh);
      p.alb.fill();
      p.rect(wx, wy + ww / 2, ww, wh - ww / 2, { h: 0.3, r: 0.15 });
      if (rng.chance(0.3)) p.rect(wx + 2, wy + ww / 2, ww - 4, wh - ww / 2, { e: '#ffcf8a' });
      p.rect(wx + ww / 2 - 1, wy, 2, wh, { c: '#c9b48a', h: 0.6 });
    }
  }
  return p.finish(B, F);
}

// ---------------------------------------------------------------- Japon
export function machiya(seed: number): FacadeSet {
  const rng = new Rng(seed);
  const S = 512, cw = S / B, ch = S / F;
  const p = new Painter(S, S);
  for (let f = 0; f < F; f++) {
    const y0 = f * ch;
    const upper = f % 2 === 0; // alterne : étage enduit / rez en bois
    if (upper) {
      p.rect(0, y0, S, ch, { c: '#efe8d8', h: 0.55, r: 0.9 });
      for (let b = 0; b <= B; b++) p.rect(b * cw - 4, y0, 8, ch, { c: '#3a2618', h: 0.75, r: 0.7 });
      p.rect(0, y0 + ch - 10, S, 10, { c: '#3a2618', h: 0.8 });
      for (let b = 0; b < B; b++) {
        // fenêtre mushiko (lattes)
        const wx = b * cw + cw * 0.22, ww = cw * 0.56;
        p.rect(wx, y0 + ch * 0.3, ww, ch * 0.35, { c: '#2a1c12', h: 0.4 });
        const lit = rng.chance(0.4);
        if (lit) p.rect(wx, y0 + ch * 0.3, ww, ch * 0.35, { e: '#ffc27a' });
        for (let x = wx + 3; x < wx + ww; x += 7) p.rect(x, y0 + ch * 0.3, 3, ch * 0.35, { c: '#4a3020', h: 0.7, e: '#000' });
      }
    } else {
      p.rect(0, y0, S, ch, { c: '#4a3020', h: 0.6, r: 0.75 });
      for (let x = 0; x < S; x += 6) p.rect(x, y0, 3, ch, { c: '#2e1d12', h: 0.75 }); // koshi
      for (let b = 0; b < B; b++) if (rng.chance(0.5)) p.rect(b * cw + 6, y0 + 10, cw - 12, ch - 20, { e: '#7a4a1a' });
    }
  }
  return p.finish(B, F);
}

export function tokyoModern(seed: number): FacadeSet {
  const rng = new Rng(seed);
  const S = 512, cw = S / B, ch = S / F;
  const p = new Painter(S, S);
  p.rect(0, 0, S, S, { c: rng.pick(['#bfc3c6', '#d9d6cf', '#9fa5aa', '#e5e1d8']), h: 0.55, r: 0.7 });
  // carrelage
  for (let y = 0; y < S; y += 8) p.rect(0, y, S, 1, { c: 'rgba(0,0,0,0.08)', h: 0.5 });
  for (let f = 0; f < F; f++)
    for (let b = 0; b < B; b++) {
      p.glass(b * cw + 8, f * ch + 14, cw - 16, ch * 0.55, rng, rng.chance(0.5), [44, 54, 64]);
      p.rect(b * cw + 4, f * ch + ch * 0.75, cw - 8, 4, { c: '#7d8388', h: 0.85 }); // garde-corps
    }
  // enseigne verticale néon
  const signs = ['カピバラ', 'ラーメン', 'すし', 'カフェ', 'ゲーム', 'おんせん'];
  const sx = rng.int(0, B - 1) * cw + cw * 0.35;
  const col = rng.pick(['#ff3b6b', '#3be8ff', '#ffd23b', '#9b5bff', '#3bff8a']);
  p.rect(sx, 20, cw * 0.3, S - 40, { c: '#141418', h: 0.95, r: 0.3 });
  const word = rng.pick(signs);
  for (let i = 0; i < word.length; i++)
    p.text(word[i], sx + cw * 0.15, 60 + i * ((S - 120) / Math.max(1, word.length - 1)), 30, col, 'bold', col, 'sans-serif');
  return p.finish(B, F, 2);
}

// ---------------------------------------------------------------- Désert, village
export function adobe(seed: number): FacadeSet {
  const rng = new Rng(seed);
  const S = 512, cw = S / B, ch = S / F;
  const p = new Painter(S, S);
  p.rect(0, 0, S, S, { c: rng.pick(['#d9b98a', '#e2c49a', '#cfa776', '#e8d2ac']), h: 0.55, r: 0.95 });
  if (IMG.sand_diff) p.drawImage(IMG.sand_diff, '#ffffff', 0.25, 0.4);
  p.noise(0.07, 2, rng);
  for (let f = 0; f < F; f++)
    for (let b = 0; b < B; b++) {
      if (rng.chance(0.3)) continue;
      const wx = b * cw + cw * 0.32, ww = cw * 0.36, wy = f * ch + ch * 0.3, wh = ch * 0.45;
      p.alb.fillStyle = '#3a2a1c';
      p.alb.beginPath();
      p.alb.moveTo(wx, wy + wh);
      p.alb.lineTo(wx, wy + ww / 2);
      p.alb.arc(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0);
      p.alb.lineTo(wx + ww, wy + wh);
      p.alb.fill();
      p.rect(wx, wy, ww, wh, { h: 0.3 });
      if (rng.chance(0.4)) p.rect(wx + 2, wy + ww / 2, ww - 4, wh - ww / 2, { e: '#ffb35a' });
    }
  return p.finish(B, F);
}

export function cottage(seed: number): FacadeSet {
  const rng = new Rng(seed);
  const S = 512, cw = S / B, ch = S / F;
  const p = new Painter(S, S);
  const wall = rng.pick(['#f4ead6', '#f6e1c8', '#e9f0e4', '#f7e6e0', '#fff4d6']);
  p.rect(0, 0, S, S, { c: wall, h: 0.55, r: 0.95 });
  p.noise(0.05, 2, rng);
  const wood = '#6b4428';
  for (let f = 0; f < F; f++) {
    const y0 = f * ch;
    p.rect(0, y0, S, 8, { c: wood, h: 0.8, r: 0.8 });
    for (let b = 0; b <= B; b++) p.rect(b * cw - 5, y0, 10, ch, { c: wood, h: 0.8 });
    for (let b = 0; b < B; b++) {
      const x0 = b * cw;
      if (rng.chance(0.5)) {
        p.alb.strokeStyle = wood; p.alb.lineWidth = 7;
        p.alb.beginPath(); p.alb.moveTo(x0, y0); p.alb.lineTo(x0 + cw, y0 + ch); p.alb.stroke();
        p.hgt.strokeStyle = '#d0d0d0'; p.hgt.lineWidth = 7;
        p.hgt.beginPath(); p.hgt.moveTo(x0, y0); p.hgt.lineTo(x0 + cw, y0 + ch); p.hgt.stroke();
      } else {
        const wx = x0 + cw * 0.28, ww = cw * 0.44, wy = y0 + ch * 0.25, wh = ch * 0.45;
        p.rect(wx - 14, wy, 12, wh, { c: '#3f7a5a', h: 0.75 }); // volets
        p.rect(wx + ww + 2, wy, 12, wh, { c: '#3f7a5a', h: 0.75 });
        p.rect(wx, wy, ww, wh, { c: '#fff', h: 0.4 });
        p.glass(wx + 3, wy + 3, ww - 6, wh - 6, rng, rng.chance(0.5));
        p.rect(wx + ww / 2 - 1, wy, 2, wh, { c: '#fff' });
        // jardinière fleurie
        p.rect(wx - 4, wy + wh, ww + 8, 10, { c: '#7a4a2a', h: 0.85 });
        for (let k = 0; k < 8; k++) p.rect(wx - 2 + k * (ww / 7), wy + wh - 6, 6, 6, { c: rng.pick(['#ff5f8f', '#ffd23b', '#ff8a3d', '#ffffff']), h: 0.9 });
      }
    }
  }
  return p.finish(B, F);
}

/** Textures de toit (zinc, ardoise, tuiles japonaises, tuiles rouges). */
export function roofTexture(kind: 'zinc' | 'slate' | 'kawara' | 'tiles' | 'tar'): FacadeSet {
  const rng = new Rng(kind.length * 31);
  const S = 256;
  const p = new Painter(S, S);
  const cols: Record<string, string> = { zinc: '#6c7580', slate: '#4a4f58', kawara: '#3e4247', tiles: '#a8553a', tar: '#4a4a4a' };
  p.rect(0, 0, S, S, { c: cols[kind], h: 0.5, r: kind === 'zinc' ? 0.45 : 0.8 });
  p.noise(0.08, 1, rng);
  if (kind === 'zinc') for (let x = 0; x < S; x += 16) p.rect(x, 0, 3, S, { c: '#8a939c', h: 0.9, r: 0.4 });
  if (kind === 'slate' || kind === 'tiles')
    for (let y = 0; y < S; y += 16) {
      p.rect(0, y, S, 2, { c: 'rgba(0,0,0,0.35)', h: 0.3 });
      for (let x = (y / 16) % 2 ? 0 : 12; x < S; x += 24) p.rect(x, y, 2, 16, { c: 'rgba(0,0,0,0.25)', h: 0.35 });
    }
  if (kind === 'kawara')
    for (let x = 0; x < S; x += 16) {
      p.rect(x, 0, 6, S, { c: '#55595f', h: 0.95, r: 0.5 });
      for (let y = 0; y < S; y += 32) p.rect(x - 2, y, 10, 3, { c: '#2b2e32', h: 0.2 });
    }
  return p.finish(1, 1, 2);
}

/** Pierre de taille nue (monuments). */
export function limestone(seed: number, tone = '#e2d6bd', block = 24): FacadeSet {
  const rng = new Rng(seed);
  const S = 512;
  const p = new Painter(S, S);
  p.rect(0, 0, S, S, { c: tone, h: 0.55, r: 0.85 });
  p.noise(0.06, 1.5, rng);
  for (let y = 0; y < S; y += block) {
    p.rect(0, y, S, 2, { c: 'rgba(110,95,75,0.35)', h: 0.4 });
    const off = (y / block) % 2 ? 0 : block;
    for (let x = off; x < S; x += block * 2) p.rect(x, y, 2, block, { c: 'rgba(110,95,75,0.3)', h: 0.42 });
  }
  p.grime(0.07, rng);
  return p.finish(1, 1, 2.5);
}

/** Petit panneau peint (enseignes, affiches lumineuses). */
export function signTexture(lines: string[], bg: string, fg: string, w = 512, h = 256, glow = true, family = 'Arial Black, Impact, sans-serif'): FacadeSet {
  const p = new Painter(w, h);
  p.rect(0, 0, w, h, { c: bg, h: 0.5, r: 0.3, e: glow ? bg : undefined });
  const size = Math.min(h / (lines.length + 0.6), (w / Math.max(...lines.map((l) => l.length))) * 1.5);
  lines.forEach((l, i) => p.text(l, w / 2, (h / (lines.length + 1)) * (i + 1), size, fg, 'bold', glow ? fg : undefined, family));
  return p.finish(1, 1, 1);
}
