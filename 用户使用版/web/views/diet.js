/**
 * 饮食计划视图。
 * 结构：今日三餐（可手填或从菜谱选）+ 常吃菜谱 + 采买清单。
 */

import * as date from '../date.js';
import * as logic from '../logic.js';
import * as ui from '../ui.js';

/** 当前日历月份下，本模块每天的标记 */
function monthMarks(state, moduleId, today) {
  const { year, month } = ui.currentCalMonth(moduleId, today);
  return logic.calendarMarks(state, moduleId, year, month);
}

export default {
  render(state, ctx) {
    const today = ctx.today;
    const meals = logic.ensureMeals(state, today);
    const planned = logic.mealsPlannedCount(state, today);
    const recipes = state.diet.recipes;
    const shopping = state.diet.shopping;
    const boughtCount = shopping.filter((s) => s.bought).length;

    /* ---- 今日三餐 ---- */
    const mealRows = logic.MEALS.map((m) => {
      const cur = meals[m.key] || { text: '', eaten: false };
      return ui.row({
        attrs: { id: 'meal-' + m.key },
        check: ui.check(!!cur.eaten, { act: 'meal-eaten', meal: m.key }),
        main:
          '<div class="row-title">' + ui.escapeHtml(m.name) + '</div>' +
          ui.rowMeta(cur.text
            ? '<span>' + ui.escapeHtml(cur.text) + '</span>'
            : '<span class="muted">还没定</span>'),
        actions:
          ui.btn(cur.text ? '改' : '定这餐', { act: 'meal-set', meal: m.key }, 'btn-sm') +
          (recipes.length ? ui.btn('从菜谱选', { act: 'meal-pick', meal: m.key }, 'btn-sm') : '') +
          (cur.text ? ui.btn('推送到今日', { act: 'meal-push', meal: m.key }, 'btn-sm') : ''),
        actionsAlways: true,
      });
    }).join('');

    /* ---- 菜谱 ---- */
    const recipeHtml = recipes.length
      ? '<div class="list">' + recipes.map((r) => ui.row({
        attrs: { id: 'recipe-' + r.id },
        main: ui.rowTitle(r.name) + (r.note ? ui.rowMeta('<span class="muted">' + ui.escapeHtml(r.note) + '</span>') : ''),
        actions:
          ui.btn('安排到今天', { act: 'recipe-plan', id: r.id }, 'btn-sm') +
          ui.iconBtn('✕', { act: 'recipe-del', id: r.id }, '删除'),
        actionsAlways: true,
      })).join('') + '</div>'
      : ui.empty('⭐', '还没有常吃菜谱', '把常做的存起来，定三餐时一键就选好了');

    /* ---- 采买清单 ---- */
    const shoppingHtml = shopping.length
      ? '<div class="list">' + shopping.map((s) => ui.row({
        attrs: { id: 'shop-' + s.id },
        className: s.bought ? 'done' : '',
        check: ui.check(!!s.bought, { act: 'shop-toggle', id: s.id }),
        main: ui.rowTitle(s.name),
        actions: ui.iconBtn('✕', { act: 'shop-del', id: s.id }, '删除'),
        actionsAlways: true,
      })).join('') + '</div>'
      : '<div class="muted small" style="padding:6px 2px">清单是空的</div>';

    const todo = state.tasks.filter((t) => t.module === 'diet' && t.date === today && !t.done);

    return ui.card({
      title: '今日三餐',
      sub: '已定 ' + planned + '/3',
      body: '<div class="list">' + mealRows + '</div>',
    }) +
    ui.card({
      title: '饮食日历',
      sub: '哪天定了三餐、哪天还没定',
      body: ui.moduleCalendar({
        moduleId: 'diet',
        state,
        today,
        marks: monthMarks(state, 'diet', today),
        dayPanel: ui.calendarDayTasks(state, 'diet', ui.getCalState('diet').selected, today),
      }),
    }) +
    ui.card({
      title: '饮食统计',
      sub: '切时间范围看趋势；点柱子或扇形看具体内容',
      body: ui.chartCard({ moduleId: 'diet', state, today, logic }),
    }) +
    '<div class="cols-2">' +
    '<div>' +
    ui.card({
      title: '常吃菜谱',
      sub: recipes.length + ' 道',
      actions: ui.btn('+ 存一道菜', { act: 'recipe-new' }, 'btn-primary btn-sm'),
      body: recipeHtml,
    }) +
    '</div>' +
    '<div>' +
    ui.card({
      title: '采买清单',
      sub: shopping.length ? '已买 ' + boughtCount + '/' + shopping.length : '空',
      actions: ui.btn('清空已买', { act: 'shop-clear' }, 'btn-sm'),
      tight: true,
      body:
        '<div class="quick-add"><input class="input" type="text" data-field="shop-input" placeholder="要买什么，回车即加"></div>' +
        '<div style="height:10px"></div>' + shoppingHtml,
    }) +
    '</div>' +
    '</div>' +
    (todo.length ? ui.card({
      title: '今天要做的饮食任务',
      sub: todo.length + ' 条未完成',
      body: '<div class="list">' + todo.map((t) => ui.taskRow(t, { today })).join('') + '</div>',
    }) : '');
  },

  mounted(root, ctx) {
    const input = root.querySelector('[data-field="shop-input"]');
    if (ctx.anchor) {
      const target = root.querySelector('[id="' + ctx.anchor + '"]');
      if (target) {
        target.classList.add('flash');
        target.scrollIntoView({ block: 'center' });
      }
    }
    if (input) {
      input.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        const text = input.value.trim();
        if (!text) return;
        ctx.dispatch((s) => logic.addShoppingItem(s, text), '加采买项');
        input.value = '';
        input.focus();
      });
    }
  },

  onClick(ev, store, ctx, helpers) {
    const act = ev.target.closest('[data-act]');
    if (!act) return;
    const type = act.getAttribute('data-act');
    const id = act.getAttribute('data-id');
    const mealKey = act.getAttribute('data-meal');
    const today = ctx.today;
    const state = store.getState();

    // 日历操作（切月 / 选日期）
    if (ui.handleCalendarClick(act, ev, 'diet', today, helpers.rerender)) return;
    // 图表操作（切时间范围 / 点柱子扇区看明细）
    if (ui.handleChartClick(act, 'diet', helpers.rerender)) return;

    if (type === 'meal-eaten') {
      store.dispatch((s) => logic.toggleMealEaten(s, today, mealKey), { label: '勾选已吃' });
      helpers.rerender();
      return;
    }

    if (type === 'meal-set') {
      const meals = logic.mealsOf(state, today);
      const cur = meals && meals[mealKey] ? meals[mealKey].text : '';
      const mealName = (logic.MEALS.find((m) => m.key === mealKey) || {}).name || '';
      ui.promptDialog({
        title: '今天' + mealName + '吃什么',
        label: '内容',
        value: cur,
        placeholder: '例如：番茄牛腩配米饭',
        okText: '保存',
      }).then((text) => {
        if (text == null) return;
        store.dispatch((s) => logic.setMeal(s, today, mealKey, { text }), { label: '设定三餐' });
        helpers.rerender();
      });
      return;
    }

    if (type === 'meal-pick') {
      const recipes = state.diet.recipes;
      ui.openModal({
        title: '从菜谱里选',
        body: '<div class="action-list">' + recipes.map((r) =>
          '<button type="button" class="action-item" data-act="pick-recipe" data-id="' + ui.escapeHtml(r.id) + '">' +
          '<span class="ai-icon">🍽</span><span>' + ui.escapeHtml(r.name) + '</span></button>').join('') + '</div>',
        foot: '<button type="button" class="btn" data-act="close">取消</button>',
        onMount(root) {
          root.onclick = (e) => {
            const btn = e.target.closest('[data-act="pick-recipe"]');
            if (!btn) return;
            const rid = btn.getAttribute('data-id');
            store.dispatch((s) => logic.planRecipe(s, rid, mealKey, today), { label: '从菜谱定餐' });
            ui.closeModal();
            helpers.rerender();
          };
        },
      });
      return;
    }

    if (type === 'meal-push') {
      const created = store.dispatch((s) => logic.pushMealToToday(s, mealKey, today), { label: '推送到今日' });
      if (created) ui.toast('已加入今日计划：' + created.title, { type: 'ok', duration: 2400 });
      helpers.rerender();
      return;
    }

    if (type === 'recipe-new') {
      ui.openModal({
        title: '存一道菜',
        body:
          '<div class="field"><label class="field-label">菜名</label>' +
          '<input class="input" type="text" data-field="name" placeholder="例如：番茄牛腩"></div>' +
          '<div class="field"><label class="field-label">备注</label>' +
          '<input class="input" type="text" data-field="note" placeholder="可选，例如：要多炖 20 分钟"></div>',
        foot: '<button type="button" class="btn" data-act="close">取消</button>' +
          '<button type="button" class="btn btn-primary" data-act="save">保存</button>',
        onMount(root) {
          ui.qs(root, '[data-act="save"]').onclick = () => {
            const name = ui.qs(root, '[data-field="name"]').value.trim();
            if (!name) return;
            store.dispatch((s) => logic.addRecipe(s, { name, note: ui.qs(root, '[data-field="note"]').value }), { label: '存菜谱' });
            ui.closeModal();
            helpers.rerender();
          };
        },
      });
      return;
    }

    if (type === 'recipe-plan') {
      const recipe = logic.findRecipe(state, id);
      if (!recipe) return;
      ui.openModal({
        title: '把「' + recipe.name + '」安排到哪一餐',
        body: '<div class="action-list">' + logic.MEALS.map((m) =>
          '<button type="button" class="action-item" data-act="plan-meal" data-meal="' + m.key + '">' +
          '<span class="ai-icon">◍</span><span>' + ui.escapeHtml(m.name) + '</span></button>').join('') + '</div>',
        foot: '<button type="button" class="btn" data-act="close">取消</button>',
        onMount(root) {
          root.onclick = (e) => {
            const btn = e.target.closest('[data-act="plan-meal"]');
            if (!btn) return;
            store.dispatch((s) => logic.planRecipe(s, id, btn.getAttribute('data-meal'), today), { label: '安排菜谱' });
            ui.closeModal();
            ui.toast('已安排到今天的 ' + ((logic.MEALS.find((m) => m.key === btn.getAttribute('data-meal')) || {}).name || ''), { type: 'ok', duration: 2200 });
            helpers.rerender();
          };
        },
      });
      return;
    }

    if (type === 'recipe-del') {
      const recipe = logic.findRecipe(state, id);
      if (!recipe) return;
      store.dispatch((s) => logic.removeRecipe(s, id), { undoable: true, label: '删除菜谱' });
      ui.toastUndo('已删除菜谱「' + recipe.name + '」', () => {
        store.undo();
        helpers.rerender();
      });
      helpers.rerender();
      return;
    }

    if (type === 'shop-toggle') {
      store.dispatch((s) => logic.toggleShoppingItem(s, id), { label: '勾选采买' });
      helpers.rerender();
      return;
    }

    if (type === 'shop-del') {
      const item = state.diet.shopping.find((x) => x.id === id);
      store.dispatch((s) => logic.removeShoppingItem(s, id), { undoable: true, label: '删除采买项' });
      if (item) {
        ui.toastUndo('已删除「' + item.name + '」', () => {
          store.undo();
          helpers.rerender();
        });
      }
      helpers.rerender();
      return;
    }

    if (type === 'shop-clear') {
      const bought = state.diet.shopping.filter((s) => s.bought);
      if (!bought.length) {
        ui.toast('还没有勾选已买的项', { duration: 2000 });
        return;
      }
      ui.confirmDialog({
        title: '清空已买',
        message: '把已勾选的 ' + bought.length + ' 项从清单里删掉？',
        okText: '清空',
      }).then((yes) => {
        if (!yes) return;
        store.dispatch((s) => logic.clearBoughtItems(s), { undoable: true, label: '清空已买' });
        ui.toast('已清空 ' + bought.length + ' 项', { type: 'ok', duration: 2200 });
        helpers.rerender();
      });
    }
  },
};
