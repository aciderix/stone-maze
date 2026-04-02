function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Iterative backtracker — supports any maze size without stack overflow
export function generateMaze(rows: number, cols: number): number[][] {
  const h = 2 * rows + 1;
  const w = 2 * cols + 1;
  const grid: number[][] = [];
  for (let y = 0; y < h; y++) {
    grid[y] = [];
    for (let x = 0; x < w; x++) {
      grid[y][x] = 1;
    }
  }

  const visited: boolean[][] = [];
  for (let r = 0; r < rows; r++) {
    visited[r] = [];
    for (let c = 0; c < cols; c++) {
      visited[r][c] = false;
    }
  }

  // Explicit stack instead of recursion
  const stack: [number, number][] = [];
  visited[0][0] = true;
  grid[1][1] = 0;
  stack.push([0, 0]);

  while (stack.length > 0) {
    const [r, c] = stack[stack.length - 1];
    const dirs = shuffle([
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]);
    let found = false;
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc]) {
        visited[nr][nc] = true;
        grid[2 * r + 1 + dr][2 * c + 1 + dc] = 0; // remove wall between
        grid[2 * nr + 1][2 * nc + 1] = 0;           // open new cell
        stack.push([nr, nc]);
        found = true;
        break;
      }
    }
    if (!found) {
      stack.pop();
    }
  }

  return grid;
}

export function getOpenCells(maze: number[][]): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let z = 0; z < maze.length; z++) {
    for (let x = 0; x < maze[0].length; x++) {
      if (maze[z][x] === 0) {
        cells.push([x, z]);
      }
    }
  }
  return cells;
}
