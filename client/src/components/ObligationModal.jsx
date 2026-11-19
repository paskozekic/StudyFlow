import { useState } from 'react';
import { api } from '../api.js';
import { useApi } from '../useApi.js';
import { addDays, formatHours, todayISO } from '../dates.js';
import { Loading, PRIORITY_LABELS, TYPE_LABELS } from './common.jsx';
import Modal from './Modal.jsx';

export const COLORS = ['#2E75B6', '#ED7D31', '#70AD47', '#7B4FB8', '#C0392B', '#1F4E79', '#D4A017', '#16A085'];
const NEW_COURSE = 'new';

export default function ObligationModal({ obligation, dueDate, version, onChange, notify, onClose }) {
  const courses = useApi('/courses', version);
  const editing = Boolean(obligation);

  return (
    <Modal title={editing ? 'Uredi obvezu' : 'Nova obveza'} onClose={onClose}>
      {!courses.data ? (
        <Loading />
      ) : (
        <ObligationForm
          courses={courses.data}
          obligation={obligation}
          dueDate={dueDate}
          onChange={onChange}
          notify={notify}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

function ObligationForm({ courses, obligation, dueDate, onChange, notify, onClose }) {
  const today = todayISO();
  const [form, setForm] = useState(() =>
    obligation
      ? { ...obligation, material: obligation.material ?? '' }
      : {
          course_id: courses[0]?.id ?? NEW_COURSE,
          title: '',
          type: 'ispit',
          due_date: dueDate ?? addDays(today, 14),
          effort_hours: 10,
          priority: 2,
          material: '',
        },
  );
  const [newCourse, setNewCourse] = useState({ name: '', color: COLORS[courses.length % COLORS.length] });
  const [saving, setSaving] = useState(false);
  const [showMore] = useState(() => Boolean(obligation && (obligation.priority !== 2 || obligation.material)));

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm({ ...form, [key]: e.target.value }),
  });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      let courseId = form.course_id;
      if (courseId === NEW_COURSE) courseId = (await api.post('/courses', newCourse)).id;
      const body = {
        ...form,
        course_id: Number(courseId),
        effort_hours: Number(form.effort_hours),
        priority: Number(form.priority),
      };
      const result = obligation ? await api.put(`/obligations/${obligation.id}`, body) : await api.post('/obligations', body);
      const warning = result.warnings.find((w) => w.obligation_id === result.obligation.id);
      notify(
        warning
          ? `Spremljeno, ali do roka nedostaje ${formatHours(warning.unscheduled_hours)} vremena za učenje.`
          : 'Spremljeno – plan je ažuriran.',
        warning ? 'warn' : 'info',
      );
      onChange();
      onClose();
    } catch (err) {
      notify(err.message, 'error');
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Obrisati obvezu „${obligation.title}”?`)) return;
    try {
      await api.del(`/obligations/${obligation.id}`);
      onChange();
      onClose();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <form className="form" onSubmit={save}>
      <label>
        Što učiš?
        <input {...field('title')} placeholder="npr. Prvi kolokvij" required autoFocus />
      </label>

      <div className="form-row">
        <label>
          Kolegij
          <select {...field('course_id')}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NEW_COURSE}>+ Novi kolegij…</option>
          </select>
        </label>
        <label>
          Vrsta
          <select {...field('type')}>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {String(form.course_id) === NEW_COURSE && (
        <div className="new-course">
          <label>
            Naziv novog kolegija
            <input
              value={newCourse.name}
              onChange={(e) => setNewCourse({ ...newCourse, name: e.target.value })}
              placeholder="npr. Matematika 2"
              required
            />
          </label>
          <label>
            Boja
            <input type="color" value={newCourse.color} onChange={(e) => setNewCourse({ ...newCourse, color: e.target.value })} />
          </label>
        </div>
      )}

      <div className="form-row">
        <label>
          Rok
          <input type="date" {...field('due_date')} min={obligation ? undefined : today} required />
        </label>
        <label>
          Koliko sati učenja?
          <input type="number" min="0.5" max="500" step="0.5" {...field('effort_hours')} required />
        </label>
      </div>

      <details className="more" open={showMore}>
        <summary>Više opcija</summary>
        <label>
          Prioritet
          <select {...field('priority')}>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Gradivo
          <textarea rows="2" {...field('material')} placeholder="npr. Poglavlja 1–5" />
        </label>
      </details>

      <div className="modal-actions">
        {obligation && (
          <button type="button" className="btn btn-danger" onClick={remove}>
            Obriši
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Odustani
        </button>
        <button className="btn" disabled={saving}>
          {saving ? 'Spremam…' : obligation ? 'Spremi' : 'Dodaj'}
        </button>
      </div>
    </form>
  );
}
