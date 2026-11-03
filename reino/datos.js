/* Reino: datos del juego (edificios, tropas, héroes, investigación y misiones).
   Sin DOM: lo usan el motor, la interfaz y las pruebas en Node. */
(function (root) {
  "use strict";
  const R = root.Reino = root.Reino || {};

  const RES = ["bread", "wood", "stone", "iron", "gold"];
  const ICON = { bread: "🍞", wood: "🪵", stone: "🪨", iron: "⛓️", gold: "🪙", gems: "💎", xp: "📘", tokens: "🎟️", shards: "✨" };

  // Edificios. unlock: nivel del Centro urbano que lo desbloquea. prod: recurso que produce (por hora en nivel 1).
  // cost: precio base del nivel 1 → 2, repartido según mix. time: segundos del nivel 1 → 2.
  const BUILDINGS = {
    center:   { icon: "🏰", unlock: 1, max: 20, cost: 150, time: 24, mix: { bread: 1, wood: 1, stone: 0.7, iron: 0.3, gold: 0.8 } },
    farm:     { icon: "🌾", unlock: 1, prod: "bread", rate: 1200, cost: 60, time: 8, mix: { wood: 1, stone: 0.3, iron: 0.1 } },
    sawmill:  { icon: "🪓", unlock: 1, prod: "wood", rate: 1350, cost: 60, time: 8, mix: { bread: 1, stone: 0.3, iron: 0.1 } },
    house:    { icon: "🏠", unlock: 1, prod: "gold", rate: 330, cost: 70, time: 9, mix: { bread: 0.6, wood: 1, iron: 0.1 } },
    wall:     { icon: "🧱", unlock: 1, cost: 90, time: 12, mix: { wood: 0.6, stone: 1, iron: 0.2 } },
    barracks: { icon: "🛡️", unlock: 2, troop: "inf", cost: 80, time: 10, mix: { bread: 0.7, wood: 1, stone: 0.4, iron: 0.2 } },
    quarry:   { icon: "⛰️", unlock: 2, prod: "stone", rate: 800, cost: 70, time: 9, mix: { bread: 0.8, wood: 1, iron: 0.1 } },
    herohall: { icon: "👑", unlock: 3, cost: 120, time: 14, mix: { bread: 0.8, wood: 0.8, stone: 0.6, iron: 0.2, gold: 0.7 } },
    clinic:   { icon: "⛑️", unlock: 3, cost: 80, time: 10, mix: { bread: 1, wood: 0.8, stone: 0.3, iron: 0.1, gold: 0.2 } },
    range:    { icon: "🏹", unlock: 4, troop: "arc", cost: 90, time: 11, mix: { bread: 0.7, wood: 1, stone: 0.4, iron: 0.2 } },
    tower:    { icon: "🗼", unlock: 4, cost: 100, time: 12, mix: { wood: 1, stone: 0.8, iron: 0.3, gold: 0.2 } },
    academy:  { icon: "📜", unlock: 5, cost: 120, time: 14, mix: { bread: 1, wood: 1, stone: 0.5, iron: 0.2, gold: 0.8 } },
    embassy:  { icon: "🤝", unlock: 5, cost: 100, time: 12, mix: { bread: 1, wood: 1, stone: 0.4, iron: 0.1, gold: 0.3 } },
    stable:   { icon: "🐎", unlock: 6, troop: "cav", cost: 100, time: 12, mix: { bread: 0.7, wood: 1, stone: 0.4, iron: 0.3 } },
    mine:     { icon: "⛏️", unlock: 6, prod: "iron", rate: 400, cost: 90, time: 11, mix: { bread: 0.8, wood: 1, stone: 0.5 } }
  };
  const ORDER = Object.keys(BUILDINGS);
  const COST_GROWTH = 1.66, TIME_GROWTH = 1.55, IRON_FROM = 7;

  // Precio para pasar del nivel lvl al lvl + 1 (lvl 0 = construir). El hierro solo se pide desde el nivel 7.
  function buildCost(key, lvl) {
    const b = BUILDINGS[key], f = Math.pow(COST_GROWTH, lvl - 1), out = {};
    for (const r of RES) {
      const m = b.mix[r] || 0;
      if (!m || (r === "iron" && lvl < IRON_FROM)) continue;
      out[r] = Math.round(b.cost * m * f);
    }
    return out;
  }
  const buildTime = (key, lvl) => Math.round(BUILDINGS[key].time * Math.pow(TIME_GROWTH, lvl - 1));
  // Producción por hora en un nivel, sin bonificaciones.
  const prodRate = (key, lvl) => (lvl > 0 ? BUILDINGS[key].rate * (1 + 0.6 * (lvl - 1)) * Math.pow(1.08, lvl - 1) : 0);
  const STORE_HOURS = 10;

  // Para subir el Centro urbano a un nivel hacen falta otros edificios al nivel anterior.
  const CENTER_ROTATION = ["farm", "sawmill", "barracks", "house", "quarry", "herohall", "clinic", "range", "tower", "academy", "stable", "mine"];
  function centerReqs(target) {
    const need = target - 1, out = [];
    if (target >= 4) out.push(["wall", need]);
    if (target >= 7) out.push(["embassy", need]);
    const avail = CENTER_ROTATION.filter(k => BUILDINGS[k].unlock <= need);
    if (avail.length) out.push([avail[target % avail.length], need]);
    if (target >= 9) out.push([avail[(target + 5) % avail.length], need]);
    const seen = new Set();
    return out.filter(([k]) => (seen.has(k) ? false : (seen.add(k), true)));
  }

  // Tropas. Infantería vence a caballería, caballería a arqueros y arqueros a infantería.
  const TROOPS = {
    inf: { icon: "🛡️", building: "barracks", atk: 10, def: 12, hp: 32 },
    cav: { icon: "🐎", building: "stable", atk: 13, def: 9, hp: 26 },
    arc: { icon: "🏹", building: "range", atk: 15, def: 7, hp: 20 }
  };
  const TYPES = ["inf", "cav", "arc"];
  const BEATS = { inf: "cav", cav: "arc", arc: "inf" };
  const TIERS = 6;
  const TIER_UNLOCK = [1, 4, 8, 12, 16, 20];
  const TIER_POWER = [1, 2, 3, 5, 7, 10];
  const tierMult = t => Math.pow(1.4, t - 1);
  function unitCost(t) {
    const f = Math.pow(1.45, t - 1), out = { bread: Math.round(28 * f), wood: Math.round(24 * f) };
    if (t >= 2) out.stone = Math.round(8 * f);
    if (t >= 3) out.iron = Math.round(3 * f);
    return out;
  }
  const unitTime = t => 1.5 * Math.pow(1.25, t - 1);
  const batchSize = lvl => Math.round(20 * Math.pow(1.18, lvl - 1));
  const unitLoad = t => 8 * t;

  // Héroes: rareza 1 rara, 2 épica, 3 legendaria. Habilidades para las expediciones.
  const HEROES = [
    { id: "brunilda", type: "inf", rarity: 3, skill: "shield" },
    { id: "gael", type: "inf", rarity: 2, skill: "strike" },
    { id: "tobias", type: "inf", rarity: 1, skill: "strike" },
    { id: "marta", type: "inf", rarity: 1, skill: "rally" },
    { id: "leonor", type: "cav", rarity: 3, skill: "charge" },
    { id: "dario", type: "cav", rarity: 2, skill: "charge" },
    { id: "iker", type: "cav", rarity: 1, skill: "sweep" },
    { id: "sara", type: "cav", rarity: 1, skill: "rally" },
    { id: "selene", type: "arc", rarity: 3, skill: "pierce" },
    { id: "elio", type: "arc", rarity: 2, skill: "sweep" },
    { id: "nora", type: "arc", rarity: 1, skill: "heal" },
    { id: "bruno", type: "arc", rarity: 1, skill: "pierce" }
  ];
  const HERO = Object.fromEntries(HEROES.map(h => [h.id, h]));
  const HERO_BASE = {
    inf: { hp: 1000, atk: 70, def: 70, spd: 80 },
    cav: { hp: 850, atk: 85, def: 55, spd: 105 },
    arc: { hp: 700, atk: 95, def: 40, spd: 95 }
  };
  const RARITY_MULT = [0, 1, 1.3, 1.7];
  const RARITY_COLOR = ["", "#3a9cff", "#a35cf0", "#f5a623"];
  const heroXpNeed = lvl => Math.round(60 * Math.pow(1.1, lvl - 1));
  const heroCap = hall => 10 + 5 * Math.max(0, hall - 1);
  const STAR_COST = [10, 20, 30, 40, 50];
  const MAX_STARS = 5;
  function heroStats(id, lvl, stars) {
    const h = HERO[id], b = HERO_BASE[h.type], m = RARITY_MULT[h.rarity] * (1 + 0.09 * (lvl - 1)) * (1 + 0.15 * stars);
    return { hp: Math.round(b.hp * m), atk: Math.round(b.atk * m), def: Math.round(b.def * m), spd: b.spd + h.rarity * 3 + stars };
  }
  // Bonificación (en tanto por uno) que da un héroe a las tropas de su tipo cuando las acompaña.
  const heroBonus = (id, lvl, stars) => [0, 0.06, 0.1, 0.15][HERO[id].rarity] * (1 + 0.02 * (lvl - 1)) * (1 + 0.1 * stars);
  const SKILLS = {
    strike: { mult: 2.3 },
    sweep: { mult: 0.9 },
    pierce: { mult: 2.6 },
    charge: { mult: 1.7, stun: 1 },
    heal: { mult: 1.8 },
    shield: { mult: 0.9, turns: 2 },
    rally: { buff: 0.3, turns: 2 }
  };
  const RECRUIT = { legendary: 0.03, epic: 0.22, pity: 40, gems: 150 };

  // Investigación en la Academia. eff: efecto por nivel. El nivel k pide la Academia al nivel 2k - 1.
  const TECHS = {
    agri: { icon: "🌾", max: 10, eff: { prod_bread: 0.05 } },
    lumber: { icon: "🪓", max: 10, eff: { prod_wood: 0.05 } },
    masonry: { icon: "⛰️", max: 10, eff: { prod_stone: 0.05 } },
    mining: { icon: "⛏️", max: 10, eff: { prod_iron: 0.05 } },
    tax: { icon: "🪙", max: 10, eff: { prod_gold: 0.05 } },
    build: { icon: "🔨", max: 10, eff: { build_speed: 0.03 } },
    drill: { icon: "⏱️", max: 10, eff: { train_speed: 0.04 } },
    inf: { icon: "🛡️", max: 10, eff: { inf_stats: 0.03 } },
    cav: { icon: "🐎", max: 10, eff: { cav_stats: 0.03 } },
    arc: { icon: "🏹", max: 10, eff: { arc_stats: 0.03 } },
    load: { icon: "🎒", max: 5, eff: { load: 0.1 } },
    march: { icon: "🚩", max: 2, eff: { marches: 1 } },
    medic: { icon: "🩹", max: 5, eff: { heal_speed: 0.1 } },
    towers: { icon: "🗼", max: 10, eff: { td_tower: 0.06 } },
    valor: { icon: "⚔️", max: 10, eff: { td_gov: 0.08 } }
  };
  function techCost(k) {
    const f = Math.pow(1.75, k - 1), out = { bread: Math.round(400 * f), wood: Math.round(400 * f), stone: Math.round(150 * f), gold: Math.round(120 * f) };
    if (k >= 3) out.iron = Math.round(40 * f);
    return out;
  }
  const techTime = k => Math.round(40 * Math.pow(1.7, k - 1));
  const techAcademy = (key, k) => (key === "march" ? [0, 8, 16][k] : 2 * k - 1);

  // Misiones de capítulo: [tipo, clave, objetivo, recompensa]. Después de la lista se generan solas.
  const QUESTS = [
    ["b", "center", 2, { bread: 600, wood: 600, stone: 200 }],
    ["b", "farm", 2, { wood: 300, bread: 300 }],
    ["td", "", 1, { gems: 30 }],
    ["b", "sawmill", 2, { bread: 300, wood: 300 }],
    ["b", "house", 2, { gold: 200 }],
    ["b", "barracks", 1, { bread: 400, wood: 300 }],
    ["train", "inf", 20, { wood: 500, xp: 100 }],
    ["rebel", "", 1, { gems: 30, tokens: 1 }],
    ["b", "quarry", 2, { stone: 300 }],
    ["b", "wall", 3, { stone: 400, wood: 300 }],
    ["b", "center", 3, { bread: 1200, wood: 1200, stone: 400 }],
    ["b", "herohall", 1, { tokens: 1 }],
    ["recruit", "", 1, { xp: 300 }],
    ["exp", "", 3, { gems: 30 }],
    ["td", "", 3, { bread: 1500, wood: 1500 }],
    ["b", "clinic", 2, { bread: 800 }],
    ["b", "center", 4, { bread: 2500, wood: 2500, stone: 800, gems: 30 }],
    ["b", "range", 1, { wood: 1000 }],
    ["train", "arc", 30, { bread: 1500, xp: 300 }],
    ["gather", "", 1, { stone: 1200 }],
    ["b", "tower", 3, { stone: 1500, gems: 20 }],
    ["td", "", 5, { tokens: 1 }],
    ["b", "center", 5, { bread: 5000, wood: 5000, stone: 1500, gold: 800 }],
    ["b", "academy", 1, { gold: 1000 }],
    ["research", "", 2, { gems: 40 }],
    ["b", "embassy", 2, { bread: 3000 }],
    ["exp", "", 8, { tokens: 1, xp: 800 }],
    ["rebel", "", 5, { gems: 50 }],
    ["b", "center", 6, { bread: 9000, wood: 9000, stone: 3000, gold: 1500 }],
    ["b", "stable", 1, { wood: 3000 }],
    ["b", "mine", 2, { iron: 400 }],
    ["train", "cav", 50, { bread: 5000, xp: 800 }],
    ["herolvl", "", 10, { tokens: 2 }],
    ["b", "center", 7, { bread: 15000, wood: 15000, stone: 5000, iron: 800, gems: 50 }],
    ["bear", "", 1, { gems: 60 }],
    ["td", "", 10, { tokens: 2 }],
    ["exp", "", 15, { gems: 60, xp: 2000 }],
    ["b", "center", 8, { bread: 25000, wood: 25000, stone: 8000, iron: 1500 }]
  ];
  function quest(i) {
    if (i < QUESTS.length) return QUESTS[i];
    // Misiones sin fin: Centro urbano, defensa y expedición por turnos.
    const k = i - QUESTS.length, step = Math.floor(k / 3), f = Math.pow(1.45, step);
    const reward = { bread: Math.round(30000 * f), wood: Math.round(30000 * f), gems: 40 };
    if (k % 3 === 0) return ["b", "center", Math.min(20, 9 + step), reward];
    if (k % 3 === 1) return ["td", "", 12 + step * 2, reward];
    return ["exp", "", 18 + step * 3, { ...reward, tokens: 1 }];
  }

  // Tareas diarias: puntos de actividad y cofres.
  const DAILY = [
    { id: "collect", n: 5, pts: 10 },
    { id: "build", n: 2, pts: 15 },
    { id: "train", n: 2, pts: 15 },
    { id: "td", n: 2, pts: 15 },
    { id: "exp", n: 3, pts: 15 },
    { id: "rebel", n: 2, pts: 15 },
    { id: "gather", n: 1, pts: 10 },
    { id: "help", n: 3, pts: 5 }
  ];
  const CHESTS = [20, 40, 60, 80, 100];

  R.datos = {
    RES, ICON, BUILDINGS, ORDER, buildCost, buildTime, prodRate, STORE_HOURS, centerReqs,
    TROOPS, TYPES, BEATS, TIERS, TIER_UNLOCK, TIER_POWER, tierMult, unitCost, unitTime, batchSize, unitLoad,
    HEROES, HERO, HERO_BASE, RARITY_MULT, RARITY_COLOR, heroXpNeed, heroCap, STAR_COST, MAX_STARS, heroStats, heroBonus, SKILLS, RECRUIT,
    TECHS, techCost, techTime, techAcademy, QUESTS, quest, DAILY, CHESTS
  };
  if (typeof module !== "undefined" && module.exports) module.exports = R.datos;
})(typeof window !== "undefined" ? window : globalThis);
