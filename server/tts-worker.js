// 奶家村 · Breeze TTS 代理示例（Cloudflare Worker）
// 作用：把 API Key 藏在服务端，前端只调用这个代理，避免密钥泄露。
//
// 部署步骤：
//   1. 安装 wrangler：npm i -g wrangler
//   2. wrangler init naijiacun-tts（选 Worker，纯 JS）
//   3. 把本文件内容粘进 worker 的 src/index.js
//   4. 设置密钥：wrangler secret put BREEZE_API_KEY
//   5. 部署：wrangler deploy
//   6. 把得到的地址填进 js/tts.js 的 CONFIG.endpoint
//
// 注意：下面的接口路径与参数按 Breeze 官方文档（ElevenLabs 兼容风格）编写，
// 接入前请对照 https://docs.breezeblue.ai 核对 voice_id 与 model_id。

const ALLOWED_ORIGIN = "https://163-ai.github.io"; // 生产环境请收紧来源

const CORS = {
  "access-control-allow-origin": ALLOWED_ORIGIN,
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...CORS, "content-type": "application/json" }
      });
    }

    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...CORS, "content-type": "application/json" }
      });
    }

    const text = (payload.text || "").slice(0, 600); // 限制长度，防滥用
    const voiceId = payload.voiceId;
    if (!text || !voiceId) {
      return new Response(JSON.stringify({ error: "text 与 voiceId 必填" }), {
        status: 400,
        headers: { ...CORS, "content-type": "application/json" }
      });
    }

    const upstream = await fetch(
      `https://api.breeze.blue/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": env.BREEZE_API_KEY,
          "content-type": "application/json",
          accept: "audio/mpeg"
        },
        body: JSON.stringify({
          text,
          model_id: env.BREEZE_MODEL || "breeze_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        })
      }
    );

    if (!upstream.ok) {
      const detail = await upstream.text();
      return new Response(
        JSON.stringify({ error: "上游 TTS 失败", status: upstream.status, detail }),
        { status: 502, headers: { ...CORS, "content-type": "application/json" } }
      );
    }

    return new Response(upstream.body, {
      headers: {
        ...CORS,
        "content-type": upstream.headers.get("content-type") || "audio/mpeg",
        "cache-control": "public, max-age=86400"
      }
    });
  }
};
