# 奶家村 · 网络热门人物图鉴

一个关于网络热门人物的互动网站。纯静态、零依赖，打开浏览器就能用。

> 🌾 "收录那些陪伴过我们时间线的面孔。"

## 功能

- **人物图鉴**：卡片式展示网络热门人物，附一句话称号、名场面金句和介绍
- **搜索与筛选**：按关键词搜索，按类别（搞笑 / 美食 / 生活 / 科技 / 知识 / 手工）筛选
- **热度投票**：给喜欢的村民顶一票，热度实时上涨（保存在浏览器本地）
- **随机抽取**：选择困难时，让命运决定今天看谁
- **提名新人**：任何人都可以提名新的村民加入图鉴（保存在浏览器本地）
- **语音朗读**：点卡片右上角 🔊 听 TA 说金句，详情页可朗读整段介绍

## 语音功能（BYOK：访客自带 Key）

默认使用**浏览器内置语音**（`speechSynthesis`），零成本、无需 Key，打开就能用。不同人物会根据 id 生成稳定的语速/音调差异。

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
