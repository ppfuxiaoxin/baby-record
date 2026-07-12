// app.js — 入口：视图路由、事件委托、记录操作
import {
  loadRecords,
  addRecord,
  updateRecord,
  deleteRecord,
  getRecord,
  getOpenSleep,
} from './storage.js';
import { renderHome, renderHistory, renderCycleDetail, renderEditSheet } from './ui.js';
import { formatDuration } from './stats.js';

const app = document.getElementById('app');
let toastTimer = null;

// view: home | history | cycleDetail；editId 非空时叠加编辑面板
const state = { view: 'home', cycleKey: null, editId: null };

function render() {
  const records = loadRecords();
  if (state.view === 'home') {
    app.innerHTML = renderHome(records, getOpenSleep());
  } else if (state.view === 'history') {
    app.innerHTML = renderHistory(records);
  } else if (state.view === 'cycleDetail') {
    app.innerHTML = renderCycleDetail(records, state.cycleKey);
  }

  if (state.editId) {
    const r = getRecord(state.editId);
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

// —— 三大记录的快捷操作 ——
function quickFeeding() {
  addRecord({
    type: 'feeding',
    start: new Date().toISOString(),
    end: null,
    breastMinutes: null,
    formulaMl: null,
  });
  toast(`已记录喂养 ${nowHHMM()}，稍后可补时长/奶量`);
  render();
}

function quickDiaper() {
  addRecord({
    type: 'diaper',
    start: new Date().toISOString(),
    end: null,
    pee: null,
    poop: null,
  });
  toast(`已记录尿布 ${nowHHMM()}，稍后可选择大小便`);
  render();
}

function toggleSleep() {
  const open = getOpenSleep();
  if (open) {
    const end = new Date().toISOString();
    updateRecord(open.id, { end });
    const mins = (new Date(end) - new Date(open.start)) / 60000;
    toast(`睡眠结束，共 ${formatDuration(mins)}`);
  } else {
    addRecord({ type: 'sleep', start: new Date().toISOString(), end: null });
    toast(`睡眠开始 ${nowHHMM()}`);
  }
  render();
}

// —— 编辑面板保存 ——
function saveEdit(form) {
  const id = form.dataset.id;
  const r = getRecord(id);
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

  updateRecord(id, patch);
  state.editId = null;
  toast('已保存');
  render();
}

function removeRecord(id) {
  if (!confirm('确定删除这条记录吗？')) return;
  deleteRecord(id);
  state.editId = null;
  toast('已删除');
  render();
}

// —— 事件委托 ——
app.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const action = t.dataset.action;
  switch (action) {
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
  }
});

app.addEventListener('submit', (e) => {
  if (e.target.matches('[data-action="save-edit"]')) {
    e.preventDefault();
    saveEdit(e.target);
  }
});

// 首次渲染
render();

// 注册 service worker，离线可用
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}
