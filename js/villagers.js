// 奶家村 · 大冒险 —— 原住民
// 每个村民都站在地图上，会走、会停下、会回头看你，按 E 能说话。
// 说话不是纯文本：左边一张 2D 立绘，右边一张你自己的，两人对着聊。
//
// act 决定「聊完之后能干什么」，实现在 game2d.js 的 runAct()：
//   shop   打开小七的摊子
//   seeds  送种子（一次性）
//   balls  送捕捉球（一次性）
//   soak   一起泡水：回体力、推进时间（每天一次）
//   fight  陪牛来打一场
//   heal   奶察给你包扎（伤着才给）
//   bounty 奶察局的悬赏
//   board  看公告板
//   hint   只给提示

export const NPCS = [
  {
    id: "xiaoqi",
    name: "小七",
    char: "xiaoqi",
    home: { x: 17.4, z: 21.4 },
    pace: 0,
    face: -1.9,
    tag: "杂货摊老板",
    greet: [
      "哟，是你。种子够不够？不够就进摊子里挑。",
      "昨天刚到了一批甜瓜种，贵是贵，卖得上价。"
    ],
    act: "shop",
    actLabel: "进摊子看看货"
  },
  {
    id: "naidan",
    name: "奶蛋",
    char: "naidan",
    home: { x: -23.4, z: 21.4 },
    pace: 1.8,
    face: 3.0,
    tag: "住在田边",
    greet: [
      "你总算来了。这块地荒了好久，草都比我高了。",
      "锄头对着面前那一格按 E，翻开一格是一格。翻完土就好看多了。"
    ],
    act: "seeds",
    actLabel: "要点种子"
  },
  {
    id: "naiwa",
    name: "奶蛙",
    char: "naiwa",
    home: { x: -5.2, z: 5.4 },
    pace: 3.4,
    face: 1.2,
    tag: "村里的小孩",
    greet: [
      "齁齁齁！你也是来抓东西的吗？",
      "草一深就有野的跳出来。打它，打到它站不稳，再扔球 —— 球我有多的，给你一个。"
    ],
    act: "balls",
    actLabel: "收下它的球"
  },
  {
    id: "capybara",
    name: "卡皮巴拉",
    char: "capybara",
    home: { x: -30.2, z: 2.2 },
    pace: 0,
    face: 1.4,
    tag: "泡在水边",
    greet: [
      "……（它半眯着眼，慢慢把头转过来）",
      "水是温的。坐下来吧，什么都不用干。"
    ],
    act: "soak",
    actLabel: "陪它泡一会儿"
  },
  {
    id: "niulai",
    name: "牛来",
    char: "niulai",
    home: { x: 7.4, z: -14.6 },
    pace: 2.4,
    face: 0.4,
    tag: "想找人练两手",
    greet: [
      "妈妈，牛来！…… 呃，是你。",
      "我在这片林子练了三天，没人陪我打。来一场？"
    ],
    act: "fight",
    actLabel: "陪它打一场"
  },
  {
    id: "patrol",
    name: "奶察",
    char: "naiwa",
    cop: true,
    home: { x: 1.6, z: -12 },
    patrol: [
      { x: 1.6, z: -13 }, { x: 1.6, z: 13 },
      { x: -1.6, z: 13 }, { x: -1.6, z: -13 }
    ],
    speed: 1.6,
    tag: "巡逻中",
    greet: [
      "嘎嘎滴辣虾！—— 别紧张，我打招呼就这样。",
      "我在村里转一圈，看看有没有人卡在树里。你这身板看着还行。"
    ],
    act: "heal",
    actLabel: "让他看看伤"
  },
  {
    // 公园里下棋的老头。3D 身子是 game2d.js 里的 makeOldMan() 现拼的，
    // 没有现成模型 —— 一个农村大爷，白头发白胡子，深蓝布褂子。
    id: "qiyet",
    name: "棋爷",
    char: "qiyet",
    rig: "oldman",
    home: { x: 14.5, z: 6.44 },
    seat: { x: 14.5, z: 6.44 },
    pace: 0,
    face: 0,
    tag: "公园石桌上摆着棋",
    greet: [
      "（老头子捏着一颗白子，在石桌上敲了敲，没抬头。）",
      "……嗯。"
    ],
    act: "gomoku",
    actLabel: "坐下陪他下一盘"
  }
];

// 奶察局里值班的那个，站在台子后面不动
export const DESK_OFFICER = {
  id: "deskofficer",
  name: "奶察",
  char: "naiwa",
  cop: true,
  tag: "值班",
  greet: [
    "进来坐。今天局里没什么案子，就等你来领个活儿。",
    "村里的事都记在公告板上：谁家的鸡跑了、哪片草太深。挑一件做，回来找我结。"
  ]
};

/* ---------------------------------------------------------
   悬赏：每天一件，做完了回局里领
   --------------------------------------------------------- */
export const BOUNTIES = [
  {
    kind: "harvest", need: 3, reward: { gold: 60, seeds: { radish: 2 } },
    title: "收三样作物",
    desc: "地里的东西熟了按 E 采下来，凑够三样。"
  },
  {
    kind: "capture", need: 1, reward: { gold: 90, balls: 2 },
    title: "收服一只野的",
    desc: "走进深色的高草，把它打到三成血以下再扔球。"
  },
  {
    kind: "visit", need: 3, reward: { gold: 50, water: 1 },
    title: "跟三个村民说说话",
    desc: "广场、水塘边、树林边都有人，挨个聊过去。"
  }
];

export function bountyOf(day) {
  const b = BOUNTIES[(day - 1) % BOUNTIES.length];
  return { kind: b.kind, need: b.need, got: 0, reward: b.reward, title: b.title, desc: b.desc, done: false };
}
