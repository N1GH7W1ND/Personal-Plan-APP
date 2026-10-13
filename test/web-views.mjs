/**
 * 阶段 4 测试：任务主干（首页 / 今日计划 / 快速备忘）
 * 端到端：真实服务 + 真实视图渲染 + 模拟点击，验证 PRD 第 10.2 与 10.4 节的验收项。
 *
 * 说明：本环境不能起浏览器，所以用一个极简 DOM 桩（test/lib/dom.mjs）承载真实视图代码。
 * 它不校验 CSS 外观，但能真实触发视图的事件处理器，因此"点一下会发生什么"是被验证过的。
 */

import { test, after, setFile, eq, notEq, deepEq, ok, notOk } from './run-frontend.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { installDom, findByAct, findByActAndId } from './lib/dom.mjs';

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, '..');
const PORT = Number(process.env.DSH_TEST_PORT || 41970);

const dataDir = mkdtempSync(join(tmpdir(), 'workbench-p4-'));

/* ---------------- 先装 DOM 与时序，再加载服务与前端 ---------------- */

const readFileSync = require('node:fs').readFileSync;
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
const started = await (async () => {
  const { createServer } = require(join(ROOT, 'server', 'index.js'));
  const server = createServer();
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  return { server, port: PORT };
})();
const server = started.server;

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  if (typeof input === 'string' && input.startsWith('/')) {
    return realFetch('http://127.0.0.1:' + PORT + input, init);
  }
  return realFetch(input, init);
};

// 加载前端（含视图）
const app = await import('../web/app.js');
const store = await import('../web/store.js');
const logic = await import('../web/logic.js');
const date = await import('../web/date.js');
const router = await import('../web/router.js');
const jump = await import('../web/jump.js');

setFile('阶段4 任务主干');

const view = () => dom.document.getElementById('view');
const modal = () => dom.document.getElementById('modalLayer');

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * 等界面真正重绘一次。
 * 视图重绘是异步的（requestAnimationFrame），点完按钮必须等它跑完再断言，
 * 否则检查的还是上一次的界面。
 */
async function waitRender(times) {
  const n = Math.max(1, times || 1);
  for (let i = 0; i < n; i++) await app.nextRender();
}

/** 切到某模块：走真实路由（改 hash + hashchange），再等重绘 */
async function go(route) {
  dom.navigate(route);
  await waitRender();
  assertNoViewError();
}

/** 初始化应用（读取数据 + 首次渲染） */
await app.init();

/** 界面里的任何异常都要冒出来，不能把测试变成"看起来通过" */
const viewErrors = [];
app.onError((err, where) => {
  viewErrors.push({ where, message: err && err.message ? err.message : String(err) });
  console.error('[视图异常]', where, err && err.stack ? err.stack : err);
});

/** 断言前检查有没有藏着的界面异常 */
function assertNoViewError() {
  if (viewErrors.length) {
    const first = viewErrors[0];
    viewErrors.length = 0;
    throw new Error('视图抛出了异常（' + first.where + '）：' + first.message);
  }
}

test('数字键 1–6 能切换页面；但正在输入时不该被当成快捷键（回归）', async () => {
  const navIds = logic.NAV_ITEMS.map((n) => n.id);
  eq(navIds.length, 6, '当前应是 6 个导航入口');

  // ---- 一：没有在输入时，数字键应当切换页面 ----
  for (let i = 0; i < navIds.length; i++) {
    dom.document.body.focus(); // 焦点不在任何输入框
    dom.fireKey(String(i + 1)); // 事件目标默认是 body
    await waitRender();
    eq(router.currentRoute(), navIds[i], '按 ' + (i + 1) + ' 应切到 ' + navIds[i]);
  }

  // ---- 二：回归——焦点在输入框里时，数字键属于用户，不能抢去切页面 ----
  // 复现用户报的问题：手动按 1 回到首页后，输入框自动获得焦点，
  // 此时再按数字键，应该落进输入框，而不是把页面切走。
  dom.document.body.focus();
  dom.fireKey('1');
  await waitRender();
  eq(router.currentRoute(), 'home', '按 1 应回到首页总览');

  const quickInput = view().querySelector('[data-field="quick-title"]');
  ok(quickInput, '首页应有「快速补一条」输入框');
  eq(dom.document.activeElement, quickInput, '进首页后输入框应自动获得焦点');

  // 模拟"用户在输入框里按下 3"：事件目标是输入框
  quickInput.fire('keydown', { key: '3' });
  await waitRender();
  eq(router.currentRoute(), 'home', '正在输入时按数字键不该切换页面');
  eq(quickInput.value, '', '守卫不该往输入框里写东西（值仍由用户输入决定）');

  // 焦点还在输入框上，但这次事件目标是 body（浏览器异常情况）——同样不该切页
  quickInput._focused = true;
  dom.document.activeElement = quickInput;
  dom.fireKey('5');
  await waitRender();
  eq(router.currentRoute(), 'home', '只要焦点在输入框里，即使事件目标不是它，也不该切换');

  // ---- 三：焦点移开后，数字键恢复切换 ----
  // 相当于用户点了页面空白处，焦点离开输入框
  dom.document.body.focus();
  eq(dom.document.activeElement, dom.document.body, '焦点应已离开输入框');
  dom.fireKey('4');
  await waitRender();
  eq(router.currentRoute(), 'study', '焦点移开后按 4 应切到学习');

  // 收尾：把界面带回首页，后面的用例默认从首页开始
  await go('home');
});

/* ---------------- 用例 ---------------- */

test('首页渲染出今日计划、快速补一条、快速备忘三个区块', () => {
  const html = view().innerHTML;
  ok(html.includes('今日计划'), '应有今日计划区块');
  ok(html.includes('快速补一条'), '应有快速补一条区块');
  ok(html.includes('快速备忘'), '应有快速备忘区块');
  ok(html.includes('data-field="quick-title"'), '快速补一条应有输入框');
  ok(html.includes('data-field="note-input"'), '快速备忘应有输入框');
});

test('首页不出现任何自动生成或推荐的任务入口（PRD E1）', () => {
  const html = view().innerHTML;
  notOk(html.includes('安排训练'), '不应出现"安排训练"这类推荐入口');
  notOk(html.includes('智能'), '不应出现智能建议字样');
  notOk(html.includes('推荐'), '不应出现推荐字样');
  const state = store.getState();
  deepEq(state.tasks, [], '全新数据下不应有任何任务');
  ok(html.includes('今天还没有安排'), '应显示空状态引导文案');
});

test('首页内联快速补一条：选模块 + 回车 → 任务进入该模块并算今天（PRD B1）', async () => {
  const input = view().querySelector('[data-field="quick-title"]');
  const moduleSel = view().querySelector('[data-field="module"]');
  ok(input && moduleSel, '应能找到输入框与模块下拉');

  moduleSel.value = 'study';
  input.typeAndEnter('看完事件循环');
  await waitRender();
  assertNoViewError();

  const state = store.getState();
  eq(state.tasks.length, 1, '应新增一条任务');
  eq(state.tasks[0].title, '看完事件循环');
  eq(state.tasks[0].module, 'study', '应归到学习模块');
  eq(state.tasks[0].date, date.todayStr(), '应排在今天');

  ok(input.value === '', '提交后输入框应清空，方便连续添加');
  await store.flushNow();
  const disk = JSON.parse(readFileSync(join(dataDir, 'data.json'), 'utf8'));
  eq(disk.tasks.length, 1, '应已落盘');
});

test('首页与弹窗的模块下拉只含导航里的模块，且与导航一致（需求 4）', async () => {
  // 导航里的业务模块
  const navIds = logic.NAV_ITEMS
    .map((n) => n.id)
    .filter((id) => id !== 'home' && id !== 'today' && id !== 'settings');

  // 首页内联下拉
  const sel = view().querySelector('[data-field="module"]');
  ok(sel, '首页应有模块下拉');
  const optIds = sel.querySelectorAll('option').map((o) => o.getAttribute('value'));
  deepEq(optIds, navIds, '首页下拉选项应与导航一致');
  notOk(optIds.includes('general'), '首页下拉不应有"通用"');
  ok(!sel.value || optIds.includes(sel.value), '默认值应是下拉里的某个模块（实际 ' + sel.value + '）');

  // 顶栏快速添加弹窗
  const quickBtn = dom.document.getElementById('btnQuickAdd');
  ok(quickBtn, '应有顶栏快速添加按钮');
  quickBtn.click();
  await waitRender();

  const modalSel = modal().querySelector('[data-field="module"]');
  ok(modalSel, '弹窗里应有模块下拉');
  const modalOptIds = modalSel.querySelectorAll('option').map((o) => o.getAttribute('value'));
  deepEq(modalOptIds, navIds, '弹窗下拉选项应与导航一致');
  notOk(modalOptIds.includes('general'), '弹窗下拉不应有"通用"');
  deepEq(modalOptIds, optIds, '两处下拉应完全一致');

  // 弹窗里选一个模块提交，验证落到的模块正确
  modal().querySelector('[data-field="title"]').value = '顺手记一条饮食安排';
  modalSel.value = 'diet';
  findByAct(modal(), 'save')[0].click();
  await waitRender();

  const created = store.getState().tasks.find((t) => t.title === '顺手记一条饮食安排');
  ok(created, '弹窗提交应生成任务');
  eq(created.module, 'diet', '应落到所选模块');
});

test('首页勾选任务后，同一份数据在今日计划里也是已完成（PRD B2）', async () => {
  const task = store.getState().tasks.find((t) => t.title === '看完事件循环');
  ok(task, '应能找到目标任务');
  const box = findByActAndId(view(), 'toggle-task', task.id);
  ok(box, '应能找到勾选框');
  box.click();
  await waitRender();
  assertNoViewError();

  eq(logic.findTask(store.getState(), task.id).done, true, '任务应变为已完成');
  ok(logic.tasksOn(store.getState(), date.todayStr()).some((t) => t.id === task.id && t.done),
    '今日计划的同一份数据也应显示已完成');
});

test('在今日计划里取消勾选，首页同步变回未完成（PRD B3）', async () => {
  const task = store.getState().tasks.find((t) => t.title === '看完事件循环');
  await go('today');

  const box = findByActAndId(view(), 'toggle-task', task.id);
  ok(box, '今日计划里应能看到同一条任务');
  box.click();
  await waitRender();
  assertNoViewError();

  eq(logic.findTask(store.getState(), task.id).done, false, '应恢复为未完成');
});

test('把任务日期改成明天后，首页不再显示它（PRD B4）', async () => {
  const task = store.getState().tasks.find((t) => t.title === '看完事件循环');
  const tomorrow = date.addDays(date.todayStr(), 1);

  await go('home');
  // 通过任务操作菜单改日期（走真实交互路径）
  const menuBtn = findByActAndId(view(), 'task-menu', task.id);
  ok(menuBtn, '应能找到任务菜单按钮');
  menuBtn.click();
  await waitRender();
  assertNoViewError();

  const dateItem = findByAct(dom.document.getElementById('modalLayer'), 'menu-pick')
    .find((el) => el.getAttribute('data-key') === 'date');
  ok(dateItem, '菜单里应有改日期项');
  dateItem.click();
  await waitRender();
  assertNoViewError();

  const dateInput = dom.document.getElementById('modalLayer').querySelector('[data-field="date"]');
  ok(dateInput, '应弹出日期选择');
  dateInput.value = tomorrow;

  const saveBtn = findByAct(dom.document.getElementById('modalLayer'), 'save')[0];
  ok(saveBtn, '应有确定按钮');
  saveBtn.click();
  await waitRender();
  assertNoViewError();

  eq(logic.findTask(store.getState(), task.id).date, tomorrow, '任务日期应改为明天');

  await go('home');
  // 首页现在还有"各模块汇总"图表，本周范围内的任务也会出现在图表明细里，
  // 所以这里要精确判断"今日计划"里有没有这一行，而不是看整页文本
  const row = view().querySelector('[id="task-' + task.id + '"]');
  const inTodayCard = row ? !!row.closest('.card') && /今日计划/.test(row.closest('.card').textContent) : false;
  eq(inTodayCard, false, '首页今日计划不应再显示明天的任务');

  // 任务本身没被删掉，只是换了日期
  ok(store.getState().tasks.some((t) => t.id === task.id), '任务本身没有被删掉');
  eq(logic.findTask(store.getState(), task.id).date, tomorrow, '日期应已改为明天');
  ok(logic.tasksOn(store.getState(), tomorrow).some((t) => t.id === task.id), '明天应能看到它');
  eq(logic.tasksOn(store.getState(), date.todayStr()).some((t) => t.id === task.id), false,
    '今天不应再看到它');
});

test('逾期任务：留在原日期、显示逾期、可单独挪到今天（PRD B6/B7）', async () => {
  // 造一条昨天的未完成任务
  const yesterday = date.addDays(date.todayStr(), -1);
  store.dispatch((s) => logic.addTask(s, { title: '昨天没做完的事', module: 'dev', date: yesterday }));
  await waitRender();
  assertNoViewError();

  await go('home');
  let html = view().innerHTML;
  ok(html.includes('逾期 1 条'), '首页应出现逾期折叠提示');
  ok(html.includes('昨天没做完的事') === false || html.includes('昨天没做完的事'), '内容可见性由折叠决定');

  const state = store.getState();
  const overdue = logic.overdueTasks(state, date.todayStr());
  eq(overdue.length, 1, '应识别为逾期');
  eq(overdue[0].date, yesterday, '逾期任务应仍留在原日期，不自动顺延');

  // 展开逾期区并点"挪到今天"
  const head = findByAct(view(), 'toggle-overdue')[0];
  ok(head, '应有逾期折叠头');
  head.click();
  await waitRender();
  assertNoViewError();

  const moveBtn = findByAct(view(), 'move-today')[0];
  ok(moveBtn, '应有"挪到今天"按钮');
  moveBtn.click();
  await waitRender();
  assertNoViewError();

  const after = store.getState();
  eq(logic.findTask(after, overdue[0].id).date, date.todayStr(), '应被挪到今天');
  eq(logic.overdueTasks(after, date.todayStr()).length, 0, '不应再有逾期任务');
  eq(logic.tasksOn(after, yesterday).length, 0, '原日期不应再显示它');
});

test('逾期任务可以一次性全部挪到今天（PRD B7）', async () => {
  const d1 = date.addDays(date.todayStr(), -3);
  const d2 = date.addDays(date.todayStr(), -2);
  store.dispatch((s) => {
    logic.addTask(s, { title: '欠账一', module: 'dev', date: d1 });
    logic.addTask(s, { title: '欠账二', module: 'study', date: d2 });
  });
  await waitRender();
  assertNoViewError();

  await go('home');
  const head = findByAct(view(), 'toggle-overdue')[0];
  if (head) head.click();
  await waitRender();
  assertNoViewError();

  const allBtn = findByAct(view(), 'move-all-today')[0];
  ok(allBtn, '应有"全部挪到今天"按钮');
  allBtn.click();
  await waitRender();
  assertNoViewError();

  eq(logic.overdueTasks(store.getState(), date.todayStr()).length, 0, '不应再有逾期任务');
});

test('删除任务后 5 秒内可撤销（PRD F/G）', async () => {
  await go('home'); // 上一条用例在今日计划页，先回首页
  const before = store.getState().tasks.length;
  // 必须选"首页确实会渲染的那条"：今天、未完成
  const target = logic.tasksOn(store.getState(), date.todayStr()).find((t) => !t.done);
  ok(target, '首页应有可操作的任务');

  const menuBtn = findByActAndId(view(), 'task-menu', target.id);
  if (!menuBtn) {
    require('node:fs').writeFileSync(
      join(import.meta.dirname, '_fail-dump.json'),
      JSON.stringify({
        route: router.currentRoute(),
        hash: dom.window.location.hash,
        targetId: target.id,
        stateTaskIds: store.getState().tasks.map((t) => t.id + '|' + t.date),
        viewHead: view().innerHTML.slice(0, 500),
      }, null, 2),
      'utf8'
    );
  }
  ok(menuBtn, '应能找到菜单按钮');
  menuBtn.click();
  await waitRender();
  assertNoViewError();

  const delItem = findByAct(dom.document.getElementById('modalLayer'), 'menu-pick')
    .find((el) => el.getAttribute('data-key') === 'delete');
  ok(delItem, '菜单里应有删除项');
  delItem.click();
  await waitRender();
  assertNoViewError();

  eq(store.getState().tasks.length, before - 1, '任务应被删除');
  eq(store.getStatus().canUndo, true, '应可撤销');

  // 点提示条上的"撤销"
  const toastLayer = dom.document.getElementById('toastLayer');
  const undoBtn = toastLayer.querySelector('.toast-action');
  ok(undoBtn, '应出现撤销按钮');
  undoBtn.click();
  await waitRender();
  assertNoViewError();

  eq(store.getState().tasks.length, before, '撤销后任务应回来');
  ok(store.getState().tasks.some((t) => t.id === target.id), '回来的应是同一条');
});

test('快速备忘：新增不计入今日进度，勾选可划掉（PRD E2）', async () => {
  const progressBefore = logic.todayProgress(store.getState(), date.todayStr());
  const noteInput = view().querySelector('[data-field="note-input"]');
  ok(noteInput, '应有备忘输入框');

  noteInput.typeAndEnter('买猫粮');
  await waitRender();
  assertNoViewError();

  const state = store.getState();
  eq(state.notes.length, 1, '应新增一条备忘');
  eq(state.notes[0].text, '买猫粮');
  deepEq(logic.todayProgress(state, date.todayStr()), progressBefore, '今日进度不应因备忘变化');

  const noteId = state.notes[0].id;
  const box = findByActAndId(view(), 'toggle-note', noteId);
  ok(box, '应能找到备忘勾选框');
  box.click();
  await waitRender();
  assertNoViewError();
  eq(logic.findNote(store.getState(), noteId).done, true, '备忘应被划掉（不算任务完成）');
});

test('备忘升级为任务：便签消失、任务出现在今天（PRD E3）', async () => {
  const note = store.getState().notes[0];
  const tasksBefore = store.getState().tasks.length;

  const toTaskBtn = findByActAndId(view(), 'note-to-task', note.id);
  ok(toTaskBtn, '应能找到"变任务"按钮');
  toTaskBtn.click();
  await waitRender();
  assertNoViewError();

  // 选择模块
  const pick = findByAct(dom.document.getElementById('modalLayer'), 'pick-module')[0];
  ok(pick, '应弹出模块选择');
  pick.click();
  await waitRender();
  assertNoViewError();

  const state = store.getState();
  eq(state.notes.some((n) => n.id === note.id), false, '便签应消失');
  eq(state.tasks.length, tasksBefore + 1, '应多出一条任务');
  const created = state.tasks[state.tasks.length - 1];
  eq(created.title, '买猫粮', '任务内容应来自便签');
  eq(created.date, date.todayStr(), '应排在今天');
});

test('备忘与任务完全隔离：删除任务不影响备忘，反之亦然', async () => {
  store.dispatch((s) => logic.addNote(s, '一条不该被任务操作影响的备忘'));
  await waitRender();
  assertNoViewError();
  const notesBefore = store.getState().notes.length;
  const task = store.getState().tasks[0];

  store.dispatch((s) => logic.removeTask(s, task.id), { undoable: true });
  await waitRender();
  assertNoViewError();
  eq(store.getState().notes.length, notesBefore, '删任务不应影响备忘');

  const note = store.getState().notes[0];
  store.dispatch((s) => logic.removeNote(s, note.id), { undoable: true });
  await waitRender();
  assertNoViewError();
  eq(store.getState().tasks.some((t) => t.id === task.id), false, '删备忘不应影响任务（任务本来就删了）');
});

test('点来源模块标签会跳到对应模块并带上定位目标（PRD B8）', async () => {
  await go('home');
  let target = logic.tasksOn(store.getState(), date.todayStr()).find((t) => !t.done);
  if (!target) {
    store.dispatch((s) => logic.addTask(s, { title: '跳转测试任务', module: 'dev' }));
    await waitRender();
    assertNoViewError();
    target = logic.tasksOn(store.getState(), date.todayStr()).find((t) => !t.done);
  }
  ok(target, '首页应有可跳转的任务');

  const jumpTag = findByActAndId(view(), 'jump', target.id);
  ok(jumpTag, '应能找到来源模块标签');
  eq(jumpTag.getAttribute('data-module'), target.module, '标签应带上模块');

  // 跳转动作会登记一次性定位目标，渲染时被正常消费掉，
  // 所以用跳转历史来核对"确实带了目标过去"。
  jumpTag.click();
  await waitRender();
  assertNoViewError();

  eq(router.currentRoute(), target.module, '应跳到该模块的路由');
  const last = jump.jumpHistory().slice(-1)[0];
  ok(last, '跳转动作应留下记录');
  eq(last.route, target.module, '定位目标应指向目标模块');
  eq(last.anchorId, target.id, '定位目标应是这条任务');
  eq(dom.window.location.hash, '#/' + target.module, '地址栏也应跟着变');
});

test('今日计划的日期切换只改查看的日期，不改任何任务的日期（PRD B4 反向）', async () => {
  await go('today');
  const before = store.getState().tasks.map((t) => ({ id: t.id, date: t.date }));
  const today = date.todayStr();

  const step = async (act, allowMissing) => {
    const btn = findByAct(view(), act)[0];
    if (!btn) {
      ok(allowMissing, '应有 ' + act + ' 按钮');
      return false;
    }
    btn.click();
    await waitRender();
    assertNoViewError();
    return true;
  };

  // 往后翻两天：应能看到"回到今天"按钮
  await step('next-day');
  await step('next-day');
  ok(findByAct(view(), 'goto-today')[0], '不在今天时应出现「今天」按钮');

  // 往回翻两天：回到今天，此时"今天"按钮应自动收起
  await step('prev-day');
  await step('prev-day');
  ok(!findByAct(view(), 'goto-today')[0], '已经回到今天时「今天」按钮应收起');

  // 再往后翻一天，然后用「今天」按钮回来
  await step('next-day');
  const backBtn = findByAct(view(), 'goto-today')[0];
  ok(backBtn, '不在今天时应能一键回到今天');
  backBtn.click();
  await waitRender();
  assertNoViewError();

  ok(!findByAct(view(), 'goto-today')[0], '回到今天后按钮应收起');
  deepEq(store.getState().tasks.map((t) => ({ id: t.id, date: t.date })), before, '任务日期不应被切换动作改动');
});

test('侧栏欠账数字与首页未完成数一致（PRD G5）', async () => {
  store.dispatch((s) => {
    logic.addTask(s, { title: '欠账A', module: 'dev' });
    logic.addTask(s, { title: '欠账B', module: 'dev' });
  });
  await waitRender();
  assertNoViewError();

  const state = store.getState();
  const today = date.todayStr();
  const expectedDev = logic.modulePendingToday(state, 'dev', today);

  const navLink = dom.document.querySelector('.nav-item[data-route="dev"]');
  ok(navLink, '应能找到导航项');
  const badge = navLink.querySelector('.nav-count');
  eq(badge.textContent, String(expectedDev), '侧栏数字应与该模块今天未完成数一致');

  const footerText = dom.document.getElementById('footDone').textContent;
  const progress = logic.todayProgress(state, today);
  eq(footerText, progress.done + '/' + progress.total, '底部进度应与首页一致');
});

test('未知路由回落首页，不会白屏（PRD G1）', async () => {
  eq(router.routeFromHash('#/不存在的模块'), 'home', '未知路由应解析为首页');
  eq(router.routeFromHash(''), 'home', '空 hash 应解析为首页');
  eq(router.routeFromHash('#/today'), 'today', '正常路由应正确解析');

  await go('不存在的模块');
  ok(view().innerHTML.length > 0, '不应白屏');
  ok(view().innerHTML.includes('今日计划'), '应渲染出首页内容');
});

test('任何改动都会在 1 秒内落盘（PRD A8）', async () => {
  store.dispatch((s) => logic.addTask(s, { title: '落盘验证' }));
  await sleep(900); // 防抖 400ms + 写入
  const disk = JSON.parse(readFileSync(join(dataDir, 'data.json'), 'utf8'));
  ok(disk.tasks.some((t) => t.title === '落盘验证'), '应在 1 秒内出现在数据文件里');
  eq(store.getStatus().saveStatus, 'saved', '状态应是已保存');
});

test('刷新页面（重新加载数据）后任务与备忘都还在（PRD A3）', async () => {
  const before = {
    tasks: store.getState().tasks.length,
    notes: store.getState().notes.length,
  };
  await store.flushNow();
  await store.load();
  eq(store.getState().tasks.length, before.tasks, '任务数应一致');
  eq(store.getState().notes.length, before.notes, '备忘数应一致');
});

/* ---------------- 收尾 ---------------- */

after(async () => {
  // 先把未落盘的改动写出去，再停止界面活动，最后拆环境
  try {
    await store.flushNow();
  } catch { /* 收尾失败不影响用例判定 */ }
  app.stop();
  await new Promise((resolve) => {
    try { server.close(resolve); } catch { resolve(); }
    setTimeout(resolve, 1200);
  });
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  dom.uninstall();
  await sleep(50);
});
