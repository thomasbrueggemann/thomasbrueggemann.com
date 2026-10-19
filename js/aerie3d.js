// Scene: Aerie. A village of crooked treehouses high in a stand of four giant trees, at moonrise. Houses wrap the
// trunks, sit stacked on one another at odd angles, hang from the limbs or perch on brackets: a hall with the trunk
// through its roof, a fish-scale tower with a witch's hat, a half-timbered study with a round window, a lookout under a
// copper onion dome, a round house with a thatched collar, a barrel, an egg-shaped pod on ropes, a stack of three rooms
// each turned on the last, a glass greenhouse, an A-frame and a thin tower. Rope bridges, a spiral stair, ladders and
// a zip line join them; lanterns, strings of lights, glowing fungus on the bark, fireflies and drifting spores light
// the dusk, and the mist lies far below. You fly round the village on a circle. Everything is procedural and seeded,
// so the village is the same on every load. Only dependency: three.js.

import * as THREE from "three";
import { makePost } from "./post.js";

const TAU = Math.PI * 2;
const h1 = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
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
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- layout (metres; y up, the forest floor at 0)
// the great tree: base position, base radius, height, and how far the top leans off the base
// Four kinds of tree, so they look nothing alike: `shape` sets the trunk (oak: a broad old giant; bottle: a baobab,
// swollen in the middle under a flat crown; twist: leaning and coiled, weeping like a willow; slim: a tall silver
// birch); `bark` is the bark's pattern (0 furrowed, 1 birch, 2 spiral furrows, 3 smooth and wrinkled) and tint.
const TREES = [
  { x: 0, z: 0, r: 5.4, h: 112, lx: 1.6, lz: -1.1, seed: 11, shape: "oak", bark: [0, [1, 1, 1]] },          // the oldest and biggest, carrying the most houses
  { x: 50, z: -20, r: 4.0, h: 80, lx: 0.6, lz: 0.5, seed: 23, shape: "bottle", bark: [3, [1.25, 1.05, 1.0]] },
  { x: -36, z: -42, r: 4.3, h: 92, lx: -4.5, lz: -3.0, seed: 37, shape: "twist", bark: [2, [0.85, 0.72, 0.62]] },
  { x: -46, z: 24, r: 3.6, h: 104, lx: -1.0, lz: 1.3, seed: 41, shape: "slim", bark: [1, [1, 1, 1]] },
];
// each tree's city: its platform levels, how many limbs, perched houses, bridges and leafy branches. They differ on
// purpose: the old giant is a dense city, the baobab a packed village, the coiled tree thinner, the birch a hamlet
// and each city its own style: which walls, roofs and kinds of house (indices into WALLS and ROOFS; null = all)
const CITY = [
  { seed: 9, tiers: [14, 20.5, 27, 33.5, 40, 46.5, 53], nLimbs: 5, perched: 40, bridges: 24, branches: 100, lifts: 2, style: null },
  { seed: 19, tiers: [15, 20.5, 26, 31.5, 37, 42.5], nLimbs: 4, perched: 34, bridges: 18, branches: 40, lifts: 2,       // sun-baked: plaster and thatch, round huts
    style: { walls: [4, 12, 3, 9, 10, 2], roofs: [4, 4, 3, 7], lo: ["thatch", "thatch", "dome", "barrel", "shed", "gable", "thatch"], hi: ["thatch", "onion", "dome", "thatch", "tower", "barrel"] } },
  { seed: 29, tiers: [14, 22, 30, 38, 46], nLimbs: 4, perched: 12, bridges: 10, branches: 60,   // misty blues and slate: towers and witches' hats
    style: { walls: [0, 13, 11, 5, 8, 13], roofs: [1, 5, 6, 2], lo: ["witch", "tower", "gable", "witch", "shed", "onion"], hi: ["witch", "witch", "tower", "onion", "tower", "gable"] } },
  { seed: 39, tiers: [18, 29, 40], nLimbs: 3, perched: 5, bridges: 6, branches: 18,         // Nordic pastels: steep gables, red roofs, A-frames
    style: { walls: [1, 8, 10, 6, 5, 1], roofs: [3, 0, 3, 7], lo: ["gable", "aframe", "gable", "shed", "aframe"], hi: ["gable", "aframe", "tower", "gable", "shed"] } },
];
// each tree's leaves, used for its crown and for all the greenery in its city: leaf(R) and drape(R) give a clump's
// atlas cell (0 leaves, 1 blossom, 2 wisteria, 3 trailing moss), leaf tint and flower colour; ivy is how much ivy the
// bark carries (the birch keeps its white bark bare)
const leafG = (R) => ({ cell: 0, col: [0.09 + R() * 0.06, 0.16 + R() * 0.08, 0.1 + R() * 0.05], fl: [0, 0, 0] });
const FOLIAGE = [
  { ivy: 1, leaf: (R) => (R() < 0.22 ? { cell: 1, col: [0.1, 0.18, 0.1], fl: [0.8, 0.66, 0.95] } : leafG(R)), drape: (R) => ({ cell: R() < 0.6 ? 2 : 3, col: [0.12, 0.2, 0.1], fl: [0.68 + R() * 0.1, 0.55, 0.95] }) },
  { ivy: 0.6, leaf: (R) => (R() < 0.4 ? { cell: 1, col: [0.08, 0.14, 0.07], fl: [0.98, 0.58, 0.7] } : { cell: 0, col: [0.07 + R() * 0.04, 0.13 + R() * 0.05, 0.06], fl: [0, 0, 0] }), drape: (R) => ({ cell: 3, col: [0.1, 0.15, 0.07], fl: [0, 0, 0] }) },
  { ivy: 1, leaf: (R) => ({ cell: 0, col: [0.08 + R() * 0.04, 0.16 + R() * 0.06, 0.16 + R() * 0.06], fl: [0, 0, 0] }), drape: (R) => (R() < 0.6 ? { cell: 2, col: [0.12, 0.2, 0.14], fl: [0.6 + R() * 0.12, 0.55, 0.98] } : { cell: 3, col: [0.13, 0.22, 0.17], fl: [0, 0, 0] }) },
  { ivy: 0.25, around: 0.35, leaf: (R) => (R() < 0.8 ? { cell: 0, col: [0.55 + R() * 0.12, 0.38 + R() * 0.08, 0.07], fl: [0, 0, 0] } : leafG(R)), drape: (R) => ({ cell: 3, col: [0.34, 0.26, 0.07], fl: [0, 0, 0] }) },
];
// where the trees reach for each other: a limb from each with a platform at its tip, and a bridge across the gap;
// a cable car high up between the two biggest; one gap too wide to bridge gets a platform slung on ropes between
const LINKS = [
  { a: 0, b: 1, y: 30 }, { a: 0, b: 1, y: 49, cable: true }, { a: 0, b: 2, y: 23 }, { a: 0, b: 3, y: 37 }, { a: 2, b: 3, y: 28, mid: true }, { a: 0, b: 3, y: 19 },
  { a: 0, b: 2, y: 45, cable: true }, { a: 2, b: 3, y: 42, cable: true }, { a: 1, b: 2, y: 36, cable: true },
  { a: 0, ground: [62, 48], y: 26, cable: true },       // a line down to a station on stilts out in the mist
];
const tAxis = (tr, y) => {
  const f = clamp(y, 0, tr.h) / tr.h, k = f * f;
  if (tr.shape === "twist") return [tr.x + tr.lx * k + Math.sin(y * 0.055 + tr.seed) * 3.2 * f, tr.z + tr.lz * k + Math.cos(y * 0.047 + tr.seed) * 2.6 * f];   // coiling as it climbs
  return [tr.x + tr.lx * k, tr.z + tr.lz * k];
};
const tRad = (tr, y) => {
  const f = clamp(y / tr.h, 0, 1), base = tr.r * (1 + 0.85 * Math.exp(-Math.max(y, 0) / 2.6));
  if (tr.shape === "bottle") return base * (1 - 0.72 * f) * (1 + 0.62 * Math.exp(-(((y - 26) / 15) ** 2)));    // a baobab's swollen belly
  if (tr.shape === "slim") return base * (1 - 0.7 * f);
  return base * (1 - 0.62 * f);
};
// set the bark material for a tree's trunk, limbs and branches
const bark = (b, tr, seed, circ) => { const [k, t] = tr.bark ?? [0, [1, 1, 1]]; b.set(MAT.BARK, t, seed, circ, k); };
// you fly round the middle of the group, or round one tree (the centres cycle: the group, then each tree)
const GC = [TREES.reduce((a, t) => a + t.x, 0) / TREES.length, TREES.reduce((a, t) => a + t.z, 0) / TREES.length];
const CENTRES = [{ x: GC[0], z: GC[1], dist: 80, h: 30, look: 34 }, ...TREES.map((t, i) => ({ x: t.x + t.lx * 0.1, z: t.z + t.lz * 0.1, dist: 40, h: 26, look: CITY[i].tiers[CITY[i].tiers.length - 1] * 0.62 }))];
const CTR = GC;
const DMIN = 14, DMAX = 150, HMIN = 6, HMAX = 72;
const VIEW0 = { ang: 0.26, dist: 80, h: 30 };      // where you start: south of the group, looking at all four trees

const MOON_DIR = V(0.227, 0.213, -0.974).normalize();              // a big moon low behind the village, a little right of where you start
const GLOW_DIR = V(-0.8, 0, -0.6).normalize();                   // the last of the sunset: a rose band low on the left
const NL = 24;                                                   // warm lights (lanterns and lit rooms) every surface sees

// ---------------------------------------------------------------- GLSL shared by every material
const GLSL_COMMON = /* glsl */`
#define NL ${NL}
uniform float uTime, uNight, uFogA, uFogB, uFogH, uScat;
uniform vec3 uMoonDir, uMoonCol, uSkyA, uSkyG, uHor, uGlowDir, uGlowCol, uCity;
uniform vec3 uLp[NL], uLc[NL];
uniform float uLs[NL];
uniform vec2 uCtr, uWind;
uniform vec4 uTrees[4];   // per tree: x, z, size (radius / 5.4), the top platform's height
precision highp sampler2DShadow;
uniform sampler2DShadow uShadow; uniform mat4 uShadowM; uniform float uShPx;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
  return mix(mix(mix(hash13(i), hash13(i+vec3(1,0,0)), f.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y), f.z); }
const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);
float fbm(vec2 p){ float s = 0., a = .5; for(int i=0;i<4;i++){ s += a*vnoise(p); p = ROT * p * 2.03 + vec2(1.7, 9.2); a *= .5; } return s / .9375; }
float fbm3(vec3 p){ return (n3(p) * .5 + n3(p * 2.03 + 7.1) * .25 + n3(p * 4.1 + 3.3) * .125) / .875; }
`;

const GLSL_LIGHT = /* glsl */`
// how much open sky a point sees: less under the crowns over the village, more out in the open and up high
float skyOpen(vec3 p){
  float o = 1.;
  for (int i = 0; i < 4; i++) { vec4 t = uTrees[i]; o = min(o, 1. - 0.5 * smoothstep(42. * t.z, 20. * t.z, length(p.xz - t.xy)) * smoothstep(t.w + 27., t.w + 5., p.y)); }
  return o;
}
// the colour the mist and the far horizon take in a direction: lilac haze, the rose afterglow, the moon's halo
vec3 fogSky(vec3 rd){
  vec3 hz = normalize(vec3(rd.x, 0., rd.z) + 1e-5);
  float g = pow(max(dot(hz, uGlowDir), 0.), 3.) * exp(-abs(rd.y) * 6.);
  float m = max(dot(rd, uMoonDir), 0.), mh = max(dot(hz, normalize(vec3(uMoonDir.x, 0., uMoonDir.z))), 0.);
  return uHor * (1. + 0.25 * smoothstep(0.1, -0.2, rd.y)) + uGlowCol * g + uMoonCol * (pow(m, 8.) * 0.18 + pow(m, 60.) * 0.3 + pow(mh, 12.) * smoothstep(0.02, -0.3, rd.y) * 0.12);
}
// the moon's shadow map: rendered once (the village does not move). Each tap is a hardware-filtered depth
// comparison (bilinear PCF), and 4x4 of them spread over about 5 texels (~35 cm) soften the texel steps and the
// dapple of the leaf cards into a smooth penumbra
float shadowAt(vec3 P, vec3 N){
  vec4 s = uShadowM * vec4(P + N * 0.12 + uMoonDir * 0.08, 1.);
  vec3 c = s.xyz / s.w * 0.5 + 0.5;
  if (c.x < 0. || c.x > 1. || c.y < 0. || c.y > 1. || c.z > 1.) return 1.;
  float sum = 0.;
  for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++)
    sum += texture(uShadow, vec3(c.xy + (vec2(i, j) - 1.5) * uShPx * 1.4, c.z - 0.0008));
  return sum / 16.;
}
// the warm lights: each fades out by about 16 m, so only the near ones count
vec3 warm(vec3 P, vec3 N, float wrap){
  vec3 c = vec3(0.);
  for (int i = 0; i < NL; i++) {
    vec3 L = uLp[i] - P; float d2 = dot(L, L);
    float r = max(0., 1. - d2 / 260.);
    if (r <= 0.) continue;
    L *= inversesqrt(d2);
    c += uLc[i] * clamp((dot(N, L) + wrap) / (1. + wrap), 0., 1.) * r * r / (d2 + 0.5);
  }
  return c;
}
vec3 warmSpec(vec3 P, vec3 N, vec3 V, float shin){
  vec3 c = vec3(0.);
  for (int i = 0; i < NL; i++) {
    vec3 L = uLp[i] - P; float d2 = dot(L, L);
    float r = max(0., 1. - d2 / 260.);
    if (r <= 0.) continue;
    L *= inversesqrt(d2);
    c += uLc[i] * pow(max(dot(N, normalize(L + V)), 0.), shin) * (shin + 2.) / 8. * max(dot(N, L), 0.) * r * r / (d2 + 0.5);
  }
  return c;
}
// the light of all the windows together, a faint warmth inside the city
vec3 cityGlow(vec3 P){
  float g = 0.;
  for (int i = 0; i < 4; i++) { vec4 t = uTrees[i]; g += smoothstep(26. * t.z, 8. * t.z, length(P.xz - t.xy)) * smoothstep(8., 15., P.y) * smoothstep(t.w + 11., t.w + 1., P.y); }
  return uCity * g;
}
// moonlight (shadowed), sky light dimmed under the crowns, the warm lights, and a sheen for glossy things
vec3 shade(vec3 alb, vec3 N, vec3 P, float ao, float wrap, float spec){
  float sh = shadowAt(P, N);
  float nl = clamp((dot(N, uMoonDir) + wrap) / (1. + wrap), 0., 1.);
  vec3 sky = mix(uSkyG, uSkyA, N.y * 0.5 + 0.5) * skyOpen(P);
  vec3 c = alb * (uMoonCol * nl * sh + sky * ao + (warm(P, N, wrap) + cityGlow(P)) * (0.5 + 0.5 * ao));
  if (spec > 0.) {
    vec3 V = normalize(cameraPosition - P);
    float fr = 0.04 + 0.96 * pow(1. - max(dot(N, V), 0.), 5.);
    c += uMoonCol * pow(max(dot(N, normalize(uMoonDir + V)), 0.), spec) * (spec + 8.) / 30. * sh * max(dot(N, uMoonDir), 0.) * (0.2 + fr);
    c += warmSpec(P, N, V, spec) * 0.25 * (0.3 + fr);
    c += fogSky(reflect(-V, N)) * fr * 0.35 * ao;
  }
  return c;
}
// the warm lights glowing in the haze along the view ray (closed form for a point light in uniform fog)
vec3 scatter(vec3 ro, vec3 rd, float t){
  vec3 s = vec3(0.);
  for (int i = 0; i < NL; i++) {
    vec3 q = uLp[i] - ro; float s0 = dot(q, rd); float h = sqrt(max(dot(q, q) - s0 * s0, 0.)) + uLs[i];
    s += uLc[i] * (atan((t - s0) / h) + atan(s0 / h)) / h;
  }
  return s;
}
// mist: thick far below (it fills the forest floor), thin up among the houses; integrated along the ray
float fogOD(vec3 ro, vec3 rd, float d){
  float k = rd.y * d / uFogH;
  return uFogB * d + uFogA * exp(-ro.y / uFogH) * d * (abs(k) > 1e-3 ? (1. - exp(-k)) / k : 1. - .5 * k);
}
vec3 fogged(vec3 col, vec3 P){
  vec3 rd = P - cameraPosition; float d = length(rd); rd /= d;
  return mix(fogSky(rd), col, exp(-fogOD(cameraPosition, rd, d))) + scatter(cameraPosition, rd, d) * uScat;
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

// ---------------------------------------------------------------- the surfaces of the village, one shader for all
// Every vertex carries aK = (material, seed, p1, p2) and a tint aC. The fragment shader paints each material
// procedurally from its uv (metres along the surface): clapboard, fish-scale and plain shingles, thatch, half-timbered
// plaster, board and batten, deck boards, bark, rope, copper, paper lanterns, glowing fungus, flags, greenhouse glass,
// doors, and windows with a lit room behind them (interior mapping).
const MAT = { BARK: 0, PLANK: 1, SHINGLE: 2, WIN: 3, METAL: 4, ROPE: 5, PLASTER: 6, LANTERN: 7, GLASS: 8, FABRIC: 9,
  WINR: 10, WINA: 11, DECK: 12, WOOD: 13, DOOR: 14, FUNGUS: 15, THATCH: 16, BOARDV: 17, SCALE: 18 };

const BUILD_VERT = /* glsl */`
attribute vec3 aC; attribute vec4 aK;
#ifdef SWING
attribute vec4 aPv;
#endif
varying vec3 vW, vN, vC; varying vec2 vUv; varying vec4 vK;
void main(){
  vec3 p = position, n = normal;
  vC = aC; vK = aK; vUv = uv;
  #ifdef SWING
  // lanterns and the pod swing about the point they hang from
  float s = aK.y * 17.3;
  float ax = aPv.w * sin(uTime * (0.8 + fract(s) * 0.5) + s), az = aPv.w * 0.8 * sin(uTime * (0.6 + fract(s * 3.1) * 0.4) + s * 2.3);
  mat3 R = mat3(cos(az), sin(az), 0., -sin(az), cos(az), 0., 0., 0., 1.) * mat3(1., 0., 0., 0., cos(ax), sin(ax), 0., -sin(ax), cos(ax));
  p = aPv.xyz + R * (p - aPv.xyz); n = R * n;
  #endif
  if (abs(aK.x - 9.) < 0.5) p += n * sin(uTime * 4.5 + p.x * 1.7 + p.z * 1.3 + aK.y * 30.) * 0.08 * uv.y;   // flags flutter from their string
  vec4 w = modelMatrix * vec4(p, 1.);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const BUILD_FRAG = /* glsl */`
varying vec3 vW, vN, vC; varying vec2 vUv; varying vec4 vK;
vec3 palette(float s){
  s = fract(s) * 6.;
  return s < 1. ? vec3(0.95, 0.78, 0.55) : s < 2. ? vec3(0.85, 0.55, 0.45) : s < 3. ? vec3(0.62, 0.7, 0.52) : s < 4. ? vec3(0.9, 0.7, 0.4) : s < 5. ? vec3(0.62, 0.55, 0.75) : vec3(0.55, 0.68, 0.72);
}
// a lit room behind a window (w x h metres, uv from its lower left corner): a box room traced from the glass, lit by
// a lamp, with wallpaper, a floor, shelves of books or a picture, curtains, a plant on the sill; glass and glazing
// bars on top. type 0 = rectangle, 1 = round, 2 = arched.
vec3 windowCol(vec3 P, vec3 N, vec2 uv, float w, float h, float sd, float type){
  vec3 dpx = dFdx(P), dpy = dFdy(P); vec2 dtx = dFdx(uv), dty = dFdy(uv);
  float det = dtx.x * dty.y - dtx.y * dty.x;
  vec3 T = normalize((dpx * dty.y - dpy * dtx.y) * sign(det)); T = normalize(T - N * dot(N, T));
  vec3 B = cross(N, T);
  vec3 rd = normalize(P - cameraPosition);
  vec3 r = vec3(dot(rd, T), dot(rd, B), max(dot(rd, -N), 1e-3));
  float lit = step(0.2, fract(sd * 7.13)), xl = -0.8 - fract(sd * 3.7) * 0.8, xr = w + 0.8 + fract(sd * 5.3) * 0.8;
  float fl = -0.9, ce = h + 0.45 + fract(sd * 2.9) * 0.4, dp = 2. + fract(sd * 11.7) * 1.8;
  vec3 ro = vec3(uv, 0.);
  float tx = ((r.x > 0. ? xr : xl) - ro.x) / r.x, ty = ((r.y > 0. ? ce : fl) - ro.y) / r.y, tz = (dp - ro.z) / r.z;
  float t = min(tx, min(ty, tz));
  vec3 q = ro + r * t, n;
  vec3 wall = palette(sd * 3.3) * 0.75, a;
  if (t == tz) {                                   // back wall: wallpaper stripes, shelves of books or a picture
    n = vec3(0., 0., -1.);
    a = wall * (0.85 + 0.15 * step(0.5, fract(q.x * 3.)));
    if (fract(sd * 9.1) > 0.45) {
      float sh = fract((q.y + 0.2) / 0.42), row = floor((q.y + 0.2) / 0.42);
      float bk = floor(q.x * 16. + row * 7.), bw = hash12(vec2(bk, row + sd * 50.));
      vec3 book = palette(bw * 5.1) * (0.35 + 0.4 * bw);
      a = q.y > 0.1 && q.y < h + 0.2 && q.x > xl + 0.5 && q.x < xr - 0.5 ? (sh < 0.12 ? vec3(0.25, 0.16, 0.1) : sh < 0.12 + 0.75 * (0.6 + 0.4 * bw) ? book : vec3(0.05)) : a;
    } else {
      vec2 c = abs(q.xy - vec2(w * 0.5 + 0.3, h * 0.6)) - vec2(0.35, 0.25);
      a = max(c.x, c.y) < 0. ? palette(sd * 8.) * 0.5 * (0.6 + 0.4 * vnoise(q.xy * 9.)) : max(c.x, c.y) < 0.05 ? vec3(0.45, 0.3, 0.12) : a;
    }
  } else if (t == ty) {
    n = vec3(0., r.y > 0. ? -1. : 1., 0.);
    a = r.y > 0. ? vec3(0.42, 0.34, 0.26) * (0.75 + 0.25 * step(0.85, fract(q.x * 1.6))) : vec3(0.35, 0.22, 0.13) * (0.8 + 0.25 * hash12(vec2(floor(q.x * 6.), sd)));
  } else {
    n = vec3(r.x > 0. ? -1. : 1., 0., 0.);
    a = wall * (0.9 + 0.1 * vnoise(q.zy * 8.));
  }
  vec3 L = vec3(w * 0.5 + (fract(sd * 4.1) - 0.5) * 0.8, ce - 0.5, dp * 0.5);
  vec3 ld = L - q; float d2 = dot(ld, ld);
  float fl2 = 0.9 + 0.06 * sin(uTime * 7. + sd * 40.) + 0.04 * sin(uTime * 13. + sd * 9.);
  vec3 lampC = vec3(1.0, 0.62, 0.32) * fl2 * (fract(sd * 17.3) > 0.85 ? 0.6 : 1.);
  vec3 c = a * lampC * (2.2 / (1. + d2 * 0.55)) * (0.35 + 0.65 * max(dot(n, ld * inversesqrt(d2)), 0.)) * lit;
  vec3 lq = L - ro; float s0 = dot(lq, r), hh = length(lq - r * s0);
  c += lampC * 0.03 / (hh * hh + 0.004) * step(0., s0) * step(s0, t) * lit;
  c += a * uSkyA * 0.6;
  // curtains half drawn at the sides, glowing with the light behind them
  float cw = w * (0.18 + 0.12 * fract(sd * 6.7)), cx = min(uv.x, w - uv.x);
  float fold = 0.75 + 0.25 * sin(uv.x * 38. + sin(uv.y * 3.) * 2.);
  float cm = smoothstep(cw, cw - 0.03, cx + (h - uv.y) * 0.08 * step(0.5, fract(sd * 2.1)));
  c = mix(c, palette(sd * 5.7 + 0.3) * fold * (lit * 0.9 * lampC + uSkyA * 0.3), cm * step(0.3, fract(sd * 1.9)));
  // a plant on the sill
  if (fract(sd * 12.1) > 0.55) {
    vec2 pc = (uv - vec2(w * (0.3 + 0.4 * fract(sd * 4.4)), 0.)) * vec2(1., 0.8);
    float pm = step(length(pc - vec2(0., 0.2)) - 0.18 * (0.6 + 0.4 * vnoise(uv * 25.)), 0.) + step(abs(pc.x), 0.08) * step(pc.y, 0.1);
    c = mix(c, vec3(0.02, 0.025, 0.015), clamp(pm, 0., 1.) * 0.92);
  }
  // glass: the sky mirrored more at grazing angles, a little moon
  float fr = 0.06 + 0.94 * pow(1. - max(dot(N, -rd), 0.), 5.);
  c = mix(c, fogSky(reflect(rd, N)) * 0.8, fr * 0.8) + (lit < 0.5 ? fogSky(reflect(rd, N)) * 0.25 : vec3(0.));
  // glazing bars
  float bar = 0.;
  if (type < 0.5) { bar = step(abs(uv.y - h * 0.58), 0.025); bar = max(bar, w > 1.05 ? step(abs(abs(uv.x - w * 0.5) - w * 0.18), 0.02) : step(abs(uv.x - w * 0.5), 0.022)); }
  else if (type < 1.5) { vec2 cc = uv - vec2(w * 0.5, h * 0.5); bar = max(step(abs(cc.x), 0.022), step(abs(cc.y), 0.022)); bar = max(bar, step(abs(length(cc) - w * 0.25), 0.018)); }
  else { bar = max(step(abs(uv.x - w * 0.5), 0.022), step(abs(uv.y - (h - w * 0.5)), 0.022)); vec2 cc = uv - vec2(w * 0.5, h - w * 0.5); bar = max(bar, step(abs(length(cc) - w * 0.25), 0.018) * step(0., cc.y)); }
  vec3 barCol = shade(vec3(0.62, 0.56, 0.46), N, P, 0.8, 0.1, 0.) + lampC * 0.04 * lit;
  return mix(c, barCol, bar);
}
// bark, in metres: bc() maps (angle a, metres z along, radius R) onto a noise cylinder with features lc round and lz along;
// bf() fades an octave of wavelength l out once a pixel (pw metres) nears it; crease() is 0 on the contour f = 0.5
vec3 bc(float a, float z, float R, float lc, float lz){ return vec3(cos(a) * R / lc, sin(a) * R / lc, z / lz); }
float bf(float pw, float l){ return 1. - smoothstep(0.12, 0.5, pw / l); }
float crease(float f, float w){ return smoothstep(0., w, abs(f - 0.5) * 2.); }
// furrowed bark: long fissures (contours of a noise stretched lz/lc along the trunk) about lc apart, in places deep and
// in places shallow, rounded ridges between them, cross cracks, then fibres; returns the relief (0 low, 1 high),
// cav is how deep in a crack it sits
float furrow(float a, float z, float R, float pw, float sd, float lc, float lz, out float cav){
  vec3 o = vec3(sd * 9.), w3 = bc(a, z, R, lc * 3., lz) + o;
  vec2 w = vec2(n3(w3 + 5.), n3(w3 + 17.)) - 0.5;      // the ridges wander, braid and merge
  a += w.x * lc * 1.6 / R; z += w.y * lz * 0.3;
  float dp = n3(bc(a, z, R, lc * 4., lz * 1.5) + o + 29.);
  float dA = abs(n3(bc(a + z * 0.012, z, R, lc, lz) + o) - 0.5) * 2., dB = abs(n3(bc(a - z * 0.04, z, R, lc * 0.33, lz * 0.5) + o + 3.) - 0.5) * 2.;
  float dC = abs(n3(bc(a + z * 0.06, z, R, lc * 0.1, lz * 0.25) + o + 9.) - 0.5) * 2., dE = abs(n3(bc(a - z * 0.008, z, R, lc * 3.2, lz * 2.) + o + 37.) - 0.5) * 2.;
  float kA = bf(pw, lc), kB = bf(pw, lc * 0.33), kC = bf(pw, lc * 0.1), kE = bf(pw, lc * 3.2);
  float hA = mix(0.8, smoothstep(0., 0.6, dA), kA), hB = mix(0.75, smoothstep(0., 0.5, dB), kB), hC = mix(0.7, smoothstep(0., 0.6, dC), kC), hE = mix(0.85, smoothstep(0., 0.5, dE), kE);
  cav = max(mix(0.1, (1. - smoothstep(0., 0.24, dA)) * (0.35 + 0.65 * smoothstep(0.3, 0.7, dp)), kA), mix(0.05, 0.45 * (1. - smoothstep(0., 0.2, dB)), kB));
  cav = max(cav, mix(0.08, 0.9 * (1. - smoothstep(0., 0.16, dE)), kE));
  return hA * (0.55 + 0.45 * hB) * (0.9 + 0.1 * hC) * (0.7 + 0.3 * hE);
}
float lines(float x, float w){ float f = abs(fract(x + 0.5) - 0.5); return 1. - smoothstep(w * 0.5, w * 0.5 + fwidth(x) * 1.2, f); }
void main(){
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 P = vW; float m = vK.x, sd = vK.y, pw = length(fwidth(vW)); vec2 uv = vUv; vec3 tint = vC;
  vec3 alb = tint, emis = vec3(0.); float ao = 1., wrap = 0.1, spec = 0., h = 0., bk = 0.;
  if (m < 0.5) {                                   // bark (p2 = kind): furrowed, birch, spiral furrows, smooth and wrinkled
    // everything in metres: a = angle round the trunk, z = metres along it, R = its radius (from the girth in p1)
    float kind = vK.w, R = max(vK.z / 6.2832, 0.05), z = uv.y, a = uv.x * 6.2832 + (abs(kind - 2.) < 0.5 ? z * 0.22 : 0.), cav = 0.;
    vec3 o = vec3(sd * 9.);
    float mArg = fbm3(P * 0.45 + 3.) * 0.7 + N.y * 0.45 + 0.08 + dot(normalize(N.xz + 1e-4), vec2(-0.6, 0.8)) * (1. - abs(N.y)) * 0.3, moss = smoothstep(0.52, 0.72, mArg);
    if (kind > 0.5 && kind < 1.5) {                // birch: chalky white paper, lenticels, black eye-shaped scars, curls; dark and rough at the foot
      float band = n3(bc(a, z, R, 1.6, 0.45) + o), pap = mix(0.5, n3(bc(a, z, R, 0.3, 0.03) + o + 4.), bf(pw, 0.03));
      alb = vec3(0.8, 0.78, 0.72) * (0.78 + 0.3 * band) * (0.9 + 0.2 * pap);
      float ln = n3(bc(a, z, R, 0.1, 0.024) + o + 8.) + 0.3 * (band - 0.5), lg = n3(bc(a, z, R, 0.5, 0.03) + o + 14.);   // lenticels, and longer grey dashes
      float dash = mix(0.08, smoothstep(0.7, 0.8, ln), bf(pw, 0.024)), dsh = mix(0.05, smoothstep(0.74, 0.8, lg), bf(pw, 0.03));
      vec2 cell = vec2(a * R / 0.4, z / 0.22), ci = floor(cell), cf = fract(cell) - 0.5 - (vec2(hash12(ci + 3.1), hash12(ci + 7.7)) - 0.5) * 0.3;
      float scar = step(0.82, hash12(ci + sd)) * smoothstep(1., 0.45, abs(cf.x) / 0.4 + abs(cf.y) / 0.2);
      float pc = n3(bc(a, z, R, 2.2, 0.1) + o + 11.), flap = smoothstep(0.6, 0.64, pc), edge = 1. - smoothstep(0., 0.04, abs(pc - 0.62));   // paper peeling in strips round the trunk
      h = 0.5 + flap * 0.35 * smoothstep(0.6, 0.8, pc) + edge * 0.15 - scar * 0.3 - dash * 0.1;
      alb = mix(alb, vec3(0.66, 0.58, 0.48), flap * 0.5);
      alb = mix(alb, vec3(0.22, 0.17, 0.13), edge * 0.6);
      alb = mix(alb, vec3(0.1, 0.09, 0.08), max(max(dash * 0.9, dsh * 0.6), scar * 0.95));
      float rough = 1. - smoothstep(0.8, 4.5, P.y + 2.5 * (n3(P * 0.9) - 0.5));
      if (rough > 0.01) {
        float hr = furrow(a, z, R, pw, sd, 0.3, 8., cav);
        alb = mix(alb, mix(vec3(0.035, 0.03, 0.026), vec3(0.5, 0.47, 0.42), smoothstep(0.3, 0.85, hr)), rough);
        h = mix(h, hr, rough);
      }
      moss *= 0.3;
    } else if (kind > 2.5) {                       // baobab: grey skin in swags, fine wrinkles round the girth, a few deep folds
      float zz = z + (n3(bc(a, z, R, 1.8, 2.6) + o) - 0.5) * 0.9, fl = n3(bc(a, z, R, 1.7, 7.) + o + 2.), pat = smoothstep(0.3, 0.7, n3(bc(a, z, R, 2.5, 1.5) + o + 4.));
      float w1 = mix(0.8, crease(n3(bc(a, zz, R, 1., 0.12) + o + 6.), 0.6), bf(pw, 0.12));
      float w2 = mix(0.8, crease(n3(bc(a, zz, R, 0.25, 0.04) + o + 12.), 0.8), bf(pw, 0.04));
      float fo = mix(0.9, crease(n3(bc(a, zz, R, 3., 0.7) + o + 19.), 0.07), bf(pw, 0.25));
      w1 = mix(1., w1, pat); w2 = mix(1., w2, 0.4 + 0.6 * pat);
      float gr = mix(0.5, n3(bc(a, z, R, 0.06, 0.06) + o + 43.), bf(pw, 0.06));      // fine grain of the skin
      h = fl * 0.3 + w1 * 0.3 + w2 * 0.1 + fo * 0.3 + (gr - 0.5) * 0.12; cav = (1. - fo * w1) * 0.8;
      float pink = n3(bc(a, z, R, 3., 4.) + o + 23.);
      alb = mix(vec3(0.3, 0.27, 0.26), vec3(0.4, 0.33, 0.3), smoothstep(0.4, 0.75, pink)) * (0.9 + 0.2 * fl) * (0.7 + 0.3 * w1) * (0.7 + 0.3 * fo) * (0.93 + 0.07 * w2) * (0.92 + 0.16 * gr);
      alb = mix(alb, vec3(0.45, 0.45, 0.4), smoothstep(0.68, 0.76, n3(P * 1.1 + sd)) * 0.3);
      moss *= 0.5;
    } else {                                       // furrowed (oak) and spiral (the coiled tree, narrower, stringier): plates and fibres
      bool sp = kind > 1.5;
      h = furrow(a, z, R, pw, sd, sp ? 0.26 : 0.34, sp ? 14. : 10., cav);
      float st = mix(0.5, n3(bc(a, z, R, 0.08, 1.5) + o + 31.), bf(pw, 0.08)), tn = n3(bc(a, z, R, 1.2, 6.) + o + 41.);
      alb = (sp ? vec3(0.3, 0.2, 0.14) : vec3(0.26, 0.2, 0.15)) * (0.6 + 0.8 * st) * (0.6 + 0.6 * h) * (0.7 + 0.6 * tn) * (1. - 0.93 * cav);
      moss = smoothstep(0.5, 0.7, mArg + 0.2 * cav - 0.05);       // moss lingers in the furrows
    }
    alb *= tint;
    alb = mix(alb, vec3(0.08, 0.14, 0.045) * (0.6 + 0.8 * n3(P * 9.) * bf(pw, 0.1)), moss * 0.9);
    float lich = smoothstep(0.74, 0.84, n3(P * 3.) * 0.6 + mix(0.5, n3(P * 21.), bf(pw, 0.05)) * 0.4);
    alb = mix(alb, mix(vec3(0.42, 0.46, 0.37), vec3(0.62, 0.5, 0.2), step(0.8, n3(P * 2.7 + 5.))), lich * (1. - moss) * 0.3 * step(kind, 0.5));
    ao = (0.45 + 0.55 * smoothstep(0.05, 0.6, h)) * (1. - 0.6 * cav); bk = (kind > 0.5 && kind < 1.5 ? 0.05 : kind > 2.5 ? 0.12 : 0.15) * (1. - moss * 0.6);
  } else if (abs(m - 1.) < 0.5) {                  // clapboard: lapped boards, painted, the paint worn through in places
    float row = floor(uv.y / 0.19), fy = fract(uv.y / 0.19);
    float jo = floor(uv.x / 2.3 + hash12(vec2(row, sd)) * 3.), tone = hash12(vec2(row, jo) + sd * 7.);
    float grain = fbm(vec2(uv.x * 1.3, uv.y * 32.) + tone * 9.);
    float peel = smoothstep(0.6, 0.68, fbm(uv * 1.1 + sd * 13.) + (grain - 0.5) * 0.35);
    alb = mix(tint * (0.82 + 0.3 * tone) * (0.9 + 0.15 * grain), vec3(0.3, 0.24, 0.18) * (0.7 + 0.5 * grain), peel);
    float lap = smoothstep(1., 0.86, fy);
    alb *= mix(0.4, 1., lap) * mix(0.65, 1., smoothstep(0., 0.8, uv.y));
    h = (1. - fy) * 0.7 + grain * 0.1; bk = 0.03; ao = mix(0.55, 1., lap);
  } else if (abs(m - 2.) < 0.5 || abs(m - 18.) < 0.5) {   // shingles: plain ones on roofs, fish-scale on towers and the pod
    bool fish = m > 17.5;
    float rh = fish ? 0.15 : 0.21, sw = fish ? 0.17 : 0.26, sc = fish ? 0.6 : 0.1;
    float row = floor(uv.y / rh), fy = fract(uv.y / rh), sx = uv.x / sw + row * 0.5, col = floor(sx), fx = fract(sx);
    float ec = sc * (1. - sqrt(max(0., 1. - pow(2. * fx - 1., 2.))));
    float tone = hash12(vec2(col, row) + sd * 3.), sh = 1.;
    if (fy < ec) { tone = hash12(vec2(floor(sx - 0.5), row - 1.) + sd * 3.); sh = 0.5; }
    float gap = fish ? 0. : lines(sx, 0.06);
    float n = fbm(uv * vec2(3., 6.) + sd);
    alb = tint * (0.7 + 0.45 * tone) * (0.85 + 0.25 * n) * sh * (1. - gap * 0.6);
    float moss = smoothstep(0.55, 0.78, fbm(uv * 0.5 + sd * 5.) + (fish ? -0.15 : 0.08) - uv.y * 0.04);
    alb = mix(alb, vec3(0.1, 0.16, 0.06) * (0.7 + 0.5 * n), moss * 0.8);
    alb = mix(alb, vec3(0.55, 0.42, 0.2), smoothstep(0.8, 0.83, vnoise(uv * 14. + sd)) * 0.5);
    h = fy < ec ? 0. : 1. - (fy - ec) / max(1. - ec, 0.01); bk = 0.02;
    ao = mix(1., 0.6, smoothstep(0.7, 1., fy)) * sh;
    spec = 20.;
  } else if (abs(m - 3.) < 0.5 || abs(m - 10.) < 0.5 || abs(m - 11.) < 0.5) {   // windows
    float type = m > 10.5 ? 2. : m > 9.5 ? 1. : 0., w = vK.z, hh = vK.w;
    if (type > 0.5) {
      vec2 cc = uv - vec2(w * 0.5, type > 1.5 ? hh - w * 0.5 : hh * 0.5);
      if ((type < 1.5 || cc.y > 0.) && length(cc) > w * 0.5) discard;
    }
    gl_FragColor = vec4(fogged(windowCol(P, N, uv, w, hh, sd, type), P), 1.);
    return;
  } else if (abs(m - 4.) < 0.5) {                  // copper and brass, going green
    float pat = smoothstep(0.3, 0.75, fbm(vec2(uv.x * 7., uv.y * 2.2) + sd * 4.) * 0.75 + fbm(vec2(uv.x * 22., uv.y * 1.2)) * 0.35 - 0.05) * vK.z;
    pat = mix(pat, 1., smoothstep(0.45, 0.8, fbm(vec2(uv.x * 3., uv.y * 6.))) * vK.z * 0.5);
    alb = mix(tint, vec3(0.2, 0.46, 0.4), pat);
    spec = mix(50., 6., pat); ao = 0.85;
  } else if (abs(m - 5.) < 0.5) {                  // rope: twisted strands
    float s = sin((uv.x * 3. + uv.y * 10.) * 6.2832);
    h = s * 0.5 + 0.5; alb = tint * (0.55 + 0.45 * h); ao = 0.6 + 0.4 * h; bk = 0.01; wrap = 0.4;
  } else if (abs(m - 6.) < 0.5) {                  // plaster, half-timbered when p1 is set (p2 = the wall's height)
    float n = fbm(uv * 1.6 + sd * 5.);
    alb = tint * (0.82 + 0.2 * n) * mix(0.7, 1., smoothstep(0., 0.9, uv.y));
    alb *= 1. - smoothstep(0.55, 0.8, fbm(uv * vec2(4., 0.8) + 9.)) * 0.18;
    if (vK.z > 0.5) {
      float H = vK.w, bay = floor(uv.x / 1.15), bx = fract(uv.x / 1.15) * 1.15;
      float tm = max(step(bx, 0.15), step(uv.y, 0.17));
      tm = max(tm, step(H - 0.16, uv.y));
      tm = max(tm, step(abs(uv.y - H * 0.48), 0.065));
      float dg = mod(bay, 2.) < 0.5 ? abs(bx - uv.y / (H * 0.48) * 1.15) : abs(bx - (1.15 - (uv.y - H * 0.48) / (H * 0.52) * 1.15));
      tm = max(tm, step(dg, 0.08) * step(0.15, bx));
      vec3 tw = vec3(0.17, 0.1, 0.065) * (0.7 + 0.5 * fbm(uv * vec2(9., 2.) + 3.));
      alb = mix(alb, tw, tm); h = tm * 0.6 + n * 0.1; bk = 0.04;
    }
  } else if (abs(m - 7.) < 0.5) {                  // paper lanterns, glowing (p1 = brightness)
    float rib = smoothstep(0.8, 1., abs(sin(uv.y * 3.14159 * 7.)));
    float f = 0.86 + 0.08 * sin(uTime * 7.3 + sd * 40.) + 0.06 * sin(uTime * 12.7 + sd * 9.);
    alb = tint * 0.25;
    emis = tint * vK.z * f * (1. - 0.55 * rib) * (0.7 + 0.3 * sin(uv.y * 3.14159));
  } else if (abs(m - 8.) < 0.5) {                  // greenhouse glass: a white frame, panes misted, plants lit inside
    float fu = lines(uv.x / 0.7, 0.07), fv = lines(uv.y / 0.6, 0.08), fr = max(fu, fv);
    vec3 V = normalize(cameraPosition - P);
    float leaf = smoothstep(0.48, 0.55, fbm(uv * 2.2 + sd) + 0.25 * fbm(uv * 9.)) * smoothstep(3.2, 0.5, uv.y);
    vec3 inside = mix(vec3(0.55, 0.95, 0.45) * 0.9, vec3(0.03, 0.07, 0.03), leaf) * (0.8 + 0.2 * sin(uTime * 0.7 + uv.x));
    inside += vec3(1.0, 0.75, 0.4) * 0.5 * smoothstep(2.5, 0., distance(uv, vec2(uv.x, 0.4)));
    float frn = 0.05 + 0.95 * pow(1. - max(dot(N, V), 0.), 5.);
    vec3 glass = mix(inside, fogSky(reflect(-V, N)), frn * 0.8) * (0.85 + 0.15 * vnoise(uv * 30.));
    vec3 frame = shade(vec3(0.7, 0.68, 0.6), N, P, 0.9, 0.2, 10.);
    gl_FragColor = vec4(fogged(mix(glass, frame, fr), P), 1.);
    return;
  } else if (abs(m - 9.) < 0.5) {                  // flags and bunting
    alb = tint * (0.85 + 0.15 * sin(uv.x * 20.)); wrap = 0.7;
    emis = tint * warm(P, -N, 0.3) * 0.25;
  } else if (abs(m - 12.) < 0.5) {                 // deck boards, worn grey, moss in the gaps
    float row = floor(uv.y / 0.15), fy = fract(uv.y / 0.15);
    float jo = floor(uv.x / 2.7 + hash12(vec2(row, 3.1)) * 4.), tone = hash12(vec2(row, jo) + sd);
    float grain = fbm(vec2(uv.x * 1.4, uv.y * 26.) + tone * 7.);
    float gap = max(lines(uv.y / 0.15, 0.08), lines(uv.x / 2.7 + hash12(vec2(row, 3.1)) * 4., 0.01));
    alb = tint * (0.7 + 0.45 * tone) * (0.8 + 0.35 * grain);
    alb = mix(alb, vec3(0.03, 0.04, 0.02), gap * 0.8);
    alb = mix(alb, vec3(0.08, 0.13, 0.04), gap * smoothstep(0.4, 0.7, fbm(uv * 0.8)));
    h = (1. - gap) * 0.5 + grain * 0.1; bk = 0.02; ao = 1. - gap * 0.5;
  } else if (abs(m - 13.) < 0.5) {                 // plain timber: posts, beams, rails, brackets
    float g = fbm3(P * vec3(2.5, 7., 2.5) + sd * 3.);
    alb = tint * (0.65 + 0.55 * g); h = g * 0.3; bk = 0.02; ao = 0.85;
  } else if (abs(m - 14.) < 0.5) {                 // doors: boards, ledges, strap hinges, a round light and a knob
    float w = vK.z, hh = vK.w;
    float seam = lines(uv.x / (w / 4.), 0.05);
    float ledge = step(abs(uv.y - hh * 0.22), 0.06) + step(abs(uv.y - hh * 0.72), 0.06);
    float strap = ledge * step(uv.x, w * 0.62) * step(abs(fract(uv.y / hh * 2.) - 0.5), 0.5);
    float g = fbm(vec2(uv.x * 25., uv.y * 1.5) + sd);
    alb = tint * (0.75 + 0.35 * g) * (1. - seam * 0.6);
    alb = mix(alb, vec3(0.05, 0.045, 0.04), clamp(strap, 0., 1.) * step(abs(uv.y - hh * 0.22) + step(0.5, uv.y / hh) * 9., 0.025) );
    alb = mix(alb, vec3(0.06, 0.05, 0.045), step(abs(uv.y - hh * 0.22), 0.025) * step(uv.x, w * 0.6) + step(abs(uv.y - hh * 0.72), 0.025) * step(uv.x, w * 0.6));
    h = (1. - seam) * 0.4 + clamp(ledge, 0., 1.) * 0.3; bk = 0.03;
    vec2 kc = uv - vec2(w * 0.8, hh * 0.47);
    alb = mix(alb, vec3(0.7, 0.5, 0.2), step(length(kc), 0.035)); spec = length(kc) < 0.035 ? 40. : 0.;
    vec2 rc = uv - vec2(w * 0.5, hh * 0.78);
    float rr = length(rc);
    if (rr < w * 0.17) { emis = vec3(1.0, 0.6, 0.3) * 1.4 * step(0.25, fract(sd * 3.3)) * (1. - step(abs(rc.x), 0.012) * 0.8 - step(abs(rc.y), 0.012) * 0.8); alb *= 0.2; }
    else if (rr < w * 0.21) { alb = vec3(0.6, 0.55, 0.45); h += 0.3; }
  } else if (abs(m - 15.) < 0.5) {                 // bracket fungus: pale caps, the gills underneath glowing
    float gl = 0.75 + 0.25 * sin(uTime * 0.5 + sd * 20.);
    float gills = 0.6 + 0.4 * sin(uv.x * 90.);
    alb = mix(vec3(0.75, 0.72, 0.62), vec3(0.5, 0.42, 0.35), fbm(uv * 12.)) * mix(0.8, 1., uv.y);
    float under = smoothstep(0.1, -0.4, N.y);
    emis = tint * vK.z * gl * (under * gills + (1. - under) * 0.12 * smoothstep(0.7, 1., uv.y));
    wrap = 0.5;
  } else if (abs(m - 16.) < 0.5) {                 // thatch: straw in courses, mossy and dark where it is old
    float course = fract(uv.y / 0.32), n = fbm(vec2(uv.x * 26., uv.y * 1.4) + sd);
    alb = mix(vec3(0.3, 0.22, 0.12), vec3(0.62, 0.5, 0.3), n) * tint * mix(0.55, 1., smoothstep(0., 0.6, course));
    alb = mix(alb, vec3(0.12, 0.15, 0.07), smoothstep(0.5, 0.75, fbm(uv * 0.6 + 4.)) * 0.7);
    h = n * 0.5 + course * 0.5; bk = 0.04; ao = mix(0.6, 1., course); wrap = 0.2;
  } else if (abs(m - 17.) < 0.5) {                 // board and batten, painted
    float bw = 0.3, bx = uv.x / bw, d = abs(fract(bx) - 0.5) * bw;
    float bat = smoothstep(0.035, 0.028, bw * 0.5 - d);
    float tone = hash12(vec2(floor(bx + 0.5), sd)), g = fbm(vec2(uv.x * 30., uv.y * 1.2) + tone * 5.);
    float peel = smoothstep(0.62, 0.7, fbm(uv * 1.2 + sd * 11.) + (g - 0.5) * 0.3);
    alb = mix(tint * (0.82 + 0.25 * tone) * (0.9 + 0.15 * g), vec3(0.3, 0.24, 0.18) * (0.7 + 0.5 * g), peel);
    alb *= mix(0.65, 1., smoothstep(0., 0.8, uv.y)) * (1. - (1. - bat) * smoothstep(0.03, 0.045, bw * 0.5 - d) * 0.0);
    h = bat * 0.6 + g * 0.1; bk = 0.03; ao = mix(0.75, 1., bat);
  }
  if (bk > 0.) N = bumpN(N, P, h, bk);
  vec3 col = shade(alb, N, P, ao, wrap, spec) + emis;
  gl_FragColor = vec4(fogged(col, P), 1.);
}`;

// ---------------------------------------------------------------- building geometry
// A builder collects triangles with their material and tint. Things are built in a "room" frame (the house's own
// axes, y up from its floor); `warp` bends a whole house (lean, twist) before it is placed, so the windows and the
// trim lean with the walls. `push`/`pop` nest frames inside a room.
function builder(swing = false) {
  const P = [], N = [], U = [], C = [], K = [], PV = [];
  const st = { mat: MAT.WOOD, col: [0.4, 0.3, 0.22], seed: 0, k2: 0, k3: 0, piv: [0, 0, 0, 0], warp: null };
  let inner = new THREE.Matrix4(), innerN = new THREE.Matrix3(), room = new THREE.Matrix4(), roomN = new THREE.Matrix3();
  const stack = [];
  const v = V(), n = V();
  function vtx(x, y, z, nx, ny, nz, u, w, k2) {
    v.set(x, y, z).applyMatrix4(inner); n.set(nx, ny, nz).applyMatrix3(innerN);
    if (st.warp) st.warp(v, n);
    v.applyMatrix4(room); n.applyMatrix3(roomN).normalize();
    P.push(v.x, v.y, v.z); N.push(n.x, n.y, n.z); U.push(u, w); C.push(st.col[0], st.col[1], st.col[2]); K.push(st.mat, st.seed, k2 ?? st.k2, st.k3);
    if (swing) PV.push(st.piv[0], st.piv[1], st.piv[2], st.piv[3]);
  }
  const b = {
    st,
    // the frame things are placed in: a position, a yaw and an optional warp (lean, twist) of the whole room
    room(x, y, z, yaw = 0, warp = null) {
      room = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z); roomN = new THREE.Matrix3().getNormalMatrix(room);
      inner = new THREE.Matrix4(); innerN = new THREE.Matrix3(); stack.length = 0; st.warp = warp;
    },
    push(m) { stack.push([inner, innerN]); inner = inner.clone().multiply(m); innerN = new THREE.Matrix3().getNormalMatrix(inner); },
    pop() { [inner, innerN] = stack.pop(); },
    set(mat, col, seed = st.seed, k2 = 0, k3 = 0) { st.mat = mat; st.col = col; st.seed = seed; st.k2 = k2; st.k3 = k3; return b; },
    tri(a, c, d) { vtx(...a); vtx(...c); vtx(...d); },
    // a parallelogram face: origin o, edge vectors eu, ev (normal = eu x ev), uv in metres from uv0
    face(o, eu, ev, uv0 = [0, 0]) {
      const lu = eu.length(), lv = ev.length(), nn = V().crossVectors(eu, ev).normalize();
      const p = (s, t) => [o.x + eu.x * s + ev.x * t, o.y + eu.y * s + ev.y * t, o.z + eu.z * s + ev.z * t, nn.x, nn.y, nn.z, uv0[0] + lu * s, uv0[1] + lv * t];
      const a = p(0, 0), c = p(1, 0), d = p(1, 1), e = p(0, 1);
      b.tri(a, c, d); b.tri(a, d, e);
    },
    // any four corners (counter-clockwise seen from the front) with their uvs
    quad(p0, p1, p2, p3, uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const nn = V().crossVectors(V().subVectors(p1, p0), V().subVectors(p3, p0)).normalize();
      const q = (p, t) => [p.x, p.y, p.z, nn.x, nn.y, nn.z, t[0], t[1]];
      b.tri(q(p0, uv[0]), q(p1, uv[1]), q(p2, uv[2])); b.tri(q(p0, uv[0]), q(p2, uv[2]), q(p3, uv[3]));
    },
    // an axis-aligned box centred at (cx, cy, cz); uv in metres on every face (u along, v up)
    box(cx, cy, cz, w, h, d, skip = "") {
      const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
      if (!skip.includes("x+")) b.face(V(x1, y0, z1), V(0, 0, -d), V(0, h, 0));
      if (!skip.includes("x-")) b.face(V(x0, y0, z0), V(0, 0, d), V(0, h, 0));
      if (!skip.includes("z+")) b.face(V(x0, y0, z1), V(w, 0, 0), V(0, h, 0));
      if (!skip.includes("z-")) b.face(V(x1, y0, z0), V(-w, 0, 0), V(0, h, 0));
      if (!skip.includes("y+")) b.face(V(x0, y1, z1), V(w, 0, 0), V(0, 0, -d));
      if (!skip.includes("y-")) b.face(V(x0, y0, z0), V(w, 0, 0), V(0, 0, d));
    },
    // a box from a to b (its length), w wide and t thick; `up` decides which way is thick
    beam(a, c, w, t, up = V(0, 1, 0)) {
      const dir = V().subVectors(c, a), L = dir.length(); dir.divideScalar(L);
      let side = V().crossVectors(up, dir); if (side.lengthSq() < 1e-6) side = V().crossVectors(V(1, 0, 0), dir);
      side.normalize(); const u2 = V().crossVectors(dir, side);
      const m = new THREE.Matrix4().makeBasis(side, u2, dir).setPosition(a);
      b.push(m); b.box(0, 0, L / 2, w, t, L); b.pop();
    },
    // a surface of revolution: profile [[r, y], ...] from the bottom up; u is the arc length (metres, or a fraction
    // of the turn when uFrac), v the length along the profile
    lathe(prof, seg, { a0 = 0, a1 = TAU, uFrac = false, uR = 0, off = null } = {}) {
      const L = [0]; for (let i = 1; i < prof.length; i++) L.push(L[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
      const nr = prof.map((p, i) => {
        const a = prof[Math.max(0, i - 1)], c = prof[Math.min(prof.length - 1, i + 1)];
        const dr = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dr, dy) || 1; return [dy / l, -dr / l];
      });
      for (let i = 0; i < prof.length - 1; i++) for (let j = 0; j < seg; j++) {
        const pt = (ii, jj) => {
          const a = a0 + (a1 - a0) * jj / seg, s = Math.sin(a), c = Math.cos(a), [r, y] = prof[ii], [nx, ny] = nr[ii];
          const u = uFrac ? (a - a0) / TAU : a * (uR || r), o = off ? off(ii / (prof.length - 1)) : null;
          return [r * s + (o ? o[0] : 0), y, r * c + (o ? o[1] : 0), nx * s, ny, nx * c, u, L[ii]];
        };
        b.tri(pt(i, j), pt(i, j + 1), pt(i + 1, j + 1)); b.tri(pt(i, j), pt(i + 1, j + 1), pt(i + 1, j));
      }
    },
    // a tube along a path of points, radius r(t) (t = 0..1 along); u = fraction round, v = metres along
    tube(pts, r, seg = 6, uScale = 1) {
      const n = pts.length, T = [], Nn = [], Bn = [], L = [0];
      for (let i = 0; i < n; i++) T.push(V().subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize());
      for (let i = 1; i < n; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1]));
      let nn = Math.abs(T[0].y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
      nn = V().crossVectors(T[0], V().crossVectors(nn, T[0])).normalize();
      for (let i = 0; i < n; i++) {
        if (i > 0) { const ax = V().crossVectors(T[i - 1], T[i]); const s = ax.length(); if (s > 1e-6) nn.applyAxisAngle(ax.divideScalar(s), Math.asin(Math.min(1, s))); nn.sub(V().copy(T[i]).multiplyScalar(nn.dot(T[i]))).normalize(); }
        Nn.push(nn.clone()); Bn.push(V().crossVectors(T[i], nn));
      }
      const rr = typeof r === "function" ? r : () => r;
      for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
        const pt = (ii, jj) => {
          const a = jj / seg * TAU, c = Math.cos(a), s = Math.sin(a), R = rr(L[ii] / L[n - 1]);
          const nx = Nn[ii].x * c + Bn[ii].x * s, ny = Nn[ii].y * c + Bn[ii].y * s, nz = Nn[ii].z * c + Bn[ii].z * s;
          return [pts[ii].x + nx * R, pts[ii].y + ny * R, pts[ii].z + nz * R, nx, ny, nz, jj / seg * uScale, L[ii]];
        };
        b.tri(pt(i, j), pt(i, j + 1), pt(i + 1, j + 1)); b.tri(pt(i, j), pt(i + 1, j + 1), pt(i + 1, j));
      }
    },
    // where a point of the current frame ends up in the world
    world(x, y, z) { const p = V(x, y, z).applyMatrix4(inner); if (st.warp) st.warp(p, V()); return p.applyMatrix4(room); },
    count: () => P.length / 3,
    positions: () => P,
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
      g.setAttribute("aC", new THREE.Float32BufferAttribute(C, 3));
      g.setAttribute("aK", new THREE.Float32BufferAttribute(K, 4));
      if (swing) g.setAttribute("aPv", new THREE.Float32BufferAttribute(PV, 4));
      g.computeBoundingSphere();
      return g;
    },
  };
  return b;
}
// lean (metres sideways per metre up, in x and z) and twist (radians per metre up) for a whole house
const bend = (lx = 0, lz = 0, tw = 0) => (p, n) => {
  if (tw) { const a = tw * p.y, c = Math.cos(a), s = Math.sin(a); p.set(p.x * c - p.z * s, p.y, p.x * s + p.z * c); n.set(n.x * c - n.z * s, n.y, n.x * s + n.z * c); }
  p.x += lx * p.y; p.z += lz * p.y;
};

// ---------------------------------------------------------------- pieces of houses (all in the current room frame)
const UP = V(0, 1, 0);
const TRIM = [0.72, 0.66, 0.56], TIMBER = [0.36, 0.27, 0.2], IRON = [0.22, 0.2, 0.19], COPPER = [0.62, 0.36, 0.22], BRASS = [0.72, 0.55, 0.28];
// a frame on a wall facing n, origin at o (the wall's surface): x along the wall to the right, y up, z out
const wallFrame = (o, n) => { const u = V().crossVectors(UP, n).normalize(); return new THREE.Matrix4().makeBasis(u, UP, n).setPosition(o); };

// a window (type 0 rectangle, 1 round, 2 arched), bottom-left at (x, y) of the wall frame; shutters, a flower box
function windowAt(b, x, y, ww, wh, type, seed, { frame = TRIM, shutters = null, box = false } = {}, out = null) {
  b.push(new THREE.Matrix4().makeTranslation(x, y, 0));
  b.set([MAT.WIN, MAT.WINR, MAT.WINA][type], [1, 1, 1], seed, ww, wh);
  b.face(V(0, 0, 0.035), V(ww, 0, 0), V(0, wh, 0));
  b.set(MAT.WOOD, frame, seed);
  const ft = 0.08, fd = 0.1;
  if (type === 0) {
    b.box(-ft / 2, wh / 2, fd / 2, ft, wh + ft * 2, fd); b.box(ww + ft / 2, wh / 2, fd / 2, ft, wh + ft * 2, fd);
    b.box(ww / 2, wh + ft / 2, fd / 2, ww, ft, fd);
  } else if (type === 1) {
    const pts = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * TAU; pts.push(V(ww / 2 + Math.cos(a) * (ww / 2 + 0.04), wh / 2 + Math.sin(a) * (ww / 2 + 0.04), 0.04)); }
    b.tube(pts, 0.055, 6);
  } else {
    const r = ww / 2 + 0.04, pts = [V(-0.04, 0, 0.04)];
    for (let i = 0; i <= 16; i++) { const a = Math.PI - i / 16 * Math.PI; pts.push(V(ww / 2 + Math.cos(a) * r, wh - ww / 2 + Math.sin(a) * r, 0.04)); }
    pts.push(V(ww + 0.04, 0, 0.04)); b.tube(pts, 0.05, 6);
  }
  if (type !== 1) b.box(ww / 2, -0.04, 0.08, ww + 0.24, 0.07, 0.16);           // sill
  if (shutters && type === 0) {
    for (const s of [-1, 1]) {
      const hx = s < 0 ? -ft : ww + ft, sw = ww * 0.5;
      b.push(new THREE.Matrix4().makeTranslation(hx, 0, 0.05).multiply(new THREE.Matrix4().makeRotationY(s * (0.35 + h1(seed * 9 + s) * 0.5))));
      b.set(MAT.BOARDV, shutters, seed + s); b.box(s * sw / 2, wh / 2, 0.02, sw, wh, 0.04);
      b.set(MAT.WOOD, shutters.map((c) => c * 0.7), seed); b.box(s * sw / 2, wh * 0.25, 0.05, sw * 0.9, 0.05, 0.03); b.box(s * sw / 2, wh * 0.75, 0.05, sw * 0.9, 0.05, 0.03);
      b.pop();
    }
  }
  if (box && out) {                                                    // a flower box under the sill
    b.set(MAT.PLANK, [0.45, 0.3, 0.2], seed); b.box(ww / 2, -0.2, 0.18, ww + 0.1, 0.22, 0.24);
    for (let i = 0; i < 3; i++) out.flowers.push({ p: b.world(ww * (0.2 + 0.3 * i), -0.02, 0.2), s: 0.35 + h1(seed + i) * 0.15, seed: h1(seed * 3 + i) });
  }
  b.pop();
}
function doorAt(b, x, ww, wh, col, seed) {
  b.push(new THREE.Matrix4().makeTranslation(x, 0, 0));
  b.set(MAT.DOOR, col, seed, ww, wh); b.face(V(0, 0, 0.04), V(ww, 0, 0), V(0, wh, 0));
  b.set(MAT.WOOD, TRIM, seed);
  b.box(-0.05, wh / 2, 0.06, 0.1, wh + 0.1, 0.12); b.box(ww + 0.05, wh / 2, 0.06, 0.1, wh + 0.1, 0.12); b.box(ww / 2, wh + 0.05, 0.06, ww + 0.2, 0.1, 0.12);
  b.pop();
}
// the openings of a box room: per side ("z+", "z-", "x+", "x-") a list of windows {a, y, w, h, t, sh, box} or doors {door, a, w, h}
function boxSides(b, w, d, spec, seed, out, frame = TRIM) {
  const sides = { "z+": [V(-w / 2, 0, d / 2), V(0, 0, 1)], "z-": [V(w / 2, 0, -d / 2), V(0, 0, -1)], "x+": [V(w / 2, 0, d / 2), V(1, 0, 0)], "x-": [V(-w / 2, 0, -d / 2), V(-1, 0, 0)] };
  let k = 0;
  for (const [side, list] of Object.entries(spec)) {
    const [o, n] = sides[side];
    b.push(wallFrame(o, n));
    for (const it of list) {
      k++;
      if (it.door) doorAt(b, it.a - it.w / 2, it.w, it.h, it.col || [0.5, 0.3, 0.2], seed + k);
      else windowAt(b, it.a - it.w / 2, it.y ?? 0.95, it.w, it.h ?? it.w, it.t || 0, seed * 13 + k, { frame, shutters: it.sh, box: it.box }, out);
    }
    b.pop();
  }
}
// walls of a box room with trim and a floor under it
function boxWalls(b, w, d, h, mat, col, seed, { floor = true, trim = TRIM } = {}) {
  b.set(mat, col, seed, mat === MAT.PLASTER ? 1 : 0, h); b.box(0, h / 2, 0, w, h, d, "y-y+");
  b.set(MAT.WOOD, trim, seed);
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(x * w / 2, h / 2, z * d / 2, 0.14, h + 0.05, 0.14);
  b.box(0, h, 0, w + 0.12, 0.12, d + 0.12, "y-");
  if (floor) { b.set(MAT.WOOD, TIMBER, seed); b.box(0, -0.13, 0, w + 0.3, 0.26, d + 0.3); }
}
// a slab: top face p0..p3 (counter-clockwise from above), t thick, with timber underneath and on the edges
function slab(b, p0, p1, p2, p3, t, mat, col, seed, uvTop) {
  b.set(mat, col, seed); b.quad(p0, p1, p2, p3, uvTop);
  const n = V().crossVectors(V().subVectors(p1, p0), V().subVectors(p3, p0)).normalize().multiplyScalar(-t);
  const q = [p0, p1, p2, p3].map((p) => p.clone().add(n));
  b.set(MAT.WOOD, TIMBER, seed); b.quad(q[3], q[2], q[1], q[0]);
  for (let i = 0; i < 4; i++) { const a = [p0, p1, p2, p3][i], c = [p0, p1, p2, p3][(i + 1) % 4]; b.quad(q[i], q[(i + 1) % 4], c, a); }
}
// a gable roof over a w x d room of wall height H: ridge along x, rh high, eaves over by `over`
function gableRoof(b, w, d, H, rh, over, mat, col, gmat, gcol, seed, ridgeCol = IRON) {
  const s = rh / (d / 2), W = w / 2 + over, Z = d / 2 + over, ye = H - over * s, yr = H + rh, L = Math.hypot(Z, yr - ye);
  const uv = [[0, 0], [2 * W, 0], [2 * W, L], [0, L]];
  slab(b, V(-W, ye, Z), V(W, ye, Z), V(W, yr, 0), V(-W, yr, 0), 0.14, mat, col, seed, uv);
  slab(b, V(W, ye, -Z), V(-W, ye, -Z), V(-W, yr, 0), V(W, yr, 0), 0.14, mat, col, seed + 1, uv);
  b.set(gmat, gcol, seed, 0, H + rh);
  for (const sx of [-1, 1]) {
    const x = sx * w / 2;
    b.tri([x, H, sx * d / 2, sx, 0, 0, 0, H], [x, H, -sx * d / 2, sx, 0, 0, d, H], [x, H + rh, 0, sx, 0, 0, d / 2, H + rh]);
  }
  b.set(MAT.METAL, ridgeCol, seed, 0.3); b.box(0, yr + 0.06, 0, 2 * W + 0.1, 0.12, 0.18);
  return { ye, yr };
}
// a single sloping roof rising toward -z
function shedRoof(b, w, d, H, rise, over, mat, col, gmat, gcol, seed) {
  const s = rise / d, W = w / 2 + over, Z = d / 2 + over, yf = H - over * s, yb = H + rise + over * s, L = Math.hypot(2 * Z, yb - yf);
  slab(b, V(-W, yf, Z), V(W, yf, Z), V(W, yb, -Z), V(-W, yb, -Z), 0.14, mat, col, seed, [[0, 0], [2 * W, 0], [2 * W, L], [0, L]]);
  b.set(gmat, gcol, seed, 0, H + rise);
  b.face(V(w / 2, H, -d / 2), V(-w, 0, 0), V(0, rise, 0), [0, H]);
  for (const sx of [-1, 1]) {
    const x = sx * w / 2;
    const a = [x, H, d / 2, sx, 0, 0, sx > 0 ? 0 : d, H], c = [x, H, -d / 2, sx, 0, 0, sx > 0 ? d : 0, H], e = [x, H + rise, -d / 2, sx, 0, 0, sx > 0 ? d : 0, H + rise];
    if (sx > 0) b.tri(a, c, e); else b.tri(c, a, e);
  }
}
// a cone roof (r at the wall top H, rh high), concave, its tip curled off to one side like a witch's hat;
// with `collar` it stops short round a trunk instead
function coneRoof(b, r, H, rh, over, mat, col, seed, { curl = [0, 0], collar = 0, seg = 28 } = {}) {
  const prof = [], s = rh / r;
  for (let i = 0; i <= 14; i++) { const t = i / 14; prof.push([lerp(r + over, collar || 0.015, t), H - over * s + (rh + over * s) * (1 - (1 - t) ** 1.35)]); }
  b.set(mat, col, seed);
  b.lathe(prof, seg, { uR: r * 0.7, off: (t) => [curl[0] * t ** 3, curl[1] * t ** 3] });
  b.set(MAT.WOOD, TIMBER, seed); b.lathe([[r + over, H - over * s - 0.12], [r + over, H - over * s]], seg);
  if (!collar) { b.set(MAT.METAL, COPPER, seed, 0.7); b.push(new THREE.Matrix4().makeTranslation(curl[0], H + rh - 0.05, curl[1])); b.lathe([[0.03, 0], [0.09, 0.12], [0.03, 0.3], [0.01, 0.5]], 8); b.pop(); }
}
// a stovepipe from (x, y, z) up h metres, with an elbow and a cap; returns the top (in the world) for the smoke
function stovepipe(b, x, y, z, h, seed) {
  b.set(MAT.METAL, [0.3, 0.27, 0.25], seed, 0.15);
  b.push(new THREE.Matrix4().makeTranslation(x, y, z)); b.lathe([[0.12, -0.6], [0.12, h]], 10); b.pop();
  const k = 0.4, top = V(x + k, y + h + 0.35, z);
  b.tube([V(x, y + h - 0.05, z), V(x + 0.05, y + h + 0.2, z), V(x + k * 0.6, y + h + 0.32, z), V(x + k, y + h + 0.35, z)], 0.12, 10);
  b.push(new THREE.Matrix4().makeTranslation(x + k, y + h + 0.35, z)); b.lathe([[0.12, -0.1], [0.12, 0.25]], 10); b.lathe([[0.05, 0.35], [0.24, 0.32], [0.2, 0.42], [0.02, 0.6]], 10); b.pop();
  return b.world(top.x, top.y + 0.35, top.z);
}
// a railing along a path of points (y = the floor), posts about every 1.2 m; segments near `gaps` are left open
function railing(b, pts, closed, gaps = [], col = TIMBER, seed = 0, h = 1.0) {
  const P = [];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], c = pts[(i + 1) % pts.length], k = Math.max(1, Math.round(a.distanceTo(c) / 1.2));
    for (let j = 0; j < k; j++) P.push(a.clone().lerp(c, j / k));
  }
  if (!closed) P.push(pts[pts.length - 1].clone());
  const open = (p) => gaps.some((g) => Math.hypot(p.x - g.x, p.z - g.z) < 0.9);
  b.set(MAT.WOOD, col, seed);
  for (let i = 0; i < P.length; i++) {
    const a = P[i], c = P[(i + 1) % P.length];
    if (open(a)) continue;
    b.beam(a, a.clone().add(V(0, h + 0.05, 0)), 0.09, 0.09);
    if ((i === P.length - 1 && !closed) || open(c)) continue;
    b.beam(a.clone().add(V(0, h, 0)), c.clone().add(V(0, h, 0)), 0.12, 0.06);
    b.beam(a.clone().add(V(0, h * 0.5, 0)), c.clone().add(V(0, h * 0.5, 0)), 0.05, 0.05);
  }
}
// an irregular polygon round (cx, cz) at height y: one radius per corner
const poly = (cx, y, cz, radii, a0 = 0) => radii.map((r, i) => { const a = a0 + i / radii.length * TAU; return V(cx + Math.sin(a) * r, y, cz + Math.cos(a) * r); });
// a platform: a polygon of deck boards with an edge, joists underneath and a railing (open near `gaps`)
function deck(b, pts, gaps, seed, { rail = true, t = 0.22 } = {}) {
  const n = pts.length, y = pts[0].y, c = pts.reduce((a, p) => a.add(p), V()).divideScalar(n);
  b.set(MAT.DECK, [0.5, 0.42, 0.34], seed);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    b.tri([c.x, y, c.z, 0, 1, 0, c.x, c.z], [p.x, y, p.z, 0, 1, 0, p.x, p.z], [q.x, y, q.z, 0, 1, 0, q.x, q.z]);
    b.tri([c.x, y - t, c.z, 0, -1, 0, c.x, c.z], [q.x, y - t, q.z, 0, -1, 0, q.x, q.z], [p.x, y - t, p.z, 0, -1, 0, p.x, p.z]);
  }
  b.set(MAT.WOOD, TIMBER, seed);
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; b.quad(V(p.x, y - t, p.z), V(q.x, y - t, q.z), V(q.x, y, q.z), V(p.x, y, p.z)); }
  for (let i = 0; i < n; i++) b.beam(c.clone().setY(y - t - 0.12), pts[i].clone().lerp(c, 0.04).setY(y - t - 0.12), 0.16, 0.24);
  if (rail) railing(b, pts, true, gaps, TIMBER, seed);
  return pts;
}
// where a ray from (cx, cz) at angle a leaves a deck polygon
function edgeAt(pts, cx, cz, a) {
  const dx = Math.sin(a), dz = Math.cos(a);
  let best = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length], ex = q.x - p.x, ez = q.z - p.z;
    const den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue;
    const t = ((p.x - cx) * ez - (p.z - cz) * ex) / den, s = ((p.x - cx) * dz - (p.z - cz) * dx) / den;
    if (t > 0 && s >= 0 && s <= 1) best = Math.max(best, t);
  }
  return V(cx + dx * best, pts[0].y, cz + dz * best);
}
// knee braces from under a platform at (x, y, z) in to the trunk, `drop` metres lower
function brace(b, tr, x, y, z, drop, seed) {
  const [ax, az] = tAxis(tr, y - drop), r = tRad(tr, y - drop) * 0.92, a = Math.atan2(x - ax, z - az);
  b.set(MAT.WOOD, TIMBER, seed); b.beam(V(x, y, z), V(ax + Math.sin(a) * r, y - drop, az + Math.cos(a) * r), 0.16, 0.16);
}
// a rope bridge from A to B (deck edges): planks on a sagging curve, rope handrails, ties; returns the rail curves
function bridge(b, A, B, sag, seed) {
  const R = rng(seed), L = A.distanceTo(B), n = Math.max(4, Math.round(L / 0.33));
  const cur = (t) => A.clone().lerp(B, t).add(V(0, -sag * 4 * t * (1 - t), 0));
  const fwd = V().subVectors(B, A).setY(0).normalize(), side = V().crossVectors(UP, fwd).normalize();
  const rail = (t, s) => A.clone().lerp(B, t).add(V(0, 1.05 - sag * 0.6 * 4 * t * (1 - t), 0)).addScaledVector(side, s * 0.55);
  for (let i = 0; i <= n; i++) {
    const t = i / n; if (i > 0 && i < n && R() < 0.035) continue;      // a plank or two gone
    const p = cur(t), T = V().subVectors(cur(Math.min(1, t + 0.01)), cur(Math.max(0, t - 0.01))).normalize();
    const up = V().crossVectors(T, side).normalize(), tw = (R() - 0.5) * 0.08;
    const m = new THREE.Matrix4().makeBasis(side.clone().applyAxisAngle(up, tw), up, T.clone().applyAxisAngle(up, tw)).setPosition(p.x, p.y + 0.02, p.z);
    b.push(m); b.set(MAT.WOOD, [0.42 + R() * 0.12, 0.33 + R() * 0.08, 0.24 + R() * 0.05], seed + i); b.box(0, 0, 0, 0.95 + R() * 0.1, 0.05, 0.22); b.pop();
  }
  b.set(MAT.ROPE, [0.5, 0.42, 0.3], seed);
  const N = 24;
  for (const s of [-1, 1]) {
    b.tube(Array.from({ length: N + 1 }, (_, i) => cur(i / N).addScaledVector(side, s * 0.46).add(V(0, -0.02, 0))), 0.028, 5);
    b.tube(Array.from({ length: N + 1 }, (_, i) => rail(i / N, s)), 0.032, 5);
    for (let i = 1; i < n; i += 3) { const t = i / n; b.tube([cur(t).addScaledVector(side, s * 0.47), rail(t, s)], 0.014, 4); }
    b.set(MAT.WOOD, TIMBER, seed);
    for (const [P0, t] of [[A, 0], [B, 1]]) { const p = P0.clone().addScaledVector(side, s * 0.56); b.beam(p.clone().add(V(0, -0.3, 0)), p.clone().add(V(0, 1.3, 0)), 0.13, 0.13); }
    b.set(MAT.ROPE, [0.5, 0.42, 0.3], seed);
  }
  return { rail, cur, side };
}
// a rope ladder from top down to bottom
function ladder(b, top, bot, seed) {
  const d = V().subVectors(bot, top), L = d.length(), side = V().crossVectors(d, UP).normalize().multiplyScalar(0.23);
  if (side.lengthSq() < 1e-6) side.set(0.23, 0, 0);
  b.set(MAT.ROPE, [0.48, 0.4, 0.28], seed);
  for (const s of [-1, 1]) b.tube([top.clone().addScaledVector(side, s), bot.clone().addScaledVector(side, s)], 0.022, 5);
  b.set(MAT.WOOD, [0.4, 0.3, 0.2], seed);
  for (let y = 0.3; y < L; y += 0.34) { const p = top.clone().addScaledVector(d, y / L); b.beam(p.clone().sub(side), p.clone().add(side), 0.05, 0.05); }
}
// a sagging line from A to B, as points
const sagLine = (A, B, sag, n = 20) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return A.clone().lerp(B, t).add(V(0, -sag * 4 * t * (1 - t), 0)); });
// lights strung along a path: a bulb every `step` metres
function stringLights(out, pts, step = 0.45, pal = 0) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], c = pts[i], l = a.distanceTo(c);
    while (acc < l) { const p = a.clone().lerp(c, acc / l); out.bulbs.push(p.x, p.y - 0.06, p.z, pal ? h1(out.bulbs.length * 0.37 + pal) : -1); acc += step; }
    acc -= l;
  }
}
// bunting: little flags hanging from a sagging line
function bunting(b, A, B, sag, seed) {
  const pts = sagLine(A, B, sag, 40), R = rng(seed);
  b.set(MAT.ROPE, [0.4, 0.35, 0.3], seed); b.tube(pts, 0.012, 3);
  const cols = [[0.75, 0.3, 0.32], [0.85, 0.7, 0.4], [0.4, 0.55, 0.62], [0.82, 0.78, 0.7], [0.55, 0.45, 0.7], [0.45, 0.62, 0.42]];
  for (let i = 1; i < pts.length - 1; i += 2) {
    const a = pts[i], c = pts[i + 1], m = a.clone().lerp(c, 0.5).add(V(0, -0.38, 0));
    b.set(MAT.FABRIC, cols[Math.floor(R() * cols.length)], seed + i);
    b.tri([a.x, a.y, a.z, 0, 0, 1, 0, 0], [c.x, c.y, c.z, 0, 0, 1, 1, 0], [m.x, m.y, m.z, 0, 0, 1, 0.5, 0.38]);
  }
}
// a paper lantern hanging from `top` (in the swing builder, so it sways); returns its centre
const HALOS = [];
function lantern(sb, top, drop, col, bright, seed, shape = 0) {
  sb.st.piv = [top.x, top.y, top.z, 0.05 + h1(seed) * 0.04];
  sb.room(0, 0, 0);
  sb.set(MAT.ROPE, [0.3, 0.25, 0.2], seed); sb.tube([top, top.clone().add(V(0, -drop, 0))], 0.012, 3);
  const c = top.clone().add(V(0, -drop - 0.25, 0));
  sb.push(new THREE.Matrix4().makeTranslation(c.x, c.y - 0.25, c.z));
  sb.set(MAT.LANTERN, col, seed, bright);
  const prof = shape === 0 ? [[0.09, 0], [0.2, 0.08], [0.25, 0.25], [0.2, 0.42], [0.09, 0.5]] : [[0.12, 0], [0.16, 0.05], [0.16, 0.45], [0.12, 0.5]];
  sb.lathe(prof, 12, { uFrac: true });
  sb.set(MAT.METAL, IRON, seed, 0.2); sb.lathe([[0.1, 0.48], [0.1, 0.56], [0.02, 0.6]], 8); sb.lathe([[0.02, -0.06], [0.1, -0.02], [0.1, 0.02]], 8);
  sb.pop();
  HALOS.push([c.x, c.y, c.z, bright]);
  return c;
}
// bracket fungus: a cluster of glowing shelves on the bark round angle a at height y
function fungus(b, tr, y, a, n, glow, seed) {
  const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const yy = y + (R() - 0.5) * 1.6, aa = a + (R() - 0.5) * 0.9, s = 0.5 + R() * 0.8;
    const [ax, az] = tAxis(tr, yy), r = tRad(tr, yy) * 0.97;
    b.room(ax + Math.sin(aa) * r, yy, az + Math.cos(aa) * r, aa);
    b.push(new THREE.Matrix4().makeScale(s, s, s));
    b.set(MAT.FUNGUS, glow, seed + i, 1.6 + R() * 1.2);
    b.lathe([[0.0, 0.07], [0.22, 0.06], [0.38, 0.02], [0.42, -0.02], [0.36, -0.05], [0.18, -0.05], [0.0, -0.04]], 10, { a0: -Math.PI / 2, a1: Math.PI / 2, uFrac: true });
    b.pop();
  }
}

// ---------------------------------------------------------------- the city in the tree
// Houses are planned (kind and size), checked against everything already placed (each thing claims a cylinder),
// then built. Platforms ring the trunk at seven levels in broken arcs; houses crowd along them, some hanging out over
// the edge on brackets; six great limbs carry more houses and a pod or two on ropes; then rooms are stacked on the
// roofs, each turned on the one below, two or three high where there is space; rope bridges join houses at like
// heights; a spiral stair climbs the trunk inside it all.
const deg = Math.PI / 180;
const at = (tr, a, r, y) => { const [ax, az] = tAxis(tr, y), b = V(ax + Math.sin(a) * r, y, az + Math.cos(a) * r); return b; };
const toward = (a, c) => Math.atan2(c.x - a.x, c.z - a.z);
const WARM = [1.0, 0.6, 0.3];
const WALLS = [
  [MAT.PLANK, [0.33, 0.5, 0.55]], [MAT.PLANK, [0.84, 0.78, 0.66]], [MAT.BOARDV, [0.7, 0.45, 0.45]], [MAT.BOARDV, [0.76, 0.56, 0.25]],
  [MAT.PLASTER, [0.86, 0.8, 0.66]], [MAT.PLANK, [0.5, 0.6, 0.5]], [MAT.BOARDV, [0.5, 0.17, 0.14]], [MAT.SCALE, [0.84, 0.66, 0.52]],
  [MAT.PLANK, [0.5, 0.62, 0.75]], [MAT.BOARDV, [0.55, 0.38, 0.22]], [MAT.PLANK, [0.8, 0.6, 0.34]], [MAT.SCALE, [0.58, 0.52, 0.76]],
  [MAT.PLASTER, [0.8, 0.7, 0.72]], [MAT.BOARDV, [0.36, 0.42, 0.55]],
];
const ROOFS = [[MAT.SHINGLE, [0.42, 0.2, 0.25]], [MAT.SHINGLE, [0.24, 0.3, 0.46]], [MAT.SHINGLE, [0.3, 0.42, 0.3]], [MAT.SHINGLE, [0.56, 0.27, 0.18]],
  [MAT.THATCH, [1, 0.95, 0.85]], [MAT.SHINGLE, [0.3, 0.25, 0.42]], [MAT.SCALE, [0.28, 0.42, 0.44]], [MAT.SHINGLE, [0.5, 0.42, 0.36]]];
const DOORS = [[0.58, 0.26, 0.22], [0.3, 0.42, 0.5], [0.32, 0.42, 0.3], [0.4, 0.3, 0.55], [0.55, 0.4, 0.2], [0.25, 0.22, 0.2]];
const SHUT = [[0.6, 0.3, 0.28], [0.32, 0.4, 0.3], [0.3, 0.38, 0.5], [0.6, 0.45, 0.3], [0.45, 0.3, 0.45]];
const pick = (R, a) => a[Math.floor(R() * a.length)];

// windows along a wall of length len and height h
function autoWindows(R, len, h, max = 2) {
  const n = Math.min(max, len > 3.1 ? 2 : len > 1.2 ? 1 : 0), list = [];
  for (let i = 0; i < n; i++) {
    const t = R() < 0.5 ? 0 : R() < 0.45 ? 1 : 2, w = t === 1 ? 0.55 + R() * 0.35 : 0.6 + R() * 0.3;
    const hh = t === 0 ? 0.8 + R() * 0.4 : t === 2 ? w + 0.45 + R() * 0.35 : w, y = Math.min(0.95, h - 0.3 - hh);
    if (y < 0.35) continue;
    list.push({ a: len * (i + 0.5) / n, w, h: hh, t, y, sh: t === 0 && R() < 0.35 ? pick(R, SHUT) : null, box: t === 0 && R() < 0.3 });
  }
  return list;
}
// the kinds of house, sized: r is the radius it needs, top its height, stack where a room on its roof would stand
let STYLE = null;      // the style of the city being built (set by city())
function planHouse(R, kind, sc = 1) {
  const [wm, wc] = STYLE?.walls ? WALLS[pick(R, STYLE.walls)] : pick(R, WALLS), [rm, rc] = STYLE?.roofs ? ROOFS[pick(R, STYLE.roofs)] : pick(R, ROOFS);
  const H = { kind, seed: Math.floor(R() * 1e5), lean: [(R() - 0.5) * 0.08, (R() - 0.5) * 0.08], twist: (R() - 0.5) * 0.04, wm, wc, rm, rc };
  if (kind === "gable" || kind === "shed") {
    Object.assign(H, { w: (2.3 + R() * 1.9) * sc, d: (2.1 + R() * 1.3) * sc, h: 2.2 + R() * 0.6, over: 0.3 + R() * 0.2 });
    H.rh = kind === "gable" ? (1.1 + R() * 1.7) * sc : 0.7 + R() * 0.5;
    H.r = Math.hypot(H.w / 2 + H.over, H.d / 2 + H.over) * 0.9; H.top = H.h + H.rh; H.stack = H.h + H.rh * 0.45; H.wall = H.d / 2;
  } else if (kind === "witch") {
    Object.assign(H, { rad: (1.3 + R() * 0.7) * sc, h: 2.4 + R() * 0.8, rh: (2.6 + R() * 1.6) * sc, over: 0.4, wm: MAT.SCALE, rm: R() < 0.8 ? MAT.SHINGLE : MAT.SCALE });
    H.ring = R() < 0.5; H.r = H.rad + (H.ring ? 0.75 : 0.45); H.top = H.h + H.rh; H.stack = null; H.wall = H.rad + (H.ring ? 0.35 : 0);
  } else if (kind === "onion") {
    Object.assign(H, { rad: (1.35 + R() * 0.35) * sc, h: 2.3 });
    H.r = H.rad * 1.15 + 0.2; H.top = H.h + 3.7 * H.rad / 1.6; H.stack = null; H.wall = H.rad * 0.92;
  } else if (kind === "aframe") {
    Object.assign(H, { w: (3.0 + R() * 1.1) * sc, d: (2.8 + R() * 0.8) * sc, h: 0.4, over: 0.3 });
    H.rh = H.d * (0.9 + R() * 0.3); H.r = Math.hypot(H.w / 2 + 0.3, H.d / 2 + 0.3) * 0.9; H.top = H.h + H.rh; H.stack = H.h + H.rh * 0.55; H.wall = H.d / 2;
  } else if (kind === "barrel") {
    Object.assign(H, { len: (3.0 + R() * 0.9) * sc, rad: (1.0 + R() * 0.25) * sc, wm: MAT.BOARDV, wc: [0.55, 0.38, 0.22] });
    H.r = H.len / 2 + 0.6; H.top = H.rad * 2 + 0.4; H.stack = H.rad * 2 + 0.5; H.wall = H.len / 2;
  } else if (kind === "tower") {
    Object.assign(H, { w: (1.45 + R() * 0.35) * sc, h: 3.4 + R() * 1.6, over: 0.3 });
    H.rh = 2.1 + R() * 0.9; H.r = H.w * 0.72 + 0.35; H.top = H.h + H.rh; H.stack = null; H.wall = H.w / 2;
  } else if (kind === "thatch") {
    Object.assign(H, { rad: (1.9 + R() * 0.7) * sc, h: 2.3 + R() * 0.4, over: 0.6, rm: MAT.THATCH, rc: [1, 0.95, 0.85] });
    if (H.wm === MAT.SCALE || H.wm === MAT.PLASTER) H.wm = MAT.BOARDV;
    H.rh = H.rad * (0.85 + R() * 0.3); H.r = H.rad + H.over; H.top = H.h + H.rh; H.stack = H.h + H.rh * 0.55; H.wall = H.rad;
  } else if (kind === "dome") {
    Object.assign(H, { rad: (1.8 + R() * 0.4) * sc });
    H.r = H.rad + 0.3; H.top = 0.55 + H.rad * 1.08 + 0.5; H.stack = null; H.wall = H.rad;
  }
  return H;
}
// a pennant on a thin pole at the tip of a roof (in the house's frame)
function pennant(b, x, y, z, R) {
  b.set(MAT.METAL, IRON, 1, 0.1); b.beam(V(x, y - 0.2, z), V(x, y + 1.0, z), 0.03, 0.03);
  b.set(MAT.FABRIC, pick(R, [[0.75, 0.25, 0.28], [0.9, 0.75, 0.4], [0.4, 0.55, 0.7], [0.6, 0.45, 0.75]]), Math.floor(R() * 1e4));
  const a = R() * TAU, d = V(Math.sin(a), 0, Math.cos(a));
  const p0 = V(x, y + 1.0, z), p1 = V(x, y + 0.65, z), tip = p0.clone().lerp(p1, 0.5).addScaledVector(d, 0.75);
  b.tri([p0.x, p0.y, p0.z, -d.z, 0, d.x, 0, 0], [p1.x, p1.y, p1.z, -d.z, 0, d.x, 0, 0], [tip.x, tip.y, tip.z, -d.z, 0, d.x, 0.5, 0.75]);
}
// build a planned house at (x, y, z) facing yaw (local +z, the side with the best windows, faces out)
function buildHouse(b, sb, out, H, x, y, z, yaw) {
  const R = rng(H.seed), s = H.seed;
  Object.assign(H, { x, y, z, yaw });
  b.room(x, y, z, yaw, bend(H.lean[0], H.lean[1], H.twist));
  const light = (lx, ly, lz, i = 3.5 + R() * 2.5, c = WARM) => out.lights.push({ p: b.world(lx, ly, lz), c, i, s: 1 });
  const round = (rad, h, wm, wc, n, doorA) => {
    b.set(MAT.WOOD, TIMBER, s); b.lathe([[rad + 0.35, 0], [0, 0]], 24); b.lathe([[rad + 0.35, -0.25], [rad + 0.35, 0]], 24); b.lathe([[0, -0.25], [rad + 0.35, -0.25]], 24);
    b.set(wm, wc, s, 0, h); b.lathe([[rad, 0], [rad, h]], Math.max(16, Math.round(rad * 14)));
    b.set(MAT.WOOD, TRIM, s); b.lathe([[rad + 0.06, h - 0.2], [rad + 0.06, h + 0.02]], 24);
    for (let k = 0; k < n; k++) {
      const th = doorA + k * TAU / n, nn = V(Math.sin(th), 0, Math.cos(th));
      b.push(wallFrame(nn.clone().multiplyScalar(rad), nn));
      if (k === 0) doorAt(b, -0.42, 0.84, Math.min(1.95, h - 0.25), pick(R, DOORS), s + 1);
      else { const t = R() < 0.4 ? 1 : R() < 0.5 ? 2 : 0, w = t === 1 ? 0.6 : 0.62, hh = t === 0 ? 0.95 : t === 2 ? 1.25 : 0.6; windowAt(b, -w / 2, Math.min(0.95, h - 0.35 - hh), w, hh, t, s * 7 + k, { box: t === 0 && R() < 0.4 }, out); }
      b.pop();
    }
  };
  const k = H.kind;
  if (k === "gable" || k === "shed" || k === "tower") {
    const w = k === "tower" ? H.w : H.w, d = k === "tower" ? H.w : H.d;
    boxWalls(b, w, d, H.h, H.wm, H.wc, s);
    const door = R() < 0.5 ? "x-" : "x+", other = door === "x-" ? "x+" : "x-";
    const spec = { "z+": autoWindows(R, w, H.h), "z-": autoWindows(R, w, H.h, 1), [other]: autoWindows(R, d, H.h, 1), [door]: [{ door: true, a: d / 2, w: 0.82, h: Math.min(1.95, H.h - 0.2), col: pick(R, DOORS) }] };
    if (k === "tower") for (const sd of ["z+", "x+", "x-", "z-"]) { if (sd === door) continue; spec[sd] = []; for (let yy = 1.0; yy < H.h - 1.0; yy += 1.35) spec[sd].push({ a: w / 2, w: 0.45, h: 0.62, y: yy, t: R() < 0.2 ? 2 : 0 }); }
    boxSides(b, w, d, spec, s, out);
    if (k === "gable") {
      gableRoof(b, w, d, H.h, H.rh, H.over, H.rm, H.rc, H.wm, H.wc, s + 1);
      if (R() < 0.35 && out.smoke.length < 6) out.smoke.push(stovepipe(b, w * 0.25, H.h + H.rh * 0.68, -d * 0.16, 1.2 + R() * 0.6, s + 2));
    } else if (k === "shed") shedRoof(b, w, d, H.h, H.rh, H.over, H.rm, H.rc, H.wm, H.wc, s + 1);
    else { const cu = [(R() - 0.5) * 0.8, (R() - 0.5) * 0.8]; coneRoof(b, w * 0.72, H.h, H.rh, H.over, H.rm, H.rc, s + 1, { curl: cu, seg: 20 }); if (R() < 0.5) pennant(b, cu[0], H.h + H.rh + 0.25, cu[1], R); }
    H.port = (sx) => b.world(sx * (w / 2 + 0.3), 0, 0);
    light(0, 1.5, d / 2 + 1.2);
    if (R() < 0.4) lantern(sb, b.world((door === "x-" ? -1 : 1) * (w / 2 + 0.25), H.h - 0.1, d / 2 - 0.3), 0.25, [1.0, 0.6 + R() * 0.15, 0.3], 5, s + 3, R() < 0.5 ? 0 : 1);
  } else if (k === "witch" || k === "thatch") {
    round(H.rad, H.h, H.wm, H.wc, Math.max(4, Math.round(H.rad * 2.6)), R() * TAU);
    if (H.ring) railing(b, Array.from({ length: 16 }, (_, i) => { const a = i / 16 * TAU; return V(Math.sin(a) * (H.rad + 0.3), 0, Math.cos(a) * (H.rad + 0.3)); }), true, [], TIMBER, s, 0.85);
    if (k === "witch") { const cu = [(R() - 0.5) * 1.4, (R() - 0.5) * 1.4]; coneRoof(b, H.rad, H.h, H.rh, H.over, H.rm, H.rc, s + 1, { curl: cu }); if (R() < 0.4) pennant(b, cu[0], H.h + H.rh + 0.25, cu[1], R); }
    else coneRoof(b, H.rad, H.h, H.rh, H.over, MAT.THATCH, H.rc, s + 1, { seg: 32 });
    H.port = (sx) => b.world(sx * (H.rad + 0.3), 0, 0);
    light(0, 1.5, H.rad + 1.2);
  } else if (k === "onion") {
    const RE = H.rad, HE = H.h;
    b.set(MAT.WOOD, TIMBER, s); b.lathe([[RE + 0.3, 0], [0, 0]], 8, { a0: TAU / 16, a1: TAU + TAU / 16 }); b.lathe([[RE + 0.3, -0.25], [RE + 0.3, 0]], 8, { a0: TAU / 16, a1: TAU + TAU / 16 });
    for (let q = 0; q < 8; q++) {
      const a = (q + 0.5) * TAU / 8, c = (q + 1.5) * TAU / 8, p = V(Math.sin(a) * RE, 0, Math.cos(a) * RE), pq = V(Math.sin(c) * RE, 0, Math.cos(c) * RE);
      b.set(H.wm === MAT.SCALE ? MAT.BOARDV : H.wm, H.wc, s + q, 0, HE); b.face(p, V().subVectors(pq, p), V(0, HE, 0));
      const n = V().crossVectors(V().subVectors(pq, p), UP).normalize().negate(), fw = p.distanceTo(pq);
      b.push(wallFrame(p, n));
      if (q === 0) doorAt(b, fw / 2 - 0.38, 0.76, 1.85, pick(R, DOORS), s + 20); else if (q % 2 === 0) windowAt(b, fw / 2 - 0.28, 0.75, 0.56, 1.2, R() < 0.5 ? 2 : 0, s + q);
      b.pop();
      b.set(MAT.WOOD, TRIM, s); b.beam(p, p.clone().setY(HE), 0.12, 0.12);
    }
    b.set(MAT.WOOD, TRIM, s); b.lathe([[RE * 1.02, HE - 0.1], [RE * 1.08, HE + 0.12], [RE * 0.95, HE + 0.18]], 8, { a0: TAU / 16, a1: TAU + TAU / 16 });
    const f = RE / 1.6;
    b.set(MAT.METAL, COPPER, s + 1, 0.85);
    b.lathe([[1.5, 0.15], [1.82, 0.6], [1.86, 1.05], [1.55, 1.6], [0.85, 2.15], [0.3, 2.65], [0.07, 3.15], [0.05, 3.6]].map(([r, yy]) => [r * f, HE + yy * f]), 20);
    if (out.vanes.length < 8) out.vanes.push(b.world(0, HE + 3.6 * f, 0));
    H.port = (sx) => b.world(sx * (RE + 0.3), 0, 0);
    light(0, 1.4, RE + 1.2);
  } else if (k === "aframe") {
    boxWalls(b, H.w, H.d, H.h, MAT.PLANK, [0.84, 0.78, 0.66], s, { floor: true });
    gableRoof(b, H.w, H.d, H.h, H.rh, H.over, H.rm, H.rc, MAT.PLANK, [0.84, 0.78, 0.66], s + 1);
    const ww = Math.min(1.3, H.d * 0.42);
    b.push(wallFrame(V(H.w / 2, 0, 0), V(1, 0, 0))); windowAt(b, -ww / 2, 0.5, ww, ww, 1, s + 2); b.pop();
    b.push(wallFrame(V(-H.w / 2, 0, 0), V(-1, 0, 0))); doorAt(b, -0.4, 0.8, Math.min(1.8, H.rh * 0.55), pick(R, DOORS), s + 3); b.pop();
    H.port = (sx) => b.world(sx * (H.w / 2 + 0.3), 0, 0);
    light(H.w / 2 + 1.2, 1.2, 0);
  } else if (k === "barrel") {
    const L = H.len, r = H.rad, cy = r + 0.3;
    b.push(new THREE.Matrix4().makeTranslation(-L / 2, cy, 0).multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2)));
    b.set(MAT.BOARDV, H.wc, s); b.lathe([[r, 0], [r * 1.14, L * 0.14], [r * 1.22, L * 0.5], [r * 1.14, L * 0.86], [r, L]], 22);
    b.set(MAT.PLANK, H.wc, s + 1); b.lathe([[0, 0], [r, 0]], 22); b.lathe([[r, L], [0, L]], 22);
    b.set(MAT.METAL, IRON, s + 2, 0.1);
    for (const [t, f] of [[0.09, 1.1], [0.33, 1.2], [0.67, 1.2], [0.91, 1.1]]) b.lathe([[r * f + 0.03, L * t - 0.07], [r * f + 0.035, L * t + 0.07]], 22);
    b.pop();
    b.push(wallFrame(V(L / 2 + 0.02, 0, 0), V(1, 0, 0))); windowAt(b, -r * 0.42, cy - r * 0.42, r * 0.84, r * 0.84, 1, s + 3); b.pop();
    b.push(wallFrame(V(-L / 2 - 0.02, cy - r + 0.12, 0), V(-1, 0, 0))); doorAt(b, -0.38, 0.76, Math.min(1.6, r * 1.6), pick(R, DOORS), s + 4); b.pop();
    for (const sg of [-1, 1]) { b.push(wallFrame(V(0, 0, sg * (r * 1.22 + 0.02)), V(0, 0, sg))); windowAt(b, -0.3, cy - 0.3, 0.6, 0.6, 1, s + 5 + sg); b.pop(); }
    b.set(MAT.WOOD, TIMBER, s + 6);
    for (const xx of [-L * 0.3, L * 0.3]) { b.box(xx, 0.12, 0, 0.18, 0.24, r * 2.2); for (const sg of [-1, 1]) b.beam(V(xx, 0.1, sg * r), V(xx, cy * 0.6, sg * r * 1.1), 0.14, 0.14); }
    if (out.mills.length < 6) { b.set(MAT.WOOD, TIMBER, s + 7); b.beam(V(0.3, cy + r * 1.1, 0), V(0.3, cy + r + 1.7, 0), 0.1, 0.1); out.mills.push({ p: b.world(0.3, cy + r + 1.7, 0.1), yaw }); }
    H.port = (sx) => b.world(sx * (L / 2 + 0.3), 0, 0);
    light(0, cy, r * 1.22 + 1.2);
  } else if (k === "dome") {
    b.set(MAT.WOOD, TIMBER, s); b.lathe([[H.rad + 0.3, 0], [0, 0]], 24); b.lathe([[H.rad + 0.3, -0.25], [H.rad + 0.3, 0]], 24);
    b.set(MAT.PLANK, [0.8, 0.78, 0.72], s); b.lathe([[H.rad, 0], [H.rad, 0.55]], 24);
    b.set(MAT.GLASS, [1, 1, 1], s + 1); b.lathe(Array.from({ length: 10 }, (_, q) => { const f = q / 9 * Math.PI / 2; return [Math.max(0.04, H.rad * Math.cos(f)), 0.55 + H.rad * Math.sin(f) * 1.08]; }), 20, { uR: H.rad });
    b.set(MAT.METAL, COPPER, s + 2, 0.8); b.push(new THREE.Matrix4().makeTranslation(0, 0.55 + H.rad * 1.08 - 0.05, 0)); b.lathe([[0.15, 0], [0.18, 0.12], [0.05, 0.35], [0.02, 0.6]], 10); b.pop();
    H.port = (sx) => b.world(sx * (H.rad + 0.3), 0, 0);
    light(0, 1.3, 0, 5.5, [0.6, 1.0, 0.45]);
  }
  return H;
}

function city(b, sb, out, ti, o) {
  const T = TREES[ti], R = rng(o.seed), occ = out.occ, houses = [], TIERS = o.tiers, yLo = TIERS[0], yHi = TIERS[TIERS.length - 1];
  const fits = (x, z, r, y0, y1, skip = null, tag = null) => occ.every((o) => o === skip || (tag && o.tag === tag) || y1 < o.y0 || y0 > o.y1 || Math.hypot(x - o.x, z - o.z) > r + o.r);
  const claim = (x, z, r, y0, y1, tag = null) => { const o = { x, z, r, y0, y1, tag }; occ.push(o); return o; };
  const F = FOLIAGE[ti];
  const green = (s) => { const look = s.drape ? F.drape(R) : F.leaf(R); if (!s.drape && s.cell === 3) look.cell = 3; out.clumps.push({ p: s.p, s: s.s, seed: R(), ...look, drape: s.drape }); };
  const sr = (y) => tRad(T, y) * 1.06 + 1.3;                       // everything keeps this far from the trunk's axis: the stair runs inside
  const axisD = (x, z, y) => { const [ax, az] = tAxis(T, y); return Math.hypot(x - ax, z - az); };
  const KINDS_LO = ["gable", "gable", "gable", "shed", "thatch", "aframe", "barrel", "witch", "gable", "shed"];
  const KINDS_HI = ["gable", "witch", "witch", "tower", "shed", "onion", "gable", "aframe", "dome", "thatch"];
  STYLE = o.style;
  const kindAt = (y) => pick(R, y < (yLo + yHi) / 2 ? o.style?.lo ?? KINDS_LO : o.style?.hi ?? KINDS_HI);

  // a great limb from the trunk at height y toward angle a, its reach claimed so nothing is built through it
  const makeLimb = (y, a, len, rise, i, wig = 1.5, high = 0.1) => {
    const [ax, az] = tAxis(T, y), d = V(Math.sin(a), 0, Math.cos(a)), r0 = tRad(T, y) * 0.24;
    const P = (t) => V(ax, y, az).addScaledVector(d, tRad(T, y) * 0.7 + len * t).add(V(0, rise * t * t - 0.8 * Math.sin(t * Math.PI), 0)).add(V(-d.z, 0, d.x).multiplyScalar(Math.sin(t * 2.2) * wig * (i % 2 ? 1 : -1)));
    const rr = (t) => r0 * (1 - 0.65 * t);
    b.room(0, 0, 0); bark(b, T, 300 + i, TAU * r0); b.tube(Array.from({ length: 13 }, (_, k) => P(k / 12)), rr, 10);
    for (let t = 0.12; t <= 1; t += 0.06) { const p = P(t); claim(p.x, p.z, rr(t) + 0.35, p.y - rr(t) - 0.3, p.y + rr(t) + high, "limb" + ti + ":" + i); }
    // side branches with leaves, and greenery hanging along it
    for (let k = 0; k < 4; k++) {
      const t0 = 0.3 + k * 0.17 + R() * 0.08, p0 = P(t0), sa = a + (k % 2 ? 1 : -1) * (0.6 + R() * 0.6), sd = V(Math.sin(sa), 0, Math.cos(sa)), sl = 4 + R() * 4;
      const sp = Array.from({ length: 5 }, (_, q) => p0.clone().addScaledVector(sd, sl * q / 4).add(V(0, sl * 0.5 * (q / 4) ** 1.4, 0)));
      bark(b, T, 320 + i * 10 + k, TAU * rr(t0) * 0.4); b.tube(sp, (t) => rr(t0) * 0.42 * (1 - 0.8 * t), 6);
      green({ p: sp[4], s: 2.4 + R() }); green({ p: sp[2].clone().add(V(0, 0.8, 0)), s: 1.8 + R() * 0.6 });
    }
    for (let k = 0; k < 6; k++) green({ p: P(0.2 + R() * 0.8).add(V(0, -rr(0.5) * 0.8, 0)), s: 1.4 + R() * 1.2, drape: true, cell: R() < 0.5 ? 2 : 3 });
    return { P, rr, a, y, i };
  };
  // first the limbs that reach for the neighbouring trees: a plank walk along the top, a platform at the tip
  o.connectors.forEach((c, ci) => {
    const y0 = c.y - 3, len = c.reach - tRad(T, y0) * 0.7, L = makeLimb(y0, c.a, len, 3, 50 + ci, 0, 1.8);
    const tip = L.P(1), yP = tip.y + L.rr(1) + 0.1;
    // the plank walk, with a rope rail on one side and lanterns along it
    const side = V(Math.cos(c.a), 0, -Math.sin(c.a)), rail = [];
    b.room(0, 0, 0);
    for (let t = 0.1, k = 0; t <= 0.93; t += 0.33 / len, k++) {
      const p = L.P(t).add(V(0, L.rr(t) + 0.03, 0)), q = L.P(Math.min(1, t + 0.01)).add(V(0, L.rr(Math.min(1, t + 0.01)) + 0.03, 0)), T2 = V().subVectors(q, p).normalize();
      const up = V().crossVectors(T2, side).normalize();
      b.push(new THREE.Matrix4().makeBasis(side, up, T2).setPosition(p)); b.set(MAT.WOOD, [0.42 + h1(k) * 0.1, 0.33, 0.24], 2000 + k); b.box(0, 0, 0, 0.8, 0.05, 0.24); b.pop();
      if (k % 6 === 0) { const r0 = p.clone().addScaledVector(side, 0.42); b.set(MAT.WOOD, TIMBER, 2000); b.beam(r0.clone().add(V(0, -0.15, 0)), r0.clone().add(V(0, 1.0, 0)), 0.07, 0.07); rail.push(r0.clone().add(V(0, 0.98, 0))); if (k % 18 === 0) lantern(sb, r0.clone().add(V(0, 1.02, 0)), 0.1, [1.0, 0.62, 0.32], 4, 2100 + k + ci * 100, 1); }
    }
    b.set(MAT.ROPE, [0.5, 0.42, 0.3], 2001); if (rail.length > 1) b.tube(rail, 0.025, 4);
    stringLights(out, rail, 0.5, ci + 2);
    const pts = poly(tip.x, yP, tip.z, Array.from({ length: 9 }, () => 2.8 + R() * 0.5), R());
    c.end = edgeAt(pts, tip.x, tip.z, c.a); c.tip = tip; c.yP = yP;
    b.room(0, 0, 0); deck(b, pts, [c.end, edgeAt(pts, tip.x, tip.z, c.a + Math.PI)], 2200 + ci);
    for (const p of [pts[1], pts[4], pts[7]]) b.beam(p.clone().lerp(tip, 0.25).add(V(0, -0.2, 0)), tip.clone().add(V(0, -L.rr(1) * 0.3, 0)), 0.14, 0.14);
    claim(tip.x, tip.z, 3.4, yP - 1, yP + 4.5);
    const lp = c.end.clone().lerp(tip.clone().setY(yP), 0.35).addScaledVector(side, 0.8);        // a lamp post on the deck by the landing
    b.set(MAT.WOOD, TIMBER, 2301); b.beam(lp, lp.clone().add(V(0, 2.45, 0)), 0.12, 0.12);
    lantern(sb, lp.clone().add(V(0, 2.4, 0)), 0.3, [1.0, 0.65, 0.35], 6, 2300 + ci);
    out.lights.push({ p: lp.clone().add(V(0, 1.8, 0)), c: WARM, i: 4, s: 1 });
    if (c.cable) {                              // the cable car's station: a pylon with the wheel the cable runs over
      const base = tip.clone().setY(yP).addScaledVector(side, -1.1);
      b.set(MAT.WOOD, TIMBER, 2310); b.beam(base, base.clone().add(V(0, 4.2, 0)), 0.22, 0.22); b.beam(base.clone().add(V(0, 1.5, 0)).addScaledVector(side, 1.1), base.clone().add(V(0, 3.9, 0)), 0.1, 0.1);
      const arm = side.clone().multiplyScalar(1.3);
      b.beam(base.clone().add(V(0, 4.0, 0)).sub(arm), base.clone().add(V(0, 4.0, 0)).add(arm), 0.16, 0.2);
      b.set(MAT.METAL, IRON, 2311, 0.1);
      for (const sg of [-1, 1]) { const w = base.clone().add(V(0, 4.25, 0)).addScaledVector(side, sg * 1.15); b.push(new THREE.Matrix4().makeTranslation(w.x, w.y, w.z).multiply(new THREE.Matrix4().makeRotationY(c.a + Math.PI / 2)).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2))); b.lathe([[0.4, -0.05], [0.42, 0], [0.4, 0.05]], 16); b.pop(); }
      c.top = base.clone().add(V(0, 4.25, 0));
    } else if (R() < 0.7) {                     // a gatehouse beside the landing
      const H = planHouse(R, pick(R, ["witch", "shed", "tower", "gable"]), 0.62), hp = tip.clone().addScaledVector(side, (R() < 0.5 ? -1 : 1) * 1.15).add(V(Math.sin(c.a), 0, Math.cos(c.a)).multiplyScalar(-0.5));
      buildHouse(b, sb, out, H, hp.x, yP, hp.z, c.a + Math.PI / 2 + (R() - 0.5) * 0.4);
      H.level = 2; houses.push(H);
    }
    c.limb = L;
  });
  // then the great limbs, away from the ones reaching for the neighbours
  const limbs = [];
  for (let tries = 0; limbs.length < o.nLimbs && tries < 300; tries++) {
    const y = lerp(yLo + 3, yHi - 2, (limbs.length + R() * 0.6) / o.nLimbs), a = R() * TAU;
    if (o.connectors.some((c) => Math.abs(Math.atan2(Math.sin(a - c.a), Math.cos(a - c.a))) < 0.8 && Math.abs(c.y - y) < 12)) continue;
    if (limbs.some((l) => Math.abs(Math.atan2(Math.sin(a - l.a), Math.cos(a - l.a))) < 0.6 && Math.abs(l.y - y) < 9)) continue;
    limbs.push(makeLimb(y, a, (17 + R() * 4) * T.r / 5.4 + 2, 3 + R() * 2.5, limbs.length));
  }

  // platforms round the trunk in broken arcs, one ring of them per level
  const segs = [];
  TIERS.forEach((y0, ti) => {
    let a = ti * 2.4 + R() * 0.5;
    const n = ti === TIERS.length - 1 ? 3 : 4 + (R() < 0.5 ? 1 : 0), end = a + TAU - 0.3;
    for (let k = 0; k < n && a < end; k++) {
      const span = Math.min(end - a, (TAU - 0.45 * n) / n * (0.6 + R() * 0.7)), y = y0 + (R() - 0.5) * 2.0;
      const rIn = sr(y), dep = 4.4 + R() * 2.4, ph = R() * 9;
      const rOut = (aa) => rIn + dep + 0.9 * Math.sin(aa * 3 + ph) + 0.5 * Math.sin(aa * 7 + ph * 2);
      segs.push({ y, a0: a, a1: a + span, rIn, rOut, dep, ti });
      a += span + 0.25 + R() * 0.45;
    }
  });
  for (const g of segs) {
    const n = Math.max(4, Math.round((g.a1 - g.a0) * (g.rIn + 3) / 1.2)), y = g.y, t = 0.24, I = [], O = [];
    for (let i = 0; i <= n; i++) { const a = lerp(g.a0, g.a1, i / n); I.push(at(T, a, g.rIn, y)); O.push(at(T, a, g.rOut(a), y)); }
    b.room(0, 0, 0); b.set(MAT.DECK, [0.5, 0.42, 0.34], 400 + segs.indexOf(g));
    const uvq = (ps) => ps.map((p) => [p.x, p.z]);
    for (let i = 0; i < n; i++) {
      const q = [I[i], O[i], O[i + 1], I[i + 1]];
      b.quad(...q, uvq(q));
      const dn = q.map((p) => p.clone().setY(y - t));
      b.quad(dn[3], dn[2], dn[1], dn[0], uvq([dn[3], dn[2], dn[1], dn[0]]));
    }
    b.set(MAT.WOOD, TIMBER, 400);
    for (let i = 0; i < n; i++) {
      b.quad(O[i].clone().setY(y - t), O[i + 1].clone().setY(y - t), O[i + 1], O[i]);
      b.quad(I[i + 1].clone().setY(y - t), I[i].clone().setY(y - t), I[i], I[i + 1]);
      if (i % 2 === 0) { b.beam(I[i].clone().setY(y - t - 0.1), O[i].clone().setY(y - t - 0.1), 0.16, 0.22); brace(b, T, O[i].x, y - t, O[i].z, 3.8 + R(), 401 + i); }
    }
    b.quad(I[0].clone().setY(y - t), O[0].clone().setY(y - t), O[0], I[0]);
    b.quad(O[n].clone().setY(y - t), I[n].clone().setY(y - t), I[n], O[n]);
    g.O = O; g.gaps = [];
    for (let i = 0; i <= n; i += 2) claim(lerp(I[i].x, O[i].x, 0.5), lerp(I[i].z, O[i].z, 0.5), g.dep * 0.5 + 0.3, y - t - 0.35, y + 0.02, "deck");
  }

  // houses along the platforms, close together, a few hanging out over the edge
  for (const g of segs) {
    let a = g.a0 + 0.03;
    const top = g.ti === TIERS.length - 1 && !segs.some((s) => s !== g && s.ti === g.ti && s.placedOnion);
    let first = true;
    while (a < g.a1) {
      const kind = top && first ? "onion" : kindAt(g.y), H = planHouse(R, kind);
      const over = R() < 0.25 ? g.dep * 0.5 + R() * 1.2 : R() * 0.6, rm = g.rIn + H.r * 0.95 + over;
      const wa = (2 * H.r * 0.92) / rm, ac = a + wa / 2;
      if (ac + wa / 2 > g.a1 + 0.05) break;
      const p = at(T, ac, rm, g.y);
      if (fits(p.x, p.z, H.r * 0.92, g.y + 0.03, g.y + H.top * 0.85) && axisD(p.x, p.z, g.y) - H.r * 0.95 >= sr(g.y) - 0.1) {
        H.claim = claim(p.x, p.z, H.r * 0.92, g.y + 0.03, g.y + (H.stack ?? H.top * 0.85));
        buildHouse(b, sb, out, H, p.x, g.y, p.z, ac + (kind === "barrel" ? Math.PI / 2 : 0) + (R() - 0.5) * 0.7);
        if (rm + H.r > g.rOut(ac) + 0.3) { b.room(0, 0, 0); for (const s of [-1, 1]) { const q = at(T, ac + s * wa * 0.3, rm + H.r * 0.6, g.y - 0.25); brace(b, T, q.x, q.y, q.z, 4.5, H.seed + s); } }
        H.level = 0; houses.push(H);
        if (kind === "onion") g.placedOnion = true;
        first = false;
        a += wa + (0.05 + R() * 0.45) / rm;
      } else a += 0.6 / rm;
    }
  }

  // houses out on the limbs, on little platforms, and pods hanging under them
  limbs.forEach((L, li) => {
    for (const t of [0.48, 0.74, 0.97]) {
      const c = L.P(t), H = planHouse(R, pick(R, ["gable", "shed", "witch", "thatch", "aframe", "barrel", "tower", "gable", "dome"]), 0.85);
      const y = c.y + L.rr(t) + 0.12;
      if (axisD(c.x, c.z, y) - H.r < sr(y) + 0.5 || !fits(c.x, c.z, H.r + 0.3, y + 0.02, y + H.top * 0.85, null, "limb" + ti + ":" + L.i)) continue;
      H.claim = claim(c.x, c.z, H.r + 0.3, y - L.rr(t), y + (H.stack ?? H.top * 0.85));
      const pts = poly(c.x, y, c.z, Array.from({ length: 8 }, () => H.r + 0.5 + R() * 0.4), R());
      b.room(0, 0, 0); deck(b, pts, [], 600 + li);
      for (const p of [pts[0], pts[2], pts[4], pts[6]]) b.beam(p.clone().lerp(c, 0.3).add(V(0, -0.2, 0)), c.clone().add(V(0, -L.rr(t) * 0.3, 0)), 0.14, 0.14);
      buildHouse(b, sb, out, H, c.x, y, c.z, L.a + (R() - 0.5) * 1.2 + (H.kind === "barrel" ? Math.PI / 2 : 0));
      H.level = 0; H.deck = pts; houses.push(H);
    }
    if (R() < 0.6) {      // a pod on ropes under the limb
      const t = 0.62 + R() * 0.2, c = L.P(t), pv = c.clone().add(V(0, -L.rr(t), 0)), drop = 5 + R() * 2, base = pv.y - drop - 3.45;
      if (fits(pv.x, pv.z, 1.6, base - 0.3, pv.y - 0.5)) {
        claim(pv.x, pv.z, 1.6, base - 0.3, base + 3.5);
        const lav = pick(R, [[0.58, 0.52, 0.76], [0.8, 0.62, 0.5], [0.5, 0.62, 0.6], [0.75, 0.5, 0.55]]), s = 700 + li * 10 + ti * 100;
        sb.st.piv = [pv.x, pv.y, pv.z, 0.014];
        sb.room(pv.x, base, pv.z, R() * TAU);
        sb.set(MAT.SCALE, lav, s); sb.lathe([[0.12, 0], [0.7, 0.25], [1.25, 0.9], [1.45, 1.6], [1.35, 2.3], [0.95, 2.95], [0.35, 3.35], [0.05, 3.45]], 28);
        sb.set(MAT.WOOD, TRIM, s); sb.lathe([[1.49, 1.0], [1.5, 1.1]], 28);
        for (const th of [0.4, 2.3, 4.2]) { const n = V(Math.sin(th), 0, Math.cos(th)); sb.push(wallFrame(n.clone().multiplyScalar(1.47), n)); windowAt(sb, -0.31, 1.3, 0.62, 0.62, 1, s + th * 3); sb.pop(); }
        sb.push(wallFrame(V(0, 0, -1.43), V(0, 0, -1))); doorAt(sb, -0.33, 0.66, 1.35, pick(R, DOORS), s + 1); sb.pop();
        sb.set(MAT.DECK, [0.5, 0.42, 0.34], s); sb.box(0, -0.05, -1.75, 1.3, 0.12, 0.9);
        railing(sb, [V(-0.65, 0, -1.4), V(-0.65, 0, -2.2), V(0.65, 0, -2.2), V(0.65, 0, -1.4)], false, [V(0, 0, -2.2)], TIMBER, s, 0.75);
        sb.set(MAT.METAL, COPPER, s, 0.7); sb.push(new THREE.Matrix4().makeTranslation(0, 3.4, 0)); sb.lathe([[0.1, 0], [0.12, 0.15], [0.03, 0.4]], 8); sb.pop();
        sb.set(MAT.ROPE, [0.45, 0.38, 0.28], s);
        for (let q = 0; q < 3; q++) { const a = q * TAU / 3; sb.tube([V(Math.sin(a) * 0.32, 3.3, Math.cos(a) * 0.32), V(0, pv.y - base, 0)], 0.025, 4); }
        out.lights.push({ p: sb.world(0, 1.6, -2.4), c: [1.0, 0.55, 0.6], i: 4, s: 1 });
        lantern(sb, sb.world(0.5, 1.75, -1.75), 0.1, [1.0, 0.5, 0.6], 5, s + 2, 1);
        sb.st.piv = [0, 0, 0, 0];
      }
    }
  });

  // houses perched on brackets straight off the trunk, between the platforms
  for (let k = 0, placed = 0; k < o.perched * 20 && placed < o.perched; k++) {
    const y = yLo + 1 + R() * (yHi - yLo + 3), a = R() * TAU, H = planHouse(R, pick(R, ["gable", "shed", "witch", "tower", "barrel", "gable", "onion"]), 0.85);
    const rm = sr(y) + H.r * 0.95, p = at(T, a, rm, y);
    if (!fits(p.x, p.z, H.r * 0.95, y - 0.9, y + H.top * 0.85)) continue;
    H.claim = claim(p.x, p.z, H.r * 0.95, y - 0.9, y + (H.stack ?? H.top * 0.85));
    buildHouse(b, sb, out, H, p.x, y, p.z, a + (H.kind === "barrel" ? Math.PI / 2 : 0) + (R() - 0.5) * 0.5);
    b.room(0, 0, 0);
    for (const sg of [-1, 0, 1]) { const q = at(T, a + sg * H.r * 0.6 / rm, rm + H.r * 0.4, y - 0.26); brace(b, T, q.x, q.y, q.z, 2.8 + R(), H.seed + sg); }
    const wr = rm + H.wall * 0.97, span = Math.min(H.r * 1.6, 3.2) / (wr + 0.5);
    const bm = [at(T, a - span / 2, wr + 0.45, y - 0.1), at(T, a + span / 2, wr + 0.45, y - 0.1)];
    b.set(MAT.DECK, [0.5, 0.42, 0.34], H.seed); b.beam(bm[0], bm[1], 0.9, 0.18);
    railing(b, Array.from({ length: 6 }, (_, i) => at(T, a + (i / 5 - 0.5) * span, wr + 0.85, y)), false, [], TIMBER, H.seed, 0.9);
    H.level = 0; houses.push(H); placed++;
  }

  // rooms stacked on the roofs, each turned on the one below
  for (let i = 0; i < houses.length; i++) {
    const L = houses[i];
    if (L.stack == null || L.level >= 2 || R() > (L.level ? 0.55 : 0.85)) continue;
    const H = planHouse(R, pick(R, ["gable", "shed", "witch", "tower", "gable", "witch", "onion", "shed"]), 0.78 - L.level * 0.08);
    const y = L.y + L.stack + 0.35, oa = R() * TAU, od = 0.4 + R() * 1.3, x = L.x + Math.sin(oa) * od, z = L.z + Math.cos(oa) * od;
    if (axisD(x, z, y) - H.r < sr(y) - 0.2 || !fits(x, z, H.r * 0.9, y, y + H.top * 0.85, L.claim)) continue;
    H.claim = claim(x, z, H.r * 0.9, y, y + (H.stack ?? H.top * 0.85));
    buildHouse(b, sb, out, H, x, y, z, L.yaw + (R() < 0.5 ? -1 : 1) * (0.3 + R() * 0.7));
    b.room(x, y, z, H.yaw); b.set(MAT.WOOD, TIMBER, H.seed);
    const hw = H.r * 0.5;
    for (const [px, pz] of [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]]) b.box(px, -0.25 - 0.7, pz, 0.14, 1.4, 0.14);
    H.level = L.level + 1; H.below = L; houses.push(H);
  }

  // rope bridges between houses at like heights, where the way is clear
  const linked = new Set();
  let nb = 0;
  const clear = (A, B, a, c) => {
    for (let k = 1; k < 10; k++) {
      const p = A.clone().lerp(B, k / 10);
      if (axisD(p.x, p.z, p.y) < tRad(T, p.y) + 0.9) return false;
      for (const o of occ) if (o !== a && o !== c && o.tag !== "deck" && p.y > o.y0 - 1.3 && p.y < o.y1 + 0.2 && Math.hypot(p.x - o.x, p.z - o.z) < o.r - 0.1) return false;
    }
    return true;
  };
  for (let i = 0; i < houses.length && nb < o.bridges; i++) {
    const A = houses[i];
    const cand = houses.map((B, j) => ({ B, j, d: Math.hypot(A.x - B.x, A.z - B.z) })).filter(({ B, j, d }) => j !== i && Math.abs(A.y - B.y) < 2.6 && d > A.r + B.r + 1.5 && d < A.r + B.r + 9 && !linked.has(Math.min(i, j) + ":" + Math.max(i, j))).sort((p, q) => p.d - q.d);
    for (const { B, j } of cand.slice(0, 2)) {
      const ab = V(B.x - A.x, 0, B.z - A.z).normalize();
      const pa = V(A.x, A.y, A.z).addScaledVector(ab, A.r * 0.85), pb = V(B.x, B.y, B.z).addScaledVector(ab, -B.r * 0.85);
      if (!clear(pa, pb, A.claim, B.claim)) continue;
      linked.add(Math.min(i, j) + ":" + Math.max(i, j));
      b.room(0, 0, 0);
      const br = bridge(b, pa, pb, 0.25 + pa.distanceTo(pb) * 0.05, 800 + nb + ti * 100);
      if (nb % 2 === 0) stringLights(out, Array.from({ length: 21 }, (_, k) => br.rail(k / 20, 1).add(V(0, 0.04, 0))), 0.5, nb % 4 ? 3 + nb : 0);
      nb++;
      break;
    }
  }
  out.bridges += nb;

  // the spiral stair round the trunk, from the lowest platform to the highest
  {
    const y0 = TIERS[0] - 0.9, y1 = TIERS[TIERS.length - 1] + 0.6, turns = 4.3, N = Math.round(turns * 34), rail = [];
    b.room(0, 0, 0);
    for (let i = 0; i <= N; i++) {
      const t = i / N, y = lerp(y0, y1, t), a = 0.4 + turns * TAU * t, [ax, az] = tAxis(T, y), ri = tRad(T, y) * 0.98;
      const d = V(Math.sin(a), 0, Math.cos(a)), p = V(ax, y, az).addScaledVector(d, ri + 0.6);
      b.push(new THREE.Matrix4().makeBasis(d, UP, V(-Math.cos(a), 0, Math.sin(a))).setPosition(p));
      b.set(MAT.WOOD, [0.45, 0.35, 0.25], 900 + i); b.box(0, 0, 0, 1.15, 0.06, 0.36); b.pop();
      b.set(MAT.WOOD, TIMBER, 900); b.beam(p.clone().addScaledVector(d, 0.5).add(V(0, -0.04, 0)), V(ax, y - 0.8, az).addScaledVector(d, ri * 0.97), 0.06, 0.06);
      if (i % 3 === 0) { const q = p.clone().addScaledVector(d, 0.52); b.beam(q, q.clone().add(V(0, 0.95, 0)), 0.06, 0.06); rail.push(q.clone().add(V(0, 0.95, 0))); }
      if (i % 11 === 0) lantern(sb, V(ax, y + 2.2, az).addScaledVector(d, ri + 0.15), 0.2, [1.0, 0.62, 0.32], 4, 950 + i + ti * 1000, 1);
    }
    b.set(MAT.ROPE, [0.5, 0.42, 0.3], 901); b.tube(rail, 0.03, 5);
  }

  lifts(b, out, T, R, segs, fits, claim, o.lifts ?? 1);
  waterworks(b, out, T, R, segs, fits, claim, ti === 0 ? 2 : 1);
  // lights strung along the platform rails, lanterns at the platform ends, fungus on the bark below
  // (railings, the pulley, bunting and the like are given in world coordinates: reset the builder's frame first,
  // or they inherit the last house's or fungus's and end up hanging in the sky)
  b.room(0, 0, 0);
  segs.forEach((g, i) => {
    railing(b, g.O, false, g.gaps, TIMBER, 1000 + i);
    if (i % 2 === 0) stringLights(out, g.O.map((p) => p.clone().add(V(0, 1.03, 0))), 0.5, i % 4 ? 2 + i : 0);
    lantern(sb, g.O[0].clone().add(V(0, 1.05, 0)), 0.12, [1.0, 0.65, 0.35], 5, 1100 + i);
    out.launch.push(g.O[Math.floor(g.O.length / 2)].clone().lerp(at(T, (g.a0 + g.a1) / 2, g.rIn, g.y), 0.3));
  });
  b.room(0, 0, 0);
  for (let k = 0; k < TIERS.length; k++) fungus(b, T, TIERS[k] - 5, k * 2.1 + 0.3 + ti, 6, pick(R, [[0.25, 0.95, 0.85], [0.45, 0.75, 1.0], [0.55, 0.5, 1.0], [0.3, 1.0, 0.7]]), 1200 + k * 10 + ti * 100);
  out.lights.push({ p: at(T, 0.3 + ti, tRad(T, yLo - 5) + 1.3, yLo - 5), c: [0.3, 1.0, 0.9], i: 2.2, s: 0.8 });

  // a rope ladder from the lowest platform down into the mist, and a basket on a pulley
  b.room(0, 0, 0);
  const low = segs.filter((g) => g.ti === 0);
  if (low.length) {
    const g = low[0], [ax, az] = tAxis(T, g.y), m = g.O[Math.floor(g.O.length * 0.7)], q = g.O[Math.floor(g.O.length * 0.3)];
    const aq = Math.atan2(q.x - ax, q.z - az), dv = q.clone().lerp(V(ax, g.y, az), 0.05), arm = dv.clone().add(V(Math.sin(aq) * 1.3, 2.3, Math.cos(aq) * 1.3));
    b.set(MAT.WOOD, TIMBER, 1301); b.beam(dv, dv.clone().add(V(0, 2.5, 0)), 0.14, 0.14); b.beam(dv.clone().add(V(0, 2.35, 0)), arm.clone().add(V(Math.sin(aq) * 0.15, 0, Math.cos(aq) * 0.15)), 0.12, 0.12);
    b.beam(dv.clone().add(V(0, 1.4, 0)), dv.clone().add(V(Math.sin(aq) * 0.9, 2.35, Math.cos(aq) * 0.9)), 0.08, 0.08);
    b.set(MAT.ROPE, [0.5, 0.42, 0.3], 1302); b.tube([arm.clone().add(V(0, -0.2, 0)), arm.clone().setY(0.5)], 0.016, 4);
    out.baskets.push({ top: arm.clone().add(V(0, -0.3, 0)), ph: R() });
  }
  // bunting between a few neighbours
  b.room(0, 0, 0);
  for (let i = 0, n = 0; i < houses.length && n < 6; i += 7) {
    const A = houses[i], B = houses.find((h) => h !== A && Math.abs(h.y + h.top - A.y - A.top) < 3 && Math.hypot(h.x - A.x, h.z - A.z) < 9 && Math.hypot(h.x - A.x, h.z - A.z) > 3);
    if (!B) continue;
    bunting(b, V(A.x, A.y + A.top * 0.8, A.z), V(B.x, B.y + B.top * 0.8, B.z), 0.6, 1400 + i); n++;
  }
  // leafy branches growing out of the trunk between the houses, wherever there is room
  for (let k = 0, made = 0; k < o.branches * 14 && made < o.branches; k++) {
    const y = yLo - 4 + R() * (yHi - yLo + 8), a = R() * TAU, [ax, az] = tAxis(T, y), d = V(Math.sin(a), 0, Math.cos(a)), len = 6 + R() * 6, rise = 2 + R() * 4, r0 = 0.28 + R() * 0.18;
    const P = (t) => V(ax, y, az).addScaledVector(d, tRad(T, y) * 0.8 + len * t).add(V(0, rise * t * t, 0)).add(V(-d.z, 0, d.x).multiplyScalar(Math.sin(t * 3 + k) * 0.8));
    let ok = true;
    for (let t = 0.25; t <= 0.8 && ok; t += 0.11) { const p = P(t); ok = occ.every((o) => p.y < o.y0 - 0.3 || p.y > o.y1 + 0.3 || Math.hypot(p.x - o.x, p.z - o.z) > o.r + 0.15); }
    if (!ok) continue;
    b.room(0, 0, 0); bark(b, T, 1600 + k, TAU * r0); b.tube(Array.from({ length: 7 }, (_, q) => P(q / 6)), (t) => r0 * (1 - 0.8 * t), 6);
    for (let q = 0; q < 5; q++) green({ p: P(0.45 + q * 0.14).add(V((R() - 0.5) * 2, 0.4 + R(), (R() - 0.5) * 2)), s: 1.8 + R() * 1.4, cell: R() < 0.2 ? 1 : 0 });
    if (R() < 0.6) green({ p: P(0.7), s: 1.6 + R(), drape: true, cell: R() < 0.5 ? 2 : 3 });
    made++;
  }
  // leaves crowding round every house: at its sides and back and over its roof, leaving the front and its windows clear
  for (const h of houses) {
    if (R() > (F.around ?? 1)) continue;
    const n = 2 + Math.floor(R() * 3);
    for (let q = 0; q < n; q++) {
      const th = h.yaw + Math.PI + (R() < 0.5 ? -1 : 1) * (0.3 + R() * 1.9), rr = h.r * (0.75 + R() * 0.35) + 0.3;
      const top = h.top ?? 3, y = h.y + (q === 0 ? top * (0.85 + R() * 0.3) : top * (0.35 + R() * 0.7));
      green({ p: V(h.x + Math.sin(th) * rr, y, h.z + Math.cos(th) * rr), s: 1.4 + R() * 1.2, cell: R() < 0.15 ? 1 : 0 });
    }
    if (R() < 0.45) { const th = h.yaw + Math.PI + (R() - 0.5) * 2.5; green({ p: V(h.x + Math.sin(th) * h.r * 0.9, h.y - 0.2, h.z + Math.cos(th) * h.r * 0.9), s: 1.4 + R() * 1.4, drape: true, cell: R() < 0.5 ? 2 : 3 }); }
  }
  // ivy hanging in curtains from the platform edges
  for (const g of segs) for (let i = 1; i < g.O.length; i += 2) if (R() < 0.55) green({ p: g.O[i].clone().add(V(0, -0.15, 0)), s: 1.4 + R() * 1.6, drape: true, cell: 3 });
  for (const h of houses) if (h.deck && R() < 0.8) green({ p: h.deck[Math.floor(R() * h.deck.length)].clone().add(V(0, -0.15, 0)), s: 1.5 + R() * 1.4, drape: true, cell: R() < 0.5 ? 2 : 3 });

  // ivy and ferns on the bark, plants in tubs on the platforms
  for (let k = 0, n = Math.round(140 * F.ivy * (yHi - yLo + 10) / 49); k < n; k++) {
    const y = 4 + R() * (yHi + 4), a = R() * TAU;
    green({ p: at(T, a, tRad(T, y) * 1.02, y), s: 1.3 + R() * 1.6, cell: R() < 0.5 ? 3 : 0, drape: R() < 0.35 });
  }
  for (const g of segs) for (let k = 0; k < 3; k++) {
    const a = lerp(g.a0, g.a1, R()), p = at(T, a, g.rOut(a) - 0.5, g.y);
    if (!fits(p.x, p.z, 0.5, g.y + 0.05, g.y + 1.5)) continue;
    b.room(p.x, g.y, p.z, 0); b.set(MAT.PLANK, [0.45, 0.32, 0.22], 1500 + k); b.lathe([[0.3, 0], [0.38, 0.45], [0, 0.45]], 10);
    out.flowers.push({ p: p.clone().add(V(0, 0.75, 0)), s: 0.5 + R() * 0.3, seed: R() });
  }
  details(b, sb, out, T, R, houses, segs, limbs, fits, claim, green);
  out.houses += houses.length;
}

// lifts from the forest floor up to the low platforms: a timber tower beside the platform's edge with a pulley on top;
// the cage and its counterweight are moving parts (out.lifts)
function lifts(b, out, T, R, segs, fits, claim, n) {
  const cand = segs.filter((g) => g.ti <= 1 && g.a1 - g.a0 > 0.5).sort((p, q) => p.ti - q.ti || R() - 0.5);
  let made = 0;
  for (const g of cand) {
    if (made >= n) break;
    for (let k = 0; k < 6; k++) {
      const a = lerp(g.a0 + 0.15, g.a1 - 0.15, R()), rL = g.rOut(a) + 1.4, c = at(T, a, rL, g.y), top = g.y;
      if (!fits(c.x, c.z, 1.5, -1, top + 3.6)) continue;
      claim(c.x, c.z, 1.5, -1, top + 3.6);
      const hw = 1.05, H = top + 3.3, yaw = a;
      b.room(c.x, 0, c.z, yaw); b.set(MAT.WOOD, TIMBER, 3300 + made);
      const cs = [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]];
      for (const [x, z] of cs) b.beam(V(x, -1, z), V(x, H, z), 0.2, 0.2);
      for (let y = 3; y < H; y += 3) {
        for (let i = 0; i < 4; i++) { const [x0, z0] = cs[i], [x1, z1] = cs[(i + 1) % 4]; b.beam(V(x0, y, z0), V(x1, y, z1), 0.12, 0.12); }
        if (y + 3 < H) for (const sx of [-1, 1]) b.beam(V(sx * hw, y, -hw), V(sx * hw, y + 3, hw), 0.08, 0.08);
      }
      b.beam(V(-hw - 0.2, H, 0), V(hw + 0.6, H, 0), 0.16, 0.2); b.beam(V(0, H, -hw - 0.1), V(0, H, hw + 0.1), 0.14, 0.18);
      b.set(MAT.METAL, IRON, 3310, 0.1);
      b.push(new THREE.Matrix4().makeTranslation(0.35, H + 0.35, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))); b.lathe([[0.42, -0.05], [0.45, 0], [0.42, 0.05]], 16); b.pop();
      // the landing from the platform's edge to the cage, and a gap in the railing for it
      b.set(MAT.DECK, [0.5, 0.42, 0.34], 3320); b.box(0, top - 0.09, -hw - 0.35, 1.5, 0.18, 1.0);
      g.gaps.push(at(T, a, g.rOut(a), g.y));
      out.lifts.push({ x: c.x, z: c.z, yaw, y0: 0.4, y1: top, top: H + 0.35, ph: R() * 40 });
      out.lights.push({ p: at(T, a, rL, top + 2.0), c: WARM, i: 3, s: 1 });
      made++;
      break;
    }
  }
}

// water: a cistern high up, then a chain of legs down the tree. A leg is either a fall (a pipe out past the platform's
// edge, pouring into a tub on a shelf bracketed off a lower platform that reaches further out) or a run down the bark
// (a pipe under the platform in to the trunk, down the bark on brackets, out under a lower platform and over its
// edge, pouring into the next tub). The last leg falls all the way into the mist. The falling water and the tubs'
// surfaces go in out.wb (drawn with the water shader).
function waterworks(b, out, T, R, segs, fits, claim, n = 1) {
  const wb = out.wb;
  const deckFree = (x, z, r, y0, y1) => fits(x, z, r, y0, y1, null, "deck");
  const clearDrop = (x, z, yTop, yBot) => {          // nothing between a spout and where its water lands
    for (let y = yBot + 0.8; y < yTop - 0.2; y += 0.5) if (!fits(x, z, 0.35, y, y + 0.4)) return false;
    return true;
  };
  const clearPath = (pts) => pts.every((p) => fits(p.x, p.z, 0.2, p.y - 0.12, p.y + 0.12, null, "deck"));
  const inRange = (g, a, m = 0.05) => a > g.a0 + m && a < g.a1 - m;
  const lower = segs.slice().sort((p, q) => q.y - p.y);
  // a tub on a shelf off a lower platform, out beyond the edge of `gF` (the platform the water leaves) at angle aF
  const nextTub = (gF, aF, yFrom) => {
    for (const g of lower) {
      if (g.y > gF.y - 3 || g.y < gF.y - 18) continue;
      for (const da of [0, 0.08, -0.08, 0.16, -0.16, 0.25, -0.25, 0.35, -0.35]) {
        const a = aF + da;
        if (!inRange(g, a) || !inRange(gF, a, 0)) continue;
        const above = gF.rOut(a), rb = Math.max(g.rOut(a) + 0.7, above + 0.65);
        if (rb - g.rOut(a) > 1.9 || rb > above + 3.5) continue;
        // a lower platform reaching out past this one catches the water on its deck
        if (g.rOut(a) > above + 1.6) {
          const ro = above + 0.75, q = at(T, a, ro, g.y);
          if (deckFree(q.x, q.z, 0.8, g.y + 0.05, gF.y - 0.8) && clearDrop(q.x, q.z, yFrom, g.y)) return { g, a, r: ro, onDeck: true };
        }
        const p = at(T, a, rb, g.y);
        if (!deckFree(p.x, p.z, 0.8, g.y + 0.05, g.y + 1.0) || !clearDrop(p.x, p.z, yFrom, g.y)) continue;
        return { g, a, r: rb };
      }
    }
    return null;
  };
  // a run down the bark from a source on platform gS at angle aS, radius rS, to a lower platform; then out under it
  const barkRun = (gS, aS, rS) => {
    let mist = null;
    for (const g2 of lower) {
      if (g2.y > gS.y - 4) continue;
      for (const da of [0, 0.15, -0.15, 0.3, -0.3, 0.5, -0.5, 0.75, -0.75, 1.0, -1.0, 1.4, -1.4, 1.9, -1.9, 2.5, -2.5]) {
        const a2 = aS + da;
        if (!inRange(g2, a2, 0.1)) continue;
        const yA = gS.y - 0.6, yB = g2.y - 0.6, rTo = g2.rOut(a2) + 0.7, pts = [];
        pts.push(at(T, aS, rS, gS.y + 0.2), at(T, aS, rS, yA));
        for (let r = rS - 1; r > sr0(gS.y) + 0.2; r -= 1) pts.push(at(T, aS, r, yA));
        const nB = Math.ceil(Math.max((yA - yB) / 1.2, Math.abs(da) * tRad(T, yA) / 0.9));   // spiralling round the trunk as it goes down
        for (let k = 0; k < nB; k++) { const f = k / nB, y = lerp(yA, yB, f); pts.push(at(T, lerp(aS, a2, f), tRad(T, y) + 0.22, y)); }
        pts.push(at(T, a2, tRad(T, yB) + 0.22, yB));
        for (let r = sr0(g2.y) + 0.5; r < rTo; r += 1) pts.push(at(T, a2, r, yB));
        pts.push(at(T, a2, rTo, yB));
        const sp = at(T, a2, rTo, yB - 0.3);
        const nOut = pts.length - Math.max(1, Math.ceil(rTo - sr0(g2.y) - 0.5)) - 1;     // where the run out under g2 begins
        if (!clearPath(pts.slice(2, nOut))) continue;
        // (i) out under the platform and over its edge, into a tub further down or into the mist
        if (clearPath(pts.slice(nOut))) {
          const tub = nextTub(g2, a2, yB - 0.3);
          if (tub) return { g2, a2, pts, sp, tub };
          if (!mist && clearDrop(sp.x, sp.z, yB, 0.5)) mist = { g2, a2, pts, sp, tub: null };
        }
        // (ii) or stop just above the platform and pour into a tub standing on it by the trunk
        const rt = sr0(g2.y) + 0.85, t = at(T, a2, rt, g2.y), yS = g2.y + 1.7;
        if (deckFree(t.x, t.z, 0.75, g2.y + 0.05, g2.y + 1.9)) {
          const keep = pts.slice(0, pts.findIndex((p, i) => i > 1 && p.y < yS + 0.3));
          if (keep.length > 2) {
            const q = at(T, a2, tRad(T, yS) + 0.22, yS), qo = at(T, a2, rt, yS), sp2 = at(T, a2, rt, yS - 0.25);
            if (fits(sp2.x, sp2.z, 0.3, g2.y + 0.7, yS)) return { g2, a2, pts: [...keep, q, qo], sp: sp2, tub: { g: g2, a: a2, r: rt, onDeck: true } };
          }
        }
      }
    }
    return mist;
  };
  const sr0 = (y) => tRad(T, y) * 1.06 + 1.3;
  // from a tub standing on a platform: down through the deck, out under it and over the edge
  const underRun = (g, a, r) => {
    const y = g.y - 0.6, rTo = g.rOut(a) + 0.7, pts = [at(T, a, r, g.y + 0.2), at(T, a, r, y)];
    for (let rr = r + 1; rr < rTo; rr += 1) pts.push(at(T, a, rr, y));
    pts.push(at(T, a, rTo, y));
    const sp = at(T, a, rTo, y - 0.3);
    if (!clearPath(pts.slice(1))) return null;
    const tub = nextTub(g, a, y - 0.3), finalOK = !tub && clearDrop(sp.x, sp.z, y, 0.5);
    return tub || finalOK ? { g2: g, a2: a, pts, sp, tub } : null;
  };
  // plan the whole chain from a cistern at (g0, a0, rc) without building anything
  const plan = (g0, a0, rc) => {
    const legs = [];
    let cur = { g: g0, a: a0, r: rc, y: g0.y + 0.85, tub: false };
    for (let k = 0; k < 8; k++) {
      const t = cur.onDeck ? null : nextTub(cur.g, cur.a, cur.g.y);
      if (t) { legs.push({ kind: "fall", from: cur, to: t }); cur = { g: t.g, a: t.a, r: t.r, y: t.g.y + 0.35, tub: true, onDeck: t.onDeck }; continue; }
      const run = (cur.onDeck && (k & 1) && underRun(cur.g, cur.a, cur.r)) || barkRun(cur.g, cur.a, cur.r) || (cur.onDeck && underRun(cur.g, cur.a, cur.r));
      if (!run) break;
      legs.push({ kind: run.g2 === cur.g ? "under" : "bark", from: cur, run });
      if (!run.tub) { legs.final = true; break; }
      cur = { g: run.tub.g, a: run.tub.a, r: run.tub.r, y: run.tub.g.y + 0.35, tub: true, onDeck: run.tub.onDeck };
    }
    return legs;
  };
  const tops = segs.filter((g) => g.ti >= Math.max(1, Math.max(...segs.map((s) => s.ti)) - 1));
  const cisternAt = (g0, a0) => { const rc = g0.rOut(a0) - 1.5; return { rc, cst: at(T, a0, rc, g0.y) }; };
  const starts = [];
  for (const g0 of tops) for (let k = 0; k < 10; k++) {
    const a0 = lerp(g0.a0 + 0.12, g0.a1 - 0.12, (k + 0.5) / 10), { rc, cst } = cisternAt(g0, a0);
    if (!deckFree(cst.x, cst.z, 1.0, g0.y + 0.05, g0.y + 2.2)) continue;
    const legs = plan(g0, a0, rc);
    starts.push({ g0, a0, rc, cst, score: legs.length + (legs.final ? 0.5 : 0) });
  }
  starts.sort((p, q) => q.score - p.score);

  // building
  const pipe = (pts, seed) => { (out.pipes ||= []).push(pts); b.room(0, 0, 0); b.set(MAT.METAL, COPPER, seed, 0.55); b.tube(pts, 0.13, 10); };
  const fall = (sp, yEnd, last) => {                 // a stream from spout sp down to yEnd, thickening and breaking up
    const pts = [], dir = V(sp.x - tAxis(T, sp.y)[0], 0, sp.z - tAxis(T, sp.y)[1]).normalize();
    for (let t = 0; ; t += 0.03) { const p = sp.clone().addScaledVector(dir, 0.7 * t).add(V(0, -4.9 * t * t, 0)); pts.push(p); if (p.y <= yEnd) break; }
    (out.spouts ||= []).push(sp.clone());
    wb.set(0, [1, 1, 1], R(), last ? 1 : 0); wb.room(0, 0, 0); wb.tube(pts, (t) => 0.1 + t * (last ? 0.7 : 0.12), 10);
  };
  const tubAt = (st) => {                            // a tub, on a shelf bracketed off the platform's edge unless it stands on the deck
    const tub = at(T, st.a, st.r, st.g.y);
    if (!st.onDeck) {
      const e0 = at(T, st.a, st.g.rOut(st.a) - 0.3, st.g.y - 0.1), e1 = at(T, st.a, st.r + 0.75, st.g.y - 0.1);
      b.room(0, 0, 0); b.set(MAT.DECK, [0.5, 0.42, 0.34], 3415); b.beam(e0, e1, 1.5, 0.16);
      b.set(MAT.WOOD, TIMBER, 3416);
      for (const sg of [-0.55, 0.55]) { const q = e1.clone().lerp(e0, 0.15).add(V(Math.cos(st.a) * sg, -0.05, -Math.sin(st.a) * sg)); b.beam(q, at(T, st.a, st.g.rOut(st.a) - 0.2, st.g.y - 1.4).add(V(Math.cos(st.a) * sg, 0, -Math.sin(st.a) * sg)), 0.1, 0.1); }
    }
    b.room(tub.x, st.g.y, tub.z, st.a);
    b.set(MAT.BOARDV, [0.5, 0.36, 0.22], 3420); b.lathe([[0.6, 0], [0.68, 0.6], [0.62, 0.62]], 16); b.lathe([[0, 0.02], [0.6, 0.02]], 16);
    b.set(MAT.METAL, IRON, 3421, 0.1); b.lathe([[0.65, 0.12], [0.66, 0.2]], 16); b.lathe([[0.68, 0.44], [0.69, 0.52]], 16);
    wb.set(1, [1, 1, 1], R(), 0); wb.room(tub.x, st.g.y, tub.z, 0); wb.lathe([[0.63, 0.54], [0, 0.54]], 16, { uFrac: true });
    claim(tub.x, tub.z, 0.75, st.g.y, st.g.y + 0.8);
  };
  // brackets holding a pipe to the bark, and hangers up to the platforms where it runs under one
  const brackets = (pts, under) => {
    b.room(0, 0, 0); b.set(MAT.METAL, IRON, 3431, 0.1);
    for (const p of pts) {
      const [ax, az] = tAxis(T, p.y), d = Math.hypot(p.x - ax, p.z - az);
      if (d < tRad(T, p.y) + 0.5) claim(p.x, p.z, 0.3, p.y - 0.6, p.y + 0.6);
      if (d < tRad(T, p.y) + 0.5) b.beam(p, V(ax + (p.x - ax) * (tRad(T, p.y) * 0.95) / d, p.y, az + (p.z - az) * (tRad(T, p.y) * 0.95) / d), 0.05, 0.05);
      else if (under.some((y) => Math.abs(p.y - y) < 0.01)) b.beam(p, p.clone().add(V(0, 0.4, 0)), 0.04, 0.04);
    }
  };
  // from the last tub: down through its platform, in under it to the trunk, and down the bare bark below the
  // platforms, winding round it, to a spout low over the mist
  const downRun = (st) => {
    const { g, a, r } = st, y = g.y - 0.6, yEnd = 5;
    const head = [at(T, a, r, g.y + (st.onDeck ? 0.2 : 0.05)), at(T, a, r, y)];
    for (let rr = r - 1; rr > tRad(T, y) + 0.8; rr -= 1) head.push(at(T, a, rr, y));
    for (const da of [0.9, -0.9, 0.5, -0.5, 1.5, -1.5, 0]) {
      const pts = head.slice(), n = Math.ceil(Math.max((y - yEnd) / 1.2, Math.abs(da) * tRad(T, y) / 0.9));
      for (let k = 0; k <= n; k++) { const f = k / n, yy = lerp(y, yEnd, f); pts.push(at(T, a + da * f, tRad(T, yy) + 0.22, yy)); }
      pts.push(at(T, a + da, tRad(T, yEnd) + 1.0, yEnd));
      const sp = at(T, a + da, tRad(T, yEnd) + 1.0, yEnd - 0.3);
      if (clearPath(pts.slice(2)) && clearDrop(sp.x, sp.z, yEnd, 0.5)) return { pts, sp, y };
    }
    return null;
  };
  let built = 0;
  for (const s0 of starts) {
    if (built >= n || s0.score < 1) break;
    const { g0, a0, rc, cst } = s0;
    if (!deckFree(cst.x, cst.z, 1.0, g0.y + 0.05, g0.y + 2.2)) continue;
    const legs = plan(g0, a0, rc);                   // again: an earlier cascade may have taken the room
    if (!legs.length) continue;
    (out.waterLegs ||= []).push(legs.map((l) => l.kind).join(" ") + (legs.final ? " mist" : ""));
    // the cistern: a big tank on legs, catching what drips from the crown
    b.room(cst.x, g0.y, cst.z, a0);
    b.set(MAT.WOOD, TIMBER, 3400); for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]]) b.beam(V(x, 0, z), V(x, 0.7, z), 0.14, 0.14);
    b.set(MAT.BOARDV, [0.45, 0.32, 0.2], 3401); b.lathe([[0.85, 0.7], [0.95, 1.4], [0.85, 2.2], [0, 2.2]], 18); b.lathe([[0, 0.7], [0.85, 0.7]], 18);
    b.set(MAT.METAL, IRON, 3402, 0.1); for (const y of [0.95, 1.85]) b.lathe([[0.93, y - 0.05], [0.93, y + 0.05]], 18);
    claim(cst.x, cst.z, 1.0, g0.y, g0.y + 2.3);
    for (const leg of legs) {
      if (leg.kind === "fall") {
        const { from, to } = leg, src = from.tub ? from.r + 0.4 : from.r + 0.8;
        const pA = at(T, from.a, src, from.y), pB = at(T, to.a, to.r, from.y), sp = at(T, to.a, to.r, from.g.y - 0.15);
        pipe([pA, pB, pB.clone().add(V(0, -0.05, 0)), sp.clone().add(V(0, 0.25, 0)), sp], 3410);
        b.room(0, 0, 0); b.set(MAT.WOOD, TIMBER, 3411); const m = pA.clone().lerp(pB, 0.5); b.beam(m.clone().setY(from.g.y), m.clone().add(V(0, 0.05, 0)), 0.08, 0.08);
        tubAt(to); fall(sp, to.g.y + 0.54, false);
      } else {
        const { run } = leg;
        pipe([...run.pts, run.sp], 3430);
        // brackets holding the pipe to the bark, and hangers under the platforms
        brackets(run.pts, [run.g2.y - 0.6, leg.from.g.y - 0.6]);
        if (run.tub) { tubAt(run.tub); fall(run.sp, run.tub.g.y + 0.54, false); }
        else fall(run.sp, 0.5, true);
      }
    }
    // when the chain ends in a tub, its overflow goes on over the edge into the mist
    const lastLeg = legs[legs.length - 1], end = lastLeg.kind === "fall" ? lastLeg.to : lastLeg.run.tub, down = end && downRun(end);
    if (down) {
      pipe([...down.pts, down.sp], 3446); brackets(down.pts, [down.y]); fall(down.sp, 0.5, true);
      out.waterLegs[out.waterLegs.length - 1] += " down";
    } else if (end && end.onDeck) {
      const run = underRun(end.g, end.a, end.r);
      if (run && !run.tub) { pipe([...run.pts, run.sp], 3445); fall(run.sp, 0.5, true); }
    } else if (end) {
      const rEnd = end.r + 1.7, pA = at(T, end.a, end.r + 0.5, end.g.y + 0.45), pB = at(T, end.a, rEnd, end.g.y + 0.45), sp = at(T, end.a, rEnd, end.g.y + 0.1);
      pipe([pA, pB, sp.clone().add(V(0, 0.2, 0)), sp], 3440);
      if (clearDrop(sp.x, sp.z, end.g.y, 0.5)) fall(sp, 0.5, true);
    }
    built++;
  }
  b.room(0, 0, 0);
  return built;
}

// small things that make it lived in: washing lines, hammocks, rope swings, birdhouses, rain barrels, a telescope
function details(b, sb, out, T, R, houses, segs, limbs, fits, claim, green) {
  const CLOTH = [[0.85, 0.82, 0.75], [0.75, 0.3, 0.3], [0.4, 0.55, 0.7], [0.9, 0.78, 0.45], [0.55, 0.65, 0.5], [0.7, 0.55, 0.75], [0.95, 0.92, 0.88]];
  // leaves at the tips of the great limbs
  for (const L of limbs) for (const t of [1, 0.92]) green({ p: L.P(t).add(V((R() - 0.5) * 2, 0.6 + R(), (R() - 0.5) * 2)), s: 2.6 + R() });
  // washing hung out between neighbours
  let lines = 0;
  for (let i = 0; i < houses.length && lines < 4; i++) {
    const A = houses[i];
    const B = houses.find((h) => h !== A && Math.abs(h.y - A.y) < 1.2 && Math.hypot(h.x - A.x, h.z - A.z) > A.r + h.r + 0.8 && Math.hypot(h.x - A.x, h.z - A.z) < A.r + h.r + 5);
    if (!B || R() < 0.4) continue;
    const ab = V(B.x - A.x, 0, B.z - A.z).normalize(), y = Math.min(A.y, B.y) + 2.05;
    const P0 = V(A.x, y, A.z).addScaledVector(ab, A.r * 0.8), P1 = V(B.x, y, B.z).addScaledVector(ab, -B.r * 0.8), m = P0.clone().lerp(P1, 0.5);
    if (!fits(m.x, m.z, 0.3, y - 1.0, y, null, "deck")) continue;
    const pts = sagLine(P0, P1, 0.25, 16), len = P0.distanceTo(P1), n = V().crossVectors(ab, UP);
    b.room(0, 0, 0); b.set(MAT.ROPE, [0.7, 0.68, 0.62], 2700 + i); b.tube(pts, 0.01, 3);
    for (let t = 0.12; t < 0.9; t += (0.5 + R() * 0.3) / len) {
      if (R() < 0.2) continue;
      const w = 0.3 + R() * 0.3, hh = 0.35 + R() * 0.5, q = sagLine(P0, P1, 0.25, 1000), at2 = (u) => q[Math.round(clamp(u, 0, 1) * 1000)];
      const a = at2(t - w / 2 / len), c = at2(t + w / 2 / len);
      b.set(MAT.FABRIC, pick(R, CLOTH), 2710 + i);
      const vv = (p, dy, u) => [p.x, p.y - dy, p.z, n.x, 0, n.z, u, dy];
      b.tri(vv(a, 0, 0), vv(c, 0, 1), vv(c, hh, 1)); b.tri(vv(a, 0, 0), vv(c, hh, 1), vv(a, hh * (0.9 + R() * 0.2), 0));
    }
    lines++;
  }
  // hammocks slung along the platform edges
  let ham = 0;
  for (const g of segs) {
    if (ham >= 2 || g.O.length < 6 || R() < 0.5) continue;
    const i = 1 + Math.floor(R() * (g.O.length - 4)), [ax, az] = tAxis(T, g.y);
    const inw = (p) => p.clone().lerp(V(ax, g.y, az), 0.55 / p.distanceTo(V(ax, g.y, az)));
    const A = inw(g.O[i]).add(V(0, 1.0, 0)), B = inw(g.O[i + 2]).add(V(0, 1.0, 0)), m = A.clone().lerp(B, 0.5);
    if (A.distanceTo(B) < 2 || !fits(m.x, m.z, 0.8, g.y + 0.1, g.y + 1.5, null, "deck")) continue;
    const pts = sagLine(A, B, 0.6, 12), d = V().subVectors(B, A).setY(0).normalize(), s = V().crossVectors(UP, d).multiplyScalar(0.38);
    b.room(0, 0, 0); b.set(MAT.FABRIC, pick(R, [[0.75, 0.35, 0.3], [0.4, 0.5, 0.7], [0.85, 0.75, 0.5]]), 2800 + ham);
    for (let k = 0; k < pts.length - 1; k++) {
      const p = pts[k], q = pts[k + 1], f = (u) => Math.sin(u * Math.PI) * 0.12;
      b.quad(p.clone().sub(s).add(V(0, f(k / 12), 0)), q.clone().sub(s).add(V(0, f((k + 1) / 12), 0)), q.clone().add(s).add(V(0, f((k + 1) / 12), 0)), p.clone().add(s).add(V(0, f(k / 12), 0)), [[0, 0], [0, 0], [1, 0], [1, 0]]);
    }
    b.set(MAT.ROPE, [0.6, 0.55, 0.45], 2801); b.tube([A.clone().add(V(0, 0.3, 0)), pts[1]], 0.012, 3); b.tube([B.clone().add(V(0, 0.3, 0)), pts[11]], 0.012, 3);
    b.set(MAT.WOOD, TIMBER, 2802); b.beam(A.clone().add(V(0, -1.0, 0)), A.clone().add(V(0, 0.35, 0)), 0.09, 0.09); b.beam(B.clone().add(V(0, -1.0, 0)), B.clone().add(V(0, 0.35, 0)), 0.09, 0.09);
    ham++;
  }
  // rope swings under the limbs, swinging
  for (const L of limbs) {
    if (R() < 0.45) continue;
    const t = 0.45 + R() * 0.2, c = L.P(t), pv = c.clone().add(V(0, -L.rr(t), 0)), len = 3 + R() * 1.5;
    if (!fits(pv.x, pv.z, 0.8, pv.y - len - 0.4, pv.y - 0.6)) continue;
    const s = V(Math.cos(L.a), 0, -Math.sin(L.a)).multiplyScalar(0.32);
    sb.st.piv = [pv.x, pv.y, pv.z, 0.1 + R() * 0.06];
    sb.room(0, 0, 0); sb.set(MAT.ROPE, [0.5, 0.42, 0.3], 2900 + L.i);
    for (const k of [-1, 1]) sb.tube([pv.clone().addScaledVector(s, k), pv.clone().addScaledVector(s, k).add(V(0, -len, 0))], 0.018, 4);
    const seat = pv.clone().add(V(0, -len, 0));
    sb.set(MAT.WOOD, [0.5, 0.36, 0.24], 2901); sb.beam(seat.clone().addScaledVector(s, -1.25), seat.clone().addScaledVector(s, 1.25), 0.3, 0.05);
    sb.st.piv = [0, 0, 0, 0];
  }
  // birdhouses on the bark
  for (let k = 0, made = 0; k < 40 && made < 8; k++) {
    const y = TREES.indexOf(T) >= 0 ? 6 + R() * (segs.reduce((m, g) => Math.max(m, g.y), 0) - 2) : 10, a = R() * TAU, p = at(T, a, tRad(T, y) * 0.98 + 0.18, y);
    if (!fits(p.x, p.z, 0.45, y - 0.3, y + 0.6)) continue;
    b.room(p.x, y, p.z, a);
    const col = pick(R, [[0.75, 0.4, 0.3], [0.4, 0.55, 0.65], [0.85, 0.75, 0.5], [0.55, 0.65, 0.45]]);
    b.set(MAT.PLANK, col, 3000 + k); b.box(0, 0.17, 0.05, 0.28, 0.34, 0.26);
    gableRoof(b, 0.26, 0.26, 0.34, 0.16, 0.05, MAT.SHINGLE, pick(R, ROOFS)[1], MAT.PLANK, col, 3001 + k);
    b.set(MAT.WOOD, [0.02, 0.015, 0.01], 3002); b.box(0, 0.22, 0.185, 0.08, 0.08, 0.01);
    b.set(MAT.WOOD, TIMBER, 3003); b.box(0, 0.12, 0.23, 0.02, 0.02, 0.1); b.box(0, -0.02, 0.0, 0.06, 0.08, 0.06);
    claim(p.x, p.z, 0.4, y - 0.1, y + 0.6); made++;
  }
  // rain barrels on the platforms, a downpipe from above
  for (const g of segs) {
    if (R() < 0.6) continue;
    const a = lerp(g.a0, g.a1, 0.2 + R() * 0.6), p = at(T, a, g.rOut(a) - 0.6, g.y);
    if (!fits(p.x, p.z, 0.45, g.y + 0.05, g.y + 1.0, null, "deck")) continue;
    b.room(p.x, g.y, p.z, R() * TAU);
    b.set(MAT.BOARDV, [0.5, 0.35, 0.22], 3100); b.lathe([[0.28, 0], [0.33, 0.4], [0.28, 0.8], [0, 0.8]], 12);
    b.set(MAT.METAL, IRON, 3101, 0.1); b.lathe([[0.31, 0.18], [0.31, 0.24]], 12); b.lathe([[0.31, 0.58], [0.31, 0.64]], 12);
    b.set(MAT.METAL, [0.35, 0.33, 0.3], 3102, 0.4); b.tube([V(0.1, 0.75, 0), V(0.1, 2.3, 0), V(0.25, 2.5, 0)], 0.04, 6);
    claim(p.x, p.z, 0.45, g.y, g.y + 2.5);
  }
  // a telescope on the highest platform, pointed at the moon
  const top = segs.filter((g) => g.ti === CITY[TREES.indexOf(T)].tiers.length - 1);
  for (const g of top.slice(0, 1)) {
    const a = lerp(g.a0, g.a1, 0.5), p = at(T, a, g.rOut(a) - 0.9, g.y);
    if (!fits(p.x, p.z, 0.6, g.y + 0.05, g.y + 1.8, null, "deck")) continue;
    const tp = p.clone().add(V(0, 1.15, 0));
    b.room(0, 0, 0); b.set(MAT.WOOD, TIMBER, 3200);
    for (let k = 0; k < 3; k++) { const aa = k * TAU / 3; b.beam(p.clone().add(V(Math.sin(aa) * 0.45, 0, Math.cos(aa) * 0.45)), tp, 0.05, 0.05); }
    b.set(MAT.METAL, BRASS, 3201, 0.2);
    b.push(new THREE.Matrix4().makeTranslation(tp.x, tp.y, tp.z).multiply(new THREE.Matrix4().lookAt(V(), MOON_DIR, UP)).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)));
    b.lathe([[0.06, 0.55], [0.06, 0.35], [0.075, 0.3], [0.075, -0.3], [0.09, -0.35], [0.1, -0.85], [0.08, -0.9]], 12); b.pop();
    claim(p.x, p.z, 0.6, g.y, g.y + 1.8);
  }
}

// all of it: plan where the trees reach for each other, build each tree's city, then bridge the gaps
function world(b, sb, out) {
  out.occ = [];
  const cons = TREES.map(() => []);
  for (const L of LINKS) {
    const A = TREES[L.a];
    if (L.ground) { L.ends = [{ a: Math.atan2(L.ground[0] - A.x, L.ground[1] - A.z), y: L.y, reach: 19, cable: true }]; cons[L.a].push(L.ends[0]); continue; }
    const B = TREES[L.b], D = Math.hypot(B.x - A.x, B.z - A.z), gap = L.mid ? 24 : L.cable ? Math.max(14, D - 42) : 10, reach = (D - gap) / 2;
    L.ends = [{ a: Math.atan2(B.x - A.x, B.z - A.z), y: L.y, reach, cable: L.cable }, { a: Math.atan2(A.x - B.x, A.z - B.z), y: L.y, reach, cable: L.cable }];
    cons[L.a].push(L.ends[0]); cons[L.b].push(L.ends[1]);
  }
  CITY.forEach((o, i) => city(b, sb, out, i, { ...o, connectors: cons[i] }));
  const across = (A, B, seed) => {
    b.room(0, 0, 0);
    const br = bridge(b, A, B, 0.5 + A.distanceTo(B) * 0.045, seed);
    for (const s of [-1, 1]) stringLights(out, Array.from({ length: 41 }, (_, k) => br.rail(k / 40, s).add(V(0, 0.04, 0))), 0.55, s > 0 ? seed % 7 + 1 : 0);
    out.bridges++;
  };
  LINKS.forEach((L, li) => {
    const [ca, cb] = L.ends;
    if (!ca.top && L.cable) return;       // a station that found no room
    if (L.cable) {
      let B = cb && cb.top;
      if (L.ground) {             // the valley station: a timber tower standing up out of the mist, a hut and a pylon on top
        const G = V(L.ground[0], 0, L.ground[1]), yT = 13, a = Math.atan2(TREES[L.a].x - G.x, TREES[L.a].z - G.z), side = V(Math.cos(a), 0, -Math.sin(a));
        b.room(G.x, 0, G.z, a); b.set(MAT.WOOD, TIMBER, 2450);
        const hw = 2.6, cs = [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]];
        for (const [x, z] of cs) b.beam(V(x, -1, z), V(x * 0.8, yT, z * 0.8), 0.3, 0.3);
        for (let y = 3; y < yT; y += 3.5) for (let i = 0; i < 4; i++) { const [x0, z0] = cs[i], [x1, z1] = cs[(i + 1) % 4], f = 1 - 0.2 * y / yT; b.beam(V(x0 * f, y, z0 * f), V(x1 * f, y, z1 * f), 0.15, 0.15); }
        b.room(0, 0, 0); deck(b, poly(G.x, yT, G.z, Array.from({ length: 8 }, (_, i) => 3.6 + 0.3 * Math.sin(i * 1.7)), 0.4), [V(G.x, yT, G.z).addScaledVector(V(Math.sin(a), 0, Math.cos(a)), 3.6)], 2451);
        const R = rng(5150), H = planHouse(R, "gable", 0.75), hp = V(G.x, yT, G.z).addScaledVector(V(Math.sin(a), 0, Math.cos(a)), -1.3);
        buildHouse(b, sb, out, H, hp.x, yT, hp.z, a + Math.PI);
        const base = V(G.x, yT, G.z).addScaledVector(V(Math.sin(a), 0, Math.cos(a)), 1.6);
        b.room(0, 0, 0); b.set(MAT.WOOD, TIMBER, 2452); b.beam(base, base.clone().add(V(0, 4.2, 0)), 0.22, 0.22);
        b.beam(base.clone().add(V(0, 4.0, 0)).addScaledVector(side, -1.3), base.clone().add(V(0, 4.0, 0)).addScaledVector(side, 1.3), 0.16, 0.2);
        B = base.clone().add(V(0, 4.25, 0));
        lantern(sb, base.clone().add(V(0, 3.9, 0)).addScaledVector(side, 1.3), 0.2, [1.0, 0.62, 0.32], 6, 2453);
        out.lights.push({ p: base.clone().add(V(0, 2.5, 0)), c: WARM, i: 4, s: 1 });
        out.houses++;
      }
      // two cables side by side, a cabin on each, passing each other halfway
      const A = ca.top, dir = V().subVectors(B, A).setY(0).normalize(), P = V(dir.z, 0, -dir.x).multiplyScalar(1.15), sag = 1.2 + A.distanceTo(B) * 0.02;
      b.room(0, 0, 0); b.set(MAT.METAL, IRON, 2400, 0);
      for (const sg of [-1, 1]) b.tube(sagLine(A.clone().addScaledVector(P, sg), B.clone().addScaledVector(P, sg), sag, 60), 0.035, 5);
      out.cables.push({ A, B, sag, P });
      return;
    }
    if (L.mid) {
      // a platform slung on ropes from both trunks, halfway across, with a little house on it
      const M = ca.tip.clone().lerp(cb.tip, 0.5); M.y = (ca.yP + cb.yP) / 2 + 0.5;
      const pts = poly(M.x, M.y, M.z, Array.from({ length: 10 }, (_, i) => 3.6 + 0.35 * Math.sin(i * 2.1)), 0.2);
      const eA = edgeAt(pts, M.x, M.z, ca.a + Math.PI), eB = edgeAt(pts, M.x, M.z, cb.a + Math.PI);
      b.room(0, 0, 0); deck(b, pts, [eA, eB], 2500);
      b.set(MAT.ROPE, [0.45, 0.4, 0.32], 2501);
      for (const [tr, ang] of [[TREES[L.a], ca.a], [TREES[L.b], cb.a]]) for (const s of [-1, 1]) {
        const p = edgeAt(pts, M.x, M.z, ang + Math.PI + s * 1.1).add(V(0, 1.0, 0)), top = at(tr, ang + s * 0.25, tRad(tr, M.y + 20) * 0.95, M.y + 20);
        b.tube(sagLine(p, top, 0.4, 16), 0.045, 5);
      }
      const side = V(Math.cos(ca.a), 0, -Math.sin(ca.a)), R = rng(4242), H = planHouse(R, "witch", 0.78);
      const hp = M.clone().addScaledVector(side, 0.9);
      buildHouse(b, sb, out, H, hp.x, M.y, hp.z, ca.a + Math.PI / 2);
      lantern(sb, M.clone().addScaledVector(side, -1.6).add(V(0, 2.4, 0)), 0.25, [1.0, 0.6, 0.35], 6, 2502);
      b.room(0, 0, 0); b.set(MAT.WOOD, TIMBER, 2503); b.beam(M.clone().addScaledVector(side, -1.6), M.clone().addScaledVector(side, -1.6).add(V(0, 2.55, 0)), 0.12, 0.12);
      across(ca.end, eA, 2600 + li); across(eB, cb.end, 2650 + li);
      out.houses++;
      return;
    }
    across(ca.end, cb.end, 2600 + li);
  });
}

// ---------------------------------------------------------------- the trees
// A trunk is rings round its leaning axis, flared and buttressed at the foot; limbs are tubes that reach out and
// up from the upper trunk, each with two side branches; leaf clumps sit at their tips and along them.
function trunk(b, tr, dy, seg, y1) {
  b.room(0, 0, 0); bark(b, tr, tr.seed, TAU * tr.r * 1.7);
  const ring = (y) => {
    const [ax, az] = tAxis(tr, y), r0 = tRad(tr, y), o = [];
    for (let j = 0; j <= seg; j++) {
      const a = j / seg * TAU, r = r0 * (1 + 0.42 * Math.exp(-Math.max(y, 0) / 3.2) * Math.max(0, Math.sin(a * 5 + tr.seed)) ** 2 + 0.035 * Math.sin(a * 9 + y * 0.5 + tr.seed));
      o.push([ax + Math.sin(a) * r, y, az + Math.cos(a) * r, Math.sin(a), 0.1, Math.cos(a), j / seg, y, TAU * r]);   // the last is the girth here, for the bark
    }
    return o;
  };
  let prev = ring(-3);
  for (let y = -3 + dy; ; y = Math.min(y + dy, y1)) {
    const cur = ring(y);
    for (let j = 0; j < seg; j++) { b.tri(prev[j], prev[j + 1], cur[j + 1]); b.tri(prev[j], cur[j + 1], cur[j]); }
    prev = cur;
    if (y >= y1) break;
  }
}
// limbs, branches and leaf clumps for one tree. o: { n, y0, y1, len, scale, leaf: (R) => clump look, drape, far,
// rise: [min, max] of the limbs' climb as a share of their length (negative: they weep), sub (the twigs' climb),
// drapeN, dome: { n, r0, r1, y0, y1 } the clumps that fill the top (radii in metres, heights as shares of the tree) }
function crown(b, tr, R, leaves, drapes, o) {
  const look = o.leaf;
  const clump = (p, s) => leaves.push({ p, s: s * (0.8 + R() * 0.45), seed: R(), ...look(R) });
  for (let i = 0; i < o.n; i++) {
    const y = lerp(o.y0, o.y1, (i + R() * 0.8) / o.n), a = i * 2.39996 + tr.seed + R() * 0.7;
    const [ax, az] = tAxis(tr, y), r0 = tRad(tr, y);
    const d = V(Math.sin(a), 0, Math.cos(a)), L = o.len * (0.65 + R() * 0.6) * (1 - 0.4 * (y - o.y0) / (o.y1 - o.y0 + 1));
    const rk = o.rise ?? [0.2, 0.65], rise = L * lerp(rk[0], rk[1], R()), sideV = V(-d.z, 0, d.x).multiplyScalar((R() - 0.5) * L * 0.35), droop = L * 0.08 * R();
    const P = (t) => V(ax, y, az).addScaledVector(d, r0 * 0.55 + L * t).add(V(0, rise * t ** 1.6 - droop * Math.sin(t * Math.PI), 0)).addScaledVector(sideV, Math.sin(t * 2.5));
    const rb = r0 * (o.far ? 0.3 : 0.34);
    bark(b, tr, tr.seed + i, TAU * rb);
    b.tube(Array.from({ length: o.far ? 5 : 9 }, (_, k, arr) => P(k / (o.far ? 4 : 8))), (t) => rb * (1 - 0.85 * t), o.far ? 5 : 8);
    for (let k = 0; k < 2; k++) {
      const t0 = 0.4 + k * 0.25 + R() * 0.1, p0 = P(t0), sa = a + (k ? 1 : -1) * (0.5 + R() * 0.6), sd = V(Math.sin(sa), 0, Math.cos(sa)), sl = L * (0.35 + R() * 0.25);
      const sp = Array.from({ length: 4 }, (_, q) => p0.clone().addScaledVector(sd, sl * q / 3).add(V(0, sl * (o.sub ?? 0.45) * (q / 3) ** 1.3, 0)));
      if (!o.far) b.tube(sp, (t) => rb * (1 - 0.85 * t0) * 0.55 * (1 - 0.8 * t), 5);
      clump(sp[3], o.scale);
      if (!o.far) clump(sp[2].clone().add(V(0, 0.6, 0)), o.scale * 0.8);
    }
    const tip = P(1);
    for (let k = 0; k < (o.far ? 2 : 3); k++) clump(tip.clone().add(V((R() - 0.5) * 3, (R() - 0.2) * 2, (R() - 0.5) * 3)), o.scale * 1.1);
    clump(P(0.7).add(V(0, 0.8, 0)), o.scale * 0.9);
    if (!o.far) for (let k = 0; k < (o.dense ? 11 : 5); k++) clump(P(0.25 + R() * 0.75).add(V((R() - 0.5) * 4, (R() - 0.3) * 2.5, (R() - 0.5) * 4)), o.scale * (0.7 + R() * 0.3));
    if (drapes && o.drape) for (let k = 0; k < (o.drapeN ?? (o.dense ? 6 : 4)); k++) { const p = P(0.3 + R() * 0.7); drapes.push({ p: p.add(V(0, -0.2, 0)), s: (o.drapeS ?? 1.6) * (1 + R()), seed: R(), ...o.drape(R) }); }
  }
  const dm = o.dome ?? (o.dense ? { n: 26, r0: 4, r1: 22, y0: 0.68, y1: 0.95, drop: 0.3 } : { n: 3, r0: 2.5, r1: 2.5, y0: 0.88, y1: 0.98, drop: 0 });
  for (let k = 0; k < (o.far ? 3 : dm.n); k++) {      // the dome of the crown, filled in
    const a = R() * TAU, [ax, az] = tAxis(tr, tr.h * 0.9), rr = lerp(dm.r0, dm.r1, R()), yy = tr.h * lerp(dm.y0, dm.y1, R()) - rr * dm.drop;
    clump(V(ax + Math.sin(a) * rr, yy, az + Math.cos(a) * rr), o.scale * 1.2);
  }
}
// a few roots reaching out into the mist
function roots(b, tr, R) {
  b.room(0, 0, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i + R() * 0.5) / 6 * TAU + tr.seed, d = V(Math.sin(a), 0, Math.cos(a)), r0 = tr.r * 0.45;
    const pts = Array.from({ length: 6 }, (_, k) => { const t = k / 5; return V(tr.x, 2.5 - t * 3.2, tr.z).addScaledVector(d, tr.r * 1.2 + t * (4 + R() * 2)); });
    bark(b, tr, tr.seed + 50 + i, TAU * r0); b.tube(pts, (t) => r0 * (1 - 0.7 * t), 7);
  }
}

// ---------------------------------------------------------------- leaves, painted once at startup
// A 1024 x 1024 atlas of four 512 x 512 cells: R is the tone, G marks blossom, A the cover. Cell 0 is a cluster of
// broad leaves, 1 the same in flower, 2 hanging racemes of wisteria, 3 trailing strands of moss and vine.
function paintLeaves() {
  const S = 1024, cv = document.createElement("canvas"); cv.width = cv.height = S;
  const g = cv.getContext("2d"), R = rng(77);
  const col = (t, m) => `rgb(${Math.round(clamp(t, 0, 1) * 255)},${Math.round(m * 255)},0)`;
  const leaf = (x, y, len, wid, ang, t, m = 0) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.fillStyle = col(t, m); g.beginPath(); g.moveTo(0, 0);
    g.bezierCurveTo(wid, len * 0.2, wid * 0.8, len * 0.75, 0, len); g.bezierCurveTo(-wid * 0.8, len * 0.75, -wid, len * 0.2, 0, 0); g.fill();
    g.strokeStyle = col(t * 0.75, m); g.lineWidth = Math.max(1, wid * 0.08); g.beginPath(); g.moveTo(0, len * 0.05); g.lineTo(0, len * 0.9); g.stroke();
    g.restore();
  };
  const flower = (x, y, r, t) => {
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + R(); g.fillStyle = col(t * (0.85 + R() * 0.15), 1); g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.55, r * 0.38, a, 0, TAU); g.fill(); }
    g.fillStyle = col(1, 0.55); g.beginPath(); g.arc(x, y, r * 0.22, 0, TAU); g.fill();
  };
  const cluster = (ox, oy, nLeaves, nFlowers) => {
    const cx = ox + 256, cy = oy + 256;
    g.strokeStyle = col(0.15, 0); g.lineWidth = 3;
    for (let k = 0; k < 7; k++) { const a = R() * TAU; g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(cx + Math.cos(a + 0.4) * 90, cy + Math.sin(a + 0.4) * 90, cx + Math.cos(a) * 180, cy + Math.sin(a) * 180); g.stroke(); }
    const items = [];
    for (let k = 0; k < nLeaves; k++) { const r = 200 * Math.sqrt(R()), a = R() * TAU; items.push([r, a, 0]); }
    for (let k = 0; k < nFlowers; k++) { const r = 190 * Math.sqrt(R()), a = R() * TAU; items.push([r, a, 1]); }
    items.sort((p, q) => p[0] - q[0] + (p[2] - q[2]) * 40);
    for (const [r, a, f] of items) {
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, t = 0.3 + 0.55 * (r / 200) + R() * 0.25;
      if (f) flower(x, y, 9 + R() * 7, 0.75 + R() * 0.25);
      else leaf(x, y, 38 + R() * 26, 15 + R() * 9, a - Math.PI / 2 + (R() - 0.5) * 1.2, t);
    }
  };
  cluster(0, 0, 150, 0);
  cluster(512, 0, 90, 75);
  // wisteria: three racemes hanging from the top of the cell, leaflets at the top
  for (let k = 0; k < 3; k++) {
    const x0 = 128 + k * 128 + (R() - 0.5) * 40, len = 330 + R() * 140;
    for (let q = 0; q < 6; q++) leaf(x0 + (R() - 0.5) * 50, 512 + 10 + R() * 30, 50 + R() * 20, 14, (R() - 0.5) * 2.4, 0.4 + R() * 0.4);
    for (let q = 0; q < 70; q++) {
      const t = q / 70, y = 40 + t * len, w = 34 * (1 - t * 0.75), x = x0 + Math.sin(t * 5 + k) * 10 + (R() - 0.5) * w;
      g.fillStyle = col(0.55 + R() * 0.45, 1); g.beginPath(); g.ellipse(x, 512 + y, 7 + R() * 4 * (1 - t), 5 + R() * 3, R() * 3, 0, TAU); g.fill();
    }
  }
  // trailing strands of moss and vine
  for (let k = 0; k < 8; k++) {
    const x0 = 560 + k * 56 + (R() - 0.5) * 20, len = 260 + R() * 230, ph = R() * 6;
    g.strokeStyle = col(0.25, 0); g.lineWidth = 2; g.beginPath(); g.moveTo(x0, 512 + 4);
    for (let y = 0; y < len; y += 8) g.lineTo(x0 + Math.sin(y * 0.03 + ph) * 12, 512 + 4 + y);
    g.stroke();
    for (let y = 10; y < len; y += 11 + R() * 8) { const x = x0 + Math.sin(y * 0.03 + ph) * 12; leaf(x, 512 + 4 + y, 16 + R() * 10, 7 + R() * 4, (R() < 0.5 ? -1 : 1) * (0.6 + R() * 0.8), 0.35 + R() * 0.5); }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
// a clump: 14 cards at random in a ball, each lit with the ball's normal; a drape: 6 hanging cards
function clumpGeometry(drape) {
  const R = rng(drape ? 5 : 3), P = [], U = [], NN = [], RR = [];
  const n = drape ? 6 : 14;
  for (let i = 0; i < n; i++) {
    let c, nrm, ex, ey;
    if (drape) {
      const a = R() * TAU, r = 0.15 + R() * 0.4;
      c = V(Math.cos(a) * r, -0.5, Math.sin(a) * r); nrm = V(Math.cos(a), 0, Math.sin(a));
      const ya = R() * TAU; ex = V(Math.cos(ya) * 0.32, 0, Math.sin(ya) * 0.32); ey = V(0, 0.5, 0);
    } else {
      let q; do q = V(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1); while (q.lengthSq() > 1);
      c = q.multiplyScalar(0.62); nrm = c.clone().normalize();
      const t = V(R() - 0.5, R() - 0.5, R() - 0.5).add(nrm.clone().multiplyScalar(0.8)).normalize();
      ex = V().crossVectors(t, Math.abs(t.y) < 0.9 ? UP : V(1, 0, 0)).normalize().multiplyScalar(0.55);
      ey = V().crossVectors(t, ex).normalize().multiplyScalar(0.55);
    }
    const r = drape ? 1 : c.length() / 0.62;
    const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]].map(([sx, sy, u, v]) => [c.clone().addScaledVector(ex, sx).addScaledVector(ey, sy), u, v]);
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const [p, u, v] = corners[k];
      P.push(p.x, p.y, p.z); U.push(u, v);
      const nn = drape ? nrm : V().copy(p).normalize().lerp(nrm, 0.5).normalize();
      NN.push(nn.x, nn.y, nn.z); RR.push(r);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute("aN", new THREE.Float32BufferAttribute(NN, 3));
  g.setAttribute("aR", new THREE.Float32BufferAttribute(RR, 1));
  return g;
}
const LEAF_VERT = /* glsl */`
attribute vec3 aN, aCol, aFl; attribute float aR; attribute vec4 aI;
varying vec2 vUv; varying vec3 vW, vNs, vCol, vFl; varying float vR, vCell;
void main(){
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.);
  float s = length(instanceMatrix[0].xyz), ph = aI.y * 40. + w.x * 0.13 + w.z * 0.11;
  #ifdef DRAPE
  float k = (1. - uv.y) * s * 0.12;
  w.xyz += vec3(sin(uTime * 0.9 + ph + position.y), 0., cos(uTime * 0.75 + ph * 1.3)) * k * (1. - position.y);
  #else
  w.xyz += (vec3(sin(uTime * 0.6 + ph), 0., cos(uTime * 0.5 + ph * 1.3)) * 0.035 + vec3(0., sin(uTime * 2.3 + position.x * 4. + ph), 0.) * 0.012) * s;
  #endif
  vW = w.xyz; vNs = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * aN);
  vUv = uv; vCol = aCol; vFl = aFl; vR = aR; vCell = aI.x;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const LEAF_FRAG = /* glsl */`
uniform sampler2D uAtlas;
varying vec2 vUv; varying vec3 vW, vNs, vCol, vFl; varying float vR, vCell;
void main(){
  vec2 off = vec2(mod(vCell, 2.) * 0.5, 0.5 - floor(vCell / 2.) * 0.5);
  vec4 t = texture2D(uAtlas, off + (vUv * 0.96 + 0.02) * 0.5);
  float d = distance(cameraPosition, vW);
  float cov = t.a * smoothstep(1.5, 4.5, d);                    // cards close to the eye fade, so you can fly through
  float a = clamp((cov - 0.5) / max(fwidth(t.a), 1e-3) + 0.5, 0., 1.);
  if (a < 0.02) discard;
  vec3 N = normalize(vNs); vec3 V = normalize(cameraPosition - vW);
  float tone = t.r, fl = step(0.75, t.g), ctr = step(0.3, t.g) * (1. - fl);
  vec3 alb = mix(vCol * (0.35 + 0.85 * tone), vFl * (0.6 + 0.5 * tone), fl);
  alb = mix(alb, vec3(0.9, 0.75, 0.3), ctr);
  float ao = mix(0.3, 1., vR) * (0.7 + 0.3 * tone);
  float sh = shadowAt(vW, N);
  float nl = clamp((dot(N, uMoonDir) + 0.6) / 1.6, 0., 1.);
  vec3 sky = mix(uSkyG, uSkyA, N.y * 0.5 + 0.5) * skyOpen(vW);
  vec3 col = alb * (uMoonCol * nl * sh * (0.5 + 0.5 * vR) + sky * ao + (warm(vW, N, 1.) * 0.6 + cityGlow(vW)) * (0.4 + 0.6 * ao));
  col += alb * uMoonCol * pow(max(dot(-V, uMoonDir), 0.), 4.) * 0.4 * sh * ao * (1. - fl * 0.4);   // moonlight through the leaves
  col += vFl * fl * (0.05 + 0.12 * uNight) * (0.8 + 0.2 * sin(uTime * 0.8 + vW.x));             // the blossom glows a little
  gl_FragColor = vec4(fogged(col, vW), a);
}`;

// water (the falls and the tubs' surfaces, see waterworks): aK.x 0 = a falling stream (uv.y metres down the fall,
// p1 = 1 for the long last fall into the mist), 1 = a tub's surface (uv.y from the rim inward)
const WATER_FRAG = /* glsl */`
varying vec3 vW, vN, vC; varying vec2 vUv; varying vec4 vK;
void main(){
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vW), Rf = reflect(-V, N);
  float fr = 0.08 + 0.92 * pow(1. - abs(dot(N, V)), 4.);
  vec3 refl = fogSky(Rf) * 1.2 + uMoonCol * pow(max(dot(Rf, uMoonDir), 0.), 40.) * 2.;
  vec3 lit = warm(vW, N, 1.) * 0.3 + cityGlow(vW) + uSkyA * 0.6 + uMoonCol * 0.25;
  vec3 col; float a;
  if (vK.x < 0.5) {             // streaks racing down, frothing, breaking up toward the bottom
    float v = vUv.y, sp = 4.5;
    float n = fbm(vec2(vUv.x * 5., v * 1.5 - uTime * sp)), m = fbm(vec2(vUv.x * 11. + 3., v * 3. - uTime * sp * 1.3));
    float streak = smoothstep(0.35, 0.8, n * 0.7 + m * 0.4);
    float brk = vK.z > 0.5 ? smoothstep(3., 16., v) : smoothstep(1.5, 4., v) * 0.4;
    a = (0.45 + 0.5 * streak) * (1. - brk * (1. - smoothstep(0.45, 0.75, m))) * smoothstep(0., 0.15, v + 0.05);
    col = mix(refl * fr + lit * 0.6, vec3(0.85, 0.9, 0.97) * (lit * 1.6 + 0.04), streak * 0.75);
  } else {                      // rings spreading from where the water lands, foam in the middle
    float r = 0.63 - vUv.y;
    float ring = sin(r * 26. - uTime * 7.) * 0.5 + 0.5, foam = smoothstep(0.3, 0.06, r + (fbm(vec2(vUv.x * 12., uTime * 2.)) - 0.5) * 0.18);
    col = refl * (fr + 0.15) * (0.8 + 0.3 * ring * smoothstep(0.6, 0.2, r)) + vec3(0.015, 0.025, 0.03);
    col = mix(col, vec3(0.8, 0.85, 0.9) * lit, foam * 0.8);
    a = 0.9;
  }
  if (a < 0.01) discard;
  gl_FragColor = vec4(fogged(col, vW), a);
}`;

// ---------------------------------------------------------------- sky, glows, post
const SKY_FRAG = /* glsl */`
varying vec3 vD;
void main(){
  vec3 d = normalize(vD); float h = d.y;
  vec3 hor = fogSky(d);
  vec3 mid = mix(vec3(0.1, 0.095, 0.22), vec3(0.025, 0.03, 0.07), uNight), zen = mix(vec3(0.025, 0.032, 0.09), vec3(0.006, 0.008, 0.025), uNight);
  vec3 col = mix(hor, mid, smoothstep(0.0, 0.3, h)); col = mix(col, zen, smoothstep(0.25, 0.9, h));
  float md = max(dot(d, uMoonDir), 0.);
  // stars, more of them at night, none in the moon's glare
  vec3 sp = d * 260., id = floor(sp); float hs = hash13(id);
  vec3 f = fract(sp) - 0.5 - (vec3(hash13(id + 1.), hash13(id + 2.), hash13(id + 3.)) - 0.5) * 0.6;
  float star = smoothstep(0.12, 0.0, length(f)) * step(0.982 - uNight * 0.01, hs) * (0.3 + 0.7 * hash13(id + 7.)) * (0.65 + 0.35 * sin(uTime * (1.5 + hs * 4.) + hs * 70.));
  col += vec3(0.85, 0.88, 1.) * star * smoothstep(0.04, 0.3, h) * mix(0.35, 1.2, uNight) * (1. - smoothstep(0.92, 0.99, md));
  // thin clouds, their edges silvered near the moon and warmed toward the afterglow
  vec2 cu = d.xz / (h + 0.1);
  float cl = fbm(cu * 0.55 + vec2(uTime * 0.004, uTime * 0.001)) * (0.6 + 0.6 * fbm(cu * 1.7 + 4.));
  float cm = smoothstep(0.32, 0.62, cl) * smoothstep(0.02, 0.18, h) * (1. - smoothstep(0.5, 0.9, h));
  vec3 cc = mid * 0.8 + uMoonCol * (pow(md, 10.) * 1.4 + 0.1) + uGlowCol * pow(max(dot(normalize(vec3(d.x, 0., d.z) + 1e-5), uGlowDir), 0.), 3.) * (1. - h) * 0.6;
  col = mix(col, cc, cm * 0.6);
  // distant ridges in layers on the horizon, mist pooled between them
  float az = atan(d.x, d.z);
  for (int k = 0; k < 3; k++) {
    float fk = float(k), rh = (0.05 - fk * 0.014) * (0.45 + fbm(vec2(az * (2.5 + fk * 1.7) + fk * 9., fk * 3.)));
    float m = smoothstep(rh + 0.002, rh - 0.002, h);
    col = mix(col, mix(hor, vec3(0.02, 0.025, 0.05), 0.2 + 0.14 * fk) + hor * smoothstep(rh - 0.03, rh, h) * 0.15, m);
  }
  if (h < 0.) col = mix(col, hor * 1.05, smoothstep(0., -0.02, h));
  // the moon: a large disc with its seas, then its glow
  float mr = 0.03;
  if (md > cos(mr * 1.3)) {
    vec3 mu = normalize(cross(uMoonDir, vec3(0., 1., 0.))), mv = cross(mu, uMoonDir);
    vec2 q = vec2(dot(d, mu), dot(d, mv)) / mr; float r2 = dot(q, q);
    float sea = smoothstep(0.45, 0.7, fbm(q * 1.6 + 3.)) * 0.35 + smoothstep(0.55, 0.75, fbm(q * 4. + 8.)) * 0.12;
    vec3 mc = vec3(1.0, 0.95, 0.86) * (1. - sea) * pow(max(1. - r2, 0.), 0.12) * 4.5;
    col = mix(col, mc, smoothstep(1., 0.94, r2));
  }
  col += uMoonCol * (pow(md, 900.) * 1.2 + pow(md, 60.) * 0.35 + pow(md, 8.) * 0.12);
  col += scatter(cameraPosition, d, 400.) * uScat;
  gl_FragColor = vec4(col, 1.);
}`;
// glowing points: string lights, lanterns' halos, fireflies, spores and wisps share one shader; the vertex shader
// moves each kind (aK.x: 0 bulb, 1 halo, 2 firefly, 3 spore, 4 wisp, 5 sky lantern)
const GLOW_VERT = /* glsl */`
attribute vec4 aK; attribute vec3 aCol;
uniform float uPx; uniform vec3 uBox0, uBox;
varying vec3 vCol; varying float vA, vSoft;
void main(){
  vec3 p = position; float kind = aK.x, s = aK.y, size = aK.z, a = 1.;
  vCol = aCol; vSoft = 0.;
  if (kind < 0.5) { a = 0.85 + 0.15 * sin(uTime * (1. + s * 2.) + s * 40.); }
  else if (kind < 1.5) { a = 0.9 + 0.1 * sin(uTime * 7. + s * 30.); vSoft = 1.; }
  else if (kind < 2.5) {
    float t = uTime * (0.12 + s * 0.1);
    p += vec3(sin(t * 1.3 + s * 20.) * 1.8 + sin(t * 3.1 + s * 7.) * 0.5, sin(t * 1.7 + s * 13.) * 0.9, cos(t * 1.1 + s * 31.) * 1.8 + cos(t * 2.7 + s * 3.) * 0.5);
    float bl = sin(uTime * (0.9 + s * 0.8) + s * 60.);
    a = smoothstep(0.1, 1., bl) * 1.3 + 0.08;
    a *= mix(0.6, 1.4, uNight);
  } else if (kind < 3.5) {
    vec3 drift = vec3(uWind.x * 0.25, 0.12 + s * 0.1, uWind.y * 0.25) * uTime + vec3(sin(uTime * 0.3 + s * 40.), 0., cos(uTime * 0.27 + s * 23.)) * 0.8;
    vec3 e = mod(position * uBox + drift, uBox);
    p = uBox0 + e; e /= uBox;
    a = smoothstep(0., 0.1, min(min(e.x, 1. - e.x), min(e.z, 1. - e.z))) * smoothstep(0., 0.1, min(e.y, 1. - e.y)) * (0.6 + 0.4 * sin(uTime * 2. + s * 50.));
  } else if (kind < 4.5) {
    float t = uTime * 0.05 + s * 6.2832;
    p += vec3(sin(t) * 9. + sin(t * 2.3) * 3., sin(t * 1.4) * 3., cos(t * 0.8) * 9. + cos(t * 2.9) * 3.);
    a = 0.6 + 0.4 * sin(uTime * 0.7 + s * 10.); vSoft = 1.;
  } else { a = s; vSoft = 0.6; }
  vec4 mv = viewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  gl_PointSize = clamp(uPx * size / d, kind > 2.5 && kind < 3.5 ? 1. : 1.6, 90.);
  float od = fogOD(cameraPosition, normalize(p - cameraPosition), d);
  vA = a * exp(-od) * smoothstep(0.3, 1.5, d) * clamp(uPx * size / d / 1.6, 0., 1.);
}`;
const GLOW_FRAG = /* glsl */`
varying vec3 vCol; varying float vA, vSoft;
void main(){
  float r = length(gl_PointCoord - 0.5) * 2.;
  float core = exp(-r * r * 9.), halo = exp(-r * r * 2.5) * (1. - r);
  float i = mix(core * 1.2 + halo * 0.35, halo * 0.6, vSoft) * vA;
  if (i < 0.003) discard;
  gl_FragColor = vec4(vCol * i, 1.);
}`;
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
  vec2 ca = q * dot(q, q) * 0.005;
  vec3 col = vec3(texture2D(tScene, vUv - ca).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv + ca).b);
  vec3 bl = texture2D(tBloom, vUv).rgb * uBloom;
  col += bl;
  vec3 c = toSRGB(aces(col));
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c += vec3(0.018, 0.008, 0.04) * (1.0 - l) * (1.0 - l);   // the shadows lifted into violet: a dreamy haze
  c += vec3(0.035, 0.012, -0.02) * l;                      // warm light stays warm
  c += toSRGB(aces(bl)) * 0.12;                           // a soft glow over everything bright
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.18);
  float vig = smoothstep(1.2, 0.3, length(q * vec2(1.0, 1.15)));
  c *= mix(0.62, 1.0, vig);
  c += (h21(vUv * uRes + fract(uTime * 7.31) * 113.) - 0.5) * 0.016;
  gl_FragColor = vec4(c, 1.);
}`;

// ---------------------------------------------------------------- the scene
export function startAerie3D(canvasEl, { reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: false, powerPreference: "high-performance" });
  let pr = Math.min(window.devicePixelRatio || 1, 1.5);
  const LITE = matchMedia("(pointer: coarse)").matches;     // phones and tablets: a thinner forest round the village
  renderer.setPixelRatio(pr);
  renderer.toneMapping = THREE.NoToneMapping;
  const post = makePost(renderer, { comp: COMP_FRAG, bloom: 0.7, thresh: 0.38 });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1500);

  const SU = {
    uTime: { value: 0 }, uNight: { value: 0 }, uFogA: { value: 0.2 }, uFogB: { value: 0.0034 }, uFogH: { value: 5.5 }, uScat: { value: 0.0015 },
    uMoonDir: { value: MOON_DIR.clone() }, uMoonCol: { value: V() }, uSkyA: { value: V() }, uSkyG: { value: V() }, uHor: { value: V() },
    uGlowDir: { value: GLOW_DIR.clone() }, uGlowCol: { value: V() },
    uLp: { value: Array.from({ length: NL }, () => V(0, -999, 0)) }, uLc: { value: Array.from({ length: NL }, () => V()) }, uLs: { value: new Array(NL).fill(1) },
    uCity: { value: V(0.05, 0.028, 0.012) }, uCtr: { value: new THREE.Vector2(...CTR) }, uTrees: { value: TREES.map((t, i) => new THREE.Vector4(t.x, t.z, t.r / 5.4, CITY[i].tiers[CITY[i].tiers.length - 1])) }, uWind: { value: new THREE.Vector2(0.8, 0.5).normalize() },
    uShadow: { value: null }, uShadowM: { value: new THREE.Matrix4() }, uShPx: { value: 1 / 2048 }, uAtlas: { value: null },
  };
  const shader = (vert, frag, extra = {}) => new THREE.ShaderMaterial({ uniforms: SU, vertexShader: GLSL_COMMON + vert, fragmentShader: GLSL_COMMON + GLSL_LIGHT + GLSL_BUMP + frag, ...extra });

  // ---- build: the cities in the four great trees and the bridges between them, the crowns, then the forest round them
  HALOS.length = 0;
  const b = builder(), sb = builder(true), fb = builder();
  const out = { lights: [], smoke: [], bulbs: [], flowers: [], clumps: [], vanes: [], mills: [], baskets: [], cables: [], lifts: [], launch: [], houses: 0, bridges: 0, wb: builder() };
  const leaves = [], drapes = [];
  const R = rng(2026);
  world(b, sb, out);
  const green = (R) => ({ cell: 0, col: [0.09 + R() * 0.06, 0.16 + R() * 0.08, 0.1 + R() * 0.05], fl: [0, 0, 0] });
  const crownOf = (i, o) => ({ n: Math.round(42 * TREES[i].r / 5.4), y0: CITY[i].tiers[CITY[i].tiers.length - 1] + 4, y1: TREES[i].h * 0.95, len: 25 * TREES[i].r / 5.4, scale: 5.0 * (0.85 + 0.15 * TREES[i].r / 5.4), dense: true, ...o });
  const LOOKS = [
    // the old giant: a broad, deep dome, lilac blossom here and there, wisteria hanging
    crownOf(0, { leaf: FOLIAGE[0].leaf, drape: FOLIAGE[0].drape }),
    // the baobab: stubby limbs climbing steeply from high up, a flat umbrella of dark leaves and pink flowers on top
    crownOf(1, { n: 18, y0: 0.74 * TREES[1].h, y1: 0.9 * TREES[1].h, len: 13, rise: [0.55, 0.95], sub: 0.7, scale: 4.2,
      dome: { n: 34, r0: 3, r1: 17, y0: 0.93, y1: 0.98, drop: 0.08 }, drapeN: 0, leaf: FOLIAGE[1].leaf, drape: null }),
    // the coiled one: long limbs that arch out and hang, curtains of wisteria and moss to the mist
    crownOf(2, { n: 30, y0: CITY[2].tiers[CITY[2].tiers.length - 1] + 8, len: 24, rise: [-0.5, -0.2], sub: -0.6, scale: 4.2, drapeN: 26, drapeS: 3.6,
      dome: { n: 14, r0: 2, r1: 10, y0: 0.8, y1: 0.95, drop: 0.2 }, leaf: FOLIAGE[2].leaf, drape: FOLIAGE[2].drape }),
    // the birch: a tall narrow crown of short climbing twigs, gone gold
    crownOf(3, { n: 30, dense: false, y1: TREES[3].h * 0.98, len: 9, rise: [0.5, 1.0], sub: 0.8, scale: 3.0,
      dome: { n: 22, r0: 1, r1: 6, y0: 0.72, y1: 0.99, drop: 0 }, drapeN: 0, drape: null, leaf: FOLIAGE[3].leaf }),
  ];
  TREES.forEach((tr, i) => { trunk(b, tr, 0.8, 28, tr.h * 0.94); roots(b, tr, R); crown(b, tr, R, leaves, drapes, LOOKS[i]); });
  for (const c of out.clumps) (c.drape ? drapes : leaves).push(c);
  for (const f of out.flowers) leaves.push({ p: f.p, s: f.s, seed: f.seed, cell: 1, col: [0.12, 0.22, 0.1], fl: [[0.95, 0.5, 0.55], [0.95, 0.85, 0.5], [0.75, 0.6, 0.95]][Math.floor(f.seed * 3)] });

  // where you must not fly: a grid of 1.5 m cells in 2 m bands, marked wherever anything is built, then grown by a
  // few metres so you keep your distance
  const G = { x0: GC[0] - 190, z0: GC[1] - 190, n: 254, cs: 1.5, nh: 40, hs: 2 };
  const occG = new Uint8Array(G.n * G.n * G.nh);
  for (const P of [b.positions(), sb.positions()]) for (let i = 0; i < P.length; i += 3) {
    const ix = Math.floor((P[i] - G.x0) / G.cs), iz = Math.floor((P[i + 2] - G.z0) / G.cs), iy = Math.floor(P[i + 1] / G.hs);
    if (ix >= 0 && ix < G.n && iz >= 0 && iz < G.n && iy >= 0 && iy < G.nh) occG[(iy * G.n + iz) * G.n + ix] = 1;
  }
  const grow = (stride, len, r) => {
    const src = occG.slice();
    for (let i = 0; i < occG.length; i++) {
      if (src[i]) continue;
      const k = Math.floor(i / stride) % len;
      for (let d = -r; d <= r; d++) { const kk = k + d; if (d && kk >= 0 && kk < len && src[i + d * stride]) { occG[i] = 1; break; } }
    }
  };
  grow(1, G.n, 2); grow(G.n, G.n, 2); grow(G.n * G.n, G.nh, 1);
  const free = (x, y, z) => {
    const ix = Math.floor((x - G.x0) / G.cs), iz = Math.floor((z - G.z0) / G.cs), iy = Math.floor(y / G.hs);
    return ix < 0 || ix >= G.n || iz < 0 || iz >= G.n || iy < 0 || iy >= G.nh || !occG[(iy * G.n + iz) * G.n + ix];
  };
  // the nearest free distance on the circle's radius to the one asked for (outward first, inward if that is nearer)
  const clearR = (cx, cz, ang, h, d) => {
    const s = Math.sin(ang), c = Math.cos(ang);
    for (let k = 0; k < 240; k++) {
      const dd = k * 0.5;
      if (free(cx + s * (d + dd), h, cz + c * (d + dd))) return d + dd;
      if (d - dd > 8 && free(cx + s * (d - dd), h, cz + c * (d - dd))) return d - dd;
    }
    return d;
  };

  // the forest: tall trunks fading into the mist all round, with a gap toward the moon
  const MOON_AZ = Math.atan2(MOON_DIR.x, MOON_DIR.z);
  const farLeaf = (R) => ({ cell: 0, col: [0.07 + R() * 0.05, 0.13 + R() * 0.06, 0.1 + R() * 0.05], fl: [0, 0, 0] });
  for (let i = 0, n = LITE ? 40 : 80; i < n; i++) {
    let r, a;
    do { r = 165 + 150 * Math.sqrt(R()); a = R() * TAU; } while (Math.abs(Math.atan2(Math.sin(a - MOON_AZ), Math.cos(a - MOON_AZ))) < 0.25 && r < 260);
    const tr = { x: CTR[0] + Math.sin(a) * r, z: CTR[1] + Math.cos(a) * r, r: 1.8 + R() * 2.0, h: 55 + R() * 40, lx: (R() - 0.5) * 2.5, lz: (R() - 0.5) * 2.5, seed: 100 + i };
    trunk(fb, tr, 3, 10, tr.h * 0.92);
    crown(fb, tr, R, leaves, null, { n: 10, y0: tr.h * 0.38, y1: tr.h * 0.92, len: 11, scale: 5.6, far: true, leaf: farLeaf });
  }

  // ---- materials and meshes
  const atlas = paintLeaves(); atlas.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); SU.uAtlas.value = atlas;
  const buildMat = shader(BUILD_VERT, BUILD_FRAG, { side: THREE.DoubleSide });
  const swingMat = shader(BUILD_VERT, BUILD_FRAG, { side: THREE.DoubleSide, defines: { SWING: "" } });
  const vGeo = b.geometry(), sGeo = sb.geometry(), fGeo = fb.geometry();
  // the water: falls and tub surfaces, drawn last, see-through
  const water = new THREE.Mesh(out.wb.geometry(), shader(BUILD_VERT, WATER_FRAG, { side: THREE.DoubleSide, transparent: true, depthWrite: false }));
  water.frustumCulled = false; water.renderOrder = 3; scene.add(water);
  const villageMesh = new THREE.Mesh(vGeo, buildMat), swingMesh = new THREE.Mesh(sGeo, swingMat), forestMesh = new THREE.Mesh(fGeo, buildMat);
  [villageMesh, swingMesh, forestMesh].forEach((m) => { m.frustumCulled = false; scene.add(m); });

  const dummy = new THREE.Object3D();
  const makeLeaves = (list, drape) => {
    const g = clumpGeometry(drape), n = list.length;
    const aI = new Float32Array(n * 4), aCol = new Float32Array(n * 3), aFl = new Float32Array(n * 3);
    const m = new THREE.InstancedMesh(g, shader(LEAF_VERT, LEAF_FRAG, { side: THREE.DoubleSide, alphaToCoverage: true, defines: drape ? { DRAPE: "" } : {} }), n);
    list.forEach((l, i) => {
      dummy.position.copy(l.p); dummy.rotation.set(drape ? 0 : (l.seed - 0.5) * 0.6, l.seed * 47, drape ? 0 : (h1(l.seed * 9) - 0.5) * 0.6); dummy.scale.setScalar(l.s);
      dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
      aI.set([l.cell, l.seed, 0, 0], i * 4); aCol.set(l.col, i * 3); aFl.set(l.fl, i * 3);
    });
    g.setAttribute("aI", new THREE.InstancedBufferAttribute(aI, 4));
    g.setAttribute("aCol", new THREE.InstancedBufferAttribute(aCol, 3));
    g.setAttribute("aFl", new THREE.InstancedBufferAttribute(aFl, 3));
    m.frustumCulled = false;
    scene.add(m);
    return m;
  };
  const leafMesh = makeLeaves(leaves, false), drapeMesh = makeLeaves(drapes, true);

  // the forest floor far below, under the mist
  const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 64).rotateX(-Math.PI / 2), shader(
    "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    `varying vec3 vW;
    void main(){
      float n = fbm(vW.xz * 0.15), m = fbm(vW.xz * 0.9 + 3.);
      vec3 alb = mix(vec3(0.04, 0.06, 0.03), vec3(0.11, 0.13, 0.06), n) * (0.7 + 0.5 * m);
      gl_FragColor = vec4(fogged(shade(alb, vec3(0., 1., 0.), vW, 0.6, 0., 0.), vW), 1.);
    }`));
  scene.add(ground);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), shader(
    "varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }",
    SKY_FRAG, { side: THREE.BackSide, depthWrite: false }));
  sky.renderOrder = -1; sky.frustumCulled = false;
  scene.add(sky);

  // ---- the moon's shadows, rendered once: the village, the swinging things at rest, the leaves cut out
  const SHR = LITE ? 2048 : 3072;
  const shDepth = new THREE.DepthTexture(SHR, SHR);
  shDepth.compareFunction = THREE.LessEqualCompare; shDepth.minFilter = shDepth.magFilter = THREE.LinearFilter;   // hardware PCF
  const shRT = new THREE.WebGLRenderTarget(SHR, SHR, { depthTexture: shDepth, depthBuffer: true });
  const shScene = new THREE.Scene();
  const depthMat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, vertexShader: "void main(){ gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.); }", fragmentShader: "void main(){ gl_FragColor = vec4(1.); }" });
  const leafDepth = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, uniforms: { uAtlas: SU.uAtlas },
    vertexShader: "attribute vec4 aI; varying vec2 vUv; varying float vCell; void main(){ vUv = uv; vCell = aI.x; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.); }",
    fragmentShader: "uniform sampler2D uAtlas; varying vec2 vUv; varying float vCell; void main(){ vec2 off = vec2(mod(vCell, 2.) * 0.5, 0.5 - floor(vCell / 2.) * 0.5); if (texture2D(uAtlas, off + (vUv * 0.96 + 0.02) * 0.5).a < 0.5) discard; gl_FragColor = vec4(1.); }",
  });
  shScene.add(new THREE.Mesh(vGeo, depthMat), new THREE.Mesh(sGeo, depthMat));
  for (const m of [leafMesh, drapeMesh]) { const c = new THREE.InstancedMesh(m.geometry, leafDepth, m.count); c.instanceMatrix = m.instanceMatrix; c.frustumCulled = false; shScene.add(c); }
  const shCam = new THREE.OrthographicCamera(-100, 100, 100, -100, 1, 420);
  shCam.position.set(GC[0], 28, GC[1]).addScaledVector(MOON_DIR, 200); shCam.lookAt(GC[0], 28, GC[1]); shCam.updateMatrixWorld(); shCam.updateProjectionMatrix();
  renderer.setRenderTarget(shRT); renderer.render(shScene, shCam); renderer.setRenderTarget(null);
  SU.uShadow.value = shRT.depthTexture; SU.uShPx.value = 1 / SHR; SU.uShadowM.value.multiplyMatrices(shCam.projectionMatrix, shCam.matrixWorldInverse);

  // ---- the warm lights: the brightest sixteen get a slot
  // the warm lights: there are hundreds; the shaders take NL, so the ones nearest to where you look get the slots
  // (spread out, none within 5 m of another; the ones already in keep their place unless a closer one needs it)
  const allLights = out.lights.filter((l) => l.i > 0);
  let lights = [];
  const focus = V();
  const pickLights = () => {
    focus.copy(camera.position).add(V(0, 0, -22).applyQuaternion(camera.quaternion));
    const ranked = allLights.map((l) => [l, l.p.distanceTo(focus) - (lights.includes(l) ? 5 : 0)]).sort((p, q) => p[1] - q[1]);
    const next = [];
    for (const [l] of ranked) { if (next.length >= NL) break; if (next.every((m) => m.p.distanceTo(l.p) > 5)) next.push(l); }
    lights = next;
    for (let i = 0; i < NL; i++) { const l = lights[i]; SU.uLp.value[i].copy(l ? l.p : V(0, -999, 0)); SU.uLs.value[i] = l ? l.s : 1; if (!l) SU.uLc.value[i].set(0, 0, 0); }
  };

  // ---- glowing points: string lights, halos round the lanterns, fireflies, spores, wisps
  const GP = [], GK = [], GCOL = [];
  const gp = (x, y, z, kind, seed, size, c) => { GP.push(x, y, z); GK.push(kind, seed, size, 0); GCOL.push(...c); };
  const BULB = [[3.2, 1.9, 0.85], [2.8, 1.4, 2.2], [1.4, 2.6, 2.6], [3.0, 2.4, 1.0], [2.2, 1.6, 3.0]];
  for (let i = 0; i < out.bulbs.length; i += 4) gp(out.bulbs[i], out.bulbs[i + 1], out.bulbs[i + 2], 0, h1(i), 0.08, out.bulbs[i + 3] < 0 ? BULB[0] : BULB[Math.floor(out.bulbs[i + 3] * BULB.length)]);
  for (const [x, y, z, br] of HALOS) gp(x, y, z, 1, h1(x + z), 1.7, [0.9 * br / 6, 0.5 * br / 6, 0.22 * br / 6]);
  for (const l of allLights) if (l.c !== WARM) gp(l.p.x, l.p.y, l.p.z, 1, h1(l.p.x), 2.2, l.c.map((c) => c * 0.12));
  const FR = rng(99);
  for (let i = 0, n = LITE ? 400 : 900; i < n; i++) { const t = TREES[i % 4], a = FR() * TAU, r = 4 + 40 * Math.sqrt(FR()); gp(t.x + Math.sin(a) * r, 2 + 38 * FR() ** 1.4, t.z + Math.cos(a) * r, 2, FR(), 0.085, [2.0, 2.5, 0.6]); }
  for (let i = 0, n = LITE ? 300 : 700; i < n; i++) gp(FR(), FR(), FR(), 3, FR(), 0.022, FR() < 0.5 ? [0.5, 0.55, 0.85] : [0.75, 0.55, 0.8]);
  for (let i = 0; i < 30; i++) { const t = TREES[i % 4], a = FR() * TAU, r = 10 + 28 * FR(); gp(t.x + Math.sin(a) * r, 6 + 24 * FR(), t.z + Math.cos(a) * r, 4, FR(), 0.9, [0.35, 0.6, 0.95]); }
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute("position", new THREE.Float32BufferAttribute(GP, 3));
  glowGeo.setAttribute("aK", new THREE.Float32BufferAttribute(GK, 4));
  glowGeo.setAttribute("aCol", new THREE.Float32BufferAttribute(GCOL, 3));
  const glowU = { ...SU, uPx: { value: 800 }, uBox0: { value: V() }, uBox: { value: V(40, 24, 40) } };
  const glowMat = new THREE.ShaderMaterial({ uniforms: glowU, vertexShader: GLSL_COMMON + GLSL_LIGHT + GLOW_VERT, fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const glows = new THREE.Points(glowGeo, glowMat); glows.frustumCulled = false; glows.renderOrder = 6;
  scene.add(glows);

  // ---- mist lying in the forest below, and a few veils drifting between the trees
  const MIST = 70, mistGeo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0));
  {
    const A = new Float32Array(MIST * 4), Bm = new Float32Array(MIST * 4), MR = rng(5);
    for (let i = 0; i < MIST; i++) {
      const a = MR() * TAU, d = 20 + MR() * 160, hi = i % 4 === 0;
      A.set([CTR[0] + Math.sin(a) * d, hi ? 9 + MR() * 14 : -1 + MR() * 4, CTR[1] + Math.cos(a) * d, 20 + MR() * 30], i * 4);
      Bm.set([hi ? 3 + MR() * 3 : 6 + MR() * 6, MR(), hi ? 0.1 + MR() * 0.08 : 0.25 + MR() * 0.2, 0], i * 4);
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
        vec3 c = aA.xyz + vec3(uWind.x, 0., uWind.y) * sin(uTime * 0.02 + aB.y * 6.) * 6.;
        vec3 to = cameraPosition - c; vec3 right = normalize(vec3(to.z, 0., -to.x));
        vec3 w = c + right * (position.x * aA.w) + vec3(0., position.y * aB.x, 0.);
        vW = w;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.);
      }`,
    fragmentShader: `${GLSL_COMMON}${GLSL_LIGHT}
      varying vec2 vUv; varying vec3 vW; varying vec4 vB;
      void main(){
        float n = fbm(vec2(vUv.x * 3. + vB.y * 10. + uTime * 0.01, vUv.y * 1.3 - uTime * 0.008));
        float a = smoothstep(0.35, 0.75, n) * smoothstep(0., 0.35, vUv.y) * smoothstep(1., 0.4, vUv.y) * smoothstep(0., 0.25, vUv.x) * smoothstep(1., 0.75, vUv.x);
        a *= vB.z * smoothstep(3., 14., distance(cameraPosition, vW));
        vec3 col = fogSky(normalize(vW - cameraPosition)) * 1.15 + warm(vW, normalize(cameraPosition - vW), 1.) * 0.35 + uMoonCol * 0.08;
        gl_FragColor = vec4(col, a);
      }`,
  }));
  mist.frustumCulled = false; mist.renderOrder = 4;
  scene.add(mist);

  // ---- smoke from the stovepipes: soft puffs on the CPU, rising and drifting downwind
  const MAXP = 120;
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
        vW = aP.xyz + (right * q.x + up * q.y) * aP.w;
        gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.);
      }`,
    fragmentShader: `${GLSL_COMMON}${GLSL_LIGHT}
      varying vec2 vUv; varying vec4 vQ; varying vec3 vW;
      void main(){
        float d = length(vUv - 0.5) * 2., n = fbm(vUv * 2.6 + vQ.z * 17. + vec2(0., -vQ.y * 0.8));
        float a = smoothstep(1., 0.25, d + (n - 0.5) * 0.9) * vQ.x;
        if (a < 0.003) discard;
        vec3 col = mix(vec3(0.3, 0.3, 0.36), vec3(0.6, 0.6, 0.68), n) * (uSkyA * 1.5 + uMoonCol * 0.35) + warm(vW, vec3(0., -1., 0.), 1.) * 0.25;
        gl_FragColor = vec4(fogged(col, vW), a);
      }`,
  }));
  smoke.frustumCulled = false; smoke.renderOrder = 5;
  scene.add(smoke);
  const puffs = [];
  const smokeAcc = out.smoke.map(() => 0);
  const D = rng(31);

  // ---- small moving parts: weathervanes on the domes, windmills on the barrels, baskets on pulleys, the cable car
  const part = (fn) => { const pb = builder(); fn(pb); const m = new THREE.Mesh(pb.geometry(), buildMat); m.frustumCulled = false; return m; };
  const copies = (m, n) => Array.from({ length: n }, () => { const c = new THREE.Mesh(m.geometry, buildMat); c.frustumCulled = false; scene.add(c); return c; });
  const vane = part((p) => {
    p.room(0, 0, 0); p.set(MAT.METAL, IRON, 1601, 0.2);
    p.beam(V(0, -0.2, 0), V(0, 1.0, 0), 0.04, 0.04);
    p.beam(V(-0.4, 0.45, 0), V(0.4, 0.45, 0), 0.03, 0.03); p.beam(V(0, 0.45, -0.4), V(0, 0.45, 0.4), 0.03, 0.03);
    p.set(MAT.METAL, COPPER, 1602, 0.8); p.beam(V(0, 0.85, -0.55), V(0, 0.85, 0.55), 0.03, 0.03);
    p.quad(V(0, 0.75, -0.75), V(0, 0.75, -0.45), V(0, 1.0, -0.45), V(0, 1.05, -0.8));
    p.tri([0, 0.75, 0.55, 1, 0, 0, 0, 0], [0, 0.95, 0.55, 1, 0, 0, 1, 0], [0, 0.85, 0.75, 1, 0, 0, 0.5, 1]);
  });
  const vanes = copies(vane, out.vanes.length);
  vanes.forEach((v, i) => v.position.copy(out.vanes[i]));
  const mill = part((p) => {
    p.room(0, 0, 0); p.set(MAT.WOOD, TIMBER, 1611); p.lathe([[0.08, -0.1], [0.08, 0.1]], 8);
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU, d = V(Math.cos(a), Math.sin(a), 0), s = V(-Math.sin(a), Math.cos(a), 0);
      p.set(MAT.WOOD, TIMBER, 1612 + k); p.beam(V(0, 0, 0.05), d.clone().multiplyScalar(1.15).setZ(0.05), 0.04, 0.03);
      p.set(MAT.FABRIC, k % 2 ? [0.85, 0.8, 0.7] : [0.72, 0.35, 0.3], 1620 + k);
      const q0 = d.clone().multiplyScalar(0.25), q1 = d.clone().multiplyScalar(1.1);
      p.quad(q0, q1, q1.clone().addScaledVector(s, 0.32), q0.clone().addScaledVector(s, 0.2));
    }
  });
  const mills = copies(mill, out.mills.length);
  mills.forEach((m, i) => { m.position.copy(out.mills[i].p); m.rotation.order = "YXZ"; m.rotation.y = out.mills[i].yaw + Math.PI / 2; });
  const basket = part((p) => {
    p.room(0, 0, 0); p.set(MAT.ROPE, [0.55, 0.42, 0.25], 1631); p.lathe([[0.3, -0.3], [0.38, 0.05], [0.4, 0.1]], 14, { uFrac: true });
    p.set(MAT.ROPE, [0.45, 0.38, 0.28], 1632); for (let k = 0; k < 4; k++) { const a = k / 4 * TAU; p.tube([V(Math.sin(a) * 0.38, 0.1, Math.cos(a) * 0.38), V(0, 0.9, 0)], 0.012, 3); }
    p.set(MAT.LANTERN, [1.0, 0.6, 0.3], 1633, 3); p.push(new THREE.Matrix4().makeTranslation(0, 0.12, 0)); p.lathe([[0.06, 0], [0.09, 0.08], [0.06, 0.18]], 8, { uFrac: true }); p.pop();
  });
  const baskets = copies(basket, out.baskets.length);
  // the cable car: a little cabin with lit windows under a trolley, crossing between the stations and resting at each
  const cabin = (col, roof) => part((p) => {
    p.room(0, -2.6, 0, 0);
    boxWalls(p, 1.5, 1.3, 1.35, MAT.PLANK, col, 1650, { floor: true });
    boxSides(p, 1.5, 1.3, { "z+": [{ a: 0.75, w: 0.95, h: 0.62, y: 0.5 }], "z-": [{ a: 0.75, w: 0.95, h: 0.62, y: 0.5 }], "x+": [{ a: 0.65, w: 0.5, h: 0.62, y: 0.5 }], "x-": [{ a: 0.65, w: 0.5, h: 0.62, y: 0.5 }] }, 1651, null);
    gableRoof(p, 1.5, 1.3, 1.35, 0.45, 0.12, MAT.SHINGLE, roof, MAT.PLANK, col, 1652);
    p.room(0, 0, 0, 0); p.set(MAT.METAL, IRON, 1653, 0.1);
    p.beam(V(0, -0.85, 0), V(0, 0.05, 0), 0.07, 0.07); p.beam(V(-0.35, 0.05, 0), V(0.35, 0.05, 0), 0.06, 0.12);
    for (const x of [-0.3, 0.3]) { p.push(new THREE.Matrix4().makeTranslation(x, 0.1, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))); p.lathe([[0.1, -0.03], [0.1, 0.03]], 10); p.pop(); }
  });
  const cabins = [cabin([0.62, 0.22, 0.2], [0.25, 0.3, 0.42]), cabin([0.3, 0.46, 0.52], [0.5, 0.25, 0.2]), cabin([0.8, 0.62, 0.3], [0.3, 0.38, 0.28])];
  const gondolas = out.cables.flatMap((_, i) => [0, 1].map((k) => copies(cabins[(i + k) % 3], 1)[0]));
  // the lifts: an open cage with a lamp in it, its counterweight, and the ropes up to the pulley (stretched each frame)
  const cage = part((p) => {
    p.room(0, 0, 0, 0); p.set(MAT.DECK, [0.5, 0.42, 0.34], 1660); p.box(0, -0.06, 0, 1.7, 0.12, 1.7);
    p.set(MAT.WOOD, TIMBER, 1661); for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]) p.box(x, 1.05, z, 0.08, 2.1, 0.08);
    p.box(0, 2.15, 0, 1.8, 0.1, 1.8); p.beam(V(0, 2.2, 0), V(0, 2.45, 0), 0.08, 0.08);
    p.set(MAT.BOARDV, [0.55, 0.3, 0.22], 1662); p.box(0, 0.45, 0.82, 1.6, 0.9, 0.04); p.box(0.82, 0.45, 0, 0.04, 0.9, 1.6); p.box(-0.82, 0.45, 0, 0.04, 0.9, 1.6);
    p.set(MAT.WOOD, TIMBER, 1663); p.box(0, 1.0, -0.82, 1.6, 0.06, 0.06);
    p.set(MAT.LANTERN, [1.0, 0.6, 0.3], 1664, 4); p.push(new THREE.Matrix4().makeTranslation(0, 1.7, 0)); p.lathe([[0.09, 0], [0.14, 0.12], [0.09, 0.26]], 10, { uFrac: true }); p.pop();
  });
  const weight = part((p) => { p.room(0, 0, 0, 0); p.set(MAT.METAL, IRON, 1670, 0.1); p.box(0, 0.5, 0, 0.35, 1.0, 0.35); });
  const rope = part((p) => { p.room(0, 0, 0, 0); p.set(MAT.ROPE, [0.45, 0.38, 0.28], 1671); p.tube([V(0, 0, 0), V(0, 1, 0)], 0.022, 4); });
  const liftParts = out.lifts.map(() => ({ cage: copies(cage, 1)[0], weight: copies(weight, 1)[0], r1: copies(rope, 1)[0], r2: copies(rope, 1)[0] }));

  // ---- sky lanterns, let go on request: paper lanterns that rise, drift and dwindle
  const MAXL = 36;
  const slGeo = new THREE.LatheGeometry([[0.2, 0], [0.26, 0.15], [0.3, 0.55], [0.22, 0.7]].map(([x, y]) => new THREE.Vector2(x, y)), 12);
  const slMat = new THREE.ShaderMaterial({
    uniforms: SU, side: THREE.DoubleSide,
    vertexShader: `${GLSL_COMMON} attribute float aB; varying float vB; varying vec3 vW; varying vec2 vUv; void main(){ vB = aB; vUv = uv; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `${GLSL_COMMON}${GLSL_LIGHT} varying float vB; varying vec3 vW; varying vec2 vUv;
      void main(){ float f = 0.85 + 0.15 * sin(uTime * 9. + vW.x * 3.); vec3 c = vec3(1.0, 0.5, 0.2) * (2.5 + 2. * vUv.y * (1. - vUv.y) * 4.) * f * vB * (1. - 0.4 * smoothstep(0.85, 1., abs(sin(vUv.x * 37.7))));
        gl_FragColor = vec4(fogged(c, vW), 1.); }`,
  });
  const slMesh = new THREE.InstancedMesh(slGeo, slMat, MAXL);
  const slB = new Float32Array(MAXL);
  slGeo.setAttribute("aB", new THREE.InstancedBufferAttribute(slB, 1).setUsage(THREE.DynamicDrawUsage));
  slMesh.count = 0; slMesh.frustumCulled = false;
  scene.add(slMesh);
  const slGlowGeo = new THREE.BufferGeometry();
  slGlowGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAXL * 3), 3).setUsage(THREE.DynamicDrawUsage));
  slGlowGeo.setAttribute("aK", new THREE.BufferAttribute(new Float32Array(MAXL * 4), 4).setUsage(THREE.DynamicDrawUsage));
  slGlowGeo.setAttribute("aCol", new THREE.BufferAttribute(new Float32Array(MAXL * 3).fill(0.5).map((_, i) => [0.9, 0.42, 0.15][i % 3]), 3));
  const slGlow = new THREE.Points(slGlowGeo, glowMat); slGlow.frustumCulled = false; slGlow.renderOrder = 6;
  scene.add(slGlow);
  const skyL = [];
  const release = () => {
    for (let k = 0; k < 6 && skyL.length < MAXL; k++) {
      const p = out.launch[Math.floor(D() * out.launch.length)].clone().add(V((D() - 0.5) * 1.5, 1.0, (D() - 0.5) * 1.5));
      skyL.push({ p, v: V((D() - 0.5) * 0.2, 0.15, (D() - 0.5) * 0.2), age: -k * 0.7 - D() * 0.5, seed: D(), life: 80 + D() * 30 });
    }
  };

  // ---- input. The mouse looks round (its position, across the whole window). Panning (←/→, A/D, or dragging sideways) slides
  // the point you look at across the group and leaves it where you let go (it coasts to a stop; nothing pulls it back). The
  // only thing that snaps is the point you circle: it is always the centre of the tree nearest the focus (`nearest`), so
  // Q/E (or Shift/right-drag, or two fingers) and the glide (off by default, G) turn the whole view about that tree. ↑/↓ or dragging
  // up/down rise and sink; the wheel, +/− or a pinch come closer. T glides the focus over to the next tree.
  let ang = VIEW0.ang, angT = ang, h = VIEW0.h, hT = h, dist = VIEW0.dist, distT = dist, dEff = dist;
  let ci = 0, cx = CENTRES[0].x, cz = CENTRES[0].z, cLook = CENTRES[0].look, lightTick = 0;       // ci: the centre you settle on (0 = the group)
  let lookX = 0, lookY = 0, lookXT = 0, lookYT = 0, keyPan = 0, keyOrb = 0, keyH = 0, keyZoom = 0, glide = false, glideDir = 1, roll = 0, angPrev = ang;
  let pvel = 0, fvx = 0, fvz = 0, dragM = 0, goTo = false, shiftHeld = false;       // the focus's velocity, metres dragged this frame, gliding to a centre (T)
  const SETTLE = 6.5, ARENA = 90;                                                                // spring rate for T (settled in ~1 s), how far the focus may stray from the group's middle
  addEventListener("pointermove", (e) => { if (e.pointerType !== "mouse" || e.buttons) return; if (e.target !== canvasEl) { lookXT = lookYT = 0; return; } lookXT = (e.clientX / innerWidth - 0.5) * 1.1; lookYT = -(e.clientY / innerHeight - 0.5) * 0.6; }, { passive: true });
  document.addEventListener("mouseout", (e) => { if (!e.relatedTarget) { lookXT = 0; lookYT = 0; } });
  const touches = new Map();
  let pinch = 0;
  const spread = () => { const [p, q] = [...touches.values()]; return Math.hypot(p[0] - q[0], p[1] - q[1]); };
  const midX = () => { let m = 0; touches.forEach((p) => { m += p[0]; }); return m / touches.size; };
  let tapDown = null, tapPrev = null;                                // a quick press without moving is a tap; two in a row (double-click, double-tap) centre on the nearest tree
  canvasEl.addEventListener("pointerdown", (e) => {
    touches.set(e.pointerId, [e.clientX, e.clientY, e.shiftKey || e.button !== 0 ? 1 : 0]);
    if (touches.size === 2) { pinch = spread(); if (tapDown) tapDown.bad = true; }
    else if (touches.size === 1) tapDown = { x: e.clientX, y: e.clientY, t: e.timeStamp, bad: e.button !== 0 };
  });
  canvasEl.addEventListener("contextmenu", (e) => e.preventDefault());
  const endTouch = (e) => {
    const was = touches.has(e.pointerId);
    touches.delete(e.pointerId); pinch = touches.size === 2 ? spread() : 0;
    if (!was || touches.size || !tapDown || e.type === "pointercancel") return;
    const td = tapDown; tapDown = null;
    if (td.bad || e.timeStamp - td.t > 350 || Math.hypot(e.clientX - td.x, e.clientY - td.y) > 8) { tapPrev = null; return; }
    if (tapPrev && e.timeStamp - tapPrev.t < 400 && Math.hypot(e.clientX - tapPrev.x, e.clientY - tapPrev.y) < 30) { tapPrev = null; nextCentre(nearest(cx, cz)); }
    else tapPrev = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  };
  addEventListener("pointerup", endTouch); addEventListener("pointercancel", endTouch);
  addEventListener("pointermove", (e) => {
    const p = touches.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p[0], dy = e.clientY - p[1], m0 = midX();
    p[0] = e.clientX; p[1] = e.clientY;
    if (tapDown && Math.hypot(e.clientX - tapDown.x, e.clientY - tapDown.y) > 8) tapDown.bad = true;
    if (touches.size === 1) {
      hT = clamp(hT + dy / innerHeight * 45, HMIN, HMAX);
      if (p[2]) { angT -= dx / innerWidth * 3.2; if (Math.abs(dx) > 1) glideDir = dx > 0 ? -1 : 1; }     // Shift or right button: circle the tree
      else dragM -= dx / innerWidth * 2 * dEff * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;   // the scene follows the finger
    } else if (touches.size === 2) {
      const s = spread(); if (pinch > 0) distT = clamp(distT * pinch / Math.max(s, 1), DMIN, DMAX); pinch = s;
      angT -= (midX() - m0) / innerWidth * 3.2;                                                        // two fingers sideways circle the tree
    }
  }, { passive: true });
  addEventListener("wheel", (e) => {                                  // pixels, lines or pages; a trackpad pinch arrives as ctrl+wheel with small steps
    e.preventDefault();
    const d = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1) * (e.ctrlKey ? 4 : 1);
    distT = clamp(distT * Math.exp(d * 0.0018), DMIN, DMAX);
  }, { passive: false });
  // [pan, circle, rise, zoom]
  const KEYS = { arrowleft: [-1, 0, 0, 0], a: [-1, 0, 0, 0], arrowright: [1, 0, 0, 0], d: [1, 0, 0, 0], q: [0, -1, 0, 0], e: [0, 1, 0, 0],
    arrowup: [0, 0, 1, 0], w: [0, 0, 1, 0], arrowdown: [0, 0, -1, 0], s: [0, 0, -1, 0], "+": [0, 0, 0, -1], "=": [0, 0, 0, -1], "-": [0, 0, 0, 1], _: [0, 0, 0, 1] };
  addEventListener("keydown", (e) => {
    shiftHeld = e.shiftKey;                                           // Shift with a key: 2.5 times faster
    const k = KEYS[e.key.toLowerCase()]; if (!k || e.metaKey || e.ctrlKey || e.altKey) return;
    if (k[0]) keyPan = k[0]; if (k[1]) { keyOrb = k[1]; glideDir = k[1]; } if (k[2]) keyH = k[2]; if (k[3]) keyZoom = k[3];
  });
  addEventListener("keyup", (e) => { shiftHeld = e.shiftKey; const k = KEYS[e.key.toLowerCase()]; if (!k) return; if (k[0] && keyPan === k[0]) keyPan = 0; if (k[1]) keyOrb = 0; if (k[2]) keyH = 0; if (k[3]) keyZoom = 0; });
  addEventListener("blur", () => { keyPan = keyOrb = keyH = keyZoom = 0; shiftHeld = false; });
  // the tree nearest the line of sight from a focus point: sideways distance counts fully, depth only a little, so
  // panning along the view takes in the trees in the order they stand across the screen. The one you are on holds on
  // until another is clearly nearer.
  const nearest = (fx, fz) => {
    let best = 1, bd = Infinity;
    for (let i = 1; i < CENTRES.length; i++) { const d = (CENTRES[i].x - fx) ** 2 + (CENTRES[i].z - fz) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  };

  const resize = () => {
    const w = canvasEl.clientWidth || innerWidth, hh = canvasEl.clientHeight || innerHeight;
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh;
    camera.fov = camera.aspect < 1 ? 72 : 50;
    camera.updateProjectionMatrix();
    glowU.uPx.value = renderer.domElement.height * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    post.setSize();
  };
  addEventListener("resize", resize); resize();

  // ---- dusk and night
  const DUSK = { moon: [0.42, 0.44, 0.6], skyA: [0.055, 0.06, 0.12], skyG: [0.012, 0.013, 0.02], hor: [0.042, 0.044, 0.088], glow: [0.2, 0.085, 0.1] };
  const NIGHT = { moon: [0.2, 0.24, 0.37], skyA: [0.025, 0.03, 0.06], skyG: [0.007, 0.008, 0.013], hor: [0.045, 0.05, 0.095], glow: [0.015, 0.008, 0.012] };
  const mixv = (v, p, q, t) => v.set(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t);
  let night = 0, nightT = 0;

  let last = performance.now(), raf = 0, visible = true, slow = 0, tNow = reduced ? 40 : 0, dbgCam = null;
  const look = V(), mtx = new THREE.Matrix4();
  function frame(dt) {
    tNow += dt;
    const t = tNow;
    SU.uTime.value = t;
    night += (nightT - night) * (dt > 0 ? 1 - Math.exp(-dt * 0.35) : 1);
    SU.uNight.value = night;
    mixv(SU.uMoonCol.value, DUSK.moon, NIGHT.moon, night); mixv(SU.uSkyA.value, DUSK.skyA, NIGHT.skyA, night); mixv(SU.uSkyG.value, DUSK.skyG, NIGHT.skyG, night);
    mixv(SU.uHor.value, DUSK.hor, NIGHT.hor, night); mixv(SU.uGlowCol.value, DUSK.glow, NIGHT.glow, night);
    if (lightTick-- <= 0 || dt === 0) { pickLights(); lightTick = 8; }
    lights.forEach((l, i) => { const f = 0.9 + 0.06 * Math.sin(t * 7.1 + i * 3.1) + 0.04 * Math.sin(t * 12.9 + i); SU.uLc.value[i].set(...l.c).multiplyScalar(l.i * f * (1 + night * 0.25)); });
    post.U.uExposure.value = 1.25 + night * 0.45;

    // panning slides the focus across the group and lets go onto the nearest tree; flying round the tree is on its circle,
    // pushed out wherever the village reaches further. Responsive: the camera catches up with what you ask in a fraction
    // of a second, with only a little give; only the settle onto a tree is eased
    const k = dt > 0 ? 1 - Math.exp(-dt * 7) : 1;
    const panDrag = touches.size === 1 && !touches.values().next().value[2], pan = keyPan !== 0 || panDrag;
    if (glide && !keyOrb && !pan && touches.size === 0) angT += glideDir * dt * 1.8 / Math.max(dist, 15);
    const bo = shiftHeld ? 2.5 : 1;
    angT += keyOrb * dt * 0.75 * bo;                                       // about 43 degrees a second, near or far
    hT = clamp(hT + keyH * dt * 10 * bo, HMIN, HMAX); distT = clamp(distT * Math.exp(keyZoom * dt * 1.1 * bo), DMIN, DMAX);
    const angOld = ang;
    ang += (angT - ang) * k; h += (hT - h) * k; dist += (distT - dist) * k;
    if (ang !== angOld) {                                             // circling turns the whole rig about the tree's centre, wherever the focus is
      const P = CENTRES[ci], da = ang - angOld, c = Math.cos(da), s = Math.sin(da), ox = cx - P.x, oz = cz - P.z;
      cx = P.x + ox * c + oz * s; cz = P.z - ox * s + oz * c;
    }
    const rx = Math.cos(ang), rz = -Math.sin(ang);                    // screen-right on the ground
    if (dt > 0) {
      if (pan) {
        goTo = false;
        if (keyPan) { pvel += (keyPan * (22 + 0.25 * dist) * bo - pvel) * k; cx += rx * pvel * dt; cz += rz * pvel * dt; }
        else { cx += rx * dragM; cz += rz * dragM; pvel += (dragM / dt - pvel) * (1 - Math.exp(-dt * 20)); }
        fvx = rx * pvel; fvz = rz * pvel;
      } else if (goTo) {                                              // T: glide over to the chosen centre
        const T = CENTRES[ci];
        if (reduced) { cx = T.x; cz = T.z; fvx = fvz = 0; goTo = false; }
        else for (let n = Math.ceil(dt / 0.016), s = dt / n; n--;) {  // critically damped
          fvx += (SETTLE * SETTLE * (T.x - cx) - 2 * SETTLE * fvx) * s; fvz += (SETTLE * SETTLE * (T.z - cz) - 2 * SETTLE * fvz) * s;
          cx += fvx * s; cz += fvz * s;
        }
        if (Math.hypot(T.x - cx, T.z - cz) < 0.01 && Math.hypot(fvx, fvz) < 0.02) { cx = T.x; cz = T.z; fvx = fvz = 0; goTo = false; }
        pvel = fvx * rx + fvz * rz;
      } else {                                                        // let go: coast to a stop, the focus stays where it is
        const f = Math.exp(-dt * 6);
        cx += fvx * dt; cz += fvz * dt; fvx *= f; fvz *= f;
        if (Math.hypot(fvx, fvz) < 0.02) fvx = fvz = 0;
        pvel = fvx * rx + fvz * rz;
      }
      if (!goTo && (pan || fvx || fvz)) {
        const off = Math.hypot(cx - GC[0], cz - GC[1]); if (off > ARENA) { cx = GC[0] + (cx - GC[0]) * ARENA / off; cz = GC[1] + (cz - GC[1]) * ARENA / off; }
        ci = nearest(cx, cz);                                         // the point you circle is always the nearest tree's centre
      }
    }
    dragM = 0;
    const C = CENTRES[ci];
    cLook += (C.look - cLook) * (dt > 0 ? 1 - Math.exp(-dt * 3) : 1);
    const want = clearR(cx, cz, ang, h, dist);
    dEff += (want - dEff) * (dt > 0 ? 1 - Math.exp(-dt * (want > dEff ? 8 : 4)) : 1);
    const px = cx + Math.sin(ang) * dEff, pz = cz + Math.cos(ang) * dEff, py = h + Math.sin(t * 0.37) * 0.25;
    lookX += (lookXT - lookX) * k; lookY += (lookYT - lookY) * k;
    const yaw0 = Math.atan2(cx - px, cz - pz), pitch0 = Math.atan2(lerp(h, cLook, 0.5) - py, dEff);
    const yaw = yaw0 - lookX, pitch = clamp(pitch0 + lookY, -1.2, 1.2);
    camera.position.set(px, py, pz);
    look.set(px + Math.sin(yaw) * Math.cos(pitch), py + Math.sin(pitch), pz + Math.cos(yaw) * Math.cos(pitch));
    camera.up.set(0, 1, 0); camera.lookAt(look);
    const w = dt > 0 ? (ang - angPrev) / dt * dEff + fvx * rx + fvz * rz : 0; angPrev = ang;      // sideways speed banks the camera
    roll += (clamp(w * 0.02, -0.06, 0.06) - roll) * k;
    camera.rotateZ(roll);
    if (dbgCam) { camera.position.copy(dbgCam[0]); camera.up.set(0, 1, 0); camera.lookAt(dbgCam[1]); }
    sky.position.copy(camera.position);
    glowU.uBox0.value.set(camera.position.x - 20, camera.position.y - 12, camera.position.z - 20);

    // the moving parts
    vanes.forEach((v, i) => { v.rotation.y = 0.6 + Math.sin(t * 0.13) * 0.5 + Math.sin(t * 0.71 + i) * 0.08; });
    mills.forEach((m, i) => { m.rotation.z = -t * (0.9 + 0.3 * Math.sin(t * 0.2 + i)) - i; });
    baskets.forEach((bk, i) => {
      const bt = out.baskets[i].top, cyc = (t * 0.035 + out.baskets[i].ph) % 1, travel = bt.y - 4.5;
      bk.position.set(bt.x, bt.y - 1.0 - travel * (0.5 - 0.5 * Math.cos(Math.min(1, Math.abs(cyc * 2 - 1) * 1.25) * Math.PI)), bt.z);
    });
    gondolas.forEach((g, j) => {             // the two cabins of a line go opposite ways and pass in the middle
      const i = j >> 1, k = j & 1, { A, B, sag, P } = out.cables[i], L = A.distanceTo(B), trip = L / 2.2, cyc = ((t + i * 23) / (trip + 12)) % 2;
      const leg = cyc % 1, f = clamp((leg * (trip + 12) - 6) / trip, 0, 1), u0 = f * f * (3 - 2 * f), u1 = cyc < 1 ? u0 : 1 - u0, u = k ? 1 - u1 : u1;
      const tt = clamp(u, 0.05, 0.95), p = A.clone().lerp(B, tt).add(V(0, -sag * 4 * tt * (1 - tt), 0)).addScaledVector(P, k ? -1 : 1);
      g.position.copy(p); g.rotation.order = "YXZ"; g.rotation.y = Math.atan2(B.x - A.x, B.z - A.z) + Math.PI / 2;
      g.rotation.z = Math.sin(t * 0.9 + j) * 0.025 * (u0 > 0 && u0 < 1 ? 1 : 0.3);
    });
    liftParts.forEach((lp, i) => {          // wait at the bottom, up, wait at the top, down
      const L = out.lifts[i], travel = (L.y1 - L.y0) / 1.8, per = 2 * travel + 16, c = (t + L.ph) % per;
      const u = c < 8 ? 0 : c < 8 + travel ? (c - 8) / travel : c < 16 + travel ? 1 : 1 - (c - 16 - travel) / travel;
      const e = u * u * (3 - 2 * u), y = lerp(L.y0, L.y1, e), wy = lerp(L.y1 - 0.5, L.y0 + 1, e);
      const ox = Math.cos(L.yaw) * 1.4, oz = -Math.sin(L.yaw) * 1.4;      // the counterweight runs outside the tower's side
      lp.cage.position.set(L.x, y, L.z); lp.cage.rotation.y = L.yaw;
      lp.weight.position.set(L.x + ox, wy, L.z + oz); lp.weight.rotation.y = L.yaw;
      lp.r1.position.set(L.x, y + 2.45, L.z); lp.r1.scale.set(1, Math.max(0.1, L.top - y - 2.45), 1);
      lp.r2.position.set(L.x + ox, wy + 1.0, L.z + oz); lp.r2.scale.set(1, Math.max(0.1, L.top - wy - 1.0), 1);
    });

    // smoke
    if (dt > 0 || puffs.length === 0) {
      const steps = puffs.length === 0 ? 250 : 1, hs = puffs.length === 0 ? 0.1 : dt;
      for (let s = 0; s < steps; s++) {
        out.smoke.forEach((c, i) => {
          smokeAcc[i] += hs * 1.4;
          while (smokeAcc[i] > 1 && puffs.length < MAXP) { smokeAcc[i] -= 1; puffs.push({ p: c.clone(), v: V((D() - 0.5) * 0.1, 0.7 + D() * 0.3, (D() - 0.5) * 0.1), age: 0, life: 10 + D() * 6, seed: D(), rot: D() * TAU, spin: (D() - 0.5) * 0.3 }); }
        });
        const wx = SU.uWind.value.x, wz = SU.uWind.value.y;
        for (let i = puffs.length - 1; i >= 0; i--) {
          const q = puffs[i]; q.age += hs;
          if (q.age > q.life) { puffs.splice(i, 1); continue; }
          q.v.x += (wx * 0.6 * smooth(0, 4, q.age) - q.v.x) * hs * 0.6; q.v.z += (wz * 0.6 * smooth(0, 4, q.age) - q.v.z) * hs * 0.6;
          q.v.y += (0.6 * Math.max(0.2, 1 - q.age * 0.1) - q.v.y) * hs * 0.5;
          q.p.addScaledVector(q.v, hs); q.rot += q.spin * hs;
        }
      }
      puffs.forEach((q, i) => {
        const a = q.age / q.life;
        sP.set([q.p.x, q.p.y, q.p.z, 0.25 + q.age * 0.3 + a * a * 1.5], i * 4);
        sQ.set([0.32 * smooth(0, 0.06, a) * (1 - smooth(0.4, 1, a)), a, q.seed, q.rot], i * 4);
      });
      smokeGeo.instanceCount = puffs.length;
      smokeGeo.attributes.aP.needsUpdate = true; smokeGeo.attributes.aQ.needsUpdate = true;
    }

    // sky lanterns
    if (skyL.length || slMesh.count) {
      const gpos = slGlowGeo.attributes.position.array, gk = slGlowGeo.attributes.aK.array;
      let n = 0;
      for (let i = skyL.length - 1; i >= 0; i--) {
        const L = skyL[i]; L.age += dt;
        if (L.age > L.life) { skyL.splice(i, 1); continue; }
        if (L.age < 0) continue;
        const up = smooth(0, 4, L.age);
        L.v.x += (SU.uWind.value.x * 0.9 * up + Math.sin(t * 0.3 + L.seed * 20) * 0.2 - L.v.x) * dt * 0.3;
        L.v.z += (SU.uWind.value.y * 0.9 * up + Math.cos(t * 0.27 + L.seed * 30) * 0.2 - L.v.z) * dt * 0.3;
        L.v.y += ((0.6 + L.seed * 0.5) * up + 0.05 - L.v.y) * dt * 0.5;
        L.p.addScaledVector(L.v, dt);
      }
      for (const L of skyL) {
        if (L.age < 0) continue;
        const br = smooth(0, 1.5, L.age) * (1 - smooth(L.life - 15, L.life, L.age));
        dummy.position.copy(L.p); dummy.rotation.set(Math.sin(t * 0.8 + L.seed * 9) * 0.08, L.seed * 6, Math.cos(t * 0.7 + L.seed * 7) * 0.08); dummy.scale.setScalar(1);
        dummy.updateMatrix(); slMesh.setMatrixAt(n, dummy.matrix); slB[n] = br;
        gpos.set([L.p.x, L.p.y + 0.3, L.p.z], n * 3); gk.set([5, br, 1.8, 0], n * 4);
        n++;
      }
      slMesh.count = n; slMesh.instanceMatrix.needsUpdate = true; slGeo.attributes.aB.needsUpdate = true;
      slGlowGeo.setDrawRange(0, n); slGlowGeo.attributes.position.needsUpdate = true; slGlowGeo.attributes.aK.needsUpdate = true;
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

  const toggleNight = () => { nightT = nightT > 0.5 ? 0 : 1; return nightT === 1; };
  const setNight = (v) => { night = nightT = v; };
  const toggleGlide = () => { glide = !glide; return glide; };
  const zoomBy = (d) => { distT = clamp(distT + d, DMIN, DMAX); };
  // fly round the next tree (or the whole group): the circle's centre glides over, you come in to its distance
  const nextCentre = (i = (ci + 1) % CENTRES.length) => { ci = i; goTo = true; pvel = 0; distT = CENTRES[ci].dist; hT = clamp(CENTRES[ci].h + (hT - CENTRES[ci].h) * 0.3, HMIN, HMAX); return ci; };
  // back to the opening view: all four trees, from where you started
  const resetView = () => { nextCentre(0); angT = VIEW0.ang + TAU * Math.round((angT - VIEW0.ang) / TAU); hT = VIEW0.h; distT = VIEW0.dist; return ci; };
  const rise = (d) => { hT = clamp(hT + d, HMIN, HMAX); };
  // for screenshots: where you are on the circle (degrees), how far out, how high, and where you look
  const setView = (angDeg = THREE.MathUtils.radToDeg(VIEW0.ang), d = VIEW0.dist, hh = VIEW0.h, lookXDeg = 0, lookYDeg = 0, centre = 0) => {
    ci = centre; cx = CENTRES[ci].x; cz = CENTRES[ci].z; cLook = CENTRES[ci].look; fvx = fvz = pvel = dragM = 0; goTo = false;
    ang = angT = angPrev = THREE.MathUtils.degToRad(angDeg); dist = distT = d; h = hT = hh;
    dEff = clearR(cx, cz, ang, h, d); lookX = lookXT = THREE.MathUtils.degToRad(lookXDeg); lookY = lookYT = THREE.MathUtils.degToRad(lookYDeg); roll = 0;
  };
  const lookAt = (p, q) => { dbgCam = p ? [V(...p), V(...q)] : null; };
  return {
    renderer, frame, toggleNight, setNight, toggleGlide, zoomBy, rise, setView, nextCentre, resetView, get centre() { return ci; }, look: lookAt, release, scene, camera, SU,
    get night() { return nightT > 0.5; }, get glide() { return glide; }, get height() { return (h - HMIN) / (HMAX - HMIN); },
    parts: { water: out.waterLegs, lifts: out.lifts, cables: out.cables, spouts: out.spouts || [], pipes: out.pipes || [] },
    stats: { houses: out.houses, bridges: out.bridges, lifts: out.lifts.length, cables: out.cables.length, water: out.wb.count() / 3, tris: (vGeo.attributes.position.count + sGeo.attributes.position.count + fGeo.attributes.position.count) / 3, leaves: leaves.length, drapes: drapes.length, lights: allLights.length, bulbs: out.bulbs.length / 4, info: renderer.info.render },
  };
}
