// Soundscape for the Express, synthesised live with WebAudio (no asset files): the rumble of the running gear, the
// knock of each wheelset over a rail joint (`clack(gain, pan)`, sent by the scene in step with the shaking), wind and
// rain on the roof and the glass, a hollow boom on the viaducts (`bridge`, 0..1), thunder (`thunder(delay, power)`),
// the engine's whistle far ahead (`whistle()`), a piano in the bar (`piano`, 0..1 by how near you are) and the clink
// of glasses in the dining car (`clinks`, 0..1). Must be created from a user gesture.
export function createExpressAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain();
  master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
  master.connect(comp); comp.connect(ctx.destination);

  const noiseBuf = (secs, brown) => {
    const b = ctx.createBuffer(1, ctx.sampleRate * secs, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
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
  const lfo = (param, rate, depth) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = rate; g.gain.value = depth; o.connect(g); g.connect(param); o.start(); };
  const brown = noiseBuf(6, true), white = noiseBuf(4, false);

  // a small room reverb (the carriage) for the knocks, the piano and the glasses
  const verb = ctx.createConvolver();
  { const n = ctx.sampleRate * 0.9, b = ctx.createBuffer(2, n, ctx.sampleRate); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.5); } verb.buffer = b; }
  const verbG = ctx.createGain(); verbG.gain.value = 0.35; verb.connect(verbG); verbG.connect(master);

  // the running gear: a low rumble, the roar of the wheels, both swelling with the bridges
  const rumble = loop(brown, "lowpass", 140, 0.7, 0.42);
  lfo(rumble.g.gain, 0.37, 0.06);
  const roar = loop(white, "bandpass", 650, 0.6, 0.035);
  lfo(roar.f.frequency, 0.13, 160);
  const hollow = loop(brown, "bandpass", 95, 3, 0.0);
  // wind along the body and rain drumming on the roof
  const wind = loop(brown, "bandpass", 420, 0.8, 0.12, -0.1);
  lfo(wind.g.gain, 0.08, 0.07); lfo(wind.f.frequency, 0.05, 150);
  const rain = loop(white, "highpass", 2500, 0.4, 0.05, 0.1);
  lfo(rain.g.gain, 0.11, 0.015);
  let dropTimer = 0;
  function drops() {
    const t = ctx.currentTime + 0.01, src = ctx.createBufferSource(); src.buffer = white;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 2500 + Math.random() * 4000; f.Q.value = 4;
    const g = ctx.createGain(), a = 0.02 + Math.random() * 0.05;
    g.gain.setValueAtTime(a, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    const p = ctx.createStereoPanner(); p.pan.value = Math.random() * 2 - 1;
    src.connect(f); f.connect(g); g.connect(p); p.connect(master); src.start(t, Math.random() * 3, 0.03);
    dropTimer = setTimeout(drops, 15 + Math.random() * 60);
  }

  // one wheelset over one joint: a thump and a short metallic ring
  function clack(gain = 1, pan = 0) {
    if (!api.on) return;
    const t = ctx.currentTime + 0.005, g0 = 0.55 * gain;
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    og.gain.setValueAtTime(g0, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    const src = ctx.createBufferSource(); src.buffer = white;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 900 + Math.random() * 400; f.Q.value = 2.5;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(g0 * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    const p = ctx.createStereoPanner(); p.pan.value = pan * 0.4;
    o.connect(og); og.connect(p); src.connect(f); f.connect(ng); ng.connect(p); p.connect(master); p.connect(verb);
    o.start(t); o.stop(t + 0.2); src.start(t, Math.random() * 3, 0.08);
  }

  // thunder: a crack (when close) and a long rolling rumble
  function thunder(delay = 2, power = 0.8) {
    if (!api.on) return;
    const t = ctx.currentTime + delay, len = 4 + power * 4;
    const src = ctx.createBufferSource(); src.buffer = brown; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 180 + power * 300;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9 * power, t + 0.15 + (1 - power) * 0.6);
    for (let i = 1; i < 6; i++) g.gain.setTargetAtTime(0.9 * power * (0.3 + Math.random() * 0.6) * (1 - i / 6), t + i * len / 7, 0.3);
    g.gain.setTargetAtTime(0.0001, t + len * 0.85, 0.6);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 3); src.stop(t + len + 2);
    if (power > 0.8 && delay < 1.5) {
      const c = ctx.createBufferSource(); c.buffer = white;
      const cf = ctx.createBiquadFilter(); cf.type = "lowpass"; cf.frequency.value = 2500;
      const cg = ctx.createGain(); cg.gain.setValueAtTime(0.5, t); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      c.connect(cf); cf.connect(cg); cg.connect(master); c.start(t, 0, 0.6);
    }
  }

  // the whistle: a chord of three pipes, breathy, from far ahead and through the walls
  function whistle() {
    if (!api.on) return;
    const t = ctx.currentTime + 0.05, len = 2.4;
    const out = ctx.createBiquadFilter(); out.type = "lowpass"; out.frequency.value = 2200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.25);
    g.gain.setValueAtTime(0.16, t + 0.9); g.gain.exponentialRampToValueAtTime(0.05, t + 1.0); g.gain.exponentialRampToValueAtTime(0.16, t + 1.15);
    g.gain.setValueAtTime(0.16, t + len - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    out.connect(g); g.connect(master); g.connect(verb);
    for (const fr of [392, 494, 587]) {
      const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = fr;
      o.frequency.setValueAtTime(fr * 0.96, t); o.frequency.exponentialRampToValueAtTime(fr, t + 0.25);
      const og = ctx.createGain(); og.gain.value = 0.3; o.connect(og); og.connect(out); o.start(t); o.stop(t + len + 0.1);
    }
    const n = ctx.createBufferSource(); n.buffer = white;
    const nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 1400; nf.Q.value = 1;
    const ng = ctx.createGain(); ng.gain.value = 0.25; n.connect(nf); nf.connect(ng); ng.connect(out); n.start(t, 0, len);
  }

  // the piano in the bar: slow chords and a wandering melody, louder as you come near it
  const pianoBus = ctx.createGain(); pianoBus.gain.value = 0;
  const pianoF = ctx.createBiquadFilter(); pianoF.type = "lowpass"; pianoF.frequency.value = 3000;
  pianoBus.connect(pianoF); pianoF.connect(master); pianoF.connect(verb);
  const note = (midi, t, v = 0.2, len = 2.5) => {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.008); g.gain.exponentialRampToValueAtTime(v * 0.3, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    g.connect(pianoBus);
    [[1, 1], [2, 0.35], [3, 0.12], [4, 0.06]].forEach(([h, a]) => { const o = ctx.createOscillator(); o.frequency.value = f * h * (1 + (h - 1) * 0.0008); const og = ctx.createGain(); og.gain.value = a; o.connect(og); og.connect(g); o.start(t); o.stop(t + len); });
  };
  const PROG = [[50, 57, 62, 65, 69], [43, 55, 59, 62, 65], [48, 55, 60, 64, 67], [45, 52, 57, 60, 64], [50, 57, 60, 65, 69], [43, 53, 59, 62, 67], [48, 55, 59, 64, 67], [52, 56, 59, 62, 68]];
  let chord = 0, pianoTimer = 0;
  function bars() {
    if (api.piano > 0.02) {
      const t = ctx.currentTime + 0.05, c = PROG[chord % PROG.length], beat = 0.62;
      note(c[0] - 12, t, 0.16, 3.5); note(c[0], t + 0.02, 0.1, 3);
      for (let i = 1; i < c.length; i++) note(c[i], t + beat * (i - 1) * 0.5 + 0.01 * i, 0.07, 2.6);
      // a few melody notes from the chord's scale
      for (let i = 0; i < 3; i++) if (Math.random() < 0.7) note(c[1 + Math.floor(Math.random() * (c.length - 1))] + 12, t + beat * (1 + i) + (Math.random() - 0.5) * 0.08, 0.06 + Math.random() * 0.04, 1.8);
      chord++;
    }
    pianoTimer = setTimeout(bars, 2480);
  }
  // glasses and cutlery in the dining car
  let clinkTimer = 0;
  function clink() {
    if (api.clinks > 0.05) {
      const t = ctx.currentTime + 0.01, f0 = 2400 + Math.random() * 2600, n = 1 + (Math.random() < 0.3 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const o = ctx.createOscillator(); o.frequency.value = f0 * (1 + i * 0.37);
        const g = ctx.createGain(), at = t + i * 0.05, a = 0.03 * api.clinks * (0.4 + Math.random());
        g.gain.setValueAtTime(a, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25 + Math.random() * 0.5);
        const p = ctx.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8;
        o.connect(g); g.connect(p); p.connect(master); p.connect(verb); o.start(at); o.stop(at + 1);
      }
    }
    clinkTimer = setTimeout(clink, 400 + Math.random() * 2600);
  }
  // the woodwork creaking as the carriage works on its springs
  let creakTimer = 0;
  function creak() {
    const t = ctx.currentTime + 0.01, len = 0.15 + Math.random() * 0.35;
    const src = ctx.createBufferSource(); src.buffer = white;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 18;
    f.frequency.setValueAtTime(300 + Math.random() * 500, t); f.frequency.linearRampToValueAtTime(250 + Math.random() * 700, t + len);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + len * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + len);
    const p = ctx.createStereoPanner(); p.pan.value = Math.random() * 2 - 1;
    src.connect(f); f.connect(g); g.connect(p); p.connect(master); src.start(t, Math.random() * 3, len + 0.05);
    creakTimer = setTimeout(creak, 1500 + Math.random() * 6000);
  }

  const api = {
    on: false, piano: 0, clinks: 0,
    set bridge(v) {
      const t = ctx.currentTime;
      hollow.g.gain.setTargetAtTime(0.5 * v, t, 0.4);
      rumble.f.frequency.setTargetAtTime(140 + 60 * v, t, 0.4);
      wind.g.gain.setTargetAtTime(0.12 + 0.08 * v, t, 0.5);
    },
    clack, thunder, whistle,
    async set(v) {
      this.on = v;
      if (v) {
        await ctx.resume();
        master.gain.setTargetAtTime(0.85, ctx.currentTime, 0.4);
        if (!dropTimer) drops(); if (!pianoTimer) bars(); if (!clinkTimer) clink(); if (!creakTimer) creak();
      } else {
        master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        clearTimeout(dropTimer); clearTimeout(pianoTimer); clearTimeout(clinkTimer); clearTimeout(creakTimer); dropTimer = pianoTimer = clinkTimer = creakTimer = 0;
      }
    },
    setPiano(v) { this.piano = v; pianoBus.gain.setTargetAtTime(v, ctx.currentTime, 0.3); },
  };
  return api;
}
