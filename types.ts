export interface GameState {
  score: number;
  distance: number;
}

export type MazeSizeId = 'tutorial' | 'challenge' | 'colossal';

export interface MazeSizeConfig {
  id: MazeSizeId;
  rows: number;
  cols: number;
  coins: number;
  fogDensity: number;
}

export const MAZE_CONFIGS: Record<MazeSizeId, MazeSizeConfig> = {
  tutorial:  { id: 'tutorial',  rows: 8,   cols: 8,   coins: 15,  fogDensity: 0.028 },
  challenge: { id: 'challenge', rows: 20,  cols: 20,  coins: 40,  fogDensity: 0.022 },
  colossal:  { id: 'colossal',  rows: 100, cols: 100, coins: 200, fogDensity: 0.015 },
};
