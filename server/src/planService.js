import { buildPlan } from './planner.js';
import { addDays, toISO } from './dates.js';
import { freeIntervals } from './freeTime.js';

/** Trenutno lokalno vrijeme kao 'YYYY-MM-DDTHH:MM'. */
function localNow() {
  const d = new Date();
  return `${toISO(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function createPlanService(db, { now = localNow } = {}) {
  let queue = Promise.resolve();
  // Preraspodjele se izvršavaju jedna za drugom da se planovi ne preklope.
  const serialized = (fn) => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  };

  const today = () => now().slice(0, 10);

  /** Tjedni prozori: `availability_windows` (slobodno) ili `busy_windows` (zauzeto). */
  async function getWindows(table = 'availability_windows') {
    const { rows } = await db.query(`SELECT weekday, start_time, end_time FROM ${table} ORDER BY weekday, start_time`);
    return rows;
  }

  /** Sati po obvezi i statusu: { [id]: { done, planned, missed } } */
  async function getTotals() {
    const { rows } = await db.query(
      'SELECT obligation_id, status, SUM(hours) AS hours FROM study_sessions GROUP BY obligation_id, status',
    );
    const totals = {};
    for (const r of rows) {
      totals[r.obligation_id] ??= { done: 0, planned: 0, missed: 0 };
      totals[r.obligation_id][r.status] = Number(r.hours);
    }
    return totals;
  }

  async function replanNow() {
    const moment = now();
    const day = moment.slice(0, 10);

    // Neodrađeni termini iz prethodnih dana postaju propušteni – njihovi sati se ponovno raspoređuju.
    await db.query("UPDATE study_sessions SET status = 'missed' WHERE status = 'planned' AND date < $1", [day]);
    // Termini koji su već počeli ostaju (student ih još može označiti); budući se slažu iznova.
    await db.query("DELETE FROM study_sessions WHERE status = 'planned' AND start_at >= $1", [moment]);

    const { rows: obligations } = await db.query('SELECT id, due_date, effort_hours, priority FROM obligations');
    if (obligations.length === 0) return { sessions: [], warnings: [] };

    // Zadržani današnji termini računaju se kao pokriveni dok ih student ne označi.
    const totals = await getTotals();
    const covered = Object.fromEntries(Object.entries(totals).map(([id, t]) => [id, t.done + t.planned]));

    const lastDue = obligations.reduce((max, o) => (o.due_date > max ? o.due_date : max), day);
    const days = [];
    for (let d = day; d < lastDue; d = addDays(d, 1)) days.push(d);

    const { rows: unavailable } = await db.query(
      'SELECT start_at, end_at FROM unavailability WHERE end_at > $1 AND start_at < $2',
      [`${day}T00:00`, `${lastDue}T00:00`],
    );
    // Odrađeni, propušteni i zadržani termini danas zauzimaju svoje vrijeme.
    const { rows: busy } = await db.query('SELECT start_at, end_at FROM study_sessions WHERE date >= $1', [day]);

    const free = freeIntervals({
      days,
      windows: await getWindows(),
      busyWindows: await getWindows('busy_windows'),
      blocked: [...unavailable, ...busy],
      now: moment,
    });

    const plan = buildPlan({
      obligations: obligations.map((o) => ({ ...o, effort_hours: Number(o.effort_hours) })),
      free,
      completedHours: covered,
      today: day,
    });

    for (const s of plan.sessions) {
      await db.query(
        'INSERT INTO study_sessions (obligation_id, date, start_at, end_at, hours) VALUES ($1, $2, $3, $4, $5)',
        [s.obligation_id, s.date, s.start_at, s.end_at, s.hours],
      );
    }
    return plan;
  }

  return {
    now,
    today,
    getWindows,
    getTotals,
    replan: () => serialized(replanNow),

    /** Preraspodijeli ako je prošao dan s neodrađenim terminima. */
    ensureFresh: () =>
      serialized(async () => {
        const { rows } = await db.query(
          "SELECT COUNT(*)::int AS n FROM study_sessions WHERE status = 'planned' AND date < $1",
          [today()],
        );
        if (rows[0].n > 0) await replanNow();
      }),
  };
}
