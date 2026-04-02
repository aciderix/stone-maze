declare const THREE: any;

import { GameState, MazeSizeConfig } from '../types';
import { generateMaze, getOpenCells } from './maze';
import { createStoneWallTexture, createFloorTexture, createBallTexture } from './textures';
import { addMenuIvy, simulateIvyForRegion, buildIvyMeshesDirectional, buildScatterLeavesDirectional, DirectionalMeshGroup } from './vegetation';
import { MENU_MAZE } from './menuMazeData';
import { setVegBallPos } from './vegetation';

// ─── Constants ───
const WALL_HEIGHT = 1.8;
const BALL_RADIUS = 0.25;
const ACCEL = 20;
const DRAG = 8;

// Orbital camera config
const CAM_PHI_MIN = 0.2;
const CAM_PHI_MAX = 1.3;
const CAM_RADIUS_MIN = 4;
const CAM_RADIUS_MAX = 18;
const ORBIT_SENSITIVITY = 0.005;
const PINCH_SENSITIVITY = 0.015;
const WHEEL_SENSITIVITY = 0.008;

// Chunk config for colossal mode
const CHUNK_SIZE = 32;
const CHUNK_VISIBLE_DIST = 90;
const CHUNK_DISSOLVE_DIST = 22;

// Vegetation zones for colossal mode — smaller chunks for better branching density
const VEG_CHUNK_SIZE = 16;
const VEG_ZONE1_DIST = 35;
const VEG_ZONE2_DIST = 60;
const VEG_DISPOSE_DIST = 75;

export interface InputState {
  x: number; // -1 (left) to 1 (right)
  z: number; // -1 (back) to 1 (forward)
}

// ─── Internal types ───
interface WallGeoResult {
  geometry: any;
  positions: Float32Array;
  alphaArray: Float32Array;
  wallVStart: Int32Array;
  wallVEnd: Int32Array;
  wallCount: number;
  alphaAttr: any;
}

interface WallData {
  positions: Float32Array;
  alphaArray: Float32Array;
  count: number;
  syncAlpha: () => void;
}

interface ChunkWallData extends WallData {
  mesh: any;
  centerX: number;
  centerZ: number;
}

interface VegChunk {
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  centerX: number;
  centerZ: number;
  ivyRoots: any[] | null;
  top: any[];      // above wall — always visible
  posX: any[];     // east-facing walls
  negX: any[];     // west-facing walls
  posZ: any[];     // south-facing walls
  negZ: any[];     // north-facing walls
  ground: any[];   // grass
  state: 'none' | 'scatter' | 'full';
}

function getAllVegMeshes(vc: VegChunk): any[] {
  return [...vc.top, ...vc.posX, ...vc.negX, ...vc.posZ, ...vc.negZ, ...vc.ground];
}

function clearVegChunkMeshes(vc: VegChunk, scene: any): void {
  for (const m of getAllVegMeshes(vc)) {
    scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  }
  vc.top = []; vc.posX = []; vc.negX = []; vc.posZ = []; vc.negZ = []; vc.ground = [];
}

// ═══════════════════════════════════════════════
//  createMenuScene — rotating 3D maze background
// ═══════════════════════════════════════════════
export function createMenuScene(container: HTMLDivElement): () => void {
  const w0 = container.clientWidth || 400;
  const h0 = container.clientHeight || 600;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w0, h0);
  renderer.setPixelRatio(1);  // Menu: low pixel ratio (decorative background)
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xd4a070, 0.025);

  buildSkyDome(scene);

  const camera = new THREE.PerspectiveCamera(45, w0 / h0, 0.1, 120);

  // Hemisphere light: warm sky + cool ground bounce
  const hemi = new THREE.HemisphereLight(0xffeebb, 0x665544, 0.7);
  scene.add(hemi);

  // Low-angle golden sun for long dramatic shadows
  const sun = new THREE.DirectionalLight(0xffaa55, 2.2);
  sun.position.set(12, 8, -15);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 1024;   // Menu: smaller shadow map
  sun.shadow.mapSize.height = 1024;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 80;
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  // Cool blue fill light for warm/cool contrast
  const fill = new THREE.DirectionalLight(0x6688bb, 0.35);
  fill.position.set(-10, 6, 10);
  scene.add(fill);

  const maze = MENU_MAZE;  // Pre-baked maze — no generation cost
  const mH = maze.length;
  const mW = maze[0].length;

  const uBallPos = { value: new THREE.Vector3(0, 0, 0) };
  setVegBallPos(uBallPos);
  buildWalls(scene, maze, mW, mH, uBallPos);
  buildFloor(scene, mW, mH);
  addMenuIvy(scene, maze, mW, mH, WALL_HEIGHT);   // Cached + seeded


  const centerX = (mW - 1) / 2;
  const centerZ = (mH - 1) / 2;
  const camRadius = 22;
  const camPhi = 0.65;
  let camTheta = Math.PI / 4;

  sun.target.position.set(centerX, 0, centerZ);

  let animId = 0;
  let lastTime = performance.now();

  function animate() {
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    camTheta += dt * 0.08;

    const x = centerX + camRadius * Math.sin(camPhi) * Math.sin(camTheta);
    const y = camRadius * Math.cos(camPhi);
    const z = centerZ - camRadius * Math.sin(camPhi) * Math.cos(camTheta);

    camera.position.set(x, y, z);
    camera.lookAt(centerX, 0, centerZ);

    renderer.render(scene, camera);
    animId = requestAnimationFrame(animate);
  }

  animId = requestAnimationFrame(animate);

  const onResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w && h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
  };
  window.addEventListener('resize', onResize);

  return () => {
    cancelAnimationFrame(animId);
    window.removeEventListener('resize', onResize);
    if (renderer.domElement.parentNode) {
      container.removeChild(renderer.domElement);
    }
    renderer.dispose();
  };
}

// ═══════════════════════════════════════════════
//  createScene — main game
// ═══════════════════════════════════════════════
export function createScene(
  container: HTMLDivElement,
  input: InputState,
  onStateUpdate: (state: GameState) => void,
  config: MazeSizeConfig
): () => void {
  const isColossal = config.id === 'colossal';

  const w0 = container.clientWidth || 400;
  const h0 = container.clientHeight || 600;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w0, h0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));  // Capped at 1.5 (was 2)
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const canvas = renderer.domElement;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xd4a070, config.fogDensity);

  const skyDome = buildSkyDome(scene);

  const camera = new THREE.PerspectiveCamera(55, w0 / h0, 0.1, 120);

  // Hemisphere light: warm sky + cool ground bounce for natural ambient
  const hemi = new THREE.HemisphereLight(0xffeebb, 0x665544, 0.65);
  scene.add(hemi);

  // Low-angle golden sun — long dramatic shadows, warm sunset feel
  const sun = new THREE.DirectionalLight(0xffaa55, 2.2);
  sun.position.set(12, 8, -15);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 80;
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  // Cool blue fill light — warm/cool contrast like the concept art
  const fill = new THREE.DirectionalLight(0x6688bb, 0.3);
  fill.position.set(-10, 6, 10);
  scene.add(fill);

  // ─── Maze generation ───
  const maze = generateMaze(config.rows, config.cols);
  const mazeH = maze.length;
  const mazeW = maze[0].length;

  // ─── Walls ───
  const uBallPos = { value: new THREE.Vector3(1, BALL_RADIUS, 1) };
  setVegBallPos(uBallPos);

  let wallData: WallData | null = null;
  let wallChunks: ChunkWallData[] | null = null;

  if (isColossal) {
    wallChunks = buildChunkedWalls(scene, maze, mazeW, mazeH, uBallPos);
  } else {
    wallData = buildWalls(scene, maze, mazeW, mazeH, uBallPos);
  }

  buildFloor(scene, mazeW, mazeH);

  // Vegetation — unified directional chunk system for all maze types
  const vegChunks: VegChunk[] = [];
  {
    for (let cz = 0; cz < mazeH; cz += VEG_CHUNK_SIZE) {
      for (let cx = 0; cx < mazeW; cx += VEG_CHUNK_SIZE) {
        const eX = Math.min(cx + VEG_CHUNK_SIZE, mazeW);
        const eZ = Math.min(cz + VEG_CHUNK_SIZE, mazeH);
        const vc: VegChunk = {
          startX: cx, startZ: cz, endX: eX, endZ: eZ,
          centerX: (cx + eX - 1) / 2,
          centerZ: (cz + eZ - 1) / 2,
          ivyRoots: null,
          top: [], posX: [], negX: [], posZ: [], negZ: [], ground: [],
          state: 'none',
        };

        if (!isColossal) {
          // Pre-generate full directional ivy for tuto/défi
          vc.ivyRoots = simulateIvyForRegion(maze, mazeW, mazeH, WALL_HEIGHT, cx, cz, eX, eZ);
          const dir = buildIvyMeshesDirectional(vc.ivyRoots, WALL_HEIGHT);
          vc.top = dir.top; vc.posX = dir.posX; vc.negX = dir.negX;
          vc.posZ = dir.posZ; vc.negZ = dir.negZ;
          for (const m of [...vc.top, ...vc.posX, ...vc.negX, ...vc.posZ, ...vc.negZ]) scene.add(m);

          vc.state = 'full';
        }

        vegChunks.push(vc);
      }
    }
  }

  // ─── Ball ───
  const ballTex = createBallTexture();
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 20, 20),
    new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.55, metalness: 0.1 })
  );
  ball.castShadow = true;
  ball.position.set(1, BALL_RADIUS, 1);
  scene.add(ball);

  const vel = { x: 0, z: 0 };

  let distance = 0;
  let lastDist = -1;
  let lastTime = performance.now();
  let animId = 0;

  // ─── Orbital camera state ───
  let camTheta = 0;
  let camPhi = 0.5;
  let camRadius = 10;

  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();

  // ─── Frustum culling — skip rendering & processing for objects behind camera ───
  const _frustum = new THREE.Frustum();
  const _projMatrix = new THREE.Matrix4();
  const _cullSphere = new THREE.Sphere();

  function computeCamOffset(): { x: number; y: number; z: number } {
    return {
      x: camRadius * Math.sin(camPhi) * Math.sin(camTheta),
      y: camRadius * Math.cos(camPhi),
      z: -camRadius * Math.sin(camPhi) * Math.cos(camTheta),
    };
  }

  // Init camera
  const initOff = computeCamOffset();
  camPos.set(ball.position.x + initOff.x, ball.position.y + initOff.y, ball.position.z + initOff.z);
  camLook.set(ball.position.x, 0, ball.position.z);
  camera.position.copy(camPos);
  camera.lookAt(camLook);

  // ─── Mouse orbit ───
  let mouseDown = false;
  let mouseX = 0;
  let mouseY = 0;

  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    mouseDown = true;
    mouseX = e.clientX;
    mouseY = e.clientY;
  };
  const onMouseMove = (e: MouseEvent) => {
    if (!mouseDown) return;
    const dx = e.clientX - mouseX;
    const dy = e.clientY - mouseY;
    mouseX = e.clientX;
    mouseY = e.clientY;
    camTheta += dx * ORBIT_SENSITIVITY;
    camPhi = Math.max(CAM_PHI_MIN, Math.min(CAM_PHI_MAX, camPhi - dy * ORBIT_SENSITIVITY));
  };
  const onMouseUp = () => { mouseDown = false; };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    camRadius = Math.max(CAM_RADIUS_MIN, Math.min(CAM_RADIUS_MAX, camRadius + e.deltaY * WHEEL_SENSITIVITY));
  };

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // ─── Touch orbit & pinch zoom ───
  let touchOrbitId: number | null = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let pinchStartDist = 0;
  let pinching = false;

  function getTouchDist(t1: Touch, t2: Touch): number {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      pinching = true;
      touchOrbitId = null;
      pinchStartDist = getTouchDist(e.touches[0], e.touches[1]);
      e.preventDefault();
    } else if (e.touches.length === 1 && !pinching) {
      touchOrbitId = e.touches[0].identifier;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  };
  const onTouchMove = (e: TouchEvent) => {
    if (pinching && e.touches.length >= 2) {
      e.preventDefault();
      const dist = getTouchDist(e.touches[0], e.touches[1]);
      const delta = pinchStartDist - dist;
      camRadius = Math.max(CAM_RADIUS_MIN, Math.min(CAM_RADIUS_MAX, camRadius + delta * PINCH_SENSITIVITY));
      pinchStartDist = dist;
    } else if (touchOrbitId !== null && !pinching) {
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        if (touch.identifier === touchOrbitId) {
          const dx = touch.clientX - touchStartX;
          const dy = touch.clientY - touchStartY;
          touchStartX = touch.clientX;
          touchStartY = touch.clientY;
          camTheta += dx * ORBIT_SENSITIVITY;
          camPhi = Math.max(CAM_PHI_MIN, Math.min(CAM_PHI_MAX, camPhi - dy * ORBIT_SENSITIVITY));
          e.preventDefault();
          break;
        }
      }
    }
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) pinching = false;
    if (e.touches.length === 0) {
      touchOrbitId = null;
      pinching = false;
    }
  };

  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);

  // ─── Animation loop ───
  function animate(): void {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // Camera-relative movement
    const cosT = Math.cos(camTheta);
    const sinT = Math.sin(camTheta);
    const ax = (input.x * (-cosT) + input.z * (-sinT)) * ACCEL;
    const az = (input.x * (-sinT) + input.z * cosT) * ACCEL;

    vel.x += ax * dt;
    vel.z += az * dt;

    vel.x -= vel.x * DRAG * dt;
    vel.z -= vel.z * DRAG * dt;
    if (Math.abs(vel.x) < 0.001) vel.x = 0;
    if (Math.abs(vel.z) < 0.001) vel.z = 0;

    const nx = ball.position.x + vel.x * dt;
    if (!hitsWall(maze, mazeW, mazeH, nx, ball.position.z, BALL_RADIUS)) {
      ball.position.x = nx;
    } else {
      vel.x *= -0.15;
    }

    const nz = ball.position.z + vel.z * dt;
    if (!hitsWall(maze, mazeW, mazeH, ball.position.x, nz, BALL_RADIUS)) {
      ball.position.z = nz;
    } else {
      vel.z *= -0.15;
    }

    ball.rotation.x += vel.z * dt * 4;
    ball.rotation.z -= vel.x * dt * 4;

    const spd = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    distance += spd * dt;

    // ─── Frustum update (once per frame) ───
    camera.updateMatrixWorld();
    _projMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projMatrix);

    // ─── Wall dissolution laser ───
    if (wallChunks) {
      // Colossal mode: per-chunk frustum culling + distance visibility + laser
      const bx = ball.position.x, bz = ball.position.z;
      for (let ci = 0; ci < wallChunks.length; ci++) {
        const chunk = wallChunks[ci];
        const dx = bx - chunk.centerX;
        const dz = bz - chunk.centerZ;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist >= CHUNK_VISIBLE_DIST) {
          chunk.mesh.visible = false;
          continue;
        }

        // Frustum culling: skip chunks outside camera view
        _cullSphere.center.set(chunk.centerX, WALL_HEIGHT * 0.5, chunk.centerZ);
        _cullSphere.radius = CHUNK_SIZE * 0.72;
        if (!_frustum.intersectsSphere(_cullSphere)) {
          chunk.mesh.visible = false;
          continue;
        }

        chunk.mesh.visible = true;
        if (dist < CHUNK_DISSOLVE_DIST) {
          runLaser(chunk.positions, chunk.alphaArray, chunk.count, ball.position, camPos);
          chunk.syncAlpha();
        }
      }
      uBallPos.value.copy(ball.position);
    } else if (wallData) {
      // Standard mode: single mesh laser
      runLaser(wallData.positions, wallData.alphaArray, wallData.count, ball.position, camPos);
      wallData.syncAlpha();
      uBallPos.value.copy(ball.position);
    }

    // ─── Vegetation chunks (all maze types) with directional face culling ───
    {
      let heavyGenCount = 0;
      const pbx = ball.position.x, pbz = ball.position.z;
      const chunkHalf = VEG_CHUNK_SIZE * 0.5;

      for (let vi = 0; vi < vegChunks.length; vi++) {
        const vc = vegChunks[vi];
        const vdx = pbx - vc.centerX;
        const vdz = pbz - vc.centerZ;
        const vdist = Math.sqrt(vdx * vdx + vdz * vdz);

        // Colossal: disposal of distant chunks (memory management)
        if (isColossal && vdist >= VEG_DISPOSE_DIST) {
          if (vc.state !== 'none') {
            clearVegChunkMeshes(vc, scene);
            vc.state = 'none';
          }
          continue;
        }

        // Frustum culling
        _cullSphere.center.set(vc.centerX, WALL_HEIGHT * 0.5, vc.centerZ);
        _cullSphere.radius = VEG_CHUNK_SIZE * 0.72;
        if (!_frustum.intersectsSphere(_cullSphere)) {
          for (const m of getAllVegMeshes(vc)) m.visible = false;
          continue;
        }

        // Colossal: lazy generation
        if (isColossal) {
          if (vdist < VEG_ZONE1_DIST && vc.state !== 'full' && heavyGenCount < 3) {
            clearVegChunkMeshes(vc, scene);
            if (!vc.ivyRoots) {
              vc.ivyRoots = simulateIvyForRegion(maze, mazeW, mazeH, WALL_HEIGHT, vc.startX, vc.startZ, vc.endX, vc.endZ);
            }
            const dir = buildIvyMeshesDirectional(vc.ivyRoots, WALL_HEIGHT);
            vc.top = dir.top; vc.posX = dir.posX; vc.negX = dir.negX;
            vc.posZ = dir.posZ; vc.negZ = dir.negZ;
            for (const m of [...vc.top, ...vc.posX, ...vc.negX, ...vc.posZ, ...vc.negZ]) scene.add(m);
            vc.state = 'full';
            heavyGenCount++;
          } else if (vdist < VEG_ZONE2_DIST && vc.state === 'none') {
            const dir = buildScatterLeavesDirectional(maze, mazeW, mazeH, WALL_HEIGHT, vc.startX, vc.startZ, vc.endX, vc.endZ);
            vc.top = dir.top; vc.posX = dir.posX; vc.negX = dir.negX;
            vc.posZ = dir.posZ; vc.negZ = dir.negZ;
            for (const m of [...vc.top, ...vc.posX, ...vc.negX, ...vc.posZ, ...vc.negZ]) scene.add(m);
            vc.state = 'scatter';
          }
        }

        if (vc.state === 'none') continue;

        // ─── Directional face culling ───
        // Top: always visible when chunk is in view
        for (const m of vc.top) m.visible = true;

        if (vdist < VEG_ZONE1_DIST) {
          // Close: show camera-facing wall faces + ground
          const camToX = camPos.x - vc.centerX;
          const camToZ = camPos.z - vc.centerZ;

          for (const m of vc.posX) m.visible = camToX > -chunkHalf;
          for (const m of vc.negX) m.visible = camToX < chunkHalf;
          for (const m of vc.posZ) m.visible = camToZ > -chunkHalf;
          for (const m of vc.negZ) m.visible = camToZ < chunkHalf;
          for (const m of vc.ground) m.visible = true;
        } else {
          // Far: only top visible (wall faces hidden — can't see through walls)
          for (const m of vc.posX) m.visible = false;
          for (const m of vc.negX) m.visible = false;
          for (const m of vc.posZ) m.visible = false;
          for (const m of vc.negZ) m.visible = false;
          for (const m of vc.ground) m.visible = false;
        }
      }
    }

    // Smooth orbital camera follow
    const offset = computeCamOffset();
    const targetCam = new THREE.Vector3(
      ball.position.x + offset.x,
      ball.position.y + offset.y,
      ball.position.z + offset.z
    );
    camPos.lerp(targetCam, 0.08);
    camera.position.copy(camPos);

    const targetLook = new THREE.Vector3(ball.position.x, 0, ball.position.z);
    camLook.lerp(targetLook, 0.1);
    camera.lookAt(camLook);

    // Sky dome follows camera in colossal mode
    if (isColossal) {
      skyDome.position.set(camPos.x, 0, camPos.z);
    }

    sun.position.set(camPos.x + 15, 20, camPos.z - 10);
    sun.target.position.set(ball.position.x, 0, ball.position.z);

    const curDist = Math.floor(distance);
    if (curDist !== lastDist) {
      lastDist = curDist;
      onStateUpdate({ distance: curDist });
    }

    renderer.render(scene, camera);
    animId = requestAnimationFrame(animate);
  }

  animId = requestAnimationFrame(animate);

  // ─── Keyboard ───
  const keysDown = new Set<string>();
  const syncKeys = () => {
    input.x = (keysDown.has('ArrowRight') ? 1 : 0) - (keysDown.has('ArrowLeft') ? 1 : 0);
    input.z = (keysDown.has('ArrowUp') ? 1 : 0) - (keysDown.has('ArrowDown') ? 1 : 0);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      keysDown.add(e.key);
      syncKeys();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keysDown.delete(e.key);
    syncKeys();
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  const onResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w && h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
  };
  window.addEventListener('resize', onResize);

  // ─── Cleanup ───
  return () => {
    cancelAnimationFrame(animId);
    // Dispose vegetation chunks
    for (const vc of vegChunks) {
      clearVegChunkMeshes(vc, scene);
    }
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('resize', onResize);
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mouseup', onMouseUp);
    canvas.removeEventListener('mouseleave', onMouseUp);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchmove', onTouchMove);
    canvas.removeEventListener('touchend', onTouchEnd);
    if (renderer.domElement.parentNode) {
      container.removeChild(renderer.domElement);
    }
    renderer.dispose();
  };
}

/* ═══════════════════════════════════════════════
   Helper functions
   ═══════════════════════════════════════════════ */

function buildSkyDome(scene: any): any {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Rich sunset gradient with more depth
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#0d1f3c');    // deep night blue at zenith
  grad.addColorStop(0.15, '#1a3a6c'); // dark blue
  grad.addColorStop(0.3, '#3d7aaa');  // sky blue
  grad.addColorStop(0.45, '#7db5a8'); // teal transition
  grad.addColorStop(0.55, '#c4a55a'); // warm gold
  grad.addColorStop(0.65, '#e8945c'); // orange glow
  grad.addColorStop(0.75, '#e86e3a'); // deep orange
  grad.addColorStop(0.85, '#d4a070'); // matches fog color for seamless blend
  grad.addColorStop(1, '#d4a070');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Add a subtle sun glow
  const sunGrad = ctx.createRadialGradient(256, 310, 0, 256, 310, 120);
  sunGrad.addColorStop(0, 'rgba(255, 230, 160, 0.6)');
  sunGrad.addColorStop(0.3, 'rgba(255, 200, 120, 0.3)');
  sunGrad.addColorStop(1, 'rgba(255, 180, 100, 0)');
  ctx.fillStyle = sunGrad;
  ctx.fillRect(0, 0, 512, 512);

  const tex = new THREE.CanvasTexture(canvas);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(55, 32, 20),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false })
  );
  scene.add(dome);
  return dome;
}

// ─── Height grid ───
function computeHeightGrid(maze: number[][], mazeW: number, mazeH: number): number[][] {
  const grid: number[][] = [];
  for (let z = 0; z < mazeH; z++) {
    grid[z] = [];
    for (let x = 0; x < mazeW; x++) {
      grid[z][x] = maze[z][x] === 1
        ? WALL_HEIGHT * (0.92 + Math.random() * 0.16)
        : 0;
    }
  }
  return grid;
}

// ─── Wall shader material ───
function createWallMaterial(uBallPos: { value: any }): any {
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
function buildWallGeometry(
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
function buildWalls(
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
function buildChunkedWalls(
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
function runLaser(
  positions: Float32Array, alphaArray: Float32Array, count: number,
  ballPos: any, camPosVec: any
): void {
  const laserR = BALL_RADIUS * 1.5;
  const bx = ballPos.x, by = ballPos.y, bz = ballPos.z;
  const cx = camPosVec.x, cy = camPosVec.y, cz = camPosVec.z;
  const rdx = cx - bx, rdy = cy - by, rdz = cz - bz;
  const rayLen = Math.sqrt(rdx * rdx + rdy * rdy + rdz * rdz);
  if (rayLen < 0.01) return;

  const dX = rdx / rayLen, dY = rdy / rayLen, dZ = rdz / rayLen;
  const tMin = 0.8;

  // Pass 1: flag walls hit by 3D laser
  for (let i = 0; i < count; i++) {
    const wx = positions[i * 2];
    const wz = positions[i * 2 + 1];
    const wy = WALL_HEIGHT * 0.5;
    const ex = wx - bx, ey = wy - by, ez = wz - bz;
    const t = ex * dX + ey * dY + ez * dZ;
    if (t > tMin && t < rayLen) {
      const px = bx + dX * t - wx;
      const py = by + dY * t - wy;
      const pz = bz + dZ * t - wz;
      const dist3D = Math.sqrt(px * px + py * py + pz * pz);
      alphaArray[i] = dist3D < laserR + 1.5 ? 0.0 : 1.0;
    } else {
      alphaArray[i] = 1.0;
    }
  }

  // Pass 2: propagate to neighbors (only walls in front of ball)
  const flagged = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    if (alphaArray[i] < 0.5) flagged[i] = 1;
  }
  for (let i = 0; i < count; i++) {
    if (flagged[i]) continue;
    const wx = positions[i * 2];
    const wz = positions[i * 2 + 1];
    const wy = WALL_HEIGHT * 0.5;
    const et = (wx - bx) * dX + (wy - by) * dY + (wz - bz) * dZ;
    if (et <= 0.0) continue;
    for (let j = 0; j < count; j++) {
      if (!flagged[j]) continue;
      const dx = Math.abs(wx - positions[j * 2]);
      const dz = Math.abs(wz - positions[j * 2 + 1]);
      if (dx <= 1.05 && dz <= 1.05) {
        alphaArray[i] = 0.0;
        break;
      }
    }
  }
}

function buildFloor(scene: any, mazeW: number, mazeH: number): void {
  const floorTex = createFloorTexture();
  floorTex.wrapS = THREE.RepeatWrapping;
  floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(mazeW / 2.5, mazeH / 2.5);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(mazeW + 2, mazeH + 2),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92, metalness: 0.03 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((mazeW - 1) / 2, 0, (mazeH - 1) / 2);
  floor.receiveShadow = true;
  scene.add(floor);
}

function buildCoins(scene: any, maze: number[][], coinCount: number): any[] {
  const open = getOpenCells(maze);
  const candidates = open.filter(([x, z]) => !(x <= 2 && z <= 2));
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const geo = new THREE.CylinderGeometry(0.13, 0.13, 0.03, 14);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    metalness: 0.85,
    roughness: 0.15,
    emissive: 0x664400,
    emissiveIntensity: 0.3,
  });

  const coins: any[] = [];
  const num = Math.min(coinCount, candidates.length);
  for (let i = 0; i < num; i++) {
    const [cx, cz] = candidates[i];
    const coin = new THREE.Mesh(geo, mat);
    coin.position.set(cx, 0.55, cz);
    coin.castShadow = true;
    scene.add(coin);
    coins.push(coin);
  }
  return coins;
}

function hitsWall(
  maze: number[][],
  mazeW: number,
  mazeH: number,
  cx: number,
  cz: number,
  r: number
): boolean {
  const x0 = Math.floor(cx - r);
  const x1 = Math.ceil(cx + r);
  const z0 = Math.floor(cz - r);
  const z1 = Math.ceil(cz + r);

  for (let gz = z0; gz <= z1; gz++) {
    for (let gx = x0; gx <= x1; gx++) {
      if (gx < 0 || gx >= mazeW || gz < 0 || gz >= mazeH) return true;
      if (maze[gz][gx] !== 1) continue;

      const nearX = Math.max(gx - 0.5, Math.min(cx, gx + 0.5));
      const nearZ = Math.max(gz - 0.5, Math.min(cz, gz + 0.5));
      const dx = cx - nearX;
      const dz = cz - nearZ;
      if (dx * dx + dz * dz < r * r) return true;
    }
  }
  return false;
}
