// 奶家村 · 骨骼命名词汇表
//
// 为什么需要这一层：模型来自混元 / Meshy / Tripo / 本地几何绑骨 / Mixamo / VRM，
// 同一根「左大臂」在各自导出的 GLB 里叫 LeftArm、mixamorig:LeftArm、
// J_Bip_L_UpperArm、upperArmL、Bone_L_UpperArm……如果站点按字面名字找骨骼，
// 换一家生成器就得改一次代码，而且找不到时是静默失败（按钮不报错、模型不动）。
//
// 这里做两件事：
//   1. canonicalBone(name)：把任意来源的名字归一到一张固定的词汇表；
//   2. anatomyFromBones(...)：从模型的真实骨骼位置反推 pet-motion.js 需要的
//      ANATOMY 比例参数，新角色不必再手填 hip/knee/legX/shoulders/hands。
//
// 这一层只读不写：不改模型、不改原有 ANATOMY 表。没有骨骼的静态模型完全不受影响。

import * as T from '../vendor/three/three.module.min.js';

/** 归一化后的标准骨骼名（Mixamo 命名，业界事实标准，各家生成器都认识） */
export const CANONICAL_BONES = [
  'Hips', 'Spine', 'Chest', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot',
  'RightUpLeg', 'RightLeg', 'RightFoot'
];

/**
 * 别名表。键是「压平后」的名字（小写、只留字母数字），值是标准名。
 * 压平规则见 flatten()：LeftArm → leftarm，J_Bip_L_UpperArm → jbip lupperarm
 * → jbip_l_upperarm 去掉下划线后为 jbiplupperarm（前缀会在 stripPrefix 里剥掉）。
 */
const ALIASES = {
  /* root / cog / bip01 看似等于胯，其实是骨架根节点：认成 Hips 会让「鞠躬」
     变成整具模型绕原点翻倒。宁可认不出（按没有骨骼处理），也不能认错。 */
  Hips: ['hips', 'hip', 'pelvis', 'jnthips', 'bip01pelvis'],
  Spine: ['spine', 'spine0', 'spine01', 'spine02', 'lowerback', 'waist', 'abdomen'],
  Chest: ['chest', 'spine1', 'spine2', 'spine3', 'upperchest', 'torso', 'ribcage', 'thorax'],
  Neck: ['neck', 'neck1', 'neckspline'],
  Head: ['head', 'skull', 'headtop', 'headend'],

  LeftShoulder: ['leftshoulder', 'lshoulder', 'shoulderl', 'shoulderleft', 'leftclavicle', 'lclavicle',
    'claviclel', 'clavicleleft', 'leftcollarbone', 'lcollarbone', 'lcollar'],
  LeftArm: ['leftarm', 'larm', 'arml', 'armleft', 'leftupperarm', 'lupperarm', 'upperarml', 'upperarmleft',
    'lupperarml', 'leftarmupper', 'luparm'],
  LeftForeArm: ['leftforearm', 'lforearm', 'forearml', 'forearmleft', 'leftlowerarm', 'llowerarm',
    'lowerarml', 'lowerarmleft', 'leftelbow', 'lelbow'],
  LeftHand: ['lefthand', 'lhand', 'handl', 'handleft', 'leftpalm', 'lpalm', 'leftwrist', 'lwrist'],

  RightShoulder: ['rightshoulder', 'rshoulder', 'shoulderr', 'shoulderright', 'rightclavicle', 'rclavicle',
    'clavicler', 'clavicleright', 'rightcollarbone', 'rcollarbone', 'rcollar'],
  RightArm: ['rightarm', 'rarm', 'armr', 'armright', 'rightupperarm', 'rupperarm', 'upperarmr', 'upperarmright',
    'rupperarmr', 'rightarmupper', 'ruparm'],
  RightForeArm: ['rightforearm', 'rforearm', 'forearmr', 'forearmright', 'rightlowerarm', 'rlowerarm',
    'lowerarmr', 'lowerarmright', 'rightelbow', 'relbow'],
  RightHand: ['righthand', 'rhand', 'handr', 'handright', 'rightpalm', 'rpalm', 'rightwrist', 'rwrist'],

  LeftUpLeg: ['leftupleg', 'lupleg', 'uplegl', 'leftthigh', 'lthigh', 'thighl', 'thighleft',
    'leftupperleg', 'lupperleg', 'upperlegl', 'leftlegupper', 'lefthip', 'lhip', 'hipleft', 'thigh_l'],
  LeftLeg: ['leftleg', 'lleg', 'legl', 'legleft', 'leftshin', 'lshin', 'shinl', 'leftlowerleg', 'llowerleg',
    'lowerlegl', 'leftcalf', 'lcalf', 'calfl', 'leftknee', 'lknee', 'kneeleft'],
  LeftFoot: ['leftfoot', 'lfoot', 'footl', 'footleft', 'leftankle', 'lankle', 'anklel'],

  RightUpLeg: ['rightupleg', 'rupleg', 'uplegr', 'rightthigh', 'rthigh', 'thighr', 'thighright',
    'rightupperleg', 'rupperleg', 'upperlegr', 'rightlegupper', 'righthip', 'rhip', 'hipright'],
  RightLeg: ['rightleg', 'rleg', 'legr', 'legright', 'rightshin', 'rshin', 'shinr', 'rightlowerleg', 'rlowerleg',
    'lowerlegr', 'rightcalf', 'rcalf', 'calfr', 'rightknee', 'rknee', 'kneeright'],
  RightFoot: ['rightfoot', 'rfoot', 'footr', 'footright', 'rightankle', 'rankle', 'ankler']
};

/** 压平：小写 + 只留字母数字，连中文都按删除处理（中文骨骼名靠下面的后缀规则兜底） */
function flatten(name) {
  return String(name == null ? '' : name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** 常见导出器加的前缀，剥掉再查表：mixamorig:LeftArm / Bone_LeftArm / Bip01_Pelvis
    只留「长且不会误伤真名」的几个。像 rig / def / bn 这类两位短前缀会把
    rightArm 剥成 htArm，宁可不认也不能认错。 */
const PREFIXES = ['mixamorig1', 'mixamorig', 'armature', 'bip001', 'bip01', 'bone'];

const LOOKUP = (() => {
  const map = new Map();
  for (const canonical of Object.keys(ALIASES)) {
    for (const alias of ALIASES[canonical]) map.set(flatten(alias), canonical);
  }
  return map;
})();

/** 把任意来源的骨骼名归一到标准名；认不出来返回 null（调用方按「没有这根骨」处理） */
export function canonicalBone(name) {
  let key = flatten(name);
  if (!key) return null;
  if (LOOKUP.has(key)) return LOOKUP.get(key);

  /* 剥前缀：bone:hips → bonehips → hips；J_Bip_L_UpperArm → jbiplupperarm → l upperarm */
  for (const prefix of PREFIXES) {
    const flat = flatten(prefix);
    if (flat && key.startsWith(flat) && key.length > flat.length) {
      const rest = key.slice(flat.length).replace(/^[0-9]+/, '');
      if (LOOKUP.has(rest)) return LOOKUP.get(rest);
      key = rest;
      break;
    }
  }

  /* VRM 的 J_Bip_L_UpperArm 压平后是 jbiplupperarm：先剥 jbip，再看侧别 */
  if (key.startsWith('jbip')) {
    key = key.slice(4);
    /* J_Bip_C_Hips 里的 C = center（脊椎中线），也要剥掉 */
    if (key[0] === 'c' && LOOKUP.has(key.slice(1))) return LOOKUP.get(key.slice(1));
  }
  if (LOOKUP.has(key)) return LOOKUP.get(key);
  const sided = /^(l|r)([a-z]+)$/.exec(key);
  if (sided) {
    const rest = sided[2];
    const flipped = (sided[1] === 'l' ? 'left' : 'right') + rest;
    if (LOOKUP.has(flipped)) return LOOKUP.get(flipped);
    if (LOOKUP.has(rest)) return LOOKUP.get(rest);
  }
  return null;
}

/**
 * 把一个模型里所有骨骼按标准名收集起来（同名只取第一个）。
 * @returns {{ bones: Object<string, any>, raw: Object<string, string|null>, total: number }}
 */
export function mapBones(root) {
  const bones = {}, raw = {};
  let total = 0;
  if (!root || !root.traverse) return { bones, raw, total };
  root.traverse((o) => {
    if (!o.isBone) return;
    total++;
    const canonical = canonicalBone(o.name);
    raw[o.name] = canonical;
    if (canonical && !bones[canonical]) bones[canonical] = o;
  });
  return { bones, raw, total };
}

/** 这套模型够不够「人形」：躯干 + 至少一条手臂或一条腿，才值得按 biped 处理 */
export function humanoidScore(bones) {
  let score = 0;
  if (bones.Hips) score += 2;
  if (bones.Spine || bones.Chest) score += 1;
  if (bones.Neck || bones.Head) score += 1;
  if (bones.LeftArm || bones.RightArm) score += 2;
  if (bones.LeftUpLeg || bones.RightUpLeg) score += 2;
  if (bones.LeftHand || bones.RightHand) score += 1;
  if (bones.LeftFoot || bones.RightFoot) score += 1;
  return score;   // 满值 10
}

export const HUMAN_RIG_THRESHOLD = 6;

/* ---------------- ANATOMY 推导 ---------------- */

const num = (v) => Number.isFinite(v) ? v : null;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** 站点 ANATOMY 的默认人形比例（拿不到实测值时用这个兜底，比「当蛋滚」强） */
export function defaultHumanoidAnatomy() {
  return {
    hip: .48, knee: .25, legX: .09, legTop: .54, head: .80,
    shoulders: [[-.19, .78, 0], [.19, .78, 0]],
    hands: [[-.27, .44, .02], [.27, .44, .02]],
    armRadius: .07, armGate: .20, armLimit: .9, armOut: .8
  };
}

/**
 * 从原生骨骼的实际位置反推 ANATOMY。
 * 参数 tf 是「模型空间 → 站点绑骨空间」的归一化参数（与 pet-motion 保持一致）：
 *   scale   = 2 / 模型高度
 *   centerX / centerZ / floorY  模型空心的中心与地面
 * 返回 null 表示骨骼不足以推导（调用方保留原行为）。
 */
export function anatomyFromBones(map, tf, opts = {}) {
  if (!map || !map.bones || !tf || !map.bones.Hips) return null;
  const bones = map.bones;
  const world = (bone) => bone.getWorldPosition(new T.Vector3());
  const fy = (v) => (v.y - tf.floorY) * tf.scale / 2;
  const fx = (v) => (v.x - tf.centerX) * tf.scale / 2;
  const fz = (v) => (v.z - tf.centerZ) * tf.scale / 2;

  const hipBone = bones.Hips;
  const hip = fy(world(hipBone));
  if (!Number.isFinite(hip) || hip < .05 || hip > .95) return null;

  const kneeBone = bones.LeftLeg || bones.RightLeg;
  const knee = kneeBone ? fy(world(kneeBone)) : hip * .5;
  const upLeg = bones.LeftUpLeg || bones.RightUpLeg || kneeBone;
  const legX = upLeg ? Math.abs(fx(world(upLeg))) : .09;
  const neck = bones.Neck || bones.Chest || bones.Head;
  const headBone = bones.Head;
  const headFromNeck = neck ? fy(world(neck)) : .8;
  const headFromHead = headBone ? fy(world(headBone)) - .04 : headFromNeck;
  /* 站点里 head 是「头部权重起始高度」，取颈根与颅底里更低的那个 */
  const head = clamp(Math.min(headFromNeck, headFromHead), .45, .93);

  const armL = bones.LeftArm, armR = bones.RightArm;
  const handL = bones.LeftHand, handR = bones.RightHand;
  const shoulders = [], hands = [];
  for (const [arm, hand, side] of [[armL, handL, -1], [armR, handR, 1]]) {
    if (arm) {
      const p = world(arm);
      shoulders.push([fx(p), fy(p), fz(p)]);
    } else {
      shoulders.push([side * clamp(legX * 2, .12, .3), clamp((hip + head) / 2 + .06, .3, .9), 0]);
    }
    if (hand) {
      const p = world(hand);
      hands.push([fx(p), fy(p), fz(p)]);
    } else {
      const s = shoulders[shoulders.length - 1];
      hands.push([s[0] * 1.4, Math.max(.15, s[1] - .3), s[2]]);
    }
  }

  /* 手臂「胶囊半径」没法从骨骼本身量出来（那是网格厚度），只能按肩宽估：
     肩越宽 → 手臂越粗。站点实测值正好落在这个比例上（人类 0.13 肩宽 → 0.05，
     奶龙 0.23 → 0.09，实测 0.11，同一量级）。 */
  const armRadius = clamp(Math.max(.045, Math.abs(shoulders[0][0]) * .4), .045, .11);
  const armGate = clamp(Math.abs(shoulders[0][0]) * 1.15, .1, .34);

  const anatomy = {
    hip: +clamp(hip, .1, .85).toFixed(4),
    knee: +clamp(knee, .05, hip - .02).toFixed(4),
    legX: +clamp(legX, .04, .3).toFixed(4),
    legTop: +clamp(hip + Math.max(.03, (hip - knee) * .12), hip + .02, .95).toFixed(4),
    head: +head.toFixed(4),
    shoulders: shoulders.map((s) => s.map((v) => +v.toFixed(4))),
    hands: hands.map((s) => s.map((v) => +v.toFixed(4))),
    armRadius: +armRadius.toFixed(4),
    armGate: +armGate.toFixed(4),
    /* 几何绑骨的权重是按胶囊门控算的，肩根仍有一圈过渡顶点：给一个保守上限，
       由 forge 的 anatomy 覆盖（有实测值就以实测为准）。 */
    armLimit: num(opts.armLimit) ?? .9,
    armOut: num(opts.armOut) ?? .8
  };
  return validAnatomy(anatomy) ? anatomy : null;
}

/**
 * 校验（并轻度修正）一份 ANATOMY。
 * forge 写进 js/3d-rig.js 的数据来自另一侧、可能被手改，坏值必须在这里挡住：
 * 一个 NaN 传进权重计算会让整只模型缩成一个点，而且不报错。
 */
export function validAnatomy(input) {
  if (!input || typeof input !== 'object') return false;
  const need = ['hip', 'knee', 'legX', 'legTop', 'head'];
  for (const key of need) if (!Number.isFinite(input[key])) return false;
  if (!(input.hip > 0 && input.hip < 1)) return false;
  if (!(input.knee > 0 && input.knee < input.hip)) return false;
  if (!(input.legTop > input.hip && input.legTop <= 1)) return false;
  if (!(input.head > .3 && input.head <= 1)) return false;
  if (!(input.legX >= 0 && input.legX < .6)) return false;
  for (const key of ['shoulders', 'hands']) {
    const pair = input[key];
    if (!Array.isArray(pair) || pair.length !== 2) return false;
    for (const point of pair) {
      if (!Array.isArray(point) || point.length !== 3) return false;
      if (!point.every((v) => Number.isFinite(v))) return false;
    }
  }
  return true;
}

/** 合并：默认人形 → forge/实测值，只接受通过校验的字段 */
export function mergeAnatomy(base, extra) {
  const out = { ...base };
  if (!extra) return out;
  for (const key of ['hip', 'knee', 'legX', 'legTop', 'head', 'armRadius', 'armGate', 'armLimit', 'armOut']) {
    if (Number.isFinite(extra[key])) out[key] = extra[key];
  }
  for (const key of ['shoulders', 'hands']) {
    const pair = extra[key];
    if (Array.isArray(pair) && pair.length === 2 && pair.every((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite))) {
      out[key] = pair;
    }
  }
  if (extra.wings === true) out.wings = true;
  return validAnatomy(out) ? out : base;
}

const KIND_VALUES = ['biped', 'hop', 'bowl', 'roll'];
export const isRigKind = (v) => KIND_VALUES.includes(v);
