// Soundscape for the Aerie page, synthesised live with WebAudio (no asset files): wind in the leaves (stronger the
// higher you fly), crickets and tree frogs, wind chimes hung about the houses ringing in the gusts, ropes and timbers
// creaking, and at night an owl. `height` (0 = low, 1 = up under the crown) sets the wind; `step(soft)` is a footstep
// (on the boards, or soft on the forest floor); `release()` sends lanterns
// up with a soft rush and a rising run of bells; `night` brings the owl and more frogs. Must be created from a user
// gesture (browsers block audio until then).
export function createAerieAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const noiseBuf = (secs, brown) => {
    const b = ctx.createBuffer(1, ctx.sampleRate * secs, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  };
  const loop = (buf, type, freq, q, gain, pan = 0, dest = master) => {
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(f); f.connect(g); g.connect(p); p.connect(dest); src.start(0, Math.random() * buf.duration);
    return { f, g };
  };
  const lfo = (param, rate, depth) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = rate; g.gain.value = depth;
    o.connect(g); g.connect(param); o.start();
  };

  // a long soft reverb for the chimes and the owl
  const verb = ctx.createConvolver();
  {
    const n = ctx.sampleRate * 3.5, b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
    verb.buffer = b;
  }
  const wet = ctx.createGain(); wet.gain.value = 0.5; verb.connect(wet); wet.connect(master);

  const brown = noiseBuf(6, true), white = noiseBuf(4, false);
  // wind: a low roar in the crown and a rustle of leaves, both swelling in slow gusts
  const windBus = ctx.createGain(); windBus.gain.value = 0.6; windBus.connect(master);
  const roar = loop(brown, "lowpass", 320, 0.6, 0.2, -0.2, windBus);
  lfo(roar.g.gain, 0.05, 0.1); lfo(roar.f.frequency, 0.04, 100);
  const rustle = loop(white, "bandpass", 3200, 0.7, 0.03, 0.25, windBus);
  lfo(rustle.g.gain, 0.08, 0.022); lfo(rustle.f.frequency, 0.06, 900);

  // crickets: bursts of a high tone, each insect its own pitch, rate and place
  const crickets = Array.from({ length: 5 }, (_, i) => ({ f: 4200 + Math.random() * 1600, pan: Math.random() * 1.6 - 0.8, rate: 0.9 + Math.random() * 0.8, ph: i }));
  function chirp(c) {
    const t0 = ctx.currentTime + 0.02, n = 2 + Math.floor(Math.random() * 3);
    const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
    o.type = "sine"; o.frequency.value = c.f; p.pan.value = c.pan; g.gain.value = 0;
    for (let i = 0; i < n; i++) { const t = t0 + i * 0.045; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.012, t + 0.008); g.gain.linearRampToValueAtTime(0, t + 0.03); }
    o.connect(g); g.connect(p); p.connect(master); o.start(t0); o.stop(t0 + n * 0.045 + 0.05);
  }
  // a tree frog: a short rising croak
  function frog() {
    const t = ctx.currentTime + 0.02, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(), p = ctx.createStereoPanner();
    o.type = "sawtooth"; o.frequency.setValueAtTime(700 + Math.random() * 300, t); o.frequency.linearRampToValueAtTime(1100 + Math.random() * 300, t + 0.08);
    f.type = "bandpass"; f.frequency.value = 1400; f.Q.value = 5; p.pan.value = Math.random() * 1.6 - 0.8;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.025, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(f); f.connect(g); g.connect(p); p.connect(master); o.start(t); o.stop(t + 0.15);
  }
  // wind chimes: a pentatonic set of tubes, each a few inharmonic partials with a long ring
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
  function bell(when, semi, a = 0.03, pan = Math.random() * 1.4 - 0.7) {
    const f0 = 880 * Math.pow(2, semi / 12), p = ctx.createStereoPanner(), g = ctx.createGain();
    p.pan.value = pan; g.connect(p); p.connect(master); p.connect(verb);
    for (const [m, k, d] of [[1, 1, 2.8], [2.76, 0.4, 1.4], [5.4, 0.2, 0.7]]) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = "sine"; o.frequency.value = f0 * m;
      og.gain.setValueAtTime(0.0001, when); og.gain.exponentialRampToValueAtTime(a * k, when + 0.005); og.gain.exponentialRampToValueAtTime(0.0001, when + d);
      o.connect(og); og.connect(g); o.start(when); o.stop(when + d + 0.05);
    }
  }
  function chimes() {
    const t = ctx.currentTime + 0.02, n = 1 + Math.floor(Math.random() * 4), pan = Math.random() * 1.4 - 0.7;
    for (let i = 0; i < n; i++) bell(t + i * (0.12 + Math.random() * 0.3), SCALE[Math.floor(Math.random() * SCALE.length)], 0.012 + Math.random() * 0.018, pan + (Math.random() - 0.5) * 0.2);
  }
  // a rope or a timber taking the strain
  function creak() {
    const t = ctx.currentTime + 0.05, dur = 0.5 + Math.random() * 1.0, f0 = 90 + Math.random() * 120;
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(), p = ctx.createStereoPanner();
    o.type = "sawtooth"; f.type = "bandpass"; f.frequency.value = f0 * 4; f.Q.value = 4; p.pan.value = Math.random() * 1.6 - 0.8;
    o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * (0.85 + Math.random() * 0.4), t + dur);
    const am = ctx.createOscillator(), amg = ctx.createGain(); am.frequency.value = 18 + Math.random() * 25; amg.gain.value = 0.5;
    am.connect(amg); amg.connect(g.gain);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.035, t + dur * 0.3); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(f); f.connect(g); g.connect(p); p.connect(master);
    o.start(t); am.start(t); o.stop(t + dur + 0.1); am.stop(t + dur + 0.1);
  }
  // a tawny owl: a long hoot, a pause, then the wavering "hu-hu-huuu"
  function owl() {
    const t0 = ctx.currentTime + 0.05, pan = Math.random() * 1.4 - 0.7;
    const note = (t, dur, f0, f1, a, wob) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
      o.type = "sine"; p.pan.value = pan;
      o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f1, t + dur);
      if (wob) { const w = ctx.createOscillator(), wg = ctx.createGain(); w.frequency.value = 9; wg.gain.value = 18; w.connect(wg); wg.connect(o.frequency); w.start(t); w.stop(t + dur); }
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + 0.06); g.gain.setValueAtTime(a, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(p); p.connect(master); p.connect(verb); o.start(t); o.stop(t + dur + 0.05);
    };
    note(t0, 0.9, 380, 410, 0.05, false);
    const t1 = t0 + 3.2;
    note(t1, 0.18, 400, 390, 0.035, false); note(t1 + 0.35, 0.16, 400, 390, 0.035, false); note(t1 + 0.7, 1.2, 420, 395, 0.05, true);
  }

  let on = false, night = false, height = 0.5;
  const timers = {};
  const every = (name, fn, min, span) => { const run = () => { fn(); timers[name] = setTimeout(run, min() + Math.random() * span()); }; timers[name] = setTimeout(run, min() * Math.random()); };
  const mix = () => {
    const t = ctx.currentTime;
    windBus.gain.setTargetAtTime(0.35 + height * 0.9, t, 1.0);
    rustle.f.frequency.setTargetAtTime(2600 + height * 1400, t, 1.0);
  };
  return {
    get on() { return on; },
    set night(v) { night = v; },
    set height(v) { if (Math.abs(v - height) > 0.02) { height = v; if (on) mix(); } },
    // a footstep: a knock on the boards, or a soft one on the forest floor
    step(soft) {
      if (!on) return;
      const t = ctx.currentTime + 0.01, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = white; f.type = soft ? "lowpass" : "bandpass"; f.frequency.value = soft ? 380 : 700 + Math.random() * 500; f.Q.value = soft ? 0.7 : 1.6;
      const a = (soft ? 0.05 : 0.07) * (0.7 + Math.random() * 0.5);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + (soft ? 0.12 : 0.09));
      src.connect(f); f.connect(g); g.connect(master); src.start(t, Math.random() * 3, 0.2);
      if (!soft) {
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(150 + Math.random() * 40, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.08);
        og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.06, t + 0.006); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
        o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.12);
      }
    },
    release() {
      if (!on) return;
      const t = ctx.currentTime + 0.02, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = white; f.type = "bandpass"; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(1800, t + 2); f.Q.value = 1.2;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      src.connect(f); f.connect(g); g.connect(master); src.start(t, Math.random() * 2, 3);
      [0, 4, 7, 12, 16].forEach((s, i) => bell(t + 0.4 + i * 0.22, s, 0.025, -0.4 + i * 0.2));
    },
    async set(v) {
      on = v;
      if (v) {
        await ctx.resume(); mix();
        crickets.forEach((c, i) => every("c" + i, () => chirp(c), () => 450 / c.rate, () => 500));
        every("frog", () => { if (night || Math.random() < 0.4) frog(); }, () => (night ? 900 : 2500), () => 3000);
        every("chime", chimes, () => 2500, () => 9000);
        every("creak", creak, () => 5000, () => 12000);
        every("owl", () => { if (night) owl(); }, () => 12000, () => 15000);
      } else { for (const k in timers) clearTimeout(timers[k]); }
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(v ? 0.7 : 0, ctx.currentTime, 0.4);
      if (!v) setTimeout(() => { if (!on) ctx.suspend(); }, 2000);
    },
  };
}
