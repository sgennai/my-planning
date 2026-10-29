// What each day's routine held, kept for reporting.
//
// Completion records say what was done; they cannot say what was asked. The
// dashboard works a past day's "X of Y" out again from today's activities, so
// pausing, removing, rescheduling or adding an activity would quietly rewrite
// every past day's total, and a month of trends with it. A day plan freezes
// the denominator: one record per Europe/Paris day, `rp:<dayKey>`, in the same
// synced `progressLog` as the completions (which `isCompletionRecord` keeps
// apart by type).
//
// Today's plan follows the routine while today lasts, so an activity added or
// paused this afternoon counts the way it ends the day. Once the day is past,
// its plan is never rewritten. A past day that has ticks but no plan (the
// days before plans existed, or one ticked after the fact on a day the app
// was not opened) gets one built from the routine as it stands then, marked
// `backfill`. A day with no ticks and no plan was a day the app was not used;
// it gets nothing, so a stale device catching up cannot overwrite the plan
// another device recorded live.

import type { RoutineActivity } from './model';
import type { DayKey } from './dates';
import { activitiesForDay, isCompletionRecord, setsOf } from './engine';

export const DAY_PLAN_TYPE = 'routine-day-plan';

export interface DayPlanItem {
  id: string;
  /** The title that day, so a report still reads after a rename or removal. */
  title: string;
  /** false = optional: shown, never in the day's denominator. */
  required: boolean;
  /** Sets that day, when done in sets. */
  sets?: number;
  /** Part ids that day, when ticked part by part. */
  parts?: string[];
}

export interface DayPlan {
  id: string;
  type: typeof DAY_PLAN_TYPE;
  /** The day itself, as the log's `refId` convention needs one. */
  refId: string;
  /** When this plan was written. */
  at: string;
  value: {
    date: DayKey;
    /** Everything on the Routine screen that day, in display order. */
    items: DayPlanItem[];
    /** `live`: written while the day was today. `backfill`: built later. */
    source: 'live' | 'backfill';
  };
}

export function dayPlanId(date: DayKey): string {
  return `rp:${date}`;
}

export function isDayPlanRecord(rec: unknown): rec is DayPlan {
  if (!rec || typeof rec !== 'object') return false;
  const r = rec as Record<string, unknown>;
  const v = r.value as Record<string, unknown> | undefined;
  return r.type === DAY_PLAN_TYPE && !!v && typeof v.date === 'string' && Array.isArray(v.items);
}

/** The day's plan as the routine stands, without writing anything. */
export function planItemsFor(activities: RoutineActivity[], date: DayKey): DayPlanItem[] {
  return activitiesForDay(activities, date, 'routine').map(a => {
    const sets = setsOf(a);
    return {
      id: a.id,
      title: a.title,
      required: a.required !== false,
      ...(sets ? { sets } : {}),
      ...(a.children?.length ? { parts: a.children.map(c => c.id) } : {}),
    };
  });
}

function planRecord(date: DayKey, items: DayPlanItem[], source: DayPlan['value']['source']): DayPlan {
  return {
    id: dayPlanId(date),
    type: DAY_PLAN_TYPE,
    refId: date,
    at: new Date().toISOString(),
    value: { date, items, source },
  };
}

/**
 * The log with today's plan up to date and every past ticked day planned.
 * Returns the same array when nothing needs writing, so callers can skip the
 * save.
 */
export function withDayPlans(
  log: unknown[] | undefined,
  activities: RoutineActivity[] | undefined,
  today: DayKey,
): unknown[] {
  const current = log || [];
  const list = activities || [];
  const plans = new Map<DayKey, DayPlan>();
  const ticked = new Set<DayKey>();
  for (const rec of current) {
    if (isDayPlanRecord(rec)) plans.set(rec.value.date, rec);
    else if (isCompletionRecord(rec)) ticked.add(rec.value.date);
  }

  const writes: DayPlan[] = [];
  const todayItems = planItemsFor(list, today);
  const stored = plans.get(today);
  if (!stored || JSON.stringify(stored.value.items) !== JSON.stringify(todayItems)) {
    writes.push(planRecord(today, todayItems, 'live'));
  }
  for (const date of [...ticked].sort()) {
    if (date < today && !plans.has(date)) writes.push(planRecord(date, planItemsFor(list, date), 'backfill'));
  }
  if (!writes.length) return current;

  const replaced = new Set(writes.map(w => w.id));
  return [...current.filter(r => !replaced.has((r as { id?: string })?.id ?? '')), ...writes];
}
