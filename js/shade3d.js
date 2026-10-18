// Scene: a megacity that grew its own shade. Late afternoon in a hot century: the asphalt has been broken up,
// and the city is overgrown on purpose. Trees crown every setback and roof, vines hang down the facades, and the
// old eight-lane avenue is a forest with a canal down the middle. The frame holds still like a photograph;
// what moves is small and has to be found: gusts rolling over the canopy, a flock of swifts, storks circling in a
// thermal, gondolas crossing the avenue, seeds drifting in the sun, cloud shadows, heat shimmer on the horizon.
// Everything is procedural and seeded, so the composition is the same on every load. Only dependency: three.js.

import * as THREE from "three";
import { makePost } from "./post.js";

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- layout (metres; the avenue runs along -z)
const AVE = 44, CANAL = 7, PITCH = 92, BLOCK = 74;
const CAM = new THREE.Vector3(-6, 56, 78), LOOK = new THREE.Vector3(4, 36, -300);
const SUN_DIR = new THREE.Vector3(-0.55, 0.6, -0.58).normalize();
const WIND = new THREE.Vector2(0.75, 0.66).normalize();       // blowing from the sun side toward the camera's right
const CABLE_Z = -150, CABLE_Y = 104;
const ARCOLOGY = { x: 24, z: -1150, w: 270, d: 210, h: 440 };
const halfW = (z) => 70 + Math.max(0, CAM.z - z) * 1.2;       // wedge of the city that can ever be in frame

// ---------------------------------------------------------------- GLSL shared by every material
const GLSL_COMMON = /* glsl */`
uniform float uTime, uFogA, uFogH, uCloud;
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
vec3 halo(vec3 rd){ float s = max(dot(rd, uSunDir), 0.); return uSunCol * (pow(s, 4.) * 0.10 + pow(s, 24.) * 0.22 + pow(s, 200.) * 0.5); }
vec3 hazeCol(vec3 rd){ return vec3(0.60, 0.56, 0.47) + halo(rd); }
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
  vec3 zen = vec3(0.10, 0.19, 0.36);
  vec3 col = mix(vec3(0.60, 0.56, 0.47), zen, pow(smoothstep(-0.01, 0.45, h), 0.6));
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
  uTime: { value: 0 }, uSunDir: { value: SUN_DIR.clone() }, uSunCol: { value: new THREE.Vector3(5.2, 4.3, 3.2) },
  uWind: { value: WIND.clone() }, uFogA: { value: 0.00062 }, uFogH: { value: 320 }, uCloud: { value: 0.42 },
};
const LIGHTS_BEGIN = (() => {
  const c = THREE.ShaderChunk.lights_fragment_begin, i = c.indexOf("#if ( NUM_DIR_LIGHTS > 0 )");
  const dir = c.slice(i).replace("RE_Direct( directLight", "directLight.color *= cloudShade(vW);\n\t\tsunLit = directLight.color;\n\t\tRE_Direct( directLight");
  return "vec3 sunLit = vec3(0.);\n" + c.slice(0, i) + dir;
})();
function patch(mat, key, { vert = "", wind = "", frag = "", color = "", normal = "", after = "" } = {}) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, SU);
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
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

// fake sky reflection for glass and water (the sky has no env map)
const GLSL_REFL = /* glsl */`
vec3 skyRefl(vec3 r){ float h = max(r.y, 0.); return mix(vec3(0.60, 0.56, 0.47), vec3(0.10, 0.19, 0.36), pow(smoothstep(0., 0.7, h), 0.55)) + halo(r) * 0.6; }
`;

// ---------------------------------------------------------------- facades: windows, grime, vines, planters, moss
const BUILDING = {
  vert: "attribute vec4 aB; varying vec4 vB;",
  wind: "vB = aB;",
  frag: `varying vec4 vB; float gMask; vec2 leafGrad;
${GLSL_REFL}
float rect(vec2 f, vec2 a, vec2 b, vec2 w){ vec2 s = smoothstep(a - w, a + w, f) * (1. - smoothstep(b - w, b + w, f)); return s.x * s.y; }
float leafN(vec2 q){ return vnoise(q * 1.9) * 0.55 + vnoise(q * 5.3 + 7.) * 0.45; }`,
  color: `
  vec3 N0 = normalize(vWN);
  float seed = vB.x, gr = vB.w, style = floor(fract(seed * 3.71) * 4.);
  vec3 conc = mix(vec3(0.34, 0.31, 0.27), vec3(0.50, 0.48, 0.45), fract(seed * 13.7));
  if (fract(seed * 5.3) > 0.9) conc = vec3(0.36, 0.24, 0.17);              // some terracotta
  vec3 alb = conc; float glass = 0.; gMask = 0.; leafGrad = vec2(0.);
  vec2 q, c0 = vec2(0.);
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
    float win, avg;
    if (style < 1.)      { win = rect(f, vec2(0.2, 0.3), vec2(0.8, 0.86), w); avg = 0.34; }
    else if (style < 2.) { win = rect(f, vec2(-1., 0.34), vec2(2., 0.84), w) * (1. - rect(f, vec2(0.47, 0.), vec2(0.53, 1.), w) * 0.8); avg = 0.47; }
    else if (style < 3.) { win = 1. - max(rect(f, vec2(-0.1, -0.1), vec2(0.035, 1.1), w), rect(f, vec2(-0.1, -0.1), vec2(1.1, 0.06), w)) * 0.85; avg = 0.85; }
    else                 { win = rect(f, vec2(0.06, 0.24), vec2(0.94, 0.94), w); avg = 0.6; }
    win = mix(win, avg, lod);
    float slab = style > 2.5 ? rect(f, vec2(-1., -0.1), vec2(2., 0.13), w) * (1. - lod) : 0.;   // balcony slab edges
    float cell = hash12(c + seed * 91.);
    vec3 glassCol = mix(vec3(0.016, 0.02, 0.024), vec3(0.10, 0.09, 0.075), step(0.85, cell) * 0.7 + cell * 0.12);
    float grime = 0.78 + 0.22 * vnoise(vec2(u * 0.7, vW.y * 0.04 + seed * 9.));
    grime *= 1. - 0.25 * smoothstep(0.5, 0.0, f.y) * step(0.5, 1. - lod) * (1. - win);   // rain streaks below the sills
    alb = mix(conc * grime, glassCol, win);
    alb = mix(alb, conc * 1.25, slab);
    glass = win * (1. - slab);
    // greenery: vines hanging from each tier top, climbers from its base, planter rows, moss
    float dTop = vB.y - vW.y, dBot = vW.y - vB.z;
    float strand = vnoise(vec2(u * 0.33 + seed * 17., 0.5));
    float len = gr * (4. + 58. * strand * strand) * (0.35 + 0.65 * hash12(vec2(floor(u / 0.7), seed * 31.)));   // stringy curtains
    float hang = 1. - smoothstep(len * 0.55, len, dTop + (vnoise(vec2(u * 1.6, vW.y * 0.35)) - 0.5) * 7.);
    float clen = gr * (2. + 26. * vnoise(vec2(u * 0.21 + 3.1, seed * 5.)));
    float climb = 1. - smoothstep(clen * 0.5, clen, dBot + (vnoise(vec2(u * 2.1, vW.y * 0.5)) - 0.5) * 5.);
    float planter = (style > 2.5 || fract(seed * 9.1) > 0.55) ? step(mod(c.y, 3.), 0.5) * (1. - smoothstep(0.16, 0.3 + 0.2 * vnoise(vec2(u * 1.3, c.y)), f.y)) : 0.;
    float moss = smoothstep(0.72, 0.8, fbm3(q * 0.11 + seed * 7.)) * gr;
    gMask = max(max(hang, climb), max(planter * (1. - lod * 0.5), moss));
  }
  float ln = leafN(q);
  float gm = smoothstep(0.32, 0.62, gMask * (0.5 + ln * 0.95));
  vec3 leaf = mix(vec3(0.04, 0.08, 0.022), vec3(0.11, 0.17, 0.04), ln);
  if (fract(seed * 21.7) > 0.84) leaf = mix(leaf, vec3(0.42, 0.04, 0.16), smoothstep(0.62, 0.8, vnoise(q * 2.7)));   // bougainvillea
  diffuseColor.rgb = mix(alb, leaf, gm);
  glass *= 1. - gm;
  rough = mix(mix(0.9, 0.12, glass), 0.75, gm);
  gMask = gm;
  leafGrad = vec2(leafN(q + vec2(0.07, 0.)) - ln, leafN(q + vec2(0., 0.07)) - ln) / 0.07;
  float fres = 0.04 + 0.96 * pow(1. - max(dot(N0, V), 0.), 5.);
  emis = skyRefl(reflect(-V, N0)) * fres * glass * (0.35 + 0.5 * hash12(c0 + 3.));`,
  after: `
  reflectedLight.indirectDiffuse *= mix(0.35, 1.0, smoothstep(0., 40., vW.y));   // the canyon floor sees less sky`,
  normal: `
  if (gMask > 0.01) {
    vec3 T = abs(nW.y) > 0.5 ? vec3(1., 0., 0.) : normalize(vec3(-nW.z, 0., nW.x)), B = abs(nW.y) > 0.5 ? vec3(0., 0., 1.) : vec3(0., 1., 0.);
    nW = normalize(nW - (T * leafGrad.x + B * leafGrad.y) * 0.22 * gMask);
  }`,
};

// ---------------------------------------------------------------- foliage: lumpy crowns that sway in passing gusts
const FOLIAGE = {
  vert: "varying float vGust, vLy, vSeed;",
  wind: `
  vec3 wo = (modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.)).xyz;
  float sc = length(instanceMatrix[0].xyz);
  float gust = smoothstep(0.42, 0.85, vnoise(wo.xz * 0.0105 - uWind * uTime * 0.05));
  float hgt = clamp(position.y * 0.5 + 0.5, 0., 1.);
  vec3 sway = vec3(uWind.x, 0., uWind.y) * (0.2 + 1.3 * gust) + vec3(sin(uTime * 1.1 + wo.x * 0.21), 0., cos(uTime * 0.9 + wo.z * 0.23)) * 0.22;
  wPos.xyz += sway * hgt * sc * 0.075;
  wPos.xyz += vec3(sin(uTime * 6.1 + wPos.y * 2.3 + wo.x), sin(uTime * 5.3 + wPos.x * 2.1), cos(uTime * 6.7 + wPos.z * 2.5)) * 0.035 * (0.2 + gust) * min(sc, 6.);
  vGust = gust; vLy = position.y; vSeed = hash12(wo.xz);`,
  frag: `varying float vGust, vLy, vSeed; vec3 clumpN; float clumpK;
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
  rough = 0.62;`,
  normal: `
  vec3 pp = vW * 1.5; float e = 0.12, b0 = n3(pp);
  vec3 gr = vec3(n3(pp + vec3(e, 0., 0.)) - b0, n3(pp + vec3(0., e, 0.)) - b0, n3(pp + vec3(0., 0., e)) - b0) / e;
  vec3 pp2 = vW * 0.45, gr2 = vec3(n3(pp2 + vec3(e, 0., 0.)), n3(pp2 + vec3(0., e, 0.)), n3(pp2 + vec3(0., 0., e))) - n3(pp2);
  nW = normalize(nW - (gr - nW * dot(gr, nW)) * 0.35 - (gr2 / e - nW * dot(gr2 / e, nW)) * 0.5);
  nW = normalize(mix(nW, normalize(clumpN + nW * 0.6), 0.6 * clumpK));`,
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

const GROUND = {
  frag: GLSL_REFL,
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
  c = mix(c, mix(vec3(0.075, 0.075, 0.07), grass, crack), asph);
  diffuseColor.rgb = c;
  rough = 0.95;`,
};

const WATER = {
  frag: GLSL_REFL + "vec3 wN;",
  color: `
  vec2 q = vW.xz;
  float e = 0.08, t = uTime;
  #define WH(p) (vnoise((p) * vec2(0.9, 0.3) + vec2(t * 0.2, -t * 0.5)) * 0.6 + vnoise((p) * vec2(2.6, 0.9) + vec2(-t * 0.35, -t * 0.9)) * 0.4)
  float h0 = WH(q);
  wN = normalize(vec3(-(WH(q + vec2(e, 0.)) - h0) / e * 0.05, 1., -(WH(q + vec2(0., e)) - h0) / e * 0.05));
  diffuseColor.rgb = vec3(0.010, 0.018, 0.014);
  rough = 0.04;
  vec3 r = reflect(-V, wN);
  float fres = 0.02 + 0.98 * pow(1. - max(dot(wN, V), 0.), 5.);
  // the banks and their trees darken the reflection toward the edges
  float bank = smoothstep(0.35, 1.0, abs(vW.x + r.x * 30.) / ${CANAL}.) * (1. - smoothstep(0.05, 0.35, r.y));
  vec3 refl = mix(skyRefl(r), vec3(0.025, 0.04, 0.02), bank * 0.85);
  emis = refl * fres * 0.9;`,
  normal: "nW = wN;",
};

// ---------------------------------------------------------------- the scene
export function startShade3D(canvasEl, { reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: false, powerPreference: "high-performance" });
  let pr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pr);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;                 // the city does not move; render the sun's shadow map once
  const post = makePost(renderer, { comp: COMP_FRAG, bloom: 0.26, thresh: 0.55, uniforms: { uHorizon: { value: 0.45 } } });
  post.U.uExposure.value = 0.92;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 9000);
  const target = LOOK.clone();

  // ---- light
  const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.84, 0.64), 5.6);
  SU.uSunCol.value.set(5.6, 4.6, 3.4);
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(new THREE.Color(0.62, 0.68, 0.74), new THREE.Color(0.16, 0.19, 0.09), 0.55);
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

  // ---- generate the city
  const R = rng(20871), D = rng(4410);          // R lays out the city, D decorates it, so planting never moves a building
  const boxes = [];          // x0, y0, z0, x1, y1, z1, seed, green
  const trees = [];          // x, y(base), z, crown radius, trunk height, palette
  const dist = (x, z) => Math.hypot(x - CAM.x, z - CAM.z);
  const box = (x0, y0, z0, x1, y1, z1, seed, green) => boxes.push([x0, y0, z0, x1, y1, z1, seed, green]);
  const inArc = (x, z) => Math.abs(x - ARCOLOGY.x) < ARCOLOGY.w / 2 + 4 && Math.abs(z - ARCOLOGY.z) < ARCOLOGY.d / 2 + 4;
  const tree = (x, y, z, rc, th, pal) => { if (y > 0 || !inArc(x, z)) trees.push([x, y, z, rc, th, pal]); };
  const palette = () => { const r = D(); return r < 0.018 ? 4 : r < 0.03 ? 5 : r < 0.3 ? 1 : r < 0.48 ? 2 : r < 0.6 ? 3 : 0; };

  // trees on a flat roof or terrace, leaving out the footprint of the tier above
  function plant(x0, z0, x1, z1, y, hole, prob) {
    const d = dist((x0 + x1) / 2, (z0 + z1) / 2);
    if (d > 2300) return;
    const sp = clamp(6.5 + d / 140, 6.5, 22);
    for (let x = x0 + sp * 0.5; x < x1; x += sp) for (let z = z0 + sp * 0.5; z < z1; z += sp) {
      if (D() > prob) continue;
      const px = x + (D() - 0.5) * sp * 0.5, pz = z + (D() - 0.5) * sp * 0.5;
      const rc = sp * (0.36 + D() * 0.22);
      if (px - x0 < rc * 0.5 || x1 - px < rc * 0.5 || pz - z0 < rc * 0.5 || z1 - pz < rc * 0.5) continue;
      if (hole && px > hole[0] - rc * 0.6 && px < hole[1] + rc * 0.6 && pz > hole[2] - rc * 0.6 && pz < hole[3] + rc * 0.6) continue;
      tree(px, y, pz, rc, rc * (0.15 + D() * 0.35), palette());
    }
  }

  // hedges spilling over every parapet and, on the greenest buildings near the camera, planted balconies
  const shrubs = [];         // x, y, z, radius, y radius, palette
  const hedge = (ax, az, bx, bz, nx, nz, y, rMin, rMax, prob, out, drop) => {
    const L = Math.hypot(bx - ax, bz - az);
    for (let u = D() * rMin; u < L; u += (rMin + rMax) * 0.55 * (0.8 + D() * 0.5)) if (D() < prob) {
      const r = rMin + D() * (rMax - rMin), t = u / L;
      shrubs.push([ax + (bx - ax) * t + nx * r * out, y - r * drop * D(), az + (bz - az) * t + nz * r * out, r, r * 0.72, palette() & 3]);
    }
  };
  function overgrow([x0, x1, z0, z1, y0, y1], green, always = false) {
    const d = dist((x0 + x1) / 2, (z0 + z1) / 2);
    if (d > 900 && !always) return;
    const k = 1 + d / 260;
    const sides = [[x0, z0, x1, z0, 0, -1], [x1, z1, x0, z1, 0, 1], [x0, z1, x0, z0, -1, 0], [x1, z0, x1, z1, 1, 0]];
    const balconies = d < 520 && green > 0.62 && D() < 0.5, every = 3.6 * (2 + Math.floor(D() * 3));
    for (const [ax, az, bx, bz, nx, nz] of sides) {
      if (nx * (CAM.x - (ax + bx) / 2) + nz * (CAM.z - (az + bz) / 2) < 0) continue;     // faces the camera never sees
      hedge(ax, az, bx, bz, nx, nz, y1, 1.3 * k, 2.6 * k, green, 0.25, 0.5);
      if (!balconies || Math.hypot(bx - ax, bz - az) < 18) continue;
      for (let y = y0 + every; y < y1 - 4; y += every) {
        // a slab sticking out of the facade with a hedge along its edge
        const ox = nx * 1.8, oz = nz * 1.8;
        box(Math.min(ax, bx, ax + ox, bx + ox), y - 0.5, Math.min(az, bz, az + oz, bz + oz), Math.max(ax, bx, ax + ox, bx + ox), y, Math.max(az, bz, az + oz, bz + oz), 0.06, 1);
        hedge(ax + ox * 0.6, az + oz * 0.6, bx + ox * 0.6, bz + oz * 0.6, nx, nz, y + 0.9, 0.9, 1.7, 0.85, 0.1, 0.3);
      }
    }
  }

  // one building on a lot: a stack of tiers, planted on every setback
  const fronts = [];         // side, avenue-facing x, z0, z1, y0, y1 of every tier on the avenue
  function building(x0, x1, z0, z1, front, forced) {
    const seed = R(), green = 0.45 + R() * 0.55;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, far = dist(cx, cz);
    if (forced) {                                            // gondola station: one tall block flush with the avenue
      box(x0, 0, z0, x1, forced, z1, seed, green);
      fronts.push([Math.sign(cx), cx > 0 ? x0 : x1, z0, z1, 0, forced]);
      overgrow([x0, x1, z0, z1, 0, forced], green);
      plant(x0, z0, x1, z1, forced, null, 0.85);
      return;
    }
    let H = 22 + Math.pow(R(), 1.6) * (front ? 175 : 135);
    if (R() < 0.07) H += 80 + R() * 130;
    if (far > 1500) H *= 1.3;
    const st = R(), tiers = [];
    let a = [x0, x1, z0, z1], y = 0;
    const pod = H > 45 ? 6 + R() * 12 : H;
    tiers.push([...a, 0, pod]); y = pod;
    const shrink = (lo, hi) => {
      const m = a.slice();
      for (let s = 0; s < 4; s++) if (R() < 0.75) { const v = lo + R() * (hi - lo); m[s] += s % 2 ? -v : v; }
      return m;
    };
    if (st < 0.32) {                                          // stepped terraces
      const step = 9 + R() * 7;
      while (y < H - 4) {
        const m = shrink(2.5, 6);
        if (m[1] - m[0] < 12 || m[3] - m[2] < 12) break;
        a = m; tiers.push([...a, y, Math.min(H, y + step)]); y += step;
      }
    } else if (st < 0.78) {                                   // tower with a setback or two
      a = shrink(3, 11);
      const n = 1 + Math.floor(R() * 3);
      for (let i = 0; i < n && a[1] - a[0] > 10 && a[3] - a[2] > 10; i++) {
        const top = i === n - 1 ? H : y + (H - y) * (0.45 + R() * 0.3);
        tiers.push([...a, y, top]); y = top;
        a = shrink(2.5, 7);
      }
    } else {                                                  // slab
      const alongX = R() < 0.5, w = 12 + R() * 10;
      a = alongX ? [x0 + 3, x1 - 3, cz - w / 2, cz + w / 2] : [cx - w / 2, cx + w / 2, z0 + 3, z1 - 3];
      tiers.push([...a, y, H]);
    }
    tiers.forEach((t, i) => {
      box(t[0], t[4], t[2], t[1], t[5], t[3], seed, green);
      if (front) fronts.push([Math.sign(cx), cx > 0 ? t[0] : t[1], t[2], t[3], t[4], t[5]]);
      overgrow(t, green);
      const nx = tiers[i + 1];
      plant(t[0], t[2], t[1], t[3], t[5], nx ? [nx[0], nx[1], nx[2], nx[3]] : null, nx ? 0.8 : 0.6);
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
  const archGeos = [], archBlobs = [], vines = [];   // vines: x, y(top), z, length, width
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
  function arch(A, B, lift, bulge, thick) {
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
    const strands = thick > 1.5 ? 5 : 3;
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
    // leaves along the back, heaviest at the roots
    const step = 2.0 * (1 + d / 700);
    for (let u = 0; u < len; u += step * (0.7 + D() * 0.6)) {
      const t = u / len, s = Math.sin(Math.PI * t), c = P(t, a), r = (1.3 + D() * 1.5) * (thick / 1.6) * (1 + (1 - s) * 0.7) * (1 + d / 900);
      if (D() < s * 0.22) continue;                                  // gaps along the span show the braid
      archBlobs.push([c.x + (D() - 0.5) * r, c.y + r * (0.25 + D() * 0.35), c.z + (D() - 0.5) * r, r, r * 0.7, palette() & 3]);
      if (D() < 0.35) archBlobs.push([c.x + (D() - 0.5) * r * 2, c.y - r * 0.4, c.z + (D() - 0.5) * r * 2, r * 0.7, r * 0.6, palette() & 3]);
    }
    // vines hanging from the underside
    for (let u = 1; u < len; u += 0.5 + d / 500) {
      const t = u / len; if (t < 0.05 || t > 0.95 || D() < 0.25) continue;
      const c = P(t, a), L = Math.min(c.y - 3, 1 + Math.pow(D(), 2.5) * 30 * Math.sin(Math.PI * t) * (thick / 1.6));
      if (L > 0.8) vines.push([c.x + (D() - 0.5) * thick * 2.4, c.y - thick * 0.2, c.z + (D() - 0.5) * thick * 2.4, L, (0.05 + D() * 0.08) * (1 + d / 250)]);
    }
  }
  // across the avenue: [z on the left, z on the right, height left, height right, rise, sideways sway, thickness]
  for (const [zl, zr, yl, yr, lift, sway, th] of [
    [-22, -48, 24, 34, 50, 10, 2.1], [-238, -206, 62, 46, 38, -14, 1.9], [-520, -548, 30, 56, 62, 12, 2.1],
    [-652, -640, 92, 84, 28, -6, 1.6], [-860, -905, 58, 70, 72, 16, 2.4], [-975, -990, 26, 40, 40, 0, 1.8],
  ]) arch(anchor(-1, zl, yl), anchor(1, zr, yr), lift, new THREE.Vector3(0, 0, sway), th);
  // along the canyon walls: across each side street, from one tower to the next
  for (let k = -1; k < 11; k++) {
    const zc = -k * PITCH;
    for (const side of [-1, 1]) for (let n = 0; n < 2; n++) {
      if (D() > (n ? 0.2 : 0.55)) continue;
      const y = 14 + D() * 90;
      arch(anchor(side, zc - BLOCK / 2 + 1, y, [0, 3, 6, 10]), anchor(side, zc - PITCH + BLOCK / 2 - 1, y + (D() - 0.5) * 16, [0, -3, -6, -10]),
        4 + D() * 8, new THREE.Vector3(-side * (2 + D() * 4), 0, 0), 0.8 + D() * 0.5);
    }
  }

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

  // the avenue forest: rows along both banks closing into one canopy, a few engineered giants standing out of it
  for (const side of [-1, 1]) for (const [row, rMin, rMax] of [[CANAL + 6.5, 4.5, 6.5], [CANAL + 15, 5.5, 8], [CANAL + 24.5, 5.5, 8.5], [AVE - 5, 4.5, 7]]) {
    for (let z = CAM.z + 40; z > -2300; z -= 7 + D() * 5) {
      const giant = D() < 0.03 && row > CANAL + 10 && z < CAM.z - 300;
      const rc = giant ? 12 + D() * 5 : rMin + D() * (rMax - rMin);
      tree(side * (row + (D() - 0.5) * 3), 0, z, rc, giant ? 22 + D() * 8 : 4 + D() * 6, palette());
    }
  }
  // undergrowth along the canal banks, close enough to see between the trunks
  for (const side of [-1, 1]) for (let z = CAM.z + 20; z > -500; z -= 3 + D() * 4) {
    tree(side * (CANAL + 1.5 + D() * 30), 0, z, 1.4 + D() * 1.8, 0, palette() & 3);
  }
  // cross streets near the camera are planted too
  for (let k = -1; k < 9; k++) {
    const zs = -k * PITCH - PITCH / 2;
    for (const side of [-1, 1]) for (let x = AVE + 8; x < halfW(zs); x += 10 + D() * 5) tree(side * x, 0, zs + (D() - 0.5) * 6, 4 + D() * 3, 6 + D() * 6, palette());
  }

  // ---- buildings mesh (+ canal walls, which share the facade shader)
  box(-CANAL - 0.8, -2.2, -2400, -CANAL, 0.15, CAM.z + 60, 0.91, 1);
  box(CANAL, -2.2, -2400, CANAL + 0.8, 0.15, CAM.z + 60, 0.91, 1);
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
    const m = new THREE.Mesh(g, patch(new THREE.MeshStandardMaterial({ roughness: 0.9 }), "shade-building", BUILDING));
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
  const foliage = new THREE.InstancedMesh(blobGeo, patch(new THREE.MeshStandardMaterial({ roughness: 0.62 }), "shade-foliage", FOLIAGE), nBlobs);
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color(), s = new THREE.Vector3(), p = new THREE.Vector3();
    blobs.forEach(([x, y, z, r, ry, pal], i) => {
      e.set((D() - 0.5) * 0.3, D() * TAU, (D() - 0.5) * 0.3); q.setFromEuler(e);
      m.compose(p.set(x, y, z), q, s.set(r, ry, r));
      foliage.setMatrixAt(i, m);
      const b = PAL[pal], k = 0.8 + D() * 0.4;
      c.setRGB(b[0] * k, b[1] * k, b[2] * k * (0.9 + D() * 0.2), THREE.LinearSRGBColorSpace);
      foliage.setColorAt(i, c);
    });
  }
  foliage.castShadow = foliage.receiveShadow = true;
  foliage.computeBoundingSphere();
  scene.add(foliage);

  // facade shrubs: the same leafy material on a lighter blob
  {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const sm = new THREE.InstancedMesh(g, foliage.material, shrubs.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    shrubs.forEach(([x, y, z, r, ry, pal], i) => {
      e.set(0, D() * TAU, 0); q.setFromEuler(e);
      sm.setMatrixAt(i, m.compose(p.set(x, y, z), q, sc.set(r, ry, r)));
      const b = PAL[pal], k = 0.8 + D() * 0.4;
      sm.setColorAt(i, c.setRGB(b[0] * k, b[1] * k, b[2] * k, THREE.LinearSRGBColorSpace));
    });
    sm.castShadow = sm.receiveShadow = true;
    sm.computeBoundingSphere();
    scene.add(sm);
    nShrubs = shrubs.length;
  }

  // trunks (only for trees near enough to show one) and the arches' braids share one bark
  const bark = patch(new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.07, 0.062, 0.045, THREE.LinearSRGBColorSpace), roughness: 0.95 }), "shade-bark", {
    color: "diffuseColor.rgb *= 0.7 + 0.6 * vnoise(vec2(vW.y * 1.7, (vW.x + vW.z) * 2.3)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.08, 0.025), smoothstep(0.55, 0.8, n3(vW * 0.6)));",
  });
  {
    const near = trees.filter(([x, , z, , th]) => dist(x, z) < 900 && th > 3);
    const tm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 1, 1, 7, 1, true).translate(0, 0.5, 0), bark, near.length);
    const m = new THREE.Matrix4();
    near.forEach(([x, y, z, rc, th], i) => { const r = 0.12 * rc + 0.15; m.makeScale(r, th + rc * 0.6, r).setPosition(x, y, z); tm.setMatrixAt(i, m); });
    tm.castShadow = tm.receiveShadow = true;
    scene.add(tm);
  }
  {
    // one merged mesh for every braid
    let nv = 0, ni = 0;
    for (const g of archGeos) { nv += g.attributes.position.count; ni += g.index.count; }
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), I = new Uint32Array(ni);
    let ov = 0, oi = 0;
    for (const g of archGeos) {
      P.set(g.attributes.position.array, ov * 3); N.set(g.attributes.normal.array, ov * 3);
      const idx = g.index.array; for (let i = 0; i < idx.length; i++) I[oi + i] = idx[i] + ov;
      ov += g.attributes.position.count; oi += idx.length; g.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(P, 3)); g.setAttribute("normal", new THREE.BufferAttribute(N, 3)); g.setIndex(new THREE.BufferAttribute(I, 1));
    const m = new THREE.Mesh(g, bark); m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
  {
    const vm = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 0.5, 1, 5, 8, true).translate(0, -0.5, 0),
      patch(new THREE.MeshStandardMaterial({ roughness: 0.75, side: THREE.DoubleSide }), "shade-vine", VINE), vines.length);
    const m = new THREE.Matrix4();
    vines.forEach(([x, y, z, L, w], i) => vm.setMatrixAt(i, m.makeScale(w, L, w).setPosition(x, y, z)));
    vm.castShadow = true; vm.receiveShadow = true;
    vm.computeBoundingSphere();
    scene.add(vm);
  }

  // ---- ground (two halves either side of the canal) and the canal water
  const groundMat = patch(new THREE.MeshStandardMaterial({ roughness: 0.95 }), "shade-ground", GROUND);
  for (const side of [-1, 1]) {
    const g = new THREE.PlaneGeometry(3000, 6000).rotateX(-Math.PI / 2).translate(side * (CANAL + 1500), 0, -2000);
    const m = new THREE.Mesh(g, groundMat); m.receiveShadow = true; scene.add(m);
  }
  {
    const g = new THREE.PlaneGeometry(CANAL * 2, 2600).rotateX(-Math.PI / 2).translate(0, -1.1, CAM.z + 60 - 1300);
    const m = new THREE.Mesh(g, patch(new THREE.MeshStandardMaterial({ roughness: 0.06 }), "shade-water", WATER)); m.receiveShadow = true; scene.add(m);
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

  // ---- birds: a flock of swifts over the avenue and storks circling in a thermal
  const birdGeo = (() => {
    // wings along x, forward is +z; aW is 0 at the body and 1 at the wing tips
    const P = [0, 0, 0.32, 0.06, 0, 0.04, 0, 0, -0.3, -0.06, 0, 0.04,
      0.04, 0, 0.12, 0.5, 0, 0.0, 0.04, 0, -0.06, 0.5, 0, 0.0, 1.0, 0, -0.22, 0.48, 0, -0.1,
      -0.04, 0, 0.12, -0.5, 0, 0.0, -0.04, 0, -0.06, -0.5, 0, 0.0, -1.0, 0, -0.22, -0.48, 0, -0.1];
    const W = P.filter((_, i) => i % 3 === 0).map((x) => Math.abs(x));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute("aW", new THREE.Float32BufferAttribute(W, 1));
    g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    return g;
  })();
  const birdMat = new THREE.ShaderMaterial({
    uniforms: SU, side: THREE.DoubleSide,
    vertexShader: `${GLSL_COMMON}
      attribute float aW; attribute vec3 aF; varying vec3 vW;
      void main(){
        vec3 p = position;
        float s = sin(uTime * aF.y + aF.x);
        p.y += s * aW * aF.z; p.x *= 1. - 0.15 * abs(s) * aW;
        vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.);
        vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `${GLSL_COMMON}
      varying vec3 vW;
      void main(){ gl_FragColor = vec4(applyHaze(vec3(0.018, 0.017, 0.016), vW), 1.); }`,
  });
  const SWIFTS = 46, STORKS = 6;
  const birds = new THREE.InstancedMesh(birdGeo, birdMat, SWIFTS + STORKS);
  birds.frustumCulled = false;
  {
    const F = new Float32Array((SWIFTS + STORKS) * 3);
    for (let i = 0; i < SWIFTS + STORKS; i++) {
      const stork = i >= SWIFTS;
      F[i * 3] = D() * TAU; F[i * 3 + 1] = stork ? 3.2 : 15 + D() * 6; F[i * 3 + 2] = stork ? 0.05 : 0.5;
    }
    birdGeo.setAttribute("aF", new THREE.InstancedBufferAttribute(F, 3));
  }
  scene.add(birds);
  const birdState = Array.from({ length: SWIFTS + STORKS }, (_, i) => ({
    a: D() * TAU, b: D() * TAU, r: 6 + D() * 16, w: 0.6 + D() * 0.5, h: D() * TAU, ph: D() * 100,
    p: new THREE.Vector3(), prev: new THREE.Vector3(), first: true, stork: i >= SWIFTS,
  }));
  const dummy = new THREE.Object3D(), vel = new THREE.Vector3();
  function birdPos(b, t, out) {
    if (b.stork) {                                           // wide slow circles, each bird at its own height in the column
      const a = t * 0.2 * b.w + b.a;
      return out.set(30 + Math.cos(a) * (20 + b.r), 172 + b.r * 1.8 + Math.sin(t * 0.07 + b.h) * 4, -330 + Math.sin(a) * (20 + b.r));
    }
    // the flock wanders on a slow figure of eight over the avenue; every swift loops around it at its own pace
    const cx = 18 * Math.sin(t * 0.11) + 26 * Math.sin(t * 0.047 + 1), cz = -150 + 35 * Math.sin(t * 0.083), cy = 134 + 8 * Math.sin(t * 0.13);
    const a = t * b.w * 1.4 + b.a, c = t * b.w * 0.9 + b.b;
    return out.set(cx + Math.cos(a) * b.r * 1.6, cy + Math.sin(c) * b.r * 0.35 + Math.sin(t * 0.5 + b.h) * 2, cz + Math.sin(a) * b.r);
  }
  function updateBirds(t) {
    birdState.forEach((b, i) => {
      b.prev.copy(b.p);
      birdPos(b, t + b.ph * 0.02, b.p);
      if (b.first) { birdPos(b, t + b.ph * 0.02 - 0.05, b.prev); b.first = false; }
      vel.subVectors(b.p, b.prev);
      if (vel.lengthSq() < 1e-8) vel.set(0, 0, 1);
      dummy.position.copy(b.p);
      dummy.up.copy(up);
      dummy.lookAt(vel.add(b.p));
      const turn = Math.sin(t * b.w * 1.4 + b.a);
      dummy.rotateZ(b.stork ? 0.55 : 0.6 * turn);         // bank into the turn
      dummy.scale.setScalar(b.stork ? 2.3 : 0.55);
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
  const moteU = { ...SU, uScale: { value: 600 }, uBox0: { value: new THREE.Vector3(CAM.x - 60, 22, CAM.z - 150) }, uBox: { value: new THREE.Vector3(120, 60, 140) } };
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
    for (const x of [-560, 640]) for (const y of [0, 280]) for (const z of [CAM.z + 40, -1250]) { v.set(x, y, z).applyMatrix4(inv); lo.min(v); hi.max(v); }
    sc.left = lo.x; sc.right = hi.x; sc.bottom = lo.y; sc.top = hi.y; sc.near = Math.max(1, -hi.z - 400); sc.far = -lo.z + 50;
    sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6; sun.shadow.radius = 2;
    renderer.shadowMap.needsUpdate = true;
  }

  // ---- sizing, input, loop
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener("pointermove", (e) => { mouse.tx = (e.clientX / innerWidth - 0.5) * 2; mouse.ty = -(e.clientY / innerHeight - 0.5) * 2; }, { passive: true });
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

  let last = performance.now(), raf = 0, visible = true, slow = 0, tNow = reduced ? 40 : 0;
  function frame(dt) {
    tNow += dt;
    const t = tNow;
    SU.uTime.value = t;
    mouse.x += (mouse.tx - mouse.x) * 0.03; mouse.y += (mouse.ty - mouse.y) * 0.03;
    // a tripod in a light breeze: the frame barely moves
    camera.position.set(CAM.x + mouse.x * 5 + Math.sin(t * 0.13) * 0.6, CAM.y + mouse.y * 1.6 + Math.sin(t * 0.21) * 0.2, CAM.z);
    camera.lookAt(target.x + mouse.x * 3, target.y + mouse.y * 2 + Math.sin(t * 0.17) * 0.3, target.z);
    sky.position.copy(camera.position);

    for (const c of cables) {
      const L = c.X1 - c.X0;
      c.cabs.forEach((g, i) => {
        const u = ((t * 3.2 / L + i / c.cabs.length) % 1 + 1) % 1, x = c.dir > 0 ? c.X0 + u * L : c.X1 - u * L;
        g.position.set(x, c.yAt(x), c.z);
        g.visible = u > 0.02 && u < 0.98;
      });
    }
    updateBirds(t);

    camera.updateMatrixWorld();
    horizon.set(camera.position.x, 0, camera.position.z - 2600).project(camera);
    post.U.uHorizon.value = horizon.y * 0.5 + 0.5;
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
  if (reduced) frame(0.016); else raf = requestAnimationFrame((n) => { last = n; loop(n); });
  return { renderer, frame, scene, camera, SU, stats: { boxes: boxes.length, trees: trees.length, blobs: nBlobs, shrubs: nShrubs, arches: archGeos.length, vines: vines.length } };
}

// ---------------------------------------------------------------- composite: heat shimmer, ACES, warm grade, lens
const COMP_FRAG = /* glsl */`
uniform sampler2D tScene, tBloom;
uniform vec2 uRes;
uniform float uTime, uExposure, uBloom, uHorizon;
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
  vec3 c = toSRGB(aces(col));
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c += vec3(-0.010, 0.004, 0.006) * (1.0 - l) * (1.0 - l);   // cool green in the deep shade
  c += vec3(0.03, 0.012, -0.03) * l * l;                     // warm, bleached highlights
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.12);
  float vig = smoothstep(1.1, 0.3, length(q * vec2(1.0, 1.15)));
  c *= mix(0.72, 1.0, vig);
  c += (h21(vUv * uRes + fract(uTime * 7.31) * 113.) - 0.5) * 0.014;
  gl_FragColor = vec4(c, 1.);
}`;
