declare const THREE: any;
import { V, vadd, vsub, vscl, vlen, vrand } from './vecMath';
import { makeVegMat } from './material';
import { _buildGrassIM } from './grassSystem';
import { GrassPos } from './grassPositioning';


export interface DirectionalMeshGroup {
  top: any[];      // above wall height — always visible
  posX: any[];     // east-facing walls — visible when camera east
  negX: any[];     // west-facing walls
  posZ: any[];     // south-facing walls
  negZ: any[];     // north-facing walls
}

export type FaceDir = 'top' | 'posX' | 'negX' | 'posZ' | 'negZ';
export const FACE_DIRS: FaceDir[] = ['top', 'posX', 'negX', 'posZ', 'negZ'];

export function classifyFace(p: V, adh: V, wallHeight: number): FaceDir {
  if (p.y > wallHeight * 0.8) return 'top';
  const ax = Math.abs(adh.x);
  const az = Math.abs(adh.z);
  if (ax < 0.01 && az < 0.01) return 'top';
  // adh points toward wall → outward (face normal) is opposite
  if (ax >= az) return adh.x > 0 ? 'negX' : 'posX';
  return adh.z > 0 ? 'negZ' : 'posZ';
}

export function emptyDirGroup(): DirectionalMeshGroup {
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
  return _buildGrassIM(positions);
}
