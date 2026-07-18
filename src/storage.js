// src/storage.js — 本机数据（localStorage）读写、记录 CRUD、同步辅助
const KEY = 'baby_records_v1';
const TOMB_KEY = 'baby_tombstones_v1';

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

// 新增：标记为未同步（synced=false），待推送
export function addRecord(record) {
  const records = loadRecords();
  const now = new Date().toISOString();
  const full = {
    id: genId(),
    createdAt: now,
    updatedAt: now,
    synced: false,
    cloudObjectId: null,
    ...record,
  };
  records.push(full);
  saveRecords(records);
  return full;
}

// 更新：刷新 updatedAt 并标记为未同步
export function updateRecord(id, patch) {
  const records = loadRecords();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  records[idx] = {
    ...records[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
    synced: false,
  };
  saveRecords(records);
  return records[idx];
}

// 删除：若已上云，记入墓碑待云端删除；再从本机移除
export function deleteRecord(id) {
  const records = loadRecords();
  const rec = records.find((r) => r.id === id);
  if (rec && rec.cloudObjectId) addTombstone(rec.id, rec.cloudObjectId);
  saveRecords(records.filter((r) => r.id !== id));
}

export function getRecord(id) {
  return loadRecords().find((r) => r.id === id) || null;
}

export function getOpenSleep() {
  return loadRecords().find((r) => r.type === 'sleep' && !r.end) || null;
}

// —— 同步辅助 ——
export function getDirty() {
  return loadRecords().filter((r) => !r.synced);
}

export function markSynced(id, cloudObjectId, cloudUpdatedAt) {
  const records = loadRecords();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return;
  records[idx].synced = true;
  if (cloudObjectId) records[idx].cloudObjectId = cloudObjectId;
  if (cloudUpdatedAt) records[idx].updatedAt = cloudUpdatedAt;
  saveRecords(records);
}

export function upsertRecord(record) {
  const records = loadRecords();
  const idx = records.findIndex((r) => r.id === record.id);
  if (idx === -1) records.push(record);
  else records[idx] = record;
  saveRecords(records);
}

export function removeRecordById(id) {
  saveRecords(loadRecords().filter((r) => r.id !== id));
}

export function loadTombstones() {
  try {
    return JSON.parse(localStorage.getItem(TOMB_KEY) || '[]');
  } catch (e) {
    return [];
  }
}
function addTombstone(id, cloudObjectId) {
  const ts = loadTombstones();
  ts.push({ id, cloudObjectId });
  localStorage.setItem(TOMB_KEY, JSON.stringify(ts));
}
export function clearTombstones(list) {
  const remove = new Set((list || []).map((t) => t.cloudObjectId));
  const remain = loadTombstones().filter((t) => !remove.has(t.cloudObjectId));
  localStorage.setItem(TOMB_KEY, JSON.stringify(remain));
}
