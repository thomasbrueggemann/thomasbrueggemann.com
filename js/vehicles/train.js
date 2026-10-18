// The monorail of the Torus scene: a straddle-beam line over the river all round the ring, and its trains.
// The guideway is a pre-stressed concrete beam each way (running surface on top, guide and stabiliser faces on the
// sides, a power rail on each side), in spans of ~40 m resting on elastomeric bearings on hammerhead piers that stand
// in the river, with an emergency walkway hung between the beams. Five stations (side platforms under planted canopies,
// a footbridge, a lift and stairs down to the quay) stand where the river is wide. The trains are seven cars with
// streamlined cabs at both ends, a wraparound window band, plug doors, gangways, skirts over the bogies and a livery
// per train; their lit interiors (seats, passengers) are drawn behind the glass, the headlights lead and the tail
// lights trail. The track's shader knows where every train is, so the beams lie in their shadow as they pass.
// Kind 0.x is the track and stations, 1.x the trains (the fraction is the train's seed).
// Contract (shared by every ring vehicle module, see "ring vehicles" in ../torus3d.js):
//   build(api) adds geometry with api.add(geometry, v) / api.box(...) and returns { count }.
//   GLSL defines vehTrack(...) for kind 0.x and vehTrain(...) for kind 1.x, both
//   (inout Veh v, inout vec3 n, vec3 p, vec3 V, vec4 m, vec4 u).
// Vehicle coordinates are metres: x along the ring (direction of travel for speed > 0), y across (0 = the river's
// centre line, lateral 0), z up from the water.

const SPANS = 152;                                        // piers round the ring: spans of ~39.9 m
const BC = 2.4, BHW = 0.4, BTOP = 12.6, BBOT = 10.7;      // a beam each way: centre across, half width, top, bottom
const NCAR = 7, PITCH = 17, CARL = 16.2, NL = 3.6;        // cars per train, car pitch, body length, nose length
const TBOT = 11.5;                                        // the skirts' lower edge
const PER = 5, SPEED = 23, OFF = [0.27, 0.1];             // trains each way, m/s, where the first starts (turns) on the - / + track
const STATIONS = [0.29, 1.37, 2.62, 3.88, 5.13], ST_HL = 64; // station centres (angle; the river is wide there), half length
const ROOF = 16.95;                                       // the station roofs' underside
const TLEN = NCAR * PITCH;

export const GLSL = /* glsl */`
const float MR_CIRC = 6.2831853 * RF, MR_SPAN = MR_CIRC / ${SPANS}.;
const float MR_OFF[2] = float[2](${OFF[0]}, ${OFF[1]});
const float MR_ST[${STATIONS.length}] = float[${STATIONS.length}](${STATIONS.map((t) => `${t} * RF`).join(", ")});
// a span [a, b] of x, antialiased over the footprint f
float mrSpan(float x, float a, float b, float f){ f = max(f, 1e-4); return clamp((x - a) / f + .5, 0., 1.) * clamp((b - x) / f + .5, 0., 1.); }
float mrRect(vec2 q, vec2 h, vec2 f){ vec2 c = clamp((h - abs(q)) / max(f, vec2(1e-4)) + .5, 0., 1.); return c.x * c.y; }
// lines of width 2w every P, box-filtered over the footprint f: crisp close up, their mean coverage far off
float mrLineI(float s, float d){ return floor(s) * d + clamp(fract(s) - .5 + d * .5, 0., d); }
float mrLines(float x, float P, float w, float f){
  float d = min(2. * w / P, 1.), s = x / P + .5, h = max(f / P, 1e-4) * .5;
  return (mrLineI(s + h, d) - mrLineI(s - h, d)) / (2. * h);
}
// shadows: the light falls from overhead, a little from -y and +x (see lightAt), so what shades a point at height z
// lies dz higher and (+.5, -.786) per metre of dz away (SHADOW_DIR); soft-edged with the distance
float mrRoofShade(vec3 q){
  float dz = ${ROOF} - q.z; if (dz < 0.) return 0.;
  vec2 o = q.xy + vec2(.5, -.786) * dz;
  float s = 0.;
  for (int i = 0; i < ${STATIONS.length}; i++) s = max(s, smoothstep(${ST_HL + 1.5} + .2 * dz, ${ST_HL + 0.3}, abs(mod(o.x - MR_ST[i] + MR_CIRC * .5, MR_CIRC) - MR_CIRC * .5)));
  float ay = abs(o.y);
  return s * smoothstep(7.9 + .15 * dz, 7.6, ay) * smoothstep(3.5 - .15 * dz, 3.8, ay);
}
float mrTrainShade(vec3 q){
  float s = 0., dz = max(${TBOT} - q.z, 0.);
  vec2 o = q.xy + vec2(.5, -.786) * dz;
  for (int k = 0; k < 2; k++){
    float dir = float(k) * 2. - 1.;
    float ph = mod(o.x - MR_OFF[k] * MR_CIRC - dir * ${SPEED}. * uTime, MR_CIRC / ${PER}.);
    float lx = smoothstep(-.4 - .12 * dz, .4, ph) * smoothstep(${TLEN}.4 + .12 * dz, ${TLEN - 1}.6, ph);
    float gap = smoothstep(.5 + .1 * dz, .2, abs((fract(ph / ${PITCH}. + .5) - .5) * ${PITCH}.));
    float ly = smoothstep(1.5 + .15 * dz, 1.2, abs(o.y - dir * ${BC}));
    s = max(s, lx * ly * (1. - .8 * gap));
  }
  return s;
}
// take the direct light away from a shaded point (the sky's light stays)
void mrShadow(inout Veh v, vec3 n, vec3 p, float sh){
  v.emis -= v.alb * LCOL * max(dot(normalize(n), lightAt(p)), 0.) * mix(.55, 1., v.ao) * sh * .85;
  v.spec *= 1. - .8 * sh; v.ao *= 1. - .3 * sh;
}
// glass: the bright vault (and the dark city below the horizon) reflected over what lies behind it
void mrGlass(inout Veh v, vec3 n, vec3 V, vec3 up, vec3 behind, float k){
  vec3 r = reflect(-V, n);
  float fr = .07 + .93 * pow(1. - abs(dot(n, V)), 5.);
  vec3 env = mix(vec3(.03, .04, .035), AIR * 1.2, smoothstep(-.25, .5, dot(r, up)));
  v.alb = mix(v.alb, vec3(.01), k); v.spec = mix(v.spec, .35, k); v.gloss = mix(v.gloss, 500., k);
  v.emis += mix(behind, env, fr) * k;
}
vec3 mrConcrete(vec2 g, float tone){
  float a = fbm(g * .35), b = vnoise(g * vec2(.06, .5) + 3.);
  return vec3(.52, .51, .485) * (.8 + .24 * a + .07 * vnoise(g * 3.1)) * (.92 + .1 * b) * tone;
}

void vehTrack(inout Veh v, inout vec3 n, vec3 p, vec3 V, vec4 m, vec4 u){
  float part = floor(u.x + .5);
  vec3 q = m.xyz, F = fwidth(q);
  vec3 up = upAt(p), fw = vec3(up.z, 0., -up.x);
  vec3 nl = vec3(dot(n, fw), n.y, dot(n, up));        // the normal in vehicle coordinates
  float pier = floor(q.x / MR_SPAN + .5), px = q.x - pier * MR_SPAN;   // the nearest pier, and the offset from it
  float sh = max(mrTrainShade(q), mrRoofShade(q));
  vec3 col = vec3(.5);
  bool glass = false;
  v.gloss = 20.;
  if (part < .5) {
    // the guideway beam: smooth pre-stressed concrete, a span per beam
    float sd = sign(q.y), ly = q.y - sd * ${BC}, span = floor(q.x / MR_SPAN), j = abs(px);
    float tone = .93 + .12 * hash12(vec2(span, sd));
    bool top = nl.z > .7, bot = nl.z < -.7;
    col = mrConcrete(top || bot ? vec2(q.x, ly * 3.) : vec2(q.x, q.z), tone);
    if (abs(nl.x) > .7) col *= .35;                                    // the beam ends, in the joint
    else if (top) {
      // the running surface: worn darker and smoother where the load tyres run, with rubber marks
      float tyre = smoothstep(.37, .3, abs(ly));
      col *= .8 - .2 * tyre * (.6 + .4 * vnoise(vec2(q.x * .12, ly * 22.)));
      v.spec = .05 + .1 * tyre; v.gloss = 25.;
      // expansion joint over each pier: a steel finger plate across the gap
      float plate = mrSpan(j, -1., .32, F.x);
      float teeth = mrLines(ly, .09, .022, F.y) * mrSpan(j, -1., .1, F.x);
      col = mix(col, vec3(.30, .31, .32) * (1. - .6 * teeth), plate);
      v.spec = mix(v.spec, .45, plate); v.gloss = mix(v.gloss, 60., plate);
    } else if (bot) {
      col *= .8;
    } else {
      // the sides: polished bands where the guide and stabiliser tyres bear, stains running down from the top
      // edge and heavier ones at the joints
      col *= 1. - .16 * mrSpan(q.z, 12.18, 12.48, F.z) - .1 * mrSpan(q.z, 11.56, 11.8, F.z);
      float streak = pow(vnoise(vec2(q.x * 1.9, q.z * .2 + span)), 2.5) * smoothstep(10.6, 12.6, q.z);
      float joint = smoothstep(2.2, .1, j) * (.5 + .5 * vnoise(vec2(q.x * 5., q.z * .6)));
      col *= 1. - .22 * streak - .35 * joint;
      col = mix(col, vec3(.16, .2, .1), .25 * joint * smoothstep(11.8, 10.7, q.z));
      v.ao = mix(.75, 1., smoothstep(10.7, 11.8, q.z));
    }
  } else if (part < 1.5) {
    // the piers: board-marked concrete with lift joints and tie holes, wet and green at the waterline,
    // drip stains below the hammerhead, moss on the top, and ivy climbing some of them
    float seed = hash12(vec2(pier, 7.));
    float h = abs(nl.x) > abs(nl.y) ? q.y : px;                    // across the face
    vec2 g = vec2(h, q.z);
    col = mrConcrete(g * vec2(1., .7) + seed * 40., .9 + .1 * seed) * vec3(1., .99, .97);
    float fh = F.z + abs(F.x) + abs(F.y);
    col *= 1. - .18 * mrLines(q.z, 1.25, .012, F.z) - .25 * mrLines(h, .6, .018, fh) * mrLines(q.z, .625, .018, F.z);
    col *= 1. - .1 * mrLines(h + seed, 1.22, .008, fh);
    float drip = pow(vnoise(vec2(h * 3.3, q.z * .1 + seed * 9.)), 3.) * smoothstep(1., 9.6, q.z) * step(q.z, 9.7);
    col *= 1. - .3 * drip;
    float wet = smoothstep(.55, .1, q.z + .2 * vnoise(g * 2.));
    float alg = smoothstep(1.4, .3, q.z + .6 * fbm(g * 1.3)) * (1. - wet * .5);
    col = mix(col, vec3(.16, .2, .09) * (.7 + .5 * vnoise(g * 4.)), alg * .8);
    col *= 1. - .55 * wet;
    v.ao = mix(.6, 1., smoothstep(0., 4., q.z));
    if (nl.z > .7) {                                                 // the hammerhead's top: moss and grime, shaded under the beams
      float moss = smoothstep(.45, .7, fbm(q.xy * 1.7 + seed * 20.));
      col = mix(col * .8, vec3(.09, .16, .04) * (.7 + .6 * vnoise(q.xy * 9.)), moss);
      v.ao *= 1. - .55 * smoothstep(.55, .35, abs(abs(q.y) - ${BC}));
    }
    if (seed > .55 && u.y < .5) {                                   // (u.y: a station's column, kept clean)
      float ivyH = 2.5 + 7. * fract(seed * 13.7);
      float cov = smoothstep(.0, .1, fbm(g * vec2(1.1, .5) + seed * 31.) - .62 + .35 * (1. - q.z / ivyH));
      cov *= step(q.z, 9.5) * step(nl.z, .7);
      vec3 leaf = vec3(.05, .13, .03) * (.55 + .9 * mix(vnoise(g * 7.), .5, smoothstep(.02, .1, fh))) + vec3(.04, .04, 0.) * vnoise(g * 2.3);
      col = mix(col, leaf, cov);
      n += cov * .45 * (fw * (vnoise(g * 6.) - .5) + vec3(0., 1., 0.) * (vnoise(g * 6. + 9.) - .5));
      v.ao *= 1. - .25 * cov;
    }
  } else if (part < 2.5) {
    // the power rails: steel conductors on insulated brackets every 2.5 m, the contact face bright
    col = vec3(.34, .35, .37);
    col = mix(col, vec3(.55, .5, .35), mrLines(q.x, 2.5, .07, F.x));
    if (abs(nl.y) > .7) { col = mix(col, vec3(.6, .6, .62), .7); v.spec = .8; v.gloss = 90.; } else v.spec = .4;
  } else if (part < 3.5) {
    // bearings: laminated elastomer between steel plates
    col = mix(vec3(.05), vec3(.32, .33, .35), max(mrLines(q.z - 10.45, .08, .012, F.z), step(10.64, q.z) + step(q.z, 10.5)));
    v.spec = .2;
  } else if (part < 4.5) {
    // the walkway's open steel grating, with a yellow edge
    float bars = 1. - (1. - mrLines(q.x, .1, .012, F.x)) * (1. - mrLines(q.y, .033, .006, F.y));
    bars = mix(bars, .55, smoothstep(.004, .02, F.x + F.y));          // far off, just the mean
    col = mix(vec3(.05, .055, .05), vec3(.44, .45, .45), nl.z > .5 ? bars : 1.);
    col = mix(col, vec3(.6, .48, .1), (nl.z > .5 ? 1. : 0.) * smoothstep(.62, .64, abs(q.y)));
    v.spec = .25;
  } else if (part < 5.5) {
    col = vec3(.40, .41, .42) * (.85 + .3 * vnoise(q.xz * 3.));       // galvanised steel
    v.spec = .35; v.gloss = 40.;
  } else if (part < 6.5) {
    // platforms: paving with a white edge line and a yellow tactile strip; concrete below
    col = mrConcrete(q.xy * 2., .95);
    if (nl.z > .7) {
      float ay = abs(q.y);
      col = vec3(.50, .49, .46) * (.9 + .15 * hash12(floor(q.xy / .6))) * (1. - .25 * mrLines(q.x, .6, .006, F.x) - .25 * mrLines(q.y, .6, .006, F.y));
      col = mix(col, vec3(.78, .6, .08), mrSpan(ay, 4.12, 4.62, F.y));
      col = mix(col, vec3(.85), mrSpan(ay, 3.98, 4.06, F.y));
      v.spec = .1;
    }
  } else if (part < 7.5) {
    // the canopy's top: a strip of solar panels, sedum and grasses, a gravel margin
    float ay = abs(q.y), fq = F.x + F.y;
    col = mix(vec3(.10, .17, .04), vec3(.22, .21, .07), fbm(q.xy * .3)) * (.8 + .4 * mix(vnoise(q.xy * 1.7), .5, smoothstep(.05, .3, fq)));
    float pv = mrSpan(ay, 4.25, 6.05, F.y) * mrSpan(mod(q.x, 8.), .3, 7.7, F.x);
    float cells = max(mrLines(q.x, 1., .02, F.x), mrLines(ay - 4.25, .9, .02, F.y));
    col = mix(col, mix(vec3(.03, .05, .12), vec3(.35), cells * .6), pv);
    v.spec = .5 * pv; v.gloss = 120.;
    col = mix(col, vec3(.42, .40, .36), max(mrSpan(ay, 0., 4.05, F.y), mrSpan(ay, 7.45, 9., F.y)));
  } else if (part < 8.5) {
    // the roof's underside and fascia: white panels, with light lines over the platforms
    col = vec3(.70, .71, .70) * (1. - .2 * mrLines(q.x, 1.2, .01, F.x));
    if (nl.z < -.5) v.emis += vec3(2.6, 2.4, 2.1) * mrSpan(abs(q.y), 5.5, 5.65, F.y) * mrSpan(mod(q.x, 6.), .4, 5.6, F.x) + col * vec3(.5, .48, .42);
  } else if (part < 9.5) {
    col = vec3(.17, .21, .19); v.spec = .3; v.gloss = 35.;           // painted steel
  } else if (part < 10.5) {
    // railings: a handrail (its top at u.y + u.z * (x - u.w)), posts, three wires and a kicking plate; the rest is open
    float hz = u.y + u.z * (q.x - u.w) - q.z, r = abs(nl.x) > .5 ? q.y : q.x;
    float c = max(max(mrSpan(hz, -1., .06, F.z), mrSpan(hz, .97, 9., F.z)), mrLines(r, 1.4, .025, abs(nl.x) > .5 ? F.y : F.x));
    c = max(c, mrLines(hz - .1, .27, .008, F.z) * step(hz, .9));
    if (c < .5) discard;
    col = vec3(.30, .32, .33); v.spec = .5;
  } else if (part < 11.5) {
    // stairs: concrete treads with dark nosings, steel stringers
    col = nl.z > .5 ? mrConcrete(q.xy * 2., 1.) * (1. - .6 * smoothstep(.05, .02, (1. - fract((q.x - u.z) / u.y)) * u.y)) : vec3(.17, .21, .19);
  } else if (part < 12.5) {
    // the lift shaft: glass in a steel frame, and inside it the lit car going up and down (u.z: a phase)
    float fr = max(max(mrLines(q.x, 1.3, .045, F.x), mrLines(q.y, 1.3, .045, F.y)), mrLines(q.z, 3.1, .07, F.z));
    if (abs(nl.z) > .5) fr = 1.;
    float zc = 6.6 - 6.6 * cos(uTime * .11 + u.z * 2.3), inCar = mrSpan(q.z, zc + .1, zc + 2.5, F.z);
    vec3 behind = mix(vec3(.025, .03, .03), vec3(.75, .72, .64) * .6, inCar) * (1. - .6 * mrSpan(q.z, zc + 1., zc + 2.1, F.z) * step(.5, fract(q.x * 1.7 + q.y * 1.7)));
    v.alb = vec3(.1, .12, .11); v.spec = .3;
    mrGlass(v, n, V, up, behind, 1. - fr);
    glass = true;
  } else if (part < 13.5) {
    // people waiting on the platforms: legs, a coat or shirt, a head (u.z), each their own colours (u.y)
    float s = floor(u.y * 256.) / 256. + .001;
    vec3 cl = s < .25 ? vec3(.08, .1, .16) : s < .45 ? vec3(.3, .3, .32) : s < .6 ? vec3(.5, .12, .08) : s < .75 ? vec3(.12, .25, .14) : s < .9 ? vec3(.62, .55, .42) : vec3(.7, .7, .68);
    vec3 skin = mix(vec3(.55, .38, .26), vec3(.2, .12, .07), fract(s * 7.3));
    vec3 legs = fract(s * 5.1) < .6 ? vec3(.05, .06, .08) : vec3(.25, .22, .18);
    col = u.z > 1.5 ? mix(skin, vec3(.06, .04, .03), step(.4, fract(s * 3.1)) * .8) : u.z > .5 ? cl : legs;
  } else {
    // signs: a dark blue board with a lit line of white lettering
    col = vec3(.02, .05, .14);
    if (abs(nl.y) > .7) {
      float cx = floor(q.x / .16), on = step(.35, hash12(vec2(cx, floor(q.x)))) * mrSpan(fract(q.x / .16), .15, .85, F.x / .16);
      float glyph = mrSpan(q.z, 16.08, 16.25, F.z) * mix(on * step(.4, hash12(floor(vec2(q.x / .04, q.z / .04)))), .3, smoothstep(.01, .04, F.x));
      v.emis += vec3(2.2) * glyph;
    }
  }
  if (!glass) v.alb = col;
  mrShadow(v, n, p, sh);
}

// ---- trains
vec3 mrLivery(float s){
  float k = floor(s * 5.);
  return k < .5 ? vec3(.0, .34, .30) : k < 1.5 ? vec3(.78, .33, .04) : k < 2.5 ? vec3(.04, .16, .45) : k < 3.5 ? vec3(.2, .42, .07) : vec3(.52, .04, .07);
}
// what is seen through a window: the car's lit interior as a box (P on the glass, D into the car), people seated
// along both sides facing the aisle and a few standing
vec3 mrInterior(vec3 P, vec3 D, float x0, float x1, float seed){
  vec3 lo = vec3(x0, -1.33, 13.3), hi = vec3(x1, 1.33, 15.95);
  P.y -= P.y > 0. ? ${BC} : -${BC};                     // across the car from its centre
  float yc = P.y > 0. ? 1. : -1.;
  P = clamp(P, lo + .02, hi - .02);
  vec3 iD = 1. / (D + vec3(1e-6));
  vec3 tf = (mix(lo, hi, step(0., D)) - P) * iD;
  float t = min(tf.x, min(tf.y, tf.z));
  vec3 H = P + D * t;
  vec3 Li = vec3(1., .95, .86) * .5;
  vec3 c;
  if (t == tf.z) c = D.z > 0. ? vec3(.8) * Li + vec3(2.2, 2.1, 1.9) * step(abs(abs(H.y) - .45), .09) : vec3(.16, .17, .19) * Li;
  else if (t == tf.y) {
    // the far side: seats, the window band bright with the day outside, panels above
    c = H.z < 13.8 ? vec3(.12, .2, .36) * Li : H.z < 14.0 ? vec3(.5) * Li : H.z < 15.35 ? mix(AIR * 1.1, vec3(.1) * Li, step(.88, fract((H.x - .3) / 1.44))) : vec3(.7) * Li;
  } else c = (abs(H.y) < .6 && H.z < 15.4 ? vec3(.22) : vec3(.5, .51, .53)) * Li;   // the end walls and the open gangway
  // people, nearest first: the near bench, the aisle, the far bench
  for (int k = 0; k < 3; k++){
    float py = k == 0 ? yc * 1.0 : k == 1 ? yc * .15 : -yc * 1.0;
    float tp = (py - P.y) * iD.y;
    if (tp <= 0. || tp >= t) continue;
    vec3 Q = P + D * tp;
    bool stand = k == 1;
    float w = stand ? .9 : .56, cell = floor(Q.x / w);
    float h = hash12(vec2(cell, float(k) * 7. + seed * 3.));
    if (h > (stand ? .22 : .5)) continue;
    float xc = (cell + .5) * w + (hash12(vec2(cell, 3.5 + float(k))) - .5) * (w - .48);
    float hz = 13.3 + (stand ? 1.55 + .3 * h : 1.15 + .12 * h);
    vec2 d = vec2(Q.x - xc, Q.z - hz);
    float head = step(length(d / vec2(.1, .125)), 1.);
    float body = step(abs(d.x), mix(.12, .22, smoothstep(-.17, -.3, d.y))) * step(d.y, -.15) * step(stand ? -1.2 : -.8, d.y);
    if (head + body > .5) {
      float s = fract(h * 17.3);
      vec3 cl = s < .3 ? vec3(.07, .08, .12) : s < .5 ? vec3(.35, .34, .33) : s < .65 ? vec3(.45, .1, .07) : s < .8 ? vec3(.1, .22, .14) : vec3(.6, .55, .45);
      vec3 hd = mix(vec3(.5, .34, .24), vec3(.07, .05, .04), step(.45, fract(s * 5.3)));
      return (head > .5 ? hd : cl) * Li * 1.2;
    }
  }
  return c;
}

void vehTrain(inout Veh v, inout vec3 n, vec3 p, vec3 V, vec4 m, vec4 u){
  float part = floor(u.x + .5), tid = floor(fract(m.w) * ${2 * PER}.), seed = (tid + .5) / ${2 * PER}.;   // the train, exactly
  vec3 F = fwidth(m.xyz), Fu = fwidth(u.yzw);
  vec3 up = upAt(p), fw = vec3(up.z, 0., -up.x);
  vec3 nl = vec3(dot(n, fw), n.y, dot(n, up));
  vec3 liv = mrLivery(seed);
  float uw = mod(atan(p.z, p.x), 6.2831853) * RF;
  float sh = mrRoofShade(vec3(uw, m.y, m.z));
  float car = clamp(floor(m.x / ${PITCH}.), 0., ${NCAR - 1}.);
  vec3 col = vec3(.5);
  v.spec = .3; v.gloss = 40.;
  if (part > .5 && part < 3.5) {
    // the body: a = metres from the car's end (from the nose on a cab car), zo / yo = the point on the body's section
    float a = u.y, zo = u.z, yo = u.w;
    bool cab = part > 1.5, front = part < 2.5;
    col = vec3(.80, .81, .80);
    col = mix(col, liv, mrSpan(zo, 13.36, 13.86, Fu.y) + mrSpan(zo, 15.5, 15.57, Fu.y));
    col = mix(col, vec3(.12, .13, .14), 1. - smoothstep(12.42 - Fu.y, 12.42 + Fu.y, zo));
    col = mix(col, liv, mrSpan(zo, 12.44, 12.54, Fu.y));
    col = mix(col, vec3(.02), step(zo, 11.56));                      // the rubber lip
    // doors: double plug doors, two a side, in the livery colour with windows
    float d1 = cab ? 6.4 : 4.05, d2 = cab ? 12.9 : 12.15;
    float dx = abs(a - d1) < abs(a - d2) ? a - d1 : a - d2;
    float door = mrRect(vec2(dx, zo - 14.4), vec2(.76, 1.1), Fu.xy);
    float edge = door * (1. - mrRect(vec2(dx, zo - 14.4), vec2(.73, 1.07), Fu.xy)) + door * mrSpan(dx, -.012, .012, Fu.x);
    col = mix(col, liv * .9, door);
    col *= 1. - .8 * edge;
    float win = door * mrRect(vec2(abs(dx) - .38, zo - 14.68), vec2(.26, .62), Fu.xy);
    // the window band between the doors, each stretch cut into equal panes
    float s0 = a < d1 ? (cab ? 2.95 : .4) : a < d2 ? d1 + .92 : d2 + .92, s1 = a < d1 ? d1 - .92 : a < d2 ? d2 - .92 : ${CARL} - .4;
    float np = max(1., floor((s1 - s0) / 1.4 + .5)), pl = (s1 - s0) / np;
    float lx = mod(a - s0, pl) - pl * .5;
    win = max(win, mrRect(vec2(lx, zo - 14.68), vec2(pl * .5 - .075, .67), Fu.xy) * step(s0, a) * step(a, s1));
    if (cab) {
      // the cab: a black mask round the wraparound windscreen, lamp clusters low on the nose (headlights inboard,
      // tail lights round the corners) and a destination display at the top of the glass
      float mask = mrRect(vec2(a - 1.2, zo - 14.99), vec2(1.62, 1.1), Fu.xy);
      float ws = mrRect(vec2(a - 1.1, zo - 14.97), vec2(1.47, 1.0), Fu.xy);
      col = mix(col, vec3(.025), mask);
      win = max(win, ws);
      float lamp = mrRect(vec2(a - .7, zo - 12.92), vec2(.45, .18), Fu.xy);
      float hl = mrRect(vec2(a - .52, zo - 12.92), vec2(.22, .1), Fu.xy), tl = mrRect(vec2(a - 1.02, zo - 12.92), vec2(.08, .1), Fu.xy);
      col = mix(col, vec3(.02), lamp);
      col = mix(col, front ? vec3(.9) : vec3(.3, .3, .32), hl);
      col = mix(col, front ? vec3(.25, .02, .02) : vec3(.9, .1, .05), tl);
      v.emis += front ? vec3(16., 15., 13.) * hl * (.7 + .3 * smoothstep(.22, 0., abs(a - .52))) : vec3(7., .35, .15) * tl;
      float ds = mrRect(vec2(a - .45, zo - 15.69), vec2(.45, .13), Fu.xy);
      float ta = sign(yo) * a;
      float on = step(.45, hash12(floor(vec2(ta / .045, zo / .04)))) * step(.2, fract(ta / .27)) * step(.3, hash12(vec2(floor(ta / .27), 5.)));
      on = mix(on, .3, smoothstep(.01, .03, Fu.x));
      v.emis += vec3(3., 1.5, .25) * ds * on * mrSpan(zo, 15.6, 15.78, Fu.y);
      win *= 1. - ds;
      col = mix(col, vec3(.01), ds);
    }
    // grime: toward the bottom, and a little on the roof
    float dirt = smoothstep(13.6, 11.6, zo) * (.35 + .5 * fbm(vec2(m.x * .5, zo * 3.) + seed * 9.));
    col = mix(col, col * vec3(.55, .5, .44), dirt * .8);
    col *= 1. - .12 * smoothstep(16.1, 16.3, zo);
    v.alb = col; v.spec = .45; v.gloss = 80.;
    v.ao = mix(.65, 1., smoothstep(11.5, 12.6, zo));
    if (win > 0.) {
      vec3 D = -vec3(dot(V, fw), V.y, dot(V, up));
      float x0 = car * ${PITCH}. + .65, x1 = car * ${PITCH}. + ${PITCH}. - .65;
      if (car < .5) x0 = 1.4; else if (car > ${NCAR - 1.5}) x1 = ${TLEN}. - 1.4;
      vec3 inside = mrInterior(m.xyz, normalize(D), x0, x1, tid * 7. + car) * .55;
      mrGlass(v, n, V, up, inside, win);
    }
  } else if (part < 4.5) {
    col = vec3(.07, .075, .08); v.ao = .5;                            // the car ends, behind the gangways
  } else if (part < 5.5) {
    col = vec3(.035) * (1. - .5 * mrLines(m.x, .09, .016, F.x));      // the gangway bellows
    v.spec = .1;
  } else if (part < 6.5) {
    // the roof's air-conditioning units: grilles on top
    col = vec3(.62, .64, .64) * (1. - (nl.z > .7 ? .4 * mrLines(m.x, .07, .015, F.x) : 0.));
    v.spec = .3;
  } else {
    col = vec3(.05, .05, .055); v.ao = .35;                           // the underside, over the bogies
  }
  if (part > 3.5) v.alb = col;
  mrShadow(v, n, p, sh);
}
`;

// ---------------------------------------------------------------- geometry
// a builder that collects vertices (position, normal, aU) and triangles, then hands them over as one geometry
function mesh() {
  const P = [], N = [], U = [], I = [];
  return {
    P, N, U, I,
    v(x, y, z, nx, ny, nz, u) { P.push(x, y, z); N.push(nx, ny, nz); U.push(u[0], u[1], u[2], u[3]); return P.length / 3 - 1; },
    quad(a, b, c, d) { I.push(a, b, c, a, c, d); },
    // a flat quad through four points, its normal turned toward ref
    face(pts, u, ref) {
      const [a, b, c, d] = pts;
      let n = cross(sub(c, a), sub(d, b));
      if (dot(n, ref) < 0) n = n.map((c) => -c);
      n = norm(n);
      const i = pts.map((q) => this.v(q[0], q[1], q[2], n[0], n[1], n[2], u));
      this.quad(i[0], i[1], i[2], i[3]);
    },
    geo(THREE) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute("aU", new THREE.Float32BufferAttribute(U, 4));
      g.setIndex(I);
      return g;
    },
  };
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const steps = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
const segs = (a, b, len) => steps(a, b, Math.max(1, Math.ceil((b - a) / len)));
const rect = (y0, y1, z0, z1) => [[y0, z0], [y1, z0], [y1, z1], [y0, z1]];

// an extrusion along x through the stations xs of a section prof ([[y, z], ...]), each edge a flat face whose aU is
// uf(edge). closed: the last point joins the first, and the faces turn away from the centroid; open sections face
// to the right of their direction (side 1) or the left (side -1). caps: close both ends (aU uf(-1)).
function prism(M, prof, xs, uf, { closed = true, caps = false, side = 0 } = {}) {
  const n = prof.length, cy = prof.reduce((s, q) => s + q[0], 0) / n, cz = prof.reduce((s, q) => s + q[1], 0) / n;
  for (let k = 0; k < (closed ? n : n - 1); k++) {
    const [y0, z0] = prof[k], [y1, z1] = prof[(k + 1) % n];
    let ny = z1 - z0, nz = -(y1 - y0);
    const l = Math.hypot(ny, nz); ny /= l; nz /= l;
    if (side ? side < 0 : ny * ((y0 + y1) / 2 - cy) + nz * ((z0 + z1) / 2 - cz) < 0) { ny = -ny; nz = -nz; }
    const u = uf(k);
    let a0, b0;
    xs.forEach((x, i) => {
      const a = M.v(x, y0, z0, 0, ny, nz, u), b = M.v(x, y1, z1, 0, ny, nz, u);
      if (i) M.quad(a0, b0, b, a);
      a0 = a; b0 = b;
    });
  }
  if (caps) for (const [x, s] of [[xs[0], -1], [xs[xs.length - 1], 1]]) {
    const u = uf(-1), c = M.v(x, cy, cz, s, 0, 0, u), r = prof.map(([y, z]) => M.v(x, y, z, s, 0, 0, u));
    for (let k = 0; k < n; k++) M.I.push(c, r[k], r[(k + 1) % n]);
  }
}
// an axis-aligned box from x0 to x1 (in segments of at most len metres)
const slab = (M, x0, x1, y0, y1, z0, z1, uf, len = 6) => prism(M, rect(y0, y1, z0, z1), segs(x0, x1, len), typeof uf === "function" ? uf : () => uf, { caps: true });

// a smooth surface through rings of points (rings[i][j] = [x, y, z]); normals by central differences, turned so that
// they agree with out(i, j) at the middle vertex. Returns the index of the first vertex.
function loft(M, rings, uOf, closed, out) {
  const nr = rings.length, np = rings[0].length, i0 = M.P.length / 3;
  const at = (i, j) => rings[Math.min(nr - 1, Math.max(0, i))][closed ? (j + np) % np : Math.min(np - 1, Math.max(0, j))];
  const nm = [];
  for (let i = 0; i < nr; i++) for (let j = 0; j < np; j++) nm.push(cross(sub(at(i, j + 1), at(i, j - 1)), sub(at(i + 1, j), at(i - 1, j))));
  const im = nr >> 1, jm = np >> 2, sg = dot(nm[im * np + jm], out(im, jm)) < 0 ? -1 : 1;
  for (let i = 0; i < nr; i++) for (let j = 0; j < np; j++) {
    const q = rings[i][j], n = norm(nm[i * np + j].map((c) => c * sg));
    M.v(q[0], q[1], q[2], n[0], n[1], n[2], uOf(i, j));
  }
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < (closed ? np : np - 1); j++) {
    const a = i0 + i * np + j, b = i0 + i * np + (j + 1) % np;
    M.quad(a, b, b + np, a + np);
  }
  return i0;
}
// a ring round (x, y) at height z: a superellipse of half widths hx (along) and hy (across), exponent e
const sring = (x, y, z, hx, hy, e, np) => Array.from({ length: np }, (_, j) => {
  const a = (j + 0.5) / np * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), k = 2 / e;
  return [x + hx * Math.sign(c) * Math.abs(c) ** k, y + hy * Math.sign(s) * Math.abs(s) ** k, z];
});
// the same across the track: a ring at x round (y, z), half widths hy and hz
const yzring = (x, y, z, hy, hz, e, np) => Array.from({ length: np }, (_, j) => {
  const a = (j + 0.5) / np * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), k = 2 / e;
  return [x, y + hy * Math.sign(c) * Math.abs(c) ** k, z + hz * Math.sign(s) * Math.abs(s) ** k];
});
// a column of superellipse section: shape(z) = [hx, hy, e] at each of the heights zs, capped on top
function column(M, x, y, zs, shape, np, u) {
  const rings = zs.map((z) => { const [hx, hy, e] = shape(z); return sring(x, y, z, hx, hy, e, np); });
  loft(M, rings, () => u, true, (i, j) => [rings[i][j][0] - x, rings[i][j][1] - y, 0]);
  const top = rings[rings.length - 1], z = zs[zs.length - 1], c = M.v(x, y, z, 0, 0, 1, u), r = top.map((q) => M.v(q[0], q[1], q[2], 0, 0, 1, u));
  for (let j = 0; j < np; j++) M.I.push(c, r[j], r[(j + 1) % np]);
}

// ---- the track
const PIER_Z = [-1.5, 3, 6.6, 7.2, 7.75, 8.25, 8.7, 9.1, 9.42, 9.64, 9.72, 10.45];
const pierShape = (z) => {
  const t = Math.min(1, Math.max(0, (z - 6.6) / 3.12)), c = Math.min(1, Math.max(0, (z + 1.5) / 8.1));
  return [0.66 - 0.08 * c + 0.27 * t ** 1.6, 0.92 - 0.14 * c + 2.47 * t * t, 3 + 3 * t];
};
const BEAM = (c) => [[c - 0.34, BTOP], [c + 0.34, BTOP], [c + 0.4, BTOP - 0.06], [c + 0.4, BBOT + 0.06], [c + 0.34, BBOT], [c - 0.34, BBOT], [c - 0.4, BBOT + 0.06], [c - 0.4, BTOP - 0.06]];
const RAIL = (c, o) => [[c + o * 0.4, 12.08], [c + o * 0.53, 12.08], [c + o * 0.53, 11.96], [c + o * 0.4, 11.96]];

function track(M, S) {
  for (let k = 0; k < SPANS; k++) {
    const x0 = k * S + 0.04, x1 = (k + 1) * S - 0.04, xs = steps(x0, x1, 10);
    for (const c of [-BC, BC]) {
      prism(M, BEAM(c), xs, () => [0, 0, 0, 0], { caps: true });
      for (const o of [-1, 1]) prism(M, RAIL(c, o), xs, () => [2, 0, 0, 0], { closed: false });
    }
    // the emergency walkway between the beams: a grating on posts, on ties from beam to beam every ~4 m
    prism(M, rect(-0.72, 0.72, 12.33, 12.45), xs, () => [4, 0, 0, 0], { caps: true });
    for (let i = 1; i < 10; i++) {
      const x = xs[i];
      slab(M, x - 0.06, x + 0.06, -0.06, 0.06, 11.12, 12.33, [5, 0, 0, 0]);
      slab(M, x - 0.08, x + 0.08, -2.0, 2.0, 10.95, 11.12, [5, 0, 0, 0]);
    }
    // the pier, a hammerhead on a tapered column, with a bearing under each beam
    const xp = k * S;
    column(M, xp, 0, PIER_Z, pierShape, 24, [1, 0, 0, 0]);
    for (const c of [-BC, BC]) slab(M, xp - 0.62, xp + 0.62, c - 0.36, c + 0.36, 10.45, BBOT, [3, 0, 0, 0]);
  }
}

// ---- stations: side platforms on a girder over the river, a canopy over each platform (planted, with solar
// panels), and on each side a footbridge to the quay with a lift and stairs
// a straight flight of stairs down from (xa, za) to (xb, zb), between ya and yb across, with railings
function flight(M, xa, xb, za, zb, ya, yb) {
  const N = Math.round((za - zb) / 0.165), run = (xb - xa) / N, rise = (za - zb) / N, u = [11, run, ((xa % run) + run) % run, 0];
  for (let i = 0; i < N; i++) {
    const x = xa + i * run, z = za - i * rise;
    M.face([[x, ya, z], [x, yb, z], [x, yb, z - rise], [x, ya, z - rise]], u, [1, 0, 0]);
    M.face([[x, ya, z - rise], [x, yb, z - rise], [x + run, yb, z - rise], [x + run, ya, z - rise]], u, [0, 0, 1]);
  }
  const st = [9, 0, 0, 0];
  for (const y of [ya, yb]) {
    M.face([[xa, y, za + 0.12], [xb, y, zb + 0.12], [xb, y, zb - 0.3], [xa, y, za - 0.42]], st, [0, y === ya ? -1 : 1, 0]);
    M.face([[xa, y, za + 0.12], [xb, y, zb + 0.12], [xb, y, zb + 1.17], [xa, y, za + 1.17]], [10, za + 1.17, (zb - za) / (xb - xa), xa], [0, y === ya ? -1 : 1, 0]);
  }
  M.face([[xa, ya, za - 0.42], [xb, ya, zb - 0.3], [xb, yb, zb - 0.3], [xa, yb, za - 0.42]], st, [0, 0, -1]);
}
function station(M, xc, w, L) {
  const x0 = xc - ST_HL, x1 = xc + ST_HL;
  for (const sd of [-1, 1]) {
    const Y = (a, b) => (sd > 0 ? [a, b] : [-b, -a]);
    slab(M, x0, x1, ...Y(3.98, 7.45), 12.75, 13.2, [6, 0, 0, 0]);
    slab(M, x0 + 0.5, x1 - 0.5, ...Y(4.45, 6.9), 11.8, 12.75, [6, 0, 0, 0]);
    for (let x = x0 + 4; x < x1; x += 20) column(M, x, sd * 5.65, [-1.5, 6, 11.8], (z) => [0.42 - z * 0.008, 0.48 - z * 0.008, 3], 12, [1, 1, 0, 0]);
    slab(M, x0, x1, ...Y(7.0, 7.05), 13.2, 14.25, [10, 14.25, 0, 0]);
    for (let x = x0 + 2; x <= x1 - 1.9; x += 10) column(M, x, sd * 7.3, [13.2, 16.75], () => [0.13, 0.13, 2], 8, [9, 0, 0, 0]);
    slab(M, x0 - 1.5, x1 + 1.5, ...Y(3.7, 7.85), ROOF, ROOF + 0.27, (k) => [k === 2 ? 7 : 8, 0, 0, 0]);
    for (let x = x0 + 2; x <= x1 - 1.9; x += 10) slab(M, x - 0.1, x + 0.1, ...Y(3.7, 7.85), 16.75, ROOF, [9, 0, 0, 0]);
    // benches, hanging signs, people waiting
    for (let x = x0 + 8; x < x1 - 4; x += 16) slab(M, x - 0.9, x + 0.9, sd * 6.65 - 0.22, sd * 6.65 + 0.22, 13.2, 13.62, [9, 0, 0, 0]);
    for (let x = x0 + 16; x < x1 - 8; x += 32) slab(M, x - 1.1, x + 1.1, sd * 5.6 - 0.04, sd * 5.6 + 0.04, 15.95, 16.38, [14, 0, 0, 0]);
    for (let i = 0; i < 24; i++) {
      const x = x0 + 3 + L() * (2 * ST_HL - 6), y = sd * (4.9 + L() * 1.7), h = 1.55 + L() * 0.3, s = L(), z = 13.2 + h;
      slab(M, x - 0.12, x + 0.12, y - 0.1, y + 0.1, 13.2, 13.2 + h * 0.47, [13, s, 0, 0]);
      slab(M, x - 0.2, x + 0.2, y - 0.12, y + 0.12, 13.2 + h * 0.47, z - 0.24, [13, s, 1, 0]);
      slab(M, x - 0.1, x + 0.1, y - 0.1, y + 0.1, z - 0.24, z, [13, s, 2, 0]);
    }
    // the footbridge over to the quay, the lift beside it and two flights of stairs down to the promenade
    const e0 = w + 0.35, e1 = w + 2.75;                // across the quay, from the water's edge
    slab(M, xc - 1.5, xc + 1.5, ...Y(7.45, e1), 12.75, 13.2, [6, 0, 0, 0]);
    for (const x of [xc - 1.48, xc + 1.48]) slab(M, x - 0.025, x + 0.025, ...Y(7.45, e0), 13.2, 14.25, [10, 14.25, 0, 0]);
    slab(M, xc - 1.5, xc + 1.5, ...Y(e1 - 0.05, e1), 13.2, 14.25, [10, 14.25, 0, 0]);
    slab(M, xc - 4.2, xc - 1.6, ...Y(e0, e1), 0, 15.4, [12, 0, xc % 7 + sd, 0]);
    slab(M, xc - 4.3, xc - 1.5, ...Y(e0 - 0.1, e1 + 0.1), 15.4, 15.75, [9, 0, 0, 0]);
    slab(M, xc - 0.2, xc + 0.2, ...Y(e0 + 1, e0 + 1.4), 0, 12.75, [9, 0, 0, 0]);
    const [ya, yb] = Y(e0 + 0.2, e1 - 0.2);
    flight(M, xc + 1.5, xc + 12.5, 13.2, 6.6, ya, yb);
    slab(M, xc + 12.5, xc + 14.5, ya, yb, 6.2, 6.6, [6, 0, 0, 0]);
    slab(M, xc + 13.3, xc + 13.7, ...Y(e0 + 1, e0 + 1.4), 0, 6.2, [9, 0, 0, 0]);
    flight(M, xc + 14.5, xc + 25.5, 6.6, 0, ya, yb);
  }
}

// ---- the trains: a section of the body from the skirt's lower edge over the roof (right half, bottom to top)
const PROF = [[1.42, 11.5], [1.455, 11.85], [1.48, 12.4], [1.5, 13.1], [1.5, 13.6], [1.49, 14.1], [1.465, 14.7], [1.43, 15.2],
  [1.37, 15.55], [1.27, 15.83], [1.12, 16.04], [0.9, 16.18], [0.6, 16.27], [0.3, 16.3]];
const LOOP = [...PROF, [0, 16.31], ...PROF.slice().reverse().map(([y, z]) => [-y, z])];
// the nose: how far the tip of the section at height z stands back from the very front (the bumper, then the raked
// windscreen), and how the body narrows toward the tip in plan (q = 0 at the tip .. 1 where the nose meets the body)
const xTip = (z) => (z < 12.9 ? 0.25 * ((12.9 - z) / 1.4) ** 2 : z < 13.5 ? 0 : 2.65 * ((z - 13.5) / 2.81) ** 1.3);
const plan = (q) => Math.sqrt(1 - (1 - q) ** 2.5);
const QN = [1, 0.8, 0.64, 0.5, 0.38, 0.27, 0.18, 0.11, 0.06, 0.025, 0];

// one car from xs to xe on the beam at y0; nose: 0, or +1 / -1 for a cab with its nose at xe / xs; part: 1 a middle
// car, 2 a leading cab, 3 a trailing cab
function car(M, xs, xe, y0, nose, part) {
  const rings = [], U = [];
  const tip = nose > 0 ? xe : xs;
  if (!nose) for (const x of [xs, (xs + xe) / 2, xe]) { rings.push(LOOP.map(([y, z]) => [x, y0 + y, z])); U.push(LOOP.map(([y, z]) => [part, x - xs, z, y])); }
  else {
    const far = nose > 0 ? xs : xe, xn = tip - nose * NL;
    for (const [x, a] of [[far, CARL], [(far + xn) / 2, (CARL + NL) / 2]]) { rings.push(LOOP.map(([y, z]) => [x, y0 + y, z])); U.push(LOOP.map(([y, z]) => [part, a, z, y])); }
    for (const q of QN) {
      rings.push(LOOP.map(([y, z]) => { const t = xTip(z); return [tip - nose * (t + q * (NL - t)), y0 + y * plan(q), z]; }));
      U.push(LOOP.map(([y, z]) => [part, q * NL, z, y]));
    }
  }
  const np = LOOP.length, nr = rings.length;
  const i0 = loft(M, rings, (i, j) => U[i][j], false, (i, j) => [0, LOOP[j][0], LOOP[j][1] - 14]);
  if (nose) {
    // the tip: one normal for the left and right halves that meet there, from the ring behind it
    for (let j = 0; j < np; j++) {
      const a = (i0 + (nr - 2) * np + j) * 3, b = (i0 + (nr - 2) * np + np - 1 - j) * 3;
      const n = norm([M.N[a] + M.N[b], 0, M.N[a + 2] + M.N[b + 2]]), t = (i0 + (nr - 1) * np + j) * 3;
      M.N[t] = n[0]; M.N[t + 1] = n[1]; M.N[t + 2] = n[2];
    }
  }
  // the plain ends: a flat cap (behind the gangway)
  for (const x of nose ? [nose > 0 ? xs : xe] : [xs, xe]) {
    const s = x === xs ? -1 : 1, u = [4, 0, 0, 0], c = M.v(x, y0, 14, s, 0, 0, u), r = LOOP.map(([y, z]) => M.v(x, y0 + y, z, s, 0, 0, u));
    for (let k = 0; k < np; k++) M.I.push(c, r[k], r[(k + 1) % np]);
  }
  // underneath: the skirts' lower faces and the channel over the beam, in which the bogies run
  const bx0 = nose < 0 ? xs + NL : xs, bx1 = nose > 0 ? xe - NL : xe, ux = [7, 0, 0, 0];
  for (const o of [-1, 1]) prism(M, [[o * 1.42, TBOT], [o * 0.62, TBOT]].map(([y, z]) => [y0 + y, z]), [bx0, bx1], () => ux, { closed: false, side: o > 0 ? -1 : 1 });
  const cx0 = nose < 0 ? xs + 0.6 : xs, cx1 = nose > 0 ? xe - 0.6 : xe;
  prism(M, [[0.62, TBOT], [0.62, 12.75], [-0.62, 12.75], [-0.62, TBOT]].map(([y, z]) => [y0 + y, z]), [cx0, cx1], () => ux, { closed: false, side: -1 });
  if (nose) for (let i = 0; i < QN.length - 1; i++) {
    const xa = tip - nose * (xTip(TBOT) + QN[i] * (NL - xTip(TBOT))), xb = tip - nose * (xTip(TBOT) + QN[i + 1] * (NL - xTip(TBOT)));
    const ya = 1.42 * plan(QN[i]), yb = 1.42 * plan(QN[i + 1]);
    if (ya > 0.63) for (const o of [-1, 1]) M.face([[xa, y0 + o * ya, TBOT], [xa, y0 + o * 0.62, TBOT], [xb, y0 + o * 0.62, TBOT], [xb, y0 + o * Math.max(0.62, yb), TBOT]], ux, [0, 0, -1]);
  }
  // air-conditioning units on the roof
  const unit = (a0, a1) => {
    const [xa, xb] = nose ? [tip - nose * a1, tip - nose * a0].sort((p, q) => p - q) : [xs + a0, xs + a1];
    prism(M, [[-0.78, 16.18], [0.78, 16.18], [0.68, 16.48], [-0.68, 16.48]].map(([y, z]) => [y0 + y, z]), [xa, xb], () => [6, 0, 0, 0], { caps: true });
  };
  if (nose) unit(9.2, 13.6); else { unit(2.6, 6.2); unit(10, 13.6); }
}
function train(M, y0, dir) {
  for (let c = 0; c < NCAR; c++) {
    const xs = c * PITCH + (PITCH - CARL) / 2, xe = xs + CARL;
    const nose = c === 0 ? -1 : c === NCAR - 1 ? 1 : 0;
    car(M, xs, xe, y0, nose, nose === 0 ? 1 : nose === dir ? 2 : 3);
    if (c < NCAR - 1) {
      // the gangway to the next car: flexible bellows, a little waisted
      const ga = xe - 0.05, gb = xe + PITCH - CARL + 0.05;
      const rings = [ga, (ga + gb) / 2, gb].map((x, i) => yzring(x, y0, 14.45, i === 1 ? 1.12 : 1.18, i === 1 ? 1.32 : 1.38, 4, 16));
      loft(M, rings, () => [5, 0, 0, 0], true, (i, j) => [0, rings[i][j][1] - y0, rings[i][j][2] - 14.45]);
    }
  }
}

export function build(api) {
  const { THREE, rng, CIRC, riverW } = api;
  // the track, the piers and the stations: one static piece
  const M = mesh(), L = rng(4242);
  track(M, CIRC / SPANS);
  for (const th of STATIONS) station(M, th * api.RF, riverW(th), L);
  api.add(M.geo(THREE), [0, 0, 0, 0]);
  // the trains: one geometry each way, five trains on it
  let count = 0;
  for (const dir of [-1, 1]) {
    const T = mesh();
    train(T, dir * BC, dir);
    const g = T.geo(THREE), k = dir > 0 ? 1 : 0;
    for (let t = 0; t < PER; t++) {
      api.add(g, [(t / PER + OFF[k]) * api.TAU, dir * SPEED, 0, 1 + (2 * t + k + 0.5) / (2 * PER)]);
      count++;
    }
  }
  return { count };
}
