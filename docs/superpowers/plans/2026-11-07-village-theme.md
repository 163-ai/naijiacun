# 奶家村全站视觉改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按用户已确认的“村口牌坊＋村民名册”审阅稿，统一五个页面的视觉和移动端布局，并保留原有功能后同步 GitHub。

**Architecture:** 保持静态 HTML/CSS/JS。公共主题与导航集中在 `css/village.css` 和 `js/village.js`，各页面沿用现有 ID 与事件。首页主视觉使用无角色牌坊背景加现有透明全身 PNG，卡片使用 `petImage || image`；数据、声音和 GLB 不改。

**Tech Stack:** 现有 HTML、CSS、原生 JavaScript、Three.js；本地 Playwright 验证。

## Global Constraints

- 不换框架，不新增业务功能，不改变角色数据、模型或音频。
- 保留所有现有 DOM ID、功能事件、提名审核、管理设置、盲盒库存与投票存储。
- 主色奶油纸底 `#f8f2e5`、木红 `#823d2f`、青瓦 `#344f49`、金黄 `#e9bf46`，以现有 CSS 变量兼容原组件。
- 新公共导航由 `js/village.js` 插入，`.village-nav`、`.village-bottom-nav` 为公共组件；移动底栏 68px，正文预留 88px。
- 公共 CSS 最后载入；页面局部样式只作用各自组件，不能影响 `.pet` 引擎变换或 `.p3-stage.in-pip`。
- 所有按钮有可见键盘焦点；手机 360/390/768px 不产生页面横向滚动，表格可在自身容器内滚动。

### Task 1: 公共视觉与首页（root）

**Files:** `index.html`, `js/app.js`, `css/style.css`, 新增 `css/village.css`, `js/village.js`, `assets/design/village-gate.webp`。

- [ ] 生成无文字、无人物的村口背景，叠放现有奶龙/奶蛙/奶察 PNG，牌匾文字用 HTML。
- [ ] 创建公共顶栏、手机菜单/底栏和次级页面页脚；盲盒导航定位现有 `#randomBtn` 功能，设置仍使用原入口。
- [ ] 调整首页首屏、广播、搜索分类与主要玩法入口；保留 `stats/search/chips/sort/grid`。
- [ ] 卡片按大图、类别、名称、介绍、音频、详情与投票分区；长名称不挤占按钮；使用真实分类。
- [ ] 统一弹窗、详情、盲盒、设置与提名的视觉；保留无图角色/用户提名回退。

### Task 2: 桌宠与 3D（独立 agent）

**Files:** `pet.html`, `pet3d.html`, `css/pet.css`, `css/pet3d.css`。

- [ ] 重排简介、选角与操作工具；桌宠舞台为温暖院落，3D 为纸色展台和村民选择侧栏。
- [ ] 保留所有 ID、PiP、拖拽、尺寸、朝向、缩放、线框、音频及聊天功能。
- [ ] 不改引擎 JS；不写公共导航，由 root 接入；适配手机和键盘焦点。

### Task 3: 聊天与总表（独立 agent）

**Files:** `chat.html`, `gallery.html`, `css/chat.css`, `css/gallery.css`。

- [ ] 聊天采用村口茶话会视觉，侧栏、气泡、输入区与设置对话框统一主题。
- [ ] 总表为村民档案，保留真实可导出表格，移动端只在表格内横向滚动。
- [ ] 保留所有 ID、设置项、聊天数据与导出事件；不写公共导航，由 root 接入。

### Task 4: 集成与验证（root）

- [ ] 五页引入主题 CSS/JS，使用一致的缓存版本；检查相互链接与新素材路径。
- [ ] 本地启动静态服务，用 Playwright 检查五页 desktop/mobile、无缺图/JS 错误与键盘导航。
- [ ] 验证搜索/筛选/排序/投票/详情/原声/盲盒/提名设置、桌宠切角与拖动、3D 视角、聊天离线回复/设置、总表 CSV。
- [ ] 截图逐页查看；修复溢出、遮挡和对比度问题，运行 `git diff --check` 和 JS 语法检查。
- [ ] 独立 agent 审阅最终 diff，处理实际问题；正常提交并推送，不强推，保留协作者更新。
- [ ] 检查 Pages 部署状态，向用户提供体验链接和实际页面截图。

## 验证命令

静态检查：`git diff --check`、`node --check js/app.js`、`node --check js/village.js`。

本地预览：沿用 `http://127.0.0.1:8012/naijiacun/`，若未运行则使用另一个空闲端口启动 Python 静态服务。使用工作区外已有 Playwright 工具，测试脚本和截图不写入仓库。
