/**
 * 日期工具。
 * 铁律：取"今天"必须用本地时间，禁止用 UTC 转字符串再截取前 10 位
 * （那样会因时区把日期算错一天）。
 */

export const WEEK_CN = ['一', '二', '三', '四', '五', '六', '日'];
export const WEEK_FULL_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Date → 'YYYY-MM-DD'（本地时间） */
export function toDateStr(d) {
  const t = d instanceof Date ? d : new Date(d);
  return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate());
}

/**
 * 'YYYY-MM-DD' → 本地零点的 Date。
 * 严格校验：月份/日期越界（如 2026-13-01、2026-02-30）一律返回 Invalid Date，
 * 不允许静默滚动到下一个月/下一年。
 */
export function parseDateStr(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return new Date(NaN);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return new Date(NaN);
  const date = new Date(y, mo - 1, d, 0, 0, 0, 0);
  // 反查一次，挡掉 2 月 30 日这类"格式合法但日期不存在"的输入
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return new Date(NaN);
  }
  return date;
}

/** 今天 'YYYY-MM-DD' */
export function todayStr() {
  return toDateStr(new Date());
}

/** ISO 时间戳（含时区），用于 createdAt / updatedAt */
export function nowIso() {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return (
    d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
    'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) +
    sign + pad2(Math.floor(abs / 60)) + ':' + pad2(abs % 60)
  );
}

/** 日期加减天数 */
export function addDays(s, n) {
  const d = parseDateStr(s);
  if (Number.isNaN(d.getTime())) return s;
  d.setDate(d.getDate() + Number(n || 0));
  return toDateStr(d);
}

/** 日期差：a - b 的天数 */
export function diffDays(a, b) {
  const da = parseDateStr(a);
  const db = parseDateStr(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 0;
  return Math.round((da.getTime() - db.getTime()) / 86400000);
}

/** 是否合法日期字符串 */
export function isValidDateStr(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return false;
  const d = parseDateStr(s);
  return !Number.isNaN(d.getTime()) && toDateStr(d) === s;
}

/** 星期几：1=周一 … 7=周日 */
export function weekdayNum(s) {
  const d = parseDateStr(s);
  if (Number.isNaN(d.getTime())) return 1;
  return d.getDay() === 0 ? 7 : d.getDay();
}

/** 本周一 */
export function startOfWeek(s) {
  const t = s || todayStr();
  return addDays(t, -(weekdayNum(t) - 1));
}

/** 本周 7 天的日期数组（周一起） */
export function weekDates(s) {
  const mon = startOfWeek(s);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

/** 星期中文，如 周三 */
export function weekdayCn(s) {
  return WEEK_FULL_CN[weekdayNum(s) - 1];
}

/** 'YYYY-MM-DD' → '10月8日 周三' */
export function fmtDateCn(s) {
  const d = parseDateStr(s);
  if (Number.isNaN(d.getTime())) return String(s || '');
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + weekdayCn(s);
}

/** 'YYYY-MM-DD' → '2026年10月8日' */
export function fmtDateFull(s) {
  const d = parseDateStr(s);
  if (Number.isNaN(d.getTime())) return String(s || '');
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

/** 相对描述：今天 / 明天 / 昨天 / 3 天后 / 2 天前 */
export function relativeDay(s) {
  const d = diffDays(s, todayStr());
  if (d === 0) return '今天';
  if (d === 1) return '明天';
  if (d === 2) return '后天';
  if (d === -1) return '昨天';
  if (d === -2) return '前天';
  if (d > 0 && d <= 6) return d + ' 天后';
  if (d < 0 && d >= -6) return (-d) + ' 天前';
  return fmtDateCn(s);
}

/** 'YYYY-MM-DD' → '10-08' */
export function fmtShort(s) {
  const d = parseDateStr(s);
  if (Number.isNaN(d.getTime())) return String(s || '');
  return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/** 'YYYY-MM-DDTHH:mm:ss+08:00' → '14:32' */
export function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

/** 'YYYY-MM-DDTHH:mm:ss+08:00' → '10-08 14:32' */
export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return fmtShort(toDateStr(d)) + ' ' + fmtTime(iso);
}

/**
 * 月历网格：返回该月 1 号前的空白数 + 该月天数
 * @returns {{daysInMonth:number, leadingBlanks:number, firstDay:string, monthLabel:string}}
 */
export function monthGrid(year, month /* 1-12 */) {
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const jsDow = first.getDay(); // 0=周日
  const leadingBlanks = (jsDow + 6) % 7; // 以周一为一周起点
  return {
    daysInMonth,
    leadingBlanks,
    firstDay: toDateStr(first),
    monthLabel: year + '年' + month + '月',
  };
}

/** 该月第 n 天的日期串 */
export function monthDay(year, month, day) {
  return toDateStr(new Date(year, month - 1, day));
}
