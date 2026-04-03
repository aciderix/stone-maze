declare const THREE: any;
import { applyVegDissolve } from './dissolve';

export function makeVegMat(props: any): any {
  const mat = new THREE.MeshStandardMaterial(props);
  applyVegDissolve(mat);
  return mat;
}

// ═══════════════════════════════════════════════════════════════════
//  Procedural Grass — Bezier blade + wind + ball interaction
//  Inspired by procedural-grass-threejs, adapted for r150 / WebGL
