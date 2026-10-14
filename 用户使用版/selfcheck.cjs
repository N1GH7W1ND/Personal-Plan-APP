'use strict';
/**
 * 自检：确认这个文件夹里的程序能正常启动。
 *
 * 做法（不依赖任何测试框架，普通用户点一下就能跑）：
 *   1. 在一个空闲端口、用一个临时数据目录，把服务起起来
 *   2. 请求 /api/health，检查它报的名字对不对、各模块字段齐不齐
 *   3. 请求首页，检查返回的是一张完整的 HTML
 *   4. 在临时目录里写一条任务，再读回来，确认读写没问题
 *   5. 关掉服务、删掉临时目录，打印结论
 *
 * 全程**不碰用户的 data 目录**（用的是系统临时目录）。
 * 退出码 0 = 一切正常；非 0 = 有问题。
 */

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const config = require('./server/config');
const store = require('./server/store');
const index = require('./server/index');

const results = [];
function check(label, pass, detail) {
  results.push({ label, pass: !!pass, detail: detail || '' });
  console.log('  ' + (pass ? '[OK]  ' : '[FAIL]') + ' ' + label + (detail ? '  — ' + detail : ''));
}

function get(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: urlPath, method: 'GET', timeout: 5000 },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时：' + urlPath)); });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('');
  console.log('  我的工作台 · 自检');
  console.log('  --------------------------------------------');

  const tmpDir = path.join(os.tmpdir(), 'workbench-selfcheck-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  // 换到临时数据目录，避免动到真实数据
  store.useDataDir(tmpDir);

  let server = null;
  try {
    check('系统有 Node.js 运行时', true, process.version);
    check('程序文件能找到', fs.existsSync(path.join(__dirname, 'server', 'index.js')) &&
      fs.existsSync(path.join(__dirname, 'web', 'index.html')));

    // 起服务（自动挑空闲端口）
    const started = await index.start(null);
    server = started.server;
    const port = started.port;
    /*
     * 注意：如果这台机器上已经有一个本应用在跑，index.start() 会返回
     * reused:true 并且 server 为 null —— 那是"已经跑着"而不是失败。
     * 早先这里只看 !!server，导致这种正常情况被报成 [FAIL]。
     */
    check('服务能启动', started.reused === true || !!server,
      started.reused ? '已有实例在运行，直接复用它（端口 ' + port + '）' : '端口 ' + port);

    // /api/health
    const health = await get(port, '/api/health');
    let healthJson = null;
    try { healthJson = JSON.parse(health.body); } catch { /* 下面会判定失败 */ }
    check('接口 /api/health 正常', health.status === 200 && healthJson && healthJson.name === index.APP_TITLE,
      healthJson ? '名称：' + healthJson.name : '返回内容无法解析');
    check('数据统计字段齐全（说明各模块都在）',
      !!(healthJson && healthJson.stats && healthJson.stats['任务'] !== undefined),
      healthJson && healthJson.stats ? Object.keys(healthJson.stats).length + ' 项' : '');

    // 首页
    const home = await get(port, '/');
    check('首页能打开', home.status === 200 && /<html/i.test(home.body) && home.body.length > 500,
      '返回 ' + home.body.length + ' 字节');
    check('前端脚本能被浏览器取到', (await get(port, '/app.js')).status === 200);
    check('样式表能被浏览器取到', (await get(port, '/styles.css')).status === 200);

    // 读写一轮
    const st = await store.read();
    st.state.tasks = st.state.tasks || [];
    st.state.tasks.push({ id: 'selfcheck1', title: '自检写入', module: 'general', date: '2026-01-01', done: false });
    await store.write(st.state, st.revision);
    const back = await store.read();
    check('数据能写进文件再读回来',
      back.state.tasks.some((t) => t.id === 'selfcheck1'), '共 ' + back.state.tasks.length + ' 条任务');
    check('数据文件确实落在磁盘上', fs.existsSync(path.join(tmpDir, 'data.json')));
  } catch (err) {
    check('自检过程中没有报错', false, (err && err.message) || String(err));
  } finally {
    if (server) {
      await new Promise((resolve) => {
        server.close(() => resolve());
        setTimeout(resolve, 1500);
      });
    }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
  }

  const failed = results.filter((r) => !r.pass);
  console.log('  --------------------------------------------');
  if (failed.length === 0) {
    console.log('  结论：全部通过（' + results.length + ' 项）。程序可以正常使用。');
    console.log('');
    return 0;
  }
  console.log('  结论：有 ' + failed.length + ' 项没通过，程序可能有问题：');
  for (const f of failed) console.log('    · ' + f.label + (f.detail ? '  — ' + f.detail : ''));
  console.log('');
  return 1;
}

main()
  .then((code) => { process.exit(code); })
  .catch((err) => {
    console.error('  自检本身出错了：' + ((err && err.message) || err));
    process.exit(1);
  });
