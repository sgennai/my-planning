// The Routine dashboard — the app's default landing page.
//
// One tap on a row completes it; the day's score updates in the same render.
// Nothing here depends on hover, every target clears 44px, and the day's
// activities are derived from the recurrence rules for the current
// Europe/Paris date, so the dashboard rolls over on its own at midnight.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RoutineActivity } from './model';
import {
  buildCompletionIndex, resolveDay, dayProgressFromRows, weekProgress,
  toggleActivity, toggleChild, toggleSkip, startMinutes, nextUp, isOverdue,
  type ResolvedActivity, type ResolvedGroup,
} from './engine';
import {
  dayKeyOf, addDaysKey, formatDayAnchor, dayNameShort, dayOfMonth,
  daysBetween, minutesOfDay, type DayKey,
} from './dates';
import { RoutineSettings } from './RoutineSettings';
import { useClock } from '../ui/useClock';
import {
  IconCheck, IconChevronLeft, IconChevronRight, IconChevronDown, IconTimer,
  IconLink, IconCog, IconPlay, IconPause, IconReset, IconX, IconSkip,
} from '../ui/icons';

const EMPTY: never[] = [];

// ── A minute-resolution clock. One subscription for the whole screen; the
// snapshot is bucketed to the minute so it stays stable between ticks, which
// is what lets the day roll over on its own without any polling loop. ──
function useMinuteClock(): Date {
  const minute = useClock(60000);
  return useMemo(() => new Date(minute), [minute]);
}

// ── Countdown for the plank and the strength session ────────────────────
function useCountdown(totalSec: number, onFinish: () => void) {
  const [remaining, setRemaining] = useState(totalSec);
  const [running, setRunning] = useState(false);
  const finishRef = useRef(onFinish);
  useEffect(() => { finishRef.current = onFinish; }, [onFinish]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          window.clearInterval(id);
          setRunning(false);
          finishRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const reset = useCallback(() => { setRunning(false); setRemaining(totalSec); }, [totalSec]);
  return {
    remaining, running,
    toggle: () => setRemaining(r => { setRunning(v => !v); return r === 0 ? totalSec : r; }),
    reset,
  };
}

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function timingLabel(a: RoutineActivity): string {
  const t = a.timing;
  if (t.type === 'fixed') return t.start;
  if (t.type === 'anchored') return t.anchor;
  return '';
}

function targetLabel(a: RoutineActivity): string | null {
  if (!a.target) return null;
  return a.target.kind === 'reps' ? `${a.target.value} reps` : `${a.target.value} min`;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY ROW
// ═══════════════════════════════════════════════════════════════════════════

interface RowProps {
  row: ResolvedActivity;
  date: DayKey;
  today: DayKey;
  now: Date;
  expanded: boolean;
  onExpand: (id: string | null) => void;
  onToggle: (a: RoutineActivity, variant?: string) => void;
  onToggleChild: (a: RoutineActivity, childId: string) => void;
  onSkip: (a: RoutineActivity) => void;
}

function ActivityRow({
  row, date, today, now, expanded, onExpand, onToggle, onToggleChild, onSkip,
}: RowProps) {
  const a = row.activity;
  const late = isOverdue(row, date, today, now);
  const hasChildren = row.children.length > 0;
  const partial = hasChildren && row.childrenDone > 0 && !row.done;
  const [timerOpen, setTimerOpen] = useState(false);

  const timer = useCountdown(a.timerSec || 0, () => { if (!row.done) onToggle(a); });

  const target = targetLabel(a);
  const when = timingLabel(a);
  const canExpand = hasChildren || !!a.variants?.length || true; // every row offers its panel

  const meta: string[] = [];
  if (when) meta.push(when);
  if (hasChildren) meta.push(a.children!.map(c => c.title).join(', '));
  else if (a.description) meta.push(a.description);

  const cls = [
    'rt-row',
    row.done ? 'is-done' : '',
    row.skipped ? 'is-skipped' : '',
    late ? 'is-late' : '',
  ].filter(Boolean).join(' ');

  const checkLabel = row.done
    ? `Mark ${a.title} not done`
    : `Mark ${a.title} done`;

  return (
    <div>
      <div className={cls} data-cat={a.category}>
        <button
          className="rt-row-tap"
          onClick={() => onToggle(a)}
          aria-pressed={row.done}
          aria-label={checkLabel}
        >
          <span className={`rt-check${partial ? ' is-partial' : ''}`} aria-hidden>
            {row.done ? <IconCheck /> : partial ? `${row.childrenDone}/${row.children.length}` : null}
          </span>
          <span className="rt-row-text">
            <span className="rt-row-title">
              <span className="rt-row-name">{a.title}</span>
              {target && <span className="rt-tag">{target}</span>}
              {row.variant && <span className="rt-tag">{row.variant}</span>}
              {!a.required && <span className="rt-tag">optional</span>}
            </span>
            {(meta.length > 0 || late || row.skipped) && (
              <span className="rt-row-meta">
                {when && <span className="at">{when}</span>}
                {meta.length > 1 && <span>{meta.slice(1).join(' · ')}</span>}
                {!when && meta.length === 1 && <span>{meta[0]}</span>}
                {late && <span className="late">overdue</span>}
                {row.skipped && <span>set aside</span>}
              </span>
            )}
          </span>
        </button>

        <div className="rt-row-aux">
          {a.link?.url && (
            <a
              className="rt-aux-btn"
              href={a.link.url}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={a.link.label || `Open link for ${a.title}`}
              title={a.link.label}
            ><IconLink /></a>
          )}
          {!!a.timerSec && (
            <button
              className={`rt-aux-btn${timerOpen ? ' on' : ''}`}
              onClick={() => setTimerOpen(v => !v)}
              aria-expanded={timerOpen}
              aria-label={`${timerOpen ? 'Hide' : 'Show'} timer for ${a.title}`}
            ><IconTimer /></button>
          )}
          {canExpand && (
            <button
              className={`rt-aux-btn${expanded ? ' on' : ''}`}
              onClick={() => onExpand(expanded ? null : a.id)}
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Hide' : 'Show'} options for ${a.title}`}
            >
              <IconChevronDown style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform var(--dur-2) var(--ease)' }} />
            </button>
          )}
        </div>
      </div>

      {timerOpen && !!a.timerSec && (
        <div className={`rt-timer${timer.remaining === 0 ? ' is-done' : ''}`}>
          <span className="rt-timer-read">{formatClock(timer.remaining)}</span>
          <span className="rt-timer-track">
            <i style={{ width: `${a.timerSec ? ((a.timerSec - timer.remaining) / a.timerSec) * 100 : 0}%` }} />
          </span>
          <button className="ds-icon-btn" onClick={timer.toggle} aria-label={timer.running ? 'Pause timer' : 'Start timer'}>
            {timer.running ? <IconPause /> : <IconPlay />}
          </button>
          <button className="ds-icon-btn" onClick={timer.reset} aria-label="Reset timer"><IconReset /></button>
        </div>
      )}

      {expanded && hasChildren && (
        <div className="rt-children">
          {row.children.map(child => (
            <button
              key={child.id}
              className={`rt-child${child.done ? ' is-done' : ''}`}
              onClick={() => onToggleChild(a, child.id)}
              aria-pressed={child.done}
            >
              <span className="rt-child-box" aria-hidden>{child.done ? <IconCheck /> : null}</span>
              <span>{child.title}</span>
            </button>
          ))}
        </div>
      )}

      {expanded && !!a.variants?.length && (
        <div className="rt-variants">
          {a.variants.map(v => (
            <button
              key={v}
              className={`rt-variant${row.variant === v ? ' on' : ''}`}
              onClick={() => onToggle(a, v)}
              aria-pressed={row.variant === v}
            >{v}</button>
          ))}
        </div>
      )}

      {expanded && (
        <div className="rt-variants" style={{ gap: 'var(--sp-3)' }}>
          <button className="ds-btn ds-btn--quiet" onClick={() => onSkip(a)}>
            <IconSkip style={{ width: 18, height: 18 }} />
            {row.skipped ? 'Bring back today' : 'Set aside today'}
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREEN
// ═══════════════════════════════════════════════════════════════════════════

/** The slice of app data this screen reads and writes. */
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showWeek, setShowWeek] = useState(false);
  const [dismissedReminders, setDismissedReminders] = useState<string[]>([]);

  // Day rollover: when the Paris date changes while the app sits on the desk,
  // follow it — but only if the user was looking at the old "today" rather
  // than deliberately browsing another day.
  const prevToday = useRef(today);
  useEffect(() => {
    if (prevToday.current !== today) {
      setViewDate(v => (v === prevToday.current ? today : v));
      setDismissedReminders([]);
      prevToday.current = today;
    }
  }, [today]);

  // Memoised so the `|| []` fallbacks don't hand every downstream useMemo a
  // fresh array on each render and defeat the memoisation entirely.
  const activities: RoutineActivity[] = useMemo(
    () => data?.routineActivities || EMPTY, [data?.routineActivities]);
  const log: unknown[] = useMemo(() => data?.progressLog || EMPTY, [data?.progressLog]);

  const index = useMemo(() => buildCompletionIndex(log), [log]);
  const groups: ResolvedGroup[] = useMemo(
    () => resolveDay(activities, index, viewDate), [activities, index, viewDate]);
  const allRows = useMemo(() => groups.flatMap(g => g.rows), [groups]);
  const progress = useMemo(() => dayProgressFromRows(allRows), [allRows]);
  const week = useMemo(
    () => weekProgress(activities, index, viewDate, today), [activities, index, viewDate, today]);
  const upNext = useMemo(
    () => (viewDate === today ? nextUp(activities, index, viewDate, now) : null),
    [activities, index, viewDate, today, now]);

  const persistLog = useCallback((nextLog: unknown[]) => {
    onPersist({ ...data, progressLog: nextLog, lastModified: new Date().toISOString() });
  }, [data, onPersist]);

  const handleToggle = useCallback((a: RoutineActivity, variant?: string) => {
    persistLog(toggleActivity(log, a, viewDate, index, variant ? { variant } : undefined));
  }, [log, viewDate, index, persistLog]);

  const handleToggleChild = useCallback((a: RoutineActivity, childId: string) => {
    persistLog(toggleChild(log, a, childId, viewDate, index));
  }, [log, viewDate, index, persistLog]);

  const handleSkip = useCallback((a: RoutineActivity) => {
    persistLog(toggleSkip(log, a, viewDate, index));
  }, [log, viewDate, index, persistLog]);

  const saveActivities = useCallback((next: RoutineActivity[]) => {
    onPersist({ ...data, routineActivities: next, lastModified: new Date().toISOString() });
  }, [data, onPersist]);

  // ── In-app reminders. Only while the app is open, and only for the four
  // activities that carry a clock time — see the notification note in
  // DEPLOY.md for why background delivery needs Web Push. ──
  const reminders = useMemo(() => {
    if (viewDate !== today) return [];
    const nowMin = minutesOfDay(now);
    return allRows.filter(row => {
      if (row.done || row.skipped) return false;
      const min = startMinutes(row.activity);
      if (min == null) return false;
      // Due within the last 30 minutes — recent enough to act on.
      return nowMin >= min && nowMin - min <= 30 && !dismissedReminders.includes(row.activity.id);
    });
  }, [allRows, viewDate, today, now, dismissedReminders]);

  const relDays = daysBetween(today, viewDate);
  const relLabel = relDays === 0 ? 'Today'
    : relDays === 1 ? 'Tomorrow'
    : relDays === -1 ? 'Yesterday'
    : relDays > 0 ? `In ${relDays} days`
    : `${Math.abs(relDays)} days ago`;

  return (
    <div className="rt">
      <header className="rt-head">
        <div>
          <div className="ds-eyebrow">Routine</div>
          <div className="rt-head-top">
            <h1 className="rt-date">{formatDayAnchor(viewDate)}</h1>
            <div className="rt-daynav">
              <button className="ds-icon-btn" onClick={() => setViewDate(addDaysKey(viewDate, -1))} aria-label="Previous day"><IconChevronLeft /></button>
              <button className="ds-btn ds-btn--quiet" onClick={() => setViewDate(today)} disabled={viewDate === today}>Today</button>
              <button className="ds-icon-btn" onClick={() => setViewDate(addDaysKey(viewDate, 1))} aria-label="Next day"><IconChevronRight /></button>
              <button className="ds-icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Routine settings"><IconCog /></button>
            </div>
          </div>
          {viewDate !== today && <div className="rt-date-rel">{relLabel}</div>}

          {upNext && (
            <div className="rt-next">
              <span className="ds-eyebrow">Next</span>
              <span className="t">{timingLabel(upNext.activity)}</span>
              <span>{upNext.activity.title}</span>
            </div>
          )}

        </div>

        <div className="rt-score">
          <div className="rt-week" role="group" aria-label="This week">
            {week.days.map(d => {
              const cls = [
                'rt-week-day',
                d.isToday ? 'is-today' : '',
                d.key === viewDate ? 'is-selected' : '',
                d.isFuture ? 'is-future' : '',
                d.total > 0 && d.completed === d.total ? 'is-full' : '',
              ].filter(Boolean).join(' ');
              return (
                <button
                  key={d.key}
                  className={cls}
                  onClick={() => setViewDate(d.key)}
                  aria-label={`${dayNameShort(d.key)} ${dayOfMonth(d.key)} — ${d.isFuture ? 'not yet' : `${d.pct}%`}`}
                  aria-pressed={d.key === viewDate}
                >
                  <span className="rt-week-bar"><i style={{ height: d.isFuture ? 0 : `${Math.max(d.pct, d.pct > 0 ? 8 : 0)}%` }} /></span>
                  <span className="rt-week-label">{dayNameShort(d.key).slice(0, 2)}</span>
                </button>
              );
            })}
          </div>

          <div className="rt-score-fig">
            <div className={`rt-pct${progress.total > 0 && progress.completed === progress.total ? ' is-complete' : ''}`}>
              {progress.pct}%
            </div>
            <div className="rt-counts">
              {progress.completed} of {progress.total} done
              {progress.remaining > 0 && ` · ${progress.remaining} left`}
              {progress.skipped > 0 && ` · ${progress.skipped} aside`}
            </div>
            <div className={`ds-meter${progress.total > 0 && progress.completed === progress.total ? ' ds-meter--done' : ''}`}>
              <i style={{ width: `${progress.pct}%` }} />
            </div>
          </div>
        </div>
      </header>

      {reminders.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginBottom: 'var(--sp-5)' }}>
          {reminders.map(row => (
            <div key={row.activity.id} className="shell-sync" style={{ borderColor: 'var(--accent-line)', background: 'var(--accent-tint)', color: 'var(--ink-2)', fontSize: 'var(--t-meta)' }}>
              <strong style={{ color: 'var(--ink)' }}>{timingLabel(row.activity)}</strong>
              <span>{row.activity.title} is due.</span>
              <button style={{ color: 'var(--accent)' }} onClick={() => handleToggle(row.activity)}>Mark done</button>
              <button
                style={{ color: 'var(--ink-3)', textDecoration: 'none' }}
                onClick={() => setDismissedReminders(ids => [...ids, row.activity.id])}
                aria-label="Dismiss reminder"
              ><IconX style={{ width: 16, height: 16 }} /></button>
            </div>
          ))}
        </div>
      )}

      {allRows.length === 0 ? (
        <div className="ds-card ds-empty">
          Nothing scheduled for this day. Open routine settings to add an activity.
        </div>
      ) : (
        <div className="rt-groups">
          {groups.map(group => {
            const counted = group.rows.filter(r => r.counts);
            const doneCount = counted.filter(r => r.done).length;
            return (
              <section
                key={group.id}
                className={`rt-group${group.id === 'optional' ? ' rt-group--optional' : ''}`}
              >
                <div className="rt-group-head">
                  <h2>
                    {group.title}
                    {group.hint && <span className="hint">{group.hint}</span>}
                  </h2>
                  {counted.length > 0 && (
                    <span className="rt-group-tally">{doneCount}/{counted.length}</span>
                  )}
                </div>
                {group.rows.map(row => (
                  <ActivityRow
                    key={row.activity.id}
                    row={row}
                    date={viewDate}
                    today={today}
                    now={now}
                    expanded={expandedId === row.activity.id}
                    onExpand={setExpandedId}
                    onToggle={handleToggle}
                    onToggleChild={handleToggleChild}
                    onSkip={handleSkip}
                  />
                ))}
              </section>
            );
          })}
        </div>
      )}

      <section className="rt-group rt-weekly">
        <div className="rt-group-head">
          <h2>This week</h2>
          <button
            className="ds-btn ds-btn--quiet"
            onClick={() => setShowWeek(v => !v)}
            aria-expanded={showWeek}
          >
            {week.pct}% so far {showWeek ? '· hide' : '· details'}
          </button>
        </div>
        {showWeek && (
          <>
            <div className="rt-weekly-summary">
              <span>{week.completed} of {week.total} completed</span>
              <span>{week.days.filter(d => !d.isFuture && d.total > 0 && d.completed === d.total).length} full days</span>
            </div>
            <div className="rt-weekly-grid">
              {week.stats.map(stat => {
                const denom = stat.plannedThisWeek || 1;
                const full = stat.completed >= stat.plannedThisWeek;
                return (
                  <div key={stat.id} className={`rt-stat${full ? ' is-full' : ''}`} data-cat={stat.category}>
                    <div className="rt-stat-top">
                      <span className="rt-stat-name">{stat.title}</span>
                      <span className="rt-stat-val">{stat.completed}/{stat.plannedThisWeek}</span>
                    </div>
                    <div className="ds-meter"><i style={{ width: `${Math.min(100, (stat.completed / denom) * 100)}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

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
