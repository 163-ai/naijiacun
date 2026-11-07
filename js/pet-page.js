// 奶家村 · 桌宠页面控制
//
// 只做三件事：把角色列表画出来、把宠物挂上舞台、接上「置顶小窗」按钮。
// 宠物本身的行为（走路、瞌睡、拖动、说话）都在 js/pet.js 里。

(function () {
  "use strict";

  var stage = document.getElementById("petStage");
  var charBar = document.getElementById("charBar");
  var note = document.getElementById("petNote");
  var pinBtn = document.getElementById("pinBtn");
  var talkBtn = document.getElementById("talkBtn");
  var wanderBtn = document.getElementById("wanderBtn");
  var depthBtn = document.getElementById("depthBtn");
  var sizeRange = document.getElementById("sizeRange");

  function setNote(msg, kind) {
    note.textContent = msg || "";
    note.className = "pet-note" + (kind === "warn" ? " warn" : "");
  }

  // ---------- 复用主站的语音设置 ----------
  // 主站把配置写在 localStorage / sessionStorage 的 naijacun_tts 里，
  // 这里读同一份，这样在图鉴页填过 Key 的话，桌宠直接就能用真音色。
  function bootTTS() {
    if (!window.NaijiacunTTS) return;

    var raw = null;
    try {
      raw = localStorage.getItem("naijacun_tts") || sessionStorage.getItem("naijacun_tts");
    } catch (err) {
      return; // 隐私模式下读不到，用默认浏览器语音即可
    }
    if (!raw) return;

    try {
      var cfg = JSON.parse(raw);
      var t = window.NaijiacunTTS.config;
      t.endpoint = cfg.endpoint || "";
      t.apiKey = cfg.key || "";
      t.defaultVoiceId = cfg.voiceId || "";
      t.browserVoice = cfg.browserVoice || "";
      t.provider = cfg.key && t.endpoint ? "breeze" : "browser";
    } catch (err) {
      /* 配置损坏就忽略，回落到浏览器语音 */
    }
  }

  // tts.js 里的提示会调到这个函数
  window.showTTSNotice = function (msg) {
    setNote(msg, "warn");
  };

  bootTTS();

  // ---------- 创建宠物 ----------
  var pet = window.NaijiacunPet.create({
    board: stage,
    id: "nailong",
    size: parseInt(sizeRange.value, 10) || 132,
    onSpeak: function (text, id) {
      if (window.NaijiacunTTS) window.NaijiacunTTS.speak(text, id);
    }
  });

  // ---------- 角色切换 ----------
  var current = pet.id;

  function buildChips() {
    var list = (typeof PEOPLE !== "undefined" && PEOPLE) || [];
    charBar.innerHTML = "";
    list.forEach(function (p) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pet-chip" + (p.id === current ? " active" : "");
      btn.dataset.id = p.id;
      btn.innerHTML =
        '<span class="mini">' + window.NaijiacunPet.figureHTML(p.id) + "</span>" +
        "<span>" + p.name + "</span>";
      btn.addEventListener("click", function () {
        current = p.id;
        pet.setCharacter(p.id);
        Array.prototype.forEach.call(charBar.children, function (c) {
          c.classList.toggle("active", c.dataset.id === current);
        });
      });
      charBar.appendChild(btn);
    });
  }

  buildChips();

  // ---------- 工具按钮 ----------
  talkBtn.addEventListener("click", function () {
    pet.talk();
  });

  wanderBtn.addEventListener("click", function () {
    pet.wander();
  });

  // 2.5D 立体 / 平面切换（默认立体）
  var depthOn = true;
  depthBtn.addEventListener("click", function () {
    depthOn = !depthOn;
    pet.setDepth(depthOn);
    depthBtn.setAttribute("aria-pressed", String(depthOn));
    depthBtn.textContent = depthOn ? "🧊 立体感" : "▫️ 平面";
    setNote(depthOn
      ? "移动鼠标它会转头看你；拖起来会离地，影子跟着变。"
      : "已切回平面模式，形象和原来完全一致。");
  });

  sizeRange.addEventListener("input", function () {
    pet.setSize(parseInt(sizeRange.value, 10));
  });

  // ---------- 置顶小窗 ----------
  var pinned = false;

  if (!window.NaijiacunPet.pinSupported()) {
    pinBtn.disabled = true;
    pinBtn.textContent = "📌 置顶小窗（不支持）";
    setNote("当前浏览器不支持置顶小窗。用 Edge 或 Chrome 116 以上版本打开这个页面就能用了；" +
      "在这里也可以直接拖着它玩。");
  } else {
    setNote("点一下它试试。点「置顶小窗」可以让它浮在其他窗口上面。");
  }

  pinBtn.addEventListener("click", function () {
    if (pinned) return;

    pinBtn.disabled = true;
    pinBtn.textContent = "📌 正在打开…";

    window.NaijiacunPet.openPin(pet, stage)
      .then(function () {
        pinned = true;
        pinBtn.textContent = "📌 已在置顶小窗";
        setNote("桌宠已经搬到置顶小窗，可以拖到屏幕任何位置。关掉那个小窗，它就会自动回来。");

        pet.onUnpin = function () {
          pinned = false;
          pinBtn.disabled = false;
          pinBtn.textContent = "📌 置顶小窗";
          setNote("小窗已关闭，桌宠回到这个页面了。");
        };
      })
      .catch(function (err) {
        pinBtn.disabled = false;
        pinBtn.textContent = "📌 置顶小窗";
        setNote("打开置顶小窗失败：" + (err && err.message ? err.message : "未知原因") +
          "。这种小窗需要浏览器支持，并且必须在点击后立刻触发。", "warn");
      });
  });
})();
