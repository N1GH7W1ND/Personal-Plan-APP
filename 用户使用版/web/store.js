/**
 * 前端状态容器。
 *
 * 职责：
 *   - 持有当前数据（唯一真相）
 *   - 提供 dispatch：改数据 → 通知订阅者 → 防抖保存到本机服务
 *   - 维护保存状态（已保存 / 保存中 / 保存失败 / 数据冲突）
 *   - 提供撤销（删除后悔药）
 *
 * 不碰 DOM：视图通过 subscribe 自己重绘，状态变化一律由此处广播。
 */

import * as api from './api.js';
import * as logic from './logic.js';

const SAVE_DEBOUNCE_MS = 400;

let state = logic.createInitialState();
let revision = 0;
let knownRevision = 0;
let saveTimer = null;
let saving = false;
let dirty = false;

/**
 * 数据代次。
 * 每次"重新读取"（打开页面、放弃本地改动、导入备份、清空）都会 +1，
 * 让此前排队的保存作废 —— 否则一次迟到的旧保存会把刚读进来的数据覆盖掉。
 */
let generation = 0;

/** 'idle' | 'unsaved' | 'saving' | 'saved' | 'error' | 'conflict' */
let saveStatus = 'idle';
let lastSavedAt = null;
let lastError = null;
let serverPath = '';
let recovered = false;
let recoveredFrom = null;

/** 累计改动次数（排查"一次点击改了两下"这类问题时很有用） */
let changeCount = 0;

const listeners = new Set();
const undoStack = logic.createUndoStack(50);

function emit(evt) {
  for (const fn of Array.from(listeners)) {
    try {
      fn(state, evt || {});
    } catch (err) {
      console.error('[订阅者出错]', err);
    }
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState() {
  return state;
}

export function getRevision() {
  return revision;
}

export function getStatus() {
  return {
    saveStatus,
    lastSavedAt,
    lastError,
    dirty,
    serverPath,
    recovered,
    recoveredFrom,
    revision,
    canUndo: undoStack.canUndo(),
    changeCount,
  };
}

export function setServerPath(p) {
  serverPath = p || '';
}

/** 从本机服务拉取数据（页面打开、放弃改动、导入、清空后都走这里） */
export async function load() {
  // 作废此前排队的保存，并取消待触发的防抖定时器
  generation += 1;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  const res = await api.pullState();
  state = logic.normalizeState(res.state);
  revision = Number(res.revision) || 0;
  knownRevision = revision;
  lastSavedAt = res.updatedAt || null;
  serverPath = res.path || '';
  recovered = !!res.recovered;
  recoveredFrom = res.recoveredFrom || null;
  saveStatus = 'saved';
  dirty = false;
  undoStack.clear();
  emit({ type: 'load' });
  return res;
}

/** 重新拉取（数据冲突时用户点"刷新"） */
export async function reload() {
  return load();
}

function markSaving() {
  saveStatus = 'saving';
  emit({ type: 'status' });
}

function markSaved() {
  saveStatus = 'saved';
  lastSavedAt = new Date().toISOString();
  lastError = null;
  dirty = false;
  emit({ type: 'status' });
}

function markError(message) {
  saveStatus = 'error';
  lastError = message;
  emit({ type: 'status' });
}

function markConflict() {
  saveStatus = 'conflict';
  lastError = '数据已在别处更新，请刷新后再改';
  emit({ type: 'status' });
}

/** 真正落盘 */
async function flush() {
  if (saving) return;
  if (!dirty) return;
  saving = true;
  markSaving();

  const myGeneration = generation;
  const payload = logic.clone(state);
  payload.revision = revision;

  try {
    const res = await api.pushState(payload, knownRevision);

    // 期间发生过重新读取（清空/导入/放弃改动）：这次结果作废，不能覆盖新数据
    if (myGeneration !== generation) return;

    if (res.ok) {
      revision = res.revision;
      knownRevision = res.revision;
      markSaved();
      // 保存期间又改了，再存一次
      if (dirty) scheduleSave(0);
    } else if (res.conflict) {
      markConflict();
    } else {
      markError(res.message || '保存失败');
    }
  } catch (err) {
    if (myGeneration !== generation) return;
    markError(err && err.message ? err.message : String(err));
  } finally {
    saving = false;
  }
}

function scheduleSave(delay) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flush();
  }, delay == null ? SAVE_DEBOUNCE_MS : delay);
}

/** 立刻保存（离开页面前用） */
export function flushNow() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  return flush();
}

/**
 * 改数据。
 * @param {(state, ctx) => any} mutator 直接改动 state
 * @param {{label?:string, undoable?:boolean, silent?:boolean}} opts
 */
export function dispatch(mutator, opts) {
  const options = opts || {};
  if (options.undoable) undoStack.remember(state);

  let result;
  try {
    result = mutator(state, { undoStack, logic });
  } catch (err) {
    console.error('[改动数据出错]', err);
    return null;
  }

  dirty = true;
  saveStatus = 'unsaved';
  changeCount += 1;
  emit({ type: 'change', label: options.label || '' });
  scheduleSave();
  return result;
}

/** 撤销最近一次（可撤销的）改动 */
export function undo() {
  const prev = undoStack.undo();
  if (!prev) return false;
  state = prev;
  dirty = true;
  emit({ type: 'change', label: '撤销' });
  scheduleSave(0);
  return true;
}

/**
 * 用服务端最新数据覆盖本地（冲突后用户选择"放弃我的改动"）
 */
export async function discardLocalAndReload() {
  undoStack.clear();
  return load();
}

/** 从备份文件恢复（覆盖式） */
export async function importFromFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  await api.importState(parsed);
  return load();
}

/** 导出备份文件 */
export function exportBackup() {
  api.downloadExport();
}

/** 清空全部数据 */
export async function clearAll() {
  await api.importState(logic.createInitialState());
  return load();
}

// 页面隐藏或关闭前，尽量把未保存的改动落盘
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && dirty) flushNow();
  });
  window.addEventListener('beforeunload', () => {
    if (dirty) flushNow();
  });
}
