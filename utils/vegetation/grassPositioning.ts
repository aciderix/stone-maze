declare const THREE: any;
import { _buildGrassIM } from './grassSystem';
import { withSeededRng } from './rng';


export interface GrassPos { x: number; z: number; ry: number; s: number; }

export function computeGrassPositions(maze: number[][], mazeW: number, mazeH: number): GrassPos[] {
  const positions: GrassPos[] = [];

  for (let z = 1; z < mazeH - 1; z++) {
    for (let x = 1; x < mazeW - 1; x++) {
      if (maze[z][x] !== 0) continue;
      const adj: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      let wallCount = 0;
      for (const [dx, dz] of adj) {
        if (maze[z + dz][x + dx] === 1) wallCount++;
      }
      if (wallCount === 0) continue;
      if (Math.random() > 0.3 + wallCount * 0.15) continue;

      const count = 3 + Math.floor(Math.random() * 6) + wallCount;
      for (let i = 0; i < count; i++) {
        positions.push({
          x: x + (Math.random() - 0.5) * 0.7,
          z: z + (Math.random() - 0.5) * 0.7,
          ry: Math.random() * Math.PI,
          s: 0.5 + Math.random() * 1.0,
        });
      }
    }
  }

  return positions;
}

export function buildGrassMeshes(positions: GrassPos[], scene: any): void {
  const mesh = _buildGrassIM(positions);
  if (mesh) scene.add(mesh);
}

export function addGrass(
  scene: any, maze: number[][], mazeW: number, mazeH: number
): void {
  const positions = computeGrassPositions(maze, mazeW, mazeH);
  buildGrassMeshes(positions, scene);
}

export let cachedMenuGrass: GrassPos[] | null = null;

export function addMenuGrass(
  scene: any, maze: number[][], mazeW: number, mazeH: number
): void {
  if (!cachedMenuGrass) {
    cachedMenuGrass = withSeededRng(99, () => computeGrassPositions(maze, mazeW, mazeH));
  }
  withSeededRng(8888, () => buildGrassMeshes(cachedMenuGrass!, scene));
}

// ═══════════════════════════════════════════════════════════════════
//  Chunked vegetation API for colossal mode
//  Zone 1 (close): full ivy simulation + branches + leaves + grass
//  Zone 2 (medium): scatter leaves on wall faces (cheap)
