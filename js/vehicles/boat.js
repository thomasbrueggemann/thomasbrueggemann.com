// Boats on the river of the Torus scene: electric river buses with glazed cabins, water taxis, open launches, barges
// (garden barges, hatch-covered and container barges), rowing boats, kayaks, canoes and a paddle boarder. Each hull is
// lofted (fine bow, sheer line, flare, round bilge, transom), with decks, rubbing strakes, rails, cabins, people,
// navigation lights, and a patch of water round it that carries its bow wave, Kelvin wake, prop wash or paddle
// swirls, its shadow and the hull's reflection. Traffic keeps right at a canal's speed, the same for every boat going
// one way, so nobody overtakes or sails through anybody; the monorail's piers and station columns and the banks stay clear.
// Contract (shared by every ring vehicle module, see "ring vehicles" in ../torus3d.js):
//   build(api) adds geometry with api.add(geometry, v) / api.box(...) and returns { count }.
//   GLSL defines vehBoat(inout Veh v, inout vec3 n, vec3 p, vec3 V, vec4 m, vec4 u), called for kind 2.x.
// Vehicle coordinates are metres: x along the ring (direction of travel for speed > 0), y across, z up from the
// water line (the water surface is z = 0). Boats are built bow to +x, port to +y, and turned round for speed < 0.
// Every boat runs at lateral 0 (the river's centre line) with its geometry moved y0 metres to the right, so it keeps a
// fixed distance from the pillars and the station columns however the river's width changes.
// kind = 2 + 0.5 * turned + 0.49 * seed, seed = ((y0 - 1.2) / 0.05 + random) / 80; aU = (part, type, a, b), or for the water patch
// (20 + beam / 10, length * 10 + 0.05 + speed / 8, shadow, type * 100 + paddle span * 10 + 0.02 + transom * 0.9).

export const GLSL = /* glsl */`
const vec3 BT_SKIN[4] = vec3[4](vec3(.62, .45, .33), vec3(.45, .30, .20), vec3(.26, .16, .10), vec3(.72, .55, .43));
const vec3 BT_HAIR[4] = vec3[4](vec3(.035, .03, .025), vec3(.20, .12, .06), vec3(.52, .40, .23), vec3(.40, .39, .38));
const vec3 BT_CLOTH[8] = vec3[8](vec3(.82, .82, .80), vec3(.06, .08, .15), vec3(.55, .08, .06), vec3(.85, .62, .10),
  vec3(.05, .33, .36), vec3(.33, .34, .36), vec3(.05, .05, .06), vec3(.72, .40, .45));
float btHash(float a, float b){ return hash12(vec2(a * 1.37 + 3.1, b * 2.91 + 7.7)); }
// a filtered stripe: 1 where |x - round(x)| < w, fading to its mean where it gets finer than a pixel
float btLine(float x, float w){ float fw = fwidth(x), d = abs(fract(x + .5) - .5); return mix(1. - smoothstep(w - fw, w + fw, d), 2. * w, smoothstep(.15, .5, fw)); }
float btBand(float x, float a, float b){ float fw = fwidth(x) + 1e-4; return smoothstep(a - fw, a + fw, x) * (1. - smoothstep(b - fw, b + fw, x)); }
float btFine(float x){ return 1. - smoothstep(.25, .8, fwidth(x)); }      // 1 while a pattern of frequency x still resolves
vec3 btHullC(int ty, float sd){
  float k = fract(sd * 7.31);
  if (ty == 0) return k < .3 ? vec3(.022, .032, .06) : k < .55 ? vec3(.02, .02, .022) : k < .8 ? vec3(.022, .065, .045) : vec3(.12, .028, .025);
  if (ty == 1) return k < .4 ? vec3(.29, .105, .04) : vec3(.80, .80, .78);
  if (ty == 2) return k < .2 ? vec3(.035, .06, .14) : k < .4 ? vec3(.80, .80, .77) : k < .55 ? vec3(.035, .13, .08) : k < .7 ? vec3(.24, .27, .29) : k < .85 ? vec3(.72, .67, .56) : vec3(.42, .06, .04);
  if (ty == 3) return k < .3 ? vec3(.78, .78, .74) : k < .5 ? vec3(.33, .52, .66) : k < .7 ? vec3(.11, .30, .19) : k < .85 ? vec3(.48, .10, .07) : vec3(.38, .19, .08);
  if (ty == 4) return k < .2 ? vec3(.85, .62, .04) : k < .37 ? vec3(.70, .07, .04) : k < .54 ? vec3(.85, .30, .04) : k < .7 ? vec3(.40, .66, .10) : k < .86 ? vec3(.07, .40, .70) : vec3(.84, .84, .82);
  if (ty == 5) return k < .3 ? vec3(.55, .07, .05) : k < .55 ? vec3(.09, .28, .14) : k < .8 ? vec3(.44, .24, .09) : vec3(.48, .48, .46);
  if (ty == 6) return k < .5 ? vec3(.85, .85, .84) : vec3(.04, .52, .56);
  return k < .45 ? vec3(.025, .025, .028) : k < .75 ? vec3(.03, .05, .10) : vec3(.03, .08, .05);
}
// second colour of a boat: cabin, sheer stripe, coamings
vec3 btTrimC(int ty, float sd){
  float k = fract(sd * 13.7);
  if (ty == 0) return k < .75 ? vec3(.80, .80, .78) : vec3(.10, .11, .12);
  if (ty == 1) return fract(sd * 7.31) < .4 ? vec3(.29, .105, .04) : k < .35 ? vec3(.0, .33, .36) : k < .7 ? vec3(.82, .60, .06) : vec3(.04, .07, .16);
  if (ty == 7) return k < .3 ? vec3(.45, .07, .05) : k < .55 ? vec3(.05, .25, .14) : k < .8 ? vec3(.62, .58, .50) : vec3(.07, .16, .32);
  return vec3(.80, .79, .76);
}
vec3 btWoodC(vec2 g, vec3 base){       // varnished wood, grain along g.x
  float f = btFine(g.y * 28.);
  return base * (1. + f * (.35 * vnoise(g * vec2(1.4, 28.)) - .17));
}
// the river's water as the land shader draws it, with the wake's slope added (tilt: along, across, in station axes)
vec3 btWater(vec3 p, vec3 V, vec3 tilt, vec3 mc, float mk){
  vec3 up = upAt(p), fw = vec3(up.z, 0., -up.x);
  vec2 g = vec2(atan(p.z, p.x) * RF, p.y);
  vec3 w0 = normalize(up + vec3(0., (vnoise(g * .7 + uTime * .3) - .5) * .06, 0.) + fw * (vnoise(g * .5 - uTime * .25) - .5) * .06);
  vec3 wn = normalize(w0 + tilt);
  float fr = .22 + .78 * pow(1. - max(dot(wn, V), 0.), 5.);
  vec3 L = lightAt(p);
  vec3 c = vec3(.03, .085, .085) * (1. - fr) + mix(AIR * 1.3, mc, mk) * fr + LCOL * pow(max(dot(reflect(-L, wn), V), 0.), 120.) * .6 * (1. - mk);
  // the vault mirrored in the waves: brighter where a slope turns the reflection toward the light
  return c + AIR * 1.3 * (dot(reflect(-V, wn), L) - dot(reflect(-V, w0), L));
}
// the hull's water line, a slightly lean outline of it (t from the stern 0 to the stem 1)
float btBW(float t, float B, float aft){ return t > .45 ? B * pow(max(1. - pow((t - .45) / .55, 1.6), 0.), .8) : B * (1. - (1. - aft) * pow(clamp((.45 - t) / .45, 0., 1.), 2.2)); }
const float BT_FB[8] = float[8](.62, .8, .62, .4, .2, .34, .11, .58);     // freeboard of each type
// the patch of water round a boat: shadow, hull contact, bow wave, Kelvin wake, prop wash or paddle swirls, the hull mirrored
void btWake(inout Veh v, vec3 p, vec3 V, vec3 q, float sg, float sd, vec4 u){
  vec3 up = upAt(p), fw = vec3(up.z, 0., -up.x);
  float th = atan(p.z, p.x), w = riverW(th), aq = abs(p.y - riverS(th));
  float bank = smoothstep(w - 2.1, w - 3.4, aq);
  if (bank <= 0.) discard;
  float B = (u.x - 20.) * 10., L = floor(u.y) / 10., spd = (fract(u.y) - .05) * 8., sh = u.z;
  float fl = floor(u.w), span = mod(fl, 100.) / 10., aft = (fract(u.w) - .02) / .9;
  int ty = int(fl / 100. + .01);
  float xs = q.x + L * .5, y = q.y, ay = abs(y), t = xs / L;
  float bw = btBW(t, B, aft);                           // distance from the water line
  float dh = t > 1. ? length(vec2(xs - L, y)) : t < 0. ? length(vec2(xs, max(ay - B * aft, 0.))) : ay - bw;
  dh = max(dh, 0.);
  float fr = spd / sqrt(9.81 * L), moving = step(.05, spd);
  vec2 wq = vec2(q.x + spd * uTime, y);                 // fixed to the water
  float tex = n3(vec3(wq * 2.2, uTime * .5)) * .6 + n3(vec3(wq * 5.3, uTime * .8)) * .4 * btFine(wq.x * 5.3);
  // Kelvin waves: transverse crests inside the 19.5 degree wedge, divergent ones along its arms
  float d = L - xs, k = 9.81 / max(spd * spd, .4), yA = .7 * B + max(d, 0.) * .354;
  float env = moving * smoothstep(0., L * .3, d) * exp(-max(d, 0.) / (8. + 3.5 * L)) * (.025 + .055 * smoothstep(.12, .35, fr)) * (.5 + vnoise(wq * .12));
  float wt = smoothstep(yA, yA * .55, ay), wd = exp(-pow((ay - yA) / (.4 + max(d, 0.) * .07), 2.));
  float phd = k * (1.22 * d + .866 * ay);
  vec2 sl = env * vec2(wt * sin(k * d) + wd * 1.22 * sin(phd), -wd * .866 * sin(phd) * sign(y));   // slope along, across (boat axes)
  // the stern's own, weaker wedge
  float d2 = -xs, yB = B * .8 + max(d2, 0.) * .354;
  sl += env * .5 * step(0., d2) * exp(-pow((ay - yB) / (.4 + max(d2, 0.) * .07), 2.)) * vec2(1.22, -.866 * sign(y)) * sin(k * (1.22 * d2 + .866 * ay));
  // foam: a bow wave peeling off the stem along the forward hull, a thin collar along the sides, broken crests
  // on the arms of faster boats
  float dB = L - xs, crest = .15 + .33 * max(dB, 0.);
  float bowF = exp(-pow((dh - crest) / (.14 + .1 * max(dB, 0.)), 2.)) * exp(-max(dB, 0.) / (L * .3)) * smoothstep(-.8, 0., dB);
  float hullF = moving * smoothstep(.06, .25, fr) * (bowF * 1.3 + exp(-dh / .1) * .3);
  sl += moving * bowF * .12 * smoothstep(.06, .25, fr) * vec2(-.5, sign(y));
  float armF = moving * wd * smoothstep(.25, .45, fr) * exp(-max(d, 0.) / (1.5 * L)) * .5;
  float foam = hullF * smoothstep(.2, .6, tex) + armF * smoothstep(.3, .7, tex);
  float a = -xs, ww = B * .45 + max(a, 0.) * .07;
  if (span < .05) {
    // electric drive: a churned strip behind the stern, fading as it spreads
    float wash = moving * smoothstep(-.6, .4, a) * exp(-pow(ay / ww, 2.)) * exp(-max(a, 0.) / (3. + 4. * spd)) * smoothstep(.04, .2, fr);
    foam += wash * (smoothstep(.55, .9, tex) * .4 + smoothstep(1.2, 0., a) * .3 * tex);
    sl += wash * .15 * (vec2(n3(vec3(wq * 1.7, uTime)), n3(vec3(wq * 1.7 + 9., uTime))) - .5);
  } else {
    // paddles and oars leave swirls where each stroke ended, on alternate sides (both for oars)
    float ls = max(spd * 1.4, .8), c = floor(wq.x / ls), sd2 = span > 1.2 ? sign(y) : (mod(c, 2.) < .5 ? 1. : -1.);
    vec2 pc = vec2((c + .5) * ls - spd * uTime, sd2 * span);
    float age = (-.3 - pc.x) / max(spd, .1), r = length(vec2(q.x - pc.x, y - pc.y));
    float ring = smoothstep(.1, 0., abs(r - .1 - age * .035)) * exp(-age / 2.5) * step(0., age) * step(0., y * sd2);
    foam += ring * .3 * smoothstep(.4, .8, tex);
    sl += ring * .03 * vec2(1., 0.);
  }
  // the boat's shadow and the darker water hugging its hull
  float ao = exp(-dh / .3) * .22 + sh * .42;
  // the hull mirrored: follow the reflected ray away from the camera to the hull's side (or transom), and see
  // whether it hits below the sheer; ripples shake the image
  vec3 vb = vec3(dot(V, fw) * sg, V.y * sg, dot(V, up));
  vec2 hd = -vb.xy / max(length(vb.xy), 1e-4);
  float slope = vb.z / max(length(vb.xy), 1e-4), D = BT_FB[ty], mk = 0., zh = 9.;
  if (hd.y * sign(y) < -.05 && t > -.2 && t < 1.2) {
    float dd = 0., th2 = t;
    for (int i = 0; i < 3; i++) { dd = max(ay - btBW(clamp(th2, 0., 1.), B, aft), 0.) / (-hd.y * sign(y)); th2 = (xs + hd.x * dd) / L; }
    if (th2 > .01 && th2 < .99) zh = dd * slope;
  }
  if (xs < 0. && hd.x > .05 && aft > .05) { float dd = -xs / hd.x; if (abs(y + hd.y * dd) < B * aft) zh = min(zh, dd * slope); }
  zh += (sl.x + sl.y) * 2.5 * zh;
  mk = smoothstep(D + .04, D - .04, zh) * step(-.05, zh);
  vec3 hc = btHullC(ty, sd);
  hc = mix(hc, vec3(.03), clamp(smoothstep(D - .12, D - .06, zh) + (1. - smoothstep(.05, .1, zh)), 0., 1.) * .7);
  vec3 mc = shadeIn(hc, vec3(0., sign(y) * sg, 0.), p, .8);
  foam = clamp(foam, 0., 1.) * bank;
  sl *= bank; ao *= bank; mk *= bank * .9;
  if (max(max(foam, ao), max(length(sl) * 6., mk)) < .006) discard;
  vec3 c = btWater(p, V, (fw * sl.x + vec3(0., sl.y, 0.)) * sg, mc, mk);
  c = mix(c, shadeIn(vec3(.82, .85, .84), up, p, 1.), foam);
  v.alb = vec3(0.); v.spec = 0.; v.emis = c * (1. - ao);
}
void vehBoat(inout Veh v, inout vec3 n, vec3 p, vec3 V, vec4 m, vec4 u){
  float fk = fract(m.w), mir = step(.5, fk), sd = (fk - .5 * mir) / .49, sg = 1. - 2. * mir;
  float y0 = 1.2 + floor(sd * 80.) * .05;                          // how far right of the centre line the boat keeps
  sd = fract(sd * 80.);                                            // and the boat's own random number
  vec3 q = vec3(m.x * sg, m.y * sg + y0, m.z);                     // boat coordinates: x to the bow, y to port
  if (u.x > 19.5) { btWake(v, p, V, q, sg, sd, u); return; }
  bool outside = gl_FrontFacing;
  if (!outside) n = -n;
  int part = int(u.x + .5), ty = int(u.y + .5);
  vec3 up = upAt(p), fw = vec3(up.z, 0., -up.x);
  vec3 nl = vec3(dot(n, fw) * sg, n.y * sg, dot(n, up));          // the normal in boat axes
  vec3 hullC = btHullC(ty, sd), trim = btTrimC(ty, sd);
  bool varnish = (ty == 1 && fract(sd * 7.31) < .4) || (ty == 3 && fract(sd * 7.31) >= .85) || (ty == 5 && fract(sd * 7.31) >= .55 && fract(sd * 7.31) < .8);
  v.spec = .25; v.gloss = 50.;
  if (part == 0) {                                                // hull: paint, sheer stripe, boot-top, grime at the water line
    float zs = u.w;                                               // height relative to the sheer
    vec3 c = varnish ? btWoodC(q.xz * vec2(1., 1.), hullC) : hullC;
    if (!outside) {                                               // inside an open boat
      c = ty == 3 || ty == 5 ? (varnish ? c : vec3(.42, .27, .13)) : vec3(.75, .74, .70);
      v.ao = .65 + .35 * smoothstep(-.5, 0., zs);
    } else {
      if (ty == 1 && !varnish) c = mix(c, trim, btBand(zs, -.42, -.24));
      if (ty == 0 || ty == 2) c = mix(c, vec3(.75, .62, .25), btBand(zs, -.16, -.13) * step(.5, fract(sd * 3.7)));
      if (ty == 7) c = mix(c, trim, btBand(zs, -.22, .01));
      if (ty == 3 || (ty == 5 && varnish)) {                      // clinker planking
        float pl = zs / .105;
        c *= 1. - .35 * btLine(pl, .06);
        c *= .9 + .1 * fract(pl);
      }
      if (ty == 7) {                                              // steel: plates, rust weeping from the deck edge
        c *= 1. - .3 * btLine(q.x / 2.4, .012) - .2 * btLine(zs / .6, .015);
        c = mix(c, vec3(.18, .07, .03), smoothstep(.62, .85, vnoise(vec2(q.x * 3.1, zs * .7))) * smoothstep(-.6, 0., zs) * .6);
      }
      // boot-top just above the water, and a film of grime at the water line
      vec3 boot = ty == 7 ? vec3(.30, .05, .03) : ty == 1 || ty == 0 ? vec3(.02) : ty == 4 || ty == 6 ? c : vec3(.06, .07, .09);
      c = mix(c, boot, btBand(q.z, -2., ty == 7 ? .18 : .09));
      float gr = (1. - smoothstep(0., .22, q.z)) * (.5 + .5 * vnoise(vec2(q.x * 2.3, q.z * 9.)));
      c = mix(c, vec3(.05, .06, .035), gr * .45);
      v.ao = mix(.6, 1., smoothstep(-.02, .5, q.z));
      // light thrown up off the water, rippling
      v.emis = AIR * .07 * (1. - smoothstep(0., .7, q.z)) * pow(vnoise(vec2(q.x * 1.7 + uTime * .6, q.z * 5. - uTime * 1.3)), 2.) * btFine(q.x * 1.7);
    }
    v.alb = c;
    v.spec = varnish ? .7 : ty == 7 ? .15 : .45; v.gloss = varnish ? 90. : 70.;
  } else if (part == 1) {                                         // decks
    int st = int(u.z + .5);
    vec3 c;
    if (st == 0 || st == 3) {                                     // laid teak, or varnished planks along the boat
      float pw = st == 0 ? .075 : .11, row = floor(q.y / pw);
      float h = btHash(row, floor(q.x / 2.2 + fract(row * .37) * 2.));
      c = (st == 0 ? vec3(.40, .29, .17) : vec3(.29, .11, .045)) * (.82 + .3 * h);
      c *= 1. - .6 * btLine(q.y / pw, .07) * btFine(q.y / pw);
      c *= 1. - .4 * btLine(q.x / 2.2 + fract(row * .37) * 2., .01);
      v.spec = st == 0 ? .08 : .6; v.gloss = st == 0 ? 15. : 90.;
    } else if (st == 1) { c = vec3(.30, .31, .32) * (.92 + .15 * vnoise(q.xy * 3.)); v.spec = .05; }              // non-skid
    else if (st == 2) { c = vec3(.78, .78, .75); v.spec = .3; }                                                  // white moulding
    else if (st == 4) { c = hullC * (.95 + .1 * vnoise(q.xy * 4.)); v.spec = .5; v.gloss = 60.; }               // same as the hull
    else if (st == 5) {                                           // board with a grooved traction pad
      c = hullC;
      float pad = btBand(q.x, -.9, .55) * step(abs(q.y), .3);
      c = mix(c, vec3(.06, .07, .08) * (1. - .4 * btLine(q.y / .03, .2)), pad); v.spec = .3;
    } else {                                                      // painted steel, worn
      c = vec3(.17, .19, .17) * (.85 + .3 * vnoise(q.xy * 1.3));
      c = mix(c, vec3(.15, .08, .04), smoothstep(.6, .8, vnoise(q.xy * 2.1 + 5.)) * .5); v.spec = .08;
    }
    v.alb = c;
  } else if (part == 2) {                                         // cabins: painted walls, windows (dark glass, a hint of passengers)
    float h = u.z, H = u.w;                                       // height above the cabin's base, and its full height
    vec3 c = varnish && ty == 1 ? btWoodC(q.xz, vec3(.29, .105, .04)) : trim;
    float glass = 0., inside = 0.;
    if (ty == 0) {                                                // river bus: a band of glass all round, glazed roof (h is 0..1 up the profile)
      float mull = btLine(q.x / 1.15, .035);
      glass = btBand(h, .13, .44) * (1. - mull) + btBand(h, .62, .96) * (1. - btLine(q.x / 1.15, .025));
      // passengers: heads behind the side glass, rows of seats and heads seen through the roof
      float row = floor(q.x / .85), occ = step(.3, btHash(row, sign(q.y) + sd * 9.));
      float hx = (fract(q.x / .85) - .5) * .85;
      float head = smoothstep(.13, .09, length(vec2(hx, (h - .34) * 2.6))) * occ;
      float sy = abs(q.y), seat = floor(sy / .48), sx = (fract(sy / .48) - .5) * .48;
      float occ2 = step(.35, btHash(row, seat * sign(q.y) + sd * 5.));
      float topHead = smoothstep(.13, .09, length(vec2(hx, sx))) * occ2 * step(sy, 1.2) * step(.6, h);
      float shoulder = smoothstep(1.1, .9, length(vec2((hx + .07) / .13, sx / .21))) * occ2 * step(sy, 1.2) * step(.6, h);
      inside = clamp(head + topHead, 0., 1.);
      vec3 shirt = BT_CLOTH[int(btHash(row * 3.1, seat + sd) * 7.99)];
      vec3 icol = mix(vec3(.035, .04, .045), shirt * .22, shoulder * step(.6, h));
      icol = mix(icol, (step(.6, h) > .5 ? BT_HAIR[int(btHash(row, seat * 7.) * 3.99)] : BT_SKIN[int(btHash(row * 7., seat) * 3.99)]) * .35, inside);
      float bk = smoothstep(-.6, -.8, nl.x);                     // the aft bulkhead: a glazed door
      glass = mix(glass, btBand(abs(q.y), -1., .4) * btBand(q.z - u.w, .02, 1.4), bk);
      c = mix(c, mix(vec3(.035, .04, .045), icol, pow(max(dot(n, V), 0.), .8)), glass);
    } else {                                                      // houses: a raked windscreen, side windows, a door aft
      float fr = smoothstep(.55, .75, nl.x), bk = smoothstep(-.55, -.75, nl.x);
      float sill = H * (ty == 7 ? .48 : .38), head = H * .88;
      float pitch = ty == 7 ? 1.05 : .95, px = (fract(q.x / pitch) - .5) * pitch;
      float side = btBand(h, sill, head) * smoothstep(pitch * .5 - .05, pitch * .5 - .09, abs(px));
      float front = btBand(h, H * .32, H * .93) * smoothstep(.02, .07, abs(abs(q.y) - .02)) ;
      float door = bk * btBand(h, .05, H * .9) * step(abs(q.y), .38);
      glass = mix(side, front, fr) * (1. - bk) + door;
      float sk = smoothstep(.16, .11, length(vec2(px, (h - H * .62) * 1.2))) * step(.6, btHash(floor(q.x / pitch), sign(q.y) + sd));
      c = mix(c, mix(vec3(.04, .05, .055), BT_HAIR[0] * .5, sk), glass);
    }
    v.alb = c;
    v.spec = mix(.3, .95, glass); v.gloss = mix(50., 220., glass);
    v.emis = glass * mix(SKYC, AIR, .6) * (.06 + .5 * pow(1. - max(dot(n, V), 0.), 3.));
  } else if (part == 3) {                                         // separate glass: windscreens
    v.alb = vec3(.035, .045, .05); v.spec = .95; v.gloss = 220.;
    v.emis = mix(SKYC, AIR, .6) * (.06 + .5 * pow(1. - max(dot(n, V), 0.), 3.));
  } else if (part == 4) {                                         // roofs: white, solar panels, or the cabin's colour
    int st = int(u.z + .5);
    if (st == 1) {
      vec2 g = vec2(q.x / .17, q.y / .17);
      float cell = max(btLine(g.x, .05), btLine(g.y, .05)), frm = max(btLine(q.x / 1.02, .02), btLine(q.y / 1.68, .02));
      v.alb = mix(vec3(.025, .04, .09), vec3(.12, .14, .2), cell * .5);
      v.alb = mix(v.alb, vec3(.55, .56, .58), frm);
      v.spec = .7; v.gloss = 140.;
    } else { v.alb = st == 2 ? trim : vec3(.80, .80, .78); v.spec = .3; }
  } else if (part == 5) {                                         // canvas: canopies, flags
    float k = fract(sd * 5.3);
    vec3 c = k < .3 ? vec3(.05, .07, .14) : k < .55 ? vec3(.76, .72, .62) : k < .75 ? vec3(.12, .25, .2) : vec3(.5, .08, .06);
    if (u.z > .5) c = abs(q.z - u.w) < .057 ? vec3(.8) : vec3(.05, .3, .15);   // a flag: green, white, green
    v.alb = c * (1. - .25 * btLine(q.x / .6, .03));
    v.spec = .05;
  } else if (part == 6) {                                         // stainless steel and aluminium
    v.alb = vec3(.55, .57, .6); v.spec = .9; v.gloss = 90.;
  } else if (part == 7) {                                         // people: hair, skin, clothes, life vests
    float ps = u.z; int pc = int(u.w + .5);
    vec3 skin = BT_SKIN[int(fract(ps * 3.7) * 3.99)], hair = BT_HAIR[int(fract(ps * 5.1) * 3.99)];
    vec3 top = BT_CLOTH[int(fract(ps * 11.3) * 7.99)], legs = fract(ps * 17.9) < .5 ? vec3(.09, .12, .2) : fract(ps * 17.9) < .75 ? vec3(.36, .31, .22) : vec3(.07);
    vec3 c = pc == 0 ? legs : pc == 1 ? top : pc == 3 ? (fract(ps * 23.) < .5 ? top : skin) : pc == 4 ? (fract(ps * 7.) < .5 ? vec3(.9, .3, .04) : vec3(.85, .7, .05)) : skin;
    if (pc == 2) {
      bool hat = fract(ps * 29.) < .18;
      c = mix(skin, hat ? vec3(.8, .75, .6) : hair, smoothstep(hat ? -.1 : .05, hat ? 0. : .25, nl.z + (hat ? 0. : -nl.x * .5)));
    }
    v.alb = c; v.spec = .05;
  } else if (part == 8) {                                         // fenders and soft rubbing strakes
    float k = fract(sd * 3.3);
    v.alb = ty == 2 ? (k < .5 ? vec3(.06, .08, .14) : vec3(.42, .44, .45)) : vec3(.03); v.spec = .25; v.gloss = 30.;
  } else if (part >= 9 && part <= 11) {                           // navigation lights: port red, starboard green, white
    vec3 lc = part == 9 ? vec3(1., .08, .05) : part == 10 ? vec3(.05, 1., .35) : vec3(1., .95, .85);
    v.alb = lc * .2; v.emis = lc * 4.; v.spec = .5;
  } else if (part == 12) {                                        // plants on the garden barges
    float ps = u.z, k = fract(ps * 7.7);
    vec3 c = u.w > .5 ? vec3(.17, .11, .06) : k < .3 ? vec3(.07, .19, .04) : k < .55 ? vec3(.12, .25, .05) : k < .8 ? vec3(.05, .14, .05) : vec3(.20, .27, .06);
    if (u.w < .5) {
      c *= .7 + .6 * vnoise(q.xy * 7. + q.z * 5.) * btFine(q.x * 7.) + .3 * (1. - btFine(q.x * 7.));
      float fl = smoothstep(.8, .9, vnoise(q.xy * 11. + ps * 40.)) * step(.6, fract(ps * 3.1)) * btFine(q.x * 11.);
      c = mix(c, fract(ps * 13.) < .5 ? vec3(.85, .35, .5) : vec3(.9, .8, .3), fl);
      v.ao = .7 + .3 * smoothstep(-.5, .8, nl.z);
    }
    v.alb = c; v.spec = .03;
  } else if (part == 13) {                                        // soil in the beds
    v.alb = vec3(.09, .06, .04) * (.8 + .4 * vnoise(q.xy * 5.)) * (1. - .3 * btLine(q.y / .5, .1)); v.spec = 0.;
  } else if (part == 14) {                                        // cargo: containers, hatch covers
    int st = int(u.z + .5);
    float k = fract(u.w * 7.9 + sd);
    if (st == 0) {
      vec3 c = k < .2 ? vec3(.45, .1, .06) : k < .4 ? vec3(.07, .2, .35) : k < .6 ? vec3(.12, .3, .15) : k < .8 ? vec3(.6, .45, .12) : vec3(.55, .55, .55);
      float rib = abs(nl.z) < .5 ? btLine((abs(nl.x) > .5 ? q.y : q.x) / .28, .2) : 0.;
      v.alb = c * (1. - .25 * rib); v.spec = .2;
    } else {
      vec3 c = trim * .6 + vec3(.12);
      v.alb = c * (1. - .35 * btLine(q.x / 1.6, .02)); v.spec = .15;
    }
  } else if (part == 15) {                                        // varnished wood: oars, paddles, thwarts, gunwales
    v.alb = btWoodC(q.xy + q.z, vec3(.42, .25, .11)); v.spec = .5; v.gloss = 70.;
  } else if (part == 16) {                                        // cushions
    float k = fract(sd * 9.1);
    v.alb = k < .4 ? vec3(.74, .71, .62) : k < .7 ? vec3(.07, .09, .17) : vec3(.40, .42, .44); v.spec = .05;
  } else {                                                        // black: rubber, coamings, drives, tyres
    v.alb = vec3(.03, .03, .035); v.spec = .3; v.gloss = 40.;
  }
}
`;

// ---------------------------------------------------------------- a small mesh builder in boat coordinates
const P = { HULL: 0, DECK: 1, CABIN: 2, GLASS: 3, ROOF: 4, CANVAS: 5, METAL: 6, PERSON: 7, FENDER: 8, NAVR: 9, NAVG: 10, NAVW: 11, PLANT: 12, SOIL: 13, CARGO: 14, WOOD: 15, CUSHION: 16, DARK: 17 };
const BUS = 0, TAXI = 1, LAUNCH = 2, ROW = 3, KAYAK = 4, CANOE = 5, SUP = 6, BARGE = 7;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function mesh(ty) {
  const pos = [], au = [], idx = [];
  let T = [0, 0, 0, 1, 0];                 // placement: offset x, y, z, and cos, sin of a turn about z
  const g = {
    v(x, y, z, part, a = 0, b = 0) {
      const [ox, oy, oz, c, s] = T;
      pos.push(ox + c * x - s * y, oy + s * x + c * y, oz + z); au.push(part, ty, a, b);
      return pos.length / 3 - 1;
    },
    tri(a, b, c) { idx.push(a, b, c); },
    quad(a, b, c, d) { idx.push(a, b, c, a, c, d); },
    // run f with the placement moved to (x, y, z) and turned by yaw
    at(x, y, z, yaw, f) {
      const o = T, [ox, oy, oz, c, s] = o, cy = Math.cos(yaw), sy = Math.sin(yaw);
      T = [ox + c * x - s * y, oy + s * x + c * y, oz + z, c * cy - s * sy, s * cy + c * sy];
      f(); T = o;
    },
    // a surface over nu x nv cells; f(i, j) gives [x, y, z, part, a, b]
    grid(nu, nv, f) {
      const i0 = pos.length / 3;
      for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) g.v(...f(i, j));
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i0 + i * (nv + 1) + j; g.quad(a, a + nv + 1, a + nv + 2, a + 1); }
    },
    // a fan closing a ring of points round a centre
    fan(c, ring, part, a = 0, b = 0, closed = false) {
      const i0 = g.v(...c, part, a, b), r0 = pos.length / 3, n = ring.length;
      for (const p of ring) g.v(p[0], p[1], p[2], part, a, p[3] ?? b);
      for (let k = 0; k < n - (closed ? 0 : 1); k++) g.tri(i0, r0 + k, r0 + (k + 1) % n);
    },
    box(x, hx, y, hy, z0, z1, part, a = 0, b = 0) {
      const c = [[x - hx, y - hy, z0], [x + hx, y - hy, z0], [x + hx, y + hy, z0], [x - hx, y + hy, z0], [x - hx, y - hy, z1], [x + hx, y - hy, z1], [x + hx, y + hy, z1], [x - hx, y + hy, z1]];
      for (const f of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) {
        const k = f.map((i) => g.v(...c[i], part, a, b)); g.quad(k[0], k[1], k[2], k[3]);
      }
    },
    // a square beam from p0 to p1, w wide and h deep
    beam(p0, p1, w, h, part, a = 0, b = 0) {
      const d = norm(sub(p1, p0));
      let sd = cross(d, [0, 0, 1]); if (Math.hypot(...sd) < 1e-3) sd = [0, 1, 0];
      sd = norm(sd); const upv = cross(sd, d);
      const c = [];
      for (const p of [p0, p1]) for (const [s, t] of [[-1, -1], [1, -1], [1, 1], [-1, 1]])
        c.push([p[0] + sd[0] * s * w / 2 + upv[0] * t * h / 2, p[1] + sd[1] * s * w / 2 + upv[1] * t * h / 2, p[2] + sd[2] * s * w / 2 + upv[2] * t * h / 2]);
      for (const f of [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [0, 3, 2, 1], [4, 5, 6, 7]]) {
        const k = f.map((i) => g.v(...c[i], part, a, b)); g.quad(k[0], k[1], k[2], k[3]);
      }
    },
    ell(x, y, z, rx, ry, rz, nu, nv, part, a = 0, b = 0) {
      g.grid(nu, nv, (i, j) => {
        const ph = i / nu * Math.PI * 2, la = -Math.PI / 2 + j / nv * Math.PI;
        return [x + rx * Math.cos(la) * Math.cos(ph), y + ry * Math.cos(la) * Math.sin(ph), z + rz * Math.sin(la), part, a, b];
      });
    },
    // a closed profile [[out, up], ...] swept along a path; out is to port (side +1) or starboard (side -1)
    sweep(path, prof, side, part, a = 0, b = 0) {
      const n = path.length;
      g.grid(n - 1, prof.length, (i, j) => {
        const p = path[i], d = norm(sub(path[Math.min(i + 1, n - 1)], path[Math.max(i - 1, 0)]));
        const o = norm(cross([0, 0, 1], d)).map((x) => x * side), upv = cross(d, o).map((x) => x * side);
        const [s, t] = prof[j % prof.length];
        return [p[0] + o[0] * s + upv[0] * t, p[1] + o[1] * s + upv[1] * t, p[2] + o[2] * s + upv[2] * t, part, a, b];
      });
    },
    geometry(THREE) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("aU", new THREE.Float32BufferAttribute(au, 4));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return geo;
    },
  };
  return g;
}
const RECT = (w, h, x0 = 0, z0 = 0) => [[x0, z0], [x0 + w, z0], [x0 + w, z0 + h], [x0, z0 + h]];
const ROUND = (r, k = 6) => Array.from({ length: k }, (_, i) => [r * Math.cos(i / k * Math.PI * 2), r * Math.sin(i / k * Math.PI * 2)]);

// ---------------------------------------------------------------- the hull, lofted from stations
// t runs from the stern (0) to the stem (1); the water line's half breadth wl(t) is fullest at tm, tapering to the
// stem with exponents e1, e2 and to a transom aft fraction of the beam wide; the deck line dk(t) is fuller and wider
// (flare), the sheer hs(t) rises toward both ends, the stem is raked forward.
function hull(g, o) {
  const { L, B, D, T = 0.5, sb = 0.2, ss = 0.05, aft = 0.8, ea = 2.4, e1 = 1.9, e2 = 0.65, fl = 0.1, rake = 0.4, tm = 0.45, NI = 22 } = o;
  const pw = (x, e) => Math.pow(Math.max(x, 0), e);
  const shape = (t, k1, k2, ka) => t >= tm ? pw(1 - pw((t - tm) / (1 - tm), k1), k2) : 1 - (1 - aft) * pw((tm - t) / tm, ka);
  const wl = (t) => B * shape(t, e1, e2, ea);
  const dk = (t) => B * (1 + fl) * shape(t, e1 * 1.25, e2 * 0.7, ea * 1.2);
  const hs = (t) => D + sb * pw((t - 0.5) / 0.5, 2) + ss * pw((0.5 - t) / 0.5, 2);
  const dr = (t) => T * (1 - 0.75 * Math.pow(Math.abs(2 * t - 1), 3));
  const xz = (t, z) => -L / 2 + t * L + rake * Math.pow(t, 6) * z;
  const yAt = (t, z) => wl(t) + (dk(t) - wl(t)) * pw(clamp(z / hs(t), 0, 1), 0.75);
  const ts = Array.from({ length: NI + 1 }, (_, i) => 0.5 - 0.5 * Math.cos(Math.PI * i / NI));
  // a section from the port sheer down round the keel and up to the starboard sheer
  const sec = (t) => {
    const h = hs(t), w = wl(t), d = dr(t);
    const half = [[yAt(t, h), h], [yAt(t, h * 0.7), h * 0.7], [yAt(t, h * 0.4), h * 0.4], [yAt(t, h * 0.15), h * 0.15], [w, 0], [w * 0.97, -d * 0.35], [w * 0.7, -d * 0.85]];
    return [...half, [0, -d], ...half.slice().reverse().map(([y, z]) => [-y, z])];
  };
  const S = ts.map(sec), nj = S[0].length - 1;
  g.grid(NI, nj, (i, j) => { const t = ts[i], [y, z] = S[i][j]; return [xz(t, z), y, z, P.HULL, t, z - hs(t)]; });
  if (aft > 0) {                                                  // the transom
    const h0 = hs(0);
    g.fan([xz(0, h0 * 0.3), 0, h0 * 0.3], S[0].map(([y, z]) => [xz(0, z), y, z, z - h0]), P.HULL, 0, -h0 * 0.7, true);
  }
  const H = {
    L, B, D, aft, wl, dk, hs, xz, yAt, ts,
    tOf: (x) => clamp((x + L / 2) / L, 0, 1),
    sheer: (t, s) => [xz(t, hs(t)), s * dk(t), hs(t)],
    // the stations between two t, with the ends added
    span: (t0, t1) => [t0, ...ts.filter((t) => t > t0 + 1e-3 && t < t1 - 1e-3), t1],
    // a cambered deck between t0 and t1 at the sheer; across from -y to +y
    deck(t0, t1, camber, style) {
      const tt = H.span(t0, t1);
      g.grid(tt.length - 1, 6, (i, j) => { const t = tt[i], y = dk(t) * (j / 3 - 1); return [xz(t, hs(t)), y, hs(t) + camber * (1 - (y / Math.max(dk(t), 1e-3)) ** 2), P.DECK, style, 0]; });
    },
    // a floor inside an open hull at height z
    sole(t0, t1, z, style = 0, part = P.DECK) {
      const tt = H.span(t0, t1);
      g.grid(tt.length - 1, 4, (i, j) => { const t = tt[i], y = yAt(t, z) * 0.98 * (j / 2 - 1); return [xz(t, z), y, z, part, style, 0]; });
    },
    // a rail swept along the sheer on one side (s = +1 port, -1 starboard), raised by dz and moved in by din
    rail(t0, t1, s, prof, part, dz = 0, din = 0) {
      const path = H.span(t0, t1).map((t) => { const p = H.sheer(t, s); return [p[0], p[1] - s * din, p[2] + dz]; });
      g.sweep(path, prof, s, part);
      return path;
    },
    // stanchions along a rail path
    posts(path, h, step, part) {
      let acc = step;
      for (let i = 0; i < path.length; i++) {
        if (i > 0) acc += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
        if (acc >= step || i === path.length - 1) { acc = 0; const p = path[i]; g.beam([p[0], p[1], p[2] - h], p, 0.035, 0.035, part); }
      }
    },
  };
  return H;
}

// a deckhouse: a rounded rectangle in plan from x0 to x1, half width W, standing at z0 (or on the sheer), hgt tall,
// leaning in by tb at the top and with its front raked back by rk; a roof slab overhanging by oh
function house(g, H, x0, x1, W, hgt, o = {}) {
  const { tb = 0.08, rk = 0.3, oh = 0.06, roof = 0, nx = 3.2, z0 = null, camber = 0.05 } = o;
  const cx = (x0 + x1) / 2, hl = (x1 - x0) / 2, N = 28;
  const plan = Array.from({ length: N + 1 }, (_, k) => {
    const a = k / N * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), e = c > 0 ? 2 / nx : 2 / 7;
    return [cx + hl * Math.sign(c) * Math.pow(Math.abs(c), e), W * Math.sign(s) * Math.pow(Math.abs(s), 2 / 7), c];
  });
  const base = (x) => z0 ?? H.hs(H.tOf(x)) - 0.02;
  const lev = [0, 0.45, 1];
  const at = (k, f) => {
    const [x, y, c] = plan[k], z = base(x) + f * hgt, dx = Math.max(c, 0) * rk * f;
    return [x - dx - Math.sign(x - cx) * tb * f * 0.3, y * (1 - tb * f / W), z];
  };
  g.grid(lev.length - 1, N, (i, k) => { const p = at(k, lev[i]); return [...p, P.CABIN, lev[i] * hgt, hgt]; });
  // the roof slab: edge band and a cambered top
  const top = plan.map((_, k) => { const p = at(k, 1); const dx = p[0] - cx, d = Math.hypot(dx, p[1]) || 1; return [p[0] + dx / d * oh, p[1] + p[1] / d * oh, p[2]]; });
  g.grid(1, N, (i, k) => { const p = top[k]; return [p[0], p[1], p[2] + i * 0.07, P.ROOF, roof, 0]; });
  const zc = base(cx) + hgt + 0.07 + camber;
  g.fan([cx - rk * hgt * 0.5, 0, zc], top.map((p) => [p[0], p[1], p[2] + 0.07]), P.ROOF, roof, 0);
  return { top: zc };
}

// a person at (x, y, z) facing yaw. pose 0 seated (z = seat), 1 standing (z = feet), 2 in a kayak (z = deck).
// hands: optional [[x, y, z], [x, y, z]] in the person's frame
function person(g, x, y, z, yaw, pose, seed, o = {}) {
  const { pfd = false, hands = null, sc = 0.93 + 0.14 * ((seed * 7.3) % 1) } = o;
  const Pp = (k) => [P.PERSON, seed, k];
  g.at(x, y, z, yaw, () => {
    let zt = 0;
    if (pose === 1) { for (const s of [-1, 1]) g.box(0, 0.07, s * 0.095, 0.065, 0, 0.8 * sc, ...Pp(0)); zt = 0.8 * sc; }
    else if (pose === 0) { g.box(0.2, 0.22, 0, 0.17, 0.01, 0.15, ...Pp(0)); g.box(0.44, 0.06, 0, 0.15, -0.4, 0.1, ...Pp(0)); }
    else zt = -0.06;
    const ring = [[0, 0.17, 0.12], [0.35, 0.155, 0.11], [0.75, 0.2, 0.125], [1, 0.12, 0.09]];
    g.grid(ring.length - 1, 6, (i, j) => {
      const [f, ry, rx] = ring[i], a = j / 6 * Math.PI * 2;
      return [rx * sc * Math.cos(a), ry * sc * Math.sin(a), zt + f * 0.56 * sc, ...Pp(pfd && f < 0.9 ? 4 : 1)];
    });
    const sh = zt + 0.5 * sc;
    const rest = pose === 1 ? [[0.05, -0.25, zt - 0.02], [0.05, 0.25, zt - 0.02]] : [[0.32, -0.18, zt + 0.22], [0.32, 0.18, zt + 0.22]];
    const hs = (hands ?? rest).slice().sort((a, b) => a[1] - b[1]);
    for (let k = 0; k < 2; k++) g.beam([0.02, (k ? 1 : -1) * 0.2 * sc, sh], hs[k], 0.075, 0.075, ...Pp(3));
    g.ell(0.01, 0, zt + 0.69 * sc, 0.1 * sc, 0.085 * sc, 0.115 * sc, 6, 4, ...Pp(2));
  });
}

// ---------------------------------------------------------------- the boat types
// each returns { H, casters: [[x0, x1, half width, top]], span (paddle reach, 0 for a motor) }
const LIGHTS = (g, x, y, z, part, r = 0.05) => g.box(x, r, y, r, z, z + r * 1.6, part);

function riverBus(g, R, seed) {
  const L = 17 + 4 * R(), H = hull(g, { L, B: 1.62, D: 0.62, T: 0.9, sb: 0.22, ss: 0.12, aft: 0.62, ea: 2, e1: 2.2, e2: 0.55, fl: 0.05, rake: 0.35, NI: 26 });
  const xa = -L / 2 + 3, xb = L / 2 - 0.9, rn = 2.2, W = 1.4, ta = H.tOf(xa);
  H.deck(0, ta + 0.01, 0.04, 0);
  H.deck(ta, 1, 0.04, 1);
  // the glazed cabin, lofted along the boat: low wall, a band of glass, glass roof panels either side of a spine
  const prof = [[1, 0, 0], [1, 0.28, 0.1], [0.97, 1.0, 0.46], [0.88, 1.24, 0.6], [0.64, 1.44, 0.75], [0.32, 1.55, 0.9], [0, 1.58, 1]];
  const full = [...prof.map(([y, z, b]) => [-y, z, b]), ...prof.slice(0, -1).reverse()];
  const NK = 24, xsAt = (k) => { const f = k / NK; return xa + (xb - xa) * (1 - Math.pow(1 - f, 1.6)); };
  g.grid(NK, full.length - 1, (k, j) => {
    const x = xsAt(k), t = H.tOf(x), e = x > xb - rn ? Math.sqrt(Math.max(0, 1 - ((x - xb + rn) / rn) ** 2)) : 1;
    const w = Math.max(0.02, Math.min(W * e, H.dk(t) - 0.22)), [fy, fz, b] = full[j];
    return [x, fy * w, H.hs(t) + 0.02 + fz * (0.72 + 0.28 * e), P.CABIN, b, 1];
  });
  { const t = H.tOf(xa), z = H.hs(t) + 0.02, w = Math.min(W, H.dk(t) - 0.22); g.fan([xa, 0, z + 0.7], full.map(([fy, fz]) => [xa, fy * w, z + fz, z]), P.CABIN, 0.5, z, true); }
  // rubbing strake all round, rails round the open stern deck, a flag
  const rub = [[0, -0.12], [0.07, -0.1], [0.09, -0.02], [0.05, 0.02], [0, 0.02]];
  for (const s of [-1, 1]) H.rail(0, 1, s, rub, P.DARK);
  g.beam([H.xz(0, H.hs(0)) - 0.03, -H.dk(0), H.hs(0) - 0.05], [H.xz(0, H.hs(0)) - 0.03, H.dk(0), H.hs(0) - 0.05], 0.1, 0.12, P.DARK);
  const tr = H.tOf(xa - 0.1);
  for (const s of [-1, 1]) { const path = H.rail(0.02, tr, s, ROUND(0.022, 4), P.METAL, 0.85, 0.06); H.posts(path, 0.85, 1.1, P.METAL); }
  const xs = H.xz(0.02, H.hs(0.02)), ys = H.dk(0.02) - 0.06, zs = H.hs(0.02) + 0.85;
  g.beam([xs, -ys, zs], [xs, ys, zs], 0.04, 0.04, P.METAL);
  g.beam([xs + 0.05, 0, zs - 0.85], [xs + 0.05, 0, zs + 0.55], 0.03, 0.03, P.METAL);
  g.grid(1, 1, (i, j) => [xs + 0.05 - i * 0.55, 0, zs + 0.2 + j * 0.34, P.CANVAS, 1, zs + 0.37]);
  // people out on the stern deck
  const n = Math.floor(R() * 3.5);
  for (let k = 0; k < n; k++) person(g, -L / 2 + 0.9 + R() * 1.6, (R() - 0.5) * 1.8, H.hs(0.1) + 0.04, R() * 6.3, 1, R());
  // lights: side lights at the cabin's shoulders, a masthead light, a stern light
  const tf = H.tOf(xb - 1.4), zf = H.hs(tf) + 1.15, wf = Math.min(W * 0.95, H.dk(tf) - 0.25);
  LIGHTS(g, xb - 1.4, wf, zf, P.NAVR); LIGHTS(g, xb - 1.4, -wf, zf, P.NAVG);
  g.beam([xb - 1.6, 0, H.hs(tf) + 1.6], [xb - 1.6, 0, H.hs(tf) + 2.1], 0.04, 0.04, P.METAL);
  LIGHTS(g, xb - 1.6, 0, H.hs(tf) + 2.1, P.NAVW);
  LIGHTS(g, xs - 0.02, 0, zs + 0.02, P.NAVW, 0.04);
  return { H, casters: [[xa, xb, W, H.hs(0.5) + 1.6]], span: 0 };
}

function waterTaxi(g, R, seed) {
  const L = 10 + 1.6 * R(), H = hull(g, { L, B: 1.3, D: 0.78, T: 0.7, sb: 0.34, ss: 0.06, aft: 0.84, ea: 2.6, e1: 1.7, e2: 0.75, fl: 0.1, rake: 0.7, NI: 24 });
  const wood = (seed * 7.31) % 1 < 0.4, x0 = -1.0, x1 = L / 2 - 3.3, tc = H.tOf(x1 - 0.3), ta = H.tOf(x0);
  H.deck(tc, 1, 0.07, wood ? 3 : 0);
  // aft cockpit: a sole, side decks, a transom bench with a backrest, side benches
  const zs = 0.36;
  H.sole(0, ta + 0.02, zs, wood ? 3 : 0);
  for (const s of [-1, 1]) {
    const tt = H.span(0, tc);
    g.grid(tt.length - 1, 1, (i, j) => { const t = tt[i], y = s * (H.dk(t) - j * 0.2); return [H.xz(t, H.hs(t)), y, H.hs(t) + 0.01, P.DECK, wood ? 3 : 0, 0]; });
  }
  const xt = H.xz(0, zs), wt = H.yAt(0.05, zs + 0.4) - 0.05;
  g.box(xt + 0.3, 0.28, 0, wt, zs, zs + 0.38, P.CUSHION);
  g.box(xt + 0.08, 0.07, 0, wt, zs + 0.38, zs + 0.72, P.CUSHION);
  for (const s of [-1, 1]) g.box(x0 - 0.9, 0.55, s * (H.yAt(0.4, zs + 0.4) - 0.35), 0.22, zs, zs + 0.4, P.CUSHION);
  house(g, H, x0, x1, 1.13, 1.32, { rk: 0.5, roof: wood ? 2 : 1, nx: 2.6 });
  // a stainless rubbing strake, a pulpit at the bow
  for (const s of [-1, 1]) H.rail(0, 1, s, [[0, -0.07], [0.04, -0.06], [0.04, -0.01], [0, 0]], wood ? P.METAL : P.DARK);
  for (const s of [-1, 1]) { const path = H.rail(0.86, 0.995, s, ROUND(0.02, 4), P.METAL, 0.5, 0.05); H.posts(path, 0.5, 0.6, P.METAL); }
  // passengers in the cockpit
  const n = Math.floor(R() * 3.2);
  for (let k = 0; k < n; k++) {
    if (k === 0) person(g, xt + 0.45, (R() - 0.5) * 1.2, zs + 0.4, 0, 0, R());
    else { const s = k === 1 ? 1 : -1; person(g, x0 - 0.9 + (R() - 0.5) * 0.6, s * (H.yAt(0.4, zs + 0.4) - 0.42), zs + 0.4, -s * Math.PI / 2, 0, R()); }
  }
  const tl = H.tOf(x1 - 0.2), zl = H.hs(tl) + 1.32;
  LIGHTS(g, x1 - 0.5, 1.02, zl - 0.3, P.NAVR); LIGHTS(g, x1 - 0.5, -1.02, zl - 0.3, P.NAVG);
  g.beam([x0 + 0.5, 0, zl + 0.1], [x0 + 0.5, 0, zl + 0.65], 0.035, 0.035, P.METAL);
  LIGHTS(g, x0 + 0.5, 0, zl + 0.65, P.NAVW, 0.04);
  return { H, casters: [[x0, x1, 1.15, H.hs(0.5) + 1.4]], span: 0 };
}

function launch(g, R, seed) {
  const L = 5.6 + 1.4 * R(), H = hull(g, { L, B: 1.02, D: 0.62, T: 0.5, sb: 0.2, ss: 0.05, aft: 0.78, ea: 2.4, e1: 1.9, e2: 0.62, fl: 0.12, rake: 0.5, NI: 20 });
  const xf = L / 2 - 1.3, tf = H.tOf(xf), zs = 0.16;
  H.deck(tf, 1, 0.05, R() < 0.6 ? 0 : 2);
  H.sole(0.02, tf + 0.01, zs, 0);
  { const z1 = H.hs(tf); g.grid(1, 4, (i, j) => { const z = zs + i * (z1 - zs), y = H.yAt(tf, z) * 0.98 * (j / 2 - 1); return [H.xz(tf, z), y, z, P.HULL, tf, -1]; }); }   // bulkhead under the foredeck
  // a varnished gunwale cap and the thick round fender sloeps wear all round
  for (const s of [-1, 1]) H.rail(0, 1, s, [[-0.05, 0], [0.02, 0], [0.02, 0.04], [-0.05, 0.04]], P.WOOD);
  for (const s of [-1, 1]) H.rail(0.02, 0.99, s, ROUND(0.055, 6).map(([a, b]) => [a + 0.03, b - 0.13]), P.FENDER);
  // U-shaped seating with cushions, a table, a little console with a screen, an electric pod
  const zb = 0.44, tb0 = 0.14, tb1 = Math.min(0.72, tf - 0.03);
  for (const s of [-1, 1]) {
    const path = H.span(tb0, tb1).map((t) => [H.xz(t, zb), s * (H.yAt(t, zb) - 0.22), zs]);
    g.sweep(path, [[-0.19, 0], [0.19, 0], [0.19, zb - zs], [-0.19, zb - zs]], s, P.HULL, 0.5, -1);
    g.sweep(path.map((p) => [p[0], p[1], zb]), [[-0.2, 0], [0.2, 0], [0.18, 0.08], [-0.18, 0.08]], s, P.CUSHION);
  }
  const xt = H.xz(0.02, zs), wt = H.yAt(0.1, zb) - 0.05;
  g.box(xt + 0.38, 0.3, 0, wt, zs, zb, P.HULL, 0.5, -1);
  g.box(xt + 0.38, 0.3, 0, wt, zb, zb + 0.08, P.CUSHION);
  const xm = H.xz(0.45, zs);
  g.box(xm, 0.3, 0, 0.22, zb + 0.18, zb + 0.22, P.WOOD); g.box(xm, 0.04, 0, 0.04, zs, zb + 0.18, P.METAL);
  const tq = 0.62, yq = -(H.yAt(tq, 0.5) - 0.32);
  g.box(H.xz(tq, zs), 0.2, yq, 0.17, zs, 0.95, P.HULL, 0.5, -1);
  g.beam([H.xz(tq, zs) + 0.16, yq, 0.95], [H.xz(tq, zs) + 0.26, yq, 1.2], 0.36, 0.02, P.GLASS);
  g.box(xt - 0.08, 0.1, 0, 0.09, -0.3, 0.25, P.DARK);
  // a canvas bimini on some
  if (R() < 0.35) {
    const xa = xt + 0.25, xb2 = xm + 0.7, wc = H.yAt(0.4, 0.6) - 0.06, zc = 1.75;
    g.grid(6, 8, (i, j) => { const x = xa + (xb2 - xa) * i / 6, y = wc * (j / 4 - 1); return [x, y, zc + 0.1 * (1 - (y / wc) ** 2) - 0.03 * Math.sin(i / 6 * Math.PI), P.CANVAS, 0, 0]; });
    for (const x of [xa + 0.05, xb2 - 0.05]) for (const s of [-1, 1]) { const t = H.tOf(x); g.beam([x, s * (H.yAt(t, 0.6) - 0.04), H.hs(t)], [x, s * (wc - 0.02), zc], 0.025, 0.025, P.METAL); }
  }
  // people round the table
  const n = 1 + Math.floor(R() * 5), seats = [[xt + 0.38, 0, 0], [xm - 0.25, 1, 0], [xm + 0.25, -1, 0], [xm + 0.35, 1, 0], [xm - 0.35, -1, 0]];
  for (let k = 0; k < Math.min(n, 5); k++) {
    const [x, s] = seats[k], t = H.tOf(x);
    if (s === 0) person(g, x, (R() - 0.5) * 0.5, zb + 0.06, 0, 0, R());
    else person(g, x, s * (H.yAt(t, zb) - 0.3), zb + 0.06, -s * Math.PI / 2, 0, R());
  }
  LIGHTS(g, H.xz(0.9, 0.7), H.dk(0.9) - 0.04, H.hs(0.9) + 0.02, P.NAVR, 0.035); LIGHTS(g, H.xz(0.9, 0.7), -H.dk(0.9) + 0.04, H.hs(0.9) + 0.02, P.NAVG, 0.035);
  g.beam([xt + 0.05, 0.35, H.hs(0)], [xt + 0.05, 0.35, H.hs(0) + 0.8], 0.025, 0.025, P.METAL); LIGHTS(g, xt + 0.05, 0.35, H.hs(0) + 0.8, P.NAVW, 0.035);
  return { H, casters: [[-L / 2 + 0.3, L / 2 - 1, 1.0, 1.2]], span: 0 };
}

function rowingBoat(g, R, seed) {
  const L = 3.7 + 0.7 * R(), H = hull(g, { L, B: 0.52, D: 0.37, T: 0.22, sb: 0.2, ss: 0.1, aft: 0.42, ea: 2.2, e1: 1.75, e2: 0.7, fl: 0.28, rake: 0.25, NI: 18 });
  H.sole(0.1, 0.86, 0.05, 0, P.WOOD);
  for (const s of [-1, 1]) H.rail(0, 1, s, [[-0.04, -0.01], [0.015, -0.01], [0.015, 0.025], [-0.04, 0.025]], P.WOOD);
  const zt = 0.28, th = [0.18, 0.5, 0.8];
  for (const t of th) { const x = H.xz(t, zt), w = H.yAt(t, zt) - 0.01; g.box(x, 0.11, 0, w, zt, zt + 0.035, P.WOOD); }
  // the rower faces the stern; oars through the rowlocks, blades in the water or feathered on the recovery
  const xr = H.xz(0.5, zt), xl = xr - 0.32, tl = H.tOf(xl), yl = H.dk(tl), zl = H.hs(tl) + 0.06;
  const ph = R(), drive = ph < 0.55, sw = (ph - 0.5) * 1.1, zb = drive ? -0.03 : 0.25, hands = [];
  for (const s of [-1, 1]) {
    g.box(xl, 0.02, s * yl, 0.02, zl - 0.06, zl, P.METAL);
    const d = [-Math.sin(sw), s * Math.cos(sw)], at = (k) => [xl + d[0] * k, s * yl + d[1] * k, zl + (zb - zl) * k / 1.08];
    const hd = at(-0.58), tip = at(1.08), b0 = at(0.68);
    g.beam(hd, tip, 0.04, 0.04, P.WOOD);
    g.beam(b0, tip, drive ? 0.02 : 0.15, drive ? 0.15 : 0.02, P.WOOD);
    hands.push([-(hd[0] - xr), -hd[1], hd[2] - zt - 0.04]);
  }
  person(g, xr, 0, zt + 0.04, Math.PI, 0, R(), { hands });
  if (R() < 0.55) person(g, H.xz(0.18, zt) + 0.05, 0, zt + 0.04, 0, 0, R());
  return { H, casters: [[-L / 2, L / 2, 0.6, 0.9]], span: 1.75 };
}

function kayak(g, R, seed) {
  const two = R() < 0.3, L = two ? 5.4 + 0.5 * R() : 4.1 + 0.8 * R();
  const H = hull(g, { L, B: two ? 0.33 : 0.3, D: 0.19, T: 0.12, sb: 0.1, ss: 0.07, aft: 0, ea: 1.7, e1: 1.6, e2: 0.9, fl: 0.06, rake: 0.25, NI: 18 });
  H.deck(0, 1, 0.1, 4);
  const cps = two ? [-0.95, 0.75] : [-0.15];
  for (const xc of cps) {
    const t = H.tOf(xc), z = H.hs(t) + 0.09;
    const ring = Array.from({ length: 13 }, (_, k) => { const a = k / 12 * Math.PI * 2; return [xc + 0.42 * Math.cos(a), 0.22 * Math.sin(a), z]; });
    g.sweep(ring, [[0, 0], [0.03, 0], [0.03, 0.035], [0, 0.035]], 1, P.DARK);
    g.fan([xc, 0, z + 0.02], ring.map((p) => [p[0], p[1], p[2] + 0.02]), P.DARK);
    // a paddler in a life vest; the paddle crosses the boat, one blade in the water
    const ph = R() < 0.5 ? 1 : -1, xp = 0.38, lo = [xp + 0.1, ph * 0.75, 0.25 - z], hi = [xp - 0.15, -ph * 0.72, 1.0 - z];
    const mid = (f) => [lo[0] + (hi[0] - lo[0]) * f, lo[1] + (hi[1] - lo[1]) * f, lo[2] + (hi[2] - lo[2]) * f];
    person(g, xc - 0.12, 0, z - 0.02, 0, 2, R(), { pfd: true, hands: [mid(0.33), mid(0.67)].map((p) => [p[0] + 0.12, p[1], p[2] + 0.02]) });
    g.at(xc, 0, z, 0, () => {
      g.beam(lo, hi, 0.03, 0.03, P.DARK);
      for (const [a, b] of [[lo, hi], [hi, lo]]) {
        const d = norm(sub(a, b)), e = [a[0] + d[0] * 0.45, a[1] + d[1] * 0.45, a[2] + d[2] * 0.45];
        g.beam(a, e, 0.17, 0.015, P.CANVAS);
      }
    });
  }
  return { H, casters: [[-L / 2, L / 2, 0.32, 0.6]], span: 1.1 };
}

function canoe(g, R, seed) {
  const L = 4.7 + 0.5 * R(), H = hull(g, { L, B: 0.43, D: 0.32, T: 0.15, sb: 0.28, ss: 0.28, aft: 0, ea: 1.8, e1: 1.7, e2: 0.8, fl: 0.12, rake: 0.3, NI: 20 });
  H.sole(0.15, 0.85, 0.04, 0, P.WOOD);
  for (const s of [-1, 1]) H.rail(0, 1, s, [[-0.03, -0.01], [0.015, -0.01], [0.015, 0.025], [-0.03, 0.025]], P.WOOD);
  for (const t of [0.5]) { const z = H.hs(t) - 0.03; g.box(H.xz(t, z), 0.04, 0, H.yAt(t, z) - 0.01, z, z + 0.025, P.WOOD); }
  // two paddlers on low seats, single blades on opposite sides
  const pads = [[0.22, -1], [0.78, 1]];
  for (const [t, s] of pads) {
    const z = 0.2, x = H.xz(t, z), w = H.yAt(t, z) - 0.01;
    g.box(x, 0.12, 0, w, z, z + 0.03, P.WOOD);
    const top = [x + 0.25, s * 0.2, 0.95], blade = [x - 0.2, s * 0.62, -0.05];
    const lp = (f) => [top[0] + (blade[0] - top[0]) * f - x, top[1] + (blade[1] - top[1]) * f, top[2] + (blade[2] - top[2]) * f - z - 0.03];
    person(g, x, 0, z + 0.03, 0, 0, R(), { hands: [lp(0.06), lp(0.45)] });
    g.beam(top, blade, 0.03, 0.03, P.WOOD);
    const d = norm(sub(blade, top));
    g.beam([blade[0] - d[0] * 0.45, blade[1] - d[1] * 0.45, blade[2] - d[2] * 0.45], blade, 0.02, 0.17, P.WOOD);
  }
  return { H, casters: [[-L / 2, L / 2, 0.42, 0.8]], span: 0.68 };
}

function paddleBoard(g, R, seed) {
  const L = 3.2 + 0.4 * R(), H = hull(g, { L, B: 0.37, D: 0.11, T: 0.03, sb: 0.06, ss: 0.02, aft: 0.55, ea: 2, e1: 1.8, e2: 0.7, fl: 0, rake: 0.4, NI: 14 });
  H.deck(0, 1, 0.012, 5);
  const z = H.hs(0.5) + 0.01, s = R() < 0.5 ? 1 : -1;
  const top = [0.3, s * 0.26, z + 1.45], blade = [0.62, s * 0.5, -0.04];
  const lp = (f) => [top[0] + (blade[0] - top[0]) * f, top[1] + (blade[1] - top[1]) * f, top[2] + (blade[2] - top[2]) * f - z];
  person(g, 0, 0, z, 0, 1, R(), { hands: [lp(0.12), lp(0.45)] });
  g.beam(top, blade, 0.03, 0.03, P.DARK);
  const d = norm(sub(blade, top));
  g.beam([blade[0] - d[0] * 0.45, blade[1] - d[1] * 0.45, blade[2] - d[2] * 0.45], blade, 0.02, 0.19, P.DARK);
  return { H, casters: [[-0.3, 0.3, 0.3, 1.7]], span: 0.55 };
}

function barge(g, R, seed) {
  const L = 20 + 4 * R(), H = hull(g, { L, B: 1.66, D: 0.55, T: 1.2, sb: 0.55, ss: 0.2, aft: 0.72, ea: 2.2, e1: 2.6, e2: 0.45, fl: 0.03, rake: 1.0, NI: 28 });
  H.deck(0, 1, 0.03, 6);
  const xh0 = -L / 2 + 3.6, xh1 = L / 2 - 2.6, Wh = 1.32, zc = H.hs(0.5) + 0.42, hc = 0.42;
  const coam = (x, hx, y, hy) => g.box(x, hx, y, hy, H.hs(H.tOf(x)) - 0.05, zc, P.CABIN, 0.1, 2);
  for (const s of [-1, 1]) coam((xh0 + xh1) / 2, (xh1 - xh0) / 2, s * Wh, 0.05);
  for (const x of [xh0, xh1]) coam(x, 0.05, 0, Wh);
  const kind = R(), casters = [];
  if (kind < 0.5) {                                               // a garden barge: beds of soil, shrubs, a few small trees
    g.box((xh0 + xh1) / 2, (xh1 - xh0) / 2 - 0.05, 0, Wh - 0.05, zc - 0.3, zc - 0.06, P.SOIL);
    for (let x = xh0 + 0.6; x < xh1 - 0.4; x += 0.55 + R() * 0.6) {
      const y = (R() - 0.5) * 2 * (Wh - 0.45), r = 0.3 + R() * 0.4;
      g.ell(x, y, zc - 0.06, r, r * (0.8 + R() * 0.4), r * (0.6 + R() * 0.7), 6, 4, P.PLANT, R(), 0);
    }
    for (let k = 0; k < 2 + Math.floor(R() * 2); k++) {
      const x = xh0 + 1.5 + R() * (xh1 - xh0 - 3), y = (R() - 0.5) * 1.2, hT = 1.6 + R() * 1.4, r = 0.8 + R() * 0.5;
      g.beam([x, y, zc - 0.1], [x, y, zc + hT * 0.7], 0.1, 0.1, P.PLANT, 0, 1);
      g.ell(x, y, zc + hT, r, r * 0.9, r * 0.75, 7, 5, P.PLANT, R(), 0);
      casters.push([x - r, x + r, r, zc + hT + r]);
    }
  } else if (kind < 0.8) {                                        // hatch covers, arched over the hold
    const NX = 2, NY = 8;
    g.grid(NX, NY, (i, j) => { const x = xh0 + (xh1 - xh0) * i / NX, y = (Wh + 0.05) * (j / NY * 2 - 1); return [x, y, zc + 0.35 * (1 - (y / (Wh + 0.05)) ** 2), P.CARGO, 1, 0]; });
    casters.push([xh0, xh1, Wh, zc + 0.35]);
  } else {                                                        // containers
    const nC = Math.floor((xh1 - xh0) / 6.3);
    for (let k = 0; k < nC; k++) {
      const x = xh0 + 0.2 + 3.05 + k * 6.25;
      g.box(x, 3.03, 0, 1.22, zc - 0.3, zc + 2.29, P.CARGO, 0, k + 1);
      casters.push([x - 3, x + 3, 1.22, zc + 2.29]);
    }
  }
  // the wheelhouse aft, mast and bollards forward, tyres along the sides
  const hw = house(g, H, -L / 2 + 0.8, -L / 2 + 3.2, 1.25, 2.0, { rk: 0.12, tb: 0.06, oh: 0.12, roof: R() < 0.5 ? 1 : 2, nx: 5 });
  casters.push([-L / 2 + 0.8, -L / 2 + 3.2, 1.25, hw.top]);
  for (const t of [0.95, 0.04]) for (const s of [-1, 1]) { const p = H.sheer(t, s); g.box(p[0] + (t > 0.5 ? -0.5 : 0.4), 0.08, p[1] * 0.75, 0.08, p[2], p[2] + 0.3, P.DARK); }
  const tm = 0.93, pm = [H.xz(tm, H.hs(tm)), 0, H.hs(tm)];
  g.beam(pm, [pm[0], 0, pm[2] + 2.2], 0.07, 0.07, P.METAL); LIGHTS(g, pm[0], 0, pm[2] + 2.2, P.NAVW, 0.05);
  const tl = H.tOf(-L / 2 + 2.6);
  LIGHTS(g, -L / 2 + 2.6, 1.27, H.hs(tl) + 1.7, P.NAVR); LIGHTS(g, -L / 2 + 2.6, -1.27, H.hs(tl) + 1.7, P.NAVG);
  LIGHTS(g, H.xz(0, H.hs(0)) + 0.1, 0, H.hs(0) + 0.15, P.NAVW, 0.04);
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
    const t = 0.2 + k * 0.2, p = H.sheer(t, s), y = s * (H.yAt(t, 0.3) + 0.05);
    g.grid(1, 8, (i, j) => { const a = j / 8 * Math.PI * 2; return [p[0] + 0.22 * Math.cos(a), y + (i - 0.5) * 0.14, 0.32 + 0.22 * Math.sin(a), P.DARK, 0, 0]; });
  }
  for (const s of [-1, 1]) H.rail(0, 1, s, [[0, -0.1], [0.06, -0.1], [0.06, 0.03], [0, 0.03]], P.HULL);
  if (R() < 0.6) person(g, (xh1 + xh0) / 2 + (R() - 0.5) * 6, R() < 0.5 ? 1.5 : -1.5, H.hs(0.5) + 0.03, R() * 6.3, 1, R());
  return { H, casters: [[-L / 2, L / 2, 1.7, 0.6], ...casters], span: 0 };
}
const MAKE = [riverBus, waterTaxi, launch, rowingBoat, kayak, canoe, paddleBoard, barge];

// ---------------------------------------------------------------- the water patch: wake, foam and shadow
// boat coordinates, turned with the boat; the shadow is baked per vertex, the rest is drawn by btWake()
function wakePatch(THREE, b, ty, spd, turned, k) {
  const { H, casters, span } = b, L = H.L, Bm = H.B * 1.1;
  const slow = span > 0 || spd < 0.1, wakeL = slow ? 8 + 6 * spd : 18 + 9 * L ** 0.5 * spd / 2.5;
  const xs = [];
  for (let x = L / 2 + 3; x > -L / 2; x -= Math.max(0.6, Math.min(1.5, L / 10))) xs.push(x);
  for (const d of [0, 1, 2.5, 5, 9, 15, 24, 36, 52, 70]) if (d <= wakeL) xs.push(-L / 2 - d);
  const reach = slow ? [0, 0.6, 1.0, 1.3, 1.8, 2.6, 4] : [0, 0.5, 0.9, 1.15, 1.5, 2.1, 3, 4.5, 7, 11, 17, 24];
  const ys = [...reach.slice(1).reverse().map((r) => -(r <= 1 ? Bm * r : Bm + (r - 1) * (slow ? 1.5 : 1))), 0, ...reach.slice(1).map((r) => (r <= 1 ? Bm * r : Bm + (r - 1) * (slow ? 1.5 : 1)))];
  const sdx = turned ? 0.5 : -0.5, sdy = turned ? -0.786 : 0.786;   // the shadow falls this way per metre of height (boat axes)
  const shadow = (x, y) => {
    let s = 0;
    for (const [x0, x1, w, h] of casters) {
      const cx = (x0 + x1) / 2 + sdx * h * 0.6, cy = sdy * h * 0.6, hx = (x1 - x0) / 2, r = w * 0.5, soft = 0.3 + 0.15 * h;
      const d = Math.hypot(Math.max(Math.abs(x - cx) - (hx - r), 0), Math.max(Math.abs(y - cy) - (w - r), 0)) - r;
      s = Math.max(s, smooth(soft, -soft * 0.5, d) * Math.min(1, 0.45 + h * 0.2));
    }
    return s;
  };
  const sg = turned ? -1 : 1, pos = [], au = [], nrm = [], idx = [];
  const ux = 20 + H.B / 10, uy = Math.round(L * 10) + 0.05 + Math.abs(spd) / 8, uw = ty * 100 + Math.round(span * 10) + 0.02 + H.aft * 0.9;
  for (const x of xs) for (const y of ys) {
    pos.push(sg * x, sg * y, 0.025 + (k % 4) * 0.004); nrm.push(0, 0, 1);
    au.push(ux, uy, shadow(x, y), uw);
  }
  const nv = ys.length;
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < nv - 1; j++) { const a = i * nv + j; idx.push(a, a + nv, a + nv + 1, a, a + nv + 1, a + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute("aU", new THREE.Float32BufferAttribute(au, 4));
  geo.setIndex(idx);
  return geo;
}

// ---------------------------------------------------------------- traffic: keep right, at the canal's speed
// Everything heading one way moves at the same speed (a city canal's limit, ~2 m/s), so nothing ever overtakes and
// nothing sails through anything. Each boat keeps a fixed distance right of the centre line: its hull, oars and
// paddles stay between the monorail's piers (0.9 m either side) and the stations' columns (5.15 m out), which also
// leaves a metre of water to the bank where the river is narrowest (6 m). A boat that would not clear is left out.
const REACH = [1.82, 1.5, 1.28, 1.82, 1.2, 0.85, 0.7, 1.82];     // half span of each type, oars and paddles included
const INNER = 1.3, OUTER = 5.0;
const STATIONS = [0.29, 1.37, 2.62, 3.88, 5.13];                 // the monorail's stations, columns at 5.65 +- 0.5 m
// does a hull reaching r either side of y0 (metres right of the centre line) clear everything all round the ring?
function clear(api, y0, r) {
  for (let u = 0; u < api.CIRC; u += 2) {
    const th = u / api.RF, W = api.riverW(th);
    if (y0 - r < INNER - 1e-6 || y0 + r > W - 0.5) return false;
    if (STATIONS.some((a) => Math.abs(((th - a) % api.TAU + 3 * Math.PI) % api.TAU - Math.PI) * api.RF < 70) && y0 + r > 5.1 + 1e-6 && y0 - r < 6.2) return false;
  }
  return true;
}
export function build(api) {
  const { THREE, rng, CIRC, RF } = api;
  const Rn = rng(1515);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Rn() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const rep = (ty, n) => Array(n).fill(ty);
  const U0 = 0.314 * RF;                                          // where the close views look at t = 0
  const ways = [
    { dir: 1, sp: 2.2, at: 6, first: [TAXI, ROW], boats: [...rep(BUS, 4), ...rep(TAXI, 6), ...rep(LAUNCH, 8), ...rep(BARGE, 3), ...rep(KAYAK, 6), ...rep(CANOE, 3), ...rep(ROW, 2), SUP] },
    { dir: -1, sp: 2.0, at: -12, first: [BUS, KAYAK], boats: [...rep(BUS, 3), ...rep(TAXI, 7), ...rep(LAUNCH, 8), ...rep(BARGE, 3), ...rep(KAYAK, 4), ...rep(CANOE, 3), ...rep(ROW, 4), SUP] },
  ];
  let count = 0;
  for (const w of ways) {
    const built = [...w.first, ...shuffle(w.boats)].map((ty) => {
      // the distance right of the centre line, in 5 cm steps (the shader reads it back from the seed)
      const r = REACH[ty], k0 = Math.ceil((INNER + r - 1.2) / 0.05 - 1e-6), k1 = Math.floor((OUTER - r - 1.2) / 0.05 + 1e-6);
      const k = k0 + Math.round((k1 - k0) * (r > 1.6 ? Rn() : 0.4 + 0.6 * Rn())), y0 = 1.2 + k * 0.05;   // small craft nearer the bank
      if (k1 < k0 || !clear(api, y0, r)) return null;
      const rs = Rn() * 0.999, seed = (k + rs) / 80, g = mesh(ty), b = MAKE[ty](g, Rn, rs);
      return { ty, g, b, seed, y0 };
    }).filter(Boolean);
    // spread them round the ring with random gaps, never closer than their lengths and a little more
    const gaps = built.map((e, i) => (e.b.H.L + built[(i + 1) % built.length].b.H.L) / 2 + 12);
    const wts = built.map((_, i) => (i === 0 ? 0 : 0.2 + Rn()));
    const free = CIRC - gaps.reduce((a, b) => a + b, 0), wsum = wts.reduce((a, b) => a + b, 0);
    let u = U0 + w.at;
    built.forEach((e, i) => {
      const turned = w.dir < 0, kind = 2 + (turned ? 0.5 : 0) + 0.49 * e.seed, yv = -w.dir * e.y0;
      const v = [u / RF, w.dir * w.sp, 0, kind];
      const geo = e.g.geometry(THREE);
      if (turned) geo.rotateZ(Math.PI);
      api.add(geo.translate(0, yv, 0), v);
      api.add(wakePatch(THREE, e.b, e.ty, w.sp, turned, count).translate(0, yv, 0), v);
      u -= w.dir * (gaps[i] + free * wts[i] / wsum);
      count++;
    });
  }
  return { count };
}
