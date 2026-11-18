// Matériaux de la végétation de Capyville : vent dans le shader, cartes de feuilles alpha, translucidité,
// occlusion cuite, et matériau de profondeur assorti (ombres qui bougent avec le feuillage).
//
// Conventions des modèles (voir tools/blender/flora/trees.py) : attribut `aWind` (ancien COLOR_0)
//   r = balancement des branches, g = frémissement des feuilles, b = occlusion ambiante cuite.
import * as THREE from 'three';

/** Vent partagé (lecture libre pour les effets, l'audio…) : direction xz unitaire, force 0..1, rafale 0..1. */
export const FLORA_WIND = { dir: new THREE.Vector2(0.82, 0.57), strength: 0.55, gust: 0 };

/** Uniformes communs à toute la végétation (temps et vent). */
export const floraUniforms = {
  uFTime: { value: 0 },
  uFWind: { value: new THREE.Vector4(0.82, 0.57, 0.55, 0) },
  /** 0 le jour … 1 la nuit (atténue la translucidité au clair de lune) */
  uFNight: { value: 0 },
};

export function updateFloraWind(time: number, night = 0) {
  floraUniforms.uFTime.value = time;
  floraUniforms.uFNight.value = night;
  const g = 0.5 + 0.5 * Math.sin(time * 0.21) * Math.sin(time * 0.083 + 1.3);
  FLORA_WIND.gust = g;
  const a = Math.atan2(0.57, 0.82) + 0.25 * Math.sin(time * 0.017);
  FLORA_WIND.dir.set(Math.cos(a), Math.sin(a));
  floraUniforms.uFWind.value.set(FLORA_WIND.dir.x, FLORA_WIND.dir.y, FLORA_WIND.strength * (0.7 + 0.6 * g), g);
}

export interface WindOpts {
  /** hauteur du modèle (m) : la flexion du tronc croît comme (y / h)² */
  height: number;
  /** flexion au sommet (m) par unité de vent */
  flex: number;
  /** amplitude du balancement des branches (m) */
  branch?: number;
  /** amplitude du frémissement des feuilles (m) */
  flutter?: number;
  /** fréquence du frémissement */
  flutterFreq?: number;
}

const WIND_PARS = /* glsl */ `
uniform float uFTime;
uniform vec4 uFWind;
uniform vec4 uFWindOpt; // hauteur, flexion, branches, feuilles
uniform float uFFlutterFreq;
attribute vec3 aWind;
varying float vFAO;
`;

/** Déplacement de vent (espace local du modèle, avant instanceMatrix). */
const WIND_VERTEX = /* glsl */ `
{
  #ifdef USE_INSTANCING
    vec3 fIp = instanceMatrix[3].xyz;
    mat3 fRot = mat3(instanceMatrix);
  #else
    vec3 fIp = vec3(modelMatrix[3].xyz);
    mat3 fRot = mat3(modelMatrix);
  #endif
  float fPh = fIp.x * 0.113 + fIp.z * 0.071;
  vec3 fWd = vec3(uFWind.x, 0.0, uFWind.y);
  vec3 fWl = normalize(transpose(fRot) * fWd + vec3(1e-5));
  float fS = uFWind.z;
  float fH = max(0.0, transformed.y) / uFWindOpt.x;
  float fMain = 0.55 + 0.45 * sin(uFTime * 0.9 + fPh) + 0.25 * sin(uFTime * 2.1 + fPh * 1.7);
  transformed += fWl * (fMain * fS * uFWindOpt.y * fH * fH);
  float fB = aWind.r;
  float fBs = sin(uFTime * 2.3 + fPh * 3.0 + transformed.x * 0.6 + transformed.z * 0.45);
  transformed += (fWl * 0.8 + vec3(0.0, 0.35, 0.0)) * fB * fS * uFWindOpt.z * fBs;
  float fF = aWind.g;
  float fFs = sin(uFTime * uFFlutterFreq + fPh * 5.0 + transformed.y * 3.1 + transformed.x * 2.3);
  transformed += (objectNormal * 0.7 + fWl * 0.5) * fF * (0.35 + fS) * uFWindOpt.w * fFs;
  vFAO = aWind.b;
}
`;

function windUniforms(o: WindOpts) {
  return {
    uFWindOpt: { value: new THREE.Vector4(o.height, o.flex, o.branch ?? 0.12, o.flutter ?? 0.04) },
    uFFlutterFreq: { value: o.flutterFreq ?? 6.5 },
  };
}

function injectWind(s: THREE.WebGLProgramParametersWithUniforms, u: Record<string, THREE.IUniform>, depth = false) {
  Object.assign(s.uniforms, floraUniforms, u);
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + WIND_PARS);
  if (depth) {
    // le matériau de profondeur n'a pas objectNormal : on le déclare
    s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvec3 objectNormal = vec3(0.0, 1.0, 0.0);\n' + WIND_VERTEX);
  } else {
    s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_VERTEX);
  }
}

export interface FloraMatOpts extends WindOpts {
  map: THREE.Texture;
  normalMap?: THREE.Texture;
  color?: THREE.ColorRepresentation;
  roughness?: number;
  /** cartes de feuilles : alpha, double face, translucidité */
  leaf?: boolean;
  /** force de la translucidité (contre-jour) */
  trans?: number;
  /** désature / assombrit l'occlusion (0 = ignorée) */
  aoStrength?: number;
  /** pas d'ombre portée pour les petites plantes */
  name: string;
}

/** Matériau standard de végétation (écorce ou feuilles) avec vent, occlusion cuite et contre-jour. */
export function floraMaterial(o: FloraMatOpts) {
  const m = new THREE.MeshStandardMaterial({
    map: o.map,
    normalMap: o.normalMap ?? null,
    color: o.color ?? 0xffffff,
    roughness: o.roughness ?? (o.leaf ? 0.78 : 0.92),
    metalness: 0,
    alphaTest: o.leaf ? 0.42 : 0,
    side: o.leaf ? THREE.DoubleSide : THREE.FrontSide,
  });
  m.name = 'flora-' + o.name;
  const wu = windUniforms(o);
  const trans = { value: o.trans ?? (o.leaf ? 0.5 : 0) };
  const aos = { value: o.aoStrength ?? 1 };
  m.onBeforeCompile = (s) => {
    injectWind(s, wu);
    s.uniforms.uFTrans = trans;
    s.uniforms.uFNight = floraUniforms.uFNight;
    s.uniforms.uFAOs = aos;
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFAO;\nuniform float uFTrans, uFAOs, uFNight;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= mix(1.0, vFAO, uFAOs);')
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
          {
            float fBl = pow(max(0.0, dot(-geometryViewDir, directionalLights[0].direction)), 3.0);
            float fWrap = 0.5 + 0.5 * dot(geometryNormal, directionalLights[0].direction);
            reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[0].color * (fBl * 0.9 + fWrap * 0.15) * uFTrans * vFAO * (1.0 - 0.85 * uFNight);
          }
        #endif`,
      );
    if (o.leaf) {
      // feuilles : on garde la normale lissée « houppier » des deux côtés (pas d'inversion en face arrière)
      s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vNormal);');
    }
  };
  m.customProgramCacheKey = () => 'flora-' + (o.leaf ? 'leaf' : 'bark') + (o.normalMap ? 'n' : '');
  return m;
}

/** Matériau de profondeur (ombres) assorti : même vent, même découpe alpha. */
export function floraDepthMaterial(o: WindOpts & { map?: THREE.Texture; leaf?: boolean }) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: o.leaf ? o.map ?? null : null, alphaTest: o.leaf ? 0.42 : 0 });
  const wu = windUniforms(o);
  m.onBeforeCompile = (s) => injectWind(s, wu, true);
  m.customProgramCacheKey = () => 'flora-depth' + (o.leaf ? 'leaf' : '');
  return m;
}

/** Matériau des accessoires (béquilles, corde) : couleur de sommet comme albédo, pas de vent. */
export function propMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
}

/** Matériau des fruits (yuzu) : couleur de sommet, léger vernis, suit le vent des branches. */
export function fruitMaterial(o: WindOpts) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 });
  const wu = windUniforms({ ...o, flutter: 0 });
  m.onBeforeCompile = (s) => {
    injectWind(s, wu);
    // la couleur est dans aWind pour les fruits : on la lit directement
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFCol;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= vFCol;');
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFCol;')
      .replace('vFAO = aWind.b;', 'vFAO = 1.0; vFCol = aWind;')
      .replace('float fB = aWind.r;', 'float fB = 0.8;')
      .replace('float fF = aWind.g;', 'float fF = 0.0;');
  };
  m.customProgramCacheKey = () => 'flora-fruit';
  return m;
}
