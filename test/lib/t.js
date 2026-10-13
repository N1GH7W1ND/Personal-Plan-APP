'use strict';
/**
 * 极简测试框架。无任何第三方依赖。
 * 用法：
 *   const t = require('./lib/t');
 *   t.test('名称', async () => { t.eq(1, 1); });
 *   t.run();
 */

const tests = [];
let currentFile = '';

function setFile(name) {
  currentFile = name;
}

function test(name, fn, opts) {
  tests.push({ file: currentFile, name, fn, opts: opts || {} });
}

class AssertionError extends Error {}

function fail(message) {
  throw new AssertionError(message);
}

function show(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function eq(actual, expected, label) {
  if (actual !== expected) {
    fail((label ? label + '：' : '') + '期望 ' + show(expected) + '，实际 ' + show(actual));
  }
}

function notEq(actual, unexpected, label) {
  if (actual === unexpected) {
    fail((label ? label + '：' : '') + '期望不等于 ' + show(unexpected));
  }
}

function deepEq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    fail((label ? label + '：' : '') + '期望 ' + b + '，实际 ' + a);
  }
}

function ok(value, label) {
  if (!value) fail((label ? label + '：' : '') + '期望为真，实际 ' + show(value));
}

function notOk(value, label) {
  if (value) fail((label ? label + '：' : '') + '期望为假，实际 ' + show(value));
}

function includes(haystack, needle, label) {
  if (String(haystack).indexOf(String(needle)) === -1) {
    fail((label ? label + '：' : '') + '期望包含 ' + show(needle) + '，实际为 ' + show(String(haystack).slice(0, 300)));
  }
}

function notIncludes(haystack, needle, label) {
  if (String(haystack).indexOf(String(needle)) !== -1) {
    fail((label ? label + '：' : '') + '期望不包含 ' + show(needle));
  }
}

function throws(fn, label) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) fail((label ? label + '：' : '') + '期望抛出异常，但没有');
}

async function rejects(promiseOrFn, label) {
  let threw = false;
  try {
    const p = typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn;
    await p;
  } catch {
    threw = true;
  }
  if (!threw) fail((label ? label + '：' : '') + '期望失败，但成功了');
}

async function run() {
  const filter = process.argv.find((a) => a.startsWith('--filter='));
  const needle = filter ? filter.split('=')[1] : null;
  const list = needle ? tests.filter((x) => (x.file + ' ' + x.name).includes(needle)) : tests;

  let pass = 0;
  const failures = [];
  const t0 = Date.now();
  let lastFile = null;

  console.log('');
  console.log('  运行测试：共 ' + list.length + ' 项' + (needle ? '（筛选：' + needle + '）' : ''));
  console.log('  ' + '─'.repeat(64));

  for (const item of list) {
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
      const detail = err && err.stack ? err.stack.split('\n').slice(0, 6).join('\n        ') : String(err);
      console.log('        ' + detail);
      failures.push({ file: item.file, name: item.name, error: err });
    }
  }

  const total = Date.now() - t0;
  console.log('');
  console.log('  ' + '─'.repeat(64));
  if (failures.length === 0) {
    console.log('  全部通过：' + pass + '/' + list.length + ' 项，用时 ' + total + 'ms');
  } else {
    console.log('  失败 ' + failures.length + ' 项，通过 ' + pass + '/' + list.length + ' 项，用时 ' + total + 'ms');
    console.log('');
    for (const f of failures) {
      console.log('   ✗ [' + f.file + '] ' + f.name);
      console.log('     ' + (f.error && f.error.message ? f.error.message : String(f.error)));
    }
  }
  console.log('');

  process.exitCode = failures.length === 0 ? 0 : 1;
  return { pass, total: list.length, failures };
}

module.exports = { test, setFile, run, eq, notEq, deepEq, ok, notOk, includes, notIncludes, throws, rejects, fail };
