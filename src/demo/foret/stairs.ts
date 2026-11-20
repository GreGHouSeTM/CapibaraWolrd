// Escalier de pierre (tools/foret/bl_stairs.py) : dalles usées, bordure de blocs, borne. Normales et AO cuites (atlas),
// détail triplanaire (dessus usé / flancs bruts / mousse) ; la mousse s'installe dans les joints et les creux (AO),
// sur les bords peu piétinés (loin de la ligne de passage) et sur le dessus des blocs ; terre au fond des girons.
import * as THREE from 'three';
import { glb, tex, texSet, TexSet } from './tex';
import { patch } from './glsl';

export async function buildStairs(axis: { x1: number; x2: number; zSplit: number }) {
  const [g, nor, ao, top, side, moss] = await Promise.all([
    glb('escalier.glb'),
    tex('escalier_nor.jpg', false, { flipY: false, repeat: false }),
    tex('escalier_ao.jpg', false, { flipY: false, repeat: false }),
    texSet('marche'), texSet('marcheflanc'), texSet('mousse'),
  ]);
  const group = new THREE.Group();
  group.name = 'escalier';
  const mat = stairsMaterial(nor, ao, top, side, moss, axis);
  g.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.material = mat;
    m.castShadow = m.receiveShadow = true;
  });
  group.add(g.scene);
  return group;
}

function stairsMaterial(nor: THREE.Texture, ao: THREE.Texture, T: TexSet, S: TexSet, M: TexSet, axis: { x1: number; x2: number; zSplit: number }) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, normalMap: nor });
  return patch(mat, {
    uniforms: {
      tAO: { value: ao }, tTd: { value: T.diff }, tTn: { value: T.nor }, tTa: { value: T.arh },
      tSd: { value: S.diff }, tSn: { value: S.nor }, tSa: { value: S.arh },
      tMd: { value: M.diff }, tMn: { value: M.nor }, tMa: { value: M.arh },
      uAxis: { value: new THREE.Vector3(axis.x1, axis.x2, axis.zSplit) },
    },
    vertexHead: 'varying vec3 vWp; varying vec3 vWn;',
    vertex: { '+worldpos_vertex': 'vWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vWn = normalize(mat3(modelMatrix) * objectNormal);' },
    fragmentHead: /* glsl */ `
      uniform sampler2D tAO, tTd, tTn, tTa, tSd, tSn, tSa, tMd, tMn, tMa;
      uniform vec3 uAxis;
      varying vec3 vWp; varying vec3 vWn;`,
    fragment: {
      map_fragment: /* glsl */ `
        vec3 nG = normalize(vWn);
        float up = nG.y;
        TP tpT = tpSetup(vWp, nG, 1.6);
        TP tpS2 = tpSetup(vWp + 3.1, nG, 1.3);
        TP tpM = tpSetup(vWp + 7.7, nG, 0.75);
        float bao = texture2D(tAO, vNormalMapUv).r;
        float wTop = smoothstep(0.55, 0.85, up);
        vec3 cT = tpS(tTd, tpT).rgb, cS = tpS(tSd, tpS2).rgb, cM = tpS(tMd, tpM).rgb;
        vec3 aT = tpS(tTa, tpT).rgb, aS2 = tpS(tSa, tpS2).rgb, aM = tpS(tMa, tpM).rgb;
        vec3 stone = mix(cS, cT, wTop);
        vec3 sA = mix(aS2, aT, wTop);
        // teinte propre à chaque dalle (bruit à basse fréquence) : granite gris plus ou moins chaud
        stone *= mix(vec3(0.9, 0.93, 0.98), vec3(1.06, 1.02, 0.95), vnoise(vWp.xz * 0.9 + vWp.y)) * (0.85 + 0.25 * vnoise(vWp.xz * 2.3));
        // ligne de passage : distance à l'axe de la volée
        float ax = vWp.z > uAxis.z ? uAxis.x : uAxis.y;
        float lat = abs(vWp.x - ax);
        float walked = exp(-pow(lat / 0.62, 2.0));
        // terre et aiguilles au fond des girons (coin rentrant, AO moyen, face vers le haut)
        float dirt = smoothstep(0.82, 0.5, bao) * smoothstep(0.4, 0.8, up) * (0.6 + 0.4 * vnoise(vWp.xz * 6.0));
        stone = mix(stone, vec3(0.16, 0.12, 0.085) * (0.8 + 0.4 * vnoise(vWp.xz * 11.0)), dirt * 0.8);
        // mousse : joints et creux, bords peu piétinés, dessus des blocs de bordure ; rompue par du bruit
        float n1 = fbm3(vWp.xz * 1.7 + vWp.y * 0.5);
        float stoneVar = smoothstep(0.25, 0.75, vnoise(vWp.xz * 0.9 + 4.0));
        float cover = max(smoothstep(0.7, 0.35, bao) * 0.95, smoothstep(0.35, 0.8, up) * smoothstep(0.9, 1.5, lat) * mix(0.25, 1.0, stoneVar));
        cover = max(cover, smoothstep(0.3, 0.8, up) * (1.0 - walked) * smoothstep(0.45, 0.7, n1) * 0.8);
        cover *= smoothstep(0.25, 0.5, n1 + 0.25 - walked * 0.35);
        float wM = hblend(sA.b, aM.b, cover, 3.0) * smoothstep(0.03, 0.2, cover);
        vec3 moss = cM * mix(vec3(0.62, 0.7, 0.5), vec3(0.85, 0.88, 0.58), vnoise(vWp.xz * 0.8));
        // lichen pâle par taches sur les flancs et les blocs
        float lich = smoothstep(0.62, 0.78, vnoise(vWp.xz * 3.1 + vWp.y * 2.7)) * (1.0 - wTop * walked) * (1.0 - wM);
        stone = mix(stone, vec3(0.58, 0.62, 0.52) * (0.8 + 0.4 * dot(stone, vec3(0.33))), lich * 0.45);
        float aoAll = bao * mix(sA.r, aM.r, wM);
        diffuseColor.rgb *= mix(stone, moss, wM) * mix(1.0, aoAll, 0.3);
        float fRough = mix(mix(sA.g, sA.g * 0.85, walked * wTop), 0.92, wM);
        vec3 nD = normalize(mix(mix(tpN(tSn, tpS2, nG), tpN(tTn, tpT, nG), wTop), tpN(tMn, tpM, nG), wM));
      `,
      roughnessmap_fragment: 'float roughnessFactor = fRough;',
      normal_fragment_maps: /* glsl */ `
        vec3 mapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
        vec3 nb = normalize(tbn * mapN);
        // détail triplanaire (monde) appliqué autour de la normale cuite
        vec3 nbW = normalize((vec4(nb, 0.0) * viewMatrix).xyz);
        vec3 nDw = normalize(nbW + (nD - nG) * 0.85);
        normal = normalize((viewMatrix * vec4(nDw, 0.0)).xyz);
      `,
      aomap_fragment: /* glsl */ `
        float ambientOcclusion = aoAll;
        reflectedLight.indirectDiffuse *= ambientOcclusion;
        #if defined( USE_ENVMAP ) && defined( STANDARD )
          float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
          reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
        #endif
      `,
    },
  }, 'foret-escalier');
}
