// Scene: an A-frame in an old spruce forest on a cold autumn evening. You stand at eye level among the trunks on a
// carpet of needles; thirty metres off, in a small clearing, the cabin's glazed gable glows: a lamp hangs in the
// double-height room, the stove burns, someone walks past the windows now and then. Smoke rises from the stovepipe,
// firewood is stacked under a lean-to and in a round stack, the larches have turned gold and drop their needles, and
// mist hangs between the trunks. Everything is procedural and seeded, so the forest is the same on every load.
// Only dependency: three.js.

import * as THREE from "three";
import { makePost } from "./post.js";

const TAU = Math.PI * 2;
const h1 = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const vn2 = (x, z) => { const i = Math.floor(x), j = Math.floor(z), f = x - i, g = z - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g), h = (a, b) => h1(a * 57.3 + b * 113.1);
  return h(i, j) * (1 - u) * (1 - v) + h(i + 1, j) * u * (1 - v) + h(i, j + 1) * (1 - u) * v + h(i + 1, j + 1) * u * v; };
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- layout (metres; you look along -z at the start)
const EYE = 1.65;
const AT_W = 2048, AT_H = 1024, CELL_W = 256, NB = 12, SECT = TAU / NB;     // the painted atlas, and branches per whorl
// the cabin: centre of its footprint, turned so the gable faces a little to the right of you and its left side shows
const CABIN = { x: 3.5, z: -32 };
CABIN.yaw = Math.atan2(-CABIN.x, -CABIN.z) + 0.5;
const CY = Math.cos(CABIN.yaw), SY = Math.sin(CABIN.yaw);
const toWorld = (lx, lz) => [CABIN.x + lx * CY + lz * SY, CABIN.z - lx * SY + lz * CY];
const toLocal = (x, z) => { const dx = x - CABIN.x, dz = z - CABIN.z; return [dx * CY - dz * SY, dx * SY + dz * CY]; };
// A-frame, in its own frame (front gable toward +z): half width B at floor level Y0, ridge HR above the floor, gable at
// z = ±ZG, roof slabs T thick reaching down to EAVE, the loft floor at YL over the back half (z < ZL)
const B = 3.9, HR = 7.8, Y0 = 0.7, ZG = 4.7, T = 0.3, EAVE = 0.12, YL = Y0 + 2.75, ZL = -0.4;
const ALPHA = Math.atan2(HR, B);
// the path of flagstones from where you stand at first up to the deck steps
const PATH = [[0.2, 7], [-0.3, -3], [0.9, -10], [2.6, -16], [4.4, -20.5], toWorld(0, 7.9)];
const START = [-0.15, 0];
const segD = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
const pathD = (x, z) => { let d = 1e9; for (let i = 0; i < PATH.length - 1; i++) d = Math.min(d, segD(x, z, ...PATH[i], ...PATH[i + 1])); return d; };
const dCab = (x, z) => Math.hypot(x - CABIN.x, z - CABIN.z);
// you walk round the cabin on a circle: the angle of where you start, and how near you can come or how far go
const ORBIT0 = Math.atan2(START[0] - CABIN.x, START[1] - CABIN.z), DIST0 = dCab(...START), DMIN = 13, DMAX = 42;
// the animals' rounds: wobbling loops about the cabin (roe deer on two, the fox further out, hares round the clearing)
const ROUTES = [{ r: 21, w: 4.5, ph: 0.3 }, { r: 31, w: 6, ph: 2.1 }, { r: 40, w: 7, ph: 4.0 }, { r: 15.5, w: 2.2, ph: 1.2 }];
const routeR = (k, a) => { const o = ROUTES[k]; return o.r + o.w * Math.sin(a * 3 + o.ph * 5) + o.w * 0.5 * Math.sin(a * 7 + 1); };
const routeAt = (k, a) => { const rr = routeR(k, a); return [CABIN.x + Math.sin(a) * rr, CABIN.z + Math.cos(a) * rr]; };
const trailD = (x, z) => { const a = Math.atan2(x - CABIN.x, z - CABIN.z), d = dCab(x, z); let m = 1e9; for (let k = 0; k < ROUTES.length; k++) m = Math.min(m, Math.abs(d - routeR(k, a))); return m; };

// the forest floor: gently rolling, levelled round the cabin, rising slowly beyond it
const rawGround = (x, z) => 1.3 * (vn2(x * 0.022 + 3.1, z * 0.022 + 7.3) - 0.5) + 0.4 * (vn2(x * 0.08, z * 0.08 + 11) - 0.5) + 0.1 * (vn2(x * 0.35, z * 0.35) - 0.5)
  + Math.max(0, -z - 45) * 0.03;
const CAB_Y = rawGround(CABIN.x, CABIN.z);
function ground(x, z) {
  const [lx, lz] = toLocal(x, z);
  const k = smooth(1, 0, Math.hypot(lx / 13, (lz - 2) / 15));
  return rawGround(x, z) * (1 - k) + CAB_Y * k - 0.05 * smooth(0.9, 0.2, pathD(x, z));
}

const GLOW_DIR = new THREE.Vector3(-0.62, 0.1, -0.78).normalize();   // where the sun went down: a last cold glow behind the trees

// ---------------------------------------------------------------- GLSL shared by every material
const GLSL_COMMON = /* glsl */`
uniform float uTime, uNight, uFlick, uFogA, uFogH, uScat;
uniform vec3 uSkyA, uSkyG, uGlowDir, uGlowCol, uFogCol;
uniform vec3 uLp[6], uLn[6], uLc[6];     // the cabin's light: windows, lantern, roof windows, the string over the deck (position, facing, colour)
uniform float uLk[6], uLs[6];            // how tightly each one is aimed, how big it is
uniform vec2 uClear, uWind;
uniform mat4 uCabInv;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
  return mix(mix(mix(hash13(i), hash13(i+vec3(1,0,0)), f.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y), f.z); }
const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);
float fbm(vec2 p){ float s = 0., a = .5; for(int i=0;i<4;i++){ s += a*vnoise(p); p = ROT * p * 2.03 + vec2(1.7, 9.2); a *= .5; } return s / .9375; }
`;

const GLSL_LIGHT = /* glsl */`
// how much open sky a point sees: little under the canopy, more in the clearing and up in the crowns
float openness(vec3 p){ return clamp(smoothstep(18., 6., length(p.xz - uClear)) * 0.85 + smoothstep(12., 30., p.y), 0., 1.); }
vec3 fogSky(vec3 rd){
  vec3 h = normalize(vec3(rd.x, 0., rd.z) + 1e-5);
  float g = pow(max(dot(h, normalize(vec3(uGlowDir.x, 0., uGlowDir.z))), 0.), 4.);
  return uFogCol + uGlowCol * g * 0.6 * exp(-max(rd.y, 0.) * 5.);
}
vec3 cabinLight(vec3 P, vec3 N, float wrap){
  vec3 c = vec3(0.);
  for (int i = 0; i < 6; i++) {
    vec3 L = uLp[i] - P; float d2 = dot(L, L); L *= inversesqrt(d2);
    float dir = pow(max(dot(-L, uLn[i]), 1e-4), uLk[i]);
    c += uLc[i] * clamp((dot(N, L) + wrap) / (1. + wrap), 0., 1.) * dir / (d2 + 0.6);
  }
  return c;
}
vec3 cabinSpec(vec3 P, vec3 N, vec3 V, float shin){
  vec3 c = vec3(0.);
  for (int i = 0; i < 6; i++) {
    vec3 L = uLp[i] - P; float d2 = dot(L, L); L *= inversesqrt(d2);
    float dir = pow(max(dot(-L, uLn[i]), 1e-4), uLk[i]);
    c += uLc[i] * dir * pow(max(dot(N, normalize(L + V)), 0.), shin) * (shin + 2.) / 8. * max(dot(N, L), 0.) / (d2 + 0.6);
  }
  return c;
}
// sky light from above (dimmed under the canopy), the last glow in the west, the cabin's warm light, a wet sheen
vec3 shade(vec3 alb, vec3 N, vec3 P, float ao, float wrap, float spec){
  float op = openness(P);
  vec3 sky = mix(uSkyG, uSkyA, N.y * 0.5 + 0.5) * mix(0.55, 1., op);
  vec3 glow = uGlowCol * clamp((dot(N, uGlowDir) + 0.3) / 1.3, 0., 1.) * mix(0.35, 1., op);
  vec3 c = alb * ((sky + glow) * ao + cabinLight(P, N, wrap));
  if (spec > 0.) {
    vec3 V = normalize(cameraPosition - P);
    float fr = 0.04 + 0.96 * pow(1. - max(dot(N, V), 0.), 5.);
    c += cabinSpec(P, N, V, spec) * 0.3 * (0.3 + fr) + fogSky(reflect(-V, N)) * fr * 0.6 * ao * smoothstep(40., 250., spec);   // only wet things mirror the sky
  }
  return c;
}
// light from the cabin scattered by the mist along the view ray (closed form for a point light in uniform fog)
vec3 scatter(vec3 ro, vec3 rd, float t){
  vec3 s = vec3(0.);
  for (int i = 0; i < 6; i++) {
    vec3 q = uLp[i] - ro; float s0 = dot(q, rd); float h = sqrt(max(dot(q, q) - s0 * s0, 0.)) + uLs[i];
    float a = (atan((t - s0) / h) + atan(s0 / h)) / h;
    vec3 cp = ro + rd * clamp(s0, 0., t);
    float dir = pow(max(dot(normalize(cp - uLp[i]), uLn[i]), 1e-4), uLk[i]);
    s += uLc[i] * a * (0.12 + 0.88 * dir);
  }
  return s;
}
// mist: exponential height fog integrated along the ray, plus the cabin's light in it
vec3 fogged(vec3 col, vec3 P){
  vec3 rd = P - cameraPosition; float d = length(rd); rd /= d;
  float k = rd.y * d / uFogH;
  float od = uFogA * exp(-cameraPosition.y / uFogH) * d * (abs(k) > 1e-3 ? (1. - exp(-k)) / k : 1. - .5 * k);
  return mix(fogSky(rd), col, exp(-od)) + scatter(cameraPosition, rd, d) * uScat;
}
`;
// a bump map from any height field, by screen-space derivatives (fragment shaders only)
const GLSL_BUMP = /* glsl */`
vec3 bumpN(vec3 N, vec3 P, float h, float k){
  vec3 dpx = dFdx(P), dpy = dFdy(P); float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx); float det = dot(dpx, r1);
  vec3 g = (dhx * r1 + dhy * r2) * sign(det);
  return normalize(abs(det) * N - k * g);
}
`;

// sampling the painted atlas: one cell, with mip gradients from a continuous uv (so the seams between branches
// do not drop to the coarsest mip), cover boosted with distance so far sprays do not thin out, and a crisp cut-out
const GLSL_ATLAS = /* glsl */`
uniform sampler2D uAtlas;
vec4 atlas(float cell, vec2 uv, vec2 g){
  vec2 a = vec2((cell + clamp(uv.x, 0.01, 0.99)) / 8., uv.y);
  vec2 dx = dFdx(g) * vec2(0.125, 1.), dy = dFdy(g) * vec2(0.125, 1.);
  vec4 t = textureGrad(uAtlas, a, dx, dy);
  vec2 px = dx * vec2(${AT_W}., ${AT_H}.), py = dy * vec2(${AT_W}., ${AT_H}.);
  t.a = min(1., t.a * (1. + max(0., 0.5 * log2(max(dot(px, px), dot(py, py)))) * 0.35));
  return t;
}
float cutout(float a, float c){ return clamp((a - c) / max(fwidth(a), 1e-4) + 0.5, 0., 1.); }
`;
// thin leaves and needles lit from behind: looking toward where the sun went down they warm up a little
const GLSL_LEAFLIT = /* glsl */`
vec3 leafLit(vec3 alb, vec3 V, vec3 P){ return alb * uGlowCol * 2.4 * pow(max(dot(-V, uGlowDir), 0.), 2.) * mix(0.35, 1., openness(P)); }
`;

// ---------------------------------------------------------------- one material factory for every lit surface
// vertex: object position vO, world position vW, world normal vN, uv, per-instance data vI (attribute aI if present);
// `vpre` edits p/n in object space, `vpost` edits the world position w. fragment `body` sets alb, N, ao, wrap, spec,
// alpha, emis; the result is lit by shade() and put in the mist.
const SU = {
  uTime: { value: 0 }, uNight: { value: 0 }, uFlick: { value: 1 }, uFogA: { value: 0.017 }, uFogH: { value: 14 }, uScat: { value: 0.006 },
  uSkyA: { value: new THREE.Vector3() }, uSkyG: { value: new THREE.Vector3() }, uGlowDir: { value: GLOW_DIR.clone() },
  uGlowCol: { value: new THREE.Vector3() }, uFogCol: { value: new THREE.Vector3() },
  uLp: { value: [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3()) }, uLn: { value: [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3()) },
  uLc: { value: [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3()) }, uLk: { value: [1, 1, 1, 1, 1, 1] },
  uClear: { value: new THREE.Vector2(...toWorld(0, 3)) }, uWind: { value: new THREE.Vector2(0.8, 0.6).normalize() },
  uCabInv: { value: new THREE.Matrix4() }, uAtlas: { value: null }, uLs: { value: [1.6, 1.0, 0.3, 0.9, 0.9, 1.6] },
};
function surf({ vert = "", vpre = "", vpost = "", frag = "", body = "", uniforms = {}, defines = {}, side = THREE.FrontSide, inst = false, ...extra } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...SU, ...uniforms }, defines: { ...defines, ...(inst ? { HAS_AI: "" } : {}), ...(side === THREE.DoubleSide ? { DOUBLE: "" } : {}) }, side, ...extra,
    vertexShader: `${GLSL_COMMON}
varying vec3 vW, vN, vO; varying vec2 vUv; varying vec4 vI;
#ifdef HAS_AI
attribute vec4 aI;
#endif
${vert}
void main(){
  vec3 p = position, n = normal;
  vO = position; vUv = uv;
  #ifdef HAS_AI
  vI = aI;
  #else
  vI = vec4(0.);
  #endif
  ${vpre}
  mat4 M = modelMatrix;
  #ifdef USE_INSTANCING
  M = M * instanceMatrix;
  #endif
  vec4 w = M * vec4(p, 1.);
  vN = normalize(transpose(inverse(mat3(M))) * n);
  ${vpost}
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
    fragmentShader: `${GLSL_COMMON}${GLSL_LIGHT}${GLSL_BUMP}
varying vec3 vW, vN, vO; varying vec2 vUv; varying vec4 vI;
${frag}
void main(){
  vec3 N = normalize(vN);
  #ifdef DOUBLE
  if (!gl_FrontFacing) N = -N;
  #endif
  vec3 V = normalize(cameraPosition - vW);
  vec3 alb = vec3(0.3), emis = vec3(0.); float ao = 1., wrap = 0., spec = 0., alpha = 1.;
  ${body}
  vec3 col = shade(alb, N, vW, ao, wrap, spec) + emis;
  gl_FragColor = vec4(fogged(col, vW), alpha);
}`,
  });
}

// ---------------------------------------------------------------- trunks: bark per species, moss at the foot, lichen
// aI: kind (0 spruce, 1 pine, 2 larch, 3 dead snag), crown base (fraction of the height), seed
const TRUNK = {
  inst: true,
  vert: "varying float vH, vR, vFl;",
  vpre: `
  float Hh = length(instanceMatrix[1].xyz), ym = position.y * Hh;                   // metres up the trunk
  vFl = pow(0.5 + 0.5 * sin(atan(position.z, position.x) * (3. + floor(vI.z * 3.)) + vI.z * 60.), 2.) * exp(-ym * 2.6);
  p.xz *= 1. + vFl * 0.8;                                                           // buttress roots flaring out of the ground`,
  vpost: `
  vH = length(M[1].xyz); vR = length(M[0].xyz);
  vec2 wv = uWind * (0.5 + 0.5 * sin(uTime * 0.45 + vI.z * 40.)) + vec2(sin(uTime * 0.9 + vI.z * 20.), cos(uTime * 0.8 + vI.z * 13.)) * 0.35;
  w.xz += wv * p.y * p.y * vH * 0.005;`,
  frag: "varying float vH, vR, vFl;" + GLSL_LEAFLIT,
  body: `
  float kind = vI.x, hgt = vO.y * vH;
  vec3 q = vec3(vO.x * vR, hgt, vO.z * vR);
  float hb, plates;
  if (kind < 0.5) {               // spruce: grey-brown, small thin scales over long shallow furrows
    float fur = n3(vec3(q.x * 26., hgt * 1.4, q.z * 26.));
    plates = (n3(q * vec3(16., 5., 16.)) * 0.6 + n3(q * vec3(40., 14., 40.)) * 0.4) * 0.65 + fur * 0.35;
    alb = mix(vec3(0.08, 0.062, 0.055), vec3(0.25, 0.185, 0.14), smoothstep(0.3, 0.7, plates));
    hb = plates;
  } else if (kind < 1.5) {        // pine: deep grey plates below, thin orange flakes high up
    float f = n3(q * vec3(5., 0.9, 5.)) * 0.7 + n3(q * vec3(13., 3., 13.)) * 0.3;
    float up = smoothstep(0.42, 0.62, vO.y + (n3(q * 2.) - 0.5) * 0.15);
    plates = mix(smoothstep(0.38, 0.5, f), n3(q * vec3(22., 9., 22.)), up);
    alb = mix(mix(vec3(0.06, 0.045, 0.035), vec3(0.26, 0.21, 0.17), plates), mix(vec3(0.32, 0.13, 0.05), vec3(0.62, 0.32, 0.14), plates), up);
    hb = plates;
  } else if (kind < 2.5) {        // larch: reddish brown, deeply furrowed, the ridges catching the light
    float f = n3(q * vec3(7., 1.3, 7.)) * 0.7 + n3(q * vec3(20., 5., 20.)) * 0.3;
    plates = smoothstep(0.36, 0.52, f);
    alb = mix(vec3(0.05, 0.026, 0.018), vec3(0.34, 0.165, 0.095), plates);
    hb = plates;
  } else {                        // a dead snag: bark gone, silver wood split along the grain
    plates = n3(q * vec3(30., 1.5, 30.));
    alb = mix(vec3(0.13, 0.12, 0.11), vec3(0.33, 0.31, 0.28), smoothstep(0.25, 0.6, plates));
    hb = plates;
  }
  float cv = n3(q * 1.3 + vI.z * 10.);
  alb *= 0.8 + 0.4 * cv;
  float tv = fract(vI.z * 37.1);                                                    // every tree its own bark: warm or cold, pale or dark
  alb *= mix(vec3(1.07, 0.97, 0.88), vec3(0.9, 0.98, 1.08), tv) * (0.8 + 0.4 * fract(vI.z * 91.3)) * (0.85 + 0.3 * n3(vec3(vO.x, hgt * 0.15, vO.z) * 2. + vI.z * 7.));
  alb *= 1. - 0.45 * smoothstep(0.7, 0., vFl) * smoothstep(0.9, 0., hgt);           // damp and dark between the roots
  // moss creeping up from the roots, more on one side; pale lichen higher up
  float side = dot(normalize(q.xz + 1e-4), normalize(vec2(0.4, 1.)));
  float moss = smoothstep(0.9 + 0.8 * side, 0.1, hgt + (n3(q * 4.) - 0.5) * 0.9) * smoothstep(0.2, 0.5, n3(q * 6. + 3.) + 0.2);
  moss = clamp(moss + vFl * 0.35 * smoothstep(0.2, 0.5, n3(q * 6. + 3.) + 0.2), 0., 1.);
  alb = mix(alb, vec3(0.08, 0.13, 0.03) * (0.7 + 0.6 * n3(q * 25.)), moss * step(kind, 2.5));
  vec2 dir = q.xz / max(length(q.xz), 1e-4);
  float lich = smoothstep(0.64, 0.74, n3(vec3(dir * 2.2, hgt * 0.9) + 7. + vI.z * 20.) * 0.7 + n3(vec3(dir * 9., hgt * 4.)) * 0.3) * smoothstep(0.8, 2.5, hgt) * (1. - smoothstep(10., 16., hgt));
  alb = mix(alb, vec3(0.36, 0.40, 0.33), lich * 0.75 * step(kind, 1.5));
  // resin and the odd knot where a branch was shed
  float knot = smoothstep(0.8, 0.9, n3(vec3(dir * 8., hgt * 5.) + vI.z * 31.)) * step(1.5, hgt) * step(kind, 1.5);
  alb = mix(alb, vec3(0.04, 0.025, 0.02), knot * 0.6);
  N = bumpN(N, vW, hb * 0.014 + moss * 0.01 + knot * 0.01, 1.);
  ao = mix(0.5, 1., smoothstep(0., 1.5, hgt)) * mix(1., 0.55, smoothstep(vI.y * vH, vI.y * vH + 4., hgt));
  emis = alb * uSkyA * (0.12 + 0.7 * pow(1. - abs(dot(N, V)), 2.)) * smoothstep(0.1, 1.2, hgt) + leafLit(alb, V, vW) * 0.3;   // sky on the trunk's edges, so the bark reads against the mist
  wrap = 0.2;`,
};

// dead lower branches bristling from the bare trunks: two crossed cards with the painted dead branch
const TWIG = {
  inst: true, side: THREE.DoubleSide, frag: GLSL_ATLAS,
  body: `
  vec4 t = atlas(4., vUv, vUv);
  alpha = cutout(t.a, 0.4);
  if (alpha < 0.02) discard;
  alb = mix(vec3(0.07, 0.06, 0.05), vec3(0.24, 0.22, 0.19), t.r) * (0.8 + 0.4 * hash12(vI.xy));
  alb = mix(alb, vec3(0.34, 0.38, 0.30), smoothstep(0.3, 0.45, t.g) * smoothstep(0.75, 0.6, t.g));
  N = normalize(vN + vec3(0., 0.6, 0.));
  ao = 0.8; wrap = 0.5;`,
  alphaToCoverage: true,
};

// ---------------------------------------------------------------- crowns: whorls of branches round the trunk
// One whorl is a drooping disc: uv.x runs round it (one branch per unit), uv.y from the trunk to the tips. The
// branches are drawn in the fragment shader (rachis, herringbone twigs, ragged needle fringe) and cut out with
// alpha-to-coverage. aI: kind, height in the crown (0 bottom .. 1 top), seed, sway amplitude
const WHORL = {
  inst: true, side: THREE.DoubleSide, frag: GLSL_ATLAS + GLSL_LEAFLIT,
  vpost: `
  vec2 wv = uWind * (0.5 + 0.5 * sin(uTime * 0.45 + vI.z * 40.)) + vec2(sin(uTime * 0.9 + vI.z * 20.), cos(uTime * 0.8 + vI.z * 13.)) * 0.35;
  w.xz += wv * vI.w;
  float tip = uv.y * uv.y;
  w.xyz += vec3(sin(uTime * 2.3 + w.x * 1.7 + w.y), sin(uTime * 1.9 + w.z * 1.3) * 0.6, cos(uTime * 2.1 + w.z * 1.5 + w.y)) * 0.05 * tip * (0.5 + uWind.x * 0.5);`,
  body: `
  float kind = vI.x;
  float bi = floor(vUv.x), bh = hash12(vec2(bi, vI.z * 91.7)), tv = fract(vI.z * 37.1);
  float cell = kind < 0.5 ? step(0.5, bh) : kind < 1.5 ? 3. : 2.;
  vec2 uv = vec2(fract(vUv.x), vUv.y);
  if (fract(bh * 7.3) > 0.5) uv.x = 1. - uv.x;
  vec4 t = atlas(cell, uv, vUv);
  alpha = cutout(t.a, 0.45);
  if (alpha < 0.02) discard;
  vec3 green = kind < 0.5 ? mix(vec3(0.04, 0.08, 0.07), vec3(0.06, 0.085, 0.04), tv) : kind < 1.5 ? vec3(0.07, 0.09, 0.035) : vec3(0.55, 0.36, 0.07);
  if (kind > 1.5) green *= mix(vec3(1.), vec3(1.15, 0.8, 0.5), tv * 0.7);                                  // larches turned at different rates
  green *= (0.8 + 0.4 * bh) * (0.35 + t.r * 1.1);
  alb = mix(green, vec3(0.09, 0.07, 0.055) * (0.5 + t.r), t.g);
  float tip = smoothstep(0.7, 1., vUv.y);
  alb = mix(alb, alb * vec3(1.35, 1.45, 1.1), tip * 0.6);                                                  // paler new growth at the tips
  ao = mix(0.4, 1., smoothstep(0., 0.8, vUv.y)) * mix(0.6, 1., vI.y);
  N = normalize(N + vec3(t.r - 0.6, 0., bh - 0.5) * 0.6);
  emis = alb * uSkyA * 0.35 * (0.3 + 0.7 * tip) * mix(0.5, 1., vI.y) * (1. - t.g) + leafLit(alb, V, vW) * (0.4 + 0.6 * tip) * (kind > 1.5 ? 0.5 : 1.);   // the outer tips catch the sky, backlit needles glow
  wrap = 0.6;`,
  alphaToCoverage: true,
};

// ---------------------------------------------------------------- the forest floor
// needle litter (single needles drawn up close), moss, the bare trodden path with puddles, larch gold near the clearing
const GROUND = {
  frag: `
uniform vec2 uPath[${PATH.length}];
float pathDist(vec2 p){
  float d = 1e9;
  for (int i = 0; i < ${PATH.length - 1}; i++) {
    vec2 a = uPath[i], b = uPath[i + 1], ab = b - a;
    float t = clamp(dot(p - a, ab) / dot(ab, ab), 0., 1.);
    d = min(d, length(p - a - ab * t));
  }
  return d;
}
vec2 needles(vec2 p, float seed){            // cover and a tone per needle
  vec2 c = floor(p), f = fract(p), m = vec2(0.);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(i, j), id = c + o;
    float a = hash12(id + seed) * 6.2832; vec2 dir = vec2(cos(a), sin(a));
    vec2 q = f - o - vec2(hash12(id + seed + 3.1), hash12(id + seed + 7.7));
    float t = clamp(dot(q, dir), -0.85, 0.85);
    float cv = smoothstep(0.1, 0.03, length(q - dir * t)) * (0.5 + 0.5 * hash12(id + seed + 1.3));
    if (cv > m.x) m = vec2(cv, hash12(id + seed + 5.9));
  }
  return m;
}
// fallen birch, rowan and larch leaves: small flat ovals in clumps
vec4 leaves(vec2 p){
  vec2 c = p * 7., id = floor(c), f = fract(c) - 0.5;
  float h = hash12(id + 41.), a = h * 6.2832, sz = 0.6 + 0.8 * hash12(id + 23.);
  vec2 q = f - (vec2(hash12(id + 13.), hash12(id + 17.)) - 0.5) * 0.4, d = vec2(cos(a), sin(a));
  float cov = smoothstep(1., 0.6, length(vec2(dot(q, d) / (0.26 * sz), dot(q, vec2(-d.y, d.x)) / (0.14 * sz)))) * step(0.62, hash12(id + 5.));
  vec3 col = h < 0.35 ? vec3(0.40, 0.27, 0.05) : h < 0.65 ? vec3(0.30, 0.085, 0.035) : vec3(0.19, 0.13, 0.045);
  return vec4(col * (0.6 + 0.6 * hash12(id + 29.)), cov * smoothstep(0.45, 0.72, vnoise(p * 0.7 + 17.)));
}`,
  body: `
  vec2 p = vW.xz;
  float dp = pathDist(p) + (vnoise(p * 2.3) - 0.5) * 0.35;
  float path = smoothstep(0.7, 0.3, dp), wear = smoothstep(1.3, 0.5, dp);
  float trod = smoothstep(1.9, 0.8, dp + (vnoise(p * 6.) - 0.5) * 0.5 + (vnoise(p * 1.7 + 4.) - 0.5) * 0.5);   // the beaten strip either side of the path, ragged at its edge
  float big = fbm(p * 0.3), mid = vnoise(p * 2.1);
  alb = mix(vec3(0.10, 0.055, 0.03), vec3(0.26, 0.135, 0.06), smoothstep(0.3, 0.7, big * 0.7 + mid * 0.3));
  alb = mix(alb, vec3(0.21, 0.15, 0.105) * (0.7 + 0.5 * mid) * (0.85 + 0.3 * vnoise(p * 14.)), trod * 0.7);   // packed earth showing through, paler than the litter
  // single needles, two sizes, each its own tone, fading out where they shrink below a pixel; fewer on the trodden strip
  float fw = length(fwidth(p));
  float nk = smoothstep(0.03, 0.006, fw) * (1. - trod * 0.6);
  vec2 n1 = needles(p * 22., 0.), n2 = needles(p * 37. + 5., 9.);
  n2.x *= 0.8;
  vec2 nn = n1.x > n2.x ? n1 : n2;
  float nd = nn.x;
  vec3 nc = mix(vec3(0.17, 0.095, 0.06), vec3(0.42, 0.21, 0.08), smoothstep(0.1, 0.8, nn.y));
  nc = mix(nc, vec3(0.44, 0.34, 0.16), smoothstep(0.9, 0.99, nn.y));                    // the odd pale one, fresh from the spruce
  alb *= mix(1., 0.5 + 0.5 * nd, nk);
  alb = mix(alb, nc * (0.75 + 0.5 * big), nd * nk * 0.75);
  float hgt = nd * nk * 0.004 + mid * 0.02 + vnoise(p * 9.) * 0.01;
  // moss cushions on the humps, a little gold from the larches nearer the clearing
  float op = openness(vW);
  float m = smoothstep(0.62, 0.76, fbm(p * 0.2 + 7.) * 0.8 + vnoise(p * 1.3) * 0.25) * (1. - wear);
  float mt = vnoise(p * 30.) * 0.5 + vnoise(p * 7.) * 0.5;
  alb = mix(alb, mix(vec3(0.05, 0.08, 0.02), vec3(0.15, 0.20, 0.05), mt), m);
  hgt += m * (0.03 + mt * 0.02);
  float gold = smoothstep(0.5, 0.85, vnoise(p * 0.9 + 3.) * 0.5 + op * 0.6) * (1. - m) * (1. - path);
  alb = mix(alb, vec3(0.36, 0.20, 0.05) * (0.6 + nd * 0.6), gold * 0.55);
  vec4 lf = leaves(p);
  lf.a *= (1. - m) * smoothstep(0.06, 0.015, fw) * (1. - path * 0.6);
  alb = mix(alb, lf.rgb, lf.a * 0.9);
  hgt += lf.a * 0.004;
  vec2 pc = p * 13., pid = floor(pc), pf = fract(pc) - 0.5;                              // pebbles trodden into the strip
  float peb = smoothstep(0.2, 0.1, length(pf - (vec2(hash12(pid + 61.), hash12(pid + 67.)) - 0.5) * 0.5)) * step(0.82, hash12(pid + 71.)) * trod * smoothstep(0.05, 0.015, fw);
  alb = mix(alb, vec3(0.30, 0.27, 0.23) * (0.6 + 0.8 * hash12(pid + 73.)), peb);
  hgt += peb * 0.012;
  // the path: a strip beaten into the needles, darker and flattened, worn bare down the middle, a root across it now
  // and then, rain standing in the bare hollows
  float bare = smoothstep(0.5, 0.12, dp) * smoothstep(0.35, 0.65, vnoise(p * 0.8 + 4.));
  vec3 trodC = mix(vec3(0.12, 0.07, 0.04), vec3(0.24, 0.135, 0.065), vnoise(p * 3.) * 0.6 + nd * nk * 0.4);   // flattened needles, paler than the loose litter
  alb = mix(alb, trodC, path * 0.85);
  alb = mix(alb, vec3(0.09, 0.065, 0.045) * (0.8 + 0.4 * vnoise(p * 9.)), bare * 0.55);
  float rl = abs(sin(dot(p, vec2(0.8, 0.6)) * 1.1 + vnoise(p * 0.6) * 7.));
  float root = smoothstep(0.08, 0.02, rl) * step(0.72, vnoise(p * 0.35 + 7.)) * path;
  alb = mix(alb, vec3(0.13, 0.085, 0.05) * (0.8 + 0.4 * vnoise(p * 20.)), root);
  hgt = hgt * mix(1., 0.3, path) + root * 0.025;
  float pud = smoothstep(0.78, 0.84, vnoise(p * 1.2 + 21.) * 0.65 + vnoise(p * 3.3) * 0.35) * bare;
  alb *= 1. - pud * 0.5;
  spec = pud * 300. + path * 8.;
  N = bumpN(N, vW, hgt * (1. - pud), 1.);
  N = normalize(mix(N, vec3(0., 1., 0.), pud));
  // contact darkening round the cabin
  vec3 cl = (uCabInv * vec4(vW, 1.)).xyz;
  ao = mix(1., 0.45, smoothstep(1.2, 0., abs(abs(cl.x) - ${(B * (1 + (Y0 - EAVE) / HR)).toFixed(3)}) + max(abs(cl.z) - ${(ZG + 0.9).toFixed(2)}, 0.) * 3.));
  wrap = 0.1;`,
};

// soft dark discs under the trees (the forest floor is darker round every trunk)
const BLOB = {
  vertexShader: `
  varying vec2 vUv; varying vec3 vW;
  void main(){ vUv = uv; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `
  varying vec2 vUv; varying vec3 vW;
  void main(){ vec2 c = vUv - 0.5; float d = length(c) * 2. * (1. + 0.14 * sin(atan(c.y, c.x) * 5. + vW.x * 7. + vW.z * 3.)); gl_FragColor = vec4(0., 0., 0., smoothstep(1., 0.15, d) * 0.55); }`,
};

// ---------------------------------------------------------------- undergrowth
// bracken gone rusty, the odd frond still green: the painted frond on a curved strip. aI: colour, seed
const FERN = {
  inst: true, side: THREE.DoubleSide, frag: GLSL_ATLAS + GLSL_LEAFLIT,
  vpost: `w.xz += uWind * sin(uTime * 1.3 + vI.y * 30.) * 0.04 * uv.y * uv.y;`,
  body: `
  vec4 t = atlas(5., vUv, vUv);
  alpha = cutout(t.a, 0.45);
  if (alpha < 0.02) discard;
  float k = vI.x;
  alb = k < 0.6 ? mix(vec3(0.30, 0.11, 0.03), vec3(0.46, 0.25, 0.06), k / 0.6) : mix(vec3(0.40, 0.32, 0.07), vec3(0.13, 0.18, 0.04), (k - 0.6) / 0.4);
  alb = mix(alb, vec3(0.34, 0.085, 0.035), smoothstep(0.8, 0.95, vI.y) * 0.7 * step(k, 0.6));          // a few gone oxblood,
  alb = mix(alb, vec3(0.52, 0.36, 0.08), smoothstep(0.2, 0.05, vI.y) * 0.6 * step(k, 0.6));            // a few ginger
  alb *= (0.55 + 0.7 * t.r) * (0.85 + 0.3 * fract(vI.y * 13.));
  alb = mix(alb, vec3(0.16, 0.09, 0.04), t.g * 0.6);
  alb = mix(alb, vec3(0.2, 0.11, 0.05), smoothstep(0.8, 1., vUv.y) * 0.5);                             // dry brown tips
  N = normalize(vN + vec3(0., 0.8, 0.));
  ao = mix(0.45, 1., vUv.y);
  emis = leafLit(alb, V, vW);
  wrap = 0.5;`,
  alphaToCoverage: true,
};
// low sprigs of blueberry and lingonberry turned crimson, on crossed cards. aI: colour, seed
const SPRIG = {
  inst: true, side: THREE.DoubleSide, frag: GLSL_ATLAS,
  body: `
  vec4 t = atlas(7., vUv, vUv);
  alpha = cutout(t.a, 0.45);
  if (alpha < 0.02) discard;
  alb = mix(vec3(0.26, 0.05, 0.04), vec3(0.15, 0.12, 0.035), vI.x) * (0.45 + 0.6 * t.r) * (0.8 + 0.4 * fract(vI.y * 11.));
  alb = mix(alb, vec3(0.34, 0.14, 0.04) * (0.5 + 0.6 * t.r), smoothstep(0.7, 0.9, fract(vI.y * 7.)) * 0.6);       // some turned orange
  alb = mix(alb, vec3(0.12, 0.05, 0.03), t.g);
  N = normalize(vN * 0.3 + vec3(0., 1., 0.));
  ao = mix(0.4, 1., vUv.y); wrap = 0.5;`,
  alphaToCoverage: true,
};
// saplings of birch and rowan in their autumn colours: the sprig on taller crossed cards. aI: colour, seed
const SAPLING = {
  inst: true, side: THREE.DoubleSide, frag: GLSL_ATLAS + GLSL_LEAFLIT,
  vpost: `w.xz += uWind * (0.04 + 0.04 * sin(uTime * 1.5 + vI.y * 20.)) * uv.y * uv.y;`,
  body: `
  vec4 t = atlas(7., vUv, vUv);
  alpha = cutout(t.a, 0.45);
  if (alpha < 0.02) discard;
  float k = vI.x;
  alb = (k < 0.55 ? mix(vec3(0.50, 0.36, 0.06), vec3(0.42, 0.24, 0.04), k / 0.55) : mix(vec3(0.42, 0.14, 0.03), vec3(0.30, 0.05, 0.03), (k - 0.55) / 0.45)) * (0.45 + 0.65 * t.r);
  alb = mix(alb, vec3(0.10, 0.07, 0.05), t.g);
  alb *= 0.85 + 0.3 * fract(vI.y * 9.);
  N = normalize(vN * 0.3 + vec3(0., 1., 0.));
  ao = mix(0.45, 1., vUv.y); wrap = 0.6;
  emis = leafLit(alb, V, vW) * 0.8;                                                                    // thin leaves, lit from behind`,
  alphaToCoverage: true,
};
// tufts of dry grass in the clearing
const GRASS = {
  inst: true, side: THREE.DoubleSide, frag: GLSL_ATLAS + GLSL_LEAFLIT,
  vpost: `w.xz += uWind * (0.06 + 0.05 * sin(uTime * 1.7 + vI.y * 20. + w.x)) * uv.y * uv.y;`,
  body: `
  vec4 t = atlas(6., vUv, vUv);
  alpha = cutout(t.a, 0.45);
  if (alpha < 0.02) discard;
  alb = mix(vec3(0.16, 0.12, 0.06), vec3(0.45, 0.37, 0.19), vUv.y) * (0.6 + 0.6 * t.r) * (0.75 + 0.5 * vI.x);
  alb = mix(alb, vec3(0.12, 0.14, 0.05), t.g * 0.5);
  alb = mix(alb, vec3(0.30, 0.2, 0.07) * (0.6 + 0.6 * t.r), smoothstep(0.7, 0.95, vI.y) * 0.5);         // a few tufts gone foxy
  N = normalize(vN * 0.3 + vec3(0., 1., 0.));
  ao = mix(0.35, 1., vUv.y); wrap = 0.5;
  emis = leafLit(alb, V, vW) * smoothstep(0.2, 1., vUv.y) * 0.6;`,
  alphaToCoverage: true,
};
// moss cushions on the ground and on stones
const MOSS = {
  inst: true,
  vpre: `float mk = n3(p * 2.5 + vI.x * 10.); p.xz *= 0.7 + 0.6 * mk; p.y *= 0.5 + 0.9 * mk;`,
  body: `
  float m = n3(vW * 28.) * 0.5 + n3(vW * 7.) * 0.5;
  alb = mix(vec3(0.05, 0.08, 0.02), vec3(0.17, 0.22, 0.05), m) * (0.8 + 0.4 * vI.x);
  N = bumpN(N, vW, n3(vW * 40.) * 0.01, 1.);
  ao = mix(0.6, 1., clamp(vO.y * 2., 0., 1.));
  emis = alb * uSkyA * pow(1. - abs(dot(N, V)), 3.) * 0.6;          // the velvet sheen at the rim
  wrap = 0.4;`,
};
// boulders, grey with lichen and moss on top
const ROCK = {
  inst: true,
  body: `
  float g = n3(vW * 3.) * 0.6 + n3(vW * 14.) * 0.4;
  alb = mix(vec3(0.10, 0.10, 0.10), vec3(0.26, 0.25, 0.24), g);
  alb *= mix(vec3(1.1, 1., 0.9), vec3(0.9, 1., 1.1), n3(vW * 0.6));                                    // some stones warm, some cold
  alb = mix(alb, vec3(0.36, 0.40, 0.31), smoothstep(0.66, 0.74, n3(vW * 9.) * 0.6 + n3(vW * 31.) * 0.4) * 0.55);   // crusts of lichen
  float strata = smoothstep(0.4, 0.6, n3(vec3(vW.x * 1.5, vW.y * 14., vW.z * 1.5)));
  alb *= 0.8 + 0.3 * strata;
  float moss = smoothstep(0.35, 0.7, N.y + (n3(vW * 2.) - 0.5) * 0.6);
  alb = mix(alb, vec3(0.07, 0.11, 0.03) * (0.7 + 0.6 * n3(vW * 20.)), moss);
  N = bumpN(N, vW, g * 0.03 + strata * 0.004, 1.);
  spec = 30.;`,
};
// fly agarics and brown ceps
const MUSHROOM = {
  inst: true,
  vpre: "vI.y = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);",     // a number per mushroom
  body: `
  float kind = vI.x, mv = vI.y;
  if (vO.y > 0.5) {         // the cap
    vec2 c = vO.xz * 9.; vec2 id = floor(c), f = fract(c) - 0.5;
    float spot = smoothstep(0.22, 0.14, length(f + (vec2(hash12(id), hash12(id + 3.)) - 0.5) * 0.4)) * step(0.4, hash12(id + 7.));
    vec3 cap = kind < 0.5 ? mix(vec3(0.55, 0.06, 0.02), vec3(0.66, 0.14, 0.03), mv) : mix(vec3(0.28, 0.15, 0.07), vec3(0.42, 0.25, 0.12), mv);
    cap = mix(cap, cap * 1.5 + 0.1, kind < 0.5 ? 0. : smoothstep(0.35, 0.05, vO.y) * 0.4);          // paler rim on the ceps
    alb = kind < 0.5 ? mix(cap, vec3(0.85, 0.82, 0.72), spot * smoothstep(0.6, 0.75, vO.y)) : cap;
    spec = 90.;
    wrap = 0.3;
  } else {
    alb = kind < 0.5 ? vec3(0.75, 0.72, 0.62) : vec3(0.55, 0.48, 0.38);
    alb = mix(alb, vec3(0.2, 0.14, 0.08), smoothstep(0.4, 0., vO.y) * 0.7);                        // earth on the foot
    alb *= 0.85 + 0.3 * n3(vec3(vO.x * 30., vO.y * 3., vO.z * 30.));
    wrap = 0.3;
  }`,
};
// pumpkins on the steps: ribbed, glossy, a dry stalk; and spruce cones on the floor
const PUMPKIN = {
  inst: true,
  body: `
  float a = atan(vO.z, vO.x), rib = cos(a * 9.), r = length(vO.xz);
  if (vO.y > 0.86 && r < 0.2) {                          // the stalk: green at the root, dry and ridged above
    alb = mix(vec3(0.11, 0.12, 0.04), vec3(0.32, 0.23, 0.1), smoothstep(0.9, 1.3, vO.y)) * (0.7 + 0.6 * n3(vec3(a * 3., vO.y * 30., 1.)));
    N = bumpN(N, vW, sin(a * 5.) * 0.004, 1.);
  } else {
    alb = mix(vec3(0.55, 0.16, 0.02), vec3(0.75, 0.38, 0.05), vI.x) * (0.72 + 0.28 * (rib * 0.5 + 0.5)) * (0.85 + 0.3 * n3(vO * 6.));
    alb = mix(alb, vec3(0.2, 0.17, 0.04), smoothstep(0.84, 0.96, vO.y) * 0.6);       // dull and greenish round the stalk
    N = bumpN(N, vW, rib * 0.01 + n3(vO * 40.) * 0.002, 1.);
    ao = mix(1., 0.55, smoothstep(0.8, 0.95, vO.y));
    spec = 40.;
  }
  wrap = 0.2;`,
};
const CONE = {
  inst: true,
  vpre: "p.xy *= mix(0.5, 1.15, smoothstep(-1., 0.6, p.z));",                                        // fat at the stalk end, a blunt point
  body: `
  float a = atan(vO.y, vO.x);
  float sc = fract(vO.z * 5. + a / 6.2832 * 3.);                                                      // scales in spirals
  alb = mix(vec3(0.07, 0.04, 0.025), vec3(0.30, 0.17, 0.08), smoothstep(0.1, 0.7, sc)) * (0.75 + 0.5 * vI.x);
  alb = mix(alb, vec3(0.1, 0.06, 0.035), smoothstep(0.75, 1., sc) * 0.6);
  N = bumpN(N, vW, sc * 0.004, 1.);
  wrap = 0.2;`,
};

// fallen logs and stumps: moss on top, bark on the sides, rotten end grain
const DEADWOOD = {
  inst: true,
  body: `
  float b = n3(vec3(vO.x * 6., vO.y * 6., vO.z * 1.5) + vI.y * 10.);
  alb = mix(vec3(0.06, 0.045, 0.035), vec3(0.20, 0.15, 0.11), smoothstep(0.3, 0.7, b));
  float moss = smoothstep(0.1, 0.6, N.y + (n3(vW * 3.) - 0.5) * 0.8);
  alb = mix(alb, vec3(0.06, 0.11, 0.025) * (0.7 + 0.6 * n3(vW * 22.)), moss);
  alb = mix(alb, vec3(0.34, 0.37, 0.30), smoothstep(0.66, 0.76, n3(vW * 7.) * 0.7 + n3(vW * 29.) * 0.3) * 0.5 * (1. - moss));   // lichen
  if (abs(vO.z) > 0.4995) {                                                                           // end grain: pale rings of rotten wood
    float r = length(vO.xy);
    alb = mix(vec3(0.30, 0.22, 0.15), vec3(0.16, 0.10, 0.07), smoothstep(0.3, 0.7, sin(r * 70. + vI.y * 9.) * 0.5 + 0.5)) * (0.8 + 0.4 * n3(vW * 15.));
  }
  N = bumpN(N, vW, b * 0.02, 1.);
  wrap = 0.2;`,
};

// ---------------------------------------------------------------- the cabin's outside
// boards in the cabin's own frame: uDir is the board direction, uCol the colour; nailed-on gaps, grain, weathering
const BOARDS = {
  uniforms: { uDir: { value: new THREE.Vector3(0, 1, 0) }, uCol: { value: new THREE.Vector3(0.26, 0.22, 0.18) }, uW: { value: 0.16 } },
  frag: "uniform vec3 uDir, uCol; uniform float uW;",
  body: `
  vec3 cl = (uCabInv * vec4(vW, 1.)).xyz, nl = normalize(mat3(uCabInv) * N);
  vec3 ad = cross(nl, uDir); if (dot(ad, ad) < 0.01) ad = cross(nl, vec3(1., 0., 0.)); ad = normalize(ad);
  float a = dot(cl, ad) / uW, al = dot(cl, uDir);
  float id = floor(a), f = fract(a);
  float fw = fwidth(a), gw = min(0.05 + fw, 0.45);                  // seen from afar the gaps widen to a pixel and the bump fades
  float gap = smoothstep(0.0, gw, f) * smoothstep(1., 1. - gw, f);
  float grain = vnoise(vec2(al * 3. + id * 7.3, f * 9.)) * 0.6 + vnoise(vec2(al * 21., f * 30. + id)) * 0.4;
  alb = uCol * (0.75 + 0.45 * hash12(vec2(id, 3.7))) * (0.75 + 0.45 * grain) * mix(0.35, 1., gap);
  alb *= 1. - 0.25 * smoothstep(0.6, 0.9, n3(cl * vec3(1.5, 4., 1.5)));
  // knots with a darker ring, in 30 x 80 cm cells along the board
  vec2 kg = vec2(dot(cl, ad) * 3.2, al * 1.2), kid = floor(kg), kf = fract(kg);
  float kd = length((kf - (vec2(hash12(kid + 2.1), hash12(kid + 7.7)) * 0.6 + 0.2)) * vec2(0.31, 0.83)), kh = step(0.74, hash12(kid));
  alb *= 1. - kh * (0.55 * smoothstep(0.04, 0.012, kd) + 0.14 * smoothstep(0.1, 0.03, kd) * (0.6 + 0.4 * sin(kd * 150.)));
  float top = smoothstep(0.6, 0.95, nl.y);
  alb = mix(alb, vec3(0.34, 0.32, 0.29) * (0.75 + 0.5 * grain), top * 0.4 * smoothstep(0.3, 0.7, n3(cl * vec3(2., 9., 2.))));       // sun and rain silver the tops
  alb *= 1. + 0.18 * top * smoothstep(0.55, 0.15, abs(cl.x)) * step(${ZG.toFixed(2)}, cl.z);                                       // worn pale from the door to the steps
  // fallen leaves on anything flat: 60 cm cells, some with a leaf, turned at random
  vec2 lg = cl.xz * 1.7, lid = floor(lg), lf = fract(lg) - 0.5; float la = hash12(lid + 4.4) * 6.2832;
  vec2 lq = mat2(cos(la), sin(la), -sin(la), cos(la)) * (lf - (vec2(hash12(lid), hash12(lid + 1.9)) - 0.5) * 0.4);
  float leaf = top * step(0.68, hash12(lid + 8.8)) * smoothstep(0.1, 0.07, length(lq * vec2(1., 2.2)));
  alb = mix(alb, mix(vec3(0.5, 0.2, 0.04), vec3(0.62, 0.38, 0.06), hash12(lid + 3.3)) * (0.8 + 0.4 * abs(lq.y * 8.)), leaf);
  N = bumpN(N, vW, (gap * 0.004 + grain * 0.0015) * smoothstep(0.5, 0.12, fw) + leaf * 0.003, 1.);
  spec = 8.;`,
};
// the roof slabs: weathered cedar shingles, moss, a drift of needles, and on the side you see a roof window
const ROOF = {
  frag: `
  const float SA = ${Math.sin(ALPHA).toFixed(5)};`,
  body: `
  vec3 cl = (uCabInv * vec4(vW, 1.)).xyz, nl = mat3(uCabInv) * N;
  float s = (cl.y - ${EAVE.toFixed(2)}) / SA;                // up the slope from the eave
  if (nl.y > 0.2) {
    float row = s / 0.18, ri = floor(row), rf = fract(row);
    float tab = (cl.z + hash12(vec2(ri, 1.)) * 0.3) / (0.22 + 0.1 * hash12(vec2(ri, 2.)));
    float ti = floor(tab), tf = fract(tab);
    float th = hash12(vec2(ri, ti));
    float edge = smoothstep(0.0, 0.12, rf) * smoothstep(0., 0.04, tf) * smoothstep(1., 0.96, tf);
    alb = mix(vec3(0.07, 0.06, 0.055), vec3(0.17, 0.14, 0.12), th) * mix(0.3, 1., edge);
    alb *= 0.8 + 0.4 * vnoise(vec2(cl.z * 30. + ti, rf * 5.));
    float moss = smoothstep(0.55, 0.75, n3(vec3(cl.z * 0.7, s * 0.9, 1.)) + smoothstep(2.5, 0., s) * 0.3 + smoothstep(0.6, 0., abs(abs(cl.z) - 5.1)) * 0.2);
    alb = mix(alb, vec3(0.06, 0.10, 0.025) * (0.6 + 0.8 * n3(cl * 20.)), moss);
    float ndl = smoothstep(0.45, 0.8, n3(vec3(cl.z * 2., s * 2., 4.)) + smoothstep(1.5, 0., s) * 0.4) * (1. - moss);
    alb = mix(alb, vec3(0.22, 0.10, 0.04) * (0.6 + 0.8 * vnoise(cl.zy * 60.)), ndl * 0.7);
    float lichen = smoothstep(0.74, 0.82, n3(cl * 11. + 2.) * 0.7 + n3(cl * 31.) * 0.3) * (1. - moss) * smoothstep(0.45, 0.7, th);        // pale grey-green crusts on the odd old shingle
    alb = mix(alb, vec3(0.30, 0.33, 0.25) * (0.8 + 0.4 * vnoise(cl.zy * 90.)), lichen * 0.4);
    N = bumpN(N, vW, (1. - rf) * 0.012 + moss * 0.02 + lichen * 0.004, 1.);
    spec = (1. - moss) * 20.;
    // a galvanised drip edge along the eave and up both gable edges
    float de = max(0.17 - s, max(cl.z - ${(ZG + 0.81).toFixed(2)}, -4.71 - cl.z));
    if (de > 0.) {
      alb = vec3(0.17, 0.185, 0.2) * (0.75 + 0.5 * vnoise(vec2(cl.z * 40., s * 40.))) * mix(0.5, 1., smoothstep(0., 0.02, de));
      spec = 70.;
    }
    // a roof window on each side, between s 2.9 and 4.35 and z -0.4 and 1.0
    if (s > 2.9 && s < 4.35 && cl.z > -0.4 && cl.z < 1.0) {
      float fr = min(min(s - 2.9, 4.35 - s), min(cl.z + 0.4, 1.0 - cl.z));
      if (fr < 0.08) { alb = vec3(0.05, 0.05, 0.05); spec = 60.; }
      else {
        vec2 g = vec2((cl.z - 0.3) / 0.6, (s - 3.62) / 0.6);
        vec3 inside = vec3(1.0, 0.55, 0.24) * (0.7 + 0.6 * exp(-dot(g - vec2(0., -0.5), g - vec2(0., -0.5)) * 2.)) * 1.2 * uFlick;
        inside *= mix(1., 0.45, step(0.82, fract(cl.z * 1.6 + 0.2)));                    // rafters inside
        if (abs(cl.z - 0.3) < 0.03 || abs(s - 3.62) < 0.03) inside = vec3(0.04);
        float fr2 = 0.04 + 0.96 * pow(1. - max(dot(N, V), 0.), 5.);
        alb = vec3(0.); emis = inside * (1. - fr2) + fogSky(reflect(-V, N)) * fr2;
      }
    }
  } else {
    // the slab's edges: a dark fascia board
    alb = vec3(0.07, 0.05, 0.04) * (0.8 + 0.4 * vnoise(cl.xy * 20.));
  }
  wrap = 0.1;`,
};
const METAL = {
  uniforms: { uCol: { value: new THREE.Vector3(0.025, 0.025, 0.025) } },
  frag: "uniform vec3 uCol;",
  body: `alb = uCol * (0.8 + 0.4 * n3(vW * 12.)); spec = 90.; float rust = smoothstep(0.6, 0.8, n3(vW * 5.)); alb = mix(alb, vec3(0.12, 0.05, 0.02), rust * 0.6); spec *= 1. - rust;`,
};
// big rough stones laid in courses, in the cabin's frame (the back gable, the chimney stack, the footing)
const GLSL_STONES = /* glsl */`
vec3 stoneCell(vec2 q){            // distance to the nearest joint, the stone's own random number, distance to its centre
  vec2 id = floor(q), f = fract(q), bi = vec2(0.); float d1 = 9., d2 = 9.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(i, j), c = o + vec2(hash12(id + o), hash12(id + o + 5.3)) * 0.8 + 0.1 - f; float d = dot(c, c);
    if (d < d1) { d2 = d1; d1 = d; bi = id + o; } else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d2) - sqrt(d1), hash12(bi * 1.7 + 0.3), sqrt(d1));
}`;
const STONEWALL = {
  frag: GLSL_STONES,
  body: `
  vec3 cl = (uCabInv * vec4(vW, 1.)).xyz, nl = mat3(uCabInv) * N;
  vec2 q = abs(nl.z) > 0.6 ? cl.xy : abs(nl.x) > 0.6 ? cl.zy : cl.xz;
  vec3 st = stoneCell(q * vec2(1.4, 2.2) + 0.5);
  float stone = smoothstep(0.03, 0.1, st.x);
  float tex = n3(cl * 7.) * 0.6 + n3(cl * 23.) * 0.4;
  vec3 sc = mix(vec3(0.16, 0.155, 0.145), vec3(0.34, 0.31, 0.27), st.y);
  sc = mix(sc, vec3(0.29, 0.22, 0.15), step(0.8, fract(st.y * 7.)) * 0.6);           // a few rusty ones
  sc *= 0.75 + 0.5 * tex;
  sc *= mix(vec3(1.06, 0.98, 0.9), vec3(0.92, 0.98, 1.06), fract(st.y * 13.));                                         // some stones warm, some cold
  alb = mix(vec3(0.19, 0.18, 0.16) * (0.7 + 0.6 * tex), sc, stone);                                                   // lime mortar between
  float moss = smoothstep(0.55, 0.8, n3(cl * 1.3) + smoothstep(1.4, 0., cl.y) * 0.45);
  alb = mix(alb, vec3(0.06, 0.10, 0.025) * (0.7 + 0.6 * tex), moss * mix(0.85, 0.3, stone));
  alb = mix(alb, vec3(0.38, 0.4, 0.33), smoothstep(0.72, 0.8, n3(cl * 15. + 3.) * 0.6 + n3(cl * 41.) * 0.4) * stone * 0.55);       // lichen speckle
  N = bumpN(N, vW, stone * smoothstep(0.03, 0.3, st.x) * 0.03 + tex * 0.004, 1.);
  ao = mix(0.6, 1., stone);
  spec = 12.;
  // a small deep-set window high in the back wall, lit from the loft
  if (nl.z < -0.6 && cl.z > -${(ZG + 0.05).toFixed(2)} && cl.x > 1.0 && cl.x < 1.55 && cl.y > ${(YL + 0.35).toFixed(2)} && cl.y < ${(YL + 1.0).toFixed(2)}) {
    float fx = min(cl.x - 1.0, 1.55 - cl.x), fy = min(cl.y - ${(YL + 0.35).toFixed(2)}, ${(YL + 1.0).toFixed(2)} - cl.y);
    if (min(fx, fy) < 0.06 || abs(cl.x - 1.275) < 0.02) alb = vec3(0.12, 0.07, 0.04);
    else { alb = vec3(0.); emis = vec3(1.0, 0.56, 0.25) * 1.1 * uFlick; spec = 0.; }
  }`,
};
// the lantern's glass and the stove's glow are plain emitters
const GLOWMAT = {
  uniforms: { uCol: { value: new THREE.Vector3(3, 1.6, 0.6) } },
  frag: "uniform vec3 uCol;",
  body: "alb = vec3(0.); emis = uCol * (0.85 + 0.15 * uFlick);",
};

// ---------------------------------------------------------------- the front gable and the room behind it
// The gable is one triangle: boards, the door, two windows and the big glazing above are all laid out in its fragment
// shader. Behind the glass the room is ray-traced in the cabin's frame: floor, the two sloping roof planes, the back
// wall with a bookshelf, the loft over the back half with string lights on its railing, a stove, a sofa, a table, a
// pendant lamp, and someone walking about.
const GABLE = {
  frag: GLSL_STONES + `
const float B = ${B.toFixed(2)}, HR = ${HR.toFixed(2)}, Y0 = ${Y0.toFixed(2)}, ZG = ${ZG.toFixed(2)}, YL = ${YL.toFixed(2)}, ZL = ${ZL.toFixed(2)}, EI = 0.3;
float tHit, idHit; vec3 nHit;
void plane(vec3 ro, vec3 rd, vec3 n, float d, float id){        // a plane dot(n, p) = d, seen from the side n points to
  float den = dot(n, rd); if (den >= 0.) return;
  float t = (d - dot(n, ro)) / den;
  if (t > 0. && t < tHit) { tHit = t; nHit = n; idHit = id; }
}
void box(vec3 ro, vec3 rd, vec3 c, vec3 h, float id){
  vec3 m = 1. / rd, n = m * (ro - c), k = abs(m) * h, t1 = -n - k, t2 = -n + k;
  float tN = max(max(t1.x, t1.y), t1.z), tF = min(min(t2.x, t2.y), t2.z);
  if (tN > tF || tN < 0. || tN > tHit) return;
  tHit = tN; idHit = id; nHit = -sign(rd) * step(t1.yzx, t1.xyz) * step(t1.zxy, t1.xyz);
}
float cap(vec2 p, vec2 a, vec2 b, float r){ vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.)) - r; }
// someone at home: walks from the stove to the window, stands there with a cup, walks to the shelf, sits a while
float person(vec2 p, float w, float walking, out float part){
  float s = sin(w) * walking, c = cos(w);
  vec2 hip = vec2(0., 0.93 + abs(c) * 0.025 * walking), sh = hip + vec2(0.02, 0.5), hd = sh + vec2(0.03, 0.2);
  vec2 f1 = vec2(0.27 * s, 0.05), f2 = vec2(-0.27 * s, 0.05);
  float d = cap(p, hip, sh, 0.17); part = 1.;
  float dh = length(p - hd) - 0.11; if (dh < d) { d = dh; part = 0.; }
  float dl = min(cap(p, hip, mix(hip, f1, 0.5) + vec2(0.05, 0.), 0.08), cap(p, mix(hip, f1, 0.5) + vec2(0.05, 0.), f1, 0.065));
  dl = min(dl, min(cap(p, hip, mix(hip, f2, 0.5) + vec2(0.05, 0.), 0.08), cap(p, mix(hip, f2, 0.5) + vec2(0.05, 0.), f2, 0.065)));
  if (dl < d) { d = dl; part = 2.; }
  float da = min(cap(p, sh, sh + vec2(0.22 * s, -0.52), 0.055), cap(p, sh, sh + vec2(-0.22 * s + (1. - walking) * 0.2, -0.45 + (1. - walking) * 0.25), 0.055));
  if (da < d) { d = da; part = 1.; }
  return d;
}
vec3 lampP(){ return vec3(0.35, Y0 + 4.4, 1.7); }
vec3 roomLight(vec3 P, vec3 n){
  vec3 L1 = lampP() - P, L2 = vec3(0., Y0 + 0.35, -ZG + 0.75) - P, L3 = vec3(2.55, Y0 + 1.55, -1.7) - P;
  float d1 = dot(L1, L1), d2 = dot(L2, L2), d3 = dot(L3, L3);
  vec3 c = vec3(1.0, 0.62, 0.32) * 5.0 * max(dot(n, normalize(L1)), 0.) / (d1 + 0.3);
  c += vec3(1.0, 0.42, 0.12) * 3.0 * uFlick * max(dot(n, normalize(L2)), 0.) / (d2 + 0.2);
  c += vec3(1.0, 0.6, 0.3) * 1.8 * max(dot(n, normalize(L3)), 0.) / (d3 + 0.2);
  return c + vec3(0.30, 0.17, 0.09) * (0.8 + 0.2 * uFlick);
}
vec3 plaid(vec2 q, vec3 c1, vec3 c2){                // a woollen check: two tones crossing, a pale line, the weave
  vec3 c = mix(c1, c2, 0.5 * (step(0.5, fract(q.x)) + step(0.5, fract(q.y))));
  c = mix(c, vec3(0.7, 0.62, 0.45), 0.45 * min(1., step(0.92, fract(q.x * 0.5)) + step(0.92, fract(q.y * 0.5))));
  return c * (0.8 + 0.4 * vnoise(q * 40.));
}
void ellipsoid(vec3 ro, vec3 rd, vec3 c, vec3 r, float id){        // leafy: a ray may pass through the gaps
  vec3 oc = (ro - c) / r, d = rd / r; float a = dot(d, d), b = dot(oc, d), h = b * b - a * (dot(oc, oc) - 1.);
  if (h < 0.) return;
  for (int k = 0; k < 2; k++) {
    float t = (-b + (k == 0 ? -1. : 1.) * sqrt(h)) / a; if (t <= 0. || t >= tHit) continue;
    vec3 p = ro + rd * t;
    if (vnoise(p.xy * 11. + p.z * 5.) * 0.6 + vnoise(p.xy * 27. - p.z * 9.) * 0.4 > 0.4 + 0.2 * (p.y - c.y) / r.y) continue;
    tHit = t; idHit = 20.; nHit = normalize((oc + d * t) / r) * (k == 0 ? 1. : -1.); return;
  }
}
vec3 boards(vec2 q, float w, vec3 col){
  float id = floor(q.x / w), f = fract(q.x / w);
  return col * (0.8 + 0.35 * hash12(vec2(id, 1.3))) * (0.85 + 0.25 * vnoise(vec2(q.y * 4. + id * 5., f * 6.))) * mix(0.45, 1., smoothstep(0., 0.06, f) * smoothstep(1., 0.94, f));
}
vec3 room(vec3 ro, vec3 rd){
  tHit = 1e4; idHit = 0.; nHit = vec3(0., 0., 1.);
  float L = length(vec2(HR, B));
  plane(ro, rd, vec3(0., 1., 0.), Y0 + 0.02, 1.);                                    // floor
  plane(ro, rd, vec3(0., 0., 1.), -ZG + 0.25, 2.);                                   // back wall
  plane(ro, rd, -vec3(HR, B, 0.) / L, -((B - EI) * HR + Y0 * B) / L, 3.);           // the roof planes, from inside
  plane(ro, rd, vec3(HR, -B, 0.) / L, -((B - EI) * HR + Y0 * B) / L, 3.);
  // the loft over the back half: its underside, its floor, the fascia and the railing
  if (rd.y > 0.) { float t = (YL - 0.22 - ro.y) / rd.y; vec3 p = ro + rd * t; if (t > 0. && t < tHit && p.z < ZL) { tHit = t; idHit = 5.; nHit = vec3(0., -1., 0.); } }
  if (rd.y < 0. && ro.y > YL) { float t = (YL - ro.y) / rd.y; vec3 p = ro + rd * t; if (t > 0. && t < tHit && p.z < ZL) { tHit = t; idHit = 6.; nHit = vec3(0., 1., 0.); } }
  { float t = (ZL - ro.z) / rd.z; vec3 p = ro + rd * t;
    if (t > 0. && t < tHit) {
      if (p.y > YL - 0.22 && p.y < YL + 0.02) { tHit = t; idHit = 7.; nHit = vec3(0., 0., 1.); }
      else if (p.y > YL && p.y < YL + 1.0 && (fract(p.x / 0.13) < 0.22 || p.y > YL + 0.93)) { tHit = t; idHit = 8.; nHit = vec3(0., 0., 1.); }
    } }
  box(ro, rd, vec3(0.3, Y0 + 0.24, -1.15), vec3(1.05, 0.24, 0.42), 10.);           // the sofa, facing the hearth
  box(ro, rd, vec3(0.3, Y0 + 0.5, -0.68), vec3(1.05, 0.5, 0.1), 10.);
  box(ro, rd, vec3(0., Y0 + 1.1, -ZG + 0.33), vec3(0.95, 0.06, 0.1), 11.);        // the mantel
  box(ro, rd, vec3(0.6, Y0 + 0.22, 0.6), vec3(0.45, 0.04, 0.3), 11.);              // a low table
  box(ro, rd, vec3(0.0, YL + 0.2, -2.6), vec3(0.85, 0.2, 1.05), 12.);             // the bed in the loft: mattress, plaid blanket, two pillows, a headboard
  box(ro, rd, vec3(0.0, YL + 0.43, -2.3), vec3(0.87, 0.04, 0.78), 16.);
  box(ro, rd, vec3(-0.38, YL + 0.5, -3.45), vec3(0.3, 0.09, 0.17), 17.);
  box(ro, rd, vec3(0.38, YL + 0.5, -3.45), vec3(0.3, 0.09, 0.17), 17.);
  box(ro, rd, vec3(0.0, YL + 0.6, -3.68), vec3(0.9, 0.35, 0.03), 11.);
  box(ro, rd, vec3(-1.05, YL + 0.8, ZL + 0.03), vec3(0.38, 0.17, 0.02), 16.);     // a throw over the loft rail
  box(ro, rd, vec3(0.85, Y0 + 1.02, -0.68), vec3(0.42, 0.022, 0.14), 16.);        // a plaid blanket over the sofa's back, a cushion behind it
  box(ro, rd, vec3(0.85, Y0 + 0.8, -0.558), vec3(0.42, 0.22, 0.018), 16.);
  box(ro, rd, vec3(-0.45, Y0 + 0.82, -0.88), vec3(0.22, 0.34, 0.08), 17.);
  box(ro, rd, vec3(0.78, Y0 + 0.31, 0.58), vec3(0.04, 0.05, 0.04), 18.);          // a mug and a stack of books on the low table
  box(ro, rd, vec3(0.38, Y0 + 0.3, 0.7), vec3(0.14, 0.04, 0.1), 19.);
  ellipsoid(ro, rd, vec3(-2.5, Y0 + 0.95, -ZG + 0.62), vec3(0.45, 0.55, 0.42), 20.);    // a plant in the corner, in its pot
  box(ro, rd, vec3(-2.5, Y0 + 0.2, -ZG + 0.62), vec3(0.17, 0.2, 0.17), 21.);
  box(ro, rd, vec3(-0.55, Y0 + 1.24, -ZG + 0.33), vec3(0.022, 0.08, 0.022), 22.);   // on the mantel: two candles, a picture, a jar
  box(ro, rd, vec3(-0.42, Y0 + 1.21, -ZG + 0.33), vec3(0.022, 0.05, 0.022), 22.);
  box(ro, rd, vec3(0.3, Y0 + 1.33, -ZG + 0.4), vec3(0.15, 0.17, 0.012), 23.);
  box(ro, rd, vec3(0.74, Y0 + 1.25, -ZG + 0.33), vec3(0.05, 0.09, 0.05), 24.);
  box(ro, rd, vec3(-1.5, Y0 + 0.28, -ZG + 0.62), vec3(0.4, 0.28, 0.3), 25.);       // logs stacked beside the hearth
  { float t = (-2. - ro.z) / rd.z; vec3 p = ro + rd * t;                          // a garland swagged between the roof planes
    if (rd.z < 0. && t > 0. && t < tHit && abs(p.x) < 1.4 && abs(p.y - (Y0 + 4.25 + 0.255 * p.x * p.x)) < 0.05 + 0.03 * vnoise(vec2(p.x * 30., 1.))) { tHit = t; idHit = 26.; nHit = vec3(0., 0., 1.); } }
  // the pendant lamp and its cord
  vec3 lp = lampP();
  { vec3 oc = ro - lp; float b = dot(oc, rd), c = dot(oc, oc) - 0.16 * 0.16, h = b * b - c;
    if (h > 0.) { float t = -b - sqrt(h); if (t > 0. && t < tHit) { tHit = t; idHit = 13.; nHit = normalize(oc + rd * t); } } }
  { vec2 o = ro.xz - lp.xz; float t = -dot(o, rd.xz) / dot(rd.xz, rd.xz); float y = ro.y + rd.y * t;
    if (t > 0. && t < tHit && length(o + rd.xz * t) < 0.012 && y > lp.y && y < Y0 + HR) { tHit = t; idHit = 14.; nHit = vec3(0., 0., 1.); } }
  // the person, on a plane just behind the windows
  float ph = mod(uTime, 46.), px, walking = 0., face = 1.;
  if (ph < 5.) { px = -1.6 + ph / 5. * 3.4; walking = 1.; }
  else if (ph < 17.) { px = 1.8; face = -1.; }
  else if (ph < 23.) { px = 1.8 - (ph - 17.) / 6. * 3.4; walking = 1.; face = -1.; }
  else px = -1.6;
  float fpart = 0.;
  { float t = (0.7 - ro.z) / rd.z; vec3 p = ro + rd * t;
    if (t > 0. && t < tHit && ph < 23.) {
      float d = person(vec2((p.x - px) * face, p.y - Y0), ph * 6.3, walking, fpart);
      if (d < 0.) { tHit = t; idHit = 15.; nHit = vec3(0., 0., 1.); }
    } }
  vec3 P = ro + rd * tHit, n = nHit, alb = vec3(0.5), e = vec3(0.);
  if (idHit < 1.5) {
    alb = boards(P.xz * vec2(1., 0.25), 0.14, vec3(0.42, 0.25, 0.12));
    vec2 rq = vec2(P.x - 0.5, P.z + 0.1), ra = abs(rq) / vec2(1.3, 1.6);
    float rb = max(ra.x, ra.y);
    if (rb < 1.) {                                                                     // a rug: a dark border with cream dots, a lattice of diamonds
      vec2 d = abs(fract(rq * vec2(1.6, 1.3)) - 0.5);
      vec3 red = vec3(0.40, 0.07, 0.04), cream = vec3(0.62, 0.45, 0.22), ink = vec3(0.12, 0.06, 0.05);
      alb = mix(red, cream, step(d.x + d.y, 0.22)) * mix(1., 0.8, step(d.x + d.y, 0.1));
      if (rb > 0.9) alb = mix(ink, cream, step(0.7, fract(rq.x * 9. + rq.y * 9.)) * step(rb, 0.97));
      else if (rb > 0.86) alb = cream;
      alb *= (0.85 + 0.3 * vnoise(rq * 45.)) * 0.85;
    } else if (abs(rq.x) < 1.3 && abs(rq.y) < 1.7) alb = vec3(0.6, 0.5, 0.35) * step(0.4, fract(rq.x * 40.)) * 0.8 + 0.05;       // the fringe
    else if (P.z < -${ZG.toFixed(2)} + 1.05 && abs(P.x) < 1.15) alb = vec3(0.22, 0.2, 0.18) * (0.8 + 0.4 * hash12(floor(P.xz * vec2(2.4, 3.)))) * (0.8 + 0.3 * vnoise(P.xz * 30.));   // slate in front of the hearth
  } else if (idHit < 2.5) {
    // the inside of the stone wall: the open hearth in the middle, a bookshelf to the right
    vec3 st = stoneCell(P.xy * vec2(1.4, 2.2) + 0.5);
    alb = mix(vec3(0.15, 0.12, 0.10), mix(vec3(0.30, 0.26, 0.22), vec3(0.46, 0.40, 0.33), st.y), smoothstep(0.03, 0.1, st.x));
    if (abs(P.x) < 0.62 && P.y < Y0 + 0.95) {
      // the open fire: two logs on an ember bed, tongues of flame leaning in the draught, glowing cracks in the bark
      vec2 fq = vec2(P.x * 1.6, (P.y - Y0) / 0.95);
      float sway = 0.12 * sin(fq.y * 5. - uTime * 3. + fq.x * 3.) * fq.y, xq = fq.x + sway;
      float fl = vnoise(vec2(xq * 6., fq.y * 3. - uTime * 2.5)) * 0.7 + vnoise(vec2(xq * 13., fq.y * 6. - uTime * 4.)) * 0.3;
      float tall = 0.75 + 0.3 * vnoise(vec2(xq * 3. + 5., uTime * 1.2));
      float flame = smoothstep(0.75, 0.0, fq.y / tall + abs(xq) * 0.9 - fl * 0.55);
      float lg = max(smoothstep(0.075, 0.05, abs(fq.y - 0.11 - 0.05 * fq.x)) * step(abs(fq.x), 0.85), smoothstep(0.065, 0.04, abs(fq.y - 0.25 + 0.05 * fq.x - 0.02 * sin(fq.x * 5.))) * step(abs(fq.x + 0.05), 0.6));
      float crack = smoothstep(0.58, 0.8, vnoise(vec2(fq.x * 14., fq.y * 38.) + vnoise(vec2(fq.x * 5., fq.y * 9.)) * 3.));
      alb = mix(vec3(0.015), vec3(0.05, 0.032, 0.02) * (0.5 + vnoise(vec2(fq.x * 30., fq.y * 6.))), lg);
      e = mix(vec3(0.6, 0.12, 0.02), vec3(1.7, 0.95, 0.35), flame) * flame * 4. * uFlick * (1. - 0.6 * lg);
      e += vec3(1.6, 0.4, 0.07) * lg * crack * (1.2 + 0.8 * uFlick);
      e += vec3(1.2, 0.3, 0.05) * smoothstep(0.1, 0., fq.y) * (0.6 + 1.6 * vnoise(vec2(fq.x * 25., fq.y * 20. + uTime * 0.4))) * uFlick;     // embers
      e += vec3(0.5, 0.12, 0.02) * smoothstep(0.25, 0., fq.y) * 1.2;
    } else if (abs(P.x) < 0.72 && P.y > Y0 + 0.95 && P.y < Y0 + 1.04) alb = vec3(0.025);        // an iron lintel
    else if (abs(P.x) < 0.9 && P.y < Y0 + 1.04) alb *= 0.45 + 0.55 * smoothstep(0., 0.28, abs(P.x) - 0.62);      // soot round the opening
    else if (P.x > 1.05 && P.x < 2.5 && P.y < Y0 + 2.3) {
      float sh = fract((P.y - Y0) / 0.38);
      float bk = floor((P.x + floor((P.y - Y0) / 0.38) * 0.37) / 0.045);
      vec3 bc = vec3(hash12(vec2(bk, 1.)), hash12(vec2(bk, 2.)), hash12(vec2(bk, 3.)));
      alb = sh < 0.08 ? vec3(0.35, 0.2, 0.1) : mix(vec3(0.5, 0.42, 0.3), vec3(0.45, 0.12, 0.08), bc.x) * (0.4 + 0.6 * bc.y) * step(sh, 0.78 + bc.z * 0.2);
    }
  } else if (idHit < 3.5) {
    float sl = (P.y - Y0) / sin(${ALPHA.toFixed(4)});
    alb = boards(vec2(sl, P.z), 0.13, vec3(0.62, 0.42, 0.24));
    if (abs(fract((P.z + 4.7) / 1.6) - 0.5) > 0.44) alb = vec3(0.3, 0.18, 0.09);          // rafters
  } else if (idHit < 5.5) alb = boards(P.xz, 0.14, vec3(0.5, 0.32, 0.17)) * 0.8;
  else if (idHit < 6.5) alb = boards(P.xz, 0.14, vec3(0.5, 0.32, 0.17));
  else if (idHit < 8.5) {
    alb = vec3(0.32, 0.19, 0.09);
    // string lights along the railing
    float sx = P.x / 0.28; vec2 sp = vec2((fract(sx) - 0.5) * 0.28, P.y - (YL + 0.86 - 0.05 * sin(fract(P.x / 1.4) * 3.1416)));
    e += vec3(1.0, 0.7, 0.35) * 6. * smoothstep(0.03, 0.008, length(sp));
  }
  else if (idHit < 9.25) {
    alb = vec3(0.03);
    if (n.z > 0.5 && abs(P.x + 1.5) < 0.2 && abs(P.y - Y0 - 0.45) < 0.17) {
      vec2 fq = vec2((P.x + 1.5) * 5., (P.y - Y0 - 0.28) * 3.);
      float fl = vnoise(vec2(fq.x * 3., fq.y * 2. - uTime * 3.)) * (1. - fq.y);
      e = mix(vec3(0.9, 0.2, 0.03), vec3(1.6, 0.9, 0.3), fl) * (2.5 + 2. * fl) * uFlick;
    }
  } else if (idHit < 9.75) alb = vec3(0.03);
  else if (idHit < 10.5) {                                                                      // the sofa: rust wool, cushion seams on the back
    alb = vec3(0.34, 0.15, 0.06) * (0.8 + 0.4 * vnoise(P.xy * 50. + P.z * 30.));
    if (n.z > 0.5) alb *= 1. - 0.45 * smoothstep(0.02, 0., (0.5 - abs(fract((P.x - 0.3) / 0.7 + 0.5) - 0.5)) * 0.7);
  }
  else if (idHit < 11.5) alb = vec3(0.3, 0.17, 0.08) * (0.8 + 0.4 * vnoise(vec2(P.x * 3. + P.z * 40., P.y * 40.)));
  else if (idHit < 12.5) alb = vec3(0.62, 0.56, 0.44) * (0.85 + 0.3 * vnoise(P.xz * 40.));                  // linen
  else if (idHit < 13.5) { alb = vec3(0.); e = vec3(1.0, 0.7, 0.4) * 9.; }
  else if (idHit < 14.5) alb = vec3(0.02);
  else if (idHit < 15.5) alb = fpart < 0.5 ? vec3(0.55, 0.36, 0.26) : fpart < 1.5 ? vec3(0.10, 0.22, 0.20) : vec3(0.06, 0.06, 0.08);
  else if (idHit < 16.5) alb = plaid(idHit < 16.5 && n.y > 0.5 ? P.xz * 2.5 : P.xy * 2.5, vec3(0.55, 0.36, 0.08), vec3(0.13, 0.22, 0.17));
  else if (idHit < 17.5) alb = mix(vec3(0.68, 0.6, 0.47), vec3(0.5, 0.3, 0.12), step(0.8, fract(P.x * 7.))) * (0.85 + 0.3 * vnoise(P.xz * 50. + P.y * 40.));     // cream wool, a rust stripe
  else if (idHit < 18.5) alb = vec3(0.55, 0.52, 0.45);                                            // the mug (cream glaze)
  else if (idHit < 19.5) alb = n.y > 0.5 ? vec3(0.4, 0.3, 0.2) : mix(vec3(0.5, 0.15, 0.1), vec3(0.15, 0.3, 0.3), step(0.5, fract(P.y * 14.)));
  else if (idHit < 20.5) alb = mix(vec3(0.07, 0.17, 0.04), vec3(0.2, 0.32, 0.07), vnoise(P.xy * 12. + P.z * 4.)) * (0.7 + 0.5 * (P.y - Y0 - 0.9));
  else if (idHit < 21.5) alb = vec3(0.45, 0.2, 0.1) * (0.8 + 0.4 * vnoise(P.xy * 30.));        // terracotta
  else if (idHit < 22.5) { alb = vec3(0.7, 0.62, 0.45); if (n.y > 0.5) e = vec3(1.0, 0.55, 0.2) * 6.; }  // candles, the flame a warm dot
  else if (idHit < 23.5) {                                                                        // a picture: night, pines, a pale moon
    vec2 g = (P.xy - vec2(0.3, Y0 + 1.33)) / vec2(0.15, 0.17);
    alb = vec3(0.3, 0.2, 0.1);
    if (n.z > 0.5 && abs(g.x) < 0.8 && abs(g.y) < 0.82) { alb = mix(vec3(0.05, 0.07, 0.11), vec3(0.14, 0.14, 0.2), g.y * 0.5 + 0.5); alb = mix(alb, vec3(0.7, 0.68, 0.55), smoothstep(0.13, 0.1, length(g - vec2(0.4, 0.4)))); float gx = fract(g.x * 2.2 + 0.3) - 0.5; alb = mix(alb, vec3(0.015, 0.025, 0.02), step(g.y, (0.5 - abs(gx)) * 1.6 - 0.8 + 0.5 * hash12(vec2(floor(g.x * 2.2 + 0.3), 1.)))); }
  }
  else if (idHit < 24.5) { alb = vec3(0.5, 0.3, 0.1); if (n.z > 0.5) e = vec3(1.0, 0.7, 0.3) * (0.3 + 0.3 * vnoise(vec2(P.y * 20., 3.))); }   // a jar of dried flowers, catching the light
  else if (idHit < 25.5) {                                                                        // end grain of stacked logs
    vec2 q = P.xy * 11. + vec2(floor(P.y * 11.) * 0.5, 0.), id = floor(q), f = fract(q) - 0.5;
    float r = length(f * 1.05);
    alb = n.z > 0.5 ? mix(vec3(0.1, 0.07, 0.05), mix(vec3(0.62, 0.46, 0.27), vec3(0.46, 0.3, 0.15), 0.5 + 0.5 * sin(r * 34.)), smoothstep(0.58, 0.48, r)) * (0.75 + 0.5 * hash12(id)) : vec3(0.15, 0.1, 0.07);
  }
  else { alb = vec3(0.25, 0.08, 0.04); float lf = floor(P.x * 9.); alb = mix(alb, vec3(0.7, 0.45, 0.08), step(0.33, hash12(vec2(lf, 2.)))); alb = mix(alb, vec3(0.45, 0.14, 0.04), step(0.66, hash12(vec2(lf, 2.)))); alb *= 0.8 + 0.5 * hash12(vec2(lf, 7.));
    vec2 sp = vec2((fract(P.x / 0.35) - 0.5) * 0.35, P.y - (Y0 + 4.2 + 0.255 * P.x * P.x)); e += vec3(1.0, 0.7, 0.35) * 6. * smoothstep(0.03, 0.008, length(sp)); }                // dried leaves, a tiny bulb between them
  return alb * roomLight(P, n) + e;
}`,
  body: `
  vec3 cl = (uCabInv * vec4(vW, 1.)).xyz;
  float x = cl.x, y = cl.y, ax = abs(x);
  float half_ = B * (1. - (y - Y0) / HR);
  float edge = (half_ - ax) * ${Math.sin(ALPHA).toFixed(4)};
  float glass = 0.;
  vec3 frameCol = vec3(0.40, 0.25, 0.13);
  alb = boards(vec2(x, y), 0.15, vec3(0.30, 0.25, 0.20)) * (0.7 + 0.4 * vnoise(vec2(x * 2., y * 0.7)));
  {                                                                                     // weathering: knots, rain streaks, damp and splash at the foot, the shadow under the eaves
    float bi = floor(x / 0.15), kc = y * 0.9 + hash12(vec2(bi, 9.)) * 7.;
    float kd = length(vec2((fract(x / 0.15) - 0.5) * 0.15 * 1.3, (fract(kc) - 0.5) / 0.9 * 0.55)), kh = step(0.8, hash12(vec2(bi, floor(kc))));
    alb *= 1. - kh * (0.5 * smoothstep(0.03, 0.008, kd) + 0.14 * smoothstep(0.07, 0.02, kd) * (0.6 + 0.4 * sin(kd * 260.)));
    alb *= 1. - 0.25 * smoothstep(0.55, 0.9, vnoise(vec2(x * 6.3 + bi * 3.1, y * 0.3 + bi)));
    alb *= mix(0.6, 1., smoothstep(0., 0.4, y - Y0)) * mix(0.75, 1., smoothstep(0.1, 0.9, edge));
    alb *= 1. - 0.3 * smoothstep(0.55, 0., Y0 + 0.8 - y) * step(abs(abs(ax - 1.85) - 0.3), 0.36) * step(y, Y0 + 0.8);        // run-off below the sills
  }
  float curtain = 0.;
  if (edge < 0.2) alb = vec3(0.06, 0.045, 0.035) * (0.8 + 0.4 * vnoise(vec2(x, y) * 10.));                 // the trim under the roof
  else if (y < Y0 + 2.55) {
    if (ax < 0.5 && y < Y0 + 2.1) {                                                     // the door
      if (ax < 0.29 && y > Y0 + 1.15 && y < Y0 + 1.95) glass = 1.;
      else alb = ax > 0.44 || y > Y0 + 2.04 ? frameCol * 0.7 : boards(vec2(x, y), 0.11, vec3(0.45, 0.28, 0.13));
    } else if (abs(ax - 1.85) < 0.56 && y > Y0 + 0.9 && y < Y0 + 2.02) {               // a window each side
      float wx = abs(ax - 1.85), wy = abs(y - Y0 - 1.46);
      if (wx > 0.49 || wy > 0.49 || wx < 0.025 || abs(y - Y0 - 1.6) < 0.025) alb = frameCol;
      else { glass = 1.; curtain = smoothstep(0.33, 0.37, wx + 0.015 * sin(y * 23.) - (y - Y0 - 0.9) * 0.05); }
    } else if (abs(ax - 1.85) < 0.66 && y > Y0 + 0.8 && y < Y0 + 0.9) alb = frameCol * 0.8;    // sill
  } else if (y < Y0 + 2.85) alb = boards(vec2(y, x), 0.3, vec3(0.30, 0.18, 0.09));          // the beam under the glazing
  else {
    if (ax < 0.035 || abs(ax - 1.35) < 0.035 || abs(y - Y0 - 5.3) < 0.035 || edge < 0.3) alb = frameCol;
    else glass = 1.;
  }
  N = bumpN(N, vW, (1. - glass) * smoothstep(0.6, 1., abs(fract(x / 0.15) - 0.5) * 2.) * 0.004, 1.);
  wrap = 0.1;
  if (glass > 0.5) {
    vec3 ro = (uCabInv * vec4(cameraPosition, 1.)).xyz, rd = normalize(cl - ro);
    vec3 inside = room(cl + rd * 0.01, rd);
    if (curtain > 0.) inside = mix(inside, vec3(0.62, 0.24, 0.10) * (0.55 + 0.45 * sin(x * 90. + sin(y * 7.))) * (0.9 + 0.2 * uFlick), curtain * 0.95);
    float fr = 0.04 + 0.96 * pow(1. - max(dot(N, V), 0.), 5.);
    alb = vec3(0.);
    emis = inside * 0.85 * (1. - fr) + fogSky(reflect(-V, N)) * (fr + 0.04);
    spec = 0.;
  }`,
};

// ---------------------------------------------------------------- firewood: rounds, halves and quarters
// geometry in a unit log along z (radius 1, length 1); aI: kind (0 spruce, 1 birch), weathering, seed, radius in metres
const LOG = {
  inst: true,
  vert: "varying vec3 vNo;",
  vpost: "vNo = normal;",
  frag: "varying vec3 vNo;",
  body: `
  float r = length(vO.xy), seed = vI.z;
  if (abs(vNo.z) > 0.5) {                // end grain: rings, sapwood, a radial crack or two, dark bark rim
    float rm = r * vI.w;
    float rings = sin(rm * 2. * 3.1416 / 0.0045 + vnoise(vO.xy * 6. + seed * 30.) * 4.);
    float heart = smoothstep(0.75, 0.3, r);
    alb = mix(vec3(0.56, 0.40, 0.22), vec3(0.42, 0.26, 0.12), heart) * (0.9 + 0.08 * rings);
    if (vI.x > 0.5) alb = mix(vec3(0.62, 0.52, 0.36), vec3(0.5, 0.38, 0.24), heart) * (0.92 + 0.06 * rings);
    float ang = atan(vO.y, vO.x);
    alb *= 1. - 0.6 * smoothstep(0.03, 0.0, abs(fract(ang / 6.2832 * 2. + seed * 7.) - 0.5) - 0.47) * smoothstep(0.2, 0.6, r);
    alb = mix(alb, vec3(0.30, 0.30, 0.28), vI.y * 0.6);            // grey with weather
    alb = mix(alb, vI.x > 0.5 ? vec3(0.6, 0.58, 0.55) : vec3(0.12, 0.08, 0.06), smoothstep(0.88, 0.95, r));
  } else if (r > 0.9) {                  // bark
    float b = n3(vec3(vO.xy * 3., vO.z * 8.) + seed * 20.);
    alb = vI.x > 0.5 ? mix(vec3(0.62, 0.6, 0.56), vec3(0.06, 0.05, 0.05), smoothstep(0.62, 0.7, n3(vec3(vO.xy * 4., vO.z * 30.) + seed * 9.))) : mix(vec3(0.08, 0.06, 0.05), vec3(0.24, 0.18, 0.14), b);
    alb = mix(alb, vec3(0.07, 0.12, 0.03) * (0.7 + 0.6 * n3(vW * 40.)), vI.x < 0.5 ? smoothstep(0.55, 0.75, n3(vec3(vO.xy * 2.5, vO.z * 3.) + seed * 13.)) * vI.y * 1.6 : 0.);     // moss on the old ones
    N = bumpN(N, vW, b * 0.003, 1.);
  } else {                               // a split face: pale, fibrous along the grain
    float f = vnoise(vec2(vO.z * 3., (vO.x + vO.y) * 60.)) * 0.6 + vnoise(vec2(vO.z * 12., (vO.x - vO.y) * 150.)) * 0.4;
    alb = mix(vec3(0.42, 0.30, 0.17), vec3(0.6, 0.45, 0.28), f);
    alb = mix(alb, vec3(0.32, 0.31, 0.28), vI.y * 0.5);
    alb *= 1. - 0.4 * smoothstep(0.8, 0.9, vnoise(vec2(vO.z * 2.5 + seed * 5., (vO.x - vO.y) * 25.))) * (0.4 + vI.y);          // drying checks along the grain
    float kd = length(vec2((vO.z - hash12(vec2(seed, 1.))) * 1.2, (vO.x + vO.y) * 0.5 - hash12(vec2(seed, 2.)) * 0.4 + 0.2));     // a knot, now and then
    alb *= 1. - step(0.7, hash12(vec2(seed, 3.))) * (0.5 * smoothstep(0.07, 0.02, kd) + 0.15 * smoothstep(0.15, 0.05, kd) * sin(kd * 120.));
  }
  alb *= 0.85 + 0.3 * hash12(vec2(seed, 5.));
  wrap = 0.15;`,
};

// ---------------------------------------------------------------- animals: roe deer, a fox, hares
// One rigid body per species, its bones posed in the vertex shader: legs swing in a walk (diagonal pairs) or a hop
// (pairs together), the head goes down to graze and comes up to look round, the tail swishes.
// aI: kind (0 deer, 1 fox, 2 hare), gait phase, how fast it is going (0 standing .. 1), how far the head is down
const ANIMAL = {
  inst: true,
  vert: "attribute float aBn; attribute vec3 aPv, aCol; varying vec3 vCol;",
  vpre: `
  vCol = aCol;
  float kind = vI.x, ph = vI.y, mv = vI.z, gz = vI.w, a = 0.;
  if (aBn > 1.5 && aBn < 5.5) {
    bool hind = aBn > 3.5, left = aBn == 2. || aBn == 4.;
    float off = kind > 1.5 ? (hind ? 2.2 : 0.) + (left ? 0.25 : 0.) : (left == hind ? 0. : 3.1416) + (hind ? 0.6 : 0.);
    a = sin(ph + off) * (kind > 1.5 ? 0.7 : 0.42) * mv;
  } else if (aBn > 0.5 && aBn < 1.5) a = -gz * 1.6 + (1. - gz) * 0.07 * sin(uTime * 0.6 + ph * 0.1 + kind);
  else if (aBn > 5.5) a = sin(uTime * (kind > 0.5 ? 1.7 : 4.5) + ph) * 0.2;
  if (a != 0.) {
    float c = cos(a), s = sin(a); vec2 d = p.xy - aPv.xy;
    p.xy = aPv.xy + vec2(c * d.x - s * d.y, s * d.x + c * d.y); n.xy = vec2(c * n.x - s * n.y, s * n.x + c * n.y);
  }`,
  body: `
  vec3 fq = vO * (vI.x < 0.5 ? 1. : vI.x < 1.5 ? 1.6 : 2.2);                                         // fur in the animal's own frame, so it goes with it
  float fur = n3(fq * vec3(30., 90., 90.)) * 0.5 + n3(fq * vec3(7., 22., 22.)) * 0.5;                 // streaks along the body
  float top = smoothstep(-0.3, 0.9, N.y);
  alb = vCol * (0.78 + 0.4 * fur) * (1.18 - 0.28 * top);                                              // paler underneath
  N = bumpN(N, vW, fur * 0.004, 1.);
  emis = alb * uSkyA * pow(1. - abs(dot(N, V)), 3.) * 0.7 + leafLit(alb, V, vW) * 0.6;               // a rim of sky and the last glow on the coat
  wrap = 0.4;`,
  frag: "varying vec3 vCol;" + GLSL_LEAFLIT,
};
// an animal built from parts in metres, x forward, feet at y = 0: ellipsoids {e: [x, y], r: [rx, ry, rz], rz, rx} and
// tapered limbs {a: [x, y], b: [x, y], r0, r1}, each with a colour c, a bone (0 body, 1 neck and head, 2/3 front legs,
// 4/5 hind legs, 6 tail) and the bone's pivot pv [x, y]. A part with z is mirrored to -z (legs: the bone + 1 there).
function beast(parts) {
  const P = [], N = [], BN = [], PV = [], CL = [], I = [];
  for (const q of parts) {
    (q.z ? [q.z, -q.z] : [0]).forEach((z, side) => {
      const g = q.e ? new THREE.SphereGeometry(1, 14, 9).scale(...q.r).rotateX((q.rx || 0) * (side ? -1 : 1)).rotateZ(q.rz || 0).translate(q.e[0], q.e[1], z)
        : new THREE.CylinderGeometry(q.r1, q.r0, Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1]), 8, 1).rotateZ(-Math.atan2(q.b[0] - q.a[0], q.b[1] - q.a[1])).translate((q.a[0] + q.b[0]) / 2, (q.a[1] + q.b[1]) / 2, z);
      const o0 = P.length / 3, p = g.attributes.position, n = g.attributes.normal, bone = (q.bone || 0) + (q.bone >= 2 && q.bone <= 5 ? side : 0), pv = q.pv || [0, 0];
      for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); BN.push(bone); PV.push(pv[0], pv[1], z); CL.push(...q.c); }
      for (const k of g.index.array) I.push(k + o0);
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute("aBn", new THREE.Float32BufferAttribute(BN, 1)); g.setAttribute("aPv", new THREE.Float32BufferAttribute(PV, 3));
  g.setAttribute("aCol", new THREE.Float32BufferAttribute(CL, 3)); g.setIndex(I);
  return g;
}
const SPECIES = (() => {
  const leg = (bone, z, pv, segs, c, hoof) => [...segs.map(([a, b, r0, r1], i) => ({ a, b, r0, r1, z, bone, pv, c: i === 0 ? c[0] : c[1] })), { e: [segs[segs.length - 1][1][0] + 0.01, 0.022], r: [hoof[0], hoof[1], hoof[2]], z, bone, pv, c: hoof[3] }];
  // roe deer in its grey-brown winter coat: a white rump, a pale belly, a dark muzzle and slender legs
  const dC = [0.21, 0.16, 0.115], dL = [0.33, 0.28, 0.22], dW = [0.72, 0.68, 0.6], dK = [0.035, 0.03, 0.03], dG = [0.16, 0.12, 0.09], dN = [0.3, 0.86];
  const deer = [
    { e: [0, 0.82], r: [0.4, 0.19, 0.14], c: dC }, { e: [0.24, 0.8], r: [0.2, 0.22, 0.145], rz: -0.2, c: dC }, { e: [-0.26, 0.84], r: [0.21, 0.21, 0.15], rz: 0.1, c: dC },
    { e: [-0.37, 0.86], r: [0.085, 0.13, 0.115], c: dW }, { e: [0.02, 0.71], r: [0.32, 0.08, 0.11], c: dL },
    { a: [0.28, 0.84], b: [0.5, 1.17], r0: 0.1, r1: 0.055, bone: 1, pv: dN, c: dC },
    { e: [0.58, 1.2], r: [0.11, 0.075, 0.065], rz: -0.45, bone: 1, pv: dN, c: dC }, { e: [0.69, 1.135], r: [0.075, 0.042, 0.042], rz: -0.6, bone: 1, pv: dN, c: dC },
    { e: [0.745, 1.1], r: [0.026, 0.03, 0.036], bone: 1, pv: dN, c: dK }, { e: [0.6, 1.17], r: [0.02, 0.02, 0.02], z: 0.05, bone: 1, pv: dN, c: dK },
    { e: [0.52, 1.31], r: [0.03, 0.08, 0.014], rx: -0.5, rz: 0.25, z: 0.05, bone: 1, pv: dN, c: dC },
    ...leg(2, 0.085, [0.27, 0.74], [[[0.27, 0.74], [0.29, 0.42], 0.055, 0.032], [[0.29, 0.42], [0.29, 0.03], 0.024, 0.017]], [dC, dG], [0.028, 0.022, 0.018, dK]),
    ...leg(4, 0.08, [-0.28, 0.8], [[[-0.3, 0.8], [-0.2, 0.46], 0.085, 0.04], [[-0.2, 0.46], [-0.32, 0.3], 0.036, 0.026], [[-0.32, 0.3], [-0.3, 0.03], 0.022, 0.017]], [dC, dG], [0.028, 0.022, 0.018, dK]),
    { e: [-0.43, 0.9], r: [0.03, 0.05, 0.03], rz: 0.3, bone: 6, pv: [-0.4, 0.92], c: dW },
  ];
  // fox: russet, a white throat and brush tip, black stockings and ear backs
  const fC = [0.5, 0.2, 0.05], fW = [0.7, 0.66, 0.6], fK = [0.05, 0.035, 0.03], fE = [0.52, 0.4, 0.32], fN = [0.2, 0.4];
  const fox = [
    { e: [0, 0.36], r: [0.26, 0.11, 0.09], c: fC }, { e: [0.17, 0.36], r: [0.12, 0.12, 0.09], c: fC }, { e: [0.14, 0.31], r: [0.08, 0.07, 0.07], c: fW },
    { a: [0.2, 0.4], b: [0.32, 0.5], r0: 0.07, r1: 0.05, bone: 1, pv: fN, c: fC },
    { e: [0.38, 0.52], r: [0.075, 0.06, 0.065], bone: 1, pv: fN, c: fC }, { e: [0.46, 0.5], r: [0.07, 0.03, 0.03], rz: -0.1, bone: 1, pv: fN, c: fC },
    { e: [0.44, 0.475], r: [0.06, 0.02, 0.028], bone: 1, pv: fN, c: fW }, { e: [0.53, 0.5], r: [0.015, 0.015, 0.016], bone: 1, pv: fN, c: fK },
    { e: [0.335, 0.61], r: [0.028, 0.075, 0.013], rx: -0.3, rz: 0.2, z: 0.042, bone: 1, pv: fN, c: fK },        // tall pointed ears, black behind, pale inside
    { e: [0.345, 0.605], r: [0.02, 0.058, 0.01], rx: -0.3, rz: 0.2, z: 0.039, bone: 1, pv: fN, c: fE },
    { e: [0.41, 0.49], r: [0.05, 0.035, 0.012], rx: -0.15, z: 0.05, bone: 1, pv: fN, c: fW },                  // white cheeks
    ...leg(2, 0.055, [0.17, 0.32], [[[0.17, 0.32], [0.18, 0.15], 0.032, 0.022], [[0.18, 0.15], [0.18, 0.02], 0.018, 0.015]], [fC, fK], [0.022, 0.012, 0.014, fK]),
    ...leg(4, 0.055, [-0.18, 0.34], [[[-0.18, 0.36], [-0.12, 0.18], 0.05, 0.028], [[-0.12, 0.18], [-0.18, 0.02], 0.02, 0.015]], [fC, fK], [0.022, 0.012, 0.014, fK]),
    { e: [-0.47, 0.29], r: [0.21, 0.075, 0.08], rz: 0.35, bone: 6, pv: [-0.26, 0.36], c: fC }, { e: [-0.65, 0.22], r: [0.05, 0.04, 0.045], rz: 0.35, bone: 6, pv: [-0.26, 0.36], c: fW },
  ];
  // brown hare: big haunches, long black-tipped ears, a white scut
  const hC = [0.30, 0.23, 0.15], hW = [0.7, 0.66, 0.6], hK = [0.04, 0.035, 0.03], hN = [0.12, 0.26];
  const hare = [
    { e: [0, 0.2], r: [0.17, 0.11, 0.09], rz: 0.2, c: hC }, { e: [-0.1, 0.17], r: [0.13, 0.13, 0.1], c: hC }, { e: [0.1, 0.2], r: [0.09, 0.1, 0.08], c: hC },
    { a: [0.12, 0.26], b: [0.18, 0.31], r0: 0.06, r1: 0.05, bone: 1, pv: hN, c: hC },
    { e: [0.22, 0.32], r: [0.08, 0.055, 0.05], rz: -0.2, bone: 1, pv: hN, c: hC },
    { e: [0.17, 0.44], r: [0.022, 0.1, 0.012], rz: 0.45, rx: -0.15, z: 0.025, bone: 1, pv: hN, c: hC },
    { e: [0.12, 0.535], r: [0.015, 0.025, 0.01], rz: 0.45, z: 0.03, bone: 1, pv: hN, c: hK },
    ...leg(2, 0.045, [0.12, 0.14], [[[0.12, 0.15], [0.14, 0.02], 0.02, 0.015]], [hC, hC], [0.025, 0.012, 0.014, hC]),
    ...leg(4, 0.06, [-0.12, 0.16], [[[-0.12, 0.16], [-0.1, 0.03], 0.045, 0.02]], [hC, hC], [0.07, 0.02, 0.02, hC]),
    { e: [-0.23, 0.21], r: [0.035, 0.035, 0.035], bone: 6, pv: [-0.22, 0.2], c: hW },
  ];
  return [deer, fox, hare];
})();

// ---------------------------------------------------------------- composite: ACES, a cold grade with warm highlights, vignette, grain
const COMP_FRAG = /* glsl */`
uniform sampler2D tScene, tBloom;
uniform vec2 uRes;
uniform float uTime, uExposure, uBloom;
varying vec2 vUv;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 aces(vec3 color){
  const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= uExposure / 0.6;
  color = inM * color;
  vec3 a = color * (color + 0.0245786) - 0.000090537;
  vec3 b = color * (0.983729 * color + 0.4329510) + 0.238081;
  return clamp(outM * (a / b), 0.0, 1.0);
}
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec2 q = vUv - 0.5;
  vec2 ca = q * dot(q, q) * 0.004;
  vec3 col = vec3(texture2D(tScene, vUv - ca).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv + ca).b);
  col += texture2D(tBloom, vUv).rgb * uBloom;
  vec3 c = toSRGB(aces(col));
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c += vec3(-0.012, 0.0, 0.016) * (1.0 - l) * (1.0 - l);   // cold blue in the shadows
  c += vec3(0.03, 0.01, -0.03) * l;                        // the warm light stays warm
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.25);
  float vig = smoothstep(1.15, 0.3, length(q * vec2(1.0, 1.2)));
  c *= mix(0.6, 1.0, vig);
  c += (h21(vUv * uRes + fract(uTime * 7.31) * 113.) - 0.5) * 0.018;
  gl_FragColor = vec4(c, 1.);
}`;

// ---------------------------------------------------------------- the atlas, painted once at startup
// Eight cells 256 x 1024, each one piece of plant drawn needle by needle: R is the tone, G marks bare wood (or lichen),
// A the cover. Cells 0-3 are branch sprays for the whorls (spruce twice, larch, pine). They are painted pre-distorted
// for the whorl's polar mapping: across a cell is one branch's sector of the disc, which widens toward the tip, so
// a needle at distance y from the trunk is squeezed by 1/y. Cell 4 is a dead branch, 5 a bracken frond, 6 grass,
// 7 a sprig of blueberry.
function paintAtlas() {
  const cv = document.createElement("canvas"); cv.width = AT_W; cv.height = AT_H;
  const g = cv.getContext("2d");
  g.lineCap = "round"; g.lineJoin = "round";
  const lines = new Map();         // "width|tone|aux" -> flat [x0, y0, x1, y1, ...], stroked in one path each
  const line = (x0, y0, x1, y1, w, tone, aux = 0) => {
    const k = `${w.toFixed(1)}|${Math.round(tone * 12)}|${Math.round(aux * 4)}`;
    if (!lines.has(k)) lines.set(k, []);
    lines.get(k).push(x0, y0, x1, y1);
  };
  const flush = () => {
    for (const [k, a] of lines) {
      const [w, t, x] = k.split("|").map(Number);
      g.lineWidth = w; g.strokeStyle = `rgb(${Math.round(t / 12 * 255)},${Math.round(x / 4 * 255)},0)`;
      g.beginPath();
      for (let i = 0; i < a.length; i += 4) { g.moveTo(a[i], a[i + 1]); g.lineTo(a[i + 2], a[i + 3]); }
      g.stroke();
    }
    lines.clear();
  };

  // a branch spray in metric units of its own length: x across, y from the trunk (0) to the tip (1)
  function spray(cell, seed, kind) {
    const r = rng(seed);
    const fan = (y) => Math.max(y, 0.1) * SECT;
    const px = (x, y) => [cell * CELL_W + (0.5 + x / fan(y)) * CELL_W, AT_H * (1 - y)];
    const inside = (x, y) => Math.abs(x / fan(y)) < 0.485 && y > 0.005 && y < 0.995;
    const seg = (x0, y0, x1, y1, w, tone, aux) => {
      if (!inside(x0, y0) && !inside(x1, y1)) return;
      const a = px(x0, y0), b = px(x1, y1);
      line(a[0], a[1], b[0], b[1], w, tone, aux);
    };
    const needleL = kind === 3 ? 0.035 : kind === 2 ? 0.016 : 0.012, step = kind === 2 ? 0.016 : kind === 3 ? 0.012 : 0.0045;
    // needles along a twig from (x, y) in direction (dx, dy), length L
    const needles = (x, y, dx, dy, L, dens) => {
      for (let t = 0; t < L; t += step / dens) {
        const cx = x + dx * t, cy = y + dy * t, inner = smooth(0.32, 0.12, cy);
        if (kind === 2) {          // larch: tufts of soft needles on short shoots
          if (r() < 0.25) continue;
          const n = 9 + Math.floor(r() * 10);
          for (let i = 0; i < n; i++) { const a = r() * TAU, l = needleL * (0.6 + r() * 0.6); seg(cx, cy, cx + Math.cos(a) * l, cy + Math.sin(a) * l * 0.8 + dy * l * 0.3, 1.3, 0.55 + r() * 0.45, 0); }
          continue;
        }
        if (kind === 3) {          // pine: long paired needles in brushes toward the twig's end
          if (t < L * 0.45 || r() < 0.3) continue;
          for (const s of [-1, 1]) { const a = Math.atan2(dy, dx) + s * (0.5 + r() * 0.6), l = needleL * (0.7 + r() * 0.5); seg(cx, cy, cx + Math.cos(a) * l, cy + Math.sin(a) * l, 1.4, 0.5 + r() * 0.5, 0); }
          continue;
        }
        for (const s of [-1, 1]) {   // spruce: a bottlebrush of short stiff needles, leaning forward
          if (r() < inner * 0.75) continue;
          const a = Math.atan2(dy, dx) + s * (0.9 + r() * 0.6), l = needleL * (0.7 + r() * 0.6);
          seg(cx, cy, cx + Math.cos(a) * l, cy + Math.sin(a) * l, 1.5, inner > 0.5 ? 0.25 + r() * 0.2 : 0.45 + r() * 0.55, inner * 0.6);
        }
      }
    };
    // the main axis with a slight wander
    let x = 0, y = 0.02, wob = r() * 6;
    const axis = [];
    while (y < 0.97) { const nx = 0.015 * Math.sin(y * 6 + wob), ny = y + 0.02; seg(x, y, nx, ny, 3.2 * (1 - y * 0.6), 0.35, 1); axis.push([x, y]); x = nx; y = ny; }
    needles(0, 0.06, 0, 1, 0.92, 1);
    // side twigs, alternating, leaning toward the tip, longest a little past the middle
    let side = r() < 0.5 ? -1 : 1;
    for (let ty = 0.05 + r() * 0.03; ty < 0.95; ty += (kind === 2 ? 0.05 : kind === 3 ? 0.06 : 0.032) * (0.7 + r() * 0.6)) {
      side = -side;
      const ax = 0.015 * Math.sin(ty * 6 + wob), prof = Math.pow(Math.sin(Math.PI * Math.min(1, ty * 1.05)), 0.7);
      const L = Math.min(0.46 * fan(ty) * 1.25, 0.26) * prof * (0.65 + r() * 0.45) * (kind === 3 ? 0.8 : 1);
      if (L < 0.01) continue;
      const ang = (0.55 + r() * 0.35);           // from the axis
      let dx = side * Math.sin(ang), dy = Math.cos(ang);
      // the twig in three bends, curving outward
      let cx = ax, cy = ty;
      for (let k = 0; k < 3; k++) {
        const l = L / 3, bx = cx + dx * l, by = cy + dy * l;
        seg(cx, cy, bx, by, 1.8, 0.3, 1);
        needles(cx, cy, dx, dy, l, 1);
        // second-order twigs off the outer part of long twigs
        if (k > 0 && L > 0.06 && kind !== 3) for (const s of [-1, 1]) {
          if (r() < 0.35) continue;
          const a2 = Math.atan2(dy, dx) + s * (0.6 + r() * 0.3), l2 = l * (0.5 + r() * 0.5), ex = Math.cos(a2), ey = Math.sin(a2);
          seg(cx, cy, cx + ex * l2, cy + ey * l2, 1.3, 0.3, 1);
          needles(cx, cy, ex, ey, l2, 0.9);
        }
        cx = bx; cy = by;
        const rot = -side * 0.12; const ndx = dx * Math.cos(rot) - dy * Math.sin(rot); dy = dx * Math.sin(rot) + dy * Math.cos(rot); dx = ndx;
      }
    }
    // the inner part of a whorl is a thicket of dead twigs
    for (let i = 0; i < 160; i++) {
      const yy = 0.02 + r() * 0.28, xx = (r() - 0.5) * fan(yy) * 0.9, a = (r() - 0.5) * 2.6 + Math.PI / 2, l = 0.02 + r() * 0.05;
      seg(xx, yy, xx + Math.cos(a) * l, yy + Math.sin(a) * l, 1.2, 0.2 + r() * 0.2, 1);
    }
    flush();
  }
  spray(0, 11, 0); spray(1, 23, 0); spray(2, 37, 2); spray(3, 41, 3);

  // plain cells: u across 0..1, v up 0..1
  const pc = (cell, u, v) => [cell * CELL_W + u * CELL_W, AT_H * (1 - v)];
  {   // 4: a dead lower branch, grey, its twigs snapped short, lichen tufts
    const r = rng(77);
    const seg = (u0, v0, u1, v1, w, t, a) => { const p = pc(4, u0, v0), q = pc(4, u1, v1); line(p[0], p[1], q[0], q[1], w, t, a); };
    let u = 0.5, v = 0.0;
    while (v < 0.95) { const nu = 0.5 + 0.03 * Math.sin(v * 9), nv = v + 0.03; seg(u, v, nu, nv, 5 * (1 - v * 0.7), 0.4 + r() * 0.1, 1); u = nu; v = nv; }
    for (let ty = 0.06; ty < 0.92; ty += 0.04 + r() * 0.05) {
      const s = r() < 0.5 ? -1 : 1, L = (0.12 + r() * 0.3) * (1 - ty * 0.6), a = 0.5 + r() * 0.5;
      const bu = 0.5 + s * Math.sin(a) * L, bv = ty + Math.cos(a) * L * 0.25;
      seg(0.5, ty, bu, bv, 2.2, 0.35 + r() * 0.15, 1);
      if (r() < 0.6) seg(0.5 + (bu - 0.5) * 0.5, ty + (bv - ty) * 0.5, 0.5 + (bu - 0.5) * 0.8 + s * 0.05, ty + (bv - ty) * 0.5 + 0.06, 1.4, 0.35, 1);
      if (r() < 0.3) for (let i = 0; i < 12; i++) { const a2 = r() * TAU, l = 0.01 + r() * 0.02; seg(bu, bv, bu + Math.cos(a2) * l, bv + Math.sin(a2) * l * 0.25, 1.6, 0.85, 0.5); }
    }
    flush();
  }
  {   // 5: a bracken frond, triangular, pinnae with rounded pinnules
    const r = rng(91);
    g.save();
    const W = CELL_W, x0 = 5 * W;
    g.strokeStyle = "rgb(110,255,0)"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x0 + W * 0.5, AT_H); g.quadraticCurveTo(x0 + W * 0.52, AT_H * 0.5, x0 + W * 0.5, AT_H * 0.02); g.stroke();
    for (let v = 0.12; v < 0.97; v += 0.045) for (const s of [-1, 1]) {
      const L = 0.46 * Math.pow(1 - (v - 0.12) / 0.88, 0.8) + 0.03, a = 0.95 - v * 0.3;
      const bx = x0 + W * 0.5, by = AT_H * (1 - v - (s > 0 ? 0.015 : 0));
      const ex = bx + s * Math.sin(a) * L * W, ey = by - Math.cos(a) * L * W * 1.0;
      g.strokeStyle = "rgb(100,255,0)"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.stroke();
      const n = Math.max(2, Math.round(L * 30));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, cx = bx + (ex - bx) * t, cy = by + (ey - by) * t, sz = (1 - t * 0.7) * Math.min(L, 0.3) * W * 0.11 + 1.5;
        for (const ss of [-1, 1]) {
          const tone = Math.round((0.5 + r() * 0.5) * 255);
          g.fillStyle = `rgb(${tone},0,0)`;
          const th = Math.atan2(ey - by, ex - bx), nx = -Math.sin(th) * ss, ny = Math.cos(th) * ss;
          g.beginPath(); g.ellipse(cx + nx * sz * 0.9, cy + ny * sz * 0.9, sz, sz * 0.55, th + Math.PI / 2, 0, TAU); g.fill();
        }
      }
    }
    g.restore();
  }
  {   // 6: grass blades fanning from the bottom
    const r = rng(17), x0 = 6 * CELL_W;
    for (let i = 0; i < 46; i++) {
      const bx = x0 + CELL_W * (0.35 + r() * 0.3), lean = (r() - 0.5) * 1.4, h = AT_H * (0.45 + r() * 0.55), w = 3 + r() * 4;
      const tx = bx + lean * CELL_W * 0.45, ty = AT_H - h, mx = bx + lean * CELL_W * 0.1, my = AT_H - h * 0.6;
      const tone = Math.round((0.4 + r() * 0.6) * 255);
      g.fillStyle = `rgb(${tone},${Math.round(r() * 60)},0)`;
      g.beginPath(); g.moveTo(bx - w, AT_H); g.quadraticCurveTo(mx - w * 0.6, my, tx, ty); g.quadraticCurveTo(mx + w * 0.6, my, bx + w, AT_H); g.fill();
    }
  }
  {   // 7: a blueberry sprig, zigzag stems and small oval leaves
    const r = rng(29), x0 = 7 * CELL_W;
    for (let s = 0; s < 4; s++) {
      let x = x0 + CELL_W * (0.3 + r() * 0.4), y = AT_H;
      const top = AT_H * (0.15 + r() * 0.3);
      while (y > top) {
        const nx = x + (r() - 0.5) * 40, ny = y - 40 - r() * 30;
        g.strokeStyle = "rgb(90,255,0)"; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
        for (const side of [-1, 1]) {
          if (y > AT_H * 0.85 || r() < 0.2) continue;
          const tone = Math.round((0.45 + r() * 0.55) * 255), a = side * (0.6 + r() * 0.6) - Math.PI / 2;
          g.fillStyle = `rgb(${tone},0,0)`;
          g.beginPath(); g.ellipse(nx + Math.cos(a) * 20, ny + Math.sin(a) * 20, 21, 11, a, 0, TAU); g.fill();
        }
        x = nx; y = ny;
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  return tex;
}

// ---------------------------------------------------------------- geometry helpers
// one whorl of branches: a drooping disc, the tips turned up a little; uv.x counts branches round it
function whorlGeo(nb, seg = 14, rings = 4) {
  const P = [], UV = [], I = [];
  for (let i = 0; i <= rings; i++) {
    const r = 0.04 + 0.96 * Math.pow(i / rings, 0.8);
    const y = -Math.pow(r, 1.5) + 0.22 * smooth(0.7, 1, r);
    for (let j = 0; j <= seg; j++) {
      const a = j / seg * TAU;
      P.push(Math.cos(a) * r, y, Math.sin(a) * r);
      UV.push(j / seg * nb, r);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + seg + 1;
    I.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex(I); g.computeVertexNormals();
  return g;
}
// a fern frond: a strip arching up and over, folded a little along its rachis
function frondGeo() {
  const P = [], UV = [], I = [], n = 10;
  for (let i = 0; i <= n; i++) {
    const s = i / n, z = Math.sin(s * 1.25) * 0.9, y = Math.sin(s * Math.PI * 0.85) * 0.5 - s * s * 0.15;
    for (const u of [-1, 0, 1]) { P.push(u * 0.22 * Math.sin(Math.PI * Math.pow(s, 0.7)), y - Math.abs(u) * 0.05, z); UV.push((u + 1) / 2, s); }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { const a = i * 3 + j, b = a + 3; I.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex(I); g.computeVertexNormals();
  return g;
}
// n crossed cards round an axis: vertical (base at y = 0, for plants) or along z (from z = 0, for dead branches)
function crossCards(n, alongZ = false) {
  const P = [], N = [], UV = [], I = [];
  for (let k = 0; k < n; k++) {
    const a = k * Math.PI / n, c = Math.cos(a) * 0.5, s = Math.sin(a) * 0.5, o = P.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      if (alongZ) { P.push((u * 2 - 1) * c, (u * 2 - 1) * s, v); N.push(-Math.sin(a), Math.cos(a), 0); }
      else { P.push((u * 2 - 1) * c, v, (u * 2 - 1) * s); N.push(-Math.sin(a), 0, Math.cos(a)); }
      UV.push(u, v);
    }
    I.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I);
  return g;
}
// a split piece of firewood: a sector of a unit circle extruded one unit along z, centred
function wedgeGeo(sweep) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  const n = Math.max(3, Math.round(sweep / TAU * 16));
  for (let i = 0; i <= n; i++) { const a = -sweep / 2 + sweep * i / n; s.lineTo(Math.cos(a), Math.sin(a)); }
  s.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -0.5);
  return g.toNonIndexed();
}

// ---------------------------------------------------------------- the scene
export function startHearth3D(canvasEl, { reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: false, powerPreference: "high-performance" });
  let pr = Math.min(window.devicePixelRatio || 1, 1.5);
  const LITE = matchMedia("(pointer: coarse)").matches;     // phones and tablets: a thinner forest further out
  renderer.setPixelRatio(pr);
  renderer.toneMapping = THREE.NoToneMapping;
  const post = makePost(renderer, { comp: COMP_FRAG, bloom: 0.5, thresh: 0.45 });
  post.U.uExposure.value = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 900);

  // ---- the painted atlas of branches and plants
  const atlasTex = paintAtlas();
  atlasTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  SU.uAtlas.value = atlasTex;

  // ---- the cabin's frame and its light
  const cabin = new THREE.Group();
  cabin.position.set(CABIN.x, CAB_Y, CABIN.z);
  cabin.rotation.y = CABIN.yaw;
  scene.add(cabin);
  cabin.updateMatrixWorld(true);
  SU.uCabInv.value.copy(cabin.matrixWorld).invert();
  const cw = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(cabin.matrixWorld);
  const cd = (x, y, z) => new THREE.Vector3(x, y, z).transformDirection(cabin.matrixWorld);
  const roofN = new THREE.Vector3(-Math.sin(ALPHA), Math.cos(ALPHA), 0);       // the slope toward you (local -x)
  const ROOFWIN = [-(B - (3.62 * Math.sin(ALPHA) + EAVE - Y0) * B / HR) - T * 0.5, 3.62 * Math.sin(ALPHA) + EAVE, 0.3];
  const LIGHTS = [
    { p: cw(0, Y0 + 4.2, ZG + 0.9), n: cd(0, 0, 1), c: [1.0, 0.56, 0.26], i: 34, k: 1.2 },      // the big glazing
    { p: cw(0, Y0 + 1.5, ZG + 0.7), n: cd(0, 0, 1), c: [1.0, 0.55, 0.24], i: 12, k: 1.0 },      // door and windows
    { p: cw(1.0, Y0 + 2.15, ZG + 0.3), n: cd(0, -0.3, 1).normalize(), c: [1.0, 0.62, 0.32], i: 3.2, k: 0.4 },   // the lantern
    { p: cw(ROOFWIN[0] - 0.5 * Math.sin(ALPHA), ROOFWIN[1] + 0.5 * Math.cos(ALPHA), ROOFWIN[2]), n: roofN.clone().transformDirection(cabin.matrixWorld), c: [1.0, 0.55, 0.24], i: 7, k: 1.0 },
    { p: cw(-ROOFWIN[0] + 0.5 * Math.sin(ALPHA), ROOFWIN[1] + 0.5 * Math.cos(ALPHA), ROOFWIN[2]), n: cd(Math.sin(ALPHA), Math.cos(ALPHA), 0), c: [1.0, 0.55, 0.24], i: 7, k: 1.0 },
    { p: cw(0, Y0 + 2.2, ZG + 1.4), n: cd(0, -1, 0), c: [1.0, 0.64, 0.32], i: 3.0, k: 0.3 },          // the string of lights over the deck
  ];
  LIGHTS.forEach((l, i) => { SU.uLp.value[i].copy(l.p); SU.uLn.value[i].copy(l.n); SU.uLk.value[i] = l.k; });

  // ---- sky
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: SU,
    vertexShader: "varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }",
    fragmentShader: `${GLSL_COMMON}${GLSL_LIGHT}
      varying vec3 vD;
      void main(){
        vec3 d = normalize(vD);
        float h = d.y;
        vec3 zen = mix(vec3(0.075, 0.095, 0.14), vec3(0.012, 0.016, 0.03), uNight);
        vec3 col = mix(fogSky(d) * 1.08, zen, smoothstep(0.0, 0.6, h));
        vec2 uv = d.xz / (h + 0.15);
        float n = fbm(uv * 0.8 + vec2(uTime * 0.004, uTime * 0.0025));
        float g = pow(max(dot(d, uGlowDir), 0.), 2.);
        col *= mix(1., 0.7 + 0.55 * n, smoothstep(0.02, 0.2, h));
        float n2 = fbm(uv * 2.4 + vec2(7.3, uTime * 0.005));
        col = mix(col, col * vec3(0.74, 0.8, 0.95), smoothstep(0.45, 0.75, n2) * smoothstep(0.03, 0.3, h) * 0.55);      // darker, colder rags of cloud
        col += uGlowCol * g * smoothstep(0.45, 0.8, n) * 0.5 * (1. - uNight);
        col += scatter(cameraPosition, d, 250.) * uScat;
        gl_FragColor = vec4(col, 1.);
      }`,
  }));
  sky.renderOrder = -1; sky.frustumCulled = false;
  scene.add(sky);

  // ---- generate the forest
  const R = rng(9137), D = rng(5521);           // R places the trees, D decorates the floor, so planting never moves a tree
  const toCab = (x, z) => { const [lx, lz] = toLocal(x, z); return Math.hypot(lx / 11.5, (lz - 1.5) / 13); };   // < 1 inside the clearing
  const sight = (x, z) => {                     // keep the view from where you stand to the cabin open
    const dx = CABIN.x, dz = CABIN.z, L = Math.hypot(dx, dz), t = (x * dx + z * dz) / L;
    if (t < 0 || t > L) return 1e9;
    return Math.abs(x * dz - z * dx) / L - (0.9 + t * 0.11);
  };
  // instanced meshes are cut into patches (rings and compass sectors round the cabin) that three culls to the view
  const NS = 16;
  const sectorOf = (x, z) => { const d = dCab(x, z); return d < 22 ? -1 : (d < 60 ? 0 : d < 110 ? 1 : 2) * 100 + Math.floor(((Math.atan2(x - CABIN.x, z - CABIN.z) / TAU) % 1 + 1) % 1 * NS); };
  const trees = [];       // x, y, z, H, r, kind, cb, seed, lod
  const RMAX = LITE ? 120 : 160;
  const fromStart = (x, z) => Math.hypot(x - START[0], z - START[1]);
  const addTree = (x, z, o = {}) => {
    const dc = dCab(x, z);
    const pk = R();
    const kind = o.kind ?? (pk < (dc < 26 ? 0.2 : 0.06) ? 2 : pk < (dc < 26 ? 0.3 : 0.18) ? 1 : pk < 0.24 ? 3 : 0);
    const H = o.H ?? (kind === 3 ? 6 + R() * 14 : 17 + R() * 13);
    const r = o.r ?? (0.09 + Math.pow(R(), 1.5) * 0.24) * (kind === 1 ? 1.15 : 1) * (H / 24);
    const cb = kind === 1 ? 0.62 + R() * 0.14 : kind === 2 ? 0.32 + R() * 0.15 : 0.32 + R() * 0.22;
    trees.push({ x, y: ground(x, z) - 0.1, z, H, r: Math.max(r, 0.07), kind, cb, seed: R(), lod: dc < 50 ? 0 : dc < 100 ? 1 : 2, young: false });
  };
  const CELL = 3.2;
  for (let gz = -RMAX; gz < RMAX; gz += CELL) for (let gx = -RMAX; gx < RMAX; gx += CELL) {
    const x = CABIN.x + gx + R() * CELL, z = CABIN.z + gz + R() * CELL, d = dCab(x, z);
    const sp = d < 50 ? CELL : d < 100 ? 4.3 : 6.2;              // a jittered grid, thinned where the mist hides it
    const keep = (CELL / sp) ** 2 * 0.9 * (d > 9 && d < 44 ? 0.72 : 1);   // a little more room where you walk round
    if (R() > keep || d > RMAX) continue;
    if (toCab(x, z) < 1 || pathD(x, z) < 1.7 || sight(x, z) < 0 || fromStart(x, z) < 2 || trailD(x, z) < 1.3) continue;
    addTree(x, z);
  }
  // a few placed on purpose: trunks framing the view, larches lit gold by the windows, big trees behind the cabin
  addTree(-3.1, -5.2, { kind: 0, H: 27, r: 0.34 }); addTree(4.6, -9.5, { kind: 1, H: 26, r: 0.3 }); addTree(-2.4, -14, { kind: 0, H: 25, r: 0.27 });
  addTree(...toWorld(-9.5, 8.5), { kind: 2, H: 21, r: 0.24 }); addTree(...toWorld(10.5, 4), { kind: 2, H: 23, r: 0.26 }); addTree(...toWorld(-12, -3), { kind: 2, H: 19, r: 0.2 });
  addTree(...toWorld(-3, -13), { kind: 0, H: 29, r: 0.38 }); addTree(...toWorld(5, -14), { kind: 1, H: 27, r: 0.33 });
  // young spruces in the gaps, branched to the ground
  const youngs = [];
  for (let k = 0, n = LITE ? 380 : 760; k < n; k++) {
    const a = R() * TAU, d = 9 + Math.pow(R(), 0.9) * 85, x = CABIN.x + Math.sin(a) * d, z = CABIN.z + Math.cos(a) * d;
    if (toCab(x, z) < 1.05 || pathD(x, z) < 1.5 || sight(x, z) < 0.5 || fromStart(x, z) < 2 || trailD(x, z) < 1.8) continue;
    const H = 0.7 + Math.pow(R(), 1.3) * 4.5;
    youngs.push({ x, y: ground(x, z) - 0.05, z, H, r: 0.02 + H * 0.012, kind: R() < 0.12 ? 2 : 0, cb: 0, seed: R(), lod: d < 50 ? 0 : 1, young: true });
  }
  const allTrees = trees.concat(youngs);
  // what you step round instead of through: trunks, young spruces taller than you, stones, the woodpiles
  const obstacles = new Map();
  const obstacle = (x, z, r) => { const k = `${Math.floor(x / 4)},${Math.floor(z / 4)}`; if (!obstacles.has(k)) obstacles.set(k, []); obstacles.get(k).push([x, z, r]); };
  for (const t of allTrees) if (dCab(t.x, t.z) < DMAX + 6 && (!t.young || t.H > 1.4)) obstacle(t.x, t.z, t.young ? Math.min(t.H * 0.27, 1.4) + 0.3 : t.r * 1.4 + 0.55);
  obstacle(...toWorld(4.8, 7.8), 1.8); obstacle(...toWorld(-2.6, 8.4), 1.0);

  // ---- instancing in patches
  const sectorMeshes = [];
  const dummy = new THREE.Object3D();
  function instanced(geo, mat, items, at) {      // items: [matrix, aI[4], x, z]
    const groups = new Map();
    for (const it of items) { const s = at ? sectorOf(it[2], it[3]) : -1; if (!groups.has(s)) groups.set(s, []); groups.get(s).push(it); }
    for (const [s, list] of groups) {
      const g = geo.clone(), A = new Float32Array(list.length * 4);
      list.forEach((it, i) => A.set(it[1], i * 4));
      g.setAttribute("aI", new THREE.InstancedBufferAttribute(A, 4));
      const m = new THREE.InstancedMesh(g, mat, list.length);
      list.forEach((it, i) => m.setMatrixAt(i, it[0]));
      m.computeBoundingSphere(); if (m.boundingSphere) m.boundingSphere.radius += 6;    // room for the sway
      scene.add(m);
      sectorMeshes.push({ mesh: m, s });
    }
  }
  const mtx = (x, y, z, rx, ry, rz, sx, sy, sz) => { dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz); dummy.scale.set(sx, sy, sz); dummy.updateMatrix(); return dummy.matrix.clone(); };

  // trunks
  const basePts = [];
  for (let i = 0; i <= 14; i++) { const y = Math.pow(i / 14, 1.5); basePts.push(new THREE.Vector2(Math.max(0.02, (1 - 0.9 * Math.pow(y, 0.85)) * (1 + 0.6 * Math.exp(-y * 55))), y)); }
  const rootPts = [0.0025, 0.0065, 0.012].map((y) => new THREE.Vector2((1 - 0.9 * Math.pow(y, 0.85)) * (1 + 0.6 * Math.exp(-y * 55)), y));    // a few rows low down for the root flare
  const trunkGeo = new THREE.LatheGeometry([basePts[0], ...rootPts, ...basePts.slice(1)], 12), trunkGeoLo = new THREE.LatheGeometry(basePts.filter((_, i) => i % 2 === 0), 6);
  const trunkMat = surf(TRUNK);
  const tItems = [[], []], twigItems = [], blobItems = [];
  for (const t of allTrees) {
    const tilt = (h1(t.seed * 91) - 0.5) * 0.03;
    const H = t.kind === 3 ? t.H : t.H;
    tItems[t.lod === 0 ? 0 : 1].push([mtx(t.x, t.y, t.z, tilt, t.seed * TAU, tilt * 0.7, t.r, H, t.r), [t.kind, t.cb, t.seed, 0], t.x, t.z]);
    if (t.lod === 0 && !t.young) {
      blobItems.push(mtx(t.x, ground(t.x, t.z) + 0.03, t.z, -Math.PI / 2, 0, 0, 2.6 + t.r * 4, 2.6 + t.r * 4, 1));
      // dead twigs up the bare trunk
      const top = t.kind === 3 ? t.H * 0.9 : t.H * t.cb;
      for (let y = 1.0 + R() * 0.5; y < top; y += 0.3 + R() * 0.45) {
        const a = R() * TAU, len = (0.3 + R() * 0.9) * (t.kind === 1 ? 0.6 : 1) * smooth(0.5, 3, y) * (0.5 + 0.5 * smooth(0, 0.6, y / top)), rr = t.r * (1 - 0.9 * y / t.H);
        if (len < 0.1) continue;
        dummy.position.set(t.x + Math.cos(a) * rr * 0.8, t.y + y, t.z + Math.sin(a) * rr * 0.8);
        dummy.rotation.set(0, 0, 0); dummy.lookAt(t.x + Math.cos(a) * 10, t.y + y - 10 * (0.05 + R() * 0.45), t.z + Math.sin(a) * 10);
        dummy.rotateZ(R() * TAU); dummy.scale.set(len * 0.45, len * 0.45, len); dummy.updateMatrix();
        twigItems.push([dummy.matrix.clone(), [R(), R(), 0, 0], t.x, t.z]);
      }
    }
  }
  instanced(trunkGeo, trunkMat, tItems[0], true);
  instanced(trunkGeoLo, trunkMat, tItems[1], true);
  instanced(crossCards(2, true), surf(TWIG), twigItems, true);
  {
    const blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ ...BLOB, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), blobItems.length);
    blobItems.forEach((m, i) => blobs.setMatrixAt(i, m));
    blobs.frustumCulled = false; blobs.renderOrder = 1;
    scene.add(blobs);
  }

  // crowns
  const whorlMat = surf(WHORL);
  const wGeo = [whorlGeo(NB, 20, 4), whorlGeo(NB, 14, 3), whorlGeo(NB, 10, 2)];
  const wItems = [[], [], []];
  for (const t of allTrees) {
    if (t.kind === 3) continue;
    const lod = t.lod;
    const pine = t.kind === 1, larch = t.kind === 2;
    let n = pine ? [9, 6, 3][lod] : [16, 8, 4][lod];
    if (t.young) n = Math.max(3, Math.min(lod === 0 ? 12 : 6, Math.round(t.H / 0.4)));
    const base = t.H * t.cb, span = t.H - base;
    const Rmax = t.young ? t.H * 0.34 * (0.78 + 0.5 * h1(t.seed * 5.3)) : pine ? 2.4 + h1(t.seed * 7) * 1.4 : larch ? 2.0 + h1(t.seed * 7) * 1.0 : 2.1 + h1(t.seed * 7) * 1.1;
    for (let k = 0; k < n; k++) {
      const f = n === 1 ? 0 : k / (n - 1);
      let y = base + span * Math.pow(f, 0.9) + (t.young ? 0.15 : 0) + (h1(t.seed * 53 + k * 3) - 0.5) * span / Math.max(1, n - 1) * 0.4;   // whorls not evenly spaced
      let Rw = pine ? Rmax * (0.45 + 0.55 * Math.sin(Math.PI * (0.25 + f * 0.75))) * (0.7 + 0.4 * h1(t.seed * 13 + k)) : Rmax * Math.pow(1 - f * 0.94, 0.95) * (0.85 + 0.3 * h1(t.seed * 13 + k));
      Rw = Math.max(Rw, 0.25);
      const gap = span / Math.max(1, n - 1);
      const drop = pine ? Math.max(gap * 0.9, 0.5) : Math.max(gap * 1.5, Rw * 0.42);
      const off = pine ? 0.5 * Rw * 0.4 : 0.1;
      const a = h1(t.seed * 31 + k * 7) * TAU;
      const hy = (y) / t.H;
      wItems[lod].push([mtx(t.x + Math.cos(a) * off, t.y + y + drop * 0.1, t.z + Math.sin(a) * off, (h1(k + t.seed) - 0.5) * (t.young ? 0.3 : 0.12), a, (h1(k * 3 + t.seed) - 0.5) * (t.young ? 0.3 : 0.12), Rw * (1 + (h1(t.seed * 9 + k) - 0.5) * 0.2), drop * (0.85 + 0.3 * h1(t.seed * 4 + k * 5)), Rw),
        [t.kind, f, t.seed, hy * hy * t.H * 0.005], t.x, t.z]);
    }
  }
  wItems.forEach((list, i) => instanced(wGeo[i], whorlMat, list, true));

  // ---- the forest floor: a polar grid centred between you and the cabin, fine near, coarse far
  {
    const cx = CABIN.x, cz = CABIN.z, seg = LITE ? 180 : 280, P = [], I = [];
    const radii = [0]; for (let r = 0.4; r < 260; r *= 1.045) radii.push(r);
    for (let i = 0; i < radii.length; i++) for (let j = 0; j <= seg; j++) {
      const a = j / seg * TAU, x = cx + Math.cos(a) * radii[i], z = cz + Math.sin(a) * radii[i];
      P.push(x, ground(x, z), z);
    }
    for (let i = 0; i < radii.length - 1; i++) for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      I.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setIndex(I); g.computeVertexNormals();
    const m = new THREE.Mesh(g, surf({ ...GROUND, uniforms: { uPath: { value: PATH.map((p) => new THREE.Vector2(p[0], p[1])) } } }));
    m.frustumCulled = false;
    scene.add(m);
  }

  // ---- undergrowth, scattered round where you can stand
  const okFloor = (x, z, pad = 0.8) => pathD(x, z) > pad && toCab(x, z) > 0.55 && sight(x, z) > -0.6 && !(Math.abs(toLocal(x, z)[0]) < 5.2 && Math.abs(toLocal(x, z)[1] - 1) < 7.5);
  const around = (r0, r1) => { const a = D() * TAU, d = Math.sqrt(r0 * r0 + D() * (r1 * r1 - r0 * r0)); return [CABIN.x + Math.sin(a) * d, CABIN.z + Math.cos(a) * d]; };
  {
    const fronds = [], frond = frondGeo();
    for (let k = 0, n = LITE ? 1200 : 2600; k < n; k++) {
      const [x, z] = around(7, 52);
      if (!okFloor(x, z, 1.1) || vn2(x * 0.12, z * 0.12) < 0.22) continue;
      const y = ground(x, z), col = D() < 0.85 ? D() * 0.6 : 0.6 + D() * 0.4, s = 0.6 + D() * 0.9, nf = 5 + Math.floor(D() * 6);
      for (let f = 0; f < nf; f++) {
        const a = f / nf * TAU + D() * 0.6;
        fronds.push([mtx(x, y, z, -0.15 + D() * 0.3, a, (D() - 0.5) * 0.3, s * (0.8 + D() * 0.4), s * (0.6 + D() * 0.5), s * (0.8 + D() * 0.4)), [clamp(col + (D() - 0.5) * 0.15, 0, 1), D(), 0, 0], x, z]);
      }
    }
    instanced(frond, surf(FERN), fronds, true);
    const shrubs = [], cards = crossCards(3);
    for (let k = 0, n = LITE ? 900 : 2000; k < n; k++) {
      const [x, z] = around(7, 46);
      if (!okFloor(x, z, 0.9) || vn2(x * 0.2 + 5, z * 0.2) < 0.35) continue;
      const s = 0.3 + D() * 0.3, n = 2 + Math.floor(D() * 4), col = D() < 0.65 ? D() * 0.4 : 0.6 + D() * 0.4;
      for (let i = 0; i < n; i++) { const xx = x + (D() - 0.5) * 0.6, zz = z + (D() - 0.5) * 0.6; shrubs.push([mtx(xx, ground(xx, zz) - 0.02, zz, (D() - 0.5) * 0.3, D() * TAU, (D() - 0.5) * 0.3, s, s * (0.6 + D() * 0.6), s), [clamp(col + (D() - 0.5) * 0.2, 0, 1), D(), 0, 0], xx, zz]); }
    }
    instanced(cards, surf(SPRIG), shrubs, true);
    // saplings at shoulder height: birch gone yellow, rowan gone red, in the gaps between the big trunks
    const saps = [], sapCards = crossCards(4);
    for (let k = 0, n = LITE ? 220 : 460; k < n; k++) {
      const [x, z] = around(9, 60);
      if (!okFloor(x, z, 1.3) || sight(x, z) < 0.6 || Math.hypot(x - START[0], z - START[1]) < 2.5 || trailD(x, z) < 1.2) continue;
      const h = 0.8 + Math.pow(D(), 1.4) * 1.6, n2 = 1 + Math.floor(D() * 3), col = D();
      for (let i = 0; i < n2; i++) {
        const xx = x + (D() - 0.5) * 0.7, zz = z + (D() - 0.5) * 0.7, hh = h * (0.7 + D() * 0.4);
        saps.push([mtx(xx, ground(xx, zz) - 0.03, zz, (D() - 0.5) * 0.15, D() * TAU, (D() - 0.5) * 0.15, hh * 0.75, hh, hh * 0.75), [clamp(col + (D() - 0.5) * 0.2, 0, 1), D(), 0, 0], xx, zz]);
      }
      if (h > 1.3 && dCab(x, z) < DMAX + 4) obstacle(x, z, 0.7);
    }
    instanced(sapCards, surf(SAPLING), saps, true);
    const tufts = [];
    for (let k = 0, n = LITE ? 600 : 1400; k < n; k++) {
      const [lx, lz] = [(D() - 0.5) * 26, -10 + D() * 26], [x, z] = toWorld(lx, lz);
      if (toCab(x, z) > 1.15 || pathD(x, z) < 0.6 || (Math.abs(lx) < 4.6 && lz < 8.3 && lz > -5.5)) continue;
      if ((lx < -4 && lx > -6.6 && lz > -4.2 && lz < 3.2) || Math.hypot(lx - 4.8, lz - 7.8) < 1.4 || Math.hypot(lx + 2.6, lz - 8.4) < 1.2) continue;
      const s = 0.35 + D() * 0.35;
      tufts.push([mtx(x, ground(x, z) - 0.02, z, 0, D() * TAU, 0, s * 1.3, s, s * 1.3), [D(), D(), 0, 0], x, z]);
    }
    instanced(cards, surf(GRASS), tufts, true);
    const moss = [];
    for (let k = 0, n = LITE ? 200 : 380; k < n; k++) {
      const [x, z] = around(8, 44);
      if (!okFloor(x, z, 0.9)) continue;
      const s = 0.15 + D() * 0.35;
      moss.push([mtx(x, ground(x, z) - s * 0.1, z, 0, D() * TAU, 0, s * (1 + D() * 0.6), s * (0.18 + D() * 0.15), s), [D(), 0, 0, 0], x, z]);
    }
    instanced(new THREE.SphereGeometry(1, 12, 6, 0, TAU, 0, Math.PI / 2), surf(MOSS), moss, true);
    // boulders, with moss
    const rockGeo = new THREE.IcosahedronGeometry(1, 3), rp = rockGeo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < rp.count; i++) { v.fromBufferAttribute(rp, i); v.multiplyScalar(0.8 + 0.35 * vn2(v.x * 1.7 + 4, v.z * 1.7 + v.y * 1.3)); rp.setXYZ(i, v.x, v.y, v.z); }
    rockGeo.computeVertexNormals();
    const rocks = [];
    for (const [x, z, s] of [[-4.5, -9, 0.9], [6.5, -14, 1.3], [-7, -21, 1.6], [12, -9, 1.1], [-1.8, -24, 0.6], [9, -42, 2.2], [-14, -38, 1.8]]) {
      if (!okFloor(x, z, 0.8)) continue;
      rocks.push([mtx(x, ground(x, z) - s * 0.35, z, D(), D() * TAU, D(), s * 1.2, s * 0.7, s), [0, 0, 0, 0], x, z]);
      obstacle(x, z, s * 1.2 + 0.4);
    }
    instanced(rockGeo, surf(ROCK), rocks, false);
    // mushrooms: fly agarics where you will see them, a few ceps along the path
    const caps = [], stems = [];
    const shroom = (x, z, s, kind) => {
      const y = ground(x, z);
      stems.push([mtx(x, y, z, (D() - 0.5) * 0.2, 0, (D() - 0.5) * 0.2, s * 0.22, s * 0.9, s * 0.22), [kind, 0, 0, 0], x, z]);
      caps.push([mtx(x, y + s * 0.75, z, (D() - 0.5) * 0.25, D() * TAU, (D() - 0.5) * 0.25, s * 0.6, s * 0.3, s * 0.6), [kind, 0, 0, 0], x, z]);
    };
    for (const [x, z, n] of [[-1.7, -6.8, 4], [2.4, -11.5, 3], [-3.6, -17, 3]]) for (let i = 0; i < n; i++) shroom(x + (D() - 0.5) * 0.7, z + (D() - 0.5) * 0.7, 0.13 + D() * 0.12, 0);
    for (let i = 0; i < 30; i++) { const [x, z] = around(9, 40); if (okFloor(x, z, 0.7)) shroom(x, z, 0.06 + D() * 0.08, 1); }
    const capGeo = new THREE.SphereGeometry(1, 14, 7, 0, TAU, 0, Math.PI / 2);
    instanced(new THREE.CylinderGeometry(0.8, 1, 1, 8).translate(0, 0.5, 0), surf({ ...MUSHROOM, body: MUSHROOM.body.replace("vO.y > 0.5", "false") }), stems, false);
    instanced(capGeo, surf({ ...MUSHROOM, body: MUSHROOM.body.replace("vO.y > 0.5", "true").replace("smoothstep(0.6, 0.75, vO.y)", "smoothstep(0.35, 0.6, vO.y)") }), caps, false);
    // the floor's litter: fallen dead twigs lying flat, cones
    const litter = [], cones = [];
    for (let k = 0, n = LITE ? 400 : 800; k < n; k++) {
      const [x, z] = around(7, 42);
      if (pathD(x, z) < 0.5 || !okFloor(x, z, 0.4)) continue;
      const len = 0.3 + D() * 1.1;
      litter.push([mtx(x, ground(x, z) + 0.015, z, (D() - 0.5) * 0.1, D() * TAU, (D() - 0.5) * 0.1, len * 0.55, len, len), [D(), D(), 0, 0], x, z]);
    }
    instanced(crossCards(1, true), surf(TWIG), litter, true);
    for (let k = 0, n = LITE ? 700 : 1400; k < n; k++) {
      const [x, z] = around(6, 40);
      if (pathD(x, z) < 0.4 || !okFloor(x, z, 0.3)) continue;
      const s = 0.8 + D() * 0.5;
      cones.push([mtx(x, ground(x, z) + 0.02 * s, z, 0, D() * TAU, 0, 0.022 * s, 0.022 * s, 0.06 * s), [D(), 0, 0, 0], x, z]);
    }
    instanced(new THREE.SphereGeometry(1, 8, 6), surf(CONE), cones, true);
    // fallen trunks and stumps
    const dead = [];
    for (const [x, z, len, rad, a] of [[-6, -12, 9, 0.28, 0.4], [13, -12, 11, 0.32, -0.9], [-10, -30, 8, 0.25, 1.4], [14, -18, 7, 0.22, 0.2]]) {
      if (!okFloor(x, z, 0.5)) continue;
      const dx = Math.sin(a), dz = Math.cos(a);
      const y0 = ground(x - dx * len * 0.5, z - dz * len * 0.5), y1 = ground(x + dx * len * 0.5, z + dz * len * 0.5);
      dummy.position.set(x, (y0 + y1) / 2 + rad * 0.6, z); dummy.rotation.set(0, 0, 0);
      dummy.lookAt(x + dx, (y0 + y1) / 2 + rad * 0.6 + (y1 - y0) / len, z + dz); dummy.scale.set(rad, rad, len); dummy.updateMatrix();
      dead.push([dummy.matrix.clone(), [0, D(), 0, 0], x, z]);
    }
    for (const [x, z, rad] of [[3.2, -5.5, 0.32], [-5.5, -18, 0.4], [10, -30, 0.35]]) if (okFloor(x, z, 0.5)) dead.push([mtx(x, ground(x, z) + 0.05, z, Math.PI / 2, 0, 0, rad, rad, 0.7 + D() * 0.3), [0, D(), 0, 0], x, z]);
    instanced(new THREE.CylinderGeometry(1, 1, 1, 12, 1).rotateX(Math.PI / 2), surf(DEADWOOD), dead, false);
  }

  // ---- the cabin
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); cabin.add(m); return m; };
  let CHIMNEY;
  const boards = (dir, col, w = 0.16) => surf({ ...BOARDS, uniforms: { uDir: { value: new THREE.Vector3(...dir) }, uCol: { value: new THREE.Vector3(...col) }, uW: { value: w } } });
  {
    // roof slabs, from the eave nearly at the ground over the ridge
    const len = (HR + Y0 - EAVE) / Math.sin(ALPHA) + 0.35, depth = 2 * ZG + 1.0;
    const roofMat = surf(ROOF);
    for (const sx of [-1, 1]) {
      const ex = sx * B * (1 + (Y0 - EAVE) / HR);             // where the underside meets the eave height
      const ux = -sx * Math.cos(ALPHA), uy = Math.sin(ALPHA);  // up the slope
      const nx = sx * Math.sin(ALPHA), ny = Math.cos(ALPHA);
      const cxm = ex + ux * len / 2 + nx * T / 2, cym = EAVE + uy * len / 2 + ny * T / 2;
      const slab = add(new THREE.BoxGeometry(len, T, depth), roofMat, cxm, cym, 0.4, 0, 0, sx > 0 ? -ALPHA : ALPHA);
      // the roof window's frame stands proud of the shingles (in the slab's frame; the window is s 2.9 to 4.35 up the slope, z -0.4 to 1.0)
      const xs = sx * (len / 2 + Math.cos(ALPHA) * T / Math.sin(ALPHA) - 3.625), fy = T / 2 + 0.022, wf = surf({ ...METAL, uniforms: { uCol: { value: new THREE.Vector3(0.05, 0.047, 0.042) } } });
      const frame = (w, h, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wf); m.position.set(x, fy, z); slab.add(m); };
      for (const z of [-0.76, 0.56]) frame(1.45, 0.044, 0.09, xs, z);
      for (const o of [-0.7, 0.7]) frame(0.09, 0.044, 1.4, xs + o, -0.1);
      frame(1.3, 0.03, 0.035, xs, -0.1); frame(0.035, 0.03, 1.3, xs, -0.1);
    }
    // ridge cap
    add(new THREE.BoxGeometry(0.34, 0.16, 2 * ZG + 1.02), surf({ ...METAL, uniforms: { uCol: { value: new THREE.Vector3(0.04, 0.04, 0.04) } } }), 0, Y0 + HR + T / Math.cos(ALPHA) - 0.02, 0.4);
    // the gables
    const tri = new THREE.Shape(); tri.moveTo(-B, Y0); tri.lineTo(B, Y0); tri.lineTo(0, Y0 + HR); tri.lineTo(-B, Y0);
    add(new THREE.ShapeGeometry(tri), surf(GABLE), 0, 0, ZG);
    const stoneMat = surf(STONEWALL);
    add(new THREE.ShapeGeometry(tri), stoneMat, 0, 0, -ZG, 0, Math.PI, 0);              // the back gable is a stone wall
    // stone footing under the floor, a deck in front with steps and a railing, a bench
    add(new THREE.BoxGeometry(2 * B + 0.3, Y0 + 0.4, 2 * ZG + 0.2), stoneMat, 0, (Y0 - 0.4) / 2, 0);
    const deck = boards([1, 0, 0], [0.34, 0.24, 0.15], 0.14), post = boards([0, 1, 0], [0.30, 0.21, 0.13], 10);
    const DW = B - 0.2;                                        // the deck's half width, inside the roof's overhang
    add(new THREE.BoxGeometry(2 * DW, 0.1, 2.5), deck, 0, Y0 - 0.05, ZG + 1.25);
    add(new THREE.BoxGeometry(2 * DW, Y0 - 0.1, 0.08), post, 0, (Y0 - 0.1) / 2, ZG + 2.46);
    for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(1.5, 0.08, 0.32), deck, 0, Y0 - 0.1 - (i + 1) * (Y0 - 0.1) / 3.4, ZG + 2.6 + i * 0.3);
    for (const x of [-DW + 0.05, -0.85, 0.85, DW - 0.05]) add(new THREE.BoxGeometry(0.1, 1.0, 0.1), post, x, Y0 + 0.5, ZG + 2.4);
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(DW - 0.85, 0.06, 0.1), post, s * (DW + 0.85) / 2, Y0 + 0.95, ZG + 2.4);
      add(new THREE.BoxGeometry(0.1, 0.06, 1.5), post, s * (DW - 0.05), Y0 + 0.95, ZG + 1.65);
      for (let k = 1; k < 8; k++) add(new THREE.BoxGeometry(0.04, 0.9, 0.04), post, s * (0.85 + k * (DW - 0.9) / 8), Y0 + 0.45, ZG + 2.4);
    }
    add(new THREE.BoxGeometry(1.4, 0.06, 0.38), deck, -2.0, Y0 + 0.42, ZG + 0.4);
    // pumpkins: on the steps, by the door and on the bench
    {
      const pk = [];
      for (const [x, y, z, r, sq] of [[0.55, Y0 - 0.1 - (Y0 - 0.1) / 3.4, ZG + 2.62, 0.17, 0.75], [-0.5, Y0 - 0.1 - 2 * (Y0 - 0.1) / 3.4, ZG + 2.92, 0.12, 0.7],
        [0.62, Y0, ZG + 0.35, 0.2, 0.7], [0.95, Y0, ZG + 0.45, 0.13, 0.8], [-1.6, Y0 + 0.45, ZG + 0.42, 0.09, 0.85], [-0.62, Y0, ZG + 0.4, 0.15, 0.72]]) {
        dummy.position.set(x, y + r * sq, z); dummy.rotation.set(0, D() * TAU, 0); dummy.scale.set(r, r * sq, r); dummy.updateMatrix();
        pk.push([dummy.matrix.clone().premultiply(cabin.matrixWorld), [D(), D(), 0, 0], 0, 0]);
      }
      // a lathe: the body to a dimple, then a short stalk that leans and flares; nine ribs pulled out of it
      const prof = []; for (let k = 0; k <= 14; k++) { const th = k / 14 * Math.PI * 0.9; prof.push(new THREE.Vector2(Math.sin(th), -Math.cos(th))); }
      for (const [r, y] of [[0.19, 0.9], [0.1, 0.84], [0.07, 0.88], [0.062, 1.05], [0.068, 1.25], [0.095, 1.33], [0.0, 1.33]]) prof.push(new THREE.Vector2(r, y));
      const pg = new THREE.LatheGeometry(prof, 36), pp = pg.attributes.position;
      for (let i = 0; i < pp.count; i++) {
        const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i), r = Math.hypot(x, z), k = 1 + 0.07 * Math.cos(9 * Math.atan2(z, x)) * Math.min(1, r * 1.6) * (y < 0.95 ? 1 : 0);
        pp.setXYZ(i, x * k + (y > 0.95 ? (y - 0.95) * (y - 0.95) * 0.9 : 0), y, z * k);
      }
      pg.computeVertexNormals();
      instanced(pg, surf(PUMPKIN), pk, false);
    }
    for (const x of [-2.6, -1.4]) add(new THREE.BoxGeometry(0.06, 0.42, 0.34), post, x, Y0 + 0.21, ZG + 0.4);
    // depth on the front: casings and sills round the windows, glazing bars, the door's casing and handle, the beam under the big glass
    {
      const wood = [0.36, 0.23, 0.12], tv = boards([0, 1, 0], wood, 10), th = boards([1, 0, 0], wood, 10);
      const brass = surf({ ...METAL, uniforms: { uCol: { value: new THREE.Vector3(0.24, 0.16, 0.06) } } });
      const bar = (w, h, d, mat, x, y, z) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
      for (const sx of [-1, 1]) {
        const wx = sx * 1.85, wy = Y0 + 1.46;
        for (const o of [-0.525, 0.525]) { bar(0.075, 1.12, 0.07, tv, wx + o, wy, ZG + 0.035); bar(1.12, 0.075, 0.07, th, wx, wy + o, ZG + 0.035); }
        bar(0.04, 0.98, 0.035, tv, wx, wy, ZG + 0.02); bar(0.98, 0.04, 0.035, th, wx, Y0 + 1.6, ZG + 0.02);
        bar(1.32, 0.06, 0.2, th, wx, Y0 + 0.83, ZG + 0.09);                                  // the sill, standing out
      }
      for (const sx of [-1, 1]) bar(0.07, 2.14, 0.06, tv, sx * 0.535, Y0 + 1.07, ZG + 0.03);   // the door's casing, glazing bars, a brass lever
      bar(1.14, 0.08, 0.06, th, 0, Y0 + 2.14, ZG + 0.03); bar(1.0, 0.04, 0.12, th, 0, Y0 + 0.02, ZG + 0.06);
      bar(0.035, 0.8, 0.03, tv, 0, Y0 + 1.55, ZG + 0.015); bar(0.58, 0.035, 0.03, th, 0, Y0 + 1.55, ZG + 0.015);
      bar(0.03, 0.16, 0.014, brass, 0.38, Y0 + 1.05, ZG + 0.008); bar(0.11, 0.022, 0.03, brass, 0.33, Y0 + 1.1, ZG + 0.03);
      bar(4.9, 0.3, 0.1, th, 0, Y0 + 2.7, ZG + 0.05);
      bar(0.07, 4.25, 0.07, tv, 0, Y0 + 4.975, ZG + 0.035); bar(1.83, 0.07, 0.07, th, 0, Y0 + 5.3, ZG + 0.035);      // bars across the big glass
      for (const sx of [-1, 1]) bar(0.07, 1.58, 0.07, tv, sx * 1.35, Y0 + 3.64, ZG + 0.035);
      // a coir mat before the door
      add(new THREE.BoxGeometry(0.85, 0.025, 0.5), surf({ body: `
        vec3 cl = (uCabInv * vec4(vW, 1.)).xyz; vec2 q = cl.xz - vec2(0., ${(ZG + 0.45).toFixed(2)});
        float edge = smoothstep(0.03, 0.06, min(0.425 - abs(q.x), 0.25 - abs(q.y)));
        alb = mix(vec3(0.06, 0.04, 0.025), vec3(0.2, 0.14, 0.08), edge) * (0.55 + 0.9 * n3(vec3(q * vec2(90., 20.), 1.))); wrap = 0.3;` }), 0, Y0 + 0.0125, ZG + 0.45, 0, 0.04, 0);
    }
    // a string of lights over the deck: two poles at the front corners, a swag between them and strings back to the
    // gable under the eaves, a bulb every 40 cm hanging just below the cable
    {
      const PL = [-(DW - 0.05), Y0 + 2.6, ZG + 2.4], PR = [DW - 0.05, Y0 + 2.6, ZG + 2.4];
      for (const pp of [PL, PR]) add(new THREE.BoxGeometry(0.09, 2.6, 0.09), post, pp[0], Y0 + 1.3, pp[2]);
      const W0 = [0, Y0 + 2.5, ZG + 0.04], WL = [-2.3, Y0 + 2.45, ZG + 0.04], WR = [2.3, Y0 + 2.45, ZG + 0.04];
      const runs = [[PL, PR, 0.32], [W0, PL, 0.24], [W0, PR, 0.24], [WL, PL, 0.18], [WR, PR, 0.18]];
      const cable = surf({ ...METAL, uniforms: { uCol: { value: new THREE.Vector3(0.02, 0.02, 0.02) } } });
      const bulbs = [];
      for (const [a, b, sag] of runs) {
        const at = (t) => new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t);
        const pts = []; for (let i = 0; i <= 16; i++) pts.push(at(i / 16));
        add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.006, 4), cable);
        const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.round(L / 0.4);
        for (let i = 1; i < n; i++) { const q = at(i / n); dummy.position.set(q.x, q.y - 0.07, q.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); bulbs.push(dummy.matrix.clone()); }
      }
      const bulb = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, bulbs.length); bulbs.forEach((b, i) => m.setMatrixAt(i, b)); m.frustumCulled = false; cabin.add(m); };
      bulb(new THREE.SphereGeometry(0.038, 10, 8), surf({ inst: true, body: "float h = hash12(vW.xz * 13. + vW.y); alb = vec3(0.); emis = mix(vec3(1.0, 0.62, 0.28), vec3(1.0, 0.72, 0.4), h) * (5. + 1.8 * h + 0.5 * sin(uTime * (0.6 + h) + h * 40.));" }));
      bulb(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 6).translate(0, 0.05, 0), cable);         // the sockets
    }
    // the lantern by the door
    const lp = [1.0, Y0 + 2.15, ZG + 0.12];
    add(new THREE.BoxGeometry(0.2, 0.3, 0.2), surf(GLOWMAT), ...lp);
    add(new THREE.BoxGeometry(0.26, 0.04, 0.26), surf(METAL), lp[0], lp[1] + 0.17, lp[2]);
    add(new THREE.BoxGeometry(0.24, 0.03, 0.24), surf(METAL), lp[0], lp[1] - 0.165, lp[2]);
    for (const dx of [-0.1, 0.1]) for (const dz of [-0.1, 0.1]) add(new THREE.BoxGeometry(0.024, 0.32, 0.024), surf(METAL), lp[0] + dx, lp[1], lp[2] + dz);
    add(new THREE.TorusGeometry(0.05, 0.006, 6, 14), surf(METAL), lp[0], lp[1] + 0.24, lp[2]);
    add(new THREE.BoxGeometry(0.06, 0.06, 0.16), surf(METAL), lp[0], lp[1] + 0.05, lp[2] - 0.12);
    // the chimney: a stone stack built against the back wall, broad at the hearth, narrowing above it, clear of the ridge
    const ctop = Y0 + HR + 1.3;
    add(new THREE.BoxGeometry(1.9, Y0 + 3.7, 0.87), stoneMat, 0, (Y0 + 3.4 - 0.3) / 2, -ZG - 0.43);
    {
      const g = new THREE.BoxGeometry(1.9, 0.8, 0.87), q = g.attributes.position;
      for (let i = 0; i < q.count; i++) if (q.getY(i) > 0) { q.setX(i, q.getX(i) * 1.15 / 1.9); q.setZ(i, q.getZ(i) * 0.6 / 0.87 - 0.07); }
      g.computeVertexNormals();
      add(g, stoneMat, 0, Y0 + 3.4 + 0.4, -ZG - 0.43);
    }
    add(new THREE.BoxGeometry(1.15, ctop - (Y0 + 4.2), 0.6), stoneMat, 0, (ctop + Y0 + 4.2) / 2, -ZG - 0.5);
    add(new THREE.BoxGeometry(1.35, 0.1, 0.8), stoneMat, 0, ctop + 0.05, -ZG - 0.5);
    add(new THREE.CylinderGeometry(0.1, 0.11, 0.3, 12), surf(METAL), 0, ctop + 0.25, -ZG - 0.5);           // the stovepipe and its rain hat on three struts
    add(new THREE.ConeGeometry(0.2, 0.1, 12), surf(METAL), 0, ctop + 0.5, -ZG - 0.5);
    for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.014, 0.12, 0.014), surf(METAL), Math.cos(i * 2.094) * 0.1, ctop + 0.42, -ZG - 0.5 + Math.sin(i * 2.094) * 0.1);
    CHIMNEY = cw(0, ctop + 0.34, -ZG - 0.5);

    // the woodshed along your side of the cabin: four posts, a sloping roof, two rows of logs
    const shedX = -B * (1 + (Y0 - EAVE) / HR) - 1.35, shedZ0 = -3.6, shedZ1 = 2.6;
    for (const z of [shedZ0, shedZ1]) for (const dx of [-0.55, 0.55]) add(new THREE.BoxGeometry(0.1, 2.0 + dx * 0.35, 0.1), post, shedX + dx, 1.0 + dx * 0.17, z);
    add(new THREE.BoxGeometry(1.7, 0.06, shedZ1 - shedZ0 + 0.7), boards([Math.cos(0.33), Math.sin(0.33), 0], [0.2, 0.17, 0.13], 0.18), shedX, 2.12, (shedZ0 + shedZ1) / 2, 0, 0, 0.33);
    add(new THREE.BoxGeometry(1.3, 0.1, shedZ1 - shedZ0 + 0.2), post, shedX, 0.08, (shedZ0 + shedZ1) / 2);
    const logs = [[], [], []];          // round, half, quarter
    const logItem = (x, y, z, ry, rx, rad, len, birch, round) => {
      const k0 = D() < 0.45 ? 0 : D() < 0.5 ? 1 : 2, k = round ? 0 : k0;
      dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, D() * TAU); dummy.scale.set(rad, rad, len); dummy.updateMatrix();
      const m = dummy.matrix.clone().premultiply(cabin.matrixWorld);
      logs[k].push([m, [birch, D() * 0.5, D(), rad], 0, 0]);
    };
    for (const row of [-0.18, 0.18]) {
      let z = shedZ0 + 0.1;
      const cols = [];
      while (z < shedZ1 - 0.1) { const rad = 0.05 + D() * 0.04; cols.push([z + rad, rad]); z += rad * 2 + 0.005; }
      for (const [zc] of cols) {
        let y = 0.13;
        while (y < 1.55 + (D() - 0.5) * 0.2) {
          const rad = 0.045 + D() * 0.045;
          logItem(shedX + row + (D() - 0.5) * 0.04, y + rad, zc + (D() - 0.5) * 0.03, Math.PI / 2 + (D() - 0.5) * 0.1, (D() - 0.5) * 0.06, rad, 0.33 + D() * 0.05, D() < 0.2 ? 1 : 0);
          y += rad * 1.8;
        }
      }
    }
    // a round stack in the clearing, roofed with bark
    const rs = [4.8, 0, 7.8];
    for (let y = 0.08, layer = 0; y < 1.9; y += 0.12, layer++) {
      const Rr = 1.15 * Math.sqrt(1 - Math.pow(y / 2.2, 2)), n = Math.floor(TAU * Rr / 0.13);
      for (let i = 0; i < n; i++) {
        const a = (i + (layer % 2) * 0.5) / n * TAU, rad = 0.05 + D() * 0.035, len = 0.34 + D() * 0.06;
        logItem(rs[0] + Math.cos(a) * (Rr - len / 2), y + rad, rs[2] + Math.sin(a) * (Rr - len / 2), Math.PI / 2 - a, (D() - 0.5) * 0.08 - 0.1, rad, len, D() < 0.15 ? 1 : 0);
      }
    }
    add(new THREE.ConeGeometry(1.0, 0.7, 14), surf({ body: `      // a roof of overlapping bark strips, mossy
      float row = (vO.y + 0.35) * 11., ri = floor(row), rf = fract(row), cell = floor(atan(vO.z, vO.x) / 6.2832 * 18. + ri * 0.37), th = hash12(vec2(ri, cell));
      alb = mix(vec3(0.06, 0.045, 0.035), vec3(0.2, 0.14, 0.1), th) * mix(0.35, 1., smoothstep(0., 0.18, rf)) * (0.8 + 0.4 * n3(vW * 25.));
      float moss = smoothstep(0.45, 0.7, n3(vW * 3.5) + (rf - 0.5) * 0.1);
      alb = mix(alb, vec3(0.06, 0.11, 0.025) * (0.7 + 0.6 * n3(vW * 22.)), moss * 0.85);
      N = bumpN(N, vW, rf * 0.012, 1.); wrap = 0.2;` }), rs[0], 2.05, rs[2]);
    // chopping block with the axe in it, split pieces lying about
    const cb = [-2.6, 0, 8.4];
    logItem(cb[0], 0.3, cb[2], 0, Math.PI / 2, 0.27, 0.6, 0, true);
    for (let i = 0; i < 7; i++) { const a = D() * TAU, d = 0.5 + D() * 0.9; logItem(cb[0] + Math.cos(a) * d, 0.05, cb[2] + Math.sin(a) * d, D() * TAU, 0, 0.05 + D() * 0.03, 0.34, 0); }
    // the axe, sunk in the block and leaning back: a hickory haft swelling to a knob, a forged head (poll, eye, cheeks, a bit
    // that flares to a curved edge) in the haft's frame, y along it, the edge toward -x
    const axe = new THREE.Group(); axe.position.set(cb[0] + 0.05, 0.73, cb[2]); axe.rotation.set(0.05, 0.6, 1.0); cabin.add(axe);
    const haftMat = surf({ body: "float a = atan(vO.z, vO.x); alb = mix(vec3(0.36, 0.23, 0.1), vec3(0.6, 0.42, 0.2), vnoise(vec2(a * 4., vO.y * 9.)) * 0.7 + vnoise(vec2(a * 9., vO.y * 40.)) * 0.3) * (0.85 + 0.3 * n3(vO * 60.)); wrap = 0.2; spec = 14.;" });
    const haft = new THREE.Mesh(new THREE.LatheGeometry([[0.0, -0.04], [0.02, -0.04], [0.016, 0.06], [0.0135, 0.3], [0.016, 0.55], [0.024, 0.68], [0.03, 0.72], [0.0, 0.74]].map(([r, y]) => new THREE.Vector2(r, y)), 10), haftMat);
    axe.add(haft);
    const hs = new THREE.Shape(); hs.moveTo(0.05, -0.04); hs.lineTo(0.05, 0.04); hs.lineTo(-0.02, 0.05); hs.quadraticCurveTo(-0.08, 0.055, -0.13, 0.11);
    hs.quadraticCurveTo(-0.2, 0, -0.13, -0.11); hs.quadraticCurveTo(-0.08, -0.055, -0.02, -0.05); hs.lineTo(0.05, -0.04);
    const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.04, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -0.02), hp = hg.attributes.position;
    for (let i = 0; i < hp.count; i++) { const x = hp.getX(i); if (x < -0.02) hp.setZ(i, hp.getZ(i) * (1 - 0.88 * clamp((-0.02 - x) / 0.15, 0, 1))); }       // the cheeks taper to the edge
    hg.computeVertexNormals();
    axe.add(new THREE.Mesh(hg, surf({ body: "alb = vec3(0.16, 0.17, 0.18) * (0.8 + 0.4 * n3(vW * 50.)); alb = mix(alb, vec3(0.3, 0.3, 0.3), smoothstep(-0.09, -0.15, vO.x) * 0.5); spec = 110.;" })));
    const logGeo = [new THREE.CylinderGeometry(1, 1, 1, 10).rotateX(Math.PI / 2), wedgeGeo(Math.PI), wedgeGeo(Math.PI / 2)];
    const logMat = surf(LOG);
    logs.forEach((list, i) => instanced(logGeo[i], logMat, list, false));
  }

  // ---- animals wandering their trails: herds keep together, walk a while, stop to graze or look round, walk on
  const AR = rng(424);
  const herds = [];
  const herd = (route, kind, n, a0) => herds.push({ route, kind, a: a0, dir: AR() < 0.5 ? 1 : -1, state: "graze", timer: 4 + AR() * 10, mv: 0,
    members: Array.from({ length: n }, (_, i) => ({ da: i * (kind === 0 ? 0.075 : 0.5) * (i % 2 ? 1 : -1), side: (AR() - 0.5) * 2.4, ph: AR() * TAU, graze: kind === 1 ? 0 : 1, gph: AR() * TAU, s: 0.9 + AR() * 0.2 })) });
  herd(0, 0, 3, ORBIT0 - 0.3);       // three roe deer at the edge of the clearing, left of the path as you first see it
  herd(1, 0, 2, ORBIT0 + 2.6);
  herd(2, 1, 1, ORBIT0 - 0.9);       // a fox on its round further out
  herd(3, 2, 2, ORBIT0 - 0.5);       // hares round the clearing
  const beastMeshes = SPECIES.map((sp, k) => {
    const n = herds.filter((h) => h.kind === k).reduce((a, h) => a + h.members.length, 0);
    const g = beast(sp);
    g.setAttribute("aI", new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.InstancedMesh(g, surf(ANIMAL), n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false;
    scene.add(m);
    return m;
  });
  function animals(dt, t) {
    const fill = [0, 0, 0];
    for (const h of herds) {
      const k = h.kind, speed = [0.55, 1.3, 2.4][k], stride = [1.1, 0.8, 1.0][k];
      h.timer -= dt;
      if (h.timer < 0) {
        if (h.state === "walk") { h.state = "graze"; h.timer = k === 0 ? 8 + AR() * 16 : k === 1 ? 2 + AR() * 6 : 1.5 + AR() * 5; }
        else { h.state = "walk"; h.timer = k === 0 ? 5 + AR() * 12 : k === 1 ? 8 + AR() * 16 : 0.6 + AR() * 1.2; if (AR() < 0.15) h.dir = -h.dir; }
      }
      h.mv += ((h.state === "walk" ? 1 : 0) - h.mv) * Math.min(1, dt * (k === 2 ? 6 : 1.5));
      const v = speed * h.mv;
      h.a += h.dir * v * dt / routeR(h.route, h.a);
      for (const b of h.members) {
        b.ph += dt * v / stride * TAU;
        const wantGraze = h.state !== "walk" && k !== 1 && Math.sin(t * 0.35 + b.gph) > -0.5;     // now and then the head comes up
        b.graze += ((wantGraze ? 1 : 0) - b.graze) * Math.min(1, dt * 1.2);
        const a = h.a + b.da, [x0, z0] = routeAt(h.route, a), [x1, z1] = routeAt(h.route, a + 0.01 * h.dir);
        let hx = x1 - x0, hz = z1 - z0; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
        const x = x0 - hz * b.side, z = z0 + hx * b.side;
        const hop = k === 2 ? Math.abs(Math.sin(b.ph * 0.5)) * 0.14 * h.mv : Math.abs(Math.cos(b.ph)) * 0.015 * h.mv;
        dummy.position.set(x, ground(x, z) + hop, z);
        dummy.rotation.set(0, Math.atan2(-hz, hx), -b.graze * 0.1);
        dummy.scale.setScalar(b.s);
        dummy.updateMatrix();
        const m = beastMeshes[k], i = fill[k]++;
        m.setMatrixAt(i, dummy.matrix);
        m.geometry.attributes.aI.array.set([k, b.ph, h.mv, b.graze], i * 4);
      }
    }
    for (const m of beastMeshes) { m.instanceMatrix.needsUpdate = true; m.geometry.attributes.aI.needsUpdate = true; }
  }

  // ---- smoke from the chimney: a few dozen soft puffs simulated on the CPU, rising, widening, drifting downwind
  const MAXP = 160;
  const smokeGeo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1));
  const sP = new Float32Array(MAXP * 4), sQ = new Float32Array(MAXP * 4);
  smokeGeo.setAttribute("aP", new THREE.InstancedBufferAttribute(sP, 4).setUsage(THREE.DynamicDrawUsage));
  smokeGeo.setAttribute("aQ", new THREE.InstancedBufferAttribute(sQ, 4).setUsage(THREE.DynamicDrawUsage));
  smokeGeo.instanceCount = 0;
  const smoke = new THREE.Mesh(smokeGeo, new THREE.ShaderMaterial({
    uniforms: SU, transparent: true, depthWrite: false,
    vertexShader: `${GLSL_COMMON}
      attribute vec4 aP, aQ; varying vec2 vUv; varying vec4 vQ; varying vec3 vW;
      void main(){
        vUv = uv; vQ = aQ;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float c = cos(aQ.w), s = sin(aQ.w); vec2 q = mat2(c, s, -s, c) * position.xy;
        vec3 w = aP.xyz + (right * q.x + up * q.y) * aP.w;
        vW = w;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.);
      }`,
    fragmentShader: `${GLSL_COMMON}${GLSL_LIGHT}
      varying vec2 vUv; varying vec4 vQ; varying vec3 vW;
      void main(){
        vec2 c = vUv - 0.5;
        float d = length(c) * 2.;
        float cs = cos(vQ.w), sn = sin(vQ.w);
        float up = (mat2(cs, sn, -sn, cs) * c).y * 2.;                                    // which way is up on screen, however the puff is turned
        float n = fbm(vUv * 2.6 + vQ.z * 17. + vec2(0., -vQ.y * 0.8));
        float n2 = vnoise(vUv * 9. + vQ.z * 31.);
        float a = smoothstep(1., 0.25, d + (n - 0.5) * 0.9 + (n2 - 0.5) * 0.35 * smoothstep(0.1, 0.7, vQ.y)) * vQ.x;                  // older puffs fray into wisps
        if (a < 0.003) discard;
        float lit = smoothstep(-0.8, 0.8, up + (n - 0.5) * 0.8);                           // the top catches the sky, the belly is in shade
        vec3 col = mix(vec3(0.15, 0.16, 0.19), vec3(0.46, 0.47, 0.5), n * (0.6 + 0.4 * lit)) * (0.65 + 0.6 * lit) * (uSkyA * 1.4 + uGlowCol * 0.5) + cabinLight(vW, vec3(0., -1., 0.), 1.) * 0.25;
        col = mix(col, vec3(0.6, 0.35, 0.2) * 0.3, smoothstep(0.15, 0., vQ.y) * 0.4);
        col *= 1. - 0.25 * smoothstep(0.6, 0., d) * (1. - vQ.y);                         // a dense young core
        gl_FragColor = vec4(fogged(col, vW), a);
      }`,
  }));
  smoke.frustumCulled = false; smoke.renderOrder = 5;
  scene.add(smoke);
  const puffs = [];
  let emitAcc = 0;
  // sparks when the fire is stoked
  const MAXS = 60, spark = new Float32Array(MAXS * 4), sparks = [];
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAXS * 3), 3));
  sparkGeo.setAttribute("aS", new THREE.BufferAttribute(spark, 4).setUsage(THREE.DynamicDrawUsage));
  const sparkPts = new THREE.Points(sparkGeo, new THREE.ShaderMaterial({
    uniforms: SU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: "attribute vec4 aS; varying float vA; void main(){ vA = aS.w; vec4 mv = viewMatrix * vec4(aS.xyz, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(60. / -mv.z, 1.5, 4.); }",
    fragmentShader: "varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.6, 0.6, 0.15) * vA * smoothstep(0.5, 0.1, d), 1.); }",
  }));
  sparkPts.frustumCulled = false;
  scene.add(sparkPts);

  // ---- larch needles drifting down round you, and mist lying between the trunks
  const NEED = LITE ? 220 : 420;
  const needGeo = new THREE.BufferGeometry();
  {
    const P = new Float32Array(NEED * 3), S = new Float32Array(NEED);
    for (let i = 0; i < NEED; i++) { P[i * 3] = D(); P[i * 3 + 1] = D(); P[i * 3 + 2] = D(); S[i] = D(); }
    needGeo.setAttribute("position", new THREE.BufferAttribute(P, 3));
    needGeo.setAttribute("aS", new THREE.BufferAttribute(S, 1));
  }
  const needU = { ...SU, uBox0: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(36, 14, 36) }, uScale: { value: 600 } };
  const needles = new THREE.Points(needGeo, new THREE.ShaderMaterial({
    uniforms: needU, transparent: true, depthWrite: false,
    vertexShader: `${GLSL_COMMON}${GLSL_LIGHT}
      attribute float aS; uniform vec3 uBox0, uBox; uniform float uScale; varying vec3 vC; varying float vA, vAng;
      void main(){
        vec3 drift = vec3(uWind.x * 0.5, -0.45 - 0.3 * aS, uWind.y * 0.5) * uTime + vec3(sin(uTime * 1.3 + aS * 40.), 0., cos(uTime * 1.1 + aS * 23.)) * 0.4;
        vec3 w = uBox0 + mod(position * uBox + drift, uBox);
        vec4 mv = viewMatrix * vec4(w, 1.);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        gl_PointSize = clamp(uScale * 0.05 / d, 1., 7.);
        vec3 e = mod(position * uBox + drift, uBox) / uBox;
        vA = smoothstep(0., 0.08, min(min(e.x, 1. - e.x), min(e.z, 1. - e.z))) * smoothstep(0., 0.1, min(e.y, 1. - e.y)) * smoothstep(0.6, 2., d);
        vC = fogged(shade(vec3(0.5, 0.3, 0.07), vec3(0., 1., 0.), w, 1., 1., 0.), w);
        vAng = uTime * (2. + aS * 3.) + aS * 50.;
      }`,
    fragmentShader: `
      varying vec3 vC; varying float vA, vAng;
      void main(){
        vec2 c = gl_PointCoord - 0.5, dir = vec2(cos(vAng), sin(vAng));
        float along = dot(c, dir), across = dot(c, vec2(-dir.y, dir.x));
        float a = smoothstep(0.08, 0.02, abs(across)) * smoothstep(0.45, 0.35, abs(along)) * vA;
        if (a < 0.02) discard;
        gl_FragColor = vec4(vC, a);
      }`,
  }));
  needles.frustumCulled = false;
  scene.add(needles);

  const MIST = 40, mistGeo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0));
  {
    const A = new Float32Array(MIST * 4), Bm = new Float32Array(MIST * 4);
    for (let i = 0; i < MIST; i++) {
      const a = D() * TAU, d = 16 + D() * 60, x = CABIN.x + Math.sin(a) * d, z = CABIN.z + Math.cos(a) * d;
      A.set([x, ground(x, z) - 0.6, z, 20 + D() * 30], i * 4); Bm.set([3 + D() * 4, D(), 0.12 + D() * 0.14, 0], i * 4);
    }
    mistGeo.setAttribute("aA", new THREE.InstancedBufferAttribute(A, 4));
    mistGeo.setAttribute("aB", new THREE.InstancedBufferAttribute(Bm, 4));
    mistGeo.instanceCount = MIST;
  }
  const mist = new THREE.Mesh(mistGeo, new THREE.ShaderMaterial({
    uniforms: SU, transparent: true, depthWrite: false,
    vertexShader: `${GLSL_COMMON}
      attribute vec4 aA, aB; varying vec2 vUv; varying vec3 vW; varying vec4 vB;
      void main(){
        vUv = uv; vB = aB;
        vec3 to = cameraPosition - aA.xyz; vec3 right = normalize(vec3(to.z, 0., -to.x));
        vec3 w = aA.xyz + right * position.x * aA.w + vec3(0., position.y * aB.x, 0.);
        vW = w;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.);
      }`,
    fragmentShader: `${GLSL_COMMON}${GLSL_LIGHT}
      varying vec2 vUv; varying vec3 vW; varying vec4 vB;
      void main(){
        float n = fbm(vec2(vUv.x * 3. + vB.y * 10. + uTime * 0.012, vUv.y * 1.2 - uTime * 0.01));
        float a = smoothstep(0.35, 0.75, n) * smoothstep(0., 0.35, vUv.y) * smoothstep(1., 0.45, vUv.y) * smoothstep(0., 0.2, vUv.x) * smoothstep(1., 0.8, vUv.x);
        float d = distance(cameraPosition, vW);
        a *= vB.z * smoothstep(4., 12., d);
        vec3 col = fogSky(normalize(vW - cameraPosition)) * 1.1 + cabinLight(vW, normalize(cameraPosition - vW), 1.) * 0.3;
        gl_FragColor = vec4(col, a);
      }`,
  }));
  mist.frustumCulled = false; mist.renderOrder = 4;
  scene.add(mist);

  // ---- input: drag with the mouse to look round (up into the crowns, down to the floor); ←/→ or A/D walk round the
  // cabin; ↑/↓, +/−, the wheel or a pinch come closer or step back. On a touch screen one finger walks round and tilts,
  // two fingers pinch.
  let yawT = 0, yaw = 0, pitchT = 0, pitch = 0, keyOrb = 0, keyZoom = 0;
  let orbT = 0, orb = 0, distT = DIST0, dist = DIST0, stepPh = 0;
  const camXZ = [START[0], START[1]];
  let mdrag = null;                                   // the mouse looks round only while a button is held on the scene
  canvasEl.style.cursor = "grab";
  canvasEl.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse" || e.button !== 0) return; mdrag = [e.clientX, e.clientY]; canvasEl.style.cursor = "grabbing"; canvasEl.setPointerCapture?.(e.pointerId); });
  const endMouse = (e) => { if (e.pointerType === "mouse") { mdrag = null; canvasEl.style.cursor = "grab"; } };
  addEventListener("pointerup", endMouse); addEventListener("pointercancel", endMouse);
  addEventListener("pointermove", (e) => {
    if (!mdrag || e.pointerType !== "mouse") return;
    yawT -= (e.clientX - mdrag[0]) * 0.0045;
    pitchT = clamp(pitchT + (e.clientY - mdrag[1]) * 0.003, -0.45, 0.45);
    mdrag = [e.clientX, e.clientY];
  }, { passive: true });
  const touches = new Map();
  let pinch = 0;
  const spread = () => { const [a, b] = [...touches.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); };
  canvasEl.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; touches.set(e.pointerId, [e.clientX, e.clientY]); if (touches.size === 2) pinch = spread(); });
  const endTouch = (e) => { touches.delete(e.pointerId); pinch = touches.size === 2 ? spread() : 0; };
  addEventListener("pointerup", endTouch); addEventListener("pointercancel", endTouch);
  addEventListener("pointermove", (e) => {
    const p = touches.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p[0], dy = e.clientY - p[1];
    p[0] = e.clientX; p[1] = e.clientY;
    if (touches.size === 1) { orbT -= dx * 0.006; pitchT = clamp(pitchT + dy * 0.003, -0.35, 0.35); }
    else if (touches.size === 2) { const s = spread(); if (pinch > 0) distT = clamp(distT * pinch / Math.max(s, 1), DMIN, DMAX); pinch = s; }
  }, { passive: true });
  addEventListener("wheel", (e) => { distT = clamp(distT * Math.exp(e.deltaY * 0.0012), DMIN, DMAX); }, { passive: true });
  const KEYS = { arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0], arrowup: [0, -1], arrowdown: [0, 1], "+": [0, -1], "=": [0, -1], "-": [0, 1], _: [0, 1] };
  addEventListener("keydown", (e) => { const k = KEYS[e.key.toLowerCase()]; if (!k || e.metaKey || e.ctrlKey) return; if (k[0]) keyOrb = k[0]; if (k[1]) keyZoom = k[1]; });
  addEventListener("keyup", (e) => { const k = KEYS[e.key.toLowerCase()]; if (!k) return; if (k[0]) keyOrb = 0; if (k[1]) keyZoom = 0; });
  const near = (x, z) => { const out = [], i0 = Math.floor(x / 4), j0 = Math.floor(z / 4); for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) { const l = obstacles.get(`${i},${j}`); if (l) out.push(...l); } return out; };

  const resize = () => {
    const w = canvasEl.clientWidth || innerWidth, h = canvasEl.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 1 ? 68 : 46;
    camera.updateProjectionMatrix();
    needU.uScale.value = renderer.domElement.height * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    post.setSize();
  };
  addEventListener("resize", resize); resize();

  // ---- time of day and the fire
  const DUSK = { skyA: [0.15, 0.19, 0.27], skyG: [0.035, 0.032, 0.03], glow: [0.10, 0.075, 0.075], fog: [0.092, 0.112, 0.15] };
  const NIGHT = { skyA: [0.022, 0.03, 0.05], skyG: [0.006, 0.006, 0.006], glow: [0.004, 0.004, 0.006], fog: [0.016, 0.02, 0.03] };
  const mixv = (v, a, b, t) => v.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
  let night = 0, nightT = 0, stoke = 0, stokeT = -1;
  const flick = (t) => 0.82 + 0.1 * Math.sin(t * 7.3) + 0.06 * Math.sin(t * 13.1 + 1.3) + 0.08 * (h1(Math.floor(t * 9)) - 0.5) + 0.1 * Math.sin(t * 2.1);

  let last = performance.now(), raf = 0, visible = true, slow = 0, tNow = reduced ? 30 : 0, dbgCam = null;
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), v3 = new THREE.Vector3();
  function frame(dt) {
    tNow += dt;
    const t = tNow;
    SU.uTime.value = t;
    // the fire: flickers, and when stoked flares, smokes thick and throws sparks
    if (stokeT >= 0) { stokeT += dt; stoke = Math.min(1, stokeT / 1.5) * (1 - smooth(10, 22, stokeT)); if (stokeT > 22) { stokeT = -1; stoke = 0; } }
    const fl = flick(t) * (1 + stoke * 0.5);
    SU.uFlick.value = fl;
    night += (nightT - night) * (dt > 0 ? 1 - Math.exp(-dt * 0.35) : 1);
    SU.uNight.value = night;
    mixv(SU.uSkyA.value, DUSK.skyA, NIGHT.skyA, night); mixv(SU.uSkyG.value, DUSK.skyG, NIGHT.skyG, night);
    mixv(SU.uGlowCol.value, DUSK.glow, NIGHT.glow, night); mixv(SU.uFogCol.value, DUSK.fog, NIGHT.fog, night);
    LIGHTS.forEach((l, i) => SU.uLc.value[i].set(...l.c).multiplyScalar(l.i * (i === 2 ? 0.95 + 0.05 * fl : i === 5 ? 1 : 0.7 + 0.3 * fl)));
    post.U.uExposure.value = 1.2 + night * 0.4;

    // walking round the cabin: the circle you are on, then stepped round anything in the way
    const k = dt > 0 ? 1 - Math.exp(-dt * 12) : 1, kWalk = dt > 0 ? 1 - Math.exp(-dt * 7) : 1;
    orbT += keyOrb * dt * 0.45;                                       // about 26° a second: once round in 14 s
    distT = clamp(distT + keyZoom * dt * 12, DMIN, DMAX);
    const orb0 = orb, dist0 = dist;
    orb += (orbT - orb) * kWalk; dist += (distT - dist) * kWalk;
    const ang = ORBIT0 + orb;
    let cx = CABIN.x + Math.sin(ang) * dist, cz = CABIN.z + Math.cos(ang) * dist;
    for (let it = 0; it < 3; it++) for (const [ox, oz, or] of near(cx, cz)) {
      const dx = cx - ox, dz = cz - oz, d = Math.hypot(dx, dz);
      if (d < or && d > 1e-4) { cx = ox + dx / d * or; cz = oz + dz / d * or; }
    }
    camXZ[0] += (cx - camXZ[0]) * k; camXZ[1] += (cz - camXZ[1]) * k;
    const [px, pz] = camXZ;
    const moving = dt > 0 ? Math.min(1, (Math.abs(orb - orb0) * dist + Math.abs(dist - dist0)) / dt / 3) : 0;
    stepPh += dt * 5.5 * moving;
    camPos.set(px, ground(px, pz) + EYE + Math.sin(stepPh) * 0.018 * moving, pz);
    yaw += (yawT - yaw) * k; pitch += (pitchT - pitch) * k;
    const base = Math.atan2(CABIN.x - px, -(CABIN.z - pz));          // toward the cabin
    const ay = base + yaw, el = Math.atan2(CAB_Y + 3 - camPos.y, Math.hypot(CABIN.x - px, CABIN.z - pz)) * 0.6 + 0.04 + pitch + Math.sin(t * 0.23) * 0.004;
    camera.position.copy(camPos).add(v3.set(Math.sin(t * 0.17) * 0.03, Math.sin(t * 0.29) * 0.02, 0));
    look.set(camera.position.x + Math.sin(ay) * Math.cos(el), camera.position.y + Math.sin(el), camera.position.z - Math.cos(ay) * Math.cos(el));
    camera.lookAt(look);
    if (dbgCam) { camera.position.copy(dbgCam[0]); camera.lookAt(dbgCam[1]); }
    sky.position.copy(camera.position);
    needU.uBox0.value.set(camera.position.x + Math.sin(ay) * 14 - 18, camera.position.y - 3, camera.position.z - Math.cos(ay) * 14 - 18);

    animals(dt, t);

    // smoke
    if (dt > 0 || puffs.length === 0) {
      const steps = puffs.length === 0 ? 300 : 1, h = puffs.length === 0 ? 0.1 : dt;     // pre-warm the column on the first frame
      for (let s = 0; s < steps; s++) {
        emitAcc += h * (2.2 + stoke * 6);
        while (emitAcc > 1 && puffs.length < MAXP) {
          emitAcc -= 1;
          puffs.push({ p: CHIMNEY.clone().add(v3.set((D() - 0.5) * 0.08, 0, (D() - 0.5) * 0.08)), v: new THREE.Vector3((D() - 0.5) * 0.15, 0.9 + D() * 0.4, (D() - 0.5) * 0.15), age: 0, life: 13 + D() * 7, seed: D(), dens: 0.42 + stoke * 0.35, rot: D() * TAU, spin: (D() - 0.5) * 0.3 });
        }
        const wx = SU.uWind.value.x, wz = SU.uWind.value.y, gust = 0.7 + 0.5 * Math.sin((t + s * h) * 0.31) + 0.25 * Math.sin((t + s * h) * 0.83);
        for (let i = puffs.length - 1; i >= 0; i--) {
          const q = puffs[i];
          q.age += h;
          if (q.age > q.life) { puffs.splice(i, 1); continue; }
          const rise = Math.max(0.15, 1 - q.age * 0.12);
          const tx = (vn2(q.p.y * 0.4 + q.seed * 9, t * 0.2) - 0.5) * 0.6, tz = (vn2(q.p.y * 0.4 + 31, t * 0.2 + q.seed * 9) - 0.5) * 0.6;
          q.v.x += ((wx * 0.9 * gust * smooth(0, 4, q.age) + tx) - q.v.x) * h * 0.8;
          q.v.z += ((wz * 0.9 * gust * smooth(0, 4, q.age) + tz) - q.v.z) * h * 0.8;
          q.v.y += (0.9 * rise - q.v.y) * h * 0.6;
          q.p.addScaledVector(q.v, h);
          q.rot += q.spin * h;
        }
      }
      puffs.forEach((q, i) => {
        const a = q.age / q.life;
        sP.set([q.p.x, q.p.y, q.p.z, 0.35 + q.age * 0.42 + a * a * 2], i * 4);
        sQ.set([q.dens * smooth(0, 0.06, a) * (1 - smooth(0.4, 1, a)), a, q.seed, q.rot], i * 4);
      });
      smokeGeo.instanceCount = puffs.length;
      smokeGeo.attributes.aP.needsUpdate = true; smokeGeo.attributes.aQ.needsUpdate = true;
      // sparks
      if (stoke > 0.2 && D() < dt * 14 * stoke && sparks.length < MAXS) sparks.push({ p: CHIMNEY.clone(), v: new THREE.Vector3((D() - 0.5) * 0.8, 2 + D() * 2, (D() - 0.5) * 0.8), age: 0, life: 0.8 + D() * 1.4 });
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]; s.age += dt;
        if (s.age > s.life) { sparks.splice(i, 1); continue; }
        s.v.y -= dt * 0.8; s.v.x += SU.uWind.value.x * dt * 0.8; s.v.z += SU.uWind.value.y * dt * 0.8; s.p.addScaledVector(s.v, dt);
      }
      spark.fill(0);
      sparks.forEach((s, i) => spark.set([s.p.x, s.p.y, s.p.z, (1 - s.age / s.life) * (0.6 + 0.4 * Math.sin(s.age * 40))], i * 4));
      sparkGeo.attributes.aS.needsUpdate = true;
      sparkGeo.setDrawRange(0, sparks.length);
    }

    post.U.uTime.value = t;
    post.render(scene, camera);
  }

  function loop(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    slow = dt > 0.032 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 40 && pr > 0.6) { pr *= 0.8; renderer.setPixelRatio(pr); resize(); slow = 0; }
    frame(dt);
    if (!reduced) raf = requestAnimationFrame(loop);
  }
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } });
  io.observe(canvasEl);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } });
  if (reduced) frame(0);
  else raf = requestAnimationFrame((n) => { last = n; loop(n); });

  const stokeFire = () => { stokeT = stokeT >= 0 ? Math.min(stokeT, 1.5) : 0; };
  const toggleNight = () => { nightT = nightT > 0.5 ? 0 : 1; return nightT === 1; };
  const setNight = (v) => { night = nightT = v; };
  const zoomBy = (d) => { distT = clamp(distT + d, DMIN, DMAX); };
  // for screenshots: where you stand round the cabin (degrees from the start), how far, and where you look
  const setView = (orbDeg = 0, d = DIST0, yawDeg = 0, pitchDeg = 0) => {
    orb = orbT = THREE.MathUtils.degToRad(orbDeg); dist = distT = d; yaw = yawT = THREE.MathUtils.degToRad(yawDeg); pitch = pitchT = THREE.MathUtils.degToRad(pitchDeg);
    const a = ORBIT0 + orb; camXZ[0] = CABIN.x + Math.sin(a) * d; camXZ[1] = CABIN.z + Math.cos(a) * d;
  };
  const lookAt = (p, q) => { dbgCam = p ? [new THREE.Vector3(...p), new THREE.Vector3(...q)] : null; };
  return {
    renderer, frame, atlas: atlasTex.image, stoke: stokeFire, toggleNight, setNight, zoomBy, setView, look: lookAt, scene, camera, SU,
    get night() { return nightT > 0.5; }, herds, routeAt, get near() { return (DMAX - dist) / (DMAX - DMIN); },
    stats: { trees: trees.length, young: youngs.length, whorls: wItems.reduce((a, l) => a + l.length, 0), twigs: twigItems.length, meshes: sectorMeshes.length, info: renderer.info.render },
  };
}
