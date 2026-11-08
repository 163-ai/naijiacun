# 包裹盲盒与 Windows 透明桌宠 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement and review each task.

**Goal:** 落地已批准的包裹盲盒，并提供只显示角色的 Windows 透明置顶桌宠。

**Architecture:** 盲盒沿用现有 DOM 状态机、抽取池与本机记录，仅替换展示层。桌宠使用 Windows 原生分层窗口显示已有全身渲染图，网页按需下载独立便携包。

**Tech Stack:** 原生 HTML/CSS/JavaScript；C#、WinForms、Win32 UpdateLayeredWindow；PNG/WebP。

## Global Constraints

- 保留当前筛选池、等概率、可重复、免费及 localStorage 键。
- 保留上传角色、音频、3D 功能和朋友最新动作提交。
- 不在首页加载 GLB、桌面程序或新增大型运行时。
- 桌宠无背景、无边框、置顶、可拖动、可右键切换及退出；不安装、不自启动。

### Task 1: 包裹盲盒

Files: `index.html`, `js/app.js`, `css/blindbox.css`, `assets/design/parcel-*.webp`。

- [x] 使用已有审阅图制作封闭/打开包裹素材，按需加载。
- [x] 实现待开、摇动、揭晓的全身角色及纸签布局，适配手机及减少动态效果。
- [x] 验证抽取记录、关闭取消、重开、音频入口、详情、键盘焦点与页面宽度。

### Task 2: Windows 透明桌宠

Files: `desktop/windows/*`, `downloads/naijiacun-pet-windows.zip`。

- [x] 基于现有角色 PNG 裁去透明留白，嵌入便携 EXE。
- [x] 原生分层窗口实现透明、置顶、拖动、角色/大小菜单、退出。
- [x] 编译、自测所有角色资源与窗口属性；实际消息循环启动验证可见性和窗口样式，菜单分发及像素命中测试通过。CUA 不枚举工具窗口，未进行真实鼠标拖动和多屏检查。

### Task 3: 网页入口与发布

Files: `pet.html`, `pet3d.html`, `js/pet-page.js`, `css/pet.css`（按需要）。

- [x] 添加 Windows 透明桌宠下载和简短使用说明，原网页画中画标为浏览器小窗。
- [x] 验证下载、桌宠页和 3D 页原功能；审查最小 diff。
- [ ] 同步上游、提交并推送，确认对应 SHA 的 Pages 部署成功（发布流程中核验，不预先声称完成）。

验证：盲盒 23 项交互检查；10 个角色 × 2 个手机宽度完整显示；5 个页面 × 4 档宽度；原生 9 份资源、27 次大小渲染及实际窗口样式；网页下载 ZIP 的 SHA256 与构建产物一致。Windows 便携版使用静态全身渲染，网页聊天、语音和行走仍在网页体验。
