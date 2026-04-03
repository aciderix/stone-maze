import { V, vec, vadd, vsub, vscl, vlen, vnorm, vrand } from './vecMath';
import type { IvyRoot } from './ivyTypes';
import { STEP, W_PRI, W_RND, W_ADH, W_GRAV, MAX_FLOAT, MAX_ADH_D, BRANCH_TH, MAX_DEPTH, CLIMB_EPS } from './ivyTypes';


export function computeAdhesion(
  p: V, maze: number[][], mW: number, mH: number, wH: number
): V {
  let bestD = MAX_ADH_D;
  let best: V = vec(0, 0, 0);
  const gx = Math.round(p.x);
  const gz = Math.round(p.z);

  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      const wx = gx + dx;
      const wz = gz + dz;
      if (wx < 0 || wx >= mW || wz < 0 || wz >= mH) continue;
      if (maze[wz][wx] !== 1) continue;

      const cx = Math.max(wx - 0.5, Math.min(p.x, wx + 0.5));
      const cy = Math.max(0, Math.min(p.y, wH));
      const cz = Math.max(wz - 0.5, Math.min(p.z, wz + 0.5));

      const d = vlen(vsub(p, vec(cx, cy, cz)));
      if (d > 0.001 && d < bestD) {
        bestD = d;
        best = vscl(vnorm(vsub(vec(cx, cy, cz), p)), 1 - d / MAX_ADH_D);
      }
    }
  }

  if (p.y > 0.001 && p.y < bestD) {
    bestD = p.y;
    best = vec(0, -(1 - p.y / MAX_ADH_D), 0);
  }

  return best;
}

// ═════════════════════════════════════════════════════════════════
//  Collision — reflect ivy out of walls + detect climbing
// ═════════════════════════════════════════════════════════════════

export function computeCollision(
  _old: V, pos: V, maze: number[][], mW: number, mH: number, wH: number
): { p: V; climb: boolean } {
  const p = { x: pos.x, y: pos.y, z: pos.z };
  let climb = false;

  if (p.y < 0) { p.y = Math.abs(p.y) * 0.3; climb = true; }

  for (let iter = 0; iter < 3; iter++) {
    let hit = false;
    const gx = Math.round(p.x);
    const gz = Math.round(p.z);

    for (let dz = -1; dz <= 1 && !hit; dz++) {
      for (let dx = -1; dx <= 1 && !hit; dx++) {
        const wx = gx + dx;
        const wz = gz + dz;
        if (wx < 0 || wx >= mW || wz < 0 || wz >= mH) continue;
        if (maze[wz][wx] !== 1) continue;

        const x0 = wx - 0.5, x1 = wx + 0.5;
        const z0 = wz - 0.5, z1 = wz + 0.5;

        if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1 && p.y >= 0 && p.y < wH) {
          const dLeft = p.x - x0, dRight = x1 - p.x;
          const dBack = p.z - z0, dFront = z1 - p.z;
          const dTop = wH - p.y;
          const minD = Math.min(dLeft, dRight, dBack, dFront, dTop);

          if (minD === dLeft) p.x = 2 * x0 - p.x;
          else if (minD === dRight) p.x = 2 * x1 - p.x;
          else if (minD === dBack) p.z = 2 * z0 - p.z;
          else if (minD === dFront) p.z = 2 * z1 - p.z;
          else p.y = 2 * wH - p.y;

          climb = true;
          hit = true;
        }
      }
    }
    if (!hit) break;
  }

  if (!climb) {
    const gx = Math.round(p.x);
    const gz = Math.round(p.z);
    for (let dz = -1; dz <= 1 && !climb; dz++) {
      for (let dx = -1; dx <= 1 && !climb; dx++) {
        const wx = gx + dx;
        const wz = gz + dz;
        if (wx < 0 || wx >= mW || wz < 0 || wz >= mH) continue;
        if (maze[wz][wx] !== 1) continue;

        const cx = Math.max(wx - 0.5, Math.min(p.x, wx + 0.5));
        const cy = Math.max(0, Math.min(p.y, wH));
        const cz = Math.max(wz - 0.5, Math.min(p.z, wz + 0.5));
        if (vlen(vsub(vec(p.x, p.y, p.z), vec(cx, cy, cz))) < CLIMB_EPS) {
          climb = true;
        }
      }
    }
    if (!climb && p.y < CLIMB_EPS) climb = true;
  }

  return { p: vec(p.x, p.y, p.z), climb };
}

// ═════════════════════════════════════════════════════════════════
//  Seeding — dense coverage of wall faces
// ═════════════════════════════════════════════════════════════════

export function seedRoots(maze: number[][], mW: number, mH: number): IvyRoot[] {
  const cands: { x: number; z: number; dx: number; dz: number }[] = [];

  for (let z = 0; z < mH; z++) {
    for (let x = 0; x < mW; x++) {
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

  // Fisher-Yates shuffle
  for (let i = cands.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cands[i], cands[j]] = [cands[j], cands[i]];
  }

  // Scale with maze area — no hard cap, 25% of wall-face candidates
  const count = Math.min(cands.length, Math.max(30, Math.floor(cands.length * 0.25)));
  const roots: IvyRoot[] = [];

  for (let i = 0; i < count; i++) {
    const c = cands[i];
    let sx = c.x + c.dx * 0.54;
    let sz = c.z + c.dz * 0.54;
    if (c.dx !== 0) sz += (Math.random() - 0.5) * 0.6;
    else sx += (Math.random() - 0.5) * 0.6;

    const seedY = Math.random() < 0.7 ? 0.05 : (0.1 + Math.random() * 0.4);

    roots.push({
      nodes: [{
        p: vec(sx, seedY, sz),
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

// ═════════════════════════════════════════════════════════════════
//  Growth — forces + collision + branching
// ═════════════════════════════════════════════════════════════════

export function growStep(
  roots: IvyRoot[], maze: number[][], mW: number, mH: number,
  wH: number, rootCap: number
): void {
  const n = roots.length;

  for (let ri = 0; ri < n; ri++) {
    const root = roots[ri];
    if (!root.alive) continue;

    const last = root.nodes[root.nodes.length - 1];

    if (last.flen > MAX_FLOAT || last.p.y > wH * 1.3 ||
        last.p.x < -1 || last.p.z < -1 ||
        last.p.x > mW + 1 || last.p.z > mH + 1) {
      root.alive = false;
      continue;
    }

    const primary = last.dir;
    const random = vnorm(vadd(vrand(), vec(0, 0.2, 0)));
    const adh = computeAdhesion(last.p, maze, mW, mH, wH);

    const grow = vscl(
      vadd(vadd(vscl(primary, W_PRI), vscl(random, W_RND)), vscl(adh, W_ADH)),
      STEP
    );

    const gPow = Math.pow(Math.min(last.flen / MAX_FLOAT, 1), 0.7);
    const grav = vscl(vec(0, -1, 0), STEP * W_GRAV * gPow);

    let newP = vadd(vadd(last.p, grow), grav);
    const col = computeCollision(last.p, newP, maze, mW, mH, wH);
    newP = col.p;

    const seg = vlen(vsub(newP, last.p));
    const actualGrow = vsub(vsub(newP, last.p), grav);
    let newDir = vnorm(vadd(vscl(last.dir, 0.5), vscl(vnorm(actualGrow), 0.5)));
    if (vlen(newDir) < 0.01) newDir = last.dir;

    root.nodes.push({
      p: newP,
      dir: newDir,
      adh: adh,
      sadh: vec(0, 0, 0),
      len: last.len + seg,
      flen: col.climb ? 0 : last.flen + seg,
      climb: col.climb,
    });
  }

  // ── Branching ──
  if (roots.length >= rootCap) return;

  for (let ri = 0; ri < n; ri++) {
    const root = roots[ri];
    if (!root.alive || root.depth >= MAX_DEPTH) continue;

    const totalLen = root.nodes[root.nodes.length - 1].len;
    if (totalLen < 0.12) continue;

    for (const node of root.nodes) {
      const w = 1 - (Math.cos((node.len / totalLen) * 2 * Math.PI) * 0.5 + 0.5);
      if (Math.random() * w > BRANCH_TH) {
        const bdir = vnorm(vec(
          node.dir.z * (Math.random() > 0.5 ? 1 : -1) + (Math.random() - 0.5) * 0.3,
          0.4 + Math.random() * 0.4,
          -node.dir.x * (Math.random() > 0.5 ? 1 : -1) + (Math.random() - 0.5) * 0.3,
        ));

        roots.push({
          nodes: [{
            p: { ...node.p },
            dir: bdir,
            adh: { ...node.adh },
            sadh: vec(0, 0, 0),
            len: 0,
            flen: node.flen,
            climb: node.climb,
          }],
          alive: true,
          depth: root.depth + 1,
        });
        if (roots.length >= rootCap) return;
        break;
      }
    }
  }
}

// ═════════════════════════════════════════════════════════════════
//  Gaussian smoothing of adhesion vectors (3 passes, kernel=11)
// ═════════════════════════════════════════════════════════════════

export function smoothAdhesion(roots: IvyRoot[]): void {
  const K = [1, 2, 4, 7, 9, 10, 9, 7, 4, 2, 1];
  const KSUM = 56;

  for (const root of roots) {
    const N = root.nodes.length;
    if (N < 2) continue;

    for (let pass = 0; pass < 3; pass++) {
      const buf: V[] = [];
      for (let i = 0; i < N; i++) {
        let sx = 0, sy = 0, sz = 0;
        for (let k = -5; k <= 5; k++) {
          const j = Math.max(0, Math.min(N - 1, i + k));
          const a = root.nodes[j].adh;
          const w = K[k + 5];
          sx += a.x * w; sy += a.y * w; sz += a.z * w;
        }
        buf.push(vec(sx / KSUM, sy / KSUM, sz / KSUM));
      }
      for (let i = 0; i < N; i++) {
        root.nodes[i].sadh = buf[i];
        root.nodes[i].adh = buf[i];
      }
    }
  }
}
