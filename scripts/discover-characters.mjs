#!/usr/bin/env node
/* 奶家村 · 角色候选发现脚本
 * ------------------------------------------------------------------
 * 目的：从 B 站公开榜单和搜索结果里，挖出「可能值得收进图鉴的新角色」，
 *       产出一份候选清单（JSON + 终端表格）交给人来挑。
 *
 * 边界（重要）：
 *   - 只读公开元数据（标题 / 作者 / 播放量 / BV 号 / 话题标签）
 *   - 不下载任何图片、音频、视频；不写入 js/data.js
 *   - 收录与否、写什么文案，仍然由人决定 —— 这个脚本只负责"发现"
 *
 * 数据来源：
 *   ① 番剧榜 pgc/web/rank/list  → 当前热播动画的「作品名」，作为搜索种子
 *   ② 动画区排行 ranking/v2     → 二创 / 整活视频的标题，角色名最密集的地方
 *   ③ 站内热搜 main/hotword     → 兜底语境
 *   每个种子再走一次 all/v2 搜索，把 20 条结果的标题也吃进来。
 *
 * 抽名逻辑（两路信号，分开计数）：
 *   topics  标题里 #话题# 内的词 —— 作者自己标了主题，质量最高
 *   正文    2~5 字连续中文片段 —— 必须跨视频、跨作者重复出现才算数
 * 噪声处理：先把「未删减 / 完整版 / 剧场版 / 一口气看完」这类短语从正文里
 *   整段剜掉，再切 n-gram，否则会切出「未删」「场版」这种碎片。
 *
 * 用法：
 *   node scripts/discover-characters.mjs              # 默认番剧榜前 6 个种子
 *   node scripts/discover-characters.mjs --seeds 10   # 多搜几个种子（更慢）
 *   node scripts/discover-characters.mjs --no-search  # 只用榜单语料
 *   node scripts/discover-characters.mjs --top 30     # 终端打印前 30 个
 *
 * 输出：scripts/out/character-candidates.json
 */
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(ROOT, "scripts", "out");
const OUT_FILE = path.join(OUT_DIR, "character-candidates.json");

/* ---------------- 参数 ---------------- */
const argv = process.argv.slice(2);
function flag(name, def) {
  const i = argv.indexOf("--" + name);
  if (i < 0) return def;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}
const SEED_COUNT = Number(flag("seeds", 6)) || 6;
const TOP_N = Number(flag("top", 25)) || 25;
const NO_SEARCH = Boolean(flag("no-search", false));

/* ---------------- 请求层 ---------------- */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const HEADERS = {
  "User-Agent": UA,
  Referer: "https://www.bilibili.com/",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9"
};
const REQ_GAP_MS = 650;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastReqAt = 0;

async function requestJson(url) {
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const wait = REQ_GAP_MS - (Date.now() - lastReqAt);
    if (wait > 0) await sleep(wait);
    lastReqAt = Date.now();
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(9000) });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      if (json.code === 0 || json.code === undefined) return json;
      if (json.code === -412) {
        lastErr = new Error("风控 -412");
        await sleep(1200);
        continue;
      }
      throw new Error("code " + json.code);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("unknown");
}

/* ---------------- 文本清洗 ---------------- */
function stripHtml(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/* 抽取 #话题# —— B 站标题里作者自己打的主题标签 */
function extractTopics(title) {
  const out = [];
  const re = /#([^#\n]{2,14})#/g;
  let m;
  while ((m = re.exec(title))) out.push(m[1].trim());
  return out;
}

/* 内容形态 / 序号 / 搬运前缀，整段剜掉，避免切出碎片 */
const NOISE_SRC =
  "未删减|无删减|删减版|完整版|升级版|整版|高清版|超清|蓝光|1080P|4K|中文字幕|中字|国语|粤语|日语|台配|国配|中配|日配|剧场版|合集|全集|合集向|一口气看完|一口气|看完|大结局|结局|系列|正片|预告|花絮|幕后|解说|盘点|混剪|剪辑|二创|搬运|转载|反应|测评|开箱|教程|教学|壁纸|头像|表情包|素材|模板|原声带|原声|配乐|音效|纯享|助眠|循环|精选|大全|收藏级|画质";

const NOISE_STRIP = new RegExp(NOISE_SRC, "gi"); // 用于 replace，带 g
const NOISE_TEST = new RegExp(NOISE_SRC, "i"); // 用于 test，绝不能带 g

/* 明显不是角色名的词 */
const STOP_WORDS = new Set(
  `的 了 是 我 你 他 她 它 我们 你们 他们 这 那 这个 那个 什么 怎么 为什么 如何 可以 没有 就是 真的 还是
   一个 一些 有点 一起 直接 已经 现在 今天 昨天 明天 最近 刚刚 终于 突然 居然 竟然 果然 其实 但是 因为 所以
   视频 动画 官方 番剧 国漫 日漫 新番 新作 作品 主角 配角 人物 角色 声优 导演 原作 原著 作者 制作 公司 团队
   世界 大家 有人 没人 我们 你们 自己 别人 时候 地方 东西 事情 问题 方式 感觉 意思 内容 部分 情况 频道
   动漫 二次元 国创 原创 同人 搬运 三连 弹幕 评论 前排 关注 点赞 收藏 推荐 安利 分享 记录 日常 生活
   第一 第二 第三 第四 第五 第六 第七 第八 一集 二集 三集 四季 上集 下集 上篇 下篇 前篇 后篇
   结局 大结局 系列 一口气 看完 国语 粤语 日语 台配 国配 中配 日配 字幕 中文 高清 超清 蓝光
   音乐 歌曲 翻唱 钢琴 吉他 舞蹈 游戏 攻略 实况 手游 端游 单机 主机 电脑 手机 装机 硬件 显卡
   猫咪 狗狗 小猫 小狗 萌宠 治愈 温馨 可爱 萌系 搞笑 沙雕 鬼畜 整活 抽象 高能 名场面 爆笑`
    .split(/\s+/)
    .filter(Boolean)
);

/* 纯序号 / 量词碎片：第二、三季、上、下 */
const ORDINAL_ONLY = /^第?[一二三四五六七八九十百零\d]+[季集期话部章篇]?$/;

function isBadToken(t) {
  if (!t) return true;
  if (t.length < 2 || t.length > 6) return true;
  if (STOP_WORDS.has(t)) return true;
  if (ORDINAL_ONLY.test(t)) return true;
  if (/^[A-Za-z0-9]+$/.test(t)) return true; // 纯英文/数字先不管
  if (/[的了和与是呢吧啊呀嘛哦]$/.test(t)) return true; // 句尾虚词碎片
  if (/^[的了和与是这那我你他她它]/.test(t)) return true;
  // 剥掉噪声短语后还残留的碎片
  if (NOISE_TEST.test(t)) return true;
  return false;
}

/* 正文归一化：剥话题、剥括号、剥噪声短语，只留中文与字母 */
function normalize(title) {
  return stripHtml(title)
    .replace(/#[^#\n]{1,14}#/g, " ")
    .replace(/【[^】]{0,24}】/g, " ")
    .replace(/\[[^\]]{0,24}\]/g, " ")
    .replace(/（[^）]{0,24}）/g, " ")
    .replace(/\([^)]{0,24}\)/g, " ")
    .replace(/《[^》]{0,30}》/g, " ")
    .replace(NOISE_STRIP, " ")
    .replace(/[^\u4e00-\u9fffA-Za-z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function* ngrams(text, min, max) {
  const runs = text.match(/[\u4e00-\u9fff]{2,10}/g) || [];
  for (const run of runs) {
    for (let n = min; n <= max; n++) {
      if (run.length < n) continue;
      for (let i = 0; i + n <= run.length; i++) yield run.slice(i, i + n);
    }
  }
}

/* ---------------- 已有角色（读 data.js，避免重复提名） ---------------- */
function loadExisting() {
  const file = path.join(ROOT, "js", "data.js");
  const names = new Set();
  try {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/\bid:\s*["']([^"']+)["']/g)) names.add(m[1]);
    for (const m of src.matchAll(/\bname:\s*["']([^"']+)["']/g)) names.add(m[1]);
  } catch (err) {
    console.warn("读不到 js/data.js，跳过已有角色过滤");
  }
  return names;
}

/* ---------------- 语料收集 ---------------- */
const corpus = [];

function addVideo(v, source) {
  const title = stripHtml(v.title).trim();
  if (!title) return;
  corpus.push({
    title,
    author: stripHtml(v.author || (v.owner && v.owner.name) || "").trim(),
    play: Number(v.play || (v.stat && v.stat.view) || 0) || 0,
    bvid: v.bvid || v.id || "",
    url: v.bvid ? "https://www.bilibili.com/video/" + v.bvid : "",
    source
  });
}

async function collectFromRankings() {
  let animeTitles = [];
  try {
    const j = await requestJson("https://api.bilibili.com/pgc/web/rank/list?day=3&season_type=1");
    const list = (j.result && j.result.list) || [];
    animeTitles = list.map((x) => stripHtml(x.title).trim()).filter(Boolean);
    console.log(`番剧榜 ${list.length} 条`);
  } catch (err) {
    console.warn("番剧榜拿不到：" + err.message);
  }

  try {
    const j = await requestJson(
      "https://api.bilibili.com/x/web-interface/ranking/v2?rid=1&type=all"
    );
    const list = (j.data && j.data.list) || [];
    list.forEach((v) => addVideo(v, "rank-anime"));
    console.log(`动画区排行 ${list.length} 条`);
  } catch (err) {
    console.warn("动画区排行拿不到：" + err.message);
  }

  try {
    const j = await requestJson("https://s.search.bilibili.com/main/hotword");
    const list = j.list || j.data || [];
    list.forEach((h) => {
      const kw = stripHtml(h.keyword || h.name || h.show_name || "").trim();
      if (!kw) return;
      corpus.push({ title: kw, author: "", play: Number(h.heat || 0) || 0, bvid: "", url: "", source: "hotword" });
    });
    console.log(`热搜 ${list.length} 条`);
  } catch (err) {
    console.warn("热搜拿不到：" + err.message);
  }

  return animeTitles;
}

async function collectFromSearch(seeds) {
  if (NO_SEARCH) return;
  for (const kw of seeds) {
    try {
      const j = await requestJson(
        "https://api.bilibili.com/x/web-interface/search/all/v2?keyword=" +
          encodeURIComponent(kw) +
          "&page=1"
      );
      const groups = (j.data && j.data.result) || [];
      const g = groups.find((x) => x && x.result_type === "video");
      const items = (g && g.data) || [];
      items.forEach((v) => addVideo(v, "search:" + kw));
      console.log(`搜索「${kw}」→ ${items.length} 条`);
    } catch (err) {
      console.warn(`搜索「${kw}」失败：${err.message}`);
    }
  }
}

/* ---------------- 统计 ---------------- */
const stats = new Map(); // token -> { videos:Set, authors:Set, topics, samples:[] }

function bump(token, rec, fromTopic) {
  let s = stats.get(token);
  if (!s) {
    s = { videos: new Set(), authors: new Set(), topics: 0, samples: [] };
    stats.set(token, s);
  }
  s.videos.add(rec.bvid || rec.title);
  if (rec.author) s.authors.add(rec.author);
  if (fromTopic) s.topics += 1;
  if (s.samples.length < 3 && rec.bvid) {
    s.samples.push({
      title: rec.title.slice(0, 42),
      author: rec.author,
      play: rec.play,
      url: rec.url
    });
  }
}

function accumulate() {
  for (const rec of corpus) {
    for (const raw of extractTopics(rec.title)) {
      const clean = raw.replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, "");
      if (isBadToken(clean)) continue;
      bump(clean, rec, true);
    }
    for (const g of ngrams(normalize(rec.title), 2, 5)) {
      if (isBadToken(g)) continue;
      bump(g, rec, false);
    }
  }
}

/* 丢掉被更长的同频词完全覆盖的短词：「卡皮巴」被「卡皮巴拉」盖住 */
function pruneSubstrings(rows) {
  return rows.filter((r) => {
    for (const other of rows) {
      if (other.name.length <= r.name.length) continue;
      if (!other.name.includes(r.name)) continue;
      if (other.videos >= Math.max(3, r.videos * 0.7)) return false;
    }
    return true;
  });
}

function buildCandidates(animeTitles) {
  const existing = new Set([...loadExisting()].map((x) => String(x).toLowerCase()));
  const animeSet = new Set(
    (animeTitles || []).map((t) => t.replace(/[（(].*?[）)]/g, "").trim())
  );

  // 先算每条视频的播放量，避免在候选循环里反复 find
  const heatBy = new Map();
  for (const rec of corpus) {
    const key = rec.bvid || rec.title;
    if (!heatBy.has(key)) heatBy.set(key, rec.play);
  }

  const rows = [];
  for (const [token, s] of stats) {
    const videos = s.videos.size;
    const authors = s.authors.size;
    if (videos < 3) continue; // 跨视频重复才算数
    if (authors < 2) continue; // 单个 UP 主反复提，可能只是他的系列名
    if (existing.has(token.toLowerCase())) continue;
    if ([...existing].some((e) => e.length >= 2 && token.includes(e))) continue;

    let heat = 0;
    for (const key of s.videos) heat += heatBy.get(key) || 0;

    const score =
      Math.log10(10 + heat) * 1.0 +
      videos * 0.55 +
      authors * 0.45 +
      s.topics * 1.2;

    rows.push({
      name: token,
      score: Number(score.toFixed(2)),
      videos,
      authors,
      topics: s.topics,
      heat,
      isAnimeTitle: animeSet.has(token),
      samples: s.samples
    });
  }

  return pruneSubstrings(rows).sort((a, b) => b.score - a.score);
}

/* ---------------- 输出 ---------------- */
function fmtHeat(n) {
  if (n >= 1e8) return (n / 1e8).toFixed(1) + "亿";
  if (n >= 1e4) return (n / 1e4).toFixed(1) + "万";
  return String(n);
}

function printTable(rows) {
  console.log("");
  console.log("候选角色（按可信度排序）");
  console.log("─".repeat(80));
  console.log(
    "  " +
      "名称".padEnd(10) +
      "视频".padStart(4) +
      "作者".padStart(4) +
      "话题".padStart(4) +
      "热度".padStart(9) +
      "  类型 / 代表视频"
  );
  console.log("─".repeat(80));
  rows.slice(0, TOP_N).forEach((r, i) => {
    const sample = r.samples[0] ? r.samples[0].title : "";
    console.log(
      String(i + 1).padStart(2) +
        " " +
        r.name.padEnd(10) +
        String(r.videos).padStart(4) +
        String(r.authors).padStart(4) +
        String(r.topics).padStart(4) +
        fmtHeat(r.heat).padStart(9) +
        "  " +
        (r.isAnimeTitle ? "作品 " : "角色 ") +
        sample
    );
  });
  console.log("─".repeat(80));
}

async function main() {
  console.log("收集语料…");
  const animeTitles = await collectFromRankings();

  const seeds = animeTitles
    .filter((t) => !/中配|国语|粤语|台配/.test(t))
    .slice(0, SEED_COUNT);

  if (!NO_SEARCH) console.log(`用 ${seeds.length} 个番剧名做种子搜索…`);
  await collectFromSearch(seeds);

  console.log(`语料合计 ${corpus.length} 条`);
  accumulate();

  const rows = buildCandidates(animeTitles);
  printTable(rows);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    corpus: corpus.length,
    seeds,
    counts: { candidates: rows.length },
    candidates: rows.slice(0, 60)
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), "utf8");
  console.log(`\n候选 ${rows.length} 个，已写入 ${path.relative(ROOT, OUT_FILE)}`);
  console.log("挑中的，用 scripts/propose-character.mjs 生成 data.js 条目。");
}

main().catch((err) => {
  console.error("失败：", err && err.message);
  process.exit(1);
});
