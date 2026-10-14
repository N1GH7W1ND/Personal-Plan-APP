'use strict';
/**
 * 在系统文件管理器里打开 data 目录。
 * 仅 Windows 需要，其他系统给出友好提示即可。
 */

const { spawn } = require('node:child_process');

function revealDataDir(dir) {
  try {
    if (process.platform === 'win32') {
      // explorer 打开目录并选中它
      const child = spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' });
      child.unref();
      return { ok: true, message: '已在资源管理器中打开数据文件夹', dir };
    }
    if (process.platform === 'darwin') {
      const child = spawn('open', [dir], { detached: true, stdio: 'ignore' });
      child.unref();
      return { ok: true, message: '已在访达中打开数据文件夹', dir };
    }
    const child = spawn('xdg-open', [dir], { detached: true, stdio: 'ignore' });
    child.unref();
    return { ok: true, message: '已打开数据文件夹', dir };
  } catch (err) {
    return { ok: false, message: '打开文件夹失败：' + err.message, dir };
  }
}

module.exports = { revealDataDir };
