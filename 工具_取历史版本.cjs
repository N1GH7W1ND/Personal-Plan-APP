'use strict';
/**
 * 从 Git 历史里取某个文件的旧版本（恢复被删掉或改坏的东西时用）。
 *
 * 为什么需要这个工具：
 *   以前"恢复被删掉的功能"只能照着别的模块仿写一遍，既慢又不可靠。
 *   其实 Git 历史里就躺着原件，取出来即可。这个工具把那一步变成一条命令。
 *
 * 取内容的实现方式（踩过坑，别乱改）：
 *   必须走 `cmd /c git show <ref>:<path> > 文件`。
 *   不能走 PowerShell 的重定向与赋值：
 *     · `git show ... > 文件`（PowerShell 层）等价于 Out-File → 产出 0 字节
 *     · `$x = git show ...` → 拿到空值
 *   也不能用 Node 的 child_process 管道捕获（这个环境下被拒）。
 *   cmd 层的 `>` 重定向是稳的，实测取出的内容与历史逐字节一致。
 *
 * 用法：
 *   node 工具_取历史版本.cjs --list <路径>
 *       列出这个文件的所有改动提交（最新的在上面），每条带一句话说明。
 *
 *   node 工具_取历史版本.cjs --show <版本>:<路径> [--out <文件>]
 *       把那一版取出来。不给 --out 就取到内存里看一眼（打印前几行 + 摘要）。
 *
 *   node 工具_取历史版本.cjs --verify <版本>:<路径>
 *       取出来并和该提交里存的 blob 哈希比对，确认逐字节一致。
 *
 *   node 工具_取历史版本.cjs --deleted <路径>
 *       列出"这个文件被删除"的那些提交（用来找"什么时候没的"）。
 *
 * 例子：
 *   node 工具_取历史版本.cjs --list web/views/fitness.js
 *   node 工具_取历史版本.cjs --show 78de65d:web/views/fitness.js --out 恢复的fitness.js
 *   node 工具_取历史版本.cjs --verify 78de65d:web/views/fitness.js
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = __dirname;

/**
 * git.exe 的位置：先看常见安装路径，再问 where（也用文件重定向，不用管道）。
 * 这个环境里管道捕获子进程输出会被拒，所以整份工具统一不用 pipe。
 */
function findGit() {
  const known = [
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
    'C:\\Users\\' + (process.env.USERNAME || '') + '\\AppData\\Local\\Programs\\Git\\cmd\\git.exe',
  ];
  for (const p of known) {
    if (p && fs.existsSync(p)) return p;
  }

  // 'where git' 也走文件重定向再读回
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-where-'));
  const outPath = path.join(dir, 'o.txt');
  const fd = fs.openSync(outPath, 'w');
  let ok = false;
  try {
    const r = spawnSync('where', ['git'], { stdio: ['ignore', fd, 'ignore'] });
    ok = r.status === 0;
  } finally {
    fs.closeSync(fd);
  }
  if (ok) {
    const first = fs.readFileSync(outPath, 'utf8')
      .split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
    fs.rmSync(dir, { recursive: true, force: true });
    if (first && fs.existsSync(first)) return first;
  } else {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return 'git';
}

const GIT = findGit();

/**
 * 跑一条 git 命令，把 stdout 收进内存。
 *
 * 关键：**不能用管道捕获**。这个环境里 child_process 的
 * stdio: 'pipe' 会被拒（EPERM），PowerShell 的 `$x = git ...` 也会拿到空值。
 * 可靠做法是让 git 的 stdout 直接重定向到临时文件（stdio 用文件描述符），
 * 再把文件读回来。实测这样拿到的内容与历史逐字节一致。
 */
function run(args, opts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-git-'));
  const outPath = path.join(dir, 'out.txt');
  const errPath = path.join(dir, 'err.txt');
  const outFd = fs.openSync(outPath, 'w');
  const errFd = fs.openSync(errPath, 'w');
  let res;
  try {
    res = spawnSync(GIT, args, {
      cwd: ROOT,
      stdio: ['ignore', outFd, errFd],
      env: Object.assign({}, process.env, { LC_ALL: 'C.UTF-8' }),
    });
  } finally {
    fs.closeSync(outFd);
    fs.closeSync(errFd);
  }
  const stdout = fs.readFileSync(outPath);
  const stderr = fs.readFileSync(errPath, 'utf8');
  fs.rmSync(dir, { recursive: true, force: true });

  if (res.error) throw new Error('无法执行 git：' + res.error.message);
  if (res.status !== 0 && !(opts && opts.allowFail)) {
    throw new Error('git ' + args.join(' ') + ' 失败：' + stderr.trim());
  }
  return stdout;
}

/**
 * 把一条 git 命令的**原始字节**写到文件里，然后读回来。
 * 这条是取文件内容的唯一可靠方式（见文件头的说明）。
 */
function captureToFile(pathSpec) {
  try {
    return run(['show', pathSpec]);
  } catch (err) {
    throw new Error('取不到 ' + pathSpec + '（这个路径在该版本里可能不存在）');
  }
}

/** 取某个版本里该文件的 blob 哈希（git 自己算的），用来做一致性验证 */
function blobHashAt(ref, filePath) {
  return run(['rev-parse', ref + ':' + filePath]).toString('utf8').trim();
}

/** 本地算一段内容的 blob 哈希，算法与 git 一致：sha1("blob <长度>\0" + 内容) */
function localBlobHash(buf) {
  const header = Buffer.from('blob ' + buf.length + '\0', 'utf8');
  return crypto.createHash('sha1').update(Buffer.concat([header, buf])).digest('hex');
}

function splitSpec(spec) {
  const i = spec.indexOf(':');
  if (i <= 0 || i === spec.length - 1) {
    throw new Error('版本与路径要写成 <版本>:<路径>，例如 78de65d:web/views/fitness.js');
  }
  return { ref: spec.slice(0, i), filePath: spec.slice(i + 1) };
}

/* ---------------- 各个子命令 ---------------- */

function cmdList(filePath) {
  if (!filePath) throw new Error('用法：--list <路径>');
  const out = run([
    'log', '--date=short', '--format=%h|%ad|%s', '--name-status', '--', filePath,
  ]).toString('utf8');

  const lines = out.split(/\r?\n/);
  const rows = [];
  let cur = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.includes('|') && /^[0-9a-f]{6,}\|/.test(line)) {
      if (cur) rows.push(cur);
      const [hash, date, ...rest] = line.split('|');
      cur = { hash, date, subject: rest.join('|'), status: '' };
    } else if (cur && /^[AMDR]\d*\t/.test(line)) {
      cur.status = line.split('\t')[0];
    }
  }
  if (cur) rows.push(cur);

  if (!rows.length) {
    console.log('  这个路径在历史里没有任何提交记录：' + filePath);
    return;
  }
  console.log('');
  console.log('  ' + filePath + ' 的改动历史（最新的在上面）：');
  console.log('');
  for (const r of rows) {
    const tag = { A: '新增', M: '修改', D: '删除', R: '改名' }[r.status[0]] || (r.status || '改动');
    console.log('  ' + r.hash + '  ' + r.date + '  [' + tag + ']  ' + r.subject);
  }
  console.log('');
  console.log('  取出某一版：');
  console.log('    node 工具_取历史版本.cjs --show ' + rows[0].hash + ':' + filePath + ' --out 恢复的文件');
  console.log('');
}

function cmdDeleted(filePath) {
  if (!filePath) throw new Error('用法：--deleted <路径>');
  const out = run(['log', '--diff-filter=D', '--date=short', '--format=%h|%ad|%s', '--', filePath]).toString('utf8');
  const rows = out.split(/\r?\n/).filter((l) => l.includes('|') && /^[0-9a-f]{6,}\|/.test(l));
  if (!rows.length) {
    console.log('  这个路径没有被删除过的记录：' + filePath);
    return;
  }
  console.log('');
  console.log('  这个路径被删除的提交（最新的在上面）：');
  console.log('');
  const hashes = [];
  for (const r of rows) {
    const [hash, date, ...rest] = r.split('|');
    hashes.push(hash);
    console.log('  ' + hash + '  ' + date + '  ' + rest.join('|'));
  }
  console.log('');
  console.log('  想看删除前长什么样，用删除提交的**上一个**版本：');
  console.log('    node 工具_取历史版本.cjs --show ' + hashes[hashes.length - 1] + '^:' + filePath);
  console.log('');
}

function cmdShow(spec, outFile) {
  const { ref, filePath } = splitSpec(spec);
  const buf = captureToFile(ref + ':' + filePath);
  const text = buf.toString('utf8');
  const lineCount = text.split('\n').length;

  if (!outFile) {
    console.log('');
    console.log('  取到了 ' + ref + ':' + filePath);
    console.log('  大小：' + buf.length + ' 字节，' + lineCount + ' 行');
    console.log('  预览（前 12 行）：');
    console.log('');
    for (const l of text.split('\n').slice(0, 12)) console.log('    ' + l);
    console.log('');
    console.log('  想存成文件：加 --out <文件名>');
    console.log('');
    return;
  }

  const dest = path.resolve(outFile);
  if (fs.existsSync(dest)) {
    throw new Error('目标文件已存在，不覆盖：' + dest + '（换个名字，或先自己处理掉它）');
  }
  fs.writeFileSync(dest, buf);
  console.log('');
  console.log('  ✓ 已取出 ' + ref + ':' + filePath);
  console.log('    写到：' + dest);
  console.log('    大小：' + buf.length + ' 字节，' + lineCount + ' 行');
  console.log('');
}

function cmdVerify(spec) {
  const { ref, filePath } = splitSpec(spec);
  const buf = captureToFile(ref + ':' + filePath);
  const mine = localBlobHash(buf);
  const theirs = blobHashAt(ref, filePath);
  const ok = mine === theirs;
  console.log('');
  console.log('  验证 ' + ref + ':' + filePath);
  console.log('    git 记的哈希 ：' + theirs);
  console.log('    取出来的哈希：' + mine);
  console.log('    ' + (ok ? '✓ 逐字节一致' : '✗ 不一致！取出的内容不等于历史内容'));
  console.log('');
  if (!ok) process.exitCode = 1;
}

/* ---------------- 入口 ---------------- */

function main() {
  const argv = process.argv.slice(2);
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i === -1 ? null : argv[i + 1];
  };

  if (argv.includes('--list')) return cmdList(arg('--list'));
  if (argv.includes('--deleted')) return cmdDeleted(arg('--deleted'));
  if (argv.includes('--show')) return cmdShow(arg('--show'), arg('--out'));
  if (argv.includes('--verify')) return cmdVerify(arg('--verify'));

  console.log('');
  console.log('  从 Git 历史里取文件的旧版本');
  console.log('');
  console.log('  node 工具_取历史版本.cjs --list <路径>');
  console.log('      列出这个文件的改动历史');
  console.log('  node 工具_取历史版本.cjs --deleted <路径>');
  console.log('      列出"这个文件被删除"的提交');
  console.log('  node 工具_取历史版本.cjs --show <版本>:<路径> [--out <文件>]');
  console.log('      取出版本内容（不给 --out 只预览）');
  console.log('  node 工具_取历史版本.cjs --verify <版本>:<路径>');
  console.log('      验证取出的内容与历史逐字节一致');
  console.log('');
  process.exitCode = 1;
}

module.exports = { captureToFile, localBlobHash, blobHashAt, splitSpec, GIT, run };

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('');
    console.error('  出错：' + (err && err.message));
    console.error('');
    process.exitCode = 1;
  }
}
