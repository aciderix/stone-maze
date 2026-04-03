import type { V } from './vecMath';

// ─── Types ───────────────────────────────────────────────────────
export interface IvyNode {
  p: V;
  dir: V;
  adh: V;
  sadh: V;
  len: number;
  flen: number;
  climb: boolean;
}

export interface IvyRoot {
  nodes: IvyNode[];
  alive: boolean;
  depth: number;
}

// ─── Tuning constants ────────────────────────────────────────────
export const STEP = 0.055;
export const W_PRI = 0.5;
export const W_RND = 0.32;
export const W_ADH = 0.18;
export const W_GRAV = 0.65;
export const MAX_FLOAT = 0.55;
export const MAX_ADH_D = 0.8;
export const BRANCH_TH = 0.85;
export const MAX_DEPTH = 4;
export const CLIMB_EPS = 0.08;
