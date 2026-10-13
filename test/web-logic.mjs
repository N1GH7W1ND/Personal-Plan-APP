/**
 * 前端测试：纯逻辑层（web/logic.js）
 * 阶段 3 关注骨架相关部分：常量、数据结构、任务增删改查、派生统计、撤销栈。
 * 各模块专属规则（自媒体/健身/饮食…）在阶段 5 的测试里覆盖。
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
  for (const id of ['media', 'dev', 'consult', 'fitness', 'diet', 'game', 'general']) {
    ok(ids.includes(id), '缺少模块 ' + id);
  }
  eq(logic.moduleName('media'), '自媒体');
  eq(logic.moduleName('game'), '游戏');
  eq(logic.moduleName('unknown-module'), '通用', '未知模块应回落到通用');
});

test('导航是 9 个入口且顺序固定', () => {
  deepEq(logic.NAV_ITEMS.map((n) => n.id), [
    'home', 'today', 'media', 'dev', 'consult', 'fitness', 'diet', 'games', 'settings',
  ]);
  for (const item of logic.NAV_ITEMS) {
    ok(item.name && item.icon, item.id + ' 应有名称与图标');
  }
});

test('初始状态字段齐全，健身周安排有 7 天', () => {
  const s = fresh();
  eq(s.schemaVersion, 1);
  for (const f of ['tasks', 'notes', 'media', 'devTasks', 'devIdeas', 'consultTasks', 'consultRecords', 'games', 'playPlan']) {
    ok(Array.isArray(s[f]), f + ' 应为数组');
  }
  eq(s.fitness.routine.length, 7, '周安排应有 7 天');
  ok(s.fitness.routine.some((d) => d.rest), '应至少有一天休息');
  ok(s.fitness.routine.some((d) => !d.rest && d.exercises.length > 0), '应有训练日且含动作');
  eq(s.settings.fitnessWeeklyGoal, 5);
  eq(s.settings.density, 'comfortable');
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
  logic.addTask(s, { title: '自媒体1', module: 'media', date: today });
  logic.addTask(s, { title: '开发3', module: 'dev', date: '2026-10-09' });
  logic.addTask(s, { title: '逾期开发', module: 'dev', date: '2026-10-01' });

  eq(logic.modulePendingToday(s, 'dev', today), 1, '只数今天未完成的');
  eq(logic.modulePendingToday(s, 'media', today), 1);
  eq(logic.modulePendingToday(s, 'diet', today), 0);

  const byModule = logic.pendingByModule(s, today);
  eq(byModule.dev, 1);
  eq(byModule.media, 1);
  eq(byModule.game, 0);
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

/* ---------------- 首页摘要 ---------------- */

test('moveMedia 只移动一档，越界返回 null（回归：曾出现一次点击跳两档）', () => {
  const s = fresh();
  const m = logic.addMedia(s, { title: '回归测试' });
  eq(m.status, 'idea', '默认落在选题池');

  // 每次调用只前进一档
  const steps = [];
  for (let i = 0; i < 3; i++) {
    const r = logic.moveMedia(s, m.id, 1);
    steps.push(r ? r.status : null);
  }
  deepEq(steps, ['writing', 'ready', 'published'], '应逐档前进，不能跳档');

  // 已到最后一档：再前进应被拒绝
  eq(logic.moveMedia(s, m.id, 1), null, '最后一档不应再前进');
  eq(logic.findMedia(s, m.id).status, 'published', '状态不应被越界调用改变');

  // 往回也一样
  eq(logic.moveMedia(s, m.id, -1).status, 'ready', '应能后退一档');
  logic.updateMedia(s, m.id, { status: 'idea' });
  eq(logic.moveMedia(s, m.id, -1), null, '第一档不应再后退');
});

test('moveMedia 累计调用次数可观测（用于排查重复执行）', () => {
  const s = fresh();
  const m = logic.addMedia(s, { title: '计数' });
  const before = logic.callStats.moveMedia;
  logic.moveMedia(s, m.id, 1);
  eq(logic.callStats.moveMedia, before + 1, '调用一次应只累加一次');
});

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
  logic.addMedia(s, { title: '待发布稿子', status: 'ready' });

  const sum = logic.homeSummary(s, today);
  ok(sum.length > 0, '应有摘要');
  eq(sum[0].key, 'overdue', '逾期应排在最前');
  ok(sum.length <= 5, '最多 5 条');
  for (const item of sum) {
    ok(item.text && item.route, item.key + ' 应有文字与跳转目标');
  }
});
