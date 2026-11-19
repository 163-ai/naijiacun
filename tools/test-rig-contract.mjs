// 骨骼契约自测：npm 之类一概不需要，直接 `node tools/test-rig-contract.mjs`。
//
// 为什么要在 node 里跑：pet-rig.js 的两个函数（canonicalBone / anatomyFromBones）
// 决定了「新角色进站能不能站着走路」。它们出错时站点不会报错，只会静默地不动，
// 所以在命令行里用一套人造骨架把它盯住，比每次开浏览器点一遍可靠。
//
// 站点没有 package.json（.js 默认按 CommonJS 解析），所以这里把 pet-rig.js 的
// 三行 import 改写成绝对 file:// 地址，落一个临时 .mjs 再动态引入——不改仓库结构。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('..', import.meta.url);
const threeURL = new URL('vendor/three/three.module.min.js', root).href;
const source = fs.readFileSync(new URL('js/pet-rig.js', root), 'utf8')
  .replace('../vendor/three/three.module.min.js', threeURL);
if (!source.includes(threeURL)) throw new Error('pet-rig.js 的 three 引入路径变了，测试脚本需要同步');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'naj-rig-'));
const entry = path.join(tmp, 'pet-rig.mjs');
fs.writeFileSync(entry, source);

const T = await import(threeURL);
const {
  canonicalBone, mapBones, anatomyFromBones, validAnatomy, mergeAnatomy,
  defaultHumanoidAnatomy, humanoidScore
} = await import(pathToFileURL(entry).href);

let fails = 0;
const note = (ok, label, detail = '') => {
  if (ok) console.log(`ok   ${label}${detail ? ' = ' + detail : ''}`);
  else { fails++; console.log(`FAIL ${label}${detail ? ' → ' + detail : ''}`); }
};
const eq = (got, want, label) => note(got === want, label, `${JSON.stringify(got)}`);
const near = (got, want, tol, label) => note(Number.isFinite(got) && Math.abs(got - want) <= tol, label, `${got} (期望 ${want}±${tol})`);

/* ---------- 1. 命名归一：各家导出器的写法都要落到同一个标准名 ---------- */
const cases = [
  ['Hips', 'Hips'], ['hips', 'Hips'], ['bone:hips', 'Hips'], ['mixamorig:Hips', 'Hips'],
  ['Spine', 'Spine'], ['spine_01', 'Spine'], ['Spine1', 'Chest'], ['Chest', 'Chest'],
  ['LeftArm', 'LeftArm'], ['upperArmL', 'LeftArm'],
  ['LeftUpLeg', 'LeftUpLeg'], ['upperLegL', 'LeftUpLeg'], ['thigh_l', 'LeftUpLeg'],
  ['J_Bip_L_UpperArm', 'LeftArm'], ['J_Bip_C_Hips', 'Hips'], ['J_Bip_L_LowerLeg', 'LeftLeg'],
  ['LeftForeArm', 'LeftForeArm'], ['lowerArmL', 'LeftForeArm'], ['LeftHand', 'LeftHand'],
  ['handL', 'LeftHand'], ['RightFoot', 'RightFoot'], ['footR', 'RightFoot'],
  /* 骨架根节点不能当胯：认成 Hips 会让「鞠躬」变成整具模型绕原点翻倒 */
  ['root', null], ['Root', null], ['Bone', null], ['xyz', null], ['', null], [null, null]
];
for (const [input, want] of cases) eq(canonicalBone(input), want, `canonicalBone(${JSON.stringify(input)})`);

/* ---------- 2. 人造骨架：身高 1.8，脚底 y=0，前后左右居中 ---------- */
function buildSkeleton(prefix) {
  const spec = [
    ['Hips', [0, 0.95, 0], null],
    ['Spine', [0, 1.15, 0], 'Hips'],
    ['Chest', [0, 1.30, 0], 'Spine'],
    ['Neck', [0, 1.50, 0], 'Chest'],
    ['Head', [0, 1.62, 0], 'Neck'],
    ['LeftShoulder', [-0.06, 1.45, 0], 'Chest'],
    ['LeftArm', [-0.18, 1.42, 0], 'LeftShoulder'],
    ['LeftForeArm', [-0.22, 1.15, 0], 'LeftArm'],
    ['LeftHand', [-0.24, 0.92, 0], 'LeftForeArm'],
    ['RightShoulder', [0.06, 1.45, 0], 'Chest'],
    ['RightArm', [0.18, 1.42, 0], 'RightShoulder'],
    ['RightForeArm', [0.22, 1.15, 0], 'RightArm'],
    ['RightHand', [0.24, 0.92, 0], 'RightForeArm'],
    ['LeftUpLeg', [-0.09, 0.92, 0], 'Hips'],
    ['LeftLeg', [-0.10, 0.50, 0], 'LeftUpLeg'],
    ['LeftFoot', [-0.10, 0.08, 0], 'LeftLeg'],
    ['RightUpLeg', [0.09, 0.92, 0], 'Hips'],
    ['RightLeg', [0.10, 0.50, 0], 'RightUpLeg'],
    ['RightFoot', [0.10, 0.08, 0], 'RightLeg']
  ];
  const scene = new T.Group();
  const made = {};
  const world = {};
  for (const [name, pos, parent] of spec) {
    const bone = new T.Bone();
    bone.name = prefix + name;
    /* glTF 里骨骼存的是「相对父骨」的偏移，不是世界坐标 */
    const base = parent ? world[parent] : [0, 0, 0];
    bone.position.set(pos[0] - base[0], pos[1] - base[1], pos[2] - base[2]);
    (parent ? made[parent] : scene).add(bone);
    made[name] = bone;
    world[name] = pos;
  }
  scene.updateMatrixWorld(true);
  return scene;
}

const tf = { scale: 2 / 1.8, centerX: 0, centerZ: 0, floorY: 0 };
const skeleton = buildSkeleton('mixamorig:');
const mapped = mapBones(skeleton);
eq(mapped.total, 19, 'mapBones 收集到骨骼数');
eq(Object.keys(mapped.bones).length, 19, '19 根骨骼全部识别');
note(humanoidScore(mapped.bones) >= 6, 'humanoidScore 达到人形门槛', String(humanoidScore(mapped.bones)));

const anatomy = anatomyFromBones(mapped, tf);
note(!!anatomy, 'anatomyFromBones 推导出结果');
if (anatomy) {
  console.log('     anatomy =', JSON.stringify(anatomy));
  eq(validAnatomy(anatomy), true, '推导结果通过校验');
  const H = 1.8;
  near(anatomy.hip, 0.95 / H, 0.01, 'hip ≈ 0.53');
  near(anatomy.knee, 0.50 / H, 0.01, 'knee ≈ 0.28');
  near(anatomy.legX, 0.09 / H, 0.01, 'legX ≈ 0.05');
  near(anatomy.legTop, 0.95 / H + 0.03, 0.02, 'legTop 略高于髋');
  near(anatomy.head, 1.50 / H, 0.02, 'head ≈ 颈根高度');
  near(anatomy.shoulders[0][1], 1.42 / H, 0.01, '左肩高度 ≈ 0.79');
  near(anatomy.hands[0][0], -0.24 / H, 0.01, '左手位置 x ≈ -0.13');
  note(anatomy.shoulders[0][0] < 0 && anatomy.shoulders[1][0] > 0, '左右肩分居两侧');
}

/* ---------- 3. 换一套命名（本地几何绑骨的 bone: 前缀）应得到同一结果 ---------- */
const legacyMap = mapBones(buildSkeleton('bone:'));
eq(!!legacyMap.bones.LeftArm, true, 'bone:LeftArm 能被识别');
const legacyAnatomy = anatomyFromBones(legacyMap, tf);
note(legacyAnatomy && anatomy && legacyAnatomy.hip === anatomy.hip, '两套命名推出同一个 hip');

/* ---------- 4. 坏数据必须被挡住（NaN / 顺序颠倒 / 形状不对） ---------- */
const base = defaultHumanoidAnatomy();
eq(validAnatomy(base), true, '默认人形比例合法');
eq(validAnatomy(null), false, 'null 不合法');
eq(validAnatomy({ ...base, hip: NaN }), false, 'hip=NaN 不合法');
eq(validAnatomy({ ...base, knee: 0.9 }), false, 'knee > hip 不合法');
eq(validAnatomy({ ...base, legTop: 0.2 }), false, 'legTop < hip 不合法');
eq(validAnatomy({ ...base, head: 0.1 }), false, 'head 过低不合法');
eq(validAnatomy({ ...base, shoulders: [[0, 0, 0]] }), false, 'shoulders 形状不对不合法');
const merged = mergeAnatomy(base, {
  hip: 0.5, knee: 0.2, legTop: 0.56, head: 0.8, legX: 'x',
  shoulders: [[-0.2, 0.8, 0], [0.2, 0.8, 0]]
});
eq(merged.legX, base.legX, 'mergeAnatomy 丢弃字符串型 legX');
eq(merged.hip, 0.5, 'mergeAnatomy 接受合法 hip');

/* ---------- 5. 没有骨骼的模型：mapBones 得空表，不能抛错 ---------- */
const empty = mapBones(new T.Group());
eq(empty.total, 0, '无骨骼模型 total = 0');
eq(anatomyFromBones(empty, tf), null, '无骨骼模型推导返回 null');

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
