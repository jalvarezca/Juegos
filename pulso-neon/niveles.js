/* Pulso Neón · constructor de niveles.
   Los niveles se componen por secciones musicales (compases de 4 tiempos). Cada patrón calcula
   su geometría a partir de la física real del salto para que la acción caiga sobre el pulso. */
(function (G) {
  'use strict';
  const PN = G.PN || (G.PN = {});
  const E = PN.Engine || (typeof require !== 'undefined' ? require('./motor.js') : null);
  const { SPEEDS, PH } = E;
  const CG = PH.cube.g, CV = PH.cube.jump, AIR = (2 * CV) / CG, APEX = CV / CG;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function lerpT(tbl, d) {
    const i = Math.max(0, Math.min(tbl.length - 1, d - 1));
    const k = Math.min(tbl.length - 2, Math.floor(i)), f = i - k;
    return tbl[k] + (tbl[k + 1] - tbl[k]) * f;
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ---- arcos de salto (altura relativa del borde inferior) ----
  function tUp(h, v0 = CV, g = CG) { const D = v0 * v0 - 2 * g * h; return D < 0 ? null : (v0 - Math.sqrt(D)) / g; }
  function tDn(h, v0 = CV, g = CG) { const D = v0 * v0 - 2 * g * h; return D < 0 ? null : (v0 + Math.sqrt(D)) / g; }
  // distancia desde el punto de salto al primer pincho de una fila de n (pincho de altura útil hz)
  function spikeLead(v, n, hz = 0.6, v0 = CV) {
    const hb = hz - 0.06;
    const t1 = tUp(hb, v0), t2 = tDn(hb, v0);
    const lo = t1 * v + 0.14, hi = t2 * v - 1.14 - (n - 1);
    return { at: (lo + hi) / 2, lo, hi, win: hi - lo };
  }
  // distancia al borde izquierdo de una plataforma dh bloques más alta
  function platLead(v, dh, v0 = CV) {
    const a = dh - 0.32;
    const lo = a <= 0 ? -0.3 : 0.18 + v * tUp(a, v0);
    const hi = Math.min(0.18 + v * tDn(a, v0), 0.5 + v * tDn(dh - 0.2, v0));
    return { at: (lo + hi) / 2, lo, hi, win: hi - lo };
  }

  class LB {
    constructor() { this.objs = []; this.coinN = 0; }
    add(o) { this.objs.push(o); return o; }
    merge(T) { for (const o of T.objs) this.objs.push(o); this.coinN = T.coinN; }
    block(x, y, w = 1, h = 1) { if (w < 0.05 || h < 0.05) return null; return this.add({ t: 'block', x, y, w, h }); }
    spike(x, y = 0, dir = 'u', s = 1) {
      const o = { t: 'spike', x, y, dir, s };
      const hh = 0.6 * s;
      o.hx0 = x + 0.3; o.hx1 = x + 0.7;
      if (dir === 'd') { o.hy0 = y + 1 - hh; o.hy1 = y + 1; } else { o.hy0 = y; o.hy1 = y + hh; }
      return this.add(o);
    }
    spikes(x, n, y = 0, dir = 'u', s = 1) { for (let i = 0; i < n; i++) this.spike(x + i, y, dir, s); }
    saw(x, y, r = 1) { return this.add({ t: 'saw', x, y, r, hr: r * 0.82 }); }
    pad(x, y, c, dir = 'u') { return this.add({ t: 'pad', x, y, c, dir }); }
    orb(x, y, c) { return this.add({ t: 'orb', x, y, c }); }
    portal(x, k, o = {}) {
      return this.add({ t: 'portal', x, k, y: o.y == null ? 1.5 : o.y, floor: o.floor == null ? 0 : o.floor, ceil: o.ceil == null ? Infinity : o.ceil });
    }
    coin(x, y) { return this.add({ t: 'coin', x, y, cid: this.coinN++ }); }
    tunnel(pts, floor, ceil) { return this.add({ t: 'tunnel', pts, x0: pts[0][0], x1: pts[pts.length - 1][0], floor, ceil }); }
  }

  function ctx(v, bs, d, r) {
    const c = { v, bs, bl: v * bs, d, r };
    c.rest = lerpT([0.42, 0.34, 0.27, 0.21, 0.16, 0.12], Math.max(1, d));
    c.hb = (sec) => Math.max(0.5, Math.ceil((sec - 1e-6) / (bs / 2)) / 2);
    c.after = (sec) => c.hb(sec + c.rest);
    return c;
  }
  const snapBeat = (b) => Math.ceil(b * 2 - 1e-6) / 2;

  // ======================= patrones del cubo =======================
  // Cada patrón recibe x = posición del jugador en el pulso de la primera acción,
  // coloca objetos y devuelve cuántos pulsos faltan para estar listo para la siguiente acción.
  function patSpikes(n) {
    return (B, x, c) => {
      const L = spikeLead(c.v, n);
      if (L.win / c.v < 0.075) return 0;
      B.spikes(x + L.at, n);
      return c.after(AIR);
    };
  }
  function patSmall(B, x, c) {
    const n = 2 + (c.d >= 2.5 && c.r() < 0.5 ? 1 : 0);
    const L = spikeLead(c.v, n, 0.3);
    if (L.win / c.v < 0.075) return 0;
    B.spikes(x + L.at, n, 0, 'u', 0.5);
    return c.after(AIR);
  }
  function patSaw(B, x, c) {
    const r = 1, hr = r * 0.82;
    const t1 = tUp(hr - 0.06), t2 = tDn(hr - 0.06);
    const lo = t1 * c.v + hr + 0.44, hi = t2 * c.v - hr - 0.44;
    if ((hi - lo) / c.v < 0.075) return 0;
    B.saw(x + (lo + hi) / 2, 0, r);
    return c.after(AIR);
  }
  function patPlat(B, x, c) {
    const L = platLead(c.v, 1);
    const bx = x + L.at;
    let beat = c.after(tDn(1));
    const nsp = c.d < 1.5 ? (c.r() < 0.5 ? 0 : 1) : 1 + (c.r() < 0.4 ? 1 : 0);
    for (let i = 0; i < nsp; i++) {
      const S = spikeLead(c.v, 1);
      B.spike(x + beat * c.bl + S.at, 1);
      beat += c.after(AIR);
    }
    if (nsp === 0) beat += 0.5;
    B.block(bx, 0, x + beat * c.bl - bx, 1);
    return beat + c.hb(0.16 + c.rest);
  }
  function patWall2(B, x, c) {
    const L = platLead(c.v, 2);
    if (L.win / c.v < 0.12) return 0;
    const bx = x + L.at;
    let beat = c.after(tDn(2));
    if (c.d >= 2.5 && c.r() < 0.5) {
      const S = spikeLead(c.v, 1);
      B.spike(x + beat * c.bl + S.at, 2);
      beat += c.after(AIR);
    }
    B.block(bx, 0, Math.max(1.2, x + beat * c.bl - bx), 2);
    return beat + c.hb(Math.sqrt(4 / CG) + c.rest);
  }
  function patStairs(B, x, c) {
    const k = c.d >= 2.5 ? 3 : 2;
    const L = platLead(c.v, 1);
    const sb = c.after(tDn(1)), S = sb * c.bl;
    const edges = [];
    for (let i = 0; i < k; i++) edges.push(x + i * S + L.at);
    const landLast = x + (k - 1) * S + tDn(1) * c.v;
    const ex = Math.max(landLast + 1.2, x + k * S);
    for (let i = 0; i < k; i++) B.block(edges[i], 0, (i + 1 < k ? edges[i + 1] : ex) - edges[i], i + 1);
    return snapBeat((ex - x) / c.bl) + c.hb(Math.sqrt((2 * k) / CG) + c.rest);
  }
  function patPits(B, x, c) {
    const n = 2 + (c.d >= 2.5 ? 1 : 0) + (c.r() < 0.35 ? 1 : 0);
    const L1 = platLead(c.v, 1);
    const S = c.after(AIR) * c.bl;
    const px0 = x + L1.at;
    let xj = x + c.after(tDn(1)) * c.bl;
    let prevEnd = xj + 0.5;
    const T = [[px0, prevEnd]];
    const sp = [];
    for (let i = 1; i < n; i++) {
      const land = xj + AIR * c.v;
      const start = land - 1.4;
      const last = i === n - 1;
      const nxj = xj + S;
      const end = last ? Math.max(land + 1.5, nxj) : nxj + 0.5;
      const g = start - prevEnd;
      if (g < 1.4) return 0;
      sp.push([prevEnd + (g - Math.floor(g)) / 2, Math.floor(g)]);
      T.push([start, end]);
      prevEnd = end; xj = nxj;
    }
    for (const [a, b] of T) B.block(a, 0, b - a, 1);
    for (const [a, k] of sp) B.spikes(a, k);
    return snapBeat((prevEnd - x) / c.bl) + c.hb(0.16 + c.rest);
  }
  function patPad(B, x, c) {
    const vy = E.PAD.cube[0];
    const t1 = tUp(0.54, vy), t2 = tDn(0.54, vy);
    const lo = Math.max(1.6, t1 * c.v + 0.14 + 0.5), hi = t2 * c.v - 1.14 - 0.5;
    const n = Math.min(5, Math.floor(hi - lo) + 1);
    if (n < 2) return 0;
    B.pad(x + 0.4, 0, 'y');
    B.spikes(x + lo + (hi - lo - (n - 1)) / 2, n);
    return c.after((2 * vy) / CG);
  }
  function patPadUp(B, x, c) {
    const vy = E.PAD.cube[0];
    const L = platLead(c.v, 3, vy);
    if (L.lo < 1.6) L.at = Math.max(L.at, 1.6 + (L.hi - 1.6) / 2);
    B.pad(x + 0.4, 0, 'y');
    const bx = x + L.at;
    let beat = c.after(tDn(3, vy));
    if (c.d >= 2 && c.r() < 0.6) {
      const S = spikeLead(c.v, 1);
      B.spike(x + beat * c.bl + S.at, 3);
      beat += c.after(AIR);
    }
    B.block(bx, 0, x + beat * c.bl - bx, 3);
    return beat + c.hb(Math.sqrt(6 / CG) + c.rest);
  }
  function orbArc(x, c, ox, oy) {
    const yc = (t) => CV * t - (CG * t * t) / 2 + 0.5;
    let ta = null, tb = null;
    for (let t = 0; t < AIR; t += 0.002) {
      if (Math.abs(x + c.v * t - ox) < 1.1 && Math.abs(yc(t) - oy) < 1.1) { if (ta === null) ta = t; tb = t; }
    }
    if (ta === null) return null;
    let clr = Infinity, land = 0;
    for (let tp = ta; tp <= tb + 1e-9; tp += 0.005) {
      const yb = yc(tp) - 0.5, peak = yb + (CV * CV) / (2 * CG);
      clr = Math.min(clr, x + c.v * (tp + APEX + Math.sqrt((2 * Math.max(0, peak - 0.54)) / CG)));
      land = Math.max(land, tp + APEX + Math.sqrt((2 * peak) / CG));
    }
    return { ta, tb, clr, land };
  }
  function patOrbPit(B, x, c) {
    const ox = x + APEX * c.v + 0.5, oy = 2.95;
    const A = orbArc(x, c, ox, oy);
    if (!A || A.tb - A.ta < 0.12) return 0;
    const s0 = x + 1.3, s1 = A.clr - 1.14 - 0.6;
    const n = Math.floor(s1 - s0) + 1;
    if (n < 3) return 0;
    B.orb(ox, oy, 'y');
    B.spikes(s0, n);
    return c.after(A.land);
  }
  function patGrav(B, x, c) {
    const H = 4, k = E.PAD.cube[2];
    B.pad(x + 0.4, 0, 'b');
    const tr = (-k + Math.sqrt(k * k + 2 * CG * (H - 1))) / CG;
    let beat = c.after(tr);
    const nsp = 1 + (c.d >= 3 && c.r() < 0.5 ? 1 : 0);
    for (let i = 0; i < nsp; i++) {
      const S = spikeLead(c.v, 1);
      B.spike(x + beat * c.bl + S.at, H - 1, 'd');
      beat += c.after(AIR);
    }
    const gx = x + beat * c.bl;
    B.portal(gx - 0.5, 'gn', { y: H - 1.5 });
    B.block(x - 1.5, H, gx + 1.5 - (x - 1.5), 1);
    const g0 = x + 2.2, g1 = gx - 1.5;
    if (g1 - g0 >= 1) B.spikes(g0, Math.floor(g1 - g0));
    return beat + c.hb(Math.sqrt((2 * (H - 1)) / CG) + c.rest);
  }
  function patCoinOrb(B, x, c) {
    const S = spikeLead(c.v, 1);
    B.spike(x + S.at, 0);
    const ox = x + APEX * c.v + 0.35, oy = 3.15;
    B.orb(ox, oy, 'y');
    B.coin(ox + APEX * c.v * 0.85, 5.3);
    return c.after(APEX + APEX + Math.sqrt((2 * 4.6) / CG) + 0.1);
  }

  const CUBE_POOL = [
    ['spk1', patSpikes(1), 0, () => 3],
    ['spk2', patSpikes(2), 0.9, (d) => 1.6 + d * 0.3],
    ['spk3', patSpikes(3), 2.2, (d) => 0.5 + d * 0.3],
    ['small', patSmall, 1.2, () => 0.8],
    ['saw', patSaw, 1.8, () => 1],
    ['plat', patPlat, 0, () => 2],
    ['wall2', patWall2, 1.5, () => 1],
    ['stairs', patStairs, 0.9, () => 1.1],
    ['pits', patPits, 1.4, (d) => 1.3 + d * 0.2],
    ['pad', patPad, 0.9, () => 1.1],
    ['padUp', patPadUp, 1.5, () => 1],
    ['orbPit', patOrbPit, 1.8, () => 1.2],
    ['grav', patGrav, 2.4, () => 1],
  ];
  function genCube(B, X, b, end, c, sec) {
    const pool = CUBE_POOL.filter((p) => c.d >= p[2]);
    if (c.d < 0.8) pool.length = 1;
    let guard = 0, last = '';
    const tryPat = (fn) => {
      const T = new LB(); T.coinN = B.coinN;
      const used = fn(T, X(b), c);
      if (used > 0 && b + used <= end) { B.merge(T); b += used; return true; }
      return false;
    };
    if (sec.coin) tryPat(patCoinOrb);
    while (b < end - 0.5 && guard++ < 300) {
      let placed = false;
      for (let tries = 0; tries < 10 && !placed; tries++) {
        let tot = 0;
        for (const p of pool) tot += p[0] === last && pool.length > 2 ? 0 : p[3](c.d);
        let q = c.r() * tot, pick = pool[0];
        for (const p of pool) { const w = p[0] === last && pool.length > 2 ? 0 : p[3](c.d); if ((q -= w) <= 0) { pick = p; break; } }
        if (tryPat(pick[1])) { placed = true; last = pick[0]; }
      }
      if (!placed) break;
      if (c.d < 0.8) b += 1.5;
      else if (c.d < 1.5) b += c.r() < 0.5 ? 0.5 : 1;
      else if (c.d < 3) b += c.r() < 0.5 ? 0 : 0.5;
      else if (c.r() < 0.25) b += 0.5;
    }
    return b;
  }

  // ======================= generadores de vehículos =======================
  // tiempo que tarda la nave en desplazarse D bloques en vertical (de reposo a reposo)
  function shipTime(D) {
    const a = 40, vm = 10.5, dAcc = (vm * vm) / a;
    return D <= dAcc ? 2 * Math.sqrt(D / a) : (2 * vm) / a + (D - dAcc) / vm;
  }
  function genShip(B, xa, xb, c, wantCoin) {
    const H = 10, r = c.r;
    const gap = lerpT([4.6, 4.1, 3.7, 3.3, 3.0, 2.7], c.d);
    let sp = c.hb(lerpT([0.95, 0.82, 0.72, 0.62, 0.55, 0.5], c.d)) * c.bl;
    const comfort = lerpT([2.6, 2.2, 1.9, 1.7, 1.55, 1.45], c.d);
    let delta = lerpT([1.2, 1.7, 2.2, 2.7, 3.2, 3.6], c.d);
    const avail = () => (sp - 1.9) / c.v;
    while (delta > 0.7 && shipTime(delta + 0.6) * comfort > avail()) delta -= 0.1;
    while (shipTime(delta + 0.6) * comfort > avail()) sp += c.bl / 2;
    let x = xa, coin = !wantCoin, yEst = 1, feats = 0;
    while (x < xb - 3) {
      const tunnelOK = c.d >= 1.4 && xb - x > c.bl * 4 && feats > 0;
      if (!tunnelOK || r() < 0.55) {
        const k = 3 + ((r() * 3) | 0);
        let side = yEst > H / 2 ? 0 : 1;
        const lo = 1.6 + delta / 2, hi = H - 1.6 - delta / 2;
        let m = clamp(side === 0 ? yEst - delta / 2 - 0.5 : yEst + delta / 2 + 0.5, lo, hi);
        for (let i = 0; i < k && x < xb - 2; i++) {
          if (i > 0) m = clamp(m + (r() * 2 - 1) * 0.6, lo, hi);
          const saw = c.d >= 2 && r() < 0.25;
          if (side === 0) {
            const tip = m + delta / 2;
            if (saw) { B.block(x, 0, 1, tip - 1.2); B.saw(x + 0.5, tip - 1.2, 0.95); }
            else { B.block(x, 0, 1, tip - 1); B.spike(x, tip - 1, 'u'); }
            if (!coin && i >= 2) { B.coin(x + 0.5, Math.min(H - 0.75, tip + 1.6)); coin = true; }
            yEst = tip + 0.8;
          } else {
            const tip = m - delta / 2;
            if (saw) { B.saw(x + 0.5, tip + 1.2, 0.95); B.block(x, tip + 1.2, 1, H - tip - 1.2); }
            else { B.spike(x, tip, 'd'); B.block(x, tip + 1, 1, H - tip - 1); }
            if (!coin && i >= 2) { B.coin(x + 0.5, Math.max(0.75, tip - 1.6)); coin = true; }
            yEst = tip - 0.8;
          }
          side = 1 - side;
          x += sp;
        }
      } else {
        const len = Math.min(xb - x - 1, (3 + ((r() * 3) | 0)) * c.bl);
        const t = tunnelSmooth(B, x, x + len, c, gap + 0.5, H, yEst);
        if (!coin && t.mid) { B.coin(t.mid[0], t.mid[1] + t.gap / 2 - 0.7); coin = true; }
        yEst = t.yEnd;
        x += len + c.bl * 0.5;
      }
      feats++;
    }
    if (!coin) B.coin(xb - 1, yEst);
  }
  function tunnelSmooth(B, x0, x1, c, gap, H, yStart) {
    const r = c.r, step = c.bl / 2;
    const slope = lerpT([0.32, 0.4, 0.48, 0.56, 0.64, 0.72], c.d) * (10.4 / c.v);
    const lo = gap / 2 + 0.5, hi = H - gap / 2 - 0.5;
    let y = clamp(yStart == null ? H / 2 : yStart, lo, hi);
    const pts = [[x0, H / 2, H * 1.7], [x0 + 1.5 * c.bl, y, gap]];
    let x = x0 + 1.5 * c.bl;
    while (x + step < x1 - 1.5 * c.bl) {
      x += step;
      y = clamp(y + (r() * 2 - 1) * slope * step, lo, hi);
      pts.push([x, y, gap]);
    }
    pts.push([x1, y, H * 1.7]);
    B.tunnel(pts, 0, H);
    const inner = pts.slice(1, -1);
    return { yEnd: y, gap, mid: inner.length >= 3 ? inner[(inner.length / 2) | 0] : null };
  }
  function genWave(B, xa, xb, c, wantCoin) {
    const H = 10, r = c.r;
    const gap = lerpT([4.4, 4.0, 3.6, 3.3, 3.0, 2.75], c.d);
    const hbx = c.bl / 2;
    const lo = gap / 2, hi = H - gap / 2;
    let x = xa + 0.5, y = lo, dir = 1, segs = 0;
    const pts = [[x, lo, gap]];
    const peaks = [];
    x += c.bl;
    pts.push([x, lo, gap]);
    while (x < xb - c.bl * 1.5) {
      const q = c.d >= 5 && r() < 0.25;
      const len = q ? hbx / 2 : r() < 0.78 ? hbx : hbx * 2;
      const atEdge = y <= lo + 1e-6 || y >= hi - 1e-6;
      const prevDir = dir;
      if (y + 0.5 > hi) dir = -1;
      else if (y - 0.5 < lo) dir = 1;
      else if (r() < 0.72) dir = -dir;
      if (atEdge && r() < 0.18 && !q) { x += hbx; pts.push([x, y, gap]); continue; }
      if (prevDir === 1 && dir === -1 && segs > 3 && y < hi - 0.6 && y > lo + 0.6) peaks.push([x, y]);
      const ny = clamp(y + dir * len, lo, hi);
      const run = Math.abs(ny - y);
      if (run > 1e-6) pts.push([x + run, ny, gap]);
      x += len;
      if (run < len - 1e-6) pts.push([x, ny, gap]);
      y = ny; segs++;
    }
    pts.push([x + 0.6 * c.bl, y, H * 3]);
    B.tunnel(pts, 0, H);
    if (wantCoin) {
      const pk = peaks.length ? peaks[(peaks.length / 2) | 0] : pts[(pts.length / 2) | 0];
      B.coin(pk[0], pk[1] + gap / 2 - 0.6);
    }
  }
  function genBall(B, xa, xb, c, wantCoin) {
    const H = 7, r = c.r;
    const freeT = lerpT([0.6, 0.5, 0.42, 0.34, 0.28, 0.22], c.d);
    const half = c.bl / 2;
    let x = xa + c.bl * 0.5, side = 0, rows = 0;
    const gaps = [];
    while (true) {
      const len = 2 + ((r() * (c.d >= 3 ? 3 : 2)) | 0);
      if (x + len > xb - c.bl * 0.5) break;
      const raised = c.d >= 2 && r() < 0.3;
      if (side === 0) {
        if (raised) { B.block(x, 0, len, 1); B.spikes(x, len, 1, 'u'); } else B.spikes(x, len, 0, 'u');
      } else if (raised) { B.block(x, H - 1, len, 1); B.spikes(x, len, H - 2, 'd'); } else B.spikes(x, len, H - 1, 'd');
      const gap = Math.max(freeT * c.v + 4.4, 0.62 * c.v - len + 1);
      let nx = x + len + gap;
      nx = xa + Math.ceil((nx - xa) / half) * half;
      if (side === 1) gaps.push([x + len, nx]);
      x = nx; side ^= 1; rows++;
    }
    if (wantCoin && gaps.length) {
      const g = gaps[Math.min(gaps.length - 1, 1)];
      B.coin(g[0] + (g[1] - g[0]) * 0.5, H / 2);
    }
  }
  function genUfo(B, xa, xb, c, wantCoin) {
    const H = 10, r = c.r;
    const open = lerpT([3.9, 3.5, 3.1, 2.8, 2.55, 2.3], c.d);
    const sp = c.hb(lerpT([0.9, 0.8, 0.7, 0.62, 0.55, 0.5], c.d)) * c.bl;
    const T = (sp - 1.9) / c.v;
    const maxStep = Math.min(lerpT([1.6, 2.0, 2.4, 2.7, 3.0, 3.2], c.d), 4.5 * T);
    let x = xa + c.bl * 0.5, cy = 2.4, coin = !wantCoin, n = 0;
    const nGates = Math.floor((xb - 2 - x) / sp) + 1;
    const coinAt = Math.min(4, Math.max(1, nGates - 2));
    while (x < xb - 2) {
      if (n > 0) cy = clamp(cy + (r() * 2 - 1) * maxStep, open / 2 + 1.4, H - open / 2 - 1.4);
      else cy = Math.max(cy, open / 2 + 1.4);
      const a = cy - open / 2, b = cy + open / 2;
      if (a - 1 > 0.05) B.block(x, 0, 1, a - 1);
      B.spike(x, a - 1, 'u');
      B.spike(x, b, 'd');
      if (H - b - 1 > 0.05) B.block(x, b + 1, 1, H - b - 1);
      if (!coin && n >= coinAt) { B.coin(x + 0.5, b - 0.15); coin = true; }
      x += sp; n++;
    }
  }
  const GEN = { ship: genShip, wave: genWave, ball: genBall, ufo: genUfo };

  // ======================= compositor por secciones =======================
  class Composer {
    constructor(spec) {
      this.spec = spec; this.B = new LB(); this.bs = 60 / spec.bpm; this.r = mulberry32(spec.seed || 1);
      this.spd = spec.spd; this.mode = 'cube'; this.x = 0; this.beat = 0; this.ready = spec.lead == null ? 3 : spec.lead;
      this.secs = []; this.corr = [];
    }
    add(sec) {
      const B = this.B, bs = this.bs;
      const sb = this.beat, xs = this.x, nb = sec.bars * 4;
      if (sec.spd != null && sec.spd !== this.spd) {
        B.portal(xs - 0.5, 'sp' + sec.spd, { y: this.mode === 'cube' ? 1.5 : 5 });
        this.spd = sec.spd;
      }
      const v = SPEEDS[this.spd], bl = v * bs;
      const X = (b) => xs + (b - sb) * bl;
      const xe = X(sb + nb);
      const c = ctx(v, bs, Math.max(1, sec.d), this.r);
      c.d = Math.max(sec.d, 0.01);
      const prev = this.mode;
      const H = sec.mode === 'ball' ? 7 : 10;
      if (sec.mode !== prev) {
        B.portal(xs + 0.5, sec.mode, sec.mode === 'cube' ? { y: prev === 'ball' ? 3.5 : 5 } : { y: 1.5, floor: 0, ceil: H });
        this.mode = sec.mode;
      }
      if (sec.mode === 'cube') {
        const start = Math.max(this.ready, sb + (prev !== 'cube' ? 2 : 0));
        this.ready = sec.d > 0 ? genCube(B, X, start, sb + nb, c, sec) : start;
      } else {
        const last = this.corr[this.corr.length - 1];
        if (prev === sec.mode && last) last.x1 = xe + 1;
        else this.corr.push({ x0: xs + 1, x1: xe + 1, floor: 0, ceil: H });
        GEN[sec.mode](B, X(sb + 1), X(sb + nb - 1), c, !!sec.coin);
        this.ready = sb + nb;
      }
      this.secs.push({ type: sec.type, bars: sec.bars, mode: sec.mode, d: sec.d, pal: sec.pal | 0, sb, xs, xe, v, spd: this.spd });
      this.beat = sb + nb; this.x = xe;
    }
    finish(endBeats) {
      const last = this.secs[this.secs.length - 1];
      const endX = endBeats != null ? last.xs + endBeats * this.bs * last.v : this.x;
      return E.buildIndex({
        objs: this.B.objs, endX, startSpd: this.spec.spd, bpm: this.spec.bpm, secs: this.secs, corr: this.corr,
        coinCount: this.B.coinN, totalBeats: this.beat,
      });
    }
  }

  // ======================= los seis niveles =======================
  const S = (type, bars, mode, d, extra) => Object.assign({ type, bars, mode, d }, extra || {});
  const LEVELS = [
    {
      id: 'primer-pulso', name: 'Primer Pulso', diff: 'Fácil', tier: 1, bpm: 120, spd: 1, seed: 1101,
      music: { root: 57, prog: [0, 5, 2, 6], lead: 'square', seed: 11 },
      obj: '#8ff6ff', fill: '#06102c',
      pals: [
        { top: '#070b2a', bot: '#15348a', ground: '#0d1b57', line: '#66e8ff' },
        { top: '#0d0629', bot: '#33188a', ground: '#1b0f52', line: '#a58bff' },
      ],
      sections: [
        S('intro', 2, 'cube', 0.6), S('groove', 8, 'cube', 1), S('build', 4, 'cube', 1.15, { coin: 1 }),
        S('drop', 8, 'ship', 1, { coin: 1, pal: 1 }), S('break', 4, 'cube', 1), S('drop', 8, 'cube', 1.4, { coin: 1, pal: 1 }),
        S('outro', 2, 'cube', 0),
      ],
    },
    {
      id: 'neon-nocturno', name: 'Neón Nocturno', diff: 'Normal', tier: 2, bpm: 126, spd: 1, seed: 2207,
      music: { root: 50, prog: [0, 6, 5, 6], lead: 'saw', seed: 23 },
      obj: '#ff9cf0', fill: '#1a0622',
      pals: [
        { top: '#12051f', bot: '#52106a', ground: '#2d0b3d', line: '#ff6be6' },
        { top: '#050a24', bot: '#1d2e72', ground: '#101a4a', line: '#6bc7ff' },
      ],
      sections: [
        S('intro', 2, 'cube', 0.8), S('groove', 8, 'cube', 1.8, { coin: 1 }), S('build', 4, 'cube', 2),
        S('drop', 8, 'ship', 1.8, { coin: 1, pal: 1 }), S('break', 4, 'cube', 1.8), S('drop', 8, 'cube', 2.3, { pal: 1 }),
        S('build', 4, 'ship', 2, { coin: 1 }), S('outro', 2, 'cube', 0),
      ],
    },
    {
      id: 'gravedad-cero', name: 'Gravedad Cero', diff: 'Difícil', tier: 3, bpm: 132, spd: 1, seed: 3313,
      music: { root: 52, prog: [0, 5, 3, 4], lead: 'pluck', seed: 37 },
      obj: '#ffc08a', fill: '#200a05',
      pals: [
        { top: '#1f0705', bot: '#74220d', ground: '#3d1007', line: '#ffa14d' },
        { top: '#05161c', bot: '#0e5560', ground: '#082e35', line: '#4dfff0' },
      ],
      sections: [
        S('intro', 2, 'cube', 1), S('groove', 8, 'cube', 2.6), S('drop', 8, 'ball', 2.4, { coin: 1, pal: 1 }),
        S('build', 4, 'cube', 2.8), S('drop', 8, 'ufo', 2.6, { coin: 1, pal: 1 }), S('break', 4, 'cube', 2.6),
        S('drop', 8, 'cube', 3, { coin: 1, pal: 1 }), S('outro', 2, 'cube', 0),
      ],
    },
    {
      id: 'onda-expansiva', name: 'Onda Expansiva', diff: 'Muy difícil', tier: 4, bpm: 140, spd: 2, seed: 4421,
      music: { root: 55, prog: [0, 2, 6, 5], lead: 'saw', seed: 41 },
      obj: '#9effcf', fill: '#04150e',
      pals: [
        { top: '#031a12', bot: '#0c6446', ground: '#063a28', line: '#4dffa6' },
        { top: '#071226', bot: '#14437c', ground: '#0a2447', line: '#4dc3ff' },
      ],
      sections: [
        S('intro', 2, 'cube', 1.2), S('groove', 8, 'cube', 3.2), S('drop', 8, 'wave', 3, { coin: 1, pal: 1 }),
        S('build', 4, 'cube', 3.4), S('drop', 8, 'ship', 3.4, { coin: 1, pal: 1 }), S('break', 4, 'ball', 3),
        S('drop', 8, 'wave', 3.6, { coin: 1, pal: 1 }), S('outro', 2, 'cube', 0),
      ],
    },
    {
      id: 'tormenta-cuantica', name: 'Tormenta Cuántica', diff: 'Extremo', tier: 5, bpm: 150, spd: 2, seed: 5531,
      music: { root: 53, prog: [0, 3, 5, 4], lead: 'square', seed: 53 },
      obj: '#e0b3ff', fill: '#12051f',
      pals: [
        { top: '#0e0420', bot: '#401072', ground: '#230845', line: '#c77dff' },
        { top: '#1f0414', bot: '#741042', ground: '#400826', line: '#ff5c9a' },
        { top: '#1a1404', bot: '#65510c', ground: '#3a2e06', line: '#ffd84d' },
      ],
      sections: [
        S('intro', 2, 'cube', 1.5), S('groove', 8, 'cube', 4), S('drop', 8, 'ufo', 4, { coin: 1, pal: 1 }),
        S('build', 4, 'cube', 4.2, { spd: 3 }), S('drop', 8, 'wave', 4.2, { pal: 2 }), S('break', 4, 'ball', 4, { coin: 1 }),
        S('drop', 8, 'ship', 4.5, { pal: 1 }), S('build', 4, 'cube', 4.5), S('drop', 8, 'wave', 4.6, { coin: 1, pal: 2 }),
        S('outro', 2, 'cube', 0),
      ],
    },
    {
      id: 'nucleo-final', name: 'Núcleo Final', diff: 'Infernal', tier: 6, bpm: 160, spd: 3, seed: 6661,
      music: { root: 48, prog: [0, 5, 3, 4], lead: 'saw', seed: 67, harmonic: true },
      obj: '#ff8c99', fill: '#0d0205',
      pals: [
        { top: '#0a0204', bot: '#430712', ground: '#220309', line: '#ff3b4f' },
        { top: '#020306', bot: '#121b30', ground: '#070b16', line: '#e8eeff' },
      ],
      sections: [
        S('intro', 2, 'cube', 2), S('groove', 8, 'cube', 5), S('drop', 8, 'wave', 5, { coin: 1, pal: 1 }),
        S('build', 4, 'ball', 5), S('drop', 8, 'ship', 5.2, { spd: 4, pal: 1 }), S('break', 4, 'ufo', 5, { coin: 1 }),
        S('drop', 8, 'cube', 5.5, { spd: 3, pal: 1 }), S('build', 4, 'wave', 5.5), S('drop', 8, 'ship', 5.6, { coin: 1, pal: 1 }),
        S('outro', 2, 'cube', 0),
      ],
    },
  ];

  function buildLevel(i) {
    const spec = LEVELS[i];
    const C = new Composer(spec);
    for (const s of spec.sections) C.add(s);
    const L = C.finish(4);
    L.spec = spec;
    L.duration = (L.totalBeats * 60) / spec.bpm;
    return L;
  }

  // ======================= modo infinito =======================
  const ENDLESS_SPEC = {
    id: 'infinito', name: 'Infinito', diff: 'Sin final', tier: 0, bpm: 128, spd: 1, seed: 9001,
    music: { root: 54, prog: [0, 5, 2, 6], lead: 'saw', seed: 97 },
    obj: '#ffffff', fill: '#0b0820',
    pals: [
      { top: '#0b0820', bot: '#2a1a6e', ground: '#160f40', line: '#9f8bff' },
      { top: '#04141c', bot: '#0d4a5e', ground: '#08303d', line: '#4de2ff' },
      { top: '#1c0618', bot: '#62124f', ground: '#3a0a2f', line: '#ff6bd1' },
      { top: '#1a0d03', bot: '#6b3a0b', ground: '#3d2006', line: '#ffb44d' },
    ],
  };
  class Endless {
    constructor(seed) {
      const spec = Object.assign({}, ENDLESS_SPEC, { seed: seed >>> 0 });
      this.spec = spec;
      this.C = new Composer(spec);
      this.r = mulberry32((seed ^ 0x9e3779b9) >>> 0);
      this.n = 0; this.sent = 0; this.lastMode = 'cube';
      this.L = { objs: [], cols: [], endX: Infinity, startSpd: 1, bpm: spec.bpm, secs: this.C.secs, corr: this.C.corr, coinCount: 0, endless: true, spec };
      this.C.add(S('intro', 2, 'cube', 0.8));
      this.flush();
    }
    next() {
      const n = ++this.n;
      const d = Math.min(6, 1 + n * 0.3);
      let mode = 'cube';
      if (n >= 2 && this.lastMode === 'cube') {
        const opts = ['ship', 'wave', 'ball', 'ufo'];
        mode = this.r() < 0.35 ? 'cube' : opts[(this.r() * opts.length) | 0];
      }
      const spd = d < 2.4 ? 1 : d < 4.2 ? 2 : 3;
      const type = mode === 'cube' ? (n % 2 ? 'groove' : 'build') : 'drop';
      this.C.add(S(type, 4, mode, d, { spd, pal: n % 4 }));
      this.lastMode = mode;
    }
    ensure(x) { while (this.C.x < x + 160) this.next(); this.flush(); }
    flush() { const o = this.C.B.objs; while (this.sent < o.length) E.addObj(this.L, o[this.sent++]); }
  }

  const Levels = { LEVELS, ENDLESS_SPEC, buildLevel, Endless, Composer, LB, spikeLead, platLead, tUp, tDn, mulberry32 };
  PN.Levels = Levels;
  if (typeof module !== 'undefined' && module.exports) module.exports = Levels;
})(typeof window !== 'undefined' ? window : globalThis);
