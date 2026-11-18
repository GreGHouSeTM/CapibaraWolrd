// Eau : couleur selon la profondeur (turquoise en bord de rive), vagues animées, écume et reflets du ciel.
import * as THREE from 'three';
import { getHeightTexture } from './heightmap';
import { WORLD_SIZE, WATER_LEVEL } from './layout';
import { buildRivers, Rivers } from './rivers';

export class Water {
  mesh: THREE.Mesh;
  /** eau locale de la vallée (torrent, cascades, bassins), construite après le village */
  rivers: Rivers | null = null;
  uniforms = {
    uTime: { value: 0 },
    uHeight: { value: null as THREE.Texture | null },
    uWorld: { value: WORLD_SIZE },
    uShallow: { value: new THREE.Color(0.2, 0.85, 0.78) },
    uDeep: { value: new THREE.Color(0.02, 0.2, 0.35) },
    uFoam: { value: 1 },
  };

  constructor() {
    this.uniforms.uHeight.value = getHeightTexture();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.06,
      metalness: 0.0,
      transparent: true,
      envMapIntensity: 0.7,
    });
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vWPos;
          uniform float uTime, uWorld, uFoam;
          uniform sampler2D uHeight;
          uniform vec3 uShallow, uDeep;
          float wDepth;
          float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
          float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
            return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
          vec2 waveGrad(vec2 p, float t){
            vec2 g = vec2(0.0);
            // somme de vagues directionnelles
            vec2 dirs[5]; dirs[0]=vec2(1.0,0.2); dirs[1]=vec2(-0.4,1.0); dirs[2]=vec2(0.7,-0.7); dirs[3]=vec2(-1.0,-0.3); dirs[4]=vec2(0.2,0.9);
            float fr[5]; fr[0]=0.21; fr[1]=0.37; fr[2]=0.63; fr[3]=1.1; fr[4]=1.9;
            for(int i=0;i<5;i++){
              vec2 d = normalize(dirs[i]);
              float ph = dot(d, p) * fr[i] + t * (1.2 + float(i) * 0.4);
              g += d * cos(ph) * (0.22 / (1.0 + float(i)));
            }
            g += (vec2(vn(p*1.7 + t*0.5), vn(p*1.7 - t*0.4 + 7.0)) - 0.5) * 0.5;
            return g;
          }`,
        )
        .replace(
          '#include <map_fragment>',
          `
          vec2 huv = (vWPos.xz + uWorld*0.5) / uWorld;
          float ground = texture2D(uHeight, huv).r;
          wDepth = max(0.0, -ground);
          vec3 wcol = mix(uShallow, uDeep, smoothstep(0.3, 9.0, wDepth)) * 0.85;
          // caustiques douces en eau peu profonde
          float ca = vn(vWPos.xz * 0.6 + uTime * 0.3) * vn(vWPos.xz * 0.9 - uTime * 0.25);
          wcol += vec3(0.3, 0.4, 0.35) * ca * smoothstep(4.0, 0.3, wDepth) * 0.6;
          // écume sur le rivage
          float foamLine = smoothstep(0.9, 0.0, wDepth) * (0.6 + 0.4 * sin(uTime * 1.5 + vn(vWPos.xz * 0.4) * 9.0));
          float foam = foamLine * step(0.55, vn(vWPos.xz * 1.3 + uTime * 0.2) + foamLine * 0.4) * uFoam;
          wcol = mix(wcol, vec3(0.95), foam * 0.85);
          diffuseColor.rgb = wcol;
          diffuseColor.a = mix(0.62, 0.96, smoothstep(0.0, 6.0, wDepth)) + foam * 0.3;
          `,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          {
            float dist = length(vWPos - cameraPosition);
            float fade = 1.0 / (1.0 + dist * 0.01);
            vec2 g = waveGrad(vWPos.xz * 0.9, uTime) * fade * 0.55;
            vec3 wn = normalize(vec3(-g.x, 1.0, -g.y));
            normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
          }`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `float roughnessFactor = roughness + foam * 0.6;`,
        );
    };
    mat.customProgramCacheKey = () => 'water-v1';
    const geo = new THREE.PlaneGeometry(WORLD_SIZE * 2.5, WORLD_SIZE * 2.5, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = WATER_LEVEL;
    this.mesh.renderOrder = 1;
    this.mesh.receiveShadow = true;
  }

  /** Construit l'eau locale (torrent, cascades…) ; `village` : groupe de Capyville (rochers du lit pour l'écume). */
  buildLocal(scene: THREE.Scene, village?: THREE.Object3D) {
    this.rivers = buildRivers(village);
    scene.add(this.rivers.group);
    return this.rivers;
  }

  update(time: number, shallow: THREE.Color, deep: THREE.Color, dt: number) {
    this.uniforms.uTime.value = time;
    this.rivers?.update(time, dt);
    const k = 1 - Math.exp(-dt * 0.8);
    this.uniforms.uShallow.value.lerp(shallow, k);
    this.uniforms.uDeep.value.lerp(deep, k);
  }
}
