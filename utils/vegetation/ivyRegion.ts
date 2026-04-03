import { vec, vnorm } from './vecMath';
import type { IvyRoot } from './ivyTypes';
import { growStep, smoothAdhesion } from './ivyCore';

// ═══════════════════════════════════════════════════════════════════

export function seedRootsInRegion(
  maze: number[][], mW: number, mH: number,
  sx: number, sz: number, ex: number, ez: number
): IvyRoot[] {
  const cands: { x: number; z: number; dx: number; dz: number }[] = [];

  for (let z = sz; z < ez; z++) {
    for (let x = sx; x < ex; x++) {
      if (maze[z][x] !== 1) continue;
      const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dz] of dirs) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nx >= mW || nz < 0 || nz >= mH) continue;
        if (maze[nz][nx] !== 0) continue;
        cands.push({ x, z, dx, dz });
      }
    }
  }

  for (let i = cands.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cands[i], cands[j]] = [cands[j], cands[i]];
  }

  // Match tutorial density: 25% of candidates, min 15 per chunk
  const count = Math.min(cands.length, Math.max(15, Math.floor(cands.length * 0.25)));
  const roots: IvyRoot[] = [];

  for (let i = 0; i < count; i++) {
    const c = cands[i];
    let spx = c.x + c.dx * 0.54;
    let spz = c.z + c.dz * 0.54;
    if (c.dx !== 0) spz += (Math.random() - 0.5) * 0.6;
    else spx += (Math.random() - 0.5) * 0.6;
    const seedY = Math.random() < 0.7 ? 0.05 : (0.1 + Math.random() * 0.4);

    roots.push({
      nodes: [{
        p: vec(spx, seedY, spz),
        dir: vnorm(vec(
          (Math.random() - 0.5) * 0.3,
          0.8 + Math.random() * 0.2,
          (Math.random() - 0.5) * 0.3
        )),
        adh: vec(-c.dx, 0, -c.dz),
        sadh: vec(0, 0, 0),
        len: 0,
        flen: 0,
        climb: true,
      }],
      alive: true,
      depth: 0,
    });
  }

  return roots;
}

/** Simulate full ivy for a chunk region (uses full maze for adhesion/collision) */
export function simulateIvyForRegion(
  maze: number[][], mW: number, mH: number, wH: number,
  sx: number, sz: number, ex: number, ez: number
): any[] {
  const roots = seedRootsInRegion(maze, mW, mH, sx, sz, ex, ez);
  if (roots.length === 0) return [];
  // Match tutorial branching ratio (~5× seeds)
  const rootCap = Math.min(250, roots.length * 5);
  for (let i = 0; i < 95; i++) {
    growStep(roots, maze, mW, mH, wH, rootCap);
  }
  smoothAdhesion(roots);
  return roots;
}

