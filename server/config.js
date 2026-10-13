'use strict';
/**
 * 全局配置。所有路径都是绝对路径，避免受启动时工作目录影响。
 */

const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WEB_DIR = path.join(ROOT, 'web');
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const TMP_FILE = path.join(DATA_DIR, 'data.json.tmp');

module.exports = {
  ROOT,
  WEB_DIR,
  DATA_DIR,
  DATA_FILE,
  BACKUP_DIR,
  TMP_FILE,

  /** 端口候选：默认 41730，被占用则依次顺延 */
  PORT_START: 41730,
  PORT_END: 41739,

  /** 主数据文件前缀（导出文件名也用） */
  BACKUP_PREFIX: 'data_',
  /** 每日备份最多保留份数 */
  BACKUP_KEEP: 20,

  /** 请求体上限：20MB */
  MAX_BODY: 20 * 1024 * 1024,

  /** 允许启动的宿主，仅本机 */
  HOST: '127.0.0.1',

  /** 前端资源不缓存，改了代码刷新即可见 */
  NO_STORE: 'no-store, no-cache, must-revalidate',
};
