/**
 * 应用入口。
 * 负责：装配侧栏 / 顶栏 / 视图，加载数据，处理保存状态、冲突提示与快捷键。
 * 各模块的业务都在 views/ 下，这里只做"总管"。
 */

import * as date from './date.js';
import * as api from './api.js';
import * as logic from './logic.js';
import * as ui from './ui.js';
import * as router from './router.js';
import * as store from './store.js';
import * as jump from './jump.js';

import homeView from './views/home.js';
import todayView from './views/today.js';
import devView from './views/dev.js';
import studyView from './views/study.js';
import readingView from './views/reading.js';
import dietView from './views/diet.js';
import fitnessView from './views/fitness.js';
import settingsView from './views/settings.js';

const VIEWS = {
  home: homeView,
  today: todayView,
  dev: devView,
  study: studyView,
  reading: readingView,
  diet: dietView,
  fitness: fitnessView,
  settings: settingsView,
};

const el = {};

/** 视图参数：今日计划页可以查看别的日期 */
const params = {
  selectedDate: null, // null 表示跟随今天
};

/** 一次性高亮目标（从首页点过来时用） */
let pendingAnchor = '';

function selectedDate() {
  return params.selectedDate || date.todayStr();
}

/* ============================================================
   视图上下文：视图通过它读数据、发动作、跳转
   ============================================================ */

const ctx = {
  get today() { return date.todayStr(); },
  get selectedDate() { return selectedDate(); },
  get route() { return router.currentRoute(); },
  get anchor() { return pendingAnchor; },

  setSelectedDate(day) {
    params.selectedDate = day && day !== date.todayStr() ? day : null;
  },

  /** 打开快速添加弹窗 */
  quickAdd(prefill) {
    openQuickAdd(prefill);
  },

  /**
   * 重绘，并把焦点还回指定输入框。
   * 供"边打边筛"的搜索框使用（重绘会替换 DOM，不还原就没法连续输入）。
   */
  rerenderKeepingFocus(field) {
    rerenderKeepingFocus(field);
  },

  /** 请求一次重绘（视图内部筛选用，不涉及数据改动） */
  rerender() {
    rerender();
  },

  /** 跳到某个模块（可带定位目标） */
  go(route, anchor) {
    if (!router.ROUTES.includes(route)) return;
    pendingAnchor = anchor || '';
    if (router.currentRoute() === route) {
      rerender();
    } else {
      router.go(route);
    }
  },
  /** 从某条数据的来源标签跳过去并高亮 */
  jump(moduleId, taskId) {
    // 模块 id 与路由 id 目前一一对应，不需要额外映射
    jump.triggerJump(moduleId, taskId);
    ctx.go(moduleId, taskId);
  },

  /* ---- 快速备忘 ---- */

  addNote(text) {
    store.dispatch((s) => logic.addNote(s, text), { label: '新增备忘' });
  },

  toggleNote(id) {
    store.dispatch((s) => logic.toggleNote(s, id), { label: '勾选备忘' });
  },

  editNote(id) {
    const note = logic.findNote(store.getState(), id);
    if (!note) return;
    ui.promptDialog({ title: '修改备忘', value: note.text, okText: '保存' }).then((v) => {
      if (v == null) return;
      store.dispatch((s) => logic.updateNote(s, id, { text: v }), { label: '修改备忘' });
    });
  },

  deleteNote(id) {
    const note = logic.findNote(store.getState(), id);
    if (!note) return;
    store.dispatch((s) => logic.removeNote(s, id), { undoable: true, label: '删除备忘' });
    ui.toastUndo('已删除备忘', () => store.undo());
  },

  noteToTask(id) {
    const note = logic.findNote(store.getState(), id);
    if (!note) return;
    const modules = logic.quickAddModules();
    ui.modulePicker(modules.length ? modules[0].id : 'general', modules, (moduleId) => {
      store.dispatch((s) => logic.noteToTask(s, id, { module: moduleId, date: date.todayStr() }), { label: '便签变任务' });
      ui.toast('已变成任务并加入今天', { type: 'ok', duration: 2200 });
    });
  },

  /** 新增一条任务（首页内联快速补一条用） */
  addTask(input) {
    const task = store.dispatch((s) => logic.addTask(s, input), { label: '新增任务' });
    if (task) {
      ui.toast('已加入今天：' + task.title, { type: 'ok', duration: 1800 });
    }
  },

  /**
   * 通用改动入口（各模块视图用）。
   * @param {(state)=>any} mutator
   * @param {string|object} opts 可以只给一个标题，也可以给完整的 {label, undoable}
   */
  dispatch(mutator, opts) {
    const options = typeof opts === 'string' ? { label: opts } : (opts || {});
    return store.dispatch(mutator, options);
  },

  /** 通用撤销 */
  undo() {
    return store.undo();
  },

  /** 保存状态（设置页展示用） */
  status() {
    return store.getStatus();
  },

  /** 在资源管理器里打开数据文件夹 */
  revealDataDir() {
    return api.revealDataDir();
  },
};

/* ============================================================
   侧栏
   ============================================================ */

function renderSidebar() {
  const state = store.getState();
  const today = date.todayStr();
  const pending = logic.pendingByModule(state, today);

  for (const item of logic.NAV_ITEMS) {
    const link = document.querySelector('.nav-item[data-route="' + item.id + '"]');
    if (!link) continue;
    link.classList.toggle('active', item.id === router.currentRoute());

    const badge = link.querySelector('.nav-count');
    if (!badge) continue;

    let count = 0;
    if (item.id === 'today') {
      const progress = logic.todayProgress(state, today);
      count = progress.total - progress.done;
    } else if (item.id === 'home' || item.id === 'settings') {
      count = 0;
    } else {
      // 其余入口的 id 与任务模块 id 一致
      count = pending[item.id] || 0;
    }

    badge.textContent = count > 0 ? String(count) : '';
    badge.classList.toggle('show', count > 0);
    link.title = item.name + (count > 0 ? '（今天还有 ' + count + ' 条没做完）' : '');
  }

  const progress = logic.todayProgress(state, today);
  if (el.footDone) el.footDone.textContent = progress.done + '/' + progress.total;
  if (el.footBar) el.footBar.style.width = progress.percent + '%';
}

/* ============================================================
   保存状态
   ============================================================ */

const SAVE_TEXT = {
  idle: '就绪',
  unsaved: '待保存',
  saving: '保存中…',
  saved: '已保存',
  error: '保存失败',
  conflict: '数据冲突',
};

function renderSaveStatus() {
  if (!el.saveDot) return;
  const s = store.getStatus();
  el.saveDot.className = 'save-dot ' + s.saveStatus;
  const text = SAVE_TEXT[s.saveStatus] || '';
  const time = s.saveStatus === 'saved' && s.lastSavedAt ? ' ' + date.fmtTime(s.lastSavedAt) : '';
  el.saveDot.querySelector('.save-text').textContent = text + time;

  if (s.saveStatus === 'error') {
    el.saveDot.title = '保存失败：' + (s.lastError || '未知原因') + '（点击重试）';
  } else if (s.saveStatus === 'conflict') {
    el.saveDot.title = '数据已在别处更新（点击查看处理办法）';
  } else if (s.saveStatus === 'saved') {
    el.saveDot.title = '数据已写入本机文件' + (s.serverPath ? '：' + s.serverPath : '');
  } else {
    el.saveDot.title = '保存状态';
  }
}

function bindSaveDot() {
  if (!el.saveDot) return;
  el.saveDot.onclick = () => {
    const s = store.getStatus();
    if (s.saveStatus === 'error') {
      ui.toast('正在重试保存…', { duration: 1500 });
      store.flushNow();
      return;
    }
    if (s.saveStatus === 'conflict') {
      ui.confirmDialog({
        title: '数据冲突',
        message: '这份数据已经在别的地方被改动过。为避免覆盖，刚才的改动没有保存。',
        detail: '选择「放弃我的改动」会重新读取最新数据；选择「取消」你可以先把手头内容记下来。',
        okText: '放弃我的改动，重新读取',
        cancelText: '取消',
        danger: true,
      }).then((yes) => {
        if (!yes) return;
        store.discardLocalAndReload().then(() => {
          ui.toast('已重新读取最新数据', { type: 'ok' });
          rerender();
        }).catch((err) => ui.toast('重新读取失败：' + err.message, { type: 'error' }));
      });
      return;
    }
    ui.openModal({
      title: '保存状态',
      body: '<dl class="kv">' +
        '<dt>当前状态</dt><dd>' + ui.escapeHtml(SAVE_TEXT[s.saveStatus] || '') + '</dd>' +
        '<dt>上次保存</dt><dd>' + ui.escapeHtml(s.lastSavedAt ? date.fmtDateTime(s.lastSavedAt) : '—') + '</dd>' +
        '<dt>数据版本</dt><dd>' + ui.escapeHtml(String(s.revision)) + '</dd>' +
        '<dt>数据文件</dt><dd>' + ui.escapeHtml(s.serverPath || '（未获取）') + '</dd>' +
        (s.recovered ? '<dt>恢复提示</dt><dd>本次启动时从备份恢复了数据' + (s.recoveredFrom ? '（' + ui.escapeHtml(s.recoveredFrom) + '）' : '') + '</dd>' : '') +
        '</dl>',
    });
  };
}

/* ============================================================
   视图渲染
   ============================================================ */

let renderQueued = false;
let waiters = [];
let stopped = false;

export function rerender() {
  if (stopped || renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    if (stopped) return;
    renderNow();
    const list = waiters;
    waiters = [];
    for (const fn of list) fn();
  });
}

/**
 * 重绘后把焦点与光标还给指定的输入框。
 * 搜索框这类"边打边筛"的输入，重绘会替换 DOM，不还原就没法连续输入。
 */
export function rerenderKeepingFocus(field) {
  rerender();
  requestAnimationFrame(() => {
    if (!el.view || !field) return;
    const input = el.view.querySelector('[data-field="' + field + '"]');
    if (!input) return;
    input.focus();
    // 光标移到末尾，继续打字不会被顶到开头
    if (typeof input.setSelectionRange === 'function' && typeof input.value === 'string') {
      try {
        input.setSelectionRange(input.value.length, input.value.length);
      } catch { /* 某些 input 类型不支持，忽略即可 */ }
    }
  });
}

/**
 * 等下一次重绘完成（测试用；界面代码不需要）。
 * 若当前没有排队的重绘，会主动排一次。
 */
export function nextRender() {
  return new Promise((resolve) => {
    waiters.push(resolve);
    rerender();
  });
}

function renderNow() {
  const route = router.currentRoute();
  const view = VIEWS[route] || VIEWS.home;

  // 从别处跳过来时带上一次性定位目标
  const pending = jump.takePendingJump(route);
  if (pending) pendingAnchor = pending.anchorId || '';

  if (el.pageTitle) el.pageTitle.textContent = router.routeName(route);
  if (el.todayChip) el.todayChip.textContent = date.fmtDateCn(selectedDate());

  renderSidebar();
  renderSaveStatus();

  if (!el.view) return;
  let html;
  try {
    html = view.render(store.getState(), ctx);
  } catch (err) {
    console.error('[视图渲染出错]', route, err);
    html = ui.card({
      title: '这个页面渲染出错了',
      body: '<p>' + ui.escapeHtml(err && err.message ? err.message : String(err)) + '</p>' +
        '<p class="muted small">数据本身没有丢失，可以切到别的模块继续使用。</p>',
    });
  }
  el.view.innerHTML = html;

  if (view.mounted) {
    try {
      view.mounted(el.view, ctx, { rerender, rerenderKeepingFocus });
    } catch (err) {
      console.error('[视图挂载出错]', route, err);
    }
  }
  pendingAnchor = '';

  // 视图内的点击由各视图自己声明的 handler 处理
  if (view.onClick) {
    el.view.onclick = (ev) => {
      // 一次点击只处理一次：万一事件被重复派发（嵌套节点等），也不会执行两遍
      if (ev.__workbenchHandled) return;
      ev.__workbenchHandled = true;
      try {
        view.onClick(ev, store, ctx, { rerender });
      } catch (err) {
        console.error('[视图交互出错]', route, err);
        ui.toast('操作失败：' + (err && err.message ? err.message : '未知错误'), { type: 'error' });
        reportError(err, 'view-onclick');
      }
    };
  } else {
    el.view.onclick = null;
  }
}

/** 错误上报钩子：默认打日志，测试里可以换成抛出来，避免把错误吞掉 */
let errorHook = null;

export function onError(fn) {
  errorHook = fn;
}

function reportError(err, where) {
  if (errorHook) {
    try {
      errorHook(err, where);
    } catch { /* 钩子自身出错就算了 */ }
  }
}

/**
 * 停止界面活动：清掉排队中的重绘与等待者。
 * 用于测试收尾，避免页面结构已经拆除还有回调往里写内容。
 */
export function stop() {
  renderQueued = false;
  stopped = true;
  const list = waiters;
  waiters = [];
  for (const fn of list) fn();
}

/* ============================================================
   顶栏快速添加
   ============================================================ */

function openQuickAdd(prefill) {
  const pre = prefill || {};
  const today = date.todayStr();
  const moduleOptions = logic.quickAddModules().map((m) => ({ value: m.id, label: m.name }));
  // 默认选中第一个模块（开发工作）；不再有"通用"这个选项
  const defaultModule = moduleOptions.length ? moduleOptions[0].value : 'general';

  const body =
    '<div class="field"><label class="field-label">要做什么</label>' +
    '<input class="input" type="text" data-field="title" placeholder="例如：改登录接口 bug" value="' +
    ui.escapeHtml(pre.title || '') + '"></div>' +
    '<div class="field-row">' +
    '<div class="field"><label class="field-label">属于哪个模块</label>' +
    ui.select('module', logic.isModuleId(pre.module) && pre.module !== 'general' ? pre.module : defaultModule, moduleOptions) + '</div>' +
    '<div class="field"><label class="field-label">安排在哪天</label>' +
    '<input class="input" type="date" data-field="date" value="' + ui.escapeHtml(pre.date || today) + '"></div>' +
    '</div>' +
    '<div class="field"><label class="field-label">优先级</label>' +
    ui.select('priority', logic.normalizePriority(pre.priority), logic.priorityOptions()) + '</div>';

  ui.openModal({
    title: '快速添加任务',
    body,
    foot:
      '<button type="button" class="btn" data-act="close">取消</button>' +
      '<button type="button" class="btn btn-primary" data-act="save">添加</button>',
    onMount(root) {
      const title = ui.qs(root, '[data-field="title"]');
      const save = ui.qs(root, '[data-act="save"]');

      const submit = () => {
        const value = title.value.trim();
        if (!value) {
          title.style.borderColor = 'var(--danger)';
          title.focus();
          return;
        }
        const module = ui.qs(root, '[data-field="module"]').value;
        const day = ui.qs(root, '[data-field="date"]').value || date.todayStr();
        const priority = ui.qs(root, '[data-field="priority"]').value;

        store.dispatch((s) => logic.addTask(s, { title: value, module, date: day, priority }), { label: '新增任务' });
        ui.closeModal();
        ui.toast('已添加到「' + logic.moduleName(module) + '」' + (day === today ? '今天' : date.fmtDateCn(day)), { type: 'ok', duration: 2500 });
        rerender();
      };

      save.onclick = submit;
      title.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') submit();
      });
    },
  });
}

/* ============================================================
   启动
   ============================================================ */

function applyDensity() {
  const density = store.getState().settings.density;
  document.body.classList.toggle('density-compact', density === 'compact');
}

function bindGlobalKeys() {
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && ui.isModalOpen()) {
      ui.closeModal();
      return;
    }
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const t = ev.target;
    const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable);
    if (typing) return;

    if (ev.key === 'a' || ev.key === 'A') {
      ev.preventDefault();
      openQuickAdd();
    }
  });
}

function showStartupNotices() {
  const s = store.getStatus();
  if (s.recovered) {
    ui.toast('检测到数据文件异常，已从备份恢复' + (s.recoveredFrom ? '（' + s.recoveredFrom + '）' : ''), {
      type: 'warn',
      duration: 12000,
    });
  }
}

export async function init() {
  el.pageTitle = document.getElementById('pageTitle');
  el.todayChip = document.getElementById('todayChip');
  el.view = document.getElementById('view');
  el.saveDot = document.getElementById('saveDot');
  el.footDone = document.getElementById('footDone');
  el.footBar = document.getElementById('footBar');

  const quickBtn = document.getElementById('btnQuickAdd');
  if (quickBtn) quickBtn.onclick = () => openQuickAdd();

  bindGlobalKeys();
  bindSaveDot();

  el.view.innerHTML = '<div class="loading">正在读取本地数据…</div>';

  try {
    await store.load();
  } catch (err) {
    el.view.innerHTML = ui.card({
      title: '无法连接本地服务',
      body: '<p>' + ui.escapeHtml(err && err.message ? err.message : String(err)) + '</p>' +
        '<p class="muted small">请确认启动脚本的窗口还在运行，然后刷新页面。</p>',
    });
    return;
  }

  store.subscribe(() => {
    applyDensity();
    rerender();
  });

  router.start(() => {
    // 切模块时回到"今天"，避免停留在他处日期造成困惑
    params.selectedDate = null;
    rerender();
  });

  applyDensity();
  renderNow();
  showStartupNotices();

  // 服务端信息（数据文件位置等）用于设置页与保存状态提示
  try {
    const h = await api.health();
    store.setServerPath(h.dataFile || '');
    renderSaveStatus();
  } catch { /* 拿不到就算了，不影响使用 */ }
}

// 浏览器里自动启动；测试环境（无 document）下由测试代码显式调用 init
if (typeof document !== 'undefined') {
  init();
}

export { renderNow, ctx as actionContext, openQuickAdd };
