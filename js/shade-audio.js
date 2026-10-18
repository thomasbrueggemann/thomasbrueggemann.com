// Jungle soundscape for the Shade page, synthesised live with WebAudio (no asset files): cicadas in the heat,
// wind in the leaves, the river, and birds calling from all sides. `depth` (0 = high up, 1 = street level) brings
// the river closer and pushes the canopy sounds up; `gust()` swells the wind with the gust rolling over the scene.
// Must be created from a user gesture (browsers block audio until then).
export function createShadeAudio() {
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
  const loop = (buf, type, freq, q, gain, pan = 0) => {
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(f); f.connect(g); g.connect(p); p.connect(master); src.start(0, Math.random() * buf.duration);
    return { f, g };
  };
  const lfo = (param, rate, depth) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = rate; g.gain.value = depth;
    o.connect(g); g.connect(param); o.start();
  };

  const brown = noiseBuf(6, true), white = noiseBuf(4, false);
  const leaves = loop(white, "bandpass", 900, 0.6, 0.14);              // wind in the leaves
  lfo(leaves.g.gain, 0.07, 0.06); lfo(leaves.f.frequency, 0.05, 250);
  const river = loop(brown, "lowpass", 520, 0.7, 0.25);                // the river's body
  const babble = loop(white, "bandpass", 1500, 1.2, 0.025);            // and its babble
  lfo(babble.g.gain, 2.7, 0.012); lfo(babble.f.frequency, 1.3, 400);
  // cicadas: narrow bands of noise chopped at a few dozen hertz, swelling and fading in the heat
  const cicadas = [[4800, 47, -0.6], [6100, 61, 0.5], [5400, 39, 0.1]].map(([fr, rate, pan], i) => {
    const src = ctx.createBufferSource(); src.buffer = white; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = fr; f.Q.value = 9;
    const chop = ctx.createGain(); chop.gain.value = 0.11;   // chopped at `rate` Hz around this level
    const swell = ctx.createGain(); swell.gain.value = 0.5;   // the slow swell, also what `depth` turns down
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(f); f.connect(chop); chop.connect(swell); swell.connect(p); p.connect(master);
    src.start(0, Math.random() * white.duration);
    lfo(chop.gain, rate, 0.11);
    lfo(swell.gain, 0.03 + i * 0.017, 0.45);
    return swell;
  });

  // birds: short whistled phrases from random directions
  let birdTimer = 0;
  function bird() {
    const t0 = ctx.currentTime + 0.05, n = 2 + Math.floor(Math.random() * 6), base = 1800 + Math.random() * 2600;
    const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
    o.type = "sine"; p.pan.value = Math.random() * 1.6 - 0.8;
    g.gain.value = 0;
    const step = 0.07 + Math.random() * 0.1, up = Math.random() < 0.5;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * step * 1.4, f = base * (1 + (up ? i : n - i) * 0.04) * (0.95 + Math.random() * 0.1);
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * (1.25 + Math.random() * 0.3), t + step * 0.8);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.05, t + step * 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + step);
    }
    o.connect(g); g.connect(p); p.connect(master);
    o.start(t0); o.stop(t0 + n * step * 1.4 + 0.2);
  }
  const birds = () => { bird(); birdTimer = setTimeout(birds, 1500 + Math.random() * 6000); };

  let on = false, depth = 0;
  const mix = () => {
    const t = ctx.currentTime;
    river.g.gain.setTargetAtTime(0.12 + 0.5 * depth, t, 0.5);
    babble.g.gain.setTargetAtTime(0.01 + 0.05 * depth, t, 0.5);
    leaves.g.gain.setTargetAtTime(0.16 - 0.06 * depth, t, 0.5);
    cicadas.forEach((c) => c.gain.setTargetAtTime(0.5 - 0.2 * depth, t, 0.8));
  };
  return {
    get on() { return on; },
    set depth(d) { if (Math.abs(d - depth) > 0.02) { depth = d; if (on) mix(); } },
    gust() {
      if (!on) return;
      const t = ctx.currentTime;
      leaves.g.gain.cancelScheduledValues(t);
      leaves.g.gain.setTargetAtTime(0.55, t + 2, 2.5);
      leaves.g.gain.setTargetAtTime(0.16 - 0.06 * depth, t + 11, 3);
    },
    async set(v) {
      on = v;
      if (v) { await ctx.resume(); mix(); if (!birdTimer) birds(); }
      else { clearTimeout(birdTimer); birdTimer = 0; }
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(v ? 0.6 : 0, ctx.currentTime, 0.4);
      if (!v) setTimeout(() => { if (!on) ctx.suspend(); }, 2000);
    },
  };
}
