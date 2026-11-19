// Ombres en cascade « légères » (spécialité Rendu HD).
// Deux lumières directionnelles partagent la direction du soleil :
//   - la PROCHE (index 0, celle qui éclaire) : carte fine sur ~25 m autour de la caméra, mise à jour à chaque image → ombres nettes ;
//   - la LOINTAINE (index 1, intensité nulle) : carte large (~90-130 m), mise à jour une image sur N → ombres douces au loin,
//     et coût des appels de dessin de la passe d'ombre divisé d'autant.
// Les chunks de three.js sont modifiés une fois pour toutes (avant toute compilation) : quand la scène compte exactement
// deux ombres directionnelles, le fragment lit la cascade proche et se fond dans la lointaine près de ses bords, au lieu
// de multiplier les deux ombres. La lumière d'index 1 n'éclaire pas (on saute son calcul). Avec une seule ombre
// (qualité Basse) les chunks d'origine s'appliquent tels quels.
import * as THREE from 'three';

/** Mélange des deux cascades (code inséré dans main(), après la déclaration des cartes d'ombre). */
const CASCADE = (dst: string) => /* glsl */ `
		{
			float cS0 = getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowIntensity, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] );
			float cS1 = getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowIntensity, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, vDirectionalShadowCoord[ 1 ] );
			vec3 cC0 = vDirectionalShadowCoord[ 0 ].xyz / vDirectionalShadowCoord[ 0 ].w;
			vec2 cE = min( cC0.xy, 1.0 - cC0.xy );
			float cIn = smoothstep( 0.0, 0.14, min( cE.x, cE.y ) ) * step( cC0.z, 1.0 );
			${dst} mix( cS1, cS0, cIn );
		}`;

let patched = false;
/** Modifie les chunks d'éclairage et de masque d'ombre (idempotent). */
export function patchCascadeChunks() {
  if (patched) return;
  patched = true;
  const C = THREE.ShaderChunk as unknown as Record<string, string>;
  // --- éclairage des matériaux standard / Lambert / Phong
  const lf = C.lights_fragment_begin;
  const orig = /#if defined\( USE_SHADOWMAP \) && \( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS \)\s*directionalLightShadow = directionalLightShadows\[ i \];\s*directLight\.color \*=[^\n]*\n\s*#endif\s*RE_Direct\( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight \);/;
  const m = lf.match(orig);
  if (!m) { console.warn('Ombres en cascade : chunk lights_fragment_begin inattendu'); return; }
  C.lights_fragment_begin = lf.replace(orig, `
		#if defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS == 2 ) && ( NUM_DIR_LIGHTS >= 2 )
			#if UNROLLED_LOOP_INDEX == 0
			if ( directLight.visible && receiveShadow ) ${CASCADE('directLight.color *=')}
			RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
			#elif UNROLLED_LOOP_INDEX > 1
			RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
			#endif
		#else
		${m[0]}
		#endif`);
  // --- masque d'ombre (matériaux maison : herbe, eau…)
  const sm = C.shadowmask_pars_fragment;
  const loop = /#if NUM_DIR_LIGHT_SHADOWS > 0\s*DirectionalLightShadow directionalLight;\s*#pragma unroll_loop_start[\s\S]*?#pragma unroll_loop_end\s*#endif/;
  const m2 = sm.match(loop);
  if (!m2) { console.warn('Ombres en cascade : chunk shadowmask_pars_fragment inattendu'); return; }
  C.shadowmask_pars_fragment = sm.replace(loop, `
	#if NUM_DIR_LIGHT_SHADOWS == 2
	if ( receiveShadow ) ${CASCADE('shadow *=')}
	#else
	${m2[0]}
	#endif`);
}
patchCascadeChunks();

export interface CascadeConfig {
  /** Demi-largeur (m) et résolution de la cascade proche ; 0 = une seule carte (Basse). */
  nearExtent: number;
  nearSize: number;
  /** Demi-largeur (m) et résolution de la cascade lointaine (ou de la carte unique). */
  farExtent: number;
  farSize: number;
  /** La cascade lointaine est recalculée une image sur `farEvery`. */
  farEvery: number;
}

const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _c = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
/** Positionne une lumière d'ombre centrée en (cx, cz), alignée sur la grille de ses texels (pas de scintillement). */
export function placeShadowLight(l: THREE.DirectionalLight, dir: THREE.Vector3, cx: number, cy: number, cz: number, extent: number) {
  // alignement dans le repère de la lumière (axes de lookAt) : le centre est arrondi au texel sur le plan d'ombre
  const texel = (extent * 2) / l.shadow.mapSize.x;
  _z.copy(dir).normalize();
  _x.crossVectors(_up, _z).normalize();
  _y.crossVectors(_z, _x);
  _c.set(cx, cy, cz);
  const a = Math.round(_c.dot(_x) / texel) * texel, b = Math.round(_c.dot(_y) / texel) * texel, d = _c.dot(_z);
  _c.copy(_x).multiplyScalar(a).addScaledVector(_y, b).addScaledVector(_z, d);
  l.target.position.copy(_c);
  l.position.copy(_c).addScaledVector(_z, 320);
  l.target.updateMatrixWorld();
  l.updateMatrixWorld();
}

export function configureShadowCamera(l: THREE.DirectionalLight, size: number, extent: number) {
  l.shadow.mapSize.set(size, size);
  const c = l.shadow.camera;
  c.left = -extent; c.right = extent; c.top = extent; c.bottom = -extent;
  c.near = 1; c.far = 700;
  c.updateProjectionMatrix();
  l.shadow.map?.dispose();
  (l.shadow as any).map = null;
}
