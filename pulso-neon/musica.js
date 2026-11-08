/* Pulso Neón · música procedural y efectos (Web Audio).
   Cada nivel tiene su canción: tonalidad, progresión y melodía sembrada, organizada por las mismas
   secciones que definen los obstáculos (intro, groove, build, drop, break, outro). */
(function (G) {
  'use strict';
  const PN = G.PN || (G.PN = {});
  const MINOR = [0, 2, 3, 5, 7, 8, 10], HARM = [0, 2, 3, 5, 7, 8, 11];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function rng(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- composición ----------
  function makeSong(spec, sectionAt) {
    const scale = spec.harmonic ? HARM : MINOR;
    const r = rng(spec.seed || 1);
    const deg = (d) => spec.root + 12 * Math.floor(d / 7) + scale[((d % 7) + 7) % 7];
    const RH = [[0, 3, 6, 8, 10, 12, 14], [0, 2, 4, 7, 10, 12], [0, 4, 6, 8, 11, 14], [0, 3, 4, 7, 8, 11, 12, 14], [0, 6, 8, 12, 14], [0, 2, 3, 6, 8, 10, 11, 14]];
    const motif = [];
    let d = [0, 2, 4][(r() * 3) | 0] + 7;
    for (let bar = 0; bar < 2; bar++) {
      const rh = RH[(r() * RH.length) | 0];
      rh.forEach((s, i) => {
        const next = i + 1 < rh.length ? rh[i + 1] : 16;
        if (s % 4 === 0) {
          let best = 7;
          for (const c of [0, 2, 4, 7, 9, 11]) if (Math.abs(c - d) < Math.abs(best - d)) best = c;
          d = best;
        } else d += [-2, -1, 1, 1, 2, 3][(r() * 6) | 0];
        d = Math.max(2, Math.min(12, d));
        motif.push({ s: bar * 16 + s, len: Math.min(next - s, 4), d });
      });
    }
    const answer = motif.map((n) => ({ s: n.s, len: n.len, d: n.d }));
    const tail = answer.filter((n) => n.s >= 24);
    tail.forEach((n, i) => { n.d = i === tail.length - 1 ? 7 : Math.max(2, n.d - 1 - (i % 2)); });
    const ARPS = [[0, 2, 4, 7], [0, 4, 2, 7, 4, 9], [0, 2, 4, 7, 9, 7, 4, 2], [7, 4, 2, 0]];
    return {
      bpm: spec.bpm, prog: spec.prog, deg, lead: spec.lead || 'saw', motif, answer,
      arp: ARPS[(r() * ARPS.length) | 0], bassOct: r() < 0.5, sectionAt,
    };
  }
  function levelSections(secs, totalBeats) {
    return (bar) => {
      const beat = bar * 4;
      for (const s of secs) if (beat >= s.sb && beat < s.sb + s.bars * 4) return { type: s.type, i: (beat - s.sb) / 4, n: s.bars };
      const over = bar - totalBeats / 4;
      return over < 4 ? { type: 'outro', i: over + 2, n: 6 } : { type: 'none', i: 0, n: 1 };
    };
  }
  function loopSections(list) {
    const total = list.reduce((a, s) => a + s.bars, 0);
    return (bar) => {
      let b = ((bar % total) + total) % total;
      for (const s of list) { if (b < s.bars) return { type: s.type, i: b, n: s.bars }; b -= s.bars; }
      return { type: 'groove', i: 0, n: 1 };
    };
  }

  class AudioEngine {
    constructor() { this.ctx = null; this.cur = null; this.musicVol = 0.8; this.sfxVol = 0.8; this.timer = null; }
    init(given) {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
      const AC = G.AudioContext || G.webkitAudioContext;
      if (!AC && !given) return false;
      let ctx;
      try { ctx = this.ctx = given || new AC({ latencyHint: 'interactive' }); } catch (e) { return false; }
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
      this.master = ctx.createGain(); this.master.gain.value = 0.85;
      this.master.connect(comp); comp.connect(ctx.destination);
      this.music = ctx.createGain(); this.music.connect(this.master);
      this.sfx = ctx.createGain(); this.sfx.connect(this.master);
      this.rev = ctx.createConvolver(); this.rev.buffer = this.impulse(2.6, 2.4);
      this.rev.connect(this.music);
      this.dly = ctx.createDelay(1.5);
      const fb = ctx.createGain(); fb.gain.value = 0.32;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      this.dly.connect(lp); lp.connect(fb); fb.connect(this.dly); lp.connect(this.music);
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      this.setVolumes(this.musicVol, this.sfxVol);
      if (!given && ctx.state === 'suspended') ctx.resume();
      return true;
    }
    get ready() { return !!this.ctx; }
    latency() { const c = this.ctx; if (!c) return 0; return Math.min(0.25, (c.outputLatency || 0) + (c.baseLatency || 0)); }
    now() { return this.ctx ? this.ctx.currentTime : 0; }
    setVolumes(m, s) {
      this.musicVol = m; this.sfxVol = s;
      if (!this.ctx) return;
      this.music.gain.setTargetAtTime(m * m * 0.9, this.ctx.currentTime, 0.03);
      this.sfx.gain.setTargetAtTime(s * s, this.ctx.currentTime, 0.03);
    }
    impulse(sec, decay) {
      const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
      for (let k = 0; k < 2; k++) {
        const d = b.getChannelData(k);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
      }
      return b;
    }
    // ---------- reproducción ----------
    play(song, offset, when) {
      this.stop(0.02);
      if (!this.ctx) return;
      const c = this.ctx;
      const bus = c.createGain(); bus.gain.value = 1; bus.connect(this.music);
      const duck = c.createGain(); duck.connect(bus);
      const rv = c.createGain(); rv.gain.value = 1; rv.connect(this.rev);
      const dl = c.createGain(); dl.gain.value = 1; dl.connect(this.dly);
      this.dly.delayTime.setValueAtTime((60 / song.bpm) * 0.75, c.currentTime);
      const sd = 60 / song.bpm / 4;
      const t0 = (when == null ? c.currentTime + 0.05 : when) - (offset || 0);
      const S = { song, bus, duck, rv, dl, sd, t0, step: Math.max(0, Math.ceil((offset || 0) / sd - 1e-6)) };
      this.cur = S;
      this.tick();
      this.timer = setInterval(() => this.tick(), 25);
    }
    stop(fade) {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      const S = this.cur;
      this.cur = null;
      if (!S || !this.ctx) return;
      const t = this.ctx.currentTime, f = fade == null ? 0.06 : fade;
      S.bus.gain.cancelScheduledValues(t);
      S.bus.gain.setValueAtTime(S.bus.gain.value, t);
      S.bus.gain.linearRampToValueAtTime(0, t + f);
      S.rv.gain.setValueAtTime(1, t); S.rv.gain.linearRampToValueAtTime(0, t + f);
      S.dl.gain.setValueAtTime(1, t); S.dl.gain.linearRampToValueAtTime(0, t + f);
      setTimeout(() => { try { S.bus.disconnect(); S.rv.disconnect(); S.dl.disconnect(); } catch (e) { /* ya desconectado */ } }, (f + 0.1) * 1000);
    }
    fadeOut(sec) { this.stop(sec); }
    tick() {
      const S = this.cur;
      if (!S) return;
      const until = this.ctx.currentTime + 0.16;
      for (let guard = 0; guard < 64; guard++) {
        const t = S.t0 + S.step * S.sd;
        if (t > until) break;
        if (t >= this.ctx.currentTime - 0.02) this.stepAt(S, S.step, t);
        S.step++;
      }
    }
    stepAt(S, step, t) {
      const song = S.song;
      const bar = Math.floor(step / 16), s = step % 16;
      const sec = song.sectionAt(bar);
      const type = sec.type;
      if (type === 'none') return;
      const lastBar = sec.i >= sec.n - 1;
      const chordDeg = song.prog[bar % song.prog.length];
      const D = (d) => song.deg(chordDeg + d);
      const first = sec.i === 0 && s === 0;
      const sd = S.sd;
      // batería
      if (type === 'groove' || type === 'drop' || (type === 'build' && !(lastBar && s >= 12))) {
        if (s % 4 === 0) this.kick(S, t, 1);
      }
      if (type === 'build' && lastBar && s >= 8 && s % 2 === 0 && s < 15) this.kick(S, t, 0.7);
      if (type === 'intro' && sec.i >= sec.n / 2 && s % 4 === 0) this.kick(S, t, s === 0 ? 0.85 : 0.6);
      if ((type === 'intro' && sec.i < sec.n / 2 && s === 0) || (type === 'outro' && s === 0 && sec.i < 4) || (type === 'break' && s === 0 && sec.i % 2 === 1)) this.kick(S, t, 0.7);
      if ((type === 'groove' || type === 'drop') && (s === 4 || s === 12)) this.clap(S, t, 1);
      if (type === 'build') {
        const prog = (sec.i * 16 + s) / (sec.n * 16);
        const every = prog < 0.5 ? 4 : prog < 0.75 ? 2 : 1;
        if (s % every === 0 && prog >= 0.25) this.snare(S, t, 0.25 + prog * 0.6);
        if (first) this.riser(S, t, sec.n * 16 * sd);
      }
      if (type === 'drop' && first) this.crash(S, t);
      if (type === 'groove' && first) this.crash(S, t, 0.5);
      if (type === 'drop') this.hat(S, t, s % 4 === 2 ? 0.55 : s % 2 ? 0.18 : 0.28, s % 4 === 2);
      else if (type === 'groove' || type === 'build') { if (s % 2 === 0) this.hat(S, t, s % 4 === 2 ? 0.45 : 0.18, false); }
      else if (type === 'intro' || type === 'outro' || type === 'break') { if (s % 4 === 2) this.hat(S, t, 0.24, false); }
      // bajo
      const root = D(0) - 12;
      if (type === 'drop') {
        if (s % 4 === 2 || s % 4 === 3) this.bass(S, t, root + (song.bassOct && s === 14 ? 12 : 0), sd * 0.9, 1);
      } else if (type === 'groove') {
        if (s % 4 === 2) this.bass(S, t, root + (s === 14 && song.bassOct ? 12 : 0), sd * 1.6, 0.9);
      } else if (type === 'build') {
        if (s % 4 === 0 && !(lastBar && s >= 8)) this.bass(S, t, root, sd * 3, 0.8);
      } else if (type === 'break' && s === 0) this.bass(S, t, root, sd * 15, 0.55);
      // acordes
      if (s === 0 && type !== 'drop') this.pad(S, t, [D(0), D(2), D(4)], sd * 16, type === 'break' ? 0.55 : type === 'intro' ? 0.62 : 0.28);
      if (s === 0 && type === 'drop') this.pad(S, t, [D(0), D(2), D(4)], sd * 16, 0.22);
      // arpegio
      if (type !== 'break' && type !== 'none') {
        const a = song.arp[step % song.arp.length];
        let cut = 2200, v = 0.5;
        if (type === 'intro') { cut = 800 + 1700 * ((sec.i * 16 + s) / (sec.n * 16)); v = 0.62; }
        else if (type === 'build') { cut = 900 + 3200 * ((sec.i * 16 + s) / (sec.n * 16)); v = 0.55; }
        else if (type === 'drop') { cut = 2600; v = 0.32; }
        else if (type === 'outro') { cut = 1500 - 900 * Math.min(1, sec.i / sec.n); v = 0.35; }
        this.arp(S, t, D(a) + 12, sd * 0.9, v, cut);
      }
      // melodía
      if (type === 'drop' || type === 'break' || (type === 'groove' && sec.i >= sec.n / 2)) {
        const phrase = Math.floor(bar / 2) % 2 === 0 ? song.motif : song.answer;
        const ss = (bar % 2) * 16 + s;
        for (const n of phrase) {
          if (n.s !== ss) continue;
          const half = type === 'break';
          this.lead(S, t, D(n.d) + 12, n.len * sd * (half ? 1.6 : 0.95), type === 'drop' ? 0.9 : type === 'break' ? 0.55 : 0.6, song.lead, type === 'break' ? 1600 : 3400);
        }
      }
    }
    // ---------- instrumentos ----------
    env(g, t, a, peak, dec, sus, rel, end) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
      if (dec) g.gain.exponentialRampToValueAtTime(Math.max(peak * sus, 0.0002), t + a + dec);
      g.gain.setValueAtTime(Math.max(peak * sus, 0.0002), end);
      g.gain.exponentialRampToValueAtTime(0.0001, end + rel);
    }
    noiseSrc(t, dur) {
      const n = this.ctx.createBufferSource();
      n.buffer = this.noise;
      n.start(t, Math.random() * 1.5, dur + 0.05);
      return n;
    }
    kick(S, t, v) {
      const c = this.ctx;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(170, t);
      o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.95 * v, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      o.connect(g); g.connect(S.bus);
      o.start(t); o.stop(t + 0.45);
      const n = this.noiseSrc(t, 0.02), hp = c.createBiquadFilter(), ng = c.createGain();
      hp.type = 'highpass'; hp.frequency.value = 2500;
      ng.gain.setValueAtTime(0.18 * v, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);
      n.connect(hp); hp.connect(ng); ng.connect(S.bus);
      const dg = S.duck.gain;
      dg.cancelScheduledValues(t);
      dg.setValueAtTime(0.3, t);
      dg.linearRampToValueAtTime(1, t + 0.2);
    }
    clap(S, t, v) {
      const c = this.ctx, n = this.noiseSrc(t, 0.25);
      const bp = c.createBiquadFilter(), g = c.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 0.9;
      g.gain.setValueAtTime(0.0001, t);
      for (let k = 0; k < 3; k++) { g.gain.setValueAtTime(0.5 * v, t + k * 0.011); g.gain.exponentialRampToValueAtTime(0.06 * v, t + k * 0.011 + 0.009); }
      g.gain.setValueAtTime(0.42 * v, t + 0.034);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      n.connect(bp); bp.connect(g); g.connect(S.bus);
      const s = c.createGain(); s.gain.value = 0.35; g.connect(s); s.connect(S.rv);
    }
    snare(S, t, v) {
      const c = this.ctx, n = this.noiseSrc(t, 0.14);
      const bp = c.createBiquadFilter(), g = c.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.7;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4 * v, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      n.connect(bp); bp.connect(g); g.connect(S.bus);
      const o = c.createOscillator(), og = c.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.06);
      og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.25 * v, t + 0.003); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.connect(og); og.connect(S.bus); o.start(t); o.stop(t + 0.1);
    }
    hat(S, t, v, open) {
      const c = this.ctx, dur = open ? 0.2 : 0.045, n = this.noiseSrc(t, dur);
      const hp = c.createBiquadFilter(), g = c.createGain();
      hp.type = 'highpass'; hp.frequency.value = open ? 6500 : 8000;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32 * v, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(hp); hp.connect(g); g.connect(S.bus);
    }
    crash(S, t, v = 1) {
      const c = this.ctx, n = this.noiseSrc(t, 1.8);
      const hp = c.createBiquadFilter(), g = c.createGain();
      hp.type = 'highpass'; hp.frequency.value = 3200;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28 * v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
      n.connect(hp); hp.connect(g); g.connect(S.bus);
      const s = c.createGain(); s.gain.value = 0.5; g.connect(s); s.connect(S.rv);
    }
    riser(S, t, dur) {
      const c = this.ctx, n = this.noiseSrc(t, dur);
      const bp = c.createBiquadFilter(), g = c.createGain();
      bp.type = 'bandpass'; bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(350, t); bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.95); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
      n.connect(bp); bp.connect(g); g.connect(S.bus);
      const s = c.createGain(); s.gain.value = 0.4; g.connect(s); s.connect(S.rv);
    }
    bass(S, t, m, dur, v) {
      const c = this.ctx, f = mtof(m);
      const o1 = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
      o1.type = 'sawtooth'; o1.frequency.value = f;
      o2.type = 'square'; o2.frequency.value = f / 2;
      const g2 = c.createGain(); g2.gain.value = 0.55;
      lp.type = 'lowpass'; lp.Q.value = 5;
      lp.frequency.setValueAtTime(1100, t); lp.frequency.exponentialRampToValueAtTime(240, t + Math.max(0.08, dur));
      this.env(g, t, 0.005, 0.3 * v, 0.06, 0.75, 0.05, t + dur);
      o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(S.duck);
      o1.start(t); o2.start(t); o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
    }
    lead(S, t, m, dur, v, kind, cut) {
      const c = this.ctx, f = mtof(m);
      const lp = c.createBiquadFilter(), g = c.createGain();
      lp.type = 'lowpass'; lp.Q.value = 2;
      const oscs = [];
      const types = kind === 'square' ? ['square', 'square'] : kind === 'pluck' ? ['triangle', 'sawtooth'] : ['sawtooth', 'sawtooth'];
      [-7, 7].forEach((det, i) => { const o = c.createOscillator(); o.type = types[i]; o.frequency.value = f; o.detune.value = det; o.connect(lp); oscs.push(o); });
      if (kind === 'pluck') { lp.frequency.setValueAtTime(cut * 1.4, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.25); }
      else { lp.frequency.setValueAtTime(cut * 0.6, t); lp.frequency.linearRampToValueAtTime(cut, t + 0.04); }
      this.env(g, t, 0.008, 0.16 * v, 0.12, kind === 'pluck' ? 0.35 : 0.7, 0.09, t + dur);
      lp.connect(g); g.connect(S.duck);
      const ds = c.createGain(); ds.gain.value = 0.32; g.connect(ds); ds.connect(S.dl);
      const rs = c.createGain(); rs.gain.value = 0.25; g.connect(rs); rs.connect(S.rv);
      oscs.forEach((o) => { o.start(t); o.stop(t + dur + 0.15); });
    }
    arp(S, t, m, dur, v, cut) {
      const c = this.ctx;
      const o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
      o.type = 'square'; o.frequency.value = mtof(m);
      lp.type = 'lowpass'; lp.Q.value = 3; lp.frequency.setValueAtTime(cut, t); lp.frequency.exponentialRampToValueAtTime(Math.max(200, cut * 0.35), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.075 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
      o.connect(lp); lp.connect(g); g.connect(S.duck);
      const ds = c.createGain(); ds.gain.value = 0.25; g.connect(ds); ds.connect(S.dl);
      o.start(t); o.stop(t + dur + 0.06);
    }
    pad(S, t, ms, dur, v) {
      const c = this.ctx;
      const lp = c.createBiquadFilter(), g = c.createGain();
      lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 0.6;
      for (const m of ms) for (const det of [-11, 11]) {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
        o.connect(lp); o.start(t); o.stop(t + dur + 0.7);
      }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.045 * v, t + Math.min(0.35, dur * 0.3));
      g.gain.setValueAtTime(0.045 * v, t + dur * 0.85);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
      lp.connect(g); g.connect(S.duck);
      const rs = c.createGain(); rs.gain.value = 0.6; g.connect(rs); rs.connect(S.rv);
    }
    // ---------- efectos ----------
    blip(t, f, dur, type, v, f2) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.02);
    }
    sfxDeath() {
      if (!this.ctx) return;
      const c = this.ctx, t = c.currentTime + 0.005;
      const n = this.noiseSrc(t, 0.6), lp = c.createBiquadFilter(), g = c.createGain();
      lp.type = 'lowpass'; lp.Q.value = 2; lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(160, t + 0.5);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      n.connect(lp); lp.connect(g); g.connect(this.sfx);
      this.blip(t, 150, 0.3, 'sine', 0.8, 38);
      this.blip(t, 600, 0.12, 'square', 0.12, 90);
    }
    sfxCoin() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + 0.005;
      this.blip(t, 1318.5, 0.09, 'square', 0.12);
      this.blip(t + 0.075, 1975.5, 0.22, 'square', 0.12);
      this.blip(t + 0.075, 3951, 0.18, 'sine', 0.05);
    }
    sfxClick() { if (this.ctx) this.blip(this.ctx.currentTime + 0.002, 1250, 0.05, 'triangle', 0.18, 900); }
    sfxCheckpoint() { if (this.ctx) { const t = this.ctx.currentTime + 0.003; this.blip(t, 880, 0.07, 'sine', 0.2); this.blip(t + 0.06, 1320, 0.12, 'sine', 0.16); } }
    sfxWin() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + 0.01;
      [72, 76, 79, 84, 88].forEach((m, i) => { this.blip(t + i * 0.085, mtof(m), 0.45, 'triangle', 0.18); this.blip(t + i * 0.085, mtof(m + 12), 0.25, 'sine', 0.05); });
    }
  }

  PN.Audio = { AudioEngine, makeSong, levelSections, loopSections };
})(typeof window !== 'undefined' ? window : globalThis);
