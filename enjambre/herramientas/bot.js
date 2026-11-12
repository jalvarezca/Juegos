#!/usr/bin/env node
/* Bot que juega partidas completas a varios niveles de habilidad para medir la dificultad.
   Uso: node enjambre/herramientas/bot.js [poor|avg|good|sniper] */
const M = require("../motor.js");
const DT = 1 / 120;
const LEVELS = {
  good: { react: 0.12, err: 2, look: 0.9, margin: 5, spam: true },
  avg: { react: 0.22, err: 5, look: 0.7, margin: 3, spam: true },
  poor: { react: 0.34, err: 10, look: 0.45, margin: 0, spam: true },
  sniper: { react: 0.12, err: 2, look: 0.9, margin: 5, spam: false }
};
function makeBot(level, rng) {
  const L = LEVELS[level];
  let t = 0, plan = null, planT = 0, aimErr = 0;
  const plans = [{ m: 0, d: 0 }];
  for (const m of [-1, 1]) for (const d of [0.08, 0.16, 0.28, 0.42, 0.6]) plans.push({ m, d });
  function danger(S, pl) {
    const p = S.player;
    let first = Infinity;
    for (const b of S.bombs) {
      const r = M.BOMB[b.kind].r;
      for (let tau = 0; tau <= L.look; tau += 1 / 30) {
        const by = b.y + b.vy * tau, bx = b.x + b.vx * tau;
        if (Math.abs(by - M.PY) > 7 + r + 2) continue;
        const px = Math.max(16, Math.min(M.W - 16, p.x + pl.m * 270 * Math.min(tau, pl.d)));
        if (Math.abs(bx - px) < 10 + r + L.margin) { first = Math.min(first, tau); break; }
      }
    }
    return first;
  }
  return S => {
    t -= DT; planT -= DT;
    if (t > 0 && plan) return { move: planT > 0 ? plan.m : 0, fire: plan.fire };
    t = L.react * (0.7 + rng() * 0.6);
    const p = S.player, G = S.grid;
    // objetivo con adelanto
    const shotT = y => (M.PY - 16 - y) / 560;
    let tx = null;
    if (S.ufo) { const tt = shotT(S.ufo.y); tx = S.ufo.x + S.ufo.dir * S.ufo.speed * tt; if (tx < 10 || tx > M.W - 10) tx = null; }
    if (tx == null && S.boss) { const B = S.boss, tt = shotT(B.y); tx = M.W / 2 + Math.sin((B.t + tt) * 0.7) * 110; }
    if (tx == null && G.alive) {
      const sp = M.gridSpeed(S) * G.dir;
      let best = Infinity;
      for (const a of G.cells) if (a.alive) {
        const ax = M.alienX(S, a) + sp * shotT(M.alienY(S, a));
        const d = Math.abs(ax - p.x) - a.row * 6;
        if (d < best) { best = d; tx = ax; }
      }
    }
    if (rng() < 0.3) aimErr = (rng() * 2 - 1) * L.err;
    if (tx == null) tx = p.x; else tx += aimErr;
    // elegir el plan seguro que acerque más al objetivo
    let bestPlan = null, bestScore = -Infinity;
    for (const pl of plans) {
      const dz = danger(S, pl);
      const end = Math.max(16, Math.min(M.W - 16, p.x + pl.m * 270 * pl.d));
      const score = (dz === Infinity ? 1000 : dz * 500) - Math.abs(end - tx) - pl.d * 10;
      if (score > bestScore) { bestScore = score; bestPlan = pl; }
    }
    plan = { m: bestPlan.m, fire: L.spam || Math.abs(tx - p.x) < 6 };
    planT = bestPlan.d;
    return { move: plan.m, fire: plan.fire };
  };
}
function play(level, seed, maxT = 1200) {
  const S = M.create({ seed });
  const bot = makeBot(level, M.mulberry32(seed * 7 + 1));
  const deaths = [];
  let lastKill = null;
  while (S.state !== "over" && S.t < maxT) {
    const before = S.bombs.map(b => ({ kind: b.kind, x: b.x, y: b.y }));
    M.step(S, DT, bot(S));
    for (const e of S.events) if (e.t === "playerHit" && e.invaded) deaths.push(S.wave + "I");
    for (const e of S.events) if (e.t === "playerHit" && !e.invaded) {
      const near = before.filter(b => Math.abs(b.y - M.PY) < 14 && Math.abs(b.x - e.x) < 16)[0];
      deaths.push(S.wave + (near ? near.kind[0] : "?") + (S.boss ? "B" : ""));
    }
    S.events.length = 0;
  }
  return { wave: S.wave, cleared: S.stats.cleared, score: S.score, t: Math.round(S.t), acc: S.stats.hits / Math.max(1, S.stats.shots), deaths };
}
const levels = process.argv[2] ? [process.argv[2]] : ["poor", "avg", "good", "sniper"];
for (const level of levels) {
  const rs = []; for (let seed = 1; seed <= 16; seed++) rs.push(play(level, seed));
  const avg = k => (rs.reduce((s, r) => s + r[k], 0) / rs.length).toFixed(1);
  console.log(level.padEnd(5), "limpias", avg("cleared"), "pts", avg("score"), "t", avg("t"), "prec", avg("acc"),
    "| oleadas:", rs.map(r => r.wave).join(" "), "| muertes:", rs.slice(0, 6).map(r => r.deaths.join("/")).join("  "));
}
