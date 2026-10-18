// Boats on the river of the Torus scene.
// Contract (shared by every ring vehicle module, see "ring vehicles" in ../torus3d.js):
//   build(api) adds geometry with api.add(geometry, v) / api.box(...) and returns { count }.
//   GLSL defines vehBoat(inout Veh v, inout vec3 n, vec3 p, vec3 V, vec4 m, vec4 u), called for kind 2.x.
// Vehicle coordinates are metres: x along the ring (direction of travel for speed > 0), y across, z up from the
// water line (the water surface is z = 0).

export const GLSL = /* glsl */`
void vehBoat(inout Veh v, inout vec3 n, vec3 p, vec3 V, vec4 m, vec4 u){
  float sd = fract(sin(floor(m.w * 100.) * 7.1) * 43758.);
  v.alb = m.z < .6 ? (sd < .5 ? vec3(.45, .12, .08) : vec3(.10, .18, .30)) : vec3(.80, .78, .72);
  v.spec = .2; v.gloss = 30.;
}
`;

export function build(api) {
  const L = api.rng(1515);
  let count = 0;
  for (let b = 0; b < 70; b++) {
    const th0 = L() * api.TAU, sp = (L() < 0.5 ? -1 : 1) * (1.2 + L() * 2.6), fr = (L() - 0.5) * 0.9, len = 5 + L() * 8, kind = 2 + L() * 0.9;
    const v = [th0, sp, fr, kind];                       // |lateral| < 1.5: a fraction of the river's width from its centre line
    api.box(0, len / 2, 0, 1.3, -0.4, 0.55, v);
    api.box(-len * 0.1, len * 0.22, 0, 0.9, 0.55, 2.1, v);
    count++;
  }
  return { count };
}
