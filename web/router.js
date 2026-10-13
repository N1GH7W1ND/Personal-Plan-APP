/**
 * hash 路由。
 * 9 个模块各一条路由；刷新后停留在原模块；键盘 1–9 可切换。
 * 纯逻辑与 DOM 分开：这里只依赖 location.hash 与回调。
 */

import { NAV_ITEMS } from './logic.js';

export const ROUTES = NAV_ITEMS.map((n) => n.id);

let current = 'home';
let onChange = null;
let onKey = null;

function normalize(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '').split('?')[0].split('/')[0];
  return ROUTES.includes(raw) ? raw : 'home';
}

function currentHash() {
  if (typeof location !== 'undefined') return location.hash;
  if (typeof window !== 'undefined' && window.location) return window.location.hash;
  return '';
}

/** 从当前地址解析路由 */
export function routeFromHash(hash) {
  return normalize(hash === undefined ? currentHash() : hash);
}

export function currentRoute() {
  return current;
}

export function routeName(id) {
  const item = NAV_ITEMS.find((n) => n.id === id);
  return item ? item.name : '首页总览';
}

/**
 * 跳转（会写入地址栏，可被收藏/刷新）。
 * 地址栏写入失败时（例如不在浏览器环境）也必须保证界面切过去，不能用静默失败糊弄。
 */
export function go(id) {
  const target = ROUTES.includes(id) ? id : 'home';

  const target2 = '#/' + target;
  try {
    if (typeof location !== 'undefined') {
      location.hash = target2;
    } else if (typeof window !== 'undefined' && window.location) {
      window.location.hash = target2;
    }
  } catch (err) {
    console.warn('[路由] 无法写入地址栏：' + (err && err.message ? err.message : err));
  }

  // 同一路由重复点击、或地址栏写入未触发 hashchange 时，手动兜底更新
  if (current === target) {
    if (onChange) onChange(target, { manual: true });
  } else if (routeFromHash() === target) {
    // 地址栏已经变了，但 hashchange 还没派发（或环境不派发）
    current = target;
    if (onChange) onChange(target, { manual: true });
  }
}

/**
 * 启动路由。
 * @param {(id:string, info:object)=>void} handler 切换时回调
 */
export function start(handler) {
  onChange = handler;

  const apply = (info) => {
    const id = routeFromHash();
    current = id;
    if (onChange) onChange(id, info || {});
  };

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('hashchange', () => apply({ fromHash: true }));
  } else if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('hashchange', () => apply({ fromHash: true }));
  }

  onKey = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable);
    if (typing) return;

    if (e.key >= '1' && e.key <= '9') {
      const idx = Number(e.key) - 1;
      const target = NAV_ITEMS[idx];
      if (target) {
        e.preventDefault();
        go(target.id);
      }
    }
  };

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('keydown', onKey);
  }

  apply({ initial: true });
}

/** 当前路由对应的导航序号（1 基），键盘提示用 */
export function routeIndex(id) {
  return ROUTES.indexOf(id) + 1;
}
