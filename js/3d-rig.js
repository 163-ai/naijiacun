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
