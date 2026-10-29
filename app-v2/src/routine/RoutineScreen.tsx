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
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RoutineActivity, RoutineLink } from './model';
import {
  buildCompletionIndex, resolveActivity, activitiesForDay, dayProgressFromRows,
  weekProgress, toggleActivity, setSetCount, isOverdue, linksOf, timerOf,
  type ResolvedActivity,
} from './engine';
import { dayKeyOf, dayNameShort, type DayKey } from './dates';
import { dayParts, metaFor } from './format';
import { ActivityIcon } from './activity-icons';
import { ActivityPhoto } from './ActivityPhoto';
import { photoFor, iconFor } from './photo-manifest';
import { RoutineSettings } from './RoutineSettings';
import { RoutineTimer } from './RoutineTimer';
import { SetRing } from './SetRing';
import { withDayPlans } from './day-plan';
import { useClock } from '../ui/useClock';
import { IconCog, IconClock, IconEllipsis, IconLink, IconPlay, IconX } from '../ui/icons';

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
    <span className={`cin-status${partial ? ' part' : ''}${row.sets ? ' has-sets' : ''}`} aria-hidden>
      {row.done ? <Check /> : partial ? `${row.childrenDone}/${row.children.length}` : null}
      {row.sets > 0 && <SetRing sets={row.sets} done={row.setsDone} />}
    </span>
  );
}

/** What a tap on the tile did, said in words, so a stray tap is noticed. */
function stateLabel(row: ResolvedActivity): string {
  if (!row.sets) return row.done ? 'Completed.' : 'Not completed.';
  if (row.done) return `All ${row.sets} sets done. Tap to start again.`;
  return `${row.setsDone} of ${row.sets} sets done. Tap to log set ${row.setsDone + 1}.`;
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
  const links = linksOf(a);
  const [launching, setLaunching] = useState(false);
  const launcherId = useId();
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeLauncher = useCallback((refocus: boolean) => {
    setLaunching(false);
    if (refocus) openerRef.current?.focus();
  }, []);

  return (
    <div
      className="cin-cell"
      style={{ '--i': index, gridColumn: span > 1 ? `span ${span}` : undefined } as React.CSSProperties}
    >
      <button
        className={`cin-tile${row.done ? ' done' : ''}${row.skipped ? ' skipped' : ''}`}
        onClick={() => onToggle(a)}
        aria-pressed={row.done}
        aria-label={`${a.title}${meta ? `, ${meta}` : ''}${optional ? ', optional' : ''}. ${stateLabel(row)}`}
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

      {timerOf(a) ? (
        <button className="cin-more" onClick={() => onSecondary(a)} aria-label={`Start the timer for ${a.title}`}>
          <IconEllipsis />
        </button>
      ) : links.length === 1 ? (
        <a className="cin-more" href={links[0].url} target="_blank" rel="noopener noreferrer" aria-label={links[0].label}>
          <IconLink />
        </a>
      ) : links.length > 1 && (
        <>
          <button
            ref={openerRef}
            className="cin-more"
            onClick={() => setLaunching(true)}
            aria-expanded={launching}
            aria-controls={launching ? launcherId : undefined}
            aria-label={`Links for ${a.title}`}
          ><IconLink /></button>
          {launching && <LinkLauncher id={launcherId} title={a.title} links={links} onClose={closeLauncher} />}
        </>
      )}
    </div>
  );
}

// Several links open as a launcher over their tile: one large named button
// each, and a close button. A pick opens its link and closes the launcher;
// so do Escape and a tap anywhere else.
function LinkLauncher({ id, title, links, onClose }: {
  id: string;
  title: string;
  links: RoutineLink[];
  onClose: (refocus: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Stacked under a caption on a tile tall enough for every button; side by
  // side on a short one (an iPad in portrait, an iPhone row).
  const [stacked, setStacked] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setStacked(el.clientHeight >= 42 + links.length * 40);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    el.focus({ preventScroll: true });
    return () => ro.disconnect();
  }, [links.length]);

  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(true); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      id={id}
      className={`cin-launch${stacked ? ' stacked' : ''}`}
      role="group"
      aria-label={`${title} links`}
      tabIndex={-1}
      style={{ '--n': links.length } as React.CSSProperties}
    >
      <span className="cin-launch-cap" aria-hidden>{title}</span>
      <button type="button" className="cin-launch-x" onClick={() => onClose(true)} aria-label="Close links">
        <IconX />
      </button>
      {links.map((l, i) => (
        <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" onClick={() => onClose(false)}>{l.label}</a>
      ))}
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

function PodcastPanel({ row, onToggle, listAt }: {
  row: ResolvedActivity;
  onToggle: (a: RoutineActivity) => void;
  /** Its place among the tiles, for the copy a phone shows in the list. */
  listAt?: number;
}) {
  const a = row.activity;
  const link = linksOf(a)[0];
  return (
    <section
      className={`cin-cell${listAt === undefined ? '' : ' cin-pod-in-list'}`}
      style={{ '--i': listAt === undefined ? 1 : listAt + 2 } as React.CSSProperties}
    >
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
          href={link.url}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={link.label}
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

  // Keep a record of what today's routine holds, and plan any past ticked day
  // that has none, for reporting later (see day-plan.ts). Written through the
  // updater so it builds on whatever the latest tap left.
  useEffect(() => {
    if (withDayPlans(log, activities, today) === log) return;
    onPersist((current: RoutineScreenData) => {
      const currentLog = current.progressLog || EMPTY;
      const next = withDayPlans(currentLog, current.routineActivities || EMPTY, today);
      return next === currentLog ? current : { ...current, progressLog: next, lastModified: new Date().toISOString() };
    });
  }, [log, activities, today, onPersist]);

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
  // Rows before the podcast are all tiles, so this is also its place among them.
  const podcastAt = rows.findIndex(r => r.activity.id === PODCAST_ID);

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

  // After each tap on an activity done in sets, a short note of where it
  // stands, with an undo: a stray tap while scrolling, or the tap that starts
  // a finished day again, would otherwise cost logged sets.
  const [setNote, setSetNote] = useState<{
    activity: RoutineActivity; date: DayKey; text: string; undoTo: number; key: number;
  } | null>(null);

  useEffect(() => {
    if (!setNote) return;
    const id = window.setTimeout(() => setSetNote(null), 5000);
    return () => window.clearTimeout(id);
  }, [setNote]);

  const handleTap = useCallback((a: RoutineActivity) => {
    const row = rows.find(r => r.activity.id === a.id);
    handleToggle(a);
    if (!row?.sets) return;
    const after = row.done ? 0 : row.setsDone + 1;
    setSetNote({
      activity: a,
      date: viewDate,
      undoTo: row.done ? row.sets : row.setsDone,
      key: Date.now(),
      text: after === 0 ? 'Started again'
        : after === row.sets ? `All ${row.sets} sets done`
        : `Set ${after} of ${row.sets}`,
    });
  }, [rows, handleToggle, viewDate]);

  const undoSet = useCallback(() => {
    if (!setNote) return;
    const { activity, date, undoTo } = setNote;
    onPersist((current: RoutineScreenData) => {
      const currentLog = current.progressLog || EMPTY;
      return {
        ...current,
        progressLog: setSetCount(currentLog, activity, date, undoTo, buildCompletionIndex(currentLog)),
        lastModified: new Date().toISOString(),
      };
    });
    setSetNote(null);
  }, [setNote, onPersist]);

  const handleSecondary = useCallback((a: RoutineActivity) => {
    if (timerOf(a)) setTimerFor(a);
  }, []);

  const saveActivities = useCallback((next: RoutineActivity[]) => {
    onPersist((current: RoutineScreenData) => ({
      ...current, routineActivities: next, lastModified: new Date().toISOString(),
    }));
  }, [onPersist]);

  const parts = dayParts(viewDate);

  return (
    <div className="cin">
      <header className="cin-head">
        <div>
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
            <Fragment key={row.activity.id}>
              {/* A phone lists the podcast at its place in the order; elsewhere
                  this copy is hidden and the panel above stands. */}
              {podcastRow && i === podcastAt && (
                <PodcastPanel row={podcastRow} onToggle={handleToggle} listAt={podcastAt} />
              )}
              <Tile
                row={row}
                index={i + 2}
                span={spans[i]}
                date={viewDate}
                today={today}
                now={now}
                onToggle={handleTap}
                onSecondary={handleSecondary}
              />
            </Fragment>
          ))}
          {podcastRow && podcastAt === tiles.length && (
            <PodcastPanel row={podcastRow} onToggle={handleToggle} listAt={podcastAt} />
          )}
        </div>
      </div>

      {setNote && setNote.date === viewDate && (
        <div className="cin-note" role="status" key={setNote.key}>
          <span>{setNote.text}</span>
          <button type="button" onClick={undoSet}>Undo</button>
        </div>
      )}

      {timerFor && (
        <RoutineTimer
          activity={timerFor}
          done={rows.find(r => r.activity.id === timerFor.id)?.done ?? false}
          onComplete={() => handleTap(timerFor)}
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
