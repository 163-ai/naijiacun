/* 奶家村 · 村口放映厅（相亲相爱一家人）
 * 群聊式的视频索引页：视频按「免跳转 → 热度 → 二创」排序后逐条推送，
 * 两条之间至少隔 30 秒，间隔由群成员闲聊填满。
 * 只做索引，不下载、不转存任何视频文件。
 */
(function () {
  "use strict";

  var D = window.NAIJIA_GROUP;
  if (!D) return;

  var list = document.getElementById("msgList");
  var input = document.getElementById("input");
  var composer = document.getElementById("composer");
  var rail = document.getElementById("memberRail");
  var skipBtn = document.getElementById("skipBtn");
  var pushCount = document.getElementById("pushCount");
  var stickerBtn = document.getElementById("stickerBtn");
  var stickerPanel = document.getElementById("stickerPanel");
  var newMsgChip = document.getElementById("newMsg");
  var toastEl = document.getElementById("toast");

  var dlg = document.getElementById("playerDlg");
  var dTitle = document.getElementById("pTitle");
  var dPlatform = document.getElementById("pPlatform");
  var dStage = document.getElementById("pStage");
  var dNote = document.getElementById("pNote");
  var dWin = document.getElementById("pWin");
  var dOrigin = document.getElementById("pOrigin");

  var noticeDlg = document.getElementById("noticeDlg");
  var currentVideo = null;

  var SEEN_KEY = "naijiacun-group-seen-v2";
  var members = D.members || {};
  var memberKeys = Object.keys(members);
  var MIN_GAP = (D.push && D.push.minGapMs) || 30000;

  /* ---------- 排片：按推荐分排序 ---------- */
  var ranked = D.rank ? D.rank(D.videos || []) : (D.videos || []).map(function (v) {
    return { video: v, score: 0, tags: [], mode: "inline" };
  });
  var posts = ranked.map(function (r) {
    var v = r.video;
    v._tags = r.tags || [];
    v._score = r.score || 0;
    v._mode = r.mode;
    return v;
  });

  /* ---------- 小工具 ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function seenCount() {
    try { return parseInt(localStorage.getItem(SEEN_KEY) || "0", 10) || 0; } catch (e) { return 0; }
  }
  function markSeen(n) {
    try { localStorage.setItem(SEEN_KEY, String(n)); } catch (e) {}
  }
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.add("hidden"); }, 2600);
  }

  /* ---------- 顶部群头像 ---------- */
  (function buildHead() {
    var box = document.getElementById("gAvatars");
    memberKeys.slice(0, 3).forEach(function (k) {
      var img = el("img");
      img.src = members[k].avatar;
      img.alt = "";
      img.loading = "lazy";
      box.appendChild(img);
    });
    var more = el("span", null, "+" + Math.max(0, memberKeys.length - 3));
    box.appendChild(more);
    document.getElementById("gName").textContent = D.name || "相亲相爱一家人";
    document.getElementById("gSub").textContent = D.subtitle || "";
    document.getElementById("memberCount").textContent = memberKeys.length + " 位";
  })();

  /* ---------- 左侧成员 ---------- */
  memberKeys.forEach(function (k) {
    var m = members[k];
    var item = el("div", "ch-rail-item");
    var img = el("img");
    img.src = m.avatar;
    img.alt = m.name;
    img.loading = "lazy";
    var meta = el("div", "ch-rail-meta");
    meta.appendChild(el("span", "ch-rail-name", m.name));
    meta.appendChild(el("span", "ch-rail-last", m.title || ""));
    item.appendChild(img);
    item.appendChild(meta);
    rail.appendChild(item);
  });

  /* ---------- 滚动与“有新消息” ---------- */
  function nearBottom() {
    return list.scrollHeight - list.scrollTop - list.clientHeight < 260;
  }
  function toBottom() { list.scrollTop = list.scrollHeight; }
  function autoScroll() {
    if (nearBottom()) toBottom();
    else newMsgChip.hidden = false;
  }
  newMsgChip.addEventListener("click", function () {
    newMsgChip.hidden = true;
    toBottom();
  });

  /* ---------- 消息渲染 ---------- */
  function addSystem(text) {
    list.appendChild(el("div", "g-sys", text));
  }

  function rowFor(senderKey, mine) {
    var row = el("div", "ch-row " + (mine ? "me" : "bot"));
    if (mine) {
      row.appendChild(el("span", "g-me-av", "你"));
    } else {
      var av = el("img");
      var m = members[senderKey] || {};
      av.src = m.avatar || "";
      av.alt = m.name || senderKey;
      av.loading = "lazy";
      row.appendChild(av);
    }
    return row;
  }

  function addText(senderKey, text, mine) {
    var row = rowFor(senderKey, mine);
    var bubble = el("div", "ch-bubble", text);
    if (!mine) {
      var name = el("div", "g-name", (members[senderKey] || {}).name || senderKey);
      var wrap = el("div", "g-bwrap");
      wrap.appendChild(name);
      wrap.appendChild(bubble);
      row.appendChild(wrap);
    } else {
      row.appendChild(bubble);
    }
    list.appendChild(row);
    return row;
  }

  var TAG_CLASS = { "免跳转": "free", "高热度": "hot", "二创": "ugc", "小窗": "win", "跳转": "win" };

  function addVideo(senderKey, v) {
    var m = members[senderKey] || {};
    var status = v.status || "ok";
    var row = rowFor(senderKey, false);
    var wrap = el("div", "g-bwrap");
    wrap.appendChild(el("div", "g-name", m.name || senderKey));

    var card = el("div", "g-card " + status);
    var poster = el("div", "g-poster");
    var pet = el("img");
    pet.src = m.pet || m.avatar || "";
    pet.alt = "";
    pet.loading = "lazy";
    poster.appendChild(pet);
    poster.appendChild(el("span", "g-chip " + v.platform, v.platform === "bilibili" ? "B 站" : "抖音"));
    poster.appendChild(el("span", "g-play", "▶"));
    card.appendChild(poster);

    var info = el("div", "g-vinfo");
    info.appendChild(el("div", "g-vtitle", v.title || "未命名视频"));
    info.appendChild(el("div", "g-vmeta", (v.author || "") + (v.stat ? " · " + v.stat : "")));

    if (v._tags && v._tags.length) {
      var tags = el("div", "g-tags");
      v._tags.forEach(function (t) {
        tags.appendChild(el("span", "g-tag " + (TAG_CLASS[t] || ""), t));
      });
      info.appendChild(tags);
    }

    var hint = status === "ok"
      ? (v.platform === "bilibili"
        ? (v.embed === false ? "点击 · 小窗观看（官方番剧）" : "点击 · 直接在群里看")
        : "点击 · 小窗观看")
      : (status === "pending" ? "链接待录入" : "视频已失效");
    info.appendChild(el("div", "g-vhint", hint));
    card.appendChild(info);

    card.addEventListener("click", function () { playItem(v); });
    wrap.appendChild(card);
    row.appendChild(wrap);
    list.appendChild(row);
    return row;
  }

  /* ---------- 人手节奏 ----------
     看到消息先愣一下（thinkTime），再按字数一个字一个字敲（typingTime）。
     中文手打大约每字 100~180ms，短句也要一秒多，长句最多拖到 5 秒。 */
  function thinkTime() {
    return 700 + Math.random() * 900;          /* 0.7 ~ 1.6 秒：像刚看到你这条 */
  }
  function typingTime(text, cap) {
    var n = String(text || "").length;
    var ms = 420 + n * (100 + Math.random() * 80);
    var max = cap || 4800;
    return Math.min(max, Math.max(1000, ms));
  }

  function showTyping(senderKey) {
    var m = members[senderKey] || {};
    var row = rowFor(senderKey, false);
    var wrap = el("div", "g-bwrap");
    wrap.appendChild(el("div", "g-name", m.name || senderKey));
    var bubble = el("div", "ch-bubble");
    var dots = el("span", "ch-typing");
    dots.appendChild(el("i")); dots.appendChild(el("i")); dots.appendChild(el("i"));
    bubble.appendChild(dots);
    wrap.appendChild(bubble);
    row.appendChild(wrap);
    list.appendChild(row);
    autoScroll();
    return row;
  }

  function renderMsg(msg) {
    if (msg.type === "system" || msg.type === "date") addSystem(msg.text);
    else if (msg.type === "text") addText(msg.sender, msg.text, false);
    autoScroll();
  }

  /* ---------- 表情包（直接用现成开源表情图，CDN 外链，失败退回 emoji 字形） ---------- */
  function stickerSources(s) {
    var urls = [];
    if (s.src) urls.push(s.src);
    (D.stickerCdn || []).forEach(function (base) { urls.push(base + s.emoji + ".svg"); });
    return urls;
  }

  function attachSticker(img, s) {
    var urls = stickerSources(s), i = 0;
    function next() {
      if (i >= urls.length) {
        var span = el("span", "g-sticker-emoji", s.label || "🙂");
        if (img.parentNode) img.parentNode.replaceChild(span, img);
        return;
      }
      img.src = urls[i++];
    }
    img.addEventListener("error", next);
    next();
  }

  function addSticker(senderKey, s, mine) {
    var row = rowFor(senderKey, mine);
    var box = el("div", "g-sticker");
    box.style.setProperty("--tilt", (Math.random() * 4 - 2).toFixed(1) + "deg");
    var img = el("img");
    img.alt = s.label || "表情";
    img.loading = "lazy";
    box.appendChild(img);
    attachSticker(img, s);

    if (mine) {
      row.appendChild(box);
    } else {
      var wrap = el("div", "g-bwrap");
      wrap.appendChild(el("div", "g-name", (members[senderKey] || {}).name || senderKey));
      wrap.appendChild(box);
      row.appendChild(wrap);
    }
    list.appendChild(row);
    autoScroll();
    return row;
  }

  function stickerPool() { return D.stickers || []; }
  function stickerOf(key) {
    var mine = stickerPool().filter(function (s) { return s.sender === key; });
    return mine.length ? pick(mine) : pick(stickerPool());
  }

  /* 群成员自己发一张表情包 */
  function emitSticker(key, delay) {
    var s = stickerOf(key);
    if (!s) return;
    later(function () {
      if (!flow.playing && flow.stage !== "ambient") return;
      var tip = showTyping(key);
      later(function () {
        if (tip.parentNode) tip.remove();
        addSticker(key, s, false);
      }, 1000 + Math.random() * 900);
    }, delay || 0);
  }

  /* 表情面板（输入框左边笑脸打开） */
  function buildStickerPanel(panel) {
    stickerPool().forEach(function (s) {
      var cell = el("button", "g-sticker-cell");
      cell.type = "button";
      cell.title = (members[s.sender] || {}).name + " · " + (s.label || "表情");
      var img = el("img");
      img.alt = s.label || "";
      img.loading = "lazy";
      cell.appendChild(img);
      attachSticker(img, s);
      cell.addEventListener("click", function () {
        sendMySticker(s);
        panel.hidden = true;
        if (stickerBtn) stickerBtn.setAttribute("aria-expanded", "false");
      });
      panel.appendChild(cell);
    });
  }

  function removeTyping() {
    var tips = list.querySelectorAll(".ch-typing");
    for (var i = 0; i < tips.length; i++) {
      var row = tips[i];
      while (row && String(row.className).indexOf("ch-row") < 0) row = row.parentElement;
      if (row) row.remove();
    }
  }

  /* ---------- 回放引擎：开场 → 排片推送 → 闲聊 ---------- */
  var flow = {
    stage: "",            // "" | "intro" | "plan" | "ambient"
    playing: false,
    timers: [],
    introIdx: 0,
    pushed: 0,
    total: posts.length,
    pool: []
  };

  function later(fn, ms) {
    flow.timers.push(setTimeout(fn, Math.max(0, Math.round(ms || 0))));
  }
  function clearTimers() {
    flow.timers.forEach(clearTimeout);
    flow.timers = [];
  }
  function updateCount() {
    if (!pushCount) return;
    if (flow.stage === "plan") {
      pushCount.hidden = false;
      pushCount.textContent = "已推送 " + flow.pushed + " / " + flow.total;
    } else {
      pushCount.hidden = true;
    }
  }

  /* 开场白：逐条打字发出 */
  function playIntro(done) {
    var intro = D.intro || [];
    flow.stage = "intro";
    flow.playing = true;
    flow.introIdx = 0;
    skipBtn.hidden = false;
    updateCount();

    function next() {
      if (!flow.playing) return;
      if (flow.introIdx >= intro.length) { done(); return; }
      var m = intro[flow.introIdx++];
      if (m.type === "text") {
        var tip = showTyping(m.sender);
        var dur = typingTime(m.text, 4200);
        later(function () {
          if (!flow.playing) return;
          if (tip.parentNode) tip.remove();
          renderMsg(m);
          later(next, 320 + Math.random() * 420);
        }, dur);
      } else {
        later(function () {
          if (!flow.playing) return;
          renderMsg(m);
          later(next, 460);
        }, 280);
      }
    }
    next();
  }

  /* 间隔里的闲聊：文字与表情包混着发 */
  function emitChatter() {
    guard(function () {
      if (!flow.playing) return;
      if (stickerPool().length && Math.random() < 0.3) {
        var key = pick(memberKeys);
        var s = stickerOf(key);
        var tip = showTyping(key);
        later(function () {
          if (!flow.playing) return;
          if (tip.parentNode) tip.remove();
          addSticker(key, s, false);
        }, 600 + Math.random() * 450);
        return;
      }
      var pool = D.ambient || [];
      if (!pool.length) return;
      if (!flow.pool.length) flow.pool = shuffle(pool.slice());
      var line = flow.pool.pop();
      var typeMs = typingTime(line[1], 3600);
      var tip2 = showTyping(line[0]);
      later(function () {
        if (!flow.playing) return;
        if (tip2.parentNode) tip2.remove();
        addText(line[0], line[1], false);
        autoScroll();
      }, typeMs);
    });
  }

  /* 发卡前的铺垫台词：一句打完再打下句，整块贴着卡片收尾 */
  function emitLead(v, offset, cardAt) {
    var lines = v.lead || [];
    if (!lines.length) return;
    var types = lines.map(function (t) { return typingTime(t, 4200); });
    var total = types.reduce(function (a, b) { return a + b; }, 0) + 600 * (lines.length - 1);
    var start = offset;
    if (cardAt) start = Math.max(offset, cardAt - 1900 - total);

    var cursor = start;
    lines.forEach(function (text, i) {
      var typeMs = types[i];
      later(function () {
        guard(function () {
          if (!flow.playing) return;
          var tip = showTyping(v.sender);
          later(function () {
            if (!flow.playing) return;
            if (tip.parentNode) tip.remove();
            addText(v.sender, text, false);
            autoScroll();
          }, typeMs);
        });
      }, cursor);
      cursor += typeMs + 600 + Math.random() * 300;
    });
  }

  function pushCard(v) {
    if (!flow.playing) return;
    addVideo(v.sender, v);
    flow.pushed++;
    markSeen(flow.pushed);
    updateCount();
    autoScroll();
  }

  /* 按时间轴推送：至少 MIN_GAP 一条 */
  function runPlan(fromIndex) {
    var rest = posts.slice(fromIndex || 0);
    if (!rest.length) { endFlow(); startAmbient(); return; }

    flow.stage = "plan";
    flow.playing = true;
    flow.pushed = fromIndex || 0;
    skipBtn.hidden = false;
    updateCount();

    var plan = D.planTimeline
      ? D.planTimeline(rest, { minGapMs: MIN_GAP, startMs: 1600 })
      : rest.map(function (v, i) { return { video: v, leadAt: 1600 + i * MIN_GAP, at: 4000 + i * MIN_GAP, fillers: [] }; });

    plan.forEach(function (item) {
      emitLead(item.video, item.leadAt, item.at);
      later(function () { guard(function () { pushCard(item.video); }); }, item.at);
      item.fillers.forEach(function (ms) { later(emitChatter, ms); });
    });

    var lastAt = plan.length ? plan[plan.length - 1].at : 0;
    later(function () {
      endFlow();
      startAmbient();
    }, lastAt + 6000);
  }

  function endFlow() {
    flow.playing = false;
    flow.stage = "";
    clearTimers();
    removeTyping();
    skipBtn.hidden = true;
    updateCount();
    markSeen(flow.total);
    toBottom();
  }

  function skipFlow() {
    clearTimers();
    removeTyping();

    if (flow.stage === "intro") {
      var intro = D.intro || [];
      while (flow.introIdx < intro.length) renderMsg(intro[flow.introIdx++]);
    }
    while (flow.pushed < flow.total) {
      var v = posts[flow.pushed];
      (v.lead || []).forEach(function (text) { addText(v.sender, text, false); });
      addVideo(v.sender, v);
      flow.pushed++;
    }
    newMsgChip.hidden = true;
    endFlow();
    startAmbient();
  }
  skipBtn.addEventListener("click", skipFlow);

  /* ---------- 闲着也唠嗑 ---------- */
  function startAmbient() {
    var pool = D.ambient || [];
    if (!pool.length) return;
    flow.stage = "ambient";
    function next() {
      if (!flow.pool.length) flow.pool = shuffle(pool.slice());
      var line = flow.pool.pop();
      var tip = showTyping(line[0]);
      later(function () {
        if (tip.parentNode) tip.remove();
        addText(line[0], line[1], false);
        autoScroll();
        later(next, 24000 + Math.random() * 26000);
      }, 900 + Math.random() * 700);
    }
    later(next, 15000 + Math.random() * 13000);
  }

  /* ---------- 播放 ---------- */
  function isMobile() { return window.matchMedia("(max-width: 800px)").matches; }

  function bvidOf(v) {
    if (v.id) return v.id;
    var m = (v.url || "").match(/BV[a-zA-Z0-9]+/);
    return m ? m[0] : "";
  }

  function playItem(v) {
    var status = v.status || "ok";
    if (status !== "ok") {
      toast(status === "pending" ? "这条的链接还没录入，去 js/group-data.js 补上就好" : "视频已失效，等群主换一条吧");
      return;
    }
    currentVideo = v;
    if (v.platform === "bilibili" && v.embed !== false) {
      var id = bvidOf(v);
      if (!id) { toast("缺少 BV 号，请检查 group-data.js 的 id 字段"); return; }
      openEmbed(id, v);
    } else {
      openLauncher(v);
    }
  }

  function openEmbed(id, v) {
    dPlatform.textContent = "B 站 · 站内播放";
    dTitle.textContent = v.title || "视频";
    dNote.textContent = "播放器为 B 站官方外链，画质上限 720P（未登录时）；想看更高画质可在原平台打开。";
    dWin.hidden = true;
    dOrigin.href = v.url || "#";
    dStage.innerHTML = "";
    var f = document.createElement("iframe");
    f.src = "https://player.bilibili.com/player.html?bvid=" + encodeURIComponent(id)
      + "&autoplay=1&danmaku=0&high_quality=1&qn=64";
    f.setAttribute("allow", "fullscreen; autoplay; encrypted-media");
    f.setAttribute("allowfullscreen", "");
    f.setAttribute("referrerpolicy", "no-referrer");
    f.setAttribute("scrolling", "no");
    dStage.appendChild(f);
    if (!dlg.open) dlg.showModal();
  }

  function openLauncher(v) {
    dPlatform.textContent = v.platform === "douyin" ? "抖音 · 小窗观看" : "B 站 · 官方番剧";
    dTitle.textContent = v.title || "视频";
    dNote.textContent = v.platform === "douyin"
      ? "抖音不开放第三方网页嵌入，小窗里是抖音官方页面，人还留在群里。"
      : "官方番剧需要在 B 站页面里播放，已为你准备小窗。";
    dWin.hidden = false;
    dOrigin.href = v.url || "#";
    dStage.innerHTML = "";

    var box = el("div", "g-launch");
    var img = el("img");
    var sender = v._sender && members[v._sender] ? members[v._sender] : null;
    img.src = sender ? (sender.pet || sender.avatar) : "";
    img.alt = "";
    box.appendChild(img);

    var sub = el("p", null, (v.author || "") + (v.stat ? " · " + v.stat : ""));
    var b1 = el("button", "ch-tool primary", "小窗打开");
    b1.type = "button";
    b1.addEventListener("click", function () {
      var win = openPopup(v.url);
      if (win) { dlg.close(); toast("已在小窗打开，可拖拽窗口边缘调整大小"); }
      else toast("浏览器拦截了小窗，请用「在原平台打开」");
    });
    var b2 = el("button", "ch-tool", "新标签页打开");
    b2.type = "button";
    b2.addEventListener("click", function () { window.open(v.url, "_blank", "noopener"); dlg.close(); });

    var actions = el("div", "g-launch-row");
    actions.appendChild(b1);
    actions.appendChild(b2);

    box.appendChild(el("h3", null, v.platform === "douyin" ? "这条得去抖音看" : "这条得去 B 站看"));
    box.appendChild(sub);
    box.appendChild(actions);
    dStage.appendChild(box);

    if (!dlg.open) dlg.showModal();
  }

  function openPopup(url) {
    if (isMobile()) { window.location.href = url; return true; }
    var availW = window.screen.availWidth || 1280;
    var availH = window.screen.availHeight || 800;
    var w = Math.min(980, availW - 60);
    var h = Math.min(940, availH - 50);
    var left = Math.max(10, availW - w - 20);
    var top = Math.max(10, Math.round((availH - h) / 2));
    return window.open(url, "groupvideowin",
      "width=" + w + ",height=" + h + ",left=" + left + ",top=" + top
      + ",menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes");
  }

  document.getElementById("pClose").addEventListener("click", function () {
    dStage.innerHTML = "";
    dlg.close();
  });
  dlg.addEventListener("close", function () { dStage.innerHTML = ""; });
  dWin.addEventListener("click", function () {
    if (!currentVideo) return;
    var win = openPopup(currentVideo.url);
    if (win) { dlg.close(); toast("已在小窗打开，可拖拽窗口边缘调整大小"); }
    else toast("浏览器拦截了小窗，请用「在原平台打开」");
  });

  document.getElementById("noticeBtn").addEventListener("click", function () { noticeDlg.showModal(); });

  /* ---------- 你说话，群里先回你 ---------- */
  var REPLIES = [
    "哈哈哈哈哈", "这条必须收藏", "再来一条！", "默默点了个赞", "已阅，退下了",
    "好活，赏", "笑得泡脚水都洒了", "这条比上一条好笑", "本龙觉得很一般（骄傲）",
    "嘎嘎滴辣虾", "你的胆子真是肥嘟嘟"
  ];
  var holdUntil = 0;
  var replySeq = 0;

  /* 你说话之后的一小段时间里，自动推送先让路 */
  function hold(ms) { holdUntil = Math.max(holdUntil, Date.now() + (ms || 6500)); }
  function guard(fn) {
    if (Date.now() < holdUntil) {
      later(function () { guard(fn); }, holdUntil - Date.now() + 80);
      return false;
    }
    fn();
    return true;
  }

  /* 按你说的内容挑个最该出来接话的人 */
  function respondersFor(text) {
    var t = String(text || "");
    var map = [
      [/视频|链接|失效|打不开|播不了|看不了|加载|卡住/, "xiaoqi"],
      [/表情|贴纸|斗图|包/, "naicha"],
      [/奶龙|本龙/, "nailong"],
      [/奶蛙|蛙/, "naiwa"],
      [/牛来|牛/, "niulai"],
      [/卡皮|水豚|橘子/, "capybara"],
      [/暴/, "baobaolong"],
      [/奶察|警察|巡逻/, "naicha"],
      [/肥嘟|袋鼠/, "feidudu"]
    ];
    var keys = [];
    map.forEach(function (p) {
      if (p[0].test(t) && keys.indexOf(p[1]) < 0) keys.push(p[1]);
    });
    return keys;
  }

  function replyLine(key) {
    var lines = (D.replies && D.replies[key]) || REPLIES;
    return pick(lines);
  }

  /* 最高优先级：你说话，一定有人接——但要像人一样慢慢打 */
  function onUserSpoke(text, sticker) {
    var keys = sticker ? [sticker.sender] : respondersFor(text);
    if (!keys.length) keys = memberKeys.slice();
    var key = pick(keys);
    var line = replyLine(key);

    /* 连发几条时，后面的人依次往后排，不抢话 */
    var think = thinkTime() + replySeq * 320;
    var typeMs = typingTime(line);
    replySeq++;

    /* 这一轮对话期间自动推送让路 */
    hold(think + typeMs + 3000);
    removeTyping();

    later(function () {
      var tip = showTyping(key);
      autoScroll();

      later(function () {
        if (tip.parentNode) tip.remove();
        addText(key, line, false);
        autoScroll();
        replySeq = Math.max(0, replySeq - 1);

        if (sticker && Math.random() < 0.45) {
          /* 你发表情，他/她看一会儿也回一张表情 */
          emitSticker(key, 1200 + Math.random() * 900);
        } else if (!sticker && Math.random() < 0.34) {
          /* 群里另一个人看到话题，过几秒也插一句 */
          secondVoice(key);
        }
      }, typeMs);
    }, think);
  }

  /* 第二个人插话：看你俩聊了几句才接上，打字时间另算 */
  function secondVoice(exceptKey) {
    var others = memberKeys.filter(function (k) { return k !== exceptKey; });
    if (!others.length) return;
    var key = pick(others);
    var line = replyLine(key);
    var think = 1400 + Math.random() * 1800;   /* 1.4 ~ 3.2 秒后才开始打字 */
    var typeMs = typingTime(line);

    hold(think + typeMs + 2200);
    later(function () {
      var tip = showTyping(key);
      autoScroll();
      later(function () {
        if (tip.parentNode) tip.remove();
        addText(key, line, false);
        autoScroll();
      }, typeMs);
    }, think);
  }

  function sendMySticker(s) {
    addSticker(null, s, true);
    toBottom();
    onUserSpoke("", s);
  }

  composer.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    addText(null, text, true);
    input.value = "";
    input.style.height = "auto";
    toBottom();
    onUserSpoke(text, null);
  });

  /* ---------- 表情面板 ---------- */
  if (stickerBtn && stickerPanel) {
    buildStickerPanel(stickerPanel);
    function closePanel() {
      stickerPanel.hidden = true;
      stickerBtn.setAttribute("aria-expanded", "false");
    }
    stickerBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var opening = stickerPanel.hidden;
      stickerPanel.hidden = !opening;
      stickerBtn.setAttribute("aria-expanded", opening ? "true" : "false");
    });
    document.addEventListener("click", function (e) {
      if (stickerPanel.hidden) return;
      if (stickerPanel.contains(e.target) || stickerBtn.contains(e.target)) return;
      closePanel();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !stickerPanel.hidden) closePanel();
    });
  }

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      composer.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  });
  input.addEventListener("input", function () {
    input.style.height = "auto";
    input.style.height = Math.min(120, input.scrollHeight) + "px";
  });

  /* ---------- 启动：首次看排片，回访只推新增 ---------- */
  (function boot() {
    var intro = D.intro || [];
    var seen = Math.min(seenCount(), posts.length);

    function renderIntroAll() {
      intro.forEach(renderMsg);
    }
    function renderPosts(from, to) {
      for (var i = from; i < to; i++) {
        var v = posts[i];
        (v.lead || []).forEach(function (text) { addText(v.sender, text, false); });
        addVideo(v.sender, v);
      }
      flow.pushed = to;
    }

    if (seen >= posts.length && posts.length) {
      renderIntroAll();
      renderPosts(0, posts.length);
      addSystem(pick(D.welcomeBack || ["欢迎回来。"]));
      var away = shuffle((D.ambient || []).slice()).slice(0, 1 + Math.floor(Math.random() * 2));
      away.forEach(function (line) { addText(line[0], line[1], false); });
      toBottom();
      startAmbient();
    } else if (seen > 0) {
      renderIntroAll();
      renderPosts(0, seen);
      addSystem("欢迎回来，你走之后群里又推了新的 ——");
      toBottom();
      runPlan(seen);
    } else {
      playIntro(function () {
        runPlan(0);
      });
    }
  })();
})();
