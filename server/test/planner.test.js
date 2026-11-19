import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../src/planner.js';
import { addDays } from '../src/dates.js';

const H = (h) => h * 60;
/** Isti slobodni intervali svaki dan od `from` kroz `n` dana. */
function everyDay(from, n, intervals) {
  const free = {};
  for (let i = 0; i < n; i++) free[addDays(from, i)] = intervals.map(([s, e]) => [H(s), H(e)]);
  return free;
}
const sum = (sessions, id) =>
  sessions.filter((s) => id === undefined || s.obligation_id === id).reduce((a, s) => a + s.hours, 0);

test('raspoređuje sve sate prije roka, ravnomjerno i unutar slobodnog vremena', () => {
  const { sessions, warnings } = buildPlan({
    obligations: [{ id: 1, due_date: '2026-11-11', effort_hours: 10, priority: 2 }],
    free: everyDay('2026-11-01', 10, [[17, 21]]),
    today: '2026-11-01',
  });
  assert.equal(sum(sessions), 10);
  assert.deepEqual(warnings, []);
  assert.ok(sessions.every((s) => s.date < '2026-11-11'));
  assert.ok(sessions.every((s) => s.hours <= 1.5), 'nema natrpavanja na početku');
  assert.ok(sessions.every((s) => s.start_at.slice(11) >= '17:00' && s.end_at.slice(11) <= '21:00'));
  assert.equal(sessions[0].start_at, '2026-11-01T17:00');
});

test('termini ne izlaze iz slobodnih intervala ni kad ih je više u danu', () => {
  const { sessions } = buildPlan({
    obligations: [{ id: 1, due_date: '2026-11-02', effort_hours: 3, priority: 2 }],
    free: { '2026-11-01': [[H(9), H(10)], [H(14), H(16)]] },
    today: '2026-11-01',
  });
  assert.deepEqual(
    sessions.map((s) => [s.start_at.slice(11), s.end_at.slice(11)]),
    [['09:00', '10:00'], ['14:00', '16:00']],
  );
});

test('izmjenjuje predmete u blokovima od najviše 2 sata', () => {
  const { sessions } = buildPlan({
    obligations: [
      { id: 1, due_date: '2026-11-02', effort_hours: 3, priority: 3 },
      { id: 2, due_date: '2026-11-02', effort_hours: 2, priority: 1 },
    ],
    free: { '2026-11-01': [[H(9), H(14)]] },
    today: '2026-11-01',
  });
  assert.deepEqual(
    sessions.map((s) => [s.obligation_id, s.start_at.slice(11), s.end_at.slice(11)]),
    [
      [1, '09:00', '11:00'],
      [2, '11:00', '13:00'],
      [1, '13:00', '14:00'],
    ],
  );
});

test('upozorava kad nema dovoljno vremena', () => {
  const { sessions, warnings } = buildPlan({
    obligations: [{ id: 1, due_date: '2026-11-03', effort_hours: 10, priority: 2 }],
    free: everyDay('2026-11-01', 2, [[18, 20]]),
    today: '2026-11-01',
  });
  assert.equal(sum(sessions), 4);
  assert.deepEqual(warnings, [{ obligation_id: 1, unscheduled_hours: 6 }]);
});

test('uzima u obzir već pokrivene sate', () => {
  const { sessions } = buildPlan({
    obligations: [{ id: 1, due_date: '2026-11-03', effort_hours: 5, priority: 2 }],
    free: { '2026-11-01': [], '2026-11-02': [[H(17), H(20)]] },
    completedHours: { 1: 2 },
    today: '2026-11-01',
  });
  assert.deepEqual(sessions, [
    { obligation_id: 1, date: '2026-11-02', start_at: '2026-11-02T17:00', end_at: '2026-11-02T20:00', hours: 3 },
  ]);
});

test('preskače obveze kojima je rok prošao', () => {
  const { sessions } = buildPlan({
    obligations: [{ id: 1, due_date: '2026-10-30', effort_hours: 5, priority: 2 }],
    free: everyDay('2026-11-01', 3, [[17, 20]]),
    today: '2026-11-01',
  });
  assert.deepEqual(sessions, []);
});
