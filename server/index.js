'use strict';
/**
 * 本地服务入口。
 * 只监听 127.0.0.1，不对外网开放。
 *
 * 结构上分成两半：
 *   start()  —— 纯逻辑，负责挑端口、识别"是不是本应用已在运行"，可被测试直接调用
 *   main()   —— 命令行入口，负责打印信息、开浏览器、退出
 */

const http = require('node:http');
const { spawn } = require('node:child_process');
const config = require('./config');
const staticServer = require('./static');
const api = require('./api');
const store = require('./store');

const APP_TITLE = '我的工作台';

function openBrowser(url) {
  try {
    if (process.env.DSH_NO_BROWSER === '1') return;
    if (process.platform === 'win32') {
      // 用 start 打开默认浏览器；cmd 需要空标题参数，否则会把 URL 当窗口标题
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    console.log('（自动打开浏览器失败，请手动在浏览器输入上面的地址）');
  }
}

/** 探测某个端口上是否已经跑着本应用；是则返回 health 数据，否则 false */
function probeIsOurs(port) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: config.HOST, port, path: '/api/health', method: 'GET', timeout: 1200 },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { if (body.length < 8192) body += c; });
        res.on('end', () => {
          try {
            const j = JSON.parse(body);
            resolve(j && j.name === APP_TITLE ? j : false);
          } catch {
            resolve(false);
          }
        });
      }
    );
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
    req.end();
  });
}

const requestHandler = async (req, res) => {
  const urlPath = (req.url || '/').split('?')[0].split('#')[0];

  if (urlPath.startsWith('/api/')) {
    try {
      const handled = await api.handle(req, res, urlPath);
      if (handled) return;
      api.sendJson(res, 404, { ok: false, code: 'NO_ROUTE', message: '没有这个接口：' + urlPath });
      return;
    } catch (err) {
      console.error('[接口出错]', urlPath, err && err.message);
      if (!res.headersSent) {
        api.sendJson(res, 500, { ok: false, code: 'SERVER_ERROR', message: '服务端出错：' + (err && err.message) });
      } else {
        res.destroy();
      }
      return;
    }
  }

  try {
    await staticServer.serve(req, res, urlPath);
  } catch (err) {
    console.error('[静态文件出错]', urlPath, err && err.message);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('500 服务端出错');
    } else {
      res.destroy();
    }
  }
};

function createServer() {
  const server = http.createServer(requestHandler);
  server.keepAliveTimeout = 5000;
  return server;
}

function listenOn(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener('listening', onOk);
      reject(err);
    };
    const onOk = () => {
      server.removeListener('error', onError);
      resolve(port);
    };
    server.once('error', onError);
    server.once('listening', onOk);
    server.listen(port, config.HOST);
  });
}

function candidatePorts(explicit) {
  if (explicit && explicit.length) return explicit.slice();
  const list = [];
  for (let p = config.PORT_START; p <= config.PORT_END; p++) list.push(p);
  return list;
}

/**
 * 找端口并启动。
 * 若发现本应用已在运行，返回 { reused:true, port, url, health }，不重复启动。
 * @returns {{reused:boolean, server?:object, port:number, url:string, health?:object}}
 */
async function start(explicitPorts) {
  installProcessGuards();
  const candidates = candidatePorts(explicitPorts);
  const server = createServer();

  for (const port of candidates) {
    const health = await probeIsOurs(port);
    if (health) {
      const url = 'http://' + config.HOST + ':' + port + '/';
      return { reused: true, port, url, health, server: null };
    }

    try {
      await listenOn(server, port);
      return { reused: false, server, port, url: 'http://' + config.HOST + ':' + port + '/' };
    } catch (err) {
      if (err && err.code === 'EADDRINUSE') {
        console.log('  端口 ' + port + ' 被占用，换下一个…');
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    '端口 ' + candidates[0] + '–' + candidates[candidates.length - 1] +
    ' 全部被占用或被其他程序占用，请关闭占用程序，或修改 server/config.js 里的端口范围'
  );
}

/**
 * 进程级兜底。
 * 客户端强行断线（客户端取消、浏览器关标签、超大请求被拒后收线）会让 socket 抛错，
 * 这类错误不代表应用出问题，但绝不能让整个服务因为一行噪声而崩掉。
 */
function installProcessGuards() {
  if (global.__workbenchGuardsInstalled) return;
  global.__workbenchGuardsInstalled = true;

  const report = (label, err) => {
    const code = err && err.code;
    if (code === 'ECONNRESET' || code === 'EPIPE' || code === 'ERR_STREAM_DESTROYED') return;
    console.error('[' + label + '] ' + (err && err.message ? err.message : String(err)));
  };

  process.on('uncaughtException', (err) => {
    report('未捕获异常', err);
  });
  process.on('unhandledRejection', (reason) => {
    report('未处理的 Promise 拒绝', reason);
  });
}

async function main() {
  // 支持 --data-dir=... 指定数据目录（测试与高级用法）
  const argDataDir = process.argv.find((a) => a.startsWith('--data-dir='));
  if (argDataDir) store.useDataDir(argDataDir.split('=').slice(1).join('='));

  const argPort = process.argv.find((a) => a.startsWith('--port='));
  const explicit = argPort ? [Number(argPort.split('=')[1])] : null;

  // 保证数据目录存在，并预热一次读取（首次运行会创建 data.json）
  await store.read();

  const result = await start(explicit);

  if (result.reused) {
    console.log('');
    console.log('  本应用已经在运行，直接打开：');
    console.log('  ' + result.url);
    console.log('');
    openBrowser(result.url);
    return result;
  }

  const { server, port, url } = result;

  console.log('');
  console.log('  ┌────────────────────────────────────────────┐');
  console.log('  │            我的工作台  已启动              │');
  console.log('  └────────────────────────────────────────────┘');
  console.log('');
  console.log('  访问地址：' + url);
  console.log('  数据文件：' + config.DATA_FILE);
  console.log('  备份目录：' + config.BACKUP_DIR);
  console.log('');
  console.log('  数据只保存在本机，关闭此窗口即停止服务。');
  console.log('  按 Ctrl+C 退出。');
  console.log('');

  openBrowser(url);

  const shutdown = () => {
    console.log('\n  正在停止服务…');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return result;
}

if (require.main === module) {
  main()
    .then((result) => {
      // 已在运行说明无需本进程继续占用，直接退出
      if (result && result.reused) process.exit(0);
    })
    .catch((err) => {
      console.error('');
      console.error('  启动失败：' + (err && err.message));
      console.error('');
      process.exitCode = 1;
    });
}

module.exports = { main, start, createServer, requestHandler, probeIsOurs, openBrowser, APP_TITLE };
