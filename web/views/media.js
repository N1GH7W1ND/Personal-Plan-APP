/**
 * 自媒体视图。
 * 结构：四列进度看板（选题池 → 写作中 → 待发布 → 已发布）+ 发布排期月历。
 * 交互约定（见 PRD D7）：换列只用左右箭头按钮，不做拖拽。
 */

import * as date from '../date.js';
import * as logic from '../logic.js';
import * as ui from '../ui.js';

/** 界面状态（不落盘）：日历显示哪个月、选中哪天 */
let calYear = null;
let calMonth = null;
let selectedDay = null;

function ensureCal(today) {
  if (calYear == null) {
    const d = date.parseDateStr(today);
    calYear = d.getFullYear();
    calMonth = d.getMonth() + 1;
  }
}

/** 该月每天有哪些内容要发 */
function monthRows(state, year, month) {
  const prefix = year + '-' + String(month).padStart(2, '0') + '-';
  const map = {};
  for (const m of state.media) {
    if (m.plannedDate && m.plannedDate.startsWith(prefix)) {
      (map[m.plannedDate] = map[m.plannedDate] || []).push(m);
    }
  }
  return map;
}

function boardCard(item) {
  const idx = logic.MEDIA_ORDER.indexOf(item.status);
  const canPrev = idx > 0;
  const canNext = idx < logic.MEDIA_ORDER.length - 1;
  const planned = item.plannedDate ? date.fmtShort(item.plannedDate) : '未排期';

  return '<div class="board-card" data-card="' + ui.escapeHtml(item.id) + '">' +
    '<div class="board-card-title" data-act="media-edit" data-id="' + ui.escapeHtml(item.id) + '" style="cursor:text">' +
    ui.escapeHtml(item.title) + '</div>' +
    '<div class="board-card-meta">' +
    (item.platform ? ui.tag(item.platform) : '') +
    '<span class="muted">' + ui.escapeHtml(planned) + '</span>' +
    '</div>' +
    '<div class="board-card-actions">' +
    ui.iconBtn('←', { act: 'media-move', id: item.id, dir: -1 }, '后退一列', !canPrev) +
    ui.iconBtn('→', { act: 'media-move', id: item.id, dir: 1 }, '前进一列', !canNext) +
    ui.btn('推送到今日', { act: 'media-push', id: item.id }, 'btn-sm') +
    ui.iconBtn('···', { act: 'media-menu', id: item.id }, '更多操作') +
    '</div></div>';
}

function board(state) {
  const groups = logic.mediaByStatus(state);
  return '<div class="cols-board">' + logic.MEDIA_ORDER.map((status) =>
    '<div class="board-col">' +
    '<div class="board-head">' + ui.escapeHtml(logic.MEDIA_STATUS[status]) +
    '<span class="count">' + groups[status].length + '</span></div>' +
    '<div class="board-body">' +
    (groups[status].length
      ? groups[status].map(boardCard).join('')
      : '<div class="muted small" style="padding:6px 4px">还没有内容</div>') +
    '</div></div>').join('') + '</div>';
}

function calendar(state, today) {
  ensureCal(today);
  const g = date.monthGrid(calYear, calMonth);
  const marks = monthRows(state, calYear, calMonth);

  const cells = [];
  for (let i = 0; i < g.leadingBlanks; i++) cells.push('<div class="cal-cell blank"></div>');
  for (let d = 1; d <= g.daysInMonth; d++) {
    const day = date.monthDay(calYear, calMonth, d);
    const list = marks[day] || [];
    cells.push('<div class="cal-cell' + (day === today ? ' today' : '') +
      (day === selectedDay ? ' selected' : '') + '" data-act="cal-pick" data-date="' + day + '">' +
      '<div class="cal-day">' + d + '</div>' +
      '<div class="cal-marks">' + list.map(() => '<span class="cal-mark"></span>').join('') + '</div>' +
      (list.length ? '<div class="cal-count">' + list.length + '</div>' : '') +
      '</div>');
  }

  const dayList = selectedDay ? (marks[selectedDay] || []) : [];
  const dayPanel = selectedDay
    ? '<div class="hr"></div><div class="small strong">' + ui.escapeHtml(date.fmtDateCn(selectedDay)) + ' 要发的内容</div>' +
      (dayList.length
        ? '<div class="list">' + dayList.map((m) => ui.row({
          main: ui.rowTitle(m.title) + ui.rowMeta(ui.tag(logic.MEDIA_STATUS[m.status]) + (m.platform ? ui.tag(m.platform) : '')),
          actions: ui.btn('推送到今日', { act: 'media-push', id: m.id }, 'btn-sm'),
          actionsAlways: true,
        })).join('') + '</div>'
        : '<div class="muted small" style="padding:6px 2px">这天没有安排发布</div>')
    : '<div class="muted small" style="padding:6px 2px">点日历上任意一天，看那天要发什么</div>';

  return '<div class="cal-head">' + date.WEEK_CN.map((w) => '<div>' + w + '</div>').join('') + '</div>' +
    '<div class="cal-grid">' + cells.join('') + '</div>' +
    '<div class="chip-row" style="margin-top:10px">' +
    ui.btn('◀ 上一月', { act: 'cal-prev' }, 'btn-sm') +
    '<span class="strong">' + ui.escapeHtml(g.monthLabel) + '</span>' +
    ui.btn('下一月 ▶', { act: 'cal-next' }, 'btn-sm') +
    ui.btn('回到本月', { act: 'cal-today' }, 'btn-sm') +
    '</div>' + dayPanel;
}

export default {
  render(state, ctx) {
    const today = ctx.today;
    ensureCal(today);
    const groups = logic.mediaByStatus(state);
    const monthPrefix = calYear + '-' + String(calMonth).padStart(2, '0');
    const monthPlanned = state.media.filter((m) => m.plannedDate && m.plannedDate.startsWith(monthPrefix)).length;
    const todo = state.tasks.filter((t) => t.module === 'media' && t.date === today && !t.done);

    return ui.card({
      title: '自媒体',
      sub: '选题池 ' + groups.idea.length + ' · 写作中 ' + groups.writing.length +
        ' · 待发布 ' + groups.ready.length + ' · 本月计划发布 ' + monthPlanned,
      actions: ui.btn('+ 新选题', { act: 'media-new' }, 'btn-primary btn-sm'),
      body: board(state),
    }) +
    ui.card({
      title: '发布排期',
      sub: '打点的日子表示有内容要发',
      body: calendar(state, today),
    }) +
    (todo.length ? ui.card({
      title: '今天要做的自媒体任务',
      sub: todo.length + ' 条未完成',
      body: '<div class="list">' + todo.map((t) => ui.taskRow(t, { today })).join('') + '</div>',
    }) : '');
  },

  onClick(ev, store, ctx, helpers) {
    const act = ev.target.closest('[data-act]');
    if (!act) return;
    const type = act.getAttribute('data-act');
    const id = act.getAttribute('data-id');
    const today = ctx.today;

    const openEditor = (item) => {
      ui.openModal({
        title: '编辑内容',
        body:
          '<div class="field"><label class="field-label">标题</label>' +
          '<input class="input" type="text" data-field="title" value="' + ui.escapeHtml(item.title) + '"></div>' +
          '<div class="field-row">' +
          '<div class="field"><label class="field-label">平台</label>' +
          '<input class="input" type="text" data-field="platform" value="' + ui.escapeHtml(item.platform || '') + '" placeholder="公众号 / 小红书 / B站…"></div>' +
          '<div class="field"><label class="field-label">计划发布日期</label>' +
          '<input class="input" type="date" data-field="plannedDate" value="' + ui.escapeHtml(item.plannedDate || '') + '"></div>' +
          '</div>' +
          '<div class="field"><label class="field-label">进度</label>' +
          ui.select('status', item.status, logic.MEDIA_ORDER.map((s) => ({ value: s, label: logic.MEDIA_STATUS[s] }))) + '</div>' +
          '<div class="field"><label class="field-label">备注</label>' +
          ui.textarea('note', item.note, '提纲、要点、参考链接…', 3) + '</div>',
        foot: '<button type="button" class="btn" data-act="close">取消</button>' +
          '<button type="button" class="btn btn-primary" data-act="save">保存</button>',
        onMount(root) {
          ui.qs(root, '[data-act="save"]').onclick = () => {
            const title = ui.qs(root, '[data-field="title"]').value.trim();
            if (!title) return;
            store.dispatch((s) => logic.updateMedia(s, id, {
              title,
              platform: ui.qs(root, '[data-field="platform"]').value,
              plannedDate: ui.qs(root, '[data-field="plannedDate"]').value,
              status: ui.qs(root, '[data-field="status"]').value,
              note: ui.qs(root, '[data-field="note"]').value,
            }), { label: '编辑自媒体内容' });
            ui.closeModal();
            helpers.rerender();
          };
        },
      });
    };

    if (type === 'media-new') {
      ui.promptDialog({
        title: '新选题',
        label: '选题标题',
        placeholder: '例如：3 个提升效率的本地工具',
        okText: '加入选题池',
      }).then((title) => {
        if (!title) return;
        store.dispatch((s) => logic.addMedia(s, { title }), { label: '新增选题' });
        ui.toast('已加入选题池', { type: 'ok', duration: 2000 });
        helpers.rerender();
      });
      return;
    }

    if (type === 'media-move') {
      const dir = Number(act.getAttribute('data-dir'));
      // 注意：只移动一次。先算出目标状态，再一次性写进数据，不要在 dispatch 里再移一次。
      const item = logic.findMedia(store.getState(), id);
      if (!item) return;
      const target = logic.MEDIA_ORDER[logic.MEDIA_ORDER.indexOf(item.status) + (dir > 0 ? 1 : -1)];
      if (!target) {
        ui.toast('已经到头了', { duration: 1500 });
        return;
      }
      store.dispatch((s) => logic.updateMedia(s, id, { status: target }), { label: '推进自媒体进度' });
      helpers.rerender();
      return;
    }

    if (type === 'media-edit') {
      const item = logic.findMedia(store.getState(), id);
      if (item) openEditor(item);
      return;
    }

    if (type === 'media-menu') {
      const item = logic.findMedia(store.getState(), id);
      if (!item) return;
      ui.openModal({
        title: '操作：' + item.title,
        body: '<div class="action-list">' +
          '<button type="button" class="action-item" data-act="menu-pick" data-key="edit"><span class="ai-icon">✎</span><span>编辑内容</span></button>' +
          '<button type="button" class="action-item" data-act="menu-pick" data-key="push"><span class="ai-icon">↩</span><span>推送到今日</span></button>' +
          '<button type="button" class="action-item" data-act="menu-pick" data-key="schedule"><span class="ai-icon">📅</span><span>设定发布日期</span><span class="ai-sub">' +
          ui.escapeHtml(item.plannedDate ? date.fmtDateCn(item.plannedDate) : '未排期') + '</span></button>' +
          '<button type="button" class="action-item danger" data-act="menu-pick" data-key="delete"><span class="ai-icon">✕</span><span>删除</span></button>' +
          '</div>',
        foot: '<button type="button" class="btn" data-act="close">取消</button>',
        onMount(root) {
          root.onclick = (e) => {
            const btn = e.target.closest('[data-act="menu-pick"]');
            if (!btn) return;
            const key = btn.getAttribute('data-key');
            ui.closeModal();
            if (key === 'edit') { openEditor(item); return; }
            if (key === 'push') {
              store.dispatch((s) => logic.pushMediaToToday(s, id, today), { label: '推送到今日' });
              ui.toast('已加入今日计划', { type: 'ok', duration: 2200 });
              helpers.rerender();
              return;
            }
            if (key === 'schedule') {
              ui.datePicker(item.plannedDate || today, (day) => {
                store.dispatch((s) => logic.updateMedia(s, id, { plannedDate: day }), { label: '设定发布日期' });
                ui.toast('已排到 ' + date.fmtDateCn(day), { type: 'ok', duration: 2200 });
                helpers.rerender();
              });
              return;
            }
            if (key === 'delete') {
              store.dispatch((s) => logic.removeMedia(s, id), { undoable: true, label: '删除自媒体内容' });
              ui.toastUndo('已删除「' + item.title + '」', () => {
                store.undo();
                helpers.rerender();
              });
              helpers.rerender();
            }
          };
        },
      });
      return;
    }

    if (type === 'media-push') {
      const item = logic.findMedia(store.getState(), id);
      if (!item) return;
      store.dispatch((s) => logic.pushMediaToToday(s, id, today), { label: '推送到今日' });
      ui.toast('已把「' + item.title + '」加入今日计划', { type: 'ok', duration: 2400 });
      helpers.rerender();
      return;
    }

    if (type === 'cal-pick') {
      selectedDay = act.getAttribute('data-date');
      helpers.rerender();
      return;
    }

    if (type === 'cal-prev' || type === 'cal-next' || type === 'cal-today') {
      const t = date.parseDateStr(today);
      if (type === 'cal-today') {
        calYear = t.getFullYear();
        calMonth = t.getMonth() + 1;
      } else {
        const delta = type === 'cal-next' ? 1 : -1;
        let m = calMonth + delta;
        if (m < 1) { m = 12; calYear -= 1; }
        if (m > 12) { m = 1; calYear += 1; }
        calMonth = m;
      }
      helpers.rerender();
    }
  },
};
