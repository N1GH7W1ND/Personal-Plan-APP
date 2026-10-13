'use strict';
/**
 * API 路由表。
 * 只处理 /api/*；返回 true 表示已处理。
 */

const config = require('./config');
const store = require('./store');

function sendJson(res, code, data, extraHeaders) {
  const body = Buffer.from(JSON.stringify(data), 'utf8');
  res.writeHead(code, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': config.NO_STORE,
  }, extraHeaders || {}));
  res.end(body);
}

function sendText(res, code, text, extraHeaders) {
  const body = Buffer.from(String(text), 'utf8');
  res.writeHead(code, Object.assign({
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': config.NO_STORE,
  }, extraHeaders || {}));
  res.end(body);
}

/**
 * 读取请求体。
 * 两道闸：先看 Content-Length，超限立刻拒绝（不缓冲 20MB）；
 * 再看实际累计字节，防止用 chunked 绕过 Content-Length。
 */
async function readBody(req, limit) {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) {
    const err = new Error('请求内容过大');
    err.code = 'TOO_LARGE';
    req.pause();
    throw err;
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on('data', (c) => {
      if (aborted) return;
      size += c.length;
      if (size > limit) {
        aborted = true;
        const err = new Error('请求内容过大');
        err.code = 'TOO_LARGE';
        req.pause();
        reject(err);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (err) => {
      if (aborted) return;
      reject(err);
    });
  });
}

/** 设置页展示用的统计 */
function statsOf(state) {
  return {
    任务: (state.tasks || []).length,
    备忘: (state.notes || []).length,
    开发待办: (state.devTasks || []).length,
    灵感: (state.devIdeas || []).length,
    学习条目: (state.studyItems || []).length,
    菜谱: (state.diet && state.diet.recipes ? state.diet.recipes.length : 0),
    采买: (state.diet && state.diet.shopping ? state.diet.shopping.length : 0),
  };
}

function snapshotSummary() {
  const snap = store.snapshot();
  return { revision: snap.revision, updatedAt: snap.updatedAt };
}

/** health 前先刷新一次快照，保证数字是最新的 */
async function refreshHealthSnapshot() {
  try {
    await store.refreshSnapshot();
  } catch { /* 读失败时沿用旧快照 */ }
}

async function handle(req, res, urlPath) {
  const method = req.method.toUpperCase();
  const route = method + ' ' + urlPath;

  // 客户端中途断开（例如超大请求被拒后收线）不应产生未捕获异常
  req.on('error', (err) => {
    if (err && err.code !== 'ECONNRESET' && err.code !== 'EPIPE' && err.code !== 'ERR_STREAM_DESTROYED') {
      console.error('[请求出错]', urlPath, err.message);
    }
  });
  res.on('error', () => { /* 响应期间连接已断开，忽略即可 */ });

  // ---- GET /api/health ----
  if (route === 'GET /api/health') {
    await refreshHealthSnapshot();
    const snap = store.snapshot();
    sendJson(res, 200, {
      ok: true,
      name: '我的工作台',
      version: 1,
      revision: snap.revision,
      updatedAt: snap.updatedAt,
      dataFile: config.DATA_FILE,
      dataDir: config.DATA_DIR,
      backupDir: config.BACKUP_DIR,
      sizeKB: Math.round((snap.sizeBytes || 0) / 1024 * 10) / 10,
      stats: statsOf(snap.state),
    });
    return true;
  }

  // ---- GET /api/state ----
  if (route === 'GET /api/state') {
    const result = await store.read();
    sendJson(res, 200, {
      state: result.state,
      revision: result.revision,
      updatedAt: result.updatedAt,
      path: config.DATA_FILE,
      sizeKB: Math.round((result.sizeBytes || 0) / 1024 * 10) / 10,
      recovered: !!result.recovered,
      recoveredFrom: result.recoveredFrom || null,
    });
    return true;
  }

  // ---- PUT /api/state ----
  if (route === 'PUT /api/state') {
    let raw;
    try {
      raw = await readBody(req, config.MAX_BODY);
    } catch (err) {
      if (err.code === 'TOO_LARGE') {
        sendJson(res, 413, { ok: false, code: 'TOO_LARGE', message: '请求内容超过 20MB 上限' });
        // 响应已发出后再收掉这条连接，确保客户端能拿到 413 而不是连接被重置
        setTimeout(() => { try { req.destroy(); } catch { /* 已断开 */ } }, 60);
        return true;
      }
      throw err;
    }

    let payload;
    try {
      payload = JSON.parse(raw || '{}');
    } catch {
      sendJson(res, 400, { ok: false, code: 'BAD_JSON', message: '请求体不是合法 JSON' });
      return true;
    }

    if (!payload || typeof payload !== 'object' || !payload.state || typeof payload.state !== 'object') {
      sendJson(res, 400, { ok: false, code: 'BAD_PAYLOAD', message: '缺少 state 字段' });
      return true;
    }

    const out = await store.write(payload.state, payload.baseRevision);
    if (!out.ok && out.writeFailed) {
      // 写不进磁盘：不能报成功，也不能说成"数据冲突"
      sendJson(res, 500, {
        ok: false,
        code: 'WRITE_FAILED',
        message: '数据没能写入文件：' + (out.message || '未知原因'),
      });
      return true;
    }
    if (!out.ok) {
      sendJson(res, 409, {
        ok: false,
        code: 'REVISION_CONFLICT',
        message: '数据已在别处更新',
        currentRevision: out.currentRevision,
      });
      return true;
    }
    sendJson(res, 200, { ok: true, revision: out.revision, updatedAt: out.updatedAt });
    return true;
  }

  // ---- GET /api/export ----
  if (route === 'GET /api/export') {
    const result = await store.read();
    const body = Buffer.from(store.serialize(result.state), 'utf8');
    const cnName = '工作台备份_' + store.stamp(new Date()) + '.json';
    const asciiName = 'workbench-backup_' + store.stamp(new Date()) + '.json';
    // HTTP 头只允许 ASCII，中文文件名走 RFC 5987 的 filename* 形式
    const disposition = 'attachment; filename="' + asciiName + '"; filename*=UTF-8\'\'' + encodeURIComponent(cnName);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
      'Content-Disposition': disposition,
      'Cache-Control': config.NO_STORE,
    });
    res.end(body);
    return true;
  }

  // ---- POST /api/import ----
  if (route === 'POST /api/import') {
    let raw;
    try {
      raw = await readBody(req, config.MAX_BODY);
    } catch (err) {
      if (err.code === 'TOO_LARGE') {
        sendJson(res, 413, { ok: false, code: 'TOO_LARGE', message: '备份文件超过 20MB 上限' });
        setTimeout(() => { try { req.destroy(); } catch { /* 已断开 */ } }, 60);
        return true;
      }
      throw err;
    }

    let incoming;
    try {
      incoming = JSON.parse(raw);
    } catch {
      sendJson(res, 400, { ok: false, code: 'BAD_JSON', message: '备份文件不是合法 JSON' });
      return true;
    }
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      sendJson(res, 400, { ok: false, code: 'BAD_PAYLOAD', message: '备份文件内容不是对象' });
      return true;
    }
    if (!store.looksLikeState(incoming)) {
      sendJson(res, 400, { ok: false, code: 'NOT_A_BACKUP', message: '这不像本应用导出的备份文件' });
      return true;
    }

    const out = await store.importState(incoming);
    sendJson(res, 200, { ok: true, revision: out.revision, preBackup: out.preBackup });
    return true;
  }

  // ---- POST /api/reveal ----
  if (route === 'POST /api/reveal') {
    const result = store.revealDataDir();
    sendJson(res, result.ok ? 200 : 500, result);
    return true;
  }

  return false;
}

module.exports = { handle, sendJson, sendText, readBody, statsOf };
