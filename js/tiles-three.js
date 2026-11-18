// 奶家村 · 大冒险 —— Three.js 贴图桥接层
// mapTexture 原本放在 tiles.js 末尾，导致那个纯 Canvas2D 地图模块被迫 import three。
// 这里把它单独拆出来：tiles.js 保持纯数据 + Canvas2D（轻量 2D 版可零依赖复用），
// 只有需要 WebGL 的 game2d.js 才加载本文件。行为与原实现完全一致。
import * as T from "three";
import { paintMap } from "./tiles.js?v=7";

export function mapTexture(m, renderer) {
  const c = paintMap(m);
  const t = new T.CanvasTexture(c);
  t.userData = { canvas: c };
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.magFilter = T.LinearFilter;
  t.minFilter = T.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  return t;
}
