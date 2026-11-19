import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFerEvent, parseIcs } from '../src/ics.js';
import { createApp } from '../src/app.js';
import { createTestDb } from '../testing/testDb.js';

// Isti oblik kao kalendar koji izvozi FER.
const FER_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//QUILTCMS//NONSGML v1.0//EN',
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Zagreb',
  'END:VTIMEZONE',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Europe/Zagreb:20261124T120000',
  'DTEND;TZID=Europe/Zagreb:20261124T140000',
  'SUMMARY:Obrada prirodnog jezika - 7. predavanje (P01) [D-346]',
  'LOCATION:D-346',
  'UID:lec1@www.fer.unizg.hr',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Europe/Zagreb:20261125T100000',
  'DTEND;TZID=Europe/Zagreb:20261125T113000',
  'SUMMARY:Satelitske komunikacijske tehnologije - 2. laboratorijska vježba (L-',
  ' B-01) [A-202]',
  'UID:lab1@www.fer.unizg.hr',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Europe/Zagreb:20261202T083000',
  'DTEND;TZID=Europe/Zagreb:20261202T110000',
  'SUMMARY:Računalna forenzika - Međuispit [Neraspoređen/Unassigned]',
  'UID:mid1@www.fer.unizg.hr',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20261210T103000Z',
  'DTEND:20261210T123000Z',
  'SUMMARY:Paralelno programiranje - Završni ispit: Pismeni (A-111) [A-111]',
  'UID:fin1@www.fer.unizg.hr',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Europe/Zagreb:20261101T100000',
  'DTEND;TZID=Europe/Zagreb:20261101T120000',
  'SUMMARY:Obrada prirodnog jezika - 4. predavanje (P01) [D-346]',
  'UID:past@www.fer.unizg.hr',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

test('čita FER .ics: zona Europe/Zagreb, UTC i presavijeni retci', () => {
  const events = parseIcs(FER_ICS);
  assert.equal(events.length, 5);
  assert.deepEqual(events[0], {
    uid: 'lec1@www.fer.unizg.hr',
    summary: 'Obrada prirodnog jezika - 7. predavanje (P01) [D-346]',
    location: 'D-346',
    start_at: '2026-11-24T12:00',
    end_at: '2026-11-24T14:00',
  });
  assert.equal(events[1].summary, 'Satelitske komunikacijske tehnologije - 2. laboratorijska vježba (L-B-01) [A-202]');
  // 10:30 UTC je 11:30 u Zagrebu (zimsko vrijeme)
  assert.equal(events[3].start_at, '2026-12-10T11:30');
  assert.throws(() => parseIcs('nije kalendar'));
});

test('razvrstava FER termine', () => {
  assert.deepEqual(classifyFerEvent('Obrada prirodnog jezika - 7. predavanje (P01) [D-346]'), {
    course: 'Obrada prirodnog jezika',
    label: '7. predavanje',
    category: 'predavanje',
    exam: null,
  });
  assert.equal(classifyFerEvent('Digitalno obrazovanje - 1. laboratorijska vježba (L-A-01) [A-304]').category, 'laboratorij');
  assert.equal(classifyFerEvent('Prezentacija seminara Ana Anić [A-101]').category, 'obveza');

  const midterm = classifyFerEvent('Računalna forenzika - Međuispit [Neraspoređen/Unassigned]');
  assert.equal(midterm.course, 'Računalna forenzika');
  assert.equal(midterm.label, 'Međuispit');
  assert.equal(midterm.exam.type, 'kolokvij');

  const final = classifyFerEvent('Paralelno programiranje - Završni ispit: Pismeni (A-111) [A-111]');
  assert.equal(final.label, 'Završni ispit: Pismeni');
  assert.deepEqual(final.exam, { type: 'ispit', priority: 3, suggested_hours: 25 });
});

let server;
let db;
let baseUrl;
const call = async (method, path, body) => {
  const res = await fetch(baseUrl + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

before(async () => {
  db = await createTestDb();
  server = createApp(db, { now: () => '2026-11-19T08:00' }).listen(0);
  await new Promise((r) => server.once('listening', r));
  baseUrl = `http://localhost:${server.address().port}/api`;
});
after(async () => {
  server.close();
  await db.close();
});

test('uvoz: pregled, spremanje i ponovni uvoz bez duplikata', async () => {
  const preview = await call('POST', '/import/ics/preview', { ics: FER_ICS });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.events, 4, 'prošli termini se preskaču');
  assert.deepEqual(preview.body.counts, { predavanje: 1, laboratorij: 1, ispit: 2 });
  assert.deepEqual(
    preview.body.exams.map((e) => [e.course, e.title, e.effort_hours, e.imported]),
    [
      ['Računalna forenzika', 'Međuispit', 12, false],
      ['Paralelno programiranje', 'Završni ispit: Pismeni', 25, false],
    ],
  );

  const exams = preview.body.exams.map((e) => ({ uid: e.uid, effort_hours: e.effort_hours }));
  const result = await call('POST', '/import/ics', { ics: FER_ICS, exams });
  assert.deepEqual([result.body.blocks, result.body.created, result.body.updated], [4, 2, 0]);

  const obligations = (await call('GET', '/obligations')).body;
  assert.deepEqual(
    obligations.map((o) => [o.course_name, o.due_date, o.type]),
    [
      ['Računalna forenzika', '2026-12-02', 'kolokvij'],
      ['Paralelno programiranje', '2026-12-10', 'ispit'],
    ],
  );
  const blocks = (await call('GET', '/unavailability?from=2026-11-01&to=2026-12-31')).body;
  assert.equal(blocks.length, 4);
  assert.equal(blocks[0].note, 'Obrada prirodnog jezika – 7. predavanje');

  // učenje se ne planira preko predavanja
  const sessions = (await call('GET', '/sessions?from=2026-11-24&to=2026-11-24')).body;
  assert.ok(sessions.every((s) => s.end_at <= '2026-11-24T12:00' || s.start_at >= '2026-11-24T14:00'));

  const again = await call('POST', '/import/ics', { ics: FER_ICS, exams });
  assert.deepEqual([again.body.blocks, again.body.created, again.body.updated], [4, 0, 2]);
  assert.equal((await call('GET', '/obligations')).body.length, 2);
  assert.equal((await call('GET', '/unavailability?from=2026-11-01&to=2026-12-31')).body.length, 4);
  assert.ok((await call('POST', '/import/ics/preview', { ics: FER_ICS })).body.exams.every((e) => e.imported));
});

test('uvoz bez datoteke javlja grešku', async () => {
  const res = await call('POST', '/import/ics/preview', {});
  assert.equal(res.status, 400);
  assert.match(res.body.error, /\.ics/);
});
