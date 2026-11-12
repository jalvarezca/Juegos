/* Enjambre: motor del juego, sin DOM. La interfaz llama a step() con pasos fijos (1/120 s) y dibuja el estado.
   Coordenadas lógicas: 360 × 600; la nave abajo y el enjambre arriba. */
(function (root) {
  "use strict";
  const W = 360, H = 600, PY = 552, TOP = 30, MARGIN = 8;
  // Tipos de alienígena: caja de choque y puntos. a = vigía (arriba), b = escarabajo, c = medusa (abajo).
  const TYPES = { a: { w: 16, h: 16, pts: 30 }, b: { w: 20, h: 15, pts: 20 }, c: { w: 20, h: 16, pts: 10 } };
  const COLS = 11, DX = 25, DY = 24, DROP = 12, GRID_X = (W - (COLS - 1) * DX) / 2;
  // Formaciones: cada oleada usa la siguiente; las oleadas 5, 10, 15… son de jefe.
  const FORMATIONS = [
    ["...aaaaa...", ".bbbbbbbbb.", "bbbbbbbbbbb", "ccccccccccc", ".ccccccccc."],
    ["aaa.aaa.aaa", "bbbbbbbbbbb", "bbb.bbb.bbb", "ccccccccccc", "ccc.ccc.ccc"],
    [".....a.....", "...aaaaa...", ".bbbbbbbbb.", "bbbbbbbbbbb", ".ccccccccc.", "...ccccc..."],
    ["a.a.a.a.a.a", ".b.b.b.b.b.", "b.b.b.b.b.b", ".c.c.c.c.c.", "c.c.c.c.c.c", ".c.c.c.c.c."],
    ["aa.......aa", "bbb.....bbb", "bbbb...bbbb", "ccccc.ccccc", "ccccccccccc"]
  ];
  const FORMATION_NAMES = ["wedge", "wall", "diamond", "checker", "wings"];
  const BOSS_ROWS = ["b.b.b.b.b.b", "c.ccccccc.c"];
  // Barreras de energía: 16 × 9 celdas de 3 px con forma de lente.
  const CELL = 3, SW = 16, SH = 9, BARRIER_Y = 466, BARRIER_X = [54, 138, 222, 306];
  const BARRIER = ["....########....", "..############..", ".##############.", "################", "################",
    "################", ".##############.", "..############..", "....########...."];
  // Proyectiles enemigos: velocidad, si un disparo los anula, radio de choque y radio de daño en la barrera.
  const BOMB = { zig: { vy: 150, cancel: true, r: 2, dig: 2.1 }, fast: { vy: 235, cancel: true, r: 2, dig: 1.8 }, plasma: { vy: 160, cancel: false, r: 4, dig: 2.7 } };
  const POWER_TIME = { rapid: 10, spread: 9 }, LIFE_EVERY = 10000, MAX_LIVES = 5;
  const NO_INPUT = { move: 0, target: null, fire: false };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const isBoss = w => w % 5 === 0;
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function compact(arr) {
    let j = 0;
    for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[j++] = arr[i];
    arr.length = j;
  }
  function formationFor(wave) {
    if (isBoss(wave)) return { rows: BOSS_ROWS, name: "boss" };
    const k = (wave - 1 - Math.floor((wave - 1) / 5)) % FORMATIONS.length;
    return { rows: FORMATIONS[k], name: FORMATION_NAMES[k] };
  }
  const alienX = (S, a) => S.grid.x + a.col * DX;
  const alienY = (S, a) => S.grid.y + a.row * DY;

  function newBarriers() {
    return BARRIER_X.map(cx => {
      const cells = new Uint8Array(SW * SH);
      BARRIER.forEach((row, y) => { for (let x = 0; x < SW; x++) cells[y * SW + x] = row[x] === "#" ? 1 : 0; });
      return { x: cx - (SW * CELL) / 2, y: BARRIER_Y, cells, dirty: true };
    });
  }

  function buildWave(S) {
    const f = formationFor(S.wave), boss = isBoss(S.wave);
    const armorP = boss ? 0 : Math.min(0.45, 0.1 * (S.wave - 2));
    const cells = [];
    f.rows.forEach((row, r) => {
      for (let c = 0; c < COLS; c++) {
        if (row[c] === ".") continue;
        const armor = S.rng() < armorP;
        cells.push({ type: row[c], row: r, col: c, hp: armor ? 2 : 1, armor, alive: true, flash: 0 });
      }
    });
    S.grid = {
      name: f.name, x: GRID_X, y: boss ? 150 : 78 + Math.min(42, (S.wave - 1) * 6), dir: S.wave % 2 ? 1 : -1,
      beatT: 0.5, beat: 0, cells, alive: cells.length, total: cells.length, rows: f.rows.length
    };
    S.boss = null;
    if (boss) {
      const hp = Math.round(36 * (1 + 0.5 * (S.wave / 5 - 1)));
      S.boss = { x: W / 2, y: 92, w: 112, h: 50, hp, max: hp, t: 0, atkT: 2.6, aimT: 4, burst: 0, burstT: 0, flash: 0, dead: false };
    }
    S.barriers = newBarriers();
    S.bombs = []; S.shots = []; S.powerups = [];
    S.ufo = null; S.ufoT = 15 + S.rng() * 8;
    S.bombT = 1.5;
    S.waveDamage = 0;
  }

  function create(opts) {
    opts = opts || {};
    const S = {
      W, H, PY, t: 0, rng: opts.rng || (opts.seed != null ? mulberry32(opts.seed) : Math.random),
      wave: opts.wave || 1, score: 0, lives: 3, nextLife: LIFE_EVERY,
      state: "intro", introT: 1.8, dieT: 0, clearT: 0,
      player: { x: W / 2, vx: 0, cd: 0, inv: 0, shield: 0, rapid: 0, spread: 0, alive: true },
      streak: 0, mult: 1, stats: { shots: 0, bullets: 0, hits: 0, kills: 0, maxMult: 1, bosses: 0, cleared: 0 }, events: []
    };
    buildWave(S);
    S.events.push({ t: "waveStart", wave: S.wave, boss: !!S.boss, formation: S.grid.name });
    return S;
  }

  function gridSpeed(S) {
    const frac = S.grid.alive / Math.max(1, S.grid.total);
    return Math.min(230, (20 + 2 * (S.wave - 1)) * (1 + 3.4 * Math.pow(1 - frac, 1.8)));
  }
  // Borde inferior del enjambre (para avisar del peligro y para la invasión)
  function swarmBottom(S) {
    let bottom = -Infinity;
    for (const a of S.grid.cells) if (a.alive) bottom = Math.max(bottom, alienY(S, a) + TYPES[a.type].h / 2);
    return bottom;
  }

  function addScore(S, pts, useMult) {
    const v = Math.round(pts * (useMult === false ? 1 : S.mult));
    S.score += v;
    while (S.score >= S.nextLife) {
      S.nextLife += LIFE_EVERY;
      if (S.lives < MAX_LIVES) { S.lives++; S.events.push({ t: "life", bonus: true }); }
    }
    return v;
  }
  function hitStreak(S) {
    S.streak++;
    S.stats.hits++;
    const m = Math.min(4, 1 + Math.floor(S.streak / 8));
    if (m > S.mult) S.events.push({ t: "mult", mult: m });
    S.mult = m;
    S.stats.maxMult = Math.max(S.stats.maxMult, m);
  }
  function loseStreak(S) {
    if (S.mult > 1) S.events.push({ t: "multLost" });
    S.streak = 0; S.mult = 1;
  }

  // ---------- barreras ----------
  function barrierHit(S, x0, y0, x1, y1) {
    for (const b of S.barriers) {
      if (Math.max(x0, x1) < b.x || Math.min(x0, x1) >= b.x + SW * CELL || Math.max(y0, y1) < b.y || Math.min(y0, y1) >= b.y + SH * CELL) continue;
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 1.5));
      for (let k = 1; k <= n; k++) {
        const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n;
        const cx = Math.floor((x - b.x) / CELL), cy = Math.floor((y - b.y) / CELL);
        if (cx >= 0 && cy >= 0 && cx < SW && cy < SH && b.cells[cy * SW + cx]) return { b, x, y };
      }
    }
    return null;
  }
  function erode(S, b, x, y, r, down) {
    const cx = (x - b.x) / CELL, cy = (y - b.y) / CELL;
    for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) {
      for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
        if (xx < 0 || yy < 0 || xx >= SW || yy >= SH) continue;
        const d = Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy);
        if (d <= r && (d < r * 0.6 || S.rng() < 0.6)) b.cells[yy * SW + xx] = 0;
      }
    }
    b.dirty = true;
    S.events.push({ t: "chip", x, y, down });
  }
  function crush(b, x, y, w, h) {
    const x0 = Math.max(0, Math.floor((x - w / 2 - b.x) / CELL)), x1 = Math.min(SW - 1, Math.floor((x + w / 2 - b.x) / CELL));
    const y0 = Math.max(0, Math.floor((y - h / 2 - b.y) / CELL)), y1 = Math.min(SH - 1, Math.floor((y + h / 2 - b.y) / CELL));
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) if (b.cells[yy * SW + xx]) { b.cells[yy * SW + xx] = 0; b.dirty = true; }
    }
  }

  // ---------- nave ----------
  function movePlayer(S, dt, input) {
    const p = S.player, x0 = p.x;
    p.inv = Math.max(0, p.inv - dt);
    p.rapid = Math.max(0, p.rapid - dt);
    p.spread = Math.max(0, p.spread - dt);
    p.cd -= dt;
    if (!p.alive) { p.vx = 0; return; }
    if (input.target != null) p.x += clamp(input.target - p.x, -1400 * dt, 1400 * dt);
    else p.x += clamp(input.move || 0, -1, 1) * 270 * dt;
    p.x = clamp(p.x, 16, W - 16);
    p.vx = (p.x - x0) / dt;
  }
  function fire(S, input) {
    const p = S.player;
    if (!input.fire || !p.alive || p.cd > 0) return;
    const spread = p.spread > 0, angles = spread ? [-0.2, 0, 0.2] : [0];
    if (S.shots.length + angles.length > (spread ? 12 : 4)) return;
    p.cd = p.rapid > 0 ? 0.11 : 0.26;
    for (const a of angles) S.shots.push({ x: p.x, y: PY - 16, vx: Math.sin(a) * 560, vy: -Math.cos(a) * 560, dead: false });
    S.stats.shots++;
    S.stats.bullets += angles.length;
    S.events.push({ t: "shot", x: p.x, y: PY - 16, spread, rapid: p.rapid > 0 });
  }

  // ---------- enjambre ----------
  function moveGrid(S, dt) {
    const G = S.grid;
    if (!G.alive) return;
    const speed = gridSpeed(S);
    G.x += G.dir * speed * dt;
    let left = Infinity, right = -Infinity, bottom = -Infinity;
    for (const a of G.cells) {
      if (!a.alive) continue;
      const T = TYPES[a.type], x = alienX(S, a), y = alienY(S, a);
      left = Math.min(left, x - T.w / 2); right = Math.max(right, x + T.w / 2); bottom = Math.max(bottom, y + T.h / 2);
    }
    if ((G.dir > 0 && right > W - MARGIN) || (G.dir < 0 && left < MARGIN)) {
      G.x -= G.dir > 0 ? right - (W - MARGIN) : left - MARGIN;
      G.dir = -G.dir;
      G.y += DROP;
      bottom += DROP;
      S.events.push({ t: "drop" });
    }
    G.beatT -= dt;
    if (G.beatT <= 0) {
      G.beatT = clamp(9 / speed, 0.1, 0.6);
      G.beat++;
      S.events.push({ t: "beat", n: G.beat, speed });
    }
    // Los alienígenas que llegan a una barrera la aplastan; si alcanzan la fila de la nave, invaden.
    if (bottom >= BARRIER_Y) {
      for (const a of G.cells) {
        if (!a.alive) continue;
        const T = TYPES[a.type], y = alienY(S, a);
        if (y + T.h / 2 >= BARRIER_Y) for (const b of S.barriers) crush(b, alienX(S, a), y, T.w, T.h);
      }
    }
    if (bottom >= PY - 12) invade(S);
  }
  // Si el enjambre alcanza la fila de la nave, la arrolla: se pierde una vida y el enjambre retrocede cuatro filas.
  function invade(S) {
    const p = S.player;
    S.waveDamage++;
    S.lives--;
    p.alive = false;
    p.shield = p.rapid = p.spread = 0;
    loseStreak(S);
    S.bombs.length = 0;
    S.grid.y -= 4 * DY;
    S.events.push({ t: "playerHit", x: p.x, y: PY, lives: S.lives, invaded: true });
    if (S.lives <= 0) { S.state = "over"; S.events.push({ t: "gameOver", invaded: true }); }
    else { S.state = "dying"; S.dieT = 2.2; }
  }
  function addBomb(S, x, y, vx, vy, kind, home) {
    S.bombs.push({ x, x0: x, y, vx, vy, kind, home, ph: S.rng() * 6.28, dead: false });
  }
  function enemyFire(S, dt) {
    const G = S.grid;
    if (!G.alive) return;
    S.bombT -= dt;
    if (S.bombT > 0) return;
    S.bombT = Math.max(0.22, (0.55 + S.rng() * 0.9) * Math.pow(0.9, S.wave - 1));
    if (S.bombs.length >= Math.min(8, 3 + (S.wave >> 1))) return;
    // Disparan los alienígenas más bajos de cada columna; a veces, el que está sobre la nave.
    const low = [];
    for (const a of G.cells) if (a.alive && (!low[a.col] || a.row > low[a.col].row)) low[a.col] = a;
    const list = low.filter(Boolean);
    let a = list[Math.floor(S.rng() * list.length)];
    if (S.rng() < 0.35) {
      let best = Infinity;
      for (const s of list) {
        const d = Math.abs(alienX(S, s) - S.player.x);
        if (d < best) { best = d; a = s; }
      }
    }
    const x = alienX(S, a), y = alienY(S, a) + TYPES[a.type].h / 2;
    const r = S.rng(), kind = S.wave >= 3 && r < 0.2 ? "plasma" : r < 0.6 ? "zig" : "fast";
    addBomb(S, x, y, 0, BOMB[kind].vy * (1 + 0.03 * Math.min(10, S.wave - 1)), kind, kind === "plasma");
    S.events.push({ t: "bomb", kind, x, y });
  }

  // ---------- nave nodriza de bonificación y jefe ----------
  function runUfo(S, dt) {
    if (S.boss) return;
    if (!S.ufo) {
      S.ufoT -= dt;
      if (S.ufoT <= 0) {
        if (S.grid.alive < 8) { S.ufoT = 6; return; }
        const dir = S.rng() < 0.5 ? 1 : -1;
        S.ufo = { x: dir > 0 ? -24 : W + 24, y: 50, dir, speed: 90, pts: [50, 100, 150, 300][Math.floor(S.rng() * 4)], t: 0 };
        S.events.push({ t: "ufo" });
      }
      return;
    }
    const U = S.ufo;
    U.t += dt;
    U.x += U.dir * U.speed * dt;
    if ((U.dir > 0 && U.x > W + 30) || (U.dir < 0 && U.x < -30)) { S.ufo = null; S.ufoT = 18 + S.rng() * 10; S.events.push({ t: "ufoGone" }); }
  }
  function runBoss(S, dt) {
    const B = S.boss;
    if (!B) return;
    B.t += dt;
    B.flash = Math.max(0, B.flash - dt);
    B.x = W / 2 + Math.sin(B.t * 0.7) * 110;
    const rage = B.hp <= B.max / 2, mouth = B.y + 20;
    B.atkT -= dt;
    if (B.atkT <= 0) {
      B.atkT = rage ? 1.7 : 2.4;
      const n = rage ? 7 : 5;
      for (let k = 0; k < n; k++) {
        const ang = (k - (n - 1) / 2) * 0.22;
        addBomb(S, B.x, mouth, Math.sin(ang) * 150, Math.cos(ang) * 150, "plasma", false);
      }
      S.events.push({ t: "bossVolley", x: B.x, y: mouth });
    }
    B.aimT -= dt;
    if (B.aimT <= 0) { B.aimT = rage ? 2.6 : 3.6; B.burst = 3; B.burstT = 0; }
    if (B.burst > 0) {
      B.burstT -= dt;
      if (B.burstT <= 0) {
        B.burst--;
        B.burstT = 0.15;
        const dx = S.player.x - B.x, dy = PY - mouth, d = Math.hypot(dx, dy) || 1;
        addBomb(S, B.x, mouth, (dx / d) * 250, (dy / d) * 250, "fast", false);
        S.events.push({ t: "bomb", kind: "fast", x: B.x, y: mouth });
      }
    }
  }
  function killBoss(S) {
    const B = S.boss, G = S.grid;
    S.stats.bosses++;
    const pts = addScore(S, 1000 * Math.max(1, S.wave / 5));
    S.events.push({ t: "bossDie", x: B.x, y: B.y, pts });
    dropPower(S, B.x - 16, B.y, true);
    dropPower(S, B.x + 16, B.y, true);
    // La escolta cae con su reina, en cadena desde el centro de la explosión.
    for (const a of G.cells) {
      if (!a.alive) continue;
      a.alive = false;
      G.alive--;
      const x = alienX(S, a), y = alienY(S, a);
      const p = addScore(S, TYPES[a.type].pts, false);
      S.events.push({ t: "kill", x, y, type: a.type, pts: p, armor: false, delay: Math.hypot(x - B.x, y - B.y) / 400 });
    }
    S.bombs.length = 0;
    S.boss = null;
  }

  // ---------- mejoras ----------
  function dropPower(S, x, y, sure) {
    if (!sure && S.rng() > 0.035) return;
    const pool = ["rapid", "rapid", "rapid", "spread", "spread", "spread", "shield", "shield"];
    if (sure && S.lives < MAX_LIVES) pool.push("life", "life");
    S.powerups.push({ x, y, kind: pool[Math.floor(S.rng() * pool.length)], t: 0, dead: false });
  }

  // ---------- disparos y choques ----------
  function moveShots(S, dt) {
    const G = S.grid;
    for (const s of S.shots) {
      const x0 = s.x, y0 = s.y;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.y < TOP || s.x < -6 || s.x > W + 6) { s.dead = true; loseStreak(S); continue; }
      const hb = barrierHit(S, x0, y0, s.x, s.y);
      if (hb) { erode(S, hb.b, hb.x, hb.y, 1.2, false); s.dead = true; continue; }
      let bomb = null;
      for (const b of S.bombs) {
        if (!b.dead && Math.abs(b.x - s.x) < BOMB[b.kind].r + 3 && b.y > s.y - 7 && b.y < y0 + 7) { bomb = b; break; }
      }
      if (bomb) {
        s.dead = true;
        if (BOMB[bomb.kind].cancel) { bomb.dead = true; S.events.push({ t: "clash", x: s.x, y: s.y }); }
        else S.events.push({ t: "absorb", x: s.x, y: s.y });
        continue;
      }
      let hit = null;
      if (G.alive) {
        for (const a of G.cells) {
          if (!a.alive) continue;
          const T = TYPES[a.type], ax = alienX(S, a), ay = alienY(S, a);
          if (Math.abs(s.x - ax) <= T.w / 2 + 1.5 && s.y <= ay + T.h / 2 && y0 >= ay - T.h / 2) { hit = a; break; }
        }
      }
      if (hit) {
        s.dead = true;
        hitStreak(S);
        const x = alienX(S, hit), y = alienY(S, hit);
        if (--hit.hp > 0) { hit.flash = 0.12; addScore(S, 5); S.events.push({ t: "armorHit", x, y, type: hit.type }); continue; }
        hit.alive = false;
        G.alive--;
        S.stats.kills++;
        const pts = addScore(S, TYPES[hit.type].pts * (hit.armor ? 1.5 : 1));
        S.events.push({ t: "kill", x, y, type: hit.type, pts, armor: hit.armor, delay: 0 });
        dropPower(S, x, y, false);
        continue;
      }
      const U = S.ufo;
      if (U && Math.abs(s.x - U.x) < 17 && s.y < U.y + 8 && y0 > U.y - 8) {
        s.dead = true;
        hitStreak(S);
        const pts = addScore(S, U.pts);
        S.events.push({ t: "ufoKill", x: U.x, y: U.y, pts });
        dropPower(S, U.x, U.y, true);
        S.ufo = null;
        S.ufoT = 18 + S.rng() * 10;
        continue;
      }
      const B = S.boss;
      if (B) {
        const ex = (s.x - B.x) / (B.w / 2), ey = (s.y - B.y) / (B.h / 2);
        if (ex * ex + ey * ey < 1) {
          s.dead = true;
          hitStreak(S);
          B.hp--;
          B.flash = 0.07;
          addScore(S, 10);
          S.events.push({ t: "bossHit", x: s.x, y: s.y, hp: B.hp, max: B.max });
          if (B.hp <= 0) killBoss(S);
        }
      }
    }
    compact(S.shots);
  }

  function hurtPlayer(S) {
    const p = S.player;
    if (!p.alive || p.inv > 0) return;
    S.waveDamage++;
    if (p.shield) { p.shield = 0; p.inv = 1; S.events.push({ t: "shieldPop", x: p.x, y: PY }); return; }
    S.lives--;
    p.alive = false;
    p.rapid = p.spread = 0;
    loseStreak(S);
    S.bombs.length = 0;
    S.state = "dying";
    S.dieT = 1.7;
    S.events.push({ t: "playerHit", x: p.x, y: PY, lives: S.lives });
  }
  function moveBombs(S, dt) {
    const p = S.player;
    for (const b of S.bombs) {
      if (b.dead) continue;
      const x0 = b.x, y0 = b.y;
      b.ph += dt * 10;
      if (b.home) b.vx = clamp(b.vx + Math.sign(p.x - b.x) * 45 * dt, -55, 55);
      b.x0 += b.vx * dt;
      b.x = b.kind === "zig" ? b.x0 + Math.sin(b.ph) * 3 : b.x0;
      b.y += b.vy * dt;
      if (b.y > H + 10 || b.x < -10 || b.x > W + 10) { b.dead = true; continue; }
      const hb = barrierHit(S, x0, y0, b.x, b.y);
      if (hb) { erode(S, hb.b, hb.x, hb.y, BOMB[b.kind].dig, true); b.dead = true; continue; }
      const r = BOMB[b.kind].r;
      if (p.alive && Math.abs(b.x - p.x) < 10 + r && Math.abs(b.y - PY) < 7 + r) {
        b.dead = true;
        hurtPlayer(S);
        if (!S.bombs.length) return;
      }
    }
    compact(S.bombs);
  }
  function movePowerups(S, dt) {
    const p = S.player;
    for (const u of S.powerups) {
      u.t += dt;
      u.y += 90 * dt;
      if (u.y > H + 12) { u.dead = true; continue; }
      if (p.alive && Math.abs(u.x - p.x) < 20 && Math.abs(u.y - PY) < 18) {
        u.dead = true;
        if (u.kind === "life") S.lives = Math.min(MAX_LIVES, S.lives + 1);
        else if (u.kind === "shield") p.shield = 1;
        else p[u.kind] = POWER_TIME[u.kind];
        S.events.push({ t: "power", kind: u.kind, x: u.x, y: u.y });
      }
    }
    compact(S.powerups);
  }

  function clearWave(S) {
    S.state = "clear";
    S.clearT = 2.4;
    S.bombs.length = 0;
    if (S.ufo) { S.ufo = null; S.events.push({ t: "ufoGone" }); }
    S.stats.cleared++;
    const flawless = S.waveDamage === 0, bonus = addScore(S, 100 * S.wave * (flawless ? 2 : 1), false);
    S.events.push({ t: "waveClear", wave: S.wave, bonus, flawless });
  }

  function step(S, dt, input) {
    if (S.state === "over") return;
    input = input || NO_INPUT;
    S.t += dt;
    movePlayer(S, dt, input);
    for (const a of S.grid.cells) if (a.flash > 0) a.flash -= dt;
    if (S.state === "intro") {
      S.introT -= dt;
      if (S.introT <= 0) { S.state = "play"; S.events.push({ t: "go" }); }
    } else if (S.state === "play") {
      fire(S, input);
      moveGrid(S, dt);
      if (S.state !== "play") return;
      enemyFire(S, dt);
      runUfo(S, dt);
      runBoss(S, dt);
    } else if (S.state === "dying") {
      S.dieT -= dt;
      if (S.dieT <= 0) {
        if (S.lives > 0) {
          Object.assign(S.player, { alive: true, inv: 2, x: W / 2, vx: 0, cd: 0.2 });
          S.state = "play";
          S.events.push({ t: "respawn" });
        } else {
          S.state = "over";
          S.events.push({ t: "gameOver", invaded: false });
          return;
        }
      }
    } else if (S.state === "clear") {
      S.clearT -= dt;
      if (S.clearT <= 0) {
        S.wave++;
        buildWave(S);
        S.state = "intro";
        S.introT = 1.8;
        S.events.push({ t: "waveStart", wave: S.wave, boss: !!S.boss, formation: S.grid.name });
      }
    }
    moveShots(S, dt);
    moveBombs(S, dt);
    movePowerups(S, dt);
    if (S.state === "play" && !S.grid.alive && !S.boss) clearWave(S);
  }

  const motor = {
    W, H, PY, TOP, TYPES, COLS, DX, DY, CELL, SW, SH, BARRIER_Y, BOMB, POWER_TIME, LIFE_EVERY, MAX_LIVES,
    create, step, gridSpeed, swarmBottom, isBoss, formationFor, mulberry32, alienX, alienY
  };
  (root.Enjambre = root.Enjambre || {}).motor = motor;
  if (typeof module !== "undefined" && module.exports) module.exports = motor;
})(typeof window !== "undefined" ? window : globalThis);
