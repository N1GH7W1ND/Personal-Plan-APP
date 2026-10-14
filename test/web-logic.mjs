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
  for (const id of ['dev', 'study', 'reading', 'diet', 'fitness', 'general']) {
    ok(ids.includes(id), '缺少模块 ' + id);
  }
  eq(logic.moduleName('dev'), '开发');
  eq(logic.moduleName('study'), '学习');
  eq(logic.moduleName('reading'), '阅读');
  eq(logic.moduleName('fitness'), '健身');
  eq(logic.moduleName('unknown-module'), '通用', '未知模块应回落到通用');
});

test('快速添加的模块列表与左侧导航里的业务模块一致（需求 4）', () => {
  const selectable = logic.quickAddModules();
  const ids = selectable.map((m) => m.id);

  // 导航里的"业务模块"：直接取 logic 导出的那份事实，不在测试里靠排除硬编码
  const navModuleIds = logic.NAV_MODULE_IDS;

  deepEq(ids, navModuleIds, '快速添加可选模块应与导航里的业务模块完全一致');

  // 不应出现"通用"这种导航里没有的选项
  notOk(ids.includes('general'), '下拉里不应出现"通用"（它不是导航入口）');

  // 非任务模块的导航入口不该混进来
  for (const id of ['home', 'today', 'settings']) {
    notOk(ids.includes(id), '下拉里不该出现 ' + id + '（它不是任务归属模块）');
  }

  // 这个集合必须真的由"导航 ∩ 模块"得出，而不是手写的
  const expected = logic.NAV_ITEMS
    .map((n) => n.id)
    .filter((id) => logic.MODULE_IDS.includes(id) && id !== 'general');
  deepEq(navModuleIds, expected, 'NAV_MODULE_IDS 应由导航与模块求交得出');

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

test('已移除的模块不再出现在模块清单与导航里（健身已加回，不在此列）', () => {
  for (const gone of ['media', 'consult', 'game']) {
    eq(logic.MODULE_IDS.includes(gone), false, '模块清单里不应再有 ' + gone);
    eq(logic.NAV_ITEMS.some((n) => n.id === gone || n.id === gone + 's'), false,
      '导航里不应再有 ' + gone);
  }
  // 旧数据里的这些 module 值应被判为未知，落回"通用"
  eq(logic.moduleName('media'), '通用', '旧数据里的 media 应回落到通用');
  eq(logic.moduleName('consult'), '通用', '旧数据里的 consult 应回落到通用');
  eq(logic.moduleName('game'), '通用', '旧数据里的 game 应回落到通用');

  /*
   * 健身是加回来的模块，必须在清单与导航里。
   * （之前这里是反向断言"fitness 应回落到通用"，模块回来后已反转。）
   */
  ok(logic.MODULE_IDS.includes('fitness'), '模块清单里应重新有 fitness');
  eq(logic.moduleName('fitness'), '健身', '健身应有自己的中文名');
  eq(logic.NAV_ITEMS.some((n) => n.id === 'fitness'), true, '导航里应有健身入口');
});

test('导航是 8 个入口且顺序固定', () => {
  deepEq(logic.NAV_ITEMS.map((n) => n.id), [
    'home', 'today', 'dev', 'study', 'reading', 'diet', 'fitness', 'settings',
  ]);
  for (const item of logic.NAV_ITEMS) {
    ok(item.name && item.icon, item.id + ' 应有名称与图标');
  }
});

test('初始状态字段齐全，且不含已移除模块', () => {
  const s = fresh();
  eq(s.schemaVersion, 1);
  for (const f of ['tasks', 'notes', 'devTasks', 'devIdeas', 'studyItems']) {
    ok(Array.isArray(s[f]), f + ' 应为数组');
  }
  // 仍然移除的模块字段不该出现
  for (const gone of ['media', 'consultTasks', 'consultRecords', 'games', 'playPlan']) {
    eq(gone in s, false, '初始状态不应再有 ' + gone + ' 字段');
  }
  // 健身已加回：结构应与阅读同构（日志 + 目标 + 记录）
  deepEq(s.fitness, { log: [], goals: [], notes: [] }, '健身应有 log/goals/notes 三段结构');
  eq(s.settings.fitnessWeeklyGoal, 3, '设置里应有每周健身目标');
  deepEq(s.diet, { meals: {}, recipes: [], shopping: [] }, 'diet 结构');
  eq(s.settings.density, 'comfortable');
});

test('purgeRemovedModules 会清掉旧数据并报告清了多少', () => {
  const legacy = {
    media: [{ id: 'm1' }, { id: 'm2' }],
    consultTasks: [{ id: 'c1' }],
    consultRecords: [{ id: 'r1' }],
    games: [{ id: 'g1' }],
    playPlan: [{ id: 'p1' }],
    fitness: {
      routine: [{ label: '胸 + 三头' }],
      records: { '2026-10-08': { finished: true } },
    },
    tasks: [
      { id: 't1', module: 'general' },
      { id: 't2', module: 'media' },
      { id: 't3', module: 'consult' },
      { id: 't4', module: 'game' },
      { id: 't5', module: 'fitness' },
    ],
  };
  const report = logic.purgeRemovedModules(legacy);

  eq(legacy.media, undefined, 'media 应被删除');
  eq(legacy.games, undefined, 'games 应被删除');
  /*
   * 健身已加回来：purgeRemovedModules **不该**再动它。
   * 这条是回归——如果把 fitness 留在移除清单里，
   * 用户新记的健身数据每次读取都会被删掉。
   */
  ok(legacy.fitness, 'fitness 不该被 purgeRemovedModules 删除');
  eq(legacy.tasks.length, 2, '只应留下通用任务与健身任务');
  eq(legacy.tasks[0].id, 't1');
  ok(legacy.tasks.some((x) => x.id === 't5'), '归属健身的任务也应保留');

  const byId = {};
  for (const r of report) byId[r.id] = r;
  eq(byId.media.count, 3, '自媒体：2 条内容 + 1 条归属自媒体的任务');
  eq(byId.consult.count, 3, '咨询：1 待办 + 1 记录 + 1 条归属咨询的任务');
  eq(byId.game.count, 3, '游戏：1 游戏 + 1 放松安排 + 1 条归属游戏的任务');
  // 健身不在移除清单里，因此不该出现在清理报告里
  eq(byId.fitness, undefined, '健身不该出现在清理报告里（它已不是被移除的模块）');

  // 干净数据不应产生报告
  deepEq(logic.purgeRemovedModules(logic.createInitialState()), [], '干净数据不应有清理报告');
});

test('normalizeState 能修复残缺/手改数据', () => {
  const n = logic.normalizeState({ tasks: 'bad', fitness: null, diet: 5, settings: { density: 'x' } });
  deepEq(n.tasks, []);
  // 健身已加回来：手改成 null 也应被修成合法结构，而不是丢掉
  deepEq(n.fitness, { log: [], goals: [], notes: [] }, 'fitness 被写坏时应修成合法结构');
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
  // 新增任务的默认优先级是「重要且紧急」（按本人要求）
  eq(t.priority, 'urgentImportant', '新增时没选优先级应默认"重要且紧急"');
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
  logic.updateTask(s, t.id, { title: '新标题', priority: 'urgentImportant' });
  eq(t.title, '新标题');
  eq(t.priority, 'urgentImportant', '四档之一应原样保留');
  eq(t.module, 'dev', '未指定的字段不应变');
  eq(t.date, '2026-10-08', '未指定的字段不应变');

  // 旧的 'high' 进来会被迁移成 'important'（见"优先级"那组用例）
  logic.updateTask(s, t.id, { priority: 'high' });
  eq(t.priority, 'important', '旧档位应迁移，而不是原样写进去');

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

test('tasksOn 排序：未完成在前，再按优先级四档', () => {
  const s = fresh();
  const d = '2026-10-08';
  logic.addTask(s, { title: '已完成', date: d, done: true });
  /*
   * 注意：新增任务的默认档现在是「重要且紧急」，
   * 所以"想要最低档"必须显式指定，不能靠不填。
   */
  logic.addTask(s, { title: '最低档', date: d, priority: 'normal' });
  logic.addTask(s, { title: '旧的普通', date: d, priority: 'high' });
  logic.addTask(s, { title: '别的日子', date: '2026-10-09' });

  const list = logic.tasksOn(s, d);
  deepEq(list.map((t) => t.title), ['旧的普通', '最低档', '已完成'],
    '未完成在前；旧的"重要"迁移成"重要不紧急"，仍排在最低档之前');
});

test('tasksOn 排序：新增的默认档（重要且紧急）排在最前', () => {
  const s = fresh();
  const d = '2026-10-08';
  logic.addTask(s, { title: '不填（默认档）', date: d });
  logic.addTask(s, { title: '显式最低', date: d, priority: 'normal' });
  logic.addTask(s, { title: '重要不紧急', date: d, priority: 'important' });

  deepEq(logic.tasksOn(s, d).map((t) => t.title),
    ['不填（默认档）', '重要不紧急', '显式最低'],
    '默认档就是"重要且紧急"，应排在最前');
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
  // 健身也在统计里（模块加回后，它和别的模块一样有欠账口径）
  ok('fitness' in byModule, '各模块欠账里应包含健身');
  eq(byModule.fitness, 0, '没有健身任务时应为 0');
  eq(byModule.study, 1);
  eq(byModule.diet, 0);
  // 已移除的模块不应再出现在欠账统计里（健身已加回，因此不在此列）
  for (const gone of ['media', 'game', 'consult']) {
    eq(gone in byModule, false, '不应再有 ' + gone + ' 欠账统计');
  }
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

/* ---------------- 阅读 ---------------- */

test('阅读：加书会补全字段并默认想读', () => {
  const s = fresh();
  const book = logic.addBook(s, { title: '  置身事内  ', author: ' 兰小欢 ', totalPages: '320' });
  eq(book.title, '置身事内', '书名应去掉首尾空格');
  eq(book.author, '兰小欢');
  eq(book.kind, 'book', '默认是纸书');
  eq(book.status, 'want', '默认想读');
  eq(book.totalPages, 320, '字符串页数应转成数字');
  eq(book.currentPage, 0);
  eq(book.rating, 0);
  ok(book.id && book.createdAt, '应有 id 与创建时间');
  eq(s.books.length, 1);

  eq(logic.addBook(s, { title: '   ' }), null, '空书名应被拒绝');
  eq(logic.addBook(s, ''), null, '空字符串应被拒绝');
  eq(s.books.length, 1, '拒绝后不应写入');
});

test('阅读：非法分类与状态会被纠正，页码不会超过总页数', () => {
  const s = fresh();
  const b = logic.addBook(s, { title: '测试', kind: '乱写', status: '瞎写' });
  eq(b.kind, 'book', '非法形式应回落到纸书');
  eq(b.status, 'want', '非法状态应回落到想读');

  // 已读到超过总页数应被夹住
  const b2 = logic.addBook(s, { title: 'A', totalPages: 100, currentPage: 999 });
  eq(b2.currentPage, 100, '已读页数不应超过总页数');
});

test('阅读：有进度自动转"在读"，读到最后一页自动"已读完"', () => {
  const s = fresh();
  const b = logic.addBook(s, { title: 'A', totalPages: 200 });
  eq(b.status, 'want');

  logic.updateBook(s, b.id, { currentPage: 20 });
  eq(b.status, 'reading', '有进度后应自动变成在读');
  eq(b.startedAt, date.todayStr(), '应记下开始日期');

  logic.updateBook(s, b.id, { currentPage: 200 });
  eq(b.status, 'finished', '读到最后一页应自动标为已读完');
  eq(b.finishedAt, date.todayStr(), '应记下完成日期');

  // 手动标为已读完时页数应补满
  const s2 = fresh();
  const b2 = logic.addBook(s2, { title: 'B', totalPages: 50 });
  logic.updateBook(s2, b2.id, { status: 'finished' });
  eq(b2.currentPage, 50, '手动标已读完应把页码补满');

  // 没填总页数时不应误判为读完
  const s3 = fresh();
  const b3 = logic.addBook(s3, { title: 'C' });
  logic.updateBook(s3, b3.id, { currentPage: 30 });
  eq(b3.status, 'reading', '没填总页数时只应变成在读，不能判成读完');
});

test('阅读：进度百分比与剩余页数计算正确，也处理边界', () => {
  const s = fresh();
  const b = logic.addBook(s, { title: 'A', totalPages: 200, currentPage: 50 });
  eq(logic.bookProgress(b), 25, '50/200 应为 25%');
  eq(logic.bookPagesLeft(b), 150);

  eq(logic.bookProgress({ currentPage: 10, totalPages: 0 }), 0, '没填总页数时进度为 0，不能除以 0');
  eq(logic.bookProgress(null), 0, '空值应为 0');
  eq(logic.bookProgress({ currentPage: 0, totalPages: 100 }), 0);

  const full = logic.addBook(s, { title: 'B', totalPages: 10, currentPage: 10 });
  eq(logic.bookProgress(full), 100, '读完应为 100%');
  eq(logic.bookPagesLeft(full), 0);
});

test('阅读：推进页码可前进可后退，到顶自动读完', () => {
  const s = fresh();
  const b = logic.addBook(s, { title: 'A', totalPages: 100 });

  logic.advanceBookPage(s, b.id, 30);
  eq(b.currentPage, 30);
  logic.advanceBookPage(s, b.id, -10);
  eq(b.currentPage, 20, '应能往回退');
  logic.advanceBookPage(s, b.id, -999);
  eq(b.currentPage, 0, '不应退到负数');

  logic.advanceBookPage(s, b.id, 1000);
  eq(b.currentPage, 100, '不应超过总页数');
  eq(b.status, 'finished', '推进到最后一页应自动读完');

  eq(logic.advanceBookPage(s, '不存在', 10), null, '不存在的书应返回 null');
});

test('阅读：记一次阅读会累加到当天，并能同时推进页码', () => {
  const s = fresh();
  const b = logic.addBook(s, { title: 'A', totalPages: 100 });
  const d = '2026-10-08';

  logic.logReading(s, { date: d, minutes: 20, bookId: b.id, pages: 10 });
  eq(logic.readingMinutesOn(s, d), 20);
  eq(b.currentPage, 10, '应同时推进页码');

  // 同一天再记一次应累加，而不是新增一条
  logic.logReading(s, { date: d, minutes: 15 });
  eq(logic.readingMinutesOn(s, d), 35, '同一天应累加');
  eq(s.readLog.length, 1, '同一天只应有一条记录');

  // 另一天单独一条
  logic.logReading(s, { date: '2026-10-09', minutes: 40 });
  eq(s.readLog.length, 2);
  eq(logic.readingMinutesTotal(s), 75, '累计应相加');

  // 非法输入
  eq(logic.logReading(s, { minutes: 0 }), null, '0 分钟应被拒绝');
  eq(logic.logReading(s, { minutes: -5 }), null, '负数应被拒绝');
  eq(logic.readingMinutesOn(s, d), 35, '被拒绝的记录不应改变数据');
});

test('阅读：本周概览与达标天数', () => {
  const s = fresh();
  // 2026-10-08 是周四，本周为 10-05 ~ 10-11
  const t = '2026-10-08';
  eq(logic.readingWeekOverview(s, t).length, 7, '本周应固定 7 天');
  eq(logic.readingWeekOverview(s, t)[0].date, '2026-10-05', '应从周一开始');

  logic.setReadingDailyGoal(s, 30);
  logic.logReading(s, { date: '2026-10-05', minutes: 30 });
  logic.logReading(s, { date: '2026-10-06', minutes: 45 });
  logic.logReading(s, { date: '2026-10-07', minutes: 10 }); // 未达标

  eq(logic.readingWeekGoalDays(s, t), 2, '只有达到目标的两天算达标');
  const week = logic.readingWeekOverview(s, t);
  eq(week[0].minutes, 30);
  eq(week[2].minutes, 10);
  eq(week[3].isToday, true, '今天应被标出');
  eq(week[4].minutes, 0, '没读的日子是 0');
});

test('阅读：每日目标可设置，非法值回落默认且不写坏数据', () => {
  const s = fresh();
  eq(logic.getReadingDailyGoal(s), 30, '默认 30 分钟');

  eq(logic.setReadingDailyGoal(s, 45), 45, '应返回生效值');
  eq(logic.getReadingDailyGoal(s), 45);
  eq(s.settings.readingDailyGoal, 45, '应写进数据');

  eq(logic.setReadingDailyGoal(s, 0), 30, '0 应回落到默认');
  eq(logic.setReadingDailyGoal(s, -10), 30, '负数应回落到默认');
  eq(logic.setReadingDailyGoal(s, 9999), 30, '超过上限应回落');
  eq(logic.getReadingDailyGoal(s), 30);

  // 手改数据也要能救回来
  const n = logic.normalizeState({ settings: { readingDailyGoal: 'abc' } });
  eq(n.settings.readingDailyGoal, 30, '非法值应被规整');
  const n2 = logic.normalizeState({ settings: { readingDailyGoal: 60 } });
  eq(n2.settings.readingDailyGoal, 60, '合法值应保留');
});

test('阅读：笔记可增改删，可关联书与页码', () => {
  const s = fresh();
  const b = logic.addBook(s, { title: 'A' });

  const note = logic.addBookNote(s, { text: '  想法一  ', bookId: b.id, page: '42' });
  eq(note.text, '想法一', '应去掉首尾空格');
  eq(note.kind, 'note', '默认是想法');
  eq(note.page, 42, '页码应是数字');
  eq(note.bookId, b.id);
  eq(logic.addBookNote(s, { text: '  ' }), null, '空内容应被拒绝');

  const quote = logic.addBookNote(s, { text: '原文', kind: 'quote', bookId: b.id, page: 10 });
  eq(quote.kind, 'quote');

  // 按页码排序，没页码的排后面
  const noPage = logic.addBookNote(s, { text: '没页码', bookId: b.id });
  deepEq(logic.notesOfBook(s, b.id).map((n) => n.text), ['原文', '想法一', '没页码']);

  logic.updateBookNote(s, note.id, { text: '想法改了', page: 5 });
  eq(note.text, '想法改了');
  eq(note.page, 5);
  logic.updateBookNote(s, note.id, { text: '  ' });
  eq(note.text, '想法改了', '空白内容不应覆盖原内容');

  eq(logic.removeBookNote(s, quote.id).id, quote.id);
  eq(s.bookNotes.length, 2);
  eq(logic.removeBookNote(s, '不存在'), null);
  eq(noPage.id, s.bookNotes[1].id);
});

test('阅读：删书会连带清掉它的笔记，其他笔记保留', () => {
  const s = fresh();
  const a = logic.addBook(s, { title: 'A' });
  const b = logic.addBook(s, { title: 'B' });
  logic.addBookNote(s, { text: 'A 的笔记 1', bookId: a.id });
  logic.addBookNote(s, { text: 'A 的笔记 2', bookId: a.id });
  logic.addBookNote(s, { text: 'B 的笔记', bookId: b.id });
  logic.addBookNote(s, { text: '没关联的笔记' });

  logic.removeBook(s, a.id);
  eq(s.books.length, 1, '只应删掉 A');
  eq(s.bookNotes.length, 2, 'A 的两条笔记应被清掉');
  eq(logic.notesOfBook(s, a.id).length, 0);
  eq(logic.notesOfBook(s, b.id).length, 1, 'B 的笔记不该被误删');
  ok(s.bookNotes.some((n) => n.text === '没关联的笔记'), '没关联书的笔记也应保留');
});

test('阅读：概况统计与今日完成度', () => {
  const s = fresh();
  const t = '2026-10-08';
  logic.setReadingDailyGoal(s, 20);

  logic.addBook(s, { title: '在读的', totalPages: 100, currentPage: 40 });
  logic.addBook(s, { title: '读完的', totalPages: 50, currentPage: 50 });
  logic.addBook(s, { title: '想读的' });
  logic.addBookNote(s, { text: '笔记', kind: 'quote' });
  logic.logReading(s, { date: t, minutes: 12 });

  const st = logic.readingStats(s, t);
  eq(st.total, 3);
  eq(st.reading, 1);
  eq(st.finished, 1);
  eq(st.want, 1);
  eq(st.pagesRead, 90, '累计已读页数应为 40 + 50');
  eq(st.notes, 1);
  eq(st.quotes, 1);
  eq(st.minutesToday, 12);
  eq(st.dailyGoal, 20);

  eq(logic.readingTodayPercent(s, t), 60, '12/20 应为 60%');
  eq(logic.readingTodayPercent(s, '2026-01-01'), 0, '没读的那天为 0');

  // 超过目标应封顶 100%
  logic.logReading(s, { date: t, minutes: 100 });
  eq(logic.readingTodayPercent(s, t), 100, '超过目标应封顶 100%');
});

test('阅读：推到今日会按剩余页数生成任务', () => {
  const s = fresh();
  const b = logic.addBook(s, { title: '置身事内', totalPages: 300, currentPage: 100 });
  const task = logic.pushBookToToday(s, b.id, '2026-10-08');
  eq(task.module, 'reading', '应归属阅读模块');
  eq(task.date, '2026-10-08');
  ok(task.title.includes('置身事内'), '标题应带书名');
  ok(task.title.includes('200'), '应带剩余页数：' + task.title);

  // 没填总页数时不提页数
  const b2 = logic.addBook(s, { title: '随便看看' });
  const t2 = logic.pushBookToToday(s, b2.id, '2026-10-08');
  eq(t2.title, '读《随便看看》', '没页数时只说书名');
});

test('阅读：日历标记显示当天读了多久，图表也纳入阅读', () => {
  const s = fresh();
  logic.logReading(s, { date: '2026-10-08', minutes: 35 });
  logic.logReading(s, { date: '2026-10-09', minutes: 20 });

  const marks = logic.calendarMarks(s, 'reading', 2026, 10);
  eq(marks['2026-10-08'].extra, '35 分钟', '应标出当天分钟数');
  eq(marks['2026-10-09'].extra, '20 分钟');

  eq(logic.moduleLabel('reading'), '阅读', '模块中文名');

  // 首页扇形图应能包含阅读模块
  logic.addTask(s, { title: '读两页', module: 'reading', date: '2026-10-08' });
  const slices = logic.chartSlices(s, 'all', 'week', '2026-10-08');
  ok(slices.some((x) => x.key === 'reading'), '汇总图里应出现阅读');
});

test('阅读：初始状态与规范化都带上阅读字段', () => {
  const s = fresh();
  for (const f of ['books', 'readLog', 'bookNotes']) {
    ok(Array.isArray(s[f]), f + ' 应为数组');
  }
  eq(s.settings.readingDailyGoal, 30);

  // 旧数据（没有阅读字段）应被补齐，而不是报错
  const n = logic.normalizeState({ tasks: [] });
  deepEq(n.books, []);
  deepEq(n.readLog, []);
  deepEq(n.bookNotes, []);
  eq(n.settings.readingDailyGoal, 30);
});

test('阅读：新建时就填了已读页数，状态也要立刻正确（回归）', () => {
  // 之前只有"改书"会推导状态，"加书"不会：新建一本已读到 40/100 的书，
  // 状态会错误地停在"想读"，统计也跟着不对。
  const s = fresh();

  const half = logic.addBook(s, { title: '读了一半', totalPages: 100, currentPage: 40 });
  eq(half.status, 'reading', '新建时已有进度应直接是在读');
  eq(half.startedAt, date.todayStr(), '应记下开始日期');

  const done = logic.addBook(s, { title: '已经读完', totalPages: 50, currentPage: 50 });
  eq(done.status, 'finished', '新建时正好读到最后一页应直接是已读完');
  eq(done.finishedAt, date.todayStr(), '应记下完成日期');

  const over = logic.addBook(s, { title: '写多了', totalPages: 30, currentPage: 999 });
  eq(over.currentPage, 30, '新建时页码也不应超过总页数');
  eq(over.status, 'finished');

  const want = logic.addBook(s, { title: '还没开始', totalPages: 100 });
  eq(want.status, 'want', '没有进度时应仍是想读');
  eq(want.startedAt, '', '没开始就不该有开始日期');

  // 统计应立刻反映正确状态
  const st = logic.readingStats(s, '2026-10-08');
  eq(st.reading, 1, '在读的应有 1 本');
  eq(st.finished, 2, '已读完的应有 2 本');
  eq(st.want, 1);

  // 显式指定的状态优先于推导（例如手动标为搁置）
  const paused = logic.addBook(s, { title: '搁置的', totalPages: 100, currentPage: 30, status: 'paused' });
  eq(paused.status, 'paused', '手动指定的状态应被尊重');
});

test('笔记位置：章节 + 页码区间 + 行号区间，能拼成一句人话（R13.5–R13.7）', () => {
  const s = fresh();

  // 三个位置都填，且都是区间
  const full = logic.addBookNote(s, {
    text: '全都有',
    chapter: '第三章',
    page: 42, pageTo: 45,
    line: 3, lineTo: 8,
  });
  eq(full.page, 42);
  eq(full.pageTo, 45);
  eq(full.line, 3);
  eq(full.lineTo, 8);
  eq(logic.noteLocation(full), '第三章 · 第 42–45 页 · 第 3–8 行');

  // 只有一页/一行时不写成区间
  const single = logic.addBookNote(s, { text: '单页', page: 7, line: 2 });
  eq(logic.noteLocation(single), '第 7 页 · 第 2 行');

  // 只填章节
  const onlyChapter = logic.addBookNote(s, { text: '只章节', chapter: '附录二' });
  eq(logic.noteLocation(onlyChapter), '附录二');

  // 什么都不填就是空串
  const nothing = logic.addBookNote(s, { text: '没位置' });
  eq(logic.noteLocation(nothing), '', '没填位置时应是空串');

  eq(logic.noteLocation(null), '', '空笔记不该报错');
});

test('笔记位置：只填"到第几页"时自动补起始页，不出现半截区间（R13.6）', () => {
  const s = fresh();

  const a = logic.addBookNote(s, { text: '只填了到第几页', pageTo: 45 });
  eq(a.page, 45, '起始页应自动补成同一个值');
  eq(a.pageTo, 45);
  eq(logic.noteLocation(a), '第 45 页', '不该显示成 "第 页–45 页"');

  const b = logic.addBookNote(s, { text: '只填了到第几行', lineTo: 12 });
  eq(b.line, 12);
  eq(logic.noteLocation(b), '第 12 行');

  // 编辑时同理
  const c = logic.addBookNote(s, { text: '编辑', page: 0, pageTo: 0 });
  logic.updateBookNote(s, c.id, { pageTo: 30 });
  eq(c.page, 30, '编辑时也应补上起始页');

  // 负数与非法值不会写进去
  const d = logic.addBookNote(s, { text: '非法', page: -5, pageTo: 'abc', line: -1 });
  eq(d.page, 0);
  eq(d.pageTo, 0);
  eq(d.line, 0);
});

test('笔记：四种类型，非法类型回落"想法"（R13.3）', () => {
  const s = fresh();
  deepEq(logic.NOTE_KIND_ORDER, ['quote', 'note', 'question', 'action']);

  for (const k of logic.NOTE_KIND_ORDER) {
    const n = logic.addBookNote(s, { text: k, kind: k });
    eq(n.kind, k, '应保留类型 ' + k);
  }
  const bad = logic.addBookNote(s, { text: '乱写', kind: '不存在的类型' });
  eq(bad.kind, 'note', '非法类型应回落到想法');

  // 每种类型的中文名都在
  for (const k of logic.NOTE_KIND_ORDER) {
    ok(logic.NOTE_KINDS[k], '类型 ' + k + ' 应有中文名');
  }
});

test('笔记：搜索内容/章节/书名，按书与类型筛选，只看收藏（R13.2–R13.4）', () => {
  const s = fresh();
  const bookA = logic.addBook(s, { title: '置身事内', author: '兰小欢' });
  const bookB = logic.addBook(s, { title: '人类简史', author: '赫拉利' });

  logic.addBookNote(s, { text: '地方政府的行为逻辑', bookId: bookA.id, kind: 'quote', chapter: '第三章' });
  logic.addBookNote(s, { text: '认知革命的关键', bookId: bookB.id, kind: 'note', pinned: true });
  logic.addBookNote(s, { text: '这条没关联书', kind: 'question' });

  eq(logic.bookNotesSummary(s).total, 3);

  // 搜正文
  eq(logic.filterBookNotes(s, { q: '认知' }).length, 1);
  // 搜章节
  eq(logic.filterBookNotes(s, { q: '第三章' }).length, 1);
  // 搜书名
  eq(logic.filterBookNotes(s, { q: '人类简史' }).length, 1, '应能按书名搜到');
  // 搜作者
  eq(logic.filterBookNotes(s, { q: '兰小欢' }).length, 1, '应能按作者搜到');
  // 大小写不敏感 + 没有结果
  eq(logic.filterBookNotes(s, { q: '不存在的词' }).length, 0);

  // 按书筛
  eq(logic.filterBookNotes(s, { bookId: bookA.id }).length, 1);
  eq(logic.filterBookNotes(s, { bookId: bookB.id }).length, 1);

  // 按类型筛
  eq(logic.filterBookNotes(s, { kind: 'quote' }).length, 1);
  eq(logic.filterBookNotes(s, { kind: 'question' }).length, 1);

  // 只看收藏
  const pinned = logic.filterBookNotes(s, { pinnedOnly: true });
  eq(pinned.length, 1);
  eq(pinned[0].text, '认知革命的关键');

  // 组合筛选
  eq(logic.filterBookNotes(s, { bookId: bookA.id, kind: 'quote' }).length, 1);
  eq(logic.filterBookNotes(s, { bookId: bookA.id, kind: 'note' }).length, 0);
  eq(logic.filterBookNotes(s, { q: '认知', bookId: bookA.id }).length, 0, '条件之间应是"且"');
});

test('笔记：收藏会置顶显示（R13.4）', () => {
  const s = fresh();
  const a = logic.addBookNote(s, { text: '先记的' });
  const b = logic.addBookNote(s, { text: '后记的' });

  // 都不是收藏时，最近记的在最前。
  // 两条往往是同一毫秒创建的，所以这里同时验证"同毫秒也稳定"——
  // 只比时间戳会在同毫秒时给出随机顺序，顺序必须可预测。
  eq(a.createdAt, b.createdAt, '前置条件：这两条确实是同一毫秒创建的');
  deepEq(logic.filterBookNotes(s, {}).map((n) => n.text), ['后记的', '先记的'],
    '同一毫秒创建时，后记的也应在最前（按创建序号兜底）');

  // 把先记的设为收藏，它应排到最前
  logic.toggleNotePinned(s, a.id);
  ok(a.pinned, '应被收藏');
  deepEq(logic.filterBookNotes(s, {}).map((n) => n.text), ['先记的', '后记的'],
    '收藏的应置顶');

  // 两条都收藏时，回到按时间倒序
  logic.toggleNotePinned(s, b.id);
  deepEq(logic.filterBookNotes(s, {}).map((n) => n.text), ['后记的', '先记的'],
    '都收藏时按创建时间倒序');

  // 再点一次取消
  logic.toggleNotePinned(s, a.id);
  logic.toggleNotePinned(s, b.id);
  notOk(a.pinned, '再点应取消收藏');
  notOk(b.pinned);
  deepEq(logic.filterBookNotes(s, {}).map((n) => n.text), ['后记的', '先记的']);

  eq(logic.toggleNotePinned(s, '不存在'), null);
  eq(logic.bookNotesSummary(s).pinned, 0);
});

test('id 序号：同毫秒创建的也能排出稳定顺序', () => {
  const s = fresh();
  const ids = [];
  for (let i = 0; i < 5; i++) ids.push(logic.newId('t'));
  eq(new Set(ids).size, 5, '同一毫秒生成的 id 不应重复');

  // 序号应递增，因此"后创建的 id 序号更大"
  const seqs = ids.map((id) => logic.idSeqOf(id));
  for (let i = 1; i < seqs.length; i++) {
    ok(seqs[i] > seqs[i - 1], '序号应递增：' + seqs[i - 1] + ' -> ' + seqs[i]);
  }

  eq(logic.idSeqOf(''), 0, '取不到序号时返回 0，不该抛错');
  eq(logic.idSeqOf(null), 0);

  // byNewestFirst：时间相同时序号大的在前
  const older = { id: 'x_1a001', createdAt: '2026-01-01T00:00:00+08:00' };
  const newer = { id: 'x_1a002', createdAt: '2026-01-01T00:00:00+08:00' };
  eq([older, newer].sort(logic.byNewestFirst)[0], newer, '同毫秒时序号大的排前面');
});

test('笔记概况：总数、按类型计数、收藏数、关联书数（R13 概况）', () => {
  const s = fresh();
  const b1 = logic.addBook(s, { title: 'A' });
  const b2 = logic.addBook(s, { title: 'B' });

  logic.addBookNote(s, { text: '1', bookId: b1.id, kind: 'quote', pinned: true, page: 10 });
  logic.addBookNote(s, { text: '2', bookId: b1.id, kind: 'quote' });
  logic.addBookNote(s, { text: '3', bookId: b2.id, kind: 'action' });
  logic.addBookNote(s, { text: '4', kind: 'note' }); // 没关联书、没位置

  const sum = logic.bookNotesSummary(s);
  eq(sum.total, 4);
  eq(sum.byKind.quote, 2);
  eq(sum.byKind.action, 1);
  eq(sum.byKind.note, 1);
  eq(sum.byKind.question, 0, '没有的类型应计 0，而不是 undefined');
  eq(sum.pinned, 1);
  eq(sum.booksTouched, 2, '关联了两本书');
  eq(sum.withLocation, 1, '只有第一条有位置');
});

test('某本书的笔记：收藏在前，再按页码、行号排序（notesOfBook）', () => {
  const s = fresh();
  const book = logic.addBook(s, { title: 'A' });

  logic.addBookNote(s, { text: '第 50 页', bookId: book.id, page: 50 });
  logic.addBookNote(s, { text: '第 10 页', bookId: book.id, page: 10 });
  logic.addBookNote(s, { text: '没页码', bookId: book.id });
  logic.addBookNote(s, { text: '收藏但第 99 页', bookId: book.id, page: 99, pinned: true });
  logic.addBookNote(s, { text: '别的书的', bookId: logic.addBook(s, { title: 'B' }).id, page: 1 });

  deepEq(logic.notesOfBook(s, book.id).map((n) => n.text),
    ['收藏但第 99 页', '第 10 页', '第 50 页', '没页码'],
    '收藏在最前，其余按页码，没页码的排最后');
  eq(logic.notesOfBook(s, '不存在的书').length, 0);
});

test('笔记：未关联书的笔记不会被删书误伤（R11.11 补充）', () => {
  const s = fresh();
  const book = logic.addBook(s, { title: 'A' });
  logic.addBookNote(s, { text: '关联 A', bookId: book.id });
  logic.addBookNote(s, { text: '没关联' });
  logic.addBookNote(s, { text: '关联空串', bookId: '' });

  logic.removeBook(s, book.id);
  eq(s.bookNotes.length, 2, '只应删掉真正关联 A 的那条');
  ok(s.bookNotes.every((n) => n.text !== '关联 A'));
});

test('优先级：四档齐全，旧的两档数据能平滑迁移', () => {
  // 四档的名称与顺序
  deepEq(logic.PRIORITY_ORDER, ['urgentImportant', 'important', 'urgent', 'normal']);
  eq(logic.PRIORITY.urgentImportant, '重要且紧急');
  eq(logic.PRIORITY.important, '重要不紧急');
  eq(logic.PRIORITY.urgent, '不重要但紧急');
  eq(logic.PRIORITY.normal, '不重要不紧急');
  eq(logic.PRIORITY_DEFAULT, 'normal', '默认是"不重要不紧急"');

  // 四档都能原样保留
  for (const k of logic.PRIORITY_ORDER) {
    eq(logic.normalizePriority(k), k, k + ' 应原样保留');
    eq(logic.priorityLabel(k), logic.PRIORITY[k]);
  }

  // 旧数据只有两档：high（重要）与 normal（普通）
  eq(logic.normalizePriority('high'), 'important',
    '旧的"重要"应迁移为"重要不紧急"，保持它仍然靠前');
  eq(logic.normalizePriority('normal'), 'normal', '旧的"普通"应迁移为"不重要不紧急"');

  // 没见过的值一律回落默认，不制造第五档
  for (const bad of ['xxx', '', null, undefined, 0, {}, []]) {
    eq(logic.normalizePriority(bad), 'normal', '非法值应回落到默认：' + JSON.stringify(bad));
  }

  // 排序权重：越小越靠前
  eq(logic.priorityRank('urgentImportant'), 0);
  eq(logic.priorityRank('important'), 1);
  eq(logic.priorityRank('urgent'), 2);
  eq(logic.priorityRank('normal'), 3);
  eq(logic.priorityRank('high'), 1, '旧值也要给出正确权重');
  eq(logic.priorityRank('乱写'), 3, '非法值按最低优先级');

  // 下拉选项：顺序与 PRIORITY_ORDER 一致，四档四行
  const opts = logic.priorityOptions();
  deepEq(opts.map((o) => o.value), logic.PRIORITY_ORDER);
  deepEq(opts.map((o) => o.label),
    ['重要且紧急', '重要不紧急', '不重要但紧急', '不重要不紧急']);
  eq(opts.length, 4, '下拉应正好四档');

  // 标签色调：越紧急越醒目，最低档不标色
  eq(logic.priorityTone('urgentImportant'), 'danger');
  eq(logic.priorityTone('important'), 'warn');
  eq(logic.priorityTone('urgent'), 'info');
  eq(logic.priorityTone('normal'), '', '最低档不标色，列表才不会满屏标签');
});

test('优先级：新增与修改都只接受四档', () => {
  const s = fresh();

  eq(logic.addTask(s, { title: 'A' }).priority, logic.TASK_DEFAULT_PRIORITY,
    '不填时用新增默认档（重要且紧急）');
  // 但要能显式选最低档
  eq(logic.addTask(s, { title: 'Z', priority: 'normal' }).priority, 'normal',
    '显式选"不重要不紧急"要生效');
  for (const k of logic.PRIORITY_ORDER) {
    eq(logic.addTask(s, { title: k, priority: k }).priority, k, '应保留 ' + k);
  }
  eq(logic.addTask(s, { title: '旧的', priority: 'high' }).priority, 'important',
    '用旧档位新增也会被迁移');
  eq(logic.addTask(s, { title: '乱写', priority: '第五档' }).priority, 'normal');

  // 修改同理
  const t2 = logic.addTask(s, { title: '改' });
  logic.updateTask(s, t2.id, { priority: 'urgentImportant' });
  eq(t2.priority, 'urgentImportant');
  logic.updateTask(s, t2.id, { priority: '不存在的档' });
  eq(t2.priority, 'normal', '非法值应回落，而不是写进去');

  // 开发待办也用同一套
  const d = logic.addDevTask(s, { title: '待办', priority: 'urgent' });
  eq(d.priority, 'urgent');
  logic.updateDevTask(s, d.id, { priority: 'high' });
  eq(d.priority, 'important', '开发待办同样迁移旧档位');
});

test('优先级：开发待办与学习条目也都用四档', () => {
  const s = fresh();

  // 开发待办
  eq(logic.addDevTask(s, { title: '待办', priority: 'urgentImportant' }).priority, 'urgentImportant');
  const d = logic.addDevTask(s, { title: '改', priority: 'normal' });
  logic.updateDevTask(s, d.id, { priority: 'urgent' });
  eq(d.priority, 'urgent');
  eq(logic.addDevTask(s, { title: '旧的', priority: 'high' }).priority, 'important');
  eq(logic.addDevTask(s, { title: '乱写', priority: '第五档' }).priority, 'normal');

  /*
   * 学习条目：之前**根本没有 priority 这个字段**，
   * 所以"优先级要在所有板块可用"这条只做到了任务与开发待办。
   * 这里把它固定下来，防止以后又漏。
   */
  const st = logic.addStudyItem(s, { title: '学点东西', priority: 'important' });
  eq(st.priority, 'important', '学习条目应能带优先级');
  logic.updateStudyItem(s, st.id, { priority: 'urgentImportant' });
  eq(st.priority, 'urgentImportant');
  eq(logic.addStudyItem(s, { title: '没填' }).priority, logic.TASK_DEFAULT_PRIORITY,
    '学习条目不填时也用新增默认档');
  eq(logic.addStudyItem(s, { title: '显式最低', priority: 'normal' }).priority, 'normal',
    '显式选最低档要生效');
  eq(logic.addStudyItem(s, { title: '旧的', priority: 'high' }).priority, 'important',
    '学习条目的旧档位也要迁移');
  eq(logic.addStudyItem(s, { title: '乱写', priority: '第五档' }).priority, 'normal');

  // 读入旧数据时三种列表都要被规整
  const n = logic.normalizeState({
    tasks: [{ id: 't1', title: 'A', priority: 'high' }],
    devTasks: [{ id: 'd1', title: 'B', priority: 'high' }],
    studyItems: [{ id: 's1', title: 'C', priority: 'high' }],
  });
  eq(n.tasks[0].priority, 'important');
  eq(n.devTasks[0].priority, 'important');
  eq(n.studyItems[0].priority, 'important', '学习条目的优先级也要在读入时规整');
});

test('优先级：按四档顺序排序，"重要且紧急"排最前', () => {
  const s = fresh();
  const d = '2026-10-08';

  // 故意打乱加入顺序
  logic.addTask(s, { title: '不重要不紧急', date: d, priority: 'normal' });
  logic.addTask(s, { title: '重要且紧急', date: d, priority: 'urgentImportant' });
  logic.addTask(s, { title: '不重要但紧急', date: d, priority: 'urgent' });
  logic.addTask(s, { title: '重要不紧急', date: d, priority: 'important' });

  deepEq(logic.tasksOn(s, d).map((x) => x.title),
    ['重要且紧急', '重要不紧急', '不重要但紧急', '不重要不紧急'],
    '应按四档顺序从高到低排出');

  // 旧数据（两档）排进来也要落在正确位置：重要应排在紧急之前
  const s2 = fresh();
  logic.addTask(s2, { title: '旧的普通', date: d, priority: 'normal' });
  logic.addTask(s2, { title: '旧的紧急', date: d, priority: 'urgent' });
  logic.addTask(s2, { title: '旧的important', date: d, priority: 'high' });
  deepEq(logic.tasksOn(s2, d).map((x) => x.title),
    ['旧的important', '旧的紧急', '旧的普通'],
    '旧的"重要"应排在"不重要但紧急"之前');
});

test('优先级：旧数据读进来时就被规整成四档（磁盘不留旧档位）', () => {
  const n = logic.normalizeState({
    tasks: [
      { id: 't1', title: 'A', priority: 'high' },
      { id: 't2', title: 'B', priority: 'normal' },
      { id: 't3', title: 'C', priority: '乱写' },
      { id: 't4', title: 'D' },
    ],
    devTasks: [{ id: 'd1', title: 'E', priority: 'high' }],
  });

  deepEq(n.tasks.map((x) => x.priority), ['important', 'normal', 'normal', 'normal']);
  deepEq(n.devTasks.map((x) => x.priority), ['important']);
  // 四档之外的值不该再出现在数据里
  for (const x of n.tasks.concat(n.devTasks)) {
    ok(logic.PRIORITY_ORDER.includes(x.priority),
      '规整后只能是四档之一，实际：' + x.priority);
  }
});

test('健身：记一次训练会补全字段，时长与动作都要有', () => {
  const s = fresh();

  const a = logic.logWorkout(s, {
    date: '2026-10-08', type: '胸 + 三头', minutes: 45, intensity: 'hard',
    exercises: [{ name: '卧推', sets: 4, reps: 12 }, { name: '绳索下压', sets: 3, reps: 15 }],
    note: '状态不错',
  });
  ok(a, '应记录成功');
  eq(a.date, '2026-10-08');
  eq(a.type, '胸 + 三头');
  eq(a.minutes, 45);
  eq(a.intensity, 'hard');
  eq(a.exercises.length, 2);
  eq(a.exercises[0].name, '卧推');
  eq(a.note, '状态不错');
  ok(a.id && a.createdAt, '应有 id 与时间戳');
  eq(s.fitness.log.length, 1);
});

test('健身：至少要有时长或一个动作，空记录不写入（R20.3）', () => {
  const s = fresh();
  eq(logic.logWorkout(s, { minutes: 0 }), null, '没时长没动作应被拒绝');
  eq(logic.logWorkout(s, {}), null, '什么都不填应被拒绝');
  eq(logic.logWorkout(s, { minutes: 0, exercises: [] }), null);
  // 只有动作、没有时长：允许（练了几组也是练了）
  ok(logic.logWorkout(s, { exercises: [{ name: '引体向上', sets: 3, reps: 8 }] }),
    '只写动作也应能记录');
  eq(s.fitness.log.length, 1);
  // 只有时长、没有动作：允许
  ok(logic.logWorkout(s, { date: '2026-10-09', minutes: 30 }), '只写时长也应能记录');
  eq(s.fitness.log.length, 2);
});

test('健身：同一天记两次会合并（时长累加、同名动作合并）', () => {
  const s = fresh();
  const d = '2026-10-08';

  logic.logWorkout(s, { date: d, type: '胸 + 三头', minutes: 30, exercises: [{ name: '卧推', sets: 3, reps: 10 }] });
  logic.logWorkout(s, { date: d, minutes: 20, exercises: [{ name: '卧推', sets: 2, reps: 12 }] });

  eq(s.fitness.log.length, 1, '同一天只应有一条记录');
  const rec = s.fitness.log[0];
  eq(rec.minutes, 50, '时长应累加');
  eq(rec.exercises.length, 1, '同名动作应合并而不是新增一条');
  eq(rec.exercises[0].sets, 5, '组数应累加');
  eq(rec.exercises[0].reps, 12, '次数取较大的那个（更好的成绩）');

  // 不同类型的新动作应追加
  logic.logWorkout(s, { date: d, exercises: [{ name: '深蹲', sets: 4, reps: 10 }] });
  eq(s.fitness.log[0].exercises.length, 2, '不同名动作应追加');
});

test('健身：某天的时长、累计次数与累计时长', () => {
  const s = fresh();
  logic.logWorkout(s, { date: '2026-10-05', type: '有氧', minutes: 30 });
  logic.logWorkout(s, { date: '2026-10-06', type: '有氧', minutes: 45 });
  logic.logWorkout(s, { date: '2026-10-07', type: '腿 + 肩', minutes: 60 });

  eq(logic.workoutMinutesOn(s, '2026-10-05'), 30);
  eq(logic.workoutMinutesOn(s, '2026-10-08'), 0, '没练的那天是 0');
  eq(logic.workoutCount(s), 3);
  eq(logic.workoutMinutesTotal(s), 135);
  eq(logic.workoutOn(s, '2026-10-06').type, '有氧');
  eq(logic.workoutOn(s, '2026-10-09'), null);
});

test('健身：本周进度与达标（含"还差几次"）', () => {
  const s = fresh();
  // 2026-10-08 是周四，本周为 10-05 ~ 10-11
  const t = '2026-10-08';
  logic.setFitnessWeeklyGoal(s, 3);

  let w = logic.fitnessWeekProgress(s, t);
  eq(w.done, 0);
  eq(w.goal, 3);
  eq(w.left, 3);
  eq(w.todayDone, false);
  eq(w.shouldRemind, true, '一次没练应值得提醒');

  logic.logWorkout(s, { date: '2026-10-05', type: '有氧', minutes: 30 });
  logic.logWorkout(s, { date: '2026-10-06', type: '腿 + 肩', minutes: 40 });
  w = logic.fitnessWeekProgress(s, t);
  eq(w.done, 2);
  eq(w.left, 1);
  eq(w.percent, 67, '2/3 应为 67%');
  eq(w.shouldRemind, true, '还没达标应继续提醒');

  // 今天练了 → 不再提醒；再练一次达标
  logic.logWorkout(s, { date: t, type: '核心', minutes: 20 });
  w = logic.fitnessWeekProgress(s, t);
  eq(w.done, 3);
  eq(w.todayDone, true);
  eq(w.left, 0);
  eq(w.percent, 100);
  eq(w.shouldRemind, false, '达标后不该再提醒');

  // 上周的记录不该算进本周
  logic.logWorkout(s, { date: '2026-09-30', type: '有氧', minutes: 30 });
  eq(logic.fitnessWeekProgress(s, t).done, 3, '上周的不算本周');

  // 本周概览固定 7 天，周一起
  const week = logic.fitnessWeekOverview(s, t);
  eq(week.length, 7);
  eq(week[0].date, '2026-10-05', '应从周一开始');
  eq(week[0].trained, true);
  eq(week[1].trained, true);
  eq(week[2].trained, false, '10-07 没练');
  eq(week[3].isToday, true, '今天应被标出');
});

test('健身：连续天数（今天还没练不算断）', () => {
  const s = fresh();
  const t = '2026-10-08';
  eq(logic.fitnessStreak(s, t), 0, '一次没练是 0 天');

  // 连着 10-06 / 10-07，今天(10-08)还没练
  logic.logWorkout(s, { date: '2026-10-06', minutes: 30 });
  logic.logWorkout(s, { date: '2026-10-07', minutes: 30 });
  eq(logic.fitnessStreak(s, t), 2, '今天还没练时应从昨天往前数，不算断');

  // 今天也练了 → 3 天
  logic.logWorkout(s, { date: t, minutes: 30 });
  eq(logic.fitnessStreak(s, t), 3);

  // 中间断一天，只算最近的连续段
  const s2 = fresh();
  logic.logWorkout(s2, { date: '2026-10-01', minutes: 30 });
  logic.logWorkout(s2, { date: '2026-10-02', minutes: 30 });
  logic.logWorkout(s2, { date: '2026-10-07', minutes: 30 });
  logic.logWorkout(s2, { date: '2026-10-08', minutes: 30 });
  eq(logic.fitnessStreak(s2, t), 2, '应从最近连续的那段算起');
});

test('健身：训练目标的本周进度与达标', () => {
  const s = fresh();
  const t = '2026-10-08';

  const g1 = logic.addFitnessGoal(s, { type: '胸 + 三头', perWeek: 2 });
  const g2 = logic.addFitnessGoal(s, { type: '有氧', perWeek: 1 });
  eq(g1.perWeek, 2);
  eq(g2.perWeek, 1);
  eq(s.fitness.goals.length, 2);
  eq(logic.addFitnessGoal(s, { type: '  ' }), null, '空类型应被拒绝');
  // 边界值：每周次数夹在 1..21
  eq(logic.addFitnessGoal(s, { type: '腿', perWeek: 0 }).perWeek, 1, '每周次数至少 1');
  eq(logic.addFitnessGoal(s, { type: '腿2', perWeek: 99 }).perWeek, 21, '每周次数最多 21');
  eq(s.fitness.goals.length, 4, '前面 2 个 + 这 2 个边界值目标');

  // 本周练 2 次胸、1 次有氧
  logic.logWorkout(s, { date: '2026-10-05', type: '胸 + 三头', minutes: 40 });
  logic.logWorkout(s, { date: '2026-10-07', type: '胸 + 三头', minutes: 40 });
  logic.logWorkout(s, { date: '2026-10-06', type: '有氧', minutes: 30 });

  const prog = logic.fitnessGoalProgress(s, t);
  const p1 = prog.find((x) => x.type === '胸 + 三头');
  const p2 = prog.find((x) => x.type === '有氧');
  eq(p1.done, 2);
  eq(p1.percent, 100);
  eq(p1.reached, true, '练够 2 次应达标');
  eq(p2.done, 1);
  eq(p2.reached, true);

  // 没练够的目标
  const g3 = logic.addFitnessGoal(s, { type: '腿 + 肩', perWeek: 3 });
  const p3 = logic.fitnessGoalProgress(s, t).find((x) => x.type === '腿 + 肩');
  eq(p3.done, 0);
  eq(p3.left, 3);
  eq(p3.reached, false);

  // 改与删
  // 此时共 5 个目标：胸 + 三头、有氧、腿、腿2、腿 + 肩(g3)
  eq(s.fitness.goals.length, 5, '到这一步应共 5 个目标');
  logic.updateFitnessGoal(s, g3.id, { perWeek: 1 });
  eq(g3.perWeek, 1);
  eq(logic.removeFitnessGoal(s, g3.id).id, g3.id);
  eq(s.fitness.goals.length, 4, '删掉 g3 后还剩 4 个');
  eq(logic.removeFitnessGoal(s, '不存在'), null);
});

test('健身：概况统计与按类型分布', () => {
  const s = fresh();
  const t = '2026-10-08';
  logic.setFitnessWeeklyGoal(s, 2);
  logic.logWorkout(s, { date: '2026-10-05', type: '胸 + 三头', minutes: 40 });
  logic.logWorkout(s, { date: '2026-10-07', type: '胸 + 三头', minutes: 50 });
  logic.logWorkout(s, { date: '2026-10-06', type: '有氧', minutes: 30 });
  logic.addFitnessGoal(s, { type: '胸 + 三头', perWeek: 2 });
  logic.addFitnessNote(s, { text: '状态不错' });

  const st = logic.fitnessStats(s, t);
  eq(st.count, 3);
  eq(st.minutesTotal, 120);
  eq(st.minutesThisWeek, 120);
  eq(st.weekDone, 3);
  eq(st.weekGoal, 2);
  eq(st.weekPercent, 100);
  eq(st.todayDone, false, '今天(10-08)还没练');
  eq(st.goals, 1);
  eq(st.goalsReached, 1);
  eq(st.notes, 1);

  const types = logic.fitnessTypeStats(s);
  eq(types.length, 2);
  eq(types[0].type, '胸 + 三头', '练得多的排前面');
  eq(types[0].count, 2);
  eq(types[0].minutes, 90);
  eq(types[1].type, '有氧');
});

test('健身：训练记录可增改删、可按日期倒序', () => {
  const s = fresh();
  const n = logic.addFitnessNote(s, { text: '  今天状态不错  ', date: '2026-10-07', mood: 'light' });
  eq(n.text, '今天状态不错', '应去掉首尾空格');
  eq(n.date, '2026-10-07');
  eq(n.mood, 'light');
  eq(logic.addFitnessNote(s, { text: '   ' }), null, '空内容应被拒绝');

  const n2 = logic.addFitnessNote(s, { text: '后天记的', date: '2026-10-09' });
  eq(logic.fitnessNotesSorted(s)[0].id, n2.id, '新的日期应排前面');

  logic.updateFitnessNote(s, n.id, { text: '改成这样', mood: 'hard' });
  eq(n.text, '改成这样');
  eq(n.mood, 'hard');
  logic.updateFitnessNote(s, n.id, { text: '  ' });
  eq(n.text, '改成这样', '空白内容不应覆盖');

  eq(logic.removeFitnessNote(s, n2.id).id, n2.id);
  eq(s.fitness.notes.length, 1);
  eq(logic.removeFitnessNote(s, '不存在'), null);
});

test('健身：编辑与删除某次训练', () => {
  const s = fresh();
  const a = logic.logWorkout(s, { date: '2026-10-08', type: '有氧', minutes: 30 });

  logic.updateWorkout(s, a.id, { type: '核心', minutes: 25, intensity: 'light', note: '改了' });
  eq(a.type, '核心');
  eq(a.minutes, 25);
  eq(a.intensity, 'light');
  eq(a.note, '改了');
  // 非法强度不该写进去
  logic.updateWorkout(s, a.id, { intensity: '乱写' });
  eq(a.intensity, 'light', '非法强度应保持原值');

  eq(logic.removeWorkout(s, a.id).id, a.id);
  eq(s.fitness.log.length, 0);
  eq(logic.removeWorkout(s, '不存在'), null);
});

test('健身：日历标记显示当天训练时长（R20.8）', () => {
  const s = fresh();
  logic.logWorkout(s, { date: '2026-10-08', type: '有氧', minutes: 35 });
  logic.logWorkout(s, { date: '2026-10-09', type: '有氧', minutes: 20 });

  const marks = logic.calendarMarks(s, 'fitness', 2026, 10);
  eq(marks['2026-10-08'].extra, '35 分钟');
  eq(marks['2026-10-09'].extra, '20 分钟');

  // 只写了动作、没写时长的，标记成"已练"
  const s2 = fresh();
  logic.logWorkout(s2, { date: '2026-10-08', exercises: [{ name: '引体向上', sets: 3, reps: 8 }] });
  eq(logic.calendarMarks(s2, 'fitness', 2026, 10)['2026-10-08'].extra, '已练');

  // 统计图表也要认得健身
  logic.addTask(s, { title: '练一组', module: 'fitness', date: '2026-10-08' });
  const slices = logic.chartSlices(s, 'all', 'week', '2026-10-08');
  ok(slices.some((x) => x.key === 'fitness'), '汇总图里应出现健身');
});

test('健身：推到今日会生成一条归属健身的任务', () => {
  const s = fresh();
  const t = '2026-10-08';

  const task = logic.pushWorkoutToToday(s, t);
  eq(task.module, 'fitness', '应归属健身模块');
  eq(task.date, t);
  ok(task.title.includes('训练'), '标题应提到训练：' + task.title);

  // 今天已经练过了，标题应换一个说法
  logic.logWorkout(s, { date: t, minutes: 30 });
  const t2 = logic.pushWorkoutToToday(s, t);
  ok(t2.title.includes('再做一次'), '已练过时标题应不同：' + t2.title);
});

test('健身：每周目标可设置，非法值回落且不写坏数据', () => {
  const s = fresh();
  eq(logic.getFitnessWeeklyGoal(s), 3, '默认每周 3 次');

  eq(logic.setFitnessWeeklyGoal(s, 5), 5, '应返回生效值');
  eq(s.settings.fitnessWeeklyGoal, 5, '应写进数据');

  eq(logic.setFitnessWeeklyGoal(s, 0), 3, '0 应回落到默认');
  eq(logic.setFitnessWeeklyGoal(s, -2), 3, '负数应回落到默认');
  eq(logic.setFitnessWeeklyGoal(s, 999), 3, '超过上限应回落');

  // 手改数据也要能救回来
  eq(logic.normalizeState({ settings: { fitnessWeeklyGoal: 'abc' } }).settings.fitnessWeeklyGoal, 3);
  eq(logic.normalizeState({ settings: { fitnessWeeklyGoal: 4 } }).settings.fitnessWeeklyGoal, 4);
});

test('健身：旧的 {routine, records} 数据能被规整，不报错（R20.11）', () => {
  // 旧结构：routine 是固定周计划，records 是按日期键的打卡
  const n = logic.normalizeState({
    fitness: {
      routine: [{ label: '胸 + 三头', rest: false, exercises: [{ name: '卧推', sets: 4, reps: 12 }] }],
      records: {
        '2026-10-08': { label: '胸 + 三头', exercises: {}, finished: true },
        '2026-10-09': { finished: true },
      },
    },
  });

  // 结构被换成新的三段式
  ok(Array.isArray(n.fitness.log), 'fitness.log 应是数组');
  ok(Array.isArray(n.fitness.goals), 'fitness.goals 应是数组');
  ok(Array.isArray(n.fitness.notes), 'fitness.notes 应是数组');
  eq('routine' in n.fitness, false, '旧的 routine 应被删掉');
  eq('records' in n.fitness, false, '旧的 records 应被删掉');

  // 旧打卡被迁移成日志，不会丢
  eq(n.fitness.log.length, 2, '旧的两天打卡应迁移成两条日志');
  const days = n.fitness.log.map((r) => r.date).sort();
  deepEq(days, ['2026-10-08', '2026-10-09']);
  const first = n.fitness.log.find((r) => r.date === '2026-10-08');
  eq(first.type, '胸 + 三头', '旧的 label 应变成类型');
  ok(first.minutes > 0, '没写时长的旧记录应给一个下限，保证这条记录有意义');

  // 完全合法的数据不该被动
  const clean = logic.normalizeState(logic.createInitialState());
  deepEq(clean.fitness, { log: [], goals: [], notes: [] });
});

test('健身：新记的数据不会被当成"已移除模块残留"删掉（R20.12 回归）', () => {
  /*
   * 这是加回健身时最容易踩的坑：
   * fitness 曾经在"已移除模块"清单里，如果忘了拿掉，
   * 用户每次读取数据，新记的健身记录都会被清理掉。
   */
  const s = fresh();
  logic.logWorkout(s, { date: '2026-10-08', type: '有氧', minutes: 30 });
  logic.addFitnessGoal(s, { type: '有氧', perWeek: 2 });
  logic.addFitnessNote(s, { text: '练完很舒服' });
  logic.addTask(s, { title: '练一组', module: 'fitness', date: '2026-10-08' });

  const cleaned = logic.normalizeState(JSON.parse(JSON.stringify(s)));

  eq(cleaned.fitness.log.length, 1, '健身日志应保留');
  eq(cleaned.fitness.goals.length, 1, '训练目标应保留');
  eq(cleaned.fitness.notes.length, 1, '训练记录应保留');
  ok(cleaned.tasks.some((x) => x.module === 'fitness'), '归属健身的任务应保留');

  // 清理报告里不该出现健身
  const report = logic.purgeRemovedModules(JSON.parse(JSON.stringify(s)));
  eq(report.some((r) => r.id === 'fitness'), false, '健身不该出现在清理报告里');
});

/* ---------------- 左侧栏模块配置 ---------------- */

test('左侧栏配置：默认显示全部五个可配模块', () => {
  deepEq(logic.NAV_MODULE_CHOICES, ['dev', 'study', 'reading', 'diet', 'fitness'],
    '可勾选的模块就这五个');
  eq(logic.NAV_MODULE_REQUIRED, 'study', '至少要保留学习');

  const s = fresh();
  deepEq(s.settings.navModules, ['dev', 'study', 'reading', 'diet', 'fitness'], '默认全开');
  deepEq(logic.navModules(s), ['dev', 'study', 'reading', 'diet', 'fitness']);

  // 骨架项不可配置
  for (const id of ['home', 'today', 'settings']) {
    notOk(logic.NAV_MODULE_CHOICES.includes(id), id + ' 不该出现在可勾选清单里');
  }
  deepEq(logic.NAV_FIXED_IDS, ['home', 'today', 'settings'], '骨架项就是这三个');
});

test('左侧板块选择：乱数据会被规整，非法值与重复项都丢掉', () => {
  /*
   * 规整规则（按本人要求）：
   *   - 有合法项 → 原样用它（去重、去非法值），**不额外补学习**
   *   - 一个合法项都没有（含 null / 非数组 / 空数组 / 全非法）→ 回到保底「学习」
   */
  deepEq(logic.sanitizeNavModules(null), ['study'], 'null 回到保底学习');
  deepEq(logic.sanitizeNavModules('乱写'), ['study'], '非数组回到保底学习');
  deepEq(logic.sanitizeNavModules([]), ['study'], '空数组回到保底学习（不能让左侧栏空掉）');
  deepEq(logic.sanitizeNavModules(['general', 'home', 'today', 'settings']), ['study'],
    '全是非法值时回到保底学习');

  // 有合法项时：去重 + 丢非法值，保留传入顺序，不补学习
  deepEq(logic.sanitizeNavModules(['reading', 'dev', 'reading', '乱写', 'diet']),
    ['reading', 'dev', 'diet'], '去重、丢非法值，且不额外补学习');

  // 手改数据也要能救回来
  const n = logic.normalizeState({ settings: { navModules: 'not-an-array' } });
  deepEq(n.settings.navModules, ['study'], 'normalizeState 应把非法值换成保底学习');
  const n2 = logic.normalizeState({ settings: { navModules: ['fitness', 'fitness', 'dev'] } });
  deepEq(n2.settings.navModules, ['fitness', 'dev'], '去重，且不补学习');
});

test('左侧板块选择：至少要保留一个，全不勾则回到学习', () => {
  const s = fresh();

  eq(logic.toggleNavModule(s, 'fitness', false).includes('fitness'), false, '可以关掉健身');
  eq(logic.toggleNavModule(s, 'dev', false).includes('dev'), false, '可以关掉开发');

  /*
   * 规则（按本人要求）：
   *   - 一个都不勾 → 不允许，自动回到只显示「学习」
   *   - 勾了两个及以上 → **学习也可以取消**
   * 所以这里不再断言"学习永远在"，而是断言"至少有一个"。
   */
  const all = logic.setNavModules(s, []);
  deepEq(all, ['study'], '一个都不勾时应回到只显示学习');

  const only = logic.setNavModules(s, ['general', 'media']);
  deepEq(only, ['study'], '只剩非法值时也回到学习');

  // 勾了两个及以上：可以不带学习
  deepEq(logic.setNavModules(s, ['reading', 'diet']), ['reading', 'diet'],
    '勾两个以上时不该强行塞进学习');
  // 只勾一个，且不是学习 → 允许
  deepEq(logic.setNavModules(s, ['reading']), ['reading'], '只剩一个时也可以不是学习');

  // 只有一个板块时，把自己取消 → 回到学习
  const s2 = fresh();
  logic.setNavModules(s2, ['fitness']);
  deepEq(logic.setNavModules(s2, []), ['study'], '取消唯一一个后回到学习');

  // 任何配置下都必须至少有一项
  for (const input of [[], ['general'], ['reading'], ['reading', 'diet'], null, '乱写']) {
    ok(logic.sanitizeNavModules(input).length >= 1,
      '任何输入都至少要留一项：' + JSON.stringify(input));
  }
});

test('左侧板块选择：勾两个以上时学习可以被取消（回归）', () => {
  const s = fresh();

  // 之前这里会把学习强行补回来，导致"取消学习"在勾了两个时也不生效
  const two = logic.sanitizeNavModules(['reading', 'diet']);
  notOk(two.includes('study'), '勾了两个不该再自动补学习');

  const three = logic.sanitizeNavModules(['dev', 'reading', 'fitness']);
  deepEq(three, ['dev', 'reading', 'fitness'], '三个都不含学习时原样保留');

  // 界面上的开关语义也一样
  logic.setNavModules(s, ['dev', 'study', 'reading']);
  const off = logic.toggleNavModule(s, 'study', false);
  deepEq(off, ['dev', 'reading'], '此时取消学习应生效（还有两个）');

  // 取消到只剩学习时，再取消就回到学习（等于没变）
  logic.setNavModules(s, ['dev', 'study']);
  deepEq(logic.toggleNavModule(s, 'dev', false), ['study'], '取消到只剩学习');
  deepEq(logic.toggleNavModule(s, 'study', false), ['study'], '再取消学习 → 回到学习');
});

test('左侧栏配置：可见导航项的顺序与内容', () => {
  const s = fresh();

  // 默认
  deepEq(logic.visibleNavItems(s).map((x) => x.id),
    ['home', 'today', 'dev', 'study', 'reading', 'diet', 'fitness', 'settings'],
    '默认顺序');

  // 关掉两个
  logic.toggleNavModule(s, 'dev', false);
  logic.toggleNavModule(s, 'diet', false);
  deepEq(logic.visibleNavItems(s).map((x) => x.id),
    ['home', 'today', 'study', 'reading', 'fitness', 'settings'],
    '关掉开发与饮食后，骨架项仍在，其余按配置顺序');

  // 只留阅读 → 就只显示阅读（不再补学习）
  logic.setNavModules(s, ['reading']);
  deepEq(logic.visibleNavItems(s).map((x) => x.id),
    ['home', 'today', 'reading', 'settings'],
    '只留阅读时：中间只有阅读');

  // 每个可见项都要有名称与图标
  for (const item of logic.visibleNavItems(s)) {
    ok(item.name && item.icon, item.id + ' 应有名称与图标');
  }
});

test('左侧栏配置：隐藏的模块仍然可以访问（旧链接与标签跳转不能跳丢）', () => {
  const s = fresh();
  logic.setNavModules(s, ['reading']);

  const visible = logic.visibleNavItems(s).map((x) => x.id);
  notOk(visible.includes('fitness'), '健身确实被隐藏了');
  notOk(visible.includes('diet'), '饮食确实被隐藏了');

  /*
   * 关键：隐藏只是不显示在侧栏里，模块本身与路由都还在。
   * 否则点了任务上的「健身」标签、或用旧书签进健身页，会掉到首页去。
   */
  for (const id of ['dev', 'study', 'reading', 'diet', 'fitness']) {
    ok(logic.isModuleId(id), id + ' 仍应是合法模块（路由与任务归属都还在）');
    ok(logic.MODULE_IDS.includes(id), id + ' 仍在模块清单里');
  }
  eq(logic.moduleName('fitness'), '健身', '健身的中文名也还在');
});

test('左侧栏配置：上移/下移一位，边界不动', () => {
  const s = fresh();
  // 默认：dev, study, reading, diet, fitness

  deepEq(logic.moveNavModule(s, 'reading', -1), ['dev', 'reading', 'study', 'diet', 'fitness'],
    '阅读上移一位');
  deepEq(logic.moveNavModule(s, 'reading', 1), ['dev', 'study', 'reading', 'diet', 'fitness'],
    '再下移一位回到原位');

  // 边界：第一个再上移、最后一个再下移都不动
  deepEq(logic.moveNavModule(s, 'dev', -1), ['dev', 'study', 'reading', 'diet', 'fitness'],
    '第一个上移不动');
  deepEq(logic.moveNavModule(s, 'fitness', 1), ['dev', 'study', 'reading', 'diet', 'fitness'],
    '最后一个下移不动');
  deepEq(logic.moveNavModule(s, '不存在', 1), ['dev', 'study', 'reading', 'diet', 'fitness'],
    '不存在的模块不动');
  deepEq(logic.moveNavModule(s, 'dev', 0), ['dev', 'study', 'reading', 'diet', 'fitness'],
    '位移 0 不动');

  // 连续调整能拼出任意顺序：健身从最后一位往上挪三步 → 落到第二位
  logic.moveNavModule(s, 'fitness', -1);
  logic.moveNavModule(s, 'fitness', -1);
  logic.moveNavModule(s, 'fitness', -1);
  deepEq(logic.navModules(s), ['dev', 'fitness', 'study', 'reading', 'diet'],
    '上移三次应从第 5 位到第 2 位');

  // 再上移一次就到最前
  logic.moveNavModule(s, 'fitness', -1);
  deepEq(logic.navModules(s), ['fitness', 'dev', 'study', 'reading', 'diet'], '健身挪到最前');
  // 已经在最前，再上移不动
  logic.moveNavModule(s, 'fitness', -1);
  deepEq(logic.navModules(s)[0], 'fitness', '已是最前时上移不动');
});

test('左侧栏配置：勾选/取消勾选的开关语义', () => {
  const s = fresh();
  logic.setNavModules(s, ['dev', 'study']);

  deepEq(logic.toggleNavModule(s, 'reading', true), ['dev', 'study', 'reading'], '勾上阅读，追加在末尾');
  deepEq(logic.toggleNavModule(s, 'reading', true), ['dev', 'study', 'reading'], '重复勾选不产生重复项');
  deepEq(logic.toggleNavModule(s, 'dev', false), ['study', 'reading'], '取消开发');
  deepEq(logic.toggleNavModule(s, '不存在', true), ['study', 'reading'], '非法 id 不动');

  // 不传第三参时按"取反"处理
  deepEq(logic.toggleNavModule(s, 'dev'), ['study', 'reading', 'dev'], '不传值时取反（勾上）');
  deepEq(logic.toggleNavModule(s, 'dev'), ['study', 'reading'], '再点一次取消');
});

test('快速添加的模块与顺序 = 左侧栏勾选的内容与顺序', () => {
  const s = fresh();

  // 默认：五个模块，顺序一致
  deepEq(logic.quickAddModules(s).map((m) => m.id), logic.navModules(s),
    '默认时下拉与左侧栏一致');
  deepEq(logic.quickAddModules(s).map((m) => m.id),
    ['dev', 'study', 'reading', 'diet', 'fitness']);

  // 只留阅读与开发，并把阅读排前面
  logic.setNavModules(s, ['reading', 'dev']);
  deepEq(logic.quickAddModules(s).map((m) => m.id), ['reading', 'dev'],
    '下拉只含勾选的模块，且顺序一致');

  // 调顺序后下拉也变
  logic.moveNavModule(s, 'dev', -1);
  deepEq(logic.quickAddModules(s).map((m) => m.id), ['dev', 'reading'],
    '调顺序后下拉顺序跟着变');

  // 关掉健身 → 下拉里没有健身
  logic.toggleNavModule(s, 'fitness', false);
  notOk(logic.quickAddModules(s).some((m) => m.id === 'fitness'), '关掉的模块不该出现在下拉里');
  logic.toggleNavModule(s, 'fitness', true);
  ok(logic.quickAddModules(s).some((m) => m.id === 'fitness'), '勾上后应回来，且在末尾');

  // 「通用」永远不是可选项（它是兜底分类）
  for (const m of logic.quickAddModules(s)) {
    notEq(m.id, 'general', '下拉里不该出现"通用"');
  }

  // 不传 state 时按默认（兼容旧调用）
  deepEq(logic.quickAddModules().map((m) => m.id), ['dev', 'study', 'reading', 'diet', 'fitness']);
});

test('左侧栏配置：改完会随数据一起落盘与读回', () => {
  const s = fresh();
  logic.setNavModules(s, ['fitness', 'reading']);
  logic.moveNavModule(s, 'reading', -1);

  // 模拟"存盘再读回"
  const roundTrip = logic.normalizeState(JSON.parse(JSON.stringify(s)));
  deepEq(roundTrip.settings.navModules, ['reading', 'fitness'], '配置应原样读回');
  deepEq(logic.quickAddModules(roundTrip).map((m) => m.id), ['reading', 'fitness'],
    '读回后下拉顺序也一致');
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
  eq(logic.moduleLabel('dev'), '开发');
  eq(logic.moduleLabel('study'), '学习');
  eq(logic.moduleLabel('diet'), '饮食');
  eq(logic.moduleLabel('fitness'), '健身', '健身应有专属标签');
  eq(logic.moduleLabel('unknown'), '通用');
  // 仍然移除的模块应回落到通用
  eq(logic.moduleLabel('media'), '通用', '仍移除的模块不该有专属标签');
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
  logic.addTask(s, { title: 'D', module: 'diet', date: '2026-10-08' });

  const devPie = logic.chartSlices(s, 'dev', 'week', '2026-10-08');
  const byKey = {};
  for (const x of devPie) byKey[x.key] = x.value;
  eq(byKey.done, 1, '开发页应显示已完成 1');
  eq(byKey.pending, 1, '开发页应显示未完成 1');
  eq(devPie.length, 2, '模块页扇形图应只有两块');

  const allPie = logic.chartSlices(s, 'all', 'week', '2026-10-08');
  const modKeys = allPie.map((x) => x.key).sort();
  deepEq(modKeys, ['dev', 'diet', 'study'], '首页扇形图应按模块分布');
  const devSlice = allPie.find((x) => x.key === 'dev');
  eq(devSlice.label, '开发', '扇区应带中文模块名');
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

test('首页摘要：没有待处理事项时只可能剩健身提醒', () => {
  const s = fresh();
  const today = date.todayStr();
  // 满足摘要的触发条件：三餐已定（否则会提醒晚饭没定）
  for (const key of ['breakfast', 'lunch', 'dinner']) {
    logic.setMeal(s, today, key, { text: '已安排' });
  }

  /*
   * 健身加回来后，"一次都没练"也算一件待处理的事，所以这里不再必然是空数组。
   * 要验证的是：除健身之外没有别的提醒；把健身练够之后，摘要才真的为空。
   */
  const sum = logic.homeSummary(s, today);
  deepEq(sum.map((x) => x.key), ['fitness-week'], '此时只该剩健身提醒');

  logic.setFitnessWeeklyGoal(s, 1);
  logic.logWorkout(s, { date: today, type: '有氧', minutes: 30 });
  deepEq(logic.homeSummary(s, today), [], '健身也达标后，摘要应为空（整个区块隐藏）');
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

test('首页摘要：本周没练够时提醒去健身（模块已加回）', () => {
  const s = fresh();
  const today = date.todayStr();

  // 一次都没练 → 应提醒，并指向健身模块
  const sum = logic.homeSummary(s, today);
  const fit = sum.find((x) => x.key === 'fitness-week');
  ok(fit, '本周没练够时应有一条健身提醒');
  eq(fit.route, 'fitness', '提醒应指向健身模块');

  // 本周练够目标次数后就不该再提醒
  logic.setFitnessWeeklyGoal(s, 2);
  for (let i = 0; i < 2; i++) {
    logic.logWorkout(s, { date: date.addDays(today, -i), type: '胸 + 三头', minutes: 40 });
  }
  const after = logic.homeSummary(s, today);
  eq(after.some((x) => x.key === 'fitness-week'), false, '本周练够了就不该再提醒');
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
