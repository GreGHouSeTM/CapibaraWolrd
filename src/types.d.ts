declare module 'n8ao' {
  import { Scene, Camera } from 'three';
  export class N8AOPostPass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: Record<string, unknown>;
    setQualityMode(mode: string): void;
    setSize(w: number, h: number): void;
  }
  export class N8AOPass extends N8AOPostPass {}
}
