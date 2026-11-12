/* Enjambre: sonido sintetizado con WebAudio, sin archivos. Efectos con posición estéreo
   y una línea de bajo propia que avanza un paso con cada latido del enjambre (más rápido cuanto más corre). */
(function (root) {
  "use strict";
  let ac = null, master = null, sfx = null, music = null, noiseBuf = null, on = true, ufo = null;
  const last = {};

  function init() {
    if (ac) { if (ac.state === "suspended") ac.resume().catch(() => {}); return true; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    try { ac = new AC({ latencyHint: "interactive" }); } catch (e) { return false; }
    master = ac.createGain();
    master.gain.value = on ? 0.9 : 0;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    master.connect(comp);
    comp.connect(ac.destination);
    sfx = ac.createGain(); sfx.gain.value = 0.8; sfx.connect(master);
    music = ac.createGain(); music.gain.value = 0.5; music.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  const ready = () => !!ac && on && ac.state === "running";
  function setOn(v) {
    on = !!v;
    if (master) master.gain.setTargetAtTime(on ? 0.9 : 0, ac.currentTime, 0.02);
  }
  function suspend() { if (ac && ac.state === "running") ac.suspend().catch(() => {}); }
  function resume() { if (ac && ac.state === "suspended") ac.resume().catch(() => {}); }
  // Limita cuántas veces por segundo suena un efecto para que el fuego rápido no sature.
  function every(name, ms) {
    const t = performance.now();
    if (last[name] && t - last[name] < ms) return false;
    last[name] = t;
    return true;
  }
  const panOf = x => (x == null ? 0 : Math.max(-1, Math.min(1, (x / 360) * 2 - 1)) * 0.6);

  function out(node, dest, pan) {
    if (pan && ac.createStereoPanner) {
      const p = ac.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      p.connect(dest);
    } else node.connect(dest);
  }
  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function tone(type, f0, f1, dur, peak, opts) {
    opts = opts || {};
    const t = opts.t != null ? opts.t : ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (opts.detune) o.detune.value = opts.detune;
    env(g, t, opts.a || 0.004, peak, dur);
    let node = g;
    if (opts.lp) {
      const fl = ac.createBiquadFilter();
      fl.type = "lowpass"; fl.frequency.value = opts.lp; fl.Q.value = opts.q || 1;
      g.connect(fl);
      node = fl;
    }
    o.connect(g);
    out(node, opts.dest || sfx, opts.pan);
    o.start(t);
    o.stop(t + (opts.a || 0.004) + dur + 0.05);
  }
  function hiss(dur, peak, type, f0, f1, opts) {
    opts = opts || {};
    const t = opts.t != null ? opts.t : ac.currentTime;
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf;
    s.loop = true;
    fl.type = type;
    fl.frequency.setValueAtTime(f0, t);
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    fl.Q.value = opts.q || 1;
    env(g, t, opts.a || 0.003, peak, dur);
    s.connect(fl);
    fl.connect(g);
    out(g, opts.dest || sfx, opts.pan);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.08);
  }
  const note = (base, semis) => base * Math.pow(2, semis / 12);

  // Música: re menor, acordes i – VI – VII – V; un arpegio de ocho pasos que rebota de octava.
  const ROOTS = [0, -4, -2, -5], STEPS = [0, 12, 7, 12, 3, 12, 7, 10], D2 = 73.42;

  const api = {
    init, setOn, isOn: () => on, suspend, resume,
    shot(x, spread, rapid) {
      if (!ready() || !every("shot", 45)) return;
      const f = (rapid ? 1250 : 1050) * (0.97 + Math.random() * 0.06), pan = panOf(x);
      tone("square", f, f * 0.28, 0.085, rapid ? 0.045 : 0.065, { pan });
      tone("triangle", f * 2, f * 0.5, 0.05, 0.03, { pan });
      if (spread) tone("sawtooth", f * 0.75, f * 0.22, 0.09, 0.03, { pan });
    },
    kill(type, x) {
      if (!ready() || !every("kill", 28)) return;
      const f = { a: 2200, b: 1500, c: 950 }[type] || 1200, pan = panOf(x);
      hiss(0.28, 0.3, "bandpass", f, f * 0.25, { q: 1.2, pan });
      tone("sine", 180, 45, 0.16, 0.32, { pan });
      tone("square", f / 3, f / 9, 0.1, 0.035, { pan });
    },
    armor(x) {
      if (!ready() || !every("armor", 40)) return;
      const pan = panOf(x);
      tone("sine", 1480, 1380, 0.16, 0.12, { pan });
      tone("sine", 2350, 2200, 0.1, 0.07, { pan });
      hiss(0.04, 0.08, "highpass", 5000, 0, { pan });
    },
    clash(x) { if (ready() && every("clash", 35)) { hiss(0.07, 0.12, "bandpass", 3200, 1200, { q: 2, pan: panOf(x) }); tone("square", 1700, 900, 0.05, 0.03, { pan: panOf(x) }); } },
    absorb(x) { if (ready() && every("absorb", 50)) tone("sine", 320, 140, 0.12, 0.12, { pan: panOf(x) }); },
    chip(x) { if (ready() && every("chip", 45)) hiss(0.05, 0.07, "bandpass", 2400, 900, { q: 1.5, pan: panOf(x) }); },
    bomb(kind, x) {
      if (!ready() || !every("bomb", 90)) return;
      if (kind === "plasma") tone("sine", 260, 120, 0.22, 0.06, { pan: panOf(x) });
      else tone("triangle", kind === "fast" ? 900 : 640, kind === "fast" ? 500 : 380, 0.08, 0.025, { pan: panOf(x) });
    },
    ufoStart() {
      if (!ac || ufo) return;
      const t = ac.currentTime, o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain();
      const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
      o.type = "triangle"; o.frequency.value = 520;
      lfo.frequency.value = 6.5; lg.gain.value = 110;
      lfo.connect(lg); lg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.3);
      o.connect(g);
      if (p) { g.connect(p); p.connect(sfx); } else g.connect(sfx);
      o.start(t); lfo.start(t);
      ufo = { o, lfo, g, p };
    },
    ufoMove(x) { if (ufo && ufo.p) ufo.p.pan.setTargetAtTime(panOf(x), ac.currentTime, 0.05); },
    ufoStop() {
      if (!ufo) return;
      const t = ac.currentTime;
      ufo.g.gain.setTargetAtTime(0.0001, t, 0.06);
      ufo.o.stop(t + 0.4); ufo.lfo.stop(t + 0.4);
      ufo = null;
    },
    ufoKill(x) {
      if (!ready()) return;
      const t = ac.currentTime, pan = panOf(x);
      hiss(0.5, 0.3, "bandpass", 2600, 300, { q: 0.8, pan });
      [0, 7, 12, 19].forEach((s, i) => tone("square", note(660, s), 0, 0.09, 0.05, { t: t + i * 0.05, pan, lp: 3000 }));
    },
    bossArrive() {
      if (!ready()) return;
      const t = ac.currentTime;
      tone("sawtooth", 55, 52, 1.6, 0.14, { lp: 420, q: 4, a: 0.3 });
      tone("sawtooth", 58.3, 55, 1.6, 0.12, { lp: 420, q: 4, a: 0.3 });
      hiss(1.4, 0.12, "lowpass", 300, 1200, { a: 0.4, t });
    },
    bossHit(x) { if (ready() && every("bossHit", 40)) { hiss(0.08, 0.14, "bandpass", 700, 300, { pan: panOf(x) }); tone("square", 220, 140, 0.06, 0.04, { pan: panOf(x) }); } },
    bossVolley() { if (ready()) { tone("sine", 200, 90, 0.35, 0.16); hiss(0.25, 0.08, "lowpass", 900, 200); } },
    bossDie() {
      if (!ready()) return;
      const t = ac.currentTime;
      hiss(2.2, 0.6, "lowpass", 2600, 80, { q: 0.7 });
      tone("sine", 120, 24, 1.6, 0.7);
      [0, 3, 7, 12].forEach((s, i) => tone("sawtooth", note(146.8, s), 0, 0.5, 0.05, { t: t + 0.5 + i * 0.12, lp: 1800 }));
    },
    playerHit() {
      if (!ready()) return;
      hiss(1.1, 0.5, "lowpass", 3000, 120, { q: 0.8 });
      tone("sine", 110, 28, 0.9, 0.55);
      tone("sawtooth", 220, 55, 0.6, 0.07, { lp: 1200 });
    },
    shieldPop() { if (ready()) { tone("sine", 900, 300, 0.25, 0.14); hiss(0.2, 0.12, "highpass", 3000, 0); } },
    respawn() { if (ready()) [0, 5, 12].forEach((s, i) => tone("triangle", note(392, s), 0, 0.14, 0.08, { t: ac.currentTime + i * 0.07 })); },
    power(kind) {
      if (!ready()) return;
      const base = { rapid: 523, spread: 587, shield: 440, life: 659 }[kind] || 523, t = ac.currentTime;
      [0, 4, 7, 12].forEach((s, i) => tone("triangle", note(base, s), 0, 0.12, 0.11, { t: t + i * 0.05 }));
    },
    life() { if (ready()) [0, 4, 7, 12, 16].forEach((s, i) => tone("square", note(784, s), 0, 0.1, 0.05, { t: ac.currentTime + i * 0.06, lp: 4000 })); },
    mult(m) { if (ready()) { const f = 520 * Math.pow(2, m / 4); tone("square", f, f * 1.5, 0.12, 0.05, { lp: 3500 }); } },
    multLost() { if (ready()) tone("triangle", 500, 240, 0.18, 0.06); },
    waveStart(boss) {
      if (!ready()) return;
      const t = ac.currentTime;
      hiss(0.9, 0.12, "bandpass", 300, 3200, { q: 1.4, a: 0.2 });
      const chord = boss ? [0, 1, 6] : [0, 3, 7];
      chord.forEach(s => tone("triangle", note(146.8, s), 0, 0.9, 0.05, { t: t + 0.25, a: 0.08 }));
    },
    waveClear(flawless) {
      if (!ready()) return;
      const t = ac.currentTime, seq = flawless ? [0, 3, 7, 12, 15, 19] : [0, 3, 7, 12];
      seq.forEach((s, i) => tone("square", note(293.7, s), 0, 0.14, 0.05, { t: t + i * 0.08, lp: 3200 }));
      [0, 7, 12].forEach(s => tone("triangle", note(293.7, s), 0, 0.8, 0.05, { t: t + seq.length * 0.08 }));
    },
    gameOver() {
      if (!ready()) return;
      const t = ac.currentTime;
      [7, 3, 0, -5].forEach((s, i) => tone("sawtooth", note(220, s), 0, 0.42, 0.07, { t: t + i * 0.28, lp: 1400 }));
    },
    beat(n, speed, danger) {
      if (!ready()) return;
      const t = ac.currentTime + 0.005, bar = Math.floor(n / 8) % 4, st = n % 8;
      const f = note(D2, ROOTS[bar] + STEPS[st]), len = Math.min(0.22, (9 / Math.max(speed, 1)) * 0.8);
      const o = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain();
      o.type = "sawtooth";
      o.frequency.value = f;
      fl.type = "lowpass";
      fl.frequency.setValueAtTime(320 + Math.min(speed, 200) * 6, t);
      fl.frequency.exponentialRampToValueAtTime(150, t + len);
      fl.Q.value = 6;
      env(g, t, 0.004, 0.2, len);
      o.connect(fl); fl.connect(g); g.connect(music);
      o.start(t); o.stop(t + len + 0.05);
      if (st % 4 === 0) tone("sine", 150, 45, 0.12, 0.42, { t, dest: music });
      if (speed > 70 && st % 2 === 1) hiss(0.035, 0.05, "highpass", 7000, 0, { t, dest: music });
      if (danger && st % 2 === 0) tone("square", f * 4, 0, 0.06, 0.025, { t, dest: music, lp: 2400 });
    }
  };
  (root.Enjambre = root.Enjambre || {}).sonido = api;
})(typeof window !== "undefined" ? window : globalThis);
