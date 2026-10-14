/**
 * 开发视图。
 * 结构：开发待办（四档状态，点标签直接切）+ 灵感收集箱（一句话随手记，可一键变成待办）。
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
  return '<span class="tag status-chip" data-act="dev-status" data-id="' +
    ui.escapeHtml(item.id) + '" title="点一下切到下一档：' +
    ui.escapeHtml(logic.DEV_ORDER.map((s) => logic.DEV_STATUS[s]).join(' → ')) + '">' +
    ui.escapeHtml(logic.DEV_STATUS[item.status]) + '</span>';
}

function devRow(item) {
  return ui.row({
    attrs: { id: 'dev-' + item.id },
    main:
      '<div class="row-title" data-act="dev-edit" data-id="' + ui.escapeHtml(item.id) + '" style="cursor:text">' +
      ui.escapeHtml(item.title) + '</div>' +
      ui.rowMeta(
        (item.priority === 'high' ? ui.tag('重点', 'warn') : '') +
        statusChip(item) +
        (item.note ? '<span class="muted">' + ui.escapeHtml(item.note) + '</span>' : '')
      ),
    actions:
      ui.btn('推送到今日', { act: 'dev-push', id: item.id }, 'btn-sm') +
      ui.iconBtn('···', { act: 'dev-menu', id: item.id }, '更多操作'),
    actionsAlways: true,
  });
}

export default {
  render(state, ctx) {
    const today = ctx.today;
    const groups = logic.devByStatus(state);
    const ideas = state.devIdeas;
    const todo = state.tasks.filter((t) => t.module === 'dev' && t.date === today && !t.done);

    const doing = logic.devDoingCount(state);
    const doneToday = logic.devDoneTodayCount(state, today);
    const pending = groups.todo.concat(groups.doing, groups.testing);

    const listHtml = pending.length
      ? '<div class="list">' + pending.map(devRow).join('') + '</div>'
      : ui.empty('⌘', '开发待办是空的', '上面输入框敲一条，或从灵感箱里挑一个');

    const doneHtml = groups.online.length
      ? '<div class="hr"></div><div class="small muted">已上线 ' + groups.online.length + ' 条（点状态标签可以再切回去）</div>' +
        '<div class="list">' + groups.online.slice(0, 8).map((d) => ui.row({
          className: 'done',
          main: ui.rowTitle(d.title) + ui.rowMeta(statusChip(d)),
          actions: ui.iconBtn('···', { act: 'dev-menu', id: d.id }, '更多操作'),
          actionsAlways: true,
        })).join('') + '</div>'
      : '';

    const ideasHtml = ideas.length
      ? '<div class="list">' + ideas.map((i) => ui.row({
        attrs: { id: 'idea-' + i.id },
        className: i.handled ? 'done' : '',
        main: '<div class="row-title">' + ui.escapeHtml(i.text) + '</div>' +
          ui.rowMeta(i.handled ? ui.tag('已处理', 'ok') : ui.tag('待整理')),
        actions:
          ui.btn('变成待办', { act: 'idea-to-task', id: i.id }, 'btn-sm') +
          ui.iconBtn('✓', { act: 'idea-toggle', id: i.id }, i.handled ? '标记未处理' : '标记已处理') +
          ui.iconBtn('✕', { act: 'idea-delete', id: i.id }, '删除'),
        actionsAlways: true,
      })).join('') + '</div>'
      : ui.empty('💡', '灵感箱是空的', '看到什么随手丢进来，之后再整理');

    return ui.card({
      title: '开发',
      sub: '进行中 ' + doing + ' · 今日完成 ' + doneToday + ' · 已上线 ' + groups.online.length,
      actions: ui.btn('+ 加待办', { act: 'dev-new' }, 'btn-primary btn-sm'),
      tight: true,
      body: '<div class="quick-add">' +
        '<input class="input" type="text" data-field="dev-input" placeholder="敲一条开发待办，回车即存">' +
        '</div>',
    }) +
    ui.card({
      title: '待办',
      sub: pending.length ? pending.length + ' 条未完成' : '没有未完成的',
      body: listHtml + doneHtml,
    }) +
    ui.card({
      title: '开发日历',
      sub: '看看这个月哪天忙、哪天清',
      body: ui.moduleCalendar({
        moduleId: 'dev',
        state,
        today,
        marks: monthMarks(state, 'dev', today),
        dayPanel: ui.calendarDayTasks(state, 'dev', ui.getCalState('dev').selected, today),
      }),
    }) +
    ui.card({
      title: '开发统计',
      sub: '切时间范围看趋势；点柱子或扇形看具体内容',
      body: ui.chartCard({ moduleId: 'dev', state, today, logic }),
    }) +
    ui.card({
      title: '灵感收集箱',
      sub: logic.unhandledIdeas(state).length + ' 条待整理',
      tight: true,
      body: '<div class="quick-add">' +
        '<input class="input" type="text" data-field="idea-input" placeholder="一句话记灵感，回车即存">' +
        '</div><div style="height:10px"></div>' + ideasHtml,
    }) +
    (todo.length ? ui.card({
      title: '今天要做的开发任务',
      sub: todo.length + ' 条未完成',
      body: '<div class="list">' + todo.map((t) => ui.taskRow(t, { today })).join('') + '</div>',
    }) : '');
  },

  mounted(root, ctx) {
    const devInput = root.querySelector('[data-field="dev-input"]');
    const ideaInput = root.querySelector('[data-field="idea-input"]');

    if (ctx.anchor) {
      const target = root.querySelector('[id="dev-' + ctx.anchor + '"]') ||
        root.querySelector('[id="idea-' + ctx.anchor + '"]');
      if (target) {
        target.classList.add('flash');
        target.scrollIntoView({ block: 'center' });
      }
    }

    if (devInput) {
      devInput.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        const text = devInput.value.trim();
        if (!text) return;
        ctx.dispatch((s) => logic.addDevTask(s, { title: text }), '新增开发待办');
        devInput.value = '';
        devInput.focus();
      });
    }
    if (ideaInput) {
      ideaInput.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        const text = ideaInput.value.trim();
        if (!text) return;
        ctx.dispatch((s) => logic.addDevIdea(s, text), '记录灵感');
        ideaInput.value = '';
        ideaInput.focus();
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
    if (ui.handleCalendarClick(act, ev, 'dev', today, helpers.rerender)) return;
    // 图表操作（切时间范围 / 点柱子扇区看明细）
    if (ui.handleChartClick(act, 'dev', helpers.rerender)) return;

    const openEditor = (item) => {
      ui.openModal({
        title: '编辑开发待办',
        body:
          '<div class="field"><label class="field-label">内容</label>' +
          '<input class="input" type="text" data-field="title" value="' + ui.escapeHtml(item.title) + '"></div>' +
          '<div class="field-row">' +
          '<div class="field"><label class="field-label">状态</label>' +
          ui.select('status', item.status, logic.DEV_ORDER.map((s) => ({ value: s, label: logic.DEV_STATUS[s] }))) + '</div>' +
          '<div class="field"><label class="field-label">优先级</label>' +
          ui.select('priority', item.priority, [{ value: 'normal', label: '普通' }, { value: 'high', label: '重点' }]) + '</div>' +
          '</div>' +
          '<div class="field"><label class="field-label">备注</label>' +
          ui.textarea('note', item.note, '复现步骤、方案、链接…', 3) + '</div>',
        foot: '<button type="button" class="btn" data-act="close">取消</button>' +
          '<button type="button" class="btn btn-primary" data-act="save">保存</button>',
        onMount(root) {
          ui.qs(root, '[data-act="save"]').onclick = () => {
            const title = ui.qs(root, '[data-field="title"]').value.trim();
            if (!title) return;
            store.dispatch((s) => logic.updateDevTask(s, id, {
              title,
              status: ui.qs(root, '[data-field="status"]').value,
              priority: ui.qs(root, '[data-field="priority"]').value,
              note: ui.qs(root, '[data-field="note"]').value,
            }), { label: '编辑开发待办' });
            ui.closeModal();
            helpers.rerender();
          };
        },
      });
    };

    if (type === 'dev-new') {
      ui.promptDialog({ title: '新增开发待办', label: '内容', placeholder: '例如：改登录接口 bug', okText: '添加' })
        .then((title) => {
          if (!title) return;
          store.dispatch((s) => logic.addDevTask(s, { title }), { label: '新增开发待办' });
          helpers.rerender();
        });
      return;
    }

    if (type === 'dev-status') {
      const item = logic.findDevTask(state, id);
      if (!item) return;
      const idx = logic.DEV_ORDER.indexOf(item.status);
      const next = logic.DEV_ORDER[(idx + 1) % logic.DEV_ORDER.length];
      store.dispatch((s) => logic.updateDevTask(s, id, { status: next }), { label: '切换开发状态' });
      ui.toast('已切到「' + logic.DEV_STATUS[next] + '」', { duration: 1500 });
      helpers.rerender();
      return;
    }

    if (type === 'dev-edit') {
      const item = logic.findDevTask(state, id);
      if (item) openEditor(item);
      return;
    }

    if (type === 'dev-push') {
      const item = logic.findDevTask(state, id);
      if (!item) return;
      store.dispatch((s) => logic.pushDevToToday(s, id, today), { label: '推送到今日' });
      ui.toast('已把「' + item.title + '」加入今日计划', { type: 'ok', duration: 2200 });
      helpers.rerender();
      return;
    }

    if (type === 'dev-menu') {
      const item = logic.findDevTask(state, id);
      if (!item) return;
      ui.openModal({
        title: '操作：' + item.title,
        body: '<div class="action-list">' +
          '<button type="button" class="action-item" data-act="menu-pick" data-key="edit"><span class="ai-icon">✎</span><span>编辑</span></button>' +
          '<button type="button" class="action-item" data-act="menu-pick" data-key="priority"><span class="ai-icon">⚑</span><span>' +
          (item.priority === 'high' ? '取消重点' : '标记为重点') + '</span></button>' +
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
            if (key === 'priority') {
              store.dispatch((s) => logic.updateDevTask(s, id, { priority: item.priority === 'high' ? 'normal' : 'high' }), { label: '改优先级' });
              helpers.rerender();
              return;
            }
            if (key === 'push') {
              store.dispatch((s) => logic.pushDevToToday(s, id, today), { label: '推送到今日' });
              ui.toast('已加入今日计划', { type: 'ok', duration: 2200 });
              helpers.rerender();
              return;
            }
            if (key === 'delete') {
              store.dispatch((s) => logic.removeDevTask(s, id), { undoable: true, label: '删除开发待办' });
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

    if (type === 'idea-to-task') {
      const idea = logic.findDevIdea(state, id);
      if (!idea) return;
      store.dispatch((s) => logic.devIdeaToTask(s, id), { undoable: true, label: '灵感变待办' });
      ui.toast('把「' + idea.text + '」变成了开发待办', { type: 'ok', duration: 2400 });
      helpers.rerender();
      return;
    }

    if (type === 'idea-toggle') {
      const idea = logic.findDevIdea(state, id);
      if (!idea) return;
      store.dispatch((s) => logic.setDevIdeaHandled(s, id, !idea.handled), { label: '标记灵感' });
      helpers.rerender();
      return;
    }

    if (type === 'idea-delete') {
      const idea = logic.findDevIdea(state, id);
      if (!idea) return;
      store.dispatch((s) => logic.removeDevIdea(s, id), { undoable: true, label: '删除灵感' });
      ui.toastUndo('已删除这条灵感', () => {
        store.undo();
        helpers.rerender();
      });
      helpers.rerender();
    }
  },
};
