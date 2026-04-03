declare const THREE: any;
import { CHUNK_SIZE } from './constants';
import type { WallGeoResult, WallData, ChunkWallData } from './types';
import { computeHeightGrid } from './heightGrid';
import { createPBRWallTextures, PBRTextureSet } from '../textures';
import { dissolveFragment } from '../shaders/dissolveGLSL';

// ─── Constants ───
const VARIANT_COUNT = 4;
const SUB_SEGS = 8;            // subdivisions per quad axis (8×8 = 64 sub-quads per face)
const DISPLACEMENT_SCALE = 0.15; // matches the PBR visualizer default
const DISPLACEMENT_BIAS = 0;
const LOD_NEAR = 8.0;          // full displacement within this distance
const LOD_FAR = 30.0;          // zero displacement beyond this distance

// Shared PBR textures (generated once, reused across all materials)
let _pbrTextures: PBRTextureSet | null = null;
function getPBRTextures(): PBRTextureSet {
  if (!_pbrTextures) _pbrTextures = createPBRWallTextures();
  return _pbrTextures;
}

// ─── Atlas UV helpers ───
// Atlas layout: 2×2 grid of 512px tiles in 1024px atlas
// Variant 0 = top-left, 1 = top-right, 2 = bottom-left, 3 = bottom-right
function variantUVOffset(variant: number): [number, number] {
  return [(variant % 2) * 0.5, Math.floor(variant / 2) * 0.5];
}

// ─── Wall PBR material with displacement LOD + dissolve ───
export function createWallMaterial(uBallPos: { value: any }): any {
  const pbr = getPBRTextures();
  const mat = new THREE.MeshStandardMaterial({
    map: pbr.diffuse,
    normalMap: pbr.normal,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughnessMap: pbr.roughness,
    roughness: 1.0,       // modulated by roughnessMap
    metalness: 0.0,
    displacementMap: pbr.height,
    displacementScale: DISPLACEMENT_SCALE,
    displacementBias: DISPLACEMENT_BIAS,
  });

  mat.onBeforeCompile = (shader: any) => {
    shader.uniforms.uBallPos = uBallPos;
    shader.uniforms.uLodNear = { value: LOD_NEAR };
    shader.uniforms.uLodFar = { value: LOD_FAR };

    // ── Vertex shader modifications ──
    // 1. Add attributes & varyings
    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      `attribute float instanceAlpha;
varying float vInstanceAlpha;
varying vec3 vWallWorldPos;
varying vec3 vWallWorldNormal;
uniform float uLodNear;
uniform float uLodFar;
void main() {
  vInstanceAlpha = instanceAlpha;`
    );

    // 2. Capture world position & normal after standard transforms
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
vWallWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWallWorldNormal = normalize(normalMatrix * objectNormal);`
    );

    // 3. LOD displacement: fade out with distance from camera
    // Three.js r150 uses vUv for displacement sampling (vDisplacementMapUv is r152+)
    shader.vertexShader = shader.vertexShader.replace(
      '#include <displacementmap_vertex>',
      `#ifdef USE_DISPLACEMENTMAP
  float camDist = length((modelViewMatrix * vec4(transformed, 1.0)).xyz);
  float lodFade = 1.0 - smoothstep(uLodNear, uLodFar, camDist);
  transformed += normalize(objectNormal) * (texture2D(displacementMap, vUv).x * displacementScale * lodFade + displacementBias * lodFade);
#endif`
    );

    // ── Fragment shader modifications ──
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      `uniform vec3 uBallPos;
varying float vInstanceAlpha;
varying vec3 vWallWorldPos;
varying vec3 vWallWorldNormal;
void main() {`
    );

    // Add dissolve effect at the end
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>\n` + dissolveFragment({
        worldPos: 'vWallWorldPos',
        normalExpr: 'normalize(vWallWorldNormal)',
        coreR: 0.25,
        edgeR: 0.85,
        guard: 'vInstanceAlpha < 0.99'
      })
    );
  };

  return mat;
}

// ─── Subdivided quad builder ───
// Creates a SUB_SEGS × SUB_SEGS grid of triangles between 4 corner points.
// Corners: p0=bottom-left, p1=top-left, p2=top-right, p3=bottom-right
// UVs are mapped to the variant's atlas quadrant.
function addSubdividedQuad(
  posArr: Float32Array, normArr: Float32Array, uvArr: Float32Array,
  vi: number,
  p0: number[], p1: number[], p2: number[], p3: number[],
  n: number[],
  uOff: number, vOff: number,
  uFlip: boolean
): number {
  const S = SUB_SEGS;
  for (let iy = 0; iy < S; iy++) {
    for (let ix = 0; ix < S; ix++) {
      // Bilinear interpolation for each corner of this sub-quad
      const t0y = iy / S, t1y = (iy + 1) / S;
      const t0x = ix / S, t1x = (ix + 1) / S;

      // 4 corners of sub-quad via bilinear lerp of the 4 quad corners
      const corners = [
        lerpQuad(p0, p1, p2, p3, t0x, t0y), // BL
        lerpQuad(p0, p1, p2, p3, t0x, t1y), // TL
        lerpQuad(p0, p1, p2, p3, t1x, t1y), // TR
        lerpQuad(p0, p1, p2, p3, t1x, t0y), // BR
      ];

      // UV within variant quadrant (0.5 × 0.5 in atlas)
      let u0 = t0x, u1 = t1x, v0 = t0y, v1 = t1y;
      if (uFlip) { u0 = 1 - t1x; u1 = 1 - t0x; }

      const uvs = [
        [uOff + u0 * 0.5, vOff + v0 * 0.5],  // BL
        [uOff + u0 * 0.5, vOff + v1 * 0.5],  // TL
        [uOff + u1 * 0.5, vOff + v1 * 0.5],  // TR
        [uOff + u1 * 0.5, vOff + v0 * 0.5],  // BR
      ];

      // Two triangles: BL-TL-TR, BL-TR-BR
      const triIdx = [0, 1, 2, 0, 2, 3];
      for (const ti of triIdx) {
        posArr[vi * 3]     = corners[ti][0];
        posArr[vi * 3 + 1] = corners[ti][1];
        posArr[vi * 3 + 2] = corners[ti][2];
        normArr[vi * 3]     = n[0];
        normArr[vi * 3 + 1] = n[1];
        normArr[vi * 3 + 2] = n[2];
        uvArr[vi * 2]     = uvs[ti][0];
        uvArr[vi * 2 + 1] = uvs[ti][1];
        vi++;
      }
    }
  }
  return vi;
}

function lerpQuad(p0: number[], p1: number[], p2: number[], p3: number[], tx: number, ty: number): number[] {
  // p0=BL(0,0), p1=TL(0,1), p2=TR(1,1), p3=BR(1,0)
  const x = p0[0] * (1 - tx) * (1 - ty) + p3[0] * tx * (1 - ty) + p1[0] * (1 - tx) * ty + p2[0] * tx * ty;
  const y = p0[1] * (1 - tx) * (1 - ty) + p3[1] * tx * (1 - ty) + p1[1] * (1 - tx) * ty + p2[1] * tx * ty;
  const z = p0[2] * (1 - tx) * (1 - ty) + p3[2] * tx * (1 - ty) + p1[2] * (1 - tx) * ty + p2[2] * tx * ty;
  return [x, y, z];
}

// Verts per subdivided face: SUB_SEGS² × 6
const VERTS_PER_FACE = SUB_SEGS * SUB_SEGS * 6;

// ─── Shared wall geometry builder with PBR atlas UVs ───
export function buildWallGeometry(
  maze: number[][], heightGrid: number[][],
  startX: number, startZ: number, endX: number, endZ: number,
  mazeW: number, mazeH: number
): WallGeoResult | null {
  let wallCount = 0;
  for (let z = startZ; z < endZ; z++) {
    for (let x = startX; x < endX; x++) {
      if (maze[z][x] === 1) wallCount++;
    }
  }
  if (wallCount === 0) return null;

  // Max 5 faces per wall, each face = VERTS_PER_FACE vertices
  const maxVerts = wallCount * 5 * VERTS_PER_FACE;
  const posArr = new Float32Array(maxVerts * 3);
  const normArr = new Float32Array(maxVerts * 3);
  const uvArr = new Float32Array(maxVerts * 2);
  const positions = new Float32Array(wallCount * 2);
  const alphaArray = new Float32Array(wallCount).fill(1.0);
  const wallVStart = new Int32Array(wallCount);
  const wallVEnd = new Int32Array(wallCount);

  // Deterministic variant assignment per wall cell
  // Using a simple hash of (x, z) to get variant 0-3
  function wallVariant(x: number, z: number): number {
    return ((x * 73856093) ^ (z * 19349663)) & 3;
  }

  let vi = 0;
  let wIdx = 0;

  for (let z = startZ; z < endZ; z++) {
    for (let x = startX; x < endX; x++) {
      if (maze[z][x] !== 1) continue;
      const h = heightGrid[z][x];
      positions[wIdx * 2] = x;
      positions[wIdx * 2 + 1] = z;
      wallVStart[wIdx] = vi;

      const variant = wallVariant(x, z);
      const [uOff, vOff] = variantUVOffset(variant);

      const x0 = x - 0.5, x1 = x + 0.5;
      const z0 = z - 0.5, z1 = z + 0.5;

      // +X face (east wall)
      if (x + 1 >= mazeW || maze[z][x + 1] !== 1) {
        // BL, TL, TR, BR (looking at the face from outside)
        vi = addSubdividedQuad(posArr, normArr, uvArr, vi,
          [x1, 0, z0], [x1, h, z0], [x1, h, z1], [x1, 0, z1],
          [1, 0, 0], uOff, vOff, false);
      } else {
        const nh = heightGrid[z][x + 1];
        if (h > nh) {
          vi = addSubdividedQuad(posArr, normArr, uvArr, vi,
            [x1, nh, z0], [x1, h, z0], [x1, h, z1], [x1, nh, z1],
            [1, 0, 0], uOff, vOff, false);
        }
      }

      // -X face (west wall)
      if (x - 1 < 0 || maze[z][x - 1] !== 1) {
        vi = addSubdividedQuad(posArr, normArr, uvArr, vi,
          [x0, 0, z1], [x0, h, z1], [x0, h, z0], [x0, 0, z0],
          [-1, 0, 0], uOff, vOff, true);
      } else {
        const nh = heightGrid[z][x - 1];
        if (h > nh) {
          vi = addSubdividedQuad(posArr, normArr, uvArr, vi,
            [x0, nh, z1], [x0, h, z1], [x0, h, z0], [x0, nh, z0],
            [-1, 0, 0], uOff, vOff, true);
        }
      }

      // +Z face (south wall)
      if (z + 1 >= mazeH || maze[z + 1][x] !== 1) {
        vi = addSubdividedQuad(posArr, normArr, uvArr, vi,
          [x1, 0, z1], [x1, h, z1], [x0, h, z1], [x0, 0, z1],
          [0, 0, 1], uOff, vOff, true);
      } else {
        const nh = heightGrid[z + 1][x];
        if (h > nh) {
          vi = addSubdividedQuad(posArr, normArr, uvArr, vi,
            [x1, nh, z1], [x1, h, z1], [x0, h, z1], [x0, nh, z1],
            [0, 0, 1], uOff, vOff, true);
        }
      }

      // -Z face (north wall)
      if (z - 1 < 0 || maze[z - 1][x] !== 1) {
        vi = addSubdividedQuad(posArr, normArr, uvArr, vi,
          [x0, 0, z0], [x0, h, z0], [x1, h, z0], [x1, 0, z0],
          [0, 0, -1], uOff, vOff, false);
      } else {
        const nh = heightGrid[z - 1][x];
        if (h > nh) {
          vi = addSubdividedQuad(posArr, normArr, uvArr, vi,
            [x0, nh, z0], [x0, h, z0], [x1, h, z0], [x1, nh, z0],
            [0, 0, -1], uOff, vOff, false);
        }
      }

      // Top face — uses the same variant for visual coherence with sides
      vi = addSubdividedQuad(posArr, normArr, uvArr, vi,
        [x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0],
        [0, 1, 0], uOff, vOff, false);

      wallVEnd[wIdx] = vi;
      wIdx++;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posArr.slice(0, vi * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normArr.slice(0, vi * 3), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvArr.slice(0, vi * 2), 2));

  const vertexAlpha = new Float32Array(vi).fill(1.0);
  const alphaAttr = new THREE.BufferAttribute(vertexAlpha, 1);
  (alphaAttr as any).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('instanceAlpha', alphaAttr);

  return { geometry: geo, positions, alphaArray, wallVStart, wallVEnd, wallCount, alphaAttr };
}

// ─── Single mesh walls (tutorial / challenge) ───
export function buildWalls(
  scene: any, maze: number[][], mazeW: number, mazeH: number,
  uBallPos: { value: any }
): WallData {
  const heightGrid = computeHeightGrid(maze, mazeW, mazeH);
  const mat = createWallMaterial(uBallPos);
  const result = buildWallGeometry(maze, heightGrid, 0, 0, mazeW, mazeH, mazeW, mazeH)!;

  const mesh = new THREE.Mesh(result.geometry, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const syncAlpha = () => {
    const arr = result.alphaAttr.array as Float32Array;
    for (let i = 0; i < result.wallCount; i++) {
      const a = result.alphaArray[i];
      for (let v = result.wallVStart[i]; v < result.wallVEnd[i]; v++) arr[v] = a;
    }
    result.alphaAttr.needsUpdate = true;
  };

  return { positions: result.positions, alphaArray: result.alphaArray, count: result.wallCount, syncAlpha };
}

// ─── Chunked walls (colossal) ───
export function buildChunkedWalls(
  scene: any, maze: number[][], mazeW: number, mazeH: number,
  uBallPos: { value: any }
): ChunkWallData[] {
  const heightGrid = computeHeightGrid(maze, mazeW, mazeH);
  const mat = createWallMaterial(uBallPos);
  const chunks: ChunkWallData[] = [];

  for (let cz = 0; cz < mazeH; cz += CHUNK_SIZE) {
    for (let cx = 0; cx < mazeW; cx += CHUNK_SIZE) {
      const endX = Math.min(cx + CHUNK_SIZE, mazeW);
      const endZ = Math.min(cz + CHUNK_SIZE, mazeH);
      const result = buildWallGeometry(maze, heightGrid, cx, cz, endX, endZ, mazeW, mazeH);
      if (!result) continue;

      const mesh = new THREE.Mesh(result.geometry, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      const alphaAttr = result.alphaAttr;
      const aArr = result.alphaArray;
      const vs = result.wallVStart;
      const ve = result.wallVEnd;
      const wc = result.wallCount;

      chunks.push({
        mesh,
        positions: result.positions,
        alphaArray: result.alphaArray,
        count: result.wallCount,
        centerX: (cx + endX - 1) / 2,
        centerZ: (cz + endZ - 1) / 2,
        syncAlpha: () => {
          const arr = alphaAttr.array as Float32Array;
          for (let i = 0; i < wc; i++) {
            const a = aArr[i];
            for (let v = vs[i]; v < ve[i]; v++) arr[v] = a;
          }
          alphaAttr.needsUpdate = true;
        }
      });
    }
  }

  return chunks;
}

// ─── Laser: 3D cylinder dissolve from ball to camera ───
