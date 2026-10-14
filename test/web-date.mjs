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
    'views/reading.js', 'views/diet.js', 'views/fitness.js', 'views/settings.js'];
  for (const f of files) {
    const abs = join(ROOT, 'web', f);
    // 这些文件都是必须存在的：缺文件应当直接报出来，而不是被静默跳过
    ok(existsSync(abs), '缺少前端文件 web/' + f);
    const code = codeOnly(readFileSync(abs, 'utf8'));
    eq(/toISOString\s*\(\s*\)\s*\.\s*slice/.test(code), false, f + ' 里用 toISOString().slice 取日期了');
  }
  // 已移除的模块视图不应还在磁盘上
  // 仅列出仍然移除的模块（健身已加回来，因此不在此列）
  for (const gone of ['views/media.js', 'views/consult.js', 'views/games.js']) {
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

/*
 * 下拉选项的可读性。
 * 起因：深色主题下 <select> 的弹出面板由系统绘制，默认是白底；
 * 而选项文字继承了界面的浅色，于是"白底浅字"几乎看不清也点不准。
 */
test('样式表：深色界面的下拉选项有明确配色，不会白底浅字（R14）', () => {
  const css = readFileSync(join(ROOT, 'web', 'styles.css'), 'utf8');
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');

  // :root 必须声明深色配色方案，原生控件（下拉面板/日期选择器/滚动条）才会跟着深色
  const rootBlock = /:root\s*\{([\s\S]*?)\}/.exec(code);
  ok(rootBlock, '应有 :root 块');
  includes(rootBlock[1], 'color-scheme: dark',
    ':root 应声明 color-scheme: dark，否则原生下拉面板会是系统白底');

  // 选项本身也要有底色与文字色，不能只靠 select 本体
  const optionBlock = /\.select\s+option\s*\{([^}]*)\}/.exec(code);
  ok(optionBlock, '应有 .select option 规则（否则选项会沿用系统默认配色）');
  includes(optionBlock[1], 'background', '下拉选项应有显式底色');
  includes(optionBlock[1], 'color', '下拉选项应有显式文字色');

  // select 本体也要显式给出文字色与底色，避免继承出问题
  const selectBlock = /\.select\s*\{([^}]*)\}/.exec(code);
  ok(selectBlock, '应有 .select 规则');
  includes(selectBlock[1], 'color:', '.select 本体应显式指定文字色');
  includes(selectBlock[1], 'background', '.select 本体应显式指定底色');
});

test('样式表：图表空档不再用斑马纹空柱（R15）', () => {
  const css = readFileSync(join(ROOT, 'web', 'styles.css'), 'utf8');
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');

  // 旧的空柱写法是给空档铺浅色重复斜纹，深色主题下非常刺眼
  notIncludes(code, 'repeating-linear-gradient(45deg, #f7f9fc',
    '不该再用浅色斑马纹做空柱（那是浅色主题的残留）');

  /*
   * 注意用选择器 + 左花括号来断言，而不是裸类名：
   * 裸类名会被 ".bar-empty-dot-DISABLED" 这类改名后的写法误判为"还在"，
   * 那样的检查等于没有（这条曾经就是因此抓不到问题）。
   */
  ok(/\.bar-empty-dot\s*\{/.test(code), '应有一条 .bar-empty-dot 的小点样式规则');
  ok(/\.bar\.empty\s+\.bar-track\s*\{/.test(code),
    '空档的柱子容器仍应有独立样式（保留日期结构，而不是整根不画）');
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
    '--m-dev', '--m-study', '--m-reading', '--m-diet', '--ok', '--danger', '--warn']) {
    ok(defined.has(v), '应定义设计变量 ' + v);
  }
});

/*
 * 可读性检查：深色主题最容易踩的坑是"文字和底一样深，看不清"。
 * 这里直接算 WCAG 对比度，把"看得清"变成可断言的数字。
 */
test('样式表：深色主题下文字与背景的对比度足够（看得清）', () => {
  const css = readFileSync(join(ROOT, 'web', 'styles.css'), 'utf8');

  const hexOf = (name) => {
    const m = new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})').exec(css);
    ok(m, '设计变量 --' + name + ' 应是 6 位十六进制色值');
    return m[1];
  };
  const toRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (rgb) => {
    const c = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = (a, b) => {
    const l1 = lum(toRgb(a));
    const l2 = lum(toRgb(b));
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  // 卡片是半透明叠在底色上，按 alpha 合成算出实际看到的颜色
  const composite = (rgba, bgHex) => {
    const m = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(rgba);
    const bg = toRgb(bgHex);
    const a = Number(m[4]);
    const fg = [Number(m[1]), Number(m[2]), Number(m[3])];
    return '#' + fg.map((v, i) => Math.round(v * a + bg[i] * (1 - a))
      .toString(16).padStart(2, '0')).join('');
  };

  const bg = hexOf('bg');
  const panelToken = /--panel:\s*(rgba\([^)]+\))/.exec(css);
  ok(panelToken, '--panel 应是 rgba 半透明色（毛玻璃卡片）');
  const panel = composite(panelToken[1], bg);

  // 卡片上：正文/次要 ≥ 7，辅助 ≥ 4.5
  ok(contrast(hexOf('text'), panel) >= 7,
    '正文与卡片对比度应 ≥ 7:1（实际 ' + contrast(hexOf('text'), panel).toFixed(2) + '）');
  ok(contrast(hexOf('text-2'), panel) >= 7,
    '次要文字与卡片对比度应 ≥ 7:1（实际 ' + contrast(hexOf('text-2'), panel).toFixed(2) + '）');
  ok(contrast(hexOf('text-3'), panel) >= 4.5,
    '辅助文字与卡片对比度应 ≥ 4.5:1（实际 ' + contrast(hexOf('text-3'), panel).toFixed(2) + '）');

  // 底色上同样要够清楚
  ok(contrast(hexOf('text'), bg) >= 7, '正文与底色对比度应 ≥ 7:1');
  ok(contrast(hexOf('text-2'), bg) >= 7, '次要文字与底色对比度应 ≥ 7:1');
  ok(contrast(hexOf('text-3'), bg) >= 4.5, '辅助文字与底色对比度应 ≥ 4.5:1');

  // 强调色（主色/警示/危险/成功/模块色）作为文字也要能看清
  for (const name of ['primary', 'warn', 'danger', 'ok', 'm-dev', 'm-study', 'm-reading', 'm-diet']) {
    ok(contrast(hexOf(name), panel) >= 4.5,
      '强调色 --' + name + ' 与卡片对比度应 ≥ 4.5:1（实际 '
      + contrast(hexOf(name), panel).toFixed(2) + '）');
  }

  // 主按钮用亮底 + 深字，同样要过关
  ok(contrast('#06101f', hexOf('primary')) >= 4.5,
    '主按钮上的深色文字与主色对比度应 ≥ 4.5:1（实际 '
    + contrast('#06101f', hexOf('primary')).toFixed(2) + '）');
});

test('样式表：颜色值格式合法，没有写坏的色值', () => {  const css = readFileSync(join(ROOT, 'web', 'styles.css'), 'utf8');
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

/*
 * 星空/月亮是先用 body::before / ::after 铺的一层固定装饰。
 * 这一层一旦压住内容，整个界面就"看不见也点不动"了，
 * 所以层级与指针穿透必须固定住。
 */
test('样式表：装饰层不会盖住内容，也不会拦住点击', () => {
  const css = readFileSync(join(ROOT, 'web', 'styles.css'), 'utf8');
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');

  // 装饰层：不吃指针事件
  const decoBlock = /body::before,\s*body::after\s*\{([^}]*)\}/.exec(code);
  ok(decoBlock, '应有 body::before / body::after 装饰层');
  includes(decoBlock[1], 'pointer-events: none', '装饰层必须 pointer-events:none，否则会挡住点击');
  includes(decoBlock[1], 'position: fixed', '装饰层应固定铺满视口');

  // 装饰层的层级
  const decoZ = /body::before,\s*body::after\s*\{[^}]*z-index:\s*(\d+)/.exec(code);
  ok(decoZ, '装饰层应显式声明 z-index');
  const decoLevel = Number(decoZ[1]);

  // 内容层（.app）的层级必须高于装饰层
  const appBlock = /\.app\s*\{([^}]*)\}/.exec(code);
  ok(appBlock, '应有 .app 规则');
  const appZ = /z-index:\s*(\d+)/.exec(appBlock[1]);
  ok(appZ, '.app 必须显式声明 z-index（否则固定装饰层会盖住整个界面）');
  ok(Number(appZ[1]) > decoLevel,
    '.app 的 z-index（' + appZ[1] + '）必须高于装饰层（' + decoLevel + '）');
  includes(appBlock[1], 'position: relative', '.app 需要 position 才能让 z-index 生效');

  // 月亮与星点都应该在装饰层里画
  includes(code, 'body::before', '应有星点层');
  includes(code, 'body::after', '应有月亮层');
});
