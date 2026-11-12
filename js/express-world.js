// The Express's world: a loop of track 15.6 km round a mountain massif, on its shoulder, crossing five gorges on stone
// viaducts, with the valley falling away outside the loop and higher ranges beyond it, under a storm sky on an autumn
// evening. Everything here is in world metres (y up, the massif at the origin) and is drawn in the first of the two
// passes (`express3d.js` draws the train over it). Seeded and deterministic: the same landscape on every load.

import * as THREE from "three";

export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const h1 = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
export const vn2 = (x, z) => { const i = Math.floor(x), j = Math.floor(z), f = x - i, g = z - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g), h = (a, b) => h1(a * 57.3 + b * 113.1);
  return h(i, j) * (1 - u) * (1 - v) + h(i + 1, j) * u * (1 - v) + h(i, j + 1) * (1 - u) * v + h(i + 1, j + 1) * u * v; };
export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- the loop of track
// a wobbling circle round the massif (min radius of curvature ~540 m), resampled every DS metres of arc length
const rLoop = (p) => 2350 + 240 * Math.sin(3 * p + 0.4) + 130 * Math.sin(5 * p + 1.9) + 75 * Math.sin(9 * p + 0.7);
const NPH = 60000;
const lenT = new Float64Array(NPH + 1);
{
  let px = rLoop(0), pz = 0;
  for (let i = 1; i <= NPH; i++) { const p = i / NPH * TAU, r = rLoop(p), x = r * Math.cos(p), z = r * Math.sin(p); lenT[i] = lenT[i - 1] + Math.hypot(x - px, z - pz); px = x; pz = z; }
}
export const LOOP = lenT[NPH];
export const NS = Math.round(LOOP / 2), DS = LOOP / NS;
const TX = new Float64Array(NS), TZ = new Float64Array(NS), TY = new Float64Array(NS), PHI = new Float64Array(NS);
{
  let j = 0;
  for (let k = 0; k < NS; k++) {
    const target = k * DS;
    while (lenT[j + 1] < target) j++;
    const p = (j + (target - lenT[j]) / (lenT[j + 1] - lenT[j])) / NPH * TAU, r = rLoop(p);
    TX[k] = r * Math.cos(p); TZ[k] = r * Math.sin(p); PHI[k] = p;
  }
}
const wrapI = (k) => ((k % NS) + NS) % NS;

// ---------------------------------------------------------------- the land
// base: the massif in the middle (its shoulder is where the track runs, sloping ~35% down outward), a broad valley
// outside the loop, the ranges beyond rising with snow on their tops; ridged noise for the crests
export function base(x, z) {
  const r = Math.hypot(x, z);
  let h = 360 + 1150 * Math.exp(-((r / 2300) ** 2)) + 1500 * smooth(4300, 9000, r) - 110 * Math.exp(-(((r - 3900) / 800) ** 2));
  let s = 0, a = 1, f = 1 / 1500, tot = 0;
  for (let i = 0; i < 5; i++) { const n = 1 - Math.abs(vn2(x * f + i * 17.3, z * f - i * 9.1) * 2 - 1); s += a * n * n; tot += a; a *= 0.5; f *= 2.07; }
  s /= tot;
  h += (s - 0.45) * (160 + 800 * smooth(3800, 8000, r) + 260 * Math.exp(-((r / 1400) ** 2)));
  h += (vn2(x / 90, z / 90) - 0.5) * 14 + (vn2(x / 23, z / 23) - 0.5) * 3;
  // the far ranges: sharp ridged crests with gullies between them (none of this reaches the track's shoulder)
  const m = smooth(3700, 6200, r);
  if (m > 0) {
    let e = 0, w = 1, a2 = 1, f2 = 1 / 1250;
    for (let i = 0; i < 4; i++) {
      let n = 1 - Math.abs(vn2(x * f2 + 31.7 + i * 5.1, z * f2 - 12.9 - i * 3.3) * 2 - 1); n = n * n * (3 - 2 * n);
      e += a2 * n * w; w = clamp(n * 1.5, 0, 1); a2 *= 0.42; f2 *= 2.07;
    }
    h += m * (e - 0.6) * (150 + 230 * smooth(4300, 9000, r));
  }
  return h;
}
// where the forest stands (the trees are planted where this is above 0.42) and which kind (larch high, broadleaves low)
const forestD = (x, z) => vn2(x / 140 + 7, z / 140 - 3) * 0.7 + vn2(x / 37, z / 37) * 0.3;
const forestHue = (x, z) => vn2(x / 220 + 40, z / 220);
// the gorges: streams cut down off the massif across the track, which crosses them on viaducts
const GORGE_AT = [[0.06, 82, 190], [0.27, 60, 130], [0.47, 96, 235], [0.66, 64, 150], [0.85, 76, 180]];
export const GORGES = GORGE_AT.map(([f, D, W], k) => { const i = Math.floor(f * NS); return { phi: PHI[i], r0: Math.hypot(TX[i], TZ[i]), D, W, k }; });
const meander = (g, r) => 45 * Math.sin(r / 260 + g.k * 2.1) + 22 * Math.sin(r / 97 + g.k);
const gorgeExt = (g, r) => smooth(g.r0 - 1100, g.r0 - 380, r) * (1 - smooth(g.r0 + 1700, g.r0 + 2700, r));
function carve(x, z) {
  const r = Math.hypot(x, z), a = Math.atan2(z, x);
  let c = 0;
  for (const g of GORGES) {
    let da = a - g.phi; da -= TAU * Math.round(da / TAU);
    if (Math.abs(da) > 0.5) continue;
    const ext = gorgeExt(g, r);
    if (ext <= 0) continue;
    const W = g.W * (0.7 + 0.3 * smooth(g.r0 - 1100, g.r0, r));
    const d = Math.abs(da * r - meander(g, r));
    if (d > W) continue;
    const p = 1 - smooth(W * 0.06, W, d) ** 0.8;
    c = Math.max(c, (g.D * p + 1.6 * (1 - smooth(3, 7, d))) * ext);
  }
  return c;
}
export const natural = (x, z) => base(x, z) - carve(x, z);

// the track's height: the base land along the loop, smoothed to an easy grade (rail head, metres)
{
  const raw = new Float64Array(NS);
  for (let k = 0; k < NS; k++) raw[k] = base(TX[k], TZ[k]) + 2;
  const box = (src, w) => { const out = new Float64Array(NS); let acc = 0; for (let k = -w; k <= w; k++) acc += src[wrapI(k)];
    for (let k = 0; k < NS; k++) { out[k] = acc / (2 * w + 1); acc += src[wrapI(k + w + 1)] - src[wrapI(k - w)]; } return out; };
  const sm = box(box(box(raw, 90), 90), 70);
  for (let k = 0; k < NS; k++) TY[k] = sm[k] - 3;
}

// where the track is far above the land it runs on a viaduct: [s0, s1] in metres of track
export const BRIDGES = [];
{
  const on = new Uint8Array(NS);
  for (let k = 0; k < NS; k++) on[k] = TY[k] - 0.85 - natural(TX[k], TZ[k]) > 8 ? 1 : 0;
  // close short gaps, then collect runs (none crosses the seam at s = 0: the gorges are placed away from it)
  for (let k = 0; k < NS; k++) if (!on[k]) { let a = k - 1, b = k + 1; while (b < NS && !on[b] && b - k < 22) b++; if (a >= 0 && on[a] && b < NS && on[b] && b - a < 22) for (let q = a; q < b; q++) on[q] = 1; }
  for (let k = 0; k < NS; k++) if (on[k] && (k === 0 || !on[k - 1])) {
    let e = k; while (e + 1 < NS && on[e + 1]) e++;
    const s0 = k * DS - 6, s1 = e * DS + 6;
    if (s1 - s0 > 60) BRIDGES.push([s0, s1]);
  }
  // one that runs over the seam at s = 0 is one bridge
  const f = BRIDGES[0], l = BRIDGES[BRIDGES.length - 1];
  if (BRIDGES.length > 1 && f[0] < 20 && l[1] > LOOP - 20) { f[0] = l[0] - LOOP; BRIDGES.pop(); }
}
const bridgeF = new Float32Array(NS);      // 1 on a bridge, easing to 0 over 10 m past its ends
for (const [a, b] of BRIDGES) for (let k = Math.floor((a - 12) / DS); k <= Math.ceil((b + 12) / DS); k++) {
  const s = k * DS, w = 1 - smooth(0, 10, Math.max(a - s, s - b, 0)); const i = wrapI(k); bridgeF[i] = Math.max(bridgeF[i], w);
}

// ---------------------------------------------------------------- reading the track
const wrapS = (s) => ((s % LOOP) + LOOP) % LOOP;
// position (rail head) and unit tangent at s; out = {x, y, z, tx, ty, tz, rx, rz} (r: unit right, level)
export function trackAt(s, out = {}) {
  s = wrapS(s);
  const f = s / DS, i = Math.floor(f), u = f - i, i0 = wrapI(i), i1 = wrapI(i + 1), im = wrapI(i - 1), i2 = wrapI(i + 2);
  out.x = TX[i0] + (TX[i1] - TX[i0]) * u; out.z = TZ[i0] + (TZ[i1] - TZ[i0]) * u; out.y = TY[i0] + (TY[i1] - TY[i0]) * u;
  // tangent from a Catmull-Rom derivative, so it turns smoothly between samples
  const d = (A) => (0.5 * (A[i1] - A[im])) * (1 - u) + (0.5 * (A[i2] - A[i0])) * u;
  let tx = d(TX), tz = d(TZ), ty = d(TY); const l = Math.hypot(tx, ty, tz); tx /= l; ty /= l; tz /= l;
  out.tx = tx; out.ty = ty; out.tz = tz;
  const lh = Math.hypot(tx, tz); out.rx = -tz / lh; out.rz = tx / lh;
  return out;
}
const _a = {}, _b = {};
// signed curvature (1/m), positive when the track bends to the right
export function curvAt(s) { trackAt(s - 10, _a); trackAt(s + 10, _b); const cr = _a.tx * _b.tz - _a.tz * _b.tx; return cr / 20; }
export const bridgeAt = (s) => { const f = wrapS(s) / DS, i = Math.floor(f), u = f - i; return bridgeF[wrapI(i)] * (1 - u) + bridgeF[wrapI(i + 1)] * u; };
export const trackY = (s) => { const f = wrapS(s) / DS, i = Math.floor(f), u = f - i; return TY[wrapI(i)] * (1 - u) + TY[wrapI(i + 1)] * u; };

// the nearest point of the track: the loop is star-shaped round the origin, so look near the same angle
const PB = 4096, phiK = new Int32Array(PB);
{ let k = 0; for (let b = 0; b < PB; b++) { const p = b / PB * TAU; while (k < NS - 1 && PHI[k + 1] < p) k++; phiK[b] = k; } }
export function nearest(x, z) {
  let a = Math.atan2(z, x); if (a < 0) a += TAU;
  const k0 = phiK[Math.min(PB - 1, Math.floor(a / TAU * PB))];
  let best = 1e18, bk = k0;
  for (let k = k0 - 240; k <= k0 + 240; k += 4) { const i = wrapI(k), d = (TX[i] - x) ** 2 + (TZ[i] - z) ** 2; if (d < best) { best = d; bk = k; } }
  for (let k = bk - 4; k <= bk + 4; k++) { const i = wrapI(k), d = (TX[i] - x) ** 2 + (TZ[i] - z) ** 2; if (d < best) { best = d; bk = k; } }
  // project onto the segment toward the nearer neighbour
  const i = wrapI(bk), j = wrapI(bk + 1), ex = TX[j] - TX[i], ez = TZ[j] - TZ[i];
  const u = clamp(((x - TX[i]) * ex + (z - TZ[i]) * ez) / (ex * ex + ez * ez), -1, 1);
  const s = (bk + u) * DS, t = trackAt(s, _a);
  return { s: wrapS(s), d: (x - t.x) * t.rx + (z - t.z) * t.rz, dist: Math.sqrt(best) };
}
// the ground beside the track: a level formation, embankments (2:3) and rock cuts (5:4) blending into the natural land
export function groundBy(s, d, n) {
  const ty = trackY(s), b = bridgeAt(s), a = Math.max(0, Math.abs(d) - 3.4);
  const c = clamp(n, ty - 0.85 - a * 0.68, ty - 0.85 + a * 1.25);
  return c + (n - c) * b;
}
export function groundAt(x, z) {
  const n = natural(x, z), q = nearest(x, z);
  return q.dist > 330 ? n : groundBy(q.s, q.d, n);
}

// ---------------------------------------------------------------- shared GLSL: sky colour, light and fog out of doors
export const GLSL_W = /* glsl */`
uniform float uTime, uFlash, uDim;
uniform vec3 uSunDir, uSunCol, uSkyTop, uSkyHor, uGlowCol, uFlashDir;
uniform vec2 uWind;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);
float fbm(vec2 p){ float s = 0., a = .5; for(int i=0;i<4;i++){ s += a*vnoise(p); p = ROT * p * 2.03 + vec2(1.7, 9.2); a *= .5; } return s / .9375; }
float fbm6(vec2 p){ float s = 0., a = .5; for(int i=0;i<6;i++){ s += a*vnoise(p); p = ROT * p * 2.03 + vec2(1.7, 9.2); a *= .5; } return s / .984; }
// the sky without its clouds: what the haze takes on toward the horizon, warm toward the sunset
vec3 hazeCol(vec3 rd){
  float h = max(rd.y, 0.);
  vec3 c = mix(uSkyHor, uSkyTop, pow(h, 0.6));
  vec2 sd = normalize(uSunDir.xz);
  float sa = max(dot(normalize(rd.xz + 1e-5), sd), 0.);
  c += uGlowCol * (pow(sa, 5.) * 0.8 + pow(sa, 40.) * 0.8) * exp(-abs(rd.y - 0.02) * 10.);
  c += vec3(.55, .6, .8) * uFlash * 0.22 * (0.6 + 0.4 * dot(rd, uFlashDir));
  return c;
}
// broken cloud: where the low sun gets through onto the land, drifting over it with the wind
float sunGap(vec2 xz){ return smoothstep(0.6, 0.78, fbm(xz * 0.00042 - uWind * uTime * 0.0006)); }
vec3 lightOut(vec3 alb, vec3 N, vec3 P, float ao){
  vec3 sky = mix(uSkyHor * 1.3, uSkyTop * 2.6 + uSkyHor * 0.9, N.y * 0.5 + 0.5);
  float sun = max(dot(N, uSunDir) * 0.85 + 0.15, 0.) * sunGap(P.xz);
  vec3 fl = vec3(.6, .66, .85) * uFlash * (0.35 + 0.65 * max(dot(N, uFlashDir), 0.));
  return alb * (sky * ao + uSunCol * sun * mix(0.6, 1., ao) + fl);
}
// haze: thin everywhere, thick in the valleys (mist lying low), rain making far things grey, with curtains of heavier rain drifting over the land
vec3 fogged(vec3 c, vec3 P){
  vec3 v = P - cameraPosition; float d = length(v); vec3 rd = v / max(d, 1e-3);
  float y = 0.5 * (P.y + cameraPosition.y);
  float od = d * (0.00011 + 0.0016 * exp(-max(y - 260., 0.) / 95.)) + smoothstep(5000., 14000., d) * 1.;
  float shaft = 0.;
  if (d > 140.) {
    vec2 m = cameraPosition.xz + v.xz * 0.55;
    float n = vnoise(m * 0.0011 - uWind * uTime * 0.035) * 0.65 + vnoise(m * 0.0042 + uWind * uTime * 0.02 + 5.) * 0.35;
    shaft = smoothstep(0.52, 0.85, n) * smoothstep(140., 900., d) * (0.55 + 0.45 * vnoise(m * 0.03 + 7.));
    od += shaft * d * 0.00032;
  }
  vec3 hz = hazeCol(rd);
  hz = mix(hz, hz * vec3(0.86, 0.97, 1.16), smoothstep(1500., 7000., d));      // far ridges go blue-grey, layer by layer
  hz *= 1. + shaft * 0.3;
  return mix(hz, c, exp(-od));
}
`;

const VERT = /* glsl */`
attribute vec2 aUV; attribute vec4 aK;
varying vec3 vP, vN; varying vec2 vUV; varying vec4 vK;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.);
  vP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vUV = aUV; vK = aK;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

// one material for the land, the ballast, the rails, the viaducts, the rivers and the poles (aK.x picks which)
const WORLD_FRAG = /* glsl */`
${GLSL_W}
varying vec3 vP, vN; varying vec2 vUV; varying vec4 vK;
// bump mapping from a height, with screen-space derivatives (no tangents needed); k is the relief in metres per unit of h
vec3 wxBump(vec3 N, vec3 P, float h, float k){
  vec3 dpx = dFdx(P), dpy = dFdy(P);
  float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  vec3 g = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * N - k * g);
}
float wetMask = 0.;
// detail of size L (metres) fades out as a pixel's footprint grows toward it, so nothing shimmers in the distance
float vis(float fw, float L){ return clamp(1.6 - 3.2 * fw / L, 0., 1.); }
vec3 terrain(inout vec3 N, out float spec){
  vec3 Ng = N;
  float slope = 1. - N.y;
  vec2 q = vP.xz;
  float dc = length(vP - cameraPosition);
  float fw = max(sqrt(length(dFdx(q)) * length(dFdy(q))), 1e-3);      // the footprint's area, so grazing ground keeps some texture
  float near = smoothstep(220., 25., dc);
  float d = vUV.x, cv = vUV.y, br = vK.y, dens = vK.z, hue = vK.w;
  float n1 = fbm(q * 0.0035);
  float n2 = mix(0.5, fbm(q * 0.05 + 3.), vis(fw, 8.));
  float n3 = mix(0.5, vnoise(q * 0.7), vis(fw, 1.4));
  // fine noise from coordinates kept small (a 256 m tile), so float precision does not turn it into blocky cells
  vec2 qf = mod(q, 256.);
  float n4 = mix(0.5, vnoise(qf * 3.1), vis(fw, 0.32));
  float n5 = mix(0.5, vnoise(qf * 11.3 + 0.37 * vnoise(qf * 4.1)), vis(fw, 0.09));
  float n6 = mix(0.5, vnoise(qf * 27.), vis(fw, 0.04));
  // ---- forest: where the trees stand (the same field they were planted from), up to a ragged tree line
  float tl = 1320. + (n1 - .5) * 260.;
  float treeline = smoothstep(tl + 80., tl - 60., vP.y) * smoothstep(0.95, 0.62, slope);
  float forest = smoothstep(0.40, 0.5, dens + (n2 - .5) * 0.12) * treeline;
  // seen from afar the forest is a canopy of crowns, each one a kind in the proportions planted there
  float wL = mix(0.22, 0.6, smoothstep(0.58, 0.66, hue)) * smoothstep(0.36, 0.44, hue);
  float wB = mix(0.25, 0.75, smoothstep(0.44, 0.36, hue)) * smoothstep(0.66, 0.58, hue);
  vec3 spruce = vec3(.026, .045, .03), larch = vec3(.3, .2, .055), rust = vec3(.3, .095, .025), gold = vec3(.34, .24, .05);
  // stands of one kind (smooth patches, no cells), crowns as a lumpy light-and-gap texture over them
  float vc = vis(fw, 7.), vs = vis(fw, 25.);
  float hs = mix(0.5, vnoise(q / 11. + 3.7) * 0.75 + vnoise(q / 4. - 1.3) * 0.25, vs), hs2 = vnoise(q / 9. + 21.);
  float pB = smoothstep(wB - 0.12, wB + 0.12, 1. - hs), pL = smoothstep(wL - 0.12, wL + 0.12, hs) * (1. - pB);
  vec3 bcol = mix(rust, gold, smoothstep(0.35, 0.65, hs2));
  vec3 kindC = spruce * (1. - pB - pL) + larch * pL + bcol * pB;
  vec3 avgC = (spruce * (1. - wL - wB) + larch * wL + (rust + gold) * 0.45 * wB);
  kindC = mix(avgC, kindC, vs);
  vec2 cg = vec2(vnoise(q * 0.31 + 5.) - vnoise(q * 0.31 + vec2(5.6, 5.)), vnoise(q * 0.31 + 5.) - vnoise(q * 0.31 + vec2(5., 5.6)));
  float dome = mix(0.55, vnoise(q * 0.31 + 5.) * 0.7 + vnoise(q * 0.9) * 0.3, vc);
  vec2 cf = cg * 2.5;
  vec3 canopy = kindC * (0.25 + 0.75 * dome * dome * 1.5) * (0.85 + 0.3 * n3);
  // the forest floor up close: needle litter, moss, fallen leaves
  vec3 floorc = mix(vec3(.06, .042, .025), vec3(.05, .065, .03), smoothstep(.45, .7, n2)) * (0.6 + 0.8 * n5);
  float leaf = smoothstep(0.62, 0.8, vnoise(qf * 7. + 3.)) * (0.5 + 0.5 * n6) * vis(fw, 0.2);
  floorc = mix(floorc, mix(vec3(.3, .13, .025), vec3(.32, .23, .05), vnoise(qf * 2.3 + 8.)), leaf * 0.7);
  float far = smoothstep(160., 600., dc);
  vec3 fcol = mix(floorc, canopy, far);
  // ---- meadow: olive grass going to straw on the dry knolls, greener in the hollows, bracken in rust, heather
  vec3 grassA = vec3(.075, .088, .036), grassB = vec3(.18, .145, .062);
  float m1 = mix(0.5, vnoise(q * 0.08 + 13.), vis(fw, 12.)), m2 = mix(0.5, vnoise(q * 0.27 - 7.), vis(fw, 3.7));
  float dry = smoothstep(.28, .78, fbm(q * 0.011 + 40.) * 0.45 + m1 * 0.35 + m2 * 0.2 + (n1 - .5) * .4 - clamp(cv, -4., 6.) * 0.05);
  vec3 meadow = mix(grassA, grassB, dry);
  meadow = mix(meadow, vec3(.25, .1, .035) * (0.8 + 0.4 * m2), smoothstep(.56, .72, fbm(q * 0.03 + 21.) * 0.8 + m1 * 0.2) * 0.85);
  meadow *= 0.78 + 0.44 * m2;
  meadow = mix(meadow, vec3(.13, .06, .075), smoothstep(.7, .85, fbm(q * 0.021 - 8.)) * 0.55);
  float tus = mix(0.5, vnoise(qf * 0.9 + 2.) * 0.6 + vnoise(qf * 2.3) * 0.4, vis(fw, 0.5));       // tussocks
  float blade = mix(0.5, vnoise(qf * 30.) * 0.5 + vnoise(qf * 9.) * 0.5, vis(fw, 0.1));
  meadow *= (0.7 + 0.6 * tus) * (0.6 + 0.8 * blade * blade * 1.7) * (0.85 + 0.3 * n4);
  meadow *= 1. - 0.3 * smoothstep(1., 6., cv);                                                     // wet hollows
  // ---- rock: on the crags, the ridges and the cut faces
  vec3 rock = mix(vec3(.11, .1, .095), vec3(.22, .2, .17), n2) * (0.7 + 0.5 * n3);
  float band = sin(vP.y * 2.1 + n2 * 6. + q.x * 0.013 + q.y * 0.009) * 0.5 + 0.5;
  band = mix(0.5, band, vis(fw, 1.5));
  float vrg = vis(fw, 1.2), ridge = 0.6;
  if (vrg > 0.) ridge = mix(0.6, 1. - abs(2. * fbm(q * 0.9 + vec2(vP.y * 0.7, 0.)) - 1.), vrg);
  rock *= (0.72 + 0.5 * band) * (0.65 + 0.5 * ridge * ridge);
  rock = mix(rock, vec3(.07, .09, .04), smoothstep(.55, .75, n4 * n3 * 1.7) * 0.35 * (1. - slope));
  float rk = smoothstep(0.38, 0.6, slope + (n2 - .5) * .3 - clamp(cv, -8., 8.) * 0.025);
  vec3 alb = mix(meadow, fcol, forest);
  alb = mix(alb, rock, rk);

  // ---- snow on the high ground where it can lie; it runs down the gullies in streaks and its shadow side goes blue
  vec2 dn = normalize(Ng.xz + 1e-4);
  float acr = dot(q, vec2(-dn.y, dn.x)), alg = dot(q, dn);
  float strk = vnoise(vec2(acr / 26., alg / 170.)) * 0.6 + mix(0.5, vnoise(vec2(acr / 8., alg / 70.)), vis(fw, 6.)) * 0.4;
  float steep = smoothstep(0.12, 0.5, slope);
  float snowH = vP.y + (n1 - .5) * 260. + (n4 - .5) * 30. + clamp(cv, -10., 10.) * 9. + (strk - .5) * 220. * steep;
  float sn = smoothstep(1420., 1600., snowH) * smoothstep(0.86, 0.42, slope - max(cv, 0.) * 0.04 - (strk - .55) * 0.5 * steep);
  alb = mix(alb, vec3(.46, .5, .6) * (0.85 + 0.25 * n3), sn);
  // ---- beside the track: the gravel shoulder and the trodden cess, a cut slope of earth and scree where the land is cut
  float cess = max(smoothstep(4.2, 6.5, d), br);
  vec3 gravel = vec3(.16, .145, .125) * (0.65 + 0.7 * n5) * (0.8 + 0.4 * n6);
  gravel = mix(gravel, vec3(.09, .07, .05), smoothstep(0.55, 0.75, n4 * 0.7 + n3 * 0.3) * 0.6);                  // mud
  gravel = mix(gravel, grassA * 1.3 * (0.7 + 0.6 * n6), smoothstep(3.6, 5.2, d) * smoothstep(0.4, 0.7, n4) * 0.7);   // grass creeping in
  float cut = smoothstep(0.22, 0.5, slope) * smoothstep(30., 6., d) * (1. - sn) * (1. - br);
  vec3 earth = mix(vec3(.13, .09, .058), vec3(.24, .18, .12), n4) * (0.7 + 0.6 * n5) * (0.75 + 0.5 * band);
  alb = mix(alb, earth, cut * (1. - rk * 0.6) * 0.7);
  alb = mix(gravel, alb, cess);
  // relief: clods and grass at the foot, cracked rock, rough gravel; the crowns of the forest from afar
  float rel = mix(blade * 0.5 + tus * 0.5 + n5 * 0.2, ridge * 0.9 + n5 * 0.3, rk);
  rel = mix(n6 * 0.6 + n5 * 0.5, rel, cess);
  float k = near * mix(0.12, 0.22, max(rk, cut));
  float puddle = 0.;
  if (d < 16. && dc < 260.) {
    float pm = smoothstep(0.64, 0.69, fbm(q * 0.55 + 31.) + (n5 - .5) * 0.08);
    puddle = pm * smoothstep(260., 90., dc) * smoothstep(3.8, 5., d) * smoothstep(16., 8., d) * smoothstep(0.3, 0.08, slope) * (1. - sn) * (1. - br);
  }
  N = wxBump(N, vP, rel, k);
  // crowns: tilt the normal over each dome, so the canopy is lit on the side toward the light
  N = normalize(N + vec3(cf.x, 0., cf.y) * 1.4 * vc * forest * far * dome);
  N = normalize(mix(N, vec3(0., 1., 0.), puddle));
  alb = mix(alb, vec3(.018, .02, .02), puddle * 0.9);
  alb *= 0.95;
  wetMask = puddle;
  spec = mix(mix(0.16, 0.25, rk), 0.06, forest * far) + sn * 0.1 + puddle * 1.4 + (1. - cess) * 0.1;
  return alb;
}
void main(){
  vec3 N = normalize(vN);
  float id = vK.x, spec = 0.;
  vec3 alb, V = normalize(cameraPosition - vP);
  float ao = 1.;
  if (id < 0.5) { alb = terrain(N, spec); }
  else if (id < 1.5) {
    // ballast, sleepers on it every 0.65 m, rust either side of the rails
    float lat = vUV.y, s = vUV.x, sm = mod(s, 256.);
    float fb = length(fwidth(vec2(sm, lat)));
    float g = vnoise(vec2(sm, lat) * 9.) * 0.6 + mix(0.5, vnoise(vec2(sm, lat) * 31. + 0.4 * vnoise(vec2(sm, lat) * 13.)), clamp(1.6 - fb * 60., 0., 1.)) * 0.4;
    alb = vec3(.16, .14, .118) * (0.55 + 0.7 * g);
    alb = mix(alb, vec3(.11, .06, .035), smoothstep(0.35, 0., abs(abs(lat) - 0.75)) * 0.6);
    float sl = step(abs(lat), 1.3) * step(fract(s / 0.65), 0.37);
    alb = mix(alb, vec3(.09, .065, .045) * (0.7 + 0.5 * vnoise(vec2(sm * 3., lat * 20.))), sl);
    ao = 1. - 0.35 * step(abs(lat), 1.32) * (1. - sl) * smoothstep(0.1, 0.0, abs(fract(s / 0.65) - 0.5) - 0.13);
    float nr = smoothstep(60., 6., length(vP - cameraPosition));
    N = wxBump(N, vP, (g * 0.8 + mix(0.5, vnoise(vec2(sm, lat) * 70.), clamp(1.6 - fb * 140., 0., 1.)) * 0.4) * (1. - sl * 0.7) + sl * 0.5, 0.05 * nr);
    spec = 0.22;
  }
  else if (id < 2.5) {
    // rail: a bright worn head, rusty web
    float top = step(0.7, N.y);
    alb = mix(vec3(.13, .07, .04), vec3(.35, .34, .33), top);
    spec = mix(0.15, 1., top);
  }
  else if (id < 3.5) {
    // stone of the viaducts: coursed limestone with a ring of voussoirs round each arch, wet and streaked
    vec2 uv = vUV;
    float course = 0.42, row = floor(uv.y / course);
    float bl = 0.9 + 0.5 * hash12(vec2(row, 3.));
    float off = hash12(vec2(row, 7.)) * bl;
    float col = floor((uv.x + off) / bl);
    vec2 f = vec2(fract((uv.x + off) / bl) * bl, fract(uv.y / course) * course);
    float joint = min(min(f.x, bl - f.x), min(f.y, course - f.y));
    float stone = hash12(vec2(col, row));
    // voussoirs: aK.y along from the arch's crown, aK.z height above its springing, aK.w its radius
    float R = vK.w;
    if (R > 0.) {
      vec2 a = vec2(vK.y, vK.z); float r = length(a);
      if (r > R - 0.05 && r < R + 0.75 && vK.z > -0.01) {
        float th = atan(a.y, a.x) * R / 0.45;
        float fj = fract(th); joint = min(min(fj, 1. - fj) * 0.45, min(r - R + 0.05, R + 0.75 - r));
        stone = hash12(vec2(floor(th), 91.));
      }
    }
    float soffit = step(vK.x, 3.25) * 0. + step(3.25, vK.x);
    float nr = smoothstep(70., 8., length(vP - cameraPosition));
    float grain = vnoise(uv * vec2(3., 5.)) * 0.5 + mix(0.5, vnoise(uv * 17.), nr) * 0.3 + mix(0.5, vnoise(uv * 53.), nr * nr) * 0.2;
    alb = mix(vec3(.17, .155, .13), vec3(.27, .235, .19), stone) * (0.65 + 0.6 * grain);
    // a warm and a cool course now and then, chipped corners
    alb = mix(alb, alb * vec3(1.15, 1.02, 0.85), step(0.8, hash12(vec2(row, col * 0.37))));
    float chip = smoothstep(0.06, 0., joint) * mix(0.5, vnoise(uv * 40.), nr);
    alb *= mix(0.4, 1., smoothstep(0.0, 0.04, joint)) * (1. - 0.3 * chip);
    // wet streaks down the faces (dark runs under the coping and the joints), moss and lichen, soot under the arches
    float streak = vnoise(vec2(uv.x * 6., uv.y * 0.07)) * 0.6 + vnoise(vec2(uv.x * 23., uv.y * 0.2)) * 0.4;
    alb *= 0.62 + 0.55 * smoothstep(0.25, 0.7, streak);
    float moss = smoothstep(0.5, 0.78, vnoise(uv * 0.8) * 0.6 + vnoise(uv * 4.1) * 0.4);
    alb = mix(alb, vec3(.05, .08, .03) * (0.6 + 0.8 * vnoise(uv * 15.)), moss * 0.55 * (0.4 + 0.6 * smoothstep(14., 0., vK.z + 14.)) + smoothstep(0.1, 0., joint) * moss * 0.4);
    alb = mix(alb, vec3(.3, .29, .22), smoothstep(0.72, 0.8, vnoise(uv * 9. + 3.)) * 0.25);      // lichen
    alb *= mix(1., 0.6, soffit);
    N = wxBump(N, vP, smoothstep(0., 0.045, joint) * 1.6 + grain * 0.5 + stone * 0.3, 0.04 * nr);
    ao = mix(0.5, 1., smoothstep(0., 0.05, joint));
    spec = 0.3 + 0.35 * smoothstep(0.55, 0.3, streak);
  }
  else if (id < 4.5) {
    // a mountain stream: dark, fast, white where it breaks, with ripples and foam at the banks
    float edge = smoothstep(0.55, 1., abs(vUV.y));
    float fl = fbm(vec2(vUV.x * 0.4 - uTime * 2.2, vUV.y * 1.3));
    float rip = fbm(vec2(vUV.x * 1.4 - uTime * 3.3, vUV.y * 4.)) + vnoise(vec2(vUV.x * 5. - uTime * 6., vUV.y * 9.)) * 0.45;
    // ripples only where a pixel is small enough to hold them; further off the water goes to a smooth, dull sheen
    float fwr = length(fwidth(vP.xz)), vr = clamp(1.6 - 3.2 * fwr / 0.6, 0., 1.);
    N = wxBump(N, vP, rip, 0.22 * vr * smoothstep(90., 8., length(vP - cameraPosition)));
    alb = vec3(.02, .028, .03);
    vec3 R = reflect(-V, N); R.y = abs(R.y);
    vec3 c = alb * 0.3 + hazeCol(R) * (0.04 + 0.3 * pow(1. - max(dot(N, V), 0.), 4.)) * mix(0.6, 1., vr);
    float foam = smoothstep(0.62, 0.85, fl + edge * 0.28);
    c = mix(c, lightOut(vec3(.3, .32, .35), N, vP, 1.), foam * 0.4 * mix(0.4, 1., vr));
    gl_FragColor = vec4(fogged(c * uDim, vP), 1.);
    return;
  }
  else if (vUV.y > 100.) { alb = vec3(.32, .36, .33); spec = 1.2; }                                     // glass insulators
  else {
    // poles and cross-arms: silvered, weathered wood with a grain, dark with creosote at the foot
    float gr = vnoise(vUV * vec2(3., 14.)) * 0.6 + vnoise(vUV * vec2(9., 40.)) * 0.4;
    alb = mix(vec3(.1, .085, .07), vec3(.2, .18, .155), gr) * mix(0.45, 1., smoothstep(0.3, 1.6, vUV.y));
    spec = 0.2;
  }
  vec3 c = lightOut(alb, N, vP, ao);
  // wet: everything mirrors a little of the sky, and the low sun in the gap
  vec3 Rf = reflect(-V, N);
  float fr = 0.04 + 0.96 * pow(1. - max(dot(N, V), 0.), 5.);
  // rough wet ground only sheens at a grazing angle; standing water mirrors properly
  float rough = id < 0.5 ? mix(0.3, 1., wetMask) : id < 1.5 ? 0.45 : 1.;
  Rf.y = abs(Rf.y);
  c += hazeCol(Rf) * fr * spec * 0.5 * rough;
  c += uSunCol * pow(max(dot(Rf, uSunDir), 0.), 48.) * spec * 0.25 * sunGap(vP.xz) * rough * rough;
  gl_FragColor = vec4(fogged(c * uDim, vP), 1.);
}`;

// ---------------------------------------------------------------- trees: instanced spruces/larches and broadleaves
const TREE_VERT = /* glsl */`
${GLSL_W}
attribute vec4 iP;        // base x, y, z, height
attribute vec4 iK;        // crown width, colour seed, lean, kind (0 spruce, 1 larch, 2 broadleaf)
attribute float aT;       // -1 bark, else how far out along a branch (0 at the trunk, 1 at the tips)
varying vec3 vP, vN, vC, vL; varying float vH, vT, vKind, vS;
void main(){
  float h = iP.w;
  float ra = fract(iK.y * 91.7) * 6.2832, cs = cos(ra), sn = sin(ra);
  mat2 rot = mat2(cs, sn, -sn, cs);
  vec3 p = position * vec3(h * iK.x, h, h * iK.x);
  p.xz = rot * p.xz;
  float sway = (sin(uTime * 1.3 + iK.y * 40.) * 0.6 + sin(uTime * 2.9 + iK.y * 13.) * 0.3) * 0.012 * h * position.y * position.y;
  p.xz += uWind * 0.08 * sway + vec2(iK.z, iK.z * 0.5) * position.y * h * 0.06;
  vec4 wp = modelMatrix * vec4(p + iP.xyz, 1.);
  vec3 nn = normal * vec3(1. / iK.x, 1., 1. / iK.x); nn.xz = rot * nn.xz;
  vP = wp.xyz; vN = normalize(nn); vH = position.y; vL = position; vT = aT; vS = iK.y;
  float s = iK.y; int k = int(iK.w + .5); vKind = float(k);
  vec3 c;
  if (k == 0) c = mix(vec3(.022, .04, .026), vec3(.04, .055, .03), s);
  else if (k == 1) c = mix(vec3(.26, .165, .04), vec3(.34, .24, .06), s);
  else c = s < .4 ? mix(vec3(.26, .075, .02), vec3(.36, .14, .03), s / .4) : s < .75 ? mix(vec3(.32, .22, .04), vec3(.4, .3, .06), (s - .4) / .35) : vec3(.15, .12, .045);
  vC = c;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const TREE_FRAG = /* glsl */`
${GLSL_W}
varying vec3 vP, vN, vC, vL; varying float vH, vT, vKind, vS;
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vP);
  float dc = length(cameraPosition - vP);
  float nv = abs(dot(N, V));
  vec3 alb, c;
  if (vT < -0.5) {                                              // trunk and limbs: bark
    float b = vnoise(vec2(atan(vL.z, vL.x) * 2.2 + vL.y * 3., vL.y * 70.)) * 0.6 + vnoise(vL.xz * 120. + vL.y * 30.) * 0.4;
    alb = mix(vec3(.05, .036, .026), vec3(.1, .08, .06), b) * (vKind < 0.5 ? 0.8 : 1.);
    c = lightOut(alb, N, vP, mix(0.4, 1., smoothstep(0., 0.3, vL.y)));
    c += hazeCol(reflect(-V, N)) * (0.03 + 0.4 * pow(1. - nv, 4.)) * 0.35;      // wet bark
  } else {
    // needles and leaf clumps: a ragged edge, light and dark clusters
    float cl = (vnoise(vL.xy * 26. + vS * 9.) + vnoise(vL.zy * 26. + vS * 5.)) * 0.3 + vnoise(vL.xz * 40. + vL.y * 30.) * 0.4;
    float fr = vnoise(vL.xz * 9. + vL.y * 7. + vS * 40.);
    bool conifer = vKind < 1.5;
    float thr = conifer ? max(vT - 0.45, 0.) * 1.35 + pow(1. - nv, 2.) * 0.25 : pow(1. - nv, 2.) * 0.7 + 0.12 * fr;
    thr *= smoothstep(900., 150., dc) * 0.8 + 0.2;
    if (cl < thr) discard;
    float lv = 0.5;
    if (!conifer) {
      // the crown is porous: sprays of leaves with sky and the clumps behind showing between them, coarser further off
      vec3 lq = vL * 62. + vS * 30.;
      float ff = length(fwidth(lq));
      float lf = vnoise(lq.xz + lq.y * 0.7) * 0.5 + vnoise(lq.xy * 1.3 - 4.) * 0.5;
      vec3 lc = lq * 0.3;
      float lg = vnoise(lc.xz + lc.y * 0.7 + 9.) * 0.5 + vnoise(lc.xy * 1.3 + 2.) * 0.5;
      float sel = smoothstep(0.5, 1.4, ff);
      lv = mix(lf, lg, sel);
      if (lv < mix(0.44, 0.34 * clamp(1.6 - ff * 0.36, 0., 1.), sel) * (0.6 + 0.6 * fr) + pow(1. - nv, 1.5) * 0.3) discard;      // the rims eaten ragged
      if (!gl_FrontFacing) N = -N;
    }
    float clump = (vnoise(vL.xy * 10. + vS * 20.) + vnoise(vL.zy * 10.)) * 0.5;
    alb = vC * (0.45 + 0.8 * cl) * (0.7 + 0.5 * clump) * (conifer ? 1. : 0.72);
    if (!conifer) {
      // each clump its own shade: some still holding green, some gone gold, some darker in the crown's shadow
      alb *= (0.7 + 0.6 * vT) * (0.6 + 0.8 * lv);
      alb = mix(alb, vec3(.085, .09, .03), smoothstep(0.86, 0.95, vT) * 0.6);
      alb = mix(alb, alb * vec3(0.8, 1.2, 0.5), step(0.8, hash12(floor(vL.xy * 12.) + floor(vL.zy * 12.) * 7.)) * 0.45);   // a stray green or gold leaf
    }
    // lower and inner branches are shaded by those above
    float ao = (conifer ? mix(0.35, 1., smoothstep(0.05, 0.75, vH)) * mix(0.55, 1., vT) : mix(0.3, 1., smoothstep(0.45, 0.98, vH))) * (0.7 + 0.5 * clump);
    c = lightOut(alb, N, vP, ao);
    // backlit: leaves glow when the low sun is behind them
    vec3 rd = -V;
    float back = pow(max(dot(rd, uSunDir), 0.), 3.) * (1. - 0.6 * max(dot(N, uSunDir), 0.)) * sunGap(vP.xz);
    c += alb * uSunCol * back * (conifer ? 0.9 : 1.8) * mix(0.5, 1., ao);
    // wet leaves and needles catch the sky at a grazing angle
    c += hazeCol(reflect(-V, N)) * (0.02 + 0.25 * pow(1. - nv, 4.)) * 0.4 * ao;
  }
  gl_FragColor = vec4(fogged(c * uDim, vP), 1.);
}`;

// ---------------------------------------------------------------- the sky: storm cloud racing over, a gap of sunset low in the west
const SKY_FRAG = /* glsl */`
${GLSL_W}
varying vec3 vDir;
void main(){
  vec3 rd = normalize(vDir);
  vec3 c = hazeCol(rd);
  float h = max(rd.y, 0.);
  vec2 sd = normalize(uSunDir.xz);
  float sa = max(dot(normalize(rd.xz + 1e-5), sd), 0.);
  float sdot = max(dot(rd, uSunDir), 0.);
  // the cloud deck, seen on a plane overhead, racing with the wind
  vec2 q = rd.xz / (h + 0.06) * 1.6;
  vec2 w = uWind * uTime * 0.006;
  float d = fbm6(q * 0.55 + w) * 0.65 + fbm(q * 1.7 + w * 1.8 + 4.) * 0.35;
  // the same deck a little nearer the sun: where it thins toward the light its edge is lit, where it thickens it is in shadow
  vec2 qs = q + sd * 0.16;
  float ds = fbm(qs * 0.55 + w) * 0.65 + fbm(qs * 1.7 + w * 1.8 + 4.) * 0.35;
  float lit = clamp(0.5 + (d - ds) * 6., 0., 1.);
  float lowc = fbm(q * 2.6 + w * 3.2 - 7.);
  float dens = smoothstep(0.32, 0.62, d);
  float thick = smoothstep(0.45, 0.8, d);
  // a higher, thinner layer, moving faster, giving the underside of the deck a second tone
  float hi = fbm(rd.xz / (h + 0.12) * 0.9 + w * 2.4 + 13.);
  // cloud colour: slate, thin cloud lighter, lit edges in rust toward the sunset, a silver ambient on the lit side away from it
  vec3 cc = mix(vec3(.022, .024, .03), vec3(.08, .08, .09), smoothstep(0.72, 0.38, d));
  cc *= 0.75 + 0.5 * smoothstep(0.35, 0.7, hi);
  float toward = pow(sa, 2.2);
  cc += uGlowCol * (lit * 0.95 + 0.2 * smoothstep(0.75, 0.35, d)) * toward * exp(-h * 3.2) * (0.5 + 0.7 * (1. - thick));
  cc += vec3(.03, .032, .04) * lit * (1. - toward) * (1. - thick * 0.5);
  cc *= 1. - 0.35 * thick * (1. - lit);
  // overhead we look straight at the deck's dark, rain-heavy base; toward the horizon at its lit flanks
  cc *= mix(1.12, 0.66, smoothstep(0.04, 0.55, h)) * (0.8 + 0.4 * fbm(q * 0.9 - w * 0.7 + 30.));
  // the deck comes down to the horizon except in a long gap low in the west
  float gap = smoothstep(0.02, 0.10, rd.y) + (1. - pow(sa, 2.)) * 0.9;
  dens = clamp(max(dens, 0.55) * clamp(gap, 0., 1.) + dens * 0.4, 0., 1.);
  float cov = dens * smoothstep(-0.02, 0.03, rd.y);
  // the sun's light and its rays through the gap
  vec3 up = vec3(0., 1., 0.), sr = normalize(cross(up, uSunDir)), su = cross(uSunDir, sr);
  vec3 u = rd - uSunDir * sdot;
  float ang = atan(dot(u, su), dot(u, sr));
  float rays = vnoise(vec2(ang * 7., uTime * 0.03)) * 0.6 + vnoise(vec2(ang * 19., 3.)) * 0.4;
  float aura = pow(sdot, 5.) * 0.25 + pow(sdot, 28.) * 0.45 + pow(sdot, 420.) * 5.;
  c += uSunCol * aura * (1. - cov * 0.92);
  c += uGlowCol * pow(sdot, 3.) * smoothstep(0.35, 0.8, rays) * 0.5 * exp(-h * 5.) * (1. - cov * 0.5);
  // through the gap, a high thin layer far above the storm, still in full sunset light and moving slowly
  vec2 qh = rd.xz / (h + 0.2) * 0.7;
  float hl = fbm(vec2(qh.x * 1.6 + qh.y * 0.5, qh.y * 3.8 - qh.x * 0.4) + w * 0.4 + 51.);
  float hlm = smoothstep(0.5, 0.75, hl) * smoothstep(0.0, 0.06, rd.y);
  c += (uGlowCol * 1.4 + uSunCol * 0.5 * pow(sa, 6.)) * hlm * pow(sa, 1.5) * 0.6 * (1. - cov);
  c = mix(c, cc, cov);
  // the rim of the gap: where the deck thins out against the sun its edge burns bright
  float rim = clamp(cov * (1. - cov) * 4., 0., 1.) * pow(sa, 4.) * exp(-h * 7.);
  c += (uSunCol * 0.9 + uGlowCol * 0.6) * rim * (0.4 + 0.8 * lit);
  // virga: veils of rain hanging from the deck toward the horizon, slanting with the wind
  vec2 ah = normalize(rd.xz + 1e-5);
  float vg = smoothstep(0.5, 0.78, vnoise(ah * 7. + vec2(0.13, 0.) * uTime * 0.02 + 61.));
  float vs = vnoise(ah * 90. + vec2(rd.y * 9., 0.) + 3.) * 0.6 + vnoise(ah * 260. + vec2(rd.y * 22., 0.)) * 0.4;
  float vband = smoothstep(-0.01, 0.03, rd.y) * smoothstep(0.17, 0.05, rd.y) * (1. - smoothstep(0.5, 0.95, sa) * 0.7);
  c = mix(c, vec3(.05, .052, .06) + uGlowCol * pow(sa, 3.) * 0.25, vg * vband * (0.35 + 0.4 * vs) * 0.8);
  // ragged scud low and fast
  c = mix(c, vec3(.05, .05, .055) + uGlowCol * pow(sa, 4.) * 0.3 * lit, smoothstep(0.55, 0.8, lowc) * smoothstep(0.0, 0.04, rd.y) * smoothstep(0.5, 0.12, rd.y) * 0.7);
  // lightning inside the clouds: it lights them from within, thick cloud most, with cell structure
  float fl = uFlash * (0.4 + 0.6 * pow(max(dot(rd, uFlashDir), 0.), 6.));
  float cell = fbm(q * 3.5 + w * 4.);
  c += vec3(.55, .6, .8) * fl * (0.15 + 0.9 * smoothstep(0.3, 0.7, d) * (0.5 + 0.9 * cell)) * smoothstep(-0.05, 0.05, rd.y);
  gl_FragColor = vec4(c * uDim, 1.);
}`;

// ---------------------------------------------------------------- rain: streaks round the camera, drawn along their speed relative to it
const RAIN_VERT = /* glsl */`
${GLSL_W}
attribute vec4 aR;
uniform vec3 uCamVel; uniform mat4 uCarInv; uniform float uBox;
varying float vA; varying vec2 vQ;
void main(){
  vec3 vel = vec3(uWind.x * 0.7, -9.5 - aR.w * 2., uWind.y * 0.7);
  vec3 p = aR.xyz * uBox + vel * uTime;
  p = cameraPosition + (fract((p - cameraPosition) / uBox) - 0.5) * uBox;
  vec3 rel = vel - uCamVel;
  vec3 dir = normalize(rel), side = normalize(cross(dir, normalize(cameraPosition - p)));
  float len = clamp(length(rel) * 0.022, 0.15, 0.7);
  vec3 wp = p + dir * (position.y - 0.5) * len + side * position.x * 0.009;
  vQ = position.xy;
  vec3 lc = (uCarInv * vec4(p, 1.)).xyz;
  float d = length(p - cameraPosition);
  vA = step(1.75, abs(lc.x)) * smoothstep(1.2, 3., d) * smoothstep(uBox * 0.5, uBox * 0.3, d);
  // drops scatter light forward: bright toward the low sun and the glow round it, faint looking away from it
  vA *= 0.4 + 1.3 * pow(max(dot((p - cameraPosition) / max(d, 1e-3), uSunDir), 0.), 3.) + uFlash * 0.8;
  if (abs(lc.x) < 1.75 && lc.y > -2. && lc.y < 4.) wp = vec3(0., -1e5, 0.);    // none inside the train
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
}`;
const RAIN_FRAG = /* glsl */`
${GLSL_W}
varying float vA; varying vec2 vQ;
void main(){
  float a = vA * (1. - abs(vQ.x) * 2.) * smoothstep(0., 0.3, vQ.y) * smoothstep(1., 0.6, vQ.y);
  gl_FragColor = vec4((uSkyHor * 2.2 + uGlowCol * 0.25 + vec3(.6, .65, .8) * uFlash * 0.6) * a * 0.5 * uDim, a * 0.12);      // mostly light added, little hidden
}`;

// ---------------------------------------------------------------- smoke from the engine
const SMOKE_VERT = /* glsl */`
${GLSL_W}
attribute vec4 aS;   // x, y, z, size
attribute vec4 aQ;   // density, age 0..1, seed, spin
varying vec2 vUv; varying vec4 vQ; varying vec3 vP;
void main(){
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float c = cos(aQ.w), s = sin(aQ.w);
  vec2 o = mat2(c, s, -s, c) * position.xy;
  vec3 wp = aS.xyz + (right * o.x + up * o.y) * aS.w;
  vUv = position.xy; vQ = aQ; vP = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
}`;
const SMOKE_FRAG = /* glsl */`
${GLSL_W}
varying vec2 vUv; varying vec4 vQ; varying vec3 vP;
void main(){
  float r = length(vUv);
  float n = fbm(vUv * 2.2 + vQ.z * 17. + vQ.y * 1.5);
  float a = smoothstep(1., 0.25, r + (n - 0.5) * 0.7) * vQ.x;
  if (a < 0.004) discard;
  vec3 alb = mix(vec3(.12, .115, .11), vec3(.25, .25, .26), vQ.y);      // dark coal smoke, paling as it thins out
  vec3 c = lightOut(alb, normalize(vec3(vUv * 0.6, 0.8) + vec3(0., 0.4, 0.)), vP, 1.);
  c += vec3(1., .45, .15) * 1.2 * smoothstep(0.08, 0., vQ.y) * vQ.x;  // the fire's glow on it as it leaves the chimney
  gl_FragColor = vec4(fogged(c * uDim, vP) * a, a);
}`;

// ---------------------------------------------------------------- building
// a growing list of triangles with position, normal, aUV, aK
function geo() {
  const P = [], N = [], U = [], K = [], I = [];
  let n = 0;
  return {
    v(x, y, z, nx, ny, nz, u, v, k0 = 0, k1 = 0, k2 = 0, k3 = 0) { P.push(x, y, z); N.push(nx, ny, nz); U.push(u, v); K.push(k0, k1, k2, k3); return n++; },
    tri(a, b, c) { I.push(a, b, c); },
    quad(a, b, c, d) { I.push(a, b, c, a, c, d); },
    get count() { return n; },
    build(normals = false) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute("aUV", new THREE.Float32BufferAttribute(U, 2));
      g.setAttribute("aK", new THREE.Float32BufferAttribute(K, 4));
      g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
      if (normals) g.computeVertexNormals();
      g.computeBoundingSphere();
      return g;
    },
  };
}

export function buildWorld({ LITE = false } = {}) {
  const group = new THREE.Group();
  const U = {
    uTime: { value: 0 }, uFlash: { value: 0 }, uDim: { value: 1 },
    uSunDir: { value: new THREE.Vector3(-0.92, 0.07, 0.38).normalize() }, uSunCol: { value: new THREE.Vector3(1.1, 0.55, 0.22) },
    uSkyTop: { value: new THREE.Vector3(0.034, 0.042, 0.056) }, uSkyHor: { value: new THREE.Vector3(0.085, 0.094, 0.11) },
    uGlowCol: { value: new THREE.Vector3(0.75, 0.32, 0.1) }, uFlashDir: { value: new THREE.Vector3(0, 1, 0) },
    uWind: { value: new THREE.Vector2(7, -4) },
  };
  const mat = (vert, frag, extra = {}, more = {}) => new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: { ...U, ...extra }, ...more });
  const worldMat = mat(VERT, WORLD_FRAG);
  const add = (g, m = worldMat) => { const o = new THREE.Mesh(g, m); group.add(o); return o; };
  const T = {};

  // ---- the ribbon of land along the track: fine near it, out to 300 m each side (less on the inside of a bend)
  const OFFS = [0, 2.6, 3.4, 4.4, 5.6, 7, 8.6, 10.5, 13, 16, 19.5, 23.5, 28, 34, 41, 49, 58, 69, 82, 97, 115, 136, 160, 188, 220, 258, 300];
  const RS = LITE ? 6 : 4, NR = Math.round(LOOP / RS), RSs = LOOP / NR;
  const lim = new Float32Array(NR * 2);       // how far out each side may reach before the ribbon would fold
  {
    const kr = new Float32Array(NR);
    for (let i = 0; i < NR; i++) kr[i] = curvAt(i * RSs);
    for (let i = 0; i < NR; i++) {
      let mR = 0, mL = 0;
      for (let j = -40; j <= 40; j++) { const k = kr[(i + j + NR) % NR]; if (k > mR) mR = k; if (-k > mL) mL = -k; }
      lim[i * 2] = mR > 0 ? 0.8 / mR : 1e9; lim[i * 2 + 1] = mL > 0 ? 0.8 / mL : 1e9;
    }
  }
  const ribbonOff = [];
  for (let j = OFFS.length - 1; j > 0; j--) ribbonOff.push(-OFFS[j]);
  ribbonOff.push(...OFFS);
  const NO = ribbonOff.length;

  // ---- the land beyond: a polar grid round the massif, fine in angle so that the far ridges stay crisp against the sky,
  // pushed down where the ribbon covers it; and a square patch over the massif's top. Every vertex carries what the
  // shader cannot work out for itself: concavity (gullies +, ridges -, metres over ~60 m), where the forest stands and of what kind.
  // aUV = (distance from the track, concavity), aK = (0, on a bridge, forest density, forest hue)
  const NA = LITE ? 768 : 1536, RAD = [];
  for (let r = 1100; r < 14500; r += Math.max(14, r * (LITE ? 0.022 : 0.0135))) RAD.push(r);
  const NRAD = RAD.length, NAT = new Float32Array(NRAD * NA), CV = new Float32Array(NRAD * NA);
  {
    const ys = new Float32Array(NRAD * NA);
    for (let k = 0; k < NRAD; k++) {
      const r = RAD[k];
      for (let a = 0; a < NA; a++) {
        const p = a / NA * TAU, x = r * Math.cos(p), z = r * Math.sin(p), n = natural(x, z);
        let y = n;
        if (r > 1400 && r < 3400) { const q = nearest(x, z); if (q.dist < 330) { y = groundBy(q.s, q.d, n); y -= 30 * (1 - smooth(272, 302, q.dist)); } }
        NAT[k * NA + a] = n; ys[k * NA + a] = y;
      }
    }
    for (let k = 0; k < NRAD; k++) {
      const r = RAD[k], dr = (RAD[Math.min(k + 1, NRAD - 1)] - RAD[Math.max(k - 1, 0)]) * 0.5, m = Math.max(1, Math.round(dr / (r * TAU / NA)));
      const k0 = Math.max(k - 1, 0), k1 = Math.min(k + 1, NRAD - 1), sc = (60 / dr) ** 2;
      for (let a = 0; a < NA; a++) {
        const h = NAT[k * NA + a];
        const lap = 0.5 * ((NAT[k0 * NA + a] + NAT[k1 * NA + a]) * 0.5 - h) + 0.5 * ((NAT[k * NA + (a + m) % NA] + NAT[k * NA + (a - m + NA) % NA]) * 0.5 - h);
        CV[k * NA + a] = clamp(lap * sc, -12, 12);
      }
    }
    // in sixteen wedges, so those behind the camera are not drawn; normals from the whole grid, so the seams do not show
    const nrm = (k, a) => {
      const k0 = Math.max(k - 1, 0), k1 = Math.min(k + 1, NRAD - 1), a0 = (a - 1 + NA) % NA, a1 = (a + 1) % NA, r = RAD[k], p = a / NA * TAU;
      const dhr = (ys[k1 * NA + a] - ys[k0 * NA + a]) / (RAD[k1] - RAD[k0]), dht = (ys[k * NA + a1] - ys[k * NA + a0]) / (2 * r * TAU / NA);
      const c = Math.cos(p), s = Math.sin(p), gx = dhr * c - dht * s, gz = dhr * s + dht * c, l = Math.hypot(gx, 1, gz);
      return [-gx / l, 1 / l, -gz / l];
    };
    const WEDGE = 16, AW = NA / WEDGE;
    for (let w = 0; w < WEDGE; w++) {
      const g = geo();
      for (let k = 0; k < NRAD; k++) {
        const r = RAD[k], far = smooth(3000, 4500, r);
        for (let j = 0; j <= AW; j++) {
          const a = (w * AW + j) % NA, p = a / NA * TAU, x = r * Math.cos(p), z = r * Math.sin(p);
          const fd = far > 0.99 ? vn2(x / 140 + 7, z / 140 - 3) * 0.7 + 0.15 : forestD(x, z);
          g.v(x, ys[k * NA + a], z, ...nrm(k, a), 999, CV[k * NA + a], 0, 0, fd, forestHue(x, z));
        }
      }
      for (let k = 0; k < NRAD - 1; k++) for (let j = 0; j < AW; j++) { const A = k * (AW + 1) + j, B = A + AW + 1; g.quad(A, A + 1, B + 1, B); }
      add(g.build());
    }
  }
  // concavity anywhere on the polar grid (bilinear)
  const cvAt = (x, z) => {
    const r = Math.hypot(x, z); let p = Math.atan2(z, x); if (p < 0) p += TAU;
    let lo = 0, hi = NRAD - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (RAD[mid] > r) hi = mid; else lo = mid; }
    const u = clamp((r - RAD[lo]) / (RAD[hi] - RAD[lo]), 0, 1), fa = p / TAU * NA, a0 = Math.floor(fa) % NA, a1 = (a0 + 1) % NA, v = fa - Math.floor(fa);
    return (CV[lo * NA + a0] * (1 - v) + CV[lo * NA + a1] * v) * (1 - u) + (CV[hi * NA + a0] * (1 - v) + CV[hi * NA + a1] * v) * u;
  };
  {
    // the top of the massif, inside the polar grid (sunk under it where they overlap)
    const SZ = 2400, SEG = LITE ? 60 : 96, g = geo(), hs = [];
    for (let j = 0; j <= SEG; j++) for (let i = 0; i <= SEG; i++) { const x = (i / SEG - 0.5) * SZ, z = (j / SEG - 0.5) * SZ; hs.push(natural(x, z)); }
    const st = SZ / SEG, at = (i, j) => hs[clamp(j, 0, SEG) * (SEG + 1) + clamp(i, 0, SEG)];
    for (let j = 0; j <= SEG; j++) for (let i = 0; i <= SEG; i++) {
      const x = (i / SEG - 0.5) * SZ, z = (j / SEG - 0.5) * SZ, r = Math.hypot(x, z), h = at(i, j);
      const lap = (at(i - 1, j) + at(i + 1, j) + at(i, j - 1) + at(i, j + 1)) * 0.25 - h;
      g.v(x, h - 40 * smooth(1100, 1140, r), z, 0, 1, 0, 999, clamp(lap * (60 / st) ** 2, -12, 12), 0, 0, forestD(x, z), forestHue(x, z));
    }
    for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) { const a = j * (SEG + 1) + i; g.quad(a, a + SEG + 1, a + SEG + 2, a + 1); }
    add(g.build(true));
  }
  {
    const g = geo();
    for (let i = 0; i < NR; i++) {
      const s = i * RSs; trackAt(s, T);
      const br = bridgeAt(s);
      for (let j = 0; j < NO; j++) {
        let o = ribbonOff[j];
        o = o > 0 ? Math.min(o, lim[i * 2]) : Math.max(o, -lim[i * 2 + 1]);
        const x = T.x + T.rx * o, z = T.z + T.rz * o;
        g.v(x, groundBy(s, o, natural(x, z)), z, 0, 1, 0, Math.abs(o), cvAt(x, z), 0, br, forestD(x, z), forestHue(x, z));
      }
    }
    for (let i = 0; i < NR; i++) { const a = i * NO, b = ((i + 1) % NR) * NO; for (let j = 0; j < NO - 1; j++) g.quad(a + j, a + j + 1, b + j + 1, b + j); }
    add(g.build(true));
  }

  // ---- ballast and rails all the way round
  {
    const g = geo(), PROF = [[-2.7, -0.86], [-1.75, -0.36], [-0.8, -0.3], [0.8, -0.3], [1.75, -0.36], [2.7, -0.86]];
    const n = Math.round(LOOP / 2), st = LOOP / n;
    for (let i = 0; i < n; i++) {
      const s = i * st; trackAt(s, T);
      for (const [o, h] of PROF) g.v(T.x + T.rx * o, T.y + h, T.z + T.rz * o, 0, 1, 0, s, o, 1);
    }
    for (let i = 0; i < n; i++) { const a = i * 6, b = ((i + 1) % n) * 6; for (let j = 0; j < 5; j++) g.quad(a + j, a + j + 1, b + j + 1, b + j); }
    // the u coordinate restarts at the seam; one sleeper there is a little off, nobody will notice
    add(g.build(true));
    const r = geo();
    const RP = [[-0.035, 0], [0.035, 0], [0.035, -0.16], [-0.035, -0.16]];        // head and web of a rail
    for (const side of [-0.7525, 0.7525]) {
      const base0 = r.count;
      for (let i = 0; i < n; i++) {
        const s = i * st; trackAt(s, T);
        // three faces: outer side, head, inner side, each with its own normal
        const pts = RP.map(([o, h]) => [T.x + T.rx * (side + o), T.y + h, T.z + T.rz * (side + o)]);
        r.v(...pts[3], -T.rx, 0, -T.rz, s, 0, 2); r.v(...pts[0], -T.rx, 0, -T.rz, s, 0, 2);
        r.v(...pts[0], 0, 1, 0, s, 0, 2); r.v(...pts[1], 0, 1, 0, s, 0, 2);
        r.v(...pts[1], T.rx, 0, T.rz, s, 0, 2); r.v(...pts[2], T.rx, 0, T.rz, s, 0, 2);
      }
      for (let i = 0; i < n; i++) { const a = base0 + i * 6, b = base0 + ((i + 1) % n) * 6; for (let f = 0; f < 3; f++) r.quad(a + f * 2, b + f * 2, b + f * 2 + 1, a + f * 2 + 1); }
    }
    add(r.build());
  }

  // ---- stone viaducts
  {
    const g = geo(), HW = 2.9, HI = 2.45, BAT = 0.02;
    const at = (s, o, y) => { trackAt(s, T); return [T.x + T.rx * o, y, T.z + T.rz * o]; };
    // a flat quad of stone facing n (wound to face it), stone coordinates uv per corner
    const face = (p, n, uv, k = 3) => {
      const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const b = g.count; for (let i = 0; i < 4; i++) g.v(...p[i], ...n, uv[i][0], uv[i][1], k);
      if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] >= 0) g.quad(b, b + 1, b + 2, b + 3); else g.quad(b, b + 3, b + 2, b + 1);
    };
    // a profile swept along the track: pts [o, y above the rail head] (o away from the middle on this side), normals per segment
    const sweep = (s0, s1, side, pts, nrm) => {
      const SS = []; for (let s = s0; s < s1; s += 2) SS.push(s); SS.push(s1);
      for (let i = 0; i < SS.length - 1; i++) {
        const sA = SS[i], sB = SS[i + 1], tA = trackY(sA), tB = trackY(sB);
        for (let k = 0; k < pts.length - 1; k++) {
          const [oa, ya] = pts[k], [ob, yb] = pts[k + 1], [no, ny] = nrm[k];
          trackAt((sA + sB) / 2, T);
          const n = [T.rx * side * no, ny, T.rz * side * no], hor = Math.abs(ny) > 0.5;
          face([at(sA, side * oa, tA + ya), at(sB, side * oa, tB + ya), at(sB, side * ob, tB + yb), at(sA, side * ob, tA + yb)], n,
            hor ? [[sA, oa], [sB, oa], [sB, ob], [sA, ob]] : [[sA, tA + ya], [sB, tB + ya], [sB, tB + yb], [sA, tB + yb]]);
        }
      }
    };
    // a box of stone standing on the ground: corners in xz (in order round it), from y0 to y1
    const block = (c, y0, y1) => {
      const mx = (c[0][0] + c[2][0]) / 2, mz = (c[0][1] + c[2][1]) / 2;
      for (let i = 0; i < 4; i++) {
        const a = c[i], b = c[(i + 1) % 4], ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez);
        let nx = ez / l, nz = -ex / l; if (nx * (a[0] - mx) + nz * (a[1] - mz) < 0) { nx = -nx; nz = -nz; }
        face([[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], [nx, 0, nz], [[0, y0], [l, y0], [l, y1], [0, y1]]);
      }
      face(c.map(([x, z]) => [x, y1, z]), [0, 1, 0], c.map(([x, z]) => [x, z]));
    };
    for (const [sa, sb] of BRIDGES) {
      const n = Math.max(2, Math.round((sb - sa) / 19)), sp = (sb - sa) / n, hp = 1.7, w = sp - 2 * hp, R = w / 2;
      // per span its springing height, from the deck at its middle
      const spans = [];
      for (let j = 0; j < n; j++) { const c = sa + (j + 0.5) * sp; spans.push({ c, yS: trackY(c) - 0.85 - 1.3 - R }); }
      // where along s a sample falls: in an arch (with its intrados height) or on a pier
      const intra = (s) => { const j = clamp(Math.floor((s - sa) / sp), 0, n - 1), q = spans[j], x = s - q.c; return Math.abs(x) < R ? { j, x, y: q.yS + Math.sqrt(Math.max(0, R * R - x * x)), R } : null; };
      const foot = (s, o) => groundBy(s, o, natural(...((p) => [p[0], p[2]])(at(s, o, 0)))) - 3;
      // sample positions: piers' edges exactly, arches finely
      const S = [];
      S.push(sa - 5);
      for (let j = 0; j <= n; j++) {
        const sP = sa + j * sp;
        S.push(sP - hp + 1e-3 * (j === 0 ? 0 : 1), sP + hp - 1e-3 * (j === n ? 0 : 1));
        if (j < n) for (let m = 1; m < 16; m++) S.push(sP + hp + w * (0.5 - 0.5 * Math.cos(Math.PI * m / 16)));
      }
      S.push(sb + 5);
      S.sort((a, b) => a - b);
      const top = (s) => trackY(s) + 0.55, deck = (s) => trackY(s) - 0.85;
      // the two outer faces
      for (const side of [-1, 1]) {
        const o = side * HW, b0 = g.count;
        for (const s of S) {
          trackAt(s, T); const nx = T.rx * side, nz = T.rz * side;
          const ia = s < sa - hp || s > sb + hp ? null : intra(s);
          const yb = ia ? ia.y : foot(s, o);
          const kk = ia ? [3, ia.x, 0, ia.R] : [3, 0, 0, 0];
          const yS = ia ? spans[ia.j].yS : 0;
          const p0 = at(s, side * (HW + BAT * (top(s) - yb)), yb), p1 = at(s, o, top(s));
          g.v(...p0, nx, 0, nz, s, yb, kk[0], kk[1], yb - yS, kk[3]);
          g.v(...p1, nx, 0, nz, s, p1[1], kk[0], kk[1], p1[1] - yS, kk[3]);
        }
        for (let i = 0; i < S.length - 1; i++) { const a = b0 + i * 2, b = a + 2; if (side > 0) g.quad(a, b, b + 1, a + 1); else g.quad(a, a + 1, b + 1, b); }
      }
      // under each arch: the soffit; and the piers' faces across the track
      for (let j = 0; j < n; j++) {
        const q = spans[j], b0 = g.count, M = 16;
        for (let m = 0; m <= M; m++) {
          const th = Math.PI * (1 - m / M), x = R * Math.cos(th), s = q.c + x, y = q.yS + R * Math.sin(th);
          trackAt(s, T);
          const nY = -Math.sin(th), nT = -Math.cos(th);
          const nx = T.tx * nT, nz = T.tz * nT;
          for (const side of [-1, 1]) g.v(...at(s, side * (HW + BAT * (top(s) - y)), y), nx, nY, nz, s, side * HW + 10, 3.3, 0, 0, 0);
        }
        for (let m = 0; m < M; m++) { const a = b0 + m * 2; g.quad(a, a + 2, a + 3, a + 1); }
        for (const [s, dir] of [[q.c - R, 1], [q.c + R, -1]]) {
          trackAt(s, T);
          const nx = T.tx * dir, nz = T.tz * dir, b1 = g.count;
          for (const side of [-1, 1]) { const o = side * HW, f = foot(s, o); g.v(...at(s, side * (HW + BAT * (top(s) - f)), f), nx, 0, nz, side * HW, f, 3); g.v(...at(s, side * (HW + BAT * (top(s) - q.yS)), q.yS), nx, 0, nz, side * HW, q.yS, 3); }
          if (dir > 0) g.quad(b1, b1 + 2, b1 + 3, b1 + 1); else g.quad(b1, b1 + 1, b1 + 3, b1 + 2);
        }
      }
      // parapets: inner faces and coping, and the deck between them
      const b2 = g.count, SS = [];
      for (let s = sa - 5; s <= sb + 5; s += 2) SS.push(s);
      for (const s of SS) {
        trackAt(s, T);
        for (const side of [-1, 1]) {
          const nx = -T.rx * side, nz = -T.rz * side;
          g.v(...at(s, side * HI, deck(s)), nx, 0, nz, s, deck(s), 3);
          g.v(...at(s, side * HI, top(s)), nx, 0, nz, s, top(s), 3);
          g.v(...at(s, side * HI, top(s)), 0, 1, 0, s, side * 0.3, 3);
          g.v(...at(s, side * HW, top(s)), 0, 1, 0, s, side * 0.7, 3);
        }
      }
      for (let i = 0; i < SS.length - 1; i++) {
        const a = b2 + i * 8, b = a + 8;
        g.quad(a, b, b + 1, a + 1); g.quad(a + 4, a + 5, b + 5, b + 4);       // inner faces
        g.quad(a + 2, a + 3, b + 3, b + 2); g.quad(a + 6, b + 6, b + 7, a + 7);  // coping
      }
      for (const side of [-1, 1]) {
        // a coping of big slabs over the parapet, overhanging it; a string course projecting along the face at deck level
        sweep(sa - 5, sb + 5, side, [[HW - 0.02, 0.47], [HW + 0.13, 0.47], [HW + 0.13, 0.74], [HI - 0.1, 0.74], [HI - 0.1, 0.5]], [[0, -1], [1, 0], [0, 1], [-1, 0]]);
        sweep(sa - 5, sb + 5, side, [[HW + 0.01, -1.4], [HW + 0.17, -1.36], [HW + 0.17, -1.1], [HW + 0.01, -1.02]], [[0, -1], [1, 0], [0.3, 1]]);
        // wing walls at the ends, splayed out to hold back the embankment
        for (const [se, dir] of [[sa - 5, -1], [sb + 5, 1]]) {
          trackAt(se, T);
          const ty = top(se), tx = T.tx, tz = T.tz, rx = T.rx * side, rz = T.rz * side;
          const x0 = T.x + rx * HW, z0 = T.z + rz * HW, L = 9, ux = tx * dir * 0.87 + rx * 0.5, uz = tz * dir * 0.87 + rz * 0.5;
          const x1 = x0 + ux * L, z1 = z0 + uz * L, th = 0.7, px = -uz * th, pz = ux * th;
          const g0 = groundAt(x0, z0), g1 = groundAt(x1, z1), y1 = Math.max(g1 + 0.7, ty - 6);
          const c = [[x0, z0], [x1, z1], [x1 - px * Math.sign(px * rx + pz * rz || 1), z1 - pz * Math.sign(px * rx + pz * rz || 1)], [x0 - px * Math.sign(px * rx + pz * rz || 1), z0 - pz * Math.sign(px * rx + pz * rz || 1)]];
          // sloping top: two faces long, the end caps, and a coping along it
          const lo = Math.min(g0, g1) - 3, b = (i) => i === 1 || i === 2 ? y1 : ty;
          for (let i = 0; i < 4; i++) {
            const a = c[i], e = c[(i + 1) % 4], ex = e[0] - a[0], ez = e[1] - a[1], l = Math.hypot(ex, ez);
            const mx = (c[0][0] + c[2][0]) / 2, mz = (c[0][1] + c[2][1]) / 2;
            let nx = ez / l, nz = -ex / l; if (nx * (a[0] - mx) + nz * (a[1] - mz) < 0) { nx = -nx; nz = -nz; }
            face([[a[0], lo, a[1]], [e[0], lo, e[1]], [e[0], b((i + 1) % 4), e[1]], [a[0], b(i), a[1]]], [nx, 0, nz], [[0, lo], [l, lo], [l, b((i + 1) % 4)], [0, b(i)]]);
          }
          face(c.map(([x, z], i) => [x, b(i) + 0.02, z]), [0, 1, 0], c.map(([x, z]) => [x, z]));
        }
      }
      // footings: two stepped plinths of bigger stones under each pier
      for (let j = 1; j < n; j++) {
        const sP = sa + j * sp, gy = foot(sP, 0) + 3;
        if (spans[j - 1].yS - gy < 4) continue;
        for (const [ext, hgt] of [[0.75, 1.1], [0.4, 2.1]]) {
          const o = HW + BAT * (top(sP) - gy) + ext, s0 = sP - hp - ext, s1 = sP + hp + ext;
          const cs = [[s0, -o], [s1, -o], [s1, o], [s0, o]].map(([s, oo]) => at(s, oo, 0)), gmax = Math.max(...cs.map((p) => groundAt(p[0], p[2])));
          block(cs.map((p) => [p[0], p[2]]), gy - 3, gmax + hgt);
        }
      }
    }
    add(g.build());
  }

  // ---- the streams at the bottom of the gorges
  {
    const g = geo();
    for (const gg of GORGES) {
      const b0 = g.count, r0 = gg.r0 - 1050, r1 = gg.r0 + 2500, M = 260;
      for (let m = 0; m <= M; m++) {
        const r = r0 + (r1 - r0) * m / M, a = gg.phi + meander(gg, r) / r;
        const cx = r * Math.cos(a), cz = r * Math.sin(a), tx = -Math.sin(a), tz = Math.cos(a);
        const y = natural(cx, cz) + 1.1, wd = 2.5 + 3.5 * smooth(r0, r1, r);
        for (const side of [-1, 1]) g.v(cx + tx * wd * side, y, cz + tz * wd * side, 0, 1, 0, r, side, 4);
      }
      for (let m = 0; m < M; m++) { const a = b0 + m * 2; g.quad(a, a + 1, a + 3, a + 2); }
    }
    add(g.build());
  }

  // ---- telegraph poles along the outside of the loop, with sagging wires
  const PR = rng(77);
  {
    const g = geo(), wires = [], POLE = 52, side = -1;
    const poles = [];
    for (let s = 0; s < LOOP - POLE * 0.5; s += POLE) {
      if (bridgeAt(s) > 0.01) { poles.push(null); continue; }
      trackAt(s, T);
      const o = 4.6 * side, x = T.x + T.rx * o, z = T.z + T.rz * o, y = groundBy(s, o, natural(x, z)) - 0.3, H = 7 + PR() * 0.6, lean = (PR() - 0.5) * 0.06;
      const r0 = 0.11, r1 = 0.08, seg = 6, b0 = g.count;
      for (let m = 0; m <= seg; m++) {
        const a = m / seg * TAU, c = Math.cos(a), sn = Math.sin(a);
        g.v(x + c * r0, y, z + sn * r0, c, 0, sn, m, 0, 5); g.v(x + c * r1 + lean * H, y + H, z + sn * r1, c, 0, sn, m, H, 5);
      }
      for (let m = 0; m < seg; m++) { const a = b0 + m * 2; g.quad(a, a + 2, a + 3, a + 1); }
      // the cross-arm
      const ax = x + lean * H, ay = y + H - 0.45, tx = T.tx, tz = T.tz, rx = T.rx, rz = T.rz, L = 0.75, hh = 0.06;
      const c = (u, v, w) => [ax + rx * u + tx * w, ay + v, z + rz * u + tz * w];
      const b1 = g.count;
      for (const [u, v, w] of [[-L, -hh, -hh], [L, -hh, -hh], [L, hh, -hh], [-L, hh, -hh], [-L, -hh, hh], [L, -hh, hh], [L, hh, hh], [-L, hh, hh]]) g.v(...c(u, v, w), 0, 1, 0, u, v, 5);
      g.quad(b1, b1 + 1, b1 + 2, b1 + 3); g.quad(b1 + 4, b1 + 7, b1 + 6, b1 + 5); g.quad(b1 + 3, b1 + 2, b1 + 6, b1 + 7); g.quad(b1, b1 + 4, b1 + 5, b1 + 1);
      // three glass insulators on pins along the arm, which the wires sit on
      for (const u of [-0.6, 0, 0.6]) {
        const w = 0.045, y0 = ay + hh, y1 = y0 + 0.15, bi = g.count;
        for (const [du, dw] of [[-w, -w], [w, -w], [w, w], [-w, w]]) { const p = c(u + du, 0, dw); g.v(p[0], y0, p[2], du, 0.3, dw, 0, 200, 5); g.v(p[0], y1, p[2], du, 0.6, dw, 0, 200, 5); }
        for (let f = 0; f < 4; f++) { const f1 = (f + 1) % 4; g.quad(bi + f * 2, bi + f * 2 + 1, bi + f1 * 2 + 1, bi + f1 * 2); }
        g.quad(bi + 1, bi + 3, bi + 5, bi + 7);
      }
      poles.push([ax, ay + hh + 0.15, z, rx, rz]);
    }
    add(g.build(true));
    // wires: three per span, sagging
    for (let i = 0; i < poles.length; i++) {
      const a = poles[i], b = poles[(i + 1) % poles.length];
      if (!a || !b) continue;
      for (const u of [-0.6, 0, 0.6]) {
        const ax = a[0] + a[3] * u, az = a[2] + a[4] * u, bx = b[0] + b[3] * u, bz = b[2] + b[4] * u;
        for (let m = 0; m < 8; m++) {
          const f0 = m / 8, f1 = (m + 1) / 8, sg = (f) => -0.7 * 4 * f * (1 - f);
          wires.push(ax + (bx - ax) * f0, a[1] + (b[1] - a[1]) * f0 + sg(f0), az + (bz - az) * f0, ax + (bx - ax) * f1, a[1] + (b[1] - a[1]) * f1 + sg(f1), az + (bz - az) * f1);
        }
      }
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.Float32BufferAttribute(wires, 3));
    const wm = mat("varying vec3 vP; void main(){ vec4 wp = modelMatrix * vec4(position, 1.); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }",
      `${GLSL_W} varying vec3 vP; void main(){ gl_FragColor = vec4(fogged(vec3(.012), vP) * uDim, 1.); }`);
    group.add(new THREE.LineSegments(wg, wm));
  }

  // ---- trees: on the land either side of the track, thinning out, none on the line or in the streams
  let treeCount = 0;
  {
    const TR = rng(4242), SECT = 24, lists = Array.from({ length: SECT * 4 }, () => []);
    const N = LITE ? 26000 : 52000;
    for (let i = 0; i < N; i++) {
      const s = TR() * LOOP, side = TR() < 0.5 ? -1 : 1, u = TR();
      const o = side * (6.5 + 900 * u * u);
      trackAt(s, T);
      const x = T.x + T.rx * o, z = T.z + T.rz * o;
      if (Math.abs(o) > 280) { const q = nearest(x, z); if (q.dist < Math.abs(o) - 10) continue; }
      if (Math.abs(o) < 14 && bridgeAt(s) > 0.5) continue;
      const n = natural(x, z), y = Math.abs(o) <= 300 ? groundBy(s, o, n) : n;
      if (y > 1380 + (vn2(x / 300, z / 300) - 0.5) * 300) continue;
      const dens = forestD(x, z);
      if (dens < 0.42 + 0.1 * smooth(9, 20, Math.abs(o)) * 0) continue;
      if (carve(x, z) > 1 && Math.abs(natural(x + 3, z) - natural(x - 3, z)) < 0.4 && TR() < 0.7) continue;     // the stream bed
      // slope: no trees on the cut faces and crags
      const sl = Math.hypot(natural(x + 4, z) - natural(x - 4, z), natural(x, z + 4) - natural(x, z - 4)) / 8;
      if (sl > 1.1) continue;
      const hue = forestHue(x, z), kind = hue > 0.62 ? (TR() < 0.6 ? 1 : 0) : hue < 0.4 ? (TR() < 0.75 ? 2 : 0) : (TR() < 0.25 ? 2 : TR() < 0.3 ? 1 : 0);
      const h = (kind === 2 ? 9 : 10) + TR() * (kind === 2 ? 8 : 14);
      if (Math.abs(o) < 7 + (kind === 2 ? 0.6 : 0.45) * h) continue;       // no crown over the line
      if (Math.abs(o) < 45 && TR() < 0.45) continue;                         // the line runs through clearings
      const a = Math.atan2(z, x), sec = ((Math.floor((a / TAU + 0.5) * SECT) % SECT) + SECT) % SECT;
      lists[sec * 4 + (kind === 2 ? 2 : 0) + (Math.abs(o) < 120 ? 1 : 0)].push([x, y - 0.4, z, h, kind === 2 ? 0.55 + TR() * 0.25 : 0.32 + TR() * 0.1, TR(), (TR() - 0.5) * 0.4, kind]);
    }
    // geometry pieces: positions, normals, aT (-1 bark, else how far out along a branch)
    const mk = () => ({ P: [], N: [], T: [], I: [] });
    const vert = (m, x, y, z, nx, ny, nz, t) => { m.P.push(x, y, z); const l = Math.hypot(nx, ny, nz) || 1; m.N.push(nx / l, ny / l, nz / l); m.T.push(t); return m.T.length - 1; };
    const finish = (m) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(m.P, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(m.N, 3)); g.setAttribute("aT", new THREE.Float32BufferAttribute(m.T, 1)); g.setIndex(m.I); return g; };
    const stick = (m, x0, y0, z0, r0, x1, y1, z1, r1, seg) => {
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz);
      let ux = 0, uy = 0, uz = 1; if (Math.abs(dz / L) > 0.9) { ux = 1; uz = 0; }
      let ax = dy * uz - dz * uy, ay = dz * ux - dx * uz, az = dx * uy - dy * ux; const al = Math.hypot(ax, ay, az); ax /= al; ay /= al; az /= al;
      let bx = (dy / L) * az - (dz / L) * ay, by = (dz / L) * ax - (dx / L) * az, bz = (dx / L) * ay - (dy / L) * ax;
      const b0 = m.T.length;
      for (let k = 0; k < seg; k++) { const a = k / seg * TAU, c = Math.cos(a), sn = Math.sin(a), nx = ax * c + bx * sn, ny = ay * c + by * sn, nz = az * c + bz * sn;
        vert(m, x0 + nx * r0, y0 + ny * r0, z0 + nz * r0, nx, ny, nz, -1); vert(m, x1 + nx * r1, y1 + ny * r1, z1 + nz * r1, nx, ny, nz, -1); }
      for (let k = 0; k < seg; k++) { const a = b0 + k * 2, b = b0 + ((k + 1) % seg) * 2; m.I.push(a, b, b + 1, a, b + 1, a + 1); }
    };
    // spruce: tiers of drooping, ragged branch skirts round a visible trunk (fewer, coarser tiers for the far ones)
    const coniferGeo = (TI, SEG, seed) => {
      const m = mk(), rg = rng(seed);
      stick(m, 0, 0, 0, 0.022, 0, 0.95, 0, 0.004, 6);
      for (let k = 0; k < TI; k++) {
        const f = k / (TI - 1), y0 = 0.1 + Math.pow(f, 0.95) * 0.72, r = 1.0 * Math.pow(1 - f, 0.85) + 0.14, y1 = y0 + 0.2 - f * 0.05 + 0.04, ph = rg() * 6;
        const apex = vert(m, 0, k === TI - 1 ? 1.02 : y1, 0, 0, 1, 0, 0);
        const out = [], inn = [];
        for (let j = 0; j < SEG; j++) {
          const a = (j + ph * 0.01 + (rg() - 0.5) * 0.3) / SEG * TAU, tip = j % 2 === 0, rr = r * (tip ? 1 + (rg() - 0.5) * 0.3 : 0.58 + rg() * 0.14);
          const droop = tip ? (0.06 + rg() * 0.05) * r + 0.02 : 0.0;
          out.push(vert(m, Math.cos(a) * rr, y0 - droop, Math.sin(a) * rr, Math.cos(a), 0.55, Math.sin(a), 1));
          inn.push(vert(m, Math.cos(a) * rr * 0.3, y0 + 0.03, Math.sin(a) * rr * 0.3, Math.cos(a) * 0.3, -1, Math.sin(a) * 0.3, 0.35));
        }
        for (let j = 0; j < SEG; j++) { const j1 = (j + 1) % SEG; m.I.push(out[j], apex, out[j1]); m.I.push(out[j], out[j1], inn[j1], out[j], inn[j1], inn[j]); }
      }
      return finish(m);
    };
    // broadleaf: a trunk that forks into limbs, under a loose crown of lumpy clumps, each its own shade (aT: a seed per clump)
    const broadGeo = (NC, detail, seed) => {
      const m = mk(), rg = rng(seed);
      stick(m, 0, 0, 0, 0.04, 0, 0.42, 0, 0.026, 7);
      const clumps = [[0, 0.76, 0, 0.36]];
      for (let t = 0; clumps.length < NC && t < 400; t++) {
        const a = rg() * TAU, u = Math.sqrt(rg()), y = 0.5 + rg() * 0.42, e = Math.sqrt(Math.max(0, 1 - ((y - 0.7) / 0.32) ** 2));
        const x = Math.cos(a) * u * 0.44 * e, z = Math.sin(a) * u * 0.44 * e, r = 0.17 + rg() * 0.13;
        if (clumps.some((c) => Math.hypot(c[0] - x, c[1] - y, c[2] - z) < (c[3] + r) * 0.62)) continue;
        clumps.push([x, y, z, r]);
      }
      clumps.slice(1, Math.min(NC, 7)).forEach(([x, y, z]) => stick(m, 0, 0.36, 0, 0.022, x * 0.75, y - 0.05, z * 0.75, 0.007, detail ? 5 : 3));
      for (let c = 0; c < clumps.length; c++) {
        const [cx, cy, cz, r] = clumps[c], b = new THREE.IcosahedronGeometry(r, detail), ps = b.attributes.position, base = m.T.length, shade = 0.05 + 0.9 * rg();
        const seen = new Map();
        for (let i = 0; i < ps.count; i++) {
          const key = ps.getX(i).toFixed(3) + "," + ps.getY(i).toFixed(3) + "," + ps.getZ(i).toFixed(3);
          let k = seen.get(key); if (k === undefined) { k = 1 + (h1(ps.getX(i) * 13.1 + ps.getY(i) * 7.7 + ps.getZ(i) * 3.3 + c * 9 + seed) - 0.5) * 0.5; seen.set(key, k); }
          const x = ps.getX(i) * k + cx, y = ps.getY(i) * k * 0.8 + cy, z = ps.getZ(i) * k + cz;
          // soft shading normal: away from the clump's middle and from the crown's
          const n1x = x - cx, n1y = (y - cy) * 1.2, n1z = z - cz, l1 = Math.hypot(n1x, n1y, n1z) || 1, n2x = x, n2y = y - 0.62, n2z = z, l2 = Math.hypot(n2x, n2y, n2z) || 1;
          vert(m, x, y, z, n1x / l1 + 1.3 * n2x / l2, n1y / l1 + 1.3 * n2y / l2, n1z / l1 + 1.3 * n2z / l2, shade);
        }
        for (let i = 0; i < ps.count; i++) m.I.push(base + i);
      }
      return finish(m);
    };
    // near the line (where the camera is) the trees are detailed; further out a coarser version of each
    const GEOS = [coniferGeo(5, 8, 12), coniferGeo(LITE ? 7 : 10, LITE ? 10 : 14, 11), broadGeo(5, 0, 24), broadGeo(LITE ? 8 : 13, 1, 23)];
    const treeMat = mat(TREE_VERT, TREE_FRAG), treeMat2 = mat(TREE_VERT, TREE_FRAG, {}, { side: THREE.DoubleSide });
    lists.forEach((l, i) => {
      if (!l.length) return;
      const g = new THREE.InstancedBufferGeometry().copy(GEOS[i % 4]);
      const ip = new Float32Array(l.length * 4), ik = new Float32Array(l.length * 4);
      let cx = 0, cy = 0, cz = 0;
      l.forEach((t, j) => { ip.set([t[0], t[1], t[2], t[3]], j * 4); ik.set([t[4], t[5], t[6], t[7]], j * 4); cx += t[0]; cy += t[1]; cz += t[2]; });
      g.setAttribute("iP", new THREE.InstancedBufferAttribute(ip, 4)); g.setAttribute("iK", new THREE.InstancedBufferAttribute(ik, 4));
      g.instanceCount = l.length;
      cx /= l.length; cy /= l.length; cz /= l.length;
      let r = 0; for (const t of l) r = Math.max(r, Math.hypot(t[0] - cx, t[1] - cy, t[2] - cz) + t[3]);
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), r);
      const m = new THREE.Mesh(g, i % 4 === 3 ? treeMat2 : treeMat); group.add(m);
      treeCount += l.length;
    });
  }

  // ---- sky
  const sky = new THREE.Mesh(new THREE.SphereGeometry(18000, 48, 24), mat(
    "varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.); gl_Position = p.xyww; }",
    SKY_FRAG, {}, { side: THREE.BackSide, depthWrite: false }));
  sky.frustumCulled = false; sky.renderOrder = -1;
  group.add(sky);

  // ---- rain
  const rainU = { uCamVel: { value: new THREE.Vector3() }, uCarInv: { value: new THREE.Matrix4() }, uBox: { value: 34 } };
  {
    const N = LITE ? 1800 : 4500, R = rng(9);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const a = new Float32Array(N * 4); for (let i = 0; i < N * 4; i++) a[i] = R();
    g.setAttribute("aR", new THREE.InstancedBufferAttribute(a, 4)); g.instanceCount = N;
    const m = new THREE.Mesh(g, mat(RAIN_VERT, RAIN_FRAG, rainU, { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));
    m.frustumCulled = false; m.renderOrder = 5;
    group.add(m);
  }

  // ---- smoke from the engine's chimney: CPU particles
  const MAXP = 220, puffs = [];
  const smokeGeo = new THREE.InstancedBufferGeometry();
  smokeGeo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  smokeGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const sS = new Float32Array(MAXP * 4), sQ = new Float32Array(MAXP * 4);
  smokeGeo.setAttribute("aS", new THREE.InstancedBufferAttribute(sS, 4).setUsage(THREE.DynamicDrawUsage));
  smokeGeo.setAttribute("aQ", new THREE.InstancedBufferAttribute(sQ, 4).setUsage(THREE.DynamicDrawUsage));
  smokeGeo.instanceCount = 0;
  const smoke = new THREE.Mesh(smokeGeo, mat(SMOKE_VERT, SMOKE_FRAG, {}, { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));
  smoke.frustumCulled = false; smoke.renderOrder = 4;
  group.add(smoke);
  const SR = rng(31);
  let emit = 0;
  // chimney: world position of the chimney top; vel: the engine's velocity (m/s)
  function updateSmoke(dt, chimney, vel, t) {
    if (dt <= 0) return;
    emit += dt * 9;
    while (emit > 1) {
      emit -= 1;
      if (puffs.length >= MAXP) puffs.shift();
      puffs.push({ p: chimney.clone(), v: new THREE.Vector3(vel.x * 0.25 + (SR() - 0.5) * 1.5, 4 + SR() * 2, vel.z * 0.25 + (SR() - 0.5) * 1.5), age: 0, life: 9 + SR() * 6, seed: SR(), rot: SR() * TAU, spin: (SR() - 0.5) * 0.6 });
    }
    const wx = U.uWind.value.x, wz = U.uWind.value.y;
    for (let i = puffs.length - 1; i >= 0; i--) {
      const q = puffs[i]; q.age += dt;
      if (q.age > q.life) { puffs.splice(i, 1); continue; }
      const k = 1 - Math.exp(-dt * 1.4);
      q.v.x += (wx - q.v.x) * k; q.v.z += (wz - q.v.z) * k; q.v.y += (0.6 - q.v.y) * k;
      q.p.addScaledVector(q.v, dt); q.rot += q.spin * dt;
    }
    puffs.forEach((q, i) => {
      const a = q.age / q.life;
      sS.set([q.p.x, q.p.y, q.p.z, 0.8 + q.age * 1.1 + a * a * 5], i * 4);
      sQ.set([0.75 * smooth(0, 0.04, a) * (1 - smooth(0.3, 1, a)), a, q.seed, q.rot], i * 4);
    });
    smokeGeo.instanceCount = puffs.length;
    smokeGeo.attributes.aS.needsUpdate = true; smokeGeo.attributes.aQ.needsUpdate = true;
  }

  return { group, U, rainU, updateSmoke, stats: { trees: treeCount, bridges: BRIDGES.length, loop: LOOP } };
}
