#!/usr/bin/env node
/* Comprueba que cada nivel se puede completar y regenera ../demos.js (las partidas del botón "Ver demo").
   Uso: node pulso-neon/herramientas/generar-demos.js   (tarda unos minutos; necesita Node 18 o más). */
'use strict';
const fs = require('fs'), path = require('path');
const LV = require('../niveles.js');
const bot = require('./bot.js');
const demos = {};
for (let i = 0; i < LV.LEVELS.length; i++) {
  const L = LV.buildLevel(i);
  const r = bot.solve(L, {});
  if (!r.ok) { console.error('El nivel ' + (i + 1) + ' (' + L.spec.name + ') no se puede completar: revisa niveles.js'); process.exit(1); }
  const clean = bot.simplify(L, r.inputs);
  const t = [];
  let prev = false;
  clean.forEach((h, f) => { if (h !== prev) t.push(f); prev = h; });
  demos[i] = t;
  console.log('Nivel ' + (i + 1) + ' (' + L.spec.name + '): completado, ' + t.length + ' cambios de entrada');
}
const out = path.join(__dirname, '..', 'demos.js');
const head = fs.readFileSync(out, 'utf8').split('window.PN_DEMOS')[0];
fs.writeFileSync(out, head + 'window.PN_DEMOS = ' + JSON.stringify(demos) + ';\n');
console.log('demos.js actualizado');
