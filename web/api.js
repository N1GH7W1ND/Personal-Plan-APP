/**
 * 与本地服务通信。
 * 所有请求都打本机 127.0.0.1，绝不访问外网。
 */

async function request(path, options) {
  const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options));
  let body = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  return { ok: res.ok, status: res.status, body: body || {} };
}

export async function pullState() {
  const r = await request('/api/state', { method: 'GET' });
  if (!r.ok) throw new Error((r.body && r.body.message) || '读取数据失败（HTTP ' + r.status + '）');
  return r.body;
}

/**
 * 推送全量数据。
 * @returns {{ok:boolean, conflict?:boolean, revision?:number, message?:string}}
 */
export async function pushState(state, baseRevision) {
  const r = await request('/api/state', {
    method: 'PUT',
    body: JSON.stringify({ state, baseRevision }),
  });

  if (r.status === 409) {
    return {
      ok: false,
      conflict: true,
      currentRevision: r.body.currentRevision,
      message: r.body.message || '数据已在别处更新',
    };
  }
  if (!r.ok) {
    return { ok: false, message: (r.body && r.body.message) || '保存失败（HTTP ' + r.status + '）' };
  }
  return { ok: true, revision: r.body.revision };
}

export async function health() {
  const r = await request('/api/health', { method: 'GET' });
  if (!r.ok) throw new Error('服务未响应');
  return r.body;
}

export async function importState(state) {
  const r = await request('/api/import', { method: 'POST', body: JSON.stringify(state) });
  if (!r.ok) throw new Error((r.body && r.body.message) || '恢复失败（HTTP ' + r.status + '）');
  return r.body;
}

export async function revealDataDir() {
  const r = await request('/api/reveal', { method: 'POST' });
  return r.body || { ok: false };
}

/** 触发浏览器下载导出文件 */
export function downloadExport() {
  const a = document.createElement('a');
  a.href = '/api/export';
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
