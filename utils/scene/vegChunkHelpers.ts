declare const THREE: any;
import type { VegChunk } from './types';

export function getAllVegMeshes(vc: VegChunk): any[] {
  return [...vc.top, ...vc.posX, ...vc.negX, ...vc.posZ, ...vc.negZ, ...vc.ground];
}

export function clearVegChunkMeshes(vc: VegChunk, scene: any): void {
  for (const m of getAllVegMeshes(vc)) {
    scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  }
  vc.top = []; vc.posX = []; vc.negX = []; vc.posZ = []; vc.negZ = []; vc.ground = [];
}
