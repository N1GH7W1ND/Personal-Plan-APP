/**
 * 前端测试：store 与真实本地服务的端到端联调（web/store.js + web/api.js + server/）
 *
 * 做法：在本进程内启动真实 HTTP 服务（只监听回环地址），
 * 把相对路径 fetch 补成本机绝对地址，然后跑真实的 store.load / dispatch / flush。
 * 全程使用临时数据目录，不碰你真实的数据。
 */

import { test, after, setFile, eq, notEq, deepEq, ok, notOk } from './run-frontend.mjs';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, '..');
const PORT = Number(process.env.DSH_TEST_PORT || 41960);

const storeModule = require(join(ROOT, 'server', 'store.js'));
const serverIndex = require(join(ROOT, 'server', 'index.js'));

/* ---------------- 启动真实服务 ---------------- */

const dataDir = mkdtempSync(join(tmpdir(), 'workbench-fe-'));
storeModule.useDataDir(dataDir);
await storeModule.read();
const started = await serverIndex.start([PORT]);
if (started.reused) throw new Error('测试端口已被占用：' + PORT);
const server = started.server;

// 把相对路径请求补成本机绝对地址（浏览器里天然如此，Node 里需要补）
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  if (typeof input === 'string' && input.startsWith('/')) {
    return realFetch('http://127.0.0.1:' + PORT + input, init);
  }
  return realFetch(input, init);
};

// 现在可以安全加载前端模块了（import 必须在 fetch 补丁之后才有意义）
const store = await import('../web/store.js');
const logic = await import('../web/logic.js');
const date = await import('../web/date.js');
const api = await import('../web/api.js');

setFile('前端 · store 与真实服务');

const dataFile = join(dataDir, 'data.json');
const readDisk = () => JSON.parse(readFileSync(dataFile, 'utf8'));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ---------------- 用例 ---------------- */

test('load 能从本机服务读到数据', async () => {
  const res = await store.load();
  ok(res, '应返回结果');
  eq(store.getStatus().saveStatus, 'saved', '加载完成应处于已保存状态');
  eq(store.getStatus().revision, res.revision, '版本号应记录');
  ok(store.getStatus().serverPath.endsWith('data.json'), '应记录数据文件路径');
  deepEq(store.getState().tasks, [], '初始应无任务');
});

test('dispatch 后会自动保存到磁盘文件', async () => {
  store.dispatch((s) => logic.addTask(s, { title: '写公众号初稿', module: 'media' }), { label: '新增任务' });
  eq(store.getStatus().saveStatus, 'unsaved', '刚改完应是待保存');

  await store.flushNow();
  eq(store.getStatus().saveStatus, 'saved', '保存后应是已保存');
  ok(store.getStatus().lastSavedAt, '应有保存时间');

  const disk = readDisk();
  eq(disk.tasks.length, 1, '文件里应有这条任务');
  eq(disk.tasks[0].title, '写公众号初稿', '标题应落盘');
  eq(disk.tasks[0].module, 'media');
  ok(disk.revision >= 1, '文件里的版本号应递增');
});

test('保存是防抖的：连续多次改动只落盘一次版本跳变', async () => {
  const revBefore = readDisk().revision;
  store.dispatch((s) => logic.addTask(s, { title: '第一条', module: 'dev' }));
  store.dispatch((s) => logic.addTask(s, { title: '第二条', module: 'dev' }));
  store.dispatch((s) => logic.addTask(s, { title: '第三条', module: 'dev' }));

  await store.flushNow();
  const disk = readDisk();
  eq(disk.tasks.length, 4, '三条都应写进去');
  eq(disk.revision, revBefore + 1, '三次改动应合并成一次版本递增（防抖生效）');
});

test('新页面加载后能读到之前保存的数据（刷新不丢）', async () => {
  const before = readDisk().tasks.length;
  await store.load(); // 模拟刷新页面
  eq(store.getState().tasks.length, before, '重新加载后任务数应一致');
  const titles = store.getState().tasks.map((t) => t.title);
  ok(titles.includes('写公众号初稿'), '之前保存的内容还在');
});

test('删除 + 撤销：能恢复到删除前', async () => {
  await store.load();
  const first = store.getState().tasks[0];
  const countBefore = store.getState().tasks.length;

  store.dispatch((s) => logic.removeTask(s, first.id), { undoable: true, label: '删除任务' });
  eq(store.getState().tasks.length, countBefore - 1, '应少一条');
  ok(store.getStatus().canUndo, '应可撤销');

  const okUndo = store.undo();
  eq(okUndo, true, '撤销应成功');
  eq(store.getState().tasks.length, countBefore, '应恢复回来');
  ok(store.getState().tasks.some((t) => t.id === first.id), '被删的那条应回来');

  await store.flushNow();
  eq(readDisk().tasks.length, countBefore, '撤销后的结果也应落盘');
});

test('未标记 undoable 的改动不进撤销栈', async () => {
  await store.load();
  const sizeBefore = store.getStatus().canUndo;
  store.dispatch((s) => logic.addTask(s, { title: '不可撤销的' }));
  await store.flushNow();
  eq(store.getStatus().canUndo, sizeBefore, '撤销栈不应因这次改动而变化');
});

test('多窗口冲突：过期版本保存会被拒绝并给出冲突状态', async () => {
  await store.load();

  // 模拟"另一个窗口"直接改服务端数据，使 store 手里的版本过期
  const cur = await api.pullState();
  const other = JSON.parse(JSON.stringify(cur.state));
  other.notes.push({ id: 'n_other', text: '另一个窗口写的', done: false });
  const pushed = await api.pushState(other, cur.revision);
  eq(pushed.ok, true, '另一个窗口应写入成功');

  // 本窗口继续改，应被判为冲突
  store.dispatch((s) => logic.addTask(s, { title: '本窗口写的' }));
  await store.flushNow();

  eq(store.getStatus().saveStatus, 'conflict', '应进入冲突状态');
  ok(store.getStatus().lastError, '应给出冲突说明');

  const disk = readDisk();
  eq(disk.notes.some((n) => n.text === '另一个窗口写的'), true, '另一个窗口的数据应在');
  eq(disk.tasks.some((t) => t.title === '本窗口写的'), false, '冲突时不应覆盖对方数据');
});

test('放弃本地改动后重新读取：恢复正常状态', async () => {
  await store.discardLocalAndReload();
  eq(store.getStatus().saveStatus, 'saved', '应回到已保存状态');
  eq(store.getState().notes.some((n) => n.text === '另一个窗口写的'), true, '应读到最新数据');

  // 恢复后可以正常继续保存
  store.dispatch((s) => logic.addTask(s, { title: '冲突解决后的新任务' }));
  await store.flushNow();
  eq(store.getStatus().saveStatus, 'saved', '应能正常保存');
  eq(readDisk().tasks.some((t) => t.title === '冲突解决后的新任务'), true, '新任务应落盘');
});

test('导出备份能拿到完整数据', async () => {
  const r = await fetch('/api/export');
  eq(r.status, 200, '导出状态码');
  const text = await r.text();
  const parsed = JSON.parse(text);
  ok(Array.isArray(parsed.tasks), '导出内容应含任务数组');
  eq(parsed.tasks.length, readDisk().tasks.length, '导出条数应与磁盘一致');
});

test('从备份恢复：覆盖当前数据并回到已保存', async () => {
  const backup = logic.createInitialState();
  backup.notes = [{ id: 'n_from_backup', text: '来自备份的备忘', done: false }];

  const cur = await api.pullState();
  await api.importState(backup);
  await store.load();

  eq(store.getState().notes.length, 1, '应只剩备份里的那条');
  eq(store.getState().notes[0].text, '来自备份的备忘');
  ok(cur.revision < store.getStatus().revision, '版本号应继续递增');

  const preimports = require('node:fs').readdirSync(join(dataDir, 'backups'))
    .filter((f) => f.includes('preimport'));
  ok(preimports.length >= 1, '恢复前应自动留一份，方便反悔');
});

test('清空全部数据后，界面数据为空且已落盘', async () => {
  await store.clearAll();
  deepEq(store.getState().tasks, [], '任务应清空');
  deepEq(store.getState().notes, [], '备忘应清空');
  eq(readDisk().tasks.length, 0, '磁盘上也应清空');
  eq(store.getStatus().saveStatus, 'saved', '应处于已保存状态');
});

test('保存失败时给出明确错误状态而不是静默丢弃', async () => {
  // 让服务端拒绝写入：发一个大于上限的请求体
  const huge = 'x'.repeat(21 * 1024 * 1024);
  store.dispatch((s) => logic.addTask(s, { title: huge }));
  await store.flushNow();
  eq(store.getStatus().saveStatus, 'error', '应进入错误状态');
  ok(store.getStatus().lastError, '应有错误说明');

  // 恢复：把超大数据丢掉后再存一次，应能恢复正常
  await store.discardLocalAndReload();
  eq(store.getStatus().saveStatus, 'saved', '重新加载后应恢复');
  store.dispatch((s) => logic.addTask(s, { title: '恢复后的正常任务' }));
  await store.flushNow();
  eq(store.getStatus().saveStatus, 'saved', '应能继续正常保存');
  eq(store.getState().tasks.some((t) => t.title === '恢复后的正常任务'), true);
});

test('文件内容始终是可解析的合法 JSON（反复读写不出错）', async () => {
  const trace = [];
  trace.push('起点 disk=' + readDisk().revision + ' store=' + store.getStatus().revision);

  await store.clearAll();
  trace.push('clearAll 后 disk=' + readDisk().revision + ' store=' + store.getStatus().revision + ' status=' + store.getStatus().saveStatus);
  eq(readDisk().tasks.length, 0, '先清干净再压测');

  for (let i = 0; i < 12; i++) {
    store.dispatch((s) => logic.addTask(s, { title: '压测任务 ' + i, module: 'dev' }));
  }
  trace.push('12 次 dispatch 后 disk=' + readDisk().revision + ' store=' + store.getStatus().revision);

  await store.flushNow();
  trace.push('flushNow 后 disk=' + readDisk().revision + ' store=' + store.getStatus().revision);

  await sleep(700);
  trace.push('再等 700ms 后 disk=' + readDisk().revision + ' store=' + store.getStatus().revision);

  const disk = readDisk();
  eq(disk.tasks.length, 12, '12 条都应写入');
  eq(store.getStatus().revision - (Number(trace[1].match(/store=(\d+)/)[1])), 1,
    '防抖后应只递增一次 —— 轨迹：' + trace.join(' | '));
  ok(existsSync(join(dataDir, 'backups')), '备份目录应存在');
});

/* ---------------- 收尾（全部用例跑完后执行） ---------------- */

after(async () => {
  await new Promise((resolve) => {
    try {
      server.close(resolve);
    } catch {
      resolve();
    }
    setTimeout(resolve, 1200);
  });
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  await sleep(50);
});
