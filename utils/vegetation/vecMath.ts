// ─── Vector helpers ──────────────────────────────────────────────
export interface V { x: number; y: number; z: number; }

export function vec(x: number, y: number, z: number): V { return { x, y, z }; }
export function vadd(a: V, b: V): V { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
export function vsub(a: V, b: V): V { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
export function vscl(a: V, s: number): V { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
export function vlen(a: V): number { return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); }
export function vnorm(a: V): V {
  const l = vlen(a);
  return l < 1e-7 ? vec(0, 0, 0) : { x: a.x / l, y: a.y / l, z: a.z / l };
}
export function vrand(): V {
  return vec(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
}
