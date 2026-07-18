// src/cloud.js — Supabase REST 客户端（纯 fetch，无 SDK）
// 对外接口与 sync.js 约定一致：login/signup/queryAll/create/update/remove + 会话存取。
import { LC } from './config.js';

const SESSION_KEY = 'sb_session_v1';
const TABLE = 'baby_record';

export function isConfigured() {
  return !!(
    LC.supabaseUrl &&
    LC.anonKey &&
    !String(LC.supabaseUrl).startsWith('https://YOUR_') &&
    !String(LC.anonKey).startsWith('YOUR_')
  );
}

function authHeaders(session) {
  const h = { apikey: LC.anonKey, 'Content-Type': 'application/json' };
  if (session && session.access_token) h['Authorization'] = 'Bearer ' + session.access_token;
  return h;
}

export function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch (e) {
    return null;
  }
}
export function saveSession(s) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function jwtSub(token) {
  try {
    let p = token.split('.')[1];
    p = p.replace(/-/g, '+').replace(/_/g, '/');
    while (p.length % 4) p += '=';
    return JSON.parse(atob(p)).sub;
  } catch (e) {
    return undefined;
  }
}

function toSession(data) {
  const id = (data.user && data.user.id) || jwtSub(data.access_token);
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    user: { id, email: data.user && data.user.email },
  };
}

// 用 refresh_token 换新的 access_token（Supabase 会轮换 refresh_token，故每次读最新的会话）
export async function refresh() {
  const session = loadSession();
  if (!session || !session.refresh_token) return null;
  try {
    const url = `${LC.supabaseUrl}/auth/v1/token?grant_type=refresh_token`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { apikey: LC.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!res.ok) {
      clearSession();
      return null;
    }
    const data = await res.json();
    const s = toSession(data);
    saveSession(s);
    return s;
  } catch (e) {
    clearSession();
    return null;
  }
}

// 通用请求：带 access_token；遇 401 自动刷新重试一次
async function request(url, { method = 'GET', body, allowRetry = true, headers = {} } = {}) {
  let session = loadSession();
  const doFetch = (s) =>
    fetch(url, {
      method,
      headers: { ...authHeaders(s), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
  let res = await doFetch(session);
  if (res.status === 401 && allowRetry && session && session.refresh_token) {
    const refreshed = await refresh();
    if (refreshed) res = await doFetch(refreshed);
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = (j && (j.message || j.error_description || j.error)) || msg;
    } catch (e) {}
    throw new Error(msg);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// 邮箱 + 密码登录
export async function login(email, password) {
  const url = `${LC.supabaseUrl}/auth/v1/token?grant_type=password`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { apikey: LC.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('邮箱或密码错误');
  const data = await res.json();
  const session = toSession(data);
  saveSession(session);
  return session;
}

// 注册（全家共用一个账号：第一台手机注册，其它手机用同一邮箱密码"登录"）
export async function signup(email, password) {
  const url = `${LC.supabaseUrl}/auth/v1/signup`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { apikey: LC.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    let msg = '注册失败';
    try {
      const j = await res.json();
      msg = (j && (j.error_description || j.message || j.error)) || msg;
    } catch (e) {}
    throw new Error(msg);
  }
  const data = await res.json();
  if (!data.access_token) {
    throw new Error('注册未返回登录态，请到 Supabase 后台 Authentication → Email 关掉「Confirm email」');
  }
  const session = toSession(data);
  saveSession(session);
  return session;
}

// 行 → sync.js 期望的归一形状
function fromRow(row) {
  return {
    objectId: row.local_id,
    localId: row.local_id,
    type: row.type,
    start: row.start,
    end: row.end_time || null,
    breastMinutes: row.breast_minutes ?? null,
    formulaMl: row.formula_ml ?? null,
    pee: row.pee ?? null,
    poop: row.poop ?? null,
    note: row.note ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// 拉取当前账号所有记录（RLS 自动只返回 owner = 当前用户的）
export async function queryAll() {
  const url = `${LC.supabaseUrl}/rest/v1/${TABLE}?select=*`;
  const data = await request(url);
  return (data || []).map(fromRow);
}

export async function create(session, payload) {
  const now = new Date().toISOString();
  const owner = (loadSession() || {}).user?.id;
  const row = {
    local_id: payload.localId,
    owner,
    type: payload.type,
    start: payload.start,
    end_time: payload.end,
    breast_minutes: payload.breastMinutes,
    formula_ml: payload.formulaMl,
    pee: payload.pee,
    poop: payload.poop,
    note: payload.note ?? null,
    created_at: now,
    updated_at: now,
  };
  const url = `${LC.supabaseUrl}/rest/v1/${TABLE}`;
  // upsert：若该 local_id 已存在（重复推送），改为更新，避免 409
  await request(url, { method: 'POST', body: row, headers: { Prefer: 'resolution=merge-duplicates' } });
  return { objectId: payload.localId, updatedAt: now };
}

export async function update(session, objectId, payload) {
  const now = new Date().toISOString();
  const row = {
    type: payload.type,
    start: payload.start,
    end_time: payload.end,
    breast_minutes: payload.breastMinutes,
    formula_ml: payload.formulaMl,
    pee: payload.pee,
    poop: payload.poop,
    note: payload.note ?? null,
    updated_at: now,
  };
  const url = `${LC.supabaseUrl}/rest/v1/${TABLE}?local_id=eq.${encodeURIComponent(objectId)}`;
  await request(url, { method: 'PATCH', body: row });
  return { updatedAt: now };
}

export async function remove(session, objectId) {
  const url = `${LC.supabaseUrl}/rest/v1/${TABLE}?local_id=eq.${encodeURIComponent(objectId)}`;
  await request(url, { method: 'DELETE' });
}
