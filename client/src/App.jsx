import { useState } from 'react';
import Calendar from './components/Calendar.jsx';
import DayModal from './components/DayModal.jsx';
import ObligationModal from './components/ObligationModal.jsx';
import ObligationsModal from './components/ObligationsModal.jsx';
import CoursesModal from './components/CoursesModal.jsx';
import ProgressModal from './components/ProgressModal.jsx';
import TimeModal from './components/TimeModal.jsx';
import SessionModal from './components/SessionModal.jsx';
import ImportModal from './components/ImportModal.jsx';
import { api } from './api.js';

const MODALS = {
  day: DayModal,
  obligation: ObligationModal,
  obligations: ObligationsModal,
  courses: CoursesModal,
  // slobodno i zauzeto dijele isti prozor; tip samo bira što je prvo otvoreno
  availability: (props) => <TimeModal mode="free" {...props} />,
  unavailability: (props) => <TimeModal mode="busy" {...props} />,
  session: SessionModal,
  progress: ProgressModal,
  import: ImportModal,
};

const MENU = [
  { type: 'import', label: 'FER raspored', icon: '⇩' },
  { type: 'obligations', label: 'Obveze', icon: '☰' },
  { type: 'courses', label: 'Kolegiji', icon: '◉' },
  { type: 'availability', label: 'Dostupnost', icon: '⏱' },
  { type: 'progress', label: 'Napredak', icon: '◔' },
];

export default function App() {
  const [version, setVersion] = useState(0);
  const [stack, setStack] = useState([]); // otvoreni prozori, zadnji je na vrhu
  const [notice, setNotice] = useState(null);
  const [replanning, setReplanning] = useState(false);

  const changed = () => setVersion((v) => v + 1);
  const open = (type, props = {}) => setStack((s) => [...s, { id: Date.now() + Math.random(), type, props }]);
  const close = (id) => setStack((s) => s.filter((m) => m.id !== id));

  const notify = (text, kind = 'info') => {
    setNotice({ text, kind });
    setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 4000);
  };

  const replan = async () => {
    setReplanning(true);
    try {
      const { warnings } = await api.post('/plan/replan');
      notify(
        warnings.length ? `Plan je preraspodijeljen. Za ${warnings.length} obvez(e) nema dovoljno vremena.` : 'Plan je preraspodijeljen.',
        warnings.length ? 'warn' : 'info',
      );
      changed();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setReplanning(false);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">S</span>
          <div>
            <h1>StudyFlow</h1>
            <p className="brand-sub">za studente FER-a</p>
          </div>
        </div>
        <nav className="toolbar" aria-label="Izbornik">
          <button className="btn btn-accent" onClick={() => open('obligation')}>
            <span aria-hidden="true">+</span> Nova obveza
          </button>
          {MENU.map((m) => (
            <button key={m.type} className="tool" onClick={() => open(m.type)}>
              <span className="tool-icon" aria-hidden="true">{m.icon}</span>
              <span className="tool-label">{m.label}</span>
            </button>
          ))}
          <button className="tool tool-replan" onClick={replan} disabled={replanning} title="Preraspodijeli plan">
            <span className="tool-icon" aria-hidden="true">↻</span>
            <span className="tool-label">Preraspodijeli</span>
          </button>
        </nav>
      </header>

      {notice && (
        <div className={`notice notice-${notice.kind}`} role="status">
          {notice.text}
        </div>
      )}

      <main className="content">
        <Calendar
          version={version}
          onDayClick={(date) => open('day', { date })}
          onChange={changed}
          notify={notify}
          open={open}
        />
      </main>

      {stack.map(({ id, type, props }) => {
        const Component = MODALS[type];
        return (
          <Component
            key={id}
            {...props}
            version={version}
            onChange={changed}
            notify={notify}
            open={open}
            onClose={() => close(id)}
          />
        );
      })}
    </div>
  );
}
