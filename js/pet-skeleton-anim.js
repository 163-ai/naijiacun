/**
 * pet-skeleton-anim.js —— 19 根标准骨的「分段动作库」
 *
 * 解决的问题：GLB 里只有一段 2 秒 idle，站点的走/跑/挥手/大笑全靠根节点整体
 * 平移旋转（老一套），看起来像整块模型在晃，不像角色在动。这里在运行时按骨骼
 * 名生成多套 AnimationClip，交给 AnimationMixer，动作就真的由骨骼层级驱动。
 *
 * 为什么「分段」能顺带缓解肩根拉扯：
 *   · 老程序化绑骨只有 1 根 armLeft/armRight，抬手 2.5rad 全压在肩根一个关节上，
 *     肩根那圈过渡顶点必然被拉成尖片；
 *   · 真骨架有 Shoulder / Arm / ForeArm / Hand 四段，把 1.3rad 拆成
 *     0.24 + 0.50 + 0.55 三段，肩根只承受 0.74rad，其余落在「纯手臂」区域
 *     （那里没有躯干↔手臂的过渡顶点），形变自然小得多。
 *
 * 轴向处理（关键，别改）：
 *   每根骨的 rest quaternion 都不一样（LeftUpLeg 甚至是绕 X 翻 180°），直接写
 *   rotation.x 会完全错。这里先取 rest 时父骨的世界旋转 qParent，把「世界轴旋转」
 *   共轭变换进父骨局部空间：delta = qParent⁻¹ · qAxis · qParent，再左乘到 rest 上。
 *   于是只要站点约定「Y 朝上、面朝 +Z、高 2 单位」成立，所有模型动作方向一致，
 *   与导出器给骨骼的初始朝向无关。
 *
 * 返回：{ clips, restClip, boneNames, count }
 *   clips —— 绝对 local quaternion 的 AnimationClip，可直接 crossFade 当 base
 *   restClip —— 全骨恒定 rest 的 clip，给 makeClipAdditive 当参考（叠加手势用）
 *
 * 依赖：../vendor/three/three.module.min.js（与站点同版本 0.180）
 */
import * as T from '../vendor/three/three.module.min.js';

/* 站点归一化后的世界轴：Y 上、X 左右、Z 前后（面朝 +Z） */
const AX_X = new T.Vector3(1, 0, 0);
const AX_Y = new T.Vector3(0, 1, 0);
const AX_Z = new T.Vector3(0, 0, 1);
const rX = (a) => [AX_X, a];
const rY = (a) => [AX_Y, a];
const rZ = (a) => [AX_Z, a];

const TAU = Math.PI * 2;

/**
 * 动作表。pose(u) 里 u 是 0..1 的归一化相位，返回 { 骨名: [[轴, 弧度], ...] }。
 * 未列出的骨骼自动保持 rest（每根骨都会生成一条轨道，crossFade 才干净）。
 * 循环动作要求 pose(0) === pose(1)，所以只用 sin/cos(TAU*u) 这类周期函数。
 */
const ACTIONS = {
  walk: {
    duration: 0.9, loop: true, frames: 24,
    pose(u) {
      const p = u * TAU, s = Math.sin(p), c = Math.cos(p);
      return {
        Hips: [rY(0.03 * s)],
        Spine: [rY(0.045 * s), rX(0.02 * c)],
        Chest: [rY(-0.03 * s)],
        Head: [rY(-0.02 * s)],
        LeftUpLeg: [rX(0.52 * s)], RightUpLeg: [rX(-0.52 * s)],
        LeftLeg: [rX(0.42 * Math.max(0, -s))], RightLeg: [rX(0.42 * Math.max(0, s))],
        LeftFoot: [rX(-0.18 * s)], RightFoot: [rX(0.18 * s)],
        LeftArm: [rX(-0.34 * s), rZ(-0.06)], RightArm: [rX(0.34 * s), rZ(0.06)],
        LeftForeArm: [rX(-0.12 * Math.max(0, -s))], RightForeArm: [rX(-0.12 * Math.max(0, s))],
      };
    }
  },
  run: {
    duration: 0.56, loop: true, frames: 24,
    pose(u) {
      const p = u * TAU, s = Math.sin(p), c = Math.cos(p);
      return {
        Hips: [rY(0.05 * s), rX(0.06)],
        Spine: [rY(0.07 * s), rX(0.14 + 0.02 * c)],
        Chest: [rY(-0.05 * s), rX(0.04)],
        Head: [rY(-0.03 * s), rX(-0.08)],
        LeftUpLeg: [rX(0.88 * s)], RightUpLeg: [rX(-0.88 * s)],
        LeftLeg: [rX(0.72 * Math.max(0, -s))], RightLeg: [rX(0.72 * Math.max(0, s))],
        LeftFoot: [rX(-0.26 * s)], RightFoot: [rX(0.26 * s)],
        LeftShoulder: [rZ(-0.08)], RightShoulder: [rZ(0.08)],
        LeftArm: [rX(-0.58 * s), rZ(-0.12)], RightArm: [rX(0.58 * s), rZ(0.12)],
        LeftForeArm: [rZ(-0.42)], RightForeArm: [rZ(0.42)],
      };
    }
  },
  /* 挥手：肩根只吃 0.24+0.50，大幅上举交给前臂和手 */
  wave: {
    duration: 1.8, loop: true, frames: 32,
    pose(u) {
      const p = u * TAU, w = Math.sin(p * 4) * 0.22;
      return {
        Spine: [rY(-0.05)],
        Head: [rY(-0.14), rX(0.04)],
        RightShoulder: [rZ(0.24)],
        RightArm: [rZ(0.50)],
        RightForeArm: [rZ(0.55), rY(w)],
        RightHand: [rY(0.28 + w), rZ(0.16)],
        LeftShoulder: [rZ(-0.10)],
        LeftArm: [rZ(-0.14)],
        LeftForeArm: [rZ(-0.10)],
      };
    }
  },
  laugh: {
    duration: 1.6, loop: true, frames: 24,
    pose(u) {
      const p = u * TAU, s = Math.sin(p), a = Math.abs(s);
      return {
        Hips: [rX(-0.05 * a)],
        Spine: [rX(-0.20 * a)],
        Chest: [rX(-0.10 * a)],
        Neck: [rX(0.08 * a)],
        Head: [rX(0.12 * a), rY(0.09 * s)],
        LeftShoulder: [rZ(-0.18 * a)], RightShoulder: [rZ(0.18 * a)],
        LeftArm: [rZ(-0.22 * a)], RightArm: [rZ(0.22 * a)],
        LeftForeArm: [rZ(-0.25 * a)], RightForeArm: [rZ(0.25 * a)],
      };
    }
  },
  jump: {
    duration: 0.9, loop: false, frames: 20,
    pose(u) {
      const crouch = u < 0.22 ? 1 - u / 0.22 : (u > 0.78 ? (u - 0.78) / 0.22 : 0);
      const air = Math.max(0, Math.min(1, (u - 0.22) / 0.22));
      const up = Math.sin(air * Math.PI);
      return {
        Hips: [rX(0.10 * crouch)],
        Spine: [rX(-0.06 * up)],
        LeftUpLeg: [rX(0.55 * crouch - 0.12 * up)], RightUpLeg: [rX(0.55 * crouch - 0.12 * up)],
        LeftLeg: [rX(0.90 * crouch)], RightLeg: [rX(0.90 * crouch)],
        LeftShoulder: [rZ(-0.20 * up)], RightShoulder: [rZ(0.20 * up)],
        LeftArm: [rZ(-0.45 * up)], RightArm: [rZ(0.45 * up)],
        LeftForeArm: [rZ(-0.30 * up)], RightForeArm: [rZ(0.30 * up)],
        Head: [rX(-0.10 * up)],
      };
    }
  },
  sleep: {
    duration: 3.0, loop: true, frames: 24,
    pose(u) {
      const br = Math.sin(u * TAU) * 0.025;
      return {
        Spine: [rX(0.24 + br)], Chest: [rX(0.10)],
        Neck: [rX(0.22)], Head: [rX(0.28), rY(0.10)],
        LeftArm: [rZ(-0.10)], RightArm: [rZ(0.10)],
        LeftForeArm: [rZ(-0.12)], RightForeArm: [rZ(0.12)],
        LeftUpLeg: [rX(0.12)], RightUpLeg: [rX(0.12)],
      };
    }
  },
  nod: {
    duration: 1.0, loop: true, frames: 16,
    pose(u) {
      const s = Math.sin(u * TAU);
      return { Neck: [rX(0.22 * s)], Head: [rX(0.12 * s)] };
    }
  },
  angry: {
    duration: 1.2, loop: true, frames: 20,
    pose(u) {
      const s = Math.sin(u * TAU) * 0.04;
      return {
        Spine: [rY(s)], Chest: [rX(-0.10)], Head: [rX(0.12)],
        LeftShoulder: [rZ(-0.16)], RightShoulder: [rZ(0.16)],
        LeftArm: [rZ(-0.28)], RightArm: [rZ(0.28)],
        LeftForeArm: [rZ(-0.30)], RightForeArm: [rZ(0.30)],
      };
    }
  },
  dragged: {
    duration: 1.0, loop: true, frames: 20,
    pose(u) {
      const s = Math.sin(u * TAU);
      return {
        Spine: [rX(-0.06)], Head: [rX(-0.12)],
        LeftShoulder: [rZ(-0.22)], RightShoulder: [rZ(0.22)],
        LeftArm: [rZ(-0.38)], RightArm: [rZ(0.38)],
        LeftForeArm: [rZ(-0.22)], RightForeArm: [rZ(0.22)],
        LeftUpLeg: [rX(0.14 + 0.06 * s)], RightUpLeg: [rX(-0.14 - 0.06 * s)],
        LeftLeg: [rX(0.22)], RightLeg: [rX(0.22)],
      };
    }
  },
};

/** 把一组「世界轴旋转」叠加到某根骨的 rest local quaternion 上 */
function poseQuat(meta, rotations) {
  if (!rotations || !rotations.length) return meta.rest;
  const q = meta.rest.clone();
  for (const [axis, angle] of rotations) {
    if (!angle) continue;
    const qAxis = new T.Quaternion().setFromAxisAngle(axis, angle);
    const delta = new T.Quaternion()
      .copy(meta.parentWorld).invert()
      .multiply(qAxis)
      .multiply(meta.parentWorld);
    q.premultiply(delta);
  }
  return q;
}

/**
 * 扫描骨骼树，生成全部动作 clip。
 * @param {THREE.Object3D} root 包含 Bone 的节点（gltf.scene 即可）
 * @param {{ skip?: string[] }} [opts] 不想生成的动作名
 */
export function buildSkeletonClips(root, opts = {}) {
  root.updateMatrixWorld(true);
  const meta = new Map();
  root.traverse((o) => {
    if (!o.isBone || meta.has(o.name)) return;
    const parentWorld = o.parent
      ? o.parent.getWorldQuaternion(new T.Quaternion())
      : new T.Quaternion();
    meta.set(o.name, { bone: o, rest: o.quaternion.clone(), parentWorld });
  });
  const boneNames = [...meta.keys()];
  if (!boneNames.length) return { clips: [], restClip: null, boneNames, count: 0 };

  const skip = new Set(opts.skip || []);
  const clips = [];
  for (const [name, def] of Object.entries(ACTIONS)) {
    if (skip.has(name)) continue;
    const n = def.frames;
    const times = new Float32Array(n + 1);
    for (let i = 0; i <= n; i++) times[i] = (i / n) * def.duration;
    const tracks = [];
    for (const [boneName, m] of meta) {
      const values = new Float32Array((n + 1) * 4);
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const q = poseQuat(m, def.pose(u)[boneName]);
        values[i * 4] = q.x; values[i * 4 + 1] = q.y;
        values[i * 4 + 2] = q.z; values[i * 4 + 3] = q.w;
      }
      tracks.push(new T.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, values));
    }
    const clip = new T.AnimationClip(name, def.duration, tracks);
    clip.userData = { loop: def.loop, generated: true };
    clips.push(clip);
  }

  /* 全骨恒定 rest：给 makeClipAdditive 当参考，可把手势叠在走路之上 */
  const restValues = new Float32Array(8);
  const restTimes = new Float32Array([0, 1]);
  const restTracks = [];
  for (const [boneName, m] of meta) {
    const q = m.rest;
    restValues.set([q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w]);
    restTracks.push(new T.QuaternionKeyframeTrack(`${boneName}.quaternion`, restTimes, restValues.slice()));
  }
  const restClip = new T.AnimationClip('__rest', 1, restTracks);

  /* meta 一并交出去：rest / parentWorld 都是在 mixer 生效前抓的，是唯一可靠的
     「静止姿势」快照。makeNativeAnimator 靠它把战斗姿势写回原生骨。 */
  return { clips, restClip, boneNames, count: boneNames.length, meta };
}

/** 把绝对姿势 clip 转成相对 rest 的增量，供 AdditiveAnimationBlending 叠加 */
export function asAdditive(clip, restClip) {
  const reference = restClip.clone();
  const out = T.AnimationUtils.makeClipAdditive(clip.clone(), 0, reference, 30);
  out.name = clip.name + '::additive';
  return out;
}

/* ============ native 骨架的游戏动画适配层 ============
 * 游戏（game2d / kof）一直通过 creature.makeAnimator 的同款接口驱动角色：
 *   anim.update('walk' | 'idle' | 'fightIdle' | 'hurt' | ...), anim.reset(), anim.pose(targets, blend)
 * 那套接口是按「程序化绑骨无 rest、直接写欧拉角」设计的；原生 19 骨每根的 rest
 * quaternion 都不一样，直接写 rotation 毫无意义。这里实现同一接口的 native 版：
 *   · 基础动作（idle/walk/run/wave/jump/sleep/nod/laugh/angry/dragged）
 *       → 交给 rig 自身的 crossFade 机制播分段 clip（真骨骼驱动，动作最生动）；
 *   · 战斗姿势（fightIdle / hurt / 招式 pose）
 *       → 保持 base clip 继续播（比如 idle 呼吸），每帧用 poseQuat 把「世界轴角」
 *         共轭进每根骨的局部空间直接写 quaternion，覆盖 clip 的对应骨骼。
 *     mixer 每帧会把 clip 姿势重写回来，所以姿势层是「写上去、下一帧重写」，
 *     不需要手动清理，天然无残留。
 */

/* 战斗姿势（19 骨标准名，世界轴欧拉 [x,y,z] 弧度，与 kof 的 targets 同格式）。
 * 数值参考 creature.js 的 biped 手感重新标定：腿摆幅度与 ACTIONS.walk 同量级
 * （±0.12~0.22），抬臂防在胸前 0.5rad 左右——真骨架是分段骨，这个幅度安全，
 * 也和程序化版的战斗姿态看着一致。 */
function fightIdlePose(u, guard) {
  const s = Math.sin(u * 3.1);
  const p = {
    Spine: [0.06 + s * 0.01, 0, 0], Head: [-0.05, 0, 0],
    LeftUpLeg: [-0.12 + s * 0.015, 0, 0], RightUpLeg: [0.10, 0, 0],
    LeftLeg: [0.20, 0, 0], RightLeg: [-0.05, 0, 0],
    LeftShoulder: [0, 0, -0.08], RightShoulder: [0, 0, 0.08],
  };
  if (guard) {
    p.LeftArm = [-0.50 + s * 0.05, 0, -0.16];
    p.RightArm = [-0.42 + s * 0.06, 0, 0.16];
    p.LeftForeArm = [-0.42, 0, 0];
    p.RightForeArm = [-0.38, 0, 0];
  }
  return p;
}
function hurtPose(k) {
  const e = Math.max(0, 1 - k);
  return {
    Spine: [-0.26 * e, 0, 0], Head: [-0.28 * e, 0, 0],
    LeftArm: [-0.50 * e, 0, -0.18 * e], RightArm: [-0.50 * e, 0, 0.18 * e],
    LeftForeArm: [-0.30 * e, 0, 0], RightForeArm: [-0.30 * e, 0, 0],
  };
}

/**
 * 与 creature.makeAnimator 同接口的 native 骨架动画器。
 * @param {object} rig createPetMotion 返回的 native rig（需 skeletonMeta 与 bones）
 */
export function makeNativeAnimator(rig) {
  const meta = rig && rig.skeletonMeta;
  const canon = rig && rig.bones;
  if (!meta || !meta.size || !canon || !canon.body) return null;

  /* canonical 名（kof/game2d 用）→ 元数据。同一 native 骨可能映射到多个 canonical 键
     （armLeft 可能是 LeftArm 或 LeftForeArm），逐键反查。 */
  const byCanon = new Map();
  for (const key of Object.keys(canon)) {
    for (const [name, m] of meta) {
      if (m.bone === canon[key]) { byCanon.set(key, m); break; }
    }
  }
  if (!byCanon.has('body')) return null;

  /* 姿势应用：世界轴欧拉 [x,y,z] → rest 基础上的局部四元数，再与当前姿势混合 */
  const applyEuler = (m, tgt, blend) => {
    const qTarget = poseQuat(m, [rX(tgt[0] || 0), rY(tgt[1] || 0), rZ(tgt[2] || 0)]);
    if (blend >= 1) m.bone.quaternion.copy(qTarget);
    else m.bone.quaternion.slerp(qTarget, blend);
  };
  let lastT = -1;
  /* 手势防重入：gesture 每帧调用会把 clip 时间清零、动作永远停在第 0 帧。
     记住当前手势，只在该换的时候 crossFade。 */
  let curGesture = null;
  const gestureOnce = (name, fade) => {
    if (curGesture !== name) { rig.gesture(name, { fade: fade == null ? 0.12 : fade }); curGesture = name; }
  };

  return {
    kind: 'biped',
    bones: canon,
    update(motion, opt = {}) {
      const t = typeof opt.t === 'number' ? opt.t : 0;
      const dt = lastT >= 0 && t > lastT ? Math.min(t - lastT, 0.1) : (opt.dt != null ? opt.dt : 1 / 60);
      lastT = t;
      try {
        switch (motion) {
          /* 战斗系列：base 保持 idle（呼吸还在），姿势层逐帧覆盖 */
          case 'fightIdle':
            rig.update(dt, 'idle');
            {
              const p = fightIdlePose(t, opt.guard !== false);
              for (const name in p) { const m = meta.get(name); if (m) applyEuler(m, p[name], 1); }
            }
            break;
          case 'hurt':
            rig.update(dt, 'idle');
            {
              const p = hurtPose(opt.k ?? 0);
              for (const name in p) { const m = meta.get(name); if (m) applyEuler(m, p[name], 1); }
            }
            break;
          /* 招式/待机走 rig 自身的 clip 机制（crossFade 到分段动作） */
          case 'walk': case 'run': case 'dragged':
            curGesture = null;
            rig.update(dt, motion);
            break;
          case 'wave': case 'sleep': case 'nod': case 'angry': case 'laugh':
            gestureOnce(motion);
            if (rig.mixer) rig.mixer.update(dt);   // 推进 clip，绕过 rig.update 的 base 强制逻辑
            break;
          /* 跳跃按进度定位：game2d 传 k（0 起跳 → 1 落地），clip 帧跟 k 走而不是循环 */
          case 'jump': {
            gestureOnce('jump', 0.08);
            const clip = rig.clips && rig.mixer ? rig.clips.find((c) => c.name === 'jump') : null;
            if (clip && rig.mixer) {
              rig.mixer.clipAction(clip).time = (opt.k == null ? 0 : opt.k) * (clip.duration || 0.6);
              rig.mixer.update(0);                 // 只采样不推进
            }
            break;
          }
          default:
            curGesture = null;
            rig.update(dt, 'idle');
        }
      } catch (e) { /* 某个关节缺失就少动一下，不能把游戏循环带崩 */ }
    },
    /* 回 idle：mixer 每帧重写 clip 姿势，战斗姿势自然消失，无需手动清骨骼 */
    reset() { rig.reset(); },
    /* 招式目标角逐帧混合：targets 是 { canonicalName: [x,y,z] }（世界轴弧度） */
    pose(targets, blend) {
      if (!targets) return;
      try {
        for (const key in targets) {
          const m = byCanon.get(key);
          if (m) applyEuler(m, targets[key], blend == null ? 1 : blend);
        }
      } catch (e) { /* 同上，姿势失败不拖垮战斗 */ }
    }
  };
}

export const ACTION_NAMES = Object.keys(ACTIONS);
export default buildSkeletonClips;
