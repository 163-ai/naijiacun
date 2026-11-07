# 用户提供的九位 3D 模型

2026-11-07 接入用户提供的九份 GLB。输入文件由用户制作、下载并提供，用于本项目展示；文件元数据未说明统一开放许可证，角色形象权利仍归相应权利人。

选择标准是正面特征清楚、身体完整、侧背有体积。含多个视图人物的文件只保留一个完整角色；没有用大头像、其他视图人物或旧模型补造。

网页版本统一为 Y-up、+Z 正面、脚底 0、高 2.2；按需减面至约 10 万三角，并缩放 PBR 贴图以控制加载体积。PNG 头像与桌宠全身图均直接从同一选中模型渲染，不另行绘制。

| 角色 | 输入文件 | 选择 | 网页 GLB | 三角面 |
| --- | --- | --- | ---: | ---: |
| [奶龙](#nailong) | `奶龙.glb` | 左侧完整正面人物，保留原黄色印字服装 | 12.53 MB | 99,999 |
| [奶娃 / 奶蛙](#naiwa) | `奶娃.glb` | 三个独立人物中保留中间白肚皮正面人物 | 13.59 MB | 99,999 |
| [暴暴龙](#baobaolong) | `爆爆龙.glb` | 保留原单角色与蛋壳造型 | 8.87 MB | 100,000 |
| [小七](#xiaoqi) | `小七.glb` | 保留原单角色与红色上衣 | 8.77 MB | 100,000 |
| [牛来](#niulai) | `牛来.glb` | 三个独立人物中保留最左完整正面人物 | 9.91 MB | 100,000 |
| [卡皮巴拉](#capybara) | `卡皮巴拉.glb` | 保留原泡澡水豚与红碗 | 12.49 MB | 99,999 |
| [奶察](#naicha) | `奶察.glb` | 三个视图人物中保留左侧完整正面人物及制服配饰 | 9.60 MB | 17,326 |
| [奶蛋](#naidan) | `奶蛋.glb` | 保留原金色蛋形与无四肢造型 | 9.58 MB | 99,999 |
| [肥嘟嘟袋鼠](#feidudu) | `肥嘟嘟袋鼠.glb` | 从大头像及三只视图人物中仅保留完整正面坐姿小袋鼠 | 10.92 MB | 100,000 |

输入与输出 SHA-256、贴图和图片记录见 [validation.json](validation.json)。原始输入不覆盖，未将整套多人物高模提交到网页。

## 源模型细节

- 牛来、肥嘟嘟的选定正面人物没有明显长尾，保持输入造型。
- 卡皮巴拉保留红碗底座；奶蛋保留源文件的蛋形与无四肢造型。
- 当前模型没有骨骼动画；网页旋转仅用于观察体积。

<a id="nailong"></a>
## 奶龙

输入：`奶龙.glb`；左侧完整正面人物，保留原黄色印字服装。
模型：[nailong.glb](nailong.glb)。图鉴：`assets/characters/3d/nailong-avatar.png`；桌宠：`assets/characters/3d/nailong-pet.png`。

<a id="naiwa"></a>
## 奶娃 / 奶蛙

输入：`奶娃.glb`；三个独立人物中保留中间白肚皮正面人物。
模型：[naiwa.glb](naiwa.glb)。图鉴：`assets/characters/3d/naiwa-avatar.png`；桌宠：`assets/characters/3d/naiwa-pet.png`。

<a id="baobaolong"></a>
## 暴暴龙

输入：`爆爆龙.glb`；保留原单角色与蛋壳造型。
模型：[baobaolong.glb](baobaolong.glb)。图鉴：`assets/characters/3d/baobaolong-avatar.png`；桌宠：`assets/characters/3d/baobaolong-pet.png`。

<a id="xiaoqi"></a>
## 小七

输入：`小七.glb`；保留原单角色与红色上衣。
模型：[xiaoqi.glb](xiaoqi.glb)。图鉴：`assets/characters/3d/xiaoqi-avatar.png`；桌宠：`assets/characters/3d/xiaoqi-pet.png`。

<a id="niulai"></a>
## 牛来

输入：`牛来.glb`；三个独立人物中保留最左完整正面人物。
模型：[niulai.glb](niulai.glb)。图鉴：`assets/characters/3d/niulai-avatar.png`；桌宠：`assets/characters/3d/niulai-pet.png`。

<a id="capybara"></a>
## 卡皮巴拉

输入：`卡皮巴拉.glb`；保留原泡澡水豚与红碗。
模型：[capybara.glb](capybara.glb)。图鉴：`assets/characters/3d/capybara-avatar.png`；桌宠：`assets/characters/3d/capybara-pet.png`。

<a id="naicha"></a>
## 奶察

输入：`奶察.glb`；三个视图人物中保留左侧完整正面人物及制服配饰。
模型：[naicha.glb](naicha.glb)。图鉴：`assets/characters/3d/naicha-avatar.png`；桌宠：`assets/characters/3d/naicha-pet.png`。

<a id="naidan"></a>
## 奶蛋

输入：`奶蛋.glb`；保留原金色蛋形与无四肢造型。
模型：[naidan.glb](naidan.glb)。图鉴：`assets/characters/3d/naidan-avatar.png`；桌宠：`assets/characters/3d/naidan-pet.png`。

<a id="feidudu"></a>
## 肥嘟嘟袋鼠

输入：`肥嘟嘟袋鼠.glb`；从大头像及三只视图人物中仅保留完整正面坐姿小袋鼠。
模型：[feidudu.glb](feidudu.glb)。图鉴：`assets/characters/3d/feidudu-avatar.png`；桌宠：`assets/characters/3d/feidudu-pet.png`。

## Three.js 运行库

`vendor/three/` 使用 Three.js 0.180.0，沿用项目已接入的同版本运行库及 GLTFLoader。软件许可见 `vendor/three/THREE-LICENSE.txt`，不改变角色或模型的使用范围。
