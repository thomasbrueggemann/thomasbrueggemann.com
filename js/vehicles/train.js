// The monorail of the Torus scene: an elevated twin track over the river all round the ring, on pillars standing in
// the water, and the trains running on it (kind 0.x is the track, 1.x the trains).
// Contract (shared by every ring vehicle module, see "ring vehicles" in ../torus3d.js):
//   build(api) adds geometry with api.add(geometry, v) / api.box(...) and returns { count }.
//   GLSL defines vehTrack(...) for kind 0.x and vehTrain(...) for kind 1.x, both
//   (inout Veh v, inout vec3 n, vec3 p, vec3 V, vec4 m, vec4 u).
// Vehicle coordinates are metres: x along the ring (direction of travel for speed > 0), y across (0 = the river's
// centre line, lateral 0), z up from the water.

export const GLSL = /* glsl */`
void vehTrack(inout Veh v, inout vec3 n, vec3 p, vec3 V, vec4 m, vec4 u){
  v.alb = vec3(.55, .54, .52);
}
void vehTrain(inout Veh v, inout vec3 n, vec3 p, vec3 V, vec4 m, vec4 u){
  float x = fract(m.x / 17.) * 17.;
  float win = step(14.1, m.z) * step(m.z, 15.4) * step(.6, fract(x / 1.6)) * step(.6, x) * step(x, 15.4);
  v.alb = mix(vec3(.80, .80, .78), vec3(.04, .06, .08), win);
  v.alb = mix(v.alb, vec3(.75, .45, .15), step(abs(m.z - 13.6), .18));
  v.emis = vec3(1., .85, .6) * win * .2;
  v.spec = .3; v.gloss = 40.;
}
`;

export function build(api) {
  const { CIRC } = api;
  for (let u = 0; u < CIRC; u += 6) for (const k of [-1, 1]) api.box(u + 3, 3.05, k * 2.4, 0.7, 12.2, 13, [0, 0, 0, 0]);
  for (let u = 0; u < CIRC; u += 40) { api.box(u, 0.9, 0, 0.9, -1.5, 12, [0, 0, 0, 0]); api.box(u, 1.1, 0, 3.4, 11.4, 12.2, [0, 0, 0, 0]); }
  let count = 0;
  for (const k of [-1, 1]) for (let t = 0; t < 5; t++) {
    const th0 = (t / 5 + (k > 0 ? 0.1 : 0.27)) * api.TAU;
    for (let car = 0; car < 7; car++) api.box(car * 17 + 8, 8, k * 2.4, 1.45, 13.1, 16.3, [th0, k * 23, 0, 1]);
    count++;
  }
  return { count };
}
