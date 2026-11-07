// 按 MP3 帧边界切割：不解码、不重编码，纯字节级裁剪
import fs from "node:fs";

const [src, dst, startSecArg] = process.argv.slice(2);
const startSec = parseFloat(startSecArg || "0");
const buf = fs.readFileSync(src);

// 跳过 ID3v2 头
let pos = 0;
if (buf.slice(0, 3).toString("latin1") === "ID3") {
  const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
  pos = 10 + size;
  console.log(`跳过 ID3v2 头 ${size} 字节`);
}

const BR_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]; // kbps
const SR_V1 = [44100, 48000, 32000, 0];

let t = 0, cutAt = -1, frames = 0, sampleRate = 44100, bitrate = 0;

while (pos + 4 <= buf.length) {
  if (buf[pos] !== 0xff || (buf[pos + 1] & 0xe0) !== 0xe0) { pos++; continue; }
  const versionBits = (buf[pos + 1] >> 3) & 0x03; // 3 = MPEG1
  const layerBits = (buf[pos + 1] >> 1) & 0x03;   // 1 = Layer III
  if (versionBits !== 3 || layerBits !== 1) { pos++; continue; }

  const brIdx = (buf[pos + 2] >> 4) & 0x0f;
  const srIdx = (buf[pos + 2] >> 2) & 0x03;
  const pad = (buf[pos + 2] >> 1) & 0x01;
  bitrate = BR_V1_L3[brIdx] * 1000;
  sampleRate = SR_V1[srIdx];
  if (!bitrate || !sampleRate) { pos++; continue; }

  const frameLen = Math.floor((144 * bitrate) / sampleRate) + pad;
  if (cutAt < 0 && t >= startSec) cutAt = pos;
  t += 1152 / sampleRate;
  frames++;
  pos += frameLen;
}

if (cutAt < 0) cutAt = 0;
fs.writeFileSync(dst, buf.slice(cutAt));
console.log(`总帧 ${frames} | 总时长 ${t.toFixed(2)}s | ${bitrate / 1000}kbps ${sampleRate}Hz`);
console.log(`从 ${startSec}s 处切割 → 保留 ${(t - startSec).toFixed(2)}s | 输出 ${dst} (${(fs.statSync(dst).size / 1024).toFixed(0)}KB)`);
