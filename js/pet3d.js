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
      stopAction();
      buildRig(model);
      updateActAvailability();
      updateActNote();
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

  // ---------- 动作系统：骨骼实时驱动，不依赖模型自带动画 ----------
  // 模型自带的 7 段动画只动头部（幅度 0.03~0.14），当不了「大笑／鞠躬」，
  // 因此这里直接按骨骼摆姿势：动作幅度可控、每个模型都能复用。
  var rig = null, active = null, activeStart = 0, laughAudio = null, frozen = null;
  var soundOn = true;
  try { soundOn = localStorage.getItem("p3-sound") !== "off"; } catch (e) {}

  function buildRig(root) {
    var bones = {};
    root.traverse(function (o) { if (o.isBone) bones[o.name] = o; });
    root.updateMatrixWorld(true);
    var rootInv = root.getWorldQuaternion(new T.Quaternion()).invert();
    var rest = {};
    Object.keys(bones).forEach(function (name) {
      var bone = bones[name];
      var parentWorld = new T.Quaternion();
      if (bone.parent) bone.parent.getWorldQuaternion(parentWorld);
      rest[name] = {
        q: bone.quaternion.clone(),
        self: rootInv.clone().multiply(bone.getWorldQuaternion(new T.Quaternion())),
        parent: rootInv.clone().multiply(parentWorld)
      };
    });
    var centered = root.children[0];
    var box = new T.Box3().setFromObject(centered);
    var size = new T.Vector3();
    box.getSize(size);
    rig = {
      root: root, centered: centered, bones: bones, rest: rest,
      baseY: centered.position.y,
      baseZ: centered.position.z,
      baseRot: centered.rotation.clone(),
      baseScale: centered.scale.clone(),
      // 身高 / 厚度 / 宽度：用于「笑到躺下」时按身体尺寸把模型稳稳放到地面上
      h: Math.max(0.5, size.y),
      d: Math.max(0.2, size.z),
      hx: Math.max(0.1, size.x / 2),
      hy: Math.max(0.25, size.y / 2),
      hz: Math.max(0.1, size.z / 2)
    };
    // 静止姿态下模型的最低点就是地面（世界坐标）；之后任何角度都按这个基准把底边贴回去
    rig.groundY = box.min.y;
    var rm0 = new T.Matrix4().makeRotationFromEuler(centered.rotation).elements;
    var ex0 = Math.abs(rm0[1]) * rig.hx + Math.abs(rm0[5]) * rig.hy + Math.abs(rm0[9]) * rig.hz;
    rig.restLift = (rig.groundY + ex0) - centered.position.y;
  }

  function resetRig() {
    if (!rig) return;
    Object.keys(rig.bones).forEach(function (name) {
      rig.bones[name].quaternion.copy(rig.rest[name].q);
    });
    rig.centered.position.y = rig.baseY;
    rig.centered.position.z = rig.baseZ;
    rig.centered.rotation.copy(rig.baseRot);
    rig.centered.scale.copy(rig.baseScale);
  }

  // 以「模型自身坐标」的世界轴旋转某根骨骼（X 右、Y 上、Z 前）
  function rotWorld(name, moves) {
    if (!rig || !rig.bones[name]) return;
    var quat = rig.rest[name].self.clone();
    moves.forEach(function (move) {
      var axis = new T.Vector3(move[0][0], move[0][1], move[0][2]).normalize();
      quat.premultiply(new T.Quaternion().setFromAxisAngle(axis, move[1]));
    });
    rig.bones[name].quaternion.copy(rig.rest[name].parent.clone().invert().multiply(quat));
  }

  function setActiveAct(el) {
    document.querySelectorAll(".p3-act").forEach(function (btn) {
      btn.classList.toggle("playing", btn === el);
      if (btn === el) btn.setAttribute("aria-pressed", "true");
      else btn.removeAttribute("aria-pressed");
    });
  }

  function burstLaugh() {
    var box = document.getElementById("laughFx");
    if (!box) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    box.innerHTML = "";
    ["😂", "🤣", "😆", "🤣", "😂"].forEach(function (face, i) {
      var span = document.createElement("span");
      span.textContent = face;
      span.style.left = 50 + (i - 2) * 7 + "%";
      span.style.fontSize = (17 + Math.random() * 9).toFixed(0) + "px";
      span.style.setProperty("--dx", ((i - 2) * 30 + (Math.random() * 18 - 9)).toFixed(0) + "px");
      span.style.setProperty("--delay", (i * 0.16).toFixed(2) + "s");
      box.appendChild(span);
    });
    setTimeout(function () { if (box) box.innerHTML = ""; }, 3200);
  }

  // 大笑：照参考视频的演法 —— 站着笑到抖 → 越笑越后仰 → 笑岔气往后倒下 →
  // 四脚朝天左右滚 → 缓过来自己爬回站姿。
  // 村民模型都是单网格、没有骨骼，所以整段用整体旋转 + 按身高补偿落地高度来演。
  function seg(t, a, b) { return Math.min(1, Math.max(0, (t - a) / (b - a))); }
  function easeOut(x) { var p = 1 - Math.min(1, Math.max(0, x)); return 1 - p * p * p; }
  function easeIn(x) { var p = Math.min(1, Math.max(0, x)); return p * p; }

  function applyLaugh(t) {
    var H = rig.h, D = rig.d;
    var lean = 0, roll = 0, shake = 0, squash = 0, lift = 0, turn = 0;

    if (t < 1.7) {
      // ① 站着笑：肚子一鼓一瘪，笑得直抖，越笑越往后仰
      lean = 0.26 * easeOut(seg(t, 0, 0.6)) + 0.1 * easeOut(seg(t, 0.6, 1.7));
      shake = (0.016 + 0.06 * seg(t, 0.4, 1.0)) * Math.sin(t * Math.PI * 2 * 5.6);
      var beat = Math.max(0, Math.sin(t * Math.PI * 2 * 2.8));
      squash = 0.06 * beat;
      lift = 0.045 * beat;
    } else if (t < 2.3) {
      // ② 笑到站不住，往侧后方一歪，越倒越快
      var p = easeIn(seg(t, 1.7, 2.25));
      lean = 0.36 + 0.14 * p;
      roll = 1.45 * p;
      shake = 0.025 * (1 - p) * Math.sin(t * Math.PI * 2 * 6.4);
    } else if (t < 3.6) {
      // ③ 侧躺在地上还在笑，滚来滚去、小肚子一抽一抽
      lean = 0.5 + 0.05 * Math.sin((t - 2.3) * Math.PI * 2 * 1.4);
      roll = 1.45 + 0.17 * Math.sin((t - 2.3) * Math.PI * 2 * 0.8);
      turn = 0.14 * Math.sin((t - 2.3) * Math.PI * 2 * 0.55);
      lift = 0.022 * Math.max(0, Math.sin((t - 2.3) * Math.PI * 2 * 3));
    } else if (t < 4.4) {
      // ④ 缓过来，撑着爬起来（带一点回弹）
      var q = easeOut(seg(t, 3.6, 4.3));
      lean = 0.5 * (1 - q);
      roll = 1.45 * (1 - q);
      turn = 0.1 * (1 - q);
    } else {
      // ⑤ 站稳，收个尾声
      lean = 0.04 * Math.max(0, Math.sin((t - 4.4) * Math.PI * 2 * 4)) * (1 - seg(t, 4.4, 4.7));
    }

    var ang = Math.max(0, lean);
    rig.centered.rotation.x = rig.baseRot.x - ang + shake;
    rig.centered.rotation.z = rig.baseRot.z + roll;
    rig.centered.rotation.y = rig.baseRot.y + turn;
    rig.centered.scale.set(
      rig.baseScale.x * (1 + squash * 0.7),
      rig.baseScale.y * (1 - squash),
      rig.baseScale.z * (1 + squash * 0.7)
    );
    // 支点放在脚底，朝后倒时身体顺势往后挪一点
    rig.centered.position.z = rig.baseZ - (H / 2) * Math.sin(ang) * 0.55;
    // 贴地：按当前「俯仰 + 侧滚 + 转身」算包围盒底边，保证任何角度都不穿地、也不悬空
    var e = new T.Matrix4().makeRotationFromEuler(rig.centered.rotation).elements;
    var sc = rig.centered.scale, bs = rig.baseScale;
    var extent = Math.abs(e[1]) * rig.hx * (sc.x / bs.x) +
                 Math.abs(e[5]) * rig.hy * (sc.y / bs.y) +
                 Math.abs(e[9]) * rig.hz * (sc.z / bs.z);
    rig.centered.position.y = rig.groundY + extent + lift - rig.restLift;
  }

  // 蹦一下：整体起跳（这个模型胳膊与身体共网格，侧抬会拉出薄片）
  function applyJump(t, env, wave) {
    var p = Math.min(1, t / 1.5);
    var hop = Math.sin(Math.PI * p);
    rig.centered.position.y = rig.baseY + 0.26 * hop;
    var stretch = 0.06 * hop - 0.05 * (1 - hop);
    rig.centered.scale.set(
      rig.baseScale.x * (1 - stretch),
      rig.baseScale.y * (1 + stretch),
      rig.baseScale.z * (1 - stretch)
    );
    if (rig.bones.LeftArm && rig.bones.RightArm) {
      rotWorld("LeftArm", [[[0, 1, 0], -0.28 * hop]]);
      rotWorld("RightArm", [[[0, 1, 0], 0.28 * hop]]);
    }
  }




  var ACTIONS = {
    laugh: { label: "捧腹大笑", ms: 4700, rampIn: 0.01, rampOut: 0.01, freq: 1, sound: "audio/laugh.mp3?v=2", bubble: "哈哈哈哈哈哈——笑岔气了", fx: true, apply: applyLaugh },
    jump: { label: "蹦一下", ms: 1500, rampIn: 0.05, rampOut: 0.05, freq: 1, apply: applyJump }
  };

  function envelope(t, def) {
    var dur = def.ms / 1000;
    var rampIn = Math.min(1, t / def.rampIn);
    var rampOut = t > dur - def.rampOut ? Math.max(0, (dur - t) / def.rampOut) : 1;
    return (rampIn * rampIn * (3 - 2 * rampIn)) * (rampOut * rampOut * (3 - 2 * rampOut));
  }

  function playAction(name, btn) {
    var def = ACTIONS[name];
    if (!def || !rig) return;
    if (def.needsBones && !rig.bones.Spine) {
      setStatus("这个模型没有骨骼，暂时只能做「捧腹大笑」。");
      return;
    }
    stopAction();
    resetRig();
    active = def;
    activeStart = performance.now();
    setActiveAct(btn || document.querySelector('.p3-act[data-act="' + name + '"]'));
    if (def.bubble) {
      bubble.textContent = def.bubble;
      bubble.classList.remove("hidden");
    }
    if (def.fx) burstLaugh();
    // 手机上动作区在展台上方，点完先滚到展台，别让人对着按钮看不到角色
    if (window.matchMedia && window.matchMedia("(max-width: 720px)").matches) {
      var stageEl = document.getElementById("stage");
      if (stageEl) {
        var sr = stageEl.getBoundingClientRect();
        if (sr.bottom > window.innerHeight - 96 || sr.top < 60) {
          stageEl.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }
    }
    if (def.sound && soundOn) {
      var audio = new Audio(def.sound);
      laughAudio = audio;
      audio.volume = 0.92;
      audio.play().catch(function () {});
    }
    setStatus(def.label + " · 播放一次");
  }

  function stopAction() {
    if (!active) return;
    active = null;
    if (laughAudio) { laughAudio.pause(); laughAudio = null; }
    clearTimeout(bubbleTimer);
    bubble.classList.add("hidden");
    setActiveAct(null);
    resetRig();
  }

  function updateAction(now) {
    if (!active || !rig) return;
    var t = frozen != null ? frozen : (now - activeStart) / 1000;
    if (frozen == null && t >= active.ms / 1000) { stopAction(); return; }
    active.apply(t, envelope(t, active), Math.sin(t * Math.PI * 2 * (active.freq || 1)));
  }

  function updateActAvailability() {
    var hasBones = !!(rig && rig.bones.Spine);
    document.querySelectorAll(".p3-act[data-act]").forEach(function (btn) {
      var def = ACTIONS[btn.dataset.act];
      btn.disabled = !!(def && def.needsBones && !hasBones);
    });
  }

  function refreshSoundBtn() {
    var button = document.getElementById("soundBtn");
    if (!button) return;
    button.textContent = soundOn ? "🔊 有声音" : "🔇 静音";
    button.setAttribute("aria-pressed", String(soundOn));
    button.title = soundOn ? "点击静音：只做动作、不出声" : "点击开启动作声音";
    if (!soundOn && laughAudio) { laughAudio.pause(); laughAudio = null; }
  }

  function updateActNote() {
    var note2 = document.getElementById("actNote");
    if (!note2) return;
    var tab = document.querySelector(".p3-cat.on");
    var mood = !tab || tab.dataset.cat === "mood";
    if (!rig) { note2.textContent = ""; return; }
    if (!rig.bones.Spine) {
      note2.textContent = mood
        ? "照视频里的演法：站着笑到抖，越笑越后仰，笑岔气直接歪倒在地、侧躺着滚两下再爬起来。"
        : "蹦一下：原地跳起再落回，不带动骨骼。";
      return;
    }
    note2.textContent = mood
      ? "点一下：笑到抖、笑到后仰，然后歪倒在地滚两下再爬起来。"
      : "蹦一下：原地跳起再落回。";
  }

  document.querySelectorAll(".p3-cat").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".p3-cat").forEach(function (el) {
        var on = el === tab;
        el.classList.toggle("on", on);
        el.setAttribute("aria-selected", String(on));
      });
      document.querySelectorAll(".p3-act-list").forEach(function (panel) {
        panel.classList.toggle("hidden", panel.dataset.panel !== tab.dataset.cat);
      });
      updateActNote();
    });
  });
  document.querySelectorAll(".p3-act").forEach(function (btn) {
    btn.addEventListener("click", function () { playAction(btn.dataset.act, btn); });
  });
  var soundBtnEl = document.getElementById("soundBtn");
  if (soundBtnEl) {
    soundBtnEl.addEventListener("click", function () {
      soundOn = !soundOn;
      try { localStorage.setItem("p3-sound", soundOn ? "on" : "off"); } catch (e) {}
      refreshSoundBtn();
    });
    refreshSoundBtn();
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
      button.textContent = "📌 收回浏览器小窗";
      pipWindow.addEventListener("pagehide", function () {
        document.querySelector(".p3-main").insertBefore(stage, document.querySelector(".p3-side"));
        stage.classList.remove("in-pip");
        pipWindow = null;
        button.textContent = "📌 浏览器小窗";
        resize();
      });
    } catch (e) { setStatus("浏览器小窗暂时无法打开，请允许浏览器打开小窗。"); }
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
    document.getElementById("pinBtn").hidden = true;
  }
  window.addEventListener("pagehide", function (e) {
    ++loadVersion;
    stopAction();
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
    updateAction(now);
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
    currentId: function () { return currentId; },
    act: function (name, withSound) {
      frozen = null;
      if (withSound === false) soundOn = false;
      playAction(name);
      return !!(active && active.label === (ACTIONS[name] || {}).label);
    },
    poseAt: function (name, t) {
      var def = ACTIONS[name];
      if (!def || !rig) return false;
      stopAction();
      active = def;
      activeStart = performance.now() - t * 1000;
      def.apply(t, 1, Math.sin(t * Math.PI * 2 * (def.freq || 1)));
      frozen = t;                       // 定格在这一帧，方便截图比对
      renderer.render(scene, camera);
      return true;
    },
    stopAction: function () { frozen = null; stopAction(); },
    rig: function () { return rig; },
    bones: function () { return rig ? Object.keys(rig.bones) : []; }
  };
})();
