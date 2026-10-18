// Space vehicles of the Torus scene: the crew ferry that docks on the underside of the hub, and the elevator cars that
// run up and down the six spokes. Everything here is a child of the spinning station group, in its own frame
// (y is the spin axis; the hub's underside dock is at y ≈ -215; spoke k runs along (cos a, 0, sin a) with
// a = api.SPOKES[k], from the hub's rim (r = api.HUB_R) to the ring's inner face (r = R - RT)).
// Contract: buildSpace(api) builds meshes into api.station and returns { update(t) }, called every frame with the
// scene time in seconds.
//
// The ferry is a capsule on a service module with four sun-tracking solar wings, ~14 m tall and 29 m across the
// wings. Every two minutes it arrives from far below: a braking burn tail-first, a flip, RCS braking to a hold point
// 40 m out, then a slow final approach while it rolls up to match the station's spin (it comes in non-rotating), soft
// capture by the port's extended ring, 30 s docked, undocking, spin-down, backing out, a flip and the departure burn.
// The elevators are capsule cabins on twin rails along the lower flanks of each spoke, two per spoke in counter-motion.
// All surfaces use one shader (CRAFT_FRAG): MLI blankets, gold and silver foil, solar cells, tiles, paint, glass,
// lit cabin windows; hard sun shadows come from analytic ray tests against the big shapes (the ferry's body and
// wings, the spokes, hub and docking disc). RCS puffs and the engine plume are additive cones and points.

const OMEGA = Math.PI * 2 / 60;              // the station turns once a minute
const S = 1.5;                               // the ferry and its port are drawn at 1.5x these dimensions (metres)
const RHO = 10.6;                            // the rails' running surface, measured from the spoke's axis
const SIDE = 50 * Math.PI / 180;             // the tracks run along both lower flanks of a spoke, 50° below level

// ---------------------------------------------------------------- one surface shader for everything here
const CRAFT_VERT = ["attribute vec2 aU; attribute vec4 aM; varying vec2 vU; varying vec4 vM;", "vU = aU; vM = aM;"];
const craftFrag = (GLSL_COMMON) => /* glsl */`
${GLSL_COMMON}
varying vec3 vP, vN; varying vec2 vU; varying vec4 vM;   // vU: surface coordinates in metres; vM: material, two parameters, occlusion
#ifdef SHUTTLE
uniform mat4 uCraft;                  // station frame -> the ferry's own frame
uniform vec3 uWC[4], uWA[4], uWB[4];  // its solar wings there: centre, half extents along and across
uniform float uHeat;                  // the main engine's nozzle, glowing during and after a burn
#endif
uniform vec3 uSpotP[2], uSpotD[2];    // floodlights: the port's, shining down the axis, and the ferry's, on its nose
uniform float uSpotI[2];
vec3 spots(vec3 p, vec3 n){
  vec3 s = vec3(0.);
  for (int i = 0; i < 2; i++) {
    vec3 L = uSpotP[i] - p; float d2 = dot(L, L); L *= inversesqrt(d2);
    s += uSpotI[i] * max(dot(n, L), 0.) * smoothstep(.35, .8, dot(-L, uSpotD[i])) / (d2 + 4.);
  }
  return s * vec3(1., .93, .82);
}
// does the ray o + l t (t > 0) pass through a solid cylinder round the axis d (unit, through the origin), radius r, s0 < s < s1?
float hitCyl(vec3 o, vec3 l, vec3 d, float r, float s0, float s1){
  float od = dot(o, d), ld = dot(l, d);
  vec3 po = o - d * od, lo = l - d * ld;
  float A = dot(lo, lo), B = dot(po, lo), C = dot(po, po) - r * r, D = B * B - A * C;
  if (A < 1e-8 || D <= 0.) return 0.;
  float q = sqrt(D), t0 = C < 0. ? .02 : max((-B - q) / A, .02), t1 = (-B + q) / A;
  if (t1 <= t0) return 0.;
  if (abs(ld) < 1e-6) return step(s0, od) * step(od, s1);
  float a = (s0 - od) / ld, b = (s1 - od) / ld;
  return step(max(t0, min(a, b)), min(t1, max(a, b)));
}
// sunlight reaching p (station frame): 0 in the shadow of the big shapes
float sunVis(vec3 p){
  vec3 l = uSunL, Y = vec3(0., 1., 0.);
  // (each radius a little inside the real surface, so the surface does not shadow itself)
  float lit = (1. - hitCyl(p, l, Y, 31.5, -215., -205.)) * (1. - hitCyl(p, l, Y, 16.6, -205., 200.)) * (1. - hitCyl(p, l, Y, 71.5, -69., 69.));
#ifdef SHUTTLE
  vec3 o = (uCraft * vec4(p, 1.)).xyz, lc = normalize(mat3(uCraft) * l);
  lit *= 1. - hitCyl(o, lc, Y, 2., -3.62, -.2);                                     // service module
  if (o.y < .3) lit *= (1. - hitCyl(o, lc, Y, 2.45, .3, .42)) * (1. - hitCyl(o, lc, Y, 1.75, .42, 3.4));   // the capsule above it
  for (int i = 0; i < 4; i++) {                                                     // the solar wings
    vec3 A = uWA[i], B = uWB[i], nw = normalize(cross(A, B));
    float dn = dot(lc, nw);
    if (abs(dn) > 1e-4) {
      float t = dot(uWC[i] - o, nw) / dn;
      vec3 q = o + lc * t - uWC[i];
      if (t > .06 && abs(dot(q, A)) < dot(A, A) && abs(dot(q, B)) < dot(B, B)) lit = 0.;
    }
  }
#else
  float a = atan(p.z, p.x), k = floor((a - .26) / 1.0471976 + .5), ak = .26 + k * 1.0471976;
  lit *= 1. - hitCyl(p, l, vec3(cos(ak), 0., sin(ak)), 7.4, 60., 790.);              // the nearest spoke
#endif
  return lit;
}
// bump mapping from a height h (metres) without tangents
vec3 bumpN(vec3 n, vec3 p, float h){
  vec3 dpx = dFdx(p), dpy = dFdy(p), r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  if (abs(det) < 1e-14) return n;
  return normalize(abs(det) * n - sign(det) * (dFdx(h) * r1 + dFdy(h) * r2));
}
// anti-aliased grid lines of half width w (in cells) on x; fades to their average coverage when a cell is under a pixel
float lines(float x, float w){
  float d = fwidth(x) + 1e-5, f = abs(fract(x + .5) - .5);
  return mix(1. - smoothstep(w - d, w + d, f), min(2. * w, 1.), smoothstep(.2, .5, d));
}
void main(){
  vec3 p = vP, n = normalize(vN), V = normalize(uCamL - p);
  if (!gl_FrontFacing) n = -n;
  float id = floor(vM.x + .5);
  vec2 u = vU, fw = fwidth(u);
  float px = max(fw.x, fw.y), near = 1. - smoothstep(.02, .12, px);   // metres per pixel; fine detail only close up
  vec3 alb = vec3(.5), sc = vec3(.04), emis = vec3(0.);
  float sp = 30., h = 0.;
  if (id < .5) {                                       // 0 white MLI blanket: quilted, soft wrinkles, taped seams
    float seam = max(lines(u.x / 1.2, .02), lines(u.y / .9, .025));
    float tie = (1. - smoothstep(.025, .05, length(fract(u / .3) - .5))) * near;
    h = (fbm(u * 1.6) * .022 + (1. - abs(vnoise(u * vec2(3., 7.)) * 2. - 1.)) * .007 + vnoise(u * 11.) * .003) * near - tie * .006;
    alb = vec3(.56, .56, .54) * (.9 + .14 * fbm(u * .6 + 3.)) * (.94 + .1 * hash12(floor(u / vec2(1.2, .9)))) * (1. - .22 * seam) * (1. - .2 * tie);
    sc = vec3(.06); sp = 9.;
  } else if (id < 1.5) {                               // 1 gold kapton foil, crinkled
    h = (fbm(u * 5.) * .02 + vnoise(u * 21.) * .005) * near;
    alb = vec3(.07, .045, .012); sc = vec3(.9, .6, .22); sp = 60.;
  } else if (id < 2.5) {                               // 2 aluminised foil
    h = (fbm(u * 4.) * .02 + vnoise(u * 19.) * .005) * near;
    alb = vec3(.05); sc = vec3(.82, .83, .85); sp = 55.;
  } else if (id < 3.5) {                               // 3 solar cells under cover glass
    vec2 c = u / vM.y;
    float gap = max(lines(c.x, .03), lines(c.y, .03)), bus = lines(c.x * 4., .03) * near * .5;
    float hc = hash12(floor(c));
    alb = mix(vec3(.010, .016, .045) * (.8 + .4 * hc), vec3(.2, .21, .23), max(gap * .8, bus * .3));
    sc = vec3(.05); sp = 1400.;
  } else if (id < 4.5) {                               // 4 white composite: array backs, adapters, structure
    float rib = max(lines(u.x / vM.y, .03), lines(u.y / vM.y, .03));
    alb = vec3(.5, .5, .48) * (1. - .25 * rib) * (.92 + .1 * vnoise(u * 1.3));
    sc = vec3(.04); sp = 14.;
  } else if (id < 5.5) {                               // 5 heat-resistant tiles, a painted band at v = vM.z
    vec2 c = u / vM.y;
    float seam = max(lines(c.x, .04), lines(c.y, .04)), ht = hash12(floor(c));
    alb = vec3(.6, .6, .6) * (.86 + .12 * ht) * (1. - .45 * seam);
    float band = 1. - smoothstep(.16, .16 + px, abs(u.y - vM.z));
    alb = mix(alb, vec3(.02, .05, .16), band);
    sc = vec3(.045); sp = 18.;
    h = -seam * .004 * near;
  } else if (id < 6.5) {                               // 6 black: paint, ablator, thruster ports
    alb = vec3(.022); sc = vec3(.04); sp = 24.;
  } else if (id < 7.5) {                               // 7 window glass, a faint glow from the cabin
    alb = vec3(.003); sc = vec3(.05); sp = 3000.;
    emis = vec3(1., .72, .45) * vM.y * .08;
  } else if (id < 8.5) {                               // 8 aluminium, brushed
    alb = vec3(.13); sc = vec3(.62, .63, .65); sp = 45. + 30. * vnoise(vec2(u.x * 40., u.y * .5));
  } else if (id < 9.5) {                               // 9 dark anodised metal
    alb = vec3(.045, .047, .05); sc = vec3(.14); sp = 35.;
  } else if (id < 10.5) {                              // 10 radiator panels: white coating over fluid lines
    float tube = lines(u.x / .16, .12), edge = max(lines(u.y / vM.y, .02), 0.);
    alb = vec3(.74, .74, .72) * (1. - .12 * tube) * (1. - .2 * edge);
    sc = vec3(.04); sp = 20.;
  } else if (id < 11.5) {                              // 11 engine nozzle (u.y: 0 at the throat, 1 at the exit)
    alb = vec3(.035, .036, .045); sc = vec3(.25, .26, .3); sp = 30.;
#ifdef SHUTTLE
    float g = uHeat * pow(1. - u.y, 1.6);
    emis = vec3(1., .3, .06) * g * 5. + vec3(1., .75, .4) * g * g * 4.;
#endif
  } else if (id < 12.5) {                              // 12 lamp lens
    alb = vec3(.2); emis = vec3(1., .95, .86) * vM.y; sp = 200.;
  } else if (id < 13.5) {                              // 13 paint: 0 deep blue, 1 handrail yellow, 2 signal orange
    alb = vM.y < .5 ? vec3(.02, .05, .17) : vM.y < 1.5 ? vec3(.5, .36, .05) : vec3(.5, .15, .03);
    sc = vec3(.04); sp = 60.;
  } else if (id < 14.5) {                              // 14 lit cabin windows: panes vM.y apart, warm light inside
    float fr = lines(u.y / vM.y, .07), pane = 1. - fr, room = hash12(vec2(floor(u.y / vM.y), 3.));
    alb = mix(vec3(.004), vec3(.05), fr); sc = vec3(.05) * pane; sp = 2500.;
    float lamp = mix(.55, 1., room) * (1. - .45 * smoothstep(.3, .97, abs(u.x - .97)));
    emis = vec3(1., .8, .55) * vM.z * pane * lamp;
  } else if (id < 15.5) {                              // 15 rail steel
    alb = vec3(.09); sc = vec3(.45, .45, .46); sp = 70.;
  } else {                                             // 16 white paint, glossy, with panel lines
    float seam = max(lines(u.x / 1.9, .008), lines(u.y / 1.6, .01));
    alb = vec3(.6, .6, .58) * (1. - .18 * seam); sc = vec3(.04); sp = 70.;
  }
  n = bumpN(n, p, h);
  float sh = sunVis(p), ndl = max(dot(n, uSunL), 0.) * sh, ndv = max(dot(n, V), 1e-3);
  vec3 H = normalize(uSunL + V);
  float gloss = smoothstep(8., 90., sp);
  vec3 F = sc + (1. - sc) * pow(1. - ndv, 5.) * gloss;
  vec3 SUN = vec3(3.4, 3.25, 3.0);
  // sunlight, a little earthshine from the planet's day side (dimmed in crevices), a highlight and Earth in the mirror
  vec3 c = alb * (SUN * ndl + vec3(.012, .015, .025) * vM.w + vec3(.07, .10, .16) * max(dot(n, uEarthL), 0.) * vM.w)
    + SUN * F * ((sp + 8.) / 25.13 * pow(max(dot(n, H), 0.), sp) * ndl)
    + F * earthSeen(reflect(-V, n)) * 2.5 * gloss + sc * vec3(.07, .10, .16) * max(dot(n, uEarthL), 0.) * .5 * (1. - gloss)
    + alb * spots(p, n) + emis;
  gl_FragColor = vec4(c, 1.);
}`;

// ---------------------------------------------------------------- lights and thruster plumes
// aG: kind (0 strobe, 1 steady, 2 a thruster: lit while uFire[phase] > 0), phase, size in pixels, brightness
const GLOW_VERT = /* glsl */`
uniform float uTime, uPx, uFade, uFire[NF];
attribute vec4 aG; attribute vec3 aC;
varying vec3 vC;
void main(){
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.);
  float b = aG.w;
  if (aG.x < .5) { float ph = fract(uTime * .75 + aG.y + dot(modelMatrix[3].xyz, vec3(.0071, .0013, .0057))); b *= exp(-ph * 45.) * 5. + exp(-abs(ph - .1) * 45.) * 2.5; }
  else if (aG.x > 1.5) b *= uFire[int(aG.y + .5)];
  vC = aC * b * uFade;
  gl_PointSize = uPx * aG.z;
}`;
const GLOW_FRAG = /* glsl */`
varying vec3 vC;
void main(){ float d = length(gl_PointCoord - .5) * 2.; gl_FragColor = vec4(vC * exp(-d * d * 5.) * 3., 1.); }`;
// aT: which thruster, and how far along its plume (0 at the nozzle, 1 at the end)
const PLUME_VERT = /* glsl */`
uniform float uFire[NF];
attribute vec2 aT;
varying float vF, vZ, vMain; varying vec3 vNv, vV;
void main(){
  vF = uFire[int(aT.x + .5)]; vZ = aT.y; vMain = step(15.5, aT.x);
  vec4 mv = modelViewMatrix * vec4(position * step(.002, vF), 1.);
  vNv = normalMatrix * normal; vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const PLUME_FRAG = /* glsl */`
uniform vec3 uCol[2];
varying float vF, vZ, vMain; varying vec3 vNv, vV;
void main(){
  float face = abs(dot(normalize(vNv), normalize(vV)));
  // RCS: a bright puff close to the nozzle; the main engine: a faint, wide plume with a short hot core
  float k = mix(pow(1. - vZ, 2.5), pow(1. - vZ, 3.) * .25 + pow(1. - vZ, 14.) * 1.4, vMain);
  gl_FragColor = vec4(mix(uCol[0], uCol[1], vMain) * vF * k * face * face, 1.);
}`;

// ---------------------------------------------------------------- building blocks
const hsh = (a, b) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};
// monotone cubic through keyframes [[x, y], ...]: no overshoot, flat where a value holds
function curve(K) {
  const n = K.length, d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((K[i + 1][1] - K[i][1]) / (K[i + 1][0] - K[i][0]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    const h0 = K[i][0] - K[i - 1][0], h1 = K[i + 1][0] - K[i][0], w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
    m[i] = d[i - 1] * d[i] <= 0 ? 0 : (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  return (x) => {
    if (x <= K[0][0]) return K[0][1];
    let i = 0;
    while (i < n - 2 && x > K[i + 1][0]) i++;
    const h = K[i + 1][0] - K[i][0], s = Math.min(1, (x - K[i][0]) / h), s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * K[i][1] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * K[i + 1][1] + (s3 - s2) * h * m[i + 1];
  };
}

export function buildSpace(api) {
  const { THREE, station, mat, ST_VERT, GLSL_COMMON, navPoints, R, RT, TAU, HUB_R, SPOKES, smooth } = api;
  const V3 = THREE.Vector3, Y = new V3(0, 1, 0);
  const navU = navPoints([0, 0, 0], [1, 0, 0, 0]).material.uniforms;      // shares uTime and the pixel ratio with the station's lights
  const FRAG = craftFrag(GLSL_COMMON), VERT = ST_VERT(...CRAFT_VERT);
  const spotU = { uSpotP: { value: [new V3(0, -222.6, 0), new V3()] }, uSpotD: { value: [new V3(0, -1, 0), new V3(0, 1, 0)] }, uSpotI: { value: [160, 0] } };
  const stMat = mat(VERT, FRAG, { side: THREE.DoubleSide, uniforms: spotU });
  let tris = 0;

  // a merged mesh from parts: each vertex carries surface coordinates in metres (aU) and its material (aM)
  function kit() {
    const P = [], N = [], U = [], M = [], v = new V3(), nn = new V3(), nm = new THREE.Matrix3();
    return {
      // s: scale of the geometry's uv to metres (cap: for flat ends); box: planar coordinates instead; m: placement
      add(geo, id, { s = [1, 1], cap = 1, box = false, p = 0, q = 0, ao = 1, m = null, ids = null } = {}) {
        const g = geo.index ? geo.toNonIndexed() : geo, pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv;
        if (m) nm.getNormalMatrix(m);
        for (let i = 0; i < pa.count; i++) {
          v.fromBufferAttribute(pa, i); nn.fromBufferAttribute(na, i);
          let a, b;
          if (box || !ua) { const ax = Math.abs(nn.x), ay = Math.abs(nn.y), az = Math.abs(nn.z); [a, b] = ax > ay && ax > az ? [v.z, v.y] : ay > az ? [v.x, v.z] : [v.x, v.y]; }
          else if (Math.abs(nn.y) > 0.999) { a = ua.getX(i) * cap; b = ua.getY(i) * cap; }
          else { a = ua.getX(i) * s[0]; b = ua.getY(i) * s[1]; }
          const k = ids ? ids(nn) : id;
          if (m) { v.applyMatrix4(m); nn.applyMatrix3(nm).normalize(); }
          P.push(v.x, v.y, v.z); N.push(nn.x, nn.y, nn.z); U.push(a, b); M.push(k, p, q, ao);
        }
      },
      geo() {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
        g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
        g.setAttribute("aU", new THREE.Float32BufferAttribute(U, 2));
        g.setAttribute("aM", new THREE.Float32BufferAttribute(M, 4));
        return g;
      },
    };
  }
  const cyl = (rt, rb, h, seg, y, open = true, t0 = 0, tl = TAU) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, t0, tl).translate(0, y, 0);
  // a strip of a cylinder round y centred on angle th (direction (cos th, 0, sin th)), w radians wide
  const strip = (r, h, y, th, w, seg) => cyl(r, r, h, seg, y, true, Math.PI / 2 - th - w / 2, w);
  const rad = (th) => new V3(Math.cos(th), 0, Math.sin(th)), tan = (th) => new V3(-Math.sin(th), 0, Math.cos(th));
  // a placement with axes x, y, z (columns) at o
  const basis = (x, y, z, o) => new THREE.Matrix4().makeBasis(x, y, z).setPosition(o);
  const along = (dir, o) => new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, dir)).setPosition(o);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const mesh = (g, m, parent) => { const o = new THREE.Mesh(g, m); parent.add(o); tris += g.attributes.position.count / 3; return o; };
  // glowing points: [x, y, z, kind, phase, px, brightness, r, g, b] each
  const glowMat = (fire, fade = { value: 1 }) => new THREE.ShaderMaterial({
    vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, defines: { NF: fire.value.length },
    uniforms: { uTime: navU.uTime, uPx: navU.uPx, uFade: fade, uFire: fire },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const glows = (L, m) => {
    const g = new THREE.BufferGeometry(), P = [], G = [], C = [];
    for (const l of L) { P.push(l[0], l[1], l[2]); G.push(l[3], l[4], l[5], l[6]); C.push(l[7], l[8], l[9]); }
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute("aG", new THREE.Float32BufferAttribute(G, 4));
    g.setAttribute("aC", new THREE.Float32BufferAttribute(C, 3));
    const o = new THREE.Points(g, m); o.frustumCulled = false; o.renderOrder = 3;
    return o;
  };
  const WHITE = [1, 0.95, 0.86], RED = [1, 0.1, 0.05], GREEN = [0.12, 1, 0.3], AMBER = [1, 0.62, 0.25];

  // ================================================================ the ferry
  const fire = { value: new Float32Array(17) };          // 16 RCS thrusters (pod k, nozzle j at 4k + j) and the main engine (16)
  const fade = { value: 1 };
  const W = { c: [0, 1, 2, 3].map(() => new V3()), a: [0, 1, 2, 3].map(() => new V3()), b: [0, 1, 2, 3].map(() => new V3()) };
  const shMat = mat(VERT, FRAG, {
    side: THREE.DoubleSide, defines: { SHUTTLE: "" },
    uniforms: { ...spotU, uCraft: { value: new THREE.Matrix4() }, uWC: { value: W.c }, uWA: { value: W.a }, uWB: { value: W.b }, uHeat: { value: 0 } },
  });
  const shuttle = new THREE.Group();
  shuttle.scale.setScalar(S);
  station.add(shuttle);
  const RING_TOP = 4.255;                                 // its docking ring's face, above the centre of mass (unscaled metres)
  const thr = [];                                          // thruster exits: position, exhaust direction
  const wingTh = [0, 1, 2, 3].map((k) => Math.PI / 4 + k * Math.PI / 2), WING_Y = -0.9, WING_R = 2.95;
  {
    const k = kit(), C = TAU;
    // main engine: a radiatively cooled bell (v: 0 at the throat, 1 at the exit), its mount, eight auxiliary thrusters
    const bell = [];
    for (let i = 0; i <= 12; i++) { const s = i / 12; bell.push(new THREE.Vector2(0.17 + 0.4 * (1 - (1 - s) ** 2.2), -3.62 - 1.4 * s)); }
    k.add(new THREE.LatheGeometry(bell, 36), 11, { s: [C * 0.4, 1] });
    k.add(cyl(0.36, 0.22, 0.14, 24, -3.58), 9, { s: [C * 0.3, 0.14] });
    for (let i = 0; i < 8; i++) {
      const th = (i + 0.5) / 8 * TAU;
      k.add(cyl(0.05, 0.11, 0.28, 10, 0), 9, { s: [0.5, 0.28], m: new THREE.Matrix4().makeTranslation(1.45 * Math.cos(th), -3.76, 1.45 * Math.sin(th)) });
    }
    // service module: aft bulkhead and band in gold foil, MLI blankets, radiators, a machined ring at the top
    k.add(cyl(2.05, 2.05, 0.06, 64, -3.53, false), 1, { s: [C * 2.05, 0.06], cap: 4.1 });
    k.add(cyl(2.05, 2.05, 0.42, 64, -3.29), 1, { s: [C * 2.05, 0.42] });
    k.add(cyl(2.05, 2.05, 2.62, 64, -1.79), 0, { s: [C * 2.05, 2.62] });
    k.add(cyl(2.07, 2.07, 0.3, 64, -0.35), 8, { s: [C * 2.07, 0.3] });
    for (let i = 0; i < 8; i++) k.add(strip(2.085, 1.9, -2.0, Math.PI / 8 + i * Math.PI / 4, 0.4, 6), 10, { s: [0.4 * 2.085, 1.9], p: 0.95 });
    // RCS pods with four nozzles each: forward (+y), aft (-y), and both ways round
    for (let p = 0; p < 4; p++) {
      const th = p * Math.PI / 2, r = rad(th), t = tan(th), o = r.clone().multiplyScalar(2.2).setY(-2.0);
      k.add(box(0.34, 0.62, 0.46), 0, { box: true, m: basis(r, Y, t, o) });
      k.add(box(0.1, 0.5, 0.36), 9, { box: true, m: basis(r, Y, t, r.clone().multiplyScalar(2.39).setY(-2.0)) });
      const face = [[o.clone().addScaledVector(Y, 0.31), Y.clone()], [o.clone().addScaledVector(Y, -0.31), Y.clone().negate()],
        [o.clone().addScaledVector(t, 0.23), t.clone()], [o.clone().addScaledVector(t, -0.23), t.clone().negate()]];
      for (const [q, d] of face) {
        k.add(cyl(0.075, 0.035, 0.14, 10, 0.07), 9, { s: [0.4, 0.14], m: along(d, q) });
        thr.push({ p: q.clone().addScaledVector(d, 0.14), d });
      }
    }
    // the four wings' booms and hinges
    for (const th of wingTh) {
      const r = rad(th), t = tan(th);
      k.add(box(0.95, 0.18, 0.18), 9, { box: true, m: basis(r, Y, t, r.clone().multiplyScalar(2.45).setY(WING_Y)) });
      k.add(box(0.14, 0.42, 0.42), 8, { box: true, m: basis(r, Y, t, r.clone().multiplyScalar(2.88).setY(WING_Y)) });
    }
    // crew module adapter, the heat shield's rim, the capsule's tiled backshell with a painted band
    k.add(cyl(2.5, 2.05, 0.5, 64, 0.05), 4, { s: [C * 2.3, 0.5], p: 0.62, ao: 0.7 });
    k.add(cyl(2.52, 2.52, 0.12, 64, 0.36, false), 6, { s: [C * 2.52, 0.12], cap: 5 });
    k.add(cyl(1.0, 2.5, 3.0, 72, 1.92), 5, { s: [C * 1.75, 3.354], p: 0.26, q: 0.62 });
    // windows on the backshell, in black frames; thruster ports
    const cone = (th, y, off) => {   // a point on the backshell and its frame there (tangent, up the slope, normal)
      const r = rad(th), t = tan(th), nrm = r.clone().multiplyScalar(0.894).addScaledVector(Y, 0.447), up = r.clone().multiplyScalar(-0.447).addScaledVector(Y, 0.894);
      return basis(t.negate(), up, nrm, r.clone().multiplyScalar(2.5 - 0.5 * (y - 0.42)).setY(y).addScaledVector(nrm, off));
    };
    for (const th of [0.35, 1.0, Math.PI + 0.35, Math.PI + 1.0]) {
      k.add(new THREE.PlaneGeometry(0.5, 0.6), 6, { box: true, m: cone(th, 2.55, 0.008) });
      k.add(new THREE.PlaneGeometry(0.34, 0.44), 7, { box: true, p: 1, m: cone(th, 2.55, 0.016) });
    }
    for (let i = 0; i < 12; i++) {
      const th = i / 12 * TAU + 0.2, y = i % 2 ? 3.05 : 0.9;
      k.add(new THREE.CircleGeometry(0.07, 10), 6, { m: cone(th, y, 0.01) });
    }
    // forward bay, gold deck, docking tunnel, the docking ring and its three guide petals, floodlights, a camera
    k.add(cyl(0.97, 1.0, 0.36, 48, 3.6), 5, { s: [C * 1.0, 0.36], p: 0.26, q: -9 });
    k.add(new THREE.RingGeometry(0.78, 0.97, 48).rotateX(-Math.PI / 2).translate(0, 3.78, 0), 1, { box: true });
    k.add(cyl(0.78, 0.78, 0.4, 40, 3.98), 8, { s: [C * 0.78, 0.4] });
    k.add(new THREE.TorusGeometry(0.82, 0.055, 8, 48).rotateX(Math.PI / 2).translate(0, 4.2, 0), 8, { s: [C * 0.82, 0.3] });
    k.add(new THREE.RingGeometry(0.6, 0.82, 40).rotateX(-Math.PI / 2).translate(0, 4.2, 0), 9, { box: true });
    for (let i = 0; i < 3; i++) {
      const th = i / 3 * TAU + 0.5, r = rad(th), t = tan(th), up = Y.clone().applyAxisAngle(t, 0.38), out = new V3().crossVectors(t, up);
      k.add(box(0.5, 0.34, 0.03), 8, { box: true, m: basis(t, up, out, r.clone().multiplyScalar(0.7).setY(4.38)) });
    }
    for (const th of [0.9, 0.9 + Math.PI]) k.add(box(0.13, 0.08, 0.13), 12, { box: true, p: 3, m: basis(rad(th), Y, tan(th), rad(th).multiplyScalar(0.88).setY(3.83)) });
    k.add(box(0.15, 0.13, 0.22), 9, { box: true, m: basis(rad(2.4), Y, tan(2.4), rad(2.4).multiplyScalar(0.88).setY(3.85)) });
    mesh(k.geo(), shMat, shuttle);
  }
  // solar wings: three panels each, cells on the front (+y), turned about their long axis to face the sun
  const wings = wingTh.map((th, i) => {
    const k = kit();
    for (let j = 0; j < 3; j++) {
      k.add(box(2.05, 0.045, 2.0).translate(0.12 + 1.025 + j * 2.15, 0, 0), 3, { box: true, p: 0.16, ids: (n) => (n.y > 0.5 ? 3 : 4) });
      if (j) k.add(box(0.1, 0.07, 0.3).translate(0.07 + j * 2.15, -0.01, 0), 9, { box: true });
    }
    k.add(box(6.5, 0.06, 0.09).translate(3.3, -0.05, 0), 9, { box: true });
    const g = new THREE.Group();
    g.position.copy(rad(th).multiplyScalar(WING_R)).setY(WING_Y);
    mesh(k.geo(), shMat, g);
    // tip lights: red and green on opposite wings, strobes on the other two
    g.add(glows([i % 2 ? [6.6, 0, 0, 0, i * 0.25, 5, 1, ...WHITE] : [6.6, 0, 0, 1, 0, 3.5, 1.2, ...(i ? GREEN : RED)]], glowMat(fire, fade)));
    shuttle.add(g);
    return { g, r: rad(th), tg: tan(th) };
  });
  // RCS plumes and the main engine's: frustums from each nozzle exit, drawn only while their thruster fires
  const plumeMat = new THREE.ShaderMaterial({
    vertexShader: PLUME_VERT, fragmentShader: PLUME_FRAG, defines: { NF: 17 },
    uniforms: { uFire: fire, uCol: { value: [new THREE.Color(1.0, 0.86, 0.66), new THREE.Color(0.62, 0.3, 0.15)] } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  {
    const P = [], N = [], A = [];
    const cone = (p, d, i, L, r0, r1) => {
      const g = new THREE.CylinderGeometry(r0, r1, L, 14, 1, true).translate(0, -L / 2, 0).toNonIndexed();
      g.applyMatrix4(along(d.clone().negate(), p));
      const pa = g.attributes.position, na = g.attributes.normal, v = new V3();
      for (let j = 0; j < pa.count; j++) { v.fromBufferAttribute(pa, j); P.push(v.x, v.y, v.z); N.push(na.getX(j), na.getY(j), na.getZ(j)); A.push(i, Math.min(1, v.sub(p).dot(d) / L)); }
    };
    thr.forEach((t, i) => cone(t.p, t.d, i, 2.2, 0.08, 1.0));
    cone(new V3(0, -5.02, 0), Y.clone().negate(), 16, 30, 0.56, 9);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute("aT", new THREE.Float32BufferAttribute(A, 2));
    const o = new THREE.Mesh(g, plumeMat); o.frustumCulled = false; o.renderOrder = 3; shuttle.add(o);
    tris += P.length / 9;
  }
  // lights: docking floodlights on the nose, a flash at each firing nozzle, the engine's glow
  shuttle.add(glows([
    ...[0.9, 0.9 + Math.PI].map((th) => [0.95 * Math.cos(th), 3.86, 0.95 * Math.sin(th), 1, 0, 3, 1.1, ...WHITE]),
    ...thr.map((t, i) => [t.p.x, t.p.y, t.p.z, 2, i, 7, 1.6, 1, 0.9, 0.7]),
    [0, -5.1, 0, 2, 16, 9, 2.2, 1, 0.6, 0.3],
  ], glowMat(fire, fade)));

  // ---- the docking port under the hub (unscaled metres, down from the disc's face at y = -215)
  const port = new THREE.Group();
  port.position.set(0, -215, 0); port.scale.setScalar(S);
  station.add(port);
  const RING_Y = -5.12;                                    // the soft-capture ring's rest position; it reaches 0.3 m further out to meet the ferry
  {
    const k = kit(), C = TAU;
    k.add(cyl(2.6, 2.6, 0.2, 64, -0.1, false), 8, { s: [C * 2.6, 0.2], cap: 5.2 });
    k.add(cyl(1.7, 1.7, 4.0, 48, -2.2), 0, { s: [C * 1.7, 4.0] });
    k.add(cyl(1.712, 1.712, 0.32, 48, -4.04), 1, { s: [C * 1.71, 0.32] });
    for (let i = 0; i < 4; i++) {
      const th = i * Math.PI / 2 + Math.PI / 4, r = rad(th), t = tan(th);
      k.add(box(0.05, 3.2, 0.05), 13, { box: true, p: 1, m: basis(r, Y, t, r.clone().multiplyScalar(1.85).setY(-2.2)) });
      for (const y of [-0.8, -3.6]) k.add(box(0.15, 0.04, 0.04), 13, { box: true, p: 1, m: basis(r, Y, t, r.clone().multiplyScalar(1.77).setY(y)) });
    }
    k.add(cyl(1.7, 1.0, 0.6, 48, -4.5), 8, { s: [C * 1.35, 0.6] });
    k.add(new THREE.RingGeometry(0.78, 1.0, 40).rotateX(Math.PI / 2).translate(0, -4.8, 0), 1, { box: true });
    k.add(cyl(0.78, 0.78, 0.3, 40, -4.95), 8, { s: [C * 0.78, 0.3] });
    // floodlights round the cone
    for (let i = 0; i < 4; i++) { const th = i * Math.PI / 2, r = rad(th); k.add(box(0.12, 0.16, 0.16), 12, { box: true, p: 3, m: basis(r, Y, tan(th), r.clone().multiplyScalar(1.38).setY(-4.52)) }); }
    // the docking target on an arm: a black plate with a white cross, a standoff cross in front of it
    const TX = 2.55;
    k.add(box(0.9, 0.12, 0.12).translate(2.1, -4.3, 0), 9, { box: true });
    k.add(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 32).translate(TX, -4.4, 0), 6, { cap: 0.7 });
    k.add(box(0.56, 0.01, 0.05).translate(TX, -4.425, 0), 16, { box: true });
    k.add(box(0.05, 0.01, 0.56).translate(TX, -4.425, 0), 16, { box: true });
    k.add(box(0.04, 0.4, 0.04).translate(TX, -4.62, 0), 16, { box: true });
    k.add(box(0.26, 0.04, 0.04).translate(TX, -4.82, 0), 16, { box: true });
    k.add(box(0.04, 0.04, 0.26).translate(TX, -4.82, 0), 16, { box: true });
    mesh(k.geo(), stMat, port);
    port.add(glows([
      ...[0, 1, 2, 3].map((i) => [1.45 * Math.cos(i * Math.PI / 2), -4.6, 1.45 * Math.sin(i * Math.PI / 2), 1, 0, 3, 0.9, ...WHITE]),
      ...[0, 1, 2, 3, 4, 5].map((i) => [20.5 * Math.cos(i * TAU / 6), -0.05, 20.5 * Math.sin(i * TAU / 6), 0, i % 2 ? 0.5 : 0, 5, 0.9, ...WHITE]),
      ...[0, 1, 2, 3, 4, 5].map((i) => [20.5 * Math.cos((i + 0.5) * TAU / 6), -0.05, 20.5 * Math.sin((i + 0.5) * TAU / 6), 1, 0, 3, 0.8, ...(i % 2 ? GREEN : AMBER)]),
    ], glowMat({ value: new Float32Array(1) })));
  }
  const capRing = new THREE.Group();
  {
    const k = kit(), C = TAU;
    k.add(cyl(0.8, 0.8, 0.3, 40, 0.15), 8, { s: [C * 0.8, 0.3] });
    k.add(new THREE.TorusGeometry(0.82, 0.055, 8, 48).rotateX(Math.PI / 2), 8, { s: [C * 0.82, 0.3] });
    k.add(new THREE.RingGeometry(0.6, 0.82, 40).rotateX(Math.PI / 2), 9, { box: true });
    for (let i = 0; i < 3; i++) {
      const th = i / 3 * TAU + 0.5 + Math.PI / 3, r = rad(th), t = tan(th), dn = Y.clone().negate().applyAxisAngle(t, -0.38), out = new V3().crossVectors(t, dn);
      k.add(box(0.5, 0.34, 0.03), 8, { box: true, m: basis(t, dn, out, r.clone().multiplyScalar(0.7).setY(-0.18)) });
    }
    mesh(k.geo(), stMat, capRing);
    port.add(capRing);
  }

  // ---- the approach: distance d (m) from the port's ring to the ferry's, by time in the two-minute cycle
  const DIST = curve([[0, 3300], [13, 900], [21, 430], [31, 95], [36, 40], [40, 40], [47, 4], [50, 0], [80, 0], [84, 3], [92, 30], [100, 160], [108, 420], [120, 3300]]);
  // RCS pulses: [from, to, nozzles, pulses per second, share of pulses that fire]
  const G = { fwd: [0, 4, 8, 12], aft: [1, 5, 9, 13], rollP: [2, 6, 10, 14], rollN: [3, 7, 11, 15], pitchN: [5, 12], pitchP: [4, 13] };
  const RCS = [[13, 15, G.pitchN, 5, 0.9], [19, 21, G.pitchP, 5, 0.9], [22, 35, G.fwd, 3, 0.5], [34, 46, G.rollN, 3, 0.45],
    [36, 40, G.aft, 1.5, 0.3], [36, 40, G.fwd, 1.5, 0.3], [40, 41.5, G.aft, 4, 0.8], [45, 49.8, G.fwd, 2.5, 0.55],
    [80.3, 81.2, G.fwd, 6, 1], [80, 92, G.rollP, 3, 0.45], [86, 96, G.fwd, 2.5, 0.5], [100, 102, G.pitchP, 5, 0.9], [106, 108, G.pitchN, 5, 0.9]];
  const BURNS = [[0.5, 12.5], [109, 120.5]];
  const PSI_DOCK = 0.4, ROLL = [34, 46, 80, 92];           // roll up to the station's spin, and back down after undocking
  const q = new THREE.Quaternion(), sunC = new V3();

  // ================================================================ the spoke elevators
  // A track on each lower flank of every spoke: twin I-beam rails and a power rail on A-frames every 10 m, terminals at
  // the hub and at the ring. Rail frame: x along the spoke from the station's axis, y away from the spoke's axis, z across.
  const X0 = 74, X1 = 772, CAB_Y = 4.2, CAB_HALF = 5.6, CMIN = X0 + CAB_HALF + 0.4, CMAX = X1 - CAB_HALF - 0.6;
  const collars = [0.2, 0.5, 0.8].map((t) => HUB_R + (R - RT - HUB_R + 6) * t);
  const sideRot = (sg) => new THREE.Matrix4().makeRotationX(Math.atan2(sg * Math.cos(SIDE), -Math.sin(SIDE)));
  const trackGeo = (() => {
    const k = kit(), L = X1 - X0, xm = (X0 + X1) / 2;
    for (const sg of [-1, 1]) {
      const m = sideRot(sg), at = () => ({ box: true, m, ao: 0.8 });
      for (const z of [-0.8, 0.8]) {
        k.add(box(L, 0.08, 0.32).translate(xm, RHO - 0.04, z), 15, at());
        k.add(box(L, 0.32, 0.07).translate(xm, RHO - 0.24, z), 9, at());
        k.add(box(L, 0.07, 0.28).translate(xm, RHO - 0.435, z), 9, at());
      }
      k.add(box(L, 0.12, 0.12).translate(xm, RHO - 0.3, 0), 8, at());
      for (let x = X0 + 4; x < X1 - 2; x += 10) {
        const base = collars.some((c) => Math.abs(x - c) < 2.3) ? 9.4 : 7.25, hl = RHO - 0.6 - base;
        k.add(box(0.3, 0.25, 2.3).translate(x, RHO - 0.6, 0), 9, at());
        for (const z of [-0.75, 0.75]) k.add(box(0.22, hl, 0.22).translate(x, base + hl / 2, z), 8, at());
        k.add(box(0.7, 0.1, 2.0).translate(x, base + 0.2, 0), 9, at());
      }
      // terminals: a frame round the cabin's hatch, with a lamp, at each end
      for (const [x, s] of [[X0 - 0.9, 1], [X1 + 0.9, -1]]) {
        k.add(box(1.6, 7.6, 6.2).translate(x, RHO + CAB_Y, 0), 4, { box: true, m, p: 1.2 });
        k.add(new THREE.TorusGeometry(1.0, 0.12, 8, 28).rotateY(Math.PI / 2).translate(x + s * 0.85, RHO + CAB_Y, 0), 8, { m });
        k.add(new THREE.CircleGeometry(0.95, 24).rotateY(s * Math.PI / 2).translate(x + s * 0.81, RHO + CAB_Y, 0), 6, { m });
        k.add(box(0.2, 0.2, 0.5).translate(x + s * 0.85, RHO + CAB_Y + 3.0, 0), 12, { box: true, m, p: 2 });
      }
    }
    return k.geo();
  })();
  const trackGlows = (() => {
    const L = [];
    for (const sg of [-1, 1]) {
      const m = sideRot(sg), v = new V3();
      for (let x = X0 + 44; x < X1 - 20; x += 50) { v.set(x, RHO - 0.6, 1.25).applyMatrix4(m); L.push([v.x, v.y, v.z, 1, 0, 2.5, 0.35, ...AMBER]); }
      for (const x of [X0 - 0.05, X1 + 0.05]) { v.set(x, RHO + CAB_Y + 3.0, 0).applyMatrix4(m); L.push([v.x, v.y, v.z, 1, 0, 3, 0.8, ...WHITE]); }
    }
    return L;
  })();
  const one = { value: new Float32Array(1) }, carGlowMat = glowMat(one);
  const spokeGroups = SPOKES.map((a) => {
    const g = new THREE.Group(); g.rotation.y = -a; station.add(g);
    mesh(trackGeo, stMat, g);
    g.add(glows(trackGlows, carGlowMat));
    return g;
  });
  // the cabin: a capsule with a band of lit windows each side, hatches at both ends, on a carriage gripping both rails
  // (car frame: x along the spoke, y away from it, origin on the rails' running surface)
  const carGeo = (() => {
    const k = kit(), C = TAU, r = 2.3, half = 3.1, cy = CAB_Y;
    const ax = (g) => g.rotateZ(-Math.PI / 2).translate(0, cy, 0);  // a cylinder along y turned along x
    k.add(ax(new THREE.CylinderGeometry(r, r, 2 * half, 40, 1, true)), 16, { s: [C * r, 2 * half] });
    for (const sg of [-1, 1]) {
      // window band (θ = 0 faces +z, π/2 the carriage, -π/2 the roof), turned 30° toward the roof, and a stripe below it
      const th = sg > 0 ? -0.5 : Math.PI + 0.5;
      k.add(ax(new THREE.CylinderGeometry(r + 0.012, r + 0.012, 2 * half - 0.5, 16, 1, true, th - 0.42, 0.84)), 14, { s: [0.84 * r, 2 * half - 0.5], p: 0.92, q: 1.15 });
      k.add(ax(new THREE.CylinderGeometry(r + 0.01, r + 0.01, 2 * half, 10, 1, true, sg > 0 ? 0 : Math.PI - 0.04, 0.12)), 13, { s: [C * r, 2 * half], p: 0 });
      // the rounded end, its hatch ring, door and two headlamps
      k.add(new THREE.SphereGeometry(r, 40, 10, 0, TAU, 0, Math.PI / 2).rotateZ(-sg * Math.PI / 2).translate(sg * half, cy, 0), 16, { s: [C * r, r * 1.57] });
      k.add(new THREE.TorusGeometry(0.75, 0.09, 8, 28).rotateY(Math.PI / 2).translate(sg * (half + r - 0.04), cy, 0), 8, { s: [5, 0.5] });
      k.add(new THREE.CircleGeometry(0.72, 24).rotateY(sg * Math.PI / 2).translate(sg * (half + r + 0.01), cy, 0), 9, {});
      for (const z of [-1.0, 1.0]) k.add(box(0.12, 0.22, 0.34).translate(sg * (half + 1.65 + 0.03), cy - 1.25, z), 12, { box: true, p: 4 });
    }
    // roof: an equipment pod with a radiator, a mast for the strobe
    k.add(box(3.6, 0.4, 1.4).translate(0, cy + r + 0.1, 0), 9, { box: true });
    k.add(box(3.0, 0.05, 1.3).translate(0, cy + r + 0.33, 0), 10, { box: true, p: 1.5 });
    k.add(box(0.1, 0.5, 0.1).translate(1.6, cy + r + 0.5, 0), 9, { box: true });
    // carriage: pylons, a beam, two bogies with wheels on top of each rail and under its flange
    for (const x of [-2.2, 2.2]) k.add(box(0.8, 1.0, 0.7).translate(x, 1.6, 0), 16, { box: true, ao: 0.7 });
    k.add(box(6.6, 0.5, 1.1).translate(0, 0.95, 0), 8, { box: true, ao: 0.7 });
    for (const x of [-2.7, 2.7]) {
      k.add(box(1.7, 0.45, 2.3).translate(x, 0.5, 0), 9, { box: true, ao: 0.6 });
      for (const z of [-0.8, 0.8]) {
        for (const dx of [-0.45, 0.45]) k.add(new THREE.CylinderGeometry(0.27, 0.27, 0.16, 16).rotateX(Math.PI / 2).translate(x + dx, 0.27, z), 15, { cap: 0.54, ao: 0.6 });
        k.add(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 12).rotateX(Math.PI / 2).translate(x, -0.66, z), 15, { cap: 0.34, ao: 0.6 });
        k.add(box(0.3, 0.95, 0.12).translate(x, -0.2, z + Math.sign(z) * 0.24), 9, { box: true, ao: 0.6 });
      }
    }
    return k.geo();
  })();
  const carLights = [
    ...[-1, 1].flatMap((sg) => [-1, 1].map((z) => [sg * 4.86, CAB_Y - 1.25, z, 1, 0, 3, 1.2, ...WHITE])),
    [-5.2, CAB_Y + 1.1, 0, 1, 0, 3, 0.9, ...RED], [5.2, CAB_Y + 1.1, 0, 1, 0, 3, 0.9, ...GREEN],
    [1.6, CAB_Y + 2.3 + 0.8, 0, 0, 0, 4.5, 0.8, ...WHITE],
  ];
  const cars = [];
  spokeGroups.forEach((g, i) => {
    for (const sg of [1, -1]) {
      const c = new THREE.Group(), e = new V3(0, -Math.sin(SIDE), sg * Math.cos(SIDE));
      c.rotation.x = Math.atan2(sg * Math.cos(SIDE), -Math.sin(SIDE));
      mesh(carGeo, stMat, c);
      c.add(glows(carLights, carGlowMat));
      g.add(c);
      cars.push({ c, e, ph: i * 0.29 + (sg > 0 ? 0 : 0.5) });
    }
  });
  // trip profile: wait 12 s at the hub, 36 s out, wait at the ring, 36 s back; trapezoidal speed (a quarter of a trip
  // accelerating, a quarter braking: ~25 m/s top speed, ~0.3 g)
  const P_CAR = 96, ACC = 0.25;
  const trip = (s) => { const vm = 1 / (1 - ACC); return s < ACC ? 0.5 * vm / ACC * s * s : s < 1 - ACC ? 0.5 * vm * ACC + vm * (s - ACC) : 1 - 0.5 * vm / ACC * (1 - s) ** 2; };
  const carAt = (u) => (u < 0.125 ? 0 : u < 0.5 ? trip((u - 0.125) / 0.375) : u < 0.625 ? 1 : 1 - trip((u - 0.625) / 0.375));

  tris = Math.round(tris);
  return {
    tris,
    update(t) {
      // elevators
      for (const k of cars) {
        const u = ((t / P_CAR + k.ph) % 1 + 1) % 1, x = CMIN + (CMAX - CMIN) * carAt(u);
        k.c.position.set(x, 0, 0).addScaledVector(k.e, RHO);
      }
      // the ferry
      const c = ((t + 20) % 120 + 120) % 120;
      const ext = smooth(37, 42, c) * (1 - smooth(50.5, 55, c));                    // the port's capture ring reaches out, then pulls the ferry in
      capRing.position.y = RING_Y - 0.3 * ext;
      const d = DIST(c);
      fade.value = 1 - smooth(2500, 3150, d);
      shuttle.visible = fade.value > 0;
      if (!shuttle.visible) { spotU.uSpotI.value[1] = 0; return; }
      const yRing = -215 + S * (RING_Y - 0.055 - 0.3 * ext);
      shuttle.position.set(0, yRing - d - S * RING_TOP, 0);
      // attitude: tail first while braking, a flip, nose up; non-rotating far out, matched to the station's spin docked
      const pitch = Math.PI * (1 - smooth(13, 21, c) + smooth(100, 108, c));
      const [r0, r1, r2, r3] = ROLL, Lr = r1 - r0;
      const psi = c < r0 ? PSI_DOCK - OMEGA * (r0 - c + Lr / 2) : c < r1 ? PSI_DOCK - OMEGA * (r1 - c) ** 2 / (2 * Lr)
        : c < r2 ? PSI_DOCK : c < r3 ? PSI_DOCK + OMEGA * (c - r2) ** 2 / (2 * Lr) : PSI_DOCK + OMEGA * (c - r3 + Lr / 2);
      shuttle.rotation.set(pitch, psi, 0, "YXZ");
      shuttle.updateMatrix();
      shMat.uniforms.uCraft.value.copy(shuttle.matrix).invert();
      spotU.uSpotP.value[1].set(0, 3.95, 0).applyMatrix4(shuttle.matrix);
      spotU.uSpotD.value[1].set(0, 1, 0).applyQuaternion(shuttle.quaternion);
      spotU.uSpotI.value[1] = d < 400 ? 160 : 0;
      // thrusters
      fire.value.fill(0);
      for (const [a, b, set, rate, duty] of RCS) {
        if (c < a || c > b) continue;
        const k = Math.floor(c * rate), f = c * rate - k;
        set.forEach((i, j) => { if (hsh(k, i * 7 + j) < duty) fire.value[i] = Math.max(fire.value[i], smooth(0, 0.08, f) * Math.exp(-f * 3.5)); });
      }
      let heat = 0, main = 0;
      for (const [a, b] of BURNS) {
        if (c >= a && c <= b) main = smooth(a, a + 0.6, c) * (1 - smooth(b - 0.6, b, c)) * (0.92 + 0.08 * Math.sin(c * 37));
        heat = Math.max(heat, c < a ? 0 : c <= b ? 1 - Math.exp(-(c - a) / 2.5) : (1 - Math.exp(-(b - a) / 2.5)) * Math.exp(-(c - b) / 4));
      }
      fire.value[16] = main;
      shMat.uniforms.uHeat.value = heat;
      // solar wings track the sun about their long axes; their outlines go to the shadow test
      q.copy(shuttle.quaternion).invert();
      sunC.copy(shMat.uniforms.uSunL.value).applyQuaternion(q);
      for (const [i, w] of wings.entries()) {
        const { r, tg } = w, beta = Math.atan2(sunC.dot(tg), sunC.dot(Y));
        w.g.rotation.set(beta, -wingTh[i], 0, "YXZ");
        W.a[i].copy(r).multiplyScalar(3.2);
        W.c[i].copy(w.g.position).addScaledVector(r, 3.3);
        W.b[i].copy(tg).multiplyScalar(Math.cos(beta)).addScaledVector(Y, -Math.sin(beta));
      }
    },
  };
}
