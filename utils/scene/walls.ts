declare const THREE: any;
import { CHUNK_SIZE } from './constants';
import type { WallGeoResult, WallData, ChunkWallData } from './types';
import { computeHeightGrid } from './heightGrid';
import { createStoneWallTexture } from '../textures';

export function createWallMaterial(uBallPos: { value: any }): any {
  const wallTex = createStoneWallTexture();
  const mat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85, metalness: 0.05 });

  mat.onBeforeCompile = (shader: any) => {
    shader.uniforms.uBallPos = uBallPos;
    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      'attribute float instanceAlpha;\nvarying float vInstanceAlpha;\nvarying vec3 vWallWorldPos;\nvarying vec3 vWallWorldNormal;\nvoid main() {\nvInstanceAlpha = instanceAlpha;'
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvWallWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;\nvWallWorldNormal = normal;'
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      'uniform vec3 uBallPos;\nvarying float vInstanceAlpha;\nvarying vec3 vWallWorldPos;\nvarying vec3 vWallWorldNormal;\nvoid main() {'
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
      if (vInstanceAlpha < 0.99) {
        vec3 faceN = normalize(vWallWorldNormal);
        bool isVerticalFace = abs(faceN.y) < 0.3;
        bool skipDissolve = false;
        if (isVerticalFace) {
          vec3 toBall = normalize(uBallPos - vWallWorldPos);
          vec3 toCam = normalize(cameraPosition - vWallWorldPos);
          float distToBall = length(vWallWorldPos - uBallPos);
          if (dot(faceN, toBall) > 0.0 && dot(faceN, toCam) > 0.0 && distToBall < 3.5) {
            skipDissolve = true;
          }
        }
        if (!skipDissolve) {
          vec3 rayVec = uBallPos - cameraPosition;
          float rayLen = length(rayVec);
          vec3 rayDir = rayVec / max(rayLen, 0.001);
          float t = dot(vWallWorldPos - cameraPosition, rayDir);
          vec3 closest = cameraPosition + rayDir * clamp(t, 0.0, rayLen);
          float dist = length(vWallWorldPos - closest);
          float coreR = 0.25;
          float edgeR = 0.85;
          if (dist < coreR) {
            discard;
          } else if (dist < edgeR) {
            float dissolve = 1.0 - smoothstep(coreR, edgeR, dist);
            float pattern = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
            if (pattern < dissolve) discard;
          }
        }
      }`
    );
  };

  return mat;
}

// ─── Shared wall geometry builder (works on a region of the maze grid) ───
export function buildWallGeometry(
  maze: number[][], heightGrid: number[][],
  startX: number, startZ: number, endX: number, endZ: number,
  mazeW: number, mazeH: number
): WallGeoResult | null {
  // Count walls in region
  let wallCount = 0;
  for (let z = startZ; z < endZ; z++) {
    for (let x = startX; x < endX; x++) {
      if (maze[z][x] === 1) wallCount++;
    }
  }
  if (wallCount === 0) return null;

  const maxVerts = wallCount * 30;
  const posArr = new Float32Array(maxVerts * 3);
  const normArr = new Float32Array(maxVerts * 3);
  const uvArr = new Float32Array(maxVerts * 2);
  const positions = new Float32Array(wallCount * 2);
  const alphaArray = new Float32Array(wallCount).fill(1.0);
  const wallVStart = new Int32Array(wallCount);
  const wallVEnd = new Int32Array(wallCount);

  let vi = 0;
  let wIdx = 0;

  function addQuad(
    p0: number[], p1: number[], p2: number[], p3: number[],
    n: number[],
    vStart: number = 0
  ) {
    const verts = [p0, p1, p2, p0, p2, p3];
    const uvs = [[0,vStart],[0,1],[1,1],[0,vStart],[1,1],[1,vStart]];
    for (let k = 0; k < 6; k++) {
      posArr[vi * 3]     = verts[k][0];
      posArr[vi * 3 + 1] = verts[k][1];
      posArr[vi * 3 + 2] = verts[k][2];
      normArr[vi * 3]     = n[0];
      normArr[vi * 3 + 1] = n[1];
      normArr[vi * 3 + 2] = n[2];
      uvArr[vi * 2]     = uvs[k][0];
      uvArr[vi * 2 + 1] = uvs[k][1];
      vi++;
    }
  }

  for (let z = startZ; z < endZ; z++) {
    for (let x = startX; x < endX; x++) {
      if (maze[z][x] !== 1) continue;
      const h = heightGrid[z][x];
      positions[wIdx * 2] = x;
      positions[wIdx * 2 + 1] = z;
      wallVStart[wIdx] = vi;

      const x0 = x - 0.5, x1 = x + 0.5;
      const z0 = z - 0.5, z1 = z + 0.5;

      // +X face
      if (x + 1 >= mazeW || maze[z][x + 1] !== 1) {
        addQuad([x1,0,z0],[x1,h,z0],[x1,h,z1],[x1,0,z1], [1,0,0]);
      } else {
        const nh = heightGrid[z][x + 1];
        if (h > nh) addQuad([x1,nh,z0],[x1,h,z0],[x1,h,z1],[x1,nh,z1], [1,0,0], nh / h);
      }
      // -X face
      if (x - 1 < 0 || maze[z][x - 1] !== 1) {
        addQuad([x0,0,z1],[x0,h,z1],[x0,h,z0],[x0,0,z0], [-1,0,0]);
      } else {
        const nh = heightGrid[z][x - 1];
        if (h > nh) addQuad([x0,nh,z1],[x0,h,z1],[x0,h,z0],[x0,nh,z0], [-1,0,0], nh / h);
      }
      // +Z face
      if (z + 1 >= mazeH || maze[z + 1][x] !== 1) {
        addQuad([x1,0,z1],[x1,h,z1],[x0,h,z1],[x0,0,z1], [0,0,1]);
      } else {
        const nh = heightGrid[z + 1][x];
        if (h > nh) addQuad([x1,nh,z1],[x1,h,z1],[x0,h,z1],[x0,nh,z1], [0,0,1], nh / h);
      }
      // -Z face
      if (z - 1 < 0 || maze[z - 1][x] !== 1) {
        addQuad([x0,0,z0],[x0,h,z0],[x1,h,z0],[x1,0,z0], [0,0,-1]);
      } else {
        const nh = heightGrid[z - 1][x];
        if (h > nh) addQuad([x0,nh,z0],[x0,h,z0],[x1,h,z0],[x1,nh,z0], [0,0,-1], nh / h);
      }
      // Top face
      addQuad([x0,h,z0],[x0,h,z1],[x1,h,z1],[x1,h,z0], [0,1,0]);

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

      // Capture closure variables for syncAlpha
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
