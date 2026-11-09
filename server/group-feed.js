/* 奶家村 · 群聊视频源（服务端代抓）
 * ------------------------------------------------------------------
 * 为什么放在服务端：B 站接口对浏览器发出的跨域请求会直接 403
 * （带 Origin 头即被风控拒绝），所以只能由服务端以普通请求身份抓取，
 * 再把结果以同源 JSON 的形式交给页面。
 *
 * 只抓元数据（标题 / 作者 / 播放量 / 链接），不下载、不转存任何视频文件。
 * 缓存 10 分钟，过期后先返回旧数据、后台静默刷新（stale-while-revalidate），
 * 保证页面永远不会等抓取。
 */
"use strict";

const TTL_MS = 10 * 60 * 1000;
const MIN_HEAT = 20000;
const MAX_VIDEOS = 18;
const REQ_GAP_MS = 380;
const MAX_DURATION_SEC = 1500; // 超过 25 分钟的合集直接不要

/* 合集 / 纯享 / 循环 这类搬运内容信息量低，排在后面，但不删 */
const LOW_INFO = /合集|纯享|循环|助眠|小时|精选|大全|盘点|搬运/;

/* 抽象 / 整活 / 鬼畜 —— 用户点名要优先的那类 */
const ODD_RE = /抽象|整活|沙雕|鬼畜|梗|笑死|离谱|绷不住|绝活|发疯|逆天|魔性|搞笑/;

/* 模玩店也叫「牛来」，搜"牛来"会带出一堆手办开箱，跟奶家村没关系 */
const OFF_TOPIC = /模玩|高达|手办|模型|开箱|积木|乐高/;
const CORE_NAME = /奶龙|奶蛙|奶察|奶家村|卡皮巴拉|暴暴龙/;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const HEADERS = {
  "User-Agent": UA,
  Referer: "https://search.bilibili.com/",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9"
};

/* 搜索词。角色关键词单独搜，覆盖面比只搜"奶龙"更全。
   不放"小七" —— 这名字太通用，搜回来全是游戏主播。 */
const QUERIES = ["奶龙", "奶蛙", "卡皮巴拉", "暴暴龙", "牛来", "奶察", "奶家村"];

/* 相关性闸门：默认必须与"奶家村宇宙"沾边（标题或作者带「奶」/「村」），
   暴暴龙、卡皮巴拉、牛来 这几个成员名本身就是强信号，可单独放行。 */
const CORE_SIGNAL = /奶|村/;
const MEMBER_SIGNAL = /暴暴龙|暴龙|卡皮巴拉|水豚|牛来/;

/* 归属：谁的视频谁发。顺序有意义 —— 具体的成员排在奶龙前面，
   否则标题里一带"奶龙"就会被群主抢走。 */
const ROLES = [
  { key: "naiwa", words: ["奶蛙"] },
  { key: "baobaolong", words: ["暴暴龙", "暴龙"] },
  { key: "capybara", words: ["卡皮巴拉", "水豚"] },
  { key: "niulai", words: ["牛来"] },
  { key: "naicha", words: ["奶察"] },
  { key: "xiaoqi", words: ["小七"] },
  { key: "nailong", words: ["奶龙", "奶家村"] }
];

const UGC_HINTS = [
  "二创", "剪辑", "混剪", "配音", "手书", "手绘", "动画", "整活",
  "鬼畜", "搞笑", "沙雕", "表情包", "MAD", "AMV", "填词", "配音"
];

/* 台词模板：按 bvid 取模，同一条视频每次刷出来说的话固定，不会跳。 */
const LEADS = [
  (v) => ["刷到这个，笑到打鸣", "「" + v.title + "」 " + v.author + " 的，已经 " + v.stat + " 播放了"],
  (v) => ["这个必须发群里", v.author + " 新活，「" + v.title + "」"],
  (v) => ["有人看过这个没", "「" + v.title + "」 " + v.stat + " 播放，我笑不活了"],
  (v) => ["救命 又刷到一条", v.author + "：" + v.title],
  (v) => ["刚推到我首页的", "「" + v.title + "」 才发不久就 " + v.stat + " 了"],
  (v) => ["这条真的太顶了", v.author + " 整的活，自己看吧"]
];

let cache = { at: 0, payload: null };
let inflight = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cleanText(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function fmtPlay(n) {
  n = Number(n) || 0;
  if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, "") + "亿";
  if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, "") + "万";
  return String(n);
}

function clip(s, max) {
  s = String(s || "");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/* "12:34" / "1:02:03" → 秒 */
function parseDuration(str) {
  const parts = String(str || "").trim().split(":").map(Number);
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/* 选稿分：热度对数 × 新鲜度/时长/抽象加权 × 低质惩罚
   老视频压得住，但热度差十倍的老爆款仍能压过冷门新片。 */
function pickScore(v, now) {
  const days = v.pubdate ? (now - v.pubdate) / 86400 : 999;
  let rec;
  if (days <= 3) rec = 1;
  else if (days <= 30) rec = 0.85;
  else if (days <= 180) rec = 0.6;
  else if (days <= 365) rec = 0.35;
  else rec = 0.2;

  const d = v.durationSec || 0;
  let dur;
  if (!d) dur = 0.5;
  else if (d <= 60) dur = 1;
  else if (d <= 180) dur = 0.85;
  else if (d <= 420) dur = 0.6;
  else if (d <= 900) dur = 0.3;
  else dur = 0.1;

  const odd = ODD_RE.test(v.title + " " + v.author) ? 1 : 0;
  const factor = 0.38 * rec + 0.2 * dur + 0.15 * odd + 0.27;
  const penalty = LOW_INFO.test(v.title) ? 0.45 : 1;
  return Math.log10(Math.max(10, v.heat)) * factor * penalty;
}

function pickSender(text) {
  for (const role of ROLES) {
    if (role.words.some((w) => text.indexOf(w) >= 0)) return role.key;
  }
  return null;
}

function guessKind(v) {
  const t = (v.title + " " + v.author).toLowerCase();
  if (/官方|bilibili|动画官方/.test(v.author)) return "official";
  return UGC_HINTS.some((h) => t.indexOf(h.toLowerCase()) >= 0) ? "ugc" : "ugc";
}

function hashOf(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(9000)
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const json = await res.json();
  if (json.code !== 0) throw new Error("bili code " + json.code);
  return json.data;
}

async function searchOne(keyword) {
  const url =
    "https://api.bilibili.com/x/web-interface/search/all/v2?keyword=" +
    encodeURIComponent(keyword) +
    "&page=1";
  const data = await fetchJson(url);
  const groups = Array.isArray(data && data.result) ? data.result : [];
  const videoGroup = groups.find((g) => g && g.result_type === "video");
  return videoGroup && Array.isArray(videoGroup.data) ? videoGroup.data : [];
}

async function crawl() {
  const bucket = new Map();
  const failures = [];

  for (let i = 0; i < QUERIES.length; i++) {
    if (i) await sleep(REQ_GAP_MS);
    try {
      const items = await searchOne(QUERIES[i]);
      for (const raw of items) {
        const bvid = raw && raw.bvid;
        if (!bvid || !/^BV/.test(bvid)) continue;

        const title = cleanText(raw.title);
        const author = cleanText(raw.author);
        if (!title || title.length < 4) continue;

        // 必须与奶家村相关，否则丢弃（搜索常带出无关内容）
        const haystack = title + " " + author;
        if (!CORE_SIGNAL.test(haystack) && !MEMBER_SIGNAL.test(haystack)) continue;

        // 模玩区的"牛来模玩"混进来了：不带任何成员真名的一律丢掉
        if (OFF_TOPIC.test(haystack) && !CORE_NAME.test(haystack)) continue;

        const sender = pickSender(haystack);
        if (!sender) continue;

        const heat = Number(raw.play) || 0;
        if (heat < MIN_HEAT) continue;

        // 太长的合集不要：一次看不完，也不是群里想刷的东西
        const durSec = parseDuration(raw.duration);
        if (durSec > MAX_DURATION_SEC) continue;

        const prev = bucket.get(bvid);
        if (prev && prev.heat >= heat) continue;

        const video = {
          sender: sender,
          platform: "bilibili",
          url: "https://www.bilibili.com/video/" + bvid,
          id: bvid,
          title: clip(title, 42),
          author: clip(author, 18),
          stat: fmtPlay(heat),
          heat: heat,
          kind: guessKind({ title, author }),
          pubdate: Number(raw.pubdate) || 0,
          durationSec: durSec,
          embed: true
        };
        video.lead = LEADS[hashOf(bvid) % LEADS.length](video);
        bucket.set(bvid, video);
      }
    } catch (err) {
      failures.push(QUERIES[i] + ": " + (err && err.message));
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const videos = Array.from(bucket.values())
    .map((v) => {
      v._rank = pickScore(v, now);
      return v;
    })
    .sort((a, b) => b._rank - a._rank)
    .slice(0, MAX_VIDEOS)
    .map((v) => {
      delete v._rank;
      return v;
    });

  return {
    videos: videos,
    fetchedAt: Date.now(),
    queries: QUERIES.length,
    failures: failures
  };
}

function refresh() {
  if (inflight) return inflight;
  inflight = crawl()
    .then((payload) => {
      if (payload.videos.length) cache = { at: Date.now(), payload: payload };
      return payload;
    })
    .catch((err) => {
      return { videos: [], fetchedAt: Date.now(), error: String((err && err.message) || err) };
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/* 对外：拿到尽量新的数据，但绝不阻塞超过已有缓存 */
async function getFeed() {
  const fresh = cache.payload && Date.now() - cache.at < TTL_MS;
  if (fresh) return Object.assign({ cached: true }, cache.payload);

  if (cache.payload) {
    refresh(); // 后台刷新，本次先给旧的
    return Object.assign({ cached: true, stale: true }, cache.payload);
  }

  const payload = await refresh();
  return Object.assign({ cached: false }, payload);
}

module.exports = { getFeed, TTL_MS, _crawl: crawl };
