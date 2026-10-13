/**
 * 游戏娱乐视图。
 * 结构：想玩 / 在玩 / 已通关 三列看板 + 放松时间安排。
 * 意义：让"休息"也进入计划，避免工作和娱乐互相侵占。
 */

import * as date from '../date.js';
import * as logic from '../logic.js';
import * as ui from '../ui.js';

function gameCard(game) {
  const actions = [];
  if (game.status === 'wish') actions.push(ui.btn('开始玩', { act: 'game-start', id: game.id }, 'btn-sm'));
  if (game.status === 'playing') actions.push(ui.btn('通关', { act: 'game-clear', id: game.id }, 'btn-sm'));
  if (game.status === 'cleared') actions.push(ui.btn('重新在玩', { act: 'game-start', id: game.id }, 'btn-sm'));
  actions.push(ui.iconBtn('···', { act: 'game-menu', id: game.id }, '更多操作'));

  return '<div class="board-card" id="game-' + ui.escapeHtml(game.id) + '">' +
    '<div class="board-card-title" data-act="game-edit" data-id="' + ui.escapeHtml(game.id) + '" style="cursor:text">' +
    ui.escapeHtml(game.name) + '</div>' +
    '<div class="board-card-meta">' +
    (game.platform ? ui.tag(game.platform) : '') +
    (game.note ? '<span class="muted">' + ui.escapeHtml(game.note) + '</span>' : '') +
    '</div>' +
    '<div class="board-card-actions">' + actions.join('') + '</div>' +
    '</div>';
}

export default {
  render(state, ctx) {
    const today = ctx.today;
    const groups = logic.gamesByStatus(state);
    const todayPlans = logic.playPlansOfWeekday(state, date.weekdayNum(today));
    const todo = state.tasks.filter((t) => t.module === 'game' && t.date === today && !t.done);

    const board = '<div class="cols-board cols-3">' + logic.GAME_ORDER.map((status) =>
      '<div class="board-col">' +
      '<div class="board-head">' + ui.escapeHtml(logic.GAME_STATUS[status]) +
      '<span class="count">' + groups[status].length + '</span></div>' +
      '<div class="board-body">' +
      (groups[status].length
        ? groups[status].map(gameCard).join('')
        : '<div class="muted small" style="padding:6px 4px">还没有游戏</div>') +
      '</div></div>').join('') + '</div>';

    const planRows = state.playPlan.length
      ? '<div class="list">' + state.playPlan.slice().sort((a, b) => a.weekday - b.weekday).map((p) => ui.row({
        main: ui.rowTitle(date.WEEK_FULL_CN[p.weekday - 1] + (p.duration ? ' · ' + p.duration : '')) +
          (p.note ? ui.rowMeta('<span class="muted">' + ui.escapeHtml(p.note) + '</span>') : ''),
        actions: ui.iconBtn('✕', { act: 'plan-del', id: p.id }, '删除'),
        actionsAlways: true,
      })).join('') + '</div>'
      : ui.empty('🎮', '还没有放松安排', '给自己排个固定的放松时段，休息也是计划的一部分');

    return ui.card({
      title: '游戏娱乐',
      sub: '想玩 ' + groups.wish.length + ' · 在玩 ' + groups.playing.length + ' · 已通关 ' + groups.cleared.length,
      actions: ui.btn('+ 加游戏', { act: 'game-new' }, 'btn-primary btn-sm'),
      body: board,
    }) +
    ui.card({
      title: '放松时间',
      sub: todayPlans.length
        ? '今天安排了：' + todayPlans.map((p) => p.duration || '放松').join('、')
        : '今天没有安排',
      actions: ui.btn('+ 加时段', { act: 'plan-new' }, 'btn-sm') +
        ui.btn('安排今天放松', { act: 'plan-today' }, 'btn-primary btn-sm'),
      body: planRows,
    }) +
    (todo.length ? ui.card({
      title: '今天要做的娱乐任务',
      sub: todo.length + ' 条',
      body: '<div class="list">' + todo.map((t) => ui.taskRow(t, { today })).join('') + '</div>',
    }) : '');
  },

  mounted(root, ctx) {
    if (ctx.anchor) {
      const target = root.querySelector('[id="game-' + ctx.anchor + '"]');
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

    const openEditor = (game) => {
      const isNew = !game;
      const item = game || { name: '', platform: '', status: 'wish', note: '' };
      ui.openModal({
        title: isNew ? '加一个游戏' : '编辑游戏',
        body:
          '<div class="field"><label class="field-label">游戏名</label>' +
          '<input class="input" type="text" data-field="name" value="' + ui.escapeHtml(item.name) + '"></div>' +
          '<div class="field-row">' +
          '<div class="field"><label class="field-label">平台</label>' +
          '<input class="input" type="text" data-field="platform" value="' + ui.escapeHtml(item.platform) + '" placeholder="PC / Switch / PS5…"></div>' +
          '<div class="field"><label class="field-label">状态</label>' +
          ui.select('status', item.status, logic.GAME_ORDER.map((s) => ({ value: s, label: logic.GAME_STATUS[s] }))) + '</div>' +
          '</div>' +
          '<div class="field"><label class="field-label">备注</label>' +
          '<input class="input" type="text" data-field="note" value="' + ui.escapeHtml(item.note) + '" placeholder="进度、想玩的原因…"></div>',
        foot: '<button type="button" class="btn" data-act="close">取消</button>' +
          '<button type="button" class="btn btn-primary" data-act="save">保存</button>',
        onMount(root) {
          ui.qs(root, '[data-act="save"]').onclick = () => {
            // 先把值取出来，再关弹窗（关掉后 DOM 就空了）
            const name = ui.qs(root, '[data-field="name"]').value.trim();
            if (!name) return;
            const patch = {
              name,
              platform: ui.qs(root, '[data-field="platform"]').value,
              status: ui.qs(root, '[data-field="status"]').value,
              note: ui.qs(root, '[data-field="note"]').value,
            };
            ui.closeModal();
            if (isNew) {
              store.dispatch((s) => logic.addGame(s, patch), { label: '新增游戏' });
            } else {
              store.dispatch((s) => logic.updateGame(s, id, patch), { label: '编辑游戏' });
            }
            helpers.rerender();
          };
        },
      });
    };

    if (type === 'game-new') {
      openEditor(null);
      return;
    }

    if (type === 'game-edit') {
      const game = logic.findGame(state, id);
      if (game) openEditor(game);
      return;
    }

    if (type === 'game-start') {
      store.dispatch((s) => logic.startGame(s, id), { label: '开始玩' });
      helpers.rerender();
      return;
    }

    if (type === 'game-clear') {
      const game = logic.findGame(state, id);
      store.dispatch((s) => logic.clearGame(s, id), { label: '通关' });
      if (game) ui.toast('通关啦：' + game.name, { type: 'ok', duration: 2400 });
      helpers.rerender();
      return;
    }

    if (type === 'game-menu') {
      const game = logic.findGame(state, id);
      if (!game) return;
      ui.openModal({
        title: '操作：' + game.name,
        body: '<div class="action-list">' +
          '<button type="button" class="action-item" data-act="menu-pick" data-key="edit"><span class="ai-icon">✎</span><span>编辑</span></button>' +
          logic.GAME_ORDER.filter((s) => s !== game.status).map((s) =>
            '<button type="button" class="action-item" data-act="menu-pick" data-key="status" data-status="' + s + '">' +
            '<span class="ai-icon">◈</span><span>移到「' + logic.GAME_STATUS[s] + '」</span></button>').join('') +
          '<button type="button" class="action-item danger" data-act="menu-pick" data-key="delete"><span class="ai-icon">✕</span><span>删除</span></button>' +
          '</div>',
        foot: '<button type="button" class="btn" data-act="close">取消</button>',
        onMount(root) {
          root.onclick = (e) => {
            const btn = e.target.closest('[data-act="menu-pick"]');
            if (!btn) return;
            const key = btn.getAttribute('data-key');
            ui.closeModal();
            if (key === 'edit') return openEditor(game);
            if (key === 'status') {
              store.dispatch((s) => logic.updateGame(s, id, { status: btn.getAttribute('data-status') }), { label: '移动游戏' });
              return helpers.rerender();
            }
            if (key === 'delete') {
              store.dispatch((s) => logic.removeGame(s, id), { undoable: true, label: '删除游戏' });
              ui.toastUndo('已删除「' + game.name + '」', () => {
                store.undo();
                helpers.rerender();
              });
              helpers.rerender();
            }
          };
        },
      });
      return;
    }

    if (type === 'plan-new') {
      ui.openModal({
        title: '加一个放松时段',
        body:
          '<div class="field"><label class="field-label">星期几</label>' +
          ui.select('weekday', String(date.weekdayNum(today)), date.WEEK_FULL_CN.map((n, i) => ({ value: String(i + 1), label: n }))) + '</div>' +
          '<div class="field"><label class="field-label">大概多久</label>' +
          '<input class="input" type="text" data-field="duration" placeholder="例如：2 小时"></div>' +
          '<div class="field"><label class="field-label">备注</label>' +
          '<input class="input" type="text" data-field="note" placeholder="可选"></div>',
        foot: '<button type="button" class="btn" data-act="close">取消</button>' +
          '<button type="button" class="btn btn-primary" data-act="save">保存</button>',
        onMount(root) {
          ui.qs(root, '[data-act="save"]').onclick = () => {
            // 先把值取出来，再关弹窗（关掉后 DOM 就空了）
            const payload = {
              weekday: Number(ui.qs(root, '[data-field="weekday"]').value),
              duration: ui.qs(root, '[data-field="duration"]').value,
              note: ui.qs(root, '[data-field="note"]').value,
            };
            ui.closeModal();
            store.dispatch((s) => logic.addPlayPlan(s, payload), { label: '加放松时段' });
            helpers.rerender();
          };
        },
      });
      return;
    }

    if (type === 'plan-del') {
      store.dispatch((s) => logic.removePlayPlan(s, id), { undoable: true, label: '删除放松时段' });
      helpers.rerender();
      return;
    }

    if (type === 'plan-today') {
      const created = store.dispatch((s) => logic.pushPlayToToday(s, today), { label: '安排今天放松' });
      if (created) ui.toast('已加入今日计划：' + created.title, { type: 'ok', duration: 2400 });
      helpers.rerender();
    }
  },
};
