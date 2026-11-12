// Scene: inside a grand express on a stormy autumn evening. You walk through its carriages (sleeping car, dining car,
// bar, salon, observation car) while it winds round a mountain massif on a loop of track, over stone viaducts across
// the gorges. The train is drawn in its own pass over the landscape (two depth ranges: centimetres inside, kilometres
// out). Each vehicle follows the track on its two bogies and shakes: sway, the knock of every rail joint, a little
// roll; your head moves with the floor, but not quite. Only dependency: three.js.

import * as THREE from "three";
import { makePost } from "./post.js";
import { buildWorld, trackAt, curvAt, bridgeAt, groundAt, BRIDGES, LOOP, clamp, smooth, vn2, TAU } from "./express-world.js";
import { buildTrain, CARS, CAR, ZE, ZX, WI, DOOR, RAIL, CHIMNEY } from "./express-cars.js";
import { walkInput } from "./aerie-walk.js";

const SPEED = 21;          // m/s, about 75 km/h
const JOINT = 25;          // rail length: a knock at every joint
const EYE = 1.63, SEAT_EYE = 1.17, BODY = 0.2;
const START = { Z: CAR + 8.6, x: 0.12, yaw: 0.32, pitch: -0.04 };     // the dining car, looking forward along the tables

// The composite: a 35 mm camera at night. Exposure follows the eye's adaptation (`tAdapt`, the frame's mean log
// luminance, eased: quicker into the light than out of it), but only partly, so the dim corridor stays dim; the
// tone curve compresses luminance and keeps each colour's hue and saturation (mahogany stays red-brown instead of
// sliding to orange and cream), letting only the very brightest go to white; glare spikes from the aperture on the
// bulbs (`tStreak`), halation, a light lens falloff, an edge-directed smoothing of the finest aliasing, and grain
// that lives in the mid-tones and changes 24 times a second.
const COMP_FRAG = /* glsl */`
uniform sampler2D tScene, tBloom, tAdapt, tStreak;
uniform vec2 uRes;
uniform float uTime, uExposure, uBloom, uKey, uAdaptS, uStreak;
varying vec2 vUv;
float h11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// the ACES fit (Hill), per channel and as a curve on one value
const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
vec3 rrt(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 tonemap(vec3 x){
  x = max(x, 0.);
  vec3 pc = clamp(outM * rrt(inM * x), 0., 1.);
  // the same curve on luminance alone, the colour kept as a ratio: no hue skew, no wash
  float L = luma(x), Lt = clamp(luma(outM * rrt(inM * vec3(L))), 0., 1.);
  vec3 lc = x * (Lt / max(L, 1e-5));
  float over = max(max(lc.r, lc.g), lc.b);
  lc = mix(lc, vec3(Lt), clamp((over - 1.) / max(over - Lt, 1e-4), 0., 1.));   // out of gamut: toward grey at the same brightness
  return mix(lc, pc, smoothstep(0.62, 0.98, Lt));                              // the path to white only near the top
}
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 safe(vec3 c){ return (c.r < 3e4 && c.g < 3e4 && c.b < 3e4) ? max(c, 0.) : vec3(0.); }   // one NaN/Inf pixel would spread
float tl(vec3 c){ float l = luma(c); return l / (1. + l); }
void main(){
  vec2 px = 1. / uRes;
  vec2 q = vUv - 0.5;
  float r2 = dot(q, q);
  // edge-directed smoothing: along an edge whose contrast stands out, blend two taps along it (thin curtain folds,
  // wires, the carpet's pattern stop crawling quite as much)
  vec3 cM = safe(texture2D(tScene, vUv).rgb);
  float lM = tl(cM), lN = tl(texture2D(tScene, vUv + vec2(0, px.y)).rgb), lS = tl(texture2D(tScene, vUv - vec2(0, px.y)).rgb);
  float lE = tl(texture2D(tScene, vUv + vec2(px.x, 0)).rgb), lW = tl(texture2D(tScene, vUv - vec2(px.x, 0)).rgb);
  float lo = min(lM, min(min(lN, lS), min(lE, lW))), hi = max(lM, max(max(lN, lS), max(lE, lW)));
  vec3 col = cM;
  if (hi - lo > max(0.03, hi * 0.15)) {
    vec2 g = vec2(lE - lW, lN - lS);
    vec2 dir = vec2(-g.y, g.x) / max(length(g), 1e-4);
    float sub = clamp(abs((lN + lS + lE + lW) * 0.25 - lM) / (hi - lo), 0., 1.);
    vec3 e = 0.5 * (texture2D(tScene, vUv + dir * px * 0.75).rgb + texture2D(tScene, vUv - dir * px * 0.75).rgb);
    col = mix(cM, e, 0.35 + 0.4 * sub);
  }
  // lateral chromatic fringing toward the edges
  if (r2 > 0.03) {
    vec2 ca = q * (r2 - 0.03) * 0.009;
    col.r = mix(col.r, texture2D(tScene, vUv - ca).r, 0.85);
    col.b = mix(col.b, texture2D(tScene, vUv + ca).b, 0.85);
  }
  // bloom: the lens's soft point-spread, a mix rather than added light, and halation (the red layer bleeding)
  vec3 bl = texture2D(tBloom, vUv).rgb;
  col = col * (1. - 0.04 * uBloom) + bl * uBloom * 0.75 + luma(bl) * vec3(1.0, 0.36, 0.1) * uBloom * 0.65;
  // aperture glare: spikes on the brightest bulbs
  col += texture2D(tStreak, vUv).rgb * uStreak;
  // natural falloff of a fast lens, light
  col *= mix(0.72, 1.0, smoothstep(0.95, 0.15, length(q * vec2(1.0, 1.2))));
  // exposure: the adapted mean luminance pulls it part of the way (strength uAdaptS), within limits
  float La = exp2(texture2D(tAdapt, vec2(0.5)).r);
  float ev = clamp(pow(uKey / La, uAdaptS), 0.55, 2.4);
  vec3 c = toSRGB(tonemap(col * uExposure * ev / 0.6));
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  // grade: cool in the shadows, warm tungsten in the highlights, a gentle print curve with a little toe
  c += vec3(-0.016, 0.0, 0.022) * (1.0 - l) * (1.0 - l) * smoothstep(0.0, 0.15, l);
  c += vec3(0.03, 0.01, -0.03) * l * l;
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.18);
  c = c * 0.985 + vec3(0.008, 0.010, 0.016);     // the print's blacks never quite black
  // grain: soft-edged, strongest in the mid-tones, a new pattern 24 times a second
  float ft = floor(uTime * 24.);
  vec2 gp = gl_FragCoord.xy / 1.25 + vec2(h11(ft) * 731., h11(ft + 7.) * 419.);
  float gr = (vnoise(gp) + vnoise(gp * 1.9 + 17.) * 0.6) / 1.6 - 0.5;
  c += gr * 0.075 * (0.35 + 2.6 * l * (1. - l)) * (1. - 0.5 * smoothstep(0.75, 1., l));
  gl_FragColor = vec4(max(c, 0.0), 1.);
}`;

const FS_VERT = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }";
// Motion blur for the landscape: each pixel's position is rebuilt from the depth, carried back to where the camera
// was when the shutter opened (`uReproj`: the train's travel over the shutter time inside, the pan outside), and
// the colour gathered along the longest motion nearby, weighted so near things smear over the far ones and not the
// other way round (after McGuire et al., without the tile pass: five probes find the neighbourhood's motion).
const MB_FRAG = /* glsl */`
uniform sampler2D tCol, tDepth;
uniform mat4 uInvProj, uReproj;
uniform vec2 uTexel;
uniform float uMax;
varying vec2 vUv;
vec2 velAt(vec2 uv, out float z){
  float d = texture2D(tDepth, uv).r;
  z = 1e9;
  if (d < 1e-4) return vec2(0.);                 // under the train: never seen
  vec4 p = uInvProj * vec4(uv * 2. - 1., d * 2. - 1., 1.); p.xyz /= p.w; z = -p.z;
  vec4 c = uReproj * vec4(p.xyz, 1.);
  if (c.w < 1e-3) return vec2(0.);
  vec2 v = (uv - (c.xy / c.w * .5 + .5)) / uTexel;
  float l = length(v);
  return l > uMax ? v * (uMax / l) : v;          // pixels over the whole shutter time
}
vec3 safe(vec3 c){ return (c.r < 3e4 && c.g < 3e4 && c.b < 3e4) ? max(c, 0.) : vec3(0.); }   // one NaN/Inf pixel would spread
float cone(float d, float l){ return clamp(1. - d / max(l, 1e-3), 0., 1.); }
float cyl(float d, float l){ return 1. - smoothstep(0.95 * l, 1.05 * l + 1e-3, d); }
float front(float za, float zb){ return clamp(1. - (za - zb) / (0.06 * zb + 0.05), 0., 1.); }
void main(){
  #ifdef DEPTH
  // outside the camera only turns (the pan after the train), so the motion does not depend on the depth: a plain
  // streak along it, and the land's depth goes along, so it hides the train behind it
  float dc = texture2D(tDepth, vUv).r;
  gl_FragDepthEXT = dc;
  vec4 pc = uInvProj * vec4(vUv * 2. - 1., 0., 1.), cc = uReproj * vec4(pc.xyz / pc.w, 1.);
  vec2 vr = (vUv - (cc.xy / cc.w * .5 + .5)) / uTexel;
  float lr = length(vr); if (lr > uMax) vr *= uMax / lr;
  vec3 s0 = safe(texture2D(tCol, vUv).rgb);
  if (lr < 0.75) { gl_FragColor = vec4(s0, 1.); return; }
  float jr = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec3 acc = vec3(0.);
  for (int i = 0; i < 8; i++) acc += safe(texture2D(tCol, vUv + vr * ((float(i) + jr) / 8. - 0.5) * uTexel).rgb);
  gl_FragColor = vec4(acc / 8., 1.);
  #else
  float zc, z_;
  vec2 vc = velAt(vUv, zc), vm = vc, a;
  float o = uMax * 0.4;
  a = velAt(vUv + vec2(o, 0.) * uTexel, z_); if (dot(a, a) > dot(vm, vm)) vm = a;
  a = velAt(vUv - vec2(o, 0.) * uTexel, z_); if (dot(a, a) > dot(vm, vm)) vm = a;
  a = velAt(vUv + vec2(0., o) * uTexel, z_); if (dot(a, a) > dot(vm, vm)) vm = a;
  a = velAt(vUv - vec2(0., o) * uTexel, z_); if (dot(a, a) > dot(vm, vm)) vm = a;
  vec3 c0 = safe(texture2D(tCol, vUv).rgb);
  float lm = length(vm);
  if (lm < 0.75) { gl_FragColor = vec4(c0, 1.); return; }
  float lc = 0.5 * length(vc);
  float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
  float ws = 1. / max(lc, 1.);
  vec3 sum = c0 * ws;
  const int N = 12;
  for (int i = 0; i < N; i++) {
    float t = (float(i) + 0.5 + j) / float(N) - 0.5;
    vec2 uv = vUv + vm * t * uTexel;
    float d = abs(t) * lm, zs;
    float ls = 0.5 * length(velAt(uv, zs));
    if (zs > 1e8) continue;
    float w = front(zs, zc) * cone(d, ls) + front(zc, zs) * cone(d, lc) + cyl(d, ls) * cyl(d, lc) * 2.;
    sum += safe(texture2D(tCol, uv).rgb) * w; ws += w;
  }
  gl_FragColor = vec4(sum / ws, 1.);
  #endif
}`;
// The light meter: the frame's mean log luminance, weighted to the middle, eased toward from the last value
const METER_FRAG = /* glsl */`
uniform sampler2D tSrc, tLast;
uniform float uUp, uDown;
varying vec2 vUv;
void main(){
  float s = 0., ws = 0.;
  for (int y = 0; y < 12; y++) for (int x = 0; x < 16; x++) {
    vec2 uv = (vec2(float(x), float(y)) + 0.5) / vec2(16., 12.);
    vec2 q = (uv - 0.5) * vec2(1.4, 1.8);
    float w = exp(-dot(q, q) * 2.5);
    float l = dot(texture2D(tSrc, uv).rgb, vec3(0.2126, 0.7152, 0.0722));
    if (!(l < 3e4)) l = 6.;
    s += log2(clamp(l, 2e-3, 6.)) * w; ws += w;
  }
  float cur = s / ws, last = texture2D(tLast, vec2(0.5)).r;
  if (!(abs(last) < 100.)) last = cur;
  gl_FragColor = vec4(mix(last, cur, cur > last ? uUp : uDown), 0., 0., 1.);
}`;
// Glare from the aperture's six blades: the brightest parts at quarter resolution, then spikes along three lines
const BRIGHT_FRAG = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThr;
varying vec2 vUv;
vec3 safe(vec3 c){ return (c.r < 3e4 && c.g < 3e4 && c.b < 3e4) ? max(c, 0.) : vec3(0.); }   // one NaN/Inf pixel would spread
void main(){
  vec3 c = vec3(0.);
  for (int i = 0; i < 4; i++) { vec2 o = vec2(float(i & 1), float(i / 2)) * 2. - 1.; c += safe(texture2D(tSrc, vUv + o * uTexel).rgb); }
  c *= 0.25;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(c * max(l - uThr, 0.) / max(l, 1e-4), 1.);
}`;
const STAR_FRAG = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel;
varying vec2 vUv;
void main(){
  vec3 s = vec3(0.);
  for (int k = 0; k < 3; k++) {
    float a = 0.35 + float(k) * 1.0472;
    vec2 d = vec2(cos(a), sin(a)) * uTexel;
    for (int i = 1; i <= 10; i++) {
      float f = float(i) * 1.6, w = exp(-float(i) * 0.32);
      s += (texture2D(tSrc, vUv + d * f).rgb + texture2D(tSrc, vUv - d * f).rgb) * w;
    }
  }
  gl_FragColor = vec4(s * vec3(1.0, 0.93, 0.85), 1.);
}`;

export function startExpress3D(canvasEl, { reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: false, powerPreference: "high-performance" });
  let pr = Math.min(window.devicePixelRatio || 1, 1.5);
  const LITE = matchMedia("(pointer: coarse)").matches;
  renderer.setPixelRatio(pr);
  renderer.toneMapping = THREE.NoToneMapping;
  // the passes of our own, round the shared post chain: motion blur of the land, the light meter, aperture glare
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), fsGeo = new THREE.BufferGeometry();
  fsGeo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  fsGeo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const fsQuad = new THREE.Mesh(fsGeo); fsQuad.frustumCulled = false;
  const fsMat = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const fsPass = (m, target) => { fsQuad.material = m; renderer.setRenderTarget(target); renderer.render(fsQuad, fsCam); };
  const ext = renderer.extensions, HDR = ext.has("EXT_color_buffer_float") || ext.has("EXT_color_buffer_half_float");
  const HT = HDR ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const mbU = { tCol: { value: null }, tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uReproj: { value: new THREE.Matrix4() }, uTexel: { value: new THREE.Vector2() }, uMax: { value: 60 } };
  const mbMat = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: MB_FRAG, uniforms: mbU, depthTest: true, depthWrite: false, depthFunc: THREE.LessEqualDepth });
  const mbMatOut = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: MB_FRAG, uniforms: mbU, depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth, defines: { DEPTH: "" } });
  mbMatOut.extensions.fragDepth = true;
  const meterU = { tSrc: { value: null }, tLast: { value: null }, uUp: { value: 1 }, uDown: { value: 1 } };
  const meterMat = fsMat(METER_FRAG, meterU);
  const adaptRT = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, { type: HDR ? THREE.HalfFloatType : THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false }));
  let adaptI = 0, adaptSnap = true;
  const brightU = { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThr: { value: 14 } }, brightMat = fsMat(BRIGHT_FRAG, brightU);
  const starU = { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }, starMat = fsMat(STAR_FRAG, starU);
  let worldRT = null, brightRT = null, starRT = null;
  // depth-only stand-in for the train, pinned to the near plane, no colour (the train's shader has no cut-outs, so the
  // shape is the geometry's)
  const maskMat = new THREE.ShaderMaterial({ vertexShader: "void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position.z = -0.99999 * gl_Position.w; }",
    fragmentShader: "void main(){ gl_FragColor = vec4(0.); }", side: THREE.DoubleSide, colorWrite: false });

  const post = makePost(renderer, { comp: COMP_FRAG, bloom: 0.42, thresh: 0.6, keepPrev: true,
    uniforms: { tAdapt: { value: adaptRT[0].texture }, tStreak: { value: null }, uKey: { value: 0.047 }, uAdaptS: { value: 0.45 }, uStreak: { value: 0.006 } } });
  post.U.uExposure.value = 1.0;

  const worldScene = new THREE.Scene(), trainScene = new THREE.Scene();
  const camFar = new THREE.PerspectiveCamera(62, 1, 0.6, 26000), camNear = new THREE.PerspectiveCamera(62, 1, 0.04, 400);
  const world = buildWorld({ LITE });
  worldScene.add(world.group);
  const train = buildTrain({ uniforms: world.U, prevTex: post.prev, LITE });
  for (const v of train.vehicles) trainScene.add(v.group);
  const U = world.U;
  // the glazing (see-through) is left out of the depth mask
  const glazing = []; trainScene.traverse((o) => { if (o.isMesh && o.material.transparent) glazing.push(o); });
  function prepass() {
    for (const g of glazing) g.visible = false;
    trainScene.overrideMaterial = maskMat; renderer.render(trainScene, camNear); trainScene.overrideMaterial = null;
    for (const g of glazing) g.visible = true;
  }
  const veh = train.vehicles, cars = veh.filter((v) => v.kind !== "loco" && v.kind !== "tender"), locoV = veh[0];

  // ---- the train on the track: where each vehicle is and how it shakes
  const A = {}, B = {};
  const vF = new THREE.Vector3(), vU = new THREE.Vector3(), vR = new THREE.Vector3(), vP = new THREE.Vector3(), q = new THREE.Quaternion();
  const mBasis = new THREE.Matrix4(), mTmp = new THREE.Matrix4(), eTmp = new THREE.Euler();
  // the knock of a wheelset over a joint: a sharp dip and a ringing bounce, decaying (s = how far past the joint)
  const knock = (s) => { const u = ((s % JOINT) + JOINT) % JOINT, dt = u / Math.max(SPEED, 1); return Math.exp(-dt * 6) * Math.sin(dt * 34) * (dt < 1.5 ? 1 : 0); };
  let speed = reduced ? 0 : SPEED;
  function vehicleMatrix(v, sT, t, k, out) {
    const sc = sT - v.Zc;
    trackAt(sc + v.half, A); trackAt(sc - v.half, B);
    vP.set((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
    vF.set(A.x - B.x, A.y - B.y, A.z - B.z).normalize();
    vR.set(-vF.z, 0, vF.x).normalize();
    vU.crossVectors(vR, vF).normalize();
    // cant into the curves, then the shake: sway, roll, the joints under each bogie, a slow pitching
    const kc = curvAt(sc), ph = v.Zc * 0.37;
    const kk = k * (speed / SPEED);
    const sway = kk * (0.011 * Math.sin(TAU * 0.83 * t + ph) * (0.6 + 0.4 * Math.sin(t * 0.21 + ph)) + 0.016 * (vn2(sc / 31, ph) - 0.5));
    const jf = knock(sc + v.half + 1.25) + knock(sc + v.half - 1.25), jr = knock(sc - v.half + 1.25) + knock(sc - v.half - 1.25);
    const bounce = kk * (0.0032 * (jf + jr) + 0.006 * (vn2(sc / 13, ph + 5) - 0.5) + 0.0015 * Math.sin(TAU * 2.1 * t + ph));
    const roll = -kc * 32 + kk * (0.0045 * Math.sin(TAU * 1.17 * t + ph * 2) + 0.007 * (vn2(sc / 23, ph + 9) - 0.5) + 0.0012 * (jf - jr));
    const pitch = kk * 0.0014 * (jf - jr) / 1.5;
    const yaw = kk * 0.0016 * Math.sin(TAU * 0.83 * t + ph + 1.2);
    mBasis.makeBasis(vR, vU, vF.clone().negate());
    eTmp.set(pitch, yaw, roll, "ZXY");
    mTmp.makeRotationFromEuler(eTmp);
    out.multiplyMatrices(mBasis, mTmp);
    const lift = -RAIL + bounce;
    out.setPosition(vP.x + vU.x * lift + vR.x * sway, vP.y + vU.y * lift + vR.y * sway, vP.z + vU.z * lift + vR.z * sway);
    return out;
  }

  // ---- walking
  const walker = { x: START.x, Z: START.Z, yaw: START.yaw, pitch: START.pitch, seat: null, eye: EYE, bob: 0 };
  const solids = train.solids;
  function collide() {
    for (let it = 0; it < 3; it++) for (const [x0, z0, x1, z1] of solids) {
      const cx = clamp(walker.x, x0, x1), cz = clamp(walker.Z, z0, z1);
      const dx = walker.x - cx, dz = walker.Z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= BODY * BODY) continue;
      if (d2 > 1e-10) { const d = Math.sqrt(d2); walker.x = cx + dx / d * BODY; walker.Z = cz + dz / d * BODY; }
      else {           // inside: out the nearest side
        const o = [[walker.x - x0, -1, 0], [x1 - walker.x, 1, 0], [walker.Z - z0, 0, -1], [z1 - walker.Z, 0, 1]].sort((a, b) => a[0] - b[0])[0];
        walker.x += o[1] * (o[0] + BODY); walker.Z += o[2] * (o[0] + BODY);
      }
    }
  }
  let prompt = "";
  const nearSeat = () => { let best = null, bd = 0.95; for (const s of train.seats) { const d = Math.hypot(s[0] - walker.x, s[1] - walker.Z); if (d < bd) { bd = d; best = s; } } return best; };
  function use() {
    if (walker.seat) { stand(); return; }
    const s = nearSeat();
    if (s) {
      // sit, turned a little toward the nearer window
      walker.seat = s; walker.from = [walker.x, walker.Z]; walker.x = s[0]; walker.Z = s[1];
      const base = s[2] > 0 ? Math.PI : 0, sx = Math.sign(s[0]) || 1;
      walker.yaw = base + sx * 0.6 * (s[2] > 0 ? 1 : -1); walker.pitch = -0.08;
    }
  }
  function stand() { if (!walker.seat) return; [walker.x, walker.Z] = walker.from; walker.seat = null; }
  const input = walkInput(canvasEl, { onUse: use });

  // ---- view
  let baseFov = 62, fovOut = 0;
  const resize = () => {
    const w = canvasEl.clientWidth || innerWidth, h = canvasEl.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    for (const c of [camFar, camNear]) { c.aspect = w / h; c.fov = c.aspect < 1 ? 78 : 62; c.updateProjectionMatrix(); }
    post.setSize();
    const v2 = new THREE.Vector2(); renderer.getDrawingBufferSize(v2); train.glassU.uRes.value.copy(v2);
    const bw = Math.max(2, v2.x | 0), bh = Math.max(2, v2.y | 0);
    worldRT?.dispose(); brightRT?.dispose(); starRT?.dispose();
    const dt = new THREE.DepthTexture(bw, bh); dt.type = THREE.UnsignedIntType;
    worldRT = new THREE.WebGLRenderTarget(bw, bh, { type: HT, samples: 4, depthTexture: dt, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const qo = { type: HT, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    brightRT = new THREE.WebGLRenderTarget(Math.max(1, bw >> 2), Math.max(1, bh >> 2), qo); starRT = brightRT.clone();
    mbU.tCol.value = worldRT.texture; mbU.tDepth.value = dt; mbU.uTexel.value.set(1 / bw, 1 / bh); mbU.uMax.value = Math.round(bw * 0.045);
    brightU.uTexel.value.set(1 / bw, 1 / bh); starU.tSrc.value = brightRT.texture; starU.uTexel.value.set(1 / brightRT.width, 1 / brightRT.height);
    post.U.tStreak.value = starRT.texture;
    baseFov = camFar.fov;
  };
  addEventListener("resize", resize); resize();

  // ---- lightning: flickering strikes now and then somewhere over the mountains; `onThunder(delay, power)` for the sound
  const flash = { t: -1, pulses: [], next: 6 + Math.random() * 8 };
  let onThunder = () => {};
  function strike(power = 0.6 + Math.random() * 0.4) {
    const a = Math.random() * TAU, el = 0.15 + Math.random() * 0.3;
    U.uFlashDir.value.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
    const n = 2 + Math.floor(Math.random() * 3);
    flash.pulses = Array.from({ length: n }, (_, i) => [i * (0.07 + Math.random() * 0.12), (0.5 + Math.random() * 0.5) * power * (i === 0 ? 1 : 0.8)]);
    flash.t = 0;
    onThunder(0.8 + Math.random() * 3.5 * (1.2 - power), power);
  }

  // ---- standing outside by the line to watch the train go by: a spot ahead of it, off to one side (over a valley
  // where there is one), moved on once the train has gone past
  let outside = false;
  const spot = { p: new THREE.Vector3(), aim: new THREE.Vector3(), s: 0, ready: false };
  let treeData = null;
  function pickSpot() {
    // the trees round about, as upright cylinders (base x, y, z, height, crown radius)
    if (!treeData) { treeData = []; world.group.traverse((o) => { const a = o.geometry?.attributes, ip = a?.iP, ik = a?.iK; if (!ip) return;
      for (let i = 0; i < ip.count; i++) treeData.push(ip.getX(i), ip.getY(i), ip.getZ(i), ip.getW(i), Math.max(0.6, ik.getX(i) * ip.getW(i) * 0.5)); }); }
    // where along the line: a viaduct coming up first (stand off to the side of it, low down), else a few places ahead
    const tries = [];
    for (const [a, b] of BRIDGES) { const m = (a + b) / 2, d = ((m - sTrain) % LOOP + LOOP) % LOOP; if (d > 150 && d < 900 && b - a > 150) { tries.push(sTrain + d); break; } }
    for (const ahead of [300, 420, 540, 660, 800, 950, 1100]) tries.push(sTrain + ahead + Math.random() * 60);
    let best = null;
    for (const s of tries) {
      const c = trySpot(s);
      if (!best || c[0] < best[0]) best = c;
      if (best[0] < 30) break;
    }
    spot.p.set(best[1], best[2], best[3]); spot.s = best[4]; spot.ready = true;
  }
  // the best place to stand to see the train pass `s`: [score, x, y, z, s]
  function trySpot(s) {
    trackAt(s, A);
    const onBridge = bridgeAt(s) > 0.5, ax = A.x, ay = A.y, az = A.z, arx = A.rx, arz = A.rz;
    const trees = [];
    for (let i = 0; i < treeData.length; i += 5) if (Math.hypot(treeData[i] - ax, treeData[i + 2] - az) < 520) trees.push(i);
    const treeHit = (px, py, pz, tx, ty, tz) => {
      const dx = tx - px, dz = tz - pz, L2 = dx * dx + dz * dz;
      for (const i of trees) {
        const cx = treeData[i], cz = treeData[i + 2], r = treeData[i + 4];
        const f = clamp(((cx - px) * dx + (cz - pz) * dz) / L2, 0, 1);
        const ex = px + dx * f - cx, ez = pz + dz * f - cz;
        if (ex * ex + ez * ez > r * r) continue;
        const y = py + (ty - py) * f, b = treeData[i + 1], u = (y - b) / treeData[i + 3];   // a crown narrowing upward
        if (u > 0.05 && u < 1 && ex * ex + ez * ez < r * r * (1 - u) * (1 - u) * 1.4 && Math.hypot(tx - cx, tz - cz) > r + 2) return true;
      }
      return false;
    };
    // the train must be in plain sight on its way past: count where a crest of the land or a tree cuts the line from
    // the eye to the carriages' windows along the stretch it will run through (the near passing counts most)
    const from = Math.max(-((s - sTrain) % LOOP + LOOP) % LOOP + 40, -500);
    const blocked = (px, py, pz) => {
      let n = 0;
      for (let k = 0; k <= 6; k++) {
        trackAt(s + from + (60 - from) * k / 6, B);
        const tx = B.x, ty = B.y + 3.2, tz = B.z, L = Math.hypot(tx - px, tz - pz);
        if (treeHit(px, py, pz, tx, ty, tz)) { n += 0.25 + k / 6; continue; }
        for (let i = 1; i < 24; i++) {
          const f = i / 24; if (L * (1 - f) < 7) break;          // the embankment next to the rails does not count
          // with a margin: the drawn land is a coarser mesh than this, and a line that grazes a crest is no view
          if (groundAt(px + (tx - px) * f, pz + (tz - pz) * f) > py + (ty - py) * f - 1.2 - 0.006 * L * f) { n += 0.25 + k / 6; break; }
        }
      }
      // and not with the lens in a slope
      for (const [dx, dz] of [[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]]) if (groundAt(px + dx, pz + dz) > py - 0.5) n += 0.6;
      return n;
    };
    // standing on the ground (eye height, or on a bank or a rock a few metres up), the lower side (the valley, or the
    // foot of a viaduct) first, looking up at the train against the sky (from above, a long lens sees only the ground
    // behind it)
    const first = Math.random() < 0.7 ? -1 : 1;
    let best = null;
    for (const off of onBridge ? [170, 130, 210, 90] : [55 + Math.random() * 50, 14, 30, 90, 140]) for (const sd of [first, -first]) {
      const x = ax + arx * off * sd, z = az + arz * off * sd, g = groundAt(x, z);
      for (const lift of [0, 4, 10]) {
        const y = g + 1.6 + lift;
        const sc = blocked(x, y, z) * 100 + Math.max(0, y - ay) * 0.8 + lift * 2 + (sd === first ? 0 : 6);
        if (!best || sc < best[0]) best = [sc, x, y, z, s];
      }
    }
    return best;
  }
  const outV = new THREE.Vector3();

  // ---- the frame
  let tNow = 0, sTrain = BRIDGES.length ? (BRIDGES[0][0] - 430 + LOOP) % LOOP : 0, last = performance.now(), raf = 0, slow = 0, dbg = null;
  const camM = new THREE.Matrix4(), camM2 = new THREE.Matrix4(), local = new THREE.Matrix4(), camQ = new THREE.Quaternion(), camQ2 = new THREE.Quaternion(), camP = new THREE.Vector3(), camP2 = new THREE.Vector3(), sc = new THREE.Vector3();
  const sunL = new THREE.Vector3(), inv = new THREE.Matrix4(), tmp = new THREE.Vector3(), chim = new THREE.Vector3(), vel = new THREE.Vector3();
  const axles = new Map(), FLASH = new THREE.Vector3(0.28, 0.42, 0.78);
  let leanS = 0, kS = 0, hsx = 0, hsy = 0;
  const hooks = { clack: () => {}, bridge: 0, car: "" };
  const SHUTTER = 1 / 48, mOpen = new THREE.Matrix4(), prevQ = new THREE.Quaternion();
  let hasPrevQ = false;
  let lampDip = 0, lampDipT = 4 + Math.random() * 10;
  function frame(dt) {
    tNow += dt;
    const t = tNow;
    sTrain = (sTrain + speed * dt) % LOOP;
    U.uTime.value = t;

    // lightning
    flash.next -= dt;
    if (!reduced && flash.next <= 0) { strike(); flash.next = 7 + Math.random() * 18; }
    let fl = 0;
    if (flash.t >= 0) {
      flash.t += dt;
      for (const [at, p] of flash.pulses) { const u = flash.t - at; if (u >= 0) fl += p * Math.exp(-u * 16) * (u < 0.6 ? 1 : 0); }
      if (flash.t > 1.5) flash.t = -1;
    }
    U.uFlash.value = fl;

    // the vehicles
    for (const v of veh) {
      vehicleMatrix(v, sTrain, t, 1, v.group.matrix);
      v.group.matrixWorldNeedsUpdate = true;
    }
    // per carriage: the sun in its frame, the grey light at each side's windows
    const sd = U.uSunDir.value, sky = U.uSkyHor.value, glow = U.uGlowCol.value;
    for (const v of veh) {
      const e = v.group.matrix.elements;
      sunL.set(sd.x * e[0] + sd.y * e[1] + sd.z * e[2], sd.x * e[4] + sd.y * e[5] + sd.z * e[6], sd.x * e[8] + sd.y * e[9] + sd.z * e[10]);
      v.mat.uniforms.uSunL.value.copy(sunL);
      const hs = Math.hypot(sd.x, sd.z), side = (e[0] * sd.x + e[2] * sd.z) / hs;     // how much the right side faces the sunset
      const base = 2.2, g = 1.4;
      v.mat.uniforms.uWinR.value.copy(sky).multiplyScalar(base).addScaledVector(glow, g * Math.max(side, 0) ** 2).addScaledVector(FLASH, fl);
      v.mat.uniforms.uWinL.value.copy(sky).multiplyScalar(base).addScaledVector(glow, g * Math.max(-side, 0) ** 2).addScaledVector(FLASH, fl);
      // the filaments tremble a little with the rattle of the rails, and dip when a joint is hit hard
      const fv = speed > 0 ? 0.012 * (vn2(t * 11 + v.Zc, 3.1) - 0.5) + 0.006 * Math.sin(TAU * 7.3 * t + v.Zc) * Math.min(1, lampDip * 6 + 0.3) : 0;
      v.mat.uniforms.uLampK.value = 1 - lampDip + fv;
    }
    // now and then the lamps dip as a joint is hit hard
    lampDipT -= dt;
    if (lampDipT < 0 && speed > 0) { lampDip = 0.25 + Math.random() * 0.25; lampDipT = 6 + Math.random() * 20; }
    lampDip *= Math.exp(-dt * 9);

    // walking (not while sitting: moving gets you up)
    const inp = input.take();
    if (outside) { inp.fwd = inp.side = inp.turn = inp.dx = inp.dy = 0; }
    if (walker.seat && (Math.abs(inp.fwd) > 0.1 || Math.abs(inp.side) > 0.1)) stand();
    walker.yaw -= inp.dx + inp.turn * dt * 1.8;
    walker.pitch = clamp(walker.pitch - inp.dy, -1.2, 1.2);
    let moving = 0;
    if (!walker.seat) {
      const sp = (inp.run ? 2.6 : 1.35) * dt, f = clamp(inp.fwd, -1, 1), s = clamp(inp.side, -1, 1);
      const sy = Math.sin(walker.yaw), cy = Math.cos(walker.yaw);
      const x0 = walker.x, z0 = walker.Z;
      walker.x += (-sy * f + cy * s) * sp; walker.Z += (-cy * f - sy * s) * sp;
      collide();
      walker.Z = clamp(walker.Z, train.Zmin + BODY, train.Zmax - BODY);
      moving = dt > 0 ? Math.min(1, Math.hypot(walker.x - x0, walker.Z - z0) / dt / 1.3) : 0;
    }
    walker.bob += dt * 8.5 * moving;
    walker.eye += ((walker.seat ? SEAT_EYE : EYE) - walker.eye) * (dt > 0 ? 1 - Math.exp(-dt * 6) : 1);
    prompt = outside ? "" : walker.seat ? "E: stand up" : nearSeat() ? "E: sit down" : "";

    // the camera rides in the carriage you are in (between two, blended), with less of the shake than the floor
    const i0 = clamp(Math.floor((walker.Z + ZX) / CAR), 0, cars.length - 1), zl = walker.Z - i0 * CAR;
    const tl = t - 0.06;
    // the body leans against the curve (lateral acceleration = speed^2 * curvature), slowly; steps rock the head
    // from side to side and nod it, and a breath of handheld drift never lets it sit quite still
    const kNow = curvAt(sTrain - walker.Z) * (speed / SPEED) ** 2;
    kS += (kNow - kS) * (dt > 0 ? 1 - Math.exp(-dt * 1.5) : 1);
    const lean = walker.seat ? kS * 3.2 : kS * 5.5;
    leanS += (lean - leanS) * (dt > 0 ? 1 - Math.exp(-dt * 2.5) : 1);
    const sb = Math.sin(walker.bob * 0.5), cb = Math.sin(walker.bob), br = 0.45 + 0.55 * (walker.seat ? 0 : 1);
    hsx = (vn2(t * 0.35, 1.7) - 0.5) * 0.006; hsy = (vn2(t * 0.3, 8.3) - 0.5) * 0.008;
    const headLocal = (zz) => local.makeRotationFromEuler(eTmp.set(walker.pitch + 0.0035 * cb * moving * br + hsx, walker.yaw + 0.004 * sb * moving + hsy, leanS + 0.006 * sb * moving, "YXZ")).setPosition(walker.x + sb * 0.014 * moving + leanS * 0.12, walker.eye + (Math.abs(cb) * 0.026 - 0.008) * moving, zz);
    vehicleMatrix(cars[i0], sTrain, tl, 0.55, camM);
    camM.multiply(headLocal(zl));
    if (zl > ZX && i0 + 1 < cars.length) {
      const f = smooth(ZX, CAR - ZX, zl);
      vehicleMatrix(cars[i0 + 1], sTrain, tl, 0.55, camM2);
      camM2.multiply(headLocal(zl - CAR));
      camM.decompose(camP, camQ, sc); camM2.decompose(camP2, camQ2, sc);
      camP.lerp(camP2, f); camQ.slerp(camQ2, f);
      camM.compose(camP, camQ, sc.set(1, 1, 1));
    }
    if (outside) {
      // the train past the spot by more than its length: on to the next one
      let past = ((sTrain - spot.s) % LOOP + LOOP) % LOOP; if (past > LOOP / 2) past -= LOOP;
      if (!spot.ready || past > 170) pickSpot();
      // a photographer by the line with a longer lens: the focal length chosen so the train (engine to last carriage,
      // as seen from here, often nearly end-on) fills about two thirds of the frame, eased like a slow zoom; aimed a
      // little toward the engine so it and its smoke lead, the train on the lower third under the storm sky
      tmp.setFromMatrixPosition(locoV.group.matrix).sub(spot.p); const dL = tmp.length(); tmp.normalize();
      outV.setFromMatrixPosition(cars[cars.length - 1].group.matrix).sub(spot.p).normalize();
      const span = Math.max(tmp.angleTo(outV), 0.03);
      outV.multiplyScalar(0.36).addScaledVector(tmp, 0.64).normalize().multiplyScalar(dL).add(spot.p);
      if (spot.aim.lengthSq() === 0 || dt === 0) spot.aim.copy(outV); else spot.aim.lerp(outV, 1 - Math.exp(-dt * 5));
      const asp = camFar.aspect;
      const want = clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(span / 0.6 / 2) / asp)), 7, 46);
      fovOut = fovOut === 0 || dt === 0 ? want : fovOut + (want - fovOut) * (1 - Math.exp(-dt * (want > fovOut ? 2.5 : 0.7)));
      camM.lookAt(spot.p, spot.aim, tmp.set(0, 1, 0)).setPosition(spot.p);
      const vf = THREE.MathUtils.degToRad(fovOut), hk = fovOut / 62;
      // handheld, braced: a slow wander and a faster tremor, smaller with the longer lens, and a breath
      eTmp.set(Math.atan(Math.tan(vf / 2) / 3) + ((vn2(t * 0.7, 2.1) - 0.5) * 0.006 + (vn2(t * 4.1, 5.2) - 0.5) * 0.0012) * hk + 0.0008 * Math.sin(t * 1.6),
        ((vn2(t * 0.6, 6.6) - 0.5) * 0.007 + (vn2(t * 3.7, 9.9) - 0.5) * 0.0012) * hk, (vn2(t * 0.5, 1.3) - 0.5) * 0.006, "YXZ");
      camM.multiply(mTmp.makeRotationFromEuler(eTmp));
    }
    const fov = outside ? fovOut : baseFov;
    if (camFar.fov !== fov) for (const c of [camFar, camNear]) { c.fov = fov; c.updateProjectionMatrix(); }
    for (const c of [camFar, camNear]) { c.matrixAutoUpdate = false; c.matrix.copy(camM); c.matrixWorldNeedsUpdate = true; c.updateMatrixWorld(true); }
    if (dbg) for (const c of [camFar, camNear]) { c.matrixAutoUpdate = true; c.position.copy(dbg[0]); c.lookAt(dbg[1]); c.updateMatrixWorld(true); }
    const iC = clamp(Math.round(walker.Z / CAR), 0, cars.length - 1);
    hooks.car = CARS[iC].name;

    // rain knows which carriage you are in and how fast you go; the glass how fast the drops run
    world.rainU.uCarInv.value.copy(cars[iC].group.matrix).invert();
    trackAt(sTrain - walker.Z, A);
    vel.set(A.tx, A.ty, A.tz).multiplyScalar(speed);
    world.rainU.uCamVel.value.copy(vel).multiplyScalar(outside ? 0 : 1);
    train.glassU.uSpeed.value = speed;

    // smoke from the engine
    chim.set(...CHIMNEY).applyMatrix4(locoV.group.matrix);
    world.updateSmoke(dt, chim, vel, t);

    // sounds: every wheelset of your carriage and its neighbours knocking over the joints, the hollow of a bridge
    for (let i = Math.max(0, iC - 1); i <= Math.min(cars.length - 1, iC + 1); i++) {
      const v = cars[i];
      for (const bz of [-v.half, v.half]) for (const az of [-1.25, 1.25]) {
        const key = i * 4 + (bz > 0 ? 2 : 0) + (az > 0 ? 1 : 0);
        const s = sTrain - v.Zc - bz - az, n = Math.floor(s / JOINT), prev = axles.get(key);
        axles.set(key, n);
        if (prev !== undefined && prev !== n && dt > 0) {
          const zAx = v.Zc + bz + az, d = Math.abs(zAx - walker.Z);
          hooks.clack(1 / (1 + d / 5), clamp((zAx - walker.Z) / 12, -1, 1));
        }
      }
    }
    hooks.bridge = bridgeAt(sTrain - walker.Z);

    // the shutter: where the camera was when it opened. Inside, the land moves by the train's travel (the turning of
    // your head does not smear it); outside, by the pan after the train.
    let blur = !dbg && !reduced && (outside || speed > 0.5);
    if (blur) {
      camQ.setFromRotationMatrix(camM);
      if (outside) {
        if (!hasPrevQ || dt <= 0) prevQ.copy(camQ);
        camQ2.copy(camQ).slerp(prevQ, Math.min(SHUTTER / Math.max(dt, 1e-3), 2));
        prevQ.copy(camQ); hasPrevQ = true;
        mOpen.makeRotationFromQuaternion(camQ2).setPosition(tmp.setFromMatrixPosition(camFar.matrixWorld));
      } else {
        mOpen.copy(camFar.matrixWorld).setPosition(tmp.setFromMatrixPosition(camFar.matrixWorld).addScaledVector(vel, -SHUTTER));
      }
      blur = camQ.angleTo(camQ2) > 1e-5 || !outside;
      mbU.uReproj.value.copy(camFar.projectionMatrix).multiply(mOpen.invert()).multiply(camFar.matrixWorld);
      mbU.uInvProj.value.copy(camFar.projectionMatrixInverse);
    } else hasPrevQ = false;

    post.U.uTime.value = t;
    post.render(() => {
      const target = renderer.getRenderTarget(), ac = renderer.autoClear; renderer.autoClear = false;
      // Inside: the train's opaque shell first, as depth at the very front only, so the land is not shaded where the
      // train hides it (most of the screen) and the blur pass skips those pixels too; then the train over it all in its
      // own depth range. Outside: the train is drawn into the land's depth with the same camera, so hills and trees in
      // front of it hide it.
      const mask = !outside;
      if (blur && target) {
        renderer.setRenderTarget(worldRT); renderer.clear(); if (mask) prepass(); renderer.render(worldScene, camFar);
        renderer.setRenderTarget(target); renderer.clear(); if (mask) prepass();
        fsQuad.material = outside ? mbMatOut : mbMat; renderer.render(fsQuad, fsCam);
      } else { renderer.clear(); if (mask) prepass(); renderer.render(worldScene, camFar); }
      if (outside) renderer.render(trainScene, camFar);
      else { renderer.clearDepth(); renderer.render(trainScene, camNear); }
      if (target) {
        // the light meter, eased: into the light in about half a second, out of it in a second or two
        meterU.tSrc.value = post.U.tScene.value; meterU.tLast.value = adaptRT[adaptI].texture;
        const snap = adaptSnap || dt <= 0;
        meterU.uUp.value = snap ? 1 : 1 - Math.exp(-dt * 2.2); meterU.uDown.value = snap ? 1 : 1 - Math.exp(-dt * 0.9);
        adaptI ^= 1; fsPass(meterMat, adaptRT[adaptI]); post.U.tAdapt.value = adaptRT[adaptI].texture; adaptSnap = false;
        brightU.tSrc.value = post.U.tScene.value; fsPass(brightMat, brightRT); fsPass(starMat, starRT);
      }
      renderer.autoClear = ac;
    });
  }

  let visible = true;
  function loop(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    slow = dt > 0.024 ? slow + 1 : Math.max(0, slow - 1);      // below ~42 fps for a while: render fewer pixels
    if (slow > 40 && pr > 0.6) { pr *= 0.8; renderer.setPixelRatio(pr); resize(); slow = 0; }
    frame(dt);
    raf = requestAnimationFrame(loop);
  }
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } });
  io.observe(canvasEl);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } });
  frame(0);
  raf = requestAnimationFrame((n) => { last = n; loop(n); });

  const setOutside = (v) => {
    outside = v; spot.ready = false; spot.aim.set(0, 0, 0); fovOut = 0; adaptSnap = true;
    return outside;
  };
  const nextCar = (d = 1) => { const i = (clamp(Math.round(walker.Z / CAR), 0, cars.length - 1) + d + cars.length) % cars.length; stand(); walker.seat = null; walker.x = 0; walker.Z = i * CAR - 8.8 + (i === 0 ? 0 : 0); walker.yaw = Math.PI; walker.pitch = -0.03; return CARS[i].name; };
  return {
    frame, strike, use, nextCar, toggleOutside: () => setOutside(!outside), get outside() { return outside; }, scene: trainScene, worldScene, camera: camNear, walker, hooks,
    set onThunder(f) { onThunder = f; },
    get prompt() { return prompt; }, get car() { return hooks.car; }, get sitting() { return !!walker.seat; },
    setS(s) { sTrain = ((s % LOOP) + LOOP) % LOOP; }, get s() { return sTrain; }, bridges: BRIDGES,
    stand(x, Z, yawDeg = 0, pitchDeg = 0) { walker.seat = null; walker.x = x; walker.Z = Z; walker.yaw = THREE.MathUtils.degToRad(yawDeg); walker.pitch = THREE.MathUtils.degToRad(pitchDeg); },
    sit() { use(); },
    look(p, q2) { dbg = p ? [new THREE.Vector3(...p), new THREE.Vector3(...q2)] : null; },
    setSpeed(v) { speed = v; },
    stats: { ...world.stats, info: renderer.info.render },
  };
}
