declare const THREE: any;
import { GrassPos } from './grassPositioning';

/** Compute grass positions in a chunk region */
export function computeGrassInRegion(
  maze: number[][], mazeW: number, mazeH: number,
  sx: number, sz: number, ex: number, ez: number
): GrassPos[] {
  const positions: GrassPos[] = [];
  const rz0 = Math.max(1, sz);
  const rx0 = Math.max(1, sx);
  const rz1 = Math.min(mazeH - 1, ez);
  const rx1 = Math.min(mazeW - 1, ex);

  for (let z = rz0; z < rz1; z++) {
    for (let x = rx0; x < rx1; x++) {
      if (maze[z][x] !== 0) continue;
      const adj: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      let wc = 0;
      for (const [dx, dz] of adj) {
        if (maze[z + dz][x + dx] === 1) wc++;
      }
      if (wc === 0) continue;
      if (Math.random() > 0.3 + wc * 0.15) continue;
      const cnt = 3 + Math.floor(Math.random() * 6) + wc;
      for (let i = 0; i < cnt; i++) {
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

// ═══════════════════════════════════════════════════════════════════
//  Directional mesh groups for face-based visibility culling
//  Splits vegetation into 5 groups: top + 4 wall face directions
// ═══════════════════════════════════════════════════════════════════
