// Soundscape for the Hearth page, synthesised live with WebAudio (no asset files): wind in the spruces, the creak
// of a trunk, a raven now and then, the fire crackling behind the cabin's walls, and at night a tawny owl. `near`
// (0 = as far off as you can go, 1 = as close) brings the fire closer; `stoke()` crackles and roars; `night` swaps the
// raven for the owl. Must be created from a user gesture (browsers block audio until then).
export function createHearthAudio() {
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

  const brown = noiseBuf(6, true), white = noiseBuf(4, false);
  // wind: a deep roar in the crowns and a high hiss through the needles, both swelling in slow gusts
  const roar = loop(brown, "lowpass", 380, 0.6, 0.22, -0.2);
  lfo(roar.g.gain, 0.06, 0.12); lfo(roar.f.frequency, 0.045, 120);
  const hiss = loop(white, "bandpass", 2600, 0.5, 0.035, 0.25);
  lfo(hiss.g.gain, 0.07, 0.025); lfo(hiss.f.frequency, 0.05, 700);

  // the fire, heard through the walls: a muffled rumble and crackles, lowpassed
  const wall = ctx.createBiquadFilter(); wall.type = "lowpass"; wall.frequency.value = 900;
  const fireBus = ctx.createGain(); fireBus.gain.value = 0.15;
  const firePan = ctx.createStereoPanner(); firePan.pan.value = 0.15;
  wall.connect(fireBus); fireBus.connect(firePan); firePan.connect(master);
  const rumble = loop(brown, "lowpass", 160, 0.8, 0.5, 0, wall);
  lfo(rumble.g.gain, 0.4, 0.15);
  let crackTimer = 0, rate = 1;
  function crack() {
    const t = ctx.currentTime + 0.01, n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const src = ctx.createBufferSource(); src.buffer = white;
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 900 + Math.random() * 3000; f.Q.value = 1.5;
      const g = ctx.createGain(), at = t + i * (0.01 + Math.random() * 0.04), a = 0.2 + Math.random() * 0.6;
      g.gain.setValueAtTime(a, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.01 + Math.random() * 0.03);
      src.connect(f); f.connect(g); g.connect(wall);
      src.start(at, Math.random() * 3, 0.06);
    }
  }
  const crackles = () => { crack(); crackTimer = setTimeout(crackles, (60 + Math.random() * 500) / rate); };

  // a trunk creaking as it sways
  function creak() {
    const t = ctx.currentTime + 0.05, dur = 0.6 + Math.random() * 1.2, f0 = 70 + Math.random() * 90;
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(), p = ctx.createStereoPanner();
    o.type = "sawtooth"; f.type = "bandpass"; f.frequency.value = f0 * 4; f.Q.value = 4; p.pan.value = Math.random() * 1.6 - 0.8;
    o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * (0.85 + Math.random() * 0.4), t + dur);
    // the stick-slip of wood on wood: amplitude chopped at a few dozen hertz
    const am = ctx.createOscillator(), amg = ctx.createGain(); am.frequency.value = 18 + Math.random() * 25; amg.gain.value = 0.5;
    am.connect(amg); amg.connect(g.gain);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + dur * 0.3); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(f); f.connect(g); g.connect(p); p.connect(master);
    o.start(t); am.start(t); o.stop(t + dur + 0.1); am.stop(t + dur + 0.1);
  }
  // a raven's deep "kronk", far off
  function raven() {
    const t0 = ctx.currentTime + 0.05, n = 1 + Math.floor(Math.random() * 3), pan = Math.random() * 1.6 - 0.8;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.45 + Math.random() * 0.2), o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner();
      o.type = "sawtooth"; o.frequency.setValueAtTime(340 + Math.random() * 60, t); o.frequency.linearRampToValueAtTime(300, t + 0.22);
      f.type = "bandpass"; f.frequency.value = 1100; f.Q.value = 3; p.pan.value = pan;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(f); f.connect(g); g.connect(p); p.connect(master); o.start(t); o.stop(t + 0.3);
    }
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
      o.connect(g); g.connect(p); p.connect(master); o.start(t); o.stop(t + dur + 0.05);
    };
    note(t0, 0.9, 380, 410, 0.06, false);
    const t1 = t0 + 3.2;
    note(t1, 0.18, 400, 390, 0.04, false); note(t1 + 0.35, 0.16, 400, 390, 0.04, false); note(t1 + 0.7, 1.2, 420, 395, 0.06, true);
  }
  let callTimer = 0, creakTimer = 0, night = false;
  const calls = () => { (night ? owl : raven)(); callTimer = setTimeout(calls, (night ? 14000 : 9000) + Math.random() * 16000); };
  const creaks = () => { creak(); creakTimer = setTimeout(creaks, 5000 + Math.random() * 14000); };

  let on = false, near = 0, stoked = 0;
  const mix = () => {
    const t = ctx.currentTime;
    fireBus.gain.setTargetAtTime((0.12 + 0.4 * near) * (1 + stoked * 1.5), t, 0.6);
    wall.frequency.setTargetAtTime(700 + 600 * near + 800 * stoked, t, 0.6);
    rate = 1 + stoked * 3;
  };
  return {
    get on() { return on; },
    set near(v) { if (Math.abs(v - near) > 0.02) { near = v; if (on) mix(); } },
    set night(v) { night = v; },
    stoke() {
      if (!on) return;
      stoked = 1; mix();
      setTimeout(() => { stoked = 0; mix(); }, 12000);
    },
    async set(v) {
      on = v;
      if (v) { await ctx.resume(); mix(); if (!crackTimer) crackles(); if (!callTimer) callTimer = setTimeout(calls, 2500); if (!creakTimer) creaks(); }
      else { clearTimeout(crackTimer); clearTimeout(callTimer); clearTimeout(creakTimer); crackTimer = callTimer = creakTimer = 0; }
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(v ? 0.7 : 0, ctx.currentTime, 0.4);
      if (!v) setTimeout(() => { if (!on) ctx.suspend(); }, 2000);
    },
  };
}
