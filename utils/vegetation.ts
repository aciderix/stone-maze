declare const THREE: any;

// ═══════════════════════════════════════════════════════════════════
//  Ivy Generator–inspired procedural vegetation for Stone Maze
//  v3: Performance optimized
//    • Quad leaf geometry (2 triangles instead of ~10)
//    • FrontSide rendering (half fragment work for leaves)
//    • Triangular open-ended branches (6 tris instead of ~16)
//    • Adaptive iterations/rootCap based on maze size
//    • Seeded PRNG + cached simulation for deterministic menu
// ═══════════════════════════════════════════════════════════════════

// ─── Ball-position dissolve for vegetation ─────────────────────
let _uBallPos: { value: any } | null = null;
export function setVegBallPos(u: { value: any }) { _uBallPos = u; }

function applyVegDissolve(mat: any) {
  if (!_uBallPos) return;
  const uBP = _uBallPos;
  mat.onBeforeCompile = (shader: any) => {
    shader.uniforms.uBallPos = uBP;
    // ── Vertex: pass world position + world normal per instance ──
    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      'varying vec3 vVegWorldPos;\nvarying vec3 vVegNormal;\nvoid main() {'
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
#ifdef USE_INSTANCING
vVegWorldPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
vVegNormal = normalize((modelMatrix * instanceMatrix * vec4(normal, 0.0)).xyz);
#else
vVegWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
vVegNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
#endif`
    );
    // ── Fragment: dissolve with skipDissolve rule (same as walls) ──
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      'uniform vec3 uBallPos;\nvarying vec3 vVegWorldPos;\nvarying vec3 vVegNormal;\nvoid main() {'
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
// ── skipDissolve: same rule as walls ──
// Vegetation on corridor walls facing the camera near the ball → keep visible
vec3 toBall = normalize(uBallPos - vVegWorldPos);
vec3 toCam  = normalize(cameraPosition - vVegWorldPos);
float distToBall = length(vVegWorldPos - uBallPos);
bool isVerticalFace = abs(vVegNormal.y) < 0.3;
bool skipDissolve = false;
if (isVerticalFace && dot(vVegNormal, toBall) > 0.0 && dot(vVegNormal, toCam) > 0.0 && distToBall < 3.5) {
  skipDissolve = true;
}
if (!skipDissolve) {
  vec3 rvec = uBallPos - cameraPosition;
  float rlen = length(rvec);
  vec3 rdir = rvec / max(rlen, 0.001);
  float t = dot(vVegWorldPos - cameraPosition, rdir);
  vec3 closest = cameraPosition + rdir * clamp(t, 0.0, rlen);
  float d = length(vVegWorldPos - closest);
  float coreR = 0.3;
  float edgeR = 1.0;
  if (d < coreR) {
    discard;
  } else if (d < edgeR) {
    float dissolve = 1.0 - smoothstep(coreR, edgeR, d);
    float pat = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    if (pat < dissolve) discard;
  }
}`
    );
  };
}

function makeVegMat(props: any): any {
  const mat = new THREE.MeshStandardMaterial(props);
  applyVegDissolve(mat);
  return mat;
}

// ─── Vector helpers ──────────────────────────────────────────────
interface V { x: number; y: number; z: number; }

function vec(x: number, y: number, z: number): V { return { x, y, z }; }
function vadd(a: V, b: V): V { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function vsub(a: V, b: V): V { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function vscl(a: V, s: number): V { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
function vlen(a: V): number { return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); }
function vnorm(a: V): V {
  const l = vlen(a);
  return l < 1e-7 ? vec(0, 0, 0) : { x: a.x / l, y: a.y / l, z: a.z / l };
}
function vrand(): V {
  return vec(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
}

// ─── Types ───────────────────────────────────────────────────────
interface IvyNode {
  p: V;
  dir: V;
  adh: V;
  sadh: V;
  len: number;
  flen: number;
  climb: boolean;
}

interface IvyRoot {
  nodes: IvyNode[];
  alive: boolean;
  depth: number;
}

// ─── Tuning constants ────────────────────────────────────────────
const STEP = 0.055;
const W_PRI = 0.5;
const W_RND = 0.32;
const W_ADH = 0.18;
const W_GRAV = 0.65;
const MAX_FLOAT = 0.55;
const MAX_ADH_D = 0.8;
const BRANCH_TH = 0.85;
const MAX_DEPTH = 4;
const CLIMB_EPS = 0.08;

// ─── Seeded PRNG (mulberry32) ────────────────────────────────────
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function withSeededRng<T>(seed: number, fn: () => T): T {
  const orig = Math.random;
  Math.random = mulberry32(seed);
  try { return fn(); } finally { Math.random = orig; }
}

// ═════════════════════════════════════════════════════════════════
//  Adhesion — attract ivy toward nearest wall / ground surface
// ═════════════════════════════════════════════════════════════════

function computeAdhesion(
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

function computeCollision(
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

function seedRoots(maze: number[][], mW: number, mH: number): IvyRoot[] {
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

function growStep(
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

function smoothAdhesion(roots: IvyRoot[]): void {
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

// ═════════════════════════════════════════════════════════════════
//  Simulation (separated from mesh building for cacheability)
// ═════════════════════════════════════════════════════════════════

function simulateIvy(
  maze: number[][], mW: number, mH: number, wH: number,
  iterations: number, rootCap: number
): IvyRoot[] {
  const roots = seedRoots(maze, mW, mH);
  for (let i = 0; i < iterations; i++) {
    growStep(roots, maze, mW, mH, wH, rootCap);
  }
  smoothAdhesion(roots);
  return roots;
}

// ═════════════════════════════════════════════════════════════════
//  Mesh generation — optimized geometry
// ═════════════════════════════════════════════════════════════════

function buildIvyMeshes(roots: IvyRoot[], scene: any): void {
  // ── LEAF: Simple quad (2 triangles) instead of ShapeGeometry (~10 tris) ──
  const leafGeo = new THREE.PlaneGeometry(0.1, 0.14);

  // ── Collect leaf instances (quaternion-based orientation) ──
  const leafData: { p: V; qx: number; qy: number; qz: number; qw: number; s: number }[] = [];
  const defNorm = new THREE.Vector3(0, 0, 1);

  for (const root of roots) {
    if (root.nodes.length < 3) continue;
    const total = root.nodes[root.nodes.length - 1].len;
    if (total < 0.05) continue;

    for (let ni = 2; ni < root.nodes.length; ni++) {
      const node = root.nodes[ni];
      const t = total > 0 ? node.len / total : 0;

      // Bell-curve density
      const density = Math.exp(-Math.pow((t - 0.4) / 0.35, 2));
      const depthBonus = 1 + root.depth * 0.3;

      if (Math.random() > 0.55 * density * depthBonus) continue;

      // Cluster: 1–4 leaves per node
      const clusterSize = 1 + Math.floor(Math.random() * 3 * density);

      for (let ci = 0; ci < clusterSize; ci++) {
        const scatter = vscl(vrand(), 0.025 + Math.random() * 0.02);
        const lp = vadd(node.p, scatter);

        // Orientation: face AWAY from the wall
        const a = node.sadh;
        const al = vlen(a);

        let outward: any;
        if (al > 0.01) {
          outward = new THREE.Vector3(-a.x, -a.y, -a.z).normalize();
        } else {
          outward = new THREE.Vector3(
            (Math.random() - 0.5),
            0.3 + Math.random() * 0.4,
            (Math.random() - 0.5)
          ).normalize();
        }

        // Quaternion: rotate default normal (0,0,1) → outward
        const q = new THREE.Quaternion();
        const dot = defNorm.dot(outward);
        if (dot < -0.999) {
          q.set(0, 1, 0, 0);
        } else {
          q.setFromUnitVectors(defNorm, outward);
        }

        // Random spin in leaf's own plane
        const spinQ = new THREE.Quaternion();
        spinQ.setFromAxisAngle(outward, Math.random() * Math.PI * 2);
        q.premultiply(spinQ);

        // Random tilt ±35°
        const tiltAxis = new THREE.Vector3(
          Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5
        ).normalize();
        const tiltQ = new THREE.Quaternion();
        tiltQ.setFromAxisAngle(tiltAxis, (Math.random() - 0.5) * 0.6);
        q.premultiply(tiltQ);

        const sizeW = 0.7 + density * 0.8;
        const s = sizeW * (0.6 + Math.random() * 0.7);

        leafData.push({
          p: lp,
          qx: q.x, qy: q.y, qz: q.z, qw: q.w,
          s,
        });
      }
    }
  }

  // ── Build leaf InstancedMesh ──
  if (leafData.length > 0) {
    const mat = makeVegMat({
      color: 0xffffff,
      side: THREE.FrontSide,   // ← Half the fragment work vs DoubleSide
      roughness: 0.82,
    });
    const mesh = new THREE.InstancedMesh(leafGeo, mat, leafData.length);
    mesh.castShadow = true;

    const obj = new THREE.Object3D();
    for (let i = 0; i < leafData.length; i++) {
      const l = leafData[i];
      obj.position.set(l.p.x, l.p.y, l.p.z);
      obj.quaternion.set(l.qx, l.qy, l.qz, l.qw);
      obj.scale.setScalar(l.s);
      obj.updateMatrix();
      mesh.setMatrixAt(i, obj.matrix);

      const c = new THREE.Color();
      c.setHSL(
        0.24 + Math.random() * 0.1,
        0.45 + Math.random() * 0.35,
        0.18 + Math.random() * 0.18
      );
      mesh.setColorAt(i, c);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
  }

  // ── Collect branch segments ──
  const segs: { from: V; to: V; r: number }[] = [];

  for (const root of roots) {
    if (root.nodes.length < 2) continue;
    const total = root.nodes[root.nodes.length - 1].len;
    const baseDiam = 1 / (root.depth + 1) + 1;

    for (let i = 0; i < root.nodes.length - 1; i++) {
      const w = total > 0.01 ? root.nodes[i].len / total : 0;
      segs.push({
        from: root.nodes[i].p,
        to: root.nodes[i + 1].p,
        r: baseDiam * 0.007 * (1.3 - w),
      });
    }
  }

  // ── Build branch InstancedMesh ──
  if (segs.length > 0) {
    // Triangular cross-section, no caps, open-ended → 6 tris instead of ~16
    const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 3, 1, true);
    const brMat = makeVegMat({
      color: 0x3d2b1f,
      roughness: 0.9,
      metalness: 0.05,
    });
    const brMesh = new THREE.InstancedMesh(cylGeo, brMat, segs.length);
    brMesh.castShadow = true;

    const up = new THREE.Vector3(0, 1, 0);
    const tmpObj = new THREE.Object3D();

    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const mid = vscl(vadd(s.from, s.to), 0.5);
      const dir = vsub(s.to, s.from);
      const len = vlen(dir);

      if (len < 0.001) {
        tmpObj.position.set(mid.x, mid.y, mid.z);
        tmpObj.scale.set(0, 0, 0);
        tmpObj.updateMatrix();
        brMesh.setMatrixAt(i, tmpObj.matrix);
        continue;
      }

      tmpObj.position.set(mid.x, mid.y, mid.z);
      const d = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();

      if (d.y < -0.999) {
        tmpObj.quaternion.set(1, 0, 0, 0);
      } else {
        tmpObj.quaternion.setFromUnitVectors(up, d);
      }

      tmpObj.scale.set(s.r, len, s.r);
      tmpObj.updateMatrix();
      brMesh.setMatrixAt(i, tmpObj.matrix);

      const c = new THREE.Color();
      c.setHSL(
        0.08 + Math.random() * 0.04,
        0.3 + Math.random() * 0.15,
        0.15 + Math.random() * 0.08
      );
      brMesh.setColorAt(i, c);
    }

    brMesh.instanceMatrix.needsUpdate = true;
    if (brMesh.instanceColor) brMesh.instanceColor.needsUpdate = true;
    scene.add(brMesh);
  }
}

// ═════════════════════════════════════════════════════════════════
//  Menu scene cache
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
// ═════════════════════════════════════════════════════════════════

interface GrassPos { x: number; z: number; ry: number; s: number; }

function computeGrassPositions(maze: number[][], mazeW: number, mazeH: number): GrassPos[] {
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

function buildGrassMeshes(positions: GrassPos[], scene: any): void {
  if (positions.length === 0) return;

  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array([-0.02, 0, 0, 0.02, 0, 0, 0, 0.12, 0]);
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.computeVertexNormals();

  // Keep DoubleSide for grass — each blade is 1 triangle, overhead is negligible
  const mat = makeVegMat({
    color: 0xffffff,
    side: THREE.DoubleSide,
    roughness: 0.9,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, positions.length);
  const obj = new THREE.Object3D();
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    obj.position.set(p.x, 0.01, p.z);
    obj.rotation.set(0, p.ry, 0);
    obj.scale.setScalar(p.s);
    obj.updateMatrix();
    mesh.setMatrixAt(i, obj.matrix);

    const c = new THREE.Color();
    c.setHSL(
      0.25 + Math.random() * 0.08,
      0.5 + Math.random() * 0.25,
      0.2 + Math.random() * 0.12
    );
    mesh.setColorAt(i, c);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
}

export function addGrass(
  scene: any, maze: number[][], mazeW: number, mazeH: number
): void {
  const positions = computeGrassPositions(maze, mazeW, mazeH);
  buildGrassMeshes(positions, scene);
}

let cachedMenuGrass: GrassPos[] | null = null;

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
// ═══════════════════════════════════════════════════════════════════

function seedRootsInRegion(
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

/** Build ivy meshes from roots and return them (does NOT add to scene) */
export function buildIvyMeshesReturn(roots: any[]): any[] {
  const meshes: any[] = [];
  if (roots.length === 0) return meshes;

  const leafGeo = new THREE.PlaneGeometry(0.1, 0.14);
  const leafData: { p: V; qx: number; qy: number; qz: number; qw: number; s: number }[] = [];
  const defNorm = new THREE.Vector3(0, 0, 1);

  for (const root of roots) {
    if (root.nodes.length < 3) continue;
    const total = root.nodes[root.nodes.length - 1].len;
    if (total < 0.05) continue;

    for (let ni = 2; ni < root.nodes.length; ni++) {
      const node = root.nodes[ni];
      const t = total > 0 ? node.len / total : 0;
      const density = Math.exp(-Math.pow((t - 0.4) / 0.35, 2));
      const depthBonus = 1 + root.depth * 0.3;
      if (Math.random() > 0.55 * density * depthBonus) continue;
      const clusterSize = 1 + Math.floor(Math.random() * 3 * density);

      for (let ci = 0; ci < clusterSize; ci++) {
        const scatter = vscl(vrand(), 0.025 + Math.random() * 0.02);
        const lp = vadd(node.p, scatter);
        const a = node.sadh;
        const al = vlen(a);
        let outward: any;
        if (al > 0.01) {
          outward = new THREE.Vector3(-a.x, -a.y, -a.z).normalize();
        } else {
          outward = new THREE.Vector3(
            (Math.random() - 0.5), 0.3 + Math.random() * 0.4, (Math.random() - 0.5)
          ).normalize();
        }
        const q = new THREE.Quaternion();
        const dot = defNorm.dot(outward);
        if (dot < -0.999) q.set(0, 1, 0, 0);
        else q.setFromUnitVectors(defNorm, outward);
        const spinQ = new THREE.Quaternion();
        spinQ.setFromAxisAngle(outward, Math.random() * Math.PI * 2);
        q.premultiply(spinQ);
        const tiltAxis = new THREE.Vector3(
          Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5
        ).normalize();
        const tiltQ = new THREE.Quaternion();
        tiltQ.setFromAxisAngle(tiltAxis, (Math.random() - 0.5) * 0.6);
        q.premultiply(tiltQ);
        const sizeW = 0.7 + density * 0.8;
        const s = sizeW * (0.6 + Math.random() * 0.7);
        leafData.push({ p: lp, qx: q.x, qy: q.y, qz: q.z, qw: q.w, s });
      }
    }
  }

  if (leafData.length > 0) {
    const mat = makeVegMat({
      color: 0xffffff, side: THREE.FrontSide, roughness: 0.82,
    });
    const mesh = new THREE.InstancedMesh(leafGeo, mat, leafData.length);
    mesh.castShadow = true;
    const obj = new THREE.Object3D();
    for (let i = 0; i < leafData.length; i++) {
      const l = leafData[i];
      obj.position.set(l.p.x, l.p.y, l.p.z);
      obj.quaternion.set(l.qx, l.qy, l.qz, l.qw);
      obj.scale.setScalar(l.s);
      obj.updateMatrix();
      mesh.setMatrixAt(i, obj.matrix);
      const c = new THREE.Color();
      c.setHSL(0.24 + Math.random() * 0.1, 0.45 + Math.random() * 0.35, 0.18 + Math.random() * 0.18);
      mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    meshes.push(mesh);
  }

  // ── Branch segments ──
  const segs: { from: V; to: V; r: number }[] = [];
  for (const root of roots) {
    if (root.nodes.length < 2) continue;
    const total = root.nodes[root.nodes.length - 1].len;
    const baseDiam = 1 / (root.depth + 1) + 1;
    for (let i = 0; i < root.nodes.length - 1; i++) {
      const w = total > 0.01 ? root.nodes[i].len / total : 0;
      segs.push({ from: root.nodes[i].p, to: root.nodes[i + 1].p, r: baseDiam * 0.007 * (1.3 - w) });
    }
  }

  if (segs.length > 0) {
    const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 3, 1, true);
    const brMat = makeVegMat({ color: 0x3d2b1f, roughness: 0.9, metalness: 0.05 });
    const brMesh = new THREE.InstancedMesh(cylGeo, brMat, segs.length);
    brMesh.castShadow = true;
    const up = new THREE.Vector3(0, 1, 0);
    const tmpObj = new THREE.Object3D();
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const mid = vscl(vadd(s.from, s.to), 0.5);
      const dir = vsub(s.to, s.from);
      const len = vlen(dir);
      if (len < 0.001) {
        tmpObj.position.set(mid.x, mid.y, mid.z);
        tmpObj.scale.set(0, 0, 0);
        tmpObj.updateMatrix();
        brMesh.setMatrixAt(i, tmpObj.matrix);
        continue;
      }
      tmpObj.position.set(mid.x, mid.y, mid.z);
      const d = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
      if (d.y < -0.999) tmpObj.quaternion.set(1, 0, 0, 0);
      else tmpObj.quaternion.setFromUnitVectors(up, d);
      tmpObj.scale.set(s.r, len, s.r);
      tmpObj.updateMatrix();
      brMesh.setMatrixAt(i, tmpObj.matrix);
      const c = new THREE.Color();
      c.setHSL(0.08 + Math.random() * 0.04, 0.3 + Math.random() * 0.15, 0.15 + Math.random() * 0.08);
      brMesh.setColorAt(i, c);
    }
    brMesh.instanceMatrix.needsUpdate = true;
    if (brMesh.instanceColor) brMesh.instanceColor.needsUpdate = true;
    meshes.push(brMesh);
  }

  return meshes;
}

/** Build scatter leaves for a chunk region — Zone 2 cheap vegetation */
export function buildScatterLeavesReturn(
  maze: number[][], mW: number, mH: number, wH: number,
  sx: number, sz: number, ex: number, ez: number
): any | null {
  const instances: { x: number; y: number; z: number; nx: number; nz: number }[] = [];

  for (let z = sz; z < ez; z++) {
    for (let x = sx; x < ex; x++) {
      if (maze[z][x] !== 1) continue;
      const faces: { nx: number; nz: number }[] = [];
      if (x + 1 < mW && maze[z][x + 1] === 0) faces.push({ nx: 1, nz: 0 });
      if (x - 1 >= 0 && maze[z][x - 1] === 0) faces.push({ nx: -1, nz: 0 });
      if (z + 1 < mH && maze[z + 1][x] === 0) faces.push({ nx: 0, nz: 1 });
      if (z - 1 >= 0 && maze[z - 1][x] === 0) faces.push({ nx: 0, nz: -1 });

      for (const face of faces) {
        const count = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < count; i++) {
          const fy = 0.1 + Math.random() * (wH - 0.2);
          let fx: number, fz: number;
          if (face.nx !== 0) {
            fx = x + face.nx * 0.56;
            fz = z + (Math.random() - 0.5) * 0.9;
          } else {
            fx = x + (Math.random() - 0.5) * 0.9;
            fz = z + face.nz * 0.56;
          }
          instances.push({ x: fx, y: fy, z: fz, nx: face.nx, nz: face.nz });
        }
      }
    }
  }

  if (instances.length === 0) return null;

  const leafGeo = new THREE.PlaneGeometry(0.1, 0.14);
  const mat = makeVegMat({
    color: 0xffffff, side: THREE.FrontSide, roughness: 0.82,
  });
  const mesh = new THREE.InstancedMesh(leafGeo, mat, instances.length);
  const obj = new THREE.Object3D();
  const defNorm = new THREE.Vector3(0, 0, 1);

  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i];
    obj.position.set(inst.x, inst.y, inst.z);

    const outward = new THREE.Vector3(inst.nx, 0, inst.nz);
    if (outward.lengthSq() < 0.01) outward.set(0, 1, 0);
    outward.normalize();

    const q = new THREE.Quaternion();
    q.setFromUnitVectors(defNorm, outward);
    const spinQ = new THREE.Quaternion();
    spinQ.setFromAxisAngle(outward, Math.random() * Math.PI * 2);
    q.premultiply(spinQ);
    const tiltAxis = new THREE.Vector3(
      Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5
    ).normalize();
    const tiltQ = new THREE.Quaternion();
    tiltQ.setFromAxisAngle(tiltAxis, (Math.random() - 0.5) * 0.7);
    q.premultiply(tiltQ);

    obj.quaternion.copy(q);
    obj.scale.setScalar(0.6 + Math.random() * 0.8);
    obj.updateMatrix();
    mesh.setMatrixAt(i, obj.matrix);

    const c = new THREE.Color();
    c.setHSL(0.24 + Math.random() * 0.1, 0.4 + Math.random() * 0.3, 0.18 + Math.random() * 0.15);
    mesh.setColorAt(i, c);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

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

export interface DirectionalMeshGroup {
  top: any[];      // above wall height — always visible
  posX: any[];     // east-facing walls — visible when camera east
  negX: any[];     // west-facing walls
  posZ: any[];     // south-facing walls
  negZ: any[];     // north-facing walls
}

type FaceDir = 'top' | 'posX' | 'negX' | 'posZ' | 'negZ';
const FACE_DIRS: FaceDir[] = ['top', 'posX', 'negX', 'posZ', 'negZ'];

function classifyFace(p: V, adh: V, wallHeight: number): FaceDir {
  if (p.y > wallHeight * 0.8) return 'top';
  const ax = Math.abs(adh.x);
  const az = Math.abs(adh.z);
  if (ax < 0.01 && az < 0.01) return 'top';
  // adh points toward wall → outward (face normal) is opposite
  if (ax >= az) return adh.x > 0 ? 'negX' : 'posX';
  return adh.z > 0 ? 'negZ' : 'posZ';
}

function emptyDirGroup(): DirectionalMeshGroup {
  return { top: [], posX: [], negX: [], posZ: [], negZ: [] };
}

/** Build directional ivy meshes from simulated roots — returns 5 mesh groups */
export function buildIvyMeshesDirectional(roots: any[], wallHeight: number): DirectionalMeshGroup {
  const result = emptyDirGroup();
  if (roots.length === 0) return result;

  // ── Collect and classify leaf instances ──
  type LI = { p: V; qx: number; qy: number; qz: number; qw: number; s: number };
  const leafBuckets: Record<FaceDir, LI[]> = { top: [], posX: [], negX: [], posZ: [], negZ: [] };
  const defNorm = new THREE.Vector3(0, 0, 1);

  for (const root of roots) {
    if (root.nodes.length < 3) continue;
    const total = root.nodes[root.nodes.length - 1].len;
    if (total < 0.05) continue;
    for (let ni = 2; ni < root.nodes.length; ni++) {
      const node = root.nodes[ni];
      const t = total > 0 ? node.len / total : 0;
      const density = Math.exp(-Math.pow((t - 0.4) / 0.35, 2));
      const depthBonus = 1 + root.depth * 0.3;
      if (Math.random() > 0.55 * density * depthBonus) continue;
      const clusterSize = 1 + Math.floor(Math.random() * 3 * density);
      const fdir = classifyFace(node.p, node.adh, wallHeight);
      for (let ci = 0; ci < clusterSize; ci++) {
        const scatter = vscl(vrand(), 0.025 + Math.random() * 0.02);
        const lp = vadd(node.p, scatter);
        const a = node.sadh;
        const al = vlen(a);
        let outward: any;
        if (al > 0.01) {
          outward = new THREE.Vector3(-a.x, -a.y, -a.z).normalize();
        } else {
          outward = new THREE.Vector3(
            (Math.random() - 0.5), 0.3 + Math.random() * 0.4, (Math.random() - 0.5)
          ).normalize();
        }
        const q = new THREE.Quaternion();
        const dot = defNorm.dot(outward);
        if (dot < -0.999) q.set(0, 1, 0, 0);
        else q.setFromUnitVectors(defNorm, outward);
        const spinQ = new THREE.Quaternion();
        spinQ.setFromAxisAngle(outward, Math.random() * Math.PI * 2);
        q.premultiply(spinQ);
        const tiltAxis = new THREE.Vector3(
          Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5
        ).normalize();
        const tiltQ = new THREE.Quaternion();
        tiltQ.setFromAxisAngle(tiltAxis, (Math.random() - 0.5) * 0.6);
        q.premultiply(tiltQ);
        const sizeW = 0.7 + density * 0.8;
        const s = sizeW * (0.6 + Math.random() * 0.7);
        leafBuckets[fdir].push({ p: lp, qx: q.x, qy: q.y, qz: q.z, qw: q.w, s });
      }
    }
  }

  // ── Collect and classify branch segments ──
  type BS = { from: V; to: V; r: number };
  const branchBuckets: Record<FaceDir, BS[]> = { top: [], posX: [], negX: [], posZ: [], negZ: [] };

  for (const root of roots) {
    if (root.nodes.length < 2) continue;
    const total = root.nodes[root.nodes.length - 1].len;
    const baseDiam = 1 / (root.depth + 1) + 1;
    for (let i = 0; i < root.nodes.length - 1; i++) {
      const node = root.nodes[i];
      const mid = vscl(vadd(node.p, root.nodes[i + 1].p), 0.5);
      const w = total > 0.01 ? node.len / total : 0;
      const fdir = classifyFace(mid, node.adh, wallHeight);
      branchBuckets[fdir].push({
        from: node.p,
        to: root.nodes[i + 1].p,
        r: baseDiam * 0.007 * (1.3 - w),
      });
    }
  }

  // ── Build meshes per direction ──
  const leafGeo = new THREE.PlaneGeometry(0.1, 0.14);
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 3, 1, true);

  for (const dir of FACE_DIRS) {
    const ld = leafBuckets[dir];
    if (ld.length > 0) {
      const mat = makeVegMat({
        color: 0xffffff, side: THREE.FrontSide, roughness: 0.82,
      });
      const mesh = new THREE.InstancedMesh(leafGeo, mat, ld.length);
      mesh.castShadow = true;
      const obj = new THREE.Object3D();
      for (let i = 0; i < ld.length; i++) {
        const l = ld[i];
        obj.position.set(l.p.x, l.p.y, l.p.z);
        obj.quaternion.set(l.qx, l.qy, l.qz, l.qw);
        obj.scale.setScalar(l.s);
        obj.updateMatrix();
        mesh.setMatrixAt(i, obj.matrix);
        const c = new THREE.Color();
        c.setHSL(0.24 + Math.random() * 0.1, 0.45 + Math.random() * 0.35, 0.18 + Math.random() * 0.18);
        mesh.setColorAt(i, c);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      result[dir].push(mesh);
    }

    const bd = branchBuckets[dir];
    if (bd.length > 0) {
      const brMat = makeVegMat({ color: 0x3d2b1f, roughness: 0.9, metalness: 0.05 });
      const brMesh = new THREE.InstancedMesh(cylGeo, brMat, bd.length);
      brMesh.castShadow = true;
      const up = new THREE.Vector3(0, 1, 0);
      const tmpObj = new THREE.Object3D();
      for (let i = 0; i < bd.length; i++) {
        const seg = bd[i];
        const mid = vscl(vadd(seg.from, seg.to), 0.5);
        const bdir = vsub(seg.to, seg.from);
        const len = vlen(bdir);
        if (len < 0.001) {
          tmpObj.position.set(mid.x, mid.y, mid.z);
          tmpObj.scale.set(0, 0, 0);
          tmpObj.updateMatrix();
          brMesh.setMatrixAt(i, tmpObj.matrix);
          continue;
        }
        tmpObj.position.set(mid.x, mid.y, mid.z);
        const d = new THREE.Vector3(bdir.x, bdir.y, bdir.z).normalize();
        if (d.y < -0.999) tmpObj.quaternion.set(1, 0, 0, 0);
        else tmpObj.quaternion.setFromUnitVectors(up, d);
        tmpObj.scale.set(seg.r, len, seg.r);
        tmpObj.updateMatrix();
        brMesh.setMatrixAt(i, tmpObj.matrix);
        const c = new THREE.Color();
        c.setHSL(0.08 + Math.random() * 0.04, 0.3 + Math.random() * 0.15, 0.15 + Math.random() * 0.08);
        brMesh.setColorAt(i, c);
      }
      brMesh.instanceMatrix.needsUpdate = true;
      if (brMesh.instanceColor) brMesh.instanceColor.needsUpdate = true;
      result[dir].push(brMesh);
    }
  }

  return result;
}

/** Build directional scatter leaves for Zone 2 (colossal) */
export function buildScatterLeavesDirectional(
  maze: number[][], mW: number, mH: number, wH: number,
  sx: number, sz: number, ex: number, ez: number
): DirectionalMeshGroup {
  const result = emptyDirGroup();
  const buckets: Record<FaceDir, { x: number; y: number; z: number; nx: number; nz: number }[]> =
    { top: [], posX: [], negX: [], posZ: [], negZ: [] };

  for (let z = sz; z < ez; z++) {
    for (let x = sx; x < ex; x++) {
      if (maze[z][x] !== 1) continue;
      const faces: { nx: number; nz: number }[] = [];
      if (x + 1 < mW && maze[z][x + 1] === 0) faces.push({ nx: 1, nz: 0 });
      if (x - 1 >= 0 && maze[z][x - 1] === 0) faces.push({ nx: -1, nz: 0 });
      if (z + 1 < mH && maze[z + 1][x] === 0) faces.push({ nx: 0, nz: 1 });
      if (z - 1 >= 0 && maze[z - 1][x] === 0) faces.push({ nx: 0, nz: -1 });

      for (const face of faces) {
        const count = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < count; i++) {
          const fy = 0.1 + Math.random() * (wH - 0.2);
          let fx: number, fz: number;
          if (face.nx !== 0) {
            fx = x + face.nx * 0.56;
            fz = z + (Math.random() - 0.5) * 0.9;
          } else {
            fx = x + (Math.random() - 0.5) * 0.9;
            fz = z + face.nz * 0.56;
          }
          let fdir: FaceDir;
          if (fy > wH * 0.8) fdir = 'top';
          else if (face.nx === 1) fdir = 'posX';
          else if (face.nx === -1) fdir = 'negX';
          else if (face.nz === 1) fdir = 'posZ';
          else fdir = 'negZ';
          buckets[fdir].push({ x: fx, y: fy, z: fz, nx: face.nx, nz: face.nz });
        }
      }
    }
  }

  const leafGeo = new THREE.PlaneGeometry(0.1, 0.14);
  const defNorm = new THREE.Vector3(0, 0, 1);

  for (const dir of FACE_DIRS) {
    const instances = buckets[dir];
    if (instances.length === 0) continue;
    const mat = makeVegMat({
      color: 0xffffff, side: THREE.FrontSide, roughness: 0.82,
    });
    const mesh = new THREE.InstancedMesh(leafGeo, mat, instances.length);
    const obj = new THREE.Object3D();
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      obj.position.set(inst.x, inst.y, inst.z);
      const outward = new THREE.Vector3(inst.nx, 0, inst.nz);
      if (outward.lengthSq() < 0.01) outward.set(0, 1, 0);
      outward.normalize();
      const q = new THREE.Quaternion();
      q.setFromUnitVectors(defNorm, outward);
      const spinQ = new THREE.Quaternion();
      spinQ.setFromAxisAngle(outward, Math.random() * Math.PI * 2);
      q.premultiply(spinQ);
      const tiltAxis = new THREE.Vector3(
        Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5
      ).normalize();
      const tiltQ = new THREE.Quaternion();
      tiltQ.setFromAxisAngle(tiltAxis, (Math.random() - 0.5) * 0.7);
      q.premultiply(tiltQ);
      obj.quaternion.copy(q);
      obj.scale.setScalar(0.6 + Math.random() * 0.8);
      obj.updateMatrix();
      mesh.setMatrixAt(i, obj.matrix);
      const c = new THREE.Color();
      c.setHSL(0.24 + Math.random() * 0.1, 0.4 + Math.random() * 0.3, 0.18 + Math.random() * 0.15);
      mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    result[dir].push(mesh);
  }

  return result;
}

/** Build grass mesh and return it (does NOT add to scene) */
export function buildGrassMeshReturn(positions: GrassPos[]): any | null {
  if (positions.length === 0) return null;

  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array([-0.02, 0, 0, 0.02, 0, 0, 0, 0.12, 0]);
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.computeVertexNormals();

  const mat = makeVegMat({
    color: 0xffffff, side: THREE.DoubleSide, roughness: 0.9,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, positions.length);
  const obj = new THREE.Object3D();
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    obj.position.set(p.x, 0.01, p.z);
    obj.rotation.set(0, p.ry, 0);
    obj.scale.setScalar(p.s);
    obj.updateMatrix();
    mesh.setMatrixAt(i, obj.matrix);
    const c = new THREE.Color();
    c.setHSL(0.25 + Math.random() * 0.08, 0.5 + Math.random() * 0.25, 0.2 + Math.random() * 0.12);
    mesh.setColorAt(i, c);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}
