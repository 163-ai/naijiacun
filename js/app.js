// 奶家村 · 页面交互逻辑
// 投票与提名数据保存在浏览器 localStorage 中，仅供本机体验。

(function () {
  "use strict";

  var VOTE_KEY = "naijacun_votes";
  var EXTRA_KEY = "naijacun_extra";

  var state = {
    keyword: "",
    category: "全部",
    sort: "heat"
  };

  // ---------- localStorage 工具 ----------
  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* 忽略隐私模式下的写入失败 */ }
  }

  function getVotes() { return readJSON(VOTE_KEY, {}); }
  function getExtra() { return readJSON(EXTRA_KEY, []); }

  function allPeople() {
    return PEOPLE.concat(getExtra());
  }

  // ---------- 工具函数 ----------
  function formatHeat(n) {
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "w";
    return String(n);
  }

  function escapeHTML(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // 头像：优先用数据里指定的图片，其次原创 SVG 形象，然后首字圆牌，最后回退 emoji
  function avatarHTML(p) {
    if (p && p.image) {
      return '<img class="avatar-img" src="' + escapeHTML(p.image) + '" alt="' +
        escapeHTML(p.name || "") + '" loading="lazy">';
    }
    var a = window.NaijiacunAvatars;
    if (a && p) {
      var s = a.svg(p.id);
      if (s) return s;
      if (p.name) return a.initial(p.name);
    }
    return '<span class="avatar-emoji">' + escapeHTML((p && p.emoji) || "🙂") + '</span>';
  }

  function categoriesOf(people) {
    var seen = {};
    var list = ["全部"];
    people.forEach(function (p) {
      if (!seen[p.category]) {
        seen[p.category] = true;
        list.push(p.category);
      }
    });
    return list;
  }

  // ---------- 语音 ----------
  function speechTextOf(p) {
    if (!p) return "";
    if (p.quote) return p.quote;
    return (p.title ? p.title + "。" : "") + (p.desc || "");
  }

  function hasTTS() {
    return typeof window.NaijiacunTTS !== "undefined";
  }

  function toggleSpeak(p) {
    if (!hasTTS() || !p) return;
    if (window.NaijiacunTTS.getCurrent() === p.id) {
      window.NaijiacunTTS.stop();
    } else {
      window.NaijiacunTTS.speak(speechTextOf(p), p.id);
    }
  }

  // ---------- 统计 ----------
  function renderStats() {
    var people = allPeople();
    var votes = getVotes();
    var totalHeat = 0;
    people.forEach(function (p) {
      totalHeat += (p.heat || 0) + (votes[p.id] || 0);
    });
    document.getElementById("stats").innerHTML =
      '<div class="stat"><b>' + people.length + '</b><span>收录人物</span></div>' +
      '<div class="stat"><b>' + formatHeat(totalHeat) + '</b><span>全村总热度</span></div>' +
      '<div class="stat"><b>' + Object.keys(votes).length + '</b><span>你顶过的人</span></div>';
  }

  // ---------- 分类按钮 ----------
  function renderChips() {
    var cats = categoriesOf(allPeople());
    var box = document.getElementById("chips");
    box.innerHTML = "";
    cats.forEach(function (cat) {
      var btn = document.createElement("button");
      btn.className = "chip" + (state.category === cat ? " active" : "");
      btn.textContent = cat;
      btn.addEventListener("click", function () {
        state.category = cat;
        renderChips();
        renderGrid();
      });
      box.appendChild(btn);
    });
  }

  // ---------- 卡片列表 ----------
  function filtered() {
    var kw = state.keyword.trim().toLowerCase();
    var votes = getVotes();
    var list = allPeople().filter(function (p) {
      if (state.category !== "全部" && p.category !== state.category) return false;
      if (!kw) return true;
      var hay = [p.name, p.title, p.desc, (p.tags || []).join(" "), p.quote]
        .join(" ").toLowerCase();
      return hay.indexOf(kw) !== -1;
    });

    if (state.sort === "heat") {
      list.sort(function (a, b) {
        return ((b.heat || 0) + (votes[b.id] || 0)) - ((a.heat || 0) + (votes[a.id] || 0));
      });
    } else if (state.sort === "name") {
      list.sort(function (a, b) { return a.name.localeCompare(b.name, "zh"); });
    } else if (state.sort === "new") {
      var extraIds = getExtra().map(function (p) { return p.id; });
      list.sort(function (a, b) {
        return extraIds.indexOf(b.id) - extraIds.indexOf(a.id);
      });
    }
    return list;
  }

  function renderGrid() {
    var grid = document.getElementById("grid");
    var empty = document.getElementById("empty");
    var list = filtered();
    var votes = getVotes();
    grid.innerHTML = "";

    empty.classList.toggle("hidden", list.length > 0);

    list.forEach(function (p) {
      var isVoted = !!votes[p.id];
      var card = document.createElement("article");
      card.className = "card";
      card.innerHTML =
        '<div class="card-top">' +
          '<div class="avatar">' + avatarHTML(p) + '</div>' +
          '<div>' +
            '<h3 class="card-name">' + escapeHTML(p.name) + '</h3>' +
            '<span class="card-cat">' + escapeHTML(p.category) + '</span>' +
          '</div>' +
          '<button class="speak-btn" data-id="' + escapeHTML(p.id) + '"' +
            ' aria-label="朗读" title="听 TA 说">🔊</button>' +
        '</div>' +
        '<p class="card-title">' + escapeHTML(p.title || "") + '</p>' +
        (p.quote ? '<p class="card-quote">“' + escapeHTML(p.quote) + '”</p>' : "") +
        '<div class="card-foot">' +
          '<span class="heat">🔥 ' + formatHeat((p.heat || 0) + (votes[p.id] || 0)) + '</span>' +
          '<button class="vote' + (isVoted ? " voted" : "") + '">' +
            (isVoted ? "已顶 👍" : "顶一票 👍") +
          '</button>' +
        '</div>';

      card.addEventListener("click", function () { openDetail(p.id); });
      card.querySelector(".vote").addEventListener("click", function (e) {
        e.stopPropagation();
        toggleVote(p.id);
      });
      card.querySelector(".speak-btn").addEventListener("click", function (e) {
        e.stopPropagation();
        toggleSpeak(p);
      });
      grid.appendChild(card);
    });
  }

  // ---------- 投票 ----------
  function toggleVote(id) {
    var votes = getVotes();
    if (votes[id]) {
      delete votes[id];
    } else {
      votes[id] = 1;
    }
    writeJSON(VOTE_KEY, votes);
    renderAll();
    if (!document.getElementById("modal").classList.contains("hidden")) {
      openDetail(id); // 刷新弹窗内的热度
    }
  }

  // ---------- 详情弹窗 ----------
  function openDetail(id) {
    var people = allPeople().filter(function (p) { return p.id === id; })[0];
    if (!people) return;
    var votes = getVotes();
    var isVoted = !!votes[id];
    var tags = (people.tags || []).map(function (t) {
      return '<span class="tag">' + escapeHTML(t) + '</span>';
    }).join("");

    document.getElementById("modalBody").innerHTML =
      '<div class="detail-head">' +
        '<div class="avatar avatar-lg">' + avatarHTML(people) + '</div>' +
        '<div>' +
          '<h2 class="detail-name">' + escapeHTML(people.name) + '</h2>' +
          '<p class="detail-title">' + escapeHTML(people.category) +
            (people.title ? " · " + escapeHTML(people.title) : "") + '</p>' +
        '</div>' +
      '</div>' +
      (people.quote
        ? '<p class="detail-quote">“' + escapeHTML(people.quote) + '”</p>'
        : "") +
      '<p class="detail-desc">' + escapeHTML(people.desc || "这位村民还很神秘，介绍待补充。") + '</p>' +
      (people.origin
        ? '<p class="detail-origin">📎 来源与权利归属：' + escapeHTML(people.origin) + '</p>'
        : "") +
      (tags ? '<div class="detail-tags">' + tags + '</div>' : "") +
      '<div class="card-foot">' +
        '<span class="heat">🔥 热度 ' +
          formatHeat((people.heat || 0) + (votes[id] || 0)) + '</span>' +
        '<span class="detail-cta">' +
          '<button class="btn ghost speak-detail">🔊 朗读</button>' +
          '<button class="vote' + (isVoted ? " voted" : "") + '">' +
            (isVoted ? "已顶 👍" : "顶一票 👍") +
          '</button>' +
        '</span>' +
      '</div>';

    document.querySelector("#modalBody .vote").addEventListener("click", function () {
      toggleVote(id);
    });
    document.querySelector("#modalBody .speak-detail").addEventListener("click", function () {
      toggleSpeak(people);
    });
    document.getElementById("modal").classList.remove("hidden");
  }

  function closeModals() {
    if (hasTTS()) window.NaijiacunTTS.stop();
    document.getElementById("modal").classList.add("hidden");
    document.getElementById("addModal").classList.add("hidden");
    document.getElementById("voiceModal").classList.add("hidden");
  }

  // ---------- 提名新人 ----------
  function setupAddForm() {
    document.getElementById("addForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var form = e.target;
      var name = form.name.value.trim();
      if (!name) return;
      var emoji = form.emoji.value.trim() || "🙂";
      var extra = getExtra();
      var person = {
        id: "local-" + Date.now(),
        name: name,
        emoji: emoji,
        category: form.category.value,
        title: form.title.value.trim() || "新来的村民",
        heat: 100 + extra.length,
        quote: form.quote.value.trim(),
        desc: form.desc.value.trim() || "这位村民由你在本地提名，介绍待补充。",
        tags: ["本地提名"]
      };
      extra.push(person);
      writeJSON(EXTRA_KEY, extra);
      form.reset();
      closeModals();
      renderAll();
      openDetail(person.id);
    });
  }

  // ---------- 语音设置（BYOK：访客自带 Key） ----------
  var TTS_STORE = "naijacun_tts";

  // 站长部署好自己的透传代理后，把地址填在这里，访客只需填 Key
  var DEFAULT_TTS_ENDPOINT = "";

  function showToast(msg) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () { el.classList.add("hidden"); }, 3600);
  }
  window.showTTSNotice = showToast;

  function readTTSStore() {
    try {
      var raw = localStorage.getItem(TTS_STORE) || sessionStorage.getItem(TTS_STORE);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function applyTTSConfig(cfg) {
    if (!hasTTS() || !cfg) return;
    var t = window.NaijiacunTTS.config;
    t.endpoint = cfg.endpoint || DEFAULT_TTS_ENDPOINT;
    t.apiKey = cfg.key || "";
    t.defaultVoiceId = cfg.voiceId || "";
    t.browserVoice = cfg.browserVoice || "";
    t.provider = cfg.key && t.endpoint ? "breeze" : "browser";
  }

  function saveTTSConfig(cfg, remember) {
    var payload = JSON.stringify(cfg);
    try {
      localStorage.removeItem(TTS_STORE);
      sessionStorage.removeItem(TTS_STORE);
      if (remember) localStorage.setItem(TTS_STORE, payload);
      else sessionStorage.setItem(TTS_STORE, payload);
    } catch (e) { /* 隐私模式下可能写入失败 */ }
    applyTTSConfig(cfg);
  }

  function setVoiceStatus(msg, kind) {
    var el = document.getElementById("voiceStatus");
    el.textContent = msg || "";
    el.className = "status-line" + (kind ? " " + kind : "");
  }

  function fillVoiceSelect(list, selected) {
    var sel = document.querySelector('#voiceForm select[name="voice"]');
    var keep = '<option value="">不指定（用浏览器语音）</option>';
    sel.innerHTML = keep + (list || []).map(function (v) {
      return '<option value="' + escapeHTML(v.id) + '">' +
        escapeHTML(v.name) + (v.category ? " · " + escapeHTML(v.category) : "") +
        '</option>';
    }).join("");
    if (selected) sel.value = selected;
  }

  // 浏览器自带的音色列表（不同浏览器差别很大）
  function fillBrowserVoiceSelect(selected) {
    if (!hasTTS()) return;
    var sel = document.querySelector('#voiceForm select[name="browserVoice"]');
    if (!sel) return;
    var list = window.NaijiacunTTS.listBrowserVoices() || [];
    var hint = document.getElementById("browserVoiceHint");

    if (!list.length) {
      sel.innerHTML = '<option value="">当前浏览器没有可用的中文音色</option>';
      if (hint) {
        hint.textContent = "当前浏览器没有检测到中文音色，朗读可能不发声。" +
          "建议改用 Edge 打开，或在系统里安装中文语音包。";
      }
      return;
    }

    sel.innerHTML = '<option value="">自动挑选（推荐）</option>' + list.map(function (v) {
      var tag = v.local === false ? " · 在线" : "";
      return '<option value="' + escapeHTML(v.uri) + '">' + escapeHTML(v.name) + tag + '</option>';
    }).join("");

    if (selected) {
      var hit = list.some(function (v) { return v.uri === selected || v.name === selected; });
      sel.value = hit ? selected : "";
    }

    if (hint) {
      var auto = window.NaijiacunTTS.pickBrowserVoice();
      hint.textContent = "检测到 " + list.length + " 个中文音色" +
        (auto ? "，自动挑选的是「" + auto.name + "」" : "") +
        "。换浏览器会影响可用音色：Edge 一般自带自然音，Chrome 往往只有机械音。";
    }
  }

  function openVoiceModal() {
    var cfg = readTTSStore() || {};
    var t = hasTTS() ? window.NaijiacunTTS.config : {};
    document.querySelector('#voiceForm input[name="key"]').value = cfg.key || "";
    document.querySelector('#voiceForm input[name="endpoint"]').value =
      cfg.endpoint || DEFAULT_TTS_ENDPOINT || t.endpoint || "";
    document.querySelector('#voiceForm input[name="remember"]').checked = true;
    fillVoiceSelect(null, cfg.voiceId || "");
    fillBrowserVoiceSelect(cfg.browserVoice || "");
    setVoiceStatus("");
    document.getElementById("voiceModal").classList.remove("hidden");
  }

  function testVoiceKey() {
    if (!hasTTS()) return;
    var endpoint = document.querySelector('#voiceForm input[name="endpoint"]').value.trim();
    var key = document.querySelector('#voiceForm input[name="key"]').value.trim();

    if (!key) return setVoiceStatus("请先填入 Breeze API Key", "err");
    if (!endpoint) return setVoiceStatus("请填入代理地址（Breeze 未开放跨域，必须有代理）", "err");

    setVoiceStatus("正在验证…");
    window.NaijiacunTTS.checkKey(endpoint, key)
      .then(function (data) {
        var k = (data && data.api_key) || {};
        var left = k.credit_remaining;
        setVoiceStatus(
          "Key 有效" +
          (k.prefix ? "（" + k.prefix + "…）" : "") +
          (typeof left === "number" ? " · 剩余额度 " + left : "") +
          "，正在加载音色…",
          "ok"
        );
        return window.NaijiacunTTS.listVoices(endpoint, key);
      })
      .then(function (list) {
        fillVoiceSelect(list);
        setVoiceStatus("连接成功，共 " + list.length + " 个音色可选", "ok");
      })
      .catch(function (err) {
        setVoiceStatus(err.message || "验证失败", "err");
      });
  }

  function setupVoiceSettings() {
    document.getElementById("voiceBtn").addEventListener("click", openVoiceModal);
    document.getElementById("testKeyBtn").addEventListener("click", testVoiceKey);

    // 试听当前选中的浏览器音色
    var previewBtn = document.getElementById("previewVoiceBtn");
    if (previewBtn) {
      previewBtn.addEventListener("click", function () {
        if (!hasTTS()) return;
        var sel = document.querySelector('#voiceForm select[name="browserVoice"]');
        var uri = sel ? sel.value : "";
        window.NaijiacunTTS.previewVoice("你好呀，我是奶家村的新村民。欢迎来串门。", uri);
      });
    }

    // 浏览器音色是异步加载的，加载完刷新下拉框
    if ("speechSynthesis" in window) {
      window.speechSynthesis.addEventListener("voiceschanged", function () {
        var modal = document.getElementById("voiceModal");
        if (modal && !modal.classList.contains("hidden")) {
          var sel = document.querySelector('#voiceForm select[name="browserVoice"]');
          fillBrowserVoiceSelect(sel ? sel.value : "");
        }
      });
    }

    document.getElementById("clearKeyBtn").addEventListener("click", function () {
      try {
        localStorage.removeItem(TTS_STORE);
        sessionStorage.removeItem(TTS_STORE);
      } catch (e) { /* 忽略 */ }
      if (hasTTS()) {
        window.NaijiacunTTS.config.apiKey = "";
        window.NaijiacunTTS.config.provider = "browser";
      }
      document.querySelector('#voiceForm input[name="key"]').value = "";
      fillVoiceSelect(null, "");
      setVoiceStatus("已清除本机保存的 Key", "ok");
      showToast("已清除，改用浏览器语音");
    });

    document.getElementById("voiceForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var key = e.target.key.value.trim();
      var endpoint = e.target.endpoint.value.trim();
      var voiceId = e.target.voice.value;
      var browserVoice = e.target.browserVoice ? e.target.browserVoice.value : "";
      var remember = e.target.remember.checked;

      if (!key) {
        saveTTSConfig({ browserVoice: browserVoice }, remember);
        setVoiceStatus("未填 Key，已记住浏览器音色", "ok");
        showToast("已切换为浏览器语音");
        return;
      }
      saveTTSConfig({ key: key, endpoint: endpoint, voiceId: voiceId, browserVoice: browserVoice }, remember);
      setVoiceStatus(
        hasTTS() && window.NaijiacunTTS.canUseBreeze()
          ? "已启用，点卡片上的 🔊 试试"
          : "已保存，但代理地址为空，暂时仍用浏览器语音",
        "ok"
      );
      showToast("语音设置已保存");
      setTimeout(closeModals, 600);
    });
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    document.getElementById("search").addEventListener("input", function (e) {
      state.keyword = e.target.value;
      renderGrid();
    });

    document.getElementById("sort").addEventListener("change", function (e) {
      state.sort = e.target.value;
      renderGrid();
    });

    document.getElementById("randomBtn").addEventListener("click", function () {
      var list = filtered();
      if (!list.length) return;
      var pick = list[Math.floor(Math.random() * list.length)];
      openDetail(pick.id);
    });

    document.getElementById("addBtn").addEventListener("click", function () {
      document.getElementById("addModal").classList.remove("hidden");
      document.querySelector("#addForm input[name='name']").focus();
    });

    document.querySelectorAll(".modal").forEach(function (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target.hasAttribute("data-close")) closeModals();
      });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModals();
    });
  }

  function renderAll() {
    renderStats();
    renderChips();
    renderGrid();
  }

  // ---------- 启动 ----------
  bindEvents();
  setupAddForm();
  setupVoiceSettings();
  applyTTSConfig(readTTSStore());
  renderAll();

  // 语音播放状态与按钮联动
  if (hasTTS()) {
    window.NaijiacunTTS.onChange(function (id) {
      document.querySelectorAll(".speak-btn").forEach(function (btn) {
        btn.classList.toggle("playing", btn.dataset.id === id);
        btn.textContent = btn.dataset.id === id ? "⏹" : "🔊";
      });
      document.querySelectorAll(".speak-detail").forEach(function (btn) {
        btn.classList.toggle("playing", id !== null);
        btn.textContent = id !== null ? "⏹ 停止" : "🔊 朗读";
      });
    });
  }
})();
