/**
 * 读书笔记视图。
 *
 * 笔记数量一多，"挤在阅读页底部"就不好找了，所以给它一个独立页面：
 * 搜索 + 按书/类型筛选 + 收藏置顶 + 完整的位置信息（章节、页码区间、行号区间）。
 * 入口在阅读页的「读书笔记」卡片右上角，也用快捷键 N 进。
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

export default {
  render(state, ctx) {
    const summary = logic.bookNotesSummary(state);
    const list = logic.filterBookNotes(state, filter);
    const books = state.books;

    /* ---- 概况 ---- */
    const overview = ui.card({
      title: '读书笔记',
      sub: summary.total + ' 条 · 收藏 ' + summary.pinned + ' · 关联 ' + summary.booksTouched + ' 本书'
        + (summary.withLocation ? ' · 有位置 ' + summary.withLocation + ' 条' : ''),
      actions: ui.btn('+ 记一条', { act: 'note-new' }, 'btn-primary btn-sm'),
      body: ui.statRow([
        { num: summary.byKind.quote || 0, label: '摘抄' },
        { num: summary.byKind.note || 0, label: '想法' },
        { num: summary.byKind.question || 0, label: '疑问' },
        { num: summary.byKind.action || 0, label: '待办' },
      ]) +
      '<div class="note-hint">记的时候能标到「第几页到第几页」「第几行到第几行」「哪个章节」，'
      + '回头翻书就好找。</div>',
    });

    /* ---- 搜索与筛选 ---- */
    const kindTabs = '<div class="pill-tabs">' +
      '<button type="button" class="pill-tab' + (!filter.kind ? ' active' : '') +
        '" data-act="note-filter-kind" data-kind="">全部</button>' +
      logic.NOTE_KIND_ORDER.map((k) =>
        '<button type="button" class="pill-tab' + (filter.kind === k ? ' active' : '') +
        '" data-act="note-filter-kind" data-kind="' + k + '">' + ui.escapeHtml(logic.NOTE_KINDS[k]) + '</button>').join('') +
      '</div>';

    const bookOptions = [{ value: '', label: '全部书' }]
      .concat(books.map((b) => ({ value: b.id, label: b.title })));

    const toolbar = ui.card({
      title: '找笔记',
      sub: list.length + ' / ' + summary.total + ' 条',
      tight: true,
      body:
        '<div class="note-toolbar">' +
          '<input class="input" type="search" data-field="note-q" placeholder="搜内容、章节或书名…" value="' +
            ui.escapeHtml(filter.q) + '">' +
          ui.select('note-book', filter.bookId, bookOptions) +
          '<button type="button" class="btn' + (filter.pinnedOnly ? ' btn-primary' : '') +
            '" data-act="note-filter-pinned">' + (filter.pinnedOnly ? '★ 只看收藏' : '☆ 只看收藏') + '</button>' +
        '</div>' +
        '<div style="height:10px"></div>' + kindTabs,
    });

    /* ---- 列表 ---- */
    const listHtml = list.length
      ? list.map((n) => noteCard(n, n.bookId ? logic.findBook(state, n.bookId) : null)).join('')
      : ui.empty('✎',
        summary.total ? '没有符合条件的笔记' : '还没有笔记',
        summary.total ? '换个关键词，或点上面的「全部」清掉筛选' : '点右上角「+ 记一条」，读到有感触的地方随手写一句');

    const listCard = ui.card({
      title: '全部笔记',
      sub: list.length + ' 条',
      body: listHtml,
    });

    return overview + toolbar + listCard;
  },

  mounted(root, ctx) {
    // 搜索框：输入即筛选（不改变数据，只是重绘）
    const q = root.querySelector('[data-field="note-q"]');
    if (q) {
      q.addEventListener('input', () => {
        filter.q = q.value;
        ctx.rerenderKeepingFocus('note-q');
      });
      q.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
          q.value = '';
          filter.q = '';
          ctx.rerender();
        }
      });
    }
    const bookSel = root.querySelector('[data-field="note-book"]');
    if (bookSel) {
      bookSel.addEventListener('change', () => {
        filter.bookId = bookSel.value;
        ctx.rerender();
      });
    }

    if (ctx.anchor) {
      const target = root.querySelector('[id="note-' + ctx.anchor + '"]');
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
    const state = store.getState();

    if (type === 'note-new' || type === 'note-edit') {
      const note = type === 'note-edit' ? logic.findBookNote(state, id) : null;
      openNoteEditor(store, helpers, note, state);
      return;
    }

    if (type === 'note-del') {
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

    if (type === 'note-pin') {
      store.dispatch((s) => logic.toggleNotePinned(s, id), { label: '收藏笔记' });
      helpers.rerender();
      return;
    }

    if (type === 'note-book') {
      ctx.go('reading', id);
      return;
    }

    if (type === 'note-filter-kind') {
      filter.kind = act.getAttribute('data-kind') || '';
      helpers.rerender();
      return;
    }

    if (type === 'note-filter-pinned') {
      filter.pinnedOnly = !filter.pinnedOnly;
      helpers.rerender();
    }
  },
};

/** 重置筛选（切换页面回来时用，避免"看着像没有笔记"） */
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
export function openNoteEditor(store, helpers, note, state) {
  const isNew = !note;
  const cur = note || {
    text: '', bookId: '', kind: 'note',
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
