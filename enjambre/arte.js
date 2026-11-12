/* Enjambre: arte vectorial propio. Cada sprite se dibuja una sola vez, con su brillo, en un lienzo fuera de pantalla
   a la resolución real del dispositivo; durante la partida solo se copian esos lienzos (rápido incluso en móviles). */
(function (root) {
  "use strict";
  const TAU = Math.PI * 2, FRAMES = 12, QUEEN_FRAMES = 6;
  // Colores de cada especie: a = vigía, b = escarabajo, c = medusa.
  const PAL = {
    a: { glow: "#ff5ad1", light: "#ffe0f7", mid: "#d946ef", dark: "#4c1d95", spike: "#ff9be9" },
    b: { glow: "#22d3ee", light: "#cffafe", mid: "#06b6d4", dark: "#134e4a", wing: "rgba(103,232,249,.3)", eye: "#fde047" },
    c: { glow: "#a3e635", light: "#f7fee7", mid: "#84cc16", dark: "#365314", tentacle: "#d9f99d" }
  };
  const POWER_COLORS = { rapid: "#fb923c", spread: "#e879f9", shield: "#22d3ee", life: "#fb7185" };
  const GLOWS = { cyan: "#22d3ee", magenta: "#ff5ad1", lime: "#a3e635", gold: "#fcd34d", orange: "#fb923c", red: "#fb7185", white: "#ffffff", violet: "#a78bfa" };

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  // Crea un lienzo de w × h unidades lógicas con el origen en el centro y lo dibuja con draw(g, k).
  function sprite(k, w, h, draw) {
    const c = document.createElement("canvas");
    c.width = Math.max(2, Math.ceil(w * k));
    c.height = Math.max(2, Math.ceil(h * k));
    const g = c.getContext("2d");
    g.setTransform(k, 0, 0, k, c.width / 2, c.height / 2);
    g.lineCap = "round";
    g.lineJoin = "round";
    draw(g, k);
    return { c, w: c.width / k, h: c.height / k };
  }
  function glowOn(g, k, color, blur) { g.shadowColor = color; g.shadowBlur = blur * k; }
  function poly(g, pts) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }

  // ---------- vigía: un orbe con un gran ojo y seis púas que respiran ----------
  function sentinel(g, k, f) {
    const C = PAL.a, ph = (f / FRAMES) * TAU;
    g.save();
    glowOn(g, k, C.glow, 5);
    g.fillStyle = C.spike;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6, len = 9.4 + 1 * Math.sin(ph + (i % 3) * (TAU / 3));
      poly(g, [[Math.cos(a - 0.3) * 6, Math.sin(a - 0.3) * 6], [Math.cos(a) * len, Math.sin(a) * len], [Math.cos(a + 0.3) * 6, Math.sin(a + 0.3) * 6]]);
      g.fill();
    }
    g.restore();
    const body = g.createRadialGradient(-2.2, -2.6, 0.5, 0, 0, 7.4);
    body.addColorStop(0, C.light); body.addColorStop(0.45, C.mid); body.addColorStop(1, C.dark);
    g.save();
    glowOn(g, k, C.glow, 7);
    g.fillStyle = body;
    g.beginPath(); g.arc(0, 0, 7, 0, TAU); g.fill();
    g.restore();
    g.strokeStyle = "rgba(255,255,255,.4)"; g.lineWidth = 0.6;
    g.beginPath(); g.arc(0, 0, 6.2, Math.PI * 1.05, Math.PI * 1.7); g.stroke();
    g.fillStyle = "#1a0629";
    g.beginPath(); g.ellipse(0, 0.6, 4.3, 3.7, 0, 0, TAU); g.fill();
  }
  // Iris que sigue a la nave (se dibuja aparte, encima del cuerpo)
  function eye(g, k) {
    const iris = g.createRadialGradient(-0.6, -0.6, 0.2, 0, 0, 2.6);
    iris.addColorStop(0, "#fff7b0"); iris.addColorStop(0.45, "#ff3d81"); iris.addColorStop(1, "#7a0b3a");
    g.save();
    glowOn(g, k, "#ff3d81", 3);
    g.fillStyle = iris;
    g.beginPath(); g.arc(0, 0, 2.5, 0, TAU); g.fill();
    g.restore();
    g.fillStyle = "#12020c";
    g.beginPath(); g.arc(0, 0, 1.15, 0, TAU); g.fill();
    g.fillStyle = "#fff";
    g.beginPath(); g.arc(-0.8, -0.9, 0.55, 0, TAU); g.fill();
  }

  // ---------- escarabajo: caparazón con alas membranosas que baten ----------
  function beetle(g, k, f) {
    const C = PAL.b, ph = (f / FRAMES) * TAU, s = 0.5 + 0.5 * Math.sin(ph);
    g.save();
    glowOn(g, k, C.glow, 4);
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(side * 3.5, -3);
      g.quadraticCurveTo(side * (9 + 3 * s), -9 + 2 * s, side * (11 + 1.5 * s), -1 + 3 * s);
      g.quadraticCurveTo(side * 8, 2, side * 4, 1.5);
      g.closePath();
      g.fillStyle = C.wing; g.fill();
      g.strokeStyle = C.light; g.lineWidth = 0.7; g.stroke();
    }
    g.restore();
    g.strokeStyle = C.dark; g.lineWidth = 1.1;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const y = -1 + i * 3, sw = Math.sin(ph + i * 2) * 0.8;
        g.beginPath(); g.moveTo(side * 4.5, y); g.lineTo(side * 7.2, y + 1.5 + sw); g.stroke();
      }
    }
    const shell = g.createLinearGradient(0, -7.5, 0, 7.5);
    shell.addColorStop(0, C.light); shell.addColorStop(0.45, C.mid); shell.addColorStop(1, C.dark);
    g.save();
    glowOn(g, k, C.glow, 6);
    g.fillStyle = shell;
    g.beginPath();
    g.moveTo(0, -7.5);
    g.bezierCurveTo(4.5, -7.5, 6.2, -3, 6, 1);
    g.bezierCurveTo(5.8, 5, 3.5, 7.2, 0, 7.5);
    g.bezierCurveTo(-3.5, 7.2, -5.8, 5, -6, 1);
    g.bezierCurveTo(-6.2, -3, -4.5, -7.5, 0, -7.5);
    g.fill();
    g.restore();
    g.strokeStyle = "rgba(8,47,73,.8)"; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(0, -7); g.lineTo(0, 4); g.stroke();
    g.beginPath(); g.moveTo(-5.5, -1); g.quadraticCurveTo(0, 1.5, 5.5, -1); g.stroke();
    g.fillStyle = "rgba(255,255,255,.55)";
    g.beginPath(); g.ellipse(-2.4, -4.2, 1.6, 0.9, -0.5, 0, TAU); g.fill();
    g.save();
    glowOn(g, k, C.eye, 4);
    g.fillStyle = C.eye;
    for (const side of [-1, 1]) { g.beginPath(); g.arc(side * 2.3, 4.4, 1.15, 0, TAU); g.fill(); }
    g.restore();
    const m = 0.6 + 0.6 * Math.sin(ph * 2);
    g.strokeStyle = C.light; g.lineWidth = 1;
    for (const side of [-1, 1]) {
      g.beginPath(); g.moveTo(side * 1.6, 7); g.quadraticCurveTo(side * (2.8 + m), 8.6, side * (1.2 + m * 0.5), 9.6); g.stroke();
    }
  }

  // ---------- medusa: cúpula translúcida que late y cuatro tentáculos ----------
  function jelly(g, k, f) {
    const C = PAL.c, ph = (f / FRAMES) * TAU, pulse = Math.sin(ph);
    g.save();
    glowOn(g, k, C.glow, 3);
    g.strokeStyle = C.tentacle; g.lineWidth = 1.3;
    for (let i = 0; i < 4; i++) {
      const x0 = -6 + i * 4;
      g.beginPath(); g.moveTo(x0, 1.5);
      for (let j = 1; j <= 4; j++) g.lineTo(x0 + Math.sin(ph + i * 1.3 + j * 0.9) * 1.5 * (j / 4 + 0.3), 1.5 + j * 2.1);
      g.stroke();
    }
    g.restore();
    g.save();
    g.scale(1 - 0.05 * pulse, 1 + 0.07 * pulse);
    const dome = g.createRadialGradient(-2, -6, 1, 0, -2, 11);
    dome.addColorStop(0, C.light); dome.addColorStop(0.5, C.mid); dome.addColorStop(1, C.dark);
    glowOn(g, k, C.glow, 6);
    g.fillStyle = dome;
    g.beginPath();
    g.moveTo(-9.5, 2);
    g.bezierCurveTo(-9.5, -6, -5, -9, 0, -9);
    g.bezierCurveTo(5, -9, 9.5, -6, 9.5, 2);
    for (let i = 0; i < 5; i++) { const xa = 9.5 - i * 3.8, xb = xa - 3.8; g.quadraticCurveTo((xa + xb) / 2, 4.6, xb, 2); }
    g.closePath();
    g.fill();
    g.restore();
    g.fillStyle = "rgba(247,254,231,.85)";
    [[-3.5, -4, 1.1], [1.5, -6, 0.8], [4, -2.5, 0.9]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); });
    g.strokeStyle = "rgba(54,83,20,.6)"; g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(-7, 0.5); g.quadraticCurveTo(0, -2.5, 7, 0.5); g.stroke();
  }

  // ---------- nave del jugador ----------
  function ship(g, k) {
    const wing = g.createLinearGradient(0, -5, 0, 9);
    wing.addColorStop(0, "#3b4a63"); wing.addColorStop(1, "#0f172a");
    g.save();
    glowOn(g, k, "#22d3ee", 6);
    g.fillStyle = wing;
    poly(g, [[0, -5], [13, 5.5], [13, 8.5], [4, 7.5], [-4, 7.5], [-13, 8.5], [-13, 5.5]]);
    g.fill();
    g.restore();
    g.strokeStyle = "#67e8f9"; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(-1, -4.2); g.lineTo(-12.6, 5.6); g.moveTo(1, -4.2); g.lineTo(12.6, 5.6); g.stroke();
    g.strokeStyle = "#f472b6"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(-6, 3); g.lineTo(-10, 6.4); g.moveTo(6, 3); g.lineTo(10, 6.4); g.stroke();
    for (const s of [-1, 1]) {
      g.save();
      glowOn(g, k, s < 0 ? "#f472b6" : "#22d3ee", 4);
      g.fillStyle = "#fff";
      g.beginPath(); g.arc(s * 12.7, 7, 0.9, 0, TAU); g.fill();
      g.restore();
    }
    const body = g.createLinearGradient(-4.4, 0, 4.4, 0);
    body.addColorStop(0, "#64748b"); body.addColorStop(0.35, "#e2e8f0"); body.addColorStop(0.5, "#ffffff"); body.addColorStop(0.65, "#cbd5e1"); body.addColorStop(1, "#475569");
    g.save();
    glowOn(g, k, "#a5f3fc", 4);
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(0, -12.5);
    g.bezierCurveTo(2.2, -8, 4.3, -2, 4.3, 5.5);
    g.lineTo(2.8, 9.4); g.lineTo(-2.8, 9.4); g.lineTo(-4.3, 5.5);
    g.bezierCurveTo(-4.3, -2, -2.2, -8, 0, -12.5);
    g.fill();
    g.restore();
    const canopy = g.createLinearGradient(0, -7, 0, 0);
    canopy.addColorStop(0, "#fef3c7"); canopy.addColorStop(0.5, "#fbbf24"); canopy.addColorStop(1, "#b45309");
    g.fillStyle = canopy;
    g.beginPath(); g.ellipse(0, -3.6, 1.8, 3.4, 0, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,.8)";
    g.beginPath(); g.ellipse(-0.6, -5, 0.5, 1.1, 0, 0, TAU); g.fill();
    g.fillStyle = "#1e293b";
    g.fillRect(-3.6, 8.2, 2.6, 2); g.fillRect(1, 8.2, 2.6, 2);
  }
  // Llama del motor: el sprite empieza en la tobera (y = 0) y cae 12 unidades.
  function flame(g, k, hot) {
    g.translate(0, -6);
    const c1 = hot ? "#fde68a" : "#cffafe", c2 = hot ? "#fb923c" : "#22d3ee";
    const grd = g.createLinearGradient(0, 0, 0, 12);
    grd.addColorStop(0, "#fff"); grd.addColorStop(0.3, c1); grd.addColorStop(0.7, c2); grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(-1.6, 0); g.quadraticCurveTo(-1.4, 6, 0, 12); g.quadraticCurveTo(1.4, 6, 1.6, 0); g.closePath(); g.fill();
  }

  // ---------- platillo de bonificación ----------
  function saucer(g, k, f) {
    const beam = g.createRadialGradient(0, 3, 0, 0, 3, 14);
    beam.addColorStop(0, "rgba(255,90,209,.5)"); beam.addColorStop(1, "rgba(255,90,209,0)");
    g.fillStyle = beam;
    g.beginPath(); g.ellipse(0, 4, 15, 6, 0, 0, TAU); g.fill();
    const dome = g.createLinearGradient(0, -9, 0, -1);
    dome.addColorStop(0, "#e0f2fe"); dome.addColorStop(0.5, "#38bdf8"); dome.addColorStop(1, "#0c4a6e");
    g.save();
    glowOn(g, k, "#38bdf8", 5);
    g.fillStyle = dome;
    g.beginPath(); g.ellipse(0, -2, 6.5, 6.2, 0, Math.PI, TAU); g.fill();
    g.restore();
    const hull = g.createLinearGradient(0, -3, 0, 4);
    hull.addColorStop(0, "#f8fafc"); hull.addColorStop(0.5, "#94a3b8"); hull.addColorStop(1, "#1e293b");
    g.save();
    glowOn(g, k, "#ff5ad1", 6);
    g.fillStyle = hull;
    g.beginPath(); g.ellipse(0, 0.5, 17, 4.6, 0, 0, TAU); g.fill();
    g.restore();
    g.strokeStyle = "rgba(255,255,255,.6)"; g.lineWidth = 0.6;
    g.beginPath(); g.ellipse(0, 0, 15.5, 3.2, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    const cols = ["#f472b6", "#fde047", "#22d3ee"];
    for (let i = 0; i < 7; i++) {
      const x = -12 + i * 4, c = cols[(i + f) % 3];
      g.save();
      glowOn(g, k, c, 4);
      g.fillStyle = c;
      g.beginPath(); g.arc(x, 1.7 - Math.abs(x) * 0.05, 1, 0, TAU); g.fill();
      g.restore();
    }
  }

  // ---------- la reina del enjambre (jefe) ----------
  function queen(g, k, f, hurt) {
    const ph = (f / QUEEN_FRAMES) * TAU, C = { glow: "#e879f9", light: "#f5d0fe", mid: "#a21caf", dark: "#2e1065", accent: "#fb923c" };
    g.save();
    glowOn(g, k, C.glow, 4);
    for (let i = 0; i < 8; i++) {
      const x0 = -35 + i * 10, len = 16 + (i % 2) * 5;
      g.strokeStyle = i % 2 ? "#f0abfc" : "#c084fc";
      g.lineWidth = 2.2 - (i % 2) * 0.6;
      g.beginPath(); g.moveTo(x0, 12);
      for (let s = 1; s <= 5; s++) g.lineTo(x0 + Math.sin(ph + i * 0.8 + s * 0.9) * 2.4 * (s / 5 + 0.2), 12 + (len * s) / 5);
      g.stroke();
    }
    g.restore();
    const flap = Math.sin(ph) * 2;
    for (const s of [-1, 1]) {
      const grd = g.createLinearGradient(s * 30, -20, s * 62, 10);
      grd.addColorStop(0, C.mid); grd.addColorStop(1, C.dark);
      g.save();
      glowOn(g, k, C.glow, 6);
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(s * 26, -10);
      g.quadraticCurveTo(s * 50, -26 - flap, s * 62, -8 - flap);
      g.quadraticCurveTo(s * 52, -2, s * 58, 12 + flap);
      g.quadraticCurveTo(s * 42, 6, s * 28, 10);
      g.closePath();
      g.fill();
      g.restore();
      g.strokeStyle = "rgba(245,208,254,.55)"; g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(s * 30, -4); g.quadraticCurveTo(s * 46, -12 - flap, s * 58, -7 - flap);
      g.moveTo(s * 30, 2); g.quadraticCurveTo(s * 46, 2, s * 55, 9 + flap);
      g.stroke();
    }
    const body = g.createLinearGradient(0, -25, 0, 17);
    body.addColorStop(0, C.light); body.addColorStop(0.35, C.mid); body.addColorStop(1, C.dark);
    g.save();
    glowOn(g, k, C.glow, 9);
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(-34, 10);
    g.bezierCurveTo(-38, -10, -22, -25, 0, -25);
    g.bezierCurveTo(22, -25, 38, -10, 34, 10);
    g.bezierCurveTo(22, 17, -22, 17, -34, 10);
    g.fill();
    g.restore();
    g.strokeStyle = "rgba(46,16,101,.75)"; g.lineWidth = 1.1;
    for (let i = 1; i <= 3; i++) { g.beginPath(); g.ellipse(0, 8, 10 + i * 7.5, 6 + i * 9, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke(); }
    g.save();
    glowOn(g, k, C.accent, 5);
    g.fillStyle = "#fdba74";
    for (let i = -2; i <= 2; i++) {
      const x = i * 9, b = Math.abs(i);
      poly(g, [[x - 3, -21 + b * 2], [x, -31 + b * 3], [x + 3, -21 + b * 2]]);
      g.fill();
    }
    g.restore();
    const pulse = 0.6 + 0.4 * Math.sin(ph * 2);
    for (const s of [-1, 1]) {
      g.save();
      glowOn(g, k, C.accent, 8 * pulse);
      g.fillStyle = `rgba(253,186,116,${(0.6 + 0.4 * pulse).toFixed(2)})`;
      g.beginPath(); g.arc(s * 21, 2, 3.2, 0, TAU); g.fill();
      g.restore();
    }
    g.fillStyle = "#14031f";
    g.beginPath(); g.ellipse(0, -3, 11, 8.5, 0, 0, TAU); g.fill();
    g.strokeStyle = "rgba(245,208,254,.5)"; g.lineWidth = 1; g.stroke();
    if (hurt) {
      g.save();
      glowOn(g, k, C.accent, 5);
      g.strokeStyle = "#fed7aa"; g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(-26, -8); g.lineTo(-19, -3); g.lineTo(-22, 4); g.lineTo(-15, 9);
      g.moveTo(24, -12); g.lineTo(17, -6); g.lineTo(21, 0);
      g.moveTo(6, 10); g.lineTo(10, 14);
      g.stroke();
      g.restore();
    }
  }

  // ---------- mejoras ----------
  function power(g, k, kind) {
    const col = POWER_COLORS[kind];
    g.save();
    glowOn(g, k, col, 6);
    g.fillStyle = "rgba(10,8,30,.85)"; g.strokeStyle = col; g.lineWidth = 1.4;
    g.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; g.lineTo(Math.cos(a) * 8.5, Math.sin(a) * 8.5); }
    g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.strokeStyle = "#fff"; g.fillStyle = "#fff"; g.lineWidth = 1.5;
    g.beginPath();
    if (kind === "rapid") {
      g.moveTo(-3.5, 0.5); g.lineTo(0, -3); g.lineTo(3.5, 0.5); g.moveTo(-3.5, 4); g.lineTo(0, 0.5); g.lineTo(3.5, 4); g.stroke();
    } else if (kind === "spread") {
      g.moveTo(0, 4); g.lineTo(0, -4); g.moveTo(0, 4); g.lineTo(-3.6, -3); g.moveTo(0, 4); g.lineTo(3.6, -3); g.stroke();
    } else if (kind === "shield") {
      g.moveTo(0, -4.4); g.lineTo(3.8, -2.6); g.lineTo(3.2, 1.6); g.quadraticCurveTo(1.8, 3.8, 0, 4.6);
      g.quadraticCurveTo(-1.8, 3.8, -3.2, 1.6); g.lineTo(-3.8, -2.6); g.closePath(); g.stroke();
    } else {
      g.moveTo(0, 4); g.bezierCurveTo(-5, 0.5, -3.6, -4.4, 0, -2); g.bezierCurveTo(3.6, -4.4, 5, 0.5, 0, 4); g.fill();
    }
  }
  // Burbuja hexagonal (escudo de la nave y coraza de los alienígenas)
  function hexRing(g, k, r, color, width, fill) {
    g.save();
    glowOn(g, k, color, 5);
    g.strokeStyle = color; g.lineWidth = width;
    g.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    g.stroke();
    g.restore();
  }

  // ---------- proyectiles y brillos ----------
  function bolt(g, k) {
    g.save();
    glowOn(g, k, "#22d3ee", 6);
    const grd = g.createLinearGradient(0, -8, 0, 8);
    grd.addColorStop(0, "#ffffff"); grd.addColorStop(0.6, "#a5f3fc"); grd.addColorStop(1, "rgba(34,211,238,0)");
    g.fillStyle = grd;
    g.beginPath();
    if (g.roundRect) g.roundRect(-1.2, -8, 2.4, 16, 1.2); else g.rect(-1.2, -8, 2.4, 16);
    g.fill();
    g.restore();
  }
  function zig(g, k, f) {
    g.save();
    glowOn(g, k, "#bef264", 5);
    g.strokeStyle = "#ecfccb"; g.lineWidth = 1.4;
    g.beginPath();
    for (let i = 0; i <= 6; i++) { const y = -6 + i * 2, x = (i + f) % 2 ? 1.8 : -1.8; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    g.restore();
  }
  function needle(g, k) {
    g.save();
    glowOn(g, k, "#fb7185", 6);
    const grd = g.createLinearGradient(0, -8, 0, 7);
    grd.addColorStop(0, "rgba(251,113,133,0)"); grd.addColorStop(0.6, "#fb7185"); grd.addColorStop(1, "#fff1f2");
    g.fillStyle = grd;
    poly(g, [[0, -8], [1.6, 3], [0, 7], [-1.6, 3]]);
    g.fill();
    g.restore();
  }
  function plasma(g, k) {
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, 6);
    grd.addColorStop(0, "#fff"); grd.addColorStop(0.35, "#f5d0fe"); grd.addColorStop(0.6, "#d946ef"); grd.addColorStop(1, "rgba(217,70,239,0)");
    g.save();
    glowOn(g, k, "#e879f9", 8);
    g.fillStyle = grd;
    g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill();
    g.restore();
  }
  function glow(g, k, color) {
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, 16);
    grd.addColorStop(0, rgba(color, 1)); grd.addColorStop(0.22, rgba(color, 0.55)); grd.addColorStop(1, rgba(color, 0));
    g.fillStyle = grd;
    g.beginPath(); g.arc(0, 0, 16, 0, TAU); g.fill();
  }

  // Construye todos los sprites para una escala k (píxeles del dispositivo por unidad lógica).
  function build(k) {
    const qk = Math.min(k, 3);
    const frames = (n, w, h, fn, kk) => Array.from({ length: n }, (_, f) => sprite(kk || k, w, h, (g, s) => fn(g, s, f)));
    const S = {
      k,
      alien: { a: frames(FRAMES, 30, 30, sentinel), b: frames(FRAMES, 34, 30, beetle), c: frames(FRAMES, 30, 32, jelly) },
      eye: sprite(k, 9, 9, eye),
      bigEye: sprite(k, 30, 30, (g, s) => { g.scale(3.4, 3.4); eye(g, s * 3.4); }),
      ship: sprite(k, 40, 34, ship),
      flame: sprite(k, 6, 14, (g, s) => flame(g, s, false)),
      flameHot: sprite(k, 6, 14, (g, s) => flame(g, s, true)),
      saucer: frames(3, 46, 26, saucer),
      queen: frames(QUEEN_FRAMES, 150, 92, (g, s, f) => queen(g, s, f, false), qk),
      queenHurt: null,
      power: {},
      glow: {},
      bolt: sprite(k, 12, 26, bolt),
      zig: frames(2, 12, 20, zig),
      needle: sprite(k, 12, 24, needle),
      plasma: sprite(k, 22, 22, plasma),
      bubble: sprite(k, 40, 40, (g, s) => hexRing(g, s, 15, "#67e8f9", 1.2, "rgba(34,211,238,.10)")),
      armor: sprite(k, 32, 32, (g, s) => hexRing(g, s, 11.5, "#fcd34d", 1, "rgba(252,211,77,.08)"))
    };
    // Las grietas de la reina solo hacen falta cuando está herida: se dibujan la primera vez que se piden.
    Object.defineProperty(S, "queenHurtFrames", {
      get() { return S.queenHurt || (S.queenHurt = frames(QUEEN_FRAMES, 150, 92, (g, s, f) => queen(g, s, f, true), qk)); }
    });
    for (const kind in POWER_COLORS) S.power[kind] = sprite(k, 26, 26, (g, s) => power(g, s, kind));
    for (const name in GLOWS) S.glow[name] = sprite(Math.min(k, 2), 32, 32, (g, s) => glow(g, s, GLOWS[name]));
    return S;
  }
  // Dibuja un sprite centrado en (x, y) con escala opcional.
  function draw(ctx, sp, x, y, sx, sy) {
    sx = sx == null ? 1 : sx;
    sy = sy == null ? sx : sy;
    const w = sp.w * sx, h = sp.h * sy;
    ctx.drawImage(sp.c, x - w / 2, y - h / 2, w, h);
  }
  // Miniatura para las pantallas (tabla de puntos de la portada)
  function thumb(canvas, kind, cssSize) {
    const dpr = Math.min(2, root.devicePixelRatio || 1), k = (cssSize / 30) * dpr * 1.6;
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    const g = canvas.getContext("2d");
    const sp = kind === "ufo" ? sprite(k, 46, 26, (gg, s) => saucer(gg, s, 0))
      : kind === "a" ? sprite(k, 30, 30, (gg, s) => sentinel(gg, s, 0)) : kind === "b" ? sprite(k, 34, 30, (gg, s) => beetle(gg, s, 2)) : sprite(k, 30, 32, (gg, s) => jelly(gg, s, 1));
    const scale = Math.min(canvas.width / sp.c.width, canvas.height / sp.c.height) * (kind === "ufo" ? 1.25 : 1.15);
    const w = sp.c.width * scale, h = sp.c.height * scale;
    g.drawImage(sp.c, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    if (kind === "a") {
      const e = sprite(k, 9, 9, eye), s2 = scale;
      g.drawImage(e.c, canvas.width / 2 - (e.c.width * s2) / 2, canvas.height / 2 + 1.0 * k * s2 - (e.c.height * s2) / 2, e.c.width * s2, e.c.height * s2);
    }
  }

  (root.Enjambre = root.Enjambre || {}).arte = { FRAMES, QUEEN_FRAMES, PAL, POWER_COLORS, build, draw, thumb };
})(typeof window !== "undefined" ? window : globalThis);
