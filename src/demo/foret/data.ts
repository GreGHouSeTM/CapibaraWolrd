// Données de la zone « forêt » (preuve next-gen) : plan (scene.json), relief (terrain.bin) et masques du sol (masks.png),
// produits hors ligne par tools/foret/terrain.py. Chargés seulement avec ?demo=foret.

export interface Step { flight: number; i: number; x: number; z: number; y: number; run: number; rise: number; width: number; yaw: number }
export interface SceneData {
  terrain: {
    x0: number; z0: number; cell: number; nx: number; nz: number; min: number; max: number;
    ring: { x0: number; z0: number; cell: number; n: number };
    masks: { x0: number; z0: number; cell: number; nx: number; nz: number };
  };
  path: [number, number, number, number, number][];
  steps: Step[];
  wallFoot: [number, number, number, number][];
  clearing: { x: number; z: number; r: number; y: number };
  puddle: { x: number; z: number; rx: number; rz: number; rot: number; depth: number };
  lantern: { x: number; z: number; h: number };
  spawn: { x: number; z: number; yaw: number };
  [k: string]: unknown;
}

export const BASE = () => import.meta.env.BASE_URL + 'assets/foret/';

export class ForetData {
  scene!: SceneData;
  heights!: Float32Array;
  ring!: Float32Array;
  masks!: ImageData;

  async load(progress: (p: number) => void) {
    const base = BASE();
    const [scene, bin, img] = await Promise.all([
      fetch(base + 'scene.json').then((r) => r.json()),
      fetch(base + 'terrain.bin').then((r) => r.arrayBuffer()),
      loadImageData(base + 'masks.png'),
    ]);
    progress(1);
    this.scene = scene;
    const t = scene.terrain;
    this.heights = new Float32Array(bin, 0, t.nx * t.nz);
    this.ring = new Float32Array(bin, t.nx * t.nz * 4, t.ring.n * t.ring.n);
    this.masks = img;
  }

  /** Hauteur du sol nu (relief seul, sans les marches) : zone fine bilinéaire, anneau lointain au-delà. */
  height = (x: number, z: number): number => {
    const t = this.scene.terrain;
    const fx = (x - t.x0) / t.cell, fz = (z - t.z0) / t.cell;
    if (fx >= 0 && fz >= 0 && fx <= t.nx - 1 && fz <= t.nz - 1) return bilerp(this.heights, t.nx, t.nz, fx, fz);
    const r = t.ring;
    return bilerp(this.ring, r.n, r.n, (x - r.x0) / r.cell, (z - r.z0) / r.cell);
  };

  /** Masques du sol en (x, z) : [sentier, mousse, humidité, (inutilisé)] (0..1). */
  mask(x: number, z: number, out: number[] = [0, 0, 0, 0]) {
    const m = this.scene.terrain.masks;
    const i = Math.min(m.nx - 1, Math.max(0, Math.floor((x - m.x0) / m.cell)));
    const j = Math.min(m.nz - 1, Math.max(0, Math.floor((z - m.z0) / m.cell)));
    const o = (j * m.nx + i) * 4, d = this.masks.data;
    out[0] = d[o] / 255; out[1] = d[o + 1] / 255; out[2] = d[o + 2] / 255; out[3] = d[o + 3] / 255;
    return out;
  }

  inZone(x: number, z: number, margin = 0) {
    const t = this.scene.terrain;
    return x > t.x0 + margin && z > t.z0 + margin && x < t.x0 + (t.nx - 1) * t.cell - margin && z < t.z0 + (t.nz - 1) * t.cell - margin;
  }
}

function bilerp(h: Float32Array, nx: number, nz: number, fx: number, fz: number) {
  fx = Math.min(nx - 1.0001, Math.max(0, fx));
  fz = Math.min(nz - 1.0001, Math.max(0, fz));
  const i = Math.floor(fx), j = Math.floor(fz);
  const tx = fx - i, tz = fz - j;
  const o = j * nx + i;
  const a = h[o] + (h[o + 1] - h[o]) * tx;
  const b = h[o + nx] + (h[o + nx + 1] - h[o + nx]) * tx;
  return a + (b - a) * tz;
}

export async function loadImageData(url: string): Promise<ImageData> {
  const blob = await fetch(url).then((r) => {
    if (!r.ok) throw new Error('Image introuvable : ' + url);
    return r.blob();
  });
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return ctx.getImageData(0, 0, c.width, c.height, { colorSpace: 'srgb' });
}
