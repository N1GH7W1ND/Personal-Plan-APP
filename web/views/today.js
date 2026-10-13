/**
 * 今日计划视图。
 * 按日期看任务安排：切换日期、勾选、改期、删除、处理逾期。
 * 这里的数据与各模块清单是同一份，勾选在哪边做都同步。
 */

import * as date from '../date.js';
import * as logic from '../logic.js';
import * as ui from '../ui.js';
import * as actions from '../actions.js';

/** 逾期区展开状态（纯界面状态，不落盘） */
let overdueOpen = false;

export default {
  render(state, ctx) {
    const day = ctx.selectedDate;
    const today = ctx.today;
    const list = logic.tasksOn(state, day);
    const done = list.filter((t) => t.done).length;
    const overdue = logic.overdueTasks(state, today);
    const isToday = day === today;
    const rel = date.relativeDay(day);
    const percent = list.length ? Math.round((done / list.length) * 100) : 0;

    const rows = list.length
      ? list.map((t) => ui.taskRow(t, { today })).join('')
      : ui.empty('☑', isToday ? '今天还没有安排' : '这天还没有安排',
        '点右上角「+ 快速添加」，或直接进入某个模块添加');

    const head = ui.dateBar(day, {
      hideToday: isToday,
      extra: ui.btn('+ 加一条', { act: 'add-here' }, 'btn-primary btn-sm'),
    });

    const main = ui.card({
      title: isToday ? '今日计划' : (date.fmtDateCn(day) + ' 的计划'),
      sub: (isToday ? '' : rel + ' · ') + done + '/' + list.length + ' 已完成',
      body: head +
        '<div style="height:12px"></div>' +
        '<div class="progress-line"><div class="progress"><div class="progress-bar" style="width:' + percent + '%"></div></div>' +
        '<span class="progress-text">' + percent + '%</span></div>' +
        '<div style="height:12px"></div>' +
        '<div class="list">' + rows + '</div>',
    });

    const overdueCard = overdue.length
      ? ui.card({
        title: '逾期任务',
        sub: '超过日期仍未完成，不会自动顺延',
        body: ui.overdueBlock(overdue, { today, open: overdueOpen }),
      })
      : '';

    const stats = ui.card({
      title: '这一天的小结',
      body: ui.statRow([
        { num: list.length, label: '总任务' },
        { num: done, label: '已完成' },
        { num: list.length - done, label: '未完成' },
        { num: logic.overdueTasks(state, today).length, label: '逾期（累计）' },
      ]),
    });

    return main + overdueCard + stats;
  },

  mounted(root, ctx) {
    if (!ctx.anchor) return;
    const target = root.querySelector('[id="task-' + ctx.anchor + '"]');
    if (target) {
      target.classList.add('flash');
      target.scrollIntoView({ block: 'center' });
    }
  },

  onClick(ev, store, ctx, helpers) {
    const act = ev.target.closest('[data-act]');
    if (!act) return;
    const type = act.getAttribute('data-act');

    if (type === 'prev-day') { ctx.setSelectedDate(date.addDays(ctx.selectedDate, -1)); helpers.rerender(); return; }
    if (type === 'next-day') { ctx.setSelectedDate(date.addDays(ctx.selectedDate, 1)); helpers.rerender(); return; }
    if (type === 'goto-today') { ctx.setSelectedDate(null); helpers.rerender(); return; }

    if (type === 'add-here') {
      ctx.quickAdd({ date: ctx.selectedDate, module: 'general' });
      return;
    }

    if (type === 'toggle-overdue') {
      overdueOpen = !overdueOpen;
    }

    actions.handleTaskClick(ev, store, ctx, helpers, {
      onJump: (moduleId, taskId) => ctx.jump(moduleId, taskId),
    });
  },
};
