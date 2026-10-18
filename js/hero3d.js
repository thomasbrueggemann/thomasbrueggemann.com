// Hero scene: Skerryhead Light seen from a distance on a storm night.
// A compact three.js port of the ideas in github.com/thomasbrueggemann/lighthouse:
// Gerstner-wave sea with crest, trail and surf foam, storm sky lit by a hidden moon, rain streaks,
// branching lightning, white water on the rocks, and a rotating beam through the weather.
// The frame is rendered to an HDR target and finished with bloom, ACES, a light grade and lens effects.
// Everything is procedural; the only dependency is three.js (import map in index.html).

import * as THREE from "three";

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ---------------------------------------------------------------- tower dims (from the game)
const PLATEAU = 7, TOWER_TOP = 34, R_BASE = 5.6, R_TOP = 4.5, R_GALLERY = 5.9;
const LANTERN_Y = TOWER_TOP, LENS_Y = LANTERN_Y + 1.85, GLASS_TOP = LANTERN_Y + 3.8;
const GLASS_Y0 = LANTERN_Y + 0.9, GLASS_H = GLASS_TOP - GLASS_Y0;
const MOON_DIR = new THREE.Vector3(-0.2, 0.3, -0.92).normalize();

// ---------------------------------------------------------------- waves [dirX, dirZ, amp, wavelength]
const RAW = [
  [1.0, 0.25, 1.05, 52], [0.92, -0.38, 0.62, 33], [1.0, 0.62, 0.42, 21],
  [0.70, -0.71, 0.26, 12.5], [1.0, -0.12, 0.17, 7.8], [0.45, 0.89, 0.11, 5.1],
];
const STEEP = 0.62;
const WAVES = RAW.map(([dx, dz, a0, L], i) => {
  const l = Math.hypot(dx, dz), k = TAU / L, a = a0 * 1.4;
  return { dx: dx / l, dz: dz / l, a, k, w: Math.sqrt(9.81 * k), q: Math.min(1, STEEP / (k * a * RAW.length)), p: i * 1.7 };
});
function waveHeight(x, z, t) {
  let px = x, pz = z, y = 0;
  for (let it = 0; it < 3; it++) {
    let dx = 0, dz = 0; y = 0;
    for (const w of WAVES) {
      const ph = w.k * (w.dx * px + w.dz * pz) - w.w * t + w.p, c = Math.cos(ph), s = Math.sin(ph);
      dx += w.q * w.a * w.dx * c; dz += w.q * w.a * w.dz * c; y += w.a * s;
    }
    px = x - dx; pz = z - dz;
  }
  return y;
}

// ---------------------------------------------------------------- rocks: main island + sea stacks
// [x, z, radius, height, phase]. Shoreline radius varies with angle; same formula runs in the ocean shader.
const ROCKS = [
  [0, 0, 19, PLATEAU, 0.7],
  [-27, 13, 5.5, 11, 2.1],
  [25, -15, 6, 8, 4.0],
  [-44, -8, 4, 5.5, 5.3],
  [46, 14, 4.5, 4.5, 1.2],
];
const shoreR = (R, th, ph) => R * (1 + 0.16 * Math.sin(3 * th + ph) + 0.09 * Math.sin(5 * th + ph * 1.7) + 0.05 * Math.sin(9 * th + ph * 2.3));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const rid = (x, y) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += a * (1 - Math.abs(2 * vnoise(x * f, y * f) - 1)); f *= 2.1; a *= 0.5; } return s / 0.94; };
const fbmJS = (x, y) => { let s = 0, a = 0.5; for (let i = 0; i < 5; i++) { s += a * vnoise(x, y); x = x * 2.03 + 1.7; y = y * 2.03 + 9.2; a *= 0.5; } return s; };
function rockHeight(x, z) {
  let h = -6;
  for (const [rx, rz, R, H, ph] of ROCKS) {
    const dx = x - rx, dz = z - rz, r = Math.hypot(dx, dz), th = Math.atan2(dz, dx);
    // jointing cuts the rock into facets: blend the wavy outline toward a polygon (sharper for the small stacks)
    const ns = R > 10 ? 9 : 5 + Math.round(ph) % 3, seg = TAU / ns, dl = ((th + ph * 2.3) % seg + seg) % seg - seg / 2;
    const poly = Math.cos(seg / 2) / Math.cos(dl);
    const Rt = shoreR(R, th, ph) * (1 + (poly - 1) * (R > 10 ? 0.45 : 0.8)), d = r / Rt;
    const P = 1 - smooth(R > 10 ? 0.36 : 0.5, 1.0, d);
    let v;
    if (d < 1) {
      const mid = P * (1 - P) * 4;
      const detail = (fbmJS(x * 0.17, z * 0.17) - 0.5) * 11 * mid + (rid(x * 0.4, z * 0.4) - 0.5) * 3.4 * mid + (fbmJS(x * 1.3, z * 1.3) - 0.5) * 1.4 * Math.min(1, P * 3);
      v = H * P + detail;
      // the stacks are tilted, broken-topped blocks rather than flat drums
      if (R < 10) v += ((dx * Math.cos(ph * 3) + dz * Math.sin(ph * 3)) * 0.32 + (rid(x * 0.33 + ph, z * 0.33) - 0.5) * 4.5) * smooth(0.45, 1, P);
      // jointed granite breaks into ledges: flat treads and steep risers, the levels wandering so they never read as contour rings
      const st = 1.55, n = fbmJS(x * 0.09 + 3.1, z * 0.09 - 1.7) * 2.4;
      const f = (v + n) / st, fi = Math.floor(f), tv = (fi + smooth(0.5, 0.92, f - fi)) * st - n;
      v += (tv - v) * 0.6 * Math.min(1, P * 2.5) * (1 - smooth(0.88, 1.0, P));
    } else v = -(r - Rt) * 0.8;
    h = Math.max(h, v);
  }
  return h;
}

// ---------------------------------------------------------------- GLSL
const GLSL_NOISE = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
const mat2 FBM_ROT = mat2(0.8, -0.6, 0.6, 0.8);
float fbm(vec2 p){ float s = 0., a = .5; for(int i=0;i<5;i++){ s += a*vnoise(p); p = FBM_ROT * p * 2.03 + vec2(1.7, 9.2); a *= .5; } return s; }
float fbm3(vec2 p){ float s = 0., a = .5; for(int i=0;i<3;i++){ s += a*vnoise(p); p = FBM_ROT * p * 2.03 + vec2(1.7, 9.2); a *= .5; } return s / .875; }
// value noise with its analytic gradient: (value, d/dx, d/dy)
vec3 vnoised(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f), du = 6.*f*(1.-f);
  float a = hash12(i), b = hash12(i+vec2(1,0)), c = hash12(i+vec2(0,1)), d = hash12(i+vec2(1,1));
  return vec3(a + (b-a)*u.x + (c-a)*u.y + (a-b-c+d)*u.x*u.y, du * (vec2(b-a, c-a) + (a-b-c+d)*u.yx)); }
vec3 fbmd(vec2 p){ vec3 s = vec3(0.); float a = .5, f = 1.;
  for(int i=0;i<4;i++){ vec3 n = vnoised(p * f + vec2(float(i)*1.7, float(i)*9.2)); s += a * vec3(n.x, n.yz * f); f *= 2.03; a *= .5; } return s; }
`;

const GLSL_SKY = /* glsl */`
${GLSL_NOISE}
uniform float uTime, uFlash, uMoonVis;
uniform vec3 uFlashDir, uMoonDir;
vec3 stormSky(vec3 d, float full){
  float h = d.y, hh = max(h, 0.0);
  vec3 base = mix(vec3(0.070, 0.085, 0.108), vec3(0.024, 0.033, 0.050), smoothstep(0.0, 0.28, hh));
  base = mix(base, vec3(0.009, 0.013, 0.023), smoothstep(0.25, 1.0, hh));
  vec2 uv = d.xz / (hh + 0.15);
  vec2 wind = vec2(uTime * 0.020, uTime * 0.008);
  float lo = fbm(uv * 0.5 + wind);
  float hi = full > 0.5 ? fbm(uv * 1.7 - wind * 1.7 + lo * 1.4) : lo;
  float dens = lo * 0.74 + hi * 0.44;
  float md = max(dot(d, uMoonDir), 0.0);
  float gap = pow(md, 90.0) * uMoonVis;
  float cover = smoothstep(0.33, 0.80, dens - gap * 0.5);
  vec2 mv = normalize(uMoonDir.xz + 1e-4) * 0.16;
  float lo2 = fbm((uv + mv) * 0.5 + wind);
  float rim = clamp((lo - lo2) * 6.0 + 0.45, 0.0, 1.0);
  float glow = 0.06 + pow(md, 8.0) * 0.42 + pow(md, 60.0) * 1.6;
  vec3 cloudDark = vec3(0.013, 0.017, 0.025);
  vec3 cloudLit  = vec3(0.19, 0.235, 0.33);
  float bill = full > 0.5 ? 0.75 + 0.5 * vnoise(uv * 4.0 - wind * 3.0) : 1.0;      // fine billows on the moonlit rims
  vec3 cloud = mix(cloudDark, cloudLit, clamp(glow * (0.2 + rim * 0.95) * bill, 0.0, 1.0));
  cloud += vec3(0.028, 0.034, 0.045) * smoothstep(0.45, 0.0, hh);
  vec3 col = mix(base, cloud, cover);
  // the moon: a small hard disc veiled by the deck, a tight aureole and a wide glow in thin cloud
  float disc = smoothstep(0.99983, 0.99991, md);
  float veil = pow(1.0 - cover, 1.6);
  col += vec3(1.0, 1.05, 1.15) * disc * veil * veil * (0.3 + uMoonVis) * 2.6;
  col += vec3(0.32, 0.40, 0.58) * (pow(md, 900.0) * 0.45 + pow(md, 160.0) * 0.22) * (1.0 - cover * 0.75) * (0.3 + uMoonVis);
  float scud = 0.0;
  if (full > 0.5) {
    // ragged scud racing low under the deck: it moves several times faster, which gives the sky depth
    vec2 uvS = d.xz / (hh + 0.05);
    float s = fbm(uvS * 0.55 + vec2(uTime * 0.075, uTime * 0.026) + hi * 0.5);
    scud = smoothstep(0.52, 0.74, s) * smoothstep(0.0, 0.06, hh) * (1.0 - smoothstep(0.3, 0.75, hh));
    vec3 scudCol = vec3(0.010, 0.013, 0.019) + vec3(0.05, 0.06, 0.08) * pow(md, 12.0) * (0.3 + uMoonVis);
    col = mix(col, scudCol, scud * 0.8);
  }
  // lightning lights the deck from within: a broad wash plus a hot core around the strike, brightest in the thick billows
  vec3 fdn = normalize(uFlashDir);
  float fd = max(dot(d, fdn), 0.0);
  float core = exp((fd - 1.0) * 7.0);
  float thick = smoothstep(0.35, 0.95, dens);
  col += vec3(0.50, 0.58, 0.85) * uFlash * (0.06 + cover * (0.25 + rim * 0.5) + core * (0.5 + 3.6 * thick) + scud * core * 1.5) * 1.5;
  return col;
}
`;

const SHORE_GLSL = /* glsl */`
uniform vec4 uRock[5];
float shoreDist(vec2 p){
  float sd = 1e3;
  for (int i = 0; i < 5; i++){
    vec2 d = p - uRock[i].xy; float r = length(d), th = atan(d.y, d.x), ph = uRock[i].w;
    float Rt = uRock[i].z * (1. + .16*sin(3.*th + ph) + .09*sin(5.*th + ph*1.7) + .05*sin(9.*th + ph*2.3));
    sd = min(sd, r - Rt);
  }
  return sd;
}
`;

// ---------------------------------------------------------------- post: HDR scene -> dual-filter bloom -> ACES, grade, lens
const POST_VERT = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }";
const DOWN_FRAG = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThresh;
varying vec2 vUv;
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 karis(vec3 c){ return c / (1.0 + luma(c)); }
void main(){
  vec2 t = uTexel;
  vec3 a = texture2D(tSrc, vUv + t * vec2(-2., -2.)).rgb, b = texture2D(tSrc, vUv + t * vec2(0., -2.)).rgb, c = texture2D(tSrc, vUv + t * vec2(2., -2.)).rgb;
  vec3 d = texture2D(tSrc, vUv + t * vec2(-2., 0.)).rgb,  e = texture2D(tSrc, vUv).rgb,                   f = texture2D(tSrc, vUv + t * vec2(2., 0.)).rgb;
  vec3 g = texture2D(tSrc, vUv + t * vec2(-2., 2.)).rgb,  h = texture2D(tSrc, vUv + t * vec2(0., 2.)).rgb,  i = texture2D(tSrc, vUv + t * vec2(2., 2.)).rgb;
  vec3 j = texture2D(tSrc, vUv + t * vec2(-1., -1.)).rgb, k = texture2D(tSrc, vUv + t * vec2(1., -1.)).rgb;
  vec3 l = texture2D(tSrc, vUv + t * vec2(-1., 1.)).rgb,  m = texture2D(tSrc, vUv + t * vec2(1., 1.)).rgb;
  #ifdef FIRST
    vec3 g0 = (a + b + d + e) * .25, g1 = (b + c + e + f) * .25, g2 = (d + e + g + h) * .25, g3 = (e + f + h + i) * .25, g4 = (j + k + l + m) * .25;
    vec3 o = karis(g0) * .125 + karis(g1) * .125 + karis(g2) * .125 + karis(g3) * .125 + karis(g4) * .5;
    o *= 1.0 + luma(o);
    float lo = luma(o);
    o *= smoothstep(uThresh * 0.5, uThresh * 2.0, lo);   // soft knee: only the brighter half of the frame glows
  #else
    vec3 o = (a + c + g + i) * .03125 + (b + d + f + h) * .0625 + e * .125 + (j + k + l + m) * .125;
  #endif
  gl_FragColor = vec4(o, 1.);
}`;
const UP_FRAG = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uWeight;
varying vec2 vUv;
void main(){
  vec4 d = uTexel.xyxy * vec4(1., 1., -1., 0.);
  vec3 s = texture2D(tSrc, vUv - d.xy).rgb + texture2D(tSrc, vUv - d.wy).rgb * 2. + texture2D(tSrc, vUv - d.zy).rgb
         + texture2D(tSrc, vUv + d.zw).rgb * 2. + texture2D(tSrc, vUv).rgb * 4. + texture2D(tSrc, vUv + d.xw).rgb * 2.
         + texture2D(tSrc, vUv + d.zy).rgb + texture2D(tSrc, vUv + d.wy).rgb * 2. + texture2D(tSrc, vUv + d.xy).rgb;
  gl_FragColor = vec4(s * (uWeight / 16.), 1.);
}`;
const COMP_FRAG = /* glsl */`
uniform sampler2D tScene, tBloom;
uniform vec2 uRes;
uniform float uTime, uExposure, uBloom, uFlash;
varying vec2 vUv;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 aces(vec3 color){   // same curve as three's ACESFilmicToneMapping
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
  vec2 ca = q * dot(q, q) * 0.007;                       // lateral chromatic aberration, only toward the corners
  vec3 col = vec3(texture2D(tScene, vUv - ca).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv + ca).b);
  vec3 bl = texture2D(tBloom, vUv).rgb;
  col += bl * uBloom;
  vec3 c = toSRGB(aces(col));
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c += vec3(-0.008, 0.001, 0.016) * (1.0 - l) * (1.0 - l);   // cool, slightly lifted shadows like a night exposure
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.16);
  float vig = smoothstep(1.05, 0.28, length(q * vec2(1.0, 1.2)));
  c *= mix(0.6, 1.0, vig);
  c += (h21(vUv * uRes + fract(uTime * 7.31) * 113.) - 0.5) * 0.016;   // fine film grain
  gl_FragColor = vec4(c, 1.);
}`;

function makePost(renderer) {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const quad = new THREE.Mesh(geo); quad.frustumCulled = false;
  const sh = (frag, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: POST_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, ...extra });
  const downU = { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 0.35 } };
  const downFirst = sh(DOWN_FRAG, downU, { defines: { FIRST: "" } }), down = sh(DOWN_FRAG, downU);
  const upU = { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 } };
  const up = sh(UP_FRAG, upU, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, transparent: true });
  const compU = { tScene: { value: null }, tBloom: { value: null }, uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uExposure: { value: 1.15 }, uBloom: { value: 0.32 }, uFlash: { value: 0 } };
  const comp = sh(COMP_FRAG, compU);
  const W = [1.0, 0.9, 0.8, 0.7, 0.55, 0.4];       // how much each blur level contributes, finest first
  // HDR needs renderable half floats; without them fall back to 8-bit targets (the glow is then softer, nothing breaks)
  const ext = renderer.extensions, hdr = ext.has("EXT_color_buffer_float") || ext.has("EXT_color_buffer_half_float");
  const TYPE = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, type: TYPE };
  let sceneRT = null, mips = [], norm = 1;
  const BLOOM = 0.32;
  const v2 = new THREE.Vector2();
  function setSize() {
    renderer.getDrawingBufferSize(v2);
    const w = Math.max(2, v2.x | 0), h = Math.max(2, v2.y | 0);
    sceneRT?.dispose(); mips.forEach((m) => m.dispose()); mips = [];
    sceneRT = new THREE.WebGLRenderTarget(w, h, { type: TYPE, samples: 4, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    // bloom runs from half resolution down
    let mw = w >> 1, mh = h >> 1;
    for (let i = 0; i < W.length && mw >= 4 && mh >= 4; i++, mw >>= 1, mh >>= 1) mips.push(new THREE.WebGLRenderTarget(mw, mh, opts));
    norm = 0; for (let i = 0; i < mips.length; i++) norm += W[i];
    compU.uRes.value.set(w, h); compU.tScene.value = sceneRT.texture; compU.tBloom.value = mips[0]?.texture;
  }
  const pass = (m, target) => { quad.material = m; renderer.setRenderTarget(target); renderer.render(quad, cam); };
  function render(scene, camera) {
    renderer.setRenderTarget(sceneRT); renderer.render(scene, camera);
    downU.tSrc.value = sceneRT.texture; downU.uTexel.value.set(1 / sceneRT.width, 1 / sceneRT.height);
    pass(downFirst, mips[0]);
    for (let i = 1; i < mips.length; i++) { downU.tSrc.value = mips[i - 1].texture; downU.uTexel.value.set(1 / mips[i - 1].width, 1 / mips[i - 1].height); pass(down, mips[i]); }
    const ac = renderer.autoClear; renderer.autoClear = false;     // upsample additively onto each finer level
    for (let i = mips.length - 1; i > 0; i--) { upU.tSrc.value = mips[i].texture; upU.uTexel.value.set(1 / mips[i].width, 1 / mips[i].height); upU.uWeight.value = W[i] / W[i - 1]; pass(up, mips[i - 1]); }
    renderer.autoClear = ac;
    compU.uBloom.value = BLOOM / norm;
    pass(comp, null);
  }
  return { setSize, render, U: compU };
}

// ---------------------------------------------------------------- procedural canvases
function canvas(w, h = w) { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; }
// height canvas -> tangent-space normal map
function normalFromHeight(hctx, W, H, k) {
  const src = hctx.getImageData(0, 0, W, H).data, [c, x] = canvas(W, H), out = x.createImageData(W, H), d = out.data;
  const h = (i, j) => src[(((j + H) % H) * W + ((i + W) % W)) * 4] / 255;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    let nx = -(h(i + 1, j) - h(i - 1, j)) * k, ny = (h(i, j + 1) - h(i, j - 1)) * k, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = (j * W + i) * 4; d[o] = (nx * 0.5 + 0.5) * 255; d[o + 1] = (ny * 0.5 + 0.5) * 255; d[o + 2] = (nz * 0.5 + 0.5) * 255; d[o + 3] = 255;
  }
  x.putImageData(out, 0, 0);
  return c;
}

// ---------------------------------------------------------------- the scene
export function startHero3D(canvasEl, { reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: false, powerPreference: "high-performance" });
  let pr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pr);
  renderer.toneMapping = THREE.NoToneMapping;          // tone mapping happens in the post composite
  const post = makePost(renderer);

  const scene = new THREE.Scene();
  const fogBase = new THREE.Color().setRGB(0.046, 0.058, 0.077, THREE.LinearSRGBColorSpace);
  const fogFlash = new THREE.Color().setRGB(0.26, 0.31, 0.46, THREE.LinearSRGBColorSpace);
  scene.fog = new THREE.FogExp2(fogBase.clone(), 0.0042);
  scene.background = fogBase.clone();

  const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 2000);
  const camBase = new THREE.Vector3(-38, 8, 138), target = new THREE.Vector3(-18, 19, 0);

  // shared sky/weather uniforms
  const U = {
    uTime: { value: 0 }, uFlash: { value: 0 }, uFlashDir: { value: new THREE.Vector3(0.2, 0.5, -1).normalize() },
    uMoonVis: { value: 0.5 }, uMoonDir: { value: MOON_DIR.clone() },
  };

  // ---- sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { ...U, uFog: { value: fogBase.clone() } },
    vertexShader: "varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }",
    fragmentShader: `${GLSL_SKY}
      uniform vec3 uFog; varying vec3 vD;
      void main(){
        vec3 d = normalize(vD);
        vec3 col = stormSky(d, 1.0);
        col = mix(col, uFog, smoothstep(0.12, -0.03, d.y));
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 40, 20), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);

  // ---- environment for wet reflections: the same storm sky over a dark sea, prefiltered once
  const envTex = (() => {
    const s = new THREE.Scene();
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { uTime: { value: 30 }, uFlash: { value: 0 }, uFlashDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonVis: { value: 0.7 }, uMoonDir: { value: MOON_DIR.clone() } },
      vertexShader: "varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
      fragmentShader: `${GLSL_SKY} varying vec3 vD;
        void main(){ vec3 d = normalize(vD);
          vec3 c = stormSky(vec3(d.x, max(d.y, 0.02), d.z), 1.0);
          c = mix(c, vec3(0.012, 0.018, 0.024), smoothstep(0.02, -0.12, d.y));
          gl_FragColor = vec4(c * 1.6, 1.); }`,
    });
    s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), m));
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(s, 0);
    pm.dispose(); m.dispose();
    return rt.texture;
  })();
  const wetMats = [];            // materials whose sky reflections brighten with the lightning

  // ---- lights
  const hemi = new THREE.HemisphereLight(0x3a4a6c, 0x0e1318, 1.5);
  const moonLight = new THREE.DirectionalLight(0x9db4ea, 2.4);
  moonLight.position.copy(MOON_DIR).multiplyScalar(100);
  const flashLight = new THREE.DirectionalLight(0xbfd0ff, 0);
  const lampLight = new THREE.PointLight(0xffc27a, 0, 90, 1.4);
  lampLight.position.set(0, LENS_Y, 0);
  const fill = new THREE.DirectionalLight(0x8e9cb8, 1.0); fill.position.set(-0.3, 0.45, 1).multiplyScalar(100);
  // the keeper's door lamp spills warm light over the rocks at the foot of the tower
  const doorA = 1.98, doorLight = new THREE.PointLight(0xffb060, 9, 16, 1.6);
  doorLight.position.set(Math.cos(doorA) * (R_BASE + 1.4), PLATEAU + 3.2, Math.sin(doorA) * (R_BASE + 1.4));
  scene.add(hemi, moonLight, fill, flashLight, lampLight, doorLight);

  // ---- rock (height field) with a procedural granite shader
  {
    const SZ = 124, SEG = 300, S1 = SEG + 1;
    const g = new THREE.PlaneGeometry(SZ, SZ, SEG, SEG);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, Hs = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) { Hs[i] = rockHeight(pos.getX(i), pos.getZ(i)); pos.setY(i, Hs[i]); }
    g.computeVertexNormals();
    // cavity: how far a point sits below its neighbourhood (crevices, the gaps between ledges)
    const cav = new Float32Array(pos.count), OFF = [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, 2], [2, -2], [-2, -2], [7, 0], [-7, 0], [0, 7], [0, -7]];
    for (let j = 0; j < S1; j++) for (let i = 0; i < S1; i++) {
      let s = 0, n = 0;
      for (const [di, dj] of OFF) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= S1 || jj >= S1) continue; s += Hs[jj * S1 + ii]; n++; }
      cav[j * S1 + i] = clamp((s / n - Hs[j * S1 + i]) * 0.45, -1, 1);
    }
    g.setAttribute("aCav", new THREE.BufferAttribute(cav, 1));
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const v = 0.72 + 0.55 * fbmJS(x * 0.08 + 5, z * 0.08) * (0.7 + 0.6 * fbmJS(x * 0.5, z * 0.5));
      col.set([v, v * 0.98, v * 0.95], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.0, envMap: envTex, envMapIntensity: 1.0 });
    rockMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.uTime;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aCav; varying vec3 vWP; varying vec3 vWN; varying float vCav;")
        .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal); vCav = aCav;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
          varying vec3 vWP; varying vec3 vWN; varying float vCav; uniform float uTime;
          ${GLSL_NOISE}
          // crack lines along the zero set of a noise: (mask, gradient)
          vec3 crackd(vec2 p){ vec3 n = vnoised(p); float s = 2. * n.x - 1., r = 1. - abs(s); float c = pow(r, 16.); return vec3(c, 16. * pow(r, 15.) * (-2. * sign(s)) * n.yz); }`)
        .replace("#include <color_fragment>", `#include <color_fragment>
          vec3 gN = normalize(vWN);
          vec3 bw = pow(abs(gN), vec3(4.)); bw /= dot(bw, vec3(1.));
          // surface relief: triplanar fbm with analytic gradients
          vec3 fx = fbmd(vWP.zy * 0.5), fy = fbmd(vWP.xz * 0.5), fz = fbmd(vWP.xy * 0.5);
          vec3 gradH = 0.5 * (bw.x * vec3(0., fx.z, fx.y) + bw.y * vec3(fy.y, 0., fy.z) + bw.z * vec3(fz.y, fz.z, 0.));
          float relief = fx.x * bw.x + fy.x * bw.y + fz.x * bw.z;
          // joints: near-vertical cracks on the faces, a polygonal network on the tops
          vec3 cx = crackd(vec2(vWP.z * 0.42, vWP.y * 0.13)), cz = crackd(vec2(vWP.x * 0.42, vWP.y * 0.13)), cy = crackd(vWP.xz * 0.3);
          float crack = cx.x * bw.x + cz.x * bw.z + cy.x * bw.y;
          vec3 gradC = bw.x * vec3(0., cx.z * 0.13, cx.y * 0.42) + bw.z * vec3(cz.y * 0.42, cz.z * 0.13, 0.) + bw.y * vec3(cy.y * 0.3, 0., cy.z * 0.3);
          gradH -= gradC * 0.22;
          float yW = vWP.y, up = gN.y;
          float n2 = fbm3(vWP.xz * 0.21 + yW * 0.05);
          float speck = vnoise(vWP.xz * 2.7 + yW * 2.1) * 0.6 + vnoise(vWP.zy * 3.3) * 0.4;
          vec3 c = vec3(0.26, 0.245, 0.225) * (0.6 + 0.6 * relief) * (0.8 + 0.4 * speck);
          // zonation of an Atlantic skerry: wrack and barnacles in the surf, a black lichen band, orange lichen above, grey crust higher up
          float tide = yW - (n2 - 0.5) * 1.4;
          float wrack = 1.0 - smoothstep(0.6, 1.8, tide);
          float tar = smoothstep(1.2, 1.9, tide) * (1.0 - smoothstep(2.6, 3.8, tide));
          float orange = smoothstep(3.0, 4.0, tide) * smoothstep(0.48, 0.66, fbm3(vWP.xz * 0.45 + yW * 0.35 + 7.)) * (1.0 - smoothstep(8.5, 10.5, yW));
          c = mix(c, vec3(0.03, 0.029, 0.027), tar * 0.85);
          c = mix(c, vec3(0.30, 0.13, 0.035), orange * 0.65);
          float barn = smoothstep(0.62, 0.8, vnoise(vWP.xz * 5.0 + yW * 3.0)) * smoothstep(0.4, 1.6, tide);
          c = mix(c, mix(vec3(0.045, 0.038, 0.02), vec3(0.16, 0.15, 0.13), barn), wrack);
          // salt and guano streaks running down the faces of the stacks
          float streak = smoothstep(0.55, 0.8, fbm3(vec2((vWP.x + vWP.z) * 0.8, yW * 0.07))) * smoothstep(3.0, 6.0, tide) * (1.0 - bw.y);
          c = mix(c, vec3(0.42, 0.42, 0.40), streak * 0.45);
          // wiry turf on the island top
          float turf = smoothstep(0.74, 0.9, up) * smoothstep(${(PLATEAU - 2.6).toFixed(1)}, ${(PLATEAU - 1.0).toFixed(1)}, yW) * (1.0 - smoothstep(19., 24., length(vWP.xz)));
          turf *= smoothstep(0.3, 0.55, n2 + 0.25);
          c = mix(c, vec3(0.035, 0.048, 0.022) * (0.7 + 0.6 * speck), turf * 0.9);
          // crevices and cracks hold shadow
          float cavK = clamp(vCav, 0., 1.);
          c *= (1.0 - 0.8 * cavK) * (1.0 - 0.6 * crack) * (1.0 + 0.25 * clamp(-vCav, 0., 1.));
          diffuseColor.rgb = c * vColor.rgb;
          // wetness: soaked in the surf zone, glazed with rain everywhere else, with runnels down the faces
          float soak = 1.0 - smoothstep(1.5, 4.0, tide);
          float runnel = smoothstep(0.5, 0.78, vnoise(vec2((vWP.x - vWP.z) * 1.5, yW * 0.22))) * (1.0 - bw.y);
          float wet = max(soak, 0.3 + 0.5 * runnel) * (1.0 - turf * 0.7);
          diffuseColor.rgb *= 1.0 - 0.35 * wet;
          float rockRough = mix(0.85, 0.2, wet) + crack * 0.2;`)
        .replace("#include <roughnessmap_fragment>", "float roughnessFactor = clamp(rockRough, 0.08, 1.0);")
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
          { vec3 g2 = gradH - gN * dot(gradH, gN);
            normal = normalize((viewMatrix * vec4(normalize(gN - g2 * 1.25), 0.)).xyz); }`);
    };
    wetMats.push([rockMat, 1.0]);
    scene.add(new THREE.Mesh(g, rockMat));
  }

  // ---- tower
  const lampMats = [];
  let glassU = null;
  {
    // ashlar courses: colour with per-block tone, and a height map for relief (mortar recessed, block faces slightly domed)
    const TW = 512, rowH = 32, blockW = 128;
    const [cv, x] = canvas(TW), [hv, hx] = canvas(TW);
    x.fillStyle = "#d8d9d6"; x.fillRect(0, 0, TW, TW); hx.fillStyle = "#808080"; hx.fillRect(0, 0, TW, TW);
    for (let r = 0; r < TW / rowH; r++) {
      const off = (r % 2) * blockW / 2;
      for (let b = -1; b < TW / blockW + 1; b++) {
        const x0 = off + b * blockW, tone = 200 + Math.random() * 34, warm = Math.random() * 6;
        x.fillStyle = `rgb(${tone + warm},${tone + warm * 0.6},${tone - 4})`; x.fillRect(x0, r * rowH, blockW, rowH);
        const g = hx.createLinearGradient(0, r * rowH, 0, r * rowH + rowH);
        const hb = 170 + Math.random() * 50;
        g.addColorStop(0, `rgb(${hb - 30},${hb - 30},${hb - 30})`); g.addColorStop(0.3, `rgb(${hb},${hb},${hb})`); g.addColorStop(1, `rgb(${hb - 40},${hb - 40},${hb - 40})`);
        hx.fillStyle = g; hx.fillRect(x0, r * rowH, blockW, rowH);
      }
    }
    for (let i = 0; i < 14000; i++) {
      const px = Math.random() * TW, py = Math.random() * TW, s = 1 + Math.random() * 3, g = 170 + Math.random() * 70;
      x.fillStyle = `rgba(${g},${g},${g - 6},.22)`; x.fillRect(px, py, s, s * 0.7);
      hx.fillStyle = `rgba(${g - 40},${g - 40},${g - 40},.35)`; hx.fillRect(px, py, s, s * 0.7);
    }
    x.strokeStyle = "rgba(70,72,74,.6)"; hx.strokeStyle = "rgb(20,20,20)"; x.lineWidth = 2; hx.lineWidth = 3;
    for (let r = 0; r < TW / rowH; r++) {
      const off = (r % 2) * blockW / 2;
      for (const c of [x, hx]) {
        c.beginPath(); c.moveTo(0, r * rowH); c.lineTo(TW, r * rowH); c.stroke();
        for (let b = 0; b <= TW / blockW; b++) { c.beginPath(); c.moveTo(off + b * blockW, r * rowH); c.lineTo(off + b * blockW, (r + 1) * rowH); c.stroke(); }
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const ntex = new THREE.CanvasTexture(normalFromHeight(hx, TW, TW, 3.0));
    ntex.wrapS = ntex.wrapT = THREE.RepeatWrapping; ntex.anisotropy = 4;

    // rain-streaked, weathered paint: grime and rust bleeding from the gallery, green-black algae at the foot, wet sheen
    const weathered = (m) => {
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP;")
          .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.)).xyz;");
        sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\nvarying vec3 vWP;\n${GLSL_NOISE}`)
          .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
            float th = atan(vWP.z, vWP.x);
            float sN = fbm3(vec2(th * 8.0, vWP.y * 0.05));
            float sF = vnoise(vec2(th * 60.0, vWP.y * 0.3));
            float streak = smoothstep(0.42, 0.78, sN) * (0.5 + 0.5 * sF);
            float topK = smoothstep(${(TOWER_TOP - 10).toFixed(1)}, ${(TOWER_TOP - 0.6).toFixed(1)}, vWP.y + sN * 3.0);
            float footK = 1.0 - smoothstep(${(PLATEAU + 0.2).toFixed(1)}, ${(PLATEAU + 4.0).toFixed(1)}, vWP.y + sN * 2.2 - sF * 0.6);
            diffuseColor.rgb *= 1.0 - 0.30 * streak - 0.06 * sF;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.15, 0.07) * (0.6 + 0.4 * sF), topK * streak * 0.55);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.055, 0.032), footK * 0.8);
            roughnessFactor = clamp(roughnessFactor - 0.28 * streak - 0.25 * footK, 0.18, 1.0);`);
      };
      return m;
    };
    const radius = (y) => THREE.MathUtils.lerp(R_BASE, R_TOP, (y - PLATEAU) / (TOWER_TOP - PLATEAU));
    const lathe = (y0, y1, color) => {
      const pts = []; for (let i = 0; i <= 6; i++) { const y = y0 + (y1 - y0) * i / 6; pts.push(new THREE.Vector2(radius(y), y)); }
      const g = new THREE.LatheGeometry(pts, 96);
      const m = weathered(new THREE.MeshStandardMaterial({ map: tex.clone(), normalMap: ntex.clone(), normalScale: new THREE.Vector2(0.9, 0.9), color, roughness: 0.62, metalness: 0, envMap: envTex, envMapIntensity: 0.55 }));
      m.map.needsUpdate = true; m.map.repeat.set(6, (y1 - y0) / 4.2);
      m.normalMap.needsUpdate = true; m.normalMap.repeat.copy(m.map.repeat);
      wetMats.push([m, 0.55]);
      return new THREE.Mesh(g, m);
    };
    scene.add(lathe(PLATEAU - 1.2, 19, 0xe2e3df), lathe(19, 25, 0x9b2b25), lathe(25, TOWER_TOP, 0xe2e3df));

    // windows spiralling up the tower: recessed dark frame, sill, glowing or dark glass
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.5 });
    const darkGlass = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.06, metalness: 0.2, envMap: envTex, envMapIntensity: 1.6 });
    wetMats.push([darkGlass, 1.6]);
    const sillMat = new THREE.MeshStandardMaterial({ color: 0xbdbcb6, roughness: 0.5, envMap: envTex, envMapIntensity: 0.5 });
    const winGeo = new THREE.PlaneGeometry(0.7, 1.3), frameGeo = new THREE.PlaneGeometry(0.98, 1.62), sillGeo = new THREE.BoxGeometry(1.1, 0.14, 0.32);
    const place = (mesh, a, r, y) => { mesh.position.set(Math.cos(a) * r, y, Math.sin(a) * r); mesh.rotation.y = Math.PI / 2 - a; scene.add(mesh); };
    for (let k = 0; k < 11; k++) {
      const y = 11 + k * 2.15, a = 1.5 + k * 1.15, r = radius(y);
      const lit = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1][k];
      const m = lit ? new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.3, 0.55) }) : darkGlass;
      if (lit) lampMats.push(m);
      place(new THREE.Mesh(frameGeo, frameMat), a, r + 0.02, y);
      place(new THREE.Mesh(winGeo, m), a, r + 0.035, y);
      place(new THREE.Mesh(sillGeo, sillMat), a, r + 0.1, y - 0.78);
    }
    // the keeper's door, its step and lamp
    const rd = radius(PLATEAU);
    place(new THREE.Mesh(new THREE.PlaneGeometry(1.75, 3.0), frameMat), doorA, rd + 0.02, PLATEAU + 1.3);
    place(new THREE.Mesh(new THREE.PlaneGeometry(1.35, 2.6), new THREE.MeshStandardMaterial({ color: 0x0f2a22, roughness: 0.35, envMap: envTex, envMapIntensity: 0.8 })), doorA, rd + 0.04, PLATEAU + 1.2);
    place(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 1.6), sillMat), doorA, rd + 0.55, PLATEAU - 0.3);
    const doorLamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 5.5, 2.2) }));
    place(doorLamp, doorA, rd + 0.3, PLATEAU + 3.1);

    // cornice with corbels, gallery deck, railing
    const dark = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.35, metalness: 0.6, envMap: envTex, envMapIntensity: 1.0 });
    wetMats.push([dark, 1.0]);
    const stoneMat = weathered(new THREE.MeshStandardMaterial({ map: tex, normalMap: ntex, color: 0xdadad6, roughness: 0.6, envMap: envTex, envMapIntensity: 0.5 }));
    const cornice = new THREE.Mesh(new THREE.CylinderGeometry(R_GALLERY - 0.35, R_TOP + 0.35, 0.9, 64), stoneMat);
    cornice.position.y = TOWER_TOP - 0.45;
    const corbels = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 1.0, 0.4), stoneMat, 40);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p3 = new THREE.Vector3();
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * TAU;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
      mtx.compose(p3.set(Math.cos(a) * (R_TOP + 0.35), TOWER_TOP - 1.35, Math.sin(a) * (R_TOP + 0.35)), q, sc); corbels.setMatrixAt(i, mtx);
    }
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(R_GALLERY, R_GALLERY - 0.1, 0.35, 64), dark);
    deck.position.y = TOWER_TOP + 0.1;
    const rail = new THREE.Mesh(new THREE.TorusGeometry(R_GALLERY - 0.1, 0.07, 6, 72), dark);
    rail.rotation.x = Math.PI / 2; rail.position.y = TOWER_TOP + 1.2;
    const rail2 = rail.clone(); rail2.position.y = TOWER_TOP + 0.7;
    const bal = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 4), dark, 56);
    for (let i = 0; i < 56; i++) { const a = i / 56 * TAU; mtx.makeTranslation(Math.cos(a) * (R_GALLERY - 0.1), TOWER_TOP + 0.65, Math.sin(a) * (R_GALLERY - 0.1)); bal.setMatrixAt(i, mtx); }
    scene.add(cornice, corbels, deck, rail, rail2, bal);

    // lantern: iron pedestal, glazing with the lens glowing behind it, astragals, copper roof, ventilator ball and vane
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(3.05, 3.15, GLASS_Y0 - LANTERN_Y, 32), dark);
    ped.position.y = (LANTERN_Y + GLASS_Y0) / 2 + 0.15; scene.add(ped);
    glassU = { uFacing: { value: 0 }, uFlick: { value: 1 } };
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, GLASS_H, 32, 1, true), new THREE.ShaderMaterial({
      uniforms: glassU, side: THREE.DoubleSide,
      vertexShader: "varying vec3 vP; varying vec3 vWN; varying vec3 vWP; void main(){ vP = position; vWN = normalize(mat3(modelMatrix) * normal); vWP = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vWP, 1.); }",
      fragmentShader: `uniform float uFacing, uFlick; varying vec3 vP; varying vec3 vWN; varying vec3 vWP;
        void main(){
          float yy = vP.y / ${GLASS_H.toFixed(3)} + 0.5;
          float ly = ${((LENS_Y - GLASS_Y0) / GLASS_H).toFixed(3)};
          float core = exp(-pow((yy - ly) / 0.2, 2.));
          float prisms = 0.7 + 0.3 * sin(yy * 80.0);
          vec3 V = normalize(cameraPosition - vWP);
          float ndv = abs(dot(normalize(vWN), V));
          float g = (0.25 + 1.6 * core * prisms * (0.4 + 0.6 * ndv)) * (1.0 + uFacing * 3.0) * uFlick;
          vec3 c = mix(vec3(1.0, 0.62, 0.30), vec3(1.0, 0.86, 0.62), core) * g * 3.2;
          gl_FragColor = vec4(c, 1.);
        }`,
    }));
    glass.position.y = GLASS_Y0 + GLASS_H / 2; scene.add(glass);
    const bars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.055, GLASS_H, 4), dark, 16);
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; mtx.makeTranslation(Math.cos(a) * 3.03, GLASS_Y0 + GLASS_H / 2, Math.sin(a) * 3.03); bars.setMatrixAt(i, mtx); }
    scene.add(bars);
    for (const yy of [GLASS_Y0 + GLASS_H * 0.5, GLASS_TOP]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.03, 0.05, 4, 48), dark); ring.rotation.x = Math.PI / 2; ring.position.y = yy; scene.add(ring);
    }
    const copper = new THREE.MeshStandardMaterial({ color: 0x3d7061, roughness: 0.35, metalness: 0.6, envMap: envTex, envMapIntensity: 1.2 });
    wetMats.push([copper, 1.2]);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.5, 2.4, 32), copper);
    roof.position.y = GLASS_TOP + 1.2; scene.add(roof);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), dark); ball.position.y = GLASS_TOP + 2.55; scene.add(ball);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.2, 6), dark); rod.position.y = GLASS_TOP + 3.6; scene.add(rod);
  }

  // ---- soft round texture for glows
  const glowTex = (() => {
    const [c, x] = canvas(128), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.2, "rgba(255,255,255,.45)"); g.addColorStop(0.5, "rgba(255,255,255,.1)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  // diffraction star of a camera lens looking at a bright point: three thin streaks at 60 degrees
  const starTex = (() => {
    const S = 512, [c, x] = canvas(S);
    x.globalCompositeOperation = "lighter";
    for (let k = 0; k < 3; k++) {
      x.save(); x.translate(S / 2, S / 2); x.rotate(k * Math.PI / 3 + 0.2); x.scale(1, 0.012);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, S / 2);
      g.addColorStop(0, "rgba(255,255,255,0.9)"); g.addColorStop(0.06, "rgba(255,255,255,0.3)"); g.addColorStop(0.3, "rgba(255,255,255,0.06)"); g.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, S / 2, 0, TAU); x.fill(); x.restore();
    }
    return new THREE.CanvasTexture(c);
  })();
  // spray puffs: four clumpy, irregular blobs in a 2x2 atlas
  const puffTex = (() => {
    const [c, x] = canvas(256);
    for (let cell = 0; cell < 4; cell++) {
      const ox = (cell & 1) * 128 + 64, oy = (cell >> 1) * 128 + 64;
      for (let i = 0; i < 34; i++) {
        const r = 6 + Math.random() * 24, a = Math.random() * TAU, dd = Math.pow(Math.random(), 0.7) * (54 - r);
        const cx = ox + Math.cos(a) * dd, cy = oy + Math.sin(a) * dd * 0.85;
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, r), al = 0.08 + Math.random() * 0.22;
        g.addColorStop(0, `rgba(255,255,255,${al})`); g.addColorStop(0.6, `rgba(255,255,255,${al * 0.4})`); g.addColorStop(1, "rgba(255,255,255,0)");
        x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      for (let i = 0; i < 40; i++) {                       // droplets flung off the edge
        const a = Math.random() * TAU, dd = 18 + Math.random() * 34, s = 0.6 + Math.random() * 1.6;
        x.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.4})`; x.beginPath(); x.arc(ox + Math.cos(a) * dd, oy + Math.sin(a) * dd, s, 0, TAU); x.fill();
      }
    }
    return new THREE.CanvasTexture(c);
  })();

  // lamp glow: a halo in the rain around the lantern, the hot core, and the lens star
  const sprite = (map, color, scale, extra = {}) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, ...extra }));
    s.position.set(0, LENS_Y, 0); s.scale.setScalar(scale); scene.add(s); return s;
  };
  const lampGlow = sprite(glowTex, new THREE.Color(0.8, 0.5, 0.25), 30);
  const lampCore = sprite(glowTex, new THREE.Color(2.2, 1.7, 1.1), 7, { depthTest: false });
  const lampStar = sprite(starTex, new THREE.Color(1.2, 0.95, 0.65), 40, { depthTest: false });
  lampCore.renderOrder = lampStar.renderOrder = 20;

  // ---- beam: two soft ribbons from the lens, always facing the camera, turning
  const BEAM_L = 330;
  const beamGeo = (() => {
    const S = 40, pos = [], aT = [], aS = [], idx = [];
    for (let i = 0; i <= S; i++) for (const sd of [-1, 1]) { pos.push(0, 0, 0); aT.push(Math.pow(i / S, 1.6)); aS.push(sd); }
    for (let i = 0; i < S; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aT", new THREE.Float32BufferAttribute(aT, 1));
    g.setAttribute("aS", new THREE.Float32BufferAttribute(aS, 1));
    g.setIndex(idx);
    return g;
  })();
  const makeBeamMat = () => new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uI: { value: 1 }, uDir: { value: new THREE.Vector3(1, 0, 0) }, uWind: { value: new THREE.Vector2() } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: `attribute float aT; attribute float aS; uniform vec3 uDir; varying float vT; varying float vS; varying vec3 vW;
      void main(){
        vec3 base = vec3(0., ${LENS_Y.toFixed(2)}, 0.) + uDir * (aT * ${BEAM_L.toFixed(1)});
        vec3 side = normalize(cross(uDir, cameraPosition - base));
        float w = 1.4 + aT * 26.;
        vec3 w3 = base + side * aS * w; vW = w3; vT = aT; vS = aS;
        gl_Position = projectionMatrix * viewMatrix * vec4(w3, 1.);
      }`,
    fragmentShader: `${GLSL_NOISE} uniform float uTime, uI; uniform vec2 uWind; varying float vT; varying float vS; varying vec3 vW;
      void main(){
        float cross_ = exp(-vS * vS * 4.0) * (0.75 + 0.25 * exp(-vS * vS * 30.0));
        float along = exp(-vT * 3.4) * smoothstep(0., 0.02, vT) + exp(-vT * 40.0) * 0.8;
        // the light is only seen where it hits rain and spindrift: billows of mist and slanting curtains of rain drift through it
        vec2 mp = vW.xz * .05 + vec2(uTime * .25, uTime * .1) + vW.y * .03;
        float mist = .35 + 1.15 * fbm(mp);
        float curtain = 0.8 + 0.4 * fbm3(vec2((vW.x - uWind.x) * 0.06 + vW.y * 0.03, (vW.z - uWind.y) * 0.06));
        vec3 c = vec3(1., .83, .56) * cross_ * along * mist * curtain * uI * .62;
        gl_FragColor = vec4(c, 1.);
      }`,
  });
  const arms = [makeBeamMat(), makeBeamMat()].map((m) => { const mesh = new THREE.Mesh(beamGeo, m); mesh.frustumCulled = false; mesh.renderOrder = 5; scene.add(mesh); return m; });

  // ---- ocean
  const OU = {
    ...U,
    uW: { value: WAVES.map((w) => new THREE.Vector4(w.dx, w.dz, w.a, w.k)) },
    uW2: { value: WAVES.map((w) => new THREE.Vector4(w.w, w.q, w.p, 0)) },
    uRock: { value: ROCKS.map(([x, z, R, , ph]) => new THREE.Vector4(x, z, R, ph)) },
    uBeamAngle: { value: 0 }, uBeam: { value: 1 }, uLantern: { value: new THREE.Vector3(0, LENS_Y, 0) }, uLampI: { value: 1 },
    uDeep: { value: new THREE.Color(0x03090c) }, uShallow: { value: new THREE.Color(0x0a1d21) }, uFoam: { value: new THREE.Color(0xc8d2d6) },
  };
  Object.assign(OU, THREE.UniformsUtils.merge([THREE.UniformsLib.fog]));
  const oceanGeo = (() => {
    const N = 260, L = 720, pos = new Float32Array((N + 1) * (N + 1) * 3), idx = [];
    const map = (t) => L * (0.1 * t + 0.9 * t * t * t);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const k = (j * (N + 1) + i) * 3; pos[k] = map(i / N * 2 - 1); pos[k + 2] = map(j / N * 2 - 1); }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + N + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
    return g;
  })();
  const oceanMat = new THREE.ShaderMaterial({
    uniforms: OU, fog: true,
    vertexShader: `
      #include <fog_pars_vertex>
      uniform float uTime; uniform vec4 uW[6]; uniform vec4 uW2[6];
      varying vec3 vW; varying vec3 vN; varying float vJ; varying float vH; varying float vTrail;
      void main(){
        vec3 p = position; vec3 d = vec3(0.); vec3 n = vec3(0.,1.,0.);
        float fade = 1.0 - smoothstep(260., 650., distance(p.xz, cameraPosition.xz));
        float trail = 0.;
        for(int i=0;i<6;i++){
          vec4 w = uW[i]; vec4 w2 = uW2[i];
          float ph = w.w * dot(w.xy, p.xz) - w2.x * uTime + w2.z;
          float c = cos(ph), s = sin(ph);
          d.x += w2.y * w.z * w.x * c; d.z += w2.y * w.z * w.y * c; d.y += w.z * s;
          n.x -= w.x * w.w * w.z * c; n.z -= w.y * w.w * w.z * c; n.y -= w2.y * w.w * w.z * s;
          // foam left behind a passing crest decays over the following part of the wave
          if (i < 3) { float age = mod(1.5708 - ph, 6.2831853); trail += w.z * exp(-age * 0.85) * smoothstep(0.0, 0.35, age); }
        }
        d *= fade; n = mix(vec3(0.,1.,0.), n, fade);
        vec3 wp = p + d; vW = wp; vN = n; vJ = n.y; vH = d.y; vTrail = trail * fade / 2.2;
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <fog_pars_fragment>
      ${GLSL_SKY}
      ${SHORE_GLSL}
      uniform float uBeam, uBeamAngle, uLampI;
      uniform vec3 uLantern, uDeep, uShallow, uFoam;
      varying vec3 vW; varying vec3 vN; varying float vJ; varying float vH; varying float vTrail;
      void main(){
        float sd = shoreDist(vW.xz);
        vec3 N = normalize(vN);
        float dist = length(cameraPosition - vW);
        // chop: wind-driven ripples on three scales (stretched across the wind), and rain roughening the surface close by
        vec2 q = vW.xz;
        vec3 c1 = vnoised(vec2(q.x * 0.22, q.y * 0.34) + vec2(uTime * 0.07, uTime * 0.02));
        vec3 c2 = vnoised(vec2(q.x * 0.7, q.y * 1.05) + vec2(-uTime * 0.13, uTime * 0.08));
        vec3 c3 = vnoised(q * 2.6 + vec2(uTime * 0.31, -uTime * 0.2));
        vec3 c4 = vnoised(q * 7.0 + vec2(-uTime * 0.6, uTime * 0.5));
        vec2 dn = c1.yz * vec2(0.22, 0.34) * 1.0 + c2.yz * vec2(0.7, 1.05) * 0.3 + c3.yz * 2.6 * 0.1;
        dn *= 1.0 - smoothstep(70., 330., dist);
        dn += c4.yz * 7.0 * 0.045 * (1.0 - smoothstep(25., 80., dist));
        vec3 N0 = N;
        N = normalize(N0 + vec3(dn.x, 0., dn.y));
        vec3 V = normalize(cameraPosition - vW);
        // the sky is reflected off a smoother normal (the chop blurs it), glints use the full one
        vec3 Nr = normalize(N0 + vec3(dn.x, 0., dn.y) * 0.6);
        float NdV = max(dot(Nr, V), 0.);
        float fres = 0.02 + 0.98 * pow(1. - NdV, 5.);
        vec3 R = reflect(-V, Nr); R.y = abs(R.y);
        vec3 sky = stormSky(R, 0.0);
        float depthT = clamp(vH * 0.3 + 0.45, 0., 1.);
        vec3 Lm = normalize(uMoonDir);
        float moonK = 0.2 + 0.8 * uMoonVis;
        float lit = 0.7 + moonK * 0.7 + max(dot(N, Lm), 0.) * moonK * 0.6;
        vec3 water = mix(uDeep, uShallow, depthT) * (lit + uFlash * 3.5);
        // moonlight through the thin tops of the swells (the moon is behind them)
        float sss = pow(max(dot(V, -Lm), 0.), 3.) * smoothstep(0.4, 1.6, vH) * moonK;
        water += vec3(0.012, 0.05, 0.048) * sss * (1.0 + uFlash * 2.0);
        vec3 col = mix(water, sky, fres * 0.85);
        // the moon's glitter: a sharp GGX sparkle plus a broader sheen
        vec3 Hm = normalize(Lm + V);
        float NdH = max(dot(N, Hm), 0.);
        float dd = NdH * NdH * (0.0006 - 1.) + 1.;
        float D = 0.0006 / (PI * dd * dd);
        float horizonK = smoothstep(0.0, 0.03, V.y) * (1.0 - smoothstep(120., 480., dist));
        col += vec3(0.60, 0.72, 1.0) * (D * 0.0012 + pow(NdH, 40.) * 0.06) * moonK * horizonK;
        // the lantern's own reflection: a broken warm column on the water under the light
        vec3 Ll = normalize(uLantern - vW); vec3 Hl = normalize(Ll + V);
        float NdHl = max(dot(N, Hl), 0.);
        float dl = NdHl * NdHl * (0.0008 - 1.) + 1.;
        col += vec3(1.0, 0.68, 0.36) * (0.0008 / (PI * dl * dl)) * 0.006 * uLampI * (0.2 + 0.8 * fres) * (1.0 - smoothstep(60., 300., dist));
        // lighthouse beam sweeping the sea
        vec3 toF = vW - uLantern; float hd = length(toF.xz); float ang = atan(toF.z, toF.x);
        float d1 = abs(mod(ang - uBeamAngle + PI, PI2) - PI);
        float d2 = abs(mod(ang - uBeamAngle, PI2) - PI);
        float bd = min(d1, d2); float bw = 0.05 + 3.0 / (hd + 4.);
        float beam = exp(-bd * bd / (bw * bw)) * uBeam;
        vec3 Lb = normalize(uLantern - vW); vec3 Hh = normalize(Lb + V);
        float spec = pow(max(dot(N, Hh), 0.), 90.);
        col += vec3(1., .92, .72) * beam * (0.04 + spec * 2.5) * 40. / (hd * 0.12 + 6.);
        // foam: fresh on breaking crests, trailing behind them as it decays, streaked downwind, piled around and in the lee of the rocks
        vec2 fp = vW.xz + vec2(uTime * 1.1, uTime * 0.3);
        float lace = fbm(fp * 0.32);
        float web = 1.0 - abs(2.0 * fbm(fp * 0.85 + lace * 1.6) - 1.0);
        float pat = web * 0.7 + lace * 0.45;
        float zone = smoothstep(0.35, 0.75, fbm3(vW.xz * 0.018 + vec2(-uTime * 0.04, uTime * 0.01)));
        float crest = smoothstep(0.66, 0.22, vJ) * smoothstep(0.1, 1.2, vH) * (0.4 + 0.8 * zone);
        float trail = vTrail * (0.15 + 0.85 * zone);
        float streaks = smoothstep(0.6, 0.8, fbm3(vec2(fp.x * 0.03, fp.y * 0.7))) * 0.5;
        float surge = pow(0.5 + 0.5 * sin(uTime * 0.9 + dot(vW.xz, vec2(0.08, 0.05))), 2.0);
        float shore = exp(-pow((sd - vH * 0.6 + 0.6) / 2.8, 2.)) * (0.6 + 0.9 * surge);
        float wash = exp(-max(sd, 0.) / 10.) * (0.35 + 0.65 * surge) * smoothstep(-2., 1., sd);
        float lee = exp(-max(shoreDist(vW.xz - vec2(10., 2.5)), 0.) / 8.) * (1.0 - smoothstep(-2., 4., -sd));
        float cover = crest * 1.25 + trail * 0.8 + shore * 1.3 + wash * 0.75 + lee * 0.5 + streaks;
        float foamAmt = smoothstep(1.1 - cover, 1.55 - cover, pat);
        // bubbles and holes in the mat, fading out with distance before they can shimmer
        float holes = fbm3(fp * 2.4 + lace * 2.0);
        foamAmt *= mix(1.0, smoothstep(0.25, 0.65, holes + foamAmt * 0.35), 1.0 - smoothstep(40., 140., dist));
        foamAmt = mix(foamAmt, clamp(cover * 0.55, 0., 0.8), smoothstep(160., 420., dist));     // far away the lace averages out
        foamAmt = clamp(foamAmt * (0.5 + 0.5 * smoothstep(0.0, 0.6, cover)), 0., 1.);
        float foamShade = 0.6 + 0.4 * clamp(dot(N, normalize(vec3(-Lm.x, 0.8, -Lm.z) + V * 0.4)), 0., 1.);
        vec3 foamCol = uFoam * (0.14 + moonK * 0.22 + uFlash * 4.0 + sss * 0.25) * foamShade * vec3(0.84, 0.92, 1.0)
                     + vec3(1., .93, .75) * beam * 0.5 * 30. / (hd * 0.12 + 6.)
                     + vec3(1.0, 0.7, 0.4) * 0.05 * uLampI * exp(-hd * 0.04);
        col = mix(col, foamCol, foamAmt);
        gl_FragColor = vec4(col, 1.);
        #ifdef USE_FOG
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
        #endif
      }`,
  });
  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.frustumCulled = false; ocean.renderOrder = 1;
  scene.add(ocean);

  // ---- rain: camera-facing quads stretched along their fall. A wide far layer, and a sparse layer of big, out-of-focus drops near the lens.
  const rainU = { uTime: U.uTime, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2(10, 3) }, uDrift: { value: new THREE.Vector2() }, uFlash: U.uFlash, uBeamAngle: OU.uBeamAngle, uLantern: OU.uLantern };
  const f1 = (v) => v.toFixed(3);
  const makeRain = (N, box, offZ, len, wMin, wK, fade, alpha, bright) => {
    const pos = new Float32Array(N * 12), end = new Float32Array(N * 4), side = new Float32Array(N * 4), idx = new Uint32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const x = Math.random(), y = Math.random(), z = Math.random();
      for (let k = 0; k < 4; k++) { const j = i * 4 + k; pos[j * 3] = x; pos[j * 3 + 1] = y; pos[j * 3 + 2] = z; end[j] = k >> 1; side[j] = (k & 1) ? 1 : -1; }
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aEnd", new THREE.BufferAttribute(end, 1));
    g.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: rainU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `
        attribute float aEnd; attribute float aSide; uniform float uTime, uBeamAngle; uniform vec3 uCam, uLantern; uniform vec2 uWind, uDrift;
        varying float vA; varying float vNear; varying float vAlong; varying float vS; varying float vBeam; varying float vLamp;
        void main(){
          vec3 uBox = vec3(${f1(box[0])}, ${f1(box[1])}, ${f1(box[2])});
          float sp = 0.85 + 0.3 * fract(position.x * 91.7 + position.z * 13.3);
          vec3 vel = vec3(uWind.x, -19.0, uWind.y) * sp;
          // fall speed is constant; sideways drift is integrated on the CPU so a gust bends the streaks instead of teleporting every drop
          vec3 p = position * uBox + vec3(uDrift.x * sp, -19.0 * sp * uTime, uDrift.y * sp);
          vec3 c = uCam + vec3(0., 0., ${f1(offZ)});
          p = mod(p - c + uBox * 0.5, uBox) + c - uBox * 0.5;
          vec3 dir = normalize(vel);
          float len = ${f1(len[0])} + ${f1(len[1])} * sp;
          vec3 tail = p - dir * len;
          float d = length(p - uCam);
          vNear = exp(-d * 0.05);
          vA = (1.0 - smoothstep(${f1(fade[2])}, ${f1(fade[3])}, d)) * smoothstep(${f1(fade[0])}, ${f1(fade[1])}, d) * step(0.5, p.y + 8.);
          vec3 tv = p - uLantern; float hd = length(tv.xz); float ang = atan(tv.z, tv.x);
          float d1 = abs(mod(ang - uBeamAngle + 3.14159265, 6.2831853) - 3.14159265);
          float d2 = abs(mod(ang - uBeamAngle, 6.2831853) - 3.14159265);
          float bd = min(d1, d2); float bw = 0.05 + 6.0 / (hd + 8.);
          float bwy = 1.4 + hd * 0.08;
          vBeam = exp(-bd * bd / (bw * bw)) * exp(-hd * 0.006) * exp(-pow((p.y - uLantern.y - hd * 0.012) / bwy, 2.));
          vLamp = 40.0 / (dot(tv, tv) + 40.0);
          vec4 mvh = viewMatrix * vec4(p, 1.0), mvt = viewMatrix * vec4(tail, 1.0);
          vec3 axis = normalize(mvt.xyz - mvh.xyz);
          vec3 sideV = normalize(cross(axis, normalize(mvh.xyz)));
          float w = max(${f1(wMin)}, d * ${wK.toFixed(5)});
          vec4 mv = mix(mvh, mvt, aEnd);
          mv.xyz += sideV * aSide * w * 0.5;
          vAlong = aEnd; vS = aSide;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform float uFlash; varying float vA; varying float vNear; varying float vAlong; varying float vS; varying float vBeam; varying float vLamp;
        void main(){ if (vA < 0.01) discard;
          float soft = 1.0 - vS * vS, taper = (1.0 - vAlong) * (0.4 + 0.6 * smoothstep(0.0, 0.25, vAlong + 0.1));
          vec3 c = vec3(0.60, 0.68, 0.80) * (${f1(bright)} + uFlash * 0.9) + vec3(1., .78, .48) * (vBeam * 1.1 + vLamp * 0.6);
          gl_FragColor = vec4(c, vA * (${f1(alpha)} + vNear * ${f1(alpha)} + vBeam * 0.4) * soft * taper); }`,
    });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 8;
    scene.add(mesh);
    return mesh;
  };
  makeRain(36000, [170, 80, 170], -55, [0.7, 0.6], 0.012, 0.0014, [1.5, 6, 60, 175], 0.13, 0.17);
  makeRain(2600, [34, 22, 34], -13, [1.3, 0.9], 0.02, 0.0045, [1.6, 4.5, 11, 17], 0.03, 0.2);

  // ---- spray: clumpy white water thrown up where swells hit the rocks, and a slow mist layer that rolls off it downwind
  const makeParticles = (N, alpha, grow, order) => {
    const S = { N, pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N), size: new Float32Array(N), next: 0 };
    const lifeA = new THREE.BufferAttribute(new Float32Array(N), 1), posA = new THREE.BufferAttribute(S.pos, 3), sizeA = new THREE.BufferAttribute(S.size, 1);
    const seed = new Float32Array(N); for (let i = 0; i < N; i++) seed[i] = Math.random();
    lifeA.setUsage(THREE.DynamicDrawUsage); posA.setUsage(THREE.DynamicDrawUsage); sizeA.setUsage(THREE.DynamicDrawUsage);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", posA); g.setAttribute("aLife", lifeA); g.setAttribute("aSize", sizeA); g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const u = { uTex: { value: puffTex }, uFlash: U.uFlash, uScale: { value: 600 }, uMoonDir: U.uMoonDir, uLantern: OU.uLantern, uLampI: OU.uLampI };
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, fog: false,
      vertexShader: `attribute float aLife; attribute float aSize; attribute float aSeed; uniform float uScale; uniform vec3 uMoonDir, uLantern;
        varying float vL; varying float vD; varying float vSeed; varying float vBack; varying float vLamp;
        void main(){ vL = aLife; vSeed = aSeed; vec4 mv = modelViewMatrix * vec4(position, 1.); vD = -mv.z;
          vBack = pow(max(dot(normalize(position - cameraPosition), normalize(uMoonDir)), 0.), 6.);
          vec3 tl = position - uLantern; vLamp = 300.0 / (dot(tl, tl) + 300.0);
          gl_PointSize = aLife <= 0.0 ? 0.0 : aSize * (1.0 + (1.0 - aLife) * ${grow.toFixed(2)}) * uScale / max(-mv.z, 0.5);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uTex; uniform float uFlash, uLampI; varying float vL; varying float vD; varying float vSeed; varying float vBack; varying float vLamp;
        void main(){
          float a0 = vSeed * 6.2831853 + (1.0 - vL) * (fract(vSeed * 7.3) - 0.5) * 2.0;
          vec2 pc = gl_PointCoord - 0.5; float cs = cos(a0), sn = sin(a0); pc = mat2(cs, -sn, sn, cs) * pc + 0.5;
          if (pc.x < 0. || pc.y < 0. || pc.x > 1. || pc.y > 1.) discard;
          float cell = floor(fract(vSeed * 13.7) * 4.0);
          vec2 uv = (pc + vec2(mod(cell, 2.0), floor(cell * 0.5))) * 0.5;
          float a = texture2D(uTex, uv).a * min(1.0, vL * 2.5) * vL * ${alpha.toFixed(3)} * exp(-vD * 0.003);
          vec3 c = vec3(0.16, 0.18, 0.20) * (1.0 + vBack * 1.6 + uFlash * 9.0) + vec3(1.0, 0.68, 0.38) * vLamp * 0.25 * uLampI;
          gl_FragColor = vec4(c, a); }`,
    }));
    pts.frustumCulled = false; pts.renderOrder = order; scene.add(pts);
    S.update = (dt, wx, drag, grav, buoy) => {
      const L = lifeA.array;
      for (let k = 0; k < N; k++) {
        if (S.life[k] <= 0) { L[k] = 0; continue; }
        S.life[k] -= dt; const j = k * 3;
        S.vel[j] += (wx - S.vel[j]) * drag * dt; S.vel[j + 2] += (1.5 - S.vel[j + 2]) * drag * dt;
        S.vel[j + 1] += (buoy - grav) * dt; S.vel[j + 1] *= 1 - drag * 0.75 * dt;
        S.pos[j] += S.vel[j] * dt; S.pos[j + 1] += S.vel[j + 1] * dt; S.pos[j + 2] += S.vel[j + 2] * dt;
        L[k] = Math.max(0, S.life[k] / S.max[k]);
      }
      posA.needsUpdate = true; lifeA.needsUpdate = true; sizeA.needsUpdate = true;
    };
    S.u = u;
    return S;
  };
  const SP = makeParticles(9000, 0.85, 2.0, 7);
  const MI = makeParticles(1800, 0.2, 2.6, 6);
  const burst = (x, y, z, n, power, nx, nz) => {
    for (let i = 0; i < n; i++) {
      const k = SP.next; SP.next = (SP.next + 1) % SP.N;
      SP.pos[k * 3] = x + (Math.random() - 0.5) * 3; SP.pos[k * 3 + 1] = y + Math.random() * 0.6; SP.pos[k * 3 + 2] = z + (Math.random() - 0.5) * 3;
      // most of the water goes up in a sheet against the rock face, a little is flung out toward the sea
      const up = power * Math.pow(Math.random(), 0.6) * 1.15;
      SP.vel[k * 3] = -nx * power * 0.22 * Math.random() + (Math.random() - 0.5) * 5 + 2.5;
      SP.vel[k * 3 + 1] = up;
      SP.vel[k * 3 + 2] = -nz * power * 0.22 * Math.random() + (Math.random() - 0.5) * 5 + 1;
      SP.max[k] = 1.6 + Math.random() * 2.2; SP.life[k] = SP.max[k]; SP.size[k] = 1.0 + Math.random() * 3.2;
    }
    const nm = Math.ceil(n * 0.12);
    for (let i = 0; i < nm; i++) {
      const k = MI.next; MI.next = (MI.next + 1) % MI.N;
      MI.pos[k * 3] = x + (Math.random() - 0.5) * 5; MI.pos[k * 3 + 1] = y + Math.random() * power * 0.35; MI.pos[k * 3 + 2] = z + (Math.random() - 0.5) * 5;
      MI.vel[k * 3] = 2 + Math.random() * 3; MI.vel[k * 3 + 1] = Math.random() * power * 0.45; MI.vel[k * 3 + 2] = (Math.random() - 0.5) * 2;
      MI.max[k] = 3.5 + Math.random() * 3.5; MI.life[k] = MI.max[k]; MI.size[k] = 5 + Math.random() * 7;
    }
  };
  // points on the shoreline of every rock, with how exposed they are to the swell (which runs toward +x)
  const shore = [];
  for (const [rx, rz, R, , ph] of ROCKS) {
    const nPts = R > 10 ? 72 : 14;
    for (let i = 0; i < nPts; i++) {
      const th = i / nPts * TAU, Rt = shoreR(R, th, ph) * 0.97, nx = Math.cos(th), nz = Math.sin(th);
      shore.push({ x: rx + nx * Rt, z: rz + nz * Rt, nx, nz, exposure: Math.max(0.15, -(nx * 0.97 + nz * 0.24)), prev: 0, cool: Math.random() * 3 });
    }
  }
  let shoreIdx = 0, nextBig = 4;
  const exposed = shore.filter((p) => p.exposure > 0.75);

  // ---- lightning: a main channel with forks, hot white in HDR so it blooms
  let seq = null, seqT = 0, nextStrike = reduced ? 1e9 : 3.5;
  const boltGroup = new THREE.Group(); boltGroup.visible = false; scene.add(boltGroup);
  // the channel fades up into the cloud base; the glow sheath is soft at its edges
  const boltU = { uI: { value: 1 }, uGlow: { value: 1 } };
  const boltShader = (core) => new THREE.ShaderMaterial({
    uniforms: boltU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: "varying vec3 vN; varying float vY; void main(){ vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position, 1.); vY = w.y; vec4 mv = viewMatrix * w; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }",
    fragmentShader: core
      ? "uniform float uI; varying vec3 vN; varying float vY; void main(){ float k = smoothstep(195.0, 150.0, vY); gl_FragColor = vec4(vec3(12., 13., 19.) * uI * k, 1.); }"
      : "uniform float uGlow; varying vec3 vN; varying float vY; void main(){ float k = smoothstep(200.0, 140.0, vY); float e = pow(abs(normalize(vN).z), 2.5); gl_FragColor = vec4(vec3(0.45, 0.5, 0.85) * e * uGlow * k, 1.); }",
  });
  const boltMat = boltShader(true), boltGlow = boltShader(false);
  const addTube = (pts, r, glow = 0) => {
    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.1);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 2, r, 4), boltMat);
    m.frustumCulled = false; boltGroup.add(m);
    if (glow) { const gm = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length, glow, 6), boltGlow); gm.frustumCulled = false; boltGroup.add(gm); }
  };
  // a jagged path, then one pass of midpoint displacement for the fine kinks
  const jag = (start, dir, len, n, jit) => {
    const pts = [start.clone()], p = start.clone();
    for (let i = 1; i <= n; i++) { p.addScaledVector(dir, len / n); pts.push(new THREE.Vector3(p.x + (Math.random() - 0.5) * jit, p.y + (Math.random() - 0.5) * jit * 0.3, p.z + (Math.random() - 0.5) * jit)); }
    const fine = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const m = pts[i - 1].clone().lerp(pts[i], 0.5), s = jit * 0.28;
      m.x += (Math.random() - 0.5) * s; m.z += (Math.random() - 0.5) * s; m.y += (Math.random() - 0.5) * s * 0.3;
      fine.push(m, pts[i]);
    }
    return fine;
  };
  const makeBolt = (az, dist) => {
    for (const m of boltGroup.children) m.geometry.dispose();
    boltGroup.clear();
    const top = new THREE.Vector3(Math.cos(az) * dist, 190, Math.sin(az) * dist);
    const dir = new THREE.Vector3((Math.random() - 0.5) * 60, -190, (Math.random() - 0.5) * 60);
    const n = 26, main = jag(top, dir.clone().normalize(), dir.length(), n, 22);
    addTube(main, 0.8, 6);
    const nb = 3 + Math.floor(Math.random() * 4);
    for (let b = 0; b < nb; b++) {
      const i = 2 + Math.floor(Math.random() * n * 0.6), d = new THREE.Vector3((Math.random() - 0.5) * 2, -0.9 - Math.random() * 0.8, (Math.random() - 0.5) * 2).normalize();
      const br = jag(main[i * 2], d, 25 + Math.random() * 70, 9, 10);
      addTube(br, 0.42, 2.2);
      if (Math.random() < 0.6) { const j = 4 + Math.floor(Math.random() * 10); addTube(jag(br[j], new THREE.Vector3((Math.random() - 0.5) * 2, -1, (Math.random() - 0.5) * 2).normalize(), 15 + Math.random() * 30, 6, 7), 0.25); }
    }
  };
  const strike = () => {
    const az = Math.PI * (1.12 + Math.random() * 0.76), dist = 300 + Math.random() * 260;   // somewhere in front of the camera
    U.uFlashDir.value.set(Math.cos(az), 0.35 + Math.random() * 0.3, Math.sin(az)).normalize();
    flashLight.position.copy(U.uFlashDir.value).multiplyScalar(120).add(new THREE.Vector3(0, 12, 0));
    const big = Math.random() < 0.6;
    if (big) makeBolt(az, dist); else boltGroup.visible = false;
    const k = big ? 1 : 0.5;
    seq = [[0, k], [0.06, 0.15 * k], [0.11, 0.9 * k], [0.19, 0.05], [0.3, 0.55 * k], [0.45, 0.08], [0.7, 0]];
    seqT = 0;
    seq.big = big;
  };

  // ---- sizing, input, loop
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener("pointermove", (e) => { mouse.tx = (e.clientX / innerWidth - 0.5) * 2; mouse.ty = -(e.clientY / innerHeight - 0.5) * 2; }, { passive: true });
  const resize = () => {
    const w = canvasEl.clientWidth || innerWidth, h = canvasEl.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // narrow screens: wider lens and the tower moved toward the middle
    camera.fov = camera.aspect < 1 ? 62 : 46;
    target.x = camera.aspect < 1 ? -6 : -18;
    camera.updateProjectionMatrix();
    const sc = renderer.domElement.height * 0.5 * Math.tan(THREE.MathUtils.degToRad(23)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));   // same apparent size at either lens
    SP.u.uScale.value = sc; MI.u.uScale.value = sc;
    post.setSize();
  };
  addEventListener("resize", resize); resize();

  let last = performance.now(), raf = 0, visible = true, slow = 0, tNow = reduced ? 21 : 0;
  const BEAM_SPEED = 0.55;
  function frame(dt) {
    tNow += dt;
    const t = tNow;
    U.uTime.value = t;
    mouse.x += (mouse.tx - mouse.x) * 0.04; mouse.y += (mouse.ty - mouse.y) * 0.04;
    // the camera rides gently, as if from a boat or a headland in the wind
    camera.position.set(camBase.x + mouse.x * 7 + Math.sin(t * 0.21) * 1.2, camBase.y + mouse.y * 1.5 + Math.sin(t * 0.37) * 0.35 + Math.sin(t * 0.9) * 0.08, camBase.z);
    camera.lookAt(target.x + mouse.x * 2, target.y + mouse.y * 0.8 + Math.sin(t * 0.33) * 0.25, target.z);
    sky.position.copy(camera.position);

    // lightning
    nextStrike -= dt;
    if (nextStrike <= 0) { strike(); nextStrike = 7 + Math.random() * 12; }
    let f = 0;
    if (seq) {
      seqT += dt;
      for (let i = 0; i < seq.length - 1; i++) if (seqT >= seq[i][0] && seqT < seq[i + 1][0]) {
        const u = (seqT - seq[i][0]) / (seq[i + 1][0] - seq[i][0]);
        f = seq[i][1] + (seq[i + 1][1] - seq[i][1]) * (seq[i + 1][1] > seq[i][1] ? u * u : Math.sqrt(u));
      }
      if (seqT > seq[seq.length - 1][0]) { seq = null; boltGroup.visible = false; }
      else if (seq.big) { boltGroup.visible = f > 0.06; boltU.uI.value = Math.min(1, 0.25 + f); boltU.uGlow.value = f; }   // the channel glows on between the return strokes
    }
    U.uFlash.value = f;
    flashLight.intensity = f * 4.5;
    scene.fog.color.copy(fogBase).lerp(fogFlash, f * 0.4);
    skyMat.uniforms.uFog.value.copy(scene.fog.color);
    scene.background.copy(scene.fog.color);
    U.uMoonVis.value = clamp(0.5 + 0.45 * Math.sin(t * 0.07 + 0.5), 0, 1);
    for (const [m, k] of wetMats) m.envMapIntensity = k * (1 + f * 7);

    // beam
    const ang = t * BEAM_SPEED;
    arms[0].uniforms.uDir.value.set(Math.cos(ang), 0.012, Math.sin(ang));
    arms[1].uniforms.uDir.value.set(-Math.cos(ang), 0.012, -Math.sin(ang));
    OU.uBeamAngle.value = ang;
    const toCam = Math.atan2(camera.position.z, camera.position.x);
    const facing = Math.pow(Math.max(Math.cos(ang - toCam), Math.cos(ang + Math.PI - toCam)), 6);
    const flick = 0.94 + 0.06 * Math.sin(t * 13) * Math.sin(t * 7.3);
    lampGlow.material.opacity = 0.22 + 0.38 * facing; lampGlow.scale.setScalar(16 + facing * 34);
    lampCore.scale.setScalar(5 + facing * 12);
    lampStar.material.opacity = 0.08 + 0.55 * facing; lampStar.scale.setScalar(12 + facing * 42);
    lampLight.intensity = 6 + facing * 6;
    glassU.uFacing.value = facing; glassU.uFlick.value = flick;
    OU.uLampI.value = 1 + facing * 2.5;
    lampMats.forEach((m, i) => m.color.setRGB(2.2 * flick, 1.3 * flick, 0.55 * flick * (0.9 + 0.1 * Math.sin(t * 0.7 + i))));
    hemi.intensity = 1.5 + f * 2.4;

    // rain
    rainU.uCam.value.copy(camera.position);
    const gust = clamp(0.55 + 0.25 * Math.sin(t * 0.21) * Math.sin(t * 0.53 + 1.3) + 0.2 * Math.sin(t * 1.7) * Math.sin(t * 0.31), 0, 1);
    rainU.uWind.value.set(8 + gust * 5, 2 + gust * 2);
    rainU.uDrift.value.x += rainU.uWind.value.x * dt; rainU.uDrift.value.y += rainU.uWind.value.y * dt;
    arms[0].uniforms.uWind.value.copy(rainU.uDrift.value); arms[1].uniforms.uWind.value.copy(rainU.uDrift.value);

    // spray where waves hit the rocks
    for (let n = 0; n < 70; n++) {
      const p = shore[shoreIdx]; shoreIdx = (shoreIdx + 1) % shore.length;
      const h = waveHeight(p.x, p.z, t);
      if (p.prev < 0.35 && h >= 0.35 && t > p.cool) {
        const power = (9 + h * 6) * (0.5 + p.exposure);
        burst(p.x, h, p.z, Math.floor((40 + 130 * p.exposure) * (0.6 + h * 0.4)), power, p.nx, p.nz);
        p.cool = t + 2 + Math.random() * 2.5;
      }
      p.prev = h;
    }
    nextBig -= dt;
    if (nextBig <= 0) {                           // a big swell slams into the windward rocks
      const p = exposed[Math.floor(Math.random() * exposed.length)];
      burst(p.x, waveHeight(p.x, p.z, t) + 0.5, p.z, 750, 19 + Math.random() * 6, p.nx, p.nz);
      nextBig = 5 + Math.random() * 6;
    }
    const wx = 3 + gust * 5;
    SP.update(dt, wx, 0.8, 9.0, 0);
    MI.update(dt, wx * 0.9, 0.6, 0.6, 0.9);

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
  if (reduced) { frame(0.016); } else raf = requestAnimationFrame((n) => { last = n; loop(n); });
  return { renderer, frame, scene, camera, U, strike };
}
