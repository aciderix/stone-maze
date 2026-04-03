export function generateNormalMap(
  heightImageData: ImageData,
  width: number,
  height: number,
  strength: number
) {
  const hData = heightImageData.data;
  const normalData = new ImageData(width, height);

  function getH(x: number, y: number) {
    x = ((x % width) + width) % width;
    y = ((y % height) + height) % height;
    return hData[(y * width + x) * 4] / 255.0;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tl = getH(x - 1, y - 1),
        t = getH(x, y - 1),
        tr = getH(x + 1, y - 1);
      const l = getH(x - 1, y),
        r = getH(x + 1, y);
      const bl = getH(x - 1, y + 1),
        b = getH(x, y + 1),
        br = getH(x + 1, y + 1);

      const dX = tr + 2 * r + br - (tl + 2 * l + bl);
      const dY = bl + 2 * b + br - (tl + 2 * t + tr);

      let nx = -dX * strength;
      let ny = -dY * strength;
      let nz = 1.0;

      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= len;
      ny /= len;
      nz /= len;

      const idx = (y * width + x) * 4;
      normalData.data[idx] = Math.floor(nx * 127.5 + 127.5);
      normalData.data[idx + 1] = Math.floor(ny * 127.5 + 127.5);
      normalData.data[idx + 2] = Math.floor(nz * 127.5 + 127.5);
      normalData.data[idx + 3] = 255;
    }
  }
  return normalData;
}
