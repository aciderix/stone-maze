import { WALL_HEIGHT } from './constants';

export function computeHeightGrid(maze: number[][], mazeW: number, mazeH: number): number[][] {
  const grid: number[][] = [];
  for (let z = 0; z < mazeH; z++) {
    grid[z] = [];
    for (let x = 0; x < mazeW; x++) {
      grid[z][x] = maze[z][x] === 1
        ? WALL_HEIGHT * (0.92 + Math.random() * 0.16)
        : 0;
    }
  }
  return grid;
}
