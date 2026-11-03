/* Reino: defensa del pueblo en tiempo real, sin DOM. Los rebeldes siguen el camino hasta la muralla;
   las torres disparan solas y el gobernador va adonde lo mandes y ataca a los que tiene cerca. */
(function (root) {
  "use strict";
  const R = root.Reino = root.Reino || {};
  const W = 360, H = 560, GATE_Y = 492;
  const PATH = [[205, -20], [205, 55], [85, 105], [85, 195], [275, 245], [275, 330], [105, 372], [105, 432], [180, 478], [180, GATE_Y]];
  const SLOTS = [[140, 40], [252, 45], [32, 150], [150, 172], [190, 290], [325, 290], [52, 405], [200, 405]];
  const KINDS = {
    grunt: { hp: 34, speed: 32, reward: 6, dmg: 1, armor: 0, r: 9, bite: 1 },
    runner: { hp: 20, speed: 58, reward: 5, dmg: 1, armor: 0, r: 8, bite: 1 },
    brute: { hp: 95, speed: 22, reward: 13, dmg: 2, armor: 0.35, r: 12, bite: 2 },
    boss: { hp: 700, speed: 18, reward: 90, dmg: 6, armor: 0.25, r: 17, bite: 4 }
  };
  // cost[0] construir, cost[1] mejorar a nivel 2, cost[2] mejorar a nivel 3.
  const TOWERS = {
    archer: { cost: [60, 70, 120], dmg: [10, 16, 26], rate: [1.25, 1.45, 1.7], range: [92, 102, 114], speed: 420 },
    cannon: { cost: [90, 100, 170], dmg: [24, 38, 60], rate: [0.5, 0.58, 0.68], range: [82, 90, 100], splash: [30, 34, 40], speed: 260 }
  };
  const GOV = { dmg: 16, rate: 1.6, range: 48, spin: 56, speed: 150 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Longitudes del camino para colocar a cada enemigo según lo que ha avanzado.
  const SEG = [];
  let LEN = 0;
  for (let i = 1; i < PATH.length; i++) {
    const [x0, y0] = PATH[i - 1], [x1, y1] = PATH[i], l = Math.hypot(x1 - x0, y1 - y0);
    SEG.push({ x0, y0, x1, y1, l, from: LEN });
    LEN += l;
  }
  function posAt(d) {
    for (const s of SEG) if (d <= s.from + s.l) { const k = (d - s.from) / s.l; return [s.x0 + (s.x1 - s.x0) * k, s.y0 + (s.y1 - s.y0) * k]; }
    const s = SEG[SEG.length - 1];
    return [s.x1, s.y1];
  }

  function plan(stage) {
    const waves = Math.min(7, 3 + Math.floor((stage - 1) / 3)), out = [];
    for (let w = 0; w < waves; w++) {
      const n = Math.round(5 + stage * 0.9 + w * 2), list = [];
      for (let i = 0; i < n; i++) list.push(stage >= 4 && i % 6 === 5 ? "brute" : stage >= 2 && i % 4 === 3 ? "runner" : "grunt");
      if (stage % 5 === 0 && w === waves - 1) list.push("boss");
      out.push(list);
    }
    return out;
  }

  function create(stage, mods) {
    mods = Object.assign({ tower: 1, gov: 1, govHp: 120, wall: 13 }, mods || {});
    return {
      stage, mods, t: 0, state: "play", stars: 0, coins: 110 + stage * 10, wall: mods.wall, wallMax: mods.wall,
      waves: plan(stage), wave: -1, queue: [], spawnT: 0, nextT: 3,
      hpScale: (1 + 0.12 * (stage - 1)) * Math.pow(1.035, stage - 1), payScale: Math.pow(1.04, stage - 1),
      gov: { x: 180, y: 455, tx: 180, ty: 455, hp: mods.govHp, max: mods.govHp, cd: 0, down: 0, hits: 0 },
      enemies: [], towers: SLOTS.map(() => null), shots: [], events: [], nextId: 1, kills: 0, leaks: 0
    };
  }

  function spawn(S, kind) {
    const k = KINDS[kind], hp = k.hp * S.hpScale;
    S.enemies.push({ id: S.nextId++, kind, hp, max: hp, d: 0, x: PATH[0][0], y: PATH[0][1], speed: k.speed, r: k.r, armor: k.armor, dmg: k.dmg, bite: k.bite, reward: Math.round(k.reward * S.payScale), dead: false, flash: 0 });
  }
  function hurt(S, e, dmg) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 0.08;
    if (e.hp <= 0) {
      e.dead = true;
      S.coins += e.reward;
      S.kills++;
      S.events.push({ t: "kill", x: e.x, y: e.y, coins: e.reward, kind: e.kind });
    }
  }

  function runWaves(S, dt) {
    if (S.queue.length) {
      S.spawnT -= dt;
      if (S.spawnT <= 0) { spawn(S, S.queue.shift()); S.spawnT = 0.85; }
      if (!S.queue.length) S.nextT = 8;
      return;
    }
    if (S.wave >= S.waves.length - 1) return;
    if (!S.enemies.length) S.nextT = Math.min(S.nextT, 2);
    S.nextT -= dt;
    if (S.nextT <= 0) startWave(S);
  }
  function startWave(S) {
    S.wave++;
    S.queue = S.waves[S.wave].slice();
    S.spawnT = 0;
    S.events.push({ t: "wave", n: S.wave + 1 });
  }
  // Llamar la siguiente oleada antes de tiempo da monedas extra.
  function callWave(S) {
    if (S.state !== "play" || S.queue.length || S.wave >= S.waves.length - 1) return 0;
    const bonus = S.wave < 0 ? 0 : Math.round(Math.max(0, S.nextT) * 3);
    S.coins += bonus;
    startWave(S);
    return bonus;
  }

  function moveEnemies(S, dt) {
    const g = S.gov;
    for (const e of S.enemies) {
      if (e.dead) continue;
      e.d += e.speed * dt;
      e.flash = Math.max(0, e.flash - dt);
      if (e.d >= LEN) {
        e.dead = true;
        S.wall -= e.dmg;
        S.leaks++;
        S.events.push({ t: "leak", dmg: e.dmg });
        continue;
      }
      [e.x, e.y] = posAt(e.d);
      if (g.down <= 0 && Math.hypot(e.x - g.x, e.y - g.y) < e.r + 12) g.hp -= 5 * Math.pow(S.hpScale, 0.6) * e.bite * dt;
    }
  }

  function runTowers(S, dt) {
    S.towers.forEach((T, i) => {
      if (!T) return;
      const spec = TOWERS[T.kind], lv = T.lvl - 1, [sx, sy] = SLOTS[i];
      T.cd -= dt;
      if (T.cd > 0) return;
      let best = null;
      for (const e of S.enemies) if (!e.dead && Math.hypot(e.x - sx, e.y - sy) <= spec.range[lv] && (!best || e.d > best.d)) best = e;
      if (!best) { T.cd = 0.1; return; }
      T.cd = 1 / spec.rate[lv];
      T.aim = Math.atan2(best.y - sy, best.x - sx);
      S.shots.push({ kind: T.kind, x: sx, y: sy - 10, tx: best.x, ty: best.y, target: best.id, dmg: spec.dmg[lv] * S.mods.tower, splash: spec.splash ? spec.splash[lv] : 0, speed: spec.speed });
      S.events.push({ t: "shot", kind: T.kind });
    });
  }
  function runShots(S, dt) {
    for (const s of S.shots) {
      if (s.kind === "archer") {
        const e = S.enemies.find(x => x.id === s.target && !x.dead);
        if (e) { s.tx = e.x; s.ty = e.y; }
      }
      const dx = s.tx - s.x, dy = s.ty - s.y, dist = Math.hypot(dx, dy), stepLen = s.speed * dt;
      if (dist > stepLen + 4) { s.x += dx / dist * stepLen; s.y += dy / dist * stepLen; continue; }
      s.done = true;
      if (s.kind === "archer") {
        const e = S.enemies.find(x => x.id === s.target && !x.dead);
        if (e) hurt(S, e, s.dmg * (1 - e.armor));
      } else {
        S.events.push({ t: "boom", x: s.tx, y: s.ty, r: s.splash });
        for (const e of S.enemies) if (!e.dead && Math.hypot(e.x - s.tx, e.y - s.ty) <= s.splash + e.r) hurt(S, e, s.dmg * (1 - e.armor * 0.5));
      }
    }
    S.shots = S.shots.filter(s => !s.done);
  }

  function runGov(S, dt) {
    const g = S.gov;
    if (g.down > 0) {
      g.down -= dt;
      if (g.down <= 0) { g.hp = g.max; g.x = g.tx = 180; g.y = g.ty = 470; S.events.push({ t: "govUp" }); }
      return;
    }
    const dx = g.tx - g.x, dy = g.ty - g.y, dist = Math.hypot(dx, dy), stepLen = GOV.speed * dt;
    if (dist > stepLen) { g.x += dx / dist * stepLen; g.y += dy / dist * stepLen; } else { g.x = g.tx; g.y = g.ty; }
    let near = null, nd = Infinity;
    for (const e of S.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - g.x, e.y - g.y); if (d < nd) { nd = d; near = e; } }
    if (!near || nd > 40) g.hp = Math.min(g.max, g.hp + g.max * 0.06 * dt);
    g.cd -= dt;
    if (g.cd <= 0 && near && nd <= GOV.range) {
      g.cd = 1 / GOV.rate;
      g.hits++;
      const dmg = GOV.dmg * S.mods.gov;
      if (g.hits % 4 === 0) {
        S.events.push({ t: "spin", x: g.x, y: g.y, r: GOV.spin });
        for (const e of S.enemies) if (!e.dead && Math.hypot(e.x - g.x, e.y - g.y) <= GOV.spin) hurt(S, e, dmg * 0.8);
      } else {
        S.events.push({ t: "slash", x: near.x, y: near.y });
        hurt(S, near, dmg);
      }
    }
    if (g.hp <= 0) { g.hp = 0; g.down = 5; S.events.push({ t: "govDown" }); }
  }

  function step(S, dt, input) {
    if (S.state !== "play") return;
    S.t += dt;
    if (input && input.tx != null) { S.gov.tx = clamp(input.tx, 12, W - 12); S.gov.ty = clamp(input.ty, 16, GATE_Y - 6); }
    runWaves(S, dt);
    moveEnemies(S, dt);
    runTowers(S, dt);
    runShots(S, dt);
    runGov(S, dt);
    S.enemies = S.enemies.filter(e => !e.dead);
    if (S.wall <= 0) {
      S.wall = 0;
      S.state = "lost";
      S.events.push({ t: "lost" });
    } else if (S.wave >= S.waves.length - 1 && !S.queue.length && !S.enemies.length) {
      const k = S.wall / S.wallMax;
      S.stars = k >= 0.9 ? 3 : k >= 0.5 ? 2 : 1;
      S.state = "won";
      S.events.push({ t: "won", stars: S.stars });
    }
  }

  function build(S, slot, kind) {
    if (S.state !== "play" || !TOWERS[kind] || !(slot >= 0 && slot < SLOTS.length) || S.towers[slot]) return false;
    const c = TOWERS[kind].cost[0];
    if (S.coins < c) return false;
    S.coins -= c;
    S.towers[slot] = { kind, lvl: 1, cd: 0.3, aim: -Math.PI / 2 };
    S.events.push({ t: "build", slot });
    return true;
  }
  const upgradeCost = (S, slot) => { const T = S.towers[slot]; return T && T.lvl < 3 ? TOWERS[T.kind].cost[T.lvl] : null; };
  function upgrade(S, slot) {
    const c = upgradeCost(S, slot);
    if (S.state !== "play" || c == null || S.coins < c) return false;
    S.coins -= c;
    S.towers[slot].lvl++;
    S.events.push({ t: "build", slot });
    return true;
  }

  R.defensa = { W, H, GATE_Y, PATH, SLOTS, KINDS, TOWERS, GOV, LEN, posAt, plan, create, step, build, upgrade, upgradeCost, callWave };
  if (typeof module !== "undefined" && module.exports) module.exports = R.defensa;
})(typeof window !== "undefined" ? window : globalThis);
