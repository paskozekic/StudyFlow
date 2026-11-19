import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPlanService } from './planService.js';
import { addDays, diffDays, isISODate, weekday } from './dates.js';
import { isDateTime, isTime, toMinutes } from './freeTime.js';
import { ImportError, createImportService } from './importService.js';

const OBLIGATION_TYPES = ['ispit', 'kolokvij', 'zadaca', 'projekt'];
const SESSION_STATUSES = ['planned', 'done', 'missed'];
const UNAVAILABILITY_CATEGORIES = ['predavanje', 'laboratorij', 'ispit', 'posao', 'obveza', 'pauza', 'put', 'ostalo'];
const MAX_REPEAT_DAYS = 366;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const fail = (message) => {
  throw new HttpError(400, message);
};

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'Nije pronađeno');
  return id;
}

function parseCourse(body) {
  const name = String(body?.name ?? '').trim();
  const color = String(body?.color ?? '#2E75B6');
  if (!name) fail('Naziv kolegija je obavezan');
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) fail('Boja mora biti u obliku #RRGGBB');
  return { name, color };
}

function parseObligation(body) {
  const o = {
    course_id: Number(body?.course_id),
    title: String(body?.title ?? '').trim(),
    type: body?.type ?? 'ispit',
    due_date: body?.due_date,
    effort_hours: Number(body?.effort_hours),
    priority: Number(body?.priority ?? 2),
    material: body?.material ? String(body.material).trim() : null,
  };
  if (!Number.isInteger(o.course_id)) fail('Odaberi kolegij');
  if (!o.title) fail('Naziv obveze je obavezan');
  if (!OBLIGATION_TYPES.includes(o.type)) fail('Nepoznata vrsta obveze');
  if (!isISODate(o.due_date)) fail('Neispravan datum roka');
  if (!(o.effort_hours > 0 && o.effort_hours <= 500)) fail('Procjena sati mora biti između 0 i 500');
  if (![1, 2, 3].includes(o.priority)) fail('Prioritet mora biti 1, 2 ili 3');
  return o;
}

function parseWindows(body) {
  if (!Array.isArray(body) || body.length > 70) fail('Neispravan popis termina dostupnosti');
  return body.map((w) => {
    const window = { weekday: Number(w?.weekday), start_time: w?.start_time, end_time: w?.end_time };
    if (!Number.isInteger(window.weekday) || window.weekday < 0 || window.weekday > 6) fail('Neispravan dan u tjednu');
    if (!isTime(window.start_time) || !isTime(window.end_time)) fail('Vrijeme mora biti u obliku HH:MM');
    if (toMinutes(window.end_time) <= toMinutes(window.start_time)) fail('Kraj termina mora biti nakon početka');
    return window;
  });
}

/** Jedan zauzeti blok ili više njih kad je zadano ponavljanje (svaki se sprema zasebno). */
function parseUnavailability(body) {
  const block = {
    start_at: body?.start_at,
    end_at: body?.end_at,
    category: body?.category ?? 'obveza',
    note: body?.note ? String(body.note).trim() : null,
  };
  if (!isDateTime(block.start_at) || !isDateTime(block.end_at)) fail('Neispravan početak ili kraj');
  if (block.end_at <= block.start_at) fail('Kraj mora biti nakon početka');
  if (!UNAVAILABILITY_CATEGORIES.includes(block.category)) fail('Nepoznata vrsta zauzeća');

  const repeat = body?.repeat;
  if (!repeat) return [block];

  const weekdays = Array.isArray(repeat.weekdays) ? repeat.weekdays.map(Number) : [];
  const from = block.start_at.slice(0, 10);
  if (!weekdays.length || !weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) fail('Odaberi barem jedan dan');
  if (!isISODate(repeat.until) || repeat.until < from) fail('Datum kraja ponavljanja mora biti nakon početka');
  if (diffDays(from, repeat.until) > MAX_REPEAT_DAYS) fail('Ponavljanje može trajati najviše godinu dana');

  // Isto vrijeme na svaki odabrani dan; blok koji prelazi ponoć zadržava svoj pomak.
  const spanDays = diffDays(from, block.end_at.slice(0, 10));
  const occurrences = [];
  for (let d = from; d <= repeat.until; d = addDays(d, 1)) {
    if (!weekdays.includes(weekday(d))) continue;
    occurrences.push({
      ...block,
      start_at: `${d}${block.start_at.slice(10)}`,
      end_at: `${addDays(d, spanDays)}${block.end_at.slice(10)}`,
    });
  }
  if (!occurrences.length) fail('U odabranom razdoblju nema tih dana');
  return occurrences;
}

export function createApp(db, options = {}) {
  const planner = createPlanService(db, options);
  const importer = createImportService(db, planner);
  const app = express();
  app.use(express.json({ limit: '6mb' })); // .ics raspored cijele godine

  const api = express.Router();

  // --- Kolegiji ---
  api.get('/courses', async (_req, res) => {
    const { rows } = await db.query('SELECT * FROM courses ORDER BY name');
    res.json(rows);
  });

  api.post('/courses', async (req, res) => {
    const c = parseCourse(req.body);
    const { rows } = await db.query('INSERT INTO courses (name, color) VALUES ($1, $2) RETURNING *', [c.name, c.color]);
    res.status(201).json(rows[0]);
  });

  api.put('/courses/:id', async (req, res) => {
    const c = parseCourse(req.body);
    const { rows } = await db.query('UPDATE courses SET name = $1, color = $2 WHERE id = $3 RETURNING *', [
      c.name,
      c.color,
      parseId(req.params.id),
    ]);
    if (!rows[0]) throw new HttpError(404, 'Kolegij nije pronađen');
    res.json(rows[0]);
  });

  api.delete('/courses/:id', async (req, res) => {
    const id = parseId(req.params.id);
    // Brišemo eksplicitno kako ne bismo ovisili o podršci za ON DELETE CASCADE.
    await db.query(
      'DELETE FROM study_sessions WHERE obligation_id IN (SELECT id FROM obligations WHERE course_id = $1)',
      [id],
    );
    await db.query('DELETE FROM obligations WHERE course_id = $1', [id]);
    const { rowCount } = await db.query('DELETE FROM courses WHERE id = $1', [id]);
    if (!rowCount) throw new HttpError(404, 'Kolegij nije pronađen');
    await planner.replan();
    res.status(204).end();
  });

  // --- Obveze ---
  api.get('/obligations', async (_req, res) => {
    const { rows } = await db.query(
      `SELECT o.*, c.name AS course_name, c.color
       FROM obligations o JOIN courses c ON c.id = o.course_id
       ORDER BY o.due_date, o.id`,
    );
    res.json(rows);
  });

  const assertCourseExists = async (courseId) => {
    const { rows } = await db.query('SELECT id FROM courses WHERE id = $1', [courseId]);
    if (!rows[0]) fail('Kolegij ne postoji');
  };

  api.post('/obligations', async (req, res) => {
    const o = parseObligation(req.body);
    await assertCourseExists(o.course_id);
    const { rows } = await db.query(
      `INSERT INTO obligations (course_id, title, type, due_date, effort_hours, priority, material)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [o.course_id, o.title, o.type, o.due_date, o.effort_hours, o.priority, o.material],
    );
    const plan = await planner.replan();
    res.status(201).json({ obligation: rows[0], warnings: plan.warnings });
  });

  api.put('/obligations/:id', async (req, res) => {
    const o = parseObligation(req.body);
    await assertCourseExists(o.course_id);
    const { rows } = await db.query(
      `UPDATE obligations SET course_id = $1, title = $2, type = $3, due_date = $4,
         effort_hours = $5, priority = $6, material = $7
       WHERE id = $8 RETURNING *`,
      [o.course_id, o.title, o.type, o.due_date, o.effort_hours, o.priority, o.material, parseId(req.params.id)],
    );
    if (!rows[0]) throw new HttpError(404, 'Obveza nije pronađena');
    const plan = await planner.replan();
    res.json({ obligation: rows[0], warnings: plan.warnings });
  });

  api.delete('/obligations/:id', async (req, res) => {
    const id = parseId(req.params.id);
    await db.query('DELETE FROM study_sessions WHERE obligation_id = $1', [id]);
    const { rowCount } = await db.query('DELETE FROM obligations WHERE id = $1', [id]);
    if (!rowCount) throw new HttpError(404, 'Obveza nije pronađena');
    await planner.replan();
    res.status(204).end();
  });

  // --- Tjedni prozori: slobodno (/availability) i zauzeto (/busy) rade na isti način ---
  for (const [path, table] of [
    ['/availability', 'availability_windows'],
    ['/busy', 'busy_windows'],
  ]) {
    api.get(path, async (_req, res) => {
      res.json(await planner.getWindows(table));
    });

    api.put(path, async (req, res) => {
      const windows = parseWindows(req.body);
      await db.query(`DELETE FROM ${table}`);
      for (const w of windows) {
        await db.query(`INSERT INTO ${table} (weekday, start_time, end_time) VALUES ($1, $2, $3)`, [
          w.weekday,
          w.start_time,
          w.end_time,
        ]);
      }
      const plan = await planner.replan();
      res.json({ windows: await planner.getWindows(table), warnings: plan.warnings });
    });
  }

  // --- Nedostupnost: konkretni zauzeti blokovi ---
  api.get('/unavailability', async (req, res) => {
    const { from, to } = req.query;
    if (!isISODate(from) || !isISODate(to)) fail('Parametri from i to moraju biti datumi (YYYY-MM-DD)');
    const { rows } = await db.query(
      'SELECT * FROM unavailability WHERE end_at > $1 AND start_at < $2 ORDER BY start_at',
      [`${from}T00:00`, `${addDays(to, 1)}T00:00`],
    );
    res.json(rows);
  });

  api.post('/unavailability', async (req, res) => {
    const blocks = parseUnavailability(req.body);
    for (const b of blocks) {
      await db.query('INSERT INTO unavailability (start_at, end_at, category, note) VALUES ($1, $2, $3, $4)', [
        b.start_at,
        b.end_at,
        b.category,
        b.note,
      ]);
    }
    const plan = await planner.replan();
    res.status(201).json({ created: blocks.length, warnings: plan.warnings });
  });

  api.put('/unavailability/:id', async (req, res) => {
    const [b] = parseUnavailability({ ...req.body, repeat: undefined });
    const { rows } = await db.query(
      'UPDATE unavailability SET start_at = $1, end_at = $2, category = $3, note = $4 WHERE id = $5 RETURNING *',
      [b.start_at, b.end_at, b.category, b.note, parseId(req.params.id)],
    );
    if (!rows[0]) throw new HttpError(404, 'Zauzeće nije pronađeno');
    const plan = await planner.replan();
    res.json({ block: rows[0], warnings: plan.warnings });
  });

  api.delete('/unavailability/:id', async (req, res) => {
    const { rowCount } = await db.query('DELETE FROM unavailability WHERE id = $1', [parseId(req.params.id)]);
    if (!rowCount) throw new HttpError(404, 'Zauzeće nije pronađeno');
    await planner.replan();
    res.status(204).end();
  });

  // --- Plan učenja ---
  const SESSION_SELECT = `
    SELECT s.id, s.date, s.start_at, s.end_at, s.hours, s.status, s.obligation_id,
           o.title, o.type, o.due_date, c.name AS course_name, c.color
    FROM study_sessions s
    JOIN obligations o ON o.id = s.obligation_id
    JOIN courses c ON c.id = o.course_id`;
  const withNumbers = (rows) => rows.map((r) => ({ ...r, hours: Number(r.hours) }));

  api.get('/sessions', async (req, res) => {
    const { from, to } = req.query;
    if (!isISODate(from) || !isISODate(to)) fail('Parametri from i to moraju biti datumi (YYYY-MM-DD)');
    await planner.ensureFresh();
    const { rows } = await db.query(`${SESSION_SELECT} WHERE s.date >= $1 AND s.date <= $2 ORDER BY s.start_at, s.id`, [
      from,
      to,
    ]);
    res.json(withNumbers(rows));
  });

  api.patch('/sessions/:id', async (req, res) => {
    const { status } = req.body ?? {};
    if (!SESSION_STATUSES.includes(status)) fail('Nepoznat status');
    const id = parseId(req.params.id);
    const { rows: before } = await db.query('SELECT * FROM study_sessions WHERE id = $1', [id]);
    if (!before[0]) throw new HttpError(404, 'Termin nije pronađen');
    if (status !== 'planned' && before[0].date > planner.today()) fail('Budući termin još ne možeš označiti');

    const { rows } = await db.query('UPDATE study_sessions SET status = $1 WHERE id = $2 RETURNING *', [status, id]);

    // "Nisam stigao" (ili poništavanje toga) mijenja koliko je još ostalo – plan se odmah slaže iznova.
    let plan = null;
    if (status === 'missed' || before[0].status === 'missed') plan = await planner.replan();

    const { rows: next } = await db.query(
      `${SESSION_SELECT} WHERE s.obligation_id = $1 AND s.status = 'planned' AND s.start_at >= $2 ORDER BY s.start_at LIMIT 3`,
      [before[0].obligation_id, planner.now()],
    );
    res.json({
      session: rows[0],
      next: withNumbers(next),
      warning: plan?.warnings.find((w) => w.obligation_id === before[0].obligation_id) ?? null,
    });
  });

  // --- Uvoz FER kalendara (.ics) ---
  api.post('/import/ics/preview', async (req, res) => {
    res.json(await importer.preview(req.body ?? {}));
  });

  api.post('/import/ics', async (req, res) => {
    res.json(await importer.run(req.body ?? {}));
  });

  api.post('/plan/replan', async (_req, res) => {
    res.json(await planner.replan());
  });

  api.get('/progress', async (_req, res) => {
    await planner.ensureFresh();
    const today = planner.today();
    const { rows } = await db.query(
      `SELECT o.*, c.name AS course_name, c.color
       FROM obligations o JOIN courses c ON c.id = o.course_id
       ORDER BY o.due_date, o.id`,
    );
    const totals = await planner.getTotals();

    const items = rows.map((o) => {
      const effort = Number(o.effort_hours);
      const t = totals[o.id] ?? { done: 0, planned: 0, missed: 0 };
      const unscheduled = Math.max(0, Math.round((effort - t.done - t.planned) * 100) / 100);
      const daysLeft = diffDays(today, o.due_date);
      let state = 'na-putu';
      if (t.done >= effort - 1e-6) state = 'spreman';
      else if (daysLeft < 0) state = 'proslo';
      else if (unscheduled > 0) state = 'nedovoljno-vremena';
      return {
        ...o,
        effort_hours: effort,
        done_hours: t.done,
        planned_hours: t.planned,
        missed_hours: t.missed,
        unscheduled_hours: unscheduled,
        readiness: Math.min(100, Math.round((t.done / effort) * 100)),
        days_left: daysLeft,
        state,
      };
    });

    const upcoming = items.filter((i) => i.days_left >= 0);
    const effort = upcoming.reduce((s, i) => s + i.effort_hours, 0);
    const done = upcoming.reduce((s, i) => s + Math.min(i.done_hours, i.effort_hours), 0);
    res.json({
      today,
      items,
      summary: {
        effort_hours: effort,
        done_hours: done,
        readiness: effort ? Math.round((done / effort) * 100) : 0,
        at_risk: upcoming.filter((i) => i.state === 'nedovoljno-vremena').length,
      },
    });
  });

  app.use('/api', api);

  // U produkciji poslužujemo izgrađeni frontend.
  const dist = fileURLToPath(new URL('../../client/dist', import.meta.url));
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile('index.html', { root: dist }));
  }

  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof ImportError) return res.status(400).json({ error: err.message });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Datoteka je prevelika' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Neispravan JSON' });
    console.error(err);
    res.status(500).json({ error: 'Greška na poslužitelju' });
  });

  return app;
}
