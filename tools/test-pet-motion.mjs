// 绑骨入口自测：`node tools/test-pet-motion.mjs`
//
// pet-motion.js 决定「一个角色进站之后怎么动」，它同时兼容三种角色：
//   · 老模型（有站点实测 ANATOMY 表）—— 必须逐帧不变；
//   · 新模型（forge 写入 anatomy / 自带骨骼）—— 要站着走，不能当蛋滚；
//   · 声明了 native 的角色 —— 要保留自带骨骼和动画，而不是重新烤一遍顶点。
// 这三种情况在浏览器里要一个个点进去看，在命令行里用积木盒子就能盯住。
//
// 站点没有 package.json（.js 按 CommonJS 解析），所以这里把三个模块 + three 拷到
// 临时目录、补一个 {"type":"module"} 再引入，不改仓库结构。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('..', import.meta.url);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'naj-motion-'));
fs.mkdirSync(path.join(tmp, 'js'), { recursive: true });
const threeURL = new URL('vendor/three/three.module.min.js', root).href;
/* 把 three 的引入换成绝对 file:// 地址，缓存版本参数去掉（node 里没有浏览器缓存） */
for (const name of ['pet-motion.js', 'pet-rig.js', 'pet-laugh.js']) {
  let code = fs.readFileSync(new URL(`js/${name}`, root), 'utf8');
  code = code
    .replace(/from ['"]\.\.\/vendor\/three\/three\.module\.min\.js['"]/g, `from '${threeURL}'`)
    .replace(/from ['"]\.\/(pet-laugh|pet-rig)\.js\?[^'"]*['"]/g, `from './$1.js'`);
  fs.writeFileSync(path.join(tmp, 'js', name), code);
}
fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');

const T = await import(threeURL);
const { createPetMotion } = await import(pathToFileURL(path.join(tmp, 'js', 'pet-motion.js')).href);

let fails = 0;
const note = (ok, label, detail = '') => {
  if (ok) console.log(`ok   ${label}${detail ? ' = ' + detail : ''}`);
  else { fails++; console.log(`FAIL ${label}${detail ? ' → ' + detail : ''}`); }
};

/* 一个 0.5 宽、1.8 高的"人形"盒子场景（站立人形判定靠包围盒比例） */
function boxScene(w, h, d, withSkeleton = false) {
  const scene = new T.Group();
  const geo = new T.BoxGeometry(w, h, d);
  geo.translate(0, h / 2, 0);
  const mesh = new T.Mesh(geo, new T.MeshBasicMaterial());
  scene.add(mesh);
  if (withSkeleton) {
    const hips = new T.Bone(); hips.name = 'mixamorig:Hips'; hips.position.set(0, h * 0.53, 0);
    const spine = new T.Bone(); spine.name = 'mixamorig:Spine'; spine.position.set(0, h * 0.12, 0);
    const armL = new T.Bone(); armL.name = 'mixamorig:LeftArm'; armL.position.set(-w * 0.4, h * 0.13, 0);
    const armR = new T.Bone(); armR.name = 'mixamorig:RightArm'; armR.position.set(w * 0.4, h * 0.13, 0);
    const legL = new T.Bone(); legL.name = 'mixamorig:LeftUpLeg'; legL.position.set(-w * 0.2, -h * 0.01, 0);
    const kneeL = new T.Bone(); kneeL.name = 'mixamorig:LeftLeg'; kneeL.position.set(0, -h * 0.22, 0);
    hips.add(spine); hips.add(armL); hips.add(armR); hips.add(legL); legL.add(kneeL);
    scene.add(hips);
    scene.updateMatrixWorld(true);
    return { scene, mesh, bones: { hips, armL, kneeL } };
  }
  scene.updateMatrixWorld(true);
  return { scene, mesh };
}

/* ---------- 1. 没配置、没骨骼的站立模型：应当按人形绑定，而不是当蛋滚 ---------- */
const plain = boxScene(0.5, 1.8, 0.4);
const rigA = createPetMotion(plain.scene, 'brand-new-face');
const statsA = rigA.stats();
note(statsA.kind === 'biped', '未知站立模型判为 biped', statsA.kind);
note(statsA.anatomyFrom === 'default', '用默认人形比例', statsA.anatomyFrom);
note(!!rigA.bones.armLeft && !!rigA.bones.hipLeft, '程序化骨骼齐备');
note(rigA.bounds.max.y > 1.9 && rigA.bounds.min.y > -0.1, '高度归一化到 2 单位', `${rigA.bounds.min.y.toFixed(2)}~${rigA.bounds.max.y.toFixed(2)}`);

/* ---------- 2. 四足/碗里那种矮胖模型仍然不该被当人形 ---------- */
const wide = boxScene(1.6, 1.0, 1.4);
const rigW = createPetMotion(wide.scene, 'wide-thing');
note(rigW.stats().kind === 'roll', '矮胖模型仍按 roll 处理', rigW.stats().kind);

/* ---------- 3. 老模型的 id 必须保持原样（feidudu=hop / capybara=bowl） ---------- */
const hopRig = createPetMotion(boxScene(1.2, 1.0, 1.0).scene, 'feidudu');
note(hopRig.kind === 'hop', 'feidudu 仍是 hop', hopRig.kind);
const bowlRig = createPetMotion(boxScene(1.2, 1.0, 1.0).scene, 'capybara');
note(bowlRig.kind === 'bowl', 'capybara 仍是 bowl', bowlRig.kind);

/* ---------- 4. 显式传入 anatomy：走 declared ---------- */
const declared = {
  hip: 0.5, knee: 0.25, legX: 0.08, legTop: 0.55, head: 0.82,
  shoulders: [[-0.18, 0.78, 0], [0.18, 0.78, 0]],
  hands: [[-0.26, 0.44, 0], [0.26, 0.44, 0]],
  armRadius: 0.06, armGate: 0.2, armLimit: 0.6, armOut: 0.5
};
const rigD = createPetMotion(boxScene(0.9, 1.8, 0.3).scene, 'declared-guy', { anatomy: declared });
note(rigD.stats().anatomyFrom === 'declared', '使用 entry.anatomy', rigD.stats().anatomyFrom);
note(rigD.armLimit === 0.6, 'armLimit 透传到骨骼上', String(rigD.armLimit));

/* 坏 anatomy 必须被丢弃，回到兜底而不是算出 NaN */
const rigBad = createPetMotion(boxScene(0.5, 1.8, 0.4).scene, 'bad-anatomy-guy', { anatomy: { ...declared, hip: NaN } });
note(rigBad.stats().anatomyFrom !== 'declared', '坏 anatomy 被丢弃', rigBad.stats().anatomyFrom);
note(rigBad.bounds.max.y > 1.9, '坏 anatomy 下模型尺寸仍正常', String(rigBad.bounds.max.y.toFixed(2)));

/* ---------- 5. 原生模式：保留自带骨骼，播 clip，且不重绑顶点 ---------- */
const skinned = boxScene(0.6, 1.8, 0.4, true);
const clip = new T.AnimationClip('idle-local', 1, [
  new T.QuaternionKeyframeTrack('mixamorig:LeftArm.quaternion', [0, 1], [0, 0, 0, 1, 0.1, 0, 0, 0.995])
]);
skinned.scene.userData.clips = [clip];
const nativeRig = createPetMotion(skinned.scene, 'native-guy', { rig: { mode: 'native', kind: 'biped', idleClip: 'idle-local' } });
note(nativeRig.kind === 'native', '原生模式生效', nativeRig.kind);
note(nativeRig.native === true, '标记 native = true');
note(String(nativeRig.clip) === 'idle-local', '选中的 clip', String(nativeRig.clip));
/* 原生模式也给出 bones 字典：装备挂点（gear-visuals）要从这里找骨骼。
   但要保证这些骨只是「被指出来」，update 不会去写它们的旋转——那是 mixer 的活。 */
note(nativeRig.bones.armLeft && nativeRig.bones.armLeft.name, '原生模式暴露 armLeft 供挂件使用', nativeRig.bones.armLeft && nativeRig.bones.armLeft.name);
note(nativeRig.bones.body && nativeRig.bones.body.name, '原生模式暴露 body（胸口挂点）');
note(nativeRig.boneSpace > 0, 'boneSpace 为正数（挂件换算用）', String(nativeRig.boneSpace));
const armBefore = nativeRig.bones.armLeft.quaternion.clone();
nativeRig.update(0.5, 'walk');
const armDelta = Math.abs(armBefore.x - nativeRig.bones.armLeft.quaternion.x) + Math.abs(armBefore.w - nativeRig.bones.armLeft.quaternion.w);
note(armDelta < 1e-6, '行走时程序化姿势没有去掰原生骨骼', armDelta.toExponential(1));
note(!!skinned.bones.hips.parent, '模型自带骨骼仍挂在场景里');
note(nativeRig.bounds.max.y === 2, '原生模式同样归一化到高 2', String(nativeRig.bounds.max.y));
nativeRig.update(0.016, 'walk');
note(nativeRig.time > 0, 'update 推进了时间');
nativeRig.laugh(0.5);
note(Number.isFinite(nativeRig.root.rotation.x) && nativeRig.root.rotation.x !== 0, 'laugh 改变了整体姿态', nativeRig.root.rotation.x.toFixed(3));
nativeRig.update(0.016, 'idle');
note(Math.abs(nativeRig.root.rotation.x) < 1e-6, '下一帧 update 把 laugh 的倾角清掉', nativeRig.root.rotation.x.toFixed(3));
nativeRig.reset();
note(nativeRig.root.rotation.x === 0 && nativeRig.root.position.y === 0, 'reset 归位');

/* ---------- 6. 只含 position 轨道的 clip 应当被丢弃（根位移会把角色拖走） ---------- */
const drifting = boxScene(0.6, 1.8, 0.4, true);
drifting.scene.userData.clips = [new T.AnimationClip('dash', 1, [
  new T.VectorKeyframeTrack('mixamorig:Hips.position', [0, 1], [0, 1, 0, 0, 1, 5])
])];
const driftRig = createPetMotion(drifting.scene, 'drift-guy', { rig: { mode: 'native' } });
note(driftRig.clip === null, '纯根位移 clip 被丢弃', String(driftRig.clip));

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
