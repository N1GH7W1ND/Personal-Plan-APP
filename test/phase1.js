'use strict';
/**
 * 阶段 1 测试：地基
 * 覆盖：关键文件、离线可用、服务启动、health、页面外壳、静态资源、
 *       路径穿越防护、404、数据目录初始化、重复启动保护、优雅停止。
 */

const t = require('./lib/t');
const h = require('./lib/helpers');
const fs = require('node:fs');
const path = require('node:path');

t.setFile('阶段1 地基');

let server = null;
let dataDir = null;

t.test('启动脚本与关键文件都存在', async () => {
  const expected = [
    '启动.cmd',
    'server/index.js',
    'server/config.js',
    'server/static.js',
    'server/store.js',
    'server/api.js',
    'web/index.html',
    'web/styles.css',
    'web/app.js',
    'web/date.js',
    'web/api.js',
    'test/lib/t.js',
    'test/lib/helpers.js',
  ];
  for (const rel of expected) {
    t.ok(fs.existsSync(path.join(h.ROOT, rel)), '缺少文件 ' + rel);
  }
});

t.test('启动脚本调用 node 且在出错时不自动关窗', async () => {
  const text = fs.readFileSync(path.join(h.ROOT, '启动.cmd'), 'utf8');
  t.includes(text, 'node', '应调用 node');
  t.includes(text, 'server\\index.js', '应运行 server/index.js');
  t.includes(text, 'pause', '出错时应停留窗口以便查看提示');
  t.includes(text, 'where node', '应先检查 node 是否存在');
  t.includes(text, 'nodejs.org', '应给出 Node 下载地址提示');
  t.includes(text, '%*', '应把参数透传给 node（支持 --port / --data-dir）');
  t.includes(text, 'chcp 65001', '应切换到 UTF-8 以便中文正常显示');
  // 批处理在 chcp 生效前按本地代码页解析，所以注释必须是纯 ASCII
  const nonAsciiLines = text.split(/\r?\n/).filter((line) => /[^\x00-\x7F]/.test(line) && /^\s*rem\b/i.test(line));
  t.deepEq(nonAsciiLines, [], 'rem 注释行含非 ASCII 字符，会被 cmd 误解析');
});

// 说明（重要）：
// 「双击 启动.cmd 后浏览器自动打开」这一条属于**人工验证项**。
// 当前开发环境禁止测试进程启动任何独立进程（spawn/Start-Process 均被拦截），
// 因此这里只对启动脚本做静态校验；真实启动路径由人工在浏览器里确认（见 PRD 验收 A1/A2）。
// CLI 参数（--port / --data-dir）本身已由 helpers.startServer 以生产同款 start() 覆盖。

t.test('前端资源没有外网引用（离线可用）', async () => {
  const files = ['web/index.html', 'web/styles.css', 'web/app.js', 'web/date.js', 'web/api.js'];
  for (const rel of files) {
    const text = fs.readFileSync(path.join(h.ROOT, rel), 'utf8');
    // 只认真正的"加载外部资源"，不误伤 SVG 命名空间声明
    t.eq(/<script[^>]+src\s*=\s*["']https?:/i.test(text), false, rel + ' 用 script 加载了外网脚本');
    t.eq(/<link[^>]+href\s*=\s*["']https?:/i.test(text), false, rel + ' 用 link 加载了外网样式');
    t.eq(/<img[^>]+src\s*=\s*["']https?:/i.test(text), false, rel + ' 引用了外网图片');
    t.eq(/@import\s+url\(\s*["']?https?:/i.test(text), false, rel + ' 用 @import 加载了外网样式');
    t.eq(/url\(\s*["']?https?:\/\/(?!127\.0\.0\.1)/i.test(text), false, rel + ' 用 url() 引用了外网资源');
    t.notIncludes(text, 'cdn.', rel + ' 出现了 CDN 引用');
    t.notIncludes(text, 'unpkg.com', rel + ' 出现了外网包引用');
    t.notIncludes(text, 'fonts.googleapis', rel + ' 出现了外网字体引用');
  }
  for (const rel of ['server/index.js', 'server/store.js', 'server/api.js', 'server/static.js']) {
    const text = fs.readFileSync(path.join(h.ROOT, rel), 'utf8');
    t.eq(/fetch\(\s*["']https?:/i.test(text), false, rel + ' 里有对外网的请求');
    t.notIncludes(text, 'unpkg.com', rel + ' 出现了外网包引用');
  }
});

t.test('服务能正常启动（进程内启动真实服务）', async () => {
  dataDir = await h.makeTmpDir('phase1');
  server = await h.startServer({ port: h.TEST_PORT_BASE, dataDir });
  t.ok(server.port === h.TEST_PORT_BASE, '应监听测试端口');
  const alive = await h.canConnect(server.port);
  t.eq(alive, true, '端口应可连接');
});

t.test('GET /api/health 返回应用标识与数据路径', async () => {
  const r = await h.req(server.port, 'GET', '/api/health');
  t.eq(r.status, 200, 'health 状态码');
  t.eq(r.json.name, '我的工作台', '应用名');
  t.eq(r.json.ok, true, 'ok 字段');
  t.includes(r.json.dataFile, 'data.json', 'dataFile 应指向 data.json');
  t.includes(r.json.dataDir, path.basename(dataDir), 'dataDir 应是传入的临时目录');
  t.ok(typeof r.json.stats === 'object' && r.json.stats !== null, 'stats 应存在');
});

t.test('GET / 返回页面外壳，含 8 个导航入口', async () => {
  const r = await h.req(server.port, 'GET', '/');
  t.eq(r.status, 200, '首页状态码');
  t.includes(r.headers['content-type'], 'text/html', '首页 Content-Type');
  const routes = ['home', 'today', 'dev', 'study', 'reading', 'diet', 'fitness', 'settings'];
  for (const name of routes) {
    t.includes(r.raw, 'data-route="' + name + '"', '导航缺少入口 ' + name);
  }
  // 页面上的入口数应与清单一致：防止"加了模块忘了加导航"或反过来的情况
  const found = (r.raw.match(/data-route="/g) || []).length;
  t.eq(found, routes.length, '外壳里的导航入口数应与清单一致（实际 ' + found + ' 个）');
  // 已移除的模块不应再出现在导航里
  for (const gone of ['media', 'consult', 'games']) {
    t.notIncludes(r.raw, 'data-route="' + gone + '"', '导航里不应再有 ' + gone);
  }
  t.includes(r.raw, 'id="view"', '缺少视图容器');
  t.includes(r.raw, 'id="saveDot"', '缺少保存状态指示');
});

t.test('静态资源返回正确类型且不缓存', async () => {
  const css = await h.req(server.port, 'GET', '/styles.css');
  t.eq(css.status, 200, 'styles.css 状态码');
  t.includes(css.headers['content-type'], 'text/css', 'styles.css Content-Type');
  t.includes(String(css.headers['cache-control']), 'no-store', 'styles.css 应不缓存');

  const js = await h.req(server.port, 'GET', '/app.js');
  t.eq(js.status, 200, 'app.js 状态码');
  t.includes(js.headers['content-type'], 'javascript', 'app.js Content-Type');

  t.eq((await h.req(server.port, 'GET', '/date.js')).status, 200, 'date.js 状态码');
  t.eq((await h.req(server.port, 'GET', '/api.js')).status, 200, 'api.js 状态码');
});

t.test('路径穿越被拒绝，源码无法被读取', async () => {
  const attacks = [
    '/../server/config.js',
    '/../../server/config.js',
    '/..%2fserver%2fconfig.js',
    '/%2e%2e/server/config.js',
    '/subdir/../../server/store.js',
    '/..%5Cserver%5Capi.js',
    '/..%2F' + encodeURIComponent('启动.cmd'),
  ];
  for (const url of attacks) {
    const r = await h.req(server.port, 'GET', url);
    t.ok(r.status === 403 || r.status === 404, url + ' 应被拒绝，实际 ' + r.status);
    t.notIncludes(r.raw, 'PORT_START', url + ' 泄漏了源码内容');
  }
});

t.test('未知路径与未知接口返回 404（带中文提示）', async () => {
  const file = await h.req(server.port, 'GET', '/this-does-not-exist.css');
  t.eq(file.status, 404, '未知文件状态码');

  const api404 = await h.req(server.port, 'GET', '/api/nope');
  t.eq(api404.status, 404, '未知接口状态码');
  t.eq(api404.json.code, 'NO_ROUTE', '未知接口错误码');
});

t.test('首次启动会在数据目录创建 data.json', async () => {
  const file = h.dataFile(dataDir);
  t.ok(fs.existsSync(file), '应创建 data.json');
  const json = await h.readJson(file);
  t.eq(json.schemaVersion, 1, 'schemaVersion');
  t.ok(Array.isArray(json.tasks), 'tasks 应为数组');
  t.ok(Array.isArray(json.notes), 'notes 应为数组');
});

t.test('重复启动能识别出"已在运行"而不再起第二份', async () => {
  // 用一个独立端口做这件事，避免影响上面的用例
  const port = h.TEST_PORT_BASE + 1;
  const dir = await h.makeTmpDir('reuse');
  const first = await h.startServer({ port, dataDir: dir });
  try {
    const second = await h.serverIndex.start([port]);
    t.eq(second.reused, true, '应识别为已在运行');
    t.eq(second.port, port, '应返回同一个端口');
    t.ok(second.health && second.health.name === '我的工作台', '应能读到已有实例的 health');
    t.eq(second.server, null, '不应再创建新的监听');
  } finally {
    await first.stop();
  }
});

t.test('端口顺延：端口被别的程序占用时能换到下一个', async () => {
  const http = require('node:http');
  const busyPort = h.TEST_PORT_BASE + 2;
  const nextPort = h.TEST_PORT_BASE + 3;

  // 用一个"不是本应用"的服务占住端口，制造 EADDRINUSE
  const foreign = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('busy');
  });
  await new Promise((r) => foreign.listen(busyPort, '127.0.0.1', r));

  try {
    const r = await h.serverIndex.start([busyPort, nextPort]);
    t.eq(r.reused, false, '不应判定为复用');
    t.eq(r.port, nextPort, '应顺延到下一个端口');
    const health = await h.req(nextPort, 'GET', '/api/health');
    t.eq(health.status, 200, '顺延后服务应可用');
    await new Promise((resolve) => r.server.close(resolve));
    if (typeof r.server.closeAllConnections === 'function') r.server.closeAllConnections();
  } finally {
    await new Promise((r) => foreign.close(r));
  }
});

t.test('别人的服务不会被误认为本应用', async () => {
  const http = require('node:http');
  const alien = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('hello');
  });
  const alienPort = h.TEST_PORT_BASE + 4;
  await new Promise((r) => alien.listen(alienPort, '127.0.0.1', r));
  try {
    t.eq(await h.serverIndex.probeIsOurs(alienPort), false, '不应被识别为本应用');
  } finally {
    await new Promise((r) => alien.close(r));
  }
});

t.test('服务能正常停止并释放端口', async () => {
  await server.stop();
  await h.sleep(250);
  t.eq(await h.canConnect(server.port), false, '停止后端口应不可连接');
});

t.run();
