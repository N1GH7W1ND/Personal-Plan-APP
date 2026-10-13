/**
 * 阶段 5 测试：七个功能模块
 * 端到端：真实服务 + 真实视图渲染 + 模拟点击。
 * 覆盖开发工作、学习、健身计划、饮食计划四个模块，以及"已移除模块"的收口检查。
 */

import { test, after, setFile, eq, deepEq, ok, notOk } from './run-frontend.mjs';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { installDom, findByAct, findByActAndId } from './lib/dom.mjs';

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, '..');
const PORT = Number(process.env.DSH_TEST_PORT || 41980);

const dataDir = mkdtempSync(join(tmpdir(), 'workbench-p5-'));

/* ---------------- 环境 ---------------- */

const shellHtml = readFileSync(join(ROOT, 'web', 'index.html'), 'utf8');
const dom = installDom(shellHtml);

const config = require(join(ROOT, 'server', 'config.js'));
config.DATA_DIR = dataDir;
config.DATA_FILE = join(dataDir, 'data.json');
config.BACKUP_DIR = join(dataDir, 'backups');
config.WEB_DIR = join(ROOT, 'web');

const storeModule = require(join(ROOT, 'server', 'store.js'));
storeModule.useDataDir(dataDir);
await storeModule.read();
const { createServer } = require(join(ROOT, 'server', 'index.js'));
const server = createServer();
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  if (typeof input === 'string' && input.startsWith('/')) {
    return realFetch('http://127.0.0.1:' + PORT + input, init);
  }
  return realFetch(input, init);
};

const app = await import('../web/app.js');
const store = await import('../web/store.js');
const logic = await import('../web/logic.js');
const date = await import('../web/date.js');
const router = await import('../web/router.js');
const ui = await import('../web/ui.js');

setFile('阶段5 功能模块');

const view = () => dom.document.getElementById('view');
const modal = () => dom.document.getElementById('modalLayer');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitRender(times) {
  const n = Math.max(1, times || 1);
  for (let i = 0; i < n; i++) await app.nextRender();
}

async function go(route) {
  dom.navigate(route);
  await waitRender();
  assertNoViewError();
}

/** 清空数据并从干净状态开始某个用例 */
async function reset() {
  await store.clearAll();
  ui.clearCalendarState(); // 日历的月份与选中日期也要复位，避免用例之间互相影响
  ui.clearChartState();    // 图表的时间范围与选中柱/扇区同理
  dom.navigate('home');
  await waitRender();
  assertNoViewError();
}

const viewErrors = [];
app.onError((err, where) => viewErrors.push({ where, message: err && err.message ? err.message : String(err) }));

function assertNoViewError() {
  if (viewErrors.length) {
    const first = viewErrors.shift();
    viewErrors.length = 0;
    throw new Error('视图异常（' + first.where + '）：' + first.message);
  }
}

/** 在弹窗里点某个动作 */
function pick(action, key) {
  const items = findByAct(modal(), action);
  if (key === undefined) return items[0] || null;
  return items.find((el) => el.getAttribute('data-key') === key) || null;
}

await app.init();

/* ============================================================
   开发工作（C4、C5）
   ============================================================ */

test('开发：点状态标签在四档之间循环（C4）', async () => {
  await reset();
  await go('dev');

  const input = view().querySelector('[data-field="dev-input"]');
  ok(input, '应有开发待办输入框');
  input.typeAndEnter('改登录接口 bug');
  await waitRender();

  const item = store.getState().devTasks[0];
  ok(item, '应新增开发待办');
  eq(item.status, 'todo', '默认未开始');

  // 未开始 → 开发中 → 联调测试 → 已上线 → 回到未开始
  for (const next of ['doing', 'testing', 'online', 'todo']) {
    const chip = findByActAndId(view(), 'dev-status', item.id);
    ok(chip, '应能找到状态标签（目标是 ' + next + '）');
    eq(chip.textContent, logic.DEV_STATUS[logic.findDevTask(store.getState(), item.id).status],
      '标签文字应与当前状态一致');
    chip.click();
    await waitRender();
    eq(logic.findDevTask(store.getState(), item.id).status, next, '应切到 ' + next);
  }

  ok(findByActAndId(view(), 'dev-status', item.id), '回到未开始后应能继续操作');
});

test('开发：灵感箱随手记，一条都不用选分类', async () => {
  await go('dev');
  const input = view().querySelector('[data-field="idea-input"]');
  ok(input, '应有灵感输入框');
  input.typeAndEnter('用 Redis 缓存首页数据');
  await waitRender();

  const ideas = store.getState().devIdeas;
  eq(ideas.length, 1, '应新增一条灵感');
  eq(ideas[0].text, '用 Redis 缓存首页数据');
  eq(ideas[0].handled, false, '默认待整理');
});

test('开发：灵感点「变成待办」后进入待办列表，灵感箱不再有它（C5）', async () => {
  await go('dev');
  const idea = store.getState().devIdeas[0];
  const devCountBefore = store.getState().devTasks.length;

  const btn = findByActAndId(view(), 'idea-to-task', idea.id);
  ok(btn, '应有变成待办按钮');
  btn.click();
  await waitRender();

  const state = store.getState();
  eq(state.devTasks.length, devCountBefore + 1, '待办应多一条');
  eq(state.devTasks[state.devTasks.length - 1].title, '用 Redis 缓存首页数据', '内容应来自灵感');
  eq(state.devIdeas.some((i) => i.id === idea.id), false, '灵感箱不应再有它');
  notOk(findByActAndId(view(), 'idea-to-task', idea.id), '界面上也不应再有这条灵感');
});

test('开发：灵感箱达到 3 条时首页摘要提醒', async () => {
  await go('dev');
  store.dispatch((s) => {
    logic.addDevIdea(s, '灵感甲');
    logic.addDevIdea(s, '灵感乙');
    logic.addDevIdea(s, '灵感丙');
  });
  await waitRender();

  await go('home');
  ok(view().innerHTML.includes('灵感箱堆积'), '首页应提醒灵感箱堆积');
});

test('开发：推送到今日生成开发任务', async () => {
  await go('dev');
  const item = store.getState().devTasks.find((d) => d.status !== 'online') || store.getState().devTasks[0];
  const push = findByActAndId(view(), 'dev-push', item.id);
  ok(push, '应有推送到今日按钮');
  push.click();
  await waitRender();

  const created = logic.tasksOn(store.getState(), date.todayStr()).find((t) => t.module === 'dev');
  ok(created, '应生成开发任务');
  eq(created.title, item.title, '任务标题应与待办一致');
});

/* ============================================================
   健身计划（C8–C11）
   ============================================================ */

/** 确保今天有训练日且有一个"组数 = 3"的动作，返回该动作（从最新数据里取） */
async function ensureTrainingExercise(name) {
  const today = date.todayStr();
  const weekday = date.weekdayNum(today);
  const routine = logic.todayRoutine(store.getState(), today);
  if (routine.rest || !routine.exercises.length) {
    store.dispatch((s) => logic.setRoutineDay(s, weekday, { rest: false, label: '测试训练' }));
    store.dispatch((s) => logic.addFitnessExercise(s, weekday, { name, sets: 3, reps: 12 }));
    await waitRender();
  }
  let list = logic.todayRoutine(store.getState(), today).exercises;
  let target = list.find((e) => e.sets === 3) || list[0];
  if (!target) {
    store.dispatch((s) => logic.addFitnessExercise(s, weekday, { name, sets: 3, reps: 12 }));
    await waitRender();
    list = logic.todayRoutine(store.getState(), today).exercises;
    target = list[0];
  }
  ok(target, '今天应有可打卡的动作');
  // 从最新数据里重新取一份，避免拿到旧引用
  return logic.todayRoutine(store.getState(), today).exercises.find((e) => e.id === target.id) || target;
}

test('健身：按周安排显示今天该练的部位（C8）', async () => {
  await reset();
  await go('fitness');
  const today = date.todayStr();
  const expected = logic.todayRoutine(store.getState(), today);

  ok(view().innerHTML.includes(expected.label), '应显示今天的部位：' + expected.label);

  const tomorrow = date.addDays(today, 1);
  eq(logic.todayRoutine(store.getState(), tomorrow).label,
    store.getState().fitness.routine[date.weekdayNum(tomorrow) - 1].label,
    '明天应取 routine 里对应位置');
});

test('健身：逐组打卡点一下亮一格（C9）', async () => {
  await reset();
  await go('fitness');
  const today = date.todayStr();
  const ex = await ensureTrainingExercise('卧推');

  const boxesOf = () => findByAct(view(), 'fit-set').filter((el) => el.getAttribute('data-ex') === ex.id);

  const boxes = boxesOf();
  eq(boxes.length, ex.sets, '应渲染出 ' + ex.sets + ' 个小方块');
  deepEq(boxes.map((b) => b.classList.contains('on')), new Array(ex.sets).fill(false), '初始都未点亮');

  // 点第一组：只有它亮
  boxes[0].click();
  await waitRender();
  const expected = new Array(ex.sets).fill(false);
  expected[0] = true;
  deepEq(logic.fitnessRecord(store.getState(), today).exercises[ex.id].doneSets, expected, '只点亮第一组');
  deepEq(boxesOf().map((b) => b.classList.contains('on')), expected, '界面上也应该只有第一格亮');

  // 点第三组：第一和第三亮
  boxesOf()[2].click();
  await waitRender();
  const expected2 = new Array(ex.sets).fill(false);
  expected2[0] = true;
  expected2[2] = true;
  deepEq(logic.fitnessRecord(store.getState(), today).exercises[ex.id].doneSets, expected2, '第一和第三组亮');

  // 再点第一组可取消
  boxesOf()[0].click();
  await waitRender();
  const expected3 = new Array(ex.sets).fill(false);
  expected3[2] = true;
  deepEq(logic.fitnessRecord(store.getState(), today).exercises[ex.id].doneSets, expected3, '再点应熄灭');
});

test('健身：完成整项一次点亮该项全部格子（C10）', async () => {
  await reset();
  await go('fitness');
  const today = date.todayStr();
  const ex = await ensureTrainingExercise('深蹲');

  const btnOf = () => findByAct(view(), 'fit-ex-done').find((el) => el.getAttribute('data-ex') === ex.id);
  ok(btnOf(), '应有完成整项按钮');
  btnOf().click();
  await waitRender();

  const entry = logic.fitnessRecord(store.getState(), today).exercises[ex.id];
  eq(entry.doneSets.every(Boolean), true, '该项所有组应点亮');
  eq(entry.doneSets.length, ex.sets, '数量应与组数一致');

  // 再点一次可整体取消，便于改错
  ok(btnOf(), '仍应有完成整项按钮');
  btnOf().click();
  await waitRender();
  eq(logic.fitnessRecord(store.getState(), today).exercises[ex.id].doneSets.every(Boolean), false, '再点应整体取消');
});

test('健身：整日打卡与本周概览天数一致（C11）', async () => {
  const today = date.todayStr();
  await go('fitness');

  const finish = findByAct(view(), 'fit-finish')[0];
  ok(finish, '应有打卡按钮');
  finish.click();
  await waitRender();

  eq(logic.fitnessRecord(store.getState(), today).finished, true, '今天应记为已练');
  eq(logic.fitnessWeekDoneCount(store.getState(), today), 1, '本周天数应为 1');
  ok(findByAct(view(), 'fit-unfinish')[0], '已打卡后应能取消打卡');

  const cell = findByAct(view(), 'fit-week-pick').find((el) => el.getAttribute('data-date') === today);
  ok(cell, '应能找到今天那格');
  eq(cell.classList.contains('done'), true, '今天那格应标为已练');
  ok(cell.textContent.includes('已练'), '文字应显示已练');

  findByAct(view(), 'fit-unfinish')[0].click();
  await waitRender();
  eq(logic.fitnessWeekDoneCount(store.getState(), today), 0, '取消后本周天数应回到 0');
});

test('健身：补记过去某天，本周概览跟着变', async () => {
  const today = date.todayStr();
  const week = date.weekDates(today);
  const todayIdx = date.weekdayNum(today) - 1;

  await go('fitness');

  if (todayIdx === 0) {
    // 今天就是周一，没有更早的日子可补记，用今天那格验证切换不报错
    const cell = findByAct(view(), 'fit-week-pick').find((el) => el.getAttribute('data-date') === today);
    cell.click();
    await waitRender();
    ok(logic.fitnessWeekDoneCount(store.getState(), today) >= 0, '切换应不报错');
    return;
  }

  const earlier = week[0];
  const cell = findByAct(view(), 'fit-week-pick').find((el) => el.getAttribute('data-date') === earlier);
  ok(cell, '应能找到本周更早的一天');
  cell.click();
  await waitRender();

  const rec = logic.fitnessRecord(store.getState(), earlier);
  ok(rec, '应为那天生成记录');
  eq(rec.finished, true, '应记为已练');
  eq(logic.fitnessWeekDoneCount(store.getState(), today), 1, '本周天数应 +1');
});

test('健身：打卡本身不是任务，推送到今日才生成任务（PRD 5.6）', async () => {
  await reset();
  await go('fitness');
  const today = date.todayStr();

  const finish = findByAct(view(), 'fit-finish')[0];
  if (finish) {
    finish.click();
    await waitRender();
  }
  eq(logic.tasksOn(store.getState(), today).length, 0, '打卡不应自动生成任务');

  const push = findByAct(view(), 'fit-push')[0];
  if (push) {
    push.click();
    await waitRender();
    ok(logic.tasksOn(store.getState(), today).find((t) => t.module === 'fitness'), '推送后应生成健身任务');
  }
});

/* ============================================================
   饮食计划（C12、C13）
   ============================================================ */

test('饮食：存菜谱，从菜谱选一餐，三餐已定变 3/3（C12）', async () => {
  await reset();
  await go('diet');
  const today = date.todayStr();

  findByAct(view(), 'recipe-new')[0].click();
  await waitRender();
  modal().querySelector('[data-field="name"]').value = '番茄牛腩';
  findByAct(modal(), 'save')[0].click();
  await sleep(20);
  await waitRender();
  eq(store.getState().diet.recipes.length, 1, '应存下一道菜');
  eq(logic.mealsPlannedCount(store.getState(), today), 0, '一开始三餐都没定');

  const pickBtn = findByAct(view(), 'meal-pick').find((el) => el.getAttribute('data-meal') === 'dinner');
  ok(pickBtn, '晚餐应有「从菜谱选」');
  pickBtn.click();
  await waitRender();
  pick('pick-recipe').click();
  await sleep(20);
  await waitRender();

  eq(logic.mealsOf(store.getState(), today).dinner.text, '番茄牛腩', '晚餐应设为这道菜');
  eq(logic.mealsPlannedCount(store.getState(), today), 1, '已定 1 餐');

  for (const meal of ['breakfast', 'lunch']) {
    const btn = findByAct(view(), 'meal-set').find((el) => el.getAttribute('data-meal') === meal);
    btn.click();
    await waitRender();
    modal().querySelector('[data-field="value"]').value = meal === 'breakfast' ? '燕麦鸡蛋' : '鸡胸西兰花';
    findByAct(modal(), 'yes')[0].click();
    await sleep(20);
    await waitRender();
  }

  eq(logic.mealsPlannedCount(store.getState(), today), 3, '应显示三餐已定 3/3');
  ok(view().innerHTML.includes('已定 3/3'), '界面概况应是 3/3');
});

test('饮食：勾「已吃」与三餐分离', async () => {
  await go('diet');
  const today = date.todayStr();
  const box = findByAct(view(), 'meal-eaten').find((el) => el.getAttribute('data-meal') === 'breakfast');
  ok(box, '应能找到早餐的已吃勾选框');
  box.click();
  await waitRender();
  eq(logic.mealsOf(store.getState(), today).breakfast.eaten, true, '应标记已吃');
  eq(logic.mealsPlannedCount(store.getState(), today), 3, '已吃不应改变"已定"数量');
});

test('饮食：菜谱安排到今天会写进对应那一餐', async () => {
  await go('diet');
  const today = date.todayStr();
  const recipe = store.getState().diet.recipes[0];

  const planBtn = findByActAndId(view(), 'recipe-plan', recipe.id);
  ok(planBtn, '应有安排到今天按钮');
  planBtn.click();
  await waitRender();

  const lunchItem = findByAct(modal(), 'plan-meal').find((el) => el.getAttribute('data-meal') === 'lunch');
  ok(lunchItem, '应能选择哪一餐');
  lunchItem.click();
  await sleep(20);
  await waitRender();

  eq(logic.mealsOf(store.getState(), today).lunch.text, recipe.name, '午餐应被替换为这道菜');
});

test('饮食：采买清单可勾选，清空已买只删已勾选项（C13）', async () => {
  await go('diet');
  const input = view().querySelector('[data-field="shop-input"]');
  ok(input, '应有采买输入框');
  input.typeAndEnter('牛腩');
  await waitRender();
  input.typeAndEnter('西兰花');
  await waitRender();
  input.typeAndEnter('番茄');
  await waitRender();
  eq(store.getState().diet.shopping.length, 3, '应有 3 项');

  const items = () => store.getState().diet.shopping;
  for (const target of [items()[0], items()[1]]) {
    const box = findByActAndId(view(), 'shop-toggle', target.id);
    ok(box, '应能找到勾选框');
    box.click();
    await waitRender();
  }
  eq(items().filter((s) => s.bought).length, 2, '应勾中 2 项');

  findByAct(view(), 'shop-clear')[0].click();
  await waitRender();
  findByAct(modal(), 'yes')[0].click();
  await sleep(20);
  await waitRender();

  const left = store.getState().diet.shopping;
  eq(left.length, 1, '应只剩未勾选的那一项');
  eq(left[0].name, '番茄', '剩下的应是没勾的那项');
});

/* ============================================================
   学习
   ============================================================ */

test('学习：页面能打开，空状态有引导文案，概况从 0 开始', async () => {
  await reset();
  await go('study');

  const html = view().innerHTML;
  ok(html.includes('学习'), '应显示学习页标题');
  ok(html.includes('还没有学习内容'), '空清单应有引导文案');
  ok(html.includes('累计 0 分钟'), '累计时长应从 0 开始');
  ok(view().querySelector('[data-field="study-input"]'), '应有快速输入框');
});

test('学习：输入框回车即存，默认未开始、类型为阅读', async () => {
  await go('study');
  const input = view().querySelector('[data-field="study-input"]');
  ok(input, '应有输入框');
  input.typeAndEnter('看完 JavaScript 事件循环');
  await waitRender();

  const items = store.getState().studyItems;
  eq(items.length, 1, '应新增一条学习内容');
  eq(items[0].title, '看完 JavaScript 事件循环');
  eq(items[0].status, 'todo', '默认未开始');
  eq(items[0].kind, 'read', '默认阅读');
  eq(input.value, '', '提交后输入框应清空');
});

test('学习：点详情标签保存类型与进度', async () => {
  await go('study');
  const item = store.getState().studyItems[0];

  const openBtn = findByActAndId(view(), 'study-edit', item.id);
  ok(openBtn, '应能点开详情');
  openBtn.click();
  await waitRender();

  modal().querySelector('[data-field="kind"]').value = 'course';
  modal().querySelector('[data-field="minutes"]').value = '45';
  modal().querySelector('[data-field="source"]').value = '某课程';
  findByAct(modal(), 'save')[0].click();
  await sleep(20);
  await waitRender();

  const saved = logic.findStudyItem(store.getState(), item.id);
  eq(saved.kind, 'course', '类型应保存');
  eq(saved.minutes, 45, '时长应保存');
  eq(saved.source, '某课程', '出处应保存');
  ok(!modal().querySelector('[data-field="kind"]'), '保存后弹窗应关闭');
});

test('学习：点状态标签在三档之间循环', async () => {
  await go('study');
  const item = store.getState().studyItems[0];
  eq(item.status, 'todo', '起点应是未开始');

  for (const next of ['doing', 'done', 'todo']) {
    const chip = findByActAndId(view(), 'study-status', item.id);
    ok(chip, '应能找到状态标签（目标是 ' + next + '）');
    chip.click();
    await waitRender();
    eq(logic.findStudyItem(store.getState(), item.id).status, next, '应切到 ' + next);
  }
});

test('学习：推送到今日会生成归属学习的今日任务', async () => {
  await go('study');
  const item = store.getState().studyItems[0];

  // 先加 45 分钟，验证概况联动
  store.dispatch((s) => logic.updateStudyItem(s, item.id, { minutes: 45, status: 'done' }));
  await waitRender();
  ok(view().innerHTML.includes('累计 45 分钟'), '概况应显示累计 45 分钟');
  ok(view().innerHTML.includes('已学完 1'), '概况应显示已学完 1 条');

  const push = findByActAndId(view(), 'study-push', item.id);
  ok(push, '应有推送到今日按钮');
  push.click();
  await waitRender();

  const created = logic.tasksOn(store.getState(), date.todayStr()).find((t) => t.module === 'study');
  ok(created, '应生成学习任务');
  eq(created.title, item.title, '任务标题应与内容一致');

  await go('home');
  ok(view().innerHTML.includes(item.title), '学习任务应出现在首页今日计划');
});

test('学习：删除后 5 秒内可撤销', async () => {
  await go('study');
  const item = store.getState().studyItems[0];
  const before = store.getState().studyItems.length;

  findByActAndId(view(), 'study-menu', item.id).click();
  await waitRender();
  const delItem = findByAct(modal(), 'menu-pick').find((el) => el.getAttribute('data-key') === 'delete');
  ok(delItem, '菜单里应有删除项');
  delItem.click();
  await waitRender();

  eq(store.getState().studyItems.length, before - 1, '应删除一条');
  eq(store.getStatus().canUndo, true, '应可撤销');

  const undoBtn = dom.document.getElementById('toastLayer').querySelector('.toast-action');
  ok(undoBtn, '应出现撤销按钮');
  undoBtn.click();
  await waitRender();

  eq(store.getState().studyItems.length, before, '撤销后应恢复');
  ok(store.getState().studyItems.some((s) => s.id === item.id), '恢复的应是同一条');
});

test('学习：统计条数纳入设置页，且累计时长正确', async () => {
  await go('settings');
  const state = store.getState();
  const html = view().innerHTML;
  ok(html.includes('学习条目'), '设置页应显示学习条目统计');
  ok(html.includes(String(state.studyItems.length)), '应显示学习条目数');
  ok(html.includes('累计学习(分钟)'), '应显示累计学习时长');
});

test('已移除的模块：导航里进不去，旧路由会回落首页', async () => {
  for (const gone of ['media', 'consult', 'games']) {
    eq(router.ROUTES.includes(gone), false, '路由表里不应再有 ' + gone);
    eq(dom.document.querySelector('.nav-item[data-route="' + gone + '"]'), null,
      '侧栏不应再有 ' + gone + ' 入口');
    // 手输旧地址时应安全回落到首页，而不是白屏
    eq(router.routeFromHash('#/' + gone), 'home', '旧路由 ' + gone + ' 应回落到首页');
  }

  await go('media');
  ok(view().innerHTML.length > 0, '打开旧路由不应白屏');
  ok(view().innerHTML.includes('今日计划'), '应渲染首页内容');
});

test('每个模块都有日历：开发/学习/健身/饮食/今日计划', async () => {
  const pages = [
    { route: 'dev', title: '开发日历' },
    { route: 'study', title: '学习日历' },
    { route: 'fitness', title: '训练日历' },
    { route: 'diet', title: '饮食日历' },
    { route: 'today', title: '任务日历' },
  ];

  for (const p of pages) {
    await go(p.route);
    const html = view().innerHTML;
    ok(html.includes(p.title), p.route + ' 页应有「' + p.title + '」');
    ok(html.includes('cal-grid'), p.route + ' 页应有日历网格');
    ok(html.includes('cal-pick'), p.route + ' 页的日期应可点击');
    eq(findByAct(view(), 'cal-prev').length, 1, p.route + ' 应有上一月按钮');
    eq(findByAct(view(), 'cal-next').length, 1, p.route + ' 应有下一月按钮');
    eq(findByAct(view(), 'cal-today').length, 1, p.route + ' 应有回到本月按钮');
  }
});

test('日历：日期格显示当月天数与星期表头（以 2026-10 为例）', async () => {
  await reset();
  await go('today');

  // 用"下一月/上一月"按钮走到 2026 年 10 月
  let guard = 0;
  while (guard++ < 40) {
    const cur = ui.currentCalMonth('all', date.todayStr());
    if (cur.year === 2026 && cur.month === 10) break;
    const forward = (cur.year * 12 + cur.month) < (2026 * 12 + 10);
    const btn = findByAct(view(), forward ? 'cal-next' : 'cal-prev')[0];
    btn.click();
    await waitRender();
  }
  const cur2 = ui.currentCalMonth('all', date.todayStr());
  eq(cur2.year, 2026, '应走到 2026 年');
  eq(cur2.month, 10, '应走到 10 月');
  ok(view().innerHTML.includes('2026年10月'), '应显示月份标题');

  const cells = view().querySelectorAll('.cal-cell');
  const blanks = cells.filter((c) => c.classList.contains('blank'));
  eq(blanks.length, 3, '10 月 1 日是周四，前面应有 3 个空白格');

  const days = cells.filter((c) => !c.classList.contains('blank'));
  eq(days.length, 31, '10 月应有 31 个日期格');

  const weekHead = view().querySelector('.cal-head');
  ok(weekHead, '应有星期表头容器');
  eq(weekHead.querySelectorAll('div').length, 7, '星期表头应有 7 个格子');
  ok(weekHead.textContent.includes('一'), '应有"一"');
  ok(weekHead.textContent.includes('日'), '应有"日"');
});

test('日历：点某天会展开那天的明细，再点收起', async () => {
  await reset();
  const today = date.todayStr();
  store.dispatch((s) => logic.addTask(s, { title: '日历里的任务', module: 'dev', date: today }));
  await go('dev');
  await waitRender();

  // 用日历自己的明细面板是否存在来判断展开状态
  // （页面别处也会显示这条任务，不能拿整页文本判断）
  notOk(view().querySelector('[data-panel]'), '未选日期时不应有明细面板');

  const cellOf = () => findByAct(view(), 'cal-pick').find((el) => el.getAttribute('data-day') === today);
  ok(cellOf(), '应能找到今天那一格');
  eq(cellOf().classList.contains('has'), true, '有内容的日子应带上标记类');
  cellOf().click();
  await waitRender();

  eq(cellOf().classList.contains('selected'), true, '应标记为选中');
  const panel = view().querySelector('[data-panel]');
  ok(panel, '应展开那天的明细面板');
  eq(panel.getAttribute('data-panel'), today, '面板应对应选中的日期');
  ok(panel.textContent.includes('日历里的任务'), '面板里应列出那天的任务');

  cellOf().click();
  await waitRender();
  notOk(view().querySelector('[data-panel]'), '再点应收起明细面板');
});

test('日历：各模块月份互不干扰，且能一键回到本月', async () => {
  await reset();
  const today = date.todayStr();
  const now = date.parseDateStr(today);
  const nextMonth = now.getMonth() + 1 === 12 ? 1 : now.getMonth() + 2;

  await go('dev');
  findByAct(view(), 'cal-next')[0].click();
  await waitRender();
  eq(ui.currentCalMonth('dev', today).month, nextMonth, 'dev 日历应翻到下一个月');

  await go('study');
  eq(ui.currentCalMonth('study', today).month, now.getMonth() + 1, '学习日历应仍是本月（各模块独立）');

  await go('dev');
  findByAct(view(), 'cal-today')[0].click();
  await waitRender();
  eq(ui.currentCalMonth('dev', today).month, now.getMonth() + 1, '应一键回到本月');
});

test('每个模块都有统计图表，且首页是汇总', async () => {
  const pages = [
    { route: 'dev', title: '开发统计', pie: '完成占比' },
    { route: 'study', title: '学习统计', pie: '完成占比' },
    { route: 'fitness', title: '健身统计', pie: '完成占比' },
    { route: 'diet', title: '饮食统计', pie: '完成占比' },
    { route: 'home', title: '各模块汇总', pie: '任务分布（按模块）' },
  ];

  for (const p of pages) {
    await go(p.route);
    const html = view().innerHTML;
    ok(html.includes(p.title), p.route + ' 页应有「' + p.title + '」');
    ok(html.includes('bar-chart'), p.route + ' 页应有柱形图');
    ok(html.includes('<svg'), p.route + ' 页应有扇形图（SVG）');
    ok(html.includes(p.pie), p.route + ' 页的扇形图标题应是「' + p.pie + '」');
    eq(findByAct(view(), 'chart-range').length, 4, p.route + ' 页应有 4 个时间范围可选');
    eq(findByAct(view(), 'chart-bucket').length > 0, true, p.route + ' 页的柱子应可点击');
  }
});

test('图表：空数据时结构仍然完整（不塌成空白）', async () => {
  await reset();
  for (const route of ['dev', 'home']) {
    await go(route);
    const html = view().innerHTML;
    ok(html.includes('<svg'), route + ' 页空数据时也应渲染扇形图骨架');
    ok(html.includes('bar-chart'), route + ' 页空数据时也应渲染柱形图骨架');
    ok(html.includes('这个时间段还没有数据'), route + ' 页应有空状态文案');
    eq(findByAct(view(), 'chart-range').length, 4, route + ' 页时间范围仍可切换');
  }
});

test('图表：切时间范围会改变柱子数量（本周 7 根 → 本月整月）', async () => {
  await reset();
  await go('dev');

  const rangeBtn = (key) => findByAct(view(), 'chart-range').find((el) => el.getAttribute('data-range') === key);

  // 默认是本周 → 7 根柱子
  eq(findByAct(view(), 'chart-bucket').length, 7, '默认本周应有 7 根柱子');
  eq(rangeBtn('week').classList.contains('active'), true, '"本周"应处于选中态');

  // 切到本月
  rangeBtn('month').click();
  await waitRender();
  const daysInMonth = new Date(date.parseDateStr(date.todayStr()).getFullYear(),
    date.parseDateStr(date.todayStr()).getMonth() + 1, 0).getDate();
  eq(findByAct(view(), 'chart-bucket').length, daysInMonth, '本月应显示当月每一天');
  eq(rangeBtn('month').classList.contains('active'), true, '"本月"应变成选中态');
  eq(rangeBtn('week').classList.contains('active'), false, '"本周"应取消选中');

  // 切到今年（没有数据时柱子为 0，不应报错）
  rangeBtn('year').click();
  await waitRender();
  eq(findByAct(view(), 'chart-bucket').length, 0, '今年没有数据时没有柱子');
  ok(view().innerHTML.includes('这个时间段还没有数据'), '应给出空状态提示');

  // 切到全部再回本周
  rangeBtn('all').click();
  await waitRender();
  rangeBtn('week').click();
  await waitRender();
  eq(findByAct(view(), 'chart-bucket').length, 7, '切回本周应恢复 7 根柱子');
});

test('图表：点柱子展开那一段的具体内容', async () => {
  await reset();
  const today = date.todayStr();
  const week = date.startOfWeek(today);

  store.dispatch((s) => {
    logic.addTask(s, { title: '周一未完成', module: 'dev', date: week });
    logic.addTask(s, { title: '周一已完成', module: 'dev', date: week, done: true });
    logic.addTask(s, { title: '今天的事', module: 'dev', date: today });
  });
  await go('dev');
  await waitRender();

  const panelText = () => {
    const el = view().querySelector('.chart-detail');
    return el ? el.textContent : '';
  };

  // 未选中时明细是整个范围
  ok(panelText().includes('共 3 条'), '未选中时应显示整个范围的条数');

  // 点周一的柱子
  findByAct(view(), 'chart-bucket').find((el) => el.getAttribute('data-key') === week).click();
  await waitRender();
  ok(panelText().includes('这一段的 2 条'), '点柱子后应只显示那一段的条数');
  ok(panelText().includes('周一未完成') && panelText().includes('周一已完成'), '应列出那天的两条');
  notOk(panelText().includes('今天的事'), '不应出现别的日期的任务');

  // 点「看全部」清掉选择
  findByAct(view(), 'chart-clear')[0].click();
  await waitRender();
  ok(panelText().includes('共 3 条'), '点看全部后应恢复整个范围');
});

test('图表：点扇区/图例按完成情况筛明细（模块页扇形图是完成/未完成）', async () => {
  await reset();
  const today = date.todayStr();

  // 同时造"已完成"和"未完成"，扇形图才会有两块
  store.dispatch((s) => {
    logic.addTask(s, { title: '做完了的', module: 'dev', date: today, done: true });
    logic.addTask(s, { title: '还没做的', module: 'dev', date: today });
  });
  await go('dev');
  await waitRender();

  const panelText = () => (view().querySelector('.chart-detail') || { textContent: '' }).textContent;
  const sliceOf = (key) => findByAct(view(), 'chart-slice')
    .find((el) => el.tagName === 'PATH' && el.getAttribute('data-key') === key);

  ok(sliceOf('done'), '应有"已完成"扇区');
  ok(sliceOf('pending'), '应有"未完成"扇区');
  ok(panelText().includes('做完了的') && panelText().includes('还没做的'), '未筛前两条都应显示');

  // 点"已完成"扇区
  sliceOf('done').click();
  await waitRender();
  ok(panelText().includes('做完了的'), '点已完成扇区后应留下已完成那条');
  notOk(panelText().includes('还没做的'), '未完成的那条应被筛掉');

  // 点"未完成"扇区
  sliceOf('pending').click();
  await waitRender();
  ok(panelText().includes('还没做的'), '点未完成扇区后应留下未完成那条');
  notOk(panelText().includes('做完了的'), '已完成的那条应被筛掉');
});

test('图表：首页汇总点图例里的模块名会跳到该模块', async () => {
  await reset();
  // 造两个模块的数据，扇形图才会分成多块
  store.dispatch((s) => {
    logic.addTask(s, { title: '学习任务', module: 'study', date: date.todayStr() });
    logic.addTask(s, { title: '开发任务', module: 'dev', date: date.todayStr() });
  });
  await go('home');
  await waitRender();

  const legendOf = (key) => findByAct(view(), 'chart-slice')
    .find((el) => el.getAttribute('data-kind') === 'module' && el.getAttribute('data-key') === key);

  ok(legendOf('study'), '汇总图例里应有学习模块');
  ok(legendOf('dev'), '汇总图例里应有开发模块');
  legendOf('study').click();
  await waitRender();

  eq(router.currentRoute(), 'study', '点模块名应跳到该模块');
  ok(view().innerHTML.includes('学习清单'), '应渲染学习页内容');
});

test('图表：首页汇总点扇区只筛明细，不跳转', async () => {
  await reset();
  store.dispatch((s) => {
    logic.addTask(s, { title: '学习任务', module: 'study', date: date.todayStr() });
    logic.addTask(s, { title: '开发任务', module: 'dev', date: date.todayStr() });
  });
  await go('home');
  await waitRender();

  const path = findByAct(view(), 'chart-slice')
    .find((el) => el.tagName === 'PATH' && el.getAttribute('data-key') === 'study');
  ok(path, '应有学习模块的扇区');
  path.click();
  await waitRender();

  eq(router.currentRoute(), 'home', '点扇区应留在首页（只有点图例里的模块名才跳转）');
  const panel = view().querySelector('.chart-detail').textContent;
  ok(panel.includes('学习任务'), '应筛出该模块的任务');
  notOk(panel.includes('开发任务'), '别的模块的任务应被筛掉');
});

test('图表：首页汇总按模块分布，且时间范围切换生效', async () => {
  await reset();
  const today = date.todayStr();
  store.dispatch((s) => {
    logic.addTask(s, { title: '开发1', module: 'dev', date: today });
    logic.addTask(s, { title: '学习1', module: 'study', date: today });
    logic.addTask(s, { title: '健身1', module: 'fitness', date: today });
  });
  await go('home');
  await waitRender();

  const sliceKeys = findByAct(view(), 'chart-slice').map((el) => el.getAttribute('data-key'));
  for (const id of ['dev', 'study', 'fitness']) {
    ok(sliceKeys.includes(id), '汇总图应包含模块 ' + id);
  }
  ok(view().innerHTML.includes('共 <b>3</b> 条'), '应统计到 3 条');

  // 切到"全部"仍然统计到（今天在全部范围内）
  findByAct(view(), 'chart-range').find((el) => el.getAttribute('data-range') === 'all').click();
  await waitRender();
  ok(view().innerHTML.includes('共 <b>3</b> 条'), '切到全部后条数不变');
});

/* ============================================================
   收尾
   ============================================================ */

after(async () => {
  try {
    await store.flushNow();
  } catch { /* 忽略 */ }
  app.stop();
  await new Promise((resolve) => {
    try { server.close(resolve); } catch { resolve(); }
    setTimeout(resolve, 1200);
  });
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  dom.uninstall();
  await sleep(50);
});
