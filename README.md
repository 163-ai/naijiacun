# 奶家村 · 网络热门虚拟形象图鉴

一个关于网络热门虚拟形象（奶龙、奶蛙、卡皮巴拉…）的互动图鉴。纯静态、零依赖，打开浏览器就能用。

全站采用“村口牌坊＋村民名册”主题：首页展示角色全身图，桌宠、3D、聊天和形象总表共用青瓦导航、纸色背景与手机底栏。公共外观在 `css/village.css`，导航与盲盒/设置深链接在 `js/village.js`；主视觉背景位于 `assets/design/`。

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

九位角色的图鉴头像为 `assets/characters/3d/<id>-avatar.webp`，桌宠透明全身图为 `<id>-pet.webp`。`js/data.js` 的 `image` 与 `petImage` 分别引用这两种取景；未设置 `petImage` 的角色仍使用 `image`。聊天头像（含历史消息、等待和错误状态）和盲盒结果也沿用同一份角色数据。

加载资源采用无损压缩：19 张角色图片从 5.65 MB 降至 2.53 MB，九个 GLB 从 96.27 MB 降至 54.97 MB。图片尺寸、透明度与纹理 RGBA 保持一致，几何数据使用 meshopt 保留原精度及索引顺序；本次没有进一步减面或缩小贴图。解码器在 `vendor/meshopt/` 本地提供，压缩统计见 `assets/models/compression.json`。原 PNG 保留供旧缓存与源记录兼容使用。

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

## 语音功能

八个角色的音色**全部在硅基流动（SiliconFlow）**，用 `FunAudioLLM/CosyVoice2-0.5B` 零样本克隆，
音色 id 形如 `speech:naijiacun-小草:xxx:yyy`，写在 `js/data.js` 的 `CHARACTER_VOICES` 里。

访客分三种情况，都不需要装任何东西：

| 访客 | 会听到什么 |
|---|---|
| 什么都不填 | 站点自带转发服务用站长的额度合成（每人每天有上限） |
| 在 🔑 语音设置里填自己的 sk- Key | 无限量，直接浏览器直连硅基流动 |
| 上面都不通 | 退回 `audio/` 里预生成的金句 mp3，再不行用浏览器内置语音 |

三家音色不能混用：音色 id 属于某一家平台，另一家的 Key 取不到它。所以本站只认硅基流动一家。

### 为什么要有转发服务

硅基流动开放了 CORS，浏览器本可直连，但那样必须把 Key 写进前端（右键源码就能看到）。
所以访客没自带 Key 时，请求走 `server/tts-worker.js`（或 `naijiacun-chat-proxy`）转发一层，
Key 留在服务端，并按 IP 限制每日条数，费用可控。

> 注意：`*.workers.dev` 在国内被 DNS 污染，Cloudflare 那条路只适合有自有域名的场景。
> 现在实际用的是 WorkBuddy 托管的 `naijiacun-chat.app.workbuddy.host`（和聊天代理同一个服务）。

### 代理接口一览

两个地方都实现了同一套接口：`server/tts-worker.js`（Cloudflare Worker，需要有自有域名）
和 `~/WorkBuddy/naijiacun-chat-proxy/server.js`（WorkBuddy 托管，线上正在用这个）。

| 路径 | 作用 |
|---|---|
| `POST /api/sf-tts` | 硅基流动合成。访客带了 `x-sf-key` 就用访客的，否则用服务端 `SF_KEY` 并按 IP 每日限量 |
| `POST /api/tts` | 旧：Breeze 转发，保留兼容 |
| `GET /api/check` | 旧：用访客的 Breeze Key 校验并返回额度 |
| `GET /api/voices` | 旧：拉取 Breeze 账号下的音色列表 |

服务端 Key 放环境变量 `SF_KEY`（WorkBuddy 代理里写在 `server.js` 顶部，那个目录在仓库之外，
不要复制进来）；每日上限 `SF_DAILY_LIMIT`，默认 120 条。

### 可选：预生成音频（连代理都不用）

用你自己的 Key 跑一次脚本，把每位人物的金句合成为 mp3 存进 `audio/`，之后**访客连 Key 都不用填**，点开就能听真音色，且零额度消耗。

本地运行：

```bash
SILICONFLOW_API_KEY=sk-xxx node scripts/pregen-audio.mjs --force
# 可选参数：--only=xiaocao,feidudu 只生成几位 / --limit=3 只跑前三位
```

或者在 GitHub 上点一下：仓库 **Actions → 预生成语音 → Run workflow**。使用前先到 Settings → Secrets and variables → Actions 添加 `SILICONFLOW_API_KEY`，生成完会自动提交。

播放优先级（`js/tts.js` 里实现）：

```
访客填了自己的 Key  →  实时调用硅基流动（可换音色、可读长文本）
否则有服务站点的代理 →  Worker/代理转发，用站长的额度（按 IP 限量）
否则有预生成音频    →  播放 audio/{id}.mp3（秒开、免费）
否则               →  浏览器内置语音（永远可用）
```

文本不一致时不会误播（例如预生成的是金句、你想读整段介绍），会自动降级到下一档。

### 每个角色一个专属音色

现在的做法是**克隆真人素材**到硅基流动：把参考音频（5–30 秒、单人说话）和它的逐字文本
一起上传，拿回 `speech:` 开头的音色 id。

```bash
SILICONFLOW_API_KEY=sk-xxx node scripts/clone-siliconflow.mjs --only=xiaocao
SILICONFLOW_API_KEY=sk-xxx node scripts/clone-siliconflow.mjs --list    # 看已上传的
```

参考音频和对应文本统一放在 `voices/reference-texts.json`——**文本必须和音频逐字一致**，
否则克隆会跑偏，所以换素材时一定要重新转写一遍。

下面这段是早期用 Breeze 的「声音设计」路线，保留备查：

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
