declare const THREE: any;

export interface InputState {
  x: number; // -1 (left) to 1 (right)
  z: number; // -1 (back) to 1 (forward)
}

// ─── Internal types ───
export interface WallGeoResult {
  geometry: any;
  positions: Float32Array;
  alphaArray: Float32Array;
  wallVStart: Int32Array;
  wallVEnd: Int32Array;
  wallCount: number;
  alphaAttr: any;
}

export interface WallData {
  positions: Float32Array;
  alphaArray: Float32Array;
  count: number;
  syncAlpha: () => void;
}

export interface ChunkWallData extends WallData {
  mesh: any;
  centerX: number;
  centerZ: number;
}

export interface VegChunk {
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  centerX: number;
  centerZ: number;
  ivyRoots: any[] | null;
  top: any[];      // above wall — always visible
  posX: any[];     // east-facing walls
  negX: any[];     // west-facing walls
  posZ: any[];     // south-facing walls
  negZ: any[];     // north-facing walls
  ground: any[];   // grass
  state: 'none' | 'scatter' | 'full';
}
