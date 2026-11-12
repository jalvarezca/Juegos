#!/usr/bin/env node
/* Pruebas del motor de Enjambre. Uso: node enjambre/herramientas/pruebas.js */
const M = require("../motor.js");
const assert = require("assert");
const DT = 1 / 120;
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log("ok", name); };
const run = (S, secs, input) => { for (let i = 0; i < Math.round(secs / DT); i++) M.step(S, DT, typeof input === "function" ? input(S) : input); };
const ev = (S, t) => S.events.filter(e => e.t === t);

ok("crear oleada 1", () => {
  const S = M.create({ seed: 1 });
  assert.equal(S.grid.total, 45); assert.equal(S.grid.alive, 45); assert.equal(S.grid.name, "wedge");
  assert.equal(S.state, "intro"); assert.equal(S.lives, 3); assert.equal(S.barriers.length, 4);
  assert.ok(S.grid.cells.every(a => !a.armor));
  run(S, 1.9, {}); assert.equal(S.state, "play");
});
ok("formaciones y jefes", () => {
  const names = []; for (let w = 1; w <= 11; w++) names.push(M.formationFor(w).name);
  assert.deepEqual(names, ["wedge", "wall", "diamond", "checker", "boss", "wings", "wedge", "wall", "diamond", "boss", "checker"]);
});
ok("disparar mata un alienígena", () => {
  const S = M.create({ seed: 2 }); run(S, 1.9, {});
  // nave bajo la columna 5 (la más baja de esa columna es una medusa)
  const x = M.alienX(S, { col: 5 });
  let killed = null;
  for (let i = 0; i < 400 && !killed; i++) { M.step(S, DT, { target: S.grid.x + 5 * M.DX, fire: i === 0 }); killed = ev(S, "kill")[0]; }
  assert.ok(killed, "debe matar"); assert.equal(killed.type, "c"); assert.equal(S.grid.alive, 44);
  assert.equal(S.score, 10); assert.equal(S.stats.shots, 1); assert.equal(S.stats.hits, 1);
});
ok("los acorazados aguantan dos disparos", () => {
  const S = M.create({ seed: 3, wave: 4 });
  const armored = S.grid.cells.filter(a => a.armor);
  assert.ok(armored.length > 0, "debe haber acorazados en la oleada 4");
  const a = armored[0]; S.state = "play"; S.bombT = 99; S.ufoT = 99;
  const shoot = () => { S.shots.push({ x: M.alienX(S, a), y: M.alienY(S, a) + 14, vx: 0, vy: -560, dead: false }); run(S, 0.05, {}); };
  shoot(); assert.equal(ev(S, "armorHit").length, 1); assert.equal(a.alive, true); assert.equal(a.hp, 1);
  shoot(); assert.equal(a.alive, false); assert.equal(ev(S, "kill")[0].pts, Math.round(M.TYPES[a.type].pts * 1.5));
});
ok("las bombas erosionan barreras y dañan la nave", () => {
  const S = M.create({ seed: 4 }); S.state = "play"; S.bombT = 99; S.ufoT = 99;
  const b = S.barriers[1], before = b.cells.reduce((s, v) => s + v, 0);
  S.bombs.push({ x: b.x + 24, x0: b.x + 24, y: b.y - 20, vx: 0, vy: 150, kind: "fast", home: false, ph: 0, dead: false });
  run(S, 0.5, {});
  const after = b.cells.reduce((s, v) => s + v, 0);
  assert.ok(after < before, "la barrera pierde celdas"); assert.equal(S.bombs.length, 0);
  S.player.x = 300;
  S.bombs.push({ x: 300, x0: 300, y: 520, vx: 0, vy: 150, kind: "zig", home: false, ph: 0, dead: false });
  run(S, 0.5, {});
  assert.equal(S.lives, 2); assert.equal(S.state, "dying");
  run(S, 1.8, {}); assert.equal(S.state, "play"); assert.ok(S.player.inv > 0); assert.equal(S.player.alive, true);
});
ok("el escudo absorbe un impacto", () => {
  const S = M.create({ seed: 5 }); S.state = "play"; S.bombT = 99; S.ufoT = 99;
  S.powerups.push({ x: S.player.x, y: M.PY - 30, kind: "shield", t: 0, dead: false });
  run(S, 0.4, {}); assert.equal(S.player.shield, 1);
  S.bombs.push({ x: S.player.x, x0: S.player.x, y: 525, vx: 0, vy: 150, kind: "fast", home: false, ph: 0, dead: false });
  run(S, 0.3, {}); assert.equal(S.lives, 3); assert.equal(S.player.shield, 0); assert.equal(ev(S, "shieldPop").length, 1);
});
ok("disparo triple y rápido", () => {
  const S = M.create({ seed: 6 }); S.state = "play"; S.bombT = 99;
  S.player.spread = 5; S.player.rapid = 5;
  M.step(S, DT, { fire: true }); assert.equal(S.shots.length, 3);
  run(S, 0.12, { fire: true }); assert.equal(S.shots.length, 6);
});
ok("los disparos anulan bombas, pero no el plasma", () => {
  const S = M.create({ seed: 7 }); S.state = "play"; S.bombT = 99; S.player.x = 20;
  S.bombs.push({ x: 20, x0: 20, y: 400, vx: 0, vy: 150, kind: "zig", home: false, ph: 0, dead: false });
  M.step(S, DT, { fire: true }); run(S, 0.4, {});
  assert.equal(ev(S, "clash").length, 1); assert.equal(S.bombs.length, 0);
  S.player.cd = 0;
  S.bombs.push({ x: 20, x0: 20, y: 400, vx: 0, vy: 150, kind: "plasma", home: false, ph: 0, dead: false });
  M.step(S, DT, { fire: true }); run(S, 0.3, {});
  assert.equal(ev(S, "absorb").length, 1); assert.equal(S.bombs.length, 1);
});
ok("limpiar oleada y pasar a la siguiente", () => {
  const S = M.create({ seed: 8 }); S.state = "play";
  for (const c of S.grid.cells) c.alive = false; S.grid.alive = 0;
  M.step(S, DT, {}); assert.equal(S.state, "clear");
  const wc = ev(S, "waveClear")[0]; assert.equal(wc.flawless, true); assert.equal(wc.bonus, 200);
  run(S, 2.5, {}); assert.equal(S.wave, 2); assert.equal(S.state, "intro"); assert.equal(S.grid.name, "wall"); assert.equal(S.grid.total, 49);
});
ok("jefe: muere y arrastra a su escolta", () => {
  const S = M.create({ seed: 9, wave: 5 }); assert.ok(S.boss); assert.equal(S.boss.max, 36); assert.equal(S.grid.name, "boss");
  S.state = "play"; S.bombT = 99; S.boss.hp = 1; S.boss.atkT = 99; S.boss.aimT = 99;
  let died = false;
  for (let i = 0; i < 1200 && !died; i++) {
    M.step(S, DT, { target: S.boss ? S.boss.x : S.player.x, fire: true });
    died = ev(S, "bossDie").length > 0;
  }
  assert.ok(died); assert.equal(S.boss, null); assert.equal(S.grid.alive, 0); assert.equal(S.state, "clear");
  assert.ok(ev(S, "kill").filter(e => e.delay > 0).length >= 10);
  assert.equal(S.powerups.length, 2);
});
ok("invasión: cuesta una vida y el enjambre retrocede", () => {
  const S = M.create({ seed: 10 }); S.state = "play"; S.grid.y = 440;
  run(S, 0.5, {}); assert.equal(S.state, "dying"); assert.equal(S.lives, 2);
  assert.ok(ev(S, "playerHit")[0].invaded); assert.ok(S.grid.y < 440 - 90);
  run(S, 2.3, {}); assert.equal(S.state, "play");
  S.lives = 1; S.grid.y = 440; run(S, 0.5, {}); assert.equal(S.state, "over"); assert.ok(ev(S, "gameOver")[0].invaded);
});
ok("vida extra a los 10000", () => {
  const S = M.create({ seed: 11 }); S.state = "play"; S.score = 9995; S.mult = 1;
  for (const c of S.grid.cells) c.alive = false; S.grid.alive = 0;
  M.step(S, DT, {}); assert.equal(S.lives, 4); assert.equal(S.nextLife, 20000);
});
ok("multiplicador por racha", () => {
  const S = M.create({ seed: 12 }); S.state = "play"; S.bombT = 99; S.ufoT = 99;
  const shootAt = a => { S.shots.push({ x: M.alienX(S, a), y: M.alienY(S, a) + 14, vx: 0, vy: -560, dead: false }); run(S, 0.05, {}); };
  const victims = S.grid.cells.filter(a => a.row === 4).slice(0, 9);
  for (let i = 0; i < 8; i++) shootAt(victims[i]);
  assert.equal(S.streak, 8); assert.equal(S.mult, 2); assert.equal(ev(S, "mult")[0].mult, 2);
  const before = S.score; shootAt(victims[8]); assert.equal(S.score - before, 20);
  // un fallo: un disparo que sale por arriba sin tocar nada
  S.shots.push({ x: 2, y: 100, vx: 0, vy: -560, dead: false }); run(S, 0.3, {});
  assert.equal(S.mult, 1); assert.equal(S.streak, 0);
});
ok("determinismo con semilla", () => {
  const play = seed => { const S = M.create({ seed }); let k = 0; run(S, 30, s => ({ move: Math.sin(s.t * 1.3), fire: (k++ % 10) < 5 })); return [S.score, S.lives, S.grid.alive, S.state].join(","); };
  assert.equal(play(42), play(42));
});
console.log(n, "pruebas correctas");
