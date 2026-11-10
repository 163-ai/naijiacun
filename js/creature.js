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
      b.rotation.x += (tgt[0] - b.rotation.x) * blend;
      b.rotation.y += (tgt[1] - b.rotation.y) * blend;
      b.rotation.z += (tgt[2] - b.rotation.z) * blend;
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
          default: idle(t);
        }
      } catch (e) { /* 某个关节缺失就少动一下，不能把游戏循环带崩 */ }
    },
    // 供战斗姿势逐帧混目标角用（kof 里想完全接管时先 reset 再 pose）
    reset, pose
  };
}
