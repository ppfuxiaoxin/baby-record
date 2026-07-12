// ui.js — 视图渲染，返回 HTML 字符串（事件由 app.js 统一委托处理）
import {
  computeStats,
  formatTime,
  formatDuration,
  formatDateRange,
  currentCycleStart,
  recordsInCycle,
  listCycles,
} from './stats.js';

const TYPE_LABEL = { feeding: '喂养', diaper: '尿布', sleep: '睡眠' };

// 是否为「待补充」记录（详情未填）
function isPending(r) {
  if (r.type === 'feeding') return r.breastMinutes == null && r.formulaMl == null;
  if (r.type === 'diaper') return r.pee == null && r.poop == null;
  if (r.type === 'sleep') return !r.end;
  return false;
}

function renderStats(s) {
  const items = [
    { label: '母乳时长', value: formatDuration(s.breastMinutes), icon: '🤱' },
    { label: '配方奶', value: `${s.formulaMl} ml`, icon: '🍼' },
    { label: '大便', value: `${s.poopCount} 次`, icon: '💩' },
    { label: '小便', value: `${s.peeCount} 次`, icon: '💦' },
    { label: '尿布', value: `${s.diaperCount} 次`, icon: '🧷' },
    { label: '睡眠', value: formatDuration(s.sleepMinutes), icon: '😴' },
  ];
  return `<div class="stats-grid">${items
    .map(
      (it) => `<div class="stat"><div class="stat-icon">${it.icon}</div>
      <div class="stat-value">${it.value}</div><div class="stat-label">${it.label}</div></div>`
    )
    .join('')}</div>`;
}

// 单张记录卡（用于三列中的某一列）
function renderColCard(r) {
  const pend = isPending(r);
  let detail = '';
  if (r.type === 'feeding') {
    const parts = [];
    if (r.breastMinutes != null) parts.push(`母乳 ${r.breastMinutes}分`);
    if (r.formulaMl != null) parts.push(`配方 ${r.formulaMl}ml`);
    detail = parts.length ? parts.join('<br>') : '待补充';
  } else if (r.type === 'diaper') {
    const parts = [];
    if (r.poop) parts.push('大便');
    if (r.pee) parts.push('小便');
    detail = parts.length ? parts.join(' + ') : '待补充';
  } else if (r.type === 'sleep') {
    detail = r.end
      ? `${formatTime(r.start)}–${formatTime(r.end)}<br>${formatDuration(
          (new Date(r.end) - new Date(r.start)) / 60000
        )}`
      : `开始 ${formatTime(r.start)}<br>进行中`;
  }
  return `
    <div class="col-card ${pend ? 'pending' : ''}" data-action="edit" data-id="${r.id}">
      <div class="col-time">${formatTime(r.start)}${pend ? ' <span class="col-dot">待补</span>' : ''}</div>
      <div class="col-detail">${detail}</div>
    </div>`;
}

// 三列展示：喂养 / 尿布 / 睡眠，各列按时间倒序（最新在上）
function renderRecordColumns(records) {
  const byType = { feeding: [], diaper: [], sleep: [] };
  for (const r of records) {
    if (byType[r.type]) byType[r.type].push(r);
  }
  for (const k of Object.keys(byType)) {
    byType[k].sort((a, b) => new Date(b.start) - new Date(a.start));
  }
  const cols = [
    { key: 'feeding', label: '喂养', icon: '🍼' },
    { key: 'diaper', label: '尿布', icon: '🧷' },
    { key: 'sleep', label: '睡眠', icon: '😴' },
  ];
  return `<div class="records-cols">${cols
    .map((c) => {
      const list = byType[c.key];
      const body = list.length
        ? list.map(renderColCard).join('')
        : `<div class="col-empty">暂无</div>`;
      return `<div class="col"><div class="col-head">${c.icon} ${c.label}</div>${body}</div>`;
    })
    .join('')}</div>`;
}

export function renderHome(records, openSleep) {
  const cs = currentCycleStart();
  const inCycle = recordsInCycle(records, cs);
  const stats = computeStats(inCycle);
  const pending = inCycle.filter(isPending).length;
  const sleepLabel = openSleep ? '结束睡眠' : '睡眠记录';
  const sleepSub = openSleep ? `开始于 ${formatTime(openSleep.start)}` : '点一下开始记录';

  return `
    <header class="topbar">
      <div class="cycle-title">本周期统计</div>
      <button class="link" data-action="history">历史周期 ›</button>
    </header>
    <div class="cycle-range sub">${formatDateRange(cs)}</div>
    ${renderStats(stats)}
    ${pending ? `<div class="pending-badge">${pending} 条待补充详情，点记录可补</div>` : ''}
    <div class="actions">
      <button class="btn-big feeding" data-action="feeding">
        <span class="btn-icon">🍼</span>
        <span class="btn-label">喂养记录</span>
        <span class="btn-sub">点一下记下现在</span>
      </button>
      <button class="btn-big diaper" data-action="diaper">
        <span class="btn-icon">🧷</span>
        <span class="btn-label">尿布情况</span>
        <span class="btn-sub">点一下记下现在</span>
      </button>
      <button class="btn-big sleep ${openSleep ? 'active' : ''}" data-action="sleep">
        <span class="btn-icon">😴</span>
        <span class="btn-label">${sleepLabel}</span>
        <span class="btn-sub">${sleepSub}</span>
      </button>
    </div>
    <section class="list-section">
      <h2>本周期记录</h2>
      ${renderRecordColumns(inCycle)}
    </section>
  `;
}

export function renderHistory(records) {
  const cur = currentCycleStart().getTime();
  const cycles = listCycles(records).filter((c) => c.cycleStart.getTime() < cur);
  const items = cycles
    .map(
      (c) => `
      <li class="cycle-item" data-action="cycle" data-key="${c.cycleStart.getTime()}">
        <div class="cycle-info">
          <div class="cycle-range">${formatDateRange(c.cycleStart)}</div>
          <div class="cycle-mini">母乳 ${formatDuration(c.stats.breastMinutes)} · 配方 ${
        c.stats.formulaMl
      }ml · 便 ${c.stats.poopCount}/${c.stats.peeCount} · 尿布 ${
        c.stats.diaperCount
      } · 睡 ${formatDuration(c.stats.sleepMinutes)}</div>
        </div>
        <div class="chev">›</div>
      </li>`
    )
    .join('');
  return `
    <header class="topbar">
      <button class="link" data-action="home">‹ 返回</button>
      <div class="cycle-title">历史周期</div>
    </header>
    ${
      cycles.length
        ? `<ul class="cycle-list">${items}</ul>`
        : `<div class="empty-page">还没有历史周期</div>`
    }
  `;
}

export function renderCycleDetail(records, key) {
  const cs = new Date(Number(key));
  const inCycle = recordsInCycle(records, cs);
  const stats = computeStats(inCycle);
  return `
    <header class="topbar">
      <button class="link" data-action="history">‹ 历史</button>
      <div class="cycle-title">周期详情</div>
    </header>
    <div class="cycle-range center">${formatDateRange(cs)}</div>
    ${renderStats(stats)}
    <section class="list-section">
      <h2>本周期记录</h2>
      ${renderRecordColumns(inCycle)}
    </section>
  `;
}

// datetime-local 输入框需要的本地时间格式 YYYY-MM-DDTHH:MM
function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export function renderEditSheet(r) {
  let body = '';
  if (r.type === 'feeding') {
    body = `
      <label class="field"><span>开始时间</span>
        <input type="datetime-local" name="start" value="${toLocalInput(r.start)}"></label>
      <label class="field"><span>母乳时长（分钟，可留空）</span>
        <input type="number" inputmode="numeric" min="0" name="breastMinutes"
          value="${r.breastMinutes ?? ''}" placeholder="未填"></label>
      <label class="field"><span>配方奶量（毫升，可留空）</span>
        <input type="number" inputmode="numeric" min="0" name="formulaMl"
          value="${r.formulaMl ?? ''}" placeholder="未填"></label>`;
  } else if (r.type === 'diaper') {
    body = `
      <label class="field"><span>开始时间</span>
        <input type="datetime-local" name="start" value="${toLocalInput(r.start)}"></label>
      <div class="field"><span>情况（可多选）</span>
        <div class="chips">
          <label class="chip"><input type="checkbox" name="pee" ${r.pee ? 'checked' : ''}><span>小便</span></label>
          <label class="chip"><input type="checkbox" name="poop" ${r.poop ? 'checked' : ''}><span>大便</span></label>
        </div>
      </div>`;
  } else if (r.type === 'sleep') {
    body = `
      <label class="field"><span>开始时间</span>
        <input type="datetime-local" name="start" value="${toLocalInput(r.start)}"></label>
      <label class="field"><span>结束时间（留空 = 进行中）</span>
        <input type="datetime-local" name="end"
          value="${r.end ? toLocalInput(r.end) : ''}" placeholder="未结束"></label>`;
  }

  return `
    <div class="sheet-wrap">
      <div class="sheet-mask" data-action="close-edit"></div>
      <div class="sheet">
        <div class="sheet-head">
          <div class="sheet-title">编辑${TYPE_LABEL[r.type]}记录</div>
          <button class="link" data-action="close-edit">关闭</button>
        </div>
        <form class="sheet-body" data-action="save-edit" data-id="${r.id}">
          ${body}
          <div class="sheet-actions">
            <button type="button" class="btn-danger" data-action="delete" data-id="${r.id}">删除</button>
            <button type="submit" class="btn-primary">保存</button>
          </div>
        </form>
      </div>
    </div>`;
}
