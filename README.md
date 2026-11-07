# 奶家村 · 网络热门虚拟形象图鉴

一个关于网络热门虚拟形象（奶龙、奶蛙、卡皮巴拉…）的互动图鉴。纯静态、零依赖，打开浏览器就能用。

> 🌾 "那些在表情包和短视频里陪你打发过时间的黄色小东西们。"

## 版权声明（重要）

本项目是**非官方、非商业的粉丝向文字整理**：

- 仓库默认不内置任何形象图、原声音轨或克隆音色；`assets/` 里的素材由使用者自行放入，版权归各自权利人所有
- 每个角色在详情页标注「来源与权利归属」，正文是介绍与评论性质
- 角色名称与形象著作权归各自权利人所有；如权利人认为不妥，联系即删
- **声音克隆由使用者自行决定并承担相应责任**：克隆真人（尤其是配音演员、公众人物）需要本人书面授权；`scripts/clone-voices.mjs` 只是工具，不会自动抓取任何素材

## 功能

- **形象图鉴**：卡片式展示，附一句话称号、热梗和介绍
- **搜索与筛选**：按关键词搜索，按类别（官方IP / 抽象迷因 / 动物顶流）筛选
- **热度投票**：给喜欢的角色顶一票，热度实时上涨（保存在浏览器本地）
- **随机抽取**：选择困难时，让命运决定今天看谁
- **提名新人**：任何人都可以提名新角色加入图鉴（保存在浏览器本地）
- **语音朗读**：点卡片右上角 🔊 用角色音色朗读热梗，🎵 播放该角色自带的原声片段，详情页可朗读整段介绍
- **桌宠模式**：`pet.html` 里角色会自己走动、打瞌睡、被拖动、点一下说话；带 2.5D 立体感和「置顶小窗」（Edge / Chrome 116+），能浮在其他窗口上面
- **3D 形象展台**：`pet3d.html` 展示九位角色的用户提供模型，支持 360° 旋转、正侧背视角、缩放和线框；图鉴头像与桌宠全身图从同一模型渲染
- **和村民聊两句**：`chat.html` 挑一个角色像微信一样一问一答；桌宠模式下也能直接在底部输入框里跟它说话，回复会弹在宠物头上并用它的音色念出来。接大模型 API（OpenAI 兼容接口），没配 Key 时用内置话术兜底；对话只存在本地浏览器

## 桌宠模式怎么用

打开 `pet.html`（或从图鉴页点 **🐾 桌宠模式**）：

- **点它**：说一句自己的热梗（配了音色就跟着朗读）
- **拖它**：抓起来放到舞台任意位置
- **不动它**：走一会儿就会睡着，冒 z Z；动一下鼠标或再点它就醒
- **置顶小窗**：点「📌 置顶小窗」会用浏览器的 Document Picture-in-Picture 开一个始终置顶的小窗，桌宠搬进去后，你切到别的窗口它也一直在。关掉小窗它会自动回到页面
- **🧊 立体感**：默认开启。移动鼠标角色会转头看你，拖起来会离地、影子跟着放大偏移；再点一次按钮切回平面观感

### 关于 2.5D

用的是**纯 CSS 3D transform**，没有 WebGL、没有第三方库，也**没有生成或修改任何形象素材**：把原有 PNG 沿 Z 轴复制 3 份暗层，转头时露出"厚度"，正面看仍是原图。所以 6 个角色自动全部生效，置顶小窗里也能跑（纯 CSS 不受 PiP 的 rAF 节流影响）。

DOM 分层由外到内：`.pet`（JS 控制位移）→ `.pet-inner`（走路起伏/拖动倾斜）→ `.pet-body`（朝向、呼吸、视角变量）→ `.pet-depth`（3D 变换层）。这样新效果不会和已有的 `translate3d`、`--facing` 打架。

想调效果：`js/pet.js` 里 `_onGazeMove` 的角度上限（27° / 15°）、`_tick` 里的插值系数 `0.075`；`css/pet.css` 里 `.pet-slab--b1..b3` 的 `translateZ` 决定厚度，`.pet-rim` 决定高光。

实现细节：引擎在 `js/pet.js`（不依赖任何库），页面控制逻辑在 `js/pet-page.js`，样式在 `css/pet.css`。语音配置与主站共用同一份 `localStorage`（`naijacun_tts`），在图鉴页填过 Key 的桌宠直接就能用真音色。

## 3D 形象展台（完整模型）

首页点击 **🌀 3D 展台**，或打开 `pet3d.html`。目前接入用户提供的九位模型：**奶娃（奶蛙）、奶龙、暴暴龙、小七、牛来、卡皮巴拉、奶察、奶蛋、肥嘟嘟袋鼠**。小草保留原有形象与功能，暂不提供完整 3D 模型。

- 按住拖动旋转，滚轮缩放，双击或点击「复位视角」恢复。
- 点击「正面 / 侧面 / 背面」切换方向，也可自动转一圈观察。
- 保留线框、原声和支持浏览器中的置顶小窗功能。

模型文件保存在 `assets/models/`，配置在 `js/3d-models.js`。多形象源文件只保留选中的完整角色，统一朝向、居中落地，并做适合网页的减面与贴图缩放，保留用户提供的造型和配色。Three.js 0.180.0 和 GLTFLoader 保存在 `vendor/three/`，运行时按需读取本地 GLB，不依赖外部 CDN。

九位角色的图鉴头像为 `assets/characters/3d/<id>-avatar.png`，桌宠透明全身图为 `<id>-pet.png`。`js/data.js` 的 `image` 与 `petImage` 分别引用这两种取景；未设置 `petImage` 的角色仍使用 `image`。聊天头像和盲盒结果也沿用同一份角色数据。

本页使用 ES Modules 和模型请求，**本地预览需要 HTTP 服务**，不能直接双击文件打开：

```bash
python -m http.server 8000 --bind 127.0.0.1
# 打开 http://127.0.0.1:8000/pet3d.html
```

各模型的输入文件、筛选记录、哈希与处理信息见 [模型来源](assets/models/SOURCES.md)。页面会显示当前模型出处。当前九位均为静态模型；旋转观察不代表已完成动作绑定。

## 和村民聊两句（角色聊天）

入口：图鉴页「💬 和村民聊两句」，或直接开 `chat.html`；桌宠页底部也有一个输入条，回复直接从宠物头顶的气泡说出来。

- 每个角色有一份「网友二创玩梗版」的人设（`js/data.js` 里的 `CHAT_PERSONA`），只描述语气习惯，不编造官方剧情。
- 回复来自任意 **OpenAI 兼容**的大模型接口：点聊天页右上角「⚙️ 设置」，选服务商（DeepSeek / 通义 / 智谱 / 硅基流动 / Kimi / OpenAI）、填 Key 即可。
- **Key 只存在访客自己的浏览器里**。想不让 Key 出现在浏览器，就选「走我的代理」并部署 `server/tts-worker.js`（见下），然后把 Worker 地址填进「接口地址」。
- **没配 Key 也能玩**：每个角色内置了几句兜底话术，页面不会报错白屏。
- 朗读走主站同一套语音系统：填了 Breeze Key 用克隆音色，没填用浏览器语音。
- 对话记录只保存在本地 `localStorage`，每个角色独立，可一键清空。

### Worker 部署补充（聊天转发）

```bash
wrangler secret put LLM_KEY     # 你的大模型 Key（可选：不配则要求访客自带）
wrangler secret put LLM_BASE    # 可选，默认 https://api.deepseek.com/v1
wrangler secret put LLM_MODEL   # 可选，默认 deepseek-chat
```

部署后聊天页「接入方式」选「走我的代理」，接口地址填 Worker 根地址。代理按 OpenAI 兼容格式原样转发，支持流式输出，不存储任何对话内容。

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

### 每个角色一个专属音色

`js/data.js` 末尾的 `CHARACTER_VOICES` 保存"角色 → 音色"的绑定：

```js
nailong: {
  voiceId: "",                       // 绑定后由脚本自动写入
  style: "软萌的小童声，圆润鼻音，语速偏慢，句尾带笑，像在撒娇",
  gender: "female", age: "child", tone: ["gentle", "playful"], accent: null,
  rate: 0.9, pitch: 1.4              // 没有 Key 时浏览器语音的语速/音高
}
```

- `voiceId` 有值 → 点 🔊 就用这个音色（优先于默认音色）
- 为空 → 用默认音色；连默认都没有则退回浏览器语音
- `rate` / `pitch` 只影响浏览器语音，让六个角色在没填 Key 时也能听出差别
  （例如奶龙是女声、音高 1.4、语速 0.9；暴暴龙是男声、音高 0.7、语速 1.1）

**路线 A：声音设计（推荐，只要一个 Key，不用准备音频）**

```bash
BREEZE_API_KEY=brz_xxx node scripts/design-voices.mjs
# --only=nailong 只做一位 / --preview=2 取第二个候选 / --force 已有音色也重建
```

按每个角色的 `style` 描述生成全新音色 → 保存为私人音色 → 自动把 `voice_id` 写回 `js/data.js`。
试听音频会存到 `voices/preview/{id}.mp3`，先听再决定要不要换一版。因为不采样任何真人，这条路没有声音权益问题。

**路线 B：克隆自己的参考音频**

```bash
# 参考音频放进 voices/，文件名 = 角色 id，例如 voices/nailong.mp3（10~30 秒干净人声）
BREEZE_API_KEY=brz_xxx node scripts/clone-voices.mjs
# 想走自己的代理再加 TTS_ENDPOINT=https://你的worker地址，不填就是直连 Breeze
```

脚本直接把参考音频 `POST /v1/voices/add`，拿到 `voice_id` 后自动写回 `js/data.js`。
Node 没有跨域限制，所以**这条路不需要部署代理**，只要有 Key 就能跑。
`voices/` 已加入 `.gitignore`，参考音频不会推到公开仓库。

注意：克隆效果取决于参考音频质量。笑声、歌曲、多人对话、带背景音乐的音轨会被直接拒绝
（接口返回 `No clear speech was detected`），建议用 10~30 秒、单人、无背景音乐的说话片段。

另外账号有**可保存音色槽位上限**（免费额度实测 5 个），满了会返回
`No remaining saved voice slots`。两种解法：删掉不用的音色腾位置，或者把某个角色直接指向
音色库里现成的音色（`voiceId` 填任意一个 `voc_xxx` 即可，不占槽位）。

**想让网站彻底不依赖 Key：把音色合成为本地 mp3**

```bash
BREEZE_API_KEY=brz_xxx node scripts/pregen-audio.mjs
```

会按每个角色自己的音色逐句合成到 `audio/`，之后打开网页点 🔊 直接播本地文件——不需要 Key、不需要代理、零额度消耗。

### 安全与合规

- Key 只存在访客自己的 `localStorage` / `sessionStorage`，页面不发送到除代理以外的任何地方。
- 建议提示访客：为这个站点**单独创建一个 Key 并设置额度上限**（Breeze 支持 per-key credit limit），用完即删。
- 克隆真人声音（尤其配音演员、公众人物）需要本人授权。《民法典》第 1023 条把声音按肖像权保护，《深度合成管理规定》要求编辑生物识别信息取得**单独同意**。
- 非商业用途（比赛、课程作业、个人演示）风险显著低于商用，但"公开可访问"仍属于公开传播，标注清楚来源与"AI 合成"字样仍然是必要的。
- 生成内容建议在页面标注"AI 合成语音"，遵循深度合成相关规定。

## 一起做（多人协作）

三种参与深度，按需选：

| 方式 | 适合谁 | 怎么参与 |
|---|---|---|
| 提想法 / 提角色 | 不会写代码 | 开 Issue，用「提名一个新角色」表单 |
| 改内容 | 会改文字 | Fork → 改 `js/data.js` → 提 PR |
| 改代码 | 长期合作 | 加为 Collaborator（Settings → Collaborators） |

详细步骤写在 [CONTRIBUTING.md](CONTRIBUTING.md)，里面有加角色要填的字段、图片放哪、以及会被打回的情况。
仓库里还放了 Issue 与 PR 模板，别人一进来就知道该填什么。

**刚被加进来、本地什么都没有的人看这里 → [ONBOARDING.md](ONBOARDING.md)**
从接受邀请、`git clone` 把仓库拉到本地、本地预览、到第一次提交推送，完整走一遍；也提供了「什么都不装、直接用浏览器改」的零门槛路线。

> 站内的「➕ 提名」按钮只写浏览器本地存储，别人看不到；要真正收集投稿，走 Issue 表单，或者接一个后端（云数据库）。

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
├── index.html                # 页面结构
├── chat.html                 # 和村民聊两句（角色聊天页）
├── css/style.css             # 样式
├── css/chat.css              # 聊天页样式
├── js/
│   ├── data.js               # 角色数据 + 音色绑定 + 聊天人设（想增删角色直接改这里）
│   ├── avatars.js            # 内置原创 SVG 形象（没有图片时的默认头像）
│   ├── tts.js                # 语音适配层（Key / 预生成 / 浏览器 三档降级）
│   ├── chat.js               # 聊天引擎 + 聊天页（桌宠页复用同一个引擎）
│   └── app.js                # 交互逻辑
├── assets/characters/        # 放你自己的角色形象图（见目录内 README）
├── scripts/
│   ├── pregen-audio.mjs      # 批量预生成 mp3
│   ├── design-voices.mjs     # 按文字描述生成音色并回写
│   └── clone-voices.mjs      # 克隆音色并回写 voiceId
├── server/tts-worker.js      # Cloudflare Worker 透传代理（TTS + 聊天，不存任何密钥）
└── voices/                   # 参考音频（默认不进版本库，见 voices/README.md）
```

## 换成自己的形象图

默认头像是 `js/avatars.js` 里的内置 SVG。想换成图片，把文件放进 `assets/characters/`，然后给 `js/data.js` 里对应角色填上 `image`：

```js
{
  id: "nailong",
  name: "奶龙",
  image: "assets/characters/nailong.png",   // 留空则用内置 SVG
  ...
}
```

图片建议正方形、400px 以上、单张 300KB 以内（页面用 `object-fit: cover` 圆形裁切）。放什么图由你自己决定——详细说明见 `assets/characters/README.md`。

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
