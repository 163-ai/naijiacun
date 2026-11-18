// 奶家村 · 大冒险 —— 流畅版（纯 Canvas 2D，零 WebGL / 零 Three.js）
// 目标：软件渲染 / 低配设备点开即玩。地图数据与 main 版共用 tiles.js，
// 存档共用 naijiacun_game_v2，进度与完整 3D 版互通。
import {
  MAPS, TI, PX, tileAt, solidAt, markAt, toTile, toWorld, paintMap
} from "./tiles.js?v=7";
import { NPCS } from "./villagers.js?v=2";
import { portrait, PLAYER_KEY } from "./portraits.js?v=57";

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SAVE_KEY = "naijiacun_game_v2";
const LITE_KEY = "naijiacun_lite_seen";   // 只标记"见过流畅版提示"，不碰主存档

/* =========================================================
   状态（字段对齐主存档，保证互通）
   ========================================================= */
const state = {
  started: false,
  lv: 3, exp: 0, maxHp: 62, hp: 62, atk: 12,
  balls: 8, captured: {}, metNpc: false, steps: 0, muted: false,
  met: {}, gold: 120, stamina: 100, maxStamina: 100,
  water: 20, maxWater: 20, seeds: { radish: 5, corn: 0, melon: 0 },
  bag: { radish: 0, corn: 0, melon: 0 },
  day: 1, time: 360, weather: "sun",
  farmTiles: new Map(),   // "tx,tz" → { tilled, wet, crop, day }
  sel: 0
};
const player = { x: .5, z: 27, heading: Math.PI, moving: false, phase: 0 };
const SPAWN = { x: .5, z: 27 };

const TOOLS = [
  { key: "hoe",  name: "锄头", icon: "⛏️" },
  { key: "can",  name: "水壶", icon: "💧" },
  { key: "seed:radish", name: "萝卜种", icon: "🥕" },
  { key: "seed:corn",   name: "玉米种", icon: "🌽" },
  { key: "seed:melon",  name: "甜瓜种", icon: "🍈" }
];
const CROPS = {
  radish: { name: "萝卜", icon: "🥕", days: 3, fruit: "#d9774f" },
  corn:   { name: "玉米", icon: "🌽", days: 4, fruit: "#f2c14e" },
  melon:  { name: "甜瓜", icon: "🍈", days: 5, fruit: "#8fcc4f" }
};

/* =========================================================
   地图：当前房间 + 缓存 paintMap 画布
   ========================================================= */
let map = MAPS.village;
let mapCanvas = null;
const painted = new Map();   // roomName → canvas，地图重画很贵，只画一次
function enterRoom(name) {
  if (!MAPS[name]) return;
  map = MAPS[name];
  if (!painted.has(name)) painted.set(name, paintMap(map));
  mapCanvas = painted.get(name);
  updateHud();
}
function blocked(x, z, r = .34) {
  const { tx, tz } = toTile(map, x, z);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const cx = tx + dx, cz = tz + dz;
    if (!solidAt(map, cx, cz)) continue;
    const b = toWorld(map, cx, cz);
    const bx = b.x - .5, bz = b.z - .5;
    const nx = clamp(x, bx, bx + 1), nz = clamp(z, bz, bz + 1);
    if (Math.hypot(x - nx, z - nz) < r) return true;
  }
  return false;
}

/* =========================================================
   存档：与主版共用 key，字段尽量对齐
   ========================================================= */
function save() {
  if (!state.started) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      lv: state.lv, exp: state.exp, maxHp: state.maxHp, hp: state.hp, atk: state.atk,
      balls: state.balls, captured: state.captured, metNpc: state.metNpc, steps: state.steps,
      muted: state.muted, viewMode: "2d", camFollow: true,
      met: state.met, dayFlags: {}, gifts: {}, anchors: {},
      gold: state.gold,
      px: player.x, pz: player.z,
      farm: {
        day: state.day, time: state.time, weather: state.weather,
        stamina: state.stamina, gold: state.gold, water: state.water,
        seeds: state.seeds, bag: state.bag, sel: state.sel,
        tiles: [...state.farmTiles.entries()].map(([k, v]) => {
          const [c, r] = k.split(",").map(Number);
          return [c, r, v.tilled ? 1 : 0, v.wet ? 1 : 0, v.crop || "", v.day || 0];
        })
      }
    }));
  } catch (e) {}
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    state.lv = d.lv ?? 3; state.exp = d.exp ?? 0;
    state.maxHp = d.maxHp ?? 62; state.hp = d.hp ?? state.maxHp;
    state.atk = d.atk ?? 12; state.balls = d.balls ?? 8;
    state.captured = d.captured || {}; state.metNpc = !!d.metNpc;
    state.steps = d.steps || 0; state.muted = !!d.muted; state.met = d.met || {};
    const f = d.farm || {};
    state.day = f.day ?? 1; state.time = f.time ?? 360; state.weather = f.weather || "sun";
    state.stamina = f.stamina ?? 100; state.gold = f.gold ?? d.gold ?? 120;
    state.water = f.water ?? 20;
    state.seeds = Object.assign({ radish: 5, corn: 0, melon: 0 }, f.seeds || {});
    state.bag = Object.assign({ radish: 0, corn: 0, melon: 0 }, f.bag || {});
    state.sel = f.sel ?? 0;
    state.farmTiles.clear();
    if (Array.isArray(f.tiles)) for (const t of f.tiles) {
      state.farmTiles.set(t[0] + "," + t[1], { tilled: !!t[2], wet: !!t[3], crop: t[4] || "", day: t[5] || 0 });
    }
    player.x = d.px ?? SPAWN.x; player.z = d.pz ?? SPAWN.z;
    if (blocked(player.x, player.z) || map !== MAPS.village) {
      // 存档点若在别的房间/墙里，回到村里出生点
      player.x = SPAWN.x; player.z = SPAWN.z;
    }
    return true;
  } catch (e) { return false; }
}

/* =========================================================
   工具：提示 / 音效
   ========================================================= */
let toastT = 0;
function toast(msg) {
  const n = $("#toast");
  n.textContent = msg; n.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => n.classList.remove("show"), 1900);
}
let actx = null;
function sfx(kind) {
  if (state.muted) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.connect(g); g.connect(actx.destination);
    const now = actx.currentTime;
    const freq = { step: 220, dig: 140, water: 900, plant: 620, coin: 1100, talk: 480 }[kind] || 440;
    o.frequency.value = freq;
    o.type = kind === "dig" ? "triangle" : "sine";
    g.gain.setValueAtTime(.03, now);
    g.gain.exponentialRampToValueAtTime(.0001, now + .12);
    o.start(now); o.stop(now + .13);
  } catch (e) {}
}

/* =========================================================
   相机 / 画布
   ========================================================= */
const canvas = $("#world");
const ctx = canvas.getContext("2d", { alpha: false });
let vw = 0, vh = 0, dpr = 1;
// 每格显示多少屏幕像素：镜头高度。数值越大看得越远、角色越小。
let scale = 56;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  vw = window.innerWidth; vh = window.innerHeight;
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  canvas.style.width = vw + "px";
  canvas.style.height = vh + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
}
window.addEventListener("resize", resize);
resize();

// 世界坐标 → 屏幕坐标（相机跟随玩家，居中）
function worldToScreen(x, z) {
  const m = map;
  const wx = (x - m.ox) * PX;   // 地图画布像素
  const wz = (z - m.oz) * PX;
  return {
    x: vw / 2 + (wx - ((player.x - m.ox) * PX)) * (scale / PX),
    y: vh / 2 + (wz - ((player.z - m.oz) * PX)) * (scale / PX)
  };
}

/* =========================================================
   绘制：地图 / 角色 / NPC / 农田
   ========================================================= */
function drawMap() {
  ctx.fillStyle = "#cfe0d4";
  ctx.fillRect(0, 0, vw, vh);
  if (!mapCanvas) return;
  const k = scale / PX;
  // 地图左上角在屏幕上的位置
  const ox = vw / 2 - (player.x - map.ox) * scale;
  const oy = vh / 2 - (player.z - map.oz) * scale;
  const dw = map.w * scale, dh = map.h * scale;
  ctx.drawImage(mapCanvas, ox, oy, dw, dh);
  // 地图外的区域压暗，形成边界感
  ctx.fillStyle = "rgba(30,45,35,.18)";
  if (ox > 0) ctx.fillRect(0, 0, ox, vh);
  if (oy > 0) ctx.fillRect(0, 0, vw, oy);
  if (ox + dw < vw) ctx.fillRect(ox + dw, 0, vw - ox - dw, vh);
  if (oy + dh < vh) ctx.fillRect(0, oy + dh, vw, vh - oy - dh);
}

// 阴影椭圆
function shadow(x, y, rx, ry) {
  ctx.fillStyle = "rgba(30,45,35,.21)";
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// 农田覆盖层：把翻过地/种了作物的格子画在地图之上
function drawFarm() {
  const k = scale / PX;
  for (const [key, t] of state.farmTiles) {
    if (!t.tilled && !t.crop) continue;
    const [tx, tz] = key.split(",").map(Number);
    // 农田坐标是世界坐标，换算成所在地图的格
    const wx = tx - map.ox, wz = tz - map.oz;
    if (wx < 0 || wz < 0 || wx >= map.w || wz >= map.h) continue;
    const p = worldToScreen(tx + .5, tz + .5);
    const s = scale;
    if (p.x < -s || p.x > vw + s || p.y < -s || p.y > vh + s) continue;
    if (t.tilled) {
      ctx.fillStyle = t.wet ? "#6b4f36" : "#9a7350";
      ctx.fillRect(p.x - s / 2 + 2, p.y - s / 2 + 2, s - 4, s - 4);
      ctx.strokeStyle = "rgba(60,40,25,.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x - s / 2 + 4, p.y);
      ctx.lineTo(p.x + s / 2 - 4, p.y);
      ctx.stroke();
    }
    if (t.crop && CROPS[t.crop]) {
      const c = CROPS[t.crop];
      const grown = state.day - (t.day || state.day) >= c.days;
      ctx.font = (grown ? 22 : 14) + "px serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.globalAlpha = t.wet ? 1 : .82;
      ctx.fillText(c.icon, p.x, p.y - 2);
      ctx.globalAlpha = 1;
    }
  }
}

const faceCache = new Map();
function faceImg(key) {
  if (faceCache.has(key)) return faceCache.get(key);
  const img = new Image();
  img.src = portrait(key, "normal");   // portrait 返回 dataURL 或图片路径
  faceCache.set(key, img);
  return img;
}

// NPC：用头像图 + 名字，没加载出来就用色块圆形兜底
function drawNpc(npc, t) {
  const bob = Math.sin(t * 2 + npc.home.x) * 2;
  const p = worldToScreen(npc.home.x, npc.home.z);
  const s = scale;
  if (p.x < -s || p.x > vw + s || p.y < -s || p.y > vh + s) return;
  shadow(p.x, p.y + s * .34, s * .3, s * .12);
  const img = faceImg(npc.char || npc.id);
  const size = s * .72;
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y - s * .08 + bob, size / 2, 0, Math.PI * 2);
  ctx.clip();
  if (img.complete && img.naturalWidth) {
    ctx.drawImage(img, p.x - size / 2, p.y - s * .08 - size / 2 + bob, size, size);
  } else {
    ctx.fillStyle = "#8fae8a";
    ctx.fillRect(p.x - size / 2, p.y - s * .08 - size / 2 + bob, size, size);
  }
  ctx.restore();
  // 名字
  ctx.font = "11px -apple-system, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  const label = npc.name;
  const w = ctx.measureText(label).width + 12;
  ctx.fillStyle = "rgba(255,255,252,.86)";
  roundRect(p.x - w / 2, p.y + s * .38 + bob, w, 16, 8);
  ctx.fill();
  ctx.fillStyle = "#3c4a3c";
  ctx.fillText(label, p.x, p.y + s * .38 + 2 + bob);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 玩家
function drawPlayer(t) {
  const p = worldToScreen(player.x, player.z);
  const s = scale;
  const bob = player.moving ? Math.abs(Math.sin(player.phase * 10)) * s * .06 : 0;
  shadow(p.x, p.y + s * .34, s * .32, s * .13);
  const img = faceImg(PLAYER_KEY);
  const size = s * .8;
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y - s * .1 - bob, size / 2, 0, Math.PI * 2);
  ctx.clip();
  if (img.complete && img.naturalWidth) {
    ctx.drawImage(img, p.x - size / 2, p.y - s * .1 - size / 2 - bob, size, size);
  } else {
    ctx.fillStyle = "#e8b34f";
    ctx.fillRect(p.x - size / 2, p.y - s * .1 - size / 2 - bob, size, size);
  }
  ctx.restore();
  // 头顶标记
  ctx.fillStyle = "#4a7c59";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.fillText("你", p.x, p.y - size * .6 - bob);
}

// 昼夜：随时间给整屏叠一层色
function drawDayNight() {
  const h = state.time / 60;
  let tint = null, alpha = 0;
  if (h >= 19 || h < 5.5) { tint = "#12233f"; alpha = .42; }
  else if (h >= 17 || h < 7) { tint = "#d98b46"; alpha = .16; }
  if (tint) {
    ctx.fillStyle = tint;
    ctx.globalAlpha = alpha;
    ctx.fillRect(0, 0, vw, vh);
    ctx.globalAlpha = 1;
  }
}

/* =========================================================
   输入：键盘 + 触屏摇杆
   ========================================================= */
const keys = {};
window.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
  if (!state.started || dialog.open) {
    if (k === "e" || k === "enter") advanceDialog();
    return;
  }
  if (k >= "1" && k <= "5") { state.sel = +k - 1; updateHud(); }
  if (k === "e") interact();
  if (k === "shift") player.run = true;
});
window.addEventListener("keyup", e => {
  keys[e.key.toLowerCase()] = false;
  if (e.key.toLowerCase() === "shift") player.run = false;
});

// 触屏摇杆：按住方向键
document.querySelectorAll("#pad button").forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); padKeys[k] = true; };
  const off = e => { e.preventDefault(); padKeys[k] = false; };
  b.addEventListener("pointerdown", on);
  b.addEventListener("pointerup", off);
  b.addEventListener("pointercancel", off);
  b.addEventListener("pointerleave", off);
});
const padKeys = {};
$("#btnAct").addEventListener("pointerdown", e => { e.preventDefault(); interact(); });

function readMove() {
  let dx = 0, dz = 0;
  if (keys["w"] || keys["arrowup"] || padKeys.up) dz -= 1;
  if (keys["s"] || keys["arrowdown"] || padKeys.down) dz += 1;
  if (keys["a"] || keys["arrowleft"] || padKeys.left) dx -= 1;
  if (keys["d"] || keys["arrowright"] || padKeys.right) dx += 1;
  if (dx || dz) {
    const len = Math.hypot(dx, dz);
    dx /= len; dz /= len;
  }
  return { dx, dz };
}

/* =========================================================
   交互：对话 / 农田 / 门
   ========================================================= */
const dialog = { open: false, who: null, lines: [], i: 0 };
function openDialog(name, key, lines) {
  dialog.open = true; dialog.who = name; dialog.lines = lines; dialog.i = 0;
  $("#dlgName").textContent = name;
  $("#dlgFace").src = portrait(key, "normal");
  $("#dialog").classList.remove("hidden");
  showDialogLine();
}
function showDialogLine() {
  $("#dlgText").textContent = dialog.lines[dialog.i] || "";
  $("#dlgNext").textContent = dialog.i < dialog.lines.length - 1 ? "点击继续 ▾" : "点击结束";
}
function advanceDialog() {
  if (!dialog.open) return;
  dialog.i++;
  if (dialog.i >= dialog.lines.length) {
    dialog.open = false;
    $("#dialog").classList.add("hidden");
  } else showDialogLine();
}
$("#dialog").addEventListener("click", e => {
  if (e.target.closest("#dlgClose")) {
    dialog.open = false; $("#dialog").classList.add("hidden"); return;
  }
  advanceDialog();
});

// 玩家面前那一格
function aheadCell() {
  const fx = player.x + Math.sin(player.heading) * .6;
  const fz = player.z - Math.cos(player.heading) * .6;
  return toTile(map, fx, fz);
}

function interact() {
  if (!state.started || dialog.open) return;
  const { tx, tz } = aheadCell();
  const mark = markAt(map, tx, tz);

  // 门 / 传送点
  if (mark && (mark.kind === "gate" || mark.kind === "door")) {
    const to = mark.to;
    if (to && MAPS[to]) {
      enterRoom(to);
      const sp = mark.spawn;
      if (sp && !blocked(sp.x, sp.z)) { player.x = sp.x; player.z = sp.z; }
      toast("来到" + map.name);
      sfx("step"); save();
      return;
    }
  }

  // 农田：PLOT 是固定世界坐标区域 {x0:-32,z0:10,cols:12,rows:9}
  const PLOT = { x0: -32, z0: 10, cols: 12, rows: 9 };
  const wx = player.x, wz = player.z;
  if (map === MAPS.village && wx >= PLOT.x0 && wx < PLOT.x0 + PLOT.cols &&
      wz >= PLOT.z0 && wz < PLOT.z0 + PLOT.rows) {
    farmAt(Math.floor(wx - PLOT.x0), Math.floor(wz - PLOT.z0));
    return;
  }

  // NPC：找离玩家最近的
  let near = null, nd = 1.7;
  for (const npc of NPCS) {
    const d = Math.hypot(npc.home.x - player.x, npc.home.z - player.z);
    if (d < nd) { nd = d; near = npc; }
  }
  if (near) {
    state.met[near.id] = true; state.metNpc = true;
    if (near.greet && near.greet.length) openDialog(near.name, near.char || near.id, near.greet);
    sfx("talk"); save();
    return;
  }

  // 其它可交互标记
  if (mark && mark.label) toast(mark.label);
  else toast("这里没什么可做的");
}

function farmAt(c, r) {
  const key = c + "," + r;
  let t = state.farmTiles.get(key) || { tilled: false, wet: false, crop: "", day: 0 };
  const tool = TOOLS[state.sel].key;
  if (tool === "hoe") {
    if (!t.tilled) {
      t.tilled = true;
      state.stamina = Math.max(0, state.stamina - 4);
      sfx("dig"); toast("翻好了一块地");
    } else toast("这块地已经翻过了");
  } else if (tool === "can") {
    if (t.tilled && !t.wet && state.water > 0) {
      t.wet = true; state.water--;
      sfx("water"); toast("浇好水了");
    } else if (!t.tilled) toast("先用锄头翻地");
    else if (t.wet) toast("已经浇过了");
    else toast("水壶空了");
  } else if (tool.startsWith("seed:")) {
    const crop = tool.slice(5);
    if (t.tilled && !t.crop && state.seeds[crop] > 0) {
      t.crop = crop; t.day = state.day; state.seeds[crop]--;
      sfx("plant"); toast("种下" + CROPS[crop].name);
    } else if (!t.tilled) toast("先用锄头翻地");
    else if (t.crop) {
      // 成熟就收获
      const conf = CROPS[t.crop];
      if (state.day - t.day >= conf.days) {
        state.bag[t.crop] = (state.bag[t.crop] || 0) + 1;
        state.gold += conf.fruit ? Math.round(conf.fruit.length * 3) : 10;
        t.crop = ""; t.wet = false;
        sfx("coin"); toast("收获了" + conf.name + "！卖了点钱");
      } else toast("还没长好，还要 " + (conf.days - (state.day - t.day)) + " 天");
    } else toast("没有这种种子了");
  }
  state.farmTiles.set(key, t);
  updateHud(); save();
}

/* =========================================================
   HUD
   ========================================================= */
function updateHud() {
  $("#lv").textContent = "Lv." + state.lv;
  $("#hpBar").style.width = (100 * state.hp / state.maxHp) + "%";
  $("#hpTxt").textContent = Math.round(state.hp) + "/" + state.maxHp;
  $("#expTxt").textContent = state.exp + "/54";
  const totalMin = Math.floor(state.time);
  const hh = Math.floor(totalMin / 60), mm = totalMin % 60;
  const wicon = state.weather === "rain" ? "🌧️" : state.weather === "cloud" ? "⛅" : "☀️";
  $("#clockChip").textContent = "第 " + state.day + " 天 · " + wicon + " · " +
    String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
  $("#statChip").textContent = "体力 " + Math.round(state.stamina) + " · 金币 " + state.gold + " · 水 " + state.water;
  $("#areaChip").textContent = map.name;
  const bar = $("#hotbar");
  if (!bar.childElementCount) {
    TOOLS.forEach((t, i) => {
      const el = document.createElement("div");
      el.className = "tool"; el.dataset.i = i;
      el.innerHTML = '<span class="num">' + (i + 1) + '</span><span>' + t.icon + '</span><small>' + t.name + '</small>';
      el.onclick = () => { state.sel = i; updateHud(); };
      bar.appendChild(el);
    });
  }
  [...bar.children].forEach((el, i) => el.classList.toggle("sel", i === state.sel));
}

/* =========================================================
   主循环：固定步长更新 + 每帧绘制
   ========================================================= */
let last = performance.now();
let acc = 0, saveAcc = 0;
const SPEED = 3.4;   // 格/秒

function update(dt) {
  // 移动
  const { dx, dz } = readMove();
  player.moving = !!(dx || dz);
  if (player.moving) {
    const sp = SPEED * (player.run ? 1.7 : 1) * dt;
    const nx = player.x + dx * sp, nz = player.z + dz * sp;
    if (!blocked(nx, player.z)) player.x = nx;
    if (!blocked(player.x, nz)) player.z = nz;
    player.heading = Math.atan2(dx, -dz);
    player.phase += dt;
    state.steps++;
    if (state.steps % 12 === 0) sfx("step");
  }

  // 时间流动：现实 1 秒 ≈ 游戏 5 分钟（与主版一致）
  if (!dialog.open) {
    state.time += dt * 5;
    if (state.time >= 1440) {
      state.time -= 1440;
      state.day++;
      // 作物按天生长，浇水状态重置
      for (const t of state.farmTiles.values()) t.wet = false;
      state.stamina = state.maxStamina;
      state.water = state.maxWater;
      toast("新的一天开始了");
    }
  }

  // HUD 每 0.2 秒刷一次，不必每帧动 DOM
  acc += dt;
  if (acc >= .2) { acc = 0; updateHud(); }
  // 每 8 秒自动存档
  saveAcc += dt;
  if (saveAcc >= 8) { saveAcc = 0; save(); }
}

function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  if (state.started) update(dt);
  const t = now / 1000;
  drawMap();
  if (map === MAPS.village) drawFarm();
  // NPC 只画当前地图范围内的（按 home 坐标粗筛）
  for (const npc of NPCS) {
    const tt = toTile(map, npc.home.x, npc.home.z);
    if (tt.tx >= 0 && tt.tz >= 0 && tt.tx < map.w && tt.tz < map.h) drawNpc(npc, t);
  }
  if (state.started) drawPlayer(t);
  drawDayNight();
  requestAnimationFrame(frame);
}

/* =========================================================
   启动
   ========================================================= */
function begin(fresh) {
  if (fresh) {
    Object.assign(state, {
      lv: 3, exp: 0, maxHp: 62, hp: 62, atk: 12, balls: 8,
      captured: {}, metNpc: false, steps: 0, met: {},
      gold: 120, stamina: 100, water: 20,
      seeds: { radish: 5, corn: 0, melon: 0 }, bag: { radish: 0, corn: 0, melon: 0 },
      day: 1, time: 360, weather: "sun", sel: 0
    });
    state.farmTiles.clear();
    player.x = SPAWN.x; player.z = SPAWN.z;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  } else {
    // 继续游戏：先把主存档读进来（与 3D 版共用 SAVE_KEY）
    load();
  }
  state.started = true;
  $("#title").classList.add("hidden");
  $("#hud").classList.remove("hidden");
  enterRoom("village");
  updateHud();
  toast("WASD 走动 · E 互动 · 数字键换工具");
  save();
}

$("#btnStart").onclick = () => begin(true);
$("#btnContinue").onclick = () => begin(false);
$("#btnFull").onclick = () => {
  if (confirm("切换到完整 3D 版？需要设备支持图形加速，进度会保留。")) {
    location.href = "game.html";
  }
};
$("#btnSound").onclick = () => {
  state.muted = !state.muted;
  $("#btnSound").textContent = state.muted ? "🔇" : "🔊";
  save();
};
$("#btnHelp").onclick = () => $("#help").classList.remove("hidden");
$("#helpClose").onclick = () => $("#help").classList.add("hidden");

let hasSave = false;
try { hasSave = !!localStorage.getItem(SAVE_KEY); } catch (e) {}
if (hasSave) $("#btnContinue").classList.remove("hidden");

// 诊断钩子
window.__lite = () => ({ started: state.started, map: map.name, x: player.x, z: player.z,
  day: state.day, time: state.time, gold: state.gold, tiles: state.farmTiles.size });

// 渲染循环先跑起来（标题页也有背景）
enterRoom("village");
requestAnimationFrame(frame);
