'use strict';
/**
 * 数据仓库：读写 data/data.json，负责原子写入、每日备份、损坏恢复、版本冲突检测。
 * 这是整个应用最不能出错的部分，因此所有写盘动作都走同一套流程。
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const config = require('./config');

let revealDataDir; // 延迟 require，避免在非 Windows 环境下 import 失败
try {
  ({ revealDataDir } = require('./reveal'));
} catch {
  revealDataDir = () => ({ ok: false, message: '当前系统不支持自动打开文件夹' });
}

/** 空数据模板（首次运行时的初始状态） */
function emptyState() {
  return {
    schemaVersion: 1,
    revision: 0,
    updatedAt: null,
    tasks: [],
    notes: [],
    devTasks: [],
    devIdeas: [],
    studyItems: [],
    diet: { meals: {}, recipes: [], shopping: [] },
    settings: { density: 'comfortable' },
  };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 统一的 JSON 序列化：格式化 + 结尾换行，方便人用记事本直接看 */
function serialize(state) {
  return JSON.stringify(state, null, 2) + '\n';
}

/** 本地时间戳，形如 20261008_143211（备份文件名用，禁用 UTC 以免串日期） */
function stamp(d) {
  const t = d instanceof Date ? d : new Date();
  return (
    t.getFullYear() + pad2(t.getMonth() + 1) + pad2(t.getDate()) +
    '_' + pad2(t.getHours()) + pad2(t.getMinutes()) + pad2(t.getSeconds())
  );
}

/** 本地日期，形如 2026-10-08（给人看） */
function dayStamp(d) {
  const t = d instanceof Date ? d : new Date();
  return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate());
}

/** 文件名用的日期前缀，形如 20261008（与 stamp() 的前半段一致） */
function dayStampCompact(d) {
  const t = d instanceof Date ? d : new Date();
  return t.getFullYear() + pad2(t.getMonth() + 1) + pad2(t.getDate());
}

/** 补齐缺失字段，容忍旧数据 / 手改数据 */
function normalize(input) {
  const base = emptyState();
  if (!input || typeof input !== 'object') return base;
  const out = Object.assign(base, input);

  // 已移除模块的字段直接丢掉（自媒体、咨询工作、游戏娱乐、健身计划）
  const removedFields = ['media', 'consultTasks', 'consultRecords', 'games', 'playPlan', 'studyLog', 'fitness'];
  for (const f of removedFields) delete out[f];

  const arrFields = ['tasks', 'notes', 'devTasks', 'devIdeas', 'studyItems'];
  for (const f of arrFields) {
    if (!Array.isArray(out[f])) out[f] = [];
  }

  // 已移除模块名下的任务也一并清掉（模块本身已不存在，留着会变成无处可去的孤儿数据）
  const removedModuleIds = ['media', 'consult', 'game', 'fitness'];
  out.tasks = out.tasks.filter((t) => t && !removedModuleIds.includes(t.module));

  if (!out.diet || typeof out.diet !== 'object') out.diet = { meals: {}, recipes: [], shopping: [] };
  if (!out.diet.meals || typeof out.diet.meals !== 'object' || Array.isArray(out.diet.meals)) out.diet.meals = {};
  if (!Array.isArray(out.diet.recipes)) out.diet.recipes = [];
  if (!Array.isArray(out.diet.shopping)) out.diet.shopping = [];

  if (!out.settings || typeof out.settings !== 'object') out.settings = {};
  // 健身模块移除后，设置里的健身目标也成了无用字段，一并清掉
  const removedSettings = ['fitnessWeeklyGoal'];
  for (const k of removedSettings) delete out.settings[k];
  if (out.settings.density !== 'compact' && out.settings.density !== 'comfortable') {
    out.settings.density = 'comfortable';
  }

  out.schemaVersion = 1;
  out.revision = Number.isFinite(out.revision) ? Number(out.revision) : 0;
  return out;
}

/** 判断一个对象是否像本应用的备份（导入时用） */
function looksLikeState(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  // 只要命中任意一个本应用特有的字段就认；旧备份里的 media/games 等也算（导入后会走 normalize 清理）
  const markers = ['tasks', 'notes', 'devTasks', 'devIdeas', 'studyItems', 'fitness', 'diet',
    'media', 'consultTasks', 'consultRecords', 'games', 'playPlan', 'settings', 'schemaVersion'];
  return markers.some((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

async function ensureDirs() {
  await fsp.mkdir(config.DATA_DIR, { recursive: true });
  await fsp.mkdir(config.BACKUP_DIR, { recursive: true });
}

/** 原子写入：先写临时文件并 fsync，再 rename 覆盖目标 */
async function atomicWrite(target, text) {
  await ensureDirs();
  const tmp = target + '.tmp';
  const fh = await fsp.open(tmp, 'w');
  try {
    await fh.writeFile(text, 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await fsp.rename(tmp, target);
  } catch (err) {
    // Windows 上目标存在时 rename 偶发失败，退化为先删再改名
    if (err && (err.code === 'EEXIST' || err.code === 'EPERM' || err.code === 'EACCES')) {
      try {
        await fsp.unlink(target);
      } catch { /* 目标本就不存在 */ }
      await fsp.rename(tmp, target);
    } else {
      try { await fsp.unlink(tmp); } catch { /* 清理失败可忽略 */ }
      throw err;
    }
  }
}

async function listBackups() {
  let names = [];
  try {
    names = await fsp.readdir(config.BACKUP_DIR);
  } catch {
    return [];
  }
  const files = [];
  for (const n of names) {
    if (!n.startsWith(config.BACKUP_PREFIX) || !n.endsWith('.json')) continue;
    const abs = path.join(config.BACKUP_DIR, n);
    let st;
    try {
      st = await fsp.stat(abs);
    } catch {
      continue;
    }
    files.push({ name: n, abs, mtime: st.mtimeMs, size: st.size });
  }
  // 按文件名（含时间戳）升序，最新的在最后
  files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return files;
}

/** 备份文件名（含时间戳 + 唯一后缀）。同一秒内多次备份也不会互相覆盖。 */
async function uniqueBackupPath(label) {
  const base = 'data_' + stamp() + (label ? '_' + label : '');
  let candidate = path.join(config.BACKUP_DIR, base + '.json');
  let n = 1;
  // 极短时间内连续备份时，stamp() 只精确到秒，这里补一个序号避免覆盖
  while (true) {
    try {
      await fsp.access(candidate);
      n += 1;
      candidate = path.join(config.BACKUP_DIR, base + '_' + n + '.json');
    } catch {
      return candidate;
    }
  }
}

/** 每天第一次写入前，留一份当日备份 */
async function dailyBackupIfNeeded() {
  let exists = false;
  try {
    await fsp.access(config.DATA_FILE);
    exists = true;
  } catch {
    exists = false;
  }
  if (!exists) {
    noteDiagnostic('dailyBackup: 无主文件，跳过');
    return null; // 还没有数据，无需备份
  }

  // 备份文件名形如 data_20261008_143211.json，所以前缀要用不带横线的日期
  const today = 'data_' + dayStampCompact();
  const backups = await listBackups();
  if (backups.some((b) => b.name.startsWith(today))) return null;

  const text = await fsp.readFile(config.DATA_FILE, 'utf8');
  const target = await uniqueBackupPath('');
  await atomicWrite(target, text);
  await rotateBackups();
  return target;
}

/**
 * 排查用的简短事件记录（最近 40 条）。
 * 默认不产生任何输出；只有测试或排障时通过 takeDiagnostics() 取出来看。
 */
const diagnostics = [];
function noteDiagnostic(msg) {
  diagnostics.push(msg);
  if (diagnostics.length > 40) diagnostics.shift();
}

/** 备份轮换：只保留最近 config.BACKUP_KEEP 份 */
async function rotateBackups() {
  const files = await listBackups();
  const extra = files.length - config.BACKUP_KEEP;
  const removed = [];
  for (let i = 0; i < extra; i++) {
    try {
      await fsp.unlink(files[i].abs);
      removed.push(files[i].name);
    } catch { /* 删不掉就留着，不影响主流程 */ }
  }
  return removed;
}

/** 强制做一份备份（导入、清空前调用） */
async function backupNow(tag) {
  await ensureDirs();
  let text;
  try {
    text = await fsp.readFile(config.DATA_FILE, 'utf8');
  } catch {
    return null;
  }
  const target = await uniqueBackupPath(tag);
  await atomicWrite(target, text);
  await rotateBackups();
  return target;
}

async function readRaw() {
  try {
    const text = await fsp.readFile(config.DATA_FILE, 'utf8');
    return { text, missing: false };
  } catch (err) {
    if (err.code === 'ENOENT') return { text: null, missing: true };
    // 路径被目录占了、权限不足、被别的程序锁住：这属于"读不出来"，
    // 交给上层按损坏处理并给出明确提示，而不是把异常抛到接口层变成 500。
    if (err.code === 'EISDIR' || err.code === 'EACCES' || err.code === 'EPERM' || err.code === 'EBUSY') {
      return { text: null, missing: false, unreadable: err.code };
    }
    throw err;
  }
}

/** 从最新可用备份里找一个能解析的 */
async function recoverFromBackup() {
  const backups = await listBackups();
  for (let i = backups.length - 1; i >= 0; i--) {
    try {
      const text = await fsp.readFile(backups[i].abs, 'utf8');
      const parsed = JSON.parse(text);
      return { state: normalize(parsed), from: backups[i].name };
    } catch {
      continue; // 这份坏了，继续往前找
    }
  }
  return null;
}

/**
 * 读取数据。
 * 文件不存在 → 返回空模板；文件损坏 → 隔离坏文件并从备份恢复。
 */
async function read() {
  await ensureDirs();
  const raw = await readRaw();

  if (raw.missing) {
    // 首次运行：把空模板真正写到磁盘，
    // 这样"数据文件"从第一天起就看得见、摸得着，也能被备份流程纳入。
    const state = emptyState();
    state.revision = 0;
    state.updatedAt = new Date().toISOString();
    const text = serialize(state);
    try {
      await atomicWrite(config.DATA_FILE, text);
    } catch (err) {
      // 写不进去（例如目录只读）不应让应用起不来，但要留下明确线索
      console.error('[数据] 初始化 data.json 失败：' + err.message);
    }
    return {
      state,
      revision: 0,
      updatedAt: state.updatedAt,
      sizeBytes: Buffer.byteLength(text, 'utf8'),
      recovered: false,
      missing: true,
      initialized: true,
    };
  }

  // 读不出来（路径被目录占了 / 权限不足 / 被锁住）：不要抛异常，退回安全状态并明确告知
  if (raw.unreadable) {
    const found = await recoverFromBackup();
    const state = found ? normalize(found.state) : emptyState();
    if (found) state.revision = Number(state.revision || 0);
    return {
      state,
      revision: state.revision || 0,
      updatedAt: state.updatedAt || null,
      sizeBytes: 0,
      recovered: true,
      recoveredFrom: found ? found.from : null,
      unreadable: raw.unreadable,
      readOnly: true,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw.text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('顶层不是对象');
  } catch {
    // 坏文件先留证据，再尝试恢复
    const brokenName = 'data.broken_' + stamp() + '.json';
    const brokenPath = path.join(config.BACKUP_DIR, brokenName);
    let moved = false;
    try {
      await ensureDirs();
      await fsp.rename(config.DATA_FILE, brokenPath);
      moved = true;
    } catch {
      try {
        await atomicWrite(brokenPath, raw.text);
        await fsp.unlink(config.DATA_FILE);
        moved = true;
      } catch { moved = false; }
    }

    const found = await recoverFromBackup();
    if (found) {
      found.state.revision = Number(found.state.revision || 0) + 1;
      found.state.updatedAt = new Date().toISOString();
      const text = serialize(found.state);
      let written = true;
      try {
        await atomicWrite(config.DATA_FILE, text);
      } catch (err) {
        // 写不回去（只读目录等）：仍然把恢复后的数据交出去用，但要说清楚没能写回
        written = false;
        console.error('[数据] 恢复后写回失败：' + err.message);
      }
      return {
        state: found.state,
        revision: found.state.revision,
        updatedAt: found.state.updatedAt,
        sizeBytes: Buffer.byteLength(text, 'utf8'),
        recovered: true,
        recoveredFrom: found.from,
        brokenMoved: moved,
        readOnly: !written,
      };
    }

    const fresh = emptyState();
    fresh.revision = 1;
    fresh.updatedAt = new Date().toISOString();
    const text = serialize(fresh);
    let written = true;
    try {
      await atomicWrite(config.DATA_FILE, text);
    } catch (err) {
      written = false;
      console.error('[数据] 重建数据文件失败：' + err.message);
    }
    return {
      state: fresh,
      revision: 1,
      updatedAt: fresh.updatedAt,
      sizeBytes: Buffer.byteLength(text, 'utf8'),
      recovered: true,
      recoveredFrom: null,
      brokenMoved: moved,
      readOnly: !written,
    };
  }

  const state = normalize(parsed);
  const revision = Number.isFinite(parsed.revision) ? Number(parsed.revision) : 0;

  // 规范化会改动旧数据（例如清掉已移除模块的字段、补上缺失字段）。
  // 如果只把结果放在内存里，磁盘上就会留下一份"看着干净、其实还带着旧字段"的文件：
  // 每次启动都要重新清理，导出的备份与实际文件也会不一致。
  // 所以这里比较一次，确有改动就写回磁盘。
  // 注意：不动 revision，也不改 updatedAt——内容语义没变，
  // 改版本号会让多窗口冲突检测误报，改时间会让人以为"数据被改过"。
  let sanitized = false;
  let sanitizeFailed = null;
  const normalizedText = serialize(state);
  if (normalizedText !== raw.text) {
    try {
      await atomicWrite(config.DATA_FILE, normalizedText);
      sanitized = true;
    } catch (err) {
      // 写不进去（只读目录等）不该让应用起不来：内存里已经是清理后的状态，
      // 但要把失败明确记下来，避免"以为已经清理了"。
      sanitizeFailed = err.message;
      console.error('[数据] 清理旧字段后写回失败：' + err.message);
    }
  }

  return {
    state,
    revision,
    updatedAt: parsed.updatedAt || null,
    sizeBytes: Buffer.byteLength(sanitized ? normalizedText : raw.text, 'utf8'),
    recovered: false,
    missing: false,
    sanitized,
    sanitizeFailed,
  };
}

/**
 * 写入数据。
 * baseRevision 与磁盘上的 revision 不一致时拒绝写入（返回 ok:false），防止多窗口互相覆盖。
 */
async function write(nextState, baseRevision) {
  await ensureDirs();
  const current = await read();

  const base = Number(baseRevision);
  if (Number.isFinite(base) && base !== current.revision) {
    return { ok: false, currentRevision: current.revision };
  }

  // 备份是"尽力而为"：备份失败不该让主流程崩掉，但会记录日志
  try {
    await dailyBackupIfNeeded();
  } catch (err) {
    console.error('[数据] 每日备份失败（不影响本次写入）：' + err.message);
  }

  const state = normalize(nextState);
  state.revision = current.revision + 1;
  state.updatedAt = new Date().toISOString();

  const text = serialize(state);
  try {
    await atomicWrite(config.DATA_FILE, text);
  } catch (err) {
    // 写不进去必须明确失败，绝不能假装保存成功（否则用户会以为数据已存）
    return { ok: false, writeFailed: true, code: err.code || 'WRITE_FAILED', message: err.message };
  }

  return { ok: true, revision: state.revision, updatedAt: state.updatedAt };
}

/** 导入备份：先给当前数据留一份，再整体覆盖 */
async function importState(incoming) {
  await ensureDirs();
  const current = await read();
  let preBackup = null;
  try {
    preBackup = await backupNow('preimport');
  } catch { preBackup = null; }

  const state = normalize(incoming);
  state.revision = current.revision + 1;
  state.updatedAt = new Date().toISOString();
  await atomicWrite(config.DATA_FILE, serialize(state));
  return { ok: true, revision: state.revision, preBackup };
}

/** 清空全部数据：先备份，再写空 */
async function clearAll() {
  const out = await importState(emptyState());
  return out;
}

/** 进程内快照（health 用） */
let cache = null;
function snapshot() {
  if (!cache) {
    return { state: emptyState(), revision: 0, updatedAt: null, sizeBytes: 0, cached: false };
  }
  return cache;
}
async function refreshSnapshot() {
  const r = await read();
  cache = { state: r.state, revision: r.revision, updatedAt: r.updatedAt, sizeBytes: r.sizeBytes };
  return cache;
}

function revealDataDirSafe() {
  try {
    fs.mkdirSync(config.DATA_DIR, { recursive: true });
  } catch { /* 已存在 */ }
  try {
    return revealDataDir(config.DATA_DIR);
  } catch (err) {
    return { ok: false, message: '打开文件夹失败：' + err.message };
  }
}

module.exports = {
  emptyState,
  normalize,
  looksLikeState,
  serialize,
  stamp,
  dayStamp,
  read,
  write,
  importState,
  clearAll,
  backupNow,
  rotateBackups,
  listBackups,
  dailyBackupIfNeeded,
  atomicWrite,
  snapshot,
  refreshSnapshot,
  revealDataDir: revealDataDirSafe,
  /** 切换数据目录（测试用独立目录，或启动参数 --data-dir 指定） */
  useDataDir(dir) {
    const abs = path.resolve(dir);
    config.DATA_DIR = abs;
    config.DATA_FILE = path.join(abs, 'data.json');
    config.BACKUP_DIR = path.join(abs, 'backups');
    return abs;
  },

  /** 排查用：读取并清空诊断记录 */
  takeDiagnostics() {
    const out = diagnostics.slice();
    diagnostics.length = 0;
    return out;
  },
};
