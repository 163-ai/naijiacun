// 奶家村 · 大冒险 —— 瓦片世界
// 一格 = 1 个世界单位。每格单独画、单独判定：
// 能不能走（solid）、是什么地面（tiles）、门在哪（marks）都记在这里。
// 这样「每一个方格都能互动」才有落点：脚边那格是水就能打水，是田就能锄，是门就能进。
import * as T from "three";

export const TS = 1;        // 一格多大（世界单位）
export const PX = 32;       // 一格画多少像素

export const TI = {
  GRASS: 0, PATH: 1, STONE: 2, WATER: 3, SAND: 4,
  FIELD: 5, FLOWER: 6, WOOD: 7, WALL: 8, RUG: 9, MAT: 10,
  WEED: 11,       // 没开垦的荒草：比普通草深、杂草多，锄头能翻
  WEED_EDGE: 12   // 荒地的边缘：草地底 + 几根高草，用来把田的边界揉开
};

/* =========================================================
   地图容器
   ========================================================= */
function makeMap(w, h, name, ox, oz) {
  return {
    name, w, h, ox, oz,
    tiles: new Uint8Array(w * h),
    solid: new Uint8Array(w * h),
    marks: new Map(),          // "tx,tz" → { kind, ... }
    deco: [],                  // 家具：{ tx, tz, tw, th, kind }
    indoor: false
  };
}
const inb = (m, tx, tz) => tx >= 0 && tz >= 0 && tx < m.w && tz < m.h;
const at = (m, tx, tz) => tz * m.w + tx;

export function tileAt(m, tx, tz) { return inb(m, tx, tz) ? m.tiles[at(m, tx, tz)] : TI.GRASS; }
export function solidAt(m, tx, tz) { return !inb(m, tx, tz) || m.solid[at(m, tx, tz)] === 1; }
export function blockedAt(m, tx, tz) { return solidAt(m, tx, tz); }

export function setTile(m, tx, tz, type) {
  if (inb(m, tx, tz)) m.tiles[at(m, tx, tz)] = type;
}
export function setSolid(m, tx, tz, v = 1) {
  if (inb(m, tx, tz)) m.solid[at(m, tx, tz)] = v;
}
export function mark(m, tx, tz, data) {
  if (inb(m, tx, tz)) m.marks.set(tx + "," + tz, data);
}
export function markAt(m, tx, tz) { return m.marks.get(tx + "," + tz) || null; }

export function toTile(m, x, z) {
  return { tx: Math.floor(x - m.ox), tz: Math.floor(z - m.oz) };
}
export function toWorld(m, tx, tz) {
  return { x: m.ox + tx + .5, z: m.oz + tz + .5 };
}

/* =========================================================
   随机
   ========================================================= */
function rng(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const hash = (a, b) => ((a * 73856093) ^ (b * 19349663)) >>> 0;

/* =========================================================
   每种格子的画法（先生成一批变体，之后直接 drawImage 拼接，快）
   ========================================================= */
function drawGrass(g, s, r) {
  // 明度卡在很窄的一段里：一格一格拼起来还是一整片草，不会变成马赛克
  const hue = 86 + r() * 5;
  g.fillStyle = `hsl(${hue},${32 + r() * 4}%,${59 + r() * 2.2}%)`;
  g.fillRect(0, 0, s, s);
  g.fillStyle = r() < .5 ? "rgba(116,152,86,.06)" : "rgba(196,218,158,.06)";
  g.beginPath();
  g.ellipse(r() * s, r() * s, s * (.28 + r() * .3), s * (.2 + r() * .22), r() * 3, 0, 7);
  g.fill();
  // 草簇
  g.lineCap = "round";
  const n = 10 + Math.floor(r() * 8);
  for (let i = 0; i < n; i++) {
    const x = r() * s, y = r() * s;
    const dark = r() < .64;
    g.strokeStyle = dark
      ? `hsla(${hue - 6},44%,${38 + r() * 10}%,${.3 + r() * .22})`
      : `hsla(${hue + 8},36%,${70 + r() * 6}%,${.16 + r() * .18})`;
    g.lineWidth = .9 + r() * .7;
    const h = 2 + r() * 3.4, lean = (r() - .5) * 2;
    g.beginPath();
    g.moveTo(x, y); g.lineTo(x + lean, y - h);
    g.moveTo(x, y); g.lineTo(x + lean * 2 - 1.1, y - h * .7);
    g.stroke();
  }
}

function drawPath(g, s, r) {
  g.fillStyle = `hsl(${36 + r() * 7},${29 + r() * 9}%,${74 + r() * 5}%)`;
  g.fillRect(0, 0, s, s);
  g.fillStyle = `hsla(${34 + r() * 8},32%,${64 + r() * 8}%,.5)`;
  g.beginPath(); g.ellipse(r() * s, r() * s, s * .3, s * .22, 0, 0, 7); g.fill();
  for (let i = 0; i < 16; i++) {
    g.fillStyle = `hsla(${32 + r() * 10},${20 + r() * 14}%,${54 + r() * 26}%,${.28 + r() * .3})`;
    g.beginPath();
    g.ellipse(r() * s, r() * s, .6 + r() * 1.3, .45 + r() * .9, r() * 3, 0, 7); g.fill();
  }
  g.fillStyle = "rgba(120,100,64,.06)";
  g.fillRect(0, 0, s, 1); g.fillRect(0, 0, 1, s);
}

function drawStone(g, s, r) {
  g.fillStyle = `hsl(${40 + r() * 6},${12 + r() * 6}%,${69 + r() * 3}%)`;
  g.fillRect(0, 0, s, s);
  // 每格两块错缝石砖，缝很细，不要画成几何图案
  const off = r() < .5 ? 0 : s / 4;
  g.strokeStyle = "rgba(104,94,76,.24)"; g.lineWidth = 1.4;
  for (let i = 0; i < 2; i++) {
    const p = off + i * s / 2;
    g.beginPath(); g.moveTo(p % s, 0); g.lineTo(p % s, s); g.stroke();
    g.beginPath(); g.moveTo(0, p % s); g.lineTo(s, p % s); g.stroke();
  }
  // 表面颗粒
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `hsla(40,10%,${62 + r() * 22}%,${.16 + r() * .22})`;
    g.beginPath(); g.ellipse(r() * s, r() * s, .5 + r() * .9, .4 + r() * .7, r() * 3, 0, 7); g.fill();
  }
}

function drawWater(g, s, r) {
  const hue = 184 + r() * 6;
  g.fillStyle = `hsl(${hue},${38 + r() * 8}%,${63 + r() * 3}%)`;
  g.fillRect(0, 0, s, s);
  // 水下的一点点深浅，不要画弧线：弧线一格一条，拼起来像贴瓷砖
  g.fillStyle = `hsla(${hue - 4},42%,${54 + r() * 6}%,.22)`;
  g.beginPath();
  g.ellipse(r() * s, r() * s, s * .4, s * .3, r() * 3, 0, 7);
  g.fill();
}

function drawSand(g, s, r) {
  g.fillStyle = `hsl(${44 + r() * 6},${26 + r() * 10}%,${78 + r() * 5}%)`;
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `hsla(${40 + r() * 10},24%,${64 + r() * 24}%,${.3 + r() * .34})`;
    g.beginPath(); g.ellipse(r() * s, r() * s, .6 + r() * 1.1, .5 + r() * .8, 0, 0, 7); g.fill();
  }
}

function drawField(g, s, r) {
  // 开垦过的干土：一格一块田，横向犁沟
  g.fillStyle = `hsl(${30 + r() * 5},${24 + r() * 8}%,${52 + r() * 6}%)`;
  g.fillRect(0, 0, s, s);
  g.fillStyle = `hsla(${30 + r() * 6},26%,${44 + r() * 6}%,.55)`;
  for (let i = 0; i < 3; i++) g.fillRect(0, (i + .55) * s / 3 - 1.4, s, 2.6);
  for (let i = 0; i < 22; i++) {
    g.fillStyle = `hsla(${30 + r() * 12},${20 + r() * 16}%,${40 + r() * 30}%,${.3 + r() * .3})`;
    g.beginPath(); g.ellipse(r() * s, r() * s, .5 + r() * 1, .4 + r() * .7, 0, 0, 7); g.fill();
  }
  g.strokeStyle = "rgba(96,74,44,.28)"; g.lineWidth = 1.4;
  g.strokeRect(.7, .7, s - 1.4, s - 1.4);
}

function drawFlower(g, s, r) {
  drawGrass(g, s, r);
  const cs = ["#f2b2c4", "#f6d98b", "#ead6f0", "#fff3d0", "#f09a8b", "#cfe2f7"];
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const x = 4 + r() * (s - 8), y = 4 + r() * (s - 8);
    g.strokeStyle = "rgba(94,132,72,.75)"; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x, y + 3); g.lineTo(x, y); g.stroke();
    g.fillStyle = cs[Math.floor(r() * cs.length)];
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * 6.283;
      g.beginPath(); g.arc(x + Math.cos(a) * 1.9, y + Math.sin(a) * 1.9, 1.5, 0, 7); g.fill();
    }
    g.fillStyle = "#f7e9a8";
    g.beginPath(); g.arc(x, y, 1.2, 0, 7); g.fill();
  }
}

function drawWeed(g, s, r) {
  // 荒了的地：比草坪更暗、更黄、更脏。一眼就能看出"这块地还没开"
  const hue = 68 + r() * 4;
  g.fillStyle = `hsl(${hue},${20 + r() * 4}%,${46.5 + r() * .9}%)`;
  g.fillRect(0, 0, s, s);
  // 露出来的土疙瘩（画在格子里面，别被格子边切出方角）
  for (let i = 0; i < 3; i++) {
    const rr = s * (.13 + r() * .12);
    g.fillStyle = `hsla(${30 + r() * 10},${18 + r() * 10}%,${40 + r() * 8}%,${.18 + r() * .12})`;
    g.beginPath();
    g.ellipse(s * .32 + r() * s * .36, s * .32 + r() * s * .36, rr, rr * .8, r() * 3, 0, 7);
    g.fill();
  }
  // 一丛丛枯草：短一点，别顶到格子边（顶到边会被切平，一整片就成了一格一格）
  g.lineCap = "round";
  for (let i = 0; i < 10; i++) {
    const x = 2 + r() * (s - 4), y = s * .5 + r() * (s * .46);
    const h = s * (.1 + r() * .14);
    g.strokeStyle = `hsla(${44 + r() * 16},${26 + r() * 18}%,${46 + r() * 16}%,${.42 + r() * .3})`;
    g.lineWidth = 1 + r() * .9;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + (r() - .5) * 4, y - h * .6, x + (r() - .5) * 6, y - h);
    g.stroke();
  }
  // 深色的杂草团，让整片地显得"毛"
  for (let i = 0; i < 4; i++) {
    const rr = s * (.1 + r() * .1);
    g.fillStyle = `hsla(${hue - 6},${26 + r() * 10}%,${32 + r() * 10}%,${.26 + r() * .18})`;
    g.beginPath();
    g.ellipse(s * .3 + r() * s * .4, s * .3 + r() * s * .4, rr, rr * .7, r() * 3, 0, 7);
    g.fill();
  }
  // 小石子（一格最多一颗，位置随机，不然整片地会出现规律的点儿）
  if (r() < .7) {
    const x = 5 + r() * (s - 10), y = 5 + r() * (s - 10), rr = 1.1 + r() * 1.5;
    g.fillStyle = "rgba(96,88,74,.26)";
    g.beginPath(); g.ellipse(x + .8, y + 1, rr, rr * .8, 0, 0, 7); g.fill();
    g.fillStyle = `hsl(${38 + r() * 14},10%,${62 + r() * 10}%)`;
    g.beginPath(); g.ellipse(x, y, rr, rr * .8, 0, 0, 7); g.fill();
  }
}

// 荒地边缘：草地底，只多几根高一点的枯草 —— 让田的边不是一条直线
function drawWeedEdge(g, s, r) {
  drawGrass(g, s, r);
  g.lineCap = "round";
  for (let i = 0; i < 6; i++) {
    const x = 2 + r() * (s - 4), y = s * .45 + r() * (s * .5);
    const h = s * (.09 + r() * .12);
    g.strokeStyle = `hsla(${46 + r() * 14},${24 + r() * 16}%,${48 + r() * 14}%,${.4 + r() * .26})`;
    g.lineWidth = 1 + r() * .8;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + (r() - .5) * 4, y - h * .6, x + (r() - .5) * 6, y - h);
    g.stroke();
  }
}

// 整片荒地统一撒一遍高草：跨格画，就不会一格一格像瓦片
function weedDetail(g, m) {
  g.lineCap = "round";
  for (let tz = 0; tz < m.h; tz++) {
    for (let tx = 0; tx < m.w; tx++) {
      if (m.tiles[tz * m.w + tx] !== TI.WEED) continue;
      const R = rng(hash(tx * 131 + 7, tz * 197 + 3));
      const n = 1 + Math.floor(R() * 2);
      for (let i = 0; i < n; i++) {
        const bx = tx * PX + R() * PX;
        const by = tz * PX + 6 + R() * (PX - 6);
        const hh = PX * (.28 + R() * .34);
        const blades = 3 + Math.floor(R() * 3);
        for (let k = 0; k < blades; k++) {
          const lean = (R() - .5) * 8;
          g.strokeStyle = `hsla(${42 + R() * 20},${28 + R() * 20}%,${46 + R() * 18}%,${.4 + R() * .34})`;
          g.lineWidth = 1 + R() * .9;
          g.beginPath();
          g.moveTo(bx + (R() - .5) * 5, by);
          g.quadraticCurveTo(bx + lean * .5, by - hh * .6, bx + lean, by - hh * (0.7 + R() * .5));
          g.stroke();
        }
      }
    }
  }
}

function drawWood(g, s, r) {
  // 室内地板：四条横向长木板。板缝高度固定（4 等分），一格一格拼起来
  // 板缝永远对齐，不会像砖那样一格一个框
  const base = 32 + r() * 3;
  g.fillStyle = `hsl(${base},${28 + r() * 5}%,${61 + r() * 1.2}%)`;
  g.fillRect(0, 0, s, s);
  const ph = s / 4;                      // 每块板 8px
  for (let i = 0; i < 4; i++) {
    const y = i * ph;
    // 每块板自己的色差，很轻
    g.fillStyle = `hsla(${base + (r() - .5) * 5},${29 + r() * 6}%,${60 + r() * 2}%,.6)`;
    g.fillRect(0, y + .6, s, ph - 1.2);
    // 木纹：几条横着走的淡线
    g.strokeStyle = `hsla(${base - 4},34%,${46 + r() * 6}%,.13)`;
    g.lineWidth = 1;
    for (let k = 0; k < 2; k++) {
      const yy = y + 1.6 + r() * (ph - 3.2);
      g.beginPath();
      g.moveTo(0, yy);
      g.bezierCurveTo(s * .33, yy + (r() - .5) * 1.6, s * .66, yy + (r() - .5) * 1.6, s, yy);
      g.stroke();
    }
    // 上沿受光
    g.fillStyle = "rgba(255,246,225,.13)";
    g.fillRect(0, y + .8, s, .9);
    // 板缝
    g.fillStyle = "rgba(88,58,34,.32)";
    g.fillRect(0, y + ph - 1.1, s, 1.1);
    // 板头接缝：大部分板没有，少数板有一道
    if (r() < .34) {
      const jx = 3 + r() * (s - 6);
      g.fillStyle = "rgba(88,58,34,.22)";
      g.fillRect(jx, y + 1.2, 1, ph - 2.4);
    }
  }
}

function drawWall(g, s, r) {
  // 墙：同一种木头，但在阴影里。板更宽，缝更深，看上去是"立起来的"
  // 别压得太黑 —— 相机看得到房间外一圈墙，太暗就像画面漏了洞
  const base = 26 + r() * 3;
  g.fillStyle = `hsl(${base},${24 + r() * 5}%,${35 + r() * 2.5}%)`;
  g.fillRect(0, 0, s, s);
  const ph = s / 3;
  for (let i = 0; i < 3; i++) {
    const y = i * ph;
    g.fillStyle = `hsla(${base + (r() - .5) * 4},${26 + r() * 5}%,${40 + r() * 4}%,.55)`;
    g.fillRect(0, y + .8, s, ph - 1.6);
    g.fillStyle = "rgba(255,230,190,.06)";
    g.fillRect(0, y + 1, s, 1);
    g.fillStyle = "rgba(14,8,4,.5)";
    g.fillRect(0, y + ph - 1.4, s, 1.4);
    g.strokeStyle = "rgba(150,112,72,.09)";
    g.lineWidth = 1;
    for (let k = 0; k < 2; k++) {
      const yy = y + 3 + r() * (ph - 6);
      g.beginPath(); g.moveTo(0, yy); g.lineTo(s, yy + (r() - .5) * 2); g.stroke();
    }
  }
  // 上沿投下来的一道暗影：让墙和地有个高低差
  const grd = g.createLinearGradient(0, 0, 0, s);
  grd.addColorStop(0, "rgba(0,0,0,.4)");
  grd.addColorStop(.5, "rgba(0,0,0,.08)");
  grd.addColorStop(1, "rgba(0,0,0,.2)");
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
}

function drawRug(g, s, r) {
  drawWood(g, s, r);
  // 旧地毯：砖红偏灰，不用饱和的玫红，不然整间屋就只剩下一块粉
  g.fillStyle = `hsla(${8 + r() * 6},${26 + r() * 6}%,${52 + r() * 3}%,.95)`;
  g.fillRect(0, 0, s, s);
  // 编织纹，不画边——边由整块地毯的外轮廓负责
  g.strokeStyle = "rgba(255,255,255,.09)"; g.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const y = i * s / 6 + .8;
    g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke();
  }
  g.strokeStyle = "rgba(120,52,40,.10)";
  for (let i = 0; i < 5; i++) {
    const x = i * s / 5 + .8;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.stroke();
  }
}

function drawMat(g, s, r) {
  drawWood(g, s, r);
  g.fillStyle = "rgba(96,132,74,.85)";
  g.beginPath(); g.ellipse(s / 2, s / 2, s * .42, s * .3, 0, 0, 7); g.fill();
  g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 1.2;
  g.beginPath(); g.ellipse(s / 2, s / 2, s * .26, s * .18, 0, 0, 7); g.stroke();
}

const PAINTERS = {
  [TI.GRASS]: [drawGrass, 7],
  [TI.PATH]: [drawPath, 5],
  [TI.STONE]: [drawStone, 4],
  [TI.WATER]: [drawWater, 5],
  [TI.SAND]: [drawSand, 3],
  [TI.FIELD]: [drawField, 4],
  [TI.FLOWER]: [drawFlower, 5],
  [TI.WOOD]: [drawWood, 4],
  [TI.WALL]: [drawWall, 3],
  [TI.RUG]: [drawRug, 2],
  [TI.MAT]: [drawMat, 2],
  [TI.WEED]: [drawWeed, 6],
  [TI.WEED_EDGE]: [drawWeedEdge, 5]
};

let VARIANTS = null;
function buildVariants() {
  if (VARIANTS) return VARIANTS;
  VARIANTS = {};
  for (const k in PAINTERS) {
    const [fn, n] = PAINTERS[k];
    const arr = [];
    for (let i = 0; i < n; i++) {
      const c = document.createElement("canvas");
      c.width = c.height = PX;
      fn(c.getContext("2d"), PX, rng(1301 + i * 977 + (+k) * 313));
      arr.push(c);
    }
    VARIANTS[k] = arr;
  }
  return VARIANTS;
}

/* =========================================================
   把一张地图画成 canvas
   ========================================================= */
export function paintMap(m) {
  const V = buildVariants();
  const c = document.createElement("canvas");
  c.width = m.w * PX;
  c.height = m.h * PX;
  const g = c.getContext("2d");

  // 底：全铺草，避免任何缝
  const gp = V[TI.GRASS];
  g.fillStyle = "#a6c47e";
  g.fillRect(0, 0, c.width, c.height);

  for (let tz = 0; tz < m.h; tz++) {
    for (let tx = 0; tx < m.w; tx++) {
      const t = m.tiles[tz * m.w + tx];
      const pool = V[t] || gp;
      const v = pool[hash(tx, tz) % pool.length];
      g.drawImage(v, tx * PX, tz * PX);
    }
  }

  // 水面：整片统一画波纹，跨着格子走
  waterDetail(g, m);
  // 荒地里的高草：也是整片画，不按格子切
  weedDetail(g, m);
  // 边缘过渡：草地和硬地面/水交界处，让草往里吃掉一点点
  softEdges(g, m);
  // 水岸
  waterEdge(g, m);
  // 室内：墙根影子 + 踢脚线（外墙、隔断墙都算）
  wallEdges(g, m);
  // 家具
  m.deco.forEach(d => drawDeco(g, d));

  return c;
}

const SOFT = new Set([TI.PATH, TI.STONE, TI.WATER, TI.FIELD, TI.WOOD, TI.RUG, TI.MAT, TI.SAND]);
const HHARD = new Set([TI.PATH, TI.STONE, TI.WATER, TI.WOOD, TI.WALL, TI.RUG, TI.MAT]);

function softEdges(g, m) {
  g.lineCap = "round";
  for (let tz = 0; tz < m.h; tz++) {
    for (let tx = 0; tx < m.w; tx++) {
      const t = m.tiles[tz * m.w + tx];
      if (t !== TI.GRASS && t !== TI.FLOWER && t !== TI.WEED) continue;
      const x = tx * PX, y = tz * PX;
      const r = rng(hash(tx, tz));
      const sides = [
        [0, -1, 0, 0, PX, 3],   // 上
        [0, 1, 0, PX - 3, PX, 3], // 下
        [-1, 0, 0, 0, 3, PX],   // 左
        [1, 0, PX - 3, 0, 3, PX]  // 右
      ];
      for (const [dx, dz, bx, by, bw, bh] of sides) {
        if (!SOFT.has(tileAt(m, tx + dx, tz + dz))) continue;
        // 沿这条边撒 4 撮草，盖过界一条
        for (let i = 0; i < 4; i++) {
          const along = (i + .2 + r() * .6) * PX / 4;
          const cx = bx + along * (bw / PX);
          const cy = by + along * (bh / PX);
          const jitterX = bw > bh ? 0 : (r() - .5) * 2;
          const jitterY = bh > bw ? 0 : (r() - .5) * 2;
          g.strokeStyle = `hsla(${84 + r() * 8},42%,${52 + r() * 14}%,${.6 + r() * .3})`;
          g.lineWidth = 1.6 + r() * 1.2;
          g.beginPath();
          g.moveTo(cx + jitterX, cy + jitterY);
          g.lineTo(cx + jitterX + (bx === 0 ? 3 : (bx > PX - 4 ? -3 : (r() - .5) * 3)),
                    cy + jitterY + (by === 0 ? 3 : (by > PX - 4 ? -3 : (r() - .5) * 3)));
          g.stroke();
        }
      }
    }
  }
}

function waterDetail(g, m) {
  const R = rng(4711);
  g.save();
  g.lineCap = "round";
  for (let tz = 0; tz < m.h; tz++) {
    for (let tx = 0; tx < m.w; tx++) {
      if (m.tiles[tz * m.w + tx] !== TI.WATER) continue;
      const x = tx * PX, y = tz * PX;
      const n = 1 + Math.floor(R() * 2);
      for (let i = 0; i < n; i++) {
        const sx = x - PX * .4 + R() * PX * .8;
        const sy = y + 4 + R() * (PX - 8);
        const len = PX * (.5 + R() * .9);
        g.strokeStyle = `rgba(255,255,255,${.1 + R() * .16})`;
        g.lineWidth = 1.2 + R() * 1.1;
        g.beginPath();
        g.moveTo(sx, sy);
        g.quadraticCurveTo(sx + len * .5, sy - 2.2, sx + len, sy);
        g.stroke();
      }
    }
  }
  g.restore();
}

function waterEdge(g, m) {
  for (let tz = 0; tz < m.h; tz++) {
    for (let tx = 0; tx < m.w; tx++) {
      if (m.tiles[tz * m.w + tx] !== TI.WATER) continue;
      const x = tx * PX, y = tz * PX;
      const nb = [
        [0, -1, 0, 0, PX, 4],
        [0, 1, 0, PX - 4, PX, 4],
        [-1, 0, 0, 0, 4, PX],
        [1, 0, PX - 4, 0, 4, PX]
      ];
      for (const [dx, dz, bx, by, bw, bh] of nb) {
        if (tileAt(m, tx + dx, tz + dz) === TI.WATER) continue;
        // 贴岸的水色略深
        g.fillStyle = "rgba(70,136,146,.34)";
        g.fillRect(x + bx, y + by, bw, bh);
        // 一条窄浪花
        g.fillStyle = "rgba(255,255,255,.62)";
        g.fillRect(x + bx + (bw < PX ? 3 : 0), y + by + (bh < PX ? 3 : 0),
                   bw < PX ? 2.4 : bw, bh < PX ? 2.4 : bh);
      }
    }
  }
}

/* =========================================================
   室内家具（直接画进地面贴图，俯视看是平铺的）
   ========================================================= */
function roundRect(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y);
  g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr);
  g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr);
  g.quadraticCurveTo(x, y, x + rr, y);
  g.closePath();
}

function drawDeco(g, d) {
  const x = d.tx * PX, y = d.tz * PX;
  const w = d.tw * PX, h = d.th * PX;
  const r = rng(hash(d.tx * 7, d.tz * 13));
  g.save();
  switch (d.kind) {
    case "bed": {
      const rr = Math.min(w, h) * .07;
      // 落地影
      g.fillStyle = "rgba(46,28,14,.26)";
      roundRect(g, x + 2.5, y + 4, w - 4, h - 5, rr); g.fill();
      // 床架
      g.fillStyle = "#7d5636";
      roundRect(g, x + .5, y + .5, w - 1, h - 1, rr + 1); g.fill();
      g.strokeStyle = "rgba(48,28,14,.5)"; g.lineWidth = 1.2;
      roundRect(g, x + 1, y + 1, w - 2, h - 2, rr + 1); g.stroke();
      // 床头板（上沿）
      g.fillStyle = "#8f6440";
      roundRect(g, x + 2, y + 2, w - 4, h * .11, 2); g.fill();
      g.fillStyle = "rgba(255,236,206,.16)";
      g.fillRect(x + 3, y + 2.6, w - 6, 1);
      // 床垫
      g.fillStyle = "#f6efe1";
      roundRect(g, x + 3.5, y + h * .12, w - 7, h - h * .165, rr); g.fill();
      g.strokeStyle = "rgba(150,124,96,.35)"; g.lineWidth = 1;
      roundRect(g, x + 3.5, y + h * .12, w - 7, h - h * .165, rr); g.stroke();
      // 枕头
      g.fillStyle = "rgba(160,132,100,.18)";
      roundRect(g, x + w * .16, y + h * .16, w * .68, h * .17, 3); g.fill();
      g.fillStyle = "#fffdf7";
      roundRect(g, x + w * .15, y + h * .15, w * .7, h * .17, 3.4); g.fill();
      g.strokeStyle = "rgba(178,152,120,.4)"; g.lineWidth = 1;
      roundRect(g, x + w * .15, y + h * .15, w * .7, h * .17, 3.4); g.stroke();
      // 被子（盖住下半床）
      const by = y + h * .36, bh = h * .58;
      g.fillStyle = "rgba(140,52,48,.2)";
      roundRect(g, x + 3.5, by + 2, w - 7, bh, 3); g.fill();
      g.fillStyle = "#cd675c";
      roundRect(g, x + 3.5, by, w - 7, bh, 3); g.fill();
      // 翻起来的被口
      g.fillStyle = "#e69383";
      roundRect(g, x + 3.5, by, w - 7, Math.max(4, h * .07), 3); g.fill();
      g.fillStyle = "rgba(255,255,255,.3)";
      g.fillRect(x + 5, by + Math.max(4, h * .07) - 1, w - 10, .9);
      // 被面折叠的竖纹
      g.strokeStyle = "rgba(255,255,255,.14)"; g.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        const bx = x + 3.5 + (w - 7) * i / 3;
        g.beginPath(); g.moveTo(bx, by + h * .09); g.lineTo(bx, by + bh - 2); g.stroke();
      }
      break;
    }
    case "table": {
      g.fillStyle = "rgba(46,28,14,.24)";
      roundRect(g, x + 3, y + 4, w - 4, h - 4, 3); g.fill();
      g.fillStyle = "#b98a57";
      roundRect(g, x + .5, y + .5, w - 1, h - 1, 3); g.fill();
      g.fillStyle = "rgba(255,240,214,.14)";
      g.fillRect(x + 2, y + 1.4, w - 4, 1.4);
      // 木纹
      g.strokeStyle = "rgba(122,84,46,.16)"; g.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const yy = y + 4 + r() * (h - 8);
        g.beginPath(); g.moveTo(x + 2, yy); g.lineTo(x + w - 2, yy + (r() - .5) * 2); g.stroke();
      }
      g.strokeStyle = "rgba(96,60,32,.5)"; g.lineWidth = 1.2;
      roundRect(g, x + .8, y + .8, w - 1.6, h - 1.6, 3); g.stroke();
      // 杯子和一只小碟
      g.fillStyle = "rgba(60,40,20,.18)";
      g.beginPath(); g.ellipse(x + w * .34, y + h * .58, 4.6, 3.8, 0, 0, 7); g.fill();
      g.fillStyle = "#f6f2e6";
      g.beginPath(); g.arc(x + w * .34, y + h * .48, 4.2, 0, 7); g.fill();
      g.fillStyle = "#8a5a34";
      g.beginPath(); g.arc(x + w * .34, y + h * .48, 2.6, 0, 7); g.fill();
      g.fillStyle = "#e8dcc4";
      g.beginPath(); g.arc(x + w * .68, y + h * .52, 3.6, 0, 7); g.fill();
      g.fillStyle = "#c07a4e";
      g.beginPath(); g.arc(x + w * .68, y + h * .52, 2.4, 0, 7); g.fill();
      break;
    }
    case "counter": {
      g.fillStyle = "rgba(50,34,20,.24)";
      g.fillRect(x + 2, y + 3, w - 2, h - 3);
      g.fillStyle = "#a9793f"; g.fillRect(x, y, w, h - 2);
      g.fillStyle = "rgba(255,255,255,.16)"; g.fillRect(x, y, w, 4);
      g.strokeStyle = "rgba(80,54,28,.5)"; g.lineWidth = 1.2;
      g.strokeRect(.6, .6, w - 1.2, h - 3.2);
      for (let i = 1; i < d.tw; i++) {
        g.beginPath(); g.moveTo(x + i * PX, y); g.lineTo(x + i * PX, y + h - 2); g.stroke();
      }
      break;
    }
    case "shelf": {
      g.fillStyle = "rgba(50,34,20,.24)";
      g.fillRect(x + 2, y + 3, w - 2, h - 3);
      g.fillStyle = "#7d5836"; g.fillRect(x, y, w, h - 2);
      const cols = ["#e9c46a", "#e07a5f", "#81b29a", "#9ec1e0", "#f2e6cd"];
      for (let i = 0; i < d.tw * 3; i++) {
        g.fillStyle = cols[Math.floor(r() * cols.length)];
        g.fillRect(x + 3 + (i % (d.tw * 3)) * (w - 6) / (d.tw * 3), y + 3 + (i % 2) * (h * .38),
                   4 + r() * 3, h * .3);
      }
      break;
    }
    case "plant": {
      g.fillStyle = "rgba(50,34,20,.2)";
      g.beginPath(); g.ellipse(x + PX / 2 + 2, y + PX / 2 + 3, PX * .3, PX * .2, 0, 0, 7); g.fill();
      g.fillStyle = "#b1714a";
      g.beginPath(); g.ellipse(x + PX / 2, y + PX / 2, PX * .26, PX * .22, 0, 0, 7); g.fill();
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * 6.283;
        g.fillStyle = `hsl(${98 + r() * 20},${40 + r() * 18}%,${34 + r() * 14}%)`;
        g.beginPath();
        g.ellipse(x + PX / 2 + Math.cos(a) * PX * .3, y + PX / 2 + Math.sin(a) * PX * .26,
                  PX * .2, PX * .13, a, 0, 7);
        g.fill();
      }
      break;
    }
    case "board": {
      // 公告板：钉在墙上的一块软木，上面按着几张纸
      g.fillStyle = "rgba(40,26,12,.28)";
      roundRect(g, x + 2, y + 4, w - 3, h - 4, 2); g.fill();
      g.fillStyle = "#8a5f3c";
      roundRect(g, x, y, w, h - 2, 3); g.fill();
      g.fillStyle = "#c9a273";
      roundRect(g, x + 2.5, y + 2.5, w - 5, h - 7, 2); g.fill();
      // 钉着的纸
      const papers = Math.max(2, Math.round(d.tw * 1.6));
      for (let i = 0; i < papers; i++) {
        const pw = w / papers * .62, ph = (h - 8) * (.5 + r() * .3);
        const px = x + 4 + i * (w - 8) / papers + r() * 2;
        g.fillStyle = "rgba(60,40,20,.20)";
        g.fillRect(px + 1, y + 4 + (h - 10) * r() * .2 + 1, pw, ph);
        g.fillStyle = `hsl(${40 + r() * 12},${22 + r() * 16}%,${92 + r() * 5}%)`;
        g.fillRect(px, y + 4 + (h - 10) * r() * .2, pw, ph);
        g.strokeStyle = "rgba(120,96,66,.45)"; g.lineWidth = .8;
        g.strokeRect(px + .4, y + 4.4 + (h - 10) * r() * .2, pw - .8, ph - .8);
        g.fillStyle = "rgba(90,70,48,.3)";
        for (let k = 0; k < 3; k++) g.fillRect(px + 2, y + 8 + k * 4, pw - 4, .9);
        // 图钉
        g.fillStyle = i % 2 ? "#c85a4e" : "#5f8a6a";
        g.beginPath(); g.arc(px + pw / 2, y + 5.5, 1.8, 0, 7); g.fill();
      }
      break;
    }
    case "bench": {
      g.fillStyle = "rgba(46,28,14,.22)";
      roundRect(g, x + 3, y + 5, w - 3, h - 5, 3); g.fill();
      // 靠背
      g.fillStyle = "#a87848";
      roundRect(g, x + 1, y + 1, w - 2, h * .34, 2.5); g.fill();
      // 坐板
      g.fillStyle = "#c09063";
      roundRect(g, x + 1, y + h * .36, w - 2, h * .5, 2.5); g.fill();
      g.fillStyle = "rgba(255,244,224,.2)";
      g.fillRect(x + 3, y + h * .38, w - 6, 1.4);
      g.strokeStyle = "rgba(96,62,32,.42)"; g.lineWidth = 1.1;
      roundRect(g, x + 1.4, y + 1.4, w - 2.8, h - 3, 2.5); g.stroke();
      // 板缝
      for (let i = 1; i < Math.max(2, d.tw); i++) {
        g.beginPath(); g.moveTo(x + i * PX, y + 2); g.lineTo(x + i * PX, y + h - 2); g.stroke();
      }
      break;
    }
    case "crate": {
      g.fillStyle = "rgba(46,28,14,.24)";
      roundRect(g, x + 3, y + 4, w - 3, h - 4, 2); g.fill();
      g.fillStyle = "#b78a54";
      roundRect(g, x + 1, y + 1, w - 2, h - 2, 2); g.fill();
      g.fillStyle = "rgba(255,240,210,.14)";
      g.fillRect(x + 2, y + 2, w - 4, 2);
      g.strokeStyle = "rgba(96,62,32,.55)"; g.lineWidth = 1.2;
      roundRect(g, x + 1.4, y + 1.4, w - 2.8, h - 2.8, 2); g.stroke();
      // 斜撑
      g.beginPath();
      g.moveTo(x + 2.5, y + 2.5); g.lineTo(x + w - 2.5, y + h - 2.5);
      g.moveTo(x + w - 2.5, y + 2.5); g.lineTo(x + 2.5, y + h - 2.5);
      g.stroke();
      break;
    }
    case "stove": {
      const rr = Math.min(w, h) * .1;
      g.fillStyle = "rgba(40,26,12,.28)";
      roundRect(g, x + 2, y + 3, w - 3, h - 3, rr); g.fill();
      g.fillStyle = "#6f6c64";
      roundRect(g, x + .5, y + .5, w - 1, h - 1, rr); g.fill();
      g.fillStyle = "#8b887e";
      roundRect(g, x + 2, y + 2, w - 4, h - 5, rr); g.fill();
      // 两个灶眼
      for (let i = 0; i < 2; i++) {
        const cy = y + h * (.27 + i * .34);
        g.fillStyle = "#3f3c36";
        g.beginPath(); g.arc(x + w / 2, cy, Math.min(w, h) * .21, 0, 7); g.fill();
        g.strokeStyle = "rgba(255,255,255,.14)"; g.lineWidth = 1;
        g.beginPath(); g.arc(x + w / 2, cy, Math.min(w, h) * .15, 0, 7); g.stroke();
        g.fillStyle = i === 0 ? "#e8a24a" : "#5b574f";
        g.beginPath(); g.arc(x + w / 2, cy, Math.min(w, h) * .08, 0, 7); g.fill();
      }
      // 下沿的把手
      g.fillStyle = "#4a4640";
      g.fillRect(x + 4, y + h - 4, w - 8, 2.4);
      break;
    }
  }
  g.restore();
}

/* 墙根：地板贴墙的那一侧压一道影 + 一条踢脚线。
   外墙、隔断墙共用这一套画法 —— 房间怎么隔，接缝都对得上 */
function wallEdges(g, m) {
  const FLOOR = new Set([TI.WOOD, TI.RUG, TI.MAT]);
  const D = 16;                 // 影子向内延伸多少像素
  const isW = (x, z) => tileAt(m, x, z) === TI.WALL;
  for (let tz = 0; tz < m.h; tz++) {
    for (let tx = 0; tx < m.w; tx++) {
      if (!FLOOR.has(m.tiles[tz * m.w + tx])) continue;
      const x = tx * PX, y = tz * PX;
      // 上：墙面在本地块北侧
      if (isW(tx, tz - 1)) {
        const gd = g.createLinearGradient(0, y, 0, y + D);
        gd.addColorStop(0, "rgba(24,13,5,.42)");
        gd.addColorStop(1, "rgba(24,13,5,0)");
        g.fillStyle = gd; g.fillRect(x, y, PX, D);
        g.fillStyle = "rgba(58,34,16,.55)"; g.fillRect(x, y, PX, 4);
        g.fillStyle = "rgba(226,196,152,.22)"; g.fillRect(x, y + 4, PX, 1);
      }
      if (isW(tx, tz + 1)) {
        const gd = g.createLinearGradient(0, y + PX, 0, y + PX - D);
        gd.addColorStop(0, "rgba(24,13,5,.42)");
        gd.addColorStop(1, "rgba(24,13,5,0)");
        g.fillStyle = gd; g.fillRect(x, y + PX - D, PX, D);
        g.fillStyle = "rgba(58,34,16,.55)"; g.fillRect(x, y + PX - 4, PX, 4);
        g.fillStyle = "rgba(226,196,152,.22)"; g.fillRect(x, y + PX - 5, PX, 1);
      }
      if (isW(tx - 1, tz)) {
        const gd = g.createLinearGradient(x, 0, x + D, 0);
        gd.addColorStop(0, "rgba(24,13,5,.42)");
        gd.addColorStop(1, "rgba(24,13,5,0)");
        g.fillStyle = gd; g.fillRect(x, y, D, PX);
        g.fillStyle = "rgba(58,34,16,.55)"; g.fillRect(x, y, 4, PX);
        g.fillStyle = "rgba(226,196,152,.22)"; g.fillRect(x + 4, y, 1, PX);
      }
      if (isW(tx + 1, tz)) {
        const gd = g.createLinearGradient(x + PX, 0, x + PX - D, 0);
        gd.addColorStop(0, "rgba(24,13,5,.42)");
        gd.addColorStop(1, "rgba(24,13,5,0)");
        g.fillStyle = gd; g.fillRect(x + PX - D, y, D, PX);
        g.fillStyle = "rgba(58,34,16,.55)"; g.fillRect(x + PX - 4, y, 4, PX);
        g.fillStyle = "rgba(226,196,152,.22)"; g.fillRect(x + PX - 5, y, 1, PX);
      }
    }
  }
}

/* =========================================================
   村庄地图
   ========================================================= */
function fillEll(m, cx, cz, rx, rz, type) {
  for (let tz = Math.floor(cz - rz); tz <= Math.ceil(cz + rz); tz++) {
    for (let tx = Math.floor(cx - rx); tx <= Math.ceil(cx + rx); tx++) {
      const dx = (tx + .5 - cx) / rx, dz = (tz + .5 - cz) / rz;
      if (dx * dx + dz * dz <= 1) setTile(m, tx, tz, type);
    }
  }
}
function ring(m, cx, cz, rx, rz, type) {
  for (let tz = Math.floor(cz - rz - 2); tz <= Math.ceil(cz + rz + 2); tz++) {
    for (let tx = Math.floor(cx - rx - 2); tx <= Math.ceil(cx + rx + 2); tx++) {
      const dx = (tx + .5 - cx) / rx, dz = (tz + .5 - cz) / rz;
      const d = dx * dx + dz * dz;
      if (d <= 1.34 && d >= .86 && m.tiles[tz * m.w + tx] === TI.GRASS) setTile(m, tx, tz, type);
    }
  }
}
function rect(m, tx0, tz0, tw, th, type) {
  for (let tz = tz0; tz < tz0 + th; tz++)
    for (let tx = tx0; tx < tx0 + tw; tx++) setTile(m, tx, tz, type);
}
// 一条自然抖动的路
function road(m, x0, z0, x1, z1, w) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    const cx = x0 + (x1 - x0) * t, cz = z0 + (z1 - z0) * t;
    for (let dz = -w; dz <= w; dz++) {
      for (let dx = -w; dx <= w; dx++) {
        const d = Math.hypot(dx, dz);
        if (d > w + .2) continue;
        const jitter = Math.sin((cx + dx) * 1.7 + (cz + dz) * 2.3) * .35;
        if (d <= w - .4 + jitter) setTile(m, Math.round(cx + dx), Math.round(cz + dz), TI.PATH);
      }
    }
  }
}

export const VILLAGE = (() => {
  const m = makeMap(88, 68, "奶家村", -44, -34);
  m.tiles.fill(TI.GRASS);

  // ---- 水塘（西北）----
  fillEll(m, 17, 31, 9.4, 6.2, TI.WATER);

  // ---- 广场与路 ----
  fillEll(m, 44, 34, 8.5, 6.5, TI.STONE);
  road(m, 44, 1, 44, 66, 1.6);        // 主路（南北）
  road(m, 28, 35, 84, 35, 1);         // 横路（东西，西头让开水塘）
  road(m, 44, 35, 28.5, 35, 1);       // 往水塘（到岸边就停，别铺进水里）
  road(m, 36, 47, 36, 58, 1);         // 自己家门前
  road(m, 59, 47, 59, 58, 1);         // 杂货铺门前
  // 北边一条横街，把主路和两户人家连起来（原来是断头路，走过去像荒地）
  road(m, 24, 22, 64, 22, 1);
  road(m, 24, 22, 24, 34, 1);
  road(m, 64, 22, 64, 34, 1);
  road(m, 44, 20, 44, 22, 1);

  // ---- 我家那片地 ----
  // 这块地的"土"是 farm.js 里一张贴图铺出来的（荒地干土 → 锄开压深），
  // 地图这边只要保证底子是干净的草，别在格子级别混色 —— 一格一个色就成棋盘了。
  // 只在地边留一圈高草，让几撮草从土边探出来。
  rect(m, 12, 44, 12, 9, TI.GRASS);
  {
    const fr = rng(7717);
    for (let tz = 44; tz < 53; tz++) {
      for (let tx = 12; tx < 24; tx++) {
        const ring = Math.min(tx - 12, 23 - tx, tz - 44, 52 - tz);
        if (ring > 1) continue;
        if (fr() < (ring === 0 ? .55 : .22)) setTile(m, tx, tz, TI.WEED);
      }
    }
  }
  // 边别像用尺子画出来的：往外散几格杂草，越远越稀
  {
    const wr = rng(9091);
    for (let tz = 41; tz <= 56; tz++) {
      for (let tx = 9; tx <= 27; tx++) {
        if (tx >= 12 && tx < 24 && tz >= 44 && tz < 53) continue;
        const out = Math.max(12 - tx, tx - 23, 44 - tz, tz - 52);
        if (out <= 0) continue;
        if (wr() > .62 / (out + .7)) continue;
        if (tileAt(m, tx, tz) !== TI.GRASS) continue;
        setTile(m, tx, tz, TI.WEED_EDGE);
      }
    }
  }

  // ---- 花田 ----
  fillEll(m, 68, 54, 6.5, 5, TI.FLOWER);
  fillEll(m, 30, 52, 4.5, 3.5, TI.FLOWER);

  // ---- 棋爷的小公园（广场东边）----
  // 一块石板小院，中间一张石桌，是他天天下棋的地方。
  // 铺成 STONE 还有个好处：buildProps 的随机树只会长在草地上，不会长进院子。
  road(m, 52, 42, 55, 42, .8);
  fillEll(m, 58.5, 42, 4.3, 3.5, TI.STONE);
  {
    // 院子边上点几处花，别是个光秃秃的水泥地
    const pr = rng(3355);
    for (let tz = 38; tz <= 46; tz++) {
      for (let tx = 54; tx <= 63; tx++) {
        if (tileAt(m, tx, tz) !== TI.STONE) continue;
        const d = Math.hypot((tx + .5 - 58.5) / 4.3, (tz + .5 - 42) / 3.5);
        if (d < .62 || pr() > .16) continue;
        setTile(m, tx, tz, TI.FLOWER);
      }
    }
  }

  // ---- 房屋占地（画在上层、挡住地砖）----
  // 自己家（5×4 格，中心 -8.5, 19.5）
  rect(m, 34, 52, 5, 4, TI.WOOD);
  // 小七杂货铺（中心 15.5, 17.5）
  rect(m, 57, 50, 5, 4, TI.WOOD);
  // 两位邻居
  rect(m, 22, 18, 5, 4, TI.WOOD);
  rect(m, 61, 18, 5, 4, TI.WOOD);

  // 屋子底下的格子不能走（房子本体在 3D 里另画）
  const noWalk = (tx, tz, tw, th) => {
    for (let z = tz; z < tz + th; z++) for (let x = tx; x < tx + tw; x++) setSolid(m, x, z, 1);
  };
  noWalk(34, 52, 5, 4);
  noWalk(57, 50, 5, 4);
  noWalk(22, 18, 5, 4);
  noWalk(61, 18, 5, 4);

  // ---- 门 ----
  mark(m, 36, 56, { kind: "door", to: "house", label: "进屋里" });
  mark(m, 59, 54, { kind: "door", to: "shop", label: "进杂货铺" });
  mark(m, 24, 22, { kind: "door", to: "archive", label: "进村史馆" });
  mark(m, 63, 22, { kind: "door", to: "station", label: "进奶察局" });

  // ---- 招牌 ----
  mark(m, 46, 40, { kind: "sign", text: "奶家村　·　往北是树林，往西是水塘" });
  // 井：站边上按 E 也能灌水壶
  mark(m, 45, 37, { kind: "well", label: "打水" });
  mark(m, 45, 36, { kind: "well", label: "打水" });
  mark(m, 46, 37, { kind: "well", label: "打水" });

  // ---- 水塘里不能走 ----
  for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] === TI.WATER) m.solid[i] = 1;

  // ---- 边界 ----
  for (let tz = 0; tz < m.h; tz++)
    for (let tx = 0; tx < m.w; tx++)
      if (tx < 1 || tz < 1 || tx > m.w - 2 || tz > m.h - 2) setSolid(m, tx, tz, 1);

  return m;
})();

/* =========================================================
   室内地图
   ========================================================= */
// 室内：房间本体 vw×vh，外面裹一圈厚厚的墙。
// 墙为什么这么厚？因为相机视野比房间大（竖屏尤其夸张），墙薄了就会看到房间外的空白。
function indoorMap(vw, vh, name, exitTx) {
  const W = 34, H = 32;
  const x0 = Math.floor((W - vw) / 2), z0 = Math.floor((H - vh) / 2);
  const m = makeMap(W, H, name, -W / 2, -H / 2);
  m.indoor = true;
  m.tiles.fill(TI.WALL);
  m.solid.fill(1);
  m.room = { x0, z0, w: vw, h: vh, exitTx };

  // 房间地板
  for (let tz = z0; tz < z0 + vh; tz++) {
    for (let tx = x0; tx < x0 + vw; tx++) {
      setTile(m, tx, tz, TI.WOOD);
      setSolid(m, tx, tz, 0);
    }
  }
  // 门口：房间南沿三格，铺门垫
  for (let i = -1; i <= 1; i++) {
    const tx = x0 + exitTx + i;
    setTile(m, tx, z0 + vh - 1, TI.MAT);
    mark(m, tx, z0 + vh - 1, { kind: "exit", label: "出门" });
  }
  return m;
}

export const HOUSE = (() => {
  const m = indoorMap(15, 11, "屋里", 11);
  const R = m.room;
  const mx = x => R.x0 + x, mz = z => R.z0 + z;
  const solidBox = (x, z, w, h) => {
    for (let dz = 0; dz < h; dz++) for (let dx = 0; dx < w; dx++) setSolid(m, mx(x + dx), mz(z + dz), 1);
  };
  // 隔断：西边卧室（x 0~6）| 东边客厅（x 8~14），x=7 竖一列墙，南侧留两格门洞
  for (let z = 0; z < R.h; z++) {
    if (z === 8 || z === 9) continue;          // 门洞
    setTile(m, mx(7), mz(z), TI.WALL);
    setSolid(m, mx(7), mz(z), 1);
  }

  // ---- 卧室 ----
  for (let z = 2; z <= 4; z++) for (let x = 5; x <= 6; x++) setTile(m, mx(x), mz(z), TI.RUG);
  m.deco.push({ tx: mx(1), tz: mz(1), tw: 3, th: 3, kind: "bed" });
  solidBox(1, 1, 3, 3);
  m.deco.push({ tx: mx(1), tz: mz(9), tw: 1, th: 1, kind: "plant" });
  solidBox(1, 9, 1, 1);
  // 床边那两格：站在床前按 E 睡觉
  mark(m, mx(2), mz(4), { kind: "sleep", label: "睡一觉" });
  mark(m, mx(3), mz(4), { kind: "sleep", label: "睡一觉" });

  // ---- 客厅 ----
  for (let z = 3; z <= 5; z++) for (let x = 9; x <= 12; x++) setTile(m, mx(x), mz(z), TI.RUG);
  m.deco.push({ tx: mx(10), tz: mz(3), tw: 2, th: 1, kind: "table" });
  solidBox(10, 3, 2, 1);
  m.deco.push({ tx: mx(13), tz: mz(1), tw: 1, th: 2, kind: "stove" });
  solidBox(13, 1, 1, 2);
  m.deco.push({ tx: mx(13), tz: mz(9), tw: 1, th: 1, kind: "plant" });
  solidBox(13, 9, 1, 1);
  // 灶台前那一格：做点吃的，补体力
  [13].forEach(x => mark(m, mx(x), mz(3), { kind: "cook", label: "做点吃的" }));
  // 分区（只用来显示"现在在哪间屋"，x 是房间内坐标）
  m.zones = [{ x0: 0, x1: 6, name: "卧室" }, { x0: 8, x1: 14, name: "客厅" }];
  return m;
})();

export const SHOP = (() => {
  const m = indoorMap(14, 9, "小七杂货摊", 2);
  const R = m.room;
  const mx = x => R.x0 + x, mz = z => R.z0 + z;
  const solidBox = (x, z, w, h) => {
    for (let dz = 0; dz < h; dz++) for (let dx = 0; dx < w; dx++) setSolid(m, mx(x + dx), mz(z + dz), 1);
  };
  // 隔断：前面售货区（x 0~8）| 后面小库房（x 10~13），x=9 竖一列墙，南侧留两格门洞
  for (let z = 0; z < R.h; z++) {
    if (z === 6 || z === 7) continue;
    setTile(m, mx(9), mz(z), TI.WALL);
    setSolid(m, mx(9), mz(z), 1);
  }

  // ---- 售货区 ----
  m.deco.push({ tx: mx(3), tz: mz(3), tw: 5, th: 1, kind: "counter" });
  solidBox(3, 3, 5, 1);
  m.deco.push({ tx: mx(1), tz: mz(1), tw: 3, th: 1, kind: "shelf" });
  solidBox(1, 1, 3, 1);
  m.deco.push({ tx: mx(5), tz: mz(1), tw: 4, th: 1, kind: "shelf" });
  solidBox(5, 1, 4, 1);
  m.deco.push({ tx: mx(1), tz: mz(7), tw: 1, th: 1, kind: "plant" });
  solidBox(1, 7, 1, 1);
  // 站在柜台前按 E 买东西
  [4, 5, 6].forEach(x => mark(m, mx(x), mz(4), { kind: "shop", label: "买东西 / 卖收成" }));

  // ---- 后库 ----
  m.deco.push({ tx: mx(10), tz: mz(1), tw: 3, th: 1, kind: "shelf" });
  solidBox(10, 1, 3, 1);
  m.deco.push({ tx: mx(10), tz: mz(4), tw: 3, th: 1, kind: "shelf" });
  solidBox(10, 4, 3, 1);
  m.deco.push({ tx: mx(13), tz: mz(6), tw: 1, th: 1, kind: "plant" });
  solidBox(13, 6, 1, 1);
  m.zones = [{ x0: 0, x1: 8, name: "店面" }, { x0: 10, x1: 13, name: "后库" }];
  return m;
})();

/* ---- 奶察局：前厅值班 + 后面档案室 ---- */
export const STATION = (() => {
  const m = indoorMap(14, 9, "奶察局", 2);
  const R = m.room;
  const mx = x => R.x0 + x, mz = z => R.z0 + z;
  const solidBox = (x, z, w, h) => {
    for (let dz = 0; dz < h; dz++) for (let dx = 0; dx < w; dx++) setSolid(m, mx(x + dx), mz(z + dz), 1);
  };
  // 隔断：前厅（x 0~8）| 档案室（x 10~13），x=9 竖一列墙，南侧留门洞
  for (let z = 0; z < R.h; z++) {
    if (z === 6 || z === 7) continue;
    setTile(m, mx(9), mz(z), TI.WALL);
    setSolid(m, mx(9), mz(z), 1);
  }

  // ---- 前厅 ----
  // 值班台
  m.deco.push({ tx: mx(2), tz: mz(3), tw: 5, th: 1, kind: "counter" });
  solidBox(2, 3, 5, 1);
  // 值班的奶察站在台子后面
  m.npcs = [{ id: "deskofficer", tx: mx(4), tz: mz(2), face: Math.PI }];
  // 公告板（北墙根）
  m.deco.push({ tx: mx(1), tz: mz(0), tw: 3, th: 1, kind: "board" });
  solidBox(1, 0, 3, 1);
  m.deco.push({ tx: mx(8), tz: mz(7), tw: 1, th: 1, kind: "plant" });
  solidBox(8, 7, 1, 1);
  // 站在台子前：领悬赏 / 交任务
  [2, 3, 4, 5, 6].forEach(x => mark(m, mx(x), mz(4), { kind: "bounty", label: "问问有什么活儿" }));
  // 站在公告板前：看通缉令
  [1, 2, 3].forEach(x => mark(m, mx(x), mz(1), { kind: "board", label: "看看公告" }));

  // ---- 档案室 ----
  m.deco.push({ tx: mx(10), tz: mz(1), tw: 3, th: 1, kind: "shelf" });
  solidBox(10, 1, 3, 1);
  m.deco.push({ tx: mx(13), tz: mz(1), tw: 1, th: 1, kind: "crate" });
  solidBox(13, 1, 1, 1);
  m.deco.push({ tx: mx(10), tz: mz(5), tw: 2, th: 1, kind: "bench" });
  solidBox(10, 5, 2, 1);
  // 坐在长椅上歇一会儿
  [10, 11].forEach(x => mark(m, mx(x), mz(6), { kind: "rest", label: "坐会儿" }));

  m.zones = [{ x0: 0, x1: 8, name: "前厅" }, { x0: 10, x1: 13, name: "档案室" }];
  return m;
})();

/* ---- 村史馆：一间小屋，全是书架和一张大桌子 ---- */
export const ARCHIVE = (() => {
  const m = indoorMap(13, 9, "村史馆", 6);
  const R = m.room;
  const mx = x => R.x0 + x, mz = z => R.z0 + z;
  const solidBox = (x, z, w, h) => {
    for (let dz = 0; dz < h; dz++) for (let dx = 0; dx < w; dx++) setSolid(m, mx(x + dx), mz(z + dz), 1);
  };
  // 三排书架靠着北墙
  m.deco.push({ tx: mx(1), tz: mz(1), tw: 3, th: 1, kind: "shelf" });
  solidBox(1, 1, 3, 1);
  m.deco.push({ tx: mx(5), tz: mz(1), tw: 3, th: 1, kind: "shelf" });
  solidBox(5, 1, 3, 1);
  m.deco.push({ tx: mx(9), tz: mz(1), tw: 3, th: 1, kind: "shelf" });
  solidBox(9, 1, 3, 1);
  // 中间那张长桌，上面摊着村志
  m.deco.push({ tx: mx(5), tz: mz(4), tw: 3, th: 1, kind: "table" });
  solidBox(5, 4, 3, 1);
  m.deco.push({ tx: mx(1), tz: mz(7), tw: 1, th: 1, kind: "plant" });
  solidBox(1, 7, 1, 1);
  m.deco.push({ tx: mx(11), tz: mz(6), tw: 1, th: 1, kind: "crate" });
  solidBox(11, 6, 1, 1);
  // 站在书架前：翻村史
  [1, 2, 3, 5, 6, 7, 9, 10, 11].forEach(x => mark(m, mx(x), mz(2), { kind: "read", label: "翻翻村史" }));
  // 站在长桌前：坐下歇脚
  [5, 6, 7].forEach(x => mark(m, mx(x), mz(5), { kind: "rest", label: "坐下歇脚" }));
  return m;
})();

export const MAPS = { village: VILLAGE, house: HOUSE, shop: SHOP, station: STATION, archive: ARCHIVE };

/* =========================================================
   把地图画成 three 的贴图
   ========================================================= */
export function mapTexture(m, renderer) {
  const c = paintMap(m);
  const t = new T.CanvasTexture(c);
  t.userData = { canvas: c };
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.magFilter = T.LinearFilter;
  t.minFilter = T.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  return t;
}
