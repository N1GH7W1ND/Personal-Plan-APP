/**
 * 前端测试运行器（ES Module 版）。
 * 与 test/lib/t.js 同款输出，但用 import 加载 web/ 下的 ES Module。
 *
 * 为什么不用 node --test：
 * 它需要派生子进程执行测试文件，而当前开发环境禁止测试进程创建子进程，
 * 会导致测试静默失败。这里自己在当前进程内顺序执行，行为可控、结果可靠。
 *
 * 用法： node test/run-frontend.mjs [test/xxx.mjs ...]
 *       不带参数则自动加载 test/web-*.mjs
 */

import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');

const registry = [];
const teardowns = [];
let currentFile = '';

export function setFile(name) {
  currentFile = name;
}

export function test(name, fn) {
  registry.push({ file: currentFile, name, fn });
}

/** 注册收尾动作：全部用例跑完后依次执行（用于关服务、清理临时目录） */
export function after(fn) {
  teardowns.push(fn);
}

class AssertionError extends Error {}

function show(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

function fail(message) {
  throw new AssertionError(message);
}

export function eq(actual, expected, label) {
  if (actual !== expected) fail((label ? label + '：' : '') + '期望 ' + show(expected) + '，实际 ' + show(actual));
}

export function notEq(actual, unexpected, label) {
  if (actual === unexpected) fail((label ? label + '：' : '') + '期望不等于 ' + show(unexpected));
}

export function deepEq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) fail((label ? label + '：' : '') + '期望 ' + b + '，实际 ' + a);
}

export function ok(value, label) {
  if (!value) fail((label ? label + '：' : '') + '期望为真，实际 ' + show(value));
}

export function notOk(value, label) {
  if (value) fail((label ? label + '：' : '') + '期望为假，实际 ' + show(value));
}

export function includes(haystack, needle, label) {
  if (String(haystack).indexOf(String(needle)) === -1) {
    fail((label ? label + '：' : '') + '期望包含 ' + show(needle));
  }
}

export function notIncludes(haystack, needle, label) {
  if (String(haystack).indexOf(String(needle)) !== -1) {
    fail((label ? label + '：' : '') + '期望不包含 ' + show(needle));
  }
}

export function throws(fn, label) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) fail((label ? label + '：' : '') + '期望抛出异常，但没有');
}

/** 收集测试文件：未指定则用 test/web-*.mjs */
function collectFiles(argv) {
  const fromArgs = argv.filter((a) => a.endsWith('.mjs') && !a.startsWith('--'));
  if (fromArgs.length) {
    // 支持 test/web-store.mjs 这类相对路径，也支持只写文件名
    return fromArgs.map((a) => {
      if (existsSync(a)) return resolve(a);
      const inTest = join(here, a);
      return existsSync(inTest) ? inTest : resolve(a);
    });
  }
  return readdirSync(here)
    .filter((f) => f.startsWith('web-') && f.endsWith('.mjs'))
    .sort()
    .map((f) => join(here, f));
}

async function main() {
  const files = collectFiles(process.argv.slice(2));
  if (files.length === 0) {
    console.log('  没有找到前端测试文件（test/web-*.mjs）');
    return;
  }

  // 先全部加载（注册用例），再统一执行
  for (const f of files) {
    await import(pathToFileURL(f).href);
  }

  let pass = 0;
  const failures = [];
  const t0 = Date.now();
  let lastFile = null;

  console.log('');
  console.log('  运行前端测试：共 ' + registry.length + ' 项');
  console.log('  ' + '─'.repeat(64));

  for (const item of registry) {
    if (item.file !== lastFile) {
      console.log('');
      console.log('  【' + item.file + '】');
      lastFile = item.file;
    }
    const started = Date.now();
    try {
      await item.fn();
      pass++;
      const ms = Date.now() - started;
      console.log('    ✓ ' + item.name + (ms > 200 ? '  (' + ms + 'ms)' : ''));
    } catch (err) {
      const ms = Date.now() - started;
      console.log('    ✗ ' + item.name + '  (' + ms + 'ms)');
      const detail = err && err.stack ? err.stack.split('\n').slice(0, 5).join('\n        ') : String(err);
      console.log('        ' + detail);
      failures.push(item);
    }
  }

  const total = Date.now() - t0;
  console.log('');
  console.log('  ' + '─'.repeat(64));
  if (failures.length === 0) {
    console.log('  全部通过：' + pass + '/' + registry.length + ' 项，用时 ' + total + 'ms');
  } else {
    console.log('  失败 ' + failures.length + ' 项，通过 ' + pass + '/' + registry.length + ' 项，用时 ' + total + 'ms');
    console.log('');
    for (const f of failures) {
      console.log('   ✗ [' + f.file + '] ' + f.name);
    }
  }
  console.log('');

  // 收尾（关服务、清临时目录）。收尾失败不影响用例判定。
  for (const fn of teardowns) {
    try {
      await fn();
    } catch (err) {
      console.error('  收尾动作出错：' + (err && err.message ? err.message : err));
    }
  }

  process.exitCode = failures.length === 0 ? 0 : 1;
  finish();
}

/**
 * 兜底退出。
 * 只设 process.exitCode 是不够的：万一还有服务句柄或定时器活着，
 * 事件循环就不会空，进程会一直挂着（曾经因此让整轮测试假死 3 分钟）。
 * 正常路径给一点时间让输出刷完即可；出错路径要主动收尾再退。
 */
function finish({ hard } = {}) {
  const code = process.exitCode || 0;
  setTimeout(() => {
    if (hard) process.exit(code);
    // 正常情况下先让事件循环自己空掉，空不掉再强制退出
    setTimeout(() => process.exit(code), 1500);
  }, 50);
}

main().catch(async (err) => {
  console.error('前端测试运行器出错：', err);
  process.exitCode = 1;
  // 出错时把已经起来的服务关掉，否则端口会一直被占着
  for (const fn of teardowns) {
    try {
      await fn();
    } catch { /* 出错路径下收尾失败不必再报 */ }
  }
  finish({ hard: true });
});
