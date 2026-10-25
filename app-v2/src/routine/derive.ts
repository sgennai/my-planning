// Bridge from the routine model to the Plan calendar.
//
// The Plan screen's day/week grids, occurrence overrides (skip / move / edit)
// and popovers all speak the legacy `RoutineItem` shape. Rather than rewrite
// that working surface, the new model is projected into that shape: every
// fixed-time activity that reaches the calendar becomes one RoutineItem with a
// stable id, so overrides keyed on `${itemId}:${date}` keep resolving.
//
// This is the only place the two vocabularies meet.

import type { RoutineActivity, RoutineCategory, Weekday } from './model';
import type { CompletionIndex } from './engine';
import { COMPLETION_TYPE, isCompletionRecord } from './engine';
import { legacyDateKey } from './dates';

export interface LegacyRoutineItem {
  id: string;
  title: string;
  start: string;
  duration: number;
  days: number[];
  category: string;
  note?: string;
  homeOnly?: boolean;
  recurrence?: unknown;
}

const CATEGORY_TO_LEGACY: Record<RoutineCategory, string> = {
  nourishment: 'supplement',
  body: 'gym',
  mind: 'focus',
  recovery: 'supplement',
  work: 'focus',
  open: 'planning',
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function daysOf(activity: RoutineActivity): number[] {
  const sched = activity.schedule;
  if (!sched || sched.type === 'daily') return ALL_DAYS;
  return Array.isArray(sched.days) ? [...sched.days] : ALL_DAYS;
}

/**
 * The timed events the Plan calendar should render. Only fixed-time, active
 * activities whose surface includes the calendar qualify — flexible and
 * anchored habits have no slot to occupy and stay on the dashboard.
 */
export function routineItemsFromActivities(activities: RoutineActivity[] | undefined): LegacyRoutineItem[] {
  return (activities || [])
    .filter(a =>
      a.status === 'active'
      && (a.surface === 'calendar' || a.surface === 'both')
      && a.timing?.type === 'fixed')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(a => {
      const timing = a.timing as { type: 'fixed'; start: string; durationMin: number };
      const item: LegacyRoutineItem = {
        id: a.id,
        title: a.title,
        start: timing.start,
        duration: timing.durationMin,
        days: daysOf(a),
        category: a.calendarCategory || CATEGORY_TO_LEGACY[a.category] || 'supplement',
      };
      if (a.description) item.note = a.description;
      if (a.homeOnly) item.homeOnly = true;
      if (a.recurrence) item.recurrence = a.recurrence;
      return item;
    });
}

/**
 * Completion state in the shape the calendar already reads:
 * `{ "<itemId>:<local-midnight ISO>": true }`.
 *
 * Keys are derived from the Europe/Paris day of each record, converted to the
 * device's local midnight for that same calendar date — which is what
 * `calendar-utils` computes from the Date objects it renders.
 */
export function legacyCompletionMap(index: CompletionIndex): Record<string, true> {
  const out: Record<string, true> = {};
  for (const rec of index.values()) {
    if (rec.value.state !== 'done') continue;
    // Children roll up through their parent on the dashboard; the calendar
    // shows the parent event, so only parent-level records matter here.
    if (rec.refId.includes('/')) continue;
    out[`${rec.refId}:${legacyDateKey(rec.value.date)}`] = true;
  }
  return out;
}

/**
 * Non-routine entries from the old `routineCompletions` singleton — currently
 * the hourly micro-strength slot keys (`micro-strength:h14:<iso>`), which the
 * Plan hero banner writes directly and which have no activity behind them.
 * Merged alongside the derived map so that feature keeps working.
 */
export function mergeLegacyCompletions(
  derived: Record<string, true>, legacy: Record<string, unknown> | undefined,
): Record<string, true> {
  if (!legacy) return derived;
  const out: Record<string, true> = { ...derived };
  for (const [key, val] of Object.entries(legacy)) {
    if (!val) continue;
    if (key.includes(':h')) out[key] = true;
  }
  return out;
}

/** Completion records only — used to split the progress log when persisting. */
export function partitionLog(log: unknown[] | undefined): {
  completions: unknown[]; others: unknown[];
} {
  const completions: unknown[] = [];
  const others: unknown[] = [];
  for (const rec of log || []) {
    if (isCompletionRecord(rec) && (rec as { type: string }).type === COMPLETION_TYPE) completions.push(rec);
    else others.push(rec);
  }
  return { completions, others };
}

// ═══════════════════════════════════════════════════════════════════════════
// WRITE-BACK — the Plan screen's routine editors, translated
// ═══════════════════════════════════════════════════════════════════════════
//
// The Plan calendar's routine manager and occurrence popover edit events in
// the legacy vocabulary (title / start / duration / note / days / category).
// These translate such an edit onto the activity behind the event, so there
// is one source of truth and no second editor that can disagree with it.


const LEGACY_TO_CATEGORY: Record<string, RoutineCategory> = {
  supplement: 'nourishment',
  gym: 'body',
  'micro-strength': 'body',
  focus: 'work',
  review: 'work',
  planning: 'work',
  prep: 'work',
  elsewhere: 'work',
  commute: 'work',
};

type LegacyChanges = Partial<LegacyRoutineItem> & { durationMin?: number };

export function applyLegacyItemChanges(
  activity: RoutineActivity, changes: LegacyChanges,
): RoutineActivity {
  const next: RoutineActivity = { ...activity, updatedAt: new Date().toISOString() };

  if (changes.title != null) next.title = changes.title;
  if (changes.note != null) next.description = changes.note;
  if (changes.homeOnly != null) next.homeOnly = changes.homeOnly;
  if (changes.recurrence !== undefined) next.recurrence = changes.recurrence;

  if (changes.category != null) {
    next.calendarCategory = changes.category;
    next.category = LEGACY_TO_CATEGORY[changes.category] || activity.category;
  }

  if (Array.isArray(changes.days)) {
    const days = changes.days.map(Number) as Weekday[];
    next.schedule = days.length === 7 ? { type: 'daily' } : { type: 'weekdays', days };
  }

  const start = changes.start;
  const duration = changes.duration ?? changes.durationMin;
  if (start != null || duration != null) {
    const base = activity.timing.type === 'fixed'
      ? activity.timing
      : { type: 'fixed' as const, start: '09:00', durationMin: 30 };
    next.timing = {
      type: 'fixed',
      start: start != null ? start : base.start,
      durationMin: duration != null ? Math.max(1, Number(duration)) : base.durationMin,
    };
  }

  return next;
}

/** A new calendar-surface activity from an item created in the Plan editors. */
export function activityFromLegacyItem(
  item: LegacyChanges & { id?: string }, order: number,
): RoutineActivity {
  const days = (item.days || [0, 1, 2, 3, 4, 5, 6]).map(Number) as Weekday[];
  const legacyCat = item.category || 'focus';
  return {
    id: item.id || `ra-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: item.title || 'Untitled',
    description: item.note,
    group: 'work',
    category: LEGACY_TO_CATEGORY[legacyCat] || 'work',
    calendarCategory: legacyCat,
    schedule: days.length === 7 ? { type: 'daily' } : { type: 'weekdays', days },
    timing: {
      type: 'fixed',
      start: item.start || '09:00',
      durationMin: Math.max(1, Number(item.duration ?? item.durationMin ?? 30)),
    },
    surface: 'calendar',
    required: false,
    status: 'active',
    order,
    ...(item.homeOnly ? { homeOnly: true } : {}),
    ...(item.recurrence ? { recurrence: item.recurrence } : {}),
    createdAt: new Date().toISOString(),
  };
}
