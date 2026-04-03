declare const THREE: any;

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
      `#include <dithering_fragment>
// ── skipDissolve: same rule as walls ──
// Vegetation on corridor walls facing the camera near the ball → keep visible
vec3 toBall = normalize(uBallPos - vVegWorldPos);
vec3 toCam  = normalize(cameraPosition - vVegWorldPos);
float distToBall = length(vVegWorldPos - uBallPos);
bool isVerticalFace = abs(vVegNormal.y) < 0.3;
bool skipDissolve = false;
if (isVerticalFace && dot(vVegNormal, toBall) > 0.0 && dot(vVegNormal, toCam) > 0.0 && distToBall < 3.5) {
  skipDissolve = true;
}
if (!skipDissolve) {
  vec3 rvec = uBallPos - cameraPosition;
  float rlen = length(rvec);
  vec3 rdir = rvec / max(rlen, 0.001);
  float t = dot(vVegWorldPos - cameraPosition, rdir);
  vec3 closest = cameraPosition + rdir * clamp(t, 0.0, rlen);
  float d = length(vVegWorldPos - closest);
  float coreR = 0.3;
  float edgeR = 1.0;
  if (d < coreR) {
    discard;
  } else if (d < edgeR) {
    float dissolve = 1.0 - smoothstep(coreR, edgeR, d);
    float pat = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    if (pat < dissolve) discard;
  }
}`
    );
  };
}
