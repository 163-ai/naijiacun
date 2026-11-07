# 奶家村 · 网络热门虚拟形象图鉴

一个关于网络热门虚拟形象（奶龙、奶蛙、卡皮巴拉…）的互动图鉴。纯静态、零依赖，打开浏览器就能用。

> 🌾 "那些在表情包和短视频里陪你打发过时间的黄色小东西们。"

## 版权声明（重要）

本项目是**非官方、非商业的粉丝向文字整理**：

- 不使用任何官方图片、立绘、视频、音频素材，头像一律用 emoji 代替
- 每个角色在详情页标注「来源与权利归属」，正文是介绍与评论性质
- 角色名称与形象著作权归各自权利人所有；如权利人认为不妥，联系即删
- **不做声音克隆**：不使用、不模仿官方配音，语音只用浏览器音色或平台授权音色

## 功能

- **形象图鉴**：卡片式展示，附一句话称号、热梗和介绍
- **搜索与筛选**：按关键词搜索，按类别（官方IP / 抽象迷因 / 动物顶流）筛选
- **热度投票**：给喜欢的角色顶一票，热度实时上涨（保存在浏览器本地）
- **随机抽取**：选择困难时，让命运决定今天看谁
- **提名新人**：任何人都可以提名新角色加入图鉴（保存在浏览器本地）
- **语音朗读**：点卡片右上角 🔊 听热梗，详情页可朗读整段介绍

## 语音功能（BYOK：访客自带 Key）

默认使用**浏览器内置语音**（`speechSynthesis`），零成本、无需 Key。会自动优选自然音色（Xiaoxiao、Yunxi 等），避开老式机械音；也可以在 🔑 语音设置里手动选音色并试听。

访客想用真实音色时，点页面上的 **🔑 语音设置**，填自己的 Breeze API Key 即可。站长不承担任何费用，也不持有别人的密钥。

### 为什么必须有代理

Breeze 的 API **没有开放 CORS**（实测 `OPTIONS /v1/voices` 返回 405 且无 `Access-Control-Allow-Origin`），浏览器无法直接调用。因此需要一个「只转发、不存 Key」的边缘函数：

```
访客浏览器                你的 Worker                   Breeze
   │  x-breeze-key: brz_xx    │                            │
   ├─────────────────────────►│  xi-api-key: brz_xx        │
   │                          ├───────────────────────────►│
   │      audio/mpeg          │        audio/mpeg          │
   │◄─────────────────────────┤◄───────────────────────────┤
```

Worker 代码在 `server/tts-worker.js`，提供了三个路径：

| 路径 | 作用 |
|---|---|
| `POST /api/tts` | 转发合成请求，返回 mp3 |
| `GET /api/check` | 用访客的 Key 校验有效性并返回剩余额度 |
| `GET /api/voices` | 拉取该 Key 账号下的音色列表 |

### 部署步骤

```bash
npm i -g wrangler
wrangler init naijiacun-tts          # 选 Worker，纯 JS
# 把 server/tts-worker.js 的内容粘进 src/index.js
wrangler deploy
```

把部署得到的地址填到 `js/tts.js` 的 `DEFAULT_TTS_ENDPOINT`（或 `js/app.js` 里的同名常量），访客就只需要填 Key 了。

### 可选：预生成音频（连代理都不用）

用你自己的 Key 跑一次脚本，把每位人物的金句合成为 mp3 存进 `audio/`，之后**访客连 Key 都不用填**，点开就能听真音色，且零额度消耗。

本地运行：

```bash
BREEZE_API_KEY=brz_xxx BREEZE_VOICE_ID=voc_xxx node scripts/pregen-audio.mjs
# 可选参数：--force 全部重生成 / --only=shougeng 只生成一位 / --limit=3
```

或者在 GitHub 上点一下：仓库 **Actions → 预生成语音 → Run workflow**。使用前先到 Settings → Secrets and variables → Actions 添加 `BREEZE_API_KEY` 和 `BREEZE_VOICE_ID`，生成完会自动提交。

播放优先级（`js/tts.js` 里实现）：

```
访客填了自己的 Key  →  实时调用 Breeze（可换音色、可读长文本）
否则有预生成音频    →  播放 audio/{id}.mp3（秒开、免费）
否则               →  浏览器内置语音（永远可用）
```

文本不一致时不会误播（例如预生成的是金句、你想读整段介绍），会自动降级到下一档。

### 安全与合规

- Key 只存在访客自己的 `localStorage` / `sessionStorage`，页面不发送到除代理以外的任何地方。
- 建议提示访客：为这个站点**单独创建一个 Key 并设置额度上限**（Breeze 支持 per-key credit limit），用完即删。
- 克隆真人声音（尤其公众人物）需要本人授权，未经同意切勿用于对外公开的站点。
- 生成内容建议在页面标注"AI 合成语音"，遵循深度合成相关规定。

## 预览方式

直接双击 `index.html` 用浏览器打开即可；或者在本目录启动一个静态服务器：

```bash
# Python
python -m http.server 8080

# Node
npx serve .
```

然后访问 `http://localhost:8080`。

## 项目结构

```
├── index.html      # 页面结构
├── css/style.css   # 样式
└── js/
    ├── data.js     # 人物数据（想增删人物直接改这里）
    └── app.js      # 交互逻辑
```

## 数据说明

- 示例人物由维护者手动整理，介绍文字尽量保持中性、客观，仅供娱乐与图鉴用途。
- 通过"提名新人"添加的人物保存在浏览器 `localStorage` 中，不会同步到服务器。
- 想把提名的村民转正？编辑 `js/data.js` 提交 PR 即可。

## 上线（GitHub Pages）

1. 仓库 Settings → Pages
2. Source 选择 `main` 分支 / `(root)` 目录
3. 稍等片刻，访问 `https://163-ai.github.io/naijacun/`

## 许可

暂未设置许可证，如需允许他人自由使用代码，可添加 MIT License。
