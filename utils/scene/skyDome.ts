declare const THREE: any;

export function buildSkyDome(scene: any): any {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Rich sunset gradient with more depth
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#0d1f3c');    // deep night blue at zenith
  grad.addColorStop(0.15, '#1a3a6c'); // dark blue
  grad.addColorStop(0.3, '#3d7aaa');  // sky blue
  grad.addColorStop(0.45, '#7db5a8'); // teal transition
  grad.addColorStop(0.55, '#c4a55a'); // warm gold
  grad.addColorStop(0.65, '#e8945c'); // orange glow
  grad.addColorStop(0.75, '#e86e3a'); // deep orange
  grad.addColorStop(0.85, '#d4a070'); // matches fog color for seamless blend
  grad.addColorStop(1, '#d4a070');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Add a subtle sun glow
  const sunGrad = ctx.createRadialGradient(256, 310, 0, 256, 310, 120);
  sunGrad.addColorStop(0, 'rgba(255, 230, 160, 0.6)');
  sunGrad.addColorStop(0.3, 'rgba(255, 200, 120, 0.3)');
  sunGrad.addColorStop(1, 'rgba(255, 180, 100, 0)');
  ctx.fillStyle = sunGrad;
  ctx.fillRect(0, 0, 512, 512);

  const tex = new THREE.CanvasTexture(canvas);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(55, 32, 20),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false })
  );
  scene.add(dome);
  return dome;
}
