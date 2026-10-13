/**
 * 前端测试：日期工具（web/date.js）
 *
 * 重点：本地时区安全。取"今天"绝不能用 toISOString().slice(0,10)，
 * 否则在东八区，本地 0:00–8:00 之间会把日期算成前一天。
 */

import { test, setFile, eq, deepEq, ok, notEq, includes, notIncludes, throws } from './run-frontend.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');

setFile('前端 · 日期工具');

const date = await import(new URL('../web/date.js', import.meta.url).href);

const pad2 = (n) => String(n).padStart(2, '0');
const strOf = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());

test('模块导出的接口齐全', () => {
  const need = ['toDateStr', 'parseDateStr', 'todayStr', 'nowIso', 'addDays', 'diffDays',
    'weekdayNum', 'startOfWeek', 'weekDates', 'weekdayCn', 'fmtDateCn', 'fmtDateFull',
    'relativeDay', 'fmtShort', 'fmtTime', 'fmtDateTime', 'monthGrid', 'monthDay', 'isValidDateStr'];
  for (const name of need) {
    eq(typeof date[name], 'function', '缺少导出：' + name);
  }
});

test('toDateStr 使用本地时间而不是 UTC', () => {
  // 本地 2026-01-01 00:30；在 UTC+8 下其 UTC 日期仍是 2025-12-31
  const local = new Date(2026, 0, 1, 0, 30, 0);
  eq(date.toDateStr(local), '2026-01-01', '本地日期应为 1 月 1 日');

  const isoSlice = local.toISOString().slice(0, 10);
  if (isoSlice !== '2026-01-01') {
    notEq(date.toDateStr(local), isoSlice, '不应与 UTC 切片结果相同');
  }
});

test('todayStr 与本地日历一致', () => {
  eq(date.todayStr(), strOf(new Date()));
});

/** 去掉注释与字符串字面量，只看真正的代码 */
function codeOnly(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // 块注释
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ') // 行注释（保留 http:// 这类）
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

test('date.js 内部不使用 UTC 截取的方式取日期', () => {
  const code = codeOnly(readFileSync(join(ROOT, 'web', 'date.js'), 'utf8'));
  eq(/toISOString\s*\(\s*\)\s*\.\s*slice/.test(code), false, 'date.js 的实现里不应出现 toISOString().slice');
  eq(/getUTC\w+/.test(code), false, 'date.js 的实现里不应使用 getUTC* 系列');
});

test('前端各模块源码里没有用 toISOString().slice(0,10) 取日期', () => {
  const files = ['app.js', 'store.js', 'logic.js', 'router.js', 'ui.js', 'api.js',
    'views/home.js', 'views/today.js', 'views/dev.js', 'views/study.js',
    'views/diet.js', 'views/settings.js'];
  for (const f of files) {
    const abs = join(ROOT, 'web', f);
    // 这些文件都是必须存在的：缺文件应当直接报出来，而不是被静默跳过
    ok(existsSync(abs), '缺少前端文件 web/' + f);
    const code = codeOnly(readFileSync(abs, 'utf8'));
    eq(/toISOString\s*\(\s*\)\s*\.\s*slice/.test(code), false, f + ' 里用 toISOString().slice 取日期了');
  }
  // 已移除的模块视图不应还在磁盘上
  for (const gone of ['views/media.js', 'views/consult.js', 'views/games.js', 'views/fitness.js']) {
    eq(existsSync(join(ROOT, 'web', gone)), false, '已移除的视图不该还存在：web/' + gone);
  }
});

test('parseDateStr 解析到本地零点', () => {  const d = date.parseDateStr('2026-10-08');
  eq(d.getFullYear(), 2026, '年');
  eq(d.getMonth(), 9, '月（0 基）');
  eq(d.getDate(), 8, '日');
  eq(d.getHours(), 0, '时');
  eq(d.getMinutes(), 0, '分');
});

test('parseDateStr 对非法输入返回 Invalid Date 而不是乱猜', () => {
  ok(Number.isNaN(date.parseDateStr('2026-13-01').getTime()), '月份越界不应滚到次年');
  ok(Number.isNaN(date.parseDateStr('2026-00-10').getTime()), '0 月无效');
  ok(Number.isNaN(date.parseDateStr('2026-02-30').getTime()), '2 月 30 日不存在');
  ok(Number.isNaN(date.parseDateStr('2026-04-31').getTime()), '4 月没有 31 日');
  ok(Number.isNaN(date.parseDateStr('').getTime()), '空串');
  ok(Number.isNaN(date.parseDateStr(null).getTime()), 'null');
  ok(Number.isNaN(date.parseDateStr('2026/10/08').getTime()), '斜杠格式不接受');

  // 边界：合法值必须仍然解析成功
  eq(date.toDateStr(date.parseDateStr('2026-02-28')), '2026-02-28', '2 月 28 日合法');
  eq(date.toDateStr(date.parseDateStr('2024-02-29')), '2024-02-29', '闰年 2 月 29 日合法');
  eq(date.toDateStr(date.parseDateStr('2026-12-31')), '2026-12-31', '年末合法');
});

test('isValidDateStr 能识破不存在的日期', () => {
  eq(date.isValidDateStr('2026-10-08'), true, '合法日期');
  eq(date.isValidDateStr('2026-02-30'), false, '2 月 30 日不存在');
  eq(date.isValidDateStr('2026-2-3'), false, '必须是补零格式');
  eq(date.isValidDateStr('abc'), false, '非日期');
});

test('addDays 跨越月份与年份', () => {
  eq(date.addDays('2026-10-08', 1), '2026-10-09');
  eq(date.addDays('2026-10-31', 1), '2026-11-01');
  eq(date.addDays('2026-12-31', 1), '2027-01-01');
  eq(date.addDays('2026-03-01', -1), '2026-02-28');
  eq(date.addDays('2024-03-01', -1), '2024-02-29', '闰年');
  eq(date.addDays('2026-10-08', 0), '2026-10-08');
  eq(date.addDays('2026-10-08', -100), '2026-06-30');
});

test('diffDays 计算正确', () => {
  eq(date.diffDays('2026-10-09', '2026-10-08'), 1);
  eq(date.diffDays('2026-10-08', '2026-10-09'), -1);
  eq(date.diffDays('2026-10-08', '2026-10-08'), 0);
  eq(date.diffDays('2027-01-01', '2026-12-31'), 1);
});

test('weekdayNum 以周一为 1、周日为 7', () => {
  eq(date.weekdayNum('2026-10-05'), 1, '2026-10-05 是周一');
  eq(date.weekdayNum('2026-10-08'), 4, '2026-10-08 是周四');
  eq(date.weekdayNum('2026-10-11'), 7, '2026-10-11 是周日');
});

test('startOfWeek 与 weekDates 以周一开头', () => {
  eq(date.startOfWeek('2026-10-08'), '2026-10-05');
  eq(date.startOfWeek('2026-10-05'), '2026-10-05', '周一自身');
  eq(date.startOfWeek('2026-10-11'), '2026-10-05', '周日归到本周');
  deepEq(date.weekDates('2026-10-08'), [
    '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
  ]);
});

test('中文日期格式化', () => {
  eq(date.weekdayCn('2026-10-08'), '周四');
  eq(date.fmtDateCn('2026-10-08'), '10月8日 周四');
  eq(date.fmtDateFull('2026-10-08'), '2026年10月8日');
  eq(date.fmtShort('2026-10-08'), '10-08');
});

test('relativeDay 给出人话描述', () => {
  const today = date.todayStr();
  eq(date.relativeDay(today), '今天');
  eq(date.relativeDay(date.addDays(today, 1)), '明天');
  eq(date.relativeDay(date.addDays(today, -1)), '昨天');
  eq(date.relativeDay(date.addDays(today, 2)), '后天');
  eq(date.relativeDay(date.addDays(today, -2)), '前天');
  eq(date.relativeDay(date.addDays(today, 3)), '3 天后');
  eq(date.relativeDay(date.addDays(today, -3)), '3 天前');
  eq(date.relativeDay(date.addDays(today, 10)), date.fmtDateCn(date.addDays(today, 10)), '超过 6 天回落到日期');
});

test('nowIso 带时区偏移且能解析回同一时刻', () => {
  const iso = date.nowIso();
  ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(iso), '格式应为带偏移的 ISO：' + iso);
  const back = new Date(iso);
  eq(Number.isNaN(back.getTime()), false, '应能被 Date 解析');
  ok(Math.abs(back.getTime() - Date.now()) < 5000, '解析回来应接近当前时刻');
});

test('fmtTime / fmtDateTime 处理空值不报错', () => {
  eq(date.fmtTime(null), '');
  eq(date.fmtDateTime(null), '—');
  eq(date.fmtDateTime('乱七八糟'), '—');
  const iso = date.nowIso();
  ok(/^\d{2}:\d{2}$/.test(date.fmtTime(iso)), 'fmtTime 形如 14:32');
  ok(/^\d{2}-\d{2} \d{2}:\d{2}$/.test(date.fmtDateTime(iso)), 'fmtDateTime 形如 10-08 14:32');
});

test('月历网格：以周一为起点，天数正确', () => {
  const g = date.monthGrid(2026, 10);
  eq(g.daysInMonth, 31, '2026 年 10 月天数');
  eq(g.leadingBlanks, 3, '10 月 1 日是周四，前面空 3 格');
  eq(g.monthLabel, '2026年10月');
  eq(g.firstDay, '2026-10-01');

  const feb = date.monthGrid(2026, 2);
  eq(feb.daysInMonth, 28, '平年 2 月');
  eq(feb.leadingBlanks, 6, '周日应排在最后，前面空 6 格');

  eq(date.monthGrid(2024, 2).daysInMonth, 29, '闰年 2 月 29 天');
});

test('monthDay 生成正确的日期串', () => {
  eq(date.monthDay(2026, 10, 8), '2026-10-08');
  eq(date.monthDay(2026, 1, 1), '2026-01-01');
  eq(date.monthDay(2026, 12, 31), '2026-12-31');
});

/* ---------------- 样式表健康检查 ---------------- */

test('样式表：括号配对，且 var() 引用的变量都有定义', () => {
  const css = readFileSync(join(ROOT, 'web', 'styles.css'), 'utf8');

  // 大括号必须配对，否则后面的样式会整段失效
  const open = (css.match(/\{/g) || []).length;
  const close = (css.match(/\}/g) || []).length;
  eq(open, close, 'styles.css 的大括号应配对（{ 有 ' + open + ' 个，} 有 ' + close + ' 个）');
  ok(open > 100, '样式表应当有实质内容（实际 ' + open + ' 个规则块）');

  // 设计变量：:root 里定义的 + 局部作用域里定义的，都要能被引用到
  const defined = new Set();
  for (const m of css.matchAll(/(^|\s)(--[a-z0-9-]+)\s*:/g)) defined.add(m[2]);

  const used = new Set();
  for (const m of css.matchAll(/var\((--[a-z0-9-]+)/g)) used.add(m[1]);

  const missing = [...used].filter((v) => !defined.has(v));
  eq(missing.length, 0, '这些变量被引用但没有定义：' + missing.join(', '));

  // 核心变量必须存在（缺了会让整页配色失效）
  for (const v of ['--bg', '--panel', '--text', '--text-2', '--text-3',
    '--primary', '--primary-weak', '--line', '--radius', '--shadow',
    '--m-dev', '--m-study', '--m-diet', '--ok', '--danger', '--warn']) {
    ok(defined.has(v), '应定义设计变量 ' + v);
  }
});

test('样式表：颜色值格式合法，没有写坏的色值', () => {
  const css = readFileSync(join(ROOT, 'web', 'styles.css'), 'utf8');
  // 去掉注释后再检查，避免注释里的示例被误判
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');

  // 十六进制颜色必须是 3/6/8 位
  for (const m of code.matchAll(/#[0-9a-fA-F]+/g)) {
    const hex = m[0];
    ok([4, 7, 9].includes(hex.length), '色值位数不对：' + hex);
  }

  // 不允许出现明显的拼写错误
  notIncludes(code, 'var(--)', '出现了空的 var()');
  notIncludes(code, 'undefined', '样式里出现了 undefined');
  notIncludes(code, 'NaN', '样式里出现了 NaN');
});
