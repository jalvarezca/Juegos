/* Reino: interfaz. Dibuja la ciudad, los héroes, la defensa, la expedición, el mapa y las misiones,
   y avanza el motor cada medio segundo con la hora real. */
(() => {
  "use strict";
  const R = window.Reino, D = R.datos, M = R.motor, TD = R.defensa, TX = R.textos, NB = R.NB;
  const $ = id => document.getElementById(id);
  const KEY = "reino:partida";
  let skew = 0;
  const now = () => Date.now() + skew;
  const store = {
    raw(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const HERO_NAMES = { brunilda: "Brunilda", gael: "Gael", tobias: "Tobías", marta: "Marta", leonor: "Leonor", dario: "Darío", iker: "Iker", sara: "Sara", selene: "Selene", elio: "Elio", nora: "Nora", bruno: "Bruno" };
  const TYPE_COLOR = { inf: "#c0563b", cav: "#3d7a3f", arc: "#3d5ba9" };
  const FIELD_ICON = { bread: "🌾", wood: "🌲", stone: "🪨", iron: "⛏️" };

  // Idioma y formatos
  function pickLang() {
    const saved = store.get("reino:idioma", null);
    if (TX[saved]) return saved;
    for (const l of navigator.languages || [navigator.language || ""]) { const b = String(l).slice(0, 2).toLowerCase(); if (TX[b]) return b; }
    return "es";
  }
  let lang = pickLang();
  const L = () => TX[lang];
  const fmt = (s, a) => s.replace(/\{(\d)\}/g, (_, i) => (a[i] != null ? a[i] : ""));
  function t(path, ...args) {
    const v = path.split(".").reduce((o, k) => (o == null ? o : o[k]), TX[lang]);
    return typeof v === "string" ? fmt(v, args) : v;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function num(n) {
    n = Math.floor(n || 0);
    const a = Math.abs(n);
    if (a < 10000) return n.toLocaleString(lang);
    const [v, u] = a >= 1e9 ? [n / 1e9, "B"] : a >= 1e6 ? [n / 1e6, "M"] : [n / 1e3, "K"];
    return (Math.abs(v) < 100 ? (Math.floor(v * 10) / 10).toLocaleString(lang, { maximumFractionDigits: 1 }) : Math.floor(v).toLocaleString(lang)) + u;
  }
  function dur(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (d) return `${d} d ${h} h`;
    if (h) return `${h} h ${String(m).padStart(2, "0")} min`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }
  // Números cortos para la barra de recursos: 950, 4,1K, 38K, 999K, 1,2M
  const shortNum = n => { const a = Math.abs(n); return a < 1000 ? num(n) : a < 1e4 ? (Math.floor(n / 100) / 10).toLocaleString(lang, { maximumFractionDigits: 1 }) + "K" : a < 1e6 ? Math.floor(n / 1000).toLocaleString(lang) + "K" : num(n); };
  const bName = k => L().b[k][0];
  const heroName = id => HERO_NAMES[id] || id;
  const chips = (cost, check) => Object.entries(cost || {}).filter(([, v]) => v > 0)
    .map(([r, v]) => `<span class="c${check && (S.res[r] || 0) < v ? " miss" : ""}" title="${esc(L().res[r])}">${D.ICON[r]} ${num(v)}</span>`).join("");
  const portrait = (letter, color, typeIcon) => `<span class="por" style="--rc:${color}">${esc(letter)}<span class="ty">${typeIcon || ""}</span></span>`;
  const heroPortrait = id => portrait(heroName(id)[0], D.RARITY_COLOR[D.HERO[id].rarity], D.TROOPS[D.HERO[id].type].icon);
  const starsTxt = n => "★".repeat(n) + "☆".repeat(D.MAX_STARS - n);

  // Sonido
  let soundOn = store.get("reino:sonido", true) !== false, ac = null;
  function tone(f, d, o) {
    if (!soundOn) return;
    o = o || {};
    try {
      if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return; ac = new A(); }
      if (ac.state === "suspended") ac.resume();
      const t0 = ac.currentTime + (o.at || 0), osc = ac.createOscillator(), g = ac.createGain();
      osc.type = o.type || "triangle";
      osc.frequency.setValueAtTime(f, t0);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + d);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(o.vol || 0.05, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      osc.connect(g); g.connect(ac.destination);
      osc.start(t0); osc.stop(t0 + d + 0.03);
    } catch (e) {}
  }
  const last = {};
  function sfx(name) {
    const tnow = performance.now(), gap = { arrow: 90, hit: 70, coin: 60 }[name] || 0;
    if (gap && tnow - (last[name] || 0) < gap) return;
    last[name] = tnow;
    if (name === "click") tone(660, 0.05, { vol: 0.03 });
    else if (name === "build") [523, 659, 784].forEach((f, k) => tone(f, 0.14, { at: k * 0.07 }));
    else if (name === "coin") { tone(1320, 0.06, { type: "square", vol: 0.015 }); tone(1760, 0.08, { type: "square", vol: 0.014, at: 0.05 }); }
    else if (name === "arrow") tone(900, 0.04, { type: "sawtooth", vol: 0.008, to: 500 });
    else if (name === "boom") tone(140, 0.25, { type: "square", vol: 0.03, to: 50 });
    else if (name === "hit") tone(300 + Math.random() * 80, 0.05, { type: "square", vol: 0.02 });
    else if (name === "win") [523, 659, 784, 1047].forEach((f, k) => tone(f, 0.2, { vol: 0.06, at: k * 0.1 }));
    else if (name === "lose") [392, 330, 262].forEach((f, k) => tone(f, 0.26, { vol: 0.05, at: k * 0.15 }));
    else if (name === "recruit") [784, 988, 1319, 1568].forEach((f, k) => tone(f, 0.16, { vol: 0.05, at: k * 0.08 }));
  }

  // Avisos breves y anuncios para lectores de pantalla
  function toast(msg) {
    const box = $("toasts"), el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    box.append(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 3200);
    announce(msg);
  }
  let liveT = 0;
  function announce(msg) {
    clearTimeout(liveT);
    $("live").textContent = "";
    liveT = setTimeout(() => { $("live").textContent = msg; }, 50);
  }
  const rewardText = rew => Object.entries(rew || {}).filter(([, v]) => v > 0).map(([r, v]) => `${D.ICON[r]} +${num(v)}`).join("  ");

  // Partida
  let S = null, offline = null;
  function saveGame() { if (S) store.put(KEY, M.save(S)); }
  (function boot() {
    const raw = store.raw(KEY), t0 = now(), loaded = raw ? M.load(raw, t0) : null;
    if (loaded) {
      const away = t0 - loaded.last, ev = M.tick(loaded, t0);
      if (away > 2 * M.MIN) offline = { away, ev };
      S = loaded;
    } else S = M.newGame(t0);
    M.tick(S, t0);
  })();

  // Estado de la interfaz
  const ui = { tab: "town", train: {}, march: null, battle: null, tdStage: null, td: null };
  let sheetFn = null, lastRender = 0;

  function eventText(e) {
    if (e.t === "built") return `🔨 ${t("built", bName(e.key), e.lvl)}`;
    if (e.t === "trained") return `${D.TROOPS[e.type].icon} ${t("trained", num(e.n), L().unit[e.type])}`;
    if (e.t === "healed") return `⛑️ ${t("healed", num(e.n))}`;
    if (e.t === "researched") return `📜 ${t("researched", L().tech[e.key][0], e.lvl)}`;
    if (e.t === "returned") {
      const r = e.result || {}, loot = rewardText(e.loot);
      if (r.kind === "rebel") return `${r.win ? "🏆 " + t("won", r.lvl) : "💀 " + t("lost", r.lvl)}${loot ? " · " + loot : ""}`;
      if (r.kind === "gather") return `${FIELD_ICON[r.type]} ${t("gathered", num(r.amount))}`;
      if (r.kind === "bear") return `🐻 ${t("bearHit", num(r.dmg), num(r.ally))}`;
      return t("returned");
    }
    return "";
  }
  function handleEvents(ev) {
    for (const e of ev) { const m = eventText(e); if (m) toast(m); }
    if (ev.some(e => e.t === "built" || e.t === "researched")) sfx("build");
  }

  // Bucle principal: avanza el juego, actualiza contadores y vuelve a dibujar si algo terminó.
  function loop() {
    const ev = M.tick(S, now());
    if (ev.length) { handleEvents(ev); saveGame(); render(); refreshSheet(); }
    else if (now() - lastRender > 5000 && canRerender()) render();
    updateLive();
  }
  const canRerender = () => !ui.battle && !(ui.td && ui.td.G) && !(document.activeElement && document.activeElement.type === "range");
  function updateLive() {
    renderTop();
    const tnow = now();
    document.querySelectorAll("[data-end]").forEach(el => {
      const end = +el.dataset.end, start = +el.dataset.start, left = el.querySelector(".tleft"), bar = el.querySelector(".pbar>i");
      if (left) left.textContent = dur(end - tnow);
      if (bar) bar.style.width = Math.min(100, Math.max(0, ((tnow - start) / Math.max(1, end - start)) * 100)) + "%";
    });
    document.querySelectorAll("[data-stored]").forEach(el => { el.textContent = num(M.stored(S, el.dataset.stored, tnow)); });
    document.querySelectorAll("[data-idle]").forEach(el => { el.textContent = num(M.idleNow(S, tnow)[el.dataset.idle] || 0); });
  }
  function renderTop() {
    $("power").textContent = num(M.power(S));
    $("gems").textContent = num(S.res.gems);
    $("powerPill").title = t("power");
    const bar = $("resbar"), html = D.RES.map(r => `<span class="rc" title="${esc(L().res[r] + ": " + Math.floor(S.res[r]).toLocaleString(lang))}">${D.ICON[r]}<span>${shortNum(S.res[r])}</span></span>`).join("");
    if (bar.innerHTML !== html) bar.innerHTML = html;
    renderQuestBar();
  }

  // Misión actual, siempre visible arriba
  function questText(q) {
    const [kind, key, n] = q;
    if (kind === "b") return n === 1 ? t("q.b1", bName(key)) : t("q.b", bName(key), n);
    if (kind === "train") return t("q.train", L().unit[key], n);
    return t("q." + kind, n);
  }
  function renderQuestBar() {
    const q = M.currentQuest(S), p = M.questProgress(S, q), bar = $("questbar");
    const html = `<span class="qi" aria-hidden="true">📜</span><span class="qt">${esc(questText(q))}</span><span class="qp">${p.done ? esc(t("claim")) : p.v + "/" + p.n}</span>`;
    if (bar.innerHTML !== html) bar.innerHTML = html;
    bar.classList.toggle("done", p.done);
  }
  function goQuest() {
    const q = M.currentQuest(S), p = M.questProgress(S, q);
    if (p.done) {
      const rew = M.claimQuest(S);
      if (rew) { sfx("coin"); toast(`${t("got")}: ${rewardText(rew)}`); saveGame(); render(); }
      return;
    }
    const [kind, key] = q;
    if (kind === "b") { setTab("town"); openBuilding(key); }
    else if (kind === "train") { setTab("town"); openBuilding(D.TROOPS[key].building); }
    else if (kind === "research") { setTab("town"); openBuilding("academy"); }
    else if (kind === "td") setTab("td");
    else if (kind === "exp") setTab("exp");
    else if (kind === "recruit" || kind === "herolvl") setTab("heroes");
    else setTab("map");
  }

  // Pestañas
  const TABS = [["town", "🏰"], ["heroes", "👑"], ["td", "🛡️"], ["exp", "⚔️"], ["map", "🗺️"], ["quests", "📋"]];
  function tabDot(id) {
    const tnow = now();
    if (id === "town") return Object.keys(S.prod).some(k => M.stored(S, k, tnow) >= Math.max(10, M.rate(S, k) * 0.25));
    if (id === "exp") return Object.values(M.idleNow(S, tnow)).some(v => v > 0) && tnow - S.exp.idleT > M.HOUR;
    if (id === "quests") return D.CHESTS.some((p, i) => M.dailyPoints(S) >= p && !S.daily.claimed.includes(i));
    if (id === "map") return M.mapOpen(S) && M.BEAR_STEPS.some((x, i) => S.bear.base && S.bear.damage >= x * S.bear.base && !S.bear.claimed.includes(i));
    return false;
  }
  function renderTabs() {
    $("tabs").innerHTML = TABS.map(([id, ic]) => `<button type="button" class="tab" role="tab" data-act="tab" data-k="${id}" data-fk="tab-${id}" aria-selected="${ui.tab === id}"><b aria-hidden="true">${ic}</b>${esc(L().tabs[id])}${tabDot(id) ? '<span class="dot" aria-hidden="true"></span>' : ""}</button>`).join("");
  }
  function setTab(id) {
    if (ui.td && ui.td.G && id !== "td") stopTd();
    ui.tab = id;
    render();
    $("view").focus({ preventScroll: true });
  }
  const VIEWS = {};
  function render() {
    lastRender = now();
    const fk = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fk : null;
    renderTabs();
    if (!(ui.tab === "td" && ui.td && ui.td.G)) $("view").innerHTML = VIEWS[ui.tab]();
    if (VIEWS[ui.tab + "After"]) VIEWS[ui.tab + "After"]();
    if (fk) { const el = document.querySelector(`[data-fk="${fk}"]`); if (el) el.focus({ preventScroll: true }); }
    updateLive();
  }

  // Hoja de detalles (ventana inferior)
  function openSheet(fn) {
    sheetFn = fn;
    $("sheetBody").innerHTML = fn();
    const sh = $("sheet");
    if (!sh.classList.contains("on")) { sh.classList.add("on"); sh.dataset.back = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fk || "" : ""; }
    const first = $("sheetBody").querySelector("button:not(:disabled), input");
    (first || $("sheetClose")).focus({ preventScroll: true });
    updateLive();
  }
  function refreshSheet() {
    if (!sheetFn || !$("sheet").classList.contains("on")) return;
    const a = document.activeElement, fk = a && a.dataset ? a.dataset.fk : null;
    if (a && a.type === "range") return;
    $("sheetBody").innerHTML = sheetFn();
    if (fk) { const el = $("sheetBody").querySelector(`[data-fk="${fk}"]`); if (el) el.focus({ preventScroll: true }); }
    updateLive();
  }
  function closeSheet() {
    const sh = $("sheet");
    sh.classList.remove("on");
    sheetFn = null;
    ui.march = null;
    const back = sh.dataset.back && document.querySelector(`[data-fk="${sh.dataset.back}"]`);
    if (back) back.focus({ preventScroll: true });
  }
  const timerRow = (tm, label) => {
    const cost = M.finishCost(S, tm, now()), pct = Math.min(100, ((now() - tm.start) / Math.max(1, tm.end - tm.start)) * 100);
    const help = M.canHelp(S, tm) ? `<button type="button" class="btn royal" data-act="help" data-id="${tm.id}" data-fk="help-${tm.id}">🤝 ${esc(t("helpBtn", M.helpsFor(S)))}</button>` : "";
    const fin = cost == null ? "" : cost === 0
      ? `<button type="button" class="btn good" data-act="finish" data-id="${tm.id}" data-fk="fin-${tm.id}">⚡ ${esc(t("finishFree"))}</button>`
      : `<button type="button" class="btn" data-act="finish" data-id="${tm.id}" data-fk="fin-${tm.id}"${S.res.gems < cost ? " disabled" : ""}>⚡ ${esc(t("finishGems", cost))}</button>`;
    return `<div class="timer" data-end="${tm.end}" data-start="${tm.start}"><div class="tl"><span>${label}</span><b class="tleft">${dur(tm.end - now())}</b></div><div class="pbar"><i style="width:${pct}%"></i></div>${help || fin ? `<div class="btns">${help}${fin}</div>` : ""}</div>`;
  };

  // Ciudad
  const timerFor = k => S.timers.find(x => x.kind !== "march" && (x.key === k || (x.kind === "research" && k === "academy")));
  const kindLabel = tm => (tm.kind === "build" ? t("upgrading") : tm.kind === "train" ? t("training", `${num(tm.data.n)} ${D.TROOPS[tm.data.type].icon}`) : tm.kind === "heal" ? t("healing", "") : t("researching", L().tech[tm.key][0]));
  function buildingTile(k) {
    const b = D.BUILDINGS[k], lv = M.lvl(S, k), locked = M.lvl(S, "center") < b.unlock, tm = timerFor(k);
    const cat = b.prod ? " k-res" : b.troop || k === "wall" || k === "tower" || k === "clinic" ? " k-mil" : k === "herohall" || k === "center" ? " k-hero" : "";
    let st = "", extra = "";
    if (locked) st = `🔒 🏰 ${b.unlock}`;
    else if (tm) { st = `<span class="tleft">${dur(tm.end - now())}</span>`; extra = `<span class="pbar"><i></i></span>`; }
    else if (b.prod && lv) {
      const n = M.stored(S, k, now());
      st = `${D.ICON[b.prod]} <span data-stored="${k}">${num(n)}</span>`;
      if (n >= Math.max(10, M.rate(S, k) * 0.25)) extra += `<span class="bub" aria-hidden="true">${D.ICON[b.prod]}</span>`;
    } else if (!lv) st = t("build");
    if (!locked && !tm && M.upgradeInfo(S, k).ok) extra += `<span class="upok" aria-hidden="true">↑</span>`;
    const attrs = tm ? ` data-end="${tm.end}" data-start="${tm.start}"` : "";
    return `<button type="button" class="bld${cat}${locked ? " locked" : ""}" data-act="bld" data-k="${k}" data-fk="b-${k}"${attrs} aria-label="${esc(bName(k) + ", " + t("lvl", lv))}">
      <span class="ico" aria-hidden="true">${b.icon}</span>${lv ? `<span class="lv">${lv}</span>` : ""}<span class="nm">${esc(bName(k))}</span><span class="st">${st}</span>${extra}</button>`;
  }
  VIEWS.town = () => {
    const builds = M.timersOf(S, "build"), any = Object.keys(S.prod).some(k => M.stored(S, k, now()) >= 1);
    let h = `<div class="queue"><div class="row" style="justify-content:space-between"><span class="muted small">🔨 ${esc(t("builders", builds.length, M.builders(S)))}</span>`;
    if (any) h += `<button type="button" class="btn good" data-act="collectAll" data-fk="collectAll">🧺 ${esc(t("collectAll"))}</button>`;
    h += "</div>";
    for (const tm of builds) h += timerRow(tm, `${D.BUILDINGS[tm.key].icon} ${esc(bName(tm.key))} → ${esc(t("lvl", M.lvl(S, tm.key) + 1))}`);
    return h + `</div><div class="townmap"><div class="tgrid">${D.ORDER.map(buildingTile).join("")}</div></div>`;
  };

  // Ficha de un edificio
  const openBuilding = k => openSheet(() => buildingSheet(k));
  function upgradeBlock(k) {
    const tm = M.timersOf(S, "build", k)[0];
    if (tm) return timerRow(tm, `🔨 ${esc(t("upgrading"))} → ${esc(t("lvl", M.lvl(S, k) + 1))}`);
    const u = M.upgradeInfo(S, k);
    if (u.reason === "max") return `<p class="muted">${esc(t("reason.max"))}</p>`;
    if (u.reason === "locked") return `<p class="reason">🔒 ${esc(t("locked", D.BUILDINGS[k].unlock))}</p>`;
    const reqs = u.reqs.map(([rk, n, ok]) => `<li class="${ok ? "" : "no"}">${ok ? "✅" : "❌"} ${esc(bName(rk))} · ${esc(t("lvlShort", n))}</li>`).join("");
    const label = u.lvl === 0 ? t("build") : t("upgradeTo", u.lvl + 1);
    const why = u.ok ? "" : `<p class="reason">${esc(t("reason." + u.reason))}</p>`;
    return `<h3>${esc(label)}</h3><ul class="reqs">${reqs}</ul><div class="costs">${chips(u.cost, true)}<span class="c">⏱️ ${dur(u.time * 1000)}</span></div>${why}
      <button type="button" class="btn primary wide" data-act="upgrade" data-k="${k}" data-fk="up-${k}"${u.ok ? "" : " disabled"}>⬆️ ${esc(label)}</button>`;
  }
  function buildingSheet(k) {
    const b = D.BUILDINGS[k], lv = M.lvl(S, k);
    let h = `<div class="sh-head"><span class="ico" aria-hidden="true">${b.icon}</span><div><h2 id="sheetTitle">${esc(bName(k))}</h2><p class="muted small">${esc(t("lvl", lv))} · ${esc(L().b[k][1])}</p></div></div>`;
    if (M.lvl(S, "center") < b.unlock) return h + `<p class="reason">🔒 ${esc(t("locked", b.unlock))}</p>`;
    if (lv) {
      if (b.prod) h += prodBlock(k);
      else if (b.troop) h += trainBlock(b.troop);
      else if (k === "clinic") h += clinicBlock();
      else if (k === "academy") h += academyBlock();
      else if (k === "herohall") h += recruitBlock();
      else if (k === "embassy") h += `<div class="card"><h3>🤝 ${esc(t("alliance"))}</h3><p class="small muted">${esc(t("allianceText", M.helpsFor(S)))}</p></div>`;
      else if (k === "wall") h += `<div class="card small">${esc(t("wallText", M.tdMods(S).wall))}</div>`;
      else if (k === "tower") h += `<div class="card small">${esc(t("towerText", Math.round((M.tdMods(S).tower - 1) * 100)))}</div>`;
      else if (k === "center") h += centerBlock();
    }
    return h + `<div class="card" style="margin-top:8px">${upgradeBlock(k)}</div>`;
  }
  function prodBlock(k) {
    const b = D.BUILDINGS[k], lv = M.lvl(S, k), next = D.prodRate(k, lv + 1) * (1 + M.eff(S, "prod_" + b.prod));
    return `<div class="card"><p><b>${esc(t("produces", D.ICON[b.prod] + " " + num(M.rate(S, k))))}</b></p><p class="small">${D.ICON[b.prod]} <span data-stored="${k}">${num(M.stored(S, k, now()))}</span> / ${num(M.cap(S, k))}</p>
      ${lv < 20 ? `<p class="small muted">${esc(t("nextLvl", lv + 1, `${D.ICON[b.prod]} ${num(next)}/h`))}</p>` : ""}
      <button type="button" class="btn good wide" data-act="collect" data-k="${k}" data-fk="col-${k}">🧺 ${esc(t("collect"))}</button></div>`;
  }
  function centerBlock() {
    const lv = M.lvl(S, "center"), news = D.ORDER.filter(x => D.BUILDINGS[x].unlock === lv + 1);
    return `<div class="card small"><p>${esc(t("centerText", M.builders(S), M.marchSlots(S)))}</p><p class="muted">${news.length ? esc(t("unlocksNext")) + " " + news.map(x => D.BUILDINGS[x].icon + " " + esc(bName(x))).join(", ") : esc(t("nothingNew"))}</p></div>`;
  }

  // Entrenamiento de tropas
  function trainState(ty) {
    let st = ui.train[ty];
    if (!st) { let tier = 1; for (let i = D.TIERS; i >= 1; i--) if (M.tierOpen(S, ty, i)) { tier = i; break; } st = ui.train[ty] = { tier, qty: 0 }; }
    return st;
  }
  const trainMax = (ty, tier) => Math.max(0, Math.min(M.trainInfo(S, ty, tier, 1).max, M.affordable(S, D.unitCost(tier))));
  function trainBlock(ty) {
    const key = D.TROOPS[ty].building, tm = M.timersOf(S, "train", key)[0], st = trainState(ty);
    const owned = S.troops[ty].reduce((a, b) => a + b, 0);
    let h = `<div class="card"><h3>${D.TROOPS[ty].icon} ${esc(L().troop[ty])} · ${esc(t("owned"))} ${num(owned)}</h3><div class="tiers" role="group">`;
    for (let i = 1; i <= D.TIERS; i++) {
      const open = M.tierOpen(S, ty, i);
      h += `<button type="button" data-act="tier" data-k="${ty}" data-n="${i}" data-fk="tier-${ty}-${i}" aria-pressed="${st.tier === i}"${open ? "" : ` disabled title="${esc(t("tierLocked", bName(key), D.TIER_UNLOCK[i - 1]))}"`}>T${i}${open ? "" : " 🔒"}</button>`;
    }
    const m = D.tierMult(st.tier), base = D.TROOPS[ty];
    h += `</div><div class="kv"><div>${esc(t("atk"))}<b>${num(base.atk * m)}</b></div><div>${esc(t("def"))}<b>${num(base.def * m)}</b></div><div>${esc(t("hp"))}<b>${num(base.hp * m)}</b></div><div>${esc(t("owned"))}<b>${num(S.troops[ty][st.tier - 1])}</b></div></div>`;
    if (tm) return h + timerRow(tm, `${esc(t("training", num(tm.data.n) + " " + L().unit[ty]))}`) + `<p class="small muted">${esc(L().counters)}</p></div>`;
    const max = trainMax(ty, st.tier);
    if (!st.qty || st.qty > max) st.qty = max;
    const info = M.trainInfo(S, ty, st.tier, Math.max(1, st.qty));
    h += `<div class="tsl"><label for="trQty"><span>${esc(t("qty"))}</span><span id="trQtyTxt">${num(st.qty)}</span></label>
      <input type="range" id="trQty" data-range="train" data-k="${ty}" data-fk="trq-${ty}" min="${max ? 1 : 0}" max="${max}" value="${st.qty}" step="1"${max ? "" : " disabled"}></div>
      <p class="small muted">${esc(t("batch", num(M.trainInfo(S, ty, 1, 1).max)))}</p>
      <div class="costs" id="trCost">${chips(info.cost, true)}<span class="c">⏱️ ${dur(info.time * 1000)}</span></div>
      <button type="button" class="btn primary wide" id="trBtn" data-act="train" data-k="${ty}" data-fk="train-${ty}"${info.ok && st.qty ? "" : " disabled"}>${D.TROOPS[ty].icon} ${esc(t("train"))}</button>
      ${info.ok || !st.qty ? "" : `<p class="reason">${esc(t("reason." + info.reason))}</p>`}<p class="small muted">${esc(L().counters)}</p></div>`;
    return h;
  }
  function onTrainRange(el) {
    const ty = el.dataset.k, st = trainState(ty);
    st.qty = +el.value;
    const info = M.trainInfo(S, ty, st.tier, Math.max(1, st.qty));
    $("trQtyTxt").textContent = num(st.qty);
    $("trCost").innerHTML = `${chips(info.cost, true)}<span class="c">⏱️ ${dur(info.time * 1000)}</span>`;
    $("trBtn").disabled = !(info.ok && st.qty);
  }

  // Enfermería
  function clinicBlock() {
    const tm = M.timersOf(S, "heal")[0], hi = M.healInfo(S);
    let h = `<div class="card"><p><b>${esc(t("wounded", num(M.troopCount(S.wounded)), num(M.clinicCap(S))))}</b></p>`;
    if (tm) return h + timerRow(tm, `⛑️ ${esc(t("healing", num(M.troopCount(tm.data.units))))}`) + "</div>";
    if (hi.n) h += `<div class="costs">${chips(hi.cost, true)}<span class="c">⏱️ ${dur(hi.time * 1000)}</span></div>`;
    h += `<button type="button" class="btn primary wide" data-act="heal" data-fk="heal"${hi.ok ? "" : " disabled"}>⛑️ ${esc(t("heal"))}</button>`;
    if (!hi.ok && hi.reason !== "none") h += `<p class="reason">${esc(t("reason." + hi.reason))}</p>`;
    return h + "</div>";
  }

  // Academia
  function academyBlock() {
    const tm = M.timersOf(S, "research")[0];
    let h = tm ? timerRow(tm, `📜 ${esc(t("researching", L().tech[tm.key][0]))}`) : "";
    h += '<div class="list" style="margin-top:6px">';
    for (const key of Object.keys(D.TECHS)) {
      const r = M.researchInfo(S, key), tech = D.TECHS[key], [name, desc] = L().tech[key];
      const why = r.ok || r.reason === "busy" ? "" : r.reason === "academy" ? t("reason.academy", r.need) : t("reason." + r.reason);
      h += `<div class="li"><span class="ic" aria-hidden="true">${tech.icon}</span><span class="tx"><b>${esc(name)} · ${r.lvl}/${tech.max}</b><small>${esc(desc)}</small>
        ${r.reason === "max" ? "" : `<span class="costs">${chips(r.cost, true)}<span class="c">⏱️ ${dur(r.time * 1000)}</span></span>`}${why ? `<small class="reason">${esc(why)}</small>` : ""}</span>
        <button type="button" class="btn primary" data-act="research" data-k="${key}" data-fk="res-${key}"${r.ok ? "" : " disabled"}>${esc(t("research"))}</button></div>`;
    }
    return h + "</div>";
  }

  // Sala de héroes: reclutamiento
  function recruitBlock() {
    const tok = S.res.tokens, gems = S.res.gems, g = D.RECRUIT.gems;
    return `<div class="card"><h3>🎟️ ${esc(t("recruitTitle"))}</h3><p class="small muted">${esc(L().rates)} ${esc(t("pity", D.RECRUIT.pity - S.pity))}</p>
      <div class="btns"><button type="button" class="btn primary" data-act="recruit" data-n="1" data-g="0" data-fk="rc1"${tok >= 1 ? "" : " disabled"}>${esc(t("recruit1"))} · 🎟️ 1</button>
      <button type="button" class="btn primary" data-act="recruit" data-n="10" data-g="0" data-fk="rc10"${tok >= 10 ? "" : " disabled"}>${esc(t("recruit10"))} · 🎟️ 10</button></div>
      <div class="btns"><button type="button" class="btn royal" data-act="recruit" data-n="1" data-g="1" data-fk="rg1"${gems >= g ? "" : " disabled"}>${esc(t("recruit1"))} · 💎 ${g}</button>
      <button type="button" class="btn royal" data-act="recruit" data-n="10" data-g="1" data-fk="rg10"${gems >= g * 10 ? "" : " disabled"}>${esc(t("recruit10"))} · 💎 ${g * 10}</button></div>
      <p class="small muted">🎟️ ${num(tok)} · 💎 ${num(gems)}</p></div>`;
  }
  function recruitSheet(got) {
    return () => `<div class="sh-head"><span class="ico" aria-hidden="true">🎟️</span><div><h2 id="sheetTitle">${esc(t("recruitTitle"))}</h2></div></div>
      <div class="hgrid">${got.map(g => `<div class="hcard" style="--rc:${D.RARITY_COLOR[D.HERO[g.id].rarity]}">${heroPortrait(g.id)}<span class="hn">${esc(heroName(g.id))}</span><span class="hl">${esc(g.dup ? t("dupHero") : t("newHero"))}</span></div>`).join("")}</div>
      <div class="btns"><button type="button" class="btn primary" data-act="tab" data-k="heroes" data-close="1">👑 ${esc(L().tabs.heroes)}</button><button type="button" class="btn" data-act="openB" data-k="herohall">🎟️ ${esc(t("recruit"))}</button></div>`;
  }

  // Héroes
  const inTeam = id => S.formation.includes(id);
  VIEWS.heroes = () => {
    const owned = D.HEROES.filter(h => S.heroes[h.id]).sort((a, b) => b.rarity - a.rarity || S.heroes[b.id].lvl - S.heroes[a.id].lvl);
    const rest = D.HEROES.filter(h => !S.heroes[h.id]);
    const hall = M.lvl(S, "herohall");
    let h = `<h2 class="ttl">${esc(t("heroesTitle"))}</h2><div class="card"><div class="row" style="justify-content:space-between"><span class="small"><b>📘 ${num(S.res.xp)}</b> · 🎟️ ${num(S.res.tokens)}</span>`;
    h += hall ? `<button type="button" class="btn primary" data-act="openB" data-k="herohall" data-fk="goRecruit">🎟️ ${esc(t("recruit"))}</button>` : `<span class="small muted">${esc(t("needHall"))}</span>`;
    h += `</div></div><div class="hgrid" style="margin-top:8px">`;
    for (const x of owned.concat(rest)) {
      const o = S.heroes[x.id];
      h += `<button type="button" class="hcard${o ? "" : " no"}" style="--rc:${D.RARITY_COLOR[x.rarity]}" data-act="hero" data-k="${x.id}" data-fk="h-${x.id}">${inTeam(x.id) ? '<span class="tm" aria-hidden="true">⚔️</span>' : ""}${heroPortrait(x.id)}
        <span class="hn">${esc(heroName(x.id))}</span><span class="hl">${o ? esc(t("lvlShort", o.lvl)) : esc(t("notRecruited"))}</span><span class="stars" aria-hidden="true">${o ? "★".repeat(o.stars) : ""}</span></button>`;
    }
    return h + "</div>";
  };
  function heroSheet(id) {
    const x = D.HERO[id], o = S.heroes[id], lv = o ? o.lvl : 1, stars = o ? o.stars : 0, st = D.heroStats(id, lv, stars);
    const [sk, skd] = L().skill[x.skill], cap = M.heroCap(S), need = D.heroXpNeed(lv);
    let h = `<div class="sh-head">${heroPortrait(id)}<div><h2 id="sheetTitle">${esc(heroName(id))}</h2><p class="small"><b style="color:${D.RARITY_COLOR[x.rarity]}">${esc(L().rarity[x.rarity])}</b> · ${D.TROOPS[x.type].icon} ${esc(L().troop[x.type])} · <span class="stars">${starsTxt(stars)}</span></p></div></div>`;
    h += `<div class="kv"><div>${esc(t("hp"))}<b>${num(st.hp)}</b></div><div>${esc(t("atk"))}<b>${num(st.atk)}</b></div><div>${esc(t("def"))}<b>${num(st.def)}</b></div><div>${esc(t("spd"))}<b>${num(st.spd)}</b></div></div>`;
    h += `<div class="card"><h3>✨ ${esc(t("skillLbl"))}: ${esc(sk)}</h3><p class="small muted">${esc(skd)}</p><p class="small">${esc(t("bonus", Math.round(D.heroBonus(id, lv, stars) * 100), L().troop[x.type]))}</p></div>`;
    if (!o) {
      return h + `<p class="muted">${esc(t("notRecruited"))}</p>${M.lvl(S, "herohall") ? `<button type="button" class="btn primary wide" data-act="openB" data-k="herohall">🎟️ ${esc(t("recruit"))}</button>` : `<p class="small muted">${esc(t("needHall"))}</p>`}`;
    }
    const canLv = lv < cap && S.res.xp >= need;
    h += `<div class="card"><h3>${esc(t("lvl", lv))} / ${cap}</h3><p class="small muted">${esc(M.lvl(S, "herohall") ? t("cap", cap, M.lvl(S, "herohall")) : t("needHall"))}</p>
      ${lv < cap ? `<div class="costs">${chips({ xp: need }, true)}</div>` : ""}
      <div class="btns"><button type="button" class="btn primary" data-act="heroLv" data-k="${id}" data-n="1" data-fk="hl1"${canLv ? "" : " disabled"}>⬆️ ${esc(t("levelUp"))}</button>
      <button type="button" class="btn" data-act="heroLv" data-k="${id}" data-n="999" data-fk="hlm"${canLv ? "" : " disabled"}>⏫ ${esc(t("levelMax"))}</button></div></div>`;
    const starCost = stars < D.MAX_STARS ? D.STAR_COST[stars] : null;
    h += `<div class="card"><h3><span class="stars">${starsTxt(stars)}</span></h3>${starCost ? `<p class="small">${esc(t("shards", o.shards, starCost))}</p>` : ""}
      <button type="button" class="btn royal wide" data-act="heroStar" data-k="${id}" data-fk="hst"${starCost && o.shards >= starCost ? "" : " disabled"}>⭐ ${esc(t("starUp"))}</button></div>`;
    h += `<button type="button" class="btn wide" style="margin-top:8px" data-act="heroTeam" data-k="${id}" data-fk="htm">${inTeam(id) ? "➖ " + esc(t("removeTeam")) : "➕ " + esc(t("addTeam"))}</button>`;
    return h;
  }
  function toggleTeam(id) {
    const f = S.formation.slice(), i = f.indexOf(id);
    if (i >= 0) f[i] = null;
    else {
      // Infantería y caballería delante, arqueros detrás si hay hueco.
      const prefer = D.HERO[id].type === "arc" ? [2, 3, 4, 0, 1] : [0, 1, 2, 3, 4];
      const slot = prefer.find(k => !f[k]);
      if (slot == null) return;
      f[slot] = id;
    }
    M.setFormation(S, f);
  }

  // Defensa del pueblo (tiempo real en un lienzo)
  const KIND_COLOR = { grunt: ["#d26b4f", "#7a2f1d"], runner: ["#efa13f", "#8a5410"], brute: ["#8a64b8", "#43285f"], boss: ["#4a4a55", "#111"] };
  const TREES = [[20, 30], [330, 20], [300, 170], [20, 250], [340, 380], [150, 330], [250, 455], [20, 470], [330, 470], [120, 110]];
  const STEP = 1 / 120;
  const pct = m => Math.round((m - 1) * 100);
  VIEWS.td = () => {
    const best = S.td.best, stage = (ui.tdStage = Math.min(best + 1, Math.max(1, ui.tdStage || best + 1))), mods = M.tdMods(S), stars = S.td.stars[stage] || 0;
    return `<h2 class="ttl">${esc(t("tdTitle"))}</h2><p class="small muted">${esc(t("tdText"))}</p>
      <div class="card"><div class="row" style="justify-content:space-between">
        <button type="button" class="btn" data-act="tdStage" data-n="-1" data-fk="tdPrev" aria-label="−"${stage <= 1 ? " disabled" : ""}>◀</button>
        <div style="text-align:center"><b style="font-size:20px">${esc(t("tdStage", stage))}</b><div class="stars" aria-label="${stars}/3">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</div><div class="small muted">${esc(t("tdBest", best))}</div></div>
        <button type="button" class="btn" data-act="tdStage" data-n="1" data-fk="tdNext" aria-label="+"${stage >= best + 1 ? " disabled" : ""}>▶</button></div>
        <p class="small muted">${esc(t("tdMods", mods.wall, pct(mods.tower), pct(mods.gov)))}</p>
        <button type="button" class="btn primary wide" data-act="tdStart" data-fk="tdStart">🛡️ ${esc(stage <= best ? t("tdReplay") : t("tdPlay"))}</button></div>
      <div class="stage" style="margin-top:8px"><canvas id="tdCanvas" aria-hidden="true"></canvas></div>`;
  };
  VIEWS.tdAfter = () => { if (!(ui.td && ui.td.G)) { const cv = $("tdCanvas"); if (cv) drawTd(cv, null); } };

  let bgCache = null;
  function sizeCanvas(cv) {
    const r = cv.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return cv.width / TD.W;
  }
  function tdBackground(w, h, sc) {
    const dark = matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;
    const key = w + "x" + h + (dark ? "d" : "l");
    if (bgCache && bgCache.key === key) return bgCache.cv;
    const cv = document.createElement("canvas"), g = cv.getContext("2d");
    cv.width = w; cv.height = h;
    g.setTransform(sc, 0, 0, sc, 0, 0);
    const grass = g.createLinearGradient(0, 0, 0, TD.H);
    grass.addColorStop(0, dark ? "#2f4724" : "#a9d37f"); grass.addColorStop(1, dark ? "#26391d" : "#8fbf64");
    g.fillStyle = grass; g.fillRect(0, 0, TD.W, TD.H);
    g.fillStyle = dark ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.18)";
    for (let i = 0; i < 70; i++) { const x = (i * 97) % TD.W, y = (i * 61) % 480; g.beginPath(); g.ellipse(x, y, 3, 1.6, 0, 0, Math.PI * 2); g.fill(); }
    g.lineCap = "round"; g.lineJoin = "round";
    for (const [wd, col] of [[34, dark ? "#4c3d28" : "#b9935f"], [26, dark ? "#6b5638" : "#dcc193"]]) {
      g.beginPath(); TD.PATH.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.strokeStyle = col; g.lineWidth = wd; g.stroke();
    }
    g.font = "20px serif"; g.textAlign = "center"; g.textBaseline = "middle";
    for (const [x, y] of TREES) g.fillText("🌳", x, y);
    // Muralla y puerta
    g.fillStyle = dark ? "#5a5550" : "#a7a29a"; g.fillRect(0, TD.GATE_Y, TD.W, 30);
    g.fillStyle = dark ? "#48443f" : "#8d887f";
    for (let x = 0; x < TD.W; x += 24) g.fillRect(x, TD.GATE_Y - 8, 14, 10);
    g.fillStyle = dark ? "#2a1f14" : "#6b4a2b"; g.beginPath(); g.moveTo(162, TD.GATE_Y + 30); g.lineTo(162, TD.GATE_Y + 8); g.arc(180, TD.GATE_Y + 8, 18, Math.PI, 0); g.lineTo(198, TD.GATE_Y + 30); g.fill();
    g.fillStyle = dark ? "#3b2c22" : "#e7d6bd"; g.fillRect(0, TD.GATE_Y + 30, TD.W, TD.H - TD.GATE_Y - 30);
    for (let x = 10; x < TD.W; x += 46) { g.fillStyle = dark ? "#7a3b2e" : "#c4583f"; g.beginPath(); g.moveTo(x, TD.H - 8); g.lineTo(x + 18, TD.GATE_Y + 38); g.lineTo(x + 36, TD.H - 8); g.fill(); }
    bgCache = { key, cv };
    return cv;
  }
  function drawTower(g, T, x, y) {
    if (T.kind === "archer") {
      g.fillStyle = "#8b5a2b"; g.fillRect(x - 11, y - 14, 22, 24);
      g.fillStyle = "#6b4220"; g.fillRect(x - 13, y - 18, 26, 6);
      g.fillStyle = "#c0392b"; g.beginPath(); g.moveTo(x - 14, y - 18); g.lineTo(x, y - 32); g.lineTo(x + 14, y - 18); g.fill();
    } else {
      g.fillStyle = "#7d7a75"; g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2); g.fill();
      g.save(); g.translate(x, y); g.rotate(T.aim || -Math.PI / 2); g.fillStyle = "#2f2f36"; g.fillRect(0, -5, 20, 10); g.restore();
      g.fillStyle = "#55524d"; g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = "#f2b33d";
    for (let i = 0; i < T.lvl; i++) { g.beginPath(); g.arc(x - 8 + i * 8, y + 16, 3, 0, Math.PI * 2); g.fill(); }
  }
  function drawTd(cv, G) {
    const sc = sizeCanvas(cv), g = cv.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(tdBackground(cv.width, cv.height, sc), 0, 0);
    g.setTransform(sc, 0, 0, sc, 0, 0);
    TD.SLOTS.forEach(([x, y], i) => {
      const T = G && G.towers[i];
      if (T) return drawTower(g, T, x, y);
      g.setLineDash([4, 4]); g.lineWidth = 2; g.strokeStyle = "rgba(255,255,255,.85)";
      g.beginPath(); g.arc(x, y, 15, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      g.fillStyle = "rgba(255,255,255,.9)"; g.font = "800 16px 'Baloo 2', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(G && G.coins >= 60 ? "+" : String(i + 1), x, y + 1);
    });
    if (!G) return;
    for (const e of G.enemies) {
      const [c, d] = KIND_COLOR[e.kind];
      g.fillStyle = e.flash > 0 ? "#fff" : c; g.strokeStyle = d; g.lineWidth = 2;
      g.beginPath(); g.arc(e.x, e.y, e.r, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = "#fff"; g.beginPath(); g.arc(e.x - e.r * 0.35, e.y - e.r * 0.2, e.r * 0.22, 0, Math.PI * 2); g.arc(e.x + e.r * 0.35, e.y - e.r * 0.2, e.r * 0.22, 0, Math.PI * 2); g.fill();
      if (e.kind === "boss") { g.font = `${e.r}px serif`; g.textAlign = "center"; g.fillText("👑", e.x, e.y - e.r - 6); }
      if (e.hp < e.max) { g.fillStyle = "rgba(0,0,0,.5)"; g.fillRect(e.x - 12, e.y - e.r - 7, 24, 4); g.fillStyle = "#5ccf84"; g.fillRect(e.x - 12, e.y - e.r - 7, 24 * Math.max(0, e.hp / e.max), 4); }
    }
    const gv = G.gov;
    g.globalAlpha = gv.down > 0 ? 0.35 : 1;
    g.fillStyle = "#3d5ba9"; g.strokeStyle = "#1d2f63"; g.lineWidth = 2.5;
    g.beginPath(); g.arc(gv.x, gv.y, 12, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = "#f2b33d"; g.beginPath(); g.moveTo(gv.x - 9, gv.y - 9); g.lineTo(gv.x - 9, gv.y - 19); g.lineTo(gv.x - 4, gv.y - 13); g.lineTo(gv.x, gv.y - 21); g.lineTo(gv.x + 4, gv.y - 13); g.lineTo(gv.x + 9, gv.y - 19); g.lineTo(gv.x + 9, gv.y - 9); g.fill();
    g.globalAlpha = 1;
    g.fillStyle = "rgba(0,0,0,.5)"; g.fillRect(gv.x - 14, gv.y + 15, 28, 4); g.fillStyle = "#ffcf70"; g.fillRect(gv.x - 14, gv.y + 15, 28 * Math.max(0, gv.hp / gv.max), 4);
    if (Math.hypot(gv.tx - gv.x, gv.ty - gv.y) > 6 && gv.down <= 0) { g.strokeStyle = "rgba(255,255,255,.8)"; g.lineWidth = 2; g.beginPath(); g.arc(gv.tx, gv.ty, 7, 0, Math.PI * 2); g.stroke(); }
    for (const s of G.shots) {
      if (s.kind === "archer") { const a = Math.atan2(s.ty - s.y, s.tx - s.x); g.strokeStyle = "#5a3a1a"; g.lineWidth = 2; g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.x - Math.cos(a) * 9, s.y - Math.sin(a) * 9); g.stroke(); }
      else { g.fillStyle = "#222"; g.beginPath(); g.arc(s.x, s.y, 4.5, 0, Math.PI * 2); g.fill(); }
    }
    for (const f of ui.td ? ui.td.fx : []) {
      const k = f.t / f.max;
      g.globalAlpha = Math.max(0, 1 - k);
      if (f.kind === "ring") { g.strokeStyle = f.color; g.lineWidth = 3; g.beginPath(); g.arc(f.x, f.y, f.r * (0.4 + k * 0.8), 0, Math.PI * 2); g.stroke(); }
      else if (f.kind === "text") { g.fillStyle = f.color; g.font = "800 13px 'Baloo 2', sans-serif"; g.textAlign = "center"; g.fillText(f.text, f.x, f.y - k * 18); }
      else if (f.kind === "flash") { g.fillStyle = "rgba(214,69,69,.35)"; g.fillRect(0, 0, TD.W, TD.H); }
    }
    g.globalAlpha = 1;
  }

  function startTd(stage) {
    stopTd();
    const G = TD.create(stage, M.tdMods(S));
    ui.td = { G, stage, speed: 1, paused: false, fx: [], last: 0, acc: 0, keys: new Set(), pending: null, done: false, pop: null, raf: 0 };
    $("view").innerHTML = `<div class="stage play" id="stage"><canvas id="tdCanvas" tabindex="0" role="application" aria-label="${esc(t("tdStage", stage))}" aria-describedby="tdHelp"></canvas>
      <div class="hud"><span id="hWave"></span><span id="hCoins"></span><span id="hWall"></span></div><div id="tdPop"></div><div id="tdRes"></div></div>
      <p class="sr" id="tdHelp">${esc(t("tdText"))}</p>
      <div class="slots" id="tdSlots"></div>
      <div class="tdbar"><button type="button" class="btn primary" id="tdWaveBtn" data-act="tdWave">⏭ ${esc(t("nextWave"))}</button>
      <button type="button" class="btn" id="tdSpeedBtn" data-act="tdSpeed" aria-label="${esc(t("speed"))}">×1</button>
      <button type="button" class="btn" id="tdPauseBtn" data-act="tdPause" aria-pressed="false" aria-label="${esc(t("pause"))}">⏸</button>
      <button type="button" class="btn" data-act="tdExit" aria-label="${esc(t("exit"))}">✕</button></div>`;
    const cv = $("tdCanvas");
    cv.addEventListener("pointerdown", tdPointer);
    cv.addEventListener("pointermove", e => { if (e.buttons && ui.td && ui.td.drag) tdMoveTo(e); });
    cv.addEventListener("pointerup", () => { if (ui.td) ui.td.drag = false; });
    cv.addEventListener("keydown", tdKey);
    cv.addEventListener("keyup", e => { if (ui.td) ui.td.keys.delete(e.key); });
    renderSlots();
    $("stage").scrollIntoView({ block: "start" });
    cv.focus({ preventScroll: true });
    ui.td.raf = requestAnimationFrame(tdFrame);
  }
  function stopTd() {
    if (ui.td) cancelAnimationFrame(ui.td.raf);
    ui.td = null;
  }
  const worldPt = e => { const r = $("tdCanvas").getBoundingClientRect(); return [(e.clientX - r.left) / r.width * TD.W, (e.clientY - r.top) / r.height * TD.H]; };
  function tdMoveTo(e) { const [x, y] = worldPt(e); ui.td.pending = { tx: x, ty: y }; }
  function tdPointer(e) {
    const U = ui.td;
    if (!U || U.G.state !== "play") return;
    const [x, y] = worldPt(e), slot = TD.SLOTS.findIndex(([sx, sy]) => Math.hypot(sx - x, sy - y) <= 22);
    if (slot >= 0) { openPop(slot); return; }
    closePop();
    U.pending = { tx: x, ty: y };
    U.drag = true;
    try { $("tdCanvas").setPointerCapture(e.pointerId); } catch (err) {}
  }
  function tdKey(e) {
    const U = ui.td;
    if (!U) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) { e.preventDefault(); U.keys.add(e.key); }
    else if (e.key === "Escape") closePop();
    else if (e.key === "p" || e.key === "P") togglePause();
  }
  function renderSlots() {
    const U = ui.td;
    $("tdSlots").innerHTML = TD.SLOTS.map((_, i) => {
      const T = U.G.towers[i];
      return `<button type="button" data-act="tdSlot" data-n="${i}" aria-label="${esc(t("slot", i + 1) + ": " + (T ? t(T.kind) + " " + T.lvl : t("empty")))}">${T ? (T.kind === "archer" ? "🏹" : "💣") + T.lvl : i + 1}</button>`;
    }).join("");
  }
  function openPop(i) {
    const U = ui.td, G = U.G, T = G.towers[i], [x, y] = TD.SLOTS[i];
    U.pop = i;
    let h = "";
    if (!T) for (const kind of ["archer", "cannon"]) { const c = TD.TOWERS[kind].cost[0]; h += `<button type="button" class="btn${G.coins >= c ? " primary" : ""}" data-act="tdBuild" data-n="${i}" data-k="${kind}"${G.coins >= c ? "" : " disabled"}>${kind === "archer" ? "🏹" : "💣"} ${esc(t(kind))}<span>🪙 ${c}</span></button>`; }
    else { const c = TD.upgradeCost(G, i); h += c == null ? `<span class="small muted">${esc(t(T.kind))} · ${esc(t("towerMax"))}</span>` : `<button type="button" class="btn${G.coins >= c ? " primary" : ""}" data-act="tdUp" data-n="${i}"${G.coins >= c ? "" : " disabled"}>⬆️ ${esc(t("towerUp", "🪙 " + c))}</button>`; }
    h += `<button type="button" class="btn" data-act="tdPopClose">✕ ${esc(t("close"))}</button>`;
    const left = Math.min(62, Math.max(2, (x / TD.W) * 100 - 20)), top = Math.min(70, Math.max(6, (y / TD.H) * 100 + 4));
    $("tdPop").innerHTML = `<div class="pop" style="left:${left}%;top:${top}%">${h}</div>`;
    const first = $("tdPop").querySelector("button:not(:disabled)");
    if (first) first.focus({ preventScroll: true });
  }
  function closePop() { if (ui.td) ui.td.pop = null; const p = $("tdPop"); if (p) p.innerHTML = ""; }
  function togglePause() {
    const U = ui.td;
    if (!U) return;
    U.paused = !U.paused;
    const b = $("tdPauseBtn");
    if (b) { b.textContent = U.paused ? "▶" : "⏸"; b.setAttribute("aria-pressed", String(U.paused)); }
  }
  function tdFrame(ts) {
    const U = ui.td;
    if (!U || !$("tdCanvas")) return;
    const dt = Math.min(0.05, U.last ? (ts - U.last) / 1000 : 0), G = U.G;
    U.last = ts;
    if (!U.paused && G.state === "play") {
      if (U.keys.size) {
        const k = U.keys, dx = (k.has("ArrowRight") ? 1 : 0) - (k.has("ArrowLeft") ? 1 : 0), dy = (k.has("ArrowDown") ? 1 : 0) - (k.has("ArrowUp") ? 1 : 0);
        U.pending = { tx: G.gov.x + dx * 40, ty: G.gov.y + dy * 40 };
      }
      U.acc += dt * U.speed;
      for (let n = 0; U.acc >= STEP && n < 24; n++) { TD.step(G, STEP, U.pending); U.pending = null; U.acc -= STEP; }
      for (const e of G.events) {
        if (e.t === "shot") sfx(e.kind === "archer" ? "arrow" : "boom");
        else if (e.t === "kill") { U.fx.push({ kind: "text", text: "+" + e.coins + " 🪙", color: "#ffe08a", x: e.x, y: e.y, t: 0, max: 0.8 }); sfx("coin"); }
        else if (e.t === "boom") U.fx.push({ kind: "ring", color: "#ffb347", x: e.x, y: e.y, r: e.r, t: 0, max: 0.35 });
        else if (e.t === "spin") U.fx.push({ kind: "ring", color: "#9ec2ff", x: e.x, y: e.y, r: e.r, t: 0, max: 0.3 });
        else if (e.t === "slash") U.fx.push({ kind: "ring", color: "#fff", x: e.x, y: e.y, r: 14, t: 0, max: 0.18 });
        else if (e.t === "leak") { U.fx.push({ kind: "flash", t: 0, max: 0.25 }); sfx("hit"); }
        else if (e.t === "govDown") toast(t("govDown"));
        else if (e.t === "build") renderSlots();
      }
      G.events.length = 0;
    }
    for (const f of U.fx) f.t += dt;
    U.fx = U.fx.filter(f => f.t < f.max);
    drawTd($("tdCanvas"), G);
    $("hWave").textContent = "🌊 " + t("wave", Math.max(1, G.wave + 1), G.waves.length);
    $("hCoins").textContent = "🪙 " + G.coins;
    $("hWall").textContent = "🧱 " + Math.ceil(G.wall) + "/" + G.wallMax;
    const wb = $("tdWaveBtn");
    if (wb) wb.disabled = !!G.queue.length || G.wave >= G.waves.length - 1 || G.state !== "play";
    if (U.pop != null && !U.paused && Math.floor(ts / 400) !== U.popTick) { U.popTick = Math.floor(ts / 400); openPop(U.pop); }
    if (G.state !== "play" && !U.done) { U.done = true; finishTd(); }
    U.raf = requestAnimationFrame(tdFrame);
  }
  function finishTd() {
    const U = ui.td, G = U.G, win = G.state === "won";
    closePop();
    let rew = null;
    if (win) { const r = M.tdResult(S, U.stage, G.stars); rew = r && r.reward; saveGame(); sfx("win"); } else sfx("lose");
    const next = win && U.stage + 1 <= S.td.best + 1;
    $("tdRes").innerHTML = `<div class="result"><div class="card"><h3>${esc(win ? t("tdWin") : t("tdLose"))}</h3>${win ? `<div class="bigstars">${"★".repeat(G.stars)}${"☆".repeat(3 - G.stars)}</div>` : ""}
      ${rew ? `<div class="costs" style="justify-content:center">${chips(rew)}</div>` : ""}
      <div class="btns">${next ? `<button type="button" class="btn primary" data-act="tdGo" data-n="${U.stage + 1}">▶ ${esc(t("tdStage", U.stage + 1))}</button>` : ""}
      <button type="button" class="btn${next ? "" : " primary"}" data-act="tdGo" data-n="${U.stage}">↺ ${esc(t("tdReplay"))}</button><button type="button" class="btn" data-act="tdExit">✕ ${esc(t("exit"))}</button></div></div></div>`;
    const b = $("tdRes").querySelector("button");
    if (b) b.focus({ preventScroll: true });
    announce(win ? t("tdWin") : t("tdLose"));
  }

  // Expedición
  const foeName = u => (u.boss ? "👑 " : "") + L().troop[u.type];
  VIEWS.exp = () => {
    const stage = S.exp.best + 1, foes = M.expEnemies(stage), mine = M.team(S), idle = M.idleNow(S, now());
    let h = `<h2 class="ttl">${esc(t("expTitle"))}</h2><div class="card"><h3>🎁 ${esc(t("idle"))}</h3><div class="costs">`;
    h += Object.keys(M.idleRate(S)).map(r => `<span class="c">${D.ICON[r]} <span data-idle="${r}">${num(idle[r] || 0)}</span></span>`).join("") || `<span class="small muted">—</span>`;
    h += `</div><p class="small muted">${esc(t("idleText"))}</p><button type="button" class="btn good wide" data-act="idle" data-fk="idle"${Object.values(idle).some(v => v > 0) ? "" : " disabled"}>🧺 ${esc(t("collect"))}</button></div>`;
    h += `<div class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">⚔️ ${esc(t("expStage", stage))}</h3><span class="small muted">${esc(t("enemyPower", num(M.teamPower(foes))))}</span></div>
      <div class="row" style="margin:6px 0">${foes.map(u => `<span class="c" title="${esc(foeName(u))}">${u.boss ? "👑" : ""}${D.TROOPS[u.type].icon}</span>`).join("")}</div>
      <p class="small">${esc(t("yourTeam"))}: <b>${num(M.teamPower(mine))}</b></p>
      <button type="button" class="btn primary wide" data-act="fight" data-fk="fight"${mine.length ? "" : " disabled"}>⚔️ ${esc(t("fight"))}</button>${mine.length ? "" : `<p class="reason">${esc(t("teamEmpty"))}</p>`}</div>`;
    h += `<div class="card"><div class="form"><span class="rowlbl">${esc(t("front"))}</span>`;
    S.formation.forEach((id, i) => {
      if (i === 2) h += `<span class="rowlbl">${esc(t("back"))}</span>`;
      h += `<button type="button" class="slotb${i >= 2 ? " back" : ""}" data-act="slot" data-n="${i}" data-fk="slot-${i}">${id ? heroPortrait(id) : portrait("+", "#9a8f80", "")}<span><b>${esc(id ? heroName(id) : t("emptySlot"))}</b><small>${id ? esc(t("lvlShort", S.heroes[id].lvl)) : ""}</small></span></button>`;
    });
    return h + `</div></div><div id="battle" style="margin-top:8px"></div>`;
  };
  function slotSheet(i) {
    return () => {
      const used = new Set(S.formation.filter((x, k) => x && k !== i));
      const list = Object.keys(S.heroes).sort((a, b) => M.teamPower([M.heroUnit(S, b, 0)]) - M.teamPower([M.heroUnit(S, a, 0)]));
      let h = `<div class="sh-head"><span class="ico" aria-hidden="true">⚔️</span><div><h2 id="sheetTitle">${esc(t("pickHero"))}</h2><p class="muted small">${esc(i < 2 ? t("front") : t("back"))}</p></div></div><div class="list">`;
      h += `<button type="button" class="li" data-act="pick" data-n="${i}" data-k="">${portrait("–", "#9a8f80", "")}<span class="tx"><b>${esc(t("noneHero"))}</b></span></button>`;
      for (const id of list) {
        const o = S.heroes[id], st = D.heroStats(id, o.lvl, o.stars);
        h += `<button type="button" class="li" data-act="pick" data-n="${i}" data-k="${id}">${heroPortrait(id)}<span class="tx"><b>${esc(heroName(id))} · ${esc(t("lvlShort", o.lvl))}${used.has(id) ? " ⚔️" : ""}</b><small>${esc(L().skill[D.HERO[id].skill][0])} · ❤️ ${num(st.hp)} · ⚔️ ${num(st.atk)}</small></span></button>`;
      }
      return h + "</div>";
    };
  }
  function pickHero(i, id) {
    const f = S.formation.slice();
    if (id) { const j = f.indexOf(id); if (j >= 0) f[j] = f[i]; }
    f[i] = id || null;
    M.setFormation(S, f);
  }
  function startFight() {
    if (ui.battle) return;
    const res = M.expedition(S, now());
    if (!res) return;
    saveGame();
    const box = $("battle");
    const card = (u, side, i) => `<div class="bu" id="bu-${side}-${i}">${side === 0 ? heroPortrait(u.id) : portrait(u.boss ? "👑" : "☠", TYPE_COLOR[u.type], D.TROOPS[u.type].icon)}<span class="pbar"><i style="width:100%"></i></span><span class="nm">${esc(side === 0 ? heroName(u.id) : foeName(u))}</span></div>`;
    box.innerHTML = `<div class="battle" role="group" aria-label="${esc(t("expStage", res.stage))}"><div class="bside">${res.foes.map((u, i) => card(u, 1, i)).join("")}</div><div class="blog" id="blog" aria-live="polite"></div><div class="bside">${res.mine.map((u, i) => card(u, 0, i)).join("")}</div>
      <button type="button" class="btn" id="skipBtn" data-act="skip">⏩ ${esc(t("skip"))}</button></div>`;
    box.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const hp = {}, max = {};
    res.mine.forEach((u, i) => { hp["0:" + i] = max["0:" + i] = u.hp; });
    res.foes.forEach((u, i) => { hp["1:" + i] = max["1:" + i] = u.hp; });
    const unitOf = id => { const [s, i] = id.split(":"); return s === "0" ? res.mine[i] : res.foes[i]; };
    const el = id => $("bu-" + id.replace(":", "-"));
    const float = (id, txt, color) => { const e = el(id); if (!e) return; const f = document.createElement("span"); f.className = "fl"; f.style.color = color; f.textContent = txt; e.append(f); setTimeout(() => f.remove(), 700); };
    const apply = h => {
      if (h.dmg != null) { hp[h.u] = Math.max(0, hp[h.u] - h.dmg); float(h.u, "−" + num(h.dmg), "#ff8a8a"); const e = el(h.u); if (e) { e.classList.remove("hit"); void e.offsetWidth; e.classList.add("hit"); } }
      if (h.heal) { hp[h.u] = Math.min(max[h.u], hp[h.u] + h.heal); float(h.u, "+" + num(h.heal), "#8be08b"); }
      if (h.shield) float(h.u, "🛡️ " + num(h.shield), "#9ec2ff");
      if (h.buff) float(h.u, "💪", "#ffd27a");
      if (h.stun) float(h.u, "💫", "#ffd27a");
      const e = el(h.u);
      if (e) { e.querySelector(".pbar>i").style.width = (hp[h.u] / max[h.u]) * 100 + "%"; e.classList.toggle("dead", hp[h.u] <= 0); }
    };
    ui.battle = { res, i: 0, fast: false, timer: 0 };
    const stepB = () => {
      const B = ui.battle;
      if (!B) return;
      if (B.i >= res.log.length) return endFight();
      const e = res.log[B.i++], a = el(e.a), who = unitOf(e.a), name = e.a[0] === "0" ? heroName(who.id) : foeName(who);
      document.querySelectorAll(".bu.act").forEach(x => x.classList.remove("act"));
      if (a) a.classList.add("act");
      $("blog").textContent = e.k === "skill" ? `${name}: ${L().skill[e.skill][0]}` : e.k === "stun" ? `${name} 💫` : "";
      if (e.k === "skill") sfx("hit");
      e.hits.forEach(apply);
      B.timer = setTimeout(stepB, B.fast ? 60 : 420);
    };
    function endFight() {
      const B = ui.battle;
      if (!B) return;
      clearTimeout(B.timer);
      ui.battle = null;
      for (const u of res.units) { const id = u.side + ":" + u.idx, e = el(id); if (e) { e.querySelector(".pbar>i").style.width = (u.cur / u.hp) * 100 + "%"; e.classList.toggle("dead", u.cur <= 0); } }
      sfx(res.win ? "win" : "lose");
      $("blog").textContent = res.win ? t("expWin") : t("expLose");
      const skip = $("skipBtn");
      if (skip) skip.outerHTML = `${res.win && res.reward ? `<div class="costs" style="justify-content:center">${chips(res.reward)}</div>` : ""}<button type="button" class="btn primary" data-act="tab" data-k="exp">${esc(res.win ? t("expStage", res.stage + 1) : t("fight"))}</button>`;
      announce(res.win ? t("expWin") : t("expLose"));
      renderTop();
    }
    ui.battle.end = endFight;
    stepB();
  }

  // Mapa del reino
  const tileIcon = tl => (tl.kind === "rebel" ? "⛺" : tl.kind === "bear" ? "🐻" : FIELD_ICON[tl.type]);
  const tileName = tl => (tl.kind === "rebel" ? t("rebel") : tl.kind === "bear" ? t("bear") : L().field[tl.type]);
  VIEWS.map = () => {
    if (!M.mapOpen(S)) return `<h2 class="ttl">${esc(t("mapTitle"))}</h2><div class="card"><p>🔒 ${esc(t("mapLocked"))}</p></div>`;
    M.ensureMap(S, now());
    const marches = M.timersOf(S, "march");
    let h = `<h2 class="ttl">${esc(t("mapTitle"))}</h2><div class="card"><p class="small"><b>🚩 ${esc(t("marches", marches.length, M.marchSlots(S)))}</b></p>`;
    for (const tm of marches) {
      const tl = M.tileAt(S, tm.data.tile), label = `${tl ? tileIcon(tl) : "🚩"} ${esc(tl ? tileName(tl) : "")} · ${esc(L().phase[tm.data.phase])}`;
      h += timerRow(tm, label);
    }
    h += `</div><div class="mapwrap" style="margin-top:8px"><div class="mgrid">`;
    const at = {};
    for (const tl of S.map.tiles) at[tl.x + "," + tl.y] = tl;
    for (let y = 0; y < M.MAP_N; y++) for (let x = 0; x < M.MAP_N; x++) {
      if (x === M.HOME.x && y === M.HOME.y) { h += `<button type="button" class="tile home" disabled aria-label="🏰">🏰</button>`; continue; }
      const tl = at[x + "," + y];
      if (!tl) { h += `<button type="button" class="tile" disabled aria-hidden="true" tabindex="-1">${(x * 7 + y * 3) % 5 === 0 ? "🌳" : ""}</button>`; continue; }
      h += `<button type="button" class="tile${tl.busy ? " busy" : ""}" data-act="tile" data-n="${tl.id}" data-fk="tile-${tl.id}" aria-label="${esc(tileName(tl) + ", " + t("lvl", tl.lvl))}">${tileIcon(tl)}${tl.kind !== "bear" ? `<span class="tb">${tl.lvl}</span>` : ""}${tl.busy ? '<span class="fl2">🚩</span>' : ""}</button>`;
    }
    return h + `</div></div><p class="small muted">${esc(L().counters)}</p>`;
  };
  function tileSheet(id) {
    return () => {
      const tl = M.tileAt(S, id);
      if (!tl) return `<p class="reason">${esc(t("reason.target"))}</p>`;
      const avail = M.armyPower(M.stacksOf(S.troops), M.marchBonus(S, []));
      let h = `<div class="sh-head"><span class="ico" aria-hidden="true">${tileIcon(tl)}</span><div><h2 id="sheetTitle">${esc(tileName(tl))}</h2><p class="muted small">${esc(t("lvl", tl.lvl))}</p></div></div>`;
      if (tl.kind === "rebel") {
        const army = M.rebelArmy(tl);
        h += `<div class="kv">${army.map(s => `<div>${D.TROOPS[s.type].icon} ${esc(L().troop[s.type])}<b>${num(s.n)} · T${s.tier}</b></div>`).join("")}</div>
          <p class="small"><b>${esc(t("enemyPower", num(M.armyPower(army))))}</b> · ${esc(t("armyPower", num(avail)))}</p>
          <p class="small muted">${esc(t("rewards"))}:</p><div class="costs">${chips(M.rebelReward(tl.lvl))}${tl.lvl > S.stats.rebelMax ? `<span class="c">💎 20</span>` : ""}</div>
          <p class="small muted">${esc(L().counters)}</p>`;
      } else if (tl.kind === "field") {
        h += `<p><b>${D.ICON[tl.type]} ${esc(t("amountLeft", num(tl.amount)))}</b></p>`;
      } else {
        h += `<p class="small">${esc(t("bearText"))}</p><p><b>${esc(t("bearAttacks", S.bear.attacks, M.BEAR_ATTACKS))}</b> · ${esc(t("bearDamage", num(S.bear.damage)))}</p><div class="list">`;
        M.BEAR_STEPS.forEach((x, i) => {
          const goal = x * S.bear.base, got = S.bear.claimed.includes(i), ready = S.bear.damage >= goal;
          h += `<div class="li"><span class="ic">${got ? "✅" : ready ? "🎁" : "🔒"}</span><span class="tx"><b>${num(goal)}</b><span class="costs">${chips(M.bearReward(i))}</span></span>
            <button type="button" class="btn good" data-act="bearClaim" data-n="${i}"${ready && !got ? "" : " disabled"}>${esc(t("claim"))}</button></div>`;
        });
        h += "</div>";
      }
      const act = tl.kind === "field" ? t("gather") : t("attack"), why = tl.busy ? t("reason.busy") : tl.kind === "bear" && S.bear.attacks >= M.BEAR_ATTACKS ? t("reason.attacks") : M.timersOf(S, "march").length >= M.marchSlots(S) ? t("reason.slots") : "";
      return h + `<button type="button" class="btn primary wide" style="margin-top:8px" data-act="marchSetup" data-n="${tl.id}"${why ? " disabled" : ""}>${tl.kind === "field" ? "🧺" : "⚔️"} ${esc(act)}</button>${why ? `<p class="reason">${esc(why)}</p>` : ""}`;
    };
  }

  // Preparar una marcha: héroes (hasta 3) y cuántas tropas de cada tipo, empezando por el nivel más alto.
  const totalOf = ty => S.troops[ty].reduce((a, b) => a + b, 0);
  function allocate(ty, n) {
    const out = [0, 0, 0, 0, 0, 0];
    for (let i = D.TIERS - 1; i >= 0 && n > 0; i--) { const k = Math.min(n, S.troops[ty][i]); out[i] = k; n -= k; }
    return out;
  }
  function marchArmy() {
    const army = M.emptyTroops();
    for (const ty of D.TYPES) army[ty] = allocate(ty, ui.march.counts[ty]);
    return army;
  }
  function setupMarch(tileId) {
    const tl = M.tileAt(S, tileId);
    if (!tl) return;
    const away = M.heroesAway(S);
    const heroes = Object.keys(S.heroes).filter(id => !away.has(id)).sort((a, b) => M.teamPower([M.heroUnit(S, b, 0)]) - M.teamPower([M.heroUnit(S, a, 0)])).slice(0, 3);
    const counts = {};
    for (const ty of D.TYPES) counts[ty] = totalOf(ty);
    if (tl.kind === "field") {
      let need = tl.amount;
      for (const ty of D.TYPES) { let n = 0; for (let i = D.TIERS - 1; i >= 0 && need > 0; i--) { const k = Math.min(S.troops[ty][i], Math.ceil(need / D.unitLoad(i + 1))); n += k; need -= k * D.unitLoad(i + 1); } counts[ty] = n; }
    }
    ui.march = { tile: tileId, heroes, counts };
    openSheet(marchSheet);
  }
  function marchInfo() {
    const tl = M.tileAt(S, ui.march.tile), army = marchArmy(), power = M.armyPower(M.stacksOf(army), M.marchBonus(S, ui.march.heroes));
    const parts = [`<b>${esc(t("armyPower", num(power)))}</b>`];
    if (tl && tl.kind === "rebel") parts.push(esc(t("enemyPower", num(M.armyPower(M.rebelArmy(tl))))));
    if (tl && tl.kind === "field") parts.push(esc(t("load", num(M.armyLoad(S, army)))));
    if (tl) parts.push(esc(t("marchTime", dur(M.marchMs(tl)))));
    const err = M.marchCheck(S, ui.march.tile, ui.march.heroes, army);
    return { html: parts.join(" · "), err };
  }
  function marchSheet() {
    const tl = M.tileAt(S, ui.march.tile);
    if (!tl) return `<p class="reason">${esc(t("reason.target"))}</p>`;
    const away = M.heroesAway(S), info = marchInfo();
    let h = `<div class="sh-head"><span class="ico" aria-hidden="true">${tileIcon(tl)}</span><div><h2 id="sheetTitle">${esc(tileName(tl))}</h2><p class="muted small">${esc(t("lvl", tl.lvl))}</p></div></div>`;
    h += `<h3>${esc(t("heroesLbl"))}</h3><div class="row">`;
    for (const id of Object.keys(S.heroes)) {
      if (away.has(id)) continue;
      const on = ui.march.heroes.includes(id);
      h += `<button type="button" class="btn${on ? " royal" : ""}" data-act="mHero" data-k="${id}" aria-pressed="${on}" data-fk="mh-${id}">${D.TROOPS[D.HERO[id].type].icon} ${esc(heroName(id))}</button>`;
    }
    h += `</div><h3 style="margin-top:10px">${esc(t("army"))}</h3>`;
    for (const ty of D.TYPES) {
      const max = totalOf(ty);
      h += `<div class="tsl"><label for="mr-${ty}"><span>${D.TROOPS[ty].icon} ${esc(L().troop[ty])}</span><span id="mrv-${ty}">${num(ui.march.counts[ty])} / ${num(max)}</span></label>
        <input type="range" id="mr-${ty}" data-range="march" data-k="${ty}" data-fk="mr-${ty}" min="0" max="${max}" step="1" value="${Math.min(ui.march.counts[ty], max)}"${max ? "" : " disabled"}></div>`;
    }
    return h + `<p class="small" id="mInfo">${info.html}</p><button type="button" class="btn primary wide" id="mSend" data-act="mSend" data-fk="mSend"${info.err ? " disabled" : ""}>🚩 ${esc(t("send"))}</button>
      <p class="reason" id="mErr">${info.err ? esc(t("reason." + info.err)) : ""}</p>`;
  }
  function onMarchRange(el) {
    ui.march.counts[el.dataset.k] = +el.value;
    $("mrv-" + el.dataset.k).textContent = `${num(+el.value)} / ${num(totalOf(el.dataset.k))}`;
    const info = marchInfo();
    $("mInfo").innerHTML = info.html;
    $("mSend").disabled = !!info.err;
    $("mErr").textContent = info.err ? t("reason." + info.err) : "";
  }

  // Misiones y tareas diarias
  VIEWS.quests = () => {
    const q = M.currentQuest(S), p = M.questProgress(S, q), pts = M.dailyPoints(S);
    let h = `<h2 class="ttl">${esc(t("questsTitle"))}</h2><div class="card"><h3>📜 ${esc(t("chapter"))} ${S.quest + 1}</h3><p><b>${esc(questText(q))}</b></p>
      <div class="pbar green"><i style="width:${(p.v / p.n) * 100}%"></i></div><p class="small muted">${p.v} / ${p.n}</p><div class="costs">${chips(q[3])}</div>
      <button type="button" class="btn ${p.done ? "good" : "primary"} wide" data-act="quest" data-fk="quest">${p.done ? "🎁 " + esc(t("claim")) : "➡️ " + esc(questText(q))}</button>
      <ul class="reqs" style="margin-top:8px">${[1, 2].map(k => `<li class="muted">· ${esc(questText(D.quest(S.quest + k)))}</li>`).join("")}</ul></div>`;
    h += `<div class="card"><h3>📅 ${esc(t("daily"))} · ${esc(t("points", pts))}</h3><div class="pbar"><i style="width:${Math.min(100, pts)}%"></i></div><div class="chests">`;
    D.CHESTS.forEach((need, i) => {
      const done = S.daily.claimed.includes(i), ready = pts >= need && !done;
      h += `<button type="button" class="${ready ? "ready" : done ? "done" : ""}" data-act="chest" data-n="${i}" data-fk="chest-${i}"${ready ? "" : " disabled"} aria-label="${esc(t("chest", i + 1) + ", " + t("points", need))}"><b aria-hidden="true">${done ? "✅" : "🎁"}</b>${need}</button>`;
    });
    h += `</div><div class="list">`;
    for (const d of D.DAILY) {
      const v = Math.min(d.n, S.daily.counts[d.id] || 0);
      h += `<div class="li"><span class="ic" aria-hidden="true">${v >= d.n ? "✅" : "▫️"}</span><span class="tx"><b>${esc(t("d." + d.id, d.n))}</b><small>${v} / ${d.n} · +${d.pts}</small></span></div>`;
    }
    return h + "</div></div>";
  };

  // Al volver: resumen de lo que pasó mientras no estabas
  function offlineSheet() {
    const o = offline, stored = {};
    for (const k in S.prod) { const r = D.BUILDINGS[k].prod; stored[r] = (stored[r] || 0) + M.stored(S, k, now()); }
    const lines = o.ev.map(eventText).filter(Boolean);
    return `<div class="sh-head"><span class="ico" aria-hidden="true">🏰</span><div><h2 id="sheetTitle">${esc(t("welcome"))}</h2><p class="small muted">${esc(t("away", dur(o.away)))}</p></div></div>
      ${lines.length ? `<ul class="reqs">${lines.slice(0, 12).map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="muted small">${esc(t("awayNothing"))}</p>`}
      <h3 style="margin-top:8px">${esc(t("storedNow"))}</h3><div class="costs">${chips(stored)}</div>
      <div class="btns"><button type="button" class="btn good" data-act="collectAll" data-close="1">🧺 ${esc(t("collectAll"))}</button><button type="button" class="btn" data-act="close">${esc(t("close"))}</button></div>`;
  }
  const resetSheet = () => `<div class="sh-head"><span class="ico" aria-hidden="true">↺</span><div><h2 id="sheetTitle">${esc(t("reset"))}</h2></div></div><p>${esc(t("resetAsk"))}</p>
    <div class="btns"><button type="button" class="btn" data-act="close">${esc(t("no"))}</button><button type="button" class="btn primary" data-act="resetYes">${esc(t("yes"))}</button></div>`;

  // Todas las acciones de botones pasan por aquí.
  function act(name, el) {
    const k = el.dataset.k, n = el.dataset.n != null && el.dataset.n !== "" ? +el.dataset.n : null, id = el.dataset.id != null ? +el.dataset.id : null, T = now();
    switch (name) {
      case "tab": if (el.dataset.close) closeSheet(); setTab(k); return;
      case "bld": case "openB": openBuilding(k); return;
      case "collectAll": case "collect": {
        const got = M.collect(S, T, name === "collect" ? k : null);
        if (Object.keys(got).length) { sfx("coin"); toast(rewardText(got)); }
        if (el.dataset.close) closeSheet();
        break;
      }
      case "upgrade": if (M.upgrade(S, k, T).ok) sfx("click"); break;
      case "help": M.help(S, id, T); handleEvents(M.tick(S, T)); break;
      case "finish": if (M.finish(S, id, T)) handleEvents(M.tick(S, T)); break;
      case "tier": ui.train[k] = { tier: n, qty: 0 }; break;
      case "train": { const st = trainState(k); if (st.qty && M.train(S, k, st.tier, st.qty, T).ok) { sfx("click"); st.qty = 0; } break; }
      case "heal": M.heal(S, T); break;
      case "research": if (M.research(S, k, T).ok) sfx("click"); break;
      case "recruit": {
        const got = M.recruit(S, n, el.dataset.g === "1");
        if (got) { sfx("recruit"); saveGame(); render(); openSheet(recruitSheet(got)); }
        return;
      }
      case "hero": openSheet(() => heroSheet(k)); return;
      case "heroLv": if (M.heroLevelUp(S, k, n)) sfx("click"); break;
      case "heroStar": if (M.heroStarUp(S, k)) sfx("build"); break;
      case "heroTeam": toggleTeam(k); break;
      case "tdStage": ui.tdStage = Math.max(1, Math.min(S.td.best + 1, ui.tdStage + n)); break;
      case "tdStart": startTd(ui.tdStage); return;
      case "tdGo": startTd(n); return;
      case "tdWave": if (ui.td) TD.callWave(ui.td.G); return;
      case "tdSpeed": if (ui.td) { ui.td.speed = ui.td.speed === 1 ? 2 : 1; el.textContent = "×" + ui.td.speed; } return;
      case "tdPause": togglePause(); return;
      case "tdExit": stopTd(); render(); return;
      case "tdSlot": if (ui.td && ui.td.G.state === "play") openPop(n); return;
      case "tdBuild": if (ui.td && TD.build(ui.td.G, n, k)) { sfx("click"); renderSlots(); } closePop(); $("tdCanvas").focus({ preventScroll: true }); return;
      case "tdUp": if (ui.td && TD.upgrade(ui.td.G, n)) { sfx("click"); renderSlots(); } openPop(n); return;
      case "tdPopClose": closePop(); $("tdCanvas").focus({ preventScroll: true }); return;
      case "idle": { const got = M.collectIdle(S, T); if (got) { sfx("coin"); toast(rewardText(got)); } break; }
      case "fight": startFight(); return;
      case "skip": if (ui.battle) ui.battle.end(); return;
      case "slot": openSheet(slotSheet(n)); return;
      case "pick": pickHero(n, k); closeSheet(); break;
      case "tile": openSheet(tileSheet(n)); return;
      case "marchSetup": setupMarch(n); return;
      case "mHero": {
        const hs = ui.march.heroes, i = hs.indexOf(k);
        if (i >= 0) hs.splice(i, 1); else if (hs.length < 3) hs.push(k);
        refreshSheet();
        return;
      }
      case "mSend": {
        const r = M.sendMarch(S, ui.march.tile, ui.march.heroes.slice(), marchArmy(), T);
        if (r.ok) { sfx("click"); closeSheet(); } else toast(t("reason." + r.reason));
        break;
      }
      case "bearClaim": { const rew = M.claimBear(S, n); if (rew) { sfx("coin"); toast(rewardText(rew)); } break; }
      case "quest": goQuest(); return;
      case "chest": { const rew = M.claimChest(S, n); if (rew) { sfx("coin"); toast(rewardText(rew)); } break; }
      case "resetYes": store.del(KEY); S = M.newGame(now()); ui.train = {}; ui.tdStage = null; stopTd(); closeSheet(); ui.tab = "town"; break;
      case "close": closeSheet(); return;
      default: return;
    }
    saveGame();
    render();
    refreshSheet();
  }
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-act]");
    if (el && !el.disabled) act(el.dataset.act, el);
  });
  document.addEventListener("input", e => {
    const el = e.target;
    if (el.dataset.range === "train") onTrainRange(el);
    else if (el.dataset.range === "march" && ui.march) onMarchRange(el);
  });
  $("questbar").addEventListener("click", goQuest);
  $("sheetClose").addEventListener("click", closeSheet);
  $("sheet").addEventListener("click", e => { if (e.target === $("sheet")) closeSheet(); });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if ($("sheet").classList.contains("on")) { e.preventDefault(); closeSheet(); }
    else if (ui.td && ui.td.pop != null) closePop();
  });
  $("sheet").addEventListener("keydown", e => {
    if (e.key !== "Tab") return;
    const f = [...$("sheet").querySelectorAll("button:not(:disabled), input:not(:disabled)")];
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });

  // Idioma, sonido y ajustes
  function applyLang() {
    document.documentElement.lang = lang;
    document.title = t("doc");
    document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-aria]").forEach(el => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
    document.querySelectorAll("[data-lang]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
    $("tabs").setAttribute("aria-label", t("title"));
  }
  document.querySelectorAll("[data-lang]").forEach(b => {
    b.addEventListener("click", () => { lang = b.dataset.lang; store.set("reino:idioma", lang); applyLang(); render(); refreshSheet(); });
  });
  const soundBtn = $("soundBtn");
  const renderSound = () => { soundBtn.setAttribute("aria-pressed", String(soundOn)); soundBtn.firstChild.textContent = soundOn ? "🔊 " : "🔇 "; };
  soundBtn.addEventListener("click", () => { soundOn = !soundOn; store.set("reino:sonido", soundOn); renderSound(); sfx("click"); });
  $("resetBtn").addEventListener("click", () => openSheet(resetSheet));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { saveGame(); if (ui.td && !ui.td.paused && ui.td.G.state === "play") togglePause(); }
  });
  window.addEventListener("pagehide", saveGame);

  applyLang();
  renderSound();
  render();
  if (offline) openSheet(offlineSheet);
  setInterval(loop, 500);
  setInterval(saveGame, 5000);
  saveGame();

  // Para pruebas automáticas: estado y avance del reloj.
  window.__reino = { get S() { return S; }, ui, M, D, TD, render, skip(ms) { skew += ms; loop(); }, get now() { return now(); } };
})();
