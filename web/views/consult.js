/**
 * 咨询工作视图。
 * 结构：咨询待办 + 会议/沟通记录（记录里的待办可一键提取成正式任务，回访日可排进计划）。
 */

import * as date from '../date.js';
import * as logic from '../logic.js';
import * as ui from '../ui.js';

function recordCard(rec) {
  return '<div class="record-card" id="rec-' + ui.escapeHtml(rec.id) + '">' +
    '<div class="record-head">' +
    ui.escapeHtml(rec.who) +
    '<span class="muted small">' + ui.escapeHtml(date.fmtDateCn(rec.date)) + '</span>' +
    '<span class="spacer"></span>' +
    ui.iconBtn('···', { act: 'rec-menu', id: rec.id }, '更多操作') +
    '</div>' +
    (rec.summary ? '<div class="record-line"><b>要点：</b>' + ui.escapeHtml(rec.summary) + '</div>' : '') +
    (rec.todo ? '<div class="record-line"><b>待办：</b>' + ui.escapeHtml(rec.todo) + '</div>' : '') +
    (rec.nextDate ? '<div class="record-line"><b>下次回访：</b>' + ui.escapeHtml(date.fmtDateCn(rec.nextDate)) + '</div>' : '') +
    '<div class="record-actions">' +
    (rec.todo ? ui.btn('提取为任务', { act: 'rec-extract', id: rec.id }, 'btn-sm') : '') +
    (rec.nextDate ? ui.btn('加进计划', { act: 'rec-plan', id: rec.id }, 'btn-sm') : '') +
    ui.btn('编辑', { act: 'rec-edit', id: rec.id }, 'btn-sm') +
    '</div></div>';
}

export default {
  render(state, ctx) {
    const today = ctx.today;
    const pending = state.consultTasks.filter((c) => !c.done);
    const doneList = state.consultTasks.filter((c) => c.done);
    const records = state.consultRecords.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    const todo = state.tasks.filter((t) => t.module === 'consult' && t.date === today && !t.done);

    const todoHtml = pending.length
      ? '<div class="list">' + pending.map((c) => ui.row({
        attrs: { id: 'consult-' + c.id },
        check: ui.check(false, { act: 'consult-toggle', id: c.id }),
        main: '<div class="row-title" data-act="consult-edit" data-id="' + ui.escapeHtml(c.id) + '" style="cursor:text">' +
          ui.escapeHtml(c.title) + '</div>' +
          (c.note ? ui.rowMeta('<span class="muted">' + ui.escapeHtml(c.note) + '</span>') : ''),
        actions:
          ui.btn('推送到今日', { act: 'consult-push', id: c.id }, 'btn-sm') +
          ui.iconBtn('✕', { act: 'consult-delete', id: c.id }, '删除'),
        actionsAlways: true,
      })).join('') + '</div>'
      : ui.empty('☎', '没有未完成的咨询待办', '上面输入框敲一条，或从沟通记录里提取');

    const doneHtml = doneList.length
      ? '<div class="hr"></div><div class="small muted">已完成 ' + doneList.length + ' 条</div>' +
        '<div class="list">' + doneList.slice(0, 6).map((c) => ui.row({
          className: 'done',
          check: ui.check(true, { act: 'consult-toggle', id: c.id }),
          main: ui.rowTitle(c.title),
        })).join('') + '</div>'
      : '';

    return ui.card({
      title: '咨询工作',
      sub: '待办 ' + pending.length + ' · 本周会议 ' + logic.consultMeetingsThisWeek(state, today),
      actions: ui.btn('+ 加待办', { act: 'consult-new' }, 'btn-primary btn-sm'),
      tight: true,
      body: '<div class="quick-add">' +
        '<input class="input" type="text" data-field="consult-input" placeholder="敲一条咨询待办，回车即存">' +
        '</div>',
    }) +
    ui.card({
      title: '待办',
      sub: pending.length ? pending.length + ' 条未完成' : '没有未完成的',
      body: todoHtml + doneHtml,
    }) +
    ui.card({
      title: '会议 / 沟通记录',
      sub: records.length ? '共 ' + records.length + ' 条' : '还没有记录',
      actions: ui.btn('+ 加记录', { act: 'rec-new' }, 'btn-primary btn-sm'),
      body: records.length
        ? records.map(recordCard).join('')
        : ui.empty('📝', '还没有沟通记录', '通完电话随手记一条，待办和回访日都能一键进计划'),
    }) +
    (todo.length ? ui.card({
      title: '今天要做的咨询任务',
      sub: todo.length + ' 条未完成',
      body: '<div class="list">' + todo.map((t) => ui.taskRow(t, { today })).join('') + '</div>',
    }) : '');
  },

  mounted(root, ctx) {
    const input = root.querySelector('[data-field="consult-input"]');
    if (ctx.anchor) {
      const target = root.querySelector('[id="consult-' + ctx.anchor + '"]') ||
        root.querySelector('[id="rec-' + ctx.anchor + '"]');
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
        ctx.dispatch((s) => logic.addConsultTask(s, { title: text }), '新增咨询待办');
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

    const openRecordEditor = (rec) => {
      const isNew = !rec;
      const item = rec || {
        who: '', date: today, summary: '', todo: '', nextDate: '',
      };
      ui.openModal({
        title: isNew ? '新增沟通记录' : '编辑沟通记录',
        body:
          '<div class="field-row">' +
          '<div class="field"><label class="field-label">和谁</label>' +
          '<input class="input" type="text" data-field="who" value="' + ui.escapeHtml(item.who) + '" placeholder="王总 / 李经理…"></div>' +
          '<div class="field"><label class="field-label">日期</label>' +
          '<input class="input" type="date" data-field="date" value="' + ui.escapeHtml(item.date) + '"></div>' +
          '</div>' +
          '<div class="field"><label class="field-label">要点</label>' +
          ui.textarea('summary', item.summary, '对方说了什么、结论是什么', 3) + '</div>' +
          '<div class="field"><label class="field-label">要做的待办（可一键提取成正式任务）</label>' +
          '<input class="input" type="text" data-field="todo" value="' + ui.escapeHtml(item.todo) + '" placeholder="例如：出分期报价单"></div>' +
          '<div class="field"><label class="field-label">下次回访日期（可一键加进计划）</label>' +
          '<input class="input" type="date" data-field="nextDate" value="' + ui.escapeHtml(item.nextDate) + '"></div>',
        foot: '<button type="button" class="btn" data-act="close">取消</button>' +
          '<button type="button" class="btn btn-primary" data-act="save">保存</button>',
        onMount(root) {
          ui.qs(root, '[data-act="save"]').onclick = () => {
            const who = ui.qs(root, '[data-field="who"]').value.trim();
            const summary = ui.qs(root, '[data-field="summary"]').value.trim();
            if (!who && !summary) {
              ui.toast('至少填一下「和谁」或「要点」', { type: 'warn', duration: 2500 });
              return;
            }
            const patch = {
              who,
              date: ui.qs(root, '[data-field="date"]').value || today,
              summary,
              todo: ui.qs(root, '[data-field="todo"]').value,
              nextDate: ui.qs(root, '[data-field="nextDate"]').value,
            };
            if (isNew) {
              store.dispatch((s) => logic.addConsultRecord(s, patch), { label: '新增沟通记录' });
            } else {
              store.dispatch((s) => logic.updateConsultRecord(s, id, patch), { label: '编辑沟通记录' });
            }
            ui.closeModal();
            helpers.rerender();
          };
        },
      });
    };

    if (type === 'consult-new') {
      ui.promptDialog({ title: '新增咨询待办', label: '内容', placeholder: '例如：回复王总报价单', okText: '添加' })
        .then((title) => {
          if (!title) return;
          store.dispatch((s) => logic.addConsultTask(s, { title }), { label: '新增咨询待办' });
          helpers.rerender();
        });
      return;
    }

    if (type === 'consult-toggle') {
      store.dispatch((s) => logic.toggleConsultTask(s, id), { label: '勾选咨询待办' });
      helpers.rerender();
      return;
    }

    if (type === 'consult-delete') {
      const item = logic.findConsultTask(state, id);
      if (!item) return;
      store.dispatch((s) => logic.removeConsultTask(s, id), { undoable: true, label: '删除咨询待办' });
      ui.toastUndo('已删除「' + item.title + '」', () => {
        store.undo();
        helpers.rerender();
      });
      helpers.rerender();
      return;
    }

    if (type === 'consult-push') {
      const item = logic.findConsultTask(state, id);
      if (!item) return;
      store.dispatch((s) => logic.pushConsultToToday(s, id, today), { label: '推送到今日' });
      ui.toast('已把「' + item.title + '」加入今日计划', { type: 'ok', duration: 2200 });
      helpers.rerender();
      return;
    }

    if (type === 'consult-edit') {
      const item = logic.findConsultTask(state, id);
      if (!item) return;
      ui.promptDialog({ title: '编辑咨询待办', value: item.title, okText: '保存' }).then((title) => {
        if (!title) return;
        store.dispatch((s) => logic.updateConsultTask(s, id, { title }), { label: '编辑咨询待办' });
        helpers.rerender();
      });
      return;
    }

    if (type === 'rec-new') {
      openRecordEditor(null);
      return;
    }

    if (type === 'rec-edit') {
      const rec = logic.findConsultRecord(state, id);
      if (rec) openRecordEditor(rec);
      return;
    }

    if (type === 'rec-extract') {
      const rec = logic.findConsultRecord(state, id);
      if (!rec || !rec.todo.trim()) {
        ui.toast('这条记录里没有待办可提取', { duration: 2000 });
        return;
      }
      const text = rec.todo;
      store.dispatch((s) => logic.recordTodoToTask(s, id), { undoable: true, label: '提取为任务' });
      ui.toast('已提取成咨询待办：' + text, { type: 'ok', duration: 2600 });
      helpers.rerender();
      return;
    }

    if (type === 'rec-plan') {
      const rec = logic.findConsultRecord(state, id);
      if (!rec || !rec.nextDate) {
        ui.toast('这条记录没有回访日期', { duration: 2000 });
        return;
      }
      const day = rec.nextDate;
      store.dispatch((s) => logic.recordNextDateToPlan(s, id), { label: '加进计划' });
      ui.toast('已把回访排进 ' + date.relativeDay(day) + '（' + date.fmtDateCn(day) + '）', { type: 'ok', duration: 2800 });
      helpers.rerender();
      return;
    }

    if (type === 'rec-menu') {
      const rec = logic.findConsultRecord(state, id);
      if (!rec) return;
      ui.openModal({
        title: '操作：' + rec.who,
        body: '<div class="action-list">' +
          '<button type="button" class="action-item" data-act="menu-pick" data-key="edit"><span class="ai-icon">✎</span><span>编辑记录</span></button>' +
          (rec.todo ? '<button type="button" class="action-item" data-act="menu-pick" data-key="extract"><span class="ai-icon">↪</span><span>把待办提取为任务</span></button>' : '') +
          (rec.nextDate ? '<button type="button" class="action-item" data-act="menu-pick" data-key="plan"><span class="ai-icon">📅</span><span>把回访日加进计划</span><span class="ai-sub">' +
            ui.escapeHtml(date.fmtShort(rec.nextDate)) + '</span></button>' : '') +
          '<button type="button" class="action-item danger" data-act="menu-pick" data-key="delete"><span class="ai-icon">✕</span><span>删除记录</span></button>' +
          '</div>',
        foot: '<button type="button" class="btn" data-act="close">取消</button>',
        onMount(root) {
          root.onclick = (e) => {
            const btn = e.target.closest('[data-act="menu-pick"]');
            if (!btn) return;
            const key = btn.getAttribute('data-key');
            ui.closeModal();
            if (key === 'edit') return openRecordEditor(rec);
            if (key === 'extract') {
              const text = rec.todo;
              store.dispatch((s) => logic.recordTodoToTask(s, id), { undoable: true, label: '提取为任务' });
              ui.toast('已提取成咨询待办：' + text, { type: 'ok', duration: 2600 });
              return helpers.rerender();
            }
            if (key === 'plan') {
              const day = rec.nextDate;
              store.dispatch((s) => logic.recordNextDateToPlan(s, id), { label: '加进计划' });
              ui.toast('已把回访排进 ' + date.fmtDateCn(day), { type: 'ok', duration: 2600 });
              return helpers.rerender();
            }
            if (key === 'delete') {
              store.dispatch((s) => logic.removeConsultRecord(s, id), { undoable: true, label: '删除沟通记录' });
              ui.toastUndo('已删除这条记录', () => {
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
