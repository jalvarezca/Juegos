/* Pulso Neón · dibujo en canvas. Todo es vectorial; los brillos caros se pre-renderizan en sprites. */
(function (G) {
  'use strict';
  const PN = G.PN || (G.PN = {});
  const E = PN.Engine;

  const hexc = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  const PORTAL = {
    cube: '#7dff6b', ship: '#ff5fd2', ball: '#ff9440', ufo: '#b98bff', wave: '#3fd9ff',
    gn: '#4d9bff', gf: '#ffd84d', sp0: '#ffb347', sp1: '#4dc3ff', sp2: '#6bff8f', sp3: '#ff6be6', sp4: '#ff4d5e',
  };
  const PADC = { y: '#ffd23f', p: '#ff5ad1', b: '#38c8ff' };

  // ---------- iconos del jugador (diseños originales) ----------
  const DESIGNS = ['Núcleo', 'Mirada', 'Rayo', 'Diana', 'Equis', 'Rombo', 'Rejilla', 'Franjas', 'Corona', 'Marco', 'Píxel', 'Escudo'];
  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function poly(g, pts, s) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0] * s, p[1] * s) : g.moveTo(p[0] * s, p[1] * s))); g.closePath(); }
  function drawCube(g, s, design, c1, c2) {
    const h = s / 2;
    g.fillStyle = c1; rr(g, -h, -h, s, s, s * 0.09); g.fill();
    g.save(); rr(g, -h, -h, s, s, s * 0.09); g.clip();
    g.fillStyle = c2; g.strokeStyle = c2;
    switch (design) {
      case 0: g.fillRect(-0.28 * s, -0.28 * s, 0.56 * s, 0.56 * s); g.fillStyle = c1; g.fillRect(-0.12 * s, -0.12 * s, 0.24 * s, 0.24 * s); break;
      case 1: g.fillRect(-0.27 * s, -0.2 * s, 0.17 * s, 0.27 * s); g.fillRect(0.1 * s, -0.2 * s, 0.17 * s, 0.27 * s); g.fillRect(-0.24 * s, 0.17 * s, 0.48 * s, 0.09 * s); break;
      case 2: poly(g, [[0.1, -0.42], [-0.24, 0.05], [-0.02, 0.05], [-0.12, 0.42], [0.25, -0.08], [0.03, -0.08]], s); g.fill(); break;
      case 3: g.lineWidth = 0.09 * s; g.beginPath(); g.arc(0, 0, 0.3 * s, 0, 7); g.stroke(); g.beginPath(); g.arc(0, 0, 0.12 * s, 0, 7); g.fill(); break;
      case 4: g.lineWidth = 0.13 * s; g.lineCap = 'round'; g.beginPath(); g.moveTo(-0.26 * s, -0.26 * s); g.lineTo(0.26 * s, 0.26 * s); g.moveTo(0.26 * s, -0.26 * s); g.lineTo(-0.26 * s, 0.26 * s); g.stroke(); break;
      case 5: poly(g, [[0, -0.34], [0.34, 0], [0, 0.34], [-0.34, 0]], s); g.fill(); g.fillStyle = c1; poly(g, [[0, -0.13], [0.13, 0], [0, 0.13], [-0.13, 0]], s); g.fill(); break;
      case 6: for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { g.beginPath(); g.arc(i * 0.23 * s, j * 0.23 * s, 0.07 * s, 0, 7); g.fill(); } break;
      case 7: for (let k = -2; k <= 2; k++) { g.save(); g.translate(k * 0.36 * s, 0); g.rotate(Math.PI / 4); g.fillRect(-0.07 * s, -s, 0.14 * s, 2 * s); g.restore(); } break;
      case 8: poly(g, [[-0.32, 0.05], [-0.32, -0.28], [-0.16, -0.1], [0, -0.32], [0.16, -0.1], [0.32, -0.28], [0.32, 0.05]], s); g.fill(); g.fillRect(-0.32 * s, 0.13 * s, 0.64 * s, 0.13 * s); break;
      case 9: g.lineWidth = 0.08 * s; g.strokeRect(-0.25 * s, -0.25 * s, 0.5 * s, 0.5 * s); g.beginPath(); g.arc(0, 0, 0.08 * s, 0, 7); g.fill(); break;
      case 10: { const p = 0.09 * s; [[-2, -2], [2, -2], [-3, 1], [3, 1], [-2, 2], [-1, 2], [0, 2], [1, 2], [2, 2]].forEach(([i, j]) => g.fillRect(i * p - p / 2, j * p - p / 2, p, p)); break; }
      case 11: poly(g, [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.02], [0, 0.34], [-0.3, 0.02]], s); g.fill(); g.fillStyle = c1; poly(g, [[-0.14, -0.16], [0.14, -0.16], [0.14, 0], [0, 0.15], [-0.14, 0]], s); g.fill(); break;
    }
    g.restore();
    g.lineWidth = s * 0.075; g.strokeStyle = 'rgba(0,0,0,0.78)'; rr(g, -h, -h, s, s, s * 0.09); g.stroke();
    g.lineWidth = s * 0.03; g.strokeStyle = 'rgba(255,255,255,0.45)'; rr(g, -h + s * 0.07, -h + s * 0.07, s - s * 0.14, s - s * 0.14, s * 0.05); g.stroke();
  }
  function drawShip(g, s, design, c1, c2) {
    g.save(); g.translate(-0.06 * s, -0.3 * s); g.rotate(0); drawCube(g, s * 0.5, design, c1, c2); g.restore();
    g.fillStyle = c1; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = s * 0.06;
    poly(g, [[-0.66, -0.02], [-0.74, -0.24], [-0.5, -0.1], [0.14, -0.1], [0.66, 0.12], [0.52, 0.27], [-0.58, 0.27]], s); g.fill(); g.stroke();
    g.fillStyle = c2; poly(g, [[-0.46, 0.05], [0.36, 0.05], [0.46, 0.15], [-0.5, 0.15]], s); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.4)'; poly(g, [[-0.4, -0.06], [0.12, -0.06], [0.3, 0.0], [-0.42, 0.0]], s); g.fill();
  }
  function drawBall(g, s, design, c1, c2) {
    const r = s * 0.46;
    g.fillStyle = c1; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
    g.fillStyle = c2;
    for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r * 0.78, (k * 2 * Math.PI) / 3, (k * 2 * Math.PI) / 3 + 0.9); g.closePath(); g.fill(); }
    g.fillStyle = c1; g.beginPath(); g.arc(0, 0, r * 0.26, 0, 7); g.fill();
    g.lineWidth = s * 0.07; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke();
    g.lineWidth = s * 0.03; g.strokeStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.arc(0, 0, r * 0.82, 3.6, 5.2); g.stroke();
  }
  function drawUfo(g, s, design, c1, c2) {
    g.save(); g.translate(0, -0.16 * s); drawCube(g, s * 0.4, design, c1, c2); g.restore();
    g.fillStyle = css(hexc(c2), 0.28); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = s * 0.03;
    g.beginPath(); g.arc(0, -0.04 * s, 0.33 * s, Math.PI, 0); g.fill(); g.stroke();
    g.fillStyle = c1; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = s * 0.06;
    g.beginPath(); g.ellipse(0, 0.08 * s, 0.56 * s, 0.17 * s, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = c2; for (let k = -1; k <= 1; k++) { g.beginPath(); g.arc(k * 0.3 * s, 0.1 * s, 0.05 * s, 0, 7); g.fill(); }
  }
  function drawWave(g, s, design, c1, c2) {
    g.fillStyle = c1; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = s * 0.06;
    poly(g, [[0.44, 0], [-0.34, -0.3], [-0.18, 0], [-0.34, 0.3]], s); g.fill(); g.stroke();
    g.fillStyle = c2; poly(g, [[0.2, 0], [-0.16, -0.12], [-0.08, 0], [-0.16, 0.12]], s); g.fill();
  }
  const DRAW = { cube: drawCube, ship: drawShip, ball: drawBall, ufo: drawUfo, wave: drawWave };

  class Renderer {
    constructor(cv) {
      this.cv = cv;
      this.g = cv.getContext('2d', { alpha: false });
      this.parts = []; this.trail = []; this.wtrail = [];
      this.shake = 0; this.flash = 0; this.flashCol = [255, 255, 255];
      this.hq = true; this.reduced = false;
      this.cam = { x: -6, y: -2.6, ty: -2.6, lock: null };
      this.camFrac = 0.3;
      this.stamp = 0; this.sprites = {};
      this.icon = { design: 0, c1: '#5ef0ff', c2: '#ff4fd8', trail: true };
      this.dust = [];
      for (let i = 0; i < 46; i++) this.dust.push([hash(i * 3.1) * 80, hash(i * 7.7 + 2) * 14 - 2, 0.4 + hash(i * 1.9) * 0.8, hash(i * 5.3) * 6.28]);
    }
    resize(w, h, dpr) {
      this.W = w; this.H = h; this.dpr = dpr;
      this.cv.width = Math.max(1, Math.round(w * dpr)); this.cv.height = Math.max(1, Math.round(h * dpr));
      this.bs = Math.min(h / 12, w / 21);
      this.VW = w / this.bs; this.VH = h / this.bs;
      this.sprites = {};
    }
    setLevel(L) {
      this.L = L;
      const sp = L.spec;
      this.objC = hexc(sp.obj); this.fillC = hexc(sp.fill);
      this.col = this.palOf(sp.pals[0]);
      this.sprites = {};
      this.reset();
    }
    palOf(p) { return { top: hexc(p.top), bot: hexc(p.bot), ground: hexc(p.ground), line: hexc(p.line) }; }
    reset() { this.parts.length = 0; this.trail.length = 0; this.wtrail.length = 0; this.shake = 0; this.flash = 0; this.cam.lock = null; }
    wx(x) { return (x - this.cam.x) * this.bs; }
    wy(y) { return this.H - (y - this.cam.y) * this.bs; }
    sprite(key, w, h, fn) {
      let s = this.sprites[key];
      if (!s) {
        const c = document.createElement('canvas'), d = this.dpr;
        c.width = Math.max(1, Math.ceil(w * d)); c.height = Math.max(1, Math.ceil(h * d));
        const g = c.getContext('2d'); g.scale(d, d);
        fn(g, w, h);
        s = this.sprites[key] = { c, w, h };
      }
      return s;
    }
    // ---------- cámara ----------
    camera(px, py, p, dt, snap) {
      const VW = this.VW, VH = this.VH;
      if (this.cam.lock == null) this.cam.x = px - VW * this.camFrac;
      else this.cam.x = this.cam.lock;
      let ty = this.cam.ty;
      const lowest = -Math.min(2.6, VH * 0.22);
      if (p.mode !== 'cube' && isFinite(p.ceil)) ty = (p.floor + p.ceil) / 2 - VH / 2;
      else {
        if (ty > lowest + 0.01 && py < this.cam.y + VH * 0.35) ty = Math.max(lowest, py - VH * 0.35);
        if (py > this.cam.y + VH * 0.64) ty = py - VH * 0.64;
        if (ty < lowest) ty = lowest;
        if (p.grav < 0 && py > this.cam.y + VH * 0.5) ty = Math.max(ty, py - VH * 0.5);
      }
      this.cam.ty = ty;
      if (snap) this.cam.y = ty;
      else this.cam.y += (ty - this.cam.y) * (1 - Math.exp(-dt * 4.5));
    }
    // ---------- partículas ----------
    burst(x, y, n, col, o = {}) {
      if (!this.hq) n = Math.ceil(n / 2);
      for (let i = 0; i < n; i++) {
        const a = o.ang != null ? o.ang + (Math.random() - 0.5) * (o.spread || 1) : Math.random() * 6.283;
        const sp = (o.speed || 6) * (0.3 + Math.random() * 0.9);
        const life = (o.life || 0.6) * (0.5 + Math.random() * 0.7);
        this.parts.push({ x, y, vx: Math.cos(a) * sp + (o.vx || 0), vy: Math.sin(a) * sp + (o.vy || 0), life, max: life, sz: (o.size || 0.14) * (0.5 + Math.random()), col, g: o.g == null ? 14 : o.g, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, k: o.k || 'sq' });
      }
    }
    ring(x, y, col, r0, r1, life, w) { this.parts.push({ x, y, vx: 0, vy: 0, life, max: life, sz: r0, r1, col, g: 0, k: 'ring', w: w || 0.12 }); }
    onEvent(ev, p) {
      const c1 = hexc(this.icon.c1);
      switch (ev.type) {
        case 'die':
          this.burst(ev.x, ev.y, 34, c1, { speed: 13, life: 0.9, size: 0.22, g: 10 });
          this.burst(ev.x, ev.y, 18, [255, 255, 255], { speed: 18, life: 0.5, size: 0.08, g: 0, k: 'spark' });
          this.ring(ev.x, ev.y, c1, 0.3, 3.4, 0.45, 0.2);
          this.ring(ev.x, ev.y, [255, 255, 255], 0.2, 2.2, 0.3, 0.1);
          this.shake = this.reduced ? 0 : 0.45; this.flash = this.reduced ? 0.1 : 0.3; this.flashCol = [255, 255, 255];
          this.trail.length = 0; this.wtrail.length = 0;
          break;
        case 'orb': { const c = hexc(PADC[ev.o.c]); this.ring(ev.o.x, ev.o.y, c, 0.4, 1.9, 0.35, 0.14); this.burst(ev.o.x, ev.o.y, 10, c, { speed: 7, life: 0.4, g: 0, k: 'dot' }); break; }
        case 'pad': { const c = hexc(PADC[ev.o.c]); const up = ev.o.dir === 'd' ? -1 : 1; this.burst(ev.o.x + 0.5, ev.o.y, 14, c, { speed: 9, life: 0.5, ang: up > 0 ? -Math.PI / 2 : Math.PI / 2, spread: 0.9, g: 0, k: 'dot' }); break; }
        case 'portal': {
          const c = hexc(PORTAL[ev.o.k] || '#ffffff');
          this.ring(ev.x, ev.y, c, 0.5, 2.6, 0.4, 0.16);
          this.burst(ev.x, ev.y, 16, c, { speed: 8, life: 0.5, g: 0, k: 'dot' });
          if (!this.reduced) { this.flash = 0.18; this.flashCol = c; }
          this.trail.length = 0; this.wtrail.length = 0;
          break;
        }
        case 'coin': { const c = [255, 214, 92]; this.ring(ev.o.x, ev.o.y, c, 0.4, 2.2, 0.5, 0.16); this.burst(ev.o.x, ev.o.y, 22, c, { speed: 9, life: 0.7, g: 4, k: 'spark' }); break; }
        case 'land': this.burst(ev.x - 0.3, ev.y - 0.45 * p.grav, 5, this.col.line, { speed: 3, life: 0.35, ang: Math.PI + (p.grav > 0 ? 0.4 : -0.4), spread: 1, g: 6 * p.grav, size: 0.1 }); break;
        case 'win':
          for (let i = 0; i < 5; i++) {
            const c = [hexc('#ffd84d'), hexc(this.icon.c1), hexc(this.icon.c2), hexc('#7dff6b'), [255, 255, 255]][i];
            this.burst(ev.x + 2 + i * 1.5, ev.y + 1 + (i % 2) * 2, 22, c, { speed: 11, life: 1.2, g: 6, k: i % 2 ? 'spark' : 'sq' });
          }
          break;
      }
    }
    // ---------- dibujo principal ----------
    draw(S) {
      const g = this.g, W = this.W, H = this.H, bs = this.bs;
      const dt = S.dt;
      this.time += dt;
      // transición de paleta
      if (S.pal) {
        const tp = this.palOf(S.pal), k = 1 - Math.exp(-dt * 1.6);
        for (const key of ['top', 'bot', 'ground', 'line']) this.col[key] = mixc(this.col[key], tp[key], k);
      }
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      let sx = 0, sy = 0;
      if (this.shake > 0) { const a = this.shake * bs * 0.35; sx = (Math.random() - 0.5) * a; sy = (Math.random() - 0.5) * a; this.shake = Math.max(0, this.shake - dt * 1.4); }
      const pulse = S.pulse || 0;
      this.drawBg(S.t, pulse);
      g.save(); g.translate(sx, sy);
      const L = S.L;
      if (L) {
        this.drawWorldText(S);
        this.drawObjects(L, S, pulse);
        this.drawCheckpoints(S);
        this.drawFinish(L);
        this.drawGround(L, pulse);
        if (S.p && !S.p.dead && !S.hidePlayer) this.drawPlayer(S.p, S.px, S.py, pulse, dt);
        this.drawParticles(dt);
      }
      g.restore();
      if (this.flash > 0) {
        g.fillStyle = css(this.flashCol, Math.min(0.6, this.flash));
        g.fillRect(0, 0, W, H);
        this.flash = Math.max(0, this.flash - dt * 3);
      }
      const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.42)');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
    }
    drawBg(t, pulse) {
      const g = this.g, W = this.W, H = this.H, C = this.col, bs = this.bs;
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, css(C.top)); grd.addColorStop(1, css(C.bot));
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      const hx = W * 0.64, hy = this.wy(2.5);
      const rad = g.createRadialGradient(hx, hy, 0, hx, hy, Math.max(W, H) * 0.7);
      rad.addColorStop(0, css(C.line, 0.13 + 0.09 * pulse)); rad.addColorStop(1, css(C.line, 0));
      g.fillStyle = rad; g.fillRect(0, 0, W, H);
      if (!this.hq) return;
      // figuras lejanas
      const px = this.cam.x * 0.08, slot = 8.5;
      const i0 = Math.floor(px / slot) - 1, i1 = Math.floor((px + this.VW) / slot) + 1;
      g.lineWidth = Math.max(1, bs * 0.045);
      for (let i = i0; i <= i1; i++) {
        const h1 = hash(i * 7.13), h2 = hash(i * 3.71 + 1), h3 = hash(i * 1.37 + 2);
        const x = (i * slot + h1 * 3 - px) * bs, y = H * (0.12 + h2 * 0.42) + this.cam.y * bs * 0.04;
        const sz = bs * (1.6 + h3 * 3.6);
        g.strokeStyle = `rgba(255,255,255,${(0.05 + 0.07 * pulse * h3).toFixed(3)})`;
        g.save(); g.translate(x, y); g.rotate((this.reduced ? 0 : t * 0.12 * (h1 - 0.5)) + h2 * 3);
        const k = (h3 * 4) | 0;
        g.beginPath();
        if (k === 0) g.rect(-sz / 2, -sz / 2, sz, sz);
        else if (k === 1) { g.moveTo(0, -sz / 2); g.lineTo(sz / 2, 0); g.lineTo(0, sz / 2); g.lineTo(-sz / 2, 0); g.closePath(); }
        else if (k === 2) g.arc(0, 0, sz / 2, 0, 7);
        else { g.moveTo(0, -sz / 2); g.lineTo(sz * 0.45, sz * 0.3); g.lineTo(-sz * 0.45, sz * 0.3); g.closePath(); }
        g.stroke();
        g.restore();
      }
      // horizonte de torres
      const base = this.wy(0) - (this.cam.y + 2.6) * bs * -0.15;
      const p2 = this.cam.x * 0.28;
      const j0 = Math.floor(p2 / 2.2) - 1, j1 = Math.floor((p2 + this.VW) / 2.2) + 2;
      g.fillStyle = 'rgba(0,0,0,0.26)';
      const edges = [];
      for (let j = j0; j <= j1; j++) {
        const hh = 1.2 + hash(j * 2.37) * 5.5, ww = 1.2 + hash(j * 5.11) * 1.6;
        const x = (j * 2.2 - p2) * bs, y = base - hh * bs;
        g.fillRect(x, y, ww * bs, base - y + 2);
        edges.push([x, y, ww * bs]);
      }
      g.fillStyle = css(C.line, 0.16 + 0.1 * pulse);
      for (const [x, y, w] of edges) g.fillRect(x, y, w, Math.max(1, bs * 0.04));
      // polvo flotante
      g.globalCompositeOperation = 'lighter';
      const p3 = this.cam.x * 0.18;
      for (const d of this.dust) {
        let x = (((d[0] - p3) % 80) + 80) % 80;
        const sx = x * bs, syy = (H / bs - d[1]) * bs * 0.9 + Math.sin(t * 0.7 + d[3]) * bs * 0.2;
        if (sx > W + 4) continue;
        const a = 0.18 + 0.2 * Math.sin(t * 2 + d[3]) + pulse * 0.15;
        g.fillStyle = css(C.line, Math.max(0, a));
        const z = bs * 0.06 * d[2];
        g.fillRect(sx, syy, z, z);
      }
      g.globalCompositeOperation = 'source-over';
    }
    drawGround(L, pulse) {
      const g = this.g, bs = this.bs, W = this.W, H = this.H, C = this.col;
      const band = (yEdge, down, x0, x1) => {
        const a = Math.max(0, x0), b = Math.min(W, x1);
        if (b <= a) return;
        const far = down ? H : 0;
        if ((down && yEdge >= H) || (!down && yEdge <= 0)) return;
        const grd = g.createLinearGradient(0, yEdge, 0, far);
        grd.addColorStop(0, css(C.ground)); grd.addColorStop(1, css(shade(C.ground, 0.45)));
        g.fillStyle = grd;
        g.fillRect(a, Math.min(yEdge, far), b - a, Math.abs(far - yEdge));
        g.strokeStyle = 'rgba(255,255,255,0.055)'; g.lineWidth = 1;
        g.beginPath();
        const s0 = Math.floor(this.cam.x / 2) * 2;
        for (let x = s0; x < this.cam.x + this.VW + 2; x += 2) { const sx = this.wx(x); if (sx < a || sx > b) continue; g.moveTo(sx, yEdge); g.lineTo(sx, far); }
        const yy = yEdge + (down ? 1 : -1) * bs * 1.2;
        g.moveTo(a, yy); g.lineTo(b, yy);
        g.stroke();
        const gl = bs * 0.7;
        const gb = g.createLinearGradient(0, yEdge + (down ? -gl : gl), 0, yEdge);
        gb.addColorStop(0, css(C.line, 0)); gb.addColorStop(1, css(C.line, 0.16 + 0.16 * pulse));
        g.fillStyle = gb;
        g.fillRect(a, down ? yEdge - gl : yEdge, b - a, gl);
        const lg = g.createLinearGradient(0, 0, W, 0);
        lg.addColorStop(0, css(C.line, 0.05)); lg.addColorStop(0.25, css(C.line, 0.95)); lg.addColorStop(0.75, css(C.line, 0.95)); lg.addColorStop(1, css(C.line, 0.05));
        g.fillStyle = lg;
        const lw = Math.max(2, bs * 0.05);
        g.fillRect(a, down ? yEdge - lw / 2 : yEdge - lw / 2, b - a, lw);
      };
      band(this.wy(0), true, 0, W);
      for (const c of L.corr) {
        const x0 = this.wx(c.x0), x1 = this.wx(c.x1);
        if (x1 < 0 || x0 > W) continue;
        band(this.wy(c.ceil), false, x0, x1);
      }
    }
    drawFinish(L) {
      if (!isFinite(L.endX)) return;
      const g = this.g, bs = this.bs, x = this.wx(L.endX);
      if (x < -bs * 3 || x > this.W + bs * 3) return;
      const gr = g.createLinearGradient(x - bs * 3, 0, x, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.22)');
      g.fillStyle = gr; g.fillRect(x - bs * 3, 0, bs * 3, this.H);
      const s = bs * 0.4, top = this.wy(this.cam.y + this.VH + 1), bot = this.wy(0);
      g.fillStyle = 'rgba(255,255,255,0.9)';
      for (let j = 0; top + j * s < bot; j++) for (let i = 0; i < 2; i++) if ((i + j) % 2 === 0) g.fillRect(x + i * s, top + j * s, s, Math.min(s, bot - top - j * s));
      g.fillStyle = css(this.col.line, 0.5); g.fillRect(x - 2, top, 2, bot - top); g.fillRect(x + 2 * s, top, 2, bot - top);
    }
    drawWorldText(S) {
      if (S.attemptText == null) return;
      const g = this.g, bs = this.bs;
      const x = this.wx(S.textX == null ? 3 : S.textX), y = this.wy(5.2);
      if (x < -bs * 20 || x > this.W + bs * 4) return;
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.font = `${Math.round(bs * 1.05)}px "Bungee", "Arial Black", Impact, sans-serif`;
      g.fillStyle = 'rgba(255,255,255,0.88)';
      g.shadowColor = css(this.col.line, 0.9); g.shadowBlur = bs * 0.4;
      g.fillText(S.attemptText, x, y);
      g.shadowBlur = 0;
      if (S.subText) {
        g.font = `${Math.round(bs * 0.42)}px "Chakra Petch", "Segoe UI", sans-serif`;
        g.fillStyle = 'rgba(255,255,255,0.7)';
        g.fillText(S.subText, x + bs * 0.05, y + bs * 0.95);
      }
    }
    drawCheckpoints(S) {
      if (!S.checkpoints || !S.checkpoints.length) return;
      const g = this.g, bs = this.bs;
      for (const cp of S.checkpoints) {
        const x = this.wx(cp.x), y = this.wy(cp.y);
        if (x < -bs || x > this.W + bs) continue;
        g.save(); g.translate(x, y); g.rotate(Math.PI / 4);
        g.fillStyle = 'rgba(125,255,107,0.35)'; g.strokeStyle = '#7dff6b'; g.lineWidth = Math.max(1.5, bs * 0.05);
        g.fillRect(-bs * 0.22, -bs * 0.22, bs * 0.44, bs * 0.44); g.strokeRect(-bs * 0.22, -bs * 0.22, bs * 0.44, bs * 0.44);
        g.restore();
      }
    }
    neonStroke(path, col, w) {
      const g = this.g;
      if (this.hq) {
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = css(col, 0.1); g.lineWidth = w * 5; g.stroke(path);
        g.strokeStyle = css(col, 0.22); g.lineWidth = w * 2.4; g.stroke(path);
        g.globalCompositeOperation = 'source-over';
      }
      g.strokeStyle = css(mixc(col, [255, 255, 255], 0.35)); g.lineWidth = w; g.stroke(path);
    }
    drawObjects(L, S, pulse) {
      const g = this.g, bs = this.bs, t = S.t;
      const c0 = Math.floor(this.cam.x) - 3, c1 = Math.ceil(this.cam.x + this.VW) + 3;
      const st = ++this.stamp;
      const blocks = [], spikes = [], saws = [], pads = [], orbs = [], portals = [], coins = [], tunnels = [];
      for (let c = c0; c <= c1; c++) {
        const col = L.cols[c];
        if (!col) continue;
        for (const o of col) {
          if (o._r === st) continue;
          o._r = st;
          switch (o.t) {
            case 'block': blocks.push(o); break; case 'spike': spikes.push(o); break; case 'saw': saws.push(o); break;
            case 'pad': pads.push(o); break; case 'orb': orbs.push(o); break; case 'portal': portals.push(o); break;
            case 'coin': coins.push(o); break; case 'tunnel': tunnels.push(o); break;
          }
        }
      }
      const OC = this.objC, FC = this.fillC, lw = Math.max(1.5, bs * 0.05);
      // portales (haz de fondo)
      for (const o of portals) this.drawPortalBeam(o, t);
      // túneles
      for (const o of tunnels) this.drawTunnel(o, OC, FC, lw);
      // bloques
      if (blocks.length) {
        g.fillStyle = css(FC);
        for (const o of blocks) g.fillRect(this.wx(o.x), this.wy(o.y + o.h), o.w * bs, o.h * bs);
        g.fillStyle = css(OC, 0.13);
        for (const o of blocks) g.fillRect(this.wx(o.x), this.wy(o.y + o.h), o.w * bs, Math.min(o.h, 0.16) * bs);
        if (bs > 12) {
          const inner = new Path2D();
          for (const o of blocks) {
            const nx = Math.round(o.w), ny = Math.round(o.h);
            if (nx * ny > 80 || nx < 1 || ny < 1) continue;
            const cw = o.w / nx, ch = o.h / ny;
            for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
              const x = this.wx(o.x + i * cw + 0.22), y = this.wy(o.y + (j + 1) * ch - 0.22);
              inner.rect(x, y, (cw - 0.44) * bs, (ch - 0.44) * bs);
            }
          }
          g.strokeStyle = css(OC, 0.16 + 0.1 * pulse); g.lineWidth = Math.max(1, bs * 0.03); g.stroke(inner);
        }
        const out = new Path2D();
        for (const o of blocks) out.rect(this.wx(o.x), this.wy(o.y + o.h), o.w * bs, o.h * bs);
        this.neonStroke(out, OC, lw);
      }
      // pinchos
      if (spikes.length) {
        const P = new Path2D(), I = new Path2D();
        for (const o of spikes) {
          const x = this.wx(o.x), w = bs, s = o.s;
          if (o.dir === 'd') {
            const yb = this.wy(o.y + 1), yt = this.wy(o.y + 1 - s * 0.96);
            P.moveTo(x + w * 0.04, yb); P.lineTo(x + w * 0.96, yb); P.lineTo(x + w / 2, yt); P.closePath();
            I.moveTo(x + w * 0.3, yb + bs * 0.08); I.lineTo(x + w * 0.7, yb + bs * 0.08); I.lineTo(x + w / 2, yt - (yt - yb) * 0.35); I.closePath();
          } else {
            const yb = this.wy(o.y), yt = this.wy(o.y + s * 0.96);
            P.moveTo(x + w * 0.04, yb); P.lineTo(x + w * 0.96, yb); P.lineTo(x + w / 2, yt); P.closePath();
            I.moveTo(x + w * 0.3, yb - bs * 0.08); I.lineTo(x + w * 0.7, yb - bs * 0.08); I.lineTo(x + w / 2, yt + (yb - yt) * 0.35); I.closePath();
          }
        }
        g.fillStyle = css(FC); g.fill(P);
        g.strokeStyle = css(OC, 0.22); g.lineWidth = Math.max(1, bs * 0.03); g.stroke(I);
        this.neonStroke(P, OC, lw);
      }
      // sierras
      for (const o of saws) {
        const sp = this.sawSprite(o.r);
        g.save(); g.translate(this.wx(o.x), this.wy(o.y)); g.rotate(this.reduced ? 0 : t * -5);
        g.drawImage(sp.c, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
        g.restore();
      }
      // plataformas de salto
      for (const o of pads) {
        const sp = this.padSprite(o.c);
        const x = this.wx(o.x), y = this.wy(o.y);
        g.save(); g.translate(x + bs / 2, y); if (o.dir === 'd') g.scale(1, -1);
        g.drawImage(sp.c, -sp.w / 2, -sp.h + bs * 0.06, sp.w, sp.h);
        if (this.hq) {
          g.globalCompositeOperation = 'lighter';
          const col = hexc(PADC[o.c]);
          for (let k = 0; k < 3; k++) {
            const ph = (t * 1.6 + k / 3) % 1;
            g.fillStyle = css(col, 0.5 * (1 - ph));
            g.fillRect(-bs * 0.3 + k * bs * 0.25, -bs * (0.2 + ph * 0.9), bs * 0.06, bs * 0.18);
          }
          g.globalCompositeOperation = 'source-over';
        }
        g.restore();
      }
      // orbes
      for (const o of orbs) {
        const used = S.p && S.p.used.indexOf(o.id) >= 0;
        const sp = this.orbSprite(o.c);
        const k = 1 + 0.12 * pulse + 0.05 * Math.sin(t * 6);
        const x = this.wx(o.x), y = this.wy(o.y);
        g.globalAlpha = used ? 0.45 : 1;
        g.drawImage(sp.c, x - (sp.w * k) / 2, y - (sp.h * k) / 2, sp.w * k, sp.h * k);
        g.strokeStyle = css(hexc(PADC[o.c]), 0.75); g.lineWidth = Math.max(1, bs * 0.04);
        g.setLineDash([bs * 0.18, bs * 0.14]); g.lineDashOffset = -t * bs * 1.2;
        g.beginPath(); g.arc(x, y, bs * 0.62 * k, 0, 7); g.stroke();
        g.setLineDash([]);
        g.globalAlpha = 1;
      }
      // monedas
      for (const o of coins) {
        const taken = S.p && S.p.coins & (1 << o.cid);
        if (taken) continue;
        const ghost = S.savedCoins && S.savedCoins & (1 << o.cid);
        const sp = this.coinSprite();
        const sxk = Math.max(0.15, Math.abs(Math.cos(t * 2.6 + o.cid)));
        const x = this.wx(o.x), y = this.wy(o.y + Math.sin(t * 3 + o.cid) * 0.08);
        g.globalAlpha = ghost ? 0.4 : 1;
        g.save(); g.translate(x, y); g.scale(sxk, 1);
        g.drawImage(sp.c, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
        g.restore();
        g.globalAlpha = 1;
      }
      for (const o of portals) this.drawPortal(o, t, pulse);
    }
    drawTunnel(o, OC, FC, lw) {
      const g = this.g, bs = this.bs;
      const xa = Math.max(o.x0, this.cam.x - 1), xb = Math.min(o.x1, this.cam.x + this.VW + 1);
      if (xb <= xa) return;
      const pts = [];
      const at = (x) => { const w = E.tunnelAt(o, x); return [x, w[0], w[1]]; };
      pts.push(at(xa));
      for (const q of o.pts) if (q[0] > xa && q[0] < xb) pts.push([q[0], q[1] - q[2] / 2, q[1] + q[2] / 2]);
      pts.push(at(xb));
      const lo = new Path2D(), up = new Path2D(), loL = new Path2D(), upL = new Path2D();
      const fy = this.wy(o.floor - 1), cy = this.wy(o.ceil + 1);
      lo.moveTo(this.wx(xa), fy); up.moveTo(this.wx(xa), cy);
      pts.forEach((q, i) => {
        const x = this.wx(q[0]);
        const yl = this.wy(Math.max(q[1], o.floor - 1)), yu = this.wy(Math.min(q[2], o.ceil + 1));
        lo.lineTo(x, yl); up.lineTo(x, yu);
        if (i) { loL.lineTo(x, yl); upL.lineTo(x, yu); } else { loL.moveTo(x, yl); upL.moveTo(x, yu); }
      });
      lo.lineTo(this.wx(xb), fy); lo.closePath();
      up.lineTo(this.wx(xb), cy); up.closePath();
      g.fillStyle = css(FC, 0.94); g.fill(lo); g.fill(up);
      if (this.hq) {
        g.save(); g.clip(lo); this.hatch(xa, xb, OC); g.restore();
        g.save(); g.clip(up); this.hatch(xa, xb, OC); g.restore();
      }
      this.neonStroke(loL, OC, lw); this.neonStroke(upL, OC, lw);
    }
    hatch(xa, xb, OC) {
      const g = this.g, bs = this.bs;
      g.strokeStyle = css(OC, 0.09); g.lineWidth = Math.max(1, bs * 0.04);
      g.beginPath();
      const s = Math.floor(xa);
      for (let x = s - 12; x < xb + 1; x += 0.9) { g.moveTo(this.wx(x), this.H + 4); g.lineTo(this.wx(x + 12), this.H - 12 * bs); }
      g.stroke();
    }
    drawPortalBeam(o, t) {
      const g = this.g, bs = this.bs;
      const col = hexc(PORTAL[o.k] || '#ffffff');
      const x = this.wx(o.x + 0.5);
      if (x < -bs * 2 || x > this.W + bs * 2) return;
      const gr = g.createLinearGradient(x - bs * 0.8, 0, x + bs * 0.8, 0);
      gr.addColorStop(0, css(col, 0)); gr.addColorStop(0.5, css(col, 0.16)); gr.addColorStop(1, css(col, 0));
      g.fillStyle = gr; g.fillRect(x - bs * 0.8, 0, bs * 1.6, this.H);
      g.fillStyle = css(col, 0.35); g.fillRect(x - 1, 0, 2, this.H);
    }
    drawPortal(o, t, pulse) {
      const g = this.g, bs = this.bs;
      const col = hexc(PORTAL[o.k] || '#ffffff');
      const x = this.wx(o.x + 0.5), y = this.wy(o.y);
      if (x < -bs * 2 || x > this.W + bs * 2) return;
      const rx = bs * 0.42, ry = bs * 1.55;
      const P = new Path2D(); P.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      g.fillStyle = css(col, 0.12); g.fill(P);
      this.neonStroke(P, col, Math.max(2, bs * 0.09));
      const P2 = new Path2D(); P2.ellipse(x, y, rx * 0.55, ry * 0.8, 0, 0, Math.PI * 2);
      g.strokeStyle = css(col, 0.45 + 0.3 * pulse); g.lineWidth = Math.max(1, bs * 0.035); g.stroke(P2);
      // icono
      g.save(); g.translate(x, y - ry - bs * 0.55);
      const s = bs * 0.62;
      g.fillStyle = css(col); g.strokeStyle = css(col); g.lineWidth = Math.max(1.5, bs * 0.06); g.lineJoin = 'round';
      const k = o.k;
      g.beginPath();
      if (k === 'cube') g.rect(-s * 0.32, -s * 0.32, s * 0.64, s * 0.64);
      else if (k === 'ship') { g.moveTo(-s * 0.45, s * 0.2); g.lineTo(s * 0.45, s * 0.08); g.lineTo(-s * 0.3, -s * 0.25); g.closePath(); }
      else if (k === 'ball') g.arc(0, 0, s * 0.34, 0, 7);
      else if (k === 'ufo') { g.ellipse(0, s * 0.08, s * 0.46, s * 0.16, 0, 0, 7); g.moveTo(s * 0.24, 0); g.arc(0, 0, s * 0.24, 0, Math.PI, true); }
      else if (k === 'wave') { g.moveTo(-s * 0.45, s * 0.25); g.lineTo(-s * 0.15, -s * 0.25); g.lineTo(s * 0.15, s * 0.25); g.lineTo(s * 0.45, -s * 0.25); }
      else if (k === 'gn' || k === 'gf') { const d = k === 'gn' ? 1 : -1; g.moveTo(0, -s * 0.35 * d); g.lineTo(0, s * 0.3 * d); g.moveTo(-s * 0.25, s * 0.08 * d); g.lineTo(0, s * 0.35 * d); g.lineTo(s * 0.25, s * 0.08 * d); }
      else if (k.slice(0, 2) === 'sp') {
        const n = Math.max(1, +k[2]);
        for (let i = 0; i < n; i++) { const ox = (i - (n - 1) / 2) * s * 0.28; g.moveTo(ox - s * 0.12, -s * 0.28); g.lineTo(ox + s * 0.14, 0); g.lineTo(ox - s * 0.12, s * 0.28); }
      }
      if (k === 'cube' || k === 'ship' || k === 'ball') { g.globalAlpha = 0.85; g.fill(); g.globalAlpha = 1; } else g.stroke();
      g.restore();
    }
    sawSprite(r) {
      const bs = this.bs, D = (r * 2 + 0.7) * bs;
      return this.sprite('saw' + r, D, D, (g, w, h) => {
        const OC = this.objC, FC = this.fillC;
        g.translate(w / 2, h / 2);
        const R = r * bs, n = 14;
        g.beginPath();
        for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2, rr2 = i % 2 ? R * 0.8 : R; g.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); }
        g.closePath();
        g.fillStyle = css(FC); g.fill();
        g.shadowColor = css(OC); g.shadowBlur = bs * 0.35;
        g.strokeStyle = css(mixc(OC, [255, 255, 255], 0.3)); g.lineWidth = Math.max(1.5, bs * 0.05); g.stroke();
        g.shadowBlur = 0;
        g.beginPath(); g.arc(0, 0, R * 0.48, 0, 7); g.strokeStyle = css(OC, 0.6); g.stroke();
        for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; g.beginPath(); g.moveTo(Math.cos(a) * R * 0.15, Math.sin(a) * R * 0.15); g.lineTo(Math.cos(a) * R * 0.46, Math.sin(a) * R * 0.46); g.stroke(); }
        g.beginPath(); g.arc(0, 0, R * 0.14, 0, 7); g.fillStyle = css(OC); g.fill();
      });
    }
    padSprite(c) {
      const bs = this.bs;
      return this.sprite('pad' + c, bs * 1.4, bs * 0.7, (g, w, h) => {
        const col = hexc(PADC[c]);
        g.translate(w / 2, h);
        g.shadowColor = css(col); g.shadowBlur = bs * 0.3;
        g.beginPath(); g.moveTo(-bs * 0.42, -bs * 0.06); g.quadraticCurveTo(0, -bs * 0.5, bs * 0.42, -bs * 0.06); g.closePath();
        g.fillStyle = css(col, 0.85); g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = css(mixc(col, [255, 255, 255], 0.5)); g.lineWidth = Math.max(1, bs * 0.04); g.stroke();
      });
    }
    orbSprite(c) {
      const bs = this.bs;
      return this.sprite('orb' + c, bs * 1.7, bs * 1.7, (g, w, h) => {
        const col = hexc(PADC[c]);
        g.translate(w / 2, h / 2);
        const R = bs * 0.42;
        const rg = g.createRadialGradient(0, 0, 0, 0, 0, R);
        rg.addColorStop(0, 'rgba(255,255,255,0.95)'); rg.addColorStop(0.45, css(col, 0.9)); rg.addColorStop(1, css(shade(col, 0.6), 0.9));
        g.shadowColor = css(col); g.shadowBlur = bs * 0.45;
        g.beginPath(); g.arc(0, 0, R, 0, 7); g.fillStyle = rg; g.fill();
        g.shadowBlur = 0;
        g.lineWidth = Math.max(1.5, bs * 0.06); g.strokeStyle = css(mixc(col, [255, 255, 255], 0.4)); g.stroke();
      });
    }
    coinSprite() {
      const bs = this.bs;
      return this.sprite('coin', bs * 1.6, bs * 1.6, (g, w, h) => {
        g.translate(w / 2, h / 2);
        const R = bs * 0.5;
        g.shadowColor = '#ffd25c'; g.shadowBlur = bs * 0.4;
        const rg = g.createRadialGradient(-R * 0.3, -R * 0.3, 0, 0, 0, R);
        rg.addColorStop(0, '#fff6c9'); rg.addColorStop(0.6, '#ffc93d'); rg.addColorStop(1, '#c47a10');
        g.beginPath(); g.arc(0, 0, R, 0, 7); g.fillStyle = rg; g.fill();
        g.shadowBlur = 0;
        g.lineWidth = bs * 0.06; g.strokeStyle = '#7a4300'; g.stroke();
        g.beginPath(); g.arc(0, 0, R * 0.72, 0, 7); g.lineWidth = bs * 0.035; g.strokeStyle = 'rgba(122,67,0,0.7)'; g.stroke();
        g.fillStyle = '#7a4300';
        g.beginPath(); g.moveTo(0, -R * 0.42); g.lineTo(R * 0.3, 0); g.lineTo(0, R * 0.42); g.lineTo(-R * 0.3, 0); g.closePath(); g.fill();
      });
    }
    glowSprite(col) {
      const bs = this.bs;
      return this.sprite('glow' + col, bs * 3.2, bs * 3.2, (g, w, h) => {
        const c = hexc(col);
        const rg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        rg.addColorStop(0, css(c, 0.42)); rg.addColorStop(0.4, css(c, 0.13)); rg.addColorStop(1, css(c, 0));
        g.fillStyle = rg; g.fillRect(0, 0, w, h);
      });
    }
    drawPlayer(p, px, py, pulse, dt) {
      const g = this.g, bs = this.bs, I = this.icon;
      const x = this.wx(px), y = this.wy(py);
      const c1 = hexc(I.c1);
      // estela
      if (p.mode === 'wave') {
        this.wtrail.push([px, py]);
        if (this.wtrail.length > 90) this.wtrail.shift();
        if (this.wtrail.length > 1) {
          const path = new Path2D();
          this.wtrail.forEach((q, i) => (i ? path.lineTo(this.wx(q[0]), this.wy(q[1])) : path.moveTo(this.wx(q[0]), this.wy(q[1]))));
          const tx = this.wx(this.wtrail[0][0]);
          const gr = g.createLinearGradient(tx, 0, x, 0);
          gr.addColorStop(0, css(c1, 0)); gr.addColorStop(1, css(c1, 0.9));
          g.lineJoin = 'miter'; g.lineCap = 'butt';
          if (this.hq) { g.globalCompositeOperation = 'lighter'; g.strokeStyle = gr; g.lineWidth = bs * 0.42; g.globalAlpha = 0.25; g.stroke(path); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
          g.strokeStyle = gr; g.lineWidth = bs * 0.2; g.stroke(path);
          const gw = g.createLinearGradient(tx, 0, x, 0);
          gw.addColorStop(0, 'rgba(255,255,255,0)'); gw.addColorStop(1, 'rgba(255,255,255,0.85)');
          g.strokeStyle = gw; g.lineWidth = bs * 0.06; g.stroke(path);
        }
      } else if (I.trail) {
        this.trail.push([px, py]);
        if (this.trail.length > 14) this.trail.shift();
        if (this.trail.length > 2) {
          g.globalCompositeOperation = 'lighter';
          g.lineCap = 'round';
          for (let i = 1; i < this.trail.length; i++) {
            const a = this.trail[i - 1], b = this.trail[i], k = i / this.trail.length;
            g.strokeStyle = css(c1, 0.35 * k); g.lineWidth = bs * 0.42 * k;
            g.beginPath(); g.moveTo(this.wx(a[0]), this.wy(a[1])); g.lineTo(this.wx(b[0]), this.wy(b[1])); g.stroke();
          }
          g.globalCompositeOperation = 'source-over';
        }
      }
      // brillo
      if (this.hq) {
        const gs = this.glowSprite(I.c1), k = 1 + 0.15 * pulse;
        g.globalCompositeOperation = 'lighter';
        g.drawImage(gs.c, x - (gs.w * k) / 2, y - (gs.h * k) / 2, gs.w * k, gs.h * k);
        g.globalCompositeOperation = 'source-over';
      }
      // partículas del modo
      if (p.mode === 'ship' && Math.random() < 0.9) this.burst(px - 0.55, py - 0.05 * p.grav, 1, Math.random() < 0.5 ? c1 : hexc(I.c2), { speed: 3, life: 0.35, ang: Math.PI, spread: 0.6, g: 0, size: 0.11 });
      if (p.mode === 'cube' && p.onGround && Math.random() < 0.35) this.burst(px - 0.45, py - 0.45 * p.grav, 1, this.col.line, { speed: 2.5, life: 0.3, ang: Math.PI - 0.5 * p.grav, spread: 0.5, g: 0, size: 0.08 });
      if (p.mode === 'ufo' && Math.random() < 0.4) this.burst(px, py - 0.35 * p.grav, 1, hexc(I.c2), { speed: 2, life: 0.3, ang: Math.PI / 2 * p.grav, spread: 0.5, g: 0, size: 0.07, k: 'dot' });
      g.save(); g.translate(x, y); g.rotate(p.rot);
      if ((p.mode === 'ship' || p.mode === 'ufo') && p.grav < 0) g.scale(1, -1);
      DRAW[p.mode](g, bs, I.design, I.c1, I.c2);
      g.restore();
    }
    drawParticles(dt) {
      const g = this.g, bs = this.bs, P = this.parts;
      g.globalCompositeOperation = 'lighter';
      let w = 0;
      for (let i = 0; i < P.length; i++) {
        const q = P[i];
        q.life -= dt;
        if (q.life <= 0) continue;
        P[w++] = q;
        q.vy -= q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt;
        const a = q.life / q.max, x = this.wx(q.x), y = this.wy(q.y);
        if (q.k === 'ring') {
          const r = (q.sz + (q.r1 - q.sz) * (1 - a * a)) * bs;
          g.strokeStyle = css(q.col, a * 0.9); g.lineWidth = Math.max(1, q.w * bs * a);
          g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke();
        } else if (q.k === 'spark') {
          g.strokeStyle = css(q.col, a); g.lineWidth = Math.max(1, q.sz * bs * 0.6);
          g.beginPath(); g.moveTo(x, y); g.lineTo(x - q.vx * bs * 0.025, y + q.vy * bs * 0.025); g.stroke();
        } else if (q.k === 'dot') {
          g.fillStyle = css(q.col, a); g.beginPath(); g.arc(x, y, q.sz * bs * 0.6, 0, 7); g.fill();
        } else {
          q.rot += q.vr * dt;
          const s = q.sz * bs;
          g.save(); g.translate(x, y); g.rotate(q.rot);
          g.fillStyle = css(q.col, a); g.fillRect(-s / 2, -s / 2, s, s);
          g.restore();
        }
      }
      P.length = w;
      if (P.length > 600) P.splice(0, P.length - 600);
      g.globalCompositeOperation = 'source-over';
    }
  }

  PN.Render = { Renderer, DESIGNS, DRAW, PORTAL, PADC, hexc, css };
})(typeof window !== 'undefined' ? window : globalThis);
