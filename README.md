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

## 语音功能

默认使用**浏览器内置语音**（`speechSynthesis`），零成本、无需 Key，打开就能用。不同人物会根据 id 生成稳定的语速/音调差异。

### 接入 Breeze TTS（音色库 / 声音克隆）

前端代码是公开的，**绝不能把 API Key 写进 `js/tts.js`**。两条可行路线：

| 方案 | 做法 | 适用 |
|---|---|---|
| 服务端代理 | 部署 `server/tts-worker.js` 到 Cloudflare Worker，Key 存在 Worker 环境变量里，前端只调代理 | 需要"点一下就合成"的实时体验 |
| 预生成音频 | 本地跑 Breeze 批量合成，把 mp3 放进 `audio/` 目录，前端直接播放 | 朗读内容固定（金句、介绍），零运行时成本、最稳 |

切换方式：编辑 `js/tts.js` 顶部的 `CONFIG`：

```js
var CONFIG = {
  provider: "breeze",                                  // 从 browser 改成 breeze
  endpoint: "https://你的worker地址/api/tts",
  voices: { "shougeng": "breeze_voice_id_xxx" },        // 人物 id → 音色 ID
  defaultVoiceId: "breeze_voice_id_default"
};
```

### 合规提醒

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
