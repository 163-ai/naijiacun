// 奶家村 · 装备可视化 —— 程序化几何体 + 骨骼挂点
// =========================================================
// 为什么这样做：
//   装备此前只有数值（state.gear 加 atk/hp/catch），角色身上看不出变化，玩家买了等于没买。
//   项目里的角色是"单网格静态 GLB + pet-motion 程序化绑骨"，骨骼名固定（body/head/armRight…）。
//   把装备做成骨骼的【子节点】而非世界里的独立物体：骨骼转到哪，装备跟到哪——出拳时武器
//   跟着手动，这就是挂点（Socket）的标准解法，不用逐帧手调世界坐标。
//
// 素材来源：全部由 Three.js 基础几何体现场拼装，零外部模型、零版权风险。
//   （项目用了有权利人的 IP 形象 + 真人音色克隆，装备是少数能完全撇清素材授权的区域，
//     因此这里坚持程序化生成，不引入来源不明的模型。）
//   材质用 MeshStandardMaterial 调出木/铁/金/布的质感，明快配色贴奶龙卡通调性。
//
// 坐标系：pet-motion 把角色归一到【高 2 单位、面朝 +Z、脚在 y=0】，骨骼也在这个空间。
//   本模块的 offset 都是相对对应骨骼原点的局部坐标（2 单位空间），
//   rig.root 会再乘 c.h/2 缩放到场景实际身高。所有 offset 集中在 SOCKET 表便于 playtest 微调。
//   ⚠️ 造型与 offset 均为草稿初始值 [待 playtest]，需真机跑图微调避免个别姿势穿模。
// =========================================================

// 槽位 → 挂点骨骼 + 局部偏移（相对骨骼原点，2 单位空间）
const SOCKET = {
  weapon: { bone: "armRight", offset: [.20, -.60, -.12] }, // 右手握持点：肩 [.46,1.06,-.04]，手约 [.67,.38,-.14]
  armor:  { bone: "body",    offset: [0, 1.00, .20] },   // 胸口正面
  charm:  { bone: "head",    offset: [0, .14, .16] }     // 头顶偏前
};

function mat(T, color, metal = 0, rough = .7) {
  return new T.MeshStandardMaterial({ color, metalness: metal, roughness: rough });
}
function part(T, geo, material, x = 0, y = 0, z = 0, rz = 0, rx = 0) {
  const m = new T.Mesh(geo, material);
  m.position.set(x, y, z); m.rotation.z = rz; m.rotation.x = rx;
  m.castShadow = true;
  return m;
}

/* ---------- 武器：局部原点=握持点，长轴 +Y ---------- */
function makeWeapon(T, id) {
  const g = new T.Group();
  if (id === "w1") {                       // 木棍
    const wood = mat(T, 0x8a5a2b, 0, .9);
    g.add(part(T, new T.CylinderGeometry(.045, .055, 1.0, 8), wood));
    g.add(part(T, new T.CylinderGeometry(.052, .052, .06, 8), mat(T, 0x6d4420, 0, .95), 0, .38, 0));
  } else if (id === "w2") {                // 铁叉
    const steel = mat(T, 0xb9c2ca, .75, .3);
    g.add(part(T, new T.CylinderGeometry(.04, .045, .92, 8), mat(T, 0x7d5230, 0, .85), 0, -.04, 0));
    g.add(part(T, new T.CylinderGeometry(.03, .03, .26, 8), steel, 0, .47, 0, Math.PI / 2));
    for (const x of [-.10, 0, .10])
      g.add(part(T, new T.ConeGeometry(.028, .26, 8), steel, x, .60, 0));
  } else if (id === "w3") {                // 村长拐杖
    const gold = mat(T, 0xb8892f, .8, .3);
    g.add(part(T, new T.CylinderGeometry(.042, .05, 1.05, 10), gold, 0, -.02, 0));
    const hook = part(T, new T.TorusGeometry(.15, .04, 8, 16, Math.PI), gold, .13, .56, 0, -Math.PI / 2);
    g.add(hook);
    g.add(part(T, new T.SphereGeometry(.055, 12, 10), mat(T, 0xd4443a, .2, .35), .13, .66, 0));
  }
  return g;
}

/* ---------- 护甲：局部原点=胸甲中心，正面 +Z ---------- */
function makeArmor(T, id) {
  const g = new T.Group();
  const plate = (color, metal, rough, r) => part(T, new T.CylinderGeometry(r, r, .10, 14), mat(T, color, metal, rough), 0, 0, 0, Math.PI / 2);
  if (id === "a1") {                       // 布衣
    g.add(plate(0x5f9a6a, 0, .95, .30));
    g.add(part(T, new T.BoxGeometry(.09, .46, .13), mat(T, 0x4a7d55, 0, .95), 0, 0, .06));
  } else if (id === "a2") {                // 皮甲
    g.add(plate(0x7a4b2a, .1, .6, .32));
    for (const x of [-.19, .19])
      g.add(part(T, new T.CylinderGeometry(.035, .035, .30, 8), mat(T, 0x5d3720, .1, .7), x, .30, 0, 0, .18));
    g.add(part(T, new T.BoxGeometry(.30, .07, .14), mat(T, 0xc9a04a, .6, .4), 0, -.04, .07));
  } else if (id === "a3") {                // 铁皮甲
    g.add(plate(0x9aa4ad, .85, .28, .34));
    for (const x of [-.22, .22])
      g.add(part(T, new T.SphereGeometry(.05, 10, 8), mat(T, 0xd8dee4, .9, .2), x, .20, .05));
    g.add(part(T, new T.BoxGeometry(.34, .06, .14), mat(T, 0xc2c9d0, .85, .3), 0, -.10, .07));
  }
  return g;
}

/* ---------- 饰品：局部原点=佩戴点 ---------- */
function makeCharm(T, id) {
  const g = new T.Group();
  if (id === "c1") {                       // 幸运草（四叶）
    const leaf = mat(T, 0x4faf52, 0, .75);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      g.add(part(T, new T.SphereGeometry(.075, 10, 8), leaf,
        Math.cos(a) * .09, Math.sin(a) * .09, 0, 0, 0));
    }
    g.add(part(T, new T.CylinderGeometry(.012, .012, .16, 6), mat(T, 0x3c8a40, 0, .8), 0, -.14, 0));
  } else if (id === "c2") {                // 招财铃
    const gold = mat(T, 0xe0b23c, .8, .28);
    g.add(part(T, new T.SphereGeometry(.13, 14, 12), gold));
    g.add(part(T, new T.BoxGeometry(.16, .025, .04), mat(T, 0x7a5a15, .5, .5), 0, -.08, .10));
    g.add(part(T, new T.TorusGeometry(.035, .012, 8, 12), gold, 0, .14, 0, Math.PI / 2));
  } else if (id === "c3") {                // 聚宝盆
    const gold = mat(T, 0xd9a52e, .85, .25);
    g.add(part(T, new T.CylinderGeometry(.17, .10, .17, 14), gold, 0, -.04, 0));
    g.add(part(T, new T.TorusGeometry(.17, .022, 8, 16), gold, 0, .045, 0, Math.PI / 2));
    for (const x of [-.06, .02, .08])
      g.add(part(T, new T.CylinderGeometry(.045, .045, .015, 10), mat(T, 0xf2cf5b, .9, .2), x, .05, .02, 0, .3));
  }
  return g;
}

const BUILDERS = {
  w1: makeWeapon, w2: makeWeapon, w3: makeWeapon,
  a1: makeArmor,  a2: makeArmor,  a3: makeArmor,
  c1: makeCharm,  c2: makeCharm,  c3: makeCharm
};
function slotOf(id) { return id[0] === "w" ? "weapon" : id[0] === "a" ? "armor" : "charm"; }

function disposeTree(node) {
  node.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
      else o.material.dispose();
    }
  });
}

/**
 * 把当前装备挂到 actor 的骨骼上。每次切换都先清旧件再挂新件，避免叠加。
 * actor 必须经过 withAnim（有 userData.anim.bones）；2D 立牌无骨骼，自动跳过。
 * 幂等：同一状态重复调用不会重复挂。
 */
export function attachGearVisuals(T, actor, equipped) {
  if (!actor) return;
  const old = actor.userData.gearNodes;
  if (old && old.length) {
    for (const node of old) { if (node.parent) node.parent.remove(node); disposeTree(node); }
  }
  actor.userData.gearNodes = [];
  const anim = actor.userData.anim;
  if (!anim || !anim.bones) return;
  for (const slot of ["weapon", "armor", "charm"]) {
    const id = equipped && equipped[slot];
    if (!id || !BUILDERS[id]) continue;
    const sock = SOCKET[slot], bone = anim.bones[sock.bone];
    if (!bone) continue;
    const model = BUILDERS[id](T, id);
    model.name = "gear-" + id;
    model.position.fromArray(sock.offset);
    bone.add(model);
    actor.userData.gearNodes.push(model);
  }
}
