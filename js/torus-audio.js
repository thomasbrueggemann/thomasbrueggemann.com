// Soundscape for the Torus page, synthesised live with WebAudio (no asset files): there is no sound in space, so
// this is what the station itself would carry through its frame. A deep rumble, a slow beating drone, the hum of
// machinery, a swell each time a spoke comes round (six a minute), and now and then the structure groaning and
// creaking under the spin. `near` (0 = far out, 1 = up against the glass) brings the machinery and the groans closer.
// Must be created from a user gesture (browsers block audio until then).
export function createTorusAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain();
  master.gain.value = 0;
  // a long, dark hall for everything to ring in
  const verb = ctx.createConvolver();
  {
    const len = ctx.sampleRate * 5, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.08; d[i] = lp * Math.pow(1 - i / len, 2.2) * 3; }
    }
    verb.buffer = ir;
  }
  const wet = ctx.createGain(); wet.gain.value = 0.5;
  verb.connect(wet); wet.connect(master);
  master.connect(ctx.destination);
  const out = (node, send = 0.4) => { node.connect(master); if (send) { const g = ctx.createGain(); g.gain.value = send; node.connect(g); g.connect(verb); } };

  const noiseBuf = (secs, brown) => {
    const b = ctx.createBuffer(1, ctx.sampleRate * secs, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  };
  const lfo = (param, rate, depth, type = "sine") => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = rate; g.gain.value = depth;
    o.connect(g); g.connect(param); o.start();
  };
  const brown = noiseBuf(8, true), white = noiseBuf(4, false);

  // the rumble: brown noise below 90 Hz, rolling slowly
  const rumble = (() => {
    const src = ctx.createBufferSource(); src.buffer = brown; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 90; f.Q.value = 0.9;
    const f2 = ctx.createBiquadFilter(); f2.type = "lowpass"; f2.frequency.value = 140;
    const g = ctx.createGain(); g.gain.value = 0.9;
    src.connect(f); f.connect(f2); f2.connect(g); out(g, 0.2); src.start(0, Math.random() * 8);
    lfo(g.gain, 0.045, 0.35); lfo(f.frequency, 0.021, 30);
    return g;
  })();
  // the drone: a few low partials, slightly detuned so they beat against each other
  const drone = ctx.createGain(); drone.gain.value = 0.18;
  const droneF = ctx.createBiquadFilter(); droneF.type = "lowpass"; droneF.frequency.value = 220;
  drone.connect(droneF); out(droneF, 0.6);
  for (const [fr, a, type] of [[41.2, 1, "sine"], [41.65, 0.8, "sine"], [61.7, 0.35, "triangle"], [82.4, 0.25, "sine"], [123.6, 0.08, "sawtooth"]]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = fr; g.gain.value = a;
    o.connect(g); g.connect(drone); o.start();
    lfo(g.gain, 0.03 + Math.random() * 0.05, a * 0.5);
  }
  // machinery: a mains-like hum and the hiss of air handlers
  const hum = ctx.createGain(); hum.gain.value = 0;
  const humF = ctx.createBiquadFilter(); humF.type = "bandpass"; humF.frequency.value = 180; humF.Q.value = 0.7;
  hum.connect(humF); out(humF, 0.5);
  for (const [fr, a] of [[50, 0.5], [100, 0.35], [150, 0.18], [200, 0.1]]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = fr * (1 + (Math.random() - 0.5) * 0.002); g.gain.value = a;
    o.connect(g); g.connect(hum); o.start();
  }
  const air = (() => {
    const src = ctx.createBufferSource(); src.buffer = white; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 420; f.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); out(g, 0.3); src.start(0, Math.random() * 4);
    return g;
  })();
  // the spokes coming round: a slow swell of low, filtered noise every ten seconds
  const sweep = (() => {
    const src = ctx.createBufferSource(); src.buffer = brown; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 160; f.Q.value = 1.4;
    const g = ctx.createGain(); g.gain.value = 0.06;
    src.connect(f); f.connect(g); out(g, 0.7); src.start(0, Math.random() * 8);
    lfo(g.gain, 0.1, 0.06); lfo(f.frequency, 0.1, 60);
    return g;
  })();

  // groans: a low, wavering tone bent by distortion, like steel under load; creaks: short resonant ticks
  const shaper = ctx.createWaveShaper();
  { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = Math.tanh(x * 3); } shaper.curve = c; }
  const groanBus = ctx.createGain(); groanBus.gain.value = 0.25;
  const groanF = ctx.createBiquadFilter(); groanF.type = "lowpass"; groanF.frequency.value = 600;
  shaper.connect(groanF); groanF.connect(groanBus); out(groanBus, 1.2);
  let near = 0;
  function groan() {
    const t0 = ctx.currentTime + 0.05, dur = 2.5 + Math.random() * 4, f0 = 38 + Math.random() * 40;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
    o.type = "sawtooth"; o2.type = "triangle";
    o.frequency.setValueAtTime(f0, t0); o.frequency.linearRampToValueAtTime(f0 * (0.8 + Math.random() * 0.5), t0 + dur);
    o2.frequency.setValueAtTime(f0 * 1.5 + Math.random() * 3, t0); o2.frequency.linearRampToValueAtTime(f0 * 1.3, t0 + dur);
    const wob = ctx.createOscillator(), wg = ctx.createGain(); wob.frequency.value = 3 + Math.random() * 5; wg.gain.value = f0 * 0.04;
    wob.connect(wg); wg.connect(o.frequency); wg.connect(o2.frequency);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.2 + 0.25 * near, t0 + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    p.pan.value = Math.random() * 1.4 - 0.7;
    o.connect(g); o2.connect(g); g.connect(p); p.connect(shaper);
    [o, o2, wob].forEach((n) => { n.start(t0); n.stop(t0 + dur + 0.1); });
  }
  function creak() {
    const t0 = ctx.currentTime + 0.05, n = 1 + Math.floor(Math.random() * 4), fr = 700 + Math.random() * 1800;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.05 + Math.random() * 0.12);
      const src = ctx.createBufferSource(); src.buffer = white;
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = fr * (0.9 + Math.random() * 0.2); f.Q.value = 18;
      const g = ctx.createGain(), p = ctx.createStereoPanner();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25 + 0.4 * near, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      p.pan.value = Math.random() * 1.6 - 0.8;
      src.connect(f); f.connect(g); g.connect(p); out(p, 1);
      src.start(t, Math.random() * 3); src.stop(t + 0.12);
    }
  }
  let timer = 0;
  const events = () => {
    if (Math.random() < 0.55) groan(); else creak();
    timer = setTimeout(events, (6000 + Math.random() * 12000) * (1 - near * 0.5));
  };

  let on = false;
  const mix = () => {
    const t = ctx.currentTime;
    hum.gain.setTargetAtTime(0.004 + 0.03 * near, t, 0.8);
    air.gain.setTargetAtTime(0.004 + 0.03 * near, t, 0.8);
    drone.gain.setTargetAtTime(0.2 - 0.06 * near, t, 0.8);
    rumble.gain.setTargetAtTime(0.8 + 0.3 * near, t, 0.8);
    groanBus.gain.setTargetAtTime(0.2 + 0.25 * near, t, 0.8);
    sweep.gain.setTargetAtTime(0.05 + 0.04 * near, t, 0.8);
  };
  return {
    get on() { return on; },
    set near(v) { if (Math.abs(v - near) > 0.02) { near = v; if (on) mix(); } },
    async set(v) {
      on = v;
      if (v) { await ctx.resume(); mix(); if (!timer) timer = setTimeout(events, 2500); }
      else { clearTimeout(timer); timer = 0; }
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(v ? 0.7 : 0, ctx.currentTime, 0.6);
      if (!v) setTimeout(() => { if (!on) ctx.suspend(); }, 2500);
    },
  };
}
