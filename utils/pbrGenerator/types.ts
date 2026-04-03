export interface Point {
  x: number;
  y: number;
}

export interface Brick {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  seed: number;
  pts?: Point[];
}

export interface GeneratorParams {
  rows: number;
  cols: number;
  heightVar: number;
  roughness: number;
  gap: number;
  mortarColor: string;
  bevel: number;
  texture: number;
  cracks: number;
  normalStr: number;
}
