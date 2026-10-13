/**
 * 跨模块跳转：从首页点来源标签，跳到对应模块并高亮那条数据。
 * 用一次性的"待跳转"状态实现，视图渲染时自行取用。
 */

let pending = null;

/** 最近若干次跳转记录（只用于排查问题与测试观察，不参与业务） */
const history = [];

export function triggerJump(route, anchorId) {
  pending = { route, anchorId: anchorId || '' };
  history.push(Object.assign({ at: Date.now() }, pending));
  if (history.length > 20) history.shift();
}

export function takePendingJump(route) {
  if (!pending) return null;
  if (route && pending.route !== route) return null;
  const p = pending;
  pending = null;
  return p;
}

export function peekPending() {
  return pending;
}

/** 跳转历史（最近 20 条，含已被消费的） */
export function jumpHistory() {
  return history.slice();
}

export function clearPending() {
  pending = null;
}
