#!/usr/bin/env node
/* 每日刷新群聊视频源：
 * 跑一轮 B 站抓取（用 server/group-feed.js 同一套逻辑），把结果写成静态 JSON
 * （js/group-live.json），GitHub Pages 版页面会把它当同源实时源取用。
 *
 * 用法：node scripts/refresh-group-live.js
 * 抓取失败或结果为空时退出码非 0，且不覆盖旧文件（页面永远有可用数据）。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const groupFeed = require("../server/group-feed");

groupFeed._crawl().then(function (payload) {
  if (!payload.videos || !payload.videos.length) {
    console.error("抓取结果为空，保留旧数据。failures:", JSON.stringify(payload.failures || []));
    process.exitCode = 2;
    return;
  }
  const out = { ok: true, videos: payload.videos, fetchedAt: Date.now() };
  const target = path.join(__dirname, "..", "js", "group-live.json");
  fs.writeFileSync(target, JSON.stringify(out), "utf8");
  console.log("已写入 " + target + "（" + payload.videos.length + " 条）");
  payload.videos.forEach(function (v) {
    console.log("  - " + v.id + " " + v.title + "（" + v.author + "，" + v.stat + "）");
  });
}).catch(function (err) {
  console.error("抓取失败:", (err && err.message) || err);
  process.exitCode = 1;
});
