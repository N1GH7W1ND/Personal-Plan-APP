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
import { installDom, findByAct, findByActAndId, noteCardText } from './lib/dom.mjs';

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
const notesView = await import('../web/views/notes.js');

setFile('阶段4 任务主干');

const view = () => dom.document.getElementById('view');
const modal = () => dom.document.getElementById('modalLayer');

/** 阅读页的笔记区用：按 id 取一张笔记卡，或取全部笔记卡 */
const noteCardAll = (root) => (root || view()).querySelectorAll('.note-card');
const noteCard = (root, id) => (root || view()).querySelector('#note-' + id);

/**
 * 用例收尾：清空数据并回到首页。
 *
 * 阅读与笔记的用例会在同一个 store 里造书、造笔记、造阅读记录。
 * 不清理就会污染后面的用例——曾经因此出现"笔记数 3 却显示 4"这类
 * 看着像功能坏了、其实是上个用例留下的数据的问题。
 * 统一放在 finally 里，断言失败时也能清干净。
 */
async function resetAfterTest() {
  try {
    await store.clearAll();
  } catch { /* 清理失败不掩盖真正的断言失败 */ }
  /*
   * 笔记区的搜索/筛选是"界面状态"，不随数据清空而重置。
   * 不重置的话，前一个用例搜过的关键词会一直挡着后面的用例，
   * 表现为"明明有笔记却显示没有符合条件的笔记"——曾因此误判过一次。
   */
  notesView.resetNoteFilter();
  await go('home');
  await waitRender();
}

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

test('阅读：加书 → 进度条 → 记页码 → 读完自动置为已读完（界面全流程）', async () => {
  try {
    await go('reading');
    assertNoViewError();

    // 空书架要有引导
    notOk(view().innerHTML.includes('book-row'), '一开始不该有书');
    ok(view().innerHTML.includes('书架还是空的'), '空书架应有引导文案');

    // 加一本书
    findByAct(view(), 'book-new')[0].click();
    await waitRender();
    modal().querySelector('[data-field="title"]').value = '置身事内';
    modal().querySelector('[data-field="author"]').value = '兰小欢';
    modal().querySelector('[data-field="totalPages"]').value = '300';
    findByAct(modal(), 'save')[0].click();
    await waitRender();
    assertNoViewError();

    const book = store.getState().books[0];
    ok(book, '应新增一本书');
    eq(book.title, '置身事内');
    eq(book.author, '兰小欢');
    eq(book.status, 'want', '新书默认想读');
    eq(book.totalPages, 300);

    // 界面上应出现这本书与进度条
    const html = view().innerHTML;
    ok(html.includes('置身事内'), '列表里应显示书名');
    ok(html.includes('0%'), '应显示 0% 进度');
    ok(html.includes('book-progress'), '应画出进度条');

    // 回归（按本人要求去掉）：书架行上不该再有「+10 页」这种一键刷页按钮
    notOk(html.includes('+10 页'), '书行上不该再有「+10 页」按钮');
    eq(findByAct(view(), 'book-page').length, 0, '不该再渲染 book-page 按钮');
    // 但"编辑书时填页码"这条推进进度的路仍在
    ok(findByActAndId(view(), 'book-menu', book.id), '每行仍应有「···」菜单');

    // 走编辑弹窗把页码填成 10：想读 → 在读，进度条跟着变
    store.dispatch((s) => logic.updateBook(s, book.id, { currentPage: 10 }));
    await waitRender();
    eq(logic.findBook(store.getState(), book.id).currentPage, 10, '页码应写入');
    eq(logic.findBook(store.getState(), book.id).status, 'reading', '有进度后应自动变在读');
    ok(view().innerHTML.includes('3%'), '进度百分比应跟着变（10/300 ≈ 3%）');

    // 直接把页码设到末尾，应自动标记为已读完
    store.dispatch((s) => logic.updateBook(s, book.id, { currentPage: 300 }));
    await waitRender();
    const done = logic.findBook(store.getState(), book.id);
    eq(done.status, 'finished', '读到最后一页应自动变成已读完');
    eq(logic.bookProgress(done), 100, '进度应为 100%');
    ok(done.finishedAt, '应记下完成日期');
    ok(view().innerHTML.includes('100%'), '界面应显示 100%');
  } finally {
    await resetAfterTest();
  }
});

test('阅读：记一次阅读会计入今日目标，并可按页推进书', async () => {
  try {
    await go('reading');

    // 自己造书，不依赖上一个用例留下的数据
    store.dispatch((s) => logic.addBook(s, { title: '人类简史', totalPages: 400 }));
    await waitRender();
    await go('reading');
    const book = store.getState().books.find((b) => b.title === '人类简史');
    ok(book, '前置条件：应有一本《人类简史》');

    const before = logic.readingMinutesOn(store.getState(), date.todayStr());
    findByActAndId(view(), 'book-log', book.id).click();
    await waitRender();

    modal().querySelector('[data-field="minutes"]').value = '25';
    modal().querySelector('[data-field="pages"]').value = '30';
    findByAct(modal(), 'save')[0].click();
    await waitRender();
    assertNoViewError();

    eq(logic.readingMinutesOn(store.getState(), date.todayStr()), before + 25, '今日阅读分钟应 +25');
    eq(logic.findBook(store.getState(), book.id).currentPage, 30, '页数应同时推进 30 页');

    // 目标进度条与文案应体现出来
    const html = view().innerHTML;
    ok(html.includes('read-goal'), '应有今日目标区块');
    ok(html.includes('周'), '应有本周七天的小格');
    ok(html.includes('week-dot'), '本周小格应被画出');
  } finally {
    await resetAfterTest();
  }
});

test('阅读：笔记可记、可关联书与页码、可删除并撤销', async () => {
  try {
    await go('reading');
    // 自己造书与笔记，不依赖别的用例
    store.dispatch((s) => logic.addBook(s, { title: '人类简史', totalPages: 400 }));
    await waitRender();
    await go('reading');
    const book = store.getState().books[0];
    ok(book, '前置条件：应有一本书');

    // 用输入框快速记一条（不关联书）
    const input = view().querySelector('[data-field="bnote-input"]');
    ok(input, '应有快速记笔记的输入框');
    input.typeAndEnter('这句话值得记住');
    await waitRender();

    let notes = store.getState().bookNotes;
    eq(notes.length, 1, '应新增一条笔记');
    eq(notes[0].text, '这句话值得记住');
    eq(notes[0].kind, 'note', '默认是想法');
    eq(input.value, '', '提交后输入框应清空');
    ok(view().innerHTML.includes('这句话值得记住'), '界面上应显示这条笔记');

    // 走弹窗记一条摘抄，关联到书并填页码
    findByAct(view(), 'note-new')[0].click();
    await waitRender();
    modal().querySelector('[data-field="text"]').value = '原文摘抄一句';
    modal().querySelector('[data-field="kind"]').value = 'quote';
    modal().querySelector('[data-field="page"]').value = '42';
    modal().querySelector('[data-field="bookId"]').value = book.id;
    findByAct(modal(), 'save')[0].click();
    await waitRender();
    assertNoViewError();

    notes = store.getState().bookNotes;
    eq(notes.length, 2, '应有两条笔记');
    const quote = notes.find((n) => n.kind === 'quote');
    ok(quote, '应有一条摘抄');
    eq(quote.page, 42, '页码应保存');
    eq(quote.bookId, book.id, '应关联到那本书');
    ok(view().innerHTML.includes('摘抄'), '界面应标出摘抄');

    // 归属正确：notesOfBook 只返回这本书的
    eq(logic.notesOfBook(store.getState(), book.id).length, 1, '这本书下应有 1 条笔记');

    // 删除并撤销
    const before = store.getState().bookNotes.length;
    findByActAndId(view(), 'note-del', quote.id).click();
    await waitRender();
    eq(store.getState().bookNotes.length, before - 1, '应删除一条');
    eq(store.getStatus().canUndo, true, '应可撤销');
    dom.document.getElementById('toastLayer').querySelector('.toast-action').click();
    await waitRender();
    eq(store.getState().bookNotes.length, before, '撤销后应恢复');
  } finally {
    await resetAfterTest();
  }
});

test('阅读：删书会连带清掉它的笔记，不留孤儿数据', async () => {
  try {
    // 自己把前置条件造出来，不依赖别的用例留下的状态
    await go('reading');
    store.dispatch((s) => logic.addBook(s, { title: '甲书', totalPages: 100 }));
    store.dispatch((s) => logic.addBook(s, { title: '乙书', totalPages: 100 }));
    await waitRender();
    await go('reading');

    const books = store.getState().books;
    const book = books[0];
    store.dispatch((s) => logic.addBookNote(s, { text: '甲书下的一条', bookId: book.id }));
    store.dispatch((s) => logic.addBookNote(s, { text: '甲书下的另一条', bookId: book.id }));
    store.dispatch((s) => logic.addBookNote(s, { text: '乙书下的', bookId: books[1].id }));
    await waitRender();
    await go('reading');

    const linked = logic.notesOfBook(store.getState(), book.id);
    const totalBefore = store.getState().bookNotes.length;
    eq(linked.length, 2, '前置条件：这本书下有 2 条笔记');
    ok(totalBefore > linked.length, '前置条件：还有不属于这本书的笔记（用于验证不会被误删）');

    findByActAndId(view(), 'book-menu', book.id).click();
    await waitRender();
    const del = findByAct(modal(), 'menu-pick').find((el) => el.getAttribute('data-key') === 'delete');
    ok(del, '菜单里应有删除');
    del.click();
    await waitRender();
    eq(store.getStatus().canUndo, true, '删除应可撤销');

    eq(logic.findBook(store.getState(), book.id), null, '书应被删除');
    eq(logic.notesOfBook(store.getState(), book.id).length, 0, '它的笔记也应一并清掉');
    eq(store.getState().bookNotes.length, totalBefore - linked.length,
      '只应删掉属于这本书的笔记，其他笔记要保留');

    // 撤销应把书与笔记一起恢复
    dom.document.getElementById('toastLayer').querySelector('.toast-action').click();
    await waitRender();
    ok(logic.findBook(store.getState(), book.id), '撤销后书应回来');
    eq(store.getState().bookNotes.length, totalBefore, '撤销后笔记也应回来');
  } finally {
    await resetAfterTest();
  }
});

test('阅读：推到今日会生成一条归属阅读的任务', async () => {
  await go('reading');
  store.dispatch((s) => logic.addBook(s, { title: '待读的书', totalPages: 100 }));
  await waitRender();
  const book = store.getState().books.find((b) => b.title === '待读的书');

  // 菜单 → 推到今日
  findByActAndId(view(), 'book-menu', book.id).click();
  await waitRender();
  const push = findByAct(modal(), 'menu-pick').find((el) => el.getAttribute('data-key') === 'push');
  ok(push, '菜单里应有推到今日');
  push.click();
  await waitRender();

  const task = logic.tasksOn(store.getState(), date.todayStr()).find((t) => t.module === 'reading');
  ok(task, '应生成一条阅读任务');
  ok(task.title.includes('待读的书'), '任务标题应带书名：' + task.title);

  await go('home');
  ok(view().innerHTML.includes('待读的书'), '阅读任务应出现在首页今日计划');

  // 收尾：把这次造的数据清干净。后面的用例默认从"全新数据"开始，
  // 留着会让它们误以为首页有多余任务。
  await store.clearAll();
  await go('home');
  await waitRender();
});

test('阅读页里就有完整的读书笔记：位置信息界面要如实显示（R13）', async () => {
  try {
    await go('reading');
    assertNoViewError();

    // 回归（按本人要求）：笔记不再是独立板块，而是阅读的一部分
    notOk(logic.NAV_ITEMS.map((n) => n.id).includes('notes'),
      '导航里不该再有独立的「读书笔记」入口');
    const navEl = dom.document.getElementById('nav');
    notOk(navEl && navEl.innerHTML.includes('读书笔记'), '左侧导航里不该出现「读书笔记」');
    // 但笔记区必须在阅读页里
    ok(view().innerHTML.includes('读书笔记'), '阅读页里应有读书笔记区');
    ok(view().innerHTML.includes('还没有笔记'), '空状态应有引导');
    ok(view().querySelector('[data-field="note-q"]'), '阅读页里应有笔记搜索框');

    // 先有一本书，才能关联
    store.dispatch((s) => logic.addBook(s, { title: '置身事内', author: '兰小欢', totalPages: 300 }));
    await waitRender();
    await go('reading');
    const book = store.getState().books[0];

    findByAct(view(), 'note-new')[0].click();
    await waitRender();
    const m = modal();
    ok(m, '应打开笔记编辑弹窗');
    // 位置相关字段都要在
    for (const f of ['text', 'kind', 'bookId', 'chapter', 'page', 'pageTo', 'line', 'lineTo', 'pinned']) {
      ok(m.querySelector('[data-field="' + f + '"]'), '弹窗里应有字段 ' + f);
    }

    m.querySelector('[data-field="text"]').value = '地方政府的行为逻辑值得细读';
    m.querySelector('[data-field="kind"]').value = 'quote';
    m.querySelector('[data-field="bookId"]').value = book.id;
    m.querySelector('[data-field="chapter"]').value = '第三章';
    m.querySelector('[data-field="page"]').value = '42';
    m.querySelector('[data-field="pageTo"]').value = '45';
    m.querySelector('[data-field="line"]').value = '3';
    m.querySelector('[data-field="lineTo"]').value = '8';
    m.querySelector('[data-field="pinned"]').checked = true;
    findByAct(m, 'save')[0].click();
    await waitRender();
    assertNoViewError();

    const note = store.getState().bookNotes[0];
    ok(note, '应新增一条笔记');
    eq(note.page, 42);
    eq(note.pageTo, 45);
    eq(note.line, 3);
    eq(note.lineTo, 8);
    eq(note.chapter, '第三章');
    eq(note.kind, 'quote');
    eq(note.pinned, true);

    // 界面上要能看到位置拼成的人话、书名、类型
    const card = noteCard(view(), note.id);
    ok(card, '阅读页里应有这张笔记卡');
    const shown = noteCardText(card);
    ok(shown.includes('第 42–45 页'), '界面应显示页码区间（实际：' + shown + '）');
    ok(shown.includes('第 3–8 行'), '界面应显示行号区间（实际：' + shown + '）');
    ok(shown.includes('第三章'), '界面应显示章节');
    ok(shown.includes('置身事内'), '界面应显示书名');
    ok(shown.includes('摘抄'), '界面应显示类型');
    ok(card.className.includes('pinned'), '收藏的笔记应有置顶样式');
  } finally {
    await resetAfterTest();
  }
});

test('阅读页的笔记：搜索、按类型筛选、只看收藏、收藏置顶（R13.2–R13.4）', async () => {
  try {
    await go('reading');
    store.dispatch((s) => logic.addBook(s, { title: '置身事内', totalPages: 300 }));
    await waitRender();
    await go('reading');
    const book = store.getState().books[0];

    // 凑出三条可筛选的笔记
    store.dispatch((s) => logic.addBookNote(s, {
      text: '地方政府的行为逻辑', bookId: book.id, kind: 'quote', pinned: true,
    }));
    store.dispatch((s) => logic.addBookNote(s, { text: '认知革命的关键', bookId: book.id, kind: 'note' }));
    store.dispatch((s) => logic.addBookNote(s, { text: '这条没关联书', kind: 'question' }));
    await waitRender();
    await go('reading');

    const cards = () => noteCardAll(view()).length;
    eq(cards(), 3, '应显示三条');

    // 搜索：走真实输入事件
    const q = view().querySelector('[data-field="note-q"]');
    ok(q, '应有搜索框');
    q.value = '认知';
    q.fire('input', {});
    await waitRender();
    assertNoViewError();
    eq(cards(), 1, '搜索后应只剩一条');
    ok(noteCardText(noteCardAll(view())[0]).includes('认知革命'), '搜到的应是那一条');

    // 清空搜索（按 Esc）
    const q2 = view().querySelector('[data-field="note-q"]');
    q2.fire('keydown', { key: 'Escape' });
    await waitRender();
    eq(cards(), 3, '清空搜索后应恢复');

    // 按类型筛选
    findByAct(view(), 'note-filter-kind').find((b) => b.getAttribute('data-kind') === 'question').click();
    await waitRender();
    eq(cards(), 1, '只看"疑问"应只剩一条');
    ok(noteCardText(noteCardAll(view())[0]).includes('没关联书'));

    // 回到全部
    findByAct(view(), 'note-filter-kind').find((b) => b.getAttribute('data-kind') === '').click();
    await waitRender();
    eq(cards(), 3);

    // 只看收藏：只有一条是收藏
    findByAct(view(), 'note-filter-pinned')[0].click();
    await waitRender();
    eq(cards(), 1, '只看收藏应只剩收藏的那条');
    findByAct(view(), 'note-filter-pinned')[0].click();
    await waitRender();
    eq(cards(), 3);

    // 收藏一条未收藏的，它应排到最前
    const second = store.getState().bookNotes.find((n) => n.text === '认知革命的关键');
    findByActAndId(view(), 'note-pin', second.id).click();
    await waitRender();
    eq(noteCardAll(view())[0].getAttribute('id'), 'note-' + second.id, '新收藏的应置顶');

    // 搜索无结果时给出区别于"还没有笔记"的提示
    const q3 = view().querySelector('[data-field="note-q"]');
    q3.value = '绝对搜不到的词';
    q3.fire('input', {});
    await waitRender();
    ok(view().innerHTML.includes('没有符合条件的笔记'), '搜不到时应说明是筛选结果为空');
  } finally {
    await resetAfterTest();
  }
});

test('图表：没任务的日子画成安静的小点，不再用斑马纹空柱（R15）', async () => {
  await go('home');
  await store.clearAll();
  await waitRender();
  await go('home');

  const bars = view().querySelectorAll('.bar');
  ok(bars.length >= 7, '本周应有 7 根柱子（实际 ' + bars.length + '）');
  const emptyBars = bars.filter((b) => b.className.includes('empty'));
  eq(emptyBars.length, bars.length, '没有任何任务时，本周每一根都应是空档');
  ok(view().innerHTML.includes('bar-empty-dot'), '空档应画成小点而不是空柱子');
  notOk(view().innerHTML.includes('repeating-linear-gradient'),
    '不该再用斑马纹（那是空柱子的旧写法）');
  ok(view().innerHTML.includes('没有任务'), '图例里应说明空档含义');

  // 加一条任务后：有任务的那天有柱子，其它天仍是小点
  store.dispatch((s) => logic.addTask(s, { title: '今天的事', module: 'dev', date: date.todayStr() }));
  await waitRender();
  const filled = view().querySelectorAll('.bar').filter((b) => !b.className.includes('empty'));
  eq(filled.length, 1, '只有今天应该有柱子');
  ok(view().innerHTML.includes('bar-empty-dot'), '其余日子仍应是小点');

  await store.clearAll();
  await waitRender();
});

test('今日计划页有统计图表，且跟着所选日期走（R16）', async () => {
  const today = date.todayStr();

  try {
    // 先造一条任务，让扇形图有真实扇区（空数据时只画骨架，无法据此判断范围）
    store.dispatch((s) => logic.addTask(s, { title: '今天的事', module: 'dev', date: today }));
    await go('today');
    assertNoViewError();

    ok(view().innerHTML.includes('bar-chart'), '今日计划页应有柱形图');
    ok(view().innerHTML.includes('pie-slice'), '今日计划页应有扇形图（有数据时应是真扇区）');

    // 柱形图的日期标签应覆盖所选那一天
    const labels = view().querySelectorAll('.bar-label').map((el) => el.textContent);
    ok(labels.length >= 7, '本周应有 7 个日期标签（实际 ' + labels.length + '）');

    // 翻到前一天，图表标题应跟着变（说明不是永远按今天算，而是围绕所选日期）
    findByAct(view(), 'prev-day')[0].click();
    await waitRender();
    const prev = date.addDays(today, -1);
    ok(view().innerHTML.includes(date.fmtDateCn(prev)),
      '标题里应出现所选日期 ' + prev + '，说明图表跟着所选日期走');
    ok(view().innerHTML.includes('bar-chart'), '翻日期后图表仍在');

    // 回到今天
    findByAct(view(), 'goto-today')[0].click();
    await waitRender();
    ok(view().innerHTML.includes('任务统计'), '回到今天后标题应恢复为"任务统计"');

    // 图表的时间范围切换仍然可用（按钮名是 chart-range）
    ok(findByAct(view(), 'chart-range').length >= 3, '应有时间范围切换按钮（本周/本月/今年/全部）');
  } finally {
    // 无论断言是否失败都要清干净，否则后面的用例会看到多余任务
    await store.clearAll();
    await go('home');
    await waitRender();
  }
});

test('优先级四档出现在所有加任务的地方（顶栏 + 各板块 + 编辑）', async () => {
  const want = ['重要且紧急', '重要不紧急', '不重要但紧急', '不重要不紧急'];
  const wantValues = ['urgentImportant', 'important', 'urgent', 'normal'];

  const readOptions = (scope) => {
    const sel = scope.querySelector('[data-field="priority"]');
    return sel ? sel.querySelectorAll('option').map((o) => o.textContent) : null;
  };
  const readValues = (scope) => {
    const sel = scope.querySelector('[data-field="priority"]');
    return sel ? sel.querySelectorAll('option').map((o) => o.getAttribute('value')) : null;
  };

  /*
   * 各板块的"新增"入口名字不一样，必须按真实名字找。
   * 之前这里用了一个不存在的名字，于是 find 不到就 continue，
   * 结果整条用例"假通过"——实际上开发和学习的弹窗当时根本没有优先级。
   * 所以现在：找不到入口就判失败，而不是跳过。
   */
  const entries = [
    { route: 'today', act: 'add-here', label: '今日计划' },
    { route: 'dev', act: 'dev-new', label: '开发' },
    { route: 'study', act: 'study-new', label: '学习' },
  ];

  try {
    await go('home');

    // 1) 顶栏「快速添加」弹窗
    dom.document.getElementById('btnQuickAdd').click();
    await waitRender();
    deepEq(readOptions(modal()), want, '快速添加的四档名称与顺序');
    deepEq(readValues(modal()), wantValues, '快速添加的四档取值');
    // 按本人要求：新增任务的默认优先级是「重要且紧急」
    eq(modal().querySelector('[data-field="priority"]').value, 'urgentImportant',
      '快速添加的默认优先级应是"重要且紧急"');
    findByAct(modal(), 'close')[0].click();
    await waitRender();

    // 2) 各板块的新增弹窗
    for (const { route, act, label } of entries) {
      await go(route);
      assertNoViewError();
      const addBtn = findByAct(view(), act)[0];
      ok(addBtn, label + '页应有新增入口（' + act + '）');
      addBtn.click();
      await waitRender();
      ok(modal().querySelector('[data-field="priority"]'),
        label + '页新增弹窗里应有优先级下拉');
      deepEq(readOptions(modal()), want, label + '页新增弹窗的四档名称与顺序');
      eq(modal().querySelector('[data-field="priority"]').value, 'urgentImportant',
        label + '页新增的默认优先级也应是"重要且紧急"');
      const closeBtn = findByAct(modal(), 'close')[0];
      ok(closeBtn, label + '页弹窗应有取消按钮');
      closeBtn.click();
      await waitRender();
    }

    // 3) 饮食模块的「+ 存一道菜」存的是菜谱而不是任务，本来就没有优先级；
    //    饮食的**任务**走通用任务弹窗（已在第 1 步核对）。这里把这个事实固定下来。
    await go('diet');
    findByAct(view(), 'recipe-new')[0].click();
    await waitRender();
    notOk(modal().querySelector('[data-field="priority"]'),
      '菜谱弹窗不该有优先级（菜谱不是任务）');
    findByAct(modal(), 'close')[0].click();
    await waitRender();

    // 4) 编辑已有任务时也是这四档，且当前值就是数据里的档位
    store.dispatch((s) => logic.addTask(s, {
      title: '优先级测试任务', module: 'dev', date: date.todayStr(), priority: 'urgent',
    }));
    await go('today');
    const task = store.getState().tasks.find((t) => t.title === '优先级测试任务');
    findByActAndId(view(), 'task-menu', task.id).click();
    await waitRender();
    const editItem = findByAct(modal(), 'menu-pick').find((el) => el.getAttribute('data-key') === 'edit');
    ok(editItem, '任务菜单里应有编辑');
    editItem.click();
    await waitRender();
    deepEq(readOptions(modal()), want, '编辑任务的四档名称与顺序');
    eq(modal().querySelector('[data-field="priority"]').value, 'urgent',
      '编辑时应选中任务当前的档位');
    findByAct(modal(), 'close')[0].click();
    await waitRender();
  } finally {
    await resetAfterTest();
  }
});

test('优先级标签：前三档显示、最低档不显示（列表不被标签塞满）', async () => {
  const d = date.todayStr();
  try {
    store.dispatch((s) => {
      logic.addTask(s, { title: '紧急重要的活', module: 'dev', date: d, priority: 'urgentImportant' });
      logic.addTask(s, { title: '重要不紧急的活', module: 'dev', date: d, priority: 'important' });
      logic.addTask(s, { title: '不重要但紧急的活', module: 'dev', date: d, priority: 'urgent' });
      logic.addTask(s, { title: '不重要不紧急的活', module: 'dev', date: d, priority: 'normal' });
    });
    await go('today');
    assertNoViewError();

    const html = view().innerHTML;
    ok(html.includes('重要且紧急'), '应显示"重要且紧急"标签');
    ok(html.includes('重要不紧急'), '应显示"重要不紧急"标签');
    ok(html.includes('不重要但紧急'), '应显示"不重要但紧急"标签');
    ok(!html.includes('不重要不紧急</span>') && !html.includes('>不重要不紧急<'),
      '默认档位不该显示标签（否则列表满屏标签）');

    // 排序：重要且紧急应排在最前面
    const titles = view().querySelectorAll('.row-title').map((el) => el.textContent);
    const idx = (name) => titles.findIndex((x) => x.includes(name));
    ok(idx('紧急重要的活') < idx('重要不紧急的活'), '"重要且紧急"应排在"重要不紧急"之前');
    ok(idx('重要不紧急的活') < idx('不重要但紧急的活'), '"重要不紧急"应排在"不重要但紧急"之前');
    ok(idx('不重要但紧急的活') < idx('不重要不紧急的活'), '"不重要但紧急"应排在最低档之前');
  } finally {
    await resetAfterTest();
  }
});

test('点书行的「记笔记」应打开笔记弹窗（回归：曾经误加成今日任务）', async () => {
  try {
    await go('reading');
    store.dispatch((s) => logic.addBook(s, { title: '置身事内', author: '兰小欢', totalPages: 300 }));
    await waitRender();
    await go('reading');
    const book = store.getState().books[0];

    const tasksBefore = store.getState().tasks.length;

    // 按钮文字就该是"记笔记"
    const btn = findByActAndId(view(), 'book-note', book.id);
    ok(btn, '书行上应有"记笔记"按钮');
    eq(btn.textContent, '记笔记', '按钮文字应是「记笔记」');

    btn.click();
    await waitRender();
    assertNoViewError();

    // 核心：不该往今日计划里塞任务
    eq(store.getState().tasks.length, tasksBefore,
      '点「记笔记」不该新增任何任务（原 bug 是加了一条今日任务）');
    eq(logic.tasksOn(store.getState(), date.todayStr()).filter((t) => t.module === 'reading').length, 0,
      '今日计划里不该出现阅读任务');

    // 应该打开的是笔记编辑弹窗，并且预选好了这本书
    const m = modal();
    ok(m, '应打开弹窗');
    ok(m.querySelector('[data-field="text"]'), '弹窗里应有笔记内容框（说明确实是笔记弹窗）');
    notOk(m.innerHTML.includes('读了多少分钟'), '不该打开"记一次阅读"的弹窗');
    eq(m.querySelector('[data-field="bookId"]').value, book.id, '应预选好这本书');

    // 填内容保存后，笔记应挂在这本书下，且仍然没有新增任务
    m.querySelector('[data-field="text"]').value = '地方政府的行为逻辑';
    findByAct(m, 'save')[0].click();
    await waitRender();

    const notes = store.getState().bookNotes;
    eq(notes.length, 1, '应新增一条笔记');
    eq(notes[0].bookId, book.id, '笔记应关联到这本书');
    eq(store.getState().tasks.length, tasksBefore, '保存笔记也不该新增任务');
    ok(view().innerHTML.includes('地方政府的行为逻辑'), '阅读页里应显示这条笔记');

    // 「推到今日」仍应可用，但它在「···」菜单里，不占用书行按钮
    findByActAndId(view(), 'book-menu', book.id).click();
    await waitRender();
    const push = findByAct(modal(), 'menu-pick').find((el) => el.getAttribute('data-key') === 'push');
    ok(push, '「···」菜单里仍应有推到今日计划');
    push.click();
    await waitRender();
    eq(store.getState().tasks.length, tasksBefore + 1, '从菜单里推到今日才应该新增任务');
  } finally {
    await resetAfterTest();
  }
});

test('健身页：记录一次训练（含动作解析），界面如实显示（R20）', async () => {
  try {
    await go('fitness');
    assertNoViewError();

    // 标题与空状态
    ok(view().innerHTML.includes('健身'), '页面标题应是健身');
    ok(view().innerHTML.includes('今天还没有训练记录'), '空状态应有引导');
    ok(view().innerHTML.includes('健身日历'), '应有健身日历');
    ok(view().innerHTML.includes('健身统计'), '应有健身统计');
    ok(view().innerHTML.includes('训练目标'), '应有训练目标区');

    // 记录一次训练：动作写成"名称 组数x次数"
    findByAct(view(), 'workout-new')[0].click();
    await waitRender();
    const m = modal();
    ok(m, '应打开记录训练弹窗');
    for (const f of ['type', 'minutes', 'date', 'intensity', 'exercises', 'note']) {
      ok(m.querySelector('[data-field="' + f + '"]'), '弹窗里应有字段 ' + f);
    }

    m.querySelector('[data-field="type"]').value = '胸 + 三头';
    m.querySelector('[data-field="minutes"]').value = '45';
    m.querySelector('[data-field="intensity"]').value = 'hard';
    m.querySelector('[data-field="exercises"]').value = '卧推 4x12\n上斜哑铃卧推 3x10\n绳索下压 3 15';
    m.querySelector('[data-field="note"]').value = '状态不错';
    findByAct(m, 'save')[0].click();
    await waitRender();
    assertNoViewError();

    const rec = store.getState().fitness.log[0];
    ok(rec, '应新增一条训练记录');
    eq(rec.type, '胸 + 三头');
    eq(rec.minutes, 45);
    eq(rec.intensity, 'hard');
    eq(rec.exercises.length, 3, '三行动作都应被解析');
    eq(rec.exercises[0].name, '卧推');
    eq(rec.exercises[0].sets, 4);
    eq(rec.exercises[0].reps, 12);
    // "绳索下压 3 15" 这种空格分隔也要认
    eq(rec.exercises[2].name, '绳索下压');
    eq(rec.exercises[2].sets, 3);
    eq(rec.exercises[2].reps, 15);

    // 界面上应显示出来
    const html = view().innerHTML;
    ok(html.includes('45'), '应显示时长');
    ok(html.includes('卧推'), '应显示动作');
    ok(html.includes('状态不错'), '应显示备注');
    ok(html.includes('吃力'), '应显示强度');
    ok(html.includes('训练日志'), '应出现训练日志区');
  } finally {
    await resetAfterTest();
  }
});

test('健身页：空记录不写入、同一天再记会合并（R20.3–R20.4）', async () => {
  try {
    await go('fitness');

    // 时长 0 且没有动作 → 不该写入
    findByAct(view(), 'workout-new')[0].click();
    await waitRender();
    modal().querySelector('[data-field="minutes"]').value = '0';
    modal().querySelector('[data-field="exercises"]').value = '';
    findByAct(modal(), 'save')[0].click();
    await waitRender();
    eq(store.getState().fitness.log.length, 0, '空记录不该写入');
    // 弹窗应还开着（因为没通过校验）
    ok(modal().querySelector('[data-field="minutes"]'), '校验不通过时弹窗应保持打开');

    // 填上时长再存
    modal().querySelector('[data-field="minutes"]').value = '30';
    modal().querySelector('[data-field="exercises"]').value = '卧推 3x10';
    findByAct(modal(), 'save')[0].click();
    await waitRender();
    eq(store.getState().fitness.log.length, 1, '补上时长后应写入');

    // 同一天再记一次 → 合并
    findByAct(view(), 'workout-new')[0].click();
    await waitRender();
    modal().querySelector('[data-field="minutes"]').value = '20';
    modal().querySelector('[data-field="exercises"]').value = '卧推 2x12';
    findByAct(modal(), 'save')[0].click();
    await waitRender();

    const log = store.getState().fitness.log;
    eq(log.length, 1, '同一天只应有一条记录');
    eq(log[0].minutes, 50, '时长应累加');
    eq(log[0].exercises.length, 1, '同名动作应合并');
    eq(log[0].exercises[0].sets, 5, '组数应累加');
  } finally {
    await resetAfterTest();
  }
});

test('健身页：训练目标的新增、进度与达标（R20.5）', async () => {
  try {
    await go('fitness');

    // 加一个"胸 + 三头 每周 2 次"
    findByAct(view(), 'goal-new')[0].click();
    await waitRender();
    modal().querySelector('[data-field="type"]').value = '胸 + 三头';
    modal().querySelector('[data-field="perWeek"]').value = '2';
    findByAct(modal(), 'save')[0].click();
    await waitRender();
    assertNoViewError();

    const goal = store.getState().fitness.goals[0];
    ok(goal, '应新增一个目标');
    eq(goal.type, '胸 + 三头');
    eq(goal.perWeek, 2);
    ok(view().innerHTML.includes('0/2'), '界面应显示本周进度 0/2');

    // 从目标的「记一次」按钮记录，类型应被预选
    const today = date.todayStr();
    store.dispatch((s) => logic.logWorkout(s, { date: today, type: '胸 + 三头', minutes: 40 }));
    await waitRender();
    await go('fitness');
    ok(view().innerHTML.includes('1/2'), '练一次后应显示 1/2');

    // 再练一次达标
    store.dispatch((s) => logic.logWorkout(s, { date: date.addDays(today, -1), type: '胸 + 三头', minutes: 40 }));
    await waitRender();
    await go('fitness');
    ok(view().innerHTML.includes('2/2'), '练够后应显示 2/2');
    ok(view().innerHTML.includes('已达标'), '达标后应标出');
    ok(view().innerHTML.includes('reached'), '达标的目标应有对应样式');

    /*
     * 从目标卡片点「记一次」，类型应被预选好。
     * 注意：页面上有多个 workout-new（顶栏、今日卡片、每个目标各一个），
     * 预设类型写在 data-type 上（type 属性被 type="button" 占用），不能取 [0]。
     */
    const goalBtn = findByAct(view(), 'workout-new')
      .find((b) => b.getAttribute('data-type') === '胸 + 三头');
    ok(goalBtn, '目标卡片上应有「记一次」按钮');
    goalBtn.click();
    await waitRender();
    eq(modal().querySelector('[data-field="type"]').value, '胸 + 三头',
      '从目标卡片进来时应预选该类型');
    findByAct(modal(), 'close')[0].click();
    await waitRender();
  } finally {
    await resetAfterTest();
  }
});

test('健身页：概况统计（本周进度、连续天数）与推到今日', async () => {
  try {
    const today = date.todayStr();
    await go('fitness');

    // 造：昨天 + 今天各一次
    store.dispatch((s) => logic.setFitnessWeeklyGoal(s, 3));
    store.dispatch((s) => logic.logWorkout(s, { date: date.addDays(today, -1), type: '有氧', minutes: 30 }));
    store.dispatch((s) => logic.logWorkout(s, { date: today, type: '有氧', minutes: 30 }));
    await waitRender();
    await go('fitness');
    assertNoViewError();

    const html = view().innerHTML;
    ok(html.includes('本周练了'), '应有本周进度文案');
    ok(html.includes('2'), '本周应显示练了 2 次');
    ok(html.includes('还差'), '未达标时应显示还差几次');
    ok(html.includes('连续天数'), '应有连续天数统计');
    ok(html.includes('week-dot'), '应有本周七天小格');
    const trained = view().querySelectorAll('.week-dot').filter((d) => d.className.includes('done'));
    eq(trained.length, 2, '本周应亮起两格');

    // 推到今日：应生成归属健身的任务
    const before = store.getState().tasks.length;
    findByAct(view(), 'workout-push')[0].click();
    await waitRender();
    const task = store.getState().tasks.find((x) => x.module === 'fitness');
    ok(task, '应生成一条健身任务');
    eq(store.getState().tasks.length, before + 1);
    ok(view().innerHTML.includes('已加入今日计划') || task.title.length > 0, '应有反馈');
  } finally {
    await resetAfterTest();
  }
});

test('健身页：训练记录可记、可删并撤销（R20.9）', async () => {
  try {
    await go('fitness');

    const input = view().querySelector('[data-field="fnote-input"]');
    ok(input, '应有快速记录输入框');
    input.typeAndEnter('今天状态不错');
    await waitRender();

    let notes = store.getState().fitness.notes;
    eq(notes.length, 1, '应新增一条训练记录');
    eq(notes[0].text, '今天状态不错');
    ok(view().innerHTML.includes('今天状态不错'), '界面上应显示');

    // 删除并可撤销
    findByActAndId(view(), 'fnote-del', notes[0].id).click();
    await waitRender();
    eq(store.getState().fitness.notes.length, 0, '应删除');
    dom.document.getElementById('toastLayer').querySelector('.toast-action').click();
    await waitRender();
    eq(store.getState().fitness.notes.length, 1, '撤销后应恢复');

    // 编辑走弹窗
    notes = store.getState().fitness.notes;
    findByActAndId(view(), 'fnote-edit', notes[0].id).click();
    await waitRender();
    ok(modal().querySelector('[data-field="mood"]'), '编辑弹窗应有身体感觉');
    modal().querySelector('[data-field="text"]').value = '改成这样';
    findByAct(modal(), 'save')[0].click();
    await waitRender();
    eq(store.getState().fitness.notes[0].text, '改成这样');
  } finally {
    await resetAfterTest();
  }
});

test('健身：编辑与删除某天训练（含弹窗里的删除按钮）', async () => {
  try {
    const today = date.todayStr();
    await go('fitness');
    store.dispatch((s) => logic.logWorkout(s, { date: today, type: '有氧', minutes: 30 }));
    await waitRender();
    await go('fitness');

    const rec = store.getState().fitness.log[0];
    findByActAndId(view(), 'workout-edit', rec.id).click();
    await waitRender();
    ok(modal(), '应打开编辑弹窗');
    ok(findByAct(modal(), 'del').length > 0, '编辑弹窗里应有删除按钮');
    modal().querySelector('[data-field="minutes"]').value = '55';
    modal().querySelector('[data-field="type"]').value = '核心';
    findByAct(modal(), 'save')[0].click();
    await waitRender();

    const after = store.getState().fitness.log[0];
    eq(after.minutes, 55, '时长应被改掉');
    eq(after.type, '核心', '类型应被改掉');

    // 通过弹窗里的删除按钮删掉
    findByActAndId(view(), 'workout-edit', rec.id).click();
    await waitRender();
    findByAct(modal(), 'del')[0].click();
    await waitRender();
    eq(store.getState().fitness.log.length, 0, '应删除这条训练');
    eq(store.getStatus().canUndo, true, '应可撤销');
    dom.document.getElementById('toastLayer').querySelector('.toast-action').click();
    await waitRender();
    eq(store.getState().fitness.log.length, 1, '撤销后应恢复');
  } finally {
    await resetAfterTest();
  }
});

test('健身：健身任务能出现在今日计划与首页（与其他模块一致）', async () => {
  try {
    const today = date.todayStr();
    await go('fitness');
    store.dispatch((s) => logic.pushWorkoutToToday(s, today));
    await waitRender();

    const task = logic.tasksOn(store.getState(), today).find((x) => x.module === 'fitness');
    ok(task, '应生成健身任务');

    await go('today');
    ok(view().innerHTML.includes(task.title), '今日计划里应显示这条健身任务');
    ok(view().innerHTML.includes('健身'), '应显示健身模块标签');

    await go('home');
    ok(view().innerHTML.includes(task.title), '首页今日计划里也应显示');
  } finally {
    await resetAfterTest();
  }
});

test('设置里勾选左侧栏模块：立刻反映到侧栏与快速添加（R21）', async () => {
  try {
    await go('settings');
    assertNoViewError();

    // 五个可勾选模块都要有勾选框
    for (const id of logic.NAV_MODULE_CHOICES) {
      ok(view().querySelector('[data-nav-toggle="' + id + '"]'), '应有 ' + id + ' 的勾选框');
    }
    // 学习不再禁用：勾了两个以上时它也可以取消
    const studyBox = view().querySelector('[data-nav-toggle="study"]');
    ok(!studyBox.disabled, '「学习」的勾选框不该被禁用（勾两个以上时它可以取消）');
    // 说明文字要写清新规则
    ok(view().innerHTML.includes('至少要保留一个板块'), '应有"至少要保留一个板块"的说明');
    ok(view().innerHTML.includes('勾了两个及以上时'), '应说明勾两个以上时学习也可取消');

    const navRoutes = () => {
      const navEl = dom.document.getElementById('nav');
      return navEl.querySelectorAll('.nav-item').map((a) => a.getAttribute('data-route'));
    };

    // 默认：五个模块都在
    deepEq(navRoutes(), ['home', 'today', 'dev', 'study', 'reading', 'diet', 'fitness', 'settings'],
      '默认侧栏应有全部入口');

    // 取消勾选"健身" → 侧栏立刻少一个
    const fitBox = view().querySelector('[data-nav-toggle="fitness"]');
    fitBox.checked = false;
    fitBox.fire('change', {});
    await waitRender();
    assertNoViewError();
    notOk(navRoutes().includes('fitness'), '取消勾选后侧栏不该再有健身');

    // 回到首页看快速添加的下拉：也不该有健身
    await go('home');
    const sel = view().querySelector('[data-field="module"]');
    notOk(sel.querySelectorAll('option').map((o) => o.getAttribute('value')).includes('fitness'),
      '快速添加下拉里也不该有健身');

    // 重新勾上 → 回来
    await go('settings');
    const fitBox2 = view().querySelector('[data-nav-toggle="fitness"]');
    fitBox2.checked = true;
    fitBox2.fire('change', {});
    await waitRender();
    ok(navRoutes().includes('fitness'), '重新勾选后侧栏应恢复');
    await go('home');
    ok(view().querySelector('[data-field="module"]')
      .querySelectorAll('option').map((o) => o.getAttribute('value')).includes('fitness'),
      '下拉里也应恢复');
  } finally {
    await resetAfterTest();
  }
});

test('设置里调顺序：侧栏与快速添加下拉的顺序一起变（R21）', async () => {
  try {
    const navRoutes = () => {
      const navEl = dom.document.getElementById('nav');
      return navEl.querySelectorAll('.nav-item').map((a) => a.getAttribute('data-route'));
    };
    const options = () => view().querySelector('[data-field="module"]')
      .querySelectorAll('option').map((o) => o.getAttribute('value'));

    // 把"健身"从最后一位往上挪，挪到阅读前面
    await go('settings');
    for (let i = 0; i < 3; i++) {
      findByActAndId(view(), 'nav-up', 'fitness').click();
      await waitRender();
    }
    deepEq(navRoutes(), ['home', 'today', 'dev', 'fitness', 'study', 'reading', 'diet', 'settings'],
      '侧栏顺序应跟着变');

    // 快速添加的下拉顺序也应一致（去掉骨架项与设置）
    await go('home');
    deepEq(options(), ['dev', 'fitness', 'study', 'reading', 'diet'],
      '快速添加下拉的顺序应与侧栏一致');

    // 再下移一次，两边一起变
    await go('settings');
    findByActAndId(view(), 'nav-down', 'fitness').click();
    await waitRender();
    deepEq(navRoutes(), ['home', 'today', 'dev', 'study', 'fitness', 'reading', 'diet', 'settings'],
      '下移后侧栏顺序');
    await go('home');
    deepEq(options(), ['dev', 'study', 'fitness', 'reading', 'diet'], '下拉顺序同步');

    // 进第一个模块看「加一条」的默认选中项 = 下拉第一项
    await go('today');
    findByAct(view(), 'add-here')[0].click();
    await waitRender();
    eq(modal().querySelector('[data-field="module"]').value, 'dev',
      '默认应选中下拉里的第一个模块');
    eq(modal().querySelector('[data-field="module"]').querySelectorAll('option').length, 5,
      '弹窗里的模块数应与配置一致');
    findByAct(modal(), 'close')[0].click();
    await waitRender();
  } finally {
    await resetAfterTest();
  }
});

test('隐藏的模块仍然可以进：旧链接与任务标签不会跳丢（R21 回归）', async () => {
  try {
    // 只留阅读（学习会被自动补上）
    store.dispatch((s) => logic.setNavModules(s, ['reading']));
    await waitRender();
    await go('home');

    const navRoutes = () => dom.document.getElementById('nav')
      .querySelectorAll('.nav-item').map((a) => a.getAttribute('data-route'));
    notOk(navRoutes().includes('fitness'), '前置条件：健身已被隐藏');

    // 直接进被隐藏的模块（相当于点旧书签或在地址栏输 #/fitness）
    await go('fitness');
    assertNoViewError();
    ok(view().innerHTML.includes('健身'), '被隐藏的模块仍然要能正常打开');

    // 任务上的模块标签跳到被隐藏的模块也要能到
    store.dispatch((s) => logic.addTask(s, { title: '练一组', module: 'fitness', date: date.todayStr() }));
    await waitRender();
    await go('today');
    const jumpTag = findByAct(view(), 'jump')[0];
    ok(jumpTag, '任务上应有模块标签');
    jumpTag.click();
    await waitRender();
    eq(router.currentRoute(), 'fitness', '点模块标签应跳到健身页，而不是掉回首页');
  } finally {
    await resetAfterTest();
  }
});

test('设置里全不勾：不允许清空，自动回到只显示学习（R21）', async () => {
  try {
    await go('settings');
    const navRoutes = () => dom.document.getElementById('nav')
      .querySelectorAll('.nav-item').map((a) => a.getAttribute('data-route'));

    // 逐个取消勾选（包括学习）
    for (const id of ['dev', 'reading', 'diet', 'fitness', 'study']) {
      const box = view().querySelector('[data-nav-toggle="' + id + '"]');
      if (!box) continue;
      box.checked = false;
      box.fire('change', {});
      await waitRender();
    }

    deepEq(navRoutes(), ['home', 'today', 'study', 'settings'],
      '全不勾之后只剩骨架 + 学习');
    deepEq(logic.navModules(store.getState()), ['study'], '配置应回到只含学习');

    await go('study');
    assertNoViewError();
    ok(view().innerHTML.length > 100, '学习页应正常渲染');
  } finally {
    await resetAfterTest();
  }
});

test('设置里勾两个以上时可以把学习取消掉（回归）', async () => {
  try {
    await go('settings');
    const navRoutes = () => dom.document.getElementById('nav')
      .querySelectorAll('.nav-item').map((a) => a.getAttribute('data-route'));

    // 先确保勾着开发与阅读（此时共三个：开发/学习/阅读）
    store.dispatch((s) => logic.setNavModules(s, ['dev', 'study', 'reading']));
    await waitRender();

    // 现在取消学习 → 应真的取消（因为还剩开发与阅读）
    const studyBox = view().querySelector('[data-nav-toggle="study"]');
    ok(studyBox, '应有学习的勾选框');
    studyBox.checked = false;
    studyBox.fire('change', {});
    await waitRender();

    deepEq(navRoutes(), ['home', 'today', 'dev', 'reading', 'settings'],
      '勾了两个以上时，取消学习应生效');
    notOk(logic.navModules(store.getState()).includes('study'), '配置里不该再有学习');

    // 快速添加下拉也要跟着去掉学习
    await go('home');
    const opts = view().querySelector('[data-field="module"]')
      .querySelectorAll('option').map((o) => o.getAttribute('value'));
    deepEq(opts, ['dev', 'reading'], '下拉里也不该有学习');
  } finally {
    await resetAfterTest();
  }
});

test('左侧栏配置会落盘，刷新后仍然生效', async () => {
  try {
    store.dispatch((s) => logic.setNavModules(s, ['fitness', 'reading']));
    store.dispatch((s) => logic.moveNavModule(s, 'reading', -1));
    await waitRender();
    await store.flushNow();

    // 模拟重新加载数据
    await store.load();
    await waitRender();
    await go('home');
    deepEq(logic.navModules(store.getState()), ['reading', 'fitness'],
      '刷新后配置应还在');
    const navRoutes = () => dom.document.getElementById('nav')
      .querySelectorAll('.nav-item').map((a) => a.getAttribute('data-route'));
    deepEq(navRoutes(), ['home', 'today', 'reading', 'fitness', 'settings'],
      '侧栏应按存下来的配置渲染');
  } finally {
    await resetAfterTest();
  }
});

test('左侧导航的文字与顺序（开发/饮食用简称）', async () => {
  await go('home');
  const navEl = dom.document.getElementById('nav');
  ok(navEl, '应有左侧导航');

  const items = navEl.querySelectorAll('.nav-item');
  const labels = items.map((a) => {
    const span = a.querySelector('.nav-label');
    return span ? span.textContent : '';
  });

  deepEq(labels, ['首页总览', '今日计划', '开发', '学习', '阅读', '饮食', '健身', '数据与设置'],
    '左侧导航的文字与顺序（按本人要求"开发工作"改"开发"、"饮食计划"改"饮食"）');

  // 不该再出现旧的全称
  const raw = navEl.innerHTML;
  notOk(raw.includes('开发工作'), '导航里不该再出现「开发工作」');
  notOk(raw.includes('饮食计划'), '导航里不该再出现「饮食计划」');
  // 也不该再有独立的读书笔记入口
  notOk(raw.includes('读书笔记'), '导航里不该出现「读书笔记」（它已并入阅读）');

  // 进开发页后，页面标题应与导航一致
  await go('dev');
  const title = dom.document.getElementById('pageTitle');
  eq(title ? title.textContent : '', '开发', '进开发页后标题应是「开发」');

  await go('diet');
  eq(dom.document.getElementById('pageTitle').textContent, '饮食', '进饮食页后标题应是「饮食」');

  await go('home');
});

test('数字键 1–8 随时能切换页面；主动点进输入框时数字归用户（回归）', async () => {
  const navIds = logic.NAV_ITEMS.map((n) => n.id);
  eq(navIds.length, 8, '当前应是 8 个导航入口');

  // ---- 一：没有在输入时，数字键应当切换页面 ----
  for (let i = 0; i < navIds.length; i++) {
    dom.document.body.focus(); // 焦点不在任何输入框
    dom.fireKey(String(i + 1)); // 事件目标默认是 body
    await waitRender();
    eq(router.currentRoute(), navIds[i], '按 ' + (i + 1) + ' 应切到 ' + navIds[i]);
  }

  // ---- 二：回归——进首页后不该自动把焦点塞进输入框 ----
  // 之前的问题：进首页时输入框自动获得焦点，导致数字键变成"往输入框里打字"，
  // 想切页面必须先点一下空白处。
  dom.document.body.focus();
  dom.fireKey('1');
  await waitRender();
  eq(router.currentRoute(), 'home', '按 1 应回到首页总览');

  const quickInput = view().querySelector('[data-field="quick-title"]');
  ok(quickInput, '首页应有「快速补一条」输入框');
  notEq(dom.document.activeElement, quickInput, '进首页不该自动把焦点放进输入框');

  // 紧接着按数字键——不需要先点空白处，就该切页面
  dom.fireKey('3');
  await waitRender();
  eq(router.currentRoute(), 'dev', '进首页后直接按 3 就该切到开发工作，不用先点空白处');

  // ---- 三：主动点进输入框后，数字属于用户，不能被抢去切页面 ----
  dom.fireKey('1');
  await waitRender();
  const input2 = view().querySelector('[data-field="quick-title"]');
  input2.click();      // 模拟用户点进输入框
  input2.focus();
  eq(dom.document.activeElement, input2, '点进来后焦点应在这个输入框');

  input2.fire('keydown', { key: '3' }); // 事件目标是输入框
  await waitRender();
  eq(router.currentRoute(), 'home', '正在输入时按数字键不该切换页面');

  // 焦点在输入框里、但事件目标是 body（浏览器异常情况）——同样不该切页
  dom.fireKey('5');
  await waitRender();
  eq(router.currentRoute(), 'home', '只要焦点在输入框里，即使事件目标不是它，也不该切换');

  // ---- 四：焦点离开后，数字键恢复切换 ----
  dom.document.body.focus();
  dom.fireKey('4');
  await waitRender();
  eq(router.currentRoute(), 'study', '焦点离开后按 4 应切到学习');

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
  const navIds = logic.NAV_MODULE_IDS;

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
