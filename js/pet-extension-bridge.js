// 网站与已安装的奶家村扩展通信；网页本身不会安装扩展。
(function () {
  "use strict";
  var pending = new Map();
  function request(type, payload, timeout) {
    return new Promise(function (resolve, reject) {
      var requestId = Date.now().toString(36) + Math.random().toString(36).slice(2);
      var timer = setTimeout(function () {
        pending.delete(requestId);
        reject(new Error("还未连接浏览器扩展，请先按页面上方的安装说明启用扩展，再刷新此页。"));
      }, timeout || 1600);
      pending.set(requestId, { resolve: resolve, reject: reject, timer: timer });
      window.postMessage({ channel: "NAIJIACUN_PET", type: type, requestId: requestId, payload: payload || {} }, location.origin);
    });
  }
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (event.source !== window || event.origin !== location.origin || !data || data.channel !== "NAIJIACUN_PET_REPLY") return;
    if (data.state && typeof data.state.enabled === "boolean") {
      window.dispatchEvent(new CustomEvent("naijiacun-pet-state", { detail: data.state }));
    }
    var item = pending.get(data.requestId);
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(data.requestId);
    if (data.ok) item.resolve(data.state || null);
    else item.reject(new Error(data.error || "桌宠暂时没有响应，请从浏览器扩展菜单重试。"));
  });
  window.NaijiacunPetBridge = {
    start: function (options) { return request("START", options); },
    stop: function () { return request("STOP"); },
    probe: function () { return request("PING", {}, 1000).catch(function () { return null; }); }
  };
})();
