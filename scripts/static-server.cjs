/**
 * static-server.cjs — 零依赖静态文件服务器（只用 Node 内置模块）
 *
 * 用法:
 *   node scripts/static-server.cjs [port] [rootDir]
 *
 * 默认端口 8080，默认根目录 = 本文件的上级目录（项目根）。
 * 开发用途：默认禁用缓存，改完文件刷新即生效。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = parseInt(process.argv[2], 10) || 8080;
const ROOT = path.resolve(process.argv[3] || path.join(__dirname, '..'));
const HOST = process.env.BIND_HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.cjs':  'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.txt':  'text/plain; charset=utf-8',
  '.apk':  'application/vnd.android.package-archive',
};

function send(res, code, body, headers) {
  res.writeHead(code, Object.assign({ 'Cache-Control': 'no-store' }, headers || {}));
  res.end(body);
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(url.parse(req.url).pathname);
  } catch (e) {
    return send(res, 400, 'Bad Request');
  }

  if (pathname === '/') pathname = '/index.html';

  let filePath = path.normalize(path.join(ROOT, pathname));

  // 目录穿越防护
  if (!filePath.startsWith(ROOT)) {
    return send(res, 403, 'Forbidden');
  }

  fs.stat(filePath, (err, st) => {
    if (err) {
      return send(res, 404, `404 Not Found: ${pathname}`, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    if (st.isDirectory()) {
      const idx = path.join(filePath, 'index.html');
      if (fs.existsSync(idx)) {
        filePath = idx;
      } else {
        return send(res, 403, 'Directory listing disabled');
      }
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[ERROR] 端口 ${PORT} 已被占用`);
    process.exit(2);
  }
  console.error('[ERROR]', err.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`[static-server] root = ${ROOT}`);
  console.log(`[static-server] http://localhost:${PORT}`);
});
