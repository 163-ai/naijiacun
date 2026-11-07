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

// 允许的来源：形如 https://xxx.github.io、https://xxx.workbuddy.link，以及本地调试
// 代理本身不存任何密钥，放宽来源不会泄露什么；如想收紧，把 PATTERNS 改成精确域名即可。
const ORIGIN_PATTERNS = [
  /^https:\/\/[\w-]+\.github\.io$/,
  /^https:\/\/[\w-]+\.workbuddy\.link$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
];

// ---------- 观众提名队列（KV） ----------
// 流程：访客 POST /api/nominate → 存入 KV 待审列表；
//       管理面板 GET /api/nominations（需仓库写权限的 GitHub Token）看队列；
//       通过 → 由前端直接用 GitHub Contents API 把村民写进 js/data.js（与删除同一路径），
//       随后 POST /api/nominations/decide 把该条移出队列。
// KV 绑定名：NOMINATIONS（见 wrangler.toml）。
const NOM_REPO = "163-ai/naijiacun";
const NOM_PENDING_KEY = "noms:pending";
const NOM_APPROVED_KEY = "noms:approved";
const NOM_MAX_PENDING = 50;
const NOM_RATE_MS = 60 * 60 * 1000; // 同一 IP 一小时一条

function nomSanitize(body) {
  if (!body || typeof body !== "object") return null;
  const name = String(body.name || "").trim().slice(0, 20);
  if (!name) return null;
  const clean = (v, n) => String(v || "").trim().slice(0, n);
  return {
    id: "nom-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: name,
    emoji: clean(body.emoji, 8) || "🙂",
    category: clean(body.category, 12) || "其他",
    title: clean(body.title, 30),
    quote: clean(body.quote, 80),
    desc: clean(body.desc, 200) || "这位村民由观众提名，介绍待补充。",
    submitter: clean(body.submitter, 24),
    status: "pending",
    created: new Date().toISOString()
  };
}

async function nomReadList(env, key) {
  const raw = await env.NOMINATIONS.get(key);
  try { const list = JSON.parse(raw || "[]"); return Array.isArray(list) ? list : []; }
  catch (e) { return []; }
}

// 校验 GitHub Token 是否对本仓库有写权限（协作者校验交给 GitHub，Worker 不存任何名单）
async function nomCheckPush(token, env) {
  const base = String((env && env.GH_BASE) || "https://api.github.com").replace(/\/+$/, "");
  try {
    const res = await fetch(base + "/repos/" + NOM_REPO, {
      headers: {
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github+json",
        "User-Agent": "naijiacun-worker"
      }
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!(data && data.permissions && data.permissions.push);
  } catch (e) { return false; }
}

async function nomGuard(request, env, origin) {
  const token = request.headers.get("x-gh-token") || "";
  if (!token) {
    return json({ ok: false, code: "NO_TOKEN", detail: "缺少 x-gh-token 请求头" }, 401, origin);
  }
  const ok = await nomCheckPush(token, env);
  if (!ok) {
    return json({ ok: false, code: "FORBIDDEN", detail: "该 Token 没有 " + NOM_REPO + " 的写权限" }, 403, origin);
  }
  return null;
}

async function handleNominate(request, env, origin) {
  if (!env || !env.NOMINATIONS) {
    return json({ ok: false, code: "NO_KV", detail: "Worker 未绑定 KV（NOMINATIONS）" }, 500, origin);
  }
  let body;
  try { body = await request.json(); }
  catch (e) { return json({ ok: false, code: "BAD_JSON", detail: "请求体不是合法 JSON" }, 400, origin); }

  const item = nomSanitize(body);
  if (!item) {
    return json({ ok: false, code: "NO_NAME", detail: "请填写村民名字" }, 400, origin);
  }

  // 频率限制：同一 IP 一小时一条（可用环境变量 NOM_RATE_MS 覆盖，0 = 关闭）
  const rateMs = Number(env && env.NOM_RATE_MS);
  const rate = Number.isFinite(rateMs) && rateMs >= 0 ? rateMs : NOM_RATE_MS;
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const rlKey = "rl:" + ip;
  const last = Number(await env.NOMINATIONS.get(rlKey) || 0);
  const now = Date.now();
  if (rate > 0 && last && now - last < rate) {
    const mins = Math.ceil((rate - (now - last)) / 60000);
    return json({ ok: false, code: "TOO_OFTEN", detail: "你刚提名过啦，请 " + mins + " 分钟后再试" }, 429, origin);
  }

  const pending = await nomReadList(env, NOM_PENDING_KEY);
  if (pending.length >= NOM_MAX_PENDING) {
    return json({ ok: false, code: "FULL", detail: "待审提名已满，管理员处理后再来吧" }, 503, origin);
  }
  if (pending.some((p) => p.name === item.name)) {
    return json({ ok: false, code: "DUP", detail: "已经有同名的村民在等待审核了" }, 409, origin);
  }

  pending.push(item);
  await env.NOMINATIONS.put(NOM_PENDING_KEY, JSON.stringify(pending));
  await env.NOMINATIONS.put(rlKey, String(now), { expirationTtl: 3700 });
  return json({ ok: true, id: item.id, detail: "提名已提交，管理员通过后全站可见" }, 200, origin);
}

async function handleNomList(request, env, origin) {
  const denied = await nomGuard(request, env, origin);
  if (denied) return denied;
  const pending = await nomReadList(env, NOM_PENDING_KEY);
  return json({ ok: true, items: pending }, 200, origin);
}

async function handleNomDecide(request, env, origin) {
  const denied = await nomGuard(request, env, origin);
  if (denied) return denied;
  if (request.method !== "POST") {
    return json({ ok: false, code: "BAD_METHOD", detail: "请用 POST" }, 405, origin);
  }
  let body;
  try { body = await request.json(); }
  catch (e) { return json({ ok: false, code: "BAD_JSON", detail: "请求体不是合法 JSON" }, 400, origin); }

  const id = String(body.id || "");
  const action = String(body.action || "");
  if (!id || (action !== "approve" && action !== "reject")) {
    return json({ ok: false, code: "BAD_PARAM", detail: "需要 id 与 action（approve/reject）" }, 400, origin);
  }

  const pending = await nomReadList(env, NOM_PENDING_KEY);
  const at = pending.findIndex((p) => p.id === id);
  if (at === -1) {
    return json({ ok: false, code: "NOT_FOUND", detail: "这条提名不在待审列表里（可能已被处理）" }, 404, origin);
  }
  const item = pending.splice(at, 1)[0];

  if (action === "approve") {
    // 通过：由前端负责写仓库；这里只做记录与出队
    item.status = "approved";
    item.decidedAt = new Date().toISOString();
    const approved = await nomReadList(env, NOM_APPROVED_KEY);
    approved.unshift(item);
    await env.NOMINATIONS.put(NOM_APPROVED_KEY, JSON.stringify(approved.slice(0, 100)));
  } else {
    item.status = "rejected";
    item.decidedAt = new Date().toISOString();
    const rejected = await nomReadList(env, "noms:rejected");
    rejected.unshift(item);
    await env.NOMINATIONS.put("noms:rejected", JSON.stringify(rejected.slice(0, 100)));
  }
  await env.NOMINATIONS.put(NOM_PENDING_KEY, JSON.stringify(pending));
  return json({ ok: true }, 200, origin);
}

const API_BASE = "https://api.breeze.blue/v1";
const MODEL_ID = "breeze-tts-2";

// 聊天接口的上游（OpenAI 兼容）。默认走智谱 GLM-4-Flash（永久免费）。
// 部署时用环境变量覆盖，不要把 Key 写进代码：
//   wrangler secret put LLM_KEY      ← 你自己申请的大模型 Key
//   wrangler secret put LLM_BASE     ← 例如 https://open.bigmodel.cn/api/paas/v4
//   wrangler secret put LLM_MODEL    ← 例如 glm-4-flash
//
// 为什么必须走 Worker：智谱的跨域预检（OPTIONS）不返回 Access-Control-Allow-Origin，
// 浏览器直连会被拦。Worker 在服务端转发，既绕开跨域，也把 Key 藏在服务端。
const LLM_BASE = "https://open.bigmodel.cn/api/paas/v4";
const LLM_MODEL = "glm-4-flash";

function corsHeaders(origin) {
  const allow = ORIGIN_PATTERNS.some((re) => re.test(origin)) ? origin : "null";
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-breeze-key, x-llm-key, x-gh-token",
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

// ---------- 聊天转发（OpenAI 兼容） ----------
// 只做「拼 Key + 转发」，支持流式（SSE）原样透传，不记录对话内容。
async function handleChat(request, env, origin) {
  if (request.method !== "POST") {
    return json({ ok: false, code: "BAD_METHOD", detail: "请用 POST" }, 405, origin);
  }

  const key = request.headers.get("x-llm-key") || (env && env.LLM_KEY) || "";
  if (!key) {
    return json({
      ok: false,
      code: "NO_KEY",
      detail: "缺少 x-llm-key，且 Worker 没有配置 LLM_KEY 环境变量"
    }, 401, origin);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, code: "BAD_JSON", detail: "请求体不是合法 JSON" }, 400, origin);
  }

  const base = String((env && env.LLM_BASE) || LLM_BASE).replace(/\/+$/, "");
  const model = body.model || (env && env.LLM_MODEL) || LLM_MODEL;
  const stream = !!body.stream;

  const messages = Array.isArray(body.messages)
    ? body.messages.slice(-20).map((m) => ({
        role: m && m.role === "assistant" ? "assistant" : (m && m.role === "system" ? "system" : "user"),
        content: String((m && m.content) || "").slice(0, 2000)
      }))
    : [];

  if (!messages.length) {
    return json({ ok: false, code: "NO_MESSAGE", detail: "messages 不能为空" }, 400, origin);
  }

  const upstream = await fetch(base + "/chat/completions", {
    method: "POST",
    headers: {
      authorization: "Bearer " + key,
      "content-type": "application/json",
      accept: stream ? "text/event-stream" : "application/json"
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: typeof body.temperature === "number" ? body.temperature : 0.85,
      max_tokens: Math.min(Number(body.max_tokens) || 220, 512),
      stream: stream
    })
  });

  if (!upstream.ok) {
    let detail = "";
    try {
      detail = await upstream.text();
    } catch (e) { /* 忽略 */ }
    return json({
      ok: false,
      code: "UPSTREAM_ERROR",
      status: upstream.status,
      detail: detail.slice(0, 400)
    }, upstream.status === 429 ? 429 : 502, origin);
  }

  return new Response(upstream.body, {
    headers: {
      ...corsHeaders(origin),
      "content-type": upstream.headers.get("content-type") ||
        (stream ? "text/event-stream" : "application/json"),
      "cache-control": "no-store"
    }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);

    // 聊天转发：Key 优先用访客自带的 x-llm-key，其次用 Worker 环境变量 LLM_KEY
    if (url.pathname === "/api/chat") {
      return handleChat(request, env, origin);
    }

    // 观众提名队列
    if (url.pathname === "/api/nominate") {
      return handleNominate(request, env, origin);
    }
    if (url.pathname === "/api/nominations") {
      return handleNomList(request, env, origin);
    }
    if (url.pathname === "/api/nominations/decide") {
      return handleNomDecide(request, env, origin);
    }

    const key = request.headers.get("x-breeze-key") || "";
    if (!key) {
      return json({ ok: false, code: "NO_KEY", detail: "缺少 x-breeze-key 请求头" }, 401, origin);
    }

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
    } else if (url.pathname === "/api/clone") {
      if (request.method !== "POST") {
        return json({ ok: false, code: "BAD_METHOD", detail: "请用 POST" }, 405, origin);
      }
      let form;
      try {
        form = await request.formData();
      } catch (e) {
        return json({ ok: false, code: "BAD_FORM", detail: "请用 multipart/form-data 上传" }, 400, origin);
      }
      const file = form.get("file");
      if (!file || typeof file === "string") {
        return json({ ok: false, code: "MISSING_FILE", detail: "缺少参考音频 file 字段" }, 400, origin);
      }
      if (file.size > 8 * 1024 * 1024) {
        return json({ ok: false, code: "FILE_TOO_LARGE", detail: "参考音频请控制在 8MB 以内" }, 413, origin);
      }
      const upForm = new FormData();
      upForm.append("name", String(form.get("name") || "naijiacun-voice").slice(0, 60));
      if (form.get("description")) {
        upForm.append("description", String(form.get("description")).slice(0, 300));
      }
      upForm.append("files", file, file.name || "sample.mp3");
      target = API_BASE + "/voices/add";
      init = { method: "POST", headers: upstreamHeaders, body: upForm };
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
