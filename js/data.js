// 奶家村 · 示例人物数据
// 说明：介绍文字尽量保持中性、客观，仅供娱乐与图鉴用途。
// 你可以直接在本文件中增删人物；网站上通过"提名新人"添加的会存在浏览器本地。
// 字段：id 唯一标识 / name 名字 / emoji 头像 / category 类别 / title 一句话称号
//       heat 基础热度 / quote 名场面或金句 / desc 介绍 / tags 标签

const PEOPLE = [
  {
    id: "shougeng",
    name: "手工耿",
    emoji: "🔧",
    category: "手工",
    title: "无用发明家",
    heat: 9860,
    quote: "它解决的不是问题，是心情。",
    desc: "河北保定的焊工博主，因制作脑瓜崩辅助器、倒立洗头机等看起来没什么用但很快乐的作品走红，被网友称为无用爱迪生。",
    tags: ["发明", "焊接", "快乐"]
  },
  {
    id: "liziqi",
    name: "李子柒",
    emoji: "🌾",
    category: "生活",
    title: "田园生活记录者",
    heat: 9500,
    quote: "一箪食，一瓢饮，皆有滋味。",
    desc: "以慢节奏短视频记录田园生活与传统手艺，从酿酱油到做笔墨纸砚，在国内外平台都收获了海量关注。",
    tags: ["田园", "传统手艺", "美食"]
  },
  {
    id: "wanggang",
    name: "美食作家王刚",
    emoji: "🍳",
    category: "美食",
    title: "宽油警告发起人",
    heat: 8800,
    quote: "起锅烧油 —— 宽油来！",
    desc: "川菜厨师出身的硬核美食教学博主，专业详细的烹饪步骤和标志性的宽油让无数学徒又爱又怕。",
    tags: ["川菜", "硬核教学", "宽油"]
  },
  {
    id: "hetongxue",
    name: "何同学",
    emoji: "📱",
    category: "科技",
    title: "科技区宝藏UP主",
    heat: 8600,
    quote: "速度，是5G最无聊的应用。",
    desc: "数码与科技视频创作者，凭借5G体验、AirDesk等兼具创意与质感的作品频频出圈。",
    tags: ["数码", "测评", "创意"]
  },
  {
    id: "wangjingze",
    name: "王境泽",
    emoji: "🍚",
    category: "搞笑",
    title: "真香定律代言人",
    heat: 9200,
    quote: "我就是饿死……真香！",
    desc: "因纪录片中的言行反差，衍生出流传至今的真香定律，成为一切打脸名场面的通用注释。",
    tags: ["真香", "名场面", "定律"]
  },
  {
    id: "papijiang",
    name: "papi酱",
    emoji: "🎤",
    category: "搞笑",
    title: "集美貌与才华于一身的女子",
    heat: 8400,
    quote: "我是一个集美貌与才华于一身的女子。",
    desc: "短视频时代的早期代表创作者，以犀利吐槽和快速剪辑风格走红，后来在影视与综艺领域持续活跃。",
    tags: ["吐槽", "短视频", "早期顶流"]
  },
  {
    id: "huannong",
    name: "华农兄弟",
    emoji: "🐹",
    category: "生活",
    title: "漂亮警告发布者",
    heat: 8200,
    quote: "这只竹鼠中暑了，不能留。",
    desc: "江西农村养殖博主，养竹鼠的日常加上各种理直气壮的吃鼠理由，贡献了漂亮警告等一整代梗。",
    tags: ["竹鼠", "农村日常", "漂亮警告"]
  },
  {
    id: "dongyuhui",
    name: "董宇辉",
    emoji: "📚",
    category: "知识",
    title: "双语带货诗人",
    heat: 9000,
    quote: "我没有带你看过长白山皑皑的白雪。",
    desc: "从英语老师转型主播，以文学化的带货风格走红，卖的是大米牛排，讲的是人间与远方。",
    tags: ["直播", "文学", "知识带货"]
  },
  {
    id: "zhangtongxue",
    name: "张同学",
    emoji: "🎬",
    category: "生活",
    title: "东北农村流水账导演",
    heat: 7800,
    quote: "起床、烧炕、喂狗，一天开始了。",
    desc: "用高密度分镜拍摄东北农村单身汉的普通日常，凭真实感和运镜在短视频平台迅速涨粉。",
    tags: ["农村", "分镜", "日常"]
  },
  {
    id: "mianyang",
    name: "绵羊料理",
    emoji: "🍜",
    category: "美食",
    title: "翻车料理界的清流",
    heat: 7600,
    quote: "今天挑战一道米其林级别的菜。",
    desc: "以高难度菜谱挑战和自嘲式翻车闻名的美食博主，把做饭做成了连续剧。",
    tags: ["美食", "翻车", "挑战"]
  },
  {
    id: "giao",
    name: "giao哥",
    emoji: "🌊",
    category: "搞笑",
    title: "一给我里giaogiao",
    heat: 7400,
    quote: "一给我里giaogiao！",
    desc: "出身农村的草根主播，标志性的giaogiao喊麦一度席卷各大平台，是土味文化绕不开的名字。",
    tags: ["土味", "喊麦", "名场面"]
  },
  {
    id: "yujian",
    name: "渝乡辣妹子",
    emoji: "🌶️",
    category: "美食",
    title: "川渝灶台上的烟火气",
    heat: 7000,
    quote: "灶火一开，香飘十里。",
    desc: "记录川渝乡村厨房与家常菜的美食博主，柴火灶和泼辣利落的风格深受欢迎。",
    tags: ["川渝", "柴火灶", "家常菜"]
  }
];
