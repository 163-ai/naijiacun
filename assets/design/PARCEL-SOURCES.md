# 包裹盲盒素材

2026-11-08 使用内置 `image_gen`，以用户已批准的盲盒审阅图为风格参考生成；不是角色素材。角色继续使用上传模型的已有渲染照。

- `parcel-closed.webp`：640×640，透明牛皮纸封闭包裹，木红封条与奶味封印。
- `parcel-open.webp`：640×427，透明空纸箱底座，外翻纸片与红色封条。

输出保留 alpha，缩至网页实际需要的尺寸后使用 lossless WebP。两张共约 441 KiB，仅在打开盲盒时请求。

生成提示词：

> Production web asset, product-mockup. Use the approved UI mockup only as a visual style and package design reference. ONLY the CLOSED kraft-paper blind box, red paper band and wax seal, warm premium 3D rendered textured cardboard, brown print 奶家村 and small 村民盲盒 badge, discreet question mark on right face. Three-quarter front camera slightly elevated, centered square composition. No character, no UI, no scenery. Truly transparent background, subtle contained contact shadow.

> Production web asset, product-mockup. Use the approved UI mockup middle panel as visual design reference. ONLY its EMPTY opened kraft cardboard base/tray with outward-folded flaps and red sealing band accents. No lid covering interior, low front wall so figure feet remain visible. Front-facing slightly elevated view, warm cardboard texture. No character, no text, no UI, no scenery. Truly transparent background, subtle contained contact shadow.
