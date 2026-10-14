/**
 * 纯逻辑层。
 *
 * 这里放**不碰 DOM、不碰网络**的业务规则：数据结构、增删改、派生统计。
 * 好处：同一套规则既跑在浏览器里，也能在 Node 里被自动化测试直接验证。
 * 铁律：本文件不得引用 document / window / fetch，也不得依赖任何视图。
 */

import * as date from './date.js';

/* ============================================================
   常量
   ============================================================ */

export const APP_TITLE = '我的工作台';

/** 任务可归属的模块（名称与左侧导航保持一致） */
export const MODULES = [
  { id: 'dev', name: '开发', short: '开发' },
  { id: 'study', name: '学习', short: '学习' },
  { id: 'reading', name: '阅读', short: '阅读' },
  { id: 'diet', name: '饮食', short: '饮食' },
  { id: 'general', name: '通用', short: '通用' },
];

export const MODULE_IDS = MODULES.map((m) => m.id);

/**
 * 下拉里可以选择的模块。
 * 与左侧导航对齐：导航里有几个业务模块，这里就有几个，不多不少。
 * 「通用」是兜底分类（旧数据、临时任务会落到这里），不作为选项出现——
 * 否则下拉里会出现"导航里根本没有的模块"，与导航对不上。
 */
export function quickAddModules() {
  return MODULES.filter((m) => m.id !== 'general');
}

export function isModuleId(id) {
  return MODULE_IDS.includes(id);
}

export function moduleName(id) {
  const m = MODULES.find((x) => x.id === id);
  return m ? m.short : '通用';
}

/** 侧栏导航顺序（首页与今日计划不是任务归属模块，但都可进入） */
export const NAV_ITEMS = [
  { id: 'home', name: '首页总览', icon: '▦' },
  { id: 'today', name: '今日计划', icon: '☑' },
  { id: 'dev', name: '开发', icon: '⌘' },
  { id: 'study', name: '学习', icon: '✎' },
  { id: 'reading', name: '阅读', icon: '❐' },
  { id: 'diet', name: '饮食', icon: '◍' },
  { id: 'settings', name: '数据与设置', icon: '⚙' },
];

/**
 * 导航入口里"本身就是任务归属模块"的那些。
 *
 * 不是所有导航入口都对应模块：首页、今日计划、读书笔记、数据与设置都不是
 * （你不能把一条任务归到"读书笔记"这一类）。
 * 这个集合由 NAV_ITEMS 与 MODULE_IDS 求交得到，是这个概念的唯一来源——
 * 以后新增导航项也不会让"下拉与导航一致"的检查失准。
 *
 * 必须定义在 NAV_ITEMS **之后**：const 有暂时性死区，提前引用会在模块加载时直接抛错。
 */
export const NAV_MODULE_IDS = NAV_ITEMS
  .map((n) => n.id)
  .filter((id) => MODULE_IDS.includes(id) && id !== 'general');

/**
 * 已被移除的模块：从界面和数据里都清掉。
 * 保留这份清单是为了让旧数据能识别出来并安全清理，而不是静默丢弃。
 */
export const REMOVED_MODULES = [
  { id: 'media', name: '自媒体', legacyFields: ['media'] },
  { id: 'consult', name: '咨询工作', legacyFields: ['consultTasks', 'consultRecords'] },
  { id: 'game', name: '游戏娱乐', legacyFields: ['games', 'playPlan'] },
  { id: 'fitness', name: '健身计划', legacyFields: ['fitness'] },
];

/** 状态枚举与中文标签 */
export const DEV_STATUS = {
  todo: '未开始',
  doing: '开发中',
  testing: '联调测试',
  online: '已上线',
};
export const DEV_ORDER = ['todo', 'doing', 'testing', 'online'];

export const MEALS = [
  { key: 'breakfast', name: '早餐' },
  { key: 'lunch', name: '午餐' },
  { key: 'dinner', name: '晚餐' },
];
export const MEAL_KEYS = MEALS.map((m) => m.key);

export const PRIORITY = { normal: '普通', high: '重要' };

export const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/* ============================================================
   基础工具
   ============================================================ */

let idSeq = 0;

/** 生成唯一 id：前缀 + 时间戳36进制 + 自增序号，保证同毫秒内也不重复 */
export function newId(prefix) {
  idSeq = (idSeq + 1) % 100000;
  return (prefix || 'x') + '_' + Date.now().toString(36) + idSeq.toString(36).padStart(3, '0');
}

/**
 * 从 id 末尾取创建序号（newId 写进去的自增号）。
 * 用来给"同一毫秒创建"的数据排序：时间戳相同再按序号，顺序才是稳定且符合直觉的。
 */
export function idSeqOf(id) {
  const m = /([0-9a-z]{3})$/.exec(String(id || ''));
  return m ? parseInt(m[1], 36) : 0;
}

/** 按创建时间倒序（新的在前）；同毫秒时按创建序号，保证顺序稳定可预测 */
export function byNewestFirst(a, b) {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return idSeqOf(b.id) - idSeqOf(a.id);
}

export function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

/** 全新的空数据 */
export function createInitialState() {
  return {
    schemaVersion: 1,
    revision: 0,
    updatedAt: null,
    tasks: [],
    notes: [],
    devTasks: [],
    devIdeas: [],
    studyItems: [],
    books: [],
    readLog: [],
    bookNotes: [],
    diet: { meals: {}, recipes: [], shopping: [] },
    settings: { density: 'comfortable', readingDailyGoal: 30 },
  };
}

/**
 * 清理已移除模块的数据。
 * 返回被清掉的内容统计，供界面如实告知用户（不静默丢数据）。
 */
export function purgeRemovedModules(input) {
  const report = [];
  if (!input || typeof input !== 'object') return report;

  for (const mod of REMOVED_MODULES) {
    let count = 0;
    for (const field of mod.legacyFields) {
      if (!(field in input)) continue;
      const v = input[field];
      if (Array.isArray(v)) count += v.length;
      else if (v && typeof v === 'object') {
        // 嵌套对象：把各子字段的条数加起来（如 fitness.records 的打卡天数）
        count += Object.keys(v).reduce((n, k) => {
          const child = v[k];
          if (Array.isArray(child)) return n + child.length;
          if (child && typeof child === 'object') return n + Object.keys(child).length;
          return n + 1;
        }, 0);
      }
      delete input[field];
    }
    // 这些模块名下的任务也一并清掉（模块本身已不存在）
    if (Array.isArray(input.tasks)) {
      const before = input.tasks.length;
      input.tasks = input.tasks.filter((t) => t && t.module !== mod.id);
      count += before - input.tasks.length;
    }
    if (count > 0) report.push({ id: mod.id, name: mod.name, count });
  }
  return report;
}

/** 补齐缺失字段，兼容旧数据与手改数据 */
export function normalizeState(input) {
  const base = createInitialState();
  if (!input || typeof input !== 'object') return base;
  const out = Object.assign(base, input);

  // 先清掉已移除模块的内容，再做字段校正
  purgeRemovedModules(out);

  for (const f of ['tasks', 'notes', 'devTasks', 'devIdeas', 'studyItems', 'books', 'readLog', 'bookNotes']) {
    if (!Array.isArray(out[f])) out[f] = [];
  }

  if (!out.diet || typeof out.diet !== 'object') out.diet = { meals: {}, recipes: [], shopping: [] };
  if (!out.diet.meals || typeof out.diet.meals !== 'object' || Array.isArray(out.diet.meals)) out.diet.meals = {};
  if (!Array.isArray(out.diet.recipes)) out.diet.recipes = [];
  if (!Array.isArray(out.diet.shopping)) out.diet.shopping = [];

  if (!out.settings || typeof out.settings !== 'object') out.settings = {};
  // 健身模块移除后，设置里的健身目标也没用了
  delete out.settings.fitnessWeeklyGoal;
  if (out.settings.density !== 'compact' && out.settings.density !== 'comfortable') out.settings.density = 'comfortable';
  // 每日阅读目标：1–480 分钟，非法值回落 30
  const goal = Number(out.settings.readingDailyGoal);
  out.settings.readingDailyGoal = Number.isFinite(goal) && goal >= 1 && goal <= 480 ? Math.round(goal) : 30;

  out.schemaVersion = 1;
  out.revision = Number.isFinite(out.revision) ? Number(out.revision) : 0;
  return out;
}

/* ============================================================
   任务：增删改查
   ============================================================ */

/**
 * 补全一条任务的字段。
 * date 缺省为今天；module 缺省为通用。
 */
export function makeTask(input) {
  const src = input || {};
  const title = String(src.title == null ? '' : src.title).trim();
  const nowIso = date.nowIso();
  return {
    id: src.id || newId('t'),
    title,
    module: MODULE_IDS.includes(src.module) ? src.module : 'general',
    date: date.isValidDateStr(src.date) ? src.date : date.todayStr(),
    done: !!src.done,
    priority: src.priority === 'high' ? 'high' : 'normal',
    note: src.note == null ? '' : String(src.note),
    createdAt: src.createdAt || nowIso,
    updatedAt: nowIso,
  };
}

/** 新增任务（直接改动传入的 state） */
export function addTask(state, input) {
  const task = makeTask(input);
  if (!task.title) return null;
  state.tasks.push(task);
  return task;
}

export function findTask(state, id) {
  return state.tasks.find((t) => t.id === id) || null;
}

/** 修改任务的部分字段 */
export function updateTask(state, id, patch) {
  const task = findTask(state, id);
  if (!task) return null;
  const p = patch || {};
  if (p.title != null) {
    const title = String(p.title).trim();
    if (title) task.title = title;
  }
  if (p.module != null && MODULE_IDS.includes(p.module)) task.module = p.module;
  if (p.date != null && date.isValidDateStr(p.date)) task.date = p.date;
  if (p.done != null) task.done = !!p.done;
  if (p.priority != null) task.priority = p.priority === 'high' ? 'high' : 'normal';
  if (p.note != null) task.note = String(p.note);
  task.updatedAt = date.nowIso();
  return task;
}

export function removeTask(state, id) {
  const i = state.tasks.findIndex((t) => t.id === id);
  if (i === -1) return null;
  const [removed] = state.tasks.splice(i, 1);
  return removed;
}

export function toggleTask(state, id) {
  const task = findTask(state, id);
  if (!task) return null;
  task.done = !task.done;
  task.updatedAt = date.nowIso();
  return task;
}

/** 改期：把任务挪到指定日期 */
export function rescheduleTask(state, id, newDate) {
  if (!date.isValidDateStr(newDate)) return null;
  return updateTask(state, id, { date: newDate });
}

/** 处理逾期任务：把若干条一次性挪到某天 */
export function moveTasksTo(state, ids, targetDate) {
  if (!date.isValidDateStr(targetDate)) return 0;
  let n = 0;
  for (const id of ids || []) {
    const t = findTask(state, id);
    if (!t) continue;
    t.date = targetDate;
    t.updatedAt = date.nowIso();
    n++;
  }
  return n;
}

/** 把某天没做完的任务顺延一天 */
export function postponeUnfinished(state, fromDate, toDate) {
  const target = toDate || date.addDays(fromDate, 1);
  const ids = state.tasks.filter((t) => t.date === fromDate && !t.done).map((t) => t.id);
  return moveTasksTo(state, ids, target);
}

/* ============================================================
   任务查询与派生统计
   ============================================================ */

/** 某天的任务（默认今天），未完成的排前面，其次重要优先 */
export function tasksOn(state, day) {
  const d = day || date.todayStr();
  return state.tasks
    .filter((t) => t.date === d)
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    });
}

/** 逾期任务：未完成且日期早于今天 */
export function overdueTasks(state, today) {
  const d = today || date.todayStr();
  return state.tasks
    .filter((t) => !t.done && date.isValidDateStr(t.date) && t.date < d)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function isOverdue(task, today) {
  const d = today || date.todayStr();
  return !task.done && date.isValidDateStr(task.date) && task.date < d;
}

/** 某模块今天未完成的任务数（侧栏欠账数用） */
export function modulePendingToday(state, moduleId, today) {
  const d = today || date.todayStr();
  return state.tasks.filter((t) => t.module === moduleId && t.date === d && !t.done).length;
}

/** 今天各模块的欠账数 */
export function pendingByModule(state, today) {
  const out = {};
  for (const m of MODULE_IDS) out[m] = 0;
  for (const t of state.tasks) {
    if (t.date === (today || date.todayStr()) && !t.done) out[t.module] = (out[t.module] || 0) + 1;
  }
  return out;
}

/** 今日进度 */
export function todayProgress(state, today) {
  const list = tasksOn(state, today);
  const done = list.filter((t) => t.done).length;
  return { done, total: list.length, percent: list.length === 0 ? 0 : Math.round((done / list.length) * 100) };
}

/** 按日期升序列出所有有任务的日期 */
export function datesWithTasks(state) {
  const set = new Set(state.tasks.map((t) => t.date).filter((d) => date.isValidDateStr(d)));
  return Array.from(set).sort();
}

/** 某个月里带日期的条目（自媒体排期等通用） */
export function entriesInMonth(list, year, month, field) {
  const prefix = year + '-' + String(month).padStart(2, '0') + '-';
  return (list || []).filter((x) => {
    const v = x[field || 'date'];
    return typeof v === 'string' && v.startsWith(prefix);
  });
}

/* ============================================================
   快速备忘
   ============================================================ */

export function addNote(state, text) {
  const t = String(text == null ? '' : text).trim();
  if (!t) return null;
  const note = { id: newId('n'), text: t, done: false, createdAt: date.nowIso() };
  state.notes.push(note);
  return note;
}

export function findNote(state, id) {
  return state.notes.find((n) => n.id === id) || null;
}

export function updateNote(state, id, patch) {
  const note = findNote(state, id);
  if (!note) return null;
  const p = patch || {};
  if (p.text != null) {
    const text = String(p.text).trim();
    if (text) note.text = text;
  }
  if (p.done != null) note.done = !!p.done;
  return note;
}

export function removeNote(state, id) {
  const i = state.notes.findIndex((n) => n.id === id);
  if (i === -1) return null;
  const [removed] = state.notes.splice(i, 1);
  return removed;
}

export function toggleNote(state, id) {
  const note = findNote(state, id);
  if (!note) return null;
  note.done = !note.done;
  return note;
}

/** 把便签升级为正式任务：便签消失，任务进入归属模块 */
export function noteToTask(state, id, opts) {
  const note = findNote(state, id);
  if (!note) return null;
  const task = addTask(state, {
    title: note.text,
    module: (opts && opts.module) || 'general',
    date: (opts && opts.date) || date.todayStr(),
  });
  if (!task) return null;
  removeNote(state, id);
  return task;
}

/* ============================================================
   开发
   ============================================================ */

export function addDevTask(state, input) {
  const src = input || {};
  const title = String(src.title == null ? '' : src.title).trim();
  if (!title) return null;
  const item = {
    id: src.id || newId('d'),
    title,
    status: DEV_ORDER.includes(src.status) ? src.status : 'todo',
    priority: src.priority === 'high' ? 'high' : 'normal',
    note: src.note == null ? '' : String(src.note),
    createdAt: src.createdAt || date.nowIso(),
    updatedAt: date.nowIso(),
  };
  state.devTasks.push(item);
  return item;
}

export function findDevTask(state, id) {
  return state.devTasks.find((d) => d.id === id) || null;
}

export function updateDevTask(state, id, patch) {
  const item = findDevTask(state, id);
  if (!item) return null;
  const p = patch || {};
  if (p.title != null) {
    const t = String(p.title).trim();
    if (t) item.title = t;
  }
  if (p.status != null && DEV_ORDER.includes(p.status)) item.status = p.status;
  if (p.priority != null) item.priority = p.priority === 'high' ? 'high' : 'normal';
  if (p.note != null) item.note = String(p.note);
  item.updatedAt = date.nowIso();
  return item;
}

export function removeDevTask(state, id) {
  const i = state.devTasks.findIndex((d) => d.id === id);
  if (i === -1) return null;
  const [removed] = state.devTasks.splice(i, 1);
  return removed;
}

export function devByStatus(state) {
  const out = {};
  for (const s of DEV_ORDER) out[s] = [];
  for (const d of state.devTasks) {
    if (!out[d.status]) out[d.status] = [];
    out[d.status].push(d);
  }
  return out;
}

export function devDoingCount(state) {
  return state.devTasks.filter((d) => d.status === 'doing').length;
}

export function devDoneTodayCount(state, today) {
  const d = today || date.todayStr();
  return state.tasks.filter((t) => t.module === 'dev' && t.date === d && t.done).length;
}

export function pushDevToToday(state, id, day) {
  const item = findDevTask(state, id);
  if (!item) return null;
  return addTask(state, { title: item.title, module: 'dev', date: day || date.todayStr() });
}

/* ---- 灵感收集箱 ---- */

export function addDevIdea(state, text) {
  const t = String(text == null ? '' : text).trim();
  if (!t) return null;
  const idea = { id: newId('i'), text: t, handled: false, createdAt: date.nowIso() };
  state.devIdeas.push(idea);
  return idea;
}

export function findDevIdea(state, id) {
  return state.devIdeas.find((i) => i.id === id) || null;
}

export function removeDevIdea(state, id) {
  const i = state.devIdeas.findIndex((x) => x.id === id);
  if (i === -1) return null;
  const [removed] = state.devIdeas.splice(i, 1);
  return removed;
}

export function setDevIdeaHandled(state, id, handled) {
  const idea = findDevIdea(state, id);
  if (!idea) return null;
  idea.handled = !!handled;
  return idea;
}

/** 灵感 → 待办：转成开发待办，并从灵感箱移除 */
export function devIdeaToTask(state, id, opts) {
  const idea = findDevIdea(state, id);
  if (!idea) return null;
  const devTask = addDevTask(state, {
    title: idea.text,
    status: (opts && opts.status) || 'todo',
    priority: (opts && opts.priority) || 'normal',
  });
  if (!devTask) return null;
  removeDevIdea(state, id);
  return devTask;
}

/* ============================================================
   学习
   ============================================================ */

/** 学习条目的类型 */
export const STUDY_KINDS = {
  read: '阅读',
  course: '课程',
  practice: '练习',
  video: '视频',
  other: '其他',
};
export const STUDY_KIND_ORDER = ['read', 'course', 'practice', 'video', 'other'];

/** 学习条目的进度 */
export const STUDY_STATUS = {
  todo: '未开始',
  doing: '学习中',
  done: '已学完',
};
export const STUDY_ORDER = ['todo', 'doing', 'done'];

export function addStudyItem(state, input) {
  const src = typeof input === 'string' ? { title: input } : (input || {});
  const title = String(src.title == null ? '' : src.title).trim();
  if (!title) return null;
  const item = {
    id: src.id || newId('s'),
    title,
    kind: STUDY_KIND_ORDER.includes(src.kind) ? src.kind : 'read',
    status: STUDY_ORDER.includes(src.status) ? src.status : 'todo',
    minutes: Math.max(0, Number(src.minutes) || 0),
    source: src.source == null ? '' : String(src.source),
    note: src.note == null ? '' : String(src.note),
    createdAt: src.createdAt || date.nowIso(),
    updatedAt: date.nowIso(),
  };
  state.studyItems.push(item);
  return item;
}

export function findStudyItem(state, id) {
  return state.studyItems.find((s) => s.id === id) || null;
}

export function updateStudyItem(state, id, patch) {
  const item = findStudyItem(state, id);
  if (!item) return null;
  const p = patch || {};
  if (p.title != null) {
    const title = String(p.title).trim();
    if (title) item.title = title;
  }
  if (p.kind != null && STUDY_KIND_ORDER.includes(p.kind)) item.kind = p.kind;
  if (p.status != null && STUDY_ORDER.includes(p.status)) item.status = p.status;
  if (p.minutes != null) item.minutes = Math.max(0, Number(p.minutes) || 0);
  if (p.source != null) item.source = String(p.source);
  if (p.note != null) item.note = String(p.note);
  item.updatedAt = date.nowIso();
  return item;
}

export function removeStudyItem(state, id) {
  const i = state.studyItems.findIndex((s) => s.id === id);
  if (i === -1) return null;
  const [removed] = state.studyItems.splice(i, 1);
  return removed;
}

/** 累计学习时长（分钟） */
export function studyMinutesTotal(state) {
  return state.studyItems.reduce((n, s) => n + (Number(s.minutes) || 0), 0);
}

/** 已学完的条目数 */
export function studyDoneCount(state) {
  return state.studyItems.filter((s) => s.status === 'done').length;
}

/** 把学习条目推进到下一档进度 */
export function advanceStudyItem(state, id) {
  const item = findStudyItem(state, id);
  if (!item) return null;
  const idx = STUDY_ORDER.indexOf(item.status);
  item.status = STUDY_ORDER[(idx + 1) % STUDY_ORDER.length];
  item.updatedAt = date.nowIso();
  return item;
}

/** 把学习条目推到今天做 */
export function pushStudyToToday(state, id, day) {
  const item = findStudyItem(state, id);
  if (!item) return null;
  return addTask(state, { title: item.title, module: 'study', date: day || date.todayStr() });
}

export function unhandledIdeas(state) {
  return state.devIdeas.filter((i) => !i.handled);
}

/* ============================================================
   阅读
   ------------------------------------------------------------
   三样数据：书（books）、每日阅读分钟（readLog）、读书笔记（bookNotes）。
   进度以"页"为单位推进，读完自动置为已读完并记下完成日期。
   ============================================================ */

/** 书的阅读状态 */
export const BOOK_STATUS = {
  want: '想读',
  reading: '在读',
  finished: '已读完',
  paused: '搁置',
};
export const BOOK_STATUS_ORDER = ['want', 'reading', 'finished', 'paused'];

/** 书的分类 */
export const BOOK_KINDS = {
  book: '纸书',
  ebook: '电子书',
  audio: '有声书',
  article: '长文',
  other: '其他',
};
export const BOOK_KIND_ORDER = ['book', 'ebook', 'audio', 'article', 'other'];

/**
 * 按当前页码校正书的状态与日期。
 *
 * 抽成共用函数是因为"加书"和"改书"两个入口都会改到页码：
 * 只在改书时推导状态，会让"新建时就填了已读页数"的书停在"想读"，两处行为不一致。
 * 这里是唯一的推导点：谁改了页码都从这里过一遍。
 */
function applyBookProgressRules(book) {
  // 页码不能超过总页数（没填总页数时不设上限）
  if (book.totalPages > 0) {
    book.currentPage = Math.min(Math.max(0, book.currentPage), book.totalPages);
  } else {
    book.currentPage = Math.max(0, book.currentPage);
  }

  // 手动标为已读完：页数补满、记完成日期
  if (book.status === 'finished') {
    if (book.totalPages > 0) book.currentPage = book.totalPages;
    if (!book.finishedAt) book.finishedAt = date.todayStr();
    return book;
  }

  // 读到最后一页 → 自动已读完
  if (book.totalPages > 0 && book.currentPage >= book.totalPages) {
    book.status = 'finished';
    if (!book.finishedAt) book.finishedAt = date.todayStr();
    return book;
  }

  // 有进度但还没读完 → 自动从"想读"转为"在读"，并记下开始日期
  if (book.status === 'want' && book.currentPage > 0) {
    book.status = 'reading';
  }
  if (book.status === 'reading' && !book.startedAt) {
    book.startedAt = date.todayStr();
  }
  return book;
}

/** 新增一本书。标题必填，其余可省。 */
export function addBook(state, input) {
  const src = typeof input === 'string' ? { title: input } : (input || {});
  const title = String(src.title == null ? '' : src.title).trim();
  if (!title) return null;

  const book = {
    id: src.id || newId('b'),
    title,
    author: src.author == null ? '' : String(src.author).trim(),
    kind: BOOK_KIND_ORDER.includes(src.kind) ? src.kind : 'book',
    status: BOOK_STATUS_ORDER.includes(src.status) ? src.status : 'want',
    totalPages: Math.max(0, Math.round(Number(src.totalPages) || 0)),
    currentPage: Math.max(0, Math.round(Number(src.currentPage) || 0)),
    rating: Math.min(5, Math.max(0, Math.round(Number(src.rating) || 0))),
    startedAt: date.isValidDateStr(src.startedAt) ? src.startedAt : '',
    finishedAt: date.isValidDateStr(src.finishedAt) ? src.finishedAt : '',
    note: src.note == null ? '' : String(src.note),
    createdAt: src.createdAt || date.nowIso(),
    updatedAt: date.nowIso(),
  };
  // 新建时可能已经填了"已读到第几页"，同样要按规则推导状态
  applyBookProgressRules(book);
  state.books.push(book);
  return book;
}

export function findBook(state, id) {
  return state.books.find((b) => b.id === id) || null;
}

export function updateBook(state, id, patch) {
  const book = findBook(state, id);
  if (!book) return null;
  const p = patch || {};

  if (p.title != null) {
    const title = String(p.title).trim();
    if (title) book.title = title;
  }
  if (p.author != null) book.author = String(p.author).trim();
  if (p.kind != null && BOOK_KIND_ORDER.includes(p.kind)) book.kind = p.kind;
  if (p.status != null && BOOK_STATUS_ORDER.includes(p.status)) book.status = p.status;
  if (p.note != null) book.note = String(p.note);
  if (p.startedAt != null) book.startedAt = date.isValidDateStr(p.startedAt) ? p.startedAt : '';
  if (p.finishedAt != null) book.finishedAt = date.isValidDateStr(p.finishedAt) ? p.finishedAt : '';
  if (p.rating != null) book.rating = Math.min(5, Math.max(0, Math.round(Number(p.rating) || 0)));

  if (p.totalPages != null) {
    book.totalPages = Math.max(0, Math.round(Number(p.totalPages) || 0));
  }
  if (p.currentPage != null) {
    book.currentPage = Math.max(0, Math.round(Number(p.currentPage) || 0));
  }

  // 状态与日期的推导统一走共用规则（与"加书"保持同一套行为）
  applyBookProgressRules(book);

  book.updatedAt = date.nowIso();
  return book;
}

export function removeBook(state, id) {
  const i = state.books.findIndex((b) => b.id === id);
  if (i === -1) return null;
  const [removed] = state.books.splice(i, 1);
  // 这本书的笔记一并清掉，避免留下找不到主人的孤儿笔记
  state.bookNotes = state.bookNotes.filter((n) => n.bookId !== id);
  return removed;
}

/** 读完比例（0–100）。没填总页数时按 0 处理。 */
export function bookProgress(book) {
  if (!book || !book.totalPages) return 0;
  const p = Math.round((book.currentPage / book.totalPages) * 100);
  return Math.min(100, Math.max(0, p));
}

/** 还剩多少页 */
export function bookPagesLeft(book) {
  if (!book || !book.totalPages) return 0;
  return Math.max(0, book.totalPages - book.currentPage);
}

/** 按状态分组 */
export function booksByStatus(state) {
  const groups = {};
  for (const s of BOOK_STATUS_ORDER) groups[s] = [];
  for (const b of state.books) {
    if (!groups[b.status]) groups[b.status] = [];
    groups[b.status].push(b);
  }
  return groups;
}

/** 推进阅读进度：按页前进（可为负），到顶自动标为已读完 */
export function advanceBookPage(state, id, pages) {
  const book = findBook(state, id);
  if (!book) return null;
  const step = Math.round(Number(pages) || 0);
  if (!step) return book;
  const from = book.currentPage;
  const to = Math.max(0, from + step);
  return updateBook(state, id, { currentPage: to });
}

/** 记录一次阅读：写进 readLog（同一天可累加），并可同时推进页码 */
export function logReading(state, input) {
  const src = input || {};
  const day = date.isValidDateStr(src.date) ? src.date : date.todayStr();
  const minutes = Math.round(Number(src.minutes) || 0);
  if (minutes <= 0) return null;

  let entry = state.readLog.find((r) => r.date === day);
  if (!entry) {
    entry = { id: newId('r'), date: day, minutes: 0 };
    state.readLog.push(entry);
  }
  entry.minutes += minutes;
  if (src.bookId) entry.bookId = src.bookId;

  if (src.bookId && src.pages) advanceBookPage(state, src.bookId, src.pages);
  return entry;
}

export function removeReadLog(state, id) {
  const i = state.readLog.findIndex((r) => r.id === id);
  if (i === -1) return null;
  const [removed] = state.readLog.splice(i, 1);
  return removed;
}

/** 某天的阅读分钟数 */
export function readingMinutesOn(state, day) {
  const d = day || date.todayStr();
  return state.readLog
    .filter((r) => r.date === d)
    .reduce((n, r) => n + (Number(r.minutes) || 0), 0);
}

/** 累计阅读分钟 */
export function readingMinutesTotal(state) {
  return state.readLog.reduce((n, r) => n + (Number(r.minutes) || 0), 0);
}

/** 本周每天的阅读分钟（周一起 7 天），用于本周概览 */
export function readingWeekOverview(state, today) {
  const t = today || date.todayStr();
  return date.weekDates(t).map((day) => ({
    date: day,
    minutes: readingMinutesOn(state, day),
    isToday: day === t,
  }));
}

/** 本周达标天数（达到每日目标算一天） */
export function readingWeekGoalDays(state, today) {
  const goal = Number(state.settings.readingDailyGoal) || 30;
  return readingWeekOverview(state, today).filter((d) => d.minutes >= goal).length;
}

/** 每日阅读目标（分钟），非法值回落 30 */
export function getReadingDailyGoal(state) {
  const v = Number(state.settings && state.settings.readingDailyGoal);
  return Number.isFinite(v) && v >= 1 && v <= 480 ? Math.round(v) : 30;
}

/** 设置每日阅读目标，返回实际生效的值 */
export function setReadingDailyGoal(state, n) {
  const v = Math.round(Number(n) || 0);
  const applied = v >= 1 && v <= 480 ? v : 30;
  state.settings.readingDailyGoal = applied;
  return applied;
}

/* ---- 书摘与笔记 ---- */

/** 笔记类型 */
export const NOTE_KINDS = {
  quote: '摘抄',
  note: '想法',
  question: '疑问',
  action: '待办',
};
export const NOTE_KIND_ORDER = ['quote', 'note', 'question', 'action'];

/** 常见位置的类型（给人用的说法，不是书本结构） */
export const NOTE_SPOTS = ['开头', '中间', '结尾', '附录', '注释'];

export function addBookNote(state, input) {
  const src = input || {};
  const text = String(src.text == null ? '' : src.text).trim();
  if (!text) return null;
  const num = (v) => {
    const n = Math.round(Number(v) || 0);
    return n > 0 ? n : 0;
  };
  const note = {
    id: src.id || newId('bn'),
    bookId: src.bookId || '',
    kind: NOTE_KIND_ORDER.includes(src.kind) ? src.kind : 'note',
    text,
    // 位置：页码区间、行号区间、章节/位置名，都允许留空
    page: num(src.page),
    pageTo: num(src.pageTo),
    line: num(src.line),
    lineTo: num(src.lineTo),
    chapter: src.chapter == null ? '' : String(src.chapter).trim(),
    pinned: !!src.pinned,
    createdAt: src.createdAt || date.nowIso(),
    updatedAt: date.nowIso(),
  };
  // 只填了"到第几页"时，把起始页补成同一个，避免出现空区间
  if (note.pageTo && !note.page) note.page = note.pageTo;
  if (note.lineTo && !note.line) note.line = note.lineTo;
  state.bookNotes.push(note);
  return note;
}

export function findBookNote(state, id) {
  return state.bookNotes.find((n) => n.id === id) || null;
}

export function updateBookNote(state, id, patch) {
  const note = findBookNote(state, id);
  if (!note) return null;
  const p = patch || {};
  const num = (v) => {
    const n = Math.round(Number(v) || 0);
    return n > 0 ? n : 0;
  };

  if (p.text != null) {
    const text = String(p.text).trim();
    if (text) note.text = text;
  }
  if (p.kind != null && NOTE_KIND_ORDER.includes(p.kind)) note.kind = p.kind;
  if (p.bookId != null) note.bookId = String(p.bookId);
  if (p.page != null) note.page = num(p.page);
  if (p.pageTo != null) note.pageTo = num(p.pageTo);
  if (p.line != null) note.line = num(p.line);
  if (p.lineTo != null) note.lineTo = num(p.lineTo);
  if (p.chapter != null) note.chapter = String(p.chapter).trim();
  if (p.pinned != null) note.pinned = !!p.pinned;
  if (note.pageTo && !note.page) note.page = note.pageTo;
  if (note.lineTo && !note.line) note.line = note.lineTo;
  note.updatedAt = date.nowIso();
  return note;
}

export function removeBookNote(state, id) {
  const i = state.bookNotes.findIndex((n) => n.id === id);
  if (i === -1) return null;
  const [removed] = state.bookNotes.splice(i, 1);
  return removed;
}

export function toggleNotePinned(state, id) {
  const note = findBookNote(state, id);
  if (!note) return null;
  note.pinned = !note.pinned;
  return note;
}

/**
 * 笔记的位置描述成一句人话。
 * 优先用"章节/位置"，其次页码区间，再其次行号区间，最后返回空串。
 */
export function noteLocation(note) {
  if (!note) return '';
  const parts = [];
  if (note.chapter) parts.push(note.chapter);
  if (note.page) {
    parts.push(note.pageTo && note.pageTo !== note.page
      ? '第 ' + note.page + '–' + note.pageTo + ' 页'
      : '第 ' + note.page + ' 页');
  }
  if (note.line) {
    parts.push(note.lineTo && note.lineTo !== note.line
      ? '第 ' + note.line + '–' + note.lineTo + ' 行'
      : '第 ' + note.line + ' 行');
  }
  return parts.join(' · ');
}

/** 某本书的笔记（收藏在前，然后按位置排，没位置的排后面） */
export function notesOfBook(state, bookId) {
  return state.bookNotes
    .filter((n) => n.bookId === bookId)
    .sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      const pa = a.page || 99999;
      const pb = b.page || 99999;
      if (pa !== pb) return pa - pb;
      return (a.line || 99999) - (b.line || 99999);
    });
}

/**
 * 搜索与筛选笔记。
 * @param {object} filter {q, bookId, kind, pinnedOnly}
 */
export function filterBookNotes(state, filter) {
  const f = filter || {};
  const q = String(f.q == null ? '' : f.q).trim().toLowerCase();
  let list = state.bookNotes.slice();

  if (f.bookId) list = list.filter((n) => n.bookId === f.bookId);
  if (f.kind) list = list.filter((n) => n.kind === f.kind);
  if (f.pinnedOnly) list = list.filter((n) => n.pinned);
  if (q) {
    list = list.filter((n) => {
      const book = n.bookId ? findBook(state, n.bookId) : null;
      const hay = [
        n.text, n.chapter, book ? book.title : '', book ? book.author : '',
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  // 收藏在前，再按创建时间倒序（最近记的排前面）
  // 同一毫秒创建的按创建序号兜底，避免顺序随机（曾出现"列表顺序不可预测"）
  return list.sort((a, b) => {
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    return byNewestFirst(a, b);
  });
}

/** 笔记概况：总数、按类型计数、收藏数、关联了几本书 */
export function bookNotesSummary(state) {
  const notes = state.bookNotes;
  const byKind = {};
  for (const k of NOTE_KIND_ORDER) byKind[k] = 0;
  for (const n of notes) byKind[n.kind] = (byKind[n.kind] || 0) + 1;
  const books = new Set(notes.filter((n) => n.bookId).map((n) => n.bookId));
  return {
    total: notes.length,
    byKind,
    pinned: notes.filter((n) => n.pinned).length,
    booksTouched: books.size,
    withLocation: notes.filter((n) => noteLocation(n)).length,
  };
}

/** 阅读概况统计 */
export function readingStats(state, today) {
  const t = today || date.todayStr();
  const finished = state.books.filter((b) => b.status === 'finished');
  const pagesRead = state.books.reduce((n, b) => n + (Number(b.currentPage) || 0), 0);
  return {
    total: state.books.length,
    reading: state.books.filter((b) => b.status === 'reading').length,
    want: state.books.filter((b) => b.status === 'want').length,
    finished: finished.length,
    paused: state.books.filter((b) => b.status === 'paused').length,
    pagesRead,
    notes: state.bookNotes.length,
    quotes: state.bookNotes.filter((n) => n.kind === 'quote').length,
    minutesTotal: readingMinutesTotal(state),
    minutesToday: readingMinutesOn(state, t),
    dailyGoal: Number(state.settings.readingDailyGoal) || 30,
    weekGoalDays: readingWeekGoalDays(state, t),
  };
}

/** 今日阅读目标完成度（0–100） */
export function readingTodayPercent(state, today) {
  const goal = Number(state.settings.readingDailyGoal) || 30;
  const done = readingMinutesOn(state, today);
  return Math.min(100, Math.round((done / goal) * 100));
}

/** 把一本在读的书推到今天的任务清单 */
export function pushBookToToday(state, id, day) {
  const book = findBook(state, id);
  if (!book) return null;
  const left = bookPagesLeft(book);
  const title = left > 0 ? '读《' + book.title + '》' + left + ' 页' : '读《' + book.title + '》';
  return addTask(state, { title, module: 'reading', date: day || date.todayStr() });
}


/* ============================================================
   饮食
   ============================================================ */

export function ensureMeals(state, day) {
  const d = day || date.todayStr();
  if (!state.diet.meals[d]) {
    state.diet.meals[d] = {
      breakfast: { text: '', eaten: false },
      lunch: { text: '', eaten: false },
      dinner: { text: '', eaten: false },
    };
  }
  const m = state.diet.meals[d];
  for (const k of MEAL_KEYS) {
    if (!m[k] || typeof m[k] !== 'object') m[k] = { text: '', eaten: false };
  }
  return m;
}

export function mealsOf(state, day) {
  const d = day || date.todayStr();
  return state.diet.meals[d] || null;
}

export function setMeal(state, day, mealKey, patch) {
  if (!MEAL_KEYS.includes(mealKey)) return null;
  const m = ensureMeals(state, day);
  const p = patch || {};
  if (p.text != null) m[mealKey].text = String(p.text);
  if (p.eaten != null) m[mealKey].eaten = !!p.eaten;
  return m[mealKey];
}

export function toggleMealEaten(state, day, mealKey) {
  if (!MEAL_KEYS.includes(mealKey)) return null;
  const m = ensureMeals(state, day);
  m[mealKey].eaten = !m[mealKey].eaten;
  return m[mealKey];
}

/** 三餐已定几顿 */
export function mealsPlannedCount(state, day) {
  const m = mealsOf(state, day);
  if (!m) return 0;
  return MEAL_KEYS.filter((k) => m[k] && String(m[k].text).trim()).length;
}

export function dinnerUndecided(state, day) {
  const m = mealsOf(state, day);
  return !m || !String(m.dinner.text).trim();
}

/** 菜谱 */
export function addRecipe(state, input) {
  const src = typeof input === 'string' ? { name: input } : (input || {});
  const name = String(src.name == null ? '' : src.name).trim();
  if (!name) return null;
  const r = { id: newId('rc'), name, note: src.note == null ? '' : String(src.note) };
  state.diet.recipes.push(r);
  return r;
}

export function findRecipe(state, id) {
  return state.diet.recipes.find((r) => r.id === id) || null;
}

export function removeRecipe(state, id) {
  const i = state.diet.recipes.findIndex((r) => r.id === id);
  if (i === -1) return null;
  const [removed] = state.diet.recipes.splice(i, 1);
  return removed;
}

/** 把菜谱安排到某天的某一餐 */
export function planRecipe(state, id, mealKey, day) {
  const r = findRecipe(state, id);
  if (!r) return null;
  const key = MEAL_KEYS.includes(mealKey) ? mealKey : 'dinner';
  return setMeal(state, day || date.todayStr(), key, { text: r.name });
}

/** 采买清单 */
export function addShoppingItem(state, name) {
  const t = String(name == null ? '' : name).trim();
  if (!t) return null;
  const item = { id: newId('s'), name: t, bought: false };
  state.diet.shopping.push(item);
  return item;
}

export function toggleShoppingItem(state, id) {
  const item = state.diet.shopping.find((s) => s.id === id);
  if (!item) return null;
  item.bought = !item.bought;
  return item;
}

export function removeShoppingItem(state, id) {
  const i = state.diet.shopping.findIndex((s) => s.id === id);
  if (i === -1) return null;
  const [removed] = state.diet.shopping.splice(i, 1);
  return removed;
}

/** 清空已买：只删勾选过的 */
export function clearBoughtItems(state) {
  const before = state.diet.shopping.length;
  state.diet.shopping = state.diet.shopping.filter((s) => !s.bought);
  return before - state.diet.shopping.length;
}

/** 把某道菜安排为今天的一餐，并顺带生成一条今日任务 */
export function pushMealToToday(state, mealKey, day) {
  const d = day || date.todayStr();
  const m = mealsOf(state, d);
  const text = m && m[mealKey] ? String(m[mealKey].text).trim() : '';
  if (!text) return null;
  return addTask(state, { title: '做' + text, module: 'diet', date: d });
}

/* ============================================================
   设置
   ============================================================ */

export function setDensity(state, value) {
  state.settings.density = value === 'compact' ? 'compact' : 'comfortable';
  return state.settings.density;
}

/* ============================================================
   日历聚合（各模块共用）
   ============================================================ */

const MODULE_LABELS = {
  dev: '开发',
  study: '学习',
  reading: '阅读',
  diet: '饮食',
  general: '通用',
};

export function moduleLabel(id) {
  return MODULE_LABELS[id] || '通用';
}

/** 日期 → 该月所有日期（用于快速判断"这个月有没有内容"） */
function monthPrefix(year, month) {
  return year + '-' + String(month).padStart(2, '0') + '-';
}

/** 取某条数据所在日期（字段名不同，统一成 date） */
function dateOf(item) {
  return item && item.date;
}

/** 该月里某模块的任务，按日期分组 */
export function tasksByDayInMonth(state, moduleId, year, month) {
  const prefix = monthPrefix(year, month);
  const map = {};
  for (const t of state.tasks) {
    const d = dateOf(t);
    if (!d || !d.startsWith(prefix)) continue;
    if (moduleId && moduleId !== 'all' && t.module !== moduleId) continue;
    (map[d] = map[d] || []).push(t);
  }
  return map;
}

/**
 * 某模块的"日历当日标记"。
 * 返回 { 'YYYY-MM-DD': { total, done, extra } }：
 *   total / done —— 当天任务总数与完成数
 *   extra        —— 该模块特有的标记文案（如饮食"三餐已定 2/3"）
 */
export function calendarMarks(state, moduleId, year, month) {
  const map = tasksByDayInMonth(state, moduleId, year, month);

  // 把该模块特有的记录并进来
  const marks = {};
  const ensure = (day) => {
    marks[day] = marks[day] || { total: 0, done: 0, extra: '' };
    return marks[day];
  };

  for (const [day, list] of Object.entries(map)) {
    const m = ensure(day);
    m.total = list.length;
    m.done = list.filter((t) => t.done).length;
  }

  const prefix = monthPrefix(year, month);

  if (moduleId === 'diet') {
    for (const [day, meals] of Object.entries(state.diet.meals || {})) {
      if (!day.startsWith(prefix) || !meals) continue;
      const planned = MEAL_KEYS.filter((k) => meals[k] && String(meals[k].text).trim()).length;
      if (planned === 0) continue;
      const m = ensure(day);
      m.extra = '三餐已定 ' + planned + '/3';
    }
  }

  // 阅读：该月每天的阅读分钟数
  if (moduleId === 'reading') {
    for (const entry of state.readLog || []) {
      if (!entry || !entry.date || !entry.date.startsWith(prefix)) continue;
      const mins = Number(entry.minutes) || 0;
      if (mins <= 0) continue;
      const m = ensure(entry.date);
      m.extra = mins + ' 分钟';
    }
  }

  // 学习：该月每天的已学时长
  if (moduleId === 'study') {
    for (const item of state.studyItems || []) {
      const d = item.createdAt ? date.toDateStr(new Date(item.createdAt)) : '';
      if (!d || !d.startsWith(prefix)) continue;
      if (!item.minutes) continue;
      const m = ensure(d);
      m.extra = m.extra ? m.extra : (item.minutes + ' 分钟');
    }
  }

  // 首页：所有模块汇总，附带模块种类数
  if (moduleId === 'all') {
    for (const [day, list] of Object.entries(map)) {
      const kinds = new Set(list.map((t) => t.module));
      const m = ensure(day);
      m.extra = kinds.size + ' 个模块';
    }
  }

  return marks;
}

/** 某个模块在该月里有内容的天数（用于日历概览） */
export function calendarDayCount(state, moduleId, year, month) {
  return Object.keys(calendarMarks(state, moduleId, year, month)).length;
}

/* ============================================================
   统计聚合（图表用）
   ============================================================ */

/** 图表可选的时间范围 */
export const RANGE_OPTIONS = [
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'year', label: '今年' },
  { key: 'all', label: '全部' },
];
export const RANGE_KEYS = RANGE_OPTIONS.map((r) => r.key);

/**
 * 把时间范围换算成起止日期（含端点）。
 * @returns {{from:string, to:string|null, label:string}} to 为 null 表示不限
 */
export function rangeBounds(rangeKey, today) {
  const t = today || date.todayStr();
  switch (rangeKey) {
    case 'week':
      return { from: date.startOfWeek(t), to: date.addDays(date.startOfWeek(t), 6), label: '本周' };
    case 'month': {
      const d = date.parseDateStr(t);
      const first = date.toDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
      const last = date.toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      return { from: first, to: last, label: '本月' };
    }
    case 'year': {
      const d = date.parseDateStr(t);
      return {
        from: date.toDateStr(new Date(d.getFullYear(), 0, 1)),
        to: date.toDateStr(new Date(d.getFullYear(), 11, 31)),
        label: '今年',
      };
    }
    default:
      return { from: '', to: null, label: '全部' };
  }
}

/** 某条任务是否落在范围内 */
function inRange(day, bounds) {
  if (!date.isValidDateStr(day)) return false;
  if (bounds.from && day < bounds.from) return false;
  if (bounds.to && day > bounds.to) return false;
  return true;
}

/**
 * 取某个模块在时间范围内的任务。
 * @param {string} moduleId 'all' 表示所有模块
 */
export function tasksInRange(state, moduleId, rangeKey, today) {
  const bounds = rangeBounds(rangeKey, today);
  return state.tasks.filter((t) => {
    if (moduleId && moduleId !== 'all' && t.module !== moduleId) return false;
    return inRange(t.date, bounds);
  });
}

/**
 * 柱形图数据：按天（本周/本月）或按月（今年/全部）分桶。
 * 每个桶给出总数与完成数。
 */
export function chartBuckets(state, moduleId, rangeKey, today) {
  const t = today || date.todayStr();
  const list = tasksInRange(state, moduleId, rangeKey, t);
  const byDay = rangeKey === 'week' || rangeKey === 'month';

  const buckets = [];
  if (rangeKey === 'week') {
    // 本周：固定 7 天，即使某天没有任务也要显示
    const week = date.weekDates(t);
    for (const day of week) {
      const items = list.filter((x) => x.date === day);
      buckets.push({
        key: day,
        label: date.WEEK_CN[date.weekdayNum(day) - 1],
        sub: date.fmtShort(day),
        total: items.length,
        done: items.filter((x) => x.done).length,
      });
    }
    return buckets;
  }

  if (rangeKey === 'month') {
    const d = date.parseDateStr(t);
    const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    for (let i = 1; i <= days; i++) {
      const day = date.monthDay(d.getFullYear(), d.getMonth() + 1, i);
      const items = list.filter((x) => x.date === day);
      buckets.push({
        key: day,
        label: String(i),
        sub: date.fmtShort(day),
        total: items.length,
        done: items.filter((x) => x.done).length,
      });
    }
    return buckets;
  }

  // 今年 / 全部：按月分桶。
  // 刻意只列出"有数据的月份"：一整年十二个空柱子比空白还难看，
  // 而且年度视角关心的是"哪几个月在干活"，不是逐月打卡。
  const map = {};
  for (const item of list) {
    const m = String(item.date).slice(0, 7); // YYYY-MM
    if (!map[m]) map[m] = { total: 0, done: 0 };
    map[m].total += 1;
    if (item.done) map[m].done += 1;
  }
  const keys = Object.keys(map).sort();
  return keys.map((m) => ({
    key: m,
    label: Number(m.slice(5, 7)) + '月',
    sub: m,
    total: map[m].total,
    done: map[m].done,
  }));
}

/**
 * 扇形图数据。
 * - 模块页（moduleId 不是 all）：按"完成 / 未完成"分两块
 * - 首页（all）：按模块分布
 */
export function chartSlices(state, moduleId, rangeKey, today) {
  const list = tasksInRange(state, moduleId, rangeKey, today);

  if (moduleId && moduleId !== 'all') {
    const done = list.filter((t) => t.done).length;
    const pending = list.length - done;
    const slices = [];
    if (done) slices.push({ key: 'done', label: '已完成', value: done, color: 'var(--ok)' });
    if (pending) slices.push({ key: 'pending', label: '未完成', value: pending, color: 'var(--primary)' });
    return slices;
  }

  // 按模块分布
  const colors = {
    dev: 'var(--m-dev)',
    study: 'var(--m-study)',
    reading: 'var(--m-reading)',
    diet: 'var(--m-diet)',
    general: 'var(--m-general)',
  };
  const counts = {};
  for (const t of list) counts[t.module] = (counts[t.module] || 0) + 1;
  return Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a])
    .map((id) => ({
      key: id,
      label: moduleLabel(id),
      value: counts[id],
      color: colors[id] || 'var(--m-general)',
      done: list.filter((t) => t.module === id && t.done).length,
    }));
}

/** 图表上方的一句话统计 */
export function chartSummary(state, moduleId, rangeKey, today) {
  const bounds = rangeBounds(rangeKey, today);
  const list = tasksInRange(state, moduleId, rangeKey, today);
  const done = list.filter((t) => t.done).length;
  return {
    label: bounds.label + (moduleId === 'all' ? '（全部模块）' : '（' + moduleLabel(moduleId) + '）'),
    total: list.length,
    done,
    pending: list.length - done,
    percent: list.length ? Math.round((done / list.length) * 100) : 0,
  };
}

/** 点某个桶/扇区后，列出具体内容 */
export function chartDetailTasks(state, moduleId, rangeKey, today, bucketKey) {
  const list = tasksInRange(state, moduleId, rangeKey, today);
  const key = bucketKey == null ? '' : String(bucketKey);

  // 日期范围图（柱形图）的桶 key 是"天"（YYYY-MM-DD）或"月"（YYYY-MM）
  if (/^\d{4}-\d{2}/.test(key)) {
    return list.filter((t) => String(t.date).startsWith(key));
  }

  // 其余情况按"扇形图扇区"理解：
  //   key='done'  只留已完成；key='pending' 只留未完成；key=模块 id 只留该模块
  if (key === 'done') return list.filter((t) => t.done);
  if (key === 'pending') return list.filter((t) => !t.done);
  if (MODULE_IDS.includes(key)) return list.filter((t) => t.module === key);

  return list;
}

/* ============================================================
   首页摘要（"待你处理"）
   ============================================================ */

/**
 * 只列"需要你现在做决定"的事。没有可摘要项时返回空数组（整个区块隐藏）。
 */
export function homeSummary(state, today) {
  const d = today || date.todayStr();
  const out = [];

  const overdue = overdueTasks(state, d);
  if (overdue.length) {
    out.push({
      key: 'overdue',
      text: '逾期任务 ' + overdue.length + ' 条',
      detail: '超过日期还没完成，需要决定挪不挪',
      route: 'today',
      anchor: 'overdue',
      level: 'danger',
    });
  }

  const ideas = unhandledIdeas(state);
  if (ideas.length >= 3) {
    out.push({
      key: 'dev-ideas',
      text: '灵感箱堆积 ' + ideas.length + ' 条未整理',
      detail: '可以转成待办，或标记已处理',
      route: 'dev',
      anchor: 'ideas',
      level: 'warn',
    });
  }

  if (dinnerUndecided(state, d)) {
    out.push({
      key: 'dinner',
      text: '今天晚饭还没定',
      detail: '去菜谱里挑一道',
      route: 'diet',
      anchor: 'meals',
      level: 'normal',
    });
  }

  return out.slice(0, 5);
}

/* ============================================================
   撤销：有上限的历史快照
   ============================================================ */

export function createUndoStack(limit) {
  const max = limit || 50;
  const stack = [];
  return {
    /** 在改动之前调用，记下改动前的整份数据 */
    remember(state) {
      stack.push(clone(state));
      if (stack.length > max) stack.shift();
      return stack.length;
    },
    /** 取回最近一次快照并出栈 */
    undo() {
      if (!stack.length) return null;
      return stack.pop();
    },
    canUndo() {
      return stack.length > 0;
    },
    size() {
      return stack.length;
    },
    clear() {
      stack.length = 0;
    },
  };
}
