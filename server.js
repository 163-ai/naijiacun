// 极简静态服务：只做三件事——正确的 MIME、gzip/br 压缩、静态资源缓存。
// 仅用于发布到托管平台（监听 $PORT）。GitHub Pages 走静态托管，不经过这个文件。
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".zip": "application/zip",
  ".pdf": "application/pdf"
};

// 只压缩文本类；图片/模型/音频本身已压缩，再压是浪费 CPU。
const COMPRESSIBLE = new Set([
  ".html", ".js", ".mjs", ".css", ".json", ".svg", ".txt", ".md", ".gltf", ".map"
]);

const CACHE_LIMIT = 96;
const cache = new Map(); // key -> { encoding, buffer }

function cacheGet(key) {
  if (!cache.has(key)) return null;
  const hit = cache.get(key);
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function cachePut(key, value) {
  cache.set(key, value);
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}

function pickEncoding(accept) {
  if (!accept) return "identity";
  if (/\bbr\b/.test(accept)) return "br";
  if (/\bgzip\b/.test(accept)) return "gzip";
  return "identity";
}

function compress(buffer, encoding) {
  if (encoding === "br") {
    return zlib.brotliCompressSync(buffer, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 9,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buffer.length
      }
    });
  }
  return zlib.gzipSync(buffer, { level: 9 });
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const resolved = path.resolve(ROOT, "." + decoded);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) return null;
  return resolved;
}

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({ "X-Content-Type-Options": "nosniff" }, headers));
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Method Not Allowed", { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, HEAD" });
    return;
  }

  let target = safePath(req.url || "/");
  if (!target) { send(res, 400, "Bad Request", { "Content-Type": "text/plain; charset=utf-8" }); return; }

  fs.stat(target, (err, stat) => {
    if (!err && stat.isDirectory()) {
      target = path.join(target, "index.html");
      return serveFile(target, req, res);
    }
    if (err) {
      // 无扩展名的路径也尝试 index.html，避免目录访问 404
      if (!path.extname(target)) return serveFile(path.join(target, "index.html"), req, res);
      send(res, 404, "Not Found", { "Content-Type": "text/plain; charset=utf-8" });
      return;
    }
    serveFile(target, req, res);
  });
});

function serveFile(file, req, res) {
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      send(res, 404, "Not Found", { "Content-Type": "text/plain; charset=utf-8" });
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, { ETag: etag });
      res.end();
      return;
    }

    const type = MIME[ext] || "application/octet-stream";
    const maxAge = ext === ".html" ? 600 : 604800;
    const headers = {
      "Content-Type": type,
      ETag: etag,
      "Cache-Control": `public, max-age=${maxAge}`,
      Vary: "Accept-Encoding",
      "Last-Modified": stat.mtime.toUTCString()
    };

    const encoding = COMPRESSIBLE.has(ext) ? pickEncoding(req.headers["accept-encoding"]) : "identity";
    if (encoding === "identity") {
      headers["Content-Length"] = stat.size;
      res.writeHead(200, headers);
      if (req.method === "HEAD") { res.end(); return; }
      fs.createReadStream(file).on("error", () => res.destroy()).pipe(res);
      return;
    }

    const key = `${file}|${stat.mtimeMs}|${encoding}`;
    const hit = cacheGet(key);
    if (hit) {
      headers["Content-Encoding"] = hit.encoding;
      headers["Content-Length"] = hit.buffer.length;
      res.writeHead(200, headers);
      res.end(req.method === "HEAD" ? undefined : hit.buffer);
      return;
    }

    fs.readFile(file, (readErr, buffer) => {
      if (readErr) {
        send(res, 500, "Internal Server Error", { "Content-Type": "text/plain; charset=utf-8" });
        return;
      }
      let body;
      try { body = compress(buffer, encoding); }
      catch { body = buffer; encoding = "identity"; }
      if (encoding !== "identity") cachePut(key, { encoding, buffer: body });
      if (encoding === "identity") headers["Content-Length"] = body.length;
      else headers["Content-Encoding"] = encoding;
      headers["Content-Length"] = body.length;
      res.writeHead(200, headers);
      res.end(req.method === "HEAD" ? undefined : body);
    });
  });
}

server.keepAliveTimeout = 65000;
server.listen(PORT, HOST, () => console.log(`static server on ${HOST}:${PORT}`));
