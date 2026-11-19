import { useState } from 'react';
import { api } from '../api.js';
import { useApi } from '../useApi.js';
import { Loading } from './common.jsx';
import { COLORS } from './ObligationModal.jsx';
import Modal from './Modal.jsx';

export default function CoursesModal({ version, onChange, notify, onClose }) {
  const courses = useApi('/courses', version);
  const obligations = useApi('/obligations', version);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);

  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post('/courses', { name, color });
      setName('');
      setColor(COLORS[(courses.data.length + 1) % COLORS.length]);
      onChange();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const recolor = async (course, newColor) => {
    try {
      await api.put(`/courses/${course.id}`, { name: course.name, color: newColor });
      onChange();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const remove = async (course) => {
    const count = (obligations.data ?? []).filter((o) => o.course_id === course.id).length;
    const message = count
      ? `Obrisati kolegij „${course.name}” i ${count} povezan(ih) obvez(a)?`
      : `Obrisati kolegij „${course.name}”?`;
    if (!window.confirm(message)) return;
    try {
      await api.del(`/courses/${course.id}`);
      onChange();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <Modal title="Kolegiji" onClose={onClose}>
      <form className="inline-form" onSubmit={add}>
        <input aria-label="Naziv kolegija" placeholder="Novi kolegij" value={name} onChange={(e) => setName(e.target.value)} required />
        <input aria-label="Boja" type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <button className="btn">Dodaj</button>
      </form>

      {!courses.data ? (
        <Loading />
      ) : courses.data.length === 0 ? (
        <p className="muted">Još nema kolegija.</p>
      ) : (
        <ul className="plain-list">
          {courses.data.map((c) => (
            <li key={c.id} className="list-row course-row">
              <input
                type="color"
                value={c.color}
                onChange={(e) => recolor(c, e.target.value)}
                aria-label={`Boja kolegija ${c.name}`}
              />
              <strong>{c.name}</strong>
              <button className="btn btn-ghost small" onClick={() => remove(c)}>
                Obriši
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
