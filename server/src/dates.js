// Datumi se svugdje prenose kao 'YYYY-MM-DD' (lokalni kalendarski dan).

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO() {
  return toISO(new Date());
}

export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Broj dana od `from` do `to` (to - from). */
export function diffDays(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** 0 = nedjelja … 6 = subota */
export function weekday(iso) {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

export function isISODate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}
