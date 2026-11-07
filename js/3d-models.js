// 用户提供的完整模型；筛选、处理和校验记录见 assets/models/SOURCES.md。
window.N3D_MODELS = {};
[
  ["nailong", "奶龙"],
  ["naiwa", "奶娃 / 奶蛙"],
  ["baobaolong", "暴暴龙"],
  ["xiaoqi", "小七"],
  ["niulai", "牛来"],
  ["capybara", "卡皮巴拉"],
  ["naicha", "奶察"],
  ["naidan", "奶蛋"],
  ["feidudu", "肥嘟嘟袋鼠"]
].forEach(function (item) {
  window.N3D_MODELS[item[0]] = {
    file: "assets/models/" + item[0] + ".glb?v=user-models-9",
    source: "https://github.com/163-ai/naijiacun/blob/main/assets/models/SOURCES.md#" + item[0],
    credit: "用户提供 · " + item[1] + " 3D 模型",
    license: "用户提供用于本项目展示；角色形象权利归相应权利人。"
  };
});
