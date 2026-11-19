import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApi } from '../useApi.js';
import { WEEKDAYS, formatHours, fromMinutes, toMinutes } from '../dates.js';
import { Loading } from './common.jsx';

const ORDER = [1, 2, 3, 4, 5, 6, 0]; // od ponedjeljka
const GROUPS = [
  { label: 'Radni dani', days: [1, 2, 3, 4, 5] },
  { label: 'Vikend', days: [6, 0] },
  { label: 'Svi dani', days: ORDER },
];

/** Slobodno i zauzeto vrijeme koriste isti obrazac; razlikuju se samo tekstovi i boja. */
const KINDS = {
  free: {
    endpoint: '/availability',
    empty: 'Ne učim',
    hint: 'Isti slobodni termini za više dana odjednom',
    template: [
      { start_time: '09:00', end_time: '12:00' },
      { start_time: '15:00', end_time: '20:00' },
    ],
    total: 'Tjedno za učenje',
    saved: 'Spremljeno – plan je složen u nove termine.',
  },
  busy: {
    endpoint: '/busy',
    empty: 'Nije zauzeto',
    hint: 'Isto zauzeto vrijeme (npr. predavanja, posao) za više dana odjednom',
    template: [{ start_time: '10:00', end_time: '12:00' }],
    total: 'Tjedno zauzeto',
    saved: 'Spremljeno – učenje je maknuto iz zauzetih sati.',
  },
};

const hoursOf = (ranges) =>
  ranges.reduce((sum, r) => sum + Math.max(0, toMinutes(r.end_time) - toMinutes(r.start_time)) / 60, 0);
const isBad = (r) => toMinutes(r.end_time) <= toMinutes(r.start_time);

/** Novi termin nakon zadnjeg u popisu (sat poslije, 2 h). */
function nextRange(ranges) {
  const last = ranges[ranges.length - 1];
  const start = last ? Math.min(toMinutes(last.end_time) + 60, 22 * 60) : 9 * 60;
  return { start_time: fromMinutes(start), end_time: fromMinutes(Math.min(start + 120, 23 * 60 + 30)) };
}

/** Popis termina od–do s dodavanjem i brisanjem. */
function RangeList({ ranges, onChange, label, emptyText }) {
  const set = (i, key, value) => onChange(ranges.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  return (
    <div className="window-ranges">
      {ranges.length === 0 && emptyText && <span className="muted small">{emptyText}</span>}
      {ranges.map((r, i) => (
        <span key={i} className={isBad(r) ? 'range invalid' : 'range'}>
          <input
            type="time"
            step="1800"
            value={r.start_time}
            onChange={(e) => set(i, 'start_time', e.target.value)}
            aria-label={`${label} od`}
            required
          />
          <span aria-hidden="true">–</span>
          <input
            type="time"
            step="1800"
            value={r.end_time}
            onChange={(e) => set(i, 'end_time', e.target.value)}
            aria-label={`${label} do`}
            required
          />
          <button
            type="button"
            className="icon-btn small"
            onClick={() => onChange(ranges.filter((_, j) => j !== i))}
            aria-label="Ukloni termin"
          >
            ×
          </button>
        </span>
      ))}
      <button type="button" className="btn btn-ghost small" onClick={() => onChange([...ranges, nextRange(ranges)])}>
        + termin
      </button>
    </div>
  );
}

/**
 * Tjedni termini po danima: kad možeš učiti (`kind="free"`) ili kad si zauzet (`kind="busy"`).
 * Oba načina imaju isti popis dana i isto brzo postavljanje za radne dane, vikend ili sve dane.
 */
export function WeeklyWindowsForm({ kind, version, onChange, notify, onClose }) {
  const cfg = KINDS[kind];
  const { data } = useApi(cfg.endpoint, version);
  const [byDay, setByDay] = useState(null); // weekday -> [{start_time, end_time}]
  const [template, setTemplate] = useState(cfg.template);
  const [applied, setApplied] = useState(null);
  const [quick, setQuick] = useState(false); // zaseban ekran za brzo postavljanje
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const grouped = Object.fromEntries(ORDER.map((d) => [d, []]));
    for (const w of data) grouped[w.weekday].push({ start_time: w.start_time, end_time: w.end_time });
    setByDay(grouped);
  }, [data]);

  if (!byDay) return <Loading />;

  const applyTo = (group) => {
    setByDay({ ...byDay, ...Object.fromEntries(group.days.map((d) => [d, template.map((r) => ({ ...r }))])) });
    setApplied(group.label);
    setQuick(false);
  };

  const templateOk = template.length > 0 && !template.some(isBad);
  const invalid = ORDER.some((d) => byDay[d].some(isBad));
  const total = ORDER.reduce((sum, d) => sum + hoursOf(byDay[d]), 0);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { warnings } = await api.put(cfg.endpoint, ORDER.flatMap((d) => byDay[d].map((r) => ({ weekday: d, ...r }))));
      notify(
        warnings.length ? `Spremljeno, ali za ${warnings.length} obvez(e) sada nema dovoljno vremena do roka.` : cfg.saved,
        warnings.length ? 'warn' : 'info',
      );
      onChange();
      onClose();
    } catch (err) {
      notify(err.message, 'error');
      setSaving(false);
    }
  };

  if (quick) {
    return (
      <div className={`form quick-screen kind-${kind}`}>
        <button type="button" className="back-btn" onClick={() => setQuick(false)}>
          ← Natrag na dane
        </button>
        <div>
          <h3 className="quick-title">⚡ Brzo postavljanje</h3>
          <p className="muted">
            Upiši jedan ili više termina (npr. 07:00–10:00 i 11:00–12:00) pa odaberi za koje ih dane postaviti. Postojeći
            termini tih dana se zamjenjuju.
          </p>
        </div>

        <div className="quick-set">
          <RangeList ranges={template} onChange={setTemplate} label="Brzo postavljanje" />
          <span className="muted small">{formatHours(hoursOf(template))} dnevno</span>
        </div>
        {!templateOk && <p className="error small">Dodaj barem jedan termin kojem je kraj nakon početka.</p>}

        <div className="quick-groups">
          {GROUPS.map((g) => (
            <button key={g.label} type="button" className="quick-group" disabled={!templateOk} onClick={() => applyTo(g)}>
              <strong>{g.label}</strong>
              <span className="small">{g.days.map((d) => WEEKDAYS[d].slice(0, 3)).join(' · ')}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <form className={`form kind-${kind}`} onSubmit={save}>
      <div className="quick-entry">
        <button type="button" className="btn btn-ghost" onClick={() => setQuick(true)}>
          ⚡ Brzo postavljanje
        </button>
        {applied ? (
          <span className="small applied" role="status">
            ✓ Postavljeno za: {applied.toLowerCase()}. Provjeri i spremi.
          </span>
        ) : (
          <span className="muted small">{cfg.hint}</span>
        )}
      </div>

      <div className="windows">
        {ORDER.map((day) => (
          <div key={day} className="window-day">
            <div className="window-day-name">
              <strong>{WEEKDAYS[day]}</strong>
              <span className="muted small">{formatHours(hoursOf(byDay[day]))}</span>
            </div>
            <RangeList
              ranges={byDay[day]}
              onChange={(next) => setByDay({ ...byDay, [day]: next })}
              label={WEEKDAYS[day]}
              emptyText={cfg.empty}
            />
          </div>
        ))}
      </div>

      {invalid && <p className="error small">Kraj termina mora biti nakon početka.</p>}

      <div className="modal-actions">
        <span className="muted">
          {cfg.total}: <strong>{formatHours(total)}</strong>
        </span>
        <span className="spacer" />
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Odustani
        </button>
        <button className="btn" disabled={saving || invalid}>
          {saving ? 'Spremam…' : 'Spremi'}
        </button>
      </div>
    </form>
  );
}
