# Windows 透明桌宠

原生 C# / WinForms 便携桌宠，默认奶龙。窗口只绘制角色 PNG 的有效像素：无背景、无边框、置顶、不显示任务栏按钮，按住角色拖动，右键切换九位角色、三档尺寸或退出。透明区域穿透鼠标点击，尺寸随显示器 DPI 缩放。

运行 `dist/NaijiacunPet.exe`，或解压仓库 `downloads/naijiacun-pet-windows.zip`。适用系统自带 .NET Framework 4.x 的 Windows 10 / 11，无安装、管理员权限、联网、注册表或开机启动操作。图像是项目现有的静态全身渲染，暂不包含网页的走路、聊天和语音。

## 构建和验证

在 Windows PowerShell 或 PowerShell 7 中执行：

```powershell
& .\desktop\windows\build.ps1
```

构建脚本使用 Windows 自带的 .NET Framework `csc.exe`，逐张读取 `assets/characters/3d/*-pet.png`，按非零 alpha 的包围框裁边并嵌入单个 EXE；不会改写源图。中间文件位于 `build/`，EXE 位于 `dist/`，下载包仅包含 EXE 和中文使用说明。不打包浏览器或额外运行时。

```powershell
& .\desktop\windows\verify.ps1
```

验证会通过 `/self-test` 创建并销毁隐藏原生窗口，检查九份资源的 alpha 裁边、27 次尺寸渲染与分层窗口上传、预乘 alpha、透明/实体像素命中测试、角色/尺寸菜单，以及实际的无边框、置顶、工具窗与不激活样式；再校验 ZIP 中的 EXE 哈希。不启动可见桌宠或留下进程。运行时使用 `UpdateLayeredWindow` 与 32 位预乘 alpha DIB。

需人工检查的项目：不同显示器上的拖动、透明区域点击穿透、菜单视觉以及在其他窗口上方的实际显示。跨显示器时按该屏幕 DPI 重新渲染，拖动结束会将角色约束在当前屏幕工作区。

本程序未做代码签名，Windows 可能显示来源提示。版权归属沿用项目说明。
