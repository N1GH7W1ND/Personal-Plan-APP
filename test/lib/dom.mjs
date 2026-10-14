/**
 * 极简 DOM 桩（仅供测试使用）。
 *
 * 为什么需要它：界面代码要真的"被点一下"才算验证到交互。真正的浏览器 DOM 很重，
 * 而开发环境又禁止起浏览器，所以这里实现一个够用的小实现：
 *   - 解析 HTML 子集（我们自己的视图只生成普通标签，没有怪语法）
 *   - querySelector / querySelectorAll 支持 #id、.class、[attr]、[attr="v"] 及其组合
 *   - closest / classList / addEventListener / dispatchEvent
 * 它不追求规范完备，只追求"能真实触发我们自己的点击处理器"。
 */

class ClassList {
  constructor(el) { this.el = el; }
  _list() { return String(this.el.attributes.class || '').split(/\s+/).filter(Boolean); }
  _set(list) { this.el.attributes.class = list.join(' '); }
  contains(name) { return this._list().includes(name); }
  add(...names) { const l = this._list(); for (const n of names) if (!l.includes(n)) l.push(n); this._set(l); }
  remove(...names) { this._set(this._list().filter((n) => !names.includes(n))); }
  toggle(name, force) {
    const has = this.contains(name);
    const want = force === undefined ? !has : !!force;
    if (want) this.add(name); else this.remove(name);
    return want;
  }
}

class Element {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.attributes = {};
    this.children = [];
    this.parentNode = null;
    this._text = '';
    this._listeners = {};
    this.style = {};
    this.classList = new ClassList(this);
    this._innerHTML = '';
    this.hidden = false;
  }

  get className() { return this.attributes.class || ''; }
  set className(v) { this.attributes.class = v; }

  get id() { return this.attributes.id || ''; }

  /*
   * 布尔属性：真实浏览器里 disabled 反映"属性在不在"，
   * checked 既能反映属性、也能被脚本直接改（改的是当前勾选状态）。
   * 少了这两个，测试里读 box.disabled / box.checked 会拿到 undefined，
   * 于是"该禁用的没禁用"这类问题测不出来。
   */
  get disabled() { return this.attributes.disabled !== undefined; }
  set disabled(v) {
    if (v) this.attributes.disabled = '';
    else delete this.attributes.disabled;
  }

  get checked() {
    // 脚本改过就以改动为准，否则看属性
    if (this._checkedOverride !== undefined) return this._checkedOverride;
    return this.attributes.checked !== undefined;
  }
  set checked(v) { this._checkedOverride = !!v; }

  get value() {
    // 真实浏览器里 <select>.value 是当前选中项的 value，而不是某个属性
    if (this.tagName === 'SELECT') {
      const opts = this.children.filter((c) => c.tagName === 'OPTION');
      const sel = opts.find((o) => o.attributes.selected !== undefined);
      if (sel) return sel.attributes.value || '';
      return opts.length ? (opts[0].attributes.value || '') : '';
    }
    return this.attributes.value || '';
  }

  set value(v) {
    const val = String(v);
    if (this.tagName === 'SELECT') {
      for (const o of this.children) {
        if (o.tagName !== 'OPTION') continue;
        if ((o.attributes.value || '') === val) o.attributes.selected = 'selected';
        else delete o.attributes.selected;
      }
      return;
    }
    this.attributes.value = val;
  }

  get placeholder() { return this.attributes.placeholder || ''; }
  set placeholder(v) { this.attributes.placeholder = String(v); }

  get textContent() {
    if (this.children.length === 0) return this._text;
    return this.children.map((c) => c.textContent).join('') + this._text;
  }

  set textContent(v) {
    this.children = [];
    this._text = String(v == null ? '' : v);
  }

  get innerHTML() { return this._innerHTML; }

  set innerHTML(html) {
    this._innerHTML = String(html == null ? '' : html);
    const parsed = parseHtml(this._innerHTML);
    this.children = parsed;
    for (const c of parsed) c.parentNode = this;
    // 新解析出来的元素也要挂上 ownerDocument：
    // focus() 依赖它去更新 document.activeElement。
    if (this.ownerDocument) {
      const tagAll = (node) => {
        node.ownerDocument = this.ownerDocument;
        for (const c of node.children || []) tagAll(c);
      };
      for (const c of parsed) tagAll(c);
    }
    this._text = '';
  }

  getAttribute(name) {
    const v = this.attributes[name];
    return v === undefined ? null : v;
  }

  setAttribute(name, v) { this.attributes[name] = String(v); }
  removeAttribute(name) { delete this.attributes[name]; }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    // 同步进 innerHTML 缓存，保证 querySelector 能查到
    this._innerHTML += serialize(child);
    return child;
  }

  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i !== -1) this.children.splice(i, 1);
    return child;
  }

  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }

  removeEventListener(type, fn) {
    const list = this._listeners[type] || [];
    const i = list.indexOf(fn);
    if (i !== -1) list.splice(i, 1);
  }

  /** 取本元素或其祖先上第一个满足选择器的元素 */
  closest(selector) {
    let node = this;
    while (node) {
      if (matches(node, selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  querySelector(selector) {
    return querySelectorAll(this, selector)[0] || null;
  }

  querySelectorAll(selector) {
    return querySelectorAll(this, selector);
  }

  /**
   * 触发本元素上的监听器（冒泡到祖先，模拟真实事件流）。
   * 用真实的事件对象模型：target 始终是触发元素，currentTarget 沿线变化，
   * 这样 el.onclick 与 addEventListener 两套绑定不会互相串。
   */
  dispatchEvent(event) {
    const ev = event || {};
    if (!ev.target) ev.target = this;
    if (!ev.type) ev.type = 'click';
    if (!ev.preventDefault) ev.preventDefault = () => { ev.defaultPrevented = true; };
    if (!ev.stopPropagation) ev.stopPropagation = () => { ev.propagationStopped = true; };
    if (!ev.stopImmediatePropagation) ev.stopImmediatePropagation = () => { ev.propagationStopped = true; };
    if (this._dispatchCount === undefined) this._dispatchCount = 0;

    let node = this;
    while (node) {
      ev.currentTarget = node;
      const inline = node['on' + ev.type];
      if (typeof inline === 'function') {
        inline.call(node, ev);
        if (ev.propagationStopped) return true;
      }
      const list = (node._listeners[ev.type] || []).slice();
      for (const fn of list) {
        fn.call(node, ev);
        if (ev.propagationStopped) return true;
      }
      node = node.parentNode;
    }
    return true;
  }

  /** 便捷：模拟一次点击 */
  click() {
    return this.dispatchEvent({ type: 'click', target: this });
  }

  /** 便捷：模拟一次事件（例如 keydown / input） */
  fire(type, extra) {
    return this.dispatchEvent(Object.assign({ type, target: this }, extra || {}));
  }

  /** 便捷：模拟输入框里打字并回车 */
  typeAndEnter(value) {
    this.value = value;
    this.fire('input');
    return this.fire('keydown', { key: 'Enter' });
  }

  scrollIntoView() { /* 测试环境无需滚动 */ }

  /**
   * 聚焦：同时更新 document.activeElement。
   * 真实浏览器里"当前焦点"决定键盘事件的目标，我们的快捷键判断依赖这一点。
   */
  focus() {
    this._focused = true;
    const doc = this.ownerDocument;
    if (doc) {
      const prev = doc.activeElement;
      if (prev && prev !== this) prev._focused = false;
      doc.activeElement = this;
    }
  }

  blur() {
    this._focused = false;
    const doc = this.ownerDocument;
    if (doc && doc.activeElement === this) doc.activeElement = null;
  }
}

/* ---------------- HTML 解析（子集） ---------------- */

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'area', 'base', 'col']);

function parseAttributes(str) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(str))) {
    const name = m[1].toLowerCase();
    let value = m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : (m[5] !== undefined ? m[5] : ''));
    if (value === '' && m[2] === undefined) value = '';
    attrs[name] = decodeEntities(value);
  }
  return attrs;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function parseHtml(html) {
  const roots = [];
  const stack = [];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9-]+)\s*>|<([a-zA-Z0-9-]+)((?:[^>"']|"[^"]*"|'[^']*')*)(\/?)>/g;
  let last = 0;
  let m;

  const pushText = (text) => {
    const clean = text.replace(/\s+/g, ' ');
    if (!clean.trim()) return;
    const parent = stack[stack.length - 1];
    if (parent) parent._text += decodeEntities(clean);
  };

  while ((m = re.exec(html))) {
    pushText(html.slice(last, m.index));
    last = re.lastIndex;

    if (m[0].startsWith('<!--')) continue;

    if (m[1]) {
      // 结束标签
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tagName === m[1].toUpperCase()) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const el = new Element(m[2]);
    el.attributes = parseAttributes(m[3] || '');
    if (el.attributes.class) el.classList = new ClassList(el);
    el._text = '';
    const parent = stack[stack.length - 1];
    if (parent) {
      el.parentNode = parent;
      parent.children.push(el);
    } else {
      roots.push(el);
    }
    if (!VOID_TAGS.has(m[2].toLowerCase()) && !m[4]) stack.push(el);
  }
  pushText(html.slice(last));
  return roots;
}

function serialize(el) {
  const attrs = Object.keys(el.attributes)
    .map((k) => ' ' + k + '="' + String(el.attributes[k]).replace(/"/g, '&quot;') + '"')
    .join('');
  const inner = el._text + el.children.map(serialize).join('');
  return '<' + el.tagName.toLowerCase() + attrs + '>' + inner + '</' + el.tagName.toLowerCase() + '>';
}

/* ---------------- 选择器匹配（子集） ---------------- */

function parseSelector(selector) {
  const parts = [];
  const re = /([#.]?[a-zA-Z0-9_-]+|\[[^\]]+\])/g;
  let m;
  while ((m = re.exec(selector))) parts.push(m[1]);
  return parts;
}

function matches(el, selector) {
  const parts = parseSelector(selector);
  if (!parts.length) return false;
  for (const part of parts) {
    if (part.startsWith('#')) {
      if (el.attributes.id !== part.slice(1)) return false;
    } else if (part.startsWith('.')) {
      if (!el.classList.contains(part.slice(1))) return false;
    } else if (part.startsWith('[')) {
      const body = part.slice(1, -1);
      const eq = body.indexOf('=');
      if (eq === -1) {
        if (el.attributes[body] === undefined) return false;
      } else {
        const name = body.slice(0, eq);
        let want = body.slice(eq + 1).trim();
        if ((want.startsWith('"') && want.endsWith('"')) || (want.startsWith("'") && want.endsWith("'"))) {
          want = want.slice(1, -1);
        }
        if (String(el.attributes[name]) !== want) return false;
      }
    } else if (el.tagName !== part.toUpperCase()) {
      return false;
    }
  }
  return true;
}

function querySelectorAll(root, selector) {
  const out = [];
  const visit = (node) => {
    for (const child of node.children) {
      if (matches(child, selector)) out.push(child);
      visit(child);
    }
  };
  visit(root);
  return out;
}

/* ---------------- 文档与全局环境 ---------------- */

export function createDocument(html) {
  const doc = new Element('#document');
  doc.body = new Element('body');
  doc.body.parentNode = doc;

  // activeElement：真实浏览器用它表示"当前聚焦的元素"。
  // 我们的代码要靠它判断"用户是不是正在输入"，所以桩里必须如实维护。
  doc.activeElement = null;

  const roots = parseHtml(html || '');
  for (const r of roots) {
    r.parentNode = doc.body;
    doc.body.children.push(r);
  }
  doc.body._innerHTML = html || '';

  doc.getElementById = (id) => querySelectorAll(doc.body, '#' + id)[0] || null;
  doc.createElement = (tag) => {
    const el = new Element(tag);
    el.ownerDocument = doc;
    return el;
  };
  doc.querySelector = (sel) => querySelectorAll(doc.body, sel)[0] || null;
  doc.querySelectorAll = (sel) => querySelectorAll(doc.body, sel);
  doc.hidden = false;
  doc.addEventListener = () => {};
  doc.removeEventListener = () => {};

  // 给树上的每个元素都挂上 ownerDocument，这样 focus() 能找到 activeElement
  (function tagOwner(node) {
    node.ownerDocument = doc;
    for (const c of node.children || []) tagOwner(c);
  })(doc.body);
  doc.ownerDocument = doc;

  // 让 focus()/blur() 真正更新 document.activeElement
  doc.body.focus = () => { doc.activeElement = doc.body; };
  doc.body.ownerDocument = doc;

  return doc;
}

/**
 * 安装一个可用的最小浏览器环境。
 * @returns {{document, window, uninstall:Function, fireKey:Function}}
 */
export function installDom(html) {
  const doc = createDocument(html);
  const win = new Element('#window');
  const winListeners = {};

  win.addEventListener = (type, fn) => {
    (winListeners[type] = winListeners[type] || []).push(fn);
  };
  win.removeEventListener = (type, fn) => {
    const list = winListeners[type] || [];
    const i = list.indexOf(fn);
    if (i !== -1) list.splice(i, 1);
  };
  win.dispatchEvent = (ev) => {
    for (const fn of (winListeners[ev.type] || []).slice()) fn(ev);
    return true;
  };
  win.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);
  win.cancelAnimationFrame = (id) => clearTimeout(id);

  // 真实浏览器里给 location.hash 赋值会派发 hashchange，这里必须一致，
  // 否则"点标签跳模块"这类依赖路由的逻辑在测试里永远不生效。
  let hashValue = '#/home';
  win.location = {
    get hash() { return hashValue; },
    set hash(v) {
      const next = String(v);
      const changed = next !== hashValue;
      hashValue = next;
      if (changed) win.dispatchEvent({ type: 'hashchange', target: win });
    },
  };
  win.document = doc;

  globalThis.document = doc;
  globalThis.window = win;
  globalThis.location = win.location;
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  globalThis.CSS = { escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c) };

  const api = {
    document: doc,
    window: win,
    winListeners,
    uninstall() {
      delete globalThis.document;
      delete globalThis.window;
      delete globalThis.location;
      delete globalThis.requestAnimationFrame;
      delete globalThis.CSS;
    },
    /** 触发窗口级键盘事件（用于验证快捷键） */
    fireKey(key, target) {
      const ev = {
        key,
        target: target || doc.body,
        preventDefault() { ev.defaultPrevented = true; },
        stopPropagation() { ev.propagationStopped = true; },
      };
      for (const fn of (winListeners.keydown || []).slice()) fn(ev);
      return ev;
    },
    /** 触发窗口级任意事件（例如 hashchange） */
    fireWindow(type, extra) {
      const ev = Object.assign({ type, target: win }, extra || {});
      for (const fn of (winListeners[type] || []).slice()) fn(ev);
      return ev;
    },
    /** 模拟地址栏变化：改 hash 并派发 hashchange */
    navigate(route) {
      win.location.hash = '#/' + route;
      return true;
    },
  };
  return api;
}

/** 便捷：按 data-act 找元素 */
export function findByAct(root, act) {
  return querySelectorAll(root, '[data-act="' + act + '"]');
}

/** 便捷：找一个带指定 data-id 且 data-act 匹配的元素 */
export function findByActAndId(root, act, id) {
  return querySelectorAll(root, '[data-act="' + act + '"][data-id="' + id + '"]')[0] || null;
}

/** 便捷：按 data-field 找表单控件 */
export function findByField(root, field) {
  return querySelectorAll(root, '[data-field="' + field + '"]')[0] || null;
}

/** 便捷：取一个笔记卡片上的"基本信息 + 正文"文本（用于断言界面显示了什么） */
export function noteCardText(card) {
  const info = querySelectorAll(card, '.nc-head')[0];
  const text = querySelectorAll(card, '.nc-text')[0];
  return (info ? info.textContent : '') + ' ' + (text ? text.textContent : '');
}

export { Element };
