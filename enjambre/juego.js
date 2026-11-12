/* Enjambre: interfaz. Bucle de juego, dibujo con brillo, controles (teclado, ratón, táctil y mando),
   sonido, idiomas, accesibilidad y pantallas. El motor (motor.js) no sabe nada de todo esto. */
(function () {
  "use strict";
  const E = window.Enjambre, M = E.motor, ART = E.arte, SND = E.sonido;
  const W = M.W, H = M.H, PY = M.PY, TAU = Math.PI * 2, NO_INPUT = { move: 0, target: null, fire: false };
  const $ = id => document.getElementById(id);
  const app = $("app"), cv = $("game"), hud = $("hud");
  const ctx = cv.getContext("2d", { alpha: false, desynchronized: true }) || cv.getContext("2d");
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const raw = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const onMq = (mq, fn) => (mq.addEventListener ? mq.addEventListener("change", fn) : mq.addListener && mq.addListener(fn));
  const mqReduce = matchMedia("(prefers-reduced-motion: reduce)"), mqCoarse = matchMedia("(pointer: coarse)");
  let reduced = mqReduce.matches;
  onMq(mqReduce, e => { reduced = e.matches; });

  // ---------- idiomas ----------
  const NB = " ";
  const I18N = {
    es: {
      title: "Enjambre", tagline: "Un enjambre alienígena desciende sobre el planeta. Abátelo antes de que llegue a tu nave.",
      play: "Jugar", menu: "Menú", score: "Puntos", wave: "Oleada", lives: "Vidas", best: "Récord", sound: "Sonido", pause: "Pausa",
      paused: "Pausa", resume: "Continuar", restart: "Reiniciar", again: "Jugar otra vez", lang: "Idioma", field: "Campo de batalla",
      tableLabel: "Puntos por enemigo", nameA: "Vigía", nameB: "Escarabajo", nameC: "Medusa", nameUfo: "Platillo",
      over: "Fin de la partida", invaded: "¡Invasión!", newBest: "¡Nuevo récord!",
      statWave: "Oleada", statAcc: "Precisión", statKills: "Abatidos", statMult: "Mejor racha",
      overSub: (w, t) => `Llegaste a la oleada ${w} en ${t}.`,
      keys: "Teclado", mouse: "Ratón", touch: "Táctil", pad: "Mando", space: "Espacio",
      kMove: "mover", kFire: "disparar", kPause: "pausa",
      mouseHow: "mueve la nave; mantén pulsado para disparar", touchHow: "desliza en cualquier parte; disparas mientras tocas",
      padHow: "stick o cruceta para mover, A para disparar",
      waveN: n => `Oleada ${n}`, boss: "¡Jefe!", queen: "Reina del enjambre",
      formation: { wedge: "Cuña", wall: "Muralla", diamond: "Rombo", checker: "Tablero", wings: "Alas", boss: "Reina del enjambre" },
      cleared: "¡Oleada superada!", flawless: "Sin daños ×2", bonus: "Bonificación",
      power: { rapid: "Disparo rápido", spread: "Disparo triple", shield: "Escudo", life: "Vida extra" },
      danger: "¡Peligro!", touchHint: "Desliza para mover · disparo automático", lifeUp: "+1 vida",
      sayWave: (n, f) => `Oleada ${n}: ${f}.`, sayBoss: n => `Oleada ${n}: llega la reina del enjambre.`,
      sayHit: l => (l === 1 ? "Te han dado. Te queda 1 vida." : `Te han dado. Te quedan ${l} vidas.`),
      sayInvaded: l => `El enjambre ha llegado a tu fila. ${l === 1 ? "Te queda 1 vida." : `Te quedan ${l} vidas.`}`,
      sayClear: (n, b) => `Oleada ${n} superada. Bonificación de ${b} puntos.`,
      sayPower: p => `Mejora: ${p}.`, sayLife: "Vida extra.", sayDanger: "Peligro: el enjambre está muy cerca.",
      sayOver: (s, w) => `Fin de la partida. ${s} puntos, oleada ${w}.`, sayBossDown: "¡Has derrotado a la reina!",
      sayPaused: "Juego en pausa.", livesAria: n => (n === 1 ? "1 vida" : `${n} vidas`)
    },
    en: {
      title: "Swarm", tagline: "An alien swarm is descending on the planet. Shoot it down before it reaches your ship.",
      play: "Play", menu: "Menu", score: "Score", wave: "Wave", lives: "Lives", best: "Best", sound: "Sound", pause: "Pause",
      paused: "Paused", resume: "Resume", restart: "Restart", again: "Play again", lang: "Language", field: "Battlefield",
      tableLabel: "Points per enemy", nameA: "Sentinel", nameB: "Beetle", nameC: "Jellyfish", nameUfo: "Saucer",
      over: "Game over", invaded: "Invasion!", newBest: "New best!",
      statWave: "Wave", statAcc: "Accuracy", statKills: "Downed", statMult: "Best streak",
      overSub: (w, t) => `You reached wave ${w} in ${t}.`,
      keys: "Keyboard", mouse: "Mouse", touch: "Touch", pad: "Gamepad", space: "Space",
      kMove: "move", kFire: "fire", kPause: "pause",
      mouseHow: "move the ship; hold the button to fire", touchHow: "swipe anywhere; you fire while touching",
      padHow: "stick or d-pad to move, A to fire",
      waveN: n => `Wave ${n}`, boss: "Boss!", queen: "Swarm queen",
      formation: { wedge: "Wedge", wall: "Wall", diamond: "Diamond", checker: "Checkerboard", wings: "Wings", boss: "Swarm queen" },
      cleared: "Wave cleared!", flawless: "Flawless ×2", bonus: "Bonus",
      power: { rapid: "Rapid fire", spread: "Triple shot", shield: "Shield", life: "Extra life" },
      danger: "Danger!", touchHint: "Swipe to move · auto-fire", lifeUp: "+1 life",
      sayWave: (n, f) => `Wave ${n}: ${f}.`, sayBoss: n => `Wave ${n}: the swarm queen is coming.`,
      sayHit: l => (l === 1 ? "You were hit. 1 life left." : `You were hit. ${l} lives left.`),
      sayInvaded: l => `The swarm reached your row. ${l === 1 ? "1 life left." : `${l} lives left.`}`,
      sayClear: (n, b) => `Wave ${n} cleared. ${b} bonus points.`,
      sayPower: p => `Power-up: ${p}.`, sayLife: "Extra life.", sayDanger: "Danger: the swarm is very close.",
      sayOver: (s, w) => `Game over. ${s} points, wave ${w}.`, sayBossDown: "You defeated the queen!",
      sayPaused: "Game paused.", livesAria: n => (n === 1 ? "1 life" : `${n} lives`)
    },
    fr: {
      title: "Essaim", tagline: "Un essaim extraterrestre descend sur la planète. Abats-le avant qu’il n’atteigne ton vaisseau.",
      play: "Jouer", menu: "Menu", score: "Score", wave: "Vague", lives: "Vies", best: "Record", sound: "Son", pause: "Pause",
      paused: "Pause", resume: "Reprendre", restart: "Recommencer", again: "Rejouer", lang: "Langue", field: "Champ de bataille",
      tableLabel: "Points par ennemi", nameA: "Sentinelle", nameB: "Scarabée", nameC: "Méduse", nameUfo: "Soucoupe",
      over: "Partie terminée", invaded: `Invasion${NB}!`, newBest: `Nouveau record${NB}!`,
      statWave: "Vague", statAcc: "Précision", statKills: "Abattus", statMult: "Meilleure série",
      overSub: (w, t) => `Tu as atteint la vague ${w} en ${t}.`,
      keys: "Clavier", mouse: "Souris", touch: "Tactile", pad: "Manette", space: "Espace",
      kMove: "bouger", kFire: "tirer", kPause: "pause",
      mouseHow: `déplace le vaisseau${NB}; maintiens le bouton pour tirer`, touchHow: `glisse n’importe où${NB}; tu tires tant que tu touches`,
      padHow: "stick ou croix pour bouger, A pour tirer",
      waveN: n => `Vague ${n}`, boss: `Boss${NB}!`, queen: "Reine de l’essaim",
      formation: { wedge: "Coin", wall: "Muraille", diamond: "Losange", checker: "Damier", wings: "Ailes", boss: "Reine de l’essaim" },
      cleared: `Vague terminée${NB}!`, flawless: "Sans dégâts ×2", bonus: "Bonus",
      power: { rapid: "Tir rapide", spread: "Tir triple", shield: "Bouclier", life: "Vie supplémentaire" },
      danger: `Danger${NB}!`, touchHint: "Glisse pour bouger · tir automatique", lifeUp: "+1 vie",
      sayWave: (n, f) => `Vague ${n}${NB}: ${f}.`, sayBoss: n => `Vague ${n}${NB}: la reine de l’essaim arrive.`,
      sayHit: l => (l === 1 ? "Tu es touché. Il te reste 1 vie." : `Tu es touché. Il te reste ${l} vies.`),
      sayInvaded: l => `L’essaim a atteint ta rangée. ${l === 1 ? "Il te reste 1 vie." : `Il te reste ${l} vies.`}`,
      sayClear: (n, b) => `Vague ${n} terminée. Bonus de ${b} points.`,
      sayPower: p => `Bonus${NB}: ${p}.`, sayLife: "Vie supplémentaire.", sayDanger: `Danger${NB}: l’essaim est tout proche.`,
      sayOver: (s, w) => `Partie terminée. ${s} points, vague ${w}.`, sayBossDown: `Tu as vaincu la reine${NB}!`,
      sayPaused: "Jeu en pause.", livesAria: n => (n === 1 ? "1 vie" : `${n} vies`)
    }
  };
  function pickLang() {
    for (const c of [store.get("enjambre:idioma", null), raw("juegos:idioma")]) if (I18N[c]) return c;
    for (const l of navigator.languages || [navigator.language || ""]) {
      const b = String(l).slice(0, 2).toLowerCase();
      if (I18N[b]) return b;
    }
    return "es";
  }
  let lang = pickLang();
  const T = k => I18N[lang][k];
  const fmt = n => Math.round(n).toLocaleString(lang);
  const fmtTime = s => { const m = Math.floor(s / 60), r = Math.floor(s % 60); return m ? `${m} min ${r} s` : `${r} s`; };

  // ---------- ajustes guardados ----------
  let best = Number(store.get("enjambre:record", 0)) || 0;
  let soundOn = store.get("enjambre:sonido", true) !== false;
  SND.setOn(soundOn);

  // ---------- lienzo y escala ----------
  // fs: píxeles CSS por unidad lógica; K: píxeles del dispositivo por unidad lógica; (ox, oy): esquina del campo.
  let cssW = 1, cssH = 1, dpr = 1, fs = 1, ox = 0, oy = 0, K = 1, spr = null, planet = null;
  // Calidad adaptativa: si el dispositivo no mantiene la fluidez, se baja la resolución interna una vez.
  let quality = 1, slowFrames = 0;
  function resize() {
    cssW = Math.max(1, app.clientWidth);
    cssH = Math.max(1, app.clientHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2) * quality;
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    const side = getComputedStyle(hud).flexDirection === "column";
    const top = side ? 6 : hud.getBoundingClientRect().bottom - app.getBoundingClientRect().top;
    const availH = Math.max(200, cssH - top - 6);
    fs = Math.min(cssW / W, availH / H);
    ox = (cssW - W * fs) / 2;
    oy = top + Math.max(0, (availH - H * fs) * 0.3);
    K = fs * dpr;
    app.style.setProperty("--hudW", Math.round(Math.max(W * fs, Math.min(cssW, 600))) + "px");
    if (!spr || Math.abs(spr.k / K - 1) > 0.04) spr = ART.build(K);
    barrierCache = new WeakMap();
    neb.cur = paintNebula(neb.pal < 0 ? 0 : neb.pal);
    neb.old = null;
    planet = paintPlanet();
    makeStars();
  }

  // ---------- fondo: nebulosa, estrellas y el planeta que defiendes ----------
  const NEBULA = [
    ["rgba(124,58,237,.34)", "rgba(34,211,238,.16)", "rgba(236,72,153,.2)"],
    ["rgba(20,184,166,.26)", "rgba(59,130,246,.26)", "rgba(168,85,247,.18)"],
    ["rgba(219,39,119,.26)", "rgba(249,115,22,.14)", "rgba(99,102,241,.24)"],
    ["rgba(132,204,22,.15)", "rgba(79,70,229,.3)", "rgba(6,182,212,.18)"],
    ["rgba(225,29,72,.3)", "rgba(126,34,206,.32)", "rgba(251,146,60,.14)"]
  ];
  const neb = { cur: null, old: null, mix: 1, pal: -1, y: 0 };
  function paintNebula(pal) {
    const w = Math.max(48, Math.ceil(cssW / 4)), h = Math.max(48, Math.ceil(cssH / 4)) * 2;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d"), cols = NEBULA[pal] || NEBULA[0];
    g.fillStyle = "#07061a";
    g.fillRect(0, 0, w, h);
    let seed = pal * 7919 + 17;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 8; i++) {
      const x = rnd() * w, y = rnd() * h, r = (0.22 + rnd() * 0.4) * Math.max(w, h / 2), col = cols[i % cols.length];
      for (const dy of [-h, 0, h]) {
        const grd = g.createRadialGradient(x, y + dy, 0, x, y + dy, r);
        grd.addColorStop(0, col); grd.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grd;
        g.fillRect(x - r, y + dy - r, r * 2, r * 2);
      }
    }
    return c;
  }
  function setNebula(wave) {
    const pal = M.isBoss(wave) ? 4 : (wave - 1) % 4;
    if (pal === neb.pal) return;
    neb.pal = pal;
    neb.old = neb.cur;
    neb.cur = paintNebula(pal);
    neb.mix = neb.old ? 0 : 1;
  }
  function paintPlanet() {
    const horizon = oy + (PY + 30) * fs, top = Math.max(0, horizon - 50 * fs), hgt = cssH - top;
    if (hgt <= 2) return null;
    const c = document.createElement("canvas");
    c.width = Math.ceil(cssW * dpr); c.height = Math.ceil(hgt * dpr);
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    g.translate(0, -top);
    const cx = cssW / 2, R = 1100 * fs, cy = horizon + R;
    const atm = g.createRadialGradient(cx, cy, R - 3 * fs, cx, cy, R + 48 * fs);
    atm.addColorStop(0, "rgba(56,189,248,.42)"); atm.addColorStop(0.22, "rgba(56,189,248,.14)"); atm.addColorStop(1, "rgba(56,189,248,0)");
    g.fillStyle = atm;
    g.fillRect(0, top, cssW, hgt);
    const body = g.createLinearGradient(0, horizon, 0, horizon + 140 * fs);
    body.addColorStop(0, "#0f2c52"); body.addColorStop(0.5, "#08162e"); body.addColorStop(1, "#040915");
    g.fillStyle = body;
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
    // luces de ciudades en la cara nocturna
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) {
      const dx = (rnd() - 0.5) * cssW, depth = 8 + rnd() * 120 * fs, y = cy - Math.sqrt(Math.max(0, R * R - dx * dx)) + depth;
      g.fillStyle = `rgba(255,${190 + Math.floor(rnd() * 50)},120,${(0.18 + rnd() * 0.35).toFixed(2)})`;
      g.fillRect(cx + dx, y, 1.2, 1.2);
    }
    g.save();
    g.strokeStyle = "rgba(165,230,255,.9)";
    g.lineWidth = Math.max(1, 1.3 * fs);
    g.shadowColor = "#38bdf8";
    g.shadowBlur = 10 * fs * dpr;
    g.beginPath(); g.arc(cx, cy, R, Math.PI, TAU); g.stroke();
    g.restore();
    return { c, top, h: hgt };
  }
  let stars = [];
  function makeStars() {
    const area = clamp((cssW * cssH) / (420 * 860), 0.8, 2.6);
    const layers = [{ n: 100, sp: 7, s: [0.5, 1.1], a: [0.25, 0.6] }, { n: 46, sp: 16, s: [0.9, 1.6], a: [0.4, 0.8] }, { n: 16, sp: 34, s: [1.4, 2.2], a: [0.7, 1] }];
    const tints = ["#ffffff", "#cfe8ff", "#ffe4f6", "#d9fff5"];
    stars = [];
    layers.forEach((L, li) => {
      for (let i = 0; i < Math.round(L.n * area); i++) {
        stars.push({ x: Math.random() * cssW, y: Math.random() * cssH, l: li, sp: L.sp * rand(0.8, 1.2), s: rand(L.s[0], L.s[1]), a: rand(L.a[0], L.a[1]), tw: Math.random() * TAU, tws: rand(1, 3.5), c: tints[i % 4] });
      }
    });
  }

  // ---------- partículas y efectos ----------
  // Tipos: 0 chispa (brillo aditivo), 1 esquirla, 2 onda, 3 destello, 4 texto flotante.
  const P = [], MAXP = 900, pending = [];
  let trauma = 0, shakeX = 0, shakeY = 0, flashA = 0, slowT = 0, beatPulse = 0, warpCur = 1, muzzle = 0, shipBank = 0, tNow = 0;
  const TYPE_FX = { a: { g: "magenta", c: "#ff9be9" }, b: { g: "cyan", c: "#7dedfb" }, c: { g: "lime", c: "#c8f56a" } };
  const POWER_FX = { rapid: "orange", spread: "magenta", shield: "cyan", life: "red" };
  const add = p => { if (P.length < MAXP) P.push(p); };
  const many = n => Math.max(1, Math.round(n * (reduced ? 0.4 : 1)));
  function sparks(x, y, g, n, sp, life, size, vy0) {
    for (let i = many(n); i--;) {
      const a = Math.random() * TAU, v = sp * rand(0.3, 1);
      add({ k: 0, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + (vy0 || 0), life: life * rand(0.6, 1), max: life, size: size * rand(0.6, 1.2), g, drag: 3 });
    }
  }
  function debris(x, y, c, n, sp) {
    for (let i = many(n); i--;) {
      const a = Math.random() * TAU, v = sp * rand(0.3, 1);
      add({ k: 1, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.4, 0.8), max: 0.8, size: rand(1.2, 2.6), c, rot: Math.random() * TAU, vr: rand(-12, 12), drag: 2.2 });
    }
  }
  const ring = (x, y, c, r0, r1, life, width) => add({ k: 2, x, y, r0, r1, c, width: width || 1.5, life, max: life });
  const flash = (x, y, g, size, life) => add({ k: 3, x, y, g, size, life, max: life });
  const popup = (x, y, text, c, size, life) => add({ k: 4, x, y, vy: -28, text, c, size: size || 9, life: life || 0.9, max: life || 0.9 });
  const later = (t, fn) => pending.push({ t, fn });
  const shake = v => { if (!reduced) trauma = Math.min(1, trauma + v); };
  function alienBoom(x, y, type, big) {
    const fx = TYPE_FX[type] || TYPE_FX.c;
    flash(x, y, fx.g, big ? 2.4 : 1.6, 0.24);
    flash(x, y, "white", 0.7, 0.12);
    sparks(x, y, fx.g, 14, 130, 0.5, 0.3);
    sparks(x, y, "white", 5, 90, 0.3, 0.18);
    debris(x, y, fx.c, 8, 95);
    ring(x, y, fx.c, 4, 22, 0.35, 1.6);
  }
  function bigBoom(x, y, g, c, scale) {
    flash(x, y, g, 4 * scale, 0.5);
    flash(x, y, "white", 2 * scale, 0.25);
    sparks(x, y, g, 36 * scale, 220 * scale, 0.9, 0.38);
    sparks(x, y, "gold", 16 * scale, 160 * scale, 0.7, 0.3);
    debris(x, y, c, 22 * scale, 160 * scale);
    ring(x, y, c, 6, 70 * scale, 0.6, 2.6);
    ring(x, y, "#ffffff", 4, 40 * scale, 0.4, 1.2);
  }

  // ---------- estado de la partida ----------
  let mode = "title";            // title | play | paused | over
  let S = null;                  // la partida
  let demo = null, demoOverT = 0; // partida de demostración que se ve detrás de la portada
  let overT = 0, overShown = false, lastOver = null, dangerSaid = false, firstGame = true, hintT = 0, playTime = 0;
  const cur = () => (mode === "title" ? demo : S);

  // ---------- entrada: teclado, ratón, táctil y mando ----------
  const held = new Set();
  const input = { move: 0, target: null, fire: false };
  const ptr = { mode: "keys", mouseX: null, mouseFire: false, touches: new Map(), primary: null, anchorX: 0, anchorShip: W / 2, target: null };
  const KEYMAP = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", Space: "fire", ArrowUp: "fire", KeyW: "fire", KeyZ: "fire", KeyK: "fire", KeyJ: "fire" };
  const SENS = 1.35;
  let lastPad = null, padStartPrev = false, padAPrev = false, padSeen = false;
  const isHeld = act => { for (const c of held) if (KEYMAP[c] === act) return true; return false; };
  const toLogicalX = clientX => (clientX - cv.getBoundingClientRect().left - ox) / fs;
  function setPtrMode(m) {
    if (ptr.mode === m) return;
    ptr.mode = m;
    app.classList.toggle("mouse", m === "mouse");
  }
  function releaseAll() {
    held.clear();
    ptr.mouseFire = false;
    ptr.touches.clear();
    ptr.primary = null;
    ptr.target = null;
  }
  window.addEventListener("keydown", e => {
    const inControl = e.target && e.target.closest && e.target.closest("button, a, input, select, textarea");
    const act = KEYMAP[e.code];
    if (act && mode === "play" && !(inControl && (e.code === "Space" || e.code === "Enter"))) {
      held.add(e.code);
      setPtrMode("keys");
      e.preventDefault();
      return;
    }
    if (e.repeat) return;
    if (e.code === "KeyP" || e.code === "Escape") {
      if (mode === "play") { pause(); e.preventDefault(); } else if (mode === "paused") { resume(); e.preventDefault(); }
    } else if (e.code === "KeyM") toggleSound();
    else if ((e.code === "Enter" || e.code === "Space") && !inControl && (mode === "title" || (mode === "over" && overShown))) {
      e.preventDefault();
      startGame();
    }
  });
  window.addEventListener("keyup", e => { held.delete(e.code); });
  cv.addEventListener("contextmenu", e => e.preventDefault());
  cv.addEventListener("pointerdown", e => {
    SND.init();
    const x = toLogicalX(e.clientX);
    if (e.pointerType === "mouse") {
      if (e.button !== 0) return;
      setPtrMode("mouse");
      ptr.mouseX = x;
      ptr.mouseFire = true;
    } else {
      setPtrMode("touch");
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      ptr.touches.set(e.pointerId, x);
      if (ptr.primary == null) {
        ptr.primary = e.pointerId;
        ptr.anchorX = x;
        ptr.anchorShip = S ? S.player.x : W / 2;
        ptr.target = ptr.anchorShip;
      }
    }
    if (mode === "play") e.preventDefault();
  });
  cv.addEventListener("pointermove", e => {
    const x = toLogicalX(e.clientX);
    if (e.pointerType === "mouse") {
      ptr.mouseX = x;
      if (mode === "play" && (e.movementX || e.movementY)) setPtrMode("mouse");
      return;
    }
    if (!ptr.touches.has(e.pointerId)) return;
    ptr.touches.set(e.pointerId, x);
    if (e.pointerId !== ptr.primary) return;
    // Arrastre relativo: el dedo no tapa la nave. Si la nave choca con el borde, el ancla se mueve con el dedo.
    const t = ptr.anchorShip + (x - ptr.anchorX) * SENS, c = clamp(t, 16, W - 16);
    if (c !== t) { ptr.anchorShip = c; ptr.anchorX = x; }
    ptr.target = c;
  });
  function endPointer(e) {
    if (e.pointerType === "mouse") { ptr.mouseFire = false; return; }
    ptr.touches.delete(e.pointerId);
    if (e.pointerId !== ptr.primary) return;
    ptr.primary = null;
    ptr.target = null;
    const next = ptr.touches.entries().next();
    if (!next.done) {
      ptr.primary = next.value[0];
      ptr.anchorX = next.value[1];
      ptr.anchorShip = S ? S.player.x : W / 2;
      ptr.target = ptr.anchorShip;
    }
  }
  window.addEventListener("pointerup", endPointer);
  window.addEventListener("pointercancel", endPointer);

  function pollPad() {
    const out = { move: 0, fire: false };
    if (!navigator.getGamepads) return out;
    let start = false, a = false;
    let pads = [];
    try { pads = navigator.getGamepads() || []; } catch (err) { return out; }
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const btn = i => !!(p.buttons[i] && p.buttons[i].pressed);
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.2) out.move = Math.sign(ax) * clamp((Math.abs(ax) - 0.2) / 0.65, 0, 1);
      if (btn(14)) out.move = -1;
      if (btn(15)) out.move = 1;
      if (btn(0) || btn(1) || btn(2) || btn(3) || btn(5) || btn(7)) out.fire = true;
      if (btn(0)) a = true;
      if (btn(9)) start = true;
      if (out.move || out.fire || start) { lastPad = p; if (!padSeen) { padSeen = true; buildHow($("howTitle")); buildHow($("howPause")); } }
    }
    const canStart = mode === "title" || (mode === "over" && overShown);
    if (start && !padStartPrev) {
      if (mode === "play") pause(); else if (mode === "paused") resume(); else if (canStart) startGame();
    } else if (a && !padAPrev) {
      if (mode === "paused") resume(); else if (canStart) startGame();
    }
    padStartPrev = start;
    padAPrev = a;
    if (out.move || out.fire) setPtrMode("pad");
    return out;
  }
  function readInput() {
    const pad = pollPad();
    const k = (isHeld("right") ? 1 : 0) - (isHeld("left") ? 1 : 0);
    input.fire = isHeld("fire") || pad.fire || ptr.mouseFire || ptr.touches.size > 0;
    input.target = null;
    input.move = 0;
    if (ptr.primary != null && ptr.target != null) input.target = ptr.target;
    else if (k) input.move = k;
    else if (pad.move) input.move = pad.move;
    else if (ptr.mode === "mouse" && ptr.mouseX != null) input.target = clamp(ptr.mouseX, 16, W - 16);
    return input;
  }

  // Piloto automático de la demostración: esquiva lo que le cae encima y apunta con adelanto.
  const demoIn = { move: 0, target: null, fire: false };
  function demoInput(D) {
    const p = D.player, G = D.grid;
    demoIn.fire = false;
    demoIn.move = 0;
    for (const b of D.bombs) {
      const tt = (PY - b.y) / (b.vy || 1);
      if (tt > 0 && tt < 0.55 && Math.abs(b.x + b.vx * tt - p.x) < 17) {
        demoIn.move = p.x > W - 40 ? -1 : p.x < 40 ? 1 : b.x < p.x ? 1 : -1;
        demoIn.fire = true;
        return demoIn;
      }
    }
    let tx = null, bestD = Infinity;
    if (D.boss) tx = W / 2 + Math.sin((D.boss.t + (PY - 16 - D.boss.y) / 560) * 0.7) * 110;
    else {
      const lead = M.gridSpeed(D) * G.dir;
      for (const a of G.cells) {
        if (!a.alive) continue;
        const ax = M.alienX(D, a) + lead * ((PY - M.alienY(D, a)) / 560), d = Math.abs(ax - p.x) - a.row * 5;
        if (d < bestD) { bestD = d; tx = ax; }
      }
    }
    if (tx == null) return demoIn;
    const dx = tx - p.x;
    demoIn.move = Math.abs(dx) < 2 ? 0 : clamp(dx / 22, -1, 1);
    demoIn.fire = Math.abs(dx) < 10;
    return demoIn;
  }

  // ---------- pantallas ----------
  const screens = { title: $("scrTitle"), pause: $("scrPause"), over: $("scrOver") };
  function show(name) {
    for (const k in screens) screens[k].hidden = k !== name;
    hud.classList.toggle("off", name === "title");
    app.classList.toggle("playing", name == null);
  }
  const liveEl = $("live");
  let sayTimer = 0;
  function say(msg) {
    clearTimeout(sayTimer);
    liveEl.textContent = "";
    sayTimer = setTimeout(() => { liveEl.textContent = msg; }, 50);
  }
  function vibrate(pattern) {
    if (ptr.mode === "touch" && navigator.vibrate) { try { navigator.vibrate(pattern); } catch (err) {} }
    const act = ptr.mode === "pad" && lastPad && lastPad.vibrationActuator;
    if (act && act.playEffect) act.playEffect("dual-rumble", { duration: 180, strongMagnitude: 0.7, weakMagnitude: 0.4 }).catch(() => {});
  }
  function toggleSound() {
    soundOn = !soundOn;
    store.set("enjambre:sonido", soundOn);
    SND.setOn(soundOn);
    if (soundOn) SND.init();
    $("btnSound").setAttribute("aria-pressed", String(soundOn));
  }
  function blurFocus() { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); }
  function startGame() {
    SND.init();
    SND.ufoStop();
    S = M.create();
    mode = "play";
    overT = 0; overShown = false; lastOver = null; dangerSaid = false; playTime = 0; shownScore = 0;
    P.length = 0; pending.length = 0; trauma = 0; flashA = 0; slowT = 0; banner = null;
    hintT = mqCoarse.matches && firstGame ? 7 : 0;
    firstGame = false;
    show(null);
    blurFocus();
    handleEvents(S, true);
    updateHud(true, 0);
  }
  function pause() {
    if (mode !== "play") return;
    mode = "paused";
    pausedDrawn = false;
    releaseAll();
    show("pause");
    SND.suspend();
    $("btnResume").focus({ preventScroll: true });
    say(T("sayPaused"));
  }
  function resume() {
    if (mode !== "paused") return;
    mode = "play";
    show(null);
    SND.resume();
    lastFrame = performance.now();
    blurFocus();
  }
  function gameOver(invaded) {
    mode = "over";
    overT = 1;
    overShown = false;
    SND.ufoStop();
    releaseAll();
    const isBest = S.score > best && S.score > 0;
    if (isBest) { best = S.score; store.set("enjambre:record", best); }
    lastOver = { invaded, isBest };
  }
  function fillOver() {
    if (!S || !lastOver) return;
    $("overTtl").textContent = lastOver.invaded ? T("invaded") : T("over");
    $("finalScore").textContent = fmt(S.score);
    $("newBest").hidden = !lastOver.isBest;
    $("overSub").textContent = T("overSub")(S.wave, fmtTime(playTime));
    $("stWave").textContent = S.wave;
    const acc = S.stats.bullets ? Math.min(1, S.stats.hits / S.stats.bullets) : 0;
    $("stAcc").textContent = acc.toLocaleString(lang, { style: "percent", maximumFractionDigits: 0 });
    $("stKills").textContent = fmt(S.stats.kills);
    $("stMult").textContent = "×" + S.stats.maxMult;
  }
  function showOver() {
    overShown = true;
    fillOver();
    show("over");
    SND.gameOver();
    $("btnAgain").focus({ preventScroll: true });
    say(T("sayOver")(fmt(S.score), S.wave));
  }

  // ---------- eventos del motor: sonido, partículas y avisos ----------
  function handleEvents(G, live) {
    const evs = G.events;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      switch (e.t) {
        case "shot":
          muzzle = 0.07;
          if (live) SND.shot(e.x, e.spread, e.rapid);
          break;
        case "kill": {
          const fx = () => {
            alienBoom(e.x, e.y, e.type, e.armor);
            popup(e.x, e.y - 6, "+" + e.pts, TYPE_FX[e.type].c, e.pts >= 60 ? 11 : 9);
            if (live) SND.kill(e.type, e.x);
          };
          if (e.delay) later(e.delay, fx); else fx();
          break;
        }
        case "armorHit":
          sparks(e.x, e.y, "gold", 8, 110, 0.35, 0.24);
          ring(e.x, e.y, "#fcd34d", 6, 16, 0.25, 1.2);
          if (live) SND.armor(e.x);
          break;
        case "chip":
          debris(e.x, e.y, "#67e8f9", 3, 50);
          sparks(e.x, e.y, "cyan", 3, 60, 0.25, 0.18);
          if (live) SND.chip(e.x);
          break;
        case "clash":
          sparks(e.x, e.y, "white", 6, 120, 0.3, 0.2);
          flash(e.x, e.y, "gold", 0.8, 0.12);
          if (live) SND.clash(e.x);
          break;
        case "absorb":
          ring(e.x, e.y, "#f0abfc", 3, 10, 0.2, 1);
          if (live) SND.absorb(e.x);
          break;
        case "bomb": if (live) SND.bomb(e.kind, e.x); break;
        case "ufo": if (live) SND.ufoStart(); break;
        case "ufoGone": if (live) SND.ufoStop(); break;
        case "ufoKill":
          bigBoom(e.x, e.y, "magenta", "#f9a8d4", 0.8);
          popup(e.x, e.y + 14, "+" + e.pts, "#ffd166", 13, 1.3);
          shake(0.25);
          if (live) { SND.ufoStop(); SND.ufoKill(e.x); }
          break;
        case "bossHit":
          sparks(e.x, e.y, "orange", 5, 120, 0.3, 0.22);
          flash(e.x, e.y, "orange", 0.7, 0.08);
          shake(0.02);
          if (live) SND.bossHit(e.x);
          break;
        case "bossVolley":
          flash(e.x, e.y, "magenta", 2.2, 0.25);
          if (live) SND.bossVolley();
          break;
        case "bossDie":
          for (let k = 0; k < 7; k++) later(k * 0.13, () => bigBoom(e.x + rand(-40, 40), e.y + rand(-16, 16), k % 2 ? "magenta" : "orange", "#f5d0fe", 0.6));
          later(0.95, () => { bigBoom(e.x, e.y, "violet", "#f5d0fe", 1.6); flashA = reduced ? 0.2 : 0.7; shake(1); });
          popup(e.x, e.y + 30, "+" + fmt(e.pts), "#ffd166", 16, 2);
          slowT = 0.6;
          shake(0.5);
          if (live) { SND.bossDie(); say(T("sayBossDown")); }
          break;
        case "playerHit":
          bigBoom(e.x, e.y, "cyan", "#a5f3fc", 1);
          debris(e.x, e.y, "#e2e8f0", 14, 180);
          shake(0.75);
          slowT = 0.45;
          flashA = reduced ? 0.12 : 0.35;
          if (live) {
            SND.playerHit();
            vibrate([60, 40, 120]);
            if (e.lives > 0) say(e.invaded ? T("sayInvaded")(e.lives) : T("sayHit")(e.lives));
          }
          break;
        case "shieldPop":
          ring(e.x, e.y, "#67e8f9", 8, 34, 0.4, 2);
          sparks(e.x, e.y, "cyan", 16, 150, 0.45, 0.26);
          if (live) { SND.shieldPop(); vibrate(40); }
          break;
        case "respawn":
          ring(G.player.x, PY, "#67e8f9", 30, 4, 0.5, 2);
          if (live) {
            SND.respawn();
            if (ptr.primary != null) { ptr.anchorShip = G.player.x; ptr.anchorX = ptr.touches.get(ptr.primary); ptr.target = G.player.x; }
          }
          break;
        case "power": {
          const c = ART.POWER_COLORS[e.kind], name = T("power")[e.kind];
          ring(e.x, e.y, c, 6, 30, 0.45, 2);
          sparks(e.x, e.y, POWER_FX[e.kind], 14, 120, 0.5, 0.26);
          popup(e.x, e.y - 14, name, c, 9, 1.2);
          if (live) { SND.power(e.kind); say(T("sayPower")(name)); }
          break;
        }
        case "life":
          popup(G.player.x, PY - 26, T("lifeUp"), "#fb7185", 10, 1.4);
          if (live) { SND.life(); say(T("sayLife")); }
          break;
        case "mult":
          popup(G.player.x, PY - 30, "×" + e.mult, "#ffd166", 12, 0.9);
          if (live) { SND.mult(e.mult); multBump = true; }
          break;
        case "multLost": if (live) SND.multLost(); break;
        case "waveStart":
          setNebula(e.wave);
          banner = { kind: "wave", t: 0, wave: e.wave, boss: e.boss, formation: e.formation };
          dangerSaid = false;
          if (live) {
            SND.waveStart(e.boss);
            if (e.boss) SND.bossArrive();
            say(e.boss ? T("sayBoss")(e.wave) : T("sayWave")(e.wave, T("formation")[e.formation]));
          }
          break;
        case "waveClear":
          banner = { kind: "clear", t: 0, bonus: e.bonus, flawless: e.flawless };
          if (live) { SND.waveClear(e.flawless); say(T("sayClear")(e.wave, fmt(e.bonus))); }
          break;
        case "beat":
          beatPulse = 1;
          if (live) SND.beat(e.n, e.speed, danger);
          break;
        case "gameOver":
          if (live) gameOver(e.invaded); else demoOverT = 2.5;
          break;
      }
    }
    evs.length = 0;
  }

  // ---------- dibujo ----------
  let barrierCache = new WeakMap(), banner = null, danger = false, multBump = false, pausedDrawn = false, lastFrame = performance.now();
  let testAuto = false, shownScore = 0, hudCache = {}, fieldTx = 0, fieldTy = 0, railGrad = null, bossGrad = null, dangerGrad = null;
  function makeGradients() {
    railGrad = ctx.createLinearGradient(0, 18, 0, PY + 30);
    railGrad.addColorStop(0, "rgba(63,240,255,.45)"); railGrad.addColorStop(0.6, "rgba(63,240,255,.12)"); railGrad.addColorStop(1, "rgba(63,240,255,0)");
    bossGrad = ctx.createLinearGradient((W - 200) / 2, 0, (W + 200) / 2, 0);
    bossGrad.addColorStop(0, "#e879f9"); bossGrad.addColorStop(1, "#fb923c");
    dangerGrad = ctx.createLinearGradient(0, PY - 140, 0, H);
    dangerGrad.addColorStop(0, "rgba(255,40,80,0)"); dangerGrad.addColorStop(1, "rgba(255,40,80,.35)");
  }
  function drawBackground(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    neb.y = (neb.y + dt * 6 * warpCur * (reduced ? 0.4 : 1)) % (cssH * 2);
    const drawNeb = (c, a) => {
      if (!c || a <= 0) return;
      ctx.globalAlpha = a;
      ctx.drawImage(c, 0, neb.y - cssH * 2, cssW, cssH * 2);
      ctx.drawImage(c, 0, neb.y, cssW, cssH * 2);
    };
    if (neb.old) {
      neb.mix = Math.min(1, neb.mix + dt / 2);
      drawNeb(neb.old, 1);
      if (neb.mix >= 1) neb.old = null;
    }
    drawNeb(neb.cur, neb.old ? neb.mix : 1);
    const streak = warpCur > 1.6 && !reduced, spd = dt * warpCur * (reduced ? 0.4 : 1) * Math.max(0.6, fs);
    for (const s of stars) {
      s.y += s.sp * spd;
      if (s.y > cssH + 4) { s.y -= cssH + 8; s.x = Math.random() * cssW; }
      ctx.globalAlpha = s.a * (0.7 + 0.3 * Math.sin(tNow * s.tws + s.tw));
      ctx.fillStyle = s.c;
      if (streak && s.l > 0) { const len = s.sp * warpCur * 0.05 * fs; ctx.fillRect(s.x, s.y - len, s.s * 0.8, len + s.s); }
      else ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
    if (planet) ctx.drawImage(planet.c, 0, planet.top, cssW, planet.h);
  }
  function drawRails() {
    if (cssW - W * fs < 24) return;
    ctx.fillStyle = railGrad;
    ctx.fillRect(-2, 18, 1, PY + 12);
    ctx.fillRect(W + 1, 18, 1, PY + 12);
    ctx.strokeStyle = "rgba(63,240,255,.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-1.5, 32); ctx.lineTo(-1.5, 18); ctx.lineTo(12, 18);
    ctx.moveTo(W + 1.5, 32); ctx.lineTo(W + 1.5, 18); ctx.lineTo(W - 12, 18);
    ctx.stroke();
  }
  function paintBarrier(b, c) {
    const g = c.getContext("2d"), CELL = M.CELL, SW = M.SW, SH = M.SH;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.setTransform(K, 0, 0, K, 6 * K, 6 * K);
    const grd = g.createLinearGradient(0, 0, 0, SH * CELL);
    grd.addColorStop(0, "#cffafe"); grd.addColorStop(0.35, "#22d3ee"); grd.addColorStop(1, "#0e7490");
    g.fillStyle = grd;
    g.shadowColor = "#22d3ee";
    g.shadowBlur = 5 * K;
    g.beginPath();
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) if (b.cells[y * SW + x]) g.rect(x * CELL + 0.25, y * CELL + 0.25, CELL - 0.5, CELL - 0.5);
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = "rgba(255,255,255,.6)";
    for (let y = 0; y < SH; y++) {
      for (let x = 0; x < SW; x++) if (b.cells[y * SW + x] && (y === 0 || !b.cells[(y - 1) * SW + x])) g.fillRect(x * CELL + 0.25, y * CELL + 0.25, CELL - 0.5, 0.8);
    }
    b.dirty = false;
  }
  function drawBarriers(G) {
    ctx.globalAlpha = 0.92 + 0.08 * Math.sin(tNow * 2.4);
    for (const b of G.barriers) {
      let c = barrierCache.get(b);
      if (!c) {
        c = document.createElement("canvas");
        c.width = Math.ceil((M.SW * M.CELL + 12) * K);
        c.height = Math.ceil((M.SH * M.CELL + 12) * K);
        barrierCache.set(b, c);
        b.dirty = true;
      }
      if (b.dirty) paintBarrier(b, c);
      ctx.drawImage(c, b.x - 6, b.y - 6, c.width / K, c.height / K);
    }
    ctx.globalAlpha = 1;
  }
  function drawAliens(G) {
    const C = G.grid, fr = ART.FRAMES, introP = G.state === "intro" ? 1.8 - G.introT : 9, px = G.player.x;
    const bump = 1 + (reduced ? 0 : beatPulse * 0.06);
    for (const a of C.cells) {
      if (!a.alive) continue;
      let x = M.alienX(G, a), y = M.alienY(G, a), alpha = 1;
      if (introP < 3) {
        const p = clamp((introP - a.row * 0.1 - Math.abs(a.col - 5) * 0.05) / 0.75, 0, 1);
        if (p <= 0) continue;
        const e = 1 - Math.pow(1 - p, 3);
        if (reduced) alpha = p;
        else { y -= (1 - e) * 320; x += (1 - e) * (a.col - 5) * 16; }
      }
      const sp = spr.alien[a.type][Math.floor(tNow * 12 + a.col * 1.3 + a.row * 0.7) % fr];
      ctx.globalAlpha = alpha;
      ART.draw(ctx, sp, x, y, bump);
      if (a.type === "a") ART.draw(ctx, spr.eye, x + clamp((px - x) / 110, -1, 1) * 1.5, y + 0.6 + clamp((PY - y) / 420, 0, 1) * 0.9, bump);
      if (a.flash > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = Math.min(1, a.flash * 8);
        ART.draw(ctx, sp, x, y, bump);
        ctx.globalCompositeOperation = "source-over";
      }
      if (a.armor && a.hp > 1) {
        ctx.globalAlpha = alpha * (0.75 + 0.25 * Math.sin(tNow * 5 + a.col));
        ART.draw(ctx, spr.armor, x, y);
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawBoss(G) {
    const B = G.boss;
    if (!B) return;
    let y = B.y;
    if (G.state === "intro") { const p = clamp((1.8 - G.introT) / 1.5, 0, 1); y -= Math.pow(1 - p, 3) * 170; }
    const hurt = B.hp <= B.max / 2, frames = hurt ? spr.queenHurtFrames : spr.queen, f = Math.floor(tNow * 8) % ART.QUEEN_FRAMES;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.32 + 0.14 * Math.sin(tNow * 3);
    ART.draw(ctx, spr.glow[hurt ? "red" : "magenta"], B.x, y, 4.2, 2.6);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ART.draw(ctx, frames[f], B.x, y);
    ART.draw(ctx, spr.bigEye, B.x + clamp((G.player.x - B.x) / 140, -1, 1) * 4, y - 1.5);
    if (B.flash > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.55;
      ART.draw(ctx, frames[f], B.x, y);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }
  function drawUfo(G) {
    const U = G.ufo;
    if (U) ART.draw(ctx, spr.saucer[Math.floor(tNow * 9) % 3], U.x, U.y + Math.sin(tNow * 3) * 1.5);
  }
  function drawPowerups(G) {
    for (const u of G.powerups) {
      const y = u.y + Math.sin(u.t * 5) * 1.5;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.5 + 0.2 * Math.sin(u.t * 8);
      ART.draw(ctx, spr.glow[POWER_FX[u.kind]], u.x, y, 1.1);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ART.draw(ctx, spr.power[u.kind], u.x, y, 1 + 0.06 * Math.sin(u.t * 7));
    }
  }
  function drawBombs(G) {
    const z = Math.floor(tNow * 18) % 2;
    for (const b of G.bombs) {
      if (b.kind === "zig") ART.draw(ctx, spr.zig[z], b.x, b.y);
      else if (b.kind === "fast") {
        const a = -Math.atan2(b.vx, b.vy), c = Math.cos(a) * K, s = Math.sin(a) * K;
        ctx.setTransform(c, s, -s, c, fieldTx + b.x * K, fieldTy + b.y * K);
        ART.draw(ctx, spr.needle, 0, -2);
        ctx.setTransform(K, 0, 0, K, fieldTx, fieldTy);
      } else {
        const s = 1 + 0.15 * Math.sin(b.ph * 2);
        ART.draw(ctx, spr.glow.magenta, b.x, b.y, 0.55 * s);
        ART.draw(ctx, spr.plasma, b.x, b.y, s);
      }
    }
  }
  function drawShots(G) {
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(34,211,238,.35)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (const s of G.shots) { ctx.moveTo(s.x, s.y + 4); ctx.lineTo(s.x - s.vx * 0.032, s.y - s.vy * 0.032); }
    ctx.stroke();
    for (const s of G.shots) {
      if (!s.vx) { ART.draw(ctx, spr.bolt, s.x, s.y); continue; }
      const a = Math.atan2(s.vx, -s.vy), c = Math.cos(a) * K, sn = Math.sin(a) * K;
      ctx.setTransform(c, sn, -sn, c, fieldTx + s.x * K, fieldTy + s.y * K);
      ART.draw(ctx, spr.bolt, 0, 0);
      ctx.setTransform(K, 0, 0, K, fieldTx, fieldTy);
    }
  }
  function drawPlayer(G, dt) {
    const p = G.player;
    shipBank += (clamp(p.vx / 270, -1, 1) - shipBank) * Math.min(1, dt * 10);
    if (!p.alive) return;
    let alpha = 1;
    if (p.inv > 0) alpha = reduced ? 0.55 : Math.floor(tNow * 14) % 2 ? 0.25 : 1;
    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.translate(p.x, PY);
    ctx.rotate(shipBank * 0.12);
    ctx.scale(1 - Math.abs(shipBank) * 0.14, 1);
    ctx.globalCompositeOperation = "lighter";
    const hot = p.rapid > 0, len = (hot ? 1.35 : 1.05) * (reduced ? 1 : rand(0.85, 1.15));
    for (const sx of [-2.3, 2.3]) ART.draw(ctx, hot ? spr.flameHot : spr.flame, sx, 9.5 + 7 * len, 1.1, len);
    ctx.globalAlpha = alpha * 0.5;
    ART.draw(ctx, spr.glow[hot ? "orange" : "cyan"], 0, 14, 0.7, 0.9);
    if (muzzle > 0) { ctx.globalAlpha = alpha * Math.min(1, muzzle * 12); ART.draw(ctx, spr.glow.cyan, 0, -14, 0.5); }
    ctx.globalAlpha = alpha;
    if (p.spread > 0) for (const sx of [-9, 9]) ART.draw(ctx, spr.glow.magenta, sx, 4, 0.28 + 0.05 * Math.sin(tNow * 10));
    ctx.globalCompositeOperation = "source-over";
    ART.draw(ctx, spr.ship, 0, 0);
    ctx.restore();
    if (p.shield) {
      ctx.globalAlpha = 0.85 + 0.15 * Math.sin(tNow * 6);
      ART.draw(ctx, spr.bubble, p.x, PY - 1, 1 + 0.03 * Math.sin(tNow * 4));
    }
    ctx.globalAlpha = 1;
  }
  function drawParticles() {
    ctx.globalCompositeOperation = "lighter";
    for (const p of P) {
      const f = p.life / p.max;
      if (p.k === 0) { ctx.globalAlpha = Math.min(1, f * 1.4); ART.draw(ctx, spr.glow[p.g], p.x, p.y, p.size * (0.4 + 0.6 * f)); }
      else if (p.k === 3) { ctx.globalAlpha = f * f; ART.draw(ctx, spr.glow[p.g], p.x, p.y, p.size * (1.2 - 0.4 * f)); }
      else if (p.k === 2) {
        ctx.globalAlpha = f;
        ctx.strokeStyle = p.c;
        ctx.lineWidth = p.width * f + 0.3;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r1 + (p.r0 - p.r1) * f, 0, TAU); ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = "source-over";
    let font = "";
    for (const p of P) {
      const f = p.life / p.max;
      if (p.k === 1) {
        const c = Math.cos(p.rot) * K, s = Math.sin(p.rot) * K;
        ctx.setTransform(c, s, -s, c, fieldTx + p.x * K, fieldTy + p.y * K);
        ctx.globalAlpha = Math.min(1, f * 1.5);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
      } else if (p.k === 4) {
        ctx.setTransform(K, 0, 0, K, fieldTx, fieldTy);
        const fnt = `700 ${p.size}px Orbitron, sans-serif`;
        if (fnt !== font) { ctx.font = font = fnt; ctx.textAlign = "center"; ctx.textBaseline = "middle"; }
        ctx.globalAlpha = Math.min(1, f * 2.2);
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = "rgba(5,4,15,.75)";
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.c;
        ctx.fillText(p.text, p.x, p.y);
      }
    }
    ctx.setTransform(K, 0, 0, K, fieldTx, fieldTy);
    ctx.globalAlpha = 1;
  }
  function glowText(text, x, y, size, weight, fill, glow, family) {
    ctx.font = `${weight} ${size}px ${family || "Orbitron"}, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = glow;
    ctx.shadowBlur = 12 * K;
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
  }
  function drawOverlay(G, dt) {
    if (G.boss && G.state !== "intro") {
      const B = G.boss, w = 200, x = (W - w) / 2, y = 22;
      ctx.font = "700 7px Orbitron, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "#f5d0fe";
      ctx.fillText(T("queen").toUpperCase(), W / 2, y - 7);
      ctx.fillStyle = "rgba(255,255,255,.1)";
      ctx.fillRect(x, y, w, 5);
      ctx.fillStyle = bossGrad;
      ctx.shadowColor = "#e879f9"; ctx.shadowBlur = 6 * K;
      ctx.fillRect(x, y, w * Math.max(0, B.hp / B.max), 5);
      ctx.shadowBlur = 0;
    }
    const p = G.player;
    let tx = 14;
    for (const kind of ["rapid", "spread"]) {
      if (p[kind] <= 0) continue;
      ART.draw(ctx, spr.power[kind], tx, 588, 0.62);
      ctx.fillStyle = "rgba(255,255,255,.12)";
      ctx.fillRect(tx + 9, 587, 24, 3);
      ctx.fillStyle = ART.POWER_COLORS[kind];
      ctx.fillRect(tx + 9, 587, 24 * clamp(p[kind] / M.POWER_TIME[kind], 0, 1), 3);
      tx += 44;
    }
    if (p.shield) ART.draw(ctx, spr.power.shield, tx, 588, 0.62);
    if (danger) {
      const a = reduced ? 0.6 : 0.55 + 0.45 * Math.sin(tNow * 9);
      ctx.globalAlpha = a;
      ctx.fillStyle = dangerGrad;
      ctx.fillRect(0, PY - 140, W, H - PY + 140);
      glowText(T("danger").toUpperCase(), W / 2, 590, 11, 900, "#ffd1dc", "#ff2850");
      ctx.globalAlpha = 1;
    }
    if (banner) {
      banner.t += dt;
      const t = banner.t;
      if (banner.kind === "wave") {
        const dur = 2.1;
        if (t > dur) banner = null;
        else {
          const a = clamp(Math.min(t / 0.25, (dur - t) / 0.35), 0, 1), sc = reduced ? 1 : 1 + 0.25 * Math.max(0, 1 - t / 0.35);
          ctx.globalAlpha = a;
          ctx.save();
          ctx.translate(W / 2, 270);
          ctx.scale(sc, sc);
          if (banner.boss) {
            glowText(T("boss").toUpperCase(), 0, -8, 30, 900, "#ffe4ec", "#ff2d75");
            glowText(T("queen"), 0, 20, 12, 600, "#f5d0fe", "#e879f9", "'Exo 2'");
          } else {
            glowText(T("waveN")(banner.wave).toUpperCase(), 0, -8, 28, 900, "#ffffff", "#22d3ee");
            glowText(T("formation")[banner.formation] || "", 0, 20, 12, 600, "#bfe9ff", "#22d3ee", "'Exo 2'");
          }
          ctx.restore();
          ctx.globalAlpha = 1;
        }
      } else if (banner.kind === "clear") {
        const dur = 2.3;
        if (t > dur) banner = null;
        else {
          const a = clamp(Math.min(t / 0.2, (dur - t) / 0.4), 0, 1);
          ctx.globalAlpha = a;
          glowText(T("cleared").toUpperCase(), W / 2, 250, 20, 900, "#ffffff", "#a855f7");
          glowText(`${T("bonus")} +${fmt(banner.bonus)}`, W / 2, 280, 13, 700, "#ffd166", "#ff9f43");
          if (banner.flawless) glowText(T("flawless"), W / 2, 302, 11, 700, "#b6f35a", "#65a30d");
          ctx.globalAlpha = 1;
        }
      }
    }
    if (hintT > 0 && mode === "play") {
      const below = (cssH - (oy + H * fs)) / fs;
      ctx.globalAlpha = Math.min(1, hintT) * 0.85;
      ctx.font = "600 10px 'Exo 2', sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "#dbeafe";
      ctx.fillText(T("touchHint"), W / 2, below > 30 ? H + Math.min(40, below / 2) : 597);
      ctx.globalAlpha = 1;
    }
  }
  function render(G, dt) {
    drawBackground(dt);
    fieldTx = (ox + shakeX) * dpr;
    fieldTy = (oy + shakeY) * dpr;
    ctx.setTransform(K, 0, 0, K, fieldTx, fieldTy);
    drawRails();
    if (G) {
      drawBarriers(G);
      drawAliens(G);
      drawBoss(G);
      drawUfo(G);
      drawPowerups(G);
      ctx.globalCompositeOperation = "lighter";
      drawBombs(G);
      drawShots(G);
      ctx.globalCompositeOperation = "source-over";
      drawPlayer(G, dt);
      drawParticles();
      if (mode !== "title") drawOverlay(G, dt);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (flashA > 0) { ctx.globalAlpha = flashA * 0.55; ctx.fillStyle = "#e0f7ff"; ctx.fillRect(0, 0, cssW, cssH); ctx.globalAlpha = 1; }
  }

  // ---------- efectos que avanzan con el tiempo ----------
  function updateFx(dt) {
    for (let i = pending.length - 1; i >= 0; i--) {
      pending[i].t -= dt;
      if (pending[i].t <= 0) { const fn = pending[i].fn; pending.splice(i, 1); fn(); }
    }
    let j = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      if (p.k <= 1) {
        const d = Math.exp(-p.drag * dt);
        p.vx *= d; p.vy *= d;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.k === 1) p.rot += p.vr * dt;
      } else if (p.k === 4) {
        p.y += p.vy * dt;
        p.vy *= Math.exp(-2 * dt);
      }
      P[j++] = p;
    }
    P.length = j;
    trauma = Math.max(0, trauma - dt * 1.6);
    const s = trauma * trauma * 7 * fs;
    shakeX = s ? (Math.sin(tNow * 71) + Math.sin(tNow * 113) * 0.5) * s : 0;
    shakeY = s ? (Math.cos(tNow * 83) + Math.sin(tNow * 127) * 0.5) * s : 0;
    flashA = Math.max(0, flashA - dt * 2.5);
    beatPulse = Math.max(0, beatPulse - dt * 7);
    muzzle = Math.max(0, muzzle - dt);
    const G = cur(), wTarget = G && G.state === "clear" ? (reduced ? 2 : 7) : 1;
    warpCur += (wTarget - warpCur) * Math.min(1, dt * 2.2);
  }

  // ---------- marcador ----------
  const SHIP_SVG = '<svg viewBox="0 0 16 14" aria-hidden="true"><path d="M8 0l2.2 6.2L16 10.5V13H0v-2.5l5.8-4.3z"/></svg>';
  function updateHud(force, dt) {
    if (!S) return;
    shownScore = force ? S.score : shownScore + Math.ceil((S.score - shownScore) * Math.min(1, dt * 12));
    if (shownScore > S.score) shownScore = S.score;
    if (force || hudCache.score !== shownScore) { $("score").textContent = fmt(shownScore); hudCache.score = shownScore; }
    if (force || hudCache.wave !== S.wave) { $("wave").textContent = S.wave; hudCache.wave = S.wave; }
    if (force || hudCache.lives !== S.lives) {
      const el = $("lives");
      el.innerHTML = S.lives > 3 ? SHIP_SVG + "×" + S.lives : SHIP_SVG.repeat(Math.max(0, S.lives));
      el.setAttribute("aria-label", T("livesAria")(S.lives));
      hudCache.lives = S.lives;
    }
    const b = Math.max(best, S.score);
    if (force || hudCache.best !== b) { $("best").textContent = fmt(b); hudCache.best = b; }
    if (force || hudCache.mult !== S.mult) {
      const m = $("mult");
      m.hidden = S.mult <= 1;
      m.textContent = "×" + S.mult;
      if (multBump && !reduced) { m.classList.remove("bump"); void m.offsetWidth; m.classList.add("bump"); }
      hudCache.mult = S.mult;
    }
    multBump = false;
  }

  // ---------- bucle ----------
  function simulate(G, dt, inp, live) {
    if (dt <= 0) return;
    const n = Math.max(1, Math.ceil(dt * 120 - 1e-6)), h = dt / n;
    for (let i = 0; i < n; i++) {
      M.step(G, h, inp);
      if (G.events.length) handleEvents(G, live);
      if (live && mode !== "play") break;
    }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const rdt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (mode === "paused") {
      pollPad();
      if (!pausedDrawn) { render(S, 0); pausedDrawn = true; }
      return;
    }
    let dt = rdt;
    if (slowT > 0) { slowT -= rdt; dt = rdt * (reduced ? 0.6 : 0.3); }
    tNow += dt;
    if (mode === "play") {
      playTime += rdt;
      slowFrames = rdt > 0.026 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
      if (slowFrames > 120 && quality > 0.75) { quality = 0.75; slowFrames = 0; resize(); makeGradients(); }
      hintT = Math.max(0, hintT - rdt);
      simulate(S, dt, testAuto ? demoInput(S) : readInput(), true);
      if (S.ufo) SND.ufoMove(S.ufo.x);
    } else {
      pollPad();
      if (mode === "title") {
        if (!demo) demo = M.create();
        if (demo.state === "over") { demoOverT -= rdt; if (demoOverT <= 0) { demo = M.create(); P.length = 0; } }
        else simulate(demo, dt, demoInput(demo), false);
      } else if (mode === "over" && !overShown) {
        overT -= rdt;
        if (overT <= 0) showOver();
      }
    }
    const G = cur();
    danger = !!G && G.state === "play" && M.swarmBottom(G) > 410;
    if (danger && mode === "play" && !dangerSaid) { dangerSaid = true; say(T("sayDanger")); }
    updateFx(dt);
    render(G, dt);
    if (mode !== "title") updateHud(false, rdt);
  }

  // ---------- idioma, botones y arranque ----------
  function buildHow(ul) {
    if (!ul) return;
    ul.textContent = "";
    const row = (dev, parts) => {
      const li = document.createElement("li"), d = document.createElement("span");
      d.className = "dev";
      d.textContent = T(dev);
      li.appendChild(d);
      for (const part of parts) {
        if (part.kbd) { const k = document.createElement("kbd"); k.textContent = part.kbd; li.appendChild(k); }
        else li.appendChild(document.createTextNode(part));
      }
      ul.appendChild(li);
    };
    const keysRow = () => row("keys", [{ kbd: "←" }, { kbd: "→" }, " " + T("kMove") + " · ", { kbd: T("space") }, " " + T("kFire") + " · ", { kbd: "P" }, " " + T("kPause")]);
    if (mqCoarse.matches) row("touch", [T("touchHow")]);
    else { keysRow(); row("mouse", [T("mouseHow")]); }
    if (padSeen) row("pad", [T("padHow")]);
  }
  function applyLang() {
    document.documentElement.lang = lang;
    document.title = T("title");
    document.querySelectorAll("[data-i18n]").forEach(el => { const v = T(el.dataset.i18n); if (typeof v === "string") el.textContent = v; });
    document.querySelectorAll("[data-i18n-aria]").forEach(el => el.setAttribute("aria-label", T(el.dataset.i18nAria)));
    document.querySelectorAll("[data-lang]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
    buildHow($("howTitle"));
    buildHow($("howPause"));
    $("bestTitle").textContent = fmt(best);
    if (overShown) fillOver();
    hudCache = {};
    updateHud(true, 0);
  }
  document.querySelectorAll("[data-lang]").forEach(b => {
    b.addEventListener("click", () => { lang = b.dataset.lang; store.set("enjambre:idioma", lang); applyLang(); });
  });
  $("btnPlay").addEventListener("click", startGame);
  $("btnAgain").addEventListener("click", startGame);
  $("btnResume").addEventListener("click", resume);
  $("btnRestart").addEventListener("click", startGame);
  $("btnPause").addEventListener("click", () => { if (mode === "play") pause(); else if (mode === "paused") resume(); });
  $("btnSound").addEventListener("click", () => { toggleSound(); if (mode === "play") blurFocus(); });
  $("btnSound").setAttribute("aria-pressed", String(soundOn));
  document.addEventListener("visibilitychange", () => { if (document.hidden && mode === "play") pause(); });
  window.addEventListener("blur", () => { if (mode === "play") pause(); else releaseAll(); });
  onMq(mqCoarse, () => { buildHow($("howTitle")); buildHow($("howPause")); });
  let resizeQueued = false;
  const queueResize = () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => { resizeQueued = false; resize(); makeGradients(); pausedDrawn = false; });
  };
  window.addEventListener("resize", queueResize);
  if (window.ResizeObserver) new ResizeObserver(queueResize).observe(app);
  document.querySelectorAll("canvas[data-thumb]").forEach(c => ART.thumb(c, c.dataset.thumb, 32));
  if (document.fonts && document.fonts.load) { document.fonts.load("900 20px Orbitron"); document.fonts.load("600 12px 'Exo 2'"); }

  resize();
  makeGradients();
  applyLang();
  show("title");
  $("btnPlay").focus({ preventScroll: true });
  requestAnimationFrame(frame);

  // Ganchos para las pruebas automáticas
  window.__enjambre = {
    get mode() { return mode; }, get game() { return S; }, get demo() { return demo; }, get particles() { return P.length; },
    get layout() { return { cssW, cssH, fs, ox, oy, K, dpr, quality }; }, get input() { return Object.assign({}, input); },
    start: startGame, pause, resume, set autoplay(v) { testAuto = !!v; },
    newGame(opts) { startGame(); S = M.create(opts); P.length = 0; handleEvents(S, true); updateHud(true, 0); return S; }
  };
})();
