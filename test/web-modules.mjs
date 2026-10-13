/**
 * 阶段 5 测试：七个功能模块
 * 端到端：真实服务 + 真实视图渲染 + 模拟点击，逐条验证 PRD 第 10.3 节的 C1–C15。
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
   自媒体（C1–C3、E4）
   ============================================================ */

test('自媒体：新增选题落在选题池（C1 起点）', async () => {
  await reset();
  await go('media');

  const btn = findByAct(view(), 'media-new')[0];
  ok(btn, '应有「新选题」按钮');
  btn.click();
  await waitRender();

  const input = modal().querySelector('[data-field="value"]');
  ok(input, '应弹出输入框');
  input.value = '3 个提升效率的本地工具';
  findByAct(modal(), 'yes')[0].click();
  await sleep(20);
  await waitRender();

  const media = store.getState().media;
  eq(media.length, 1, '应新增一条内容');
  eq(media[0].status, 'idea', '应落在选题池');
  eq(media[0].title, '3 个提升效率的本地工具');
});

test('自媒体：箭头逐列推进，一次点击只进一档（C1）', async () => {
  // 从确定的起点开始（本文件各用例共用一个进程）
  const first = store.getState().media[0];
  store.dispatch((s) => logic.updateMedia(s, first.id, { status: 'idea' }));
  await go('media');

  const item = store.getState().media[0];
  eq(item.status, 'idea', '起点应是选题池');
  const arrow = (dir) => findByAct(view(), 'media-move')
    .find((el) => el.getAttribute('data-id') === item.id && Number(el.getAttribute('data-dir')) === dir) || null;

  // 第一列：后退箭头存在但被禁用
  const prev = arrow(-1);
  ok(prev, '应渲染后退按钮');
  eq(prev.getAttribute('disabled') !== null, true, '第一列的后退按钮应禁用');

  // 逐列推进，每点一次必须只前进一档
  for (const expect of ['writing', 'ready', 'published']) {
    const next = arrow(1);
    ok(next, '应有前进按钮（目标 ' + expect + '）');
    eq(next.getAttribute('disabled'), null, '前进按钮应可用');

    const changesBefore = store.getStatus().changeCount;
    next.click();
    const changes = store.getStatus().changeCount - changesBefore;
    const after = logic.findMedia(store.getState(), item.id).status;

    eq(changes, 1, '一次点击应只发生一次改动（实际 ' + changes + '）');
    eq(after, expect, '一次点击应只前进一档（实际 ' + after + '）');
    await waitRender();
  }

  // 最后一列：前进箭头存在但被禁用
  const lastNext = arrow(1);
  ok(lastNext, '最后一列应仍渲染前进按钮');
  eq(lastNext.getAttribute('disabled') !== null, true, '最后一列的前进按钮应禁用');

  const cols = view().querySelectorAll('.board-col');
  eq(cols.length, 4, '应有四列');
  ok(cols[3].textContent.includes(item.title), '应出现在最后一列（已发布）');
});

test('自媒体：看板不支持拖拽（C2）', async () => {
  await go('media');
  const html = view().innerHTML;
  notOk(/draggable/i.test(html), '看板不应有 draggable 属性');
  notOk(/dragstart|dragover|ondrop/i.test(html), '看板不应绑定拖拽事件');
  const source = readFileSync(join(ROOT, 'web', 'views', 'media.js'), 'utf8');
  notOk(/draggable|dragstart|dragover|dragend/.test(source), '自媒体视图源码里不应出现拖拽实现');
});

test('自媒体：排期日历按发布日期打点，点某天看当天要发什么（C3）', async () => {
  await go('media');
  const item = store.getState().media[0];
  const today = date.todayStr();

  const menuBtn = findByActAndId(view(), 'media-menu', item.id);
  ok(menuBtn, '应能找到更多操作');
  menuBtn.click();
  await waitRender();
  pick('menu-pick', 'schedule').click();
  await waitRender();

  const dateInput = modal().querySelector('[data-field="date"]');
  ok(dateInput, '应弹出日期选择');
  dateInput.value = today;
  findByAct(modal(), 'save')[0].click();
  await sleep(20);
  await waitRender();

  eq(logic.findMedia(store.getState(), item.id).plannedDate, today, '应记录计划发布日期');

  const cell = findByAct(view(), 'cal-pick').find((el) => el.getAttribute('data-date') === today);
  ok(cell, '日历上应能找到今天');
  eq(cell.querySelectorAll('.cal-mark').length, 1, '今天应有一个发布标记');
  eq(cell.querySelector('.cal-count').textContent, '1', '应显示当天条数');

  cell.click();
  await waitRender();
  ok(view().innerHTML.includes('要发的内容'), '应展开当天详情');
  ok(view().innerHTML.includes(item.title), '应列出这条内容');
});

test('自媒体：待发布内容会出现在首页摘要（E4）', async () => {
  await go('media');
  const item = store.getState().media[0];
  store.dispatch((s) => logic.updateMedia(s, item.id, { status: 'ready' }));
  await waitRender();

  await go('home');
  const html = view().innerHTML;
  ok(html.includes('待你处理'), '首页应出现待你处理区块');
  ok(html.includes('待发布'), '应提示有内容待发布');
});

test('自媒体：推送到今日会生成一条归属自媒体的今日任务', async () => {
  await go('media');
  const item = store.getState().media[0];
  const push = findByActAndId(view(), 'media-push', item.id);
  ok(push, '应有推送到今日按钮');
  push.click();
  await waitRender();

  const created = logic.tasksOn(store.getState(), date.todayStr()).find((t) => t.module === 'media');
  ok(created, '应生成自媒体任务');
  ok(created.title.includes(item.title), '任务内容应带上内容标题');
});

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
   咨询工作（C6、C7）
   ============================================================ */

test('咨询：新增沟通记录（含待办与回访日）', async () => {
  await reset();
  await go('consult');

  const addBtn = findByAct(view(), 'rec-new')[0];
  ok(addBtn, '应有加记录按钮');
  addBtn.click();
  await waitRender();

  const today = date.todayStr();
  modal().querySelector('[data-field="who"]').value = '王总';
  modal().querySelector('[data-field="summary"]').value = '预算压到 8 万，要分两期';
  modal().querySelector('[data-field="todo"]').value = '出分期报价单';
  modal().querySelector('[data-field="nextDate"]').value = today;
  findByAct(modal(), 'save')[0].click();
  await sleep(20);
  await waitRender();

  const recs = store.getState().consultRecords;
  eq(recs.length, 1, '应新增一条记录');
  eq(recs[0].who, '王总');
  eq(recs[0].todo, '出分期报价单');
  eq(recs[0].nextDate, today);
});

test('咨询：记录里的待办点「提取为任务」生成咨询待办（C6）', async () => {
  await go('consult');
  const rec = store.getState().consultRecords[0];
  const before = store.getState().consultTasks.length;

  const btn = findByActAndId(view(), 'rec-extract', rec.id);
  ok(btn, '应有提取为任务按钮');
  btn.click();
  await waitRender();

  const state = store.getState();
  eq(state.consultTasks.length, before + 1, '应生成咨询待办');
  eq(state.consultTasks[state.consultTasks.length - 1].title, '出分期报价单', '内容应来自记录');
  eq(logic.findConsultRecord(state, rec.id).todo, '', '记录里的待办应被清空，避免重复提取');
});

test('咨询：回访日点「加进计划」排进那天的今日计划（C7）', async () => {
  const today = date.todayStr();
  await go('consult');
  const rec = store.getState().consultRecords[0];

  const btn = findByActAndId(view(), 'rec-plan', rec.id);
  ok(btn, '应有加进计划按钮');
  btn.click();
  await waitRender();

  const planned = logic.tasksOn(store.getState(), today)
    .find((t) => t.module === 'consult' && t.title.includes('回访'));
  ok(planned, '应生成一条回访任务');
  ok(planned.title.includes('王总'), '任务应带上沟通对象');

  await go('home');
  ok(view().innerHTML.includes('回访'), '回访任务应出现在首页今日计划');
});

test('咨询：待办可勾选完成，并可推送到今日', async () => {
  await go('consult');
  const item = store.getState().consultTasks[0];
  ok(item, '应有咨询待办');

  const box = findByActAndId(view(), 'consult-toggle', item.id);
  ok(box, '应能找到勾选框');
  box.click();
  await waitRender();
  eq(logic.findConsultTask(store.getState(), item.id).done, true, '应标记完成');

  box.click();
  await waitRender();
  eq(logic.findConsultTask(store.getState(), item.id).done, false, '可取消完成');

  const push = findByActAndId(view(), 'consult-push', item.id);
  ok(push, '应有推送到今日');
  push.click();
  await waitRender();
  ok(logic.tasksOn(store.getState(), date.todayStr())
    .some((t) => t.module === 'consult' && t.title === item.title), '应生成咨询任务');
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
   游戏娱乐（C14、C15）
   ============================================================ */

test('游戏：新增游戏落在想玩', async () => {
  await reset();
  await go('games');

  findByAct(view(), 'game-new')[0].click();
  await waitRender();
  modal().querySelector('[data-field="name"]').value = '塞尔达';
  modal().querySelector('[data-field="platform"]').value = 'Switch';
  findByAct(modal(), 'save')[0].click();
  await sleep(20);
  await waitRender();

  const games = store.getState().games;
  eq(games.length, 1, '应新增游戏');
  eq(games[0].status, 'wish', '默认落在想玩');
  eq(games[0].platform, 'Switch');
});

test('游戏：开始玩 → 通关 在三列之间移动（C14）', async () => {
  await go('games');
  const game = store.getState().games[0];

  const start = findByActAndId(view(), 'game-start', game.id);
  ok(start, '应有开始玩按钮');
  start.click();
  await waitRender();
  eq(logic.findGame(store.getState(), game.id).status, 'playing', '应进入在玩');

  const clear = findByActAndId(view(), 'game-clear', game.id);
  ok(clear, '应有通关按钮');
  clear.click();
  await waitRender();
  eq(logic.findGame(store.getState(), game.id).status, 'cleared', '应进入已通关');

  const cols = view().querySelectorAll('.board-col');
  ok(cols.length >= 3, '应有三列');
  ok(cols[cols.length - 1].textContent.includes(game.name), '已通关列里应有它');

  const again = findByActAndId(view(), 'game-start', game.id);
  ok(again, '已通关后应能重新在玩');
  again.click();
  await waitRender();
  eq(logic.findGame(store.getState(), game.id).status, 'playing', '应回到在玩');
});

test('游戏：安排今天放松生成今日任务（C15）', async () => {
  await go('games');
  const today = date.todayStr();
  const plansBefore = store.getState().playPlan.length;

  findByAct(view(), 'plan-new')[0].click();
  await waitRender();
  const durInput = modal().querySelector('[data-field="duration"]');
  ok(durInput, '应有"大概多久"输入框');
  durInput.value = '2 小时';
  findByAct(modal(), 'save')[0].click();
  await sleep(20);
  await waitRender();

  eq(store.getState().playPlan.length, plansBefore + 1, '应新增一个放松时段');
  eq(store.getState().playPlan[store.getState().playPlan.length - 1].duration, '2 小时');
  eq(store.getState().playPlan[store.getState().playPlan.length - 1].weekday, date.weekdayNum(today),
    '默认应排在今天这个星期几');

  const btn = findByAct(view(), 'plan-today')[0];
  ok(btn, '应有安排今天放松按钮');
  btn.click();
  await waitRender();

  const created = logic.tasksOn(store.getState(), today).find((t) => t.module === 'game');
  ok(created, '应生成娱乐任务');
  ok(created.title.includes('2 小时'), '任务内容应带上时长：' + created.title);

  await go('home');
  ok(view().innerHTML.includes(created.title), '应出现在首页今日计划');
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
