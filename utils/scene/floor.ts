declare const THREE: any;
import { createFloorTexture } from '../textures';

export function buildFloor(scene: any, mazeW: number, mazeH: number): void {
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
