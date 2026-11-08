// 奶家村 · 桌宠页面控制
//
// 只做三件事：把角色列表画出来、把宠物挂上舞台、接上「浏览器小窗」按钮。
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

  // ---------- 浏览器小窗 ----------
  var pinned = false;

  if (!window.NaijiacunPet.pinSupported()) {
    pinBtn.hidden = true;
    setNote("点一下它试试。下载 Windows 透明桌宠，就能让角色浮在桌面上。");
  } else {
    setNote("点一下它试试。浏览器小窗会保留背景和来源栏；透明桌宠请下载 Windows 版。");
  }

  pinBtn.addEventListener("click", function () {
    if (pinned) return;

    pinBtn.disabled = true;
    pinBtn.textContent = "📌 正在打开…";

    window.NaijiacunPet.openPin(pet, stage)
      .then(function () {
        pinned = true;
        pinBtn.textContent = "📌 已在浏览器小窗";
        setNote("浏览器小窗已打开，会保留背景和来源栏。关掉小窗，角色就会回到页面。");

        pet.onUnpin = function () {
          pinned = false;
          pinBtn.disabled = false;
          pinBtn.textContent = "📌 浏览器小窗";
          setNote("浏览器小窗已关闭，桌宠回到这个页面了。");
        };
      })
      .catch(function (err) {
        pinBtn.disabled = false;
        pinBtn.textContent = "📌 浏览器小窗";
        setNote("打开浏览器小窗失败：" + (err && err.message ? err.message : "未知原因") +
          "。这种小窗需要浏览器支持，并且必须在点击后立刻触发。", "warn");
      });
  });

  // ---------- 和桌宠聊天 ----------
  // 逻辑都在 js/chat.js（window.NaijiacunChat），这里只负责把回复画到
  // 日志里，并且让它从宠物头顶的气泡说出来。
  var chatForm = document.getElementById("chatForm");
  var chatInput = document.getElementById("chatInput");
  var chatLog = document.getElementById("chatLog");
  var chatSend = document.getElementById("chatSend");
  var Chat = window.NaijiacunChat;
  var chatting = false;

  function addLine(role, text, err) {
    var row = document.createElement("div");
    row.className = "pet-chat-row " + role + (err ? " err" : "");
    var b = document.createElement("span");
    b.className = "pet-chat-bubble";
    b.textContent = text;
    row.appendChild(b);
    chatLog.appendChild(row);
    while (chatLog.children.length > 24) chatLog.removeChild(chatLog.firstChild);
    chatLog.scrollTop = chatLog.scrollHeight;
    return b;
  }

  function refreshChatHint() {
    if (!Chat) {
      chatInput.disabled = true;
      chatInput.placeholder = "聊天脚本没加载成功";
      return;
    }
    var on = Chat.isConfigured();
    chatInput.placeholder = on
      ? "跟" + (pet.name || "它") + "说句话…（Enter 发送）"
      : "还没配大模型 Key，先用内置话术聊（点右边 ⚙️ 配置）";
  }

  if (Chat) {
    Chat.bootTTS();
    refreshChatHint();

    // 切角色时更新输入提示
    var origSet = pet.setCharacter.bind(pet);
    pet.setCharacter = function (id) {
      origSet(id);
      refreshChatHint();
    };

    chatForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = (chatInput.value || "").trim();
      if (!text || chatting) return;

      chatting = true;
      chatSend.disabled = true;
      chatInput.value = "";

      var id = pet.id;
      addLine("me", text);
      Chat.pushLog(id, "user", text);
      var hist = Chat.historyOf(id).slice(0, -1);

      var bubble = addLine("bot", "…");
      pet.bubbleEl.textContent = "…";
      pet.bubbleEl.classList.add("show");

      Chat.ask(id, text, {
        history: hist,
        onDelta: function (partial) {
          bubble.textContent = partial;
          chatLog.scrollTop = chatLog.scrollHeight;
          // 让宠物边说边显示，先不朗读，等整句出来再念
          pet.bubbleEl.textContent = partial;
          pet.bubbleEl.classList.add("show");
        }
      }).then(function (reply) {
        bubble.textContent = reply;
        Chat.pushLog(id, "assistant", reply);
        chatLog.scrollTop = chatLog.scrollHeight;
        // 整句说完再朗读，气泡也跟着停留一会儿
        pet.say(reply);
      }).catch(function (err) {
        var msg = (err && err.message) || "请求失败";
        bubble.textContent = msg;
        bubble.parentNode.className = "pet-chat-row bot err";
        pet.say("唔…好像出问题了", { speak: false });
      }).then(function () {
        chatting = false;
        chatSend.disabled = false;
        chatInput.focus();
        chatLog.scrollTop = chatLog.scrollHeight;
      });
    });
  } else {
    refreshChatHint();
  }
})();
