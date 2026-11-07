// 奶家村 · 硅基流动试音脚本
// 用上传好的 speech: 音色合成一句台词，存到 voices/preview/sf-<角色>.mp3，方便对比原声。
//
// 用法：
//   export SILICONFLOW_API_KEY=sk-xxxxxxxx
//   node scripts/tts-test.mjs --only=xiaocao
//   node scripts/tts-test.mjs --all                 # 所有已绑定硅基流动音色的角色
//   node scripts/tts-test.mjs --only=xiaocao --text="随便换一句"

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_FILE = path.join(ROOT, "js", "data.js");
const OUT_DIR = path.join(ROOT, "voices", "preview");

const API = "https://api.siliconflow.cn/v1";
const KEY = process.env.SILICONFLOW_API_KEY || "";
const DEFAULT_MODEL = "FunAudioLLM/CosyVoice2-0.5B";

const args = process.argv.slice(2);
const ONLY = (args.find((a) => a.startsWith("--only=")) || "").split("=")[1] || "";
const TEXT = (args.find((a) => a.startsWith("--text=")) || "").split("=").slice(1).join("=");

function loadPeople() {
  const code = fs.readFileSync(DATA_FILE, "utf8");
  return new Function(code + "\nreturn { PEOPLE, CHARACTER_VOICES };")();
}

async function synth(voice, model, text) {
  const res = await fetch(API + "/audio/speech", {
    method: "POST",
    headers: { authorization: "Bearer " + KEY, "content-type": "application/json" },
    body: JSON.stringify({ model, input: text, voice, response_format: "mp3", speed: 1 })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error("HTTP " + res.status + " " + detail.slice(0, 200));
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  if (!KEY) {
    console.error("缺少环境变量 SILICONFLOW_API_KEY");
    process.exit(1);
  }

  const { PEOPLE, CHARACTER_VOICES } = loadPeople();
  const targets = pickTargets(PEOPLE, CHARACTER_VOICES);
  if (!targets.length) {
    console.log("没有已绑定 speech: 音色的角色，先跑 node scripts/clone-siliconflow.mjs");
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const t of targets) {
    const text = TEXT || t.text;
    process.stdout.write(t.name + "（" + t.id + "）… ");
    try {
      const buf = await synth(t.voiceId, t.model, text);
      const out = path.join(OUT_DIR, "sf-" + t.id + ".mp3");
      fs.writeFileSync(out, buf);
      console.log(Math.round(buf.length / 1024) + " KB → " + path.relative(ROOT, out));
    } catch (e) {
      console.log("失败：" + e.message);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

function pickTargets(PEOPLE, VOICES) {
  return PEOPLE.filter((p) => {
    const cfg = VOICES[p.id] || {};
    if (!/^speech:/.test(String(cfg.voiceId || ""))) return false;
    return ONLY ? p.id === ONLY : true;
  }).map((p) => {
    const cfg = VOICES[p.id];
    return {
      id: p.id,
      name: p.name,
      voiceId: cfg.voiceId,
      model: cfg.voiceModel || DEFAULT_MODEL,
      text: p.quote || p.title || "你好，我是" + p.name + "。"
    };
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
