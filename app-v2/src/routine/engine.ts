// Recurrence resolution, completion records, and progress maths.
//
// Completion storage: one record per activity per Europe/Paris day, kept in
// `data.progressLog` — an existing synced collection with per-record
// last-write-wins. The id is deterministic (`rc:<refId>:<dayKey>`), so the same
// tick made on two devices converges on one record instead of duplicating, and
// two devices ticking *different* activities on the same day no longer clobber
// each other the way the old whole-map `routineCompletions` singleton did.
//
// Un-ticking removes the record, which `saveData` turns into a tombstone and
// sync propagates. History is append-only in practice: past days are never
// rewritten by a new day starting.

import type {
  RoutineActivity, RoutineChild, RoutineCategory, RoutineLink, RoutineSurface, Weekday,
} from './model';
import { ROUTINE_GROUPS } from './model';
import type { DayKey } from './dates';
import { dayOfWeek, todayKey, weekKeys, minutesOfDay, daysBetween } from './dates';

export const COMPLETION_TYPE = 'routine-completion';

export type CompletionState = 'done' | 'skipped';

export interface RoutineCompletion {
  id: string;
  type: typeof COMPLETION_TYPE;
  /** Activity id, or `activityId/childId` for a child of a grouped activity. */
  refId: string;
  /** When the tick happened — a real instant, kept for timestamps and audit. */
  at: string;
  value: {
    date: DayKey;
    state: CompletionState;
    /** Which variant was performed, for activities offering a choice. */
    variant?: string;
    note?: string;
  };
}

/** `activityId` or `activityId/childId`. */
export function refIdFor(activityId: string, childId?: string | null): string {
  return childId ? `${activityId}/${childId}` : activityId;
}

export function completionId(refId: string, date: DayKey): string {
  return `rc:${refId}:${date}`;
}

/** Fast lookup of completion records by `refId` + day. */
export type CompletionIndex = Map<string, RoutineCompletion>;

function indexKey(refId: string, date: DayKey): string {
  return `${refId}|${date}`;
}

export function isCompletionRecord(rec: unknown): rec is RoutineCompletion {
  if (!rec || typeof rec !== 'object') return false;
  const r = rec as Record<string, unknown>;
  const v = r.value as Record<string, unknown> | undefined;
  return r.type === COMPLETION_TYPE
    && typeof r.refId === 'string'
    && !!v && typeof v.date === 'string';
}

/**
 * Build the lookup index from the raw progress log. Linear in the log size and
 * memoised by the caller, so a year of history costs one pass per data change
 * rather than a scan per rendered row.
 */
export function buildCompletionIndex(progressLog: unknown[] | undefined): CompletionIndex {
  const index: CompletionIndex = new Map();
  for (const rec of progressLog || []) {
    if (!isCompletionRecord(rec)) continue;
    index.set(indexKey(rec.refId, rec.value.date), rec);
  }
  return index;
}

export function completionFor(
  index: CompletionIndex, activityId: string, date: DayKey, childId?: string | null,
): RoutineCompletion | undefined {
  return index.get(indexKey(refIdFor(activityId, childId), date));
}

export function stateOf(
  index: CompletionIndex, activityId: string, date: DayKey, childId?: string | null,
): CompletionState | null {
  return completionFor(index, activityId, date, childId)?.value.state ?? null;
}

// ═════════════════════════════════════════════════════════════════════════
// RECURRENCE
// ═════════════════════════════════════════════════════════════════════════

/** Does this activity apply on this Europe/Paris day? */
export function occursOn(activity: RoutineActivity, date: DayKey): boolean {
  if (activity.status !== 'active') return false;
  const sched = activity.schedule;
  if (!sched || sched.type === 'daily') return true;
  if (sched.type === 'weekdays') {
    const dow = dayOfWeek(date) as Weekday;
    return Array.isArray(sched.days) && sched.days.includes(dow);
  }
  return true;
}

function reachesSurface(activity: RoutineActivity, surface: RoutineSurface): boolean {
  const s = activity.surface || 'routine';
  return s === surface || s === 'both';
}

/** Active activities for a day, filtered to one surface and sorted for display. */
export function activitiesForDay(
  activities: RoutineActivity[],
  date: DayKey,
  surface: RoutineSurface = 'routine',
): RoutineActivity[] {
  return (activities || [])
    .filter(a => reachesSurface(a, surface) && occursOn(a, date))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// ═════════════════════════════════════════════════════════════════════════
// RESOLVED ROWS — what the dashboard actually renders
// ═════════════════════════════════════════════════════════════════════════

export interface ResolvedChild extends RoutineChild {
  done: boolean;
}

export interface ResolvedActivity {
  activity: RoutineActivity;
  /** Complete: for a grouped activity, true only when every child is done. */
  done: boolean;
  /** Explicitly set aside for the day — not a failure, not a completion. */
  skipped: boolean;
  /** Children with their own tick state; empty for a plain activity. */
  children: ResolvedChild[];
  /** Children done / children total, for the group's progress hint. */
  childrenDone: number;
  /** Sets a day for an activity done in sets, else 0. */
  sets: number;
  /** Sets logged so far today; done once it reaches `sets`. */
  setsDone: number;
  /** Counts toward the day's score: required, and not skipped. */
  counts: boolean;
  variant?: string;
  completedAt?: string;
}

function hasChildren(a: RoutineActivity): boolean {
  return Array.isArray(a.children) && a.children.length > 0;
}

/** Sets a day, or 0 for an activity ticked once. */
export function setsOf(a: RoutineActivity): number {
  const n = a.sets;
  return !hasChildren(a) && typeof n === 'number' && Number.isInteger(n) && n >= 2 ? n : 0;
}

/** The countdown's length in seconds, or 0 when it has none or it is switched off. */
export function timerOf(a: RoutineActivity): number {
  const s = a.timerSec;
  return !a.timerOff && typeof s === 'number' && s > 0 ? s : 0;
}

/**
 * The links a tile opens, in order. Data from before `links` carries a single
 * `link`, read as a list of one. A link without an address is left out, and
 * one without a name is called by its site.
 */
export function linksOf(a: RoutineActivity): RoutineLink[] {
  const list = Array.isArray(a.links) ? a.links : a.link ? [a.link] : [];
  return list
    .filter(l => typeof l?.url === 'string' && l.url.trim() !== '')
    .map(l => ({ label: l.label?.trim() || siteOf(l.url), url: l.url.trim() }));
}

function siteOf(url: string): string {
  try { return new URL(url.trim()).hostname.replace(/^www\./, ''); } catch { return url.trim(); }
}

// Each set is a record of its own, `activityId/set-<k>`, exactly like a child.
// So two devices that each log a set write different records, and sync keeps
// both rather than one overwriting the other's count.
function setRef(activityId: string, k: number): string {
  return refIdFor(activityId, `set-${k}`);
}

export function resolveActivity(
  activity: RoutineActivity, index: CompletionIndex, date: DayKey,
): ResolvedActivity {
  const own = completionFor(index, activity.id, date);
  const skipped = own?.value.state === 'skipped';
  const sets = setsOf(activity);

  let children: ResolvedChild[] = [];
  let done: boolean;
  let setsDone = 0;
  let completedAt = own?.at;

  if (sets) {
    // Like a group, a part-done activity counts as zero toward the day.
    for (let k = 1; k <= sets; k++) {
      const rec = index.get(indexKey(setRef(activity.id, k), date));
      if (rec?.value.state !== 'done') continue;
      setsDone++;
      if (!completedAt || rec.at > completedAt) completedAt = rec.at;
    }
    done = setsDone >= sets;
  } else if (hasChildren(activity)) {
    children = activity.children!.map(c => ({
      ...c,
      done: stateOf(index, activity.id, date, c.id) === 'done',
    }));
    // A group is complete only when all of its parts are. Partial counts as
    // zero, so expanding a four-item stack can never inflate the day's score.
    done = children.every(c => c.done);
  } else {
    done = own?.value.state === 'done';
  }

  return {
    activity,
    done,
    skipped,
    children,
    childrenDone: children.filter(c => c.done).length,
    sets,
    setsDone,
    counts: activity.required !== false && !skipped,
    variant: own?.value.variant,
    completedAt: sets && !done ? undefined : completedAt,
  };
}

export interface ResolvedGroup {
  id: string;
  title: string;
  hint?: string;
  rows: ResolvedActivity[];
}

/** The day's rows, grouped and ordered for the dashboard. */
export function resolveDay(
  activities: RoutineActivity[], index: CompletionIndex, date: DayKey,
): ResolvedGroup[] {
  const rows = activitiesForDay(activities, date, 'routine')
    .map(a => resolveActivity(a, index, date));

  const byGroup = new Map<string, ResolvedActivity[]>();
  for (const row of rows) {
    const g = row.activity.group || 'morning';
    const list = byGroup.get(g);
    if (list) list.push(row); else byGroup.set(g, [row]);
  }

  const known = ROUTINE_GROUPS
    .filter(g => byGroup.has(g.id))
    .map(g => ({ id: g.id, title: g.title, hint: g.hint, rows: byGroup.get(g.id)! }));

  // Any group id not in ROUTINE_GROUPS (a user-created one) still renders,
  // appended after the known groups rather than silently dropped.
  const extra = [...byGroup.keys()]
    .filter(id => !ROUTINE_GROUPS.some(g => g.id === id))
    .sort()
    .map(id => ({ id, title: id, rows: byGroup.get(id)! }));

  return [...known, ...extra];
}

// ═════════════════════════════════════════════════════════════════════════
// PROGRESS
// ═════════════════════════════════════════════════════════════════════════

export interface DayProgress {
  completed: number;
  /** Required, non-skipped activities scheduled for the day. */
  total: number;
  remaining: number;
  pct: number;
  skipped: number;
  /** Optional activities done today — reported, never scored. */
  optionalDone: number;
}

export function dayProgressFromRows(rows: ResolvedActivity[]): DayProgress {
  let completed = 0, total = 0, skipped = 0, optionalDone = 0;
  for (const row of rows) {
    if (row.skipped) { skipped++; continue; }
    if (!row.counts) {
      if (row.done) optionalDone++;
      continue;
    }
    total++;
    if (row.done) completed++;
  }
  return {
    completed,
    total,
    remaining: Math.max(0, total - completed),
    pct: total === 0 ? 0 : Math.round((completed / total) * 100),
    skipped,
    optionalDone,
  };
}

export function dayProgress(
  activities: RoutineActivity[], index: CompletionIndex, date: DayKey,
): DayProgress {
  const rows = activitiesForDay(activities, date, 'routine')
    .map(a => resolveActivity(a, index, date));
  return dayProgressFromRows(rows);
}

export interface WeekDayProgress extends DayProgress {
  key: DayKey;
  isToday: boolean;
  isFuture: boolean;
}

export interface ActivityWeekStat {
  id: string;
  title: string;
  category: RoutineCategory;
  group: string;
  completed: number;
  /** Days this week the activity was scheduled, excluding days still to come. */
  scheduled: number;
  /** Scheduled days including the rest of the week — what the plan asks for. */
  plannedThisWeek: number;
}

export interface WeekProgress {
  days: WeekDayProgress[];
  /** Completed over total across the elapsed part of the week. */
  pct: number;
  completed: number;
  total: number;
  /** Per-activity consistency, for the groups worth tracking weekly. */
  stats: ActivityWeekStat[];
}

/**
 * Week summary for the week containing `date`. Days after today contribute
 * their planned totals to `plannedThisWeek` but are excluded from the
 * percentages — an activity that hasn't come round yet is not a miss.
 */
export function weekProgress(
  activities: RoutineActivity[],
  index: CompletionIndex,
  date: DayKey,
  today: DayKey = todayKey(),
): WeekProgress {
  const keys = weekKeys(date);

  const days: WeekDayProgress[] = keys.map(key => ({
    key,
    isToday: key === today,
    isFuture: daysBetween(today, key) > 0,
    ...dayProgress(activities, index, key),
  }));

  let completed = 0, total = 0;
  for (const d of days) {
    if (d.isFuture) continue;
    completed += d.completed;
    total += d.total;
  }

  const tracked = (activities || []).filter(a =>
    (a.surface || 'routine') !== 'calendar' && a.status === 'active' && a.required !== false);

  const stats: ActivityWeekStat[] = tracked.map(a => {
    let done = 0, elapsed = 0, planned = 0;
    for (const key of keys) {
      if (!occursOn(a, key)) continue;
      planned++;
      const future = daysBetween(today, key) > 0;
      if (!future) elapsed++;
      if (resolveActivity(a, index, key).done) done++;
    }
    return {
      id: a.id,
      title: a.title,
      category: a.category,
      group: a.group,
      completed: done,
      scheduled: elapsed,
      plannedThisWeek: planned,
    };
  }).filter(s => s.plannedThisWeek > 0);

  return {
    days,
    completed,
    total,
    pct: total === 0 ? 0 : Math.round((completed / total) * 100),
    stats,
  };
}

// ═════════════════════════════════════════════════════════════════════════
// LOG MUTATION — pure functions over the progress log
// ═════════════════════════════════════════════════════════════════════════

function withoutRecord(log: unknown[], id: string): unknown[] {
  return log.filter(r => !(r as { id?: string })?.id || (r as { id: string }).id !== id);
}

/** Upsert a completion record, replacing any existing one for the same day. */
export function setCompletion(
  log: unknown[] | undefined,
  refId: string,
  date: DayKey,
  state: CompletionState,
  extra?: { variant?: string; note?: string },
): unknown[] {
  const id = completionId(refId, date);
  const record: RoutineCompletion = {
    id,
    type: COMPLETION_TYPE,
    refId,
    at: new Date().toISOString(),
    value: { date, state, ...(extra?.variant ? { variant: extra.variant } : {}), ...(extra?.note ? { note: extra.note } : {}) },
  };
  return [...withoutRecord(log || [], id), record];
}

/** Remove a completion record — the undo path. Becomes a sync tombstone. */
export function clearCompletion(
  log: unknown[] | undefined, refId: string, date: DayKey,
): unknown[] {
  return withoutRecord(log || [], completionId(refId, date));
}

/**
 * One-tap toggle for an activity row. A grouped activity ticks or clears all of
 * its children at once, so the common case stays a single tap while each part
 * remains individually tickable underneath.
 */
export function toggleActivity(
  log: unknown[] | undefined,
  activity: RoutineActivity,
  date: DayKey,
  index: CompletionIndex,
  extra?: { variant?: string },
): unknown[] {
  const resolved = resolveActivity(activity, index, date);
  let next = log || [];

  // Each tap logs the next set; the tap after the last starts the day again.
  if (resolved.sets) {
    return setSetCount(next, activity, date, resolved.done ? 0 : resolved.setsDone + 1, index);
  }

  if (hasChildren(activity)) {
    const makeDone = !resolved.done;
    for (const child of activity.children!) {
      const refId = refIdFor(activity.id, child.id);
      next = makeDone
        ? setCompletion(next, refId, date, 'done')
        : clearCompletion(next, refId, date);
    }
    // The parent record only ever carries skip/variant state for a group.
    if (makeDone && extra?.variant) {
      next = setCompletion(next, activity.id, date, 'done', extra);
    } else if (!makeDone) {
      next = clearCompletion(next, activity.id, date);
    }
    return next;
  }

  return resolved.done
    ? clearCompletion(next, activity.id, date)
    : setCompletion(next, activity.id, date, 'done', extra);
}

/**
 * Leave exactly `count` sets logged for the day: the tap path, and the undo
 * that puts back the count from before a tap. Records already there keep
 * their time; only the difference is written or removed.
 */
export function setSetCount(
  log: unknown[] | undefined,
  activity: RoutineActivity,
  date: DayKey,
  count: number,
  index: CompletionIndex,
): unknown[] {
  const sets = setsOf(activity);
  let next = log || [];
  for (let k = 1; k <= sets; k++) {
    const refId = setRef(activity.id, k);
    const has = index.get(indexKey(refId, date))?.value.state === 'done';
    if (k <= count && !has) next = setCompletion(next, refId, date, 'done');
    if (k > count && has) next = clearCompletion(next, refId, date);
  }
  return next;
}

export function toggleChild(
  log: unknown[] | undefined,
  activity: RoutineActivity,
  childId: string,
  date: DayKey,
  index: CompletionIndex,
): unknown[] {
  const refId = refIdFor(activity.id, childId);
  const done = stateOf(index, activity.id, date, childId) === 'done';
  return done
    ? clearCompletion(log, refId, date)
    : setCompletion(log, refId, date, 'done');
}

/** Mark aside for the day, or clear an existing skip. Clears any completion. */
export function toggleSkip(
  log: unknown[] | undefined,
  activity: RoutineActivity,
  date: DayKey,
  index: CompletionIndex,
): unknown[] {
  const already = stateOf(index, activity.id, date) === 'skipped';
  if (already) return clearCompletion(log, activity.id, date);

  let next = log || [];
  if (hasChildren(activity)) {
    for (const child of activity.children!) {
      next = clearCompletion(next, refIdFor(activity.id, child.id), date);
    }
  }
  next = setSetCount(next, activity, date, 0, index);
  return setCompletion(next, activity.id, date, 'skipped');
}

// ═════════════════════════════════════════════════════════════════════════
// TIME-OF-DAY HELPERS
// ═════════════════════════════════════════════════════════════════════════

export function startMinutes(activity: RoutineActivity): number | null {
  return activity.timing?.type === 'fixed'
    ? toMinutes(activity.timing.start)
    : null;
}

export function toMinutes(hhmm: string): number {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function fromMinutes(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * The next fixed-time activity still ahead today, for the dashboard's "up
 * next" line. Returns null once the timed part of the day is over.
 */
export function nextUp(
  activities: RoutineActivity[], index: CompletionIndex, date: DayKey, now: Date = new Date(),
): ResolvedActivity | null {
  const nowMin = minutesOfDay(now);
  const candidates = activitiesForDay(activities, date, 'routine')
    .filter(a => a.timing?.type === 'fixed')
    .map(a => ({ row: resolveActivity(a, index, date), min: startMinutes(a)! }))
    .filter(({ row, min }) => !row.done && !row.skipped && min >= nowMin)
    .sort((a, b) => a.min - b.min);
  return candidates.length > 0 ? candidates[0].row : null;
}

/** A fixed-time activity whose slot has passed and which is still not done. */
export function isOverdue(row: ResolvedActivity, date: DayKey, today: DayKey, now: Date = new Date()): boolean {
  if (date !== today || row.done || row.skipped) return false;
  const min = startMinutes(row.activity);
  return min != null && minutesOfDay(now) > min;
}
