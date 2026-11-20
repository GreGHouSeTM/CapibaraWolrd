// Chargement des textures et des modèles de la zone « forêt » (cache, anisotropie, espaces de couleur).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { BASE } from './data';

const loader = new THREE.TextureLoader();
const cache = new Map<string, Promise<THREE.Texture>>();
let aniso = 8;
export function setAniso(a: number) { aniso = a; }

/** Texture du dossier assets/foret (`srgb` pour les couleurs ; `flipY` faux pour les cuissons Blender et glTF). */
export function tex(path: string, srgb: boolean, opts: { flipY?: boolean; repeat?: boolean; mip?: boolean } = {}): Promise<THREE.Texture> {
  const key = path + (srgb ? ':s' : ':l') + (opts.flipY === false ? ':f' : '');
  let p = cache.get(key);
  if (!p) {
    p = loader.loadAsync(BASE() + path).then((t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.flipY = opts.flipY ?? true;
      if (opts.repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      else t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.anisotropy = aniso;
      t.generateMipmaps = opts.mip !== false;
      t.minFilter = opts.mip !== false ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      t.needsUpdate = true;
      return t;
    });
    cache.set(key, p);
  }
  return p;
}

export interface TexSet { diff: THREE.Texture; nor: THREE.Texture; arh: THREE.Texture }
/** Jeu de textures d'une matière (tex/<nom>_diff|nor|arh.webp, voir tools/foret/textures.py). */
export async function texSet(name: string): Promise<TexSet> {
  const [diff, nor, arh] = await Promise.all([tex(`tex/${name}_diff.webp`, true), tex(`tex/${name}_nor.webp`, false), tex(`tex/${name}_arh.webp`, false)]);
  return { diff, nor, arh };
}

const gltf = new GLTFLoader();
gltf.setMeshoptDecoder(MeshoptDecoder);
export function glb(path: string) {
  return gltf.loadAsync(BASE() + path);
}
