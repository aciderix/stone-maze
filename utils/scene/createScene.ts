declare const THREE: any;
import { createBallTexture } from '../textures';
import { simulateIvyForRegion, buildIvyMeshesDirectional, buildScatterLeavesDirectional, setVegBallPos } from '../vegetation';
import { generateMaze } from '../maze';
import { GameState, MazeSizeConfig } from '../../types';
import { buildSkyDome } from './skyDome';
import { WALL_HEIGHT, BALL_RADIUS, ACCEL, DRAG, CAM_PHI_MIN, CAM_PHI_MAX, CAM_RADIUS_MIN, CAM_RADIUS_MAX, ORBIT_SENSITIVITY, PINCH_SENSITIVITY, WHEEL_SENSITIVITY, CHUNK_SIZE, CHUNK_VISIBLE_DIST, CHUNK_DISSOLVE_DIST, VEG_CHUNK_SIZE, VEG_ZONE1_DIST, VEG_ZONE2_DIST, VEG_DISPOSE_DIST } from './constants';
import { InputState, WallData, ChunkWallData, VegChunk } from './types';
import { getAllVegMeshes, clearVegChunkMeshes } from './vegChunkHelpers';
import { buildWalls, buildChunkedWalls } from './walls';
import { runLaser } from './laser';
import { buildFloor } from './floor';
import { hitsWall } from './collision';

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
