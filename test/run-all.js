'use strict';
/**
 * 全量测试入口：按顺序跑完所有测试文件，最后给出总账。
 * 用法： node test/run-all.js
 *
 * 为什么不用 node --test：
 * 它需要派生子进程执行测试文件，而当前开发环境禁止测试进程创建子进程，
 * 会导致测试静默失败。这里用子进程运行各个测试文件（进程本身是前台运行，可用），
 * 并通过文件而非管道收集输出。
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-testlog-'));

/** 测试文件清单：按阶段顺序
 *  注意：需要"真实服务 + 独立数据目录"的测试文件必须各自单独起进程，
 *  因为服务端的数据目录配置是进程级的，同进程内跑两个会互相覆盖。
 */
const SUITES = [
  { name: '阶段1 地基', file: 'test/phase1.js', port: 41930 },
  { name: '阶段2 数据持久化', file: 'test/phase2.js', port: 41950 },
  { name: '阶段5 功能模块', file: 'test/run-frontend.mjs', port: 42030, runner: 'esm', args: ['test/web-modules.mjs'] },
  { name: '阶段6 数据与设置', file: 'test/run-frontend.mjs', port: 42040, runner: 'esm', args: ['test/web-settings.mjs'] },
  { name: '阶段7 总验收', file: 'test/phase7.js', port: 41995 },
  { name: '前端 · 日期与纯逻辑（含阶段3 骨架与阶段4 规则）', file: 'test/run-frontend.mjs', port: 0, runner: 'esm', args: ['test/web-date.mjs', 'test/web-logic.mjs'] },
  { name: '前端 · store 与真实服务（含阶段4 持久化）', file: 'test/run-frontend.mjs', port: 42010, runner: 'esm', args: ['test/web-store.mjs'] },
  { name: '阶段4 界面交互', file: 'test/run-frontend.mjs', port: 42020, runner: 'esm', args: ['test/web-views.mjs'] },
];

function runSuite(suite) {
  const abs = path.join(ROOT, suite.file);
  if (!fs.existsSync(abs)) {
    return { suite, skipped: true, ok: true, output: '（该阶段测试文件尚不存在，跳过）' };
  }

  const logFile = path.join(TMP, path.basename(suite.file) + '-' + (suite.port || 'x') + '.log');
  const out = fs.openSync(logFile, 'w');
  const env = Object.assign({}, process.env, { DSH_NO_BROWSER: '1' });
  if (suite.port) env.DSH_TEST_PORT = String(suite.port);

  const args = [abs].concat(suite.args || []);
  const res = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env,
    stdio: ['ignore', out, out],
    windowsHide: true,
  });
  fs.closeSync(out);

  const text = fs.readFileSync(logFile, 'utf8');
  const skipped = /没有找到前端测试文件/.test(text);
  return {
    suite,
    skipped,
    ok: res.status === 0 && !skipped,
    status: res.status,
    output: text,
  };
}

function parseCounts(text) {
  const pass = /全部通过：(\d+)\/(\d+)/.exec(text) || /通过 (\d+)\/(\d+)/.exec(text);
  if (pass) return { pass: Number(pass[1]), total: Number(pass[2]) };
  const m = /共 (\d+) 项/.exec(text);
  return { pass: 0, total: m ? Number(m[1]) : 0 };
}

function main() {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════════════╗');
  console.log('  ║            我的工作台 · 全量测试                            ║');
  console.log('  ╚══════════════════════════════════════════════════════════════╝');

  const results = [];
  let passTotal = 0;
  let countTotal = 0;
  const t0 = Date.now();

  for (const suite of SUITES) {
    process.stdout.write('  运行 ' + suite.name + ' … ');
    const r = runSuite(suite);
    results.push(r);

    if (r.skipped) {
      console.log('跳过');
      continue;
    }
    const counts = parseCounts(r.output);
    passTotal += counts.pass;
    countTotal += counts.total;
    console.log(r.ok ? ('通过 ' + counts.pass + '/' + counts.total) : ('失败 ' + counts.pass + '/' + counts.total));
  }

  console.log('');
  console.log('  ' + '─'.repeat(64));

  for (const r of results) {
    if (r.skipped || r.ok) continue;
    console.log('');
    console.log('  ▸ ' + r.suite.name + ' 的详细输出：');
    const lines = r.output.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      if (/✗|失败|Error|错误/.test(line)) console.log('    ' + line.trim());
    }
  }

  const failed = results.filter((r) => !r.skipped && !r.ok);
  const skipped = results.filter((r) => r.skipped);
  const total = Date.now() - t0;

  console.log('');
  console.log('  测试文件：' + (results.length - skipped.length) + ' 个已运行，' + skipped.length + ' 个未创建');
  console.log('  用例总数：' + countTotal + ' 项，通过 ' + passTotal + ' 项');
  console.log('  总用时：' + (total / 1000).toFixed(1) + ' 秒');
  console.log('');

  if (failed.length === 0) {
    console.log('  ✅ 全部测试通过');
    if (skipped.length) {
      console.log('     （未创建的阶段测试：' + skipped.map((s) => s.suite.name).join('、') + '）');
    }
  } else {
    console.log('  ❌ 有 ' + failed.length + ' 个测试文件未通过：' + failed.map((f) => f.suite.name).join('、'));
    console.log('     完整日志：' + TMP);
  }
  console.log('');

  process.exitCode = failed.length === 0 ? 0 : 1;
}

main();
