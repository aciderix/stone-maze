import { BALL_RADIUS, WALL_HEIGHT } from './constants';

export function runLaser(
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

