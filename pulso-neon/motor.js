/* Pulso Neón · motor de física determinista.
   Unidades: 1 = un bloque, segundos. El eje y apunta hacia arriba; el suelo está en y = 0.
   Lo comparten el juego (navegador) y el bot de verificación (Node). */
(function (G) {
  'use strict';
  const PN = G.PN || (G.PN = {});

  const DT = 1 / 240;
  const SPEEDS = [8.4, 10.4, 13.0, 15.6, 19.2];
  const SNAP = 0.2;      // tolerancia para "subirse" a un bloque
  const BUF = 0.1;       // segundos que un toque queda en memoria
  const COYOTE = 0.045;  // margen para saltar tras salir de un borde

  const PH = {
    cube: { g: 78.125, jump: 18.75, maxFall: 26 },
    ship: { up: 46, down: 40, maxUp: 10.5, maxDown: 11.5 },
    ufo: { g: 46, jump: 11.5, maxFall: 13 },
    ball: { g: 58, push: 3, maxFall: 20 },
  };
  // hw/hh: caja exterior · iw/ih: caja interior (choque mortal con bloques) · zw/zh: caja de peligros
  const BOX = {
    cube: { hw: 0.5, hh: 0.5, iw: 0.18, ih: 0.18, zw: 0.44, zh: 0.44 },
    ship: { hw: 0.5, hh: 0.32, iw: 0.2, ih: 0.14, zw: 0.44, zh: 0.27 },
    ball: { hw: 0.45, hh: 0.45, iw: 0.18, ih: 0.18, zw: 0.4, zh: 0.4 },
    ufo: { hw: 0.5, hh: 0.38, iw: 0.2, ih: 0.16, zw: 0.44, zh: 0.33 },
    wave: { hw: 0.22, hh: 0.22, iw: 0.16, ih: 0.16, zw: 0.16, zh: 0.16 },
  };
  const CEIL_OK = { cube: false, ship: true, ball: true, ufo: true, wave: true };
  // impulsos [amarillo, rosa, azul(hacia el nuevo suelo)]
  const PAD = { cube: [26.25, 14.1, 14], ship: [9, 6, 5], ufo: [14, 9, 5], ball: [13, 9, 5], wave: [0, 0, 5] };
  const ORB = { cube: [18.75, 13.1, 8.4], ship: [8, 5.5, 5], ufo: [12.5, 8.5, 5], ball: [12, 8, 5], wave: [0, 0, 5] };

  let STAMP = 0;
  const CAND = [];

  function extent(o) {
    switch (o.t) {
      case 'block': return [o.x, o.x + o.w];
      case 'saw': return [o.x - o.r, o.x + o.r];
      case 'orb': case 'coin': return [o.x - 0.7, o.x + 0.7];
      case 'tunnel': return [o.x0, o.x1];
      default: return [o.x, o.x + (o.w || 1)];
    }
  }
  function addObj(L, o) {
    o.id = L.objs.length;
    L.objs.push(o);
    const e = extent(o);
    for (let c = Math.floor(e[0]); c <= Math.floor(e[1]); c++) (L.cols[c] || (L.cols[c] = [])).push(o);
  }
  function buildIndex(L) {
    const objs = L.objs;
    L.objs = []; L.cols = [];
    for (const o of objs) addObj(L, o);
    return L;
  }

  function newPlayer(L) {
    return {
      x: 0, y: 0.5, vy: 0, mode: 'cube', grav: 1, spd: L.startSpd == null ? 1 : L.startSpd,
      floor: 0, ceil: Infinity, onGround: true, onCeil: false, air: 0,
      buf: 0, held: false, dead: false, won: false, rot: 0, t: 0,
      used: [], coins: 0, jumps: 0, ev: null,
    };
  }
  function clone(p) {
    const q = Object.assign({}, p);
    q.used = p.used.slice();
    q.ev = null;
    return q;
  }
  function emit(p, type, o) { if (p.ev) p.ev.push({ type, x: p.x, y: p.y, o }); }
  function usedHas(p, id) { const u = p.used; for (let i = 0; i < u.length; i++) if (u[i] === id) return true; return false; }
  function use(p, o) { p.used.push(o.id); if (p.used.length > 12) p.used.shift(); }
  function die(p) { p.dead = true; emit(p, 'die'); }

  function launch(p, c, tbl) {
    if (c === 'b') { p.grav = -p.grav; p.vy = -tbl[2] * p.grav; }
    else {
      const v = tbl[c === 'y' ? 0 : 1];
      if (!v) return false;
      p.vy = v * p.grav;
    }
    p.onGround = false; p.air = 1;
    return true;
  }

  function setMode(p, k, o) {
    const prev = p.mode;
    p.mode = k;
    p.grav = 1;
    if (k === 'cube') { p.floor = 0; p.ceil = Infinity; }
    else { p.floor = o.floor; p.ceil = o.ceil; }
    if (prev !== k) { p.vy *= 0.5; p.rot = 0; }
    const B = BOX[k];
    if (p.y - B.hh < p.floor) p.y = p.floor + B.hh;
    if (p.y + B.hh > p.ceil) p.y = p.ceil - B.hh;
  }
  function applyPortal(p, o) {
    const k = o.k;
    if (k === 'gn' || k === 'gf') {
      const g = k === 'gn' ? 1 : -1;
      if (p.grav !== g) { p.grav = g; p.vy *= 0.5; p.air = 1; }
    } else if (k.slice(0, 2) === 'sp') p.spd = +k[2];
    else setMode(p, k, o);
  }

  function tunnelAt(o, x) {
    const P = o.pts;
    let i = o._i | 0;
    if (i > P.length - 2) i = P.length - 2;
    while (i > 0 && P[i][0] > x) i--;
    while (i < P.length - 2 && P[i + 1][0] <= x) i++;
    o._i = i;
    const a = P[i], b = P[i + 1];
    let t = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0]);
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const c = a[1] + (b[1] - a[1]) * t, g = a[2] + (b[2] - a[2]) * t;
    return [c - g / 2, c + g / 2];
  }
  function tunnelHit(o, l, r, b, t) {
    const a = l > o.x0 ? l : o.x0, z = r < o.x1 ? r : o.x1;
    if (a > z) return false;
    let w = tunnelAt(o, a);
    let lo = w[0], hi = w[1];
    const i0 = o._i, P = o.pts;
    for (let j = i0 + 1; j < P.length && P[j][0] < z; j++) {
      const q = P[j];
      const ql = q[1] - q[2] / 2, qh = q[1] + q[2] / 2;
      if (ql > lo) lo = ql;
      if (qh < hi) hi = qh;
    }
    w = tunnelAt(o, z);
    if (w[0] > lo) lo = w[0];
    if (w[1] < hi) hi = w[1];
    return b < lo || t > hi;
  }

  function orbCheck(p, L) {
    const B = BOX[p.mode];
    const c0 = Math.floor(p.x - 1.3), c1 = Math.floor(p.x + 1.3);
    for (let c = c0; c <= c1; c++) {
      const col = L.cols[c];
      if (!col) continue;
      for (let i = 0; i < col.length; i++) {
        const o = col[i];
        if (o.t !== 'orb' || usedHas(p, o.id)) continue;
        if (Math.abs(p.x - o.x) < B.hw + 0.6 && Math.abs(p.y - o.y) < B.hh + 0.6) {
          if (!launch(p, o.c, ORB[p.mode])) continue;
          use(p, o); p.buf = 0;
          emit(p, 'orb', o);
          return true;
        }
      }
    }
    return false;
  }

  function collide(p, L, y0) {
    const B = BOX[p.mode];
    const hw = B.hw, hh = B.hh;
    const up = p.grav;
    p.onGround = false; p.onCeil = false;
    if (p.y - hh < p.floor) { p.y = p.floor + hh; if (p.vy < 0) p.vy = 0; if (up > 0) p.onGround = true; else p.onCeil = true; }
    if (p.y + hh > p.ceil) { p.y = p.ceil - hh; if (p.vy > 0) p.vy = 0; if (up < 0) p.onGround = true; else p.onCeil = true; }

    const st = ++STAMP, cand = CAND;
    cand.length = 0;
    const c0 = Math.floor(p.x - 1.6), c1 = Math.floor(p.x + 1.6);
    for (let c = c0; c <= c1; c++) {
      const col = L.cols[c];
      if (!col) continue;
      for (let i = 0; i < col.length; i++) { const o = col[i]; if (o._s !== st) { o._s = st; cand.push(o); } }
    }
    const ceilOK = CEIL_OK[p.mode];
    for (let i = 0; i < cand.length; i++) {
      const o = cand[i];
      if (o.t !== 'block') continue;
      if (p.x + hw <= o.x || p.x - hw >= o.x + o.w || p.y + hh <= o.y || p.y - hh >= o.y + o.h) continue;
      const top = o.y + o.h, bot = o.y;
      if (up > 0) {
        if (p.vy <= 0 && y0 - hh >= top - SNAP) { p.y = top + hh; p.vy = 0; p.onGround = true; continue; }
        if (ceilOK && p.vy >= 0 && y0 + hh <= bot + SNAP) { p.y = bot - hh; p.vy = 0; p.onCeil = true; continue; }
      } else {
        if (p.vy >= 0 && y0 + hh <= bot + SNAP) { p.y = bot - hh; p.vy = 0; p.onGround = true; continue; }
        if (ceilOK && p.vy <= 0 && y0 - hh >= top - SNAP) { p.y = top + hh; p.vy = 0; p.onCeil = true; continue; }
      }
    }
    const iw = B.iw, ih = B.ih;
    for (let i = 0; i < cand.length; i++) {
      const o = cand[i];
      if (o.t !== 'block') continue;
      if (p.x + iw > o.x && p.x - iw < o.x + o.w && p.y + ih > o.y && p.y - ih < o.y + o.h) { die(p); return; }
    }
    const zw = B.zw, zh = B.zh;
    const zl = p.x - zw, zr = p.x + zw, zb = p.y - zh, zt = p.y + zh;
    for (let i = 0; i < cand.length; i++) {
      const o = cand[i];
      switch (o.t) {
        case 'spike':
          if (zr > o.hx0 && zl < o.hx1 && zt > o.hy0 && zb < o.hy1) { die(p); return; }
          break;
        case 'saw': {
          const cx = o.x < zl ? zl : o.x > zr ? zr : o.x;
          const cy = o.y < zb ? zb : o.y > zt ? zt : o.y;
          const dx = o.x - cx, dy = o.y - cy;
          if (dx * dx + dy * dy < o.hr * o.hr) { die(p); return; }
          break;
        }
        case 'tunnel':
          if (zr > o.x0 && zl < o.x1 && tunnelHit(o, zl, zr, zb, zt)) { die(p); return; }
          break;
        case 'pad':
          if (!usedHas(p, o.id) && p.x + hw > o.x + 0.1 && p.x - hw < o.x + 0.9) {
            const ty = o.dir === 'd' ? o.y - 0.5 : o.y;
            if (p.y + hh > ty && p.y - hh < ty + 0.5 && launch(p, o.c, PAD[p.mode])) { use(p, o); emit(p, 'pad', o); }
          }
          break;
        case 'portal':
          if (p.x >= o.x + 0.5 && !usedHas(p, o.id)) { use(p, o); applyPortal(p, o); emit(p, 'portal', o); }
          break;
        case 'coin':
          if (!(p.coins & (1 << o.cid))) {
            const dx = Math.max(Math.abs(p.x - o.x) - hw, 0), dy = Math.max(Math.abs(p.y - o.y) - hh, 0);
            if (dx * dx + dy * dy < 0.36) { p.coins |= 1 << o.cid; emit(p, 'coin', o); }
          }
          break;
      }
    }
    if (p.y > 45 || p.y < -10) die(p);
  }

  function rotate(p, speed) {
    const up = p.grav;
    switch (p.mode) {
      case 'cube':
        if (p.onGround) { const q = Math.PI / 2; const tg = Math.round(p.rot / q) * q; p.rot += (tg - p.rot) * 0.35; }
        else p.rot += 6.5 * up * DT;
        break;
      case 'ship': { const a = -Math.atan2(p.vy, speed * 1.15); p.rot += (a - p.rot) * 0.12; break; }
      case 'ball': p.rot += (speed / 0.45) * DT * up; break;
      case 'ufo': { const a = -p.vy * 0.025; p.rot += (a - p.rot) * 0.08; break; }
      case 'wave': p.rot = -Math.atan2(p.vy, speed); break;
    }
  }

  function step(p, L, held, pressed) {
    if (p.dead || p.won) return;
    p.t += DT;
    if (pressed) p.buf = BUF;
    p.held = held;
    const speed = SPEEDS[p.spd];
    if (p.buf > 0) orbCheck(p, L);
    let up = p.grav;
    switch (p.mode) {
      case 'cube': {
        const c = PH.cube;
        if ((p.onGround || (p.air < COYOTE && p.vy * up <= 0)) && (held || p.buf > 0)) {
          p.vy = c.jump * up; p.onGround = false; p.air = 1; p.buf = 0; p.jumps++; emit(p, 'jump');
        }
        p.vy -= c.g * up * DT;
        if (p.vy * up < -c.maxFall) p.vy = -c.maxFall * up;
        break;
      }
      case 'ship': {
        const c = PH.ship;
        p.vy += (held ? c.up : -c.down) * up * DT;
        const vu = p.vy * up;
        if (vu > c.maxUp) p.vy = c.maxUp * up; else if (vu < -c.maxDown) p.vy = -c.maxDown * up;
        break;
      }
      case 'ufo': {
        const c = PH.ufo;
        if (p.buf > 0) { p.vy = c.jump * up; p.buf = 0; p.onGround = false; p.air = 1; p.jumps++; emit(p, 'jump'); }
        p.vy -= c.g * up * DT;
        if (p.vy * up < -c.maxFall) p.vy = -c.maxFall * up;
        break;
      }
      case 'ball': {
        const c = PH.ball;
        if (p.buf > 0 && (p.onGround || (p.air < COYOTE && p.vy * up <= 0))) {
          p.grav = -p.grav; up = p.grav; p.vy = -c.push * up; p.buf = 0; p.onGround = false; p.air = 1; p.jumps++;
          emit(p, 'flip');
        }
        p.vy -= c.g * up * DT;
        if (p.vy * up < -c.maxFall) p.vy = -c.maxFall * up;
        break;
      }
      case 'wave':
        p.vy = (held ? 1 : -1) * up * speed;
        break;
    }
    const y0 = p.y;
    p.x += speed * DT;
    p.y += p.vy * DT;
    collide(p, L, y0);
    if (p.dead) return;
    if (p.onGround) p.air = 0; else p.air += DT;
    if (p.buf > 0) { p.buf -= DT; if (p.buf < 0) p.buf = 0; }
    if (p.x >= L.endX) { p.won = true; emit(p, 'win'); }
    rotate(p, speed);
  }

  const Engine = { DT, SPEEDS, SNAP, BUF, PH, BOX, PAD, ORB, extent, addObj, buildIndex, newPlayer, clone, step, tunnelAt };
  PN.Engine = Engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
