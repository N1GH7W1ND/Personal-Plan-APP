/**
 * 任务相关的交互动作（首页与今日计划共用）。
 *
 * 这是界面层的"动作库"：只调用 store.dispatch 与 ui 弹窗，不含渲染。
 */

import * as date from './date.js';
import * as logic from './logic.js';
import * as ui from './ui.js';

export function toggleTask(store, id) {
  store.dispatch((s) => logic.toggleTask(s, id), { label: '勾选任务' });
}

export function deleteTask(store, id, rerender) {
  const state = store.getState();
  const task = logic.findTask(state, id);
  if (!task) return;
  store.dispatch((s) => logic.removeTask(s, id), { undoable: true, label: '删除任务' });
  ui.toastUndo('已删除「' + task.title + '」', () => {
    store.undo();
    if (rerender) rerender();
  });
  if (rerender) rerender();
}

export function moveToToday(store, id, rerender) {
  const today = date.todayStr();
  store.dispatch((s) => logic.rescheduleTask(s, id, today), { label: '挪到今天' });
  ui.toast('已挪到今天', { type: 'ok', duration: 2000 });
  if (rerender) rerender();
}

export function moveAllToToday(store, rerender) {
  const state = store.getState();
  const today = date.todayStr();
  const ids = logic.overdueTasks(state, today).map((t) => t.id);
  if (!ids.length) return;
  store.dispatch((s) => logic.moveTasksTo(s, ids, today), { undoable: true, label: '全部挪到今天' });
  ui.toast('已把 ' + ids.length + ' 条逾期任务挪到今天', { type: 'ok', duration: 2500 });
  if (rerender) rerender();
}

export function openTaskEditor(store, id, rerender) {
  const task = logic.findTask(store.getState(), id);
  if (!task) return;
  ui.taskEditor(task, {
    modules: logic.MODULES,
    onSave(patch) {
      store.dispatch((s) => logic.updateTask(s, id, patch), { label: '编辑任务' });
      ui.toast('已保存', { type: 'ok', duration: 1800 });
      if (rerender) rerender();
    },
  });
}

export function openTaskMenu(store, id, rerender) {
  const task = logic.findTask(store.getState(), id);
  if (!task) return;

  ui.taskMenu(task, (key) => {
    if (key === 'edit') {
      openTaskEditor(store, id, rerender);
      return;
    }
    if (key === 'date') {
      ui.datePicker(task.date, (newDate) => {
        store.dispatch((s) => logic.rescheduleTask(s, id, newDate), { label: '改日期' });
        ui.toast('已改到 ' + date.fmtDateCn(newDate), { type: 'ok', duration: 2000 });
        if (rerender) rerender();
      });
      return;
    }
    if (key === 'module') {
      ui.modulePicker(task.module, logic.MODULES, (moduleId) => {
        store.dispatch((s) => logic.updateTask(s, id, { module: moduleId }), { label: '换模块' });
        ui.toast('已移到「' + logic.moduleName(moduleId) + '」', { type: 'ok', duration: 2000 });
        if (rerender) rerender();
      });
      return;
    }
    if (key === 'priority') {
      /*
       * 优先级有四档，没法用"点一下切一档"表达清楚，
       * 所以这里直接打开编辑弹窗让对方选（菜单文案也写明了当前是哪一档）。
       */
      openTaskEditor(store, id, rerender);
      return;
    }
    if (key === 'today') {
      moveToToday(store, id, rerender);
      return;
    }
    if (key === 'delete') {
      deleteTask(store, id, rerender);
    }
  });
}

/** 统一处理任务行上的点击（首页与今日计划共用） */
export function handleTaskClick(ev, store, ctx, helpers, opts) {
  const o = opts || {};
  const rerender = helpers && helpers.rerender ? helpers.rerender : null;
  const act = ev.target.closest('[data-act]');
  if (!act) return false;
  const type = act.getAttribute('data-act');
  const id = act.getAttribute('data-id');

  switch (type) {
    case 'toggle-task':
      toggleTask(store, id);
      return true;
    case 'edit-task':
      openTaskEditor(store, id, rerender);
      return true;
    case 'task-menu':
      openTaskMenu(store, id, rerender);
      return true;
    case 'move-today':
      moveToToday(store, id, rerender);
      return true;
    case 'delete-task':
      deleteTask(store, id, rerender);
      return true;
    case 'move-all-today':
      moveAllToToday(store, rerender);
      return true;
    case 'toggle-overdue': {
      const head = act;
      const body = head.parentNode.querySelector('.overdue-body');
      const open = head.classList.toggle('open');
      if (body) body.hidden = !open;
      return true;
    }
    case 'jump': {
      // 点来源模块标签：跳到该模块并高亮这条任务
      const moduleId = act.getAttribute('data-module');
      if (moduleId && o.onJump) {
        o.onJump(moduleId, id);
      }
      return true;
    }
    default:
      return false;
  }
}
