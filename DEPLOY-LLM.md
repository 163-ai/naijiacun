# 接入真·大模型对话

## 现状：站点已内置代理，访客免配置

站点自带一个对话转发服务（部署在 WorkBuddy 上，地址写在 `js/chat.js` 的
`BUILTIN_PROXY`），智谱的 Key 放在服务端，前端代码里没有密钥。
**访客打开 `chat.html` 或桌宠模式就能直接聊，什么都不用填。**

想管理这个代理服务：WorkBuddy「设置 — 数据管理 — 应用」。
想换模型 / 换 Key：改代理服务目录里的 `server.js` 后重新发布。

## 语音的免费额度（每人 5 句）

访客不填 Key 时，`/api/sf-tts` 用站长的 `SF_KEY` 合成，**每个访客一共 5 句**：

- 前端 `js/tts.js` 用 `localStorage` 的 `naijacun_voice_quota` 记账（含随机访客 ID），
  到 0 就不再请求，直接退回浏览器内置语音，并在聊天页弹提示条引导填自己的 Key。
- 服务端 `server.js` 按请求头 `x-visitor-id` 再卡一道（`FREE_TTS_TOTAL`，默认 5），
  合成成功才扣；同时按 IP 每天兜底 `SF_DAILY_LIMIT`（默认 40）。
- 访客自带 `x-sf-key` 时不计数、不限量。
- 自测想重来：控制台 `NaijiacunTTS.quota.reset()`；服务端重启即可清零内存计数。

改了 `server.js` 必须重新发布代理服务，否则线上还是旧规则（旧版是每 IP 每天 120 句、
没有按访客卡 5 句）。前端改完记得 bump `chat.html` 里的 `?v=`。


> ⚠️ `server.js` 含密钥，它放在站点仓库**之外**的独立目录
> （`~/WorkBuddy/naijiacun-chat-proxy/`），不要复制进仓库提交。

---

## 备选方案 A：访客自备 Key（零部署）

硅基流动、DeepSeek、通义允许浏览器直连（实测预检放行）。
访客在 ⚙️ 设置里选服务商 + 填自己的 Key（只存访客本地浏览器）。

## 备选方案 B：Cloudflare Worker（有自己域名时用）

`server/tts-worker.js` + `wrangler.toml` 已就绪，`npx wrangler deploy` 即可。
但注意：**`*.workers.dev` 域名在国内被 DNS 污染，访客大概率打不开**；
只有把它绑定到你自己的自有域名（Cloudflare 托管 DNS）之后才可用。

## 为什么必须走代理

智谱的接口不允许浏览器直连（实测跨域预检不放行），而 GitHub Pages 是纯静态
站点，Key 也不能写进前端（右键源码就能看到）。所以 Key 必须放在某个服务端。

## 各服务商直连支持（2026-11 实测）

| 服务商 | 免费模型 | 浏览器直连 |
|--------|----------|-----------|
| 智谱 | glm-4-flash 永久免费 | ❌ 预检不放行，必须代理 |
| 硅基流动 | Qwen3-8B 等 | ✅ |
| DeepSeek | — | ✅ |
| 通义百炼 | — | ✅ |
