/**
 * 健身视图。
 *
 * 结构与其他模块保持一致：
 *   1. 概况与本周目标 —— 本周练了几次 / 目标几次、连续天数、累计时长
 *   2. 今天 —— 今天这次训练（类型 / 时长 / 强度 / 动作），可编辑可删除
 *   3. 训练目标 —— 每周练几次某类型，带本周进度
 *   4. 健身日历 —— 哪几天练了
 *   5. 健身统计 —— 与其他模块一致的时间范围图表
 *   6. 训练日志 / 类型分布 / 训练记录
 */

import * as date from '../date.js';
import * as logic from '../logic.js';
import * as ui from '../ui.js';

/** 当前日历月份下，本模块每天的标记 */
function monthMarks(state, moduleId, today) {
  const { year, month } = ui.currentCalMonth(moduleId, today);
  return logic.calendarMarks(state, moduleId, year, month);
}

/** 训练类型下拉：常见类型 + 已用过的自定义类型 */
function typeOptions(state, extra) {
  const used = (state.fitness.log || []).map((r) => r.type);
  const all = logic.FITNESS_TYPES.concat(used.filter((t) => t && !logic.FITNESS_TYPES.includes(t)));
  const uniq = [...new Set(all)].filter(Boolean);
  if (extra && extra.type && !uniq.includes(extra.type)) uniq.unshift(extra.type);
  return uniq.map((t) => ({ value: t, label: t }));
}

/** 一行训练日志 */
function logRow(rec) {
  const meta = [];
  meta.push(ui.tag(rec.type || '其他'));
  if (rec.minutes) meta.push('<span class="muted">' + rec.minutes + ' 分钟</span>');
  if (rec.intensity && rec.intensity !== 'normal') {
    meta.push(ui.tag(logic.FITNESS_INTENSITY[rec.intensity], 'warn'));
  }
  if (rec.exercises && rec.exercises.length) {
    meta.push('<span class="muted">' + ui.escapeHtml(
      rec.exercises.map((e) => e.name + (e.sets ? ' ' + e.sets + '×' + e.reps : '')).join('、')
    ) + '</span>');
  }

  return ui.row({
    attrs: { id: 'workout-' + rec.id },
    main:
      '<div class="row-title">' + ui.escapeHtml(date.fmtDateCn(rec.date)) + '</div>' +
      ui.rowMeta(meta.join('')) +
      (rec.note ? '<div class="muted small">' + ui.escapeHtml(rec.note) + '</div>' : ''),
    actions:
      ui.btn('编辑', { act: 'workout-edit', id: rec.id }, 'btn-sm') +
      ui.iconBtn('✕', { act: 'workout-del', id: rec.id }, '删除这次训练'),
    actionsAlways: true,
  });
}

export default {
  render(state, ctx) {
    const today = ctx.today;
    const st = logic.fitnessStats(state, today);
    const week = logic.fitnessWeekOverview(state, today);
    const todayWorkout = logic.workoutOn(state, today);
    const goalProgress = logic.fitnessGoalProgress(state, today);
    const typeStats = logic.fitnessTypeStats(state);

    /* ---- 1. 概况与本周目标 ---- */
    const overview = ui.card({
      title: '健身',
      sub: '累计 ' + st.count + ' 次 · ' + st.minutesTotal + ' 分钟 · 连续 ' + st.streak + ' 天',
      actions: ui.btn(todayWorkout ? '今天再加一次' : '记录今天的训练',
        { act: 'workout-new' }, 'btn-primary btn-sm'),
      body:
        '<div class="read-goal">' +
          '<div class="read-goal-head">' +
            '<span class="read-goal-label">本周练了 <b>' + st.weekDone + '</b> / ' + st.weekGoal + ' 次' +
              (st.weekDone >= st.weekGoal
                ? ' <span class="ok-text">已达标 ✓</span>'
                : ' <span class="muted">还差 ' + (st.weekGoal - st.weekDone) + ' 次</span>') +
            '</span>' +
            ui.btn('推到今日计划', { act: 'workout-push' }, 'btn-sm') +
          '</div>' +
          '<div class="progress"><div class="progress-bar" style="width:' + st.weekPercent + '%"></div></div>' +
        '</div>' +
        ui.statRow([
          { num: st.count, label: '累计训练次数' },
          { num: Math.round(st.minutesTotal / 60 * 10) / 10, label: '累计小时' },
          { num: st.streak, label: '连续天数' },
          { num: st.goalsReached + '/' + st.goals, label: '达标目标' },
        ]) +
        '<div class="week-strip">' + week.map((d) => {
          const cls = ['week-dot'];
          if (d.trained) cls.push('done');
          if (d.isToday) cls.push('today');
          return '<div class="' + cls.join(' ') + '" title="' +
            ui.escapeHtml(date.fmtDateCn(d.date) + '：' +
              (d.trained ? (d.type || '已练') + ' ' + d.minutes + ' 分钟' : '没练')) + '">' +
            '<span class="wd-name">' + ui.escapeHtml(date.WEEK_CN[date.weekdayNum(d.date) - 1]) + '</span>' +
            '<span class="wd-min">' + (d.trained ? (d.minutes || '✓') : '·') + '</span>' +
          '</div>';
        }).join('') + '</div>',
    });

    /* ---- 2. 今天 ---- */
    const todayCard = ui.card({
      title: '今天',
      sub: todayWorkout
        ? (todayWorkout.type || '训练') + ' · ' + todayWorkout.minutes + ' 分钟'
        : '还没记录',
      actions: ui.btn(todayWorkout ? '再加一次' : '+ 记录训练', { act: 'workout-new' }, 'btn-sm'),
      body: todayWorkout
        ? '<div class="fitness-today">' +
            '<div class="ft-head">' +
              ui.tag(todayWorkout.type || '其他') +
              '<span class="muted">' + todayWorkout.minutes + ' 分钟</span>' +
              ui.tag(logic.FITNESS_INTENSITY[todayWorkout.intensity] || '正常') +
            '</div>' +
            (todayWorkout.exercises.length
              ? '<div class="ft-ex">' + todayWorkout.exercises.map((e) =>
                '<span class="ex-chip">' + ui.escapeHtml(e.name) +
                (e.sets ? ' <b>' + e.sets + '×' + e.reps + '</b>' : '') + '</span>').join('') + '</div>'
              : '') +
            (todayWorkout.note ? '<div class="ft-note">' + ui.escapeHtml(todayWorkout.note) + '</div>' : '') +
            '<div class="ft-actions">' +
              ui.btn('编辑', { act: 'workout-edit', id: todayWorkout.id }, 'btn-sm') +
              ui.btn('删除', { act: 'workout-del', id: todayWorkout.id }, 'btn-danger btn-sm') +
            '</div>' +
          '</div>'
        : ui.empty('⚑', '今天还没有训练记录', '点右上角「记录今天的训练」，填个时长就行'),
    });

    /* ---- 3. 训练目标 ---- */
    const goalRows = goalProgress.length
      ? goalProgress.map((g) =>
        '<div class="goal-row' + (g.reached ? ' reached' : '') + '" id="goal-' + ui.escapeHtml(g.id) + '">' +
          '<div class="goal-main">' +
            '<div class="goal-title">' + ui.escapeHtml(g.type) +
              (g.reached ? ' <span class="ok-text">✓ 已达标</span>' : '') + '</div>' +
            '<div class="book-progress">' +
              '<div class="progress"><div class="progress-bar" style="width:' + g.percent + '%"></div></div>' +
              '<span class="book-pct">' + g.done + '/' + g.perWeek + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="goal-actions">' +
            ui.btn('记一次', { act: 'workout-new', type: g.type }, 'btn-sm') +
            ui.iconBtn('✎', { act: 'goal-edit', id: g.id }, '编辑目标') +
            ui.iconBtn('✕', { act: 'goal-del', id: g.id }, '删除目标') +
          '</div>' +
        '</div>').join('')
      : ui.empty('◍', '还没有训练目标', '例如「胸 + 三头 每周 2 次」');

    const goalsCard = ui.card({
      title: '训练目标',
      sub: goalProgress.length ? '本周达标 ' + st.goalsReached + '/' + goalProgress.length : '每周练几次',
      actions: ui.btn('+ 加目标', { act: 'goal-new' }, 'btn-sm'),
      body: goalRows,
    });

    /* ---- 4. 健身日历 ---- */
    const calendarCard = ui.card({
      title: '健身日历',
      sub: '哪几天练了',
      body: ui.moduleCalendar({
        moduleId: 'fitness',
        state,
        today,
        marks: monthMarks(state, 'fitness', today),
        dayPanel: ui.calendarDayTasks(state, 'fitness', ui.getCalState('fitness').selected, today),
      }),
    });

    /* ---- 5. 健身统计 ---- */
    const chartCard = ui.card({
      title: '健身统计',
      sub: '切时间范围看趋势；点柱子或扇形看具体内容',
      body: ui.chartCard({ moduleId: 'fitness', state, today, logic }),
    });

    /* ---- 6. 训练日志 ---- */
    const recent = state.fitness.log.slice()
      .sort((a, b) => (a.date < b.date ? 1 : (a.date > b.date ? -1 : 0)))
      .slice(0, 6);
    const logCard = recent.length
      ? ui.card({
        title: '训练日志',
        sub: '最近 ' + recent.length + ' 次',
        body: '<div class="list">' + recent.map(logRow).join('') + '</div>',
      })
      : '';

    /* ---- 7. 练得偏不偏 ---- */
    const typeCard = typeStats.length > 1
      ? ui.card({
        title: '练得偏不偏',
        sub: '按类型统计次数与时长',
        body: '<div class="type-bars">' + typeStats.map((t) => {
          const max = Math.max(...typeStats.map((x) => x.count));
          return '<div class="type-bar-row">' +
            '<span class="tb-name">' + ui.escapeHtml(t.type) + '</span>' +
            '<div class="progress tb-track"><div class="progress-bar" style="width:' +
              Math.round((t.count / max) * 100) + '%"></div></div>' +
            '<span class="tb-num">' + t.count + ' 次 / ' + t.minutes + ' 分</span>' +
          '</div>';
        }).join('') + '</div>',
      })
      : '';

    /* ---- 8. 训练记录（文字） ---- */
    const notes = logic.fitnessNotesSorted(state);
    const noteRows = notes.length
      ? notes.map((n) =>
        '<div class="book-note" id="fnote-' + ui.escapeHtml(n.id) + '">' +
          '<div class="bn-head">' +
            '<span class="muted">' + ui.escapeHtml(date.fmtDateCn(n.date)) + '</span>' +
            (n.mood && n.mood !== 'normal' ? ui.tag(logic.FITNESS_INTENSITY[n.mood], 'warn') : '') +
            '<span class="spacer"></span>' +
            ui.iconBtn('✎', { act: 'fnote-edit', id: n.id }, '编辑') +
            ui.iconBtn('✕', { act: 'fnote-del', id: n.id }, '删除') +
          '</div>' +
          '<div class="bn-text">' + ui.escapeHtml(n.text) + '</div>' +
        '</div>').join('')
      : ui.empty('✎', '还没有记录', '练完随手写一句：状态、重量、注意点');

    const notesCard = ui.card({
      title: '训练记录',
      sub: st.notes + ' 条',
      actions: ui.btn('+ 记一条', { act: 'fnote-new' }, 'btn-sm'),
      tight: true,
      body: '<div class="note-add">' +
        '<input class="input" type="text" data-field="fnote-input" placeholder="随手写一句，回车即存">' +
        '</div><div style="height:10px"></div>' + noteRows,
    });

    return overview + todayCard + goalsCard + calendarCard + chartCard + logCard + typeCard + notesCard;
  },

  mounted(root, ctx) {
    // 快速记一句训练感受：回车即存
    const input = root.querySelector('[data-field="fnote-input"]');
    if (input) {
      input.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        const text = input.value.trim();
        if (!text) return;
        ctx.dispatch((s) => logic.addFitnessNote(s, { text }), '新增训练记录');
        input.value = '';
        input.focus();
      });
    }

    if (ctx.anchor) {
      const target = root.querySelector('[id="workout-' + ctx.anchor + '"]') ||
        root.querySelector('[id="fnote-' + ctx.anchor + '"]') ||
        root.querySelector('[id="goal-' + ctx.anchor + '"]');
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
    const today = ctx.today;
    const state = store.getState();

    // 日历与图表
    if (ui.handleCalendarClick(act, ev, 'fitness', today, helpers.rerender)) return;
    if (ui.handleChartClick(act, 'fitness', helpers.rerender)) return;

    /* ---- 训练日志 ---- */
    if (type === 'workout-new') {
      /*
       * 预设类型取 data-type，不是 type。
       * type 属性被按钮的 type="button" 占用了，读它会拿到字符串 "button"——
       * 这个 bug 曾经让"从训练目标点记一次"把类型填成 "button"。
       */
      const presetType = act.getAttribute('data-type') || '';
      openWorkoutDialog(store, helpers, null, today, presetType, state);
      return;
    }

    if (type === 'workout-edit') {
      const rec = logic.findWorkout(state, id);
      if (!rec) return;
      openWorkoutDialog(store, helpers, rec, today, '', state);
      return;
    }

    if (type === 'workout-del') {
      const rec = logic.findWorkout(state, id);
      if (!rec) return;
      store.dispatch((s) => logic.removeWorkout(s, id), { undoable: true, label: '删除训练记录' });
      ui.toastUndo('已删除 ' + date.fmtDateCn(rec.date) + ' 的训练记录', () => {
        store.undo();
        helpers.rerender();
      });
      helpers.rerender();
      return;
    }

    if (type === 'workout-push') {
      store.dispatch((s) => logic.pushWorkoutToToday(s, today), { label: '推到今日' });
      ui.toast('已加入今日计划', { type: 'ok', duration: 2000 });
      helpers.rerender();
      return;
    }

    /* ---- 训练目标 ---- */
    if (type === 'goal-new' || type === 'goal-edit') {
      const goal = type === 'goal-edit' ? logic.findFitnessGoal(state, id) : null;
      openGoalDialog(store, helpers, goal, state);
      return;
    }

    if (type === 'goal-del') {
      const goal = logic.findFitnessGoal(state, id);
      if (!goal) return;
      store.dispatch((s) => logic.removeFitnessGoal(s, id), { undoable: true, label: '删除训练目标' });
      ui.toastUndo('已删除目标「' + goal.type + '」', () => {
        store.undo();
        helpers.rerender();
      });
      helpers.rerender();
      return;
    }

    /* ---- 训练记录（文字） ---- */
    if (type === 'fnote-new' || type === 'fnote-edit') {
      const note = type === 'fnote-edit' ? logic.findFitnessNote(state, id) : null;
      openNoteDialog(store, helpers, note, today);
      return;
    }

    if (type === 'fnote-del') {
      const note = logic.findFitnessNote(state, id);
      if (!note) return;
      store.dispatch((s) => logic.removeFitnessNote(s, id), { undoable: true, label: '删除训练记录' });
      ui.toastUndo('已删除这条记录', () => {
        store.undo();
        helpers.rerender();
      });
      helpers.rerender();
    }
  },
};

/* ---------------- 弹窗 ---------------- */

/**
 * 记录/编辑一次训练。
 * 动作可以填多行，格式："卧推 4x12"，也接受 "卧推 4 12"。
 * 同一天再记一次会合并到当天（时长累加、动作合并）。
 */
function openWorkoutDialog(store, helpers, rec, today, presetType, state) {
  const isNew = !rec;
  const cur = rec || {
    date: today, type: presetType || '', minutes: 30, intensity: 'normal', exercises: [], note: '',
  };

  const exText = (cur.exercises || [])
    .map((e) => e.name + (e.sets ? ' ' + e.sets + 'x' + e.reps : ''))
    .join('\n');

  ui.openModal({
    title: isNew ? '记录一次训练' : '编辑训练记录',
    body:
      '<div class="field-row">' +
      '<div class="field"><label class="field-label">练什么</label>' +
      ui.select('type', cur.type || '其他', typeOptions(state, cur)) + '</div>' +
      '<div class="field"><label class="field-label">练了多久（分钟）</label>' +
      '<input class="input" type="number" min="0" data-field="minutes" value="' + (cur.minutes || 0) + '"></div>' +
      '</div>' +
      '<div class="field-row">' +
      '<div class="field"><label class="field-label">哪天</label>' +
      '<input class="input" type="date" data-field="date" value="' + ui.escapeHtml(cur.date) + '"></div>' +
      '<div class="field"><label class="field-label">强度</label>' +
      ui.select('intensity', cur.intensity, logic.FITNESS_INTENSITY_ORDER.map((k) =>
        ({ value: k, label: logic.FITNESS_INTENSITY[k] }))) + '</div>' +
      '</div>' +
      '<div class="field"><label class="field-label">动作与组数（每行一个，可选）</label>' +
      ui.textarea('exercises', exText, '例如：\n卧推 4x12\n上斜哑铃卧推 3x10', 4) + '</div>' +
      '<div class="field"><label class="field-label">备注（可选）</label>' +
      ui.textarea('note', cur.note, '状态、重量变化、注意点…', 2) + '</div>' +
      '<p class="muted small" style="margin:0">同一天再记一次会合并到当天：时长累加，同名动作合并。</p>',
    foot: '<button type="button" class="btn" data-act="close">取消</button>' +
      (isNew ? '' : '<button type="button" class="btn btn-danger" data-act="del">删除</button>') +
      '<button type="button" class="btn btn-primary" data-act="save">保存</button>',
    onMount(root) {
      const del = findByActLocal(root, 'del');
      if (del) {
        del.onclick = () => {
          ui.closeModal();
          store.dispatch((s) => logic.removeWorkout(s, cur.id), { undoable: true, label: '删除训练记录' });
          ui.toastUndo('已删除这次训练', () => {
            store.undo();
            helpers.rerender();
          });
          helpers.rerender();
        };
      }

      findByActLocal(root, 'save').onclick = () => {
        const exercises = parseExercises(ui.qs(root, '[data-field="exercises"]').value);
        const minutes = Number(ui.qs(root, '[data-field="minutes"]').value) || 0;
        if (minutes <= 0 && !exercises.length) {
          ui.toast('至少填「练了多久」或写一个动作', { type: 'warn' });
          return;
        }
        const payload = {
          date: ui.qs(root, '[data-field="date"]').value,
          type: ui.qs(root, '[data-field="type"]').value,
          minutes,
          intensity: ui.qs(root, '[data-field="intensity"]').value,
          exercises,
          note: ui.qs(root, '[data-field="note"]').value,
        };
        ui.closeModal();
        if (isNew) {
          store.dispatch((s) => logic.logWorkout(s, payload), { label: '记录训练' });
        } else {
          store.dispatch((s) => logic.updateWorkout(s, cur.id, payload), { label: '编辑训练记录' });
        }
        helpers.rerender();
      };
    },
  });
}

/** 解析"动作 组数x次数"这样的多行输入 */
export function parseExercises(text) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    // 支持 "卧推 4x12"、"卧推 4 x 12"、"卧推 4 12"、"卧推"
    const m = /^(.*?)\s*(\d+)\s*(?:[x×*]|\s)\s*(\d+)\s*$/.exec(line);
    if (m && m[1].trim()) {
      out.push({ name: m[1].trim(), sets: Number(m[2]), reps: Number(m[3]) });
    } else {
      out.push({ name: line, sets: 0, reps: 0 });
    }
  }
  return out;
}

/** 加/改训练目标 */
function openGoalDialog(store, helpers, goal, state) {
  const isNew = !goal;
  const cur = goal || { type: '', perWeek: 2 };

  ui.openModal({
    title: isNew ? '加一个训练目标' : '编辑训练目标',
    body:
      '<div class="field"><label class="field-label">练什么</label>' +
      ui.select('type', cur.type || '其他', typeOptions(state, cur)) + '</div>' +
      '<div class="field"><label class="field-label">每周几次</label>' +
      '<input class="input" type="number" min="1" max="21" data-field="perWeek" value="' +
        (cur.perWeek || 1) + '"></div>',
    foot: '<button type="button" class="btn" data-act="close">取消</button>' +
      '<button type="button" class="btn btn-primary" data-act="save">保存</button>',
    onMount(root) {
      findByActLocal(root, 'save').onclick = () => {
        const type = ui.qs(root, '[data-field="type"]').value.trim();
        if (!type) {
          ui.toast('请选择练什么', { type: 'warn' });
          return;
        }
        const payload = {
          type,
          perWeek: Number(ui.qs(root, '[data-field="perWeek"]').value) || 1,
        };
        ui.closeModal();
        if (isNew) {
          store.dispatch((s) => logic.addFitnessGoal(s, payload), { label: '加训练目标' });
        } else {
          store.dispatch((s) => logic.updateFitnessGoal(s, goal.id, payload), { label: '编辑训练目标' });
        }
        helpers.rerender();
      };
    },
  });
}

/** 加/改一条训练记录（文字） */
function openNoteDialog(store, helpers, note, today) {
  const isNew = !note;
  const cur = note || { text: '', date: today, mood: 'normal' };

  ui.openModal({
    title: isNew ? '记一条训练记录' : '编辑训练记录',
    body:
      '<div class="field"><label class="field-label">内容</label>' +
      ui.textarea('text', cur.text, '今天的状态、重量变化、注意点…', 4) + '</div>' +
      '<div class="field-row">' +
      '<div class="field"><label class="field-label">哪天</label>' +
      '<input class="input" type="date" data-field="date" value="' + ui.escapeHtml(cur.date) + '"></div>' +
      '<div class="field"><label class="field-label">身体感觉</label>' +
      ui.select('mood', cur.mood, logic.FITNESS_INTENSITY_ORDER.map((k) =>
        ({ value: k, label: logic.FITNESS_INTENSITY[k] }))) + '</div>' +
      '</div>',
    foot: '<button type="button" class="btn" data-act="close">取消</button>' +
      '<button type="button" class="btn btn-primary" data-act="save">保存</button>',
    onMount(root) {
      findByActLocal(root, 'save').onclick = () => {
        const text = ui.qs(root, '[data-field="text"]').value.trim();
        if (!text) {
          ui.toast('内容不能为空', { type: 'warn' });
          return;
        }
        const payload = {
          text,
          date: ui.qs(root, '[data-field="date"]').value,
          mood: ui.qs(root, '[data-field="mood"]').value,
        };
        ui.closeModal();
        if (isNew) {
          store.dispatch((s) => logic.addFitnessNote(s, payload), { label: '新增训练记录' });
        } else {
          store.dispatch((s) => logic.updateFitnessNote(s, note.id, payload), { label: '编辑训练记录' });
        }
        helpers.rerender();
      };
    },
  });
}

/** 在弹窗里按 data-act 找元素 */
function findByActLocal(root, act) {
  return root.querySelector('[data-act="' + act + '"]');
}
