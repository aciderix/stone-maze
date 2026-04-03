import { Brick, GeneratorParams } from '../types';
import { mulberry32 } from '../math';
import { computeInsetPoly, getBounds } from '../geometry';
import { tracePathOn, traceRingOn } from '../canvas';

export function drawRoughnessBrick(c: CanvasRenderingContext2D, b: Brick, params: GeneratorParams) {
  const pts = b.pts!;
  const sr = mulberry32(b.seed);
  const { minX, maxX, minY, maxY, w: bw, h: bh, cx, cy } = getBounds(pts);

  const bevelAmt = params.bevel / 100;
  const texAmt = params.texture / 100;
  const crackAmt = params.cracks / 100;

  c.save();
  tracePathOn(c, pts);
  c.clip();
  c.fillStyle = 'rgb(70,70,70)';
  c.fillRect(minX - 2, minY - 2, bw + 4, bh + 4);

  if (bevelAmt > 0) {
    const bevelW = 3 + bevelAmt * 11;
    const inset = computeInsetPoly(pts, bevelW);
    traceRingOn(c, pts, inset);
    c.fillStyle = 'rgb(110,110,110)';
    c.fill('evenodd');
  }

  if (texAmt > 0) {
    const nPatches = 3 + Math.floor(sr() * 7);
    for (let i = 0; i < nPatches; i++) {
      const px = minX + sr() * bw;
      const py = minY + sr() * bh;
      const pr = 5 + sr() * Math.min(bw, bh) * 0.45;
      const g = c.createRadialGradient(px, py, 0, px, py, pr);
      const dark = sr() > 0.4;
      const alpha = (0.15 + sr() * 0.25) * texAmt;
      g.addColorStop(0, `rgba(180,180,180,${alpha})`);
      g.addColorStop(1, 'rgba(180,180,180,0)');
      c.fillStyle = g;
      c.fillRect(minX, minY, bw, bh);
    }
  }

  if (texAmt > 0) {
    const nVeins = Math.floor(sr() * 3.5 * texAmt);
    for (let i = 0; i < nVeins; i++) {
      c.beginPath();
      let vx = minX + bw * 0.08 + sr() * bw * 0.84;
      let vy = minY + bh * 0.08 + sr() * bh * 0.84;
      c.moveTo(vx, vy);
      const segs = 3 + Math.floor(sr() * 5);
      let angle = sr() * Math.PI * 2;
      const vLen = Math.min(bw, bh) * (0.2 + sr() * 0.45);
      for (let j = 0; j < segs; j++) {
        angle += (sr() - 0.5) * 1.1;
        vx += Math.cos(angle) * (vLen / segs);
        vy += Math.sin(angle) * (vLen / segs);
        c.lineTo(vx, vy);
      }
      c.strokeStyle = `rgba(140,140,140,${(0.2 + sr() * 0.2) * texAmt})`;
      c.lineWidth = 0.4 + sr() * 1.2;
      c.stroke();
    }
  }

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

      const cAlpha = (0.2 + sr() * 0.3) * crackAmt;
      c.strokeStyle = `rgb(180,180,180)`;
      c.lineWidth = 0.6 + sr() * 2.0;
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
        c.strokeStyle = `rgb(160,160,160)`;
        c.lineWidth = 0.3 + sr() * 0.8;
        c.stroke();
      }
    }
  }

  c.restore();
}
