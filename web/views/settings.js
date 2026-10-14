/**
 * 数据与设置视图。
 * 结构：数据状态（文件在哪、上次保存、各类条数）+ 左侧板块选择 + 导出/恢复 + 危险操作。
 */

import * as date from '../date.js';
import * as logic from '../logic.js';
import * as ui from '../ui.js';

/** 各类数据的条数统计 */
function dataCounts(state) {
  return [
    { num: state.tasks.length, label: '任务' },
    { num: state.notes.length, label: '备忘' },
    { num: state.devTasks.length + state.devIdeas.length, label: '开发（含灵感）' },
    { num: state.studyItems.length, label: '学习条目' },
    { num: state.books.length, label: '书' },
    { num: state.bookNotes.length, label: '读书笔记' },
    { num: state.fitness.log.length, label: '健身记录' },
    { num: state.fitness.goals.length, label: '训练目标' },
    { num: state.diet.recipes.length + state.diet.shopping.length, label: '菜谱与采买' },
    { num: logic.studyMinutesTotal(state), label: '累计学习(分钟)' },
  ];
}

export default {
  render(state, ctx) {
    const status = ctx.status();
    const today = ctx.today;
    const counts = dataCounts(state);
    const total = counts.reduce((n, c) => n + c.num, 0);

    return ui.card({
      title: '数据状态',
      sub: '数据只保存在这台电脑上，不联网、不上传',
      body:
        '<dl class="kv">' +
        '<dt>数据文件</dt><dd id="data-path">' + ui.escapeHtml(status.serverPath || '（尚未获取）') + '</dd>' +
        '<dt>上次保存</dt><dd>' + ui.escapeHtml(status.lastSavedAt ? date.fmtDateTime(status.lastSavedAt) : '—') +
        (status.dirty ? ' <span class="tag warn">有改动还没写入</span>' : '') + '</dd>' +
        '<dt>数据版本</dt><dd>第 ' + ui.escapeHtml(String(status.revision)) + ' 次写入</dd>' +
        '<dt>内容总量</dt><dd>' + total + ' 条</dd>' +
        '</dl>' +
        '<div style="height:12px"></div>' +
        ui.statRow(counts) +
        (status.recovered
          ? '<div class="notice" style="margin-top:14px">本次启动时检测到数据文件异常，已从备份自动恢复' +
            (status.recoveredFrom ? '（' + ui.escapeHtml(status.recoveredFrom) + '）' : '') + '。</div>'
          : '') +
        // 这条原本挂在"偏好设置"里；那一块删掉后挪到这儿，免得规则说明丢失
        '<p class="muted small" style="margin:14px 0 0">' +
        '“新的一天”以本机时间 0 点为界，固定不可改（见 PRD D9）。</p>',
      footer:
        ui.btn('打开数据文件夹', { act: 'open-folder' }, 'btn-sm') +
        ui.btn('立即保存', { act: 'save-now' }, 'btn-sm') +
        '<span class="spacer"></span>' +
        '<span class="muted small">每天首次写入时会自动留一份备份，最多保留 20 份</span>',
    }) +
    ui.card({
      title: '备份与恢复',
      sub: '换电脑或怕丢数据时用',
      body:
        '<p class="muted small" style="margin-top:0">导出会下载一个包含全部数据的文件；' +
        '恢复会用备份文件覆盖当前数据（覆盖前会自动再存一份，方便反悔）。</p>' +
        '<div class="chip-row">' +
        ui.btn('⬇ 导出备份', { act: 'export' }, 'btn-primary') +
        ui.btn('⬆ 从备份恢复', { act: 'import' }) +
        '</div>' +
        '<div class="field" style="margin-top:12px">' +
        '<input type="file" id="importFile" accept=".json,application/json" hidden>' +
        '</div>',
    }) +
    ui.card({
      title: '左侧板块选择',
      sub: '勾选要显示的板块，用 ↑ ↓ 调顺序',
      body: (() => {
        const on = logic.navModules(state);
        /*
         * 列表顺序跟着左侧走：
         *   已勾选的按"左侧显示的顺序"排在前，未勾选的跟在后面。
         * 这样按 ↑ ↓ 调整顺序时，这一列的顺序会同步变化，
         * 一眼就能看出当前左侧是什么样（之前用的是固定顺序，调完不动，容易看糊涂）。
         */
        const rows = logic.navModulePickerOrder(state).map((id) => {
          const checked = on.includes(id);
          const required = id === logic.NAV_MODULE_REQUIRED;
          const idx = on.indexOf(id);
          const name = logic.moduleName(id);
          return '<div class="nav-pick' + (checked ? ' on' : '') + '" data-module="' + id + '">' +
            '<label class="np-check">' +
              '<input type="checkbox" data-nav-toggle="' + id + '"' + (checked ? ' checked' : '') + '>' +
              '<span class="np-name">' + ui.escapeHtml(name) + '</span>' +
              (required ? '<span class="np-lock" title="一个都不勾时会回到这一项">保底</span>' : '') +
            '</label>' +
            '<span class="spacer"></span>' +
            (checked
              ? '<span class="np-order">第 ' + (idx + 1) + ' 位</span>' +
                ui.iconBtn('↑', { act: 'nav-up', id }, '上移') +
                ui.iconBtn('↓', { act: 'nav-down', id }, '下移')
              : '<span class="muted small">未显示</span>') +
          '</div>';
        }).join('');

        return rows +
          '<div class="nav-pick-note">' +
            '<p><b>至少要保留一个板块。</b>如果一个都不勾，会自动回到只显示「学习」。</p>' +
            '<p>勾了两个及以上时，「学习」也可以取消。左侧的顺序也会用在「快速添加」的板块下拉里。</p>' +
            '<p class="muted">首页总览、今日计划、数据与设置是应用骨架，固定显示，不在这里勾选。</p>' +
          '</div>';
      })(),
    }) +
    ui.card({
      title: '危险操作',
      className: 'danger-zone',
      sub: '请谨慎使用',
      body:
        '<p class="muted small" style="margin-top:0">清空会删掉全部任务、备忘、记录与打卡数据，' +
        '执行前会自动留一份备份文件。</p>' +
        ui.btn('清空所有数据', { act: 'clear-all' }, 'btn-danger'),
    });
  },

  onClick(ev, store, ctx, helpers) {
    const act = ev.target.closest('[data-act]');
    if (!act) return;
    const type = act.getAttribute('data-act');
    // 「上移/下移」这类按钮把模块 id 放在 data-id 上
    const id = act.getAttribute('data-id');

    if (type === 'open-folder') {
      ctx.revealDataDir().then((res) => {
        ui.toast(res && res.ok ? (res.message || '已打开数据文件夹') : ((res && res.message) || '打开失败'),
          { type: res && res.ok ? 'ok' : 'error', duration: 2600 });
      });
      return;
    }

    if (type === 'save-now') {
      store.flushNow().then(() => {
        const s = store.getStatus();
        if (s.saveStatus === 'saved') ui.toast('已保存到数据文件', { type: 'ok', duration: 2000 });
        else if (s.saveStatus === 'conflict') ui.toast('数据已在别处更新，请刷新', { type: 'warn', duration: 3000 });
        else if (s.saveStatus === 'error') ui.toast('保存失败：' + (s.lastError || ''), { type: 'error', duration: 4000 });
        else ui.toast('没有需要保存的改动', { duration: 2000 });
        helpers.rerender();
      });
      return;
    }

    /* ---- 左侧栏显示哪些模块 ---- */
    if (type === 'nav-up' || type === 'nav-down') {
      const delta = type === 'nav-up' ? -1 : 1;
      store.dispatch((s) => logic.moveNavModule(s, id, delta), { label: '调整模块顺序' });
      helpers.rerender();
      return;
    }

    if (type === 'export') {
      store.exportBackup();
      ui.toast('已开始下载备份文件', { type: 'ok', duration: 2600 });
      return;
    }

    if (type === 'import') {
      const input = document.getElementById('importFile');
      if (!input) return;
      input.value = '';
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const yes = await ui.confirmDialog({
          title: '从备份恢复',
          message: '将用「' + file.name + '」覆盖当前全部数据。',
          detail: '覆盖前会自动把当前数据另存一份到备份目录，万一恢复错了还能找回来。',
          okText: '覆盖并恢复',
          danger: true,
        });
        if (!yes) return;
        try {
          await store.importFromFile(file);
          ui.toast('已从备份恢复', { type: 'ok', duration: 3000 });
          helpers.rerender();
        } catch (err) {
          ui.toast('恢复失败：' + (err && err.message ? err.message : '文件格式不对'), { type: 'error', duration: 4200 });
        }
      };
      input.click();
      return;
    }

    if (type === 'clear-all') {
      ui.confirmDialog({
        title: '清空所有数据',
        message: '这会删掉全部任务、备忘、自媒体内容、开发待办、沟通记录、打卡与菜谱。',
        detail: '执行前会自动留一份备份文件，但界面上不会保留任何内容。确定要清空吗？',
        okText: '确认清空',
        danger: true,
        requireText: '确认清空',
        requireLabel: '请输入「确认清空」四个字以继续',
      }).then(async (yes) => {
        if (!yes) return;
        await store.clearAll();
        ui.toast('已清空所有数据', { type: 'warn', duration: 3000 });
        helpers.rerender();
      });
    }
  },

  mounted(root, ctx, helpers) {
    /*
     * 「左侧板块选择」的勾选框：勾上/取消立刻写入。
     * 说明：偏好设置那一整块（阅读目标、健身目标、界面密度）按本人要求已删除，
     * 所以这里只剩板块勾选的处理。
     */
    for (const id of logic.NAV_MODULE_CHOICES) {
      const box = root.querySelector('[data-nav-toggle="' + id + '"]');
      if (!box) continue;
      box.onchange = () => {
        const applied = ctx.dispatch(
          (s) => logic.toggleNavModule(s, id, box.checked),
          box.checked ? '显示板块' : '隐藏板块'
        );
        const name = logic.moduleName(id);
        if (!box.checked && applied.includes(id)) {
          /*
           * 被规则拦下了：取消这一项会让"一个都不剩"，
           * 于是配置回到保底的「学习」。把勾恢复回去并说明原因。
           */
          box.checked = true;
          ui.toast('至少要保留一个板块，已自动回到只显示「' + logic.moduleName(applied[0]) + '」',
            { type: 'warn', duration: 3200 });
        } else {
          ui.toast(box.checked
            ? '左侧栏已显示「' + name + '」'
            : '左侧栏已隐藏「' + name + '」', { type: 'ok', duration: 2000 });
        }
        (helpers && helpers.rerender ? helpers.rerender : ctx.rerender)();
      };
    }
  },
};
