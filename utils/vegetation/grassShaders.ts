// ─── GLSL Vertex Shader ──────────────────────────────────────────
export const GRASS_VERT = `
// Per-instance
attribute vec4 aPositionRotation; // xyz=worldPos, w=Yrotation
attribute vec4 aScaleVariation;   // x=scaleX, y=scaleY, z=tilt, w=colorVar

// Wind
uniform float windTime;
uniform vec2  windDir;
uniform float windBase;
uniform float windGust;
uniform float windGustFreq;

// Interaction
uniform vec3  uPushPos;
uniform float uPushRadius;

varying vec2  vUv;
varying vec3  vWorldPos;
varying float vColorVar;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise2D(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1,0)),
        c = hash(i + vec2(0,1)), d = hash(i + vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}

vec3 computeWind(vec3 wp, float hf) {
  float gp = dot(wp.xz, windDir) * 0.5 + windTime * 1.2;
  vec2 gs = windDir * sin(gp) * windBase;
  float gup = dot(wp.xz, windDir) * windGustFreq + windTime * 2.5;
  float ge = smoothstep(0.3, 0.7, noise2D(wp.xz * 0.02 + windTime * 0.3));
  vec2 gus = windDir * sin(gup) * windGust * ge;
  float bh = hash(wp.xz * 10.0);
  float tp = windTime * 3.0 + bh * 6.28;
  vec2 turb = vec2(sin(tp), cos(tp * 0.7)) * 0.08;
  float h2 = hf * hf;
  vec2 total = (gs + gus + turb);
  return vec3(total.x, 0.0, total.y) * h2;
}

vec3 computePush(vec3 wp, float hf) {
  if (uPushRadius <= 0.0) return vec3(0.0);
  vec3 delta = wp - uPushPos;
  delta.y = 0.0;
  float dist = length(delta);
  if (dist >= uPushRadius || dist < 0.001) return vec3(0.0);
  float strength = 1.0 - smoothstep(0.0, uPushRadius, dist);
  strength *= strength;
  return normalize(delta) * strength * 1.5 * hf * hf;
}

void main() {
  vUv = uv;
  vColorVar = aScaleVariation.w;

  vec3 p = position;
  p.x *= aScaleVariation.x;
  p.y *= aScaleVariation.y;

  // Tilt
  float ti = aScaleVariation.z;
  float cT = cos(ti), sT = sin(ti);
  float ty = p.y * cT - p.z * sT;
  float tz = p.y * sT + p.z * cT;
  p.y = ty; p.z = tz;

  // Y rotation
  float rot = aPositionRotation.w;
  float cR = cos(rot), sR = sin(rot);
  vec3 r;
  r.x = p.x * cR - p.z * sR;
  r.y = p.y;
  r.z = p.x * sR + p.z * cR;

  vec3 wp = r + aPositionRotation.xyz;
  float hf = uv.y;
  wp += computeWind(wp, hf) + computePush(wp, hf);
  vWorldPos = wp;

  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

// ─── GLSL Fragment Shader ────────────────────────────────────────
export const GRASS_FRAG = `
precision highp float;

uniform vec3  uBaseColor;
uniform vec3  uTipColor;
uniform vec3  uDryColor;
uniform float uDryAmount;
uniform float uSssStrength;
uniform float uAoStrength;
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform vec3  uAmbientColor;
uniform vec3  uBallFadeCenter;
uniform float uBallFadeStart;
uniform float uBallFadeEnd;

varying vec2  vUv;
varying vec3  vWorldPos;
varying float vColorVar;

void main() {
  // Ball-distance dither fade
  float distB = length(vWorldPos.xz - uBallFadeCenter.xz);
  float fade = 1.0 - smoothstep(uBallFadeStart, uBallFadeEnd, distB);
  float pattern = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  if (pattern > fade) discard;

  float ht = vUv.y;
  vec3 col = mix(uBaseColor, uTipColor, ht);
  col = mix(col, uDryColor, vColorVar * uDryAmount);
  col *= 1.0 + (vColorVar - 0.5) * 0.15;

  // Root AO
  float ao = mix(1.0 - uAoStrength, 1.0, smoothstep(0.0, 0.3, ht));
  col *= ao;

  // Lighting
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float diffuse = max(dot(vec3(0.0,1.0,0.0), L) * 0.5 + 0.5, 0.0);

  // SSS backlit glow
  float sss = pow(max(dot(-V, L), 0.0), 3.0) * uSssStrength * ht;

  vec3 lit = col * (uSunColor * diffuse + uAmbientColor * 0.5) + uSunColor * sss;
  gl_FragColor = vec4(lit, 1.0);
}
`;

// ─── Shared grass uniform objects ────────────────────────────────
