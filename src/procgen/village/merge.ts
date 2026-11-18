// Intégration village : fusion des maillages glTF (bâtiments Blender) par matière.
//
// Les .glb sortent de gltfpack (KHR_mesh_quantization + KHR_texture_transform) : positions, normales, UV et couleurs
// sont des entiers normalisés, déquantifiés par la matrice du nœud (positions) et par la transformation de texture
// de chaque matière (UV), différente d'un fichier à l'autre. On « cuit » donc tout en Float32 dans le repère monde
// (matrice de pose × matrice du nœud) et les UV dans l'espace de la texture d'origine, ce qui permet de fusionner
// des pièces venues de fichiers différents dans un seul maillage par matière (une matière = un appel de dessin).
import * as THREE from 'three';
import { nightMaterials } from '../kit';

interface Part {
  geo: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  uvMatrix: THREE.Matrix3 | null;
}

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _uv = new THREE.Vector2();

/** Matières représentatives (une par nom), partagées par tous les maillages fusionnés du village. */
const sharedMats = new Map<string, THREE.Material>();

function resetTex(t: THREE.Texture | null) {
  if (!t) return null;
  const c = t.clone();
  c.offset.set(0, 0);
  c.repeat.set(1, 1);
  c.rotation = 0;
  c.center.set(0, 0);
  c.updateMatrix();
  c.needsUpdate = true;
  return c;
}

/** Matière fusionnable : couleurs de sommets, transformation de texture remise à zéro (UV déjà cuites), papier shōji nocturne. */
export function sharedMaterial(src: THREE.Material): THREE.Material {
  const name = src.name || src.uuid;
  let m = sharedMats.get(name);
  if (m) return m;
  const s = src as THREE.MeshStandardMaterial;
  const c = s.clone();
  c.name = name;
  c.vertexColors = true;
  for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const) {
    if (c[k]) (c as any)[k] = resetTex(c[k]);
  }
  if (s.userData?.night) {
    // shōji : papier translucide qui s'éclaire la nuit (kit.setNight pilote emissiveIntensity)
    c.emissive = new THREE.Color(0xffd29a);
    c.emissiveMap = c.map;
    c.emissiveIntensity = 0;
    c.userData.emissiveBoost = s.userData.emissiveBoost ?? 1;
    c.userData.baseEmissive = 0;
    nightMaterials.push(c);
  }
  sharedMats.set(name, c);
  m = c;
  return m;
}

/** Matrice UV de la matière glTF (déquantification gltfpack), ou null si la matière n'a pas de texture. */
function uvMatrixOf(mat: THREE.Material) {
  const s = mat as THREE.MeshStandardMaterial;
  const t = s.map ?? s.normalMap ?? s.roughnessMap ?? null;
  if (!t) return null;
  t.updateMatrix();
  return t.matrix.clone();
}

/** Accumule des pièces par clé (cellule, LOD, matière) puis produit un maillage fusionné par clé. */
export class MaterialMerger {
  private groups = new Map<string, { mat: THREE.Material; parts: Part[]; cast: boolean }>();

  add(key: string, srcMat: THREE.Material, geo: THREE.BufferGeometry, matrix: THREE.Matrix4, cast = true) {
    const mat = sharedMaterial(srcMat);
    const k = key + '|' + mat.name;
    let g = this.groups.get(k);
    if (!g) this.groups.set(k, (g = { mat, parts: [], cast }));
    g.parts.push({ geo, matrix: matrix.clone(), uvMatrix: uvMatrixOf(srcMat) });
  }

  /** Construit les maillages ; `onGroup(key, mesh)` reçoit la clé d'origine (sans le nom de matière). */
  build(onGroup: (key: string, mesh: THREE.Mesh) => void) {
    for (const [k, g] of this.groups) {
      const geo = mergeParts(g.parts);
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, g.mat);
      mesh.name = k;
      mesh.castShadow = g.cast;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      onGroup(k.slice(0, k.lastIndexOf('|')), mesh);
    }
    this.groups.clear();
  }
}

function mergeParts(parts: Part[]): THREE.BufferGeometry | null {
  let nv = 0, ni = 0;
  for (const p of parts) {
    const pos = p.geo.getAttribute('position');
    if (!pos) continue;
    nv += pos.count;
    ni += p.geo.index ? p.geo.index.count : pos.count;
  }
  if (!nv) return null;
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), C = new Float32Array(nv * 3);
  const I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const p of parts) {
    const pos = p.geo.getAttribute('position') as THREE.BufferAttribute;
    if (!pos) continue;
    const nor = p.geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
    const uv = p.geo.getAttribute('uv') as THREE.BufferAttribute | undefined;
    const col = p.geo.getAttribute('color') as THREE.BufferAttribute | undefined;
    _nm.getNormalMatrix(p.matrix);
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(p.matrix);
      P[(vo + i) * 3] = _v.x; P[(vo + i) * 3 + 1] = _v.y; P[(vo + i) * 3 + 2] = _v.z;
      if (nor) {
        _n.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize();
        N[(vo + i) * 3] = _n.x; N[(vo + i) * 3 + 1] = _n.y; N[(vo + i) * 3 + 2] = _n.z;
      } else N[(vo + i) * 3 + 1] = 1;
      if (uv) {
        _uv.fromBufferAttribute(uv, i);
        if (p.uvMatrix) _uv.applyMatrix3(p.uvMatrix);
        U[(vo + i) * 2] = _uv.x; U[(vo + i) * 2 + 1] = _uv.y;
      }
      if (col) {
        C[(vo + i) * 3] = col.getX(i); C[(vo + i) * 3 + 1] = col.getY(i); C[(vo + i) * 3 + 2] = col.getZ(i);
      } else {
        C[(vo + i) * 3] = 1; C[(vo + i) * 3 + 1] = 1; C[(vo + i) * 3 + 2] = 1;
      }
    }
    if (p.geo.index) {
      const idx = p.geo.index;
      for (let i = 0; i < idx.count; i++) I[io + i] = idx.getX(i) + vo;
      io += idx.count;
    } else {
      for (let i = 0; i < pos.count; i++) I[io + i] = vo + i;
      io += pos.count;
    }
    // un nœud en miroir (déterminant négatif) inverserait les faces
    if (p.matrix.determinant() < 0) {
      const s = io - (p.geo.index ? p.geo.index.count : pos.count);
      for (let i = s; i < io; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; }
    }
    vo += pos.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
