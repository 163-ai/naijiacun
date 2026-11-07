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
          '<div class="avatar">' + escapeHTML(p.emoji || "🙂") + '</div>' +
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
        '<div class="avatar">' + escapeHTML(people.emoji || "🙂") + '</div>' +
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
