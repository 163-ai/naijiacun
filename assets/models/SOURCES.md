# 用户提供的九位 3D 模型

2026-11-07 接入用户提供的九份 GLB；2026-11-08 奶龙替换为用户选定并提供的招手笑脸版 3MF。输入文件由用户制作、下载并提供，用于本项目展示；文件元数据未说明统一开放许可证，角色形象权利仍归相应权利人。

选择标准是正面特征清楚、身体完整、侧背有体积。含多个视图人物的文件只保留一个完整角色；没有用大头像、其他视图人物或旧模型补造。

网页展台统一使用 Y-up、+Z 正面并自动适配取景。原有八位保留此前的优化；新奶龙保留原始完整表面及精确涂色细分，仅无损压缩。网页头像与全身图直接从当前选中模型渲染。

| 角色 | 输入文件 | 选择 | 网页 GLB | 三角面 |
| --- | --- | --- | ---: | ---: |
| [奶龙](#nailong) | `result+(2).3mf` | 完整招手笑脸版，保留网格并按确认的参考补色 | 9.56 MB | 460,209 |
| [奶娃 / 奶蛙](#naiwa) | `奶娃.glb` | 三个独立人物中保留中间白肚皮正面人物 | 7.50 MB | 99,999 |
| [暴暴龙](#baobaolong) | `爆爆龙.glb` | 保留原单角色与蛋壳造型 | 5.48 MB | 100,000 |
| [小七](#xiaoqi) | `小七.glb` | 保留原单角色与红色上衣 | 5.41 MB | 100,000 |
| [牛来](#niulai) | `牛来.glb` | 三个独立人物中保留最左完整正面人物 | 6.17 MB | 100,000 |
| [卡皮巴拉](#capybara) | `卡皮巴拉.glb` | 保留原泡澡水豚与红碗 | 6.70 MB | 99,999 |
| [奶察](#naicha) | `奶察.glb` | 三个视图人物中保留左侧完整正面人物及制服配饰 | 5.53 MB | 17,326 |
| [奶蛋](#naidan) | `奶蛋.glb` | 保留原金色蛋形与无四肢造型 | 5.06 MB | 99,999 |
| [肥嘟嘟袋鼠](#feidudu) | `肥嘟嘟袋鼠.glb` | 从大头像及三只视图人物中仅保留完整正面坐姿小袋鼠 | 6.34 MB | 100,000 |

输入与输出 SHA-256、贴图和图片记录见 [validation.json](validation.json)。原始输入不覆盖，未将整套多人物高模提交到网页。

## 源模型细节

- 牛来、肥嘟嘟的选定正面人物没有明显长尾，保持输入造型。
- 卡皮巴拉保留红碗底座；奶蛋保留源文件的蛋形与无四肢造型。
- 当前模型没有骨骼动画；网页旋转仅用于观察体积。

<a id="nailong"></a>
## 奶龙

输入：用户提供的 `result+(2).3mf`。作者为乌鲁鲁，来源：[MakerWorld 奶龙](https://makerworld.com.cn/zh/models/972585-nai-long)；原文件许可证元数据标注 `Standard Digital File License`。

完整保留原始 452,114 个三角表面；为精确复现 BambuStudio 涂色边界，将部分三角形共面细分后得到 460,209 面。200 种涂色编码逐字往返验证、逐原面有向面积守恒检查通过，没有减面、删除人物、重塑网格或使用照片平面。

原打印配色为黄腹、黑眼和灰掌。用户明确批准按07号招手参考图补齐配色：浅色前腹、绿色虹膜与黑瞳、白眼圈、粉掌、棕爪。补色仅改变原网格材质与局部 UV 纹理，顶点、法线字节和有向三角形集合不变，背面保持黄色。颜色纹理均嵌入 GLB，没有外链。

当前模型：[nailong-waving.glb](nailong-waving.glb)。网页头像：`assets/characters/3d/nailong-waving-avatar.webp`；网页全身：`assets/characters/3d/nailong-waving-pet.webp`。同源渲染后以 lossless exact WebP 编码，解码 RGBA 一致；GLB 采用 meshopt filter NONE，无量化，逐缓冲区解码字节一致。

旧奶龙资产作为历史输入保留，当前网页不再加载。Windows 透明桌宠程序和下载 ZIP 按用户要求暂不更新。

<a id="naiwa"></a>
## 奶娃 / 奶蛙

输入：`奶娃.glb`；三个独立人物中保留中间白肚皮正面人物。
模型：[naiwa.glb](naiwa.glb)。图鉴：`assets/characters/3d/naiwa-avatar.webp`；桌宠：`assets/characters/3d/naiwa-pet.webp`。

<a id="baobaolong"></a>
## 暴暴龙

输入：`爆爆龙.glb`；保留原单角色与蛋壳造型。
模型：[baobaolong.glb](baobaolong.glb)。图鉴：`assets/characters/3d/baobaolong-avatar.webp`；桌宠：`assets/characters/3d/baobaolong-pet.webp`。

<a id="xiaoqi"></a>
## 小七

输入：`小七.glb`；保留原单角色与红色上衣。
模型：[xiaoqi.glb](xiaoqi.glb)。图鉴：`assets/characters/3d/xiaoqi-avatar.webp`；桌宠：`assets/characters/3d/xiaoqi-pet.webp`。

<a id="niulai"></a>
## 牛来

输入：`牛来.glb`；三个独立人物中保留最左完整正面人物。
模型：[niulai.glb](niulai.glb)。图鉴：`assets/characters/3d/niulai-avatar.webp`；桌宠：`assets/characters/3d/niulai-pet.webp`。

<a id="capybara"></a>
## 卡皮巴拉

输入：`卡皮巴拉.glb`；保留原泡澡水豚与红碗。
模型：[capybara.glb](capybara.glb)。图鉴：`assets/characters/3d/capybara-avatar.webp`；桌宠：`assets/characters/3d/capybara-pet.webp`。

<a id="naicha"></a>
## 奶察

输入：`奶察.glb`；三个视图人物中保留左侧完整正面人物及制服配饰。
模型：[naicha.glb](naicha.glb)。图鉴：`assets/characters/3d/naicha-avatar.webp`；桌宠：`assets/characters/3d/naicha-pet.webp`。

<a id="naidan"></a>
## 奶蛋

输入：`奶蛋.glb`；保留原金色蛋形与无四肢造型。
模型：[naidan.glb](naidan.glb)。图鉴：`assets/characters/3d/naidan-avatar.webp`；桌宠：`assets/characters/3d/naidan-pet.webp`。

<a id="feidudu"></a>
## 肥嘟嘟袋鼠

输入：`肥嘟嘟袋鼠.glb`；从大头像及三只视图人物中仅保留完整正面坐姿小袋鼠。
模型：[feidudu.glb](feidudu.glb)。图鉴：`assets/characters/3d/feidudu-avatar.webp`；桌宠：`assets/characters/3d/feidudu-pet.webp`。

## Three.js 运行库

`vendor/three/` 使用 Three.js 0.180.0，沿用项目已接入的同版本运行库及 GLTFLoader。软件许可见 `vendor/three/THREE-LICENSE.txt`，不改变角色或模型的使用范围。

## 无损加载压缩

在原网页模型上仅进行精确无损 WebP 纹理编码和 meshopt 几何压缩，未再次减面、量化或缩小贴图。纹理 RGBA 和解码后的几何字节均已校验一致。解码器位于 `vendor/meshopt/`，MIT 许可；不依赖外部 CDN。平面 WebP 与保留的 PNG 解码像素完全相同。
