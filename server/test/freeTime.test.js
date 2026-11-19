import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freeIntervals } from '../src/freeTime.js';

const fmt = (intervals) =>
  intervals.map(([s, e]) => `${String(s / 60).padStart(2, '0')}-${String(e / 60).padStart(2, '0')}`);

// 2026-11-02 je ponedjeljak (weekday 1)
const windows = [
  { weekday: 1, start_time: '09:00', end_time: '13:00' },
  { weekday: 1, start_time: '15:00', end_time: '21:00' },
];

test('tjedni prozori umanjeni za zauzete blokove', () => {
  const free = freeIntervals({
    days: ['2026-11-02', '2026-11-03'],
    windows,
    blocked: [{ start_at: '2026-11-02T10:00', end_at: '2026-11-02T12:00' }],
  });
  assert.deepEqual(fmt(free['2026-11-02']), ['09-10', '12-13', '15-21']);
  assert.deepEqual(free['2026-11-03'], [], 'utorak nema prozora');
});

test('tjedno zauzeto vrijeme oduzima se svaki taj dan u tjednu', () => {
  const free = freeIntervals({
    days: ['2026-11-02', '2026-11-09'],
    windows,
    busyWindows: [
      { weekday: 1, start_time: '10:00', end_time: '11:00' },
      { weekday: 1, start_time: '16:00', end_time: '18:00' },
      { weekday: 2, start_time: '09:00', end_time: '21:00' },
    ],
  });
  assert.deepEqual(fmt(free['2026-11-02']), ['09-10', '11-13', '15-16', '18-21']);
  assert.deepEqual(free['2026-11-09'], free['2026-11-02']);
});

test('blok preko više dana briše cijeli dan', () => {
  const free = freeIntervals({
    days: ['2026-11-02'],
    windows,
    blocked: [{ start_at: '2026-11-01T18:00', end_at: '2026-11-03T08:00' }],
  });
  assert.deepEqual(free['2026-11-02'], []);
});

test('danas se ne planira prošlo vrijeme; početak se zaokružuje na pola sata', () => {
  const free = freeIntervals({ days: ['2026-11-02'], windows, now: '2026-11-02T16:10' });
  assert.deepEqual(free['2026-11-02'], [[16 * 60 + 30, 21 * 60]]);
});

test('preklapajući prozori se spajaju, kraj dana može biti 24:00', () => {
  const free = freeIntervals({
    days: ['2026-11-02'],
    windows: [
      { weekday: 1, start_time: '20:00', end_time: '24:00' },
      { weekday: 1, start_time: '19:00', end_time: '21:00' },
    ],
  });
  assert.deepEqual(free['2026-11-02'], [[19 * 60, 24 * 60]]);
});
