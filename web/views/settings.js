/**
 * 数据与设置视图。
 * 结构：数据状态（文件在哪、上次保存、各类条数）+ 导出/恢复 + 偏好设置 + 危险操作。
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
          : ''),
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
      title: '偏好设置',
      sub: '改了立刻生效',
      body:
        '<div class="field-row">' +
        '<div class="field"><label class="field-label">每日阅读目标（分钟）</label>' +
        '<input class="input" type="number" min="1" max="480" data-field="readingDailyGoal" value="' +
          Number(state.settings.readingDailyGoal) + '"></div>' +
        '<div class="field"><label class="field-label">界面密度</label>' +
        ui.select('density', state.settings.density, [
          { value: 'comfortable', label: '舒适' },
          { value: 'compact', label: '紧凑' },
        ]) +
        '</div>' +
        '</div>' +
        '<p class="muted small" style="margin-bottom:0">“新的一天”以本机时间 0 点为界，固定不可改（见 PRD D9）。</p>',
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

  mounted(root, ctx) {
    // 偏好设置：改完立刻写入
    const readGoal = root.querySelector('[data-field="readingDailyGoal"]');
    if (readGoal) {
      readGoal.onchange = () => {
        const v = Number(readGoal.value);
        // setReadingDailyGoal 会把非法值归一到默认值，并返回实际生效的分钟数
        const applied = ctx.dispatch((s) => logic.setReadingDailyGoal(s, v), '改每日阅读目标');
        ui.toast('每日阅读目标已改为 ' + applied + ' 分钟', { type: 'ok', duration: 2000 });
      };
    }
    const density = root.querySelector('[data-field="density"]');
    if (density) {
      density.onchange = () => {
        ctx.dispatch((s) => logic.setDensity(s, density.value), '改界面密度');
      };
    }
  },
};
