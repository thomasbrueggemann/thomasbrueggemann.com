// Cars on the two boulevards of the Torus scene: a lane each way on both, inside the quarters.
// Contract (shared by every ring vehicle module, see "ring vehicles" in ../torus3d.js):
//   build(api) adds geometry with api.add(geometry, v) / api.box(...) and returns { count }.
//   GLSL defines vehCar(inout Veh v, inout vec3 n, vec3 p, vec3 V, vec4 m, vec4 u), called for kind 3.x.
// Vehicle coordinates are metres: x along the ring (direction of travel for speed > 0), y across, z up from the road.

export const GLSL = /* glsl */`
void vehCar(inout Veh v, inout vec3 n, vec3 p, vec3 V, vec4 m, vec4 u){
  float sd = fract(m.w * 37.1);
  vec3 paint = sd < .25 ? vec3(.75, .74, .72) : sd < .4 ? vec3(.06, .06, .07) : sd < .55 ? vec3(.5, .08, .06) : sd < .7 ? vec3(.08, .2, .45) : sd < .85 ? vec3(.12, .3, .2) : vec3(.8, .6, .1);
  v.alb = m.z > 1.02 && abs(dot(n, upAt(p))) < .5 ? vec3(.03, .04, .05) : paint;
  v.spec = .5; v.gloss = 60.;
}
`;

export function build(api) {
  const { rng, CIRC, RF, BLVD } = api;
  let count = 0;
  const Cr = rng(4242);
  for (const side of [-1, 1]) for (const [e, dir] of [[BLVD - 1.6, 1], [BLVD + 1.6, -1]]) {
    for (let u = Cr() * 30; u < CIRC; u += 14 + Cr() * 60) {
      const sp = dir * (8 + Cr() * 5), kind = 3 + Cr() * 0.99, len = 4 + Cr() * 1.2;
      const v = [u / RF, sp, side * (e + 2), kind];      // |lateral| >= 1.5: metres from the river's edge + 2, signed by bank
      api.box(0, len / 2, 0, 0.9, 0.15, 1.0, v);
      api.box(-len * 0.08, len * 0.3, 0, 0.78, 1.0, 1.5, v);
      count++;
    }
  }
  return { count };
}
