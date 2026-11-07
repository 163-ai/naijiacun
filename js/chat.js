/* 奶家村 · 角色聊天引擎
 * ---------------------------------------------------------------
 * 一份逻辑，两个壳：
 *   - chat.html  完整的聊天页面（左右分栏）
 *   - pet.html   桌宠模式里的迷你对话条（回复直接弹在桌面宠物头上）
 *
 * 接的是「OpenAI 兼容」的 /chat/completions 接口，所以 DeepSeek / 通义 / 智谱 /
 * 硅基流动 / Moonshot / OpenAI 都能直接用，只要能拿到 Key。
 *
 * 两种接入方式：
 *   direct —— 浏览器直连服务商（要求对方允许跨域）
 *   proxy  —— 走 server/tts-worker.js 里新增的 /api/chat，Key 可以放 Worker 环境变量
 *
 * 没有配 Key 时不会白屏：按角色人设从 offline 话术里挑一句，页面照样能玩。
 */
(function () {
  "use strict";

  var STORE_CFG = "naijacun_chat";
  var STORE_LOG = "naijacun_chat_log";
  var STORE_SPEAK = "naijacun_speak";
  var MAX_TURNS = 12;    // 送给模型的历史轮数
  var MAX_KEEP = 60;     // 每个角色本地最多留多少条

  // cors: false 表示实测该服务商的跨域预检不放行，浏览器直连会被拦，只能走代理。
  var PRESETS = {
    zhipu: { label: "智谱 GLM-4-Flash（永久免费·需代理）", base: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash", cors: false },
    siliconflow: { label: "硅基流动（有免费模型·可直连）", base: "https://api.siliconflow.cn/v1", model: "Qwen/Qwen3-8B", cors: true },
    deepseek: { label: "DeepSeek（便宜好用·可直连）", base: "https://api.deepseek.com/v1", model: "deepseek-chat", cors: true },
    dashscope: { label: "通义千问 / 阿里百炼（可直连）", base: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus", cors: true },
    moonshot: { label: "月之暗面 Kimi", base: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
    openai: { label: "OpenAI", base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    custom: { label: "自定义 / 别的兼容接口", base: "", model: "" }
  };

  var CFG = { mode: "direct", base: "", proxyBase: "", model: "", key: "" };

  // ---------- 本地存储 ----------
  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 隐私模式忽略 */ }
  }

  function loadCfg() {
    var c = readJSON(STORE_CFG, null);
    if (c) {
      CFG.mode = c.mode === "proxy" ? "proxy" : "direct";
      CFG.base = c.base || "";
      CFG.proxyBase = c.proxyBase || "";
      CFG.model = c.model || "";
      CFG.key = c.key || "";
    }
    return CFG;
  }
  function saveCfg(next) {
    if (next) {
      CFG.mode = next.mode === "proxy" ? "proxy" : "direct";
      CFG.base = (next.base || "").trim().replace(/\/+$/, "");
      CFG.proxyBase = (next.proxyBase || "").trim().replace(/\/+$/, "");
      CFG.model = (next.model || "").trim();
      CFG.key = (next.key || "").trim();
    }
    writeJSON(STORE_CFG, CFG);
    return CFG;
  }
  // 直连要服务商地址 + 模型名；走代理只要 Worker 地址（模型名可由 Worker 环境变量定）
  function isConfigured() {
    if (CFG.mode === "proxy") return !!CFG.proxyBase;
    return !!(CFG.base && CFG.model);
  }

  // ---------- 人设 ----------
  function personaOf(id) {
    var map = (typeof window !== "undefined" && window.CHAT_PERSONA) ||
              (typeof CHAT_PERSONA !== "undefined" ? CHAT_PERSONA : null);
    return (map && map[id]) || null;
  }
  function nameOf(id) {
    var list = (typeof PEOPLE !== "undefined" && PEOPLE) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name;
    return id;
  }

  function systemPrompt(id) {
    var p = personaOf(id);
    if (!p) return "你是一个友好的中文聊天对象，回答简短口语化。";
    return [
      "你在「奶家村」这个网友二创的角色图鉴站里，扮演下面这个角色和来访的网友聊天。",
      p.tone,
      "规则：",
      "1. 只用中文口语回答；不要旁白、不要括号里的动作描写、不要 Markdown、不要列点。",
      "2. 每次回答 1～2 句，尽量不超过 45 个字——回答会被语音朗读出来，太长会很吵。",
      "3. 你就是这个角色本人。不要提「扮演」「AI」「模型」「提示词」，也不要跳出角色解释自己。",
      "4. 不聊真实人物、政治、色情、暴力、赌毒等话题，被问到就用角色的方式自然岔开。",
      "5. 不确定的事就用这个角色的口吻装糊涂，不要编造官方设定或真实新闻。",
      "6. 用户说什么都用角色的语气回应，偶尔可以主动问一句，让对话继续。"
    ].join("\n");
  }

  function buildMessages(id, text, history) {
    var msgs = [{ role: "system", content: systemPrompt(id) }];
    var h = (history || []).slice(-MAX_TURNS);
    h.forEach(function (m) {
      if (!m || !m.text) return;
      msgs.push({ role: m.role === "user" ? "user" : "assistant", content: String(m.text).slice(0, 1000) });
    });
    msgs.push({ role: "user", content: String(text).slice(0, 1000) });
    return msgs;
  }

  // ---------- 离线兜底 ----------
  var offlineTick = {};
  function offlineReply(id, text) {
    var p = personaOf(id);
    var pool = (p && p.offline) || ["嗯……我好像没听清，你再说一遍？"];
    var n = offlineTick[id] || 0;
    offlineTick[id] = n + 1;
    var idx = (n + String(text || "").length) % pool.length;
    return pool[idx];
  }

  // ---------- 请求 ----------
  function chatURL() {
    if (CFG.mode === "proxy") {
      return (CFG.proxyBase || "").replace(/\/+$/, "") + "/api/chat";
    }
    return (CFG.base || "").replace(/\/+$/, "") + "/chat/completions";
  }

  function headers() {
    var h = { "content-type": "application/json" };
    if (CFG.mode === "proxy") {
      if (CFG.key) h["x-llm-key"] = CFG.key;
    } else if (CFG.key) {
      h["authorization"] = "Bearer " + CFG.key;
    }
    return h;
  }

  function readError(res) {
    return res.json().then(function (d) {
      var msg = (d && d.error && (d.error.message || d.error)) || (d && d.detail) || (d && d.message) || "";
      if (typeof msg !== "string") msg = JSON.stringify(msg);
      if (res.status === 401) return "Key 无效或没填对（401）" + (msg ? "：" + msg.slice(0, 120) : "");
      if (res.status === 402) return "额度用完了（402）";
      if (res.status === 403) return "这个 Key 没有权限（403）" + (msg ? "：" + msg.slice(0, 120) : "");
      if (res.status === 404) return "接口地址或模型名不对（404）" + (msg ? "：" + msg.slice(0, 120) : "");
      if (res.status === 429) return "请求太频繁，喘口气再来（429）";
      return "请求失败（HTTP " + res.status + "）" + (msg ? "：" + msg.slice(0, 160) : "");
    }).catch(function () {
      return "请求失败（HTTP " + res.status + "）";
    });
  }

  // 解析 SSE 流：逐块读 delta.content
  function pumpStream(res, onDelta) {
    var reader = res.body.getReader();
    var decoder = new TextDecoder("utf-8");
    var buf = "";
    var out = "";

    function handle(line) {
      if (!line || line.indexOf("data:") !== 0) return false;
      var payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") return payload === "[DONE]";
      try {
        var j = JSON.parse(payload);
        var ch = j.choices && j.choices[0];
        var piece = ch && ((ch.delta && ch.delta.content) || (ch.message && ch.message.content));
        if (piece) { out += piece; if (onDelta) onDelta(out); }
      } catch (e) { /* 半包，忽略 */ }
      return false;
    }

    function step() {
      return reader.read().then(function (r) {
        if (r.done) {
          buf.split(/\r?\n/).forEach(handle);
          return out;
        }
        buf += decoder.decode(r.value, { stream: true });
        var lines = buf.split(/\r?\n/);
        buf = lines.pop() || "";
        lines.forEach(handle);
        return step();
      });
    }
    return step();
  }

  /**
   * 问一句，拿回复。
   * @param {string} id       角色 id
   * @param {string} text     用户输入
   * @param {object} opts     { history, onDelta, signal }
   * @returns {Promise<string>}
   */
  function ask(id, text, opts) {
    opts = opts || {};
    if (!isConfigured()) {
      var off = offlineReply(id, text);
      if (opts.onDelta) opts.onDelta(off);
      return Promise.resolve(off);
    }

    var body = {
      model: CFG.model,
      messages: buildMessages(id, text, opts.history),
      temperature: 0.85,
      max_tokens: 220,
      stream: !!opts.onDelta
    };

    var init = { method: "POST", headers: headers(), body: JSON.stringify(body) };
    if (opts.signal) init.signal = opts.signal;

    return fetch(chatURL(), init).then(function (res) {
      if (!res.ok) return readError(res).then(function (m) { throw new Error(m); });
      var ct = res.headers.get("content-type") || "";
      if (body.stream && ct.indexOf("event-stream") !== -1 && res.body) {
        return pumpStream(res, opts.onDelta).then(function (t) {
          return (t || "").trim() || offlineReply(id, text);
        });
      }
      return res.json().then(function (data) {
        var ch = data && data.choices && data.choices[0];
        var t = ch && ((ch.message && ch.message.content) || (ch.text)) || "";
        t = String(t).trim();
        if (!t) throw new Error("模型返回了空内容，换个模型名试试");
        if (opts.onDelta) opts.onDelta(t);
        return t;
      });
    }).catch(function (err) {
      // 浏览器直连最常见的问题是服务商没开跨域 → fetch 直接抛 TypeError
      var msg = String((err && err.message) || "");
      if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(msg) || (err && err.name === "TypeError")) {
        throw new Error("连不上模型服务：可能是该服务商不允许浏览器直连（跨域被拦）。" +
          "解决办法：在设置里把「接入方式」改成「走我的代理」，并用你的 Worker 地址；或换一个支持跨域的模型服务。");
      }
      throw err;
    });
  }

  // ---------- 聊天记录 ----------
  function allLogs() { return readJSON(STORE_LOG, {}); }
  function historyOf(id) {
    var all = allLogs();
    return Array.isArray(all[id]) ? all[id] : [];
  }
  function pushLog(id, role, text) {
    var all = allLogs();
    var arr = Array.isArray(all[id]) ? all[id] : [];
    arr.push({ role: role, text: text, t: Date.now() });
    if (arr.length > MAX_KEEP) arr = arr.slice(arr.length - MAX_KEEP);
    all[id] = arr;
    writeJSON(STORE_LOG, all);
    return arr;
  }
  function clearLog(id) {
    var all = allLogs();
    delete all[id];
    writeJSON(STORE_LOG, all);
  }
  function lastText(id) {
    var h = historyOf(id);
    for (var i = h.length - 1; i >= 0; i--) if (h[i].role === "assistant") return h[i].text;
    return "";
  }

  // ---------- 语音 ----------
  function speakEnabled() {
    try { return localStorage.getItem(STORE_SPEAK) !== "0"; } catch (e) { return true; }
  }
  function setSpeak(on) {
    try { localStorage.setItem(STORE_SPEAK, on ? "1" : "0"); } catch (e) { /* 忽略 */ }
  }

  // 复用主站语音设置（naijacun_tts）：在图鉴页填过，这里自动生效
  function bootTTS() {
    if (!window.NaijiacunTTS) return;
    var cfg = readJSON("naijacun_tts", null);
    if (!cfg) return;
    var t = window.NaijiacunTTS.config;
    t.endpoint = cfg.endpoint || "";
    t.apiKey = cfg.key || "";
    t.defaultVoiceId = cfg.voiceId || "";
    t.browserVoice = cfg.browserVoice || "";
    t.provider = cfg.key && t.endpoint ? "breeze" : "browser";
  }

  window.NaijiacunChat = {
    ask: ask,
    personaOf: personaOf,
    nameOf: nameOf,
    offlineReply: offlineReply,
    config: CFG,
    presets: PRESETS,
    loadCfg: loadCfg,
    saveCfg: saveCfg,
    isConfigured: function () { loadCfg(); return isConfigured(); },
    historyOf: historyOf,
    pushLog: pushLog,
    clearLog: clearLog,
    lastText: lastText,
    speakEnabled: speakEnabled,
    setSpeak: setSpeak,
    bootTTS: bootTTS
  };

  // ===============================================================
  //  壳 A：chat.html 整页
  // ===============================================================
  var msgList = document.getElementById("msgList");
  if (!msgList) { bootTTS(); return; }

  var rail = document.getElementById("charRail");
  var input = document.getElementById("input");
  var composer = document.getElementById("composer");
  var sendBtn = document.getElementById("sendBtn");
  var openersBox = document.getElementById("openers");
  var statusEl = document.getElementById("chStatus");
  var avatarEl = document.getElementById("chAvatar");
  var nameEl = document.getElementById("chName");
  var descEl = document.getElementById("chDesc");
  var speakBtn = document.getElementById("speakBtn");
  var clearBtn = document.getElementById("clearBtn");
  var cfgBtn = document.getElementById("cfgBtn");

  var LIST = (typeof PEOPLE !== "undefined" && PEOPLE) || [];
  var currentId = "nailong";
  var busy = false;
  var abortCtl = null;

  loadCfg();
  bootTTS();

  function setStatus(msg, warn) {
    statusEl.textContent = msg || "";
    statusEl.className = "ch-status" + (warn ? " warn" : "");
  }

  function scrollBottom() {
    msgList.scrollTop = msgList.scrollHeight;
  }

  function timeLabel(t) {
    var d = new Date(t || Date.now());
    var hh = String(d.getHours()).padStart(2, "0");
    var mm = String(d.getMinutes()).padStart(2, "0");
    return hh + ":" + mm;
  }

  function addRow(role, text, opts) {
    opts = opts || {};
    var row = document.createElement("div");
    row.className = "ch-row " + (role === "user" ? "me" : "bot") + (opts.err ? " err" : "");

    if (role !== "user") {
      var img = document.createElement("img");
      img.src = "assets/characters/" + currentId + ".png";
      img.alt = "";
      row.appendChild(img);
    }

    var bubble = document.createElement("div");
    bubble.className = "ch-bubble";
    bubble.textContent = text;
    row.appendChild(bubble);

    if (opts.time) {
      var t = document.createElement("span");
      t.className = "ch-time";
      t.textContent = timeLabel(opts.time);
      row.appendChild(t);
    }

    msgList.appendChild(row);
    scrollBottom();
    return { row: row, bubble: bubble };
  }

  function addTyping() {
    var row = document.createElement("div");
    row.className = "ch-row bot";
    var img = document.createElement("img");
    img.src = "assets/characters/" + currentId + ".png";
    img.alt = "";
    var bubble = document.createElement("div");
    bubble.className = "ch-bubble";
    bubble.innerHTML = '<span class="ch-typing"><i></i><i></i><i></i></span>';
    row.appendChild(img);
    row.appendChild(bubble);
    msgList.appendChild(row);
    scrollBottom();
    return row;
  }

  function renderOpeners() {
    openersBox.innerHTML = "";
    if (busy) return;
    var p = personaOf(currentId);
    var list = (p && p.openers) || [];
    if (!list.length) return;
    var hist = historyOf(currentId);
    if (hist.length > 1) return;      // 已经聊起来了就不再提示
    list.forEach(function (line) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "ch-opener";
      b.textContent = line;
      b.addEventListener("click", function () { send(line); });
      openersBox.appendChild(b);
    });
  }

  function renderRail() {
    rail.innerHTML = "";
    LIST.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "ch-rail-item" + (p.id === currentId ? " active" : "");
      b.dataset.id = p.id;

      var img = document.createElement("img");
      img.src = p.image || ("assets/characters/" + p.id + ".png");
      img.alt = "";
      var meta = document.createElement("span");
      meta.className = "ch-rail-meta";
      var nm = document.createElement("span");
      nm.className = "ch-rail-name";
      nm.textContent = p.name;
      var last = document.createElement("span");
      last.className = "ch-rail-last";
      last.textContent = lastText(p.id) || (personaOf(p.id) ? personaOf(p.id).greeting : "");
      meta.appendChild(nm);
      meta.appendChild(last);

      b.appendChild(img);
      b.appendChild(meta);
      b.addEventListener("click", function () { selectCharacter(p.id); });
      rail.appendChild(b);
    });
  }

  function renderMessages() {
    msgList.innerHTML = "";
    var hist = historyOf(currentId);
    var p = personaOf(currentId);
    if (!hist.length) {
      var greet = (p && p.greeting) || "你好呀。";
      pushLog(currentId, "assistant", greet);
      addRow("assistant", greet);
    } else {
      hist.forEach(function (m) { addRow(m.role, m.text, { time: m.t }); });
    }
    scrollBottom();
  }

  function selectCharacter(id) {
    if (busy) return;
    currentId = id;
    var p = null;
    for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) p = LIST[i];

    if (p) {
      avatarEl.src = p.image || ("assets/characters/" + id + ".png");
      nameEl.textContent = p.name;
      descEl.textContent = p.title || "";
    }
    Array.prototype.forEach.call(rail.children, function (el) {
      el.classList.toggle("active", el.dataset.id === id);
    });
    renderMessages();
    renderOpeners();
    setStatus(isConfigured()
      ? "已连上模型：" + CFG.model
      : "还没配模型 Key，当前用内置话术回答。点右上角「⚙️ 设置」可以接上大模型。",
      !isConfigured());
  }

  function send(text) {
    text = String(text || "").trim();
    if (!text || busy) return;

    busy = true;
    sendBtn.disabled = true;
    input.value = "";
    input.style.height = "auto";
    openersBox.innerHTML = "";

    addRow("user", text);
    pushLog(currentId, "user", text);
    renderRail();

    var typing = addTyping();
    var bot = null;
    var hist = historyOf(currentId).slice(0, -1);   // 不含刚 push 的这句
    abortCtl = ("AbortController" in window) ? new AbortController() : null;

    NaijiacunChat.ask(currentId, text, {
      history: hist,
      signal: abortCtl ? abortCtl.signal : null,
      onDelta: function (partial) {
        if (!bot) {
          if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
          bot = addRow("assistant", partial, { time: Date.now() });
        } else {
          bot.bubble.textContent = partial;
          scrollBottom();
        }
      }
    }).then(function (reply) {
      if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
      if (!bot) bot = addRow("assistant", reply, { time: Date.now() });
      else bot.bubble.textContent = reply;

      pushLog(currentId, "assistant", reply);
      renderRail();
      if (speakEnabled() && window.NaijiacunTTS) window.NaijiacunTTS.speak(reply, currentId);
      setStatus("回复来自 " + (isConfigured()
        ? (CFG.mode === "proxy" ? "代理（" + (CFG.model || "服务端默认模型") + "）" : CFG.model)
        : "内置话术"));
    }).catch(function (err) {
      if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
      if (bot) bot.bubble.textContent = "" ;
      var msg = (err && err.message) || "请求失败";
      var rowEl = addRow("assistant", "😵 " + msg, { err: true, time: Date.now() });
      setStatus("出错了：" + msg, true);
      rowEl.bubble.title = msg;
    }).then(function () {
      busy = false;
      sendBtn.disabled = false;
      abortCtl = null;
      renderOpeners();
      scrollBottom();
      input.focus();
    });
  }

  // ---------- 输入框 ----------
  composer.addEventListener("submit", function (e) {
    e.preventDefault();
    send(input.value);
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send(input.value);
    }
  });
  input.addEventListener("input", function () {
    input.style.height = "auto";
    input.style.height = Math.min(120, input.scrollHeight) + "px";
  });

  // ---------- 工具按钮 ----------
  function paintSpeakBtn() {
    var on = speakEnabled();
    speakBtn.classList.toggle("on", on);
    speakBtn.setAttribute("aria-pressed", String(on));
    speakBtn.textContent = on ? "🔊 朗读" : "🔇 静音";
  }
  speakBtn.addEventListener("click", function () {
    var on = !speakEnabled();
    setSpeak(on);
    paintSpeakBtn();
    if (!on && window.NaijiacunTTS) window.NaijiacunTTS.stop();
  });

  clearBtn.addEventListener("click", function () {
    if (busy) return;
    if (!confirm("清空和「" + nameOf(currentId) + "」的聊天记录？（只清本地）")) return;
    clearLog(currentId);
    renderMessages();
    renderOpeners();
    renderRail();
    setStatus("已清空。", false);
  });

  // ---------- 设置弹窗 ----------
  var dlg = document.getElementById("cfgDlg");
  var presetSel = document.getElementById("presetSel");
  var modeSel = document.getElementById("modeSel");
  var baseInput = document.getElementById("baseInput");
  var proxyInput = document.getElementById("proxyInput");
  var modelInput = document.getElementById("modelInput");
  var keyInput = document.getElementById("keyInput");
  var baseField = document.getElementById("baseField");
  var proxyField = document.getElementById("proxyField");
  var modelField = document.getElementById("modelField");
  var cfgHint = document.getElementById("cfgHint");
  var ttsBase = document.getElementById("ttsBase");
  var ttsKey = document.getElementById("ttsKey");
  var saveBtn = document.getElementById("saveBtn");
  var dlgStatus = document.getElementById("dlgStatus");

  Object.keys(PRESETS).forEach(function (k) {
    var o = document.createElement("option");
    o.value = k;
    o.textContent = PRESETS[k].label;
    presetSel.appendChild(o);
  });

  // 直连 / 代理两种模式要填的东西不一样，切换时把无关字段藏掉，避免填错地址
  function syncModeUI() {
    var proxy = modeSel.value === "proxy";
    baseField.hidden = proxy;
    modelField.hidden = proxy;
    proxyField.hidden = !proxy;
    var p = PRESETS[presetSel.value];
    if (proxy) {
      cfgHint.innerHTML = "Worker 已经替你保管 Key 和上游地址，这里只填 Worker 根地址即可。" +
        "模型名、上游由 Worker 的环境变量决定。";
    } else if (p && p.cors === false) {
      cfgHint.innerHTML = "<b>" + p.label.split("（")[0] + " 不允许浏览器直连</b>（跨域预检被拦），" +
        "请把接入方式改成「走我的代理」。";
    } else {
      cfgHint.textContent = "Key 只存在你自己的浏览器里，不会上传到任何地方。";
    }
  }

  function fillDialog() {
    loadCfg();
    var hit = "custom";
    Object.keys(PRESETS).forEach(function (k) {
      if (PRESETS[k].base && PRESETS[k].base === CFG.base) hit = k;
    });
    // 第一次打开（什么都没配）默认停在推荐的免费方案上
    if (!CFG.base && !CFG.proxyBase && !CFG.key) hit = "zhipu";

    presetSel.value = hit;
    modeSel.value = CFG.mode;
    baseInput.value = CFG.base;
    proxyInput.value = CFG.proxyBase;
    modelInput.value = CFG.model;
    keyInput.value = CFG.key;

    // 选了服务商却没填地址 → 用预设补上，省得手打
    var p = PRESETS[hit];
    if (p && p.base) {
      if (!baseInput.value) baseInput.value = p.base;
      if (!modelInput.value) modelInput.value = p.model;
    }
    if (!CFG.proxyBase && (!p || p.cors === false)) modeSel.value = "proxy";

    var t = readJSON("naijacun_tts", null) || {};
    ttsBase.value = t.endpoint || "";
    ttsKey.value = t.key || "";
    dlgStatus.textContent = "";
    syncModeUI();
  }

  presetSel.addEventListener("change", function () {
    var p = PRESETS[presetSel.value];
    if (!p) return;
    if (p.base) {
      baseInput.value = p.base;
      modelInput.value = p.model;
    }
    // 该服务商不支持直连时，自动切到代理，省得用户填完 Key 才发现连不上
    if (p.cors === false) modeSel.value = "proxy";
    syncModeUI();
  });

  modeSel.addEventListener("change", syncModeUI);

  cfgBtn.addEventListener("click", function () {
    fillDialog();
    if (dlg.showModal) dlg.showModal();
    else dlg.setAttribute("open", "");
  });

  saveBtn.addEventListener("click", function (e) {
    e.preventDefault();
    saveCfg({
      mode: modeSel.value,
      base: baseInput.value,
      proxyBase: proxyInput.value,
      model: modelInput.value,
      key: keyInput.value
    });

    // 语音配置写回主站那份
    var tts = readJSON("naijacun_tts", null) || {};
    tts.endpoint = ttsBase.value.trim();
    tts.key = ttsKey.value.trim();
    if (!tts.browserVoice) tts.browserVoice = "";
    writeJSON("naijacun_tts", tts);
    bootTTS();

    var ok = isConfigured();
    var where = CFG.mode === "proxy" ? "代理" : (CFG.model || "直连");
    dlgStatus.textContent = ok ? "已保存，可以开始聊了" : "已保存（还没填地址，仍用内置话术）";
    setStatus(ok
      ? "已连上模型：" + where
      : "还没配模型 Key，当前用内置话术回答。",
      !ok);
    setTimeout(function () { if (dlg.close) dlg.close(); }, 600);
  });

  // ---------- 启动 ----------
  paintSpeakBtn();
  renderRail();
  selectCharacter(currentId);
  input.focus();
})();
