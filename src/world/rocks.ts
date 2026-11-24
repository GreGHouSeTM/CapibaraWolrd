// Rochers et affleurements (spécialité Terrain & relief) : barres litées, dalles, blocs fracturés, gendarmes d'arête,
// éboulis, roches moutonnées. Modèles sculptés et cuits dans Blender (tools/terrain/bl_rochers.py), placés hors ligne
// selon la géologie du relief (tools/terrain/rochers.py → public/assets/terrain/rochers.bin).
//
// Rendu : un InstancedMesh par (modèle, LOD) ; tous les ~4 m de déplacement de la caméra (ou en tournant), les rochers
// des cellules de 64 m visibles sont triés par distance : LOD0, LOD1, LOD2 ou caché, à des distances proportionnelles à
// leur taille (un gendarme de 9 m se voit à 3 km, un caillou de 40 cm à 250 m). Matériau : normales et occlusion cuites
// (cartes propres à chaque modèle), couleur en projection triplanaire (rock_face_03 Poly Haven, roche du terrain),
// bandes de strates, mousse sur les faces tournées vers le ciel et dans les creux humides, lichens sur les faces
// exposées, neige sur les replats, teinte par biome. Collisions : cercles ou boîtes pour les rochers de plus de 0,9 m.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { heightAt } from './heightmap';
import { addBox, addCircle } from './physics';
import { beforeRender } from '../procgen/village/lod';

interface RockModel { family: string; size: [number, number, number]; foot: [number, number]; tris: number[]; tex: number }
const BASE = (): string => (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './';

/** Teintes de la roche par biome : granite gris, calcaire clair, grès ocre, basalte, schiste verdâtre. */
const TINTS = [new THREE.Color(1.0, 1.0, 1.0), new THREE.Color(1.12, 1.08, 0.98), new THREE.Color(1.22, 0.92, 0.7),
  new THREE.Color(0.55, 0.53, 0.52), new THREE.Color(0.88, 0.96, 0.86)];

export interface Rocks {
  group: THREE.Group;
  count: number;
  /** nombre de rochers dessinés à la dernière mise à jour, par LOD */
  drawn: [number, number, number];
  dispose(): void;
}

async function inflate(buf: ArrayBuffer) {
  const ds = new DecompressionStream('deflate');
  return new Response(new Blob([buf]).stream().pipeThrough(ds)).arrayBuffer();
}

function tex(loader: THREE.TextureLoader, path: string, srgb: boolean, repeat = false) {
  return new Promise<THREE.Texture>((res) => {
    loader.load(BASE() + 'assets/terrain/rochers/' + path, (t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 4;
      if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.flipY = false;
      res(t);
    }, undefined, () => { console.warn('Texture de rocher introuvable : ' + path); res(new THREE.Texture()); });
  });
}

const shared: Record<string, THREE.IUniform> = {};

function rockMaterial(nor: THREE.Texture, mask: THREE.Texture, family: string, lod: number) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.86, metalness: 0, normalMap: lod < 2 ? nor : null });
  m.normalScale.set(1, -1); // cuisson Blender (OpenGL, +Y) ; glTF : V inversé
  const strata = family === 'barre' ? 1 : 0.35;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, shared, { uMask: { value: mask } });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aRock;
        varying vec4 vRock;
        varying vec3 vRWP;
        varying vec3 vRWN;
        varying vec2 vRUv;
        varying float vRY;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        {
          vec4 wp4 = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          vRWP = wp4.xyz;
          vRWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
          vRock = aRock;
          vRUv = uv;
          vRY = position.y;
        }`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uMask, uRAlb, uRAlb2, uLich, uMoss;
        uniform vec3 uTints[5];
        varying vec4 vRock;
        varying vec3 vRWP;
        varying vec3 vRWN;
        varying vec2 vRUv;
        varying float vRY;
        float rHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float rNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(rHash(i), rHash(i + vec2(1, 0)), u.x), mix(rHash(i + vec2(0, 1)), rHash(i + vec2(1, 1)), u.x), u.y);
        }
        float rNoise3(vec3 p) { return (rNoise(p.xz) + rNoise(p.xy + 17.3) + rNoise(p.zy - 9.1)) / 3.0; }
        vec3 triAlb(sampler2D t, vec3 p, vec3 w, float sc) {
          return texture2D(t, p.zy / sc).rgb * w.x + texture2D(t, p.xz / sc).rgb * w.y + texture2D(t, p.xy / sc).rgb * w.z;
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 rN = normalize(vRWN);
        vec3 tw = pow(abs(rN), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
        vec4 mk = texture2D(uMask, vRUv);
        float ao = mk.r, curv = mk.g, vari = mk.b;
        // roche : photoscan à 3,2 m et roche du terrain à 9 m (raccord au sol), teinte du biome
        vec3 a1 = triAlb(uRAlb, vRWP, tw, 3.2);
        vec3 a2 = triAlb(uRAlb2, vRWP, tw, 9.0);
        vec3 rc = mix(a2, a1, 0.55) * 1.05;
        // photoscan brun ramené vers un granite gris (la teinte du biome redonne la couleur locale)
        rc = mix(vec3(dot(rc, vec3(0.3, 0.55, 0.15))), rc, 0.35) * vec3(1.02, 1.0, 0.97);
        int ti = int(vRock.w * 255.0 + 0.5);
        vec3 tint = uTints[0];
        for (int i = 1; i < 5; i++) if (i == ti) tint = uTints[i];
        rc *= tint;
        // strates : bandes de couleur selon l'altitude (bancs plus ou moins oxydés), variation lente cuite
        float band = sin(vRWP.y * 1.7 + rNoise(vRWP.xz * 0.05) * 6.0) * 0.5 + 0.5;
        rc *= mix(1.0, 0.86 + 0.24 * band, ${strata.toFixed(2)});
        rc *= 0.82 + 0.36 * vari;
        // arêtes usées plus claires, creux plus sombres (courbure cuite)
        rc *= 0.8 + 0.45 * smoothstep(0.25, 0.85, curv);
        float up = rN.y;
        float n1 = rNoise3(vRWP * 0.45), n2 = rNoise3(vRWP * 2.1);
        // lichens : colonies rondes sur les faces exposées (gris-vert, quelques taches orangées)
        float lc = vRock.z * smoothstep(0.74, 0.86, rNoise3(vRWP * 2.6) * 0.75 + n2 * 0.25) * smoothstep(-0.5, 0.1, up) * smoothstep(0.45, 0.8, ao);
        vec3 lcol = texture2D(uLich, vRWP.xz / 2.3 + vRWP.y * 0.3).rgb;
        lcol = mix(lcol * vec3(1.05, 1.1, 0.85), vec3(0.78, 0.5, 0.2), step(0.82, rNoise3(vRWP * 3.7)) * 0.7);
        rc = mix(rc, lcol, lc * 0.6);
        // mousse : faces tournées vers le ciel, creux ombragés et humides
        float mw = vRock.x * (1.0 - vRock.y) * smoothstep(0.45, 0.85, up + 0.3 * (n2 - 0.5) + 0.25 * (1.0 - ao));
        mw = max(mw, vRock.x * (1.0 - vRock.y) * 0.6 * smoothstep(0.55, 0.25, ao) * smoothstep(0.4, 0.6, n1));
        vec3 mcol = triAlb(uMoss, vRWP, tw, 1.3) * vec3(0.85, 1.0, 0.75);
        rc = mix(rc, mcol, clamp(mw, 0.0, 1.0));
        // neige sur les replats et les corniches
        float sw = vRock.y * smoothstep(0.62, 0.86, up + 0.1 * (rNoise3(vRWP * 6.0) - 0.5) + 0.12 * (ao - 0.7));
        rc = mix(rc, vec3(0.93, 0.95, 1.0), sw);
        // pied du rocher : un peu plus sombre et terreux (contact avec le sol)
        rc *= mix(0.78, 1.0, smoothstep(0.0, 0.6, vRY));
        diffuseColor.rgb = rc * mix(0.55, 1.0, ao);
        float rRough = mix(0.86, 0.97, mw);
        rRough = mix(rRough, 0.55, sw);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = rRough;')
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= mix(0.45, 1.0, ao);`);
  };
  m.customProgramCacheKey = () => 'rocher-' + family + '-' + lod;
  return m;
}

/** Charge les modèles et les rochers placés, crée les instances, les collisions et la mise à jour par cellules. */
export async function buildRocks(scene: THREE.Scene, opts: { distance: number; density: number; shadows: boolean }): Promise<Rocks> {
  const group = new THREE.Group();
  group.name = 'rochers';
  const base = BASE() + 'assets/terrain/';
  const [models, raw] = await Promise.all([
    fetch(base + 'rochers/rochers.json').then((r) => r.json() as Promise<Record<string, RockModel>>),
    fetch(base + 'rochers.bin').then((r) => r.arrayBuffer()).then(inflate),
  ]);
  const ids = Object.keys(models).sort();
  const n = new DataView(raw).getUint32(4, true);
  const F = new Float32Array(raw, 8, n * 8);
  const U = new Uint8Array(raw, 8 + n * 32, n * 4);
  const tl = new THREE.TextureLoader();
  const [alb, alb2, lich, moss] = await Promise.all([
    tex(tl, 'roche_diff.webp', true, true),
    new Promise<THREE.Texture>((res) => tl.load(BASE() + 'assets/tex/rock_diff.jpg', (t) => { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; res(t); }, undefined, () => res(new THREE.Texture()))),
    tex(tl, 'lichen_diff.webp', true, true),
    tex(tl, 'mousse_diff.webp', true, true),
  ]);
  for (const t of [alb, lich, moss]) t.flipY = true;
  Object.assign(shared, { uRAlb: { value: alb }, uRAlb2: { value: alb2 }, uLich: { value: lich }, uMoss: { value: moss }, uTints: { value: TINTS } });
  const gl = new GLTFLoader();
  gl.setMeshoptDecoder(MeshoptDecoder);
  // ---------------------------------------------------------------- instances
  const dens = opts.density;
  const cnt = new Int32Array(ids.length);
  const keep = new Uint8Array(n);
  const sizeOf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const md = models[ids[F[i * 8 + 7]]];
    const s = F[i * 8 + 3];
    const sz = Math.max(md.size[0], md.size[1], md.size[2]) * s;
    sizeOf[i] = sz;
    // densité réduite (qualité basse) : on garde tous les grands rochers, une partie des petits
    if (dens < 1 && sz < 2.5 && ((i * 2654435761) >>> 0) / 4294967296 > dens) continue;
    keep[i] = 1;
    cnt[F[i * 8 + 7]]++;
  }
  const mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), p = new THREE.Vector3(), sv = new THREE.Vector3();
  const M = new Float32Array(n * 16);
  const At = new Float32Array(n * 4);
  const CELL = 64;
  const cells = new Map<number, { cx: number; cz: number; y: number; r: number; far: number; items: number[] }>();
  let ncol = 0;
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue;
    const o = i * 8;
    const x = F[o], z = F[o + 1], s = F[o + 3], yaw = F[o + 4], pitch = F[o + 5], roll = F[o + 6], mid = F[o + 7];
    const md = models[ids[mid]];
    const y = heightAt(x, z) + F[o + 2];
    e.set(pitch, yaw, roll);
    q.setFromEuler(e);
    mat4.compose(p.set(x, y, z), q, sv.set(s, s, s));
    M.set(mat4.elements, i * 16);
    At.set([U[i * 4] / 255, U[i * 4 + 1] / 255, U[i * 4 + 2] / 255, U[i * 4 + 3] / 255], i * 4);
    // collisions : rochers de plus de 0,9 m (boîte orientée pour les barres et dalles allongées)
    const fx = md.foot[0] * s, fz = md.foot[1] * s, top = y + md.size[1] * s * 0.92;
    if (sizeOf[i] > 0.9 && top > heightAt(x, z) + 0.45) {
      if (Math.max(fx, fz) > 1.6 * Math.min(fx, fz)) addBox(x, z, 2 * fx * 0.88, 2 * fz * 0.88, y - 1, top, -yaw, false, 'rocher');
      else addCircle(x, z, Math.max(fx, fz) * 0.8, y - 1, top, false, 'rocher');
      ncol++;
    }
    const k = Math.floor(x / CELL) * 1000 + Math.floor(z / CELL);
    let c = cells.get(k);
    if (!c) cells.set(k, (c = { cx: (Math.floor(x / CELL) + 0.5) * CELL, cz: (Math.floor(z / CELL) + 0.5) * CELL, y: 0, r: CELL * 0.75, far: 0, items: [] }));
    c.items.push(i);
    c.y += y;
    c.r = Math.max(c.r, CELL * 0.71 + sizeOf[i]);
  }
  const dist = (sz: number) => [Math.min(26 + 10 * sz, 220), Math.min(80 + 32 * sz, 650), Math.min(140 + 300 * sz, 3600) * opts.distance];
  const cellList = [...cells.values()];
  for (const c of cellList) {
    c.y /= c.items.length;
    for (const i of c.items) c.far = Math.max(c.far, dist(sizeOf[i])[2]);
  }
  // ---------------------------------------------------------------- maillages par (modèle, LOD)
  const meshes: THREE.InstancedMesh[][] = [];
  await Promise.all(ids.map(async (id, mi) => {
    const md = models[id];
    const [g, nor, mask] = await Promise.all([gl.loadAsync(base + 'rochers/' + id + '.glb'), tex(tl, id + '_nor.webp', false), tex(tl, id + '_mask.webp', false)]);
    const lods: THREE.InstancedMesh[] = [];
    // gltfpack renomme les nœuds et quantifie les sommets (échelle de déquantification sur le nœud) : on prend les
    // trois maillages par nombre de triangles décroissant et on cuit leur transformation en flottants
    g.scene.updateMatrixWorld(true);
    const geos: THREE.BufferGeometry[] = [];
    g.scene.traverse((o) => {
      const me = o as THREE.Mesh;
      if (!me.isMesh) return;
      const src = me.geometry;
      const out = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv', 'tangent']) {
        const a = src.getAttribute(name);
        if (!a) continue;
        const f = new Float32Array(a.count * a.itemSize);
        for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a.getComponent(i, c);
        out.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
      }
      if (src.index) out.setIndex(src.index.clone());
      out.applyMatrix4(me.matrixWorld);
      // la tangente garde son signe (w) ; applyMatrix4 ne la transforme pas : on la tourne à part
      const t = out.getAttribute('tangent') as THREE.BufferAttribute | undefined;
      if (t) {
        const nm = new THREE.Matrix3().setFromMatrix4(me.matrixWorld);
        const v = new THREE.Vector3();
        for (let i = 0; i < t.count; i++) { v.set(t.getX(i), t.getY(i), t.getZ(i)).applyMatrix3(nm).normalize(); t.setXYZ(i, v.x, v.y, v.z); }
      }
      out.computeBoundingSphere();
      geos.push(out);
    });
    const tri = (gg: THREE.BufferGeometry) => (gg.index ? gg.index.count : gg.getAttribute('position').count);
    geos.sort((a, b) => tri(b) - tri(a));
    for (let l = 0; l < 3; l++) {
      const geom = geos[Math.min(l, geos.length - 1)];
      const im = new THREE.InstancedMesh(geom, rockMaterial(nor, mask, md.family, l), Math.max(1, cnt[mi]));
      const ia = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, cnt[mi]) * 4), 4);
      ia.setUsage(THREE.DynamicDrawUsage);
      geom.setAttribute('aRock', ia);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = opts.shadows && l < 2 && md.family !== 'eboulis';
      im.receiveShadow = true;
      im.name = `rocher-${id}-lod${l}`;
      group.add(im);
      lods.push(im);
    }
    meshes[mi] = lods;
  }));
  scene.add(group);
  // ---------------------------------------------------------------- mise à jour par cellules
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere();
  const last = new THREE.Vector3(1e9, 0, 0), lastDir = new THREE.Vector3(), cam = new THREE.Vector3(), dir = new THREE.Vector3();
  const drawn: [number, number, number] = [0, 0, 0];
  const update = (camera: THREE.Camera) => {
    cam.setFromMatrixPosition(camera.matrixWorld);
    camera.getWorldDirection(dir);
    if (cam.distanceToSquared(last) < 16 && dir.dot(lastDir) > 0.995) return;
    last.copy(cam);
    lastDir.copy(dir);
    pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pm);
    for (const lods of meshes) for (const im of lods) im.count = 0;
    drawn[0] = drawn[1] = drawn[2] = 0;
    for (const c of cellList) {
      const dc = Math.hypot(c.cx - cam.x, c.cz - cam.z);
      if (dc - c.r > c.far) continue;
      // les cellules proches restent dessinées hors champ (ombres portées dans le champ)
      sph.center.set(c.cx, c.y, c.cz);
      sph.radius = c.r + (dc < 160 ? 45 : 8);
      if (!frustum.intersectsSphere(sph)) continue;
      for (const i of c.items) {
        const o = i * 16;
        const d = Math.hypot(M[o + 12] - cam.x, M[o + 13] - cam.y, M[o + 14] - cam.z);
        const [d0, d1, d2] = dist(sizeOf[i]);
        if (d > d2) continue;
        const l = d < d0 ? 0 : d < d1 ? 1 : 2;
        const im = meshes[F[i * 8 + 7]][l];
        const k = im.count++;
        (im.instanceMatrix.array as Float32Array).set(M.subarray(o, o + 16), k * 16);
        ((im.geometry.getAttribute('aRock') as THREE.InstancedBufferAttribute).array as Float32Array).set(At.subarray(i * 4, i * 4 + 4), k * 4);
        drawn[l]++;
      }
    }
    for (const lods of meshes) for (const im of lods) {
      im.instanceMatrix.clearUpdateRanges();
      im.instanceMatrix.addUpdateRange(0, im.count * 16);
      im.instanceMatrix.needsUpdate = true;
      const a = im.geometry.getAttribute('aRock') as THREE.InstancedBufferAttribute;
      a.clearUpdateRanges();
      a.addUpdateRange(0, im.count * 4);
      a.needsUpdate = true;
    }
  };
  // seulement avec la caméra principale (les caméras d'ombre ou de reflet ne relancent pas le tri)
  let main: THREE.Camera | null = null;
  beforeRender(scene, (camera) => {
    if (!main && (camera as THREE.PerspectiveCamera).isPerspectiveCamera) main = camera;
    if (camera === main) update(camera);
  });
  const rocks: Rocks = {
    group, count: n, drawn,
    dispose() { for (const lods of meshes) for (const im of lods) { im.geometry.dispose(); (im.material as THREE.Material).dispose(); } },
  };
  (globalThis as unknown as { __rocks?: object }).__rocks = { count: n, drawn, colliders: ncol, cells: cellList.length };
  return rocks;
}
