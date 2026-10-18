// Scene: a megacity that grew its own shade. Late afternoon in a hot century: the asphalt has been broken up,
// and the city is overgrown on purpose. Trees crown every setback and roof, vines hang down the facades, and the
// old eight-lane avenue is a forest with a canal down the middle. The frame holds still like a photograph;
// what moves is small and has to be found: gusts rolling over the canopy, a flock of swifts, storks circling in a
// thermal, gondolas crossing the avenue, seeds drifting in the sun, cloud shadows, heat shimmer on the horizon.
// Everything is procedural and seeded, so the composition is the same on every load. Only dependency: three.js.

import * as THREE from "three";
import { makePost } from "./post.js";

const TAU = Math.PI * 2;
const h1 = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const vn2 = (x, z) => { const i = Math.floor(x), j = Math.floor(z), f = x - i, g = z - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g), h = (a, b) => h1(a * 57.3 + b * 113.1);
  return h(i, j) * (1 - u) * (1 - v) + h(i + 1, j) * u * (1 - v) + h(i, j + 1) * (1 - u) * v + h(i + 1, j + 1) * u * v; };
const vnoise = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return h1(i) + (h1(i + 1) - h1(i)) * u; };
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- layout (metres; the avenue runs along -z)
const AVE = 44, PITCH = 92, BLOCK = 74;
const CAM = new THREE.Vector3(-6, 56, 78), LOOK = new THREE.Vector3(4, 36, -300);
// the river that replaced the avenue's lanes: it meanders inside the avenue and changes width as it goes
const riverX = (z) => 9 * Math.sin(z * 0.011 + 0.6) + 5 * Math.sin(z * 0.027 + 2.1) + 2 * Math.sin(z * 0.06);
const riverW = (z) => 9 + 2.5 * Math.sin(z * 0.017 + 1) + 1.5 * Math.sin(z * 0.043 + 0.4);
const GLSL_RIVER = /* glsl */`
float riverX(float z){ return 9. * sin(z * 0.011 + 0.6) + 5. * sin(z * 0.027 + 2.1) + 2. * sin(z * 0.06); }
float riverW(float z){ return 9. + 2.5 * sin(z * 0.017 + 1.) + 1.5 * sin(z * 0.043 + 0.4); }
`;
const WATER_Y = -0.6;
const STREET = { x: riverX(CAM.z), y: 3.2, ly: 66 };            // the low end of the mouse drop: over the river, looking up
const SUN_DIR = new THREE.Vector3(0.17, 0.2, -0.96).normalize();     // low, ahead: the avenue runs into the sun
const WIND = new THREE.Vector2(0.75, 0.66).normalize();       // blowing from the sun side toward the camera's right
const CABLE_Z = -150, CABLE_Y = 104;
const ARCOLOGY = { x: 24, z: -1150, w: 270, d: 210, h: 440 };
// the highway: an elevated viaduct along x through the first cross street (the gap between two block rows), two lanes
// each way, riding an arch bridge where it crosses the river
const HWY = { z: -46, y: 20, hw: 8.2, x0: -430, x1: 430 };
const halfW = (z) => 70 + Math.max(0, CAM.z - z) * 1.2;       // wedge of the city that can ever be in frame

// ---------------------------------------------------------------- GLSL shared by every material
const GLSL_COMMON = /* glsl */`
uniform float uTime, uFogA, uFogH, uCloud, uGustK, uGustF;
uniform vec3 uSunDir, uSunCol;
uniform vec2 uWind;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
  return mix(mix(mix(hash13(i), hash13(i+vec3(1,0,0)), f.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y), f.z); }
const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);
float fbm(vec2 p){ float s = 0., a = .5; for(int i=0;i<5;i++){ s += a*vnoise(p); p = ROT * p * 2.03 + vec2(1.7, 9.2); a *= .5; } return s; }
float fbm3(vec2 p){ float s = 0., a = .5; for(int i=0;i<3;i++){ s += a*vnoise(p); p = ROT * p * 2.03 + vec2(1.7, 9.2); a *= .5; } return s / .875; }

// heat haze: a pale, warm veil that brightens toward the sun (forward scattering)
vec3 halo(vec3 rd){ float s = max(dot(rd, uSunDir), 0.); return uSunCol * (pow(s, 3.) * 0.03 + pow(s, 16.) * 0.11 + pow(s, 120.) * 0.4 + pow(s, 2000.) * 1.6); }
vec3 hazeCol(vec3 rd){ return vec3(0.30, 0.32, 0.34) + halo(rd); }
// exponential height fog, integrated along the view ray
vec3 applyHaze(vec3 col, vec3 wp){
  vec3 rd = wp - cameraPosition; float d = length(rd); rd /= d;
  float k = rd.y * d / uFogH;
  float fh = uFogA * exp(-cameraPosition.y / uFogH) * d * (abs(k) > 1e-3 ? (1. - exp(-k)) / k : 1. - .5 * k);
  return mix(col, hazeCol(rd), 1. - exp(-fh));
}
// slow cloud shadows drifting over the city
float cloudShade(vec3 wp){
  float c = fbm3(wp.xz * 0.0021 + vec2(uTime * 0.0085, uTime * 0.0042) + vec2(3.1, 7.7));
  return 1. - uCloud * smoothstep(0.56, 0.72, c);
}
`;

const GLSL_SKY = /* glsl */`
vec3 skyCol(vec3 d, float full){
  float h = d.y;
  vec3 zen = vec3(0.06, 0.12, 0.24);
  vec3 col = mix(vec3(0.30, 0.32, 0.34), zen, pow(smoothstep(-0.01, 0.5, h), 0.6));
  col += halo(d);
  float s = max(dot(d, uSunDir), 0.);
  col += uSunCol * smoothstep(0.99988, 0.99993, s) * 9.;                  // the disc, softened by the haze
  if (full > 0.5 && h > 0.0) {
    vec2 uv = d.xz / (h + 0.06);
    vec2 drift = vec2(uTime * 0.0016, uTime * 0.0007);
    // far cumulus banked on the horizon, backlit toward the sun
    float n = fbm(uv * 0.55 + drift);
    float cu = smoothstep(0.58, 0.78, n) * smoothstep(0.0, 0.05, h) * (1. - smoothstep(0.12, 0.32, h));
    float lit = pow(s, 6.);
    vec3 cuCol = mix(vec3(0.50, 0.51, 0.52), vec3(1.15, 1.0, 0.82), clamp(lit * 1.6 + (n - 0.6) * 1.5, 0., 1.));
    col = mix(col, cuCol, cu * 0.55);
    // thin, fast cirrus high up
    float ci = vnoise(vec2(uv.x * 0.25 + uv.y * 0.12, uv.y * 2.2) + drift * 3.) * fbm3(uv * 0.8 - drift * 2.);
    col += vec3(0.20, 0.20, 0.19) * smoothstep(0.32, 0.6, ci) * smoothstep(0.06, 0.3, h) * (0.5 + lit * 2.);
  }
  return col;
}
`;

// ---------------------------------------------------------------- patching three's standard material
// Every lit surface is a MeshStandardMaterial (so it gets the sun's shadow map) with extra GLSL spliced in:
// world-space varyings, optional vertex wind, a custom colour/normal stage, cloud shadow on the sun,
// translucency after lighting, and height fog in place of three's fog.
const SU = {
  uTime: { value: 0 }, uSunDir: { value: SUN_DIR.clone() }, uSunCol: { value: new THREE.Vector3(6.6, 4.4, 2.5) },
  uWind: { value: WIND.clone() }, uFogA: { value: 0.0007 }, uFogH: { value: 320 }, uCloud: { value: 0.42 },
  uGustK: { value: 0 }, uGustF: { value: -1e4 },        // a called-up gust: strength, and where its front is along the wind
};
const LIGHTS_BEGIN = (() => {
  const c = THREE.ShaderChunk.lights_fragment_begin, i = c.indexOf("#if ( NUM_DIR_LIGHTS > 0 )");
  const dir = c.slice(i).replace("RE_Direct( directLight", "directLight.color *= cloudShade(vW);\n\t\tsunLit = directLight.color;\n\t\tRE_Direct( directLight");
  return "vec3 sunLit = vec3(0.);\n" + c.slice(0, i) + dir;
})();
function patch(mat, key, { vert = "", wind = "", frag = "", color = "", normal = "", after = "", uniforms = {}, strip = [] } = {}) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, SU, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\n${GLSL_COMMON}\nvarying vec3 vW, vWN;\n${vert}`)
      .replace("#include <project_vertex>", `
        vec4 wPos = vec4(transformed, 1.0);
        vec3 wN = objectNormal;
        #ifdef USE_INSTANCING
          wPos = instanceMatrix * wPos; wN = mat3(instanceMatrix) * wN;
        #endif
        wPos = modelMatrix * wPos;
        vWN = normalize(mat3(modelMatrix) * wN);
        ${wind}
        vW = wPos.xyz;
        vec4 mvPosition = viewMatrix * wPos;
        gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\n${GLSL_COMMON}\nvarying vec3 vW, vWN;\n${frag}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\nfloat rough = roughness, metal = metalness; vec3 emis = vec3(0.); vec3 V = normalize(cameraPosition - vW);\n${color}`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = rough;")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = metal;")
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n{ vec3 nW = normalize((vec4(normal, 0.) * viewMatrix).xyz);\n${normal}\nnormal = normalize((viewMatrix * vec4(nW, 0.)).xyz); }`)
      .replace("#include <lights_fragment_begin>", LIGHTS_BEGIN)
      .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>\nfloat sunVis = 0.;\n#if NUM_DIR_LIGHTS > 0\nsunVis = dot(sunLit, vec3(1.)) / max(dot(directionalLights[0].color, vec3(1.)), 1e-4);\n#endif\ntotalEmissiveRadiance += emis;\n${after}`)
      .replace("#include <fog_fragment>", "gl_FragColor.rgb = applyHaze(gl_FragColor.rgb, vW);");
    for (const c of strip) sh.fragmentShader = sh.fragmentShader.replace(`#include <${c}>`, "");
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

// fake sky reflection for glass and water (the sky has no env map)
const GLSL_REFL = /* glsl */`
vec3 skyRefl(vec3 r){ float h = max(r.y, 0.); return mix(vec3(0.30, 0.32, 0.34), vec3(0.06, 0.12, 0.24), pow(smoothstep(0., 0.7, h), 0.55)) + halo(r) * 0.6; }
`;

// ---------------------------------------------------------------- facades: windows, grime, vines, planters, moss
const BUILDING = {
  vert: "attribute vec4 aB; varying vec4 vB;",
  wind: "vB = aB;",
  frag: `varying vec4 vB; float gMask; vec2 leafGrad, lTN; vec3 inner; float innerK;
uniform sampler2D uLeafTex;
${GLSL_REFL}
float rect(vec2 f, vec2 a, vec2 b, vec2 w){ vec2 s = smoothstep(a - w, a + w, f) * (1. - smoothstep(b - w, b + w, f)); return s.x * s.y; }
float leafN(vec2 q){ return vnoise(q * 1.9) * 0.55 + vnoise(q * 5.3 + 7.) * 0.45; }
vec2 winGrad;
float winShape(vec2 f, float style, vec2 w){
  if (style < 1.) return rect(f, vec2(0.2, 0.3), vec2(0.8, 0.86), w);
  if (style < 2.) return rect(f, vec2(-1., 0.34), vec2(2., 0.84), w) * (1. - rect(f, vec2(0.47, 0.), vec2(0.53, 1.), w) * 0.8);
  if (style < 3.) return 1. - max(rect(f, vec2(-0.1, -0.1), vec2(0.035, 1.1), w), rect(f, vec2(-0.1, -0.1), vec2(1.1, 0.06), w)) * 0.85;
  return rect(f, vec2(0.06, 0.24), vec2(0.94, 0.94), w);
}
// the room behind a window (interior mapping): the view ray carries on into a box one bay wide, one floor high and a few
// metres deep, and lands on its back wall, a side wall, the floor or the ceiling. Daylight from the window fades into it.
vec3 roomCol(vec2 f, vec2 c, float bay, float fl, vec3 d, float seed, float lit){
  float h0 = hash12(c + seed * 17.), h1 = hash12(c + 5.3), h2 = hash12(c + 11.7);
  float depth = bay * (1.3 + 1.2 * h0);
  vec3 p0 = vec3(f.x * bay, f.y * fl, 0.);
  d += vec3(1e-5) * step(abs(d), vec3(1e-5));
  vec3 tm = max((vec3(bay, fl, depth) - p0) / d, -p0 / d);
  float t = min(min(tm.x, tm.y), tm.z);
  vec3 hp = p0 + d * t, hn = hp / vec3(bay, fl, depth);
  vec3 wall = mix(vec3(0.55, 0.52, 0.46), mix(vec3(0.4, 0.46, 0.38), vec3(0.5, 0.33, 0.24), step(0.5, h1)), step(0.55, h2) * 0.8);
  vec3 col = wall * 0.85;
  if (t == tm.z) {                                   // the back wall: a sofa or a desk, a picture
    col = wall;
    col = mix(col, vec3(0.07, 0.055, 0.045) * (0.6 + h1), rect(hn.xy, vec2(0.1 + 0.25 * h2, 0.), vec2(0.7 + 0.2 * h1, 0.3 + 0.1 * h0), vec2(0.01)));
    col = mix(col, mix(vec3(0.3, 0.14, 0.08), vec3(0.08, 0.18, 0.3), h0), rect(hn.xy, vec2(0.3, 0.48), vec2(0.62, 0.74), vec2(0.01)) * step(0.4, h2));
  } else if (t == tm.y) {
    col = d.y < 0. ? mix(vec3(0.15, 0.09, 0.05), vec3(0.3, 0.28, 0.25), step(0.6, h0)) * (0.85 + 0.15 * step(0.5, fract(hp.x * 2.5))) : vec3(0.6, 0.58, 0.54);
  }
  float day = mix(1., 0.28, hn.z) * (t == tm.y && d.y > 0. ? 0.6 : 1.);
  return col * mix(vec3(0.5, 0.48, 0.44) * 0.13 * day, vec3(1.0, 0.66, 0.36) * (0.45 + 0.3 * day), lit);
}`,
  color: `
  vec3 N0 = normalize(vWN);
  float seed = vB.x, gr = vB.w, style = floor(fract(seed * 3.71) * 4.);
  vec3 conc = mix(vec3(0.34, 0.31, 0.27), vec3(0.50, 0.48, 0.45), fract(seed * 13.7));
  if (fract(seed * 5.3) > 0.9) conc = vec3(0.36, 0.24, 0.17);              // some terracotta
  vec3 alb = conc; float glass = 0.; gMask = 0.; leafGrad = vec2(0.);
  vec2 q, c0 = vec2(0.);
  float litW = 0.; winGrad = vec2(0.); inner = vec3(0.); innerK = 0.;
  if (N0.y > 0.5) {                                                       // roofs and terraces: soil and planting
    q = vW.xz;
    alb = mix(vec3(0.10, 0.08, 0.05), vec3(0.06, 0.10, 0.03), fbm3(q * 0.25));
    gMask = 0.7;
  } else {
    float u = abs(N0.x) > 0.5 ? vW.z : vW.x;
    q = vec2(u, vW.y);
    float fl = 3.4 + floor(fract(seed * 3.1) * 3.) * 0.4, bay = 2.4 + floor(fract(seed * 7.3) * 4.) * 0.6;
    vec2 g = vec2(u / bay, vW.y / fl), c = floor(g), f = fract(g), fw = fwidth(g);
    c0 = c;
    float lod = smoothstep(0.25, 0.6, max(fw.x, fw.y));                     // windows smaller than a pixel melt into their average
    vec2 w = clamp(fw, 0.01, 0.5);
    float win = winShape(f, style, w), avg = style < 1. ? 0.34 : style < 2. ? 0.47 : style < 3. ? 0.85 : 0.6;
    if (lod < 0.97) {                                                       // the glass sits back in its frame: a tilt at every edge
      float e = 0.04;
      winGrad = vec2(winShape(f + vec2(e, 0.), style, w) - winShape(f - vec2(e, 0.), style, w), winShape(f + vec2(0., e), style, w) - winShape(f - vec2(0., e), style, w)) / (2. * e) / vec2(bay, fl) * (1. - lod);
    }
    // frames and mullions round the punched and the balcony windows
    float frame = 0.;
    if (lod < 0.97 && (style < 1. || style > 2.5)) {
      vec2 fm = 0.05 / vec2(bay, fl);
      float in0 = style < 1. ? rect(f, vec2(0.2, 0.3) + fm, vec2(0.8, 0.86) - fm, w) : rect(f, vec2(0.06, 0.24) + fm, vec2(0.94, 0.94) - fm, w);
      float mull = 1. - smoothstep(fm.x * 0.5, fm.x * 0.5 + w.x, abs(f.x - 0.5));
      float tran = style < 1. ? 1. - smoothstep(fm.y * 0.5, fm.y * 0.5 + w.y, abs(f.y - 0.72)) : 0.;
      frame = clamp(win - in0 + (mull + tran) * win, 0., 1.) * (1. - lod);
    }
    win = mix(win, avg, lod);
    float slab = style > 2.5 ? rect(f, vec2(-1., -0.1), vec2(2., 0.13), w) * (1. - lod) : 0.;   // balcony slab edges
    float cell = hash12(c + seed * 91.);
    vec3 glassCol = mix(vec3(0.016, 0.02, 0.024), vec3(0.10, 0.09, 0.075), step(0.85, cell) * 0.7 + cell * 0.12);
    float lodk = 1. - lod;
    // life behind the glass: half-drawn blinds, a room full of plants, the odd lamp already on
    float blind = step(0.42, hash12(c + 17.)) * step(0.86 - (0.1 + 0.7 * hash12(c + 29.)) * 0.56, f.y) * lodk * (style < 0.5 || style > 2.5 ? 1. : 0.);
    glassCol = mix(glassCol, mix(vec3(0.30, 0.27, 0.21), vec3(0.48, 0.42, 0.31), hash12(c + 41.)) * (0.8 + 0.4 * vnoise(vec2(f.x * 30., f.y * 3.))), blind);
    float room = step(0.82, hash12(c + 63.)) * step(hash12(c + 63.), 0.9);
    glassCol = mix(glassCol, vec3(0.025, 0.07, 0.02) * (0.6 + 0.8 * vnoise(f * 9. + c)), room * 0.8 * lodk * (1. - blind));
    litW = step(0.955, hash12(c + 55.)) * lodk * (0.35 + 0.65 * smoothstep(0.25, 0.95, f.y)) * (0.6 + 0.4 * hash12(c + 71.));
    if (lodk > 0.02) {                                                      // and the room behind the glass
      vec3 Tu = abs(N0.x) > 0.5 ? vec3(0., 0., 1.) : vec3(1., 0., 0.), rd = -V;
      inner = roomCol(f, c, bay, fl, vec3(dot(rd, Tu), rd.y, dot(rd, -N0)), seed, step(0.955, hash12(c + 55.)));
      innerK = lodk * (1. - blind) * (1. - frame) * (1. - room * 0.8);
      glassCol = mix(glassCol, vec3(0.008, 0.009, 0.01), innerK);
    }
    float grime = 0.78 + 0.22 * vnoise(vec2(u * 0.7, vW.y * 0.04 + seed * 9.));
    grime *= 1. - 0.25 * smoothstep(0.5, 0.0, f.y) * step(0.5, 1. - lod) * (1. - win);   // rain streaks below the sills
    float seamV = (1. - smoothstep(0., 0.018 + fw.y, min(f.y, 1. - f.y))) * 0.22 + (1. - smoothstep(0., 0.012 + fw.x, min(f.x, 1. - f.x))) * 0.14;
    conc *= (1. - seamV * lodk) * (0.9 + 0.2 * vnoise(vec2(u * 11., vW.y * 7.)) * lodk + 0.1 * lod);          // panel joints and the grain of the concrete
    alb = mix(conc * grime, glassCol, win);
    alb = mix(alb, conc * 1.25, slab);
    alb = mix(alb, mix(vec3(0.045, 0.045, 0.048), vec3(0.42, 0.41, 0.38), step(0.5, fract(seed * 7.7))), frame);
    glass = win * (1. - slab) * (1. - frame);
    // greenery: vines hanging from each tier top, climbers from its base, planter rows, moss
    float dTop = vB.y - vW.y, dBot = vW.y - vB.z;
    float strand = vnoise(vec2(u * 0.33 + seed * 17., 0.5));
    float len = gr * (2.5 + 13. * pow(strand, 2.)) * (0.35 + 0.65 * hash12(vec2(floor(u / 0.7), seed * 31.)));   // a short fringe under each parapet
    float hang = 1. - smoothstep(len * 0.55, len, dTop + (vnoise(vec2(u * 1.6, vW.y * 0.35)) - 0.5) * 3.);
    float clen = gr * (2. + 7. * vnoise(vec2(u * 0.21 + 3.1, seed * 5.))) * step(0.6, fract(seed * 4.3));   // ivy at street level, on some
    float climb = 1. - smoothstep(clen * 0.5, clen, dBot + (vnoise(vec2(u * 2.1, vW.y * 0.5)) - 0.5) * 5.);
    float planter = style > 2.5 ? step(mod(c.y, 3.), 0.5) * (1. - smoothstep(0.16, 0.3 + 0.2 * vnoise(vec2(u * 1.3, c.y)), f.y)) : 0.;
    float moss = smoothstep(0.64, 0.74, fbm3(q * 0.07 + seed * 7.)) * gr * 0.6;
    gMask = max(max(hang, climb), max(planter * (1. - lod * 0.5), moss));
  }
  float ln = leafN(q);
  float gm = smoothstep(0.32, 0.62, gMask * (0.5 + ln * 0.95));
  // close up the greenery is real leaves: heart-shaped climbers and broad leaves from the atlas, layered over the wall
  float lfk = (1. - smoothstep(0.025, 0.07, length(fwidth(q)))) * step(0.04, gMask), la = 0., lt = 1.;
  lTN = vec2(0.);
  if (lfk > 0.01) {
    vec2 l1 = q * 0.38, l2 = mat2(0.6, -0.8, 0.8, 0.6) * q * 0.55 + 0.37;
    vec4 A = textureGrad(uLeafTex, fract(l1) * 0.5 + 0.5, dFdx(l1) * 0.5, dFdy(l1) * 0.5);
    vec4 B = textureGrad(uLeafTex, fract(l2) * 0.5, dFdx(l2) * 0.5, dFdy(l2) * 0.5);
    vec4 L = B.a > 0.5 ? B : A;
    la = max(A.a, B.a);
    gm = mix(gm, smoothstep(0.3, 0.5, gMask * (0.5 + 0.65 * la)), lfk);
    lt = mix(1., (0.35 + 0.9 * L.r) * mix(0.5, 1., la), lfk);
    lTN = (L.gb * 2. - 1.) * lfk * la;
  }
  vec3 leaf = mix(vec3(0.04, 0.08, 0.022), vec3(0.11, 0.17, 0.04), ln) * lt;
  if (fract(seed * 21.7) > 0.84) leaf = mix(leaf, vec3(0.42, 0.04, 0.16), smoothstep(0.62, 0.8, vnoise(q * 2.7)));   // bougainvillea
  diffuseColor.rgb = mix(alb, leaf, gm);
  glass *= 1. - gm;
  rough = mix(mix(0.9, 0.12, glass), 0.75, gm);
  gMask = gm;
  leafGrad = vec2(leafN(q + vec2(0.07, 0.)) - ln, leafN(q + vec2(0., 0.07)) - ln) / 0.07;
  float fres = 0.04 + 0.96 * pow(1. - max(dot(N0, V), 0.), 5.);
  emis = skyRefl(reflect(-V, N0)) * fres * glass * (0.35 + 0.5 * hash12(c0 + 3.));
  emis += vec3(1.0, 0.6, 0.3) * 0.55 * litW * glass * (1. - innerK);
  emis += inner * innerK * (1. - fres) * glass;`,
  after: `
  reflectedLight.indirectDiffuse *= mix(0.35, 1.0, smoothstep(0., 40., vW.y));   // the canyon floor sees less sky`,
  normal: `
  if (dot(winGrad, winGrad) > 1e-6) {
    vec3 Tu = abs(nW.x) > 0.5 ? vec3(0., 0., 1.) : vec3(1., 0., 0.);
    nW = normalize(nW + (Tu * winGrad.x + vec3(0., 1., 0.) * winGrad.y) * 0.11 * (1. - gMask));
  }
  if (gMask > 0.01) {
    vec3 T = abs(nW.y) > 0.5 ? vec3(1., 0., 0.) : normalize(vec3(-nW.z, 0., nW.x)), B = abs(nW.y) > 0.5 ? vec3(0., 0., 1.) : vec3(0., 1., 0.);
    nW = normalize(nW - (T * leafGrad.x + B * leafGrad.y) * 0.22 * gMask + (T * lTN.x + B * lTN.y) * 0.9 * gMask);
  }`,
};

// ---------------------------------------------------------------- foliage: lumpy crowns that sway in passing gusts
const FOLIAGE = {
  vert: "uniform float uCardR; varying float vGust, vLy, vSeed, vIn;",
  wind: `
  vec3 wo = (modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.)).xyz;
  float sc = length(instanceMatrix[0].xyz);
  float gust = smoothstep(0.42, 0.85, vnoise(wo.xz * 0.0105 - uWind * uTime * 0.05));
  gust = max(gust, uGustK * exp(-pow((dot(wo.xz, uWind) - uGustF) / 55., 2.)) * (0.7 + 0.6 * vnoise(wo.xz * 0.03)));
  float hgt = clamp(position.y * 0.5 + 0.5, 0., 1.);
  vec3 sway = vec3(uWind.x, 0., uWind.y) * (0.2 + 1.3 * gust) + vec3(sin(uTime * 1.1 + wo.x * 0.21), 0., cos(uTime * 0.9 + wo.z * 0.23)) * 0.22;
  wPos.xyz += sway * hgt * sc * 0.075;
  wPos.xyz += vec3(sin(uTime * 6.1 + wPos.y * 2.3 + wo.x), sin(uTime * 5.3 + wPos.x * 2.1), cos(uTime * 6.7 + wPos.z * 2.5)) * 0.035 * (0.2 + gust) * min(sc, 6.);
  vGust = gust; vLy = position.y; vSeed = hash12(wo.xz);
  vIn = smoothstep(uCardR, uCardR * 0.72, distance(cameraPosition, wo));   // 1 where leaf cards cover the crown`,
  frag: `varying float vGust, vLy, vSeed, vIn; vec3 clumpN; float clumpK; vec3 leafNrm; float leafK;
  // nearest feature point of a jittered 3D grid: each cell is one clump of leaves
  vec3 clump(vec3 p, out float d1, out float d2){
    vec3 ci = floor(p), f = fract(p), best = vec3(0.); d1 = 9.; d2 = 9.;
    for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) for (int k = -1; k <= 1; k++) {
      vec3 o = vec3(i, j, k), c = ci + o;
      vec3 d = o + vec3(hash13(c), hash13(c + 17.1), hash13(c + 31.7)) * 0.8 + 0.1 - f;
      float l = dot(d, d);
      if (l < d1) { d2 = d1; d1 = l; best = d; } else if (l < d2) d2 = l;
    }
    return best;
  }`,
  color: `
  float cd1, cd2;
  vec3 cpos = vW * 0.75 + vSeed * 7.;
  vec3 cm = clump(cpos, cd1, cd2);
  clumpK = 1. - smoothstep(0.25, 0.9, length(fwidth(cpos)));        // far away the clumps are below a pixel
  clumpN = normalize(-cm);
  float crev = smoothstep(0.0, 0.35, sqrt(cd2) - sqrt(cd1));         // 0 in the gaps between clumps
  float rim = 1. - abs(dot(normalize(vNormal), normalize(vViewPosition)));
  float br = n3(vW * 0.85 + vSeed * 13.) * 0.62 + n3(vW * 2.7) * 0.38;
  if (rim > 0.45 && br < (rim - 0.45) * 2.4) discard;                     // ragged leafy silhouettes
  diffuseColor.rgb *= (0.3 + 1.25 * br * br) * mix(1., 0.35 + 0.75 * crev, clumpK);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.16, 0.10), vGust * 0.4);    // leaves flip their pale undersides in a gust
  float ao = mix(0.3, 1.0, smoothstep(-0.95, 0.75, vLy));
  diffuseColor.rgb *= mix(1., ao, 0.5);
  // individual leaves: cells of ~30 cm, each with its own tilt and tone; young growth glows yellow-green at the tips
  leafK = 1. - smoothstep(0.5, 1.4, length(fwidth(vW)) * 3.4);
  vec3 lp = vW * 3.4 + vSeed * 5., lc = floor(lp), lf = fract(lp) - 0.5;
  vec3 lr = vec3(hash13(lc), hash13(lc + 7.7), hash13(lc + 19.3));
  float dome = smoothstep(0.62, 0.12, length(lf));                      // each cell is a round leaf, not a square
  leafNrm = normalize((lr * 2. - 1.) * 0.7 + lf * 1.8);
  leafK *= 0.4 + 0.6 * dome;
  diffuseColor.rgb *= mix(1., 0.74 + 0.55 * lr.x, leafK);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.38, 0.07) * (0.35 + br), smoothstep(0.7, 0.95, br * (0.6 + 0.6 * lr.y)) * 0.5 * leafK);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.24, 0.17, 0.05) * (0.4 + br), step(0.965, lr.z) * 0.7 * dome * leafK);    // the odd turning leaf
  rough = mix(0.62, 0.45, leafK);
  diffuseColor.rgb *= 1. - 0.35 * vIn;                                  // under the cards: the shaded inside of the crown`,
  normal: `
  vec3 pp = vW * 1.5; float e = 0.12, b0 = n3(pp);
  vec3 gr = vec3(n3(pp + vec3(e, 0., 0.)) - b0, n3(pp + vec3(0., e, 0.)) - b0, n3(pp + vec3(0., 0., e)) - b0) / e;
  vec3 pp2 = vW * 0.45, gr2 = vec3(n3(pp2 + vec3(e, 0., 0.)), n3(pp2 + vec3(0., e, 0.)), n3(pp2 + vec3(0., 0., e))) - n3(pp2);
  nW = normalize(nW - (gr - nW * dot(gr, nW)) * 0.35 - (gr2 / e - nW * dot(gr2 / e, nW)) * 0.5);
  nW = normalize(mix(nW, normalize(clumpN + nW * 0.6), 0.6 * clumpK));
  nW = normalize(mix(nW, normalize(nW + leafNrm * 1.1), 0.6 * leafK));`,
  after: `
  float back = pow(max(dot(-V, uSunDir), 0.), 3.);
  reflectedLight.directDiffuse += diffuseColor.rgb * uSunCol * sunVis * (0.04 + back * 0.5);   // light through the leaves
  reflectedLight.indirectDiffuse *= mix(0.45, 1.0, smoothstep(-0.95, 0.75, vLy));`,
};

// ---------------------------------------------------------------- vines hanging from the arches
const VINE = {
  vert: "varying float vH;",
  wind: `
  vec3 wo = (modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.)).xyz;
  float L = length(instanceMatrix[1].xyz), hg = clamp(-position.y, 0., 1.);
  float gust = smoothstep(0.42, 0.85, vnoise(wo.xz * 0.0105 - uWind * uTime * 0.05));
  gust = max(gust, uGustK * exp(-pow((dot(wo.xz, uWind) - uGustF) / 55., 2.)) * (0.7 + 0.6 * vnoise(wo.xz * 0.03)));
  vec2 sw = uWind * (0.1 + gust * 0.8) + vec2(sin(uTime * 0.8 + wo.x * 0.37 + wo.z), cos(uTime * 0.65 + wo.z * 0.41)) * 0.22;
  wPos.xz += sw * hg * hg * min(L, 14.) * 0.14;
  vH = hg;`,
  frag: "varying float vH;",
  color: `
  float ln = vnoise(vec2(vW.y * 2.3, (vW.x + vW.z) * 3.1)) * 0.6 + vnoise(vec2(vW.y * 7.1, vW.x * 5.3)) * 0.4;
  diffuseColor.rgb = mix(vec3(0.05, 0.09, 0.025), vec3(0.13, 0.19, 0.05), ln) * (1. - 0.25 * vH);
  rough = 0.7;`,
  after: `reflectedLight.directDiffuse += diffuseColor.rgb * uSunCol * sunVis * pow(max(dot(-V, uSunDir), 0.), 3.) * 0.3;`,
};

// ---------------------------------------------------------------- leaf cards: textured sprays around every near crown
// They give the crowns real leafy silhouettes and let the low sun glow through the leaves. Rendered with
// alpha-to-coverage (the scene target is multisampled), so their edges stay soft instead of shimmering.
const GLSL_LEAFA = /* glsl */`
uniform sampler2D uLeafTex;
// coverage from a leaf texture: kept up as the texture shrinks (mipmapping eats alpha), then sharpened to about a pixel
float leafCover(float a, vec2 uv, float size){
  vec2 du = dFdx(uv) * size, dv = dFdy(uv) * size;
  a *= 1. + max(0., 0.5 * log2(max(dot(du, du), dot(dv, dv)))) * 0.28;
  return clamp((a - 0.5) / max(fwidth(a), 1e-4) + 0.5, 0., 1.);
}`;
const LEAFCARD = {
  vert: "attribute vec3 aCT, aCB, aCC; attribute vec2 aTile; uniform float uCardR; varying vec2 vLU; varying vec3 vCT, vCB; varying float vGust, vLy;",
  wind: `
  vec3 wo = (modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.)).xyz;
  float sc = length(instanceMatrix[0].xyz);
  float gust = smoothstep(0.42, 0.85, vnoise(wo.xz * 0.0105 - uWind * uTime * 0.05));
  gust = max(gust, uGustK * exp(-pow((dot(wo.xz, uWind) - uGustF) / 55., 2.)) * (0.7 + 0.6 * vnoise(wo.xz * 0.03)));
  vec3 cw = (modelMatrix * instanceMatrix * vec4(aCC, 1.)).xyz;
  wPos.xyz = mix(cw, wPos.xyz, smoothstep(uCardR, uCardR * 0.72, distance(cameraPosition, wo)));   // far off the cards shrink into the crown
  float hgt = clamp(aCC.y * 0.5 + 0.5, 0., 1.);
  vec3 sway = vec3(uWind.x, 0., uWind.y) * (0.2 + 1.3 * gust) + vec3(sin(uTime * 1.1 + wo.x * 0.21), 0., cos(uTime * 0.9 + wo.z * 0.23)) * 0.22;
  wPos.xyz += sway * hgt * sc * 0.075;
  wPos.xyz += vec3(sin(uTime * 6.1 + cw.y * 2.3 + wo.x), sin(uTime * 5.3 + cw.x * 2.1), cos(uTime * 6.7 + cw.z * 2.5)) * 0.035 * (0.2 + gust) * min(sc, 6.);
  wPos.xyz += (wPos.xyz - cw) * sin(uTime * 7.3 + dot(cw, vec3(1.7, 2.3, 1.9))) * 0.06 * (0.3 + gust);   // and each card flutters
  mat3 cim = mat3(modelMatrix) * mat3(instanceMatrix);
  vCT = cim * aCT; vCB = cim * aCB;
  vLU = (uv + aTile) * 0.5;
  vGust = gust; vLy = aCC.y;`,
  frag: `varying vec2 vLU; varying vec3 vCT, vCB; varying float vGust, vLy; vec2 lTN; float lTone;\n${GLSL_LEAFA}`,
  color: `
  vec4 lt = texture2D(uLeafTex, vLU);
  float cov = leafCover(lt.a, vLU, 1024.);
  if (cov < 0.01) discard;
  diffuseColor.a = cov;
  lTone = lt.r; lTN = lt.gb * 2. - 1.;
  diffuseColor.rgb *= 0.35 + 0.95 * lt.r;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.16, 0.10), vGust * 0.35);   // pale undersides flip up in a gust
  diffuseColor.rgb *= mix(0.55, 1., smoothstep(-0.95, 0.75, vLy));
  rough = 0.42;`,
  normal: `
  nW *= faceDirection;                                          // the crown's normal, whichever side of the card we see
  vec3 cn = normalize(cross(vCT, vCB)) * faceDirection;
  vec3 ln = normalize(cn + (normalize(vCT) * lTN.x + normalize(vCB) * lTN.y) * faceDirection * 1.2);
  nW = normalize(nW * 0.7 + ln * 0.6);`,
  after: `
  float back = pow(max(dot(-V, uSunDir), 0.), 4.);
  reflectedLight.directDiffuse += diffuseColor.rgb * vec3(1.05, 1.25, 0.5) * uSunCol * sunVis * (0.05 + back * 0.8) * (0.5 + 0.6 * lTone);   // light through the leaf
  reflectedLight.indirectDiffuse *= mix(0.45, 1.0, smoothstep(-0.95, 0.75, vLy));`,
};
// leafy vine strands: two crossed ribbons with the vine texture repeating down them
const VINELEAF = {
  vert: "varying float vH, vSd; varying vec2 vLU;",
  wind: `
  vec3 wo = (modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.)).xyz;
  float L = length(instanceMatrix[1].xyz), Wd = length(instanceMatrix[0].xyz), hg = clamp(-position.y, 0., 1.);
  float gust = smoothstep(0.42, 0.85, vnoise(wo.xz * 0.0105 - uWind * uTime * 0.05));
  gust = max(gust, uGustK * exp(-pow((dot(wo.xz, uWind) - uGustF) / 55., 2.)) * (0.7 + 0.6 * vnoise(wo.xz * 0.03)));
  vec2 sw = uWind * (0.1 + gust * 0.8) + vec2(sin(uTime * 0.8 + wo.x * 0.37 + wo.z), cos(uTime * 0.65 + wo.z * 0.41)) * 0.22;
  wPos.xz += sw * hg * hg * min(L, 14.) * 0.14;
  vH = hg; vSd = hash12(wo.xz);
  vLU = vec2(uv.x, (uv.y - 1.) * L / (Wd * 2.) + vSd * 7.);`,
  frag: `uniform sampler2D uVineTex; varying float vH, vSd; varying vec2 vLU; vec2 lTN; float lTone;\n${GLSL_LEAFA}`,
  color: `
  vec4 lt = texture2D(uVineTex, vLU);
  float cov = leafCover(lt.a, vLU, 512.);
  if (cov < 0.01) discard;
  diffuseColor.a = cov;
  lTone = lt.r; lTN = lt.gb * 2. - 1.;
  diffuseColor.rgb = mix(vec3(0.05, 0.095, 0.025), vec3(0.12, 0.18, 0.045), vSd) * (0.35 + 0.95 * lt.r) * (1. - 0.3 * vH);
  rough = 0.45;`,
  normal: `
  vec3 T = normalize(cross(vec3(0., 1., 0.), normalize(vWN)));
  nW = normalize(nW + (T * lTN.x + vec3(0., 1., 0.) * lTN.y) * faceDirection * 1.2);`,
  after: `reflectedLight.directDiffuse += diffuseColor.rgb * vec3(1.05, 1.25, 0.5) * uSunCol * sunVis * (0.04 + pow(max(dot(-V, uSunDir), 0.), 4.) * 0.7) * (0.5 + 0.6 * lTone);`,
};

// grass and reeds: tufts of blades, dark at the root and bright at the tip, glowing when the sun is behind them
const GRASS = {
  vert: "attribute float aH; varying float vH, vSd;",
  wind: `
  vec3 wo = (modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.)).xyz;
  float gust = smoothstep(0.42, 0.85, vnoise(wo.xz * 0.0105 - uWind * uTime * 0.05));
  gust = max(gust, uGustK * exp(-pow((dot(wo.xz, uWind) - uGustF) / 55., 2.)) * (0.7 + 0.6 * vnoise(wo.xz * 0.03)));
  float hh = aH * aH * length(instanceMatrix[1].xyz);
  wPos.xz += (uWind * (0.15 + 0.7 * gust) + vec2(sin(uTime * 2.3 + wo.x * 0.7 + wPos.y * 2.), cos(uTime * 1.9 + wo.z * 0.6)) * 0.14 * (0.4 + gust)) * hh * 0.4;
  vH = aH; vSd = hash12(wo.xz);`,
  frag: "varying float vH, vSd;",
  color: `
  vec3 base = mix(vec3(0.014, 0.03, 0.008), vec3(0.03, 0.045, 0.012), vSd);
  vec3 tip = mix(vec3(0.09, 0.14, 0.035), vec3(0.2, 0.16, 0.07), step(0.82, vSd) * 0.8);   // some tufts have gone to straw
  diffuseColor.rgb = mix(base, tip, smoothstep(0.0, 0.95, vH)) * (0.8 + 0.4 * hash12(floor(vW.xz * 30.)));
  rough = 0.55;`,
  normal: "nW = normalize(nW + vec3(0., 1.4, 0.));",
  after: `
  reflectedLight.directDiffuse += diffuseColor.rgb * vec3(1.05, 1.25, 0.5) * uSunCol * sunVis * (0.04 + pow(max(dot(-V, uSunDir), 0.), 4.) * 0.9) * vH;
  reflectedLight.indirectDiffuse *= mix(0.35, 1., vH);`,
};

// ---------------------------------------------------------------- the highway: road, concrete, steel
// One material for the whole structure; the vertex attribute aK says what a face is (0 deck, 1 parapet, 2 piers, 3 steel).
const HIGHWAY = {
  vert: "attribute float aK; varying float vK;",
  wind: "vK = aK;",
  frag: `varying float vK; vec2 hwGrad;
${GLSL_REFL}
// anti-aliased stripe: coverage of |x - c| < w for a pixel footprint f (lines thinner than a pixel fade into the asphalt)
float stripe(float x, float c, float w, float f){ return clamp(0.5 - (abs(x - c) - w) / max(f, 1e-4), 0., 1.) * min(1., 2. * w / max(f, 1e-4)); }`,
  color: `
  vec3 N0 = normalize(vWN);
  float K = floor(vK + 0.5);
  vec2 q = vec2(vW.x, vW.z - (${HWY.z.toFixed(1)}));
  float a = abs(q.y), fa = max(fwidth(a), fwidth(q.x) * 0.5) + 1e-3;
  float n1 = fbm3(q * 0.09), n2 = vnoise(q * 2.3), n3v = vnoise(q * 9.);
  vec3 alb; float gm = 0.; hwGrad = vec2(0.);
  float far = smoothstep(0.1, 0.5, fa);                                    // detail finer than a pixel melts away
  if (K < 0.5 && N0.y > 0.5) {
    // the roadway: aggregate grain, repair patches, polished wheel paths, worn paint, cracks, and growth taking it back
    float grain = hash12(floor(q * 34.)), grain2 = hash12(floor(q * 11. + 3.));
    vec3 asp = mix(vec3(0.048, 0.048, 0.052), vec3(0.092, 0.09, 0.088), n1);
    asp *= mix(0.78 + 0.5 * grain * (0.4 + 0.6 * grain2), 1., far);
    vec2 pc = floor(q / vec2(9., 3.4));
    asp = mix(asp, asp * 1.45 + 0.012, step(0.87, hash12(pc + 5.)) * 0.8);   // a lighter repair
    asp *= 1. - 0.12 * step(0.9, hash12(pc + 13.));                          // an older, darker one
    float ac = (fract((a - 0.9) / 3.2) - 0.5) * 3.2;                         // across the lane, from its middle
    float wheel = exp(-pow((abs(ac) - 0.82) / 0.3, 2.)) * step(0.9, a) * step(a, 7.3);
    asp *= 1. - 0.28 * wheel * (0.6 + 0.4 * n2);
    float wear = smoothstep(0.3, 0.6, vnoise(q * vec2(1.3, 5.)) + 0.25 * n2 - 0.1 * wheel);
    float dash = step(mod(q.x, 9.), 3.6);
    float paint = max(max(stripe(a, 4.1, 0.07, fa) * dash, stripe(a, 7.28, 0.08, fa)), stripe(a, 0.98, 0.07, fa)) * wear;
    asp = mix(asp, vec3(0.50, 0.48, 0.42), paint * 0.85);
    // cracks and expansion joints
    float cr = 1. - smoothstep(0.0, 0.018 + fa * 0.5, abs(vnoise(q * vec2(0.8, 0.45) + 11.) - 0.5) * 0.7 + (vnoise(q * 6.) - 0.5) * 0.01);
    float joint = (1. - smoothstep(0.05, 0.05 + fa, abs(mod(q.x, 16.) - 0.1))) * 0.5;
    asp *= 1. - 0.55 * max(cr, joint);
    alb = asp;
    // growth: creeping in from the sides, rooted in the cracks, the odd patch in the outer lane
    float edge = 7.7 - a;
    float g = smoothstep(2.6, 0.0, edge) * smoothstep(0.3, 0.68, vnoise(q * vec2(0.45, 1.4) + 4.) + 0.2 * n2);
    g = max(g, cr * smoothstep(0.4, 0.7, vnoise(q * 0.35 + 2.)));
    g = max(g, smoothstep(0.64, 0.74, fbm3(q * 0.045 + 8.)) * smoothstep(4.6, 6.6, a) * 0.85);
    g *= 1. - 0.7 * wheel;
    float blade = vnoise(q * vec2(16., 9.)) * 0.6 + vnoise(q * vec2(40., 21.)) * 0.4;
    vec3 grass = mix(vec3(0.028, 0.06, 0.016), vec3(0.10, 0.145, 0.04), mix(blade, 0.5, far));
    grass = mix(grass, vec3(0.16, 0.11, 0.04), smoothstep(0.7, 0.9, vnoise(q * 0.7 + 5.)) * 0.6);    // dry tufts
    if (hash12(floor(q * 6.)) > 0.985 && g > 0.5) grass = mix(grass, vec3(0.7, 0.62, 0.2), 0.8 * (1. - far));   // a flower
    gm = smoothstep(0.28, 0.6, g);
    alb = mix(alb, grass, gm);
    alb = mix(alb, vec3(0.17, 0.1, 0.05), step(0.93, hash12(floor(q * 14.))) * 0.4 * (1. - far) * (1. - gm));   // fallen leaves
    hwGrad = (vec2(vnoise(q * 70. + vec2(0.1, 0.)), vnoise(q * 70. + vec2(0., 0.1))) - vnoise(q * 70.)) * (1. - far) * (1. - gm);
    rough = mix(0.9 - 0.5 * wheel, 0.8, gm);
  } else if (K > 2.5) {
    // painted steel: bleached white, rust blooming at the joints and under the lianas
    alb = mix(vec3(0.50, 0.49, 0.45), vec3(0.34, 0.31, 0.26), n1) * (0.88 + 0.22 * n2);
    alb = mix(alb, vec3(0.27, 0.12, 0.05), smoothstep(0.55, 0.8, vnoise(vec2(vW.x * 0.6 + vW.z, vW.y * 2.4))) * 0.7);
    alb = mix(alb, vec3(0.05, 0.1, 0.03), smoothstep(0.58, 0.8, vnoise(vec2(vW.x * 0.9, vW.y * 0.5 + vW.z)) + 0.1 * n3v) * 0.8);
    rough = 0.5;
  } else {
    // board-formed concrete: formwork seams, tie holes, rain streaks, moss and climbers rising from the ground
    vec2 s = abs(N0.x) > 0.5 ? vec2(vW.z, vW.y) : (abs(N0.z) > 0.5 ? vec2(vW.x, vW.y) : vec2(vW.x, vW.z));
    vec3 conc = mix(vec3(0.20, 0.195, 0.18), vec3(0.36, 0.35, 0.32), n1) * (0.84 + 0.26 * n2 + 0.08 * (1. - far) * (n3v - 0.5));
    float board = vnoise(vec2(s.x * 12., s.y * 0.7 + 3.));
    conc *= mix(0.9 + 0.2 * board, 1., far);
    vec2 sg = vec2(fract(s.x / 3.2), fract(s.y / 2.4));
    float seam = (1. - smoothstep(0.0, 0.012 + fa * 0.1, min(min(sg.x, 1. - sg.x), min(sg.y, 1. - sg.y)))) * (1. - far) * 0.6;
    float tie = (1. - smoothstep(0.03, 0.05, length(fract(s / vec2(1.6, 1.2)) - 0.5))) * (1. - far) * 0.5;
    conc *= 1. - 0.45 * seam - 0.35 * tie;
    float drip = smoothstep(0.45, 0.78, vnoise(vec2(s.x * 1.6, s.y * 0.12 + K))) * smoothstep(0.0, 4., (${HWY.y.toFixed(1)}) - vW.y + 3.);
    conc *= 1. - 0.38 * drip;
    conc *= mix(0.55, 1., smoothstep(0., 5., vW.y));                          // wet at the foot
    float climb = smoothstep(0.42, 0.7, vnoise(vec2(s.x * 0.7 + K * 5., 3.)) * 0.7 + vnoise(vec2(s.x * 3.1, s.y * 0.35)) * 0.45) * (1. - smoothstep(2., 15., vW.y));
    float top = N0.y > 0.5 ? 1. : 0.;
    gm = smoothstep(0.35, 0.6, max(climb, top * smoothstep(0.35, 0.65, vnoise(q * 0.9) + 0.2 * n2)) * (0.55 + 0.7 * vnoise(s * 2.2)));
    vec3 leaf = mix(vec3(0.03, 0.07, 0.02), vec3(0.11, 0.16, 0.04), vnoise(s * 4.1 + 1.) * 0.6 + 0.4 * n3v);
    alb = mix(conc, leaf, gm);
    hwGrad = vec2(board - 0.5, n3v - 0.5) * 0.4 * (1. - far) * (1. - gm);
    rough = mix(0.92, 0.75, gm);
  }
  diffuseColor.rgb = alb;`,
  normal: `
  if (dot(hwGrad, hwGrad) > 1e-6) {
    vec3 T = abs(nW.y) > 0.5 ? vec3(1., 0., 0.) : normalize(vec3(-nW.z, 0., nW.x)), B = abs(nW.y) > 0.5 ? vec3(0., 0., 1.) : vec3(0., 1., 0.);
    nW = normalize(nW - (T * hwGrad.x + B * hwGrad.y) * 0.25);
  }`,
};

// vehicles: lofted bodies in metres (x forward, y up, z across, origin on the road under the middle). aV says which part a
// face belongs to (0 body, 1 cabin, 2 black trim, 3 a truck's cargo box); the shader paints glass, pillars, seams, lamps,
// plates and arches from the local position, per kind (uB.w: 0 car, 1 van, 2 bus, 3 truck).
const VEHICLE = {
  vert: "attribute float aV; varying vec3 vL, vLN; varying float vPart;",
  wind: "vL = position; vLN = normal; vPart = aV;",
  frag: `varying vec3 vL, vLN; varying float vPart;
uniform vec4 uAx, uB, uLt, uD;
${GLSL_REFL}
// what a car body mirrors: the sky through the canopy, broken by leaves, and below the horizon the dark road and trees
vec3 vEnv(vec3 r){
  vec3 c = skyRefl(r);
  c = mix(c, vec3(0.02, 0.032, 0.014), smoothstep(0.12, 0.45, r.y) * 0.55 * smoothstep(0.35, 0.6, vnoise(r.xz / max(r.y, 0.08) * 2.5)));
  return mix(c, vec3(0.022, 0.026, 0.02), smoothstep(0.0, -0.05, r.y));
}
float box2(vec2 p, vec2 a, vec2 b, float w){ vec2 s = smoothstep(a - w, a + w, p) * (1. - smoothstep(b - w, b + w, p)); return s.x * s.y; }`,
  color: `
  vec3 p = vL, n = normalize(vLN), N0 = normalize(vWN);
  float part = floor(vPart + 0.5), kind = uB.w, xF = uB.x, xR = uB.y, belt = uB.z, az = abs(p.z);
  float fw = max(max(fwidth(p.x), fwidth(p.y)), fwidth(p.z)) + 1e-4, w = fw * 0.8;
  vec3 paint = diffuseColor.rgb, alb = paint;
  float gls = 0., trim = 0., metallic = step(0.55, fract(dot(paint, vec3(13.1, 7.3, 3.7)) * 9.1)), lamp = 0.;
  vec3 em = vec3(0.);
  float side = smoothstep(0.5, 0.7, abs(n.z)), frontF = smoothstep(0.3, 0.55, n.x), rearF = smoothstep(0.3, 0.55, -n.x), top = smoothstep(0.7, 0.85, n.y);
  if (part > 2.5) {
    // a cargo box: pale panels with ribs and a rail along the top
    alb = vec3(0.55, 0.55, 0.52) * (0.92 + 0.08 * smoothstep(0.3, 0.5, abs(fract(p.x / 0.62) - 0.5))) * (1. - 0.25 * box2(vec2(p.x, p.y), vec2(-9., 3.42), vec2(9., 3.52), w));
    alb *= 0.85 + 0.15 * vnoise(p.xy * vec2(0.6, 3.));
  } else if (part > 1.5) {
    alb = vec3(0.02); trim = 1.;
  } else if (part > 0.5) {
    // the cabin: glass, except the roof and the pillars
    float roofK = smoothstep(0.66, 0.8, n.y);
    float pillarA = smoothstep(0.34, 0.4, abs(n.z)) * (1. - smoothstep(0.56, 0.62, abs(n.z))) * (1. - roofK);
    float pillarB = (1. - smoothstep(0.05, 0.05 + w, abs(p.x - uD.y))) * side;
    float pillarC = (1. - smoothstep(uD.z - w, uD.z + w, p.x)) * side * step(0.5, 1. - rearF);
    float frame = (1. - smoothstep(belt + 0.02, belt + 0.04 + w, p.y)) * step(0.3, abs(n.z)) + smoothstep(0.56, 0.6, n.y) * (1. - roofK);
    gls = (1. - roofK) * (1. - max(max(pillarA, pillarB), pillarC)) * (1. - clamp(frame, 0., 1.));
    trim = clamp(frame + pillarB * 0.8 + pillarA * 0.6, 0., 1.) * (1. - gls);
    float blackRoof = step(0.62, fract(dot(paint, vec3(3.1, 17.3, 5.7)) * 7.7));
    alb = mix(paint, vec3(0.02), max(trim, roofK * blackRoof));
  } else {
    // the body
    if (kind > 1.5 && kind < 2.5) {
      // bus: a band of windows with slim pillars, a big windscreen, glass doors, a destination display
      float band = box2(vec2(p.x, p.y), vec2(xR + 0.35, 1.02), vec2(xF - 0.3, 2.78), w) * side;
      float pil = 1. - smoothstep(0.042, 0.042 + w / 1.45, 0.5 - abs(fract((p.x - xR) / 1.45) - 0.5));
      float door = (box2(vec2(p.x, p.y), vec2(xF - 1.55, 0.36), vec2(xF - 0.35, 2.78), w) + box2(vec2(p.x, p.y), vec2(-0.65, 0.36), vec2(0.65, 2.78), w)) * side * step(0., p.z);
      float screen = box2(vec2(p.z, p.y), vec2(-1.12, 0.92), vec2(1.12, 2.66), w) * frontF;
      float rearW = box2(vec2(p.z, p.y), vec2(-1.05, 1.5), vec2(1.05, 2.7), w) * rearF;
      gls = max(max(band * (1. - pil), screen), max(door * (1. - (1. - smoothstep(0.02, 0.02 + w, abs(p.x - (xF - 0.95)))) - (1. - smoothstep(0.02, 0.02 + w, abs(p.x)))), rearW));
      float disp = box2(vec2(p.z, p.y), vec2(-0.85, 2.72), vec2(0.85, 2.98), w) * frontF;
      vec2 dg = fract(vec2(p.z * 22., p.y * 22.)) - 0.5;
      em += vec3(2.6, 1.3, 0.2) * disp * step(length(dg), 0.32) * step(0.45, vnoise(vec2(floor(p.z * 22.) * 0.5, floor(p.y * 22.) * 1.7)));
      trim = max(disp, box2(vec2(p.x, p.y), vec2(-9., 2.78), vec2(9., 2.86), w) * side);
      // a living roof
      alb = mix(alb, mix(vec3(0.04, 0.09, 0.025), vec3(0.1, 0.16, 0.04), vnoise(p.xz * 6.)) * (0.7 + 0.5 * vnoise(p.xz * 23.)), top * box2(p.xz, vec2(-5.4, -1.0), vec2(1.2, 1.0), 0.05));
    } else if (kind > 0.5 && kind < 1.5) {
      // van: windscreen, side windows, a sliding door
      float screen = smoothstep(0.25, 0.4, n.x) * box2(vec2(p.z, p.y), vec2(-0.95, 1.18), vec2(0.95, 2.02), w);
      float sideW = box2(vec2(p.x, p.y), vec2(xR + 0.35, 1.3), vec2(xF - 0.95, 1.94), w) * side * (1. - (1. - smoothstep(0.06, 0.06 + w, abs(p.x - uD.y))));
      float rearW = box2(vec2(p.z, p.y), vec2(-0.9, 1.3), vec2(0.9, 1.94), w) * rearF * (1. - (1. - smoothstep(0.02, 0.02 + w, abs(p.z))));
      gls = max(max(screen, sideW), rearW);
    } else if (kind > 2.5) {
      // truck cab
      float screen = frontF * box2(vec2(p.z, p.y), vec2(-1.05, 1.62), vec2(1.05, 2.55), w);
      float sideW = side * box2(vec2(p.x, p.y), vec2(2.75, 1.68), vec2(3.75, 2.5), w);
      gls = max(screen, sideW);
    }
    if (kind < 0.5) {
      // car doors: shut lines, handles
      float seam = max(max(1. - smoothstep(0.004, 0.004 + w, abs(p.x - uD.x)), 1. - smoothstep(0.004, 0.004 + w, abs(p.x - uD.y))), 1. - smoothstep(0.004, 0.004 + w, abs(p.x - uD.z)));
      seam *= side * step(0.3, p.y) * step(p.y, belt);
      float handle = (box2(vec2(p.x, p.y), vec2(uD.y - 0.32, uD.w - 0.025), vec2(uD.y - 0.1, uD.w + 0.025), w) + box2(vec2(p.x, p.y), vec2(uD.z + 0.12, uD.w - 0.025), vec2(uD.z + 0.34, uD.w + 0.025), w)) * side;
      alb *= 1. - 0.75 * seam;
      alb = mix(alb, vec3(0.3), handle * 0.7);
      float hood = (1. - smoothstep(0.004, 0.004 + w, abs(p.x - (xF - 0.95)))) * top;
      alb *= 1. - 0.6 * hood;
    } else alb *= 1. - 0.6 * (1. - smoothstep(0.004, 0.004 + w, abs(p.x - uD.y))) * side * step(0.35, p.y) * step(p.y, belt + 0.9) * step(kind, 1.5);
    // lower cladding, bumpers, grille, plates
    float clad = 1. - smoothstep(0.31 + (kind > 1.5 ? 0.12 : 0.), 0.33 + (kind > 1.5 ? 0.12 : 0.) + w, p.y);
    float grille = frontF * box2(vec2(p.z, p.y), vec2(-0.55, 0.26), vec2(0.55, uLt.x - 0.06), w) * step(kind, 1.5);
    float plate = max(frontF, rearF) * box2(vec2(p.z, p.y), vec2(-0.26, 0.37), vec2(0.26, 0.49), w);
    alb = mix(alb, vec3(0.025), max(clad, grille));
    trim = max(trim, max(clad, grille));
    alb = mix(alb, vec3(0.55, 0.55, 0.5) * (1. - 0.8 * step(0.6, vnoise(vec2(p.z * 60., p.y * 30.))) * box2(vec2(p.z, p.y), vec2(-0.22, 0.4), vec2(0.22, 0.46), 0.003)), plate);
    // lamps: a headlamp each side with a daytime running strip, a light bar across the back
    float hl = frontF * box2(vec2(az, p.y), vec2(kind > 1.5 ? 0.75 : 0.42, uLt.x), vec2((kind > 1.5 ? 1.12 : 0.84), uLt.y), w);
    float drl = frontF * box2(vec2(az, p.y), vec2(kind > 1.5 ? 0.75 : 0.42, uLt.y - 0.025), vec2(kind > 1.5 ? 1.12 : 0.84, uLt.y), w * 0.5);
    float tl = rearF * box2(vec2(az, p.y), vec2(kind > 0.5 ? 0.74 : -1., uLt.z), vec2(kind > 0.5 ? 0.96 : 0.84, uLt.w), w);
    alb = mix(alb, vec3(0.04), max(hl, tl));
    em += vec3(0.5, 0.48, 0.45) * hl * (0.4 + 0.6 * step(0.5, fract(az * 9.))) + vec3(6., 5.6, 5.) * drl + vec3(1.1, 0.025, 0.015) * tl;
    lamp = max(hl, tl);
    // the arches over the wheels
    for (int i = 0; i < 2; i++) {
      float ax = i == 0 ? uAx.x : uAx.y, rr = length(vec2(p.x - ax, p.y - uAx.z));
      float arch = (1. - smoothstep(uAx.z + 0.06, uAx.z + 0.07 + w, rr)) * step(0.3, abs(n.z));
      float lip = (1. - smoothstep(uAx.z + 0.07, uAx.z + 0.12 + w, rr)) * step(0.3, abs(n.z));
      alb = mix(alb, vec3(0.03), max(lip * step(0.5, 1. - clamp(kind, 0., 1.)), 0.)) ;
      alb = mix(alb, vec3(0.006), arch);
      trim = max(trim, arch);
    }
    gls *= 1. - trim;
  }
  // dust on the sills and the lower doors, the road's grime
  alb *= 1. - 0.25 * (1. - smoothstep(0.3, 0.75, p.y)) * (1. - gls) * vnoise(p.xy * vec2(3., 9.));
  alb = mix(alb, vec3(0.01, 0.012, 0.014), gls);
  diffuseColor.rgb = alb;
  rough = mix(mix(0.3, 0.6, trim), 0.04, gls);
  metal = metallic * (1. - trim) * (1. - gls) * 0.55;
  vec3 R0 = reflect(-V, N0);
  float fres = 0.04 + 0.96 * pow(1. - max(dot(N0, V), 0.), 5.);
  vec3 env = vEnv(R0);
  emis = env * mix(vec3(fres) * 0.8, paint * 0.6 + fres * 0.5, metallic) * (1. - trim) * (1. - gls) * (1. - lamp);   // clear coat over the paint
  emis += env * (0.1 + 0.9 * fres) * gls + env * fres * 0.4 * lamp;                                 // glass, lamp covers
  emis += vec3(0.012, 0.011, 0.01) * gls * (1. - fres) * smoothstep(belt + 0.5, belt + 0.1, p.y);    // seats and headrests behind the glass
  emis += em;`,
};
// wheels: a lathe in metres around its own y axis (the outer face at +y); the rim's spokes turn with aSpin (rad/s) and blur
// into a disc as the speed rises
const WHEEL = {
  vert: "attribute float aSpin; varying vec3 vL; varying float vSpin;",
  wind: "vL = position; vSpin = aSpin;",
  frag: "varying vec3 vL; varying float vSpin; uniform vec2 uWR;",
  color: `
  float r = length(vL.xz), a = atan(vL.z, vL.x) + uTime * vSpin, R = uWR.x, Rr = uWR.y;
  float blur = 1. / (1. + abs(vSpin) * 0.06);
  float tire = smoothstep(Rr + 0.005, Rr + 0.02, r);
  float tread = smoothstep(R - 0.014, R - 0.006, r);
  float grooves = mix(0.5, step(0.5, fract(a * 22. / 6.2832 + step(0., vL.y) * 0.5)), blur);
  vec3 rubber = vec3(0.022, 0.022, 0.024) * (1. - 0.3 * tread * grooves) * (0.9 + 0.2 * smoothstep(R - 0.05, R - 0.04, r) * (1. - tread));
  float spokes = smoothstep(0.35, 0.55, abs(sin(a * 2.5)));                       // five spokes
  float face = step(0.0, vL.y);
  float rimM = mix(0.55, mix(1., 0.15, spokes), blur) * (1. - smoothstep(Rr * 0.86, Rr * 0.9, r) * 0.5);
  vec3 rim = mix(vec3(0.05), vec3(0.42, 0.43, 0.44), rimM) * (1. - 0.7 * (1. - smoothstep(Rr * 0.16, Rr * 0.2, r)) * step(Rr * 0.08, r));
  rim = mix(rim, vec3(0.03), 1. - face);
  diffuseColor.rgb = mix(rim, rubber, tire);
  rough = mix(0.35, 0.92, tire);
  metal = 0.;
  emis = vec3(0.05, 0.055, 0.06) * (1. - tire) * face * rimM;     // the alloy catching the sky`,
};
// the shadows the vehicles cast on the deck: the footprint swept along the low sun, sharp where the tyres touch, softer and
// fainter toward the roof's end. Each instance carries its quad (aBox: centre and size, in the vehicle's frame), its half
// length / half width / height (aSh) and where the sun pushes the shadow per metre of height (aSd).
const SHADOW_BLOB = {
  vertexShader: `attribute vec4 aBox, aSh; attribute vec2 aSd; varying vec2 vQ; varying vec4 vSh; varying vec2 vSd;
    void main(){ vQ = aBox.xy + position.xz * aBox.zw; vSh = aSh; vSd = aSd;
      gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(vQ.x, position.y, vQ.y, 1.); }`,
  fragmentShader: `varying vec2 vQ; varying vec4 vSh; varying vec2 vSd;
    void main(){
      float a = 0.;
      for (int i = 0; i < 9; i++) {
        float t = float(i) / 8., h = t * vSh.z, soft = 0.05 + 0.05 * h;
        vec2 hs = vSh.xy * vec2(1. - 0.18 * t, 1. - 0.14 * t);
        vec2 d = abs(vQ - vSd * h) - hs;
        a = max(a, (1. - smoothstep(-soft, soft, max(d.x, d.y))) * (1. - 0.3 * t));
      }
      vec2 d0 = abs(vQ) - vSh.xy;
      float contact = 1. - smoothstep(-0.25, 0.3, max(d0.x, d0.y));
      gl_FragColor = vec4(0.004, 0.004, 0.005, clamp(0.5 * a + 0.35 * contact, 0., 0.8));
    }`,
};

const GROUND = {
  frag: GLSL_REFL + GLSL_RIVER + "uniform sampler2D uLeafTex;",
  color: `
  vec2 q = vW.xz;
  float n = fbm(q * 0.06), m = fbm3(q * 0.6);
  vec3 soil = mix(vec3(0.07, 0.055, 0.04), vec3(0.11, 0.09, 0.06), m);
  vec3 grass = mix(vec3(0.035, 0.07, 0.02), vec3(0.08, 0.12, 0.03), m);
  vec3 c = mix(soil, grass, smoothstep(0.35, 0.6, n));
  // what is left of the asphalt: grey slabs, every crack grown green
  float asph = step(abs(vW.x), ${AVE}.) * smoothstep(0.52, 0.56, fbm3(q * 0.045 + 4.)) ;
  vec2 cl = q * 0.35; vec2 ci = floor(cl), cf = fract(cl);
  float crack = smoothstep(0.08, 0.0, min(min(cf.x, 1. - cf.x), min(cf.y, 1. - cf.y)) + (vnoise(q * 1.3) - 0.5) * 0.12);
  float dn = abs(vW.x - riverX(vW.z)) / riverW(vW.z);
  asph *= smoothstep(1.6, 2.4, dn);
  c = mix(c, mix(vec3(0.075, 0.075, 0.07), grass, crack), asph);
  // close up, grass reads as blades: fine streaks, dark between them
  float gk = (1. - smoothstep(0.015, 0.05, length(fwidth(q)))) * smoothstep(0.35, 0.6, n) * (1. - asph);
  c *= 1. - gk * 0.45 * smoothstep(0.35, 0.75, vnoise(vec2(q.x * 26. + vnoise(q * 3.) * 4., q.y * 7.)) * vnoise(vec2(q.x * 9., q.y * 31.) + 3.) * 1.6);
  // fallen leaves under the trees: two drifts of the atlas's broad leaves, browned and rotting into the soil
  float lk = (1. - smoothstep(0.02, 0.07, length(fwidth(q)))) * (1. - asph) * smoothstep(1.25, 1.7, dn) * step(abs(vW.x), ${AVE}.);
  if (lk > 0.01) {
    for (int i = 0; i < 2; i++) {
      float fi = float(i), a = fi * 2.1 + 0.4;
      vec2 u = mat2(cos(a), -sin(a), sin(a), cos(a)) * q * (0.5 + 0.3 * fi) + fi * vec2(0.37, 0.71);
      vec4 L = textureGrad(uLeafTex, fract(u) * 0.5, dFdx(u) * 0.5, dFdy(u) * 0.5);
      vec3 lc = mix(vec3(0.15, 0.085, 0.032), vec3(0.075, 0.06, 0.028), hash12(floor(u) + fi * 7.)) * (0.45 + 0.7 * L.r);
      c = mix(c, lc, L.a * lk * (0.5 + 0.3 * fi) * smoothstep(0.25, 0.55, vnoise(q * 0.3 + fi * 5.)));
    }
  }
  // the banks: dark wet mud at the waterline, a stony bed below it
  float wet = smoothstep(1.35, 0.95, dn);
  c = mix(c, mix(vec3(0.035, 0.03, 0.022), vec3(0.06, 0.055, 0.045), m), wet);
  diffuseColor.rgb = c;
  rough = mix(0.95, 0.45, wet * (1. - smoothstep(${WATER_Y.toFixed(2)}, ${(WATER_Y + 0.5).toFixed(2)}, vW.y)));`,
};

const WATER = {
  frag: GLSL_REFL + GLSL_RIVER + "uniform sampler2D uPrev; uniform mat4 uVP; vec3 wN, rW; float pad;",
  color: `
  float cx = riverX(vW.z), hw = riverW(vW.z), dn = (vW.x - cx) / hw, t = uTime;
  vec2 q = vec2(vW.x - cx, vW.z);                                       // coordinates that follow the river's line
  vec2 fq = q + vec2(0., t * 0.9 * max(0., 1. - dn * dn));              // the current, fastest mid-stream
  float fw = clamp(length(fwidth(vW.xz)) * 1.2, 0., 1.);                // ripples finer than a pixel fade out
  #define WH(p) (vnoise((p) * vec2(0.45, 0.16)) * 0.5 + vnoise((p) * vec2(1.5, 0.65) + 3.) * 0.3 * (1. - fw) + vnoise((p) * vec2(4.1, 2.3) + 7.) * 0.2 * (1. - fw))
  float e = 0.06, h0 = WH(fq);
  vec2 g = vec2(WH(fq + vec2(e, 0.)) - h0, WH(fq + vec2(0., e)) - h0) / e;
  wN = normalize(vec3(-g.x * 0.09, 1., -g.y * 0.09));
  // lily pads in the slack water along the banks, drifting slowly
  vec2 pq = (q + vec2(0., t * 0.06)) / 1.4, pc = floor(pq), pv = fract(pq) - 0.5 - (vec2(hash12(pc + 7.), hash12(pc + 13.)) - 0.5) * 0.35;
  float pr = 0.2 + 0.2 * hash12(pc + 3.), pd = length(pv), ang = atan(pv.y, pv.x) + hash12(pc) * 6.283;
  float slack = smoothstep(0.55, 0.95, abs(dn)) * smoothstep(0.4, 0.7, vnoise(q * 0.07 + 2.));
  pad = (1. - smoothstep(pr - 0.03, pr, pd)) * step(hash12(pc + 1.), slack * 0.85) * step(-0.93, cos(ang)) * (1. - fw);
  vec3 deep = vec3(0.006, 0.013, 0.010), shallow = vec3(0.03, 0.036, 0.022);
  diffuseColor.rgb = mix(deep, shallow, smoothstep(0.55, 1.05, abs(dn)));
  rough = 0.035;
  rW = reflect(-V, wN); rW.y = abs(rW.y);
  float fres = 0.02 + 0.98 * pow(1. - max(dot(wN, V), 0.), 5.);
  // what the river mirrors: the tree walls on its banks and the towers behind them; mid-stream, the open sky toward the sun
  vec3 env = skyRefl(rW);
  float sx = rW.x < 0. ? -1. : 1., ax = max(abs(rW.x), 1e-3);
  float tT = max(0., hw + 9. - (vW.x - cx) * sx) / ax, yT = vW.y + rW.y * tT;
  float tB = max(0., ${AVE + 6}. - vW.x * sx) / ax, yB = vW.y + rW.y * tB;
  vec3 towC = mix(vec3(0.05, 0.055, 0.05), hazeCol(rW), 1. - exp(-tB * 0.0012));
  vec3 treeC = mix(vec3(0.018, 0.03, 0.013), hazeCol(rW), 1. - exp(-tT * 0.0016));
  env = mix(env, towC, smoothstep(190., 110., yB));
  env = mix(env, treeC, smoothstep(30., 15., yT + (vnoise(vec2(vW.z * 0.04 + tT * 0.01, sx)) - 0.5) * 18.));
  // where the reflected direction is on screen, mirror last frame's image: the vault, the vines and the sun, broken by ripples
  vec4 cp = uVP * vec4(cameraPosition + rW * 3000., 1.);
  vec2 su = cp.xy / max(cp.w, 1e-3) * 0.5 + 0.5;
  float onScr = step(0., cp.w) * smoothstep(0., 0.05, su.x) * smoothstep(1., 0.95, su.x) * smoothstep(0., 0.05, su.y) * smoothstep(1., 0.95, su.y);
  env = mix(env, texture2D(uPrev, clamp(su, 0.002, 0.998)).rgb, onScr);
  // foam streaks and floating froth where the current meets the banks
  float fn = vnoise(vec2(q.x * 0.9, q.y * 0.35 - t * 0.25)) * 0.6 + vnoise(vec2(q.x * 3.2, q.y * 1.2 - t * 0.6)) * 0.4;
  float foam = smoothstep(0.8, 1.02, abs(dn)) * smoothstep(0.42, 0.68, fn) * (1. - fw) * (1. - pad);
  emis = env * fres * (1. - pad) * (1. - foam * 0.85);
  vec3 padC = mix(vec3(0.04, 0.08, 0.02), vec3(0.08, 0.13, 0.03), hash12(pc + 9.));
  if (hash12(pc + 5.) > 0.88 && pd < 0.07) padC = mix(vec3(0.6, 0.25, 0.35), vec3(0.75, 0.72, 0.65), hash12(pc + 2.));   // a flower
  diffuseColor.rgb = mix(diffuseColor.rgb, padC, pad);
  rough = mix(rough, 0.5, pad);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.32, 0.27) * (0.7 + 0.5 * fn), foam * 0.85);
  rough = mix(rough, 0.75, foam);
  wN = normalize(mix(wN, vec3(0., 1., 0.), pad));`,
  normal: "nW = wN;",
  after: "reflectedLight.directSpecular += uSunCol * pow(max(dot(rW, uSunDir), 0.), 700.) * 5. * sunVis * (1. - pad);   // glitter",
};

// ---------------------------------------------------------------- textures, painted once at startup
// Leaves are rasterised here rather than drawn on a canvas, so the empty texels can hold a neutral colour and mipmap
// cleanly. Channels: r = the leaf's tone (midrib and veins darker, leaves underneath darker), g/b = how its surface tilts
// in the texture plane (folded along the midrib, the tip curling away), a = coverage.
const OVATE = (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 0.85);
const LANCE = (u) => Math.pow(Math.sin(Math.PI * u), 0.75) * (1 - 0.25 * u);
const HEART = (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.6)), 0.7);
function paintLeaves(W, H, wrapY, seed, draw) {
  const C = new Float32Array(W * H * 4), r = rng(seed);
  const put = (x, y, cov, t, nx, ny) => {
    if (x < 0 || x >= W) return;
    if (wrapY) y = ((y % H) + H) % H; else if (y < 0 || y >= H) return;
    const o = (y * W + x) * 4, k = 1 - cov;
    C[o] = C[o] * k + t * cov; C[o + 1] = C[o + 1] * k + nx * cov; C[o + 2] = C[o + 2] * k + ny * cov; C[o + 3] = C[o + 3] * k + cov;
  };
  // every texel near the segment (ax, ay)-(bx, by), within the clip box b = [x0, x1, y0, y1]
  const span = (ax, ay, bx, by, w, b, f) => {
    const x0 = Math.max(b[0], Math.floor(Math.min(ax, bx) - w - 1)), x1 = Math.min(b[1], Math.ceil(Math.max(ax, bx) + w + 1));
    const y0 = Math.max(b[2], Math.floor(Math.min(ay, by) - w - 1)), y1 = Math.min(b[3], Math.ceil(Math.max(ay, by) + w + 1));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) f(x, y);
  };
  // a leaf from its base along angle a: half-width wid * shape(u) at u = 0..1 along its length
  const leaf = (ox, oy, a, len, wid, shape, tone, b) => {
    const ca = Math.cos(a), sa = Math.sin(a), tx = ox + ca * len, ty = oy + sa * len, m = wid * 0.4;
    if (tx < b[0] + m || tx > b[1] - m || ty < b[2] + m || ty > b[3] - m) return;    // a leaf the tile would cut off is left out
    span(ox, oy, ox + ca * len, oy + sa * len, wid, b, (x, y) => {
      const dx = x + 0.5 - ox, dy = y + 0.5 - oy, u = (dx * ca + dy * sa) / len, v = -dx * sa + dy * ca;
      if (u <= 0 || u >= 1) return;
      const hw = wid * shape(u), cov = clamp(hw - Math.abs(v) + 0.5, 0, 1);
      if (cov <= 0) return;
      const m = Math.min(1, Math.abs(v) / Math.max(hw, 0.5));               // 0 on the midrib, 1 at the margin
      let t = tone * (1 - 0.38 * Math.exp(-v * v * 0.9));
      t *= 1 - 0.16 * Math.pow(Math.abs(Math.sin((u * len - Math.abs(v) * 0.9) * 0.24)), 8) * (1 - m);   // side veins
      t *= 0.9 + 0.1 * m;
      const fold = Math.sign(v) * 0.42 * Math.min(1, m * 2.5), curl = (u - 0.5) * 0.55;
      put(x, y, cov, t, -sa * fold + ca * curl, ca * fold + sa * curl);
    });
  };
  const stem = (ax, ay, bx, by, w, tone, b) => {
    const L = Math.hypot(bx - ax, by - ay) || 1, ca = (bx - ax) / L, sa = (by - ay) / L;
    span(ax, ay, bx, by, w, b, (x, y) => {
      const dx = x + 0.5 - ax, dy = y + 0.5 - ay, u = clamp((dx * ca + dy * sa) / L, 0, 1), v = -dx * sa + dy * ca;
      const cov = clamp(w - Math.hypot(dx - ca * u * L, dy - sa * u * L) + 0.5, 0, 1), k = 0.5 * Math.sign(v) * Math.min(1, Math.abs(v) / Math.max(w, 0.5));
      if (cov > 0) put(x, y, cov, tone, -sa * k, ca * k);
    });
  };
  // a twig: a curving stem with leaves alternating along it, largest in the middle, and one at the tip
  const twig = (x, y, a, n, seg, bend, L, wd, spread, shape, tone, b) => {
    const at = [];
    for (let i = 0; i < n; i++) {
      const nx = x + Math.cos(a) * seg, ny = y + Math.sin(a) * seg;
      stem(x, y, nx, ny, Math.max(0.7, 2.4 * (1 - i / n)), 0.22, b);
      at.push([nx, ny, a]); x = nx; y = ny; a += bend + (r() - 0.5) * 0.2;
    }
    at.forEach(([px, py, pa], i) => {
      const t = i / n, l = L * (0.6 + 0.4 * Math.sin(Math.PI * (0.25 + 0.75 * t))) * (0.85 + r() * 0.3);
      leaf(px, py, pa + (i % 2 ? 1 : -1) * spread * (0.7 + r() * 0.6), l, wd * l / L, shape, tone * (0.8 + 0.25 * t) * (0.85 + r() * 0.3), b);
    });
    leaf(x, y, a + (r() - 0.5) * 0.3, L * 0.75, wd * 0.75, shape, tone * 1.05, b);
  };
  draw({ r, leaf, stem, twig });
  let ts = 0, tn = 0;
  for (let i = 0; i < W * H; i++) if (C[i * 4 + 3] > 0.5) { ts += C[i * 4] / C[i * 4 + 3]; tn++; }
  const avg = tn ? ts / tn : 0.7, B = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const o = i * 4, a = C[o + 3], k = a > 1e-3 ? 1 / a : 0;
    B[o] = clamp(a > 1e-3 ? C[o] * k : avg, 0, 1) * 255;                 // the gaps carry the average tone, so mips don't darken
    B[o + 1] = (clamp(C[o + 1] * k, -1, 1) * 0.5 + 0.5) * 255;
    B[o + 2] = (clamp(C[o + 2] * k, -1, 1) * 0.5 + 0.5) * 255;
    B[o + 3] = clamp(a, 0, 1) * 255;
  }
  const tex = new THREE.DataTexture(B, W, H);
  tex.wrapT = wrapY ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
// four 512-px tiles: 0 broad glossy leaves, 1 small leaflets, 2 fern fronds, 3 big heart-shaped leaves
const leafAtlas = () => paintLeaves(1024, 1024, false, 31, ({ r, leaf, stem, twig }) => {
  const tile = (i) => { const x = (i & 1) * 512, y = (i >> 1) * 512; return [x + 6, x + 506, y + 6, y + 506]; };
  let b = tile(0);
  for (let k = 0; k < 7; k++) {                                            // twigs radiating from the middle of the patch
    const a = k / 7 * TAU + r() * 0.6;
    twig(b[0] + 250 + Math.cos(a) * 26, b[2] + 250 + Math.sin(a) * 26, a, 7, 22, (r() - 0.5) * 0.16, 84, 25, 0.85, OVATE, 0.75 + r() * 0.2, b);
  }
  b = tile(1);
  for (let k = 0; k < 11; k++) {
    const a = k / 11 * TAU + r() * 0.4, d = 15 + r() * 45;
    twig(b[0] + 250 + Math.cos(a) * d, b[2] + 250 + Math.sin(a) * d, a, 10, 15, (r() - 0.5) * 0.2, 44, 10, 1.05, LANCE, 0.7 + r() * 0.25, b);
  }
  b = tile(2);
  for (let k = 0; k < 3; k++) {                                            // fronds: a rachis with pinnate leaflets both sides
    let x = b[0] + 40 + k * 60, y = b[2] + 30 + (2 - k) * 40, a = 0.75 + (r() - 0.5) * 0.3;
    const n = 30, seg = 15 - k;
    for (let i = 0; i < n; i++) {
      const nx = x + Math.cos(a) * seg, ny = y + Math.sin(a) * seg, t = i / n, l = 62 * Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * t)), 0.7) * (1 - 0.45 * t);
      stem(x, y, nx, ny, 2.2 * (1 - t) + 0.6, 0.25, b);
      for (const s of [-1, 1]) leaf(nx, ny, a + s * (1.15 + r() * 0.15), l, 6.5, LANCE, (0.72 + r() * 0.2) * (0.85 + 0.2 * t), b);
      x = nx; y = ny; a -= 0.025 + (r() - 0.5) * 0.04;
    }
  }
  b = tile(3);
  for (let k = 0; k < 7; k++) {                                            // big heart leaves on long stalks
    const a = Math.PI / 2 + (k - 3) * 0.42 + (r() - 0.5) * 0.25, d = 40 + r() * 50, L = 160 + r() * 60;
    const bx = b[0] + 250 + Math.cos(a) * d, by = b[2] + 90 + Math.sin(a) * d;
    stem(b[0] + 250, b[2] + 60, bx, by, 2.4, 0.3, b);
    leaf(bx, by, a + (r() - 0.5) * 0.3, L, L * 0.38, HEART, 0.7 + r() * 0.3, b);
  }
  for (let k = 0; k < 4; k++) { const a = r() * TAU, L = 90 + r() * 40; leaf(b[0] + 250 + Math.cos(a) * 150, b[2] + 250 + Math.sin(a) * 150, a + 2.6, L, L * 0.38, HEART, 0.85, b); }
});
// a hanging vine strand that repeats down its length: a wavy stem with heart leaves hanging from it on long stalks,
// at uneven spacing, some turned toward the viewer
const vineStrand = () => paintLeaves(256, 512, true, 57, ({ r, leaf, stem }) => {
  const b = [-1e9, 1e9, -1e9, 1e9], sx = (y) => 128 + 14 * Math.sin(y / 512 * TAU * 2) + 6 * Math.sin(y / 512 * TAU * 5);
  for (let y = 0; y < 512; y += 8) stem(sx(y), y, sx(y + 8), y + 8, 2.6, 0.28, b);
  let side = 1;
  for (let y = 0; y < 512 - 20;) {
    const x = sx(y), a = -Math.PI / 2 + side * (0.3 + r() * 0.75), p = 10 + r() * 10;
    const L = Math.min(72 + r() * 40, 116 / Math.max(0.2, Math.abs(Math.cos(a))) - p - 8);   // kept inside the ribbon
    stem(x, y, x + Math.cos(a) * p, y + Math.sin(a) * p, 1.4, 0.3, b);
    leaf(x + Math.cos(a) * (p - 1), y + Math.sin(a) * (p - 1), a + (r() - 0.5) * 0.3, L, L * (0.36 + r() * 0.1), HEART, 0.68 + r() * 0.34, b);
    if (r() < 0.35) leaf(x, y + 6, -Math.PI / 2 - side * 0.2, 26 + r() * 14, 10, HEART, 0.95, b);    // a young leaf
    y += 34 + r() * 26; if (r() < 0.8) side = -side;
  }
});
// a crown's shell of leaf cards around the unit sphere (flatter underneath, like the blob): each card faces roughly
// outward, tilted and spun at random. Its normal is the crown's (so light falls smoothly across the crown); aCT/aCB are
// the card's own axes, aCC its centre (it shrinks to that point with distance)
function cardShell(n, size, seed) {
  const r = rng(seed), P = [], N = [], UV = [], CT = [], CB = [], CC = [], I = [];
  const d = new THREE.Vector3(), c = new THREE.Vector3(), cn = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3(), T = new THREE.Vector3(), B = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const y = 1 - 2 * (i + 0.5) / n, rr = Math.sqrt(1 - y * y), ph = i * 2.39996;
    d.set(Math.cos(ph) * rr + (r() - 0.5) * 0.25, y + (r() - 0.5) * 0.25, Math.sin(ph) * rr + (r() - 0.5) * 0.25).normalize();
    c.copy(d).multiplyScalar(0.86 + r() * 0.36);
    if (c.y < -0.3) c.y = -0.3 + (c.y + 0.3) * 0.6;
    cn.set(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(1.1).add(d).normalize();
    t.set(0, 1, 0).cross(cn); if (t.lengthSq() < 1e-4) t.set(1, 0, 0); t.normalize();
    b.crossVectors(cn, t);
    const sp = r() * TAU, s = size * (0.75 + r() * 0.5) * 0.5;
    T.copy(t).multiplyScalar(Math.cos(sp)).addScaledVector(b, Math.sin(sp)); B.crossVectors(cn, T);
    const i0 = P.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      P.push(c.x + (T.x * (u * 2 - 1) + B.x * (v * 2 - 1)) * s, c.y + (T.y * (u * 2 - 1) + B.y * (v * 2 - 1)) * s, c.z + (T.z * (u * 2 - 1) + B.z * (v * 2 - 1)) * s);
      N.push(d.x, d.y, d.z); UV.push(u, v); CT.push(T.x, T.y, T.z); CB.push(B.x, B.y, B.z); CC.push(c.x, c.y, c.z);
    }
    I.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2)); g.setAttribute("aCT", new THREE.Float32BufferAttribute(CT, 3));
  g.setAttribute("aCB", new THREE.Float32BufferAttribute(CB, 3)); g.setAttribute("aCC", new THREE.Float32BufferAttribute(CC, 3));
  g.setIndex(I);
  return g;
}

// ---------------------------------------------------------------- the scene
export function startShade3D(canvasEl, { reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: false, powerPreference: "high-performance" });
  let pr = Math.min(window.devicePixelRatio || 1, 1.5);
  const LITE = matchMedia("(pointer: coarse)").matches;    // phones and tablets: leaf cards, leafy vines and grass reach less far
  renderer.setPixelRatio(pr);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;                 // the city does not move; render the sun's shadow map once
  const post = makePost(renderer, { comp: COMP_FRAG, bloom: 0.3, thresh: 0.7, keepPrev: true, uniforms: { uHorizon: { value: 0.45 }, uSunUV: { value: new THREE.Vector2(0.5, 0.7) }, uRays: { value: 1 } } });
  post.U.uExposure.value = 1.12;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 9000);
  const target = LOOK.clone();

  // ---- light
  const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.68, 0.40), 6.5);
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(new THREE.Color(0.50, 0.58, 0.66), new THREE.Color(0.20, 0.22, 0.10), 1.15);
  scene.add(hemi);

  // ---- sky
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: SU,
    vertexShader: "varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }",
    fragmentShader: `${GLSL_COMMON}${GLSL_SKY}
      varying vec3 vD;
      void main(){ gl_FragColor = vec4(skyCol(normalize(vD), 1.), 1.); }`,
  }));
  sky.renderOrder = -1; sky.frustumCulled = false;
  scene.add(sky);

  // ---- the painted leaf atlas: leaf cards, ground plants, the leaves on the facades and on the forest floor
  const leafTex = leafAtlas();
  leafTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  // ---- generate the city
  const R = rng(20871), D = rng(4410);          // R lays out the city, D decorates it, so planting never moves a building
  const boxes = [];          // x0, y0, z0, x1, y1, z1, seed, green
  const trees = [];          // x, y(base), z, crown radius, trunk height, palette
  const dist = (x, z) => Math.hypot(x - CAM.x, z - CAM.z);
  const box = (x0, y0, z0, x1, y1, z1, seed, green) => boxes.push([x0, y0, z0, x1, y1, z1, seed, green]);
  const inArc = (x, z) => Math.abs(x - ARCOLOGY.x) < ARCOLOGY.w / 2 + 4 && Math.abs(z - ARCOLOGY.z) < ARCOLOGY.d / 2 + 4;
  const tree = (x, y, z, rc, th, pal) => { if (y > 0 || (!inArc(x, z) && !(Math.abs(x - riverX(z)) < riverW(z) + rc + 1 && z > CAM.z - 40))) trees.push([x, y, z, rc, th, pal]); };
  const palette = () => { const r = D(); return r < 0.018 ? 4 : r < 0.03 ? 5 : r < 0.3 ? 1 : r < 0.48 ? 2 : r < 0.6 ? 3 : 0; };

  // trees on a flat roof or terrace, leaving out the footprint of the tier above
  function plant(x0, z0, x1, z1, y, hole, prob) {
    const d = dist((x0 + x1) / 2, (z0 + z1) / 2);
    if (d > 2300) return;
    const sp = clamp(6.5 + d / 140, 6.5, 22);
    for (let x = x0 + sp * 0.5; x < x1; x += sp) for (let z = z0 + sp * 0.5; z < z1; z += sp) {
      if (D() > prob) continue;
      const px = x + (D() - 0.5) * sp * 0.5, pz = z + (D() - 0.5) * sp * 0.5;
      const rc = sp * (0.42 + D() * 0.3);
      if (px - x0 < rc * 0.5 || x1 - px < rc * 0.5 || pz - z0 < rc * 0.5 || z1 - pz < rc * 0.5) continue;
      if (hole && px > hole[0] - rc * 0.6 && px < hole[1] + rc * 0.6 && pz > hole[2] - rc * 0.6 && pz < hole[3] + rc * 0.6) continue;
      tree(px, y, pz, rc, rc * (0.15 + D() * 0.35), palette());
    }
  }

  // hedges spilling over every parapet and, on the greenest buildings near the camera, planted balconies
  const shrubs = [];         // x, y, z, radius, y radius, palette
  const vines = [];          // x, y (top), z, length, width: hanging strands that sway
  const hedge = (ax, az, bx, bz, nx, nz, y, rMin, rMax, prob, out, drop) => {
    const L = Math.hypot(bx - ax, bz - az);
    for (let u = D() * rMin; u < L; u += (rMin + rMax) * 0.55 * (0.8 + D() * 0.5)) if (D() < prob) {
      const r = rMin + D() * (rMax - rMin), t = u / L;
      shrubs.push([ax + (bx - ax) * t + nx * r * out, y - r * drop * D(), az + (bz - az) * t + nz * r * out, r, r * 0.72, palette() & 3]);
    }
  };
  function overgrow([x0, x1, z0, z1, y0, y1], green, always = false) {
    const d = dist((x0 + x1) / 2, (z0 + z1) / 2);
    if (d > 1100 && !always) return;
    const k = 1 + d / 260;
    const sides = [[x0, z0, x1, z0, 0, -1], [x1, z1, x0, z1, 0, 1], [x0, z1, x0, z0, -1, 0], [x1, z0, x1, z1, 1, 0]];
    for (const [ax, az, bx, bz, nx, nz] of sides) {
      if (nx * (CAM.x - (ax + bx) / 2) + nz * (CAM.z - (az + bz) / 2) < 0) continue;     // faces the camera never sees
      hedge(ax, az, bx, bz, nx, nz, y1, 1.5 * k, 3.2 * k, Math.min(1, green + 0.2), 0.25, 0.6);
      // curtains of vines down the facade from the parapet, in clumps
      if (d < 650 && y1 - y0 > 6) {
        const L = Math.hypot(bx - ax, bz - az), ph = D() * 50;
        for (let u = 0.5; u < L; u += 0.9 + d / 300) {
          if (vnoise(u * 0.15 + ph) < 0.45 - green * 0.2) continue;
          const t = u / L, len = Math.min(y1 - 2, 1.5 + Math.pow(D(), 2.2) * (3 + 12 * green));
          vines.push([ax + (bx - ax) * t + nx * (0.4 + D() * 0.8), y1, az + (bz - az) * t + nz * (0.4 + D() * 0.8), len, (0.07 + D() * 0.1) * (1 + d / 250)]);
        }
      }
      // bushes spilling out just under the top of each tier: the walls themselves stay walls. (Every candidate still draws
      // from D, so the rest of the decoration does not move.)
      if (d < 650) {
        const L = Math.hypot(bx - ax, bz - az), sp = 7 + d / 90, ph = D() * 40;
        for (let u = sp * D(); u < L; u += sp * (0.6 + D() * 0.6)) for (let y = y0 + 4 + D() * sp; y < y1 - 3; y += sp * (0.6 + D() * 0.6)) {
          if (vn2(u * 0.06 + ph, y * 0.05) < 0.62 - green * 0.25) continue;
          const t = u / L, n = 1 + Math.floor(D() * 3), r0 = (1.6 + D() * 2.6) * (1 + d / 400), top = y > y1 - 9;
          for (let i = 0; i < n; i++) {
            const r = r0 * (0.6 + D() * 0.5);
            const e = [ax + (bx - ax) * t + nx * r * (0.5 + D() * 0.6) + (D() - 0.5) * r * Math.abs(nz) * 1.5, y + (D() - 0.3) * r,
              az + (bz - az) * t + nz * r * (0.5 + D() * 0.6) + (D() - 0.5) * r * Math.abs(nx) * 1.5, r, r * 0.75, palette() & 3];
            if (top) shrubs.push(e);
          }
          if (D() < 0.35) { const v = [ax + (bx - ax) * t + nx * r0, y, az + (bz - az) * t + nz * r0, Math.min(y - 1, 3 + D() * 8), (0.06 + D() * 0.08) * (1 + d / 250)]; if (top) vines.push(v); }
        }
      }
    }
  }

  // one building on a lot: a stack of tiers, planted on every setback
  const fronts = [];         // side, avenue-facing x, z0, z1, y0, y1 of every tier on the avenue
  let RB = R;                // the layout generator building() draws from; the far side of the camera gets its own, so the view ahead never changes
  function building(x0, x1, z0, z1, front, forced) {
    const seed = RB(), green = 0.6 + RB() * 0.4;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, far = dist(cx, cz);
    if (forced) {                                            // gondola station: one tall block flush with the avenue
      box(x0, 0, z0, x1, forced, z1, seed, green);
      fronts.push([Math.sign(cx), cx > 0 ? x0 : x1, z0, z1, 0, forced]);
      overgrow([x0, x1, z0, z1, 0, forced], green);
      plant(x0, z0, x1, z1, forced, null, 0.85);
      return;
    }
    let H = 22 + Math.pow(RB(), 1.6) * (front ? 175 : 135);
    if (RB() < 0.07) H += 80 + RB() * 130;
    if (far > 1500) H *= 1.3;
    const st = RB(), tiers = [];
    let a = [x0, x1, z0, z1], y = 0;
    const pod = H > 45 ? 6 + RB() * 12 : H;
    tiers.push([...a, 0, pod]); y = pod;
    const shrink = (lo, hi) => {
      const m = a.slice();
      for (let s = 0; s < 4; s++) if (RB() < 0.75) { const v = lo + RB() * (hi - lo); m[s] += s % 2 ? -v : v; }
      return m;
    };
    if (st < 0.32) {                                          // stepped terraces
      const step = 9 + RB() * 7;
      while (y < H - 4) {
        const m = shrink(2.5, 6);
        if (m[1] - m[0] < 12 || m[3] - m[2] < 12) break;
        a = m; tiers.push([...a, y, Math.min(H, y + step)]); y += step;
      }
    } else if (st < 0.78) {                                   // tower with a setback or two
      a = shrink(3, 11);
      const n = 1 + Math.floor(RB() * 3);
      for (let i = 0; i < n && a[1] - a[0] > 10 && a[3] - a[2] > 10; i++) {
        const top = i === n - 1 ? H : y + (H - y) * (0.45 + RB() * 0.3);
        tiers.push([...a, y, top]); y = top;
        a = shrink(2.5, 7);
      }
    } else {                                                  // slab
      const alongX = RB() < 0.5, w = 12 + RB() * 10;
      a = alongX ? [x0 + 3, x1 - 3, cz - w / 2, cz + w / 2] : [cx - w / 2, cx + w / 2, z0 + 3, z1 - 3];
      tiers.push([...a, y, H]);
    }
    tiers.forEach((t, i) => {
      box(t[0], t[4], t[2], t[1], t[5], t[3], seed, green);
      if (front) fronts.push([Math.sign(cx), cx > 0 ? t[0] : t[1], t[2], t[3], t[4], t[5]]);
      overgrow(t, green);
      const nx = tiers[i + 1];
      plant(t[0], t[2], t[1], t[3], t[5], nx ? [nx[0], nx[1], nx[2], nx[3]] : null, 0.97);
    });
  }

  // the city grid on both sides of the avenue
  for (let k = -1; ; k++) {
    const zc = -k * PITCH;
    if (zc < -2700) break;
    const z0 = zc - BLOCK / 2, z1 = zc + BLOCK / 2;
    for (const side of [-1, 1]) for (let j = 0; ; j++) {
      const xin = AVE + 4 + j * PITCH, xout = xin + BLOCK;
      if (xin > halfW(z0)) break;
      const [bx0, bx1] = side > 0 ? [xin, xout] : [-xout, -xin];
      if (Math.abs((bx0 + bx1) / 2 - ARCOLOGY.x) < ARCOLOGY.w / 2 + 40 && Math.abs(zc - ARCOLOGY.z) < ARCOLOGY.d / 2 + 40) continue;
      const r = R(), gap = () => 1 + R() * 4;
      const lots = r < 0.3 ? [[bx0, bx1, z0, z1]]
        : r < 0.7 ? [[bx0, bx1, z0, zc - gap()], [bx0, bx1, zc + gap(), z1]]
        : [[bx0, (bx0 + bx1) / 2 - gap(), z0, zc - gap()], [(bx0 + bx1) / 2 + gap(), bx1, z0, zc - gap()],
           [bx0, (bx0 + bx1) / 2 - gap(), zc + gap(), z1], [(bx0 + bx1) / 2 + gap(), bx1, zc + gap(), z1]];
      for (const l of lots) {
        const station = j === 0 && CABLE_Z > l[2] && CABLE_Z < l[3];
        building(l[0], l[1], l[2], l[3], j === 0, station ? CABLE_Y + 18 + R() * 30 : 0);
      }
    }
  }

  // arches of growth: braided lianas that left one facade and rooted in the opposite one, leafy along their backs,
  // hung with vines. Big ones span the avenue; smaller ones bridge the towers across every side street.
  const archGeos = [], archBlobs = [];
  const up = new THREE.Vector3(0, 1, 0);
  // the avenue-facing facade nearest the avenue around (z, y); steps along z in the direction dz, then down
  function anchor(side, z, y, dz = [0, 4, -4, 8, -8, 12, -12]) {
    for (let dy = 0; dy < 40; dy += 4) for (const o of dz) {
      let best = null;
      for (const [sd, xi, z0, z1, y0, y1] of fronts) if (sd === side && z + o > z0 + 1 && z + o < z1 - 1 && y - dy >= y0 && y - dy <= y1 - 2)
        if (best === null || (side > 0 ? xi < best : xi > best)) best = xi;
      if (best !== null) return new THREE.Vector3(best, y - dy, z + o);
    }
    return null;
  }
  function arch(A, B, lift, bulge, thick, leaf = 1) {
    if (!A || !B) return;
    const ph = D() * TAU, mid = (A.y + B.y) / 2;
    const P = (t, out = new THREE.Vector3()) => {
      const s = Math.sin(Math.PI * t);
      return out.lerpVectors(A, B, t).add(bulge.clone().multiplyScalar(s))
        .setY(A.y + (B.y - A.y) * t + (mid + lift - (A.y + B.y) / 2) * Math.pow(s, 0.75) + Math.sin(t * 9 + ph) * thick * 0.5 * s);
    };
    let len = 0; const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < 40; i++) len += P(i / 40, a).distanceTo(P((i + 1) / 40, b));
    const d = dist((A.x + B.x) / 2, (A.z + B.z) / 2), N = Math.ceil(len / 2.5), T = new THREE.Vector3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3();
    // the woody braid: strands twist around the arch and fan out where they grip the facades
    const strands = Math.min(8, Math.round(2 + thick * 1.3));
    for (let k = 0; k < strands; k++) {
      const sp = D() * TAU, turns = (1 + D() * 2) * len / 60, ro = thick * (0.4 + D() * 0.5), rad = thick * (0.22 + D() * 0.16);
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, c = P(t);
        T.subVectors(P(Math.min(1, t + 0.01), a), P(Math.max(0, t - 0.01), b)).normalize();
        n1.crossVectors(T, up).normalize(); n2.crossVectors(n1, T);
        const an = sp + t * turns * TAU, spread = ro * (0.7 + 1.6 * Math.pow(1 - Math.sin(Math.PI * t), 3));
        pts.push(c.addScaledVector(n1, Math.cos(an) * spread).addScaledVector(n2, Math.sin(an) * spread));
      }
      archGeos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N * 2, rad, 5));
    }
    // leaves wrapped around the braid, heaviest at the roots: many modest clumps, so a thick arch stays textured
    const rk = clamp(thick / 1.6, 0.6, 1.5) * (1 + d / 900);
    for (let u = 0; u < len; u += Math.max(1.6 * rk, 1.4) * (0.6 + D() * 0.5)) {
      const t = u / len, s = Math.sin(Math.PI * t), c = P(t, a);
      if (D() < s * 0.2 || D() > leaf * (0.3 + 1.4 * vnoise(u * 0.09 + ph))) continue;   // clumps, with gaps that show the braid
      T.subVectors(P(Math.min(1, t + 0.01), b), P(Math.max(0, t - 0.01), n2)).normalize();
      n1.crossVectors(T, up).normalize(); n2.crossVectors(n1, T);
      const ring = thick * (0.6 + (1 - s) * 0.8), per = 1 + Math.round(thick / 1.8);
      for (let j = 0; j < per; j++) {
        const an = D() * TAU, w = Math.sin(an) > -0.3 ? 1 : 0.6;   // mostly on the back and the flanks
        const r = (1.0 + D() * 1.3) * rk * (1 + (1 - s) * 0.6) * w;
        const q = c.clone().addScaledVector(n1, Math.cos(an) * ring).addScaledVector(n2, Math.abs(Math.sin(an)) * ring * 0.8 + r * 0.2);
        archBlobs.push([q.x, q.y, q.z, r, r * 0.72, palette() & 3]);
      }
    }
    // vines hanging from the underside
    for (let u = 1; u < len; u += 1.1 + d / 400) {
      const t = u / len; if (t < 0.05 || t > 0.95 || vnoise(u * 0.18 + ph) < 0.4 || D() > leaf + 0.3) continue;   // in clustered curtains
      const c = P(t, a), L = Math.min(c.y - 3, 1 + Math.pow(D(), 2.2) * 42 * Math.sin(Math.PI * t) * Math.min(2, thick / 1.6));
      if (L > 0.8) vines.push([c.x + (D() - 0.5) * thick * 2.4, c.y - thick * 0.2, c.z + (D() - 0.5) * thick * 2.4, L, (0.05 + D() * 0.08) * (1 + d / 250)]);
    }
  }
  // across the avenue: [z on the left, z on the right, height left, height right, rise, sideways sway, thickness].
  // The first frames the whole picture; diagonals cross each other so the vault reads as woven, not as a row of gates.
  // Every span also sends a root-trunk down its facade to the ground, so the growth visibly comes from the street.
  const root = (A, side, th) => A && A.y > 12 && arch(new THREE.Vector3(A.x, 0, A.z + (D() - 0.5) * 10), A, 0, new THREE.Vector3(-side * (2 + D() * 3), 0, 0), th);
  const VAULT = [
    [-18, -42, 30, 22, 66, 6, 4.4],
    [-105, -140, 44, 28, 52, 10, 3.4], [-210, -168, 22, 62, 82, -18, 4.0], [-250, -385, 38, 84, 58, 0, 3.0],
    [-335, -298, 104, 92, 40, 10, 2.6], [-430, -470, 28, 40, 96, 0, 4.2], [-520, -610, 72, 48, 52, -10, 3.0],
    [-640, -600, 124, 140, 44, 0, 2.8], [-700, -790, 40, 58, 112, 15, 4.6], [-860, -905, 58, 72, 74, 16, 3.2],
    [-960, -1000, 30, 50, 118, 0, 4.2],
    [-150, -255, 150, 172, 36, 0, 2.6], [-485, -415, 182, 160, 48, 0, 3.0], [-780, -700, 200, 176, 40, 0, 3.0],   // between the crowns
  ];
  const vault = (zl, zr, yl, yr, lift, sway, th) => {
    const A = anchor(-1, zl, yl), B = anchor(1, zr, yr);
    if (!A || !B) return;
    arch(A, B, lift, new THREE.Vector3(0, 0, sway), th);
    root(A, -1, th * 0.75); root(B, 1, th * 0.75);
  };
  for (const v of VAULT) vault(...v);
  // a web of lianas strung across the avenue at every height, sagging under their own leaves
  for (let i = 0; i < 48; i++) {
    const z = CAM.z - 95 - Math.pow(D(), 1.3) * 950, y = 16 + D() * 150;
    arch(anchor(-1, z + (D() - 0.5) * 30, y), anchor(1, z + (D() - 0.5) * 30, y + (D() - 0.5) * 30),
      -(4 + D() * 18), new THREE.Vector3(0, 0, (D() - 0.5) * 16), 0.5 + D() * 0.8, 0.7);
  }
  // along the canyon walls, every side street is bridged: arches, sagging lianas, and green bridges from roof to roof
  const topAt = (side, z) => { let t = 0; for (const [sd, , z0, z1, , y1] of fronts) if (sd === side && z > z0 + 1 && z < z1 - 1) t = Math.max(t, y1); return t; };
  const sideStreets = (k) => {
    const zc = -k * PITCH, za = zc - BLOCK / 2 + 1, zb = zc - PITCH + BLOCK / 2 - 1;
    for (const side of [-1, 1]) {
      for (let n = 0; n < 5; n++) {
        if (D() > [1, 0.95, 0.8, 0.65, 0.5][n]) continue;
        const y = 12 + D() * 130, liana = n % 2 === 1;
        arch(anchor(side, za, y, [0, 3, 6, 10]), anchor(side, zb, y + (D() - 0.5) * 20, [0, -3, -6, -10]),
          liana ? -(2 + D() * 6) : 4 + D() * 10, new THREE.Vector3(-side * (2 + D() * 5), 0, 0), liana ? 0.4 + D() * 0.5 : 1.2 + D() * 1.2, liana ? 0.6 : 1);
      }
      const h = Math.min(topAt(side, za + 3), topAt(side, zb - 3));
      if (h > 30 && D() < 0.75) arch(anchor(side, za, h - 3, [0, 3, 6]), anchor(side, zb, h - 3, [0, -3, -6]), 3 + D() * 4, new THREE.Vector3(-side * 3, 0, 0), 2.6 + D() * 1.2);
    }
  };
  for (let k = 0; k < 12; k++) sideStreets(k);                    // not right beside the lens

  // the canopy roof: from the tower tops on one side to the other, a ragged ceiling of leaves over the avenue, hung with
  // vines. Torn open where the sun looks in, with smaller tears that let shafts of light down; it ends ~700 m out,
  // so the far avenue glows like the end of a tunnel.
  {
    const topSm = (side, z) => { let sum = 0, n = 0; for (let o = -30; o <= 30; o += 10) { const t = topAt(side, z + o); if (t > 0) { sum += t; n++; } } return n ? sum / n : 0; };
    const eyes = [CAM, new THREE.Vector3(STREET.x, STREET.y, CAM.z)], v = new THREE.Vector3();
    const sunHole = (x, y, z, r) => eyes.some((c) => { v.set(x - c.x, y - c.y, z - c.z); const l = v.length(); return v.dot(SUN_DIR) / l > Math.cos(0.045 + 0.7 * r / l); });
    for (let z = CAM.z + 30; z > -740; z -= 5.5 + D() * 3) {
      const hl = clamp(topSm(-1, z) || 70, 50, 175), hr = clamp(topSm(1, z) || 70, 50, 175), sag = 6 + 12 * vn2(z * 0.01, 3);
      const edge = smooth(-740, -520, z);                                // the far edge frays
      for (let x = -AVE - 70; x < AVE + 70; x += 5.5 + D() * 3) {
        // over the avenue it hangs from tower top to tower top; beyond the facades it rides on the roofs
        const t = clamp((x + AVE + 8) / (2 * AVE + 16), 0, 1), roof = Math.abs(x) > AVE + 8;
        let y = roof ? (x < 0 ? hl : hr) + 4 : hl + (hr - hl) * t - Math.sin(Math.PI * t) * sag;
        y += (vn2(x * 0.05, z * 0.05) - 0.5) * 14;
        if (z > CAM.z - 140) y = Math.max(y, 88 + (z - (CAM.z - 140)) * 0.2);   // keep it off the lens
        if (vn2(x * 0.045 + 7, z * 0.03) < 0.3 + (1 - edge) * 0.45) continue;   // tears for shafts of light
        const r = 6 + D() * 5;
        if (sunHole(x, y, z, r)) continue;
        archBlobs.push([x + (D() - 0.5) * 4, y, z + (D() - 0.5) * 4, r, r * 0.45, palette() & 3]);
        if (D() < 0.6) archBlobs.push([x + (D() - 0.5) * 6, y + r * 0.35, z + (D() - 0.5) * 6, r * 0.8, r * 0.4, palette() & 3]);
        if (D() < 0.5) archBlobs.push([x + (D() - 0.5) * 6, y - r * 0.3, z + (D() - 0.5) * 6, r * 0.55, r * 0.5, palette() & 3]);   // lumps underneath
        for (let i = 0; i < 2; i++) if (D() < 0.6)
          vines.push([x + (D() - 0.5) * r * 1.6, y - r * 0.3, z + (D() - 0.5) * r * 1.6, 2 + Math.pow(D(), 2) * Math.min(y - 8, 45), (0.07 + D() * 0.12) * (1 + dist(x, z) / 250)]);
      }
    }
  }

  // megatrees standing in the avenue forest: braided trunks, vast crowns, aerial roots dropping to the ground
  const MEGA = [[-30, -150, 80, 30], [31, -240, 98, 34], [-28, -335, 110, 36], [34, -430, 92, 32], [-33, -540, 118, 38],
    [30, -640, 104, 36], [-31, -735, 96, 34], [34, -830, 112, 38], [-30, -930, 100, 34]];
  const megatree = ([x, z, H, Rc]) => {
    const top = new THREE.Vector3(x + (D() - 0.5) * 8, H, z + (D() - 0.5) * 8);
    arch(new THREE.Vector3(x, 0, z), top, 0, new THREE.Vector3(-Math.sign(x) * 4, 0, 4), 4.2);
    for (let i = 0; i < 4; i++) {                                  // buttress roots
      const a = i / 4 * TAU + D();
      arch(new THREE.Vector3(x + Math.cos(a) * 14, 0, z + Math.sin(a) * 14), new THREE.Vector3(x, H * (0.3 + D() * 0.25), z), 2, new THREE.Vector3(Math.cos(a) * 3, 0, Math.sin(a) * 3), 1.8);
    }
    const d = dist(x, z);
    for (let i = 0; i < 190; i++) {                                // the crown: wide, flat-bottomed, domed on top, ragged at the rim
      const a = D() * TAU, r = Math.sqrt(D()) * Rc * (0.85 + 0.3 * vnoise(a * 2 + x)), h = Math.max(0, 1 - (r / Rc) ** 2) * Rc * 0.35;
      const s = (4.5 + D() * 5) * (1 + d / 900);
      archBlobs.push([top.x + Math.cos(a) * r, H + h * D() - 2, top.z + Math.sin(a) * r, s, s * 0.7, palette() & 3]);
      if (D() < 0.85) vines.push([top.x + Math.cos(a) * r, H - 4, top.z + Math.sin(a) * r, (H - 4) * (D() < 0.3 ? 1 : 0.2 + D() * 0.6), (0.12 + D() * 0.25) * (1 + d / 250)]);
    }
  };
  MEGA.forEach(megatree);

  // the arcology at the end of the view: a terraced mountain of a building, hedged on every step
  {
    const { x, z, w, d, h } = ARCOLOGY, n = 18;
    let a = [x - w / 2, x + w / 2, z - d / 2, z + d / 2];
    for (let i = 0; i < n; i++) {
      const y0 = i * h / n, y1 = (i + 1) * h / n;
      const nx = [a[0] + 3 + R() * 7, a[1] - 3 - R() * 7, a[2] + 3 + R() * 5, a[3] - 4 - R() * 8];
      box(a[0], y0, a[2], a[1], y1, a[3], 0.43, 1);
      overgrow([a[0], a[1], a[2], a[3], y0, y1], 1, true);
      plant(a[0], a[2], a[1], a[3], y1, i < n - 1 ? nx : null, 0.9);
      a = nx;
    }
  }
  // far megatowers fading into the haze
  for (let i = 0; i < 16; i++) {
    const z = -1800 - R() * 1300, x = (R() - 0.5) * halfW(z) * 1.6, w = 50 + R() * 70, H = 260 + R() * 420;
    if (Math.abs(x) < AVE + 30) continue;
    let a = [x - w / 2, x + w / 2, z - w / 2, z + w / 2], y = 0, s = R();
    const nt = 3 + Math.floor(R() * 4);
    for (let t = 0; t < nt; t++) {
      const top = y + (H - y) * (t === nt - 1 ? 1 : 0.35 + R() * 0.3);
      box(a[0], y, a[2], a[1], top, a[3], s, 0.8);
      const nx = [a[0] + 4 + R() * 8, a[1] - 4 - R() * 8, a[2] + 4 + R() * 8, a[3] - 4 - R() * 8];
      plant(a[0], a[2], a[1], a[3], top, t < nt - 1 ? nx : null, 0.9);
      a = nx; y = top;
    }
  }

  // the avenue: a layered jungle instead of rows. Emergent giants, a closed canopy, an understory below it.
  const dry = (x, z, m) => Math.abs(x - riverX(z)) > riverW(z) + m && Math.abs(x) < AVE - 1;
  for (let z = CAM.z + 40; z > -2300; z -= 1.3 + D() * 1.2) {
    const x = (D() * 2 - 1) * (AVE - 2), l = D();
    if (!dry(x, z, l < 0.4 ? 0.5 : 2.5)) continue;
    if (l < 0.06 && z < CAM.z - 120) tree(x, 0, z, 9 + D() * 6, 18 + D() * 14, palette());
    else if (l < 0.6) tree(x, 0, z, 5 + D() * 3.5, 6 + D() * 8, palette());
    else if (dist(x, z) < 900) tree(x, 0, z, 2 + D() * 2, 1 + D() * 3, palette() & 3);
  }
  // undergrowth along the banks, close enough to see between the trunks
  for (const side of [-1, 1]) for (let z = CAM.z + 20; z > -600; z -= 1.6 + D() * 2) {
    const x = riverX(z) + side * (riverW(z) + 0.8 + D() * 30);
    if (dry(x, z, 0.5)) tree(x, 0, z, 1.4 + D() * 1.8, 0, palette() & 3);
  }
  // cross streets near the camera are planted too
  for (let k = -1; k < 9; k++) {
    const zs = -k * PITCH - PITCH / 2;
    for (const side of [-1, 1]) for (let x = AVE + 8; x < halfW(zs); x += 10 + D() * 5) tree(side * x, 0, zs + (D() - 0.5) * 6, 4 + D() * 3, 6 + D() * 6, palette());
  }

  // ---- behind the camera and beside it: the city goes on all around, so the view can turn through a full circle. It draws
  // from its own generator (RB) and runs after everything ahead has been generated, so the picture ahead never changes.
  {
    RB = rng(9100);
    const halfWB = (z) => Math.max(170, 70 + Math.abs(CAM.z - z));
    for (let k = -18; k <= 1; k++) {
      const zc = -k * PITCH, z0 = zc - BLOCK / 2, z1 = zc + BLOCK / 2;
      for (const side of [-1, 1]) for (let j = 0; ; j++) {
        const xin = AVE + 4 + j * PITCH, xout = xin + BLOCK;
        if (xin > halfWB(z0)) break;
        if (k >= -1 && xin <= halfW(z0)) continue;                 // already built ahead
        const [bx0, bx1] = side > 0 ? [xin, xout] : [-xout, -xin];
        const r = RB(), gap = () => 1 + RB() * 4;
        const lots = r < 0.3 ? [[bx0, bx1, z0, z1]]
          : r < 0.7 ? [[bx0, bx1, z0, zc - gap()], [bx0, bx1, zc + gap(), z1]]
          : [[bx0, (bx0 + bx1) / 2 - gap(), z0, zc - gap()], [(bx0 + bx1) / 2 + gap(), bx1, z0, zc - gap()],
             [bx0, (bx0 + bx1) / 2 - gap(), zc + gap(), z1], [(bx0 + bx1) / 2 + gap(), bx1, zc + gap(), z1]];
        for (const l of lots) building(l[0], l[1], l[2], l[3], j === 0, 0);
      }
    }
    RB = R;
    // the vault, the web of lianas, the side-street bridges and the megatrees, mirrored over the camera
    const mz = (z) => 2 * CAM.z - z;
    for (const [zl, zr, yl, yr, lift, sway, th] of VAULT) vault(mz(zl), mz(zr), yl, yr, lift, -sway, th);
    for (let i = 0; i < 28; i++) {
      const z = CAM.z + 95 + Math.pow(D(), 1.3) * 900, y = 16 + D() * 150;
      arch(anchor(-1, z + (D() - 0.5) * 30, y), anchor(1, z + (D() - 0.5) * 30, y + (D() - 0.5) * 30),
        -(4 + D() * 18), new THREE.Vector3(0, 0, (D() - 0.5) * 16), 0.5 + D() * 0.8, 0.7);
    }
    for (let k = -2; k > -13; k--) sideStreets(k);
    MEGA.forEach(([x, z, H, Rc]) => megatree([-x, mz(z), H, Rc]));
    // the canopy roof, as ahead: tower top to tower top, ragged, fraying ~800 m out
    {
      const topSm = (side, z) => { let sum = 0, n = 0; for (let o = -30; o <= 30; o += 10) { const t = topAt(side, z + o); if (t > 0) { sum += t; n++; } } return n ? sum / n : 0; };
      for (let z = CAM.z + 36; z < CAM.z + 900; z += 5.5 + D() * 3) {
        const hl = clamp(topSm(-1, z) || 70, 50, 175), hr = clamp(topSm(1, z) || 70, 50, 175), sag = 6 + 12 * vn2(z * 0.01, 3);
        const edge = smooth(CAM.z + 860, CAM.z + 620, z);
        for (let x = -AVE - 70; x < AVE + 70; x += 5.5 + D() * 3) {
          const t = clamp((x + AVE + 8) / (2 * AVE + 16), 0, 1), roof = Math.abs(x) > AVE + 8;
          let y = roof ? (x < 0 ? hl : hr) + 4 : hl + (hr - hl) * t - Math.sin(Math.PI * t) * sag;
          y += (vn2(x * 0.05, z * 0.05) - 0.5) * 14;
          if (z < CAM.z + 140) y = Math.max(y, 88 + (CAM.z + 140 - z) * 0.2);
          if (vn2(x * 0.045 + 7, z * 0.03) < 0.3 + (1 - edge) * 0.45) continue;
          const r = 6 + D() * 5;
          archBlobs.push([x + (D() - 0.5) * 4, y, z + (D() - 0.5) * 4, r, r * 0.45, palette() & 3]);
          if (D() < 0.6) archBlobs.push([x + (D() - 0.5) * 6, y + r * 0.35, z + (D() - 0.5) * 6, r * 0.8, r * 0.4, palette() & 3]);
          if (D() < 0.5) archBlobs.push([x + (D() - 0.5) * 6, y - r * 0.3, z + (D() - 0.5) * 6, r * 0.55, r * 0.5, palette() & 3]);
          for (let i = 0; i < 2; i++) if (D() < 0.6)
            vines.push([x + (D() - 0.5) * r * 1.6, y - r * 0.3, z + (D() - 0.5) * r * 1.6, 2 + Math.pow(D(), 2) * Math.min(y - 8, 45), (0.07 + D() * 0.12) * (1 + dist(x, z) / 250)]);
        }
      }
    }
    // the jungle floor, the banks, the cross streets
    const dry = (x, z, m) => Math.abs(x - riverX(z)) > riverW(z) + m && Math.abs(x) < AVE - 1;
    for (let z = CAM.z + 41; z < CAM.z + 1620; z += 1.3 + D() * 1.2) {
      const x = (D() * 2 - 1) * (AVE - 2), l = D();
      if (!dry(x, z, l < 0.4 ? 0.5 : 2.5)) continue;
      if (l < 0.06 && z > CAM.z + 120) tree(x, 0, z, 9 + D() * 6, 18 + D() * 14, palette());
      else if (l < 0.6) tree(x, 0, z, 5 + D() * 3.5, 6 + D() * 8, palette());
      else if (dist(x, z) < 900) tree(x, 0, z, 2 + D() * 2, 1 + D() * 3, palette() & 3);
    }
    for (const side of [-1, 1]) for (let z = CAM.z + 22; z < CAM.z + 600; z += 1.6 + D() * 2) {
      const x = riverX(z) + side * (riverW(z) + 0.8 + D() * 30);
      if (dry(x, z, 0.5)) tree(x, 0, z, 1.4 + D() * 1.8, 0, palette() & 3);
    }
    for (let k = -2; k > -9; k--) {
      const zs = -k * PITCH - PITCH / 2;
      for (const side of [-1, 1]) for (let x = AVE + 8; x < halfWB(zs); x += 10 + D() * 5) tree(side * x, 0, zs + (D() - 0.5) * 6, 4 + D() * 3, 6 + D() * 6, palette());
    }
    // far megatowers on this side of the horizon too
    RB = rng(9200);
    for (let i = 0; i < 12; i++) {
      const z = 1900 + RB() * 1300, x = (RB() - 0.5) * (70 + Math.abs(z - CAM.z)) * 1.4, w = 50 + RB() * 70, H = 260 + RB() * 420;
      if (Math.abs(x) < AVE + 30) continue;
      let a = [x - w / 2, x + w / 2, z - w / 2, z + w / 2], y = 0;
      const s0 = RB(), nt = 3 + Math.floor(RB() * 4);
      for (let t = 0; t < nt; t++) {
        const top = y + (H - y) * (t === nt - 1 ? 1 : 0.35 + RB() * 0.3);
        box(a[0], y, a[2], a[1], top, a[3], s0, 0.8);
        const nx = [a[0] + 4 + RB() * 8, a[1] - 4 - RB() * 8, a[2] + 4 + RB() * 8, a[3] - 4 - RB() * 8];
        plant(a[0], a[2], a[1], a[3], top, t < nt - 1 ? nx : null, 0.9);
        a = nx; y = top;
      }
    }
    RB = R;
  }

  // ---- the highway: an elevated viaduct on piers through the cross street, across the whole city, and an arch bridge
  // where it crosses the river, its ribs wrapped in lianas. Pods, vans and buses glide along it.
  const DECK = HWY.y, HW = HWY.hw, HZ = HWY.z, { x0: HX0, x1: HX1 } = HWY;
  const cxr = riverX(HZ), hwr = riverW(HZ), SPAN = hwr + 9;       // the river span: abutments this far from the middle
  const keep = (arr, f) => { let j = 0; for (const e of arr) if (f(e)) arr[j++] = e; arr.length = j; };
  {
    // nothing grows through the deck: clear the slot of what the generator put there, then plant it on purpose
    const inSlot = (z, y, r) => Math.abs(z - HZ) < HW + 1.2 + r && y < DECK + 9;
    keep(trees, ([, y, z, rc]) => !inSlot(z, y, rc * 0.7));
    keep(shrubs, ([, y, z, r]) => !inSlot(z, y - r, r * 0.8));
    keep(archBlobs, ([, y, z, r]) => !inSlot(z, y - r, r * 0.8));
    keep(vines, ([, y, z, L]) => !(Math.abs(z - HZ) < HW + 0.3 && y > DECK - 2 && y - L < DECK + 3));
  }
  const hwBoxes = [];        // x0, y0, z0, x1, y1, z1, kind
  const hb = (x0, y0, z0, x1, y1, z1, k) => hwBoxes.push([x0, y0, z0, x1, y1, z1, k]);
  hb(HX0, DECK - 1.4, HZ - HW, HX1, DECK, HZ + HW, 0);                                    // the deck
  hb(HX0, DECK - 1.9, HZ - HW - 0.35, HX1, DECK - 1.4, HZ - HW + 0.5, 2);                // fascia beams
  hb(HX0, DECK - 1.9, HZ + HW - 0.5, HX1, DECK - 1.4, HZ + HW + 0.35, 2);
  hb(HX0, DECK, HZ - HW, HX1, DECK + 1.05, HZ - HW + 0.5, 1);                             // parapets
  hb(HX0, DECK, HZ + HW - 0.5, HX1, DECK + 1.05, HZ + HW, 1);
  hb(HX0, DECK, HZ - 0.45, HX1, DECK + 0.8, HZ + 0.45, 1);                                // the median
  for (let x = HX0 + 11; x < HX1; x += 26) {                                              // hammerhead piers
    if (Math.abs(x - cxr) < SPAN + 5) continue;
    hb(x - 1.5, -3, HZ - 1.2, x + 1.5, DECK - 3.4, HZ + 1.2, 2);
    hb(x - 1.9, DECK - 3.4, HZ - 3.6, x + 1.9, DECK - 2.4, HZ + 3.6, 2);
    hb(x - 1.9, DECK - 2.4, HZ - 7.6, x + 1.9, DECK - 1.4, HZ + 7.6, 2);
  }
  for (const s of [-1, 1]) hb(cxr + s * SPAN - 1.8, -3, HZ - HW + 0.2, cxr + s * SPAN + 1.8, DECK - 1.4, HZ + HW - 0.2, 2);   // abutments
  const hwGeos = [];
  const addK = (g, k) => { g.setAttribute("aK", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(k), 1)); hwGeos.push(g); };
  const RISE = 12.5, ribY = (t) => DECK + RISE * Math.pow(Math.sin(Math.PI * t), 0.75);
  for (const s of [-1, 1]) {
    const zz = HZ + s * (HW + 0.1), pts = [];
    for (let i = 0; i <= 48; i++) { const t = i / 48; pts.push(new THREE.Vector3(cxr - SPAN + 2 * SPAN * t, ribY(t), zz)); }
    addK(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.55, 8), 3);
    for (let t = 0.055; t < 0.95; t += 2.8 / (2 * SPAN)) {                                // hangers from the rib to the deck edge
      const y = ribY(t), x = cxr - SPAN + 2 * SPAN * t;
      addK(new THREE.CylinderGeometry(0.06, 0.06, y - DECK, 4).translate(x, DECK + (y - DECK) / 2, zz), 3);
    }
    arch(new THREE.Vector3(cxr - SPAN, DECK, zz), new THREE.Vector3(cxr + SPAN, DECK, zz), RISE, new THREE.Vector3(0, 0, 0), 0.9, 0.85);   // lianas wrapped round the rib
  }
  for (let t = 0.2; t < 0.81; t += 0.085) {                                              // cross-bracing between the ribs, above the traffic
    const y = ribY(t); if (y < DECK + 7.4) continue;
    addK(new THREE.CylinderGeometry(0.26, 0.26, 2 * HW + 0.2, 6).rotateX(Math.PI / 2).translate(cxr - SPAN + 2 * SPAN * t, y - 0.4, HZ), 3);
  }
  // growth: hedges spilling over the parapets, vines hanging from the deck edge, a planted median, ground cover under the viaduct
  hedge(HX0, HZ + HW, HX1, HZ + HW, 0, 1, DECK + 0.9, 0.35, 0.95, 0.5, 0.2, 0.5);
  hedge(HX0, HZ - HW, HX1, HZ - HW, 0, -1, DECK + 0.9, 0.35, 0.95, 0.5, 0.2, 0.5);
  for (let x = HX0; x < HX1; x += 1.6 + D() * 1.4) if (D() < 0.6) { const r = 0.35 + D() * 0.4; shrubs.push([x, DECK + 0.6 + r * 0.3, HZ + (D() - 0.5) * 0.4, r, r * 0.8, palette() & 3]); }
  for (let x = HX0 + 8; x < HX1; x += 15 + D() * 11) if (Math.abs(x - cxr) < SPAN - 4 || D() < 0.9) trees.push([x, DECK + 0.8, HZ, 2.3 + D() * 0.8, 3.8, palette() & 3]);
  for (const s of [-1, 1]) for (let x = HX0; x < HX1; x += 1.2 + D() * 1.3) {
    if (vnoise(x * 0.11 + s * 7) < 0.4) continue;
    vines.push([x, DECK - 0.4, HZ + s * (HW + 0.2 + D() * 0.6), 2 + Math.pow(D(), 1.6) * 15, 0.06 + D() * 0.09]);
  }
  for (let x = HX0; x < HX1; x += 2.2 + D() * 2.5) {
    if (Math.abs(x - cxr) < hwr + 3 || D() < 0.25) continue;
    const r = 1.2 + D() * 1.8; shrubs.push([x, 0.4 + r * 0.2, HZ + (D() - 0.5) * 15, r, r * 0.8, palette() & 3]);
  }
  {
    const mat = patch(new THREE.MeshStandardMaterial({ roughness: 0.9 }), "shade-highway", HIGHWAY);
    const P = [], N = [], K = [], I = [];
    const face = (o, ux, uy, n, k) => {
      const i0 = P.length / 3;
      P.push(o[0], o[1], o[2], o[0] + ux[0], o[1] + ux[1], o[2] + ux[2], o[0] + ux[0] + uy[0], o[1] + ux[1] + uy[1], o[2] + ux[2] + uy[2], o[0] + uy[0], o[1] + uy[1], o[2] + uy[2]);
      for (let j = 0; j < 4; j++) { N.push(...n); K.push(k); }
      I.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    };
    for (const [x0, y0, z0, x1, y1, z1, k] of hwBoxes) {
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
      face([x0, y1, z1], [dx, 0, 0], [0, 0, -dz], [0, 1, 0], k);
      face([x0, y0, z0], [dx, 0, 0], [0, 0, dz], [0, -1, 0], k);
      face([x0, y0, z1], [dx, 0, 0], [0, dy, 0], [0, 0, 1], k);
      face([x1, y0, z0], [-dx, 0, 0], [0, dy, 0], [0, 0, -1], k);
      face([x1, y0, z1], [0, 0, -dz], [0, dy, 0], [1, 0, 0], k);
      face([x0, y0, z0], [0, 0, dz], [0, dy, 0], [-1, 0, 0], k);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute("aK", new THREE.Float32BufferAttribute(K, 1)); g.setIndex(I);
    const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; scene.add(m);
    // ribs and hangers: one merged mesh
    let nv = 0, ni = 0;
    for (const t of hwGeos) { nv += t.attributes.position.count; ni += t.index.count; }
    const p2 = new Float32Array(nv * 3), n2 = new Float32Array(nv * 3), k2 = new Float32Array(nv), i2 = new Uint32Array(ni);
    let ov = 0, oi = 0;
    for (const t of hwGeos) {
      p2.set(t.attributes.position.array, ov * 3); n2.set(t.attributes.normal.array, ov * 3); k2.set(t.attributes.aK.array, ov);
      const idx = t.index.array; for (let i = 0; i < idx.length; i++) i2[oi + i] = idx[i] + ov;
      ov += t.attributes.position.count; oi += idx.length; t.dispose();
    }
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute("position", new THREE.BufferAttribute(p2, 3)); g2.setAttribute("normal", new THREE.BufferAttribute(n2, 3));
    g2.setAttribute("aK", new THREE.BufferAttribute(k2, 1)); g2.setIndex(new THREE.BufferAttribute(i2, 1));
    const m2 = new THREE.Mesh(g2, mat); m2.castShadow = m2.receiveShadow = true; scene.add(m2);
  }

  // traffic: platoons in four lanes, left to right on the near side and right to left on the far side
  const vehicles = [];
  const traffic = (() => {
    // a smooth closed loft along x: at every station a superellipse ring (exponent p) from bottom to top, narrowing toward
    // the top by `tumble`; stations [x, bottom, top, half width] are resampled and smoothed so the body has no kinks
    const P = [], A = [], I = [];
    const loft = (pts, p, tumble, part, n = 26, ns = 22) => {
      let st = [];
      for (let i = 0; i < n; i++) {
        const x = pts[0][0] + (pts[pts.length - 1][0] - pts[0][0]) * i / (n - 1);
        let k = 0; while (k < pts.length - 2 && x > pts[k + 1][0]) k++;
        const a = pts[k], b = pts[k + 1], t = clamp((x - a[0]) / (b[0] - a[0]), 0, 1);
        st.push([x, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]);
      }
      for (let it = 0; it < 2; it++) st = st.map((e, i) => i === 0 || i === n - 1 ? e : [e[0], ...[1, 2, 3].map((c) => (st[i - 1][c] + 2 * e[c] + st[i + 1][c]) / 4)]);
      const base = P.length / 3;
      for (const [x, y0, y1, hw] of st) for (let j = 0; j < ns; j++) {
        const th = j / ns * TAU, c = Math.cos(th), s = Math.sin(th);
        const ex = Math.sign(c) * Math.pow(Math.abs(c), 2 / p), ey = Math.sign(s) * Math.pow(Math.abs(s), 2 / p);
        P.push(x, (y0 + y1) / 2 + (y1 - y0) / 2 * ey, hw * ex * (1 - tumble * Math.max(0, ey))); A.push(part);
      }
      for (let i = 0; i < n - 1; i++) for (let j = 0; j < ns; j++) {
        const a = base + i * ns + j, b = base + i * ns + (j + 1) % ns;
        I.push(a, a + ns, b, b, a + ns, b + ns);
      }
      for (const [i, dir] of [[0, -1], [n - 1, 1]]) {                 // caps, on their own vertices so the sides keep their normals
        const [x, y0, y1] = st[i], ci = P.length / 3; P.push(x + dir * 0.004, (y0 + y1) / 2, 0); A.push(part);
        for (let j = 0; j < ns; j++) { const o = (base + i * ns + j) * 3; P.push(P[o], P[o + 1], P[o + 2]); A.push(part); }
        for (let j = 0; j < ns; j++) { const a = ci + 1 + j, b = ci + 1 + (j + 1) % ns; if (dir > 0) I.push(ci, b, a); else I.push(ci, a, b); }
      }
    };
    const block = (x0, y0, z0, x1, y1, z1, part) => {                 // a small box: mirrors, roof pods, bumpers
      const b = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), o = P.length / 3;
      P.push(...b.attributes.position.array); for (let i = 0; i < b.attributes.position.count; i++) A.push(part);
      for (const k of b.index.array) I.push(k + o);
    };
    const build = () => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("aV", new THREE.Float32BufferAttribute(A, 1)); g.setIndex(I);
      g.computeVertexNormals(); P.length = A.length = I.length = 0;
      return g;
    };
    const mirrors = (x, y, hw) => { for (const s of [-1, 1]) { block(x - 0.12, y + 0.03, s * hw - 0.02 + (s > 0 ? 0 : -0.15), x + 0.03, y + 0.14, s * hw + 0.02 + (s > 0 ? 0.15 : 0), 0); block(x - 0.06, y, s * hw - 0.03 + (s > 0 ? 0 : -0.06), x + 0.01, y + 0.04, s * hw + 0.03 + (s > 0 ? 0.06 : 0), 2); } };
    // [geometry, uAx (front axle, rear axle, wheel radius, half track), uB (front, rear, belt, kind), uLt (lamp bands), uD (door lines, handle height), length, width, height]
    const TYPES = [];
    const type = (g, ax, b, lt, d, wheelW) => TYPES.push({ g, ax, b, lt, d, wheelW, len: b[0] - b[1], hw: ax[3] + wheelW / 2, hgt: 0 });
    // hatchback
    loft([[-2.02, 0.44, 0.84, 0.70], [-1.96, 0.32, 0.96, 0.85], [-1.8, 0.26, 0.99, 0.89], [-1.3, 0.24, 1.0, 0.9], [0, 0.24, 0.98, 0.9], [1.0, 0.24, 0.94, 0.9], [1.5, 0.25, 0.88, 0.88], [1.85, 0.28, 0.8, 0.84], [1.98, 0.34, 0.72, 0.77], [2.03, 0.42, 0.62, 0.66]], 5, 0.04, 0);
    loft([[-1.95, 0.84, 0.95, 0.72], [-1.9, 0.84, 1.3, 0.74], [-1.72, 0.84, 1.44, 0.75], [-1.2, 0.84, 1.5, 0.76], [0.1, 0.84, 1.51, 0.76], [0.5, 0.83, 1.46, 0.76], [0.85, 0.82, 1.24, 0.76], [1.12, 0.8, 0.98, 0.75], [1.18, 0.8, 0.86, 0.72]], 4.5, 0.2, 1, 24);
    mirrors(0.95, 0.95, 0.86);
    type(build(), [1.3, -1.27, 0.33, 0.79], [2.03, -2.02, 0.98, 0], [0.68, 0.8, 0.8, 0.92], [0.98, -0.15, -1.3, 0.86], 0.22);
    // saloon
    loft([[-2.4, 0.44, 0.86, 0.72], [-2.33, 0.32, 0.95, 0.86], [-2.1, 0.27, 0.98, 0.9], [-1.4, 0.24, 0.98, 0.92], [0, 0.23, 0.96, 0.92], [1.2, 0.23, 0.92, 0.92], [1.8, 0.24, 0.85, 0.9], [2.2, 0.27, 0.77, 0.86], [2.35, 0.34, 0.7, 0.78], [2.4, 0.42, 0.6, 0.66]], 5, 0.04, 0);
    loft([[-1.6, 0.82, 0.93, 0.72], [-1.45, 0.82, 1.12, 0.74], [-1.15, 0.82, 1.36, 0.76], [-0.6, 0.82, 1.44, 0.77], [0.25, 0.82, 1.44, 0.77], [0.75, 0.81, 1.3, 0.77], [1.15, 0.8, 1.04, 0.76], [1.38, 0.79, 0.9, 0.74]], 4.5, 0.2, 1, 24);
    mirrors(1.15, 0.93, 0.88);
    type(build(), [1.45, -1.4, 0.33, 0.8], [2.4, -2.4, 0.96, 0], [0.66, 0.78, 0.76, 0.88], [1.2, -0.05, -1.0, 0.84], 0.23);
    // crossover
    loft([[-2.27, 0.5, 0.98, 0.76], [-2.22, 0.38, 1.1, 0.88], [-2.05, 0.33, 1.12, 0.93], [-1.4, 0.32, 1.12, 0.95], [0, 0.32, 1.1, 0.95], [1.2, 0.32, 1.04, 0.95], [1.75, 0.33, 1.0, 0.93], [2.1, 0.36, 0.92, 0.88], [2.24, 0.42, 0.84, 0.8], [2.28, 0.5, 0.74, 0.7]], 5, 0.04, 0);
    loft([[-2.18, 0.98, 1.1, 0.76], [-2.12, 0.98, 1.48, 0.79], [-1.9, 0.98, 1.64, 0.8], [0, 0.98, 1.68, 0.81], [0.55, 0.97, 1.62, 0.81], [0.95, 0.96, 1.4, 0.8], [1.25, 0.95, 1.13, 0.79], [1.32, 0.95, 1.0, 0.76]], 4.5, 0.18, 1, 24);
    mirrors(1.1, 1.08, 0.92);
    for (const s of [-1, 1]) block(-1.9, 1.69, s * 0.62 - 0.03, 0.6, 1.73, s * 0.62 + 0.03, 2);   // roof rails
    type(build(), [1.4, -1.35, 0.37, 0.82], [2.28, -2.27, 1.1, 0], [0.78, 0.9, 0.9, 1.02], [1.15, -0.1, -1.3, 0.98], 0.24);
    // van
    loft([[-2.65, 0.4, 2.0, 0.88], [-2.6, 0.32, 2.12, 0.98], [-2.4, 0.3, 2.18, 1.0], [1.2, 0.3, 2.18, 1.0], [1.7, 0.3, 2.1, 1.0], [2.15, 0.31, 1.62, 0.99], [2.45, 0.33, 1.2, 0.96], [2.6, 0.38, 1.0, 0.9], [2.66, 0.45, 0.82, 0.8]], 6, 0.03, 0, 30);
    mirrors(1.75, 1.3, 0.99);
    type(build(), [1.75, -1.65, 0.36, 0.86], [2.66, -2.65, 1.2, 1], [0.7, 0.9, 1.0, 1.28], [1.5, 0.35, -2.0, 1.1], 0.24);
    // bus, with battery pods on its roof
    loft([[-6.0, 0.4, 3.0, 1.15], [-5.95, 0.32, 3.12, 1.24], [-5.8, 0.3, 3.18, 1.25], [5.7, 0.3, 3.18, 1.25], [5.92, 0.32, 3.1, 1.24], [6.0, 0.4, 2.9, 1.15]], 10, 0.02, 0, 20, 24);
    block(1.6, 3.12, -0.85, 4.6, 3.42, 0.85, 2); block(-5.6, 3.12, -0.7, -3.4, 3.38, 0.7, 2);
    mirrors(5.9, 2.4, 1.24);
    type(build(), [4.2, -2.7, 0.5, 1.0], [6.0, -6.0, 1.0, 2], [0.5, 0.78, 0.6, 1.0], [0, 0, 0, 0], 0.32);
    // box truck: a cab, the chassis, the cargo box
    loft([[1.85, 0.45, 2.7, 1.1], [1.95, 0.4, 2.82, 1.18], [3.5, 0.4, 2.86, 1.2], [3.95, 0.42, 2.6, 1.2], [4.08, 0.45, 2.0, 1.18], [4.12, 0.5, 1.0, 1.12]], 6, 0.04, 0, 28);
    loft([[-4.1, 0.95, 3.6, 1.24], [-4.05, 0.9, 3.65, 1.25], [1.75, 0.9, 3.65, 1.25], [1.8, 0.95, 3.6, 1.24]], 16, 0, 3, 8, 32);
    block(-4.0, 0.5, -0.5, 1.95, 0.95, 0.5, 2);
    mirrors(3.9, 2.0, 1.2);
    type(build(), [3.3, -2.6, 0.5, 1.0], [4.12, -4.1, 1.5, 3], [0.55, 0.75, 1.0, 1.25], [0, 0, 0, 0], 0.32);
    TYPES.forEach((t, i) => { t.hgt = [1.51, 1.44, 1.68, 2.18, 3.4, 3.65][i]; });

    // sun-faded but real paint: whites, silvers, greys, black, deep blue, red, sage, teal, sand, ochre
    const PAINT = [[0.70, 0.70, 0.68], [0.72, 0.71, 0.69], [0.42, 0.43, 0.44], [0.2, 0.21, 0.22], [0.025, 0.025, 0.028], [0.03, 0.07, 0.17], [0.4, 0.035, 0.03], [0.27, 0.33, 0.26], [0.06, 0.2, 0.21], [0.5, 0.43, 0.32], [0.55, 0.36, 0.06]];
    const BUSC = [[0.62, 0.64, 0.6], [0.12, 0.32, 0.18], [0.7, 0.42, 0.08]];
    const LANES = [[2.5, 1, 21], [5.7, 1, 14.5], [-2.5, -1, 18], [-5.7, -1, 12.5]];       // lane's offset from the middle, direction, speed (m/s)
    const V = rng(5150);
    for (const [lz, dir, sp] of LANES) {
      for (let x = HX0 + V() * 20; x < HX1 - 14;) {
        const r = V(), type = r < 0.24 ? 0 : r < 0.46 ? 1 : r < 0.64 ? 2 : r < 0.8 ? 3 : r < 0.9 ? 4 : 5;
        const pal = type === 4 ? BUSC : PAINT, col = pal[Math.floor(V() * pal.length)].map((c) => c * (0.92 + V() * 0.12));
        vehicles.push({ lz, dir, sp, type, len: TYPES[type].len, x0: x, col });
        x += TYPES[type].len + 12 + V() * 30;
      }
    }
    const meshes = TYPES.map((t, k) => {
      const list = vehicles.filter((v) => v.type === k);
      const mat = patch(new THREE.MeshStandardMaterial({ roughness: 0.3 }), "shade-vehicle", { ...VEHICLE, uniforms: {
        uAx: { value: new THREE.Vector4(...t.ax) }, uB: { value: new THREE.Vector4(...t.b) }, uLt: { value: new THREE.Vector4(...t.lt) }, uD: { value: new THREE.Vector4(...t.d) } } });
      const im = new THREE.InstancedMesh(t.g, mat, Math.max(1, list.length)), c = new THREE.Color();
      list.forEach((v, i) => { v.slot = i; im.setColorAt(i, c.setRGB(v.col[0], v.col[1], v.col[2], THREE.LinearSRGBColorSpace)); });
      im.count = list.length; im.frustumCulled = false; im.receiveShadow = true; scene.add(im);
      return im;
    });
    // wheels: one lathe per size; the spin follows each vehicle's speed
    const wheelGeo = (R, w) => {
      const Rr = R * 0.62, h = w / 2, pts = [[0.001, h - 0.03], [Rr * 0.25, h - 0.025], [Rr, h - 0.01], [Rr + 0.012, h - 0.025], [R - 0.045, h], [R - 0.012, h - 0.03], [R, h - 0.06], [R, -h + 0.06], [R - 0.012, -h + 0.03], [R - 0.045, -h], [Rr, -h], [0.001, -h + 0.01]];
      return new THREE.LatheGeometry(pts.reverse().map(([a, b]) => new THREE.Vector2(a, b)), 18);     // bottom to top, so the faces point out
    };
    const wheelSets = [];
    for (const R of [0.33, 0.36, 0.37, 0.5]) {
      const list = [];
      vehicles.forEach((v) => { const t = TYPES[v.type]; if (t.ax[2] === R) for (const ax of [t.ax[0], t.ax[1]]) for (const s of [-1, 1]) list.push({ v, ax, s, w: t.wheelW * (R === 0.5 && ax < 0 ? 1.6 : 1) }); });
      if (!list.length) continue;
      const g = wheelGeo(R, 0.24), spin = new Float32Array(list.length);
      list.forEach((e, i) => { spin[i] = -e.v.sp / R; });
      g.setAttribute("aSpin", new THREE.InstancedBufferAttribute(spin, 1));
      const mat = patch(new THREE.MeshStandardMaterial({ roughness: 0.9 }), "shade-wheel", { ...WHEEL, uniforms: { uWR: { value: new THREE.Vector2(R, R * 0.62) } } });
      const im = new THREE.InstancedMesh(g, mat, list.length);
      im.frustumCulled = false; im.receiveShadow = true; scene.add(im);
      wheelSets.push({ im, list });
    }
    // shadows: one quad per vehicle covering its footprint and the shadow the sun throws toward the camera
    const sdW = new THREE.Vector2(-SUN_DIR.x, -SUN_DIR.z).multiplyScalar(1 / SUN_DIR.y);   // ground offset per metre of height
    const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const BX = new Float32Array(vehicles.length * 4), SH = new Float32Array(vehicles.length * 4), SD = new Float32Array(vehicles.length * 2);
    vehicles.forEach((v, i) => {
      const t = TYPES[v.type], hl = t.len / 2 - 0.1, hw = t.hw - 0.12, sx = sdW.x * v.dir, sz = sdW.y * v.dir;   // the sun's push, in the vehicle's frame
      const ex = sx * t.hgt * 0.9, ez = sz * t.hgt * 0.9;
      const x0 = Math.min(-hl, -hl + ex) - 0.6, x1 = Math.max(hl, hl + ex) + 0.6, z0 = Math.min(-hw, -hw + ez) - 0.6, z1 = Math.max(hw, hw + ez) + 0.6;
      BX.set([(x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0], i * 4); SH.set([hl, hw, t.hgt * 0.9, 0], i * 4); SD.set([sx, sz], i * 2);
    });
    blobGeo.setAttribute("aBox", new THREE.InstancedBufferAttribute(BX, 4));
    blobGeo.setAttribute("aSh", new THREE.InstancedBufferAttribute(SH, 4));
    blobGeo.setAttribute("aSd", new THREE.InstancedBufferAttribute(SD, 2));
    const blobs = new THREE.InstancedMesh(blobGeo, new THREE.ShaderMaterial({ ...SHADOW_BLOB, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), vehicles.length);
    blobs.frustumCulled = false; blobs.renderOrder = 2; scene.add(blobs);
    const m = new THREE.Matrix4(), mw = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    const flip = new THREE.Matrix4().makeRotationX(Math.PI / 2), flipIn = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    const Lw = HX1 - HX0 - 20;
    return (t) => {
      vehicles.forEach((v, i) => {
        const u = (((v.x0 - HX0 + v.dir * v.sp * t) % Lw) + Lw) % Lw;
        q.setFromAxisAngle(up, v.dir > 0 ? 0 : Math.PI);
        v.m = (v.m || new THREE.Matrix4()).compose(pos.set(HX0 + 10 + u, DECK + 0.02, HZ + v.lz), q, one);
        meshes[v.type].setMatrixAt(v.slot, v.m);
        m.copy(v.m).elements[13] = DECK + 0.05;
        blobs.setMatrixAt(i, m);
      });
      for (const { im, list } of wheelSets) {
        list.forEach((e, i) => {
          const R = TYPES[e.v.type].ax[2], tr = TYPES[e.v.type].ax[3];
          mw.makeScale(1, e.w / 0.24, 1).premultiply(e.s > 0 ? flip : flipIn).setPosition(e.ax, R, e.s * tr);   // the lathe's axis turned across the vehicle, the outer face out
          im.setMatrixAt(i, m.multiplyMatrices(e.v.m, mw));
        });
        im.instanceMatrix.needsUpdate = true;
      }
      meshes.forEach((im) => { im.instanceMatrix.needsUpdate = true; });
      blobs.instanceMatrix.needsUpdate = true;
    };
  })();

  // ---- buildings mesh
  {
    const P = [], N = [], B = [], I = [];
    const face = (o, ux, uy, n, b) => {
      const i0 = P.length / 3;
      P.push(o[0], o[1], o[2], o[0] + ux[0], o[1] + ux[1], o[2] + ux[2], o[0] + ux[0] + uy[0], o[1] + ux[1] + uy[1], o[2] + ux[2] + uy[2], o[0] + uy[0], o[1] + uy[1], o[2] + uy[2]);
      for (let k = 0; k < 4; k++) { N.push(...n); B.push(...b); }
      I.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    };
    for (const [x0, y0, z0, x1, y1, z1, s, g] of boxes) {
      const b = [s, y1, y0, g], dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
      face([x0, y1, z1], [dx, 0, 0], [0, 0, -dz], [0, 1, 0], b);     // top
      face([x0, y0, z1], [dx, 0, 0], [0, dy, 0], [0, 0, 1], b);      // +z
      face([x1, y0, z0], [-dx, 0, 0], [0, dy, 0], [0, 0, -1], b);    // -z
      face([x1, y0, z1], [0, 0, -dz], [0, dy, 0], [1, 0, 0], b);     // +x
      face([x0, y0, z0], [0, 0, dz], [0, dy, 0], [-1, 0, 0], b);     // -x
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute("aB", new THREE.Float32BufferAttribute(B, 4));
    g.setIndex(I);
    const m = new THREE.Mesh(g, patch(new THREE.MeshStandardMaterial({ roughness: 0.9 }), "shade-building", { ...BUILDING, uniforms: { uLeafTex: { value: leafTex } } }));
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }

  // ---- foliage: every tree is a few lumpy blobs; one instanced mesh for the whole city
  const PAL = [
    [0.055, 0.11, 0.028], [0.10, 0.16, 0.035], [0.05, 0.10, 0.06], [0.12, 0.14, 0.065],
    [0.17, 0.09, 0.24], [0.30, 0.10, 0.035],      // jacaranda, flame tree
  ];
  const blobGeo = (() => {
    const g = new THREE.SphereGeometry(1, 12, 8), p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = Math.sin(v.x * 3.1 + 1.3) * Math.sin(v.y * 2.7 + 0.4) * Math.sin(v.z * 3.3 + 2.1);
      v.multiplyScalar(1 + n * 0.16 + Math.sin(v.x * 7 + v.z * 5) * 0.04);
      if (v.y < -0.3) v.y = -0.3 + (v.y + 0.3) * 0.6;      // crowns are flatter underneath
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  })();
  // the city all round the camera is far more than one view needs: every instanced mesh is cut into compass sectors, and
  // each frame only the ones the camera can be facing are drawn (what is within NEAR metres is always drawn)
  const NS = 16, NEAR = 90, sectorMeshes = [];
  const secOf = (x, z) => Math.hypot(x - CAM.x, z - CAM.z) < NEAR ? -1 : Math.floor((((Math.atan2(x - CAM.x, CAM.z - z) / TAU) % 1) + 1) % 1 * NS) % NS;
  const bySector = (list) => { const m = new Map(); for (const e of list) { const k = secOf(e[0], e[2]); (m.get(k) || m.set(k, []).get(k)).push(e); } return m; };
  const addSector = (mesh, s) => { scene.add(mesh); sectorMeshes.push({ mesh, s }); return mesh; };
  let nBlobs = 0, nShrubs = 0;
  const blobs = [];
  for (const [x, y, z, rc, th, pal] of trees) {
    const d = dist(x, z), nb = d < 300 ? 7 : d < 600 ? 4 : d < 1100 ? 2 : 1;
    const cy = y + th + rc * 0.6;
    blobs.push([x, cy, z, rc, rc * 0.7, pal]);
    for (let i = 1; i < nb; i++) {
      const a = D() * TAU, r = rc * (0.5 + D() * 0.35), s = rc * (0.5 + D() * 0.25);
      blobs.push([x + Math.cos(a) * r, cy + (D() - 0.55) * rc * 0.45, z + Math.sin(a) * r, s, s * 0.75, pal]);
    }
  }
  blobs.push(...archBlobs);
  nBlobs = blobs.length;
  const CARD_R = LITE ? 160 : 260;
  const foliageMat = patch(new THREE.MeshStandardMaterial({ roughness: 0.62 }), "shade-foliage", { ...FOLIAGE, uniforms: { uCardR: { value: CARD_R } } });
  // near crowns keep the finer blob; far ones and the facade shrubs use a low-poly one (the leaf shading hides it)
  const lowGeo = new THREE.IcosahedronGeometry(1, 1), farGeo = new THREE.SphereGeometry(1, 7, 4);
  const shellA = cardShell(56, 0.5, 11), shellB = cardShell(120, 0.34, 12);
  const TILE = [0, 1, 3, 0, 1, 1];          // per palette: broad, small, heart, broad; the flowering trees small-leaved
  // map and alphaTest are there for the shadow pass (three gives them to its depth material); the colour pass reads the texture itself
  const CUTOUT = ["map_fragment", "alphatest_fragment"];
  const leafMat = patch(new THREE.MeshStandardMaterial({ roughness: 0.42, side: THREE.DoubleSide, blending: THREE.NoBlending, alphaToCoverage: true, map: leafTex, alphaTest: 0.5 }), "shade-leafcard",
    { ...LEAFCARD, uniforms: { uLeafTex: { value: leafTex }, uCardR: { value: CARD_R } }, strip: CUTOUT });
  let nCards = 0, nGround = 0;
  function foliageMesh(all, geo, rot) {
    for (const [sec, list] of bySector(all)) {
      const im = new THREE.InstancedMesh(geo, foliageMat, list.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color(), s = new THREE.Vector3(), p = new THREE.Vector3();
      const near = [];
      list.forEach(([x, y, z, r, ry, pal], i) => {
        e.set(rot ? (D() - 0.5) * 0.3 : 0, D() * TAU, rot ? (D() - 0.5) * 0.3 : 0); q.setFromEuler(e);
        im.setMatrixAt(i, m.compose(p.set(x, y, z), q, s.set(r, ry, r)));
        const b = PAL[pal], k = 0.8 + D() * 0.4;
        im.setColorAt(i, c.setRGB(b[0] * k, b[1] * k, b[2] * k * (0.9 + D() * 0.2), THREE.LinearSRGBColorSpace));
        if (dist(x, z) < CARD_R) near.push([m.clone(), c.clone(), r, pal, h1(x * 0.37 + z * 1.71)]);
      });
      im.castShadow = im.receiveShadow = true;
      im.computeBoundingSphere();
      addSector(im, sec);
      // the leaf cards round the near ones: the big crowns get a denser shell of smaller cards
      for (const big of [false, true]) {
        const sel = near.filter((n) => (n[2] > 5.5) === big);
        if (!sel.length) continue;
        const base = big ? shellB : shellA, g = new THREE.BufferGeometry(), T = new Float32Array(sel.length * 2);
        for (const k in base.attributes) g.setAttribute(k, base.attributes[k]);
        g.setIndex(base.index);
        sel.forEach(([, , r, pal, h], i) => { const t = r < 3.5 && h < 0.3 ? 3 : TILE[pal]; T[i * 2] = t & 1; T[i * 2 + 1] = t >> 1; });   // some shrubs are big-leaved
        g.setAttribute("aTile", new THREE.InstancedBufferAttribute(T, 2));
        const cm = new THREE.InstancedMesh(g, leafMat, sel.length);
        sel.forEach(([mm, cc], i) => { cm.setMatrixAt(i, mm); cm.setColorAt(i, cc); });
        cm.castShadow = cm.receiveShadow = true;
        cm.computeBoundingSphere();
        addSector(cm, sec);
        nCards += sel.length * (big ? 120 : 56);
      }
    }
  }
  const mid = (b) => { const d = dist(b[0], b[2]); return d >= CARD_R * 0.72 && d < 420; };    // nearer, the leaf cards make the silhouette
  foliageMesh(blobs.filter(mid), blobGeo, true);
  const far = (b) => dist(b[0], b[2]) > 1000;
  foliageMesh(blobs.filter((b) => !mid(b) && !far(b)).concat(shrubs), lowGeo, true);
  foliageMesh(blobs.filter(far), farGeo, true);
  nShrubs = shrubs.length;

  // trunks (only for trees near enough to show one) and the arches' braids share one bark
  const bark = patch(new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(1, 1, 1, THREE.LinearSRGBColorSpace), roughness: 0.95 }), "shade-bark", {
    frag: `float barkH(vec3 p){ return (1. - abs(2. * n3(p * vec3(5.5, 1.3, 5.5)) - 1.)) * 0.65 + (1. - abs(2. * n3(p * 15.) - 1.)) * 0.35; }`,
    color: `
    vec3 bN = normalize(vWN);
    float bh = barkH(vW);
    vec3 b = mix(vec3(0.035, 0.03, 0.024), vec3(0.14, 0.115, 0.082), bh);                                       // furrowed bark
    b = mix(b, vec3(0.22, 0.22, 0.18), smoothstep(0.74, 0.9, n3(vW * 2.1 + 4.)) * 0.4);                         // lichen
    float moss = smoothstep(0.05, 0.55, bN.y + (n3(vW * 1.3) - 0.5) * 0.9) * smoothstep(0.35, 0.6, n3(vW * 0.7 + 2.));
    moss = max(moss, smoothstep(0.62, 0.8, n3(vW * 0.45 + 9.)) * 0.7);
    diffuseColor.rgb = mix(b, vec3(0.03, 0.075, 0.02) * (0.5 + bh), moss * 0.8);
    rough = mix(0.95, 0.8, moss);`,
    normal: `
    float e = 0.07, h0 = barkH(vW);
    vec3 bg = vec3(barkH(vW + vec3(e, 0., 0.)) - h0, barkH(vW + vec3(0., e, 0.)) - h0, barkH(vW + vec3(0., 0., e)) - h0) / e;
    nW = normalize(nW - (bg - nW * dot(bg, nW)) * 0.12);`,
  });
  {
    const near = trees.filter(([x, , z, , th]) => dist(x, z) < 900 && th > 3);
    const trunkGeo = new THREE.CylinderGeometry(0.55, 1, 1, 7, 1, true).translate(0, 0.5, 0), m = new THREE.Matrix4();
    for (const [sec, list] of bySector(near)) {
      const tm = new THREE.InstancedMesh(trunkGeo, bark, list.length);
      list.forEach(([x, y, z, rc, th], i) => { const r = 0.12 * rc + 0.15; m.makeScale(r, th + rc * 0.6, r).setPosition(x, y, z); tm.setMatrixAt(i, m); });
      tm.castShadow = tm.receiveShadow = true;
      tm.computeBoundingSphere();
      addSector(tm, sec);
    }
  }
  {
    // one merged mesh for every braid in a sector
    const groups = new Map();
    for (const g of archGeos) {
      g.computeBoundingSphere();
      const c = g.boundingSphere.center, k = secOf(c.x, c.z);
      (groups.get(k) || groups.set(k, []).get(k)).push(g);
    }
    for (const [sec, list] of groups) {
      let nv = 0, ni = 0;
      for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
      const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), I = new Uint32Array(ni);
      let ov = 0, oi = 0;
      for (const g of list) {
        P.set(g.attributes.position.array, ov * 3); N.set(g.attributes.normal.array, ov * 3);
        const idx = g.index.array; for (let i = 0; i < idx.length; i++) I[oi + i] = idx[i] + ov;
        ov += g.attributes.position.count; oi += idx.length; g.dispose();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(P, 3)); g.setAttribute("normal", new THREE.BufferAttribute(N, 3)); g.setIndex(new THREE.BufferAttribute(I, 1));
      const m = new THREE.Mesh(g, bark); m.castShadow = m.receiveShadow = true;
      addSector(m, sec);
    }
  }
  {
    const vineGeo = new THREE.CylinderGeometry(1, 0.5, 1, 4, 6, true).translate(0, -0.5, 0), m = new THREE.Matrix4();
    const vineMat = patch(new THREE.MeshStandardMaterial({ roughness: 0.75, side: THREE.DoubleSide }), "shade-vine", VINE);
    // near the camera a vine is two crossed ribbons of leaves; further off, a plain strand
    const ribbonGeo = (() => {
      const P = [], N = [], UV = [], I = [], n = 10;
      for (const ax of [0, 1]) for (let j = 0; j <= n; j++) for (const u of [0, 1]) {
        const o = u - 0.5, y = -j / n;
        P.push(ax ? 0 : o, y, ax ? -o : 0); N.push(ax ? 1 : 0, 0, ax ? 0 : 1); UV.push(u, 1 - j / n);
        if (j < n && u === 0) { const a = P.length / 3 - 1; I.push(a, a + 3, a + 1, a, a + 2, a + 3); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I);
      return g;
    })();
    const vineTex = vineStrand();
    const ribbonMat = patch(new THREE.MeshStandardMaterial({ roughness: 0.45, side: THREE.DoubleSide, blending: THREE.NoBlending, alphaToCoverage: true, map: vineTex, alphaTest: 0.5 }), "shade-vineleaf",
      { ...VINELEAF, uniforms: { uVineTex: { value: vineTex } }, strip: CUTOUT });
    const RIB_R = LITE ? 120 : 210;
    for (const ribbon of [false, true]) for (const [sec, list] of bySector(vines.filter((v) => (dist(v[0], v[2]) < RIB_R) === ribbon))) {
      const vm = new THREE.InstancedMesh(ribbon ? ribbonGeo : vineGeo, ribbon ? ribbonMat : vineMat, list.length);
      list.forEach(([x, y, z, L, w], i) => { const W = ribbon ? clamp(0.4 + w * 2.6, 0.45, 1.0) : w; vm.setMatrixAt(i, m.makeScale(W, L, W).setPosition(x, y, z)); });
      vm.castShadow = true; vm.receiveShadow = true;
      vm.computeBoundingSphere();
      addSector(vm, sec);
    }
  }

  // ---- ground: the avenue is a mesh with the river's bed and banks cut in; flat planes beyond it
  const groundMat = patch(new THREE.MeshStandardMaterial({ roughness: 0.95 }), "shade-ground", { ...GROUND, uniforms: { uLeafTex: { value: leafTex } } });
  const GX = AVE + 12, Z0 = CAM.z + 1500, Z1 = -2500, waterVP = { value: new THREE.Matrix4() };
  const groundY = (x, z) => {
    const d = Math.abs(x - riverX(z)) / riverW(z);
    let y = -2.6 * (1 - smooth(0.45, 1.3, d));                                       // bed and sloping banks
    y += (vn2(x * 0.3, z * 0.3) - 0.5) * 0.9 * smooth(0.6, 1.0, d) * (1 - smooth(1.2, 1.8, d));   // ragged shoreline
    y += (vn2(x * 0.06 + 5, z * 0.06) - 0.5) * 1.2 * smooth(1.3, 2.2, d) * (1 - smooth(AVE - 4, GX, Math.abs(x)));   // low mounds
    return y;
  };
  {
    const nx = Math.round(2 * GX / 1.5), nz = Math.round((Z0 - Z1) / 2.5);
    const P = new Float32Array((nx + 1) * (nz + 1) * 3), I = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = -GX + 2 * GX * i / nx, z = Z0 - (Z0 - Z1) * j / nz, o = (j * (nx + 1) + i) * 3;
      P[o] = x; P[o + 1] = groundY(x, z); P[o + 2] = z;
      if (i < nx && j < nz) { const a = j * (nx + 1) + i; I.push(a, a + 1, a + nx + 1, a + 1, a + nx + 2, a + nx + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    const m = new THREE.Mesh(g, groundMat); m.receiveShadow = true; scene.add(m);
  }
  for (const side of [-1, 1]) {
    const g = new THREE.PlaneGeometry(3000, 9000).rotateX(-Math.PI / 2).translate(side * (GX + 1500), 0, -1500);
    const m = new THREE.Mesh(g, groundMat); m.receiveShadow = true; scene.add(m);
  }
  {
    // the water: a strip along the river's line, a little wider than its banks so the shore is where the ground rises out
    const n = Math.round((Z0 - Z1) / 3), P = new Float32Array((n + 1) * 2 * 3), N = new Float32Array((n + 1) * 2 * 3), I = [];
    for (let j = 0; j <= n; j++) {
      const z = Z0 - (Z0 - Z1) * j / n, cx = riverX(z), hw = riverW(z) * 1.4;
      P.set([cx - hw, WATER_Y, z, cx + hw, WATER_Y, z], j * 6); N.set([0, 1, 0, 0, 1, 0], j * 6);
      if (j < n) I.push(j * 2, j * 2 + 1, j * 2 + 2, j * 2 + 1, j * 2 + 3, j * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(P, 3)); g.setAttribute("normal", new THREE.BufferAttribute(N, 3)); g.setIndex(I);
    const m = new THREE.Mesh(g, patch(new THREE.MeshStandardMaterial({ roughness: 0.04 }), "shade-water", { ...WATER, uniforms: { uPrev: post.prev, uVP: waterVP } })); m.receiveShadow = true; scene.add(m);
  }

  // ---- ground cover near the camera: grass down to the water, reeds standing in the shallows, ferns and broad-leaved
  // plants on the forest floor. Their own generator, so nothing else moves.
  {
    const G = rng(8080), grass = [], plants = [], GN = LITE ? 0.4 : 1;
    const zNear = () => CAM.z + 50 - Math.pow(G(), 1.7) * 330;            // densest near the camera
    for (let i = 0; i < 17000 * GN; i++) {                                       // grass on the banks and up into the forest
      const z = zNear(), side = G() < 0.5 ? -1 : 1, dn = 1.08 + Math.pow(G(), 2) * 2.2, x = riverX(z) + side * riverW(z) * dn;
      if (Math.abs(x) > AVE - 1 || vn2(x * 0.15, z * 0.15) < 0.2 + 0.15 * (dn - 1)) continue;
      const h = (0.35 + G() * 0.5) * (1.25 - 0.2 * dn);
      grass.push([x, groundY(x, z) - 0.08, z, 1.0 + G() * 0.8, h, 0]);
    }
    for (let i = 0; i < 2600 * GN; i++) {                                        // reeds in clumps at the waterline
      const z = zNear(), side = G() < 0.5 ? -1 : 1, dn = 0.9 + G() * 0.24, x = riverX(z) + side * riverW(z) * dn;
      if (vn2(x * 0.08 + 3, z * 0.08) < 0.52) continue;
      grass.push([x, Math.min(groundY(x, z), -0.3) - 0.1, z, 0.5 + G() * 0.4, 1.3 + G() * 1.1, 1]);
    }
    for (let i = 0; i < 4200 * GN; i++) {                                        // the forest floor
      const z = CAM.z + 40 - Math.pow(G(), 1.4) * 260, x = (G() * 2 - 1) * (AVE - 2);
      if (Math.abs(x - riverX(z)) < riverW(z) * 1.3) continue;
      const y = groundY(x, z);
      if (G() < 0.55) plants.push([x, y - 0.05, z, 0.8 + G() * 1.3, 0.7 + G() * 0.5, G() < 0.6 ? 2 : 3]);
      else grass.push([x, y - 0.08, z, 0.6 + G() * 0.5, 0.25 + G() * 0.35, 0]);
    }
    // a tuft: blades leaning out from a small base, bending more toward the tip; aH runs 0 at the root to 1 at the tip
    const tuftGeo = (n, seed) => {
      const r = rng(seed), P = [], N = [], H = [], I = [];
      for (let b = 0; b < n; b++) {
        const a = r() * TAU, lean = 0.15 + r() * 0.5, hb = 0.6 + r() * 0.4, wd = 0.022 + r() * 0.018, ox = (r() - 0.5) * 0.3, oz = (r() - 0.5) * 0.3, tw = r() * TAU;
        const dx = Math.cos(a), dz = Math.sin(a), wx = Math.cos(tw), wz = Math.sin(tw), i0 = P.length / 3, segs = 3;
        for (let k = 0; k <= segs; k++) {
          const t = k / segs, y = hb * t, out = lean * t * t * hb, w = wd * (1 - t * 0.85);
          const cx = ox + dx * out, cz = oz + dz * out;
          P.push(cx - wx * w, y, cz - wz * w, cx + wx * w, y, cz + wz * w);
          for (let j = 0; j < 2; j++) { N.push(-wz, 0.3, wx); H.push(t); }
          if (k < segs) { const q = i0 + k * 2; I.push(q, q + 1, q + 3, q, q + 3, q + 2); }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute("aH", new THREE.Float32BufferAttribute(H, 1)); g.setIndex(I);
      return g;
    };
    const tufts = [tuftGeo(10, 3), tuftGeo(7, 4)];
    const grassMat = patch(new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide }), "shade-grass", GRASS);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    for (const [sec, list] of bySector(grass)) for (const reed of [0, 1]) {
      const sel = list.filter((g) => g[5] === reed);
      if (!sel.length) continue;
      const im = new THREE.InstancedMesh(tufts[reed], grassMat, sel.length);
      sel.forEach(([x, y, z, s, h], i) => { e.set(0, G() * TAU, 0); im.setMatrixAt(i, m.compose(ps.set(x, y, z), q.setFromEuler(e), sc.set(s, h, s))); });
      im.receiveShadow = true; im.computeBoundingSphere();
      addSector(im, sec);
    }
    // plants: six half-cards fanning out from the root, leaning outward, showing the fern or the big-leaved plant
    const plantGeo = (() => {
      const P = [], N = [], UV = [], CT = [], CB = [], CC = [], I = [], r = rng(6);
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * TAU + (r() - 0.5) * 0.5, dx = Math.cos(a), dz = Math.sin(a), t = 0.3 + r() * 0.3, len = 0.8 + r() * 0.3;
        const B = new THREE.Vector3(dx * t, 1, dz * t).normalize(), i0 = P.length / 3;
        for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
          P.push(dx * (u * len + t * v), v * (1 - 0.2 * u), dz * (u * len + t * v));
          N.push(dx * 0.5, 1, dz * 0.5); UV.push(u * 0.98 + 0.01, v); CT.push(dx, 0, dz); CB.push(B.x, B.y, B.z); CC.push(0, 0.4, 0);
        }
        I.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2)); g.setAttribute("aCT", new THREE.Float32BufferAttribute(CT, 3));
      g.setAttribute("aCB", new THREE.Float32BufferAttribute(CB, 3)); g.setAttribute("aCC", new THREE.Float32BufferAttribute(CC, 3)); g.setIndex(I);
      return g;
    })();
    const c = new THREE.Color();
    for (const [sec, list] of bySector(plants)) {
      const g = new THREE.BufferGeometry(), T = new Float32Array(list.length * 2);
      for (const k in plantGeo.attributes) g.setAttribute(k, plantGeo.attributes[k]);
      g.setIndex(plantGeo.index);
      list.forEach(([, , , , , t], i) => { T[i * 2] = t & 1; T[i * 2 + 1] = t >> 1; });
      g.setAttribute("aTile", new THREE.InstancedBufferAttribute(T, 2));
      const im = new THREE.InstancedMesh(g, leafMat, list.length);
      list.forEach(([x, y, z, s, h, t], i) => {
        e.set(0, G() * TAU, 0);
        im.setMatrixAt(i, m.compose(ps.set(x, y, z), q.setFromEuler(e), sc.set(s, s * h, s)));
        const k = 0.7 + G() * 0.5;
        im.setColorAt(i, t === 2 ? c.setRGB(0.07 * k, 0.12 * k, 0.03 * k, THREE.LinearSRGBColorSpace) : c.setRGB(0.05 * k, 0.1 * k, 0.035 * k, THREE.LinearSRGBColorSpace));
      });
      im.receiveShadow = true; im.computeBoundingSphere();
      addSector(im, sec);
    }
    nGround = grass.length + plants.length;
  }

  // ---- gondolas: two cables across the avenue, cabins gliding between the station towers
  const cables = [];
  {
    const cableMat = patch(new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.5 }), "shade-cable");
    const cabMat = patch(new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.55, 0.52, 0.46, THREE.LinearSRGBColorSpace), roughness: 0.4 }), "shade-cab");
    const glassMat = patch(new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.03, 0.04, 0.045, THREE.LinearSRGBColorSpace), roughness: 0.1 }), "shade-cabglass");
    for (const [dz, dir] of [[-3.5, 1], [3.5, -1]]) {
      const pts = [], X0 = -AVE - 4, X1 = AVE + 4;
      const yAt = (x) => CABLE_Y - 5 * (1 - ((x - (X0 + X1) / 2) / ((X1 - X0) / 2)) ** 2);   // sag
      for (let i = 0; i <= 24; i++) { const x = X0 + (X1 - X0) * i / 24; pts.push(new THREE.Vector3(x, yAt(x), CABLE_Z + dz)); }
      scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.09, 4), cableMat));
      const cabs = [];
      for (let c = 0; c < 3; c++) {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.5, 2.4), cabMat); body.position.y = -3.4;
        const win = new THREE.Mesh(new THREE.BoxGeometry(3.24, 1.1, 2.44), glassMat); win.position.y = -3.1;
        const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), cableMat); hanger.position.y = -1.1;
        g.add(body, win, hanger);
        scene.add(g); cabs.push(g);
      }
      cables.push({ X0, X1, yAt, z: CABLE_Z + dz, dir, cabs });
    }
  }

  // ---- birds: swifts over the avenue ahead and behind, a flock of parakeets flying up the avenue and back close past the
  // camera, egrets gliding low along the river and under the bridge, storks circling in a thermal
  const birdGeo = (() => {
    // span 2 (wing tips at x = ±1), forward +z. The body is a spindle from beak to tail; each wing is an arm (to the wrist at
    // |x| = 0.47) and a swept hand, which the shader folds at the shoulder and the wrist
    const ring = (z, w, h, y = 0) => [[w, y, z], [0, y + h, z], [-w, y, z], [0, y - h, z]];
    const rings = [ring(0.27, 0.03, 0.025, 0.01), ring(0.08, 0.065, 0.05), ring(-0.18, 0.03, 0.022)];
    const P = [[0, 0, 0.4], ...rings.flat()], I = [];
    for (let k = 0; k < 4; k++) I.push(0, 1 + k, 1 + (k + 1) % 4);
    for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) { const a = 1 + r * 4 + k, b = 1 + r * 4 + (k + 1) % 4; I.push(a, a + 4, b, b, a + 4, b + 4); }
    const tb = P.length; P.push([0.11, 0, -0.42], [0, 0, -0.35], [-0.11, 0, -0.42]);
    I.push(9, tb, tb + 1, 9, tb + 1, 11, 11, tb + 1, tb + 2);
    for (const X of [1, -1]) {
      const w = P.length;
      P.push([0.05 * X, 0.005, 0.12], [0.47 * X, 0, 0.1], [1.0 * X, 0, -0.12], [0.86 * X, 0, -0.27], [0.47 * X, 0, -0.17], [0.05 * X, 0, -0.1]);
      I.push(w, w + 1, w + 4, w, w + 4, w + 5, w + 1, w + 2, w + 3, w + 1, w + 3, w + 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P.flat(), 3)); g.setIndex(I);
    return g;
  })();
  const birdMat = new THREE.ShaderMaterial({
    uniforms: SU, side: THREE.DoubleSide,
    vertexShader: `${GLSL_COMMON}
      attribute vec4 aF, aC; attribute float aBu; varying vec3 vW, vN, vCol; varying float vTip;
      void main(){
        vec3 p = position, n;
        // aF: phase, wingbeat (rad/s), beat amplitude, dihedral. Swifts and storks glide between bursts of beats (aBu)
        float burst = mix(1., smoothstep(-0.2, 0.5, sin(uTime * 0.8 + aF.x * 7.)), aBu);
        float s = sin(uTime * aF.y + aF.x), a1 = aF.w + s * aF.z * burst, a2 = a1 + (s * 0.6 + 0.15) * aF.z * burst;
        float X = sign(p.x), r = p.z > -0.3 ? max(abs(p.x) - 0.05, 0.) : 0.;
        if (r > 0.) {
          float ri = min(r, 0.42), ro = max(r - 0.42, 0.);
          vec2 q = vec2(cos(a1), sin(a1)) * ri + vec2(cos(a2), sin(a2)) * ro;
          p.x = X * (0.05 + q.x); p.y += q.y;
          float aa = ro > 0. ? a2 : a1;
          n = vec3(-X * sin(aa), cos(aa), 0.);
        } else n = normalize(vec3(p.x * 12., 1. + p.y * 14., 0.));
        mat4 M = modelMatrix * instanceMatrix;
        vec4 w = M * vec4(p, 1.);
        vW = w.xyz; vN = mat3(M) * n; vCol = aC.rgb; vTip = aC.w * smoothstep(0.62, 0.8, r);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `${GLSL_COMMON}
      varying vec3 vW, vN, vCol; varying float vTip;
      void main(){
        vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
        if (dot(N, V) < 0.) N = -N;                                      // a thin wing: light the side we see
        float lit = (0.3 + 0.7 * smoothstep(110., 180., vW.y)) * cloudShade(vW);   // under the canopy little sun gets through
        vec3 alb = mix(vCol, vec3(0.015), vTip);
        float nl = max(dot(N, uSunDir), 0.), back = pow(max(dot(-V, uSunDir), 0.), 6.);
        vec3 c = alb * (vec3(0.18, 0.21, 0.24) + uSunCol * 0.31 * nl * lit) + alb * uSunCol * back * 0.05 * lit;   // and glowing through the feathers against the sun
        gl_FragColor = vec4(applyHaze(c, vW), 1.);
      }`,
  });
  // kind 0 swift, 1 parakeet, 2 egret, 3 stork: [count, size, colour, dark wing tips, wingbeat, amplitude, dihedral, bursts]
  const BIRD_KINDS = [[64, 0.7, [0.018, 0.017, 0.016], 0, 15, 0.55, 0.05, 1], [22, 0.5, [0.05, 0.15, 0.02], 0.35, 24, 0.75, 0, 0],
    [6, 0.85, [0.78, 0.77, 0.72], 0, 5.5, 0.7, 0.05, 0], [6, 1.05, [0.62, 0.6, 0.56], 0.9, 3, 0.12, 0.1, 1]];
  const birdState = [];
  BIRD_KINDS.forEach(([n, size, col, tip, beat, amp, dih, bu], kind) => {
    for (let i = 0; i < n; i++) birdState.push({ kind, i, size, col, tip, beat: beat * (0.9 + D() * 0.2), amp, dih, bu,
      a: D() * TAU, b: D() * TAU, r: D(), w: 0.6 + D() * 0.5, h: D() * TAU, grp: kind === 0 ? i % 2 : 0, p: new THREE.Vector3() });
  });
  const NB = birdState.length;
  {
    const F = new Float32Array(NB * 4), C = new Float32Array(NB * 4), Bu = new Float32Array(NB);
    birdState.forEach((b, i) => {
      const k = b.kind === 1 ? 0.8 + D() * 0.5 : 1;
      F.set([D() * TAU, b.beat, b.amp, b.dih], i * 4); C.set([b.col[0] * k, b.col[1] * k, b.col[2] * k, b.tip], i * 4); Bu[i] = b.bu;
    });
    birdGeo.setAttribute("aF", new THREE.InstancedBufferAttribute(F, 4));
    birdGeo.setAttribute("aC", new THREE.InstancedBufferAttribute(C, 4));
    birdGeo.setAttribute("aBu", new THREE.InstancedBufferAttribute(Bu, 1));
  }
  const birds = new THREE.InstancedMesh(birdGeo, birdMat, NB);
  birds.frustumCulled = false;
  scene.add(birds);
  const dummy = new THREE.Object3D(), vA = new THREE.Vector3(), vB = new THREE.Vector3(), pA = new THREE.Vector3(), pB = new THREE.Vector3();
  function birdPos(b, t, out) {
    if (b.kind === 3) {                                      // storks: wide slow circles, each bird at its own height in the column
      const a = t * 0.2 * b.w + b.a;
      return out.set(30 + Math.cos(a) * (20 + b.r * 16), 172 + b.r * 29 + Math.sin(t * 0.07 + b.h) * 4, -330 + Math.sin(a) * (20 + b.r * 16));
    }
    if (b.kind === 2) {                                      // egrets: in a loose line low over the river, from behind the camera down the avenue
      const z = CAM.z + 450 - (((t * 9.5 + b.i * 9) % 1400) + 1400) % 1400;
      return out.set(riverX(z) + Math.sin(b.i * 2.1) * 2.5 + Math.sin(t * 0.3 + b.h) * 1.5, 7 + b.i * 0.8 + Math.sin(t * 0.5 + b.h) * 0.6, z);
    }
    if (b.kind === 1) {                                      // parakeets: a racetrack, away up the left of the avenue, back down the right, close past the camera
      const zN = CAM.z + 40, S = 520, Rt = 20, L = 2 * S + 2 * Math.PI * Rt;
      let a = ((t * 19 + b.r * 16) % L + L) % L, x, z;
      if (a < S) { x = -Rt; z = zN - a; }
      else if ((a -= S) < Math.PI * Rt) { x = -Rt * Math.cos(a / Rt); z = zN - S - Rt * Math.sin(a / Rt); }
      else if ((a -= Math.PI * Rt) < S) { x = Rt; z = zN - S + a; }
      else { a -= S; x = Rt * Math.cos(a / Rt); z = zN + Rt * Math.sin(a / Rt); }
      return out.set(x + (b.a - Math.PI) * 0.9 + Math.sin(b.h + t * 1.3) * 2, 52 + Math.sin(b.b * 3) * 3 + Math.sin(t * 0.9 + b.h) * 1.2, z);
    }
    // swifts: two flocks wandering over the avenue, ahead of the camera and behind it; every swift loops round its flock at its own pace
    const k = b.grp ? -1 : 1, cx = 4 + 10 * Math.sin(t * 0.11 + b.grp * 2) + 6 * Math.sin(t * 0.047 + 1);
    const cz = CAM.z + k * (-72 + 15 * Math.sin(t * 0.083 + b.grp)), cy = 66 + 5 * Math.sin(t * 0.13 + b.grp);
    const a = t * b.w * 1.4 + b.a, c = t * b.w * 0.9 + b.b, R = 4 + b.r * 10;
    return out.set(cx + Math.cos(a) * R * 1.6, cy + Math.sin(c) * R * 0.35 + Math.sin(t * 0.5 + b.h) * 2, cz + Math.sin(a) * R);
  }
  function updateBirds(t) {
    birdState.forEach((b, i) => {
      birdPos(b, t, b.p); birdPos(b, t - 0.05, pA); birdPos(b, t - 0.1, pB);
      vA.subVectors(b.p, pA); vB.subVectors(pA, pB);
      if (vA.lengthSq() < 1e-8) vA.set(0, 0, 1);
      dummy.position.copy(b.p);
      dummy.up.set(0, 1, 0);
      dummy.lookAt(pA.copy(b.p).add(vA));
      // bank into the turn, by how fast the heading is changing
      const dh = Math.atan2(vA.x, vA.z) - Math.atan2(vB.x, vB.z), turn = Math.atan2(Math.sin(dh), Math.cos(dh)) / 0.05;
      dummy.rotateZ(clamp(-turn * 0.35, -0.9, 0.9));
      dummy.scale.setScalar(b.size);
      dummy.updateMatrix();
      birds.setMatrixAt(i, dummy.matrix);
    });
    birds.instanceMatrix.needsUpdate = true;
  }

  // ---- seeds drifting in the air in front of the camera, glinting when they cross the sun
  const MOTES = 420;
  const moteGeo = new THREE.BufferGeometry();
  {
    const P = new Float32Array(MOTES * 3), S = new Float32Array(MOTES);
    for (let i = 0; i < MOTES; i++) { P[i * 3] = D(); P[i * 3 + 1] = D(); P[i * 3 + 2] = D(); S[i] = D(); }
    moteGeo.setAttribute("position", new THREE.BufferAttribute(P, 3));
    moteGeo.setAttribute("aS", new THREE.BufferAttribute(S, 1));
  }
  const moteU = { ...SU, uScale: { value: 600 }, uBox0: { value: new THREE.Vector3(CAM.x - 60, 22, CAM.z - 150) }, uBox: { value: new THREE.Vector3(140, 60, 140) } };
  const motes = new THREE.Points(moteGeo, new THREE.ShaderMaterial({
    uniforms: moteU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `${GLSL_COMMON}
      attribute float aS; uniform float uScale; uniform vec3 uBox0, uBox; varying float vB; varying vec3 vW;
      void main(){
        vec3 drift = vec3(uWind.x * 1.6, 0.18 + 0.25 * sin(uTime * 0.3 + aS * 30.), uWind.y * 1.6) * uTime;
        drift += vec3(sin(uTime * 0.7 + aS * 40.), sin(uTime * 0.5 + aS * 17.) * 0.6, cos(uTime * 0.6 + aS * 23.)) * 1.5;
        vec3 w = uBox0 + mod(position * uBox + drift, uBox);
        vW = w;
        vec4 mv = viewMatrix * vec4(w, 1.);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        gl_PointSize = clamp(uScale * (0.05 + 0.05 * aS) / d, 1.0, 5.0);
        float ph = pow(max(dot(normalize(w - cameraPosition), uSunDir), 0.), 5.);
        float tw = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (1.5 + aS * 3.) + aS * 70.), 3.);
        vec3 e = mod(position * uBox + drift, uBox) / uBox;            // fade at the wrap edges
        float edge = smoothstep(0., 0.08, min(min(e.x, 1. - e.x), min(e.z, 1. - e.z))) * smoothstep(0., 0.1, min(e.y, 1. - e.y));
        vB = (0.06 + ph * 2.4) * tw * edge * smoothstep(8., 25., d);
      }`,
    fragmentShader: `${GLSL_COMMON}
      varying float vB; varying vec3 vW;
      void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(c)); gl_FragColor = vec4(vec3(1.0, 0.88, 0.66) * vB * a * 3.0, 1.); }`,
  }));
  motes.frustumCulled = false;
  scene.add(motes);

  // ---- the sun's shadow map: one ortho frustum over the part of the city near enough to need it
  {
    const center = new THREE.Vector3(30, 0, -420);
    sun.position.copy(center).addScaledVector(SUN_DIR, 1500);
    sun.target.position.copy(center);
    sun.castShadow = true;
    const sz = Math.min(renderer.capabilities.maxTextureSize, 4096);
    sun.shadow.mapSize.set(sz, sz);
    const sc = sun.shadow.camera;
    sc.position.copy(sun.position); sc.lookAt(center); sc.updateMatrixWorld();
    const inv = sc.matrixWorldInverse, v = new THREE.Vector3(), lo = new THREE.Vector3(1e9, 1e9, 1e9), hi = new THREE.Vector3(-1e9, -1e9, -1e9);
    for (const x of [-560, 640]) for (const y of [0, 280]) for (const z of [CAM.z + 560, -1250]) { v.set(x, y, z).applyMatrix4(inv); lo.min(v); hi.max(v); }
    sc.left = lo.x; sc.right = hi.x; sc.bottom = lo.y; sc.top = hi.y; sc.near = Math.max(1, -hi.z - 400); sc.far = -lo.z + 50;
    sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6; sun.shadow.radius = 2;
    renderer.shadowMap.needsUpdate = true;
  }

  // ---- sizing, input, loop
  const mouse = { y: 0, ty: 0 };
  addEventListener("pointermove", (e) => { mouse.ty = -(e.clientY / innerHeight - 0.5) * 2; }, { passive: true });
  // turning: moving the mouse turns the view (the window's full width is a full turn; it follows the movement, not the
  // position, so nothing jumps when the pointer arrives), on a touch screen the picture is dragged round, and the arrow
  // keys or the Pan button turn it on their own. yaw 0 faces the sun down the avenue.
  let yawT = 0, yaw = 0, autoPan = false, keyTurn = 0, dragX = null, hx = null;
  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const x = e.clientX / innerWidth * TAU;
    if (hx !== null) yawT += x - hx;
    hx = x;
  }, { passive: true });
  document.addEventListener("mouseout", (e) => { if (!e.relatedTarget) hx = null; });
  canvasEl.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") { dragX = e.clientX; autoPan = false; } });
  const endDrag = () => { dragX = null; };
  addEventListener("pointerup", endDrag); addEventListener("pointercancel", endDrag);
  addEventListener("pointermove", (e) => { if (dragX !== null) { yawT -= (e.clientX - dragX) * 0.0042; dragX = e.clientX; } }, { passive: true });
  addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") keyTurn = -1; if (e.key === "ArrowRight") keyTurn = 1; if (keyTurn) autoPan = false; });
  addEventListener("keyup", (e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") keyTurn = 0; });
  canvasEl.style.cursor = "";
  const horizon = new THREE.Vector3();
  const resize = () => {
    const w = canvasEl.clientWidth || innerWidth, h = canvasEl.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 1 ? 66 : 50;
    camera.updateProjectionMatrix();
    moteU.uScale.value = renderer.domElement.height * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    post.setSize();
  };
  addEventListener("resize", resize); resize();

  let last = performance.now(), raf = 0, visible = true, slow = 0, tNow = reduced ? 40 : 0, drop = 0, descend = null, gustT = -1, dbgCam = null, framed = 0;
  function frame(dt) {
    tNow += dt;
    const t = tNow;
    SU.uTime.value = t;
    if (gustT >= 0) {                                    // the front runs downwind at ~40 m/s, past the camera and on
      gustT += dt;
      SU.uGustF.value = -420 + gustT * 40;
      SU.uGustK.value = Math.min(1, gustT / 2) * (1 - smooth(14, 20, gustT)) * 1.6;
      if (gustT > 20) gustT = -1;
    }
    mouse.y += (mouse.ty - mouse.y) * 0.03;
    if (autoPan) yawT += dt * 0.105;                    // a full turn in a minute
    yawT += keyTurn * dt * 1.1;
    yaw += (yawT - yaw) * (dt > 0 ? 1 - Math.exp(-dt * 4.5) : 1);
    // the lower half of the screen lowers the camera: at the bottom edge you stand by the canal, looking up into the vault
    const dt0 = descend ?? clamp(-mouse.ty / 0.85, 0, 1);
    drop += (dt0 * dt0 * (3 - 2 * dt0) - drop) * 0.022;
    const camY = CAM.y + (STREET.y - CAM.y) * drop, camX = CAM.x + (STREET.x - CAM.x) * drop;
    // a tripod in a light breeze: the frame barely moves
    const sy = Math.sin(yaw), cyw = Math.cos(yaw), ox = Math.sin(t * 0.13) * 0.6;
    camera.position.set(camX + cyw * ox, camY + Math.max(0, mouse.y) * 1.6 + Math.sin(t * 0.21) * 0.2 * (1 - drop * 0.7), CAM.z + sy * ox);
    const lx = target.x - (camX + ox), lz = target.z - CAM.z;           // where the camera looks, turned about the vertical by yaw
    camera.lookAt(camera.position.x + lx * cyw - lz * sy, target.y + (STREET.ly - target.y) * drop + Math.max(0, mouse.y) * 2 + Math.sin(t * 0.17) * 0.3, camera.position.z + lz * cyw + lx * sy);
    if (dbgCam) { camera.position.copy(dbgCam[0]); camera.lookAt(dbgCam[1]); }
    moteU.uBox0.value.set(camera.position.x + sy * 70 - 70, camera.position.y - 30, camera.position.z - cyw * 70 - 70);
    sky.position.copy(camera.position);

    for (const c of cables) {
      const L = c.X1 - c.X0;
      c.cabs.forEach((g, i) => {
        const u = ((t * 3.2 / L + i / c.cabs.length) % 1 + 1) % 1, x = c.dir > 0 ? c.X0 + u * L : c.X1 - u * L;
        g.position.set(x, c.yAt(x), c.z);
        g.visible = u > 0.02 && u < 0.98;
      });
    }
    traffic(t);
    updateBirds(t);

    camera.updateMatrixWorld();
    waterVP.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    horizon.set(camera.position.x + Math.sin(yaw) * 2600, 0, camera.position.z - Math.cos(yaw) * 2600).project(camera);
    post.U.uHorizon.value = horizon.y * 0.5 + 0.5;
    horizon.copy(camera.position).addScaledVector(SUN_DIR, 1000).project(camera);
    post.U.uSunUV.value.set(horizon.x * 0.5 + 0.5, horizon.y * 0.5 + 0.5);
    post.U.uRays.value = smooth(0.1, 0.45, SUN_DIR.x * Math.sin(yaw) - SUN_DIR.z * Math.cos(yaw));    // rays only while the sun is ahead
    // draw only the compass sectors the camera can be facing (the first frame draws all, for the shadow map)
    if (framed++ > 0) {
      const hf = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect) + 0.4 + Math.PI / NS;
      for (const { mesh, s } of sectorMeshes) {
        if (s < 0) continue;
        const dA = Math.abs((((s + 0.5) / NS * TAU - yaw) % TAU + 3 * Math.PI) % TAU - Math.PI);
        mesh.visible = dA < hf;
      }
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
  if (reduced) { frame(0.016); frame(0); }            // twice, so the river has a previous frame to mirror
  else raf = requestAnimationFrame((n) => { last = n; loop(n); });
  const setDrop = (v) => { drop = v; mouse.ty = mouse.y = -0.85 * v; };   // for screenshots: jump to a height without the easing
  // the page's buttons: send a gust rolling over the city; go down to the river and back up without the pointer
  const gust = () => { gustT = 0; };
  let py = 0, lockY = 0;
  const toggleDescend = () => { descend = drop > 0.5 ? 0 : 1; lockY = py; return descend === 1; };
  addEventListener("pointermove", (e) => {                     // the pointer takes over again once it really moves
    py = e.clientY;
    if (descend !== null && Math.abs(py - lockY) > 160) descend = null;   // up or down: sideways is turning
  }, { passive: true });
  const setYaw = (deg) => { yawT = yaw = THREE.MathUtils.degToRad(deg); };
  const pan = (v) => { autoPan = v ?? !autoPan; return autoPan; };
  const look = (p, t) => { dbgCam = p ? [new THREE.Vector3(...p), new THREE.Vector3(...t)] : null; };   // for screenshots from anywhere
  return { renderer, frame, setDrop, setYaw, pan, look, get yaw() { return THREE.MathUtils.radToDeg(yaw); }, get panning() { return autoPan; }, gust, toggleDescend, get drop() { return drop; }, scene, camera, SU, stats: { boxes: boxes.length, trees: trees.length, blobs: nBlobs, shrubs: nShrubs, cards: nCards, ground: nGround, arches: archGeos.length, vines: vines.length, vehicles: vehicles.length } };
}

// ---------------------------------------------------------------- composite: heat shimmer, ACES, warm grade, lens
const COMP_FRAG = /* glsl */`
uniform sampler2D tScene, tBloom;
uniform vec2 uRes;
uniform float uTime, uExposure, uBloom, uHorizon, uRays;
uniform vec2 uSunUV;
varying vec2 vUv;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
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
  vec2 uv = vUv;
  // heat shimmer: hot air wobbles the far city, strongest in a band just above the horizon
  float band = exp(-pow((uv.y - uHorizon - 0.03) / 0.09, 2.));
  vec2 px = uv * uRes / max(uRes.y, 1.) * 900.;
  vec2 wob = vec2(vn(px * vec2(0.06, 0.13) + vec2(0., -uTime * 2.4)), vn(px * vec2(0.05, 0.11) + vec2(5.2, -uTime * 1.9))) - 0.5;
  uv += wob * band * vec2(0.9, 1.4) / uRes * 2.2;
  vec2 q = vUv - 0.5;
  vec2 ca = q * dot(q, q) * 0.006;
  vec3 col = vec3(texture2D(tScene, uv - ca).r, texture2D(tScene, uv).g, texture2D(tScene, uv + ca).b);
  col += texture2D(tBloom, uv).rgb * uBloom;
  // crepuscular rays: march toward the sun and gather the blazing sky between towers, arches and vines
  vec2 dl = uSunUV - uv; dl *= min(1., 0.32 / max(length(dl), 1e-4)) / 64.;      // look at most a third of the screen toward the sun
  vec2 sp = uv + dl * 0.5;
  float acc = 0., dec = 1.;
  for (int i = 0; i < 64; i++) {
    vec2 c = clamp(sp, 0.001, 0.999);
    acc += smoothstep(1.4, 5.0, dot(texture2D(tScene, c).rgb, vec3(0.3, 0.5, 0.2))) * dec;
    dec *= 0.972; sp += dl;
  }
  col += vec3(1.0, 0.66, 0.36) * acc / 64. * uRays * 1.5;
  // lens: a veil of glare round the sun and a few ghosts along the line through the picture's centre, while the sun is in view
  {
    vec2 asp = vec2(uRes.x / uRes.y, 1.);
    float sv = 0.;
    for (int i = 0; i < 6; i++) { float a = float(i) * 1.047; vec2 o = vec2(cos(a), sin(a)) * 0.012; sv += smoothstep(2.5, 8., dot(texture2D(tScene, clamp(uSunUV + o, 0.001, 0.999)).rgb, vec3(0.3, 0.5, 0.2))); }
    sv = sv / 6. * uRays * step(0., uSunUV.x) * step(uSunUV.x, 1.) * step(0., uSunUV.y) * step(uSunUV.y, 1.);
    vec2 ax = vec2(0.5) - uSunUV;
    col += vec3(1.0, 0.72, 0.45) * exp(-length((uv - uSunUV) * asp) * 4.5) * sv * 0.07;
    for (int i = 0; i < 4; i++) {
      float fi = float(i), k = 0.8 + fi * 0.5 + fi * fi * 0.07, r = 0.03 + 0.012 * mod(fi * 2., 3.);
      vec2 gp = uSunUV + ax * k;
      float d = length((uv - gp) * asp);
      float ring = smoothstep(r, r * 0.8, d) * (0.35 + 0.65 * smoothstep(r * 0.4, r, d));
      vec3 tint = i == 0 ? vec3(0.3, 0.9, 0.5) : i == 1 ? vec3(0.9, 0.3, 0.6) : i == 2 ? vec3(0.3, 0.5, 1.0) : vec3(1.0, 0.7, 0.3);
      col += tint * ring * sv * 0.03;
    }
  }
  vec3 c = toSRGB(aces(col));
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c += vec3(-0.010, 0.004, 0.006) * (1.0 - l) * (1.0 - l);   // cool green in the deep shade
  c += vec3(0.03, 0.012, -0.03) * l * l;                     // warm, bleached highlights
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.3);
  c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 1.1);
  float vig = smoothstep(1.1, 0.3, length(q * vec2(1.0, 1.15)));
  c *= mix(0.72, 1.0, vig);
  c += (h21(vUv * uRes + fract(uTime * 7.31) * 113.) - 0.5) * 0.014;
  gl_FragColor = vec4(c, 1.);
}`;
