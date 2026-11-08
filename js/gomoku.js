// 奶家村 · 大冒险 —— 公园石桌上那盘棋
//
// 界面写着「九路盘 · 围棋」，其实是五子棋。
// 奶龙以为在陪大爷下围棋，大爷在偷偷连五 —— 这就是这一段的全部笑点。
// 所以棋盘不画提示、不标「四连」、不提醒「该堵了」，谁也不点破。
//
// 用法：
//   Gomoku.open({ onEnd(result), sfx(name) })
//   result: "player" | "ai" | "draw" | "quit"

const N = 9;                 // 九路盘
const EMPTY = 0, BLACK = 1, WHITE = 2;
const SIZE = 720;            // 画布内部边长（CSS 再缩）
const PAD = 58;
const CELL = (SIZE - PAD * 2) / (N - 1);

let cv = null, ctx = null;
let board = [];
let turn = BLACK;            // 玩家执黑先行
let over = true;
let hover = null;
let opts = {};
let aiTimer = 0;
let lastMove = null;         // { r, c, who }
let moveCount = 0;

const $ = s => document.querySelector(s);

/* =========================================================
   画棋盘
   ========================================================= */
function px(i) { return PAD + i * CELL; }

function draw() {
  if (!ctx) return;
  const g = ctx;
  g.clearRect(0, 0, SIZE, SIZE);

  // 木盘
  const wood = g.createLinearGradient(0, 0, SIZE, SIZE);
  wood.addColorStop(0, "#e8ca92");
  wood.addColorStop(.55, "#dcbb7f");
  wood.addColorStop(1, "#cfa96c");
  g.fillStyle = wood;
  g.fillRect(0, 0, SIZE, SIZE);
  // 木纹
  g.save();
  g.globalAlpha = .1;
  for (let i = 0; i < 26; i++) {
    const y = (i * 37) % SIZE;
    g.strokeStyle = i % 2 ? "#8a6a3c" : "#f3e0bb";
    g.lineWidth = 2 + (i % 3);
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(SIZE * .3, y + 10, SIZE * .6, y - 12, SIZE, y + 4);
    g.stroke();
  }
  g.restore();

  // 网格
  g.strokeStyle = "rgba(74,54,28,.75)";
  g.lineWidth = 2.2;
  for (let i = 0; i < N; i++) {
    g.beginPath(); g.moveTo(px(0), px(i)); g.lineTo(px(N - 1), px(i)); g.stroke();
    g.beginPath(); g.moveTo(px(i), px(0)); g.lineTo(px(i), px(N - 1)); g.stroke();
  }
  // 外框加粗
  g.lineWidth = 4;
  g.strokeRect(px(0), px(0), CELL * (N - 1), CELL * (N - 1));

  // 星位
  g.fillStyle = "rgba(58,42,20,.85)";
  [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]].forEach(([r, c]) => {
    g.beginPath(); g.arc(px(c), px(r), 6, 0, 7); g.fill();
  });

  // 悬停提示
  if (hover && !over && board[hover.r][hover.c] === EMPTY) {
    g.fillStyle = "rgba(40,34,20,.16)";
    g.beginPath(); g.arc(px(hover.c), px(hover.r), CELL * .42, 0, 7); g.fill();
  }

  // 棋子
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const v = board[r][c];
      if (!v) continue;
      stone(px(c), px(r), v);
    }
  }

  // 最后一手：圈一下
  if (lastMove) {
    g.strokeStyle = lastMove.who === BLACK ? "rgba(240,220,170,.95)" : "rgba(70,50,26,.9)";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(px(lastMove.c), px(lastMove.r), CELL * .17, 0, 7);
    g.stroke();
  }
}

function stone(x, y, who) {
  const g = ctx, R = CELL * .42;
  // 影子
  g.fillStyle = "rgba(52,38,20,.28)";
  g.beginPath(); g.arc(x + 3, y + 4, R, 0, 7); g.fill();
  const grad = g.createRadialGradient(x - R * .35, y - R * .4, R * .1, x, y, R);
  if (who === BLACK) {
    grad.addColorStop(0, "#5d5a55");
    grad.addColorStop(.6, "#26241f");
    grad.addColorStop(1, "#100f0d");
  } else {
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(.7, "#f0ece2");
    grad.addColorStop(1, "#cfc7b7");
  }
  g.fillStyle = grad;
  g.beginPath(); g.arc(x, y, R, 0, 7); g.fill();
  g.strokeStyle = who === BLACK ? "rgba(255,255,255,.1)" : "rgba(120,110,92,.5)";
  g.lineWidth = 1.4;
  g.beginPath(); g.arc(x, y, R - .6, 0, 7); g.stroke();
}

/* =========================================================
   规则
   ========================================================= */
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

function inB(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }

// 这个点落 who 之后，某个方向上有几个连着的、两头空不空
function lineInfo(r, c, dr, dc, who) {
  let count = 1, openA = 0, openB = 0;
  let rr = r + dr, cc = c + dc;
  while (inB(rr, cc) && board[rr][cc] === who) { count++; rr += dr; cc += dc; }
  if (inB(rr, cc) && board[rr][cc] === EMPTY) openA = 1;
  rr = r - dr; cc = c - dc;
  while (inB(rr, cc) && board[rr][cc] === who) { count++; rr -= dr; cc -= dc; }
  if (inB(rr, cc) && board[rr][cc] === EMPTY) openB = 1;
  return { count, open: openA + openB };
}

function isWin(r, c, who) {
  for (const [dr, dc] of DIRS) {
    if (lineInfo(r, c, dr, dc, who).count >= 5) return true;
  }
  return false;
}

function boardFull() {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!board[r][c]) return false;
  return true;
}

/* =========================================================
   大爷的脑子
   ========================================================= */
// 一颗子落在 (r,c) 值多少分：己方成形 + 挡对手
function pointValue(r, c, who) {
  let v = 0;
  for (const [dr, dc] of DIRS) {
    const { count, open } = lineInfo(r, c, dr, dc, who);
    if (count >= 5) v += 400000;
    else if (count === 4) v += open === 2 ? 30000 : (open === 1 ? 4200 : 0);
    else if (count === 3) v += open === 2 ? 2600 : (open === 1 ? 380 : 0);
    else if (count === 2) v += open === 2 ? 190 : (open === 1 ? 40 : 0);
    else if (count === 1) v += open === 2 ? 14 : 3;
  }
  // 靠中间一点总归好使
  v += (4 - Math.abs(r - 4)) + (4 - Math.abs(c - 4));
  return v;
}

function aiMove() {
  let best = [], bestScore = -1;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (board[r][c] !== EMPTY) continue;
      const mine = pointValue(r, c, WHITE);
      const theirs = pointValue(r, c, BLACK);
      // 大爷是自己下得凶、防得懒一点的那种老头：
      // 你要是没看出他在连五，他就顺着自己的路走。
      const s = mine * 1.0 + theirs * .86 + Math.random() * 6;
      if (s > bestScore) { bestScore = s; best = [[r, c]]; }
      else if (s === bestScore) best.push([r, c]);
    }
  }
  if (!best.length) return null;
  return best[Math.floor(Math.random() * best.length)];
}

/* =========================================================
   一局
   ========================================================= */
function reset() {
  board = Array.from({ length: N }, () => new Array(N).fill(EMPTY));
  turn = BLACK; over = false; hover = null; lastMove = null; moveCount = 0;
  $("#goResult").classList.remove("show");
  $("#goBoardBox").classList.remove("flip");
  $("#goResult").textContent = "";
  setMsg("（大爷把白棋罐往你这边推了推。）");
  draw();
}

function setMsg(t) { const e = $("#goMsg"); if (e) e.textContent = t; }

function place(r, c, who) {
  board[r][c] = who;
  lastMove = { r, c, who };
  moveCount++;
  draw();
  if (isWin(r, c, who)) { finish(who === BLACK ? "player" : "ai"); return true; }
  if (boardFull()) { finish("draw"); return true; }
  return false;
}

function playerMove(r, c) {
  if (over || turn !== BLACK) return;
  if (board[r][c] !== EMPTY) return;
  opts.sfx && opts.sfx("pick");
  if (place(r, c, BLACK)) return;
  turn = WHITE;
  setMsg(midGameLine());
  clearTimeout(aiTimer);
  aiTimer = setTimeout(aiTurn, 420 + Math.random() * 260);
}

function aiTurn() {
  if (over) return;
  const mv = aiMove();
  if (!mv) { finish("draw"); return; }
  const [r, c] = mv;
  opts.sfx && opts.sfx("pick");
  if (place(r, c, WHITE)) return;
  turn = BLACK;
  setMsg(midGameLine());
}

// 大爷的碎嘴子：越到后面越欠
function midGameLine() {
  if (moveCount >= 14) return "（大爷开始一边下一边哼小曲。）";
  if (moveCount >= 9) return "（他落子越来越快，像是早知道你会下哪儿。）";
  if (moveCount >= 5) return "（大爷眯着眼，一副「年轻人棋力不错」的样子。）";
  return "（他落子很快，连想都不怎么想。）";
}

function finish(result) {
  over = true;
  clearTimeout(aiTimer);
  const box = $("#goResult");
  const t = { player: "你赢了", ai: "棋爷赢了", draw: "和棋" }[result] || "结束";
  $("#goBoardBox").classList.toggle("flip", result === "player");
  box.textContent = t;
  box.classList.add("show");
  if (result === "player") {
    setMsg("（棋子撒了一地。）");
    opts.sfx && opts.sfx("ko");
  } else if (result === "ai") {
    setMsg("（大爷把手里剩下的子一丢，笑了。）");
    opts.sfx && opts.sfx("coin");
  } else {
    setMsg("（两个人都没地儿下了。）");
  }
  setTimeout(() => {
    Gomoku.close();
    opts.onEnd && opts.onEnd(result);
  }, result === "player" ? 1500 : 1250);
}

/* =========================================================
   对外
   ========================================================= */
function toCell(ev) {
  const rect = cv.getBoundingClientRect();
  const x = (ev.clientX - rect.left) / rect.width * SIZE;
  const y = (ev.clientY - rect.top) / rect.height * SIZE;
  const c = Math.round((x - PAD) / CELL);
  const r = Math.round((y - PAD) / CELL);
  if (!inB(r, c)) return null;
  // 离交叉点太远就不算（手机上别点哪儿都落子）
  if (Math.hypot(x - px(c), y - px(r)) > CELL * .52) return null;
  return { r, c };
}

function bindOnce() {
  if (bindOnce.done) return;
  bindOnce.done = true;
  cv = $("#goBoard");
  ctx = cv.getContext("2d");

  cv.addEventListener("pointerdown", ev => {
    ev.preventDefault();
    const p = toCell(ev);
    if (p) playerMove(p.r, p.c);
  });
  cv.addEventListener("pointermove", ev => {
    const p = toCell(ev);
    const same = (hover && p && hover.r === p.r && hover.c === p.c) || (!hover && !p);
    hover = p;
    if (!same) draw();
  });
  cv.addEventListener("pointerleave", () => { hover = null; draw(); });
  $("#goQuit").addEventListener("click", () => {
    if (over) return;
    over = true;
    clearTimeout(aiTimer);
    Gomoku.close();
    opts.onEnd && opts.onEnd("quit");
  });
}

export const Gomoku = {
  open(o = {}) {
    opts = o;
    bindOnce();
    reset();
    $("#go").classList.add("show");
    document.body.classList.add("ingomoku");
    // 手机竖屏：把棋盘放在正中间，别被 HUD 挤歪
    cv.style.aspectRatio = "1 / 1";
  },
  close() {
    over = true;
    clearTimeout(aiTimer);
    $("#go").classList.remove("show");
    document.body.classList.remove("ingomoku");
    $("#goResult").classList.remove("show");
    $("#goBoardBox").classList.remove("flip");
  },
  get playing() { return !over; }
};
