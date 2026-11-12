// The Express's train: a steam engine and tender, then five carriages fitted out in mahogany, brass, velvet and
// etched glass: a sleeping car, the dining car, the bar car, the salon and an observation car at the tail. Each
// vehicle is built in its own frame (x right, y up from the floor, z toward the rear; the rail head is at y = -1.1)
// as one mesh with one material (`TRAIN_FRAG`, the material picked per vertex by aK.x, see `M`) plus its glazing
// (`GLASS_FRAG`). Lamps are rows of equally spaced lights (`rows`), so a shader evaluates only the nearest few.
// `buildTrain()` also returns the walls and furniture as boxes in train coordinates for walking.

import * as THREE from "three";
import { GLSL_W, rng } from "./express-world.js";

export const WI = 1.4, WO = 1.48, ZE = 10.4, ZX = 10.9, DOOR = 0.42, DOORH = 2.02, CAR = 23, RAIL = -1.1;
export const ceilY = (x) => 2.16 + 0.3 * (1 - (x / WI) ** 2);
const TAU = Math.PI * 2;

// material ids (aK.x)
export const M = {
  PANEL: 0, WOOD: 1, BRASS: 2, CARPET: 3, VELVET: 4, CEIL: 5, LINEN: 6, SHADE: 7, BULB: 8, BOTTLE: 9, MARBLE: 10, LEATHER: 11,
  MIRROR: 12, LALIQUE: 13, PAINT: 14, ROOF: 15, UNDER: 16, BELLOWS: 17, CURTAIN: 18, SILVER: 19, CHINA: 20, LACQUER: 21,
  PARQUET: 22, BOOKS: 23, LEAF: 24, LOCO: 25, KEYS: 26, FIRE: 27,
};
// the outside of the train (paint, roof, underframe, the engine) is lit by the sky, not the lamps
const isOut = (id) => (id >= M.PAINT && id <= M.UNDER) || id === M.LOCO;
const OUT_GLSL = `((id >= ${M.PAINT} && id <= ${M.UNDER}) || id == ${M.LOCO})`;

// ---------------------------------------------------------------- shaders
const TRAIN_VERT = /* glsl */`
attribute vec4 aK; attribute vec2 aS;
varying vec3 vL, vN, vC, vW, vCL, vNw; varying vec4 vK; varying vec2 vS;
void main(){
  vL = position; vN = normal; vC = color; vK = aK; vS = aS;
  vec4 wp = modelMatrix * vec4(position, 1.); vW = wp.xyz;
  vCL = (inverse(modelMatrix) * vec4(cameraPosition, 1.)).xyz; vNw = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const NROW = 7;
export const GLSL_LAMPS = /* glsl */`
#define NROW ${NROW}
uniform vec4 uRowA[NROW];   // x, y, z of the first lamp, spacing along z
uniform vec4 uRowB[NROW];   // count, intensity, size, kind (0 open, 1 in a sleeping compartment, 2 under a shade, 3 a strip)
uniform vec3 uRowC[NROW];
uniform vec3 uWinL, uWinR, uSunL;
uniform float uLampK;
// the lamps of this carriage: diffuse into D, specular (Blinn) into S (shininess sh) and S2 (a second, sharper lobe: a clear coat)
void lamps2(vec3 P, vec3 N, vec3 V, float sh, float sh2, out vec3 D, out vec3 S, out vec3 S2){
  D = vec3(0.); S = vec3(0.); S2 = vec3(0.);
  for (int r = 0; r < NROW; r++) {
    vec4 A = uRowA[r], B = uRowB[r];
    if (B.x < 0.5) continue;
    float kf = clamp(floor((P.z - A.z) / A.w + 0.5), 0., B.x - 1.);
    for (int j = -1; j <= 1; j++) {
      float k = kf + float(j);
      if (k < 0. || k > B.x - 1.) continue;
      vec3 lp = vec3(A.x, A.y, A.z + k * A.w);
      if (B.w > 0.5 && B.w < 1.5) {          // a compartment's lamp stays in its compartment
        if (j != 0 || P.x > 0.6) continue;
      }
      vec3 L = lp - P; float d2 = dot(L, L); L *= inversesqrt(d2);
      float att = B.y / (d2 + B.z * B.z);
      if (B.w > 1.5 && B.w < 2.5) {              // the shade throws a bright cone down, a darker ring round it, a little up
        float cone = smoothstep(0.5, 0.66, L.y), up = smoothstep(-0.5, -0.85, L.y) * 0.4;
        att *= 0.1 + 1.1 * cone + up;
      }
      if (B.w < 0.5 && A.y > 2.2) att *= mix(1., 0.3, smoothstep(-0.25, -0.7, L.y));    // a ceiling bowl shades the ceiling over it
      if (B.w > 2.5) att *= smoothstep(0.6, 0., abs(P.y - lp.y) - 0.5);                     // a strip behind the bar
      float nl = max(dot(N, L), 0.);
      vec3 c = uRowC[r] * att * uLampK * 3.;
      D += c * (nl * 0.85 + 0.15 * max(dot(N, L) + 0.5, 0.));
      float nh = max(dot(N, normalize(L + V)), 0.);
      S += c * pow(nh, sh) * nl * (sh + 2.) / 8.;
      S2 += c * pow(nh, sh2) * nl * (sh2 + 2.) / 8.;
    }
  }
}
void lamps(vec3 P, vec3 N, vec3 V, float sh, out vec3 D, out vec3 S){ vec3 S2; lamps2(P, N, V, sh, sh, D, S, S2); }
// grey light from the windows on either side, and a little bounce from the carpet
vec3 winLight(vec3 P, vec3 N){
  vec3 c = vec3(0.);
  vec3 Lr = normalize(vec3(1.42 - P.x, 1.35 - P.y, 0.)), Ll = normalize(vec3(-1.42 - P.x, 1.35 - P.y, 0.));
  c += uWinR * max(dot(N, Lr) * 0.8 + 0.2, 0.) / (1. + 0.9 * max(1.42 - P.x, 0.));
  c += uWinL * max(dot(N, Ll) * 0.8 + 0.2, 0.) / (1. + 0.9 * max(1.42 + P.x, 0.));
  return c;
}
`;

const TRAIN_FRAG = /* glsl */`
${GLSL_W}
${GLSL_LAMPS}
varying vec3 vL, vN, vC, vW, vCL, vNw; varying vec4 vK; varying vec2 vS;
// mahogany: ribbon-striped, with flame figure; p.x across the grain, p.y along it
vec3 mahog(vec2 p, float seed, float light){
  float w = fbm(vec2(p.x * 2.5, p.y * 0.18) + seed);
  float lines = sin((p.x + w * 0.4) * 160.) * 0.5 + 0.5;
  float fig = fbm(vec2(p.x * 14. + w * 2., p.y * 0.9) + seed * 3.1);
  float g = lines * 0.25 + fig * 0.75;
  return mix(vec3(.07, .017, .007), vec3(.20, .06, .022), g) * light;
}
// inlaid flower in a panel: q from -1..1 inside it
vec3 marquetry(vec2 q, vec3 bg, out float m){
  float r = length(q * vec2(1., 0.62));
  m = 0.;
  if (r > 0.62) return bg;
  vec3 sycamore = vec3(.36, .25, .12), ebony = vec3(.02, .012, .008), rose = vec3(.2, .05, .03), green = vec3(.05, .07, .025);
  vec3 c = sycamore * (0.85 + 0.15 * sin(q.x * 90.));
  if (r > 0.57) c = ebony;
  vec2 p = q * vec2(1., 0.62) / 0.5;
  float a = atan(p.y, p.x), rr = length(p);
  float petal = rr - (0.35 + 0.13 * cos(a * 6.));
  if (petal < 0.) c = mix(rose, rose * 1.8, rr * 2.);
  if (rr < 0.09) c = vec3(.4, .25, .05);
  // leaves on a stem below
  vec2 s = p - vec2(0., -0.6);
  float leaf = length((s - vec2(0.18, 0.12) * sign(s.x)) * vec2(1.6, 3.)) - 0.22;
  if (abs(s.x) < 0.012 && s.y > -0.4 && s.y < 0.25 && petal > 0.) c = green;
  if (leaf < 0. && petal > 0.) c = green;
  m = 1.;
  return c;
}
vec3 envWarm(vec3 R){
  vec3 c = mix(vec3(.025, .012, .006), vec3(.11, .07, .04), smoothstep(-0.3, 0.8, R.y));
  c += uWinR * 0.6 * smoothstep(0.4, 0.9, R.x) * smoothstep(-0.2, 0.2, R.y) + uWinL * 0.6 * smoothstep(-0.4, -0.9, R.x) * smoothstep(-0.2, 0.2, R.y);
  return c;
}
// what a mirror at P sees along R: the carriage's own box, roughly furnished
vec3 roomSeen(vec3 P, vec3 R){
  float tx = (sign(R.x) * WI_ - P.x) / (abs(R.x) < 1e-3 ? 1e-3 * sign(R.x + 1e-6) : R.x);
  float ty = R.y > 0. ? (2.3 - P.y) / max(R.y, 1e-3) : -P.y / min(R.y, -1e-3);
  tx = tx > 0.01 ? tx : 1e3;
  vec3 H = P + R * min(tx, ty);
  vec3 warm = vec3(1., .66, .4);
  if (ty < tx) {
    if (R.y > 0.) return vec3(.24, .19, .12) * warm * (1.6 + 2. * smoothstep(0.5, 0.0, abs(fract(H.z / 2.4) - 0.5)));
    return vec3(.06, .04, .03) * warm * 1.5;
  }
  float wz = (fract(H.z / 2.4) - 0.5) * 2.4;
  vec3 c = mahog(vec2(H.z, H.y), 2., 1.) * warm * 2.2 * (0.5 + 0.5 * smoothstep(0.2, 1.2, H.y));
  float win = step(abs(wz), 0.6) * step(0.8, H.y) * step(H.y, 1.92);
  vec3 sky = (R.x > 0. ? uWinR : uWinL) * 0.12;
  c = mix(c, sky, win);
  float cur = step(0.5, abs(wz)) * step(abs(wz), 0.82) * step(0.4, H.y) * step(H.y, 2.1);
  c = mix(c, vec3(.1, .015, .02) * warm * (1.2 + 0.6 * sin(H.z * 60.)), cur);
  return c * 0.45;
}
// an invented company's name in a 3 by 5 pixel face; u along the side from the middle, a pixel px
const int TXT[33] = int[33](31015,31599,24557,31716,31725,31087,27501,29847,31143,0,27502,31143,31183,0,31143,23213,31716,27565,31143,31183,31183,0,27502,31143,0,24557,31599,27501,29842,31725,31087,27501,31143);
float lettering(float u, float y, float y0, float px){
  float cw = px * 4., x = u + 16.5 * cw - px * 0.5;
  if (x < 0. || x >= 33. * cw || y < y0 || y >= y0 + 5. * px) return 0.;
  int ci = int(x / cw);
  float lx = x - float(ci) * cw;
  int col = int(lx / px);
  if (col > 2) return 0.;
  int row = 4 - int((y - y0) / px);
  return float((TXT[ci] >> (14 - row * 3 - col)) & 1);
}
// Lalique: leaves and stems on a grid; x = frosted, y = vein (clear lines inside the leaf)
vec2 lal(vec2 q){
  float stem = abs(q.x - floor(q.x / 3.3) * 3.3 - 1.65 - 0.4 * sin(q.y * 1.3));
  float lf = 1e3, vein = 0.;
  for (int i = -1; i <= 1; i++) {
    float cy = floor(q.y / 1.1) * 1.1 + float(i) * 1.1;
    vec2 c = vec2(floor(q.x / 3.3) * 3.3 + 1.65 + 0.4 * sin(cy * 1.3), cy);
    float sd = mod(cy, 2.2) < 1.1 ? 1. : -1.;
    vec2 d = q - c - vec2(0.45 * sd, 0.25);
    d = mat2(0.8, 0.6 * sd, -0.6 * sd, 0.8) * d;
    float l = length(d * vec2(1., 2.2)) - 0.42;
    if (l < lf) { lf = l; vein = max(smoothstep(0.03, 0.0, abs(d.y)) * step(abs(d.x), 0.4), smoothstep(0.05, 0.0, abs(fract(d.x * 5. + abs(d.y) * 6.) - 0.5) - 0.38) * step(abs(d.y), 0.17)); }
  }
  float frost = max(smoothstep(0.06, 0., stem - 0.05), smoothstep(0.04, -0.02, lf));
  return vec2(frost, vein * smoothstep(0.02, -0.06, lf) * 0.8);
}
void main(){
  vec3 N = normalize(vN), P = vL;
  vec3 Vw = normalize(cameraPosition - vW);
  vec3 V = normalize(vCL - P);   // the view direction in the carriage's frame
  int id = int(vK.x + 0.5);
  vec3 alb = vC, emit = vec3(0.);
  bool outside = ${OUT_GLSL};
  bool backSide = dot(N, V) < 0.;
  if (!outside && backSide && id != ${M.SHADE}) N = -N;     // thin sheets (cloth, plates, curtains) are seen from both sides
  bool noAO = id == ${M.SHADE} || id == ${M.BOTTLE} || id == ${M.BULB} || id == ${M.FIRE} || outside;
  float sh = 40., sp = 0.15, env = 0., metal = 0., sheen = 0., coat = 0., sh2 = 240., wood = 0., ao = noAO ? 1. : (1. - vK.z) * vS.x;
  // where on a wall: u along it, v up
  float u = abs(N.x) > 0.5 ? P.z : P.x, v = P.y;
  float fwU = fwidth(u);
  float lowK = 1.;       // darker toward the floor, where light cannot get at the corner
  if (id == ${M.PANEL}) {
    // panelling: skirting, dado panels, a rail, tall panels with marquetry, a frieze with a gilded line under the cornice
    float pitch = v < 0.84 ? 0.62 : 0.56;
    float cu = floor(u / pitch), fu = (fract(u / pitch) - 0.5) * pitch;
    vec2 lo = v < 0.84 ? vec2(0.1, 0.78) : vec2(0.95, 1.98);
    float fr = 0.05;
    float inPanel = step(abs(fu), pitch * 0.5 - fr) * step(lo.x, v) * step(v, lo.y);
    vec3 frame = mahog(vec2(v * 0.6, u), 1.3, 0.75);
    vec3 field = mahog(vec2(fu, v), cu * 3.7, 1.15);
    alb = mix(frame, field, inPanel);
    float ea = pitch * 0.5 - fr - abs(fu), eb = v - lo.x, ec = lo.y - v;
    float e = min(ea, min(eb, ec));
    if (inPanel > 0.5) {
      // boxwood stringing round the field, and a flower in every other tall panel
      alb = mix(alb, vec3(.45, .33, .17), smoothstep(0.005, 0.0, abs(e - 0.028)));
      float m;
      if (v > 0.9 && mod(cu, 2.) < 0.5) alb = marquetry(vec2(fu / (pitch * 0.5 - fr), (v - (lo.x + lo.y) * 0.5) / ((lo.y - lo.x) * 0.5) * 2.4) * 1.5, alb, m);
      alb *= mix(0.55, 1., smoothstep(0., 0.012, e));                // the shadow line of the raised field
      // the bevel of the raised field catches the light
      vec3 ua = abs(N.x) > 0.5 ? vec3(0., 0., 1.) : vec3(1., 0., 0.);
      vec3 dir = ea < min(eb, ec) ? ua * sign(fu) : (eb < ec ? vec3(0., -1., 0.) : vec3(0., 1., 0.));
      N = normalize(N + dir * smoothstep(0.014, 0.002, e) * 0.8);
    } else {
      // the moulded edge of the frame round a field
      float ee = min(pitch * 0.5 - abs(fu), min(v - (lo.x - fr), (lo.y + fr) - v));
      if (v > lo.x - fr && v < lo.y + fr && ee > 0. && abs(fu) < pitch * 0.5) { vec3 ua2 = abs(N.x) > 0.5 ? vec3(0., 0., 1.) : vec3(1., 0., 0.); N = normalize(N - ua2 * sign(fu) * smoothstep(0.012, 0., ee - fr + 0.01) * 0.4); }
    }
    if (v < 0.1) alb = mahog(vec2(v, u), 7., 0.5);
    if (v > 0.8 && v < 0.88) { alb = mahog(vec2(v, u), 4., 0.9) * (0.7 + 0.6 * smoothstep(0.82, 0.86, v)); N = normalize(N + vec3(0., 0.45 * (smoothstep(0.82, 0.85, v) - smoothstep(0.855, 0.88, v)), 0.) * -1.); }
    if (v > 1.98) { alb = mahog(vec2(v, u), 9., 0.7); alb = mix(alb, vec3(.5, .34, .1), smoothstep(0.006, 0., abs(v - 2.04)) ); }
    if (abs(N.z) > 0.5 && abs(P.z) > ${(ZE - 0.05).toFixed(2)} && v > ${(ceilY(WI) - 0.005).toFixed(3)}) {
      // the lunette at the end: a fan of veneers in two woods, gilt fillets between, a gilt shell at the foot
      vec2 q = vec2(P.x, v - ${ceilY(WI).toFixed(3)});
      float ang = atan(q.x, q.y + 0.08), rr = length(q * vec2(1., 1.6));
      float ray = fract(ang * 3.8197 + 0.5);                 // 24 rays over the half circle
      alb = mix(mahog(vec2(ray * 0.2, rr * 3.), floor(ang * 3.8197 + 0.5), 0.75), mahog(vec2(rr * 2., ray), 21., 1.25), step(0.5, ray));
      float gilt = smoothstep(0.035, 0.0, abs(ray - 0.5) * rr * 2.2) + smoothstep(0.004, 0., abs(rr - 0.11)) + smoothstep(0.004, 0., abs(rr - 0.13));
      alb = mix(alb, vec3(.55, .37, .11), clamp(gilt, 0., 1.) * step(0.1, rr));
      if (rr < 0.11) { alb = vec3(.5, .34, .1) * (0.7 + 0.3 * sin(ang * 40.)); metal = 0.7; }
      alb = mix(alb, vec3(.5, .34, .1), smoothstep(0.008, 0., abs(v - ${(ceilY(WI) + 0.012).toFixed(3)})));
    }
    // the varnish: a satin sheen with a clear coat over it, smudged where hands go
    sh = 14.; sp = 0.3; env = 0.3; sh2 = 700.; coat = 0.75 * (0.78 + 0.3 * fbm(vec2(u, v) * 5.)) * (0.8 + 0.2 * smoothstep(0.6, 1.2, v)); wood = 1.;
    lowK = mix(0.55, 1., smoothstep(0., 0.35, v)) * mix(0.72, 1., smoothstep(0., 0.3, (2.16 + 0.3 * (1. - P.x * P.x / 1.96)) - v));
    ao *= mix(0.72, 1., smoothstep(0., 0.4, ${ZE.toFixed(2)} - abs(P.z)));
  }
  else if (id == ${M.WOOD}) {
    alb = mahog(abs(N.y) > 0.5 ? P.xz * vec2(1., 0.3) : vec2(u, v * 0.3), vK.y * 7., vK.w > 0. ? vK.w : 1.);
    alb *= 0.85 + 0.3 * vnoise(P.xz * 6. + P.y * 5.);
    sh = 14.; sp = 0.3; env = 0.35; sh2 = 700.; coat = 0.7 * (0.78 + 0.3 * fbm(P.xz * 6. + P.y * 5.)); wood = 1.;
    lowK = mix(0.6, 1., smoothstep(0., 0.3, P.y));
  }
  else if (id == ${M.BRASS} || id == ${M.SILVER}) {
    metal = 1.; sh = 90.; sp = 1.2; env = 1.;
    float tn = fbm(P.xz * 13. + P.yy * 9.), fp = vnoise(P.yz * 140. + P.x * 60.);
    if (id == ${M.BRASS}) {
      alb = mix(vec3(.66, .46, .17), vec3(.3, .19, .07), smoothstep(0.5, 0.85, tn) * 0.75);       // tarnish in patches
      alb *= 0.9 + 0.2 * fp;
      sh = mix(110., 45., smoothstep(0.55, 0.85, tn));
    } else { alb = mix(vec3(.62, .62, .64), vec3(.35, .34, .33), smoothstep(0.6, 0.9, tn) * 0.5) * (0.92 + 0.12 * fp); }
  }
  else if (id == ${M.CARPET}) {
    // a patterned runner: medallions, a border along the aisle, plain field to the walls
    vec2 q = P.xz;
    vec2 c = (fract(q / vec2(0.5, 0.5) + 0.5) - 0.5) * 0.5;
    float r = length(c), a = atan(c.y, c.x);
    float motif = smoothstep(0.012, 0., abs(r - 0.16 - 0.03 * cos(a * 8.))) + smoothstep(0.03, 0.0, r - 0.05) + smoothstep(0.01, 0., abs(abs(c.x) + abs(c.y) - 0.24));
    float border = smoothstep(0.015, 0., abs(abs(P.x - vK.y) - vK.w)) + smoothstep(0.03, 0., abs(abs(P.x - vK.y) - vK.w + 0.06)) * 0.5;
    float inRun = step(abs(P.x - vK.y), vK.w);
    // pile: tufts, flattened and faded along the aisle where feet go
    float lodF = 1. - smoothstep(0.5, 1.2, length(fwidth(q)) * 220.);
    float pile = hash12(floor(q * 260.)) * 0.5 + vnoise(q * 90.) * 0.5;
    float walk = inRun * smoothstep(0.7, 0.2, abs(P.x - vK.y) / max(vK.w, 0.1)) * smoothstep(0.35, 0.75, fbm(q * vec2(5., 2.)));
    alb = vC * (0.82 + 0.3 * mix(0.5, pile, lodF));
    alb = mix(alb, vec3(.32, .2, .06), clamp(motif * inRun * 0.8 + border, 0., 1.));
    alb = mix(alb, vC * 0.55, (1. - inRun) * step(0.01, vK.w));
    alb *= 1. - 0.22 * walk; alb = mix(alb, alb * vec3(1.12, 1.05, 0.95), walk * 0.5);
    ao *= mix(0.6, 1., smoothstep(0.02, 0.25, WI_ - abs(P.x))) * mix(0.7, 1., smoothstep(0., 0.3, ${ZE.toFixed(2)} - abs(P.z)));
    sh = 4.; sp = 0.03; sheen = 0.6;
  }
  else if (id == ${M.VELVET} || id == ${M.CURTAIN}) {
    float nap = vnoise(P.xy * 300. + P.z * 200.);
    alb = vC * (0.88 + 0.2 * nap) * (0.88 + 0.24 * fbm(P.xz * 5. + P.y * 3.));
    if (id == ${M.VELVET}) {
      float tuft = vK.y;
      if (tuft > 0.5 && tuft < 1.5 && abs(N.y) < 0.6) {
        // deep-buttoned diamonds on the upright faces: puffs between creases, a dimple at every button
        const float TS = 0.088;
        float aa = 1. - smoothstep(0.3, 0.7, fwU / TS);
        float uu = abs(N.x) > 0.5 ? P.z : P.x;
        float ta = (uu + P.y) / TS, tb = (uu - P.y) / TS;
        float fa = fract(ta), fb = fract(tb);
        float sa = sin(3.14159 * fa), sb = sin(3.14159 * fb);
        float dA = 3.14159 * cos(3.14159 * fa) * sb, dB = 3.14159 * sa * cos(3.14159 * fb);
        vec3 Ut = abs(N.x) > 0.5 ? vec3(0., 0., 1.) : vec3(1., 0., 0.);
        N = normalize(N - (Ut * (dA + dB) + vec3(0., 1., 0.) * (dA - dB)) * (0.011 / TS) * aa);
        float bd = length(vec2(min(fa, 1. - fa), min(fb, 1. - fb))) * TS * 0.7071;
        ao *= mix(1., 0.55 + 0.45 * smoothstep(0., 0.4, sa * sb), aa);
        alb *= mix(1., 1. - 0.65 * smoothstep(0.011, 0.004, bd), aa);
      }
      lowK = mix(0.55, 1., smoothstep(0.05, 0.4, P.y));
    }
    if (id == ${M.CURTAIN}) { lowK = mix(0.7, 1., smoothstep(0.3, 0.9, P.y)); }
    sheen = 1.; sh = 8.; sp = 0.05;
  }
  else if (id == ${M.CEIL}) {
    // aged ivory lincrusta: an embossed lattice with a gilt rosette at every crossing, gilt half-round ribs across,
    // a painted border along each side with gilt fillets
    float z = P.z;
    vec2 g = vec2(P.x + z, P.x - z) * 3.;
    vec2 d = fract(g) - 0.5;
    float lodC = 1. - smoothstep(0.03, 0.12, length(fwidth(g)));
    vec2 bead = smoothstep(0.07, 0.0, abs(d)) * lodC;
    float rz = (fract(z / 0.92) - 0.5) * 0.92, rib = smoothstep(0.024, 0.016, abs(rz));
    vec2 rc = vec2(fract(g.x) , fract(g.y));
    float ros = smoothstep(0.075, 0.05, length(min(rc, 1. - rc))) * lodC;
    float band = step(0.72, abs(P.x)) * step(abs(P.x), 0.92);
    float edge = smoothstep(0.012, 0., abs(abs(P.x) - 0.92)) + smoothstep(0.012, 0., abs(abs(P.x) - 0.72));
    alb = vec3(.235, .185, .12) * (0.82 + 0.3 * fbm(P.xz * vec2(2., 0.7) + 3.)) * (1. - 0.18 * max(bead.x, bead.y));
    alb *= 1. - 0.12 * smoothstep(0.35, 0., abs(P.x)) * (0.5 + 0.5 * fbm(P.xz * vec2(3., 0.4)));     // a breath of lamp smoke down the middle
    alb = mix(alb, vec3(.14, .045, .025) * (0.85 + 0.15 * sin(z * 40.)), band * 0.85);
    float gilt = clamp(max(rib, edge) + ros * 0.45, 0., 1.);
    alb = mix(alb, vec3(.5, .34, .11) * (0.8 + 0.3 * vnoise(P.xz * 40.)), gilt);
    // the relief: beads tilt the normal away from their crest, ribs are half-round
    vec3 ta = normalize(vec3(1., 0., 1.)), tb = normalize(vec3(1., 0., -1.));
    N = normalize(N - ta * sign(d.x) * bead.x * 0.45 - tb * sign(d.y) * bead.y * 0.45 - vec3(0., 0., 1.) * (rz / 0.024) * rib * 0.7);
    metal = gilt * 0.45; sh = mix(24., 70., gilt); sp = 0.12 + gilt * 0.8; env = gilt * 0.5; sheen = 0.;
    ao *= mix(0.55, 1., smoothstep(0., 0.45, WI_ - abs(P.x))) * mix(0.75, 1., smoothstep(0., 0.4, ${ZE.toFixed(2)} - abs(P.z))) * (1. - 0.25 * max(bead.x, bead.y) * 0.);
  }
  else if (id == ${M.LINEN}) {
    // damask: a fine weave, a faint brocade, soft creases
    float lodW = 1. - smoothstep(0.4, 1., length(fwidth(P.xz)) * 700.);
    float weave = sin(P.x * 1500.) * sin(P.z * 1500.) * 0.5 + 0.5;
    float brocade = smoothstep(0.1, 0.3, abs(fract(P.x * 14. + P.z * 14.) - 0.5)) * smoothstep(0.1, 0.3, abs(fract(P.x * 14. - P.z * 14.) - 0.5));
    alb = vC * (0.93 + 0.05 * vnoise(P.xz * 400.) + 0.04 * (weave - 0.5) * lodW) * (0.96 + 0.05 * brocade * 1.);
    alb *= 0.93 + 0.1 * fbm(P.xz * 7. + P.y * 3.);
    sh = 6.; sp = 0.02; sheen = 0.5;
    lowK = mix(0.72, 1., smoothstep(0.4, 0.74, P.y));
  }
  else if (id == ${M.CHINA}) { alb = vC * (0.92 + 0.08 * vnoise(P.xz * 400.)); sh = 120.; sp = 0.8; env = 0.35; }
  else if (id == ${M.SHADE}) {
    // pleated silk lit from inside: brightest nearest the bulb, the pleats' folds darker, the inside hot, and a
    // little of the bulb's light caught at the rims
    float an = atan(P.z - vK.w, P.x - vK.z), r = length(P.xz - vK.zw);
    float pf = fract(an * 28. / 6.2832), pl = 0.72 + 0.28 * smoothstep(0., 0.5, min(pf, 1. - pf) * 2.) ;
    float near = mix(1.45, 0.7, clamp((r - 0.065) / 0.055, 0., 1.));
    bool inside = backSide;
    vec3 hot = mix(vC, vec3(1., .86, .62), 0.45);
    emit = (inside ? hot * 2.4 : vC * pl * near * (0.85 + 0.15 * vnoise(vec2(an * 40., P.y * 200.)))) * vK.y * uLampK;
    alb = vC * 0.3;
  }
  else if (id == ${M.BULB} || id == ${M.FIRE}) { emit = vC * vK.y * (id == ${M.FIRE} ? (0.75 + 0.25 * sin(uTime * 11. + sin(uTime * 3.7) * 3.)) : uLampK); alb = vec3(0.); }
  else if (id == ${M.BOTTLE}) {
    // glass bottles (vK.w > 0: height, vK.z: where it stands), their labels and foil; vK.w < 0: wine in a glass; else a clear glass
    float ndv = max(dot(N, V), 0.);
    if (vK.w > 0.) {
      float hh = vK.w > 1. ? vK.w - 1. : vK.w;
      float t = (P.y - vK.z) / hh;
      float lab = (vK.w > 1. ? 0. : 1.) * smoothstep(0.0, 0.01, t - 0.1) * smoothstep(0.0, 0.01, 0.42 - t) * step(0.5, abs(N.y) < 0.5 ? 1. : 0.);
      vec3 paper = mix(vec3(.55, .5, .38), vec3(.5, .42, .3), step(0.5, hash12(vec2(floor(vK.z * 50.), floor(P.x * 31. + P.z * 17.)))));
      float ring = smoothstep(0.012, 0., abs(t - 0.26) - 0.07);
      float band = smoothstep(0.01, 0., abs(t - 0.14) - 0.003) + smoothstep(0.01, 0., abs(t - 0.38) - 0.003);
      alb = vC * 0.25;
      alb = mix(alb, paper * (0.8 + 0.3 * ring), lab);
      alb = mix(alb, vec3(.35, .22, .06), band * lab);
      emit = vC * vK.y * 0.3 * (0.2 + 0.8 * ndv * ndv) * (1. - lab) * smoothstep(0.86, 0.6, t);
      sh = 200.; sp = 1.5 * (1. - lab * 0.8); env = 0.7 * (1. - lab * 0.8);
    } else if (vK.w < 0.) {
      alb = vC * 0.1; emit = vC * (0.18 + 0.4 * ndv) * (0.4 + 0.6 * uLampK); sh = 160.; sp = 1.2; env = 0.5;
    } else {
      alb = vec3(.02); emit = vec3(.1, .08, .06) * (0.35 + 1.6 * pow(1. - ndv, 2.)) * uLampK + vC * vK.y * 0.2; sh = 300.; sp = 2.4; env = 1.0;
    }
  }
  else if (id == ${M.MARBLE}) {
    float vein = abs(fbm(P.xz * vec2(9., 3.) + fbm(P.xz * 4.) * 2.) - 0.5);
    alb = mix(vec3(.2, .18, .16), vec3(.42, .4, .36), smoothstep(0.0, 0.04, vein)) * (0.9 + 0.1 * vnoise(P.xz * 30.)); sh = 150.; sp = 0.9; env = 0.5;
  }
  else if (id == ${M.LEATHER}) {
    float cell = vnoise(P.xz * 220. + P.y * 190.);
    alb = vC * (0.75 + 0.3 * cell) * (0.8 + 0.4 * fbm(P.xz * 6. + P.y * 7.)); sh = 22.; sp = 0.4; env = 0.2; coat = 0.4 + 0.4 * cell;
    if (vK.y > 0.5 && vK.y < 1.5 && abs(N.y) < 0.6) {
      const float TS = 0.1;
      float aa = 1. - smoothstep(0.3, 0.7, fwU / TS);
      float uu = abs(N.x) > 0.5 ? P.z : P.x;
      float fa = fract((uu + P.y) / TS), fb = fract((uu - P.y) / TS);
      float sa = sin(3.14159 * fa), sb = sin(3.14159 * fb);
      float dA = 3.14159 * cos(3.14159 * fa) * sb, dB = 3.14159 * sa * cos(3.14159 * fb);
      vec3 Ut = abs(N.x) > 0.5 ? vec3(0., 0., 1.) : vec3(1., 0., 0.);
      N = normalize(N - (Ut * (dA + dB) + vec3(0., 1., 0.) * (dA - dB)) * (0.013 / TS) * aa);
      ao *= mix(1., 0.6 + 0.4 * smoothstep(0., 0.4, sa * sb), aa);
    }
    lowK = mix(0.6, 1., smoothstep(0.05, 0.4, P.y));
  }
  else if (id == ${M.MIRROR}) {
    // an old mirror: the room opposite (panelling, the windows with curtains either side, the ceiling, the
    // carpet), the lamps in it as highlights, the silvering foxed at the edges
    vec3 R = reflect(-V, N);
    alb = vec3(.72, .66, .58); sh = 600.; sp = 3.; env = 0.25; metal = 1.;
    emit = roomSeen(P, R) * alb;
    float fox = smoothstep(0.62, 0.85, fbm(P.zy * 7. + P.x * 3.)) * 0.3 + 0.15 * smoothstep(0.75, 0.95, vnoise(P.zy * 90.));
    emit *= 1. - fox; alb *= 1. - fox * 0.5; alb = mix(alb, alb * vec3(1., .85, .6), fox);
  }
  else if (id == ${M.LALIQUE}) {
    // etched glass: frosted leaves on a polished ground, lit from behind through the thickness of the pane
    vec2 q = vec2(u, v) * 24.;
    vec2 vt = abs(N.x) > 0.5 ? vec2(V.z, V.y) : vec2(V.x, V.y);
    float lodE = 1. - smoothstep(0.35, 0.9, fwU * 24.);
    vec2 f1 = mix(vec2(0.4, 0.), lal(q), lodE), f2 = mix(vec2(0.4, 0.), lal(q + vt * 0.5), lodE);
    float grain = 0.75 + 0.5 * mix(0.5, vnoise(q * 11.), lodE);
    float frost = f1.x * (1. - f1.y);
    alb = vec3(.36, .33, .29) * (0.25 + 0.75 * frost) * grain;
    float glow = 0.75 + 0.25 * smoothstep(0.4, 1.0, 1. - abs(fract(v * 0.8) - 0.5) * 1.2);
    emit = vec3(1., .72, .45) * vK.y * ((0.2 + 0.8 * f2.x * (1. - f2.y * 0.8)) * grain) * glow * uLampK;
    emit += vec3(.5, .4, .3) * f1.y * 0.04 * vK.y;
    sh = 160.; sp = 1.2 * (1. - frost * 0.7); env = 0.7 * (1. - frost * 0.6);
  }
  else if (id == ${M.BELLOWS}) { alb = vec3(.03, .028, .025) * (0.5 + 0.5 * smoothstep(-0.5, 0.5, sin(P.z * 60.))); sh = 10.; sp = 0.05; }
  else if (id == ${M.LACQUER}) { alb = vec3(.006, .005, .005); sh = 200.; sp = 1.8; env = 0.3; coat = 0.35; sh2 = 800.; }
  else if (id == ${M.PARQUET}) {
    vec2 q = P.xz * 6.; float row = floor(q.x); float o = mod(row, 2.) * 0.5;
    alb = mahog(vec2(fract(q.x), q.y + o), row, 1.4) * (0.8 + 0.3 * hash12(vec2(row, floor(q.y + o))));
    sh = 30.; sp = 0.3; env = 0.25; coat = 0.6; sh2 = 600.; wood = 1.;
  }
  else if (id == ${M.BOOKS}) { float b = floor(P.z * 28.); alb = mix(vec3(.15, .03, .02), vec3(.03, .07, .05), hash12(vec2(b, 1.))) * (0.6 + 0.8 * hash12(vec2(b, 3.))); alb = mix(alb, vec3(.4, .28, .08), step(0.92, fract(P.y * 9.)) * 0.6); sh = 10.; sp = 0.05; }
  else if (id == ${M.LEAF}) { alb = vec3(.02, .05, .02) * (0.7 + 0.6 * vnoise(P.xz * 40.)); sh = 20.; sp = 0.2; }
  else if (id == ${M.KEYS}) { alb = vC * (0.92 + 0.08 * vnoise(P.xz * vec2(500., 80.))); sh = 140.; sp = 0.5; env = 0.3; coat = 0.7; sh2 = 500.; }

  vec3 c;
  if (outside) {
    // the outside of the train: paint with gold lining, a roof, the running gear; lit by the stormy sky
    float wet = 1.;
    if (id == ${M.PAINT}) {
      alb = vC;
      float y = P.y;
      float line = smoothstep(0.012, 0., abs(y - vK.y + 0.07)) + smoothstep(0.012, 0., abs(y - vK.z - 0.07)) + smoothstep(0.012, 0., abs(y - 0.1)) + smoothstep(0.02, 0., abs(y - 2.2));
      alb = mix(alb, vec3(.5, .34, .1), clamp(line, 0., 1.));
      // a crest midway along the carriage
      vec2 cr = vec2(P.z, y - 0.45); float co = length(cr * vec2(1., 1.4));
      alb = mix(alb, vec3(.5, .34, .1), smoothstep(0.012, 0., abs(co - 0.22)) + smoothstep(0.015, 0., abs(co - 0.12)) * 0.8);
      // the company's name in gold over the windows, read from outside
      if (abs(N.x) > 0.5) {
        const float px = 0.024;
        float y0 = (vK.z + 0.07 + 2.2) * 0.5 - 2.5 * px;
        float txt = lettering(N.x > 0. ? -P.z : P.z, y, y0, px);
        alb = mix(alb, vec3(.55, .38, .12), txt);
        metal = txt;
      }
      // the varnish: a deep gloss, with rain running down it
      float wet = fbm(vec2(P.z * 16., P.y * 1.2 - uTime * 0.3));
      sh = mix(70., 160., wet); sp = 0.7 + 0.5 * wet;
    } else if (id == ${M.ROOF}) {
      // a canvas-and-paint roof: seams across every half metre, streaks of soot from the engine
      float sm = smoothstep(0.03, 0., abs(fract(P.z / 0.5) - 0.5) * 0.5);
      alb = vec3(.04, .041, .045) * (0.7 + 0.5 * vnoise(P.xz * vec2(3., 1.))) * (1. - 0.4 * sm) * (0.8 + 0.3 * fbm(P.xz * vec2(1.5, 0.2)));
      sh = 40.; sp = 0.6 * (1. - 0.5 * sm);
    }
    else if (id == ${M.UNDER}) { alb = vec3(.02, .018, .016) * (0.6 + 0.6 * vnoise(P.xz * 20. + P.y * 13.)); sh = 10.; sp = 0.15; }
    else if (id == ${M.LOCO}) { alb = vC; sh = 80.; sp = 0.7; }
    vec3 Nw = normalize(vNw);
    c = lightOut(alb, Nw, vW, ao);
    float fr = 0.04 + 0.96 * pow(1. - max(dot(Nw, Vw), 0.), 5.);
    c += hazeCol(reflect(-Vw, Nw)) * fr * sp * 0.55 * wet;      // the sky in the gloss, only at grazing angles: the blue stays blue
    c += uSunCol * pow(max(dot(Nw, normalize(uSunDir + Vw)), 0.), sh) * sp * 0.6 * sunGap(vW.xz);
    c += emit;
    c = fogged(c, vW);
    gl_FragColor = vec4(c * uDim, 1.);
    return;
  }
  // inside: the carriage's lamps, the light of the windows, glossy varnish
  ao *= lowK;
  vec3 D, S, S2;
  lamps2(P, N, V, sh, sh2, D, S, S2);
  float lv = vS.y;
  D *= lv; S *= lv; S2 *= lv;
  vec3 W = winLight(P, N);
  vec3 amb = vec3(.012, .008, .006) * (0.6 + 0.4 * N.y);
  vec3 R = reflect(-V, N);
  float ndv = max(dot(N, V), 0.);
  float fr = 0.04 + 0.96 * pow(1. - ndv, 5.);
  vec3 base = metal > 0.5 ? vec3(0.) : alb;
  c = base * (D + W + amb) * ao * (sheen > 0.5 && id != ${M.LINEN} ? 0.85 : 1.);
  if (sheen > 0.) c += alb * (D + W + amb * 2.) * pow(1. - ndv, 2.5) * 1.5 * sheen * ao;
  vec3 sc = metal > 0.5 ? alb : vec3(1.);
  // varnished wood: the broad lobe is the light that went into the wood and came back, so it has the wood's colour;
  // only the clear coat over it gives back the lamps white and sharp
  vec3 sw = wood > 0.5 ? min(alb * 4.5, vec3(1.)) : sc;
  c += S * sp * sw * (metal > 0.5 ? 1. : 0.25 + fr);
  c += S2 * coat * (0.3 + fr * 1.5);
  c += envWarm(R) * (env + coat * 0.3) * mix(sc, sw, 0.6) * (metal > 0.5 ? 1. : fr * 2.) * ao;
  c += emit;
  gl_FragColor = vec4(c * uDim, 1.);
}`.replace(/WI_/g, WI.toFixed(2));

// window glass: running drops refract the previous frame; the glass itself gives back the lit room, faintly
const GLASS_FRAG = /* glsl */`
${GLSL_W}
${GLSL_LAMPS}
uniform sampler2D tPrev; uniform vec2 uRes; uniform float uSpeed, uOut;
varying vec3 vL, vN, vC, vW, vCL, vNw; varying vec4 vK;
float drop(vec2 p, vec2 c, vec2 r){ vec2 d = (p - c) / r; return 1. - dot(d, d); }
void main(){
  vec3 N = normalize(vN);
  // on the side windows across is z (rearward), on the end windows x
  vec2 q = abs(N.x) > 0.5 ? vec2(vL.z, vL.y) : vec2(vL.x, vL.y);
  float t = uTime;
  vec2 nrm = vec2(0.); float cover = 0.;
  // drops blown back along the glass by the speed, sliding a little down
  vec2 dir = normalize(vec2(1., -0.18 - 0.5 / (1. + uSpeed)));
  vec2 side = vec2(-dir.y, dir.x);
  vec2 a = vec2(dot(q, dir), dot(q, side));
  for (int L = 0; L < 2; L++) {
    float cw = L == 0 ? 0.045 : 0.028;
    float col = floor(a.y / cw);
    float h = hash12(vec2(col, float(L) * 7.));
    float spd = (0.25 + 0.6 * h) * (0.3 + uSpeed * 0.05);
    float per = 0.5 + h * 0.6;
    float pos = fract(h * 13. + t * spd / per) * per;
    float along = mod(a.x, per) - pos;
    float cy = (col + 0.5) * cw + 0.006 * sin(a.x * 30. + h * 20.);
    float k = drop(vec2(along, a.y), vec2(0., cy), vec2(0.009, 0.005) * (0.7 + h * 0.6));
    // the trail of beads behind it
    float tb = 0.;
    if (along < 0. && along > -0.18 * (1. + h)) {
      float bi = floor(along / 0.022);
      float bh = hash12(vec2(bi, col * 3.1));
      tb = drop(vec2(fract(along / 0.022) * 0.022, a.y), vec2(0.011, cy + (bh - 0.5) * 0.004), vec2(0.003, 0.003) * (0.4 + bh)) * step(0.35, bh);
    }
    float m = max(k, tb);
    if (m > 0.) { cover = max(cover, smoothstep(0., 0.25, m)); nrm += (vec2(along, a.y - cy)) * 30. * m; }
  }
  // still beads all over
  vec2 g = q / 0.016; vec2 gi = floor(g), gf = fract(g) - 0.5;
  float bh = hash12(gi + 5.);
  if (bh > 0.7) {
    vec2 o = (vec2(hash12(gi + 1.), hash12(gi + 2.)) - 0.5) * 0.5;
    float m = drop(gf, o, vec2(0.18 + 0.2 * (bh - 0.55)));
    if (m > 0.) { cover = max(cover, smoothstep(0., 0.3, m) * 0.7); nrm += (gf - o) * 0.6 * m; }
  }
  vec2 suv = gl_FragCoord.xy / uRes;
  vec3 back = texture2D(tPrev, suv - nrm * 0.035 + vec2(0., 0.01) * cover).rgb;
  vec3 hi = vec3(1., .75, .5) * smoothstep(0.6, 0.95, cover) * pow(max(nrm.y, 0.), 2.) * 0.4 * uOut;
  vec3 dv = vL - vCL; float dl = length(dv);
  float ndv = abs(dot(N, dv)) / dl;
  float fr = 0.06 + 0.5 * pow(1. - ndv, 4.);
  // the room in the glass: the dark wall opposite, and the lamps of the carriage mirrored (a lamp's image lies as far behind the pane as the lamp is in front)
  vec3 refl = vec3(.03, .018, .01) * (0.4 + 0.6 * smoothstep(0.5, 2.2, vL.y));
  float xg = vL.x;
  for (int r = 0; r < NROW; r++) {
    vec4 A = uRowA[r], B = uRowB[r];
    if (B.x < 0.5 || abs(dv.x) < 0.02) continue;
    float xi = 2. * xg - A.x;
    float tt = (xi - vCL.x) / dv.x;
    if (tt < 0.) continue;
    vec3 H = vCL + dv * tt;
    float k = clamp(floor((H.z - A.z) / A.w + 0.5), 0., B.x - 1.);
    vec2 dd = H.zy - vec2(A.z + k * A.w, A.y);
    float sz = 0.5 * B.z + 0.05;
    float rr = dot(dd, dd) / (sz * sz);
    float glow = exp(-rr * 0.6) + 0.12 / (1. + rr * 0.25);
    refl += uRowC[r] * B.y * uLampK * glow * 3.;
  }
  refl *= fr * 1.2 * uOut;
  float al = 0.06 + cover * 0.7;
  vec3 col = back * 0.85 * cover + hi + refl + vec3(.008, .01, .012) * (1. - cover);
  gl_FragColor = vec4(col * uDim, al);
}`;

// ---------------------------------------------------------------- the builder: triangles with position, normal, colour, aK
// Materials that block light in the bake (`occupancy`) and that receive it (`bakeable`)
const NO_BAKE = new Set([M.SHADE, M.BULB, M.FIRE, M.BOTTLE]);
const NO_OCC = new Set([M.SHADE, M.BULB, M.FIRE, M.MIRROR, M.LALIQUE, M.CEIL, M.CARPET, M.CHINA]);
function builder() {
  const P = [], N = [], C = [], K = [], I = [], S = [];
  let n = 0;
  const b = {
    solids3: [], noOcc: false,
    v(p, nn, c, k) { P.push(p[0], p[1], p[2]); N.push(nn[0], nn[1], nn[2]); C.push(c[0], c[1], c[2]); K.push(k[0], k[1] || 0, k[2] || 0, k[3] || 0); S.push(1, 1); return n++; },
    // a flat quad from four corners (in order round it)
    tri(a, bb, c) { I.push(a, bb, c); },
    quad(a, bb, c, d, nn, col, k) { const i = b.v(a, nn, col, k); b.v(bb, nn, col, k); b.v(c, nn, col, k); b.v(d, nn, col, k); I.push(i, i + 1, i + 2, i, i + 2, i + 3); },
    // the same, cut into cells no bigger than `cell`, so the baked light can vary across it
    quadG(a, bb, c, d, nn, col, k, cell = 0.15) {
      const lu = Math.max(Math.hypot(bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]), Math.hypot(c[0] - d[0], c[1] - d[1], c[2] - d[2]));
      const lv = Math.max(Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]), Math.hypot(c[0] - bb[0], c[1] - bb[1], c[2] - bb[2]));
      const nu = Math.max(1, Math.ceil(lu / cell)), nv = Math.max(1, Math.ceil(lv / cell));
      if (nu * nv === 1) return b.quad(a, bb, c, d, nn, col, k);
      const base = n;
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
        const u = i / nu, w = j / nv, p = [0, 0, 0];
        for (let m = 0; m < 3; m++) p[m] = a[m] + (bb[m] - a[m]) * u + (d[m] - a[m]) * w + (a[m] - bb[m] + c[m] - d[m]) * u * w;
        b.v(p, nn, col, k);
      }
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const A = base + j * (nu + 1) + i, B = A + 1, Cc = A + nu + 2, D = A + nu + 1; I.push(A, B, Cc, A, Cc, D); }
    },
    // an occluder for the bake: a box, or a lathe (exact, by its profile)
    solid(x0, y0, z0, x1, y1, z1) { b.solids3.push({ t: 0, x0, y0, z0, x1, y1, z1 }); },
    // an axis-aligned box; skip: faces to leave out ("-x", "+x", "-y", "+y", "-z", "+z"); the underside darkens
    box(x0, y0, z0, x1, y1, z1, col, k, skip = "") {
      if (!b.noOcc && !NO_OCC.has(k[0]) && !isOut(k[0])) b.solid(x0, y0, z0, x1, y1, z1);
      const big = !NO_BAKE.has(k[0]) && !isOut(k[0]);
      const F = [
        ["-x", [-1, 0, 0], [[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]]],
        ["+x", [1, 0, 0], [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]]],
        ["-y", [0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
        ["+y", [0, 1, 0], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]],
        ["-z", [0, 0, -1], [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]]],
        ["+z", [0, 0, 1], [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]]],
      ];
      for (const [name, nn, q] of F) if (!skip.includes(name)) (big ? b.quadG : b.quad)(...q, nn, col, name === "-y" ? [k[0], k[1] || 0, Math.max(k[2] || 0, 0.45), k[3] || 0] : k, 0.2);
    },
    // a solid of revolution: prof = [[r, y], ...] from bottom to top; axis "y" (upright), "x" or "z" (lying)
    lathe(cx, cy, cz, prof, seg, col, k, axis = "y") {
      if (!b.noOcc && !NO_OCC.has(k[0]) && !isOut(k[0]) && Math.max(...prof.map((q) => q[0])) >= (k[0] === M.BOTTLE ? 0.025 : 0.045)) b.solids3.push({ t: 1, cx, cy, cz, prof, axis });
      const map = (r, a, y) => {
        const c = Math.cos(a) * r, s = Math.sin(a) * r;
        if (axis === "y") return [cx + c, cy + y, cz + s];
        if (axis === "z") return [cx + c, cy + s, cz + y];
        return [cx + y, cy + c, cz + s];
      };
      const mapN = (nr, a, ny) => {
        const c = Math.cos(a) * nr, s = Math.sin(a) * nr;
        if (axis === "y") return [c, ny, s];
        if (axis === "z") return [c, s, ny];
        return [ny, c, s];
      };
      for (let i = 0; i < prof.length - 1; i++) {
        const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
        let nr = y1 - y0, ny = -(r1 - r0); const l = Math.hypot(nr, ny) || 1; nr /= l; ny /= l;
        const s0 = n;
        for (let m = 0; m <= seg; m++) { const a = m / seg * TAU; b.v(map(r0, a, y0), mapN(nr, a, ny), col, k); b.v(map(r1, a, y1), mapN(nr, a, ny), col, k); }
        for (let m = 0; m < seg; m++) { const a = s0 + m * 2; I.push(a, a + 1, a + 3, a, a + 3, a + 2); }
      }
    },
    // a soft shadow under furniture: dark in the middle, fading out (on the floor, or at height y on a cloth)
    blobAt(cx, y, cz, rx, rz, col, k, dark = 0.55) {
      const c0 = b.v([cx, y, cz], [0, 1, 0], col, [k[0], k[1], dark, k[3]]), seg = 16;
      for (let m = 0; m <= seg; m++) { const a = m / seg * TAU; b.v([cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz], [0, 1, 0], col, [k[0], k[1], 0, k[3]]); }
      for (let m = 0; m < seg; m++) I.push(c0, c0 + 1 + m, c0 + 2 + m);
    },
    blob(cx, cz, rx, rz) { b.blobAt(cx, 0.003, cz, rx, rz, b.carpet[0], b.carpet[1]); },
    // a box with rounded edges (radius r) and smooth normals; k[1] stays free for the material
    rbox(x0, y0, z0, x1, y1, z1, r, col, k, skip = "") {
      if (!b.noOcc && !NO_OCC.has(k[0])) b.solid(x0, y0, z0, x1, y1, z1);
      r = Math.min(r, (x1 - x0) / 2 - 1e-4, (y1 - y0) / 2 - 1e-4, (z1 - z0) / 2 - 1e-4);
      const lo = [x0, y0, z0], hi = [x1, y1, z1];
      const list = (a) => [lo[a], lo[a] + r * 0.5, lo[a] + r, hi[a] - r, hi[a] - r * 0.5, hi[a]];
      const names = ["x", "y", "z"];
      for (let a = 0; a < 3; a++) for (const s of [-1, 1]) {
        if (skip.includes((s < 0 ? "-" : "+") + names[a])) continue;
        const bb = (a + 1) % 3, cc = (a + 2) % 3, lb = list(bb), lc = list(cc), base = n;
        for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
          const q = [0, 0, 0]; q[a] = s < 0 ? lo[a] : hi[a]; q[bb] = lb[i]; q[cc] = lc[j];
          const d = [0, 0, 0], p = [0, 0, 0];
          for (let m = 0; m < 3; m++) { d[m] = q[m] - Math.min(Math.max(q[m], lo[m] + r), hi[m] - r); }
          const l = Math.hypot(d[0], d[1], d[2]) || 1, nn = [d[0] / l, d[1] / l, d[2] / l];
          for (let m = 0; m < 3; m++) p[m] = Math.min(Math.max(q[m], lo[m] + r), hi[m] - r) + nn[m] * r;
          b.v(p, nn, col, [k[0], k[1] || 0, Math.max(k[2] || 0, 0.4 * Math.max(0, -nn[1])), k[3] || 0]);
        }
        for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
          const A = base + i * 6 + j, B = A + 1, C = A + 7, D = A + 6;
          // wind so that the triangle faces along the face normal
          const flip = ((a === 0 ? 1 : a === 1 ? 1 : 1) * s) > 0;
          if (flip) I.push(A, B, C, A, C, D); else I.push(A, C, B, A, D, C);
        }
      }
    },
    // a grid of points fn(u, v) -> [x, y, z, ao?]; normals from the neighbours, turned to face toward
    grid(rows, cols, fn, col, k, toward) {
      const pts = [], base = n;
      for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) pts.push(fn(i / rows, j / cols));
      const at = (i, j) => pts[Math.max(0, Math.min(rows, i)) * (cols + 1) + Math.max(0, Math.min(cols, j))];
      for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
        const a = at(i, j + 1), c = at(i, j - 1), d = at(i + 1, j), e = at(i - 1, j);
        const u = [a[0] - c[0], a[1] - c[1], a[2] - c[2]], w = [d[0] - e[0], d[1] - e[1], d[2] - e[2]];
        let nn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
        const l = Math.hypot(nn[0], nn[1], nn[2]) || 1; nn = nn.map((x) => x / l);
        if (nn[0] * toward[0] + nn[1] * toward[1] + nn[2] * toward[2] < 0) nn = nn.map((x) => -x);
        const p = pts[i * (cols + 1) + j];
        b.v(p, nn, col, [k[0], k[1] || 0, p[3] || 0, k[3] || 0]);
      }
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) { const A = base + i * (cols + 1) + j; I.push(A, A + 1, A + cols + 2, A, A + cols + 2, A + cols + 1); }
    },
    // Bake light into the vertices: ambient occlusion (how much of the sky over a point the furniture, walls and
    // floor leave open) and how much of the lamps' light gets there past everything in between (soft shadows).
    // Both are found by marching rays through a 4 cm voxel grid of the carriage (8 cm for the long rays to the lamps).
    bake(rows, lite = false) {
      const CS = 0.04, X0 = -1.52, Y0 = -0.08, Z0 = -11, NX = 76, NY = 68, NZ = 550, NXY = NX * NY;
      const G = new Uint8Array(NXY * NZ);
      for (let iz = 0; iz < NZ; iz++) {
        const zc = Z0 + (iz + 0.5) * CS, endW = Math.abs(zc) > ZE;
        for (let iy = 0; iy < NY; iy++) {
          const yc = Y0 + (iy + 0.5) * CS, o = iz * NXY + iy * NX;
          for (let ix = 0; ix < NX; ix++) {
            const xc = X0 + (ix + 0.5) * CS;
            if (yc < 0 || Math.abs(xc) > WI || yc > ceilY(xc) || (endW && !(Math.abs(xc) < DOOR && yc < DOORH))) G[o + ix] = 1;
          }
        }
      }
      const span = (a0, a1, o0, n) => {
        let i0 = Math.ceil((a0 - o0) / CS - 0.5), i1 = Math.floor((a1 - o0) / CS - 0.5);
        if (i1 < i0) i0 = i1 = Math.round((a0 + a1) / 2 / CS - o0 / CS - 0.5);
        return [Math.max(0, i0), Math.min(n - 1, i1)];
      };
      for (const s of b.solids3) {
        if (s.t === 0) {
          const [a0, a1] = span(s.x0, s.x1, X0, NX), [b0, b1] = span(s.y0, s.y1, Y0, NY), [c0, c1] = span(s.z0, s.z1, Z0, NZ);
          for (let iz = c0; iz <= c1; iz++) for (let iy = b0; iy <= b1; iy++) G.fill(1, iz * NXY + iy * NX + a0, iz * NXY + iy * NX + a1 + 1);
          continue;
        }
        // a lathe: radius at height h along its axis = the widest segment there
        const pr = s.prof, rM = Math.max(...pr.map((q) => q[0])), hs = pr.map((q) => q[1]), h0 = Math.min(...hs), h1 = Math.max(...hs);
        const rAt = (h) => { let r = -1; for (let i = 0; i < pr.length - 1; i++) { const [ra, ya] = pr[i], [rb, yb] = pr[i + 1]; if ((h - ya) * (h - yb) <= 0 && ya !== yb) r = Math.max(r, ra + (rb - ra) * (h - ya) / (yb - ya)); } return r; };
        const ax = s.axis, lo = [s.cx - rM, s.cy - rM, s.cz - rM], hi = [s.cx + rM, s.cy + rM, s.cz + rM];
        const k = ax === "y" ? 1 : ax === "z" ? 2 : 0, c = [s.cx, s.cy, s.cz];
        lo[k] = c[k] + h0; hi[k] = c[k] + h1;
        const [a0, a1] = span(lo[0], hi[0], X0, NX), [b0, b1] = span(lo[1], hi[1], Y0, NY), [c0, c1] = span(lo[2], hi[2], Z0, NZ);
        for (let iz = c0; iz <= c1; iz++) for (let iy = b0; iy <= b1; iy++) for (let ix = a0; ix <= a1; ix++) {
          const q = [X0 + (ix + 0.5) * CS - c[0], Y0 + (iy + 0.5) * CS - c[1], Z0 + (iz + 0.5) * CS - c[2]];
          const h = q[k]; q[k] = 0;
          if (Math.hypot(q[0], q[1], q[2]) <= rAt(h)) G[iz * NXY + iy * NX + ix] = 1;
        }
      }
      // the coarse grid: how many of the 8 fine cells in each are solid
      const MX = NX / 2, MY = NY / 2, MZ = NZ / 2, MXY = MX * MY, D8 = new Uint8Array(MXY * MZ);
      for (let iz = 0; iz < NZ; iz++) for (let iy = 0; iy < NY; iy++) for (let ix = 0; ix < NX; ix++) if (G[iz * NXY + iy * NX + ix]) D8[(iz >> 1) * MXY + (iy >> 1) * MX + (ix >> 1)]++;
      const solid = (x, y, z) => {
        const ix = Math.floor((x - X0) / CS), iy = Math.floor((y - Y0) / CS), iz = Math.floor((z - Z0) / CS);
        if (ix < 0 || iy < 0 || iz < 0 || ix >= NX || iy >= NY || iz >= NZ) return 1;
        return G[iz * NXY + iy * NX + ix];
      };
      const dens = (x, y, z) => {
        const ix = Math.floor((x - X0) / (2 * CS)), iy = Math.floor((y - Y0) / (2 * CS)), iz = Math.floor((z - Z0) / (2 * CS));
        if (ix < 0 || iy < 0 || iz < 0 || ix >= MX || iy >= MY || iz >= MZ) return 8;
        return D8[iz * MXY + iy * MX + ix];
      };
      // directions over the hemisphere, cosine-weighted
      const ND = lite ? 6 : 12, DIRS = [];
      for (let i = 0; i < ND; i++) { const u = (i + 0.5) / ND, ph = i * 2.39996 + 0.4, r = Math.sqrt(u); DIRS.push([r * Math.cos(ph), r * Math.sin(ph), Math.sqrt(1 - u)]); }
      const lampsAt = (px, py, pz, nx, ny, nz, out) => {
        out.length = 0;
        for (const [lx, ly0, lz0, pitch, cnt, inten, size, kind] of rows) {
          const ly = Math.min(ly0, ceilY(lx) - 0.1);         // a ceiling light's bulb hangs below the ceiling
          const kf = Math.min(Math.max(Math.floor((pz - lz0) / pitch + 0.5), 0), cnt - 1);
          for (let j = -1; j <= 1; j++) {
            const kk = kf + j;
            if (kk < 0 || kk > cnt - 1) continue;
            if (kind === 1 && (j !== 0 || px > 0.6)) continue;
            const lz = lz0 + kk * pitch, dx = lx - px, dy = ly - py, dz = lz - pz, d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2);
            let att = inten / (d2 + size * size);
            const Ly = dy / d;
            if (kind === 2) att *= 0.1 + 1.1 * smooth(0.5, 0.66, Ly) + smooth(-0.5, -0.85, Ly) * 0.4;
            if (kind === 3) att *= smooth(0.6, 0, Math.abs(py - ly) - 0.5);
            const nl = (dx * nx + dy * ny + dz * nz) / d, w = att * (Math.max(nl, 0) * 0.85 + 0.15 * Math.max(nl + 0.5, 0));
            if (w > 1e-4) out.push([w, lx, ly, lz, d]);
          }
        }
        out.sort((a, c) => c[0] - a[0]);
        return out;
      };
      const L = [], NL = lite ? 3 : 5;
      for (let i = 0; i < n; i++) {
        const id = K[i * 4];
        if (NO_BAKE.has(id) || isOut(id)) continue;
        const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
        let nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
        if (Math.abs(px) > 1.5 || py < -0.05 || Math.abs(pz) > ZX) continue;
        // a frame round the normal
        let tx, ty, tz;
        if (Math.abs(ny) < 0.9) { tx = nz; ty = 0; tz = -nx; } else { tx = 0; ty = -nz; tz = ny; }
        const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
        const aoDir = (sg) => {
          let occ = 0;
          for (const [a, c, e] of DIRS) {
            const dx = sg * (tx * a + bx * c + nx * e), dy = sg * (ty * a + by * c + ny * e), dz = sg * (tz * a + bz * c + nz * e);
            for (let t = 0.05; t < 0.5; t += 0.05) if (solid(px + sg * nx * 0.02 + dx * t, py + sg * ny * 0.02 + dy * t, pz + sg * nz * 0.02 + dz * t)) { occ += 1 - t / 0.55; break; }
          }
          return Math.max(0.12, 1 - 1.3 * occ / ND);
        };
        let ao = aoDir(1);
        if (ao < 0.6) { const a2 = aoDir(-1); if (a2 > ao + 0.25) { ao = a2; nx = -nx; ny = -ny; nz = -nz; } }      // a thin sheet: its open side
        S[i * 2] = ao;
        // the lamps: the strongest few, a ray to each through the coarse grid
        lampsAt(px, py, pz, nx, ny, nz, L);
        let wsum = 0, vsum = 0;
        for (let j = 0; j < Math.min(NL, L.length); j++) {
          const [w, lx, ly, lz, d] = L[j];
          if (w < L[0][0] * 0.03) break;
          const sx = px + nx * 0.06, sy = py + ny * 0.06, sz = pz + nz * 0.06;
          const ex = lx - sx, ey = ly - sy, ez = lz - sz, dl = Math.hypot(ex, ey, ez), stop = dl - 0.14;
          let T = 1;
          for (let t = 0.03; t < stop && T > 0.02; t += 0.07) { const q = dens(sx + ex * t / dl, sy + ey * t / dl, sz + ez * t / dl); if (q) T *= 1 - 0.11 * q; }
          wsum += w; vsum += w * T;
        }
        S[i * 2 + 1] = wsum > 0 ? vsum / wsum : 1;
      }
    },
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
      g.setAttribute("aK", new THREE.Float32BufferAttribute(K, 4));
      g.setAttribute("aS", new THREE.Float32BufferAttribute(S, 2));
      g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
      g.computeBoundingSphere();
      return g;
    },
    get count() { return n; },
  };
  return b;
}

// ---------------------------------------------------------------- pieces
const C = {
  white: [0.62, 0.6, 0.56], mahog: [1, 1, 1], brass: [1, 1, 1], gold: [0.5, 0.34, 0.1],
  green: [0.03, 0.09, 0.05], bordeaux: [0.16, 0.02, 0.03], blue: [0.025, 0.04, 0.12], rose: [0.2, 0.06, 0.06], ochre: [0.14, 0.08, 0.022],
  carpetRed: [0.17, 0.025, 0.02], carpetBlue: [0.025, 0.035, 0.09], carpetGreen: [0.03, 0.07, 0.04],
  paint: [0.012, 0.02, 0.065], shade: [1.0, 0.58, 0.32], shadePink: [1.0, 0.45, 0.3], bulb: [1.0, 0.7, 0.42],
};
const k = (id, a = 0, b = 0, c = 0) => [id, a, b, c];
const WOODK = (seed = 0, light = 1) => [M.WOOD, seed, 0, light];

// a table lamp at (x, y, z): a brass column and a pleated shade
function tableLamp(b, x, y, z, col = C.shadePink, glow = 2.6) {
  b.lathe(x, y, z, [[0.06, 0], [0.06, 0.015], [0.03, 0.025], [0.012, 0.04], [0.012, 0.24], [0.02, 0.25], [0.0, 0.26]], 10, C.brass, k(M.BRASS));
  b.lathe(x, y, z, [[0.12, 0.2], [0.065, 0.34]], 16, col, k(M.SHADE, glow, x, z));
  b.lathe(x, y + 0.235, z, [[0, 0], [0.012, 0.004], [0.02, 0.02], [0.018, 0.034], [0, 0.044]], 8, C.bulb, k(M.BULB, 5));     // the bulb
  b.lathe(x, y + 0.2, z, [[0.0035, 0], [0.0035, 0.15]], 4, C.brass, k(M.BRASS));                                              // the harp's finial
}
// a sconce on a side wall (side ±1) at height y: backplate, arm, tulip shade
function sconce(b, side, y, z) {
  const x = side * (WI - 0.01);
  b.box(Math.min(x, x - side * 0.02), y - 0.12, z - 0.05, Math.max(x, x - side * 0.02), y + 0.08, z + 0.05, C.brass, k(M.BRASS));
  b.lathe(x - side * 0.02, y - 0.04, z, [[0.012, 0], [0.012, -0.13 * side]], 6, C.brass, k(M.BRASS), "x");
  const sx = x - side * 0.15;
  b.lathe(sx, y, z, [[0.02, -0.02], [0.06, 0.03], [0.075, 0.1], [0.07, 0.12]], 14, C.shade, k(M.SHADE, 2.2, sx, z));
}
// a ceiling light: a brass rose with a frosted bowl
function ceilLight(b, x, z) {
  const y = ceilY(x);
  b.lathe(x, y - 0.06, z, [[0.0, -0.08], [0.11, -0.04], [0.15, 0.0], [0.16, 0.01]], 16, C.shade, k(M.SHADE, 2.0, x, z));
  b.lathe(x, y - 0.05, z, [[0.17, 0], [0.12, 0.05], [0.0, 0.06]], 16, C.brass, k(M.BRASS));
}
// a velvet armchair facing +z (dir 1) or -z (dir -1), seat centre at (x, z), w wide: a deep-buttoned back, rolled arms, a plump cushion, turned legs
function armchair(b, x, z, dir, col, w = 0.62, leather = false) {
  const id = leather ? M.LEATHER : M.VELVET, d = 0.66, x0 = x - w / 2, x1 = x + w / 2;
  b.seats?.push([x, z, dir]);
  const zf = z + dir * d / 2, zb = z - dir * d / 2, za = Math.min(zf, zb), zz = Math.max(zf, zb);
  b.blob(x, z, w * 0.62, d * 0.62);
  const cord = col.map((c) => c * 0.8);
  // the legs, turned and tapering
  for (const [px, pz] of [[x0 + 0.06, za + 0.06], [x1 - 0.06, za + 0.06], [x0 + 0.06, zz - 0.06], [x1 - 0.06, zz - 0.06]]) b.lathe(px, 0, pz, [[0.0, 0], [0.024, 0], [0.018, 0.03], [0.03, 0.06], [0.024, 0.11], [0.0, 0.12]], 8, C.mahog, WOODK(5, 0.7));
  b.rbox(x0, 0.1, za, x1, 0.4, zz, 0.035, col, k(id, 2));                                           // the base
  const sz0 = dir > 0 ? za + 0.17 : za + 0.0, sz1 = dir > 0 ? zz : zz - 0.17;                      // the seat, in front of the back
  b.rbox(x0 + 0.08, 0.36, sz0 + (dir > 0 ? 0 : 0.02), x1 - 0.08, 0.5, sz1 - (dir > 0 ? 0.02 : 0), 0.055, col, k(id, 2));      // the cushion
  const bz0 = dir > 0 ? za : zz - 0.2, bz1 = dir > 0 ? za + 0.2 : zz;
  b.rbox(x0 + 0.015, 0.4, bz0, x1 - 0.015, 1.0, bz1, 0.075, col, k(id, 1));                          // the back, buttoned
  for (const sx of [x0, x1 - 0.11]) {
    b.rbox(sx, 0.36, za + (dir > 0 ? 0.06 : 0), sx + 0.11, 0.66, zz - (dir > 0 ? 0 : 0.06), 0.045, col, k(id, 2));       // arm
    const ax = sx + 0.055, a0 = dir > 0 ? za + 0.1 : za + 0.0, a1 = dir > 0 ? zz - 0.0 : zz - 0.1;
    b.lathe(ax, 0.655, 0, [[0.0, a0], [0.05, a0], [0.062, a0 + 0.012], [0.062, a1 - 0.012], [0.05, a1], [0.0, a1]], 10, col, k(id, 2), "z");   // the roll
  }
  // a cord along the front edge of the cushion
  const zc = dir > 0 ? sz1 - 0.01 : sz0 + 0.01;
  b.lathe(0, 0.5, zc, [[0.0, x0 + 0.1], [0.011, x0 + 0.1], [0.011, x1 - 0.1], [0.0, x1 - 0.1]], 6, cord, k(id, 2), "x");
  return [x0, za, x1, zz];
}
// a dining chair facing dir along z
function chair(b, x, z, dir, col) {
  const w = 0.5, d = 0.5, x0 = x - w / 2, x1 = x + w / 2, za = z - d / 2, zz = z + d / 2;
  b.seats?.push([x, z, dir]);
  b.blob(x, z, 0.32, 0.32);
  for (const [px, pz, bk] of [[x0 + 0.035, za + 0.035, dir < 0 ? 0 : 1], [x1 - 0.035, za + 0.035, dir < 0 ? 0 : 1], [x0 + 0.035, zz - 0.035, dir > 0 ? 0 : 1], [x1 - 0.035, zz - 0.035, dir > 0 ? 0 : 1]]) {
    b.lathe(px, 0, pz, [[0.0, 0], [0.012, 0], [0.016, 0.04], [0.02, 0.2], [0.026, 0.38], [0.03, 0.43], [0.0, 0.44]], 8, C.mahog, WOODK(2, 0.8));
    if (bk) b.rbox(px - 0.018, 0.43, pz - 0.018, px + 0.018, 1.04, pz + 0.018, 0.012, C.mahog, WOODK(2, 0.8));                   // the back posts
  }
  b.rbox(x0, 0.4, za, x1, 0.47, zz, 0.02, C.mahog, WOODK(2, 0.8));                                                          // the seat rail
  b.rbox(x0 + 0.015, 0.46, za + 0.015, x1 - 0.015, 0.56, zz - 0.015, 0.04, col, k(M.VELVET, 2));                            // the cushion
  const bz = dir > 0 ? za : zz, o = dir > 0 ? 1 : -1;
  b.rbox(x0, 0.92, Math.min(bz, bz + o * 0.045) + 0.0, x1, 1.07, Math.max(bz, bz + o * 0.045), 0.02, C.mahog, WOODK(2, 0.8));        // the top rail
  b.rbox(x0 + 0.04, 0.58, Math.min(bz + o * 0.01, bz + o * 0.07), x1 - 0.04, 0.92, Math.max(bz + o * 0.01, bz + o * 0.07), 0.025, col, k(M.VELVET, 1));   // the padded back
  return [x0, za, x1, zz];
}
function plate(b, x, y, z) { b.lathe(x, y, z, [[0, 0], [0.1, 0.004], [0.12, 0.016], [0.125, 0.02]], 18, C.white, k(M.CHINA)); }
// a stem glass; wine puts some red in the bowl
function wineGlass(b, x, y, z, wine = 0) {
  b.noOcc = true;
  b.lathe(x, y, z, [[0.032, 0], [0.033, 0.003], [0.026, 0.007], [0.006, 0.013], [0.0035, 0.05], [0.0035, 0.088], [0.012, 0.1], [0.027, 0.118], [0.035, 0.145], [0.036, 0.165], [0.033, 0.19]], 12, [0.5, 0.5, 0.5], k(M.BOTTLE, 0.02));
  if (wine) b.lathe(x, y, z, [[0.0, 0.112], [0.025, 0.118], [0.032, 0.135], [0.0335, 0.152], [0.0, 0.153]], 10, [0.34, 0.02, 0.045], [M.BOTTLE, 0, 0, -1]);
  b.noOcc = false;
}
// bottles in several shapes: bordeaux, burgundy, champagne, squat spirits, tall liqueur, decanter; sc scales
const BOTTLES = [
  { h: 0.30, r: 0.037, prof: [[0, 0], [1, 0], [1, 0.62], [0.9, 0.7], [0.4, 0.8], [0.36, 0.9], [0.38, 0.93], [0.34, 1.0], [0, 1.0]], foil: 0.84, label: true },       // bordeaux
  { h: 0.31, r: 0.041, prof: [[0, 0], [0.95, 0], [1, 0.04], [1, 0.45], [0.8, 0.62], [0.42, 0.78], [0.36, 0.92], [0.4, 0.95], [0.34, 1.0], [0, 1.0]], foil: 0.82, label: true },  // burgundy
  { h: 0.32, r: 0.045, prof: [[0, 0], [0.9, 0], [1, 0.05], [1, 0.5], [0.8, 0.6], [0.4, 0.75], [0.33, 0.9], [0.4, 0.95], [0.4, 1.0], [0, 1.0]], foil: 0.75, label: true },   // champagne
  { h: 0.22, r: 0.04, prof: [[0, 0], [1, 0], [1, 0.7], [0.85, 0.78], [0.55, 0.84], [0.5, 0.93], [0.55, 0.95], [0.5, 1.0], [0, 1.0]], foil: 0.0, label: true },          // spirits
  { h: 0.27, r: 0.028, prof: [[0, 0], [1, 0], [1, 0.72], [0.6, 0.8], [0.42, 0.88], [0.42, 0.97], [0.5, 1.0], [0, 1.0]], foil: 0.0, label: false },                    // liqueur
  { h: 0.26, r: 0.05, prof: [[0, 0], [0.9, 0], [1, 0.08], [0.9, 0.34], [0.5, 0.55], [0.3, 0.7], [0.3, 0.86], [0.42, 0.92], [0.34, 0.97], [0, 0.97]], foil: 0.0, label: false },   // decanter
];
function bottle(b, x, y, z, col, glow = 0, kind = 0, sc = 1) {
  const B = BOTTLES[kind % BOTTLES.length], H = B.h * sc, rr = B.r * (0.9 + 0.1 * sc);
  b.lathe(x, y, z, B.prof.map(([r, t]) => [r * rr, t * H]), 12, col, [M.BOTTLE, glow, y, B.label ? H : H + 1]);
  if (B.foil) b.lathe(x, y, z, [[B.prof[B.prof.length - 3][0] * rr * 1.08, B.foil * H], [0.4 * rr * 1.1, H * 0.995], [0.001, H * 1.0]], 10, kind === 2 ? [0.45, 0.34, 0.08] : [0.3, 0.02, 0.025], k(M.BRASS));
}
function cutlery(b, x, y, z, along = "z") {
  if (along === "z") b.box(x - 0.008, y, z - 0.09, x + 0.008, y + 0.004, z + 0.09, C.white, k(M.SILVER));
  else b.box(x - 0.09, y, z - 0.008, x + 0.09, y + 0.004, z + 0.008, C.white, k(M.SILVER));
}
// a table with a white cloth hanging over its sides in folds: x0..x1, z0..z1, top at h
function clothTable(b, x0, z0, x1, z1, h = 0.74) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hang = 0.27;
  b.blob(cx, cz, (x1 - x0) * 0.72, (z1 - z0) * 0.72);
  b.lathe(cx, 0, cz, [[0.0, 0], [0.16, 0], [0.16, 0.02], [0.05, 0.05], [0.04, 0.5], [0.07, h - 0.1], [0.0, h - 0.1]], 12, C.mahog, WOODK(1, 0.7));
  b.quadG([x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0], [0, 1, 0], C.white, k(M.LINEN), 0.08);
  b.solid(x0, h - 0.05, z0, x1, h, z1);
  for (const [a, c, d, e] of [[x0 - 0.03, z0, x0, z1], [x1, z0, x1 + 0.03, z1], [x0, z0 - 0.03, x1, z0], [x0, z1, x1, z1 + 0.03]]) b.solid(a, h - 0.27, c, d, h, e);
  // the four sides: a grid along the edge and down the hang, the folds growing as it falls
  const sides = [[x0, z0, x0, z1, -1, 0], [x1, z0, x1, z1, 1, 0], [x0, z0, x1, z0, 0, -1], [x0, z1, x1, z1, 0, 1]];
  sides.forEach(([ax, az, bx, bz, nx, nz], si) => {
    const len = Math.hypot(bx - ax, bz - az), cols = Math.max(12, Math.round(len * 22)), ph = si * 1.7;
    b.grid(5, cols, (v, u) => {
      const t = v, along = u * len, ex = ax + (bx - ax) * u, ez = az + (bz - az) * u;
      const fold = (Math.sin(along * 24 + ph) * 0.6 + Math.sin(along * 53 + ph * 2) * 0.25) * 0.012 * t;
      const out = 0.008 + fold + 0.03 * t * (0.5 + 0.5 * Math.sin(along * 7 + ph)) + Math.sin(t * Math.PI) * 0.01 * 0;
      const dd = Math.sin(along * 24 + ph);
      return [ex + nx * out, h - 0.004 - t * hang * (1 - 0.04 * (0.5 + 0.5 * Math.sin(along * 11 + ph))), ez + nz * out, 0.28 * Math.max(0, 0.5 - 0.5 * dd) * t];
    }, C.white, k(M.LINEN), [nx, 0, nz]);
  });
}
// curtains tied back either side of a window on side (±1), from z0 to z1, under a swagged valance with a gold braid
function curtains(b, side, z0, z1, top, col) {
  const xi = side * (WI - 0.04) - side * 0.07, toward = [-side, 0, 0], tie = 1.05, yTop = top + 0.2, yBot = 0.42;
  const wAt = (y) => 0.1 + 0.13 * Math.pow(Math.abs(y - tie) / 0.6, 0.9);
  for (const [za, dirz] of [[z0, -1], [z1, 1]]) {
    const ph = za * 3.1;
    b.grid(18, 56, (v, f) => {
      const y = yTop - (yTop - yBot) * v, w = wAt(y);
      const nf = 4.5, s = Math.sin(f * Math.PI * 2 * nf + ph + v * 0.9), s2 = Math.sin(f * Math.PI * 2 * nf * 2.3 + ph * 2 + v * 2) * 0.2;
      const gather = 0.9 + 0.5 * (0.22 - w) / 0.22;                // closer pleats where the cloth is bunched
      const A = 0.17 * w * gather * (0.5 + 0.5 * Math.min(1, (yTop - y) / 0.25));
      const bulge = 0.045 * smooth(tie + 0.05, yBot + 0.1, y) + 0.01;       // swings out into the room below the tie
      const z = za + dirz * (f * w * 1.35 - 0.06 + 0.02 * (1 - v)), x = xi - side * (bulge + A * (s + s2));
      return [x, y, z, 0.55 * (0.5 - 0.5 * s) * (0.4 + 0.6 * Math.min(1, v * 2))];
    }, col, k(M.CURTAIN), toward);
    b.lathe(xi, tie, za + dirz * 0.08, [[0, -0.05], [0.026, -0.03], [0.021, 0.0], [0, 0.02]], 8, C.brass, k(M.BRASS));
    // the cord round the tie
    b.lathe(xi - side * 0.02, tie, za + dirz * 0.075, [[0.0, -0.03], [0.012, -0.02], [0.012, 0.02], [0.0, 0.03]], 6, C.gold, k(M.BRASS), "z");
  }
  // the valance: gathered cloth with swags between tails, a braid along its lower edge
  const zA = z0 - 0.3, zB = z1 + 0.3, span = zB - zA, swags = Math.max(2, Math.round(span / 0.55));
  const edge = (f) => { const q = (f * swags) % 1; return top - 0.02 - 0.1 * Math.sin(Math.PI * q) * (f > 0.04 && f < 0.96 ? 1 : 0.1) + 0.0; };
  const hang = (f, v) => {
    const y = yTop - (yTop - edge(f)) * v, z = zA + span * f, q = (f * swags) % 1;
    const fold = Math.sin(f * span * 34) * 0.012 * (0.4 + 0.6 * v) + Math.sin(f * span * 71) * 0.004;
    const x = xi - side * (0.02 + 0.045 * Math.sin(Math.PI * q) * v + fold + 0.02 * (1 - v));
    return [x, y, z, 0.35 * (0.5 - 0.5 * Math.sin(f * span * 34)) * v];
  };
  b.grid(6, 70, (v, f) => hang(f, v), col, k(M.CURTAIN), toward);
  b.grid(1, 70, (v, f) => { const p = hang(f, 1); return [p[0] - side * 0.006, p[1] - 0.028 + 0.028 * (1 - v) - 0.0, p[2], 0]; }, C.gold, k(M.BRASS), toward);
  const x0 = Math.min(xi, xi + side * 0.06), x1 = Math.max(xi, xi + side * 0.06);
  b.box(x0 - 0.0, top + 0.05, zA, x1, yTop, zB, col, k(M.CURTAIN));
}
function smooth(a, b2, x) { const t = Math.min(Math.max((x - a) / (b2 - a), 0), 1); return t * t * (3 - 2 * t); }

// ---------------------------------------------------------------- the carriage shell
// opt: winL / winR = [[zc, width], ...]; sill, top; carpet colour and runner (centre x, half width); front / rear end:
// "door" (open doorway), "closed", "glass" (glazed end)
function shell(b, gl, opt) {
  const { sill, top } = opt;
  const holes = { [-1]: opt.winL.map(([c, w]) => [c - w / 2, c + w / 2]).sort((a, c) => a[0] - c[0]), [1]: opt.winR.map(([c, w]) => [c - w / 2, c + w / 2]).sort((a, c) => a[0] - c[0]) };
  const sideTop = ceilY(WI);
  // floor
  b.carpet = [opt.carpet, k(M.CARPET, opt.run[0], 0, opt.run[1])];
  b.quadG([-WI, 0, -ZE], [-WI, 0, ZE], [WI, 0, ZE], [WI, 0, -ZE], [0, 1, 0], ...b.carpet, 0.09);
  // ceiling: an arch across
  const CS = 14;
  for (let i = 0; i < CS; i++) {
    const xa = -WI + 2 * WI * i / CS, xb = -WI + 2 * WI * (i + 1) / CS, ya = ceilY(xa), yb = ceilY(xb);
    const l = Math.hypot(xb - xa, yb - ya);
    b.quadG([xa, ya, -ZE], [xa, ya, ZE], [xb, yb, ZE], [xb, yb, -ZE], [(yb - ya) / l, -(xb - xa) / l, 0], [1, 1, 1], k(M.CEIL), 0.2);
  }
  // side walls, inside (panelled) and out (painted), with the window openings, reveals and glass
  for (const side of [-1, 1]) {
    const H = holes[side], xi = side * WI, xo = side * WO, ni = [-side, 0, 0], no = [side, 0, 0];
    const rect = (x, z0, z1, y0, y1, nn, col, kk) => (kk[0] === M.PANEL ? b.quadG : b.quad)([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], nn, col, kk, 0.12);
    const strips = (x, y0, y1, nn, col, kk, ylo, yhi) => {
      rect(x, -ZE, ZE, ylo, y0, nn, col, kk); rect(x, -ZE, ZE, y1, yhi, nn, col, kk);
      let z = -ZE;
      for (const [a, c] of H) { rect(x, z, a, y0, y1, nn, col, kk); z = c; }
      rect(x, z, ZE, y0, y1, nn, col, kk);
    };
    strips(xi, sill, top, ni, [1, 1, 1], k(M.PANEL), 0, sideTop);
    const outK = k(M.PAINT, sill, top);
    strips(xo, sill, top, no, C.paint, outK, -0.32, 2.32);
    // gold lining round each window and up the piers between them, standing a hair proud of the paint
    const xgl = side * (WO + 0.002), gq = (z0, z1, y0, y1) => b.quad([xgl, y0, z0], [xgl, y0, z1], [xgl, y1, z1], [xgl, y1, z0], no, C.gold, k(M.LOCO));
    for (const [a, c] of H) { const o = 0.045, w = 0.01; gq(a - o - w, c + o + w, top + o, top + o + w); gq(a - o - w, c + o + w, sill - o - w, sill - o); gq(a - o - w, a - o, sill - o, top + o); gq(c + o, c + o + w, sill - o, top + o); }
    const piers = [-ZX + 0.35, ...H.slice(1).map(([a], i) => (H[i][1] + a) / 2), ZX - 0.35];
    for (const z of piers) gq(z - 0.005, z + 0.005, 0.11, sill - 0.08);
    for (const [a, c] of H) {
      // reveals: varnished frame between the panelling and the body
      const x0 = Math.min(xi, xo), x1 = Math.max(xi, xo);
      b.quad([x0, sill, a], [x1, sill, a], [x1, sill, c], [x0, sill, c], [0, 1, 0], C.mahog, WOODK(8, 0.9));
      b.quad([x0, top, a], [x0, top, c], [x1, top, c], [x1, top, a], [0, -1, 0], C.mahog, WOODK(8, 0.9));
      b.quad([x0, sill, a], [x0, top, a], [x1, top, a], [x1, sill, a], [0, 0, 1], C.mahog, WOODK(8, 0.9));
      b.quad([x0, sill, c], [x1, sill, c], [x1, top, c], [x0, top, c], [0, 0, -1], C.mahog, WOODK(8, 0.9));
      // a deep sill inside, and a brass frame line
      b.box(Math.min(xi, xi - side * 0.1), sill - 0.04, a - 0.05, Math.max(xi, xi - side * 0.1), sill, c + 0.05, C.mahog, WOODK(8, 1));
      const xg = side * 1.455;
      gl.quad([xg, sill, a], [xg, sill, c], [xg, top, c], [xg, top, a], ni, [1, 1, 1], k(0));
      // a glazing bar across the top light
      const xb0 = Math.min(side * 1.44, side * 1.46), xb1 = Math.max(side * 1.44, side * 1.46);
      b.box(xb0, top - 0.3, a, xb1, top - 0.27, c, C.brass, k(M.BRASS));
      if (opt.curtain) curtains(b, side, a, c, top, opt.curtain);
    }
    // cornice where the wall meets the ceiling
    b.quad([xi, sideTop - 0.1, -ZE], [xi, sideTop - 0.1, ZE], [xi - side * 0.1, sideTop + 0.01, ZE], [xi - side * 0.1, sideTop + 0.01, -ZE], [-side * 0.7, -0.7, 0], C.mahog, WOODK(6, 0.8));
  }
  // the ends: panelled walls with a doorway (or a closed door, or glazing), a short passage through to the gangway
  for (const end of [-1, 1]) {
    const kind = end < 0 ? opt.front : opt.rear, z = end * ZE, nz = [0, 0, -end];
    const xs = [-WI, -1.0, -0.6, -DOOR, DOOR, 0.6, 1.0, WI];
    const glassEnd = kind === "glass";
    const y0d = glassEnd ? 0.7 : 0, y1d = glassEnd ? 2.05 : DOORH, xd = glassEnd ? 1.15 : DOOR;
    const cols = glassEnd ? [-WI, -1.15, 1.15, WI] : xs;
    const yt = ceilY(WI);
    // the lunette under the arch of the ceiling
    for (let i = 0; i < 14; i++) {
      const xa = -WI + 2 * WI * i / 14, xb = -WI + 2 * WI * (i + 1) / 14;
      b.quadG([xa, yt, z], [xb, yt, z], [xb, ceilY(xb), z], [xa, ceilY(xa), z], nz, [1, 1, 1], k(M.PANEL), 0.12);
    }
    for (let i = 0; i < cols.length - 1; i++) {
      const xa = cols[i], xb = cols[i + 1], mid = (xa + xb) / 2;
      if (mid > -xd && mid < xd) {
        b.quadG([xa, y1d, z], [xb, y1d, z], [xb, yt, z], [xa, yt, z], nz, [1, 1, 1], k(M.PANEL), 0.12);
        if (y0d > 0) b.quadG([xa, 0, z], [xb, 0, z], [xb, y0d, z], [xa, y0d, z], nz, [1, 1, 1], k(M.PANEL), 0.12);
      } else b.quadG([xa, 0, z], [xb, 0, z], [xb, yt, z], [xa, yt, z], nz, [1, 1, 1], k(M.PANEL), 0.12);
    }
    if (glassEnd) {
      const zg = end * (ZE + 0.05);
      gl.quad([-xd, y0d, zg], [xd, y0d, zg], [xd, y1d, zg], [-xd, y1d, zg], nz, [1, 1, 1], k(0));
      for (const mx of [-0.39, 0.39]) b.box(mx - 0.03, y0d, zg - 0.04, mx + 0.03, y1d, zg + 0.04, C.mahog, WOODK(8, 0.9));
      b.box(-xd, y0d - 0.05, Math.min(z, zg) - 0.08, xd, y0d, Math.max(z, zg), C.mahog, WOODK(8, 1));
      // the end of the body outside, round the glazing
      const ze = end * (ZE + 0.06), pk = k(M.PAINT, 0.7, 2.05), ne = [0, 0, end];
      b.quad([-WO, -0.32, ze], [WO, -0.32, ze], [WO, y0d, ze], [-WO, y0d, ze], ne, C.paint, pk);
      b.quad([-WO, y1d, ze], [WO, y1d, ze], [WO, 2.32, ze], [-WO, 2.32, ze], ne, C.paint, pk);
      b.quad([-WO, y0d, ze], [-xd, y0d, ze], [-xd, y1d, ze], [-WO, y1d, ze], ne, C.paint, pk);
      b.quad([xd, y0d, ze], [WO, y0d, ze], [WO, y1d, ze], [xd, y1d, ze], ne, C.paint, pk);
      for (let i = 0; i < 12; i++) { const xa = -WO + 2 * WO * i / 12, xb = -WO + 2 * WO * (i + 1) / 12, ry = (x) => 2.32 + 0.6 * Math.pow(Math.max(0, 1 - (x / WO) ** 2), 0.6); b.quad([xa, 2.32, ze], [xb, 2.32, ze], [xb, ry(xb), ze], [xa, ry(xa), ze], ne, C.paint, pk); }
      continue;
    }
    // the passage through the end
    const z1 = end * ZX;
    for (const sx of [-1, 1]) b.quad([sx * DOOR, 0, z], [sx * DOOR, 0, z1], [sx * DOOR, DOORH, z1], [sx * DOOR, DOORH, z], [-sx, 0, 0], C.mahog, WOODK(9, 0.85));
    b.quad([-DOOR, DOORH, z], [DOOR, DOORH, z], [DOOR, DOORH, z1], [-DOOR, DOORH, z1], [0, -1, 0], C.mahog, WOODK(9, 0.85));
    b.quad([-DOOR, 0.001, z], [-DOOR, 0.001, z1], [DOOR, 0.001, z1], [DOOR, 0.001, z], [0, 1, 0], C.mahog, k(M.PARQUET));
    // brass door frame
    b.box(-DOOR - 0.04, 0, z - 0.02, -DOOR, DOORH, z + 0.02, C.brass, k(M.BRASS)); b.box(DOOR, 0, z - 0.02, DOOR + 0.04, DOORH, z + 0.02, C.brass, k(M.BRASS));
    b.box(-DOOR - 0.04, DOORH, z - 0.02, DOOR + 0.04, DOORH + 0.04, z + 0.02, C.brass, k(M.BRASS));
    if (kind === "closed") {
      const zc = end * (ZE + 0.25);
      b.box(-DOOR, 0, zc - 0.03, DOOR, DOORH, zc + 0.03, C.mahog, WOODK(10, 1));
      b.box(-0.3, 1.2, zc - end * 0.035, 0.3, 1.85, zc - end * 0.03, [1, 1, 1], k(M.LALIQUE, 0.25));
      b.lathe(0.33, 1.0, zc - end * 0.03, [[0.0, 0], [0.025, 0.01], [0.02, 0.06], [0, 0.07]], 8, C.brass, k(M.BRASS), "z");
    }
  }
  // outside: the roof, the solebar and underframe, the bogies with their wheels
  const RS = 12;
  for (let i = 0; i < RS; i++) {
    const xa = -WO + 2 * WO * i / RS, xb = -WO + 2 * WO * (i + 1) / RS, ry = (x) => 2.32 + 0.6 * Math.pow(Math.max(0, 1 - (x / WO) ** 2), 0.6);
    const nx = -(ry(xb) - ry(xa)), ny = xb - xa, l = Math.hypot(nx, ny);
    b.quad([xa, ry(xa), -ZX], [xa, ry(xa), ZX], [xb, ry(xb), ZX], [xb, ry(xb), -ZX], [nx / l, ny / l, 0], [1, 1, 1], k(M.ROOF));
  }
  for (let z = -8; z <= 8.01; z += 3.2) b.lathe(0, 2.9, z, [[0.12, 0], [0.12, 0.1], [0.09, 0.15], [0.03, 0.18], [0, 0.18]], 10, [1, 1, 1], k(M.ROOF));     // torpedo vents
  b.box(-WO, -0.34, -ZX, WO, -0.32, ZX, C.paint, k(M.UNDER), "+y");
  b.box(-1.2, -0.75, -ZX + 0.6, 1.2, -0.34, ZX - 0.6, [1, 1, 1], k(M.UNDER), "+y");
  for (const bz of [-7.5, 7.5]) bogie(b, bz);
  // buffers and the end skins round the gangway
  for (const end of [-1, 1]) {
    if (end > 0 && opt.rear === "glass") continue;
    const z = end * ZX, nz = [0, 0, end];
    b.quad([-WO, -0.32, z], [-0.55, -0.32, z], [-0.55, 2.32, z], [-WO, 2.32, z], nz, C.paint, k(M.PAINT, 0.7, 2.05));
    b.quad([0.55, -0.32, z], [WO, -0.32, z], [WO, 2.32, z], [0.55, 2.32, z], nz, C.paint, k(M.PAINT, 0.7, 2.05));
    b.quad([-0.55, 2.2, z], [0.55, 2.2, z], [0.55, 2.8, z], [-0.55, 2.8, z], nz, C.paint, k(M.PAINT, 0.7, 2.05));
    for (const bx of [-0.95, 0.95]) b.lathe(bx, -0.55, z, [[0.08, 0], [0.08, 0.35], [0.19, 0.35], [0.19, 0.4]].map(([r, y]) => [r, y * end]), 12, [1, 1, 1], k(M.UNDER), "z");
  }
}
function bogie(b, bz) {
  b.box(-1.15, -0.9, bz - 1.6, 1.15, -0.6, bz + 1.6, [1, 1, 1], k(M.UNDER));
  for (const sx of [-1, 1]) {
    b.box(sx * 1.08 - 0.05, -1.0, bz - 1.75, sx * 1.08 + 0.05, -0.62, bz + 1.75, [1, 1, 1], k(M.UNDER));           // the side frame
    for (const az of [-1.25, 1.25]) {
      b.box(sx * 1.08 - 0.09, RAIL + 0.3, bz + az - 0.14, sx * 1.08 + 0.09, RAIL + 0.62, bz + az + 0.14, [1, 1, 1], k(M.UNDER));   // axle box
      for (let i = 0; i < 4; i++) b.box(sx * 1.08 - 0.07, -0.66 + i * 0.022, bz + az - 0.42 + i * 0.05, sx * 1.08 + 0.07, -0.65 + i * 0.022, bz + az + 0.42 - i * 0.05, [1, 1, 1], k(M.UNDER));   // leaf springs
    }
  }
  for (const az of [-1.25, 1.25]) for (const ax of [-0.76, 0.76]) {
    const r = 0.46;
    b.lathe(ax, RAIL + r, bz + az, [[0, -0.07], [r, -0.07], [r, 0.07], [0, 0.07]].map(([rr, y]) => [rr, y]), 16, [1, 1, 1], k(M.UNDER), "x");
  }
}
// the gangway to the next carriage: bellows round a passage, a steel floor plate
function gangway(b) {
  const z0 = ZX - 0.02, z1 = CAR - ZX + 0.02, w = 0.6, h = 2.2;
  b.quad([-w, 0, z0], [-w, 0, z1], [-w, h, z1], [-w, h, z0], [1, 0, 0], [1, 1, 1], k(M.BELLOWS));
  b.quad([w, 0, z0], [w, h, z0], [w, h, z1], [w, 0, z1], [-1, 0, 0], [1, 1, 1], k(M.BELLOWS));
  b.quad([-w, h, z0], [w, h, z0], [w, h, z1], [-w, h, z1], [0, -1, 0], [1, 1, 1], k(M.BELLOWS));
  b.quad([-w, 0.005, z0], [-w, 0.005, z1], [w, 0.005, z1], [w, 0.005, z0], [0, 1, 0], [1, 1, 1], k(M.UNDER));
  // outside of the bellows
  b.quad([-w - 0.1, -0.3, z0], [-w - 0.1, h + 0.3, z0], [-w - 0.1, h + 0.3, z1], [-w - 0.1, -0.3, z1], [-1, 0, 0], [1, 1, 1], k(M.UNDER));
  b.quad([w + 0.1, -0.3, z0], [w + 0.1, -0.3, z1], [w + 0.1, h + 0.3, z1], [w + 0.1, h + 0.3, z0], [1, 0, 0], [1, 1, 1], k(M.UNDER));
  b.quad([-w - 0.1, h + 0.3, z0], [-w - 0.1, h + 0.3, z1], [w + 0.1, h + 0.3, z1], [w + 0.1, h + 0.3, z0], [0, 1, 0], [1, 1, 1], k(M.UNDER));
  b.lathe(0, h - 0.06, (z0 + z1) / 2, [[0.0, -0.06], [0.05, -0.03], [0.05, 0.0]], 10, C.bulb, k(M.BULB, 2.5));
}

// ---------------------------------------------------------------- the carriages
const winsAt = (zs, w) => zs.map((z) => [z, w]);
const range = (n, z0, dz) => Array.from({ length: n }, (_, i) => z0 + i * dz);
const lampRows = (...rows) => rows;    // [x, y, z0, pitch, count, intensity, size, kind, colour]
const WARM = [1.0, 0.6, 0.3], WARM2 = [1.0, 0.5, 0.24];

function sleeper(b, gl, solids, R) {
  // corridor on the right (x > 0.55), eight compartments on the left
  const CW = 2.3, Z0 = -9.2, comp = range(8, Z0 + CW / 2, CW), XP = 0.55;
  shell(b, gl, { winL: winsAt(comp, 0.95), winR: winsAt(comp, 1.1), sill: 0.85, top: 1.9, carpet: C.carpetBlue, run: [0.98, 0.32], front: "closed", rear: "door", curtain: C.blue });
  const open = [true, false, true, true, false, true, false, true];
  // the partition along the corridor, with a door into each compartment
  const DW = 0.34;
  for (let i = 0; i <= 8; i++) {
    const z = Z0 + i * CW;
    // cross walls between compartments
    if (i > 0 && i < 8) { b.box(-WI, 0, z - 0.04, XP, ceilY(0) - 0.02, z + 0.04, [1, 1, 1], k(M.PANEL)); solids.push([-WI, z - 0.06, XP, z + 0.06]); }
  }
  for (const end of [Z0, Z0 + 8 * CW]) { b.box(-WI, 0, end - 0.04, XP, ceilY(0) - 0.02, end + 0.04, [1, 1, 1], k(M.PANEL)); solids.push([-WI, end - 0.06, XP + 0.05, end + 0.06]); }
  comp.forEach((zc, i) => {
    const za = zc - CW / 2, zb = zc + CW / 2;
    // the corridor wall: panelled both sides, a doorway in the middle
    for (const [z0, z1] of [[za + 0.04, zc - DW], [zc + DW, zb - 0.04]]) { b.box(XP - 0.04, 0, z0, XP + 0.04, ceilY(0.55) - 0.02, z1, [1, 1, 1], k(M.PANEL)); solids.push([XP - 0.05, z0, XP + 0.05, z1]); }
    b.box(XP - 0.04, 2.0, zc - DW, XP + 0.04, ceilY(0.55) - 0.02, zc + DW, [1, 1, 1], k(M.PANEL));
    if (open[i]) {
      // the door slid back along the corridor wall
      b.box(XP + 0.045, 0.02, zc + DW - 0.05, XP + 0.075, 1.99, zc + DW * 3 - 0.05, C.mahog, WOODK(11 + i, 1.05));
      b.box(XP + 0.075, 1.3, zc + DW + 0.18, XP + 0.08, 1.75, zc + DW * 3 - 0.28, [1, 1, 1], k(M.LALIQUE, 0.18));
    } else {
      b.box(XP - 0.03, 0.02, zc - DW, XP + 0.03, 1.99, zc + DW, C.mahog, WOODK(11 + i, 1.05));
      b.box(XP + 0.03, 1.3, zc - DW + 0.18, XP + 0.035, 1.75, zc + DW - 0.18, [1, 1, 1], k(M.LALIQUE, 0.18));
      b.lathe(XP + 0.04, 1.02, zc - DW + 0.08, [[0.0, 0], [0.02, 0.01], [0.015, 0.05], [0, 0.06]], 8, C.brass, k(M.BRASS), "x");
      solids.push([XP - 0.05, zc - DW, XP + 0.05, zc + DW]);
    }
    // the bed across the compartment, made up, against the forward wall
    const bz0 = za + 0.06, bz1 = za + 0.84;
    b.box(-WI + 0.02, 0, bz0, XP - 0.06, 0.42, bz1, C.mahog, WOODK(20 + i, 0.9));
    b.rbox(-WI + 0.03, 0.42, bz0 + 0.02, XP - 0.08, 0.56, bz1 - 0.02, 0.04, C.white, k(M.LINEN));
    const blanket = [C.bordeaux, C.blue, C.green, C.rose][i % 4];
    b.rbox(-WI + 0.6, 0.53, bz0 + 0.005, XP - 0.07, 0.6, bz1 - 0.005, 0.03, blanket, k(M.VELVET));
    b.rbox(-WI + 0.58, 0.575, bz0 + 0.01, -WI + 0.84, 0.61, bz1 - 0.01, 0.017, C.white, k(M.LINEN));     // the sheet turned down
    b.rbox(-WI + 0.08, 0.54, bz0 + 0.1, -WI + 0.5, 0.7, bz1 - 0.1, 0.07, C.white, k(M.LINEN));          // pillow
    b.box(-WI + 0.02, 0.56, bz0, XP - 0.06, 1.2, bz0 + 0.05, C.mahog, WOODK(30 + i, 0.95));        // headboard panel
    solids.push([-WI, bz0, XP - 0.05, bz1]);
    // washstand cabinet in the far corner, a mirror over it, a little table under the window, a reading lamp
    b.box(-WI + 0.02, 0, zb - 0.5, -WI + 0.5, 0.82, zb - 0.06, [1, 1, 1], k(M.PANEL));
    b.box(-WI + 0.02, 0.82, zb - 0.5, -WI + 0.5, 0.85, zb - 0.06, [1, 1, 1], k(M.MARBLE));
    b.lathe(-WI + 0.26, 0.85, zb - 0.28, [[0.13, 0.021], [0.12, 0.0], [0.1, -0.06], [0.0, -0.07]], 16, C.white, k(M.CHINA));     // the basin
    b.lathe(-WI + 0.1, 0.85, zb - 0.28, [[0.012, 0], [0.012, 0.12], [0.012, 0.13]], 6, C.white, k(M.SILVER));
    b.lathe(-WI + 0.1, 0.97, zb - 0.28, [[0.008, 0], [0.008, 0.1]], 6, C.white, k(M.SILVER), "x");
    b.box(-WI + 0.05, 1.2, zb - 0.07, -WI + 0.48, 1.7, zb - 0.055, [1, 1, 1], k(M.MIRROR));
    solids.push([-WI, zb - 0.52, -WI + 0.52, zb]);
    b.box(-WI + 0.02, 0.7, zc - 0.32, -WI + 0.35, 0.73, zc + 0.32, C.mahog, WOODK(40 + i, 1.1));
    tableLamp(b, -WI + 0.18, 0.73, zc + 0.18, C.shade, 2.2);
    if (i % 2 === 0) { wineGlass(b, -WI + 0.2, 0.73, zc - 0.15, i % 4 === 0 ? 1 : 0); }
    // the luggage rack over the door, a step of carpet
    b.lathe(XP - 0.25, 2.12, zc, [[0.012, -0.5], [0.012, 0.5]], 6, C.brass, k(M.BRASS), "z");
    b.lathe(XP - 0.45, 2.12, zc, [[0.012, -0.5], [0.012, 0.5]], 6, C.brass, k(M.BRASS), "z");
    // corridor: a fold-down seat between windows
    b.box(WI - 0.08, 0.5, zb - 0.32, WI - 0.02, 0.9, zb - 0.02, C.mahog, WOODK(50 + i, 0.9));
  });
  // vestibules: parquet at each end
  for (const [z0, z1] of [[-ZE, Z0], [Z0 + 8 * CW, ZE]]) b.quad([-WI, 0.002, z0], [-WI, 0.002, z1], [WI, 0.002, z1], [WI, 0.002, z0], [0, 1, 0], [1, 1, 1], k(M.PARQUET));
  comp.forEach((z) => ceilLight(b, 0.98, z));
  comp.forEach((z) => ceilLight(b, -0.45, z));
  return lampRows([0.98, 2.3, comp[0], CW, 8, 0.45, 0.35, 0, WARM], [-0.45, 2.3, comp[0], CW, 8, 0.55, 0.35, 1, WARM], [-WI + 0.18, 1.05, comp[0] + 0.18, CW, 8, 0.3, 0.12, 1, WARM2]);
}

function dining(b, gl, solids) {
  const P = 2.25, bays = range(8, -7.875, P);
  shell(b, gl, { winL: winsAt(bays, 1.25), winR: winsAt(bays, 1.25), sill: 0.8, top: 1.92, carpet: C.carpetRed, run: [0.1, 0.36], front: "door", rear: "door", curtain: C.green });
  // Lalique panels and sconces on the piers between windows
  for (let i = 0; i < 7; i++) {
    const z = bays[i] + P / 2;
    for (const side of [-1, 1]) {
      const x = side * (WI - 0.004), x0 = Math.min(x, x - side * 0.01), x1 = Math.max(x, x - side * 0.01);
      b.box(x0, 1.05, z - 0.17, x1, 1.68, z + 0.17, [1, 1, 1], k(M.LALIQUE, 0.6));
      b.box(Math.min(x, x - side * 0.02), 1.03, z - 0.19, Math.max(x, x - side * 0.02), 1.05, z + 0.19, C.brass, k(M.BRASS));
      b.box(Math.min(x, x - side * 0.02), 1.68, z - 0.19, Math.max(x, x - side * 0.02), 1.7, z + 0.19, C.brass, k(M.BRASS));
      sconce(b, side, 1.86, z);
    }
  }
  bays.forEach((z, i) => {
    // four at the tables on the left, two on the right
    clothTable(b, -WI + 0.02, z - 0.42, -0.42, z + 0.42);
    solids.push([-WI, z - 0.45, -0.4, z + 0.45]);
    clothTable(b, 0.62, z - 0.38, WI - 0.02, z + 0.38);
    solids.push([0.6, z - 0.4, WI, z + 0.4]);
    for (const dz of [-1, 1]) {
      solids.push(chair(b, -1.05, z + dz * 0.72, -dz, C.green)); solids.push(chair(b, -0.6, z + dz * 0.72, -dz, C.green));
      solids.push(chair(b, 1.02, z + dz * 0.68, -dz, C.green));
    }
    // place settings
    for (const [px, pz, n] of [[-1.05, z - 0.25, 1], [-0.62, z - 0.25, 1], [-1.05, z + 0.25, -1], [-0.62, z + 0.25, -1], [1.02, z - 0.22, 1], [1.02, z + 0.22, -1]]) {
      b.blobAt(px + 0.012, 0.7415, pz + 0.018, 0.145, 0.145, C.white, k(M.LINEN), 0.42);
      b.blobAt(px + 0.17, 0.7415, pz + n * 0.15 + 0.01, 0.05, 0.05, C.white, k(M.LINEN), 0.4);
      plate(b, px, 0.7435, pz);
      cutlery(b, px - 0.16, 0.742, pz); cutlery(b, px + 0.16, 0.742, pz);
      wineGlass(b, px + 0.12, 0.742, pz + n * 0.15, (i + Math.round(px * 7)) % 3 === 0 ? 1 : 0);
    }
    tableLamp(b, -WI + 0.2, 0.74, z, C.shadePink, 2.8);
    tableLamp(b, WI - 0.17, 0.74, z, C.shadePink, 2.8);
    if (i % 3 === 0) { b.blobAt(-0.85, 0.7415, z + 0.05, 0.06, 0.06, C.white, k(M.LINEN), 0.5); bottle(b, -0.85, 0.742, z + 0.05, [0.04, 0.12, 0.05], 0, i % 2 ? 0 : 2); }
    if (i % 3 === 1) b.lathe(0.95, 0.742, z, [[0.035, 0], [0.04, 0.04], [0.02, 0.16], [0.03, 0.2]], 10, C.white, k(M.SILVER));     // a bud vase
    if (i % 3 === 1) b.lathe(0.95, 0.94, z, [[0.0, 0], [0.03, 0.02], [0.025, 0.05], [0.0, 0.06]], 8, [0.35, 0.03, 0.04], k(M.VELVET));
  });
  // the pantry at the front end: a sideboard with glasses and a silver bucket
  const zs = -ZE + 0.02;
  b.box(-WI + 0.02, 0, zs, -0.6, 0.95, zs + 0.45, [1, 1, 1], k(M.PANEL)); b.box(-WI + 0.02, 0.95, zs, -0.6, 0.98, zs + 0.47, [1, 1, 1], k(M.MARBLE));
  b.box(0.6, 0, zs, WI - 0.02, 0.95, zs + 0.45, [1, 1, 1], k(M.PANEL)); b.box(0.6, 0.95, zs, WI - 0.02, 0.98, zs + 0.47, [1, 1, 1], k(M.MARBLE));
  solids.push([-WI, -ZE, -0.58, zs + 0.5], [0.58, -ZE, WI, zs + 0.5]);
  for (let i = 0; i < 6; i++) wineGlass(b, -1.25 + i * 0.1, 0.98, zs + 0.15);
  b.lathe(1.0, 0.98, zs + 0.22, [[0.09, 0], [0.11, 0.2], [0.12, 0.22]], 16, C.white, k(M.SILVER));
  bottle(b, 1.02, 1.0, zs + 0.22, [0.04, 0.1, 0.04], 0, 2);
  bays.forEach((z) => ceilLight(b, 0, z));
  return lampRows([0, 2.3, bays[0], P, 8, 0.5, 0.35, 0, WARM], [-WI + 0.2, 1.06, bays[0], P, 8, 0.32, 0.1, 2, [1, 0.5, 0.3]], [WI - 0.17, 1.06, bays[0], P, 8, 0.32, 0.1, 2, [1, 0.5, 0.3]],
    [-WI + 0.15, 1.88, bays[0] + P / 2, P, 7, 0.22, 0.1, 0, WARM], [WI - 0.15, 1.88, bays[0] + P / 2, P, 7, 0.22, 0.1, 0, WARM]);
}

function bar(b, gl, solids, R) {
  // the bar along the left at the front, a lounge behind with a piano
  const wl = range(4, 1.2, 2.4), wr = range(8, -8.4, 2.4);
  shell(b, gl, { winL: winsAt(wl, 1.3), winR: winsAt(wr, 1.3), sill: 0.8, top: 1.92, carpet: C.carpetGreen, run: [0.15, 0.5], front: "door", rear: "door", curtain: C.bordeaux });
  const zA = -9.6, zB = -1.2;
  // back bar: mirror, glass shelves of bottles lit from behind
  b.box(-WI + 0.005, 0.95, zA, -WI + 0.02, 2.05, zB, [1, 1, 1], k(M.MIRROR));
  b.box(-WI + 0.02, 0, zA, -WI + 0.48, 0.92, zB, [1, 1, 1], k(M.PANEL));
  b.box(-WI + 0.02, 0.92, zA, -WI + 0.5, 0.95, zB, [1, 1, 1], k(M.MARBLE));
  for (const y of [1.28, 1.62]) b.box(-WI + 0.02, y, zA, -WI + 0.28, y + 0.02, zB, [0.5, 0.45, 0.4], k(M.BOTTLE, 0.1));
  const BC = [[0.22, 0.09, 0.015], [0.03, 0.09, 0.03], [0.3, 0.2, 0.06], [0.18, 0.03, 0.02], [0.3, 0.3, 0.3], [0.1, 0.05, 0.012]];
  for (const y of [0.95, 1.3, 1.64]) for (let z = zA + 0.15; z < zB - 0.1; z += 0.1 + R() * 0.07) if (R() < 0.85) { const kd = Math.floor(R() * 6), sc = 0.8 + R() * 0.25; bottle(b, -WI + 0.12 + R() * 0.08, y, z, BC[Math.floor(R() * BC.length)], 0.5 + R() * 0.5, kd, sc); z += (BOTTLES[kd].r * sc - 0.037) * 1.5; }
  for (let x = -0.95; x < -0.6; x += 0.08) for (let z = zA + 0.3; z < zA + 1.2; z += 0.09) wineGlass(b, x, 0.95, z);
  b.box(-WI + 0.02, 2.0, zA, -WI + 0.35, 2.12, zB, C.mahog, WOODK(12, 0.8));
  // the counter: panelled front, marble top, brass foot rail
  const cx0 = -0.72, cx1 = -0.45;
  b.box(cx0, 0, zA + 0.6, cx1, 1.02, zB, [1, 1, 1], k(M.PANEL));
  b.box(cx0 - 0.05, 1.02, zA + 0.55, cx1 + 0.08, 1.07, zB + 0.05, [1, 1, 1], k(M.MARBLE));
  b.lathe(cx1 + 0.12, 0.15, (zA + zB) / 2, [[0.018, -(zB - zA - 0.6) / 2], [0.018, (zB - zA - 0.6) / 2]], 8, C.brass, k(M.BRASS), "z");
  solids.push([-WI, zA, cx1 + 0.08, zB + 0.05], [-WI, -ZE, -0.6, zA]);
  b.box(-WI + 0.02, 0, -ZE + 0.02, -0.6, 1.02, zA, [1, 1, 1], k(M.PANEL));
  // stools
  for (let z = zA + 0.9; z < zB - 0.2; z += 0.75) {
    b.lathe(-0.15, 0, z, [[0.0, 0], [0.2, 0], [0.2, 0.018], [0.12, 0.035], [0.035, 0.06], [0.028, 0.35], [0.034, 0.37], [0.028, 0.39], [0.03, 0.66]], 20, C.brass, k(M.BRASS));
    b.lathe(-0.15, 0.2, z, [[0.17, 0], [0.17, 0.012]], 20, C.brass, k(M.BRASS));
    b.lathe(-0.15, 0.66, z, [[0.0, -0.02], [0.17, -0.02], [0.19, 0.02], [0.195, 0.06], [0.185, 0.09], [0.14, 0.118], [0, 0.128]], 20, [0.18, 0.05, 0.03], k(M.LEATHER));
    b.blob(-0.15, z, 0.25, 0.25);
    solids.push([-0.35, z - 0.2, 0.05, z + 0.2]);
  }
  // cocktails on the bar
  for (let z = zA + 1.0; z < zB; z += 1.5) { wineGlass(b, -0.55, 1.07, z, 1); bottle(b, -0.6, 1.07, z + 0.35, [0.3, 0.16, 0.03], 0.2, 3, 0.95); }
  // right side: a standing ledge under the windows
  b.box(WI - 0.25, 1.02, -9.5, WI - 0.02, 1.05, -1.5, C.mahog, WOODK(15, 1)); solids.push([WI - 0.27, -9.5, WI, -1.5]);
  // lounge: leather club chairs round little tables
  for (const z of [0.0, 3.4]) {
    for (const [x, side] of [[-0.95, -1], [0.95, 1]]) {
      solids.push(armchair(b, x, z + 0.55, -1, [0.16, 0.05, 0.025], 0.7, true));
      solids.push(armchair(b, x, z + 2.05, 1, [0.16, 0.05, 0.025], 0.7, true));
      b.lathe(x, 0, z + 1.3, [[0.12, 0], [0.04, 0.03], [0.03, 0.55], [0.3, 0.56], [0.3, 0.6], [0, 0.6]], 18, C.mahog, WOODK(16, 1));
      solids.push([x - 0.3, z + 1.0, x + 0.3, z + 1.6]);
      tableLamp(b, x + side * -0.12, 0.6, z + 1.25, C.shade, 2.4);
      wineGlass(b, x + side * 0.1, 0.6, z + 1.4);
      void side;
    }
  }
  // the piano against the left wall at the back, its stool, a palm
  const pz0 = 7.4, pz1 = 8.9;
  piano(b, pz0, pz1);
  solids.push([-WI, pz0, -WI + 0.9, pz1], [-WI + 1.0, pz0 + 0.3, -WI + 1.45, pz1 - 0.3]);
  palm(b, WI - 0.35, 9.8, R); solids.push([WI - 0.65, 9.4, WI, ZE]);
  range(8, -8.4, 2.4).forEach((z) => ceilLight(b, 0, z + 1.2));
  for (const z of [0.6, 3.0, 5.4, 7.8]) sconce(b, 1, 1.86, z + 1.2);
  return lampRows([0, 2.3, -7.2, 2.4, 8, 0.36, 0.35, 0, WARM], [-WI + 0.15, 1.45, zA + 0.4, 1.0, 9, 0.12, 0.1, 3, [1, 0.55, 0.25]],
    [-0.83, 0.9, 1.25, 3.4, 2, 0.28, 0.1, 2, WARM], [0.83, 0.9, 1.25, 3.4, 2, 0.28, 0.1, 2, WARM], [WI - 0.15, 1.88, 1.8, 2.4, 4, 0.2, 0.1, 0, WARM], [-1.12, 1.57, 8.65, 1, 1, 0.25, 0.1, 2, WARM], [-0.69, 1.25, 7.53, 1.24, 2, 0.035, 0.05, 0, [1, 0.55, 0.22]]);
}

// an upright piano in rosewood against the left wall, keyboard toward the aisle, from z0 to z1: plinth, panelled
// case, console legs, a real keyboard, the fallboard folded back, a music desk with music on it, candle sconces
function piano(b, z0, z1) {
  const RW = WOODK(61, 0.5), RW2 = WOODK(62, 0.38), PAN = WOODK(63, 0.62), xb = -WI + 0.02, xf = -0.86, xl = -0.83, xk = -0.56, zc = (z0 + z1) / 2;
  b.blob(-1.0, zc, 0.6, 0.95);
  b.rbox(xb, 0, z0 + 0.02, xl + 0.015, 0.075, z1 - 0.02, 0.008, C.mahog, RW2);                       // the plinth
  b.rbox(xb, 0.07, z0, xl, 0.66, z1, 0.01, C.mahog, RW);                                               // the lower case
  for (const [a, c] of [[z0 + 0.14, zc - 0.025], [zc + 0.025, z1 - 0.14]]) {                              // the kneeboard's raised panels
    b.rbox(xl - 0.01, 0.15, a, xl + 0.012, 0.57, c, 0.009, C.mahog, PAN);
    b.rbox(xl, 0.19, a + 0.04, xl + 0.018, 0.53, c - 0.04, 0.006, C.mahog, RW);
  }
  for (const z of [z0 + 0.045, z1 - 0.045]) {                                                            // console legs
    b.rbox(xl, 0, z - 0.04, xk + 0.03, 0.075, z + 0.04, 0.012, C.mahog, RW2);
    b.lathe(xk - 0.03, 0.075, z, [[0, 0], [0.034, 0], [0.034, 0.03], [0.022, 0.07], [0.026, 0.1], [0.04, 0.2], [0.036, 0.3], [0.022, 0.42], [0.03, 0.47], [0.04, 0.52], [0.042, 0.56], [0, 0.565]], 12, C.mahog, RW);
  }
  b.rbox(xl, 0.635, z0, xk, 0.705, z1, 0.01, C.mahog, RW);                                             // the keybed and key slip
  for (const z of [z0, z1 - 0.055]) b.rbox(xl, 0.69, z, xk + 0.004, 0.84, z + 0.055, 0.02, C.mahog, RW);   // the cheeks
  // the keys: 52 white, 36 black, an ivory and ebony keyboard on blocks between the cheeks
  const ww = 0.0235, zs = zc - ww * 26, ivory = [0.66, 0.62, 0.52], ebony = [0.012, 0.01, 0.009];
  for (const [a, c] of [[z0 + 0.055, zs], [zs + ww * 52, z1 - 0.055]]) b.rbox(-0.74, 0.7, a, xk + 0.002, 0.77, c, 0.008, C.mahog, RW);
  b.box(-0.83, 0.7, zs, -0.722, 0.745, zs + ww * 52, [0.3, 0.03, 0.03], k(M.VELVET));                      // the felt behind the keys
  for (let i = 0; i < 52; i++) {
    const z = zs + i * ww;
    b.box(-0.722, 0.722, z + 0.0006, -0.574, 0.745, z + ww - 0.0006, ivory, k(M.KEYS), "-y");
    if ([0, 2, 3, 5, 6].includes(i % 7) && i < 51) { const zb = z + ww - 0.0063; b.rbox(-0.722, 0.742, zb, -0.626, 0.759, zb + 0.0126, 0.0025, ebony, k(M.KEYS)); }
  }
  // the fallboard folded back, its name in gold; the upper case behind
  b.rbox(-0.86, 0.745, z0 + 0.05, -0.735, 0.86, z1 - 0.05, 0.012, C.mahog, RW);
  b.box(-0.736, 0.795, zc - 0.07, -0.733, 0.808, zc + 0.07, C.gold, k(M.BRASS));
  b.rbox(xb, 0.66, z0, xf, 1.22, z1, 0.01, C.mahog, RW);
  for (const [a, c] of [[z0 + 0.06, zc - 0.3], [zc + 0.3, z1 - 0.06], [zc - 0.27, zc + 0.27]]) {          // the upper panels: silk behind fretwork
    b.rbox(xf - 0.01, 0.88, a, xf + 0.014, 1.18, c, 0.008, C.mahog, PAN);
    b.box(xf, 0.92, a + 0.035, xf + 0.017, 1.14, c - 0.035, [0.2, 0.025, 0.03], k(M.VELVET));
    for (let z = a + 0.06; z < c - 0.05; z += 0.06) b.lathe(xf + 0.018, 1.03, z, [[0, -0.1], [0.006, -0.09], [0.004, 0], [0.006, 0.09], [0, 0.1]], 5, C.mahog, RW);
  }
  // the top: a moulded lid
  b.rbox(xb, 1.205, z0 - 0.01, xf + 0.02, 1.24, z1 + 0.01, 0.012, C.mahog, RW);
  b.rbox(xb, 1.235, z0 - 0.02, xf + 0.04, 1.27, z1 + 0.02, 0.014, C.mahog, RW2);
  // the music desk: a ledge, a sloping board, music open on it
  b.rbox(xf, 0.93, zc - 0.42, xf + 0.085, 0.955, zc + 0.42, 0.008, C.mahog, RW);
  const deskN = [0.97, 0.24, 0];
  b.quad([xf + 0.075, 0.955, zc - 0.4], [xf + 0.075, 0.955, zc + 0.4], [xf + 0.02, 1.18, zc + 0.4], [xf + 0.02, 1.18, zc - 0.4], deskN, C.mahog, RW);
  for (const [a, c, t] of [[zc - 0.27, zc - 0.005, 0.006], [zc + 0.005, zc + 0.27, -0.006]]) b.quad([xf + 0.077, 0.957, a], [xf + 0.077, 0.957 + t, c], [xf + 0.03, 1.15 + t, c], [xf + 0.03, 1.15, a], deskN, [0.6, 0.55, 0.42], k(M.LINEN));
  // candle sconces swung out at either end
  for (const z of [z0 + 0.13, z1 - 0.13]) {
    b.rbox(xf + 0.012, 0.98, z - 0.03, xf + 0.02, 1.1, z + 0.03, 0.004, C.brass, k(M.BRASS));
    b.lathe(xf + 0.02, 1.04, z, [[0.008, 0], [0.008, 0.14]], 6, C.brass, k(M.BRASS), "x");
    const cx = xf + 0.17;
    b.lathe(cx, 1.03, z, [[0, 0], [0.012, 0.0], [0.006, 0.02], [0.03, 0.035], [0.034, 0.042], [0.016, 0.045], [0.016, 0.06], [0, 0.06]], 10, C.brass, k(M.BRASS));
    b.lathe(cx, 1.09, z, [[0.011, 0], [0.011, 0.11], [0.008, 0.118], [0, 0.12]], 8, [0.68, 0.64, 0.56], k(M.CHINA));
    b.lathe(cx, 1.212, z, [[0, 0], [0.006, 0.006], [0.008, 0.016], [0.005, 0.03], [0, 0.042]], 8, [1, 0.62, 0.26], k(M.FIRE, 5));
  }
  tableLamp(b, -1.12, 1.27, z1 - 0.25, C.shade, 2.4);
  b.box(-1.25, 1.27, z0 + 0.2, -0.98, 1.31, z0 + 0.52, [1, 1, 1], k(M.BOOKS));
  // the stool: turned legs, an apron, a buttoned leather seat
  const sx0 = -0.42, sx1 = -0.08, sz0 = z0 + 0.38, sz1 = z1 - 0.38;
  b.blob((sx0 + sx1) / 2, zc, 0.3, 0.48);
  for (const x of [sx0 + 0.03, sx1 - 0.03]) for (const z of [sz0 + 0.03, sz1 - 0.03]) b.lathe(x, 0, z, [[0, 0], [0.02, 0], [0.016, 0.05], [0.026, 0.15], [0.02, 0.3], [0.026, 0.38], [0, 0.39]], 8, C.mahog, RW);
  b.rbox(sx0, 0.37, sz0, sx1, 0.44, sz1, 0.01, C.mahog, RW);
  b.rbox(sx0 - 0.01, 0.43, sz0 - 0.01, sx1 + 0.01, 0.52, sz1 + 0.01, 0.035, [0.16, 0.035, 0.02], k(M.LEATHER, 1));
}

function palm(b, x, z, R) {
  b.lathe(x, 0, z, [[0.14, 0], [0.2, 0.32], [0.22, 0.36], [0.0, 0.37]], 16, C.brass, k(M.BRASS));
  // fronds arching out and drooping, each a strip of narrow leaflets (a zigzag of quads)
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * TAU + R() * 0.4, l = 0.5 + R() * 0.4, up = 0.5 + R() * 0.6, S = 8;
    const ca = Math.cos(a), sa = Math.sin(a), sx = -sa, sz = ca;
    const pt = (f) => [x + ca * l * f, 0.42 + up * Math.sin(f * 2.2) * 1.1 - f * f * 0.3, z + sa * l * f];
    for (let j = 0; j < S; j++) {
      const p0 = pt(j / S), p1 = pt((j + 1) / S), w = 0.13 * Math.sin(Math.PI * (j + 0.5) / S) + 0.02, dip = 0.05;
      for (const sd of [-1, 1]) b.quad(p0, p1, [p1[0] + sx * w * sd, p1[1] - dip, p1[2] + sz * w * sd], [p0[0] + sx * w * sd * 0.6, p0[1] - dip, p0[2] + sz * w * sd * 0.6], [0, 1, 0], [1, 1, 1], k(M.LEAF));
    }
  }
}

function salon(b, gl, solids, R) {
  const P = 2.3, wz = range(8, -8.05, P);
  shell(b, gl, { winL: winsAt(wz, 1.3), winR: winsAt(wz, 1.3), sill: 0.75, top: 1.92, carpet: C.carpetRed, run: [0, 0.42], front: "door", rear: "door", curtain: C.ochre });
  for (let i = 0; i < 7; i++) {
    const z = wz[i] + P / 2;
    for (const side of [-1, 1]) {
      const x = side * (WI - 0.004), x0 = Math.min(x, x - side * 0.01), x1 = Math.max(x, x - side * 0.01);
      b.box(x0, 1.0, z - 0.2, x1, 1.72, z + 0.2, [1, 1, 1], k(M.LALIQUE, 0.6));
      sconce(b, side, 1.88, z);
    }
  }
  // pairs of armchairs facing across a little table at each window, both sides; a sofa and a desk at the ends
  wz.slice(1, 7).forEach((z, i) => {
    for (const side of [-1, 1]) {
      const x = side * 0.95, col = i % 2 ? C.rose : C.bordeaux;
      solids.push(armchair(b, x, z - 0.62, 1, col, 0.66));
      solids.push(armchair(b, x, z + 0.62, -1, col, 0.66));
      b.box(x - 0.22, 0, z - 0.2, x + 0.22, 0.62, z + 0.2, C.mahog, WOODK(18 + i, 1.0), "-y");
      solids.push([x - 0.25, z - 0.22, x + 0.25, z + 0.22]);
      tableLamp(b, side * 1.2, 0.62, z, C.shade, 2.4);
      if ((i + side) % 3 === 0) { b.box(x - 0.12, 0.62, z - 0.08, x + 0.05, 0.64, z + 0.12, [0.55, 0.52, 0.45], k(M.LINEN)); }     // a newspaper
      if ((i + side) % 3 === 1) { b.lathe(x + 0.03, 0.62, z - 0.05, [[0.045, 0], [0.05, 0.003], [0.035, 0.012], [0.04, 0.07], [0.045, 0.075]], 12, C.white, k(M.CHINA)); }   // a cup
    }
  });
  // front end: a sofa across beside the door; rear end: a writing desk and a bookcase
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -WI + 0.02 : 0.55, x1 = side < 0 ? -0.55 : WI - 0.02, z0 = -ZE + 0.05, z1 = -ZE + 0.85;
    for (const px of [x0 + 0.08, x1 - 0.08]) for (const pz of [z0 + 0.06, z1 - 0.06]) b.lathe(px, 0, pz, [[0.0, 0], [0.024, 0], [0.018, 0.03], [0.03, 0.06], [0.024, 0.11], [0.0, 0.12]], 8, C.mahog, WOODK(5, 0.7));
    b.rbox(x0, 0.1, z0, x1, 0.4, z1, 0.04, C.bordeaux, k(M.VELVET, 2));
    b.rbox(x0 + 0.01, 0.4, z0, x1 - 0.01, 1.02, z0 + 0.22, 0.08, C.bordeaux, k(M.VELVET, 1));
    for (const sx of [x0, x1 - 0.11]) { b.rbox(sx, 0.36, z0 + 0.05, sx + 0.11, 0.66, z1, 0.045, C.bordeaux, k(M.VELVET, 2)); b.lathe(sx + 0.055, 0.655, 0, [[0.0, z0 + 0.1], [0.05, z0 + 0.1], [0.062, z0 + 0.112], [0.062, z1 - 0.012], [0.05, z1], [0.0, z1]], 10, C.bordeaux, k(M.VELVET, 2), "z"); }
    for (const [a0, a1] of [[x0 + 0.11, (x0 + x1) / 2 - 0.01], [(x0 + x1) / 2 + 0.01, x1 - 0.11]]) b.rbox(a0, 0.4, z0 + 0.2, a1, 0.52, z1 - 0.01, 0.05, C.bordeaux, k(M.VELVET, 2));
    b.blob((x0 + x1) / 2, (z0 + z1) / 2, 0.8, 0.55);
    solids.push([x0, z0 - 0.05, x1, z1]);
  }
  const dz0 = ZE - 0.75;
  b.box(-WI + 0.02, 0, dz0, -0.6, 0.76, ZE - 0.02, C.mahog, WOODK(33, 1.05));
  b.box(-1.1, 0.76, dz0 + 0.05, -0.7, 0.765, dz0 + 0.35, [0.4, 0.05, 0.04], k(M.LEATHER));
  tableLamp(b, -1.2, 0.76, ZE - 0.25, [0.3, 0.9, 0.5], 1.6);
  solids.push(chair(b, -0.95, dz0 - 0.35, -1, C.bordeaux));
  b.box(0.6, 0, ZE - 0.38, WI - 0.02, 1.9, ZE - 0.02, C.mahog, WOODK(34, 0.9));
  for (const y of [0.15, 0.6, 1.05, 1.5]) b.box(0.66, y, ZE - 0.36, WI - 0.08, y + 0.32, ZE - 0.06, [1, 1, 1], k(M.BOOKS));
  solids.push([-WI, dz0 - 0.05, -0.58, ZE], [0.58, ZE - 0.4, WI, ZE]);
  palm(b, -WI + 0.3, -ZE + 1.3, R); solids.push([-WI, -ZE + 0.9, -WI + 0.65, -ZE + 1.7]);
  wz.forEach((z) => ceilLight(b, 0, z + P / 2 - 0.0));
  return lampRows([0, 2.3, wz[0] + P / 2, P, 7, 0.42, 0.35, 0, WARM], [-WI + 0.15, 1.9, wz[0] + P / 2, P, 7, 0.22, 0.1, 0, WARM], [WI - 0.15, 1.9, wz[0] + P / 2, P, 7, 0.22, 0.1, 0, WARM],
    [-1.2, 0.92, wz[1], P, 6, 0.3, 0.1, 2, WARM], [1.2, 0.92, wz[1], P, 6, 0.3, 0.1, 2, WARM], [-1.2, 1.05, ZE - 0.25, 1, 1, 0.25, 0.1, 2, [0.6, 0.9, 0.6]]);
}

function observation(b, gl, solids, R) {
  const P = 2.05, wz = range(9, -8.4, P);
  shell(b, gl, { winL: winsAt(wz, 1.6), winR: winsAt(wz, 1.6), sill: 0.62, top: 2.0, carpet: C.carpetBlue, run: [0, 0.45], front: "door", rear: "glass", curtain: null });
  // armchairs turned toward the windows, a pair at the glazed end looking back down the line
  wz.slice(1, 8).forEach((z, i) => {
    for (const side of [-1, 1]) {
      const x = side * 0.95;
      solids.push(armchair(b, x, z, i % 2 ? 1 : -1, C.blue, 0.68));
      if (i % 2) { b.lathe(x, 0, z + 0.85, [[0.1, 0], [0.03, 0.03], [0.025, 0.5], [0.22, 0.51], [0.22, 0.55], [0, 0.55]], 16, C.mahog, WOODK(41 + i, 1)); solids.push([x - 0.24, z + 0.62, x + 0.24, z + 1.08]); tableLamp(b, x, 0.55, z + 0.85, C.shade, 2.2); }
    }
  });
  for (const x of [-0.6, 0.6]) solids.push(armchair(b, x, 9.4, -1, C.bordeaux, 0.7));
  for (const side of [-1, 1]) for (let i = 0; i < 8; i++) sconce(b, side, 2.08, wz[i] + P / 2);
  palm(b, WI - 0.3, -ZE + 0.7, R); solids.push([WI - 0.6, -ZE, WI, -ZE + 1.1]);
  // the brass rail across the glazed end
  b.lathe(0, 0.95, ZE - 0.15, [[0.02, -1.25], [0.02, 1.25]], 8, C.brass, k(M.BRASS), "x");
  wz.forEach((z) => ceilLight(b, 0, z));
  return lampRows([0, 2.3, wz[0], P, 9, 0.38, 0.35, 0, WARM], [-WI + 0.15, 2.1, wz[0] + P / 2, P, 8, 0.15, 0.1, 0, WARM], [WI - 0.15, 2.1, wz[0] + P / 2, P, 8, 0.15, 0.1, 0, WARM],
    [-0.95, 0.85, wz[2] + 0.85, P * 2, 3, 0.25, 0.1, 2, WARM], [0.95, 0.85, wz[2] + 0.85, P * 2, 3, 0.25, 0.1, 2, WARM]);
}

// the engine: a big-boilered express locomotive, black with brass bands; the firebox glows in the cab
function loco(b) {
  const g = [0.012, 0.016, 0.013], red = [0.2, 0.025, 0.02];
  const by = 1.45, br = 0.86;
  b.lathe(0, by, -6.6, [[0, 0], [br + 0.05, 0], [br + 0.05, 1.3], [br, 1.3], [br, 7.6], [0, 7.6]], 24, g, k(M.LOCO), "z");
  for (const z of [-5.2, -3.2, -1.2, 0.6]) b.lathe(0, by, z, [[br + 0.012, 0], [br + 0.012, 0.06]], 24, C.brass, k(M.BRASS), "z");
  b.lathe(0, by, -6.62, [[0.0, 0], [0.7, 0], [0.75, 0.02]], 20, g, k(M.LOCO), "z");
  b.lathe(0, by + br - 0.05, -5.6, [[0.33, 0], [0.26, 0.15], [0.24, 0.75], [0.3, 0.85], [0.3, 0.9]], 14, g, k(M.LOCO));     // chimney
  b.lathe(0, by + br - 0.05, -2.2, [[0.42, 0], [0.38, 0.25], [0.3, 0.45], [0.0, 0.5]], 16, C.brass, k(M.BRASS));            // dome
  b.lathe(0, by + br - 0.05, -0.4, [[0.12, 0], [0.12, 0.3], [0.06, 0.35]], 10, C.brass, k(M.BRASS));                      // whistle
  // running plate, buffer beam, lamps, cab
  b.box(-1.4, 0.45, -7.3, 1.4, 0.55, 1.6, g, k(M.LOCO));
  b.box(-1.45, -0.3, -7.45, 1.45, 0.45, -7.15, red, k(M.LOCO));
  for (const x of [-0.9, 0.9]) { b.lathe(x, -0.05, -7.45, [[0.08, 0], [0.08, -0.35], [0.2, -0.35], [0.2, -0.4]], 12, [1, 1, 1], k(M.UNDER), "z"); }
  for (const x of [-0.6, 0.6]) b.lathe(x, 0.75, -7.25, [[0.12, 0], [0.12, -0.15], [0, -0.16]], 12, [1, 0.9, 0.7], k(M.BULB, 6), "z");
  b.lathe(0, 2.55, -6.7, [[0.12, 0], [0.12, -0.15], [0, -0.16]], 12, [1, 0.9, 0.7], k(M.BULB, 6), "z");
  b.box(-1.45, 0.55, 1.0, 1.45, 2.75, 4.2, g, k(M.LOCO), "+z");
  b.box(-1.5, 2.75, 0.9, 1.5, 2.88, 4.4, g, k(M.ROOF));
  b.box(-1.1, 1.75, 0.98, -0.4, 2.3, 1.0, [0.3, 0.2, 0.1], k(M.FIRE, 0.6));
  b.box(0.4, 1.75, 0.98, 1.1, 2.3, 1.0, [0.3, 0.2, 0.1], k(M.FIRE, 0.6));
  b.box(-1.3, 0.56, 3.0, 1.3, 2.7, 4.19, [1, 0.45, 0.15], k(M.FIRE, 0.9));        // the cab, lit by the open firebox
  // wheels: three big drivers a side, a bogie in front, coupling rods
  for (const side of [-1, 1]) {
    const x = side * 0.8;
    for (const z of [-2.9, -0.95, 1.0]) b.lathe(x + side * 0.05, RAIL + 0.98, z, [[0, -0.07], [0.98, -0.07], [0.98, 0.07], [0, 0.07]], 22, [0.2, 0.03, 0.02], k(M.LOCO), "x");
    for (const z of [-6.1, -5.0]) b.lathe(x, RAIL + 0.48, z, [[0, -0.06], [0.48, -0.06], [0.48, 0.06], [0, 0.06]], 14, [0.2, 0.03, 0.02], k(M.LOCO), "x");
    b.box(x + side * 0.13 - 0.03, RAIL + 0.6, -3.0, x + side * 0.13 + 0.03, RAIL + 0.72, 1.1, C.white, k(M.SILVER));
  }
  b.box(-0.6, -1.0, -6.8, 0.6, 0.45, 1.6, [1, 1, 1], k(M.UNDER));
}
function tender(b) {
  const g = [0.012, 0.016, 0.013];
  b.box(-1.45, -0.3, -3.7, 1.45, 1.85, 3.7, g, k(M.LOCO));
  b.box(-1.3, 1.85, -3.6, 1.3, 2.25, 2.0, [0.01, 0.01, 0.01], k(M.UNDER));      // coal
  b.box(-1.45, 1.85, -3.7, 1.45, 2.0, -3.6, g, k(M.LOCO)); b.box(-1.45, 1.85, -3.7, -1.35, 2.0, 3.7, g, k(M.LOCO)); b.box(1.35, 1.85, -3.7, 1.45, 2.0, 3.7, g, k(M.LOCO));
  for (const y of [0.2, 1.7]) for (const side of [-1, 1]) b.box(side * 1.452 - 0.002, y, -3.6, side * 1.452 + 0.002, y + 0.03, 3.6, C.gold, k(M.LOCO));
  for (const side of [-1, 1]) for (const z of [-2.4, 0, 2.4]) b.lathe(side * 0.8, RAIL + 0.5, z, [[0, -0.06], [0.5, -0.06], [0.5, 0.06], [0, 0.06]], 14, [0.2, 0.03, 0.02], k(M.LOCO), "x");
  b.box(-1.2, -1.0, -3.6, 1.2, -0.3, 3.6, [1, 1, 1], k(M.UNDER));
}

// ---------------------------------------------------------------- assembling the train
export const CARS = [
  { name: "the sleeping car", build: sleeper },
  { name: "the dining car", build: dining },
  { name: "the bar", build: bar },
  { name: "the salon", build: salon },
  { name: "the observation car", build: observation },
];
// vehicles in train coordinates: Zc the centre (car i at i * CAR), b the half distance between its bogies
export const TENDER_Z = -ZX - 1.0 - 3.7, LOCO_Z = TENDER_Z - 3.7 - 0.6 - 4.4;
export const CHIMNEY = [0, 3.2, -5.6];      // the chimney's top in the engine's frame

export function buildTrain({ uniforms, prevTex, LITE = false }) {
  const vehicles = [], solids = [], seats = [];
  const R = rng(1906);
  const mkMat = (rows) => {
    const U = {
      ...uniforms,
      uRowA: { value: Array.from({ length: NROW }, () => new THREE.Vector4()) },
      uRowB: { value: Array.from({ length: NROW }, () => new THREE.Vector4()) },
      uRowC: { value: Array.from({ length: NROW }, () => new THREE.Vector3()) },
      uWinL: { value: new THREE.Vector3() }, uWinR: { value: new THREE.Vector3() }, uSunL: { value: new THREE.Vector3() },
      uLampK: { value: 1 },
    };
    rows.slice(0, NROW).forEach(([x, y, z0, pitch, n, inten, size, kind, col], i) => {
      U.uRowA.value[i].set(x, y, z0, pitch); U.uRowB.value[i].set(n, inten, size, kind); U.uRowC.value[i].set(...col);
    });
    const m = new THREE.ShaderMaterial({ vertexShader: TRAIN_VERT, fragmentShader: TRAIN_FRAG, uniforms: U, vertexColors: true, side: THREE.DoubleSide });
    return m;
  };
  const glassU = { tPrev: prevTex, uRes: { value: new THREE.Vector2(1, 1) }, uSpeed: { value: 0 }, uOut: { value: 1 } };
  const glassMat = new THREE.ShaderMaterial({ vertexShader: TRAIN_VERT, fragmentShader: GLASS_FRAG, uniforms: { ...uniforms, ...glassU }, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });

  const add = (kind, Zc, half, len, buildFn, extra = {}) => {
    const b = builder(), gl = builder(), local = [];
    b.seats = [];
    const rows = buildFn(b, gl, local, R) || [];
    if (extra.gangway) { gangway(b); rows.push([0, 2.08, (ZX + CAR - ZX) / 2, 1, 1, 0.12, 0.1, 0, [1, 0.62, 0.32]]); }
    if (extra.bake) { const t0 = performance.now(); b.bake(rows.slice(0, NROW), LITE); bakeMs += performance.now() - t0; }
    const group = new THREE.Group(); group.matrixAutoUpdate = false;
    const mat = mkMat(rows);
    const mesh = new THREE.Mesh(b.build(), mat); group.add(mesh);           // culled by its bounding sphere: carriages behind you cost nothing
    if (gl.count) {
      // the glass sees this carriage's lamps (shared uniforms), to show them mirrored in the dark panes
      const mu = mat.uniforms, gmat = new THREE.ShaderMaterial({ vertexShader: TRAIN_VERT, fragmentShader: GLASS_FRAG, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
        uniforms: { ...uniforms, ...glassU, uRowA: mu.uRowA, uRowB: mu.uRowB, uRowC: mu.uRowC, uWinL: mu.uWinL, uWinR: mu.uWinR, uSunL: mu.uSunL, uLampK: mu.uLampK } });
      const gm = new THREE.Mesh(gl.build(), gmat); gm.renderOrder = 10; group.add(gm);
    }
    for (const s of local) solids.push([s[0], s[1] + Zc, s[2], s[3] + Zc]);
    for (const [x, z, dir] of b.seats) seats.push([x, z + Zc, dir]);
    vehicles.push({ kind, Zc, half, len, group, mat, rows });
  };
  add("loco", LOCO_Z, 3.6, 15, (b) => { loco(b); return []; });
  add("tender", TENDER_Z, 2.4, 7.4, (b) => { tender(b); return []; });
  let bakeMs = 0;
  CARS.forEach((c, i) => add(c.name, i * CAR, 7.5, 2 * ZX, c.build, { gangway: i < CARS.length - 1, bake: true }));
  if (typeof window !== "undefined") window.__trainBakeMs = Math.round(bakeMs);     // for profiling

  // walls for walking, in train coordinates (x, Z): the sides, the ends, the narrow gangways
  const last = (CARS.length - 1) * CAR;
  solids.push([-3, -ZX - 1, 3, -ZE + 0.02], [-3, last + ZE - 0.02, 3, last + ZX + 1]);
  solids.push([WI, -ZX, 3, last + ZX], [-3, -ZX, -WI, last + ZX]);
  for (let i = 0; i < CARS.length - 1; i++) { const z0 = i * CAR + ZE - 0.02, z1 = (i + 1) * CAR - ZE + 0.02; solids.push([-3, z0, -DOOR, z1], [DOOR, z0, 3, z1]); }
  return { vehicles, solids, seats, glassMat, glassU, Zmin: -ZE, Zmax: last + ZE };
}
