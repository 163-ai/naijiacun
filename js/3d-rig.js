// 由 naijiacun-model-forge 入库时自动维护（见 server/export.js），请勿手改。
//
// 结构：window.N3D_RIG[id] = { anatomy, rig, meta }
//   anatomy —— pet-motion.js 绑骨用的比例参数（hip/knee/legX/legTop/head/
//              shoulders/hands/armRadius/armGate/armLimit）。缺省就沿用站点实测表。
//   rig     —— { mode: 'native' | 'procedural', kind: 'biped'|'hop'|'bowl'|'roll', idleClip }
//              native 表示模型自带真实骨骼，站点直接用自己的骨骼 + 自带动画。
//   meta    —— 制作信息：生成器、骨骼数、动画数、面数、体积、入库时间。
//
// 空对象是合法状态：3d-models.js 会把这里的内容并进 N3D_MODELS，
// 没有对应条目的角色完全按原来的行为走。
window.N3D_RIG = {};

/* ---------------------------------------------------------------------------
 * 2026-11-20 真骨骼接入
 *
 * 10 个模型全部重建为 19 根标准骨（命名对齐 js/pet-rig.js）+ 2 秒 idle clip。
 * 权重：Blender 骨骼热力为主，加 naijiacun-rig/tools/weight_lib.py 的后处理
 *       （卫星飞地 / 死骨救活 / UV 缝合并），不重排热力解、不做减面。
 * 资产：prune + quantize + meshopt 压缩，刻意跳过 simplify/weld 以保护蒙皮边缘；
 *       加载端 Three.js 由 KHR_mesh_quantization 还原坐标。
 *
 * createPetMotion() 见到 rig.mode === 'native' 会自动切到 createNativeMotion()，
 * 所以这里不需要改 pet-renderer.js。验收：verify-rig 10/10 PASS，权重越界 0。
 * ------------------------------------------------------------------------- */
var META = {
  generator: "naijiacun-rig/blender-4.5",
  bones: 19,
  animations: 1,
  clipNames: ["idle"],
  importedAt: "2026-11-20"
};
[
  "nailong", "naiwa", "baobaolong", "xiaoqi", "niulai",
  "capybara", "naicha", "naidan", "feidudu", "nailong-waving"
].forEach(function (id) {
  window.N3D_RIG[id] = {
    rig: { mode: "native", kind: "biped", idleClip: "idle" },
    meta: Object.assign({}, META)
  };
});
