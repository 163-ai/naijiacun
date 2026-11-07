// 奶家村 · Breeze TTS 透传代理（Cloudflare Worker）
// 设计要点：服务端不保存任何密钥。访客自带 API Key，放在 x-breeze-key 请求头里，
// 本代理只做「加 CORS + 转发」，因此站长无需为访客的用量付费，也不承担密钥泄露风险。
//
// 部署：
//   1. npm i -g wrangler
//   2. wrangler init naijiacun-tts    （选 Worker，纯 JS）
//   3. 把本文件内容粘进 src/index.js
//   4. wrangler deploy
//   5. 把部署得到的地址填进 js/tts.js 的 CONFIG.endpoint，或直接在网页「语音设置」里填
//
// 注意：Breeze 未开放 CORS，所以这一步无法省略；但代理里没有任何 secret。

const ALLOWED_ORIGINS = [
  "https://163-ai.github.io",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
];

const API_BASE = "https://api.breeze.blue/v1";
const MODEL_ID = "breeze-tts-2";

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-breeze-key",
    "access-control-max-age": "86400",
    vary: "origin"
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { ...corsHeaders(origin), "content-type": "application/json" }
  });
}

export default {
  async fetch(request) {
    const origin = request.headers.get("origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    const key = request.headers.get("x-breeze-key") || "";
    if (!key) {
      return json({ ok: false, code: "NO_KEY", detail: "缺少 x-breeze-key 请求头" }, 401, origin);
    }

    const url = new URL(request.url);
    const upstreamHeaders = { "xi-api-key": key };
    let target = "";
    let init = { method: "GET", headers: upstreamHeaders };

    if (url.pathname === "/api/check") {
      target = API_BASE + "/api-keys/current";
    } else if (url.pathname === "/api/voices") {
      target = API_BASE + "/voices?page_size=50";
    } else if (url.pathname === "/api/tts") {
      if (request.method !== "POST") {
        return json({ ok: false, code: "BAD_METHOD", detail: "请用 POST" }, 405, origin);
      }
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ ok: false, code: "BAD_JSON", detail: "请求体不是合法 JSON" }, 400, origin);
      }
      const text = String(body.text || "").slice(0, 800);
      const voiceId = body.voiceId || "";
      if (!text || !voiceId) {
        return json({ ok: false, code: "MISSING_PARAM", detail: "text 与 voiceId 必填" }, 400, origin);
      }
      target =
        API_BASE +
        "/text-to-speech/" +
        encodeURIComponent(voiceId) +
        "?output_format=mp3";
      init = {
        method: "POST",
        headers: { ...upstreamHeaders, "content-type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify({
          text: text,
          model_id: body.modelId || MODEL_ID,
          language_code: "zh",
          instructions: body.instructions || undefined,
          voice_settings: { guidance_scale: 4.0 }
        })
      };
    } else {
      return json({ ok: false, code: "NOT_FOUND", detail: "未知路径" }, 404, origin);
    }

    const upstream = await fetch(target, init);

    if (!upstream.ok) {
      let detail = "";
      try {
        detail = await upstream.text();
      } catch (e) { /* 忽略 */ }
      return json(
        { ok: false, code: "UPSTREAM_ERROR", status: upstream.status, detail: detail.slice(0, 500) },
        502,
        origin
      );
    }

    if (url.pathname === "/api/tts") {
      return new Response(upstream.body, {
        headers: {
          ...corsHeaders(origin),
          "content-type": upstream.headers.get("content-type") || "audio/mpeg",
          "cache-control": "no-store"
        }
      });
    }

    return new Response(upstream.body, {
      headers: { ...corsHeaders(origin), "content-type": "application/json" }
    });
  }
};
