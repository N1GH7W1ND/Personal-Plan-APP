'use strict';
/**
 * 生成 / 校验「用户使用版」。
 *
 * 用途：把主项目里"运行必需"的文件，同步到 用户使用版/ 这个可以直接压缩发人的文件夹。
 *
 * 设计要点：
 *   1. 白名单制：只复制下面 WHITELIST 里列出的文件。
 *      这样永远不会误把 data/（本人私人数据）、test/、文档、.git 带进去。
 *   2. 内容指纹：把用户版里所有文件的 SHA256 汇总成一个指纹，写进 版本信息.txt。
 *      --check 模式用同一个指纹比对，能立刻看出"用户版是不是落后于主项目"。
 *   3. 保留 runtime/ 与 data/：这两个是用户第一次运行后才产生的，
 *      同步时不能删（runtime 里是自动下载的 Node，data 里是用户数据）。
 *
 * 用法：
 *   node 工具_生成用户使用版.cjs          同步（写入用户使用版）
 *   node 工具_生成用户使用版.cjs --check  只校验，不写任何文件；不一致时退出码 1
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const DIST = path.join(ROOT, '用户使用版');
/** 用户版专用素材（启动器、说明、自检脚本）所在的目录 */
const TPL = path.join(ROOT, '发布模板');
const TPL_PREFIX = '发布模板/';

/**
 * 要同步进用户版的文件（相对路径）。
 * 加新文件时**必须**同时加到这里，否则测试会报"用户版缺文件"。
 */
const WHITELIST = [
  // 启动器与说明：源文件放在 发布模板/，由本工具复制进用户版
  '发布模板/开始.cmd',
  '发布模板/停止.cmd',
  '发布模板/用户使用说明（必看！）.md',
  '发布模板/运行测试.cmd',
  '发布模板/selfcheck.cjs',

  // 服务端
  'server/config.js',
  'server/index.js',
  'server/api.js',
  'server/static.js',
  'server/store.js',
  'server/reveal.js',

  // 前端
  'web/index.html',
  'web/styles.css',
  'web/logic.js',
  'web/date.js',
  'web/ui.js',
  'web/store.js',
  'web/api.js',
  'web/router.js',
  'web/actions.js',
  'web/app.js',
  'web/jump.js',
  'web/views/home.js',
  'web/views/today.js',
  'web/views/dev.js',
  'web/views/study.js',
  'web/views/reading.js',
  'web/views/diet.js',
  'web/views/fitness.js',
  'web/views/notes.js',
  'web/views/settings.js',
];

/** 用户版里允许存在、但不参与指纹的东西（用户运行后才会产生的） */
const KEEP_DIRS = ['runtime', 'data'];
const META_FILE = '版本信息.txt';

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * 读一个文本文件，做"只影响编辑方式、不影响内容"的归一化：
 *   · 去掉 UTF-8 BOM —— .ps1 必须带 BOM（Windows PowerShell 5.1 读无 BOM 的
 *     脚本会按 ANSI 解析，中文直接语法报错），但指纹不该因此有差异
 *   · 统一换行为 \n —— 避免 CRLF/LF 造成假不一致
 */
function readNormalized(file) {
  const text = fs.readFileSync(file, 'utf8');
  return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

/**
 * 源文件的内容指纹：把所有白名单文件按路径排序，逐个喂进哈希。
 * 路径也参与哈希，这样"文件改名"也会被发现。
 */
function sourceFingerprint() {
  const h = crypto.createHash('sha256');
  for (const rel of WHITELIST.slice().sort()) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) throw new Error('主项目缺少白名单文件：' + rel);
    const target = rel.startsWith(TPL_PREFIX) ? rel.slice(TPL_PREFIX.length) : rel;
    h.update(target + '\n');
    h.update(readNormalized(abs));
    h.update('\n---\n');
  }
  return h.digest('hex');
}

/** 用户版目录里的内容指纹（只算白名单文件，忽略 runtime/ 与 data/） */
function distFingerprint() {
  if (!fs.existsSync(DIST)) return null;
  const h = crypto.createHash('sha256');
  let count = 0;
  for (const rel of WHITELIST.slice().sort()) {
    // 用户版里存放的是"去掉 发布模板/ 前缀"后的路径
    const target = rel.startsWith(TPL_PREFIX) ? rel.slice(TPL_PREFIX.length) : rel;
    const abs = path.join(DIST, target);
    if (!fs.existsSync(abs)) return null; // 缺文件 = 不一致
    h.update(target + '\n');
    h.update(readNormalized(abs));
    h.update('\n---\n');
    count += 1;
  }
  return count === WHITELIST.length ? h.digest('hex') : null;
}

function stampText(fingerprint) {
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const when = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) +
    ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  return [
    '我的工作台 · 用户使用版',
    '',
    '这一份是从主项目自动生成的，请勿在这里手改代码',
    '（手改的内容会在下次生成时被覆盖）。',
    '',
    '生成时间：' + when,
    '程序版本：' + version,
    '内容指纹：' + fingerprint.slice(0, 16),
    '',
    '指纹用来判断"这一份是不是最新的"。主项目里跑：',
    '  node 工具_生成用户使用版.cjs --check',
    '如果提示不一致，就说明这一份落后了，重新生成一次即可。',
    '',
  ].join('\n');
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function sync(opts) {
  const check = !!(opts && opts.check);
  const srcPrint = sourceFingerprint();
  const distPrint = distFingerprint();

  if (check) {
    const stampPath = path.join(DIST, META_FILE);
    const hasDir = fs.existsSync(DIST);
    const stampOk = fs.existsSync(stampPath) &&
      fs.readFileSync(stampPath, 'utf8').includes(srcPrint.slice(0, 16));
    if (hasDir && distPrint === srcPrint && stampOk) {
      console.log('  ✓ 用户使用版与主项目一致（指纹 ' + srcPrint.slice(0, 16) + '）');
      return { ok: true };
    }
    console.log('  ✗ 用户使用版与主项目不一致');
    if (!hasDir) console.log('    · 用户使用版目录不存在');
    else if (distPrint !== srcPrint) console.log('    · 文件内容有差异或缺少文件');
    else console.log('    · 版本信息.txt 里的指纹对不上');
    console.log('    修复：node 工具_生成用户使用版.cjs');
    return { ok: false };
  }

  // ---- 同步 ----
  console.log('  正在生成用户使用版…');
  fs.mkdirSync(DIST, { recursive: true });

  // 清掉旧内容，但保留 runtime/ 与 data/（用户的东西）
  for (const entry of fs.readdirSync(DIST)) {
    if (KEEP_DIRS.includes(entry)) continue;
    rmrf(path.join(DIST, entry));
  }

  let copied = 0;
  for (const rel of WHITELIST) {
    /*
     * 发布模板/ 下的文件是"用户版的专用素材"（启动器、说明、自检脚本），
     * 复制进用户版时要去掉这层前缀，否则用户会看到多一层的 发布模板 目录。
     */
    const to = rel.startsWith(TPL_PREFIX) ? rel.slice(TPL_PREFIX.length) : rel;
    const from = path.join(ROOT, rel);
    const dest = path.join(DIST, to);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(from, dest);
    copied += 1;
  }

  fs.writeFileSync(path.join(DIST, META_FILE), stampText(srcPrint), 'utf8');

  // 统计体积要用"用户版里的目标路径"，不能用源路径
  // （发布模板/ 下的文件复制过去会去掉那层前缀）
  const bytes = WHITELIST.reduce((n, rel) => {
    const target = rel.startsWith(TPL_PREFIX) ? rel.slice(TPL_PREFIX.length) : rel;
    return n + fs.statSync(path.join(DIST, target)).size;
  }, 0);
  console.log('  ✓ 已同步 ' + copied + ' 个文件，共 ' + Math.round(bytes / 1024) + ' KB');
  console.log('    位置：' + DIST);
  console.log('    指纹：' + srcPrint.slice(0, 16));
  for (const d of KEEP_DIRS) {
    if (fs.existsSync(path.join(DIST, d))) console.log('    保留：' + d + '/（用户运行后产生的，未改动）');
  }
  return { ok: true, copied, fingerprint: srcPrint };
}

module.exports = { WHITELIST, KEEP_DIRS, META_FILE, DIST, TPL, ROOT, sync, sourceFingerprint, distFingerprint };

if (require.main === module) {
  const check = process.argv.includes('--check');
  try {
    const r = sync({ check });
    if (check && !r.ok) process.exitCode = 1;
  } catch (err) {
    console.error('  出错：' + (err && err.message));
    process.exitCode = 1;
  }
}
