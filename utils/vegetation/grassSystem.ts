declare const THREE: any;
import { _getBladeGeo } from './bladeGeometry';
import { GRASS_VERT, GRASS_FRAG } from './grassShaders';
import type { GrassPos } from './grassPositioning';

// All grass ShaderMaterials share these references — update once per frame
export const _gu = {
  uBaseColor:     { value: null as any },
  uTipColor:      { value: null as any },
  uDryColor:      { value: null as any },
  uDryAmount:     { value: 0.15 },
  uSssStrength:   { value: 0.45 },
  uAoStrength:    { value: 0.6 },
  uSunDir:        { value: null as any },
  uSunColor:      { value: null as any },
  uAmbientColor:  { value: null as any },
  windTime:       { value: 0 },
  windDir:        { value: null as any },
  windBase:       { value: 0.12 },
  windGust:       { value: 0.22 },
  windGustFreq:   { value: 0.3 },
  uPushPos:       { value: null as any },
  uPushRadius:    { value: 0 },
  uBallFadeCenter:{ value: null as any },
  uBallFadeStart: { value: 999 },
  uBallFadeEnd:   { value: 1000 },
};

export let _guInitialized = false;
export function _initGU(): void {
  if (_guInitialized) return;
  _gu.uBaseColor.value = new THREE.Color(0x1a3d12);
  _gu.uTipColor.value = new THREE.Color(0x4a7a30);
  _gu.uDryColor.value = new THREE.Color(0x8b7040);
  _gu.uSunDir.value = new THREE.Vector3(1, 0.8, -0.6).normalize();
  _gu.uSunColor.value = new THREE.Color(0xffaa55);
  _gu.uAmbientColor.value = new THREE.Color(0x887766);
  _gu.windDir.value = new THREE.Vector2(0.8, 0.3).normalize();
  _gu.uPushPos.value = new THREE.Vector3();
  _gu.uBallFadeCenter.value = new THREE.Vector3();
  _guInitialized = true;
}

export function _getGrassMat(): any {
  _initGU();
  return new THREE.ShaderMaterial({
    uniforms: _gu,
    vertexShader: GRASS_VERT,
    fragmentShader: GRASS_FRAG,
    side: THREE.DoubleSide,
    depthWrite: true,
    transparent: false,
  });
}

/** Call each frame to animate grass wind and interaction */
export function updateGrassUniforms(dt: number, camPosVec?: any, ballPosVec?: any, pushRadius?: number): void {
  _initGU();
  _gu.windTime.value += dt;
  if (ballPosVec) {
    _gu.uPushPos.value.copy(ballPosVec);
    _gu.uPushRadius.value = pushRadius ?? 0;
    _gu.uBallFadeCenter.value.copy(ballPosVec);
  }
}

/** Set the ball-distance fade (game mode) */
export function setGrassBallFade(start: number, end: number): void {
  _initGU();
  _gu.uBallFadeStart.value = start;
  _gu.uBallFadeEnd.value = end;
}

/** Reset for scene transitions (menu ↔ game) */
export function resetGrassSystem(): void {
  _gu.windTime.value = 0;
  _gu.uPushRadius.value = 0;
  _gu.uBallFadeStart.value = 999;
  _gu.uBallFadeEnd.value = 1000;
}

/** Internal: build an instanced grass mesh from GrassPos[] */
export function _buildGrassIM(positions: GrassPos[]): any | null {
  if (positions.length === 0) return null;
  _initGU();

  const n = positions.length;
  const posRot = new Float32Array(n * 4);
  const scaleVar = new Float32Array(n * 4);

  for (let i = 0; i < n; i++) {
    const p = positions[i];
    posRot[i*4]   = p.x;
    posRot[i*4+1] = 0.01;
    posRot[i*4+2] = p.z;
    posRot[i*4+3] = p.ry;
    scaleVar[i*4]   = 0.8 + Math.random() * 0.4;
    scaleVar[i*4+1] = p.s;
    scaleVar[i*4+2] = (Math.random() - 0.5) * 0.25;
    scaleVar[i*4+3] = Math.random();
  }

  const base = _getBladeGeo();
  const ibg = new THREE.InstancedBufferGeometry();
  ibg.index = base.index;
  ibg.setAttribute('position', base.getAttribute('position'));
  ibg.setAttribute('uv', base.getAttribute('uv'));
  ibg.setAttribute('normal', base.getAttribute('normal'));
  ibg.setAttribute('aPositionRotation', new THREE.InstancedBufferAttribute(posRot, 4));
  ibg.setAttribute('aScaleVariation', new THREE.InstancedBufferAttribute(scaleVar, 4));

  const mesh = new THREE.Mesh(ibg, _getGrassMat());
  mesh.frustumCulled = false;
  return mesh;
}
