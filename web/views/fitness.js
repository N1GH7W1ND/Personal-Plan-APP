/**
 * 健身计划视图。
 * 结构：今天该练什么（按部位轮换）+ 逐组打卡 + 本周概览。
 * 注意（PRD 5.6）：健身打卡是模块自己的记录，不是任务；
 * 要让它出现在首页今日计划，得点「推送到今日」生成一条任务。
 */

import * as date from '../date.js';
import * as logic from '../logic.js';
import * as ui from '../ui.js';

/** 当前日历月份下，本模块每天的标记 */
function monthMarks(state, moduleId, today) {
  const { year, month } = ui.currentCalMonth(moduleId, today);
  return logic.calendarMarks(state, moduleId, year, month);
}

function setBoxes(exercise, entry, day) {
  const total = (entry && entry.doneSets ? entry.doneSets.length : exercise.sets) || 0;
  const doneSets = (entry && entry.doneSets) || [];
  const boxes = [];
  for (let i = 0; i < total; i++) {
    boxes.push('<button type="button" class="set-box' + (doneSets[i] ? ' on' : '') +
      '" data-act="fit-set" data-day="' + ui.escapeHtml(day) + '" data-ex="' + ui.escapeHtml(exercise.id) +
      '" data-set="' + i + '" title="第 ' + (i + 1) + ' 组">' + (doneSets[i] ? '✓' : '') + '</button>');
  }
  return '<div class="set-grid">' + boxes.join('') + '</div>';
}

export default {
  render(state, ctx) {
    const today = ctx.today;
    const routine = logic.todayRoutine(state, today);
    const rec = logic.fitnessRecord(state, today);
    const doneCount = logic.fitnessWeekDoneCount(state, today);
    const goal = state.settings.fitnessWeeklyGoal;

    /* ---- 今天练什么 ---- */
    let todayBody;
    if (routine.rest) {
      todayBody = ui.empty('☕', '今天是休息日', '好好恢复，明天再练。想改的话点「编辑周安排」');
    } else {
      const allDone = logic.fitnessExercisesAllDone(state, today);
      const rows = routine.exercises.map((e) => {
        const entry = rec && rec.exercises ? rec.exercises[e.id] : null;
        return ui.row({
          attrs: { id: 'fit-' + e.id },
          main:
            '<div class="row-title" data-act="fit-edit-ex" data-ex="' + ui.escapeHtml(e.id) + '" style="cursor:text">' +
            ui.escapeHtml(e.name) + ' <span class="muted small">' + e.sets + ' 组 × ' + e.reps + ' 次</span></div>' +
            ui.rowMeta(setBoxes(e, entry, today)),
          actions:
            ui.btn('完成整项', { act: 'fit-ex-done', 'data-ex': e.id, 'data-day': today }, 'btn-sm') +
            ui.iconBtn('✕', { act: 'fit-del-ex', 'data-ex': e.id }, '删除这个动作'),
          actionsAlways: true,
        });
      }).join('');

      todayBody =
        '<div class="list">' + rows + '</div>' +
        '<div class="card-foot" style="margin:0 -15px -13px; margin-top:12px">' +
        ui.btn('+ 加动作', { act: 'fit-add-ex' }, 'btn-sm') +
        ui.btn('编辑周安排', { act: 'fit-edit-routine' }, 'btn-sm') +
        '<span class="spacer"></span>' +
        (rec && rec.finished
          ? '<span class="tag ok">今天已打卡</span>' + ui.btn('取消打卡', { act: 'fit-unfinish' }, 'btn-sm')
          : ui.btn(allDone ? '今日训练全部完成 → 打卡' : '打卡（把今天记为已练）', { act: 'fit-finish' }, 'btn-primary btn-sm')) +
        '</div>';
    }

    /* ---- 本周概览 ---- */
    const week = logic.fitnessWeekOverview(state, today);
    const weekCells = week.map((w) =>
      '<div class="week-cell' + (w.done ? ' done' : '') + (w.rest ? ' rest' : '') + (w.isToday ? ' today' : '') +
      '" data-act="fit-week-pick" data-date="' + ui.escapeHtml(w.date) + '" title="' +
      (w.isFuture ? '还没到那天' : '点一下切换这天有没有练') + '">' +
      date.WEEK_FULL_CN[w.weekday - 1] +
      '<span class="week-cell-tag">' + (w.done ? '已练' : (w.rest ? '休息' : (w.isFuture ? '—' : '未练'))) + '</span>' +
      '</div>').join('');

    const percent = goal > 0 ? Math.min(100, Math.round((doneCount / goal) * 100)) : 0;

    const todo = state.tasks.filter((t) => t.module === 'fitness' && t.date === today && !t.done);

    return ui.card({
      title: '今天：' + routine.label,
      sub: routine.rest ? '休息日' : routine.exercises.length + ' 个动作',
      actions: routine.rest ? '' : ui.btn('推送到今日', { act: 'fit-push' }, 'btn-sm'),
      body: todayBody,
    }) +
    ui.card({
      title: '本周进度',
      sub: '已练 ' + doneCount + '/' + goal + ' 天（目标可在设置里改）',
      body: '<div class="progress-line"><div class="progress"><div class="progress-bar" style="width:' + percent + '%"></div></div>' +
        '<span class="progress-text">' + doneCount + '/' + goal + '</span></div>' +
        '<div style="height:12px"></div>' +
        '<div class="week-grid">' + weekCells + '</div>',
    }) +
    ui.card({
      title: '训练日历',
      sub: '哪天练了、哪天休息，一眼看到',
      body: ui.moduleCalendar({
        moduleId: 'fitness',
        state,
        today,
        marks: monthMarks(state, 'fitness', today),
        dayPanel: ui.calendarDayTasks(state, 'fitness', ui.getCalState('fitness').selected, today),
      }),
    }) +
    (todo.length ? ui.card({
      title: '今天要做的健身任务',
      sub: todo.length + ' 条未完成',
      body: '<div class="list">' + todo.map((t) => ui.taskRow(t, { today })).join('') + '</div>',
    }) : '');
  },

  onClick(ev, store, ctx, helpers) {
    const act = ev.target.closest('[data-act]');
    if (!act) return;
    const type = act.getAttribute('data-act');
    const today = ctx.today;
    const state = store.getState();

    // 日历操作（切月 / 选日期）
    if (ui.handleCalendarClick(act, ev, 'fitness', today, helpers.rerender)) return;

    if (type === 'fit-set') {
      const day = act.getAttribute('data-day');
      const exId = act.getAttribute('data-ex');
      const setIndex = Number(act.getAttribute('data-set'));
      store.dispatch((s) => logic.toggleFitnessSet(s, day, exId, setIndex), { label: '健身逐组打卡' });
      helpers.rerender();
      return;
    }

    if (type === 'fit-ex-done') {
      const day = act.getAttribute('data-day') || today;
      const exId = act.getAttribute('data-ex');
      store.dispatch((s) => logic.toggleFitnessExercise(s, day, exId), { label: '完成整项' });
      helpers.rerender();
      return;
    }

    if (type === 'fit-finish') {
      store.dispatch((s) => logic.finishFitnessDay(s, today), { label: '健身打卡' });
      ui.toast('今天已打卡 ✅', { type: 'ok', duration: 2400 });
      helpers.rerender();
      return;
    }

    if (type === 'fit-unfinish') {
      store.dispatch((s) => logic.unfinishFitnessDay(s, today), { label: '取消打卡' });
      helpers.rerender();
      return;
    }

    if (type === 'fit-week-pick') {
      const day = act.getAttribute('data-date');
      if (day > today) {
        ui.toast('还没到那天，先不补记', { duration: 2000 });
        return;
      }
      const rec = logic.fitnessRecord(state, day);
      const done = !!(rec && rec.finished);
      if (!done && day !== today && logic.todayRoutine(state, day).rest) {
        ui.confirmDialog({
          title: '这天是休息日',
          message: date.fmtDateCn(day) + ' 按周安排是休息日，确定要补记为已练吗？',
          okText: '仍要补记',
        }).then((yes) => {
          if (!yes) return;
          store.dispatch((s) => logic.markFitnessDay(s, day, true), { label: '补记健身' });
          helpers.rerender();
        });
        return;
      }
      store.dispatch((s) => logic.markFitnessDay(s, day, !done), { label: '切换健身打卡' });
      helpers.rerender();
      return;
    }

    if (type === 'fit-push') {
      const routine = logic.todayRoutine(state, today);
      if (routine.rest) {
        ui.toast('今天休息，不用推任务', { duration: 2000 });
        return;
      }
      store.dispatch((s) => logic.pushFitnessToToday(s, today), { label: '推送到今日' });
      ui.toast('已把「' + routine.label + ' 训练」加入今日计划', { type: 'ok', duration: 2400 });
      helpers.rerender();
      return;
    }

    if (type === 'fit-add-ex') {
      const weekday = date.weekdayNum(today);
      ui.openModal({
        title: '加一个动作',
        body:
          '<div class="field"><label class="field-label">动作名称</label>' +
          '<input class="input" type="text" data-field="name" placeholder="例如：哑铃卧推"></div>' +
          '<div class="field-row">' +
          '<div class="field"><label class="field-label">组数</label>' +
          '<input class="input" type="number" min="1" data-field="sets" value="3"></div>' +
          '<div class="field"><label class="field-label">每组次数</label>' +
          '<input class="input" type="number" min="1" data-field="reps" value="12"></div>' +
          '</div>',
        foot: '<button type="button" class="btn" data-act="close">取消</button>' +
          '<button type="button" class="btn btn-primary" data-act="save">添加</button>',
        onMount(root) {
          ui.qs(root, '[data-act="save"]').onclick = () => {
            const name = ui.qs(root, '[data-field="name"]').value.trim();
            if (!name) return;
            const sets = Number(ui.qs(root, '[data-field="sets"]').value) || 3;
            const reps = Number(ui.qs(root, '[data-field="reps"]').value) || 12;
            store.dispatch((s) => logic.addFitnessExercise(s, weekday, { name, sets, reps }), { label: '加健身动作' });
            ui.closeModal();
            helpers.rerender();
          };
        },
      });
      return;
    }

    if (type === 'fit-edit-ex') {
      const exId = act.getAttribute('data-ex');
      const weekday = date.weekdayNum(today);
      const routine = logic.weekdayRoutine(state, weekday);
      const ex = (routine.exercises || []).find((x) => x.id === exId);
      if (!ex) return;
      ui.openModal({
        title: '编辑动作',
        body:
          '<div class="field"><label class="field-label">动作名称</label>' +
          '<input class="input" type="text" data-field="name" value="' + ui.escapeHtml(ex.name) + '"></div>' +
          '<div class="field-row">' +
          '<div class="field"><label class="field-label">组数</label>' +
          '<input class="input" type="number" min="1" data-field="sets" value="' + ex.sets + '"></div>' +
          '<div class="field"><label class="field-label">每组次数</label>' +
          '<input class="input" type="number" min="1" data-field="reps" value="' + ex.reps + '"></div>' +
          '</div>' +
          '<p class="muted small">改的是「' + ui.escapeHtml(routine.label) + '」这一天的固定安排。</p>',
        foot: '<button type="button" class="btn" data-act="close">取消</button>' +
          '<button type="button" class="btn btn-primary" data-act="save">保存</button>',
        onMount(root) {
          ui.qs(root, '[data-act="save"]').onclick = () => {
            const name = ui.qs(root, '[data-field="name"]').value.trim();
            if (!name) return;
            store.dispatch((s) => logic.updateFitnessExercise(s, weekday, exId, {
              name,
              sets: Number(ui.qs(root, '[data-field="sets"]').value) || ex.sets,
              reps: Number(ui.qs(root, '[data-field="reps"]').value) || ex.reps,
            }), { label: '编辑健身动作' });
            ui.closeModal();
            helpers.rerender();
          };
        },
      });
      return;
    }

    if (type === 'fit-del-ex') {
      const exId = act.getAttribute('data-ex');
      const weekday = date.weekdayNum(today);
      const routine = logic.weekdayRoutine(state, weekday);
      const ex = (routine.exercises || []).find((x) => x.id === exId);
      if (!ex) return;
      ui.confirmDialog({
        title: '删除动作',
        message: '把「' + ex.name + '」从今天的安排里删掉？',
        okText: '删除',
        danger: true,
      }).then((yes) => {
        if (!yes) return;
        store.dispatch((s) => logic.removeFitnessExercise(s, weekday, exId), { undoable: true, label: '删除健身动作' });
        helpers.rerender();
      });
      return;
    }

    if (type === 'fit-edit-routine') {
      const rows = date.WEEK_FULL_CN.map((name, i) => {
        const r = logic.weekdayRoutine(state, i + 1);
        return '<div class="field-row" style="align-items:center">' +
          '<div style="flex:0 0 52px" class="small">' + name + '</div>' +
          '<input class="input" type="text" data-field="label-' + (i + 1) + '" value="' + ui.escapeHtml(r.label) + '"' +
          (r.rest ? ' disabled' : '') + '>' +
          '<label class="small" style="flex:0 0 78px"><input type="checkbox" data-field="rest-' + (i + 1) + '"' +
          (r.rest ? ' checked' : '') + '> 休息日</label>' +
          '</div>';
      }).join('');

      ui.openModal({
        title: '编辑周安排',
        body: '<p class="muted small">改的是"每周固定怎么练"。勾上休息日会清空当天的动作。</p>' + rows,
        foot: '<button type="button" class="btn" data-act="close">取消</button>' +
          '<button type="button" class="btn btn-primary" data-act="save">保存</button>',
        onMount(root) {
          for (let i = 1; i <= 7; i++) {
            const cb = ui.qs(root, '[data-field="rest-' + i + '"]');
            const label = ui.qs(root, '[data-field="label-' + i + '"]');
            if (cb && label) {
              cb.onchange = () => { label.disabled = cb.checked; };
            }
          }
          ui.qs(root, '[data-act="save"]').onclick = () => {
            // 先取值再改数据：不要在手改数据的过程中依赖已关闭的弹窗节点
            const wanted = [];
            for (let i = 1; i <= 7; i++) {
              const cb = ui.qs(root, '[data-field="rest-' + i + '"]');
              const label = ui.qs(root, '[data-field="label-' + i + '"]');
              wanted.push({
                weekday: i,
                rest: !!(cb && cb.checked),
                label: label ? label.value.trim() : '',
              });
            }
            store.dispatch((s) => {
              for (const w of wanted) {
                const patch = { rest: w.rest };
                // 休息日之外必须有个名字，空值就保持原样
                if (!w.rest) patch.label = w.label || logic.weekdayRoutine(s, w.weekday).label;
                logic.setRoutineDay(s, w.weekday, patch);
              }
            }, { label: '编辑健身周安排' });
            ui.closeModal();
            helpers.rerender();
          };
        },
      });
    }
  },
};
