declare const THREE: any;
import { getOpenCells } from '../maze';

export function buildCoins(scene: any, maze: number[][], coinCount: number): any[] {
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
