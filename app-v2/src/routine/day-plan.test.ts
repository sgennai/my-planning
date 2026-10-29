import { describe, it, expect } from 'vitest';
import { SEED_ROUTINE_ACTIVITIES, type RoutineActivity } from './model';
import { activitiesForDay, buildCompletionIndex, setCompletion } from './engine';
import { withDayPlans, isDayPlanRecord, dayPlanId, type DayPlan } from './day-plan';

const SEED = SEED_ROUTINE_ACTIVITIES;
const MON = '2026-10-26';
const TUE = '2026-10-27';
const WED = '2026-10-28';
const plan = (log: unknown[], date: string) =>
  log.find(r => isDayPlanRecord(r) && r.value.date === date) as DayPlan | undefined;

describe('day plans', () => {
  it("records today's routine in display order, with what counts, sets and parts", () => {
    const routine = SEED.map(a => (a.id === 'ra-air-squats' ? { ...a, sets: 4 } : a));
    const log = withDayPlans([], routine, WED);
    const p = plan(log, WED)!;
    expect(p.id).toBe(dayPlanId(WED));
    expect(p.value.source).toBe('live');
    expect(p.value.items.map(i => i.id)).toEqual(activitiesForDay(routine, WED, 'routine').map(a => a.id));
    expect(p.value.items.find(i => i.id === 'ra-air-squats')?.sets).toBe(4);
    expect(p.value.items.find(i => i.id === 'ra-breakfast-stack')?.parts).toHaveLength(4);
    expect(p.value.items.find(i => i.id === 'ra-read-book')?.required).toBe(false);
    expect(p.value.items.find(i => i.id === 'ra-plank')).toEqual({ id: 'ra-plank', title: '2-minute plank', required: true });
  });

  it('writes nothing when the plan already matches', () => {
    const once = withDayPlans([], SEED, WED);
    expect(withDayPlans(once, SEED, WED)).toBe(once);
  });

  it("follows the routine while the day is today", () => {
    const once = withDayPlans([], SEED, WED);
    const paused = SEED.map(a => (a.id === 'ra-plank' ? { ...a, status: 'paused' as const } : a));
    const again = withDayPlans(once, paused, WED);
    expect(plan(again, WED)!.value.items.some(i => i.id === 'ra-plank')).toBe(false);
    expect(again.filter(isDayPlanRecord)).toHaveLength(1);
  });

  it('never rewrites a past day once it has a plan', () => {
    const tuesday = withDayPlans([], SEED, TUE);
    const renamed: RoutineActivity[] = SEED.map(a => (a.id === 'ra-plank' ? { ...a, title: 'Plank' } : a));
    const wednesday = withDayPlans(tuesday, renamed, WED);
    expect(plan(wednesday, TUE)).toEqual(plan(tuesday, TUE));
    expect(plan(wednesday, WED)!.value.items.find(i => i.id === 'ra-plank')?.title).toBe('Plank');
  });

  it('plans past ticked days that have none, and leaves unticked days alone', () => {
    const log = setCompletion([], 'ra-plank', MON, 'done');
    const next = withDayPlans(log, SEED, WED);
    expect(plan(next, MON)!.value.source).toBe('backfill');
    expect(plan(next, TUE)).toBeUndefined();
    expect(plan(next, WED)!.value.source).toBe('live');
  });

  it('leaves the ticks themselves untouched', () => {
    const log = setCompletion(setCompletion([], 'ra-plank', MON, 'done'), 'ra-wall-sit', WED, 'skipped');
    const next = withDayPlans(log, SEED, WED);
    expect([...buildCompletionIndex(next).values()]).toEqual([...buildCompletionIndex(log).values()]);
  });
});
