// Shared post chain for the 3D scenes: HDR scene -> dual-filter bloom -> a scene-specific composite
// (tone mapping, grade, lens). The composite fragment shader gets tScene, tBloom, uRes, uTime, uExposure,
// uBloom and any extra uniforms passed in; `post.U` exposes them.

import * as THREE from "three";

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
export function makePost(renderer, { comp: compFrag, uniforms = {}, bloom = 0.32, thresh = 0.35 } = {}) {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const quad = new THREE.Mesh(geo); quad.frustumCulled = false;
  const sh = (frag, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: POST_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, ...extra });
  const downU = { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: thresh } };
  const downFirst = sh(DOWN_FRAG, downU, { defines: { FIRST: "" } }), down = sh(DOWN_FRAG, downU);
  const upU = { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 } };
  const up = sh(UP_FRAG, upU, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, transparent: true });
  const compU = { tScene: { value: null }, tBloom: { value: null }, uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uExposure: { value: 1.15 }, uBloom: { value: bloom }, ...uniforms };
  const comp = sh(compFrag, compU);
  const W = [1.0, 0.9, 0.8, 0.7, 0.55, 0.4];       // how much each blur level contributes, finest first
  // HDR needs renderable half floats; without them fall back to 8-bit targets (the glow is then softer, nothing breaks)
  const ext = renderer.extensions, hdr = ext.has("EXT_color_buffer_float") || ext.has("EXT_color_buffer_half_float");
  const TYPE = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, type: TYPE };
  let sceneRT = null, mips = [], norm = 1;
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
    compU.uBloom.value = bloom / norm;
    pass(comp, null);
  }
  return { setSize, render, U: compU };
}
