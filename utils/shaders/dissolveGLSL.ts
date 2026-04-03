// ─── Shared dissolve GLSL logic ─────────────────────────────
// Used by both walls and vegetation to dissolve geometry
// near the ball-to-camera ray.
//
// Parameters:
//   worldPos  — varying name for world position (e.g. "vWallWorldPos")
//   normalExpr — GLSL expression for the surface normal
//   coreR     — inner radius (full discard)
//   edgeR     — outer radius (noise dissolve)
//   guard     — optional GLSL condition wrapping the whole block (e.g. "vInstanceAlpha < 0.99")

export interface DissolveParams {
  worldPos: string;
  normalExpr: string;
  coreR: number;
  edgeR: number;
  guard?: string;
}

export function dissolveFragment(p: DissolveParams): string {
  const core = `
    vec3 toBall_d = normalize(uBallPos - ${p.worldPos});
    vec3 toCam_d  = normalize(cameraPosition - ${p.worldPos});
    float distToBall_d = length(${p.worldPos} - uBallPos);
    vec3 faceN_d = ${p.normalExpr};
    bool isVerticalFace_d = abs(faceN_d.y) < 0.3;
    bool skipDissolve_d = false;
    if (isVerticalFace_d && dot(faceN_d, toBall_d) > 0.0 && dot(faceN_d, toCam_d) > 0.0 && distToBall_d < 3.5) {
      skipDissolve_d = true;
    }
    if (!skipDissolve_d) {
      vec3 rvec_d = uBallPos - cameraPosition;
      float rlen_d = length(rvec_d);
      vec3 rdir_d = rvec_d / max(rlen_d, 0.001);
      float t_d = dot(${p.worldPos} - cameraPosition, rdir_d);
      vec3 closest_d = cameraPosition + rdir_d * clamp(t_d, 0.0, rlen_d);
      float dist_d = length(${p.worldPos} - closest_d);
      float coreR_d = ${p.coreR.toFixed(2)};
      float edgeR_d = ${p.edgeR.toFixed(2)};
      if (dist_d < coreR_d) {
        discard;
      } else if (dist_d < edgeR_d) {
        float dissolve_d = 1.0 - smoothstep(coreR_d, edgeR_d, dist_d);
        float pat_d = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        if (pat_d < dissolve_d) discard;
      }
    }`;

  if (p.guard) {
    return `\nif (${p.guard}) {\n${core}\n}`;
  }
  return core;
}
