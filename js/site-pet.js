// 奶家村站内桌宠：未开启时不导入渲染器或下载模型。
(function () {
  "use strict";
  var key = "naijiacun_site_pet_v1";
  var state = normalize(read());
  var view = null, moduleReady = null, revision = 0;

  function read() {
    try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (error) { return {}; }
  }
  function normalize(input) {
    var people = typeof PEOPLE !== "undefined" ? PEOPLE : [];
    var person = people.find(function (p) { return p.id === input.id; }) || people[0];
    var hasModel = person && window.N3D_MODELS && window.N3D_MODELS[person.id];
    function number(name, fallback, min, max) {
      return Number.isFinite(input[name]) ? Math.min(max, Math.max(min, input[name])) : fallback;
    }
    return {
      enabled: input.enabled === true, id: person ? person.id : "nailong",
      mode: hasModel && input.mode !== "2d" ? "3d" : "2d",
      size: number("size", 180, 80, 300), x: number("x", .88, 0, 1), y: number("y", .9, 0, 1),
      activity: input.activity !== false,
      motion: ["auto", "idle", "walk", "run"].includes(input.motion) ? input.motion : "auto"
    };
  }
  function emit() {
    window.dispatchEvent(new CustomEvent("naijiacun-site-pet-state", { detail: { ...state } }));
  }
  function save() {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch (error) { /* 当前页面仍可使用。 */ }
    emit();
  }
  async function paint() {
    var version = ++revision;
    if (!state.enabled || document.hidden) {
      if (view) { var old = view; view = null; old.destroy(); }
      return;
    }
    moduleReady = moduleReady || import("./site-pet-view.js?v=site-pets-1").catch(function (error) { moduleReady = null; throw error; });
    var module = await moduleReady;
    if (version !== revision || !state.enabled || document.hidden) return;
    if (!view) {
      var catalog = PEOPLE.map(function (person) {
        var model = window.N3D_MODELS[person.id];
        return { id: person.id, name: person.name, image: person.petImage || person.image, model: model && model.file };
      });
      view = module.createSitePet({ catalog: catalog, onChange: change });
    }
    await view.applyState(state);
  }
  function renderState() {
    var task = paint(), version = revision;
    return task.catch(function (error) {
      if (version === revision) {
        state.enabled = false; save();
        if (view) { var old = view; view = null; old.destroy(); }
      }
      throw error;
    });
  }
  function change(patch, render) {
    state = normalize({ ...state, ...patch });
    save();
    return render === false ? Promise.resolve({ ...state }) : renderState().then(function () { return { ...state }; });
  }
  window.NaijiacunSitePet = {
    start: function (options) { return change({ ...options, enabled: true }); },
    stop: function () { return change({ enabled: false }); },
    getState: function () { return { ...state }; }
  };
  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-site-pet-start]");
    if (!button) return;
    event.preventDefault();
    button.disabled = true;
    window.NaijiacunSitePet.start().catch(function () { button.textContent = "加载失败，请刷新重试"; }).finally(function () { button.disabled = false; });
  });
  window.addEventListener("storage", function (event) {
    if (event.key !== key) return;
    state = normalize(read()); emit(); void renderState().catch(console.warn);
  });
  document.addEventListener("visibilitychange", function () { void renderState().catch(console.warn); });
  window.addEventListener("pagehide", function () { ++revision; if (view) { var old = view; view = null; old.destroy(); } });
  window.addEventListener("pageshow", function (event) { if (event.persisted) { state = normalize(read()); emit(); void renderState().catch(console.warn); } });
  if (state.enabled) void renderState().catch(console.warn);
}());
