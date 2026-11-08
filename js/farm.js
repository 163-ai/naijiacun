// 奶家村 · 大冒险 —— 星露谷式的一天天
// 只管三件事：时间在走、体力在掉、地里在长东西。
import * as T from "three";

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* =========================================================
   配置
   ========================================================= */
// 我家那块地：12 列 × 9 行，每格正好 1 米（和瓦片地图对齐）
// 每一格都是独立的，锄哪格就是哪格
export const PLOT = { x0: -32, z0: 10, cols: 12, rows: 9, ts: 1 };

export const CROPS = {
  radish: { name: "萝卜", icon: "🥕", cost: 20, sell: 44, days: 3, fruit: 0xd9774f, leaf: 0x7fbb62, h: .5 },
  corn:   { name: "玉米", icon: "🌽", cost: 35, sell: 78, days: 4, fruit: 0xf2c14e, leaf: 0x76a94f, h: .78 },
  melon:  { name: "甜瓜", icon: "🍈", cost: 55, sell: 132, days: 5, fruit: 0x8fcc4f, leaf: 0x5c9b3f, h: .6 }
};

const TOOLS = [
  { key: "hoe", name: "锄头", icon: "⛏️" },
  { key: "can", name: "水壶", icon: "💧" },
  { key: "seed:radish", name: "萝卜种子", icon: "🥕" },
  { key: "seed:corn", name: "玉米种子", icon: "🌽" },
  { key: "seed:melon", name: "甜瓜种子", icon: "🍈" }
];

// 一天：6:00 起床 → 次日 2:00 累倒
const T_START = 360, T_END = 1560;
const MIN_PER_SEC = 5;              // 现实 1 秒 = 游戏 5 分钟（一天约 4 分钟）

const COST = { hoe: 4, water: 2, plant: 1, pick: 1 };

/* =========================================================
   状态
   ========================================================= */
export const Farm = {
  day: 1, time: T_START, weather: "sun",
  stamina: 100, maxStamina: 100,
  gold: 120, water: 20, maxWater: 20,
  seeds: { radish: 5, corn: 0, melon: 0 },
  bag: { radish: 0, corn: 0, melon: 0 },
  sel: 0,
  tiles: new Map(),
  tired: false,

  _o: null,
  _soil: null,
  _soilDirty: true,
  _root: null,
};

/* =========================================================
   初始化
   ========================================================= */
Farm.init = function (opts) {
  this._o = opts;
  const world = opts.world;

  this._root = new T.Group();
  world.add(this._root);

  // 泥土：一整张贴图铺在地块上，锄开一格就往那张图上画一格。
  // 原来用 InstancedMesh 的小方块，俯视下每一块都有侧面，看着像一排木箱；
  // 改成贴着地面的平面 + 一张画布，犁沟还能跨着格子连成一条线。
  this._soilCanvas = document.createElement("canvas");
  this._soilCanvas.width = PLOT.cols * SOIL_S;
  this._soilCanvas.height = PLOT.rows * SOIL_S;
  this._soilCtx = this._soilCanvas.getContext("2d");

  this._soilTex = new T.CanvasTexture(this._soilCanvas);
  this._soilTex.colorSpace = T.SRGBColorSpace;
  this._soilTex.anisotropy = 4;

  const mesh = new T.Mesh(
    new T.PlaneGeometry(PLOT.cols * PLOT.ts, PLOT.rows * PLOT.ts),
    new T.MeshBasicMaterial({ map: this._soilTex, transparent: true, depthWrite: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(PLOT.x0 + PLOT.cols * PLOT.ts / 2, .02, PLOT.z0 + PLOT.rows * PLOT.ts / 2);
  mesh.receiveShadow = true;
  this._root.add(mesh);
  this._soil = mesh;

  this.writeSoil();

  this.buildHotbar();
  this.bindInput();
  this.paint();
};

const SOIL_S = 32;          // 一格泥土在地贴图上画多少像素

/* 整块地的底：翻过一遍又放着长草的干土。
   先铺一层底，锄开的格子再压上去 —— 这样「这块地归我」一眼就看得出来，
   不会出现草地里冒出一块褐色方格的怪相（一格一个色就成了棋盘）。 */
Farm.paintFallow = function () {
  const g = this._soilCtx;
  const W = this._soilCanvas.width, H = this._soilCanvas.height;
  let a = 20240517;
  const rnd = () => { a ^= a << 13; a ^= a >>> 17; a ^= a << 5; return ((a >>> 0) % 100000) / 100000; };

  g.save();
  g.clearRect(0, 0, W, H);
  g.fillStyle = "rgb(186,160,124)";
  g.fillRect(0, 0, W, H);

  // 大块的深浅，别是一整片纯色
  for (let i = 0; i < 260; i++) {
    const dark = rnd() < .55;
    g.fillStyle = dark ? `rgba(126,102,70,${.05 + rnd() * .07})` : `rgba(214,190,152,${.04 + rnd() * .06})`;
    g.beginPath();
    g.ellipse(rnd() * W, rnd() * H, 8 + rnd() * 26, 6 + rnd() * 18, rnd() * 3, 0, 7);
    g.fill();
  }
  // 被踩平的干裂纹
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W, y = rnd() * H, len = 6 + rnd() * 18, ang = (rnd() - .5) * .7;
    g.strokeStyle = `rgba(112,88,60,${.10 + rnd() * .12})`;
    g.lineWidth = .8 + rnd() * .7;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke();
  }
  // 小石子
  for (let i = 0; i < 220; i++) {
    const x = rnd() * W, y = rnd() * H, rr = .7 + rnd() * 1.5;
    g.fillStyle = `rgba(${196 + rnd() * 40 | 0},${182 + rnd() * 36 | 0},${158 + rnd() * 30 | 0},${.35 + rnd() * .3})`;
    g.beginPath(); g.ellipse(x, y, rr, rr * .8, rnd() * 3, 0, 7); g.fill();
  }
  // 长回来的几撮干草
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W, y = rnd() * H;
    g.strokeStyle = `rgba(${138 + rnd() * 40 | 0},${146 + rnd() * 30 | 0},${84 + rnd() * 40 | 0},${.35 + rnd() * .3})`;
    g.lineWidth = .9;
    for (let k = 0; k < 3; k++) {
      g.beginPath(); g.moveTo(x + k * 1.6, y + 2); g.lineTo(x + k * 1.6 - 1 + rnd() * 2, y - 2 - rnd() * 3); g.stroke();
    }
  }
  // 四边往草地里化开，别是一张方垫子
  const F = 10;
  const fade = (x0, y0, x1, y1) => {
    g.globalCompositeOperation = "destination-out";
    const gd = g.createLinearGradient(x0, y0, x1, y1);
    gd.addColorStop(0, "rgba(186,160,124,1)"); gd.addColorStop(1, "rgba(186,160,124,0)");
    g.fillStyle = gd; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "source-over";
  };
  fade(0, 0, 0, F); fade(0, H, 0, H - F);
  fade(0, 0, F, 0); fade(W, 0, W - F, 0);
  g.restore();
};

/* 把一格土画到地块的贴图上。
   要的是「翻开的土」，不是一块木地板：
   · 颜色压暗压灰，别用饱和的橙棕
   · 犁沟断成一截一截，深浅不一
   · 贴边的地方往内羽化，让土和荒草之间没有硬边 */
Farm.paintCell = function (t) {
  const g = this._soilCtx;
  const S = SOIL_S;
  const x = t.c * S, y = t.r * S;
  const R = this.tiles;
  const tilled = (c, r) => { const o = R.get(c + "," + r); return !!(o && o.tilled); };

  g.save();
  g.clearRect(x, y, S, S);
  if (!t.tilled) { g.restore(); return; }

  let a = ((t.c + 1) * 2654435761) ^ ((t.r + 1) * 2246822519);
  const rnd = () => { a ^= a << 13; a ^= a >>> 17; a ^= a << 5; return ((a >>> 0) % 100000) / 100000; };

  // 底色
  const base = t.wet ? [92, 71, 50] : [118, 93, 64];
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  g.fillRect(x, y, S, S);

  // 大块的明暗，破掉"一整块纯色"
  for (let i = 0; i < 7; i++) {
    const dark = rnd() < .55;
    g.fillStyle = dark ? `rgba(62,44,26,${.05 + rnd() * .07})` : `rgba(226,204,166,${.04 + rnd() * .06})`;
    g.beginPath();
    g.ellipse(x + rnd() * S, y + rnd() * S, 4 + rnd() * 9, 3 + rnd() * 6, rnd() * 3, 0, 7);
    g.fill();
  }

  // 犁沟：一截一截的短沟，四道横的
  for (let k = 0; k < 4; k++) {
    const yy = y + k * 8 + 4.5 + rnd() * 1.6;
    let xx = x - 2;
    while (xx < x + S) {
      const len = 4 + rnd() * 9;
      g.fillStyle = `rgba(56,38,20,${.14 + rnd() * .16})`;
      g.fillRect(xx, yy, len, 1.5);
      g.fillStyle = `rgba(240,222,186,${.07 + rnd() * .1})`;
      g.fillRect(xx + rnd(), yy + 1.6, len * (.6 + rnd() * .3), .9);
      xx += len + 2.5 + rnd() * 6;
    }
  }

  // 土块：翻上来的坷垃，带一点高光
  for (let i = 0; i < 8; i++) {
    const cx = x + 2 + rnd() * (S - 4), cy = y + 2 + rnd() * (S - 4);
    const rr = 1.1 + rnd() * 2.2;
    g.fillStyle = `rgba(70,50,30,${.10 + rnd() * .12})`;
    g.beginPath(); g.ellipse(cx + .6, cy + .8, rr, rr * .82, 0, 0, 7); g.fill();
    g.fillStyle = `rgba(${168 + rnd() * 40 | 0},${142 + rnd() * 34 | 0},${108 + rnd() * 30 | 0},${.28 + rnd() * .26})`;
    g.beginPath(); g.ellipse(cx, cy, rr, rr * .8, rnd() * 3, 0, 7); g.fill();
  }

  // 湿土：一点水光
  if (t.wet) {
    for (let i = 0; i < 3; i++) {
      g.fillStyle = "rgba(168,206,214,.10)";
      g.beginPath();
      g.ellipse(x + rnd() * S, y + rnd() * S, 3 + rnd() * 5, 1.6 + rnd() * 2, 0, 0, 7);
      g.fill();
    }
  }

  // 贴着没开垦的一侧羽化：土边不该是一条硬线
  const F = 7;
  // 往荒地那层土色上化开。注意不能化透明 —— 透明会露出底下草地，
  // 翻开的土边上就挂一圈绿，像贴了张绿边贴纸。
  const edge = (skip, grad) => {
    if (skip) return;
    g.fillStyle = grad;
    g.fillRect(x, y, S, S);
  };
  edge(tilled(t.c, t.r - 1), (() => {
    const gd = g.createLinearGradient(0, y, 0, y + F);
    gd.addColorStop(0, "rgba(186,160,124,1)"); gd.addColorStop(1, "rgba(186,160,124,0)");
    return gd;
  })());
  edge(tilled(t.c, t.r + 1), (() => {
    const gd = g.createLinearGradient(0, y + S, 0, y + S - F);
    gd.addColorStop(0, "rgba(186,160,124,1)"); gd.addColorStop(1, "rgba(186,160,124,0)");
    return gd;
  })());
  edge(tilled(t.c - 1, t.r), (() => {
    const gd = g.createLinearGradient(x, 0, x + F, 0);
    gd.addColorStop(0, "rgba(186,160,124,1)"); gd.addColorStop(1, "rgba(186,160,124,0)");
    return gd;
  })());
  edge(tilled(t.c + 1, t.r), (() => {
    const gd = g.createLinearGradient(x + S, 0, x + S - F, 0);
    gd.addColorStop(0, "rgba(186,160,124,1)"); gd.addColorStop(1, "rgba(186,160,124,0)");
    return gd;
  })());
  g.restore();
};

/* ---------- 网格坐标 ---------- */
Farm.tileCenter = function (c, r) {
  return { x: PLOT.x0 + (c + .5) * PLOT.ts, z: PLOT.z0 + (r + .5) * PLOT.ts };
};
function colRowOf(x, z) {
  const c = Math.floor((x - PLOT.x0) / PLOT.ts);
  const r = Math.floor((z - PLOT.z0) / PLOT.ts);
  if (c < 0 || r < 0 || c >= PLOT.cols || r >= PLOT.rows) return null;
  return { c, r };
}
function inPlot(x, z) {
  return !!(colRowOf(x, z));
}

Farm.get = function (c, r) {
  const k = c + "," + r;
  let t = this.tiles.get(k);
  if (!t) { t = { c, r, k, tilled: false, wet: false, crop: null, mesh: null }; this.tiles.set(k, t); }
  return t;
};
Farm.forEach = function (fn) { for (const t of this.tiles.values()) fn(t); };

/* ---------- 面前那格 ---------- */
// 用 game2d 的那套瞄准：光标指哪格，这里就锄哪格
Farm.target = function () {
  const aim = this._o && this._o.aimCell && this._o.aimCell();
  if (aim) {
    if (!aim.plot) return null;
    return this.get(aim.plot.c, aim.plot.r);
  }
  // 兜底：脚下那格
  const cr = colRowOf(this._o.player.x, this._o.player.z);
  return cr ? this.get(cr.c, cr.r) : null;
};

/* ---------- 视觉 ---------- */
Farm.writeSoil = function () {
  if (!this._soilCtx) return;
  this.paintFallow();
  for (let r = 0; r < PLOT.rows; r++) {
    for (let c = 0; c < PLOT.cols; c++) {
      const t = this.tiles.get(c + "," + r);
      if (t && t.tilled) this.paintCell(t);
    }
  }
  if (this._soilTex) this._soilTex.needsUpdate = true;
};

const matCache = new Map();
function mat(color, rough = .95) {
  const k = color + ":" + rough;
  let m = matCache.get(k);
  if (!m) { m = new T.MeshStandardMaterial({ color, roughness: rough, flatShading: true }); matCache.set(k, m); }
  return m;
}

Farm.refreshCrop = function (t) {
  if (t.mesh) { this._root.remove(t.mesh); t.mesh = null; }
  if (!t.crop) return;
  const C = CROPS[t.crop.k];
  const { x, z } = this.tileCenter(t.c, t.r);
  const g = new T.Group();
  g.position.set(x, .06, z);
  const d = t.crop.d, ready = d >= C.days;
  const grow = clamp(d / C.days, 0, 1);

  const leaf = mat(C.leaf);
  if (d === 0 && !ready) {
    // 刚播下：一小撮土 + 两片芽
    const bud = new T.Mesh(new T.SphereGeometry(.07, 6, 5), mat(0x8fbf6a));
    bud.position.y = .07; bud.castShadow = true;
    g.add(bud);
  } else {
    const n = 3 + Math.round(grow * 4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + t.c * 1.7 + t.r * 2.3;
      const lf = new T.Mesh(new T.ConeGeometry(.1 + grow * .09, .26 + grow * .34, 4), leaf);
      lf.position.set(Math.cos(a) * (.1 + grow * .16), .1 + grow * .14, Math.sin(a) * (.1 + grow * .16));
      lf.rotation.set(Math.cos(a) * .6, -a, Math.sin(a) * -.6);
      lf.castShadow = true;
      g.add(lf);
    }
    // 茎
    const stem = new T.Mesh(new T.CylinderGeometry(.025, .04, .1 + grow * C.h, 5), mat(0x6f9a4e));
    stem.position.y = (.1 + grow * C.h) / 2;
    g.add(stem);
  }

  if (ready) {
    const fruit = mat(C.fruit, .7);
    const n = C.days >= 5 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const f = new T.Mesh(new T.SphereGeometry(.13 + (C.days >= 5 ? .06 : 0), 10, 8), fruit);
      const a = i * 2.2 + t.c;
      f.position.set(Math.cos(a) * .13, C.h * .72 + i * .1, Math.sin(a) * .13);
      f.scale.y = C.days >= 5 ? 1 : .92;
      f.castShadow = true;
      g.add(f);
    }
  }
  t.mesh = g;
  this._root.add(g);
};

/* =========================================================
   时间 / 光照
   ========================================================= */
function daylight(m) {
  const K = [[300, .05], [360, .74], [420, .96], [480, 1], [1020, 1], [1080, .78], [1140, .4], [1230, .14], [1560, .1]];
  if (m <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++) {
    if (m <= K[i][0]) {
      const [m0, v0] = K[i - 1], [m1, v1] = K[i];
      const k = (m - m0) / (m1 - m0);
      return v0 + (v1 - v0) * (k * k * (3 - 2 * k));
    }
  }
  return K[K.length - 1][1];
}

const SKY_DAY = new T.Color(0xdcefe4);
const SKY_NIGHT = new T.Color(0x22364f);
const SUN_DAY = new T.Color(0xfff4e4);
const SUN_DUSK = new T.Color(0xffc79a);
const SUN_NIGHT = new T.Color(0x9fb8da);

Farm.applyLight = function () {
  const L = this._o.light;
  if (!L) return;
  let d = daylight(this.time);
  const rain = this.weather === "rain";
  const eff = rain ? d * .68 : d;

  const sky = SKY_NIGHT.clone().lerp(SKY_DAY, eff);
  if (rain) sky.lerp(new T.Color(0x8a97a4), .5);
  const sunC = d > .72 ? SUN_DAY.clone() : (d > .3 ? SUN_DUSK.clone().lerp(SUN_DAY, (d - .3) / .42) : SUN_NIGHT.clone());

  // 地面是不受光的贴图，只能靠乘色来变暗，否则夜里还是一片白天的绿
  const groundC = new T.Color(1, 1, 1).lerp(new T.Color(0x2c3a58), Math.pow(1 - eff, 1.2));
  if (rain) groundC.lerp(new T.Color(0x9aa4ae), .22);

  L({
    exposure: .5 + .54 * eff,
    sky,
    groundColor: groundC,
    sunColor: sunC,
    sunI: .1 + 2.0 * eff,
    hemiI: .35 + 1.75 * eff
  });
};

Farm.fmtTime = function (m) {
  if (m == null) m = this.time;
  const t = m % 1440;
  const h = Math.floor(t / 60), mm = Math.floor(t % 60 / 10) * 10;
  return h + ":" + String(mm).padStart(2, "0");
};

/* =========================================================
   主循环
   ========================================================= */
Farm.update = function (dt, paused) {
  if (!paused) {
    this.time += dt * MIN_PER_SEC;
    if (this.time >= T_END) { this.time = T_END; this.collapse(); }
  }
  this.applyLight();
  this._hudAcc = (this._hudAcc || 0) + dt;
  if (this._hudAcc > .15) { this._hudAcc = 0; this.paint(); }
};

/* =========================================================
   HUD
   ========================================================= */
Farm.paint = function () {
  const pool = this.bag;
  $("#cDay").textContent = "第 " + this.day + " 天";
  $("#cWeather").textContent = this.weather === "rain" ? "🌧️ 雨" : "☀️ 晴";
  $("#cTime").textContent = this.fmtTime();
  const sp = clamp(this.stamina / this.maxStamina, 0, 1);
  $("#cStam").style.width = (sp * 100) + "%";
  $("#cStam").classList.toggle("low", sp < .25);
  $("#cStamTxt").textContent = "体力 " + Math.round(this.stamina);
  $("#cGold").textContent = "💰 " + this.gold;
  const item = TOOLS[this.sel];
  document.body.classList.toggle("night", daylight(this.time) < .32);
  document.getElementById("rain").classList.toggle("show", this.weather === "rain");

  // 物品栏数字
  for (let i = 0; i < TOOLS.length; i++) {
    const el = document.querySelector('#hotbar .slot[data-i="' + i + '"]');
    if (!el) continue;
    el.classList.toggle("on", i === this.sel);
    const cnt = el.querySelector(".cnt");
    const k = TOOLS[i].key;
    if (k === "can") { cnt.textContent = this.water; el.classList.toggle("empty", this.water <= 0); }
    else if (k.startsWith("seed:")) {
      const n = this.seeds[k.slice(5)] || 0;
      cnt.textContent = n; el.classList.toggle("empty", n <= 0);
    } else { cnt.textContent = ""; el.classList.remove("empty"); }
  }
  // 背包总数（商店里会用到）
  this._bagTotal = pool.radish + pool.corn + pool.melon;
};

Farm.buildHotbar = function () {
  const hb = $("#hotbar");
  hb.innerHTML = TOOLS.map((t, i) => `
    <button class="slot" data-i="${i}" title="${t.name}">
      <span class="ic">${t.icon}</span>
      <i class="cnt"></i>
      <b class="kb">${i + 1}</b>
    </button>`).join("");
  hb.querySelectorAll(".slot").forEach(b => {
    b.addEventListener("click", e => { e.preventDefault(); this.select(+b.dataset.i); });
  });
};

Farm.select = function (i) {
  if (!TOOLS[i]) return;
  this.sel = i;
  this.paint();
  this._o.sfx && this._o.sfx("pick");
};

Farm.bindInput = function () {
  window.addEventListener("keydown", e => {
    if (e.key >= "1" && e.key <= "5") { this.select(+e.key - 1); }
  });
  window.addEventListener("wheel", e => {
    if (document.body.classList.contains("infight")) return;
    if ($("#shop").classList.contains("show")) return;
    this.select((this.sel + (e.deltaY > 0 ? 1 : -1) + TOOLS.length) % TOOLS.length);
  }, { passive: true });
};

/* =========================================================
   干活
   ========================================================= */
Farm.spend = function (n) {
  if (this.stamina < n) {
    this._o.toast("体力不够了，回家睡一觉吧");
    this._o.sfx && this._o.sfx("deny");
    return false;
  }
  this.stamina -= n;
  if (this.stamina <= 0) { this.stamina = 0; this._o.toast("累瘫了…… 得回去睡了"); }
  return true;
};

// 返回 true 表示这一下确实做了点什么
Farm.useTarget = function () {
  const o = this._o;
  const p = o.player;

  const t = this.target();
  if (t) return this.work(t);

  // 站在地里但一格都没指着（比如面对着围栏外）
  if (inPlot(p.x, p.z)) { o.toast("对着要动的那一格按 E —— 光标指着哪儿就是哪儿"); return true; }
  return false;
};

Farm.work = function (t) {
  const o = this._o;
  const item = TOOLS[this.sel];
  const key = item.key;

  // 熟的先收，不管手里拿的是什么
  if (t.crop && t.crop.d >= CROPS[t.crop.k].days) {
    if (!this.spend(COST.pick)) return true;
    const k = t.crop.k;
    this.bag[k] = (this.bag[k] || 0) + 1;
    t.crop = null;
    this.refreshCrop(t);
    o.sfx && o.sfx("coin");
    o.toast("收了 1 个" + CROPS[k].name + "（背包 " + this.bag[k] + "）");
    if (o.onHarvest) o.onHarvest(k);
    this.paint();
    return true;
  }

  if (key === "hoe") {
    if (t.tilled) { o.toast(t.crop ? "这格已经种上了" : "这格已经锄开，换种子撒下去"); return true; }
    if (!this.spend(COST.hoe)) return true;
    t.tilled = true; t.wet = false;
    this.paintCell(t);
    if (this._soilTex) this._soilTex.needsUpdate = true;
    o.sfx && o.sfx("dig");
    o.toast("翻开一格土（体力 " + Math.round(this.stamina) + "）· 换种子撒下去");
    this.paint();
    return true;
  }

  if (key === "can") {
    if (!t.tilled) { o.toast("先用锄头把地翻开"); return true; }
    if (t.wet) { o.toast("这格已经浇过水了"); return true; }
    if (this.water <= 0) { o.toast("水壶空了，去西边水塘打水"); o.sfx && o.sfx("deny"); return true; }
    if (!this.spend(COST.water)) return true;
    this.water--;
    t.wet = true;
    this.paintCell(t);
    if (this._soilTex) this._soilTex.needsUpdate = true;
    o.sfx && o.sfx("water");
    o.toast("浇了水（水壶还剩 " + this.water + "）");
    this.paint();
    return true;
  }

  if (key.startsWith("seed:")) {
    const k = key.slice(5);
    if (!t.tilled) { o.toast("先用锄头把地翻开"); return true; }
    if (t.crop) { o.toast("这格已经有东西了"); return true; }
    if ((this.seeds[k] || 0) <= 0) { o.toast("没有" + CROPS[k].name + "种子了，去小七那儿买"); o.sfx && o.sfx("deny"); return true; }
    if (!this.spend(COST.plant)) return true;
    this.seeds[k]--;
    t.crop = { k, d: 0 };
    this.refreshCrop(t);
    o.sfx && o.sfx("plant");
    o.toast("种下了" + CROPS[k].name + " · " + CROPS[k].days + " 天成熟，每天浇水");
    this.paint();
    return true;
  }
  return true;
};

/* =========================================================
   一天结束 / 睡觉
   ========================================================= */
Farm.sleepPrompt = function () {
  const late = this.time >= 1200;
  this._o.say("旁白",
    [late
      ? "外面已经黑透了。要睡吗？一觉到明天 6:00，体力全满，地里的东西会长一截。"
      : "屋里灯还亮着，锅里温着一碗汤。现在睡的话，今天就算过去了。"],
    null,
    [{ label: "躺到床上", onPick: () => this.goToBed() }, { label: "再逛会儿", onPick: null }]);
};

/* 上床：人真的躺下去，然后再关灯换日 */
Farm.goToBed = function () {
  this._o.lieDown && this._o.lieDown();
  this._o.sfx && this._o.sfx("sleep");
  this._o.say("旁白", [
    "被子是晒过太阳的味道，枕头有点塌。",
    "（灯一关，屋里就黑了。）"
  ], () => this.sleep());
};

Farm.sleep = function () {
  this._o.dim && this._o.dim(true);      // 灯一关，屋子就黑了
  const grown = this.nextDay(false);
  this._o.say("旁白", [
    "你睡了过去。",
    "第 " + this.day + " 天 · " + (this.weather === "rain" ? "下着雨" : "天晴") + (grown ? "　作物长了一截。" : "　地里的东西没怎么长。")
  ], () => { this._o.getUp && this._o.getUp(); });
  this._o.sfx && this._o.sfx("sleep");
};

Farm.collapse = function () {
  if (this._collapsing) return;
  this._collapsing = true;
  this.gold = Math.max(0, this.gold - Math.min(50, Math.round(this.gold * .1)));
  this.nextDay(true);
  this._o.say("旁白", ["你在路边睡着了，被露水冻醒。", "第 " + this.day + " 天 · 体力只恢复了一半，还掉了点钱。"]);
  this._o.sfx && this._o.sfx("ko");
  setTimeout(() => { this._collapsing = false; }, 800);
};

Farm.nextDay = function (half) {
  const rain = this.weather === "rain";
  let grown = 0;
  for (const t of this.tiles.values()) {
    if (t.crop) {
      if (t.wet || rain) {
        const C = CROPS[t.crop.k];
        if (t.crop.d < C.days) { t.crop.d++; grown++; }
      }
      this.refreshCrop(t);
    }
    t.wet = false;
  }
  this.writeSoil();
  this.day++;
  this.time = T_START;
  this.weather = Math.random() < .26 ? "rain" : "sun";
  this.stamina = half ? Math.round(this.maxStamina * .5) : this.maxStamina;
  this.water = this.maxWater;
  this.paint();
  this._o.onSleep && this._o.onSleep(half);
  this._o.save && this._o.save();
  return grown;
};

/* =========================================================
   商店
   ========================================================= */
Farm.openShop = function () {
  this.renderShop();
  $("#shop").classList.add("show");
  this._o.sfx && this._o.sfx("intro");
};

Farm.renderShop = function () {
  $("#shopGold").textContent = this.gold;
  const buy = Object.entries(CROPS).map(([k, C]) => {
    const own = this.seeds[k] || 0;
    const can = this.gold >= C.cost;
    return `<div class="srow">
      <span class="sic">${C.icon}</span>
      <div class="smeta"><b>${C.name}种子</b><i>${C.days} 天成熟 · 卖 ${C.sell} 金　存 ${own}</i></div>
      <button class="sbtn" data-buy="${k}" ${can ? "" : "disabled"}>${C.cost} 金</button>
    </div>`;
  }).join("");
  $("#shopBuy").innerHTML = buy;

  const rows = Object.entries(CROPS).filter(([k]) => (this.bag[k] || 0) > 0);
  $("#shopSell").innerHTML = rows.length ? rows.map(([k, C]) => `
    <div class="srow">
      <span class="sic">${C.icon}</span>
      <div class="smeta"><b>${C.name} ×${this.bag[k]}</b><i>单价 ${C.sell} 金</i></div>
      <button class="sbtn sell" data-sell="${k}">卖 ${this.bag[k] * C.sell} 金</button>
    </div>`).join("")
    : `<div class="sempty">还没收成。种下去的东西熟了按 <b>E</b> 采下来，再来这儿卖。</div>`;

  $("#shopBuy").querySelectorAll("[data-buy]").forEach(b => {
    b.onclick = () => this.buy(b.dataset.buy);
  });
  $("#shopSell").querySelectorAll("[data-sell]").forEach(b => {
    b.onclick = () => this.sell(b.dataset.sell);
  });
};

Farm.buy = function (k) {
  const C = CROPS[k];
  if (this.gold < C.cost) { this._o.toast("钱不够"); this._o.sfx && this._o.sfx("deny"); return; }
  this.gold -= C.cost;
  this.seeds[k] = (this.seeds[k] || 0) + 1;
  this._o.sfx && this._o.sfx("coin");
  this.renderShop(); this.paint();
};

Farm.sell = function (k) {
  const n = this.bag[k] || 0;
  if (!n) return;
  const C = CROPS[k];
  this.gold += n * C.sell;
  this.bag[k] = 0;
  this._o.sfx && this._o.sfx("coin");
  this._o.toast("卖了 " + n + " 个" + C.name + "，进账 " + (n * C.sell) + " 金");
  this.renderShop(); this.paint();
};

/* =========================================================
   存档
   ========================================================= */
Farm.serialize = function () {
  const tiles = [];
  for (const t of this.tiles.values()) {
    if (!t.tilled && !t.crop) continue;
    tiles.push([t.c, t.r, t.tilled ? 1 : 0, t.wet ? 1 : 0, t.crop ? t.crop.k : 0, t.crop ? t.crop.d : 0]);
  }
  return {
    day: this.day, time: this.time, weather: this.weather, stamina: this.stamina,
    gold: this.gold, water: this.water, seeds: this.seeds, bag: this.bag, sel: this.sel, tiles
  };
};

Farm.deserialize = function (d) {
  if (!d) return;
  this.day = d.day || 1;
  this.time = clamp(d.time == null ? T_START : d.time, T_START, T_END);
  this.weather = d.weather === "rain" ? "rain" : "sun";
  this.stamina = d.stamina == null ? this.maxStamina : d.stamina;
  this.gold = d.gold == null ? 120 : d.gold;
  this.water = d.water == null ? this.maxWater : d.water;
  this.seeds = Object.assign({ radish: 5, corn: 0, melon: 0 }, d.seeds || {});
  this.bag = Object.assign({ radish: 0, corn: 0, melon: 0 }, d.bag || {});
  this.sel = clamp(d.sel || 0, 0, TOOLS.length - 1);
  this.tiles.clear();
  (d.tiles || []).forEach(([c, r, tilled, wet, k, dd]) => {
    const t = this.get(c, r);
    t.tilled = !!tilled; t.wet = !!wet;
    t.crop = k ? { k, d: dd || 0 } : null;
  });
};

Farm.rebuild = function () {
  this.tiles.forEach(t => this.refreshCrop(t));
  this.writeSoil();
  this.paint();
};

Farm.reset = function () {
  this.day = 1; this.time = T_START; this.weather = "sun";
  this.stamina = this.maxStamina; this.gold = 120; this.water = this.maxWater;
  this.seeds = { radish: 5, corn: 0, melon: 0 };
  this.bag = { radish: 0, corn: 0, melon: 0 };
  this.sel = 0; this.tiles.clear();
  this.rebuild();
};

Farm.hint = function () {
  const t = this.target();
  if (t && !t.tilled) { this._o.toast("这一格还没锄：切到锄头（1）再按 E"); return; }
  if (t && t.tilled && !t.crop) { this._o.toast("地翻好了：换种子（3 / 4 / 5）再按 E"); return; }
  if (t && t.crop) {
    const C = CROPS[t.crop.k];
    const left = Math.max(0, C.days - t.crop.d);
    this._o.toast(left ? "这格种着" + C.name + "，还要 " + left + " 天，记得浇水" : "熟了，按 E 收");
    return;
  }
  this._o.toast("地上没什么可动的。水边按 E 打水，门口按 E 进屋，看见人就走过去聊");
};
