import { addDays, diffDays } from './dates.js';
import { fromMinutes } from './freeTime.js';

const EPS = 1e-6;
const PRIORITY_WEIGHT = { 1: 1, 2: 1.5, 3: 2 };

const roundUp = (hours, slot) => Math.ceil(hours / slot - EPS) * slot;

/**
 * Raspoređuje preostale sate učenja u slobodne termine od `today` do dana prije roka.
 *
 * 1. Koliko sati po danu: svaka obveza dobiva svoj "potrebni dnevni tempo" (preostali sati /
 *    preostali dani). Kad slobodnog vremena nema dovoljno, prednost imaju obveze s većim
 *    tempom i prioritetom; ono što ne stane, drugi prolaz smješta u najranije slobodne dane.
 * 2. Kada u danu: sati se slažu u slobodne intervale redom hitnosti, u blokovima od najviše
 *    `maxBlockHours`, izmjenjujući obveze kako se jedan predmet ne bi učio satima bez prekida.
 *
 * @param {object} input
 * @param {{id:number, due_date:string, effort_hours:number, priority:number}[]} input.obligations
 * @param {Record<string, [number, number][]>} input.free  slobodni intervali po danu (minute od ponoći)
 * @param {Record<number, number>} [input.completedHours]  već odrađeni ili zadržani sati po obvezi
 * @param {string} input.today
 */
export function buildPlan({ obligations, free, completedHours = {}, today, slot = 0.5, maxBlockHours = 2 }) {
  const remaining = new Map();
  for (const o of obligations) {
    const left = Number(o.effort_hours) - (completedHours[o.id] ?? 0);
    if (left > EPS && o.due_date > today) remaining.set(o.id, left);
  }

  const active = obligations.filter((o) => remaining.has(o.id));
  if (active.length === 0) return { sessions: [], warnings: [] };

  const lastDay = addDays(active.reduce((max, o) => (o.due_date > max ? o.due_date : max), today), -1);
  const days = [];
  for (let day = today; day <= lastDay; day = addDays(day, 1)) days.push(day);

  const capacity = new Map(days.map((d) => [d, (free[d] ?? []).reduce((sum, [s, e]) => sum + (e - s) / 60, 0)]));
  const perDay = new Map(days.map((d) => [d, new Map()])); // dan -> (obveza -> sati), redom hitnosti

  const allocate = (day, id, hours) => {
    const map = perDay.get(day);
    map.set(id, (map.get(id) ?? 0) + hours);
    remaining.set(id, remaining.get(id) - hours);
    capacity.set(day, capacity.get(day) - hours);
  };

  // 1. prolaz: ravnomjeran tempo do roka
  for (const day of days) {
    const candidates = active
      .filter((o) => day < o.due_date && remaining.get(o.id) > EPS)
      .map((o) => {
        const rate = remaining.get(o.id) / diffDays(day, o.due_date);
        return { o, rate, score: rate * (PRIORITY_WEIGHT[o.priority] ?? 1) };
      })
      .sort((a, b) => b.score - a.score || a.o.due_date.localeCompare(b.o.due_date));

    for (const { o, rate } of candidates) {
      const hours = Math.min(roundUp(rate, slot), remaining.get(o.id), capacity.get(day));
      if (hours > EPS) allocate(day, o.id, hours);
    }
  }

  // 2. prolaz: ostatak u najranije slobodne termine prije roka (hitniji rok prvi)
  for (const o of [...active].sort((a, b) => a.due_date.localeCompare(b.due_date))) {
    for (const day of days) {
      if (remaining.get(o.id) <= EPS || day >= o.due_date) break;
      const hours = Math.min(remaining.get(o.id), capacity.get(day));
      if (hours > EPS) allocate(day, o.id, hours);
    }
  }

  const sessions = days.flatMap((day) => placeDay(day, perDay.get(day), free[day] ?? [], maxBlockHours * 60));

  const warnings = active
    .filter((o) => remaining.get(o.id) > EPS)
    .map((o) => ({ obligation_id: o.id, unscheduled_hours: Math.round(remaining.get(o.id) * 100) / 100 }));

  return { sessions, warnings };
}

/** Slaže dnevne sate u slobodne intervale; obveze se izmjenjuju u blokovima. */
function placeDay(day, allocations, intervals, maxBlockMin) {
  const queue = [...allocations].map(([id, hours]) => ({ id, left: Math.round(hours * 60) })).filter((q) => q.left > 0);
  const out = [];
  let i = 0;
  let cursor = intervals[0]?.[0];

  while (queue.length && i < intervals.length) {
    const item = queue.shift();
    const len = Math.min(item.left, maxBlockMin, intervals[i][1] - cursor);
    const last = out[out.length - 1];
    // isti predmet odmah nakon sebe (jedini preostali) – produži blok umjesto novog
    if (last && last.obligation_id === item.id && last.endMin === cursor) {
      last.endMin += len;
    } else {
      out.push({ obligation_id: item.id, startMin: cursor, endMin: cursor + len });
    }
    cursor += len;
    item.left -= len;
    if (item.left > 0) queue.push(item);
    if (cursor >= intervals[i][1]) {
      i += 1;
      cursor = intervals[i]?.[0];
    }
  }

  return out.map(({ obligation_id, startMin, endMin }) => ({
    obligation_id,
    date: day,
    start_at: `${day}T${fromMinutes(startMin)}`,
    end_at: `${day}T${fromMinutes(endMin)}`,
    hours: Math.round(((endMin - startMin) / 60) * 100) / 100,
  }));
}
