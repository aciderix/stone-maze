export function hitsWall(
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
