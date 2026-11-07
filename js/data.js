// 奶家村 · 网络热门「虚拟形象」图鉴数据
//
// 声明：本站是非官方、非商业的文字介绍型同人整理，不使用任何官方图片、立绘、视频、音频素材。
// 角色名称与形象的著作权归各自权利人所有；如权利人认为不妥，可联系删除。
//
// 字段说明：
//   id       唯一标识（同时用作投票、语音的 key）
//   name     名称
//   image    形象图路径，例如 "assets/characters/nailong.png"。留空则用内置 SVG 形象。
//            图片放哪个目录、用哪张，由你自己决定；本站不内置任何官方素材。
//   emoji    最后的兜底，仅在既没有 image 也没有内置形象时使用
//   category 分类
//   title    一句话称号
//   heat     基础热度
//   quote    热梗 / 名场面（不做成"角色台词"，避免误认官方设定）
//   desc     中性介绍
//   tags     标签
//   origin   来源与权利归属（详情页展示，用于声明出处）

const PEOPLE = [
  {
    id: "nailong",
    name: "奶龙",
    emoji: "🐲",
    image: "",
    category: "官方IP",
    title: "黄色大肚子的呆萌小恐龙",
    heat: 9860,
    quote: "duang~duang~ 的大肚子，和一双童真的圆眼睛。",
    desc: "2019 年由动画人谢承恩创作、2020 年 1 月 22 日在短视频平台正式上线的原创 3D 动画形象，官方设定是身高 180cm、体重 2 吨的呆萌吃货，爱吃饭睡觉和跳舞。凭借短视频迅速走红，之后推出了《奶龙搞怪大作战》《奶龙之奇妙冒险》等番剧，也常出现在表情包与联名商品中。",
    tags: ["恐龙", "呆萌", "国漫IP", "治愈"],
    origin: "著作权归第七印象文化传媒（深圳）有限公司所有"
  },
  {
    id: "naiwa",
    name: "奶蛙",
    emoji: "🐸",
    image: "",
    category: "抽象迷因",
    title: "笑到停不下来的黄色抽象蛙",
    heat: 9720,
    quote: "点一下就狂笑，笑起来停不下来。",
    desc: "2024 年秋天，有网友用 AI 生成奶龙图片时出现畸变，得到了一只梨形黄身、绿色大圆眼、四肢细长的形象。因为形似青蛙，被网友叫作「奶蛙」。它没有官方剧情与设定，配上一段魔性笑声后在短视频平台迅速扩散，成为表情包与二创素材。2026 年 3 月起，奶龙官方曾公开呼吁停止丑化二创。",
    tags: ["AI二创", "表情包", "抽象", "大笑"],
    origin: "源于奶龙的网友 AI 二创，无官方设定与官方运营方"
  },
  {
    id: "baobaolong",
    name: "暴暴龙",
    emoji: "🦖",
    image: "",
    category: "官方IP",
    title: "奶龙的对手，脾气不太好",
    heat: 8320,
    quote: "一山不容二龙，除非一起吃饭。",
    desc: "奶龙系列中的另一位恐龙角色，在 2024 年播出的番剧《奶龙与小七之大战暴暴龙》里作为奶龙的主要对手登场，脾气火爆、行事直接，与奶龙的呆萌形成反差，是系列里讨论度较高的配角之一。",
    tags: ["恐龙", "对手", "番剧角色"],
    origin: "著作权归第七印象文化传媒（深圳）有限公司所有"
  },
  {
    id: "xiaoqi",
    name: "小七",
    emoji: "🧒",
    image: "",
    category: "官方IP",
    title: "带着神奇发明的搭档",
    heat: 6180,
    quote: "冒险的起点，总是从一件奇怪的发明开始。",
    desc: "奶龙的伙伴，两人一起带着各种神奇发明去解决问题、认识新朋友。在《奶龙之奇妙冒险》等剧集中是推动剧情的关键角色，负责把奶龙拉进一个又一个奇妙场景。",
    tags: ["搭档", "发明", "番剧角色"],
    origin: "著作权归第七印象文化传媒（深圳）有限公司所有"
  },
  {
    id: "niulai",
    name: "牛来",
    emoji: "🐮",
    image: "",
    category: "抽象迷因",
    title: "黄色抽象宇宙的另一位成员",
    heat: 5340,
    quote: "同一批 AI 畸变图里，长出来的另一个物种。",
    desc: "与奶蛙同属网友戏称的「黄色抽象宇宙」，同样是 AI 生成失败后被网友二次创作放大的形象，和奶蛙、肥嘟嘟袋鼠一起构成了这一轮黄色抽象迷因的谱系。没有官方设定，热度完全靠网友玩梗维持。",
    tags: ["AI二创", "迷因", "抽象"],
    origin: "网友二创衍生的网络迷因，无官方运营方"
  },
  {
    id: "capybara",
    name: "卡皮巴拉",
    emoji: "🦫",
    image: "",
    category: "动物顶流",
    title: "情绪稳定到没有天敌",
    heat: 9150,
    quote: "别人在卷，它在泡澡。",
    desc: "水豚的中文昵称，原本是南美洲的啮齿动物，因为表情淡定、和谁都能共处、喜欢集体泡温泉的画面被大量传播，成为「松弛感」的代名词。它不属于任何卡通 IP，是真实动物变成的网络顶流。",
    tags: ["水豚", "松弛感", "真实动物", "治愈"],
    origin: "真实动物，无卡通 IP 归属"
  }
];

// 每个角色的音色绑定
//
//   voiceId  绑定到该角色的 Breeze 音色 ID。留空 = 用默认音色（或浏览器语音）。
//            `scripts/design-voices.mjs` 和 `scripts/clone-voices.mjs` 会自动把拿到的
//            voice_id 写回这里，不用手抄。
//   style    音色描述（中文即可），直接作为「声音设计」的提示词。
//   gender / age / tone / accent  音色的结构化标签，保存音色时一并写入，方便在控制台筛选。
//
// 说明：这里描述的是"听感"（音高、语速、气质），不指向任何具体的人。
// 若要克隆真实配音演员的声音，需先取得本人书面授权。
const CHARACTER_VOICES = {
  nailong: {
    voiceId: "",
    style: "软萌的小童声，圆润鼻音，语速偏慢，句尾带笑，像在撒娇",
    gender: "female", age: "child", tone: ["gentle", "playful"], accent: null
  },
  naiwa: {
    voiceId: "",
    style: "夸张的尖细男声，情绪外放，笑声很多，语速快，带一点破音的滑稽感",
    gender: "male", age: "young", tone: ["playful", "energetic"], accent: null
  },
  baobaolong: {
    voiceId: "",
    style: "低沉粗哑的男声，火爆脾气，语速快，句尾下压，像在吼人",
    gender: "male", age: "young", tone: ["energetic", "authoritative"], accent: null
  },
  xiaoqi: {
    voiceId: "",
    style: "清亮的少年音，机灵跳脱，语速中等，偶尔上扬",
    gender: "male", age: "young", tone: ["bright", "friendly"], accent: null
  },
  niulai: {
    voiceId: "",
    style: "憨厚的中年男声，北方口音，语速慢，带笑意，像邻居大叔聊天",
    gender: "male", age: "middle_aged", tone: ["warm", "sincere"], accent: "mandarin_henan"
  },
  capybara: {
    voiceId: "",
    style: "慵懒的低音，语速极慢，气声多，听起来永远不着急",
    gender: "male", age: "middle_aged", tone: ["calm", "measured"], accent: null
  }
};

