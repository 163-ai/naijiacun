/* 奶家村 · 真 3D 形象展台
 * ---------------------------------------------------------------
 * 不是贴图假立体：这里真的建出了网格。
 *   1. js/3d-data.js 给出 128x128 的「高度图」和「alpha 轮廓」
 *   2. PlaneGeometry 的每个顶点按高度沿 Z 抬起 → computeVertexNormals 得法线
 *   3. 沿 alpha 轮廓补一圈侧壁 → 有厚度的封闭几何体
 *   4. MeshStandardMaterial + 方向光 + 阴影 → 真实光照
 *   5. 拖拽改 model.rotation → 360° 转着看
 *
 * 贴图以 data URI 打包在 js/3d-data.js 里，不 fetch、不 getImageData，
 * 所以双击 file:// 打开也能跑（WebGL 对 file:// 的跨域纹理会拒绝）。
 */
(function () {
  "use strict";

  var T = window.THREE;
  var PACK = window.N3D || {};
  var LIST = (typeof PEOPLE !== "undefined" && PEOPLE) ? PEOPLE : (window.PEOPLE || []);
  var W = 2.0;            // 模型世界宽度
  var THICK = 0.26;       // 基础厚度（侧壁高度，决定侧转时露出的边）
  var BULGE = 0.32;       // 浮雕隆起量（太大正面会出现明显明暗块）
  var ALPHA_CUT = 110;    // 轮廓判定阈值

  var stage = document.getElementById("stage");
  var canvas = document.getElementById("gl");
  var loading = document.getElementById("loading");
  var fallback = document.getElementById("fallback");
  var bubble = document.getElementById("bubble");
  var chipsBox = document.getElementById("chips");
  var note = document.getElementById("status");

  if (!T || !stage || !canvas) {
    showFallback("3D 引擎没加载成功，请检查 vendor/three.min.js 是否存在。");
    return;
  }

  var renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) {
    showFallback("这个浏览器暂时用不了 WebGL：" + (e && e.message ? e.message : e));
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  var scene = new T.Scene();
  var camera = new T.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 0.20, 4.7);
  camera.lookAt(0, 0, 0);

  scene.add(new T.AmbientLight(0xffffff, 1.10));
  var key = new T.DirectionalLight(0xfff1dc, 1.65);
  key.position.set(2.6, 3.4, 4.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -2.2; key.shadow.camera.right = 2.2;
  key.shadow.camera.top = 2.2; key.shadow.camera.bottom = -2.2;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 14;
  key.shadow.bias = -0.0012;
  scene.add(key);
  var fill = new T.DirectionalLight(0xbcd6ff, 0.75);
  fill.position.set(-3.2, 1.0, -2.2);
  scene.add(fill);
  var rim = new T.PointLight(0xffd9a8, 1.1, 14);
  rim.position.set(0, 1.6, -2.8);
  scene.add(rim);

  // 地面只接收阴影，本身透明
  var ground = new T.Mesh(new T.PlaneGeometry(14, 14), new T.ShadowMaterial({ opacity: 0.20 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.16;
  ground.receiveShadow = true;
  scene.add(ground);

  var model = null;
  var currentId = "";
  var texCache = {};
  var yaw = -0.18, pitch = 0.0;
  var velYaw = 0, velPitch = 0;
  var dragging = false, lastX = 0, lastY = 0;
  var autoSpin = true, wireframe = false;
  var audioEl = null;
  var bubbleTimer = 0;
  var pipWindow = null;

  // ---------- 工具 ----------
  function showFallback(msg) {
    if (loading) loading.classList.add("hidden");
    if (fallback) {
      fallback.classList.remove("hidden");
      fallback.textContent = msg + " 可以先回 2D 桌宠页看看。";
    }
  }
  function setStatus(s) { if (note) note.textContent = s; }
  function byId(id) {
    for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i];
    return null;
  }
  function decode(s) {
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function textureFor(id, uri) {
    if (texCache[id]) return texCache[id];
    var t = new T.TextureLoader().load(uri);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texCache[id] = t;
    return t;
  }
  function disposeMesh(root) {
    root.traverse(function (o) {
      if (!o.isMesh) return;
      if (o.geometry) o.geometry.dispose();
      var mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(function (m) { if (m) m.dispose(); });
    });
  }

  // ---------- 几何：把一张平面顶成有厚度的立体网格 ----------
  function buildMesh(id) {
    var d = PACK[id];
    if (!d) return null;
    var N = d.n;
    var H = decode(d.h);      // 行优先，第 0 行 = 图像顶部
    var A = decode(d.a);
    var SEG = N - 1;

    var topGeo = new T.PlaneGeometry(W, W, SEG, SEG);
    var pos = topGeo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      pos.setZ(i, THICK + BULGE * (H[i] / 255));
    }
    pos.needsUpdate = true;
    topGeo.computeVertexNormals();

    var tex = textureFor(id, d.tex);
    var topMat = new T.MeshStandardMaterial({
      map: tex, alphaTest: 0.22, transparent: true, depthWrite: true,
      side: T.DoubleSide, roughness: 0.64, metalness: 0.02
    });

    // 背面：把同一张网格压平到 z=0，暗化后当作底板
    var backGeo = topGeo.clone();
    var bp = backGeo.attributes.position;
    for (var j = 0; j < bp.count; j++) bp.setZ(j, 0);
    bp.needsUpdate = true;
    backGeo.computeVertexNormals();
    var backMat = new T.MeshStandardMaterial({
      map: tex, color: 0x6b5f52, alphaTest: 0.22, transparent: true,
      side: T.DoubleSide, roughness: 0.95
    });

    // 侧壁：沿 alpha 轮廓，从顶面 z 拉到 z=0
    var skirt = buildSkirt(H, A, N, d.edge);
    var skirtGeo = new T.BufferGeometry();
    skirtGeo.setAttribute("position", new T.Float32BufferAttribute(skirt.p, 3));
    skirtGeo.setAttribute("normal", new T.Float32BufferAttribute(skirt.n, 3));
    skirtGeo.setAttribute("color", new T.Float32BufferAttribute(skirt.c, 3));
    skirtGeo.setIndex(skirt.idx);
    var skirtMat = new T.MeshStandardMaterial({
      vertexColors: true, side: T.DoubleSide, roughness: 0.88, metalness: 0.0
    });

    var g = new T.Group();
    var a = new T.Mesh(topGeo, topMat);
    var b = new T.Mesh(backGeo, backMat);
    var c = new T.Mesh(skirtGeo, skirtMat);
    [a, b, c].forEach(function (m) { m.castShadow = true; g.add(m); });
    g.userData.mats = [topMat, backMat, skirtMat];
    g.userData.mats.forEach(function (m) {
      m.userData.orig = { map: m.map || null, color: m.color ? m.color.clone() : null };
    });
    g.userData.verts = pos.count + skirt.p.length / 3;
    return g;
  }

  function buildSkirt(H, A, N, edgeHex) {
    var p = [], nrm = [], col = [], idx = [];
    var cell = W / N;
    var c = new T.Color(edgeHex || "#c9a45a").multiplyScalar(0.42);
    c.lerp(new T.Color(0x2a2018), 0.42);      // 偏深棕，侧转时厚度一眼可见
    var cr = c.r, cg = c.g, cb = c.b;

    function solid(x, y) { return x >= 0 && y >= 0 && x < N && y < N && A[y * N + x] > ALPHA_CUT; }
    function zAt(x, y) { return THICK + BULGE * (H[y * N + x] / 255); }
    function quad(pts, n) {
      var base = p.length / 3;
      for (var k = 0; k < 4; k++) {
        p.push(pts[k][0], pts[k][1], pts[k][2]);
        nrm.push(n[0], n[1], n[2]);
        col.push(cr, cg, cb);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }

    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        if (!solid(x, y)) continue;
        var x0 = x * cell - W / 2, x1 = (x + 1) * cell - W / 2;
        var y0 = W / 2 - y * cell, y1 = W / 2 - (y + 1) * cell;
        var z = zAt(x, y);
        if (!solid(x + 1, y)) quad([[x1, y0, z], [x1, y1, z], [x1, y1, 0], [x1, y0, 0]], [1, 0, 0]);
        if (!solid(x - 1, y)) quad([[x0, y0, z], [x0, y1, z], [x0, y1, 0], [x0, y0, 0]], [-1, 0, 0]);
        if (!solid(x, y - 1)) quad([[x0, y0, z], [x1, y0, z], [x1, y0, 0], [x0, y0, 0]], [0, 1, 0]);
        if (!solid(x, y + 1)) quad([[x0, y1, z], [x1, y1, z], [x1, y1, 0], [x0, y1, 0]], [0, -1, 0]);
      }
    }
    return { p: p, n: nrm, c: col, idx: idx };
  }

  // ---------- 角色切换 ----------
  function setCharacter(id) {
    if (!PACK[id]) { setStatus("这个角色还没有 3D 资产"); return; }
    if (model) { scene.remove(model); disposeMesh(model); model = null; }
    model = buildMesh(id);
    if (!model) return;
    scene.add(model);
    model.rotation.set(pitch, yaw, 0);
    currentId = id;
    Array.prototype.forEach.call(chipsBox.querySelectorAll(".p3-chip"), function (el) {
      el.classList.toggle("active", el.getAttribute("data-id") === id);
    });
    var p = byId(id);
    setStatus((p ? p.name : id) + " · " + Math.round(model.userData.verts).toLocaleString() + " 个顶点 / 真实几何");
  }

  // ---------- 交互 ----------
  function resize() {
    var w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

  function onDown(e) {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    velYaw = velPitch = 0;
    stage.classList.add("grabbing");
    if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) {} }
  }
  function onMove(e) {
    if (!dragging) return;
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    yaw += dx * 0.009;
    pitch = Math.max(-0.55, Math.min(0.55, pitch + dy * 0.006));
    velYaw = dx * 0.0022; velPitch = dy * 0.0014;
  }
  function onUp() { dragging = false; stage.classList.remove("grabbing"); }
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    camera.position.z = Math.max(2.8, Math.min(7.5, camera.position.z + e.deltaY * 0.0022));
  }, { passive: false });
  canvas.addEventListener("dblclick", resetView);

  function resetView() {
    yaw = -0.18; pitch = 0; velYaw = velPitch = 0;
    camera.position.z = 4.7;
    setStatus("视角已复位");
  }

  function showBubble(text) {
    if (!bubble) return;
    bubble.textContent = text;
    bubble.classList.remove("hidden");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () { bubble.classList.add("hidden"); }, 3200);
  }
  function play(file, okText) {
    try {
      if (audioEl) { audioEl.pause(); audioEl = null; }
      audioEl = new Audio(file);
      audioEl.play().then(function () { if (okText) showBubble(okText); })
        .catch(function () { setStatus("音频播放失败（浏览器可能要求先点一下页面）"); });
    } catch (e) { setStatus("音频不可用"); }
  }
  function talk() {
    var p = byId(currentId);
    play("audio/" + currentId + ".mp3", (p && p.quote) || "你好呀～");
  }

  // ---------- 置顶小窗（Document Picture-in-Picture） ----------
  async function togglePin() {
    if (!("documentPictureInPicture" in window)) return;
    if (pipWindow) { pipWindow.close(); return; }
    try {
      pipWindow = await window.documentPictureInPicture.requestWindow({ width: 420, height: 460 });
      pipWindow.document.body.style.cssText = "margin:0;background:#faf7f2;overflow:hidden";
      // PiP 文档是独立 document，样式要用绝对地址，且需带上 style.css 的 CSS 变量
      ["css/style.css", "css/pet3d.css"].forEach(function (href) {
        var link = pipWindow.document.createElement("link");
        link.rel = "stylesheet";
        link.href = new URL(href, window.location.href).href;
        pipWindow.document.head.appendChild(link);
      });
      pipWindow.document.body.appendChild(stage);
      stage.classList.add("in-pip");
      resize();
      var btn = document.getElementById("pinBtn");
      if (btn) btn.textContent = "📌 收回小窗";
      pipWindow.addEventListener("pagehide", function () {
        document.querySelector(".p3-main").insertBefore(stage, document.querySelector(".p3-side"));
        stage.classList.remove("in-pip");
        pipWindow = null;
        if (btn) btn.textContent = "📌 置顶小窗";
        resize();
      });
    } catch (e) { setStatus("置顶小窗没打开：" + (e && e.message ? e.message : e)); }
  }

  // ---------- UI ----------
  function buildChips() {
    var html = "";
    LIST.forEach(function (p) {
      if (!PACK[p.id]) return;
      html += '<button class="p3-chip" data-id="' + p.id + '">' +
        '<img src="assets/3d/' + p.id + '.png" alt="">' +
        '<span>' + p.name + '</span></button>';
    });
    chipsBox.innerHTML = html;
    chipsBox.addEventListener("click", function (e) {
      var el = e.target.closest(".p3-chip");
      if (el) setCharacter(el.getAttribute("data-id"));
    });
  }
  function bind(id, fn) { var el = document.getElementById(id); if (el) el.addEventListener("click", fn); }
  function toggleBtn(id, on) {
    var el = document.getElementById(id);
    if (el) { el.setAttribute("aria-pressed", String(on)); el.classList.toggle("on", on); }
  }

  bind("spinBtn", function () { autoSpin = !autoSpin; toggleBtn("spinBtn", autoSpin); });
  bind("wireBtn", function () {
    wireframe = !wireframe; toggleBtn("wireBtn", wireframe);
    if (model) model.userData.mats.forEach(function (m) {
      var o = m.userData.orig || {};
      m.wireframe = wireframe;
      m.map = wireframe ? null : o.map;
      if (m.color && o.color) { if (wireframe) m.color.set(0x0f6e56); else m.color.copy(o.color); }
      m.needsUpdate = true;
    });
    setStatus(wireframe ? "线框模式：可以看到实际的三角网格" : "已恢复正常渲染");
  });
  bind("talkBtn", talk);
  bind("clipBtn", function () { play("assets/audio/" + currentId + ".mp3", "🎵 原声片段"); });
  bind("resetBtn", resetView);
  bind("pinBtn", togglePin);
  if (!("documentPictureInPicture" in window)) {
    var pb = document.getElementById("pinBtn");
    if (pb) { pb.disabled = true; pb.title = "需要 Edge / Chrome 116+"; }
  }

  // ---------- 主循环 ----------
  var t0 = performance.now();
  function loop() {
    requestAnimationFrame(loop);
    var t = (performance.now() - t0) / 1000;
    if (!dragging) {
      if (autoSpin) yaw += 0.0035;
      yaw += velYaw; pitch += velPitch;
      velYaw *= 0.93; velPitch *= 0.93;
      pitch = Math.max(-0.55, Math.min(0.55, pitch));
    }
    if (model) {
      model.rotation.set(pitch, yaw, 0);
      model.position.y = Math.sin(t * 1.15) * 0.035;   // 轻轻漂浮
    }
    renderer.render(scene, camera);
  }

  // ---------- 启动 ----------
  buildChips();
  resize();
  toggleBtn("spinBtn", autoSpin);
  var first = LIST.length && PACK[LIST[0].id] ? LIST[0].id : Object.keys(PACK)[0];
  setCharacter(first);
  if (loading) loading.classList.add("hidden");
  loop();
  window.__p3 = {
    setCharacter: setCharacter,
    resetView: resetView,
    setAngle: function (y, p) { yaw = y; pitch = p || 0; velYaw = velPitch = 0; },
    spin: function (on) { autoSpin = on; },
    scene: scene,
    model: function () { return model; }
  };
})();
