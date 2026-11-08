/* Pulso Neón · bucle de juego, entrada, menús y guardado. */
(function () {
  'use strict';
  const PN = window.PN;
  const E = PN.Engine, LV = PN.Levels, RD = PN.Render, AU = PN.Audio;
  const $ = (id) => document.getElementById(id);
  const DT = E.DT, DTMS = DT * 1000;
  const DEMOS = window.PN_DEMOS || {};
  const MODE_NAMES = { cube: 'Cubo', ship: 'Nave', ball: 'Bola', ufo: 'Ovni', wave: 'Onda' };
  const TIER_COL = ['#c9c2ff', '#6bff8f', '#4dc3ff', '#ffd84d', '#ff9440', '#ff4d6d', '#c77dff'];
  const COLORS = ['#5ef0ff', '#ff4fd8', '#7dff6b', '#ffd84d', '#ff8a3d', '#ff4d6d', '#b98bff', '#4d7bff', '#ffffff', '#1fd1a5', '#ff9ec7', '#20232e'];

  // ---------- guardado ----------
  const SAVE_KEY = 'pulsoNeon.v1';
  const defaults = () => ({ v: 1, levels: {}, icon: { design: 0, c1: '#5ef0ff', c2: '#ff4fd8', trail: true }, music: 0.75, sfx: 0.8, fx: 'high', fps: false, endless: 0, hinted: false });
  let save = (() => {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.v === 1) return Object.assign(defaults(), s); } catch (e) { /* sin almacenamiento */ }
    return defaults();
  })();
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* sin almacenamiento */ } };
  const stat = (id) => save.levels[id] || (save.levels[id] = { best: 0, practice: 0, attempts: 0, coins: 0, done: false, jumps: 0 });

  // ---------- estado ----------
  const app = $('app'), cv = $('game');
  const rend = new RD.Renderer(cv);
  const audio = new AU.AudioEngine();
  let screen = 'title', G = null, demo = null, sel = 0;
  const cache = [];
  const level = (i) => cache[i] || (cache[i] = LV.buildLevel(i));
  const menuSong = AU.makeSong({ bpm: 120, root: 57, prog: [0, 5, 2, 6], lead: 'pluck', seed: 5 },
    AU.loopSections([{ type: 'intro', bars: 4 }, { type: 'groove', bars: 8 }, { type: 'break', bars: 4 }, { type: 'groove', bars: 8 }, { type: 'outro', bars: 4 }]));
  let menuMusicAt = null;
  function applyIcon() { rend.icon = Object.assign({}, save.icon); }
  applyIcon();
  rend.hq = save.fx !== 'low';
  rend.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- diseño de pantalla ----------
  function layout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const coarse = matchMedia('(pointer: coarse)').matches;
    const rot = coarse && vh > vw * 1.15;
    let w = vw, h = vh;
    if (rot) { w = vh; h = vw; app.style.cssText = `width:${w}px;height:${h}px;right:auto;bottom:auto;transform-origin:0 0;transform:translateX(${vw}px) rotate(90deg)`; }
    else app.style.cssText = '';
    app.classList.toggle('rotated', rot);
    const dpr = Math.min(save.fx === 'low' ? 1 : 2, window.devicePixelRatio || 1);
    rend.resize(w, h, dpr);
    drawPreview();
  }
  window.addEventListener('resize', layout);

  // ---------- audio ----------
  function unlockAudio() {
    const fresh = !audio.ready;
    if (!audio.init()) return;
    audio.setVolumes(save.music, save.sfx);
    if (fresh && screen !== 'play') startMenuMusic();
  }
  function startMenuMusic() {
    if (!audio.ready || menuMusicAt != null) return;
    menuMusicAt = audio.now() + 0.05;
    audio.play(menuSong, 0, menuMusicAt);
  }
  function stopMenuMusic() { if (menuMusicAt != null) { audio.stop(0.15); menuMusicAt = null; } }
  document.addEventListener('pointerdown', unlockAudio, { capture: true });
  document.addEventListener('keydown', unlockAudio, { capture: true });

  // ---------- entrada ----------
  const held = { k: new Set(), p: new Set() };
  const queue = [];
  const isHeld = () => held.k.size > 0 || held.p.size > 0;
  function press(src, kind) { const was = isHeld(); held[kind].add(src); if (!was) queue.push({ t: performance.now(), d: true }); }
  function release(src, kind) { if (!held[kind].has(src)) return; held[kind].delete(src); if (!isHeld()) queue.push({ t: performance.now(), d: false }); }
  function releaseAll() { const was = isHeld(); held.k.clear(); held.p.clear(); if (was) queue.push({ t: performance.now(), d: false }); }
  const JUMP = new Set(['Space', 'ArrowUp', 'KeyW']);
  window.addEventListener('keydown', (e) => {
    if (screen === 'play') {
      if (JUMP.has(e.code)) { e.preventDefault(); if (!e.repeat) press(e.code, 'k'); return; }
      if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); pauseGame(); return; }
      if (e.code === 'KeyR' && G && !G.won) { restart(); return; }
      if (G && G.practice && e.code === 'KeyZ') addCheckpoint(true);
      if (G && G.practice && e.code === 'KeyX') removeCheckpoint();
      return;
    }
    if (screen === 'pause' && (e.code === 'Escape' || e.code === 'KeyP')) { e.preventDefault(); resumeGame(); return; }
    if (screen === 'watch') { e.preventDefault(); endWatch(); return; }
    if (screen === 'levels') {
      if (e.code === 'ArrowRight') { e.preventDefault(); pick(sel + 1); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); pick(sel - 1); }
      else if (e.code === 'Escape') show('title');
    } else if ((screen === 'icons' || screen === 'settings') && e.code === 'Escape') show('title');
  });
  window.addEventListener('keyup', (e) => { if (JUMP.has(e.code)) release(e.code, 'k'); });
  const layer = $('playLayer');
  layer.addEventListener('pointerdown', (e) => {
    if (screen === 'watch') { e.preventDefault(); endWatch(); return; }
    if (screen !== 'play') return;
    e.preventDefault();
    try { layer.setPointerCapture(e.pointerId); } catch (err) { /* opcional */ }
    press(e.pointerId, 'p');
  });
  const up = (e) => release(e.pointerId, 'p');
  layer.addEventListener('pointerup', up);
  layer.addEventListener('pointercancel', up);
  layer.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('blur', () => { releaseAll(); if (screen === 'play') pauseGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { releaseAll(); if (screen === 'play') pauseGame(); } });

  // ---------- pantallas ----------
  const SCREENS = { title: 'scrTitle', levels: 'scrLevels', icons: 'scrIcons', settings: 'scrSettings', pause: 'scrPause', win: 'scrWin' };
  function show(name) {
    for (const k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = !(name === 'play' || name === 'pause' || name === 'watch');
    $('hud').classList.toggle('watch', name === 'watch');
    app.dataset.screen = name;
    screen = name;
    rend.camFrac = name === 'title' ? 0.6 : name === 'levels' || name === 'icons' || name === 'settings' ? 0.45 : 0.3;
    if (name === 'title' || name === 'levels' || name === 'icons' || name === 'settings') {
      if (!demo || demo.watch) startDemo(0, false);
      if (audio.ready) startMenuMusic();
    }
    if (name === 'levels') renderLevel();
    if (name === 'icons') buildIconScreen();
    if (name === 'settings') syncSettings();
    const focus = { title: 'btnPlay', levels: 'lvGo', pause: 'pzResume', win: 'wnNext' }[name];
    if (focus && !matchMedia('(pointer: coarse)').matches) setTimeout(() => { const el = $(focus); if (el && !el.hidden) el.focus({ preventScroll: true }); }, 30);
  }
  let toastTimer = 0;
  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), ms || 1600);
  }

  // ---------- demo del menú ----------
  function demoHeld(arr, f) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= f) lo = m + 1; else hi = m; } return (lo & 1) === 1; }
  function startDemo(idx, watch) {
    idx = idx || 0;
    const L = level(idx);
    const delay = watch ? 120 + (audio.ready ? audio.latency() * 1000 : 0) : 0;
    demo = { idx, L, arr: DEMOS[idx] || [], p: E.newPlayer(L), stepN: 0, t0: performance.now() + delay, end: 0, watch: !!watch, sec: 0 };
    demo.p.ev = [];
    rend.setLevel(L);
    rend.camera(0, 0.5, demo.p, 0, true);
    if (watch && audio.ready) {
      const sp = L.spec;
      demo.song = AU.makeSong(Object.assign({ bpm: sp.bpm }, sp.music), AU.levelSections(L.secs, L.totalBeats));
      audio.play(demo.song, 0, audio.now() + 0.12);
    }
  }
  function stopDemo() { demo = null; }
  function watchDemo(i) {
    stopMenuMusic();
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    startDemo(i, true);
    show('watch');
    $('hud').classList.remove('endless');
    $('pracCtl').hidden = true;
    toast('Demostración · toca o pulsa una tecla para salir', 2600);
  }
  function endWatch() { if (!demo || !demo.watch) return; audio.stop(0.15); demo = null; show('levels'); }

  // ---------- partida ----------
  function startLevel(idx, practice) {
    stopDemo(); stopMenuMusic();
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    const endless = idx === 'endless';
    G = { idx, endless, practice: !!practice && !endless, attempt: 0, cps: [], lastCp: -9, jumps: 0, fpsBad: 0 };
    newRun(true);
    show('play');
    $('pracCtl').hidden = !G.practice;
    $('hud').classList.toggle('endless', endless);
    if (idx === 0 && !save.hinted) { save.hinted = true; persist(); toast('Toca, haz clic o pulsa Espacio para saltar · Mantén para saltar seguido', 3600); }
  }
  function newRun(first) {
    if (G.endless) {
      G.gen = new LV.Endless((Math.random() * 1e9) >>> 0);
      G.gen.ensure(0);
      G.L = G.gen.L;
    } else G.L = level(G.idx);
    G.spec = G.L.spec;
    const secs = G.L.secs;
    G.song = AU.makeSong(Object.assign({ bpm: G.spec.bpm }, G.spec.music),
      G.endless ? (bar) => { const b = bar * 4; for (const s of secs) if (b >= s.sb && b < s.sb + s.bars * 4) return { type: s.type, i: (b - s.sb) / 4, n: s.bars }; return { type: 'groove', i: 0, n: 4 }; }
        : AU.levelSections(secs, G.L.totalBeats));
    rend.setLevel(G.L);
    if (first) G.cps = [];
    spawn(false);
  }
  function spawn(fromCp) {
    let p, stepN;
    const cp = fromCp && G.cps.length ? G.cps[G.cps.length - 1] : null;
    if (cp) { p = E.clone(cp.s); stepN = cp.stepN; G.fromCp = cp; }
    else {
      p = E.newPlayer(G.L); stepN = 0; G.fromCp = null;
      G.attempt++;
      if (!G.practice && !G.endless) { stat(G.spec.id).attempts++; persist(); }
    }
    p.ev = [];
    G.p = p; G.stepN = stepN; G.dead = false; G.won = false; G.wonAt = 0; G.deadAt = 0; G.winShown = false;
    G.px = p.x; G.py = p.y; G.prot = p.rot; G.prevX = p.x; G.prevY = p.y; G.prevRot = p.rot;
    G.held = isHeld(); G.pressed = false; queue.length = 0;
    G.secIdx = 0; G.wasGround = true;
    const lat = audio.ready ? audio.latency() : 0;
    const delay = 70 + lat * 1000;
    G.t0 = performance.now() + delay - stepN * DTMS;
    if (audio.ready) audio.play(G.song, stepN * DT, audio.now() + 0.07);
    rend.reset();
    rend.camera(p.x, p.y, p, 0, true);
  }
  function restart() { if (!G) return; G.cps = []; spawnFresh(); }
  function spawnFresh() { if (G.endless) newRun(false); else spawn(false); }
  function pct() { return G.endless ? 0 : Math.max(0, Math.min(100, Math.floor((G.p.x / G.L.endX) * 100))); }
  function onDeath() {
    G.dead = true; G.deadAt = performance.now();
    audio.stop(0.04); audio.sfxDeath();
    if (G.endless) {
      const d = Math.floor(G.p.x);
      if (d > save.endless) { save.endless = d; persist(); toast(`Nuevo récord: ${d} m`); } else toast(`${d} m · récord ${save.endless} m`);
    } else {
      const s = stat(G.spec.id), v = pct();
      if (G.practice) { if (v > s.practice) { s.practice = v; persist(); } }
      else if (v > s.best) { s.best = v; persist(); toast(`Nuevo récord: ${v}%`); }
    }
    if (G.practice && G.fromCp && G.cps.length && G.p.t - G.fromCp.s.t < 0.35) G.cps.pop();
  }
  function onWin() {
    G.won = true; G.wonAt = performance.now();
    G.winX = G.p.x; G.winY = G.p.y;
    audio.sfxWin();
    rend.cam.lock = rend.cam.x;
    rend.onEvent({ type: 'win', x: G.p.x, y: G.p.y }, G.p);
    const s = stat(G.spec.id);
    if (G.practice) s.practice = 100;
    else { s.best = 100; s.done = true; s.coins |= G.p.coins; s.jumps += G.p.jumps; }
    persist();
  }
  function addCheckpoint(manual) {
    if (!G || !G.practice || G.dead || G.won) return;
    G.cps.push({ s: E.clone(G.p), stepN: G.stepN, x: G.p.x, y: G.p.y });
    G.lastCp = G.p.t;
    if (manual) audio.sfxCheckpoint();
  }
  function removeCheckpoint() { if (G && G.cps.length) { G.cps.pop(); audio.sfxClick(); } }
  function pauseGame() {
    if (screen !== 'play' || !G) return;
    releaseAll();
    G.pausedAt = performance.now();
    audio.stop(0.05);
    syncPause();
    show('pause');
  }
  function resumeGame() {
    if (!G) return;
    show('play');
    if (G.dead || G.won) return;
    const now = performance.now();
    const lat = audio.ready ? audio.latency() : 0;
    const delay = 260 + lat * 1000;
    G.t0 = now + delay - G.stepN * DTMS;
    queue.length = 0; G.held = isHeld();
    if (audio.ready) audio.play(G.song, G.stepN * DT, audio.now() + 0.26);
  }
  function exitToMenu() { audio.stop(0.1); G = null; show('levels'); }

  // ---------- bucle principal ----------
  let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsShow = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 0.5) { fpsShow = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; if (save.fps) $('fps').textContent = `${fpsShow.toFixed(0)} FPS`; adapt(); }
    if ((screen === 'play' || screen === 'pause' || screen === 'win') && G) runGame(now, dt);
    else if (demo) runDemo(now, dt);
    if (screen === 'icons') drawPreview(now / 1000);
  }
  function adapt() {
    if (screen !== 'play' || !rend.hq || save.fx === 'low') return;
    if (fpsShow < 42) { if (++G.fpsBad >= 8) { rend.hq = false; toast('Efectos reducidos para ganar fluidez'); } } else G.fpsBad = 0;
  }
  function sectionAt(L, x, hint) {
    const S = L.secs;
    let i = Math.min(hint || 0, S.length - 1);
    while (i > 0 && x < S[i].xs) i--;
    while (i < S.length - 1 && x >= S[i].xe) i++;
    return i;
  }
  function pulseAt(t, bpm, type) {
    const b = (t * bpm) / 60, f = b - Math.floor(b);
    const k = type === 'drop' || type === 'groove' ? 1 : type === 'build' ? 0.8 : 0.45;
    return Math.exp(-f * 5) * k;
  }
  function stepInputs(tLimit) {
    while (queue.length && queue[0].t <= tLimit) {
      const q = queue.shift();
      if (q.d) { if (!G.held) G.pressed = true; G.held = true; } else G.held = false;
    }
  }
  function runGame(now, dt) {
    const p = G.p;
    let alpha = 1;
    if (screen === 'play' && !G.dead && !G.won) {
      let n = 0;
      while (G.t0 + (G.stepN + 1) * DTMS <= now) {
        if (++n > 480) { G.t0 = now - G.stepN * DTMS; break; }
        stepInputs(G.t0 + G.stepN * DTMS);
        G.prevX = p.x; G.prevY = p.y; G.prevRot = p.rot;
        const wasGround = p.onGround;
        E.step(p, G.L, G.held, G.pressed);
        G.pressed = false;
        G.stepN++;
        for (const ev of p.ev) {
          rend.onEvent(ev, p);
          if (ev.type === 'coin') audio.sfxCoin();
        }
        p.ev.length = 0;
        if (p.mode === 'cube' && p.onGround && !wasGround && p.t > 0.2) rend.onEvent({ type: 'land', x: p.x, y: p.y }, p);
        if (p.dead) { onDeath(); break; }
        if (p.won) { onWin(); break; }
        if (G.practice && p.t - G.lastCp > 1.6 && p.x > 6 && (p.mode !== 'cube' || p.onGround)) addCheckpoint(false);
        if (G.endless && (G.stepN & 63) === 0) G.gen.ensure(p.x);
      }
      if (!p.dead && !p.won) alpha = Math.max(0, Math.min(1, (now - (G.t0 + G.stepN * DTMS)) / DTMS + 1));
      if (p.t <= 0 && G.stepN === 0) alpha = 1;
    }
    let px = G.prevX + (p.x - G.prevX) * alpha, py = G.prevY + (p.y - G.prevY) * alpha;
    if (G.won) {
      const k = (now - G.wonAt) / 1000;
      px = G.winX + E.SPEEDS[p.spd] * k * (1 + k * 0.8);
      py = G.winY + k * k * 2.5;
      if (k > 1.6 && !G.winShown) { G.winShown = true; if (screen === 'play') showWin(); }
      if (k > 0.25 && Math.random() < dt * 4) rend.onEvent({ type: 'win', x: rend.cam.x + rend.VW * (0.3 + Math.random() * 0.5) - 2, y: rend.cam.y + rend.VH * (0.4 + Math.random() * 0.4) }, p);
    }
    if (G.dead && screen === 'play' && now - G.deadAt > (G.practice ? 620 : 950)) { if (G.endless) newRun(false); else spawn(G.practice); }
    // cámara, sección y pulso
    if (!G.dead) rend.camera(px, py, p, dt, false);
    const L = G.L;
    G.secIdx = sectionAt(L, p.x, G.secIdx);
    const sec = L.secs[G.secIdx];
    const pal = G.spec.pals[(sec && sec.pal) % G.spec.pals.length || 0];
    const t = p.t;
    const pulse = rend.reduced ? 0 : pulseAt(t, G.spec.bpm, sec ? sec.type : 'groove');
    rend.draw({
      L, p, px, py, t: performance.now() / 1000, dt, pulse, pal,
      attemptText: G.fromCp ? null : G.practice ? 'Práctica' : G.endless ? 'Infinito' : `Intento ${G.attempt}`,
      subText: G.fromCp ? null : G.practice ? 'Puntos de control automáticos · Z añade · X quita' : G.endless ? `Récord: ${save.endless} m` : G.spec.name,
      textX: 9, checkpoints: G.practice ? G.cps : null, savedCoins: G.endless ? 0 : stat(G.spec.id).coins,
      hidePlayer: G.dead,
    });
    // HUD
    if (G.endless) $('ptext').textContent = `${Math.floor(p.x)} m`;
    else {
      const v = G.won ? 100 : pct();
      $('pfill').style.transform = `scaleX(${v / 100})`;
      $('ptext').textContent = `${v}%`;
    }
  }
  function runDemo(now, dt) {
    const d = demo, p = d.p;
    let n = 0;
    while (!p.dead && !p.won && d.t0 + (d.stepN + 1) * DTMS <= now) {
      if (++n > 480) { d.t0 = now - d.stepN * DTMS; break; }
      const f = d.stepN >> 2;
      const h = demoHeld(d.arr, f);
      const pressed = (d.stepN & 3) === 0 && h && !(f > 0 && demoHeld(d.arr, f - 1));
      d.px = p.x; d.py = p.y;
      const wasGround = p.onGround;
      E.step(p, d.L, h, pressed);
      d.stepN++;
      for (const ev of p.ev) { rend.onEvent(ev, p); if (ev.type === 'coin' && d.watch) audio.sfxCoin(); }
      p.ev.length = 0;
      if (p.mode === 'cube' && p.onGround && !wasGround && p.t > 0.2) rend.onEvent({ type: 'land', x: p.x, y: p.y }, p);
    }
    if (p.dead || p.won) {
      if (!d.end) { d.end = now; if (p.won) { rend.cam.lock = rend.cam.x; rend.onEvent({ type: 'win', x: p.x, y: p.y }, p); if (d.watch) audio.sfxWin(); } }
      if (now - d.end > (d.watch ? 2600 : 1200)) { if (d.watch) endWatch(); else startDemo(0, false); return; }
    }
    const a = Math.max(0, Math.min(1, (now - (d.t0 + d.stepN * DTMS)) / DTMS + 1));
    const px = d.px == null ? p.x : d.px + (p.x - d.px) * a, py = d.py == null ? p.y : d.py + (p.y - d.py) * a;
    if (!p.dead) rend.camera(px, py, p, dt, false);
    d.sec = sectionAt(d.L, p.x, d.sec);
    const sec = d.L.secs[d.sec];
    const mt = d.watch ? p.t : menuMusicAt != null && audio.ready ? audio.now() - menuMusicAt : p.t;
    const pal = d.L.spec.pals[(sec ? sec.pal : 0) % d.L.spec.pals.length];
    let wx = px, wy = py;
    if (p.won && d.end) { const k = (now - d.end) / 1000; wx = p.x + E.SPEEDS[p.spd] * k * (1 + k * 0.8); wy = p.y + k * k * 2.5; }
    rend.draw({ L: d.L, p, px: wx, py: wy, t: now / 1000, dt, pulse: rend.reduced ? 0 : pulseAt(mt, d.watch ? d.L.spec.bpm : 120, sec ? sec.type : 'groove') * 0.8, pal, hidePlayer: p.dead,
      attemptText: d.watch ? 'Demo' : null, subText: d.watch ? d.L.spec.name : null, textX: 9 });
    if (d.watch) {
      const v = Math.max(0, Math.min(100, Math.floor((p.x / d.L.endX) * 100)));
      $('pfill').style.transform = `scaleX(${p.won ? 1 : v / 100})`;
      $('ptext').textContent = `${p.won ? 100 : v}%`;
    }
  }

  // ---------- selección de nivel ----------
  const N = LV.LEVELS.length;
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  function modesOf(L) { const m = []; for (const s of L.secs) if (!m.includes(s.mode)) m.push(s.mode); return m; }
  function pick(i) { sel = (i + N + 1) % (N + 1); audio.sfxClick(); renderLevel(); }
  function renderLevel() {
    const card = $('lvCard');
    const endless = sel === N;
    const spec = endless ? LV.ENDLESS_SPEC : LV.LEVELS[sel];
    const tier = spec.tier;
    card.style.setProperty('--lv-a', spec.pals[0].line);
    card.style.setProperty('--lv-b', spec.pals[0].bot);
    card.style.setProperty('--lv-c', (spec.pals[1] || spec.pals[0]).line);
    $('lvDiff').textContent = spec.diff;
    $('lvDiff').style.color = TIER_COL[tier];
    $('lvName').textContent = spec.name;
    $('lvIdx').textContent = endless ? '∞' : String(sel + 1).padStart(2, '0');
    const eq = $('lvEq');
    eq.innerHTML = '';
    for (let k = 1; k <= 6; k++) { const i = document.createElement('i'); i.style.height = `${30 + k * 11}%`; if (endless || k <= tier) i.style.background = TIER_COL[endless ? 0 : tier]; eq.appendChild(i); }
    eq.setAttribute('aria-label', endless ? 'Dificultad creciente' : `Dificultad ${tier} de 6`);
    const chips = $('lvModes');
    chips.innerHTML = '';
    const modes = endless ? ['cube', 'ship', 'ball', 'ufo', 'wave'] : modesOf(level(sel));
    for (const m of modes) { const c = document.createElement('span'); c.className = 'chip'; c.style.setProperty('--c', RD.PORTAL[m]); c.textContent = MODE_NAMES[m]; chips.appendChild(c); }
    if (endless) {
      $('lvMeta').textContent = `${spec.bpm} BPM · cada intento es distinto`;
      $('lvBars').hidden = true; $('lvCoins').hidden = true; $('lvEndless').hidden = false;
      $('lvRecord').textContent = `${save.endless} m`;
      $('lvPractice').hidden = true; $('lvDemo').hidden = true;
    } else {
      const L = level(sel), s = stat(spec.id);
      $('lvMeta').textContent = `${fmtTime(L.duration)} · ${spec.bpm} BPM · ${s.attempts} ${s.attempts === 1 ? 'intento' : 'intentos'}`;
      $('lvBars').hidden = false; $('lvCoins').hidden = false; $('lvEndless').hidden = true; $('lvPractice').hidden = false; $('lvDemo').hidden = !DEMOS[sel];
      $('lvNormFill').style.transform = `scaleX(${s.best / 100})`; $('lvNormPct').textContent = `${s.best}%`;
      $('lvPracFill').style.transform = `scaleX(${s.practice / 100})`; $('lvPracPct').textContent = `${s.practice}%`;
      const coins = $('lvCoins');
      coins.innerHTML = '';
      for (let k = 0; k < 3; k++) { const c = document.createElement('i'); if (s.coins & (1 << k)) c.className = 'got'; coins.appendChild(c); }
      coins.setAttribute('aria-label', `${popc(s.coins)} de 3 monedas`);
      card.classList.toggle('done', s.done);
    }
    const dots = $('lvDots');
    dots.innerHTML = '';
    for (let k = 0; k <= N; k++) {
      const b = document.createElement('button');
      b.className = 'dot' + (k === sel ? ' on' : '');
      b.setAttribute('aria-label', k === N ? 'Infinito' : LV.LEVELS[k].name);
      b.addEventListener('click', () => { sel = k; audio.sfxClick(); renderLevel(); });
      dots.appendChild(b);
    }
    let total = 0, coins = 0;
    for (const l of LV.LEVELS) { const s = stat(l.id); if (s.done) total++; coins += popc(s.coins); }
    $('lvTotals').textContent = `${total}/${N} completados · ${coins}/${N * 3} monedas`;
    card.classList.remove('swap'); void card.offsetWidth; card.classList.add('swap');
  }
  const popc = (n) => { let c = 0; while (n) { c += n & 1; n >>>= 1; } return c; };
  let swipe = null;
  $('lvCard').addEventListener('pointerdown', (e) => { swipe = { x: e.clientX, y: e.clientY }; });
  $('lvCard').addEventListener('pointerup', (e) => {
    if (!swipe) return;
    let dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    if (app.classList.contains('rotated')) { const t = dx; dx = dy; dy = -t; }
    swipe = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) pick(sel + (dx < 0 ? 1 : -1));
  });

  // ---------- pausa y victoria ----------
  function syncPause() {
    const s = G.endless ? null : stat(G.spec.id);
    $('pzName').textContent = G.spec.name;
    $('pzBars').hidden = G.endless;
    if (s) {
      $('pzNormFill').style.transform = `scaleX(${s.best / 100})`; $('pzNormPct').textContent = `${s.best}%`;
      $('pzPracFill').style.transform = `scaleX(${s.practice / 100})`; $('pzPracPct').textContent = `${s.practice}%`;
    }
    $('pzPractice').hidden = G.endless;
    $('pzPractice').textContent = G.practice ? 'Salir de práctica' : 'Modo práctica';
    $('pzMusic').value = Math.round(save.music * 100); $('pzSfx').value = Math.round(save.sfx * 100);
  }
  function showWin() {
    const s = stat(G.spec.id);
    $('wnName').textContent = G.spec.name + (G.practice ? ' · práctica' : '');
    $('wnAtt').textContent = G.attempt;
    $('wnJumps').textContent = G.p.jumps;
    $('wnTime').textContent = fmtTime(G.p.t);
    const coins = $('wnCoins');
    coins.innerHTML = '';
    for (let k = 0; k < 3; k++) {
      const c = document.createElement('i');
      if (!G.practice && G.p.coins & (1 << k)) c.className = 'got new';
      else if (s.coins & (1 << k)) c.className = 'got';
      c.style.animationDelay = `${0.25 + k * 0.18}s`;
      coins.appendChild(c);
    }
    $('wnNote').textContent = G.practice ? 'En práctica las monedas no cuentan. Ahora inténtalo sin puntos de control.' : '';
    $('wnNext').hidden = G.idx >= N - 1;
    show('win');
  }

  // ---------- personalización ----------
  function buildIconScreen() {
    const gd = $('gridDesign');
    if (!gd.childElementCount) {
      RD.DESIGNS.forEach((name, i) => {
        const b = document.createElement('button');
        b.className = 'design'; b.setAttribute('aria-label', name); b.title = name;
        const c = document.createElement('canvas'); c.width = 96; c.height = 96;
        b.appendChild(c);
        b.addEventListener('click', () => { save.icon.design = i; persist(); applyIcon(); audio.sfxClick(); refreshIcons(); });
        gd.appendChild(b);
      });
      const mk = (id, key) => COLORS.forEach((col) => {
        const b = document.createElement('button');
        b.className = 'sw'; b.style.setProperty('--c', col); b.setAttribute('aria-label', `Color ${col}`);
        b.addEventListener('click', () => { save.icon[key] = col; persist(); applyIcon(); audio.sfxClick(); refreshIcons(); });
        $(id).appendChild(b);
      });
      mk('swC1', 'c1'); mk('swC2', 'c2');
      $('optTrail').addEventListener('change', (e) => { save.icon.trail = e.target.checked; persist(); applyIcon(); });
    }
    refreshIcons();
  }
  function refreshIcons() {
    const I = save.icon;
    [...$('gridDesign').children].forEach((b, i) => {
      b.classList.toggle('on', i === I.design);
      b.setAttribute('aria-pressed', i === I.design);
      const g = b.firstChild.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 96, 96); g.translate(48, 48);
      RD.DRAW.cube(g, 62, i, I.c1, I.c2);
    });
    const mark = (id, key) => [...$(id).children].forEach((b, i) => { const on = COLORS[i] === I[key]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    mark('swC1', 'c1'); mark('swC2', 'c2');
    $('optTrail').checked = !!I.trail;
    drawPreview(performance.now() / 1000);
  }
  function drawPreview(t) {
    const c = $('pvCanvas');
    if (!c || screen !== 'icons') return;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
    if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const I = save.icon;
    const big = Math.min(w * 0.36, h * 0.48);
    g.save(); g.translate(w / 2, h * 0.38);
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, big * 1.4);
    glow.addColorStop(0, RD.css(RD.hexc(I.c1), 0.35)); glow.addColorStop(1, RD.css(RD.hexc(I.c1), 0));
    g.fillStyle = glow; g.fillRect(-big * 1.5, -big * 1.5, big * 3, big * 3);
    g.rotate(t == null ? 0 : Math.sin(t * 1.4) * 0.12);
    RD.DRAW.cube(g, big, I.design, I.c1, I.c2);
    g.restore();
    const modes = ['ship', 'ball', 'ufo', 'wave'];
    const s = Math.min(w / 6.2, h * 0.24);
    modes.forEach((m, i) => {
      g.save(); g.translate(w * (0.17 + i * 0.22), h * 0.82);
      if (m === 'ball') g.rotate((t || 0) * 2);
      if (m === 'wave') g.rotate(-Math.PI / 4);
      RD.DRAW[m](g, s, I.design, I.c1, I.c2);
      g.restore();
    });
  }

  // ---------- ajustes ----------
  function syncSettings() {
    $('volMusic').value = Math.round(save.music * 100);
    $('volSfx').value = Math.round(save.sfx * 100);
    $('optFx').value = save.fx;
    $('optFps').checked = !!save.fps;
  }
  function setVol(m, s) { save.music = m; save.sfx = s; audio.setVolumes(m, s); persist(); }
  $('volMusic').addEventListener('input', (e) => setVol(e.target.value / 100, save.sfx));
  $('volSfx').addEventListener('input', (e) => setVol(save.music, e.target.value / 100));
  $('volSfx').addEventListener('change', () => audio.sfxCoin());
  $('pzMusic').addEventListener('input', (e) => setVol(e.target.value / 100, save.sfx));
  $('pzSfx').addEventListener('input', (e) => setVol(save.music, e.target.value / 100));
  $('optFx').addEventListener('change', (e) => { save.fx = e.target.value; rend.hq = save.fx !== 'low'; persist(); layout(); });
  $('optFps').addEventListener('change', (e) => { save.fps = e.target.checked; $('fps').hidden = !save.fps; persist(); });
  let resetArm = 0;
  $('btnReset').addEventListener('click', () => {
    const now = Date.now();
    if (now - resetArm < 4000) {
      const keep = { icon: save.icon, music: save.music, sfx: save.sfx, fx: save.fx, fps: save.fps };
      save = Object.assign(defaults(), keep); persist();
      $('btnReset').textContent = 'Progreso borrado';
      resetArm = 0;
      setTimeout(() => { $('btnReset').textContent = 'Borrar progreso'; }, 2200);
    } else {
      resetArm = now;
      $('btnReset').textContent = 'Toca otra vez para confirmar';
      setTimeout(() => { if (Date.now() - resetArm >= 3900) $('btnReset').textContent = 'Borrar progreso'; }, 4000);
    }
  });

  // ---------- botones ----------
  const on = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(e); });
  on('btnPlay', () => { audio.sfxClick(); show('levels'); });
  on('btnIcons', () => { audio.sfxClick(); show('icons'); });
  on('btnSettings', () => { audio.sfxClick(); show('settings'); });
  on('lvBack', () => { audio.sfxClick(); show('title'); });
  on('icBack', () => { audio.sfxClick(); show('title'); });
  on('stBack', () => { audio.sfxClick(); show('title'); });
  on('lvPrev', () => pick(sel - 1));
  on('lvNext', () => pick(sel + 1));
  on('lvGo', () => startLevel(sel === N ? 'endless' : sel, false));
  on('lvPractice', () => startLevel(sel, true));
  on('lvDemo', () => watchDemo(sel));
  on('btnPause', () => { if (screen === 'watch') endWatch(); else pauseGame(); });
  on('pzResume', () => resumeGame());
  on('pzRestart', () => { show('play'); restart(); });
  on('pzPractice', () => {
    G.practice = !G.practice; G.cps = []; G.lastCp = -9;
    $('pracCtl').hidden = !G.practice;
    show('play');
    spawn(false);
  });
  on('pzExit', () => exitToMenu());
  on('cpAdd', () => addCheckpoint(true));
  on('cpDel', () => removeCheckpoint());
  on('wnMenu', () => { audio.stop(0.3); G = null; show('levels'); });
  on('wnRetry', () => { show('play'); G.cps = []; spawn(false); });
  on('wnNext', () => { audio.stop(0.1); const nx = G.idx + 1; G = null; sel = nx; startLevel(nx, false); });
  ['btnPause', 'cpAdd', 'cpDel'].forEach((id) => $(id).addEventListener('pointerdown', (e) => e.stopPropagation()));

  // ---------- arranque ----------
  function start(data) {
    if (data && typeof data.sel === 'number') sel = Math.max(0, Math.min(N, data.sel));
    $('fps').hidden = !save.fps;
    layout();
    show('title');
    requestAnimationFrame((t) => { last = t; frame(t); });
    if (document.fonts && document.fonts.load) document.fonts.load('20px "Bungee"').catch(() => {});
  }
  const HOT = window.claude && window.claude.hot;
  try { if (HOT && HOT.snapshot) HOT.snapshot(() => ({ sel })); } catch (e) { /* opcional */ }
  if (HOT && HOT.ready) HOT.ready(start); else start((HOT && HOT.data) || {});
})();
