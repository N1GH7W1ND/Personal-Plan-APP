'use strict';
/**
 * 阶段 8 测试：用户使用版（可以直接压缩发人的那一份）
 *
 * 覆盖：
 *   · 用户版与主项目保持同步（内容指纹一致）—— 防止"改了主项目忘了同步"
 *   · 白名单完整性：该有的都在，不该有的一律不在
 *   · 绝不夹带个人数据（data/）与开发资料（test/、PRD、README、.git）
 *   · 依赖闭合：用户版里每个 require/import 的相对路径都能找到文件
 *   · 启动器可执行性：.cmd 必须是纯 ASCII（cmd 解析要求）、.ps1 必须带 BOM
 *   · 自动装 Node 的脚本：检查模式能跑通，且不联网不下载
 *   · 用户版真的能启动（跑一次它的自检）
 */

const t = require('./lib/t');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, '用户使用版');
const TPL = path.join(ROOT, '发布模板');

const syncTool = require('../工具_生成用户使用版.cjs');

t.setFile('阶段8 用户使用版');

/** 递归列出目录下所有文件（相对该目录的路径） */
function listFiles(dir, base) {
  const out = [];
  const root = base || dir;
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(abs, root));
    else out.push(path.relative(root, abs).split(path.sep).join('/'));
  }
  return out;
}

/* ---------------- 发布模板 ---------------- */

t.test('发布模板齐全：用户版的启动器与说明都有源文件', async () => {
  const need = ['开始.cmd', '停止.cmd', 'README-FIRST.md', '运行测试.cmd', 'selfcheck.cjs'];
  for (const name of need) {
    t.ok(fs.existsSync(path.join(TPL, name)), '发布模板里应有 ' + name);
  }
  const actual = fs.readdirSync(TPL).sort();
  t.deepEq(actual, need.slice().sort(), '发布模板里不应有多余文件（多出来的不会被同步）');
});

t.test('白名单里的每个源文件都存在', async () => {
  for (const rel of syncTool.WHITELIST) {
    t.ok(fs.existsSync(path.join(ROOT, rel)), '缺少白名单源文件：' + rel);
  }
});

/* ---------------- 同步一致性 ---------------- */

t.test('用户使用版与主项目内容一致（防止改了主项目忘记同步）', async () => {
  const r = syncTool.sync({ check: true });
  t.ok(r.ok, '用户使用版与主项目应一致（按约定：本人测试通过后才同步，所以两边都更新完再提交）');
});

t.test('一致性检查真的能发现差异（回归：改一个字节就要报出来）', async () => {
  const target = path.join(DIST, 'server', 'config.js');
  const original = fs.readFileSync(target);
  try {
    fs.writeFileSync(target, Buffer.concat([original, Buffer.from('\n// 测试用的一行\n')]));
    const r = syncTool.sync({ check: true });
    t.notOk(r.ok, '改了内容之后，一致性检查必须失败');
  } finally {
    fs.writeFileSync(target, original);
  }
  t.ok(syncTool.sync({ check: true }).ok, '恢复之后应重新一致');
});

t.test('用户使用版的目录结构：该有的都在正确位置', async () => {
  const files = listFiles(DIST);
  for (const name of ['开始.cmd', '停止.cmd', 'README-FIRST.md', '运行测试.cmd', 'selfcheck.cjs', '版本信息.txt']) {
    t.ok(files.includes(name), '用户版根目录应有 ' + name);
  }
  t.ok(files.includes('server/index.js'), '应有 server/index.js');
  t.ok(files.includes('web/index.html'), '应有 web/index.html');
  for (const v of ['home', 'today', 'dev', 'study', 'reading', 'diet', 'fitness', 'notes', 'settings']) {
    t.ok(files.includes('web/views/' + v + '.js'), '应有 web/views/' + v + '.js');
  }
  // 启动器不该被套进一层 发布模板/
  t.notOk(files.some((f) => f.startsWith('发布模板/')), '用户版里不该出现 发布模板/ 这一层');
});

/* ---------------- 不该带的东西 ---------------- */

t.test('用户使用版绝不夹带个人数据与开发资料', async () => {
  const files = listFiles(DIST);

  t.notOk(files.some((f) => f === 'data/data.json' || f.startsWith('data/')),
    '用户版里不能有 data/（那是使用者自己的数据，且发布前可能装着你本人的数据）');
  t.notOk(files.some((f) => f.startsWith('test/')), '用户版里不能有 test/');
  t.notOk(files.some((f) => f.startsWith('docs/')), '用户版里不能有 docs/');
  t.notOk(files.some((f) => f === '.gitignore' || f === '.gitattributes'), '用户版里不能有 git 相关文件');
  for (const doc of ['PRD.md', 'README.md', 'DEV-PLAN.md']) {
    t.notOk(files.includes(doc), '用户版里不能有 ' + doc);
  }
  t.notOk(files.some((f) => f.startsWith('runtime/')), '刚生成时用户版里不该有 runtime/（那是运行后下载的）');

  // 正面确认：文件数就是白名单数量 + 版本信息.txt
  t.eq(files.length, syncTool.WHITELIST.length + 1,
    '用户版里的文件应当正好是白名单 + 版本信息.txt');
});

/* ---------------- 依赖闭合 ---------------- */

t.test('用户使用版里每个相对依赖都能找到文件（不会缺件）', async () => {
  const files = new Set(listFiles(DIST));
  const jsFiles = [...files].filter((f) => f.endsWith('.js'));
  t.ok(jsFiles.length > 10, '应扫到足够多的 js 文件');

  const missing = [];
  for (const rel of jsFiles) {
    const src = fs.readFileSync(path.join(DIST, rel), 'utf8');
    const dir = path.posix.dirname(rel);

    const specs = [];
    // require('...') 与 import ... from '...'
    for (const m of src.matchAll(/require\(\s*'([^']+)'\s*\)/g)) specs.push(m[1]);
    for (const m of src.matchAll(/\bfrom\s+'([^']+)'/g)) specs.push(m[1]);
    for (const m of src.matchAll(/import\s*\(\s*'([^']+)'\s*\)/g)) specs.push(m[1]);

    for (const spec of specs) {
      if (!spec.startsWith('.')) continue;        // node: 内置模块等，不需要文件
      let target = path.posix.normalize(path.posix.join(dir, spec));
      if (!/\.(js|mjs|cjs|json)$/.test(target)) {
        const asJs = target + '.js';
        if (files.has(asJs)) continue;
        if (files.has(target)) continue;
        missing.push(rel + ' → ' + spec);
        continue;
      }
      if (!files.has(target)) missing.push(rel + ' → ' + spec);
    }
  }
  t.deepEq(missing, [], '不应有找不到的依赖');
});

/* ---------------- 启动器可执行性 ---------------- */

/*
 * .cmd 必须是纯 ASCII —— 这条是实测出来的，不是理论上的洁癖。
 *
 * 现象：启动器双击后黑窗口一闪就没了，什么提示都看不到。
 * 原因：cmd.exe 会在执行 chcp 65001 之前，就用系统码页（中文系统是 GBK）
 *       把整个批处理文件读进来解析。文件是 UTF-8，中文那几行的字节被当 GBK 解读，
 *       解出的乱码里出现了 cmd 的语法字符（实测是 "."），于是整行解析失败，
 *       cmd 直接退出 —— 连最后的 pause 都执行不到。
 * 实测对比：同一份 开始.cmd，只把中文去掉，就恢复正常启动。
 *
 * 所以：.cmd 里（包括 echo 里）一个非 ASCII 字符都不能有。
 * 给用户看的中文一律放在 README-FIRST.md 里，并且 .cmd 引用的文件名也必须是 ASCII。
 */
t.test('.cmd 必须是纯 ASCII（实测：非 ASCII 会让窗口一闪就退，连 pause 都到不了）', async () => {
  for (const name of ['开始.cmd', '停止.cmd', '运行测试.cmd']) {
    const buf = fs.readFileSync(path.join(DIST, name));
    const bad = [];
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] > 127) bad.push(i);
    }
    t.deepEq(bad.slice(0, 5), [],
      name + ' 里有非 ASCII 字节（从第 ' + (bad[0] !== undefined ? bad[0] : '-') + ' 字节开始）：' +
      '这会让 cmd 解析失败、窗口闪退，必须改成英文或把内容挪到 README-FIRST.md');
  }
});

t.test('.cmd 结构合法，且引用的文件名都是 ASCII', async () => {
  for (const name of ['开始.cmd', '停止.cmd', '运行测试.cmd']) {
    const src = fs.readFileSync(path.join(DIST, name), 'utf8');
    t.ok(src.startsWith('@echo off'), name + ' 应以 @echo off 开头');
    t.ok(/exit \/b|pause/i.test(src), name + ' 应以 exit /b 或 pause 收尾（别闪一下就没了）');
    // 所有被引用的文件名（带引号的、带扩展名的）都必须是 ASCII
    const refs = src.match(/"[^"]*\.(md|cjs|js|exe|cmd)"/gi) || [];
    const badRefs = refs.filter((r) => /[^\x00-\x7F]/.test(r));
    t.deepEq(badRefs, [], name + ' 引用的文件名里不该有非 ASCII：' + badRefs.join(', '));
  }
});

t.test('启动器缺 Node 时指向的说明文件真实存在', async () => {
  const start = fs.readFileSync(path.join(DIST, '开始.cmd'), 'utf8');
  const m = /start\s+""\s+"%~dp0([^"]+)"/.exec(start);
  t.ok(m, '开始.cmd 里应有 start "" "%~dp0<文件>" 来帮用户打开说明');
  t.ok(fs.existsSync(path.join(DIST, m[1])), '它指向的 ' + m[1] + ' 应真实存在');
});
t.test('用户版里没有任何 .ps1（按本人要求：不做自动安装）', async () => {
  const files = fs.readdirSync(DIST);
  t.deepEq(files.filter((f) => /\.ps1$/i.test(f)), [], '用户版里不该有 PowerShell 脚本');
  // 顺带确认指纹仍能算出（BOM 归一化那套逻辑留着，将来若再加脚本不会误报）
  const fingerprint = await Promise.resolve(syncTool.distFingerprint());
  t.ok(typeof fingerprint === 'string' && fingerprint.length === 64, '指纹应能算出');
});

t.test('启动器引用的文件都存在，且没有写死盘符路径', async () => {
  const start = fs.readFileSync(path.join(DIST, '开始.cmd'), 'utf8');
  t.includes(start, 'cd /d "%~dp0"', '开始.cmd 应切换到自身所在目录');
  t.includes(start, 'server\\index.js', '开始.cmd 应启动 server\\index.js');
  t.includes(start, '%~dp0runtime\\node\\node.exe', '开始.cmd 应优先用自带运行时');
  t.notOk(/[A-Za-z]:\\/.test(start), '开始.cmd 不该写死盘符路径（换电脑会失效）');
  t.notOk(/Users\\lenovo/i.test(start), '开始.cmd 不该出现开发者用户名');

  const selfcheck = fs.readFileSync(path.join(DIST, '运行测试.cmd'), 'utf8');
  t.includes(selfcheck, 'selfcheck.cjs', '运行测试.cmd 应调用自检.cjs');
  t.ok(fs.existsSync(path.join(DIST, 'selfcheck.cjs')), '自检.cjs 应存在');
});

/* ---------------- 自动装 Node 的脚本 ---------------- */

/**
 * 跑一个子进程并把输出收集到文件里再读回来。
 *
 * 为什么不用管道：这个沙箱环境里 Node 的 child_process 用管道捕获输出会被拒
 * （EPERM），但"输出重定向到文件"是允许的。这样写既不依赖管道，
 * 也顺手把子进程输出留了证据。
 */
function runToFiles(cmd, args, opts) {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'wb-phase8-'));
  const outPath = path.join(dir, 'out.txt');
  const errPath = path.join(dir, 'err.txt');
  const out = fs.openSync(outPath, 'w');
  const err = fs.openSync(errPath, 'w');
  let status = null;
  let error = null;
  try {
    const r = spawnSync(cmd, args, Object.assign({}, opts, { stdio: ['ignore', out, err] }));
    status = r.status;
    error = r.error || null;
  } finally {
    fs.closeSync(out);
    fs.closeSync(err);
  }
  const stdout = fs.readFileSync(outPath, 'utf8');
  const stderr = fs.readFileSync(errPath, 'utf8');
  fs.rmSync(dir, { recursive: true, force: true });
  return { status, stdout, stderr, error };
}

/*
 * 按本人要求：不做自动安装。
 * 这条是反向断言——以后谁"好心"加回自动下载，测试会拦住。
 */
t.test('启动器绝不自动下载或安装 Node（按本人要求）', async () => {
  const start = fs.readFileSync(path.join(DIST, '开始.cmd'), 'utf8');

  t.notOk(/powershell/i.test(start), '开始.cmd 里不该调用 powershell 去做安装');
  t.notOk(/Invoke-WebRequest|curl |bitsadmin/i.test(start), '开始.cmd 里不该有下载动作');
  t.notOk(/msiexec|winget|choco/i.test(start), '开始.cmd 里不该有安装命令');
  /*
   * 注意：指引里出现 nodejs.org 是应该的（告诉用户去哪下）。
   * 要检查的是"没有下载动作"，而不是"没有网址"——
   * 所以只要求它出现在 echo 行里，不被当成参数去请求。
   */
  t.ok(start.split('\n').every((l) => !/nodejs\.org/i.test(l) || /^\s*echo\b/i.test(l)),
    'nodejs.org 只应出现在 echo（给人看的指引）里');

  // 但必须把人指向说明文件，不能只说"找不到"就完事
  t.includes(start, 'README-FIRST.md', '缺 Node 时应指向用户使用说明');
  t.includes(start, 'nodejs.org', '缺 Node 时应给出官网地址作为最简指引');

  // 用户版里不该出现任何安装脚本
  const files = fs.readdirSync(DIST);
  t.notOk(files.some((f) => /\.ps1$/i.test(f)), '用户版里不该有 .ps1 安装脚本');
});

/*
 * Node 的下载改由"说明文件"承担，所以这里检查的是说明写得够不够具体。
 * 本人要求：越具体越好、当作电脑小白、作为独立模块。
 */
t.test('README-FIRST里的 Node 下载模块写得到位（当作小白来教）', async () => {
  const guide = fs.readFileSync(path.join(DIST, 'README-FIRST.md'), 'utf8');

  // 必须是独立的"第一部分"，而不是夹在别处的一句
  t.includes(guide, '# 第一部分：第一次使用前的准备', '应有独立的第一部分');
  t.includes(guide, 'Node.js', '应明确要装的是 Node.js');

  // 官网地址要具体到下载页，而不是只给首页
  t.includes(guide, 'https://nodejs.org/en/download', '应给出具体的下载页地址');

  // 要教怎么选版本：LTS vs Current、64 位 vs 32 位
  t.includes(guide, 'LTS', '应教用户选 LTS');
  t.includes(guide, 'Current', '应说明 Current 不要选');
  t.includes(guide, '64-bit', '64 位该点哪个要写清');
  t.includes(guide, '32-bit', '32 位该点哪个要写清');
  t.includes(guide, 'Windows Installer', '应写清要下的是 .msi 安装包');
  t.includes(guide, 'msi', '应提到 .msi 后缀');

  // 要教怎么确认系统位数
  t.includes(guide, 'Win', '应教用 Win 键打开设置');
  t.includes(guide, '系统类型', '应教去哪里看系统类型');
  t.includes(guide, 'x64', '应解释 x64 是什么意思');

  // 安装过程要逐步写
  t.includes(guide, 'Next', '应写清一路点 Next');
  t.includes(guide, 'Install', '应写清点 Install');
  t.includes(guide, 'Finish', '应写清点 Finish');
  t.includes(guide, 'Tools for Native Modules', '应说明那个额外工具的选项不用勾');

  // 装完之后的坑要提前讲
  t.includes(guide, '重启', '应提醒装完可能要把窗口全关或重启');
  t.includes(guide, 'node -v', '应教怎么自己验证装好了');

  // 常见问题要有对应条目
  t.includes(guide, 'Node.js was not found', '应把启动器会打印的原文抄进排错表');
  t.notOk(/winget|choco|scoop/i.test(guide), 'README-FIRST里不该让小白碰命令行包管理器');
});

t.test('README-FIRST里不该出现任何"自动安装"的承诺', async () => {
  const guide = fs.readFileSync(path.join(DIST, 'README-FIRST.md'), 'utf8');
  t.notOk(/自动下载|自动安装|会自动装好/.test(guide),
    '不该承诺自动安装（按本人要求：由用户自己装一次）');
  t.includes(guide, '只做一次', '应说明这件事只需做一次');
});

/* ---------------- 用户版真能启动 ---------------- */

t.test('用户使用版能真正启动：跑一次它自带的自检', async () => {
  const r = runToFiles(process.execPath, [path.join(DIST, 'selfcheck.cjs')], {
    timeout: 90000,
    env: Object.assign({}, process.env, { DSH_NO_BROWSER: '1' }),
    cwd: DIST,
  });
  const out = r.stdout + r.stderr;
  t.eq(r.status, 0,
    '自检应通过' + (r.error ? '；启动失败：' + r.error.message : '') + '；输出：' + out.slice(-700));
  t.includes(out, '结论：全部通过', '自检应给出"全部通过"的结论');
  t.includes(out, '/api/health', '自检应覆盖健康检查接口');
  // 自检用的是临时数据目录，不该在用户版里留下 data/
  t.notOk(fs.existsSync(path.join(DIST, 'data')), '自检不该在用户版里留下 data 目录');
});

t.test('用户使用说明写的是"给人看的话"，不是照搬 README', async () => {
  const guide = fs.readFileSync(path.join(DIST, 'README-FIRST.md'), 'utf8');
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

  t.includes(guide, '第一次使用前的准备', '应有"第一次使用前的准备"这一部分');
  t.includes(guide, '不要关', '应提醒黑窗口不要关');
  t.includes(guide, 'data', '应说明数据在 data 里');
  t.includes(guide, '开始.cmd', '应说明双击开始.cmd');
  t.includes(guide, '无法连接本地服务', '应给出常见问题解法');

  // 不该出现开发向的说法
  /*
   * 判断标准不是「有没有出现 npm 这个词」——安装向导本来就会装 npm，
   * 说明书里提一句是正常的。要拦的是「让用户去敲命令行」。
   */
  for (const cmd of ['npm install', 'npm run', 'node test', 'git clone', 'git commit']) {
    t.notOk(guide.includes(cmd), 'README-FIRST里不该让小白敲命令行：' + cmd);
  }
  for (const word of ['PRD', 'DEV-PLAN', '提交', '仓库']) {
    t.notOk(guide.includes(word), 'README-FIRST里不该出现开发向的词：' + word);
  }
  // 与 README 的重复程度要低（不是照搬）
  const guideLines = guide.split('\n').map((s) => s.trim()).filter((s) => s.length > 12);
  const readmeSet = new Set(readme.split('\n').map((s) => s.trim()));
  const same = guideLines.filter((s) => readmeSet.has(s));
  t.ok(same.length <= 2,
    'README-FIRST与 README 雷同的长句不应超过 2 条，实际 ' + same.length + ' 条：' + same.slice(0, 3).join(' / '));
});

/* ---------------- 从 Git 历史取原件 ---------------- */

/* 跑一条命令并把输出收进文件再读回（这个环境不能用管道捕获子进程输出） */
function runCapture(cmd, args, opts) {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'wb-h-'));
  const outPath = path.join(dir, 'o.txt');
  const errPath = path.join(dir, 'e.txt');
  const of = fs.openSync(outPath, 'w');
  const ef = fs.openSync(errPath, 'w');
  let status = null; let error = null;
  try {
    const r = spawnSync(cmd, args, Object.assign({}, opts, { stdio: ['ignore', of, ef] }));
    status = r.status; error = r.error || null;
  } finally { fs.closeSync(of); fs.closeSync(ef); }
  const stdout = fs.readFileSync(outPath, 'utf8');
  const stderr = fs.readFileSync(errPath, 'utf8');
  fs.rmSync(dir, { recursive: true, force: true });
  return { status, stdout, stderr, error };
}

const HISTOOL = path.join(ROOT, '工具_取历史版本.cjs');

t.test('取历史版本：本地算的 blob 哈希与 git 的算法一致', async () => {
  const tool = require('../工具_取历史版本.cjs');
  // git 的 blob 哈希 = sha1("blob <字节长度>\0" + 内容)，空内容有公开的已知值
  t.eq(tool.localBlobHash(Buffer.from('', 'utf8')),
    'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391',
    '空内容的 blob 哈希应等于 git 的已知值');

  const head = tool.run(['rev-parse', 'HEAD']).toString('utf8').trim();
  const mine = tool.localBlobHash(fs.readFileSync(path.join(ROOT, 'package.json')));
  t.eq(mine, tool.blobHashAt(head, 'package.json'),
    '本地算的 package.json blob 哈希应等于 git 记录的');
});

t.test('取历史版本：能把某个提交里的文件原样取出来（逐字节一致）', async () => {
  const tool = require('../工具_取历史版本.cjs');
  const buf = tool.captureToFile('HEAD:package.json');
  t.ok(buf.length > 0, '应取到内容');
  const work = fs.readFileSync(path.join(ROOT, 'package.json'));
  t.eq(buf.toString('utf8'), work.toString('utf8'), '取出的内容应与工作区一致');
  const head = tool.run(['rev-parse', 'HEAD']).toString('utf8').trim();
  t.eq(tool.localBlobHash(buf), tool.blobHashAt(head, 'package.json'),
    '取出的内容哈希应与 git 记录的一致');
});

t.test('取历史版本：--verify 对真实历史通过（反例见下一条）', async () => {
  const r = runCapture(process.execPath, [HISTOOL, '--verify', 'HEAD:package.json'], { cwd: ROOT });
  t.eq(r.status, 0, '--verify 应退出码 0；输出：' + (r.stdout + r.stderr).slice(-300));
  t.includes(r.stdout, '逐字节一致', '应明确报告一致');
});

t.test('取历史版本：哈希校验真能识破错误内容（不是永远返回通过）', async () => {
  const tool = require('../工具_取历史版本.cjs');
  const head = tool.run(['rev-parse', 'HEAD']).toString('utf8').trim();
  const wrong = Buffer.from('这不是 package.json 的内容', 'utf8');
  t.notEq(tool.localBlobHash(wrong), tool.blobHashAt(head, 'package.json'),
    '不相干内容的哈希不该等于历史内容的哈希');
  t.notEq(tool.localBlobHash(Buffer.from('{}', 'utf8')),
    tool.localBlobHash(Buffer.from('{ }', 'utf8')),
    '只差一个空格也必须算出不同哈希');
});

t.test('取历史版本：--list 能列出一个文件的改动历史', async () => {
  const r = runCapture(process.execPath, [HISTOOL, '--list', 'README.md'], { cwd: ROOT });
  t.eq(r.status, 0, '--list 应成功；输出：' + (r.stdout + r.stderr).slice(-300));
  t.includes(r.stdout, '改动历史', '应有标题');
  t.ok(/[0-9a-f]{7}/.test(r.stdout), '应列出提交号');
  t.includes(r.stdout, '--show', '应给出一条可复制的取出命令');
});

t.test('取历史版本：已删除的文件能从历史里取回原件（真实回归）', async () => {
  const tool = require('../工具_取历史版本.cjs');
  /*
   * 用本项目真实发生过的事来验证：
   * 健身模块被删过一次，删之前的版本必须还能取出来。
   * 这条测试的意义：以后要恢复被删的功能时，原件确实拿得到，
   * 不必再照着别的模块仿写一遍。
   */
  const r = runCapture(process.execPath, [HISTOOL, '--deleted', 'web/views/fitness.js'], { cwd: ROOT });
  t.eq(r.status, 0, '--deleted 应成功；输出：' + (r.stdout + r.stderr).slice(-300));
  t.ok(/[0-9a-f]{7}/.test(r.stdout), '应找到被删除的那个提交');

  const m = /([0-9a-f]{7,})\s+\d{4}-\d{2}-\d{2}/.exec(r.stdout);
  t.ok(m, '应能解析出提交号');
  const buf = tool.captureToFile(m[1] + '^:web/views/fitness.js');
  t.ok(buf.length > 3000, '取回的原件应有实质内容（实际 ' + buf.length + ' 字节）');
  t.includes(buf.toString('utf8'), 'fitness', '内容里应能看到模块名');
  t.eq(tool.localBlobHash(buf), tool.blobHashAt(m[1] + '^', 'web/views/fitness.js'),
    '取回的原件哈希应与 git 记录一致');
});

t.test('取历史版本：路径不存在时清楚报错，不静默返回空', async () => {
  const r = runCapture(process.execPath, [HISTOOL, '--verify', 'HEAD:根本没有这个文件.txt'], { cwd: ROOT });
  t.notEq(r.status, 0, '不该成功');
  t.includes(r.stdout + r.stderr, '取不到', '应说明取不到');
});

t.test('取历史版本：工具不用管道捕获子进程输出（这个环境会被拒）', async () => {
  const raw = fs.readFileSync(HISTOOL, 'utf8');
  /*
   * 只看代码，跳过注释——文件头与说明里会提到"不能用 pipe"，
   * 那是解释文字，不该被当成违规代码匹配到（这条断言之前误报过）。
   */
  const code = raw.split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');

  t.notOk(/stdio:\s*\[[^\]]*'pipe'/.test(code),
    '代码里不该用 pipe 捕获子进程输出（实测拿到空值）');
  t.notOk(/\$\w+\s*=\s*git\s/.test(code), '不该出现 PowerShell 赋值捕获的写法');
  t.ok(/stdio:\s*\['ignore',\s*outFd/.test(code),
    '取内容应走文件描述符重定向（这是实测可靠的方式）');
  t.includes(raw, 'blob ', '应自己实现 git 的 blob 哈希用于校验');
});

t.test('版本信息.txt 写清了生成时间与指纹', async () => {
  const info = fs.readFileSync(path.join(DIST, '版本信息.txt'), 'utf8');
  t.includes(info, '用户使用版', '应标明这是用户使用版');
  t.includes(info, '生成时间：', '应有生成时间');
  t.includes(info, '内容指纹：', '应有内容指纹');
  t.includes(info, '--check', '应说明怎么校验是否最新');
  t.includes(info, syncTool.sourceFingerprint().slice(0, 16), '里面的指纹应与当前内容一致');
});

t.run();
