export const TYPE_LABELS = { ispit: 'Ispit', kolokvij: 'Kolokvij', zadaca: 'Zadaća', projekt: 'Projekt' };
export const PRIORITY_LABELS = { 1: 'Nizak', 2: 'Srednji', 3: 'Visok' };
export const CATEGORY_LABELS = {
  predavanje: 'Predavanje',
  laboratorij: 'Laboratorij',
  ispit: 'Ispit',
  posao: 'Posao',
  obveza: 'Obveza',
  pauza: 'Pauza',
  put: 'Put',
  ostalo: 'Ostalo',
};

export function CourseDot({ color }) {
  return <span className="course-dot" style={{ background: color }} aria-hidden="true" />;
}

export function Loading() {
  return <p className="muted">Učitavanje…</p>;
}

export function ErrorMessage({ error }) {
  return <p className="error">Greška: {error.message}</p>;
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
