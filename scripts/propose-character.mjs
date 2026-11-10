#!/usr/bin/env node
/* 奶家村 · 候选角色 → data.js 条目
 * ------------------------------------------------------------------
 * 把 discover-characters.mjs 挖出来的候选，转成一条可以贴进
 * js/data.js 的 PEOPLE 条目。
 *
 * 设计前提：「文字先行」。
 *   - 只写有据可查的字段（名称、热度、来源链接）
 *   - title / quote / desc / tags 一律留 TODO，由人来写 —— 脚本不编造文案
 *   - 不配 image，页面会走 js/avatars.js 的首字圆牌兜底，零素材也能上线
 *
 * 用法：
 *   node scripts/propose-character.mjs --list            # 看有哪些候选
 *   node scripts/propose-character.mjs --name 阿尼亚      # 生成条目
 *   node scripts/propose-character.mjs --index 6         # 按序号生成
 *   node scripts/propose-character.mjs --name 阿尼亚 --category 官方IP --id anya
 *
 * 输出：终端打印 + scripts/out/entries/<id>.js
 */
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CANDIDATES = path.join(ROOT, "scripts", "out", "character-candidates.json");
const ENTRY_DIR = path.join(ROOT, "scripts", "out", "entries");

const argv = process.argv.slice(2);
function flag(name, def) {
  const i = argv.indexOf("--" + name);
  if (i < 0) return def;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

const LIST = Boolean(flag("list", false));
const NAME = flag("name", "");
const INDEX = flag("index", "");
const FORCE_ID = flag("id", "");
const CATEGORY = flag("category", "待定");

function readCandidates() {
  if (!fs.existsSync(CANDIDATES)) {
    console.error("还没有候选文件，先跑：node scripts/discover-characters.mjs");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CANDIDATES, "utf8"));
}

/* 中文名没有拼音库，用哈希生成稳定 id；要好看就自己 --id */
function slug(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return "c" + h.toString(36).slice(0, 6);
}

/* 站内 heat 是排序分（现有角色多在 9000~9800），不是播放量。
   新角色起点压在 6000~9500 之间，靠投票往上爬，别一进来就顶到群主头上。 */
function mapHeat(play) {
  const n = Math.max(0, Number(play) || 0);
  const v = 6000 + 2600 * (Math.log10(10 + n) / 8);
  return Math.max(6000, Math.min(9500, Math.round(v)));
}

function fmtPlay(n) {
  n = Number(n) || 0;
  if (n >= 1e8) return (n / 1e8).toFixed(1) + "亿";
  if (n >= 1e4) return (n / 1e4).toFixed(1) + "万";
  return String(n);
}

function entrySource(c) {
  const id = FORCE_ID || slug(c.name);
  const heat = mapHeat(c.heat);
  const evidence = (c.samples || [])
    .map((s) => `//   证据：${s.title}（${s.author || "未知作者"}，${fmtPlay(s.play)}）${s.url}`)
    .join("\n");

  return `  {
    // 由 discover-characters.mjs 生成：${new Date().toISOString().slice(0, 10)}
    // 出现 ${c.videos} 条视频 / ${c.authors} 位作者 / 话题命中 ${c.topics} 次
${evidence}
    id: "${id}",
    name: "${c.name}",
${CATEGORY === "待定" ? '    category: "待定", // TODO 官方IP | 抽象迷因 | 动物顶流' : `    category: "${CATEGORY}",`}
    title: "", // TODO 一句话称号
    heat: ${heat},
    quote: "", // TODO 热梗 / 名场面
    desc: "", // TODO 中性介绍，别写未核实的设定
    tags: [], // TODO 3~4 个标签
    origin: "TODO 来源与权利归属" // 举证用：${(c.samples && c.samples[0] && c.samples[0].url) || "无"}
  },`;
}

function checklist(c) {
  const id = FORCE_ID || slug(c.name);
  return `
接下来（按「文字先行」的顺序，前两步就能上线）：

  1. 把上面的条目贴进 js/data.js 的 PEOPLE 数组，补掉 TODO
     · 不填 image，页面自动用首字圆牌当形象，现在就能看

  2. 票数起来 / 你决定升级时，再补素材：
     · 形象：把透明底 PNG 放到 assets/characters/${id}.png
             然后把 "${id}" 加进 scripts/gen-3d-assets.py 的 IDS 数组，
             跑 python scripts/gen-3d-assets.py —— 深度图和 3D 网格自动生成
     · 音色：想克隆再跑 scripts/clone-voices.mjs（需要参考音频与授权）
             不克隆也行，js/tts.js 会退到浏览器内置语音
`;
}

function main() {
  const data = readCandidates();
  const rows = data.candidates || [];

  if (!rows.length) {
    console.error("候选列表是空的，先重新跑 discover-characters.mjs");
    process.exit(1);
  }

  if (LIST) {
    console.log(`候选（${data.generatedAt.slice(0, 10)} 生成，语料 ${data.corpus} 条）\n`);
    rows.forEach((c, i) => {
      console.log(
        String(i + 1).padStart(2) +
          "  " +
          c.name.padEnd(10) +
          "视频 " + String(c.videos).padStart(2) +
          "  作者 " + String(c.authors).padStart(2) +
          "  话题 " + String(c.topics).padStart(2) +
          "  " + fmtPlay(c.heat)
      );
    });
    console.log("\n用 --name 名称 或 --index 序号 生成条目");
    return;
  }

  let c = null;
  if (NAME) c = rows.find((r) => r.name === NAME);
  else if (INDEX !== "") c = rows[Number(INDEX) - 1];
  else {
    console.error("用法：--list | --name 名称 | --index 序号");
    process.exit(1);
  }

  if (!c) {
    console.error("没找到这个候选，先 --list 看看");
    process.exit(1);
  }

  const src = entrySource(c);
  fs.mkdirSync(ENTRY_DIR, { recursive: true });
  const id = FORCE_ID || slug(c.name);
  const outFile = path.join(ENTRY_DIR, id + ".js");
  fs.writeFileSync(outFile, src + "\n", "utf8");

  console.log("贴进 js/data.js 的 PEOPLE 数组：\n");
  console.log(src);
  console.log(checklist(c));
  console.log(`条目已存到 ${path.relative(ROOT, outFile)}`);
}

main();
