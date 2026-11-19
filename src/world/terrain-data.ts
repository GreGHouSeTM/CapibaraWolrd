// Données du relief cuit hors ligne (spécialité Terrain & relief) : tuiles de hauteur 16 bits, grille fine de
// Capyville et cartes dérivées, produites par tools/terrain/gen_terrain.py dans public/assets/terrain/.
// Chargement asynchrone avant le démarrage (loadTerrainData), puis lecture synchrone (heightmap.ts).
//
// Codage d'une grille : entiers 16 bits u (h = u × scale + offset), prédiction planaire (gauche + haut − diagonale),
// résidus modulo 2¹⁶, le tout compressé par zlib (DecompressionStream « deflate », natif du navigateur et de Node).

export interface GridMeta { x0: number; z0: number; cell: number; scale: number; offset: number; path: string }
export interface TerrainMeta {
  version: number;
  height: GridMeta & { n: number; tile: number; tiles: number };
  valley: GridMeta & { nx: number; nz: number };
  surface: { x0: number; z0: number; cell: number; n: number; path: string; channels: string[] };
  biome: { x0: number; z0: number; cell: number; n: number; path: string; channels: string[] };
  /** tracés denses des rivières (méandres compris) : niveau d'eau y et largeur w à chaque point */
  rivers: { id: string; pts: [number, number][]; y: number[]; w: number[] }[];
  /** voies de WAYS posées sur le relief : tracé lissé (tous les 8 m) et altitude de la plateforme */
  ways?: { id: string; kind: string; surface: string; width: number; vehicles: boolean; pts: [number, number][]; y: number[] }[];
  bytes: number;
}

/** Lit un fichier de public/assets/terrain/ (fetch dans le navigateur, fichier local dans les tests). */
export type TerrainReader = (path: string) => Promise<ArrayBuffer>;

export interface TerrainData {
  meta: TerrainMeta;
  /** hauteurs au pas de 2 m sur toute la grille cuite (n × n, ligne = z) */
  height: Float32Array;
  /** grille fine de Capyville (0,5 m) */
  valley: Float32Array;
  /** carte dérivée de 4 m : RGBA = écoulement, humidité, dépôts, roche */
  surface: Uint8Array;
  /** carte de 8 m : RGBA = sable, neige, sol sec, mousse */
  biome: Uint8Array;
}

export let terrainData: TerrainData | null = null;

const defaultReader: TerrainReader = async (path) => {
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './';
  const r = await fetch(`${base}assets/terrain/${path}`);
  if (!r.ok) throw new Error(`Relief introuvable : ${path} (${r.status})`);
  return r.arrayBuffer();
};

async function inflate(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([buf]).stream().pipeThrough(ds);
  return new Response(stream).arrayBuffer();
}

/** Décode une grille prédite (w × h) et l'écrit dans `out` à partir de (ox, oz), ligne de `stride` valeurs. */
function decodeInto(res: Uint16Array, w: number, h: number, scale: number, offset: number, out: Float32Array, stride: number, ox: number, oz: number) {
  const u = new Uint16Array(w * h);
  for (let j = 0; j < h; j++) {
    const o = j * w;
    for (let i = 0; i < w; i++) {
      let p: number;
      if (j === 0) p = i === 0 ? 0 : u[o + i - 1];
      else if (i === 0) p = u[o - w];
      else p = u[o + i - 1] + u[o - w + i] - u[o - w + i - 1];
      u[o + i] = (p + res[o + i]) & 0xffff;
    }
  }
  for (let j = 0; j < h; j++) {
    const row = (oz + j) * stride + ox;
    for (let i = 0; i < w; i++) out[row + i] = u[j * w + i] * scale + offset;
  }
}

/**
 * Charge tout le relief (≈ 25 Mo compressés). Les tuiles proches de `near` sont demandées en premier.
 * `onProgress(p)` reçoit la part chargée (0..1).
 */
export async function loadTerrainData(read: TerrainReader = defaultReader, onProgress?: (p: number) => void, near: [number, number] = [0, 0]) {
  if (terrainData) return terrainData;
  const meta = JSON.parse(new TextDecoder().decode(await read('meta.json'))) as TerrainMeta;
  const H = meta.height;
  const height = new Float32Array(H.n * H.n);
  const jobs: { tx: number; tz: number; d: number }[] = [];
  const span = H.tile * H.cell;
  for (let tz = 0; tz < H.tiles; tz++)
    for (let tx = 0; tx < H.tiles; tx++) {
      const cx = H.x0 + (tx + 0.5) * span, cz = H.z0 + (tz + 0.5) * span;
      jobs.push({ tx, tz, d: Math.hypot(cx - near[0], cz - near[1]) });
    }
  jobs.sort((a, b) => a.d - b.d);
  const total = jobs.length + 3;
  let done = 0;
  const tick = () => onProgress?.(++done / total);
  const V = meta.valley;
  const valley = new Float32Array(V.nx * V.nz);
  const loadTile = async (j: { tx: number; tz: number }) => {
    const raw = await inflate(await read(H.path.replace('{x}', String(j.tx)).replace('{z}', String(j.tz))));
    decodeInto(new Uint16Array(raw), H.tile, H.tile, H.scale, H.offset, height, H.n, j.tx * H.tile, j.tz * H.tile);
    tick();
  };
  // six requêtes à la fois
  let next = 0;
  const worker = async () => { while (next < jobs.length) await loadTile(jobs[next++]); };
  const [, , surfBuf, bioBuf, valBuf] = await Promise.all([
    Promise.all(Array.from({ length: 6 }, worker)),
    Promise.resolve(),
    read(meta.surface.path).then(inflate),
    read(meta.biome.path).then(inflate),
    read(V.path).then(inflate),
  ]);
  decodeInto(new Uint16Array(valBuf), V.nx, V.nz, V.scale, V.offset, valley, V.nx, 0, 0);
  tick(); tick(); tick();
  terrainData = { meta, height, valley, surface: new Uint8Array(surfBuf), biome: new Uint8Array(bioBuf) };
  return terrainData;
}
