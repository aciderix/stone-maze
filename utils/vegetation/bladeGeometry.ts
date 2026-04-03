declare const THREE: any;


export function createBladeGeometry(segments = 3, width = 0.045, height = 0.14, curvature = 0.12): any {
  const vertCount = (segments + 1) * 2 + 1;
  const pos = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const idx: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const bx = 2 * (1 - t) * t * curvature;
    const by = t * height;
    const w = width * (1 - t * 0.85);
    const vi = i * 2;
    pos[vi * 3]     = bx - w * 0.5;
    pos[vi * 3 + 1] = by;
    pos[vi * 3 + 2] = 0;
    uvs[vi * 2]     = 0;
    uvs[vi * 2 + 1] = t;
    pos[(vi+1) * 3]     = bx + w * 0.5;
    pos[(vi+1) * 3 + 1] = by;
    pos[(vi+1) * 3 + 2] = 0;
    uvs[(vi+1) * 2]     = 1;
    uvs[(vi+1) * 2 + 1] = t;
  }
  const tipIdx = (segments + 1) * 2;
  pos[tipIdx * 3]     = curvature * 0.5;
  pos[tipIdx * 3 + 1] = height;
  pos[tipIdx * 3 + 2] = 0;
  uvs[tipIdx * 2]     = 0.5;
  uvs[tipIdx * 2 + 1] = 1.0;

  for (let i = 0; i < segments; i++) {
    const a = i*2, b = i*2+1, c = (i+1)*2, d = (i+1)*2+1;
    idx.push(a, b, c, b, d, c);
  }
  idx.push(segments*2, segments*2+1, tipIdx);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export let _bladeGeo: any = null;
export function _getBladeGeo(): any {
  if (!_bladeGeo) _bladeGeo = createBladeGeometry();
  return _bladeGeo;
}
