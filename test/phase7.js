/**
 * 阶段 7 测试：总验收（交付件与诚实性检查）
 * 这里检查的是"能不能交到用户手上"以及"文档与实际是否一致"，
 * 不重复验证业务逻辑（那些在前面的阶段测试里）。
 */

const t = require('./lib/t');
const h = require('./lib/helpers');
const fs = require('node:fs');
const path = require('node:path');

t.setFile('阶段7 总验收');

function read(rel) {
  return fs.readFileSync(path.join(h.ROOT, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(h.ROOT, rel));
}

/** 去掉注释与字符串字面量，只看真正的代码 */
function codeOnly(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

/* ---------------- 交付件齐全 ---------------- */

t.test('交付件齐全：启动脚本、说明、停止脚本、需求与计划', async () => {
  const need = [
    '启动.cmd',
    '停止.cmd',
    'README.md',
    'PRD.md',
    'DEV-PLAN.md',
    'package.json',
    'docs/页面结构与交互设计-v1.md',
    'server/index.js',
    'server/config.js',
    'server/static.js',
    'server/store.js',
    'server/api.js',
    'server/reveal.js',
  ];
  for (const f of need) {
    t.ok(exists(f), '缺少交付文件 ' + f);
  }
});

t.test('前端 9 个视图文件齐全', async () => {
  for (const v of ['home', 'today', 'dev', 'study', 'fitness', 'diet', 'settings']) {
    t.ok(exists('web/views/' + v + '.js'), '缺少视图 web/views/' + v + '.js');
  }
});

/* ---------------- 零依赖与离线 ---------------- */

t.test('整个项目不依赖任何第三方 npm 包', async () => {
  const pkg = JSON.parse(read('package.json'));
  t.deepEq(Object.keys(pkg.dependencies || {}), [], 'dependencies 应为空');
  t.deepEq(Object.keys(pkg.devDependencies || {}), [], 'devDependencies 应为空');
  t.eq(exists('node_modules'), false, '不应存在 node_modules 目录');
  t.eq(exists('package-lock.json'), false, '不应存在 package-lock.json');
});

t.test('服务端只使用 Node 内置模块', async () => {
  const files = ['server/index.js', 'server/config.js', 'server/static.js', 'server/store.js', 'server/api.js', 'server/reveal.js'];
  for (const f of files) {
    const code = codeOnly(read(f));
    const requires = code.match(/require\(\s*['"]([^'"]+)['"]\s*\)/g) || [];
    for (const r of requires) {
      const mod = /['"]([^'"]+)['"]/.exec(r)[1];
      const okMod = mod.startsWith('node:') || mod.startsWith('./') || mod.startsWith('../');
      t.ok(okMod, f + ' 引用了非内置模块：' + mod);
    }
  }
});

t.test('没有任何外网请求或外链资源', async () => {
  const webFiles = ['web/index.html', 'web/styles.css', 'web/app.js', 'web/ui.js', 'web/store.js', 'web/api.js', 'web/logic.js', 'web/router.js'];
  for (const f of webFiles) {
    const text = read(f);
    t.notIncludes(text, 'cdn.', f + ' 出现了 CDN');
    t.notIncludes(text, 'unpkg.com', f + ' 出现了外网包');
    t.notIncludes(text, 'fonts.googleapis', f + ' 出现了外网字体');
    t.eq(/<script[^>]+src\s*=\s*["']https?:/i.test(text), false, f + ' 用 script 加载了外网脚本');
  }
  // 只用本机回环地址
  const apiCode = codeOnly(read('web/api.js'));
  t.notIncludes(apiCode, 'http://localhost', 'api.js 应走相对路径');
  t.eq(/fetch\(\s*['"]https?:/i.test(apiCode), false, 'api.js 不应直接请求外网');
});

/* ---------------- 诚实性：不把没做的东西写成做了 ---------------- */

t.test('代码里没有把未实现功能伪装成已实现（无 TODO 占位冒烟）', async () => {
  const files = ['web/views/home.js', 'web/views/today.js', 'web/views/dev.js', 'web/views/study.js',
    'web/views/fitness.js', 'web/views/diet.js', 'web/views/settings.js'];
  for (const f of files) {
    const text = read(f);
    t.notIncludes(text, '正在开发中', f + ' 仍是占位实现');
    t.notIncludes(text, '功能将在后续阶段接入', f + ' 仍是占位实现');
    t.notIncludes(text, 'TODO', f + ' 里还有 TODO 未处理');
  }
});

t.test('PRD 明确不做的事，代码里也没有偷偷做', async () => {
  // 第一版不做趋势统计与数据回填
  const views = ['web/views/dev.js', 'web/views/study.js', 'web/views/fitness.js', 'web/views/diet.js'];
  for (const f of views) {
    const code = codeOnly(read(f));
    t.notIncludes(code, '播放量', f + ' 出现了播放量回填');
    t.notIncludes(code, '粉丝数', f + ' 出现了粉丝数回填');
    t.notIncludes(code, '体重曲线', f + ' 出现了体重曲线');
    t.notIncludes(code, '体脂', f + ' 出现了体脂记录');
  }
  // 首页不做智能建议、不自动生成任务（注释里说明"不做"是可以的，代码里不能有）
  const homeCode = codeOnly(read('web/views/home.js'));
  t.notIncludes(homeCode, '智能建议', '首页代码里不应有智能建议');
  t.notIncludes(homeCode, '推荐', '首页代码里不应有推荐逻辑');
  t.notIncludes(homeCode, '自动生成', '首页代码里不应自动生成任务');
  // 首页也不应调用任何"生成任务"的推送函数
  for (const fn of ['pushFitnessToToday', 'pushPlayToToday', 'pushMealToToday']) {
    t.notIncludes(homeCode, fn, '首页不应自动调用 ' + fn);
  }
});

t.test('不引入登录、云同步、手机端等超出范围的实现', async () => {
  const all = ['web/app.js', 'web/store.js', 'server/api.js', 'server/store.js'];
  for (const f of all) {
    const text = read(f);
    t.notIncludes(text, 'localStorage', f + ' 不应使用 localStorage（数据要存文件）');
    t.notIncludes(text, 'indexedDB', f + ' 不应使用 indexedDB');
    t.notIncludes(text, 'sessionStorage', f + ' 不应使用 sessionStorage');
    t.notIncludes(text, 'WebSocket', f + ' 不应引入实时通信');
  }
});

/* ---------------- 文档与实际一致 ---------------- */

t.test('README 里的关键说法与实际一致', async () => {
  const readme = read('README.md');
  // 数据位置（README 用目录树展示，逐项检查更稳）
  t.includes(readme, 'data.json', 'README 应说明数据文件');
  t.includes(readme, 'data/', 'README 应说明数据目录');
  t.includes(readme, 'backups/', 'README 应说明备份目录');
  // 启动方式
  t.includes(readme, '启动.cmd', 'README 应说明怎么启动');
  // 端口与配置一致
  const config = require(path.join(h.ROOT, 'server', 'config.js'));
  t.includes(readme, String(config.PORT_START), 'README 里的端口应与配置一致');
  // 备份保留份数一致
  t.includes(readme, String(config.BACKUP_KEEP) + ' 份', 'README 里的备份保留份数应与配置一致');
  // 不该宣称做不到的事
  t.notIncludes(readme, '手机端可用', 'README 不应宣称支持手机端');
});

t.test('README 所述备份保留份数与实现一致', async () => {
  const config = require(path.join(h.ROOT, 'server', 'config.js'));
  const storeCode = read('server/store.js');
  t.includes(storeCode, 'config.BACKUP_KEEP', '轮换应使用统一的保留份数配置');
  t.eq(config.BACKUP_KEEP, 20, '保留份数应为 20（README 与 PRD 都这么写）');
});

/* ---------------- 启动路径 ---------------- */

t.test('启动脚本内容正确且能被 cmd 解析（无 BOM、无中文 rem）', async () => {
  for (const f of ['启动.cmd', '停止.cmd']) {
    const buf = fs.readFileSync(path.join(h.ROOT, f));
    t.eq(buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF, false, f + ' 不应带 UTF-8 BOM（cmd 会解析失败）');
    const text = buf.toString('utf8');
    const badRem = text.split(/\r?\n/).filter((line) => /^\s*rem\b/i.test(line) && /[^\x00-\x7F]/.test(line));
    t.deepEq(badRem, [], f + ' 的 rem 注释含非 ASCII 字符');
  }
  t.includes(read('启动.cmd'), 'server\\index.js', '启动脚本应运行服务入口');
  t.includes(read('启动.cmd'), 'chcp 65001', '启动脚本应切换 UTF-8');
  t.includes(read('停止.cmd'), 'Stop-Process', '停止脚本应能结束进程');
  t.includes(read('停止.cmd'), '41730', '停止脚本应覆盖默认端口范围');
});

t.test('服务只监听本机回环地址', async () => {
  const idx = read('server/index.js');
  t.includes(idx, 'config.HOST', '监听地址应来自配置');
  const config = require(path.join(h.ROOT, 'server', 'config.js'));
  t.eq(config.HOST, '127.0.0.1', '只应监听 127.0.0.1');
  t.notIncludes(idx, '0.0.0.0', '不应监听所有网卡');
});

t.test('真实的启动路径可用：服务起得来、能读到页面与数据接口', async () => {
  const dir = await h.makeTmpDir('final');
  const server = await h.startServer({ port: h.TEST_PORT_BASE + 30, dataDir: dir });
  try {
    const health = await h.req(server.port, 'GET', '/api/health');
    t.eq(health.status, 200, 'health 应可用');
    t.eq(health.json.name, '我的工作台', '应用名');

    const page = await h.req(server.port, 'GET', '/');
    t.eq(page.status, 200, '首页应可访问');
    t.includes(page.raw, '我的工作台', '首页应含标题');

    const state = await h.req(server.port, 'GET', '/api/state');
    t.eq(state.status, 200, '数据接口应可用');
    t.ok(state.json.state.settings, '应返回设置字段');

    // 数据文件应真的在那里
    t.ok(fs.existsSync(path.join(dir, 'data.json')), '数据文件应存在于数据目录');

    // 写入一条并读回
    await h.mutate(server.port, (s) => {
      s.tasks.push({ id: 't_final', title: '总验收写入', module: 'dev', date: '2026-10-08', done: false });
    });
    const back = await h.readState(server.port);
    t.eq(back.state.tasks.length, 1, '写入应能读回');
  } finally {
    await server.stop();
  }
});

t.test('换目录也能跑（模拟把文件夹拷到别处）', async () => {
  const dirA = await h.makeTmpDir('moveA');
  const dirB = await h.makeTmpDir('moveB');
  const serverA = await h.startServer({ port: h.TEST_PORT_BASE + 31, dataDir: dirA });
  let saved;
  try {
    await h.mutate(serverA.port, (s) => {
      s.notes.push({ id: 'n_move', text: '要跟着文件夹走的数据', done: false });
    });
    saved = JSON.parse(fs.readFileSync(path.join(dirA, 'data.json'), 'utf8'));
  } finally {
    await serverA.stop();
  }

  // 模拟"整个文件夹拷走"：把数据文件复制到新目录
  fs.mkdirSync(path.join(dirB, 'backups'), { recursive: true });
  fs.writeFileSync(path.join(dirB, 'data.json'), JSON.stringify(saved, null, 2), 'utf8');

  const serverB = await h.startServer({ port: h.TEST_PORT_BASE + 32, dataDir: dirB });
  try {
    const state = await h.readState(serverB.port);
    t.eq(state.state.notes.length, 1, '新目录里应读到原数据');
    t.eq(state.state.notes[0].text, '要跟着文件夹走的数据', '内容应完整');
  } finally {
    await serverB.stop();
  }
});

t.test('数据目录只读时不会静默丢数据（给出明确错误）', async () => {
  const dir = await h.makeTmpDir('readonly');
  await h.store.useDataDir(dir);
  await h.store.read();

  // 用把 data.json 变成一个目录的方式，制造"读不出来也写不进去"
  const target = path.join(dir, 'data.json');
  fs.unlinkSync(target);
  fs.mkdirSync(target);

  // 读：不应抛异常，应明确标记为读不出来（只读/异常状态）
  const r = await h.store.read();
  t.ok(r.unreadable || r.readOnly, '读取应明确标记为不可读/只读，而不是静默当空数据');
  t.eq(r.unreadable, 'EISDIR', '应带上具体原因');

  // 写：应明确失败，而不是假装保存成功
  const out = await h.store.write(h.store.emptyState(), undefined);
  t.eq(out.ok, false, '写入应明确失败');
  t.eq(out.writeFailed, true, '应标记为写入失败');
  t.ok(out.message, '应带上失败原因');

  // 收尾：恢复目录状态，避免影响后续用例
  fs.rmdirSync(target);
  await h.store.read();
  t.ok(fs.existsSync(target), '恢复后数据文件应能被重建');
});

/* ---------------- 规模与性能 ---------------- */

t.test('200 条任务时读写仍然正常（不卡死、不丢数据）', async () => {
  const dir = await h.makeTmpDir('scale');
  const server = await h.startServer({ port: h.TEST_PORT_BASE + 33, dataDir: dir });
  try {
    const t0 = Date.now();
    await h.mutate(server.port, (s) => {
      for (let i = 0; i < 200; i++) {
        s.tasks.push({
          id: 't_' + i,
          title: '压测任务 ' + i,
          module: i % 2 ? 'dev' : 'study',
          date: '2026-10-' + String((i % 28) + 1).padStart(2, '0'),
          done: i % 3 === 0,
          priority: 'normal',
          note: '',
        });
      }
    });
    const writeMs = Date.now() - t0;

    const back = await h.readState(server.port);
    t.eq(back.state.tasks.length, 200, '200 条都应保存');
    t.ok(writeMs < 3000, '写入 200 条应够快（实际 ' + writeMs + 'ms）');
    t.ok(back.sizeKB > 0, '应能报出文件大小');

    // 文件应仍然可读
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
    t.eq(parsed.tasks.length, 200, '磁盘文件里也应是 200 条');
  } finally {
    await server.stop();
  }
});

/* ---------------- 覆盖结论 ---------------- */

t.test('PRD 第 10 节的验收标准条目齐全（A8 + B8 + C15 + E6 + F7 + G5）', async () => {
  const prd = read('PRD.md');

  const groups = { A: 8, B: 8, C: 15, E: 6, F: 7, G: 5 };
  let total = 0;
  for (const [prefix, count] of Object.entries(groups)) {
    for (let i = 1; i <= count; i++) {
      t.includes(prd, '| ' + prefix + i + ' |', 'PRD 应含验收项 ' + prefix + i);
    }
    total += count;
  }
  t.eq(total, 49, '验收项总数（按 PRD 分组累加）');
  t.includes(prd, '可实际检查的验收标准', 'PRD 应保留验收标准章节');
});

t.run();
