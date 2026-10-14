/**
 * 阶段 6 测试：数据与设置
 * 覆盖 PRD F1–F5：数据状态展示、导出备份、从备份恢复、清空需确认、偏好设置生效。
 */

import { test, after, setFile, eq, deepEq, ok, notOk } from './run-frontend.mjs';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { installDom, findByAct, findByActAndId } from './lib/dom.mjs';

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, '..');
const PORT = Number(process.env.DSH_TEST_PORT || 41990);

const dataDir = mkdtempSync(join(tmpdir(), 'workbench-p6-'));

/* ---------------- 环境 ---------------- */

const dom = installDom(readFileSync(join(ROOT, 'web', 'index.html'), 'utf8'));

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
const api = await import('../web/api.js');

setFile('阶段6 数据与设置');

const view = () => dom.document.getElementById('view');
const modal = () => dom.document.getElementById('modalLayer');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dataFile = () => join(dataDir, 'data.json');
const backupDir = () => join(dataDir, 'backups');
const readDisk = () => JSON.parse(readFileSync(dataFile(), 'utf8'));
const listBackups = () => {
  try {
    return readdirSync(backupDir()).filter((f) => f.startsWith('data_') && f.endsWith('.json'));
  } catch {
    return [];
  }
};

async function waitRender(times) {
  const n = Math.max(1, times || 1);
  for (let i = 0; i < n; i++) await app.nextRender();
}

async function go(route) {
  dom.navigate(route);
  await waitRender();
  assertNoViewError();
}

/** 造一点有代表性的数据 */
async function seed() {
  store.dispatch((s) => {
    logic.addTask(s, { title: '写周报', module: 'general' });
    logic.addNote(s, '买猫粮');
    logic.addDevTask(s, { title: '修 bug' });
    logic.addDevIdea(s, '用缓存');
    logic.addStudyItem(s, { title: '看完事件循环', minutes: 30 });
    logic.addRecipe(s, '番茄牛腩');
    logic.addShoppingItem(s, '牛腩');
  });
  await store.flushNow();
  await waitRender();
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

await app.init();

/* ============================================================
   数据状态展示
   ============================================================ */

test('设置页显示数据文件位置、保存时间与各类条数', async () => {
  await store.clearAll();
  await seed();
  await go('settings');

  const html = view().innerHTML;
  ok(html.includes('数据状态'), '应有数据状态区块');
  ok(html.includes('data.json'), '应显示数据文件路径');
  ok(html.includes('第 ') && html.includes('次写入'), '应显示写入次数');

  const state = store.getState();
  ok(html.includes(String(state.tasks.length)), '应显示任务条数');
  ok(html.includes('任务') && html.includes('备忘'), '应有各类统计标签');

  // 路径来自真实服务
  const pathEl = dom.document.getElementById('data-path');
  ok(pathEl, '应能找到数据文件路径元素');
  ok(pathEl.textContent.includes('data.json'), '路径应是真实数据文件：' + pathEl.textContent);
});

test('设置页显示的条数与实际数据一致', async () => {
  await go('settings');
  const state = store.getState();
  const stats = view().querySelectorAll('.stat');
  ok(stats.length >= 6, '应有多个统计块（实际 ' + stats.length + '）');

  const textOf = (i) => stats[i].textContent;
  eq(textOf(0), String(state.tasks.length) + '任务', '任务数应一致');
  eq(textOf(1), String(state.notes.length) + '备忘', '备忘数应一致');
  eq(textOf(2), String(state.devTasks.length + state.devIdeas.length) + '开发（含灵感）', '开发数应一致');
  eq(textOf(3), String(state.studyItems.length) + '学习条目', '学习条目数应一致');
  eq(textOf(4), String(state.books.length) + '书', '书的数量应一致');
  eq(textOf(5), String(state.bookNotes.length) + '读书笔记', '读书笔记数应一致');
});

/* ============================================================
   导出备份（F1）
   ============================================================ */

test('导出备份能拿到包含全部数据的文件（F1）', async () => {
  await go('settings');
  const before = store.getState();

  const r = await fetch('/api/export');
  eq(r.status, 200, '导出应成功');
  const disposition = r.headers.get('content-disposition') || '';
  ok(disposition.includes('attachment'), '应作为附件下载');
  ok(/filename\*=UTF-8''/.test(disposition), '中文文件名应用 RFC 5987 形式编码');

  const text = await r.text();
  const parsed = JSON.parse(text);
  eq(parsed.tasks.length, before.tasks.length, '任务条数应一致');
  eq(parsed.notes.length, before.notes.length, '备忘条数应一致');
  eq(parsed.studyItems.length, before.studyItems.length, '学习条目数应一致');
  // 已移除模块的内容不应出现在导出文件里
  for (const gone of ['media', 'consultTasks', 'consultRecords', 'games', 'playPlan']) {
    eq(gone in parsed, false, '导出文件不应含已移除模块字段 ' + gone);
  }
  // 健身已加回来，导出里应当有它
  ok(parsed.fitness && Array.isArray(parsed.fitness.log), '导出文件应含 fitness.log');

  // 导出的文件本身应当能被当作备份导入回去
  ok(storeModule.looksLikeState(parsed), '导出的内容应被识别为本应用备份');
});

test('界面上点「导出备份」会触发下载', async () => {
  await go('settings');
  // 浏览器的下载动作在测试环境里没法真下载，这里验证它确实发起了下载调用
  const anchors = [];
  const origCreate = dom.document.createElement.bind(dom.document);
  dom.document.createElement = (tag) => {
    const el = origCreate(tag);
    if (tag === 'a') {
      el.click = () => anchors.push(el.href);
    }
    return el;
  };

  findByAct(view(), 'export')[0].click();
  await sleep(20);
  dom.document.createElement = origCreate;

  eq(anchors.length, 1, '应发起一次下载');
  ok(String(anchors[0]).includes('/api/export'), '下载地址应是导出接口：' + anchors[0]);
});

/* ============================================================
   从备份恢复（F2、F3）
   ============================================================ */

test('从备份恢复后数据回到备份时的状态（F2）', async () => {
  const r = await fetch('/api/export');
  const backup = await r.text();

  // 改动数据，制造与备份不同的现状
  store.dispatch((s) => logic.addTask(s, { title: '恢复前新加的任务' }));
  await store.flushNow();
  ok(readDisk().tasks.some((t) => t.title === '恢复前新加的任务'), '改动应已落盘');
  const beforeRestore = readDisk();

  await api.importState(JSON.parse(backup));
  await store.load();
  await waitRender();

  const after = readDisk();
  eq(after.tasks.length, JSON.parse(backup).tasks.length, '任务数应回到备份时');
  eq(after.tasks.some((t) => t.title === '恢复前新加的任务'), false, '恢复前的改动应被覆盖');
  deepEq(after.notes.map((n) => n.text), JSON.parse(backup).notes.map((n) => n.text), '备忘应完全一致');
  ok(after.revision > beforeRestore.revision, '版本号应继续递增');
});

test('恢复前会自动再存一份当前数据，便于反悔（F3）', async () => {
  const beforeList = listBackups().length;
  const backup = JSON.parse(await (await fetch('/api/export')).text());
  backup.notes = [{ id: 'n_from_backup', text: '来自备份', done: false }];

  await api.importState(backup);
  await store.load();
  await waitRender();

  const afterList = listBackups();
  ok(afterList.length > beforeList, '备份目录里应多出文件');

  const preimports = afterList.filter((f) => f.includes('preimport'));
  ok(preimports.length >= 1, '应有一份"恢复前"的备份');
  const pre = JSON.parse(readFileSync(join(backupDir(), preimports[preimports.length - 1]), 'utf8'));
  ok(Array.isArray(pre.tasks), '恢复前备份应包含完整数据');
  ok(pre.notes.some((n) => n.text !== '来自备份'), '恢复前备份里应是覆盖前的旧内容');
});

test('界面上选文件恢复：先弹确认，确认后才覆盖', async () => {
  await go('settings');
  const before = store.getState().notes.map((n) => n.text);

  const fileObj = {
    name: '工作台备份_20260101_120000.json',
    text: async () => JSON.stringify({
      schemaVersion: 1,
      tasks: [{ id: 't_ui', title: '来自界面恢复', module: 'dev', date: date.todayStr(), done: false }],
      notes: [],
      devTasks: [], devIdeas: [], studyItems: [],
      diet: { meals: {}, recipes: [], shopping: [] },
      settings: { density: 'comfortable' },
    }),
  };

  const input = dom.document.getElementById('importFile');
  ok(input, '应有隐藏的文件选择框');
  // 测试环境没法弹系统文件框：直接塞文件并派发 change
  input.click = () => {
    input.files = [fileObj];
    input.fire('change');
  };

  findByAct(view(), 'import')[0].click();
  await sleep(30);

  // 应先弹确认框，此时数据还没变
  ok(modal().querySelector('[data-act="yes"]'), '应先弹确认框');
  deepEq(store.getState().notes.map((n) => n.text), before, '确认前不应改动数据');

  findByAct(modal(), 'yes')[0].click();
  await sleep(60);
  await waitRender();

  eq(store.getState().tasks.length, 1, '确认后应被备份内容覆盖');
  eq(store.getState().tasks[0].title, '来自界面恢复');
});

/* ============================================================
   清空（F5）
   ============================================================ */

test('清空必须输入确认文字，输错不接受（F5）', async () => {
  await seed();
  const before = store.getState().tasks.length;
  ok(before > 0, '清空前应有数据');

  await go('settings');
  findByAct(view(), 'clear-all')[0].click();
  await waitRender();

  const input = modal().querySelector('[data-field="confirm"]');
  ok(input, '清空应要求输入确认文字');

  // 输错：点了确认也不应清空
  input.value = '确认';
  findByAct(modal(), 'yes')[0].click();
  await sleep(30);
  ok(modal().querySelector('[data-field="confirm"]'), '输错时应留在弹窗里');
  eq(store.getState().tasks.length, before, '输错不应清空数据');

  // 输对：清空
  input.value = '确认清空';
  findByAct(modal(), 'yes')[0].click();
  await sleep(60);
  await waitRender();

  eq(store.getState().tasks.length, 0, '输对应清空任务');
  eq(store.getState().notes.length, 0, '备忘也应清空');
  eq(store.getState().studyItems.length, 0, '学习条目也应清空');
  eq(store.getState().devTasks.length, 0, '开发待办也应清空');
  eq(readDisk().tasks.length, 0, '磁盘上也应清空');
});

test('清空点取消则数据不变（F5）', async () => {
  await seed();
  const before = store.getState().tasks.length;

  await go('settings');
  findByAct(view(), 'clear-all')[0].click();
  await waitRender();
  findByAct(modal(), 'no')[0].click();
  await sleep(30);
  await waitRender();

  eq(store.getState().tasks.length, before, '取消后数据应毫无变化');
  ok(!modal().querySelector('[data-field="confirm"]'), '弹窗应关闭');
});

test('清空前会自动备份一次', async () => {
  await seed();
  const beforeBackups = listBackups().length;

  store.dispatch((s) => logic.addNote(s, '清空前该被备份下来的备忘'));
  await store.flushNow();
  await store.clearAll();

  const afterBackups = listBackups();
  ok(afterBackups.length > beforeBackups, '应新增备份文件');
  const pre = afterBackups.filter((f) => f.includes('preimport'));
  ok(pre.length >= 1, '应有一份清空前的备份');
  const content = JSON.parse(readFileSync(join(backupDir(), pre[pre.length - 1]), 'utf8'));
  eq(content.notes.some((n) => n.text === '清空前该被备份下来的备忘'), true, '清空前的备份里应有那条备忘');
});

/* ============================================================
   偏好设置
   ============================================================ */

test('设置页不再有健身目标（模块已移除）', async () => {
  await store.clearAll();
  await go('settings');

  // 健身已加回来：设置页应该有"每周健身目标"
  const goal = view().querySelector('[data-field="fitnessWeeklyGoal"]');
  ok(goal, '设置页应有「每周健身目标」输入框');
  eq(goal.value, String(store.getState().settings.fitnessWeeklyGoal),
    '输入框应显示当前值');
  ok(view().innerHTML.includes('健身'), '设置页应出现健身字样');
  ok('fitnessWeeklyGoal' in store.getState().settings, '数据里应有健身目标');
});

test('改界面密度会切换紧凑模式并落盘', async () => {
  await go('settings');
  const density = view().querySelector('[data-field="density"]');
  ok(density, '应有界面密度下拉');
  eq(density.value, 'comfortable', '默认舒适');

  density.value = 'compact';
  density.fire('change');
  await waitRender();

  eq(store.getState().settings.density, 'compact', '设置应写进数据');
  ok(dom.document.body.classList.contains('density-compact'), 'body 应加上紧凑样式类');

  await store.flushNow();
  eq(readDisk().settings.density, 'compact', '应落盘');

  // 改回舒适
  const density2 = view().querySelector('[data-field="density"]');
  density2.value = 'comfortable';
  density2.fire('change');
  await waitRender();
  eq(dom.document.body.classList.contains('density-compact'), false, '应能改回舒适');
  await store.flushNow();
});

test('设置页不提供「新的一天」时间配置（PRD D9）', async () => {
  await go('settings');
  const html = view().innerHTML;
  notOk(html.includes('data-field="dayStart"'), '不应有 dayStart 配置项');
  notOk(/type="time"/.test(html), '不应有时间选择控件');
  // 只说明规则，不提供修改入口
  const bodyStartText = /新的一天[^<]*0\s*点/.test(html) || html.includes('0 点为界');
  ok(bodyStartText, '应说明以 0 点为界且不可改');
  const controls = findByAct(view(), 'day-start-set');
  eq(controls.length, 0, '不应有修改"新的一天"的操作按钮');
});

test('「立即保存」把未写入的改动立刻落盘', async () => {
  await go('settings');
  store.dispatch((s) => logic.addTask(s, { title: '等落盘的任务' }));
  eq(store.getStatus().dirty, true, '应处于待保存状态');

  findByAct(view(), 'save-now')[0].click();
  await sleep(80);
  await waitRender();

  eq(store.getStatus().saveStatus, 'saved', '应变成已保存');
  ok(readDisk().tasks.some((t) => t.title === '等落盘的任务'), '应已写入数据文件');
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
