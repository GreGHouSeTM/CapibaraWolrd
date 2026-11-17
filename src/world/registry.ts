// Registres partagés remplis pendant la construction du monde et lus par les systèmes d'effets.
import * as THREE from 'three';

export type LightKind = 'lamp' | 'window' | 'lantern' | 'fire';

/** Points de lumière nocturne (lanternes, lampadaires, fenêtres éclairées, feux). */
export const lightSpots: { pos: THREE.Vector3; color: number; intensity: number; kind: LightKind }[] = [];
/** Sorties de fumée (cheminées, feux de camp) et de vapeur. */
export const smokeSpots: { pos: THREE.Vector3; kind: 'smoke' | 'steam' }[] = [];

export function addLightSpot(x: number, y: number, z: number, color = 0xffc070, intensity = 1, kind: LightKind = 'lamp') {
  lightSpots.push({ pos: new THREE.Vector3(x, y, z), color, intensity, kind });
}
export function addSmokeSpot(x: number, y: number, z: number, kind: 'smoke' | 'steam' = 'smoke') {
  smokeSpots.push({ pos: new THREE.Vector3(x, y, z), kind });
}
