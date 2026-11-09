// 奶家村 · 村口放映厅（相亲相爱一家人）数据
//
// 加视频：在 messages 里复制一条 type:"video" 的记录，改字段即可，页面不用动。
//   platform : "bilibili" | "douyin"
//   status   : "ok" 正常 | "pending" 链接待录入（卡片置灰） | "dead" 已失效（卡片置灰）
//   id       : B站视频的 BV 号
//   url      : 原视频完整链接
//   embed    : 仅B站需要。true/缺省 = 普通 UP 主投稿，本页内嵌官方播放器直接看；
//              false = 官方番剧等需要登录的内容，点击后弹出小窗在 B 站页面播放。
//              抖音一律走小窗 / 唤起 App（抖音不开放第三方网页嵌入）。
//
// 合规约定：本文件只存元数据（标题/作者/链接），绝不下载、转存任何视频文件。
// 视频版权归原作者及平台所有，收录即索引；作者要求移除时删除对应记录即可。

window.NAIJIA_GROUP = {
  name: "相亲相爱一家人",
  subtitle: "奶家村 · 村口放映厅",
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
  messages: [
    { type: "system", text: "欢迎加入「相亲相爱一家人」。群规只有一条：好笑的视频必须发群里。" },
    { type: "date", text: "今天 20:30" },

    { type: "text", sender: "nailong", text: "本龙把群建好了！都进来看看，本龙亲自镇楼。" },
    { type: "text", sender: "baobaolong", text: "切。建群也不提前请示本龙？行，进去等我，陷阱马上就好。" },
    { type: "text", sender: "nailong", text: "先发本龙的正片。官方番剧得在 B 站页面上播，本节点开自动开个小窗，不用切走——" },
    { type: "video", sender: "nailong", video: {
      platform: "bilibili", status: "ok", embed: false, id: "BV1ya4y1a74W",
      url: "https://www.bilibili.com/video/BV1ya4y1a74W/",
      title: "《奶龙》官方动画 · 第128集",
      author: "第七印象", stat: "B站番剧 · 全150话"
    } },
    { type: "text", sender: "xiaoqi", text: "从第 1 话开始补也可以，讲的是奶龙住进人家之后的事。" },
    { type: "video", sender: "xiaoqi", video: {
      platform: "bilibili", status: "ok", embed: false, id: "BV14v411p72v",
      url: "https://www.bilibili.com/video/BV14v411p72v/",
      title: "《奶龙》官方动画 · 第30集",
      author: "第七印象", stat: "全系列播放 20.6 亿"
    } },
    { type: "text", sender: "nailong", text: "下面这条是本龙抖音官号的作品。电脑上会弹个小窗，手机上直接唤起抖音。" },
    { type: "video", sender: "nailong", video: {
      platform: "douyin", status: "ok",
      url: "https://www.douyin.com/video/7333132668411923763",
      title: "新年到，奶龙上新才艺！给大家跳一段开运舞",
      author: "奶龙（官方抖音号）", stat: "抖音 · 官方账号"
    } },

    { type: "text", sender: "naiwa", text: "齁齁齁齁齁齁——" },
    { type: "text", sender: "naiwa", text: "有人把本蛙做成了游戏，还给本蛙塞了一院子钱草。这条 B 站点开就能播。" },
    { type: "video", sender: "naiwa", video: {
      platform: "bilibili", status: "ok", id: "BV1SNYq6gEQh",
      url: "https://www.bilibili.com/video/BV1SNYq6gEQh/",
      title: "《旅行青蛙》停运？我做了个「旅行奶蛙」，出门全是热梗",
      author: "UP主 扎克鸡", stat: "84.7万播放"
    } },

    { type: "text", sender: "niulai", text: "妈妈，牛来！" },
    { type: "video", sender: "niulai", video: {
      platform: "bilibili", status: "ok", id: "BV1wkbC6vEaJ",
      url: "https://www.bilibili.com/video/BV1wkbC6vEaJ/",
      title: "牛来？绊倒体？",
      author: "UP主 李智Lee1", stat: "26.2万播放"
    } },
    { type: "text", sender: "niulai", text: "傻孩子，那是绊倒体，狗都不碰。" },

    { type: "text", sender: "capybara", text: "……（泡在水里，头顶橘子，情绪稳定）" },
    { type: "text", sender: "capybara", text: "BGM 我已经放好了。" },
    { type: "video", sender: "capybara", video: {
      platform: "bilibili", status: "ok", id: "BV1NN411h7eQ",
      url: "https://www.bilibili.com/video/BV1NN411h7eQ/",
      title: "【中俄双字】卡皮巴拉 · 水豚之歌",
      author: "格瓦斯字幕组", stat: "38.4万播放"
    } },

    { type: "text", sender: "baobaolong", text: "哼，本龙和奶龙的日常被人剪成合集了。就……勉为其难发一下。" },
    { type: "video", sender: "baobaolong", video: {
      platform: "bilibili", status: "ok", id: "BV1KrgX6HExh",
      url: "https://www.bilibili.com/video/BV1KrgX6HExh/",
      title: "奶龙和暴暴龙的搞笑日常 · 视频合集",
      author: "UP主 宝宝早教动画儿歌", stat: "26.1万播放"
    } },

    { type: "text", sender: "naicha", text: "嘎嘎滴辣虾。本察巡逻路过，顺便把群规念一遍：好笑的视频必须发群里。" },
    { type: "text", sender: "feidudu", text: "你的胆子真是肥嘟嘟——居然敢在本群潜水。" },

    { type: "system", text: "小提示：点卡片就能看 —— B 站投稿在本页内直接播放；B 站番剧和抖音视频会弹出小窗，人还留在群里。" }
  ],

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
    ["naiwa", "本蛙游戏里的钱草又种满了，谁来收一下。"]
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
