// storage.js — localStorage 读写与记录 CRUD
// 所有记录存在 localStorage 的 baby_records_v1 里，值为 JSON 数组。

const KEY = 'baby_records_v1';

export function loadRecords() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.error('读取记录失败', e);
    return [];
  }
}

export function saveRecords(records) {
  localStorage.setItem(KEY, JSON.stringify(records));
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// 新增一条记录，自动补 id / createdAt / updatedAt
export function addRecord(record) {
  const records = loadRecords();
  const now = new Date().toISOString();
  const full = { id: genId(), createdAt: now, updatedAt: now, ...record };
  records.push(full);
  saveRecords(records);
  return full;
}

// 用 patch 合并更新指定记录，刷新 updatedAt
export function updateRecord(id, patch) {
  const records = loadRecords();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  records[idx] = { ...records[idx], ...patch, updatedAt: new Date().toISOString() };
  saveRecords(records);
  return records[idx];
}

export function deleteRecord(id) {
  saveRecords(loadRecords().filter((r) => r.id !== id));
}

export function getRecord(id) {
  return loadRecords().find((r) => r.id === id) || null;
}

// 是否存在未结束的睡眠（同一时刻最多一条）
export function getOpenSleep() {
  return loadRecords().find((r) => r.type === 'sleep' && !r.end) || null;
}
