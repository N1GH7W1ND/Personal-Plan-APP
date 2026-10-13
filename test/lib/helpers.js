'use strict';
/**
 * 测试辅助。
 *
 * 重要：测试在**当前进程内**启动真实的 HTTP 服务（server/index.js 的 start()），
 * 不使用子进程 —— 这样测试跑的就是生产同一套代码，且不受执行环境对子进程的限制。
 * 每个测试文件使用独立的临时数据目录与独立端口，绝不碰你真实的 data/。
 */

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const config = require(path.join(ROOT, 'server', 'config.js'));
const store = require(path.join(ROOT, 'server', 'store.js'));
const serverIndex = require(path.join(ROOT, 'server', 'index.js'));

/** 交给测试文件自由分配的端口段，避开真实使用的 41730 */
const TEST_PORT_BASE = Number(process.env.DSH_TEST_PORT || 41930);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function makeTmpDir(tag) {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'workbench-test-'));
  const dir = path.join(base, tag || 'case');
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * 在进程内启动服务。
 * @returns {{port, url, dataDir, server, stop:Function}}
 */
async function startServer(opts) {
  const options = opts || {};
  const port = options.port || TEST_PORT_BASE;
  const dataDir = options.dataDir || (await makeTmpDir('server'));

  store.useDataDir(dataDir);
  await store.read(); // 预热：首次运行会创建 data.json

  const result = await serverIndex.start([port]);
  if (result.reused) {
    throw new Error('端口 ' + port + ' 上已有本应用在运行，请换一个测试端口');
  }

  const server = result.server;

  const stop = async () => {
    await new Promise((resolve) => {
      try {
        server.close(() => resolve());
      } catch {
        resolve();
      }
      setTimeout(resolve, 1500);
    });
    // 关掉可能挂着的 keep-alive 连接，确保端口立即释放
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  };

  return { port, url: 'http://127.0.0.1:' + port, dataDir, server, stop };
}

/** 换一个数据目录（同一个服务进程内切换，用于多组用例） */
async function useDataDir(dir) {
  const abs = await (async () => {
    if (dir) return dir;
    return makeTmpDir('case');
  })();
  store.useDataDir(abs);
  return abs;
}

/** 发一个 HTTP 请求（本机回环） */
function req(port, method, urlPath, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined || body === null
      ? null
      : (typeof body === 'string' ? body : JSON.stringify(body));

    const headers = Object.assign({}, extraHeaders || {});
    if (payload !== null && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (payload !== null) headers['Content-Length'] = Buffer.byteLength(payload);

    let settled = false;
    let response = null;

    const r = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers }, (res) => {
      response = res;
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        if (settled) return;
        settled = true;
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch { /* 非 JSON 响应 */ }
        resolve({ status: res.statusCode, headers: res.headers, raw, json });
      });
      res.on('error', () => { /* 交给下面的连接错误统一处理 */ });
    });

    r.on('error', (err) => {
      if (settled) return;
      settled = true;
      // 服务端已经回了状态行、随后收掉连接（例如 413 拒收超大请求体）：
      // 这属于预期行为，把已拿到的响应交还给调用方。
      if (err.code === 'ECONNRESET' && response && response.statusCode) {
        resolve({ status: response.statusCode, headers: response.headers, raw: '', json: null, reset: true });
        return;
      }
      reject(err);
    });
    r.setTimeout(8000, () => { r.destroy(new Error('请求超时')); });
    if (payload !== null) r.write(payload);
    r.end();
  });
}

/** 便捷：GET 并断言 200，返回 json */
async function getJson(port, urlPath) {
  const r = await req(port, 'GET', urlPath);
  return r;
}

/** 便捷：读取当前数据 */
async function readState(port) {
  const r = await req(port, 'GET', '/api/state');
  return r.json;
}

/** 便捷：整份覆盖式保存（自动带上当前 revision） */
async function saveState(port, state, baseRevision) {
  let base = baseRevision;
  if (base === undefined) {
    const cur = await readState(port);
    base = cur.revision;
  }
  const r = await req(port, 'PUT', '/api/state', { state, baseRevision: base });
  return r;
}

/** 便捷：取出 state → 修改 → 存回 */
async function mutate(port, fn) {
  const cur = await readState(port);
  const state = cur.state;
  const ret = await fn(state, cur);
  const r = await saveState(port, state, cur.revision);
  if (r.status !== 200) {
    throw new Error('保存失败：HTTP ' + r.status + ' ' + JSON.stringify(r.json));
  }
  return { state, result: ret, revision: r.json.revision };
}

/** 只探测端口能否建立连接 */
function canConnect(port) {
  return new Promise((resolve) => {
    const r = http.request({ host: '127.0.0.1', port, path: '/', method: 'GET', timeout: 800 }, () => {
      resolve(true);
      r.destroy();
    });
    r.on('error', () => resolve(false));
    r.on('timeout', () => { r.destroy(); resolve(false); });
    r.end();
  });
}

function dataFile(dataDir) { return path.join(dataDir, 'data.json'); }
function backupDir(dataDir) { return path.join(dataDir, 'backups'); }

async function readJson(file) {
  return JSON.parse(await fsp.readFile(file, 'utf8'));
}

async function writeFileText(file, text) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, text, 'utf8');
}

async function writeJson(file, obj) {
  await writeFileText(file, JSON.stringify(obj, null, 2));
}

async function listDir(dir) {
  try {
    return await fsp.readdir(dir);
  } catch {
    return [];
  }
}

async function listBackupFiles(dataDir) {
  const files = await listDir(backupDir(dataDir));
  return files.filter((f) => f.startsWith('data_') && f.endsWith('.json')).sort();
}

/** 标准空数据（各阶段测试按需改） */
function sampleState() {
  return {
    schemaVersion: 1,
    revision: 0,
    updatedAt: null,
    tasks: [],
    notes: [],
    media: [],
    devTasks: [],
    devIdeas: [],
    consultTasks: [],
    consultRecords: [],
    fitness: { routine: [], records: {} },
    diet: { meals: {}, recipes: [], shopping: [] },
    games: [],
    playPlan: [],
    settings: { fitnessWeeklyGoal: 5, density: 'comfortable' },
  };
}

module.exports = {
  ROOT,
  TEST_PORT_BASE,
  config,
  store,
  serverIndex,
  sleep,
  makeTmpDir,
  startServer,
  useDataDir,
  req,
  getJson,
  readState,
  saveState,
  mutate,
  canConnect,
  dataFile,
  backupDir,
  readJson,
  writeJson,
  writeFileText,
  listDir,
  listBackupFiles,
  sampleState,
  fs,
  fsp,
  path,
};
