/* Reino: motor del juego, sin DOM. Todo el tiempo va en milisegundos absolutos (Date.now()),
   así la ciudad sigue produciendo y los temporizadores terminan aunque la página esté cerrada. */
(function (root) {
  "use strict";
  const R = root.Reino = root.Reino || {};
  const D = R.datos;
  const HOUR = 3600e3, MIN = 60e3;
  const VERSION = 1;

  const emptyTroops = () => ({ inf: [0, 0, 0, 0, 0, 0], cav: [0, 0, 0, 0, 0, 0], arc: [0, 0, 0, 0, 0, 0] });
  const dayKey = now => { const d = new Date(now); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); };
  const lvl = (S, k) => S.b[k] || 0;
  const sum = obj => Object.values(obj).reduce((a, b) => a + b, 0);

  function newGame(now) {
    const S = {
      v: VERSION, created: now, last: now, nextId: 1,
      res: { bread: 1500, wood: 1500, stone: 600, iron: 0, gold: 300, gems: 100, xp: 200, tokens: 1 },
      b: { center: 1, farm: 1, sawmill: 1, house: 1, wall: 1 },
      prod: {},
      troops: emptyTroops(), wounded: emptyTroops(),
      heroes: { tobias: { lvl: 1, stars: 0, shards: 0 } },
      formation: ["tobias", null, null, null, null],
      tech: {},
      timers: [],
      td: { best: 0, stars: {} },
      exp: { best: 0, idleT: now },
      map: null,
      stats: { trained: { inf: 0, cav: 0, arc: 0 }, rebels: 0, rebelMax: 0, gathers: 0, recruits: 0, bears: 0 },
      quest: 0,
      daily: { day: dayKey(now), counts: {}, claimed: [] },
      bear: { day: dayKey(now), attacks: 0, damage: 0, claimed: [], base: 0 },
      pity: 0
    };
    for (const k of Object.keys(S.b)) if (D.BUILDINGS[k].prod) S.prod[k] = { t: now, amt: 0 };
    return S;
  }

  // Bonificaciones de la investigación (en tanto por uno).
  function eff(S, key) {
    let v = 0;
    for (const k in S.tech) { const e = D.TECHS[k] && D.TECHS[k].eff[key]; if (e) v += e * S.tech[k]; }
    return v;
  }

  // Recursos
  const hasRes = (S, cost) => Object.keys(cost).every(r => (S.res[r] || 0) >= cost[r]);
  const pay = (S, cost) => { for (const r in cost) S.res[r] -= cost[r]; };
  function give(S, rew) { for (const r in rew || {}) S.res[r] = (S.res[r] || 0) + rew[r]; return rew; }
  const scaleCost = (cost, n) => Object.fromEntries(Object.entries(cost).map(([r, v]) => [r, Math.round(v * n)]));

  // Producción: cada edificio guarda lo producido hasta un tope de horas.
  function rate(S, key) {
    const b = D.BUILDINGS[key];
    return b.prod ? D.prodRate(key, lvl(S, key)) * (1 + eff(S, "prod_" + b.prod)) : 0;
  }
  const cap = (S, key) => rate(S, key) * D.STORE_HOURS;
  function accrue(S, key, t) {
    const p = S.prod[key];
    if (!p || t <= p.t) return;
    p.amt = Math.min(cap(S, key), p.amt + rate(S, key) * (t - p.t) / HOUR);
    p.t = t;
  }
  const accrueAll = (S, t) => { for (const k in S.prod) accrue(S, k, t); };
  function stored(S, key, now) { accrue(S, key, now); return S.prod[key] ? Math.floor(S.prod[key].amt) : 0; }
  function collect(S, now, key) {
    const got = {};
    for (const k of key ? [key] : Object.keys(S.prod)) {
      accrue(S, k, now);
      const n = Math.floor(S.prod[k] ? S.prod[k].amt : 0);
      if (n <= 0) continue;
      S.prod[k].amt -= n;
      const r = D.BUILDINGS[k].prod;
      S.res[r] += n;
      got[r] = (got[r] || 0) + n;
    }
    if (Object.keys(got).length) count(S, "collect");
    return got;
  }

  // Temporizadores (construcción, entrenamiento, curación, investigación y marchas)
  function addTimer(S, kind, key, now, ms, data) {
    const t = { id: S.nextId++, kind, key, start: now, end: now + Math.max(0, Math.round(ms)), data: data || {}, helped: false };
    S.timers.push(t);
    return t;
  }
  const timersOf = (S, kind, key) => S.timers.filter(t => t.kind === kind && (key == null || t.key === key));
  const timer = (S, id) => S.timers.find(t => t.id === id) || null;
  const builders = S => (lvl(S, "center") >= 6 ? 2 : 1);
  // Un edificio está ocupado si se está mejorando o si está entrenando, curando o investigando.
  function working(S, key) {
    return S.timers.some(t => (t.kind === "train" || t.kind === "heal" || t.kind === "research") && t.key === key);
  }

  // Mejoras de edificios
  const buildSeconds = (S, key, cur) => D.buildTime(key, cur) * (1 - Math.min(0.5, eff(S, "build_speed")));
  function upgradeInfo(S, key) {
    const b = D.BUILDINGS[key], cur = lvl(S, key), tc = lvl(S, "center");
    const info = { key, lvl: cur, cost: D.buildCost(key, cur), time: buildSeconds(S, key, cur), reqs: [], ok: false, reason: null };
    if (tc < b.unlock) { info.reqs.push(["center", b.unlock, false]); info.reason = "locked"; return info; }
    if (key === "center" && cur >= b.max) { info.reason = "max"; return info; }
    if (key !== "center" && cur >= 20) { info.reason = "max"; return info; }
    info.reqs = key === "center"
      ? D.centerReqs(cur + 1).map(([k, n]) => [k, n, lvl(S, k) >= n])
      : [["center", cur + 1, tc >= cur + 1]];
    if (timersOf(S, "build", key).length) info.reason = "busy";
    else if (working(S, key)) info.reason = "working";
    else if (info.reqs.some(r => !r[2])) info.reason = "reqs";
    else if (timersOf(S, "build").length >= builders(S)) info.reason = "builders";
    else if (!hasRes(S, info.cost)) info.reason = "res";
    else info.ok = true;
    return info;
  }
  function upgrade(S, key, now) {
    const info = upgradeInfo(S, key);
    if (!info.ok) return info;
    pay(S, info.cost);
    info.timer = addTimer(S, "build", key, now, info.time * 1000);
    count(S, "build");
    return info;
  }

  // Avanza el juego hasta "now": termina temporizadores en orden y devuelve lo que pasó.
  function tick(S, now, rng) {
    rng = rng || Math.random;
    const ev = [];
    ensureDay(S, now);
    for (let guard = 0; guard < 10000; guard++) {
      let due = null;
      for (const t of S.timers) if (t.end <= now && (!due || t.end < due.end || (t.end === due.end && t.id < due.id))) due = t;
      if (!due) break;
      complete(S, due, ev, rng);
    }
    if (S.map) refillMap(S, now, rng);
    S.last = Math.max(S.last, now);
    return ev;
  }
  function complete(S, t, ev, rng) {
    S.timers.splice(S.timers.indexOf(t), 1);
    const at = t.end;
    if (t.kind === "build") {
      accrue(S, t.key, at);
      S.b[t.key] = lvl(S, t.key) + 1;
      if (D.BUILDINGS[t.key].prod && !S.prod[t.key]) S.prod[t.key] = { t: at, amt: 0 };
      ev.push({ t: "built", key: t.key, lvl: S.b[t.key], at });
    } else if (t.kind === "train") {
      const { type, tier, n } = t.data;
      S.troops[type][tier - 1] += n;
      S.stats.trained[type] += n;
      ev.push({ t: "trained", type, tier, n, at });
    } else if (t.kind === "heal") {
      let n = 0;
      for (const ty of D.TYPES) for (let i = 0; i < D.TIERS; i++) { S.troops[ty][i] += t.data.units[ty][i]; n += t.data.units[ty][i]; }
      ev.push({ t: "healed", n, at });
    } else if (t.kind === "research") {
      accrueAll(S, at);
      S.tech[t.key] = (S.tech[t.key] || 0) + 1;
      ev.push({ t: "researched", key: t.key, lvl: S.tech[t.key], at });
    } else if (t.kind === "march") marchStep(S, t, at, ev, rng);
  }

  // Ayuda de la alianza y aceleraciones con gemas
  const helpsFor = S => (lvl(S, "embassy") ? Math.min(20, 3 + lvl(S, "embassy")) : 0);
  const canHelp = (S, t) => !!t && helpsFor(S) > 0 && !t.helped && (t.kind === "build" || t.kind === "research" || t.kind === "heal");
  function help(S, id, now) {
    const t = timer(S, id);
    if (!canHelp(S, t) || t.end <= now) return 0;
    const per = Math.max((t.end - t.start) * 0.01, 30000), cut = Math.min(t.end - now, per * helpsFor(S));
    t.end -= cut;
    t.helped = true;
    count(S, "help");
    return cut;
  }
  function finishCost(S, t, now) {
    if (!t || t.kind === "march") return null;
    const left = t.end - now;
    return left <= MIN ? 0 : Math.ceil(left / MIN);
  }
  function finish(S, id, now) {
    const t = timer(S, id), c = finishCost(S, t, now);
    if (c == null || S.res.gems < c) return false;
    S.res.gems -= c;
    t.end = Math.min(t.end, now);
    return true;
  }

  // Tropas
  const tierOpen = (S, type, tier) => lvl(S, D.TROOPS[type].building) >= D.TIER_UNLOCK[tier - 1];
  const trainSeconds = (S, tier, n) => D.unitTime(tier) * n * (1 - Math.min(0.6, eff(S, "train_speed")));
  function trainInfo(S, type, tier, n) {
    const key = D.TROOPS[type].building, bl = lvl(S, key);
    const info = { key, type, tier, n, max: bl ? D.batchSize(bl) : 0, cost: scaleCost(D.unitCost(tier), n), time: trainSeconds(S, tier, n), ok: false, reason: null };
    if (!bl) info.reason = "locked";
    else if (!tierOpen(S, type, tier)) info.reason = "tier";
    else if (timersOf(S, "build", key).length) info.reason = "upgrading";
    else if (timersOf(S, "train", key).length) info.reason = "busy";
    else if (!(n >= 1 && n <= info.max && Number.isInteger(n))) info.reason = "count";
    else if (!hasRes(S, info.cost)) info.reason = "res";
    else info.ok = true;
    return info;
  }
  function affordable(S, cost) {
    let n = Infinity;
    for (const r in cost) if (cost[r] > 0) n = Math.min(n, Math.floor((S.res[r] || 0) / cost[r]));
    return n === Infinity ? 0 : n;
  }
  function train(S, type, tier, n, now) {
    const info = trainInfo(S, type, tier, n);
    if (!info.ok) return info;
    pay(S, info.cost);
    info.timer = addTimer(S, "train", info.key, now, info.time * 1000, { type, tier, n });
    count(S, "train");
    return info;
  }
  const troopCount = troops => D.TYPES.reduce((a, ty) => a + troops[ty].reduce((x, y) => x + y, 0), 0);
  function troopsAway(S) {
    const out = emptyTroops();
    for (const t of timersOf(S, "march")) for (const ty of D.TYPES) for (let i = 0; i < D.TIERS; i++) out[ty][i] += t.data.troops[ty][i];
    return out;
  }

  // Enfermería: los heridos vuelven tras curarse; si no caben, mueren.
  const clinicCap = S => 300 * lvl(S, "clinic");
  function addWounded(S, losses) {
    let room = Math.max(0, clinicCap(S) - troopCount(S.wounded) - healingCount(S)), saved = 0, dead = 0;
    for (const ty of D.TYPES) for (let i = D.TIERS - 1; i >= 0; i--) {
      const hurt = Math.round(losses[ty][i] * 0.8), keep = Math.min(hurt, room);
      S.wounded[ty][i] += keep; room -= keep; saved += keep; dead += losses[ty][i] - keep;
    }
    return { saved, dead };
  }
  function healingCount(S) {
    return timersOf(S, "heal").reduce((a, t) => a + troopCount(t.data.units), 0);
  }
  function healInfo(S) {
    const n = troopCount(S.wounded), info = { n, cost: {}, time: 0, ok: false, reason: null };
    for (const ty of D.TYPES) for (let i = 0; i < D.TIERS; i++) {
      const k = S.wounded[ty][i];
      if (!k) continue;
      const c = D.unitCost(i + 1);
      for (const r in c) info.cost[r] = (info.cost[r] || 0) + Math.round(c[r] * k * 0.3);
      info.time += k * 0.4 * Math.pow(1.2, i);
    }
    info.time *= 1 - Math.min(0.5, eff(S, "heal_speed"));
    if (!lvl(S, "clinic")) info.reason = "locked";
    else if (!n) info.reason = "none";
    else if (timersOf(S, "build", "clinic").length) info.reason = "upgrading";
    else if (timersOf(S, "heal").length) info.reason = "busy";
    else if (!hasRes(S, info.cost)) info.reason = "res";
    else info.ok = true;
    return info;
  }
  function heal(S, now) {
    const info = healInfo(S);
    if (!info.ok) return info;
    pay(S, info.cost);
    info.timer = addTimer(S, "heal", "clinic", now, info.time * 1000, { units: S.wounded });
    S.wounded = emptyTroops();
    return info;
  }

  // Investigación
  function researchInfo(S, key) {
    const tech = D.TECHS[key], cur = S.tech[key] || 0, k = cur + 1;
    const info = { key, lvl: cur, next: k, cost: k <= tech.max ? D.techCost(k) : {}, time: k <= tech.max ? D.techTime(k) : 0, need: k <= tech.max ? D.techAcademy(key, k) : 0, ok: false, reason: null };
    if (!lvl(S, "academy")) info.reason = "locked";
    else if (cur >= tech.max) info.reason = "max";
    else if (lvl(S, "academy") < info.need) info.reason = "academy";
    else if (timersOf(S, "build", "academy").length) info.reason = "upgrading";
    else if (timersOf(S, "research").length) info.reason = "busy";
    else if (!hasRes(S, info.cost)) info.reason = "res";
    else info.ok = true;
    return info;
  }
  function research(S, key, now) {
    const info = researchInfo(S, key);
    if (!info.ok) return info;
    pay(S, info.cost);
    info.timer = addTimer(S, "research", key, now, info.time * 1000);
    count(S, "research");
    return info;
  }

  // Héroes: reclutamiento con sellos o gemas; los repetidos dan fragmentos para subir estrellas.
  function recruit(S, n, useGems, rng) {
    rng = rng || Math.random;
    const cost = useGems ? { gems: D.RECRUIT.gems * n } : { tokens: n };
    if (!lvl(S, "herohall") || !(n === 1 || n === 10) || !hasRes(S, cost)) return null;
    pay(S, cost);
    const out = [];
    for (let i = 0; i < n; i++) {
      S.pity++;
      const r = rng();
      const rarity = S.pity >= D.RECRUIT.pity || r < D.RECRUIT.legendary ? 3 : r < D.RECRUIT.legendary + D.RECRUIT.epic ? 2 : 1;
      if (rarity === 3) S.pity = 0;
      const pool = D.HEROES.filter(h => h.rarity === rarity), h = pool[Math.floor(rng() * pool.length)];
      if (S.heroes[h.id]) { S.heroes[h.id].shards += 10; out.push({ id: h.id, dup: true }); }
      else { S.heroes[h.id] = { lvl: 1, stars: 0, shards: 0 }; out.push({ id: h.id, dup: false }); }
    }
    S.stats.recruits += n;
    return out;
  }
  const heroCap = S => D.heroCap(lvl(S, "herohall"));
  function heroLevelUp(S, id, times) {
    const h = S.heroes[id];
    if (!h) return 0;
    let done = 0;
    while (done < times && h.lvl < heroCap(S)) {
      const need = D.heroXpNeed(h.lvl);
      if (S.res.xp < need) break;
      S.res.xp -= need; h.lvl++; done++;
    }
    return done;
  }
  function heroStarUp(S, id) {
    const h = S.heroes[id];
    if (!h || h.stars >= D.MAX_STARS || h.shards < D.STAR_COST[h.stars]) return false;
    h.shards -= D.STAR_COST[h.stars];
    h.stars++;
    return true;
  }
  function setFormation(S, slots) {
    if (!Array.isArray(slots) || slots.length !== 5) return false;
    const ids = slots.filter(Boolean);
    if (new Set(ids).size !== ids.length || ids.some(id => !S.heroes[id])) return false;
    S.formation = slots.map(x => x || null);
    return true;
  }
  const heroesAway = S => new Set(timersOf(S, "march").flatMap(t => t.data.heroes));

  // Expedición: combate por turnos de hasta 5 héroes (2 delante, 3 detrás) contra cada etapa.
  function heroUnit(S, id, row) {
    const h = S.heroes[id], st = D.heroStats(id, h.lvl, h.stars);
    return { id, type: D.HERO[id].type, rarity: D.HERO[id].rarity, skill: D.HERO[id].skill, row, ...st };
  }
  const team = S => S.formation.map((id, i) => (id && S.heroes[id] ? heroUnit(S, id, i < 2 ? 0 : 1) : null)).filter(Boolean);
  const ENEMY_SKILL = { inf: "strike", cav: "charge", arc: "pierce" };
  function expEnemies(stage) {
    const n = Math.min(5, 2 + Math.floor(stage / 3)), m = 0.55 * (1 + 0.085 * (stage - 1)) * Math.pow(1.008, stage - 1), out = [];
    for (let i = 0; i < n; i++) {
      const type = i === 0 ? "inf" : i === 1 ? "cav" : D.TYPES[(i + stage) % 3], b = D.HERO_BASE[type];
      out.push({ id: "foe_" + type, type, skill: ENEMY_SKILL[type], row: i < 2 ? 0 : 1, hp: Math.round(b.hp * m), atk: Math.round(b.atk * m), def: Math.round(b.def * m), spd: b.spd - 5 });
    }
    if (stage % 10 === 0) Object.assign(out[0], { id: "foe_boss", boss: true, skill: "sweep", hp: out[0].hp * 3, atk: Math.round(out[0].atk * 1.4) });
    return out;
  }
  const teamPower = units => Math.round(units.reduce((a, u) => a + u.hp / 10 + u.atk * 2 + u.def, 0));

  function fight(A, B, rng) {
    rng = rng || Math.random;
    const units = [];
    A.forEach((u, i) => units.push({ ...u, side: 0, idx: i, cur: u.hp, en: 0, sh: 0, shT: 0, stun: 0, buff: 0, buffT: 0 }));
    B.forEach((u, i) => units.push({ ...u, side: 1, idx: i, cur: u.hp, en: 0, sh: 0, shT: 0, stun: 0, buff: 0, buffT: 0 }));
    const uid = u => u.side + ":" + u.idx;
    const alive = s => units.filter(u => u.side === s && u.cur > 0);
    const lowest = list => list.reduce((a, b) => (b.cur < a.cur ? b : a));
    function target(u, back) {
      const foes = alive(1 - u.side);
      if (!foes.length) return null;
      if (back) { const b = foes.filter(f => f.row === 1); if (b.length) return lowest(b); }
      const front = foes.filter(f => f.row === 0);
      return lowest(front.length ? front : foes);
    }
    const counter = (a, d) => (D.BEATS[a.type] === d.type ? 1.25 : D.BEATS[d.type] === a.type ? 0.85 : 1);
    function hit(a, d, mult) {
      const dmg = Math.max(1, Math.round(a.atk * (1 + a.buff) * mult * counter(a, d) * 100 / (100 + d.def) * (0.93 + rng() * 0.14)));
      const absorbed = Math.min(d.sh, dmg), real = dmg - absorbed;
      d.sh -= absorbed;
      d.cur = Math.max(0, d.cur - real);
      d.en = Math.min(100, d.en + 10);
      return { u: uid(d), dmg: real, absorbed, kill: d.cur <= 0 };
    }
    function skill(u, e) {
      const sk = D.SKILLS[u.skill], allies = alive(u.side);
      if (u.skill === "sweep") for (const f of alive(1 - u.side)) e.hits.push(hit(u, f, sk.mult));
      else if (u.skill === "heal") {
        const a = allies.reduce((x, y) => (y.cur / y.hp < x.cur / x.hp ? y : x)), amt = Math.round(u.atk * sk.mult);
        a.cur = Math.min(a.hp, a.cur + amt);
        e.hits.push({ u: uid(a), heal: amt });
      } else if (u.skill === "shield") for (const a of allies) { a.sh = Math.round(u.atk * sk.mult); a.shT = sk.turns; e.hits.push({ u: uid(a), shield: a.sh }); }
      else if (u.skill === "rally") for (const a of allies) { a.buff = sk.buff; a.buffT = sk.turns; e.hits.push({ u: uid(a), buff: sk.buff }); }
      else {
        const t = target(u, u.skill === "pierce");
        if (!t) return;
        const h = hit(u, t, sk.mult);
        if (sk.stun && !h.kill) { t.stun = sk.stun; h.stun = true; }
        e.hits.push(h);
      }
    }
    const log = [];
    let rounds = 0;
    for (let round = 1; round <= 15 && alive(0).length && alive(1).length; round++) {
      rounds = round;
      const order = units.filter(u => u.cur > 0).sort((a, b) => b.spd - a.spd || a.side - b.side || a.idx - b.idx);
      for (const u of order) {
        if (u.cur <= 0 || !alive(0).length || !alive(1).length) continue;
        if (u.buffT > 0 && --u.buffT === 0) u.buff = 0;
        if (u.shT > 0 && --u.shT === 0) u.sh = 0;
        if (u.stun > 0) { u.stun--; log.push({ a: uid(u), k: "stun", hits: [] }); continue; }
        u.en += 25;
        const e = { a: uid(u), k: "atk", hits: [] };
        if (u.en >= 100) { u.en = 0; e.k = "skill"; e.skill = u.skill; skill(u, e); }
        else { const t = target(u, false); if (t) e.hits.push(hit(u, t, 1)); }
        log.push(e);
      }
    }
    return { win: !alive(1).length && alive(0).length > 0, log, rounds, units: units.map(u => ({ side: u.side, idx: u.idx, hp: u.hp, cur: u.cur })) };
  }

  const expReward = stage => {
    const f = Math.pow(1.09, stage), out = { bread: Math.round(200 * f), wood: Math.round(200 * f), xp: Math.round(80 * Math.pow(1.08, stage)), gems: stage % 10 === 0 ? 40 : 10 };
    if (stage % 10 === 0) out.tokens = 1;
    return out;
  };
  function expedition(S, now, rng) {
    const mine = team(S);
    if (!mine.length) return null;
    const stage = S.exp.best + 1, foes = expEnemies(stage), res = fight(mine, foes, rng);
    res.stage = stage; res.mine = mine; res.foes = foes;
    count(S, "exp");
    if (res.win) {
      S.exp.best = stage;
      res.reward = give(S, expReward(stage));
    }
    return res;
  }
  // Recompensas acumuladas de la expedición: hasta 12 horas según la mejor etapa superada.
  const IDLE_HOURS = 12;
  function idleRate(S) {
    const b = S.exp.best;
    if (!b) return {};
    const f = Math.pow(1.09, b);
    const out = { bread: 300 * f, wood: 300 * f, stone: 200 * f, gold: 80 * f, xp: 150 * Math.pow(1.08, b) };
    if (b >= 20) out.iron = 60 * f;
    return out;
  }
  function idleNow(S, now) {
    const h = Math.min(IDLE_HOURS, Math.max(0, now - S.exp.idleT) / HOUR), r = idleRate(S), out = {};
    for (const k in r) out[k] = Math.floor(r[k] * h);
    return out;
  }
  function collectIdle(S, now) {
    const got = idleNow(S, now);
    if (!sum(got)) return null;
    give(S, got);
    S.exp.idleT = now;
    return got;
  }

  // Defensa del pueblo (modo en tiempo real, en defensa.js): mejoras que vienen de la ciudad y recompensas.
  function tdMods(S) {
    const tc = lvl(S, "center");
    return {
      tower: (1 + 0.12 * lvl(S, "tower")) * (1 + eff(S, "td_tower")),
      gov: (1 + 0.1 * (tc - 1)) * (1 + eff(S, "td_gov")) * (1 + 0.01 * S.exp.best),
      govHp: 120 + 30 * (tc - 1),
      wall: 10 + 3 * lvl(S, "wall")
    };
  }
  function tdResult(S, stage, stars) {
    if (!(stage >= 1 && stage <= S.td.best + 1) || !(stars >= 0 && stars <= 3)) return null;
    const prev = S.td.stars[stage] || 0, first = stage > S.td.best;
    if (stars > 0) count(S, "td");
    if (!stars) return { first: false, reward: {} };
    const f = Math.pow(1.1, stage), base = { bread: Math.round(400 * f), wood: Math.round(400 * f), stone: Math.round(300 * f), xp: Math.round(80 * Math.pow(1.08, stage)) };
    if (stage >= 10) base.iron = Math.round(100 * f);
    const reward = first ? { ...base, gems: 20 } : scaleCost(base, 0.2);
    if (stars > prev) reward.gems = (reward.gems || 0) + 10 * (stars - prev);
    if (first) S.td.best = stage;
    S.td.stars[stage] = Math.max(prev, stars);
    return { first, reward: give(S, reward) };
  }

  // Combate de tropas: rondas simultáneas. La infantería va delante; la caballería flanquea a los arqueros.
  function troopBattle(A, B, rounds) {
    const prep = side => side.stacks.filter(s => s.n > 0).map(s => {
      const beast = s.type === "beast", base = beast ? s.stats : D.TROOPS[s.type], m = beast ? 1 : D.tierMult(s.tier), bon = 1 + ((side.bonus || {})[s.type] || 0);
      return { type: s.type, tier: s.tier, n0: s.n, n: s.n, atk: base.atk * m * bon, def: base.def * m * bon, hp: base.hp * m * bon };
    });
    const sides = [prep(A), prep(B)], dealt = [0, 0];
    const total = st => st.reduce((a, s) => a + s.n, 0);
    const mult = (a, d) => (a === "beast" || d === "beast" ? 1 : D.BEATS[a] === d ? 1.3 : D.BEATS[d] === a ? 0.8 : 1);
    function plan(att, def) {
      const out = {}, order = ["inf", "cav", "arc", "beast"].filter(ty => def.some(s => s.type === ty && s.n >= 0.5));
      if (!order.length) return out;
      for (const s of att) {
        if (s.n < 0.5) continue;
        let d = s.n * s.atk;
        const tgt = order[0];
        if (s.type === "cav" && tgt !== "arc" && order.includes("arc")) { const f = d * 0.25; out.arc = (out.arc || 0) + f * mult("cav", "arc"); d -= f; }
        out[tgt] = (out[tgt] || 0) + d * mult(s.type, tgt);
      }
      return out;
    }
    function apply(def, dmg, who) {
      for (const ty in dmg) {
        const st = def.filter(s => s.type === ty && s.n > 0), n = st.reduce((a, s) => a + s.n, 0);
        for (const s of st) {
          const e = dmg[ty] * (s.n / n) * 100 / (100 + s.def);
          s.n = Math.max(0, s.n - e / s.hp);
          dealt[who] += e;
        }
      }
    }
    for (let r = 0; r < rounds; r++) {
      if (total(sides[0]) < 0.5 || total(sides[1]) < 0.5) break;
      const d0 = plan(sides[0], sides[1]), d1 = plan(sides[1], sides[0]);
      apply(sides[1], d0, 0);
      apply(sides[0], d1, 1);
    }
    const out = sides.map(st => st.map(s => ({ type: s.type, tier: s.tier, n0: s.n0, n: Math.round(s.n) })));
    return { a: out[0], b: out[1], dealt: dealt.map(Math.round), win: total(sides[1]) < 0.5 && total(sides[0]) >= 0.5 };
  }
  const stacksOf = troops => D.TYPES.flatMap(ty => troops[ty].map((n, i) => ({ type: ty, tier: i + 1, n })).filter(s => s.n > 0));
  function marchBonus(S, heroes) {
    const out = {};
    for (const ty of D.TYPES) out[ty] = eff(S, ty + "_stats");
    for (const id of heroes) { const h = S.heroes[id]; if (h) out[D.HERO[id].type] += D.heroBonus(id, h.lvl, h.stars); }
    return out;
  }
  const armyPower = (stacks, bonus) => Math.round(stacks.reduce((a, s) => a + s.n * D.TIER_POWER[s.tier - 1] * (1 + ((bonus || {})[s.type] || 0)), 0));

  // Mapa del reino: rejilla de 9 × 9 con el castillo en el centro.
  const MAP_N = 9, HOME = { x: 4, y: 4 };
  const rebelMixes = [[0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6], [0.4, 0.3, 0.3]];
  function rebelArmy(tile) {
    const total = Math.round(25 * Math.pow(1.42, tile.lvl - 1)), tier = Math.min(6, 1 + Math.floor((tile.lvl - 1) / 3)), mix = rebelMixes[tile.mix];
    return D.TYPES.map((ty, i) => ({ type: ty, tier, n: Math.max(1, Math.round(total * mix[i])) }));
  }
  function rebelReward(lvl) {
    const f = Math.pow(1.32, lvl - 1), out = { bread: Math.round(300 * f), wood: Math.round(300 * f), stone: Math.round(200 * f), gold: Math.round(80 * f), xp: Math.round(60 * Math.pow(1.2, lvl - 1)) };
    if (lvl >= 5) out.iron = Math.round(80 * f);
    return out;
  }
  const FIELD_RATE = { bread: 1, wood: 1, stone: 0.7, iron: 0.4 };
  const fieldAmount = (type, lvl) => Math.round(1200 * Math.pow(1.6, lvl - 1) * FIELD_RATE[type]);
  const gatherSpeed = (type, lvl) => 4 * Math.pow(1.3, lvl - 1) * FIELD_RATE[type];
  const bearOpen = S => lvl(S, "center") >= 7 && lvl(S, "embassy") >= 1;
  const mapOpen = S => lvl(S, "center") >= 2;
  function refillMap(S, now, rng) {
    const M = S.map, tc = lvl(S, "center");
    M.respawn = M.respawn.filter(r => r.at > now);
    const taken = new Set(M.tiles.map(t => t.x + "," + t.y));
    taken.add(HOME.x + "," + HOME.y);
    const pending = kind => M.respawn.filter(r => r.kind === kind).length;
    const place = tile => {
      for (let k = 0; k < 200; k++) {
        const x = Math.floor(rng() * MAP_N), y = Math.floor(rng() * MAP_N);
        if (taken.has(x + "," + y)) continue;
        taken.add(x + "," + y);
        M.tiles.push({ id: M.seq++, x, y, busy: null, ...tile });
        return;
      }
    };
    while (M.tiles.filter(t => t.kind === "rebel").length + pending("rebel") < 8) {
      const top = S.stats.rebelMax + 1;
      place({ kind: "rebel", lvl: Math.max(1, top - Math.floor(rng() * 3)), mix: Math.floor(rng() * rebelMixes.length) });
    }
    const types = ["bread", "wood"].concat(tc >= 2 ? ["stone"] : [], tc >= 6 ? ["iron"] : []);
    while (M.tiles.filter(t => t.kind === "field").length + pending("field") < 7) {
      const type = types[Math.floor(rng() * types.length)], lv = 1 + Math.floor(rng() * Math.min(6, 1 + Math.floor(tc / 3)));
      place({ kind: "field", type, lvl: lv, amount: fieldAmount(type, lv) });
    }
    if (bearOpen(S) && !M.tiles.some(t => t.kind === "bear")) place({ kind: "bear", lvl: Math.max(1, tc - 6) });
  }
  function ensureMap(S, now, rng) {
    if (!S.map) S.map = { tiles: [], respawn: [], seq: 1 };
    refillMap(S, now, rng || Math.random);
    return S.map;
  }
  const tileAt = (S, id) => (S.map ? S.map.tiles.find(t => t.id === id) : null);
  const marchSlots = S => 1 + eff(S, "marches") + (lvl(S, "center") >= 10 ? 1 : 0);
  const marchMs = tile => Math.round(6000 * Math.hypot(tile.x - HOME.x, tile.y - HOME.y));
  const armyLoad = (S, troops) => Math.round(D.TYPES.reduce((a, ty) => a + troops[ty].reduce((x, n, i) => x + n * D.unitLoad(i + 1), 0), 0) * (1 + eff(S, "load")));

  // Caza del oso (evento diario con la alianza): 3 ataques al día; el daño total da recompensas por hitos.
  const BEAR_ATTACKS = 3, BEAR_STEPS = [1, 2, 4, 8, 16, 30];
  const bearBase = S => Math.round(3000 * Math.pow(1.45, Math.max(0, lvl(S, "center") - 7)));
  const bearArmy = S => [{ type: "beast", tier: 1, n: 1, stats: { atk: 400 * Math.pow(1.3, Math.max(0, lvl(S, "center") - 7)), def: 50, hp: 1e15 } }];
  function bearReward(i) {
    const out = { gems: 20 + 10 * i, xp: Math.round(300 * Math.pow(1.6, i)) };
    if (i === 2 || i >= 4) out.tokens = 1;
    return out;
  }
  function claimBear(S, i) {
    if (!(i >= 0 && i < BEAR_STEPS.length) || S.bear.claimed.includes(i) || S.bear.damage < BEAR_STEPS[i] * S.bear.base) return null;
    S.bear.claimed.push(i);
    return give(S, bearReward(i));
  }

  function marchCheck(S, tileId, heroes, troops) {
    const tile = tileAt(S, tileId);
    if (!mapOpen(S) || !tile) return "target";
    if (tile.busy) return "busy";
    if (timersOf(S, "march").length >= marchSlots(S)) return "slots";
    if (tile.kind === "bear" && S.bear.attacks >= BEAR_ATTACKS) return "attacks";
    if (heroes.length > 3 || new Set(heroes).size !== heroes.length || heroes.some(id => !S.heroes[id])) return "heroes";
    const away = heroesAway(S);
    if (heroes.some(id => away.has(id))) return "heroes";
    let n = 0;
    for (const ty of D.TYPES) for (let i = 0; i < D.TIERS; i++) {
      const k = troops[ty][i];
      if (!(Number.isInteger(k) && k >= 0 && k <= S.troops[ty][i])) return "troops";
      n += k;
    }
    return n > 0 ? null : "troops";
  }
  function sendMarch(S, tileId, heroes, troops, now) {
    const err = marchCheck(S, tileId, heroes, troops);
    if (err) return { ok: false, reason: err };
    const tile = tileAt(S, tileId), copy = emptyTroops();
    for (const ty of D.TYPES) for (let i = 0; i < D.TIERS; i++) { copy[ty][i] = troops[ty][i]; S.troops[ty][i] -= troops[ty][i]; }
    if (tile.kind === "bear") S.bear.attacks++;
    const t = addTimer(S, "march", tile.kind, now, marchMs(tile), { phase: "go", tile: tile.id, x: tile.x, y: tile.y, heroes: heroes.slice(), troops: copy, loot: {}, result: null });
    tile.busy = t.id;
    return { ok: true, timer: t };
  }
  function marchStep(S, t, at, ev, rng) {
    const d = t.data, tile = tileAt(S, d.tile), back = () => { t.start = at; t.end = at + Math.round(6000 * Math.hypot(d.x - HOME.x, d.y - HOME.y)); d.phase = "back"; S.timers.push(t); };
    if (d.phase === "go") {
      if (!tile) { d.result = { kind: "gone" }; return back(); }
      if (tile.kind === "rebel") {
        const bonus = marchBonus(S, d.heroes), fightRes = troopBattle({ stacks: stacksOf(d.troops), bonus }, { stacks: rebelArmy(tile) }, 20);
        const losses = emptyTroops();
        for (const s of fightRes.a) { const lost = s.n0 - s.n; losses[s.type][s.tier - 1] += lost; d.troops[s.type][s.tier - 1] -= lost; }
        const hurt = addWounded(S, losses);
        d.result = { kind: "rebel", lvl: tile.lvl, win: fightRes.win, lost: troopCount(losses), wounded: hurt.saved, dead: hurt.dead };
        if (fightRes.win) {
          d.loot = rebelReward(tile.lvl);
          if (tile.lvl > S.stats.rebelMax) { S.stats.rebelMax = tile.lvl; d.loot.gems = 20; if (tile.lvl % 3 === 0) d.loot.tokens = 1; }
          S.stats.rebels++;
          count(S, "rebel");
          S.map.tiles.splice(S.map.tiles.indexOf(tile), 1);
          S.map.respawn.push({ kind: "rebel", at: at + 5 * MIN });
        } else tile.busy = null;
        return back();
      }
      if (tile.kind === "field") {
        d.take = Math.min(tile.amount, armyLoad(S, d.troops));
        d.phase = "work"; t.start = at; t.end = at + Math.round(d.take / gatherSpeed(tile.type, tile.lvl) * 1000);
        S.timers.push(t);
        return;
      }
      if (tile.kind === "bear") {
        if (!S.bear.base) S.bear.base = bearBase(S);
        const fightRes = troopBattle({ stacks: stacksOf(d.troops), bonus: marchBonus(S, d.heroes) }, { stacks: bearArmy(S) }, 10);
        const losses = emptyTroops();
        for (const s of fightRes.a) { const lost = s.n0 - s.n; losses[s.type][s.tier - 1] += lost; d.troops[s.type][s.tier - 1] -= lost; }
        const hurt = addWounded(S, losses), mine = fightRes.dealt[0], ally = Math.round(mine * (1.5 + rng()));
        S.bear.damage += mine + ally;
        S.stats.bears++;
        tile.busy = null;
        d.result = { kind: "bear", dmg: mine, ally, total: S.bear.damage, wounded: hurt.saved, dead: hurt.dead };
        return back();
      }
    }
    if (d.phase === "work") {
      if (tile) {
        tile.amount -= d.take;
        tile.busy = null;
        if (tile.amount < 1) { S.map.tiles.splice(S.map.tiles.indexOf(tile), 1); S.map.respawn.push({ kind: "field", at: at + 5 * MIN }); }
      }
      d.loot = { [tile ? tile.type : "bread"]: tile ? d.take : 0 };
      d.result = { kind: "gather", type: tile ? tile.type : "bread", amount: tile ? d.take : 0 };
      S.stats.gathers++;
      count(S, "gather");
      return back();
    }
    // Vuelta a casa
    for (const ty of D.TYPES) for (let i = 0; i < D.TIERS; i++) S.troops[ty][i] += d.troops[ty][i];
    give(S, d.loot);
    if (tile && tile.busy === t.id) tile.busy = null;
    ev.push({ t: "returned", id: t.id, result: d.result, loot: d.loot, at });
  }

  // Misiones de capítulo y tareas diarias
  function questProgress(S, q) {
    const [kind, key, n] = q;
    let v = 0;
    if (kind === "b") v = lvl(S, key);
    else if (kind === "td") v = S.td.best;
    else if (kind === "exp") v = S.exp.best;
    else if (kind === "train") v = S.stats.trained[key];
    else if (kind === "rebel") v = S.stats.rebels;
    else if (kind === "recruit") v = S.stats.recruits;
    else if (kind === "gather") v = S.stats.gathers;
    else if (kind === "research") v = sum(S.tech);
    else if (kind === "herolvl") v = Math.max(0, ...Object.values(S.heroes).map(h => h.lvl));
    else if (kind === "bear") v = S.stats.bears;
    return { v: Math.min(v, n), n, done: v >= n };
  }
  const currentQuest = S => D.quest(S.quest);
  function claimQuest(S) {
    const q = currentQuest(S);
    if (!questProgress(S, q).done) return null;
    S.quest++;
    return give(S, q[3]);
  }
  function count(S, id, n) { S.daily.counts[id] = (S.daily.counts[id] || 0) + (n || 1); }
  const dailyPoints = S => D.DAILY.reduce((a, d) => a + ((S.daily.counts[d.id] || 0) >= d.n ? d.pts : 0), 0);
  function chestReward(S, i) {
    const f = Math.pow(1.35, lvl(S, "center") - 1), out = { gems: [10, 15, 20, 25, 40][i], bread: Math.round(500 * f), wood: Math.round(500 * f), stone: Math.round(300 * f), xp: Math.round(100 * f) };
    if (lvl(S, "center") >= 7) out.iron = Math.round(100 * f);
    if (i === 4) out.tokens = 1;
    return out;
  }
  function claimChest(S, i) {
    if (!(i >= 0 && i < D.CHESTS.length) || S.daily.claimed.includes(i) || dailyPoints(S) < D.CHESTS[i]) return null;
    S.daily.claimed.push(i);
    return give(S, chestReward(S, i));
  }
  function ensureDay(S, now) {
    const k = dayKey(now);
    if (S.daily.day !== k) S.daily = { day: k, counts: {}, claimed: [] };
    if (S.bear.day !== k) S.bear = { day: k, attacks: 0, damage: 0, claimed: [], base: bearOpen(S) ? bearBase(S) : 0 };
    if (bearOpen(S) && !S.bear.base) S.bear.base = bearBase(S);
  }

  // Poder del gobernador
  function power(S) {
    let p = 0;
    for (const k of D.ORDER) p += Math.round(10 * Math.pow(lvl(S, k), 1.6)) * (k === "center" ? 3 : 1);
    const away = troopsAway(S);
    for (const ty of D.TYPES) for (let i = 0; i < D.TIERS; i++) p += (S.troops[ty][i] + away[ty][i]) * D.TIER_POWER[i];
    for (const id in S.heroes) { const h = S.heroes[id]; p += Math.round(40 * D.RARITY_MULT[D.HERO[id].rarity] * h.lvl * (1 + 0.15 * h.stars)); }
    return p + 25 * sum(S.tech);
  }

  // Guardar y cargar. Una partida dañada o de otra versión se descarta.
  const save = S => JSON.stringify(S);
  const finite = v => typeof v === "number" && isFinite(v) && v >= 0;
  function load(str, now) {
    let S;
    try { S = JSON.parse(str); } catch (e) { return null; }
    if (!S || typeof S !== "object" || S.v !== VERSION || !S.res || !S.b || !Array.isArray(S.timers) || !S.troops || !S.heroes) return null;
    const base = newGame(now);
    for (const k in base) if (!(k in S)) S[k] = base[k];
    for (const r in base.res) if (!finite(S.res[r])) S.res[r] = 0;
    for (const k in S.b) if (!D.BUILDINGS[k] || !Number.isInteger(S.b[k]) || S.b[k] < 0 || S.b[k] > 20) return null;
    if (!S.b.center) return null;
    for (const g of [S.troops, S.wounded]) for (const ty of D.TYPES) if (!Array.isArray(g[ty]) || g[ty].length !== D.TIERS || !g[ty].every(finite)) return null;
    for (const id in S.heroes) if (!D.HERO[id] || !Number.isInteger(S.heroes[id].lvl)) return null;
    if (!Array.isArray(S.formation) || S.formation.length !== 5) S.formation = base.formation;
    S.formation = S.formation.map(id => (id && S.heroes[id] ? id : null));
    for (const k in S.tech) if (!D.TECHS[k] || !Number.isInteger(S.tech[k])) return null;
    for (const t of S.timers) if (!t || !Number.isFinite(t.end) || !Number.isFinite(t.start) || typeof t.kind !== "string") return null;
    for (const k in S.b) if (D.BUILDINGS[k].prod && !S.prod[k]) S.prod[k] = { t: now, amt: 0 };
    return S;
  }

  R.motor = {
    VERSION, HOUR, MIN, MAP_N, HOME, IDLE_HOURS, BEAR_ATTACKS, BEAR_STEPS,
    newGame, load, save, tick, eff, lvl, rate, cap, stored, collect, hasRes, affordable,
    upgradeInfo, upgrade, builders, timersOf, timer, working, helpsFor, canHelp, help, finishCost, finish,
    tierOpen, trainInfo, train, troopCount, troopsAway, clinicCap, healInfo, heal, researchInfo, research,
    recruit, heroCap, heroLevelUp, heroStarUp, setFormation, heroesAway, team, heroUnit, expEnemies, teamPower, fight,
    expedition, expReward, idleRate, idleNow, collectIdle, tdMods, tdResult,
    troopBattle, stacksOf, marchBonus, armyPower, rebelArmy, rebelReward, fieldAmount, gatherSpeed, ensureMap, tileAt,
    mapOpen, bearOpen, marchSlots, marchMs, armyLoad, marchCheck, sendMarch, bearBase, bearReward, claimBear,
    questProgress, currentQuest, claimQuest, dailyPoints, chestReward, claimChest, power, emptyTroops, dayKey
  };
  if (typeof module !== "undefined" && module.exports) module.exports = R.motor;
})(typeof window !== "undefined" ? window : globalThis);
