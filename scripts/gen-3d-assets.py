#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
为 3D 展台生成资产（不改原图，只做规整化 + 抠背景 + 计算厚度）：

  assets/3d/{id}.png        256x256 正方形 RGBA 贴图（角色居中、透明留白）
  assets/3d/{id}_depth.png  256x256 8bit 灰度深度图（黑=边缘薄，白=中心厚）
  js/3d-data.js             打包文件：贴图 data URI + 128x128 高度/alpha 网格
                            页面用 <script> 加载，因此 file:// 双击打开也能跑，
                            不需要 fetch / getImageData（WebGL 在 file:// 下会跨域拒绝）。

原理：把透明 PNG 的轮廓当作形状，用 chamfer 距离变换算出「哪里厚、哪里薄」，
      js/pet3d.js 把一张平面网格沿 Z 顶起，再沿轮廓补一圈侧壁 → 真几何体。

用法： python scripts/gen-3d-assets.py
"""
from PIL import Image, ImageFilter, ImageDraw
from collections import deque
import numpy as np
import base64
import io
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "characters")
DST = os.path.join(ROOT, "assets", "3d")
SIZE = 256          # 贴图边长
GRID = 128          # 打包给浏览器的高度/alpha 网格边长
IDS = ["nailong", "naiwa", "baobaolong", "xiaoqi", "niulai", "capybara"]

# 两张「复杂背景裁切图」的主体近似轮廓（归一化坐标，顺时针）。
# 只用于把照片/漫画背景剔掉，主体像素本身一个都不改。
POLY = {
    "naiwa": [
        (0.50, 0.02), (0.64, 0.03), (0.74, 0.11), (0.79, 0.25), (0.79, 0.42),
        (0.84, 0.53), (0.87, 0.70), (0.88, 0.88), (0.87, 1.00),
        (0.12, 1.00), (0.10, 0.86), (0.12, 0.68), (0.16, 0.52),
        (0.20, 0.42), (0.20, 0.25), (0.25, 0.11), (0.36, 0.03),
    ],
    "niulai": [
        (0.30, 0.04), (0.42, 0.11), (0.62, 0.07), (0.73, 0.15),
        (0.83, 0.31), (0.89, 0.51), (0.90, 0.76), (0.90, 1.00),
        (0.22, 1.00), (0.18, 0.78), (0.19, 0.52), (0.23, 0.32), (0.27, 0.17),
    ],
}

# 颜色过滤后仍会粘着的一小块背景，用归一化多边形定点切掉（在填洞之后执行）
EXCLUDE = {
    "naiwa": [
        [(0.70, 0.00), (1.00, 0.00), (1.00, 1.00), (0.70, 1.00)],  # 右侧漫画爆炸
        [(0.36, 0.00), (0.64, 0.00), (0.64, 0.13), (0.36, 0.13)],  # 头顶灰建筑
    ],
    "niulai": [
        [(0.00, 0.00), (0.16, 0.00), (0.16, 1.00), (0.00, 1.00)],  # 左侧办公室
        [(0.92, 0.00), (1.00, 0.00), (1.00, 1.00), (0.92, 1.00)],  # 右侧窗框
    ],
}


def components(mask):
    """4 邻域连通块标记，返回 (label, sizes)。纯 numpy + BFS，无需 scipy/cv2。"""
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    cur, sizes = 0, {}
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or lab[y, x]:
                continue
            cur += 1
            n, q = 0, deque([(y, x)])
            lab[y, x] = cur
            while q:
                cy, cx = q.popleft()
                n += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = cur
                        q.append((ny, nx))
            sizes[cur] = n
    return lab, sizes


def keep_largest(mask):
    lab, sizes = components(mask)
    return lab == max(sizes, key=sizes.get) if sizes else mask


def fill_holes(mask, max_area=420):
    """把不与边界连通、且面积不大的背景区域（五官等内部小洞）填成前景。
    限制面积很重要：否则会把大片残留背景也「补」回来。"""
    inv = ~mask
    lab, sizes = components(inv)
    if not sizes:
        return mask
    border = set(np.unique(np.concatenate(
        [lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]])).tolist())
    out = mask.copy()
    for k, size in sizes.items():
        if k not in border:
            out[lab == k] = True
    return out


def matte_complex_bg(im, cid):
    """多边形轮廓 + 抑制低饱和高明度背景 + 闭运算 + 最大连通块 + 填洞 + 羽化。"""
    a = np.array(im.convert("RGBA"))
    h, w = a.shape[:2]
    rgb = a[:, :, :3]

    poly = [(int(x * w), int(y * h)) for x, y in POLY[cid]]
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).polygon(poly, fill=255)
    mask = np.array(m) > 127

    mx = rgb.max(2).astype(np.float32)
    mn = rgb.min(2).astype(np.float32)
    sat = (mx - mn) / np.maximum(mx, 1)
    bgish = (sat < 0.20) & (mx > 140)          # 白墙 / 灰窗 / 阴天城市
    mask &= ~bgish

    # 以画面中心（一定是角色身体）的颜色为种子，剔掉漫画爆炸、办公室等杂色背景；
    # 暗部（眼睛、嘴、牛角）单独放行，避免把五官挖掉。
    ys = slice(int(h * 0.45), int(h * 0.80))
    xs = slice(int(w * 0.35), int(w * 0.65))
    region = rgb[ys, xs][mask[ys, xs]]
    seed = (np.median(region, axis=0).astype(np.float32) if len(region)
            else np.array([210, 180, 90], np.float32))
    dist = np.linalg.norm(rgb.astype(np.float32) - seed, axis=2)
    dist_th, dark_th = (96, 132) if cid == "naiwa" else (100, 90)
    mask &= ((dist < dist_th) | (mx < dark_th))

    mm = Image.fromarray((mask * 255).astype(np.uint8))
    mm = mm.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    mask = np.array(mm) > 127
    mask = fill_holes(keep_largest(mask))

    # 定点清除残留背景（放在填洞之后，避免又被补回来）
    for poly in EXCLUDE.get(cid, []):
        pts = [(int(x * w), int(y * h)) for x, y in poly]
        cut = Image.new("L", (w, h), 0)
        ImageDraw.Draw(cut).polygon(pts, fill=255)
        mask &= ~(np.array(cut) > 127)
    mask = keep_largest(mask)

    alpha = np.array(Image.fromarray((mask * 255).astype(np.uint8))
                     .filter(ImageFilter.GaussianBlur(1.2)))
    a[:, :, 3] = alpha
    return Image.fromarray(a, "RGBA")


def normalize(im):
    """裁掉透明边 → 等比缩放 → 居中贴到 256x256 透明画布。"""
    im = im.convert("RGBA")
    box = im.getchannel("A").getbbox()
    if box:
        im = im.crop(box)
    w, h = im.size
    scale = (SIZE * 0.80) / max(w, h)
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    im = im.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(im, ((SIZE - nw) // 2, (SIZE - nh) // 2), im)
    return canvas


def chamfer_dt(mask):
    """两遍 chamfer 距离变换：形状内每点到最近背景的距离（8 邻域）。"""
    H, W = mask.shape
    d = np.where(mask, 1e9, 0.0).astype(np.float32)
    for y in range(H):
        row, prev = d[y], (d[y - 1] if y > 0 else None)
        for x in range(W):
            if row[x] == 0:
                continue
            v = row[x]
            if x > 0:
                v = min(v, row[x - 1] + 1.0)
            if prev is not None:
                v = min(v, prev[x] + 1.0)
                if x > 0:
                    v = min(v, prev[x - 1] + 1.414)
                if x < W - 1:
                    v = min(v, prev[x + 1] + 1.414)
            row[x] = v
    for y in range(H - 1, -1, -1):
        row, nxt = d[y], (d[y + 1] if y < H - 1 else None)
        for x in range(W - 1, -1, -1):
            if row[x] == 0:
                continue
            v = row[x]
            if x < W - 1:
                v = min(v, row[x + 1] + 1.0)
            if nxt is not None:
                v = min(v, nxt[x] + 1.0)
                if x < W - 1:
                    v = min(v, nxt[x + 1] + 1.414)
                if x > 0:
                    v = min(v, nxt[x - 1] + 1.414)
            row[x] = v
    return d


def build_depth(im):
    alpha = np.array(im.getchannel("A")).astype(np.float32) / 255.0
    mask = alpha > 0.42
    d = chamfer_dt(mask)
    mx = max(float(np.percentile(d[mask], 93)), 1.0) if mask.any() else 1.0
    h = np.clip(d / (mx * 0.82), 0, 1) ** 0.62
    h = np.array(Image.fromarray((h * 255).astype(np.uint8))
                 .filter(ImageFilter.GaussianBlur(2.2))).astype(np.float32) / 255.0
    h = np.clip(h * np.clip(alpha * 1.6, 0, 1), 0, 1)
    return Image.fromarray((h * 255).astype(np.uint8), "L")


def b64(arr):
    return base64.b64encode(np.asarray(arr, dtype=np.uint8).tobytes()).decode("ascii")


def main():
    os.makedirs(DST, exist_ok=True)
    pack = {}
    for cid in IDS:
        src = os.path.join(SRC, cid + ".png")
        if not os.path.exists(src):
            print("  ! 缺图:", src)
            continue
        im = Image.open(src)
        if cid in POLY:
            im = matte_complex_bg(im, cid)
        tex = normalize(im)
        dep = build_depth(tex)
        tex.save(os.path.join(DST, cid + ".png"))
        dep.save(os.path.join(DST, cid + "_depth.png"))

        # 打包：data URI 贴图 + GRID x GRID 高度/alpha（按图像行优先，左上为原点）
        # 几何轮廓用轻微平滑的 alpha，减少侧壁的方格台阶；贴图仍用未模糊的原图
        a_smooth = tex.getchannel("A").filter(ImageFilter.GaussianBlur(0.9))
        arr_a = np.array(a_smooth.resize((GRID, GRID), Image.BILINEAR))
        arr_h = np.array(dep.resize((GRID, GRID), Image.BILINEAR))
        rgba = np.array(tex.convert("RGBA"))
        sel = rgba[:, :, 3] > 200
        med = np.median(rgba[:, :, :3][sel], axis=0).astype(int) if sel.any() else [180, 150, 90]
        buf = io.BytesIO()
        tex.save(buf, "PNG", optimize=True)
        pack[cid] = {
            "n": GRID,
            "tex": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii"),
            "h": b64(arr_h),
            "a": b64(arr_a),
            "edge": "#%02x%02x%02x" % tuple(int(v) for v in med),
        }
        print(f"  {cid:12s} 覆盖 {(arr_a > 100).mean()*100:5.1f}%"
              f"  深度峰值 {arr_h.max():3d}"
              f"  {'[抠背景]' if cid in POLY else ''}")

    out = os.path.join(ROOT, "js", "3d-data.js")
    with open(out, "w", encoding="utf-8") as f:
        f.write("// 由 scripts/gen-3d-assets.py 自动生成，请勿手改。\n")
        f.write("// 内含 6 个角色的 data URI 贴图 + 高度/alpha 网格，供 js/pet3d.js 构建几何。\n")
        f.write("window.N3D = " + json.dumps(pack, separators=(",", ":")) + ";\n")
    print("完成 → assets/3d/ 与 js/3d-data.js (%.0f KB)" % (os.path.getsize(out) / 1024))


if __name__ == "__main__":
    main()
