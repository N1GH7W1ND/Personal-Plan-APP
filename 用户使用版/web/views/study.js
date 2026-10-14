/**
 * 学习视图。
 * 结构：学习内容清单（类型 + 三档进度 + 累计时长）+ 今天的学习任务。
 */

import * as date from '../date.js';
import * as logic from '../logic.js';
import * as ui from '../ui.js';

/** 当前日历月份下，本模块每天的标记 */
function monthMarks(state, moduleId, today) {
  const { year, month } = ui.currentCalMonth(moduleId, today);
  return logic.calendarMarks(state, moduleId, year, month);
}

function statusChip(item) {
  return '<span class="tag status-chip" data-act="study-status" data-id="' +
    ui.escapeHtml(item.id) + '" title="点一下切到下一档：' +
    ui.escapeHtml(logic.STUDY_ORDER.map((s) => logic.STUDY_STATUS[s]).join(' → ')) + '">' +
    ui.escapeHtml(logic.STUDY_STATUS[item.status]) + '</span>';
}

function studyRow(item) {
  return ui.row({
    attrs: { id: 'study-' + item.id },
    className: item.status === 'done' ? 'done' : '',
    main:
      '<div class="row-title" data-act="study-edit" data-id="' + ui.escapeHtml(item.id) + '" style="cursor:text">' +
      ui.escapeHtml(item.title) + '</div>' +
      ui.rowMeta(
        ui.tag(logic.STUDY_KINDS[item.kind] || '其他') +
        statusChip(item) +
        (logic.normalizePriority(item.priority) !== logic.PRIORITY_DEFAULT
          ? ui.tag(logic.priorityLabel(item.priority), logic.priorityTone(item.priority) || 'warn')
          : '') +
        (item.minutes ? '<span class="muted">' + item.minutes + ' 分钟</span>' : '<span class="muted">未计时</span>') +
        (item.source ? '<span class="muted">' + ui.escapeHtml(item.source) + '</span>' : '')
      ),
    actions:
      ui.btn('推送到今日', { act: 'study-push', id: item.id }, 'btn-sm') +
      ui.iconBtn('···', { act: 'study-menu', id: item.id }, '更多操作'),
    actionsAlways: true,
  });
}

export default {
  render(state, ctx) {
    const today = ctx.today;
    const items = state.studyItems;
    const doing = items.filter((s) => s.status === 'doing');
    const todo = items.filter((s) => s.status === 'todo');
    const done = items.filter((s) => s.status === 'done');
    const todayTasks = state.tasks.filter((t) => t.module === 'study' && t.date === today && !t.done);

    const listHtml = items.length
      ? '<div class="list">' + items.map(studyRow).join('') + '</div>'
      : ui.empty('✎', '还没有学习内容', '上面输入框敲一条，比如「看完 JavaScript 事件循环」');

    return ui.card({
      title: '学习',
      sub: '学习中 ' + doing.length + ' · 未开始 ' + todo.length +
        ' · 已学完 ' + done.length + ' · 累计 ' + logic.studyMinutesTotal(state) + ' 分钟',
      actions: ui.btn('+ 加内容', { act: 'study-new' }, 'btn-primary btn-sm'),
      tight: true,
      body: '<div class="quick-add">' +
        '<input class="input" type="text" data-field="study-input" placeholder="敲一条要学的内容，回车即存">' +
        '</div>',
    }) +
    ui.card({
      title: '学习清单',
      sub: items.length ? '共 ' + items.length + ' 条' : '还没有内容',
      body: listHtml,
    }) +
    ui.card({
      title: '学习日历',
      sub: '哪天学了什么，一眼看到',
      body: ui.moduleCalendar({
        moduleId: 'study',
        state,
        today,
        marks: monthMarks(state, 'study', today),
        dayPanel: ui.calendarDayTasks(state, 'study', ui.getCalState('study').selected, today),
      }),
    }) +
    ui.card({
      title: '学习统计',
      sub: '切时间范围看趋势；点柱子或扇形看具体内容',
      body: ui.chartCard({ moduleId: 'study', state, today, logic }),
    }) +
    (todayTasks.length ? ui.card({
      title: '今天要学的',
      sub: todayTasks.length + ' 条未完成',
      body: '<div class="list">' + todayTasks.map((t) => ui.taskRow(t, { today })).join('') + '</div>',
    }) : '');
  },

  mounted(root, ctx) {
    const input = root.querySelector('[data-field="study-input"]');
    if (ctx.anchor) {
      const target = root.querySelector('[id="study-' + ctx.anchor + '"]');
      if (target) {
        target.classList.add('flash');
        target.scrollIntoView({ block: 'center' });
      }
    }
    if (input) {
      input.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        const text = input.value.trim();
        if (!text) return;
        ctx.dispatch((s) => logic.addStudyItem(s, { title: text }), '新增学习内容');
        input.value = '';
        input.focus();
      });
    }
  },

  onClick(ev, store, ctx, helpers) {
    const act = ev.target.closest('[data-act]');
    if (!act) return;
    const type = act.getAttribute('data-act');
    const id = act.getAttribute('data-id');
    const today = ctx.today;
    const state = store.getState();

    // 日历操作（切月 / 选日期）
    if (ui.handleCalendarClick(act, ev, 'study', today, helpers.rerender)) return;
    // 图表操作（切时间范围 / 点柱子扇区看明细）
    if (ui.handleChartClick(act, 'study', helpers.rerender)) return;

    const openEditor = (item) => {
      const isNew = !item;
      // 新增时默认优先级 = 重要且紧急（与任务的新增默认一致）
      const cur = item || {
        title: '', kind: 'read', status: 'todo', minutes: 0, source: '', note: '',
        priority: logic.TASK_DEFAULT_PRIORITY,
      };
      ui.openModal({
        title: isNew ? '新增学习内容' : '编辑学习内容',
        body:
          '<div class="field"><label class="field-label">内容</label>' +
          '<input class="input" type="text" data-field="title" value="' + ui.escapeHtml(cur.title) + '" placeholder="例如：看完 JavaScript 事件循环"></div>' +
          '<div class="field-row">' +
          '<div class="field"><label class="field-label">类型</label>' +
          ui.select('kind', cur.kind, logic.STUDY_KIND_ORDER.map((k) => ({ value: k, label: logic.STUDY_KINDS[k] }))) + '</div>' +
          '<div class="field"><label class="field-label">进度</label>' +
          ui.select('status', cur.status, logic.STUDY_ORDER.map((s) => ({ value: s, label: logic.STUDY_STATUS[s] }))) + '</div>' +
          '</div>' +
          '<div class="field-row">' +
          '<div class="field"><label class="field-label">已学时长（分钟）</label>' +
          '<input class="input" type="number" min="0" data-field="minutes" value="' + (cur.minutes || 0) + '"></div>' +
          '<div class="field"><label class="field-label">优先级</label>' +
          ui.select('priority', logic.normalizePriority(cur.priority), logic.priorityOptions()) + '</div>' +
          '</div>' +
          '<div class="field"><label class="field-label">出处</label>' +
          '<input class="input" type="text" data-field="source" value="' + ui.escapeHtml(cur.source || '') + '" placeholder="书名 / 课程名 / 链接"></div>' +
          '<div class="field"><label class="field-label">备注</label>' +
          ui.textarea('note', cur.note, '笔记、要点、疑问…', 3) + '</div>',
        foot: '<button type="button" class="btn" data-act="close">取消</button>' +
          '<button type="button" class="btn btn-primary" data-act="save">保存</button>',
        onMount(root) {
          ui.qs(root, '[data-act="save"]').onclick = () => {
            const title = ui.qs(root, '[data-field="title"]').value.trim();
            if (!title) return;
            const payload = {
              title,
              kind: ui.qs(root, '[data-field="kind"]').value,
              status: ui.qs(root, '[data-field="status"]').value,
              minutes: Number(ui.qs(root, '[data-field="minutes"]').value) || 0,
              priority: ui.qs(root, '[data-field="priority"]').value,
              source: ui.qs(root, '[data-field="source"]').value,
              note: ui.qs(root, '[data-field="note"]').value,
            };
            ui.closeModal();
            if (isNew) {
              store.dispatch((s) => logic.addStudyItem(s, payload), { label: '新增学习内容' });
            } else {
              store.dispatch((s) => logic.updateStudyItem(s, id, payload), { label: '编辑学习内容' });
            }
            helpers.rerender();
          };
        },
      });
    };

    if (type === 'study-new') {
      openEditor(null);
      return;
    }

    if (type === 'study-status') {
      const item = logic.findStudyItem(state, id);
      if (!item) return;
      const idx = logic.STUDY_ORDER.indexOf(item.status);
      const next = logic.STUDY_ORDER[(idx + 1) % logic.STUDY_ORDER.length];
      store.dispatch((s) => logic.advanceStudyItem(s, id), { label: '切换学习进度' });
      ui.toast('已切到「' + logic.STUDY_STATUS[next] + '」', { duration: 1500 });
      helpers.rerender();
      return;
    }

    if (type === 'study-edit') {
      const item = logic.findStudyItem(state, id);
      if (item) openEditor(item);
      return;
    }

    if (type === 'study-push') {
      const item = logic.findStudyItem(state, id);
      if (!item) return;
      store.dispatch((s) => logic.pushStudyToToday(s, id, today), { label: '推送到今日' });
      ui.toast('已把「' + item.title + '」加入今日计划', { type: 'ok', duration: 2200 });
      helpers.rerender();
      return;
    }

    if (type === 'study-menu') {
      const item = logic.findStudyItem(state, id);
      if (!item) return;
      ui.openModal({
        title: '操作：' + item.title,
        body: '<div class="action-list">' +
          '<button type="button" class="action-item" data-act="menu-pick" data-key="edit"><span class="ai-icon">✎</span><span>编辑</span></button>' +
          '<button type="button" class="action-item" data-act="menu-pick" data-key="status" data-status="doing"><span class="ai-icon">◐</span><span>标记为学习中</span></button>' +
          '<button type="button" class="action-item" data-act="menu-pick" data-key="status" data-status="done"><span class="ai-icon">✓</span><span>标记为已学完</span></button>' +
          '<button type="button" class="action-item" data-act="menu-pick" data-key="push"><span class="ai-icon">↩</span><span>推送到今日</span></button>' +
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
            if (key === 'status') {
              store.dispatch((s) => logic.updateStudyItem(s, id, { status: btn.getAttribute('data-status') }), { label: '改学习进度' });
              helpers.rerender();
              return;
            }
            if (key === 'push') {
              store.dispatch((s) => logic.pushStudyToToday(s, id, today), { label: '推送到今日' });
              ui.toast('已加入今日计划', { type: 'ok', duration: 2200 });
              helpers.rerender();
              return;
            }
            if (key === 'delete') {
              store.dispatch((s) => logic.removeStudyItem(s, id), { undoable: true, label: '删除学习内容' });
              ui.toastUndo('已删除「' + item.title + '」', () => {
                store.undo();
                helpers.rerender();
              });
              helpers.rerender();
            }
          };
        },
      });
    }
  },
};
