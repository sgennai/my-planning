// The Routine dashboard — cinematic control centre.
//
// Visual contract: cinematic-routine-claude-kit/reference/
// APPROVED-cinematic-landscape.png. Landscape is the asymmetric bento of
// that reference: a left analytical column (the daily instrument with its
// weekly graph, and the podcast panel) beside a dense three-column matrix
// of photographic activity tiles.
//
// The whole tile completes an activity in one tap. Secondary controls are
// separate real buttons, kept clear of the status mark.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RoutineActivity } from './model';
import {
  buildCompletionIndex, resolveActivity, activitiesForDay, dayProgressFromRows,
  weekProgress, toggleActivity, isOverdue,
  type ResolvedActivity,
} from './engine';
import { dayKeyOf, dayNameShort, type DayKey } from './dates';
import { dayParts, metaFor } from './format';
import { ActivityIcon } from './activity-icons';
import { ActivityPhoto } from './ActivityPhoto';
import { photoFor, iconFor } from './photo-manifest';
import { RoutineSettings } from './RoutineSettings';
import { RoutineTimer } from './RoutineTimer';
import { useClock } from '../ui/useClock';
import { IconCog, IconClock, IconEllipsis, IconPlay } from '../ui/icons';

const EMPTY: never[] = [];
const PODCAST_ID = 'ra-podcast';

function useMinuteClock(): Date {
  const minute = useClock(60000);
  return useMemo(() => new Date(minute), [minute]);
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round">
      <path className="mark" d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

/** Status mark shared by the tiles and the podcast panel. */
function Status({ row }: { row: ResolvedActivity }) {
  const partial = row.children.length > 0 && row.childrenDone > 0 && !row.done;
  return (
    <span className={`cin-status${partial ? ' part' : ''}`} aria-hidden>
      {row.done ? <Check /> : partial ? `${row.childrenDone}/${row.children.length}` : null}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TILE
// ═══════════════════════════════════════════════════════════════════════════

interface TileProps {
  row: ResolvedActivity;
  index: number;
  span: number;
  date: DayKey;
  today: DayKey;
  now: Date;
  onToggle: (a: RoutineActivity) => void;
  onSecondary: (a: RoutineActivity) => void;
}

function Tile({ row, index, span, date, today, now, onToggle, onSecondary }: TileProps) {
  const a = row.activity;
  const late = isOverdue(row, date, today, now);
  const optional = a.required === false;
  const timed = a.timing.type === 'fixed';
  const parts = row.children.length >= 3 ? row.children.map(c => c.title).join(', ') : null;
  const meta = parts || metaFor(a);
  // A timer or a link is a genuinely available secondary action; nothing
  // else earns the control, so the tile shows none.
  const secondary = !!a.timerSec || !!a.link?.url;

  return (
    <div
      className="cin-cell"
      style={{ '--i': index, gridColumn: span > 1 ? `span ${span}` : undefined } as React.CSSProperties}
    >
      <button
        className={`cin-tile${row.done ? ' done' : ''}${row.skipped ? ' skipped' : ''}`}
        onClick={() => onToggle(a)}
        aria-pressed={row.done}
        aria-label={`${a.title}${meta ? `, ${meta}` : ''}${optional ? ', optional' : ''}. ${row.done ? 'Completed' : 'Not completed'}.`}
      >
        <ActivityPhoto className="cin-photo" name={photoFor(a)} icon={a.icon} iconFallback={iconFor(a)} />
        {row.done && <span className="cin-sweep" aria-hidden />}

        <span className="cin-tile-body">
          <span className="cin-tile-row">
            <span className="cin-tile-icon" aria-hidden><ActivityIcon name={a.icon} fallback={iconFor(a)} /></span>
            <Status row={row} />
          </span>
          <span className="cin-tile-title">{a.title}</span>
          {(meta || late) && (
            <span className="cin-tile-meta">
              {timed ? (
                <span className="cin-time"><IconClock />{(a.timing as { start: string }).start}</span>
              ) : (row.skipped ? 'Set aside' : meta)}
              {late && <span style={{ color: 'var(--mint)' }}> · due</span>}
            </span>
          )}
          {optional && <span className="cin-chip">OPTIONAL</span>}
        </span>
      </button>

      {secondary && (
        <button
          className="cin-more"
          onClick={() => onSecondary(a)}
          aria-label={a.timerSec ? `Start the timer for ${a.title}` : (a.link?.label || `Open the link for ${a.title}`)}
        ><IconEllipsis /></button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HERO — the daily instrument and the week
// ═══════════════════════════════════════════════════════════════════════════

function Hero({ done, total, week, viewDate }: {
  done: number; total: number;
  week: ReturnType<typeof weekProgress>;
  viewDate: DayKey;
}) {
  const R = 86;
  const C = 2 * Math.PI * R;
  const pct = total === 0 ? 0 : done / total;

  // The week's average is over days that have actually come round.
  const elapsed = week.days.filter(d => !d.isFuture || d.completed > 0);
  const avgDone = elapsed.length ? Math.round(elapsed.reduce((s, d) => s + d.completed, 0) / elapsed.length) : 0;
  const avgTotal = elapsed.length ? Math.round(elapsed.reduce((s, d) => s + d.total, 0) / elapsed.length) : 0;

  return (
    <section className="cin-hero" style={{ '--i': 0 } as React.CSSProperties}>
      <ActivityPhoto className="cin-hero-plate" name="summit" icon="target" />

      <div className="cin-ring-wrap">
        <div className="cin-ring">
          <svg viewBox="0 0 200 200" aria-hidden>
            <defs>
              <linearGradient id="cinArc" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#5FB0FF" />
                <stop offset="55%" stopColor="#2C8CFF" />
                <stop offset="100%" stopColor="#1E5BE0" />
              </linearGradient>
            </defs>
            <circle className="track" cx="100" cy="100" r={R} fill="none" strokeWidth="13" />
            <circle
              className="arc"
              cx="100" cy="100" r={R}
              fill="none"
              strokeWidth="13"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - pct)}
            />
          </svg>
          <div className="cin-ring-read">
            <div className="cin-count">{done}<span className="of"> / {total}</span></div>
            <div className="cin-count-label">TODAY<br />COMPLETED</div>
          </div>
        </div>
      </div>

      <p className="cin-motto">Small things, done daily.</p>

      <div className="cin-weekly">
        <div className="cin-weekly-top">
          <span className="cin-weekly-title">YOUR WEEK</span>
          <span className="cin-weekly-avg"><b>{avgDone}</b> / {avgTotal} avg</span>
        </div>
        <div className="cin-chart">
          <div className="cin-grid" aria-hidden>
            <i style={{ top: 0 }}><span>100%</span></i>
            <i style={{ top: '50%' }}><span>50%</span></i>
            <i style={{ bottom: 0 }}><span>0%</span></i>
          </div>
          <div className="cin-bars">
            {week.days.map(d => (
              <div key={d.key} className={`cin-bar-col${d.key === viewDate ? ' on' : ''}`}>
                <span className="cin-bar">
                  <i style={{ height: `${Math.max(d.pct, d.pct > 0 ? 7 : 0)}%` }} />
                </span>
                <span className="cin-bar-label">{dayNameShort(d.key).slice(0, 2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PODCAST PANEL — the daily Podcast activity, as its own media card
// ═══════════════════════════════════════════════════════════════════════════

// A fixed decorative profile: the waveform is artwork, not a scrubber, and
// must never imply a position in an episode.
const WAVE = [28, 52, 38, 70, 46, 88, 60, 96, 54, 76, 40, 64, 34, 80, 48, 92, 58, 72, 42, 60, 30, 50, 36, 66, 44, 84, 52, 38, 28, 46];

function PodcastPanel({ row, onToggle }: { row: ResolvedActivity; onToggle: (a: RoutineActivity) => void }) {
  const a = row.activity;
  const link = a.link?.url;
  return (
    <section className="cin-cell" style={{ '--i': 1 } as React.CSSProperties}>
      <button
        className={`cin-pod${row.done ? ' done' : ''}`}
        onClick={() => onToggle(a)}
        aria-pressed={row.done}
        aria-label={`${a.title}. ${row.done ? 'Completed' : 'Not completed'}.`}
      >
        <ActivityPhoto className="cin-pod-plate" name={photoFor(a)} icon={a.icon} iconFallback={iconFor(a)} />
        {row.done && <span className="cin-sweep" aria-hidden />}

        <div>
          <div className="cin-pod-eyebrow">PODCAST</div>
          {/* No episode is connected, so the panel says what it is rather
              than inventing a title, a duration or a playback position. */}
          <div className="cin-pod-title">{a.title}</div>
          <div className="cin-pod-sub">{a.description || 'Listen today'}</div>
        </div>

        <div className="cin-pod-foot">
          <span className="cin-wave" aria-hidden>
            {WAVE.map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}
          </span>
          <Status row={row} />
        </div>
      </button>

      {link && (
        <a
          className="cin-play"
          href={link}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={a.link?.label || 'Open podcasts'}
          onClick={e => e.stopPropagation()}
        ><IconPlay /></a>
      )}
    </section>
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

type Persist = (
  next: RoutineScreenData | ((current: RoutineScreenData) => RoutineScreenData),
) => void;

interface Props {
  data: RoutineScreenData;
  onPersist: Persist;
}

export function RoutineScreen({ data, onPersist }: Props) {
  const now = useMinuteClock();
  const today = useMemo(() => dayKeyOf(now), [now]);
  const [viewDate, setViewDate] = useState<DayKey>(today);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [timerFor, setTimerFor] = useState<RoutineActivity | null>(null);

  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setIntro(false), 900);
    return () => window.clearTimeout(id);
  }, []);

  // On a phone the header sticks with only its week strip in view, and
  // takes a backing once the date above it has scrolled away. Elsewhere the
  // date never leaves the screen, so this stays false.
  const titleRef = useRef<HTMLDivElement>(null);
  const [headStuck, setHeadStuck] = useState(false);
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setHeadStuck(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

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

  const rows: ResolvedActivity[] = useMemo(() => {
    const all = activitiesForDay(activities, viewDate, 'routine')
      .map(a => resolveActivity(a, index, viewDate));
    const required = all.filter(r => r.activity.required !== false);
    const optional = all.filter(r => r.activity.required === false);
    return [...required, ...optional];
  }, [activities, index, viewDate]);

  // Progress counts every scheduled activity, the podcast included — only
  // its presentation moves to the left column.
  const progress = useMemo(() => dayProgressFromRows(rows), [rows]);
  const week = useMemo(
    () => weekProgress(activities, index, viewDate, today), [activities, index, viewDate, today]);

  const podcastRow = rows.find(r => r.activity.id === PODCAST_ID) || null;
  const tiles = useMemo(() => rows.filter(r => r.activity.id !== PODCAST_ID), [rows]);

  // Short days leave gaps in a three-column matrix; the last tiles widen so
  // the composition closes instead of trailing off into empty cells.
  const spans = useMemo(() => {
    const n = tiles.length;
    const rem = n % 3;
    return tiles.map((_, i) => {
      if (rem === 0) return 1;
      if (rem === 1 && i === n - 1) return 3;
      if (rem === 2 && i === n - 2) return 2;
      return 1;
    });
  }, [tiles]);

  /**
   * Completion writes go through the updater form so each tap builds on the
   * state the previous tap produced. Computing the next log from this
   * render's `log` loses a completion whenever two tiles are tapped inside
   * one frame — and the lost record is tombstoned, so the loss syncs.
   */
  const handleToggle = useCallback((a: RoutineActivity) => {
    onPersist((current: RoutineScreenData) => {
      const currentLog = current.progressLog || EMPTY;
      return {
        ...current,
        progressLog: toggleActivity(currentLog, a, viewDate, buildCompletionIndex(currentLog)),
        lastModified: new Date().toISOString(),
      };
    });
  }, [viewDate, onPersist]);

  const handleSecondary = useCallback((a: RoutineActivity) => {
    if (a.timerSec) { setTimerFor(a); return; }
    if (a.link?.url) window.open(a.link.url, '_blank', 'noopener,noreferrer');
  }, []);

  const saveActivities = useCallback((next: RoutineActivity[]) => {
    onPersist((current: RoutineScreenData) => ({
      ...current, routineActivities: next, lastModified: new Date().toISOString(),
    }));
  }, [onPersist]);

  const parts = dayParts(viewDate);

  return (
    <div className="cin">
      <header className={`cin-head${headStuck ? ' stuck' : ''}`}>
        <div ref={titleRef}>
          <h1 className="cin-date">{parts.name}, {parts.rest.replace(/ \d{4}$/, '')}</h1>
          <div className="cin-sub">make today count</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div className="cin-week" role="group" aria-label="This week">
            {week.days.map(d => (
              <button
                key={d.key}
                className={`cin-day${d.key === viewDate ? ' on' : ''}${d.key === today ? ' today' : ''}${d.completed > 0 ? ' has' : ''}`}
                onClick={() => setViewDate(d.key)}
                aria-pressed={d.key === viewDate}
                aria-label={`${dayNameShort(d.key)}${d.key === today ? ', today' : ''} — ${d.completed} of ${d.total} completed`}
              >
                <span>{dayNameShort(d.key).slice(0, 2)}</span>
                <span className="dot" aria-hidden />
              </button>
            ))}
          </div>
          <button className="cin-gear" onClick={() => setSettingsOpen(true)} aria-label="Routine settings"><IconCog /></button>
        </div>
      </header>

      <div className={`cin-body${intro ? ' intro' : ''}`} key={viewDate}>
        <div className="cin-left">
          <Hero done={progress.completed} total={progress.total} week={week} viewDate={viewDate} />
          {podcastRow
            ? <PodcastPanel row={podcastRow} onToggle={handleToggle} />
            : <div className="cin-pod" style={{ display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: 12 }}>No podcast scheduled</div>}
        </div>

        <div className={`cin-matrix${intro ? ' intro' : ''}`}>
          {tiles.map((row, i) => (
            <Tile
              key={row.activity.id}
              row={row}
              index={i + 2}
              span={spans[i]}
              date={viewDate}
              today={today}
              now={now}
              onToggle={handleToggle}
              onSecondary={handleSecondary}
            />
          ))}
        </div>
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
