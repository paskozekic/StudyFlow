import { addDays } from './dates.js';

// Uvoz iCalendar (.ics) rasporeda s FER-a (www.fer.unizg.hr). FER izvozi svaki termin kao
// zaseban VEVENT (bez RRULE), s vremenom u zoni Europe/Zagreb i naslovom oblika
// "Kolegij - 10. predavanje (P01) [A-302]".

const TIME_ZONE = 'Europe/Zagreb';

/** Spaja "presavijene" retke (nastavak počinje razmakom ili tabom). */
function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

const unescape = (value) => value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();

/** Lokalno vrijeme u Zagrebu ('YYYY-MM-DDTHH:MM') za UTC trenutak. */
function zagrebLocal(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * ICS datum/vrijeme u lokalno 'YYYY-MM-DDTHH:MM'. Vrijeme sa TZID-om (FER uvijek šalje
 * Europe/Zagreb) uzima se kakvo jest, UTC ('Z') se pretvara u zagrebačko vrijeme.
 * @returns {{ value: string, allDay: boolean } | null}
 */
function parseDate(raw, params) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined || params.VALUE === 'DATE') return { value: `${y}-${mo}-${d}T00:00`, allDay: true };
  if (z) return { value: zagrebLocal(new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0)))), allDay: false };
  return { value: `${y}-${mo}-${d}T${h}:${mi}`, allDay: false };
}

/** Svi VEVENT-i iz .ics teksta: { uid, summary, location, start_at, end_at }. */
export function parseIcs(text) {
  if (typeof text !== 'string' || !text.includes('BEGIN:VCALENDAR')) {
    throw new Error('Datoteka nije iCalendar (.ics)');
  }
  const events = [];
  let current = null;

  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current?.start) {
        const start = current.start;
        let end = current.end ?? null;
        if (!end) end = start.allDay ? { value: `${addDays(start.value.slice(0, 10), 1)}T00:00` } : start;
        if (end.value > start.value) {
          events.push({
            uid: current.uid ?? `${start.value}|${current.summary ?? ''}`,
            summary: current.summary ?? '',
            location: current.location ?? '',
            start_at: start.value,
            end_at: end.value,
          });
        }
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const [name, ...paramParts] = line.slice(0, colon).split(';');
    const params = Object.fromEntries(paramParts.map((p) => p.split('=')).map(([k, v]) => [k.toUpperCase(), v]));
    const value = line.slice(colon + 1);

    switch (name.toUpperCase()) {
      case 'UID':
        current.uid = value.trim();
        break;
      case 'SUMMARY':
        current.summary = unescape(value);
        break;
      case 'LOCATION':
        current.location = unescape(value);
        break;
      case 'DTSTART':
        current.start = parseDate(value, params);
        break;
      case 'DTEND':
        current.end = parseDate(value, params);
        break;
    }
  }
  return events;
}

const EXAM = /(međuispit|meduispit|ispit|pismeni|usmeni|kolokvij|blic)/i;

/**
 * Razvrstava FER termin: kolegij, vrsta zauzeća i je li to ispit.
 * "Paralelno programiranje - Završni ispit: Pismeni (A-111) [A-111]"
 *   → { course: 'Paralelno programiranje', label: 'Završni ispit: Pismeni', category: 'ispit', exam: {…} }
 */
export function classifyFerEvent(summary) {
  const withoutRoom = summary.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
  const dash = withoutRoom.indexOf(' - ');
  const course = dash > 0 ? withoutRoom.slice(0, dash).trim() : null;
  const label = (dash > 0 ? withoutRoom.slice(dash + 3) : withoutRoom).replace(/\s*\([^)]*\)\s*$/, '').trim();

  if (course && EXAM.test(label)) {
    const midterm = /međuispit|meduispit|kolokvij|blic/i.test(label);
    const final = /završni|zavrsni/i.test(label);
    return {
      course,
      label,
      category: 'ispit',
      exam: {
        type: midterm ? 'kolokvij' : 'ispit',
        priority: final ? 3 : 2,
        suggested_hours: midterm ? 12 : final ? 25 : 20,
      },
    };
  }
  let category = 'ostalo';
  if (/predavanje/i.test(label)) category = 'predavanje';
  else if (/laboratorij|labos|vježb|vjezb|auditorn/i.test(label)) category = 'laboratorij';
  else if (/seminar|prezentacij|konzultacij/i.test(withoutRoom)) category = 'obveza';
  return { course, label, category, exam: null };
}
