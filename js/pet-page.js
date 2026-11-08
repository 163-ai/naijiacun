// 奶家村 · 桌宠页面控制
//
// 小院预览、真实 3D 活动与浏览器扩展入口；聊天沿用共享接口。

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
  pet.setDepth(false);
  var renderView = null;
  var wants3D = false;
  var extensionState = null;
  var catalog = PEOPLE.map(function (p) {
    var model = window.N3D_MODELS && window.N3D_MODELS[p.id];
    return { id: p.id, name: p.name, image: p.petImage || p.image, model: model && model.file };
  });
  function syncMode() {
    var available = catalog.some(function (p) { return p.id === pet.id && p.model; });
    var mode = renderView ? renderView.mode : "2d";
    depthBtn.textContent = available ? (mode === "3d" ? "🧊 真 3D" : "▫️ 平面") : "▫️ 小草 2D";
    depthBtn.setAttribute("aria-pressed", String(mode === "3d"));
    depthBtn.setAttribute("aria-disabled", String(!available));
    depthBtn.title = available ? "切换平面与可活动的真实 3D" : "小草使用透明抠图形象";
    pet.el.dataset.renderMode = mode;
  }
  var rendererReady = import("./pet-renderer.js?v=browser-pets-1").then(function (module) {
    pet.bodyEl.replaceChildren();
    renderView = new module.PetRenderer(pet.bodyEl, {
      catalog: catalog,
      resolveAsset: function (path) { return new URL(path, document.baseURI).href; }
    });
    pet.setRenderer(renderView).then(syncMode).catch(function (error) {
      if (error.name !== "AbortError") setNote("形象加载失败：" + error.message, "warn");
    });
    return renderView;
  }).catch(function (error) { setNote("形象加载失败：" + error.message, "warn"); return null; });

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
        Promise.resolve(pet.setCharacter(p.id)).then(syncMode).catch(async function (error) {
          if (error.name === "AbortError" || pet.id !== p.id) return;
          wants3D = false;
          try {
            if (renderView) await renderView.setMode("2d");
            if (pet.id !== p.id) return;
            syncMode();
            setNote("3D 形象加载失败：" + error.message + "。已切换平面，可再次点击 3D 重试。", "warn");
          } catch (fallbackError) {
            if (pet.id === p.id) { syncMode(); setNote("形象加载失败：" + fallbackError.message, "warn"); }
          }
        });
        syncExtensionButton();
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

  // 只在用户选择 3D 时下载当前角色模型。
  depthBtn.addEventListener("click", async function () {
    if (!catalog.some(function (p) { return p.id === pet.id && p.model; })) {
      setNote("小草保留透明的半身形象，也可以跟随你逛网页。"); return;
    }
    depthBtn.disabled = true;
    try {
      var view = await rendererReady;
      if (!view) return;
      wants3D = !wants3D;
      setNote(wants3D ? "正在准备这位村民的 3D 形象……" : "已切换平面形象。");
      await view.setMode(wants3D ? "3d" : "2d");
      syncMode();
      setNote(view.mode === "3d" ? "现在是真实 3D。点「跑一跑」，看看这位村民怎么活动。" : "已切换平面形象。");
    } catch (error) {
      wants3D = false;
      setNote("3D 加载失败：" + error.message + "。可再次点击重试。", "warn");
      if (renderView) await renderView.setMode("2d");
      syncMode();
    } finally { depthBtn.disabled = false; }
  });

  sizeRange.addEventListener("input", function () {
    pet.setSize(parseInt(sizeRange.value, 10));
  });

  // ---------- 跨网页桌宠 ----------
  function syncExtensionButton() {
    var outside = !!(extensionState && extensionState.enabled && extensionState.id === pet.id);
    pinBtn.textContent = outside ? "↩ 收回桌宠" : "🐾 变桌宠";
    pet.el.style.visibility = outside ? "hidden" : "";
  }
  window.addEventListener("naijiacun-pet-state", function (event) {
    extensionState = event.detail;
    syncExtensionButton();
    var status = document.getElementById("extensionStatus");
    if (status) status.textContent = "扩展已连接 · 换个普通网页也能继续陪伴。";
  });
  window.NaijiacunPetBridge.probe();
  setNote("先选一位村民。可拖动、聊天，或切到真实 3D 后跑一跑。");
  pinBtn.addEventListener("click", async function () {
    pinBtn.disabled = true;
    try {
      var outside = extensionState && extensionState.enabled && extensionState.id === pet.id;
      if (outside) await window.NaijiacunPetBridge.stop();
      else await window.NaijiacunPetBridge.start({ id: pet.id, mode: renderView ? renderView.mode : "2d", size: pet.size });
      setNote(outside ? "桌宠回到小院了。" : "已变成跨网页桌宠。拖动可移动，右键可切换村民或收回。");
    } catch (error) { setNote(error.message, "warn"); }
    finally { pinBtn.disabled = false; syncExtensionButton(); }
  });
  window.addEventListener("pagehide", function (event) { if (!event.persisted) pet.destroy(); });

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
      var result = origSet(id);
      refreshChatHint();
      return result;
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
