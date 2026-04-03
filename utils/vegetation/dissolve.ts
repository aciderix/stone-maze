declare const THREE: any;
import { dissolveFragment } from '../shaders/dissolveGLSL';

// ─── Ball-position dissolve for vegetation ─────────────────────
let _uBallPos: { value: any } | null = null;
export function setVegBallPos(u: { value: any }) { _uBallPos = u; }

export function applyVegDissolve(mat: any) {
  if (!_uBallPos) return;
  const uBP = _uBallPos;
  mat.onBeforeCompile = (shader: any) => {
    shader.uniforms.uBallPos = uBP;
    // ── Vertex: pass world position + world normal per instance ──
    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      'varying vec3 vVegWorldPos;\nvarying vec3 vVegNormal;\nvoid main() {'
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
#ifdef USE_INSTANCING
vVegWorldPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
vVegNormal = normalize((modelMatrix * instanceMatrix * vec4(normal, 0.0)).xyz);
#else
vVegWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
vVegNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
#endif`
    );
    // ── Fragment: dissolve with skipDissolve rule (same as walls) ──
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      'uniform vec3 uBallPos;\nvarying vec3 vVegWorldPos;\nvarying vec3 vVegNormal;\nvoid main() {'
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>\n` + dissolveFragment({
        worldPos: 'vVegWorldPos',
        normalExpr: 'vVegNormal',
        coreR: 0.30,
        edgeR: 1.00
      })
    );
  };
}
