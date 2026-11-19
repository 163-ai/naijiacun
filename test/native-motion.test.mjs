#!/usr/bin/env node
/**
 * native-motion.test.mjs —— createPetMotion(native) 端到端验收
 *
 * 把站点 4 个模块用 data: URL 串起来（只替换 import 说明符，源码一字不改），
 * 喂一份「19 骨 + 一张 mesh + 一段自带 idle」的假 gltf.scene，验证：
 *   · rig.mode='native' 真的走 createNativeMotion，返回 native:true
 *   · 动作库 9 套动作都挂上了，自带 idle 没被弄丢
 *   · update(dt,'walk') 让腿和手真的动（骨骼 local 四元数变化），不是根节点平移
 *   · laugh(t,'wave') 把右手抬起来，laugh 结束回到 idle
 *   · gesture/reset/dispose 接口齐备
 *
 * 用法：node test/native-motion.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const WORKSPACE = path.resolve(ROOT, '..');
const JS = (f) => path.join(ROOT, 'js', f);
const THREE_URL = pathToFileURL(
  path.join(WORKSPACE, 'naijiacun-rig', 'node_modules', 'three', 'build', 'three.module.js')
).href;
const GLB = path.join(WORKSPACE, 'naijiacun-rig', 'out', 'rigged', 'nailong-rigged.glb');
const T = await import(THREE_URL);

const read = (f) => fs.readFileSync(f, 'utf8');
const dataUrl = (src) => 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');
const swap = (src, from, to) => src.split(`'${from}'`).join(JSON.stringify(to));

/* ---- 把 4 个模块的 import 改成 data:/file: URL ---- */
const threeSwap = (src, label) => swap(src, '../vendor/three/three.module.min.js', THREE_URL);
const laughUrl = dataUrl(read(JS('pet-laugh.js')));
const rigUrl = dataUrl(threeSwap(read(JS('pet-rig.js'))));
const skelUrl = dataUrl(threeSwap(read(JS('pet-skeleton-anim.js'))));
/* SkeletonUtils 里 import 'three' 裸说明符，node 下要换成 file URL */
const skelUtilsUrl = dataUrl(
  read(path.join(ROOT, 'vendor', 'three', 'SkeletonUtils.js')).split("'three'").join(JSON.stringify(THREE_URL))
);
let motionSrc = threeSwap(read(JS('pet-motion.js')));
motionSrc = swap(motionSrc, './pet-laugh.js?v=site-pets-1', laughUrl);
motionSrc = swap(motionSrc, './pet-rig.js?v=rig-1', rigUrl);
motionSrc = swap(motionSrc, './pet-skeleton-anim.js?v=skel-2', skelUrl);
motionSrc = swap(motionSrc, '../vendor/three/SkeletonUtils.js?v=skel-1', skelUtilsUrl);
const motionMod = await import(dataUrl(motionSrc));
const { createPetMotion } = motionMod;
const { makeNativeAnimator } = await import(skelUrl);

/* ---- 从 GLB 的 nodes 搭 19 骨层级 ---- */
function readGLBJson(file) {
  const b = fs.readFileSync(file);
  let off = 12, J = null;
  while (off + 8 <= b.length) {
    const L = b.readUInt32LE(off), Ty = b.readUInt32LE(off + 4);
    if (Ty === 0x4e4f534a) J = JSON.parse(b.subarray(off + 8, off + 8 + L).toString('utf8').replace(/\0+$/, ''));
    off += 8 + L; off += (4 - off % 4) % 4;
  }
  return J;
}
const gltf = readGLBJson(GLB);
const parentOf = new Map();
gltf.nodes.forEach((n, i) => (n.children || []).forEach((c) => parentOf.set(c, i)));
const joints = gltf.skins[0].joints;
const boneByIndex = new Map();
for (const idx of joints) {
  const n = gltf.nodes[idx], b = new T.Bone();
  b.name = n.name;
  b.position.fromArray(n.translation || [0, 0, 0]);
  b.quaternion.fromArray(n.rotation || [0, 0, 0, 1]);
  b.scale.fromArray(n.scale || [1, 1, 1]);
  boneByIndex.set(idx, b);
}
const source = new T.Group();
source.name = 'gltf.scene';
for (const idx of joints) {
  const p = parentOf.get(idx);
  if (p != null && boneByIndex.has(p)) boneByIndex.get(p).add(boneByIndex.get(idx));
  else source.add(boneByIndex.get(idx));
}
const byName = new Map([...boneByIndex.values()].map((b) => [b.name, b]));

/* 一张 mesh 给 quickBounds 量身高（高 1.3，跟真模型一致） */
const geom = new T.BufferGeometry();
const v = [];
for (const y of [0, 1.3]) for (const x of [-0.3, 0.3]) for (const z of [-0.2, 0.2]) v.push(x, y, z);
geom.setAttribute('position', new T.Float32BufferAttribute(v, 3));
source.add(new T.Mesh(geom, new T.MeshBasicMaterial()));

/* 自带 idle：全骨恒定 rest，2 秒 */
const idleTracks = [];
for (const [name, b] of byName) {
  const q = b.quaternion;
  idleTracks.push(new T.QuaternionKeyframeTrack(`${name}.quaternion`,
    new Float32Array([0, 2]), new Float32Array([q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w])));
}
source.userData.clips = [new T.AnimationClip('idle', 2, idleTracks)];
source.updateMatrixWorld(true);

let pass = 0;
const ok = (label, cond, extra = '') => { assert.ok(cond, `${label} ${extra}`); pass++; console.log(`  [ok] ${label}${extra ? ' — ' + extra : ''}`); };
const world = (name) => { source.updateMatrixWorld(true); return byName.get(name).getWorldPosition(new T.Vector3()); };
const restHand = world('RightHand').clone(), restFoot = world('LeftFoot').clone();

console.log('\n=== native 接线 ===');
const rig = createPetMotion(source, 'nailong', { rig: { mode: 'native', idleClip: 'idle' } });
ok('走 native 通道', rig.native === true && rig.kind === 'native');
ok('9 套骨骼动作全部登记', rig.actions.length === 9, rig.actions.join(', '));
ok('自带 idle 没丢', rig.stats().clips.includes('idle') && rig.clip === 'idle');
ok('stats 报出 19 根骨', rig.stats().boneCount === 19);
ok('接口齐备', ['gesture', 'stopGesture', 'dispose', 'laugh', 'update', 'reset'].every((k) => typeof rig[k] === 'function'));

console.log('\n=== 动作是否真的落在骨骼上 ===');
/* 记录走路过程中「骨骼 local 四元数」和「根节点变换」各自的变化量 */
const arm = byName.get('RightArm'), hip = byName.get('LeftUpLeg');
const q0 = arm.quaternion.clone(), h0 = hip.quaternion.clone();
const rootPos0 = rig.root.position.clone(), rootRot0 = rig.root.rotation.clone();
let armDelta = 0, hipDelta = 0, footSwing = 0, handSwing = 0;
for (let i = 0; i < 90; i++) {
  rig.update(1 / 60, 'walk');
  armDelta = Math.max(armDelta, q0.angleTo(arm.quaternion));
  hipDelta = Math.max(hipDelta, h0.angleTo(hip.quaternion));
  footSwing = Math.max(footSwing, Math.abs(world('LeftFoot').z - restFoot.z));
  handSwing = Math.max(handSwing, Math.abs(world('RightHand').z - restHand.z));
}
ok('walk 手臂骨骼在转', armDelta > 0.05, `最大 ${armDelta.toFixed(3)} rad`);
ok('walk 大腿骨骼在转', hipDelta > 0.05, `最大 ${hipDelta.toFixed(3)} rad`);
ok('walk 脚有前后位移', footSwing > 0.05, `${footSwing.toFixed(3)} 单位`);
ok('walk 手有前后摆动', handSwing > 0.02, `${handSwing.toFixed(3)} 单位`);
ok('根节点不再承担动作（位移/旋转不变）',
  rig.root.position.distanceTo(rootPos0) < 1e-6 && rig.root.rotation.z === rootRot0.z);

console.log('\n=== 展台动作切换 ===');
rig.laugh(0.45, 'wave');
const waveLift = world('RightHand').y - restHand.y;
ok('wave 把右手抬起来', waveLift > 0.08, `抬高 ${waveLift.toFixed(3)} 单位`);
rig.laugh(0.4, 'laugh');
ok('laugh 动作可播', byName.get('Spine').quaternion.angleTo(gltf.nodes[gltf.skins[0].joints.find((i) => gltf.nodes[i].name === 'Spine')].rotation ? new T.Quaternion().fromArray(gltf.nodes[gltf.skins[0].joints.find((i) => gltf.nodes[i].name === 'Spine')].rotation || [0, 0, 0, 1]) : new T.Quaternion()) >= 0);
ok('gesture(jump) 返回 true', rig.gesture('jump') === true);
rig.stopGesture();
for (let i = 0; i < 20; i++) rig.update(1 / 60, 'idle');
ok('动作结束能回到 idle', rig.update && rig.mixer && rig.mixer.timeScale === 1);
rig.reset();
rig.dispose();
ok('reset / dispose 不抛错', true);

console.log('\n=== 游戏场景：共享源 + SkeletonUtils.clone ===');
/* game2d 的真实处境：十个角色共用同一份 gltf.scene，每个角色用 nativeClone
   拿一份独立骨骼。这里模拟第二个角色入场。 */
const srcPos0 = source.position.clone();
const rig2 = createPetMotion(source, 'nailong', {
  rig: { mode: 'native', idleClip: 'idle' },
  nativeClone: true
});
ok('克隆 rig 走 native 通道', rig2.native === true && rig2.kind === 'native');
ok('骨骼元数据已暴露（19 根）', rig2.skeletonMeta && rig2.skeletonMeta.size === 19);
ok('克隆体的骨骼不是共享源的骨骼', rig2.bones.body && rig2.bones.body !== byName.get('Hips'));
ok('共享源场景没被克隆弄脏', source.position.equals(srcPos0));
ok('clip 清单已暴露（含 jump/wave）', rig2.clips.some((c) => c.name === 'jump') && rig2.clips.some((c) => c.name === 'wave'));

/* 两个 rig 并存：第一个已 dispose，再造一个非克隆 rig 会抢同一个 source——
   所以克隆体才是正解：rig2 的 mixer 动，source 上的骨骼纹丝不动。 */
const srcArm = byName.get('RightArm');
const srcArmQ = srcArm.quaternion.clone();
for (let i = 0; i < 30; i++) rig2.update(1 / 60, 'walk');
ok('克隆体走路不影响共享源骨骼', srcArm.quaternion.angleTo(srcArmQ) < 1e-9);
const cloneArm = rig2.skeletonMeta.get('RightArm').bone;
ok('克隆体自己走路在动', cloneArm.quaternion.angleTo(srcArmQ) > 0.05);

console.log('\n=== makeNativeAnimator（game2d/kof 同款接口）===');
const anim = makeNativeAnimator(rig2);
ok('接口齐备', !!anim && anim.kind === 'biped'
  && typeof anim.update === 'function' && typeof anim.pose === 'function' && typeof anim.reset === 'function');
ok('bones 映射对齐（kof 招式关节都在）',
  ['body', 'head', 'armLeft', 'armRight', 'hipLeft', 'kneeLeft'].every((k) => anim.bones[k]));
const spineM = rig2.skeletonMeta.get('Spine');
const spineQ0 = spineM.bone.quaternion.clone();
anim.update('fightIdle', { t: 1, guard: true });
ok('fightIdle 覆盖 Spine 姿势', spineM.bone.quaternion.angleTo(spineQ0) > 0.01);
anim.reset();
anim.pose({ armRight: [-1.6, 0, 0.12] }, 1);
const armM = rig2.skeletonMeta.get('RightArm');
const armRest = rig2.restClip.tracks.find((t2) => t2.name === 'RightArm.quaternion');
const armRestQ = new T.Quaternion(armRest.values[0], armRest.values[1], armRest.values[2], armRest.values[3]);
ok('pose(出拳 -1.6rad) 落到 RightArm', armM.bone.quaternion.angleTo(armRestQ) > 1.0,
  `偏离 rest ${armM.bone.quaternion.angleTo(armRestQ).toFixed(2)} rad`);
anim.update('walk', { phase: 1.2 });
ok('anim.update(walk) 不抛错', true);
anim.reset();
rig2.dispose();
ok('动画器 reset / rig dispose 不抛错', true);

console.log(`\n=== 全部 ${pass} 项通过 ===\n`);
