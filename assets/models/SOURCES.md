# 公开完整 3D 模型来源

本目录仅接入用户选定的奶娃（奶蛙）、奶龙、牛来三位完整模型。模型保持来源文件的造型，没有使用本地简化建模样稿或图片浮雕替代。角色形象权利归相应权利人。

| 角色 | 来源文件与固定版本 | 接入方式 | 使用范围与署名 |
| --- | --- | --- | --- |
| 奶娃 / 奶蛙 | [bigdiu · nailong_colored.blend](https://github.com/bigdiu/naiwa-nailoong-blender-model/blob/82bbeba708861ed55b65372bf561f73ee68cde88/nailong_colored.blend) | 原 Blender 网格与配色导出为 `naiwa.glb`。来源 README 混称“奶龙”，根据预览图对应为奶娃 / 奶蛙。静态模型，无骨骼动作。 | **作者 WeDai，经 bigdiu 分享**。仅学习、练习与非商业使用；保留署名与来源。[原作者说明](https://github.com/bigdiu/naiwa-nailoong-blender-model/tree/82bbeba708861ed55b65372bf561f73ee68cde88#七版权说明)。 |
| 奶龙 | [cowcoming · model.glb](https://github.com/ericshang98/cowcoming/blob/cd1d7774658d2eb9f8aab8bf341165fbfb2d1716/public/characters/nailong/v1/model.glb) | 下载文件保持原字节，保存为 `nailong.glb`。[角色清单](https://github.com/ericshang98/cowcoming/blob/cd1d7774658d2eb9f8aab8bf341165fbfb2d1716/src/ip-catalog.mjs)将该文件对应为奶龙。 | 标注 ericshang98/cowcoming 收录来源。未确认模型单独的开放许可，不将代码许可扩展到模型或角色。 |
| 牛来 | [askuy · niulai.glb](https://github.com/askuy/niulai-site/blob/d2488fb9b2a42f2183bb84752925dd0c8107b752/assets/niulai.glb) | 下载文件保持原字节。原 GLB 含草地、牛妈妈和蛇；网页仅提取 `NIU LAI` 角色子树，Three.js 加载后名为 `NIU_LAI`。 | 标注 askuy/niulai-site 收录来源。来源未说明模型许可；不主张拥有原始角色权利。 |

## 文件检查与显示

- 实际字节数、SHA-256、网格及扩展见 [validation.json](validation.json)。
- 缓冲区与材质包含在 GLB 中，无需运行时请求外站模型或贴图。
- 展台支持旋转、正侧背、缩放、线框与原声；不播放文件内角色动作。
- 牛来保留来源的赭黄 / 棕橙色材质，不按参考图另行重绘。
- 其他角色保留原有图鉴、桌宠和聊天入口，暂不提供完整 3D。

## Three.js

`vendor/three/` 使用 **Three.js 0.180.0**。运行库、GLTFLoader、BufferGeometryUtils 和 MIT 许可来自 [gyz6666/naiwa-static-model 的固定版本](https://github.com/gyz6666/naiwa-static-model/tree/ba57643fd21eb52de1d7fc0181717d5c833ad0ed)，保持原字节。完整软件许可见 `vendor/three/THREE-LICENSE.txt`，软件许可不授予角色或模型的额外使用权。
