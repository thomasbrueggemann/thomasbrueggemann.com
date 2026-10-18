// Full-screen fragment shader behind the hero: a quiet night coast with a slowly
// sweeping lighthouse beam. Raw WebGL, no deps.

const VERT = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p){
  float v = 0., a = .5;
  for (int i = 0; i < 5; i++){ v += a * noise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= .5; }
  return v;
}
float stars(vec2 p, float scale, float density){
  vec2 g = p * scale, id = floor(g), f = fract(g) - .5;
  float r = hash(id);
  vec2 o = (vec2(hash(id + 1.3), hash(id + 7.1)) - .5) * .6;
  float d = length(f - o);
  float tw = .55 + .45 * sin(uTime * (.8 + r * 2.5) + r * 60.);
  return smoothstep(.07, 0., d) * step(density, r) * tw;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  vec2 p = (uv - .5) * vec2(asp, 1.);
  vec2 m = uMouse;
  float t = uTime;
  float horizon = -.14;

  // sky ---------------------------------------------------------------
  float h = clamp((p.y - horizon) / .95, 0., 1.);
  vec3 col = mix(vec3(.50, .24, .18) * .42, vec3(.045, .07, .17), smoothstep(0., .32, h));
  col = mix(col, vec3(.008, .014, .045), smoothstep(.22, 1., h));

  // stars (two parallax layers) + milky haze
  vec2 sp = p + m * vec2(.012, .006);
  float st = stars(sp, 60., .975) * .8;
  float skyMask = smoothstep(horizon + .02, .25, p.y);
  float haze = 0.;
  col += vec3(.75, .85, 1.) * st * skyMask + vec3(.4, .5, .9) * haze;

  // moon
  vec2 moon = vec2(asp * .14, .385) + m * .01;
  float md = length(p - moon);
  col += vec3(.65, .75, 1.) * .004 / (md + .03);
  col = mix(col, vec3(.93, .95, 1.), smoothstep(.062, .058, md));
  col -= vec3(.08, .08, .05) * smoothstep(.062, .05, md) * fbm((p - moon) * 18.) * 1.2;

  // far headland (left)
  float ridge = horizon + .03 + .07 * fbm(vec2(p.x * 1.6 + 3., 1.)) * smoothstep(asp * .15, -asp * .5, p.x);
  float land = step(p.y, ridge) * step(horizon, p.y);
  col = mix(col, vec3(.012, .02, .04), land);

  // horizon glow
  col += vec3(.55, .28, .2) * exp(-abs(p.y - horizon) * 9.) * .22;

  // lighthouse on a rock (right) -------------------------------------
  vec2 lp = vec2(asp * .30, horizon + .10) + m * vec2(-.01, 0.);
  vec2 q = p - lp;
  float rk = clamp(-q.y / .1, 0., 1.);
  float hw = (.028 + .115 * pow(rk, .75)) * (.82 + .36 * fbm(vec2(q.y * 38., q.x * 9.)));
  float rock = step(abs(q.x), hw) * step(q.y, .0) * step(-.1, q.y);
  float th = .27;
  float tw = mix(.020, .0115, clamp(q.y / th, 0., 1.));
  float tower = step(abs(q.x), tw) * step(0., q.y) * step(q.y, th);
  float gallery = step(abs(q.x), .021) * step(th, q.y) * step(q.y, th + .007);
  float lantern = step(abs(q.x), .0105) * step(th + .007, q.y) * step(q.y, th + .035);
  float cap = step(abs(q.x), .0125 * (1. - (q.y - th - .035) / .016)) * step(th + .035, q.y) * step(q.y, th + .051);
  float stripe = step(.5, fract(q.y * 15.));
  vec3 sil = vec3(.015, .022, .04);
  col = mix(col, sil, clamp(rock + tower + gallery + cap, 0., 1.));
  col += vec3(.06, .02, .0) * tower * stripe * .6;           // faint painted bands catching moonlight
  vec2 lc = lp + vec2(0., th + .021);                         // lamp position
  col = mix(col, vec3(1., .86, .55), lantern);

  // rotating two-arm beam
  float a = t * .32;
  float s = cos(a);
  vec2 v = p - lc;
  vec2 D = normalize(vec2(1., .045 + .04 * sin(a * .5)));
  float proj = dot(v, D);
  float perp = abs(v.x * D.y - v.y * D.x);
  float armSign = sign(proj);
  float armOn = s * armSign;                                  // one arm bright toward the viewer's side, other fading
  float spread = .00018 + abs(proj) * .0022;
  float beam = exp(-perp * perp / spread) * exp(-abs(proj) * .85);
  float fogMod = .65 + .7 * fbm(vec2(p.x * 3. - t * .05, p.y * 5.));
  beam *= fogMod * smoothstep(-.3, .6, armOn) * (.25 + .75 * s * s);
  float glare = (1. - s * s) * .0045 / (length(v) + .012);   // beam pointing at us: bloom around the lamp
  vec3 warm = vec3(1., .78, .42);
  col += warm * (beam * .75 + glare * 1.15 + .0045 / (length(v) + .01));

  // sea ---------------------------------------------------------------
  if (p.y < horizon){
    float depth = (horizon - p.y);
    vec3 sea = mix(vec3(.08, .12, .22), vec3(.008, .016, .045), smoothstep(0., .6, depth));
    float wv = fbm(vec2(p.x * (6. + depth * 40.) + t * .12, depth * (90. + depth * 90.) - t * .35));
    float glint = smoothstep(.62, .95, wv);
    // moon path
    float mx = abs(p.x - moon.x);
    float moonPath = exp(-mx * mx / (.004 + depth * .05)) * exp(-depth * 2.2);
    // lamp path
    float lx = abs(p.x - lc.x);
    float lampPath = exp(-lx * lx / (.0008 + depth * .02)) * exp(-depth * 1.6);
    sea += vec3(.6, .72, 1.) * moonPath * (.1 + glint * .85);
    sea += warm * lampPath * (.08 + glint * .9) * (.35 + .65 * (1. - s * s));
    sea += vec3(.5, .25, .2) * exp(-depth * 18.) * .22;
    // darkness under the rock
    col = mix(col, sea, step(p.y, horizon));
    col = mix(col, sil, clamp(rock, 0., 1.) * step(p.y, horizon));
  }

  // grade -------------------------------------------------------------
  float vig = smoothstep(1.25, .25, length(uv - .5) * 1.6);
  col *= mix(.55, 1., vig);
  col = pow(col, vec3(.93));
  gl_FragColor = vec4(col, 1.);
}
`;

export function startHero(canvas, { reduced = false } = {}) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
  if (!gl) { canvas.classList.add("no-gl"); return () => {}; }

  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(sh)); return null; }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { canvas.classList.add("no-gl"); return () => {}; }
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog); gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uMouse = gl.getUniformLocation(prog, "uMouse");

  let scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.85;
  const resize = () => {
    const w = Math.max(2, Math.floor(canvas.clientWidth * scale));
    const h = Math.max(2, Math.floor(canvas.clientHeight * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
  };

  const target = [0, 0], cur = [0, 0];
  window.addEventListener("pointermove", (e) => {
    target[0] = (e.clientX / window.innerWidth - .5) * 2;
    target[1] = -(e.clientY / window.innerHeight - .5) * 2;
  }, { passive: true });

  let visible = true, raf = 0, t0 = performance.now(), last = t0, slow = 0;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) loop(); });
  io.observe(canvas);

  function draw(now) {
    resize();
    cur[0] += (target[0] - cur[0]) * .05; cur[1] += (target[1] - cur[1]) * .05;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, reduced ? 4.2 : (now - t0) / 1000 + 2.);
    gl.uniform2f(uMouse, cur[0], cur[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function loop(now = performance.now()) {
    raf = 0;
    if (!visible || document.hidden) return;
    // adaptive resolution: if frames are consistently slow, render fewer pixels
    const dt = now - last; last = now;
    slow = dt > 34 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 30 && scale > .4) { scale *= .8; slow = 0; }
    draw(now);
    if (!reduced) raf = requestAnimationFrame(loop);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !raf) { last = performance.now(); loop(); } });
  window.addEventListener("resize", () => { if (reduced) draw(performance.now()); });
  loop();
  return () => { cancelAnimationFrame(raf); io.disconnect(); };
}
