# 接入真·大模型对话（智谱 GLM-4-Flash，免费）

本站是纯静态页面，Key 不能写进前端。想让所有访客免配置直接聊，
需要把 `server/tts-worker.js` 部署成一个 Cloudflare Worker（免费），
全程在浏览器里点，不需要命令行，大约 3 分钟。

## 第 1 步：拿智谱 Key（免费，手机号注册）

1. 打开 <https://open.bigmodel.cn>，手机号注册 / 登录
2. 控制台 → 左侧「API 密钥」→ 创建 API Key
3. 复制那串 Key（形如 `a1b2c3….xxxxxxxx`）

GLM-4-Flash 模型**永久免费**，聊天场景额度完全够用。

## 第 2 步：部署 Worker（网页操作，不用装任何东西）

1. 打开 <https://dash.cloudflare.com> 注册（邮箱即可）
2. 左侧「Workers & Pages」→「Create」→「Create Worker」→ 起个名（如 `naijiacun`）→ Deploy
3. 部署完点「Edit code」，**全选删除**示例代码，把本仓库
   `server/tts-worker.js` 的全部内容粘贴进去 → 右上「Deploy」
4. 回到 Worker 页 →「Settings」→「Variables and Secrets」→ 添加：

   | 类型 | 名字 | 值 |
   |------|------|----|
   | Secret | `LLM_KEY` | 第 1 步的智谱 Key |
   | Variable | `LLM_BASE` | `https://open.bigmodel.cn/api/paas/v4` |
   | Variable | `LLM_MODEL` | `glm-4-flash` |

   （后两项代码里已内置，不填也行；填了以这里为准）
5. 记下你的 Worker 地址：`https://naijiacun.<你的子域>.workers.dev`

## 第 3 步：站点里填一次（或者让访客自己填）

聊天页右上 ⚙️ 设置：

- 服务商：智谱 GLM-4-Flash（默认，会自动切到「走我的代理」）
- Worker 地址：填第 2 步的 workers.dev 地址
- API Key：可以留空（Key 已在 Worker 里）

保存后即刻生效，`chat.html`、桌宠页、图鉴页的语音共用这套配置。

> 自己本地试：接入方式选「浏览器直连」+ 填智谱 Key 是**连不通的**——
> 智谱的跨域预检不放行浏览器（实测 OPTIONS 无 `Access-Control-Allow-Origin`），
> 必须走 Worker。这是安全设计，不是 bug。

## 为什么这样安全

- Key 只存在 Cloudflare 的环境变量里，前端代码、浏览器里都看不到
- Worker 只允许来自本站域名的请求（`ORIGIN_PATTERNS`），别人蹭不了
- 对话内容不落盘，Worker 只做转发

## 换模型

想换成别的服务商，只需改 Worker 的环境变量（前端不用动）：

| 服务商 | LLM_BASE | LLM_MODEL | 直连 |
|--------|----------|-----------|------|
| 智谱（默认） | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` | ❌ 需代理 |
| 硅基流动（免费） | `https://api.siliconflow.cn/v1` | `Qwen/Qwen3-8B` | ✅ 可直连 |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | ✅ 可直连 |
| 通义百炼 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | ✅ 可直连 |

硅基流动、DeepSeek、通义允许浏览器直连：不想部署 Worker 的话，
访客可以在设置里选这些服务商 + 自己填 Key（Key 存访客自己的浏览器）。
