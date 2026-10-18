// Storm soundscape, synthesised live with WebAudio (no asset files): wind, rain, surf, thunder.
// Must be created from a user gesture (browsers block audio until then).
export function createStormAudio() {
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
  const loop = (buf, type, freq, q, gain) => {
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(master); src.start();
    return { f, g };
  };
  const lfo = (param, rate, depth) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = rate; g.gain.value = depth;
    o.connect(g); g.connect(param); o.start();
  };

  const brown = noiseBuf(6, true), white = noiseBuf(4, false);
  const wind = loop(brown, "bandpass", 420, 0.9, 0.9);          // gusting howl
  lfo(wind.f.frequency, 0.11, 220); lfo(wind.g.gain, 0.17, 0.35);
  const rain = loop(white, "highpass", 3200, 0.5, 0.07);          // hiss on the sea and the tower
  lfo(rain.g.gain, 0.23, 0.02);
  const surf = loop(brown, "lowpass", 260, 0.7, 1.1);            // swell breaking on the rock
  lfo(surf.g.gain, 0.09, 0.7);

  // thunder: a crack, then a low rolling rumble. Delay follows the bolt's distance.
  function thunder({ big = true, dist = 400 } = {}) {
    const delay = 0.15 + (dist / 340) * 1.1, t0 = ctx.currentTime + delay, k = big ? 1 : 0.45;
    const src = ctx.createBufferSource(); src.buffer = brown;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.6;
    lp.frequency.setValueAtTime(900, t0); lp.frequency.exponentialRampToValueAtTime(70, t0 + 4.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(2.2 * k, t0 + 0.05);
    g.gain.exponentialRampToValueAtTime(0.9 * k, t0 + 0.7);
    g.gain.setTargetAtTime(0.0001, t0 + 0.9, 1.1);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(t0, Math.random() * 2); src.stop(t0 + 6);
  }

  let on = false;
  return {
    thunder: (o) => { if (on) thunder(o); },
    get on() { return on; },
    async set(v) {
      on = v;
      if (v) await ctx.resume();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(v ? 0.55 : 0, ctx.currentTime, 0.4);
      if (!v) setTimeout(() => { if (!on) ctx.suspend(); }, 2000);
    },
  };
}
