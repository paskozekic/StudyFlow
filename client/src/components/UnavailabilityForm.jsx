import { useState } from 'react';
import { api } from '../api.js';
import { WEEKDAYS_SHORT, addDays, formatHours, timeOf, todayISO, toMinutes, weekday } from '../dates.js';
import { CATEGORY_LABELS } from './common.jsx';

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function draftFrom(block, date, time) {
  if (block) {
    const wholeDay = timeOf(block.start_at) === '00:00' && block.end_at === `${addDays(block.start_at.slice(0, 10), 1)}T00:00`;
    return {
      date: block.start_at.slice(0, 10),
      start: timeOf(block.start_at),
      end: wholeDay ? '23:30' : timeOf(block.end_at),
      wholeDay,
      category: block.category,
      note: block.note ?? '',
    };
  }
  const day = date ?? todayISO();
  const start = time ?? '10:00';
  const endMin = Math.min(toMinutes(start) + 120, 23 * 60 + 30);
  return {
    date: day,
    start,
    end: `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`,
    wholeDay: false,
    category: 'predavanje',
    note: '',
  };
}

/** Datumi koje će ponavljanje stvoriti (isti izračun šalje i server). */
function repeatDates(from, until, days) {
  const out = [];
  if (!until || until < from) return out;
  for (let d = from; d <= until && out.length < 400; d = addDays(d, 1)) if (days.includes(weekday(d))) out.push(d);
  return out;
}

/** Vrijeme kad ne možeš učiti: predavanje, posao, put… Može se ponavljati po danima u tjednu. */
export function UnavailabilityForm({ block, date, time, onChange, notify, onClose }) {
  const [draft, setDraft] = useState(() => draftFrom(block, date, time));
  const [repeat, setRepeat] = useState(null); // { weekdays, until }
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const toggleRepeat = (on) =>
    setRepeat(on ? { weekdays: [weekday(draft.date)], until: addDays(draft.date, 27) } : null);
  const toggleDay = (d) =>
    setRepeat({
      ...repeat,
      weekdays: repeat.weekdays.includes(d) ? repeat.weekdays.filter((x) => x !== d) : [...repeat.weekdays, d],
    });

  const startAt = `${draft.date}T${draft.wholeDay ? '00:00' : draft.start}`;
  const endAt = draft.wholeDay ? `${addDays(draft.date, 1)}T00:00` : `${draft.date}T${draft.end}`;
  const dates = repeat ? repeatDates(draft.date, repeat.until, repeat.weekdays) : [draft.date];

  const problem = !draft.date
    ? 'Odaberi datum.'
    : !draft.wholeDay && toMinutes(draft.end) <= toMinutes(draft.start)
      ? 'Kraj mora biti nakon početka.'
      : repeat && !repeat.weekdays.length
        ? 'Odaberi barem jedan dan.'
        : repeat && !dates.length
          ? 'U tom razdoblju nema odabranih dana.'
          : null;

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const body = { start_at: startAt, end_at: endAt, category: draft.category, note: draft.note, repeat };
    try {
      const result = block ? await api.put(`/unavailability/${block.id}`, body) : await api.post('/unavailability', body);
      const lacking = result.warnings?.length;
      notify(
        lacking
          ? `Spremljeno. Za ${lacking} obvez(e) sada nema dovoljno vremena do roka.`
          : block
            ? 'Spremljeno – plan je preslagan.'
            : `Spremljeno (${result.created}) – plan je preslagan oko toga.`,
        lacking ? 'warn' : 'info',
      );
      onChange();
      onClose();
    } catch (err) {
      notify(err.message, 'error');
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.del(`/unavailability/${block.id}`);
      notify('Obrisano – to vrijeme je opet slobodno za učenje.');
      onChange();
      onClose();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const minutes = draft.wholeDay ? 0 : Math.max(0, toMinutes(draft.end) - toMinutes(draft.start));

  return (
    <form className="form" onSubmit={save}>
        <div className="form-row">
          <label>
            Što je?
            <select value={draft.category} onChange={set('category')}>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>
              Opis <span className="muted">(neobavezno)</span>
            </span>
            <input value={draft.note} onChange={set('note')} placeholder="npr. Anatomija – vježbe" />
          </label>
        </div>

        <div className="form-row form-row-3">
          <label>
            Datum
            <input type="date" value={draft.date} onChange={set('date')} required />
          </label>
          <label>
            Od
            <input type="time" step="900" value={draft.start} onChange={set('start')} disabled={draft.wholeDay} />
          </label>
          <label>
            Do
            <input type="time" step="900" value={draft.end} onChange={set('end')} disabled={draft.wholeDay} />
          </label>
        </div>

        <label className="check-row">
          <input type="checkbox" checked={draft.wholeDay} onChange={set('wholeDay')} />
          Cijeli dan
          {!draft.wholeDay && minutes > 0 && <span className="muted small"> · {formatHours(minutes / 60)}</span>}
        </label>

        {!block && (
          <div className="repeat">
            <label className="check-row">
              <input type="checkbox" checked={Boolean(repeat)} onChange={(e) => toggleRepeat(e.target.checked)} />
              Ponavljaj svaki tjedan
            </label>
            {repeat && (
              <>
                <div className="weekday-chips" role="group" aria-label="Dani ponavljanja">
                  {WEEK_ORDER.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={repeat.weekdays.includes(d) ? 'chip-toggle on' : 'chip-toggle'}
                      aria-pressed={repeat.weekdays.includes(d)}
                      onClick={() => toggleDay(d)}
                    >
                      {WEEKDAYS_SHORT[d]}
                    </button>
                  ))}
                </div>
                <label>
                  Do datuma
                  <input
                    type="date"
                    value={repeat.until}
                    min={draft.date}
                    onChange={(e) => setRepeat({ ...repeat, until: e.target.value })}
                  />
                </label>
                {dates.length > 0 && <p className="muted small">Spremit će se {dates.length} zasebnih unosa.</p>}
              </>
            )}
          </div>
        )}

        {problem && (
          <p className="error small" role="alert">
            {problem}
          </p>
        )}

        <div className="modal-actions">
          {block && (
            <button type="button" className="btn btn-danger" onClick={remove}>
              Obriši
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Odustani
          </button>
          <button className="btn" disabled={saving || Boolean(problem)}>
            {saving ? 'Spremam…' : repeat ? `Spremi (${dates.length})` : 'Spremi'}
          </button>
        </div>
    </form>
  );
}
