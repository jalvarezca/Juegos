#!/usr/bin/env node
/* Bot de verificación: busca una secuencia de entradas que complete cada nivel
   y mide la ventana de tiempo de cada acción (con 150 ms de reacción antes de corregir).
   Uso: node pulso-neon/herramientas/bot.js [número de nivel desde 0] [--coins] [--windows] */
'use strict';
const E = require('../motor.js');
const LV = require('../niveles.js');

const TAP = 3, SPF = 4, FRAME_MS = 1000 / 60;
const tapMode = (m) => m === 'cube' || m === 'ball' || m === 'ufo';

function frame(s, L, held, pressed) {
  for (let k = 0; k < SPF; k++) {
    E.step(s, L, held, pressed && k === 0);
    if (s.dead || s.won) return;
  }
}
function hash(str) {
  let h1 = 0x811c9dc5, h2 = 0x1b873593;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return (h1 >>> 0) * 2097152 + ((h2 >>> 0) & 0x1fffff);
}
function key(f, s, held, tap) {
  return hash(f + ':' + Math.round(s.y * 200) + ':' + Math.round(s.vy * 20) + ':' + s.mode[1] + s.grav + s.spd +
    (s.onGround ? 1 : 0) + (held ? 1 : 0) + tap + ':' + Math.ceil(s.buf * 100) + ':' + s.used.join(',') + ':' + s.coins +
    ':' + (s.air < 0.05 ? Math.round(s.air * 1000) : 9));
}

function ckey(s, held, tap) {
  return Math.round(s.y * 25) + ':' + Math.round(s.vy * 2.5) + ':' + s.mode[1] + s.grav + s.spd + (s.onGround ? 1 : 0) +
    (held ? 1 : 0) + tap + ':' + Math.ceil(s.buf * 60) + ':' + s.used.join(',') + ':' + s.coins + ':' + (s.air < 0.05 ? Math.round(s.air * 200) : 9);
}
const popc = (n) => { let c = 0; while (n) { c += n & 1; n >>>= 1; } return c; };
// distancia a las paredes de un túnel (para preferir trayectorias centradas, como haría una persona)
function clearance(L, s) {
  const col = L.cols[Math.floor(s.x)];
  if (!col) return 9;
  let best = 9;
  const B = E.BOX[s.mode];
  for (const o of col) {
    if (o.t !== 'tunnel' || s.x < o.x0 || s.x > o.x1) continue;
    const w = E.tunnelAt(o, s.x);
    const c = Math.min(s.y - B.zh - Math.max(w[0], o.floor - 1), Math.min(w[1], o.ceil + 1) - (s.y + B.zh));
    if (c < best) best = c;
  }
  return best;
}

// búsqueda en haz: por cada fotograma conserva hasta K estados distintos (agrupados por altura)
function solve(L, opts = {}) {
  const want = opts.coins ? (1 << L.coinCount) - 1 : 0;
  const coinX = [];
  if (want) for (const o of L.objs) if (o.t === 'coin') coinX[o.cid] = o.x;
  const K = opts.K || 700;
  const st = opts.start || { s: E.newPlayer(L), held: false, tap: 0, f: 0 };
  const maxF = opts.maxF || Infinity;
  let front = [{ s: st.s, held: st.held, tap: st.tap, node: null, ev: 0, dg: 0 }];
  let nodes = 0, bestX = 0;
  for (let f = st.f; ; f++) {
    const next = new Map();
    for (const e of front) {
      const tm = tapMode(e.s.mode);
      for (let ch = 0; ch < 2; ch++) {
        let held, tap;
        if (ch === 0) {
          if (tm) { held = e.tap > 0; tap = Math.max(0, e.tap - 1); } else { held = e.held; tap = 0; }
        } else if (tm) { if (e.held || e.tap > 0) continue; held = true; tap = TAP - 1; }
        else { held = !e.held; tap = 0; }
        const s = E.clone(e.s);
        frame(s, L, held, held && !e.held);
        nodes++;
        if (s.dead) { if (s.x > bestX) bestX = s.x; continue; }
        if (want) {
          let miss = false;
          for (let c = 0; c < coinX.length; c++) if (!(s.coins & (1 << c)) && s.x > coinX[c] + 2) { miss = true; break; }
          if (miss) continue;
        }
        const ev = e.ev + (ch === 1 ? 1 : 0);
        const cl = clearance(L, s);
        const dg = e.dg + (cl < 0.75 ? 0.75 - cl : 0);
        const node = { p: e.node, h: held };
        if (s.won || f + 1 >= maxF) {
          if (s.won && want && (s.coins & want) !== want) continue;
          const inputs = [];
          for (let n = node; n; n = n.p) inputs.push(n.h);
          inputs.reverse();
          return { ok: true, inputs, nodes, s };
        }
        const k = ckey(s, held, tap);
        const old = next.get(k);
        if (!old || old.dg > dg + 1e-9 || (Math.abs(old.dg - dg) <= 1e-9 && old.ev > ev)) next.set(k, { s, held, tap, node, ev, dg });
      }
    }
    front = [...next.values()];
    if (!front.length) return { ok: false, nodes, bestX, f };
    if (front.length > K) {
      const groups = new Map();
      for (const e of front) {
        const vc = e.s.vy > 3 ? 2 : e.s.vy < -3 ? 0 : 1;
        const g = Math.floor(e.s.y * 4) * 8 + vc * 2 + (e.held ? 1 : 0);
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(e);
      }
      const keys = [...groups.keys()].sort((a, b) => a - b);
      for (const g of keys) groups.get(g).sort((a, b) => a.dg - b.dg || a.ev - b.ev);
      const out = [];
      for (let round = 0; out.length < K; round++) {
        let any = false;
        for (const g of keys) {
          const arr = groups.get(g);
          if (round < arr.length) { out.push(arr[round]); any = true; if (out.length >= K) break; }
        }
        if (!any) break;
      }
      front = out;
    }
  }
}

// quita entradas sobrantes: toques que no cambian nada y pulsaciones cortas de nave/onda
function simplify(L, inputs, opts = {}) {
  const want = opts.coins ? (1 << L.coinCount) - 1 : 0;
  let inp = inputs.slice();
  let rp = replay(L, inp);
  const okRun = (s) => s.won && (!want || (s.coins & want) === want);
  if (!okRun(rp.s)) return inp;
  const runs = () => {
    const out = [];
    for (let f = 0; f < inp.length;) {
      const h = inp[f];
      let g = f;
      while (g < inp.length && inp[g] === h) g++;
      out.push({ a: f, b: g, h });
      f = g;
    }
    return out;
  };
  const tryEdit = (a, b, val) => {
    const mod = inp.slice();
    for (let k = a; k < b; k++) mod[k] = val;
    const s = E.clone(rp.states[a]);
    let prev = a > 0 ? mod[a - 1] : false;
    for (let f = a; f < mod.length; f++) {
      frame(s, L, mod[f], mod[f] && !prev);
      prev = mod[f];
      if (s.dead) return false;
      if (s.won) break;
    }
    if (!okRun(s)) return false;
    inp = mod;
    rp = replay(L, inp);
    return true;
  };
  for (let pass = 0; pass < 2; pass++) {
    let rs = runs();
    for (let i = rs.length - 1; i >= 0; i--) {
      const r = rs[i];
      if (r.b >= inp.length || r.a === 0) continue;
      const mode = rp.states[r.a] ? rp.states[r.a].mode : 'cube';
      if (r.h) {
        if (tapMode(mode) || r.b - r.a <= 8) tryEdit(r.a, r.b, false);
      } else if (!tapMode(mode) && r.b - r.a <= 8) tryEdit(r.a, r.b, true);
    }
  }
  return inp;
}

function replay(L, inputs) {
  const s = E.newPlayer(L);
  const states = [E.clone(s)];
  let prev = false;
  for (let f = 0; f < inputs.length; f++) {
    frame(s, L, inputs[f], inputs[f] && !prev);
    prev = inputs[f];
    states.push(E.clone(s));
    if (s.dead || s.won) break;
  }
  return { s, states };
}

// eventos: toques (modos de toque) o cambios de estado (nave/onda)
function events(inputs, states) {
  const ev = [];
  let prev = false;
  for (let f = 0; f < inputs.length; f++) {
    const h = inputs[f];
    if (h !== prev) {
      const m = states[f].mode;
      if (tapMode(m)) { if (h) ev.push({ f, kind: 'tap', mode: m, x: states[f].x }); }
      else ev.push({ f, kind: 'tog', on: h, mode: m, x: states[f].x });
    }
    prev = h;
  }
  return ev;
}

function tryShift(L, inputs, states, ev, i, d, R, Hf) {
  const e = ev[i];
  if (e.kind === 'tog') R = Math.min(R, 6);
  const f2 = e.f + d;
  if (f2 < 1) return false;
  const mod = inputs.slice();
  if (e.kind === 'tap') {
    // ninguna otra pulsación cerca
    for (let k = f2 - 4; k < f2 + TAP + 4; k++) {
      if (k >= e.f - 1 && k < e.f + TAP + 1) continue;
      if (inputs[k]) return null;
    }
    let k = e.f;
    while (k < mod.length && inputs[k]) mod[k++] = false;
    for (let j = 0; j < TAP; j++) mod[f2 + j] = true;
  } else {
    const prevF = i > 0 ? ev[i - 1].f : 0, nextF = i + 1 < ev.length ? ev[i + 1].f : mod.length;
    if (f2 <= prevF || f2 >= nextF) return null;
    const A = !e.on, Bv = e.on;
    if (d < 0) for (let k = f2; k < e.f; k++) mod[k] = Bv;
    else for (let k = e.f; k < f2; k++) mod[k] = A;
  }
  const fa = Math.min(e.f, f2);
  const s = E.clone(states[fa]);
  let prev = fa > 0 ? mod[fa - 1] : false;
  const until = Math.min(mod.length, Math.max(e.f, f2) + TAP + R);
  let tapLeft = 0;
  for (let f = fa; f < until; f++) {
    frame(s, L, !!mod[f], !!mod[f] && !prev);
    prev = !!mod[f];
    if (s.dead) return false;
    if (s.won) return true;
  }
  for (let k = until - 1; k >= until - TAP && k >= 0; k--) if (mod[k]) tapLeft = Math.max(tapLeft, TAP - 1 - (until - 1 - k));
  const r = solve(L, { start: { s, held: prev, tap: tapMode(s.mode) ? Math.max(0, tapLeft) : 0, f: until }, maxF: until + Hf, K: 160 });
  return r.ok;
}

function windows(L, inputs, states, opts = {}) {
  const R = opts.R || 9, Hf = opts.H || 150, maxD = opts.maxD || 14;
  const ev = events(inputs, states);
  const out = [];
  for (let i = 0; i < ev.length; i++) {
    let lo = 0, hi = 0;
    for (let d = -1; d >= -maxD; d--) { const r = tryShift(L, inputs, states, ev, i, d, R, Hf); if (r !== true) break; lo = d; }
    for (let d = 1; d <= maxD; d++) { const r = tryShift(L, inputs, states, ev, i, d, R, Hf); if (r !== true) break; hi = d; }
    out.push(Object.assign({}, ev[i], { lo, hi, w: hi - lo + 1 }));
  }
  return out;
}

function analyzeLevel(idx, opts = {}) {
  const L = LV.buildLevel(idx);
  const t0 = Date.now();
  const r = solve(L, { coins: opts.coins });
  const res = { idx, name: L.spec.name, len: L.endX, dur: L.duration, coins: L.coinCount, objs: L.objs.length, ok: r.ok, nodes: r.nodes, ms: Date.now() - t0 };
  if (!r.ok) { res.bestX = r.bestX; res.pct = ((100 * r.bestX) / L.endX).toFixed(1); return res; }
  const t1 = Date.now();
  const clean = simplify(L, r.inputs, { coins: opts.coins });
  const rp = replay(L, clean);
  res.replayOk = rp.s.won;
  res.inputs = clean;
  res.rawEvents = events(r.inputs, replay(L, r.inputs).states).length;
  res.cleanEvents = events(clean, rp.states).length;
  res.simplifyMs = Date.now() - t1;
  if (opts.windows) {
    const w = windows(L, r.inputs, rp.states, opts);
    res.events = w.length;
    res.win = w;
  }
  return res;
}

module.exports = { solve, replay, events, windows, analyzeLevel, simplify, frame, TAP };

if (require.main === module) {
  const args = process.argv.slice(2);
  const coins = args.includes('--coins');
  const wins = args.includes('--windows');
  const idxs = args.filter((a) => /^\d+$/.test(a)).map(Number);
  const list = idxs.length ? idxs : LV.LEVELS.map((_, i) => i);
  for (const i of list) {
    const r = analyzeLevel(i, { coins, windows: wins });
    if (!r.ok) {
      console.log(`[${i}] ${r.name}: FALLA en x=${r.bestX.toFixed(1)} (${r.pct}%) nodes=${r.nodes} ${r.ms}ms`);
      continue;
    }
    let line = `[${i}] ${r.name}: OK len=${r.len.toFixed(0)} dur=${r.dur.toFixed(1)}s objs=${r.objs} coins=${r.coins} nodes=${r.nodes} ${r.ms}ms replay=${r.replayOk} ev=${r.rawEvents}->${r.cleanEvents} (${r.simplifyMs}ms)`;
    if (r.win) {
      const ws = r.win.map((e) => e.w).sort((a, b) => a - b);
      const lowT = r.win.filter((e) => e.w <= 3).length;
      line += ` events=${r.events} minW=${ws[0]}f (${(ws[0] * FRAME_MS).toFixed(0)}ms) p10=${ws[Math.floor(ws.length * 0.1)]}f tight(<=3f)=${lowT}`;
      console.log(line);
      const worst = r.win.slice().sort((a, b) => a.w - b.w).slice(0, 8);
      for (const e of worst) console.log(`    ${e.kind} ${e.mode} x=${e.x.toFixed(1)} f=${e.f} window=${e.w}f [${e.lo},${e.hi}]`);
    } else console.log(line);
  }
}
