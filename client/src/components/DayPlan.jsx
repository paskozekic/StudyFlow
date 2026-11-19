import { useState } from 'react';
import { useApi } from '../useApi.js';
import { formatHours, timeOf, todayISO } from '../dates.js';
import { setSessionStatus } from '../sessionActions.js';
import { CATEGORY_LABELS, CourseDot, Loading, TYPE_LABELS } from './common.jsx';

/** Rokovi, zauzeto vrijeme i termini učenja za jedan dan; termine označavaš ovdje. */
export default function DayPlan({ date, version, onChange, notify, open }) {
  const sessions = useApi(`/sessions?from=${date}&to=${date}`, version);
  const obligations = useApi('/obligations', version);
  const blocks = useApi(`/unavailability?from=${date}&to=${date}`, version);
  const [busy, setBusy] = useState(null);
  const today = todayISO();

  const setStatus = async (session, status) => {
    setBusy(session.id);
    await setSessionStatus(session, status, { notify, onChange });
    setBusy(null);
  };

  const deadlines = (obligations.data ?? []).filter((o) => o.due_date === date);
  const list = sessions.data ?? [];
  const total = list.filter((s) => s.status !== 'missed').reduce((sum, s) => sum + s.hours, 0);
  const done = list.filter((s) => s.status === 'done').reduce((sum, s) => sum + s.hours, 0);

  return (
    <>
      {deadlines.length > 0 && (
        <ul className="plain-list">
          {deadlines.map((o) => (
            <li key={o.id} className="deadline-row">
              <span>
                <CourseDot color={o.color} />
                <strong>⚑ {TYPE_LABELS[o.type]}: {o.title}</strong>
                <span className="muted small"> · {o.course_name}</span>
              </span>
              <button className="btn btn-ghost small" onClick={() => open('obligation', { obligation: o })}>
                Uredi
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="section-title">
        Učenje
        {total > 0 && (
          <span className="section-meta">
            {formatHours(done)} / {formatHours(total)}
          </span>
        )}
      </h3>
      {sessions.loading && !sessions.data ? (
        <Loading />
      ) : list.length === 0 ? (
        <p className="muted">Za ovaj dan nema planiranog učenja.</p>
      ) : (
        <ul className="session-list">
          {list.map((s) => {
            const canMark = date <= today;
            return (
              <li key={s.id} className={`session session-${s.status}`}>
                <span className="session-time">
                  {timeOf(s.start_at)}
                  <span className="muted">{timeOf(s.end_at)}</span>
                </span>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={s.status === 'done'}
                    disabled={!canMark || s.status === 'missed' || busy === s.id}
                    onChange={(e) => setStatus(s, e.target.checked ? 'done' : 'planned')}
                    aria-label={`Odrađeno: ${s.title}`}
                  />
                  <span className="session-body">
                    <span className="session-title">
                      <CourseDot color={s.color} />
                      {s.title}
                    </span>
                    <span className="muted small">
                      {s.course_name} · {formatHours(s.hours)}
                      {s.status === 'missed' && ' · nisi stigao, preslagano'}
                    </span>
                  </span>
                </label>
                {canMark && s.status === 'planned' && (
                  <button className="btn btn-ghost small" disabled={busy === s.id} onClick={() => setStatus(s, 'missed')}>
                    ✗ Nisam stigao
                  </button>
                )}
                {s.status === 'missed' && (
                  <button className="btn btn-ghost small" disabled={busy === s.id} onClick={() => setStatus(s, 'done')}>
                    Ipak jesam
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {date > today && list.length > 0 && (
        <p className="muted small">Termine možeš označiti kad dođe taj dan.</p>
      )}

      {(blocks.data ?? []).length > 0 && (
        <>
          <h3 className="section-title">Zauzeto</h3>
          <ul className="plain-list">
            {blocks.data.map((b) => (
              <li key={b.id}>
                <button className="busy-row" onClick={() => open('unavailability', { block: b })}>
                  <span className="session-time">
                    {b.start_at.slice(0, 10) < date ? '00:00' : timeOf(b.start_at)}
                    <span className="muted">{b.end_at.slice(0, 10) > date ? '24:00' : timeOf(b.end_at)}</span>
                  </span>
                  <span>
                    <strong>{CATEGORY_LABELS[b.category]}</strong>
                    {b.note && <span className="muted"> · {b.note}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={() => open('unavailability', { date })}>
          ⊘ Zauzeto
        </button>
        {date > today && (
          <button className="btn" onClick={() => open('obligation', { dueDate: date })}>
            + Rok na ovaj dan
          </button>
        )}
      </div>
    </>
  );
}
