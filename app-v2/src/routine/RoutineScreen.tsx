// The Routine dashboard — the app's default landing page.
//
// Every activity for the selected day, including the two optional ones, on one
// screen with no scrolling at iPad size. The whole tile is the completion
// control: one tap marks it done, another undoes it. Nothing here depends on
// hover, and the day's activities are derived from the recurrence rules for
// the current Europe/Paris date, so the dashboard rolls over on its own.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RoutineActivity } from './model';
import {
  buildCompletionIndex, resolveActivity, activitiesForDay, dayProgressFromRows,
  weekProgress, toggleActivity, isOverdue,
  type ResolvedActivity,
} from './engine';
import {
  dayKeyOf, addDaysKey, dayNameShort, type DayKey,
} from './dates';
import { ActivityIcon } from './activity-icons';
import { dayParts, metaFor } from './format';
import { RoutineSettings } from './RoutineSettings';
import { useClock } from '../ui/useClock';
import { IconChevronLeft, IconChevronRight, IconCog, IconTimer, IconLink } from '../ui/icons';
import { RoutineTimer } from './RoutineTimer';

const EMPTY: never[] = [];

function useMinuteClock(): Date {
  const minute = useClock(60000);
  return useMemo(() => new Date(minute), [minute]);
}

// ── Formatting ──────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════
// TILE
// ═══════════════════════════════════════════════════════════════════════════

interface TileProps {
  row: ResolvedActivity;
  index: number;
  wide: boolean;
  date: DayKey;
  today: DayKey;
  now: Date;
  onToggle: (a: RoutineActivity) => void;
  onOpenTimer: (a: RoutineActivity) => void;
}

function Tile({ row, index, wide, date, today, now, onToggle, onOpenTimer }: TileProps) {
  const a = row.activity;
  const late = isOverdue(row, date, today, now);
  const partial = row.children.length > 0 && row.childrenDone > 0 && !row.done;
  const meta = metaFor(a);
  const optional = a.required === false;
  const hasAux = !!a.timerSec || !!a.link?.url;

  const cls = [
    'rt-tile',
    row.done ? 'is-done' : '',
    row.skipped ? 'is-skipped' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className="rt-cell rt-tile-cell"
      data-wide={wide ? 'true' : undefined}
      data-aux={hasAux ? 'true' : undefined}
      style={{ '--i': index } as React.CSSProperties}
    >
      <button
        className={cls}
        onClick={() => onToggle(a)}
        aria-pressed={row.done}
        aria-label={`${a.title}${meta ? `, ${meta}` : ''}${optional ? ', optional' : ''}. ${row.done ? 'Completed' : 'Not completed'}.`}
      >
        <span className="rt-tile-icon" aria-hidden><ActivityIcon name={a.icon} /></span>

        <span className="rt-tile-text">
          <span className="rt-tile-title">
            <span className="rt-tile-name">{a.title}</span>
            {optional && <span className="rt-chip">Optional</span>}
          </span>
          {(meta || late || row.skipped) && (
            <span className="rt-tile-meta">
              {row.skipped ? 'Set aside' : meta}
              {late && <span className="late"> · overdue</span>}
            </span>
          )}
        </span>

        <span className={`rt-status${partial ? ' is-part' : ''}`} aria-hidden>
          {row.done ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path className="mark" d="m5 12.5 4.5 4.5L19 7" />
            </svg>
          ) : partial ? `${row.childrenDone}/${row.children.length}` : null}
        </span>
      </button>

      {/* Secondary controls sit outside the completion button so a tap can
          never be ambiguous about what it does. */}
      {!!a.timerSec && (
        <button
          className="rt-tile-aux"
          onClick={() => onOpenTimer(a)}
          aria-label={`Start the timer for ${a.title}`}
        ><IconTimer /></button>
      )}
      {!a.timerSec && a.link?.url && (
        <a
          className="rt-tile-aux"
          href={a.link.url}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={a.link.label || `Open the link for ${a.title}`}
        ><IconLink /></a>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PROGRESS RING
// ═══════════════════════════════════════════════════════════════════════════

function ProgressRing({ done, total }: { done: number; total: number }) {
  const R = 23;
  const C = 2 * Math.PI * R;
  const pct = total === 0 ? 0 : done / total;
  return (
    <div className="rt-ring-group">
      <div className="rt-ring">
        <svg viewBox="0 0 54 54" aria-hidden>
          <circle className="track" cx="27" cy="27" r={R} fill="none" strokeWidth="6" />
          <circle
            className="fill"
            cx="27" cy="27" r={R}
            fill="none"
            strokeWidth="6"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - pct)}
          />
        </svg>
      </div>
      <div className="rt-ring-label">
        <span className="rt-ring-count">{done} / {total}</span>
        <span className="rt-ring-word">completed</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREEN
// ═══════════════════════════════════════════════════════════════════════════

export interface RoutineScreenData {
  routineActivities?: RoutineActivity[];
  progressLog?: unknown[];
  [key: string]: unknown;
}

interface Props {
  data: RoutineScreenData;
  onPersist: (next: RoutineScreenData) => void;
}

export function RoutineScreen({ data, onPersist }: Props) {
  const now = useMinuteClock();
  const today = useMemo(() => dayKeyOf(now), [now]);
  const [viewDate, setViewDate] = useState<DayKey>(today);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [timerFor, setTimerFor] = useState<RoutineActivity | null>(null);

  // The entrance stagger plays once, when the dashboard first opens — not on
  // every day change, and never again while it sits on the desk all day.
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setIntro(false), 900);
    return () => window.clearTimeout(id);
  }, []);

  // Follow the Paris date when it rolls over, unless the user has
  // deliberately navigated to another day.
  const prevToday = useRef(today);
  useEffect(() => {
    if (prevToday.current !== today) {
      setViewDate(v => (v === prevToday.current ? today : v));
      prevToday.current = today;
    }
  }, [today]);

  const activities: RoutineActivity[] = useMemo(
    () => data?.routineActivities || EMPTY, [data?.routineActivities]);
  const log: unknown[] = useMemo(() => data?.progressLog || EMPTY, [data?.progressLog]);
  const index = useMemo(() => buildCompletionIndex(log), [log]);

  // Scheduled first, optional last, each in its configured order — so the
  // optional pair always lands at the end of the grid without being hidden.
  const rows: ResolvedActivity[] = useMemo(() => {
    const all = activitiesForDay(activities, viewDate, 'routine')
      .map(a => resolveActivity(a, index, viewDate));
    const required = all.filter(r => r.activity.required !== false);
    const optional = all.filter(r => r.activity.required === false);
    return [...required, ...optional];
  }, [activities, index, viewDate]);

  const progress = useMemo(() => dayProgressFromRows(rows), [rows]);
  const week = useMemo(
    () => weekProgress(activities, index, viewDate, today), [activities, index, viewDate, today]);

  const persistLog = useCallback((nextLog: unknown[]) => {
    onPersist({ ...data, progressLog: nextLog, lastModified: new Date().toISOString() });
  }, [data, onPersist]);

  const handleToggle = useCallback((a: RoutineActivity) => {
    persistLog(toggleActivity(log, a, viewDate, index));
  }, [log, viewDate, index, persistLog]);

  const saveActivities = useCallback((next: RoutineActivity[]) => {
    onPersist({ ...data, routineActivities: next, lastModified: new Date().toISOString() });
  }, [data, onPersist]);

  const parts = dayParts(viewDate);

  return (
    <div className="rt">
      <header className="rt-head">
        <div className="rt-head-left">
          <div className="ds-eyebrow rt-brand">My Planning</div>
          <h1 className="rt-date">
            {parts.name}
            <button className="rt-gear" onClick={() => setSettingsOpen(true)} aria-label="Routine settings"><IconCog /></button>
          </h1>
          <div className="rt-date-sub">
            {parts.rest}
            {viewDate !== today && (
              <button className="rt-today-btn" onClick={() => setViewDate(today)}>Today</button>
            )}
          </div>
        </div>

        <div className="rt-progress">
          <ProgressRing done={progress.completed} total={progress.total} />
          <button className="rt-step" onClick={() => setViewDate(addDaysKey(viewDate, -1))} aria-label="Previous day"><IconChevronLeft /></button>
          <div className="rt-week" role="group" aria-label="This week">
            {week.days.map(d => {
              const full = d.total > 0 && d.completed === d.total;
              const cls = [
                'rt-week-day',
                d.key === viewDate ? 'is-selected' : '',
                d.isFuture && d.completed === 0 ? 'is-future' : '',
                full ? 'is-full' : d.completed > 0 ? 'is-part' : '',
              ].filter(Boolean).join(' ');
              return (
                <button
                  key={d.key}
                  className={cls}
                  onClick={() => setViewDate(d.key)}
                  aria-pressed={d.key === viewDate}
                  aria-label={`${dayNameShort(d.key)} — ${d.isFuture ? 'not yet' : `${d.completed} of ${d.total} completed`}`}
                >
                  <span className="rt-week-name">{dayNameShort(d.key).slice(0, 2)}</span>
                  <span className="rt-week-dot" aria-hidden />
                </button>
              );
            })}
          </div>
          <button className="rt-step" onClick={() => setViewDate(addDaysKey(viewDate, 1))} aria-label="Next day"><IconChevronRight /></button>
        </div>
      </header>

      <div
        className={`rt-grid${intro ? ' is-intro' : ''}`}
        key={viewDate}
      >
        {rows.length === 0 ? (
          <div className="rt-empty">
            Nothing scheduled for this day. Open routine settings to add an activity.
          </div>
        ) : (
          <>
            {rows.map((row, i) => (
              <Tile
                key={row.activity.id}
                row={row}
                index={i}
                wide={rows.length % 2 === 1 && i === rows.length - 1}
                date={viewDate}
                today={today}
                now={now}
                onToggle={handleToggle}
                onOpenTimer={setTimerFor}
              />
            ))}

            {/* Fills the leftover cells of the landscape grid; hidden in
                portrait, where the header's day dots already carry the week. */}
            <div className="rt-cell rt-weekcard" style={{ '--i': rows.length } as React.CSSProperties}>
              <span className="rt-weekcard-title">This week</span>
              <div className="rt-bars">
                {week.days.map(d => (
                  <div
                    key={d.key}
                    className={`rt-bar-col${d.key === viewDate ? ' is-selected' : ''}`}
                  >
                    <span className="rt-bar">
                      <i style={{ height: `${Math.max(d.pct, d.pct > 0 ? 6 : 0)}%` }} />
                    </span>
                    <span className="rt-bar-label">{dayNameShort(d.key)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {timerFor && (
        <RoutineTimer
          activity={timerFor}
          done={rows.find(r => r.activity.id === timerFor.id)?.done ?? false}
          onComplete={() => handleToggle(timerFor)}
          onClose={() => setTimerFor(null)}
        />
      )}

      {settingsOpen && (
        <RoutineSettings
          activities={activities}
          onSave={saveActivities}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
