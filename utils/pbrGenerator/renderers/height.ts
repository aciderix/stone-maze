import { Brick, GeneratorParams } from '../types';
import { mulberry32 } from '../math';
import { computeInsetPoly, getBounds } from '../geometry';
import { tracePathOn } from '../canvas';

export function drawHeightBrick(c: CanvasRenderingContext2D, b: Brick, params: GeneratorParams) {
  const pts = b.pts!;
  const sr = mulberry32(b.seed);
  const { minX, maxX, minY, maxY, w: bw, h: bh, cx, cy } = getBounds(pts);

  const bevelAmt = params.bevel / 100;
  const crackAmt = params.cracks / 100;
  const texAmt = params.texture / 100;
  const baseHeight = 190;

  const bevelW = 3 + bevelAmt * 11;
  const bevelSteps = 8;

  tracePathOn(c, pts);
  c.fillStyle = `rgb(50,50,50)`;
  c.fill();

  for (let s = 0; s < bevelSteps; s++) {
    const t = (s + 1) / bevelSteps;
    const insetAmount = bevelW * (1 - t);
    const insetPoly = computeInsetPoly(pts, Math.max(0.5, insetAmount));
    const heightValue = Math.floor(50 + (baseHeight - 50) * t);
    tracePathOn(c, insetPoly);
    c.fillStyle = `rgb(${heightValue},${heightValue},${heightValue})`;
    c.fill();
  }

  const innerPoly = computeInsetPoly(pts, 0.5);
  tracePathOn(c, innerPoly);
  c.fillStyle = `rgb(${baseHeight},${baseHeight},${baseHeight})`;
  c.fill();

  c.save();
  tracePathOn(c, pts);
  c.clip();

  const maxR = Math.max(bw, bh) * 0.75;
  const rg = c.createRadialGradient(cx, cy, 0, cx, cy, maxR);
  const peakH = Math.min(255, baseHeight + 40);
  rg.addColorStop(0, `rgb(${peakH},${peakH},${peakH})`);
  rg.addColorStop(
    0.35,
    `rgb(${baseHeight + 15},${baseHeight + 15},${baseHeight + 15})`
  );
  rg.addColorStop(0.7, `rgb(${baseHeight},${baseHeight},${baseHeight})`);
  rg.addColorStop(
    1,
    `rgb(${baseHeight - 15},${baseHeight - 15},${baseHeight - 15})`
  );
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 0.5;
  c.fillStyle = rg;
  c.fillRect(minX - 2, minY - 2, bw + 4, bh + 4);
  c.globalAlpha = 1.0;

  if (crackAmt > 0) {
    const nCracks = Math.floor(
      sr() * 3 * crackAmt + (crackAmt > 0.2 ? sr() * 1.0 : 0)
    );
    for (let i = 0; i < nCracks; i++) {
      c.beginPath();
      let crX = minX + bw * (0.1 + sr() * 0.8);
      let crY = minY + bh * (0.1 + sr() * 0.8);
      c.moveTo(crX, crY);

      const segs = 3 + Math.floor(sr() * 6);
      let angle = sr() * Math.PI * 2;
      const cLen = Math.min(bw, bh) * (0.15 + sr() * 0.55);

      for (let j = 0; j < segs; j++) {
        angle += (sr() - 0.5) * 0.85;
        crX += Math.cos(angle) * (cLen / segs);
        crY += Math.sin(angle) * (cLen / segs);
        c.lineTo(crX, crY);
      }

      c.strokeStyle = `rgba(0,0,0,0.35)`;
      c.lineWidth = 0.8 + sr() * 2.5;
      c.stroke();

      if (sr() < 0.4 * crackAmt) {
        c.beginPath();
        let bx2 = minX + bw * (0.2 + sr() * 0.6);
        let by2 = minY + bh * (0.2 + sr() * 0.6);
        c.moveTo(bx2, by2);
        let bAngle = angle + (sr() - 0.5) * 2;
        const bLen2 = cLen * (0.2 + sr() * 0.3);
        const bSegs = 2 + Math.floor(sr() * 3);
        for (let j = 0; j < bSegs; j++) {
          bAngle += (sr() - 0.5) * 0.7;
          bx2 += Math.cos(bAngle) * (bLen2 / bSegs);
          by2 += Math.sin(bAngle) * (bLen2 / bSegs);
          c.lineTo(bx2, by2);
        }
        c.strokeStyle = `rgba(0,0,0,0.25)`;
        c.lineWidth = 0.4 + sr() * 1.0;
        c.stroke();
      }
    }
  }

  if (texAmt > 0) {
    const nPatches = 3 + Math.floor(sr() * 7);
    for (let i = 0; i < nPatches; i++) {
      sr(); sr(); sr(); sr(); sr();
    }
  }
  if (texAmt > 0) {
    const nVeins = Math.floor(sr() * 3.5 * texAmt);
    for (let i = 0; i < nVeins; i++) {
      sr(); sr();
      const segs = 3 + Math.floor(sr() * 5);
      sr(); sr();
      for (let j = 0; j < segs; j++) { sr(); }
      sr(); sr();
    }
  }

  c.restore();
}
