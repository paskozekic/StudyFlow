import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createTestDb } from '../testing/testDb.js';

let server;
let db;
let baseUrl;
let now = '2026-11-02T08:00'; // ponedjeljak ujutro

async function call(method, path, body) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

const allDays = (start_time, end_time) => [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start_time, end_time }));
const sessionsOf = async () => (await call('GET', '/sessions?from=2026-11-01&to=2026-11-30')).body;

before(async () => {
  db = await createTestDb();
  server = createApp(db, { now: () => now }).listen(0);
  await new Promise((r) => server.once('listening', r));
  baseUrl = `http://localhost:${server.address().port}/api`;
});

after(async () => {
  server.close();
  await db.close();
});

test('cijeli tijek: obveza → plan u terminima → "nisam stigao" → preraspodjela', async () => {
  assert.equal((await call('PUT', '/availability', [...allDays('09:00', '11:00'), ...allDays('17:00', '19:00')])).status, 200);

  const course = await call('POST', '/courses', { name: 'Matematika', color: '#1F4E79' });
  const created = await call('POST', '/obligations', {
    course_id: course.body.id,
    title: 'Završni ispit',
    type: 'ispit',
    due_date: '2026-11-07',
    effort_hours: 10,
    priority: 3,
  });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.warnings, []);

  let sessions = await sessionsOf();
  assert.equal(sessions.reduce((s, x) => s + x.hours, 0), 10);
  assert.ok(sessions.every((s) => /T(09|10|17|18):/.test(s.start_at)), 'samo unutar prozora dostupnosti');
  const today = sessions.filter((s) => s.date === '2026-11-02');
  assert.ok(today.length > 0);

  // u 9:30 javim da jutarnji termin nisam stigao
  now = '2026-11-02T09:30';
  const first = today[0];
  const missed = await call('PATCH', `/sessions/${first.id}`, { status: 'missed' });
  assert.equal(missed.status, 200);
  assert.equal(missed.body.session.status, 'missed');
  assert.ok(missed.body.next.length > 0, 'javlja gdje je učenje premješteno');
  assert.ok(missed.body.next.every((s) => s.start_at >= now));

  sessions = await sessionsOf();
  const planned = sessions.filter((s) => s.status === 'planned');
  assert.equal(planned.reduce((s, x) => s + x.hours, 0), 10, 'propušteni sati ponovno su isplanirani');
  assert.ok(planned.every((s) => s.start_at >= first.end_at || s.start_at < now));
  assert.ok(
    planned.some((s) => s.date === '2026-11-02' && s.start_at >= '2026-11-02T17:00'),
    'propušteno se nadoknađuje već isti dan navečer',
  );
});

test('nedostupnost s ponavljanjem uklanja termine iz plana', async () => {
  const res = await call('POST', '/unavailability', {
    start_at: '2026-11-03T17:00',
    end_at: '2026-11-03T19:00',
    category: 'predavanje',
    repeat: { weekdays: [2, 4], until: '2026-11-12' },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.created, 4); // uto 3., čet 5., uto 10., čet 12.

  const blocks = (await call('GET', '/unavailability?from=2026-11-01&to=2026-11-30')).body;
  assert.equal(blocks.length, 4);
  const sessions = await sessionsOf();
  assert.ok(!sessions.some((s) => s.date === '2026-11-03' && s.start_at >= '2026-11-03T17:00' && s.status === 'planned'));

  assert.equal((await call('DELETE', `/unavailability/${blocks[0].id}`)).status, 204);
});

test('tjedno zauzeto vrijeme radi kao dostupnost i miče učenje iz tih sati', async () => {
  // svaki dan 09–11 zauzeto → ostaje samo večer 17–19
  const res = await call('PUT', '/busy', allDays('09:00', '11:00'));
  assert.equal(res.status, 200);
  assert.equal(res.body.windows.length, 7);
  assert.deepEqual((await call('GET', '/busy')).body[0], { weekday: 0, start_time: '09:00', end_time: '11:00' });

  const planned = (await sessionsOf()).filter((s) => s.status === 'planned');
  assert.ok(planned.length > 0);
  assert.ok(planned.every((s) => s.start_at.slice(11) >= '17:00'), 'jutarnji termini su zauzeti');

  assert.equal((await call('PUT', '/busy', [])).status, 200);
});

test('sljedeći dan neodrađeni termini postaju propušteni i preraspoređuju se', async () => {
  now = '2026-11-03T08:00';
  const sessions = await sessionsOf();
  assert.ok(!sessions.some((s) => s.status === 'planned' && s.date < '2026-11-03'));
  const progress = (await call('GET', '/progress')).body.items[0];
  assert.equal(progress.done_hours + progress.planned_hours + progress.unscheduled_hours, 10);
});

test('validacija unosa', async () => {
  assert.equal((await call('POST', '/obligations', { title: '' })).status, 400);
  assert.equal((await call('GET', '/sessions')).status, 400);
  assert.equal((await call('PUT', '/availability', [{ weekday: 1, start_time: '12:00', end_time: '10:00' }])).status, 400);
  assert.equal((await call('POST', '/unavailability', { start_at: '2026-11-03T10:00', end_at: '2026-11-03T09:00' })).status, 400);
});

test('brisanje kolegija briše i njegove obveze', async () => {
  const course = await call('POST', '/courses', { name: 'Fizika' });
  await call('POST', '/obligations', {
    course_id: course.body.id,
    title: 'Kolokvij',
    type: 'kolokvij',
    due_date: '2026-11-10',
    effort_hours: 3,
  });
  assert.equal((await call('DELETE', `/courses/${course.body.id}`)).status, 204);
  const obligations = await call('GET', '/obligations');
  assert.ok(obligations.body.every((o) => o.course_name !== 'Fizika'));
});
