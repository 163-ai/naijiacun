// 奶家村 · 用硅基流动（SiliconFlow）克隆音色
//
// 和 Breeze 的区别：硅基流动不限制「私人音色槽位」，上传多少都行，
// 代价是要实名认证，并且上传时必须提供参考音频的逐字文本。
//
// 用法：
//   export SILICONFLOW_API_KEY=sk-xxxxxxxx
//   node scripts/clone-siliconflow.mjs --list            # 看已经上传过哪些音色
//   node scripts/clone-siliconflow.mjs --only=xiaocao    # 上传某个角色的参考音频
//   node scripts/clone-siliconflow.mjs --only=xiaocao --dry-run   # 只检查材料，不请求
//   node scripts/clone-siliconflow.mjs --only=xiaocao --no-write  # 上传但不改 data.js
//
// 参考音频与对应文本放在 voices/reference-texts.json，格式见文件里的注释。
// 上传成功后返回的 uri 形如 speech:naijiacun-xiaocao:xxx:yyy，
// 脚本会把它写回 js/data.js 的 CHARACTER_VOICES[id].voiceId，并补上 voiceModel。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_FILE = path.join(ROOT, "js", "data.js");
const REF_FILE = path.join(ROOT, "voices", "reference-texts.json");
const VOICE_DIR = path.join(ROOT, "voices");

const API = "https://api.siliconflow.cn/v1";
const KEY = process.env.SILICONFLOW_API_KEY || "";
const DEFAULT_MODEL = "FunAudioLLM/CosyVoice2-0.5B";

const args = process.argv.slice(2);
const ONLY = (args.find((a) => a.startsWith("--only=")) || "").split("=")[1] || "";
const DRY = args.includes("--dry-run");
const NO_WRITE = args.includes("--no-write");
const LIST = args.includes("--list");

function die(msg) {
  console.error("\n✖ " + msg + "\n");
  process.exit(1);
}

function loadRefs() {
  if (!fs.existsSync(REF_FILE)) die("找不到 " + REF_FILE);
  try {
    return JSON.parse(fs.readFileSync(REF_FILE, "utf8"));
  } catch (e) {
    die("reference-texts.json 不是合法 JSON：" + e.message);
  }
}

function loadData() {
  const code = fs.readFileSync(DATA_FILE, "utf8");
  return new Function(code + "\nreturn { PEOPLE, CHARACTER_VOICES };")();
}

// 把 uri 写回 data.js 里对应角色的 voiceId，并补一行 voiceModel
function writeVoice(id, uri, model) {
  let code = fs.readFileSync(DATA_FILE, "utf8");
  const blockRe = new RegExp("(\\n  " + id + ": \\{[\\s\\S]*?\\n  \\})");
  const hit = code.match(blockRe);
  if (!hit) die("data.js 里找不到角色 " + id + " 的音色配置块");

  let block = hit[1];
  if (/voiceId:\s*"[^"]*"/.test(block)) {
    block = block.replace(/voiceId:\s*"[^"]*"/, 'voiceId: "' + uri + '"');
  } else {
    block = block.replace(/\{/, '{\n    voiceId: "' + uri + '",');
  }
  if (/voiceModel:/.test(block)) {
    block = block.replace(/voiceModel:\s*"[^"]*"/, 'voiceModel: "' + model + '"');
  } else {
    block = block.replace(/(voiceId:\s*"[^"]*",)/, '$1\n    voiceModel: "' + model + '",');
  }

  code = code.replace(hit[1], block);
  fs.writeFileSync(DATA_FILE, code, "utf8");
}

async function api(pathname, init) {
  const res = await fetch(API + pathname, {
    ...init,
    headers: { authorization: "Bearer " + KEY, ...(init && init.headers) }
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch (e) { /* 可能是纯文本 */ }
  return { ok: res.ok, status: res.status, body, text };
}

function explain(status, body, text) {
  const msg = (body && (body.message || body.detail || body.error)) || text || "";
  if (status === 401) return "Key 无效，检查 SILICONFLOW_API_KEY 是否复制完整";
  if (status === 403) return "被拒绝（403）。多半是账号没做实名认证，用户预置音色必须实名后才能上传";
  if (status === 404) return "接口不存在（404）：" + msg;
  if (status === 429) return "触发限流（429），稍等再试：" + msg;
  if (status === 400) return "参数不对（400）：" + msg;
  return "HTTP " + status + "：" + msg;
}

async function listVoices() {
  const r = await api("/audio/voice/list", { method: "GET" });
  if (!r.ok) die(explain(r.status, r.body, r.text));
  const arr = (r.body && (r.body.result || r.body.results || r.body.data || r.body.voices)) || [];
  if (!arr.length) {
    console.log("（账号下还没有上传过自定义音色）");
    return;
  }
  console.log("账号下共 " + arr.length + " 个自定义音色：\n");
  for (const v of arr) {
    console.log("  " + (v.uri || v.id) + "  ←  " + (v.customName || v.name || v.title || "?"));
  }
  console.log();
}

async function uploadOne(id, ref) {
  const file = path.resolve(ROOT, ref.file || path.join("voices", id + ".mp3"));
  if (!fs.existsSync(file)) die("参考音频不存在：" + file);

  const text = String(ref.text || "").trim();
  if (!text) die(id + " 缺少 text（参考音频的逐字文本），硅基流动上传时必须提供");

  const customName = String(ref.customName || ("naijiacun-" + id)).slice(0, 40);
  const model = ref.model || DEFAULT_MODEL;
  const buf = fs.readFileSync(file);
  const seconds = ref.seconds || 0;

  console.log("── " + id + " ─────────────────────────────");
  console.log("  文件    " + path.relative(ROOT, file) + "（" + (buf.length / 1024).toFixed(0) + " KB" +
    (seconds ? " / " + seconds + "s" : "") + "）");
  console.log("  名称    " + customName);
  console.log("  模型    " + model);
  console.log("  文本    " + text);

  if (DRY) {
    console.log("  （--dry-run：没有发起请求）\n");
    return null;
  }

  const form = new FormData();
  form.append("file", new Blob([buf], { type: "audio/mpeg" }), path.basename(file));
  form.append("model", model);
  form.append("customName", customName);
  form.append("text", text);

  const r = await api("/uploads/audio/voice", { method: "POST", body: form, headers: {} });
  if (!r.ok) die(explain(r.status, r.body, r.text));

  const uri = (r.body && r.body.uri) || "";
  if (!uri) die("上传返回里没有 uri：" + r.text.slice(0, 300));

  console.log("  ✔ uri   " + uri);
  if (!NO_WRITE) {
    writeVoice(id, uri, model);
    console.log("  ✔ 已写入 js/data.js");
  }
  console.log();
  return uri;
}

async function main() {
  if (!KEY && !DRY) die("缺少环境变量 SILICONFLOW_API_KEY（控制台 https://cloud.siliconflow.cn/account/ak）");

  if (LIST) {
    await listVoices();
    return;
  }

  const refs = loadRefs();
  const wanted = ONLY ? ONLY.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const ids = wanted.length ? wanted : Object.keys(refs);
  if (wanted.length) {
    const missing = wanted.filter((id) => !refs[id]);
    if (missing.length) die("reference-texts.json 里没有：" + missing.join(", "));
  }

  const { CHARACTER_VOICES } = loadData();
  const targets = ids.filter((id) => {
    if (refs[id].skip) {
      console.log("（跳过 " + id + "：" + refs[id].skip + "）");
      return false;
    }
    if (!CHARACTER_VOICES[id]) console.log("（注意：" + id + " 在 data.js 里还没有音色配置块，将不会写回）");
    return true;
  });

  console.log("\n准备上传 " + targets.length + " 个音色到硅基流动\n");
  const done = [];
  for (const id of targets) {
    const uri = await uploadOne(id, refs[id]);
    if (uri) done.push({ id, uri });
  }

  if (done.length && !DRY && !NO_WRITE) {
    console.log("完成。下一步：");
    console.log("  1) 试听：node scripts/tts-test.mjs --only=" + done[0].id);
    console.log("  2) 预生成固定台词：SILICONFLOW_API_KEY=... node scripts/pregen-audio.mjs --only=" +
      done.map((d) => d.id).join(","));
  }
}

main().catch((e) => die(e && e.stack ? e.stack : String(e)));
