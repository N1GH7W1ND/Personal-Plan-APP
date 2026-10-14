/**
 * 读书笔记（阅读板块的一部分，不是独立板块）。
 *
 * 这里提供三块可被阅读页直接复用的东西：
 *   - notesSection()  笔记区的完整界面（概况 + 搜索筛选 + 列表）
 *   - handleNotesInput()  搜索框与下拉的输入处理
 *   - handleNotesClick()  笔记相关的点击（新增/编辑/删除/收藏/筛选/跳书）
 *
 * 之所以单独放一个文件而不塞进 reading.js：阅读页本身已经有书单、日历、
 * 图表三块内容，再加一百多行笔记代码会很难读。功能上它仍然属于阅读。
 */

import * as date from '../date.js';
import * as logic from '../logic.js';
import * as ui from '../ui.js';

/** 当前筛选条件（纯界面状态，不落盘） */
const filter = { q: '', bookId: '', kind: '', pinnedOnly: false };

/** 把一行笔记画出来 */
function noteCard(note, book) {
  const loc = logic.noteLocation(note);
  const kinds = logic.NOTE_KINDS;

  return '<div class="note-card' + (note.pinned ? ' pinned' : '') + '" id="note-' +
      ui.escapeHtml(note.id) + '" data-kind="' + ui.escapeHtml(note.kind) + '">' +
    '<div class="nc-head">' +
      '<span class="tag nc-' + ui.escapeHtml(note.kind) + '">' +
        ui.escapeHtml(kinds[note.kind] || '想法') + '</span>' +
      (book
        ? '<span class="nc-book" data-act="note-book" data-id="' + ui.escapeHtml(book.id) + '">《' +
            ui.escapeHtml(book.title) + '》' + (book.author ? ' · ' + ui.escapeHtml(book.author) : '') + '</span>'
        : '<span class="muted">未关联书</span>') +
      (loc ? '<span class="nc-loc">' + ui.escapeHtml(loc) + '</span>' : '') +
      '<span class="spacer"></span>' +
      ui.iconBtn(note.pinned ? '★' : '☆', { act: 'note-pin', id: note.id },
        note.pinned ? '取消收藏' : '收藏（置顶）') +
      ui.iconBtn('✎', { act: 'note-edit', id: note.id }, '编辑') +
      ui.iconBtn('✕', { act: 'note-del', id: note.id }, '删除') +
    '</div>' +
    '<div class="nc-text">' + ui.escapeHtml(note.text) + '</div>' +
    '<div class="nc-foot">' + ui.escapeHtml(date.fmtDateTime(note.createdAt)) + '</div>' +
  '</div>';
}

/**
 * 笔记区的完整界面。
 * @param {object} state
 * @param {object} opt {title, collapsible}
 */
export function notesSection(state, opt) {
  const o = opt || {};
  const summary = logic.bookNotesSummary(state);
  const list = logic.filterBookNotes(state, filter);
  const books = state.books;
  const emptyHint = summary.total
    ? '换个关键词，或点上面的「全部」清掉筛选'
    : '点右上角「+ 记一条」，读到有感触的地方随手写一句';

  const kindTabs = '<div class="pill-tabs">' +
    '<button type="button" class="pill-tab' + (!filter.kind ? ' active' : '') +
      '" data-act="note-filter-kind" data-kind="">全部</button>' +
    logic.NOTE_KIND_ORDER.map((k) =>
      '<button type="button" class="pill-tab' + (filter.kind === k ? ' active' : '') +
      '" data-act="note-filter-kind" data-kind="' + k + '">' +
      ui.escapeHtml(logic.NOTE_KINDS[k]) + '</button>').join('') +
    '</div>';

  const bookOptions = [{ value: '', label: '全部书' }]
    .concat(books.map((b) => ({ value: b.id, label: b.title })));

  const body =
    ui.statRow([
      { num: summary.byKind.quote || 0, label: '摘抄' },
      { num: summary.byKind.note || 0, label: '想法' },
      { num: summary.byKind.question || 0, label: '疑问' },
      { num: summary.byKind.action || 0, label: '待办' },
    ]) +
    '<div class="note-add">' +
      '<input class="input" type="text" data-field="bnote-input" placeholder="随手记一句想法，回车即存">' +
    '</div>' +
    '<div style="height:12px"></div>' +
    '<div class="note-toolbar">' +
      '<input class="input" type="search" data-field="note-q" placeholder="搜内容、章节或书名…" value="' +
        ui.escapeHtml(filter.q) + '">' +
      ui.select('note-book', filter.bookId, bookOptions) +
      '<button type="button" class="btn' + (filter.pinnedOnly ? ' btn-primary' : '') +
        '" data-act="note-filter-pinned">' + (filter.pinnedOnly ? '★ 只看收藏' : '☆ 只看收藏') + '</button>' +
    '</div>' +
    '<div style="height:10px"></div>' + kindTabs +
    '<div class="note-count muted small">' + list.length + ' / ' + summary.total + ' 条</div>' +
    (list.length
      ? list.map((n) => noteCard(n, n.bookId ? logic.findBook(state, n.bookId) : null)).join('')
      : ui.empty('✎', summary.total ? '没有符合条件的笔记' : '还没有笔记', emptyHint));

  return ui.card({
    title: o.title || '读书笔记',
    sub: summary.total + ' 条 · 收藏 ' + summary.pinned
      + (summary.withLocation ? ' · 有位置 ' + summary.withLocation + ' 条' : ''),
    actions: ui.btn('+ 记一条', { act: 'note-new' }, 'btn-primary btn-sm'),
    body,
  });
}

/** 笔记区的输入事件（搜索框与按书筛选）。返回 true 表示这个事件归它处理 */
export function handleNotesInput(ev, ctx, helpers) {
  const target = ev.target;
  if (!target || !target.getAttribute) return false;
  const field = target.getAttribute('data-field');

  if (field === 'note-q') {
    filter.q = target.value;
    // 重绘后把焦点还给搜索框，否则打一个字就断了
    ctx.rerenderKeepingFocus('note-q');
    return true;
  }
  if (field === 'note-book') {
    filter.bookId = target.value;
    helpers.rerender();
    return true;
  }
  return false;
}

/**
 * 笔记相关的点击。返回 true 表示已处理。
 * 调用方（阅读页）在返回 false 时再处理自己的动作。
 */
export function handleNotesClick(act, ev, store, ctx, helpers) {
  const type = act.getAttribute('data-act');
  const id = act.getAttribute('data-id');
  const state = store.getState();

  if (type === 'note-new' || type === 'note-edit' || type === 'bnote-new' || type === 'bnote-edit') {
    const isEdit = type === 'note-edit' || type === 'bnote-edit';
    const note = isEdit ? logic.findBookNote(state, id) : null;
    openNoteEditor(store, helpers, note, state);
    return true;
  }

  if (type === 'note-del' || type === 'bnote-del') {
    const note = logic.findBookNote(state, id);
    if (!note) return true;
    store.dispatch((s) => logic.removeBookNote(s, id), { undoable: true, label: '删除读书笔记' });
    ui.toastUndo('已删除笔记', () => {
      store.undo();
      helpers.rerender();
    });
    helpers.rerender();
    return true;
  }

  if (type === 'note-pin') {
    store.dispatch((s) => logic.toggleNotePinned(s, id), { label: '收藏笔记' });
    helpers.rerender();
    return true;
  }

  if (type === 'note-book') {
    // 跳到那本书所在的阅读页并高亮（本来就在阅读页，只是定位一下）
    ctx.go('reading', id);
    return true;
  }

  if (type === 'note-filter-kind') {
    filter.kind = act.getAttribute('data-kind') || '';
    helpers.rerender();
    return true;
  }

  if (type === 'note-filter-pinned') {
    filter.pinnedOnly = !filter.pinnedOnly;
    helpers.rerender();
    return true;
  }

  return false;
}

/** 重置筛选（离开阅读页时用，避免"看着像没有笔记"） */
export function resetNoteFilter() {
  filter.q = '';
  filter.bookId = '';
  filter.kind = '';
  filter.pinnedOnly = false;
}

/* ---------------- 笔记编辑弹窗 ---------------- */

/**
 * 加/改一条读书笔记。
 * 位置信息分三组，都可不填：
 *   - 章节 / 位置名（自由填写，旁边给了常用词一键填）
 *   - 页码区间
 *   - 行号区间
 */
/**
 * 加/改一条读书笔记。
 * @param {object|null} note 传 null 表示新增
 * @param {object} opt {bookId} 新增时可预选某本书（从书行的「记笔记」进来时用）
 */
export function openNoteEditor(store, helpers, note, state, opt) {
  const isNew = !note;
  const o = opt || {};
  const cur = note || {
    text: '', bookId: o.bookId || '', kind: 'note',
    page: 0, pageTo: 0, line: 0, lineTo: 0, chapter: '', pinned: false,
  };

  const bookOptions = [{ value: '', label: '（不关联书）' }]
    .concat(state.books.map((b) => ({ value: b.id, label: b.title + (b.author ? ' · ' + b.author : '') })));

  const spotChips = logic.NOTE_SPOTS.map((s) =>
    '<button type="button" class="chip" data-act="spot" data-spot="' + ui.escapeHtml(s) + '">' +
    ui.escapeHtml(s) + '</button>').join('');

  ui.openModal({
    title: isNew ? '记一条读书笔记' : '编辑笔记',
    body:
      '<div class="field"><label class="field-label">内容</label>' +
      ui.textarea('text', cur.text, '摘抄原文，或写下自己的想法…', 4) + '</div>' +

      '<div class="field-row">' +
        '<div class="field"><label class="field-label">类型</label>' +
        ui.select('kind', cur.kind, logic.NOTE_KIND_ORDER.map((k) => ({ value: k, label: logic.NOTE_KINDS[k] }))) + '</div>' +
        '<div class="field"><label class="field-label">来自哪本书</label>' +
        ui.select('bookId', cur.bookId || '', bookOptions) + '</div>' +
      '</div>' +

      '<div class="note-loc-box">' +
        '<div class="note-loc-title">位置（都可以不填）</div>' +

        '<div class="field"><label class="field-label">章节 / 位置</label>' +
        '<input class="input" type="text" data-field="chapter" value="' + ui.escapeHtml(cur.chapter || '') +
        '" placeholder="例如：第三章 / 附录二 / 有声书第 4 段"></div>' +
        '<div class="chips">' + spotChips + '</div>' +

        '<div class="field-row" style="margin-top:12px">' +
          '<div class="field"><label class="field-label">从第几页</label>' +
          '<input class="input" type="number" min="0" data-field="page" value="' + (cur.page || '') + '" placeholder="可留空"></div>' +
          '<div class="field"><label class="field-label">到第几页</label>' +
          '<input class="input" type="number" min="0" data-field="pageTo" value="' + (cur.pageTo || '') + '" placeholder="只有一页就留空"></div>' +
        '</div>' +

        '<div class="field-row">' +
          '<div class="field"><label class="field-label">从第几行</label>' +
          '<input class="input" type="number" min="0" data-field="line" value="' + (cur.line || '') + '" placeholder="可留空"></div>' +
          '<div class="field"><label class="field-label">到第几行</label>' +
          '<input class="input" type="number" min="0" data-field="lineTo" value="' + (cur.lineTo || '') + '" placeholder="只有一行就留空"></div>' +
        '</div>' +

        '<label class="check-line"><input type="checkbox" data-field="pinned"' +
          (cur.pinned ? ' checked' : '') + '> 收藏这条（会置顶）</label>' +
      '</div>',

    foot: '<button type="button" class="btn" data-act="close">取消</button>' +
      '<button type="button" class="btn btn-primary" data-act="save">保存</button>',

    onMount(root) {
      // 常用位置：点一下填进"章节/位置"框
      const chapter = ui.qs(root, '[data-field="chapter"]');
      root.onclick = (e) => {
        const chip = e.target.closest('[data-act="spot"]');
        if (!chip) return;
        const spot = chip.getAttribute('data-spot');
        chapter.value = chapter.value.trim() ? chapter.value.trim() + ' · ' + spot : spot;
        chapter.focus();
      };

      ui.qs(root, '[data-act="save"]').onclick = () => {
        const text = ui.qs(root, '[data-field="text"]').value.trim();
        if (!text) {
          ui.toast('内容不能为空', { type: 'warn' });
          return;
        }
        const payload = {
          text,
          kind: ui.qs(root, '[data-field="kind"]').value,
          bookId: ui.qs(root, '[data-field="bookId"]').value,
          chapter: ui.qs(root, '[data-field="chapter"]').value,
          page: Number(ui.qs(root, '[data-field="page"]').value) || 0,
          pageTo: Number(ui.qs(root, '[data-field="pageTo"]').value) || 0,
          line: Number(ui.qs(root, '[data-field="line"]').value) || 0,
          lineTo: Number(ui.qs(root, '[data-field="lineTo"]').value) || 0,
          pinned: !!ui.qs(root, '[data-field="pinned"]').checked,
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
