/**
 * 通用界面组件。
 * 只提供"造东西"和"弹东西"的能力，不含任何具体模块的业务规则。
 */

import * as date from './date.js';
import { moduleName } from './logic.js';

/* ---------------- 基础 ---------------- */

export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 查询：qs(root, '.a') */
export function qs(root, sel) {
  return (root || document).querySelector(sel);
}

export function qsa(root, sel) {
  return Array.from((root || document).querySelectorAll(sel));
}

/**
 * 事件绑定：事件委托。
 * bind(root, 'click', '[data-act="del"]', (el, ev) => {})
 */
export function bind(root, type, selector, handler) {
  if (!root) return () => {};
  const fn = (ev) => {
    const target = ev.target && ev.target.closest ? ev.target.closest(selector) : null;
    if (!target || !root.contains(target)) return;
    handler(target, ev);
  };
  root.addEventListener(type, fn);
  return () => root.removeEventListener(type, fn);
}

export function attr(name, value) {
  return value == null || value === false ? '' : ' ' + name + '="' + escapeHtml(value) + '"';
}

/**
 * 生成 data-* 属性。
 * 注意：键本身就是 data-xxx 时不再重复加前缀（否则会变成 data-data-xxx，
 * 属性名不对，事件委托就取不到值）。
 */
export function dataAttrs(obj) {
  return Object.keys(obj || {})
    .filter((k) => obj[k] != null && obj[k] !== false)
    .map((k) => {
      const name = /^data-/i.test(k) ? k : 'data-' + k;
      return ' ' + name + '="' + escapeHtml(obj[k]) + '"';
    })
    .join('');
}

/* ---------------- 小块 ---------------- */

export function card(opts) {
  const o = opts || {};
  const head = o.title
    ? '<div class="card-head"><h2 class="card-title">' + escapeHtml(o.title) +
      (o.sub ? ' <span class="card-sub">' + escapeHtml(o.sub) + '</span>' : '') +
      '</h2>' + (o.actions || '') + '</div>'
    : '';
  const bodyClass = 'card-body' + (o.tight ? ' tight' : '') + (o.flush ? ' flush' : '');
  const foot = o.footer ? '<div class="card-foot">' + o.footer + '</div>' : '';
  return '<section class="card' + (o.className ? ' ' + o.className : '') + '"' +
    (o.id ? ' id="' + escapeHtml(o.id) + '"' : '') + '>' +
    head + '<div class="' + bodyClass + '">' + (o.body || '') + '</div>' + foot +
    '</section>';
}

export function progressBar(percent) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  return '<div class="progress"><div class="progress-bar" style="width:' + p + '%"></div></div>';
}

export function empty(icon, text, hint) {
  return '<div class="empty"><span class="empty-icon">' + escapeHtml(icon || '○') + '</span>' +
    escapeHtml(text || '这里还是空的') +
    (hint ? '<div class="empty-hint">' + escapeHtml(hint) + '</div>' : '') +
    '</div>';
}

export function tag(text, cls) {
  return '<span class="tag' + (cls ? ' ' + cls : '') + '">' + escapeHtml(text) + '</span>';
}

/** 来源模块标签（可点击跳转时传 clickable + data-route 等） */
export function moduleTag(moduleId, extra) {
  return '<span class="tag m-' + escapeHtml(moduleId) + (extra && extra.clickable ? ' clickable' : '') + '"' +
    (extra ? dataAttrs(extra.attrs || {}) : '') + '>' + escapeHtml(moduleName(moduleId)) + '</span>';
}

export function stat(num, label) {
  return '<div class="stat"><div class="stat-num">' + escapeHtml(num) + '</div>' +
    '<div class="stat-label">' + escapeHtml(label) + '</div></div>';
}

export function statRow(items) {
  return '<div class="stat-row">' + (items || []).map((i) => stat(i.num, i.label)).join('') + '</div>';
}

export function check(on, attrs) {
  return '<button type="button" class="check' + (on ? ' on' : '') + '"' +
    (attrs ? dataAttrs(attrs) : '') + ' aria-pressed="' + (on ? 'true' : 'false') + '">' +
    (on ? '✓' : '') + '</button>';
}

export function input(name, value, placeholder, extra) {
  return '<input class="input" type="text" data-field="' + escapeHtml(name) + '" value="' +
    escapeHtml(value == null ? '' : value) + '" placeholder="' + escapeHtml(placeholder || '') + '"' +
    (extra || '') + '>';
}

export function textarea(name, value, placeholder, rows) {
  return '<textarea class="textarea" data-field="' + escapeHtml(name) + '" rows="' + (rows || 3) +
    '" placeholder="' + escapeHtml(placeholder || '') + '">' + escapeHtml(value || '') + '</textarea>';
}

export function select(name, value, options, extra) {
  const opts = (options || []).map((o) =>
    '<option value="' + escapeHtml(o.value) + '"' + (String(o.value) === String(value) ? ' selected' : '') + '>' +
    escapeHtml(o.label) + '</option>').join('');
  return '<select class="select" data-field="' + escapeHtml(name) + '"' + (extra || '') + '>' + opts + '</select>';
}

/** 图标按钮 */
export function iconBtn(glyph, attrs, title, disabled) {
  return '<button type="button" class="icon-btn"' + (attrs ? dataAttrs(attrs) : '') +
    ' title="' + escapeHtml(title || '') + '"' + (disabled ? ' disabled' : '') + '>' + escapeHtml(glyph) + '</button>';
}

export function btn(label, attrs, cls, title) {
  return '<button type="button" class="btn' + (cls ? ' ' + cls : '') + '"' +
    (attrs ? dataAttrs(attrs) : {}) + (title ? ' title="' + escapeHtml(title) + '"' : '') + '>' +
    escapeHtml(label) + '</button>';
}

/** 日期切换条 */
export function dateBar(day, opts) {
  const o = opts || {};
  const rel = date.relativeDay(day);
  const showRel = rel !== date.fmtDateCn(day);
  return '<div class="date-bar">' +
    btn('◀', { act: 'prev-day' }, 'btn-sm', '前一天') +
    '<span class="date-text">' + escapeHtml(date.fmtDateCn(day)) +
    (showRel ? ' <span class="muted small">（' + escapeHtml(rel) + '）</span>' : '') + '</span>' +
    btn('▶', { act: 'next-day' }, 'btn-sm', '后一天') +
    (o.hideToday ? '' : btn('今天', { act: 'goto-today' }, 'btn-sm')) +
    (o.extra || '') +
    '</div>';
}

/** 空的一行提示 */
export function hintRow(text) {
  return '<div class="row"><span class="muted small">' + escapeHtml(text) + '</span></div>';
}

/* ---------------- 弹窗 ---------------- */

let modalEl = null;
let modalOnClose = null;

function layer() {
  return document.getElementById('modalLayer');
}

export function isModalOpen() {
  const l = layer();
  return !!(l && !l.hidden);
}

/**
 * 打开弹窗。
 * @param {{title:string, body:string, foot:string, onMount?:Function, onClose?:Function}} opts
 */
export function openModal(opts) {
  const o = opts || {};
  const l = layer();
  if (!l) return;
  l.innerHTML =
    '<div class="modal" role="dialog" aria-modal="true">' +
    '<div class="modal-head">' + escapeHtml(o.title || '') + '</div>' +
    '<div class="modal-body">' + (o.body || '') + '</div>' +
    '<div class="modal-foot">' + (o.foot || '<button type="button" class="btn" data-act="close">关闭</button>') + '</div>' +
    '</div>';
  l.hidden = false;
  modalEl = qs(l, '.modal');
  modalOnClose = o.onClose || null;

  l.onclick = (ev) => {
    if (ev.target === l) closeModal();
  };
  const closeBtn = qs(l, '[data-act="close"]');
  if (closeBtn) closeBtn.onclick = () => closeModal();

  if (o.onMount) o.onMount(modalEl);
  const first = qs(modalEl, 'input, textarea, select');
  if (first) setTimeout(() => first.focus(), 30);
}

export function closeModal() {
  const l = layer();
  if (!l) return;
  l.hidden = true;
  l.innerHTML = '';
  modalEl = null;
  const cb = modalOnClose;
  modalOnClose = null;
  if (cb) cb();
}

/**
 * 确认框。
 * @returns {Promise<boolean>}
 */
export function confirmDialog(opts) {
  const o = opts || {};
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      closeModal();
      resolve(v);
    };
    openModal({
      title: o.title || '请确认',
      body: '<p>' + escapeHtml(o.message || '') + '</p>' +
        (o.detail ? '<p class="muted small">' + escapeHtml(o.detail) + '</p>' : '') +
        (o.requireText
          ? '<div class="field" style="margin-top:12px"><label class="field-label">' +
            escapeHtml(o.requireLabel || ('请输入「' + o.requireText + '」以继续')) + '</label>' +
            '<input class="input" type="text" data-field="confirm" autocomplete="off"></div>'
          : ''),
      foot:
        '<button type="button" class="btn" data-act="no">' + escapeHtml(o.cancelText || '取消') + '</button>' +
        '<button type="button" class="btn ' + (o.danger ? 'btn-danger' : 'btn-primary') + '" data-act="yes">' +
        escapeHtml(o.okText || '确定') + '</button>',
      onMount(root) {
        const yes = qs(root, '[data-act="yes"]');
        const no = qs(root, '[data-act="no"]');
        const input = qs(root, '[data-field="confirm"]');
        no.onclick = () => done(false);
        yes.onclick = () => {
          if (o.requireText && (!input || input.value.trim() !== o.requireText)) {
            if (input) {
              input.style.borderColor = 'var(--danger)';
              input.placeholder = '要与提示文字完全一致';
              input.focus();
            }
            return;
          }
          done(true);
        };
        if (input) {
          input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') yes.click();
          });
        }
      },
      onClose() {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      },
    });
  });
}

/* ---------------- 轻提示与撤销 ---------------- */

function toastLayer() {
  return document.getElementById('toastLayer');
}

/**
 * 弹一条底部提示。
 * @param {string} message
 * @param {{type?:string, actionLabel?:string, onAction?:Function, duration?:number}} opts
 */
export function toast(message, opts) {
  const o = opts || {};
  const l = toastLayer();
  if (!l) return null;

  const el = document.createElement('div');
  el.className = 'toast' + (o.type ? ' ' + o.type : '');
  el.innerHTML = '<span>' + escapeHtml(message) + '</span>' +
    (o.actionLabel ? '<button type="button" class="toast-action">' + escapeHtml(o.actionLabel) + '</button>' : '') +
    '<button type="button" class="toast-close" title="关闭">✕</button>';
  l.appendChild(el);

  let timer = null;
  const remove = () => {
    if (timer) clearTimeout(timer);
    if (el.parentNode) el.parentNode.removeChild(el);
  };

  const closeBtn = qs(el, '.toast-close');
  if (closeBtn) closeBtn.onclick = remove;

  if (o.actionLabel) {
    const action = qs(el, '.toast-action');
    if (action) {
      action.onclick = () => {
        remove();
        if (o.onAction) o.onAction();
      };
    }
  }

  const duration = o.duration == null ? 5000 : o.duration;
  if (duration > 0) timer = setTimeout(remove, duration);
  return { remove, el };
}

/** 删除 + 5 秒可撤销 */
export function toastUndo(message, onUndo) {
  return toast(message, { actionLabel: '撤销', onAction: onUndo, duration: 5000, type: 'warn' });
}

/* ---------------- 行 / 列表 ---------------- */

/**
 * 造一行。
 * @param {{attrs?:object, className?:string, check?:string, main:string, actions?:string}} o
 */
export function row(o) {
  const opts = o || {};
  return '<div class="row' + (opts.className ? ' ' + opts.className : '') + '"' +
    (opts.attrs ? dataAttrs(opts.attrs) : '') + '>' +
    (opts.check == null ? '' : opts.check) +
    '<div class="row-main">' + (opts.main || '') + '</div>' +
    (opts.actions == null ? '' : '<div class="row-actions' + (opts.actionsAlways ? ' always' : '') + '">' + opts.actions + '</div>') +
    '</div>';
}

export function rowTitle(text) {
  return '<div class="row-title">' + escapeHtml(text) + '</div>';
}

export function rowMeta(html) {
  return '<div class="row-meta">' + html + '</div>';
}

/* ---------------- 任务行（首页与今日计划共用） ---------------- */
/**
 * 一条任务。
 * @param {object} task
 * @param {{today?:string, showDate?:boolean, showLeave?:boolean}} opts
 */
export function taskRow(task, opts) {
  const o = opts || {};
  const today = o.today || date.todayStr();
  const overdue = !task.done && task.date < today;
  const showDate = o.showDate || task.date !== today;

  const meta = [moduleTag(task.module, { clickable: true, attrs: { act: 'jump', id: task.id, module: task.module } })];
  if (task.priority === 'high') meta.push(tag('重要', 'warn'));
  if (showDate) {
    meta.push('<span class="muted">' + escapeHtml(date.relativeDay(task.date)) + '</span>');
  }
  if (overdue) meta.push(tag('逾期', 'danger'));
  if (task.note) meta.push('<span class="muted">' + escapeHtml(task.note) + '</span>');

  const actions =
    (overdue ? '<button type="button" class="btn btn-sm" data-act="move-today" data-id="' + escapeHtml(task.id) + '">挪到今天</button>' : '') +
    '<button type="button" class="icon-btn" data-act="task-menu" data-id="' + escapeHtml(task.id) + '" title="更多操作">···</button>';

  return row({
    attrs: { id: 'task-' + task.id },
    className: (task.done ? 'done ' : '') + (overdue ? 'overdue' : ''),
    check: check(task.done, { act: 'toggle-task', id: task.id }),
    main:
      '<div class="row-title" data-act="edit-task" data-id="' + escapeHtml(task.id) + '" style="cursor:text">' +
      escapeHtml(task.title) + '</div>' +
      rowMeta(meta.join('')),
    actions,
  });
}

/** 逾期折叠区 */
export function overdueBlock(list, opts) {
  const o = opts || {};
  const today = o.today || date.todayStr();
  if (!list.length) return '';
  const open = !!o.open;
  const rows = list.map((t) => row({
    className: 'overdue',
    check: check(t.done, { act: 'toggle-task', id: t.id }),
    main:
      '<div class="row-title">' + escapeHtml(t.title) + '</div>' +
      rowMeta(
        moduleTag(t.module) +
        '<span class="muted">' + escapeHtml(date.fmtDateCn(t.date)) + '</span>' +
        '<span class="muted">已超 ' + Math.abs(date.diffDays(t.date, today)) + ' 天</span>'
      ),
    actions:
      '<button type="button" class="btn btn-sm" data-act="move-today" data-id="' + escapeHtml(t.id) + '">挪到今天</button>' +
      '<button type="button" class="icon-btn" data-act="task-menu" data-id="' + escapeHtml(t.id) + '" title="更多操作">···</button>',
    actionsAlways: true,
  })).join('');

  return '<div class="overdue-box" id="overdue">' +
    '<div class="overdue-head' + (open ? ' open' : '') + '" data-act="toggle-overdue">' +
    '<span class="caret">▶</span><b>⚠ 逾期 ' + list.length + ' 条</b>' +
    '<span class="muted small">超过日期还没完成，需要你决定怎么处理</span>' +
    '</div>' +
    '<div class="overdue-body"' + (open ? '' : ' hidden') + '>' +
    '<div class="overdue-actions">' +
    '<button type="button" class="btn btn-sm" data-act="move-all-today">全部挪到今天</button>' +
    '</div>' + rows + '</div></div>';
}

/** 快速补一条：模块下拉 + 输入框 + 回车即加 */
export function quickAddRow(opts) {
  const o = opts || {};
  const options = (o.modules || []).map((m) => ({ value: m.id, label: m.name }));
  return '<div class="quick-add">' +
    select('module', o.module || 'general', options) +
    '<input class="input" type="text" data-field="quick-title" placeholder="' +
    escapeHtml(o.placeholder || '往某个模块加一条，回车即存') + '">' +
    '</div>';
}

/** 快速备忘列表 */
export function noteList(notes) {
  if (!notes.length) {
    return empty('✎', '随手记点什么', '比如"买猫粮"、"问物业水费"');
  }
  return '<div class="note-list">' + notes.map((n) =>
    '<div class="note' + (n.done ? ' done' : '') + '" data-id="' + escapeHtml(n.id) + '">' +
    check(n.done, { act: 'toggle-note', id: n.id }) +
    '<span class="note-text" data-act="edit-note" data-id="' + escapeHtml(n.id) + '">' + escapeHtml(n.text) + '</span>' +
    '<span class="note-actions">' +
    '<button type="button" class="icon-btn" data-act="note-to-task" data-id="' + escapeHtml(n.id) + '" title="变任务">→</button>' +
    '<button type="button" class="icon-btn" data-act="delete-note" data-id="' + escapeHtml(n.id) + '" title="删除">✕</button>' +
    '</span></div>').join('') + '</div>';
}

/** 首页"待你处理" */
export function summaryList(items) {
  if (!items.length) return '';
  return items.map((it) =>
    '<div class="summary-item ' + escapeHtml(it.level || 'normal') + '" data-act="summary-go" data-route="' +
    escapeHtml(it.route) + '" data-anchor="' + escapeHtml(it.anchor || '') + '">' +
    '<span class="summary-dot"></span>' +
    '<div><div class="summary-text">' + escapeHtml(it.text) + '</div>' +
    (it.detail ? '<div class="summary-detail">' + escapeHtml(it.detail) + '</div>' : '') +
    '</div></div>').join('');
}

/* ---------------- 日历（各模块共用） ---------------- */

/**
 * 模块日历的界面状态（不落盘）。
 * 每个模块各记一份，切模块回来时还停在你上次看的月份。
 */
const calState = {};

export function getCalState(moduleId) {
  if (!calState[moduleId]) calState[moduleId] = { year: null, month: null, selected: null };
  return calState[moduleId];
}

export function setCalMonth(moduleId, year, month) {
  const s = getCalState(moduleId);
  s.year = year;
  s.month = month;
}

export function setCalSelected(moduleId, day) {
  getCalState(moduleId).selected = day || null;
}

/** 清空所有模块的日历界面状态（测试与"回到初始"用） */
export function clearCalendarState() {
  for (const k of Object.keys(calState)) delete calState[k];
}

/** 该模块日历当前显示的年月（未初始化时按今天算） */
export function currentCalMonth(moduleId, today) {
  const s = getCalState(moduleId);
  if (s.year == null) {
    const d = date.parseDateStr(today || date.todayStr());
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }
  return { year: s.year, month: s.month };
}

/**
 * 渲染一个模块的月历。
 * @param {object} opts
 *   - moduleId  模块 id（'all' 表示首页汇总）
 *   - state     当前数据
 *   - today     今天
 *   - marks     该月每日标记（logic.calendarMarks 的返回值）
 *   - dayPanel  选中某天时下方要显示的内容（HTML 字符串）
 *   - subtitle  日历下方的一句说明
 */
export function moduleCalendar(opts) {
  const o = opts || {};
  const s = getCalState(o.moduleId);
  const today = o.today || date.todayStr();
  const now = date.parseDateStr(today);
  if (s.year == null) {
    s.year = now.getFullYear();
    s.month = now.getMonth() + 1;
  }

  const g = date.monthGrid(s.year, s.month);
  const marks = o.marks || {};
  const cells = [];

  for (let i = 0; i < g.leadingBlanks; i++) cells.push('<div class="cal-cell blank"></div>');

  for (let d = 1; d <= g.daysInMonth; d++) {
    const day = date.monthDay(s.year, s.month, d);
    const m = marks[day];
    const total = m ? m.total : 0;
    const done = m ? m.done : 0;
    const allDone = total > 0 && done === total;
    const cls = ['cal-cell'];
    if (day === today) cls.push('today');
    if (day === s.selected) cls.push('selected');
    if (total || (m && m.extra)) cls.push('has');
    if (allDone) cls.push('alldone');

    cells.push('<div class="' + cls.join(' ') + '" data-act="cal-pick" data-day="' + day + '"' +
      ' title="' + escapeHtml(day + (total ? '：' + total + ' 条任务，完成 ' + done + ' 条' : '')) + '">' +
      '<div class="cal-daynum">' + d + '</div>' +
      (total ? '<div class="cal-dots">' + Array.from({ length: Math.min(total, 4) },
        (_, i2) => '<span class="cal-dot' + (i2 < done ? ' done' : '') + '"></span>').join('') + '</div>' : '') +
      (m && m.extra ? '<div class="cal-extra">' + escapeHtml(m.extra) + '</div>' : '') +
      '</div>');
  }

  const selectedPanel = s.selected
    ? '<div class="cal-panel" data-panel="' + escapeHtml(s.selected) + '">' +
      '<div class="cal-panel-head">' + escapeHtml(date.fmtDateCn(s.selected)) +
      (marks[s.selected] && marks[s.selected].extra
        ? ' <span class="tag">' + escapeHtml(marks[s.selected].extra) + '</span>' : '') +
      '</div>' + (o.dayPanel || '') + '</div>'
    : '<div class="cal-panel muted">点日历上任意一天，看那天具体做了什么</div>';

  return '<div class="cal-wrap">' +
    '<div class="cal-toolbar">' +
    btn('◀', { act: 'cal-prev' }, 'btn-sm', '上一月') +
    '<span class="cal-month">' + escapeHtml(g.monthLabel) + '</span>' +
    btn('▶', { act: 'cal-next' }, 'btn-sm', '下一月') +
    btn('回到本月', { act: 'cal-today' }, 'btn-sm') +
    '<span class="spacer"></span>' +
    '<span class="muted small">' + escapeHtml(o.subtitle || '有内容的日子会标出来') + '</span>' +
    '</div>' +
    '<div class="cal-head">' + date.WEEK_CN.map((w) => '<div>' + w + '</div>').join('') + '</div>' +
    '<div class="cal-grid">' + cells.join('') + '</div>' +
    selectedPanel +
    '</div>';
}

/**
 * 处理日历上的点击（各模块视图统一调用）。
 * @returns {boolean} 是否已被日历处理
 */
export function handleCalendarClick(act, ev, moduleId, today, rerender) {
  const type = act.getAttribute('data-act');
  if (type !== 'cal-pick' && type !== 'cal-prev' && type !== 'cal-next' && type !== 'cal-today') {
    return false;
  }
  const s = getCalState(moduleId);
  const now = date.parseDateStr(today || date.todayStr());

  if (type === 'cal-pick') {
    const day = act.getAttribute('data-day');
    s.selected = s.selected === day ? null : day;
    if (rerender) rerender();
    return true;
  }

  if (type === 'cal-today') {
    s.year = now.getFullYear();
    s.month = now.getMonth() + 1;
    if (rerender) rerender();
    return true;
  }

  let m = s.month + (type === 'cal-next' ? 1 : -1);
  let y = s.year;
  if (m < 1) { m = 12; y -= 1; }
  if (m > 12) { m = 1; y += 1; }
  s.year = y;
  s.month = m;
  if (rerender) rerender();
  return true;
}

/** 选中某天时，把那天该模块的任务列成清单（日历下方用） */
export function calendarDayTasks(state, moduleId, day, today) {
  const list = state.tasks.filter((t) => t.date === day && (moduleId === 'all' || t.module === moduleId));
  if (!list.length) {
    return '<div class="muted small" style="padding:6px 2px">这天没有安排</div>';
  }
  return '<div class="list">' + list.map((t) => taskRow(t, { today })).join('') + '</div>';
}

/** 生成"选日期"的一排快捷按钮 */
export function dateChips(selected, today) {
  const t = today || date.todayStr();
  const options = [
    { label: '今天', value: t },
    { label: '明天', value: date.addDays(t, 1) },
    { label: '后天', value: date.addDays(t, 2) },
    { label: '下周一', value: date.addDays(date.startOfWeek(t), 7) },
  ];
  return '<div class="date-picker-row">' + options.map((o) =>
    '<button type="button" class="date-chip' + (o.value === selected ? ' strong' : '') +
    '" data-act="pick-date" data-date="' + escapeHtml(o.value) + '">' + escapeHtml(o.label) + '</button>').join('') +
    '</div>';
}

/* ---------------- 图表（柱形图 / 扇形图） ---------------- */

/**
 * 图表的界面状态（不落盘）：每个模块各自记一份时间范围与选中的柱子/扇区。
 */
const chartState = {};

export function getChartState(moduleId) {
  if (!chartState[moduleId]) chartState[moduleId] = { range: 'week', bucket: null };
  return chartState[moduleId];
}

export function clearChartState() {
  for (const k of Object.keys(chartState)) delete chartState[k];
}

/** 柱形图：每天/每月的任务数与完成数 */
function barChart(buckets, selectedKey, maxTotal) {
  if (!buckets.length) {
    return '<div class="chart-empty">这个时间段还没有数据</div>';
  }
  const max = Math.max(1, maxTotal || 1);
  const emptyCount = buckets.filter((b) => !b.total).length;

  const bars = buckets.map((b) => {
    const h = Math.round((b.total / max) * 100);
    const dh = b.total ? Math.round((b.done / max) * 100) : 0;
    const cls = ['bar'];
    if (b.key === selectedKey) cls.push('selected');
    if (!b.total) cls.push('empty');
    // 有任务的日子显示"总数 / 已完成"两层柱
    const bar = b.total
      ? '<div class="bar-track">' +
          '<div class="bar-total" style="height:' + h + '%"></div>' +
          '<div class="bar-done" style="height:' + dh + '%"></div>' +
        '</div>'
      // 没任务的日子只画一个安静的小点，保留"这一天存在"的结构，但不制造噪音
      : '<div class="bar-track"><span class="bar-empty-dot"></span></div>';
    return '<div class="' + cls.join(' ') + '" data-act="chart-bucket" data-key="' + escapeHtml(b.key) + '"' +
      ' title="' + escapeHtml(b.sub + '：' + (b.total ? b.total + ' 条，完成 ' + b.done + ' 条' : '没有任务')) + '">' +
      bar +
      '<div class="bar-label">' + escapeHtml(b.label) + '</div>' +
      '</div>';
  }).join('');

  return '<div class="bar-chart">' + bars + '</div>' +
    '<div class="chart-legend">' +
    '<span class="lg"><i class="sw done"></i>已完成</span>' +
    '<span class="lg"><i class="sw total"></i>总数</span>' +
    (emptyCount ? '<span class="lg"><i class="sw empty"></i>没有任务（' + emptyCount + ' 天）</span>' : '') +
    '</div>';
}

/** 用极坐标算扇形路径 */
function slicePath(cx, cy, r, startAngle, endAngle) {
  const rad = (a) => (a - 90) * Math.PI / 180;
  const x1 = cx + r * Math.cos(rad(startAngle));
  const y1 = cy + r * Math.sin(rad(startAngle));
  const x2 = cx + r * Math.cos(rad(endAngle));
  const y2 = cy + r * Math.sin(rad(endAngle));
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return 'M ' + cx + ' ' + cy + ' L ' + x1.toFixed(2) + ' ' + y1.toFixed(2) +
    ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' Z';
}

/** 扇形图（饼图）：占比分布。没有数据时画一个灰色底环，保持结构稳定 */
function pieChart(slices, selectedKey, moduleId) {
  const total = slices.reduce((n, s) => n + s.value, 0);

  const cx = 70;
  const cy = 70;
  const r = 62;

  if (!total) {
    return '<div class="pie-wrap">' +
      '<svg class="pie" viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="占比图">' +
      '<circle class="pie-empty" cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#eef1f6"></circle>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="30" fill="#fff"></circle>' +
      '<text x="' + cx + '" y="' + (cy + 5) + '" text-anchor="middle" class="pie-total">0</text>' +
      '</svg>' +
      '<div class="pie-legend muted">这个时间段还没有数据</div>' +
      '</div>';
  }

  let angle = 0;
  const paths = slices.map((s) => {
    const sweep = (s.value / total) * 360;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    const cls = s.key === selectedKey ? 'pie-slice selected' : 'pie-slice';
    // 只有一个扇区时画整圆，避免起止点重合导致路径消失
    const d = slices.length === 1
      ? 'M ' + cx + ' ' + (cy - r) + ' A ' + r + ' ' + r + ' 0 1 1 ' + (cx - 0.01) + ' ' + (cy - r) + ' Z'
      : slicePath(cx, cy, r, start, end);
    return '<path class="' + cls + '" d="' + d + '" fill="' + s.color + '"' +
      ' data-act="chart-slice" data-key="' + escapeHtml(s.key) + '">' +
      '<title>' + escapeHtml(s.label + '：' + s.value + ' 条（' +
        Math.round((s.value / total) * 100) + '%）') + '</title></path>';
  }).join('');

  const legend = slices.map((s) =>
    '<span class="lg" data-act="chart-slice" data-kind="' + escapeHtml(moduleId === 'all' ? 'module' : 'status') +
    '" data-key="' + escapeHtml(s.key) + '" style="cursor:pointer">' +
    '<i class="sw" style="background:' + s.color + '"></i>' + escapeHtml(s.label) +
    ' <b>' + s.value + '</b>（' + Math.round((s.value / total) * 100) + '%）</span>').join('');

  return '<div class="pie-wrap">' +
    '<svg class="pie" viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="占比图">' +
    paths +
    '<circle cx="' + cx + '" cy="' + cy + '" r="30" fill="#fff"></circle>' +
    '<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" class="pie-total">' + total + '</text>' +
    '<text x="' + cx + '" y="' + (cy + 13) + '" text-anchor="middle" class="pie-total-label">任务</text>' +
    '</svg>' +
    '<div class="pie-legend">' + legend + '</div>' +
    '</div>';
}

/**
 * 渲染一个统计图表卡。
 * @param {object} opts
 *   - moduleId  模块 id（'all' 首页汇总）
 *   - state     数据
 *   - today     今天
 *   - title     卡片标题
 */
export function chartCard(opts) {
  const o = opts || {};
  const moduleId = o.moduleId;
  const today = o.today || date.todayStr();
  const st = getChartState(moduleId);
  const logicRef = o.logic;

  const summary = logicRef.chartSummary(o.state, moduleId, st.range, today);
  const buckets = logicRef.chartBuckets(o.state, moduleId, st.range, today);
  const slices = logicRef.chartSlices(o.state, moduleId, st.range, today);
  const maxTotal = buckets.reduce((n, b) => Math.max(n, b.total), 0);

  const rangeTabs = '<div class="pill-tabs chart-range">' +
    logicRef.RANGE_OPTIONS.map((r) =>
      '<button type="button" class="pill-tab' + (r.key === st.range ? ' active' : '') +
      '" data-act="chart-range" data-range="' + r.key + '">' + escapeHtml(r.label) + '</button>').join('') +
    '</div>';

  // 明细：选了柱子/扇区就看那一段，没选就看整个时间范围
  const detailTasks = logicRef.chartDetailTasks(o.state, moduleId, st.range, today, st.bucket);
  const detailTitle = st.bucket
    ? (detailTasks.length ? '这一段的 ' + detailTasks.length + ' 条' : '这一段没有任务')
    : (detailTasks.length ? '共 ' + detailTasks.length + ' 条' : '还没有任务');

  const detail = '<div class="chart-detail">' +
    '<div class="chart-detail-head">' + escapeHtml(detailTitle) +
    (st.bucket ? ' <button type="button" class="btn btn-sm" data-act="chart-clear">看全部</button>' : '') +
    '</div>' +
    (detailTasks.length
      ? '<div class="list list-scroll">' +
        detailTasks.slice(0, 50).map((t) => taskRow(t, { today })).join('') +
        (detailTasks.length > 50 ? '<div class="muted small" style="padding:6px 10px">只显示前 50 条</div>' : '') +
        '</div>'
      : '<div class="chart-empty small">没有可显示的条目</div>') +
    '</div>';

  return '<div class="chart-head">' +
    rangeTabs +
    '<span class="spacer"></span>' +
    '<span class="chart-summary">共 <b>' + summary.total + '</b> 条 · 已完成 <b>' + summary.done +
    '</b> · 完成率 <b>' + summary.percent + '%</b></span>' +
    '</div>' +
    '<div class="chart-body">' +
    '<div class="chart-block">' +
    '<div class="chart-block-title">每天完成情况' + (st.range === 'year' || st.range === 'all' ? '（按月）' : '') + '</div>' +
    barChart(buckets, st.bucket, maxTotal) +
    '</div>' +
    '<div class="chart-block">' +
    '<div class="chart-block-title">' + (moduleId === 'all' ? '任务分布（按模块）' : '完成占比') + '</div>' +
    pieChart(slices, st.bucket, moduleId) +
    '</div>' +
    '</div>' +
    detail;
}

/**
 * 处理图表上的点击。
 * @returns {boolean} 是否已被图表处理
 */
export function handleChartClick(act, moduleId, rerender) {
  const type = act.getAttribute('data-act');
  if (type !== 'chart-range' && type !== 'chart-bucket' && type !== 'chart-slice' && type !== 'chart-clear') {
    return false;
  }
  const st = getChartState(moduleId);

  if (type === 'chart-range') {
    st.range = act.getAttribute('data-range');
    st.bucket = null; // 换范围时清掉旧的选择，避免选到不存在的桶
    if (rerender) rerender();
    return true;
  }

  if (type === 'chart-clear') {
    st.bucket = null;
    if (rerender) rerender();
    return true;
  }

  const key = act.getAttribute('data-key');
  st.bucket = st.bucket === key ? null : key;
  if (rerender) rerender();
  return true;
}

/* ---------------- 任务操作弹窗 ---------------- */

/**
 * 任务操作菜单。
 * @param {(action:string, payload:any)=>void} onPick
 */
export function taskMenu(task, onPick) {
  const actions = [
    { key: 'edit', icon: '✎', label: '编辑内容与备注' },
    { key: 'date', icon: '📅', label: '改日期', sub: date.relativeDay(task.date) },
    { key: 'module', icon: '▤', label: '换模块', sub: moduleName(task.module) },
    { key: 'priority', icon: '⚑', label: task.priority === 'high' ? '取消重要标记' : '标记为重要' },
    { key: 'today', icon: '↩', label: '挪到今天' },
    { key: 'delete', icon: '✕', label: '删除任务', danger: true },
  ];

  openModal({
    title: '操作：' + task.title,
    body: '<div class="action-list">' + actions.map((a) =>
      '<button type="button" class="action-item' + (a.danger ? ' danger' : '') + '" data-act="menu-pick" data-key="' + a.key + '">' +
      '<span class="ai-icon">' + a.icon + '</span><span>' + escapeHtml(a.label) + '</span>' +
      (a.sub ? '<span class="ai-sub">' + escapeHtml(a.sub) + '</span>' : '') +
      '</button>').join('') + '</div>',
    foot: '<button type="button" class="btn" data-act="close">取消</button>',
    onMount(root) {
      root.onclick = (ev) => {
        const btn = ev.target.closest('[data-act="menu-pick"]');
        if (!btn) return;
        closeModal();
        onPick(btn.getAttribute('data-key'), task);
      };
    },
  });
}

/** 编辑任务弹窗 */
export function taskEditor(task, opts) {
  const o = opts || {};
  const modules = o.modules || [];
  const body =
    '<div class="field"><label class="field-label">任务内容</label>' +
    '<input class="input" type="text" data-field="title" value="' + escapeHtml(task.title) + '"></div>' +
    '<div class="field-row">' +
    '<div class="field"><label class="field-label">归属模块</label>' +
    select('module', task.module, modules.map((m) => ({ value: m.id, label: m.name }))) + '</div>' +
    '<div class="field"><label class="field-label">日期</label>' +
    '<input class="input" type="date" data-field="date" value="' + escapeHtml(task.date) + '"></div>' +
    '</div>' +
    '<div class="field"><label class="field-label">优先级</label>' +
    select('priority', task.priority, [{ value: 'normal', label: '普通' }, { value: 'high', label: '重要' }]) + '</div>' +
    '<div class="field"><label class="field-label">备注</label>' +
    textarea('note', task.note, '可选，例如上下文、链接、注意事项', 2) + '</div>';

  openModal({
    title: '编辑任务',
    body,
    foot: '<button type="button" class="btn" data-act="close">取消</button>' +
      '<button type="button" class="btn btn-primary" data-act="save">保存</button>',
    onMount(root) {
      const save = qs(root, '[data-act="save"]');
      save.onclick = () => {
        const title = qs(root, '[data-field="title"]').value.trim();
        if (!title) {
          const el = qs(root, '[data-field="title"]');
          el.style.borderColor = 'var(--danger)';
          el.focus();
          return;
        }
        const patch = {
          title,
          module: qs(root, '[data-field="module"]').value,
          date: qs(root, '[data-field="date"]').value || date.todayStr(),
          priority: qs(root, '[data-field="priority"]').value,
          note: qs(root, '[data-field="note"]').value,
        };
        closeModal();
        if (o.onSave) o.onSave(patch);
      };
    },
  });
}

/** 改日期弹窗（含快捷按钮与自选日期） */
export function datePicker(current, onPick) {
  const t = date.todayStr();
  openModal({
    title: '改到哪一天',
    body:
      '<div class="field"><label class="field-label">选择日期</label>' +
      '<input class="input" type="date" data-field="date" value="' + escapeHtml(current || t) + '"></div>' +
      dateChips(current || t, t),
    foot: '<button type="button" class="btn" data-act="close">取消</button>' +
      '<button type="button" class="btn btn-primary" data-act="save">确定</button>',
    onMount(root) {
      const input = qs(root, '[data-field="date"]');
      root.onclick = (ev) => {
        const chip = ev.target.closest('[data-act="pick-date"]');
        if (chip) input.value = chip.getAttribute('data-date');
        const save = ev.target.closest('[data-act="save"]');
        if (save) {
          const v = input.value;
          if (!date.isValidDateStr(v)) {
            input.style.borderColor = 'var(--danger)';
            return;
          }
          closeModal();
          onPick(v);
        }
      };
    },
  });
}

/** 换模块弹窗 */
export function modulePicker(current, modules, onPick) {
  openModal({
    title: '换到哪个模块',
    body: '<div class="action-list">' + modules.map((m) =>
      '<button type="button" class="action-item" data-act="pick-module" data-module="' + escapeHtml(m.id) + '">' +
      '<span class="ai-icon">▤</span><span>' + escapeHtml(m.name) + '</span>' +
      (m.id === current ? '<span class="ai-sub">当前</span>' : '') + '</button>').join('') + '</div>',
    foot: '<button type="button" class="btn" data-act="close">取消</button>',
    onMount(root) {
      root.onclick = (ev) => {
        const btn = ev.target.closest('[data-act="pick-module"]');
        if (!btn) return;
        closeModal();
        onPick(btn.getAttribute('data-module'));
      };
    },
  });
}

/** 通用输入弹窗（用于新增条目） */
export function promptDialog(opts) {
  const o = opts || {};
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      closeModal();
      resolve(v);
    };
    openModal({
      title: o.title || '输入',
      body: '<div class="field"><label class="field-label">' + escapeHtml(o.label || '内容') + '</label>' +
        '<input class="input" type="text" data-field="value" value="' + escapeHtml(o.value || '') +
        '" placeholder="' + escapeHtml(o.placeholder || '') + '"></div>' +
        (o.extra || ''),
      foot: '<button type="button" class="btn" data-act="no">取消</button>' +
        '<button type="button" class="btn btn-primary" data-act="yes">' + escapeHtml(o.okText || '确定') + '</button>',
      onMount(root) {
        const input = qs(root, '[data-field="value"]');
        const submit = () => {
          const v = input.value.trim();
          if (!v) {
            input.style.borderColor = 'var(--danger)';
            input.focus();
            return;
          }
          done(v);
        };
        qs(root, '[data-act="yes"]').onclick = submit;
        qs(root, '[data-act="no"]').onclick = () => done(null);
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') submit();
        });
      },
      onClose() {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      },
    });
  });
}
