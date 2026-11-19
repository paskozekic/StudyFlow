import { useState } from 'react';
import { formatDate, formatHours, timeOf, todayISO } from '../dates.js';
import { setSessionStatus } from '../sessionActions.js';
import { CourseDot } from './common.jsx';
import Modal from './Modal.jsx';

const STATUS_TEXT = { planned: 'Planirano', done: 'Odrađeno', missed: 'Nisi stigao – preslagano' };

/** Jedan termin učenja: odradio sam / nisam stigao. */
export default function SessionModal({ session: s, onChange, notify, onClose }) {
  const [busy, setBusy] = useState(false);
  const canMark = s.date <= todayISO();

  const set = async (status) => {
    setBusy(true);
    if (await setSessionStatus(s, status, { notify, onChange })) onClose();
    else setBusy(false);
  };

  return (
    <Modal title={s.title} onClose={onClose}>
      <p className="session-meta">
        <CourseDot color={s.color} />
        {s.course_name}
      </p>
      <p>
        <strong>{formatDate(s.date, { withWeekday: true })}</strong>
        <br />
        {timeOf(s.start_at)} – {timeOf(s.end_at)} · {formatHours(s.hours)}
      </p>
      <p className="muted small">{STATUS_TEXT[s.status]}</p>

      <div className="modal-actions">
        {!canMark && <span className="muted small">Termin možeš označiti kad dođe njegov dan.</span>}
        {canMark && s.status === 'planned' && (
          <>
            <button className="btn btn-ghost" disabled={busy} onClick={() => set('missed')}>
              ✗ Nisam stigao
            </button>
            <button className="btn btn-ok" disabled={busy} onClick={() => set('done')}>
              ✓ Odradio sam
            </button>
          </>
        )}
        {s.status === 'done' && (
          <button className="btn btn-ghost" disabled={busy} onClick={() => set('planned')}>
            Poništi
          </button>
        )}
        {s.status === 'missed' && (
          <button className="btn btn-ok" disabled={busy} onClick={() => set('done')}>
            Ipak sam odradio
          </button>
        )}
      </div>
    </Modal>
  );
}
