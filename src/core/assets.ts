// Chargement des textures PBR (Poly Haven, licence CC0).
import * as THREE from 'three';

export type TexSet = { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture };
export const TEX: Record<string, TexSet> = {};
export const IMG: Record<string, HTMLImageElement> = {};

const NAMES = [
  'asphalt', 'cobble', 'sidewalk', 'brick', 'sand', 'snow', 'rock', 'grass',
  // village et nature (Poly Haven CC0)
  'planks', 'plaster', 'rooftiles', 'bark', 'pinebark', 'stonewall', 'forestfloor', 'dirtroad', 'gravel', 'mossrock', 'villagecobble', 'roughwood',
] as const;
export type TexName = (typeof NAMES)[number];

let maxAniso = 4;
export function setMaxAnisotropy(a: number) {
  maxAniso = a;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Image introuvable : ' + url));
    img.src = url;
  });
}

function toTex(img: HTMLImageElement, srgb: boolean) {
  const t = new THREE.Texture(img);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}

export async function loadAssets(onProgress: (p: number) => void) {
  const base = import.meta.env.BASE_URL + 'assets/tex/';
  const jobs: Promise<void>[] = [];
  let done = 0;
  const total = NAMES.length * 3;
  for (const n of NAMES) {
    for (const suf of ['diff', 'nor', 'rough'] as const) {
      jobs.push(
        loadImage(`${base}${n}_${suf}.jpg`).then((img) => {
          IMG[`${n}_${suf}`] = img;
          done++;
          onProgress(done / total);
        }),
      );
    }
  }
  await Promise.all(jobs);
  for (const n of NAMES) {
    TEX[n] = {
      map: toTex(IMG[`${n}_diff`], true),
      normalMap: toTex(IMG[`${n}_nor`], false),
      roughnessMap: toTex(IMG[`${n}_rough`], false),
    };
  }
}

/** Matériau PBR répété tous les `scale` mètres (UV en mètres). */
export function pbr(name: TexName, opts: THREE.MeshStandardMaterialParameters & { scale?: number; normalScale?: number } = {}) {
  const set = TEX[name];
  const s = 1 / (opts.scale ?? 4);
  const clone = (t: THREE.Texture) => {
    const c = t.clone();
    c.repeat.set(s, s);
    c.needsUpdate = true;
    return c;
  };
  const { scale, normalScale, ...rest } = opts;
  const m = new THREE.MeshStandardMaterial({
    map: clone(set.map),
    normalMap: clone(set.normalMap),
    roughnessMap: clone(set.roughnessMap),
    ...rest,
  });
  m.normalScale.setScalar(normalScale ?? 1);
  return m;
}
