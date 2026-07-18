// src/sync.js — 本机 ↔ LeanCloud 同步编排
// 策略：本机 localStorage 为 UI 直接读写的源；改动后尽力推送，定期/回到前台拉取合并。
import * as storage from './storage.js';
import * as cloud from './cloud.js';

let status = 'idle'; // idle | syncing | offline | error
let lastError = '';
const listeners = new Set();

export function getStatus() {
  return status;
}
export function getLastError() {
  return lastError;
}
export function onStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function setStatus(s) {
  if (status !== s) {
    status = s;
    listeners.forEach((fn) => fn(s));
  }
}

export function isLoggedIn() {
  return !!cloud.loadSession();
}
export function logout() {
  cloud.clearSession();
  setStatus('idle');
}

// 云端对象 → 本地记录
function fromCloud(c) {
  return {
    id: c.localId || c.objectId,
    type: c.type,
    start: c.start,
    end: c.end || null,
    breastMinutes: c.breastMinutes ?? null,
    formulaMl: c.formulaMl ?? null,
    pee: c.pee ?? null,
    poop: c.poop ?? null,
    cloudObjectId: c.objectId,
    synced: true,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

// 本地记录 → 云端字段（不含本地专有字段）
function toCloud(r) {
  return {
    localId: r.id,
    type: r.type,
    start: r.start,
    end: r.end,
    breastMinutes: r.breastMinutes,
    formulaMl: r.formulaMl,
    pee: r.pee,
    poop: r.poop,
  };
}

// 合并云端记录到本地（纯逻辑，可单测）
// 返回 { toUpsert: 本地需要新增/覆盖的记录, toRemove: 本地需要删除的 id }
export function mergeCloudIntoLocal(localRecords, cloudRecords) {
  const toUpsert = [];
  const toRemove = [];
  const cloudObjectIds = new Set(cloudRecords.map((c) => c.objectId));

  for (const c of cloudRecords) {
    const lid = c.localId || c.objectId;
    const local = localRecords.find((r) => r.id === lid);
    if (!local) {
      toUpsert.push(fromCloud(c));
    } else {
      const cloudUp = new Date(c.updatedAt).getTime();
      const localUp = new Date(local.updatedAt).getTime();
      if (cloudUp > localUp) toUpsert.push(fromCloud(c));
    }
  }
  // 本地有 cloudObjectId 但云端已没有 → 被其他设备删除 → 本地也删
  for (const r of localRecords) {
    if (r.cloudObjectId && !cloudObjectIds.has(r.cloudObjectId)) {
      toRemove.push(r.id);
    }
  }
  return { toUpsert, toRemove };
}

// 推送本地未同步的记录（新增 / 修改）
async function pushDirty(session) {
  const dirty = storage.getDirty();
  for (const r of dirty) {
    const payload = toCloud(r);
    if (r.cloudObjectId) {
      const res = await cloud.update(session, r.cloudObjectId, payload);
      storage.markSynced(r.id, r.cloudObjectId, res.updatedAt);
    } else {
      const res = await cloud.create(session, payload);
      storage.markSynced(r.id, res.objectId, res.updatedAt);
    }
  }
  return dirty.length > 0;
}

// 完整同步：推送 → 删墓碑 → 拉取合并。返回 { changed }
export async function sync() {
  const session = cloud.loadSession();
  if (!session) return { changed: false };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setStatus('offline');
    return { changed: false };
  }
  setStatus('syncing');
  let changed = false;
  try {
    if (await pushDirty(session)) changed = true;

    const tombstones = storage.loadTombstones();
    if (tombstones.length) {
      for (const t of tombstones) {
        try {
          await cloud.remove(session, t.cloudObjectId);
        } catch (e) {
          /* 对端可能已删，忽略 */
        }
      }
      storage.clearTombstones(tombstones);
      changed = true;
    }

    const cloudRecords = await cloud.queryAll(session);
    const { toUpsert, toRemove } = mergeCloudIntoLocal(storage.loadRecords(), cloudRecords);
    if (toUpsert.length || toRemove.length) changed = true;
    for (const rec of toUpsert) storage.upsertRecord(rec);
    for (const id of toRemove) storage.removeRecordById(id);

    lastError = '';
    setStatus('idle');
    return { changed };
  } catch (e) {
    lastError = e.message || String(e);
    setStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error');
    return { changed };
  }
}

// 本地变更后立即尽力推送（不拉取，快速同步出去；失败下次 sync 重试）
export async function pushNow() {
  const session = cloud.loadSession();
  if (!session) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setStatus('offline');
    return;
  }
  setStatus('syncing');
  try {
    await pushDirty(session);
    lastError = '';
    setStatus('idle');
  } catch (e) {
    lastError = e.message || String(e);
    setStatus('error');
  }
}
