// 奶家村 · 桌宠引擎
//
// 这个文件把「角色」变成一个会在屏幕上活动的宠物：待机呼吸、随机走动、
// 瞌睡、被拖动、点一下说话。它既能在页面里跑，也能被搬到一个「始终置顶」
// 的小窗里（Chrome/Edge 116+ 的 Document Picture-in-Picture）。
//
// 用法：
//   var pet = NaijiacunPet.create({ board: 舞台元素, id: "nailong", size: 132 })
//   pet.say("你好")           // 弹气泡（并朗读）
//   pet.setCharacter("naiwa") // 换角色
//   NaijiacunPet.openPin(pet) // 搬到置顶小窗
//
// 注意：所有定位都相对 board 的左上角，board 需要 position: relative。

(function () {
  "use strict";

  var WALK_SPEED = 52;        // 像素/秒
  var SLEEP_AFTER = 18000;    // 无互动多久后打瞌睡
  var WAKE_DIST = 130;        // 鼠标靠这么近就醒

  var peopleCache = null;

  function people() {
    if (peopleCache) return peopleCache;
    peopleCache = (typeof PEOPLE !== "undefined" && Array.isArray(PEOPLE)) ? PEOPLE : [];
    return peopleCache;
  }

  function findPerson(id) {
    var list = people();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  // ---------- 形象 ----------
  // 2.5D：用同一张原始 PNG 叠 4 层（1 层正面 + 3 层沿 Z 轴后退的暗层），
  // 旋转时露出"厚度"，正面看仍是原图本身——不生成、不修改任何形象素材。
  // SVG / emoji 兜底只叠一层，避免 SVG 内部 id 重复。
  function figureHTML(id) {
    var p = findPerson(id);

    if (p && (p.petImage || p.image)) {
      var src = new URL(p.petImage || p.image, document.baseURI).href;
      var img = function (alt) {
        return '<img class="pet-img' + (p.petImage ? ' pet-img--full' : '') + '" src="' + src + '" alt="' + alt + '" draggable="false">';
      };
      return '<div class="pet-depth" style="--pet-mask:url(\'' + src + '\')">' +
        '<div class="pet-slab pet-slab--b3">' + img("") + '</div>' +
        '<div class="pet-slab pet-slab--b2">' + img("") + '</div>' +
        '<div class="pet-slab pet-slab--b1">' + img("") + '</div>' +
        '<div class="pet-slab pet-slab--front">' + img(p.name || "") + '</div>' +
        '<div class="pet-rim"></div>' +
      '</div>';
    }

    var art = "";
    var A = window.NaijiacunAvatars;
    if (A) {
      var s = A.svg(id);
      if (s) art = s;
      else if (p && p.name) art = A.initial(p.name);
    }
    if (!art) art = '<span class="pet-emoji">' + ((p && p.emoji) || "🙂") + "</span>";
    return '<div class="pet-depth"><div class="pet-slab pet-slab--front">' + art + '</div></div>';
  }

  // ---------- 桌宠实例 ----------
  function Pet(opts) {
    opts = opts || {};

    this.host = opts.host || window;          // 提供 requestAnimationFrame / 尺寸
    this.board = opts.board || document.body; // 活动区域
    this.id = opts.id || "nailong";
    this.size = opts.size || 132;
    this.onSpeak = opts.onSpeak || null;      // 需要朗读时的回调，没给就只弹气泡

    this.x = 0;
    this.y = 0;
    this.tx = 0;
    this.ty = 0;
    this.state = "idle";      // idle | walk | drag | sleep
    this.facing = 1;
    this.lastTouch = Date.now();
    this.frame = 0;
    this.nextTimer = 0;
    this.bubbleTimer = 0;
    this.pointer = null;
    this.destroyed = false;
    this.pinned = false;
    this.depth = true;
    this.renderView = null;
    // 2.5D 视角：x/y 是当前角度，tx/ty 是目标角度，lift 是离地高度
    this.gaze = { x: 0, y: 0, tx: 0, ty: 0, lift: 0 };

    this._build();
    this._place();
    this._bind();
    this._bindGaze();
    this._tick();

    var self = this;
    this._resize = function () { self._clampIntoBoard(); };
    this.host.addEventListener("resize", this._resize);
  }

  Pet.prototype._build = function () {
    var doc = this.board.ownerDocument;

    var el = doc.createElement("div");
    el.className = "pet is-idle";
    el.style.width = this.size + "px";
    el.style.height = this.size + "px";

    var inner = doc.createElement("div");
    inner.className = "pet-inner";

    var body = doc.createElement("div");
    body.className = "pet-body";
    body.innerHTML = figureHTML(this.id);

    var shadow = doc.createElement("div");
    shadow.className = "pet-shadow";

    inner.appendChild(shadow);
    inner.appendChild(body);

    var bubble = doc.createElement("div");
    bubble.className = "pet-bubble";

    var zzz = doc.createElement("div");
    zzz.className = "pet-zzz";
    zzz.innerHTML = "<span>z</span><span>z</span><span>Z</span>";

    el.appendChild(inner);
    el.appendChild(bubble);
    el.appendChild(zzz);
    this.board.appendChild(el);

    this.el = el;
    this.inner = inner;
    this.bodyEl = body;
    this.bubbleEl = bubble;
    this.zzzEl = zzz;
  };

  // 初始位置：舞台右下角
  Pet.prototype._place = function () {
    var w = this.board.clientWidth || 320;
    var h = this.board.clientHeight || 320;
    this.x = Math.max(12, w - this.size - 28);
    this.y = Math.max(12, h - this.size - 20);
    this.tx = this.x;
    this.ty = this.y;
    this._paint();
  };

  Pet.prototype._bounds = function () {
    return {
      maxX: Math.max(0, (this.board.clientWidth || 0) - this.size),
      maxY: Math.max(0, (this.board.clientHeight || 0) - this.size)
    };
  };

  Pet.prototype._clampIntoBoard = function () {
    var b = this._bounds();
    this.x = clamp(this.x, 0, b.maxX);
    this.y = clamp(this.y, 0, b.maxY);
    if (this.state === "walk") {
      this.tx = clamp(this.tx, 0, b.maxX);
      this.ty = clamp(this.ty, 0, b.maxY);
    }
    this._paint();
  };

  Pet.prototype._paint = function () {
    this.el.style.transform = "translate3d(" + Math.round(this.x) + "px," + Math.round(this.y) + "px,0)";
    // 朝向用 CSS 变量传，这样可以被呼吸/走路的动画叠加而不互相覆盖
    this.bodyEl.style.setProperty("--facing", String(this.facing));
  };

  Pet.prototype._setState = function (state) {
    this.state = state;
    this.el.className = "pet is-" + state;
  };

  // ---------- 交互 ----------
  Pet.prototype._bind = function () {
    var self = this;

    this._down = function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      self.wake();
      var box = self.board.getBoundingClientRect();
      self.pointer = {
        id: e.pointerId,
        grabX: e.clientX - box.left - self.x,
        grabY: e.clientY - box.top - self.y,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        at: Date.now()
      };
      self._setState("drag");
      if (self.el.setPointerCapture) {
        try { self.el.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      }
      e.preventDefault();
    };

    this._move = function (e) {
      if (!self.pointer || e.pointerId !== self.pointer.id) return;
      var box = self.board.getBoundingClientRect();
      var b = self._bounds();
      var dx = e.clientX - self.pointer.startX;
      var dy = e.clientY - self.pointer.startY;
      if (!self.pointer.moved && Math.sqrt(dx * dx + dy * dy) > 6) self.pointer.moved = true;

      self.x = clamp(e.clientX - box.left - self.pointer.grabX, 0, b.maxX);
      self.y = clamp(e.clientY - box.top - self.pointer.grabY, 0, b.maxY);
      self._paint();
    };

    this._up = function (e) {
      if (!self.pointer || e.pointerId !== self.pointer.id) return;
      var p = self.pointer;
      self.pointer = null;

      var quick = Date.now() - p.at < 320;
      if (!p.moved && quick) {
        self.talk();
        if (self.renderView && self.renderView.playAction) self.renderView.playAction("laugh");
      } else {
        self._setState("idle");
        self._schedule();
      }
      if (self.el.releasePointerCapture) {
        try { self.el.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      }
    };

    this.el.addEventListener("pointerdown", this._down);
    this.el.addEventListener("pointermove", this._move);
    this.el.addEventListener("pointerup", this._up);
    this.el.addEventListener("pointercancel", this._up);
  };

  // ---------- 2.5D 视角：指针在哪，它就朝哪边转 ----------
  // 监听挂在 document 上（而不是宠物自身），所以鼠标在舞台任意位置都会跟随；
  // 搬到置顶小窗后会重新绑定到小窗的 document。
  Pet.prototype._bindGaze = function () {
    var self = this;
    this._gazeDoc = this.board.ownerDocument;

    this._onGazeMove = function (e) {
      if (self.destroyed || !self.depth) return;
      var box = self.board.getBoundingClientRect();
      var cx = self.x + self.size / 2;
      var cy = self.y + self.size * 0.45;
      var nx = clamp((e.clientX - box.left - cx) / (box.width || 320), -1, 1);
      var ny = clamp((e.clientY - box.top - cy) / (box.height || 320), -1, 1);
      self.gaze.tx = nx * 27;   // 左右最多转 27°
      self.gaze.ty = -ny * 15;  // 上下最多转 15°
    };

    this._gazeDoc.addEventListener("pointermove", this._onGazeMove, { passive: true });
  };

  Pet.prototype._unbindGaze = function () {
    if (this._gazeDoc && this._onGazeMove) {
      this._gazeDoc.removeEventListener("pointermove", this._onGazeMove);
    }
    this._gazeDoc = null;
  };

  // 开关 2.5D（切回原来的平面观感）
  Pet.prototype.setDepth = function (on) {
    this.depth = !!on;
    this.el.classList.toggle("is-flat", !on);
    if (!on) {
      this.gaze.tx = 0;
      this.gaze.ty = 0;
      this.bodyEl.style.setProperty("--rx", "0deg");
      this.bodyEl.style.setProperty("--ry", "0deg");
      this.bodyEl.style.setProperty("--lift", "0px");
      this.bodyEl.style.setProperty("--tilt", "0deg");
    }
  };

  // ---------- 行为 ----------
  Pet.prototype.wake = function () {
    this.lastTouch = Date.now();
    if (this.state === "sleep") {
      this._setState("idle");
      this._schedule();
    }
  };

  Pet.prototype._schedule = function () {
    var self = this;
    clearTimeout(this.nextTimer);
    this.nextTimer = setTimeout(function () {
      if (self.destroyed || self.pointer) return;
      if (Date.now() - self.lastTouch > SLEEP_AFTER) {
        self._sleep();
        return;
      }
      if (Math.random() < 0.62) self._walkTo();
      else {
        self._setState("idle");
        self.facing = Math.random() < 0.5 ? -1 : 1;
        self._paint();
      }
      self._schedule();
    }, rand(2200, 5200));
  };

  Pet.prototype._sleep = function () {
    this._setState("sleep");
    var self = this;
    clearTimeout(this.nextTimer);
    this.nextTimer = setTimeout(function () {
      if (self.destroyed) return;
      if (Date.now() - self.lastTouch > SLEEP_AFTER) self._sleep();
      else { self._setState("idle"); self._schedule(); }
    }, 3000);
  };

  Pet.prototype._walkTo = function (gait) {
    this.gait = gait || "walk";
    var b = this._bounds();
    var tries = 0;
    var tx = this.x;
    var ty = this.y;

    // 找一个有意义的距离，避免原地抖动
    while (tries++ < 8) {
      tx = rand(8, Math.max(9, b.maxX - 8));
      ty = rand(8, Math.max(9, b.maxY - 8));
      var d = Math.sqrt((tx - this.x) * (tx - this.x) + (ty - this.y) * (ty - this.y));
      if (d > 70) break;
    }

    this.tx = clamp(tx, 0, b.maxX);
    this.ty = clamp(ty, 0, b.maxY);
    this.facing = this.tx < this.x ? -1 : 1;
    this._paint();
    this._setState("walk");
  };

  Pet.prototype._tick = function () {
    var self = this;
    var last = Date.now();
    var lastRender = last;

    function frame() {
      if (self.destroyed) return;
      var now = Date.now();
      var dt = Math.min(64, now - last) / 1000;
      last = now;

      if (self.state === "walk") {
        var dx = self.tx - self.x;
        var dy = self.ty - self.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var step = WALK_SPEED * (self.gait === "run" ? 1.8 : 1) * dt;

        if (dist <= step || dist < 1) {
          self.x = self.tx;
          self.y = self.ty;
          self._setState("idle");
          self._paint();
        } else {
          self.x += (dx / dist) * step;
          self.y += (dy / dist) * step;
          self._paint();
        }
      }

      if (self.state === "idle" && now - self.lastTouch > SLEEP_AFTER) {
        self._sleep();
      }

      // 2.5D：角度平滑插值 + 一点点自主摆动，让它不像贴图
      if (self.depth) {
        var t = now / 1000;
        var g = self.gaze;
        g.x += (g.tx + Math.sin(t * 0.7) * 2.2 - g.x) * 0.075;
        g.y += (g.ty + Math.cos(t * 0.55) * 1.4 - g.y) * 0.075;
        g.lift += ((self.state === "drag" ? 26 : 0) - g.lift) * 0.12;

        var b = self.bodyEl.style;
        b.setProperty("--ry", (g.x * self.facing).toFixed(2) + "deg");
        b.setProperty("--rx", g.y.toFixed(2) + "deg");
        b.setProperty("--lift", g.lift.toFixed(1) + "px");
        b.setProperty("--tilt", (self.state === "walk" ? Math.sin(t * 9) * 3 : 0).toFixed(2) + "deg");
        b.setProperty("--shadow-x", (-g.x * 0.45).toFixed(1) + "px");
        b.setProperty("--shadow-scale", (1 + g.lift / 130).toFixed(3));
      }

      if (self.renderView && !self.board.ownerDocument.hidden && self.el.style.visibility !== "hidden" && now - lastRender >= 32) {
        var motion = self.state === "walk" ? self.gait : self.state === "drag" ? "dragged" : "idle";
        if (motion !== self._viewMotion) { self.renderView.setMotion(motion); self._viewMotion = motion; }
        self.renderView.setFacing(self.facing);
        self.renderView.update(Math.min(0.08, (now - lastRender) / 1000));
        self.el.dataset.renderMode = self.renderView.mode;
        lastRender = now;
      }

      self.frame = self.host.requestAnimationFrame(frame);
    }

    this.frame = this.host.requestAnimationFrame(frame);
  };

  // ---------- 对外动作 ----------
  Pet.prototype.say = function (text, opts) {
    opts = opts || {};
    if (!text) return;

    this.wake();
    this.bubbleEl.textContent = text;
    this.bubbleEl.classList.add("show");

    clearTimeout(this.bubbleTimer);
    var hold = Math.min(7000, 1800 + text.length * 120);
    var self = this;
    this.bubbleTimer = setTimeout(function () {
      self.bubbleEl.classList.remove("show");
    }, hold);

    if (opts.speak !== false && typeof this.onSpeak === "function") {
      this.onSpeak(text, this.id);
    }
  };

  // 点一下：说一句自己的金句
  Pet.prototype.talk = function () {
    var p = findPerson(this.id);
    var line = (p && p.quote) || "……";
    this.say(line);
    // 说话时轻轻跳一下
    this.el.classList.remove("is-pop");
    void this.el.offsetWidth;
    this.el.classList.add("is-pop");
    var self = this;
    setTimeout(function () { self.el.classList.remove("is-pop"); }, 460);
  };

  Pet.prototype.setCharacter = function (id) {
    this.id = id;
    var result;
    if (this.renderView) result = this.renderView.setCharacter(id);
    else this.bodyEl.innerHTML = figureHTML(id);
    this.talk();
    return result;
  };

  Pet.prototype.setRenderer = function (view) {
    this.renderView = view;
    this.el.dataset.petRenderer = "true";
    this.setDepth(false);
    view.setSize(this.size);
    return view.setCharacter(this.id);
  };

  Pet.prototype.setSize = function (px) {
    this.size = px;
    this.el.style.width = px + "px";
    this.el.style.height = px + "px";
    if (this.renderView) this.renderView.setSize(px);
    this._clampIntoBoard();
  };

  // 让它自己随便走走（页面上「随便走走」按钮用）
  Pet.prototype.wander = function () {
    this.wake();
    this._walkTo("run");
    this._schedule();
  };

  // 搬家：换到另一个窗口（例如置顶小窗）
  Pet.prototype.moveTo = function (host, board) {
    try { this.host.cancelAnimationFrame(this.frame); } catch (err) { /* 忽略 */ }
    this.host.removeEventListener("resize", this._resize);
    this._unbindGaze();

    this.host = host;
    this.board = board;
    board.appendChild(this.el);
    this._bindGaze();

    this.pinned = host !== window;

    var self = this;
    this._resize = function () { self._clampIntoBoard(); };
    this.host.addEventListener("resize", this._resize);

    this._place();
    this._clampIntoBoard();
    this._setState("idle");
    this._tick();
    this._schedule();
  };

  Pet.prototype.destroy = function () {
    this.destroyed = true;
    if (this.renderView) this.renderView.destroy();
    this._unbindGaze();
    clearTimeout(this.nextTimer);
    clearTimeout(this.bubbleTimer);
    try { this.host.cancelAnimationFrame(this.frame); } catch (err) { /* 忽略 */ }
    this.host.removeEventListener("resize", this._resize);
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
  };

  // ---------- 置顶小窗（Document Picture-in-Picture） ----------
  function pinSupported() {
    return typeof window !== "undefined" && "documentPictureInPicture" in window;
  }

  function copyStylesInto(doc) {
    // 相对路径的样式表需要 base 才能正确加载
    var base = doc.createElement("base");
    base.href = document.baseURI;
    doc.head.appendChild(base);

    var nodes = document.querySelectorAll('link[rel="stylesheet"], style');
    for (var i = 0; i < nodes.length; i++) {
      doc.head.appendChild(nodes[i].cloneNode(true));
    }
  }

  // 打开置顶小窗，把宠物搬进去；关掉小窗会自动搬回 fallbackBoard
  function openPin(pet, fallbackBoard) {
    if (!pinSupported()) {
      return Promise.reject(new Error("当前浏览器不支持置顶小窗，请用 Edge / Chrome 116 以上版本"));
    }

    var side = Math.max(240, Math.round(pet.size * 1.9));
    return window.documentPictureInPicture
      .requestWindow({ width: side, height: side, disallowReturnToOpener: false })
      .then(function (pip) {
        copyStylesInto(pip.document);

        var wrap = pip.document.createElement("div");
        wrap.className = "pet-stage pet-stage--pin";
        pip.document.body.appendChild(wrap);
        pip.document.body.classList.add("pet-pin-body");

        pet.moveTo(pip, wrap);

        pip.addEventListener("pagehide", function () {
          if (fallbackBoard) {
            pet.moveTo(window, fallbackBoard);
            if (typeof pet.onUnpin === "function") pet.onUnpin();
          }
        });

        return pip;
      });
  }

  window.NaijiacunPet = {
    create: function (opts) { return new Pet(opts); },
    openPin: openPin,
    pinSupported: pinSupported,
    figureHTML: figureHTML
  };
})();
