/** CodeUML 静态文件服务器：零依赖，启动后打开浏览器 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const VERBOSE = process.argv.includes('--debug') || !!process.env.DEBUG;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

/** URL 路径 -> ROOT 内的绝对文件路径；越界返回 null（防目录穿越） */
function resolvePath(urlPath) {
  const rel = decodeURIComponent(urlPath.split('?')[0]);
  const target = rel === '/' ? 'index.html' : rel.replace(/^\/+/, '');
  const resolved = path.resolve(ROOT, target);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) return null;
  return resolved;
}

function createServer() {
  return http.createServer((req, res) => {
    if (VERBOSE) res.on('finish', () => console.log(`${req.method} ${req.url} ${res.statusCode}`));
    const file = resolvePath(req.url || '/');
    if (!file) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404);
        return res.end('Not Found');
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': stat.size,
      });
      fs.createReadStream(file).pipe(res);
    });
  });
}

function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [url]] :
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] :
    ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

function start() {
  const server = createServer();
  server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log('CodeUML 已启动');
    console.log(`  地址  : ${url}`);
    console.log(`  根目录: ${ROOT}`);
    console.log(`  端口  : ${PORT}`);
    console.log(`  Node  : ${process.version}`);
    console.log(`  调试  : ${VERBOSE ? '开启（打印请求日志）' : '关闭（npm start -- --debug 开启请求日志）'}`);
    openBrowser(url);
  });
}

/** 自检：路径解析 + 首页可访问（node server.js --check） */
function runCheck() {
  const assert = require('assert');
  assert.strictEqual(resolvePath('/'), path.join(ROOT, 'index.html'));
  assert.strictEqual(resolvePath('/styles/app.css'), path.join(ROOT, 'styles', 'app.css'));
  assert.strictEqual(resolvePath('/../../etc/passwd'), null);
  assert.strictEqual(resolvePath('/%2e%2e/server.js'), null);

  const server = createServer();
  server.listen(0, () => {
    const port = server.address().port;
    http.get(`http://localhost:${port}/`, (res) => {
      assert.strictEqual(res.statusCode, 200);
      res.resume();
      res.on('end', () => {
        server.close();
        console.log('self-check ok');
      });
    });
  });
}

if (require.main === module) {
  process.argv.includes('--check') ? runCheck() : start();
}

module.exports = { createServer, resolvePath };
