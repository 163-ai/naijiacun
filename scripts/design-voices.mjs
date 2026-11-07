#!/usr/bin/env node
// 奶家村 · 声音设计脚本（无需参考音频，只要一个 Key）
//
// 作用：按 js/data.js 里每个角色的 style 描述，用 Breeze「声音设计」生成一个全新音色，
//      保存成私人音色，并把 voice_id 自动写回 CHARACTER_VOICES。
//
// 为什么用声音设计而不是克隆：
//   - 不需要你准备任何音频，一条命令跑完 6 个角色
//   - 生成的是全新音色，不采样任何真人，不会有声音权益问题
//
// 用法：
//   BREEZE_API_KEY=brz_xxx node scripts/design-voices.mjs
//   BREEZE_API_KEY=brz_xxx node scripts/design-voices.mjs --only=nailong
//   BREEZE_API_KEY=brz_xxx node scripts/design-voices.mjs --preview=1 --force
//
// 参数：
//   --only=id     只处理某个角色
//   --preview=n   取第 n 个候选（1~3，默认 1）
//   --force       已有 voiceId 也重新生成
//   --dry-run     只打印计划，不调用接口

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_FILE = path.join(ROOT, "js", "data.js");
const PREVIEW_DIR = path.join(ROOT, "voices", "preview");

const API = "https://api.breeze.blue/v1";
const KEY = process.env.BREEZE_API_KEY || "";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const FORCE = args.includes("--force");
const ONLY = (args.find((a) => a.startsWith("--only=")) || "").split("=")[1] || "";
const PICK = Math.min(3, Math.max(1, Number((args.find((a) => a.startsWith("--preview=")) || "").split("=")[1] || 1)));

function loadData() {
  const code = fs.readFileSync(DATA_FILE, "utf8");
  return new Function(code + "\nreturn { PEOPLE, CHARACTER_VOICES };")();
}

// 只改目标角色那一项的 voiceId，其余内容原样保留
function writeVoiceId(id, voiceId) {
  const code = fs.readFileSync(DATA_FILE, "utf8");
  const re = new RegExp(`(\\n\\s{2}${id}:\\s*\\{[\\s\\S]*?voiceId:\\s*")[^"]*(")`);
  if (!re.test(code)) throw new Error(`js/data.js 里找不到 ${id} 的 voiceId 字段`);
  fs.writeFileSync(DATA_FILE, code.replace(re, `$1${voiceId}$2`), "utf8");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function call(pathname, body, attempt = 1) {
  const res = await fetch(API + pathname, {
    method: "POST",
    headers: { "xi-api-key": KEY, "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    throw new Error(`返回不是 JSON（HTTP ${res.status}）：${text.slice(0, 160)}`);
  }

  if (res.status === 429 && attempt <= 2) {
    const wait = Number(res.headers.get("retry-after") || 5);
    console.log(`  限流，等待 ${wait}s 重试…`);
    await sleep(wait * 1000);
    return call(pathname, body, attempt + 1);
  }

  if (!res.ok) {
    const detail = data.detail || data.error || `HTTP ${res.status}`;
    const code = data.code ? `[${data.code}] ` : "";
    throw new Error(code + String(detail).slice(0, 200));
  }
  return data;
}

async function designOne(person, cfg) {
  const previewText = (person.quote || person.title || person.name).slice(0, 120);

  const designed = await call("/voice-previews/design", {
    voice_description: cfg.style,
    text: previewText,
    language_code: "zh",
    guidance_scale: 4.0,
    preview_count: Math.max(PICK, 1)
  });

  const list = designed.previews || [];
  if (!list.length) throw new Error("接口没有返回任何音色预览");
  const preview = list[Math.min(PICK, list.length) - 1];

  // 顺手把试听音频存下来，方便先听再决定要不要留
  if (preview.audio_base_64) {
    fs.mkdirSync(PREVIEW_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(PREVIEW_DIR, person.id + ".mp3"),
      Buffer.from(preview.audio_base_64, "base64")
    );
  }

  const saved = await call(`/voice-previews/${encodeURIComponent(preview.generated_voice_id)}/save`, {
    voice_name: `奶家村-${person.name}`,
    voice_description: cfg.style,
    language_code: "zh",
    gender: cfg.gender || null,
    age: cfg.age || null,
    tone: Array.isArray(cfg.tone) ? cfg.tone.slice(0, 3) : [],
    accent: cfg.accent || null,
    tags: ["naijiacun", person.id]
  });

  if (!saved.voice_id) throw new Error("保存成功但没有返回 voice_id");
  return saved;
}

async function main() {
  const { PEOPLE, CHARACTER_VOICES } = loadData();

  if (!DRY && !KEY) {
    console.error("✗ 缺少环境变量 BREEZE_API_KEY（brz_ 开头）");
    process.exit(1);
  }

  const targets = PEOPLE.filter((p) => !ONLY || p.id === ONLY);
  if (!targets.length) {
    console.error(`✗ 没有匹配的角色：${ONLY}`);
    process.exit(1);
  }

  console.log(`声音设计｜待处理 ${targets.length} 位｜候选序号 ${PICK}${FORCE ? "｜强制重建" : ""}\n`);

  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const p of targets) {
    const cfg = CHARACTER_VOICES[p.id];
    if (!cfg || !cfg.style) {
      console.log(`· ${p.name.padEnd(6)} 跳过：CHARACTER_VOICES 里没有 style 描述`);
      skip++;
      continue;
    }
    if (cfg.voiceId && !FORCE) {
      console.log(`· ${p.name.padEnd(6)} 跳过：已有音色 ${cfg.voiceId}（加 --force 可重建）`);
      skip++;
      continue;
    }

    if (DRY) {
      console.log(`· ${p.name.padEnd(6)} 会设计：${cfg.style}`);
      continue;
    }

    process.stdout.write(`· ${p.name.padEnd(6)} 设计中… `);
    try {
      const voice = await designOne(p, cfg);
      writeVoiceId(p.id, voice.voice_id);
      console.log(`完成 → ${voice.voice_id}`);
      ok++;
    } catch (err) {
      console.log(`失败：${err.message}`);
      fail++;
    }

    await sleep(600);
  }

  console.log("");
  if (DRY) return;
  console.log(`结果：成功 ${ok}，跳过 ${skip}，失败 ${fail}`);
  if (ok) {
    console.log("js/data.js 已更新；试听音频在 voices/preview/。");
    console.log("想让访客不填 Key 也能听到，接着跑：BREEZE_API_KEY=brz_xxx node scripts/pregen-audio.mjs");
  }
  if (fail) process.exitCode = 1;
}

main().catch((err) => {
  console.error("✗ " + err.message);
  process.exit(1);
});
