'use strict';
/**
 * 阶段 2 测试：数据持久化
 * 覆盖：首次落盘、原子写入、读回一致、每日备份、备份轮换、
 *       损坏隔离与自动恢复、revision 冲突拒绝、导入校验、请求体上限、导出、health 统计。
 */

const t = require('./lib/t');
const h = require('./lib/helpers');
const fs = require('node:fs');

t.setFile('阶段2 数据持久化');

let server = null;
let dataDir = null;

/** 切到一个干净的数据目录 */
async function resetDir(tag) {
  dataDir = await h.useDataDir(await h.makeTmpDir('p2-' + (tag || 'x')));
  await h.store.read();
  return dataDir;
}

// ---------------- 纯函数 ----------------

t.test('空状态模板字段齐全', async () => {
  const s = h.store.emptyState();
  t.eq(s.schemaVersion, 1, 'schemaVersion');
  t.eq(s.revision, 0, 'revision 初值');
  for (const f of ['tasks', 'notes', 'devTasks', 'devIdeas', 'studyItems']) {
    t.ok(Array.isArray(s[f]), f + ' 应为数组');
  }
  t.deepEq(s.diet, { meals: {}, recipes: [], shopping: [] }, 'diet 结构');
  t.eq(s.settings.density, 'comfortable', '默认界面密度');
  // 仍然移除的模块字段不该出现
  for (const gone of ['media', 'consultTasks', 'consultRecords', 'games', 'playPlan']) {
    t.eq(gone in s, false, '空模板不应再有 ' + gone + ' 字段');
  }
  // 健身已加回来：结构与阅读同构，设置里也有每周目标
  t.deepEq(s.fitness, { log: [], goals: [], notes: [] }, '健身空模板应是 log/goals/notes');
  t.eq(s.settings.fitnessWeeklyGoal, 3, '设置里应有每周健身目标，默认 3');
});

/*
 * 这个字段曾经被服务端丢掉：normalize 不认识它，于是"读到什么存什么"时
 * 用户保存的板块配置会在下一次写入时消失，表现是"调完顺序、刷新一下又变回去"。
 * 所以这里同时测"模板里有""规整正确""写盘读回后还在"。
 */
t.test('左侧板块配置 navModules：模板里有，写盘读回后还在（回归）', async () => {
  const s = h.store.emptyState();
  t.deepEq(s.settings.navModules, ['dev', 'study', 'reading', 'diet', 'fitness'],
    '空模板应有默认的五个板块');

  // 规整：去掉非法值与重复项，保留顺序
  t.deepEq(h.store.normalize({ settings: { navModules: ['diet', 'dev', 'diet', '乱写'] } })
    .settings.navModules, ['diet', 'dev'], '去重、去非法值、保留顺序');
  // 一个都没有 → 回到保底「学习」
  t.deepEq(h.store.normalize({ settings: { navModules: [] } }).settings.navModules, ['study'],
    '空配置应回到保底学习');
  t.deepEq(h.store.normalize({ settings: { navModules: '乱写' } }).settings.navModules, ['study'],
    '非数组应回到保底学习');
  t.deepEq(h.store.normalize({ settings: {} }).settings.navModules, ['study'],
    '缺字段时也应给出保底值，而不是 undefined');
  // 勾两个以上时学习可以被取消
  t.deepEq(h.store.normalize({ settings: { navModules: ['reading', 'fitness'] } })
    .settings.navModules, ['reading', 'fitness'], '不该强行补回学习');
  // 已经合法的配置不该被改动
  t.deepEq(h.store.normalize({ settings: { navModules: ['fitness', 'study'] } })
    .settings.navModules, ['fitness', 'study'], '合法配置应原样保留');

  // 写盘再读回：这一轮必须原样还在（之前会被服务端丢掉）
  await resetDir('nav');
  const custom = ['fitness', 'reading', 'dev'];
  const base = h.store.emptyState();
  base.settings.navModules = custom;
  await h.store.write(base, 0);
  const back = await h.store.read();
  t.deepEq(back.state.settings.navModules, custom,
    '写盘再读回后，板块配置必须原样保留');
  t.includes(fs.readFileSync(h.dataFile(dataDir), 'utf8'), '"navModules"',
    '磁盘文件里应有 navModules 字段');
});

t.test('normalize 能容忍残缺/手改数据', async () => {
  const n = h.store.normalize({ tasks: 'not-an-array', fitness: null, diet: 5, settings: { density: 'weird' } });
  t.deepEq(n.tasks, [], 'tasks 应被修正为空数组');
  t.deepEq(n.diet, { meals: {}, recipes: [], shopping: [] }, 'diet 应被补齐');
  t.eq(n.settings.density, 'comfortable', '非法 density 应回落到 comfortable');
  // 健身（加回来的模块）应被规整成三段结构，而不是丢掉
  t.deepEq(n.fitness, { log: [], goals: [], notes: [] }, 'fitness 应被规整成 log/goals/notes');
  t.eq(n.settings.fitnessWeeklyGoal, 3, '健身目标非法值应回落到 3');

  const n2 = h.store.normalize(null);
  t.eq(n2.schemaVersion, 1, '传入 null 也应返回合法模板');
  t.ok(Array.isArray(n2.tasks), 'tasks 应为数组');

  const n3 = h.store.normalize({ fitness: { records: [1, 2], routine: [] }, diet: { meals: [] } });
  t.deepEq(n3.fitness, { log: [], goals: [], notes: [] },
    '旧的 fitness 结构应被换成新结构（record/routine 不再保留）');
  t.eq('records' in n3.fitness, false, '旧字段 records 应被删掉');
  t.eq('routine' in n3.fitness, false, '旧字段 routine 应被删掉');
  t.deepEq(n3.diet.meals, {}, 'diet.meals 是数组时应修正为对象');
});

t.test('looksLikeState 能区分备份文件与随便一个 JSON', async () => {
  t.eq(h.store.looksLikeState(h.store.emptyState()), true, '空数据模板应被认可');
  t.eq(h.store.looksLikeState({ tasks: [] }), true, '含 tasks 的对象应被认可');
  t.eq(h.store.looksLikeState({ settings: {} }), true, '含 settings 的对象应被认可');
  t.eq(h.store.looksLikeState({ hello: 'world' }), false, '无关对象应被拒绝');
  t.eq(h.store.looksLikeState([1, 2, 3]), false, '数组应被拒绝');
  t.eq(h.store.looksLikeState(null), false, 'null 应被拒绝');
});

// ---------------- 落盘与读回 ----------------

t.test('首次读取会把空数据真正写到磁盘（格式化、以换行结尾）', async () => {
  await resetDir('init');
  const file = h.dataFile(dataDir);
  t.ok(fs.existsSync(file), '应创建 data.json');

  const text = fs.readFileSync(file, 'utf8');
  t.includes(text, '\n  "tasks": []', '应是格式化后的 JSON');
  t.ok(text.endsWith('\n'), '文件应以换行结尾');

  const parsed = JSON.parse(text);
  t.eq(parsed.schemaVersion, 1, 'schemaVersion');
  t.eq(parsed.revision, 0, '初始 revision 应为 0');
});

t.test('中文以可读形式存放，而不是被转义', async () => {
  await resetDir('utf8');
  const r = await h.saveState(server.port, Object.assign(h.store.emptyState(), {
    tasks: [{ id: 't_1', title: '写周报', module: 'dev', date: '2026-10-08', done: false }],
  }), 0);
  t.eq(r.status, 200, '保存状态码');

  const text = fs.readFileSync(h.dataFile(dataDir), 'utf8');
  t.includes(text, '写周报', '中文应可读');
  t.notIncludes(text, '\\u5199', '不应出现 unicode 转义');
});

t.test('写入后读回一致，revision 单调递增', async () => {
  await resetDir('roundtrip');
  let rev = 0;
  for (let i = 1; i <= 5; i++) {
    const out = await h.store.write(Object.assign(h.store.emptyState(), {
      notes: [{ id: 'n_' + i, text: '备忘 ' + i, done: false }],
    }), rev);
    t.eq(out.ok, true, '第 ' + i + ' 次写入应成功');
    t.eq(out.revision, i, '第 ' + i + ' 次写入后 revision');
    rev = out.revision;
  }

  const back = await h.store.read();
  t.eq(back.revision, 5, '磁盘上的 revision');
  t.eq(back.state.notes.length, 1, 'notes 条数');
  t.eq(back.state.notes[0].text, '备忘 5', '内容应为最后一次写入的值');
  t.ok(back.updatedAt, '应有 updatedAt 时间戳');
  t.ok(back.sizeBytes > 0, 'sizeBytes 应大于 0');
});

t.test('写入是原子替换，不会留下临时文件', async () => {
  await resetDir('atomic');
  // 人为留一个"上次崩溃残留"的临时文件
  await h.writeFileText(h.path.join(dataDir, 'data.json.tmp'), '残留的半截内容');

  await h.store.write(Object.assign(h.store.emptyState(), {
    notes: [{ id: 'n_atomic', text: '原子写入', done: false }],
  }), 0);

  const left = fs.readdirSync(dataDir).filter((f) => f.endsWith('.tmp'));
  t.deepEq(left, [], '不应残留临时文件');

  const parsed = JSON.parse(fs.readFileSync(h.dataFile(dataDir), 'utf8'));
  t.eq(parsed.notes[0].text, '原子写入', '内容应完整写入');
});

// ---------------- 备份 ----------------

/** 只数"自动每日备份"（data_日期_时间.json），排除带标签的手动备份 */
async function listDailyBackups(dir) {
  const all = await h.listBackupFiles(dir);
  return all.filter((f) => /^data_\d{8}_\d{6}(_\d+)?\.json$/.test(f));
}

t.test('每日备份：当天第一次写入前留一份，之后不重复留', async () => {
  await resetDir('backup');
  // 首次读取已把空数据落盘，所以第一次写入前已经"有数据可备份"
  const out = await h.store.write(Object.assign(h.store.emptyState(), {
    notes: [{ id: 'n_1', text: '初始内容', done: false }],
  }), 0);

  const backups0 = await listDailyBackups(dataDir);
  t.eq(backups0.length, 1, '第一次写入前应留 1 份自动备份（内容是落盘时的空数据）');
  const tpl = JSON.parse(fs.readFileSync(h.path.join(h.backupDir(dataDir), backups0[0]), 'utf8'));
  t.deepEq(tpl.notes, [], '这份备份里应还是空数据');
  t.eq(tpl.revision, 0, '备份里的 revision 应是写入前的值');

  await h.store.write(Object.assign(h.store.emptyState(), {
    notes: [{ id: 'n_2', text: '第二次', done: false }],
  }), out.revision);
  const daily1 = await listDailyBackups(dataDir);
  t.eq(daily1.length, 1,
    '同一天仍应只有 1 份自动备份（实际 ' + daily1.length + '：' +
    (await h.listBackupFiles(dataDir)).join(', ') + '）｜诊断：' + h.store.takeDiagnostics().join(' / '));

  // 当天再写两次，不应重复备份
  let rev = (await h.store.read()).revision;
  rev = (await h.store.write(Object.assign(h.store.emptyState(), { notes: [] }), rev)).revision;
  rev = (await h.store.write(Object.assign(h.store.emptyState(), { notes: [] }), rev)).revision;
  t.eq((await listDailyBackups(dataDir)).length, 1, '同一天多次写入仍只有 1 份自动备份');
});

t.test('备份内容是"备份那一刻"的数据快照', async () => {
  await resetDir('backup-snapshot');
  // 先准备一份有内容的数据
  await h.store.write(Object.assign(h.store.emptyState(), {
    notes: [{ id: 'n_snap', text: '快照内容', done: false }],
  }), 0);

  // 清掉备份，手动触发一次备份，再改数据 → 备份里应是改动前的内容
  const bdir = h.backupDir(dataDir);
  for (const f of fs.readdirSync(bdir)) fs.unlinkSync(h.path.join(bdir, f));
  await h.store.backupNow('snap');

  const rev = (await h.store.read()).revision;
  await h.store.write(Object.assign(h.store.emptyState(), {
    notes: [{ id: 'n_new', text: '改动后的内容', done: false }],
  }), rev);

  const all = await h.listBackupFiles(dataDir);
  const snap = all.find((f) => f.includes('snap'));
  t.ok(snap, '应存在手动备份');
  const text = fs.readFileSync(h.path.join(bdir, snap), 'utf8');
  t.includes(text, '快照内容', '备份里应是备份时刻的数据');
  t.notIncludes(text, '改动后的内容', '备份里不应有备份之后才发生的内容');
});
t.test('备份轮换：最多保留 20 份，删的是最旧的', async () => {
  await resetDir('rotate');
  const dir = h.backupDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });

  const names = [];
  for (let i = 0; i < 25; i++) {
    const name = 'data_202601' + String(i + 1).padStart(2, '0') + '_120000.json';
    fs.writeFileSync(h.path.join(dir, name), '{"schemaVersion":1,"tasks":[]}', 'utf8');
    names.push(name);
  }
  t.eq((await h.store.listBackups()).length, 25, '塞入后应有 25 份');

  const removed = await h.store.rotateBackups();
  t.eq(removed.length, 5, '应删除 5 份');

  const after = (await h.store.listBackups()).map((b) => b.name);
  t.eq(after.length, 20, '轮换后应剩下 20 份');
  t.eq(after.includes(names[0]), false, '最旧的一份应被删除');
  t.eq(after.includes(names[24]), true, '最新的一份应保留');
});

t.test('listBackups 只认 data_ 前缀的 json，坏文件与临时文件不算', async () => {
  await resetDir('listbackups');
  const dir = h.backupDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(h.path.join(dir, 'data_20260101_120000.json'), '{}', 'utf8');
  fs.writeFileSync(h.path.join(dir, 'data.broken_20260101_120000.json'), '{}', 'utf8');
  fs.writeFileSync(h.path.join(dir, 'data_20260101_120000.json.tmp'), '{}', 'utf8');
  fs.writeFileSync(h.path.join(dir, 'readme.txt'), 'hi', 'utf8');

  const list = await h.store.listBackups();
  t.deepEq(list.map((b) => b.name), ['data_20260101_120000.json'], '应只列出真正的备份');
});

// ---------------- 损坏恢复 ----------------

t.test('数据文件被改坏时：隔离坏文件并从最近备份恢复', async () => {
  await resetDir('corrupt');
  let out = await h.store.write(Object.assign(h.store.emptyState(), {
    notes: [{ id: 'n_good', text: '这是好数据', done: false }],
  }), 0);
  out = await h.store.write(Object.assign(h.store.emptyState(), {
    notes: [{ id: 'n_good', text: '这是好数据', done: false }, { id: 'n_2', text: '多一条', done: false }],
  }), out.revision);

  // 手动做一份包含当前内容的备份（自动备份是"当天首次写入前"的快照，不含最新改动）
  await h.store.backupNow('manual');
  const backups = await h.listBackupFiles(dataDir);
  t.ok(backups.length >= 1, '应已有可用备份（实际 ' + backups.length + ' 份）');
  const backupText = fs.readFileSync(h.path.join(h.backupDir(dataDir), backups[backups.length - 1]), 'utf8');
  t.includes(backupText, '这是好数据', '这份备份里应有可恢复的数据');

  await h.writeFileText(h.dataFile(dataDir), '{{{ 这不是 JSON');

  const recovered = await h.store.read();
  t.eq(recovered.recovered, true, '应标记为已恢复');
  t.ok(recovered.recoveredFrom, '应说明从哪份备份恢复');
  t.eq(recovered.state.notes[0].text, '这是好数据', '应恢复到备份里的内容');

  const broken = fs.readdirSync(h.backupDir(dataDir)).filter((f) => f.startsWith('data.broken_'));
  t.eq(broken.length, 1, '坏文件应被改名隔离，保留 1 份证据');
  t.includes(fs.readFileSync(h.path.join(h.backupDir(dataDir), broken[0]), 'utf8'), '这不是 JSON', '隔离出来的应是原始坏内容');

  const now = JSON.parse(fs.readFileSync(h.dataFile(dataDir), 'utf8'));
  t.eq(now.notes[0].text, '这是好数据', '主文件应被恢复后的内容覆盖');
});

t.test('全部备份也坏了时，继续往前找可用的那份', async () => {
  await resetDir('corrupt-skip');
  // 先做一份"第一版"的可用备份
  await h.store.write(Object.assign(h.store.emptyState(), {
    notes: [{ id: 'n_a', text: '第一版', done: false }],
  }), 0);
  await h.store.backupNow('good');

  // 再改成"第二版"，并做一份更新的备份，然后把它弄坏
  const rev = (await h.store.read()).revision;
  await h.store.write(Object.assign(h.store.emptyState(), {
    notes: [{ id: 'n_b', text: '第二版', done: false }],
  }), rev);
  await h.store.backupNow('newer');

  const files = await h.listBackupFiles(dataDir);
  const newest = files[files.length - 1];
  t.includes(newest, 'newer', '最新那份应是刚做的 newer 备份');
  const good = files.find((f) => f.includes('good'));
  t.ok(good, '应存在更早的可用备份：' + files.join(', '));

  await h.writeFileText(h.path.join(h.backupDir(dataDir), newest), 'broken backup');
  await h.writeFileText(h.dataFile(dataDir), 'broken main');

  const r = await h.store.read();
  t.eq(r.recovered, true, '应恢复成功');
  t.notEq(newest, r.recoveredFrom, '不应从坏掉的那份恢复');
  t.eq(r.recoveredFrom, good, '应从更早的那份可用备份恢复');
  t.eq(r.state.notes[0].text, '第一版', '应恢复到更早的可用备份');
});

t.test('没有任何备份可用时，坏文件也能让应用起来（回到空数据）', async () => {
  await resetDir('corrupt-nobackup');
  await h.writeFileText(h.dataFile(dataDir), 'not json at all');
  const r = await h.store.read();
  t.eq(r.recovered, true, '应标记为已恢复');
  t.deepEq(r.state.tasks, [], '应回到空数据而不是崩溃');
  t.ok(fs.existsSync(h.dataFile(dataDir)), '主文件应被重建');
});

t.test('主文件是合法 JSON 但不是对象时也按损坏处理', async () => {
  await resetDir('corrupt-nonobject');
  await h.writeFileText(h.dataFile(dataDir), '[1,2,3]');
  const r = await h.store.read();
  t.eq(r.recovered, true, '顶层是数组应视为损坏');
  t.deepEq(r.state.tasks, [], '应回到空数据');
});

// ---------------- 冲突与导入 ----------------

t.test('revision 冲突时拒绝写入（防止多窗口互相覆盖）', async () => {
  await resetDir('conflict');
  const out1 = await h.store.write(Object.assign(h.store.emptyState(), {
    notes: [{ id: 'n_1', text: '窗口A的修改', done: false }],
  }), 0);
  t.eq(out1.ok, true, '第一次写入应成功');

  const out2 = await h.store.write(Object.assign(h.store.emptyState(), {
    notes: [{ id: 'n_2', text: '窗口B的修改', done: false }],
  }), 0);
  t.eq(out2.ok, false, '过期 revision 应被拒绝');
  t.eq(out2.currentRevision, out1.revision, '应返回当前真实 revision');

  const now = await h.store.read();
  t.eq(now.state.notes[0].text, '窗口A的修改', 'B 的写入不应覆盖 A 的数据');
});

t.test('不带 baseRevision 时不参与冲突校验（服务端内部写入）', async () => {
  await resetDir('nobase');
  const a = await h.store.write(Object.assign(h.store.emptyState(), { notes: [] }), undefined);
  const b = await h.store.write(Object.assign(h.store.emptyState(), { notes: [] }), undefined);
  t.eq(a.ok, true, '第一次应成功');
  t.eq(b.ok, true, '第二次也应成功');
  t.eq(b.revision, a.revision + 1, 'revision 应继续递增');
});

t.test('同一秒内连续备份不会互相覆盖（回归）', async () => {
  await resetDir('backup-unique');
  await h.store.write(Object.assign(h.store.emptyState(), {
    notes: [{ id: 'n_u1', text: '第一份', done: false }],
  }), 0);

  // 连续三次手动备份：文件名时间戳只精确到秒，必须靠序号区分
  const a = await h.store.backupNow('dup');
  const b = await h.store.backupNow('dup');
  const c = await h.store.backupNow('dup');

  t.notEq(a, b, '第一、二次备份不应是同一个文件');
  t.notEq(b, c, '第二、三次备份不应是同一个文件');

  const files = fs.readdirSync(h.backupDir(dataDir)).filter((f) => f.includes('dup'));
  t.eq(files.length, 3, '三次备份应留下三个文件（实际 ' + files.length + '）');

  // 每次备份都应是一份可用数据
  for (const f of files) {
    const parsed = JSON.parse(fs.readFileSync(h.path.join(h.backupDir(dataDir), f), 'utf8'));
    t.eq(parsed.schemaVersion, 1, f + ' 应是一份可解析的备份');
  }
});

t.test('导入备份：先留一份当前数据，再整体覆盖', async () => {
  await resetDir('import');
  await h.store.write(Object.assign(h.store.emptyState(), {
    notes: [{ id: 'n_now', text: '当前数据', done: false }],
  }), 0);

  const incoming = h.store.emptyState();
  incoming.notes = [{ id: 'n_old', text: '备份里的数据', done: false }];
  incoming.tasks = [{ id: 't_old', title: '备份里的任务', module: 'dev', date: '2026-01-01', done: false }];

  const out = await h.store.importState(incoming);
  t.eq(out.ok, true, '导入应成功');
  t.ok(out.preBackup, '应返回导入前的自动备份路径');

  const now = await h.store.read();
  t.eq(now.state.notes[0].text, '备份里的数据', '应被备份内容覆盖');
  t.eq(now.state.tasks[0].title, '备份里的任务', '任务也应被覆盖');

  const pre = fs.readdirSync(h.backupDir(dataDir)).filter((f) => f.includes('preimport'));
  t.eq(pre.length, 1, '应留存 1 份导入前的数据，便于反悔');
  t.includes(fs.readFileSync(h.path.join(h.backupDir(dataDir), pre[0]), 'utf8'), '当前数据', '导入前备份里应是原来的数据');
});

t.test('清空全部数据前会自动备份', async () => {
  await resetDir('clear');
  await h.store.write(Object.assign(h.store.emptyState(), {
    notes: [{ id: 'n_x', text: '要清掉的数据', done: false }],
  }), 0);

  await h.store.clearAll();

  const now = await h.store.read();
  t.deepEq(now.state.notes, [], '清空后不应有数据');
  const pre = fs.readdirSync(h.backupDir(dataDir)).filter((f) => f.includes('preimport'));
  t.ok(pre.length >= 1, '清空前应已自动备份');
  t.includes(fs.readFileSync(h.path.join(h.backupDir(dataDir), pre[0]), 'utf8'), '要清掉的数据', '清空前的备份里应还有数据');
});

// ---------------- HTTP 接口层 ----------------

t.test('GET /api/state 返回完整结构', async () => {
  await resetDir('api-state');
  const r = await h.req(server.port, 'GET', '/api/state');
  t.eq(r.status, 200, '状态码');
  t.ok(r.json.state && typeof r.json.state === 'object', '应返回 state');
  t.eq(typeof r.json.revision, 'number', '应返回 revision');
  t.includes(r.json.path, 'data.json', '应返回文件路径');
  t.eq(typeof r.json.sizeKB, 'number', '应返回 sizeKB');
  t.eq(r.json.recovered, false, '正常情况 recovered 为 false');
});

t.test('PUT /api/state 正常保存并返回新 revision', async () => {
  await resetDir('api-put');
  const cur = await h.readState(server.port);
  const state = cur.state;
  state.tasks.push({ id: 't_api', title: '接口写入的任务', module: 'dev', date: '2026-10-08', done: false, priority: 'normal', note: '' });

  const r = await h.req(server.port, 'PUT', '/api/state', { state, baseRevision: cur.revision });
  t.eq(r.status, 200, '状态码');
  t.eq(r.json.ok, true, 'ok');
  t.eq(r.json.revision, cur.revision + 1, 'revision 应自增');

  const back = await h.readState(server.port);
  t.eq(back.state.tasks[0].title, '接口写入的任务', '数据应已保存');
});

t.test('PUT /api/state 的 revision 过期时返回 409 且不覆盖', async () => {
  await resetDir('api-conflict');
  const cur = await h.readState(server.port);

  const s1 = JSON.parse(JSON.stringify(cur.state));
  s1.notes.push({ id: 'n_a', text: 'A 写的', done: false });
  const okRes = await h.req(server.port, 'PUT', '/api/state', { state: s1, baseRevision: cur.revision });
  t.eq(okRes.status, 200, 'A 应写入成功');

  const s2 = JSON.parse(JSON.stringify(cur.state));
  s2.notes.push({ id: 'n_b', text: 'B 写的', done: false });
  const conflict = await h.req(server.port, 'PUT', '/api/state', { state: s2, baseRevision: cur.revision });
  t.eq(conflict.status, 409, 'B 应收到 409');
  t.eq(conflict.json.code, 'REVISION_CONFLICT', '错误码');
  t.eq(conflict.json.currentRevision, okRes.json.revision, '应返回当前 revision');

  const back = await h.readState(server.port);
  t.deepEq(back.state.notes.map((n) => n.text), ['A 写的'], 'B 的内容不应写入');
});

t.test('PUT /api/state 参数非法时返回 400', async () => {
  await resetDir('api-badput');
  const noState = await h.req(server.port, 'PUT', '/api/state', { baseRevision: 0 });
  t.eq(noState.status, 400, '缺少 state 应 400');
  t.eq(noState.json.code, 'BAD_PAYLOAD', '错误码 BAD_PAYLOAD');

  const badJson = await h.req(server.port, 'PUT', '/api/state', '{not json', { 'Content-Type': 'application/json' });
  t.eq(badJson.status, 400, '非法 JSON 应 400');
  t.eq(badJson.json.code, 'BAD_JSON', '错误码 BAD_JSON');
});

t.test('请求体超过 20MB 上限返回 413', async () => {
  await resetDir('api-large');
  const huge = { state: { tasks: [{ id: 't', title: 'x'.repeat(21 * 1024 * 1024) }] }, baseRevision: 0 };
  const r = await h.req(server.port, 'PUT', '/api/state', huge);
  t.eq(r.status, 413, '应返回 413（实际 ' + r.status + '）');

  // 超限后服务仍应正常工作，数据不该被写坏
  const after = await h.req(server.port, 'GET', '/api/state');
  t.eq(after.status, 200, '超限请求后服务仍应可用');
  t.deepEq(after.json.state.tasks, [], '超限请求不应写入任何数据');
});

t.test('用 chunked 绕过 Content-Length 也拦得住', async () => {
  await resetDir('api-large-chunked');
  const http = require('node:http');
  const port = server.port;

  // 记录测试期间进程级兜底捕获到的异常，用完后还原
  const caught = [];
  const prevUncaught = process.listeners('uncaughtException');
  for (const l of prevUncaught) process.removeListener('uncaughtException', l);
  const collector = (err) => caught.push(err);
  process.on('uncaughtException', collector);

  const status = await new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };

    const r = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/api/state',
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' },
      },
      (res) => { res.resume(); finish(res.statusCode); }
    );
    r.on('error', (err) => finish(err.code === 'ECONNRESET' ? 413 : 0));
    r.on('socket', (socket) => {
      socket.on('error', (err) => finish(err.code === 'ECONNRESET' ? 413 : 0));
    });

    // 不发 Content-Length，靠分块持续发送，累计超过 20MB
    const chunk = Buffer.alloc(1024 * 1024, 0x78);
    for (let i = 0; i < 21; i++) {
      if (done) break;
      r.write(chunk);
    }
    r.end();
  });

  await h.sleep(250);
  process.removeListener('uncaughtException', collector);
  for (const l of prevUncaught) process.on('uncaughtException', l);

  t.ok(caught.length <= 2, '断线噪音不应刷屏（实际捕获 ' + caught.length + ' 条）');
  t.eq(status, 413, 'chunked 超限也应被拦下（实际 ' + status + '）');

  const after = await h.req(port, 'GET', '/api/state');
  t.eq(after.status, 200, '服务仍应可用');
  t.deepEq(after.json.state.tasks, [], '不应写入任何数据');
});

t.test('POST /api/import 校验备份文件合法性', async () => {
  await resetDir('api-import');

  const notJson = await h.req(server.port, 'POST', '/api/import', 'hello', { 'Content-Type': 'application/json' });
  t.eq(notJson.status, 400, '非 JSON 应 400');
  t.eq(notJson.json.code, 'BAD_JSON', '错误码 BAD_JSON');

  const alien = await h.req(server.port, 'POST', '/api/import', { hello: 'world' });
  t.eq(alien.status, 400, '无关对象应 400');
  t.eq(alien.json.code, 'NOT_A_BACKUP', '错误码 NOT_A_BACKUP');

  const good = h.store.emptyState();
  good.notes = [{ id: 'n_imp', text: '从备份恢复', done: false }];
  const okRes = await h.req(server.port, 'POST', '/api/import', good);
  t.eq(okRes.status, 200, '合法备份应 200');
  t.eq(okRes.json.ok, true, 'ok');
  t.ok(okRes.json.preBackup, '应返回导入前备份路径');

  const back = await h.readState(server.port);
  t.eq(back.state.notes[0].text, '从备份恢复', '数据应已恢复');
});

t.test('GET /api/export 返回可下载的备份文件', async () => {
  await resetDir('api-export');
  await h.mutate(server.port, (s) => { s.notes.push({ id: 'n_exp', text: '要导出的内容', done: false }); });

  const r = await h.req(server.port, 'GET', '/api/export');
  t.eq(r.status, 200, '状态码');
  t.includes(String(r.headers['content-disposition']), 'attachment', '应作为附件下载');
  t.includes(String(r.headers['content-disposition']), '.json', '文件名应是 json');
  const parsed = JSON.parse(r.raw);
  t.eq(parsed.notes[0].text, '要导出的内容', '导出内容应包含数据');
  t.ok(Array.isArray(parsed.tasks), '导出应是完整数据结构');
});

t.test('GET /api/health 会统计各类数据条数', async () => {
  await resetDir('api-health');
  await h.mutate(server.port, (s) => {
    s.tasks.push({ id: 't1', title: '任务一', module: 'dev', date: '2026-10-08', done: false });
    s.tasks.push({ id: 't2', title: '任务二', module: 'study', date: '2026-10-08', done: true });
    s.notes.push({ id: 'n1', text: '备忘', done: false });
    s.devTasks.push({ id: 'd1', title: '修 bug', status: 'doing' });
    s.devIdeas.push({ id: 'i1', text: '灵感', handled: false });
    s.studyItems.push({ id: 's1', title: '看完事件循环', kind: 'read', status: 'doing', minutes: 30 });
    s.diet.recipes.push({ id: 'rc1', name: '番茄牛腩', note: '' });
    s.diet.shopping.push({ id: 'sp1', name: '牛腩', bought: false });
  });

  const r = await h.req(server.port, 'GET', '/api/health');
  t.eq(r.status, 200, '状态码');
  t.eq(r.json.stats['任务'], 2, '任务数');
  t.eq(r.json.stats['备忘'], 1, '备忘数');
  t.eq(r.json.stats['开发待办'], 1, '开发待办数');
  t.eq(r.json.stats['灵感'], 1, '灵感数');
  t.eq(r.json.stats['学习条目'], 1, '学习条目数');
  t.eq(r.json.stats['菜谱'], 1, '菜谱数');
  t.eq(r.json.stats['采买'], 1, '采买数');

  // 已移除模块的统计项不应再出现
  for (const gone of ['自媒体', '咨询待办', '咨询记录', '游戏', '放松安排']) {
    t.eq(r.json.stats[gone], undefined, '不应再有「' + gone + '」统计项');
  }
  // 健身已加回来：统计项应该有
  t.eq(r.json.stats['健身记录'], 0, '应有「健身记录」统计项');
});

// ---------------- 已移除模块的数据清理 ----------------

t.test('旧数据里被移除模块的内容会被清掉，且给出清理报告', async () => {
  await resetDir('purge');
  const legacy = Object.assign(h.store.emptyState(), {
    media: [{ id: 'm1', title: '抖音发布我的视频' }],
    consultTasks: [{ id: 'c1', title: '联系导师' }],
    consultRecords: [{ id: 'r1', who: '导师' }],
    games: [{ id: 'g1', name: '塞尔达' }],
    playPlan: [{ id: 'p1', weekday: 3 }],
    tasks: [
      { id: 't1', title: '示例任务', module: 'general', date: '2026-10-13' },
      { id: 't2', title: '自媒体任务', module: 'media', date: '2026-10-13' },
      { id: 't3', title: '咨询任务', module: 'consult', date: '2026-10-13' },
      { id: 't4', title: '游戏任务', module: 'game', date: '2026-10-13' },
    ],
  });

  const cleaned = h.store.normalize(legacy);

  t.eq(cleaned.media, undefined, 'media 字段应被清掉');
  t.eq(cleaned.consultTasks, undefined, 'consultTasks 字段应被清掉');
  t.eq(cleaned.consultRecords, undefined, 'consultRecords 字段应被清掉');
  t.eq(cleaned.games, undefined, 'games 字段应被清掉');
  t.eq(cleaned.playPlan, undefined, 'playPlan 字段应被清掉');

  t.eq(cleaned.tasks.length, 1, '只应留下不属已移除模块的任务');
  t.eq(cleaned.tasks[0].title, '示例任务', '留下的应是通用任务');
  t.eq(cleaned.studyItems.length, 0, '应补出 studyItems 字段');

  // 写入磁盘后再读回，确认清理真的落盘
  await h.store.write(cleaned, undefined);
  const back = await h.store.read();
  t.eq(back.state.tasks.length, 1, '磁盘上也应只剩 1 条任务');
  const raw = JSON.parse(fs.readFileSync(h.dataFile(dataDir), 'utf8'));
  t.eq('media' in raw, false, '磁盘文件里不应再有 media 字段');
  t.eq('games' in raw, false, '磁盘文件里不应再有 games 字段');
});

t.test('读取时会清理旧字段并写回磁盘（回归：清理只发生在内存里）', async () => {
  await resetDir('sanitize');

  // 手写一份"旧版本"数据：带已移除模块的字段，且缺 studyItems
  const legacy = {
    schemaVersion: 1,
    revision: 7,
    updatedAt: '2026-10-01T00:00:00.000Z',
    tasks: [
      { id: 't_keep', title: '示例任务', module: 'general', date: '2026-10-13', done: false },
      { id: 't_drop', title: '自媒体任务', module: 'media', date: '2026-10-13', done: false },
      { id: 't_fit', title: '健身任务', module: 'fitness', date: '2026-10-13', done: false },
    ],
    notes: [],
    media: [{ id: 'm1', title: '抖音发布我的视频' }],
    devTasks: [],
    devIdeas: [],
    consultTasks: [{ id: 'c1', title: '联系导师' }],
    consultRecords: [],
    fitness: {
      routine: [{ label: '胸 + 三头', rest: false, exercises: [{ id: 'e1', name: '卧推', sets: 4, reps: 12 }] }],
      records: { '2026-10-08': { label: '胸 + 三头', exercises: {}, finished: true } },
    },
    diet: { meals: {}, recipes: [], shopping: [] },
    games: [{ id: 'g1', name: '塞尔达' }],
    playPlan: [],
    settings: { fitnessWeeklyGoal: 5, density: 'comfortable' },
  };
  await h.store.write(legacy, 7);

  // 写回去的是"清理前"的内容吗？注意 write 内部也会 read，可能已经清理过一次，
  // 所以这里直接手写文件，确保磁盘上确实是旧格式
  fs.writeFileSync(h.dataFile(dataDir), JSON.stringify(legacy, null, 2) + '\n', 'utf8');
  const onDiskBefore = fs.readFileSync(h.dataFile(dataDir), 'utf8');
  t.includes(onDiskBefore, '"media"', '前置条件：磁盘上确实还有旧字段');
  t.includes(onDiskBefore, '"fitness"', '前置条件：磁盘上确实还有健身字段');

  const r = await h.store.read();

  t.eq(r.sanitized, true, '应报告自己清理并写回了磁盘');
  t.eq(r.sanitizeFailed, null, '写回不应失败');
  t.eq(r.revision, 7, '版本号不应被清理动作改变');
  t.eq(r.updatedAt, '2026-10-01T00:00:00.000Z', '时间戳不应被清理动作改变');

  // 内存里是干净的
  t.eq(r.state.media, undefined, '内存状态里不该有 media');
  t.eq(r.state.games, undefined, '内存状态里不该有 games');
  // 健身是加回来的模块，读取时**不能**被当成旧残留清掉
  t.ok(r.state.fitness && Array.isArray(r.state.fitness.log), '内存状态里应有 fitness.log');
  t.eq('fitnessWeeklyGoal' in r.state.settings, true, '设置里应保留健身目标');
  t.ok(Array.isArray(r.state.studyItems), '应补上 studyItems');
  t.eq(r.state.tasks.length, 2, '通用任务与健身任务都应留下（健身不再是已移除模块）');
  t.eq(r.state.tasks[0].title, '示例任务', '通用任务必须保留');
  t.ok(r.state.tasks.some((x) => x.module === 'fitness'),
    '健身任务必须保留——把 fitness 当残留会删掉用户新记的数据');

  // 磁盘上也被清理了
  const onDiskAfter = fs.readFileSync(h.dataFile(dataDir), 'utf8');
  t.notIncludes(onDiskAfter, '"media"', '磁盘文件里不该再有 media');
  t.notIncludes(onDiskAfter, '"consultTasks"', '磁盘文件里不该再有 consultTasks');
  t.notIncludes(onDiskAfter, '"games"', '磁盘文件里不该再有 games');
  /*
   * 健身已加回来：磁盘上应当留有 fitness 的新结构（而不是旧结构）。
   * 这里同时验证"旧结构被换掉"与"健身数据不再被当残留清掉"。
   */
  t.includes(onDiskAfter, '"fitness"', '磁盘上应保留 fitness 字段');
  t.includes(onDiskAfter, '"log"', 'fitness 应是新的 log 结构');
  t.notIncludes(onDiskAfter, '"routine"', '旧的 fitness.routine 不该留在文件里');
  t.includes(onDiskAfter, '健身任务', '健身模块名下的任务必须留在文件里');
  t.notIncludes(onDiskAfter, '自媒体任务', '被删模块名下的任务也不该留在文件里');
  t.includes(onDiskAfter, '示例任务', '通用任务应仍在文件里');

  const parsed = JSON.parse(onDiskAfter);
  t.eq(parsed.revision, 7, '磁盘上的版本号也应保持不变');

  // 再读一次：这次没有可清理的内容了，不该重复写回
  const r2 = await h.store.read();
  t.eq(r2.sanitized, false, '已经是干净格式时不应再写一次磁盘');
});

// ---------------- 组卷：先起服务，再跑全部用例 ----------------

(async () => {
  dataDir = await h.useDataDir(await h.makeTmpDir('p2'));
  server = await h.startServer({ port: h.TEST_PORT_BASE, dataDir });
  try {
    await t.run();
  } finally {
    await server.stop();
  }
})();
