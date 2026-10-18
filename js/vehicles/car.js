// Cars on the two boulevards of the Torus scene: a lane each way on both, inside the quarters, right-hand traffic.
// Modelled: hatchbacks, saloons, small SUVs, estates, city cars, panel vans, minibuses, box trucks, 12 m electric
// buses and light-ivory taxis. Each body is lofted from cross sections along its length (bumpers, bonnet,
// windscreen, roof, tailgate or boot, rounded corners in plan, wheel arches cut into the sides, tumblehome), with
// glass, pillars and roof as their own parts; tyres and rims sit in the arches, plus mirrors, roof rails, a taxi
// sign, a cargo box, battery pods. The shader draws the small things: head and tail lights (daytime running
// lights, some braking, some indicating), number plates, grilles, door seams and handles, belt mouldings, SUV
// cladding, spinning rims, dirt low down, paint with a clear coat reflecting the city and the bright vault, and a
// soft shadow on the asphalt under and beside each car. Cars in a lane share its speed and keep their gaps, in
// platoons with long gaps between.
// Contract (shared by every ring vehicle module, see "ring vehicles" in ../torus3d.js):
//   build(api) adds geometry with api.add(geometry, v) / api.box(...) and returns { count }.
//   GLSL defines vehCar(inout Veh v, inout vec3 n, vec3 p, vec3 V, vec4 m, vec4 u), called for kind 3.x.
// Vehicle coordinates are metres: x along the ring (direction of travel for speed > 0), y across, z up from the road.
// kind = 3 + (type + seed) / 16. aU = (part, x toward the front, half length signed by direction, belt height);
// wheel faces: (part, offset from the hub forward and up, speed in dm/s + radius, signed); shadows: (part, half
// length, half width, height).

// parts (aU.x)
const PAINT = 0, ROOF = 1, GLASS = 2, TRIM = 3, TREAD = 4, WHEEL = 5, SHADOW = 6, SIGN = 7, CARGO = 8, DARK = 9, ALU = 10, MIRROR = 11;

// body types: sizes in metres; profiles are [distance from the front, height] keys: top = the centre line over
// bonnet, windscreen, roof and tail, belt = the shoulder under the side windows. ws / rw: windscreen and rear
// window ranges, side: side glass ranges (black pillars between, cpil behind), gh: glass height above the belt
// (vans, buses). Lights and such for the shader: hl / tl = [z0, z1, width in from the side, depth in from the end],
// pl = plate heights front and rear, gr = grille [z0, z1, half width], seams = door seams from the front,
// fg / rg = glass in the front and rear faces [z0, z1].
const SEDAN = {
  L: 4.72, W: 1.84, H: 1.44, fo: 0.86, wb: 2.84, r: 0.33, tw: 0.225, sill: 0.3, noseF: 0.24, noseR: 0.32, rcF: 0.45, rcR: 0.35, rkF: 0.13, rkR: 0.08, taper: 0.04, roofW: 0.8, crown: 0.035,
  top: [[0, 0.65], [0.07, 0.73], [0.3, 0.79], [1.0, 0.89], [1.45, 0.95], [1.85, 1.19], [2.38, 1.4], [2.7, 1.44], [3.3, 1.42], [3.6, 1.36], [4.12, 1.08], [4.6, 1.05], [4.72, 0.97]],
  belt: [[0, 0.65], [0.4, 0.77], [1.45, 0.95], [4.12, 1.05], [4.6, 1.03], [4.72, 0.95]],
  ws: [1.45, 2.38], rw: [3.6, 4.12], side: [[1.5, 2.93], [3.02, 3.82]], cpil: PAINT,
  hl: [0.62, 0.72, 0.48, 0.5], tl: [0.88, 1.0, 0.45, 0.32], pl: [0.42, 0.62], gr: [0.22, 0.44, 0.62], seams: [1.48, 2.97, 3.9], rim: 0.66, mir: [0.11, 0.19, 0.13],
};
const TYPES = [
  { // 0 hatchback
    L: 4.08, W: 1.79, H: 1.47, fo: 0.87, wb: 2.62, r: 0.315, tw: 0.205, sill: 0.29, noseF: 0.24, noseR: 0.3, rcF: 0.42, rcR: 0.3, rkF: 0.12, rkR: 0.05, taper: 0.04, roofW: 0.8, crown: 0.035,
    top: [[0, 0.64], [0.06, 0.72], [0.25, 0.78], [0.9, 0.87], [1.25, 0.93], [1.65, 1.2], [2.08, 1.42], [2.4, 1.47], [3.3, 1.45], [3.7, 1.42], [3.82, 1.33], [3.97, 0.99], [4.08, 0.9]],
    belt: [[0, 0.64], [0.4, 0.76], [1.25, 0.93], [3.6, 1.0], [3.97, 0.97], [4.08, 0.88]],
    ws: [1.25, 2.08], rw: [3.72, 3.97], side: [[1.3, 2.6], [2.68, 3.42]], cpil: PAINT,
    hl: [0.6, 0.72, 0.46, 0.5], tl: [0.84, 0.97, 0.4, 0.35], pl: [0.42, 0.6], gr: [0.22, 0.44, 0.6], seams: [1.27, 2.64, 3.48], rim: 0.66, mir: [0.1, 0.18, 0.12],
  },
  { ...SEDAN }, // 1 saloon
  { // 2 small SUV
    L: 4.5, W: 1.86, H: 1.66, fo: 0.9, wb: 2.68, r: 0.36, tw: 0.235, sill: 0.37, noseF: 0.36, noseR: 0.42, rcF: 0.45, rcR: 0.32, rkF: 0.1, rkR: 0.05, taper: 0.03, roofW: 0.84, crown: 0.03,
    top: [[0, 0.8], [0.07, 0.89], [0.3, 0.95], [1.0, 1.04], [1.3, 1.08], [1.65, 1.36], [2.02, 1.6], [2.35, 1.65], [3.9, 1.62], [4.2, 1.57], [4.3, 1.46], [4.42, 1.1], [4.5, 1.02]],
    belt: [[0, 0.8], [0.4, 0.92], [1.3, 1.08], [4.0, 1.14], [4.42, 1.1], [4.5, 1.0]],
    ws: [1.3, 2.02], rw: [4.22, 4.42], side: [[1.35, 2.6], [2.68, 3.55], [3.63, 4.05]], cpil: TRIM, rails: 0.6,
    hl: [0.8, 0.9, 0.45, 0.5], tl: [0.86, 1.0, 0.42, 0.3], pl: [0.55, 0.7], gr: [0.36, 0.62, 0.62], seams: [1.36, 2.64, 3.62], clad: 1, rim: 0.62, mir: [0.12, 0.2, 0.14],
  },
  { // 3 estate
    ...SEDAN, L: 4.8, H: 1.5,
    top: [[0, 0.65], [0.07, 0.73], [0.3, 0.79], [1.0, 0.89], [1.45, 0.95], [1.85, 1.19], [2.38, 1.43], [2.7, 1.49], [4.25, 1.46], [4.5, 1.4], [4.66, 1.06], [4.8, 0.97]],
    belt: [[0, 0.65], [0.4, 0.77], [1.45, 0.95], [4.5, 1.05], [4.66, 1.04], [4.8, 0.95]],
    rw: [4.52, 4.66], side: [[1.5, 2.93], [3.02, 3.8], [3.88, 4.35]], cpil: TRIM, rails: 0.5, rcR: 0.28, rkR: 0.04,
    tl: [0.86, 1.02, 0.4, 0.3], pl: [0.42, 0.66],
  },
  { // 4 city car
    L: 2.75, W: 1.63, H: 1.56, fo: 0.5, wb: 1.85, r: 0.29, tw: 0.185, sill: 0.3, noseF: 0.3, noseR: 0.32, rcF: 0.38, rcR: 0.3, rkF: 0.1, rkR: 0.04, taper: 0.03, roofW: 0.86, crown: 0.03,
    top: [[0, 0.72], [0.06, 0.8], [0.3, 0.9], [0.62, 0.99], [1.0, 1.36], [1.28, 1.53], [1.6, 1.56], [2.45, 1.52], [2.6, 1.43], [2.7, 1.0], [2.75, 0.92]],
    belt: [[0, 0.72], [0.3, 0.86], [0.62, 0.99], [2.5, 1.02], [2.7, 0.98], [2.75, 0.9]],
    ws: [0.62, 1.28], rw: [2.52, 2.7], side: [[0.68, 1.85], [1.92, 2.38]], cpil: TRIM,
    hl: [0.7, 0.82, 0.4, 0.4], tl: [0.82, 0.98, 0.3, 0.3], pl: [0.45, 0.6], gr: [0.3, 0.46, 0.5], seams: [0.8, 1.95, 0], rim: 0.66, mir: [0.1, 0.17, 0.12],
  },
  { // 5 panel van
    L: 5.1, W: 1.99, H: 1.98, fo: 0.95, wb: 3.0, r: 0.355, tw: 0.225, sill: 0.4, noseF: 0.36, noseR: 0.42, rcF: 0.35, rcR: 0.12, rkF: 0.08, rkR: 0, taper: 0.03, roofW: 0.92, crown: 0.02, gh: 0.55,
    top: [[0, 0.84], [0.08, 0.95], [0.3, 1.01], [0.75, 1.09], [0.92, 1.13], [1.25, 1.55], [1.6, 1.92], [1.85, 1.98], [5.0, 1.97], [5.1, 1.9]],
    belt: [[0, 0.86], [0.4, 0.99], [0.92, 1.13], [1.9, 1.17], [5.1, 1.17]],
    ws: [0.92, 1.62], rw: null, side: [[0.97, 1.92]], cpil: PAINT,
    hl: [0.9, 1.02, 0.4, 0.45], tl: [0.55, 1.05, 0.14, 0.15], pl: [0.5, 0.55], gr: [0.45, 0.8, 0.65], seams: [0.97, 1.95, 3.2], rg: [1.25, 1.78], rim: 0.6, mir: [0.12, 0.22, 0.28],
  },
  { // 6 minibus, high roof
    L: 5.93, W: 2.02, H: 2.6, fo: 1.0, wb: 3.66, r: 0.37, tw: 0.235, sill: 0.42, noseF: 0.38, noseR: 0.44, rcF: 0.35, rcR: 0.12, rkF: 0.08, rkR: 0, taper: 0.03, roofW: 0.93, crown: 0.02, gh: 0.72,
    top: [[0, 0.86], [0.08, 0.97], [0.3, 1.03], [0.75, 1.12], [0.95, 1.16], [1.3, 1.62], [1.72, 2.25], [2.05, 2.55], [2.3, 2.6], [5.83, 2.59], [5.93, 2.5]],
    belt: [[0, 0.88], [0.4, 1.01], [0.95, 1.16], [2.0, 1.2], [5.93, 1.2]],
    ws: [0.95, 1.75], rw: null, side: [[1.0, 2.0], [2.08, 3.0], [3.06, 3.95], [4.01, 4.85], [4.91, 5.6]], cpil: PAINT,
    hl: [0.92, 1.04, 0.4, 0.45], tl: [0.6, 1.15, 0.14, 0.15], pl: [0.5, 0.58], gr: [0.45, 0.82, 0.66], seams: [1.0, 2.04, 3.3], rg: [1.3, 2.2], rim: 0.6, mir: [0.12, 0.22, 0.28],
  },
  { // 7 box truck: a cab lofted to 2.2 m, a box on a chassis behind
    L: 6.9, loftL: 2.2, W: 2.08, H: 2.26, fo: 1.05, wb: 3.9, r: 0.4, tw: 0.26, sill: 0.5, noseF: 0.42, noseR: 0.5, rcF: 0.3, rcR: 0.06, rkF: 0.06, rkR: 0, taper: 0.02, roofW: 0.92, crown: 0.02, gh: 0.75,
    top: [[0, 1.0], [0.08, 1.1], [0.3, 1.16], [0.62, 1.22], [1.0, 1.9], [1.25, 2.2], [2.1, 2.26], [2.2, 2.2]],
    belt: [[0, 1.02], [0.3, 1.14], [0.62, 1.22], [2.2, 1.32]],
    ws: [0.62, 1.25], rw: null, side: [[0.67, 1.8]], cpil: PAINT,
    box: [2.28, 6.9, 1.12, 3.3, 1.13],
    hl: [1.0, 1.12, 0.4, 0.4], tl: [0.8, 0.98, 0.3, 0.12], pl: [0.6, 0.86], gr: [0.55, 0.95, 0.7], seams: [0.67, 1.85, 0], rim: 0.58, mir: [0.12, 0.26, 0.34],
  },
  { // 8 electric city bus, 12 m
    L: 12.0, W: 2.55, H: 2.97, fo: 2.7, wb: 5.9, r: 0.5, tw: 0.3, sill: 0.32, noseF: 0.3, noseR: 0.38, rcF: 0.2, rcR: 0.18, rkF: 0.05, rkR: 0.02, taper: 0, roofW: 0.93, crown: 0.03, gh: 1.45,
    top: [[0, 2.8], [0.06, 2.9], [0.25, 2.97], [11.8, 2.97], [12, 2.88]],
    belt: [[0, 0.95], [0.3, 1.15], [12, 1.15]],
    ws: null, rw: null, side: [[0.3, 1.5], [1.55, 3.0], [3.06, 4.5], [4.56, 5.4], [5.45, 6.65], [6.7, 8.1], [8.16, 9.6], [9.66, 11.0]], cpil: PAINT,
    pods: [[1.6, 5.0], [6.6, 10.4]],
    hl: [0.42, 0.6, 0.38, 0.25], tl: [0.5, 1.1, 0.12, 0.12], pl: [0.34, 0.5], gr: [0, 0, 0], seams: [0, 0, 0], fg: [0.95, 2.66], rg: [1.95, 2.7], rim: 0.56, mir: [0, 0, 0],
  },
  { ...SEDAN, taxi: 1 }, // 9 taxi
];
const MIX = [0.2, 0.13, 0.2, 0.07, 0.07, 0.08, 0.03, 0.04, 0.025, 0.06];     // how common each type is
const ARCH = 0.045;                                                           // arch radius over the tyre

const f3 = (x) => x.toFixed(3);
const table = (name, f) => `const vec4 ${name}[${TYPES.length}] = vec4[${TYPES.length}](${TYPES.map((T) => `vec4(${f(T).map(f3).join(", ")})`).join(", ")});`;
const TRUCK = TYPES[7];

export const GLSL = /* glsl */`
${table("CAR_HL", (T) => T.hl)}
${table("CAR_TL", (T) => T.tl)}
${table("CAR_PG", (T) => [...T.pl, T.gr[0], T.gr[1]])}
${table("CAR_DS", (T) => [...T.seams, T.W / 2])}
${table("CAR_FG", (T) => [...(T.fg || [0, 0]), ...(T.rg || [0, 0])])}
${table("CAR_AX", (T) => [T.fo, T.fo + T.wb, T.r + ARCH, T.clad || 0])}
${table("CAR_MS", (T) => [T.r - 0.01, T.rim, T.sill, T.gr[2]])}
${table("CAR_WS", (T) => [...(T.ws || [0, 0]), ...(T.rw || [0, 0])])}
// coverage of the region d < 0 (metres), antialiased over the pixel's footprint (set once, before any branching)
float carPx = .01;
float carCov(float d){ return clamp(.5 - d / carPx, 0., 1.); }
float carRect(vec2 q, vec2 c, vec2 h, float r){ vec2 e = abs(q - c) - h + r; return length(max(e, 0.)) + min(max(e.x, e.y), 0.) - r; }
// what the clear coat and the glass reflect: the road, a skyline of blocks and trees (higher along the ring, where
// the land curves up), the bright glazed vault overhead
vec3 carEnv(vec3 r, vec3 up, vec3 fw){
  float h = dot(r, up), along = dot(r, fw), az = atan(r.y, along);
  float sky = .08 + .12 * vnoise(vec2(az * 3.2, .5)) + .07 * vnoise(vec2(az * 11., 4.5)) + .3 * along * along;
  vec3 city = mix(vec3(.07, .1, .05), vec3(.4, .38, .34), smoothstep(.3, .8, vnoise(vec2(az * 7., h * 3.))));
  vec3 c = mix(vec3(.05, .05, .048), city, smoothstep(-.03, .02, h));
  return mix(c, mix(AIR * 1.2, vec3(1.3, 1.32, 1.34), smoothstep(.4, .95, h)), smoothstep(sky - .015, sky + .04, h));
}
// a believable paint mix: mostly white, black, greys and silver, some blue and red, a few others
vec3 carPaint(float s, float s2, out float metal){
  metal = 0.;
  if (s < .27) { metal = step(.65, s2) * .4; return s2 < .65 ? vec3(.8, .8, .78) : vec3(.72, .72, .7); }
  if (s < .43) { metal = step(.35, s2); return vec3(.017, .017, .019); }
  if (s < .53) { metal = 1.; return vec3(.07, .075, .08); }
  if (s < .61) { metal = step(.5, s2); return s2 < .5 ? vec3(.26, .27, .27) : vec3(.18, .19, .2); }
  if (s < .72) { metal = 1.; return vec3(.45, .46, .47); }
  if (s < .76) return vec3(.56, .58, .6);
  if (s < .81) { metal = 1.; return vec3(.012, .022, .07); }
  if (s < .855) { metal = 1.; return s2 < .5 ? vec3(.04, .12, .33) : vec3(.13, .25, .4); }
  if (s < .915) { metal = step(.6, s2); return s2 < .6 ? vec3(.45, .03, .025) : vec3(.2, .015, .02); }
  if (s < .95) { metal = step(.5, s2); return s2 < .5 ? vec3(.025, .075, .045) : vec3(.24, .28, .22); }
  if (s < .975) { metal = 1.; return s2 < .5 ? vec3(.36, .3, .22) : vec3(.18, .1, .055); }
  return s2 < .33 ? vec3(.78, .55, .04) : s2 < .66 ? vec3(.75, .22, .03) : vec3(.04, .32, .33);
}
// the asphalt (as the land shader draws it), darkened under the car and where the body blocks the light
void carShadow(inout Veh v, inout vec3 n, vec3 p, vec3 up, vec4 m, vec4 u, int t){
  // the patch floats a little over the land; follow the view ray down to the land's own mesh (rows across every
  // 2 SMAX / 84 m, flat between columns 1/1600 of the ring apart) so the asphalt lines up with it from any angle
  float th = atan(p.z, p.x), s = p.y, dr = 2. * SMAX / 84., dth = 6.2831853 / 1600.;
  float j = floor((s + SMAX) / dr), fm = mix(floorF(-SMAX + j * dr), floorF(-SMAX + (j + 1.) * dr), (s + SMAX) / dr - j);
  float rm = (RR + fm) * cos(dth * .5) / cos(th - (floor(th / dth) + .5) * dth);
  vec3 rd = normalize(p - uCamL);
  p += rd * (rm - length(p.xz)) / max(dot(rd, -up), .05);
  th = atan(p.z, p.x); s = p.y;
  float uu = th * RF;
  float bd = abs(abs(s - riverS(th)) - riverW(th) - 46.);
  vec2 g = vec2(uu, s);
  vec3 asph = vec3(.075, .075, .08) * (.85 + .3 * vnoise(g * 1.3));
  asph = mix(asph, vec3(.7, .66, .5), smoothstep(.12, .06, bd) * step(.5, fract(uu / 6.)));
  vec3 col = mix(vec3(.48, .45, .40) * (.9 + .2 * vnoise(g * .31)), asph, smoothstep(3.3, 3.1, bd));
  vec2 hb = u.yz - .04, o = vec2(-.5, .786) * u.w;
  float tp = t >= 5 ? .97 : .7;
  float contact = smoothstep(.1, -.3, carRect(m.xy, vec2(0.), hb, .3));
  float cst = 0.;
  for (int k = 1; k <= 5; k++) {
    float f = float(k) / 5., pen = .12 + .3 * f;
    cst = max(cst, smoothstep(pen, -pen, carRect(m.xy, o * f, hb * mix(1., tp, f * f), .3)));
  }
  float occ = max(.8 * cst, .93 * contact) * smoothstep(4.2, 3.8, bd);
  if (occ < .004) discard;                       // only where there is shadow: elsewhere the land shows itself
  v.alb = col * (1. - occ);
  n = normalize(up + vec3(0., -4. * FDIP * s * s * s / (SMAX * SMAX * SMAX * SMAX), 0.));
  v.spec = 0.;
}
// tyre sidewall and rim, the spokes turning with the car's speed and blurred by it
void carWheel(inout Veh v, inout vec3 n, vec3 up, vec3 fw, vec4 u, int t, float hs, vec3 env, float F){
  float dsg = sign(u.w), aw = abs(u.w), r = fract(aw), spd = floor(aw) * .1;
  vec2 q = u.yz / r;
  float rho = length(q), ang = atan(q.y, q.x) + uTime * spd / r, rim = CAR_MS[t].y;
  if (rho > rim) {
    v.alb = vec3(.026); v.spec = .06; v.gloss = 12.; v.ao = .85;
    vec3 rad = fw * (q.x * dsg) + up * q.y;
    n = normalize(n + rad / max(rho, .01) * smoothstep(rim + .06, 1., rho) * 1.8);
    v.ao *= smoothstep(rim - .01, rim + .05, rho) * .5 + .5;
    return;
  }
  float x = rho / rim;
  int st = t == 8 ? 4 : t >= 5 ? 3 : int(hs * 3.);
  float nsp = st == 1 ? 10. : st == 3 ? 8. : 5.;
  float sp = .5 + .5 * cos(ang * nsp);
  float spoke = smoothstep(.3, .62, sp);
  if (st == 2 || st == 4) spoke = 1. - (1. - smoothstep(.25, .1, abs(fract(ang * nsp / 6.2832) - .5) - .25)) * step(.62, x) * step(x, .85);  // aero disc, slots
  if (st == 3) spoke = 1. - step(.55, x) * step(x, .7) * smoothstep(.75, .9, sp);                                                         // steel, holes
  spoke = mix(spoke, .55, st < 2 ? .45 : .1);
  spoke = max(spoke, step(.88, x));              // the rim's lip
  vec3 rc = st == 0 ? vec3(.5, .51, .52) : st == 1 ? vec3(.09, .095, .1) : st == 2 ? vec3(.36, .37, .38) : st == 3 ? vec3(.03) : vec3(.55);
  rc = mix(rc, vec3(.03), step(x, .2) * step(.08, x) * float(st < 3));   // centre cap
  v.alb = mix(vec3(.01), rc, spoke);
  v.spec = .5 * spoke; v.gloss = 60.; v.ao = mix(.5, 1., spoke);
  v.emis = env * mix(F, .5, step(.2, rc.r)) * spoke * .8;
}
void vehCar(inout Veh v, inout vec3 n, vec3 p, vec3 V, vec4 m, vec4 u){
  carPx = max(length(fwidth(m.xyz)) * .8, 1e-4);
  float fine = smoothstep(.02, .008, carPx);                     // fine print fades out with distance instead of sparkling
  float kf = fract(m.w) * 16.;
  int t = int(kf), part = int(u.x + .5);
  float id = floor(fract(kf) * 1000.), sd = id / 1000.;        // the seed, quantised: m.w wobbles in its last bits across a triangle
  vec3 up = upAt(p), fw = normalize(vec3(-p.z, 0., p.x));
  if (part == ${SHADOW}) { carShadow(v, n, p, up, m, u, t); return; }
  if (!gl_FrontFacing) { v.alb = vec3(.006); v.ao = .25; return; }      // the inside of the shell: under the car, in the wheel wells
  float h1 = hash12(vec2(id, 3.1)), h2 = hash12(vec2(id, 8.7)), h3 = hash12(vec2(id * 1.3, 1.3)), h4 = hash12(vec2(id * .7, 5.9));
  float NdV = max(dot(n, V), 0.), F = .04 + .96 * pow(1. - NdV, 5.);
  vec3 env = carEnv(reflect(-V, n), up, fw);
  if (part == ${TREAD}) { v.alb = vec3(.022); v.spec = .04; v.gloss = 8.; v.ao = .7; return; }
  if (part == ${WHEEL}) { carWheel(v, n, up, fw, u, t, h4, env, F); return; }

  // the body and its parts: x toward the front, distances from the front and rear ends, the local normal
  float hl = abs(u.z), xf = u.y, dF = hl - xf, dR = hl + xf, z = m.z, ay = abs(m.y), belt = u.w, W2 = CAR_DS[t].w;
  vec3 nl = vec3(dot(n, fw) * sign(u.z), n.y, dot(n, up));
  float side = smoothstep(.45, .7, abs(nl.y)), front = smoothstep(.35, .6, nl.x), back = smoothstep(.35, .6, -nl.x);
  float metal;
  vec3 col = carPaint(h1, h2, metal);
  if (t == 9) { col = vec3(.74, .64, .3); metal = 0.; }                                       // taxis: light ivory
  if (t >= 5 && t <= 7 && h3 < .62) { col = vec3(.78, .78, .76); metal = 0.; }               // vans: mostly white
  if (t == 8) { col = z < .8 ? vec3(.03, .16, .07) : z < .88 ? vec3(.2, .45, .08) : vec3(.76, .77, .75); metal = 0.; }   // the city's green and white buses
  vec3 A = col, E = vec3(0.);
  float S = .3, G = 55., AO = mix(.55, 1., smoothstep(.12, .7, z)), clear = .9;
  if (part == ${ROOF} && t < 5 && h3 > .8) A = vec3(.015);                                    // a black roof
  if (part == ${MIRROR}) { if (h2 < .45) A = vec3(.02); float mg = back * float(t != 8); A = mix(A, vec3(.02), mg); clear = mix(clear, 4., mg); }   // the mirror glass faces back
  if (part == ${GLASS}) {
    A = t == 2 && dF > 2.7 ? vec3(.006) : vec3(.012, .014, .015); S = .7; G = 140.; clear = 1.; metal = 0.;
    vec4 WS = CAR_WS[t];
    float frit = step(.3, dot(n, up)) * step(dF, WS.y + .02) * max(carCov(dF - WS.x - .08), carCov(WS.y - .05 - dF));   // black frit round the windscreen, the wipers at its foot
    A = mix(A, vec3(.008), frit); clear *= 1. - .6 * frit;
  }
  if (part == ${TRIM}) { A = vec3(.016); S = .5; G = 80.; metal = 0.; }
  if (part == ${DARK}) { A = vec3(.03); S = .08; G = 16.; clear = .15; metal = 0.; }
  if (part == ${ALU}) { A = vec3(.42, .43, .44); S = .5; G = 40.; clear = .4; metal = 0.; }
  if (part == ${CARGO}) {                                                                      // the box: white or pale, a band of colour, ribs, corner posts, rear doors
    A = h4 < .55 ? vec3(.8, .8, .78) : h4 < .75 ? vec3(.6, .62, .62) : h4 < .88 ? vec3(.2, .36, .5) : vec3(.15, .35, .12);
    A = mix(A, h2 < .5 ? vec3(.06, .25, .1) : vec3(.5, .08, .04), step(h3, .5) * step(2., z) * step(z, 2.35) * side);
    float post = max(step(${f3(TRUCK.box[4] - 0.05)}, ay), max(step(${f3(TRUCK.box[3] - 0.05)}, z), step(z, ${f3(TRUCK.box[2] + 0.04)})));
    A = mix(A, vec3(.4), post * .8);
    A *= 1. - .25 * back * (carCov(ay - .006) + carCov(abs(ay - .55) - .012));
    A *= 1. - .08 * side * smoothstep(.6, 1., abs(sin(xf * 5.2)));
    S = .15; G = 30.; clear = .3; metal = 0.;
  }
  if (part == ${SIGN}) {                                                                       // the taxi sign, lit
    A = vec3(.7, .6, .2);
    float txt = step(.5, hash12(floor(vec2(m.y * 40., (z - belt) * 45.)))) * step(ay, .2) * step(abs(z - belt - .075), .035);
    E = vec3(2., 1.6, .5) * (1. - .85 * mix(.5, txt, fine)) * max(front, back);
    S = .3; G = 40.; clear = .5; metal = 0.;
  }
  A *= mix(1., .55, metal * (1. - NdV));                                                     // metallic flop: darker at grazing angles
  E += env * F * clear;

  if (part == ${PAINT} || part == ${DARK} || part == ${MIRROR} || part == ${CARGO}) {
    vec2 qy = vec2(ay, z);
    // glass set into the front and rear faces (vans, buses)
    vec4 fg = CAR_FG[t];
    float gc = max(front * step(.01, fg.y) * carCov(carRect(qy, vec2(0., (fg.x + fg.y) * .5), vec2(W2 - .12, (fg.y - fg.x) * .5), .08)),
                   back * step(.01, fg.w) * carCov(carRect(qy, vec2(0., (fg.z + fg.w) * .5), vec2(W2 - .14, (fg.w - fg.z) * .5), .06)));
    gc *= 1. - back * carCov(ay - .025) * float(t != 8);                                    // the van's two rear doors
    A *= 1. - .8 * back * carCov(ay - .005) * step(.01, fg.w) * float(t != 8) * step(CAR_MS[t].z + .1, z);
    // bus: two double doors, glazed to the floor
    if (t == 8) {
      float dd = min(abs(dF - .9), abs(dF - 6.05));
      float door = side * carCov(dd - .58) * step(.36, z) * step(z, 2.6);
      gc = max(gc, door * (1. - carCov(abs(dd) - .015)) * (1. - carCov(abs(z - 1.5) - .02)));
      float dest = front * carCov(carRect(qy, vec2(0., 2.79), vec2(.9, .09), .02));       // destination display: amber LED characters
      vec2 dc = vec2(m.y * 14., (z - 2.79) * 14.);
      float led = mix(.45, step(.4, hash12(floor(dc * 5.) + 3.)) * step(.25, fract(dc.x)), fine) * step(abs(dc.y), .9) * step(m.y, .55) * step(-.55, m.y);
      A = mix(A, vec3(.01), dest); E = mix(E, vec3(2.4, 1.1, .1) * led, dest);
    }
    A = mix(A, vec3(.012, .014, .015), gc); E = mix(E, env * F, gc); S = mix(S, .7, gc); G = mix(G, 140., gc);
    // head lights: lens, chrome reflectors, a running light along the top
    vec4 H = CAR_HL[t];
    if (dF < H.w + .05 && H.y > 0.) {
      float c = carCov(carRect(qy, vec2(W2 - H.z * .5 + .03, (H.x + H.y) * .5), vec2(H.z * .5, (H.y - H.x) * .5), .035)) * step(dF, H.w) * step(nl.z, .8);
      float refl = smoothstep(.06, .03, min(length(qy - vec2(W2 - H.z * .3, (H.x + H.y) * .5 - .01)), length(qy - vec2(W2 - H.z * .62, (H.x + H.y) * .5 - .01))));
      float drl = carCov(abs(z - H.y + .02) - .011) * step(W2 - H.z + .04, ay);
      if (h4 > .5) drl = max(drl, carCov(abs(ay - (W2 - H.z + .07)) - .011) * step(z, H.y - .02));   // an L-shaped light
      vec3 la = mix(vec3(.04), vec3(.6), refl);
      vec3 le = env * mix(F, .7, refl) + vec3(3., 2.95, 2.8) * drl;
      float ind = step(W2 - .07, ay) * step(h3, .07) * step(0., m.y * (h2 - .5)) * step(.5, fract(uTime * 1.5 + sd * 7.));
      le = mix(le, vec3(3., 1.3, .1), ind);
      A = mix(A, la, c); E = mix(E, le, c); S = mix(S, 1., c); G = mix(G, 200., c);
    }
    // a light bar across the nose on some
    if (t < 4 && h3 > .7) { float b = front * carCov(abs(z - H.y + .02) - .008) * step(dF, .3) * step(ay, W2 - H.z) * step(nl.z, .7); E = mix(E, vec3(2.6, 2.55, 2.4), b); A = mix(A, vec3(.05), b); }
    // tail lights: red lenses, running or braking, a bar across on some, indicators
    vec4 TL = CAR_TL[t];
    if (dR < TL.w + .05) {
      float sdl = carRect(qy, vec2(W2 - TL.z * .5 + .03, (TL.x + TL.y) * .5), vec2(TL.z * .5, (TL.y - TL.x) * .5), .03);
      float c = carCov(sdl) * step(dR, TL.w) * step(nl.z, .8);
      float bar = float(t < 4 && h1 > .55) * back * carCov(abs(z - TL.y + .03) - .012) * step(dR, .3);
      float rim = max(carCov(abs(sdl + .022) - .009), bar);                                  // the LED outline glows, the lens inside is darker
      c = max(c, bar);
      float brake = step(h2, .22);
      vec3 le = env * F + vec3(1., .02, .01) * mix(.55, 3.2, brake) * mix(.35, 1.3, rim);
      float ind = step(W2 - .1, ay) * step(h3, .07) * step(0., m.y * (h2 - .5)) * step(.5, fract(uTime * 1.5 + sd * 7.)) * step(z, (TL.x + TL.y) * .5);
      le = mix(le, vec3(3., 1.3, .1), ind);
      A = mix(A, vec3(.22, .01, .01), c); E = mix(E, le, c); S = mix(S, 1., c); G = mix(G, 200., c);
    }
    // grille or closed panel low in the front, a black lip under the bumpers
    vec4 PG = CAR_PG[t];
    float gr = front * step(dF, .4) * carCov(carRect(qy, vec2(0., (PG.z + PG.w) * .5), vec2(CAR_MS[t].w, (PG.w - PG.z) * .5), .05)) * step(.01, PG.w);
    float mesh = mix(.25, step(.5, fract(m.y * 18.)) * step(.5, fract(z * 18. + .5 * step(.5, fract(m.y * 9.)))), fine);
    A = mix(A, h2 > .5 ? vec3(.015) : vec3(.02 + .03 * mesh), gr); S = mix(S, h2 > .5 ? .5 : .1, gr);
    float bl = carCov(abs(z - mix(CAR_MS[t].z, dF < dR ? H.x : TL.x, .5)) - .004) * step(min(dF, dR), .45) * float(t < 7);   // where the bumpers meet the body
    A *= 1. - .8 * bl;
    float lip = step(min(dF, dR), .45) * step(z, CAR_MS[t].z + .02) * float(t != 8);
    A = mix(A, vec3(.025), lip); S = mix(S, .1, lip);
    // number plates: white, black characters, the blue band on the left
    for (int k = 0; k < 2; k++) {
      float pz = k == 0 ? PG.x : PG.y, fb = k == 0 ? front * step(dF, .5) : back * step(dR, .5);
      if (fb > 0. && pz > 0.) {
        vec2 pq = vec2(m.y, z - pz);
        float c = carCov(carRect(pq, vec2(0.), vec2(.26, .056), .01)) * fb;
        float lx = (k == 0 ? -1. : 1.) * sign(u.z) * m.y;                         // across the plate, from its left end
        float txt = step(.42, hash12(floor(vec2(lx * 26., pq.y * 36. + 7.)))) * step(abs(pq.y), .032) * step(-.18, lx) * step(lx, .23);
        vec3 pa = lx < -.215 ? vec3(.02, .05, .3) : vec3(.72, .72, .68) * (1. - .92 * mix(.3 * step(abs(pq.y), .032) * step(-.18, lx) * step(lx, .23), txt, fine));
        A = mix(A, pa, c); S = mix(S, .2, c);
      }
    }
    if (part == ${PAINT}) {
      vec4 DS = CAR_DS[t], AX = CAR_AX[t];
      float sill = CAR_MS[t].z, zc = CAR_MS[t].x;
      float arch = min(length(vec2(dF - AX.x, z - zc)), length(vec2(dF - AX.y, z - zc)));
      // door seams and handles, the belt moulding
      float panel = side * step(sill + .05, z) * step(z, belt - .012) * step(AX.z + .03, arch);
      float seam = max(max(carCov(abs(dF - DS.x) - .004) * step(.1, DS.x), carCov(abs(dF - DS.y) - .004) * step(.1, DS.y)), carCov(abs(dF - DS.z) - .004) * step(.1, DS.z));
      A *= 1. - .85 * seam * panel; S *= 1. - seam * panel;
      float hd = min(abs(dF - DS.y + .3), DS.z > .1 ? abs(dF - DS.z + .3) : 9.);
      float handle = side * carCov(carRect(vec2(hd, z), vec2(0., belt - .11), vec2(.09, .016), .012)) * step(.1, DS.y);
      A = mix(A, h2 > .6 ? vec3(.55) : A * .5, handle); E *= 1. + handle * step(.6, h2);
      float bm = side * carCov(abs(z - belt + .014) - .014) * step(DS.x, dF) * step(dF, max(DS.z, DS.y));
      A = mix(A, h4 > .7 && t < 5 ? vec3(.5) : vec3(.02), bm); S = mix(S, .6, bm);
      // SUVs: black cladding round the arches and along the sills
      if (AX.w > .5) {
        float cl = max(carCov(arch - AX.z - .075) * step(z, belt - .1), side * carCov(z - sill - .14));
        cl = max(cl, step(min(dF, dR), .5) * carCov(z - CAR_MS[t].z - .14));
        A = mix(A, vec3(.03) * (1. + .3 * (vnoise(m.xz * 30.) - .5) * fine), cl); S = mix(S, .05, cl); E *= 1. - .9 * cl;
      }
      AO *= mix(.45, 1., smoothstep(AX.z - .02, AX.z + .2, arch));
    }
  }
  // road dirt low on the body
  float dirt = smoothstep(.5, .12, z) * (.15 + .6 * h3) * fbm(m.xz * 6. + sd * 40.) * float(part != ${GLASS});
  A = mix(A, vec3(.11, .095, .08), dirt * .7); S *= 1. - dirt * .7; E *= 1. - dirt * .6;
  v.alb = A; v.emis = E; v.spec = S; v.gloss = G; v.ao = AO;
}
`;

// ---------------------------------------------------------------- geometry
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const prof = (keys, d) => {                         // piecewise linear through [d, z] keys
  if (d <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (d <= keys[i][0]) { const [d0, z0] = keys[i - 1], [d1, z1] = keys[i]; return z0 + (z1 - z0) * (d - d0) / (d1 - d0); }
  return keys[keys.length - 1][1];
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function Mesh() {
  const M = { pos: [], nrm: [], au: [], idx: [] };
  M.v = (p, n, u) => { M.pos.push(p[0], p[1], p[2]); M.nrm.push(n[0], n[1], n[2]); M.au.push(u[0], u[1], u[2], u[3]); return M.pos.length / 3 - 1; };
  // a triangle wound so that it faces along n
  M.tri = (a, b, c, n) => {
    const P = M.pos, pa = [P[3 * a], P[3 * a + 1], P[3 * a + 2]];
    const f = cross(sub([P[3 * b], P[3 * b + 1], P[3 * b + 2]], pa), sub([P[3 * c], P[3 * c + 1], P[3 * c + 2]], pa));
    if (dot(f, n) >= 0) M.idx.push(a, b, c); else M.idx.push(a, c, b);
  };
  // a flat-shaded quad (corners in order round it) facing along n
  M.quad = (p, n, u) => { const i = p.map((q) => M.v(q, n, u(q))); M.tri(i[0], i[1], i[2], n); M.tri(i[0], i[2], i[3], n); };
  M.box = (x0, x1, y0, y1, z0, z1, u) => {
    const c = (x, y, z) => [[x0, x1][x], [y0, y1][y], [z0, z1][z]];
    for (const [n, q] of [[[1, 0, 0], [c(1, 0, 0), c(1, 1, 0), c(1, 1, 1), c(1, 0, 1)]], [[-1, 0, 0], [c(0, 0, 0), c(0, 1, 0), c(0, 1, 1), c(0, 0, 1)]],
      [[0, 1, 0], [c(0, 1, 0), c(1, 1, 0), c(1, 1, 1), c(0, 1, 1)]], [[0, -1, 0], [c(0, 0, 0), c(1, 0, 0), c(1, 0, 1), c(0, 0, 1)]],
      [[0, 0, 1], [c(0, 0, 1), c(1, 0, 1), c(1, 1, 1), c(0, 1, 1)]], [[0, 0, -1], [c(0, 0, 0), c(1, 0, 0), c(1, 1, 0), c(0, 1, 0)]]]) M.quad(q, n, u);
  };
  return M;
}

// one cross section of a body d metres from its front: 13 points from the +y sill over the roof to the -y sill
const HN = 7, RN = 2 * HN - 1;
function section(T, d) {
  const LL = T.loftL || T.L, hl = T.L / 2, e = Math.min(d, LL - d), rc = d < LL / 2 ? T.rcF : T.rcR;
  let hw = T.W / 2 - rc + Math.sqrt(Math.max(0, rc * rc - Math.max(0, rc - e) ** 2));      // rounded corners in plan
  hw *= 1 - T.taper * Math.max(0, 1 - d / 1.5);                                          // a narrower nose
  const zt = prof(T.top, d), zbelt = Math.min(prof(T.belt, d), zt - 0.005);
  // the bottom edge: bumpers rise toward the ends, arches over the wheels
  let zb = d < 0.5 ? lerp(T.noseF, T.sill, d / 0.5) : LL - d < 0.5 ? lerp(T.noseR, T.sill, (LL - d) / 0.5) : T.sill;
  const ra = T.r + ARCH;
  for (const da of [T.fo, T.fo + T.wb]) { const q = d - da; if (Math.abs(q) < ra) zb = Math.max(zb, T.r - 0.01 + Math.sqrt(ra * ra - q * q)); }
  const zm = Math.min(Math.max(T.sill + 0.5 * (zbelt - T.sill), zb + 0.08), zbelt - 0.01);
  const k = smooth(0, 0.3, zt - zbelt);                                                  // how much greenhouse stands here
  const sh = 0.03, wt = lerp(hw - sh - 0.02, hw * T.roofW, k), ze = Math.max(zbelt + 0.002, zt - T.crown - 0.06 * k);
  const zg = Math.min(ze, zbelt + (T.gh || 9)), fg = ze > zbelt + 1e-3 ? (zg - zbelt) / (ze - zbelt) : 1;
  // sill, widest point, shoulder, top of the glass, top of the side, edge of the top, centre line
  const half = [
    [hw - 0.06, zb], [hw, zm], [hw - sh, zbelt], [lerp(hw - sh, wt, fg), zg], [wt, ze],
    [lerp(hw - 0.15, hw * T.roofW - 0.08, k), Math.max(ze + 0.002, zt - T.crown)], [0, zt],
  ];
  // the nose and tail lean back toward the top
  const rake = (z) => { const f = clamp01((z - zb) / Math.max(zt - zb, 0.1)) ** 2; return d < 0.45 ? -T.rkF * f * (1 - d / 0.45) : LL - d < 0.45 ? T.rkR * f * (1 - (LL - d) / 0.45) : 0; };
  const pts = [];
  for (let j = 0; j < RN; j++) { const [y, z] = half[j < HN ? j : RN - 1 - j]; pts.push([hl - d + rake(z), j < HN ? y : -y, z]); }
  return { pts, belt: zbelt, k };
}

// the body: stations along the length, sections, smooth normals, parts per quad, caps at both ends
function body(M, T) {
  const LL = T.loftL || T.L, hl = T.L / 2, ra = T.r + ARCH;
  const S = [0, 0.03, 0.09, 0.18, 0.3, 0.45, LL - 0.45, LL - 0.3, LL - 0.18, LL - 0.09, LL - 0.03, LL];
  for (const kk of [...T.top, ...T.belt]) S.push(kk[0]);
  for (const g of [T.ws, T.rw, ...T.side]) if (g) S.push(g[0], g[1]);
  for (const da of [T.fo, T.fo + T.wb]) if (da < LL - 0.1) for (let j = 0; j <= 5; j++) S.push(da - ra * Math.cos(j * Math.PI / 5));
  S.sort((a, b) => a - b);
  const D = [];
  for (const d of S) if (d >= 0 && d <= LL && (!D.length || d - D[D.length - 1] > 0.04)) D.push(d);
  if (D[D.length - 1] < LL) { if (LL - D[D.length - 1] < 0.04) D[D.length - 1] = LL; else D.push(LL); }
  for (let i = 1; i < D.length; i++) if (D[i] - D[i - 1] > 1.6) D.splice(i, 0, (D[i] + D[i - 1]) / 2);
  const sec = D.map((d) => section(T, d)), P = sec.map((s) => s.pts), NI = D.length;
  // smooth normals from the grid (skipping coincident points round the section); along the widest point of the side
  // a crease, so the normals there come from one side (h = -1 below, 1 above)
  const HARD = new Set([1, RN - 2]);
  const nrm = (i, j, h = 0) => {
    const ring = P[i], p = ring[j], dI = sub(P[Math.min(i + 1, NI - 1)][j], P[Math.max(i - 1, 0)][j]);
    let jp = j, jm = j;
    if (h >= 0) while (jp < RN - 1 && Math.hypot(...sub(ring[jp], p)) < 1e-4) jp++;
    if (h <= 0) while (jm > 0 && Math.hypot(...sub(ring[jm], p)) < 1e-4) jm--;
    if (jp === jm) { jp = Math.min(j + 1, RN - 1); jm = Math.max(j - 1, 0); }
    return norm(cross(dI, sub(ring[jp], ring[jm])));
  };
  // rows round the section: 0 lower side, 1 upper side, 2 side glass, 3 panel over the glass, 4 roof edge, 5 top
  const inR = (g, d) => g && d > g[0] && d < g[1];
  const partOf = (i, j) => {
    const d = (D[i] + D[i + 1]) / 2, row = j < HN - 1 ? j : RN - 2 - j, gh = Math.min(sec[i].k, sec[i + 1].k) > 0.05;
    if (row === 2) {
      if (T.side.some((g) => inR(g, d))) return GLASS;
      if (!gh) return PAINT;
      return d > T.side[0][0] && d < T.side[T.side.length - 1][1] ? TRIM : T.cpil;
    }
    const roof = d > (T.ws ? T.ws[1] : 0.3) && d < (T.rw ? T.rw[0] : LL - 0.05);
    if (row === 5) return inR(T.ws, d) || inR(T.rw, d) ? GLASS : roof ? ROOF : PAINT;
    if (row === 4) return roof ? ROOF : PAINT;
    return PAINT;
  };
  // smooth parts share their vertices; glass is flat
  const shared = new Map();
  const vert = (ii, jj, part, h) => {
    if (!HARD.has(jj)) h = 0;
    const key = ((ii * 64 + jj) * 3 + h + 1) * 16 + part;
    if (!shared.has(key)) { const q = P[ii][jj]; shared.set(key, M.v(q, nrm(ii, jj, h), [part, q[0], hl, sec[ii].belt])); }
    return shared.get(key);
  };
  for (let i = 0; i < NI - 1; i++) for (let j = 0; j < RN - 1; j++) {
    const a = P[i][j], b = P[i + 1][j], c = P[i + 1][j + 1], d = P[i][j + 1];
    const fn = cross(sub(c, a), sub(d, b));
    if (Math.hypot(...fn) < 2e-5) continue;
    const part = partOf(i, j), corners = [[i, j, 1], [i + 1, j, 1], [i + 1, j + 1, -1], [i, j + 1, -1]];
    const id = part === GLASS ? corners.map(([ii, jj]) => M.v(P[ii][jj], norm(fn), [part, P[ii][jj][0], hl, sec[ii].belt])) : corners.map(([ii, jj, h]) => vert(ii, jj, part, h));
    M.tri(id[0], id[1], id[2], fn); M.tri(id[0], id[2], id[3], fn);
  }
  // end caps: a fan round each end section
  for (const [i, dir] of [[0, 1], [NI - 1, -1]]) {
    const ring = P[i], c = ring.reduce((s, q) => [s[0] + q[0] / RN, s[1] + q[1] / RN, s[2] + q[2] / RN], [0, 0, 0]), n = [dir, 0, 0];
    const u = (q) => [PAINT, q[0], hl, sec[i].belt], ic = M.v(c, n, u(c));
    const ids = ring.map((q, j) => M.v(q, norm(nrm(i, j).map((x, k) => x + n[k] * 1.2)), u(q)));      // rounded into the sides
    for (let j = 0; j < RN; j++) { const a = ids[j], b = ids[(j + 1) % RN]; if (Math.hypot(...sub(ring[j], ring[(j + 1) % RN])) > 1e-4) M.tri(ic, a, b, n); }
  }
  return { D, sec };
}

// a wheel: tread round, the outer face a disc the shader turns into sidewall and rim
function wheel(M, T, x, side, spd) {
  const n = T.r > 0.45 ? 14 : 12, r = T.r, zc = r - 0.01, yo = side * (T.W / 2 - 0.025), yi = yo - side * T.tw;
  const ring = [], pack = Math.round(spd * 10) + r;
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; ring.push([Math.cos(a), Math.sin(a)]); }
  const ro = ring.map(([c, s]) => M.v([x + r * c, yo, zc + r * s], [c, 0, s], [TREAD, 0, 0, 0]));
  const ri = ring.map(([c, s]) => M.v([x + r * c, yi, zc + r * s], [c, 0, s], [TREAD, 0, 0, 0]));
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n, fn = [ring[k][0] + ring[k1][0], 0, ring[k][1] + ring[k1][1]];
    M.tri(ro[k], ro[k1], ri[k1], fn); M.tri(ro[k], ri[k1], ri[k], fn);
  }
  const fn = [0, side, 0], ic = M.v([x, yo, zc], fn, [WHEEL, 0, 0, pack]);
  const ids = ring.map(([c, s]) => M.v([x + r * c, yo, zc + r * s], fn, [WHEEL, r * c, r * s, pack]));
  for (let k = 0; k < n; k++) M.tri(ic, ids[k], ids[(k + 1) % n], fn);
}

// one vehicle of type T (forward: front toward +x), mirrored when it drives toward -x, with its shadow
function vehicle(THREE, T, dir, spd, rails) {
  const M = Mesh(), hl = T.L / 2;
  const { D, sec } = body(M, T);
  const beltAt = (d) => sec[Math.max(0, D.findIndex((x) => x >= d))].belt;
  const zt = (d) => prof(T.top, d), X = (d) => hl - d;
  for (const side of [-1, 1]) for (const da of [T.fo, T.fo + T.wb]) wheel(M, T, X(da), side, spd);
  // mirrors, just behind the base of the windscreen
  if (T.mir[0] > 0) {
    const d0 = (T.ws ? T.ws[0] : 0.9) + 0.08, b = beltAt(d0), [ml, mo, mh] = T.mir, u = (q) => [MIRROR, q[0], hl, 0];
    for (const s of [-1, 1]) {
      const yb = T.W / 2 - 0.04, yo = yb + 0.04 + mo, z0 = b + 0.03;
      M.box(X(d0 + ml), X(d0), Math.min(s * yb, s * yo), Math.max(s * yb, s * yo), z0, z0 + mh, u);
    }
  }
  // roof rails: a bar a side on two feet
  if (rails) {
    const a = T.ws[1] + 0.1, e = T.rw[0] - 0.04, yr = T.W / 2 * T.roofW - 0.07, part = rails > 1 ? ALU : TRIM, u = (q) => [part, q[0], hl, 0];
    const zr = Math.max(zt(a), zt(e)) + 0.04;
    for (const s of [-1, 1]) {
      M.box(X(e), X(a), s * yr - 0.018, s * yr + 0.018, zr, zr + 0.035, u);
      for (const d of [a, e]) M.box(X(d + 0.08), X(d), s * yr - 0.022, s * yr + 0.022, zt(d) - 0.03, zr + 0.01, u);
    }
  }
  // the taxi sign
  if (T.taxi) { const d = (T.ws[1] + T.rw[0]) / 2 - 0.1, z0 = zt(d) - 0.01; M.box(X(d + 0.14), X(d - 0.14), -0.3, 0.3, z0, z0 + 0.15, (q) => [SIGN, q[0], hl, z0]); }
  // the truck's box on its chassis, a light bar at the back
  if (T.box) {
    const [d0, d1, z0, z1, hw] = T.box;
    M.box(X(d1), X(d0), -hw, hw, z0, z1, (q) => [CARGO, q[0], hl, 0]);
    M.box(X(d1 - 0.25), X(T.loftL - 0.3), -0.45, 0.45, 0.55, z0, (q) => [DARK, q[0], hl, 0]);
    M.box(X(d1), X(d1 - 0.12), -T.W / 2 + 0.02, T.W / 2 - 0.02, 0.76, 1.0, (q) => [DARK, q[0], hl, 0]);
    for (const s of [-1, 1]) M.box(X(T.fo + T.wb - 0.5), X(T.loftL + 0.1), s * (T.W / 2 - 0.06) - 0.03, s * (T.W / 2 - 0.06) + 0.03, 0.45, 0.62, (q) => [DARK, q[0], hl, 0]);
  }
  // the bus's battery pods
  if (T.pods) for (const [d0, d1] of T.pods) M.box(X(d1), X(d0), -0.95, 0.95, 2.95, 3.18, (q) => [ALU, q[0], hl, 0]);
  // mirrored for the other direction: x and the normals flipped, triangles rewound, the direction in aU
  if (dir < 0) {
    for (let i = 0; i < M.pos.length; i += 3) { M.pos[i] = -M.pos[i]; M.nrm[i] = -M.nrm[i]; }
    for (let i = 0; i < M.au.length; i += 4) { if (M.au[i] === WHEEL) M.au[i + 3] = -M.au[i + 3]; else if (M.au[i] !== TREAD) M.au[i + 2] = -M.au[i + 2]; }
    for (let i = 0; i < M.idx.length; i += 3) { const t = M.idx[i + 1]; M.idx[i + 1] = M.idx[i + 2]; M.idx[i + 2] = t; }
  }
  // the shadow patch, in the ring's frame: the footprint and its cast away from the light (SHADOW_DIR in torus3d.js)
  const hw = T.W / 2, H = (T.box ? T.box[3] : T.pods ? 3.1 : T.H) * 0.8, ox = -0.5 * H, oy = 0.786 * H, m = 0.5;
  M.quad([[Math.min(-hl, -hl + ox) - m, -hw - m, 0.02], [Math.max(hl, hl + ox) + m, -hw - m, 0.02], [Math.max(hl, hl + ox) + m, hw + oy + m, 0.02], [Math.min(-hl, -hl + ox) - m, hw + oy + m, 0.02]],
    [0, 0, 1], () => [SHADOW, hl, hw, H]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(M.pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(M.nrm, 3));
  g.setAttribute("aU", new THREE.Float32BufferAttribute(M.au, 4));
  g.setIndex(M.idx);
  return g;
}

export function build(api) {
  const { THREE, rng, CIRC, RF, BLVD } = api;
  const Cr = rng(4242);
  const cache = new Map();
  const total = MIX.reduce((a, b) => a + b, 0);
  const pick = () => { let x = Cr() * total; for (let i = 0; i < MIX.length; i++) if ((x -= MIX[i]) < 0) return i; return 0; };
  let count = 0;
  // four lanes, each at its own speed, so gaps hold: platoons of a few cars at 1-2 s headway, long gaps between
  const lanes = [[-1, true, 10.6], [-1, false, 11.8], [1, true, 9.4], [1, false, 12.4]];
  lanes.forEach(([side, inner, speed], li) => {
    const e = BLVD + (inner ? -1.6 : 1.6), dir = inner ? side : -side;
    let u = Cr() * 40;
    const end = CIRC - 40 + u;
    while (u < end) {
      const n = 1 + Math.floor(Cr() ** 1.6 * 6);
      for (let k = 0; k < n && u < end; k++) {
        const t = pick(), T = TYPES[t];
        const rails = T.rails && Cr() < T.rails ? (Cr() < 0.5 ? 2 : 1) : 0;
        const key = `${t}/${li}/${rails}`;
        if (!cache.has(key)) cache.set(key, vehicle(THREE, T, dir, speed, rails));
        const c = u + T.L / 2;
        const v = [c / RF, dir * speed, side * (e + 2 + (Cr() - 0.5) * 0.3), 3 + (t + (Math.floor(Cr() * 997) + 0.5) / 1000) / 16];
        api.add(cache.get(key), v);
        u += T.L + speed * (0.9 + Cr() * 1.3) + 2;
        count++;
      }
      u += 16 + Cr() ** 1.7 * 95;
    }
  });
  return { count };
}
