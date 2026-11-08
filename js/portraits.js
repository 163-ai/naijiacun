// 奶家村 · 大冒险 —— 2D 立绘
// 对话时左右各一张：左边是说话的人，右边是你（奶龙）。
// 全部用 canvas 现画，跟着站内暖米色 + 墨绿的调子，不额外加载图片。
// 每个角色一套配色 + 耳朵/帽子/眼镜之类的特征，表情分 normal / happy / angry / worry。

const CACHE = new Map();

const SPEC = {
  nailong: {
    name: "奶龙", body: "#f7c948", body2: "#e0a52c", belly: "#fff4d8",
    ear: "nub", eye: "#2c3d2a", blush: 1, fang: 1
  },
  naiwa: {
    name: "奶蛙", body: "#93c95a", body2: "#6ea23c", belly: "#e9f4cf",
    ear: "frog", eye: "#3a2d18", blush: .8, wide: 1
  },
  niulai: {
    name: "牛来", body: "#f0cf5e", body2: "#cfa534", belly: "#fdf1c8",
    ear: "horn", eye: "#3a2f1c", muzzle: 1, nose: 1
  },
  capybara: {
    name: "卡皮巴拉", body: "#b0824a", body2: "#8a6234", belly: "#d9bb92",
    ear: "round", eye: "#2e2418", sleepy: 1, square: 1
  },
  baobaolong: {
    name: "暴暴龙", body: "#9ed8f2", body2: "#6fb7d8", belly: "#e6f7ff",
    ear: "nub", eye: "#243444", angry: 1, shell: 1
  },
  xiaoqi: {
    name: "小七", body: "#f3cda6", body2: "#d9a97c", belly: "#fff0e0",
    hair: "#2c2a30", eye: "#2b2320", human: 1, ahoge: 1
  },
  naicha: {
    name: "奶察", body: "#f5c542", body2: "#d99f24", belly: "#fff2cd",
    ear: "frog", eye: "#2f2a1a", cap: "#2f4a6b", badge: 1
  },
  naidan: {
    name: "奶蛋", body: "#f9e08c", body2: "#dfc062", belly: "#fffaea",
    ear: "none", eye: "#3f7a4a", egg: 1
  },
  feidudu: {
    name: "肥嘟嘟", body: "#f4cd4d", body2: "#d6a827", belly: "#fff3c9",
    ear: "long", eye: "#33291a", nose: 1
  },
  xiaocao: {
    name: "小草", body: "#f6d3b4", body2: "#d9ab86", belly: "#fff3e6",
    hair: "#4a3527", eye: "#2c231c", human: 1, glasses: 1, scarf: 1
  },
  qiyet: {
    // 公园里下棋的老头：白头白胡子、旧圆眼镜、深蓝布褂子。
    // body 必须是肤色 —— 头脸用的是 body，填成褂子色会变成一张"蓝脸"
    name: "棋爷", body: "#e9c8a4", body2: "#d2ab83", belly: "#f7e6cc",
    robe: "#5d6b7d", hair: "#ecebe4", eye: "#2b2a26", human: 1, glasses: 1,
    beard: "#f3f1ea", old: 1
  }
};

const MOODS = {
  normal: {}, happy: {}, angry: {}, worry: {}
};

function rr(g, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}

function shade(g, color, x, y, rx, ry) {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, 7);
  g.fill();
}

/* ---------------------------------------------------------
   画一张立绘：240 × 240，底部对齐，透明背景
   --------------------------------------------------------- */
function draw(key, mood) {
  const S = SPEC[key] || SPEC.nailong;
  const W = 240, H = 240;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.lineJoin = "round";

  const cx = 120, cy = 116;
  const HEAD_RX = S.square ? 74 : 76;
  const HEAD_RY = S.egg ? 84 : (S.square ? 66 : 70);

  // 落影
  g.fillStyle = "rgba(60,48,32,.12)";
  g.beginPath(); g.ellipse(cx, 226, 82, 12, 0, 0, 7); g.fill();

  // 肩膀/身体
  g.fillStyle = S.body2;
  rr(g, cx - 74, 178, 148, 58, 26); g.fill();
  g.fillStyle = S.body;
  rr(g, cx - 70, 174, 140, 58, 24); g.fill();
  // 肚皮
  g.fillStyle = S.belly;
  g.beginPath(); g.ellipse(cx, 214, 44, 26, 0, 0, 7); g.fill();

  // 布褂子：把肩膀盖住，领口露一点脖子
  if (S.robe) {
    g.fillStyle = S.robe;
    rr(g, cx - 72, 168, 144, 66, 24); g.fill();
    g.fillStyle = S.body;
    g.beginPath(); g.ellipse(cx, 172, 23, 12, 0, 0, 7); g.fill();
    g.strokeStyle = "rgba(255,255,255,.16)"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx + 8, 182); g.lineTo(cx - 4, 226); g.stroke();
    g.beginPath(); g.arc(cx + 2, 196, 3.2, 0, 7); g.stroke();
    g.beginPath(); g.arc(cx - 1, 210, 3.2, 0, 7); g.stroke();
  }

  // 耳朵 / 角 / 头发（先画在头后面）
  if (S.ear === "long") {
    [-1, 1].forEach(s => {
      g.fillStyle = S.body2;
      g.save(); g.translate(cx + s * 42, cy - 46); g.rotate(s * .25);
      rr(g, -13, -62, 26, 74, 13); g.fill();
      g.fillStyle = "#e8a4a4";
      rr(g, -7, -52, 14, 52, 7); g.fill();
      g.restore();
    });
  }
  if (S.ear === "horn") {
    [-1, 1].forEach(s => {
      g.fillStyle = "#efe3c4";
      g.beginPath();
      g.moveTo(cx + s * 46, cy - 46);
      g.quadraticCurveTo(cx + s * 66, cy - 72, cx + s * 40, cy - 80);
      g.quadraticCurveTo(cx + s * 44, cy - 60, cx + s * 30, cy - 52);
      g.closePath(); g.fill();
      g.fillStyle = "rgba(120,96,64,.22)";
      g.beginPath(); g.ellipse(cx + s * 42, cy - 64, 7, 5, s * .4, 0, 7); g.fill();
    });
  }
  if (S.ear === "frog") {
    [-1, 1].forEach(s => {
      g.fillStyle = S.body;
      g.beginPath(); g.ellipse(cx + s * 46, cy - 52, 26, 26, 0, 0, 7); g.fill();
      g.fillStyle = S.body2;
      g.beginPath(); g.ellipse(cx + s * 46, cy - 52, 26, 26, 0, Math.PI * .1, Math.PI * .9, true); g.fill();
    });
  }
  if (S.ear === "round") {
    [-1, 1].forEach(s => {
      g.fillStyle = S.body2;
      g.beginPath(); g.ellipse(cx + s * 62, cy - 40, 16, 15, 0, 0, 7); g.fill();
    });
  }
  if (S.ear === "nub") {
    [-1, 1].forEach(s => {
      g.fillStyle = S.body2;
      g.beginPath(); g.ellipse(cx + s * 60, cy - 44, 13, 11, s * .3, 0, 7); g.fill();
    });
  }

  // 头
  const headGrad = g.createLinearGradient(cx - 60, cy - HEAD_RY, cx + 40, cy + HEAD_RY);
  headGrad.addColorStop(0, S.body);
  headGrad.addColorStop(1, S.body2);
  g.fillStyle = headGrad;
  if (S.square) { rr(g, cx - HEAD_RX, cy - HEAD_RY, HEAD_RX * 2, HEAD_RY * 2, 34); g.fill(); }
  else { g.beginPath(); g.ellipse(cx, cy, HEAD_RX, HEAD_RY, 0, 0, 7); g.fill(); }

  // 头顶高光
  g.fillStyle = "rgba(255,255,255,.22)";
  g.beginPath(); g.ellipse(cx - 26, cy - 40, 30, 18, -.5, 0, 7); g.fill();

  // 蛋壳 / 头发 / 帽子
  if (S.shell) {
    g.fillStyle = "rgba(255,255,255,.9)";
    g.beginPath();
    g.ellipse(cx, cy - 66, 40, 22, 0, Math.PI, 0);
    g.closePath(); g.fill();
  }
  if (S.hair) {
    g.fillStyle = S.hair;
    g.beginPath();
    g.ellipse(cx, cy - 34, HEAD_RX + 3, 44, 0, Math.PI, 0);
    g.closePath(); g.fill();
    rr(g, cx - HEAD_RX - 3, cy - 40, 12, 40, 6); g.fill();
    rr(g, cx + HEAD_RX - 9, cy - 40, 12, 40, 6); g.fill();
    if (S.ahoge) {
      g.strokeStyle = S.hair; g.lineWidth = 6; g.lineCap = "round";
      g.beginPath();
      g.moveTo(cx + 6, cy - 70);
      g.quadraticCurveTo(cx + 26, cy - 96, cx + 8, cy - 100);
      g.stroke();
    }
  }
  if (S.cap) {
    g.fillStyle = S.cap;
    g.beginPath();
    g.ellipse(cx, cy - 52, 74, 44, 0, Math.PI, 0);
    g.closePath(); g.fill();
    rr(g, cx - 78, cy - 62, 156, 16, 8); g.fill();
    g.fillStyle = "rgba(0,0,0,.16)";
    rr(g, cx - 78, cy - 52, 156, 6, 3); g.fill();
  }

  // 眼睛
  const EY = cy + 2;
  if (S.sleepy) {
    g.strokeStyle = S.eye; g.lineWidth = 5; g.lineCap = "round";
    [-1, 1].forEach(s => {
      g.beginPath();
      g.moveTo(cx + s * 26 - 11, EY);
      g.quadraticCurveTo(cx + s * 26, EY - 5, cx + s * 26 + 11, EY);
      g.stroke();
    });
  } else {
    const eyeRX = S.wide ? 15 : 12, eyeRY = S.wide ? 17 : 15;
    [-1, 1].forEach(s => {
      const ex = cx + s * 28;
      if (mood === "happy") {
        g.strokeStyle = S.eye; g.lineWidth = 5; g.lineCap = "round";
        g.beginPath();
        g.moveTo(ex - 12, EY + 3);
        g.quadraticCurveTo(ex, EY - 11, ex + 12, EY + 3);
        g.stroke();
      } else {
        g.fillStyle = "#fff";
        g.beginPath(); g.ellipse(ex, EY, eyeRX + 1.5, eyeRY + 1.5, 0, 0, 7); g.fill();
        g.fillStyle = S.eye;
        const pr = mood === "worry" ? .82 : 1;
        g.beginPath(); g.ellipse(ex + s * 1.5, EY + 1, eyeRX * pr, eyeRY * pr, 0, 0, 7); g.fill();
        g.fillStyle = "#fff";
        g.beginPath(); g.arc(ex - 4, EY - 5, 3.6, 0, 7); g.fill();
        g.beginPath(); g.arc(ex + 3, EY + 5, 1.8, 0, 7); g.fill();
      }
    });
  }
  // 眉毛（生气/担心时才有）
  if (mood === "angry" || mood === "worry" || S.angry) {
    g.strokeStyle = S.hair || S.body2; g.lineWidth = 5; g.lineCap = "round";
    [-1, 1].forEach(s => {
      g.beginPath();
      if (mood === "worry") {
        g.moveTo(cx + s * 12, EY - 24);
        g.lineTo(cx + s * 42, EY - 30);
      } else {
        g.moveTo(cx + s * 12, EY - 32);
        g.lineTo(cx + s * 42, EY - 22);
      }
      g.stroke();
    });
  }

  // 口鼻
  const MY = cy + 40;
  if (S.muzzle) {
    g.fillStyle = "#fdf0c4";
    g.beginPath(); g.ellipse(cx, MY + 2, 34, 24, 0, 0, 7); g.fill();
  }
  if (S.nose) {
    g.fillStyle = "#c08a52";
    [-1, 1].forEach(s => {
      g.beginPath(); g.ellipse(cx + s * 11, MY - 1, 5, 4, 0, 0, 7); g.fill();
    });
  }
  if (S.glasses) {
    g.strokeStyle = "rgba(60,48,36,.8)"; g.lineWidth = 3.4;
    [-1, 1].forEach(s => {
      g.beginPath(); g.arc(cx + s * 28, EY, 20, 0, 7); g.stroke();
    });
    g.beginPath(); g.moveTo(cx - 8, EY); g.lineTo(cx + 8, EY); g.stroke();
  }

  // 白胡子：先铺在嘴下面，嘴画在上面才不会被糊掉
  if (S.beard) {
    g.fillStyle = S.beard;
    g.beginPath();
    g.moveTo(cx - 50, MY - 12);
    g.quadraticCurveTo(cx - 58, MY + 34, cx, MY + 46);
    g.quadraticCurveTo(cx + 58, MY + 34, cx + 50, MY - 12);
    g.quadraticCurveTo(cx + 30, MY + 2, cx, MY + 2);
    g.quadraticCurveTo(cx - 30, MY + 2, cx - 50, MY - 12);
    g.closePath(); g.fill();
    g.strokeStyle = "rgba(150,140,120,.28)"; g.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(cx + i * 20, MY + 14);
      g.quadraticCurveTo(cx + i * 22, MY + 28, cx + i * 16, MY + 38);
      g.stroke();
    }
    // 八字胡
    g.fillStyle = S.beard;
    [-1, 1].forEach(s => {
      g.beginPath();
      g.ellipse(cx + s * 20, MY - 4, 17, 9, s * .22, 0, 7);
      g.fill();
    });
  }

  const OPEN = mood === "happy" || S.wide || mood === "angry";
  if (mood === "worry") {
    g.strokeStyle = "#8a4a3a"; g.lineWidth = 4; g.lineCap = "round";
    g.beginPath();
    g.moveTo(cx - 14, MY + 6);
    g.quadraticCurveTo(cx - 5, MY + 1, cx, MY + 6);
    g.quadraticCurveTo(cx + 5, MY + 11, cx + 14, MY + 5);
    g.stroke();
  } else if (OPEN) {
    g.fillStyle = "#7c3a35";
    g.beginPath();
    if (S.wide) g.ellipse(cx, MY + 5, 30, 16, 0, 0, 7);
    else g.ellipse(cx, MY + 4, 17, 13, 0, 0, 7);
    g.fill();
    g.fillStyle = "#f08a86";
    g.beginPath(); g.ellipse(cx, MY + 12, 11, 6, 0, 0, 7); g.fill();
    if (S.fang) {
      g.fillStyle = "#fff";
      g.beginPath();
      g.moveTo(cx - 10, MY - 2); g.lineTo(cx - 4, MY - 2); g.lineTo(cx - 7, MY + 5);
      g.closePath(); g.fill();
    }
  } else {
    g.strokeStyle = "#8a4a3a"; g.lineWidth = 4; g.lineCap = "round";
    g.beginPath();
    g.moveTo(cx - 13, MY);
    g.quadraticCurveTo(cx, MY + 12, cx + 13, MY);
    g.stroke();
  }

  // 腮红
  if (S.blush) {
    g.fillStyle = `rgba(240,132,120,${.34 * S.blush})`;
    [-1, 1].forEach(s => {
      g.beginPath(); g.ellipse(cx + s * 56, MY - 8, 15, 10, 0, 0, 7); g.fill();
    });
  }

  // 帽子上的徽章
  if (S.badge) {
    g.fillStyle = "#f2c14e";
    g.beginPath(); g.arc(cx, cy - 56, 11, 0, 7); g.fill();
    g.fillStyle = "#8a6a1e";
    g.beginPath(); g.arc(cx, cy - 56, 5, 0, 7); g.fill();
  }
  // 围巾
  if (S.scarf) {
    g.fillStyle = "#8fae6a";
    rr(g, cx - 58, 168, 116, 22, 10); g.fill();
    g.strokeStyle = "rgba(255,255,255,.5)"; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      g.beginPath(); g.moveTo(cx - 54 + i * 20, 168); g.lineTo(cx - 54 + i * 20, 190); g.stroke();
    }
  }
  return c;
}

// 3D 模型直出的渲染半身像（assets/characters/3d/，由当前展示模型渲染），
// 比手绘更像本人；有渲染图的角色优先用，没有的回退 canvas 手绘。
const AVATARS3D = {
  nailong: "nailong-waving", naiwa: "naiwa", baobaolong: "baobaolong",
  xiaoqi: "xiaoqi", niulai: "niulai", capybara: "capybara",
  naicha: "naicha", naidan: "naidan", feidudu: "feidudu"
};

// 3D 渲染图是固定表情，心情用滤镜轻涂：开心提亮、生气偏红、担忧降饱和
const MOOD_FILTER = {
  normal: "",
  happy: "saturate(1.18) brightness(1.07)",
  angry: "saturate(1.3) sepia(.22) hue-rotate(-18deg) contrast(1.05)",
  worry: "saturate(.68) brightness(.96)"
};

export function portrait3d(key) {
  const f = AVATARS3D[key];
  return f ? "assets/characters/3d/" + f + "-avatar.webp?v=pt3d-1" : null;
}

export function moodFilter(mood) {
  return MOOD_FILTER[MOODS[mood] ? mood : "normal"] || "";
}

export function portrait(key, mood = "normal") {
  const url3d = portrait3d(key);
  if (url3d) return url3d;
  const k = key + ":" + mood;
  if (CACHE.has(k)) return CACHE.get(k);
  const url = draw(key, MOODS[mood] ? mood : "normal").toDataURL("image/png");
  CACHE.set(k, url);
  return url;
}

export function speakerKey(name) {
  for (const k in SPEC) if (SPEC[k].name === name) return k;
  return null;
}

export const PLAYER_KEY = "nailong";

export function portraitName(key) {
  return (SPEC[key] && SPEC[key].name) || "";
}
