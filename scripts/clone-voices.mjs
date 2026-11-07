#!/usr/bin/env node
// 奶家村 · 音色克隆脚本
//
// 作用：把 voices/ 目录里准备好的参考音频，逐个提交给 Breeze 克隆成专属音色，
//      并把返回的 voice_id 自动写回 js/data.js 的 CHARACTER_VOICES。
//
// 用法：
//   1. 把参考音频放进 voices/，文件名用角色 id：
//        voices/nailong.mp3   voices/naiwa.mp3   ...
//      （支持 mp3 / wav / m4a / ogg / webm，建议 10~30 秒干净人声）
//   2. 运行：
//        TTS_ENDPOINT=https://你的worker地址 BREEZE_API_KEY=brz_xxx node scripts/clone-voices.mjs
//   3. 加 --only=nailong 可只处理一个，加 --dry-run 只看会做什么，不真的调用接口
//
// 重要：只有你拥有合法使用权的音频才适合上传。克隆真人（尤其配音演员）的声音，
//      需要本人书面授权；比赛演示建议用授权音色库里的音色，或按 CHARACTER_VOICES
//      里的 style 描述做「声音设计」，生成全新音色，不指向具体的人。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_FILE = path.join(ROOT, "js", "data.js");
const VOICE_DIR = path.join(ROOT, "voices");

const ENDPOINT = (process.env.TTS_ENDPOINT || "").replace(/\/$/, "");
const API_KEY = process.env.BREEZE_API_KEY || "";
const DRY = process.argv.includes("--dry-run");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1] || "";

const AUDIO_EXT = [".mp3", ".wav", ".m4a", ".ogg", ".webm", ".flac"];

function loadData() {
  const code = fs.readFileSync(DATA_FILE, "utf8");
  return new Function(code + "\nreturn { PEOPLE, CHARACTER_VOICES };")();
}

function readStyleBlock() {
  const code = fs.readFileSync(DATA_FILE, "utf8");
  const hit = code.match(/const CHARACTER_VOICES = \{[\s\S]*?\n\};/);
  return { code, block: hit ? hit[0] : "" };
}

// 把某个角色的 voiceId 写回 data.js（只改那一行，保持格式不变）
function writeVoiceId(id, voiceId) {
  const { code, block } = readStyleBlock();
  if (!block) throw new Error("在 js/data.js 里找不到 CHARACTER_VOICES 配置块");

  const lines = block.split("\n");
  let changed = false;
  const next = lines.map((line) => {
    if (!new RegExp(`^\\s{2}${id}:`).test(line)) return line;
    changed = true;
    return line.replace(/voiceId:\s*"[^"]*"/, `voiceId: "${voiceId}"`);
  });

  if (!changed) throw new Error(`CHARACTER_VOICES 里没有 ${id} 这一项`);

  fs.writeFileSync(DATA_FILE, code.replace(block, next.join("\n")), "utf8");
}

function findAudio(id) {
  if (!fs.existsSync(VOICE_DIR)) return null;
  for (const ext of AUDIO_EXT) {
    const p = path.join(VOICE_DIR, id + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function cloneOne(id, file, style) {
  const buf = fs.readFileSync(file);
  const form = new FormData();
  form.append("name", `njc-${id}`);
  if (style) form.append("description", style);
  form.append("file", new Blob([buf]), path.basename(file));

  const res = await fetch(ENDPOINT + "/api/clone", {
    method: "POST",
    headers: { "x-breeze-key": API_KEY },
    body: form
  });

  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`返回的不是 JSON（HTTP ${res.status}）：${text.slice(0, 200)}`);
  }

  if (!res.ok || data.ok === false) {
    const detail = data.detail || data.message || `HTTP ${res.status}`;
    throw new Error(typeof detail === "string" ? detail.slice(0, 240) : JSON.stringify(detail).slice(0, 240));
  }

  const voiceId = data.voice_id || data.id || (data.voice && data.voice.voice_id);
  if (!voiceId) throw new Error("接口没有返回 voice_id：" + JSON.stringify(data).slice(0, 200));
  return voiceId;
}

async function main() {
  const { PEOPLE, CHARACTER_VOICES } = loadData();

  if (!DRY) {
    if (!ENDPOINT) {
      console.error("✗ 缺少 TTS_ENDPOINT（你的 Worker 地址，例如 https://naijiacun-tts.xxx.workers.dev）");
      process.exit(1);
    }
    if (!API_KEY) {
      console.error("✗ 缺少 BREEZE_API_KEY（brz_ 开头的 Key）");
      process.exit(1);
    }
  }

  const targets = PEOPLE.filter((p) => !ONLY || p.id === ONLY);
  if (!targets.length) {
    console.error(`✗ 没有匹配的角色：${ONLY}`);
    process.exit(1);
  }

  console.log(`待处理 ${targets.length} 位角色 | 目录 ${path.relative(ROOT, VOICE_DIR)}`);
  console.log("");

  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const p of targets) {
    const cur = CHARACTER_VOICES[p.id] || {};
    const style = cur.style || "";
    const audio = findAudio(p.id);

    if (!audio) {
      console.log(`· ${p.name.padEnd(6)} 跳过：voices/${p.id}.mp3 不存在`);
      skip++;
      continue;
    }

    if (DRY) {
      console.log(`· ${p.name.padEnd(6)} 会克隆 ${path.basename(audio)} → ${ENDPOINT}/api/clone`);
      continue;
    }

    process.stdout.write(`· ${p.name.padEnd(6)} 克隆中… `);
    try {
      const voiceId = await cloneOne(p.id, audio, style);
      writeVoiceId(p.id, voiceId);
      console.log(`完成 → ${voiceId}`);
      ok++;
    } catch (err) {
      console.log(`失败：${err.message}`);
      fail++;
    }
  }

  console.log("");
  console.log(`结果：成功 ${ok}，跳过 ${skip}，失败 ${fail}`);
  if (ok) console.log("js/data.js 已更新，直接刷新网页就能听到对应音色。");
  if (fail) console.log("失败的多为 Key 权限或音频格式问题，确认后重跑即可（已成功的不会重复处理）。");
}

main().catch((err) => {
  console.error("✗ " + err.message);
  process.exit(1);
});
