import { useState } from 'react';
import { api } from '../api.js';
import { formatDate, timeOf } from '../dates.js';
import { CATEGORY_LABELS, Loading, TYPE_LABELS } from './common.jsx';
import Modal from './Modal.jsx';

const COUNT_WORDS = {
  predavanje: ['predavanje', 'predavanja'],
  laboratorij: ['laboratorij', 'laboratorija'],
  ispit: ['ispit', 'ispita'],
  obveza: ['ostala obveza', 'ostalih obveza'],
  ostalo: ['ostali termin', 'ostalih termina'],
};

/** 1 budući termin, 2–4 buduća termina, 5+ budućih termina */
function futureEvents(n) {
  const last = n % 10;
  const lastTwo = n % 100;
  if (last === 1 && lastTwo !== 11) return `${n} budući termin`;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${n} buduća termina`;
  return `${n} budućih termina`;
}

function countLabel(category, n) {
  const [one, many] = COUNT_WORDS[category] ?? [CATEGORY_LABELS[category], CATEGORY_LABELS[category]];
  return `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : many}`;
}

/** Uvoz rasporeda s FER-a iz .ics datoteke. */
export default function ImportModal({ onChange, notify, onClose }) {
  const [ics, setIcs] = useState(null); // { name, text }
  const [preview, setPreview] = useState(null);
  const [chosen, setChosen] = useState({}); // uid -> { on, hours }
  const [busy, setBusy] = useState(false);

  const source = () => ({ ics: ics?.text });

  const readFile = async (file) => {
    if (!file) return;
    setPreview(null);
    setIcs({ name: file.name, text: await file.text() });
  };

  const loadPreview = async () => {
    setBusy(true);
    try {
      const result = await api.post('/import/ics/preview', source());
      setPreview(result);
      setChosen(Object.fromEntries(result.exams.map((e) => [e.uid, { on: true, hours: e.effort_hours }])));
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    setBusy(true);
    try {
      const exams = Object.entries(chosen)
        .filter(([, c]) => c.on)
        .map(([uid, c]) => ({ uid, effort_hours: Number(c.hours) }));
      const result = await api.post('/import/ics', { ...source(), exams });
      const parts = [`${result.blocks} termina s faksa`];
      if (result.created) parts.push(`${result.created} novih ispita`);
      if (result.updated) parts.push(`${result.updated} ažuriranih`);
      notify(
        result.warnings.length
          ? `Uvezeno: ${parts.join(', ')}. Za ${result.warnings.length} ispit(a) nema dovoljno vremena – dodaj dostupnost.`
          : `Uvezeno: ${parts.join(', ')}. Plan je složen oko predavanja.`,
        result.warnings.length ? 'warn' : 'info',
      );
      onChange();
      onClose();
    } catch (e) {
      notify(e.message, 'error');
      setBusy(false);
    }
  };

  const canPreview = Boolean(ics);
  const selected = Object.values(chosen).filter((c) => c.on).length;

  return (
    <Modal title="Uvezi raspored s FER-a" onClose={onClose} size="wide">
      <div className="form">
        <p className="muted">
          Predavanja, laboratoriji i ispiti iz tvog FER kalendara postaju zauzeto vrijeme, a ispite možeš dodati kao
          obveze za koje StudyFlow planira učenje. Ponovni uvoz samo osvježi promjene.
        </p>

        <label
          className={ics ? 'dropzone has-file' : 'dropzone'}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            readFile(e.dataTransfer.files[0]);
          }}
        >
          <input type="file" accept=".ics,text/calendar" onChange={(e) => readFile(e.target.files[0])} />
          <strong>{ics ? ics.name : 'Odaberi ili povuci .ics datoteku'}</strong>
          <span className="muted small">Kalendar preuzet s FER weba (npr. mycal.ics)</span>
        </label>

        {!preview && (
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Odustani
            </button>
            <button type="button" className="btn" disabled={!canPreview || busy} onClick={loadPreview}>
              {busy ? 'Čitam…' : 'Pregledaj'}
            </button>
          </div>
        )}

        {busy && !preview && <Loading />}

        {preview && (
          <>
            <div className="import-summary">
              <strong>{futureEvents(preview.events)}</strong>
              <span className="muted">
                {Object.entries(preview.counts)
                  .map(([cat, n]) => countLabel(cat, n))
                  .join(' · ')}
              </span>
              {preview.courses.length > 0 && (
                <span className="muted small">Kolegiji: {preview.courses.join(', ')}</span>
              )}
            </div>

            <h3 className="section-title">Ispiti – za koje planirati učenje?</h3>
            {preview.exams.length === 0 ? (
              <p className="muted">U kalendaru nema nadolazećih ispita.</p>
            ) : (
              <ul className="plain-list">
                {preview.exams.map((e) => {
                  const c = chosen[e.uid];
                  return (
                    <li key={e.uid} className={c.on ? 'exam-row' : 'exam-row off'}>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={c.on}
                          onChange={(ev) => setChosen({ ...chosen, [e.uid]: { ...c, on: ev.target.checked } })}
                        />
                        <span className="session-body">
                          <span className="session-title">
                            {e.course}
                            <span className="tag">{TYPE_LABELS[e.type]}</span>
                            {e.imported && <span className="tag tag-ok">već uvezeno</span>}
                          </span>
                          <span className="muted small">
                            {e.title} · {formatDate(e.start_at.slice(0, 10), { withWeekday: true })} u {timeOf(e.start_at)}
                          </span>
                        </span>
                      </label>
                      <label className="hours-field">
                        <input
                          type="number"
                          min="1"
                          max="500"
                          step="1"
                          value={c.hours}
                          disabled={!c.on}
                          onChange={(ev) => setChosen({ ...chosen, [e.uid]: { ...c, hours: ev.target.value } })}
                          aria-label={`Sati učenja za ${e.course}`}
                        />
                        <span className="muted small">h učenja</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPreview(null)}>
                Natrag
              </button>
              <button type="button" className="btn" disabled={busy} onClick={runImport}>
                {busy ? 'Uvozim…' : selected ? `Uvezi (${selected} ispita)` : 'Uvezi samo raspored'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
