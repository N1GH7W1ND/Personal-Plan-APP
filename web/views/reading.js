/**
 * 阅读视图。
 *
 * 结构（自上而下）：
 *   1. 概况与今日目标 —— 在读/已读完/累计时长/笔记数，以及今日目标进度条
 *   2. 我的书 —— 清单：状态、进度条、页码、评分、操作
 *   3. 阅读日历 —— 每天读了多久
 *   4. 阅读统计 —— 与其他模块一致的时间范围图表
 *   5. 读书笔记 —— 摘抄与想法，可挂到某本书、可带页码
 */

import * as date from '../date.js';
import * as logic from '../logic.js';
import * as ui from '../ui.js';

/** 当前日历月份下，本模块每天的标记 */
function monthMarks(state, moduleId, today) {
  const { year, month } = ui.currentCalMonth(moduleId, today);
  return logic.calendarMarks(state, moduleId, year, month);
}

const STATUS_CLASS = {
  want: 'st-want',
  reading: 'st-reading',
  finished: 'st-finished',
  paused: 'st-paused',
};

/** 一行书 */
function bookRow(book) {
  const pct = logic.bookProgress(book);
  const left = logic.bookPagesLeft(book);

  const meta = [];
  meta.push('<span class="tag ' + STATUS_CLASS[book.status] + '">' +
    ui.escapeHtml(logic.BOOK_STATUS[book.status] || '想读') + '</span>');
  meta.push('<span class="tag">' + ui.escapeHtml(logic.BOOK_KINDS[book.kind] || '其他') + '</span>');
  if (book.author) meta.push('<span class="muted">' + ui.escapeHtml(book.author) + '</span>');
  if (book.totalPages) {
    meta.push('<span class="muted">' + book.currentPage + '/' + book.totalPages + ' 页</span>');
    if (left > 0 && book.status === 'reading') {
      meta.push('<span class="muted">还剩 ' + left + ' 页</span>');
    }
  }
  if (book.rating) meta.push('<span class="stars">' + '★'.repeat(book.rating) + '</span>');

  // 进度条：没填总页数时只显示状态，不显示百分比
  const progress = book.totalPages
    ? '<div class="book-progress"><div class="progress"><div class="progress-bar" style="width:' + pct + '%"></div></div>' +
      '<span class="book-pct">' + pct + '%</span></div>'
    : '';

  return '<div class="book-row" id="book-' + ui.escapeHtml(book.id) + '" data-status="' + ui.escapeHtml(book.status) + '">' +
    '<div class="book-main">' +
      '<div class="book-title" data-act="book-edit" data-id="' + ui.escapeHtml(book.id) + '">' +
        ui.escapeHtml(book.title) + '</div>' +
      '<div class="row-meta">' + meta.join('') + '</div>' +
      progress +
    '</div>' +
    '<div class="book-actions">' +
      ui.btn('+10 页', { act: 'book-page', id: book.id, step: '10' }, 'btn-sm') +
      ui.btn('记一次', { act: 'book-log', id: book.id }, 'btn-sm') +
      ui.btn('笔记', { act: 'book-notes', id: book.id }, 'btn-sm') +
      ui.iconBtn('···', { act: 'book-menu', id: book.id }, '更多操作') +
    '</div>' +
  '</div>';
}

export default {
  render(state, ctx) {
    const today = ctx.today;
    const stats = logic.readingStats(state, today);
    const percent = logic.readingTodayPercent(state, today);
    const week = logic.readingWeekOverview(state, today);
    const todayMinutes = stats.minutesToday;
    const todayTasks = state.tasks.filter((t) => t.module === 'reading' && t.date === today && !t.done);

    /* ---- 1. 概况与今日目标 ---- */
    const overview = ui.card({
      title: '阅读',
      sub: '在读 ' + stats.reading + ' · 想读 ' + stats.want + ' · 已读完 ' + stats.finished + ' · 笔记 ' + stats.notes + ' 条',
      actions: ui.btn('+ 加一本书', { act: 'book-new' }, 'btn-primary btn-sm'),
      body:
        '<div class="read-goal">' +
          '<div class="read-goal-head">' +
            '<span class="read-goal-label">今天读了 <b>' + todayMinutes + '</b> / ' + stats.dailyGoal + ' 分钟</span>' +
            ui.btn('记一次阅读', { act: 'read-log' }, 'btn-sm') +
          '</div>' +
          '<div class="progress"><div class="progress-bar" style="width:' + percent + '%"></div></div>' +
        '</div>' +
        ui.statRow([
          { num: stats.total, label: '书' },
          { num: stats.pagesRead, label: '累计已读页数' },
          { num: Math.round(stats.minutesTotal / 60 * 10) / 10, label: '累计小时' },
          { num: stats.weekGoalDays, label: '本周达标天数' },
        ]) +
        '<div class="week-strip">' + week.map((d) => {
          const goal = Number(state.settings.readingDailyGoal) || 30;
          const cls = ['week-dot'];
          if (d.minutes >= goal) cls.push('done');
          else if (d.minutes > 0) cls.push('part');
          if (d.isToday) cls.push('today');
          return '<div class="' + cls.join(' ') + '" title="' + ui.escapeHtml(date.fmtDateCn(d.date) + '：' + d.minutes + ' 分钟') + '">' +
            '<span class="wd-name">' + ui.escapeHtml(date.WEEK_CN[date.weekdayNum(d.date) - 1]) + '</span>' +
            '<span class="wd-min">' + (d.minutes || '·') + '</span>' +
          '</div>';
        }).join('') + '</div>',
    });

    /* ---- 2. 我的书 ---- */
    const groups = logic.booksByStatus(state);
    const listHtml = state.books.length
      ? ['reading', 'want', 'paused', 'finished'].map((st) => {
        const list = groups[st] || [];
        if (!list.length) return '';
        return '<div class="book-group">' +
          '<div class="book-group-head">' + ui.escapeHtml(logic.BOOK_STATUS[st]) +
          ' <span class="muted">' + list.length + '</span></div>' +
          list.map(bookRow).join('') +
          '</div>';
      }).join('')
      : ui.empty('❐', '书架还是空的', '点右上角「+ 加一本书」，填个书名就行');

    const booksCard = ui.card({
      title: '我的书',
      sub: state.books.length ? '共 ' + state.books.length + ' 本' : '还没有书',
      actions: ui.btn('+ 加一本书', { act: 'book-new' }, 'btn-sm'),
      body: listHtml,
    });

    /* ---- 3. 阅读日历 ---- */
    const calendarCard = ui.card({
      title: '阅读日历',
      sub: '哪天读了、读了多少',
      body: ui.moduleCalendar({
        moduleId: 'reading',
        state,
        today,
        marks: monthMarks(state, 'reading', today),
        dayPanel: ui.calendarDayTasks(state, 'reading', ui.getCalState('reading').selected, today),
      }),
    });

    /* ---- 4. 阅读统计 ---- */
    const chartCard = ui.card({
      title: '阅读统计',
      sub: '切时间范围看趋势；点柱子或扇形看具体内容',
      body: ui.chartCard({ moduleId: 'reading', state, today, logic }),
    });

    /* ---- 5. 读书笔记 ---- */
    const notes = state.bookNotes.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const noteRows = notes.length
      ? notes.map((n) => {
        const book = n.bookId ? logic.findBook(state, n.bookId) : null;
        return '<div class="book-note" id="bnote-' + ui.escapeHtml(n.id) + '">' +
          '<div class="bn-head">' +
            '<span class="tag ' + (n.kind === 'quote' ? 'bn-quote' : '') + '">' +
              (n.kind === 'quote' ? '摘抄' : '想法') + '</span>' +
            (book ? '<span class="bn-book" data-act="book-jump" data-id="' + ui.escapeHtml(book.id) + '">《' +
              ui.escapeHtml(book.title) + '》</span>' : '<span class="muted">未关联书</span>') +
            (n.page ? '<span class="muted">第 ' + n.page + ' 页</span>' : '') +
            '<span class="spacer"></span>' +
            ui.iconBtn('✎', { act: 'bnote-edit', id: n.id }, '编辑') +
            ui.iconBtn('✕', { act: 'bnote-del', id: n.id }, '删除') +
          '</div>' +
          '<div class="bn-text">' + ui.escapeHtml(n.text) + '</div>' +
        '</div>';
      }).join('')
      : ui.empty('✎', '还没有笔记', '读到有感触的地方，随手记一句');

    const notesCard = ui.card({
      title: '读书笔记',
      sub: stats.notes + ' 条（摘抄 ' + stats.quotes + '）',
      actions: ui.btn('+ 记一条', { act: 'bnote-new' }, 'btn-sm'),
      tight: true,
      body: '<div class="note-add">' +
        '<input class="input" type="text" data-field="bnote-input" placeholder="随手记一句想法，回车即存">' +
        '</div><div style="height:10px"></div>' + noteRows,
    });

    return overview + booksCard + calendarCard + chartCard + notesCard +
      (todayTasks.length ? ui.card({
        title: '今天要读的',
        sub: todayTasks.length + ' 条未完成',
        body: '<div class="list">' + todayTasks.map((t) => ui.taskRow(t, { today })).join('') + '</div>',
      }) : '');
  },

  mounted(root, ctx) {
    const input = root.querySelector('[data-field="bnote-input"]');
    if (input) {
      input.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        const text = input.value.trim();
        if (!text) return;
        ctx.dispatch((s) => logic.addBookNote(s, { text }), '新增读书笔记');
        input.value = '';
        input.focus();
      });
    }
    if (ctx.anchor) {
      const target = root.querySelector('[id="book-' + ctx.anchor + '"]') ||
        root.querySelector('[id="bnote-' + ctx.anchor + '"]');
      if (target) {
        target.classList.add('flash');
        target.scrollIntoView({ block: 'center' });
      }
    }
  },

  onClick(ev, store, ctx, helpers) {
    const act = ev.target.closest('[data-act]');
    if (!act) return;
    const type = act.getAttribute('data-act');
    const id = act.getAttribute('data-id');
    const today = ctx.today;
    const state = store.getState();

    // 日历与图表
    if (ui.handleCalendarClick(act, ev, 'reading', today, helpers.rerender)) return;
    if (ui.handleChartClick(act, 'reading', helpers.rerender)) return;

    if (type === 'read-log' || type === 'book-log') {
      const bookId = type === 'book-log' ? id : '';
      const book = bookId ? logic.findBook(state, bookId) : null;
      openLogDialog(store, helpers, today, bookId, book);
      return;
    }

    if (type === 'book-new' || type === 'book-edit') {
      const book = type === 'book-edit' ? logic.findBook(state, id) : null;
      openBookDialog(store, helpers, book);
      return;
    }

    if (type === 'book-page') {
      const step = Number(act.getAttribute('data-step')) || 10;
      store.dispatch((s) => logic.advanceBookPage(s, id, step), { label: '更新阅读进度' });
      const book = logic.findBook(store.getState(), id);
      if (book && book.status === 'finished') {
        ui.toast('《' + book.title + '》读完了 🎉', { type: 'ok', duration: 2600 });
      }
      helpers.rerender();
      return;
    }

    if (type === 'book-notes') {
      store.dispatch((s) => logic.pushBookToToday(s, id, today), { label: '推到今日' });
      ui.toast('已加入今日计划', { type: 'ok', duration: 2000 });
      helpers.rerender();
      return;
    }

    if (type === 'book-jump') {
      const target = act;
      if (target) target.classList.add('flash');
      return;
    }

    if (type === 'bnote-new' || type === 'bnote-edit') {
      const note = type === 'bnote-edit' ? logic.findBookNote(state, id) : null;
      openNoteDialog(store, helpers, note, state);
      return;
    }

    if (type === 'bnote-del') {
      const note = logic.findBookNote(state, id);
      if (!note) return;
      store.dispatch((s) => logic.removeBookNote(s, id), { undoable: true, label: '删除读书笔记' });
      ui.toastUndo('已删除笔记', () => {
        store.undo();
        helpers.rerender();
      });
      helpers.rerender();
      return;
    }

    if (type === 'book-menu') {
      const book = logic.findBook(state, id);
      if (!book) return;
      ui.openModal({
        title: '《' + book.title + '》',
        body: '<div class="action-list">' +
          '<button type="button" class="action-item" data-act="menu-pick" data-key="edit"><span class="ai-icon">✎</span><span>编辑</span></button>' +
          '<button type="button" class="action-item" data-act="menu-pick" data-key="log"><span class="ai-icon">⏱</span><span>记一次阅读</span></button>' +
          '<button type="button" class="action-item" data-act="menu-pick" data-key="status" data-status="reading"><span class="ai-icon">◐</span><span>标记为在读</span></button>' +
          '<button type="button" class="action-item" data-act="menu-pick" data-key="status" data-status="finished"><span class="ai-icon">✓</span><span>标记为已读完</span></button>' +
          '<button type="button" class="action-item" data-act="menu-pick" data-key="status" data-status="paused"><span class="ai-icon">⏸</span><span>搁置</span></button>' +
          '<button type="button" class="action-item" data-act="menu-pick" data-key="push"><span class="ai-icon">↩</span><span>推到今日计划</span></button>' +
          '<button type="button" class="action-item danger" data-act="menu-pick" data-key="delete"><span class="ai-icon">✕</span><span>删除这本书</span></button>' +
          '</div>',
        foot: '<button type="button" class="btn" data-act="close">取消</button>',
        onMount(root) {
          root.onclick = (e) => {
            const btn = e.target.closest('[data-act="menu-pick"]');
            if (!btn) return;
            const key = btn.getAttribute('data-key');
            ui.closeModal();
            if (key === 'edit') { openBookDialog(store, helpers, book); return; }
            if (key === 'log') { openLogDialog(store, helpers, today, id, book); return; }
            if (key === 'status') {
              store.dispatch((s) => logic.updateBook(s, id, { status: btn.getAttribute('data-status') }), { label: '改阅读状态' });
              helpers.rerender();
              return;
            }
            if (key === 'push') {
              store.dispatch((s) => logic.pushBookToToday(s, id, today), { label: '推到今日' });
              ui.toast('已加入今日计划', { type: 'ok', duration: 2000 });
              helpers.rerender();
              return;
            }
            if (key === 'delete') {
              store.dispatch((s) => logic.removeBook(s, id), { undoable: true, label: '删除书' });
              ui.toastUndo('已删除《' + book.title + '》（连带它的笔记）', () => {
                store.undo();
                helpers.rerender();
              });
              helpers.rerender();
            }
          };
        },
      });
    }
  },
};

/* ---------------- 弹窗 ---------------- */

/** 加/改一本书 */
function openBookDialog(store, helpers, book) {
  const isNew = !book;
  const cur = book || {
    title: '', author: '', kind: 'book', status: 'want',
    totalPages: '', currentPage: 0, rating: 0, note: '',
  };

  ui.openModal({
    title: isNew ? '加一本书' : '编辑《' + cur.title + '》',
    body:
      '<div class="field"><label class="field-label">书名</label>' +
      '<input class="input" type="text" data-field="title" value="' + ui.escapeHtml(cur.title) +
      '" placeholder="例如：置身事内"></div>' +
      '<div class="field-row">' +
      '<div class="field"><label class="field-label">作者</label>' +
      '<input class="input" type="text" data-field="author" value="' + ui.escapeHtml(cur.author || '') + '" placeholder="可留空"></div>' +
      '<div class="field"><label class="field-label">形式</label>' +
      ui.select('kind', cur.kind, logic.BOOK_KIND_ORDER.map((k) => ({ value: k, label: logic.BOOK_KINDS[k] }))) + '</div>' +
      '</div>' +
      '<div class="field-row">' +
      '<div class="field"><label class="field-label">状态</label>' +
      ui.select('status', cur.status, logic.BOOK_STATUS_ORDER.map((s) => ({ value: s, label: logic.BOOK_STATUS[s] }))) + '</div>' +
      '<div class="field"><label class="field-label">评分（0–5）</label>' +
      '<input class="input" type="number" min="0" max="5" data-field="rating" value="' + (cur.rating || 0) + '"></div>' +
      '</div>' +
      '<div class="field-row">' +
      '<div class="field"><label class="field-label">总页数</label>' +
      '<input class="input" type="number" min="0" data-field="totalPages" value="' + (cur.totalPages || '') + '" placeholder="填了才有进度条"></div>' +
      '<div class="field"><label class="field-label">已读到第几页</label>' +
      '<input class="input" type="number" min="0" data-field="currentPage" value="' + (cur.currentPage || 0) + '"></div>' +
      '</div>' +
      '<div class="field"><label class="field-label">备注</label>' +
      ui.textarea('note', cur.note, '为什么想读 / 读后感受…', 3) + '</div>',
    foot: '<button type="button" class="btn" data-act="close">取消</button>' +
      '<button type="button" class="btn btn-primary" data-act="save">保存</button>',
    onMount(root) {
      ui.qs(root, '[data-act="save"]').onclick = () => {
        const title = ui.qs(root, '[data-field="title"]').value.trim();
        if (!title) {
          ui.toast('书名不能为空', { type: 'warn' });
          return;
        }
        const payload = {
          title,
          author: ui.qs(root, '[data-field="author"]').value,
          kind: ui.qs(root, '[data-field="kind"]').value,
          status: ui.qs(root, '[data-field="status"]').value,
          rating: Number(ui.qs(root, '[data-field="rating"]').value) || 0,
          totalPages: Number(ui.qs(root, '[data-field="totalPages"]').value) || 0,
          currentPage: Number(ui.qs(root, '[data-field="currentPage"]').value) || 0,
          note: ui.qs(root, '[data-field="note"]').value,
        };
        ui.closeModal();
        if (isNew) {
          store.dispatch((s) => logic.addBook(s, payload), { label: '加书' });
        } else {
          store.dispatch((s) => logic.updateBook(s, book.id, payload), { label: '编辑书' });
        }
        helpers.rerender();
      };
    },
  });
}

/** 记一次阅读：分钟数 + 可选推进页码 */
function openLogDialog(store, helpers, today, bookId, book) {
  const books = store.getState().books;
  const options = [{ value: '', label: '（不指定书）' }]
    .concat(books.map((b) => ({ value: b.id, label: b.title })));

  ui.openModal({
    title: book ? '记一次阅读：《' + book.title + '》' : '记一次阅读',
    body:
      '<div class="field-row">' +
      '<div class="field"><label class="field-label">读了多少分钟</label>' +
      '<input class="input" type="number" min="1" data-field="minutes" value="20"></div>' +
      '<div class="field"><label class="field-label">读了多少页（可选）</label>' +
      '<input class="input" type="number" min="0" data-field="pages" value=""></div>' +
      '</div>' +
      '<div class="field"><label class="field-label">哪本书</label>' +
      ui.select('bookId', bookId || '', options) + '</div>' +
      '<p class="muted small" style="margin:0">填了页数会同时推进那本书的进度。</p>',
    foot: '<button type="button" class="btn" data-act="close">取消</button>' +
      '<button type="button" class="btn btn-primary" data-act="save">记录</button>',
    onMount(root) {
      ui.qs(root, '[data-act="save"]').onclick = () => {
        const minutes = Number(ui.qs(root, '[data-field="minutes"]').value) || 0;
        if (minutes <= 0) {
          ui.toast('分钟数要大于 0', { type: 'warn' });
          return;
        }
        const payload = {
          date: today,
          minutes,
          pages: Number(ui.qs(root, '[data-field="pages"]').value) || 0,
          bookId: ui.qs(root, '[data-field="bookId"]').value,
        };
        ui.closeModal();
        store.dispatch((s) => logic.logReading(s, payload), { label: '记录阅读' });
        const done = logic.readingMinutesOn(store.getState(), today);
        const goal = Number(store.getState().settings.readingDailyGoal) || 30;
        ui.toast(done >= goal
          ? '今天读了 ' + done + ' 分钟，已达标 ✓'
          : '今天读了 ' + done + ' 分钟（目标 ' + goal + '）', { type: 'ok', duration: 2400 });
        helpers.rerender();
      };
    },
  });
}

/** 加/改一条读书笔记 */
function openNoteDialog(store, helpers, note, state) {
  const isNew = !note;
  const cur = note || { text: '', bookId: '', page: 0, kind: 'note' };
  const options = [{ value: '', label: '（不关联书）' }]
    .concat(state.books.map((b) => ({ value: b.id, label: b.title })));

  ui.openModal({
    title: isNew ? '记一条读书笔记' : '编辑笔记',
    body:
      '<div class="field"><label class="field-label">内容</label>' +
      ui.textarea('text', cur.text, '摘抄原文，或写下自己的想法…', 4) + '</div>' +
      '<div class="field-row">' +
      '<div class="field"><label class="field-label">类型</label>' +
      ui.select('kind', cur.kind, [{ value: 'note', label: '想法' }, { value: 'quote', label: '摘抄' }]) + '</div>' +
      '<div class="field"><label class="field-label">页码（可选）</label>' +
      '<input class="input" type="number" min="0" data-field="page" value="' + (cur.page || 0) + '"></div>' +
      '</div>' +
      '<div class="field"><label class="field-label">来自哪本书</label>' +
      ui.select('bookId', cur.bookId || '', options) + '</div>',
    foot: '<button type="button" class="btn" data-act="close">取消</button>' +
      '<button type="button" class="btn btn-primary" data-act="save">保存</button>',
    onMount(root) {
      ui.qs(root, '[data-act="save"]').onclick = () => {
        const text = ui.qs(root, '[data-field="text"]').value.trim();
        if (!text) {
          ui.toast('内容不能为空', { type: 'warn' });
          return;
        }
        const payload = {
          text,
          kind: ui.qs(root, '[data-field="kind"]').value,
          page: Number(ui.qs(root, '[data-field="page"]').value) || 0,
          bookId: ui.qs(root, '[data-field="bookId"]').value,
        };
        ui.closeModal();
        if (isNew) {
          store.dispatch((s) => logic.addBookNote(s, payload), { label: '新增读书笔记' });
        } else {
          store.dispatch((s) => logic.updateBookNote(s, note.id, payload), { label: '编辑读书笔记' });
        }
        helpers.rerender();
      };
    },
  });
}
