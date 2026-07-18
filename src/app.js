// app.js — 入口：登录态、视图路由、事件委托、记录操作、同步
import * as storage from './storage.js';
import * as cloud from './cloud.js';
import * as sync from './sync.js';
import { renderHome, renderHistory, renderCycleDetail, renderEditSheet, renderLogin } from './ui.js';
import { formatDuration } from './stats.js';

const app = document.getElementById('app');
let toastTimer = null;
let pollTimer = null;

const state = {
  view: 'home',
  cycleKey: null,
  editId: null,
  configured: false,
  loggedIn: false,
  registering: false,
};

function render() {
  // 已配置云服务但未登录 → 登录/注册页
  if (state.configured && !state.loggedIn) {
    app.innerHTML = renderLogin(state.registering);
    return;
  }
  const records = storage.loadRecords();
  const status = state.loggedIn ? sync.getStatus() : null;
  if (state.view === 'home') {
    app.innerHTML = renderHome(records, storage.getOpenSleep(), status);
  } else if (state.view === 'history') {
    app.innerHTML = renderHistory(records, status);
  } else if (state.view === 'cycleDetail') {
    app.innerHTML = renderCycleDetail(records, state.cycleKey, status);
  }

  if (state.editId) {
    const r = storage.getRecord(state.editId);
    if (r) {
      const wrap = document.createElement('div');
      wrap.innerHTML = renderEditSheet(r);
      app.appendChild(wrap.firstElementChild);
    } else {
      state.editId = null;
    }
  }
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// 同步状态变化 → 只更新顶栏 pill，不全量重渲染（避免打断编辑）
function updateSyncPills() {
  const s = sync.getStatus();
  const text = { idle: '☁ 已同步', syncing: '⟳ 同步中', offline: '✗ 离线', error: '⚠ 点此重试' }[s] || '';
  document.querySelectorAll('.sync-pill').forEach((el) => {
    el.className = 'sync-pill sync-' + s;
    el.textContent = text;
  });
}

// —— 三大记录快捷操作 ——
function quickFeeding() {
  storage.addRecord({ type: 'feeding', start: new Date().toISOString(), end: null, breastMinutes: null, formulaMl: null });
  toast(`已记录喂养 ${nowHHMM()}，稍后可补时长/奶量`);
  afterChange();
}
function quickDiaper() {
  storage.addRecord({ type: 'diaper', start: new Date().toISOString(), end: null, pee: null, poop: null });
  toast(`已记录尿布 ${nowHHMM()}，稍后可选择大小便`);
  afterChange();
}
function toggleSleep() {
  const open = storage.getOpenSleep();
  if (open) {
    const end = new Date().toISOString();
    storage.updateRecord(open.id, { end });
    const mins = (new Date(end) - new Date(open.start)) / 60000;
    toast(`睡眠结束，共 ${formatDuration(mins)}`);
  } else {
    storage.addRecord({ type: 'sleep', start: new Date().toISOString(), end: null });
    toast(`睡眠开始 ${nowHHMM()}`);
  }
  afterChange();
}

function afterChange() {
  render();
  if (state.loggedIn) sync.pushNow();
}

function saveEdit(form) {
  const id = form.dataset.id;
  const r = storage.getRecord(id);
  if (!r) return;
  const patch = {};
  const startVal = form.querySelector('[name=start]').value;
  if (startVal) patch.start = new Date(startVal).toISOString();

  if (r.type === 'feeding') {
    const bm = form.querySelector('[name=breastMinutes]').value;
    const fm = form.querySelector('[name=formulaMl]').value;
    patch.breastMinutes = bm === '' ? null : Number(bm);
    patch.formulaMl = fm === '' ? null : Number(fm);
  } else if (r.type === 'diaper') {
    patch.pee = form.querySelector('[name=pee]').checked;
    patch.poop = form.querySelector('[name=poop]').checked;
  } else if (r.type === 'sleep') {
    const endVal = form.querySelector('[name=end]').value;
    patch.end = endVal ? new Date(endVal).toISOString() : null;
  }

  storage.updateRecord(id, patch);
  state.editId = null;
  toast('已保存');
  afterChange();
}

function removeRecord(id) {
  if (!confirm('确定删除这条记录吗？')) return;
  storage.deleteRecord(id);
  state.editId = null;
  toast('已删除');
  afterChange();
}

async function doLogin(form) {
  const u = form.querySelector('[name=username]').value.trim();
  const p = form.querySelector('[name=password]').value;
  if (!u || !p) return;
  try {
    await cloud.login(u, p);
    state.loggedIn = true;
    await sync.sync(); // 迁移本机数据 + 拉取云端
    startPolling();
    render();
  } catch (e) {
    alert('登录失败：' + (e.message || '请检查用户名和密码'));
  }
}

// 第一台手机"注册"创建全家共用的账号；其它手机用同一账号"登录"
async function doSignup(form) {
  const u = form.querySelector('[name=username]').value.trim();
  const p = form.querySelector('[name=password]').value;
  if (!u || !p) return;
  if (p.length < 6) {
    alert('密码至少 6 位');
    return;
  }
  try {
    await cloud.signup(u, p);
    state.loggedIn = true;
    state.registering = false;
    await sync.sync();
    startPolling();
    render();
  } catch (e) {
    alert('注册失败：' + (e.message || '用户名可能已存在'));
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    const r = await sync.sync();
    if (r && r.changed && !state.editId) render();
  }, 30000);
}
function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function doRefresh() {
  await sync.sync();
  if (sync.getStatus() === 'error') {
    alert('同步失败：' + (sync.getLastError() || '未知错误'));
  }
  if (!state.editId) render();
}

// —— 事件委托 ——
app.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  switch (t.dataset.action) {
    case 'feeding':
      quickFeeding();
      break;
    case 'diaper':
      quickDiaper();
      break;
    case 'sleep':
      toggleSleep();
      break;
    case 'history':
      state.view = 'history';
      render();
      break;
    case 'home':
      state.view = 'home';
      state.cycleKey = null;
      render();
      break;
    case 'cycle':
      state.view = 'cycleDetail';
      state.cycleKey = t.dataset.key;
      render();
      break;
    case 'edit':
      state.editId = t.dataset.id;
      render();
      break;
    case 'close-edit':
      state.editId = null;
      render();
      break;
    case 'delete':
      removeRecord(t.dataset.id || state.editId);
      break;
    case 'logout':
      sync.logout();
      state.loggedIn = false;
      stopPolling();
      render();
      break;
    case 'refresh':
      await doRefresh();
      break;
    case 'toggle-register':
      state.registering = !state.registering;
      render();
      break;
  }
});

app.addEventListener('submit', (e) => {
  if (e.target.matches('[data-action="save-edit"]')) {
    e.preventDefault();
    saveEdit(e.target);
  } else if (e.target.matches('[data-action="login"]')) {
    e.preventDefault();
    doLogin(e.target);
  } else if (e.target.matches('[data-action="signup"]')) {
    e.preventDefault();
    doSignup(e.target);
  }
});

// 同步状态变化 → 更新 pill
sync.onStatus(() => updateSyncPills());

// 回到前台 / 网络恢复 → 同步
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.loggedIn) {
    sync.sync().then((r) => {
      if (r && r.changed && !state.editId) render();
    });
  }
});
window.addEventListener('online', () => {
  if (state.loggedIn) {
    sync.sync().then((r) => {
      if (r && r.changed && !state.editId) render();
    });
  }
});

// 启动
function init() {
  state.configured = cloud.isConfigured();
  state.loggedIn = state.configured && sync.isLoggedIn();
  render();
  if (state.loggedIn) {
    startPolling();
    sync.sync().then((r) => {
      if (r && r.changed && !state.editId) render();
    });
  }
}
init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}
