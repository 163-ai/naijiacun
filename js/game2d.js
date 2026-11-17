// 奶家村 · 大冒险 —— 2D 顶视角探索
// 地面是一张 canvas 画出来的贴图（草地/土路/水塘/花田都在上面），
// 树木房屋是简单几何按坐标摆放，人物仍然是仓库里的 GLB 完整模型。
import * as T from "three";
import { mergeGeometries } from "../vendor/three/BufferGeometryUtils.js";
import { GLTFLoader } from "../vendor/three/GLTFLoader.js";
import { MeshoptDecoder } from "../vendor/meshopt/meshopt_decoder.module.js";
import { createPetMotion } from "./pet-motion.js?v=2";
import { makeAnimator } from "./creature.js?v=58";
import { Fight } from "./kof.js?v=57";
import {
  TS, TI, VILLAGE, TOWN, GROVE, HILL, TOWN_LOTS, TOWN_STALLS, HOUSE, SHOP, STATION, ARCHIVE, MAPS,
  tileAt, setSolid, solidAt, markAt, mapTexture, toTile, toWorld
} from "./tiles.js?v=6";
import { Farm, CROPS, PLOT } from "./farm.js";
import { portrait, moodFilter, speakerKey, PLAYER_KEY } from "./portraits.js?v=57";
import { NPCS, DESK_OFFICER, bountyOf } from "./villagers.js";
import { Gomoku } from "./gomoku.js";

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const lerp = (a, b, t) => a + (b - a) * t;
// v1 是旧 3D 版的存档，坐标体系完全不同，直接弃用
const SAVE_KEY = "naijiacun_game_v2";

/* =========================================================
   角色表
   ========================================================= */
const CAST = {
  nailong: {
    name: "奶龙", h: 1.75, model: true,
    img: "assets/characters/nailong.png",
    desc: "黄色圆滚滚的小恐龙，奶油色肚皮、短手短脚。你本人，负责在村子里到处乱走。"
  },
  naiwa: {
    name: "奶蛙", h: 1.62, model: true,
    img: "assets/characters/naiwa.webp",
    desc: "梨形身体、绿色虹膜大眼、张嘴大笑。出生方式是一次 AI 翻车，如今靠“齁齁齁”统治评论区。"
  },
  niulai: {
    name: "牛来", h: 1.55, model: true, node: "NIU_LAI",
    img: "assets/characters/niulai.webp",
    desc: "建模粗糙的黄色小牛，五年手搓，一句“妈妈，牛来！”被股民当成涨停许愿池。"
  },
  baobaolong: {
    name: "暴暴龙", h: 1.7, model: true,
    img: "assets/characters/baobaolong.png",
    desc: "奶龙的宿敌。头顶白色蛋壳、蓝色小翅膀，擅长布陷阱并把自己埋进去。"
  },
  capybara: {
    name: "卡皮巴拉", h: 1.45, model: true,
    img: "assets/characters/capybara.webp",
    desc: "水豚，方头小圆耳，永远半眯眼。全网情绪稳定代言人。"
  },
  xiaoqi: {
    name: "小七", h: 1.8, npc: true, model: true,
    img: "assets/characters/xiaoqi.png",
    desc: "地球少年发明家，黑短发带一撮呆毛。在村口站着，抱着一台没焊完的机器。"
  },
  naidan: {
    name: "奶蛋", h: 1.12, npc: true, model: true,
    img: "assets/characters/naidan.png",
    desc: "圆滚滚的黄色蛋形小伙伴，住在田边，见谁都劝人下地干活。"
  },
  feidudu: {
    name: "肥嘟嘟袋鼠", h: 1.55, model: true,
    img: "assets/characters/feidudu.png",
    desc: "圆肚子的小袋鼠，肚皮上的口袋老是漏东西，一走路就掉一地。"
  }
};

const ZONES = {
  meadow: { label: "中央草坡", table: [["naiwa", 55], ["niulai", 30], ["capybara", 15]] },
  forest: { label: "村北树林", table: [["niulai", 50], ["baobaolong", 30], ["naiwa", 20]] },
  lake: { label: "水塘边", table: [["naiwa", 45], ["capybara", 35], ["baobaolong", 20]] },
  flower: { label: "东边花田", table: [["capybara", 42], ["naiwa", 33], ["baobaolong", 25]] },
  bamboo: { label: "竹林水塘", table: [["capybara", 45], ["naiwa", 35], ["niulai", 20]] },
  hill: { label: "南高草坡", table: [["baobaolong", 40], ["niulai", 32], ["capybara", 28]] }
};

/* =========================================================
   状态
   ========================================================= */
const state = {
  started: false, muted: false, balls: 8,
  // 视角：3d=户外第三人称透视 / 2d=同世界降维的正交俯视；camFollow=镜头自动跟人转向
  viewMode: "3d", camFollow: true,
  captured: {}, metNpc: false, steps: 0,
  lv: 3, exp: 0, maxHp: 62, hp: 62, atk: 28,
  // 探索：见过谁、聊过谁、领了什么活
  met: {},                 // npcId → true
  dayFlags: {},            // "xiaocao:3" → true（每天一次的事）
  gifts: {},               // 一次性送礼
  bounty: null,            // 奶察局的悬赏
  bountyDay: 0,
  // 大世界：点亮过的锚点、肥嘟嘟的口袋、暴暴龙的擂台连胜
  anchors: {},             // "village" / "town" → true（花过钱点亮）
  pouchDay: 0,             // 口袋任务今天做没做
  pouches: 0,
  arenaWins: 0,
  // 小游戏：钓鱼当天抛了几竿、唱戏当天唱没唱
  fishDay: 0, fishRods: 0, stageDay: 0,
  // 驿站远行委托：{ day, kind, map, need, got, done, title, desc, reward }
  courier: null,
  // 图鉴：见过谁（按角色 char 记）、领过哪几档奖励、当前称号
  metChar: {}, dexRewards: [], dexTitle: "",
  // 镇内任务：戏班子的三件戏家伙 { day, stage:0未接/1收集中/2待交/3今日完成, gotList:已拾取序号, invited:已送帖对象id }
  troupe: { day: 0, stage: 0, gotList: [], invited: [] }
};
const expNeed = lv => 18 + lv * 12;

const SPAWN = { x: .5, z: 27 };
// jumpY：脚离地高度；vy：竖直速度。落地由重力积分 + 地形面判定，不用定时器。
let player = { x: SPAWN.x, z: SPAWN.z, heading: Math.PI, moving: false, run: false, phase: 0, ready: false,
  jumpY: 0, vy: 0, jumping: false };

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      lv: state.lv, exp: state.exp, maxHp: state.maxHp, hp: state.hp, atk: state.atk,
      balls: state.balls, captured: state.captured, metNpc: state.metNpc,
      steps: state.steps, muted: state.muted,
      viewMode: state.viewMode, camFollow: state.camFollow,
      met: state.met, dayFlags: state.dayFlags, gifts: state.gifts,
      bounty: state.bounty, bountyDay: state.bountyDay,
      beatQiyet: !!state.beatQiyet, seenRoom: state.seenRoom,
      anchors: state.anchors, pouchDay: state.pouchDay, pouches: state.pouches,
      arenaWins: state.arenaWins,
      fishDay: state.fishDay, fishRods: state.fishRods, stageDay: state.stageDay,
      courier: state.courier,
      metChar: state.metChar, dexRewards: state.dexRewards, dexTitle: state.dexTitle,
      troupe: state.troupe,
      // 存档点永远记在村里：镇上/屋里的位置不入档，下次开局从村的落点开始
      px: roomState.name === "village" ? player.x : roomState.back.x,
      pz: roomState.name === "village" ? player.z : roomState.back.z,
      farm: Farm.serialize()
    }));
  } catch (e) { /* 存不了就算了 */ }
}
function load() {
  try {
    localStorage.removeItem("naijiacun_game_v1");
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    Object.assign(state, {
      lv: d.lv ?? 3, exp: d.exp ?? 0, maxHp: d.maxHp ?? 62, hp: d.hp ?? 62,
      atk: d.atk ?? 28, balls: d.balls ?? 8, captured: d.captured || {},
      metNpc: !!d.metNpc, steps: d.steps || 0, muted: !!d.muted,
      viewMode: d.viewMode === "2d" ? "2d" : "3d", camFollow: d.camFollow !== false,
      met: d.met || {}, dayFlags: d.dayFlags || {}, gifts: d.gifts || {},
      bounty: d.bounty || null, bountyDay: d.bountyDay || 0,
      beatQiyet: !!d.beatQiyet, seenRoom: d.seenRoom || {},
      anchors: d.anchors || {}, pouchDay: d.pouchDay || 0,
      pouches: d.pouches || 0, arenaWins: d.arenaWins || 0,
      fishDay: d.fishDay || 0, fishRods: d.fishRods || 0, stageDay: d.stageDay || 0,
      courier: d.courier || null,
      metChar: d.metChar || {}, dexRewards: d.dexRewards || [], dexTitle: d.dexTitle || "",
      troupe: d.troupe || { day: 0, stage: 0, gotList: [], invited: [] }
    });
    player.x = d.px ?? SPAWN.x;
    player.z = d.pz ?? SPAWN.z;
    // 存档点落在墙里就地复位，别再让人一开局就卡在树上
    if (blocked(player.x, player.z)) { player.x = SPAWN.x; player.z = SPAWN.z; }
    Farm.deserialize(d.farm);
    return true;
  } catch (e) { return false; }
}

/* =========================================================
   声音
   ========================================================= */
let actx = null;
function ac() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (actx && actx.state === "suspended") actx.resume();
  return actx;
}
function blip(freq, dur, type, gain, slideTo) {
  const a = ac(); if (!a || state.muted) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type || "sine"; o.frequency.value = freq;
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
  g.gain.setValueAtTime(0, a.currentTime);
  g.gain.linearRampToValueAtTime(gain || .04, a.currentTime + .012);
  g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + dur);
  o.connect(g); g.connect(a.destination);
  o.start(); o.stop(a.currentTime + dur + .02);
}
function sfx(kind) {
  switch (kind) {
    case "swing": blip(680, .05, "square", .022); break;
    case "swingHeavy": blip(220, .12, "sawtooth", .03, 90); break;
    case "hit": blip(180, .1, "square", .05); blip(90, .14, "sine", .05); break;
    case "hitHeavy": blip(120, .16, "square", .06); blip(60, .22, "sine", .07); blip(300, .05, "square", .03); break;
    case "block": blip(420, .06, "triangle", .03); break;
    case "jump": blip(520, .08, "sine", .025); break;
    case "special": blip(240, .3, "sawtooth", .045); break;
    // 大招三连：蓄力上扫 → 砸地闷响 → 命中爆点
    case "ultCharge": blip(140, .18, "sawtooth", .04, 720); blip(280, .18, "sine", .025, 1200); break;
    case "ultSlam": blip(70, .34, "sine", .09, 38); blip(46, .4, "sine", .07); blip(180, .1, "square", .04); break;
    case "ultHit": blip(60, .4, "sine", .08, 30); blip(130, .2, "square", .05); blip(900, .12, "sawtooth", .03, 200); break;
    case "ko": blip(120, .5, "sawtooth", .06); break;
    case "intro": blip(440, .12, "sine", .04); break;
    case "fight": blip(660, .2, "square", .045); break;
    case "throw": blip(760, .12, "sine", .04); break;
    case "deny": blip(200, .1, "square", .03); break;
    // 种田
    case "dig": blip(150, .1, "triangle", .05); blip(96, .12, "sine", .04); break;
    case "water": blip(900, .12, "sine", .028); blip(1250, .1, "sine", .016); break;
    case "plant": blip(620, .07, "sine", .03); break;
    case "coin": blip(1180, .07, "square", .026); blip(1560, .09, "sine", .02); break;
    case "sleep": blip(330, .5, "sine", .035); blip(220, .7, "sine", .02); break;
    default: blip(520, .06, "sine", .03);
  }
}

/* =========================================================
   渲染器 / 场景
   ========================================================= */
const canvas = $("#gl");
const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));   // 高 DPI 下 2x 填充开销大，1.5x 肉眼几乎无差
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFShadowMap;   // PCFSoft 每像素多采样，1024 图上差距很小但快不少

Fight.init(renderer);

/* ---- 画面风格：几套滤镜 + 曝光，一键循环切换，存本地 ---- */
const STYLES = [
  // 国风：宣纸淡彩 + 青绿山水，配水墨远山 / 竹林 / 红灯笼 / 飞檐翘角
  { id: "guofeng", name: "国风",   filter: "sepia(.2) saturate(.86) contrast(.95) brightness(1.03)", exp: 1.02 },
  { id: "fresh",  name: "清新",   filter: "none",                                              exp: 1.00 },
  { id: "warm",   name: "暖阳",   filter: "sepia(.18) saturate(1.16) brightness(1.03)",        exp: 1.03 },
  { id: "dusk",   name: "黄昏",   filter: "sepia(.36) saturate(1.22) hue-rotate(-10deg) contrast(1.04)", exp: 1.00 },
  { id: "mint",   name: "薄荷",   filter: "hue-rotate(22deg) saturate(.92) brightness(1.05)",  exp: 1.02 },
  { id: "retro",  name: "复古",   filter: "sepia(.3) saturate(.8) contrast(1.06) brightness(.98)", exp: 1.00 }
];
let guofengGroup = null;          // 国风装饰组（竹林 / 红灯笼），场景搭好后再填充
const guofengEaves = [];          // 房子飞檐翘角，随主题显隐
const themeTints = [];            // 随主题换色的材质 { mat, base, guofeng }
const STYLE_KEY = "naijiacun_game_style_v2";   // 换 key：让所有人默认进入国风
let styleIdx = 0;
try {
  const savedStyle = localStorage.getItem(STYLE_KEY);
  const at = STYLES.findIndex(s => s.id === savedStyle);
  if (at >= 0) styleIdx = at;
} catch (e) {}
const STYLE_STATE = { exp: STYLES[styleIdx].exp };
function applyStyle() {
  const s = STYLES[styleIdx];
  canvas.style.filter = s.filter;
  STYLE_STATE.exp = s.exp;
  const guo = s.id === "guofeng";
  if (guofengGroup) guofengGroup.visible = guo;
  for (const e of guofengEaves) e.visible = guo;
  for (const t of themeTints) t.mat.color.copy(guo ? t.guofeng : t.base);
  // 国风用整屏水墨远山背景；其它风格恢复纯色天空
  if (guo) {
    scene.background = makeGuofengBackground();
  } else {
    scene.background = new T.Color(SKY);
  }
  // 水墨背景自带远山，天穹要让开；其它风格用天穹做渐变
  if (skyDome) skyDome.visible = !guo;
  if (lastLightO) setLight(lastLightO); // 让曝光 / 主题色调立即生效
  try { localStorage.setItem(STYLE_KEY, s.id); } catch (e) {}
}
// 初始套用（在 canvas 存在后立即生效）；背景/主题色在 boot() 里 applyStyle 统一设置
canvas.style.filter = STYLES[styleIdx].filter;

const SKY = 0xdcefe4;
const scene = new T.Scene();
scene.background = new T.Color(SKY);
// 远景线性雾：正交相机下玩家脚下距相机约 60（=VIEW.dist），
// 所以雾从 62 才开始、到 86 结束——近景和角色完全清晰，只有画面上方最远处柔化融进天空。
// 颜色随昼夜在 setLight 里同步。
const FOG_COLOR = new T.Color(SKY);
scene.fog = new T.Fog(FOG_COLOR, 72, 105);

/* ---- 国风主题：宣纸天空 + 青绿远山背景 + 调色 ---- */
const GUOFENG = {
  paper: new T.Color(0xeef1e8),
  fog: new T.Color(0xe0e9e2),
  ink: new T.Color(0x909d97),   // 夜里雾转淡墨，而不是深蓝，保住水墨味
  sun: new T.Color(0xfff6e2)
};
function isGuofeng() { return STYLES[styleIdx].id === "guofeng"; }

// 把宣纸底色和几层青绿水墨远山画成一张背景图，作为整屏天空。
// 用 scene.background 承载：永远在最后面，不受雾和相机角度影响，绝不穿帮。
let guofengBg = null;
function makeGuofengBackground() {
  if (guofengBg) return guofengBg;
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 512;
  const g = c.getContext("2d");
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, "#f5f5ec");
  sky.addColorStop(.55, "#eaf0e8");
  sky.addColorStop(1, "#dbe7df");
  g.fillStyle = sky; g.fillRect(0, 0, 1024, 512);
  // 一轮淡墨太阳
  const sun = g.createRadialGradient(770, 120, 8, 770, 120, 96);
  sun.addColorStop(0, "rgba(255,246,220,.9)");
  sun.addColorStop(1, "rgba(255,246,220,0)");
  g.fillStyle = sun; g.fillRect(650, 0, 250, 250);
  // 三层远山：越远越淡，越近越青
  const rnd = mulberry(20241117);
  const layers = [
    { base: 300, amp: 66, color: "rgba(163,182,177,.34)", k: 3 },
    { base: 354, amp: 84, color: "rgba(120,148,143,.42)", k: 7 },
    { base: 416, amp: 64, color: "rgba(86,116,112,.5)",  k: 11 }
  ];
  for (const L of layers) {
    g.beginPath(); g.moveTo(0, 512); g.lineTo(0, L.base);
    for (let x = 0; x <= 1024; x += 24) {
      const y = L.base
        - Math.sin(x * .010 + L.k) * L.amp * .62
        - Math.sin(x * .026 + L.k * 2) * L.amp * .28
        - rnd() * L.amp * .16;
      g.lineTo(x, y);
    }
    g.lineTo(1024, 512); g.closePath();
    g.fillStyle = L.color; g.fill();
  }
  // 几缕横向淡云
  g.fillStyle = "rgba(255,255,255,.32)";
  [[120, 96, 210, 9], [430, 70, 160, 7], [690, 168, 250, 8], [300, 150, 130, 6]]
    .forEach(([x, y, w, h]) => { g.beginPath(); g.ellipse(x, y, w / 2, h / 2, 0, 0, 6.283); g.fill(); });
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  guofengBg = tex;
  return tex;
}

/* 屋里用正交俯视：整间屋子像一间布景，看得全、不会有人被墙挡住。
   户外用透视第三人称：镜头跟在背后，低机位看得到地平线。
   两套相机同时存在，按当前地图切着用（currentCam()）。 */
const camera = new T.OrthographicCamera(-10, 10, 10, -10, .1, 200);

/* ---- 第三人称镜头参数 ----
   yaw   = 镜头朝着哪边看，和 player.heading 同一套（0 → +Z）
   pitch = 俯角，越大机位越高越像俯视
   dist  = 镜头到角色的距离（滚轮可调） */
const TP = {
  fov: 55, dist: 6.2, minDist: 2.8, maxDist: 13,
  yaw: Math.PI, pitch: .34, lookY: 1.05
};
// 手动转镜头后暂停自动跟随几秒，免得刚转过去就被镜头拽回来
let camFollowPause = 0;
const camTP = new T.PerspectiveCamera(TP.fov, 16 / 9, .08, 600);
camTP.position.set(0, 8, 14);

// 半球光：天空暖白、地面反射偏暖褐；柔和不刺眼
const hemi = new T.HemisphereLight(0xfff6e8, 0xb9a481, 2.1);
scene.add(hemi);
// 太阳光偏暖金，斜俯角下投射更长的影子，立体感更强
const sun = new T.DirectionalLight(0xffe9c8, 2.3);
sun.position.set(12, 20, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);   // 2048² 阴影图显存/填充翻倍，1024 足够这个项目
const sc = sun.shadow.camera;
// 斜俯角下地面可见纵深更长，阴影范围跟着放大，边缘才不会出现阴影断层
sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 60;
sun.shadow.bias = -.0014;
sun.shadow.normalBias = .02;
scene.add(sun);
scene.add(sun.target);

/* ---------- 世界：一格 1 米，整张图 88 × 68 格 ---------- */
const TILE = TS;
const MW = VILLAGE.w;
const MH = VILLAGE.h;
const W = MW * TILE;
const H = MH * TILE;

const world = new T.Group();
scene.add(world);
let MAP = VILLAGE;          // 当前所在地图（村庄 / 奶家镇 / 屋里 / 杂货铺…）
let roomName = "";          // 室内时显示的名字

/* 户外的每张图各占一个 group：同一时刻只显示一张。
   之所以不共用 world，是因为各图原点、尺寸都不一样，混在一个组里没法整体隐藏。 */
const OUTDOOR = { village: world };
const outdoorMats = new Map();   // mapKey → 地面材质（雷达缩略图要用）

/* =========================================================
   连续大世界：四张图仍在各自的局部坐标里，但渲染时整体平移到同一片大地上，
   门的位置一一对齐。角色过门只换「所在图」并把局部坐标重基，屏幕位置纹丝不动，
   所以看起来就是一整块能走通的世界，而不是四个孤岛。
   offset = 目标门视觉位置 - 该图门的局部位置
   ========================================================= */
// 位移按「地块边缘对齐」算，四张图严丝合缝拼在一起，中间没有缝也没有重叠：
//   村 x∈[-44,44] z∈[-34,34]；镇接在东边 x=44；竹林接西边 x=-44；草坡接南边 z=34。
const REGION_OFF = {
  village: { x: 0,   z: 0 },
  town:    { x: 82,  z: 0 },    // 镇本地 x[-38,38] → 视觉 [44,120]
  grove:   { x: -76, z: -21 },  // 竹林本地 x[-32,32] → 视觉 [-108,-44]
  hill:    { x: 0,   z: 66 }    // 坡本地 z[-32,32] → 视觉 [34,98]
};
const REGION_KEYS = ["village", "town", "grove", "hill"];
function regionOff(key) { return REGION_OFF[key] || { x: 0, z: 0 }; }
function visX() { return player.x + regionOff(roomState.name).x; }
function visZ() { return player.z + regionOff(roomState.name).z; }

/* 交界口：视觉坐标里的三条拼缝。玩家踩着门洞跨过去时，只换「所在图」并把局部
   坐标按位移差重基，视觉位置完全不变 —— 于是走过去是连续的，不是传送。 */
const PORTALS = [
  { a: "village", b: "town",  axis: "x", line: 44,  dir: 1,  lo: -4,  hi: 5 },   // 村东 ↔ 镇西（镇在 +x）
  { a: "village", b: "grove", axis: "x", line: -44, dir: -1, lo: -25, hi: -15 }, // 村西 ↔ 竹林（竹林在 -x）
  { a: "village", b: "hill",  axis: "z", line: 34,  dir: 1,  lo: -4,  hi: 5 }    // 村南 ↔ 坡北（坡在 +z）
];
// 视觉点是否落在某条拼缝的门洞带里（用于越界格不当墙）
function inPortalBand(vx, vz) {
  for (const p of PORTALS) {
    const along = p.axis === "x" ? vz : vx;
    if (along < p.lo || along > p.hi) continue;
    const across = p.axis === "x" ? vx : vz;
    if (Math.abs(across - p.line) < 2.2) return true;
  }
  return false;
}
// 从 cur 图出发、视觉点 (vx,vz) 是否已跨到邻图一侧，返回目标图 key
function portalTarget(cur, vx, vz) {
  for (const p of PORTALS) {
    if (cur !== p.a && cur !== p.b) continue;
    const along = p.axis === "x" ? vz : vx;
    if (along < p.lo || along > p.hi) continue;
    const across = p.axis === "x" ? vx : vz;
    const side = (across - p.line) * (p.dir || 1);   // 统一成「朝 b 图为正」
    if (cur === p.a && side > .3) return p.b;
    if (cur === p.b && side < -.3) return p.a;
  }
  return null;
}

const patches = [];         // 高草区 {x,z,r,zone}
const obstacles = [];       // 圆形阻挡 {x,z,r}

const cellX = x => Math.floor(x - MAP.ox);
const cellZ = z => Math.floor(z - MAP.oz);
const cx2x = cx => MAP.ox + cx + .5;
const cz2z = cz => MAP.oz + cz + .5;

function mark(cx, cz, v = 1) { setSolid(MAP, cx, cz, v); }
function markWorld(x, z, r, v = 1) {
  const x0 = cellX(x - r), x1 = cellX(x + r), z0 = cellZ(z - r), z1 = cellZ(z + r);
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    if (Math.hypot(cx2x(cx) - x, cz2z(cz) - z) <= r + .35) mark(cx, cz, v);
  }
}
// 矩形占格：房子这种方方正正的东西别用圆去糊
function markRect(x, z, w, d, v = 1) {
  const tx0 = cellX(x - w / 2), tx1 = cellX(x + w / 2 - .001);
  const tz0 = cellZ(z - d / 2), tz1 = cellZ(z + d / 2 - .001);
  for (let cz = tz0; cz <= tz1; cz++) for (let cx = tx0; cx <= tx1; cx++) mark(cx, cz, v);
}

function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* =========================================================
   地面：把瓦片地图画成一整张贴图铺上去
   每格单独画、单独拼，所以近看是一块块的地砖，不是一个模糊的大色块
   ========================================================= */
const groundMats = [];      // 所有地面材质（夜里要一起乘色）
let groundMat = null;       // 村庄地面（雷达要拿它的贴图当缩略图）
const rooms = new Map();    // 室内房间：name → { group, mat }

/* =========================================================
   地形起伏：让户外地面不再是「一张纸」
   用一个连续的低频高度函数抬高地面顶点，并按高度给顶点染色（高处亮、
   低处暗）造出丘陵明暗；水面和村中心广场压平，避免穿帮。
   角色 / NPC / 光标实时贴到同一高度函数上。室内一律平坦。
   ========================================================= */
const MAP_SEED = { village: 11, town: 29, grove: 47, hill: 63 };
let activeTerrain = null;   // 当前显示地图的高度函数（室内为 null）
let buildHeight = null;     // 正在搭建的地图的高度函数（静态物件贴地用）
let activeMap = null;       // 当前显示的户外地图（室内为 null）
let buildMap = null;        // 正在搭建的地图

/* 地面是一张按整数格点采样、再按三角面线性插值的网格。角色/NPC/物件必须踩在
   「渲染出来的那张面」上，而不是连续函数上 —— 否则水面/道路压平处两者能差近 1 米，
   脚就陷进地里。这里用和 PlaneGeometry 一样的三角剖分（对角线 (x0,z1)-(x1,z0)）做插值。 */
function surfaceY(map, x, z) {
  if (!map) return 0;
  const grid = map.__hgrid;
  if (!grid) return map.__height ? map.__height(x, z) : 0;
  const stride = map.w + 1;
  const fx = x - map.ox, fz = z - map.oz;
  const i = clamp(Math.floor(fx), 0, map.w - 1);
  const j = clamp(Math.floor(fz), 0, map.h - 1);
  const u = clamp(fx - i, 0, 1), v = clamp(fz - j, 0, 1);
  const h00 = grid[j * stride + i],       h10 = grid[j * stride + i + 1];
  const h01 = grid[(j + 1) * stride + i], h11 = grid[(j + 1) * stride + i + 1];
  return (u + v <= 1)
    ? h00 * (1 - u - v) + h10 * u + h01 * v
    : h11 * (u + v - 1) + h10 * (1 - v) + h01 * (1 - u);
}
function terrainY(x, z) {
  return activeMap ? surfaceY(activeMap, x, z) : 0;
}
function groundAtBuild(x, z) {
  return buildMap ? surfaceY(buildMap, x, z) : (buildHeight ? buildHeight(x, z) : 0);
}
function makeHeightFn(map, seed) {
  const s = seed || 0;
  // 野外（草坡/竹林）起伏大，才不像一张纸；村镇房子多，压小免得穿模
  const wild = map.name === "南高草坡" || map.name === "竹林水塘";
  const amp = wild ? 1.85 : (map.name === "奶家镇" ? .5 : .72);
  // 原始起伏（不含拼缝混合）。先给每张户外图都算好，邻图才拿得到。
  const raw = function (x, z) {
    const tx = x - map.ox, tz = z - map.oz;
    // 三种低频叠加：大缓坡 + 中丘 + 细波纹，波长都在 4~18 格
    let h = Math.sin(tx * .085 + s) * Math.cos(tz * .105 + s * 1.3) * .62
      + Math.sin(tx * .19 - tz * .16 + s * 2) * .30
      + Math.sin((tx + tz) * .048 + s * .7) * .46
      + Math.sin(tx * .33 + tz * .27 + s) * .10;
    // 压平水面：水塘必须是平的，不然岸线穿帮
    const t = tileAt(map, Math.floor(tx), Math.floor(tz));
    if (t === TI.WATER) return 0;
    // 村中心广场（锚点一带）压成平台，房子/摊位落脚也稳
    const cx = map.w / 2, cz = map.h / 2;
    const dc = Math.hypot((tx - cx) * 1, (tz - cz) * 1.2);
    if (map.name === "奶家村" && dc < 10) h *= clamp((dc - 6) / 4, 0, 1);
    // 野外也把"路"压平一点，走路不至于像坐过山车
    if (wild && t === TI.PATH) h *= .35;
    return h * amp;
  };
  map.__heightRaw = raw;
  const key = Object.keys(MAP_SEED).find(k => MAPS[k] === map) || "";
  const off = regionOff(key);
  // 连续世界的关键：拼缝两侧共用同一条边。各自原来的噪声在边界上肯定对不上，
  // 于是越靠近拼缝越把邻图的高度混进来；正线上两边都是 50/50，严丝合缝。
  return function (x, z) {
    let h = raw(x, z);
    const vx = x + off.x, vz = z + off.z;
    for (const p of PORTALS) {
      if (p.a !== key && p.b !== key) continue;
      const along = p.axis === "x" ? vz : vx;
      if (along < p.lo - 2 || along > p.hi + 2) continue;
      const across = p.axis === "x" ? vx : vz;
      const d = Math.abs(across - p.line);
      if (d >= 4) continue;
      const other = MAPS[p.a === key ? p.b : p.a];
      const oraw = other && other.__heightRaw;
      if (!oraw) continue;
      const ooff = regionOff(p.a === key ? p.b : p.a);
      const t = clamp((4 - d) / 4, 0, 1);
      const w = t * t * (3 - 2 * t) * .5;   // 中线上正好各占一半
      h = lerp(h, oraw(vx - ooff.x, vz - ooff.z), w);
    }
    return h;
  };
}

function buildGroundFor(map, group) {
  const tex = mapTexture(map, renderer);
  const mat = new T.MeshBasicMaterial({ map: tex });
  const w = map.w * TILE, h = map.h * TILE;
  const indoor = !!map.indoor;
  // 户外地面细分，逐顶点抬高；室内保持一整块平面
  const segX = indoor ? 1 : map.w, segZ = indoor ? 1 : map.h;
  const geo = new T.PlaneGeometry(w, h, segX, segZ);
  if (!indoor) {
    const key = Object.keys(MAP_SEED).find(k => MAPS[k] === map);
    const heightFn = makeHeightFn(map, MAP_SEED[key] || 7);
    map.__height = heightFn;
    buildHeight = heightFn;   // 后续同批物件按这张图的高度贴地
    buildMap = map;
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    // 记录每个网格顶点的真实高度。PlaneGeometry 顶点行优先：i = iy*(segX+1)+ix，
    // 旋转后 wx=map.ox+ix、wz=map.oz+iy。角色贴地就查这张表，保证踩在渲染面上。
    const stride = segX + 1;
    const grid = new Float32Array(stride * (segZ + 1));
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i), ly = pos.getY(i);
      // PlaneGeometry 绕 X 轴 -90°：局部 X→世界 X，局部 Y→世界 -Z
      const wx = map.ox + w / 2 + lx;
      const wz = map.oz + h / 2 - ly;
      const hh = heightFn(wx, wz);
      pos.setZ(i, hh);                       // 局部 +Z = 世界 +Y
      const ix = Math.round(wx - map.ox), iy = Math.round(wz - map.oz);
      if (ix >= 0 && ix <= map.w && iy >= 0 && iy <= map.h) grid[iy * stride + ix] = hh;
      const sh = clamp(1 + hh * .17, .70, 1.28);   // 高处亮、低处暗（加强丘陵明暗）
      colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = sh;
    }
    map.__hgrid = grid;
    pos.needsUpdate = true;
    geo.setAttribute("color", new T.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    mat.vertexColors = true;
  }
  const mesh = new T.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(map.ox + w / 2, 0, map.oz + h / 2);
  mesh.receiveShadow = !indoor;
  group.add(mesh);

  // 阴影承接面也要跟着地形起伏，否则会埋进隆起的地面里
  const shGeo = new T.PlaneGeometry(w, h, segX, segZ);
  if (!indoor) {
    const heightFn = map.__height;
    const p2 = shGeo.attributes.position;
    for (let i = 0; i < p2.count; i++) {
      const wx = map.ox + w / 2 + p2.getX(i);
      const wz = map.oz + h / 2 - p2.getY(i);
      p2.setZ(i, heightFn(wx, wz) + .018);
    }
    p2.needsUpdate = true;
    shGeo.computeVertexNormals();
  }
  const sh = new T.Mesh(shGeo,
    new T.ShadowMaterial({ opacity: indoor ? .1 : .2, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2;
  sh.position.set(mesh.position.x, 0, mesh.position.z);
  sh.receiveShadow = true;
  group.add(sh);

  groundMats.push(mat);
  return mat;
}

function buildGround() {
  // 先把四张图的原始高度都备好，拼缝混合才能拿到邻图；
  // 否则先建的村 / 镇会各算各的，交界处仍是一道坎。
  for (const k of REGION_KEYS) {
    const m = MAPS[k];
    if (m && !m.__heightRaw) makeHeightFn(m, MAP_SEED[k] || 7);
  }
  groundMat = buildGroundFor(VILLAGE, world);
  outdoorMats.set("village", groundMat);
}

/* 静态小物件合批：一棵树 7 个 mesh、一丛竹 12 个 mesh，几百棵就是几千次
   draw call。外观完全不变，只是把同材质、同属性布局的几何焊成一张大网格。
   只对树 / 竹这类永不移动、永不单独变色的容器调用，NPC、锚点、竹笋不动。 */
function batchStatic(container) {
  if (!container || container.userData.batched) return 0;
  container.updateWorldMatrix(true, true);
  const inv = new T.Matrix4().copy(container.matrixWorld).invert();
  const buckets = new Map();
  container.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
    if (!o.geometry || !o.material || Array.isArray(o.material)) return;
    const attrs = Object.keys(o.geometry.attributes).sort().join(",");
    const key = o.material.uuid + "|" + attrs + "|" + (o.geometry.index ? "i" : "n");
    let b = buckets.get(key);
    if (!b) { b = { mat: o.material, geos: [], objs: [] }; buckets.set(key, b); }
    const g = o.geometry.clone();
    g.applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    b.geos.push(g);
    b.objs.push(o);
  });
  let saved = 0;
  for (const b of buckets.values()) {
    if (b.geos.length < 2) { b.geos.forEach(g => g.dispose()); continue; }
    const merged = mergeGeometries(b.geos, false);
    if (!merged) { b.geos.forEach(g => g.dispose()); continue; }
    const m = new T.Mesh(merged, b.mat);
    m.castShadow = b.objs.some(o => o.castShadow);
    m.receiveShadow = b.objs.some(o => o.receiveShadow);
    container.add(m);
    for (const o of b.objs) o.parent.remove(o);
    b.geos.forEach(g => g.dispose());
    saved += b.objs.length - 1;
  }
  container.userData.batched = true;
  return saved;
}

// 四张图搭完、但 NPC 还没生成之前，把剩下的静态摆件再合一轮。
// 锚点晶体、竹笋、戏班道具会单独变色/显隐，先摘出去不参与合批。
function batchOutdoors() {
  const skip = new Set();
  ANCHOR_STONES.forEach(s => skip.add(s.group));
  (shootQuest.objs || []).forEach(o => skip.add(o.group));
  (troupeProps.objs || []).forEach(o => skip.add(o.group));
  for (const key of REGION_KEYS) {
    const grp = OUTDOOR[key];
    if (!grp) continue;
    const detached = [];
    for (const o of skip) {
      if (o.parent === grp) { detached.push(o); grp.remove(o); }
    }
    batchStatic(grp);
    detached.forEach(o => grp.add(o));
  }
}

/* =========================================================
   远景：天空、远山、地图外的大地
   换成低机位以后看得见地平线了——只铺一张地图，边上一圈直接是虚空。
   这里补三样：天穹渐变、远处山影、地图外的大片草地 + 一圈树墙。
   ========================================================= */
let skyDome = null, farGroup = null;

function buildFar() {
  if (farGroup) return;
  farGroup = new T.Group();
  scene.add(farGroup);

  // ---- 天空穹顶：竖直渐变（天顶略深、地平线发白），整体乘上昼夜天空色 ----
  const sc = document.createElement("canvas");
  sc.width = 8; sc.height = 256;
  const sg = sc.getContext("2d");
  const grd = sg.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#d2d2d2");
  grd.addColorStop(.55, "#ececec");
  grd.addColorStop(1, "#ffffff");
  sg.fillStyle = grd; sg.fillRect(0, 0, 8, 256);
  const stex = new T.CanvasTexture(sc);
  stex.colorSpace = T.SRGBColorSpace;
  skyDome = new T.Mesh(
    new T.SphereGeometry(300, 24, 16),
    new T.MeshBasicMaterial({ map: stex, side: T.BackSide, fog: false, depthWrite: false })
  );
  skyDome.renderOrder = -2;
  skyDome.frustumCulled = false;
  scene.add(skyDome);

  // ---- 地图外的大草地：把地图边界之外填满同色，别露出黑 ----
  const land = new T.Mesh(
    new T.PlaneGeometry(900, 900),
    new T.MeshStandardMaterial({ color: 0x8fac6e, roughness: 1 })
  );
  land.rotation.x = -Math.PI / 2;
  land.position.y = -.08;
  farGroup.add(land);

  const r = mulberry(20261117);

  // ---- 树墙 / 远山：全部 InstancedMesh ----
  // 原来 220 棵树每棵 4~5 个独立 mesh = 上千个 draw call，这是「内容越多越卡」的主因。
  // 现在按材质合并成 4 批实例，draw call 从 ~1100 降到个位数，外观完全不变。
  const dummy = new T.Object3D();
  const coniferDark = new T.MeshStandardMaterial({ color: 0x35563b, roughness: 1, flatShading: true });
  const coniferLite = new T.MeshStandardMaterial({ color: 0x4f7a4c, roughness: 1, flatShading: true });
  const trunkFar = new T.MeshStandardMaterial({ color: 0x4a3a29, roughness: 1 });

  const TREES = 220, MAX_TIERS = 4;
  const trunkInst = new T.InstancedMesh(new T.CylinderGeometry(.14, .2, 1, 5), trunkFar, TREES);
  const coneDarkInst = new T.InstancedMesh(new T.ConeGeometry(1, 1, 6), coniferDark, TREES * MAX_TIERS);
  const coneLiteInst = new T.InstancedMesh(new T.ConeGeometry(1, 1, 6), coniferLite, TREES * MAX_TIERS);
  let nDark = 0, nLite = 0;
  coneDarkInst.count = TREES * MAX_TIERS;
  coneLiteInst.count = TREES * MAX_TIERS;
  // 先把所有实例缩到 0，用不到的锥体不显示
  for (let i = 0; i < TREES * MAX_TIERS; i++) {
    dummy.position.set(0, -9999, 0); dummy.scale.setScalar(0); dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    coneDarkInst.setMatrixAt(i, dummy.matrix);
    coneLiteInst.setMatrixAt(i, dummy.matrix);
  }
  for (let i = 0; i < TREES; i++) {
    const a = r() * 6.283, rad = 46 + r() * 26;
    const h = 3.6 + r() * 4.2;
    const base = Math.cos(a) * rad, baseZ = Math.sin(a) * rad;
    const trunkH = h * .22;
    dummy.position.set(base, -.2 + trunkH / 2, baseZ);
    dummy.scale.set(1, trunkH, 1); dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);
    const tiers = 3 + Math.floor(r() * 2);
    for (let t = 0; t < tiers; t++) {
      const tw = (1 - t / (tiers + .6)) * (1.15 + r() * .35);
      const th = h * (.34 - t * .035);
      dummy.position.set(base, -.2 + trunkH + th * (.35 + t * .62), baseZ);
      dummy.scale.set(tw, th, tw); dummy.rotation.set(0, r() * 3, 0);
      dummy.updateMatrix();
      const dark = (i + t) % 2 > 0;
      if (dark) coneDarkInst.setMatrixAt(nDark++, dummy.matrix);
      else coneLiteInst.setMatrixAt(nLite++, dummy.matrix);
    }
  }
  coneDarkInst.count = nDark; coneLiteInst.count = nLite;
  [trunkInst, coneDarkInst, coneLiteInst].forEach(inst => {
    inst.frustumCulled = false; inst.instanceMatrix.needsUpdate = true; farGroup.add(inst);
  });

  // ---- 远山：低多边形锥体合并成一个实例批（统一 6 边锥，靠 scale 变化） ----
  const hillMat = new T.MeshStandardMaterial({ color: 0x8ba49a, roughness: 1, flatShading: true });
  const HILLS = 44;
  const hillInst = new T.InstancedMesh(new T.ConeGeometry(.5, 1, 6, 1), hillMat, HILLS);
  for (let i = 0; i < HILLS; i++) {
    const a = i / HILLS * 6.283 + (r() - .5) * .1;
    const rad = 86 + r() * 70;
    const h = 12 + r() * 26;
    const base = 26 + r() * 46;
    dummy.position.set(Math.cos(a) * rad, h / 2 - 3, Math.sin(a) * rad);
    dummy.scale.set(base, h, base); dummy.rotation.set(0, r() * 3, 0);
    dummy.updateMatrix();
    hillInst.setMatrixAt(i, dummy.matrix);
  }
  hillInst.frustumCulled = false; hillInst.instanceMatrix.needsUpdate = true; farGroup.add(hillInst);
}

function ensureRoom(name, map) {
  let r = rooms.get(name);
  if (r) return r;
  const group = new T.Group();
  group.visible = false;
  scene.add(group);
  const mat = buildGroundFor(map, group);
  r = { group, mat, map };
  rooms.set(name, r);
  return r;
}

/* ---------- 面前那一格的绿色光标 ---------- */
const cursor = new T.Group();
cursor.visible = false;
scene.add(cursor);
{
  const L = .94, W = .075, Y = .1;
  const fillMat = new T.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: .14, depthWrite: false
  });
  const edgeMat = new T.MeshBasicMaterial({
    color: 0x2d6b52, transparent: true, opacity: .5, depthWrite: false
  });
  const fill = new T.Mesh(new T.PlaneGeometry(L - W, L - W), fillMat);
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = Y;
  cursor.add(fill);

  // 四条边用薄板画：LineSegments 只有 1 像素，缩远了根本看不见
  const barH = new T.PlaneGeometry(L, W);
  const barV = new T.PlaneGeometry(W, L);
  [[0, -1, barH], [0, 1, barH], [-1, 0, barV], [1, 0, barV]].forEach(([sx, sz, geo]) => {
    const b = new T.Mesh(geo, edgeMat);
    b.rotation.x = -Math.PI / 2;
    b.position.set(sx * (L - W) / 2, Y, sz * (L - W) / 2);
    cursor.add(b);
  });

  cursor.userData = { fillMat, edgeMat };
}

/* =========================================================
   道具：树 / 房 / 石 / 篱笆
   ========================================================= */
const trunkMat = new T.MeshStandardMaterial({ color: 0x7d5a3c, roughness: 1 });
// 明暗两套叶色交错堆叠，低多边形也能有星露谷那种蓬松的层次感
const leafMatA = new T.MeshStandardMaterial({ color: 0x6fae66, roughness: .92, flatShading: true });
const leafMatB = new T.MeshStandardMaterial({ color: 0x4e8f57, roughness: .94, flatShading: true });
const leafMatC = new T.MeshStandardMaterial({ color: 0x8cc274, roughness: .9, flatShading: true });
const leafDark = new T.MeshStandardMaterial({ color: 0x3d7349, roughness: 1, flatShading: true });
// 几种树冠几何体复用，避免每棵树都新建导致显存暴涨
const CANOPY_GEOS = [
  new T.IcosahedronGeometry(1, 1),
  new T.IcosahedronGeometry(.72, 1),
  new T.IcosahedronGeometry(.5, 0)
];

const treeGroup = new T.Group();
world.add(treeGroup);
const treeSpots = [];
// 两棵树至少隔这么远，不然会长成一堵墙
function treeTooClose(x, z, d = 2.1) {
  for (const [tx, tz] of treeSpots) if (Math.hypot(x - tx, z - tz) < d) return true;
  return false;
}

function addTree(x, z, scale = 1, parent = treeGroup) {
  const r = mulberry(Math.round((x + 100) * 37 + (z + 100) * 91));
  const g = new T.Group();
  // 树干：略带锥度、八面、稍微倾斜，比笔直圆柱自然
  const trunk = new T.Mesh(new T.CylinderGeometry(.16, .28, 1.05, 8), trunkMat);
  trunk.position.y = .52; trunk.rotation.z = (r() - .5) * .09; trunk.castShadow = true;
  g.add(trunk);

  const species = [
    [leafMatA, leafMatB, leafMatC],  // 明亮阔叶
    [leafMatB, leafDark, leafMatA],  // 深绿
    [leafMatC, leafMatA, leafMatB]   // 嫩绿
  ][Math.floor(r() * 3)];
  // 内层暗团垫底，外层几团明暗交错 → 有体积而不是几个纯色球
  const inner = new T.Mesh(CANOPY_GEOS[0], leafDark);
  inner.position.set(0, 1.42, 0); inner.scale.setScalar(.82); inner.castShadow = true;
  g.add(inner);
  const lobes = [
    [0, 1.72, 0, 1.0, 0],
    [-.52, 1.48, .18, .68, 1],
    [.5, 1.55, -.14, .72, 2],
    [.12, 2.16, .1, .62, 2],
    [-.2, 1.85, -.5, .6, 1]
  ];
  lobes.forEach(([lx, ly, lz, s, gi]) => {
    const m = new T.Mesh(CANOPY_GEOS[gi], species[Math.floor(r() * 3)]);
    m.position.set(lx, ly, lz);
    m.scale.setScalar(s * (.85 + r() * .3));
    m.rotation.set(r() * 4, r() * 4, r() * 4);
    m.castShadow = true;
    g.add(m);
  });
  g.position.set(x, groundAtBuild(x, z), z);
  g.scale.setScalar(scale * (.72 + r() * .26));
  g.rotation.y = r() * 6.283;
  parent.add(g);
  treeSpots.push([x, z]);
  markWorld(x, z, .5, 1);
  obstacles.push({ x, z, r: .5 });
}

function addRock(x, z, parent = world) {
  const r = mulberry(Math.round(x * 13 + z * 7) + 3);
  const m = new T.Mesh(new T.DodecahedronGeometry(.42 + r() * .22, 0),
    new T.MeshStandardMaterial({ color: 0xa9a89c, roughness: 1, flatShading: true }));
  m.position.set(x, groundAtBuild(x, z) + .28, z);
  m.rotation.set(r() * 3, r() * 3, r() * 3);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  markWorld(x, z, .42, 1);
}

function addFence(x, z, len, horiz) {
  const g = new T.Group();
  const mat = new T.MeshStandardMaterial({ color: 0xd8c39c, roughness: .9 });
  for (let i = 0; i < len; i++) {
    const p = new T.Mesh(new T.BoxGeometry(.12, .8, .12), mat);
    p.position.set(horiz ? i * TILE : 0, .4, horiz ? 0 : i * TILE);
    p.castShadow = true;
    g.add(p);
    markWorld(x + (horiz ? i * TILE : 0), z + (horiz ? 0 : i * TILE), .12, 1);
  }
  const rail = new T.Mesh(new T.BoxGeometry(horiz ? len * TILE : .09, .1, horiz ? .09 : len * TILE), mat);
  rail.position.set(horiz ? (len - 1) * TILE / 2 : 0, .55, horiz ? 0 : (len - 1) * TILE / 2);
  g.add(rail);
  g.position.set(x, groundAtBuild(x, z), z);
  world.add(g);
}

// 屋顶的瓦垄：程序化画一小张，靠 repeat 铺满，别让屋顶是一块纯色板
let roofTexCache = null;
function roofTex() {
  if (roofTexCache) return roofTexCache;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 64, 64);
  for (let j = 0; j < 8; j++) {
    const y = j * 8;
    // 一排瓦：上沿深一点，下沿亮一点
    g.fillStyle = "rgba(0,0,0,.07)"; g.fillRect(0, y, 64, 2);
    g.fillStyle = "rgba(255,255,255,.09)"; g.fillRect(0, y + 2, 64, 2);
    // 瓦缝错开
    const off = (j % 2) * 4;
    for (let i = 0; i < 8; i++) {
      const x = off + i * 8;
      g.strokeStyle = "rgba(0,0,0,.12)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x + .5, y + 2); g.lineTo(x + .5, y + 8); g.stroke();
    }
  }
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(1, 1);
  t.colorSpace = T.SRGBColorSpace;
  roofTexCache = t;
  return t;
}

// 房子用的共享材质/几何体（4 栋复用，避免每栋新建一堆）
const houseMats = {
  skirt: new T.MeshStandardMaterial({ color: 0x9c7f57, roughness: .95 }),
  beam: new T.MeshStandardMaterial({ color: 0x7d5c3a, roughness: .95 }),
  frame: new T.MeshStandardMaterial({ color: 0xf3e8ce, roughness: .95 }),
  door: new T.MeshStandardMaterial({ color: 0x8d6a44, roughness: .85 }),
  knob: new T.MeshStandardMaterial({ color: 0xe0b25c, roughness: .4, metalness: .5 }),
  glass: new T.MeshStandardMaterial({ color: 0xf7eec4, roughness: .3, emissive: 0x2a2412 }),
  eave: new T.MeshStandardMaterial({ color: 0xcdbfa4, roughness: .95 }),
  step: new T.MeshStandardMaterial({ color: 0xd9cdb4, roughness: 1 }),
  chimney: new T.MeshStandardMaterial({ color: 0xa8674c, roughness: .95 }),
  sill: new T.MeshStandardMaterial({ color: 0xe4d7b8, roughness: .95 })
};

function addHouse(x, z, w, d, bodyColor, roofColor, rot = 0, parent = world) {
  const g = new T.Group();
  const H = 2.0;                       // 墙高：俯视时刚好能露出正面
  const M = houseMats;
  const box = (geo, mat, px, py, pz, shadow) => {
    const m = new T.Mesh(geo, mat);
    m.position.set(px, py, pz);
    if (shadow) { m.castShadow = true; m.receiveShadow = true; }
    g.add(m); return m;
  };

  // 主墙体（国风时转粉墙）
  const bodyMat = new T.MeshStandardMaterial({ color: bodyColor, roughness: .92 });
  themeTints.push({ mat: bodyMat, base: new T.Color(bodyColor), guofeng: new T.Color(0xf3efe2) });
  box(new T.BoxGeometry(w, H, d), bodyMat, 0, H / 2, 0, true);

  // 墙裙：下半截深色木护墙，上半截浅墙，横向分层不再是一整块色
  const skirtH = .52;
  box(new T.BoxGeometry(w + .04, skirtH, d + .04), M.skirt, 0, skirtH / 2, 0, true);
  // 墙裙顶沿的一圈压条
  box(new T.BoxGeometry(w + .08, .07, d + .08), M.beam, 0, skirtH, 0, false);

  // 四角木柱：让墙角有结构感
  const cx = w / 2 - .09, cz = d / 2 - .09;
  [[-cx, -cz], [cx, -cz], [-cx, cz], [cx, cz]].forEach(([bx, bz]) => {
    box(new T.BoxGeometry(.17, H, .17), M.beam, bx, H / 2, bz, true);
  });

  // 人字双坡屋顶：两片斜板沿屋脊对称。比四棱锥自然，瓦纹顺坡面铺不会扭。
  const roofH = .82;                          // 屋顶高度
  const overhang = .18;                       // 出檐
  const slopeLen = Math.hypot(d / 2 + overhang, roofH); // 斜板长度（沿 d 方向倾斜）
  const tilt = Math.atan2(roofH, d / 2 + overhang);      // 倾角
  const roofMat = new T.MeshStandardMaterial({ color: roofColor, roughness: .9, flatShading: true });
  // 黛瓦：国风时屋顶转青灰瓦色（保留瓦纹贴图）
  const tileColor = new T.Color(roofColor);
  const tileGuo = new T.Color(0x4a5c5b);
  [-1, 1].forEach(side => {
    const tex = roofTex().clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(w / 1.5)), 2);
    const slopeMat = new T.MeshStandardMaterial({ color: roofColor, roughness: .9, map: tex });
    themeTints.push({ mat: slopeMat, base: tileColor, guofeng: tileGuo });
    const slab = new T.Mesh(
      new T.BoxGeometry(w + overhang * 2, .1, slopeLen),
      slopeMat
    );
    // 板子绕 X 轴倾斜，两片在屋脊交汇、檐口下垂
    slab.rotation.x = side * tilt;
    slab.position.set(0, H + roofH / 2 + .05, side * (d / 4 + overhang / 2));
    slab.castShadow = true; slab.receiveShadow = true;
    g.add(slab);
  });
  // 山墙三角：填住两端屋顶和墙之间的空三角，不然会漏空
  const gableShape = new T.Shape();
  gableShape.moveTo(-d / 2, 0);
  gableShape.lineTo(d / 2, 0);
  gableShape.lineTo(0, roofH);
  gableShape.closePath();
  const gableGeo = new T.ExtrudeGeometry(gableShape, { depth: .1, bevelEnabled: false });
  const gableMat = new T.MeshStandardMaterial({ color: bodyColor, roughness: .92 });
  themeTints.push({ mat: gableMat, base: new T.Color(bodyColor), guofeng: new T.Color(0xf3efe2) });
  themeTints.push({ mat: roofMat, base: new T.Color(roofColor), guofeng: tileGuo });
  [-1, 1].forEach(side => {
    const gable = new T.Mesh(gableGeo, gableMat);
    gable.rotation.y = Math.PI / 2;
    gable.position.set(side * (w / 2 - .05), H, 0);
    gable.castShadow = true;
    g.add(gable);
  });

  // 屋脊压条
  box(new T.BoxGeometry(w + overhang * 2, .12, .16), roofMat, 0, H + roofH + .06, 0, false);

  // 国风飞檐：屋脊两端各一个上翘的檐角（青瓦色），平时藏起来
  const eaveMat = new T.MeshStandardMaterial({ color: 0x405453, roughness: .85, flatShading: true });
  [-1, 1].forEach(side => {
    const horn = new T.Mesh(new T.ConeGeometry(.15, .5, 4), eaveMat);
    horn.rotation.set(0, Math.PI / 4, side * .62);
    horn.position.set(side * (w / 2 + overhang - .02), H + roofH + .2, 0);
    horn.castShadow = true;
    horn.visible = isGuofeng();
    g.add(horn);
    guofengEaves.push(horn);
    // 脊端小兽（宝珠）：檐角顶一颗
    const bead = new T.Mesh(new T.SphereGeometry(.1, 8, 6), M.knob);
    bead.position.set(side * (w / 2 + overhang + .07), H + roofH + .38, 0);
    bead.visible = isGuofeng();
    g.add(bead);
    guofengEaves.push(bead);
  });

  // 屋檐：一圈薄板
  box(new T.BoxGeometry(w * 1.02, .1, d * 1.02), M.eave, 0, H, 0, true);
  // 檐下横梁，增加阴影层次
  box(new T.BoxGeometry(w * .9, .08, .08), M.beam, 0, H - .12, d / 2 - .04, false);

  // 烟囱（偏屋顶一侧）
  const chim = box(new T.BoxGeometry(.42, .78, .42), M.chimney,
    -w * .26, H + .82, -d * .16, true);
  box(new T.BoxGeometry(.52, .1, .52), M.sill, -w * .26, H + 1.22, -d * .16, false);

  // 门（正面，朝 +z）
  box(new T.BoxGeometry(.82, 1.34, .09), M.door, 0, .69, d / 2 + .06, false);
  // 门框
  box(new T.BoxGeometry(1.08, 1.52, .05), M.frame, 0, .76, d / 2 + .02, false);
  // 门楣雨棚
  const canopy = box(new T.BoxGeometry(1.32, .1, .5),
    new T.MeshStandardMaterial({ color: roofColor, roughness: .9 }), 0, 1.58, d / 2 + .22, true);
  canopy.rotation.x = -.12;
  // 门把手
  const knob = new T.Mesh(new T.SphereGeometry(.06, 8, 6), M.knob);
  knob.position.set(.28, .72, d / 2 + .12);
  g.add(knob);

  // 窗：左右各一，带窗框、十字格、窗台
  const winX = w / 2 - .95;
  [-winX, winX].forEach(wx => {
    const wz = d / 2 + .035;
    box(new T.BoxGeometry(.74, .7, .06), M.frame, wx, 1.36, wz, false);       // 外框
    box(new T.BoxGeometry(.6, .56, .07), M.glass, wx, 1.36, wz + .02, false);  // 玻璃
    box(new T.BoxGeometry(.62, .05, .09), M.frame, wx, 1.36, wz + .04, false); // 十字横
    box(new T.BoxGeometry(.05, .58, .09), M.frame, wx, 1.36, wz + .04, false); // 十字竖
    box(new T.BoxGeometry(.82, .08, .22), M.sill, wx, 1.0, wz + .08, false);   // 窗台
  });

  // 门前台阶：一格宽
  box(new T.BoxGeometry(1.1, .12, .7), M.step, 0, .06, d / 2 + .42, true);

  g.position.set(x, groundAtBuild(x, z), z);
  g.rotation.y = rot;
  parent.add(g);
  // 房子按格子方正地占住，不用圆去糊
  markRect(x, z, w, d, 1);
  obstacles.push({ x, z, r: Math.hypot(w, d) * .45 });
  return g;
}

/* ---------- 村里的零碎 ---------- */
const lampGlasses = [];      // 晚上要点亮的灯罩
const woodMat = new T.MeshStandardMaterial({ color: 0xb08a5c, roughness: .95 });
const darkWood = new T.MeshStandardMaterial({ color: 0x8a6540, roughness: .95 });
const stoneMat = new T.MeshStandardMaterial({ color: 0x9d9b90, roughness: 1, flatShading: true });

function addWell(x, z, parent = world) {
  const g = new T.Group();
  // 井圈
  const ring = new T.Mesh(new T.CylinderGeometry(.78, .84, .78, 12), stoneMat);
  ring.position.y = .39; ring.castShadow = true; ring.receiveShadow = true;
  g.add(ring);
  // 井水
  const water = new T.Mesh(new T.CircleGeometry(.6, 14),
    new T.MeshStandardMaterial({ color: 0x5fa8b4, roughness: .3 }));
  water.rotation.x = -Math.PI / 2; water.position.y = .72;
  g.add(water);
  // 立柱 + 小顶
  [-1, 1].forEach(sx => {
    const post = new T.Mesh(new T.BoxGeometry(.12, 1.5, .12), darkWood);
    post.position.set(sx * .78, .75, 0);
    post.castShadow = true;
    g.add(post);
  });
  const roof = new T.Mesh(new T.ConeGeometry(1.16, .58, 4),
    new T.MeshStandardMaterial({ color: 0xc4795f, roughness: .9, flatShading: true }));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 1.72;
  roof.castShadow = true;
  g.add(roof);
  // 横梁 + 绳
  const beam = new T.Mesh(new T.CylinderGeometry(.06, .06, 1.6, 6), darkWood);
  beam.rotation.z = Math.PI / 2; beam.position.y = 1.35;
  g.add(beam);
  const rope = new T.Mesh(new T.CylinderGeometry(.015, .015, .5, 4), darkWood);
  rope.position.y = 1.1;
  g.add(rope);
  g.position.set(x, groundAtBuild(x, z), z);
  parent.add(g);
  markRect(x, z, 2, 2, 1);
  obstacles.push({ x, z, r: 1 });
}

function addBench(x, z, rot = 0, parent = world) {
  const g = new T.Group();
  const seat = new T.Mesh(new T.BoxGeometry(1.5, .1, .52), woodMat);
  seat.position.y = .46; seat.castShadow = true;
  g.add(seat);
  const back = new T.Mesh(new T.BoxGeometry(1.5, .42, .08), woodMat);
  back.position.set(0, .72, -.23); back.castShadow = true;
  g.add(back);
  [-.6, .6].forEach(sx => {
    const leg = new T.Mesh(new T.BoxGeometry(.1, .46, .46), darkWood);
    leg.position.set(sx, .23, 0);
    leg.castShadow = true;
    g.add(leg);
  });
  g.position.set(x, groundAtBuild(x, z), z);
  g.rotation.y = rot;
  parent.add(g);
  markRect(x, z, 2, 1, 1);
}

function addLamp(x, z, parent = world) {
  const g = new T.Group();
  const post = new T.Mesh(new T.CylinderGeometry(.08, .12, 2.3, 6), darkWood);
  post.position.y = 1.15; post.castShadow = true;
  g.add(post);
  // 横臂
  const arm = new T.Mesh(new T.BoxGeometry(.42, .07, .07), darkWood);
  arm.position.set(.16, 2.28, 0);
  g.add(arm);
  // 灯罩（晚上真的会亮）
  const glass = new T.MeshStandardMaterial({
    color: 0xffe9b0, emissive: 0x000000, roughness: .35, transparent: true, opacity: .92
  });
  const head = new T.Mesh(new T.BoxGeometry(.3, .34, .3), glass);
  head.position.set(.34, 2.06, 0);
  head.castShadow = true;
  g.add(head);
  lampGlasses.push(glass);
  const cap = new T.Mesh(new T.ConeGeometry(.28, .2, 4),
    new T.MeshStandardMaterial({ color: 0x6f665a, roughness: .9, flatShading: true }));
  cap.rotation.y = Math.PI / 4;
  cap.position.set(.34, 2.31, 0);
  g.add(cap);
  g.position.set(x, groundAtBuild(x, z), z);
  parent.add(g);
  markRect(x, z, 1, 1, 1);
}

/* ---- 国风装饰：竹林 / 红灯笼（只在国风显示，不占格子不挡路）---- */
const bambooStalkMat = new T.MeshStandardMaterial({ color: 0x6f9b57, roughness: .9, flatShading: true });
const bambooJointMat = new T.MeshStandardMaterial({ color: 0x4f7a3c, roughness: .95 });
const bambooLeafMat = new T.MeshStandardMaterial({ color: 0x4e8a4a, roughness: .9, side: T.DoubleSide });
const lanternPaperMat = new T.MeshStandardMaterial({ color: 0xd8433a, roughness: .7, emissive: 0x521814 });
const lanternCapMat = new T.MeshStandardMaterial({ color: 0xe0b25c, roughness: .7, metalness: .25 });

function addBamboo(x, z, r) {
  const g = new T.Group();
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const h = 2.6 + r() * 1.5;
    const bx = (r() - .5) * .8, bz = (r() - .5) * .8;
    const stalk = new T.Mesh(new T.CylinderGeometry(.055, .075, h, 6), bambooStalkMat);
    stalk.position.set(bx, h / 2, bz);
    stalk.rotation.z = (r() - .5) * .12;
    stalk.castShadow = true;
    g.add(stalk);
    // 竹节
    for (let y = .6; y < h; y += .6) {
      const joint = new T.Mesh(new T.CylinderGeometry(.082, .082, .05, 6), bambooJointMat);
      joint.position.set(bx, y, bz);
      g.add(joint);
    }
    // 竹叶：顶端几片细长叶子
    for (let k = 0; k < 5; k++) {
      const leaf = new T.Mesh(new T.SphereGeometry(1, 5, 4), bambooLeafMat);
      leaf.scale.set(.42, .03, .13);
      leaf.position.set(bx + (r() - .5) * .7, h - .35 + r() * .55, bz + (r() - .5) * .7);
      leaf.rotation.set((r() - .5) * .5, r() * 6.283, (r() - .5) * .8);
      leaf.castShadow = true;
      g.add(leaf);
    }
  }
  g.position.set(x, surfaceY(VILLAGE, x, z), z);
  guofengGroup.add(g);
}

function addRedLantern(x, z, hangY = 2.5) {
  const g = new T.Group();
  const cord = new T.Mesh(new T.CylinderGeometry(.02, .02, .5, 5), lanternCapMat);
  cord.position.y = hangY + .28;
  g.add(cord);
  const body = new T.Mesh(new T.SphereGeometry(.26, 12, 9), lanternPaperMat);
  body.scale.set(1, 1.18, 1);
  body.position.y = hangY;
  body.castShadow = true;
  g.add(body);
  // 上下铜盖
  [hangY + .31, hangY - .31].forEach(y => {
    const cap = new T.Mesh(new T.CylinderGeometry(.12, .12, .09, 8), lanternCapMat);
    cap.position.y = y;
    g.add(cap);
  });
  // 流苏
  const tassel = new T.Mesh(new T.CylinderGeometry(.02, .05, .26, 6), lanternPaperMat);
  tassel.position.y = hangY - .48;
  g.add(tassel);
  g.position.set(x, surfaceY(VILLAGE, x, z), z);
  guofengGroup.add(g);
}

function buildGuofengDecor() {
  const r = mulberry(7788);
  // 竹林：村北与外圈的几丛，避开路和房子
  [[-30, -24], [-26, -28], [30, -26], [36, -22], [-38, 8], [40, 16],
   [-34, 30], [34, 34], [-16, -30], [18, -30], [46, 40], [-42, -6]]
    .forEach(([x, z]) => { if (freeSpot(x, z, .9)) addBamboo(x, z, r); });
  // 红灯笼：挂在广场、路口、房前
  [[3.2, 7.6], [-3.2, 7.6], [3.2, -6.2], [-3.2, -6.2],
   [11.2, 5], [18, 11], [-7.5, 22.4], [15.5, 20.4], [1.4, 26]]
    .forEach(([x, z]) => addRedLantern(x, z));
}

function addFlowerBed(x, z, w = 2, d = 1) {
  const g = new T.Group();
  const box = new T.Mesh(new T.BoxGeometry(w, .32, d),
    new T.MeshStandardMaterial({ color: 0xcbb08a, roughness: 1 }));
  box.position.y = .16; box.castShadow = true; box.receiveShadow = true;
  g.add(box);
  const soil = new T.Mesh(new T.BoxGeometry(w - .18, .12, d - .18),
    new T.MeshStandardMaterial({ color: 0x6b4f34, roughness: 1 }));
  soil.position.y = .34;
  g.add(soil);
  const r = mulberry(Math.round(x * 31 + z * 17));
  const cols = [0xf2b2c4, 0xf6d98b, 0xead6f0, 0xf09a8b, 0xfff3d0];
  for (let i = 0; i < 10; i++) {
    const f = new T.Mesh(new T.SphereGeometry(.1 + r() * .05, 6, 5),
      new T.MeshStandardMaterial({ color: cols[Math.floor(r() * cols.length)], roughness: .8 }));
    f.position.set((r() - .5) * (w - .4), .44 + r() * .1, (r() - .5) * (d - .3));
    f.castShadow = true;
    g.add(f);
  }
  g.position.set(x, groundAtBuild(x, z), z);
  world.add(g);
  markRect(x, z, w, d, 1);
}

/* ---------- 野生小花 / 草簇：轻量装饰，不阻挡行走 ---------- */
const wildGeo = new T.IcosahedronGeometry(.075, 0);
const wildStem = new T.CylinderGeometry(.012, .012, .22, 4);
const wildStemMat = new T.MeshStandardMaterial({ color: 0x5f9a55, roughness: 1 });
const wildCols = [0xffd7e6, 0xfff1b8, 0xe4d4ff, 0xffc7a8, 0xffffff, 0xbfe4ff].map(
  c => new T.MeshStandardMaterial({ color: c, roughness: .85, emissive: new T.Color(c).multiplyScalar(.08) })
);
/* ---- 立体草丛：几片交叉草叶做一簇，用 InstancedMesh 批量撒满野外地面 ----
   画面里地面不再是一张平贴图，近处能看到一根根草，配合地形起伏有层次。 */
let grassTuftGeo = null;
function makeGrassTuftGeo() {
  if (grassTuftGeo) return grassTuftGeo;
  const g = new T.BufferGeometry();
  const pos = [], nor = [];
  const blade = (cx, cz, ang, h, w) => {
    const dx = Math.cos(ang) * w / 2, dz = Math.sin(ang) * w / 2;
    // 一片三角草叶：底两点 + 尖（略向侧面倾）
    const bx = cx + Math.cos(ang + Math.PI / 2) * h * .18;
    const bz = cz + Math.sin(ang + Math.PI / 2) * h * .18;
    pos.push(cx - dx, 0, cz - dz, cx + dx, 0, cz + dz, bx, h, bz);
    for (let k = 0; k < 3; k++) nor.push(0, 1, 0);
  };
  blade(0, 0, .0, .5, .16);
  blade(0, 0, 1.05, .42, .15);
  blade(0, 0, 2.1, .46, .14);
  blade(.08, -.05, 2.8, .34, .12);
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
  grassTuftGeo = g;
  return g;
}
function buildGrassTufts(map, group, count, seed) {
  const hfn = map.__height;
  if (!hfn) return;
  const r = mulberry(seed || 991);
  const mat = new T.MeshStandardMaterial({
    color: map.name === "南高草坡" ? 0x9dbd5f : 0x7fae5c, roughness: 1, side: T.DoubleSide
  });
  const inst = new T.InstancedMesh(makeGrassTuftGeo(), mat, count);
  const dummy = new T.Object3D();
  let placed = 0;
  for (let tries = 0; tries < count * 12 && placed < count; tries++) {
    const tx = Math.floor(r() * map.w), tz = Math.floor(r() * map.h);
    const k = tileAt(map, tx, tz);
    if (k !== TI.GRASS && k !== TI.FLOWER && k !== TI.WEED && k !== TI.WEED_EDGE) continue;
    if (solidAt(map, tx, tz)) continue;
    // 路上不长草，保持土路清爽
    if (k === TI.PATH) continue;
    const x = map.ox + tx + .5, z = map.oz + tz + .5;
    dummy.position.set(x, hfn(x, z), z);
    dummy.rotation.y = r() * 6.283;
    const sc = .7 + r() * .8;
    dummy.scale.set(sc, sc * (.8 + r() * .6), sc);
    dummy.updateMatrix();
    inst.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  inst.count = placed;
  inst.instanceMatrix.needsUpdate = true;
  inst.castShadow = false;
  inst.receiveShadow = true;
  group.add(inst);
}

function addWildFlowers(x, z, r, parent = world) {
  const g = new T.Group();
  for (let i = 0; i < 5; i++) {
    const fx = (r() - .5) * .9, fz = (r() - .5) * .9;
    const stem = new T.Mesh(wildStem, wildStemMat);
    stem.position.set(fx, .11, fz);
    g.add(stem);
    const f = new T.Mesh(wildGeo, wildCols[Math.floor(r() * wildCols.length)]);
    f.position.set(fx, .25, fz);
    f.scale.setScalar(.8 + r() * .7);
    g.add(f);
  }
  g.position.set(x, groundAtBuild(x, z), z);
  parent.add(g);
}

/* ---------- 公园：石桌 + 棋盘面 ---------- */
let boardTexCache = null;
function stoneBoardTex() {
  if (boardTexCache) return boardTexCache;
  const S = 256, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  g.fillStyle = "#d9c9a4";
  g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, 7); g.fill();
  g.strokeStyle = "rgba(92,72,44,.7)"; g.lineWidth = 1.6;
  const P = 26, step = (S - P * 2) / 8;
  for (let i = 0; i < 9; i++) {
    g.beginPath(); g.moveTo(P, P + i * step); g.lineTo(S - P, P + i * step); g.stroke();
    g.beginPath(); g.moveTo(P + i * step, P); g.lineTo(P + i * step, S - P); g.stroke();
  }
  g.fillStyle = "rgba(70,52,28,.8)";
  [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]].forEach(([r, cc]) => {
    g.beginPath(); g.arc(P + cc * step, P + r * step, 3, 0, 7); g.fill();
  });
  // 盘上还剩两颗子：说明这盘还没下完
  [[3, 4, "#2a2722"], [5, 4, "#f2ece0"]].forEach(([r, cc, col]) => {
    g.fillStyle = col;
    g.beginPath(); g.arc(P + cc * step, P + r * step, step * .4, 0, 7); g.fill();
  });
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  boardTexCache = t;
  return t;
}

function addStoneTable(x, z) {
  const g = new T.Group();
  const top = new T.Mesh(new T.CylinderGeometry(.64, .64, .1, 20), stoneMat);
  top.position.y = .62; top.castShadow = true; top.receiveShadow = true;
  g.add(top);
  const leg = new T.Mesh(new T.CylinderGeometry(.17, .24, .6, 12), stoneMat);
  leg.position.y = .3; leg.castShadow = true;
  g.add(leg);
  const face = new T.Mesh(new T.CircleGeometry(.58, 26),
    new T.MeshBasicMaterial({ map: stoneBoardTex() }));
  face.rotation.x = -Math.PI / 2;
  face.position.y = .676;
  g.add(face);
  // 两个石凳，一南一北
  [-1.06, 1.06].forEach(dz => {
    const st = new T.Mesh(new T.CylinderGeometry(.25, .29, .34, 12), stoneMat);
    st.position.set(0, .17, dz);
    st.castShadow = true; st.receiveShadow = true;
    g.add(st);
  });
  g.position.set(x, groundAtBuild(x, z), z);
  world.add(g);
  markRect(x, z, 1, 1, 1);        // 桌子占一格，人可以坐到两边
  return g;
}

/* ---------- 公园里那个下棋的老头 ---------- */
// 没有现成模型，用几何体现拼：矮胖身子、白头发白胡子、圆眼镜、深蓝布褂。
function makeOldMan() {
  const g = new T.Group();
  const cloth = new T.MeshStandardMaterial({ color: 0x5d6b7d, roughness: .96, flatShading: true });
  const cloth2 = new T.MeshStandardMaterial({ color: 0x46525f, roughness: .96 });
  const skin = new T.MeshStandardMaterial({ color: 0xe9cba8, roughness: 1 });
  const white = new T.MeshStandardMaterial({ color: 0xefeee7, roughness: 1 });
  const dark = new T.MeshStandardMaterial({ color: 0x3a3f47, roughness: 1 });

  // 身子（坐在马扎上，所以矮一截）
  const body = new T.Mesh(new T.CylinderGeometry(.29, .35, .46, 10), cloth);
  body.position.y = .68; body.castShadow = true;
  g.add(body);
  // 两条胳膊往前伸，一副按在桌上的架势
  [-1, 1].forEach(s => {
    const arm = new T.Mesh(new T.BoxGeometry(.1, .1, .38), cloth2);
    arm.position.set(s * .27, .74, .18);
    arm.rotation.x = -.24;
    arm.castShadow = true;
    g.add(arm);
  });
  // 腿
  [-1, 1].forEach(s => {
    const leg = new T.Mesh(new T.BoxGeometry(.13, .44, .15), dark);
    leg.position.set(s * .12, .24, .08);
    leg.castShadow = true;
    g.add(leg);
  });
  // 马扎
  const stool = new T.Mesh(new T.BoxGeometry(.44, .06, .38), woodMat);
  stool.position.y = .46; stool.castShadow = true;
  g.add(stool);
  [-1, 1].forEach(s => {
    const l = new T.Mesh(new T.BoxGeometry(.06, .46, .06), darkWood);
    l.position.set(s * .18, .23, .14);
    g.add(l);
  });

  // 头
  const head = new T.Mesh(new T.SphereGeometry(.21, 14, 12), skin);
  head.position.y = 1.02; head.castShadow = true;
  g.add(head);
  // 白发（半球扣在顶上）
  const hair = new T.Mesh(new T.SphereGeometry(.215, 14, 12, 0, 6.283, 0, 1.15), white);
  hair.position.y = 1.025;
  g.add(hair);
  // 白胡子 + 八字胡
  const beard = new T.Mesh(new T.ConeGeometry(.105, .22, 8), white);
  beard.position.set(0, .885, .14);
  beard.rotation.x = .42;
  g.add(beard);
  [-1, 1].forEach(s => {
    const m = new T.Mesh(new T.BoxGeometry(.09, .035, .05), white);
    m.position.set(s * .075, .955, .18);
    g.add(m);
  });
  // 圆眼镜
  [-1, 1].forEach(s => {
    const ring = new T.Mesh(new T.TorusGeometry(.052, .011, 6, 14), dark);
    ring.position.set(s * .08, 1.05, .175);
    g.add(ring);
  });
  const bridge = new T.Mesh(new T.BoxGeometry(.05, .012, .012), dark);
  bridge.position.set(0, 1.05, .175);
  g.add(bridge);

  g.scale.setScalar(1.15);      // 坐着也得有点像样，别比石桌还小
  return g;
}

function addScarecrow(x, z) {
  const g = new T.Group();
  const pole = new T.Mesh(new T.CylinderGeometry(.06, .07, 1.9, 6), darkWood);
  pole.position.y = .95; pole.castShadow = true;
  g.add(pole);
  const arms = new T.Mesh(new T.BoxGeometry(1.2, .08, .08), darkWood);
  arms.position.y = 1.4;
  g.add(arms);
  const body = new T.Mesh(new T.BoxGeometry(.5, .62, .34),
    new T.MeshStandardMaterial({ color: 0x9c7b4f, roughness: 1 }));
  body.position.y = 1.12; body.castShadow = true;
  g.add(body);
  const head = new T.Mesh(new T.SphereGeometry(.26, 10, 8),
    new T.MeshStandardMaterial({ color: 0xe3cf9e, roughness: 1 }));
  head.position.y = 1.62; head.castShadow = true;
  g.add(head);
  const hat = new T.Mesh(new T.ConeGeometry(.36, .3, 8),
    new T.MeshStandardMaterial({ color: 0xb98a4e, roughness: 1, flatShading: true }));
  hat.position.y = 1.86;
  g.add(hat);
  g.position.set(x, groundAtBuild(x, z), z);
  world.add(g);
  markRect(x, z, 1, 1, 1);
}

/* ---------- 地上的地名标注 ---------- */
// 一张贴着地面躺着的字牌。摄像机的俯角是 66°，所以字横着铺在地上就看得清；
// 不用做朝向，也不挡视线 —— 它就是地图上的一处标注。
const labelCache = new Map();

function labelTexture(text, tone) {
  const k = text + "|" + (tone || "land");
  if (labelCache.has(k)) return labelCache.get(k);

  const H = 96;
  const fs = 62;
  const pad = 30;
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = `650 ${fs}px "PingFang SC","Microsoft YaHei",system-ui,sans-serif`;
  const w = Math.ceil(probe.measureText(text).width) + pad * 2;

  const c = document.createElement("canvas");
  c.width = w; c.height = H;
  const g = c.getContext("2d");
  g.textAlign = "center";
  g.textBaseline = "middle";

  // 底：一块半透明的旧木牌色，压得住地面又不抢眼
  g.fillStyle = tone === "name" ? "rgba(58,50,32,.56)" : "rgba(60,54,38,.42)";
  const r = 20;
  g.beginPath();
  g.moveTo(r, 4);
  g.arcTo(w - 4, 4, w - 4, H - 4, r);
  g.arcTo(w - 4, H - 4, 4, H - 4, r);
  g.arcTo(4, H - 4, 4, 4, r);
  g.arcTo(4, 4, w - 4, 4, r);
  g.closePath();
  g.fill();

  g.strokeStyle = "rgba(246,238,218,.34)";
  g.lineWidth = 3;
  g.stroke();

  g.fillStyle = tone === "name" ? "#f7f0de" : "#f3ecda";
  g.font = `650 ${fs}px "PingFang SC","Microsoft YaHei",system-ui,sans-serif`;
  g.fillText(text, w / 2, H / 2 + 2);

  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData = { w, h: H };
  labelCache.set(k, t);
  return t;
}

// 字牌铺在世界坐标 (x,z)，width 是世界单位宽；y 抬一点点盖在草/土上
function addPlaceLabel(x, z, text, width = 2.6, tone = "land", parent = world) {
  const tex = labelTexture(text, tone);
  const ratio = tex.userData.h / tex.userData.w;
  const mesh = new T.Mesh(
    new T.PlaneGeometry(width, width * ratio),
    new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: .96 })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, .045, z);
  mesh.renderOrder = 2;
  parent.add(mesh);
  return mesh;
}

// 房顶上的名牌：像地图上的图钉，永远朝着镜头，不会被屋檐挡
function addRoofLabel(x, y, z, text, width = 2.0) {
  const tex = labelTexture(text, "name");
  const sp = new T.Sprite(new T.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: .97
  }));
  sp.center.set(.5, 0);
  sp.scale.set(width, width * tex.userData.h / tex.userData.w, 1);
  sp.position.set(x, y, z);
  sp.renderOrder = 6;
  world.add(sp);
  return sp;
}

function addSign(x, z, text, parent = world) {
  const g = new T.Group();
  const post = new T.Mesh(new T.CylinderGeometry(.07, .07, 1.1, 6), trunkMat);
  post.position.y = .55; post.castShadow = true;
  g.add(post);
  const board = new T.Mesh(new T.BoxGeometry(1.1, .62, .09),
    new T.MeshStandardMaterial({ color: 0xe8d9b4, roughness: .9 }));
  board.position.y = 1.15; board.castShadow = true;
  g.add(board);
  g.position.set(x, groundAtBuild(x, z), z);
  parent.add(g);
  return g;
}

/* =========================================================
   布置村子
   ========================================================= */

// 这块地要空着：树、石头都别长进去
function nearFarm(x, z, m = 1.6) {
  const pw = PLOT.cols * PLOT.ts, ph = PLOT.rows * PLOT.ts;
  return x > PLOT.x0 - m && x < PLOT.x0 + pw + m && z > PLOT.z0 - m && z < PLOT.z0 + ph + m;
}

// 只往空草地上长东西：路、水、房子、广场上都不种
function freeSpot(x, z, m = .7) {
  if (nearFarm(x, z, m)) return false;
  for (const [dx, dz] of [[0, 0], [m, 0], [-m, 0], [0, m], [0, -m]]) {
    const t = toTile(VILLAGE, x + dx, z + dz);
    if (solidAt(VILLAGE, t.tx, t.tz)) return false;
    const k = tileAt(VILLAGE, t.tx, t.tz);
    if (k !== TI.GRASS && k !== TI.FLOWER) return false;
  }
  return true;
}

function buildProps() {
  const r = mulberry(99);

  // 国风装饰组：挂在 world 下，进屋时会跟着一起隐藏
  guofengGroup = new T.Group();
  guofengGroup.visible = isGuofeng();
  world.add(guofengGroup);

  // ---- 外圈的树林（把地图围起来，别让人走没影）----
  for (let i = 0; i < 210; i++) {
    const a = r() * 6.283;
    const rad = (W / 2 - 2) * (.84 + r() * .18);
    const x = Math.cos(a) * rad * .95;
    const z = Math.sin(a) * (H / 2 - 2) * .95;
    if (Math.abs(x) > W / 2 - 2 || Math.abs(z) > H / 2 - 2) continue;
    if (!freeSpot(x, z, 1) || treeTooClose(x, z, 2.3)) continue;
    addTree(x, z, .9 + r() * .5);
  }
  // ---- 村北那片林子 ----
  for (let i = 0; i < 70; i++) {
    const x = -12 + (r() - .5) * 30, z = -26 + (r() - .5) * 14;
    if (!freeSpot(x, z, 1) || treeTooClose(x, z, 2.2)) continue;
    addTree(x, z, .95 + r() * .45);
  }
  // ---- 零散的树 ----
  [[-40, 8], [-36, -12], [-14, -6], [12, -6], [30, -26], [36, 10], [40, 28],
   [-38, 30], [-30, -22], [8, 50], [14, 58], [48, 60], [70, 40], [66, 24],
   [-4, -12], [26, 34], [52, 18], [34, 6], [-24, 24], [-36, 20]]
    .forEach(([x, z]) => {
      if (freeSpot(x, z, 1) && !treeTooClose(x, z, 2.0)) addTree(x, z, .95 + r() * .35);
    });

  // ---- 石头 ----
  [[8, 8], [-14, 14], [22, 12], [-6, -8], [14, -18], [36, 26], [-28, 34], [56, 6]]
    .forEach(([x, z]) => { if (freeSpot(x, z, .9)) addRock(x, z); });

  // ---- 房子（占地和 tiles.js 里画的木地板底对齐）----
  // 坐标必须和瓦片里的 rect(...) 对齐，差半格门就踩不进去了
  addHouse(-7.5, 20, 5, 4, 0xf0e3c8, 0xc4795f);       // 自己家
  addHouse(15.5, 18, 5, 4, 0xf6ead2, 0xb8694f);       // 小七杂货铺
  addHouse(-19.5, -14, 5, 4, 0xe9dcc2, 0xb46b52);     // 村史馆
  addHouse(19.5, -14, 5, 4, 0xe6edf3, 0x4e6f8f);      // 奶察局（蓝顶）

  // ---- 农场栅栏：三面围起来，南边留个口 ----
  addFence(PLOT.x0 - .5, PLOT.z0 - .5, PLOT.rows + 2, false);
  addFence(PLOT.x0 + PLOT.cols + .5, PLOT.z0 - .5, PLOT.rows + 2, false);
  addFence(PLOT.x0 - .5, PLOT.z0 + PLOT.rows + .5, 4, true);                       // 南边左半
  addFence(PLOT.x0 + 6.5, PLOT.z0 + PLOT.rows + .5, PLOT.cols - 5, true);          // 南边右半，中间留门
  addFence(PLOT.x0 - .5, PLOT.z0 - .5, PLOT.cols + 2, true);

  // ---- 招牌（都在主路边上，别再摆到地图外面去）----
  addSign(1.4, 26, "奶家村");
  addSign(-13.6, 4.2, "西 · 水塘 / 田地");
  addSign(-19.2, 22.4, "我的地");
  addSign(12.6, 21.4, "小七杂货铺");
  addSign(17.6, -11.2, "奶察局");
  addSign(-23.2, -11.2, "村史馆");

  // ---- 三座出村门楼：东去奶家镇、西北去竹林水塘、南去高草坡 ----
  addGateArch(VILLAGE, 85, 35, "", world, false);
  addGateArch(VILLAGE, 2, 14, "", world, false);
  addGateArch(VILLAGE, 44, 65, "", world, true);

  // ---- 棋爷的小公园（广场东边，石板院子 + 一张石桌）----
  addStoneTable(14.5, 7.5);
  addBench(11.3, 10.4, Math.PI * .26);
  addBench(17.8, 5.2, Math.PI * 1.26);
  addFlowerBed(10.6, 6.2, 2, 1);
  addFlowerBed(18.4, 9.4, 2, 1);
  addLamp(11.2, 5.0);
  addLamp(18.0, 11.0);
  [[10.4, 11.4], [18.6, 3.6]].forEach(([x, z]) => {
    if (!treeTooClose(x, z, 2.0)) addTree(x, z, 1.05);
  });

  // ---- 广场：水井、长椅、花坛、路灯 ----
  addWell(0, 0);
  addBench(-3, 4.5, 0);
  addBench(4.2, 4.5, 0);
  addBench(-3, -3.5, Math.PI);
  addFlowerBed(-6.6, 1.2, 2, 1);
  addFlowerBed(6.6, 1.2, 2, 1);
  addFlowerBed(-6.6, -1.8, 2, 1);
  addFlowerBed(6.6, -1.8, 2, 1);
  addLamp(3.2, 7.6);
  addLamp(-3.2, 7.6);
  addLamp(3.2, -6.2);
  addLamp(-3.2, -6.2);
  addLamp(3.2, 22);
  addLamp(-3.2, 22);

  // ---- 农场里的稻草人 ----
  addScarecrow(PLOT.x0 + PLOT.cols - 1.5, PLOT.z0 + 1.4);

  // ---- 野生花草点缀：沿树林和草地散布，纯装饰不挡路 ----
  for (let i = 0; i < 120; i++) {
    const x = (r() - .5) * (W - 6), z = (r() - .5) * (H - 6);
    const t = toTile(VILLAGE, x, z);
    // 只长在草地/花地上，避开水、路、房子和树荫正下方
    if (t !== TI.GRASS && t !== TI.FLOWER) continue;
    if (!freeSpot(x, z, .5) || treeTooClose(x, z, 1.0)) continue;
    addWildFlowers(x, z, r);
  }

  // ---- 高草区（走进去会遇怪）----
  [
    { x: 12, z: -20, r: 6.5, zone: "meadow", map: "village" },
    { x: -12, z: 12, r: 4.6, zone: "forest", map: "village" },
    { x: 32, z: 4, r: 6.0, zone: "lake", map: "village" },
    { x: 28, z: 26, r: 4.8, zone: "flower", map: "village" }
  ].forEach(p => patches.push(p));

  // ---- 地名标注 ----
  // 房子用屋顶上的名牌（永远朝镜头，不会被屋檐挡住）；
  // 空地和区域用贴地字牌，像地图上直接写在那一块地上。
  addRoofLabel(-7.5, 3.05, 20, "我的家", 1.9);
  addRoofLabel(15.5, 3.05, 18, "小七杂货铺", 2.4);
  addRoofLabel(-19.5, 3.05, -14, "村史馆", 1.9);
  addRoofLabel(19.5, 3.05, -14, "奶察局", 1.9);

  // 广场不放牌子：人一开局就站在那儿，脚底下压着字反而挡路
  addPlaceLabel(14.5, 10.9, "棋爷的公园", 2.9);
  addPlaceLabel(-27.4, 4.6, "水塘", 2.0);
  addPlaceLabel(-25.4, 21.6, "我的地", 2.2);
  addPlaceLabel(24, 21.4, "花田", 2.0);
  addPlaceLabel(3.0, -16.6, "村北树林", 2.6);

  // ---- 国风装饰（竹林 / 红灯笼），最后加，不影响上面的占地判断 ----
  buildGuofengDecor();
  // 树和国风竹丛从此刻起不再单独绘制：几千个小 mesh 合成几十张网格
  batchStatic(treeGroup);
  batchStatic(guofengGroup);
}

/* =========================================================
   布置奶家镇
   格子数据都在 tiles.js（TOWN / TOWN_LOTS / TOWN_STALLS），
   这里只把同一份数据立成看得见的东西 —— 画面和碰撞不能各写一遍。
   ========================================================= */
const townTrees = new T.Group();     // 镇外的树单独一组，别和村里的 treeSpots 混

function townBox(parent, w, h, d, mat, x, y, z, shadow = true) {
  const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (shadow) { m.castShadow = true; m.receiveShadow = true; }
  parent.add(m);
  return m;
}
const twx = tx => TOWN.ox + tx + .5;
const twz = tz => TOWN.oz + tz + .5;

// 传送锚点：石座 + 浮着的晶体。锁着的时候是灰的，点亮后会亮起来。
const ANCHOR_STONES = [];
function addAnchorStone(map, tx, tz, parent, key) {
  const g = new T.Group();
  const ax = map.ox + tx + .5, az = map.oz + tz + .5;
  // 村里的锚点是在建镇子时补的，不能用全局 buildMap，必须按自己这张图采样
  g.position.set(ax, surfaceY(map, ax, az), az);
  parent.add(g);

  const base = new T.Mesh(new T.CylinderGeometry(1.02, 1.14, .22, 8), stoneMat);
  base.position.y = .11; base.receiveShadow = true; base.castShadow = true;
  g.add(base);
  const ring = new T.Mesh(new T.TorusGeometry(.86, .07, 6, 16), stoneMat);
  ring.rotation.x = Math.PI / 2; ring.position.y = .24;
  g.add(ring);
  // 三根小柱围一圈
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    const p = new T.Mesh(new T.BoxGeometry(.16, .95, .16), stoneMat);
    p.position.set(Math.cos(a) * .92, .68, Math.sin(a) * .92);
    p.castShadow = true;
    g.add(p);
  }
  // 晶体：锁着是石灰色，点亮后是青色的光
  const mat = new T.MeshStandardMaterial({
    color: 0x8e9a9c, emissive: 0x000000, roughness: .35, metalness: .25, flatShading: true
  });
  const cry = new T.Mesh(new T.OctahedronGeometry(.42, 0), mat);
  cry.position.y = 1.42; cry.castShadow = true;
  g.add(cry);

  const stone = { key, group: g, crystal: cry, mat, glow: 0 };
  ANCHOR_STONES.push(stone);
  return stone;
}

/* 通用"区域门楼"：立在两片地图的交界门口，让"这里能走过去"一眼可见。
   alongX=true 表示门洞沿 X 展开（人从南北穿过），false 则沿 Z。 */
function addGateArch(map, tx, tz, text, parent, alongX = true) {
  const g = new T.Group();
  g.position.set(map.ox + tx + .5, groundAtBuild(map.ox + tx + .5, map.oz + tz + .5), map.oz + tz + .5);
  if (!alongX) g.rotation.y = Math.PI / 2;
  parent.add(g);
  const red = new T.MeshStandardMaterial({ color: 0xa8483c, roughness: .86 });
  const beamMat = new T.MeshStandardMaterial({ color: 0x7a4a30, roughness: .9 });
  [-1.55, 1.55].forEach(s => {
    const col = new T.Mesh(new T.CylinderGeometry(.16, .2, 3.2, 8), red);
    col.position.set(s, 1.6, 0); col.castShadow = true; g.add(col);
    const foot = new T.Mesh(new T.BoxGeometry(.62, .24, .62), stoneMat);
    foot.position.set(s, .12, 0); g.add(foot);
  });
  const beam = new T.Mesh(new T.BoxGeometry(3.9, .34, .42), beamMat);
  beam.position.y = 3.28; beam.castShadow = true; g.add(beam);
  const roof = new T.Mesh(new T.BoxGeometry(4.4, .16, .7), new T.MeshStandardMaterial({ color: 0x4c6058, roughness: .9 }));
  roof.position.y = 3.54; g.add(roof);
  // 匾（用 addSign 的木牌样式太重，这里放个亮色小匾，不写字的方向也看得清）
  const plaque = new T.Mesh(new T.BoxGeometry(1.5, .48, .08),
    new T.MeshStandardMaterial({ color: 0xe8d6a8, roughness: .85 }));
  plaque.position.set(0, 2.85, .22); g.add(plaque);
  return g;
}

function buildTown() {
  const g = new T.Group();
  g.visible = false;
  g.position.set(REGION_OFF.town.x, 0, REGION_OFF.town.z);   // 连续世界：平移到村东边
  scene.add(g);
  OUTDOOR.town = g;
  outdoorMats.set("town", buildGroundFor(TOWN, g));

  // 建房要按 TOWN 的坐标记格，所以临时把 MAP 切过去，建完立刻切回来。
  // 这段只在启动时跑一次，不会有玩家正好在走。
  const restore = MAP;
  MAP = TOWN;

  // ---- 沿街的瓦房 ----
  for (const b of TOWN_LOTS) {
    const cx = twx(b.tx + b.w / 2 - .5);   // 房屋中心的世界坐标
    const cz = twz(b.tz + b.d / 2 - .5);
    addHouse(cx, cz, b.w - .12, b.d - .12, b.body, b.roof,
      b.face === 1 ? 0 : Math.PI, g);
  }

  // ---- 市集摊位 ----
  for (const s of TOWN_STALLS) {
    const sg = new T.Group();
    const sx = twx(s.tx + s.w / 2 - .5), sz = twz(s.tz + s.d / 2 - .5);
    sg.position.set(sx, groundAtBuild(sx, sz), sz);
    // 北边那排朝南（+z），南边那排朝北
    sg.rotation.y = s.tz < 30 ? 0 : Math.PI;
    g.add(sg);
    townBox(sg, s.w - .3, .58, .76, woodMat, 0, .29, .06);                 // 柜台
    townBox(sg, s.w - .22, .07, .9, houseMats.frame, 0, .61, .06);         // 台板
    [-1, 1].forEach(sx => {
      const pole = new T.Mesh(new T.CylinderGeometry(.05, .05, 2.1, 6), darkWood);
      pole.position.set(sx * (s.w / 2 - .22), 1.05, -.34);
      pole.castShadow = true;
      sg.add(pole);
    });
    const clothMat = new T.MeshStandardMaterial({ color: s.cloth, roughness: .92, side: T.DoubleSide });
    const aw = townBox(sg, s.w - .06, .06, 1.44, clothMat, 0, 2.0, -.06);
    aw.rotation.x = .16;
    townBox(sg, s.w - .06, .34, .05, clothMat, 0, 1.83, .62, false);       // 前檐垂布
    // 摊上摆点货：几颗圆货 + 两个小筐
    for (let i = 0; i < 5; i++) {
      const ball = new T.Mesh(new T.SphereGeometry(.1, 8, 6),
        new T.MeshStandardMaterial({ color: [0xd8694f, 0xe0b25c, 0x7d9e6a][i % 3], roughness: .8 }));
      ball.position.set(-.9 + i * .45, .7, .02 + (i % 2) * .18);
      ball.castShadow = true;
      sg.add(ball);
    }
  }

  // ---- 戏台（西边）：台基 + 四根红柱 + 一个顶 ----
  {
    const st = new T.Group();
    const stx = twx(21), stz = twz(25.5);
    st.position.set(stx, groundAtBuild(stx, stz), stz);
    g.add(st);
    townBox(st, 6.5, .52, 2.4, stoneMat, 0, .26, 0);              // 台基
    townBox(st, 6.1, .09, 2.05, woodMat, 0, .56, 0);              // 台面
    const red = new T.MeshStandardMaterial({ color: 0xa8443a, roughness: .85 });
    [[-2.6, -.85], [2.6, -.85], [-2.6, .85], [2.6, .85]].forEach(([px, pz]) => {
      const col = new T.Mesh(new T.CylinderGeometry(.13, .15, 3.0, 8), red);
      col.position.set(px, 2.06, pz);
      col.castShadow = true;
      st.add(col);
    });
    townBox(st, 6.8, .16, 2.9, houseMats.eave, 0, 3.58, 0);       // 檐板
    const roofMat = new T.MeshStandardMaterial({ color: 0x4a5c5b, roughness: .9, flatShading: true });
    [-1, 1].forEach(side => {
      const slab = townBox(st, 7.1, .1, 1.72, roofMat, 0, 3.98, side * .78);
      slab.rotation.x = side * .34;
    });
    townBox(st, 7.2, .12, .16, roofMat, 0, 4.32, 0, false);       // 屋脊
    // 台口两根杆子，挂着灯，晚上有戏的样子
    [-1, 1].forEach(sx => {
      const pole = new T.Mesh(new T.CylinderGeometry(.05, .05, 2.2, 6), darkWood);
      pole.position.set(3.15 * sx, 1.1, 1.28);
      pole.castShadow = true;
      st.add(pole);
    });
  }

  // ---- 镇口牌坊：两根柱子 + 横梁 + 匾 ----
  {
    const pa = new T.Group();
    const pax = twx(5), paz = twz(30.5);
    pa.position.set(pax, groundAtBuild(pax, paz), paz);
    g.add(pa);
    const red = new T.MeshStandardMaterial({ color: 0x9e3f36, roughness: .88 });
    [-1.9, 1.9].forEach(pz => {
      const col = new T.Mesh(new T.CylinderGeometry(.17, .2, 3.5, 8), red);
      col.position.set(0, 1.75, pz);
      col.castShadow = true;
      pa.add(col);
      const foot = new T.Mesh(new T.BoxGeometry(.7, .26, .7), stoneMat);
      foot.position.set(0, .13, pz);
      pa.add(foot);
    });
    townBox(pa, .42, .34, 5.1, red, 0, 3.62, 0);                  // 大横梁
    townBox(pa, .5, .2, 4.2, red, 0, 3.16, 0, false);             // 下横枋
    const roof = townBox(pa, .8, .12, 5.4, new T.MeshStandardMaterial({ color: 0x4a5c5b, roughness: .9 }), 0, 3.86, 0);
    roof.rotation.z = 0;
    // 匾
    const plaque = townBox(pa, .1, .52, 1.5,
      new T.MeshStandardMaterial({ color: 0xe8d9b4, roughness: .85 }), -.24, 3.3, 0, false);
    plaque.rotation.y = 0;
  }

  // ---- 街灯、长椅、水井、路牌 ----
  [[14, 27], [26, 27], [38, 27], [50, 27], [62, 27],
   [14, 33.4], [26, 33.4], [50, 33.4], [62, 33.4]].forEach(([tx, tz]) => {
    addLamp(twx(tx), twz(tz), g);
  });
  addBench(twx(34.5), twz(34.6), Math.PI, g);
  addBench(twx(41.5), twz(25.4), 0, g);
  addBench(twx(34.5), twz(25.4), 0, g);
  addWell(twx(45.5), twz(27), g);
  addSign(twx(24.5), twz(28.6), "戏台", g);
  addSign(twx(53.5), twz(28.6), "驿站", g);
  // 驿站院子里的委托榜：和逻辑 mark (54~56,30) 对上，站南边朝北按 E 就能接单
  addSign(twx(55), twz(28.6), "今日远行委托", g);

  // ---- 镇外一圈树，把镇子围起来 ----
  const tr = mulberry(20261117);
  for (let i = 0; i < 150; i++) {
    const tx = Math.floor(tr() * TOWN.w), tz = Math.floor(tr() * TOWN.h);
    const edge = Math.min(tx, tz, TOWN.w - 1 - tx, TOWN.h - 1 - tz);
    if (edge > 6 && tr() > .08) continue;          // 绝大部分贴边，少量零散
    if (solidAt(TOWN, tx, tz)) continue;
    if (tileAt(TOWN, tx, tz) !== TI.GRASS) continue;
    const x = twx(tx), z = twz(tz);
    if (Math.hypot(z - twz(30)) < 4) continue;     // 主街两头留出口
    if (treeTooClose(x, z, 2.2)) continue;
    addTree(x, z, .95 + tr() * .4, townTrees);
  }
  MAP = restore;

  g.add(townTrees);
  townTrees.visible = true;
  batchStatic(townTrees);

  // ---- 传送锚点（两张图各一根）----
  addAnchorStone(TOWN, 38, 30, g, "town");
  addAnchorStone(VILLAGE, 47, 32, world, "village");
  syncAnchorLook();
}

/* =========================================================
   布置竹林水塘 & 南高草坡：村西北、村南的两块野外图
   格子数据在 tiles.js（GROVE / HILL），这里立成看得见的东西
   ========================================================= */
// 一丛竹子：复用国风竹林那套材质，但这丛是实打实的 —— 占格挡路、每张图都显示
function addBambooClump(x, z, parent, scale = 1) {
  const r = mulberry(Math.round((x + 50) * 53 + (z + 50) * 17) + 7);
  const g = new T.Group();
  const n = 2 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const h = 2.6 + r() * 2.4;
    const bx = (r() - .5) * .7, bz = (r() - .5) * .7;
    const seg = new T.Mesh(new T.CylinderGeometry(.06, .09, h, 5), bambooStalkMat);
    seg.position.set(bx, h / 2, bz);
    seg.rotation.z = (r() - .5) * .1;
    seg.castShadow = true;
    g.add(seg);
    for (let k = 0; k < 3; k++) {
      const leaf = new T.Mesh(new T.ConeGeometry(.1, .8 + r() * .5, 4), bambooLeafMat);
      leaf.position.set(bx + (r() - .5) * .5, h - .3 - r() * .9, bz + (r() - .5) * .5);
      leaf.rotation.set(r() * 1.4 - .7, r() * 6.283, r() * 1.4 - .7);
      g.add(leaf);
    }
  }
  g.position.set(x, groundAtBuild(x, z), z);
  g.scale.setScalar(scale);
  parent.add(g);
  markWorld(x, z, .45, 1);
}

// 新图专用的空地判定：freeSpot 焊死在 VILLAGE 上，这里认指定地图
function freeSpotOn(map, x, z, m = .7) {
  for (const [dx, dz] of [[0, 0], [m, 0], [-m, 0], [0, m], [0, -m]]) {
    const t = toTile(map, x + dx, z + dz);
    if (solidAt(map, t.tx, t.tz)) return false;
    const k = tileAt(map, t.tx, t.tz);
    if (k !== TI.GRASS && k !== TI.WEED && k !== TI.SAND && k !== TI.FLOWER) return false;
  }
  return true;
}

function buildGrove() {
  const g = new T.Group();
  g.visible = false;
  g.position.set(REGION_OFF.grove.x, 0, REGION_OFF.grove.z);   // 平移到村西北
  scene.add(g);
  OUTDOOR.grove = g;
  outdoorMats.set("grove", buildGroundFor(GROVE, g));

  const restore = MAP;
  MAP = GROVE;
  // 树位表换成局部的：竹林里的竹丛不能被村里/镇上的树挤掉
  const savedSpots = treeSpots.splice(0, treeSpots.length);
  const gw = tx => GROVE.ox + tx + .5;
  const gz = tz => GROVE.oz + tz + .5;
  const r = mulberry(20261118);

  // ---- 竹丛：北半边密、贴水塘密，路上和水里不长 ----
  const bambooGroup = new T.Group();
  g.add(bambooGroup);
  for (let i = 0; i < 220; i++) {
    const tx = Math.floor(r() * GROVE.w), tz = Math.floor(r() * GROVE.h);
    if (solidAt(GROVE, tx, tz)) continue;
    const k = tileAt(GROVE, tx, tz);
    if (k !== TI.GRASS && k !== TI.WEED && k !== TI.SAND) continue;
    const x = gw(tx), z = gz(tz);
    if (treeTooClose(x, z, 1.9)) continue;
    addBambooClump(x, z, bambooGroup, .9 + r() * .4);
  }
  batchStatic(bambooGroup);   // 两百多丛竹子上千个 mesh，合成几张网格
  // ---- 几棵正经大树当背景 ----
  [[44, 44], [52, 16], [24, 22], [10, 16], [56, 52], [36, 56]].forEach(([tx, tz]) => {
    const x = gw(tx), z = gz(tz);
    if (freeSpotOn(GROVE, x, z) && !treeTooClose(x, z, 2.4)) addTree(x, z, 1 + r() * .3, g);
  });
  // ---- 石头 ----
  [[50, 24], [33, 47], [16, 44], [46, 38]].forEach(([tx, tz]) => {
    const x = gw(tx), z = gz(tz);
    if (freeSpotOn(GROVE, x, z)) addRock(x, z, g);
  });
  // ---- 空地边上两盏灯、一块路牌、一块地名 ----
  addLamp(gw(36.5), gz(27.5), g);
  addLamp(gw(43.5), gz(33), g);
  addSign(gw(58), gz(34.9), "竹林水塘", g);
  addPlaceLabel(gw(19), gz(28), "竹林水塘", 3.4, "land", g);
  // ---- 水边零星野花 ----
  for (let i = 0; i < 40; i++) {
    const tx = Math.floor(r() * GROVE.w), tz = Math.floor(r() * GROVE.h);
    const k = tileAt(GROVE, tx, tz);
    if (k !== TI.GRASS && k !== TI.FLOWER) continue;
    if (solidAt(GROVE, tx, tz)) continue;
    const x = gw(tx), z = gz(tz);
    if (treeTooClose(x, z, 1.2)) continue;
    addWildFlowers(x, z, r, g);
  }
  treeSpots.push(...savedSpots);
  MAP = restore;

  addGateArch(GROVE, 61, 33, "", g, false);   // 东口回村门楼
  addAnchorStone(GROVE, 40, 30, g, "grove");
  buildShoots();

  // ---- 高草区（走进去会遇怪）----
  [
    { x: -1.5, z: -17.5, r: 5.5, zone: "bamboo", map: "grove" },
    { x: 14.5, z: 16.5, r: 5.0, zone: "bamboo", map: "grove" },
    { x: -19.5, z: 20.5, r: 4.0, zone: "bamboo", map: "grove" }
  ].forEach(p => patches.push(p));
  buildGrassTufts(GROVE, g, 900, 3011);
}

function buildHill() {
  const g = new T.Group();
  g.visible = false;
  g.position.set(REGION_OFF.hill.x, 0, REGION_OFF.hill.z);   // 平移到村南边
  scene.add(g);
  OUTDOOR.hill = g;
  outdoorMats.set("hill", buildGroundFor(HILL, g));

  const restore = MAP;
  MAP = HILL;
  const savedSpots = treeSpots.splice(0, treeSpots.length);
  const hw = tx => HILL.ox + tx + .5;
  const hz = tz => HILL.oz + tz + .5;
  const r = mulberry(20261119);

  // ---- 坡上的树稀稀拉拉：孤树才是草坡的剪影 ----
  for (let i = 0; i < 46; i++) {
    const tx = Math.floor(r() * HILL.w), tz = Math.floor(r() * HILL.h);
    if (solidAt(HILL, tx, tz)) continue;
    const k = tileAt(HILL, tx, tz);
    if (k !== TI.GRASS && k !== TI.FLOWER) continue;
    const x = hw(tx), z = hz(tz);
    if (treeTooClose(x, z, 4.5)) continue;      // 坡上要的是疏朗
    addTree(x, z, 1.1 + r() * .5, g);
  }
  // ---- 大石头：草坡的地标 ----
  [[40, 34], [20, 30], [48, 16], [12, 46], [56, 40], [26, 20]].forEach(([tx, tz]) => {
    const x = hw(tx), z = hz(tz);
    if (freeSpotOn(HILL, x, z)) addRock(x, z, g);
  });
  addLamp(hw(29.5), hz(15), g);
  addLamp(hw(34.5), hz(15), g);
  addSign(hw(34), hz(5.9), "南高草坡", g);
  addPlaceLabel(hw(32), hz(40), "深草区", 3.2, "land", g);
  addPlaceLabel(hw(32), hz(10.5), "南高草坡", 3.0, "land", g);
  treeSpots.push(...savedSpots);
  MAP = restore;

  addGateArch(HILL, 32, 2, "", g, true);      // 北口回村门楼
  addAnchorStone(HILL, 32, 12, g, "hill");

  // ---- 深草区（走进去会遇怪）----
  [
    { x: .5, z: 8.5, r: 9.0, zone: "hill", map: "hill" },
    { x: -17.5, z: -5.5, r: 5.5, zone: "hill", map: "hill" },
    { x: 16.5, z: -9.5, r: 4.5, zone: "hill", map: "hill" }
  ].forEach(p => patches.push(p));
  buildGrassTufts(HILL, g, 1100, 4022);
}

/* ---- 竹笋：竹林水塘的每日采集。每天换一批位置，站边上按 E 掰 ---- */
const SHOOT_SPOTS = [
  { tx: 26, tz: 30 }, { tx: 22, tz: 26 }, { tx: 15, tz: 43 }, { tx: 25, tz: 42 },
  { tx: 33, tz: 24 }, { tx: 37, tz: 41 }, { tx: 45, tz: 42 }, { tx: 28, tz: 20 }
];
const shootQuest = { day: -1, objs: [] };

function buildShoots() {
  const g = OUTDOOR.grove;
  if (!g) return;
  SHOOT_SPOTS.forEach(sp => {
    const grp = new T.Group();
    const sx = GROVE.ox + sp.tx + .5, sz = GROVE.oz + sp.tz + .5;
    grp.position.set(sx, surfaceY(GROVE, sx, sz), sz);
    // 一根笋：土黄锥身 + 青尖
    const body = new T.Mesh(new T.ConeGeometry(.16, .5, 7),
      new T.MeshStandardMaterial({ color: 0xc9a86a, roughness: .95 }));
    body.position.y = .25; body.castShadow = true;
    grp.add(body);
    const tip = new T.Mesh(new T.ConeGeometry(.09, .26, 6),
      new T.MeshStandardMaterial({ color: 0x9fb060, roughness: .95 }));
    tip.position.y = .56;
    grp.add(tip);
    grp.visible = false;
    g.add(grp);
    shootQuest.objs.push({ group: grp, got: false });
  });
}

// 每天换一批：8 个备选点里随机露 4 根，掰完今天就没
function refreshShoots() {
  if (shootQuest.day === Farm.day) return;
  shootQuest.day = Farm.day;
  const r = mulberry(Farm.day * 7919 + 41);
  const order = SHOOT_SPOTS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  shootQuest.objs.forEach((o, i) => {
    o.got = false;
    o.group.visible = order.slice(0, 4).indexOf(i) >= 0;
  });
}

function tryShoot() {
  if (roomState.name !== "grove") return false;
  for (const o of shootQuest.objs) {
    if (o.got || !o.group.visible) continue;
    if (Math.hypot(player.x - o.group.position.x, player.z - o.group.position.z) > 1.4) continue;
    o.got = true;
    o.group.visible = false;
    Farm.gold += 8;
    courierProgress("shoot", "grove");
    Farm.paint(); hudTick(); save();
    sfx("coin");
    blip(760, .12, "sine", .04);
    toast("掰到一根竹笋 · 镇上饭馆收，+8 金");
    return true;
  }
  return false;
}

/* =========================================================
   模型
   ========================================================= */
const PACK = window.N3D_MODELS || {};
// 游戏里的奶龙用站立版模型：挥手版（nailong-waving）手臂定格高举，走路也举着很怪；
// 绑骨走 nailongStand（按站立版手臂实测的垂手胶囊）。图鉴/桌宠/盲盒走
// pet-renderer 的 N3D_MODELS 原映射，仍是挥手形象。
if (PACK.nailong) PACK.nailong = { ...PACK.nailong, file: "assets/models/nailong.glb", rigId: "nailongStand" };
const gltfLoader = new GLTFLoader();
// 模型是 meshopt 压缩过的，不配解压器会全部解析失败，退化成 2D 立牌
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
const loaded = new Map();
const texLoader = new T.TextureLoader();

function normalize(obj, targetH) {
  const holder = new T.Group();
  holder.add(obj);
  obj.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(obj);
  const size = box.getSize(new T.Vector3());
  const center = box.getCenter(new T.Vector3());
  const k = targetH / Math.max(size.y, .0001);
  holder.scale.setScalar(k);
  obj.position.set(obj.position.x - center.x, obj.position.y - box.min.y, obj.position.z - center.z);
  obj.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      if (o.material && "envMapIntensity" in o.material) o.material.envMapIntensity = 1;
    }
  });
  return holder;
}

// 克隆出的角色挂上骨骼动画驱动（没绑上骨骼就返回原样，走整体颠簸的老路）
function withAnim(actor) {
  try {
    const anim = makeAnimator(actor);
    if (anim) actor.userData.anim = anim;
  } catch (e) { /* 动画是锦上添花，失败不影响显示 */ }
  return actor;
}


// 把立绘四周的透明边裁掉，否则立牌会比 3D 模型小一圈
function trimTexture(img) {
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  try {
    const d = g.getImageData(0, 0, c.width, c.height).data;
    for (let y = 0; y < c.height; y += 2) {
      for (let x = 0; x < c.width; x += 2) {
        if (d[(y * c.width + x) * 4 + 3] > 14) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
  } catch (e) { /* 跨域或被污染就整张用 */ }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = c.width - 1; y1 = c.height - 1; }
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  out.getContext("2d").drawImage(c, x0, y0, w, h, 0, 0, w, h);
  const t = new T.CanvasTexture(out);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return { tex: t, aspect: w / h };
}

function makeBillboard(key) {
  const c = CAST[key];
  const pivot = new T.Group();
  pivot.userData.modelKey = key;     // 模型重试成功后 upgradeBillboard 靠它重建 rig

  const sp = new T.Sprite(new T.SpriteMaterial({
    transparent: true, depthWrite: false, alphaTest: .02, opacity: 0
  }));
  sp.center.set(.5, 0);
  sp.scale.set(c.h * .8, c.h, 1);
  pivot.add(sp);

  const img = new Image();
  img.onload = () => {
    const { tex, aspect } = trimTexture(img);
    sp.material.map = tex;
    sp.material.opacity = 1;
    sp.material.needsUpdate = true;
    sp.scale.set(c.h * aspect, c.h, 1);
  };
  img.src = c.img;

  const sh = new T.Mesh(new T.CircleGeometry(c.h * .3, 20),
    new T.MeshBasicMaterial({ color: 0x2f4a33, transparent: true, opacity: .18, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2;
  sh.position.y = .02;
  pivot.add(sh);
  pivot.userData.isBillboard = true;
  noteBillboard(key, pivot);
  return pivot;
}

const billboardUsers = new Map();   // key -> Set(pivot)：正在拿立牌顶替的实例
const modelRetryT = new Map();      // key -> 重试定时器
const retried = new Map();          // key -> 已重试次数
const modelFailToasted = new Set(); // 每个 key 只弹一次降级提示
const lastErrs = [];                // 最近几次模型失败的原因（诊断用）

function noteBillboard(key, pivot) {
  if (!billboardUsers.has(key)) billboardUsers.set(key, new Set());
  billboardUsers.get(key).add(pivot);
}

function failReason(err) {
  const s = String((err && err.message) || err || "");
  if (/Failed to fetch|NetworkError|ERR_NETWORK|ERR_INTERNET/i.test(s)) return "网络没连上";
  if (/404|NotFound/i.test(s)) return "文件不存在";
  if (/WebGL|context/i.test(s)) return "显卡/WebGL 不支持";
  return s.split("\n")[0].slice(0, 50) || "未知原因";
}

function toastModelFail(key, err) {
  if (modelFailToasted.has(key)) return;
  modelFailToasted.add(key);
  toast("「" + CAST[key].name + "」的 3D 模型没加载上（" + failReason(err) + "），先用纸片顶着，后台自动重试");
}

// 立牌换回真模型：清掉 sprite 和伪阴影，把 3D 克隆塞回原来的组
function upgradeBillboard(pv) {
  pv.clear();
  delete pv.userData.isBillboard;
  const key = pv.userData.modelKey;
  const c = CAST[key], entry = PACK[key];
  if (c && entry && srcScenes.has(key)) pv.add(buildRig(key, c, entry));
  if (pv.parent === playerObj) playerObj.userData.isBillboard = false;
}

function queueModelRetry(key, delay = 4000) {
  clearTimeout(modelRetryT.get(key));
  const c = CAST[key], entry = PACK[key];
  if (!c || !entry) return;
  modelRetryT.set(key, setTimeout(async () => {
    if (loaded.get(key) !== null) return;              // 别处已经修好了
    try {
      await ensureSrc(key, entry);
      loaded.set(key, true);
      const users = billboardUsers.get(key);
      if (users) { users.forEach(pv => upgradeBillboard(pv)); billboardUsers.delete(key); }
      toast("「" + c.name + "」的 3D 模型加载好了");
    } catch (e) {
      const n = (retried.get(key) || 0) + 1;
      retried.set(key, n);
      lastErrs.push(key + "#" + n + " " + failReason(e));
      if (n < 4) queueModelRetry(key, Math.min(delay * 2, 30000));
      else console.warn("[game] 模型重试 4 次仍失败：" + key, e);
    }
  }, delay));
}


// 共享只读的 glTF 源场景：每个角色只加载一次文件。
// 角色 rig 每次都用 createPetMotion 现建——跟展台/桌宠同一条管线。
// 之前走 cloneSkinned 克隆蒙皮骨架，boneInverses 对不上克隆的世界矩阵，
// 骨骼动画整体失效，网格还被拧翻（角色一直倒置渲染，躺下才露馅）。
const srcScenes = new Map();        // key -> gltf.scene
async function ensureSrc(key, entry) {
  if (!srcScenes.has(key)) {
    const gltf = await gltfLoader.loadAsync(entry.file);
    srcScenes.set(key, gltf.scene);
  }
  return srcScenes.get(key);
}

function buildRig(key, c, entry) {
  let root = srcScenes.get(key);
  const nodeName = c.node || entry.node;
  if (nodeName) {
    const sub = root.getObjectByName(nodeName);
    if (sub) root = sub;             // 只读引用，不动共享源
  }
  // rigId：同一模型文件在不同场合可用不同绑骨（游戏主角用站立版奶龙的垂手绑骨，
  // 图鉴/桌宠的挥手版走 nailong 原参数，互不影响）
  const rig = createPetMotion(root, entry.rigId || key);
  rig.root.scale.setScalar(c.h / 2);
  if (entry.yaw) rig.root.rotation.y += entry.yaw;
  rig.root.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      if (o.material && "envMapIntensity" in o.material) o.material.envMapIntensity = 1;
    }
  });
  const pivot = new T.Group();
  pivot.add(rig.root);
  pivot.userData.holder = pivot.children[0];
  return pivot;
}

async function getActor(key) {
  const c = CAST[key];
  if (!c) return null;
  if (loaded.get(key) === null) return makeBillboard(key);   // 已判定失败，等后台重试
  const entry = PACK[key];
  if (c.model && entry) {
    try {
      await ensureSrc(key, entry);
      loaded.set(key, true);
      return withAnim(buildRig(key, c, entry));
    } catch (err) {
      console.warn("[game] 模型加载失败，改用立牌：" + key, err);
      loaded.set(key, null);
      toastModelFail(key, err);
      queueModelRetry(key);
      return makeBillboard(key);
    }
  }
  loaded.set(key, null);
  return makeBillboard(key);
}

const playerObj = new T.Group();
scene.add(playerObj);
playerObj.position.set(player.x, 0, player.z);

/* =========================================================
   相机（固定俯角，不旋转 → 键位永远对应屏幕方向）
   elev 是视线与水平面的夹角：原来 1.15≈66° 接近顶视，画面偏扁；
   改成 0.62≈35° 的斜俯视（饥荒式），能看到角色/树/房子的正面和立体感。
   相机仍只在 +Z 方向偏移、X 不偏 → 屏幕「上」=世界北，WASD 手感不变。
   ========================================================= */
const VIEW = { h: 13.2, dist: 60, elev: 0.82 };
let viewH = VIEW.h, viewW = VIEW.h * 1.6;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  let vh, vw;
  if (typeof MAP !== "undefined" && MAP && MAP.indoor) {
    // 室内：把整间屋连同四面墙一起放进画面。
    // 先按房间尺寸算出「至少要多宽多高」，再用长宽比反推，画面不会被拉扁。
    const R = MAP.room;
    const wantW = Math.min(R.w + 1.6, 14.5);
    const wantH = Math.min(R.h + 1.6, 12.5);
    vh = Math.max(wantH, wantW / aspect);
    if (vh > 19) vh = 19;                 // 竖屏别缩到看不清人
    vw = vh * aspect;
    if (vw > 24) { vw = 24; vh = vw / aspect; }
  } else {
    // 2D 俯视户外：视野放宽些，方便看清整片区域；3D 第三人称保持原视野
    const baseH = state.viewMode === "2d" ? 22 : VIEW.h;
    vh = baseH; vw = vh * aspect;
    // 竖屏别窄成一条：至少给 8 格宽
    if (vw < 8) { vw = 8; vh = vw / aspect; }
  }
  viewW = vw; viewH = vh;
  camera.left = -vw / 2; camera.right = vw / 2;
  camera.top = vh / 2; camera.bottom = -vh / 2;
  camera.updateProjectionMatrix();
  camTP.aspect = aspect;
  camTP.updateProjectionMatrix();
  Fight.resize();
}

// 屏幕抖一下（棋爷掀桌子这种事用得上）
let camShake = 0, camShakeT = 0;
function shake(power = .5, dur = .35) {
  camShake = Math.max(camShake, power);
  camShakeT = Math.max(camShakeT, dur);
}

// 相机平滑跟随：镜头不再每帧瞬移到玩家脚下，而是缓缓追上去。
// 这是斜俯角游戏防晕的关键——画面平移有了缓冲，不再随每一步硬跳。
const camSmooth = { x: null, z: null };

// 当前该用哪台相机：
//   屋里 → 正交俯视（原样）
//   户外 3D → 第三人称透视 camTP
//   户外 2D → 正交俯视 camera（同世界降维：地图一模一样，只是把镜头压成俯视看）
function topDown() { return (MAP && MAP.indoor) || state.viewMode === "2d"; }
function currentCam() {
  return topDown() ? camera : camTP;
}

function updateCamera(snap) {
  const td = topDown();
  // 雾跟着相机走：正交俯视的镜头离人 60，第三条的镜头只离 8.6
  if (scene.fog) {
    scene.fog.near = td ? 72 : 34;
    scene.fog.far = td ? 105 : 145;
  }
  if (td) updateCamOrtho(snap);
  else updateCamThird(snap);
  // 光照跟着「视觉位置」走：角色在镇上时，太阳要照镇子那片地
  sun.position.set(visX() + 12, 20, visZ() + 8);
  sun.target.position.set(visX(), 0, visZ());
  // 远景永远围着角色转：地图铺开后，树墙/天穹得跟着人，不然会落在世界角落
  if (farGroup) farGroup.position.set(visX(), 0, visZ());
  if (skyDome) skyDome.position.set(visX(), 0, visZ());
}

/* ---- 室内：正交俯视，原样保留 ---- */
function updateCamOrtho(snap) {
  let px = player.x, pz = player.z;
  // 屋里放得下整间，就把镜头钉在屋子中间：屋子像一间布景，人在里面走
  if (MAP && MAP.indoor && MAP.room) {
    const R = MAP.room;
    if (viewW >= R.w + .6 && viewH >= R.h + .6) {
      px = MAP.ox + R.x0 + R.w / 2;
      pz = MAP.oz + R.z0 + R.h / 2;
    }
  }
  // 首次、传送、切场景时直接归位；平时每帧向目标插值靠近
  if (snap || camSmooth.x === null) {
    camSmooth.x = px; camSmooth.z = pz;
  } else {
    const follow = .12; // 每帧追近 12%，约 0.25 秒跟上，平滑但不拖沓
    camSmooth.x += (px - camSmooth.x) * follow;
    camSmooth.z += (pz - camSmooth.z) * follow;
  }
  const cx = camSmooth.x, cz = camSmooth.z;
  const y = Math.sin(VIEW.elev) * VIEW.dist;
  const z = Math.cos(VIEW.elev) * VIEW.dist;
  // 斜俯角时把注视点略微抬高、相机目标往角色前方偏一点，
  // 让地平线落在画面上方而不是正中，角色周围留出更多可走的地面。
  const lookY = .9;
  const aheadZ = cz - 1.2;
  const off = regionOff(roomState.name);
  camera.position.set(cx + off.x, y + lookY, cz + z + off.z);
  if (camShake > 0) {
    const k = camShake * .55;
    camera.position.x += (Math.random() - .5) * k;
    camera.position.y += (Math.random() - .5) * k;
    camera.position.z += (Math.random() - .5) * k * .5;
  }
  camera.lookAt(cx + off.x, lookY, aheadZ + off.z);
}

/* ---- 户外：第三人称跟拍 ----
   镜头挂在角色背后，沿 yaw 反方向退 dist、抬 dist*sin(pitch)。
   退的路上撞到墙就自动缩短距离，免得镜头钻进房子里看天花板。 */
function camBackDist(px, pz, want) {
  const sx = -Math.sin(TP.yaw), sz = -Math.cos(TP.yaw);
  for (let d = 1.0; d <= want; d += .45) {
    const x = px + sx * d, z = pz + sz * d;
    if (solidAt(MAP, cellX(x), cellZ(z))) return Math.max(TP.minDist * .55, d - .6);
  }
  return want;
}

function updateCamThird(snap) {
  const px = player.x, pz = player.z;
  if (snap || camSmooth.x === null) {
    camSmooth.x = px; camSmooth.z = pz;
    if (snap) TP.yaw = player.heading;   // 传送/换场景后镜头跟着人到背后
  } else {
    const follow = .18;
    camSmooth.x += (px - camSmooth.x) * follow;
    camSmooth.z += (pz - camSmooth.z) * follow;
  }
  const cx = camSmooth.x, cz = camSmooth.z;
  const hd = TP.dist * Math.cos(TP.pitch);     // 水平退距
  const dy = TP.dist * Math.sin(TP.pitch);     // 抬多高
  const back = camBackDist(cx, cz, hd);
  const k = hd > .01 ? back / hd : 1;          // 被挡时按比例缩水平距离
  const y = Math.max(1.2, TP.lookY + dy * (.45 + .55 * k));
  const off = regionOff(roomState.name);
  camTP.position.set(cx - Math.sin(TP.yaw) * back + off.x, y, cz - Math.cos(TP.yaw) * back + off.z);
  if (camShake > 0) {
    const s = camShake * .4;
    camTP.position.x += (Math.random() - .5) * s;
    camTP.position.y += (Math.random() - .5) * s;
  }
  camTP.lookAt(cx + off.x, TP.lookY + .25, cz + off.z);
}

/* =========================================================
   输入
   ========================================================= */
const keys = {};
// 跟随模式下的"移动基准角"：每次方向键组合变化时锁定一次镜头角，锁定后镜头
// 可以绕到角色背后而不改变行走方向 —— 这样自动跟随不会 inducing 无限打转。
let moveBasisYaw = Math.PI, moveSig = -1;
function isSolid(cx, cz) {
  // 拼缝门洞带里，边界墙和"图外"的格子都不是墙 —— 那本来就是通往邻村的路。
  // 不带这个判断，玩家走到村口就会被 solidAt 的越界判定硬挡住。
  if (!MAP.indoor && REGION_KEYS.includes(roomState.name)) {
    const off = regionOff(roomState.name);
    const vx = MAP.ox + cx + .5 + off.x;
    const vz = MAP.oz + cz + .5 + off.z;
    if (inPortalBand(vx, vz)) return false;
  }
  return solidAt(MAP, cx, cz);
}

// 一格一格地挡：玩家是个半径 .34 格的小圆，一格宽的门刚好能过
function blocked(x, z, r = .34) {
  const cx = cellX(x), cz = cellZ(z);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (!isSolid(cx + dx, cz + dz)) continue;
    const bx = MAP.ox + (cx + dx), bz = MAP.oz + (cz + dz);
    const nx = clamp(x, bx, bx + 1), nz = clamp(z, bz, bz + 1);
    if (Math.hypot(x - nx, z - nz) < r) return true;
  }
  return false;
}

window.addEventListener("keydown", e => {
  const k = e.key;
  // 小游戏开着时：键盘只交给小游戏，别让人一边钓鱼一边把人走进水里
  if (fishing.on || stageGame.on) {
    if (k === "e" || k === "E" || k === "Enter" || k === " ") {
      if (fishing.on) reelFish(); else hitStage();
      e.preventDefault();
    } else if (k === "Escape") {
      closeFishing(); closeStage(); e.preventDefault();
    }
    return;
  }
  if (k === "w" || k === "W" || k === "ArrowUp") { keys.up = true; e.preventDefault(); }
  if (k === "s" || k === "S" || k === "ArrowDown") { keys.down = true; e.preventDefault(); }
  if (k === "a" || k === "A" || k === "ArrowLeft") { keys.left = true; e.preventDefault(); }
  if (k === "d" || k === "D" || k === "ArrowRight") { keys.right = true; e.preventDefault(); }
  if (k === "Shift") player.run = true;
  if (k === "z" || k === "Z") keys.camL = true;
  if (k === "c" || k === "C") keys.camR = true;
  if (k === " " || k === "Spacebar") {
    // 空格 = 跳；对话里仍是「继续」，钓鱼/唱戏已在上面单独接管
    if (dlg.open) { advanceDialog(); e.preventDefault(); return; }
    if (!Fight.on && !overlayOpen()) jump();
    e.preventDefault();
    return;
  }
  if (k === "e" || k === "E" || k === "Enter") {
    if (dlg.open) { advanceDialog(); e.preventDefault(); return; }
    if (Fight.on || overlayOpen()) return;
    interact();
    e.preventDefault();
  }
  if (k === "m" || k === "M") {
    if (Fight.on || dlg.open) return;
    if ($("#worldmap").classList.contains("show")) closeWorldMap();
    else openWorldMap();
    e.preventDefault();
  }
  if (k === "v" || k === "V") { setViewMode(state.viewMode === "3d" ? "2d" : "3d"); e.preventDefault(); }
  if (k === "r" || k === "R") { toggleFollow(); e.preventDefault(); }
  if (k === "Escape") closeOverlays();
});
window.addEventListener("keyup", e => {
  const k = e.key;
  if (k === "w" || k === "W" || k === "ArrowUp") keys.up = false;
  if (k === "s" || k === "S" || k === "ArrowDown") keys.down = false;
  if (k === "a" || k === "A" || k === "ArrowLeft") keys.left = false;
  if (k === "d" || k === "D" || k === "ArrowRight") keys.right = false;
  if (k === "Shift") player.run = false;
  if (k === "z" || k === "Z") keys.camL = false;
  if (k === "c" || k === "C") keys.camR = false;
});
window.addEventListener("blur", () => {
  keys.up = keys.down = keys.left = keys.right = false;
  keys.camL = keys.camR = false;
  player.run = false;
});

document.querySelectorAll("#pad button").forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); keys[k] = true; };
  const off = e => { e.preventDefault(); keys[k] = false; };
  b.addEventListener("pointerdown", on);
  b.addEventListener("pointerup", off);
  b.addEventListener("pointerleave", off);
  b.addEventListener("pointercancel", off);
});
$("#btnA").addEventListener("click", () => {
  if (dlg.open) { advanceDialog(); return; }
  if (Fight.on || overlayOpen()) return;
  interact();
});
if ($("#btnJump")) $("#btnJump").addEventListener("click", () => { if (!Fight.on) jump(); });
const isTouch = () => matchMedia("(hover:none)").matches || window.innerWidth < 820;
// 摇杆只在真正开始游戏后出现；不然标题页上就摆着一副方向键
function syncPad() {
  const on = isTouch() && state.started && !Fight.on
    && !document.body.classList.contains("infight");
  $("#pad").classList.toggle("on", on);
  $("#btnA").classList.toggle("on", on);
  if ($("#btnJump")) $("#btnJump").classList.toggle("on", on);
}
syncPad();

/* ---- 镜头操作 ----
   鼠标（或手指）在画面上拖动 = 转视角；滚轮 = 拉近拉远；Z / C = 左右转。
   只有真进了游戏、没开面板的时候才接管，免得在标题页上乱转。 */
const dom = renderer.domElement;
let camDrag = null;
dom.addEventListener("pointerdown", e => {
  if (!state.started || dlg.open || Fight.on || overlayOpen()) return;
  camDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  try { dom.setPointerCapture(e.pointerId); } catch (err) {}
});
dom.addEventListener("pointermove", e => {
  if (!camDrag || e.pointerId !== camDrag.id) return;
  const dx = e.clientX - camDrag.x, dy = e.clientY - camDrag.y;
  camDrag.x = e.clientX; camDrag.y = e.clientY;
  if (topDown()) return;       // 俯视（屋里 / 2D）是固定视角，拖了也没意义
  TP.yaw -= dx * .0048;
  TP.pitch = clamp(TP.pitch - dy * .0035, .10, 1.15);
  moveSig = -1; camFollowPause = 2.2;   // 手动拖镜头后暂停自动跟随
});
const camDragEnd = e => { if (camDrag && e.pointerId === camDrag.id) camDrag = null; };
dom.addEventListener("pointerup", camDragEnd);
dom.addEventListener("pointercancel", camDragEnd);
dom.addEventListener("wheel", e => {
  if (!state.started || topDown()) return;
  TP.dist = clamp(TP.dist + e.deltaY * .012, TP.minDist, TP.maxDist);
  e.preventDefault();
}, { passive: false });

/* =========================================================
   更新
   ========================================================= */
let grassDist = 0, hudAcc = 0, grace = 0, battleGrace = 0, encounterLock = false;

function update(dt) {
  // 躺在床上时锁输入：不然人保持躺姿在地图上滑（睡姿泄漏）
  const locked = !state.started || dlg.open || Fight.on || overlayOpen() || sleepPose.on;
  // 兜底：任何路径只要"人在屋外却躺着"，下一帧立刻站起来
  if (sleepPose.on && roomState.name !== "house") getUp();
  if (camShakeT > 0) {
    camShakeT -= dt;
    if (camShakeT <= 0) { camShakeT = 0; camShake = 0; }
  }
  if (camFollowPause > 0) camFollowPause = Math.max(0, camFollowPause - dt);
  // 时间只在能自由走动的时候流；翻菜单、对话、打架都暂停
  Farm.update(dt, locked);
  if (locked) {
    player.moving = false;
    updateCamera();
    return;
  }

  let ix = 0, iz = 0;
  if (keys.camL) {
    TP.yaw += dt * 1.9; moveSig = -1; camFollowPause = 2.2;  // 手动转镜头：暂停自动跟随
  }
  if (keys.camR) {
    TP.yaw -= dt * 1.9; moveSig = -1; camFollowPause = 2.2;
  }
  if (keys.left) ix -= 1;
  if (keys.right) ix += 1;
  if (keys.up) iz -= 1;
  if (keys.down) iz += 1;

  if (ix || iz) {
    // 镜头相对移动：W 是「镜头正对着的方向」，A/D 是屏幕左右。
    // 屋里镜头固定朝北，退化成原来的世界方向，手感不变。
    const f = -iz, r = ix;
    const len = Math.hypot(f, r);
    let yaw;
    if (MAP.indoor || topDown()) {
      yaw = Math.PI;                       // 俯视（屋内 / 2D 模式）：世界方向，屏幕上=北
    } else if (!state.camFollow) {
      yaw = TP.yaw;                        // 手动镜头：每帧按当前镜头角走（原逻辑）
    } else {
      // 跟随镜头：只在方向键"组合变化"的那一刻锁定一次镜头角。
      // 之后镜头绕到角色背后也不会带着移动方向一起转，不会原地打转。
      const sig = (keys.up ? 1 : 0) | (keys.down ? 2 : 0) |
        (keys.left ? 4 : 0) | (keys.right ? 8 : 0);
      if (sig !== moveSig) { moveSig = sig; moveBasisYaw = TP.yaw; }
      yaw = moveBasisYaw;
    }
    const dx = (Math.sin(yaw) * f - Math.cos(yaw) * r) / len;
    const dz = (Math.cos(yaw) * f + Math.sin(yaw) * r) / len;
    player.heading = Math.atan2(dx, dz);

    // 镜头自动转到角色背后：3D 户外、跟随开、且没在手动转镜头时。
    // 缓慢插值，玩家几乎感觉不到「被拽」，只觉得镜头自己跟上了。
    if (state.camFollow && !topDown() && camFollowPause <= 0) {
      let diff = ((player.heading - TP.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      TP.yaw += diff * Math.min(1, dt * 2.4);
    }

    const sp = (player.run ? 7.6 : 4.6) * dt;
    let moved = 0;
    const nx = player.x + dx * sp;
    const nz = player.z + dz * sp;
    // 万一被塞进了实体（坐下、传送、摆件挪位置都可能），别把人锁死在里面：
    // 起点本身已经在碰撞圈里时，这一帧不做阻挡，让人能自己退出来。
    const wedged = blocked(player.x, player.z);
    if (wedged || !blocked(nx, player.z)) { player.x = nx; moved += Math.abs(dx * sp); }
    if (wedged || !blocked(player.x, nz)) { player.z = nz; moved += Math.abs(dz * sp); }

    player.moving = moved > 0;
    player.phase += moved * 3.4;
    state.steps += moved * 1.4;

    if (!MAP.indoor && moved > 0 && grace <= 0 && battleGrace <= 0) {
      grassDist += moved;
      const p = patches.find(p => p.map === roomState.name &&
        Math.hypot(player.x - p.x, (player.z - p.z) / .9) < p.r - .6);
      if (p && grassDist > 6) {
        grassDist = 0;
        if (Math.random() < .26) startEncounter(p.zone);
      }
      if (!p) grassDist = 0;
    }
    if (grace > 0) grace -= moved;
  } else {
    player.moving = false;
    moveSig = -1;   // 松开方向键后，下次起步重新锁定跟随基准
  }
  if (battleGrace > 0) battleGrace -= dt;

  // 走过拼缝：只换「当前是哪张图」并把局部坐标按位移重基，屏幕位置一帧不跳。
  // 这一步必须放在移动之后、贴地之前，穿着地形走进邻图也不会卡在边界。
  if (!MAP.indoor && REGION_KEYS.includes(roomState.name)) {
    const target = portalTarget(roomState.name, visX(), visZ());
    if (target) {
      const from = regionOff(roomState.name), to = regionOff(target);
      travelTo(target, {
        x: player.x + from.x - to.x,
        z: player.z + from.z - to.z,
        heading: player.heading,
        seamless: true
      });
    }
  }

  // 跳跃物理：重力积分，落地时 jumpY 归零。空中照样能水平移动（上面已算）。
  if (!sleepPose.on) updateJump(dt);
  const groundY = terrainY(player.x, player.z);
  const footY = groundY + player.jumpY;
  playerObj.position.set(visX(), sleepPose.on ? playerObj.position.y : footY, visZ());
  // 躺下时不做朝向平滑：rot.y 一动，-90° 的躺倒旋转就会被拧歪，头转不到枕头上
  if (!sleepPose.on) {
    const cur = playerObj.rotation.y;
    let diff = ((player.heading - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    playerObj.rotation.y = cur + diff * Math.min(1, dt * 14);
  }

  if (sleepPose.on) {
    // 躺下时主循环不许碰姿势：这里每帧覆盖 y/rotation 会把人按回地板里（穿模根因）；
    // 朝向平滑也停掉，否则 rot.y 被 lerp 半圈，头就转不到枕头上
    const pActor = playerObj.children[0];
    const anim = pActor && pActor.userData.anim;
    if (anim) anim.update("sleep", {});   // 把迈步冻结的腿放平，不然脚底朝天
  } else if (player.jumping) {
    // 空中统一收腿姿势：按上升/下降把 tuck 从 1 插到 0，模型和物理一致
    const t = performance.now() / 1000;
    const pActor = playerObj.children[0];
    const anim = pActor && pActor.userData.anim;
    const k = clamp(1 - player.vy / JUMP_V0, 0, 1);
    if (anim) anim.update("jump", { k, t });
    playerObj.position.y = footY;
    playerObj.rotation.z = 0;
  } else if (!playerObj.userData.isBillboard) {
    const t = performance.now() / 1000;
    const pActor = playerObj.children[0];
    const anim = pActor && pActor.userData.anim;
    if (anim) {
      // 有骨骼：腿摆臂摆，脚步颠簸只留一点点衬托
      anim.update(player.moving ? "walk" : "idle", { t, phase: player.phase });
      const bob = player.moving ? Math.abs(Math.sin(player.phase)) * .04 : Math.sin(t * 1.6) * .008;
      playerObj.position.y = footY + bob;
      playerObj.rotation.z = player.moving ? Math.sin(player.phase) * .018 : 0;
    } else {
      // 没骨骼：整体上下颠
      const bob = player.moving ? Math.abs(Math.sin(player.phase)) * .075 : Math.sin(t * 1.6) * .014;
      playerObj.position.y = footY + bob;
      playerObj.rotation.z = player.moving ? Math.sin(player.phase) * .04 : 0;
    }
  }

  // 面前那一格的光标：每格都能指，指到的那格就是按 E 会动的那格
  updateCursor();
  // 村民接着走他们的路
  npcUpdate(dt);

  updateCamera();
  hudAcc += dt;
  if (hudAcc > .16) { hudAcc = 0; hudTick(); }
}

// 光标永远落在 aimCell() 说的那一格上：门/水/田变橙色，普通地面是青绿色
function updateCursor() {
  if (!state.started || Fight.on) { cursor.visible = false; return; }
  const a = aimCell();
  if (!a) { cursor.visible = false; return; }
  const off = regionOff(roomState.name);
  cursor.position.set(a.x + off.x, terrainY(a.x, a.z) + .03, a.z + off.z);
  cursor.visible = true;
  const live = !!(a.mark || a.type === TI.WATER || a.plot || a.type === TI.WEED);
  const { fillMat, edgeMat } = cursor.userData;
  fillMat.opacity = live ? .2 : .07;
  edgeMat.color.set(live ? 0xd9822f : 0x2d6b52);
  edgeMat.opacity = live ? .95 : .4;
}

/* =========================================================
   HUD / 雷达
   ========================================================= */
function hudTick() {
  $("#hudLv").textContent = "Lv." + state.lv;
  const p = clamp(state.hp / state.maxHp, 0, 1);
  $("#hudHp").style.width = (p * 100) + "%";
  $("#hudHp").classList.toggle("low", p < .3);
  $("#hudHpText").textContent = Math.round(state.hp) + "/" + state.maxHp;
  $("#hudExp").textContent = state.exp + "/" + expNeed(state.lv);
  $("#ballCount").textContent = state.balls;
  $("#stepCount").textContent = Math.round(state.steps);
  $("#areaChip").innerHTML = '<span class="dot"></span> ' + areaName();
  $("#dexCount").textContent = dexCount();

  // 站到谁旁边了：提一句，不然没人知道 NPC 能聊
  const near = (state.started && !dlg.open && !Fight.on) ? npcNear(2.4) : null;
  const hint = $("#npcHint");
  if (hint) {
    if (near) {
      hint.innerHTML = '按 <b>E</b> 跟' + near.def.name + '说话' + (near.def.tag ? '　·　' + near.def.tag : '');
      hint.classList.add("show");
    } else hint.classList.remove("show");
  }
}

function areaName() {
  if (MAP.indoor) {
    const base = roomName || "屋里";
    // 屋里隔成了几间：看人现在站在哪一间
    if (MAP.zones && MAP.room) {
      const tx = Math.floor(player.x - MAP.ox) - MAP.room.x0;
      const zn = MAP.zones.find(s => tx >= s.x0 && tx <= s.x1);
      if (zn) return base + " · " + zn.name;
    }
    return base;
  }
  if (MAP === TOWN) {
    const tx = player.x - TOWN.ox, tz = player.z - TOWN.oz;
    if (Math.hypot(tx - 21, tz - 28) < 6.5) return "奶家镇 · 戏台";
    if (Math.hypot(tx - 57, tz - 30) < 7.5) return "奶家镇 · 驿站";
    if (Math.hypot(tx - 38, tz - 30) < 9.5) return "奶家镇 · 市集";
    if (tx < 11) return "奶家镇 · 镇口";
    if (tz > 38) return "奶家镇 · 南街";
    return "奶家镇";
  }
  if (MAP === GROVE) {
    const tx = player.x - GROVE.ox, tz = player.z - GROVE.oz;
    if (Math.hypot(tx - 40, tz - 30) < 7) return "竹林水塘 · 林间空地";
    if (Math.hypot(tx - 19, tz - 36) < 11) return "竹林水塘 · 水塘边";
    if (tz < 20) return "竹林水塘 · 北竹海";
    if (tz > 44) return "竹林水塘 · 南竹海";
    return "竹林水塘";
  }
  if (MAP === HILL) {
    const tx = player.x - HILL.ox, tz = player.z - HILL.oz;
    if (Math.hypot(tx - 32, tz - 12) < 8) return "南高草坡 · 坡顶";
    if (tz > 30) return "南高草坡 · 深草区";
    return "南高草坡";
  }
  const { x, z } = player;
  if (nearFarm(x, z, 3)) return "我的地";
  if (Math.hypot(x - 14.5, z - 8) < 5.6) return "棋爷的公园";
  if (Math.hypot(x, z) < 9) return "奶家村广场";
  if (Math.hypot(x + 26.5, z + 2.5) < 12) return "水塘边";
  if (x > 18 && z > 20) return "东边花田";
  if (z < -10) return "村北树林";
  if (z > 20) return "村口南坡";
  return "中央草坡";
}

const radar = $("#radar");
const rctx = radar.getContext("2d");
const RADAR_SPAN = 30;          // 雷达里显示多少格

function drawRadar() {
  const S = radar.width, R = S / 2;
  rctx.clearRect(0, 0, S, S);
  rctx.save();
  rctx.beginPath(); rctx.arc(R, R, R - 2, 0, 7); rctx.clip();
  rctx.fillStyle = "#dfe9d2"; rctx.fillRect(0, 0, S, S);

  const k = S / RADAR_SPAN;     // 每格多少像素
  const tex = MAP.indoor
    ? (rooms.get(roomState.name) || {}).mat
    : outdoorMats.get(roomState.name);
  const texMap = tex && tex.map;
  const cv = texMap && texMap.userData && texMap.userData.canvas;
  if (cv) {
    const pxc = (player.x - MAP.ox) / MAP.w * cv.width;
    const pzc = (player.z - MAP.oz) / MAP.h * cv.height;
    const halfX = RADAR_SPAN / 2 * (cv.width / MAP.w);
    const halfZ = RADAR_SPAN / 2 * (cv.height / MAP.h);
    rctx.drawImage(cv, pxc - halfX, pzc - halfZ, halfX * 2, halfZ * 2, 0, 0, S, S);
    // 夜色压一层，雷达别比画面还亮
    if (document.body.classList.contains("night")) {
      rctx.fillStyle = "rgba(20,32,58,.4)"; rctx.fillRect(0, 0, S, S);
    }
  }

  const put = (x, z) => [R + (x - player.x) * k, R + (z - player.z) * k];

  // 高草（会遇怪的地方）：只画当前地图上的
  patches.forEach(p => {
    if (p.map !== roomState.name) return;
    const [px, py] = put(p.x, p.z);
    rctx.fillStyle = "rgba(62,110,50,.32)";
    rctx.beginPath(); rctx.ellipse(px, py, p.r * k, p.r * k, 0, 0, 7); rctx.fill();
  });

  // 门和锚点：哪张图上都该看得见
  if (!MAP.indoor) {
    MAP.marks.forEach((mk, key) => {
      if (mk.kind !== "door" && mk.kind !== "gate" && mk.kind !== "anchor") return;
      const [tx, tz] = key.split(",").map(Number);
      const [px, py] = put(MAP.ox + tx + .5, MAP.oz + tz + .5);
      if (mk.kind === "anchor") {
        const on = !!state.anchors[mk.id];
        rctx.fillStyle = on ? "rgba(64,180,168,.95)" : "rgba(120,130,132,.9)";
        rctx.beginPath(); rctx.arc(px, py, 2.2, 0, 7); rctx.fill();
        return;
      }
      rctx.fillStyle = mk.kind === "gate" ? "rgba(150,96,178,.95)" : "rgba(196,116,72,.95)";
      rctx.fillRect(px - 1.8, py - 1.8, 3.6, 3.6);
    });
  }

  // 村民：小圆点，谁在家一目了然
  for (const n of npcOnMap()) {
    const [px, py] = put(n.x, n.z);
    rctx.fillStyle = n.def.cop ? "rgba(56,92,140,.95)" : "rgba(214,150,54,.95)";
    rctx.beginPath(); rctx.arc(px, py, 2.6, 0, 7); rctx.fill();
    rctx.strokeStyle = "rgba(255,255,255,.85)"; rctx.lineWidth = 1.2; rctx.stroke();
  }

  // 玩家
  rctx.fillStyle = "#0f6e56";
  rctx.beginPath(); rctx.arc(R, R, 4.2, 0, 7); rctx.fill();
  rctx.strokeStyle = "#fff"; rctx.lineWidth = 2; rctx.stroke();
  rctx.fillStyle = "#fff";
  const hx = Math.sin(player.heading), hz = Math.cos(player.heading);
  rctx.beginPath(); rctx.arc(R + hx * 9, R + hz * 9, 2.3, 0, 7); rctx.fill();

  rctx.restore();
  rctx.strokeStyle = "rgba(70,60,40,.18)"; rctx.lineWidth = 2;
  rctx.beginPath(); rctx.arc(R, R, R - 2, 0, 7); rctx.stroke();
}

/* =========================================================
   对话 / 提示
   ========================================================= */
const dlg = { open: false, lines: [], i: 0, done: null, choices: null, waiting: false, who: "", peer: null };

// 谁在说话：左边亮起来，右边是你（暗一档）
// 轮到你说的时候（比如跟棋爷叫板），左边留着对方的人像、暗下去，右边亮起来。
function showWho(who, mood) {
  const L = $("#ptL"), R = $("#ptR");
  const key = speakerKey(who);
  if (!key) { L.classList.remove("show", "on"); R.classList.remove("show", "on"); return; }
  const m = mood || "normal";
  const mooded = (img, k, mm) => {
    img.src = portrait(k, mm);
    img.style.filter = moodFilter(mm);
  };
  if (key === PLAYER_KEY) {
    const peer = dlg.peer && speakerKey(dlg.peer);
    if (peer) {
      L.classList.add("show");
      L.classList.remove("on");
      mooded($("#ptLImg"), peer, "normal");
      $("#ptLName").textContent = dlg.peer;
    } else {
      L.classList.remove("show", "on");
    }
    R.classList.add("show", "on");
    mooded($("#ptRImg"), PLAYER_KEY, m);
    $("#ptRName").textContent = "奶龙";
  } else {
    L.classList.add("show", "on");
    mooded($("#ptLImg"), key, m);
    $("#ptLName").textContent = who;
    R.classList.add("show");
    R.classList.remove("on");
    mooded($("#ptRImg"), PLAYER_KEY, "normal");
    $("#ptRName").textContent = "奶龙";
  }
}

function say(who, lines, done, choices, mood, peer) {
  dlg.open = true; dlg.lines = lines.slice(); dlg.i = 0; dlg.done = done || null;
  dlg.choices = choices && choices.length ? choices : null;
  dlg.waiting = false;
  dlg.who = who;
  dlg.peer = peer || null;
  $("#dlgWho").textContent = who;
  $("#dlgTxt").textContent = dlg.lines[0];
  $("#dlgChoice").innerHTML = "";
  document.querySelector("#dialog .dlg").classList.remove("waiting");
  $("#dialog").classList.add("show");
  document.body.classList.add("indlg");
  showWho(who, mood);
  blip(520, .06, "sine", .03);
  // 只有一句话的提示，直接把选项摆出来，别让人再按一次 E
  if (dlg.choices && dlg.lines.length <= 1) showChoices();
}
function closeDialog() {
  dlg.open = false;
  dlg.waiting = false;
  $("#dialog").classList.remove("show");
  document.body.classList.remove("indlg");
  $("#dlgChoice").innerHTML = "";
  document.querySelector("#dialog .dlg").classList.remove("waiting");
}
function showChoices() {
  dlg.waiting = true;
  const box = $("#dlgChoice");
  box.innerHTML = "";
  document.querySelector("#dialog .dlg").classList.add("waiting");
  dlg.choices.forEach((c, i) => {
    const b = document.createElement("button");
    b.className = "dchoice";
    b.textContent = c.label;
    b.onclick = e => {
      e.stopPropagation();
      box.innerHTML = "";
      closeDialog();
      if (c.onPick) c.onPick(i);
    };
    box.appendChild(b);
  });
}
function advanceDialog() {
  if (!dlg.open) return;
  if (dlg.waiting) return;            // 在等玩家选项，别被 E 顶掉
  dlg.i++;
  if (dlg.i >= dlg.lines.length) {
    if (dlg.choices) { showChoices(); return; }
    closeDialog();
    const cb = dlg.done; dlg.done = null;
    if (cb) cb();
  } else {
    $("#dlgTxt").textContent = dlg.lines[dlg.i];
    blip(560, .05, "sine", .025);
  }
}
// 点对话框本身也能推进（手机上没 E 键，只能点）
$("#dialog").addEventListener("click", e => {
  if (e.target.closest(".dchoice")) return;
  if (dlg.open) advanceDialog();
});

let toastT = 0;
function toast(msg) {
  const n = $("#toast");
  n.textContent = msg;
  n.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => n.classList.remove("show"), 2400);
}
function overlayOpen() {
  return $("#dex").classList.contains("show")
    || $("#help").classList.contains("show")
    || $("#shop").classList.contains("show")
    || $("#go").classList.contains("show")
    || ($("#worldmap") && $("#worldmap").classList.contains("show"))
    || ($("#fishing") && $("#fishing").classList.contains("show"))
    || ($("#stage") && $("#stage").classList.contains("show"));
}
function closeOverlays() {
  $("#dex").classList.remove("show");
  $("#help").classList.remove("show");
  $("#shop").classList.remove("show");
  if ($("#worldmap")) $("#worldmap").classList.remove("show");
  if ($("#fishing")) closeFishing();
  if ($("#stage")) closeStage();
}

/* =========================================================
   互动：一切都落在「面前那一格」上
   ---------------------------------------------------------
   光标、E 键、锄头必须指同一格。原来光标和 Farm 各算各的，
   站在田边时常常一个指东一个指西，按下去就像没反应。
   现在只留一个 aimCell()，谁都问它。
   ========================================================= */
const REACH = [.72, 1.28, 1.86];      // 往前探三档，站在栅栏外也够得着

// 这一格落在我家那块地的第几格？不在田里就是 null
function plotAt(tx, tz) {
  if (MAP !== VILLAGE) return null;
  const x = MAP.ox + tx + .5, z = MAP.oz + tz + .5;
  const c = Math.floor(x - PLOT.x0), r = Math.floor(z - PLOT.z0);
  if (c < 0 || r < 0 || c >= PLOT.cols || r >= PLOT.rows) return null;
  return { c, r };
}

function cellInfo(tx, tz) {
  return {
    tx, tz,
    type: tileAt(MAP, tx, tz),
    mark: markAt(MAP, tx, tz),
    plot: plotAt(tx, tz),
    x: MAP.ox + tx + .5,
    z: MAP.oz + tz + .5
  };
}

// 面前那几格里挑一格：能动手的优先（门 > 水 > 田 > 别的地面）
function aimCell() {
  const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
  const seen = [], got = new Set();
  const pts = REACH.map(d => [player.x + fx * d, player.z + fz * d]);
  pts.push([player.x, player.z]);
  for (const [x, z] of pts) {
    const t = toTile(MAP, x, z);
    if (t.tx < 0 || t.tz < 0 || t.tx >= MAP.w || t.tz >= MAP.h) continue;
    const k = t.tx + "," + t.tz;
    if (got.has(k)) continue;
    got.add(k);
    seen.push(cellInfo(t.tx, t.tz));
  }
  const hit = seen.find(c => c.mark)
    || seen.find(c => c.type === TI.WATER)
    || seen.find(c => c.plot)
    || seen.find(c => c.type !== TI.GRASS && c.type !== TI.WEED_EDGE);
  if (hit) return hit;
  // 什么都没对上，也把正前方那格还回去，光标总得有个落点
  const t = toTile(MAP, player.x + fx * .72, player.z + fz * .72);
  if (t.tx < 0 || t.tz < 0 || t.tx >= MAP.w || t.tz >= MAP.h) return null;
  return cellInfo(t.tx, t.tz);
}
const tileAhead = aimCell;

function inPlot(x, z) {
  if (MAP !== VILLAGE) return false;
  const c = Math.floor(x - PLOT.x0), r = Math.floor(z - PLOT.z0);
  return c >= 0 && r >= 0 && c < PLOT.cols && r < PLOT.rows;
}

function fillWater() {
  if (Farm.water >= Farm.maxWater) { toast("水壶是满的"); return true; }
  Farm.water = Farm.maxWater;
  sfx("water");
  toast("水壶灌满了（" + Farm.maxWater + "）");
  Farm.paint();
  return true;
}

/* =========================================================
   村民
   ========================================================= */
const npcs = [];

// 奶察的帽子：奶蛙模型顶上扣一顶蓝帽子，比拿表情图当立牌干净。
// 全部尺寸照奶蛙头部逐层实测定的（h=1.62 时）：
//   头顶 y=1.62；y=1.50 头半宽只有 .15，所以帽筒半径 .165 才贴得住（.22 会像个头盔）；
//   眼睛画在贴图上、占 y 1.48~1.52，脸面比帽筒前缘鼓出去一截——
//   从游戏 66° 俯视角想遮住眼睛，只能靠帽舌压在眼上方（y≈1.53）往前探出脸 .1：
//   视线到眼睛的路径必然穿过帽舌（tan66°≈2.25，每高 .02 就要前探 .009，余量充足）。
function addCopCap(g, h = 1.5) {
  const s = h / 1.62;
  const capMat = new T.MeshStandardMaterial({ color: 0x2f4a6b, roughness: .82, side: T.DoubleSide });
  const cap = new T.Group();
  // 帽筒：拉高的半球，帽口压到眼眶下缘（h*.895），整个把头上半截罩进去——
  // 奶蛙的眼睛画在 y1.45~1.53 的球面上、脸又向前鼓，平板帽舌挡不住 66° 俯视的视线，
  // 只有帽筒曲面（前缘 z≈.26 > 脸面 .20）包住眼眶才遮得严实，像戴到位的安全帽。
  const dome = new T.Mesh(new T.SphereGeometry(.21 * s, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
  dome.scale.y = 1.15;
  dome.position.z = .05 * s;   // 对准头心：脸面（z≈.20）必须整个包进帽筒曲面里
  cap.add(dome);
  // 帽箍：深色一圈，罩住帽口和脸颊上缘
  const band = new T.Mesh(new T.CylinderGeometry(.215 * s, .224 * s, .07 * s, 20),
    new T.MeshStandardMaterial({ color: 0x1b2b40, roughness: .8 }));
  band.position.set(0, -.02 * s, .04 * s);
  cap.add(band);
  // 帽舌：帽口前沿探出一小截，压低，保留警帽轮廓
  const brim = new T.Mesh(new T.BoxGeometry(.38 * s, .026 * s, .08 * s), capMat);
  brim.position.set(0, -.05 * s, .245 * s);
  brim.rotation.x = -.2;
  cap.add(brim);
  // 帽徽：嵌在帽筒正面曲面上
  const badge = new T.Mesh(new T.SphereGeometry(.045 * s, 10, 8),
    new T.MeshStandardMaterial({ color: 0xf2c14e, roughness: .35, metalness: .5 }));
  badge.position.set(0, .1 * s, .23 * s);
  cap.add(badge);
  cap.position.y = h * .895;
  g.add(cap);
  return cap;
}

function npcDefObj(def, mapKey, x, z) {
  return {
    def, map: mapKey, x, z, hx: x, hz: z,
    tx: x, tz: z, wp: 0, wait: rnd(.4, 2.6), bob: rnd(0, 6.28), walking: false
  };
}

async function spawnVillageNpcs() {
  for (const def of NPCS) {
    try {
      // 棋爷没有现成模型，用几何体现拼；其他人还是仓库里的 GLB
      const obj = def.rig === "oldman" ? makeOldMan() : await getActor(def.char);
      if (!obj) continue;
      const g = new T.Group();
      g.add(obj);
      if (def.cop) addCopCap(g, (CAST[def.char] || {}).h || 1.5);
      g.position.set(def.home.x, surfaceY(VILLAGE, def.home.x, def.home.z), def.home.z);
      g.rotation.y = def.face || 0;
      world.add(g);
      const n = npcDefObj(def, "village", def.home.x, def.home.z);
      n.obj = g;
      npcs.push(n);
    } catch (e) { console.warn("[game] 村民没来：" + def.id, e); }
  }
}

async function spawnRoomNpcs(map, mapKey) {
  if (!map.npcs || !map.npcs.length) return;
  const room = rooms.get(mapKey);
  if (!room) return;
  for (const spec of map.npcs) {
    if (npcs.some(n => n.map === mapKey && n.def.id === spec.id)) continue;
    try {
      const obj = await getActor(DESK_OFFICER.char);
      if (!obj) continue;
      const g = new T.Group();
      g.add(obj);
      if (DESK_OFFICER.cop) addCopCap(g, (CAST[DESK_OFFICER.char] || {}).h || 1.5);
      const x = map.ox + spec.tx + .5, z = map.oz + spec.tz + .5;
      g.position.set(x, 0, z);
      g.rotation.y = spec.face || 0;
      room.group.add(g);
      const n = npcDefObj(DESK_OFFICER, mapKey, x, z);
      n.obj = g;
      npcs.push(n);
      setSolid(map, spec.tx, spec.tz, 1);
    } catch (e) { console.warn("[game] 值班的没在", e); }
  }
}

/* =========================================================
   奶家镇的两位：暴暴龙摆擂、肥嘟嘟丢口袋
   ========================================================= */
const TOWN_NPCS = [
  {
    id: "troupe_master",
    name: "戏班主",
    char: "naileditor",           // 用几何体现拼，见 makeTroupeMaster
    rig: "troupemaster",
    home: { x: -16.5, z: -3.5 },  // 戏台边上
    face: .6,
    tag: "张罗今晚的戏",
    greet: [
      "（他站在戏台边，手里攥着一张写满名字的红纸，直搓手。）",
      "今儿是个大日子 —— 班子凑齐了，就差跑腿的。"
    ],
    act: "troupe",
    actLabel: "问问今晚的戏"
  },
  {
    id: "baobaolong",
    name: "暴暴龙",
    char: "baobaolong",
    home: { x: 3.5, z: .5 },
    face: 2.4,
    tag: "在镇上摆擂台",
    greet: [
      "站住。这儿是擂台，我是擂主。",
      "三天没人敢上来了。你要是赢了，钱归你；输了也别哭。"
    ],
    act: "arena",
    actLabel: "上台打一场"
  },
  {
    id: "feidudu",
    name: "肥嘟嘟袋鼠",
    char: "feidudu",
    home: { x: -4.5, z: 1.5 },
    face: -1.2,
    tag: "口袋又漏了",
    greet: [
      "（它捂着肚皮上的口袋，一脸发愁）",
      "我一路走过来，口袋里的东西掉光了。三只，三只都没了。"
    ],
    act: "pouch",
    actLabel: "帮它找口袋"
  }
];

// 竹林水塘的钓叟：就蹲在东岸钓位边上，说话能直接借竿
const GROVE_NPCS = [
  {
    id: "capy_angler",
    name: "卡皮巴拉",
    char: "capybara",
    home: { x: -0.5, z: 5.5 },
    face: -1.2,
    tag: "蹲在塘边看浮标",
    greet: [
      "……（它把钓竿架在石头上，眼睛半睁着）",
      "水里那位不急。你也别急，坐下来等它咬钩就是。"
    ],
    act: "fish",
    actLabel: "借它的竿试试"
  }
];

// 南高草坡的牛来：坡顶开阔，正好陪人练手
/* =========================================================
   镇内任务线：戏班子的三件戏家伙
   ---------------------------------------------------------
   戏班主托你三件事：把三封请帖送给镇上/竹林的三位街坊，
   再把散在镇上的三样戏家伙（锣、戏服、头面）找回来。
   两样都齐了回去交差，拿赏钱，班主包场请你上台唱一段。
   ========================================================= */
const TROUPE_INVITEES = [
  { id: "baobaolong", name: "暴暴龙", hint: "镇上擂台边" },
  { id: "feidudu", name: "肥嘟嘟", hint: "镇上市集旁" },
  { id: "capy_angler", name: "卡皮巴拉", hint: "竹林水塘东岸" }
];
const TROUPE_PROPS = [
  { name: "铜锣", color: 0xd9a12b, tx: 34, tz: 30 },     // 市集广场
  { name: "戏服", color: 0xa8443a, tx: 45, tz: 41 },     // 南街
  { name: "头面", color: 0xc8b7e0, tx: 13, tz: 26 }      // 镇西戏台后巷
];
const troupeProps = { objs: [], built: false };

function activeTroupe() {
  const t = state.troupe;
  return t && t.day === Farm.day ? t : null;
}

function troupeResetIfNewDay() {
  if (state.troupe && state.troupe.day !== Farm.day) {
    state.troupe = { day: Farm.day, stage: 0, gotList: [], invited: [] };
    troupeProps.objs.forEach(o => { o.group.visible = false; });
    save();
  }
}

// 戏班主：拿几何体现拼一个，别占 CAST 里的角色（他不是图鉴收集对象）
function makeTroupeMaster() {
  const g = new T.Group();
  const coat = new T.MeshStandardMaterial({ color: 0x7c4a52, roughness: .9 });
  const skin = new T.MeshStandardMaterial({ color: 0xe8c9a0, roughness: .9 });
  const hat = new T.MeshStandardMaterial({ color: 0x2f2a35, roughness: .85 });
  const body = new T.Mesh(new T.CylinderGeometry(.28, .38, .82, 10), coat);
  body.position.y = .51; body.castShadow = true; g.add(body);
  const head = new T.Mesh(new T.SphereGeometry(.26, 12, 10), skin);
  head.position.y = 1.12; head.castShadow = true; g.add(head);
  const cap = new T.Mesh(new T.CylinderGeometry(.3, .32, .16, 12), hat);
  cap.position.y = 1.32; g.add(cap);
  const brim = new T.Mesh(new T.CylinderGeometry(.42, .42, .04, 12), hat);
  brim.position.y = 1.25; g.add(brim);
  // 手里那张红纸
  const paper = new T.Mesh(new T.BoxGeometry(.22, .3, .02),
    new T.MeshStandardMaterial({ color: 0xc8443a, roughness: .85 }));
  paper.position.set(.34, .72, .12); paper.rotation.z = -.3; g.add(paper);
  g.scale.setScalar(1.08);
  return g;
}

function buildTroupeProps() {
  if (troupeProps.built) return;
  const town = OUTDOOR.town;
  if (!town) return;
  TROUPE_PROPS.forEach((def, i) => {
    const g = new T.Group();
    const px = TOWN.ox + def.tx + .5, pz = TOWN.oz + def.tz + .5;
    g.position.set(px, surfaceY(TOWN, px, pz), pz);
    const mat = new T.MeshStandardMaterial({ color: def.color, roughness: .65, metalness: .18 });
    let mesh;
    if (i === 0) {           // 铜锣：扁圆盘
      mesh = new T.Mesh(new T.CylinderGeometry(.3, .3, .07, 16), mat);
      mesh.rotation.x = Math.PI / 2; mesh.position.y = .34;
    } else if (i === 1) {    // 戏服：折叠的一小摞
      mesh = new T.Mesh(new T.BoxGeometry(.5, .32, .36), mat);
      mesh.position.y = .2;
    } else {                 // 头面：珠冠
      mesh = new T.Mesh(new T.ConeGeometry(.28, .42, 8), mat);
      mesh.position.y = .28;
    }
    mesh.castShadow = true;
    g.add(mesh);
    g.visible = false;
    town.add(g);
    troupeProps.objs.push({ group: g, got: false, i });
  });
  troupeProps.built = true;
}

function refreshTroupeProps() {
  const t = activeTroupe();
  const on = !!t && t.stage === 1;
  troupeProps.objs.forEach(o => { o.group.visible = on && !o.got; });
  if (on) {
    troupeProps.objs.forEach(o => { o.got = t.gotList.indexOf(o.i) >= 0; });
    troupeProps.objs.forEach(o => { o.group.visible = !o.got; });
  }
}

function troupeProgressText() {
  const t = activeTroupe();
  if (!t) return "戏班子今晚有演出 · 去镇上戏台边问问班主";
  if (t.stage >= 3) return "今晚的戏唱完了 ✅ 明早班主还来";
  const inviteN = t.invited.length, propN = t.gotList.length;
  return "今晚的戏：「三封信 + 三件戏家伙」· 请帖 " + inviteN + "/3 · 家伙 " + propN + "/3" +
    (inviteN >= 3 && propN >= 3 ? " · 回去找班主交差" : "");
}

// 跟三位街坊说话时顺手把请帖递了 —— 在 talk() 里调
function troupeInvite(npcId) {
  const t = activeTroupe();
  if (!t || t.stage !== 1) return;
  if (!TROUPE_INVITEES.some(x => x.id === npcId)) return;
  if (t.invited.indexOf(npcId) >= 0) return;
  t.invited.push(npcId);
  save();
  refreshTroupeProps();
  toast("请帖送到了（" + t.invited.length + "/3）");
  if (t.invited.length >= 3 && t.gotList.length >= 3) {
    setTimeout(() => toast("请帖和家伙都齐了 · 回戏台找班主"), 1000);
  }
}

// 戏家伙散在镇上，站边上按 E 捡
function tryTroupeProp() {
  const t = activeTroupe();
  if (!t || t.stage !== 1 || roomState.name !== "town") return false;
  for (const o of troupeProps.objs) {
    if (o.got) continue;
    if (Math.hypot(player.x - o.group.position.x, player.z - o.group.position.z) > 1.6) continue;
    o.got = true;
    o.group.visible = false;
    if (t.gotList.indexOf(o.i) < 0) t.gotList.push(o.i);
    sfx("coin");
    blip(820, .12, "sine", .04);
    toast("找到了" + TROUPE_PROPS[o.i].name + "（" + t.gotList.length + "/3）");
    save();
    if (t.gotList.length >= 3 && t.invited.length >= 3) {
      setTimeout(() => toast("三样都齐了 · 回戏台找班主"), 900);
    }
    return true;
  }
  return false;
}

function troupeBoard() {
  troupeResetIfNewDay();
  const t = activeTroupe();
  if (!t || t.stage === 0) {
    say("戏班主", [
      "（他把红纸往你手里一塞）你来得正好！",
      "今晚要唱《奶龙娶亲》，可三封请帖没送出去，行头也少了三样。",
      "劳你跑一趟：请帖送给暴暴龙、肥嘟嘟、竹林东岸那只卡皮巴拉；" +
        "再把铜锣、戏服、头面找回来 —— 都散在镇上。"
    ], null, [
      { label: "包在我身上", onPick: () => {
        state.troupe = { day: Farm.day, stage: 1, gotList: [], invited: [] };
        buildTroupeProps();
        refreshTroupeProps();
        save();
        toast("接下戏班的活 · 先送三封请帖");
      } },
      { label: "今晚没空", onPick: null }
    ], "happy");
    return;
  }
  if (t.stage >= 3) {
    say("戏班主", ["今晚这场圆满！", "明儿我还在这儿，班子天天有活儿。"], null, null, "happy");
    return;
  }
  const needInv = 3 - t.invited.length, needProp = 3 - t.gotList.length;
  if (needInv > 0 || needProp > 0) {
    const who = TROUPE_INVITEES.filter(x => t.invited.indexOf(x.id) < 0).map(x => x.name + "（" + x.hint + "）").join("、");
    const lines = ["（他探头看你手里的红纸）"];
    if (needInv > 0) lines.push("请帖还差 " + needInv + " 封：" + who + "。见着人递过去就行。");
    if (needProp > 0) {
      const names = TROUPE_PROPS.filter((_, i) => t.gotList.indexOf(i) < 0).map(x => x.name).join("、");
      lines.push("行头还缺 " + needProp + " 样：" + names + "，散在镇上，走近了按 E 捡。");
    }
    say("戏班主", lines, null, [{ label: "这就去", onPick: null }], "worry");
    return;
  }
  // 全都办妥 —— 交差
  say("戏班主", [
    "（他数了数红纸，又摸了摸找回的行头，眼睛亮了）",
    "齐了！齐了！今晚这场，有你一半功劳。"
  ], null, [
    { label: "交差领赏", onPick: claimTroupe },
    { label: "再等等", onPick: null }
  ], "happy");
}

function claimTroupe() {
  const t = activeTroupe();
  if (!t || t.stage >= 3 || t.invited.length < 3 || t.gotList.length < 3) return;
  t.stage = 3;
  Farm.gold += 150;
  state.balls += 2;
  grantExp(24);
  Farm.paint(); hudTick(); save();
  sfx("coin");
  toast("戏班的赏 · +150 金 · 捕捉球 +2 · 阅历 +24");
  // 班主包场：即使今天唱过了也再开一场
  setTimeout(() => startStage(true), 900);
}

const HILL_NPCS = [
  {
    id: "hill_niulai",
    name: "牛来",
    char: "niulai",
    home: { x: 4.5, z: -15.5 },
    face: 1.0,
    tag: "在坡顶练手",
    greet: [
      "我在这个坡上站了半天，一只像样的都没碰上。",
      "你敢不敢陪我打一场？这儿的野的，可比村北林子里凶。"
    ],
    act: "hillfight",
    actLabel: "跟它在坡上打一场"
  }
];

// 肥嘟嘟掉的三个口袋：戏台边、驿站院子、南街尽头
const POUCH_SPOTS = [
  { tx: 19.2, tz: 28.4 },
  { tx: 56.6, tz: 31.4 },
  { tx: 38.4, tz: 44.2 }
];
const pouchQuest = { active: false, got: 0, objs: [] };
let arenaPending = false;

function buildPouches() {
  if (pouchQuest.objs.length) return;
  const town = OUTDOOR.town;
  if (!town) return;
  POUCH_SPOTS.forEach((sp, i) => {
    const g = new T.Group();
    const bx = TOWN.ox + sp.tx, bz = TOWN.oz + sp.tz;
    g.position.set(bx, surfaceY(TOWN, bx, bz), bz);
    const sack = new T.Mesh(new T.SphereGeometry(.26, 10, 8),
      new T.MeshStandardMaterial({ color: 0xc9a877, roughness: .95 }));
    sack.scale.set(1, 1.15, 1);
    sack.position.y = .28;
    sack.castShadow = true;
    g.add(sack);
    const tie = new T.Mesh(new T.ConeGeometry(.1, .18, 6),
      new T.MeshStandardMaterial({ color: 0x8a6540, roughness: .95 }));
    tie.position.y = .58;
    g.add(tie);
    g.visible = false;
    town.add(g);
    pouchQuest.objs.push({ group: g, got: false, i });
  });
}

function startPouchQuest() {
  buildPouches();
  pouchQuest.active = true;
  pouchQuest.got = 0;
  pouchQuest.objs.forEach(o => { o.got = false; o.group.visible = true; });
  toast("三只口袋掉在镇上了 · 戏台边、驿站院子、南街尽头");
}

function tryPouch() {
  if (!pouchQuest.active || roomState.name !== "town") return false;
  for (const o of pouchQuest.objs) {
    if (o.got) continue;
    if (Math.hypot(player.x - o.group.position.x, player.z - o.group.position.z) > 1.5) continue;
    o.got = true;
    o.group.visible = false;
    pouchQuest.got++;
    sfx("coin");
    blip(760, .12, "sine", .04);
    toast("捡到一只口袋（" + pouchQuest.got + "/3）");
    if (pouchQuest.got >= 3) setTimeout(() => toast("三只都找回来了 · 拿回去给肥嘟嘟"), 900);
    return true;
  }
  return false;
}

async function spawnMapNpcs(key, defs, group) {
  if (!group) return;
  for (const def of defs) {
    if (npcs.some(n => n.map === key && n.def.id === def.id)) continue;
    try {
      // 没有现成模型的角色用几何体现拼
      const obj = def.rig === "oldman" ? makeOldMan()
        : def.rig === "troupemaster" ? makeTroupeMaster()
        : await getActor(def.char);
      if (!obj) continue;
      const g = new T.Group();
      g.add(obj);
      g.position.set(def.home.x, surfaceY(MAPS[key], def.home.x, def.home.z), def.home.z);
      g.rotation.y = def.face || 0;
      group.add(g);
      const n = npcDefObj(def, key, def.home.x, def.home.z);
      n.obj = g;
      npcs.push(n);
    } catch (e) { console.warn("[game] " + key + " 上有人没来：" + def.id, e); }
  }
}
function spawnTownNpcs() { return spawnMapNpcs("town", TOWN_NPCS, OUTDOOR.town); }
function spawnGroveNpcs() { return spawnMapNpcs("grove", GROVE_NPCS, OUTDOOR.grove); }
function spawnHillNpcs() { return spawnMapNpcs("hill", HILL_NPCS, OUTDOOR.hill); }

function npcOnMap() {
  const key = roomState.name;
  return npcs.filter(n => n.map === key);
}

function npcNear(limit = 1.8) {
  let best = null, bd = limit;
  for (const n of npcOnMap()) {
    const d = Math.hypot(player.x - n.x, player.z - n.z);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

// 走近了就停下、转头看你；站定了才好说话
const NPC_STOP = 2.3;

function npcUpdate(dt) {
  const now = performance.now() / 1000;
  for (const n of npcOnMap()) {
    const def = n.def;
    const d = Math.hypot(player.x - n.x, player.z - n.z);
    n.walking = false;
    if (d < NPC_STOP) {
      const want = Math.atan2(player.x - n.x, player.z - n.z);
      const diff = ((want - n.obj.rotation.y + Math.PI * 3) % 6.283) - Math.PI;
      n.obj.rotation.y += diff * Math.min(1, dt * 8);
    } else if (def.patrol) {
      const p = def.patrol[n.wp];
      const dx = p.x - n.x, dz = p.z - n.z, len = Math.hypot(dx, dz);
      if (len < .3) {
        n.wp = (n.wp + 1) % def.patrol.length;
        n.wait = .5 + Math.random() * .8;
      } else if (n.wait > 0) {
        n.wait -= dt;
      } else {
        const sp = (def.speed || 1.4) * dt;
        const nx = n.x + dx / len * sp, nz = n.z + dz / len * sp;
        if (!blocked(nx, n.z, .3)) n.x = nx;
        if (!blocked(n.x, nz, .3)) n.z = nz;
        n.obj.rotation.y = Math.atan2(dx, dz);
        n.walking = true;
      }
    } else if (def.pace) {
      n.wait -= dt;
      if (n.wait <= 0) {
        const a = Math.random() * 6.283, rad = Math.random() * def.pace;
        n.tx = n.hx + Math.cos(a) * rad;
        n.tz = n.hz + Math.sin(a) * rad;
        n.wait = 2.2 + Math.random() * 3.6;
      }
      const dx = n.tx - n.x, dz = n.tz - n.z, len = Math.hypot(dx, dz);
      if (len > .16) {
        const sp = .85 * dt;
        const nx = n.x + dx / len * sp, nz = n.z + dz / len * sp;
        if (!blocked(nx, n.z, .28)) n.x = nx;
        if (!blocked(n.x, nz, .28)) n.z = nz;
        n.obj.rotation.y = Math.atan2(dx, dz);
        n.walking = true;
      }
    }
    const anim = n.obj.children[0] && n.obj.children[0].userData.anim;
    if (anim) anim.update(n.walking ? "walk" : "idle", { t: now + n.bob, phase: now * 9 + n.bob });
    const nBob = n.walking ? Math.abs(Math.sin(now * 9 + n.bob)) * (anim ? .035 : .05) : 0;
    n.obj.position.set(n.x, terrainY(n.x, n.z) + nBob, n.z);
  }
}

/* ---- C 位给玩家的那点面子：走过来时小声打个招呼 ---- */
const greeted = new Set();
function greetCheck() {
  const n = npcNear(2.6);
  if (!n || greeted.has(n.def.id)) return;
  greeted.add(n.def.id);
  blip(620, .06, "sine", .02);
}

/* =========================================================
   屋里的事：做饭 / 翻村史 / 歇脚 / 悬赏
   ========================================================= */
function onceToday(key) {
  const k = key + ":" + Farm.day;
  if (state.dayFlags[k]) return false;
  state.dayFlags[k] = true;
  return true;
}

function cookSoup() {
  const have = ["radish", "corn", "melon"].filter(k => (Farm.bag[k] || 0) > 0);
  if (!have.length) {
    say("灶台", ["锅里空着。", "先收点东西回来，切两片扔进去，就能煮一锅热的。"]);
    return;
  }
  if (Farm.stamina >= Farm.maxStamina) {
    say("灶台", ["你现在一点也不累，吃不下去。", "留着肚子干活吧。"]);
    return;
  }
  const k = have[0];
  Farm.bag[k]--;
  Farm.stamina = Math.min(Farm.maxStamina, Farm.stamina + 32);
  Farm.paint();
  sfx("coin");
  say("灶台", [
    "切了半个" + CROPS[k].name + "扔进锅里，撒把盐。",
    "热气一冲上来，人就缓过来了。（体力 +32）"
  ]);
}

const LORE = [
  "村志第一页写着：这里最早只有一口井，后来大家围着井盖房子，才慢慢有了村。",
  "奶龙是 2019 年被人画出来的，设定上身高 180、体重两吨，最爱吃饭睡觉和跳舞。",
  "奶蛙出生在一次 AI 生成翻车，靠一声「齁齁齁」在评论区站稳了脚。",
  "牛来的模型是被人手搓了五年才有的，一句「妈妈，牛来」被当成许愿池。",
  "小七是从地球来的少年发明家，摊子后面那台机器焊了三年还没焊完。",
  "这本村志最后一页是空白的，边角有人用铅笔写了两个字：等你。"
];

function readArchive() {
  const i = (state.loreIdx || 0) % LORE.length;
  state.loreIdx = i + 1;
  const first = onceToday("read");
  const lines = [LORE[i]];
  if (first) {
    grantExp(10);
    lines.push("（翻了一下午书，眼睛有点花，但心里踏实。阅历 +10）");
  }
  say("村史馆", lines, null, null, "normal");
}

/* ---- 上床 / 起床 ----
   床是画在地面贴图上的一块 3×3，人躺下去就是真的躺下去：
   绕 X 轴转 -90°，头朝枕头（-z），身子压在床垫上，再把人往床中间挪。 */
const sleepPose = { on: false, back: null };

// 关灯：只在天真的睡过去那一下压黑，躺下的过程要看得见
function dim(on) {
  document.body.classList.toggle("asleep", !!on);
}

// 躺下时盖在身上的被子——不再拿几何体拼（方盒 + 方条 + 球，俯视一看就是两层），
// 而是一整片蒙在身体上的布：躺下时把躺平模型的顶点烘成"身体高度场"，
// 布面 = 身体表面抬高一点、边缘垂到床垫、再叠细褶皱 + 两头收圆。
// 布跟着身体的起伏走，读起来就是"盖上去的"，不是一个浮在另一层上的盒子。
let quilt = null;
const QUILT = { cols: 34, rows: 28, halfW: .75 };
function quiltMesh() {
  if (quilt) return quilt;
  quilt = new T.Group();
  const cloth = new T.MeshStandardMaterial({
    color: 0xcd675c, roughness: .96, side: T.DoubleSide,
    // 布面基准面离床垫面只有几毫米，远相机下会跟床垫贴图 z-fighting
    //（床垫上印的图案会透过布面闪现，看着像身体顶穿被子），给它一个深度偏移
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
  });

  const mesh = new T.Mesh(new T.BufferGeometry(), cloth);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  quilt.add(mesh);
  quilt.userData.cloth = mesh;
  // 被口卷边不再用独立圆筒——刚体圆筒宽度固定、不跟身体轮廓，两侧悬空看着
  // 像一根横棍。卷边直接烘进布面高度场（见 drapeQuilt 第 4 步），沿身体隆起。

  quilt.visible = false;
  scene.add(quilt);
  return quilt;
}

// 把身体轮廓烘进布面：top[r][c] = 该格上方身体的最高点，两次盒式模糊当"布的下垂"
function drapeQuilt(cx, box2) {
  const mesh = quilt.userData.cloth;
  const headZ = box2.min.z, footZ = box2.max.z;
  const qz = headZ + .93, qx = cx;
  const z0 = -.32;                                   // 被口压在下巴下（嘴/鼻/眼都留在被子外）
  const z1 = (footZ - qz) + .32;                     // 脚那头多垂出一截
  const rows = QUILT.rows, cols = QUILT.cols;
  const dz = (z1 - z0) / rows, dx = QUILT.halfW * 2 / cols;
  // 1) 采身体高度场。注意：身体网格顶点间距（~.08）比格子（~.045）大，
  //    只把顶点记进最近格会让大半格子是空洞、布面在这些洞里塌到身体下面
  //    （俯视就是一条条身体从"洞"里透出来）。所以每个顶点向半径内所有格子泼溅。
  const top = new Float32Array((cols + 1) * (rows + 1));
  const SPLAT_R2 = .055 * .055;
  playerObj.updateMatrixWorld(true);
  playerObj.traverse(o => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    const p = o.geometry.attributes.position, e = o.matrixWorld.elements;
    for (let i = 0; i < p.count; i++) {
      const wx = e[0] * p.getX(i) + e[4] * p.getY(i) + e[8] * p.getZ(i) + e[12];
      const wy = e[1] * p.getX(i) + e[5] * p.getY(i) + e[9] * p.getZ(i) + e[13];
      const wz = e[2] * p.getX(i) + e[6] * p.getY(i) + e[10] * p.getZ(i) + e[14];
      const lx = wx - qx, lz = wz - qz;
      if (lx < -QUILT.halfW - .06 || lx > QUILT.halfW + .06 || lz < z0 - .06 || lz > z1 + .06) continue;
      const fc = (lx + QUILT.halfW) / dx, fr = (lz - z0) / dz;
      const c0 = Math.max(0, Math.ceil(fc - .06 / dx)), c1 = Math.min(cols, Math.floor(fc + .06 / dx));
      const r0 = Math.max(0, Math.ceil(fr - .06 / dz)), r1 = Math.min(rows, Math.floor(fr + .06 / dz));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const ddx = (c * dx - QUILT.halfW) - lx, ddz = (z0 + r * dz) - lz;
        if (ddx * ddx + ddz * ddz > SPLAT_R2) continue;
        const k = r * (cols + 1) + c;
        if (wy > top[k]) top[k] = wy;
      }
    }
  });
  // 1.5) 膨胀两轮兜底：仍没泼溅到的格子取邻域最大值，保证场无洞
  for (let pass = 0; pass < 2; pass++) {
    const src = top.slice();
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
      const k = r * (cols + 1) + c;
      if (src[k] > 0) continue;
      let m = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr > rows || cc < 0 || cc > cols) continue;
        if (src[rr * (cols + 1) + cc] > m) m = src[rr * (cols + 1) + cc];
      }
      top[k] = m;
    }
  }
  // 2) 盒式模糊 ×10：布搭在身上会摊平过渡，不会一格一格台阶（原始场留着兜底）。
  //    棉被读起来要"一整块压下来"，模糊轮数给足，局部细碎起伏全部抹平。
  const topRaw = top.slice();
  for (let pass = 0; pass < 10; pass++) {
    const src = top.slice();
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
      let sum = 0, n = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr > rows || cc < 0 || cc > cols) continue;
        sum += src[rr * (cols + 1) + cc]; n++;
      }
      top[r * (cols + 1) + c] = sum / n;
    }
  }
  // 2.5) 兜底场轻模糊一轮：去掉单格毛刺，兜底区和融合区交界不再产生折痕
  const rawS = new Float32Array(topRaw.length);
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
    let sum = 0, n = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr > rows || cc < 0 || cc > cols) continue;
      sum += topRaw[rr * (cols + 1) + cc]; n++;
    }
    rawS[r * (cols + 1) + c] = sum / n;
  }
  // 3) 写布面顶点：先模糊出"摊平的下垂"，再强制不低于身体顶 + 布厚
  //    （纯模糊会把肚子峰值抹下去，肚皮就从布面顶穿了）；细褶皱 + 两头微收
  const pos = new Float32Array((cols + 1) * (rows + 1) * 3);
  let k = 0;
  for (let r = 0; r <= rows; r++) {
    const lz = z0 + r * dz;
    const tz = (lz - z0) / (z1 - z0);
    const taper = 1 - .10 * Math.max(0, Math.max(tz, 1 - tz) - .85) / .15;   // 端头 15% 微收
    for (let c = 0; c <= cols; c++) {
      const lx = (-QUILT.halfW + c * dx) * taper;
      const body = top[r * (cols + 1) + c];
      const raw = rawS[r * (cols + 1) + c];
      // 基准面抬到世界 y≈.105：床垫面在 y≈.06，太近会 z-fighting（床垫印花透布）。
      // 身体区域"深度融合"：按模糊场存在度从床垫面连续升到 身体+.05，
      // 不再有"身体区/床垫区"两套取值硬切换造成的交界折痕；
      // raw 只在两处兜底——肚皮峰值（10 轮模糊抹峰 >.01）和身体侧面收边
      // （布不切进身侧）。这两处 raw 本身平滑，不会读出搓衣板。
      const p = T.MathUtils.smoothstep(body, .015, .07);
      let h = .03 + p * (body + .05 - .03);
      if (raw > .02 && raw + .04 > h) h = raw + .04;
      h = Math.max(.085, h);
      // 细褶皱再减淡（.010→.005、频率再降）：往"整块厚棉被"靠，几乎只剩
      // 身体大起伏 + 极轻的布纹
      h += .005 * Math.sin(lx * 7 + lz * 4) * Math.sin(lz * 6 - lx * 3);   // 细褶皱
      // 4) 被口卷边烘进布面：贴着被口隆起一道半圆截面的软卷边，横向按身体
      //    轮廓取 Existence——身体上方隆起、两侧自然落回床垫，不再是固定宽度
      //    的独立圆筒横棍
      const rl = (lz - z0) / .14;
      if (rl < 1) {
        let near = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -3; dc <= 3; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || rr > rows || cc < 0 || cc > cols) continue;
          if (topRaw[rr * (cols + 1) + cc] > near) near = topRaw[rr * (cols + 1) + cc];
        }
        const on = T.MathUtils.smoothstep(near, .05, .15);
        h += .07 * Math.sin(Math.min(rl, 1) * Math.PI) * on;
      }
      pos[k++] = lx; pos[k++] = h; pos[k++] = lz;
    }
  }
  const idx = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = r * (cols + 1) + c, b = a + 1, d = a + cols + 1, e2 = d + 1;
    idx.push(a, d, b, b, d, e2);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  mesh.geometry.dispose();
  mesh.geometry = g;
}

function lieDown() {
  if (!MAP || !MAP.indoor || !MAP.room || roomState.name !== "house") return;
  const R = MAP.room;
  const cx = MAP.ox + R.x0 + 2.5;
  const cz = MAP.oz + R.z0 + 2.5;
  sleepPose.on = true;
  sleepPose.back = { x: player.x, z: player.z, heading: player.heading };
  player.x = cx;
  player.z = cz + .95;
  player.moving = false;
  // 面朝上躺平：+Y(头) → -Z(枕头)，+Z(脸) → +Y(朝天)
  playerObj.rotation.set(-Math.PI / 2, 0, 0);
  playerObj.position.set(cx, 0, cz + .95);
  playerObj.updateMatrixWorld(true);
  // 按包围盒实测落位：不靠猜高度，模型多厚都不会插进床垫
  const box = new T.Box3().setFromObject(playerObj);
  // 床是 3×3、从 (R.x0+1, R.z0+1) 铺起，枕头画在北端 15%~32% 处；
  // 头（box.min.z，-Z 端）落在枕头中心略偏北
  const pillowZ = cz - 1.5 + 3 * .235;
  const zShift = (pillowZ - .1) - box.min.z;
  const xShift = cx - (box.min.x + box.max.x) / 2;
  playerObj.position.x += xShift;
  playerObj.position.z += zShift;
  // 主循环每帧会用 player.x/z 重设位置，把位移同步回去才不会被覆盖
  player.x = playerObj.position.x;
  player.z = playerObj.position.z;
  playerObj.updateMatrixWorld(true);
  const box2 = new T.Box3().setFromObject(playerObj);
  // 床垫面在 y≈0，稍微压进去 0.06 读起来像陷进软垫
  playerObj.position.y += .06 - box2.min.y;
  // 被口压在下巴下：被子原点在 box2.min.z + .93，布面被口在本地 z=-.22（世界 .71）
  const q = quiltMesh();
  q.position.set(cx, .02, box2.min.z + .93);
  drapeQuilt(cx, box2);
  q.visible = true;
  updateCamera();
}

function getUp() {
  if (!sleepPose.on) return;
  sleepPose.on = false;
  const b = sleepPose.back || { x: player.x, z: player.z, heading: 0 };
  player.x = b.x; player.z = b.z; player.heading = b.heading;
  player.moving = false;
  playerObj.position.set(b.x, 0, b.z);
  playerObj.rotation.set(0, b.heading, 0);
  if (quilt) quilt.visible = false;
  dim(false);
  updateCamera();
}

function restSpot() {
  if (Farm.stamina >= Farm.maxStamina) {
    say("长椅", ["你一点也不累，坐不住。", "出去走两圈再回来。"]);
    return;
  }
  Farm.stamina = Math.min(Farm.maxStamina, Farm.stamina + 14);
  Farm.time = Math.min(1560, Farm.time + 20);
  Farm.paint();
  sfx("pick");
  say("长椅", ["坐下歇了一会儿。窗外有风，木头发出一声轻响。", "（体力 +14，时间过去 20 分钟）"]);
}

function questProgress(kind, n = 1) {
  const b = state.bounty;
  if (!b || b.done || b.kind !== kind) return;
  b.got = Math.min(b.need, b.got + n);
  if (b.got >= b.need) {
    blip(880, .12, "sine", .04);
    toast("悬赏做完了 · 回奶察局领赏");
  }
}

/* =========================================================
   驿站远行委托：镇上驿站院子每天贴一张，接了去村外跑一趟
   ========================================================= */
const COURIER_JOBS = [
  { kind: "arrive", map: "grove", need: 1, gold: 70, title: "给竹林送封信",
    desc: "跑一趟竹林水塘，把信交到林子里那块牌子上。" },
  { kind: "arrive", map: "hill", need: 1, gold: 80, title: "看看坡上的路",
    desc: "上南高草坡走一趟，坡顶石台那头有人等着回话。" },
  { kind: "shoot", map: "grove", need: 2, gold: 75, balls: 1, title: "饭馆要两根竹笋",
    desc: "去竹林水塘掰两根竹笋，东岸沙地上就有。" },
  { kind: "fish", map: "grove", need: 2, gold: 90, title: "想喝一锅鱼汤",
    desc: "在竹林水塘钓上两条鱼，带回驿站交差。" },
  { kind: "battle", map: null, need: 1, gold: 100, balls: 1, title: "草坡太闹腾了",
    desc: "去野外打赢一场，把闹事的野物吓一吓。" }
];

function courierToday() {
  const r = mulberry(Farm.day * 104729 + 17);
  const j = COURIER_JOBS[Math.floor(r() * COURIER_JOBS.length)];
  return {
    day: Farm.day, kind: j.kind, map: j.map, need: j.need, got: 0, done: false,
    title: j.title, desc: j.desc, reward: { gold: j.gold, balls: j.balls || 0 }
  };
}

function activeCourier() {
  const c = state.courier;
  return c && c.day === Farm.day ? c : null;
}

function courierProgress(kind, mapKey, n = 1) {
  const c = activeCourier();
  if (!c || c.done || c.kind !== kind || (c.map && c.map !== mapKey)) return;
  const before = c.got;
  c.got = Math.min(c.need, c.got + n);
  if (c.got === before) return;
  save();
  toast(c.got >= c.need
    ? "驿务办妥了 · 回驿站交差"
    : "驿务有进展（" + c.got + "/" + c.need + "）");
}

function courierBoard() {
  const c = activeCourier() || courierToday();
  const where = c.map ? (MAPS[c.map] ? MAPS[c.map].name : c.map) : "村外的野外";
  if (c.done) {
    say("驿站的委托榜", ["今天的活儿已经结了。", "榜上明天才换新单，先去玩吧。"]);
    return;
  }
  if (c.got >= c.need) {
    say("驿站的委托榜", [
      "「" + c.title + "」—— 事办完了？",
      "驿卒把回执收过去，数了数钱。"
    ], null, [
      { label: "交差领钱", onPick: claimCourier },
      { label: "再等等", onPick: null }
    ], "happy");
    return;
  }
  if (activeCourier()) {
    say("驿站的委托榜", [
      "「" + c.title + "」· " + c.desc,
      "已经办了 " + c.got + "/" + c.need + "。回来找我交差。"
    ]);
    return;
  }
  say("驿站的委托榜", [
    "今日远行委托：「" + c.title + "」。",
    c.desc,
    "地方在" + where + "。办完回这张榜前按 E 交差。"
  ], null, [
    { label: "接下这单", onPick: () => { state.courier = c; save(); toast("接下驿务 · " + c.title); } },
    { label: "先不接", onPick: null }
  ]);
}

function claimCourier() {
  const c = activeCourier();
  if (!c || c.done || c.got < c.need) return;
  c.done = true;
  const R = c.reward;
  Farm.gold += R.gold;
  state.balls += R.balls || 0;
  grantExp(16);
  Farm.paint(); hudTick(); save();
  sfx("coin");
  say("驿站的委托榜", [
    "回执对上了。" + (R.gold ? "工钱 " + R.gold + " 金。" : "") +
      (R.balls ? "再搭你 " + R.balls + " 个球，路上兴许用得上。" : ""),
    "明天的单子还不知道是什么，明早再来看。"
  ], null, null, "happy");
}

function bountyMenu() {
  if (!state.bounty || state.bountyDay !== Farm.day) {
    state.bounty = bountyOf(Farm.day);
    state.bountyDay = Farm.day;
    state.bounty.isNew = true;
  }
  const b = state.bounty;
  if (b.got >= b.need && !b.done) {
    say("奶察", [
      "「" + b.title + "」—— 你这就做完了？",
      "行，奖金在这儿。剩下的活儿明天再派。"
    ], null, [{ label: "交任务", onPick: claimBounty }, { label: "等下再说", onPick: null }], "happy");
    return;
  }
  if (b.done) {
    say("奶察", ["今天的活儿你已经结了。", "回去种地吧，明天早上有新的。"]);
    return;
  }
  say("奶察", [
    "今天的活儿：「" + b.title + "」。",
    b.desc,
    "做到 " + b.got + "/" + b.need + " 了。做完回来找我。"
  ], () => { state.bounty.isNew = false; });
}

function claimBounty() {
  const b = state.bounty;
  if (!b || b.done || b.got < b.need) return;
  b.done = true;
  const R = b.reward || {};
  if (R.gold) Farm.gold += R.gold;
  if (R.balls) state.balls += R.balls;
  if (R.seeds) for (const k in R.seeds) Farm.seeds[k] = (Farm.seeds[k] || 0) + R.seeds[k];
  if (R.water) Farm.water = Farm.maxWater;
  grantExp(14);
  Farm.paint();
  hudTick();
  sfx("coin");
  say("奶察", [
    "钱点好了：" + (R.gold || 0) + " 金" +
    (R.balls ? "，外加 " + R.balls + " 个球" : "") +
    (R.seeds ? "，两包萝卜种" : "") + "。",
    "别嫌少。村里就这点预算。"
  ], null, null, "happy");
}

function boardMenu() {
  const b = state.bounty;
  const lines = ["公告板上钉着三张纸：", "① 高草区夜里别一个人去。② 水塘东岸的路塌了半格，绕一下。"];
  lines.push(b && !b.done
    ? "③ 今日悬赏：" + b.title + "（" + b.got + "/" + b.need + "）"
    : "③ 今日悬赏已经结了，明天再来。");
  say("公告板", lines);
}

/* =========================================================
   场景切换：户外的几张图 + 室内房间，都从这里换
   ========================================================= */
const roomState = { name: "village", back: { x: 0, z: 0 }, backHeading: 0 };

// 所有传送锚点：位置按各自地图的格子算，点亮要花钱
const ANCHORS = {
  village: { name: "奶家村 · 广场", map: "village", tx: 47, tz: 32, cost: 30 },
  town: { name: "奶家镇 · 市集", map: "town", tx: 38, tz: 30, cost: 40 },
  grove: { name: "竹林水塘 · 林间空地", map: "grove", tx: 40, tz: 30, cost: 35 },
  hill: { name: "南高草坡 · 坡顶", map: "hill", tx: 32, tz: 12, cost: 45 }
};

// 锁着的锚点是石灰色，点亮之后泛青光
function syncAnchorLook() {
  for (const s of ANCHOR_STONES) {
    const on = !!state.anchors[s.key];
    s.mat.color.setHex(on ? 0x7fe3d4 : 0x8e9a9c);
    s.mat.emissive.setHex(on ? 0x1f6f66 : 0x000000);
  }
}

// 锚点晶体：点亮后会转、会浮、会呼吸
let anchorT = 0;
function animateAnchors(dt) {
  anchorT += dt;
  for (const st of ANCHOR_STONES) {
    const on = !!state.anchors[st.key];
    st.crystal.rotation.y += dt * (on ? 1.1 : .18);
    st.crystal.position.y = 1.42 + Math.sin(anchorT * (on ? 2.2 : .8)) * (on ? .09 : .03);
    if (on) {
      const p = .55 + Math.sin(anchorT * 2.4) * .25;
      st.mat.emissive.setRGB(.10 * p, .42 * p, .38 * p);
    }
  }
}

function setOutdoorVisible(key) {
  // 连续大世界：四张图同时存在，站在村口就能望见镇子的方向。
  // 进屋（key 为空）时全部收起，免得正交镜头被户外景物挡住。
  const outdoor = REGION_KEYS.includes(key);
  for (const k of REGION_KEYS) if (OUTDOOR[k]) OUTDOOR[k].visible = outdoor;
  // 地形跟着当前所在图切；进屋时清空（屋里全平）
  const m = key && MAPS[key];
  activeTerrain = (m && m.__height) ? m.__height : null;
  activeMap = (m && !m.indoor) ? m : null;
  // 远景只在户外露出来：屋里的正交镜头会被天穹挡满
  if (farGroup) farGroup.visible = outdoor;
  if (skyDome) skyDome.visible = outdoor && !isGuofeng();
}

/* ---- 跳跃：空格起跳，重力积分，落到起伏地形上 ---- */
const JUMP_V0 = 6.4, GRAVITY = 17.5;
function jump() {
  if (!state.started || dlg.open || Fight.on || overlayOpen() || sleepPose.on) return false;
  if (player.jumping || fishing.on || stageGame.on) return false;
  player.jumping = true;
  player.vy = JUMP_V0;
  player.jumpY = 0;
  sfx("jump");
  return true;
}
function updateJump(dt) {
  if (!player.jumping) { player.jumpY = 0; player.vy = 0; return; }
  player.vy -= GRAVITY * dt;
  player.jumpY += player.vy * dt;
  const ground = terrainY(player.x, player.z);
  if (player.jumpY <= 0) {
    player.jumpY = 0; player.vy = 0; player.jumping = false;
    // 落地扬尘 / 轻响；别在每次走路都响，只有真的从空中落下才触发
    try { sfx("land"); } catch (e) {}
  }
  return ground;
}

function placePlayer(x, z, heading, keepJump = false) {
  player.x = x; player.z = z;
  if (heading != null) player.heading = heading;
  player.moving = false;
  if (!keepJump) { player.jumping = false; player.jumpY = 0; player.vy = 0; }
  // 换场景别在空中落地穿模；跨拼缝则保留高度，跳着过去也不会突然掉下来
  playerObj.position.set(visX(), terrainY(x, z) + (keepJump ? player.jumpY : 0), visZ());
  playerObj.rotation.y = player.heading;
  cursor.visible = false;
  resize();
  updateCamera(true);
}

/* 换场景只有一个入口：室内、户外、门、锚点全走这里。
   spawn 支持两种写法：{ tx, tz } 按目标地图的格子给，{ x, z } 直接给世界坐标。 */
function travelTo(key, spawn) {
  const map = MAPS[key];
  if (!map || key === roomState.name) return false;
  if (sleepPose.on) getUp();
  if (dlg.open) closeDialog();
  closeWorldMap();

  // 离开村子时记下位置：存档点、被抬回村口都靠它
  if (roomState.name === "village") {
    roomState.back.x = player.x;
    roomState.back.z = player.z;
    roomState.backHeading = player.heading;
  }

  rooms.forEach(v => { v.group.visible = false; });
  roomState.name = key;
  MAP = map;
  roomName = map.indoor ? map.name : "";

  if (map.indoor) {
    setOutdoorVisible(null);
    const r = ensureRoom(key, map);
    r.group.visible = true;
    const R = map.room;
    const p = toWorld(map, R.x0 + R.exitTx, R.z0 + R.h - 3);
    placePlayer(p.x, p.z, Math.PI);
    if (!state.seenRoom) state.seenRoom = {};
    state.seenRoom[key] = true;
    spawnRoomNpcs(map, key);
    blip(560, .1, "sine", .04);
    toast("进了" + map.name);
  } else {
    setOutdoorVisible(key);
    let x = player.x, z = player.z, h = player.heading;
    if (spawn && typeof spawn.tx === "number") {
      const p = toWorld(map, spawn.tx, spawn.tz);
      x = p.x; z = p.z;
    } else if (spawn && typeof spawn.x === "number") {
      x = spawn.x; z = spawn.z;
    }
    if (spawn && spawn.heading != null) h = spawn.heading;
    // 落点万一压在实体上，往南挪一格再试，别把人塞进房子里。
    // 走过拼缝时不做这一步：视觉坐标必须一帧不变，挪一格就会「闪一下」。
    if (!spawn || !spawn.seamless) {
      for (let i = 0; i < 8 && blocked(x, z); i++) z += 1;
    }
    placePlayer(x, z, h, !!(spawn && spawn.seamless));
    if (key === "town") {
      spawnTownNpcs().catch(e => console.warn("[game] 镇上的没来", e));
      // 口袋任务进行中时，没捡的那些要重新露出来
      pouchQuest.objs.forEach(o => { o.group.visible = pouchQuest.active && !o.got; });
      buildTroupeProps();
      refreshTroupeProps();
    }
    if (key === "grove") {
      refreshShoots();
      spawnGroveNpcs().catch(e => console.warn("[game] 竹林的没来", e));
    }
    if (key === "hill") {
      spawnHillNpcs().catch(e => console.warn("[game] 坡上的没来", e));
    }
    courierProgress("arrive", key);
    if (!spawn || !spawn.seamless) {
      // 跨拼缝不算「传送」：不响、不弹字，人才会觉得是自己走过去的
      blip(key === "town" ? 640 : 520, .1, "sine", .035);
      toast(key === "village" ? "回到奶家村" : "来到" + map.name);
    }
  }
  hudTick();
  save();
  return true;
}

function enterRoom(to) { travelTo(to, null); }

function leaveRoom() {
  if (!MAP.indoor) return;
  travelTo("village", { x: roomState.back.x, z: roomState.back.z + .55, heading: 0 });
}

/* ---- 锚点：第一次按 E 花钱点亮，之后按 E（或 M）开地图跳 ---- */
function useAnchor(id) {
  const a = ANCHORS[id];
  if (!a) return;
  if (state.anchors[id]) { openWorldMap(); return; }
  const ok = Farm.gold >= a.cost;
  say("传送锚点", [
    "石座是凉的，中间那颗晶体一点光都没有。",
    ok ? "往里搁 " + a.cost + " 金，它能接上力气。"
       : "得往里搁 " + a.cost + " 金才点得亮 —— 你现在只有 " + Farm.gold + "。"
  ], null, [
    {
      label: "点亮（" + a.cost + " 金）",
      onPick: () => {
        if (Farm.gold < a.cost) { toast("钱不够"); return; }
        Farm.gold -= a.cost;
        state.anchors[id] = true;
        syncAnchorLook();
        Farm.paint(); hudTick(); save();
        sfx("coin");
        blip(880, .18, "sine", .05);
        toast("锚点点亮了 · 按 M 打开地图");
      }
    },
    { label: "先不点", onPick: null }
  ]);
}

/* =========================================================
   宏观世界地图：一张能缩放 / 平移的全图
   四张户外地图原本各自独立（坐标都差不多是 -44..44），这里给它们一个
   "大世界里的相对位置"：村在中间，镇在东，竹林在西北，草坡在南，
   中间用土路连起来，玩家位置按它在自己地图里的比例落到对应区块上。
   ========================================================= */
const MACRO = {
  village: { key: "village", name: "奶家村", center: [0, 0], map: VILLAGE, color: "#7fa663" },
  town:    { key: "town",    name: "奶家镇", center: [128, 4], map: TOWN, color: "#c79a6b" },
  grove:   { key: "grove",   name: "竹林水塘", center: [-126, -78], map: GROVE, color: "#5f9e6a" },
  hill:    { key: "hill",    name: "南高草坡", center: [10, 128], map: HILL, color: "#a9bd6a" }
};
// 区块之间的土路（宏观坐标，逐点连线）
const MACRO_ROADS = [
  [[44, 6], [72, 2], [96, 4], [112, 4]],                    // 村东 → 镇
  [[-44, -10], [-70, -28], [-96, -54], [-104, -70]],        // 村西北 → 竹林
  [[4, 34], [6, 62], [8, 92], [10, 100]]                    // 村南 → 草坡
];
const worldCanvas = $("#worldCanvas");
const wctx = worldCanvas ? worldCanvas.getContext("2d") : null;
const mapView = { scale: 1, ox: 0, oy: 0, ready: false, drag: null };
const MACRO_BASE = 1.15;   // 初始缩放到能看全图

function macroRect(r) {
  const hw = r.map.w / 2, hh = r.map.h / 2;
  return { x: r.center[0] - hw, y: r.center[1] - hh, w: r.map.w, h: r.map.h };
}
function macroFit() {
  if (!worldCanvas) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = worldCanvas.clientWidth, ch = worldCanvas.clientHeight;
  worldCanvas.width = Math.round(cw * dpr);
  worldCanvas.height = Math.round(ch * dpr);
  wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // 让所有区块 + 留白刚好落进画布
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const k in MACRO) {
    const q = macroRect(MACRO[k]);
    minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x + q.w);
    minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y + q.h);
  }
  const pad = 26;
  const sx = (cw - pad * 2) / (maxX - minX), sy = (ch - pad * 2) / (maxY - minY);
  mapView.fitScale = Math.min(sx, sy);
  mapView.fitOx = cw / 2 - (minX + maxX) / 2 * mapView.fitScale;
  mapView.fitOy = ch / 2 - (minY + maxY) / 2 * mapView.fitScale;
  if (!mapView.ready) {
    mapView.scale = mapView.fitScale * MACRO_BASE;
    mapView.ox = cw / 2 - (minX + maxX) / 2 * mapView.scale;
    mapView.oy = ch / 2 - (minY + maxY) / 2 * mapView.scale;
    mapView.ready = true;
  }
  drawWorldMap();
}
// 宏观坐标 → 画布像素
function m2s(x, y) {
  const cw = worldCanvas.clientWidth, ch = worldCanvas.clientHeight;
  return [x * mapView.scale + mapView.ox, y * mapView.scale + mapView.oy];
}
// 画布像素 → 宏观坐标
function s2m(sx, sy) {
  return [(sx - mapView.ox) / mapView.scale, (sy - mapView.oy) / mapView.scale];
}
function drawWorldMap() {
  if (!wctx || !worldCanvas || !$("#worldmap").classList.contains("show")) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = worldCanvas.clientWidth, ch = worldCanvas.clientHeight;
  wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  wctx.clearRect(0, 0, cw, ch);
  // 底：宣纸色 + 淡淡的网格
  wctx.fillStyle = "#eef3e8"; wctx.fillRect(0, 0, cw, ch);
  wctx.strokeStyle = "rgba(90,120,90,.10)"; wctx.lineWidth = 1;
  const grid = 40 * mapView.scale;
  if (grid > 10) {
    for (let x = (mapView.ox % grid + grid) % grid; x < cw; x += grid) {
      wctx.beginPath(); wctx.moveTo(x, 0); wctx.lineTo(x, ch); wctx.stroke();
    }
    for (let y = (mapView.oy % grid + grid) % grid; y < ch; y += grid) {
      wctx.beginPath(); wctx.moveTo(0, y); wctx.lineTo(cw, y); wctx.stroke();
    }
  }

  // 土路：先画，压在区块下面
  wctx.strokeStyle = "#c9ad7e"; wctx.lineWidth = Math.max(3, 6 * mapView.scale);
  wctx.setLineDash([10, 8]); wctx.lineCap = "round"; wctx.lineJoin = "round";
  MACRO_ROADS.forEach(pts => {
    wctx.beginPath();
    pts.forEach((p, i) => { const s = m2s(p[0], p[1]); i ? wctx.lineTo(s[0], s[1]) : wctx.moveTo(s[0], s[1]); });
    wctx.stroke();
  });
  wctx.setLineDash([]);

  // 四块区域
  for (const k in MACRO) {
    const r = MACRO[k], q = macroRect(r);
    const tl = m2s(q.x, q.y), br = m2s(q.x + q.w, q.y + q.h);
    const x = tl[0], y = tl[1], w = br[0] - tl[0], h = br[1] - tl[1];
    const here = roomState.name === k;
    // 底纹
    const mat = outdoorMats.get(k);
    const cv = mat && mat.map && mat.map.userData && mat.map.userData.canvas;
    wctx.save();
    roundRectPath(wctx, x, y, w, h, 12); wctx.clip();
    if (cv) wctx.drawImage(cv, x, y, w, h);
    else { wctx.fillStyle = r.color; wctx.fillRect(x, y, w, h); }
    // 夜色
    if (document.body.classList.contains("night")) {
      wctx.fillStyle = "rgba(20,32,58,.32)"; wctx.fillRect(x, y, w, h);
    }
    wctx.restore();
    // 边框：所在区域加粗高亮
    roundRectPath(wctx, x, y, w, h, 12);
    wctx.lineWidth = here ? 4 : 2;
    wctx.strokeStyle = here ? "#1f8a6b" : "rgba(70,80,60,.45)";
    wctx.stroke();
    if (here) {
      wctx.shadowColor = "rgba(31,138,107,.5)"; wctx.shadowBlur = 14; wctx.stroke(); wctx.shadowBlur = 0;
    }
    // 区域名（画布够大才画）
    if (w > 56) {
      const fs = Math.max(11, Math.min(19, 15 * mapView.scale / mapView.fitScale));
      wctx.font = "700 " + fs + "px system-ui, sans-serif";
      wctx.textAlign = "center"; wctx.textBaseline = "middle";
      wctx.lineWidth = 3; wctx.strokeStyle = "rgba(255,255,255,.9)";
      const labelY = y + Math.min(18, h * .14);
      wctx.strokeText(r.name, x + w / 2, labelY);
      wctx.fillStyle = "#243a2c"; wctx.fillText(r.name, x + w / 2, labelY);
    }
    // 锚点
    if (state.anchors[k]) {
      const a = ANCHORS[k], p = toWorld(r.map, a.tx, a.tz);
      const rx = q.x + (p.x - r.map.ox), ry = q.y + (p.z - r.map.oz);
      const s = m2s(rx, ry);
      wctx.beginPath(); wctx.arc(s[0], s[1], 7, 0, 7);
      wctx.fillStyle = "#37c9b4"; wctx.fill();
      wctx.lineWidth = 2; wctx.strokeStyle = "#fff"; wctx.stroke();
      wctx.fillStyle = "#0b5a46"; wctx.font = "700 10px system-ui"; wctx.textAlign = "center";
      wctx.fillText("✦", s[0], s[1] + 3);
    }
    // 玩家位置
    if (roomState.name === k) {
      const rx = q.x + (player.x - r.map.ox), ry = q.y + (player.z - r.map.oz);
      const s = m2s(rx, ry);
      wctx.beginPath(); wctx.arc(s[0], s[1], 9, 0, 7);
      wctx.fillStyle = "rgba(214,84,54,.28)"; wctx.fill();
      wctx.beginPath(); wctx.arc(s[0], s[1], 5, 0, 7);
      wctx.fillStyle = "#d65436"; wctx.fill();
      wctx.lineWidth = 2; wctx.strokeStyle = "#fff"; wctx.stroke();
    }
  }
  updateMapLegend();
}
function roundRectPath(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r); c.closePath();
}
function updateMapLegend() {
  const el = $("#mapLegend");
  if (!el || el.dataset.built) return;
  el.innerHTML =
    '<span><b style="background:#d65436"></b>你在这里</span>' +
    '<span><b style="background:#37c9b4"></b>已点亮锚点</span>' +
    '<span><b style="background:#c9ad7e"></b>连通土路</span>';
  el.dataset.built = "1";
}
function zoomMap(factor, cx, cy) {
  if (!mapView.ready) return;
  const cw = worldCanvas.clientWidth, ch = worldCanvas.clientHeight;
  cx = cx == null ? cw / 2 : cx; cy = cy == null ? ch / 2 : cy;
  const before = s2m(cx, cy);
  mapView.scale = clamp(mapView.scale * factor, mapView.fitScale * .7, mapView.fitScale * 5);
  const after = s2m(cx, cy);
  mapView.ox += (before[0] - after[0]) * mapView.scale;
  mapView.oy += (before[1] - after[1]) * mapView.scale;
  drawWorldMap();
}
function resetMapView() {
  if (!mapView.ready) return;
  const cw = worldCanvas.clientWidth, ch = worldCanvas.clientHeight;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const k in MACRO) {
    const q = macroRect(MACRO[k]);
    minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x + q.w);
    minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y + q.h);
  }
  mapView.scale = mapView.fitScale * MACRO_BASE;
  mapView.ox = cw / 2 - (minX + maxX) / 2 * mapView.scale;
  mapView.oy = ch / 2 - (minY + maxY) / 2 * mapView.scale;
  drawWorldMap();
}
// 鼠标事件：滚轮缩放、拖拽平移、点锚点传送
if (worldCanvas) {
  worldCanvas.addEventListener("wheel", e => {
    e.preventDefault();
    const r = worldCanvas.getBoundingClientRect();
    zoomMap(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  worldCanvas.addEventListener("pointerdown", e => {
    mapView.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: mapView.ox, oy: mapView.oy, moved: 0 };
    try { worldCanvas.setPointerCapture(e.pointerId); } catch (err) {}
  });
  worldCanvas.addEventListener("pointermove", e => {
    if (!mapView.drag || e.pointerId !== mapView.drag.id) return;
    const dx = e.clientX - mapView.drag.x, dy = e.clientY - mapView.drag.y;
    mapView.drag.moved += Math.abs(dx) + Math.abs(dy);
    mapView.ox = mapView.drag.ox + dx; mapView.oy = mapView.drag.oy + dy;
    drawWorldMap();
  });
  const dragEnd = e => {
    if (!mapView.drag || e.pointerId !== mapView.drag.id) return;
    const wasClick = mapView.drag.moved < 6;
    mapView.drag = null;
    if (wasClick) macroClick(e.clientX, e.clientY);
  };
  worldCanvas.addEventListener("pointerup", dragEnd);
  worldCanvas.addEventListener("pointercancel", dragEnd);
}
function macroClick(clientX, clientY) {
  const r = worldCanvas.getBoundingClientRect();
  const mx = clientX - r.left, my = clientY - r.top;
  // 点在已点亮锚点上就传送
  for (const k in MACRO) {
    if (!state.anchors[k]) continue;
    const r0 = MACRO[k], q = macroRect(r0), a = ANCHORS[k];
    const p = toWorld(r0.map, a.tx, a.tz);
    const rx = q.x + (p.x - r0.map.ox), ry = q.y + (p.z - r0.map.oz);
    const s = m2s(rx, ry);
    if (Math.hypot(s[0] - mx, s[1] - my) < 14) {
      closeWorldMap();
      travelTo(a.map, { tx: a.tx, tz: a.tz + 2, heading: 0 });
      return;
    }
  }
}

/* ---- 世界地图（M 键）---- */
function openWorldMap() {
  if (Fight.on || dlg.open || overlayOpen()) return;
  const list = $("#mapList");
  if (!list) return;
  list.innerHTML = "";
  for (const k in ANCHORS) {
    const a = ANCHORS[k];
    const unlocked = !!state.anchors[k];
    const here = roomState.name === k;
    const row = document.createElement("button");
    row.className = "mapline" + (unlocked ? "" : " locked") + (here ? " here" : "");
    row.innerHTML =
      '<span class="mp-name">' + a.name + '</span>' +
      '<span class="mp-tag">' + (here ? "你在这儿" : unlocked ? "可传送" : "未点亮 · " + a.cost + " 金") + '</span>';
    row.disabled = !unlocked || here;
    row.addEventListener("click", () => {
      closeWorldMap();
      travelTo(a.map, { tx: a.tx, tz: a.tz + 2, heading: 0 });
    });
    list.appendChild(row);
  }
  const hint = $("#mapGold");
  if (hint) hint.textContent = "💰 " + Farm.gold;
  const cl = $("#courierLine");
  if (cl) {
    const c = activeCourier();
    if (!c) cl.textContent = "驿站今日委托还没接 · 去奶家镇驿站院子的委托榜看看";
    else if (c.done) cl.textContent = "今日驿务已交差 ✅ 明早再来";
    else cl.textContent = "今日驿务：「" + c.title + "」· " + c.got + "/" + c.need +
      (c.got >= c.need ? " · 回驿站交差领钱" : " · " + (c.map && MAPS[c.map] ? MAPS[c.map].name : "野外"));
  }
  const tl = $("#troupeLine");
  if (tl) tl.textContent = troupeProgressText();
  $("#worldmap").classList.add("show");
  // 面板 show 之后 canvas 才有实际尺寸，下一帧再量、再画
  requestAnimationFrame(() => { if (worldCanvas && worldCanvas.clientWidth) macroFit(); });
}
function closeWorldMap() {
  const el = $("#worldmap");
  if (el) el.classList.remove("show");
}

function interact() {
  const a = aimCell();
  const npc = npcNear(2.2);

  // ⓪ 肥嘟嘟掉的口袋：站在旁边按 E 就捡
  if (tryPouch()) return;

  // ⓪½ 竹林里的竹笋：每天长几根，站边上按 E 掰走换钱
  if (tryShoot()) return;

  // ⓪¾ 镇内任务：散在镇上的戏家伙，站边上按 E 捡
  if (tryTroupeProp()) return;

  // ① 格子上的标记：门、床、柜台、公告板、灶台……
  if (a && a.mark) {
    const mk = a.mark;
    if (mk.kind === "door") { enterRoom(mk.to); return; }
    if (mk.kind === "exit") { leaveRoom(); return; }
    if (mk.kind === "gate") { travelTo(mk.to, mk.spawn); return; }
    if (mk.kind === "anchor") { useAnchor(mk.id); return; }
    if (mk.kind === "fish") { startFishing(); return; }
    if (mk.kind === "stage") { startStage(); return; }
    if (mk.kind === "courier") { courierBoard(); return; }
    if (mk.kind === "sign") { say("告示", [mk.text]); return; }
    if (mk.kind === "shop") { Farm.openShop(); return; }
    if (mk.kind === "sleep") { Farm.sleepPrompt(); return; }
    if (mk.kind === "well") { fillWater(); return; }
    if (mk.kind === "cook") { cookSoup(); return; }
    if (mk.kind === "read") { readArchive(); return; }
    if (mk.kind === "rest") { restSpot(); return; }
    if (mk.kind === "bounty") { bountyMenu(); return; }
    if (mk.kind === "board") { boardMenu(); return; }
  }

  // ② 面前站着人，先跟人说话（在田里则优先动土）
  if (npc && !(a && a.plot)) { talk(npc); return; }
  if (npc && Math.hypot(player.x - npc.x, player.z - npc.z) < 1.1) { talk(npc); return; }

  // ③ 水
  if (a && a.type === TI.WATER) { fillWater(); return; }

  // ④ 田
  if (a && a.plot) { Farm.useTarget(); return; }

  // ⑤ 什么都没对上，给一句说得清的提示
  if (a && a.type === TI.WEED) { toast("这是围栏外的野草，走进地里才锄得动"); return; }
  if (inPlot(player.x, player.z)) { Farm.hint(); return; }
  toast("这格没什么可动的。水边打水、门口进屋，看见人就过去按 E");
}

/* ---- 跟村民说话 ---- */
function talk(n) {
  const def = n.def;
  state.met[def.id] = true;
  state.metNpc = true;
  // 图鉴：第一次跟这位角色说话就亮卡
  if (def.char && !state.metChar[def.char]) unlockDexChar(def.char);
  // 每天第一次跟某个人说话，算一次「走访」
  state.visitOn = state.visitOn || {};
  if (state.visitOn[def.id] !== Farm.day) {
    state.visitOn[def.id] = Farm.day;
    questProgress("visit");
  }
  // 镇内任务：请帖顺手就递了（班主自己不算收信人）
  troupeInvite(def.id);
  save();

  // 棋爷有自己的流程：先被你叫板，再骗你下一盘
  if (def.id === "qiyet") { qiyetTalk(n); return; }

  const choices = [{ label: def.actLabel || "聊两句", onPick: () => runAct(def, n) }];
  choices.push({ label: "先这样", onPick: null });
  say(def.name, def.greet, null, choices);
  save();
}

/* ---- 公园那盘「围棋」 ---- */
function qiyetTalk() {
  // 你主动叫板。老头子一句都没回 —— 他忙着偷鸡。
  say("奶龙", [
    "哟，爷，您这是在下围棋呢？",
    "来来来，我跟您比划比划，我小时候可背过定式。"
  ], () => {
    say("棋爷", [
      "（他没抬头，也没说这盘算是什么棋。）",
      "（只把装着黑子的陶罐往你手边推了推，自己捻起一颗白子，等着。）"
    ], () => openQiyetBoard(), null, "normal", "棋爷");
  }, null, "happy", "棋爷");
}

function openQiyetBoard() {
  // 坐下来：人挪到石桌南边，面朝棋爷
  const seat = { x: 14.5, z: 8.56 };
  player.x = seat.x; player.z = seat.z;
  player.heading = Math.PI;
  playerObj.position.set(seat.x, 0, seat.z);
  player.moving = false;
  updateCamera();

  Gomoku.open({
    sfx: n => sfx(n),
    onEnd: result => {
      if (result === "player") qiyetLose();
      else if (result === "ai") qiyetWin();
      else qiyetQuit(result);
    }
  });
}

// 大爷赢了：哈哈大笑，笑你太年轻
function qiyetWin() {
  say("棋爷", [
    "（老头子把扇子一合，胡子都笑翘起来了。）",
    "哈哈哈哈哈 —— 小伙子，你还是太年轻。",
    "（他伸手把盘上的白子一颗一颗收进罐里，五颗一排，摆得整整齐齐。）"
  ], () => {
    say("奶龙", ["……爷，您这下的不是围棋吧？"], () => {
      say("棋爷", [
        "我什么时候说过这是围棋？",
        "（他翻过桌角那块小木牌，背面写着三个字：五子棋。）",
        "下回还来啊，我这儿天天有人。"
      ], null, null, "happy", "棋爷");
    }, null, "worry", "棋爷");
  }, null, "happy", "棋爷");
}

// 大爷输了：掀桌子
function qiyetLose() {
  const first = !state.beatQiyet;
  state.beatQiyet = true;
  say("棋爷", [
    "……",
    "（他盯着盘面看了很久，忽然一巴掌拍在石桌沿上。）"
  ], () => {
    shake(.9, .5);
    setTimeout(() => shake(.45, .4), 170);
    sfx("ko");
    say("棋爷", [
      "不下了不下了！这桌子腿不平！",
      "（石桌晃了两下，两颗棋子滚进草里去了。他背着手走得飞快。）"
    ], null, null, "angry", "棋爷");
    if (first) {
      grantExp(14);
      toast("赢了棋爷 · 阅历 +14");
    }
  }, null, "normal", "棋爷");
}

function qiyetQuit(result) {
  say("棋爷", [
    result === "quit" ? "（他抬了下眼皮，把子收回罐里。）" : "（两个人都没地儿下了，他把棋盘一推。）",
    result === "quit" ? "不下了？行。明天我还在这儿。" : "这盘算和。你比我年轻时候稳。"
  ], null, null, "normal", "棋爷");
}

/* =========================================================
   嵌入小游戏 ①：竹林水塘钓鱼
   鱼影左右游，进绿区按 E / 空格 / 点按钮收竿。一天 8 竿，
   钓到的鱼当场折成钱，凑够 3 条再送一个球。
   ========================================================= */
const FISH_RODS = 8;
const fishing = { on: false, raf: 0, last: 0, pos: 0, dir: 1, speed: 34,
                  zoneA: 41, zoneB: 59, rods: 0, caught: 0 };

function fishUI() {
  const zone = $("#fishZone"), bob = $("#fishBob");
  if (!zone || !bob) return;
  zone.style.left = fishing.zoneA + "%";
  zone.style.width = (fishing.zoneB - fishing.zoneA) + "%";
  zone.style.transform = "none";
  bob.style.left = fishing.pos + "%";
  $("#fishStat").innerHTML = "钓到 <b>" + fishing.caught + "</b> 条 · 还剩 <b>" +
    (FISH_RODS - fishing.rods) + "</b> 竿";
  $("#fishGold").textContent = "💰 " + Farm.gold;
}

function fishTick(ts) {
  if (!fishing.on) return;
  const dt = Math.min(60, ts - (fishing.last || ts));
  fishing.last = ts;
  fishing.pos += fishing.dir * fishing.speed * dt / 1000;
  if (fishing.pos >= 100) { fishing.pos = 100; fishing.dir = -1; }
  if (fishing.pos <= 0) { fishing.pos = 0; fishing.dir = 1; }
  fishUI();
  fishing.raf = requestAnimationFrame(fishTick);
}

function startFishing() {
  if (fishing.on) return;
  if (state.fishDay !== Farm.day) { state.fishDay = Farm.day; state.fishRods = 0; }
  if (state.fishRods >= FISH_RODS) {
    say("水塘边", ["岸边坐着个老钓翁的旧蒲团，竿架还搁在那儿。", "今天钓得够多了，手都酸了 —— 明天再来吧。"], null, null, "normal", "capybara");
    return;
  }
  fishing.on = true;
  fishing.rods = state.fishRods;
  fishing.caught = 0;
  fishing.pos = 0; fishing.dir = 1;
  fishing.speed = 30 + Math.random() * 12;
  const width = 16 + Math.random() * 8;
  fishing.zoneA = 20 + Math.random() * (60 - width);
  fishing.zoneB = fishing.zoneA + width;
  fishing.last = 0;
  $("#fishing").classList.add("show");
  fishUI();
  fishing.raf = requestAnimationFrame(fishTick);
  blip(620, .12, "sine", .035);
  blip(880, .16, "sine", .02);
}

function reelFish() {
  if (!fishing.on) return;
  const hit = fishing.pos >= fishing.zoneA && fishing.pos <= fishing.zoneB;
  fishing.rods++;
  state.fishRods = fishing.rods;
  if (hit) {
    fishing.caught++;
    Farm.gold += 12;
    courierProgress("fish", "grove");
    sfx("coin");
    blip(920, .12, "sine", .05);
    toast("钓上一条！+12 金");
    // 下一条更快、绿区挪个地方
    fishing.speed = Math.min(62, fishing.speed + 5);
    const width = 16 + Math.random() * 8;
    fishing.zoneA = 20 + Math.random() * (60 - width);
    fishing.zoneB = fishing.zoneA + width;
  } else {
    sfx("deny");
    toast("跑了 —— 早了或晚了，鱼都没进嘴");
  }
  fishUI();
  save();
  if (fishing.rods >= FISH_RODS) {
    const bonus = fishing.caught >= 3;
    if (bonus) { state.balls += 1; toast("今天钓了 " + fishing.caught + " 条 · 送一个捕捉球"); }
    else toast("今天收竿 · 钓到 " + fishing.caught + " 条");
    hudTick(); save();
    setTimeout(closeFishing, 900);
  }
}

function closeFishing() {
  if (!fishing.on) return;
  fishing.on = false;
  cancelAnimationFrame(fishing.raf);
  $("#fishing").classList.remove("show");
}

/* =========================================================
   嵌入小游戏 ②：奶家镇戏台唱一段
   八拍锣鼓，拍子走到亮点按 E / 空格 / 点按钮。唱满五拍有赏。
   ========================================================= */
const STAGE_BEATS = 8;
const stageGame = { on: false, timer: 0, beat: -1, t0: 0, marks: [], hits: 0 };

function stageUI(judge, tone) {
  const box = $("#stageBeats");
  if (box) {
    [...box.children].forEach((el, i) => {
      el.className = "";
      if (stageGame.marks[i] === "hit") el.className = "hit";
      else if (stageGame.marks[i] === "miss") el.className = "miss";
      else if (i === stageGame.beat && tone !== "done") el.className = "next";
    });
  }
  const j = $("#stageJudge");
  if (j && judge) { j.textContent = judge; j.className = "stage-judge " + (tone || ""); }
  $("#stageGold").textContent = "💰 " + Farm.gold;
}

function startStage(encore = false) {
  if (stageGame.on) return;
  if (!encore && state.stageDay === Farm.day) {
    say("戏台", ["今天这一段唱完了，台下的人也散了。", "明天这个时辰，班子还来。"], null, null, "normal", "xiaoqi");
    return;
  }
  stageGame.on = true;
  stageGame.beat = -1;
  stageGame.t0 = performance.now() + 700;   // 先敲一声锣，才起拍
  stageGame.marks = new Array(STAGE_BEATS).fill("");
  stageGame.hits = 0;
  const box = $("#stageBeats");
  box.innerHTML = "";
  for (let i = 0; i < STAGE_BEATS; i++) box.appendChild(document.createElement("i"));
  stageUI("锣鼓响了 —— 跟着拍子！", "");
  $("#stage").classList.add("show");
  blip(180, .22, "triangle", .05);
  stageGame.timer = setInterval(() => {
    if (!stageGame.on) return;
    const t = performance.now() - stageGame.t0;
    const b = Math.floor(t / 620);
    if (b >= STAGE_BEATS) { endStage(); return; }
    if (b !== stageGame.beat) {
      // 上一拍没赶上的，直接判丢
      if (stageGame.beat >= 0 && !stageGame.marks[stageGame.beat]) stageGame.marks[stageGame.beat] = "miss";
      stageGame.beat = b;
      blip(340 + b * 18, .06, "triangle", .025);
    }
    stageUI("", "");
  }, 50);
}

function hitStage() {
  if (!stageGame.on || stageGame.beat < 0) return;
  const i = stageGame.beat;
  if (stageGame.marks[i]) return;
  const into = performance.now() - stageGame.t0 - i * 620;
  // 亮点在前四成：220~420ms 之间最准
  const good = into >= 180 && into <= 440;
  stageGame.marks[i] = good ? "hit" : "miss";
  if (good) {
    stageGame.hits++;
    blip(760 + i * 24, .09, "sine", .035);
    stageUI("好！", "good");
  } else {
    sfx("deny");
    stageUI("乱了板眼", "bad");
  }
  stageUI("", "");
}

function endStage() {
  if (!stageGame.on) return;
  stageGame.on = false;
  clearInterval(stageGame.timer);
  const good = stageGame.hits >= 5;
  const pay = good ? 50 + stageGame.hits * 6 : 20;
  Farm.gold += pay;
  state.stageDay = Farm.day;
  if (good) grantExp(10);
  Farm.paint(); hudTick(); save();
  stageUI(good
    ? "满堂彩！赏钱 +" + pay + " 金 · 阅历 +10"
    : "唱得磕磕绊绊……台下赏了 " + pay + " 金", good ? "good" : "bad");
  sfx("coin");
  setTimeout(closeStage, 1400);
}

function closeStage() {
  if (!stageGame.on && !$("#stage").classList.contains("show")) return;
  stageGame.on = false;
  clearInterval(stageGame.timer);
  $("#stage").classList.remove("show");
}

/* ---- 村民能给你的东西 ---- */
function runAct(def, n) {
  switch (def.act) {
    case "troupe":
      closeDialog();
      troupeBoard();
      break;

    case "shop":
      Farm.openShop();
      break;

    case "seeds": {
      if (!state.gifts[def.id]) {
        state.gifts[def.id] = 1;
        Farm.seeds.radish = (Farm.seeds.radish || 0) + 3;
        Farm.paint();
        sfx("plant");
        say(def.name, [
          "给你三包萝卜种，我留着也没用。",
          "锄头 → 种子 → 水壶。别忘了浇水，不浇水它一天都不长。"
        ], () => toast("得到萝卜种子 ×3"), null, "happy");
      } else {
        say(def.name, ["种子就那么多，先用着。", "地翻开了就撒，别攒着。"]);
      }
      break;
    }

    case "balls": {
      if (!state.gifts[def.id]) {
        state.gifts[def.id] = 1;
        state.balls += 2;
        hudTick();
        sfx("coin");
        say(def.name, [
          "喏，两个球。齁齁齁，别说是我给的。",
          "打到它站不稳再扔，血多的时候扔是白扔。"
        ], () => toast("捕捉球 +2"), null, "happy");
      } else {
        say(def.name, ["球都给完了。", "草在北边那片林子里，走进去就会撞见。"]);
      }
      break;
    }

    case "soak": {
      if (!onceToday(def.id)) {
        say(def.name, ["（它已经闭眼了，好像睡着了）", "……（今天已经陪过一次了，明天再来）"]);
        break;
      }
      Farm.stamina = Math.min(Farm.maxStamina, Farm.stamina + 26);
      Farm.time = Math.min(1560, Farm.time + 40);
      Farm.paint();
      sfx("water");
      say(def.name, [
        "……（你也坐下了。水面一动不动。）",
        "风从背后过去，草叶弯腰又直起来。四十分钟就这么没了，但你不亏。"
      ], () => toast("体力 +26 · 时间过去 40 分钟"), null, "happy");
      break;
    }

    case "fight": {
      say(def.name, ["那我可不留情了。", "站好 ——"], () => startEncounter("meadow", "niulai"), null, "angry");
      break;
    }

    // 竹林钓叟：借他的竿，直接开钓鱼小游戏
    case "fish": {
      if (Fight.on) break;
      closeDialog();
      startFishing();
      break;
    }

    // 坡上的牛来：在这儿开一场野战，zone 用 hill
    case "hillfight": {
      if (Fight.on) break;
      say(def.name, ["别看你个头小，这坡上的野的可不客气。", "来，我看看你有多少斤两。"],
        () => startEncounter("hill", "niulai"), null, "angry");
      break;
    }

    case "heal": {
      const hurt = state.hp < state.maxHp * .98;
      if (!hurt) {
        say(def.name, ["没伤，精神也不错。", "去忙你的吧，我接着转。"], null, null, "happy");
        break;
      }
      if (!onceToday(def.id)) {
        say(def.name, ["今天包扎过一次了。", "再伤着我可不管，回去睡觉。"]);
        break;
      }
      state.hp = state.maxHp;
      hudTick();
      sfx("coin");
      say(def.name, [
        "过来，我看一眼。（他从口袋里摸出一卷绷带）",
        "行了，血止住了。别仗着有人兜底就往草里冲。"
      ], () => toast("伤好了 · HP 全满"), null, "happy");
      break;
    }

    case "arena": {
      if (Fight.on) break;
      say(def.name, [
        "规矩很简单：站上去，把我打趴下。",
        "输赢都不记仇，钱是真给。"
      ], () => {
        arenaPending = true;
        startEncounter("meadow", "baobaolong");
      }, null, "angry");
      break;
    }

    case "pouch": {
      if (pouchQuest.active && pouchQuest.got >= 3) {
        pouchQuest.active = false;
        state.pouchDay = Farm.day;
        state.pouches++;
        Farm.gold += 60;
        state.balls += 1;
        grantExp(10);
        Farm.paint(); hudTick(); save();
        sfx("coin");
        say(def.name, [
          "（它把三只口袋一只一只塞回肚皮，拍了拍）",
          "钱不多，是我攒的。球也给你一个 —— 你比我用得着。"
        ], () => toast("口袋全找回来了 · +60 金 · 捕捉球 +1"), null, "happy");
        break;
      }
      if (pouchQuest.active) {
        say(def.name, [
          "还有 " + (3 - pouchQuest.got) + " 只在外头。",
          "戏台边上、驿站院子里、南街尽头 —— 我是一路走一路掉的。"
        ]);
        break;
      }
      if (state.pouchDay === Farm.day) {
        say(def.name, ["今天找回来的那些，我收好了。", "明天……明天它还会漏。"], null, null, "happy");
        break;
      }
      say(def.name, [
        "你帮我找找？我不乱跑，就在这儿等你。",
        "三只，都装着路上捡的碎东西，不值钱，但我不想丢。"
      ], () => startPouchQuest(), null, "worry");
      break;
    }

    default:
      say(def.name, def.greet);
  }
}

/* =========================================================
   遭遇 → 拳皇式对战
   ========================================================= */
function pickFromTable(table) {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of table) { r -= w; if (r <= 0) return k; }
  return table[0][0];
}

async function startEncounter(zoneKey, forceKey) {
  if (Fight.on || encounterLock) return;
  encounterLock = true;
  const zone = ZONES[zoneKey] || ZONES.meadow;
  const enemyKey = forceKey || pickFromTable(zone.table);
  const enemyLv = forceKey
    ? clamp(state.lv + 1, 3, 12)
    : clamp(state.lv + Math.round(rnd(-1, 1.4)), 2, 12);

  $("#hud").classList.add("hidden");
  document.body.classList.add("infight");
  blip(300, .18, "sawtooth", .05);

  try {
    await Fight.start({
      actorFor: getActor,
      enemyKey,
      enemyName: (forceKey === "niulai" ? "" : "野生的") + CAST[enemyKey].name,
      enemyLv,
      enemyMaxHp: Math.round(34 + enemyLv * 9),
      enemyAtk: 20 + enemyLv * 4,
      hp: Math.max(1, Math.round(state.hp)),
      maxHp: state.maxHp,
      lv: state.lv,
      atk: state.atk,
      balls: state.balls,
      sfx,
      onEnd: onBattleEnd
    });
  } catch (err) {
    console.error(err);
    endBattleUi();
  }
}

function onBattleEnd(res) {
  endBattleUi();
  encounterLock = false;
  if (!res) return;
  // 擂台标记只对「刚打完的这一场」有效，别带到下一场野怪
  const wasArena = arenaPending;
  arenaPending = false;

  state.balls -= res.ballUsed;
  state.hp = res.playerHp;
  if (res.win || res.captured) courierProgress("battle", roomState.name);

  if (res.captured) {
    state.captured[res.enemyKey] = true;
    state.balls = state.balls;
    blip(880, .2, "sine", .05);
    toast("收服了 " + CAST[res.enemyKey].name + "！");
    buildDex();
    grantExp(12);
    questProgress("capture");
  } else if (res.win) {
    grantExp(8 + Math.round(res.enemyMaxHp * .18));
    toast("打赢了，捡回一点经验");
    if (wasArena) {
      state.arenaWins = (state.arenaWins || 0) + 1;
      const prize = state.arenaWins === 1 ? 120 : 40;
      Farm.gold += prize;
      Farm.paint(); hudTick();
      setTimeout(() => toast("守擂赢了一场 · +" + prize + " 金"), 700);
      if (state.arenaWins === 3) setTimeout(() => toast("三连胜，暴暴龙认了"), 1600);
    }
  } else {
    state.hp = Math.max(1, Math.round(state.maxHp * .35));
    // 被打趴的人一律送回村里，别把人留在镇上却看不见村子的场景
    if (roomState.name !== "village") {
      travelTo("village", { x: SPAWN.x, z: SPAWN.z, heading: Math.PI });
    } else {
      player.x = SPAWN.x; player.z = SPAWN.z;
      playerObj.position.set(player.x, 0, player.z);
    }
    // 在擂台上输了：人被送回村口，这也算一场结束
    toast(wasArena ? "被打下擂台，暴暴龙让人把你抬回了村口" : "被抬回了村口");
  }

  battleGrace = 1.6;
  grassDist = 0;
  save();
  hudTick();
  encounterLock = false;
}

function endBattleUi() {
  $("#hud").classList.remove("hidden");
  document.body.classList.remove("infight");
  syncPad();
}

function grantExp(n) {
  state.exp += n;
  while (state.exp >= expNeed(state.lv)) {
    state.exp -= expNeed(state.lv);
    state.lv++;
    state.maxHp += 8; state.atk += 3;
    state.hp = state.maxHp;
    toast("升级！Lv." + state.lv + "　体力上限 +8");
    blip(760, .2, "sine", .05);
    setTimeout(() => blip(980, .2, "sine", .05), 120);
  }
}

/* =========================================================
   村民图鉴：见过面或用球收服就亮卡，集齐有奖
   ========================================================= */
const DEX_ORDER = ["nailong", "naiwa", "niulai", "baobaolong", "capybara", "xiaoqi", "naidan", "feidudu"];
const DEX_TIERS = [
  { need: 3, gold: 60, balls: 0, title: "", label: "认识三位伙伴" },
  { need: 5, gold: 0, balls: 3, title: "", label: "半个村子都熟" },
  { need: 8, gold: 180, balls: 5, title: "奶家村之友", label: "全员到齐" }
];

function dexGot(k) {
  return k === "nailong" || k === "xiaoqi" || !!state.metChar[k] || !!state.captured[k];
}
function dexCount() {
  return DEX_ORDER.reduce((n, k) => n + (dexGot(k) ? 1 : 0), 0);
}

function unlockDexChar(k) {
  if (!k || !CAST[k] || state.metChar[k]) return;
  state.metChar[k] = true;
  const n = dexCount();
  save();
  toast("图鉴解锁 · " + CAST[k].name + "（" + n + "/" + DEX_ORDER.length + "）");
  const next = DEX_TIERS.findIndex((t, i) => n >= t.need && !state.dexRewards.includes(i));
  if (next >= 0) setTimeout(() => toast("图鉴奖励可领了 · 打开图鉴领取"), 950);
}

function claimDexTier(i) {
  const t = DEX_TIERS[i], n = dexCount();
  if (!t || n < t.need || state.dexRewards.includes(i)) return;
  state.dexRewards.push(i);
  if (t.gold) Farm.gold += t.gold;
  if (t.balls) state.balls += t.balls;
  if (t.title) state.dexTitle = t.title;
  grantExp(20 + i * 15);
  Farm.paint(); hudTick(); save();
  sfx("coin");
  buildDex();
  toast("图鉴奖励到手 · " + t.label);
}

function buildDex() {
  const grid = $("#dexGrid");
  grid.innerHTML = DEX_ORDER.map(k => {
    const c = CAST[k];
    const got = dexGot(k);
    const how = k === "nailong" ? "你本人" : k === "xiaoqi" ? "村口等你" :
      (state.captured[k] ? "已收服" : state.metChar[k] ? "已认识" : "还没遇到过。");
    return `<div class="dexcard ${got ? "" : "locked"}">
      ${c.model ? '<span class="tag model">3D</span>' : ""}
      <div class="ph"><img src="${c.img}" alt="${c.name}" loading="lazy"></div>
      <div class="dn">${got ? c.name : "？？？"}</div>
      <div class="de">${got ? how : "未解锁"}</div>
      <div class="dd">${got ? c.desc : "走近跟它说句话，或者在草丛里收服它。"}</div>
    </div>`;
  }).join("");

  const n = dexCount();
  const label = $("#dexTitle");
  if (label) label.textContent = state.dexTitle ? "🏅 " + state.dexTitle : "";
  const box = $("#dexRewards");
  if (box) {
    box.innerHTML = "<h3>收集奖励 <span>· 已认识 " + n + "/" + DEX_ORDER.length + "</span></h3>" +
      DEX_TIERS.map((t, i) => {
        const claimed = state.dexRewards.includes(i);
        const ready = n >= t.need;
        const prize = [t.gold ? t.gold + " 金" : "", t.balls ? t.balls + " 球" : "",
          t.title ? "称号「" + t.title + "」" : ""].filter(Boolean).join(" · ");
        return `<div class="dex-tier">
          <div><b>${t.label}</b><br><span>${t.need} 位 · ${prize}</span></div>
          <button class="btn ${ready && !claimed ? "" : "dark"}" data-tier="${i}"
            ${ready && !claimed ? "" : "disabled"}>${claimed ? "已领" : ready ? "领取" : "还差 " + (t.need - n)}</button>
        </div>`;
      }).join("");
    box.querySelectorAll("button[data-tier]").forEach(b => {
      b.onclick = () => claimDexTier(Number(b.dataset.tier));
    });
  }
}

/* =========================================================
   其它 UI
   ========================================================= */
function toggleSound() {
  state.muted = !state.muted;
  $("#btnSound").textContent = state.muted ? "🔇" : "🔊";
  if (!state.muted) blip(620, .08, "sine", .04);
  save();
}

$("#btnDex").onclick = () => { buildDex(); $("#dex").classList.add("show"); };
/* ---- 2D / 3D 视角切换：同一张地图、同一份存档，只是镜头表现不同 ----
   3D = 第三人称透视跟拍（开放世界）；2D = 正交俯视（房间式的平面感）。
   切的时候人原地不动，位置 / 进度都保留。 */
function syncViewBtn() {
  const b = $("#btnView");
  if (b) b.textContent = state.viewMode === "3d" ? "🌐 3D" : "🗺 2D";
  const f = $("#btnFollow");
  if (f) f.textContent = state.camFollow ? "🎥 跟随" : "🎥 手动";
}
function setViewMode(mode, quiet) {
  if (mode !== "3d" && mode !== "2d") return;
  if (state.viewMode === mode) return;
  state.viewMode = mode;
  moveSig = -1;
  resize();
  updateCamera(true);
  syncViewBtn();
  if (!quiet) toast(mode === "3d" ? "已切到 3D 开放世界视角" : "已切到 2D 俯视视角 · 按 V 切回");
  save();
}
function toggleFollow() {
  state.camFollow = !state.camFollow;
  moveSig = -1;
  syncViewBtn();
  toast(state.camFollow ? "镜头自动跟随：开" : "镜头自动跟随：关（Z/C 手动转）");
  save();
}
$("#btnView").onclick = () => setViewMode(state.viewMode === "3d" ? "2d" : "3d");
$("#btnFollow").onclick = toggleFollow;
syncViewBtn();

$("#btnStyle").onclick = () => {
  styleIdx = (styleIdx + 1) % STYLES.length;
  applyStyle();
  const s = STYLES[styleIdx];
  $("#btnStyle").textContent = "🎨 " + s.name;
  toast("画面风格：" + s.name);
};
// 按钮上显示当前风格名
$("#btnStyle").textContent = "🎨 " + STYLES[styleIdx].name;
$("#btnHelp").onclick = () => $("#help").classList.add("show");
if ($("#btnMap")) $("#btnMap").onclick = () => openWorldMap();
if ($("#btnMapClose")) $("#btnMapClose").onclick = closeWorldMap;
if ($("#mapZoomIn")) $("#mapZoomIn").onclick = () => zoomMap(1.25);
if ($("#mapZoomOut")) $("#mapZoomOut").onclick = () => zoomMap(1 / 1.25);
if ($("#mapZoomReset")) $("#mapZoomReset").onclick = resetMapView;
$("#btnDexClose").onclick = () => $("#dex").classList.remove("show");
if ($("#btnReel")) $("#btnReel").onclick = reelFish;
if ($("#btnFishClose")) $("#btnFishClose").onclick = closeFishing;
if ($("#btnStageHit")) $("#btnStageHit").onclick = hitStage;
if ($("#btnStageClose")) $("#btnStageClose").onclick = closeStage;
$("#btnHelpClose").onclick = () => $("#help").classList.remove("show");
$("#btnShopClose").onclick = () => { $("#shop").classList.remove("show"); save(); };
$("#btnSound").onclick = toggleSound;
$("#dex").addEventListener("click", e => { if (e.target.id === "dex") $("#dex").classList.remove("show"); });
$("#help").addEventListener("click", e => { if (e.target.id === "help") $("#help").classList.remove("show"); });
$("#shop").addEventListener("click", e => { if (e.target.id === "shop") { $("#shop").classList.remove("show"); save(); } });
$("#kResultBtn").onclick = () => Fight.finish();

/* =========================================================
   主循环
   ========================================================= */
const clock = new T.Clock();
let radarAcc = 0;      // 小地图重绘节流：24fps 足够，省下每帧一次大 canvas drawImage
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(.05, clock.getDelta());
  if (Fight.on || $("#kof").classList.contains("show")) {
    Fight.update(dt);
    Fight.render(renderer);
    return;
  }
  update(dt);
  animateAnchors(dt);
  radarAcc += dt;
  if (state.started && radarAcc >= 1 / 24) { radarAcc = 0; drawRadar(); }
  renderer.render(scene, currentCam());
}

/* =========================================================
   启动
   ========================================================= */
resize();
window.addEventListener("resize", () => {
  resize(); syncPad();
  if ($("#worldmap").classList.contains("show") && worldCanvas && worldCanvas.clientWidth) macroFit();
});

// 星露谷里天黑要真的黑下来。地面是不受光材质，所以直接调曝光 + 天空色
let lastLightO = null;
function setLight(o) {
  lastLightO = o;
  renderer.toneMappingExposure = o.exposure * (STYLE_STATE.exp || 1);
  if (o.groundColor) for (const m of groundMats) m.color.copy(o.groundColor);
  // 国风背景是纹理，别用纯色覆盖它；其它风格照旧跟天空色走
  if (!isGuofeng() && scene.background && scene.background.isColor) scene.background.copy(o.sky);
  // 天穹整体乘上当前天空色，昼夜才有交界
  if (skyDome && skyDome.visible) skyDome.material.color.copy(o.sky);
  const dark = 1 - Math.min(1, o.sunI / 1.2);   // 0=白天, 1=夜
  // 国风：水墨远山背景跟着夜色一起暗下去，不再出现「天亮着地却黑了」
  if ("backgroundIntensity" in scene) scene.backgroundIntensity = isGuofeng() ? 1 - dark * .82 : 1;
  // 雾色：国风白天宣纸青、夜里淡墨；其它风格跟天空走，夜里才不会远处发光
  if (scene.fog && scene.fog.color) {
    if (isGuofeng()) scene.fog.color.copy(GUOFENG.ink).lerp(GUOFENG.fog, 1 - dark);
    else scene.fog.color.copy(o.sky);
  }
  sun.color.copy(o.sunColor);
  if (isGuofeng()) sun.color.lerp(GUOFENG.sun, .35); // 国风的太阳更暖更柔
  sun.intensity = o.sunI;
  hemi.intensity = o.hemiI;
  // 天黑点灯
  for (const g of lampGlasses) g.emissive.setRGB(1 * dark, .8 * dark, .42 * dark);
}

let booted = false;

async function boot() {
  try {
    buildGround();
    buildProps();
    buildTown();
    buildGrove();
    buildHill();
    buildFar();
    // 四张户外图搭完就一起亮出来：一进游戏就是一整片连着的大地
    setOutdoorVisible("village");
    // 村庄 / 镇也撒少量立体草丛，近景不再是纯平贴图
    buildGrassTufts(VILLAGE, world, 520, 5011);
    if (OUTDOOR.town) buildGrassTufts(TOWN, OUTDOOR.town, 360, 6011);
    buildTroupeProps();
    troupeResetIfNewDay();
    batchOutdoors();   // 静态摆件统一合批：四图同时可见也不涨 draw call
    applyStyle();   // 场景搭好后统一套用主题（国风染色 / 飞檐 / 背景）
  } catch (e) { console.error("[game] 场景搭建出错", e); }

  Farm.init({
    world, player, light: setLight, say, toast, sfx, save,
    aimCell,
    lieDown, getUp, dim,
    onHarvest(k) { questProgress("harvest"); },
    onSleep() { state.hp = state.maxHp; hudTick(); }
  });

  // 先把主循环跑起来：模型没到位也有画面，不会白屏干等
  loop();

  try {
    const actor = await getActor("nailong");
    if (actor) {
      actor.position.set(0, 0, 0);
      playerObj.add(actor);
      playerObj.userData.isBillboard = !!actor.userData.isBillboard;
    }
  } catch (e) { console.warn("[game] 主角模型加载失败", e); }
  player.ready = true;
  booted = true;

  // 村里的原住民：一个一个慢慢出场，谁没加载出来就不出场
  spawnVillageNpcs().catch(e => console.warn("[game] 村民出不来", e));

  // 标题镜头：站到广场边上，镜头照着主角
  player.x = 0; player.z = 9;
  playerObj.position.set(player.x, terrainY(player.x, player.z), player.z);
  playerObj.rotation.y = 0;
  updateCamera();
  {
    const a = window.innerWidth / window.innerHeight;
    const th = 10.5, tw = Math.max(th * a, 8);
    camera.left = -tw / 2; camera.right = tw / 2;
    camera.top = th / 2; camera.bottom = -th / 2;
    camera.updateProjectionMatrix();
  }

  const has = load();
  Farm.rebuild();
  // 读档之后才知道哪些锚点点亮过，晶体颜色要重新刷一遍
  syncAnchorLook();
  if (has) {
    $("#btnContinue").style.display = "";
    $("#btnContinue").dataset.has = "1";
    $("#btnStart").textContent = "重新开始";
    $("#btnSound").textContent = state.muted ? "🔇" : "🔊";
  }
  buildDex();
  hudTick();
}

$("#btnStart").onclick = () => startGame(!$("#btnContinue").dataset.has);
$("#btnContinue").onclick = () => startGame(false);

function startGame(fresh) {
  if (fresh) {
    Object.assign(state, {
      lv: 3, exp: 0, maxHp: 62, hp: 62, atk: 28,
      balls: 8, captured: {}, metNpc: false, steps: 0,
      // 重开就是全新的一天：锚点、口袋、擂台、小游戏的每日计数都得归零，
      // 不然同一个浏览器里「重新开始」会带着上一档的进度进新档
      anchors: {}, pouchDay: 0, pouches: 0, arenaWins: 0,
      fishDay: 0, fishRods: 0, stageDay: 0, courier: null,
      metChar: {}, dexRewards: [], dexTitle: "",
      troupe: { day: 0, stage: 0, gotList: [], invited: [] },
      dayFlags: {}, gifts: {}, met: {}, beatQiyet: false
    });
    player.x = SPAWN.x; player.z = SPAWN.z;
    player.jumping = false; player.jumpY = 0; player.vy = 0;
    Farm.reset();
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  }
  // 兜底：万一站在建筑里，往外挪一点
  if (blocked(player.x, player.z)) {
    outer:
    for (let r = 1; r <= 12; r++) {
      for (let a = 0; a < 12; a++) {
        const nx = player.x + Math.cos(a / 12 * 6.283) * r;
        const nz = player.z + Math.sin(a / 12 * 6.283) * r;
        if (!blocked(nx, nz)) { player.x = nx; player.z = nz; break outer; }
      }
    }
  }
  $("#title").classList.remove("show");
  closeDialog();
  state.started = true;
  $("#hud").classList.remove("hidden");
  syncPad();
  playerObj.position.set(visX(), terrainY(player.x, player.z), visZ());
  hudTick();
  Farm.paint();
  blip(660, .1, "sine", .04);
  updateCamera(true);
  // 开局不弹对话框——对话框一开就走不了路，会被当成卡死
  setTimeout(() => {
    toast(state.metNpc ? "第 " + Farm.day + " 天 · " + Farm.fmtTime() + "　屋后的地还等着你" : "WASD 走动 · 1–5 换工具 · E 使用。先去屋后那块空地");
  }, 420);
  save();
}

document.addEventListener("visibilitychange", () => { if (document.hidden && state.started) save(); });
window.addEventListener("beforeunload", () => { if (state.started) save(); });

if (location.search.indexOf("debug") >= 0) {
  window.__G = {
    state, player, playerObj, camera, scene, Fight, Farm, CROPS, PLOT,
    startGame, startEncounter, save, getActor, keys, dlg, say, advanceDialog,
    blocked, toast, interact, tileAhead, aimCell, enterRoom, leaveRoom, rooms, MAPS, cursor, scene,
    npcs, npcNear, talk, runAct, questProgress, bountyMenu,
    travelTo, openWorldMap, closeWorldMap, useAnchor, roomState, TOWN, VILLAGE, GROVE, HILL,
    ANCHORS, ANCHOR_STONES, startPouchQuest, pouchQuest, spawnTownNpcs, tryPouch,
    refreshShoots, tryShoot, shootQuest, patches, onBattleEnd,
    courierToday, activeCourier, courierProgress, courierBoard, claimCourier, COURIER_JOBS,
    DEX_ORDER, DEX_TIERS, dexCount, dexGot, unlockDexChar, claimDexTier, buildDex,
    troupeBoard, claimTroupe, tryTroupeProp, troupeInvite, activeTroupe, troupeResetIfNewDay,
    refreshTroupeProps, troupeProps, TROUPE_PROPS, TROUPE_INVITEES, troupeProgressText,
    spawnGroveNpcs, spawnHillNpcs, GROVE_NPCS, HILL_NPCS,
    fishing, stageGame, startFishing, reelFish, closeFishing,
    startStage, hitStage, endStage, closeStage,
    OUTDOOR, outdoorMats, position: () => ({ x: player.x, z: player.z, map: roomState.name }),
    tpYaw: () => TP.yaw, tpDist: () => TP.dist, camPos: () => camTP.position, camOrtho: () => camera, camTP: () => camTP,
    setViewMode, toggleFollow, syncViewBtn, topDown, currentCam,
    viewMode: () => state.viewMode, camFollow: () => state.camFollow,
    MACRO, macroFit, drawWorldMap, zoomMap, resetMapView, mapView,
    qiyetTalk, qiyetWin, qiyetLose, Gomoku, lieDown, getUp, sleepPose,
    modelDbg: () => ({
      loadedNailong: srcScenes.has("nailong") ? "3d" : (loaded.get("nailong") === null ? "billboard" : "unset"),
      billboards: [...billboardUsers.entries()].map(([k, s]) => k + ":" + s.size),
      lastErrs,
      retried: [...retried.entries()],
      packNailong: PACK.nailong ? PACK.nailong.file : null
    }),
    get MAP() { return MAP; }, get roomName() { return roomName; },
    markAt() { const g = tileAhead(); return g ? { tx: g.tx, tz: g.tz, type: g.type, mark: g.mark, plot: g.plot } : null; },
    tileAt: (x, z) => { const t = toTile(MAP, x, z); return tileAt(MAP, t.tx, t.tz); },
    teleport(x, z) { player.x = x; player.z = z; player.jumping = false; player.jumpY = 0; player.vy = 0; playerObj.position.set(visX(), terrainY(x, z), visZ()); updateCamera(true); },
    face(h) { player.heading = h; },
    jump, jumpState: () => ({ jumping: player.jumping, jumpY: player.jumpY, vy: player.vy }),
    surfaceY, groundAt: (x, z) => terrainY(x, z),
    visPosition: () => ({ x: visX(), z: visZ() }),
    regionOff, portalTarget, inPortalBand
  };
}

boot().catch(err => {
  console.error("[game] 启动失败", err);
  try { toast("载入出了点问题，但还是能玩：" + (err && err.message || err)); } catch (e) {}
});
