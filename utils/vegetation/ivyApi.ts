declare const THREE: any;
import { simulateIvy, buildIvyMeshes } from './ivySimulation';
import type { IvyRoot } from './ivyTypes';
import { withSeededRng } from './rng';

// ═════════════════════════════════════════════════════════════════
let cachedMenuRoots: IvyRoot[] | null = null;

// ═════════════════════════════════════════════════════════════════
//  Public API — addIvy / addMenuIvy
// ═════════════════════════════════════════════════════════════════

export function addIvy(
  scene: any, maze: number[][], mazeW: number, mazeH: number, wallHeight: number
): void {
  // Adaptive: match tutorial branching density (~4-5 branches per seed)
  const cells = mazeW * mazeH;
  const iterations = cells <= 300 ? 100 : cells <= 2000 ? 95 : 85;
  const rootCap = cells <= 300 ? 300 : Math.min(1500, Math.floor(cells * 0.8));

  const roots = simulateIvy(maze, mazeW, mazeH, wallHeight, iterations, rootCap);
  buildIvyMeshes(roots, scene);
}

export function addMenuIvy(
  scene: any, maze: number[][], mazeW: number, mazeH: number, wallHeight: number
): void {
  // Simulation cached + seeded → deterministic, only computed once per session
  if (!cachedMenuRoots) {
    cachedMenuRoots = withSeededRng(42, () =>
      simulateIvy(maze, mazeW, mazeH, wallHeight, 80, 200)
    );
  }
  // Mesh building also seeded for identical colors/scatter every time
  withSeededRng(7777, () => buildIvyMeshes(cachedMenuRoots!, scene));
}

// ═════════════════════════════════════════════════════════════════
//  Grass — enhanced density near walls
