import { Brick, GeneratorParams } from './types';
import { rand } from './math';
import { generateBrickPolygon } from './geometry';
import { addNoiseOverlay } from './canvas';
import { drawStylizedBrick } from './renderers/diffuse';
import { drawHeightBrick } from './renderers/height';
import { drawRoughnessBrick } from './renderers/roughness';
import { generateNormalMap } from './renderers/normal';

const palette = [
  '#d7bc8c', '#e6d3a8', '#c7a974', '#b69766',
  '#c6af85', '#a89471', '#d1b88e', '#e0c79b',
  '#cbb68a', '#dcc99e', '#baa778', '#c9b484',
  '#d4c49c', '#bfa87a', '#c2a87e', '#ddd0ac',
];

export function generateAllTextures(
  params: GeneratorParams,
  canvases: {
    diffuse: HTMLCanvasElement;
    normal: HTMLCanvasElement;
    height: HTMLCanvasElement;
    roughness: HTMLCanvasElement;
  }
) {
  const gridRows = params.rows;
  const gridCols = params.cols;
  const heightVar = params.heightVar / 100;
  const roughness = params.roughness;
  const gap = params.gap;
  const size = 512;
  const cellW = size / gridCols;

  // 1. ROW HEIGHTS
  let rowProportions = [],
    totalProp = 0;
  for (let r = 0; r < gridRows; r++) {
    let prop = Math.max(0.2, 1.0 + (Math.random() * 2 - 1) * heightVar);
    rowProportions.push(prop);
    totalProp += prop;
  }
  let rowHeights = [],
    rowYs = [],
    curY = 0;
  for (let r = 0; r < gridRows; r++) {
    let h = (rowProportions[r] / totalProp) * size;
    rowHeights.push(h);
    rowYs.push(curY);
    curY += h;
  }

  let occupied = Array.from({ length: gridRows }, () =>
    Array(gridCols).fill(false)
  );
  let bricks: Brick[] = [];

  // 2. MASONRY ALGORITHM
  for (let y = 0; y < gridRows; y++) {
    for (let x = 0; x < gridCols; x++) {
      if (occupied[y][x]) continue;
      let maxPossibleH = 1;
      for (let j = 1; j < 3; j++) {
        if (!occupied[(y + j) % gridRows][x]) maxPossibleH++;
        else break;
      }
      let bh = 1,
        rH = Math.random();
      if (rH < 0.06 && maxPossibleH >= 3 && gridRows > 6) bh = 3;
      else if (rH < 0.3 && maxPossibleH >= 2) bh = 2;

      let minTargetW = 3;
      let maxTargetW = Math.max(minTargetW + 1, Math.floor(gridCols * 0.4));
      let targetW = Math.floor(rand(minTargetW, maxTargetW));
      let actualW = 0;

      for (let i = 0; i < targetW; i++) {
        let cx = (x + i) % gridCols,
          canFit = true;
        for (let j = 0; j < bh; j++) {
          if (occupied[(y + j) % gridRows][cx]) {
            canFit = false;
            break;
          }
        }
        if (!canFit) break;
        actualW++;
      }
      if (actualW === 0) actualW = 1;

      for (let i = 0; i < actualW; i++) {
        for (let j = 0; j < bh; j++)
          occupied[(y + j) % gridRows][(x + i) % gridCols] = true;
      }

      let blockH = 0;
      for (let j = 0; j < bh; j++) blockH += rowHeights[(y + j) % gridRows];

      bricks.push({
        x: x * cellW,
        y: rowYs[y],
        w: actualW * cellW,
        h: blockH,
        color: palette[Math.floor(Math.random() * palette.length)],
        seed: (Math.random() * 4294967296) >>> 0,
      });
    }
  }

  // 3. COMPUTE GEOMETRY
  bricks.forEach((b) => {
    b.pts = generateBrickPolygon(b, gap, roughness);
  });

  const offsets = [-size, 0, size];

  // --- DIFFUSE MAP ---
  const ctxDiffuse = canvases.diffuse.getContext('2d', { willReadFrequently: true })!;
  ctxDiffuse.fillStyle = params.mortarColor;
  ctxDiffuse.fillRect(0, 0, size, size);

  const mortarImg = ctxDiffuse.getImageData(0, 0, size, size);
  for (let i = 0; i < mortarImg.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 12;
    mortarImg.data[i] = Math.min(255, Math.max(0, mortarImg.data[i] + n));
    mortarImg.data[i + 1] = Math.min(255, Math.max(0, mortarImg.data[i + 1] + n));
    mortarImg.data[i + 2] = Math.min(255, Math.max(0, mortarImg.data[i + 2] + n));
  }
  ctxDiffuse.putImageData(mortarImg, 0, 0);

  offsets.forEach((ox) => {
    offsets.forEach((oy) => {
      ctxDiffuse.save();
      ctxDiffuse.translate(ox, oy);
      bricks.forEach((b) => drawStylizedBrick(ctxDiffuse, b, params));
      ctxDiffuse.restore();
    });
  });

  addNoiseOverlay(ctxDiffuse, size, 16);

  // --- HEIGHT MAP ---
  const ctxHeight = canvases.height.getContext('2d', { willReadFrequently: true })!;
  ctxHeight.fillStyle = 'rgb(10,10,10)';
  ctxHeight.fillRect(0, 0, size, size);

  const mortarHData = ctxHeight.getImageData(0, 0, size, size);
  for (let i = 0; i < mortarHData.data.length; i += 4) {
    const n = Math.floor((Math.random() - 0.5) * 10);
    const v = Math.min(255, Math.max(0, 10 + n));
    mortarHData.data[i] = v;
    mortarHData.data[i + 1] = v;
    mortarHData.data[i + 2] = v;
  }
  ctxHeight.putImageData(mortarHData, 0, 0);

  offsets.forEach((ox) => {
    offsets.forEach((oy) => {
      ctxHeight.save();
      ctxHeight.translate(ox, oy);
      bricks.forEach((b) => drawHeightBrick(ctxHeight, b, params));
      ctxHeight.restore();
    });
  });

  addNoiseOverlay(ctxHeight, size, 6);

  // --- ROUGHNESS MAP ---
  const ctxRoughness = canvases.roughness.getContext('2d', { willReadFrequently: true })!;
  ctxRoughness.fillStyle = 'rgb(200,200,200)';
  ctxRoughness.fillRect(0, 0, size, size);

  offsets.forEach((ox) => {
    offsets.forEach((oy) => {
      ctxRoughness.save();
      ctxRoughness.translate(ox, oy);
      bricks.forEach((b) => drawRoughnessBrick(ctxRoughness, b, params));
      ctxRoughness.restore();
    });
  });

  addNoiseOverlay(ctxRoughness, size, 10);

  // --- NORMAL MAP ---
  const ctxNormal = canvases.normal.getContext('2d', { willReadFrequently: true })!;
  const strength = params.normalStr;
  const heightImgData = ctxHeight.getImageData(0, 0, size, size);
  const normalData = generateNormalMap(heightImgData, size, size, strength);
  ctxNormal.putImageData(normalData, 0, 0);
}
