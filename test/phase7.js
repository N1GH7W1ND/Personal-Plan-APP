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
    'LICENSE',
    'docs/页面结构与交互设计.md',
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

t.test('前端 8 个视图文件齐全，且已移除模块的视图不存在', async () => {
  for (const v of ['home', 'today', 'dev', 'study', 'reading', 'diet', 'fitness', 'settings']) {
    t.ok(exists('web/views/' + v + '.js'), '缺少视图 web/views/' + v + '.js');
  }
  // 已移除模块的视图不该还在磁盘上
  for (const gone of ['media', 'consult', 'games']) {
    t.eq(exists('web/views/' + gone + '.js'), false, '已移除的视图不该存在：web/views/' + gone + '.js');
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
    'web/views/reading.js', 'web/views/diet.js', 'web/views/fitness.js', 'web/views/settings.js'];
  for (const f of files) {
    const text = read(f);
    t.notIncludes(text, '正在开发中', f + ' 仍是占位实现');
    t.notIncludes(text, '功能将在后续阶段接入', f + ' 仍是占位实现');
    t.notIncludes(text, 'TODO', f + ' 里还有 TODO 未处理');
  }
});

t.test('PRD 明确不做的事，代码里也没有偷偷做', async () => {
  // 第一版不做趋势统计与数据回填
  const views = ['web/views/dev.js', 'web/views/study.js', 'web/views/reading.js', 'web/views/diet.js'];
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
  for (const fn of ['pushStudyToToday', 'pushBookToToday', 'pushMealToToday']) {
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

t.test('README 里写的测试条数与实际一致（加减测试后要同步更新）', async () => {
  const readme = read('README.md');

  /*
   * 数一数各测试文件里声明了多少条用例。
   * 以前 README 写过"328 条"但实际已经 331 条 —— 这类数字最容易悄悄过期，
   * 所以让它自动核对：加了测试却忘了改 README，这条就红。
   */
  const files = [
    'test/phase1.js', 'test/phase2.js', 'test/phase7.js', 'test/phase8.js',
    'test/web-date.mjs', 'test/web-logic.mjs', 'test/web-store.mjs',
    'test/web-views.mjs', 'test/web-modules.mjs', 'test/web-settings.mjs',
  ].filter((f) => exists(f));

  let total = 0;
  for (const f of files) {
    let body = read(f);
    /*
     * 这条检查自己不算数。
     * 否则会自指：多一条"数条数"的检查，实际条数就 +1，README 永远追不上——
     * 实测踩过这个坑（加了它之后 README 写 332、实际变 333，两边对不上）。
     * 它是一条"元检查"，不是功能用例，所以从计数里去掉。
     */
    body = body.replace(/^t\.test\('README 里写的测试条数与实际一致[^\n]*\n/m, '');
    total += (body.match(/^(?:t\.)?test\(/gm) || []).length;
  }
  t.ok(total > 100, '应数出足够多的用例（实际 ' + total + '）');

  const m = /全部\s*(\d+)\s*项/.exec(readme);
  t.ok(m, 'README 里应写明测试条数（形如"全部 332 项"）');
  if (m) {
    t.eq(Number(m[1]), total,
      'README 写的条数与实际不符：README 写 ' + m[1] + '，实际 ' + total +
      '（加/减测试后记得同步 README）');
  }
});

t.test('许可证：LICENSE 是完整的 MIT，且与 package.json、README 对得上', async () => {
  const license = read('LICENSE');
  const pkg = JSON.parse(read('package.json'));
  const readme = read('README.md');

  // 1) 是 MIT 的正文，而不是自己乱写的
  t.ok(/^MIT License\s*$/m.test(license), 'LICENSE 第一行应是 MIT License');
  t.includes(license, 'Permission is hereby granted, free of charge',
    '应有 MIT 的授权段');
  t.includes(license, 'THE SOFTWARE IS PROVIDED "AS IS"', '应有 MIT 的免责段');
  t.includes(license, 'WITHOUT WARRANTY OF ANY KIND', '应写明不提供担保');

  // 2) 版权行要存在、格式正确、标注了年份
  const year = new Date().getFullYear();
  const m = /Copyright \(c\) (\d{4})\s+(.+)$/m.exec(license);
  t.ok(m, 'LICENSE 应有 Copyright (c) <年份> <署名> 这一行');
  if (m) {
    t.eq(Number(m[1]), year, '版权年份应是今年（改年时记得同步）');
    t.ok(m[2].trim().length > 0, '版权署名不该是空的');
    // 署名应与 package.json 的 author 一致，避免两处打架
    t.eq(m[2].trim(), pkg.author, 'LICENSE 的署名应与 package.json 的 author 一致');
  }

  // 3) package.json 不能再宣称 UNLICENSED / private
  t.eq(pkg.license, 'MIT', 'package.json 的 license 应是 MIT');
  t.notOk(pkg.private === true, 'package.json 不该再标 private（已决定公开发布）');

  // 4) README 里要有许可证一节，并指向 LICENSE
  t.includes(readme, '## 许可证', 'README 应有许可证一节');
  t.includes(readme, 'LICENSE', 'README 应指向 LICENSE 文件');
  t.ok(/MIT/.test(readme), 'README 应写明是 MIT');
});

t.test('README 有给人看的四块基本内容', async () => {
  const readme = read('README.md');
  /*
   * 本人要求：README 必须包含这四块，且与真实功能一致。
   * 这里只查"有没有"，内容准确性由下面几条断言守着。
   */
  for (const [label, kw] of [
    ['项目解决什么问题', '它解决什么问题'],
    ['主要功能', '主要功能'],
    ['安装方法', '安装方法'],
    ['使用方法', '使用方法'],
  ]) {
    t.includes(readme, kw, 'README 应有「' + label + '」这一部分');
  }
  // 安装部分必须讲清唯一的依赖是 Node.js
  t.includes(readme, 'Node.js', 'README 应说明需要 Node.js');
  t.includes(readme, 'nodejs.org', 'README 应给出 Node.js 下载地址');
});

t.test('README 的功能清单与代码一致（防止文档与实现脱节）', async () => {
  const readme = read('README.md');
  const logic = read('web/logic.js');
  const ui = read('web/ui.js');

  const grab = (src, name) => {
    const m = new RegExp('export const ' + name + ' = \\{([\\s\\S]*?)\\}').exec(src);
    return m ? m[1] : '';
  };

  /*
   * 这几组"档位名"以前漏写过（README 只说"强度"两个字，没列具体档位），
   * 所以逐项核对：代码里有几档，README 就得写全几档。
   */
  const groups = [
    ['开发待办状态', grab(logic, 'DEV_STATUS')],
    ['学习类型', grab(logic, 'STUDY_KINDS')],
    ['学习状态', grab(logic, 'STUDY_STATUS')],
    ['书籍状态', grab(logic, 'BOOK_STATUS')],
    ['笔记类型', grab(logic, 'NOTE_KINDS')],
    ['训练强度', grab(logic, 'FITNESS_INTENSITY')],
  ];
  for (const [label, body] of groups) {
    t.ok(body, '应能从逻辑层取到 ' + label);
    const labels = [...body.matchAll(/'([^']+)'/g)].map((m) => m[1])
      .filter((s) => !/^[a-z]+$/.test(s));   // 丢掉英文 key，只留中文名
    for (const name of labels) {
      t.includes(readme, name, label + ' 的「' + name + '」应写进 README');
    }
  }

  // 优先级四档也要全
  const prio = /export const PRIORITY = \{([\s\S]*?)\n\};/.exec(logic);
  if (prio) {
    for (const m of prio[1].matchAll(/label: '([^']+)'/g)) {
      t.includes(readme, m[1], '优先级的「' + m[1] + '」应写进 README');
    }
  }
});

t.test('README 不再保留已经改掉/删掉的旧说法', async () => {
  const readme = read('README.md');
  /*
   * 这些都是真实发生过的"文档滞后"：
   *   · 设置页的「偏好设置」整块已删除，README 不能再教用户去那里改目标
   *   · 首页的「待你处理」已删除
   *   · 导航不再是"固定 8 个入口"，中间的板块可以勾选
   */
  t.notIncludes(readme, '待你处理', 'README 不该再提已删除的「待你处理」');
  t.notOk(/偏好设置/.test(readme), 'README 不该再提已删除的「偏好设置」');
  t.notOk(/在「数据与设置」里改/.test(readme), 'README 不该再说去设置页改阅读/健身目标');
  t.notIncludes(readme, '左侧导航共', 'README 不该再说导航是固定入口数');
  // 但要把"板块可勾选"这个真实功能写上
  t.includes(readme, '左侧板块选择', 'README 应说明板块可勾选');
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

t.test('PRD 第 10 节的验收标准条目齐全（原 49 条 + 范围调整后新增）', async () => {
  const prd = read('PRD.md');
  t.includes(prd, '可实际检查的验收标准', 'PRD 应保留验收标准章节');
  t.includes(prd, '范围变更记录', 'PRD 应记录范围变更（R1–R9）');

  // 原有分组：括号里的数字是分组原始的条目数（不因作废而改变编号连续性）
  const groups = { A: 8, B: 8, C: 15, E: 6, F: 7, G: 5 };
  for (const [prefix, count] of Object.entries(groups)) {
    for (let i = 1; i <= count; i++) {
      const id = prefix + i;
      // 条目要么是"有效"形式，要么是"已作废"形式（删除线 + 作废说明），二者必须有其一
      const active = prd.includes('| ' + id + ' |');
      const retired = prd.includes('| ~~' + id + '~~ |');
      t.ok(active || retired, 'PRD 应含验收项 ' + id + '（有效或标注作废）');
    }
  }

  // 已移除模块对应的验收项必须明确标注作废，不能含糊
  for (const id of ['C1', 'C2', 'C3', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C14', 'C15']) {
    t.includes(prd, '| ~~' + id + '~~ |', '已移除模块的验收项 ' + id + ' 应标注作废');
  }
  // 仍然有效的分模块条目不能被误删
  for (const id of ['C4', 'C5', 'C12', 'C13']) {
    t.includes(prd, '| ' + id + ' |', '仍然有效的验收项 ' + id + ' 应保留');
    t.notIncludes(prd, '| ~~' + id + '~~ |', '仍然有效的验收项 ' + id + ' 不应被标为作废');
  }

  // 范围调整后新增的验收标准（R1–R16）应齐全
  t.includes(prd, '### 10.7 范围调整后新增的验收标准', 'PRD 应有新增验收标准章节');
  for (const id of ['R1.1', 'R1.2', 'R1.3', 'R1.4',
    'R4.1', 'R4.2', 'R4.3', 'R4.4',
    'R5.1', 'R5.2', 'R5.3', 'R5.4',
    'R6.1', 'R6.2', 'R6.3', 'R6.4', 'R6.5',
    'R7.1', 'R7.2', 'R7.3', 'R7.4', 'R7.5', 'R7.6', 'R7.7',
    'R8.1', 'R8.2', 'R8.3', 'R8.4',
    'R11.1', 'R11.2', 'R11.3', 'R11.4', 'R11.5', 'R11.6', 'R11.7',
    'R11.8', 'R11.9', 'R11.10', 'R11.11', 'R11.12', 'R11.13',
    'R12.1', 'R12.2', 'R12.3', 'R12.4',
    'R13.1', 'R13.2', 'R13.3', 'R13.4', 'R13.5', 'R13.6', 'R13.7', 'R13.8', 'R13.9',
    'R14.1', 'R14.2',
    'R15.1', 'R15.2', 'R15.3',
    'R16.1', 'R16.2']) {
    t.includes(prd, '| ' + id + ' |', 'PRD 应含新增验收项 ' + id);
  }

  // 导航入口数与模块数应与代码一致（文档不能与实现脱节）
  const navCount = (read('web/index.html').match(/data-route="/g) || []).length;
  t.eq(navCount, 8, 'index.html 里的导航入口数应为 8（实际 ' + navCount + '）');

  /*
   * 光比数量还不够：出现过"文档只写数量、清单却与代码不一致"的脱节。
   * 这里直接 import 真实模块读清单（比解析源码可靠），再逐项与 PRD 比对。
   */
  const { NAV_ITEMS, MODULES } = await import('../web/logic.js');
  const navNames = NAV_ITEMS.map((n) => n.name);
  t.eq(navNames.length, navCount, 'logic.js 的导航数应与 index.html 的入口数一致（'
    + navNames.length + ' vs ' + navCount + '）');

  const navLine = (prd.match(/\*\*调整后的导航（(\d+) 个入口）\*\*：\n([^\n]+)/) || []);
  t.ok(navLine[0], 'PRD 应有一行"调整后的导航（N 个入口）"清单');
  t.eq(Number(navLine[1]), navCount, 'PRD 写的入口数应与实际一致（' + navLine[1] + ' vs ' + navCount + '）');

  const prdNavNames = navLine[2].split('·').map((s) => s.trim());
  t.eq(prdNavNames.length, navNames.length,
    'PRD 导航清单的项数应与代码一致（' + prdNavNames.length + ' vs ' + navNames.length + '）');
  for (const name of navNames) {
    t.ok(prdNavNames.includes(name), 'PRD 的导航清单里应有「' + name + '」（现有：' + prdNavNames.join('/') + '）');
  }

  // 模块数同理
  t.eq(MODULES.length, 6, 'MODULES 应有 6 个（含兜底的通用），实际 ' + MODULES.length);
  t.includes(prd, '任务可归属 ' + MODULES.length + ' 个', 'PRD 写的模块数应与代码一致');
});

t.test('文档与源码里没有控制字符，反引号也不该落单', async () => {
  // 起因：用 PowerShell 的 -replace 写含反引号的文本时，`f 会被当成转义符变成换页符，
  // 一次就把 PRD 里的 "fitness" 写成了 "\fitness"（看起来像 itness）。
  // 这类字符肉眼很难发现，所以固化成检查。
  const files = ['PRD.md', 'README.md', 'DEV-PLAN.md',
    'docs/验收覆盖结论.md', 'docs/页面结构与交互设计.md'];

  for (const f of files) {
    if (!exists(f)) continue;
    const text = read(f);

    // 1. 不该有除 换行/回车/制表 以外的控制字符
    const ctrl = [];
    for (const ch of text) {
      const code = ch.charCodeAt(0);
      if (code < 32 && ch !== '\n' && ch !== '\r' && ch !== '\t') {
        ctrl.push('0x' + code.toString(16).padStart(2, '0'));
      }
    }
    t.eq(ctrl.length, 0, f + ' 里不应有控制字符（发现 ' + ctrl.join(', ') + '）');

    // 2. 每行的反引号应当成对（代码块围栏除外），落单说明有字符被吃掉了
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*```/.test(lines[i])) continue;
      const n = (lines[i].match(/`/g) || []).length;
      if (n % 2 !== 0) {
        t.ok(false, f + ' 第 ' + (i + 1) + ' 行反引号落单：' + lines[i].trim().slice(0, 60));
      }
    }
  }
});

t.run();
