// 奶家村 · 大冒险 —— 2D 雨幕（画布版）
// 旧实现是 CSS repeating-linear-gradient：等距斜线、步进平移，一眼假。
// 这里换成 canvas：三层景深（远细近粗）、每滴自己的长度/速度/透明度、
// 阵风让整体倾角逐帧缓变，落到底部还会溅起小水花。只在下雨时跑 rAF。
(function () {
  "use strict";
  let cv = null, ctx = null, on = false, raf = 0, last = 0, t = 0;
  let W = 0, H = 0, dpr = 1;
  const drops = [];
  const splashes = [];

  const LAYERS = [   // 远 → 近：越近的越长、越快、越亮
    { n: .45, len: [9, 15],  spd: [520, 760],  w: .8, a: [.10, .20] },
    { n: .35, len: [15, 24], spd: [760, 1040], w: 1.1, a: [.16, .30] },
    { n: .20, len: [24, 38], spd: [1040, 1420], w: 1.5, a: [.24, .42] },
  ];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function makeDrop(scatter) {
    // 按 1/dpi 密度铺滴；scatter=false 时从屏幕上方进入，避免开局满屏雨
    const r = Math.random();
    const L = r < LAYERS[0].n ? LAYERS[0] : r < LAYERS[0].n + LAYERS[1].n ? LAYERS[1] : LAYERS[2];
    const len = L.len[0] + Math.random() * (L.len[1] - L.len[0]);
    return {
      x: Math.random() * (W + 120) - 60,
      y: scatter ? Math.random() * H : -len - Math.random() * H * .3,
      len,
      spd: L.spd[0] + Math.random() * (L.spd[1] - L.spd[0]),
      w: L.w * (.75 + Math.random() * .5),
      a: L.a[0] + Math.random() * (L.a[1] - L.a[0]),
      wob: Math.random() * 6.28,          // 每滴自己的相位，下落时轻微摆动
    };
  }

  function targetCount() { return Math.min(340, Math.round(W * H / 6200)); }

  function frame(now) {
    if (!on) { raf = 0; return; }
    const dt = Math.min(.05, (now - last) / 1000 || .016);
    last = now; t += dt;

    // 阵风：倾角在 -14° ~ -6° 之间缓慢摆动，偶尔加一阵
    const gust = Math.sin(t * .35) * .05 + Math.sin(t * 1.1) * .02;
    const slant = .12 + gust;

    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = "round";
    ctx.strokeStyle = "#cfe0ee";

    // 补滴
    while (drops.length < targetCount()) drops.push(makeDrop(false));

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.y += d.spd * dt;
      d.x += d.spd * slant * dt;
      const sway = Math.sin(t * 2.2 + d.wob) * 1.5;
      if (d.y > H + 30 || d.x > W + 60) {
        if (d.y - d.len < H * 1.02 && Math.random() < .3 && splashes.length < 40) {
          splashes.push({ x: d.x, y: H - Math.random() * 14, r: 1, a: .38, v: 42 + Math.random() * 40 });
        }
        drops[i] = makeDrop(false);
        continue;
      }
      const dx = d.len * slant + sway, dy = d.len;
      ctx.globalAlpha = d.a;
      ctx.lineWidth = d.w;
      ctx.beginPath();
      ctx.moveTo(d.x - dx, d.y - dy);
      ctx.lineTo(d.x, d.y);
      ctx.stroke();
    }

    // 落地水花：一圈快速扩散变淡的小椭圆
    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i];
      s.r += s.v * dt; s.a -= 1.6 * dt;
      if (s.a <= 0) { splashes.splice(i, 1); continue; }
      ctx.globalAlpha = s.a;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.r, s.r * .32, 0, 0, 6.29);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }

  function set(v) {
    v = !!v;
    if (v === on) return;
    on = v;
    if (v) {
      if (!cv) {
        cv = document.getElementById("rain");
        ctx = cv.getContext("2d");
        window.addEventListener("resize", resize);
        resize();
        for (let i = 0; i < targetCount(); i++) drops.push(makeDrop(true));   // 开局满屏
      }
      cv.style.display = "block";
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else {
      cv.style.display = "none";
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      drops.length = 0; splashes.length = 0;
    }
  }

  window.Rain2D = { set };
})();
