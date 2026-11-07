// 奶家村 · 预生成语音脚本
// 用你自己的 Breeze Key 把每个人物的金句合成成 mp3，存进 audio/ 目录。
// 生成好之后，访客即使不填任何 Key，也能听到真实音色（走本地 mp3，零额度消耗）。
//
// 用法：
//   BREEZE_API_KEY=brz_xxx BREEZE_VOICE_ID=voc_xxx node scripts/pregen-audio.mjs
//   node scripts/pregen-audio.mjs --force          # 重新生成全部
//   node scripts/pregen-audio.mjs --only=shougeng  # 只生成某一位
//
// 首次使用前先确认音色 ID：GET https://api.breeze.blue/v1/voices

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIO_DIR = path.join(ROOT, "audio");
const MANIFEST = path.join(AUDIO_DIR, "manifest.json");
const DATA_FILE = path.join(ROOT, "js", "data.js");

const API = "https://api.breeze.blue/v1";
const MODEL = "breeze-tts-2";
const OUTPUT_FORMAT = "mp3_24000_96";

// 硅基流动：音色 id 是 speech: 开头的那种
const SF_API = "https://api.siliconflow.cn/v1";
const SF_DEFAULT_MODEL = "FunAudioLLM/CosyVoice2-0.5B";

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const ONLY = (args.find((a) => a.startsWith("--only=")) || "").split("=")[1] || "";
const ONLY_LIST = ONLY ? ONLY.split(",").map((s) => s.trim()).filter(Boolean) : [];
const LIMIT = Number((args.find((a) => a.startsWith("--limit=")) || "").split("=")[1] || 0);

const KEY = process.env.BREEZE_API_KEY || "";
const SF_KEY = process.env.SILICONFLOW_API_KEY || "";
const FALLBACK_VOICE = process.env.BREEZE_VOICE_ID || "";

if (!KEY && !SF_KEY) {
  console.error("缺少环境变量：至少要给 BREEZE_API_KEY 或 SILICONFLOW_API_KEY 其中一个");
  process.exit(1);
}

function loadPeople() {
  const code = fs.readFileSync(DATA_FILE, "utf8");
  // data.js 是给浏览器用的普通脚本，包一层函数取出 PEOPLE 与音色绑定
  return new Function(code + "\nreturn { PEOPLE, CHARACTER_VOICES };")();
}

// 每个角色优先用自己的音色；没绑定就退回环境变量里的默认音色
function voiceOf(id, voices) {
  const cfg = voices && voices[id];
  if (cfg && cfg.voiceId) return cfg.voiceId;
  return FALLBACK_VOICE;
}


function speechTextOf(p) {
  if (p.quote) return p.quote;
  return (p.title ? p.title + "。" : "") + (p.desc || "");
}

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  } catch (e) {
    return {};
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function synthesize(text, voiceId) {
  const res = await fetch(
    API + "/text-to-speech/" + encodeURIComponent(voiceId) + "?output_format=" + OUTPUT_FORMAT,
    {
      method: "POST",
      headers: {
        "xi-api-key": KEY,
        "content-type": "application/json",
        accept: "audio/mpeg"
      },
      body: JSON.stringify({
        text,
        model_id: MODEL,
        language_code: "zh",
        voice_settings: { guidance_scale: 4.0 }
      })
    }
  );

  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch (e) { /* 忽略 */ }
    throw new Error("HTTP " + res.status + " " + detail.slice(0, 200));
  }
  return Buffer.from(await res.arrayBuffer());
}

async function synthesizeSF(text, voiceId, model) {
  if (!SF_KEY) throw new Error("这个角色用的是硅基流动音色，但没设 SILICONFLOW_API_KEY");
  const res = await fetch(SF_API + "/audio/speech", {
    method: "POST",
    headers: {
      authorization: "Bearer " + SF_KEY,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: model || SF_DEFAULT_MODEL,
      input: text,
      voice: voiceId,
      response_format: "mp3",
      speed: 1
    })
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch (e) { /* 忽略 */ }
    throw new Error("HTTP " + res.status + " " + detail.slice(0, 200));
  }
  return Buffer.from(await res.arrayBuffer());
}

function isSFVoice(voiceId) {
  return /^speech:/.test(String(voiceId || ""));
}

async function main() {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const { PEOPLE, CHARACTER_VOICES } = loadPeople();
  const people = PEOPLE.filter((p) => !ONLY_LIST.length || ONLY_LIST.includes(p.id));
  const manifest = readManifest();

  console.log("待处理：" + people.length + " 位（音色按角色分别取用）");

  let done = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;

  for (const p of people) {
    if (LIMIT && processed >= LIMIT) break;
    processed++;

    const text = speechTextOf(p).trim();
    if (!text) {
      skipped++;
      continue;
    }

    const voiceId = voiceOf(p.id, CHARACTER_VOICES);
    if (!voiceId) {
      console.log("跳过 " + p.name + "（没有绑定音色，可先跑 scripts/design-voices.mjs）");
      skipped++;
      continue;
    }

    const fileName = p.id + ".mp3";
    const filePath = path.join(AUDIO_DIR, fileName);
    const old = manifest[p.id];

    if (!FORCE && old && old.text === text && old.voice_id === voiceId && fs.existsSync(filePath)) {
      console.log("跳过 " + p.name + "（已存在且文本、音色都未变）");
      skipped++;
      continue;
    }

    try {
      const sf = isSFVoice(voiceId);
      const model = sf
        ? (CHARACTER_VOICES[p.id] && CHARACTER_VOICES[p.id].voiceModel) || SF_DEFAULT_MODEL
        : MODEL;
      const buf = sf
        ? await synthesizeSF(text, voiceId, model)
        : await synthesize(text, voiceId);
      fs.writeFileSync(filePath, buf);
      manifest[p.id] = {
        file: "audio/" + fileName,
        text,
        voice_id: voiceId,
        model,
        bytes: buf.length,
        generatedAt: new Date().toISOString()
      };
      console.log("完成 " + p.name + "（" + Math.round(buf.length / 1024) + " KB）");
      done++;
    } catch (err) {
      console.error("失败 " + p.name + "：" + err.message);
      failed++;
    }

    await sleep(400); // 稍微放慢，避免并发限流
  }

  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log("\n生成完成：成功 " + done + "，跳过 " + skipped + "，失败 " + failed);
  console.log("清单：" + path.relative(ROOT, MANIFEST));
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
