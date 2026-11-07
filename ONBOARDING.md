# 新人上手指南（从零到第一次提交）

> 你被加成了本仓库的协作者，但电脑上什么都没有——这很正常，**不需要别人传文件给你**。
> 整个项目（6 张形象图、6 段语音 mp3、全部代码）都在 GitHub 上，下面两种方式任选一种把它拿到手。
>
> 仓库地址：https://github.com/163-ai/naijiacun

---

## 先接受邀请

如果你还没接受，打开这个链接点 **Accept invitation**：

https://github.com/163-ai/naijiacun/invitations

（邀请 7 天内有效，过期了让维护者重发一次）

---

## 方式 A：什么都不装，直接在浏览器里改（推荐先试这个）

GitHub 自带一个网页版编辑器，**不用装 Git、不用装编辑器**，改完点一下就提交。

### 步骤

1. 打开仓库 https://github.com/163-ai/naijiacun
2. 把地址栏里的 `github.com` 改成 `github.dev`
   → 变成 `github.dev/163-ai/naijiacun`，回车
3. 你会看到一个类似 VS Code 的界面，左边是文件树
4. 点开 `js/data.js`，找到 `PEOPLE` 数组，在最后一条角色后面加一段（格式见下方「加一个角色」）
5. 按 `Ctrl + S` 保存 → 左侧会提示提交，写一句说明（例如 `新增角色：XXX`）→ 点 **Commit & Push**
6. 回到仓库页面，会看到你的提交已经上去了

> ⚠️ 网页编辑器**不能上传图片**。要加形象图，得用方式 B，或者让维护者帮你放。

### 想更保险：用 Fork + PR

如果你还不想直接动主仓库，就先点右上角 **Fork** 建一份自己的副本，在自己副本里改，改完点 **Contribute → Open pull request** 提交给维护者审核。

---

## 方式 B：下载到本地（要传图片、要本地看效果就走这个）

### 1. 装 Git

- Windows：https://git-scm.com/download/win 下载后一路下一步
- macOS：终端输入 `git --version`，没装会提示你装（或 `brew install git`）

装完打开终端（Windows 用「Git Bash」），输入 `git --version` 能看到版本号就成功了。

### 2. 把仓库整个下载下来

```bash
git clone https://github.com/163-ai/naijiacun.git
cd naijiacun
```

这一步会把**所有文件**拉到本地，包括：

```
naijiacun/
├── index.html            主页面
├── pet.html              桌宠模式
├── gallery.html          形象总表
├── js/data.js            ★ 角色数据都在这里
├── js/app.js             页面逻辑
├── js/tts.js             语音朗读
├── css/                  样式
├── assets/characters/    ★ 角色形象图放这里
├── assets/audio/         原声音轨
├── audio/                预生成的语音 mp3
└── scripts/              批量工具脚本
```

第一次 clone 如果用 HTTPS 卡住或报 443 超时，说明网络需要代理，可以改用 SSH 方式：

```bash
git clone git@github.com:163-ai/naijiacun.git
```

（前提是你 GitHub 账号里配过 SSH Key，配法：https://github.com/settings/keys）

### 3. 本地打开看效果

**不用装任何服务**，直接双击 `index.html` 就能在浏览器里看。

想让效果和线上完全一致（音频清单、跨域行为都对齐），在项目根目录跑：

```bash
python -m http.server 8000
# 然后浏览器打开 http://localhost:8000
```

（没有 Python 的话，装个 Node 用 `npx serve` 也一样）

### 4. 改完提交上去

```bash
git status                      # 看看改了哪些文件
git add -A                      # 把改动都加进来
git commit -m "新增角色：XXX"     # 写清楚改了什么
git pull                        # 先拉一下别人的改动，避免冲突
git push                        # 推上去
```

推上去后 GitHub Pages 会自动重新构建，**几分钟内线上网站就更新了**。

---

## 加一个角色：改哪里、怎么改

所有角色都在 `js/data.js` 的 `PEOPLE` 数组里。复制最后一段，改成新的：

```js
{
  id: "yourid",                            // 英文小写，全站唯一，不能和已有的重名
  name: "角色名",                           // 显示的名字
  emoji: "🐣",                              // 没有图时显示这个
  image: "assets/characters/yourid.png",   // 形象图路径，留空 "" 则用内置矢量形象
  clip: "assets/audio/yourid.mp3",         // 可选：原声片段，没有就留 ""
  category: "抽象迷因",                      // 官方IP / 抽象迷因 / 动物顶流
  title: "一句话称号",                       // 卡片上的副标题
  heat: 1000,                              // 初始热度，随便给
  quote: "最有名的那句梗",                    // 卡片正面显示
  desc: "两三句中性介绍：它是什么、怎么火的、有什么代表作。",
  tags: ["标签1", "标签2"],
  origin: "著作权归 XXX 所有"                 // 必填，写清楚权利归属
}
```

**注意逗号**：新加的这一段结束要有逗号（除非加在最后一条），JSON 格式错一个标点整站就白屏——改完一定要刷新页面确认。

### 放形象图

图片丢进 `assets/characters/`，**文件名必须等于 `id`**：

```
assets/characters/yourid.png
```

建议 500×500 左右、透明底 PNG、单张别超过 500KB（太大加载慢）。

---

## 提交前自查（这几条会被打回）

- ❌ 没有授权的官方立绘、番剧截图、官方海报——不能传
- ❌ `quote` 写成官方台词——那里写的是网络热梗，避免让人误以为是官方设定
- ❌ `desc` 带贬损、引战、人身攻击
- ✅ `origin` 必须填，写清著作权归谁
- ✅ 改完自己本地刷新确认页面正常、控制台没报错（F12 看 Console）

---

## 常见问题

**Q：`git push` 报错 `Authentication failed`？**
GitHub 不再接受账号密码。要去 https://github.com/settings/tokens 生成一个 Personal Access Token（勾 `repo` 权限），推送时用户名填你的 GitHub 用户名、**密码位置粘贴这个 token**。

**Q：报 `Updates were rejected`？**
别人先推了改动。先 `git pull` 再 `git push`。

**Q：改完线上没变化？**
Pages 构建要几分钟。到仓库 **Actions** 标签页看构建状态，绿的等一会儿，红的点进去看报错。

**Q：我把 `data.js` 改坏了，页面白屏？**
`git checkout js/data.js` 可以丢弃这个文件的改动重来。已经提交了就用 `git revert` 或找维护者。

**Q：语音相关的东西我能改吗？**
`js/tts.js` 里是朗读逻辑，`data.js` 底部的 `CHARACTER_VOICES` 是每个角色的音色绑定。**不要提交 `voices/` 目录**（已在 `.gitignore` 里），那里是克隆用的参考音频，属于个人素材。

---

## 卡住了怎么办

- 在仓库开个 Issue 描述问题，维护者会看到
- 或者直接把报错截图发给维护者

不用怕改错——Git 记录了每一次提交，改坏了随时能退回去。
