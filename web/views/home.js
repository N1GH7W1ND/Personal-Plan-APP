/**
 * 首页总览。
 * 从上到下：今日计划（主角）→ 快速补一条 → 逾期折叠 → 快速备忘 → 待你处理。
 *
 * 设计约束（见 PRD 3.4）：首页只显示"你亲手安排的事"，
 * 不出现任何系统自动生成的任务或推荐入口。
 */

import * as date from '../date.js';
import * as logic from '../logic.js';
import * as ui from '../ui.js';
import * as actions from '../actions.js';

let overdueOpen = false;

export default {
  render(state, ctx) {
    const today = ctx.today;
    const list = logic.tasksOn(state, today);
    const done = list.filter((t) => t.done).length;
    const overdue = logic.overdueTasks(state, today);
    const percent = list.length ? Math.round((done / list.length) * 100) : 0;

    /* ---- 今日计划 ---- */
    const rows = list.length
      ? list.map((t) => ui.taskRow(t, { today })).join('')
      : ui.empty('☑', '今天还没有安排', '点右上角「+ 快速添加」，或到各模块里加');

    const todayCard = ui.card({
      title: '今日计划',
      sub: list.length ? done + '/' + list.length + ' 已完成' : '还没有任务',
      actions: ui.btn('查看全部', { act: 'goto-today' }, 'btn-sm'),
      body:
        '<div class="progress-line"><div class="progress"><div class="progress-bar" style="width:' + percent + '%"></div></div>' +
        '<span class="progress-text">' + percent + '%</span></div>' +
        '<div style="height:12px"></div>' +
        '<div class="list">' + rows + '</div>' +
        ui.overdueBlock(overdue, { today, open: overdueOpen }),
    });

    /* ---- 快速补一条（模块列表与左侧导航一致，没有"通用"） ---- */
    const quickCard = ui.card({
      title: '快速补一条',
      sub: '选好模块，写完回车',
      tight: true,
      body: ui.quickAddRow({ modules: logic.quickAddModules(state) }),
    });

    /* ---- 快速备忘 ---- */
    const notes = state.notes.slice().sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));
    const noteCard = ui.card({
      title: '快速备忘',
      sub: state.notes.filter((n) => !n.done).length + ' 条待办',
      body:
        '<div class="note-add">' +
        '<input class="input" type="text" data-field="note-input" placeholder="随手记点什么，回车即存">' +
        '</div><div style="height:10px"></div>' +
        ui.noteList(notes),
    });

    /* ---- 待你处理（无内容时整块隐藏） ---- */
    const summary = logic.homeSummary(state, today);
    const summaryCard = summary.length
      ? ui.card({
        title: '待你处理',
        sub: '需要你现在做决定的事',
        tight: true,
        body: ui.summaryList(summary),
      })
      : '';

    /* ---- 全模块汇总图表 ---- */
    const chartCard = ui.card({
      title: '各模块汇总',
      sub: '切时间范围看整体趋势；点柱子或扇形看具体内容，点扇形里的模块名可跳到该模块',
      body: ui.chartCard({ moduleId: 'all', state, today, logic }),
    });

    return '<div class="home-grid">' +
      '<div>' + todayCard + quickCard + '</div>' +
      '<div>' + noteCard + summaryCard + '</div>' +
      '</div>' +
      chartCard;
  },

  mounted(root, ctx, helpers) {
    const noteInput = root.querySelector('[data-field="note-input"]');
    const quickInput = root.querySelector('[data-field="quick-title"]');

    // 刻意**不**自动把焦点放进输入框：
    // 焦点在输入框里时，数字键属于输入内容，1–6 就没法用来切换页面了，
    // 每次都得先点一下空白处才能切，很别扭。
    // 想输入时点一下输入框即可；提交后仍会保持焦点，方便连续添加。

    if (noteInput) {
      noteInput.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        const text = noteInput.value.trim();
        if (!text) return;
        ctx.addNote(text);
        noteInput.value = '';
      });
    }
    if (quickInput) {
      quickInput.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        const text = quickInput.value.trim();
        if (!text) return;
        const moduleSel = root.querySelector('[data-field="module"]');
        /*
         * 下拉里没选模块时的兜底：取"当前可见模块"里的第一个。
         * 顺序来自设置里的配置，所以兜底项也跟着用户排的顺序走。
         */
        const modules = logic.quickAddModules(helpers && helpers.store ? helpers.store.getState() : null);
        const fallback = modules[0];
        ctx.addTask({
          title: text,
          module: moduleSel ? moduleSel.value : (fallback ? fallback.id : 'general'),
          date: ctx.today,
        });
        quickInput.value = '';
        quickInput.focus();
      });
    }

    if (ctx.anchor) {
      const target = root.querySelector('[id="task-' + ctx.anchor + '"]');
      if (target) {
        target.classList.add('flash');
        target.scrollIntoView({ block: 'center' });
      }
    }
  },

  onClick(ev, store, ctx, helpers) {
    const act = ev.target.closest('[data-act]');
    if (!act) return;
    const type = act.getAttribute('data-act');
    const id = act.getAttribute('data-id');

    // 图表：点图例里的模块名直接跳到该模块（这个要抢在图表本身的"选中"之前）
    if (type === 'chart-slice' && act.getAttribute('data-kind') === 'module') {
      const key = act.getAttribute('data-key');
      if (logic.MODULE_IDS.includes(key)) { ctx.go(key); return; }
    }
    // 图表：切时间范围、点柱子/扇形看明细
    if (ui.handleChartClick(act, 'all', helpers.rerender)) return;

    if (type === 'goto-today') { ctx.go('today'); return; }
    if (type === 'summary-go') {
      ctx.go(act.getAttribute('data-route'), act.getAttribute('data-anchor'));
      return;
    }
    if (type === 'add-here' || type === 'add-task') {
      ctx.quickAdd({ date: ctx.today, module: type === 'add-task' ? (act.getAttribute('data-module') || 'general') : 'general' });
      return;
    }

    if (type === 'toggle-note') { ctx.toggleNote(id); return; }
    if (type === 'delete-note') { ctx.deleteNote(id); return; }
    if (type === 'edit-note') { ctx.editNote(id); return; }
    if (type === 'note-to-task') { ctx.noteToTask(id); return; }

    if (type === 'toggle-overdue') {
      overdueOpen = !overdueOpen;
    }

    // 任务相关操作（勾选、改期、菜单等）走公共逻辑
    actions.handleTaskClick(ev, store, ctx, helpers, {
      onJump: (moduleId, taskId) => ctx.jump(moduleId, taskId),
    });
  },
};
