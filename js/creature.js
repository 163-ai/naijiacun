// 奶家村 · 大冒险 —— 游戏内角色动画驱动
// 模型都是单网格静态 GLB，骨骼由 pet-motion.js 的 createPetMotion 程序化绑出来
// （展台和桌宠同一条管线）。这里按骨骼名找关节，驱动走路 / 待机 / 战斗姿势。
// 坐标约定：模型高 2 个单位（ bones 的 position 都在这个空间里），面朝 +Z。

// 从克隆体里收集骨骼并记录静止位。失败（没绑上骨骼）返回 null。
export function makeAnimator(root) {
  const bones = {};
  root.traverse(o => { if (o.isBone && !bones[o.name]) bones[o.name] = o; });
  if (!bones.body) return null;
  const rest = [];
  for (const n in bones) rest.push([bones[n], bones[n].position.clone(), bones[n].rotation.clone()]);
  const kind = bones.hipLeft ? "biped" : bones.footLeft ? "hop" : bones.pawLeft ? "bowl" : "roll";

  // 手臂安全钳制：单网格模型的手臂与躯干连成一体，肩根有一圈共享顶点。
  // 绕肩转过一个上限（各模型在 pet-motion.js 的 armLimit 里实测标定）后，
  // 这圈顶点就被拽离身体、翻折成尖片——这正是挥手/出拳穿模的根因。
  // 乘法缩放（旧 armSwing）治标不治本：wavePose 给 -2.5rad，乘 0.3 仍有 -0.75rad，
  // 且玩家角色 nailongStand 曾漏配系数而完全不收敛。改成逐骨「硬性钳制绝对角度」，
  // 任何动画姿势（挥手/出拳/受伤/跳）应用后都压回安全范围，从骨架层根治。
  const ARM_BONES = [bones.armLeft, bones.armRight, bones.pawLeft, bones.pawRight]
    .filter(Boolean).map(b => ({ bone: b, limit: b.userData && b.userData.armLimit != null ? b.userData.armLimit : 2.6 }));
  const clamp = (v, lim) => v < -lim ? -lim : v > lim ? lim : v;
  // 贴身短臂的三轴安全上限不一样，关键是「外展」与「内收」方向相反：
  //   · x（前后摆）与 y：仍收紧到 armLimit（~0.42），抡大了会把手臂从身侧撕开
  //   · z：外展（远离身体）是安全方向，可放宽到 ~0.65 —— 这正是自然的挥手方向；
  //        内收（压向胸腹）危险，仍收紧到 armLimit 的一半
  // 左右手镜像：右臂 z 正=外展，左臂 z 负=外展。
  const armSide = b => (b.name === "armLeft" || b.name === "pawLeft") ? -1 : 1;
  const armOutLimit = b => (b.userData && b.userData.armOut != null) ? b.userData.armOut : Math.min(.68, b.userData.armLimit * 1.1);
  function clampArm(b, limit) {
    if (limit >= 2.6) return;                       // 手臂独立的模型不限制
    b.rotation.x = clamp(b.rotation.x, limit);
    b.rotation.y = clamp(b.rotation.y, limit);
    const side = armSide(b);
    const outward = b.rotation.z * side;            // >0 = 外展（安全），<0 = 内收（危险）
    const outLimit = armOutLimit(b);
    const z = outward > 0 ? Math.min(outward, outLimit) : Math.max(outward, -limit * .5);
    b.rotation.z = z * side;
  }
  function scaleArms() {
    for (const { bone, limit } of ARM_BONES) clampArm(bone, limit);
  }

  function reset() {
    for (const [b, p, r] of rest) { b.position.copy(p); b.rotation.copy(r); }
  }

  /* ---- 待机：呼吸 + 手臂轻晃，别站得像根桩子 ---- */
  function idle(t) {
    const s = Math.sin(t * 2.1);
    if (kind === "biped") {
      bones.body.position.y += s * .012;
      bones.head.rotation.x = s * .03;
      if (bones.armLeft) {
        bones.armLeft.rotation.z = .05 + s * .035;
        bones.armRight.rotation.z = -.05 - s * .035;
      }
    } else {
      if (bones.head) bones.head.rotation.y = s * .06;
    }
  }

  /* ---- 走路：腿摆 + 屈膝 + 反向摆臂。phase 由位移推进，和脚步颠簸同步 ---- */
  function walk(phase) {
    if (kind === "biped") {
      const step = Math.sin(phase), step2 = Math.sin(phase * 2);
      const amp = .5;
      bones.hipLeft.rotation.x = step * amp;
      bones.hipRight.rotation.x = -step * amp;
      // 膝盖只往后弯，摆到后侧才屈
      bones.kneeLeft.rotation.x = Math.max(0, -step) * .75;
      bones.kneeRight.rotation.x = Math.max(0, step) * .75;
      if (bones.armLeft) {
        // 摆臂收敛到 ~0.17 rad：贴身的自然小幅摆动，不再是大幅度抡胳膊
        bones.armLeft.rotation.x = -step * .17;
        bones.armRight.rotation.x = step * .17;
      }
      bones.head.rotation.y = step * .04;
      bones.body.rotation.y = step * .03;
      bones.body.rotation.z = step2 * .015;
    } else if (kind === "hop") {
      const step = Math.sin(phase);
      bones.footLeft.rotation.x = bones.footRight.rotation.x = -.32 * step;
      bones.armLeft.rotation.x = bones.armRight.rotation.x = .24 * step;
      bones.head.rotation.x = -.05 * step;
    } else if (kind === "bowl") {
      const step = Math.sin(phase);
      bones.head.rotation.y = step * .1;
      bones.head.rotation.x = Math.cos(phase) * .04;
      bones.pawLeft.rotation.x = step * .18;
      bones.pawRight.rotation.x = -step * .18;
    }
    // roll（蛋形）没有关节，靠根节点的颠簸就够了
  }

  /* ---- 战斗待机：微微下蹲，双手抬在胸前 ---- */
  function fightIdle(t, guard) {
    const s = Math.sin(t * 3.1);
    if (kind === "biped") {
      bones.hipLeft.rotation.x = -.12 + s * .015;
      bones.hipRight.rotation.x = .1;
      bones.kneeLeft.rotation.x = .22;
      bones.kneeRight.rotation.x = -.06;
      bones.body.rotation.x = .07 + s * .01;
      bones.head.rotation.x = -.06;
      if (guard) {
        // 垂臂几何：z 外八（右正左负），幅度小——垂臂一摆就横穿身体
        bones.armLeft.rotation.x = -.85 + s * .05;
        bones.armLeft.rotation.z = -.22;
        bones.armRight.rotation.x = -.7 + s * .06;
        bones.armRight.rotation.z = .22;
      }
    } else if (kind === "bowl") {
      bones.pawLeft.rotation.x = -.5 + s * .05;
      bones.pawRight.rotation.x = -.5 + s * .05;
      bones.body.rotation.x = .06;
    } else if (kind === "hop") {
      bones.armLeft.rotation.x = bones.armRight.rotation.x = -.6 + s * .05;
    }
  }

  /* ---- 攻击：k 传 0~1 的招式进度，pose 是 kof.js 里按招式算好的目标关节角 ----
     targets: { armRight: [x,y,z], armLeft: [...], body: [...], head: [...], hips... }
     值是弧度；骨骼按名字应用，缺骨骼的角色自动跳过。 */
  function pose(targets, blend) {
    for (const name in targets) {
      const b = bones[name];
      if (!b) continue;
      const tgt = targets[name];
      const entry = ARM_BONES.find(a => a.bone === b);
      if (entry && entry.limit < 2.6) {
        // 贴身短臂：目标角先按分轴安全上限钳制（外展可大、内收/前摆收紧），再混合。
        const lim = entry.limit, side = armSide(b), outLimit = armOutLimit(b);
        const tz0 = clamp(tgt[0], lim), tz1 = clamp(tgt[1], lim);
        const outward = tgt[2] * side;
        const tz2 = (outward > 0 ? Math.min(outward, outLimit) : Math.max(outward, -lim * .5)) * side;
        b.rotation.x += (tz0 - b.rotation.x) * blend;
        b.rotation.y += (tz1 - b.rotation.y) * blend;
        b.rotation.z += (tz2 - b.rotation.z) * blend;
      } else {
        b.rotation.x += (tgt[0] - b.rotation.x) * blend;
        b.rotation.y += (tgt[1] - b.rotation.y) * blend;
        b.rotation.z += (tgt[2] - b.rotation.z) * blend;
      }
    }
  }

  /* ---- 挨打：上半身后仰缩一下 ---- */
  function hurt(k) {
    if (kind === "biped") {
      bones.body.rotation.x = -.28 * (1 - k);
      bones.head.rotation.x = -.3 * (1 - k);
      bones.armLeft.rotation.x = -.9 * (1 - k);
      bones.armRight.rotation.x = -.9 * (1 - k);
    } else if (bones.head) {
      bones.head.rotation.x = -.3 * (1 - k);
    }
  }

  /* ---- 睡觉：全身放松摊平（躺平的旋转由根节点做，这里只把手脚摆自然） ---- */
  function sleepPose() {
    if (kind === "biped") {
      bones.armLeft.rotation.z = .35;
      bones.armRight.rotation.z = -.35;
      bones.armLeft.rotation.x = bones.armRight.rotation.x = .12;
    }
  }

  /* ---- 跳跃：收腿、抬手、身体前倾一点。k=0 起跳上升，k=1 接近落地 ---- */
  function jumpPose(k = 0) {
    const tuck = 1 - k;   // 上升时收得紧，落地时放开
    if (kind === "biped") {
      bones.hipLeft.rotation.x = -.55 * tuck;
      bones.hipRight.rotation.x = -.42 * tuck;
      bones.kneeLeft.rotation.x = .95 * tuck;
      bones.kneeRight.rotation.x = .8 * tuck;
      bones.armLeft.rotation.x = .9 * tuck;
      bones.armRight.rotation.x = .9 * tuck;
      bones.armLeft.rotation.z = -.28 * tuck;
      bones.armRight.rotation.z = .28 * tuck;
      bones.body.rotation.x = .14 * tuck;
      bones.head.rotation.x = -.08 * tuck;
    } else if (bones.footLeft) {
      bones.footLeft.rotation.x = -.5 * tuck;
      bones.footRight.rotation.x = -.5 * tuck;
      bones.armLeft.rotation.x = bones.armRight.rotation.x = .7 * tuck;
    } else if (bones.pawLeft) {
      bones.pawLeft.rotation.x = -.6 * tuck;
      bones.pawRight.rotation.x = -.6 * tuck;
      bones.head.rotation.x = -.12 * tuck;
    } else if (bones.head) {
      bones.head.rotation.x = -.1 * tuck;
    }
  }


  /* ---- 打招呼：举一只手来回挥，身子微微侧倾，像老朋友碰面 ---- */
  function wavePose(t = 0) {
    const w = Math.sin(t * 9);
    if (kind === "biped") {
      const ar = bones.armRight, lim = ar.userData && ar.userData.armLimit != null ? ar.userData.armLimit : 2.6;
      if (lim < 2.6) {
        // 贴身短臂：向「外展」方向挥手（远离身体），在该模型实测的安全外展角内摆动。
        // 绝不内收、绝不大幅前摆——那会把贴着胸腹的手臂压进身体、翻成尖片。
        // armOut 逐模型标定（奶蛙仅 0.26、玩家奶龙 0.46），在 55%~90% 之间摆。
        const out = armOutLimit(ar);
        ar.rotation.x = -.08;
        ar.rotation.z = out * (.72 + w * .17);
      } else {
        // 手臂独立张开的挥手版奶龙：可以大幅举臂过头
        ar.rotation.x = -2.5;
        ar.rotation.z = -.25 + w * .18;
      }
      bones.armLeft.rotation.x = .12;
      bones.armLeft.rotation.z = -.05;
      bones.body.rotation.y = -.1;
      bones.head.rotation.z = .08;
    } else if (bones.pawRight) {
      const out = armOutLimit(bones.pawRight);
      bones.pawRight.rotation.z = out * (.72 + w * .17);
      bones.head.rotation.z = .12;
    } else if (bones.armRight) {
      const out = armOutLimit(bones.armRight);
      bones.armRight.rotation.z = out * (.72 + w * .17);
      bones.head.rotation.z = .1;
    } else if (bones.head) {
      bones.head.rotation.z = .1 + w * .1;   // 没手臂的家伙就歪头示意
    }
  }

  return {
    kind, bones,
    update(motion, opt = {}) {
      reset();
      try {
        const t = opt.t ?? 0;
        switch (motion) {
          case "walk": walk(opt.phase ?? t * 9); break;
          case "run": walk((opt.phase ?? t * 14) * 1.3); break;
          case "fightIdle": fightIdle(t, opt.guard !== false); break;
          case "hurt": hurt(opt.k ?? 0); break;
          case "sleep": sleepPose(); break;
          case "jump": jumpPose(opt.k ?? 0); break;
          case "wave": wavePose(opt.t ?? 0); break;
          default: idle(t);
        }
        scaleArms();
      } catch (e) { /* 某个关节缺失就少动一下，不能把游戏循环带崩 */ }
    },
    // 供战斗姿势逐帧混目标角用（kof 里想完全接管时先 reset 再 pose）
    reset, pose
  };
}
