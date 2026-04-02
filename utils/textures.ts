declare const THREE: any;

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

export function createStoneWallTexture(): any {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#3a3530';
  ctx.fillRect(0, 0, size, size);

  const rows = 4;
  const rowH = size / rows;
  for (let row = 0; row < rows; row++) {
    let x = (row % 2) * 30 - 15;
    const y = row * rowH;
    while (x < size + 40) {
      const w = 38 + Math.random() * 42;
      const h = rowH - 5;
      const lightness = 54 + Math.random() * 26;
      const hue = 28 + Math.random() * 14;

      ctx.fillStyle = `hsl(${hue}, 12%, ${lightness}%)`;
      roundRect(ctx, x + 2, y + 2, w - 4, h - 2, 3);

      for (let i = 0; i < 18; i++) {
        const nx = x + 2 + Math.random() * (w - 4);
        const ny = y + 2 + Math.random() * (h - 2);
        const nl = lightness + (Math.random() - 0.5) * 16;
        ctx.fillStyle = `hsla(${hue}, 10%, ${nl}%, 0.3)`;
        ctx.fillRect(nx, ny, 2 + Math.random() * 5, 2 + Math.random() * 4);
      }
      x += w;
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function createFloorTexture(): any {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#5a5348';
  ctx.fillRect(0, 0, size, size);

  const cols = 4;
  const rowCount = 4;
  const cellW = size / cols;
  const cellH = size / rowCount;

  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < cols; c++) {
      const bx = c * cellW + cellW * 0.07 + Math.random() * cellW * 0.06;
      const by = r * cellH + cellH * 0.07 + Math.random() * cellH * 0.06;
      const bw = cellW * 0.78 + Math.random() * cellW * 0.08;
      const bh = cellH * 0.78 + Math.random() * cellH * 0.08;
      const lightness = 52 + Math.random() * 22;
      const hue = 28 + Math.random() * 12;

      ctx.fillStyle = `hsl(${hue}, 12%, ${lightness}%)`;
      roundRect(ctx, bx, by, bw, bh, 3);

      for (let i = 0; i < 10; i++) {
        const nx = bx + Math.random() * bw;
        const ny = by + Math.random() * bh;
        const nl = lightness + (Math.random() - 0.5) * 10;
        ctx.fillStyle = `hsla(${hue}, 10%, ${nl}%, 0.25)`;
        ctx.fillRect(nx, ny, 2 + Math.random() * 4, 2 + Math.random() * 3);
      }

      if (Math.random() < 0.25) {
        ctx.fillStyle = `hsla(100, 40%, ${25 + Math.random() * 12}%, 0.45)`;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(bx + Math.random() * 8, by + Math.random() * 8, 1 + Math.random() * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function createBallTexture(): any {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#7a7268';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 350; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const l = 38 + Math.random() * 30;
    ctx.fillStyle = `hsl(25, 8%, ${l}%)`;
    ctx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }

  return new THREE.CanvasTexture(canvas);
}
