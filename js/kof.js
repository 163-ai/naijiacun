// 奶家村 · 大冒险 —— 对战模块：拳皇式实时格斗
// 侧视正交舞台 + 帧数据（起手/判定/收招）+ 硬直击退 + 连击 + 气槽必杀
import * as T from "three";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const $ = s => document.querySelector(s);

const GRAV = 34;
let ARENA = 9.0;             // 单侧活动边界（竖屏时收窄）
const START_GAP = 2.4;      // 开场双方各离中线多远
const ROUND_TIME = 60;
const CY = 2.55;            // 相机高度（固定，俯角约 6°）

/* =========================================================
   招式表（时间单位：秒）
   ========================================================= */
const MOVES = {
  light: {
    id: "light", name: "快拳", startup: .055, active: .06, recovery: .10,
    dmg: 3.4, reach: 1.42, top: 1.55, bot: .45,
    hitstun: .17, kb: 1.0, meter: 5, shake: .12, sparkR: .55
  },
  heavy: {
    id: "heavy", name: "重拳", startup: .13, active: .085, recovery: .27,
    dmg: 8.6, reach: 1.78, top: 1.6, bot: .3,
    hitstun: .33, kb: 4.6, meter: 9, shake: .45, sparkR: .8
  },
  special: {
    id: "special", name: "神曲咏唱", startup: .20, active: .20, recovery: .44,
    dmg: 15.5, reach: 2.75, top: 1.9, bot: .1,
    hitstun: .58, kb: 8.0, meter: 0, cost: 50, shake: .95, sparkR: 1.4
  }
};

/* =========================================================
   模块状态
   ========================================================= */
export const Fight = {
  on: false,
  result: null
};

let renderer = null;
let scene = null;
let camera = null;
let ready = false;

let P = null, E = null;          // 双方 fighter
let ball = 8;
let enemyKey = "naiwa";
let onEndCb = null;
let sfx = () => {};

let timer = ROUND_TIME;
let hitStop = 0;
let shake = 0;
let timeScale = 1;
let phase = "intro";             // intro | fight | ko | over
let phaseT = 0;
let roundEnded = false;
let vsState = { hp: 0, ballUsed: 0 };

const parts = [];                // 命中火花
const keys = {};
const buf = { mv: null, t: 0 };   // 输入缓冲：收招尾巴上按的招不会丢
function bufferMove(id) { buf.mv = id; buf.t = .17; }

/* =========================================================
   舞台
   ========================================================= */
function tex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function buildStage() {
  scene = new T.Scene();
  scene.background = new T.Color(0xe8f2ea);

  const hemi = new T.HemisphereLight(0xffffff, 0xcbb894, 2.1);
  scene.add(hemi);
  const key = new T.DirectionalLight(0xfff3e2, 2.3);
  key.position.set(6, 14, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -12; key.shadow.camera.right = 12;
  key.shadow.camera.top = 10; key.shadow.camera.bottom = -10;
  key.shadow.camera.near = 1; key.shadow.camera.far = 50;
  key.shadow.bias = -.0014;
  scene.add(key);
  const rim = new T.DirectionalLight(0xd8e9ff, 1.2);
  rim.position.set(-8, 7, 6);
  scene.add(rim);

  // 背景板：1x1 平面按屏幕视野拉伸，图案用 repeat 裁切，绝不压扁
  const bgTex = tex(1024, 640, (g, w, h) => {
    const GY = h * .53;                       // 地平线：地板会把这条线以下遮掉
    const sky = g.createLinearGradient(0, 0, 0, GY);
    sky.addColorStop(0, "#cfe6dd");
    sky.addColorStop(.55, "#dff0e7");
    sky.addColorStop(1, "#eef6ea");
    g.fillStyle = sky; g.fillRect(0, 0, w, GY);

    // 云
    g.fillStyle = "rgba(255,255,255,.7)";
    [[180, 90, 58], [430, 62, 44], [700, 104, 66], [920, 70, 46]].forEach(([x, y, r]) => {
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.ellipse(x + i * r * .58 - r * .5, y + Math.sin(i * 1.7) * r * .13, r * (.44 + (i % 2) * .2), r * .28, 0, 0, 7);
        g.fill();
      }
    });

    // 远山两层
    g.fillStyle = "rgba(160,190,168,.62)";
    g.beginPath(); g.moveTo(0, GY - 26);
    for (let x = 0; x <= w; x += 26) g.lineTo(x, GY - 26 - Math.sin(x / 150) * 22 - 10);
    g.lineTo(w, GY); g.lineTo(0, GY); g.closePath(); g.fill();
    g.fillStyle = "rgba(134,172,140,.72)";
    g.beginPath(); g.moveTo(0, GY - 4);
    for (let x = 0; x <= w; x += 22) g.lineTo(x, GY - 4 - Math.sin(x / 90 + 2) * 14 - 4);
    g.lineTo(w, GY + 6); g.lineTo(0, GY + 6); g.closePath(); g.fill();

    // 村子剪影：房子 + 树，站在地平线上
    const houses = [[110, 78, 46], [300, 62, 38], [520, 92, 54], [760, 66, 40], [930, 74, 44]];
    houses.forEach(([x, ww, hh]) => {
      g.fillStyle = "rgba(122,160,126,.85)";
      g.fillRect(x - ww * .3, GY - hh * .62, ww * .6, hh * .62);
      g.fillStyle = "rgba(96,138,104,.9)";
      g.beginPath();
      g.moveTo(x - ww * .48, GY - hh * .6);
      g.lineTo(x, GY - hh);
      g.lineTo(x + ww * .48, GY - hh * .6);
      g.closePath(); g.fill();
    });
    g.fillStyle = "rgba(106,150,110,.9)";
    for (let i = 0; i < 30; i++) {
      const x = (i * 137) % w, r = 20 + (i * 19) % 26;
      g.beginPath(); g.arc(x, GY - r * .45, r, 0, 7); g.fill();
    }

    // 地平线以下的草地
    const gr = g.createLinearGradient(0, GY, 0, h);
    gr.addColorStop(0, "#b3c992");
    gr.addColorStop(.35, "#c1d49c");
    gr.addColorStop(1, "#cfdfae");
    g.fillStyle = gr; g.fillRect(0, GY, w, h - GY);
    g.strokeStyle = "rgba(126,160,102,.18)"; g.lineWidth = 2;
    for (let i = 0; i < 500; i++) {
      const x = (i * 131) % w, y = GY + 6 + (i * 71) % (h - GY - 6);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 1.5, y - 6); g.stroke();
    }
    // 地平线压暗一点，压住接缝
    g.fillStyle = "rgba(120,156,104,.22)";
    g.fillRect(0, GY - 3, w, 7);
  });
  bgMesh = new T.Mesh(new T.PlaneGeometry(1, 1),
    new T.MeshBasicMaterial({ map: bgTex }));
  bgMesh.position.set(0, .37, -9);
  bgMesh.scale.set(9, 5, 1);
  scene.add(bgMesh);

  // 地面（一条窄带，只负责接住影子和脚下的落点）
  const floorTex = tex(1024, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "#b9cf98");
    gr.addColorStop(.35, "#cadcaa");
    gr.addColorStop(1, "#d9e6bd");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // 横向的踩踏痕迹
    for (let i = 0; i < 26; i++) {
      const y = (i * 37) % h;
      g.fillStyle = `rgba(170,190,140,${.05 + (i % 4) * .03})`;
      g.fillRect(0, y, w, 4 + (i % 3) * 6);
    }
    // 尘土与草叶
    for (let i = 0; i < 1400; i++) {
      const x = (i * 137.7) % w, y = (i * 79.3) % h;
      g.strokeStyle = `rgba(120,150,100,${.06 + (i % 5) * .03})`;
      g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (i % 3) - 1, y - 2 - (i % 4)); g.stroke();
    }
    // 近处压暗，把注意力收到中间
    const vig = g.createLinearGradient(0, h * .55, 0, h);
    vig.addColorStop(0, "rgba(96,124,84,0)");
    vig.addColorStop(1, "rgba(96,124,84,.22)");
    g.fillStyle = vig; g.fillRect(0, h * .55, w, h * .45);
  });
  floorTex.wrapS = floorTex.wrapT = T.RepeatWrapping;
  floorTex.repeat.set(6, 1.5);
  const floor = new T.Mesh(new T.PlaneGeometry(160, 16),
    new T.MeshStandardMaterial({ map: floorTex, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -1);
  floor.receiveShadow = true;
  scene.add(floor);

  // 前景：几丛草和石头，填补画面下方空地
  const bushMat = new T.MeshStandardMaterial({ color: 0x6fa763, roughness: .95, flatShading: true });
  const rockMat = new T.MeshStandardMaterial({ color: 0xa8a89b, roughness: 1, flatShading: true });
  [[-7.5, 5.6, .55], [-3.2, 7.4, .42], [2.6, 6.8, .5], [7.0, 5.9, .46]].forEach(([x, z, s], i) => {
    const g = new T.Group();
    for (let k = 0; k < 3; k++) {
      const b = new T.Mesh(new T.IcosahedronGeometry(.9, 0), bushMat);
      b.position.set((k - 1) * .75, .35 + (k % 2) * .2, (k % 2) * .3);
      b.rotation.set(k, k * 2, k * 3);
      b.castShadow = true;
      g.add(b);
    }
    g.position.set(x, 0, z);
    g.scale.setScalar(s);
    scene.add(g);
  });
  [[-5.4, 7.2], [4.8, 7.6]].forEach(([x, z]) => {
    const r = new T.Mesh(new T.DodecahedronGeometry(.45, 0), rockMat);
    r.position.set(x, .26, z);
    r.rotation.set(1, 2, 3);
    r.castShadow = true;
    scene.add(r);
  });

  // 火花贴图
  sparkTex = tex(128, 128, (g, w) => {
    const rg = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    rg.addColorStop(0, "rgba(255,255,255,1)");
    rg.addColorStop(.28, "rgba(255,244,190,.95)");
    rg.addColorStop(.6, "rgba(255,196,120,.45)");
    rg.addColorStop(1, "rgba(255,170,90,0)");
    g.fillStyle = rg; g.fillRect(0, 0, w, w);
  });

  ready = true;
}

let sparkTex = null;
let bgMesh = null;

/* =========================================================
   角色
   ========================================================= */
function makeFighter(key, root, o) {
  root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  const f = {
    key, root,
    x: o.x, y: 0, vx: 0, vy: 0,
    facing: o.facing,
    hp: o.hp, maxHp: o.maxHp, hpLag: o.hp,
    lv: o.lv, atk: o.atk || 1,
    state: "idle", st: 0,
    act: null, actT: 0, hitDone: false,
    hitstun: 0, blocking: false, onGround: true,
    combo: 0, comboT: 0,
    meter: 0, ko: false,
    walkPhase: 0, lunge: 0,
    isPlayer: !!o.isPlayer,
    aiT: 0, aiMode: "approach", aiHold: 0,
    faceOff: o.faceOff || 0
  };
  root.position.set(f.x, 0, 0);
  scene.add(root);
  return f;
}

function faceTo(f, dir) {
  f.facing = dir >= 0 ? 1 : -1;
  f.root.rotation.y = f.facing * Math.PI / 2 + f.faceOff;
}

/* =========================================================
   开始
   ========================================================= */
Fight.init = function (r) { renderer = r; };

Fight.start = async function (opts) {
  if (!ready) buildStage();
  Object.keys(keys).forEach(k => keys[k] = false);
  // 清掉上一场留下的角色和特效，否则会残留一个定格的人影
  if (P && P.root && P.root.parent) P.root.parent.remove(P.root);
  if (E && E.root && E.root.parent) E.root.parent.remove(E.root);
  for (const p of parts) { if (p.s.parent) p.s.parent.remove(p.s); p.s.material.dispose(); }
  parts.length = 0;
  P = E = null;
  parts.length = 0;
  timer = ROUND_TIME;
  hitStop = 0; shake = 0; timeScale = 1;
  phase = "intro"; phaseT = 0; roundEnded = false;
  Fight.result = null;
  ball = opts.balls ?? 8;
  vsState = { hp: opts.hp, ballUsed: 0 };
  sfx = opts.sfx || (() => {});
  onEndCb = opts.onEnd || null;
  enemyKey = opts.enemyKey;

  const pRoot = await opts.actorFor("nailong");
  const eRoot = await opts.actorFor(opts.enemyKey);

  P = makeFighter("nailong", pRoot, {
    x: -START_GAP, facing: 1, hp: opts.hp, maxHp: opts.maxHp,
    lv: opts.lv, atk: opts.atk, isPlayer: true, faceOff: 0
  });
  E = makeFighter(opts.enemyKey, eRoot, {
    x: START_GAP, facing: -1,
    hp: opts.enemyMaxHp, maxHp: opts.enemyMaxHp,
    lv: opts.enemyLv, atk: opts.enemyAtk, faceOff: opts.enemyFaceOff || 0
  });
  E.root.rotation.y = -Math.PI / 2 + E.faceOff;
  P.root.rotation.y = Math.PI / 2;

  $("#keName").textContent = opts.enemyName;
  $("#kpName").textContent = "奶龙";
  $("#keLv").textContent = "Lv." + opts.enemyLv;
  $("#kpLv").textContent = "Lv." + opts.lv;

  Fight.on = true;
  Fight.balls = ball;
  layout();
  syncHud();
  $("#kof").classList.remove("over");
  $("#kof").classList.add("show");
  $("#kIntro").classList.add("show");
  $("#kIntro").textContent = "READY";
  sfx("intro");
};

/* =========================================================
   HUD
   ========================================================= */
const hudCache = {};
function el(id) { return hudCache[id] || (hudCache[id] = document.getElementById(id)); }

function syncHud() {
  if (!P || !E) return;
  const pp = clamp(P.hp / P.maxHp, 0, 1), ep = clamp(E.hp / E.maxHp, 0, 1);
  el("kpHp").style.width = (pp * 100) + "%";
  el("keHp").style.width = (ep * 100) + "%";
  el("kpHpLag").style.width = (clamp(P.hpLag / P.maxHp, 0, 1) * 100) + "%";
  el("keHpLag").style.width = (clamp(E.hpLag / E.maxHp, 0, 1) * 100) + "%";
  el("kpMeter").style.width = P.meter + "%";
  el("keMeter").style.width = E.meter + "%";
  el("kpMeter").classList.toggle("full", P.meter >= 50);
  el("keMeter").classList.toggle("full", E.meter >= 50);
  el("kTimer").textContent = Math.ceil(timer);
  el("kTimer").classList.toggle("low", timer <= 10);

  const c = P.combo;
  const kc = el("kCombo");
  if (c >= 2 && P.comboT > 0) {
    kc.textContent = c + " HIT";
    kc.classList.add("show");
    kc.classList.remove("pop"); void kc.offsetWidth; kc.classList.add("pop");
  } else {
    kc.classList.remove("show");
  }

  const canCatch = !E.ko && ep <= .3;
  el("kCatch").classList.toggle("on", canCatch);
  el("kBallNum").textContent = ball;
}

/* =========================================================
   输入
   ========================================================= */
let bound = false;
function bindKeys() {
  if (bound) return;
  bound = true;
  const down = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "jump", ArrowDown: "block", Space: "catch" };
  window.addEventListener("keydown", e => {
    if (!Fight.on) return;
    const k = e.key;
    if (k === "a" || k === "A" || k === "ArrowLeft") { keys.left = true; e.preventDefault(); }
    if (k === "d" || k === "D" || k === "ArrowRight") { keys.right = true; e.preventDefault(); }
    if (k === "w" || k === "W" || k === "ArrowUp") { keys.jump = true; e.preventDefault(); }
    if (k === "s" || k === "S" || k === "ArrowDown") { keys.block = true; e.preventDefault(); }
    if (k === "j" || k === "J") { keys.light = true; bufferMove("light"); e.preventDefault(); }
    if (k === "k" || k === "K") { keys.heavy = true; bufferMove("heavy"); e.preventDefault(); }
    if (k === "l" || k === "L") { keys.special = true; bufferMove("special"); e.preventDefault(); }
    if (k === " " || k === "Enter") { keys.catch = true; e.preventDefault(); }
  }, { passive: false });
  window.addEventListener("keyup", e => {
    const k = e.key;
    if (k === "a" || k === "A" || k === "ArrowLeft") keys.left = false;
    if (k === "d" || k === "D" || k === "ArrowRight") keys.right = false;
    if (k === "w" || k === "W" || k === "ArrowUp") keys.jump = false;
    if (k === "s" || k === "S" || k === "ArrowDown") keys.block = false;
    if (k === "j" || k === "J") keys.light = false;
    if (k === "k" || k === "K") keys.heavy = false;
    if (k === "l" || k === "L") keys.special = false;
    if (k === " " || k === "Enter") keys.catch = false;
  });
  window.addEventListener("blur", () => {
    ["left", "right", "jump", "block", "light", "heavy", "special", "catch"].forEach(k => keys[k] = false);
  });

  document.querySelectorAll("#kpad button").forEach(b => {
    const k = b.dataset.k;
    const atk = k === "light" || k === "heavy" || k === "special";
    const on = e => {
      e.preventDefault();
      keys[k] = true;
      if (atk) bufferMove(k);
      if (k !== "left" && k !== "right" && k !== "block") setTimeout(() => keys[k] = false, 90);
    };
    const off = e => { e.preventDefault(); keys[k] = false; };
    b.addEventListener("pointerdown", on);
    b.addEventListener("pointerup", off);
    b.addEventListener("pointerleave", off);
    b.addEventListener("pointercancel", off);
  });
}

/* =========================================================
   动作
   ========================================================= */
function canAct(f) {
  return !f.ko && f.hitstun <= 0 && !f.act && f.onGround;
}

function startMove(f, mv) {
  if (!canAct(f)) return false;
  if (mv.cost && f.meter < mv.cost) return false;
  if (mv.cost) f.meter -= mv.cost;
  f.act = mv;
  f.actT = 0;
  f.hitDone = false;
  f.state = "attack";
  f.vx = 0;
  sfx(mv.id === "special" ? "special" : "swing");
  return true;
}

function jump(f) {
  if (!canAct(f)) return;
  f.vy = 8.4;
  f.onGround = false;
  f.state = "jump";
  f.y = 0.01;
  sfx("jump");
}

/* =========================================================
   每帧
   ========================================================= */
function stepFighter(f, dt) {
  f.st += dt;
  if (f.hitstun > 0) f.hitstun -= dt;
  if (f.comboT > 0) { f.comboT -= dt; if (f.comboT <= 0) f.combo = 0; }

  // 招式推进
  if (f.act) {
    f.actT += dt;
    const mv = f.act;
    const total = mv.startup + mv.active + mv.recovery;
    if (f.actT >= total) { f.act = null; f.state = f.onGround ? "idle" : "jump"; }
  }

  // 物理
  if (!f.onGround) {
    f.vy -= GRAV * dt;
    f.y += f.vy * dt;
    if (f.y <= 0) { f.y = 0; f.vy = 0; f.onGround = true; if (f.state === "jump") f.state = "idle"; }
  }
  if (f.hitstun > 0 || f.ko) {
    f.vx *= Math.pow(.02, dt);
  }
  f.x += f.vx * dt;
  if (f.hitstun <= 0 && !f.ko) f.vx *= Math.pow(.0009, dt);
  f.x = clamp(f.x, -ARENA, ARENA);

  // 血条残影
  f.hpLag += (f.hp - f.hpLag) * (1 - Math.pow(.02, dt));
  if (Math.abs(f.hpLag - f.hp) < .1) f.hpLag = f.hp;
}

function walkSpeed(f) {
  const back = (f.isPlayer ? keys.right : f.aiDir) * f.facing < 0;
  return back ? 2.4 : 3.3;
}

function applyHit(a, d, mv) {
  const blocked = d.blocking && d.hitstun <= 0 && !d.ko;
  let dmg = mv.dmg * (1 + (a.lv - 3) * .07);
  if (blocked) dmg *= .16;

  d.hp = Math.max(0, d.hp - dmg);
  d.hitstun = blocked ? mv.hitstun * .42 : mv.hitstun;
  d.act = null;
  d.state = "hurt";
  const dir = a.facing;
  d.vx = dir * (blocked ? mv.kb * .32 : mv.kb);
  if (blocked) d.blockstun = .2;

  a.meter = Math.min(100, a.meter + (mv.meter || 0));
  d.meter = Math.min(100, d.meter + (mv.meter || 0) * .55);

  if (!blocked) {
    a.combo = a.comboT > 0 ? a.combo + 1 : 1;
    a.comboT = 1.05;
    hitStop = Math.max(hitStop, mv.id === "special" ? .09 : .055);
    shake = Math.max(shake, mv.shake);
    spark((a.x + d.x) / 2 + dir * .2, 1.0 + (d.y || 0), mv.sparkR);
    sfx("hit");
  } else {
    a.combo = 0; a.comboT = 0;
    hitStop = Math.max(hitStop, .035);
    shake = Math.max(shake, .12);
    spark((a.x + d.x) / 2 + dir * .2, 1.05, .45);
    sfx("block");
  }

  if (d.hp <= 0 && !d.ko) knockOut(d);
}

function checkHit(a, d, mv) {
  if (!a.act || a.hitDone) return;
  const t = a.actT;
  if (t < mv.startup || t > mv.startup + mv.active) return;
  const dxs = (d.x - a.x) * a.facing;
  if (dxs <= -.15 || dxs > mv.reach) return;
  const dy = Math.abs((d.y + .85) - (a.y + .95));
  if (dy > 1.35) return;
  a.hitDone = true;
  applyHit(a, d, mv);
}

function spark(x, y, r) {
  const m = new T.SpriteMaterial({
    map: sparkTex, transparent: true, depthWrite: false,
    blending: T.AdditiveBlending, opacity: 1
  });
  const s = new T.Sprite(m);
  s.position.set(x, y, .6);
  s.scale.setScalar(r * .6);
  scene.add(s);
  parts.push({ s, t: 0, life: .34, r: r * 2.1 });

  for (let i = 0; i < 7; i++) {
    const p = new T.Sprite(m.clone());
    p.position.set(x, y, .55);
    p.scale.setScalar(r * .22);
    scene.add(p);
    parts.push({
      s: p, t: 0, life: .3 + Math.random() * .2, r: r * .1,
      vx: rnd(-4, 4), vy: rnd(0, 6)
    });
  }
}

function stepParticles(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += dt;
    const k = p.t / p.life;
    if (k >= 1) { scene.remove(p.s); p.s.material.dispose(); parts.splice(i, 1); continue; }
    p.s.material.opacity = 1 - k;
    if (p.vx !== undefined) {
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.vy -= 12 * dt;
    } else {
      p.s.scale.setScalar(p.r * (.5 + k * .9));
    }
  }
}

/* =========================================================
   AI
   ========================================================= */
function aiThink(dt) {
  const e = E, p = P;
  if (!e || e.ko || p.ko) return;
  e.aiT -= dt;

  const dist = Math.abs(p.x - e.x);
  const toward = Math.sign(p.x - e.x) || 1;
  e.aiDir = toward;

  // 面向对手
  if (canAct(e)) faceTo(e, toward);

  if (e.aiT > 0) {
    // 保持上一决策
    if (e.aiMode === "approach") e.aiDir = toward;
    else if (e.aiMode === "retreat") e.aiDir = -toward;
    else if (e.aiMode === "block") { e.aiDir = -toward; }
    else if (e.aiMode === "wait") e.aiDir = 0;
    return;
  }

  const lvl = E.lv;
  const aggro = clamp(.34 + lvl * .06, .3, .8);

  // 对手正在出招 → 有概率防
  if (p.act && dist < 2.8 && Math.random() < .42) {
    e.aiMode = "block"; e.aiT = .34 + Math.random() * .2; e.aiDir = -toward;
    return;
  }
  if (e.meter >= 50 && dist < 2.9 && Math.random() < .34) {
    if (startMove(e, MOVES.special)) { e.aiMode = "wait"; e.aiT = .5; return; }
  }
  if (dist > 2.35) {
    e.aiMode = "approach"; e.aiT = .18 + Math.random() * .2; e.aiDir = toward;
    return;
  }
  if (dist < .95 && Math.random() < .3) {
    e.aiMode = "retreat"; e.aiT = .2; e.aiDir = -toward;
    return;
  }
  if (Math.random() < aggro) {
    const mv = Math.random() < .62 ? MOVES.light : MOVES.heavy;
    if (startMove(e, mv)) { e.aiMode = "wait"; e.aiT = .22; return; }
  }
  e.aiMode = "wait"; e.aiT = .12 + Math.random() * .18; e.aiDir = 0;
}

/* =========================================================
   玩家输入处理
   ========================================================= */
function playerInput(dt) {
  const p = P;
  if (!p || p.ko) return;
  // 投球不受出招硬直限制，随时可以按
  if (keys.catch) { keys.catch = false; tryCatch(); }
  if (canAct(p)) {
    const toward = Math.sign(E.x - p.x) || 1;
    let dir = 0;
    if (keys.left) dir -= 1;
    if (keys.right) dir += 1;
    // 格斗游戏惯例：永远面向对手，后退即防御
    faceTo(p, toward);
    p.blocking = keys.block || (dir !== 0 && dir !== toward);

    if (keys.jump) { keys.jump = false; jump(p); return; }

    // 缓冲里的招式优先
    if (buf.t > 0) {
      buf.t -= dt;
      const mv = MOVES[buf.mv];
      if (mv && startMove(p, mv)) { buf.mv = null; buf.t = 0; return; }
      if (buf.t <= 0) buf.mv = null;
    }

    if (p.onGround && !p.act && dir !== 0) {
      const sp = walkSpeed(p);
      p.x += dir * sp * dt;
      p.x = clamp(p.x, -ARENA, ARENA);
      p.state = "walk";
      p.walkPhase += dt * (dir * p.facing > 0 ? 13 : 9);
    } else if (p.state === "walk") {
      p.state = "idle";
    }
  } else {
    p.blocking = false;
  }
}

function tryCatch() {
  if (!P || !E || E.ko) return;
  const ratio = E.hp / E.maxHp;
  if (ratio > .3) { flash("血量还太高，球兜不住"); sfx("deny"); return; }
  if (ball <= 0) { flash("没有捕捉球了"); sfx("deny"); return; }
  ball--;
  vsState.ballUsed++;
  const chance = clamp((1 - ratio) * .82 + .22, .22, .95);
  sfx("throw");
  setTimeout(() => {
    if (!Fight.on) return;
    if (Math.random() < chance) {
      endRound("capture");
    } else {
      flash("球晃了两下又弹开了");
      E.meter = Math.min(100, E.meter + 12);
      syncHud();
    }
  }, 420);
}

/* =========================================================
   回合结束
   ========================================================= */
function knockOut(f) {
  f.ko = true;
  f.hitstun = 99;
  f.state = "ko";
  f.vx = -f.facing * 5.5;
  timeScale = .28;
  shake = 1.2;
  sfx("ko");
  if (phase === "fight") {
    phase = "ko"; phaseT = 0;
    $("#kIntro").textContent = "K.O.";
    $("#kIntro").classList.add("ko", "show");
  }
  syncHud();
}

function endRound(kind) {
  if (roundEnded) return;
  roundEnded = true;
  phase = "over";
  timeScale = 1;

  let win = false, captured = false;
  if (kind === "capture") { win = true; captured = true; }
  else if (kind === "ko") { win = E.hp <= 0; }
  else if (kind === "timeup") { win = (P.hp / P.maxHp) >= (E.hp / E.maxHp); }
  else if (kind === "lose") { win = false; }

  Fight.result = {
    win, captured, enemyKey,
    playerHp: Math.max(1, Math.round(P.hp)),
    enemyHpLeft: Math.max(0, Math.round(E.hp)),
    enemyMaxHp: E.maxHp,
    ballUsed: vsState.ballUsed,
    kind
  };

  const box = $("#kResult");
  box.className = "show " + (win ? "win" : "lose");
  $("#kof").classList.add("over");
  $("#kResultTitle").textContent = captured ? "收服成功" : win ? "胜　利" : "败　北";
  $("#kResultSub").textContent = captured
    ? "球落地，草丛安静下来。"
    : win ? "对手撑不住了。" : "眼前一黑，被抬回了村口。";
  $("#kResultBtn").textContent = win ? "回到村子" : "回村养伤";
}

Fight.finish = function () {
  Fight.on = false;
  $("#kof").classList.remove("show", "over");
  $("#kIntro").classList.remove("show");
  $("#kResult").className = "";
  if (onEndCb) { const cb = onEndCb; onEndCb = null; cb(Fight.result); }
};

/* =========================================================
   镜头
   ========================================================= */
let viewW = 8.4, viewH = 5.0;

function viewTargets() {
  const aspect = window.innerWidth / window.innerHeight;
  const portrait = aspect < .85;
  ARENA = portrait ? 4.9 : 9.0;
  const sep = P && E ? Math.abs(P.x - E.x) : 4.8;
  const need = clamp(sep + (portrait ? 3.4 : 4.6),
    portrait ? 6.6 : 7.6, portrait ? 12 : 17);
  let vw = need, vh = vw / aspect;
  if (vh < 4.4) { vh = 4.4; vw = vh * aspect; }
  return { vw, vh };
}

function layout() {
  if (!renderer) return;
  const { vw, vh } = viewTargets();
  viewW = vw; viewH = vh;
  if (!camera) {
    camera = new T.OrthographicCamera(-vw / 2, vw / 2, vh / 2, -vh / 2, .1, 120);
  } else {
    camera.left = -vw / 2; camera.right = vw / 2;
    camera.top = vh / 2; camera.bottom = -vh / 2;
    camera.updateProjectionMatrix();
  }
}

function updateCamera(dt) {
  if (!P || !E) return;
  const mid = (P.x + E.x) / 2;
  const { vw: needW, vh: needH } = viewTargets();

  // 平滑拉远拉近
  viewW += (needW - viewW) * (1 - Math.pow(.06, dt));
  viewH += (needH - viewH) * (1 - Math.pow(.06, dt));
  ARENA = window.innerWidth / window.innerHeight < .85 ? 4.9 : 9.0;

  camera.left = -viewW / 2; camera.right = viewW / 2;
  camera.top = viewH / 2; camera.bottom = -viewH / 2;
  camera.updateProjectionMatrix();

  const shx = shake > 0 ? rnd(-1, 1) * shake * .3 : 0;
  const shy = shake > 0 ? rnd(-1, 1) * shake * .22 : 0;
  // 轻微俯角，让地板露出来一条带子
  camera.position.set(mid + shx, CY + shy, 11);
  camera.lookAt(mid + shx, CY - 1.2 + shy, 0);

  // 背景板按屏幕尺寸精确铺满，图案用 repeat 裁切（不拉伸变形）
  if (bgMesh) {
    bgMesh.scale.set(viewW, viewH, 1);
    bgMesh.position.set(mid, .37, -9);
    const m = bgMesh.material.map;
    const aspect = window.innerWidth / window.innerHeight;
    const rx = Math.min(1, aspect / (1024 / 640));
    m.repeat.set(rx, 1);
    m.offset.set((1 - rx) / 2, 0);
  }
}

/* =========================================================
   姿态
   ========================================================= */
function poseFighter(f, dt) {
  const r = f.root;
  r.position.x = f.x;
  r.position.y = f.y;
  const t = performance.now() / 1000;

  if (f.ko) {
    r.rotation.z = lerp(r.rotation.z, -f.facing * 1.35, 1 - Math.pow(.02, dt));
    r.position.y = f.y;
    return;
  }
  if (f.hitstun > 0) {
    r.rotation.x = lerp(r.rotation.x, -.22, 1 - Math.pow(.001, dt));
    return;
  }
  if (f.act) {
    const mv = f.act;
    const k = f.actT / (mv.startup + mv.active + mv.recovery);
    const lunge = f.actT > mv.startup * .6 && f.actT < mv.startup + mv.active ? .28 : 0;
    r.position.x = f.x + f.facing * lunge;
    r.rotation.x = lerp(r.rotation.x, -.34 * Math.sin(Math.min(1, k * 1.6) * Math.PI), 1 - Math.pow(.02, dt));
    return;
  }
  if (!f.onGround) {
    r.rotation.x = lerp(r.rotation.x, .12, 1 - Math.pow(.05, dt));
    return;
  }
  if (f.state === "walk") {
    r.rotation.z = Math.sin(f.walkPhase) * .07;
    r.position.y = Math.abs(Math.sin(f.walkPhase * 2)) * .06;
  } else {
    r.rotation.z = lerp(r.rotation.z, 0, 1 - Math.pow(.02, dt));
    r.position.y = Math.sin(t * 2.2 + (f.isPlayer ? 0 : 1.6)) * .018;
  }
  r.rotation.x = lerp(r.rotation.x, 0, 1 - Math.pow(.02, dt));
}

/* =========================================================
   主更新
   ========================================================= */
Fight.update = function (dtRaw) {
  if (!Fight.on || !P || !E) return;
  dtRaw = Math.min(.05, dtRaw);
  Fight.tickFlash(dtRaw);

  // 开场
  if (phase === "intro") {
    phaseT += dtRaw;
    if (phaseT > .85) {
      phase = "fight";
      $("#kIntro").textContent = "FIGHT!";
      $("#kIntro").classList.add("show");
      sfx("fight");
      setTimeout(() => { if (phase === "fight") $("#kIntro").classList.remove("show"); }, 700);
    }
    updateCamera(dtRaw);
    poseFighter(P, dtRaw); poseFighter(E, dtRaw);
    stepParticles(dtRaw);
    return;
  }

  if (phase === "ko") {
    phaseT += dtRaw;
    if (phaseT > .6) timeScale = lerp(timeScale, 1, 1 - Math.pow(.2, dtRaw));
    stepFighter(P, dtRaw * timeScale);
    stepFighter(E, dtRaw * timeScale);
    poseFighter(P, dtRaw); poseFighter(E, dtRaw);
    updateCamera(dtRaw);
    stepParticles(dtRaw);
    if (phaseT > 1.65) endRound("ko");
    return;
  }

  if (phase === "over") {
    updateCamera(dtRaw);
    poseFighter(P, dtRaw); poseFighter(E, dtRaw);
    stepParticles(dtRaw);
    return;
  }

  // 战斗
  if (hitStop > 0) {
    hitStop -= dtRaw;
    stepParticles(dtRaw);
    updateCamera(dtRaw);
    return;
  }

  const dt = dtRaw * timeScale;
  timer -= dt;
  if (timer <= 0) { timer = 0; endRound("timeup"); return; }

  shake *= Math.pow(.0025, dtRaw);

  aiThink(dt);
  playerInput(dt);

  // AI 移动
  if (canAct(E) && E.aiMode && E.aiT > 0) {
    const dir = E.aiDir || 0;
    if (dir !== 0) {
      E.x += dir * walkSpeed(E) * dt;
      E.x = clamp(E.x, -ARENA, ARENA);
      E.state = "walk";
      E.walkPhase += dt * 11;
    }
    E.blocking = E.aiMode === "block";
  } else if (E) {
    E.blocking = false;
  }

  stepFighter(P, dt);
  stepFighter(E, dt);

  // 命中判定
  if (P.act) checkHit(P, E, P.act);
  if (E.act) checkHit(E, P, E.act);

  // 双方重叠推开
  const gap = Math.abs(P.x - E.x);
  if (gap < .95 && !P.ko && !E.ko) {
    const push = (.95 - gap) / 2 * Math.sign(P.x - E.x || 1);
    P.x += push * .5; E.x -= push * .5;
  }

  poseFighter(P, dtRaw);
  poseFighter(E, dtRaw);
  stepParticles(dtRaw);
  updateCamera(dtRaw);
  syncHud();
};

Fight.render = function (r) {
  if (!scene || !camera) return;
  r.render(scene, camera);
};

Fight.resize = function () { layout(); };

/* 提示条 */
let flashT = 0;
function flash(msg) {
  const n = $("#kFlash");
  n.textContent = msg;
  n.classList.add("show");
  flashT = 1.1;
}
Fight.tickFlash = function (dt) {
  if (flashT > 0) {
    flashT -= dt;
    if (flashT <= 0) $("#kFlash").classList.remove("show");
  }
};

bindKeys();

if (location.search.indexOf("debug") >= 0) {
  window.__K = {
    get P() { return P; }, get E() { return E; }, get phase() { return phase; },
    Fight, MOVES, keys,
    damage(d) { if (E) { E.hp = Math.max(0, E.hp - d); E.hpLag = E.hp; syncHud(); if (E.hp <= 0 && !E.ko) knockOut(E); } },
    ko() { if (E && !E.ko) { E.hp = 0; knockOut(E); } },
    state() { return { php: P && P.hp, ehp: E && E.hp, pAct: P && P.act && P.act.id, eAct: E && E.act && E.act.id }; }
  };
}
