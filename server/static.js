'use strict';
/**
 * 静态文件服务。
 * 安全要点：只允许 web/ 目录内的文件，任何试图跳出目录的路径一律 403。
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const config = require('./config');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function mimeOf(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/**
 * 把 URL 路径解析成 web/ 下的绝对路径。
 * 返回 null 表示非法（越界或含空字节）。
 */
function resolvePath(urlPath) {
  let p = String(urlPath || '/');
  const q = p.indexOf('?');
  if (q !== -1) p = p.slice(0, q);
  const h = p.indexOf('#');
  if (h !== -1) p = p.slice(0, h);

  let decoded;
  try {
    decoded = decodeURIComponent(p);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  if (decoded === '/' || decoded === '') decoded = '/index.html';

  // 先做逻辑检查：任一段为 '..' 即视为越界
  const rawSegments = decoded.split(/[\\/]+/);
  if (rawSegments.some((s) => s === '..')) return null;

  const normalized = path.normalize(decoded).replace(/^([/\\])+/, '');
  const abs = path.resolve(config.WEB_DIR, normalized);

  // 再做物理检查：解析结果必须仍在 web/ 内
  const rel = path.relative(config.WEB_DIR, abs);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;

  return abs;
}

async function serve(req, res, urlPath) {
  const abs = resolvePath(urlPath);
  if (!abs) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': config.NO_STORE });
    res.end('403 拒绝访问：路径越界');
    return true;
  }

  let stat;
  try {
    stat = await fsp.stat(abs);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': config.NO_STORE });
    res.end('404 没有这个文件：' + urlPath);
    return true;
  }

  if (stat.isDirectory()) {
    return serve(req, res, path.posix.join(urlPath, 'index.html'));
  }

  res.writeHead(200, {
    'Content-Type': mimeOf(abs),
    'Content-Length': stat.size,
    'Cache-Control': config.NO_STORE,
  });

  if (req.method === 'HEAD') {
    res.end();
    return true;
  }

  await new Promise((resolve) => {
    const stream = fs.createReadStream(abs);
    stream.on('error', () => {
      res.destroy();
      resolve();
    });
    stream.on('end', resolve);
    stream.pipe(res);
  });
  return true;
}

module.exports = { serve, resolvePath, mimeOf, MIME };
