import { useState } from 'react';
import { useApi } from '../useApi.js';
import { WEEKDAYS_SHORT, addDays, formatDate, formatHours, mondayOf, timeOf, todayISO, weekday } from '../dates.js';
import { ErrorMessage } from './common.jsx';
import DayPlan from './DayPlan.jsx';
import TimeGrid from './TimeGrid.jsx';

const MONTHS = [
  'Siječanj', 'Veljača', 'Ožujak', 'Travanj', 'Svibanj', 'Lipanj',
  'Srpanj', 'Kolovoz', 'Rujan', 'Listopad', 'Studeni', 'Prosinac',
];
const MONTHS_GENITIVE = [
  'siječnja', 'veljače', 'ožujka', 'travnja', 'svibnja', 'lipnja',
  'srpnja', 'kolovoza', 'rujna', 'listopada', 'studenoga', 'prosinca',
];
const VIEWS = { month: 'Mjesec', week: 'Tjedan', day: 'Dan' };
const MAX_ITEMS = 3;
const VIEW_KEY = 'studyflow.view';

function shiftMonth(iso, delta) {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function loadView() {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    return VIEWS[saved] ? saved : 'month';
  } catch {
    return 'month';
  }
}

/** Raspon datuma koji prikaz pokriva. */
function rangeFor(view, anchor) {
  if (view === 'day') return { start: anchor, end: anchor };
  if (view === 'week') {
    const start = mondayOf(anchor);
    return { start, end: addDays(start, 6) };
  }
  const first = `${anchor.slice(0, 7)}-01`;
  const start = mondayOf(first);
  const end = addDays(mondayOf(addDays(shiftMonth(first, 1), -1)), 6);
  return { start, end };
}

function titleFor(view, anchor, { start, end }) {
  if (view === 'day') return formatDate(anchor, { withWeekday: true });
  if (view === 'week') {
    const [sy, sm, sd] = start.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    if (sy !== ey) return `${sd}. ${sm}. ${sy}. – ${ed}. ${em}. ${ey}.`;
    if (sm !== em) return `${sd}. ${sm}. – ${ed}. ${em}. ${ey}.`;
    return `${sd}. – ${ed}. ${MONTHS_GENITIVE[sm - 1]} ${ey}.`;
  }
  const [y, m] = anchor.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}.`;
}

export default function Calendar({ version, onDayClick, onChange, notify, open }) {
  const today = todayISO();
  const [view, setView] = useState(loadView);
  const [anchor, setAnchor] = useState(today);

  const range = rangeFor(view, anchor);
  const days = [];
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) days.push(d);

  const sessions = useApi(`/sessions?from=${range.start}&to=${range.end}`, version);
  const obligations = useApi('/obligations', version);
  const blocks = useApi(`/unavailability?from=${range.start}&to=${range.end}`, version);
  const windows = useApi('/availability', version);
  const busyWindows = useApi('/busy', version);

  const changeView = (next) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // bez spremanja izbora – nije bitno
    }
  };

  const step = (delta) => {
    if (view === 'month') setAnchor(shiftMonth(anchor, delta));
    else setAnchor(addDays(anchor, delta * (view === 'week' ? 7 : 1)));
  };

  const deadlinesOf = (day) => (obligations.data ?? []).filter((o) => o.due_date === day);

  const itemsFor = (day) => [
    ...deadlinesOf(day).map((o) => ({ key: `d${o.id}`, deadline: true, color: o.color, text: `${o.course_name}: ${o.title}` })),
    ...(sessions.data ?? [])
      .filter((s) => s.date === day && s.status !== 'missed')
      .map((s) => ({
        key: `s${s.id}`,
        done: s.status === 'done',
        color: s.color,
        time: timeOf(s.start_at),
        text: s.course_name,
        hours: s.hours,
      })),
  ];

  const dayClass = (day, base) => {
    const cls = [base];
    if (view === 'month' && day.slice(0, 7) !== anchor.slice(0, 7)) cls.push('other-month');
    if (day === today) cls.push('is-today');
    if (day < today) cls.push('is-past');
    return cls.join(' ');
  };

  const grid = (gridDays) => (
    <TimeGrid
      days={gridDays}
      sessions={sessions.data ?? []}
      blocks={blocks.data ?? []}
      windows={windows.data ?? []}
      busyWindows={busyWindows.data ?? []}
      deadlines={deadlinesOf}
      onBusyClick={() => open('unavailability')}
      onDayClick={onDayClick}
      onSessionClick={(session) => open('session', { session })}
      onBlockClick={(block) => open('unavailability', { block })}
      onEmptyClick={(date, time) => open('unavailability', { date, time })}
    />
  );

  const error = sessions.error ?? obligations.error ?? blocks.error ?? windows.error;

  return (
    <section className={`calendar calendar-${view}`}>
      <div className="calendar-head">
        <h2>{titleFor(view, anchor, range)}</h2>
        <div className="btn-group">
          <label className="sr-only" htmlFor="calendar-view">
            Prikaz
          </label>
          <select id="calendar-view" className="view-select" value={view} onChange={(e) => changeView(e.target.value)}>
            {Object.entries(VIEWS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost" onClick={() => step(-1)} aria-label="Prethodno">
            ‹
          </button>
          <button className="btn btn-ghost" onClick={() => setAnchor(today)}>
            Danas
          </button>
          <button className="btn btn-ghost" onClick={() => step(1)} aria-label="Sljedeće">
            ›
          </button>
        </div>
      </div>

      {error && <ErrorMessage error={error} />}

      {obligations.data?.length === 0 && (
        <div className="welcome">
          <div>
            <strong>Uvezi svoj raspored s FER-a</strong>
            <span className="muted small">
              Predavanja i labosi postaju zauzeto vrijeme, a ispiti obveze za koje StudyFlow slaže plan učenja.
            </span>
          </div>
          <button className="btn btn-accent" onClick={() => open('import')}>
            ⇩ Uvezi .ics
          </button>
        </div>
      )}

      {view === 'month' && (
        <div className="calendar-grid" role="grid">
          {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
            <div key={wd} className="weekday" role="columnheader">
              {WEEKDAYS_SHORT[wd]}
            </div>
          ))}
          {days.map((day) => {
            const items = itemsFor(day);
            return (
              <button
                key={day}
                className={dayClass(day, 'day-cell')}
                onClick={() => onDayClick(day)}
                aria-label={`${formatDate(day)}, stavki: ${items.length}`}
              >
                <span className="day-number">{Number(day.slice(8))}</span>
                <span className="day-items">
                  {items.slice(0, MAX_ITEMS).map((it) => (
                    <CalendarItem key={it.key} item={it} />
                  ))}
                  {items.length > MAX_ITEMS && <span className="cal-more">+{items.length - MAX_ITEMS} više</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {view === 'week' && (
        <>
          <div className="only-wide">{grid(days)}</div>
          {/* na mobitelu tjedan je popis dana */}
          <div className="week-list only-narrow">
            {days.map((day) => {
              const items = itemsFor(day);
              const hours = items.reduce((sum, it) => sum + (it.hours ?? 0), 0);
              return (
                <button key={day} className={dayClass(day, 'week-day')} onClick={() => onDayClick(day)}>
                  <span className="week-day-head">
                    <span className="muted small">{WEEKDAYS_SHORT[weekday(day)]}</span>
                    <span className="day-number">{Number(day.slice(8))}</span>
                    {hours > 0 && <span className="muted small">{formatHours(hours)}</span>}
                  </span>
                  <span className="day-items">
                    {items.map((it) => (
                      <CalendarItem key={it.key} item={it} wrap />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {view === 'day' && (
        <div className="day-layout">
          {grid([anchor])}
          <div className="day-view">
            <DayPlan date={anchor} version={version} onChange={onChange} notify={notify} open={open} />
          </div>
        </div>
      )}
    </section>
  );
}

function CalendarItem({ item, wrap }) {
  const cls = ['cal-item'];
  if (item.deadline) cls.push('cal-deadline');
  if (item.done) cls.push('cal-done');
  if (wrap) cls.push('cal-wrap');
  const label = item.time ? `${item.time} ${item.text}` : item.text;
  return (
    <span className={cls.join(' ')} style={{ '--course': item.color }} title={label}>
      {item.deadline && <span aria-hidden="true">⚑ </span>}
      {item.time && <span className="cal-time">{item.time} </span>}
      {item.text}
      {wrap && item.hours && <span className="cal-hours">{formatHours(item.hours)}</span>}
    </span>
  );
}
