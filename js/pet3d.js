// 奶家村 · 公开完整模型展台
import * as T from "three";
import { GLTFLoader } from "../vendor/three/GLTFLoader.js";
import { MeshoptDecoder } from "../vendor/meshopt/meshopt_decoder.module.js";

(function () {
  "use strict";
  var PACK = window.N3D_MODELS || {};
  var LIST = typeof PEOPLE !== "undefined" ? PEOPLE : [];
  var VOICES = typeof CHARACTER_VOICES !== "undefined" ? CHARACTER_VOICES : {};
  var stage = document.getElementById("stage");
  var canvas = document.getElementById("gl");
  var loading = document.getElementById("loading");
  var modelPreview = document.getElementById("modelPreview");
  var loadLabel = document.getElementById("loadLabel");
  var loadProgress = document.getElementById("loadProgress");
  var loadDetail = document.getElementById("loadDetail");
  var fallback = document.getElementById("fallback");
  var note = document.getElementById("status");
  var bubble = document.getElementById("bubble");
  var chipsBox = document.getElementById("chips");
  var retry = document.getElementById("retryBtn");
  var renderer;
  retry.onclick = function () { window.location.reload(); };

  function setStatus(text) { note.textContent = text; }
  function showError(text) {
    loading.classList.add("hidden");
    document.getElementById("errorMessage").textContent = text;
    fallback.classList.remove("hidden");
    setStatus(text);
  }
  try {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  } catch (e) {
    showError("这个浏览器暂时无法显示 3D，请换一个支持 WebGL 的浏览器。");
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  var scene = new T.Scene();
  var camera = new T.PerspectiveCamera(36, 1, 0.01, 100);
  var target = new T.Vector3();
  scene.add(new T.HemisphereLight(0xffffff, 0xb0a28b, 2.2));
  var key = new T.DirectionalLight(0xfff4e7, 2.5);
  key.position.set(3, 5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -3; key.shadow.camera.right = 3;
  key.shadow.camera.top = 3; key.shadow.camera.bottom = -3;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 16;
  key.shadow.normalBias = 0.015;
  scene.add(key);
  var fill = new T.DirectionalLight(0xdbe9ff, 1.8);
  fill.position.set(-4, 2, -4);
  scene.add(fill);
  var ground = new T.Mesh(new T.PlaneGeometry(14, 14), new T.ShadowMaterial({ opacity: 0.17 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.1;
  ground.receiveShadow = true;
  scene.add(ground);

  var loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  var model = null, currentId = "", loadVersion = 0;
  var modelCache = new Map(), pendingLoad = null;
  var yaw = 0, pitch = 0, velYaw = 0, velPitch = 0;
  var zoom = 1, fitDistance = 4.7;
  var dragging = false, lastX = 0, lastY = 0;
  var autoSpin = true, wireframe = false;
  var audioEl = null, bubbleTimer = 0, pipWindow = null;

  function byId(id) { return LIST.find(function (p) { return p.id === id; }); }
  function toggleBtn(id, on) {
    var el = document.getElementById(id);
    el.setAttribute("aria-pressed", String(on));
    el.classList.toggle("on", on);
  }
  function stopAudio() {
    if (audioEl) { audioEl.pause(); audioEl = null; }
    clearTimeout(bubbleTimer);
    bubble.classList.add("hidden");
  }
  function disposeModel(root) {
    var geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set(), bitmaps = new Set();
    function collect(o) {
      if (o.geometry) geometries.add(o.geometry);
      if (o.skeleton) skeletons.add(o.skeleton);
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
        materials.add(m);
        Object.keys(m).forEach(function (key) { if (m[key] && m[key].isTexture) textures.add(m[key]); });
      });
    }
    root.traverse(collect);
    if (root.userData.resourceRoot) root.userData.resourceRoot.traverse(collect);
    geometries.forEach(function (g) { g.dispose(); });
    materials.forEach(function (m) { m.dispose(); });
    textures.forEach(function (t) {
      var image = t.source && t.source.data;
      if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) bitmaps.add(image);
      t.dispose();
    });
    skeletons.forEach(function (s) { s.dispose(); });
    bitmaps.forEach(function (image) { image.close(); });
  }
  function applyWireframe() {
    if (!model) return;
    model.traverse(function (o) {
      if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
        m.wireframe = wireframe;
      });
    });
  }
  function updateCamera() {
    camera.position.set(0, target.y + 0.15, fitDistance * zoom);
    camera.lookAt(target);
  }
  function fitCamera() {
    if (model) {
      var size = model.userData.size;
      var halfFov = T.MathUtils.degToRad(camera.fov / 2);
      var horizontalHalfFov = Math.atan(Math.tan(halfFov) * camera.aspect);
      var radius = size.length() / 2;
      fitDistance = radius / Math.sin(Math.min(halfFov, horizontalHalfFov)) * 1.12;
    }
    updateCamera();
  }
  function normalizeModel(content, entry) {
    content.traverse(function (o) {
      if (o.morphTargetInfluences) o.morphTargetInfluences.fill(0);
    });
    content.rotation.x += entry.pitch || 0;
    content.rotation.y += entry.yaw || 0;
    content.rotation.z += entry.roll || 0;
    content.updateMatrixWorld(true);
    var bounds = new T.Box3().setFromObject(content);
    var size = bounds.getSize(new T.Vector3());
    var extent = Math.max(size.x, size.y, size.z);
    if (!isFinite(extent) || extent <= 0) throw new Error("模型没有可显示的网格");
    var scale = 2.2 / extent;
    var center = bounds.getCenter(new T.Vector3());
    var centered = new T.Group();
    centered.scale.setScalar(scale);
    content.position.sub(center);
    centered.add(content);
    var root = new T.Group();
    root.add(centered);
    root.position.y = -1.1 + size.y * scale / 2;
    root.userData.size = size.multiplyScalar(scale);
    var vertices = 0;
    root.traverse(function (o) {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.geometry.attributes.position) vertices += o.geometry.attributes.position.count;
    });
    root.userData.vertices = vertices;
    return root;
  }
  function setView(view) {
    autoSpin = false;
    toggleBtn("spinBtn", false);
    yaw = view === "side" ? Math.PI / 2 : view === "back" ? Math.PI : 0;
    pitch = velYaw = velPitch = 0;
    document.querySelectorAll("[data-view]").forEach(function (el) {
      el.setAttribute("aria-pressed", String(el.dataset.view === view));
    });
  }
  function resetView() {
    setView("front");
    zoom = 1;
    fitCamera();
  }
  function updateSource(entry) {
    document.getElementById("modelCredit").textContent = entry.credit || "公开社区模型";
    document.getElementById("modelSource").href = entry.source;
    document.getElementById("modelLicense").textContent = entry.license === "unknown"
      ? "来源未注明明确的素材许可。" : (entry.license || "使用范围以来源页面为准。");
  }
  async function setCharacter(id) {
    var entry = PACK[id];
    if (!entry || (currentId === id && (pendingLoad || model))) return;
    var version = ++loadVersion;
    if (pendingLoad) pendingLoad.abort();
    var controller = new AbortController();
    pendingLoad = controller;
    currentId = id;
    stopAudio();
    if (model) { scene.remove(model); model = null; }
    fallback.classList.add("hidden");
    loading.hidden = false;
    loading.classList.remove("hidden");
    var person = byId(id), name = person ? person.name : id;
    var preview = person && (person.petImage || person.image);
    modelPreview.hidden = !preview;
    if (preview) { modelPreview.src = preview; modelPreview.alt = name; }
    loadLabel.textContent = "正在下载" + name + "…";
    loadProgress.removeAttribute("value");
    loadDetail.textContent = "正在连接模型文件…";
    setStatus(loadLabel.textContent);
    chipsBox.querySelectorAll(".p3-chip").forEach(function (el) {
      var active = el.dataset.id === id;
      el.classList.toggle("active", active);
      el.setAttribute("aria-pressed", String(active));
    });
    document.getElementById("clipBtn").disabled = !person || !person.clip;
    document.getElementById("talkBtn").disabled = !VOICES[id];
    updateSource(entry);
    try {
      var root = modelCache.get(id);
      if (!root) {
        var fileURL = new URL(entry.file, window.location.href);
        var response = await fetch(fileURL.href, { signal: controller.signal });
        if (!response.ok) throw new Error("HTTP " + response.status);
        var encoding = response.headers.get("Content-Encoding");
        var total = !encoding || encoding === "identity" ? Number(response.headers.get("Content-Length")) : 0;
        var received = 0, lastProgress = -Infinity, chunks = [];
        function progress(done) {
          if (version !== loadVersion || controller.signal.aborted) return;
          var now = performance.now();
          if (!done && now - lastProgress < 250) return;
          lastProgress = now;
          var mb = function (bytes) { return (bytes / 1048576).toFixed(1) + " MB"; };
          var percent = total > 0 ? Math.min(100, Math.floor(received / total * 100)) : null;
          if (percent !== null) loadProgress.value = percent;
          var detail = percent !== null ? percent + "% · " + mb(received) + " / " + mb(total) : "已下载 " + mb(received);
          if (loadDetail.textContent !== detail) loadDetail.textContent = detail;
        }
        if (response.body) {
          var reader = response.body.getReader();
          try {
            while (true) {
              var chunk = await reader.read();
              if (chunk.done) break;
              chunks.push(chunk.value);
              received += chunk.value.byteLength;
              progress(false);
            }
          } finally { reader.releaseLock(); }
        } else {
          var bytes = new Uint8Array(await response.arrayBuffer());
          chunks.push(bytes);
          received = bytes.byteLength;
        }
        progress(true);
        if (version !== loadVersion || controller.signal.aborted) return;
        var buffer = new Uint8Array(received), offset = 0;
        chunks.forEach(function (chunk) { buffer.set(chunk, offset); offset += chunk.byteLength; });
        chunks = null;
        loadLabel.textContent = "正在准备" + name + " 3D…";
        loadProgress.removeAttribute("value");
        loadDetail.textContent = "下载完成，正在解码和准备模型…";
        setStatus(loadLabel.textContent);
        var gltf = await loader.parseAsync(buffer.buffer, new URL(".", fileURL).href);
        if (version !== loadVersion || controller.signal.aborted) { disposeModel(gltf.scene); return; }
        var resources = gltf.scene;
        if (entry.node) {
          var subject = gltf.scene.getObjectByName(entry.node);
          if (!subject) { disposeModel(resources); throw new Error("模型中没有对应角色"); }
          var character = new T.Group();
          character.attach(subject);
          gltf.scene = character;
        }
        try { root = normalizeModel(gltf.scene, entry); }
        catch (e) { disposeModel(gltf.scene); if (resources !== gltf.scene) disposeModel(resources); throw e; }
        root.userData.resourceRoot = resources;
      }
      modelCache.delete(id);
      modelCache.set(id, root);
      if (modelCache.size > 2) {
        var oldest = modelCache.keys().next().value;
        disposeModel(modelCache.get(oldest));
        modelCache.delete(oldest);
      }
      model = root;
      scene.add(model);
      yaw = pitch = velYaw = velPitch = 0;
      document.querySelectorAll("[data-view]").forEach(function (el) {
        el.setAttribute("aria-pressed", String(!autoSpin && el.dataset.view === "front"));
      });
      zoom = 1;
      target.set(0, model.position.y, 0);
      fitCamera();
      applyWireframe();
      loading.hidden = true;
      loading.classList.add("hidden");
      setStatus(name + " · 完整模型已加载 · 拖动旋转查看");
    } catch (e) {
      if (version !== loadVersion || controller.signal.aborted || e.name === "AbortError") return;
      showError(name + "模型加载失败，可以重试或选择其他角色。");
    } finally {
      if (pendingLoad === controller) pendingLoad = null;
    }
  }
  retry.onclick = function () { setCharacter(currentId); };

  // ---------- 旋转、缩放与方向 ----------
  function resize() {
    var width = stage.clientWidth, height = stage.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    fitCamera();
  }
  window.addEventListener("resize", resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  canvas.addEventListener("pointerdown", function (e) {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    velYaw = velPitch = 0;
    autoSpin = false;
    toggleBtn("spinBtn", false);
    document.querySelectorAll("[data-view]").forEach(function (el) { el.setAttribute("aria-pressed", "false"); });
    stage.classList.add("grabbing");
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    yaw += dx * 0.009;
    pitch = Math.max(-0.7, Math.min(0.7, pitch + dy * 0.006));
    velYaw = dx * 0.0022; velPitch = dy * 0.0014;
  });
  function releasePointer() { dragging = false; stage.classList.remove("grabbing"); }
  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);
  canvas.addEventListener("lostpointercapture", releasePointer);
  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    zoom = Math.max(0.55, Math.min(1.8, zoom + e.deltaY * 0.0007));
    updateCamera();
  }, { passive: false });
  canvas.addEventListener("dblclick", resetView);
  document.querySelectorAll("[data-view]").forEach(function (el) {
    el.addEventListener("click", function () { setView(el.dataset.view); });
  });

  function play(file, text) {
    stopAudio();
    var audio = new Audio(file);
    audioEl = audio;
    audio.play().then(function () {
      if (audioEl !== audio) { audio.pause(); return; }
      bubble.textContent = text;
      bubble.classList.remove("hidden");
      bubbleTimer = setTimeout(function () { bubble.classList.add("hidden"); }, 3200);
    }).catch(function () { if (audioEl === audio) setStatus("音频暂时无法播放，请再点一次。"); });
  }

  // ---------- 置顶小窗 ----------
  async function togglePin() {
    if (!("documentPictureInPicture" in window)) return;
    if (pipWindow) { pipWindow.close(); return; }
    try {
      pipWindow = await window.documentPictureInPicture.requestWindow({ width: 420, height: 460 });
      pipWindow.document.body.style.cssText = "margin:0;background:#faf7f2;overflow:hidden";
      ["css/style.css?v=village-1", "css/pet3d.css?v=loading-1"].forEach(function (href) {
        var link = pipWindow.document.createElement("link");
        link.rel = "stylesheet";
        link.href = new URL(href, window.location.href).href;
        pipWindow.document.head.appendChild(link);
      });
      pipWindow.document.body.appendChild(stage);
      stage.classList.add("in-pip");
      resize();
      var button = document.getElementById("pinBtn");
      button.textContent = "📌 收回小窗";
      pipWindow.addEventListener("pagehide", function () {
        document.querySelector(".p3-main").insertBefore(stage, document.querySelector(".p3-side"));
        stage.classList.remove("in-pip");
        pipWindow = null;
        button.textContent = "📌 置顶小窗";
        resize();
      });
    } catch (e) { setStatus("小窗暂时无法打开，请允许浏览器打开小窗。"); }
  }

  LIST.forEach(function (person) {
    if (!PACK[person.id]) return;
    var button = document.createElement("button");
    button.className = "p3-chip";
    button.dataset.id = person.id;
    button.setAttribute("aria-pressed", "false");
    var image = document.createElement("img");
    image.src = person.image;
    image.alt = "";
    button.appendChild(image);
    button.appendChild(document.createTextNode(person.name));
    button.addEventListener("click", function () { setCharacter(person.id); });
    chipsBox.appendChild(button);
  });
  document.getElementById("missingModels").textContent = LIST.filter(function (p) {
    return !PACK[p.id];
  }).map(function (p) { return p.name; }).join("、") + "：暂未接入完整模型。";

  document.getElementById("spinBtn").onclick = function () {
    autoSpin = !autoSpin;
    toggleBtn("spinBtn", autoSpin);
    document.querySelectorAll("[data-view]").forEach(function (el) { el.setAttribute("aria-pressed", "false"); });
  };
  document.getElementById("wireBtn").onclick = function () {
    wireframe = !wireframe;
    toggleBtn("wireBtn", wireframe);
    applyWireframe();
  };
  document.getElementById("talkBtn").onclick = function () {
    var person = byId(currentId);
    play("audio/" + currentId + ".mp3", person.quote || "你好呀～");
  };
  document.getElementById("clipBtn").onclick = function () {
    var person = byId(currentId);
    if (person && person.clip) play(person.clip, "🎵 " + person.name + "原声片段");
  };
  document.getElementById("resetBtn").onclick = resetView;
  document.getElementById("pinBtn").onclick = togglePin;
  if (!("documentPictureInPicture" in window)) {
    document.getElementById("pinBtn").disabled = true;
    document.getElementById("pinBtn").title = "当前浏览器不支持置顶小窗";
  }
  window.addEventListener("pagehide", function (e) {
    ++loadVersion;
    if (pendingLoad) { pendingLoad.abort(); pendingLoad = null; }
    stopAudio();
    if (!e.persisted) {
      if (model) scene.remove(model);
      model = null;
      modelCache.forEach(disposeModel);
      modelCache.clear();
    }
  });
  window.addEventListener("pageshow", function () {
    if (!model && !pendingLoad && currentId) setCharacter(currentId);
  });

  var lastFrame = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    var delta = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    if (!dragging) {
      yaw += velYaw + (autoSpin ? delta * 0.27 : 0);
      pitch = Math.max(-0.7, Math.min(0.7, pitch + velPitch));
      velYaw *= 0.93; velPitch *= 0.93;
    }
    if (model) model.rotation.set(pitch, yaw, 0);
    renderer.render(scene, camera);
  }
  resize();
  toggleBtn("spinBtn", autoSpin);
  var first = LIST.find(function (p) { return !!PACK[p.id]; });
  if (first) setCharacter(first.id);
  else showError("暂时没有可展示的完整模型。");
  requestAnimationFrame(loop);
  window.__p3 = {
    setCharacter: setCharacter, resetView: resetView, setView: setView,
    setAngle: function (y, p) { autoSpin = false; yaw = y; pitch = p || 0; velYaw = velPitch = 0; },
    spin: function (on) { autoSpin = on; toggleBtn("spinBtn", on); },
    scene: scene, camera: camera, renderer: renderer,
    model: function () { return model; },
    currentId: function () { return currentId; }
  };
})();
