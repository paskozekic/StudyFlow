import { useEffect, useState } from 'react';
import { WEEKDAYS_SHORT, clipToDay, fromMinutes, nowTime, timeOf, toMinutes, todayISO, weekday } from '../dates.js';
import { CATEGORY_LABELS } from './common.jsx';

const HOUR_PX = 52;

/**
 * Vremenska mreža (kao u CardioMed rasporedu): dostupnost je svijetla pozadina, zauzeto
 * je šrafirano, a termini učenja leže na svojim satima. Klik na prazno mjesto označava
 * to vrijeme kao zauzeto.
 */
export default function TimeGrid({ days, sessions, blocks, windows, deadlines, onDayClick, onSessionClick, onBlockClick, onEmptyClick }) {
  const today = todayISO();
  const [now, setNow] = useState(nowTime);
  useEffect(() => {
    const id = setInterval(() => setNow(nowTime()), 60_000);
    return () => clearInterval(id);
  }, []);

  const windowsOf = (day) =>
    windows.filter((w) => w.weekday === weekday(day)).map((w) => [toMinutes(w.start_time), toMinutes(w.end_time)]);
  const sessionsOf = (day) =>
    sessions.filter((s) => s.date === day).map((s) => ({ s, range: clipToDay(day, s.start_at, s.end_at) }));
  const blocksOf = (day) =>
    blocks.map((b) => ({ b, range: clipToDay(day, b.start_at, b.end_at) })).filter((x) => x.range);

  // Prikazani sati: sve što postoji u tim danima, barem 8–21.
  let minH = 8;
  let maxH = 21;
  for (const day of days) {
    const ranges = [...windowsOf(day), ...sessionsOf(day).map((x) => x.range), ...blocksOf(day).map((x) => x.range)];
    for (const [s, e] of ranges.filter(Boolean)) {
      minH = Math.min(minH, Math.floor(s / 60));
      maxH = Math.max(maxH, Math.ceil(e / 60));
    }
  }
  const startMin = minH * 60;
  const height = (maxH - minH) * HOUR_PX;
  const y = (min) => ((min - startMin) / 60) * HOUR_PX;
  const box = ([s, e]) => ({ top: y(Math.max(s, startMin)), height: Math.max(14, y(e) - y(Math.max(s, startMin))) });

  const hasDeadlines = days.some((d) => deadlines(d).length > 0);

  const clickEmpty = (day, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = startMin + ((e.clientY - rect.top) / HOUR_PX) * 60;
    onEmptyClick(day, fromMinutes(Math.min(23 * 60, Math.floor(minutes / 30) * 30)));
  };

  return (
    <div className="time-grid" style={{ '--cols': days.length }}>
      <div className="tg-corner" />
      {days.map((day) => (
        <button
          key={day}
          className={day === today ? 'tg-day-head is-today' : 'tg-day-head'}
          onClick={() => onDayClick(day)}
        >
          <span className="muted small">{WEEKDAYS_SHORT[weekday(day)]}</span>
          <span className="day-number">{Number(day.slice(8))}</span>
        </button>
      ))}

      {hasDeadlines && (
        <>
          <div className="tg-allday-label muted small">Rok</div>
          {days.map((day) => (
            <div key={day} className="tg-allday">
              {deadlines(day).map((o) => (
                <span
                  key={o.id}
                  className="cal-item cal-deadline"
                  style={{ '--course': o.color }}
                  title={`${o.course_name}: ${o.title}`}
                >
                  ⚑ {o.course_name}
                </span>
              ))}
            </div>
          ))}
        </>
      )}

      <div className="tg-hours" style={{ height }}>
        {Array.from({ length: maxH - minH }, (_, i) => (
          <span key={i} style={{ top: i * HOUR_PX }}>
            {String(minH + i).padStart(2, '0')}:00
          </span>
        ))}
      </div>

      {days.map((day) => (
        <div
          key={day}
          className={day < today ? 'tg-col is-past' : 'tg-col'}
          style={{ height, '--hour': `${HOUR_PX}px` }}
          onClick={(e) => clickEmpty(day, e)}
        >
          {windowsOf(day).map((range, i) => (
            <div key={`w${i}`} className="tg-window" style={box(range)} />
          ))}

          {blocksOf(day).map(({ b, range }) => (
            <button
              key={`b${b.id}`}
              className="tg-block"
              style={box(range)}
              onClick={(e) => {
                e.stopPropagation();
                onBlockClick(b);
              }}
              title={`${CATEGORY_LABELS[b.category]}${b.note ? `: ${b.note}` : ''}`}
            >
              <strong>{b.note || CATEGORY_LABELS[b.category]}</strong>
            </button>
          ))}

          {sessionsOf(day).map(({ s, range }) => (
            <button
              key={`s${s.id}`}
              className={`tg-session tg-${s.status}${box(range).height < 40 ? ' tg-compact' : ''}`}
              style={{ ...box(range), '--course': s.color }}
              onClick={(e) => {
                e.stopPropagation();
                onSessionClick(s);
              }}
              title={`${s.course_name}: ${s.title} ${timeOf(s.start_at)}–${timeOf(s.end_at)}`}
            >
              <span className="tg-session-title">
                {s.status === 'done' && '✓ '}
                {s.status === 'missed' && '✗ '}
                {s.course_name}
              </span>
              <span className="tg-session-time">
                {timeOf(s.start_at)}–{timeOf(s.end_at)} · {s.title}
              </span>
            </button>
          ))}

          {day === today && toMinutes(now) >= startMin && toMinutes(now) <= maxH * 60 && (
            <div className="tg-now" style={{ top: y(toMinutes(now)) }} aria-hidden="true" />
          )}
        </div>
      ))}
    </div>
  );
}
