# 小草透明 2D 素材

- 输入：`assets/characters/xiaocao.png`（504 × 522）；原图未修改。
- 输出：`assets/characters/xiaocao-cutout.webp`（600 × 622，272,462 字节，RGBA lossless WebP）。
- 工具：内置 image_gen，`transparent_background: true`；2026-11-08。
- 用途：浏览器宠物中只有 2D 半身图的小草。保留现有半身裁切，不补全身体或腿。
- 后处理：仅用 Pillow 等比例缩放为 600 像素宽并无损编码 WebP；未用代码抠图。WebP 解码的 RGBA 与缩放后的图像完全一致。
- 检查：透明角点均为 alpha 0；alpha 范围 0–255；非透明包围盒为 (0, 9, 594, 618)。深色背景人工预览确认脸、眼镜、蓝色发箍、粉色围巾、灰色外套、双手和“太棒了”牌子均保留。生成式抠图不能保证与源图逐像素一致；边缘有轻微抗锯齿/浅色过渡，原有画风、姿势和半身构图未见明显改变。
- 工具原始输出与检查记录：项目父目录下 `browser-pets-20261108/xiaocao/`。

## 编辑提示词

```text
Use case: background-extraction
Asset type: transparent 2D browser-pet portrait cutout
Input images: Image 1 is the ONLY edit target: existing 504×522 raster illustration of 小草. It is a woman with round glasses, blue headband, dark hair, pink plaid scarf, gray jacket, holding a sign reading “太棒了”.
Primary request: Remove ONLY the white background around the existing person and the held sign, replacing it with genuine transparent alpha. Preserve every visible subject detail as exactly as possible. This is background extraction, not a redraw or character redesign.
Composition/framing: preserve the exact source half-body cropping, pose, relative proportions, sign shape, hands, all existing visible edges; do not invent legs or complete the body below the original crop. Keep the original illustration and raster softness without sharpening or adding detail.
Text (verbatim): “太棒了”; preserve the original three Chinese characters and pointer-hand decorations exactly.
Constraints: keep the face, smile, facial features, glasses, eyes, hair, blue headband, scarf pattern/colors, jacket, hands, sign, text, lighting and style unchanged. Remove only white pixels that belong to the outside backdrop, keeping intentional pale/white parts inside the person and sign intact. Preserve antialiased silhouette edges. No glow, no shadow, no border, no added background, no new text or watermark. Output must have truly transparent corners and exterior background.
```
