// Walking in Aerie. The village collects, while it is built, what you can stand on and what is in the way: floors
// (triangles, kept in a grid of 2 m cells) and walls (vertical segments and circles, each with the band of height it
// fills). A body 0.3 m round with its eyes 1.62 m up walks over them: it steps up anything under 0.45 m, follows the
// floor down steps, cannot walk into a floor at head height, falls when there is nothing under it, and is carried by
// moving floors (the lift cages). Movers and dynamic walls are `dyn` objects with floorAt() and push().

const CELL = 2;
const key = (ix, iz) => (ix + 4096) * 8192 + (iz + 4096);

export function walkWorld() {
  const T = [], W = [], tg = new Map(), wg = new Map();
  const put = (g, x0, z0, x1, z1, i) => {
    for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++) for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
      const k = key(ix, iz); let a = g.get(k); if (!a) g.set(k, a = []); a.push(i);
    }
  };
  const w = {
    // a floor triangle (anything with x, y, z); flat-on-edge ones are dropped
    tri(a, b, c) {
      const area = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
      if (Math.abs(area) < 1e-4) return;
      const i = T.length; T.push([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, area]);
      put(tg, Math.min(a.x, b.x, c.x), Math.min(a.z, b.z, c.z), Math.max(a.x, b.x, c.x), Math.max(a.z, b.z, c.z), i);
    },
    quad(p0, p1, p2, p3) { w.tri(p0, p1, p2); w.tri(p0, p2, p3); },
    // a floor along a path of points: half-width hw to each side (horizontal, square to the path)
    ribbon(pts, hw) {
      const side = (i) => { const p = pts[Math.max(0, i - 1)], q = pts[Math.min(pts.length - 1, i + 1)], dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1; return [-dz / l * hw, dx / l * hw]; };
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], [sa, ta] = side(i), [sb, tb] = side(i + 1);
        w.quad({ x: a.x + sa, y: a.y, z: a.z + ta }, { x: b.x + sb, y: b.y, z: b.z + tb }, { x: b.x - sb, y: b.y, z: b.z - tb }, { x: a.x - sa, y: a.y, z: a.z - ta });
      }
    },
    // a wall from a to b (x, z) filling heights y0..y1; `g` is an optional switch ({ on }) for gates
    seg(a, b, y0, y1, g = null) {
      const i = W.length; W.push({ s: 1, ax: a.x, az: a.z, bx: b.x, bz: b.z, y0, y1, g });
      put(wg, Math.min(a.x, b.x) - 0.5, Math.min(a.z, b.z) - 0.5, Math.max(a.x, b.x) + 0.5, Math.max(a.z, b.z) + 0.5, i);
    },
    circle(x, z, r, y0, y1, g = null) {
      const i = W.length; W.push({ s: 0, x, z, r, y0, y1, g });
      put(wg, x - r - 0.5, z - r - 0.5, x + r + 0.5, z + r + 0.5, i);
    },
    // walls along a path at each point's own height (railings: h high)
    rail(pts, h = 1.05, closed = false) {
      const n = closed ? pts.length : pts.length - 1;
      for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; w.seg(a, b, Math.min(a.y, b.y) - 0.3, Math.max(a.y, b.y) + h); }
    },
    // the highest floor at (x, z) no higher than yTop (and above yBot); -Infinity if none
    floorAt(x, z, yTop, yBot = -Infinity) {
      const a = tg.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
      let best = -Infinity;
      if (a) for (const i of a) {
        const t = T[i];
        const u = ((t[3] - x) * (t[8] - z) - (t[6] - x) * (t[5] - z)) / t[9], v = ((t[6] - x) * (t[2] - z) - (t[0] - x) * (t[8] - z)) / t[9], s = 1 - u - v;
        if (u < -1e-4 || v < -1e-4 || s < -1e-4) continue;
        const y = u * t[1] + v * t[4] + s * t[7];
        if (y <= yTop && y > yBot && y > best) best = y;
      }
      return best;
    },
    // how far to move a body of radius r at (x, z), filling heights y0..y1, to get it clear of the walls
    push(x, z, r, y0, y1, out) {
      out[0] = out[1] = 0;
      const a = wg.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
      if (!a) return out;
      for (const i of a) {
        const o = W[i];
        if (o.y1 < y0 || o.y0 > y1 || (o.g && !o.g.on)) continue;
        let px, pz;
        if (o.s) {
          const ex = o.bx - o.ax, ez = o.bz - o.az, L = ex * ex + ez * ez, t = L > 0 ? Math.max(0, Math.min(1, ((x - o.ax) * ex + (z - o.az) * ez) / L)) : 0;
          px = o.ax + ex * t; pz = o.az + ez * t;
          const dx = x + out[0] - px, dz = z + out[1] - pz, d = Math.hypot(dx, dz);
          if (d < r && d > 1e-6) { out[0] += dx / d * (r - d); out[1] += dz / d * (r - d); }
          else if (d <= 1e-6) { const l = Math.sqrt(L) || 1; out[0] += -ez / l * r; out[1] += ex / l * r; }
        } else {
          const dx = x + out[0] - o.x, dz = z + out[1] - o.z, d = Math.hypot(dx, dz), m = r + o.r;
          if (d < m) { const k = d > 1e-6 ? (m - d) / d : 0; out[0] += d > 1e-6 ? dx * k : m; out[1] += dz * k; }
        }
      }
      return out;
    },
    stats: () => ({ floors: T.length, walls: W.length }),
    dump: () => ({ T, W }),
  };
  return w;
}

// for checking a layout: every place a body can get to from (x, y, z), flooding outward in steps of 0.35 m (up a
// step, down anything under 3 m, never through a wall or under a floor at head height). Returns the visited cells
// as a Map from "ix,iz,iy" to [x, y, z].
export function reachable(world, dyn, x, y, z, max = 400000) {
  const { R, STEP, HEAD } = BODY, st = 0.35, seen = new Map(), o = [0, 0];
  const floor = (x, z, top) => { let f = world.floorAt(x, z, top); for (const d of dyn) f = Math.max(f, d.floorAt(x, z, top)); return f; };
  const clear = (x, z, y) => {
    world.push(x, z, R * 0.8, y + STEP, y + HEAD, o); if (Math.abs(o[0]) + Math.abs(o[1]) > 1e-4) return false;
    for (const d of dyn) if (d.push) { d.push(x, z, R * 0.8, y + STEP, y + HEAD, o); if (Math.abs(o[0]) + Math.abs(o[1]) > 1e-4) return false; }
    return world.floorAt(x, z, y + HEAD, y + STEP + 0.05) === -Infinity;
  };
  const q = [[Math.round(x / st), Math.round(z / st), y]];
  seen.set(q[0][0] + "," + q[0][1] + "," + Math.round(y / 0.5), [x, y, z]);
  for (let qi = 0; qi < q.length && seen.size < max; qi++) {
    const [ix, iz, py] = q[qi];
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const nx = (ix + di) * st, nz = (iz + dj) * st, f = floor(nx, nz, py + STEP * (di && dj ? 1.42 : 1));
      if (f < py - 3 || !clear(nx, nz, f) || !clear((ix + di / 2) * st, (iz + dj / 2) * st, Math.max(py, f))) continue;
      const k = (ix + di) + "," + (iz + dj) + "," + Math.round(f / 0.5);
      if (seen.has(k)) continue;
      seen.set(k, [nx, f, nz]); q.push([ix + di, iz + dj, f]);
    }
  }
  return seen;
}

// the body. dyn: moving floors and walls, each { floorAt(x, z, yTop), push(x, z, r, y0, y1, out), delta: {x, y, z} }
export const BODY = { R: 0.3, EYE: 1.62, HEAD: 1.82, STEP: 0.45, WALK: 2.7, RUN: 5.6, G: 19, JUMP: 5.4, FATAL: 9 };
export function makeWalker(world, { dyn = [], ground = () => 0, onFall = () => {} } = {}) {
  const { R, EYE, HEAD, STEP } = BODY;
  const s = { x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: 0, grounded: false, fallFrom: 0, support: null, eye: 0, bob: 0, safe: null, safeT: 0, frozen: false, moved: 0 };
  const tmp = [0, 0];
  const floor = (x, z, yTop) => {
    let best = Math.max(world.floorAt(x, z, yTop), ground(x, z) <= yTop ? ground(x, z) : -Infinity), sup = null;
    for (const d of dyn) { const y = d.floorAt(x, z, yTop); if (y > best) { best = y; sup = d; } }
    return [best, sup];
  };
  const blocked = (x, z, y) => world.floorAt(x, z, y + HEAD, y + STEP + 0.05) > -Infinity || dyn.some((d) => d.floorAt(x, z, y + HEAD) > y + STEP + 0.05);
  const resolve = () => {
    for (let k = 0; k < 3; k++) {
      let dx = 0, dz = 0;
      world.push(s.x, s.z, R, s.y + STEP, s.y + HEAD, tmp); dx += tmp[0]; dz += tmp[1];
      for (const d of dyn) if (d.push) { d.push(s.x + dx, s.z + dz, R, s.y + STEP, s.y + HEAD, tmp); dx += tmp[0]; dz += tmp[1]; }
      if (Math.abs(dx) + Math.abs(dz) < 1e-5) break;
      s.x += dx; s.z += dz;
    }
  };
  s.place = (x, y, z, yaw = s.yaw) => {
    Object.assign(s, { x, z, yaw, vx: 0, vz: 0, vy: 0 });
    const [f, sup] = floor(x, z, y + STEP);
    s.y = f > -Infinity ? f : y; s.support = sup; s.grounded = f > -Infinity; s.fallFrom = s.y; s.eye = s.y + EYE;
    if (f > -Infinity && !sup) s.safe = { x: s.x, y: s.y, z: s.z, yaw };
  };
  // inp: { fwd, side, turn, run, jump, dx, dy } (dx, dy: look in radians)
  s.update = (dt, inp) => {
    s.yaw -= inp.turn * dt * 2.1 + inp.dx;
    s.pitch = Math.max(-1.35, Math.min(1.35, s.pitch - inp.dy));
    if (s.frozen || dt <= 0) { s.eye = s.y + EYE; return; }
    if (s.support && s.support.delta) { const d = s.support.delta; s.x += d.x; s.y += d.y; s.z += d.z; }
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), rx = -fz, rz = fx;
    let wx = fx * inp.fwd + rx * inp.side, wz = fz * inp.fwd + rz * inp.side;
    const wl = Math.hypot(wx, wz), sp = inp.run ? BODY.RUN : BODY.WALK;
    if (wl > 1) { wx /= wl; wz /= wl; }
    const k = 1 - Math.exp(-dt * (s.grounded ? 11 : 1.2));
    s.vx += (wx * sp - s.vx) * k; s.vz += (wz * sp - s.vz) * k;
    // across the floor in short steps, out of the walls after each, and never into a floor at head height
    const n = Math.max(1, Math.ceil(Math.hypot(s.vx, s.vz) * dt / 0.08)), x0 = s.x, z0 = s.z;
    for (let i = 0; i < n; i++) {
      const px = s.x, pz = s.z;
      s.x += s.vx * dt / n; s.z += s.vz * dt / n;
      resolve();
      if (blocked(s.x, s.z, s.y)) { s.x = px; s.z = pz; }
    }
    const moved = Math.hypot(s.x - x0, s.z - z0);
    if (dt > 0 && moved < Math.hypot(s.vx, s.vz) * dt * 0.3) { s.vx *= 0.5; s.vz *= 0.5; }
    // down onto the floor, or falling
    const [f, sup] = floor(s.x, s.z, s.y + STEP);
    if (inp.jump && s.grounded) { s.vy = BODY.JUMP; s.grounded = false; s.fallFrom = s.y; }
    if (s.grounded) {
      if (f > -Infinity && s.y - f <= 0.6) { s.y = f; s.vy = 0; s.support = sup; }
      else { s.grounded = false; s.fallFrom = s.y; s.support = null; }
    }
    if (!s.grounded) {
      s.vy -= BODY.G * dt; s.y += s.vy * dt;
      if (s.vy <= 0 && s.y <= f) {
        const drop = s.fallFrom - f;
        s.y = f; s.vy = 0; s.grounded = true; s.support = sup;
        if (drop > BODY.FATAL) { onFall(drop); return; }
      }
      if (s.y < -20 || s.fallFrom - s.y > BODY.FATAL + 4) { onFall(s.fallFrom - s.y); return; }     // falling into the mist: no need to wait for the ground
    }
    // remember the last firm footing, to come back to after a fall
    s.safeT -= dt;
    if (s.grounded && !sup && s.safeT <= 0) { s.safe = { x: s.x, y: s.y, z: s.z, yaw: s.yaw }; s.safeT = 0.4; }
    // the eyes follow a step up smoothly, a step down at once; a little bob as you walk
    s.moved = moved / dt;
    s.bob += moved * 2.2;
    const want = s.y + EYE;
    s.eye = want > s.eye ? s.eye + (want - s.eye) * (1 - Math.exp(-dt * 14)) : want;
  };
  s.respawn = () => { if (s.safe) s.place(s.safe.x, s.safe.y + 0.1, s.safe.z, s.safe.yaw); };
  return s;
}

// keyboard, mouse (pointer lock, or drag) and touch (a stick on the left, look on the right) for walking
export function walkInput(canvas, { onUse = () => {}, active = () => true } = {}) {
  const st = { fwd: 0, side: 0, turn: 0, run: false, jump: false, dx: 0, dy: 0 };
  const keys = new Set();
  const coarse = matchMedia("(pointer: coarse)").matches;
  const map = () => {
    const k = (c) => keys.has(c);
    st.fwd = (k("w") || k("arrowup") || k("z") ? 1 : 0) - (k("s") || k("arrowdown") ? 1 : 0) + stick.fwd;
    st.side = (k("d") ? 1 : 0) - (k("a") || k("q") ? 1 : 0) + stick.side;
    st.turn = (k("arrowright") ? 1 : 0) - (k("arrowleft") ? 1 : 0);
    st.run = k("shift") || stick.run;
  };
  const stick = { fwd: 0, side: 0, run: false, id: null, x0: 0, y0: 0 };
  addEventListener("keydown", (e) => {
    if (!active() || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === " ") { st.jump = true; e.preventDefault(); }
    if (k === "e" || k === "enter") { if (!e.repeat) onUse(); }
    if (k.startsWith("arrow")) e.preventDefault();
    keys.add(k); map();
  });
  addEventListener("keyup", (e) => { keys.delete(e.key.toLowerCase()); if (e.key === "Shift") keys.delete("shift"); map(); });
  addEventListener("blur", () => { keys.clear(); map(); });
  // the mouse looks: locked to the canvas after a click, or by dragging
  let drag = null, look = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (!active()) return;
    if (e.pointerType === "mouse") {
      if (!document.pointerLockElement && canvas.requestPointerLock && !coarse) { try { canvas.requestPointerLock()?.catch?.(() => {}); } catch {} }     // refused (a frame, automation): dragging still looks
      drag = [e.clientX, e.clientY];
      return;
    }
    if (e.clientX < innerWidth * 0.42 && stick.id == null) { stick.id = e.pointerId; stick.x0 = e.clientX; stick.y0 = e.clientY; showStick(e.clientX, e.clientY, 0, 0); }
    else if (look == null) look = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  addEventListener("pointermove", (e) => {
    if (!active()) return;
    if (e.pointerType === "mouse") {
      if (document.pointerLockElement === canvas) { st.dx += e.movementX * 0.0023; st.dy += e.movementY * 0.0023; }
      else if (drag && e.buttons) { st.dx += (e.clientX - drag[0]) * 0.004; st.dy += (e.clientY - drag[1]) * 0.004; drag = [e.clientX, e.clientY]; }
      return;
    }
    if (e.pointerId === stick.id) {
      let dx = e.clientX - stick.x0, dy = e.clientY - stick.y0; const l = Math.hypot(dx, dy), m = 56;
      if (l > m) { dx *= m / l; dy *= m / l; }
      stick.side = dx / m; stick.fwd = -dy / m; stick.run = l > m * 1.6; showStick(stick.x0, stick.y0, dx, dy); map();
    } else if (look && e.pointerId === look.id) {
      st.dx += (e.clientX - look.x) * 0.0055; st.dy += (e.clientY - look.y) * 0.0055; look.x = e.clientX; look.y = e.clientY;
    }
  }, { passive: true });
  const up = (e) => {
    if (e.pointerType === "mouse") { drag = null; return; }
    if (e.pointerId === stick.id) { stick.id = null; stick.fwd = stick.side = 0; stick.run = false; hideStick(); map(); }
    if (look && e.pointerId === look.id) look = null;
  };
  addEventListener("pointerup", up); addEventListener("pointercancel", up);
  // the stick: a ring where your thumb went down and a knob that follows it
  const ring = document.createElement("div"), knob = document.createElement("div");
  ring.style.cssText = "position:fixed;width:112px;height:112px;margin:-56px 0 0 -56px;border-radius:50%;border:1px solid rgba(232,230,225,.35);background:rgba(10,12,16,.25);pointer-events:none;display:none;z-index:5";
  knob.style.cssText = "position:absolute;left:36px;top:36px;width:40px;height:40px;border-radius:50%;background:rgba(232,230,225,.4)";
  ring.appendChild(knob); document.body.appendChild(ring);
  function showStick(x, y, dx, dy) { ring.style.display = "block"; ring.style.left = x + "px"; ring.style.top = y + "px"; knob.style.transform = `translate(${dx}px,${dy}px)`; }
  function hideStick() { ring.style.display = "none"; }
  // read and clear what has come in since the last frame
  st.take = () => { const o = { ...st }; st.dx = st.dy = 0; st.jump = false; return o; };
  st.release = () => { keys.clear(); stick.id = null; stick.fwd = stick.side = 0; look = null; drag = null; hideStick(); map(); if (document.pointerLockElement === canvas) document.exitPointerLock(); };
  st.jumpNow = () => { st.jump = true; };
  return st;
}
