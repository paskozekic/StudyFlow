export const WEEKDAYS = ['Nedjelja', 'Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota'];
export const WEEKDAYS_SHORT = ['Ned', 'Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub'];

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const todayISO = () => toISO(new Date());

export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return toISO(new Date(y, m - 1, d + days));
}

export function weekday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function mondayOf(iso) {
  return addDays(iso, -((weekday(iso) + 6) % 7));
}

export function formatDate(iso, { withWeekday = false } = {}) {
  const [y, m, d] = iso.split('-').map(Number);
  const text = `${d}. ${m}. ${y}.`;
  return withWeekday ? `${WEEKDAYS[weekday(iso)]}, ${text}` : text;
}

export function formatHours(hours) {
  const h = Math.round(hours * 100) / 100;
  return `${String(h).replace('.', ',')} h`;
}

/** 'HH:MM' iz 'YYYY-MM-DDTHH:MM' */
export const timeOf = (dateTime) => dateTime.slice(11, 16);

export const toMinutes = (hm) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};

export const fromMinutes = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Dio raspona [start, end) koji pada u `day`, u minutama od ponoći; null ako ga nema. */
export function clipToDay(day, start, end) {
  const dayStart = `${day}T00:00`;
  const dayEnd = `${addDays(day, 1)}T00:00`;
  if (start >= dayEnd || end <= dayStart) return null;
  const s = start <= dayStart ? 0 : toMinutes(timeOf(start));
  const e = end >= dayEnd ? 1440 : toMinutes(timeOf(end));
  return e > s ? [s, e] : null;
}

/** npr. "pet 20. 11." */
export function shortDay(iso) {
  return `${WEEKDAYS_SHORT[weekday(iso)].toLowerCase()} ${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;
}

export function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function daysLeftLabel(days) {
  if (days < 0) return 'rok je prošao';
  if (days === 0) return 'danas';
  if (days === 1) return 'sutra';
  const lastTwo = days % 100;
  const last = days % 10;
  const word = last === 1 && lastTwo !== 11 ? 'dan' : 'dana';
  return `za ${days} ${word}`;
}
