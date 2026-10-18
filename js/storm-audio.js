// Storm soundscape, synthesised live with WebAudio (no asset files): wind, rain, surf, thunder,
// a ship's horn far off and a submarine blowing her ballast tanks.
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

  // a ship's horn far off: one long blast, muffled by distance and rain, echoing back off the rocks
  function horn({ dist = 350, kind = "coaster" } = {}) {
    const t0 = ctx.currentTime + dist / 340, f0 = kind === "trawler" ? 138 : 92, len = 2.8, k = 0.3 * 350 / dist;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420; lp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(k, t0 + 0.35);
    g.gain.setValueAtTime(k, t0 + len); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len + 1.2);
    for (const [f, a] of [[f0, 1], [f0 * 1.503, 0.45], [f0 * 2.004, 0.3]]) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(f, t0); o.frequency.setTargetAtTime(f * 0.97, t0 + len, 0.4);
      og.gain.value = a; o.connect(og); og.connect(lp); o.start(t0); o.stop(t0 + len + 1.5);
    }
    lp.connect(g); g.connect(master);
    for (const [d, a] of [[0.9, 0.3], [1.9, 0.12]]) {
      const dl = ctx.createDelay(2), dg = ctx.createGain();
      dl.delayTime.value = d; dg.gain.value = a; g.connect(dl); dl.connect(dg); dg.connect(master);
    }
  }
  // a submarine surfacing: the deep rush of the ballast blow, air boiling up, then water pouring off her casing
  function surface({ dist = 85 } = {}) {
    const t0 = ctx.currentTime + dist / 340;
    const swell = (buf, type, freq, q, peak, at, len) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(peak, t0 + at + len * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
      src.connect(f); f.connect(g); g.connect(master); src.start(t0 + at, Math.random() * 2); src.stop(t0 + at + len + 0.1);
    };
    swell(brown, "lowpass", 140, 0.7, 1.4, 0, 9);
    swell(white, "bandpass", 700, 0.6, 0.18, 1.5, 7);
    swell(white, "highpass", 1800, 0.4, 0.1, 6, 9);
  }

  let on = false;
  return {
    thunder: (o) => { if (on) thunder(o); },
    horn: (o) => { if (on && o) horn(o); },
    surface: (o) => { if (on && o) surface(o); },
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
