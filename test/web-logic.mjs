/**
 * 前端测试：纯逻辑层（web/logic.js）
 * 覆盖：常量与数据结构、任务增删改查、派生统计、备忘、学习、撤销栈、首页摘要、
 * 以及"已移除模块"的数据清理。各模块的界面交互在 web-modules.mjs 里覆盖。
 */

import { test, setFile, eq, notEq, deepEq, ok, notOk, throws } from './run-frontend.mjs';
import * as date from '../web/date.js';
import * as logic from '../web/logic.js';

setFile('前端 · 纯逻辑层');

function fresh() {
  return logic.createInitialState();
}

/* ---------------- 常量与结构 ---------------- */

test('模块清单完整且含"通用"兜底', () => {
  const ids = logic.MODULE_IDS;
  for (const id of ['dev', 'study', 'fitness', 'diet', 'general']) {
    ok(ids.includes(id), '缺少模块 ' + id);
  }
  eq(logic.moduleName('dev'), '开发');
  eq(logic.moduleName('study'), '学习');
  eq(logic.moduleName('unknown-module'), '通用', '未知模块应回落到通用');
});

test('快速添加的模块列表与左侧导航一致（需求 4）', () => {
  const selectable = logic.quickAddModules();
  const ids = selectable.map((m) => m.id);

  // 导航里的"业务模块"（排除首页/今日计划/设置这三个非任务模块）
  const navModuleIds = logic.NAV_ITEMS
    .map((n) => n.id)
    .filter((id) => id !== 'home' && id !== 'today' && id !== 'settings');

  deepEq(ids, navModuleIds, '快速添加可选模块应与导航里的业务模块完全一致');

  // 不应出现"通用"这种导航里没有的选项
  notOk(ids.includes('general'), '下拉里不应出现"通用"（它不是导航入口）');

  // 名称也应与导航一致
  for (const m of selectable) {
    const nav = logic.NAV_ITEMS.find((n) => n.id === m.id);
    ok(nav, m.id + ' 应在导航里存在');
    eq(m.name, nav.name, m.id + ' 的名称应与导航一致');
  }

  // 最后一项是"通用"，它仍然可用作兜底，只是不作为选项
  ok(logic.isModuleId('general'), '"通用"仍应是合法模块 id（兜底用）');
  for (const id of ids) ok(logic.isModuleId(id), id + ' 应是合法模块 id');
});

test('已移除的模块不再出现在模块清单与导航里', () => {
  for (const gone of ['media', 'consult', 'game']) {
    eq(logic.MODULE_IDS.includes(gone), false, '模块清单里不应再有 ' + gone);
    eq(logic.NAV_ITEMS.some((n) => n.id === gone || n.id === gone + 's'), false,
      '导航里不应再有 ' + gone);
  }
  // 旧数据里的这些 module 值应被判为未知，落回"通用"
  eq(logic.moduleName('media'), '通用', '旧数据里的 media 应回落到通用');
  eq(logic.moduleName('consult'), '通用', '旧数据里的 consult 应回落到通用');
  eq(logic.moduleName('game'), '通用', '旧数据里的 game 应回落到通用');
});

test('导航是 7 个入口且顺序固定', () => {
  deepEq(logic.NAV_ITEMS.map((n) => n.id), [
    'home', 'today', 'dev', 'study', 'fitness', 'diet', 'settings',
  ]);
  for (const item of logic.NAV_ITEMS) {
    ok(item.name && item.icon, item.id + ' 应有名称与图标');
  }
});

test('初始状态字段齐全，健身周安排有 7 天', () => {
  const s = fresh();
  eq(s.schemaVersion, 1);
  for (const f of ['tasks', 'notes', 'devTasks', 'devIdeas', 'studyItems']) {
    ok(Array.isArray(s[f]), f + ' 应为数组');
  }
  // 已移除模块的字段不应出现在初始状态里
  for (const gone of ['media', 'consultTasks', 'consultRecords', 'games', 'playPlan']) {
    eq(gone in s, false, '初始状态不应再有 ' + gone + ' 字段');
  }
  eq(s.fitness.routine.length, 7, '周安排应有 7 天');
  ok(s.fitness.routine.some((d) => d.rest), '应至少有一天休息');
  ok(s.fitness.routine.some((d) => !d.rest && d.exercises.length > 0), '应有训练日且含动作');
  eq(s.settings.fitnessWeeklyGoal, 5);
  eq(s.settings.density, 'comfortable');
});

test('purgeRemovedModules 会清掉旧数据并报告清了多少', () => {
  const legacy = {
    media: [{ id: 'm1' }, { id: 'm2' }],
    consultTasks: [{ id: 'c1' }],
    consultRecords: [{ id: 'r1' }],
    games: [{ id: 'g1' }],
    playPlan: [{ id: 'p1' }],
    tasks: [
      { id: 't1', module: 'general' },
      { id: 't2', module: 'media' },
      { id: 't3', module: 'consult' },
      { id: 't4', module: 'game' },
    ],
  };
  const report = logic.purgeRemovedModules(legacy);

  eq(legacy.media, undefined, 'media 应被删除');
  eq(legacy.games, undefined, 'games 应被删除');
  eq(legacy.tasks.length, 1, '只应留下通用任务');
  eq(legacy.tasks[0].id, 't1');

  const byId = {};
  for (const r of report) byId[r.id] = r;
  eq(byId.media.count, 3, '自媒体：2 条内容 + 1 条归属自媒体的任务');
  eq(byId.consult.count, 3, '咨询：1 待办 + 1 记录 + 1 条归属咨询的任务');
  eq(byId.game.count, 3, '游戏：1 游戏 + 1 放松安排 + 1 条归属游戏的任务');

  // 干净数据不应产生报告
  deepEq(logic.purgeRemovedModules(logic.createInitialState()), [], '干净数据不应有清理报告');
});

test('健身动作的组数次数是正整数', () => {
  const s = fresh();
  for (const day of s.fitness.routine) {
    for (const e of day.exercises) {
      ok(Number.isInteger(e.sets) && e.sets > 0, e.name + ' 组数应为正整数');
      ok(Number.isInteger(e.reps) && e.reps > 0, e.name + ' 次数应为正整数');
      ok(typeof e.id === 'string' && e.id.length > 0, e.name + ' 应有 id');
    }
  }
});

test('normalizeState 能修复残缺/手改数据', () => {
  const n = logic.normalizeState({ tasks: 'bad', fitness: null, diet: 5, settings: { density: 'x' } });
  deepEq(n.tasks, []);
  eq(n.fitness.routine.length, 7, '周安排应被补齐');
  deepEq(n.diet, { meals: {}, recipes: [], shopping: [] });
  eq(n.settings.density, 'comfortable');
  eq(logic.normalizeState(null).schemaVersion, 1);
});

test('newId 生成的 id 不重复', () => {
  const seen = new Set();
  for (let i = 0; i < 3000; i++) {
    const id = logic.newId('t');
    notOk(seen.has(id), '出现重复 id：' + id);
    seen.add(id);
  }
});

/* ---------------- 任务 ---------------- */

test('新增任务会补全字段并默认今天', () => {
  const s = fresh();
  const t = logic.addTask(s, { title: '  改登录接口 bug  ' });
  eq(t.title, '改登录接口 bug', '标题应去掉首尾空格');
  eq(t.module, 'general', '未指定模块时归通用');
  eq(t.date, date.todayStr(), '未指定日期时排今天');
  eq(t.done, false);
  eq(t.priority, 'normal');
  ok(t.id && t.createdAt && t.updatedAt, '应有 id 与时间戳');
  eq(s.tasks.length, 1);
});

test('空标题不会被写入', () => {
  const s = fresh();
  eq(logic.addTask(s, { title: '   ' }), null, '纯空白标题应被拒绝');
  eq(logic.addTask(s, {}), null);
  eq(s.tasks.length, 0);
});

test('非法模块与非法日期会被纠正', () => {
  const s = fresh();
  const t = logic.addTask(s, { title: '测试', module: '不存在的模块', date: '2026-13-45' });
  eq(t.module, 'general');
  eq(t.date, date.todayStr());
});

test('updateTask 只改指定字段', () => {
  const s = fresh();
  const t = logic.addTask(s, { title: '原标题', module: 'dev', date: '2026-10-08' });
  logic.updateTask(s, t.id, { title: '新标题', priority: 'high' });
  eq(t.title, '新标题');
  eq(t.priority, 'high');
  eq(t.module, 'dev', '未指定的字段不应变');
  eq(t.date, '2026-10-08', '未指定的字段不应变');

  logic.updateTask(s, t.id, { title: '   ' });
  eq(t.title, '新标题', '空白标题不应覆盖原标题');

  logic.updateTask(s, t.id, { date: '不是日期' });
  eq(t.date, '2026-10-08', '非法日期不应生效');
});

test('toggleTask 与 removeTask', () => {
  const s = fresh();
  const t = logic.addTask(s, { title: '任务' });
  eq(t.done, false);
  logic.toggleTask(s, t.id);
  eq(t.done, true);
  logic.toggleTask(s, t.id);
  eq(t.done, false);

  const removed = logic.removeTask(s, t.id);
  eq(removed.id, t.id);
  eq(s.tasks.length, 0);
  eq(logic.removeTask(s, '不存在'), null, '删不存在的应返回 null');
});

test('改期与批量挪动', () => {
  const s = fresh();
  const a = logic.addTask(s, { title: 'A', date: '2026-10-01' });
  const b = logic.addTask(s, { title: 'B', date: '2026-10-02' });
  const c = logic.addTask(s, { title: 'C', date: '2026-10-03' });

  logic.rescheduleTask(s, a.id, '2026-10-10');
  eq(a.date, '2026-10-10');
  eq(logic.rescheduleTask(s, b.id, '坏日期'), null, '非法日期应被拒绝');

  const moved = logic.moveTasksTo(s, [b.id, c.id], '2026-10-20');
  eq(moved, 2);
  eq(b.date, '2026-10-20');
  eq(c.date, '2026-10-20');
});

test('顺延只挪没做完的', () => {
  const s = fresh();
  const a = logic.addTask(s, { title: '做完了', date: '2026-10-08', done: true });
  const b = logic.addTask(s, { title: '没做完', date: '2026-10-08' });
  const n = logic.postponeUnfinished(s, '2026-10-08', '2026-10-09');
  eq(n, 1, '只应挪 1 条');
  eq(a.date, '2026-10-08', '已完成的留在原处');
  eq(b.date, '2026-10-09');
});

/* ---------------- 查询与统计 ---------------- */

test('tasksOn 排序：未完成在前、重要在前', () => {
  const s = fresh();
  const d = '2026-10-08';
  logic.addTask(s, { title: '已完成', date: d, done: true });
  logic.addTask(s, { title: '普通', date: d });
  logic.addTask(s, { title: '重要', date: d, priority: 'high' });
  logic.addTask(s, { title: '别的日子', date: '2026-10-09' });

  const list = logic.tasksOn(s, d);
  deepEq(list.map((t) => t.title), ['重要', '普通', '已完成']);
});

test('overdueTasks 只认未完成且日期早于今天', () => {
  const s = fresh();
  const today = '2026-10-08';
  const a = logic.addTask(s, { title: '昨天没做', date: '2026-10-07' });
  const b = logic.addTask(s, { title: '昨天做完了', date: '2026-10-07', done: true });
  const c = logic.addTask(s, { title: '今天', date: today });
  const d = logic.addTask(s, { title: '前几天没做', date: '2026-10-01' });

  const overdue = logic.overdueTasks(s, today);
  deepEq(overdue.map((t) => t.title), ['前几天没做', '昨天没做'], '应按日期升序');

  eq(logic.isOverdue(a, today), true);
  eq(logic.isOverdue(b, today), false, '完成的不算逾期');
  eq(logic.isOverdue(c, today), false, '今天的不算逾期');
  eq(logic.isOverdue(d, today), true);
});

test('今日进度统计', () => {
  const s = fresh();
  const today = '2026-10-08';
  eq(logic.todayProgress(s, today).total, 0);
  eq(logic.todayProgress(s, today).percent, 0, '没有任务时进度为 0，不应除以零');

  logic.addTask(s, { title: 'A', date: today, done: true });
  logic.addTask(s, { title: 'B', date: today });
  logic.addTask(s, { title: 'C', date: today });
  logic.addTask(s, { title: 'D', date: today });
  const p = logic.todayProgress(s, today);
  eq(p.total, 4);
  eq(p.done, 1);
  eq(p.percent, 25);
});

test('各模块今日欠账数', () => {
  const s = fresh();
  const today = '2026-10-08';
  logic.addTask(s, { title: '开发1', module: 'dev', date: today });
  logic.addTask(s, { title: '开发2', module: 'dev', date: today, done: true });
  logic.addTask(s, { title: '学习1', module: 'study', date: today });
  logic.addTask(s, { title: '开发3', module: 'dev', date: '2026-10-09' });
  logic.addTask(s, { title: '逾期开发', module: 'dev', date: '2026-10-01' });

  eq(logic.modulePendingToday(s, 'dev', today), 1, '只数今天未完成的');
  eq(logic.modulePendingToday(s, 'study', today), 1);
  eq(logic.modulePendingToday(s, 'diet', today), 0);

  const byModule = logic.pendingByModule(s, today);
  eq(byModule.dev, 1);
  eq(byModule.study, 1);
  eq(byModule.fitness, 0);
  // 已移除的模块不应再出现在欠账统计里
  eq('media' in byModule, false, '不应再有 media 欠账统计');
  eq('game' in byModule, false, '不应再有 game 欠账统计');
});

test('datesWithTasks 给出有任务的日期', () => {
  const s = fresh();
  logic.addTask(s, { title: 'A', date: '2026-10-08' });
  logic.addTask(s, { title: 'B', date: '2026-10-01' });
  logic.addTask(s, { title: 'C', date: '2026-10-08' });
  deepEq(logic.datesWithTasks(s), ['2026-10-01', '2026-10-08']);
});

test('entriesInMonth 按月过滤', () => {
  const list = [
    { date: '2026-10-01' }, { date: '2026-10-31' }, { date: '2026-11-01' }, { date: '' },
  ];
  eq(logic.entriesInMonth(list, 2026, 10).length, 2);
  eq(logic.entriesInMonth(list, 2026, 11).length, 1);
  eq(logic.entriesInMonth(list, 2026, 9).length, 0);
});

/* ---------------- 快速备忘 ---------------- */

test('备忘与任务互不影响', () => {
  const s = fresh();
  const n = logic.addNote(s, '  买猫粮  ');
  eq(n.text, '买猫粮');
  eq(n.done, false);
  eq(s.notes.length, 1);
  eq(s.tasks.length, 0, '备忘不应变成任务');
  eq(logic.todayProgress(s).total, 0, '备忘不应计入今日进度');

  logic.toggleNote(s, n.id);
  eq(n.done, true);
  logic.toggleNote(s, n.id);
  eq(n.done, false);

  eq(logic.addNote(s, '   '), null, '空白备忘不写入');
});

test('便签升级为任务：便签消失、任务出现', () => {
  const s = fresh();
  const n = logic.addNote(s, '问物业水费');
  const t = logic.noteToTask(s, n.id, { module: 'general', date: '2026-10-09' });
  eq(t.title, '问物业水费');
  eq(t.module, 'general');
  eq(t.date, '2026-10-09');
  eq(s.notes.length, 0, '便签应消失');
  eq(s.tasks.length, 1);
});

/* ---------------- 撤销栈 ---------------- */

test('撤销栈：后进先出，且有上限', () => {
  const s = fresh();
  logic.addTask(s, { title: '第一条' });

  const stack = logic.createUndoStack(3);
  stack.remember(s);                                  // 快照1：1 条
  logic.addTask(s, { title: '第二条' });
  stack.remember(s);                                  // 快照2：2 条
  logic.addTask(s, { title: '第三条' });
  stack.remember(s);                                  // 快照3：3 条
  logic.addTask(s, { title: '第四条' });
  stack.remember(s);                                  // 快照4：4 条 → 挤掉快照1
  eq(stack.size(), 3, '超过上限应丢掉最早的');

  eq(stack.undo().tasks.length, 4, '第一次撤销回到加第四条之前（4 条）');
  eq(stack.size(), 2);
  eq(stack.undo().tasks.length, 3, '第二次撤销回到 3 条');
  eq(stack.undo().tasks.length, 2, '第三次撤销回到 2 条；最早那份（1 条）已被上限挤掉');
  eq(stack.canUndo(), false, '三次撤完后栈应空');
  eq(stack.undo(), null, '空了以后返回 null');
});

test('撤销快照是深拷贝，不会被后续改动污染', () => {
  const s = fresh();
  const t = logic.addTask(s, { title: '原值' });
  const stack = logic.createUndoStack(5);
  stack.remember(s);
  t.title = '被改过了';
  s.tasks.push(logic.makeTask({ title: '新加的' }));

  const back = stack.undo();
  eq(back.tasks.length, 1, '快照应是改动前的样子');
  eq(back.tasks[0].title, '原值', '快照内容不应被后续修改影响');
});

test('clear 能清空撤销栈', () => {
  const s = fresh();
  const stack = logic.createUndoStack(5);
  stack.remember(s);
  stack.remember(s);
  eq(stack.size(), 2);
  stack.clear();
  eq(stack.size(), 0);
  eq(stack.canUndo(), false);
});

/* ---------------- 学习 ---------------- */

test('学习条目：新增会补全字段并默认未开始', () => {
  const s = fresh();
  const item = logic.addStudyItem(s, { title: '  看完 JavaScript 事件循环  ' });
  eq(item.title, '看完 JavaScript 事件循环', '标题应去掉首尾空格');
  eq(item.kind, 'read', '未指定类型时默认阅读');
  eq(item.status, 'todo', '默认未开始');
  eq(item.minutes, 0, '默认时长为 0');
  ok(item.id && item.createdAt && item.updatedAt, '应有 id 与时间戳');
  eq(s.studyItems.length, 1);

  eq(logic.addStudyItem(s, { title: '   ' }), null, '空白标题应被拒绝');
  eq(s.studyItems.length, 1, '拒绝后不应写入');
});

test('学习条目：非法类型与进度会被纠正', () => {
  const s = fresh();
  const item = logic.addStudyItem(s, { title: '测试', kind: '不存在的类型', status: '乱写' });
  eq(item.kind, 'read', '非法类型应回落到阅读');
  eq(item.status, 'todo', '非法进度应回落到未开始');
});

test('学习条目：改字段与推进进度', () => {
  const s = fresh();
  const item = logic.addStudyItem(s, { title: '原题', kind: 'read' });

  logic.updateStudyItem(s, item.id, { title: '新题', kind: 'course', minutes: 45, source: '某课程' });
  eq(item.title, '新题');
  eq(item.kind, 'course');
  eq(item.minutes, 45);
  eq(item.source, '某课程');

  logic.updateStudyItem(s, item.id, { title: '   ' });
  eq(item.title, '新题', '空白标题不应覆盖原标题');
  logic.updateStudyItem(s, item.id, { status: '不存在' });
  eq(item.status, 'todo', '非法进度不应生效');
  logic.updateStudyItem(s, item.id, { minutes: -10 });
  eq(item.minutes, 0, '负数时长应归零');

  // 进度循环：未开始 → 学习中 → 已学完 → 未开始
  eq(logic.advanceStudyItem(s, item.id).status, 'doing');
  eq(logic.advanceStudyItem(s, item.id).status, 'done');
  eq(logic.advanceStudyItem(s, item.id).status, 'todo', '三档应循环');
});

test('学习条目：统计累计时长与已学完数量', () => {
  const s = fresh();
  eq(logic.studyMinutesTotal(s), 0, '没有条目时为 0');
  eq(logic.studyDoneCount(s), 0);

  logic.addStudyItem(s, { title: 'A', minutes: 30 });
  logic.addStudyItem(s, { title: 'B', minutes: 45, status: 'done' });
  logic.addStudyItem(s, { title: 'C' });

  eq(logic.studyMinutesTotal(s), 75, '累计时长应相加');
  eq(logic.studyDoneCount(s), 1, '只数已学完的');
});

test('学习条目：可推送到今日计划', () => {
  const s = fresh();
  const item = logic.addStudyItem(s, { title: '看完事件循环' });
  const task = logic.pushStudyToToday(s, item.id, '2026-10-09');
  eq(task.title, '看完事件循环');
  eq(task.module, 'study', '应归属学习模块');
  eq(task.date, '2026-10-09');
});

test('学习条目：可删除', () => {
  const s = fresh();
  const item = logic.addStudyItem(s, { title: '待删' });
  const removed = logic.removeStudyItem(s, item.id);
  eq(removed.id, item.id);
  eq(s.studyItems.length, 0);
  eq(logic.removeStudyItem(s, '不存在'), null);

  // 学习任务会正常出现在今日计划里
  const s2 = fresh();
  const it = logic.addStudyItem(s2, { title: '学点东西' });
  logic.pushStudyToToday(s2, it.id, '2026-10-08');
  const onDay = logic.tasksOn(s2, '2026-10-08');
  eq(onDay.length, 1, '学习任务应计入当天任务');
  eq(onDay[0].module, 'study');
});

/* ---------------- 日历聚合 ---------------- */

test('日历聚合：按模块与月份分组当天任务，含完成数', () => {
  const s = fresh();
  const d1 = '2026-10-08';
  const d2 = '2026-10-09';
  logic.addTask(s, { title: 'A', module: 'dev', date: d1 });
  logic.addTask(s, { title: 'B', module: 'dev', date: d1, done: true });
  logic.addTask(s, { title: 'C', module: 'dev', date: d2 });
  logic.addTask(s, { title: 'D', module: 'study', date: d1 });
  logic.addTask(s, { title: 'E', module: 'dev', date: '2026-11-01' }); // 别的月

  const devMarks = logic.calendarMarks(s, 'dev', 2026, 10);
  eq(Object.keys(devMarks).length, 2, '只应统计本模块本月的两天');
  eq(devMarks[d1].total, 2, '10-08 应有 2 条');
  eq(devMarks[d1].done, 1, '其中 1 条已完成');
  eq(devMarks[d2].total, 1, '10-09 应有 1 条');
  eq(devMarks['2026-11-01'], undefined, '别的月份不应出现');

  const studyMarks = logic.calendarMarks(s, 'study', 2026, 10);
  eq(studyMarks[d1].total, 1, '学习模块只应看到自己的任务');
  eq(Object.keys(studyMarks).length, 1);

  const allMarks = logic.calendarMarks(s, 'all', 2026, 10);
  eq(allMarks[d1].total, 3, '首页汇总应含所有模块');
  eq(allMarks[d1].extra, '2 个模块', '应标出当天的模块种类数');
});

test('日历聚合：健身标记显示是否已练', () => {
  const s = fresh();
  const d = '2026-10-08';
  logic.addTask(s, { title: '训练', module: 'fitness', date: d });
  logic.finishFitnessDay(s, d);
  logic.finishFitnessDay(s, '2026-10-09');

  const marks = logic.calendarMarks(s, 'fitness', 2026, 10);
  eq(marks[d].extra, '已练', '已打卡的日子应标"已练"');
  eq(marks[d].total, 1, '当天任务数也应统计');
  eq(marks['2026-10-09'].extra, '已练', '只有打卡记录的日子也要标出来');
  eq(marks['2026-10-09'].total, 0, '没有任务时任务数为 0');
});

test('日历聚合：饮食标记显示三餐定了多少', () => {
  const s = fresh();
  const d = '2026-10-08';
  logic.setMeal(s, d, 'breakfast', { text: '燕麦' });
  logic.setMeal(s, d, 'lunch', { text: '鸡胸' });
  logic.setMeal(s, '2026-10-09', 'dinner', { text: '番茄牛腩' });

  const marks = logic.calendarMarks(s, 'diet', 2026, 10);
  eq(marks[d].extra, '三餐已定 2/3', '应标出定了几餐');
  eq(marks['2026-10-09'].extra, '三餐已定 1/3');
});

test('日历聚合：空数据返回空对象，天数统计正确', () => {
  const s = fresh();
  deepEq(logic.calendarMarks(s, 'dev', 2026, 10), {}, '没有内容时应是空对象');
  eq(logic.calendarDayCount(s, 'dev', 2026, 10), 0, '有内容的天数应为 0');

  logic.addTask(s, { title: 'A', module: 'dev', date: '2026-10-08' });
  logic.addTask(s, { title: 'B', module: 'dev', date: '2026-10-20' });
  logic.addTask(s, { title: 'C', module: 'dev', date: '2026-10-20' });
  eq(logic.calendarDayCount(s, 'dev', 2026, 10), 2, '应按"天"计数而不是按条数');
});

test('日历聚合：模块标签中文名正确', () => {
  eq(logic.moduleLabel('dev'), '开发工作');
  eq(logic.moduleLabel('study'), '学习');
  eq(logic.moduleLabel('fitness'), '健身计划');
  eq(logic.moduleLabel('diet'), '饮食计划');
  eq(logic.moduleLabel('unknown'), '通用');
});

/* ---------------- 图表聚合 ---------------- */

test('图表时间范围：本周/本月/今年/全部的起止边界', () => {
  // 2026-10-08 是周四，本周应为 10-05(一) ~ 10-11(日)
  const w = logic.rangeBounds('week', '2026-10-08');
  eq(w.from, '2026-10-05', '本周应从周一开始');
  eq(w.to, '2026-10-11', '本周应到周日结束');

  const m = logic.rangeBounds('month', '2026-10-08');
  eq(m.from, '2026-10-01', '本月应从 1 号开始');
  eq(m.to, '2026-10-31', '本月应到 31 号结束（10 月有 31 天）');

  const feb = logic.rangeBounds('month', '2026-02-10');
  eq(feb.to, '2026-02-28', '2026 年 2 月应到 28 号');

  const y = logic.rangeBounds('year', '2026-10-08');
  eq(y.from, '2026-01-01', '今年应从 1 月 1 日');
  eq(y.to, '2026-12-31', '今年应到 12 月 31 日');

  const all = logic.rangeBounds('all', '2026-10-08');
  eq(all.from, '', '全部不应有起点限制');
  eq(all.to, null, '全部不应有终点限制');
  eq(all.label, '全部');

  deepEq(logic.RANGE_KEYS, ['week', 'month', 'year', 'all'], '时间范围选项应固定');
});

test('图表：柱形图按天分桶（本周固定 7 天）', () => {
  const s = fresh();
  logic.addTask(s, { title: 'A', module: 'dev', date: '2026-10-05' });
  logic.addTask(s, { title: 'B', module: 'dev', date: '2026-10-05', done: true });
  logic.addTask(s, { title: 'C', module: 'dev', date: '2026-10-08' });
  logic.addTask(s, { title: 'D', module: 'dev', date: '2026-10-20' }); // 下周，不该出现

  const buckets = logic.chartBuckets(s, 'dev', 'week', '2026-10-08');
  eq(buckets.length, 7, '本周应固定 7 个柱子');
  eq(buckets[0].key, '2026-10-05', '第一个是周一');
  eq(buckets[0].total, 2, '周一应有 2 条');
  eq(buckets[0].done, 1, '周一完成 1 条');
  eq(buckets[3].total, 1, '周四应有 1 条');
  eq(buckets[6].key, '2026-10-11', '最后一个是周日');
  eq(buckets.reduce((n, b) => n + b.total, 0), 3, '下周的任务不应计入');
});

test('图表：柱形图按月分桶时覆盖整月每一天', () => {
  const s = fresh();
  logic.addTask(s, { title: 'A', module: 'dev', date: '2026-10-31' });
  const buckets = logic.chartBuckets(s, 'dev', 'month', '2026-10-08');
  eq(buckets.length, 31, '10 月应有 31 个柱子');
  eq(buckets[30].key, '2026-10-31', '最后一个应是 31 号');
  eq(buckets[30].total, 1);
  eq(buckets[0].total, 0, '没有任务的日子也要显示（为 0）');
});

test('图表：今年/全部按月分桶，只列出有数据的月份', () => {
  const s = fresh();
  logic.addTask(s, { title: 'A', module: 'dev', date: '2026-03-05' });
  logic.addTask(s, { title: 'B', module: 'dev', date: '2026-03-20', done: true });
  logic.addTask(s, { title: 'C', module: 'dev', date: '2026-10-01' });
  logic.addTask(s, { title: 'D', module: 'dev', date: '2025-12-31' }); // 去年

  const year = logic.chartBuckets(s, 'dev', 'year', '2026-10-08');
  deepEq(year.map((b) => b.key), ['2026-03', '2026-10'], '今年只应出现有数据的月份');
  eq(year[0].label, '3月');
  eq(year[0].total, 2);
  eq(year[0].done, 1);
  eq(year.reduce((n, b) => n + b.total, 0), 3, '去年的不应计入今年');

  const all = logic.chartBuckets(s, 'dev', 'all', '2026-10-08');
  deepEq(all.map((b) => b.key), ['2025-12', '2026-03', '2026-10'], '全部应含去年，且按时间排序');
});

test('图表：模块页扇形图是"完成 / 未完成"，首页扇形图按模块分布', () => {
  const s = fresh();
  logic.addTask(s, { title: 'A', module: 'dev', date: '2026-10-08' });
  logic.addTask(s, { title: 'B', module: 'dev', date: '2026-10-08', done: true });
  logic.addTask(s, { title: 'C', module: 'study', date: '2026-10-08' });
  logic.addTask(s, { title: 'D', module: 'fitness', date: '2026-10-08' });

  const devPie = logic.chartSlices(s, 'dev', 'week', '2026-10-08');
  const byKey = {};
  for (const x of devPie) byKey[x.key] = x.value;
  eq(byKey.done, 1, '开发页应显示已完成 1');
  eq(byKey.pending, 1, '开发页应显示未完成 1');
  eq(devPie.length, 2, '模块页扇形图应只有两块');

  const allPie = logic.chartSlices(s, 'all', 'week', '2026-10-08');
  const modKeys = allPie.map((x) => x.key).sort();
  deepEq(modKeys, ['dev', 'fitness', 'study'], '首页扇形图应按模块分布');
  const devSlice = allPie.find((x) => x.key === 'dev');
  eq(devSlice.label, '开发工作', '扇区应带中文模块名');
  eq(devSlice.value, 2, '开发应有 2 条');
  ok(devSlice.color, '扇区应有颜色');

  // 没有数据时返回空数组
  const empty = fresh();
  deepEq(logic.chartSlices(empty, 'dev', 'week', '2026-10-08'), [], '没有数据时扇形图为空');
});

test('图表：统计摘要给出总数/已完成/完成率', () => {
  const s = fresh();
  logic.addTask(s, { title: 'A', module: 'dev', date: '2026-10-08' });
  logic.addTask(s, { title: 'B', module: 'dev', date: '2026-10-08', done: true });
  logic.addTask(s, { title: 'C', module: 'dev', date: '2026-10-08', done: true });
  logic.addTask(s, { title: 'D', module: 'dev', date: '2026-10-09' });

  const sum = logic.chartSummary(s, 'dev', 'week', '2026-10-08');
  eq(sum.total, 4);
  eq(sum.done, 2);
  eq(sum.pending, 2);
  eq(sum.percent, 50, '完成率应四舍五入到整数百分比');

  const empty = fresh();
  const s0 = logic.chartSummary(empty, 'dev', 'week', '2026-10-08');
  eq(s0.percent, 0, '没有任务时完成率应为 0 而不是 NaN');
});

test('图表：点某根柱子能拿到那一段的具体任务', () => {
  const s = fresh();
  logic.addTask(s, { title: '周一的事', module: 'dev', date: '2026-10-05' });
  logic.addTask(s, { title: '周四的事', module: 'dev', date: '2026-10-08' });
  logic.addTask(s, { title: '学习的事', module: 'study', date: '2026-10-05' });

  const day = logic.chartDetailTasks(s, 'dev', 'week', '2026-10-08', '2026-10-05');
  eq(day.length, 1, '点周一应只看到开发模块那天的 1 条');
  eq(day[0].title, '周一的事');

  const month = logic.chartDetailTasks(s, 'dev', 'week', '2026-10-08', '2026-10');
  eq(month.length, 2, '按月份 key 查时应汇总整月');

  const none = logic.chartDetailTasks(s, 'dev', 'week', '2026-10-08', null);
  eq(none.length, 2, '不传 key 时应返回整个范围');

  const allModules = logic.chartDetailTasks(s, 'all', 'week', '2026-10-08', '2026-10-05');
  eq(allModules.length, 2, '首页汇总应含所有模块');
});

test('图表：扇形图扇区的 key 也能筛明细（完成/未完成/模块）', () => {
  const s = fresh();
  logic.addTask(s, { title: 'A 做完了', module: 'dev', date: '2026-10-08', done: true });
  logic.addTask(s, { title: 'B 还没做', module: 'dev', date: '2026-10-08' });
  logic.addTask(s, { title: 'C 学习', module: 'study', date: '2026-10-08' });

  const done = logic.chartDetailTasks(s, 'dev', 'week', '2026-10-08', 'done');
  deepEq(done.map((t) => t.title), ['A 做完了'], 'key=done 应只留已完成');

  const pending = logic.chartDetailTasks(s, 'dev', 'week', '2026-10-08', 'pending');
  deepEq(pending.map((t) => t.title), ['B 还没做'], 'key=pending 应只留未完成');

  const byModule = logic.chartDetailTasks(s, 'all', 'week', '2026-10-08', 'study');
  deepEq(byModule.map((t) => t.title), ['C 学习'], 'key=模块 id 应只留该模块');

  // 非法 key 退回整个范围，不返回空
  const bogus = logic.chartDetailTasks(s, 'all', 'week', '2026-10-08', '不存在的键');
  eq(bogus.length, 3, '无法识别的 key 应退回整个范围');
});

/* ---------------- 首页摘要 ---------------- */

test('dataAttrs 不会把 data- 前缀重复叠加（回归：曾生成 data-data-ex 导致按钮失效）', async () => {
  const ui = await import('../web/ui.js');
  const html = ui.iconBtn('✓', { act: 'x', 'data-ex': 'e_1' }, '提示');
  ok(html.includes('data-ex="e_1"'), '应保留 data-ex：' + html);
  notOk(html.includes('data-data-ex'), '不应生成 data-data-ex：' + html);

  // 普通键仍然自动加前缀
  const html2 = ui.iconBtn('✓', { act: 'y', id: 'z' }, '提示');
  ok(html2.includes('data-act="y"'), '普通键应加 data- 前缀');
  ok(html2.includes('data-id="z"'), '普通键应加 data- 前缀');
});

test('首页摘要：无内容时返回空数组', () => {
  const s = fresh();
  const today = date.todayStr();
  // 逐项满足摘要触发条件：三餐已定 + 本周（周一到今天）每天都打卡 + 目标设为已过天数
  for (const key of ['breakfast', 'lunch', 'dinner']) {
    logic.setMeal(s, today, key, { text: '已安排' });
  }
  const todayIdx = date.weekdayNum(today) - 1;
  const week = date.weekDates(today);
  logic.setWeeklyGoal(s, todayIdx + 1);
  for (let i = 0; i <= todayIdx; i++) {
    logic.finishFitnessDay(s, week[i]);
  }

  const sum = logic.homeSummary(s, today);
  deepEq(sum, [], '没有任何待处理事项时应返回空数组（整个区块隐藏）');
});

test('首页摘要：晚餐未定时会提醒', () => {
  const s = fresh();
  const today = date.todayStr();
  const sum = logic.homeSummary(s, today);
  ok(sum.some((x) => x.key === 'dinner'), '晚饭没定时应出现在摘要里');

  logic.setMeal(s, today, 'dinner', { text: '番茄牛腩' });
  const after = logic.homeSummary(s, today);
  eq(after.some((x) => x.key === 'dinner'), false, '定了晚饭就不该再提醒');
});

test('首页摘要：健身未达标会提醒，达标后消失', () => {
  const s = fresh();
  const today = date.todayStr();
  const todayIdx = date.weekdayNum(today) - 1;
  const week = date.weekDates(today);

  logic.setWeeklyGoal(s, todayIdx + 1); // 目标 = 本周已过的天数
  for (let i = 0; i <= todayIdx; i++) logic.finishFitnessDay(s, week[i]);

  const sum = logic.homeSummary(s, today);
  eq(sum.some((x) => x.key === 'fitness-week'), false, '已达标就不该再提醒');
  eq(logic.fitnessWeekDoneCount(s, today), todayIdx + 1, '本周打卡天数应等于已过天数');
});

test('首页摘要：灵感箱达到 3 条才提醒', () => {
  const s = fresh();
  const today = date.todayStr();
  logic.addDevIdea(s, '灵感一');
  logic.addDevIdea(s, '灵感二');
  eq(logic.homeSummary(s, today).some((x) => x.key === 'dev-ideas'), false, '2 条不该提醒');

  logic.addDevIdea(s, '灵感三');
  const sum = logic.homeSummary(s, today);
  const item = sum.find((x) => x.key === 'dev-ideas');
  ok(item, '3 条应提醒');
  eq(item.route, 'dev', '应能跳到开发工作');
});

test('首页摘要：逾期优先且最多 5 条', () => {
  const s = fresh();
  const today = '2026-10-08';
  logic.addTask(s, { title: '逾期', date: '2026-10-01' });
  logic.addTask(s, { title: '今天的学习', module: 'study', date: today });

  const sum = logic.homeSummary(s, today);
  ok(sum.length > 0, '应有摘要');
  eq(sum[0].key, 'overdue', '逾期应排在最前');
  ok(sum.length <= 5, '最多 5 条');
  for (const item of sum) {
    ok(item.text && item.route, item.key + ' 应有文字与跳转目标');
    // 摘要跳转目标必须是真实存在的路由
    ok(logic.NAV_ITEMS.some((n) => n.id === item.route), '跳转目标应是导航里的入口：' + item.route);
  }
});

test('首页摘要：不再引用已移除的模块', () => {
  const s = fresh();
  const today = '2026-10-08';
  const sum = logic.homeSummary(s, today);
  for (const item of sum) {
    for (const gone of ['media', 'consult', 'games', 'game']) {
      notEq(item.route, gone, '摘要不应再指向已移除的 ' + gone);
    }
  }
});
