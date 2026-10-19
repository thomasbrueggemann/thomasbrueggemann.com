// Scene: a Stanford torus in space, seen from outside. A ring 1.8 km across turns once a minute about its hub, which
// gives about 1 g on the floor inside. The tube is glazed from the edges of the land round over the top, the inner
// face and the bottom, so you look in on a dense, green city: a river round the whole ring with a monorail over it,
// boats and people on the promenades, quarters of mid-rise blocks with roof gardens, parks, and terraced houses
// climbing the sides of the valley to the glass. The station orbits Earth some 8,000 km up, in an orbit that never
// enters Earth's shadow: every four minutes the planet rolls through the background, a quarter of the sky across and
// always half lit, day on one side of the terminator and city lights on the other; the Moon is a small disc at its
// true size that Earth swallows as it passes. A shuttle comes in to the hub now and then. Drag to orbit, scroll or
// pinch to zoom: from afar you watch the whole wheel turn; close in, the camera rides along with the spin, so the city
// holds still and the stars wheel past. The vehicles live in ./vehicles/.
// Everything is procedural and seeded, the same on every load. Only dependency: three.js.

import * as THREE from "three";
import { makePost } from "./post.js";
import * as CAR from "./vehicles/car.js";
import * as TRAIN from "./vehicles/train.js";
import * as BOAT from "./vehicles/boat.js";
import { buildSpace } from "./vehicles/space.js";

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- the station (metres; y is the spin axis)
// Inside, "up" points at the axis. A point on the land is (θ round the ring, s across it along y, h up), and its
// radius from the axis is R + F(s) - h, where F is how far below the tube's centre the land lies.
const R = 895, RT = 110;                  // ring radius to the tube's centre, tube radius
const SMAX = 99.7, F0 = 70, FDIP = 23.5;   // the land is a valley 70 m below the tube's centre that rises to meet the glass at ±99.7 m (65° round the tube)
const RF = R + F0;                         // the floor's radius at the valley's centre: arc lengths are measured here
const OMEGA = TAU / 60;                    // one turn a minute
const PSI_GLASS = 65 * Math.PI / 180;      // the tube is glass from here round the top, the inner face and the bottom
const TERR = { s0: 66, step: 7 };          // terraces from |s| = 66 m out to the glass
// the opening view (azimuth and elevation of the camera round the station); the sun stands off to its right.
// Inside, "up" points at the axis, so the city reads upright only from below the ring plane: from there the section
// the zoom dives into sits at the bottom of the picture with the hub above it. (From above, it hangs upside down.)
const VIEW0 = { az: 1.18, el: -0.7 };
const E_ANG = 26 * Math.PI / 180;            // Earth's angular radius from 8,000 km up
const E_PERIOD = 240;                        // seconds per orbit (the real one takes four and a half hours)
const { SUN, ORBIT_U, ORBIT_W, MOON_DIR } = (() => {
  const { az, el } = VIEW0;
  const d = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
  const V = d.clone().negate(), right = new THREE.Vector3(Math.sin(az), 0, -Math.cos(az)), up = new THREE.Vector3().crossVectors(right, V);
  const sun = right.clone().multiplyScalar(0.72).addScaledVector(up, 0.55).addScaledVector(d, 0.1).normalize();
  // a dawn-dusk orbit: its plane is square to the sun, so Earth is always seen half lit and never eclipses the station.
  // In the opening view Earth rises from the lower right, passes behind the wheel and sets at the upper left.
  const u = V.clone().addScaledVector(sun, -V.dot(sun)).normalize(), w = new THREE.Vector3().crossVectors(sun, u);
  const moon = V.clone().addScaledVector(right, Math.tan(-0.38)).addScaledVector(up, Math.tan(0.25)).normalize();
  return { SUN: sun, ORBIT_U: u, ORBIT_W: w, MOON_DIR: moon };
})();
const floorF = (s) => { const k = (s / SMAX) ** 2; return F0 - FDIP * k * k; };
const wallF = (s) => Math.sqrt(Math.max(0, RT * RT - s * s));
const landF = (s) => {
  const a = Math.abs(s);
  if (a >= SMAX - 0.01) return floorF(SMAX);
  if (a <= TERR.s0) return floorF(s);
  const k = (a - TERR.s0) / TERR.step, i = Math.floor(k);
  return Math.min(floorF(TERR.s0 + (i + smooth(0.72, 1, k - i)) * TERR.step), wallF(a) - 0.4);
};
// the river round the ring, meandering across the valley; the monorail rides above it
const riverS = (a) => 14 * Math.sin(3 * a + 0.5) + 8 * Math.sin(7 * a + 2) + 4 * Math.sin(13 * a);
const riverW = (a) => 9 + 3 * Math.sin(5 * a + 1);
const urban = (a) => clamp(0.55 + 0.3 * Math.sin(3 * a + 0.7) + 0.2 * Math.sin(7 * a + 2.3) + 0.12 * Math.sin(17 * a + 1.1), 0, 1);
const BLVD = 46;                           // a boulevard runs 46 m out from each bank: a road with a lane each way, sidewalks and trees
// eight market squares along the river, alternating banks: 72 m along the ring, from 12 to 42 m out from the bank
const MARKETS = Array.from({ length: 8 }, (_, k) => ({ th: k * TAU / 8 + 0.31, side: k % 2 ? 1 : -1 }));
const inMarket = (th, side, e) => e > 10 && e < 43 && MARKETS.some((m) => m.side === side && Math.abs(((th - m.th) % TAU + 3 * Math.PI) % TAU - Math.PI) * RF < 36);

// ---------------------------------------------------------------- GLSL shared by everything on the station
const GLSL_COMMON = /* glsl */`
uniform float uTime;
uniform vec3 uSunL, uCamL, uEarthL; // the sun's direction, the camera and the direction to Earth, in the station's own spinning frame
uniform mat4 uInvSt;                // world -> station frame
const float RR = ${R}., RT = ${RT}., SMAX = ${SMAX}, F0 = ${F0}., FDIP = ${FDIP}, RF = ${RF}.;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
  return mix(mix(mix(hash13(i), hash13(i+vec3(1,0,0)), f.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y), f.z); }
const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);
float fbm(vec2 p){ float s = 0., a = .5; for(int i=0;i<4;i++){ s += a*vnoise(p); p = ROT * p * 2.03 + vec2(1.7, 9.2); a *= .5; } return s / .9375; }
float floorF(float s){ float k = s / SMAX; k *= k; return F0 - FDIP * k * k; }
float riverS(float a){ return 14. * sin(3. * a + .5) + 8. * sin(7. * a + 2.) + 4. * sin(13. * a); }
float riverW(float a){ return 9. + 3. * sin(5. * a + 1.); }
float market(float th, float q, float e){       // 1 on a market square (q: signed offset from the river's line, e: from its edge)
  float m = 0.;
  for (int k = 0; k < 8; k++) {
    float d = mod(th - float(k) * .785398 - .31 + 3.14159265, 6.2831853) - 3.14159265;
    float sd = mod(float(k), 2.) < .5 ? -1. : 1.;
    m = max(m, step(abs(d) * RF, 36.) * step(0., q * sd) * step(10., e) * step(e, 43.));
  }
  return m;
}
float urban(float a){ return clamp(.55 + .3 * sin(3. * a + .7) + .2 * sin(7. * a + 2.3) + .12 * sin(17. * a + 1.1), 0., 1.); }
vec3 upAt(vec3 p){ vec2 r = p.xz; return -vec3(r.x, 0., r.y) / max(length(r), 1e-4); }   // on the axis there is no up: zero, not NaN
// light inside: daylight let in through the glass vault, mostly from overhead, a little from one side
vec3 lightAt(vec3 p){ vec3 up = upAt(p); return normalize(up * .7 + vec3(0., -.55, 0.) + vec3(up.z, 0., -up.x) * .35); }
const vec3 LCOL = vec3(2.3, 2.12, 1.82), SKYC = vec3(.24, .30, .39), BOUNCE = vec3(.08, .09, .05), AIR = vec3(.46, .58, .74);
// what a mirror facing along r sees of Earth: its disc, day on the sun side of the terminator
vec3 earthSeen(vec3 r){ float c = dot(r, uEarthL); if (c < ${Math.cos(E_ANG).toFixed(4)}) return vec3(0.);
  return mix(vec3(.002, .004, .01), vec3(.09, .13, .22), smoothstep(-.04, .06, dot(r - uEarthL * c, uSunL))); }
float sdTube(vec3 p){ return length(vec2(length(p.xz) - RR, p.y)) - RT; }
// how much air the view ray crossed inside the tube before reaching p: trace back toward the camera to the glass
// (or to the camera itself, once the zoom has taken it inside)
float airPath(vec3 p, float t){ vec3 rd = uCamL - p; float tm = length(rd); rd /= tm;
  for (int i = 0; i < 18; i++){ if (t >= tm) return tm; float d = -sdTube(p + rd * t); if (d < .25) break; t += d + .05; } return min(t, tm); }
float airT(vec3 p){ return exp(-airPath(p, 0.) / 950.); }
vec3 inAir(vec3 c, vec3 p){ float T = airT(p); return c * T + AIR * (1. - T); }
vec3 shadeIn(vec3 alb, vec3 n, vec3 p, float ao){
  vec3 up = upAt(p); float dif = max(dot(n, lightAt(p)), 0.), sk = .5 + .5 * dot(n, up);
  return alb * (LCOL * dif * mix(.55, 1., ao) + mix(BOUNCE, SKYC, sk) * ao);
}
`;
// every station material works in the station's frame: vP, vN are positions and normals there
const ST_VERT = (decl = "", body = "") => /* glsl */`
${GLSL_COMMON}
${decl}
varying vec3 vP, vN;
void main(){
  mat4 toSt = uInvSt * modelMatrix;
  vec3 pos = position, nrm = normal;
  ${body}
  vP = (toSt * vec4(pos, 1.)).xyz; vN = mat3(toSt) * nrm;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(pos, 1.);
}`;

// ---------------------------------------------------------------- the land: meadow, fields, paving, river, terraces
const TERRAIN_FRAG = /* glsl */`
${GLSL_COMMON}
varying vec3 vP, vN;
void main(){
  vec3 p = vP, n = normalize(vN), up = upAt(p);
  float th = atan(p.z, p.x), s = p.y, u = th * RF;
  float w = riverW(th), q = s - riverS(th), aq = abs(q), ub = urban(th);
  float slope = dot(n, up);
  vec2 g = vec2(u, s);
  float nz = fbm(g * .045), nz2 = vnoise(g * .31);
  vec3 col = mix(vec3(.045, .11, .025), vec3(.11, .19, .045), nz) * (.8 + .4 * nz2);           // meadow
  // open land: fields in strips across the valley, between the quarters
  float open = smoothstep(.42, .25, ub + (fbm(g * .006) - .5) * .5) * step(w + 12., aq) * step(abs(s), 64.);
  float plot = floor(u / 26.) + floor(s / 17.) * 7.;
  float crop = fract(sin(plot * 12.9898) * 43758.5);
  vec3 fieldC = crop < .3 ? vec3(.30, .26, .08) : crop < .6 ? vec3(.08, .18, .03) : crop < .8 ? vec3(.17, .21, .05) : vec3(.17, .12, .06);
  fieldC *= .8 + .4 * step(.5, fract(u / 1.6 + crop * 3.));                                     // furrows
  col = mix(col, fieldC, open * step(.08, fract(u / 26.)) * step(.08, fract(s / 17.)));
  // the quarters: paving between the blocks, with lawns
  float paved = smoothstep(.45, .6, ub + (fbm(g * .02) - .5) * .5) * step(w + 12., aq) * step(abs(s), 64.) * step(.42, fbm(g * .09 + 3.));
  vec3 pave = vec3(.40, .38, .34) * (.85 + .25 * hash12(floor(g / 2.5)));
  col = mix(col, pave, paved * .9);
  // promenades along both banks and the two boulevards
  float bd = abs(aq - w - ${BLVD}.), onB = step(abs(s), 64.);
  float path = smoothstep(2.2, 1.6, abs(aq - w - 4.)) + smoothstep(4.8, 4.2, bd) * onB;
  col = mix(col, vec3(.48, .45, .40) * (.9 + .2 * nz2), clamp(path, 0., 1.));
  // the boulevard's road: asphalt, a dashed centre line, kerbs
  float road = smoothstep(3.3, 3.1, bd) * onB;
  vec3 asph = vec3(.075, .075, .08) * (.85 + .3 * vnoise(g * 1.3));
  asph = mix(asph, vec3(.7, .66, .5), smoothstep(.12, .06, bd) * step(.5, fract(u / 6.)));
  col = mix(col, asph, road);
  // market squares: warm paving in a pattern of squares
  float mk = market(th, q, aq - w);
  vec2 mg = vec2(u, s) / 2.2;
  vec3 mp = mix(vec3(.52, .44, .34), vec3(.44, .36, .28), step(.5, fract((floor(mg.x) + floor(mg.y)) * .5))) * (.9 + .15 * hash12(floor(mg * 2.)));
  col = mix(col, mp, mk);
  // terrace walls, overgrown
  float wall = smoothstep(.93, .75, slope);
  col = mix(col, mix(vec3(.30, .28, .25), vec3(.08, .18, .05), smoothstep(.35, .6, vnoise(g * vec2(.4, 1.5)))), wall);
  vec3 c = shadeIn(col, n, p, 1.);
  // the river: deep green water mirroring the bright air, with the light glinting on it
  float wet = smoothstep(w + .6, w - .4, aq);
  if (wet > 0.) {
    vec3 V = normalize(uCamL - p);
    vec3 wn = normalize(up + vec3(0., (vnoise(g * .7 + uTime * .3) - .5) * .06, 0.) + vec3(up.z, 0., -up.x) * (vnoise(g * .5 - uTime * .25) - .5) * .06);
    float fr = .22 + .78 * pow(1. - max(dot(wn, V), 0.), 5.);
    vec3 water = vec3(.03, .085, .085) * (1. - fr) + AIR * 1.3 * fr + LCOL * pow(max(dot(reflect(-lightAt(p), wn), V), 0.), 120.) * .6;
    water = mix(water, c * .5, smoothstep(w - 2., w, aq) * .5);
    c = mix(c, water, wet);
  }
  gl_FragColor = vec4(inAir(c, p), 1.);
}`;

// ---------------------------------------------------------------- buildings: rendered walls, windows, balcony planters, vines, roof gardens
const BUILD_VERT = ST_VERT("attribute vec4 aF; varying vec4 vF;", "vF = aF;");
const BUILD_FRAG = /* glsl */`
${GLSL_COMMON}
varying vec3 vP, vN; varying vec4 vF;      // across the face (m), height above ground (m), seed, kind (0 wall, 1 roof garden, 2 roof, 3 terrace house roof)
void main(){
  vec3 p = vP, n = normalize(vN);
  float seed = vF.z, kind = vF.w;
  float pal = fract(seed * 7.13);
  vec3 base = pal < .3 ? vec3(.62, .60, .55) : pal < .5 ? vec3(.58, .48, .38) : pal < .65 ? vec3(.52, .32, .22) : pal < .85 ? vec3(.66, .66, .64) : vec3(.30, .40, .44);
  base *= .85 + .3 * fract(seed * 31.7);
  vec3 col; float ao = 1.; vec3 emis = vec3(0.);
  vec2 g = vF.xy;
  if (kind > 3.5) {
    // market stalls: striped awnings in many colours over wooden counters piled with goods
    float pk = fract(seed * 13.7);
    vec3 cA = pk < .2 ? vec3(.7, .1, .08) : pk < .4 ? vec3(.85, .5, .08) : pk < .6 ? vec3(.1, .3, .6) : pk < .8 ? vec3(.12, .45, .2) : vec3(.8, .7, .15);
    if (kind < 4.5) col = mix(cA, vec3(.85, .82, .75), step(.5, fract(g.x / .7)));
    else {
      vec2 gc = floor(g / .35);
      float hg = hash12(gc + seed * 7.);
      vec3 goods = hg < .25 ? vec3(.7, .15, .05) : hg < .5 ? vec3(.8, .6, .1) : hg < .7 ? vec3(.2, .45, .1) : vec3(.5, .3, .15);
      col = mix(vec3(.30, .19, .10), goods, step(.35, g.y) * step(.3, hash12(gc * 1.3)));
    }
  } else if (kind < .5) {
    // facade: floors of 3.4 m, windows every 2.8 m; planters along every second floor; vines climbing from the ground
    vec2 c = vec2(g.x / 2.8, g.y / 3.4);
    vec2 f = fract(c), fw = fwidth(c);
    float aa = smoothstep(.35, .8, max(fw.x, fw.y));
    float win = step(.22, f.x) * step(f.x, .78) * step(.32, f.y) * step(f.y, .86);
    float lit = step(.72, hash12(floor(c) + seed * 17.));
    vec3 glass = mix(vec3(.05, .07, .08), AIR * .35, .4) + vec3(1., .78, .5) * lit * .25;
    col = mix(base, glass, win);
    float greenF = step(.45, fract(seed * 3.7));
    float planter = greenF * step(f.y, .24) * step(.5, fract(c.y * .5)) * step(.25, vnoise(c * vec2(1.3, .7) + seed));
    vec3 leaf = mix(vec3(.035, .09, .02), vec3(.09, .17, .035), vnoise(g * 1.3));
    col = mix(col, leaf, planter);
    // vines: strands climbing from the ground to a ragged height
    float reach = 3. + 22. * vnoise(vec2(g.x * .12, seed * 5.)) * vnoise(vec2(g.x * .5, seed * 9.));
    float vine = smoothstep(.5, .7, vnoise(vec2(g.x * .8, seed * 7.))) * smoothstep(reach, reach - 2.5, g.y + vnoise(g * 1.7) * 2.) * greenF;
    col = mix(col, leaf * (.7 + .5 * vnoise(g * 2.3)), vine);
    vec3 avg = mix(mix(base, glass, .31), leaf, (planter > 0. ? .2 : .1) * greenF);
    col = mix(col, avg, aa);
    emis = vec3(1., .72, .42) * .35 * win * lit * (1. - aa);
    ao = smoothstep(-2., 12., g.y) * .7 + .3;
  } else if (kind < 1.5 || kind > 2.5) {
    // roof gardens: planted beds on a grid with paths between, a plain lawn, or a paved terrace with planter strips
    float ty = fract(seed * 9.1), cs = 3.2;
    vec2 cell = floor(g / cs), f = fract(g / cs);
    float hb = hash12(cell + seed * 13.);
    float aa = smoothstep(.25, .7, max(fwidth(g.x), fwidth(g.y)) / cs);
    vec3 leafy = mix(vec3(.03, .07, .018), vec3(.075, .13, .032), vnoise(g * 2.2 + seed * 7.)) * (.8 + .4 * hb);
    vec3 pave = vec3(.40, .38, .34) * (.9 + .15 * hash12(floor(g / .8)));
    float bed = ty < .45 ? step(.25, hb) * step(.12, f.x) * step(f.x, .88) * step(.12, f.y) * step(f.y, .88)
              : ty < .8 ? 1. - step(abs(fract(g.x / 9. + seed) - .5), .05)
              : step(abs(fract(g.y / 4.) - .5), .14);
    float avgBed = ty < .45 ? .45 : ty < .8 ? .9 : .28;
    col = mix(mix(pave, leafy, bed), mix(pave, leafy * .9, avgBed), aa);
    if (kind > 2.5) col = mix(col, vec3(.55, .28, .20), step(.6, fract(seed * 5.3)));        // some terrace houses keep a tiled roof
  } else {
    // solar roof
    vec2 c = g / vec2(1.8, 1.1);
    col = mix(vec3(.04, .06, .12), vec3(.35, .35, .36), step(.88, max(fract(c.x), fract(c.y))));
  }
  vec3 c = shadeIn(col, n, p, ao) + emis;
  if (kind > .5 && kind < 2.5) c += LCOL * pow(max(dot(reflect(-lightAt(p), n), normalize(uCamL - p)), 0.), 40.) * .08 * step(1.5, kind);
  gl_FragColor = vec4(inAir(c, p), 1.);
}`;

// ---------------------------------------------------------------- trees
const TREE_VERT = ST_VERT("attribute vec4 aT; varying vec4 vT;", "vT = aT;");
const TREE_FRAG = /* glsl */`
${GLSL_COMMON}
varying vec3 vP, vN; varying vec4 vT;      // seed, height in the crown (0..1), palette, radius
void main(){
  vec3 p = vP, n = normalize(vN), up = upAt(p);
  float pal = vT.z;
  vec3 col = pal < .45 ? vec3(.03, .085, .02) : pal < .75 ? vec3(.06, .13, .025) : pal < .95 ? vec3(.10, .15, .035) : pal < .975 ? vec3(.42, .22, .28) : vec3(.40, .30, .08);
  col *= .8 + .4 * fract(vT.x * 13.1);
  // leafy clumps: bend the normal with noise, darken the gaps
  float k = 1.4 / max(vT.w, 1.);
  float c1 = n3(p * k * 2.2 + vT.x * 40.), c2 = n3(p * k * 6.3 - vT.x * 17.);
  n = normalize(n + (vec3(c1, c2, n3(p * k * 3.1 + 7.)) - .5) * 1.1);
  float ao = mix(.35, 1., vT.y) * (.6 + .4 * c2);
  vec3 c = shadeIn(col, n, p, ao);
  // light through the leaves where the crown faces away from it
  c += col * LCOL * .25 * pow(max(dot(normalize(uCamL - p), -lightAt(p)), 0.), 3.) * (1. - vT.y * .5);
  gl_FragColor = vec4(inAir(c, p), 1.);
}`;

// ---------------------------------------------------------------- shadows: soft dark patches on the ground, cast away from the light
// The light comes mostly from overhead, so a tree's shadow lies under it and a block's falls a little to one side.
const SHADOW_VERT = ST_VERT("attribute vec4 aS; varying vec4 vS;", "vS = aS;");
const SHADOW_FRAG = /* glsl */`
${GLSL_COMMON}
varying vec3 vP, vN; varying vec4 vS;      // position on the patch (-1..1), strength, shape (0 round, 1 box)
void main(){
  vec2 q = vS.xy;
  float a = (vS.w > .5 ? smoothstep(1., .82, max(abs(q.x), abs(q.y))) : smoothstep(1., .25, length(q))) * vS.z;
  gl_FragColor = vec4(vec3(mix(1., 1. - a, airT(vP))), 1.);
}`;
const SHADOW_DIR = [-0.5, 0.786];         // ground offset per metre of height, along the ring and across, opposite the light

// ---------------------------------------------------------------- ring vehicles: the monorail and its track, boats, cars
// Each vehicle type lives in its own module in ./vehicles/ (train.js, boat.js, car.js). A module's build(api) adds
// geometry in vehicle coordinates (x along the ring in metres, y across, z up) with an attribute
// aV = (start angle, speed along the ring in m/s, lateral, kind) per vertex: lateral |z| < 1.5 is a fraction of the
// river's width from its centre line, otherwise metres from the river's edge + 2, signed by bank. kind's integer
// part picks the shader (0 track, 1 train, 2 boat, 3 car), its fraction is free (a per-vehicle seed). An optional
// aU (vec4) per vertex is passed through for the module's own use (part ids, local coordinates). The vertex shader
// below bends everything round the ring, so a train follows the river's curves. The module's GLSL fills in a Veh:
// albedo, emission, specular strength and gloss, ambient occlusion; it may bend the normal. Lighting is shared.
const MOVER_VERT = /* glsl */`
${GLSL_COMMON}
attribute vec4 aV, aU;
varying vec3 vP, vN; varying vec4 vM, vU; varying float vHide;
void main(){
  float th = aV.x + (aV.y * uTime + position.x) / RF;
  float s0 = riverS(th) + (abs(aV.z) < 1.5 ? aV.z * riverW(th) : sign(aV.z) * (riverW(th) + abs(aV.z) - 2.));
  float s = s0 + position.y;
  vHide = step(64., abs(s0)) * step(3., aV.w);          // cars keep to the boulevards inside the quarters
  float c = cos(th), sn = sin(th);
  vec3 up = vec3(-c, 0., -sn), fw = vec3(-sn, 0., c);
  vec3 p = (RR + floorF(s)) * vec3(c, 0., sn) + vec3(0., s, 0.) + up * position.z;
  vP = p; vN = fw * normal.x + vec3(0., normal.y, 0.) + up * normal.z;
  vM = vec4(position, aV.w); vU = aU;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.);
}`;
const MOVER_FRAG = /* glsl */`
${GLSL_COMMON}
struct Veh { vec3 alb; vec3 emis; float spec; float gloss; float ao; };
${TRAIN.GLSL}
${BOAT.GLSL}
${CAR.GLSL}
varying vec3 vP, vN; varying vec4 vM, vU; varying float vHide;
void main(){
  if (vHide > .5) discard;
  vec3 p = vP, n = normalize(vN), V = normalize(uCamL - p);
  Veh v = Veh(vec3(.55), vec3(0.), 0., 30., 1.);
  float kind = vM.w;
  if (kind < 1.) vehTrack(v, n, p, V, vM, vU);
  else if (kind < 2.) vehTrain(v, n, p, V, vM, vU);
  else if (kind < 3.) vehBoat(v, n, p, V, vM, vU);
  else vehCar(v, n, p, V, vM, vU);
  n = normalize(n);
  vec3 L = lightAt(p);
  float fr = .04 + .96 * pow(1. - max(dot(n, V), 0.), 5.);
  vec3 c = shadeIn(v.alb, n, p, v.ao) + v.emis
    + v.spec * (LCOL * pow(max(dot(reflect(-L, n), V), 0.), v.gloss) * (v.gloss + 2.) / 8. * max(dot(n, L), 0.) + mix(SKYC, AIR, .5) * fr * v.ao);
  gl_FragColor = vec4(inAir(c, p), 1.);
}`;

// ---------------------------------------------------------------- life: people, dogs, sheep, cows, ducks, birds, drawn as tiny figures
// Each is a point that moves on its own in the vertex shader: along the ring (promenades, sidewalks, the river),
// across it (the cross streets, back and forth), wandering round a spot (market crowds, grazing herds), or flying.
const LIFE_VERT = /* glsl */`
${GLSL_COMMON}
attribute vec4 aP;           // start angle, speed (m/s, signed), offset (mode 0/1: signed metres from the river's edge; 2/3: s), seed
attribute vec4 aQ;           // mode (0 along, 1 across, 2 wander, 3 fly), species (0 person, 1 dog, 2 sheep, 3 cow, 4 bird, 5 duck), radius / inward shift, height
uniform float uScale; uniform vec2 uRes;
varying vec3 vP, vCol; varying vec2 vUp, vCen; varying float vA, vSz, vSp, vPh, vSeed, vTilt, vPx;
void main(){
  float mode = aQ.x, sp = aQ.y, t = uTime, th, s, h = 0., ground = 1.;
  if (mode < .5) { th = aP.x + aP.y * t / RF; s = riverS(th) + sign(aP.z) * (riverW(th) + abs(aP.z) - aQ.z); }
  else if (mode < 1.5) { th = aP.x; float e = 12. + 48. * abs(fract(abs(aP.y) * t / 96. + aP.w) * 2. - 1.); s = riverS(th) + sign(aP.z) * (riverW(th) + e) + (fract(aP.w * 7.) - .5) * 3.; }
  else if (mode < 2.5) { float a = t * aP.y / max(aQ.z, 1.) + aP.w * 40.;
    vec2 o = vec2(sin(a) + .5 * sin(a * 2.3 + 1.), cos(a * .8) + .5 * sin(a * 1.7)) * aQ.z * .6; th = aP.x + o.x / RF; s = aP.z + o.y; }
  else { th = aP.x + aP.y * t / RF; s = aP.z + 8. * sin(t * .21 + aP.w * 30.); h = aQ.w + 5. * sin(t * .17 + aP.w * 17.); ground = 0.; }
  float bodyH = sp < .5 ? .95 : sp < 1.5 ? .4 : sp < 2.5 ? .55 : sp < 3.5 ? .85 : sp < 4.5 ? 0. : .12;
  float size = sp < .5 ? 2.3 : sp < 1.5 ? 1.3 : sp < 2.5 ? 1.9 : sp < 3.5 ? 3. : sp < 4.5 ? .9 : 1.1;
  vec3 p = (RR + floorF(s) - h - bodyH) * vec3(cos(th), 0., sin(th)) + vec3(0., s, 0.);
  vP = p;
  mat4 mvp = projectionMatrix * viewMatrix * modelMatrix;
  gl_Position = mvp * vec4(p, 1.);
  vec4 q = mvp * vec4(p + upAt(p), 1.);
  vec2 d = (q.xy / q.w - gl_Position.xy / gl_Position.w) * uRes;
  vUp = length(d) > 1e-6 ? normalize(d) : vec2(0., 1.);
  float sz = size * uScale / gl_Position.w;
  vTilt = clamp(length(d) * .5 / max(uScale / gl_Position.w, 1e-3), .2, 1.);   // 1 seen from the side, toward 0 from straight above
  vSz = sz; vSp = sp; vSeed = aP.w;
  vPh = t * (mode > 1.5 && mode < 2.5 ? 1.5 : abs(aP.y) * 2.6) + aP.w * 31.;
  vA = smoothstep(.6, 2.4, sz) * (mode < 1.5 && sp < 4.5 ? step(abs(s), 64.) : 1.);
  gl_PointSize = clamp(sz, 1.5, 72.);
  vPx = gl_PointSize; vCen = (gl_Position.xy / gl_Position.w * .5 + .5) * uRes;   // the sprite's centre and size in framebuffer pixels
  float k = fract(aP.w * 91.7);
  vCol = sp < .5 ? (k < .2 ? vec3(.75, .2, .15) : k < .35 ? vec3(.85, .8, .7) : k < .5 ? vec3(.15, .25, .5) : k < .65 ? vec3(.9, .6, .15) : k < .8 ? vec3(.2, .2, .22) : vec3(.3, .55, .5))
       : sp < 1.5 ? (k < .5 ? vec3(.35, .22, .12) : vec3(.12, .1, .08)) : sp < 2.5 ? vec3(.85, .83, .78) : sp < 3.5 ? (k < .5 ? vec3(.4, .24, .12) : vec3(.9, .88, .85)) : sp < 4.5 ? vec3(.06, .06, .07) : vec3(.92, .9, .85);
}`;
const LIFE_FRAG = /* glsl */`
${GLSL_COMMON}
varying vec3 vP, vCol; varying vec2 vUp, vCen; varying float vA, vSz, vSp, vPh, vSeed, vTilt, vPx;
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.)); }
void main(){
  if (hash12(gl_FragCoord.xy) > vA) discard;
  vec2 pc = (gl_FragCoord.xy - vCen) / vPx;  // framebuffer y runs up, like vUp (gl_PointCoord's y direction differs between GPUs)
  vec2 l = vec2(dot(pc, vec2(vUp.y, -vUp.x)), dot(pc, vUp));
  vec3 col = vCol;
  float sw = sin(vPh);
  // foreshortened when seen from above: the figure shrinks along its up axis toward a head over the shoulders
  if (vSp < 3.5) l.y /= vTilt;
  if (vSz <= 4.) {
    if (length(l / (vSp < .5 ? vec2(.3, .5) : vSp > 3.5 && vSp < 4.5 ? vec2(.45, .2) : vec2(.5, .3))) > 1.) discard;
  } else if (vSp < .5) {                     // a person: head, body, two legs swinging as they walk
    float head = length((l - vec2(0., .33 * smoothstep(.2, .6, vTilt))) / vec2(.085, .085 / vTilt * mix(1., vTilt, smoothstep(.2, .6, vTilt)))), body = length((l - vec2(0., .07)) / vec2(.11 + .04 * (1. - vTilt), .19));
    float legs = min(seg(l, vec2(-.03, -.08), vec2(-.03 + sw * .09, -.46)), seg(l, vec2(.03, -.08), vec2(.03 - sw * .09, -.46)));
    if (head > 1. && body > 1. && (legs > .035 || vTilt < .45)) discard;
    col = head < 1. ? vec3(.55, .40, .30) * (.6 + .8 * fract(vSeed * 17.)) : body < 1. ? vCol : vec3(.12, .12, .14);
  } else if (vSp < 3.5) {                    // four legs: a body, a head, legs
    float bh = vSp < 1.5 ? .1 : .14;
    float body = length((l - vec2(0., .02)) / vec2(.3, bh)), head = length((l - vec2(.32, .1)) / vec2(.09, .075));
    float legs = 1.;
    for (int i = 0; i < 4; i++) { float x = i < 2 ? -.2 : .2, ph = float(i) * 1.6; legs = min(legs, seg(l, vec2(x, -.04), vec2(x + sin(vPh + ph) * .04, -.26))); }
    if (body > 1. && head > 1. && legs > .03) discard;
    col = head < 1. && vSp > 1.5 && vSp < 2.5 ? vec3(.15, .12, .1) : vCol;
    if (vSp > 2.5 && fract(vSeed * 91.7) >= .5 && body < 1. && vnoise(l * 14. + vSeed * 9.) > .55) col = vec3(.06);   // spotted cows
  } else if (vSp < 4.5) {                    // a bird, wings beating
    float f = sin(vPh * 3.) * .14;
    if (min(seg(l, vec2(0.), vec2(-.4, .12 + f)), seg(l, vec2(0.), vec2(.4, .12 + f))) > .045) discard;
  } else {                                   // a duck on the water
    if (length((l + vec2(0., .1)) / vec2(.32, .14)) > 1. && length((l - vec2(.22, .08)) / .08) > 1.) discard;
  }
  vec3 c = shadeIn(col, normalize(normalize(uCamL - vP) + upAt(vP) * .5), vP, 1.);
  gl_FragColor = vec4(inAir(c, vP), 1.);
}`;

// ---------------------------------------------------------------- the glazing: framed panes, and the lit air behind them
const GLASS_FRAG = /* glsl */`
${GLSL_COMMON}
varying vec3 vP, vN;
float line(float x, float w, float fw){ float d = abs(fract(x + .5) - .5); return mix(1. - smoothstep(w - fw, w + fw, d), 2. * w, smoothstep(.2, .5, fw)); }
void main(){
  vec3 p = vP, n = normalize(vN), V = normalize(uCamL - p);
  float th = atan(p.z, p.x), psi = atan(p.y, length(p.xz) - RR);
  vec2 g = vec2(th / 6.2831853 * 480., psi / 6.2831853 * 48.);
  vec2 fw = fwidth(g);
  float frame = max(line(g.x, .012, fw.x), line(g.y, .015, fw.y)) * .8;
  frame = max(frame, max(line(g.x / 4., .005, fw.x / 4.), line(g.y / 2., .01, fw.y / 2.)));   // the heavier main frames
  float ndl = max(dot(n, uSunL), 0.);
  float fr = .04 + .96 * pow(1. - max(dot(n, V), 0.), 5.);
  vec3 R = reflect(-V, n);
  vec3 refl = vec3(.004, .006, .01) + earthSeen(R) + vec3(5., 4.8, 4.5) * pow(max(dot(R, uSunL), 0.), 4000.) * 12.;
  vec3 metal = vec3(.3, .31, .32) * (vec3(3.4, 3.25, 3.0) * ndl + vec3(.03, .035, .05) + LCOL * .12 * max(dot(n, -upAt(p)), 0.)) + AIR * .04;
  float a = mix(clamp(fr + .05, 0., 1.), .97, frame);
  vec3 c = mix(refl * fr / max(fr + .05, 1e-3) + AIR * .06, metal, frame);
  gl_FragColor = vec4(c, a);
}`;
// drawn on the inside of the far wall: the air the ray crossed on its way through the tube
const AIR_FRAG = /* glsl */`
${GLSL_COMMON}
varying vec3 vP, vN;
void main(){
  float T = exp(-airPath(vP, 2.) / 800.);
  gl_FragColor = vec4(AIR, 1. - T);
}`;

// ---------------------------------------------------------------- outside: hull plating, spokes, hub, the shuttle
const HULL_FRAG = /* glsl */`
${GLSL_COMMON}
uniform float uMode;          // 0 the ring's hull (plates laid round the tube, rows of lit windows), 1 everything else
uniform vec3 uTint;
varying vec3 vP, vN;
void main(){
  vec3 p = vP, n = normalize(vN), V = normalize(uCamL - p);
  if (!gl_FrontFacing) n = -n;
  vec3 alb = uTint; vec3 emis = vec3(0.);
  if (uMode < .5) {
    float th = atan(p.z, p.x), psi = atan(p.y, length(p.xz) - RR);
    vec2 g = vec2(th / 6.2831853 * 1440., psi / 6.2831853 * 120.);
    vec2 fw = fwidth(g), id = floor(g);
    float aa = smoothstep(.3, .7, max(fw.x, fw.y));
    float seam = max(step(abs(fract(g.x + .5) - .5), .05), step(abs(fract(g.y + .5) - .5), .05));
    float plate = .8 + .35 * hash12(id);
    alb *= mix(plate * (1. - seam * .5), .9, aa);
    alb *= 1. - .15 * step(.5, fract(g.x / 30.)) * step(abs(abs(psi) - .45), .12);     // darker shield bands
    // the ring's frames, every 7.5°, and two stringers along it
    float fx = abs(fract(g.x / 30. + .5) - .5) * 30., fwx = fw.x;
    float rib = 1. - smoothstep(.6 - fwx, .6 + fwx, fx);
    float str = 1. - smoothstep(.5 - fw.y, .5 + fw.y, min(abs(g.y - 7.), abs(g.y + 7.)));
    alb = mix(alb, uTint * mix(1.25, .9, aa), max(rib, str) * (1. - aa * .7));
    // windows of the levels under the land: rows just below the glass
    float ap = abs(psi);
    vec2 wg = vec2(th / 6.2831853 * 3200., ap / 6.2831853 * 140.);
    vec2 wf = fract(wg), wfw = fwidth(wg);
    float row = step(.70, ap) * step(ap, 1.07);
    float win = step(.25, wf.x) * step(wf.x, .75) * step(.3, wf.y) * step(wf.y, .7) * step(.35, hash12(floor(wg)));
    float waa = smoothstep(.3, .7, max(wfw.x, wfw.y));
    emis = vec3(1., .74, .42) * row * mix(win, .14, waa) * 1.3;
  } else {
    vec3 a = abs(n);
    vec2 g = a.y > max(a.x, a.z) ? p.xz : a.x > a.z ? p.yz : p.xy;
    g /= 7.;
    vec2 fw = fwidth(g);
    float seam = max(step(abs(fract(g.x + .5) - .5), .04), step(abs(fract(g.y + .5) - .5), .04));
    alb *= mix((.85 + .3 * hash12(floor(g))) * (1. - seam * .4), .95, smoothstep(.3, .7, max(fw.x, fw.y)));
  }
  float ndl = max(dot(n, uSunL), 0.);
  vec3 H = normalize(uSunL + V);
  // sunlight, a little earthshine from the planet's day side, a hard metallic highlight
  vec3 c = alb * (vec3(3.4, 3.25, 3.0) * ndl + vec3(.012, .015, .025) + vec3(.07, .10, .16) * max(dot(n, uEarthL), 0.))
    + vec3(3.4, 3.25, 3.0) * pow(max(dot(n, H), 0.), 60.) * .1 * ndl + earthSeen(reflect(-V, n)) * .25 + emis;
  gl_FragColor = vec4(c, 1.);
}`;

// ---------------------------------------------------------------- navigation lights
const NAV_VERT = /* glsl */`
uniform float uTime, uPx;
attribute vec4 aL;            // colour (0 white strobe, 1 red, 2 green, 3 engine), phase
varying vec3 vC; varying float vB;
void main(){
  vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.);
  gl_Position = projectionMatrix * mv;
  float ph = fract(uTime * (aL.x < .5 ? .7 : .35) + aL.y);
  vB = aL.x < .5 ? exp(-ph * 40.) * 6. : aL.x > 2.5 ? 1.5 : .6 + .9 * smoothstep(.0, .05, ph) * smoothstep(.5, .45, ph);
  vC = aL.x < .5 ? vec3(1., .97, .9) : aL.x < 1.5 ? vec3(1., .12, .06) : aL.x < 2.5 ? vec3(.15, 1., .3) : vec3(1., .55, .25);
  gl_PointSize = uPx * (aL.x < .5 ? 5. : 3.5);
}`;
const NAV_FRAG = /* glsl */`
varying vec3 vC; varying float vB;
void main(){ float d = length(gl_PointCoord - .5) * 2.; gl_FragColor = vec4(vC * vB * exp(-d * d * 5.) * 3., 1.); }`;

// ---------------------------------------------------------------- space: stars, the Milky Way, the sun; Earth and Moon
const SKY_FRAG = /* glsl */`
uniform vec3 uSunW; uniform float uPx;
varying vec3 vD;
float hash13(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
  return mix(mix(mix(hash13(i), hash13(i+vec3(1,0,0)), f.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y), f.z); }
vec3 stars(vec3 d, float sc, float dens, float k){
  vec3 p = d * sc, i = floor(p), f = fract(p);
  float h = hash13(i);
  if (h < 1. - dens) return vec3(0.);
  vec3 o = vec3(hash13(i + 3.1), hash13(i + 7.7), hash13(i + 11.3)) * .6 + .2;
  float r = length(f - o) / sc * uPx;               // distance in pixels, roughly
  float b = (h - 1. + dens) / dens;
  vec3 tint = mix(vec3(1., .78, .55), vec3(.7, .82, 1.), hash13(i + 5.));
  return tint * exp(-r * r * k) * b * b * b * 3.;
}
void main(){
  vec3 d = normalize(vD);
  vec3 c = stars(d, 160., .008, .9) + stars(d, 330., .004, 1.1) * .5 + stars(d, 60., .004, .6) * 2.;
  // the Milky Way, a dusty band across the sky
  vec3 gn = normalize(vec3(.35, .55, -.76));
  float band = exp(-pow(dot(d, gn) / .22, 2.));
  float dust = n3(d * 9.) * .6 + n3(d * 23.) * .4;
  c += vec3(.045, .042, .05) * band * smoothstep(.25, .8, dust) + vec3(.02, .018, .024) * band;
  c += stars(d, 520., .03 * band, 1.4) * band * .5;
  float s = max(dot(d, uSunW), 0.);
  c += vec3(30., 28., 25.) * smoothstep(.99996, .99998, s) + vec3(1., .9, .75) * (pow(s, 600.) * 1.2 + pow(s, 30.) * .02);
  gl_FragColor = vec4(c, 1.);
}`;
const BODY_VERT = /* glsl */`
varying vec3 vN, vW;
void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const NOISE3 = /* glsl */`
float hash13(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
  return mix(mix(mix(hash13(i), hash13(i+vec3(1,0,0)), f.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p, int oct){ float s = 0., a = .5, t = 0.; for (int i = 0; i < 7; i++){ if (i >= oct) break; s += a * n3(p); t += a; p = p * 2.07 + vec3(1.3, 7.1, 3.7); a *= .5; } return s / t; }
vec3 spin(vec3 n, float a, float tilt){ float c = cos(a), s = sin(a); n = vec3(c * n.x + s * n.z, n.y, -s * n.x + c * n.z);
  float ct = cos(tilt), st = sin(tilt); return vec3(n.x, ct * n.y - st * n.z, st * n.y + ct * n.z); }
`;
// Earth from 8,000 km: warped-noise continents with ragged coasts, biomes by latitude and moisture, mountains with
// snow, shallow shelves, cloud bands (storm tracks, the tropics, clear subtropics) with cumulus texture, the sun's glint,
// a thin blue atmosphere thickening to the limb, a red twilight band at the terminator, and cities on the night side
const EARTH_FRAG = /* glsl */`
uniform vec3 uSunW; uniform float uSpin, uTime;
varying vec3 vN, vW;
${NOISE3}
float clouds(vec3 cq, float lat, int oct){
  vec3 cw = cq * 1.8 + (vec3(fbm3(cq * 2.3, 3), fbm3(cq * 2.3 + 2.1, 3), fbm3(cq * 2.3 + 7.3, 3)) - .5) * 1.4;
  float base = fbm3(cw, 3), det = fbm3(cw * 5.5 + 3.3, oct), cell = n3(cq * 90.) * .6 + n3(cq * 210.) * .4;
  float band = .12 * exp(-pow(lat / .1, 2.)) + .1 * exp(-pow((lat - .62) / .16, 2.)) - .16 * exp(-pow((lat - .3) / .1, 2.));
  float d = base * .4 + det * .7 + band * .7 + (cell - .5) * .12 - .07;
  return smoothstep(.55, .66, d) * (.55 + .45 * smoothstep(.55, .8, d)) * (.75 + .25 * cell);
}
void main(){
  vec3 n = normalize(vN), V = normalize(cameraPosition - vW), S = uSunW;
  vec3 q = spin(n, uSpin, .41);
  float lat = abs(q.y);
  // land and sea
  vec3 wq = q * 1.25;
  vec3 warp = vec3(fbm3(wq * 1.9, 4), fbm3(wq * 1.9 + 5.2, 4), fbm3(wq * 1.9 + 9.4, 4)) - .5;
  float c = fbm3(wq + warp * .85, 8);
  const float COAST = .535;
  float land = smoothstep(COAST, COAST + .003, c), elev = clamp((c - COAST) / .18, 0., 1.);
  float moist = fbm3(q * 2.4 + 4., 5);
  float dry = smoothstep(.5, .66, (1. - moist) * .75 + .45 * exp(-pow((lat - .37) / .13, 2.)) - .2 * exp(-pow(lat / .12, 2.)));
  float tex = fbm3(q * 40., 4);
  vec3 forest = mix(vec3(.018, .042, .014), vec3(.035, .06, .02), smoothstep(.3, .7, tex));
  vec3 plain = vec3(.07, .075, .035) * (.8 + .4 * tex);
  vec3 desert = mix(vec3(.30, .20, .10), vec3(.46, .36, .22), smoothstep(.3, .75, fbm3(q * 22. + 3., 4)));
  vec3 lc = mix(forest, plain, smoothstep(.45, .7, moist * .4 + lat * .9));
  lc = mix(lc, desert, dry);
  lc = mix(lc, vec3(.12, .10, .08), smoothstep(.45, .8, elev) * .7);                 // bare mountains
  lc = mix(lc, vec3(.7, .72, .75), smoothstep(.75, .9, elev + lat * .25) * .9);        // snow on the highest
  vec3 sea = mix(vec3(.002, .007, .022), vec3(.006, .03, .05), smoothstep(COAST - .03, COAST, c));
  float ice = smoothstep(.9, .93, lat + (fbm3(q * 14., 4) - .5) * .1);
  vec3 alb = mix(mix(sea, lc, land), vec3(.6, .64, .7) * (.75 + .35 * tex), ice);
  // clouds, and their shadows a little way off from the sun
  vec3 cq = spin(n, uSpin + uTime * .0005, .41);
  float cl = clouds(cq, lat, 5);
  vec3 tS = S - n * dot(S, n);
  float sh = clouds(spin(normalize(n - tS * .006), uSpin + uTime * .0005, .41), lat, 2);
  float ndl = dot(n, S), mu = max(dot(n, V), 0.);
  float day = smoothstep(-.03, .12, ndl);
  vec3 sunC = mix(vec3(1., .42, .16), vec3(1., .98, .95), smoothstep(0., .1, ndl)) * 3.;
  vec3 col = alb * (1. - sh * .45 * (1. - cl)) * sunC * max(ndl, 0.);
  col = mix(col, vec3(.8, .81, .84) * sunC * max(ndl + .03, 0.) * smoothstep(-.05, .1, ndl), cl);
  // the glint on open water
  vec3 H = normalize(S + V);
  float nh = max(dot(n, H), 0.);
  col += sunC * (pow(nh, 400.) * .8 + pow(nh, 40.) * .03) * (1. - land) * (1. - ice) * (1. - cl) * day;
  // cities at night, mostly near coasts, none in deserts or ice
  float city = smoothstep(.55, .75, n3(q * 26.)) * (smoothstep(.62, .9, n3(q * 420.)) + .25 * smoothstep(.5, .8, n3(q * 120.))) * land * (1. - dry * .85) * (1. - ice) * (1. - elev * .8);
  col += vec3(1., .62, .28) * city * (1. - day) * (1. - cl * .85) * .5;
  // the atmosphere: in-scattered blue that thickens toward the limb, extinction, and twilight over the terminator
  float path = 1. / max(mu, .03);
  float lit = smoothstep(-.12, .25, ndl);
  col *= exp(-.02 * path);
  col += vec3(.06, .14, .38) * (1. - exp(-.035 * path)) * lit * 1.4;
  col += vec3(.7, .28, .08) * exp(-pow(ndl / .06, 2.)) * (1. - exp(-.03 * path)) * .9;
  gl_FragColor = vec4(col, 1.);
}`;
const HALO_FRAG = /* glsl */`
uniform vec3 uSunW, uEC; uniform float uER;
varying vec3 vN, vW;
void main(){
  vec3 rd = normalize(vW - cameraPosition), oc = uEC - cameraPosition;
  float tca = dot(oc, rd);
  vec3 cp = cameraPosition + rd * tca;
  float b = length(cp - uEC), x = (b - uER) / uER;
  if (x < 0.) discard;
  float lit = smoothstep(-.15, .35, dot(normalize(cp - uEC), uSunW));
  float tw = exp(-pow(dot(normalize(cp - uEC), uSunW) / .12, 2.));                 // the twilight arc over the terminator
  gl_FragColor = vec4((vec3(.22, .45, 1.) * lit + vec3(.9, .4, .15) * tw * .5) * exp(-x / .007) * 2. + vec3(.05, .25, .1) * exp(-x / .002) * (1. - lit) * .15, 1.);
}`;
const MOON_FRAG = /* glsl */`
uniform vec3 uSunW; uniform float uSpin;
varying vec3 vN, vW;
${NOISE3}
float craters(vec3 p){
  vec3 i = floor(p), f = fract(p); float r = 0.;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 o = vec3(x, y, z), c = o + vec3(hash13(i + o), hash13(i + o + 3.7), hash13(i + o + 9.1)) - f;
    float rad = .2 + .25 * hash13(i + o + 1.3), d = length(c) / rad;
    r += smoothstep(1.15, 1., d) * smoothstep(.75, 1., d) * .6 - smoothstep(1., .5, d) * .25;
  }
  return r;
}
void main(){
  vec3 n = normalize(vN), q = spin(n, uSpin, .1);
  float mare = smoothstep(.47, .6, fbm3(q * 1.6 + 3., 4));
  float alb = mix(.42, .16, mare) * (.85 + .3 * fbm3(q * 12., 4)) + craters(q * 6.) * .07 + craters(q * 15.) * .05;
  float ndl = dot(n, uSunW);
  vec3 col = vec3(alb) * vec3(1., .97, .93) * 1.9 * max(ndl, 0.) * smoothstep(-.02, .08, ndl) + vec3(alb) * .004;
  gl_FragColor = vec4(col, 1.);
}`;

// ---------------------------------------------------------------- geometry helpers
// a mesh being assembled from plain arrays: positions, normals, one extra vec4 per vertex, indices
function builder(extra) {
  const g = { pos: [], nrm: [], ex: [], idx: [] };
  g.vert = (x, y, z, nx, ny, nz, a, b, c, d) => { g.pos.push(x, y, z); g.nrm.push(nx, ny, nz); g.ex.push(a, b, c, d); return g.pos.length / 3 - 1; };
  g.quad = (a, b, c, d) => g.idx.push(a, b, c, a, c, d);
  g.geometry = () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(g.nrm, 3));
    geo.setAttribute(extra, new THREE.Float32BufferAttribute(g.ex, 4));
    geo.setIndex(g.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(g.idx, 1) : new THREE.Uint16BufferAttribute(g.idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R + RT + 400);
    return geo;
  };
  return g;
}
// a surface of the tube between two angles round it, all the way round the ring; normals point out of the tube
function tubeGeo(psi0, psi1, nTh, nPs) {
  const pos = [], nrm = [], idx = [];
  for (let j = 0; j <= nPs; j++) {
    const ps = psi0 + (psi1 - psi0) * j / nPs, cp = Math.cos(ps), sp = Math.sin(ps), rho = R + RT * cp;
    for (let i = 0; i <= nTh; i++) {
      const th = i / nTh * TAU, c = Math.cos(th), s = Math.sin(th);
      pos.push(rho * c, RT * sp, rho * s); nrm.push(cp * c, sp, cp * s);
    }
  }
  for (let j = 0; j < nPs; j++) for (let i = 0; i < nTh; i++) {
    const a = j * (nTh + 1) + i, b = a + 1, c = a + nTh + 2, d = a + nTh + 1;
    idx.push(a, d, b, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  return geo;
}

// ---------------------------------------------------------------- the scene
export function startTorus3D(canvasEl, { reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: false, powerPreference: "high-performance" });
  let pr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pr);
  renderer.toneMapping = THREE.NoToneMapping;
  const post = makePost(renderer, { comp: COMP_FRAG, bloom: 0.3, thresh: 1.6 });
  post.U.uExposure.value = 0.85;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 2, 30000);
  const station = new THREE.Group();
  scene.add(station);

  const SU = { uTime: { value: 0 }, uSunL: { value: SUN.clone() }, uCamL: { value: new THREE.Vector3() }, uEarthL: { value: new THREE.Vector3(0, -1, 0) }, uInvSt: { value: new THREE.Matrix4() } };
  const mat = (vert, frag, { uniforms = {}, ...rest } = {}) => new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: { ...SU, ...uniforms }, ...rest });
  const add = (geo, m, order = 0) => { const o = geo.isObject3D ? geo : new THREE.Mesh(geo, m); o.frustumCulled = false; o.renderOrder = order; station.add(o); return o; };

  // ---- generate the city
  const L = rng(1975), D = rng(5150);                 // L lays out the city, D decorates it
  const B = builder("aF"), T = builder("aT"), S = builder("aS");
  let nBuild = 0, nTrees = 0;
  const frameAt = (th) => { const c = Math.cos(th), s = Math.sin(th); return { c, s, up: [-c, 0, -s], fw: [-s, 0, c] }; };
  // a shadow patch centred (along the ring, across) metres from (θ, s), following the land
  function shadow(th, s, a0, a1, b0, b1, k, shape) {
    const i0 = S.pos.length / 3;
    for (const [a, b, qa, qb] of [[a0, b0, -1, -1], [a1, b0, 1, -1], [a1, b1, 1, 1], [a0, b1, -1, 1]]) {
      const ss = s + b, t = th + a / RF, rho = R + landF(ss) - 0.35;
      S.vert(rho * Math.cos(t), ss, rho * Math.sin(t), -Math.cos(t), 0, -Math.sin(t), qa, qb, k, shape);
    }
    S.quad(i0, i0 + 1, i0 + 2, i0 + 3);
  }
  // a box standing on the land at (θ, s): half sizes along the ring and across, from h0 to h1 above the ground
  function box(th, s, hu, hs, h0, h1, seed, roof, W = 0) {
    const { c, s: sn, up, fw } = frameAt(th), rho = R + landF(s);
    const bx = rho * c, by = s, bz = rho * sn;
    const P = (a, b, h) => [bx + fw[0] * a + up[0] * h, by + b, bz + fw[2] * a + up[2] * h];
    const face = (pts, n, uv) => {
      const i0 = B.pos.length / 3;
      pts.forEach((p, k) => B.vert(p[0], p[1], p[2], n[0], n[1], n[2], uv[k][0], uv[k][1], seed, uv[k][2]));
      B.quad(i0, i0 + 1, i0 + 2, i0 + 3);
    };
    face([P(hu, -hs, h0), P(hu, hs, h0), P(hu, hs, h1), P(hu, -hs, h1)], fw, [[0, h0, W], [2 * hs, h0, W], [2 * hs, h1, W], [0, h1, W]]);
    face([P(-hu, hs, h0), P(-hu, -hs, h0), P(-hu, -hs, h1), P(-hu, hs, h1)], [-fw[0], 0, -fw[2]], [[0, h0, W], [2 * hs, h0, W], [2 * hs, h1, W], [0, h1, W]]);
    face([P(-hu, hs, h0), P(hu, hs, h0), P(hu, hs, h1), P(-hu, hs, h1)], [0, 1, 0], [[0, h0, W], [2 * hu, h0, W], [2 * hu, h1, W], [0, h1, W]]);
    face([P(hu, -hs, h0), P(-hu, -hs, h0), P(-hu, -hs, h1), P(hu, -hs, h1)], [0, -1, 0], [[0, h0, W], [2 * hu, h0, W], [2 * hu, h1, W], [0, h1, W]]);
    face([P(-hu, -hs, h1), P(hu, -hs, h1), P(hu, hs, h1), P(-hu, hs, h1)], up, [[0, 0, roof], [2 * hu, 0, roof], [2 * hu, 2 * hs, roof], [0, 2 * hs, roof]]);
    nBuild++;
    if (h0 < 0) {
      const oa = h1 * SHADOW_DIR[0], ob = h1 * SHADOW_DIR[1];
      shadow(th, s, Math.min(-hu, -hu + oa) - 2.5, Math.max(hu, hu + oa) + 2.5, Math.min(-hs, -hs + ob) - 2.5, Math.max(hs, hs + ob) + 2.5, 0.75, 1);
    }
  }
  // does a top at height h over the footprint stay clear of the glass?
  const fits = (s, hs, h) => { const f = landF(s) - h; return Math.hypot(f, Math.abs(s) + hs) < RT - 4; };

  // trees: lumpy ellipsoids from an icosahedron, each its own shape
  const ico = (() => {
    const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, map = new Map(), verts = [], idx = [];
    for (let i = 0; i < p.count; i++) {
      const key = [p.getX(i), p.getY(i), p.getZ(i)].map((v) => v.toFixed(4)).join();
      if (!map.has(key)) { map.set(key, verts.length / 3); verts.push(p.getX(i), p.getY(i), p.getZ(i)); }
      idx.push(map.get(key));
    }
    return { verts, idx };
  })();
  function tree(th, s, h, rc, shape = 0.85) {
    const { c, s: sn, up, fw } = frameAt(th), rho = R + landF(s) - h - rc * shape * 0.8;
    const cx = rho * c, cy = s, cz = rho * sn;
    const seed = D(), r1 = D() * TAU, r2 = D() * TAU, r3 = D() * TAU;
    const pal = D();
    const i0 = T.pos.length / 3;
    for (let k = 0; k < ico.verts.length; k += 3) {
      const x = ico.verts[k], y = ico.verts[k + 1], z = ico.verts[k + 2];
      const r = rc * (1 + 0.2 * Math.sin(3.1 * x + r1) * Math.sin(2.7 * y + r2) + 0.14 * Math.sin(4.3 * z + 2.1 * x + r3));
      const yy = y * shape * (y < 0 ? 0.7 : 1);
      T.vert(cx + (fw[0] * x + up[0] * yy) * r, cy + z * r, cz + (fw[2] * x + up[2] * yy) * r,
        fw[0] * x + up[0] * y, z, fw[2] * x + up[2] * y, seed, y * 0.5 + 0.5, pal, rc);
    }
    for (const i of ico.idx) T.idx.push(i0 + i);
    nTrees++;
    if (h === 0) { const hc = rc * shape * 0.8, r = rc * 1.25; shadow(th, s, hc * SHADOW_DIR[0] - r, hc * SHADOW_DIR[0] + r, hc * SHADOW_DIR[1] - r, hc * SHADOW_DIR[1] + r, 0.7, 0); }
  }

  // the quarters: cells in lanes parallel to the river, from the banks out to the terraces
  const fields = [];                 // open field cells: the herds graze there
  const dTh = 15 / RF, NC = Math.round(TAU / dTh);
  for (let i = 0; i < NC; i++) {
    const th0 = i * TAU / NC, ub = urban(th0), cross = i % 7 === 0;
    for (const side of [-1, 1]) {
      for (let lane = 0; lane < 6; lane++) {
        const e = 19.5 + lane * 15 + (lane >= 2 ? 8 : 0);
        const th = th0 + (L() - 0.5) * 2.5 / RF;
        const s = riverS(th) + side * (riverW(th) + e) + (L() - 0.5) * 2;
        const r = L(), r2 = L(), r3 = L();
        if (Math.abs(s) > 62 || inMarket(th, side, e)) continue;
        if (cross) { if (r < 0.6) tree(th, s, 0, 3 + r2 * 2); continue; }
        const p = ub + (r - 0.5) * 0.55;
        if (p > 0.38) {
          const hu = 4.6 + r2 * 2.4, hs = 4.4 + r3 * 2.2;
          let h = 7 + Math.pow(L(), 2.3) * (8 + 52 * ub) + L() * 4;
          while (h > 6 && !fits(s, hs, h)) h -= 3;
          const seed = L(), roof = L() < 0.78 ? 1 : 2;
          box(th, s, hu, hs, -2.5, h, seed, roof);
          if (h > 20 && L() < 0.5) {
            const h2 = h + 4 + L() * 16 * ub;
            if (fits(s, hs * 0.62, h2)) box(th, s, hu * 0.6, hs * 0.62, h - 0.5, h2, L(), 1);
          }
          if (roof === 1 && D() < 0.65) for (let k = 0; k < 1 + D() * 3; k++) tree(th + (D() - 0.5) * hu * 1.2 / RF, s + (D() - 0.5) * hs * 1.2, h, 1.4 + D() * 1.6);
        } else if (p < 0.2 && r2 < 0.55) { fields.push({ th, s }); } else {
          if (r3 < 0.08) tree(th, s, 0, 9 + L() * 4, 0.75);                  // a big old tree in a clearing
          else for (let k = 0; k < 2 + L() * 5; k++) tree(th + (L() - 0.5) * 12 / RF, s + (L() - 0.5) * 12, 0, 2.6 + L() * 3.6, 0.7 + L() * 0.4);
        }
      }
    }
  }
  // the markets: rows of stalls with awnings, a great tree in the middle of each square
  const Mk = rng(808);
  for (const m of MARKETS) {
    tree(m.th, riverS(m.th) + m.side * (riverW(m.th) + 27), 0, 11, 0.8);
    for (let a = -31; a <= 31; a += 6.5) for (let e = 15; e <= 39; e += 6) {
      if (Math.abs(a) < 10 && Math.abs(e - 27) < 9) continue;          // round the tree
      if (Mk() < 0.12) continue;
      const th = m.th + a / RF, s = riverS(th) + m.side * (riverW(th) + e), seed = Mk();
      box(th, s, 1.3, 0.8, -0.5, 1.0, seed, 5, 5);                         // counter
      box(th, s, 1.6, 1.2, 2.3, 2.5, seed, 4, 4);                          // awning
    }
  }
  // trees along the banks and the boulevards
  for (const side of [-1, 1]) {
    for (let u = 0; u < TAU * RF; u += 9 + L() * 4) {
      const th = u / RF;
      if (L() < 0.85) tree(th, riverS(th) + side * (riverW(th) + 8.5 + L()), 0, 3 + L() * 1.8, L() < 0.15 ? 1.8 : 0.85);
    }
    for (const e of [BLVD - 5, BLVD + 5]) for (let u = L() * 5; u < TAU * RF; u += 10.5) {
      const th = u / RF, s = riverS(th) + side * (riverW(th) + e);
      if (Math.abs(s) < 63 && L() < 0.9) tree(th, s, 0, 3.2 + L() * 1.4);
    }
  }
  // the terraces: rows of small houses with gardens, stepping up the valley's sides to the glass
  for (const side of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const s = side * (TERR.s0 + k * TERR.step + 2.4);
      for (let u = L() * 8; u < TAU * RF; u += 7.5 + L() * 3) {
        const th = u / RF, r = L();
        if (r < 0.18) { tree(th, s, 0, 2.4 + L() * 2); continue; }
        const h = 3.2 + L() * (k < 3 ? 6 : 3.5);
        if (!fits(s, 2.3, h)) { if (L() < 0.5) tree(th, s, 0, 2 + L()); continue; }
        box(th, s, 2.6 + L() * 1.2, 2.2, -3, h, L(), 3);
        if (L() < 0.35) tree(th + 4 / RF, s + side * 1.5, 0, 1.8 + L() * 1.4);
      }
    }
  }

  const buildMat = mat(BUILD_VERT, BUILD_FRAG, { side: THREE.DoubleSide });
  add(B.geometry(), buildMat);
  add(T.geometry(), mat(TREE_VERT, TREE_FRAG, { side: THREE.DoubleSide }));
  add(S.geometry(), mat(SHADOW_VERT, SHADOW_FRAG, { side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), 0.5);

  // the land itself
  {
    const NT = 1600, NS = 84, pos = [], idx = [];
    for (let j = 0; j <= NS; j++) {
      const s = -SMAX + 2 * SMAX * j / NS, f = landF(s);
      for (let i = 0; i <= NT; i++) { const th = i / NT * TAU, rho = R + f; pos.push(rho * Math.cos(th), s, rho * Math.sin(th)); }
    }
    for (let j = 0; j < NS; j++) for (let i = 0; i < NT; i++) { const a = j * (NT + 1) + i; idx.push(a, a + 1, a + NT + 2, a, a + NT + 2, a + NT + 1); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // normals should face up (toward the axis); flip them if the winding came out the other way
    const n = geo.attributes.normal;
    if (n.getX((NS >> 1) * (NT + 1)) > 0) for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    add(geo, mat(ST_VERT(), TERRAIN_FRAG, { side: THREE.DoubleSide }));
  }

  // ring vehicles (see "ring vehicles" above and ./vehicles/)
  const MV = { pos: [], nrm: [], av: [], au: [], idx: [] };
  const vapi = {
    THREE, rng, TAU, R, RT, RF, CIRC: TAU * RF, BLVD, MARKETS, riverS, riverW, urban, inMarket, floorF, landF,
    // append a BufferGeometry given in vehicle coordinates; v = [start angle, speed, lateral, kind]
    add(geo, v) {
      if (!geo.attributes.normal) geo.computeVertexNormals();
      const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.aU, i0 = MV.pos.length / 3;
      for (let i = 0; i < P.count; i++) {
        MV.pos.push(P.getX(i), P.getY(i), P.getZ(i)); MV.nrm.push(N.getX(i), N.getY(i), N.getZ(i)); MV.av.push(v[0], v[1], v[2], v[3]);
        if (U) MV.au.push(U.getX(i), U.getY(i), U.getZ(i), U.getW(i)); else MV.au.push(0, 0, 0, 0);
      }
      if (geo.index) for (let i = 0; i < geo.index.count; i++) MV.idx.push(i0 + geo.index.getX(i));
      else for (let i = 0; i < P.count; i++) MV.idx.push(i0 + i);
    },
    // an axis-aligned box: centre u along, half length du, centre l across, half width dl, from h0 to h1; part goes to aU
    box(u, du, l, dl, h0, h1, v, part = [0, 0, 0, 0]) {
      const g = new THREE.BoxGeometry(2 * du, 2 * dl, h1 - h0).translate(u, l, (h0 + h1) / 2);
      const n = g.attributes.position.count;
      g.setAttribute("aU", new THREE.Float32BufferAttribute(Array.from({ length: n }, () => part).flat(), 4));
      vapi.add(g, v);
    },
  };
  const vehicles = { trains: TRAIN.build(vapi).count, boats: BOAT.build(vapi).count, cars: CAR.build(vapi).count };
  {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(MV.pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(MV.nrm, 3));
    geo.setAttribute("aV", new THREE.Float32BufferAttribute(MV.av, 4));
    geo.setAttribute("aU", new THREE.Float32BufferAttribute(MV.au, 4));
    geo.setIndex(new THREE.Uint32BufferAttribute(MV.idx, 1));
    add(geo, mat(MOVER_VERT, MOVER_FRAG, { side: THREE.DoubleSide }));
    vehicles.triangles = MV.idx.length / 3;
  }

  // life: people on the promenades, sidewalks and cross streets, crowds at the markets, dogs, herds in the fields,
  // ducks on the river and birds in the air
  const lifeU = { uScale: { value: 1 }, uRes: { value: new THREE.Vector2(1, 1) } };
  const lives = { people: 0, animals: 0 };
  {
    const A = rng(9090), P = [], Q = [];
    const add1 = (p, q) => { P.push(...p); Q.push(...q); if (q[1] < 0.5) lives.people++; else lives.animals++; };
    const side = () => (A() < 0.5 ? -1 : 1), walk = () => (A() < 0.15 ? 0 : (A() < 0.5 ? -1 : 1) * (0.7 + A() * 0.9));
    for (let i = 0; i < 26000; i++) add1([A() * TAU, walk(), side() * (2.3 + A() * 3.4), A()], [0, 0, 0, 0]);                            // promenades
    for (let i = 0; i < 16000; i++) add1([A() * TAU, walk(), side() * (BLVD + (A() < 0.5 ? -1 : 1) * (3.7 + A() * 0.9)), A()], [0, 0, 0, 0]);   // sidewalks
    for (let i = 0; i < NC; i += 7) for (const sd of [-1, 1]) for (let k = 0; k < 60; k++)                                           // cross streets
      add1([i * TAU / NC + (A() - 0.5) * 2.2 / RF, 0.6 + A() * 0.9, sd, A()], [1, 0, 0, 0]);
    for (const m of MARKETS) for (let k = 0; k < 650; k++) {                                                                         // market crowds
      const th = m.th + (A() - 0.5) * 66 / RF, e = 13 + A() * 28;
      add1([th, 0.2 + A() * 0.5, riverS(th) + m.side * (riverW(th) + e), A()], [2, 0, 1.5 + A() * 3, 0]);
    }
    for (let i = 0; i < 1800; i++) add1([A() * TAU, walk() || 1, side() * (2.3 + A() * 3.4), A()], [0, 1, 0, 0]);                       // dogs
    for (const f of fields) {                                                                                                         // herds
      const cows = A() < 0.4, n = cows ? 4 + A() * 7 : 8 + A() * 14;
      for (let k = 0; k < n; k++) add1([f.th + (A() - 0.5) * 10 / RF, 0.05 + A() * 0.08, f.s + (A() - 0.5) * 10, A()], [2, cows ? 3 : 2, 3 + A() * 5, 0]);
    }
    for (let i = 0; i < 700; i++) add1([A() * TAU, (A() - 0.5) * 0.6, side() * 1, A()], [0, 5, 2.5 + A() * 5, 0]);                       // ducks
    for (let f = 0; f < 60; f++) {                                                                                                    // flocks
      const th = A() * TAU, sp = (A() < 0.5 ? -1 : 1) * (8 + A() * 6), s0 = (A() - 0.5) * 120, h = 25 + A() * 50;
      for (let k = 0; k < 10 + A() * 25; k++) add1([th + (A() - 0.5) * 30 / RF, sp, s0 + (A() - 0.5) * 14, A()], [3, 4, 0, h + (A() - 0.5) * 8]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(P.length / 4 * 3), 3));
    geo.setAttribute("aP", new THREE.Float32BufferAttribute(P, 4));
    geo.setAttribute("aQ", new THREE.Float32BufferAttribute(Q, 4));
    add(new THREE.Points(geo, mat(LIFE_VERT, LIFE_FRAG, { uniforms: lifeU })));
  }

  // glass vault, and the lit air seen through it
  const glassGeo = tubeGeo(PSI_GLASS, TAU - PSI_GLASS, 960, 64);
  add(glassGeo, mat(ST_VERT(), AIR_FRAG, { side: THREE.BackSide, transparent: true, depthWrite: false }), 1);
  add(glassGeo, mat(ST_VERT(), GLASS_FRAG, { side: THREE.FrontSide, transparent: true, depthWrite: false }), 2);

  // the hull under the land, the spokes, the hub
  const hullMat = (tint, mode = 1) => mat(ST_VERT(), HULL_FRAG, { side: THREE.DoubleSide, uniforms: { uMode: { value: mode }, uTint: { value: new THREE.Color(...tint) } } });
  add(tubeGeo(-PSI_GLASS, PSI_GLASS, 960, 40), hullMat([0.21, 0.21, 0.22], 0));
  const metal = hullMat([0.27, 0.275, 0.29]), dark = hullMat([0.08, 0.085, 0.09]);
  const part = (geo, m, f) => { f(geo); add(geo, m); return geo; };
  // seams where the glass meets the hull
  for (const sg of [-1, 1]) part(new THREE.TorusGeometry(R + RT * Math.cos(PSI_GLASS), 2.6, 8, 480), dark, (g) => g.rotateX(Math.PI / 2).translate(0, sg * RT * Math.sin(PSI_GLASS), 0));
  const HUB_R = 72, HUB_H = 120;
  part(new THREE.CylinderGeometry(HUB_R, HUB_R, HUB_H, 64, 1), metal, () => {});
  for (const y of [-38, 0, 38]) part(new THREE.TorusGeometry(HUB_R + 1.5, 3, 8, 64), dark, (g) => g.rotateX(Math.PI / 2).translate(0, y, 0));
  part(new THREE.CylinderGeometry(52, HUB_R, 18, 64, 1), metal, (g) => g.translate(0, HUB_H / 2 + 9, 0));
  part(new THREE.CylinderGeometry(HUB_R, 52, 18, 64, 1), metal, (g) => g.translate(0, -HUB_H / 2 - 9, 0));
  part(new THREE.CylinderGeometry(17, 17, 400, 24, 1), metal, () => {});                  // the axle and docking spine
  for (const y of [-210, 210]) part(new THREE.CylinderGeometry(32, 32, 10, 32, 1), dark, (g) => g.translate(0, y, 0));
  for (const y of [-160, 160]) part(new THREE.BoxGeometry(150, 3, 26), dark, (g) => g.translate(0, y, 0));   // radiator vanes on the spine
  const SPOKES = Array.from({ length: 6 }, (_, k) => k / 6 * TAU + 0.26);
  for (const a of SPOKES) {
    const len = R - RT - HUB_R + 6;
    const f = (g) => g.rotateZ(-Math.PI / 2).translate(HUB_R + len / 2 - 2, 0, 0).rotateY(-a);
    part(new THREE.CylinderGeometry(7.5, 7.5, len, 20, 1), metal, f);
    for (const t of [0.2, 0.5, 0.8]) part(new THREE.CylinderGeometry(9.5, 9.5, 4, 20, 1), dark, (g) => g.rotateZ(-Math.PI / 2).translate(HUB_R + len * t, 0, 0).rotateY(-a));
    part(new THREE.CylinderGeometry(15, 18, 16, 24, 1), metal, (g) => g.rotateZ(-Math.PI / 2).translate(R - RT - 4, 0, 0).rotateY(-a));
  }
  // navigation lights
  const navU = { uTime: SU.uTime, uPx: { value: pr } };
  {
    const p = [], l = [];
    for (let i = 0; i < 48; i++) {
      const th = i / 48 * TAU, rho = R + RT * Math.cos(PSI_GLASS) + 3;
      for (const sg of [-1, 1]) { p.push(rho * Math.cos(th), sg * (RT * Math.sin(PSI_GLASS) + 3), rho * Math.sin(th)); l.push(i % 4 === 0 ? 0 : sg < 0 ? 1 : 2, (i % 4) * 0.13 + (sg > 0 ? 0.5 : 0), 0, 0); }
      p.push((R + RT + 2) * Math.cos(th), 0, (R + RT + 2) * Math.sin(th)); l.push(i % 2 ? 1 : 0, i * 0.07, 0, 0);
    }
    for (const y of [-216, 216]) { p.push(0, y, 0); l.push(0, y > 0 ? 0 : 0.5, 0, 0); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    geo.setAttribute("aL", new THREE.Float32BufferAttribute(l, 4));
    add(new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader: NAV_VERT, fragmentShader: NAV_FRAG, uniforms: navU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })), null, 3);
  }
  // lights for other things: positions (flat xyz) and aL (flat, 4 per light: colour kind, phase, 0, 0)
  const navPoints = (pos, aL) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aL", new THREE.Float32BufferAttribute(aL, 4));
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: NAV_VERT, fragmentShader: NAV_FRAG, uniforms: navU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false; pts.renderOrder = 3;
    return pts;
  };

  // the shuttle and the spoke elevators (./vehicles/space.js)
  const space = buildSpace({ THREE, station, hullMat, mat, ST_VERT, GLSL_COMMON, navPoints, R, RT, TAU, HUB_R, HUB_H, SPOKES, smooth, rng });

  // ---- space
  const SKY = { uSunW: { value: SUN.clone() }, uPx: { value: 1 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(20000, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: SKY,
    vertexShader: "varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
    fragmentShader: SKY_FRAG,
  }));
  sky.renderOrder = -2; sky.frustumCulled = false; scene.add(sky);
  const bodyU = { uSunW: SKY.uSunW, uTime: SU.uTime };
  const earthU = { ...bodyU, uSpin: { value: 2.3 } }, moonU = { ...bodyU, uSpin: { value: 2.1 } };
  const sphere = new THREE.SphereGeometry(1, 160, 80);
  const earth = new THREE.Mesh(sphere, new THREE.ShaderMaterial({ vertexShader: BODY_VERT, fragmentShader: EARTH_FRAG, uniforms: earthU }));
  const moon = new THREE.Mesh(sphere, new THREE.ShaderMaterial({ vertexShader: BODY_VERT, fragmentShader: MOON_FRAG, uniforms: moonU }));
  const haloU = { uSunW: SKY.uSunW, uEC: { value: new THREE.Vector3() }, uER: { value: 1 } };
  const halo = new THREE.Mesh(sphere, new THREE.ShaderMaterial({ vertexShader: BODY_VERT, fragmentShader: HALO_FRAG, uniforms: haloU, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  [earth, moon, halo].forEach((m) => { m.frustumCulled = false; scene.add(m); });
  // both are drawn round the camera, far enough out that only their angular sizes matter: Earth 52° across, the Moon 0.7°
  const E_D = 15000, E_R = E_D * Math.sin(E_ANG), M_D = 19000, M_R = M_D * Math.sin(THREE.MathUtils.degToRad(0.36));
  const E_PHI0 = reduced ? -0.12 : -0.8;                    // Earth's limb is already in the corner of the opening view
  const earthDir = (t, out) => { const ph = E_PHI0 + t / E_PERIOD * TAU; return out.copy(ORBIT_U).multiplyScalar(Math.cos(ph)).addScaledVector(ORBIT_W, Math.sin(ph)); };

  // ---- the view: orbit (az, el) round a target that slides from the station's centre (far) to the land on the far side of the ring (close)
  const LN_FAR = Math.log(7000), LN_NEAR = Math.log(70);
  const AZ0 = VIEW0.az, EL0 = VIEW0.el, Z0 = 0.25;
  let az = AZ0, el = EL0, zoom = Z0, azT = az, elT = el, zoomT = zoom;
  let dbg = null;                      // a parked camera for close-ups (see look())
  const target = new THREE.Vector3(), dir = new THREE.Vector3(), tmp = new THREE.Vector3(), inv = new THREE.Matrix4();
  function place(dt) {
    const k = dt > 0 ? 1 - Math.exp(-dt * 6) : 1;
    az += (azT - az) * k; el += (elT - el) * k; zoom += (zoomT - zoom) * k;
    const f = smooth(0.3, 0.92, zoom);
    // in a tall frame, stand further back so the whole wheel fits across
    const d = Math.exp(LN_FAR + (LN_NEAR - LN_FAR) * zoom) * (1 + Math.max(0, 0.9 / camera.aspect - 1) * 0.8 * (1 - f));
    const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
    target.set(-ca * (RF - 14) * f, 0, -sa * (RF - 14) * f);
    dir.set(ce * ca, se, ce * sa);
    camera.position.copy(target).addScaledVector(dir, d);
    // keep clear of the tube, the hub and the spine
    // deep in, the camera passes through the glass into the air over the city, staying above the rooftops
    const p = camera.position, rho = Math.hypot(p.x, p.z), dc = Math.hypot(rho - R, p.y), MIN = (RT + 28) * (1 - smooth(0.86, 0.93, zoom));
    if (dc < MIN) { const k2 = MIN / dc; const nr = R + (rho - R) * k2; p.x *= nr / rho; p.z *= nr / rho; p.y *= k2; }
    if (Math.hypot(Math.hypot(p.x, p.z) - R, p.y) < RT) {
      const r2 = Math.hypot(p.x, p.z), top = R + landF(clamp(p.y, -SMAX, SMAX)) - 62;
      if (r2 > top) { p.x *= top / r2; p.z *= top / r2; }
    }
    if (rho < 120 && Math.abs(p.y) < 300) { const nr = 120; p.x *= nr / Math.max(rho, 1); p.z *= nr / Math.max(rho, 1); }
    camera.near = clamp(d * 0.04, 1, 120);
    camera.lookAt(target);
    if (dbg) {                                   // a parked camera, given in the station's frame
      camera.position.copy(dbg[0]).applyMatrix4(station.matrixWorld);
      camera.near = 0.3;
      camera.up.copy(dbg[2]).transformDirection(station.matrixWorld);
      camera.lookAt(tmp.copy(dbg[1]).applyMatrix4(station.matrixWorld));
      camera.up.set(0, 1, 0);
    }
    camera.updateProjectionMatrix();
  }
  // drag to orbit; wheel, pinch, keys and buttons to zoom
  const ptrs = new Map();
  let pinch = 0;
  canvasEl.addEventListener("pointerdown", (e) => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); canvasEl.setPointerCapture?.(e.pointerId); canvasEl.style.cursor = "grabbing"; });
  canvasEl.addEventListener("pointermove", (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const [x0, y0] = ptrs.get(e.pointerId);
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 1) {
      const s = 0.0055 * (1 - zoom * 0.6);
      azT += (e.clientX - x0) * s; elT = clamp(elT + (e.clientY - y0) * s, -1.35, 1.35);
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], dd = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) zoomT = clamp(zoomT + Math.log(dd / pinch) * 0.45, 0, 1);
      pinch = dd;
    }
  });
  const lift = (e) => { ptrs.delete(e.pointerId); pinch = 0; if (!ptrs.size) canvasEl.style.cursor = ""; };
  canvasEl.addEventListener("pointerup", lift); canvasEl.addEventListener("pointercancel", lift);
  canvasEl.addEventListener("wheel", (e) => { e.preventDefault(); zoomT = clamp(zoomT - e.deltaY * (e.deltaMode ? 0.04 : 0.0011), 0, 1); }, { passive: false });
  const keys = new Set();
  addEventListener("keydown", (e) => { if (e.key.startsWith("Arrow")) { keys.add(e.key); e.preventDefault(); } });
  addEventListener("keyup", (e) => keys.delete(e.key));

  const resize = () => {
    const w = canvasEl.clientWidth || innerWidth, h = canvasEl.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 1 ? 62 : 46;
    camera.updateProjectionMatrix();
    const bh = renderer.domElement.height;
    lifeU.uScale.value = bh * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    lifeU.uRes.value.set(renderer.domElement.width, bh);
    navU.uPx.value = pr;
    post.setSize();
  };
  addEventListener("resize", resize); resize();
  // a star cell's size on screen: the sky shader wants pixels per radian
  const pxPerRad = () => lifeU.uScale.value;

  let last = performance.now(), raf = 0, visible = true, slow = 0, tNow = reduced ? 24 : 0, spin = 0, ride = 0;
  function frame(dt) {
    tNow += dt;
    const t = tNow;
    SU.uTime.value = t;
    // the wheel turns once a minute; close in, the camera turns with it so the city holds still in the frame
    spin = (spin + OMEGA * dt) % TAU;
    station.rotation.y = -spin;
    ride = smooth(0.55, 0.85, zoom);
    azT += OMEGA * dt * ride; az += OMEGA * dt * ride;
    if (keys.has("ArrowLeft")) azT += dt * 0.9;
    if (keys.has("ArrowRight")) azT -= dt * 0.9;
    if (keys.has("ArrowUp")) elT = clamp(elT + dt * 0.7, -1.35, 1.35);
    if (keys.has("ArrowDown")) elT = clamp(elT - dt * 0.7, -1.35, 1.35);
    station.updateMatrixWorld();
    place(dt);
    inv.copy(station.matrixWorld).invert();
    SU.uInvSt.value.copy(inv);
    SU.uCamL.value.copy(camera.position).applyMatrix4(inv);
    SU.uSunL.value.copy(SUN).transformDirection(inv);

    space.update(t);

    sky.position.copy(camera.position);
    earthDir(t, tmp); earth.position.copy(camera.position).addScaledVector(tmp, E_D); earth.scale.setScalar(E_R);
    SU.uEarthL.value.copy(tmp).transformDirection(inv);
    halo.position.copy(earth.position); halo.scale.setScalar(E_R * 1.04);
    haloU.uEC.value.copy(earth.position); haloU.uER.value = E_R;
    moon.position.copy(camera.position).addScaledVector(MOON_DIR, M_D); moon.scale.setScalar(M_R);
    SKY.uPx.value = pxPerRad();

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
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf && !reduced) { last = performance.now(); raf = requestAnimationFrame(loop); } });
  io.observe(canvasEl);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !raf && !reduced) { last = performance.now(); raf = requestAnimationFrame(loop); } });
  // with reduced motion: one still frame, redrawn when the view changes
  const still = () => { if (reduced && !raf) raf = requestAnimationFrame(() => { raf = 0; frame(0); }); };
  if (reduced) { frame(0); ["pointermove", "wheel", "keydown", "resize"].forEach((ev) => addEventListener(ev, still, { passive: true })); }
  else raf = requestAnimationFrame((n) => { last = n; loop(n); });

  const zoomBy = (dz) => { zoomT = clamp(zoomT + dz, 0, 1); still(); };
  // for screenshots: jump to a view (degrees, zoom 0 = far .. 1 = close) and a time without easing
  const setView = (azDeg, elDeg, z) => {
    if (azDeg != null) az = azT = THREE.MathUtils.degToRad(azDeg);
    if (elDeg != null) el = elT = THREE.MathUtils.degToRad(elDeg);
    if (z != null) zoom = zoomT = z;
    still();
  };
  const setTime = (t) => { tNow = t; spin = (OMEGA * t) % TAU; still(); };
  // for close-ups: park the camera at pos looking at target, both [x, y, z] in the station's frame (null to release);
  // up defaults to the local up (toward the axis) at the target. ringPoint(θ, s, h) is a point h metres above the land.
  const ringPoint = (th, s, h = 0) => { const r = R + landF(s) - h; return [r * Math.cos(th), s, r * Math.sin(th)]; };
  const look = (pos, tgt, upv) => {
    dbg = pos ? [new THREE.Vector3(...pos), new THREE.Vector3(...tgt), upv ? new THREE.Vector3(...upv) : new THREE.Vector3(-tgt[0], 0, -tgt[2]).normalize()] : null;
    still();
  };
  return {
    renderer, frame, zoomBy, setView, setTime, look, ringPoint, riverS, riverW, BLVD, RF, scene, camera,
    get zoom() { return zoom; }, get view() { return { az: THREE.MathUtils.radToDeg(az), el: THREE.MathUtils.radToDeg(el), zoom }; },
    stats: { buildings: nBuild, trees: nTrees, people: lives.people, animals: lives.animals, markets: MARKETS.length, ...vehicles },
  };
}

// ---------------------------------------------------------------- composite: ACES, a cool grade, lens
const COMP_FRAG = /* glsl */`
uniform sampler2D tScene, tBloom;
uniform vec2 uRes;
uniform float uTime, uExposure, uBloom;
varying vec2 vUv;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 aces(vec3 x){ x *= uExposure * .6; return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec2 q = vUv - .5;
  vec2 ca = q * dot(q, q) * .005;
  vec3 col = vec3(texture2D(tScene, vUv - ca).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv + ca).b);
  col += texture2D(tBloom, vUv).rgb * uBloom;
  vec3 c = toSRGB(aces(col));
  float l = dot(c, vec3(.299, .587, .114));
  c += vec3(-.006, .0, .012) * (1. - l) * (1. - l);
  c = mix(c, c * c * (3. - 2. * c), .2);
  c *= mix(.7, 1., smoothstep(1.05, .3, length(q * vec2(1., 1.1))));
  c += (h21(vUv * uRes + fract(uTime * 7.31) * 113.) - .5) * .012;
  gl_FragColor = vec4(c, 1.);
}`;
