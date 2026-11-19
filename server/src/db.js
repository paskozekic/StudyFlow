import { readFile } from 'node:fs/promises';
import pg from 'pg';

// DATE stupce vraćamo kao 'YYYY-MM-DD' umjesto JS Date objekta (izbjegava pomake vremenske zone).
pg.types.setTypeParser(1082, (value) => value);

// Početna dostupnost: radnim danima navečer, vikendom prijepodne i poslijepodne.
const DEFAULT_WINDOWS = [
  ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, start_time: '17:00', end_time: '20:00' })),
  { weekday: 6, start_time: '10:00', end_time: '13:00' },
  { weekday: 6, start_time: '16:00', end_time: '18:00' },
  { weekday: 0, start_time: '16:00', end_time: '19:00' },
];

function normalizeValue(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

function normalizeRow(row) {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, normalizeValue(v)]));
}

/**
 * Spaja se na PostgreSQL preko DATABASE_URL. Bez nje koristi bazu u memoriji (pg-mem)
 * kako bi se aplikacija mogla isprobati bez instalacije PostgreSQL-a.
 */
export async function createDb(connectionString = process.env.DATABASE_URL) {
  let pool;
  if (connectionString) {
    pool = new pg.Pool({ connectionString });
  } else {
    const { newDb } = await import('pg-mem');
    const { Pool } = newDb().adapters.createPg();
    pool = new Pool();
  }

  const db = {
    inMemory: !connectionString,
    async query(text, params = []) {
      const result = await pool.query(text, params);
      return { rowCount: result.rowCount, rows: result.rows.map(normalizeRow) };
    },
    close: () => pool.end(),
  };

  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  // Naredbe se dijele po ';' – komentari u shemi ga zato ne smiju sadržavati.
  const statements = schema
    .replace(/--.*$/gm, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await db.query(statement);
  }

  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM availability_windows');
  if (rows[0].n === 0) {
    for (const w of DEFAULT_WINDOWS) {
      await db.query('INSERT INTO availability_windows (weekday, start_time, end_time) VALUES ($1, $2, $3)', [
        w.weekday,
        w.start_time,
        w.end_time,
      ]);
    }
  }

  return db;
}
