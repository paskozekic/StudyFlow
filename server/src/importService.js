import { classifyFerEvent, parseIcs } from './ics.js';

const COURSE_COLORS = ['#2E75B6', '#ED7D31', '#70AD47', '#7B4FB8', '#C0392B', '#1F4E79', '#D4A017', '#16A085'];
const MAX_ICS_BYTES = 5_000_000;

export class ImportError extends Error {}

export function createImportService(db, planner) {
  function readSource({ ics }) {
    if (typeof ics !== 'string' || !ics.trim()) throw new ImportError('Odaberi .ics datoteku');
    if (ics.length > MAX_ICS_BYTES) throw new ImportError('Kalendar je prevelik');
    return ics;
  }

  /** Budući termini iz kalendara, razvrstani. */
  function analyse(text) {
    let events;
    try {
      events = parseIcs(text);
    } catch (e) {
      throw new ImportError(e.message);
    }
    const now = planner.now();
    const today = planner.today();
    return events
      .filter((e) => e.end_at > now)
      .map((e) => ({ ...e, ...classifyFerEvent(e.summary), isFutureExam: e.start_at.slice(0, 10) > today }));
  }

  async function existingByUid() {
    const { rows } = await db.query(
      'SELECT id, source_uid, effort_hours, title, due_date FROM obligations WHERE source_uid IS NOT NULL',
    );
    return new Map(rows.map((r) => [r.source_uid, r]));
  }

  return {
    /** Što bi uvoz napravio, bez spremanja. */
    async preview(body) {
      const text = readSource(body);
      const events = analyse(text);
      const existing = await existingByUid();

      const counts = {};
      for (const e of events) counts[e.category] = (counts[e.category] ?? 0) + 1;

      const exams = events
        .filter((e) => e.exam && e.isFutureExam)
        .sort((a, b) => a.start_at.localeCompare(b.start_at))
        .map((e) => {
          const known = existing.get(e.uid);
          return {
            uid: e.uid,
            course: e.course,
            title: e.label,
            type: e.exam.type,
            priority: e.exam.priority,
            start_at: e.start_at,
            location: e.location,
            effort_hours: known ? Number(known.effort_hours) : e.exam.suggested_hours,
            imported: Boolean(known),
          };
        });

      const courses = [...new Set(events.map((e) => e.course).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'hr'));
      return {
        events: events.length,
        counts,
        courses,
        exams,
        first: events.reduce((min, e) => (!min || e.start_at < min ? e.start_at : min), null),
        last: events.reduce((max, e) => (!max || e.end_at > max ? e.end_at : max), null),
      };
    },

    /**
     * Uvozi kalendar: svi budući termini postaju zauzeto vrijeme (prethodni uvoz se zamjenjuje),
     * a odabrani ispiti obveze s rokom na dan ispita. Kolegiji se stvaraju po potrebi.
     */
    async run(body) {
      const text = readSource(body);
      const events = analyse(text);
      const chosen = new Map(
        (Array.isArray(body.exams) ? body.exams : [])
          .filter((x) => x && typeof x.uid === 'string' && Number(x.effort_hours) > 0 && Number(x.effort_hours) <= 500)
          .map((x) => [x.uid, Number(x.effort_hours)]),
      );

      // Zauzeto vrijeme: buduće uvezene blokove zamijeni novima.
      await db.query('DELETE FROM unavailability WHERE source_uid IS NOT NULL AND end_at > $1', [planner.now()]);
      for (const e of events) {
        await db.query(
          'INSERT INTO unavailability (start_at, end_at, category, note, source_uid) VALUES ($1, $2, $3, $4, $5)',
          [e.start_at, e.end_at, e.category, [e.course, e.label].filter(Boolean).join(' – ') || e.summary, e.uid],
        );
      }

      // Kolegiji i ispiti.
      const { rows: courseRows } = await db.query('SELECT id, name FROM courses');
      const courseIds = new Map(courseRows.map((c) => [c.name.toLocaleLowerCase('hr'), c.id]));
      const courseFor = async (name) => {
        const key = name.toLocaleLowerCase('hr');
        if (!courseIds.has(key)) {
          const color = COURSE_COLORS[courseIds.size % COURSE_COLORS.length];
          const { rows } = await db.query('INSERT INTO courses (name, color) VALUES ($1, $2) RETURNING id', [name, color]);
          courseIds.set(key, rows[0].id);
        }
        return courseIds.get(key);
      };

      const existing = await existingByUid();
      let created = 0;
      let updated = 0;
      for (const e of events.filter((x) => x.exam && x.isFutureExam && chosen.has(x.uid))) {
        const due = e.start_at.slice(0, 10);
        const known = existing.get(e.uid);
        if (known) {
          await db.query('UPDATE obligations SET due_date = $1, effort_hours = $2 WHERE id = $3', [
            due,
            chosen.get(e.uid),
            known.id,
          ]);
          updated += 1;
        } else {
          await db.query(
            `INSERT INTO obligations (course_id, title, type, due_date, effort_hours, priority, material, source_uid)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [await courseFor(e.course), e.label, e.exam.type, due, chosen.get(e.uid), e.exam.priority, e.location || null, e.uid],
          );
          created += 1;
        }
      }

      const plan = await planner.replan();
      return { blocks: events.length, created, updated, warnings: plan.warnings };
    },
  };
}
