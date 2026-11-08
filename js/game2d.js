// 奶家村 · 大冒险 —— 2D 顶视角探索
// 地面是一张 canvas 画出来的贴图（草地/土路/水塘/花田都在上面），
// 树木房屋是简单几何按坐标摆放，人物仍然是仓库里的 GLB 完整模型。
import * as T from "three";
import { GLTFLoader } from "../vendor/three/GLTFLoader.js";
import { MeshoptDecoder } from "../vendor/meshopt/meshopt_decoder.module.js";
import { createPetMotion } from "./pet-motion.js";
import { makeAnimator } from "./creature.js?v=57";
import { Fight } from "./kof.js?v=57";
import {
  TS, TI, VILLAGE, HOUSE, SHOP, STATION, ARCHIVE, MAPS,
  tileAt, setSolid, solidAt, markAt, mapTexture, toTile, toWorld
} from "./tiles.js";
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
  }
};

const ZONES = {
  meadow: { label: "中央草坡", table: [["naiwa", 55], ["niulai", 30], ["capybara", 15]] },
  forest: { label: "村北树林", table: [["niulai", 50], ["baobaolong", 30], ["naiwa", 20]] },
  lake: { label: "水塘边", table: [["naiwa", 45], ["capybara", 35], ["baobaolong", 20]] },
  flower: { label: "东边花田", table: [["capybara", 42], ["naiwa", 33], ["baobaolong", 25]] }
};

/* =========================================================
   状态
   ========================================================= */
const state = {
  started: false, muted: false, balls: 8,
  captured: {}, metNpc: false, steps: 0,
  lv: 3, exp: 0, maxHp: 62, hp: 62, atk: 28,
  // 探索：见过谁、聊过谁、领了什么活
  met: {},                 // npcId → true
  dayFlags: {},            // "xiaocao:3" → true（每天一次的事）
  gifts: {},               // 一次性送礼
  bounty: null,            // 奶察局的悬赏
  bountyDay: 0
};
const expNeed = lv => 18 + lv * 12;

const SPAWN = { x: .5, z: 27 };
let player = { x: SPAWN.x, z: SPAWN.z, heading: Math.PI, moving: false, run: false, phase: 0, ready: false };

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      lv: state.lv, exp: state.exp, maxHp: state.maxHp, hp: state.hp, atk: state.atk,
      balls: state.balls, captured: state.captured, metNpc: state.metNpc,
      steps: state.steps, muted: state.muted,
      met: state.met, dayFlags: state.dayFlags, gifts: state.gifts,
      bounty: state.bounty, bountyDay: state.bountyDay,
      beatQiyet: !!state.beatQiyet, seenRoom: state.seenRoom,
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
      met: d.met || {}, dayFlags: d.dayFlags || {}, gifts: d.gifts || {},
      bounty: d.bounty || null, bountyDay: d.bountyDay || 0,
      beatQiyet: !!d.beatQiyet, seenRoom: d.seenRoom || {}
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
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;

Fight.init(renderer);

const SKY = 0xdcefe4;
const scene = new T.Scene();
scene.background = new T.Color(SKY);

const camera = new T.OrthographicCamera(-10, 10, 10, -10, .1, 200);

const hemi = new T.HemisphereLight(0xffffff, 0xcbb894, 2.1);
scene.add(hemi);
const sun = new T.DirectionalLight(0xfff4e4, 2.2);
sun.position.set(12, 20, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera;
sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 60;
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
let MAP = VILLAGE;          // 当前所在地图（村庄 / 屋里 / 杂货铺）
let roomName = "";          // 室内时显示的名字

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

function buildGroundFor(map, group) {
  const tex = mapTexture(map, renderer);
  const mat = new T.MeshBasicMaterial({ map: tex });
  const w = map.w * TILE, h = map.h * TILE;
  const mesh = new T.Mesh(new T.PlaneGeometry(w, h), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(map.ox + w / 2, 0, map.oz + h / 2);
  group.add(mesh);

  const sh = new T.Mesh(new T.PlaneGeometry(w, h),
    new T.ShadowMaterial({ opacity: map.indoor ? .1 : .17, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2;
  sh.position.set(mesh.position.x, .012, mesh.position.z);
  sh.receiveShadow = true;
  group.add(sh);

  groundMats.push(mat);
  return mat;
}

function buildGround() {
  groundMat = buildGroundFor(VILLAGE, world);
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
const trunkMat = new T.MeshStandardMaterial({ color: 0x8d6743, roughness: 1 });
const leafMatA = new T.MeshStandardMaterial({ color: 0x5c9a62, roughness: .95, flatShading: true });
const leafMatB = new T.MeshStandardMaterial({ color: 0x4b8654, roughness: .95, flatShading: true });
const leafMatC = new T.MeshStandardMaterial({ color: 0x76ad6c, roughness: .95, flatShading: true });

const treeGroup = new T.Group();
world.add(treeGroup);
const treeSpots = [];
// 两棵树至少隔这么远，不然会长成一堵墙
function treeTooClose(x, z, d = 2.1) {
  for (const [tx, tz] of treeSpots) if (Math.hypot(x - tx, z - tz) < d) return true;
  return false;
}

function addTree(x, z, scale = 1) {
  const r = mulberry(Math.round((x + 100) * 37 + (z + 100) * 91));
  const g = new T.Group();
  const trunk = new T.Mesh(new T.CylinderGeometry(.18, .26, .9, 6), trunkMat);
  trunk.position.y = .45; trunk.castShadow = true;
  g.add(trunk);
  const canopyMat = [leafMatA, leafMatB, leafMatC][Math.floor(r() * 3)];
  const c1 = new T.Mesh(new T.IcosahedronGeometry(.86, 0), canopyMat);
  c1.position.set(0, 1.25, 0); c1.castShadow = true;
  c1.rotation.set(r() * 3, r() * 3, r() * 3);
  g.add(c1);
  const c2 = new T.Mesh(new T.IcosahedronGeometry(.58, 0), canopyMat);
  c2.position.set(.3, 1.82, -.2); c2.castShadow = true;
  c2.rotation.set(r() * 3, r() * 3, r() * 3);
  g.add(c2);
  // 第三团，让树冠不是一个规矩的球
  const c3 = new T.Mesh(new T.IcosahedronGeometry(.44, 0), canopyMat);
  c3.position.set(-.42, 1.55, .28); c3.castShadow = true;
  c3.rotation.set(r() * 3, r() * 3, r() * 3);
  g.add(c3);
  g.position.set(x, 0, z);
  g.scale.setScalar(scale * (.72 + r() * .26));
  g.rotation.y = r() * 6.283;
  treeGroup.add(g);
  treeSpots.push([x, z]);
  markWorld(x, z, .5, 1);
  obstacles.push({ x, z, r: .5 });
}

function addRock(x, z) {
  const r = mulberry(Math.round(x * 13 + z * 7) + 3);
  const m = new T.Mesh(new T.DodecahedronGeometry(.42 + r() * .22, 0),
    new T.MeshStandardMaterial({ color: 0xa9a89c, roughness: 1, flatShading: true }));
  m.position.set(x, .28, z);
  m.rotation.set(r() * 3, r() * 3, r() * 3);
  m.castShadow = true; m.receiveShadow = true;
  world.add(m);
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
  g.position.set(x, 0, z);
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

function addHouse(x, z, w, d, bodyColor, roofColor, rot = 0) {
  const g = new T.Group();
  const H = 2.0;                       // 墙高：俯视时刚好能露出正面

  const body = new T.Mesh(new T.BoxGeometry(w, H, d),
    new T.MeshStandardMaterial({ color: bodyColor, roughness: .92 }));
  body.position.y = H / 2;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  // 矮坡屋顶。原来那个又高又尖，俯视下整栋房子只剩一个红三角，
  // 门和窗全被屋檐盖住——压到 1.1 高、和墙体同宽，才看得见墙
  const rad = Math.max(w, d) / Math.SQRT2;
  const roof = new T.Mesh(new T.ConeGeometry(rad, .9, 4),
    new T.MeshStandardMaterial({ color: roofColor, roughness: .9, flatShading: true, map: roofTex() }));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
  roof.position.y = H + .45;
  roof.castShadow = true;
  g.add(roof);

  // 屋脊压条：让屋顶不要像块塑料片
  const ridge = new T.Mesh(new T.BoxGeometry(w * .96, .09, d * .1),
    new T.MeshStandardMaterial({ color: roofColor, roughness: .9 }));
  ridge.position.y = H + .88;
  g.add(ridge);

  // 屋檐：一圈薄板，屋顶和墙之间不要是硬切的
  const eave = new T.Mesh(new T.BoxGeometry(w * .99, .09, d * .99),
    new T.MeshStandardMaterial({ color: 0xcdbfa4, roughness: .95 }));
  eave.position.y = H;
  eave.castShadow = true;
  g.add(eave);

  // 门（正面，朝 +z）
  const door = new T.Mesh(new T.BoxGeometry(.82, 1.32, .09),
    new T.MeshStandardMaterial({ color: 0x8d6a44, roughness: .88 }));
  door.position.set(0, .66, d / 2 + .06);
  g.add(door);
  // 门框：比门浅一圈，在阴影里也能看出这是个门
  const frame = new T.Mesh(new T.BoxGeometry(1.06, 1.5, .05),
    new T.MeshStandardMaterial({ color: 0xf3e8ce, roughness: .95 }));
  frame.position.set(0, .75, d / 2 + .02);
  g.add(frame);
  // 门把手
  const knob = new T.Mesh(new T.SphereGeometry(.06, 8, 6),
    new T.MeshStandardMaterial({ color: 0xe0b25c, roughness: .4, metalness: .5 }));
  knob.position.set(.28, .72, d / 2 + .12);
  g.add(knob);

  // 窗
  const winMat = new T.MeshStandardMaterial({ color: 0xf7eec4, roughness: .35, emissive: 0x0 });
  [[-w / 2 + .95, d / 2 + .03], [w / 2 - .95, d / 2 + .03]].forEach(([wx, wz]) => {
    const win = new T.Mesh(new T.BoxGeometry(.66, .62, .07), winMat);
    win.position.set(wx, 1.34, wz);
    g.add(win);
  });

  // 门前台阶：一格宽，踩上去就知道是门
  const step = new T.Mesh(new T.BoxGeometry(1.1, .12, .7),
    new T.MeshStandardMaterial({ color: 0xd9cdb4, roughness: 1 }));
  step.position.set(0, .06, d / 2 + .42);
  step.receiveShadow = true;
  g.add(step);

  g.position.set(x, 0, z);
  g.rotation.y = rot;
  world.add(g);
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

function addWell(x, z) {
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
  g.position.set(x, 0, z);
  world.add(g);
  markRect(x, z, 2, 2, 1);
  obstacles.push({ x, z, r: 1 });
}

function addBench(x, z, rot = 0) {
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
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  world.add(g);
  markRect(x, z, 2, 1, 1);
}

function addLamp(x, z) {
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
  g.position.set(x, 0, z);
  world.add(g);
  markRect(x, z, 1, 1, 1);
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
  g.position.set(x, 0, z);
  world.add(g);
  markRect(x, z, w, d, 1);
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
  g.position.set(x, 0, z);
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
  g.position.set(x, 0, z);
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
function addPlaceLabel(x, z, text, width = 2.6, tone = "land") {
  const tex = labelTexture(text, tone);
  const ratio = tex.userData.h / tex.userData.w;
  const mesh = new T.Mesh(
    new T.PlaneGeometry(width, width * ratio),
    new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: .96 })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, .045, z);
  mesh.renderOrder = 2;
  world.add(mesh);
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

function addSign(x, z, text) {
  const g = new T.Group();
  const post = new T.Mesh(new T.CylinderGeometry(.07, .07, 1.1, 6), trunkMat);
  post.position.y = .55; post.castShadow = true;
  g.add(post);
  const board = new T.Mesh(new T.BoxGeometry(1.1, .62, .09),
    new T.MeshStandardMaterial({ color: 0xe8d9b4, roughness: .9 }));
  board.position.y = 1.15; board.castShadow = true;
  g.add(board);
  g.position.set(x, 0, z);
  world.add(g);
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

  // ---- 高草区（走进去会遇怪）----
  [
    { x: 12, z: -20, r: 6.5, zone: "meadow" },
    { x: -12, z: 12, r: 4.6, zone: "forest" },
    { x: 32, z: 4, r: 6.0, zone: "lake" },
    { x: 28, z: 26, r: 4.8, zone: "flower" }
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
}

/* =========================================================
   模型
   ========================================================= */
const PACK = window.N3D_MODELS || {};
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
  const rig = createPetMotion(root, key);
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
   ========================================================= */
const VIEW = { h: 12.5, dist: 60, elev: 1.15 };
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
    vh = VIEW.h; vw = vh * aspect;
    // 竖屏别窄成一条：至少给 8 格宽
    if (vw < 8) { vw = 8; vh = vw / aspect; }
  }
  viewW = vw; viewH = vh;
  camera.left = -vw / 2; camera.right = vw / 2;
  camera.top = vh / 2; camera.bottom = -vh / 2;
  camera.updateProjectionMatrix();
  Fight.resize();
}

// 屏幕抖一下（棋爷掀桌子这种事用得上）
let camShake = 0, camShakeT = 0;
function shake(power = .5, dur = .35) {
  camShake = Math.max(camShake, power);
  camShakeT = Math.max(camShakeT, dur);
}

function updateCamera() {
  let px = player.x, pz = player.z;
  // 屋里放得下整间，就把镜头钉在屋子中间：屋子像一间布景，人在里面走
  if (MAP && MAP.indoor && MAP.room) {
    const R = MAP.room;
    if (viewW >= R.w + .6 && viewH >= R.h + .6) {
      px = MAP.ox + R.x0 + R.w / 2;
      pz = MAP.oz + R.z0 + R.h / 2;
    }
  }
  const y = Math.sin(VIEW.elev) * VIEW.dist;
  const z = Math.cos(VIEW.elev) * VIEW.dist;
  camera.position.set(px, y, pz + z);
  if (camShake > 0) {
    const k = camShake * .55;
    camera.position.x += (Math.random() - .5) * k;
    camera.position.y += (Math.random() - .5) * k;
    camera.position.z += (Math.random() - .5) * k * .5;
  }
  camera.lookAt(px, 0, pz);
  sun.position.set(player.x + 12, 20, player.z + 8);
  sun.target.position.set(player.x, 0, player.z);
}

/* =========================================================
   输入
   ========================================================= */
const keys = {};
function isSolid(cx, cz) { return solidAt(MAP, cx, cz); }

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
  if (k === "w" || k === "W" || k === "ArrowUp") { keys.up = true; e.preventDefault(); }
  if (k === "s" || k === "S" || k === "ArrowDown") { keys.down = true; e.preventDefault(); }
  if (k === "a" || k === "A" || k === "ArrowLeft") { keys.left = true; e.preventDefault(); }
  if (k === "d" || k === "D" || k === "ArrowRight") { keys.right = true; e.preventDefault(); }
  if (k === "Shift") player.run = true;
  if (k === "e" || k === "E" || k === "Enter" || k === " ") {
    if (dlg.open) { advanceDialog(); e.preventDefault(); return; }
    if (Fight.on || overlayOpen()) return;
    interact();
    e.preventDefault();
  }
  if (k === "m" || k === "M") toggleSound();
  if (k === "Escape") closeOverlays();
});
window.addEventListener("keyup", e => {
  const k = e.key;
  if (k === "w" || k === "W" || k === "ArrowUp") keys.up = false;
  if (k === "s" || k === "S" || k === "ArrowDown") keys.down = false;
  if (k === "a" || k === "A" || k === "ArrowLeft") keys.left = false;
  if (k === "d" || k === "D" || k === "ArrowRight") keys.right = false;
  if (k === "Shift") player.run = false;
});
window.addEventListener("blur", () => {
  keys.up = keys.down = keys.left = keys.right = false;
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
const isTouch = () => matchMedia("(hover:none)").matches || window.innerWidth < 820;
// 摇杆只在真正开始游戏后出现；不然标题页上就摆着一副方向键
function syncPad() {
  const on = isTouch() && state.started && !Fight.on
    && !document.body.classList.contains("infight");
  $("#pad").classList.toggle("on", on);
  $("#btnA").classList.toggle("on", on);
}
syncPad();

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
  // 时间只在能自由走动的时候流；翻菜单、对话、打架都暂停
  Farm.update(dt, locked);
  if (locked) {
    player.moving = false;
    updateCamera();
    return;
  }

  let ix = 0, iz = 0;
  if (keys.left) ix -= 1;
  if (keys.right) ix += 1;
  if (keys.up) iz -= 1;
  if (keys.down) iz += 1;

  if (ix || iz) {
    const len = Math.hypot(ix, iz);
    ix /= len; iz /= len;
    // 固定俯视相机：屏幕方向 = 世界方向，W 就是往画面上方走
    const dx = ix, dz = iz;
    player.heading = Math.atan2(dx, dz);

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

    if (MAP === VILLAGE && moved > 0 && grace <= 0 && battleGrace <= 0) {
      grassDist += moved;
      const p = patches.find(p => Math.hypot(player.x - p.x, (player.z - p.z) / .9) < p.r - .6);
      if (p && grassDist > 6) {
        grassDist = 0;
        if (Math.random() < .26) startEncounter(p.zone);
      }
      if (!p) grassDist = 0;
    }
    if (grace > 0) grace -= moved;
  } else {
    player.moving = false;
  }
  if (battleGrace > 0) battleGrace -= dt;

  playerObj.position.set(player.x, sleepPose.on ? playerObj.position.y : 0, player.z);
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
  } else if (!playerObj.userData.isBillboard) {
    const t = performance.now() / 1000;
    const pActor = playerObj.children[0];
    const anim = pActor && pActor.userData.anim;
    if (anim) {
      // 有骨骼：腿摆臂摆，脚步颠簸只留一点点衬托
      anim.update(player.moving ? "walk" : "idle", { t, phase: player.phase });
      playerObj.position.y = player.moving ? Math.abs(Math.sin(player.phase)) * .04 : Math.sin(t * 1.6) * .008;
      playerObj.rotation.z = player.moving ? Math.sin(player.phase) * .018 : 0;
    } else {
      // 没骨骼：整体上下颠
      const bob = player.moving ? Math.abs(Math.sin(player.phase)) * .075 : Math.sin(t * 1.6) * .014;
      playerObj.position.y = bob;
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
  cursor.position.set(a.x, 0, a.z);
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
  $("#dexCount").textContent = Object.keys(state.captured).filter(k => state.captured[k]).length;

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
  if (MAP !== VILLAGE) {
    const base = roomName || "屋里";
    // 屋里隔成了几间：看人现在站在哪一间
    if (MAP.zones && MAP.room) {
      const tx = Math.floor(player.x - MAP.ox) - MAP.room.x0;
      const zn = MAP.zones.find(s => tx >= s.x0 && tx <= s.x1);
      if (zn) return base + " · " + zn.name;
    }
    return base;
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
  const room = MAP === VILLAGE ? null : rooms.get(roomState.name);
  const tex = MAP === VILLAGE ? (groundMat && groundMat.map) : (room && room.mat.map);
  const cv = tex && tex.userData && tex.userData.canvas;
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

  // 高草（会遇怪的地方）
  if (MAP === VILLAGE) {
    patches.forEach(p => {
      const [px, py] = put(p.x, p.z);
      rctx.fillStyle = "rgba(62,110,50,.32)";
      rctx.beginPath(); rctx.ellipse(px, py, p.r * k, p.r * k, 0, 0, 7); rctx.fill();
    });
    // 门
    MAP.marks.forEach((mk, key) => {
      if (mk.kind !== "door") return;
      const [tx, tz] = key.split(",").map(Number);
      const [px, py] = put(MAP.ox + tx + .5, MAP.oz + tz + .5);
      rctx.fillStyle = "rgba(196,116,72,.95)";
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
    || $("#go").classList.contains("show");
}
function closeOverlays() {
  $("#dex").classList.remove("show");
  $("#help").classList.remove("show");
  $("#shop").classList.remove("show");
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

// 奶察的帽子：奶蛙模型顶上扣一顶蓝帽子，比拿表情图当立牌干净
function addCopCap(g, h = 1.5) {
  const capMat = new T.MeshStandardMaterial({ color: 0x2f4a6b, roughness: .82 });
  const cap = new T.Group();
  const dome = new T.Mesh(new T.CylinderGeometry(.19, .23, .15, 14), capMat);
  cap.add(dome);
  const band = new T.Mesh(new T.CylinderGeometry(.232, .232, .05, 14),
    new T.MeshStandardMaterial({ color: 0x1b2b40, roughness: .8 }));
  band.position.y = -.05;
  cap.add(band);
  const brim = new T.Mesh(new T.BoxGeometry(.46, .04, .3), capMat);
  brim.position.set(0, -.09, .18);
  cap.add(brim);
  const badge = new T.Mesh(new T.SphereGeometry(.048, 8, 6),
    new T.MeshStandardMaterial({ color: 0xf2c14e, roughness: .35, metalness: .5 }));
  badge.position.set(0, .03, .2);
  cap.add(badge);
  cap.position.y = h * .93;
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
      g.position.set(def.home.x, 0, def.home.z);
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
    n.obj.position.set(n.x, n.walking ? Math.abs(Math.sin(now * 9 + n.bob)) * (anim ? .035 : .05) : 0, n.z);
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

// 躺下时盖在腿上的那一床被子 —— 光把模型放平看不出"躺"，得盖上才读得出来
let quilt = null;
function quiltMesh() {
  if (quilt) return quilt;
  quilt = new T.Group();
  const cloth = new T.MeshStandardMaterial({ color: 0xcd675c, roughness: .96 });
  const dup = new T.MeshStandardMaterial({ color: 0xe69383, roughness: .95 });

  const main = new T.Mesh(new T.BoxGeometry(.96, .5, 1.42), cloth);
  main.position.set(0, .25, .03);
  main.castShadow = true;
  quilt.add(main);
  // 被口翻出来的一圈浅色边（靠头那侧）
  const flap = new T.Mesh(new T.BoxGeometry(.99, .16, .16), dup);
  flap.position.set(0, .42, -.65);
  quilt.add(flap);
  // 脚那头鼓起来一点
  const bump = new T.Mesh(new T.SphereGeometry(.3, 10, 8), cloth);
  bump.scale.set(1.5, .52, .9);
  bump.position.set(0, .44, .55);
  quilt.add(bump);

  quilt.visible = false;
  scene.add(quilt);
  return quilt;
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
  // 被子盖到脖子：被子中心挪到身体中段
  const q = quiltMesh();
  q.position.set(cx, .02, (box2.min.z + box2.max.z) / 2 + .28);
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

/* ---- 进屋 / 出屋 ---- */
const roomState = { name: "village", back: { x: 0, z: 0 }, backHeading: 0 };

function enterRoom(to) {
  const map = MAPS[to];
  if (!map || roomState.name !== "village") return;
  const r = ensureRoom(to, map);
  roomState.name = to;
  roomState.back = { x: player.x, z: player.z };
  roomState.backHeading = player.heading;

  world.visible = false;
  rooms.forEach((v, k) => { v.group.visible = (k === to); });
  MAP = map;
  roomName = map.name;

  // 站在门口内侧
  const R = map.room;
  const spawn = toWorld(map, R.x0 + R.exitTx, R.z0 + R.h - 3);
  player.x = spawn.x; player.z = spawn.z;
  player.heading = Math.PI;
  player.moving = false;
  playerObj.position.set(player.x, 0, player.z);
  playerObj.rotation.y = Math.PI;
  cursor.visible = false;
  resize();
  updateCamera();
  blip(560, .1, "sine", .04);
  toast("进了" + map.name);
  if (!state.seenRoom) state.seenRoom = {};
  state.seenRoom[to] = true;
  spawnRoomNpcs(map, to);
  hudTick();
}

function leaveRoom() {
  if (roomState.name === "village") return;
  if (sleepPose.on) getUp();
  rooms.forEach(v => { v.group.visible = false; });
  world.visible = true;
  MAP = VILLAGE;
  roomName = "";
  roomState.name = "village";
  // 站到门格子外侧一点，免得一出门又踩在门上
  player.x = roomState.back.x;
  player.z = roomState.back.z + .55;
  player.heading = 0;
  player.moving = false;
  playerObj.position.set(player.x, 0, player.z);
  playerObj.rotation.y = 0;
  resize();
  updateCamera();
  blip(520, .1, "sine", .035);
  hudTick();
}

function interact() {
  const a = aimCell();
  const npc = npcNear(2.2);

  // ① 格子上的标记：门、床、柜台、公告板、灶台……
  if (a && a.mark) {
    const mk = a.mark;
    if (mk.kind === "door") { enterRoom(mk.to); return; }
    if (mk.kind === "exit") { leaveRoom(); return; }
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
  // 每天第一次跟某个人说话，算一次「走访」
  state.visitOn = state.visitOn || {};
  if (state.visitOn[def.id] !== Farm.day) {
    state.visitOn[def.id] = Farm.day;
    questProgress("visit");
  }
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

/* ---- 村民能给你的东西 ---- */
function runAct(def, n) {
  switch (def.act) {
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

  state.balls -= res.ballUsed;
  state.hp = res.playerHp;

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
  } else {
    state.hp = Math.max(1, Math.round(state.maxHp * .35));
    player.x = SPAWN.x; player.z = SPAWN.z;
    playerObj.position.set(player.x, 0, player.z);
    toast("被抬回了村口");
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
   图鉴
   ========================================================= */
const DEX_ORDER = ["nailong", "naiwa", "niulai", "baobaolong", "capybara", "xiaoqi"];
function buildDex() {
  const grid = $("#dexGrid");
  grid.innerHTML = DEX_ORDER.map(k => {
    const c = CAST[k];
    const got = k === "nailong" || (k === "xiaoqi") || state.captured[k];
    return `<div class="dexcard ${got ? "" : "locked"}">
      ${c.model ? '<span class="tag model">3D</span>' : ""}
      <div class="ph"><img src="${c.img}" alt="${c.name}" loading="lazy"></div>
      <div class="dn">${got ? c.name : "？？？"}</div>
      <div class="de">${c.model ? "完整模型可上场" : "立牌"}</div>
      <div class="dd">${got ? c.desc : "还没遇到过。"}</div>
    </div>`;
  }).join("");
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
$("#btnHelp").onclick = () => $("#help").classList.add("show");
$("#btnDexClose").onclick = () => $("#dex").classList.remove("show");
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
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(.05, clock.getDelta());
  if (Fight.on || $("#kof").classList.contains("show")) {
    Fight.update(dt);
    Fight.render(renderer);
    return;
  }
  update(dt);
  if (state.started) drawRadar();
  renderer.render(scene, camera);
}

/* =========================================================
   启动
   ========================================================= */
resize();
window.addEventListener("resize", () => { resize(); syncPad(); });

// 星露谷里天黑要真的黑下来。地面是不受光材质，所以直接调曝光 + 天空色
function setLight(o) {
  renderer.toneMappingExposure = o.exposure;
  if (o.groundColor) for (const m of groundMats) m.color.copy(o.groundColor);
  if (scene.background && scene.background.isColor) scene.background.copy(o.sky);
  sun.color.copy(o.sunColor);
  sun.intensity = o.sunI;
  hemi.intensity = o.hemiI;
  // 天黑点灯
  const dark = 1 - Math.min(1, sun.intensity / 1.2);
  for (const g of lampGlasses) g.emissive.setRGB(1 * dark, .8 * dark, .42 * dark);
}

let booted = false;

async function boot() {
  try {
    buildGround();
    buildProps();
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
  playerObj.position.set(player.x, 0, player.z);
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
      balls: 8, captured: {}, metNpc: false, steps: 0
    });
    player.x = SPAWN.x; player.z = SPAWN.z;
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
  playerObj.position.set(player.x, 0, player.z);
  hudTick();
  Farm.paint();
  blip(660, .1, "sine", .04);
  updateCamera();
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
    teleport(x, z) { player.x = x; player.z = z; playerObj.position.set(x, 0, z); updateCamera(); },
    face(h) { player.heading = h; }
  };
}

boot().catch(err => {
  console.error("[game] 启动失败", err);
  try { toast("载入出了点问题，但还是能玩：" + (err && err.message || err)); } catch (e) {}
});
