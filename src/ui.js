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

function isPending(r) {
  if (r.type === 'feeding') return r.breastMinutes == null && r.formulaMl == null;
  if (r.type === 'diaper') return r.pee == null && r.poop == null;
  if (r.type === 'sleep') return !r.end;
  return false;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
  if (r.note) detail += `<br><span class="note-line">📝 ${escapeHtml(r.note)}</span>`;
  return `
    <div class="col-card ${pend ? 'pending' : ''}" data-action="edit" data-id="${r.id}">
      <div class="col-time">${formatTime(r.start)}${pend ? ' <span class="col-dot">待补</span>' : ''}</div>
      <div class="col-detail">${detail}</div>
    </div>`;
}

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
      const body = list.length ? list.map(renderColCard).join('') : `<div class="col-empty">暂无</div>`;
      return `<div class="col"><div class="col-head">${c.icon} ${c.label}</div>${body}</div>`;
    })
    .join('')}</div>`;
}

function statusText(s) {
  return (
    { idle: '☁ 已同步', syncing: '⟳ 同步中', offline: '✗ 离线', error: '⚠ 点此重试' }[s] || ''
  );
}

// 顶栏右侧：同步状态(可点刷新) + 首页的登出/历史。status 为 null 表示纯本机模式。
function renderTopbarRight(status, isHome) {
  if (!status) {
    return isHome
      ? `<div class="topbar-right"><button class="link" data-action="history">历史周期 ›</button></div>`
      : '';
  }
  let inner = `<button class="sync-pill sync-${status}" data-action="refresh">${statusText(status)}</button>`;
  if (isHome) {
    inner += `<button class="link" data-action="logout">登出</button><button class="link" data-action="history">历史周期 ›</button>`;
  }
  return `<div class="topbar-right">${inner}</div>`;
}

export function renderHome(records, openSleep, status) {
  const cs = currentCycleStart();
  const inCycle = recordsInCycle(records, cs);
  const stats = computeStats(inCycle);
  const pending = inCycle.filter(isPending).length;
  const sleepLabel = openSleep ? '结束睡眠' : '睡眠记录';
  const sleepSub = openSleep ? `开始于 ${formatTime(openSleep.start)}` : '点一下开始记录';

  return `
    <header class="topbar">
      <div class="cycle-title">本周期统计</div>
      ${renderTopbarRight(status, true)}
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

export function renderHistory(records, status) {
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
      ${renderTopbarRight(status, false)}
    </header>
    <button class="trend-btn" data-action="trend">📈 趋势图 · 按天看趋势</button>
    ${
      cycles.length
        ? `<ul class="cycle-list">${items}</ul>`
        : `<div class="empty-page">还没有历史周期</div>`
    }
  `;
}

export function renderCycleDetail(records, key, status) {
  const cs = new Date(Number(key));
  const inCycle = recordsInCycle(records, cs);
  const stats = computeStats(inCycle);
  return `
    <header class="topbar">
      <button class="link" data-action="history">‹ 历史</button>
      <div class="cycle-title">周期详情</div>
      ${renderTopbarRight(status, false)}
    </header>
    <div class="cycle-range center">${formatDateRange(cs)}</div>
    ${renderStats(stats)}
    <section class="list-section">
      <h2>本周期记录</h2>
      ${renderRecordColumns(inCycle)}
    </section>
  `;
}

const TREND_METRICS = [
  { key: 'breastMinutes', label: '母乳时长', fmt: formatDuration, axis: (v) => (v >= 60 ? (v / 60).toFixed(1) + 'h' : String(v)) },
  { key: 'formulaMl', label: '配方奶', fmt: (v) => `${v} ml`, axis: (v) => String(v) },
  { key: 'poopCount', label: '大便', fmt: (v) => `${v} 次`, axis: (v) => String(v) },
  { key: 'peeCount', label: '小便', fmt: (v) => `${v} 次`, axis: (v) => String(v) },
  { key: 'diaperCount', label: '尿布', fmt: (v) => `${v} 次`, axis: (v) => String(v) },
  { key: 'sleepMinutes', label: '睡眠', fmt: formatDuration, axis: (v) => (v >= 60 ? (v / 60).toFixed(1) + 'h' : String(v)) },
];

function renderLineChart(points, m) {
  if (points.length < 2) return `<div class="empty-page">数据不足 2 天，暂无趋势</div>`;
  const W = 320, H = 180, padL = 30, padR = 10, padT = 14, padB = 24;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const maxV = Math.max(1, ...points.map((p) => p.value));
  const n = points.length;
  const xAt = (i) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v) => padT + innerH - (v / maxV) * innerH;
  const line = points.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`).join(' ');
  const area = `${padL},${(padT + innerH).toFixed(1)} ${line} ${(padL + innerW).toFixed(1)},${(padT + innerH).toFixed(1)}`;
  const dots = points.map((p, i) => `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(p.value).toFixed(1)}" r="2.5" fill="#4A90D9"/>`).join('');
  const fmtDate = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  const labelIdx = [0, Math.floor((n - 1) / 2), n - 1];
  const labels = labelIdx.map((i) => `<text x="${xAt(i).toFixed(1)}" y="${H - 7}" font-size="9" fill="#8AA0B6" text-anchor="middle">${fmtDate(points[i].date)}</text>`).join('');
  const yMax = `<text x="${padL - 4}" y="${padT + 7}" font-size="9" fill="#8AA0B6" text-anchor="end">${m.axis(maxV)}</text>`;
  const yZero = `<text x="${padL - 4}" y="${padT + innerH + 3}" font-size="9" fill="#8AA0B6" text-anchor="end">0</text>`;
  return `<svg class="trend-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <polygon points="${area}" fill="rgba(74,144,217,0.12)"/>
    <polyline points="${line}" fill="none" stroke="#4A90D9" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}${yMax}${yZero}${labels}
  </svg>`;
}

export function renderTrend(records, metric) {
  const cycles = listCycles(records).slice().reverse();
  const m = TREND_METRICS.find((x) => x.key === metric) || TREND_METRICS[0];
  const points = cycles.map((c) => ({ date: c.cycleStart, value: Number(c.stats[m.key]) || 0 }));
  const chips = TREND_METRICS.map(
    (x) => `<button class="metric-chip ${x.key === metric ? 'active' : ''}" data-action="trend-metric" data-metric="${x.key}">${x.label}</button>`
  ).join('');
  const latest = points.length ? m.fmt(points[points.length - 1].value) : '—';
  return `
    <header class="topbar">
      <button class="link" data-action="history">‹ 返回</button>
      <div class="cycle-title">趋势</div>
    </header>
    <div class="metric-chips">${chips}</div>
    <div class="trend-card">
      <div class="trend-latest">最近一天 ${m.label}：<b>${latest}</b></div>
      ${renderLineChart(points, m)}
    </div>
  `;
}

export function renderLogin(registering) {
  return `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-icon">👶🍼</div>
        <h1>宝宝记录</h1>
        <p class="login-sub">${registering ? '创建一个全家共用的账号' : '登录后，多台手机共享同一份数据'}</p>
        <form class="login-form" data-action="${registering ? 'signup' : 'login'}">
          <input class="login-input" type="email" name="username" placeholder="邮箱" autocomplete="email" required>
          <input class="login-input" type="password" name="password" placeholder="密码" autocomplete="current-password" required>
          <button class="btn-primary" type="submit">${registering ? '注册并登录' : '登录'}</button>
        </form>
        <button class="link login-toggle" data-action="toggle-register">${registering ? '已有账号？点此登录' : '第一次使用？点此注册'}</button>
      </div>
    </div>
  `;
}

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

  body += `
      <label class="field"><span>备注（可选）</span>
        <textarea name="note" rows="2" placeholder="如：吐奶、大便偏稀、这次吃得好">${escapeHtml(r.note)}</textarea></label>`;

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
