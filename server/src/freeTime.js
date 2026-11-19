import { addDays, weekday } from './dates.js';

// Vremena su lokalna: 'HH:MM' unutar dana, 'YYYY-MM-DDTHH:MM' za točan trenutak.
// '24:00' označava kraj dana (00:00 – 24:00 je cijeli dan).

export const toMinutes = (hm) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};

export const fromMinutes = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export const isTime = (value) => typeof value === 'string' && /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(value);

export const isDateTime = (value) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T(([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(value);

/** Dio raspona [start, end) koji pada u `day`, u minutama od ponoći; null ako ga nema. */
export function clipToDay(day, start, end) {
  const dayStart = `${day}T00:00`;
  const dayEnd = `${addDays(day, 1)}T00:00`;
  if (start >= dayEnd || end <= dayStart) return null;
  const s = start <= dayStart ? 0 : toMinutes(start.slice(11, 16));
  const e = end >= dayEnd ? 1440 : toMinutes(end.slice(11, 16));
  return e > s ? [s, e] : null;
}

function merge(intervals) {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

function subtract(intervals, [cs, ce]) {
  const out = [];
  for (const [s, e] of intervals) {
    if (ce <= s || cs >= e) {
      out.push([s, e]);
      continue;
    }
    if (cs > s) out.push([s, cs]);
    if (ce < e) out.push([ce, e]);
  }
  return out;
}

/**
 * Slobodno vrijeme po danima: tjedni prozori dostupnosti umanjeni za tjedno zauzeto vrijeme,
 * zauzete blokove (nedostupnost, već odrađeni ili zadržani termini) i vrijeme koje je danas
 * već prošlo. Rubovi se poravnavaju na mrežu od `slotMinutes`, pa učenje počinje u punih pola sata.
 *
 * @returns {Record<string, [number, number][]>} minute od ponoći
 */
export function freeIntervals({ days, windows, busyWindows = [], blocked = [], now, slotMinutes = 30 }) {
  const nowDay = now?.slice(0, 10);
  const nowMin = now ? toMinutes(now.slice(11, 16)) : 0;
  const result = {};

  for (const day of days) {
    if (nowDay && day < nowDay) {
      result[day] = [];
      continue;
    }
    let free = merge(
      windows.filter((w) => w.weekday === weekday(day)).map((w) => [toMinutes(w.start_time), toMinutes(w.end_time)]),
    );
    for (const w of busyWindows.filter((x) => x.weekday === weekday(day))) {
      free = subtract(free, [toMinutes(w.start_time), toMinutes(w.end_time)]);
    }
    for (const b of blocked) {
      const cut = clipToDay(day, b.start_at, b.end_at);
      if (cut) free = subtract(free, cut);
    }
    if (day === nowDay) free = subtract(free, [0, nowMin]);

    result[day] = free
      .map(([s, e]) => [Math.ceil(s / slotMinutes) * slotMinutes, Math.floor(e / slotMinutes) * slotMinutes])
      .filter(([s, e]) => e - s >= slotMinutes);
  }
  return result;
}
