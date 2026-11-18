// 本地预览服务器：为 ES module 返回正确的 MIME 类型
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = 8099;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch (e) { urlPath = '/'; }
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(ROOT, urlPath);
  // 防目录穿越：必须有目录分隔符边界，否则 ROOT-evil 这类同前缀兄弟目录会被绕过
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Serving ${ROOT} at http://127.0.0.1:${PORT}/ (MIME-correct)`);
});
