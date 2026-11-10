// 奶家村 · 村口放映厅（相亲相爱一家人）数据
//
// 加视频：在 videos 里复制一条记录，改字段即可，页面不用动。
//   sender   : 谁发的（members 里的 key）——谁的视频谁发
//   platform : "bilibili" | "douyin"
//   status   : "ok" 正常 | "pending" 链接待录入（卡片置灰） | "dead" 已失效（卡片置灰）
//   id       : B站视频的 BV 号（embed 为 false 时也需要，用于小窗兜底）
//   url      : 原视频完整链接
//   embed    : 仅B站需要。true/缺省 = 普通 UP 主投稿，本页内嵌官方播放器直接看；
//              false = 官方番剧等需要登录的内容，点击后弹出小窗在 B 站页面播放。
//              抖音一律走小窗 / 唤起 App（抖音不开放第三方网页嵌入）。
//   heat     : 热度数值（播放量，纯数字）。用于排序，仅作参考快照。
//   kind     : "ugc" 二创 / 搬运 / 二次剪辑 | "official" 官方正片、官方账号
//              | "video" 普通投稿（识别不出二创特征，也不属于官方，排序上不加分）
//   lead     : 发卡前的铺垫台词（按顺序逐条发出，先说再发）
//
// 推送规则（页面顶部「已推送 x/y」会实时显示进度）：
//   ① 免跳转优先 —— 能在本页内直接播的排前面
//   ② 热度高优先 —— heat 越大越靠前
//   ③ 二创优先   —— 真人二创 / 二剪排在官方正片前
//   三者合成推荐分（见 rank()）；视频之间至少间隔 push.minGapMs（默认 30 秒），
//   间隔里由群成员闲聊填满，不会冷场。
//
// 合规约定：本文件只存元数据（标题/作者/链接），绝不下载、转存任何视频文件。
// 视频版权归原作者及平台所有，收录即索引；作者要求移除时删除对应记录即可。

window.NAIJIA_GROUP = {
  name: "相亲相爱一家人",
  subtitle: "奶家村 · 村口放映厅",

  // 推送节奏与排序权重（想调节奏改这里）
  push: {
    minGapMs: 30000,      // 两条视频之间至少 30 秒
    fillerMinMs: 8000,    // 间隔里的闲聊间隔（30 秒窗口够塞 1~2 句）
    fillerMaxMs: 14000,
    weights: {
      inline: 1000,       // 能在本页直接播
      window: 400,        // 要在小窗里播
      external: 200,      // 只能跳回原平台
      heat: 100,          // 播放量（对数）
      ugc: 60,            // 二创
      recency: 180,       // 新近度：越新越高
      abstract: 140,      // 抽象 / 整活 / 鬼畜
      duration: 90        // 时长：短视频优先
    }
  },

  members: {
    nailong: {
      name: "奶龙",
      title: "群主 · 黄色大肚子的呆萌小恐龙",
      avatar: "assets/characters/3d/nailong-avatar.webp",
      pet: "assets/characters/3d/nailong-pet.webp"
    },
    naiwa: {
      name: "奶蛙",
      title: "笑到停不下来的黄色抽象蛙",
      avatar: "assets/characters/3d/naiwa-avatar.webp",
      pet: "assets/characters/3d/naiwa-pet.webp"
    },
    baobaolong: {
      name: "暴暴龙",
      title: "奶龙的对手，脾气不太好",
      avatar: "assets/characters/3d/baobaolong-avatar.webp",
      pet: "assets/characters/3d/baobaolong-pet.webp"
    },
    xiaoqi: {
      name: "小七",
      title: "带着神奇发明的搭档",
      avatar: "assets/characters/3d/xiaoqi-avatar.webp",
      pet: "assets/characters/3d/xiaoqi-pet.webp"
    },
    niulai: {
      name: "牛来",
      title: "黄色抽象宇宙的另一位成员",
      avatar: "assets/characters/3d/niulai-avatar.webp",
      pet: "assets/characters/3d/niulai-pet.webp"
    },
    capybara: {
      name: "卡皮巴拉",
      title: "情绪稳定到没有天敌",
      avatar: "assets/characters/3d/capybara-avatar.webp",
      pet: "assets/characters/3d/capybara-pet.webp"
    },
    naicha: {
      name: "奶察",
      title: "戴着警帽的黄色抽象搭子",
      avatar: "assets/characters/3d/naicha-avatar.webp",
      pet: "assets/characters/3d/naicha-pet.webp"
    },
    feidudu: {
      name: "肥嘟嘟袋鼠",
      title: "你的胆子真是肥嘟嘟",
      avatar: "assets/characters/3d/feidudu-avatar.webp",
      pet: "assets/characters/3d/feidudu-pet.webp"
    }
  },

  // 开场：建群、寒暄、宣布推送规则（不含视频）
  intro: [
    { type: "system", text: "欢迎加入「相亲相爱一家人」。群规只有一条：好笑的视频必须发群里。" },
    { type: "date", text: "今天 20:30" },
    { type: "text", sender: "nailong", text: "本龙把群建好了！都进来看看，本龙亲自镇楼。" },
    { type: "text", sender: "baobaolong", text: "切。建群也不提前请示本龙？行，进去等我，陷阱马上就好。" },
    { type: "system", text: "群固定了排序：能在这儿直接看的排前面，然后优先新鲜的、抽象的、热度高的。一条一条来，至少隔半分钟。" },
    { type: "text", sender: "naicha", text: "嘎嘎滴辣虾。本察巡逻路过，顺便把群规念一遍：好笑的视频必须发群里。" }
  ],

  videos: [
    {
      sender: "naiwa", platform: "bilibili", status: "ok", embed: true,
      id: "BV1SNYq6gEQh",
      url: "https://www.bilibili.com/video/BV1SNYq6gEQh/",
      title: "《旅行青蛙》停运？我做了个「旅行奶蛙」，出门全是热梗",
      author: "UP主 扎克鸡", stat: "84.7 万播放",
      heat: 847000, kind: "ugc",
      lead: [
        "齁齁齁齁齁——本蛙先上。",
        "有人把本蛙做成了游戏，还给本蛙塞了一院子钱草。这条点开就能在群里直接播。"
      ]
    },
    {
      sender: "capybara", platform: "bilibili", status: "ok", embed: true,
      id: "BV1NN411h7eQ",
      url: "https://www.bilibili.com/video/BV1NN411h7eQ/",
      title: "【中俄双字】卡皮巴拉 · 水豚之歌",
      author: "格瓦斯字幕组", stat: "38.4 万播放",
      heat: 384000, kind: "ugc",
      lead: [
        "……（泡在水里，头顶橘子，情绪稳定）",
        "BGM 我已经放好了。"
      ]
    },
    {
      sender: "niulai", platform: "bilibili", status: "ok", embed: true,
      id: "BV1wkbC6vEaJ",
      url: "https://www.bilibili.com/video/BV1wkbC6vEaJ/",
      title: "牛来？绊倒体？",
      author: "UP主 李智Lee1", stat: "26.2 万播放",
      heat: 262000, kind: "ugc",
      lead: [
        "妈妈，牛来！",
        "这条是本牛的。傻孩子，那是绊倒体，狗都不碰。"
      ]
    },
    {
      sender: "baobaolong", platform: "bilibili", status: "ok", embed: true,
      id: "BV1KrgX6HExh",
      url: "https://www.bilibili.com/video/BV1KrgX6HExh/",
      title: "奶龙和暴暴龙的搞笑日常 · 视频合集",
      author: "UP主 宝宝早教动画儿歌", stat: "26.1 万播放",
      heat: 261000, kind: "ugc",
      lead: [
        "哼，本龙和奶龙的日常被人剪成合集了。",
        "就……勉为其难发一下。"
      ]
    },
    {
      sender: "nailong", platform: "bilibili", status: "ok", embed: false,
      id: "BV1ya4y1a74W",
      url: "https://www.bilibili.com/video/BV1ya4y1a74W/",
      title: "《奶龙》官方动画 · 第128集",
      author: "第七印象", stat: "B站番剧 · 全150话",
      heat: 2060000000, kind: "official",
      lead: [
        "正片放到后头。官方番剧得在 B 站页面上播，本节点开自动开个小窗，不用切走——"
      ]
    },
    {
      sender: "xiaoqi", platform: "bilibili", status: "ok", embed: false,
      id: "BV14v411p72v",
      url: "https://www.bilibili.com/video/BV14v411p72v/",
      title: "《奶龙》官方动画 · 第30集",
      author: "第七印象", stat: "全系列播放 20.6 亿",
      heat: 2060000000, kind: "official",
      lead: [
        "从第 1 话开始补也可以，讲的是奶龙住进人家之后的事。"
      ]
    },
    {
      sender: "nailong", platform: "douyin", status: "ok",
      url: "https://www.douyin.com/video/7333132668411923763",
      title: "新年到，奶龙上新才艺！给大家跳一段开运舞",
      author: "奶龙（官方抖音号）", stat: "抖音 · 官方账号",
      heat: 3200000, kind: "official",
      lead: [
        "最后是本龙抖音官号的作品。电脑上会弹个小窗，手机上直接唤起抖音。"
      ]
    }
  ],

  // 表情包：直接引用现成的开源表情图（Twemoji，CC-BY 4.0），不自己画、不存本地。
  //   emoji : 表情的 Unicode 码位（多个码位用 - 连接，如 1f468-200d-1f4bb）
  //   sender: 谁发的（决定头像）
  //   label : 文字标签，只在 CDN 全部加载失败时兜底显示
  // 想换成自定义表情包：把图片放进 assets/stickers/，把 src 改成图片路径即可
  // （rank/排序不受影响，表情只用于聊天）。
  stickerCdn: [
    "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/",
    "https://fastly.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/"
  ],
  stickers: [
    { id: "dino", sender: "nailong", emoji: "1f996", label: "🦖" },
    { id: "cool", sender: "nailong", emoji: "1f60e", label: "😎" },
    { id: "lol", sender: "nailong", emoji: "1f602", label: "😂" },
    { id: "frog", sender: "naiwa", emoji: "1f438", label: "🐸" },
    { id: "rofl", sender: "naiwa", emoji: "1f923", label: "🤣" },
    { id: "ox", sender: "niulai", emoji: "1f402", label: "🐂" },
    { id: "cry", sender: "niulai", emoji: "1f62d", label: "😭" },
    { id: "orange", sender: "capybara", emoji: "1f34a", label: "🍊" },
    { id: "zen", sender: "capybara", emoji: "1f9d8", label: "🧘" },
    { id: "angry", sender: "baobaolong", emoji: "1f620", label: "😠" },
    { id: "dragon", sender: "baobaolong", emoji: "1f409", label: "🐉" },
    { id: "cop", sender: "naicha", emoji: "1f693", label: "🚓" },
    { id: "kangaroo", sender: "feidudu", emoji: "1f998", label: "🦘" },
    { id: "tool", sender: "xiaoqi", emoji: "1f527", label: "🔧" },
    { id: "fire", sender: "naiwa", emoji: "1f525", label: "🔥" }
  ],

  // 你说话时，各角色的优先回话（按关键词挑人：见 group.js 的 respondersFor）
  replies: {
    nailong: ["说到本龙？本龙就在这儿。", "本龙的视频看了没？没看快看。", "群规只有一条，你复述一遍。"],
    naiwa: ["齁齁齁齁——你说啥？", "本蛙的梗你接不住吧。", "表情包存了没？没存赶紧存。"],
    baobaolong: ["哼，有话快说。", "本龙的计谋，你学不来。"],
    xiaoqi: ["链接我盯着呢，失效了跟我说。", "要换哪条？我五分钟搞定。"],
    niulai: ["妈妈，牛来！", "本牛在听，你继续说。"],
    capybara: ["……（抬头看了你一眼，情绪稳定）", "（慢慢点了个头）"],
    naicha: ["嘎嘎滴辣虾，本察收到。", "巡逻中，有事说事。"],
    feidudu: ["你的胆子真是肥嘟嘟。", "说吧，本袋鼠听着。"]
  },

  // 回放结束后，群成员自己闲聊的台词池（随机抽取，抽完重置）
  ambient: [
    ["nailong", "本龙再强调一遍，群规只有一条。"],
    ["capybara", "……（吐了个泡泡，情绪稳定）"],
    ["niulai", "妈妈说该睡觉了。牛来？"],
    ["naiwa", "齁齁齁齁——谁又在存本蛙的表情包？"],
    ["baobaolong", "刚那个陷阱视频看了吗？本龙的计谋天下第一。"],
    ["xiaoqi", "楼上哪条链接失效了跟我说，我来换新的。"],
    ["naicha", "嘎嘎滴辣虾，本察在线巡逻。"],
    ["feidudu", "你的胆子真是肥嘟嘟，还不点赞？"],
    ["nailong", "点赞了吗？收藏了吗？没有的话现在去。"],
    ["capybara", "（默默把头顶的橘子换成了小番茄）"],
    ["niulai", "绊倒体那条我又看了一遍，笑死牛来了。"],
    ["naiwa", "本蛙游戏里的钱草又种满了，谁来收一下。"],
    ["xiaoqi", "排队呢，下一条还得等一分多钟，别催。"],
    ["baobaolong", "哼，好东西当然要慢慢放。"]
  ],

  // 回访时的随机欢迎语
  welcomeBack: [
    "欢迎回到「相亲相爱一家人」，你不在的时候大家也没闲着。",
    "欢迎回来！刚走的这几分钟，群里又水了几句。",
    "你回来了。卡皮巴拉表示情绪依然稳定。",
    "欢迎回来，本龙还以为你退群了。",
    "群主回来了，都精神点。"
  ]
};

/* ------------------------------------------------------------------
 * 推荐分：免跳转 > 新 > 抽象 > 热度 > 短 > 二创
 * 老视频会随着时间自然下沉，不用手工删。
 * ------------------------------------------------------------------ */
window.NAIJIA_GROUP.rank = function (list) {
  var W = (window.NAIJIA_GROUP.push || {}).weights || {};
  var wInline = W.inline || 1000;
  var wWindow = W.window || 400;
  var wExternal = W.external || 200;
  var wHeat = W.heat || 100;
  var wUgc = W.ugc || 60;
  var wRecency = W.recency == null ? 180 : W.recency;
  var wAbs = W.abstract == null ? 140 : W.abstract;
  var wDur = W.duration == null ? 90 : W.duration;
  var HEAT_REF = Math.log10(2000000); // 200 万播放 ≈ 热度满分
  var NOW = Date.now() / 1000;

  /* 抽象 / 整活 / 鬼畜：标题或作者里带这些词就算 */
  var ODD_RE = /抽象|整活|沙雕|鬼畜|梗|笑死|离谱|绷不住|绝活|发疯|逆天|魔性|搞笑/;

  function playMode(v) {
    if (v.status && v.status !== "ok") return "off";
    if (v.platform === "bilibili" && v.embed !== false) return "inline";
    if (v.platform === "bilibili") return "window";
    return "external";
  }

  /* 新近度：3 天内满分，一年以上只剩两成 */
  function recencyScore(v) {
    var t = Number(v.pubdate) || 0;
    if (!t) return Math.round(wRecency * 0.5); // 不知道发布时间的给中间值
    var days = (NOW - t) / 86400;
    var r;
    if (days <= 3) r = 1;
    else if (days <= 30) r = 0.85;
    else if (days <= 180) r = 0.6;
    else if (days <= 365) r = 0.35;
    else r = 0.2;
    return Math.round(wRecency * r);
  }

  /* 时长：一分钟内满分，超过 15 分钟基本不给分 */
  function durationScore(v) {
    var d = Number(v.durationSec) || 0;
    if (!d) return Math.round(wDur * 0.6);
    var r;
    if (d <= 60) r = 1;
    else if (d <= 180) r = 0.85;
    else if (d <= 420) r = 0.6;
    else if (d <= 900) r = 0.3;
    else r = 0.1;
    return Math.round(wDur * r);
  }

  function abstractScore(v) {
    return ODD_RE.test((v.title || "") + " " + (v.author || "")) ? wAbs : 0;
  }

  var scored = (list || []).map(function (v, i) {
    var mode = playMode(v);
    var base = mode === "inline" ? wInline : mode === "window" ? wWindow : mode === "external" ? wExternal : 0;
    var heatVal = Math.max(0, Number(v.heat) || 0);
    var heatScore = heatVal > 0 ? Math.min(wHeat, Math.round(wHeat * Math.log10(heatVal) / HEAT_REF)) : 0;
    var ugcScore = v.kind === "ugc" ? wUgc : 0;
    var recScore = recencyScore(v);
    var absScore = abstractScore(v);
    var durScore = durationScore(v);

    var tags = [];
    if (mode === "inline") tags.push("免跳转");
    else if (mode === "window") tags.push("小窗");
    else if (mode === "external") tags.push("跳转");
    if (recScore >= Math.round(wRecency * 0.85)) tags.push("新");
    if (absScore > 0) tags.push("抽象");
    if (heatScore >= Math.round(wHeat * 0.7)) tags.push("高热度");
    if (v.kind === "ugc") tags.push("二创");

    return {
      video: v, mode: mode, order: i,
      score: base + heatScore + ugcScore + recScore + absScore + durScore,
      tags: tags,
      detail: { inline: base, heat: heatScore, ugc: ugcScore, recency: recScore, abstract: absScore, duration: durScore }
    };
  });

  scored.sort(function (a, b) { return b.score - a.score || a.order - b.order; });
  return scored;
};

/* ------------------------------------------------------------------
 * 排片时间轴：保证任意两条视频间隔 >= minGapMs，间隔里插入闲聊
 * 返回 [{ video, leadAt, at, fillers:[ms...] }]，时间均为相对开播的毫秒数
 * ------------------------------------------------------------------ */
window.NAIJIA_GROUP.planTimeline = function (list, opt) {
  opt = opt || {};
  var P = window.NAIJIA_GROUP.push || {};
  var gap = opt.minGapMs != null ? opt.minGapMs : (P.minGapMs || 30000);
  var jitter = opt.jitterMs != null ? opt.jitterMs : 6000;  // 在最小间隔上随机加 0~6 秒
  var rnd = opt.rnd || Math.random;
  var cursor = opt.startMs != null ? opt.startMs : 1200;
  var lastVideo = null;

  return (list || []).map(function (v, i) {
    var leads = (v.lead && v.lead.length) || 0;
    // 台词是一句一句打出来的，每句预留够打字的时间，卡片不会抢在台词前面
    var leadSpan = leads * 5200 + 900;
    var at = lastVideo == null
      ? cursor + leadSpan
      : Math.max(cursor + leadSpan, lastVideo + gap + rnd() * jitter);
    at = Math.round(at);
    var leadAt = at - leadSpan;

    var fillers = [];
    if (lastVideo != null) {
      var fMin = P.fillerMinMs || 14000;
      var fMax = P.fillerMaxMs || 22000;
      var t = lastVideo + fMin;
      var limit = leadAt - 2000;
      while (t < limit) {
        fillers.push(Math.round(t));
        t += fMin + rnd() * Math.max(1000, fMax - fMin);
      }
    }

    lastVideo = at;
    cursor = at;
    return { video: v, index: i, leadAt: Math.round(leadAt), at: at, fillers: fillers };
  });
};
