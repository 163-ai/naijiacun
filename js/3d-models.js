// 用户提供的完整模型；筛选、处理和校验记录见 assets/models/SOURCES.md。
// 模型体积远大于其他资源，GitHub Pages 的带宽撑不住（实测 20-50KB/s）。
// 托管在快线（workbuddy.host，实测 800KB/s 以上）时直接用同源路径；
// 仍留在 GitHub Pages 时改走 jsDelivr（实测快 4 倍、缓存 7 天）。
window.N3D_MODEL_HOST = /(^|\.)workbuddy\.host$/i.test(location.hostname)
  ? "" : "https://testingcf.jsdelivr.net/gh/163-ai/naijiacun@main/";
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
  var path = item[0] === "nailong" ? "assets/models/nailong-waving.glb" : "assets/models/" + item[0] + ".glb";
  window.N3D_MODELS[item[0]] = {
    file: path + "?v=mini-1",
    cdn: window.N3D_MODEL_HOST ? window.N3D_MODEL_HOST + path : null,
    source: "https://github.com/163-ai/naijiacun/blob/main/assets/models/SOURCES.md#" + item[0],
    credit: "用户提供 · " + item[1] + " 3D 模型",
    license: "用户提供用于本项目展示；角色形象权利归相应权利人。"
  };
});
