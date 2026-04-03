declare const THREE: any;
import { WALL_HEIGHT } from './constants';
import { addMenuIvy, setVegBallPos } from '../vegetation';
import { MENU_MAZE } from '../menuMazeData';
import { buildSkyDome } from './skyDome';
import { buildWalls } from './walls';
import { buildFloor } from './floor';

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
