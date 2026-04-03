import { Brick, Point } from './types';
import { rand } from './math';

export function getBounds(pts: Point[]) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

export function computeInsetPoly(pts: Point[], amount: number) {
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= pts.length; cy /= pts.length;
  return pts.map((p) => {
    const dx = cx - p.x, dy = cy - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.01) return { x: p.x, y: p.y };
    const ratio = Math.min(amount / dist, 0.45);
    return { x: p.x + dx * ratio, y: p.y + dy * ratio };
  });
}

export function subdivide(p1: Point, p2: Point, segments: number, roughness: number) {
  let pts: Point[] = [];
  for (let i = 0; i < segments; i++) {
    let t = i / segments;
    let x = p1.x + (p2.x - p1.x) * t;
    let y = p1.y + (p2.y - p1.y) * t;
    if (i > 0) {
      let nx = p2.y - p1.y, ny = -(p2.x - p1.x);
      let len = Math.hypot(nx, ny);
      if (len > 0) {
        let offset = (Math.random() - 0.5) * roughness;
        x += (nx / len) * offset;
        y += (ny / len) * offset;
      }
    }
    pts.push({ x, y });
  }
  return pts;
}

export function generateBrickPolygon(b: Brick, gap: number, roughness: number): Point[] {
  let pad = gap / 2;
  let bx = b.x + pad, by = b.y + pad;
  let bw = b.w - gap, bh = b.h - gap;

  let maxBevel = Math.min(bw, bh) * 0.35;
  let cTL = rand(maxBevel * 0.2, maxBevel), cTR = rand(maxBevel * 0.2, maxBevel);
  let cBR = rand(maxBevel * 0.2, maxBevel), cBL = rand(maxBevel * 0.2, maxBevel);

  let p1 = { x: bx + cTL, y: by };
  let p2 = { x: bx + bw - cTR, y: by };
  let p3 = { x: bx + bw, y: by + cTR };
  let p4 = { x: bx + bw, y: by + bh - cBR };
  let p5 = { x: bx + bw - cBR, y: by + bh };
  let p6 = { x: bx + cBL, y: by + bh };
  let p7 = { x: bx, y: by + bh - cBL };
  let p8 = { x: bx, y: by + cTL };

  let maxRough = (roughness / 100) * (gap * 1.2 + Math.min(bw, bh) * 0.05);
  const getSegs = (d: number) => Math.max(1, Math.floor(d / 12));

  let pts: Point[] = [];
  pts.push(...subdivide(p1, p2, getSegs(bw - cTL - cTR), maxRough));
  pts.push(...subdivide(p2, p3, getSegs(Math.hypot(cTR, cTR)), maxRough * 0.5));
  pts.push(...subdivide(p3, p4, getSegs(bh - cTR - cBR), maxRough));
  pts.push(...subdivide(p4, p5, getSegs(Math.hypot(cBR, cBR)), maxRough * 0.5));
  pts.push(...subdivide(p5, p6, getSegs(bw - cBR - cBL), maxRough));
  pts.push(...subdivide(p6, p7, getSegs(Math.hypot(cBL, cBL)), maxRough * 0.5));
  pts.push(...subdivide(p7, p8, getSegs(bh - cBL - cTL), maxRough));
  pts.push(...subdivide(p8, p1, getSegs(Math.hypot(cTL, cTL)), maxRough * 0.5));
  return pts;
}
