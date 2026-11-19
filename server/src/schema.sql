CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#2E75B6'
);

CREATE TABLE IF NOT EXISTS obligations (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'ispit',
  due_date DATE NOT NULL,
  effort_hours REAL NOT NULL,
  priority INTEGER NOT NULL DEFAULT 2,
  material TEXT,
  source_uid TEXT
);

-- Tjedni prozori u kojima student može učiti (0 = nedjelja). Vremena su 'HH:MM', kraj može biti '24:00'.
CREATE TABLE IF NOT EXISTS availability_windows (
  id SERIAL PRIMARY KEY,
  weekday INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL
);

-- Konkretni zauzeti blokovi (predavanje, posao, put…) koji se oduzimaju od dostupnosti.
CREATE TABLE IF NOT EXISTS unavailability (
  id SERIAL PRIMARY KEY,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'obveza',
  note TEXT,
  source_uid TEXT
);
-- Termini učenja, start_at/end_at su lokalni 'YYYY-MM-DDTHH:MM'.
CREATE TABLE IF NOT EXISTS study_sessions (
  id SERIAL PRIMARY KEY,
  obligation_id INTEGER NOT NULL REFERENCES obligations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  hours REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned'
);
