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

/** 任务可归属的模块 */
export const MODULES = [
  { id: 'media', name: '自媒体', short: '自媒体' },
  { id: 'dev', name: '开发工作', short: '开发' },
  { id: 'consult', name: '咨询工作', short: '咨询' },
  { id: 'fitness', name: '健身计划', short: '健身' },
  { id: 'diet', name: '饮食计划', short: '饮食' },
  { id: 'game', name: '游戏娱乐', short: '游戏' },
  { id: 'general', name: '通用', short: '通用' },
];

export const MODULE_IDS = MODULES.map((m) => m.id);

export function moduleName(id) {
  const m = MODULES.find((x) => x.id === id);
  return m ? m.short : '通用';
}

/** 侧栏导航顺序（首页与今日计划不是任务归属模块） */
export const NAV_ITEMS = [
  { id: 'home', name: '首页总览', icon: '▦' },
  { id: 'today', name: '今日计划', icon: '☑' },
  { id: 'media', name: '自媒体', icon: '✎' },
  { id: 'dev', name: '开发工作', icon: '⌘' },
  { id: 'consult', name: '咨询工作', icon: '☎' },
  { id: 'fitness', name: '健身计划', icon: '⚡' },
  { id: 'diet', name: '饮食计划', icon: '◍' },
  { id: 'games', name: '游戏娱乐', icon: '◈' },
  { id: 'settings', name: '数据与设置', icon: '⚙' },
];

/** 状态枚举与中文标签 */
export const MEDIA_STATUS = {
  idea: '选题池',
  writing: '写作中',
  ready: '待发布',
  published: '已发布',
};
export const MEDIA_ORDER = ['idea', 'writing', 'ready', 'published'];

export const DEV_STATUS = {
  todo: '未开始',
  doing: '开发中',
  testing: '联调测试',
  online: '已上线',
};
export const DEV_ORDER = ['todo', 'doing', 'testing', 'online'];

export const GAME_STATUS = {
  wish: '想玩',
  playing: '在玩',
  cleared: '已通关',
};
export const GAME_ORDER = ['wish', 'playing', 'cleared'];

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

export function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

/** 默认的健身周安排：推 / 拉 / 腿 / 休 循环 */
export function defaultFitnessRoutine() {
  const ex = (name, sets, reps) => ({ id: newId('e'), name, sets, reps });
  const day = (label, rest, exercises) => ({ label, rest: !!rest, exercises: exercises || [] });
  return [
    day('胸 + 三头', false, [ex('卧推', 4, 12), ex('上斜哑铃卧推', 3, 10), ex('绳索下压', 3, 15)]),
    day('背 + 二头', false, [ex('引体向上', 4, 8), ex('坐姿划船', 3, 12), ex('哑铃弯举', 3, 12)]),
    day('腿 + 肩', false, [ex('深蹲', 4, 10), ex('腿举', 3, 12), ex('哑铃推举', 3, 12)]),
    day('休息', true, []),
    day('胸 + 三头', false, [ex('卧推', 4, 12), ex('上斜哑铃卧推', 3, 10), ex('绳索下压', 3, 15)]),
    day('背 + 二头', false, [ex('引体向上', 4, 8), ex('坐姿划船', 3, 12), ex('哑铃弯举', 3, 12)]),
    day('休息', true, []),
  ];
}

/** 全新的空数据 */
export function createInitialState() {
  return {
    schemaVersion: 1,
    revision: 0,
    updatedAt: null,
    tasks: [],
    notes: [],
    media: [],
    devTasks: [],
    devIdeas: [],
    consultTasks: [],
    consultRecords: [],
    fitness: { routine: defaultFitnessRoutine(), records: {} },
    diet: { meals: {}, recipes: [], shopping: [] },
    games: [],
    playPlan: [],
    settings: { fitnessWeeklyGoal: 5, density: 'comfortable' },
  };
}

/** 补齐缺失字段，兼容旧数据与手改数据 */
export function normalizeState(input) {
  const base = createInitialState();
  if (!input || typeof input !== 'object') return base;
  const out = Object.assign(base, input);

  for (const f of ['tasks', 'notes', 'media', 'devTasks', 'devIdeas', 'consultTasks', 'consultRecords', 'games', 'playPlan']) {
    if (!Array.isArray(out[f])) out[f] = [];
  }
  // 旧数据里游戏模块的 id 可能是 games，这里统一
  if (!out.fitness || typeof out.fitness !== 'object') out.fitness = { routine: defaultFitnessRoutine(), records: {} };
  if (!Array.isArray(out.fitness.routine) || out.fitness.routine.length === 0) {
    out.fitness.routine = defaultFitnessRoutine();
  }
  if (!out.fitness.records || typeof out.fitness.records !== 'object' || Array.isArray(out.fitness.records)) {
    out.fitness.records = {};
  }

  if (!out.diet || typeof out.diet !== 'object') out.diet = { meals: {}, recipes: [], shopping: [] };
  if (!out.diet.meals || typeof out.diet.meals !== 'object' || Array.isArray(out.diet.meals)) out.diet.meals = {};
  if (!Array.isArray(out.diet.recipes)) out.diet.recipes = [];
  if (!Array.isArray(out.diet.shopping)) out.diet.shopping = [];

  if (!out.settings || typeof out.settings !== 'object') out.settings = {};
  if (!Number.isFinite(out.settings.fitnessWeeklyGoal)) out.settings.fitnessWeeklyGoal = 5;
  if (out.settings.density !== 'compact' && out.settings.density !== 'comfortable') out.settings.density = 'comfortable';

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
   自媒体
   ============================================================ */

export function addMedia(state, input) {
  const src = input || {};
  const title = String(src.title == null ? '' : src.title).trim();
  if (!title) return null;
  const item = {
    id: src.id || newId('m'),
    title,
    platform: src.platform == null ? '' : String(src.platform),
    status: MEDIA_ORDER.includes(src.status) ? src.status : 'idea',
    plannedDate: date.isValidDateStr(src.plannedDate) ? src.plannedDate : '',
    note: src.note == null ? '' : String(src.note),
    createdAt: src.createdAt || date.nowIso(),
    updatedAt: date.nowIso(),
  };
  state.media.push(item);
  return item;
}

export function findMedia(state, id) {
  return state.media.find((m) => m.id === id) || null;
}

export function updateMedia(state, id, patch) {
  const item = findMedia(state, id);
  if (!item) return null;
  const p = patch || {};
  if (p.title != null) {
    const t = String(p.title).trim();
    if (t) item.title = t;
  }
  if (p.platform != null) item.platform = String(p.platform);
  if (p.status != null && MEDIA_ORDER.includes(p.status)) item.status = p.status;
  if (p.plannedDate != null) item.plannedDate = date.isValidDateStr(p.plannedDate) ? p.plannedDate : '';
  if (p.note != null) item.note = String(p.note);
  item.updatedAt = date.nowIso();
  return item;
}

export function removeMedia(state, id) {
  const i = state.media.findIndex((m) => m.id === id);
  if (i === -1) return null;
  const [removed] = state.media.splice(i, 1);
  return removed;
}

/** 各关键动作的累计调用次数（只用于排查"一次操作执行了两次"这类问题，不参与业务） */
export const callStats = {
  moveMedia: 0,
  toggleFitnessSet: 0,
};

/**
 * 换列：dir 为 1 向后、-1 向前。
 * 越界时返回 null（按钮应处于禁用态），不做环绕。
 */
export function moveMedia(state, id, dir) {
  callStats.moveMedia += 1;
  const item = findMedia(state, id);
  if (!item) return null;
  const i = MEDIA_ORDER.indexOf(item.status);
  const next = i + (dir > 0 ? 1 : -1);
  if (next < 0 || next >= MEDIA_ORDER.length) return null;
  item.status = MEDIA_ORDER[next];
  item.updatedAt = date.nowIso();
  return item;
}

export function mediaByStatus(state) {
  const out = {};
  for (const s of MEDIA_ORDER) out[s] = [];
  for (const m of state.media) {
    if (!out[m.status]) out[m.status] = [];
    out[m.status].push(m);
  }
  return out;
}

/** 自媒体：待发布（首页摘要用） */
export function mediaReady(state) {
  return state.media.filter((m) => m.status === 'ready');
}

/** 把一条自媒体内容推到今天做 */
export function pushMediaToToday(state, id, day) {
  const item = findMedia(state, id);
  if (!item) return null;
  return addTask(state, {
    title: '「' + item.title + '」' + (item.status === 'ready' ? '发布' : '推进'),
    module: 'media',
    date: day || date.todayStr(),
  });
}

/* ============================================================
   开发工作
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

export function unhandledIdeas(state) {
  return state.devIdeas.filter((i) => !i.handled);
}

/* ============================================================
   咨询工作
   ============================================================ */

export function addConsultTask(state, input) {
  const src = typeof input === 'string' ? { title: input } : (input || {});
  const title = String(src.title == null ? '' : src.title).trim();
  if (!title) return null;
  const item = {
    id: src.id || newId('c'),
    title,
    note: src.note == null ? '' : String(src.note),
    done: !!src.done,
    createdAt: src.createdAt || date.nowIso(),
    updatedAt: date.nowIso(),
  };
  state.consultTasks.push(item);
  return item;
}

export function findConsultTask(state, id) {
  return state.consultTasks.find((c) => c.id === id) || null;
}

export function updateConsultTask(state, id, patch) {
  const item = findConsultTask(state, id);
  if (!item) return null;
  const p = patch || {};
  if (p.title != null) {
    const t = String(p.title).trim();
    if (t) item.title = t;
  }
  if (p.note != null) item.note = String(p.note);
  if (p.done != null) item.done = !!p.done;
  item.updatedAt = date.nowIso();
  return item;
}

export function toggleConsultTask(state, id) {
  const item = findConsultTask(state, id);
  if (!item) return null;
  item.done = !item.done;
  item.updatedAt = date.nowIso();
  return item;
}

export function removeConsultTask(state, id) {
  const i = state.consultTasks.findIndex((c) => c.id === id);
  if (i === -1) return null;
  const [removed] = state.consultTasks.splice(i, 1);
  return removed;
}

export function pushConsultToToday(state, id, day) {
  const item = findConsultTask(state, id);
  if (!item) return null;
  return addTask(state, { title: item.title, module: 'consult', date: day || date.todayStr() });
}

/** 咨询记录（会议 / 沟通） */
export function addConsultRecord(state, input) {
  const src = input || {};
  const who = String(src.who == null ? '' : src.who).trim();
  const summary = String(src.summary == null ? '' : src.summary).trim();
  if (!who && !summary) return null;
  const rec = {
    id: src.id || newId('r'),
    who: who || '未填写对象',
    date: date.isValidDateStr(src.date) ? src.date : date.todayStr(),
    summary,
    todo: src.todo == null ? '' : String(src.todo),
    nextDate: date.isValidDateStr(src.nextDate) ? src.nextDate : '',
    createdAt: src.createdAt || date.nowIso(),
    updatedAt: date.nowIso(),
  };
  state.consultRecords.push(rec);
  return rec;
}

export function findConsultRecord(state, id) {
  return state.consultRecords.find((r) => r.id === id) || null;
}

export function updateConsultRecord(state, id, patch) {
  const rec = findConsultRecord(state, id);
  if (!rec) return null;
  const p = patch || {};
  if (p.who != null) {
    const v = String(p.who).trim();
    if (v) rec.who = v;
  }
  if (p.date != null && date.isValidDateStr(p.date)) rec.date = p.date;
  if (p.summary != null) rec.summary = String(p.summary);
  if (p.todo != null) rec.todo = String(p.todo);
  if (p.nextDate != null) rec.nextDate = date.isValidDateStr(p.nextDate) ? p.nextDate : '';
  rec.updatedAt = date.nowIso();
  return rec;
}

export function removeConsultRecord(state, id) {
  const i = state.consultRecords.findIndex((r) => r.id === id);
  if (i === -1) return null;
  const [removed] = state.consultRecords.splice(i, 1);
  return removed;
}

/** 记录里的待办 → 正式咨询待办（记录里的内容清空，避免重复提取） */
export function recordTodoToTask(state, id) {
  const rec = findConsultRecord(state, id);
  if (!rec || !rec.todo.trim()) return null;
  const created = addConsultTask(state, { title: rec.todo, note: '来自 ' + rec.date + ' 与 ' + rec.who + ' 的沟通' });
  if (!created) return null;
  rec.todo = '';
  rec.updatedAt = date.nowIso();
  return created;
}

/** 记录的下次回访日 → 排进那天的今日计划 */
export function recordNextDateToPlan(state, id) {
  const rec = findConsultRecord(state, id);
  if (!rec || !date.isValidDateStr(rec.nextDate)) return null;
  return addTask(state, {
    title: '回访 ' + rec.who,
    module: 'consult',
    date: rec.nextDate,
    note: rec.summary,
  });
}

export function consultPendingCount(state) {
  return state.consultTasks.filter((c) => !c.done).length;
}

export function consultMeetingsThisWeek(state, today) {
  const week = date.weekDates(today || date.todayStr());
  return state.consultRecords.filter((r) => week.includes(r.date)).length;
}

/* ============================================================
   健身
   ============================================================ */

/** 今天该练什么：routine[本地星期 - 1] */
export function todayRoutine(state, day) {
  const d = day || date.todayStr();
  const idx = date.weekdayNum(d) - 1;
  const routine = state.fitness.routine || [];
  if (!routine.length) return { label: '休息', rest: true, exercises: [] };
  return routine[idx % routine.length];
}

export function weekdayRoutine(state, weekday) {
  const routine = state.fitness.routine || [];
  if (!routine.length) return { label: '休息', rest: true, exercises: [] };
  return routine[(weekday - 1 + 7) % 7];
}

/** 某天的训练记录（不存在则不创建） */
export function fitnessRecord(state, day) {
  return state.fitness.records[day || date.todayStr()] || null;
}

/** 取得（必要时创建）某天的训练记录 */
export function ensureFitnessRecord(state, day) {
  const d = day || date.todayStr();
  if (!state.fitness.records[d]) {
    const r = todayRoutine(state, d);
    const exercises = {};
    for (const e of r.exercises || []) {
      exercises[e.id] = { sets: e.sets, doneSets: new Array(e.sets).fill(false) };
    }
    state.fitness.records[d] = { label: r.label, rest: !!r.rest, exercises, finished: false };
  }
  return state.fitness.records[d];
}

/** 点一下某个小方块：切换某一组的完成状态 */
export function toggleFitnessSet(state, day, exerciseId, setIndex) {
  const rec = ensureFitnessRecord(state, day);
  const entry = rec.exercises[exerciseId];
  if (!entry) return null;
  if (setIndex < 0 || setIndex >= entry.doneSets.length) return null;
  entry.doneSets[setIndex] = !entry.doneSets[setIndex];
  rec.finished = isRecordAllDone(rec);
  return rec;
}

/** 完成整项：该项所有组一次性点亮（全亮则全部熄灭，便于改错） */
export function toggleFitnessExercise(state, day, exerciseId) {
  const rec = ensureFitnessRecord(state, day);
  const entry = rec.exercises[exerciseId];
  if (!entry) return null;
  const allOn = entry.doneSets.length > 0 && entry.doneSets.every(Boolean);
  entry.doneSets = entry.doneSets.map(() => !allOn);
  rec.finished = isRecordAllDone(rec);
  return rec;
}

export function isRecordAllDone(rec) {
  if (!rec) return false;
  const entries = Object.values(rec.exercises || {});
  if (entries.length === 0) return false;
  return entries.every((e) => e.doneSets.length > 0 && e.doneSets.every(Boolean));
}

/** 今日训练是否全部完成 */
export function fitnessExercisesAllDone(state, day) {
  const rec = fitnessRecord(state, day);
  return isRecordAllDone(rec);
}

/** 整日打卡 */
export function finishFitnessDay(state, day) {
  const rec = ensureFitnessRecord(state, day);
  rec.finished = true;
  return rec;
}

export function unfinishFitnessDay(state, day) {
  const rec = fitnessRecord(state, day);
  if (!rec) return null;
  rec.finished = false;
  return rec;
}

/** 本周已打卡天数（周一到今天） */
export function fitnessWeekDoneCount(state, today) {
  const d = today || date.todayStr();
  const week = date.weekDates(d);
  const todayIdx = date.weekdayNum(d) - 1;
  let n = 0;
  for (let i = 0; i <= todayIdx; i++) {
    const rec = state.fitness.records[week[i]];
    if (rec && rec.finished) n++;
  }
  return n;
}

/** 本周概览：每天是否已打卡 / 是否休息日 */
export function fitnessWeekOverview(state, today) {
  const d = today || date.todayStr();
  const week = date.weekDates(d);
  const todayIdx = date.weekdayNum(d) - 1;
  return week.map((day, i) => {
    const rec = state.fitness.records[day];
    const routine = weekdayRoutine(state, i + 1);
    return {
      date: day,
      weekday: i + 1,
      label: routine.label,
      rest: !!routine.rest,
      done: !!(rec && rec.finished),
      isToday: i === todayIdx,
      isFuture: i > todayIdx,
    };
  });
}

/** 补记某天已练 */
export function markFitnessDay(state, day, done) {
  if (done) return finishFitnessDay(state, day);
  return unfinishFitnessDay(state, day);
}

/** 健身动作增删改 */
export function addFitnessExercise(state, weekday, input) {
  const r = weekdayRoutine(state, weekday);
  const src = input || {};
  const name = String(src.name == null ? '' : src.name).trim();
  if (!name || r.rest) return null;
  const e = {
    id: newId('e'),
    name,
    sets: Math.max(1, Number(src.sets) || 3),
    reps: Math.max(1, Number(src.reps) || 10),
  };
  r.exercises.push(e);
  return e;
}

export function updateFitnessExercise(state, weekday, exerciseId, patch) {
  const r = weekdayRoutine(state, weekday);
  const e = (r.exercises || []).find((x) => x.id === exerciseId);
  if (!e) return null;
  const p = patch || {};
  if (p.name != null) {
    const name = String(p.name).trim();
    if (name) e.name = name;
  }
  if (p.sets != null) e.sets = Math.max(1, Number(p.sets) || e.sets);
  if (p.reps != null) e.reps = Math.max(1, Number(p.reps) || e.reps);
  return e;
}

export function removeFitnessExercise(state, weekday, exerciseId) {
  const r = weekdayRoutine(state, weekday);
  const i = (r.exercises || []).findIndex((x) => x.id === exerciseId);
  if (i === -1) return null;
  const [removed] = r.exercises.splice(i, 1);
  return removed;
}

/** 周安排：改标签或切成休息日 */
export function setRoutineDay(state, weekday, patch) {
  const r = weekdayRoutine(state, weekday);
  const p = patch || {};
  if (p.label != null) {
    const label = String(p.label).trim();
    if (label) r.label = label;
  }
  if (p.rest != null) {
    r.rest = !!p.rest;
    if (r.rest) r.exercises = [];
  }
  return r;
}

/** 把今天的训练推到今日计划 */
export function pushFitnessToToday(state, day) {
  const d = day || date.todayStr();
  const r = todayRoutine(state, d);
  if (r.rest) return null;
  return addTask(state, { title: r.label + ' 训练', module: 'fitness', date: d });
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
   游戏娱乐
   ============================================================ */

export function addGame(state, input) {
  const src = input || {};
  const name = String(src.name == null ? '' : src.name).trim();
  if (!name) return null;
  const g = {
    id: src.id || newId('g'),
    name,
    platform: src.platform == null ? '' : String(src.platform),
    status: GAME_ORDER.includes(src.status) ? src.status : 'wish',
    note: src.note == null ? '' : String(src.note),
    createdAt: src.createdAt || date.nowIso(),
    updatedAt: date.nowIso(),
  };
  state.games.push(g);
  return g;
}

export function findGame(state, id) {
  return state.games.find((g) => g.id === id) || null;
}

export function updateGame(state, id, patch) {
  const g = findGame(state, id);
  if (!g) return null;
  const p = patch || {};
  if (p.name != null) {
    const n = String(p.name).trim();
    if (n) g.name = n;
  }
  if (p.platform != null) g.platform = String(p.platform);
  if (p.status != null && GAME_ORDER.includes(p.status)) g.status = p.status;
  if (p.note != null) g.note = String(p.note);
  g.updatedAt = date.nowIso();
  return g;
}

export function removeGame(state, id) {
  const i = state.games.findIndex((g) => g.id === id);
  if (i === -1) return null;
  const [removed] = state.games.splice(i, 1);
  return removed;
}

/** 开始玩：从"想玩"进入"在玩" */
export function startGame(state, id) {
  return updateGame(state, id, { status: 'playing' });
}

/** 通关 */
export function clearGame(state, id) {
  return updateGame(state, id, { status: 'cleared' });
}

export function gamesByStatus(state) {
  const out = {};
  for (const s of GAME_ORDER) out[s] = [];
  for (const g of state.games) {
    if (!out[g.status]) out[g.status] = [];
    out[g.status].push(g);
  }
  return out;
}

/** 放松安排 */
export function addPlayPlan(state, input) {
  const src = input || {};
  const weekday = Number(src.weekday);
  if (!(weekday >= 1 && weekday <= 7)) return null;
  const p = {
    id: newId('p'),
    weekday,
    duration: src.duration == null ? '' : String(src.duration),
    note: src.note == null ? '' : String(src.note),
  };
  state.playPlan.push(p);
  return p;
}

export function removePlayPlan(state, id) {
  const i = state.playPlan.findIndex((p) => p.id === id);
  if (i === -1) return null;
  const [removed] = state.playPlan.splice(i, 1);
  return removed;
}

export function playPlansOfWeekday(state, weekday) {
  return state.playPlan.filter((p) => p.weekday === Number(weekday));
}

/** 安排今天放松 */
export function pushPlayToToday(state, day) {
  const d = day || date.todayStr();
  const plans = playPlansOfWeekday(state, date.weekdayNum(d));
  const label = plans.length
    ? '放松 ' + plans.map((p) => p.duration || '一会儿').join('、')
    : '放松一会儿';
  return addTask(state, { title: label, module: 'game', date: d });
}

/* ============================================================
   设置
   ============================================================ */

export function setWeeklyGoal(state, n) {
  const v = Math.max(1, Math.min(7, Number(n) || 5));
  state.settings.fitnessWeeklyGoal = v;
  return v;
}

export function setDensity(state, value) {
  state.settings.density = value === 'compact' ? 'compact' : 'comfortable';
  return state.settings.density;
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

  const ready = mediaReady(state);
  if (ready.length) {
    out.push({
      key: 'media-ready',
      text: '自媒体 ' + ready.length + ' 篇待发布',
      detail: ready.slice(0, 3).map((m) => m.title).join('、'),
      route: 'media',
      anchor: ready[0].id,
      level: 'warn',
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

  const done = fitnessWeekDoneCount(state, d);
  const goal = state.settings.fitnessWeeklyGoal;
  if (done < goal) {
    out.push({
      key: 'fitness-week',
      text: '本周健身 ' + done + '/' + goal + ' 天',
      detail: '还差 ' + (goal - done) + ' 天',
      route: 'fitness',
      anchor: 'week',
      level: 'normal',
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
