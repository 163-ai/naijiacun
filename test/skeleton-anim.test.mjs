#!/usr/bin/env node
/**
 * skeleton-anim.test.mjs —— 19 骨动作库离线验收
 *
 * 不启动浏览器、不联网：直接读未压缩的 rigged GLB，按 glTF nodes 手工搭一套
 * THREE.Bone 层级，再把 pet-skeleton-anim.js 用 data: URL 载入（把 three 的
 * import 指到本机 node_modules），验证：
 *   1. 每个动作 clip 覆盖全部 19 根骨、四元数归一、循环首尾闭合
 *   2. AnimationMixer 能绑定这些 track（不会静默丢骨骼）
 *   3. 动作方向正确：走路手脚前后交替、挥手把手抬高、跑比走幅度大
 *   4. 挥手的抬臂被拆到 Shoulder/Arm/ForeArm/Hand 多段，肩根单段 < 0.6rad
 *
 * 用法：node test/skeleton-anim.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const WORKSPACE = path.resolve(ROOT, '..');
const THREE_URL = pathToFileURL(
  path.join(WORKSPACE, 'naijiacun-rig', 'node_modules', 'three', 'build', 'three.module.js')
).href;
const GLB = path.join(WORKSPACE, 'naijiacun-rig', 'out', 'rigged', 'nailong-rigged.glb');
const MODULE = path.join(ROOT, 'js', 'pet-skeleton-anim.js');

const T = await import(THREE_URL);

/* ---- 读 GLB JSON chunk ---- */
function readGLBJson(file) {
  const b = fs.readFileSync(file);
  let off = 12, J = null;
  while (off + 8 <= b.length) {
    const L = b.readUInt32LE(off), Ty = b.readUInt32LE(off + 4);
    if (Ty === 0x4e4f534a) J = JSON.parse(b.subarray(off + 8, off + 8 + L).toString('utf8').replace(/\0+$/, ''));
    off += 8 + L; off += (4 - off % 4) % 4;
  }
  if (!J) throw new Error('GLB 缺 JSON chunk');
  return J;
}

/* ---- 用 glTF nodes 搭一套 Bone 层级 ---- */
function buildBoneTree(gltf) {
  const parentOf = new Map();
  gltf.nodes.forEach((n, i) => (n.children || []).forEach((c) => parentOf.set(c, i)));
  const joints = gltf.skins[0].joints;
  const objs = new Map();
  for (const idx of joints) {
    const n = gltf.nodes[idx];
    const b = new T.Bone();
    b.name = n.name || `joint${idx}`;
    b.position.fromArray(n.translation || [0, 0, 0]);
    b.quaternion.fromArray(n.rotation || [0, 0, 0, 1]);
    b.scale.fromArray(n.scale || [1, 1, 1]);
    objs.set(idx, b);
  }
  const root = new T.Group();
  root.name = 'gltf.scene';
  for (const idx of joints) {
    const p = parentOf.get(idx);
    if (p != null && objs.has(p)) objs.get(p).add(objs.get(idx));
    else root.add(objs.get(idx));
  }
  root.updateMatrixWorld(true);
  return { root, byName: new Map([...objs.values()].map((b) => [b.name, b])) };
}

/* ---- 把站点模块里的 three import 换成本机路径，用 data: URL 载入 ---- */
async function loadSkeletonAnim() {
  let src = fs.readFileSync(MODULE, 'utf8');
  src = src.replace(/from\s+['"]\.\.\/vendor\/three\/three\.module\.min\.js['"]/g,
    `from '${THREE_URL}'`);
  const url = 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');
  return import(url);
}

const gltf = readGLBJson(GLB);
const { root, byName } = buildBoneTree(gltf);
const anim = await loadSkeletonAnim();
const { clips, restClip, boneNames, count } = anim.buildSkeletonClips(root);

let pass = 0;
const ok = (label, cond, extra = '') => {
  assert.ok(cond, `${label} ${extra}`);
  pass++;
  console.log(`  [ok] ${label}${extra ? ' — ' + extra : ''}`);
};

console.log('\n=== 骨架与 clip 结构 ===');
ok('识别到 19 根骨', count === 19, `实际 ${count}`);
ok('骨骼名含标准 19 骨', ['Hips', 'Spine', 'Chest', 'Head', 'LeftArm', 'RightForeArm', 'LeftUpLeg', 'RightFoot']
  .every((n) => boneNames.includes(n)));
ok('生成 9 套动作', clips.length === 9, clips.map((c) => c.name).join(', '));
ok('restClip 存在且覆盖全骨', !!restClip && restClip.tracks.length === 19);
ok('动作名导出完整', anim.ACTION_NAMES.length === 9);

for (const clip of clips) {
  ok(`${clip.name}: 19 条轨道`, clip.tracks.length === 19);
  const bad = clip.tracks.filter((t) => {
    const n = t.times.length;
    if (t.values.length !== n * 4) return true;
    for (let i = 0; i < n; i++) {
      const [x, y, z, w] = t.values.slice(i * 4, i * 4 + 4);
      if (Math.abs(Math.hypot(x, y, z, w) - 1) > 1e-4) return true;
    }
    for (let i = 1; i < n; i++) if (t.times[i] <= t.times[i - 1]) return true;
    return false;
  });
  ok(`${clip.name}: 四元数归一 + 时间轴递增`, bad.length === 0);
  /* 循环动作首尾同帧，否则 crossFade 时会跳一下 */
  if (clip.userData.loop) {
    const jump = clip.tracks.filter((t) => {
      const n = t.times.length;
      for (let k = 0; k < 4; k++) if (Math.abs(t.values[k] - t.values[(n - 1) * 4 + k]) > 1e-5) return true;
      return false;
    });
    ok(`${clip.name}: 循环首尾闭合`, jump.length === 0);
  }
}

console.log('\n=== AnimationMixer 绑定与动作方向 ===');
const mixer = new T.AnimationMixer(root);
const world = (name) => byName.get(name).getWorldPosition(new T.Vector3());
const restPos = Object.fromEntries([...byName.keys()].map((n) => [n, world(n)]));

function sample(clip, times) {
  const action = mixer.clipAction(clip);
  action.reset(); action.setLoop(T.LoopRepeat, Infinity);
  action.setEffectiveWeight(1); action.play();
  const out = [];
  for (const t of times) {
    action.time = t; mixer.update(0); root.updateMatrixWorld(true);
    out.push({ leftHand: world('LeftHand').clone(), rightHand: world('RightHand').clone(),
               leftFoot: world('LeftFoot').clone(), rightFoot: world('RightFoot').clone() });
  }
  action.stop();
  return out;
}

const byClip = new Map(clips.map((c) => [c.name, c]));
const walk = sample(byClip.get('walk'), [0, 0.225, 0.45, 0.675]);
const run = sample(byClip.get('run'), [0, 0.14, 0.28, 0.42]);
const wave = sample(byClip.get('wave'), [0, 0.45, 0.9]);
const laugh = sample(byClip.get('laugh'), [0, 0.4, 0.8]);

/* 走路：左右脚前后反相 */
const footSwing = (frames) => frames.map((f) => f.leftFoot.z - f.rightFoot.z);
const ws = footSwing(walk), rs = footSwing(run);
ok('walk 双脚前后交替（有正有负）', Math.max(...ws) > 0.02 && Math.min(...ws) < -0.02,
  `范围 ${Math.min(...ws).toFixed(3)}~${Math.max(...ws).toFixed(3)}`);
ok('run 步幅 > walk', Math.max(...rs.map(Math.abs)) > Math.max(...ws.map(Math.abs)) * 1.2,
  `run ${Math.max(...rs.map(Math.abs)).toFixed(3)} / walk ${Math.max(...ws.map(Math.abs)).toFixed(3)}`);

/* 手臂反相摆动 */
const armSwing = (frames) => frames.map((f) => f.leftHand.z - f.rightHand.z);
const wa = armSwing(walk);
ok('walk 双臂反相摆动', Math.max(...wa) > 0.01 && Math.min(...wa) < -0.01);

/* 挥手：右手明显高于 rest */
const waveLift = Math.max(...wave.map((f) => f.rightHand.y)) - restPos.RightHand.y;
ok('wave 右手抬起', waveLift > 0.08, `抬高 ${waveLift.toFixed(3)} 单位`);
const leftLift = Math.max(...laugh.map((f) => f.rightHand.y)) - restPos.RightHand.y;
ok('laugh 也有手臂动作', Math.abs(leftLift) > 0.005 || laugh.some((f) => Math.abs(f.rightHand.z - restPos.RightHand.z) > 0.005));

/* 肩根分段：wave 中 RightArm 的 local 旋转角 < 0.6rad，总抬臂靠多段合计 */
const armTrack = byClip.get('wave').tracks.find((t) => t.name === 'RightArm.quaternion');
const restArmQ = byName.get('RightArm').quaternion.clone();
let maxArmAngle = 0;
for (let i = 0; i < armTrack.times.length; i++) {
  const q = new T.Quaternion().fromArray(armTrack.values, i * 4);
  maxArmAngle = Math.max(maxArmAngle, 2 * Math.acos(Math.min(1, Math.abs(q.dot(restArmQ)))));
}
ok('wave 肩根单段 < 0.6rad（老一套是 2.5rad 全压一根骨）', maxArmAngle < 0.6,
  `实测 ${maxArmAngle.toFixed(3)} rad`);

/* makeClipAdditive 用全 rest clip 当参考不应抛错 */
const additive = anim.asAdditive(byClip.get('wave'), restClip);
ok('asAdditive 可用（供以后叠加手势）', additive.tracks.length === 19);

console.log(`\n=== 全部 ${pass} 项通过 ===\n`);
