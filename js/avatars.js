// 奶家村 · 头像兜底（内联 SVG）
//
// 说明：
//   - 奶龙复用用户提供模型的渲染图，其余角色使用本站自绘的原创几何造型。
//   - 统一风格：圆形底色 + 圆润身体 + 大眼 + 一句话就能记住的特征。
//   - 用法：NaijiacunAvatars.svg("nailong", 56) 返回 SVG 字符串；没有对应形象时返回 null，
//     调用方回退到 emoji。
//
// 想改造型直接改下面的 ART 即可，每个角色一个 render(ctx) 函数。

(function () {
  "use strict";

  var INK = "#2C2A26";

  function eye(cx, cy, rx, ry, pupil) {
    return (
      '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="#fff"/>' +
      '<circle cx="' + cx + '" cy="' + (cy + 1) + '" r="' + (pupil || 3) + '" fill="' + INK + '"/>' +
      '<circle cx="' + (cx - 1.6) + '" cy="' + (cy - 1.4) + '" r="1.2" fill="#fff" opacity=".9"/>'
    );
  }

  function smile(cx, cy, w, color, width) {
    return (
      '<path d="M' + (cx - w) + " " + cy + " q" + w + " " + w * 0.8 + " " + w * 2 + ' 0" ' +
      'stroke="' + (color || "#6B4E1F") + '" stroke-width="' + (width || 3) +
      '" stroke-linecap="round" fill="none"/>'
    );
  }

  var ART = {
    // 奶龙：与图鉴共用挥手微笑模型渲染图
    nailong: {
      bg: "#FFF4D2",
      render: function () {
        return '<image href="assets/characters/3d/nailong-waving-avatar.webp?v=waving-1" width="120" height="120" preserveAspectRatio="xMidYMid meet"/>';
      }
    },

    // 奶蛙：梨形身体，绿色虹膜大眼，张嘴大笑
    naiwa: {
      bg: "#FFF7D6",
      render: function () {
        return (
          '<path d="M60 26 C42 26 32 46 32 66 C32 85 45 96 60 96 C75 96 88 85 88 66 C88 46 78 26 60 26 Z" fill="#F2D14E"/>' +
          '<ellipse cx="27" cy="76" rx="6" ry="8" fill="#F2D14E"/>' +
          '<ellipse cx="93" cy="76" rx="6" ry="8" fill="#F2D14E"/>' +
          '<ellipse cx="60" cy="88" rx="17" ry="11" fill="#FFE9A0"/>' +
          eye(48, 55, 8, 9, 3) + eye(72, 55, 8, 9, 3) +
          '<circle cx="48" cy="56" r="4.6" fill="#6FAE3C"/>' +
          '<circle cx="72" cy="56" r="4.6" fill="#6FAE3C"/>' +
          '<circle cx="48" cy="56" r="2.2" fill="' + INK + '"/>' +
          '<circle cx="72" cy="56" r="2.2" fill="' + INK + '"/>' +
          '<ellipse cx="60" cy="78" rx="10" ry="8" fill="#4A2C17"/>' +
          '<ellipse cx="60" cy="83" rx="5.5" ry="3.6" fill="#E8797A"/>'
        );
      }
    },

    // 暴暴龙：橙红色，竖眉、锯齿背刺、露牙
    baobaolong: {
      bg: "#FFE7DE",
      render: function () {
        return (
          '<path d="M38 40 l7 -14 l7 14 z" fill="#C9452A"/>' +
          '<path d="M56 32 l8 -16 l8 16 z" fill="#C9452A"/>' +
          '<path d="M76 40 l7 -14 l7 14 z" fill="#C9452A"/>' +
          '<ellipse cx="60" cy="68" rx="35" ry="31" fill="#EF6C4D"/>' +
          '<ellipse cx="60" cy="76" rx="20" ry="17" fill="#FFD9C9"/>' +
          '<path d="M41 54 l13 6" stroke="' + INK + '" stroke-width="4" stroke-linecap="round"/>' +
          '<path d="M79 54 l-13 6" stroke="' + INK + '" stroke-width="4" stroke-linecap="round"/>' +
          eye(48, 64, 5.5, 6.5, 3) + eye(72, 64, 5.5, 6.5, 3) +
          '<path d="M48 80 h24 l-6 8 h-12 z" fill="#4A2318"/>' +
          '<path d="M52 80 l3 5 l3 -5 z" fill="#fff"/>' +
          '<path d="M62 80 l3 5 l3 -5 z" fill="#fff"/>'
        );
      }
    },

    // 小七：圆脸小孩，短毛、圆领衫
    xiaoqi: {
      bg: "#E6F0FC",
      render: function () {
        return (
          '<path d="M26 120 q4 -22 34 -22 q30 0 34 22 z" fill="#6BA8E8"/>' +
          '<circle cx="60" cy="62" r="31" fill="#FFD7B5"/>' +
          '<path d="M29 56 q6 -26 31 -26 q25 0 31 26 q-14 -9 -31 -9 q-17 0 -31 9 z" fill="#4A3728"/>' +
          '<circle cx="60" cy="27" r="6" fill="#4A3728"/>' +
          eye(49, 62, 5, 6, 2.8) + eye(71, 62, 5, 6, 2.8) +
          smile(60, 76, 7, "#B4715A", 3) +
          '<circle cx="40" cy="72" r="5" fill="#F3A79C" opacity=".65"/>' +
          '<circle cx="80" cy="72" r="5" fill="#F3A79C" opacity=".65"/>'
        );
      }
    },

    // 牛来：憨厚牛，小犄角、宽口鼻
    niulai: {
      bg: "#F6ECDF",
      render: function () {
        return (
          '<ellipse cx="27" cy="58" rx="11" ry="7" fill="#B07C53" transform="rotate(-18 27 58)"/>' +
          '<ellipse cx="93" cy="58" rx="11" ry="7" fill="#B07C53" transform="rotate(18 93 58)"/>' +
          '<path d="M40 34 q-3 -12 5 -14 q6 2 4 14 z" fill="#F4E3C1"/>' +
          '<path d="M80 34 q3 -12 -5 -14 q-6 2 -4 14 z" fill="#F4E3C1"/>' +
          '<rect x="30" y="34" width="60" height="60" rx="30" fill="#C08A5E"/>' +
          '<ellipse cx="60" cy="74" rx="21" ry="14" fill="#F2DCC4"/>' +
          '<ellipse cx="52" cy="72" rx="3" ry="4" fill="#8A6242"/>' +
          '<ellipse cx="68" cy="72" rx="3" ry="4" fill="#8A6242"/>' +
          eye(48, 58, 5, 6, 2.8) + eye(72, 58, 5, 6, 2.8) +
          '<path d="M52 84 q8 6 16 0" stroke="#8A6242" stroke-width="2.6" stroke-linecap="round" fill="none"/>'
        );
      }
    },

    // 卡皮巴拉：方头、小耳、永远半眯眼
    capybara: {
      bg: "#F3EADF",
      render: function () {
        return (
          '<circle cx="35" cy="36" r="8" fill="#8C6A4F"/>' +
          '<circle cx="85" cy="36" r="8" fill="#8C6A4F"/>' +
          '<rect x="24" y="32" width="72" height="66" rx="30" fill="#B08968"/>' +
          '<ellipse cx="60" cy="80" rx="20" ry="14" fill="#D9C3AC"/>' +
          '<ellipse cx="60" cy="74" rx="5" ry="3.6" fill="#7A5A42"/>' +
          '<path d="M52 88 q8 4 16 0" stroke="#7A5A42" stroke-width="2.4" stroke-linecap="round" fill="none"/>' +
          '<path d="M42 58 q6 -4 12 0" stroke="' + INK + '" stroke-width="3" stroke-linecap="round" fill="none"/>' +
          '<path d="M66 58 q6 -4 12 0" stroke="' + INK + '" stroke-width="3" stroke-linecap="round" fill="none"/>' +
          '<circle cx="42" cy="68" r="4.5" fill="#E29C86" opacity=".5"/>' +
          '<circle cx="78" cy="68" r="4.5" fill="#E29C86" opacity=".5"/>'
        );
      }
    }
  };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // size 为空时自适应容器宽度（卡片里用 100%）
  function svg(id, size) {
    var art = ART[id];
    if (!art) return null;
    var dim = size ? ' width="' + size + '" height="' + size + '"' : ' width="100%" height="100%"';
    return (
      '<svg viewBox="0 0 120 120"' + dim + ' xmlns="http://www.w3.org/2000/svg" ' +
      'role="img" aria-label="' + esc(id) + '">' +
      '<circle cx="60" cy="60" r="60" fill="' + art.bg + '"/>' +
      art.render() +
      "</svg>"
    );
  }

  // 陌生人（用户自己提名的）用首字生成一个撞色圆牌，比 emoji 更像"有设计"
  var TINTS = ["#E9D5FF", "#CFF4E4", "#FFE0CC", "#D8E8FF", "#FFE7F0", "#E6F2C9"];
  var TEXTS = ["#6B46C1", "#1F7A5C", "#B45309", "#1E4E8C", "#A61E5C", "#4C6B0F"];

  function initial(name, seed) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
    var k = Math.abs(h) % TINTS.length;
    var ch = (name || "?").trim().charAt(0);
    return (
      '<svg viewBox="0 0 120 120" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="60" cy="60" r="60" fill="' + TINTS[k] + '"/>' +
      '<text x="60" y="60" text-anchor="middle" dominant-baseline="central" ' +
      'font-size="52" font-weight="600" fill="' + TEXTS[k] + '" ' +
      'font-family="system-ui,-apple-system,Segoe UI,sans-serif">' + esc(ch) + "</text></svg>"
    );
  }

  window.NaijiacunAvatars = {
    svg: svg,
    initial: initial,
    has: function (id) { return !!ART[id]; },
    ids: Object.keys(ART)
  };
})();
