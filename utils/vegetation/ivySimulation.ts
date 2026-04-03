declare const THREE: any;
import { V, vadd, vsub, vscl, vlen, vrand } from './vecMath';
import type { IvyRoot } from './ivyTypes';
import { seedRoots, growStep, smoothAdhesion } from './ivyCore';
import { makeVegMat } from './material';


export function simulateIvy(
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

export function buildIvyMeshes(roots: IvyRoot[], scene: any): void {
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
