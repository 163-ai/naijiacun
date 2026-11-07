// 奶家村 · 管理面板（删除村民）
//
// 权限模型：删除 = 通过 GitHub Contents API 修改 js/data.js 并提交到 main。
// 鉴权完全交给 GitHub —— 只有对本仓库有写权限（push）的协作者才能提交成功，
// 其他人即便打开面板、拿到前端代码，没有可用 Token 也删不掉任何东西。
//
// 使用：页面底部「🔒 管理」或访问 index.html#admin 打开面板，
// 粘贴一个 fine-grained Token（Repository permissions → Contents: Read and write）。

(function () {
  "use strict";

  var REPO = "163-ai/naijiacun";
  var BRANCH = "main";
  var DATA_PATH = "js/data.js";
  var TOKEN_KEY = "naijacun_admin_token_v1";
  var EXTRA_KEY = "naijacun_extra";

  // 想再把删除权限收紧到指定账号，就把 GitHub 用户名填进来（区分大小写）。
  // 留空 = 所有拥有本仓库写权限的协作者都能删。
  var ALLOWED_LOGINS = [];

  var token = "";
  var login = "";
  var busy = false;

  function $(id) { return document.getElementById(id); }

  function toast(msg) {
    var t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { t.classList.add("hidden"); }, 3600);
  }

  function setStatus(msg, kind) {
    var s = $("adminStatus");
    if (!s) return;
    s.textContent = msg || "";
    s.className = "status-line" + (kind ? " " + kind : "");
  }

  // ---------- GitHub API ----------
  function api(path, options) {
    options = options || {};
    var headers = {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Authorization": "Bearer " + token
    };
    if (options.body) headers["Content-Type"] = "application/json";
    return fetch("https://api.github.com" + path, {
      method: options.method || "GET",
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (!res.ok) {
          var msg = (data && data.message) || ("HTTP " + res.status);
          var err = new Error(msg);
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function verifyToken() {
    return api("/repos/" + REPO).then(function (repo) {
      var canPush = repo.permissions && repo.permissions.push;
      if (!canPush) {
        throw new Error("这个 Token 没有本仓库的写权限，无法删除。");
      }
      return api("/user");
    }).then(function (user) {
      login = user.login;
      if (ALLOWED_LOGINS.length && ALLOWED_LOGINS.indexOf(login) === -1) {
        throw new Error("账号 " + login + " 不在允许删除的名单里。");
      }
      return login;
    });
  }

  // ---------- UTF-8 base64 ----------
  function encodeBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = "";
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function decodeBase64(b64) {
    var bin = atob(String(b64).replace(/\s/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // ---------- 从 data.js 文本里摘掉一个对象 ----------
  // 从 start 处的 { 开始做括号配对（跳过字符串内的括号）
  function matchBrace(src, start) {
    var depth = 0, inStr = false, quote = "", esc = false;
    for (var i = start; i < src.length; i++) {
      var c = src[i];
      if (inStr) {
        if (esc) { esc = false; continue; }
        if (c === "\\") { esc = true; continue; }
        if (c === quote) inStr = false;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") { inStr = true; quote = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  // 删除数组里 id 对应的那一项（PEOPLE 数组）
  function removePersonBlock(src, id) {
    var needle = 'id: "' + id + '"';
    var at = src.indexOf(needle);
    if (at === -1) return null;
    var open = src.lastIndexOf("{", at);
    if (open === -1) return null;
    var close = matchBrace(src, open);
    if (close === -1) return null;

    var lineStart = src.lastIndexOf("\n", open) + 1;
    var after = close + 1;
    while (after < src.length && (src[after] === " " || src[after] === "\t")) after++;
    if (src[after] === ",") after++;
    var rest = src.slice(after).replace(/^[ \t]*\r?\n/, "");

    return src.slice(0, lineStart) + rest;
  }

  // 删除 { id: {...} } 这种键值对象（CHARACTER_VOICES / CHAT_PERSONA）
  function removeKeyedBlock(src, id) {
    var re = new RegExp("\\n[ \\t]*" + id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:\\s*\\{");
    var m = re.exec(src);
    if (!m) return src;
    var open = src.indexOf("{", m.index);
    var close = matchBrace(src, open);
    if (close === -1) return src;

    var lineStart = src.lastIndexOf("\n", open) + 1;
    var after = close + 1;
    while (after < src.length && (src[after] === " " || src[after] === "\t")) after++;
    if (src[after] === ",") after++;
    var rest = src.slice(after).replace(/^[ \t]*\r?\n/, "");
    return src.slice(0, lineStart) + rest;
  }

  function stripPerson(src, id) {
    var out = removePersonBlock(src, id);
    if (!out) return null;
    return removeKeyedBlock(removeKeyedBlock(out, id), id);
  }

  // ---------- 数据读取 ----------
  function builtinPeople() {
    return typeof PEOPLE !== "undefined" ? PEOPLE : [];
  }

  function localExtra() {
    try {
      var raw = localStorage.getItem(EXTRA_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function removeLocalExtra(id) {
    try {
      var list = localExtra().filter(function (p) { return p.id !== id; });
      localStorage.setItem(EXTRA_KEY, JSON.stringify(list));
    } catch (e) { /* 忽略 */ }
  }

  // ---------- 列表渲染 ----------
  function renderList() {
    var box = $("adminList");
    if (!box) return;
    box.innerHTML = "";

    var rows = [];
    builtinPeople().forEach(function (p) { rows.push({ p: p, source: "仓库" }); });
    localExtra().forEach(function (p) { rows.push({ p: p, source: "本机提名" }); });

    if (!rows.length) {
      box.innerHTML = '<p class="hint tiny">村里现在没有人。</p>';
      return;
    }

    rows.forEach(function (row) {
      var el = document.createElement("div");
      el.className = "admin-row";
      el.innerHTML =
        '<div class="admin-meta">' +
          '<strong>' + (row.p.emoji ? row.p.emoji + " " : "") + escapeText(row.p.name) + '</strong>' +
          '<span>' + escapeText(row.p.id) + ' · ' + row.source + '</span>' +
        '</div>' +
        '<button class="btn ghost danger" type="button">删除</button>';

      el.querySelector("button").addEventListener("click", function () {
        requestDelete(row.p, row.source === "本机提名", el);
      });
      box.appendChild(el);
    });
  }

  function escapeText(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---------- 删除 ----------
  function requestDelete(person, isLocal, rowEl) {
    if (busy) return;

    if (isLocal) {
      if (!confirm("把「" + person.name + "」从本机提名里移除？（只影响你这台设备）")) return;
      removeLocalExtra(person.id);
      rowEl.remove();
      toast("已从本机提名中移除「" + person.name + "」");
      return;
    }

    if (!confirm("确定删除「" + person.name + "」？\n\n这会直接提交到仓库 main 分支，GitHub Pages 1~2 分钟后生效。")) return;

    busy = true;
    setStatus("正在读取 " + DATA_PATH + " …");

    var fileSha = null;
    var newText = null;

    api("/repos/" + REPO + "/contents/" + DATA_PATH + "?ref=" + BRANCH)
      .then(function (file) {
        fileSha = file.sha;
        var text = decodeBase64(file.content);
        newText = stripPerson(text, person.id);
        if (!newText) throw new Error("在 data.js 里没找到 id 为 " + person.id + " 的条目。");
        if (newText === text) throw new Error("没有从 data.js 里删掉任何内容，已中止。");
        setStatus("正在提交删除 …");
        return api("/repos/" + REPO + "/contents/" + DATA_PATH, {
          method: "PUT",
          body: {
            message: "chore(data): 删除村民「" + person.name + "」(" + person.id + ")",
            content: encodeBase64(newText),
            sha: fileSha,
            branch: BRANCH
          }
        });
      })
      .then(function (res) {
        var arr = builtinPeople();
        for (var i = 0; i < arr.length; i++) {
          if (arr[i].id === person.id) { arr.splice(i, 1); break; }
        }
        removeCard(person.id);
        rowEl.remove();
        setStatus("已提交。（" + ((res && res.commit && res.commit.sha) || "").slice(0, 7) + "）", "ok");
        toast("已删除「" + person.name + "」，线上约 1 分钟后生效");
      })
      .catch(function (err) {
        setStatus("删除失败：" + err.message, "err");
      })
      .then(function () { busy = false; });
  }

  function removeCard(id) {
    var btn = document.querySelector('#grid .card [data-id="' + id + '"]');
    var card = btn && btn.closest ? btn.closest(".card") : null;
    if (card) card.remove();

    var stats = document.querySelectorAll("#stats .stat b");
    if (stats.length) stats[0].textContent = String(builtinPeople().length + localExtra().length);
  }

  // ---------- 打开/关闭面板 ----------
  function showLocked() {
    $("adminLocked").classList.remove("hidden");
    $("adminPanel").classList.add("hidden");
  }

  function showPanel() {
    $("adminLocked").classList.add("hidden");
    $("adminPanel").classList.remove("hidden");
    $("adminWho").textContent = "已以 " + login + " 身份进入：只列出删除操作，不会改动其他内容。";
    renderList();
  }

  function open() {
    $("adminModal").classList.remove("hidden");
    setStatus("");
    if (token) {
      verifyToken().then(showPanel).catch(function (err) {
        token = "";
        localStorage.removeItem(TOKEN_KEY);
        showLocked();
        setStatus(err.message + " 请重新填写。", "err");
      });
    } else {
      showLocked();
    }
  }

  function close() {
    $("adminModal").classList.add("hidden");
  }

  // ---------- 初始化 ----------
  function init() {
    if (!$("adminModal")) return;

    document.querySelectorAll("#adminModal [data-close]").forEach(function (btn) {
      btn.addEventListener("click", close);
    });

    var entry = $("adminEntry");
    if (entry) {
      entry.addEventListener("click", function (e) {
        e.preventDefault();
        open();
      });
    }

    $("adminForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var form = e.target;
      var value = (form.token.value || "").trim();
      if (!value) { setStatus("请先填 Token。", "err"); return; }

      setStatus("正在校验权限 …");
      token = value;
      verifyToken().then(function () {
        if (form.remember.checked) {
          try { localStorage.setItem(TOKEN_KEY, token); } catch (err) { /* 忽略 */ }
        } else {
          localStorage.removeItem(TOKEN_KEY);
        }
        form.reset();
        setStatus("");
        showPanel();
      }).catch(function (err) {
        token = "";
        localStorage.removeItem(TOKEN_KEY);
        setStatus(err.message, "err");
      });
    });

    $("adminOut").addEventListener("click", function () {
      token = "";
      login = "";
      localStorage.removeItem(TOKEN_KEY);
      showLocked();
      setStatus("已退出管理。", "ok");
      toast("已退出管理");
    });

    var saved = "";
    try { saved = localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { saved = ""; }
    if (saved) {
      token = saved;
      verifyToken().then(function () {
        if (location.hash === "#admin") open();
      }).catch(function () {
        token = "";
        localStorage.removeItem(TOKEN_KEY);
      });
    }

    if (location.hash === "#admin") open();

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !$("adminModal").classList.contains("hidden")) close();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
