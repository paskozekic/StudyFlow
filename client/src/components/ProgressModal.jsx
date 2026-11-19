import { useApi } from '../useApi.js';
import { daysLeftLabel, formatHours } from '../dates.js';
import { CourseDot, Loading } from './common.jsx';
import Modal from './Modal.jsx';

const STATE_LABELS = {
  spreman: { text: 'Spreman', cls: 'tag-ok' },
  'na-putu': { text: 'Na dobrom putu', cls: 'tag-info' },
  'nedovoljno-vremena': { text: 'Nedovoljno vremena', cls: 'tag-warn' },
  proslo: { text: 'Rok je prošao', cls: '' },
};

export default function ProgressModal({ version, onClose }) {
  const { data } = useApi('/progress', version);

  return (
    <Modal title="Napredak" onClose={onClose} size="wide">
      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="stats">
            <div className="stat">
              <span className="stat-value">{data.summary.readiness}%</span>
              <span className="muted small">pripremljenost</span>
            </div>
            <div className="stat">
              <span className="stat-value">{formatHours(data.summary.done_hours)}</span>
              <span className="muted small">od {formatHours(data.summary.effort_hours)}</span>
            </div>
            <div className={data.summary.at_risk ? 'stat stat-warn' : 'stat'}>
              <span className="stat-value">{data.summary.at_risk}</span>
              <span className="muted small">u riziku</span>
            </div>
          </div>

          {data.items.length === 0 ? (
            <p className="muted">Napredak će se prikazati kad dodaš obveze.</p>
          ) : (
            <>
              <div className="legend small">
                <span><i className="lg lg-done" /> odrađeno</span>
                <span><i className="lg lg-planned" /> planirano</span>
                <span><i className="lg lg-missing" /> nedostaje vremena</span>
              </div>
              <ul className="progress-list">
                {[...data.items].sort((a, b) => (a.days_left < 0) - (b.days_left < 0)).map((i) => {
                  const pct = (h) => `${Math.min(100, (h / i.effort_hours) * 100)}%`;
                  const state = STATE_LABELS[i.state];
                  return (
                    <li key={i.id}>
                      <div className="progress-head">
                        <span>
                          <CourseDot color={i.color} />
                          <strong>{i.title}</strong> <span className="muted small">· {daysLeftLabel(i.days_left)}</span>
                        </span>
                        <span className={`tag ${state.cls}`}>{state.text}</span>
                      </div>
                      <div className="bar" role="img" aria-label={`Odrađeno ${i.readiness}%`}>
                        <span className="bar-done" style={{ width: pct(i.done_hours) }} />
                        <span className="bar-planned" style={{ width: pct(i.planned_hours) }} />
                        <span className="bar-missing" style={{ width: pct(i.unscheduled_hours) }} />
                      </div>
                      <div className="muted small">
                        {i.readiness}% · {formatHours(i.done_hours)} / {formatHours(i.effort_hours)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
