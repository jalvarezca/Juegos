/* Reino: ilustraciones en SVG (edificios, héroes, enemigos y casillas del mapa), dibujadas con código.
   Estilo de juego móvil: volúmenes en perspectiva 3/4, tejados de color, sombras suaves. */
(function (root) {
  "use strict";
  const R = root.Reino = root.Reino || {};

  // Utilidades de color y formas
  function tint(hex, amt) {
    const n = parseInt(hex.slice(1), 16), f = amt < 0 ? 0 : 255, k = Math.abs(amt);
    const ch = v => Math.round(v + (f - v) * k);
    return "#" + ((1 << 24) + (ch(n >> 16) << 16) + (ch((n >> 8) & 255) << 8) + ch(n & 255)).toString(16).slice(1);
  }
  const P = pts => pts.map(p => p.map(v => +v.toFixed(1)).join(",")).join(" ");
  const poly = (pts, fill, extra) => `<polygon points="${P(pts)}" fill="${fill}"${extra || ""}/>`;
  const rect = (x, y, w, h, fill, extra) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra || ""}/>`;
  const circ = (x, y, r, fill, extra) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"${extra || ""}/>`;
  const ell = (x, y, rx, ry, fill, extra) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"${extra || ""}/>`;
  const shadow = (x, y, rx, ry) => ell(x, y, rx, ry, "rgba(0,0,0,.2)");
  const DY = 0.55;
  // Bloque en 3/4: cara frontal, lateral derecho más oscuro y techo plano claro.
  function box(x, y, w, h, d, c) {
    const dy = d * DY;
    return poly([[x + w, y], [x + w + d, y - dy], [x + w + d, y + h - dy], [x + w, y + h]], tint(c, -0.28))
      + poly([[x, y], [x + d, y - dy], [x + w + d, y - dy], [x + w, y]], tint(c, 0.18))
      + rect(x, y, w, h, c);
  }
  // Tejado a dos aguas sobre un bloque: triángulo frontal y faldón lateral.
  function gable(x, y, w, h, d, c) {
    const dy = d * DY;
    return poly([[x + w / 2, y - h], [x + w / 2 + d, y - h - dy], [x + w + d + 3, y - dy + 1], [x + w + 3, y + 1]], tint(c, -0.22))
      + poly([[x - 3, y + 1], [x + w / 2, y - h], [x + w + 3, y + 1]], c)
      + `<path d="M${x - 3} ${y + 1} L${x + w / 2} ${y - h} L${x + w + 3} ${y + 1}" fill="none" stroke="${tint(c, -0.4)}" stroke-width="1.4" stroke-linejoin="round"/>`;
  }
  // Tejado a un agua (cobertizos)
  function slope(x, y, w, h, d, c) {
    const dy = d * DY;
    return poly([[x - 3, y + 2], [x - 1, y - h], [x + w + d, y - h - dy], [x + w + d + 3, y - dy + 2], [x + w + 3, y + 2]], c)
      + poly([[x + w + 3, y + 2], [x + w + d + 3, y - dy + 2], [x + w + d, y - h - dy]], tint(c, -0.25));
  }
  // Torre cilíndrica con tejado cónico
  function tower(x, y, w, h, wall, roofC, roofH) {
    let s = rect(x, y, w, h, wall) + rect(x + w * 0.62, y, w * 0.38, h, tint(wall, -0.22));
    s += ell(x + w / 2, y + h, w / 2, w * 0.18, tint(wall, -0.1));
    s += poly([[x - 3, y + 1], [x + w / 2, y - roofH], [x + w / 2, y + 3]], roofC) + poly([[x + w / 2, y - roofH], [x + w + 3, y + 1], [x + w / 2, y + 3]], tint(roofC, -0.25));
    return s;
  }
  const merlons = (x, y, w, c, n) => { let s = ""; const step = w / n; for (let i = 0; i < n; i += 2) s += rect(x + i * step, y - 4, step, 4.5, c); return s; };
  const win = (x, y, w, h) => rect(x, y, w, h, "#3b2c22", ` rx="1"`) + rect(x + 0.8, y + 0.8, w - 1.6, (h - 1.6) / 2, "#f6d77a", ` opacity=".85"`);
  const door = (x, y, w, h, c) => `<path d="M${x} ${y + h} V${y + w / 2} A${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2} V${y + h} Z" fill="${c || "#6b4423"}"/><path d="M${x + w / 2} ${y + 1} V${y + h}" stroke="rgba(0,0,0,.25)" stroke-width="1"/>`;
  const flag = (x, y, h, c) => `<path d="M${x} ${y} V${y - h}" stroke="#5a4632" stroke-width="1.6"/><path d="M${x} ${y - h} Q${x + 6} ${y - h - 2} ${x + 12} ${y - h + 1} Q${x + 7} ${y - h + 4} ${x + 12} ${y - h + 8} Q${x + 6} ${y - h + 7} ${x} ${y - h + 7} Z" fill="${c}"/>`;
  const stones = (x, y, w, h, c) => {
    let s = "";
    for (let r = 0; r < h / 6; r++) for (let k = (r % 2) * 5; k < w - 4; k += 10) s += rect(x + k + 1, y + r * 6 + 1, 8, 4.5, tint(c, r % 2 ? 0.08 : -0.06), ` rx="1"`);
    return s;
  };
  const tree = (x, y, sc) => { sc = sc || 1; return shadow(x + 2, y + 2, 9 * sc, 3 * sc) + rect(x - 1.6 * sc, y - 8 * sc, 3.2 * sc, 9 * sc, "#7a4f2a") + circ(x, y - 13 * sc, 8 * sc, "#3f8f3a") + circ(x - 4 * sc, y - 10 * sc, 6 * sc, "#4fa244") + circ(x + 3 * sc, y - 16 * sc, 5 * sc, "#62b552"); };

  // Edificios (viewBox 0 0 120 100, suelo en y ≈ 88)
  const B = {
    center: () => shadow(60, 89, 54, 8) + tower(14, 34, 16, 54, "#cfc4ad", "#3d5ba9", 22) + tower(90, 34, 16, 54, "#cfc4ad", "#3d5ba9", 22)
      + box(30, 38, 54, 50, 12, "#d8cdb8") + stones(30, 38, 54, 50, "#d8cdb8") + merlons(30, 38, 54, "#c6baa2", 10)
      + tower(48, 12, 18, 28, "#e2d8c4", "#2f4a92", 18) + door(50, 62, 14, 26, "#5b3a1e") + win(36, 50, 6, 8) + win(72, 50, 6, 8)
      + flag(57, -4, 14, "#f2b33d") + flag(22, 12, 10, "#c0392b") + flag(98, 12, 10, "#c0392b"),
    farm: () => shadow(58, 90, 52, 7) + poly([[6, 80], [40, 66], [54, 72], [20, 88]], "#e2b84a") + `<path d="M12 81 L44 68 M16 84 L48 71 M8 78 L38 66" stroke="#c99a2e" stroke-width="2"/>`
      + box(42, 50, 40, 36, 10, "#b8432f") + gable(42, 50, 40, 18, 10, "#7a2b20") + `<path d="M54 86 V66 H70 V86 M54 66 L70 86 M70 66 L54 86" stroke="#f3e6d4" stroke-width="2" fill="none"/>`
      + rect(90, 38, 14, 48, "#d9d4c7") + rect(98, 38, 6, 48, "#b9b3a5") + ell(97, 38, 7, 3, "#a9a395") + `<path d="M90 38 Q97 26 104 38 Z" fill="#8f3a2a"/>`,
    sawmill: () => shadow(60, 90, 52, 7) + box(30, 56, 48, 30, 10, "#a0703d") + `<path d="M34 58 V86 M42 58 V86 M50 58 V86 M58 58 V86 M66 58 V86 M74 58 V86" stroke="#7d5427" stroke-width="1.4"/>`
      + slope(30, 56, 48, 12, 10, "#6b4a2b") + circ(20, 74, 12, "#b9bcc2") + circ(20, 74, 3, "#555") + `<path d="M20 61 L22 64 L18 64 Z M33 74 L30 76 L30 72 Z M20 87 L18 84 L22 84 Z M7 74 L10 72 L10 76 Z" fill="#8a8d93"/>`
      + [0, 1, 2].map(i => circ(90 + i * 9, 82, 5, "#c98a4b") + circ(90 + i * 9, 82, 2.2, "#e8b27a")).join("") + [0, 1].map(i => circ(94.5 + i * 9, 74, 5, "#c98a4b") + circ(94.5 + i * 9, 74, 2.2, "#e8b27a")).join(""),
    house: () => shadow(60, 90, 54, 7) + box(10, 58, 34, 28, 8, "#efe3c8") + gable(10, 58, 34, 16, 8, "#d9682b") + door(22, 70, 10, 16) + win(13, 64, 6, 6)
      + box(56, 50, 40, 36, 10, "#f3e7cf") + gable(56, 50, 40, 20, 10, "#e07b39") + rect(86, 26, 6, 14, "#9a5b3a") + door(70, 66, 12, 20) + win(59, 58, 7, 7) + win(86, 62, 6, 7),
    wall: () => shadow(60, 90, 56, 6) + box(8, 58, 104, 28, 6, "#aaa498") + stones(8, 58, 104, 28, "#aaa498") + merlons(8, 58, 104, "#9a9488", 18)
      + tower(2, 46, 16, 42, "#b7b1a5", "#7d4a2f", 14) + tower(102, 46, 16, 42, "#b7b1a5", "#7d4a2f", 14) + door(48, 62, 24, 26, "#5b3a1e")
      + `<path d="M50 72 H70 M50 80 H70" stroke="#3a2412" stroke-width="1.4"/>`,
    barracks: () => shadow(60, 90, 52, 7) + box(24, 52, 56, 34, 10, "#cfc3ab") + stones(24, 52, 56, 34, "#cfc3ab") + gable(24, 52, 56, 20, 10, "#a93226")
      + door(46, 64, 12, 22) + circ(33, 66, 5, "#3d5ba9") + circ(33, 66, 2, "#f2b33d") + circ(71, 66, 5, "#3d5ba9") + circ(71, 66, 2, "#f2b33d")
      + `<path d="M98 88 V62 M90 68 H106" stroke="#7a4f2a" stroke-width="2.4"/>` + ell(98, 72, 5, 6, "#d9c08a") + flag(26, 40, 16, "#a93226"),
    quarry: () => shadow(60, 90, 54, 7) + poly([[8, 88], [22, 46], [44, 34], [66, 42], [80, 62], [78, 88]], "#9b958c") + poly([[44, 34], [66, 42], [80, 62], [78, 88], [60, 88], [58, 58]], "#7f7a72")
      + poly([[22, 46], [44, 34], [50, 48], [30, 58]], "#b3ada3") + box(84, 70, 14, 14, 6, "#c9c3b8") + box(98, 74, 12, 12, 5, "#bcb6ab") + box(88, 58, 12, 12, 5, "#d2ccc1")
      + `<path d="M34 86 L50 64" stroke="#7a4f2a" stroke-width="2.6"/><path d="M44 62 Q52 60 56 66" stroke="#8a8d93" stroke-width="3.4" fill="none" stroke-linecap="round"/>`,
    herohall: () => shadow(60, 90, 56, 8) + rect(18, 84, 72, 5, "#d1c4a8") + box(20, 44, 64, 40, 12, "#efe3c9") + gable(20, 44, 64, 22, 12, "#7a4bb0")
      + [26, 40, 58, 72].map(x => rect(x, 50, 6, 34, "#fffaf0") + rect(x - 1, 48, 8, 3, "#e2d4b6")).join("") + door(45, 60, 14, 24, "#6a3f8f")
      + `<path d="M44 32 L48 26 L52 31 L56 24 L60 31 L64 26 L68 32 Z" fill="#f2b33d" stroke="#b07d1a" stroke-width="1"/>` + flag(98, 40, 16, "#7a4bb0"),
    clinic: () => shadow(60, 90, 50, 7) + box(26, 54, 50, 32, 10, "#f4f1ea") + gable(26, 54, 50, 18, 10, "#9fb4c7") + door(45, 66, 12, 20, "#8aa1b6")
      + rect(32, 61, 8, 3, "#d64545") + rect(34.5, 58.5, 3, 8, "#d64545") + rect(62, 61, 8, 3, "#d64545") + rect(64.5, 58.5, 3, 8, "#d64545")
      + poly([[84, 88], [96, 64], [108, 88]], "#f1e6d2") + poly([[96, 64], [108, 88], [100, 88]], "#d9cdb6") + rect(94, 74, 4, 2, "#d64545") + rect(95, 72.5, 2, 5, "#d64545"),
    range: () => shadow(60, 90, 54, 7) + box(10, 60, 36, 26, 8, "#a87a46") + slope(10, 60, 36, 10, 8, "#7d5427")
      + [72, 98].map(x => `<path d="M${x - 6} 88 L${x} 66 L${x + 6} 88" stroke="#7a4f2a" stroke-width="2" fill="none"/>` + circ(x, 66, 10, "#fff") + circ(x, 66, 7.5, "#d64545") + circ(x, 66, 5, "#fff") + circ(x, 66, 2.6, "#d64545")).join("")
      + `<path d="M98 66 L106 58" stroke="#5a3a1a" stroke-width="1.6"/><path d="M104 56 L108 56 L106 60 Z" fill="#c0392b"/>` + box(52, 78, 12, 8, 5, "#e2c06a"),
    tower: () => shadow(60, 90, 30, 7) + rect(42, 26, 30, 62, "#c2bbad") + rect(61, 26, 11, 62, "#a39c8e") + stones(42, 30, 19, 56, "#c2bbad")
      + rect(38, 22, 38, 7, "#b3ab9c") + merlons(38, 22, 38, "#a39c8e", 7) + poly([[38, 18], [57, -6], [57, 18]], "#3d5ba9") + poly([[57, -6], [76, 18], [57, 18]], "#2c4482")
      + win(52, 40, 5, 9) + win(52, 60, 5, 9) + flag(57, -6, 10, "#f2b33d"),
    academy: () => shadow(60, 90, 54, 7) + box(22, 52, 60, 34, 10, "#efe2c6") + `<path d="M36 52 A16 16 0 0 1 68 52 Z" fill="#2f8f8a"/><path d="M52 36 A16 16 0 0 1 68 52 H60 A8 16 0 0 0 52 36 Z" fill="#237370"/>`
      + rect(51, 26, 2, 10, "#b07d1a") + circ(52, 25, 2.5, "#f2b33d") + [28, 40, 62, 74].map(x => `<path d="M${x} 80 V68 A3 3 0 0 1 ${x + 6} 68 V80 Z" fill="#3b2c22"/>`).join("") + door(48, 66, 10, 20, "#2f6f6b")
      + `<path d="M88 86 V70 Q96 66 104 70 V86" fill="#f6efd9" stroke="#c9b48a" stroke-width="1.4"/><path d="M91 74 H101 M91 78 H101 M91 82 H98" stroke="#8a7a5a" stroke-width="1"/>`,
    embassy: () => shadow(60, 90, 54, 7) + box(26, 52, 52, 34, 10, "#efe6d2") + gable(26, 52, 52, 18, 10, "#3f8f4e") + door(45, 64, 14, 22, "#2f6b3a") + win(31, 60, 7, 8) + win(66, 60, 7, 8)
      + flag(12, 88, 30, "#c0392b") + flag(96, 88, 30, "#3d5ba9") + flag(108, 88, 24, "#f2b33d") + `<circle cx="52" cy="40" r="4" fill="#f2b33d"/>`,
    stable: () => shadow(60, 90, 54, 7) + box(14, 54, 62, 32, 10, "#9b6a3a") + slope(14, 54, 62, 12, 10, "#6b4a2b") + `<path d="M14 64 H76" stroke="#7d5427" stroke-width="1.4"/>`
      + [20, 40, 58].map(x => rect(x, 66, 14, 20, "#3b2a1a") + `<path d="M${x + 3} 74 Q${x + 7} 64 ${x + 12} 70 L${x + 12} 78 Q${x + 7} 74 ${x + 5} 80 Z" fill="${x === 40 ? "#f3efe6" : "#8b5a2b"}"/>`).join("")
      + box(86, 74, 14, 12, 6, "#e2c06a") + `<path d="M86 78 H100 M86 82 H100" stroke="#c9a24a" stroke-width="1"/>`,
    mine: () => shadow(60, 90, 54, 7) + poly([[6, 88], [26, 44], [56, 32], [88, 44], [112, 88]], "#8d7a62") + poly([[56, 32], [88, 44], [112, 88], [70, 88]], "#75644f")
      + `<path d="M40 88 V62 Q56 50 72 62 V88 Z" fill="#2a2018"/><path d="M38 88 V60 H74 V88 M38 60 H74" stroke="#7a4f2a" stroke-width="3.6" fill="none"/>`
      + `<path d="M58 88 L90 98 M64 88 L98 96" stroke="#7d7d84" stroke-width="1.6"/>` + box(82, 80, 16, 8, 5, "#6d6d74") + circ(86, 89, 2.6, "#333") + circ(96, 89, 2.6, "#333")
      + circ(87, 79, 2.6, "#c97b3a") + circ(92, 78, 2.6, "#9aa3b0") + circ(97, 79.5, 2.4, "#c97b3a"),
    plot: () => shadow(60, 88, 44, 7) + poly([[16, 78], [60, 62], [104, 78], [60, 94]], "#b88e5c") + poly([[16, 78], [60, 62], [104, 78], [60, 94]], "none", ` stroke="#8d6a40" stroke-width="1.5" stroke-dasharray="4 3"`)
      + `<path d="M60 84 V58" stroke="#7a4f2a" stroke-width="2.6"/>` + rect(46, 48, 28, 14, "#c9a06a", ` rx="2"`) + rect(46, 48, 28, 14, "none", ` rx="2" stroke="#8d6a40" stroke-width="1.4"`)
      + `<path d="M54 56 V53 A6 6 0 0 1 66 53 V56" fill="none" stroke="#5a4632" stroke-width="2"/>` + rect(52, 55, 16, 6, "#5a4632", ` rx="1"`)
  };
  const building = key => `<svg viewBox="0 -14 120 114" aria-hidden="true" focusable="false">${(B[key] || B.plot)()}</svg>`;

  // Fondo del pueblo: hierba, caminos, río y árboles (viewBox 0 0 100 126)
  function townGround() {
    let s = `<defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fd06f"/><stop offset="1" stop-color="#7fb957"/></linearGradient></defs>`;
    s += rect(0, 0, 100, 126, "url(#tg)");
    for (let i = 0; i < 60; i++) s += ell((i * 37) % 100, (i * 53) % 126, 1.6, 0.8, "rgba(255,255,255,.16)");
    const road = "#dcc193", edge = "#c4a571";
    s += `<path d="M50 126 V14 M8 40 H92 M8 62 H92 M8 84 H92 M8 106 H92" stroke="${edge}" stroke-width="7.5" stroke-linecap="round" fill="none"/>`;
    s += `<path d="M50 126 V14 M8 40 H92 M8 62 H92 M8 84 H92 M8 106 H92" stroke="${road}" stroke-width="5.5" stroke-linecap="round" fill="none"/>`;
    s += `<path d="M-2 4 Q20 10 30 3 T60 4 T102 2" stroke="#6fb3e0" stroke-width="5" fill="none" opacity=".9"/>`;
    for (const [x, y, k] of [[4, 18, 0.35], [96, 20, 0.35], [3, 52, 0.3], [97, 52, 0.3], [4, 74, 0.3], [87, 100, 0.4], [80, 104, 0.3], [94, 106, 0.32], [8, 120, 0.32], [92, 122, 0.3], [26, 121, 0.25], [74, 121, 0.25]]) s += tree(x, y, k);
    return `<svg class="ground" viewBox="0 0 100 126" preserveAspectRatio="none" aria-hidden="true" focusable="false">${s}</svg>`;
  }

  // Retratos de héroes (viewBox 0 0 64 64)
  const LOOK = {
    brunilda: { skin: "#f1c7a0", hair: "#c9662b", style: "braid", gear: "helm" },
    gael: { skin: "#d9a479", hair: "#3b2a1e", style: "beard", gear: "helm" },
    tobias: { skin: "#f0c8a4", hair: "#7a4a24", style: "short", gear: "none" },
    marta: { skin: "#c98e63", hair: "#241a14", style: "bun", gear: "none" },
    leonor: { skin: "#f4d2b2", hair: "#e8c060", style: "long", gear: "plume" },
    dario: { skin: "#b97a50", hair: "#1e1611", style: "beard", gear: "plume" },
    iker: { skin: "#eabf97", hair: "#5a3a22", style: "short", gear: "none" },
    sara: { skin: "#dca57c", hair: "#9a3b26", style: "long", gear: "none" },
    selene: { skin: "#f6dcc6", hair: "#e6e2dc", style: "long", gear: "hood" },
    elio: { skin: "#e2b088", hair: "#2a3a5a", style: "short", gear: "hood" },
    nora: { skin: "#a8724c", hair: "#1d1410", style: "bun", gear: "hood" },
    bruno: { skin: "#f0c4a0", hair: "#b07a3a", style: "beard", gear: "none" }
  };
  const ARMOR = { inf: ["#9aa3ad", "#a93226"], cav: ["#7f8c6a", "#2f6b3a"], arc: ["#8a5a32", "#3d5ba9"] };
  function face(o) {
    const { skin, hair, style, gear, armor, cloth, bg, mask } = o;
    let s = `<defs><radialGradient id="pg${bg.slice(1)}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${tint(bg, 0.45)}"/><stop offset="1" stop-color="${bg}"/></radialGradient></defs>`;
    s += circ(32, 32, 32, `url(#pg${bg.slice(1)})`);
    if (style === "long" || style === "braid") s += `<path d="M17 30 Q16 52 22 58 H42 Q48 52 47 30 Z" fill="${hair}"/>`;
    s += `<path d="M8 64 Q10 46 32 44 Q54 46 56 64 Z" fill="${cloth}"/><path d="M14 64 Q16 50 32 49 Q48 50 50 64 Z" fill="${armor}"/><path d="M26 47 L32 56 L38 47" fill="${tint(cloth, 0.2)}"/>`;
    s += rect(28, 38, 8, 8, tint(skin, -0.1));
    s += ell(32, 31, 12, 13.5, skin);
    if (gear !== "helm" && gear !== "hood") s += `<path d="M20 30 Q19 15 32 15 Q45 15 44 30 Q40 22 32 22 Q24 22 20 30 Z" fill="${hair}"/>`;
    if (style === "bun") s += circ(32, 14, 5, hair);
    if (style === "braid") s += `<path d="M44 34 Q50 46 46 56" stroke="${hair}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    if (style === "beard") s += `<path d="M21 32 Q22 47 32 47 Q42 47 43 32 Q40 40 32 40 Q24 40 21 32 Z" fill="${hair}"/>`;
    s += ell(27, 31, 1.6, 2, "#2b1d14") + ell(37, 31, 1.6, 2, "#2b1d14") + ell(25, 35.5, 2.2, 1.3, "rgba(230,110,110,.35)") + ell(39, 35.5, 2.2, 1.3, "rgba(230,110,110,.35)");
    s += mask ? `<path d="M20 33 Q32 31 44 33 L43 40 Q32 44 21 40 Z" fill="${mask}"/>` : `<path d="M28.5 37.5 Q32 40 35.5 37.5" stroke="#8a4a3a" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
    if (gear === "helm") s += `<path d="M19 30 Q18 13 32 13 Q46 13 45 30 L41 30 Q40 20 32 20 Q24 20 23 30 Z" fill="#a9b1ba"/><path d="M32 13 V30" stroke="#7d858f" stroke-width="2.4"/>`;
    if (gear === "plume") s += `<path d="M20 26 Q20 13 32 13 Q44 13 44 26 Z" fill="#b8a46a"/><path d="M32 13 Q38 2 48 6 Q40 8 36 14 Z" fill="#c0392b"/>`;
    if (gear === "hood") s += `<path d="M16 40 Q14 12 32 11 Q50 12 48 40 L44 40 Q45 20 32 19 Q19 20 20 40 Z" fill="${cloth}"/>`;
    return `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">${s}</svg>`;
  }
  const heroFace = (id, type, color) => { const l = LOOK[id] || LOOK.tobias, [armor, cloth] = ARMOR[type]; return face({ ...l, armor, cloth, bg: color }); };
  const foeFace = (type, boss) => face({ skin: boss ? "#a9b48a" : "#d9a479", hair: "#3b2a1e", style: boss ? "beard" : "short", gear: boss ? "helm" : "none", armor: boss ? "#4a4a55" : "#7a5a3a", cloth: "#7a2f1d", bg: boss ? "#4a4a55" : { inf: "#c0563b", cav: "#3d7a3f", arc: "#3d5ba9" }[type], mask: boss ? null : "#8a2a1d" });

  // Casillas del mapa (viewBox 0 0 40 40)
  const TILE = {
    rebel: () => shadow(20, 33, 15, 3) + poly([[6, 32], [15, 12], [24, 32]], "#c0563b") + poly([[15, 12], [24, 32], [18, 32]], "#8f3a2a") + poly([[19, 32], [28, 16], [36, 32]], "#d9824b") + poly([[28, 16], [36, 32], [31, 32]], "#a8582f")
      + `<path d="M15 12 V6" stroke="#5a4632" stroke-width="1.2"/><path d="M15 6 L21 8 L15 10 Z" fill="#2a2a2a"/>` + ell(20, 35, 4, 1.4, "#5a3a1a") + `<path d="M18 35 Q20 29 22 35 Z" fill="#f2a33d"/>`,
    bread: () => poly([[4, 26], [20, 18], [36, 26], [20, 34]], "#e2b84a") + `<path d="M8 26 L22 19 M12 28 L26 21 M16 30 L30 23 M20 32 L33 25" stroke="#c99a2e" stroke-width="1.6"/>` + `<path d="M20 22 V10 M17 14 Q20 9 23 14" stroke="#b8922a" stroke-width="1.6" fill="none"/>`,
    wood: () => [[12, 30, 0.9], [26, 28, 1], [19, 22, 0.8]].map(([x, y, k]) => shadow(x + 1, y + 1, 6 * k, 2 * k) + rect(x - 1, y - 4 * k, 2, 5 * k, "#6b4423") + poly([[x - 7 * k, y - 4 * k], [x, y - 20 * k], [x + 7 * k, y - 4 * k]], "#2f7a3a") + poly([[x - 5 * k, y - 10 * k], [x, y - 24 * k], [x + 5 * k, y - 10 * k]], "#3f9a48")).join(""),
    stone: () => shadow(20, 33, 15, 3) + poly([[6, 32], [10, 20], [20, 14], [30, 20], [34, 32]], "#9b958c") + poly([[20, 14], [30, 20], [34, 32], [22, 32]], "#7f7a72") + poly([[10, 20], [20, 14], [22, 22], [14, 25]], "#b8b2a8"),
    iron: () => shadow(20, 33, 15, 3) + poly([[6, 32], [11, 19], [21, 13], [31, 20], [34, 32]], "#6f6a66") + poly([[21, 13], [31, 20], [34, 32], [22, 32]], "#57534f") + `<path d="M12 26 L18 22 L22 26 M24 18 L28 24" stroke="#d68a4a" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    bear: () => shadow(20, 34, 14, 3) + circ(11, 11, 5, "#6b4423") + circ(29, 11, 5, "#6b4423") + circ(11, 11, 2.4, "#c9935a") + circ(29, 11, 2.4, "#c9935a") + circ(20, 21, 13, "#7a4f2a") + ell(20, 26, 6, 4.5, "#c9935a")
      + ell(20, 23.5, 2.4, 1.8, "#2a1a10") + circ(15, 18, 1.8, "#1a120c") + circ(25, 18, 1.8, "#1a120c") + `<path d="M17 28 Q20 30 23 28" stroke="#2a1a10" stroke-width="1.2" fill="none"/>`,
    tree: () => tree(20, 34, 1.15),
    castle: () => B.center()
  };
  const tile = kind => (kind === "castle" ? `<svg viewBox="0 -8 120 100" aria-hidden="true" focusable="false">${TILE.castle()}</svg>` : `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">${TILE[kind]()}</svg>`);

  R.arte = { tint, building, townGround, heroFace, foeFace, tile };
  if (typeof module !== "undefined" && module.exports) module.exports = R.arte;
})(typeof window !== "undefined" ? window : globalThis);
