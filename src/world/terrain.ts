// Maillage du terrain découpé en morceaux avec deux niveaux de détail, et son matériau « splat ».
import * as THREE from 'three';
import { HM_RES, WORLD_HALF, getSplatTexture, heightAt, normalAt } from './heightmap';
import { REGIONS, RegionId, WORLD_SIZE } from './layout';
import { TEX } from '../core/assets';

const CHUNK = 200;

const GRASS_TINT: Record<RegionId, [number, number, number]> = {
  hub: [0.62, 0.84, 0.32],
  paris: [0.5, 0.68, 0.3],
  newyork: [0.48, 0.66, 0.32],
  london: [0.42, 0.62, 0.3],
  japan: [0.5, 0.86, 0.38],
  desert: [0.85, 0.74, 0.45],
  pole: [0.9, 0.95, 1.0],
};

function tintAt(x: number, z: number, out: THREE.Color) {
  let r = 0, g = 0, b = 0, sum = 0;
  for (const reg of REGIONS) {
    const d = Math.hypot(x - reg.x, z - reg.z);
    const w = Math.pow(Math.max(0, 1 - d / (reg.radius * 1.7)), 3) + 1e-4;
    const t = GRASS_TINT[reg.id];
    r += t[0] * w; g += t[1] * w; b += t[2] * w; sum += w;
  }
  return out.setRGB(r / sum, g / sum, b / sum);
}

function buildChunkGeometry(cx: number, cz: number, seg: number) {
  const geo = new THREE.PlaneGeometry(CHUNK, CHUNK, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const n = new THREE.Vector3();
  const c = new THREE.Color();
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
    let y = heightAt(x, z);
    // jupe sur les bords pour masquer les fissures entre niveaux de détail
    const lx = pos.getX(i), lz = pos.getZ(i);
    if (Math.abs(Math.abs(lx) - CHUNK / 2) < 0.01 || Math.abs(Math.abs(lz) - CHUNK / 2) < 0.01) y -= seg < 32 ? 0.6 : 0.05;
    pos.setXYZ(i, lx, y, lz);
    normalAt(x, z, n);
    nor.setXYZ(i, n.x, n.y, n.z);
    tintAt(x, z, c);
    colors.set([c.r, c.g, c.b], i * 3);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return { geo, minY, maxY };
}

export function createTerrainMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const uniforms = {
    uSplat: { value: getSplatTexture() },
    uGrass: { value: TEX.grass.map },
    uSand: { value: TEX.sand.map },
    uSnow: { value: TEX.snow.map },
    uRock: { value: TEX.rock.map },
    uSandN: { value: TEX.sand.normalMap },
    uRockN: { value: TEX.rock.normalMap },
    uSnowN: { value: TEX.snow.normalMap },
    uWorld: { value: WORLD_SIZE },
    uTexel: { value: 1 / HM_RES },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        uniform sampler2D uSplat, uGrass, uSand, uSnow, uRock, uSandN, uRockN, uSnowN;
        uniform float uWorld;
        vec4 gSplat;
        vec3 sampleTri(sampler2D t, vec2 p, float s){
          // deux échelles mélangées pour casser la répétition
          vec3 a = texture2D(t, p / s).rgb;
          vec3 b = texture2D(t, p / (s * 3.7) + 0.37).rgb;
          return mix(a, b, 0.4);
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `
        vec2 suv = (vWPos.xz + uWorld*0.5) / uWorld;
        gSplat = texture2D(uSplat, suv);
        gSplat /= max(0.001, gSplat.r + gSplat.g + gSplat.b + gSplat.a);
        vec2 wp = vWPos.xz;
        vec3 grass = sampleTri(uGrass, wp, 5.0);
        grass = mix(vec3(dot(grass, vec3(0.33))), grass, 0.55) * 1.55; // herbe plus douce, stylisée
        grass *= vColor.rgb * 1.3;
        vec3 sand = sampleTri(uSand, wp, 6.0) * vec3(1.08, 0.98, 0.86);
        vec3 snow = sampleTri(uSnow, wp, 5.0) * vec3(0.98, 1.0, 1.05) * 1.1;
        vec3 rock = sampleTri(uRock, wp, 9.0);
        // bandes de couleur macro pour donner de l'ampleur au paysage
        float macro = texture2D(uGrass, wp / 211.0).g;
        grass *= 0.8 + 0.4 * macro;
        // vers l'eau : sable mouillé
        float wet = smoothstep(1.2, -0.4, vWPos.y);
        sand *= 1.0 - wet * 0.35;
        vec3 col = grass * gSplat.r + sand * gSplat.g + snow * gSplat.b + rock * gSplat.a;
        diffuseColor.rgb = col;
        `,
      )
      .replace('#include <color_fragment>', '')
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness;
         roughnessFactor = mix(roughnessFactor, 0.55, gSplat.b);
         roughnessFactor = mix(roughnessFactor, 0.6, smoothstep(0.8, -0.3, vWPos.y) * gSplat.g);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 ns = texture2D(uSandN, wp / 6.0).xyz * 2.0 - 1.0;
          vec3 nr = texture2D(uRockN, wp / 9.0).xyz * 2.0 - 1.0;
          vec3 nn = texture2D(uSnowN, wp / 5.0).xyz * 2.0 - 1.0;
          vec2 d = ns.xy * gSplat.g * 0.8 + nr.xy * gSplat.a * 1.0 + nn.xy * gSplat.b * 0.6;
          vec3 wpert = vec3(d.x, 0.0, -d.y);
          normal = normalize(normal + (viewMatrix * vec4(wpert, 0.0)).xyz * 0.6);
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'terrain-v1';
  return mat;
}

export function createTerrain(material: THREE.Material, lodDist: number) {
  const group = new THREE.Group();
  group.name = 'terrain';
  const n = Math.round(WORLD_SIZE / CHUNK);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const cx = -WORLD_HALF + CHUNK / 2 + i * CHUNK;
      const cz = -WORLD_HALF + CHUNK / 2 + j * CHUNK;
      const probe = buildChunkGeometry(cx, cz, 8);
      probe.geo.dispose();
      if (probe.maxY < -9) continue; // fond marin profond : l'eau suffit
      const lod = new THREE.LOD();
      const high = buildChunkGeometry(cx, cz, 64);
      const low = buildChunkGeometry(cx, cz, 16);
      const mh = new THREE.Mesh(high.geo, material);
      const ml = new THREE.Mesh(low.geo, material);
      mh.receiveShadow = true;
      ml.receiveShadow = true;
      lod.addLevel(mh, 0);
      lod.addLevel(ml, lodDist);
      lod.position.set(cx, 0, cz);
      lod.autoUpdate = true;
      group.add(lod);
    }
  }
  return group;
}
