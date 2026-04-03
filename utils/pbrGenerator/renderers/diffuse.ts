import { Brick, GeneratorParams, Point } from '../types';
import { mulberry32 } from '../math';
import { computeInsetPoly, getBounds } from '../geometry';
import { tracePathOn, traceRingOn } from '../canvas';

export function drawStylizedBrick(c: CanvasRenderingContext2D, b: Brick, params: GeneratorParams) {
  const pts = b.pts!;
  const sr = mulberry32(b.seed);
  const { minX, maxX, minY, maxY, w: bw, h: bh, cx, cy } = getBounds(pts);

  const bevelAmt = params.bevel / 100;
  const texAmt = params.texture / 100;
  const crackAmt = params.cracks / 100;

  // 1. DROP SHADOW
  c.save();
  tracePathOn(c, pts);
  c.shadowColor = 'rgba(0,0,0,0.6)';
  c.shadowBlur = 9;
  c.shadowOffsetX = 2;
  c.shadowOffsetY = 5;
  c.fillStyle = b.color;
  c.fill();
  c.restore();

  // 2. CLIP TO STONE & BASE FILL
  c.save();
  tracePathOn(c, pts);
  c.clip();
  c.fillStyle = b.color;
  c.fillRect(minX - 2, minY - 2, bw + 4, bh + 4);

  // 3. COLOR PATCHES
  if (texAmt > 0) {
    const nPatches = 3 + Math.floor(sr() * 7);
    for (let i = 0; i < nPatches; i++) {
      const px = minX + sr() * bw;
      const py = minY + sr() * bh;
      const pr = 5 + sr() * Math.min(bw, bh) * 0.45;
      const g = c.createRadialGradient(px, py, 0, px, py, pr);
      const dark = sr() > 0.4;
      const alpha = (0.07 + sr() * 0.18) * texAmt;
      if (dark) {
        g.addColorStop(0, `rgba(80,65,38,${alpha})`);
        g.addColorStop(1, 'rgba(80,65,38,0)');
      } else {
        g.addColorStop(0, `rgba(255,248,225,${alpha})`);
        g.addColorStop(1, 'rgba(255,248,225,0)');
      }
      c.fillStyle = g;
      c.fillRect(minX, minY, bw, bh);
    }
  }

  // 4. MINERAL VEINS
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
      c.strokeStyle = `rgba(100,82,52,${(0.08 + sr() * 0.14) * texAmt})`;
      c.lineWidth = 0.4 + sr() * 1.2;
      c.stroke();
    }
  }

  // 5. CONVEX / PILLOW EFFECT
  if (bevelAmt > 0) {
    const maxR = Math.max(bw, bh) * 0.78;
    const rg = c.createRadialGradient(
      cx - bw * 0.05,
      cy - bh * 0.1,
      maxR * 0.05,
      cx,
      cy,
      maxR
    );
    rg.addColorStop(0, `rgba(255,250,238,${0.14 * bevelAmt})`);
    rg.addColorStop(0.35, `rgba(255,250,238,${0.04 * bevelAmt})`);
    rg.addColorStop(0.6, 'rgba(0,0,0,0)');
    rg.addColorStop(1, `rgba(0,0,0,${0.12 * bevelAmt})`);
    c.fillStyle = rg;
    c.fillRect(minX, minY, bw, bh);
  }

  // 6. INNER BEVEL RING
  if (bevelAmt > 0) {
    const bevelW = 3 + bevelAmt * 11;
    const inset = computeInsetPoly(pts, bevelW);

    traceRingOn(c, pts, inset);
    let hg = c.createLinearGradient(minX, minY, maxX, maxY);
    hg.addColorStop(0, `rgba(255,250,232,${0.6 * bevelAmt})`);
    hg.addColorStop(0.3, `rgba(255,250,232,${0.25 * bevelAmt})`);
    hg.addColorStop(0.6, 'rgba(255,250,232,0)');
    hg.addColorStop(1, 'rgba(255,250,232,0)');
    c.fillStyle = hg;
    c.fill('evenodd');

    traceRingOn(c, pts, inset);
    let sg = c.createLinearGradient(minX, minY, maxX, maxY);
    sg.addColorStop(0, 'rgba(0,0,0,0)');
    sg.addColorStop(0.4, 'rgba(0,0,0,0)');
    sg.addColorStop(0.7, `rgba(0,0,0,${0.18 * bevelAmt})`);
    sg.addColorStop(1, `rgba(0,0,0,${0.48 * bevelAmt})`);
    c.fillStyle = sg;
    c.fill('evenodd');

    traceRingOn(c, pts, inset);
    let lg = c.createLinearGradient(minX, cy, maxX, cy);
    lg.addColorStop(0, `rgba(255,250,235,${0.2 * bevelAmt})`);
    lg.addColorStop(0.3, 'rgba(255,250,235,0)');
    lg.addColorStop(0.7, 'rgba(0,0,0,0)');
    lg.addColorStop(1, `rgba(0,0,0,${0.15 * bevelAmt})`);
    c.fillStyle = lg;
    c.fill('evenodd');

    c.beginPath();
    c.moveTo(inset[0].x, inset[0].y);
    for (let i = 1; i < inset.length; i++) c.lineTo(inset[i].x, inset[i].y);
    c.closePath();
    c.strokeStyle = `rgba(65,52,32,${0.12 * bevelAmt})`;
    c.lineWidth = 0.8;
    c.stroke();
  }

  // 7. CRACKS / FISSURES
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
      c.strokeStyle = `rgba(50,40,25,${cAlpha})`;
      c.lineWidth = 0.6 + sr() * 2.0;
      c.stroke();

      c.save();
      c.translate(0.7, -0.7);
      c.strokeStyle = `rgba(255,245,218,${cAlpha * 0.3})`;
      c.lineWidth = 0.4;
      c.stroke();
      c.restore();

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
        c.strokeStyle = `rgba(50,40,25,${cAlpha * 0.6})`;
        c.lineWidth = 0.3 + sr() * 0.8;
        c.stroke();
      }
    }
  }

  // 8. OVERALL DIRECTIONAL LIGHT
  let olg = c.createLinearGradient(minX, minY, maxX, maxY);
  olg.addColorStop(0, 'rgba(255,255,255,0.04)');
  olg.addColorStop(0.45, 'rgba(0,0,0,0)');
  olg.addColorStop(1, 'rgba(0,0,0,0.07)');
  c.fillStyle = olg;
  c.fillRect(minX, minY, bw, bh);

  c.restore(); // end clip

  // 9. EDGE CONTOUR LIGHTING
  let groups: { type: string; pts: Point[] }[] = [];
  let currentGroup: Point[] = [];
  let currentType: string | null = null;
  for (let i = 0; i < pts.length; i++) {
    let pA = pts[i],
      pB = pts[(i + 1) % pts.length];
    let dx = pB.x - pA.x,
      dy = pB.y - pA.y;
    let type = dx - dy > -0.5 ? 'highlight' : 'shadow';
    if (type !== currentType) {
      if (currentGroup.length > 0)
        groups.push({ type: currentType!, pts: currentGroup });
      currentGroup = [pA, pB];
      currentType = type;
    } else {
      currentGroup.push(pB);
    }
  }
  if (currentGroup.length > 0)
    groups.push({ type: currentType!, pts: currentGroup });
  if (groups.length > 1 && groups[0].type === groups[groups.length - 1].type) {
    groups[groups.length - 1].pts.push(...groups[0].pts.slice(1));
    groups.shift();
  }

  c.lineCap = 'round';
  c.lineJoin = 'round';
  const bevelAmt2 = params.bevel / 100;
  const edgeMul = 0.5 + bevelAmt2 * 0.8;
  groups.forEach((g) => {
    c.beginPath();
    c.moveTo(g.pts[0].x, g.pts[0].y);
    for (let i = 1; i < g.pts.length; i++) c.lineTo(g.pts[i].x, g.pts[i].y);
    if (g.type === 'highlight') {
      c.strokeStyle = `rgba(255,252,240,${0.5 * edgeMul})`;
      c.lineWidth = 2.0 * edgeMul;
    } else {
      c.strokeStyle = `rgba(0,0,0,${0.6 * edgeMul})`;
      c.lineWidth = 3.5 * edgeMul;
    }
    c.stroke();
  });
}
