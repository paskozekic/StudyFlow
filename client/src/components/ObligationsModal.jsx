import { useApi } from '../useApi.js';
import { daysLeftLabel, formatDate, formatHours, todayISO } from '../dates.js';
import { CourseDot, Loading, TYPE_LABELS } from './common.jsx';
import Modal from './Modal.jsx';

export default function ObligationsModal({ version, open, onClose }) {
  const obligations = useApi('/obligations', version);
  const today = todayISO();

  return (
    <Modal title="Moje obveze" onClose={onClose}>
      {!obligations.data ? (
        <Loading />
      ) : obligations.data.length === 0 ? (
        <p className="muted">Još nema obveza.</p>
      ) : (
        <ul className="plain-list">
          {obligations.data.map((o) => {
            const days = Math.round((Date.parse(o.due_date) - Date.parse(today)) / 86_400_000);
            return (
              <li key={o.id} className={days < 0 ? 'list-row past' : 'list-row'}>
                <button className="row-button" onClick={() => open('obligation', { obligation: o })}>
                  <span className="row-main">
                    <CourseDot color={o.color} />
                    <strong>{o.title}</strong>
                    <span className="tag">{TYPE_LABELS[o.type]}</span>
                  </span>
                  <span className="muted small">
                    {o.course_name} · {formatDate(o.due_date)} ({daysLeftLabel(days)}) · {formatHours(Number(o.effort_hours))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="modal-actions">
        <button className="btn" onClick={() => open('obligation')}>
          + Nova obveza
        </button>
      </div>
    </Modal>
  );
}
