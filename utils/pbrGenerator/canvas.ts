import { Point } from './types';

export function tracePathOn(c: CanvasRenderingContext2D, pts: Point[]) {
  c.beginPath();
  c.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
  c.closePath();
}

export function traceRingOn(
  c: CanvasRenderingContext2D,
  outer: Point[],
  inner: Point[]
) {
  c.beginPath();
  c.moveTo(outer[0].x, outer[0].y);
  for (let i = 1; i < outer.length; i++) c.lineTo(outer[i].x, outer[i].y);
  c.closePath();
  c.moveTo(inner[inner.length - 1].x, inner[inner.length - 1].y);
  for (let i = inner.length - 2; i >= 0; i--) c.lineTo(inner[i].x, inner[i].y);
  c.closePath();
}

export function addNoiseOverlay(
  c: CanvasRenderingContext2D,
  size: number,
  amount: number
) {
  let noiseData = c.getImageData(0, 0, size, size);
  for (let i = 0; i < noiseData.data.length; i += 4) {
    let noise = (Math.random() - 0.5) * amount;
    noiseData.data[i] = Math.min(255, Math.max(0, noiseData.data[i] + noise));
    noiseData.data[i + 1] = Math.min(255, Math.max(0, noiseData.data[i + 1] + noise));
    noiseData.data[i + 2] = Math.min(255, Math.max(0, noiseData.data[i + 2] + noise));
  }
  c.putImageData(noiseData, 0, 0);
}
