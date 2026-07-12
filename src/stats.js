// stats.js — 喂养周期划分、统计聚合、时间格式化
// 周期定义：当天 08:00 → 次日 08:00（本地时区），共 24 小时。

const CYCLE_HOUR = 8;

// 返回某时间所属周期的开始时刻（当天 08:00，或早于当天 08:00 时为前一天 08:00）
export function cycleStartOf(date) {
  const d = new Date(date);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), CYCLE_HOUR, 0, 0, 0);
  if (d < start) start.setDate(start.getDate() - 1);
  return start;
}

export function currentCycleStart() {
  return cycleStartOf(new Date());
}

// 筛选属于某周期 [cycleStart, cycleStart+24h) 的记录
export function recordsInCycle(records, cycleStart) {
  const start = new Date(cycleStart);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return records
    .filter((r) => {
      const rs = new Date(r.start);
      return rs >= start && rs < end;
    })
    .sort((a, b) => new Date(b.start) - new Date(a.start));
}

// 聚合统计：母乳时长、配方奶量、大便/小便/尿布次数、睡眠时长
export function computeStats(records) {
  let breastMinutes = 0;
  let formulaMl = 0;
  let poopCount = 0;
  let peeCount = 0;
  let diaperCount = 0;
  let sleepMinutes = 0;

  for (const r of records) {
    if (r.type === 'feeding') {
      if (typeof r.breastMinutes === 'number') breastMinutes += r.breastMinutes;
      if (typeof r.formulaMl === 'number') formulaMl += r.formulaMl;
    } else if (r.type === 'diaper') {
      diaperCount += 1;
      if (r.poop === true) poopCount += 1;
      if (r.pee === true) peeCount += 1;
    } else if (r.type === 'sleep' && r.end) {
      sleepMinutes += Math.max(0, (new Date(r.end) - new Date(r.start)) / 60000);
    }
  }

  return { breastMinutes, formulaMl, poopCount, peeCount, diaperCount, sleepMinutes };
}

// 列出所有周期（含当前），按开始时间倒序；每个周期含其记录与统计
export function listCycles(records) {
  const map = new Map();
  for (const r of records) {
    const cs = cycleStartOf(new Date(r.start));
    const key = cs.getTime().toString();
    if (!map.has(key)) map.set(key, { cycleStart: cs, records: [] });
    map.get(key).records.push(r);
  }
  const cycles = [...map.values()].map((c) => {
    c.records.sort((a, b) => new Date(b.start) - new Date(a.start));
    c.stats = computeStats(c.records);
    return c;
  });
  cycles.sort((a, b) => b.cycleStart - a.cycleStart);
  return cycles;
}

// —— 格式化辅助 ——
export function formatTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatDateTime(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${formatTime(iso)}`;
}

export function formatDuration(minutes) {
  minutes = Math.round(minutes);
  if (minutes < 60) return `${minutes}分钟`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}小时${m}分` : `${h}小时`;
}

export function formatDateRange(cycleStart) {
  const s = new Date(cycleStart);
  const e = new Date(s.getTime() + 24 * 3600 * 1000);
  const fmt = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${fmt(s)} 08:00 – ${fmt(e)} 08:00`;
}
