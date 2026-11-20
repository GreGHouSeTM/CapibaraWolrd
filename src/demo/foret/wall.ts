// Paroi de granite (maillage Blender tools/foret/bl_wall.py) : normales et occlusion cuites, masques de mousse,
// lichen et coulures cuits ; détail photoscanné répété (granite moussu, roche à lichens, mousse) mélangé par hauteur.
import * as THREE from 'three';
import { glb, tex, texSet, TexSet } from './tex';
import { patch } from './glsl';

export async function buildWall() {
  const [g, nor, ao, masks, rocA, rocB, mousse] = await Promise.all([
    glb('paroi.glb'),
    tex('paroi_nor.jpg', false, { flipY: false, repeat: false }),
    tex('paroi_ao.jpg', false, { flipY: false, repeat: false }),
    tex('paroi_masks.png', false, { flipY: false, repeat: false }),
    texSet('rocA'), texSet('rocB'), texSet('mousse'),
  ]);
  let mesh: THREE.Mesh | null = null;
  g.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && !mesh) mesh = o as THREE.Mesh; });
  if (!mesh) throw new Error('paroi.glb : aucun maillage');
  const m = mesh as THREE.Mesh;
  const geo = m.geometry;
  if (geo.getAttribute('uv1')) { geo.setAttribute('uvm', geo.getAttribute('uv1')); geo.deleteAttribute('uv1'); }
  m.material = wallMaterial(nor, ao, masks, rocA, rocB, mousse);
  m.castShadow = true;
  m.receiveShadow = true;
  m.name = 'paroi';
  m.updateMatrixWorld(true);
  const obj = new THREE.Group();
  obj.name = 'paroi';
  m.removeFromParent();
  obj.add(m);
  return obj;
}

export function wallMaterial(nor: THREE.Texture, ao: THREE.Texture, masks: THREE.Texture, A: TexSet, B: TexSet, M: TexSet) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, normalMap: nor });
  return patch(mat, {
    uniforms: {
      tAO: { value: ao }, tMask: { value: masks },
      tAd: { value: A.diff }, tAn: { value: A.nor }, tAa: { value: A.arh },
      tBd: { value: B.diff }, tBn: { value: B.nor }, tBa: { value: B.arh },
      tMd: { value: M.diff }, tMn: { value: M.nor }, tMa: { value: M.arh },
    },
    vertexHead: 'attribute vec2 uvm; varying vec2 vUvm; varying vec3 vWp;',
    vertex: { '+uv_vertex': 'vUvm = uvm;', '+worldpos_vertex': 'vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;' },
    fragmentHead: /* glsl */ `
      uniform sampler2D tAO, tMask, tAd, tAn, tAa, tBd, tBn, tBa, tMd, tMn, tMa;
      varying vec2 vUvm; varying vec3 vWp;`,
    fragment: {
      map_fragment: /* glsl */ `
        vec2 um = vUvm;
        NT na = ntSetup(um / 2.6, 0.0);
        NT nb = ntSetup(rot2(um, 1.3) / 1.9, 3.0);
        NT nm = ntSetup(um / 0.8, 7.0);
        vec3 cA = ntS(tAd, na).rgb, cB = ntS(tBd, nb).rgb, cM = ntS(tMd, nm).rgb;
        vec3 hA = ntS(tAa, na).rgb, hB = ntS(tBa, nb).rgb, hM = ntS(tMa, nm).rgb;
        vec3 mk = texture2D(tMask, vNormalMapUv).rgb;
        float bakedAO = texture2D(tAO, vNormalMapUv).r;
        // deux granites mêlés à grande échelle (taches de plusieurs mètres), transition suivant le relief
        float big = fbm3(um * 0.17 + 3.0);
        float wB = smoothstep(0.42, 0.62, big + (hB.b - hA.b) * 0.25);
        vec3 rock = mix(cA, cB, wB);
        vec3 rH = mix(hA, hB, wB);
        // variation de teinte à l'échelle de la paroi : froid gris-bleu en haut, plus chaud et sombre au pied
        float vt = fbm3(um * 0.06 + 11.0);
        rock *= mix(vec3(0.92, 0.95, 1.0), vec3(1.05, 1.0, 0.92), vt) * (0.82 + 0.3 * vnoise(um * 0.4));
        // lichen : grandes croûtes pâles gris-vert (cuites), grain fin et bord irrégulier, la roche transparaît
        float lg = vnoise(um * 7.0) * 0.5 + vnoise(um * 19.0) * 0.3 + vnoise(um * 41.0) * 0.2;
        float wL = smoothstep(0.22, 0.62, mk.g * (0.6 + 0.8 * lg) + (rH.b - 0.5) * 0.2);
        float rl = dot(rock, vec3(0.299, 0.587, 0.114));
        vec3 lichen = mix(vec3(0.5, 0.55, 0.46), vec3(0.66, 0.69, 0.58), lg) * (0.7 + 0.6 * rl);
        rock = mix(rock, lichen, wL * 0.62);
        // coulures : roche mouillée, algues sombres
        float wW = mk.b * (0.7 + 0.3 * vnoise(vec2(um.x * 6.0, um.y * 0.7)));
        rock = mix(rock, rock * vec3(0.42, 0.46, 0.4), wW * 0.85);
        // mousse : couverture cuite, mélange par hauteur (la mousse remplit d'abord les creux)
        float wM = hblend(rH.b, hM.b, mk.r, 3.5);
        wM *= smoothstep(0.02, 0.2, mk.r);
        // mousse sombre et veloutée (vert olive), plus jaune par plaques
        vec3 moss = cM * mix(vec3(0.5, 0.58, 0.4), vec3(0.74, 0.76, 0.5), smoothstep(0.3, 0.8, vnoise(um * 0.55)));
        vec4 diffuseColor2 = vec4(mix(rock, moss, wM), 1.0);
        // micro-ombrage : les creux cuits assombrissent aussi un peu la lumière directe
        float aoAll = bakedAO * mix(rH.r, hM.r, wM);
        diffuseColor.rgb *= diffuseColor2.rgb * mix(1.0, aoAll, 0.35);
        float fRough = mix(mix(rH.g, 0.95, wL), 0.92 * hM.g + 0.08, wM);
        fRough = mix(fRough, 0.32, wW * (1.0 - wM));
        vec3 nDet = mix(unpackN(ntS(tAn, na)), unpackN(ntS(tBn, nb)), wB);
        nDet = normalize(mix(nDet, unpackN(ntS(tMn, nm)), wM));
      `,
      roughnessmap_fragment: 'float roughnessFactor = fRough;',
      normal_fragment_maps: /* glsl */ `
        vec3 mapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
        mapN = blendN(mapN, vec3(nDet.xy * 0.9, nDet.z));
        normal = normalize(tbn * mapN);
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
  }, 'foret-paroi');
}
