import { describe, it, expect } from 'vitest';
import {
  dayKeyOf, dayOfWeek, addDaysKey, weekStartKey, weekKeys, daysBetween,
  formatDayAnchor, isValidDayKey, legacyDateKey, minutesOfDay,
} from './dates';
import {
  SEED_ROUTINE_ACTIVITIES, type RoutineActivity,
} from './model';
import {
  occursOn, activitiesForDay, buildCompletionIndex, resolveActivity, resolveDay,
  dayProgress, weekProgress, toggleActivity, toggleChild, toggleSkip,
  setCompletion, clearCompletion, completionId, stateOf, nextUp, isOverdue,
  setSetCount, setsOf, linksOf, timerOf,
  type CompletionIndex,
} from './engine';
import { routineItemsFromActivities, legacyCompletionMap, mergeLegacyCompletions } from './derive';
import { metaFor, daysLabel } from './format';
import {
  photoFor, iconFor, PLATE_TONES, derivedTone, AVAILABLE_PHOTOS, PHOTO_GROUPS,
} from './photo-manifest';
import { ACTIVITY_ICON_KEYS } from './activity-icons';


const SEED = SEED_ROUTINE_ACTIVITIES;
const byId = (id: string): RoutineActivity => {
  const a = SEED.find(x => x.id === id);
  if (!a) throw new Error(`no seed activity ${id}`);
  return a;
};

// The brief's reference days. 2026-10-25 is a Sunday.
const MON = '2026-10-26';
const TUE = '2026-10-27';
const WED = '2026-10-28';
const THU = '2026-10-29';
const FRI = '2026-10-30';
const SAT = '2026-10-31';
const SUN = '2026-11-01';

describe('Europe/Paris day keys', () => {
  it('files an instant under the Paris calendar day, not the device day', () => {
    // 23:00 UTC on 24 Oct is 01:00 on the 25th in Paris (CEST).
    expect(dayKeyOf(new Date('2026-10-24T23:00:00Z'))).toBe('2026-10-25');
    // 21:00 UTC the same evening is still the 24th locally.
    expect(dayKeyOf(new Date('2026-10-24T21:00:00Z'))).toBe('2026-10-24');
  });

  it('uses the correct offset on the autumn DST boundary', () => {
    // DST ends 03:00 CEST -> 02:00 CET on 2026-10-25 (01:00 UTC).
    // At 22:30 UTC Paris is on CET (+1) = 23:30 on the 25th.
    // A hardcoded +2 offset would wrongly report the 26th.
    expect(dayKeyOf(new Date('2026-10-25T22:30:00Z'))).toBe('2026-10-25');
    // And 23:30 UTC is 00:30 CET on the 26th.
    expect(dayKeyOf(new Date('2026-10-25T23:30:00Z'))).toBe('2026-10-26');
  });

  it('uses the correct offset on the spring DST boundary', () => {
    // DST starts 02:00 CET -> 03:00 CEST on 2026-03-29 (01:00 UTC).
    // 23:30 UTC on the 28th is 00:30 CET on the 29th.
    expect(dayKeyOf(new Date('2026-03-28T23:30:00Z'))).toBe('2026-03-29');
    // 22:30 UTC on the 29th is 00:30 CEST on the 30th — a +1 offset would
    // wrongly report the 29th.
    expect(dayKeyOf(new Date('2026-03-29T22:30:00Z'))).toBe('2026-03-30');
  });

  it('walks days across both DST transitions without drifting', () => {
    expect(addDaysKey('2026-10-24', 1)).toBe('2026-10-25'); // day DST ends
    expect(addDaysKey('2026-10-25', 1)).toBe('2026-10-26');
    expect(addDaysKey('2026-03-28', 1)).toBe('2026-03-29'); // day DST starts
    expect(addDaysKey('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDaysKey('2026-10-25', -1)).toBe('2026-10-24');
    // A 23-hour and a 25-hour day still count as one day each.
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
  });

  it('crosses month and year boundaries', () => {
    expect(addDaysKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysKey('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDaysKey('2028-02-28', 1)).toBe('2028-02-29'); // leap year
  });

  it('reads weekdays off a day key', () => {
    expect(dayOfWeek('2026-10-25')).toBe(0); // Sunday
    expect(dayOfWeek(MON)).toBe(1);
    expect(dayOfWeek(WED)).toBe(3);
    expect(dayOfWeek(SAT)).toBe(6);
  });

  it('starts weeks on Monday, including from a Sunday', () => {
    expect(weekStartKey(WED)).toBe(MON);
    expect(weekStartKey(MON)).toBe(MON);
    expect(weekStartKey(SUN)).toBe(MON); // Sunday belongs to the week before
    expect(weekKeys(WED)).toEqual([MON, TUE, WED, THU, FRI, SAT, SUN]);
  });

  it('formats and validates', () => {
    expect(formatDayAnchor('2026-10-25')).toBe('Sunday 25 October');
    expect(isValidDayKey('2026-10-25')).toBe(true);
    expect(isValidDayKey('25-10-2026')).toBe(false);
    expect(isValidDayKey(undefined)).toBe(false);
  });

  it('maps a day key onto the local midnight the Plan calendar keys on', () => {
    const iso = legacyDateKey('2026-10-25');
    const local = new Date(iso);
    expect(local.getFullYear()).toBe(2026);
    expect(local.getMonth()).toBe(9);
    expect(local.getDate()).toBe(25);
    expect(local.getHours()).toBe(0);
  });

  it('reports minutes since Paris midnight', () => {
    // 09:30 UTC in late October = 10:30 CET.
    expect(minutesOfDay(new Date('2026-10-26T09:30:00Z'))).toBe(10 * 60 + 30);
  });
});

describe('recurrence — the brief\'s reference days', () => {
  const titlesOn = (key: string) =>
    activitiesForDay(SEED, key, 'routine').map(a => a.title);

  it('Monday: strength yes, electrolytes no, cardio no', () => {
    expect(occursOn(byId('ra-strength'), MON)).toBe(true);
    expect(occursOn(byId('ra-electrolytes'), MON)).toBe(false);
    expect(occursOn(byId('ra-cardio'), MON)).toBe(false);
    expect(titlesOn(MON)).toContain('Strength training');
    expect(titlesOn(MON)).not.toContain('Electrolytes');
    expect(titlesOn(MON)).not.toContain('Cycling or rowing');
  });

  it('Wednesday: cardio yes, electrolytes yes, strength no', () => {
    expect(occursOn(byId('ra-cardio'), WED)).toBe(true);
    expect(occursOn(byId('ra-electrolytes'), WED)).toBe(true);
    expect(occursOn(byId('ra-strength'), WED)).toBe(false);
    expect(titlesOn(WED)).toEqual(expect.arrayContaining(['Cycling or rowing', 'Electrolytes']));
    expect(titlesOn(WED)).not.toContain('Strength training');
  });

  it('Saturday: electrolytes yes, strength no, cardio no', () => {
    expect(occursOn(byId('ra-electrolytes'), SAT)).toBe(true);
    expect(occursOn(byId('ra-strength'), SAT)).toBe(false);
    expect(occursOn(byId('ra-cardio'), SAT)).toBe(false);
  });

  it('runs strength on Mon, Tue, Thu, Fri only', () => {
    const s = byId('ra-strength');
    expect([MON, TUE, THU, FRI].every(d => occursOn(s, d))).toBe(true);
    expect([WED, SAT, SUN].some(d => occursOn(s, d))).toBe(false);
  });

  it('shows daily activities every day of the week', () => {
    const daily = ['ra-breakfast-stack', 'ra-wall-sit', 'ra-1100-stack', 'ra-plank',
      'ra-air-squats', 'ra-podcast', 'ra-magnesium'];
    for (const key of weekKeys(MON)) {
      for (const id of daily) expect(occursOn(byId(id), key)).toBe(true);
    }
  });

  it('never surfaces a paused or archived activity', () => {
    const paused: RoutineActivity = { ...byId('ra-plank'), status: 'paused' };
    expect(occursOn(paused, MON)).toBe(false);
    const archived: RoutineActivity = { ...byId('ra-plank'), status: 'archived' };
    expect(occursOn(archived, MON)).toBe(false);
  });

  it('keeps calendar-only scaffolding out of the dashboard', () => {
    expect(titlesOn(MON)).not.toContain('Co-working space');
    expect(titlesOn(MON)).not.toContain('2h Focus Session');
    const cal = activitiesForDay(SEED, MON, 'calendar').map(a => a.title);
    expect(cal).toEqual(expect.arrayContaining(['Co-working space', '2h Focus Session']));
  });

  it("puts a 'both' activity on the dashboard and the calendar", () => {
    expect(titlesOn(WED)).toContain('Creatine + Vitamin D');
    expect(activitiesForDay(SEED, WED, 'calendar').map(a => a.title)).toContain('Creatine + Vitamin D');
  });
});

describe('completion records', () => {
  const index = (log: unknown[]): CompletionIndex => buildCompletionIndex(log);

  it('uses a deterministic id so two devices converge on one record', () => {
    expect(completionId('ra-plank', MON)).toBe('rc:ra-plank:2026-10-26');
    const a = setCompletion([], 'ra-plank', MON, 'done');
    const b = setCompletion(a, 'ra-plank', MON, 'done');
    expect(b).toHaveLength(1);
  });

  it('ticks and un-ticks a plain activity', () => {
    const plank = byId('ra-plank');
    let log = toggleActivity([], plank, MON, index([]));
    expect(resolveActivity(plank, index(log), MON).done).toBe(true);
    log = toggleActivity(log, plank, MON, index(log));
    expect(resolveActivity(plank, index(log), MON).done).toBe(false);
    expect(log).toHaveLength(0);
  });

  it('keeps each day independent', () => {
    const plank = byId('ra-plank');
    const log = toggleActivity([], plank, MON, index([]));
    expect(resolveActivity(plank, index(log), MON).done).toBe(true);
    expect(resolveActivity(plank, index(log), TUE).done).toBe(false);
  });

  it('does not rewrite history when a new day starts', () => {
    const plank = byId('ra-plank');
    const log = toggleActivity([], plank, MON, index([]));
    // Resolving later days must leave the Monday record untouched.
    for (const key of [TUE, WED, THU]) resolveActivity(plank, index(log), key);
    expect(resolveActivity(plank, index(log), MON).done).toBe(true);
    expect(log).toHaveLength(1);
  });

  it('ticks a whole group in one tap and clears it the same way', () => {
    const stack = byId('ra-breakfast-stack');
    let log = toggleActivity([], stack, MON, index([]));
    const resolved = resolveActivity(stack, index(log), MON);
    expect(resolved.done).toBe(true);
    expect(resolved.childrenDone).toBe(4);
    log = toggleActivity(log, stack, MON, index(log));
    expect(resolveActivity(stack, index(log), MON).done).toBe(false);
    expect(log).toHaveLength(0);
  });

  it('tracks group children individually, and a partial group is not done', () => {
    const stack = byId('ra-breakfast-stack');
    let log = toggleChild([], stack, 'probiotics', MON, index([]));
    log = toggleChild(log, stack, 'omega3', MON, index(log));
    const resolved = resolveActivity(stack, index(log), MON);
    expect(resolved.done).toBe(false);
    expect(resolved.childrenDone).toBe(2);
    expect(resolved.children.find(c => c.id === 'probiotics')!.done).toBe(true);
    expect(resolved.children.find(c => c.id === 'multivitamins')!.done).toBe(false);
  });

  it('keeps a day ticked when a part is renamed, and asks again for a part added', () => {
    const stack = byId('ra-breakfast-stack');
    const log = toggleActivity([], stack, MON, index([]));
    const renamed = { ...stack, children: stack.children!.map(c => (c.id === 'protein' ? { ...c, title: 'Whey' } : c)) };
    expect(resolveActivity(renamed, index(log), MON).done).toBe(true);
    const added = { ...stack, children: [...stack.children!, { id: 'p-new', title: 'Creatine' }] };
    expect(resolveActivity(added, index(log), MON).childrenDone).toBe(4);
    expect(resolveActivity(added, index(log), MON).done).toBe(false);
    const again = toggleActivity(log, added, MON, index(log));
    expect(resolveActivity(added, index(again), MON).done).toBe(true);
  });

  it('becomes a single tick once its last part is removed', () => {
    const stack = { ...byId('ra-breakfast-stack'), children: undefined };
    const log = toggleActivity([], stack, MON, index([]));
    expect(resolveActivity(stack, index(log), MON).done).toBe(true);
    expect(log).toHaveLength(1);
  });

  it('records which variant was performed', () => {
    const cardio = byId('ra-cardio');
    const log = toggleActivity([], cardio, WED, index([]), { variant: 'Rowing' });
    expect(resolveActivity(cardio, index(log), WED).variant).toBe('Rowing');
  });

  it('distinguishes skipped from simply not done', () => {
    const plank = byId('ra-plank');
    const log = toggleSkip([], plank, MON, index([]));
    const resolved = resolveActivity(plank, index(log), MON);
    expect(resolved.skipped).toBe(true);
    expect(resolved.done).toBe(false);
    expect(stateOf(index(log), 'ra-plank', MON)).toBe('skipped');
    expect(stateOf(index(log), 'ra-plank', TUE)).toBe(null);
  });

  it('clears a completion when an activity is skipped', () => {
    const stack = byId('ra-breakfast-stack');
    let log = toggleActivity([], stack, MON, index([]));
    log = toggleSkip(log, stack, MON, index(log));
    const resolved = resolveActivity(stack, index(log), MON);
    expect(resolved.skipped).toBe(true);
    expect(resolved.childrenDone).toBe(0);
  });

  it('ignores foreign records in the progress log', () => {
    const log: unknown[] = [
      { id: 'pl-1', type: 'module-session', refId: 'mod-x', at: 'now', value: 42 },
      ...setCompletion([], 'ra-plank', MON, 'done'),
    ];
    const idx = index(log);
    expect(idx.size).toBe(1);
    expect(stateOf(idx, 'ra-plank', MON)).toBe('done');
  });

  it('clearCompletion on an absent record is a no-op', () => {
    expect(clearCompletion([], 'ra-plank', MON)).toHaveLength(0);
  });
});

describe('daily progress', () => {
  it('counts a grouped activity once however many children it has', () => {
    // Monday's required routine rows: breakfast stack, wall sit, 11:00 stack,
    // strength, plank, squats, chatgpt, reading, podcast, magnesium = 10.
    const empty = dayProgress(SEED, buildCompletionIndex([]), MON);
    expect(empty.total).toBe(10);
    expect(empty.completed).toBe(0);
    expect(empty.pct).toBe(0);

    // Completing the 4-item breakfast stack moves the needle by exactly one.
    const log = toggleActivity([], byId('ra-breakfast-stack'), MON, buildCompletionIndex([]));
    const after = dayProgress(SEED, buildCompletionIndex(log), MON);
    expect(after.total).toBe(10);
    expect(after.completed).toBe(1);
    expect(after.pct).toBe(10);
  });

  it('excludes optional activities from the denominator', () => {
    const idx = buildCompletionIndex([]);
    const rows = resolveDay(SEED, idx, MON).flatMap(g => g.rows);
    const optional = rows.filter(r => !r.activity.required);
    expect(optional.map(r => r.activity.title))
      .toEqual(expect.arrayContaining(['Freediving dry training', 'Read a book']));

    const before = dayProgress(SEED, idx, MON);
    const log = toggleActivity([], byId('ra-freediving'), MON, idx);
    const after = dayProgress(SEED, buildCompletionIndex(log), MON);
    // Doing an optional activity changes neither the numerator nor denominator.
    expect(after.total).toBe(before.total);
    expect(after.completed).toBe(before.completed);
    expect(after.pct).toBe(before.pct);
    expect(after.optionalDone).toBe(1);
  });

  it('drops a skipped activity out of the denominator', () => {
    const before = dayProgress(SEED, buildCompletionIndex([]), MON);
    const log = toggleSkip([], byId('ra-plank'), MON, buildCompletionIndex([]));
    const after = dayProgress(SEED, buildCompletionIndex(log), MON);
    expect(after.total).toBe(before.total - 1);
    expect(after.skipped).toBe(1);
  });

  it('reaches 100% when every required activity is done', () => {
    let log: unknown[] = [];
    const required = activitiesForDay(SEED, WED, 'routine').filter(a => a.required !== false);
    for (const a of required) log = toggleActivity(log, a, WED, buildCompletionIndex(log));
    const p = dayProgress(SEED, buildCompletionIndex(log), WED);
    expect(p.completed).toBe(p.total);
    expect(p.remaining).toBe(0);
    expect(p.pct).toBe(100);
  });

  it('counts the right number of activities per weekday', () => {
    const totalOn = (key: string) => dayProgress(SEED, buildCompletionIndex([]), key).total;
    // Wednesday adds electrolytes + cardio and drops strength: 10 - 1 + 2 = 11.
    expect(totalOn(WED)).toBe(11);
    // Saturday adds electrolytes and drops strength: 10 - 1 + 1 = 10.
    expect(totalOn(SAT)).toBe(10);
    // Sunday has neither strength, cardio nor electrolytes: 9.
    expect(totalOn(SUN)).toBe(9);
  });

  it('never reports an unscheduled activity as missed', () => {
    const rows = resolveDay(SEED, buildCompletionIndex([]), MON).flatMap(g => g.rows);
    expect(rows.find(r => r.activity.id === 'ra-cardio')).toBeUndefined();
    expect(rows.find(r => r.activity.id === 'ra-electrolytes')).toBeUndefined();
  });

  it('groups rows in display order, optional last', () => {
    const groups = resolveDay(SEED, buildCompletionIndex([]), MON).map(g => g.id);
    expect(groups).toEqual(['morning', 'midmorning', 'training', 'movement', 'learning', 'evening', 'optional']);
  });
});

describe('weekly progress', () => {
  it('excludes days still to come from the percentage', () => {
    // Treat Monday as today: Tue–Sun are future and must not count as misses.
    const w = weekProgress(SEED, buildCompletionIndex([]), MON, MON);
    expect(w.days).toHaveLength(7);
    expect(w.days.filter(d => d.isFuture).map(d => d.key)).toEqual([TUE, WED, THU, FRI, SAT, SUN]);
    expect(w.days.find(d => d.isToday)!.key).toBe(MON);
    expect(w.total).toBe(10); // Monday only
  });

  it('reports sessions completed against sessions scheduled', () => {
    let log: unknown[] = [];
    for (const key of [MON, TUE, THU]) {
      log = toggleActivity(log, byId('ra-strength'), key, buildCompletionIndex(log));
    }
    log = toggleActivity(log, byId('ra-cardio'), WED, buildCompletionIndex(log));

    const w = weekProgress(SEED, buildCompletionIndex(log), MON, SUN);
    const strength = w.stats.find(s => s.id === 'ra-strength')!;
    expect(strength.completed).toBe(3);
    expect(strength.plannedThisWeek).toBe(4); // Mon, Tue, Thu, Fri
    const cardio = w.stats.find(s => s.id === 'ra-cardio')!;
    expect(cardio.completed).toBe(1);
    expect(cardio.plannedThisWeek).toBe(1);
    const electrolytes = w.stats.find(s => s.id === 'ra-electrolytes')!;
    expect(electrolytes.plannedThisWeek).toBe(2); // Wed, Sat
  });

  it('tracks learning consistency across the week', () => {
    let log: unknown[] = [];
    for (const key of [MON, TUE, WED, THU, FRI]) {
      log = toggleActivity(log, byId('ra-podcast'), key, buildCompletionIndex(log));
    }
    const w = weekProgress(SEED, buildCompletionIndex(log), MON, SUN);
    const podcast = w.stats.find(s => s.id === 'ra-podcast')!;
    expect(podcast.completed).toBe(5);
    expect(podcast.plannedThisWeek).toBe(7);
  });

  it('omits optional and calendar-only activities from weekly stats', () => {
    const w = weekProgress(SEED, buildCompletionIndex([]), MON, SUN);
    const ids = w.stats.map(s => s.id);
    expect(ids).not.toContain('ra-freediving');
    expect(ids).not.toContain('ra-cowork-am');
  });

  it('reports a whole completed week as 100%', () => {
    let log: unknown[] = [];
    for (const key of weekKeys(MON)) {
      for (const a of activitiesForDay(SEED, key, 'routine').filter(x => x.required !== false)) {
        log = toggleActivity(log, a, key, buildCompletionIndex(log));
      }
    }
    const w = weekProgress(SEED, buildCompletionIndex(log), MON, SUN);
    expect(w.pct).toBe(100);
    expect(w.days.every(d => d.pct === 100)).toBe(true);
  });
});

describe('up next and overdue', () => {
  it('finds the next fixed-time activity still ahead', () => {
    // 08:00 CET on Wednesday — 11:00 stack is next, cardio follows.
    const row = nextUp(SEED, buildCompletionIndex([]), WED, new Date('2026-10-28T07:00:00Z'));
    expect(row?.activity.id).toBe('ra-1100-stack');
  });

  it('skips what is already done', () => {
    const log = toggleActivity([], byId('ra-1100-stack'), WED, buildCompletionIndex([]));
    const row = nextUp(SEED, buildCompletionIndex(log), WED, new Date('2026-10-28T07:00:00Z'));
    expect(row?.activity.id).toBe('ra-cardio');
  });

  it('returns nothing once the timed day is over', () => {
    expect(nextUp(SEED, buildCompletionIndex([]), WED, new Date('2026-10-28T22:00:00Z'))).toBe(null);
  });

  it('marks a passed fixed slot overdue only on the current day', () => {
    const idx = buildCompletionIndex([]);
    const row = resolveActivity(byId('ra-1100-stack'), idx, WED);
    const afternoon = new Date('2026-10-28T13:00:00Z'); // 14:00 CET
    expect(isOverdue(row, WED, WED, afternoon)).toBe(true);
    expect(isOverdue(row, WED, THU, afternoon)).toBe(false); // viewing a past day
    const done = resolveActivity(byId('ra-1100-stack'), buildCompletionIndex(
      toggleActivity([], byId('ra-1100-stack'), WED, idx)), WED);
    expect(isOverdue(done, WED, WED, afternoon)).toBe(false);
  });
});

describe('Plan calendar derivation', () => {
  const items = routineItemsFromActivities(SEED);

  it('projects only fixed-time activities that reach the calendar', () => {
    const ids = items.map(i => i.id);
    expect(ids).toContain('ra-1100-stack');     // both
    expect(ids).toContain('ra-cowork-am');      // calendar
    expect(ids).toContain('ra-cardio');         // both, Wednesday
    expect(ids).not.toContain('ra-plank');      // flexible
    expect(ids).not.toContain('ra-wall-sit');   // anchored
    expect(ids).not.toContain('ra-magnesium');  // anchored
  });

  it('emits the legacy item shape the calendar grids read', () => {
    const stack = items.find(i => i.id === 'ra-1100-stack')!;
    expect(stack).toMatchObject({ title: 'Creatine + Vitamin D', start: '11:00', duration: 10, category: 'supplement' });
    expect(stack.days).toEqual([0, 1, 2, 3, 4, 5, 6]);

    const cardio = items.find(i => i.id === 'ra-cardio')!;
    expect(cardio.days).toEqual([3]);
    expect(cardio.start).toBe('12:00');
  });

  it('keeps the calendar palette, the homeOnly flag and the legacy recurrence', () => {
    expect(items.find(i => i.id === 'ra-cowork-am')!.category).toBe('elsewhere');
    expect(items.find(i => i.id === 'ra-drive-home')!.category).toBe('commute');
    expect(items.find(i => i.id === 'ra-weekly-review')!.category).toBe('review');
    const micro = items.find(i => i.id === 'ra-micro-strength')!;
    expect(micro.homeOnly).toBe(true);
    expect(micro.recurrence).toEqual({ kind: 'top-of-hour', startHour: 9, endHour: 18 });
  });

  it('drops paused activities from the calendar', () => {
    const paused = SEED.map(a => a.id === 'ra-cowork-am' ? { ...a, status: 'paused' as const } : a);
    expect(routineItemsFromActivities(paused).map(i => i.id)).not.toContain('ra-cowork-am');
  });

  it('exposes completions in the key shape the calendar already reads', () => {
    const log = toggleActivity([], byId('ra-1100-stack'), WED, buildCompletionIndex([]));
    const map = legacyCompletionMap(buildCompletionIndex(log));
    // Group children roll up through the parent on the dashboard; the calendar
    // shows one event, so only parent-level keys belong in this map.
    expect(Object.keys(map).every(k => !k.includes('/'))).toBe(true);
    const parentLog = setCompletion([], 'ra-cardio', WED, 'done');
    const parentMap = legacyCompletionMap(buildCompletionIndex(parentLog));
    expect(parentMap[`ra-cardio:${legacyDateKey(WED)}`]).toBe(true);
  });

  it('leaves a skip out of the calendar completion map', () => {
    const log = toggleSkip([], byId('ra-cardio'), WED, buildCompletionIndex([]));
    expect(legacyCompletionMap(buildCompletionIndex(log))).toEqual({});
  });

  it('preserves the hourly micro-strength slot keys from the old singleton', () => {
    const merged = mergeLegacyCompletions({}, {
      'micro-strength:h14:2026-10-28T00:00:00.000Z': true,
      'sup-probiotic:2026-10-28T00:00:00.000Z': true, // a retired routine item
    });
    expect(Object.keys(merged)).toEqual(['micro-strength:h14:2026-10-28T00:00:00.000Z']);
  });
});

describe('dashboard composition — what is actually on screen', () => {
  // The brief's stress test: every activity for the day, optional included,
  // must be a tile on the Routine screen. Nothing is behind a drawer.
  const tilesOn = (key: string) => {
    const all = activitiesForDay(SEED, key, 'routine');
    const required = all.filter(a => a.required !== false);
    const optional = all.filter(a => a.required === false);
    return [...required, ...optional];
  };

  it('shows 13 tiles on Wednesday: 11 scheduled + 2 optional', () => {
    const tiles = tilesOn(WED);
    expect(tiles).toHaveLength(13);
    expect(tiles.filter(a => a.required !== false)).toHaveLength(11);
    expect(tiles.filter(a => a.required === false)).toHaveLength(2);
    expect(tiles.map(a => a.title)).toEqual([
      'Breakfast stack', 'Wall sit', 'Creatine + Vitamin D', 'Electrolytes',
      'Cycling or rowing', '2-minute plank', '40 air squats',
      'ChatGPT briefings', 'Industry articles', 'Podcast', 'Magnesium',
      'Freediving dry training', 'Read a book',
    ]);
  });

  it('always places both optional activities last, and never hides them', () => {
    for (const key of weekKeys(MON)) {
      const tiles = tilesOn(key);
      expect(tiles.slice(-2).map(a => a.title))
        .toEqual(['Freediving dry training', 'Read a book']);
    }
  });

  it('Monday has strength training and no electrolytes or cardio', () => {
    const titles = tilesOn(MON).map(a => a.title);
    expect(titles).toContain('Strength training');
    expect(titles).not.toContain('Electrolytes');
    expect(titles).not.toContain('Cycling or rowing');
    expect(tilesOn(MON)).toHaveLength(12); // 10 scheduled + 2 optional
  });

  it('Sunday has neither strength training nor electrolytes nor cardio', () => {
    const titles = tilesOn(SUN).map(a => a.title);
    expect(titles).not.toContain('Strength training');
    expect(titles).not.toContain('Electrolytes');
    expect(titles).not.toContain('Cycling or rowing');
    expect(tilesOn(SUN)).toHaveLength(11); // 9 scheduled + 2 optional
  });

  it('counts the two optional tiles out of every day\'s denominator', () => {
    for (const key of weekKeys(MON)) {
      const p = dayProgress(SEED, buildCompletionIndex([]), key);
      expect(p.total).toBe(tilesOn(key).length - 2);
    }
  });

  it('gives every dashboard activity an icon and a metadata line', () => {
    for (const a of activitiesForDay(SEED, WED, 'routine')) {
      expect(a.icon, `${a.title} has no icon`).toBeTruthy();
      // Optional tiles carry the OPTIONAL chip instead of a metadata line.
      const meta = metaFor(a);
      expect(meta || a.required === false, `${a.title} has nothing to show on its meta line`).toBeTruthy();
    }
  });
});

describe('tile metadata line', () => {
  it('prefers a clock time, then an anchor, then a timer or target', () => {
    expect(metaFor(byId('ra-1100-stack'))).toBe('11:00');
    expect(metaFor(byId('ra-cardio'))).toBe('12:00');
    expect(metaFor(byId('ra-breakfast-stack'))).toBe('At breakfast');
    expect(metaFor(byId('ra-wall-sit'))).toBe('While brushing teeth');
    expect(metaFor(byId('ra-magnesium'))).toBe('Before bed');
    expect(metaFor(byId('ra-plank'))).toBe('2 min timer');
    expect(metaFor(byId('ra-strength'))).toBe('20 min timer');
    expect(metaFor(byId('ra-air-squats'))).toBe('40 reps');
    expect(metaFor(byId('ra-podcast'))).toBe('Listen today');
  });

  it('falls back to the days an activity runs', () => {
    expect(metaFor(byId('ra-electrolytes'))).toBe('Wed & Sat');
    expect(daysLabel(byId('ra-strength'))).toBe('Mon & Tue & Thu & Fri');
    expect(daysLabel(byId('ra-breakfast-stack'))).toBe('');
  });

  it('states no doses or exercise prescriptions the brief did not give', () => {
    // Guards against the concept artwork's invented details leaking in:
    // "5 g creatine + 2,000 IU D3", "3 x 60 seconds", "1 - 2 sets", "200-400 mg".
    const invented = /\d[\d,.]*\s?(mg|mcg|iu|ml)\b|\d+\s?[x×]\s?\d+|\d+\s?-\s?\d+\s?sets?\b|\d+\s?sets?\b/i;
    for (const a of SEED.filter(x => x.surface !== 'calendar')) {
      expect(metaFor(a), a.title).not.toMatch(invented);
      expect(a.description || '', a.title).not.toMatch(invented);
      expect(a.title).not.toMatch(invented);
    }
  });
});

describe('presentation resolves without stored data', () => {
  // An activity seeded before the icon or photo key existed must still get
  // its mark and its picture — otherwise the tile shows a neutral dot beside
  // its status circle, which reads as two controls.
  it('gives every dashboard activity an icon from its id alone', () => {
    for (const a of SEED.filter(x => x.surface !== 'calendar')) {
      expect(iconFor({ id: a.id }), a.title).toBeTruthy();
    }
  });

  it('gives every dashboard activity a photograph from its id alone', () => {
    for (const a of SEED.filter(x => x.surface !== 'calendar')) {
      expect(photoFor({ id: a.id }), a.title).toBeTruthy();
    }
  });

  it('treats an empty photo key as an explicit "no picture"', () => {
    expect(photoFor({ id: 'ra-plank' })).toBe('plank');
    expect(photoFor({ id: 'ra-plank', photo: '' })).toBeUndefined();
    expect(photoFor({ id: 'ra-plank', photo: 'book' })).toBe('book');
  });

  it('derives the mark from the id regardless of what storage holds', () => {
    // `kettlebell` was renamed to `dumbbell`; a record written before that
    // must not fall through to the neutral dot beside its status circle.
    expect(iconFor({ id: 'ra-air-squats' })).toBe('dumbbell');
  });
});

describe('seed integrity', () => {
  it('has unique activity ids', () => {
    const ids = SEED.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique child ids within each group', () => {
    for (const a of SEED) {
      if (!a.children) continue;
      const ids = a.children.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('gives every fixed-time activity a start and duration', () => {
    for (const a of SEED) {
      if (a.timing.type !== 'fixed') continue;
      expect(a.timing.start).toMatch(/^\d{2}:\d{2}$/);
      expect(a.timing.durationMin).toBeGreaterThan(0);
    }
  });

  it('only puts fixed-time activities on the calendar', () => {
    for (const a of SEED) {
      if (a.surface === 'calendar' || a.surface === 'both') {
        expect(a.timing.type).toBe('fixed');
      }
    }
  });

  it('implements every activity the brief specifies', () => {
    const titles = SEED.map(a => a.title);
    expect(titles).toEqual(expect.arrayContaining([
      'Breakfast stack', 'Wall sit', 'Creatine + Vitamin D', 'Electrolytes',
      'Strength training', 'Cycling or rowing', '2-minute plank', '40 air squats',
      'ChatGPT briefings', 'Industry articles', 'Podcast',
      'Magnesium', 'Freediving dry training', 'Read a book',
    ]));
    expect(byId('ra-breakfast-stack').children!.map(c => c.title))
      .toEqual(['Probiotics', 'Omega 3', 'Multivitamins', 'Protein']);
    expect(byId('ra-1100-stack').children!.map(c => c.title))
      .toEqual(['Creatine', 'Vitamin D']);
    expect(byId('ra-plank').timerSec).toBe(120);
    expect(byId('ra-strength').timerSec).toBe(1200);
    expect(byId('ra-air-squats').target).toEqual({ kind: 'reps', value: 40 });
    expect(byId('ra-cardio').variants).toEqual(['Cycling', 'Rowing']);
    for (const id of ['ra-chatgpt-tasks', 'ra-industry-reading', 'ra-podcast']) {
      expect(linksOf(byId(id))[0]?.url).toMatch(/^https:\/\//);
    }
  });

  it('states no supplement dosages', () => {
    const text = JSON.stringify(SEED);
    expect(text).not.toMatch(/\b\d+\s?(mg|mcg|g|iu|ml)\b/i);
  });
});

describe('activities without a photograph', () => {
  // A user-created activity has no picture until one is chosen, so the
  // plate behind its icon is what is actually on screen.
  it('gives every icon the picker offers its own deliberate tone', () => {
    const offered = new Set(ACTIVITY_ICON_KEYS);
    const toned = new Set(Object.keys(PLATE_TONES));
    const missing = [...offered].filter(k => !toned.has(k));
    expect(missing, 'icons falling back to a derived tone').toEqual([]);
  });

  it('derives a distinct tone for a key it has never seen', () => {
    const a = derivedTone('cold shower');
    const b = derivedTone('sauna');
    expect(a).not.toEqual(b);
    expect(a[0]).toMatch(/^hsl\(/);
  });

  it('is deterministic, so a tile does not change colour between loads', () => {
    expect(derivedTone('cold shower')).toEqual(derivedTone('cold shower'));
  });
});

describe('the photo library', () => {
  it('declares every grouped key exactly once', () => {
    const grouped = PHOTO_GROUPS.flatMap(g => g.keys);
    expect(new Set(grouped).size, 'a key appears in two groups').toBe(grouped.length);
  });

  it('groups exactly the keys the app will render', () => {
    const grouped = new Set(PHOTO_GROUPS.flatMap(g => g.keys));
    const available = new Set(AVAILABLE_PHOTOS);
    expect([...available].filter(k => !grouped.has(k)), 'available but ungrouped').toEqual([]);
    expect([...grouped].filter(k => !available.has(k)), 'grouped but unavailable').toEqual([]);
  });

  it('has a photograph for every activity that names one', () => {
    for (const a of SEED) {
      const key = photoFor(a);
      if (!key) continue;
      expect(AVAILABLE_PHOTOS.has(key), `${a.title} -> ${key}`).toBe(true);
    }
  });

  it('covers the themes the routine needs', () => {
    for (const theme of ['strength', 'meditation', 'collagen', 'asiansquat', 'squat',
      'rowing', 'spin', 'reflect', 'planning', 'walking']) {
      expect(AVAILABLE_PHOTOS.has(theme), `missing theme: ${theme}`).toBe(true);
    }
  });
});

describe('activities done in sets', () => {
  // The user's own case: 40 air squats as four sets of ten through the day.
  const squats: RoutineActivity = { ...byId('ra-air-squats'), sets: 4 };
  const tap = (log: unknown[], a = squats, date = WED) => toggleActivity(log, a, date, buildCompletionIndex(log));
  const row = (log: unknown[], a = squats, date = WED) => resolveActivity(a, buildCompletionIndex(log), date);

  it('logs one set per tap and checks the tile on the last', () => {
    let log: unknown[] = [];
    for (let n = 1; n <= 3; n++) {
      log = tap(log);
      expect(row(log)).toMatchObject({ setsDone: n, sets: 4, done: false });
    }
    log = tap(log);
    expect(row(log)).toMatchObject({ setsDone: 4, done: true });
    expect(row(log).completedAt).toBeTruthy();
  });

  it('keeps each set as its own record, so sync merges sets from two devices', () => {
    const ids = (tap(tap([])) as { id: string }[]).map(r => r.id).sort();
    expect(ids).toEqual([`rc:ra-air-squats/set-1:${WED}`, `rc:ra-air-squats/set-2:${WED}`]);
    const ipad = setCompletion([], 'ra-air-squats/set-1', WED, 'done');
    const iphone = setCompletion([], 'ra-air-squats/set-3', WED, 'done');
    expect(row([...ipad, ...iphone]).setsDone).toBe(2);
  });

  it('counts toward the day only once every set is done', () => {
    const others = activitiesForDay(SEED, WED, 'routine').filter(a => a.id !== squats.id);
    const all = [...others, squats];
    const before = dayProgress(all, buildCompletionIndex([]), WED).completed;
    const three = tap(tap(tap([])));
    expect(dayProgress(all, buildCompletionIndex(three), WED).completed).toBe(before);
    expect(dayProgress(all, buildCompletionIndex(tap(three)), WED).completed).toBe(before + 1);
  });

  it('starts the day again on a tap after the last set', () => {
    const done = tap(tap(tap(tap([]))));
    const again = tap(done);
    expect(row(again)).toMatchObject({ setsDone: 0, done: false });
    expect(again).toHaveLength(0);
  });

  it('undoes a set, or a restart, by restoring the count from before the tap', () => {
    const two = tap(tap([]));
    const three = tap(two);
    expect(row(setSetCount(three, squats, WED, 2, buildCompletionIndex(three))).setsDone).toBe(2);

    const done = tap(three);
    const restarted = tap(done);
    const restored = setSetCount(restarted, squats, WED, 4, buildCompletionIndex(restarted));
    expect(row(restored)).toMatchObject({ setsDone: 4, done: true });
  });

  it('keeps each day separate', () => {
    const log = tap(tap([], squats, TUE), squats, TUE);
    expect(row(log, squats, TUE).setsDone).toBe(2);
    expect(row(log, squats, WED).setsDone).toBe(0);
  });

  it('clears logged sets when the day is set aside', () => {
    const two = tap(tap([]));
    const skipped = toggleSkip(two, squats, WED, buildCompletionIndex(two));
    expect(row(skipped)).toMatchObject({ setsDone: 0, skipped: true });
  });

  it('treats one set, a fraction, or an activity with parts as a single tick', () => {
    expect(setsOf({ ...squats, sets: 1 })).toBe(0);
    expect(setsOf({ ...squats, sets: 2.5 })).toBe(0);
    expect(setsOf({ ...byId('ra-breakfast-stack'), sets: 3 })).toBe(0);
    expect(row(tap([], byId('ra-air-squats')), byId('ra-air-squats')).done).toBe(true);
  });

  it('says how the target splits on the tile', () => {
    expect(metaFor(squats)).toBe('4 × 10 reps');
    expect(metaFor({ ...squats, target: { kind: 'reps', value: 45 } })).toBe('4 sets · 45 reps');
    expect(metaFor({ ...squats, target: undefined, sets: 3 })).toBe('3 times a day');
    expect(metaFor({ ...byId('ra-plank'), sets: 3 })).toBe('3 × 2 min timer');
  });
});

describe('activity links', () => {
  const plain: RoutineActivity = { ...byId('ra-industry-reading'), links: undefined, link: undefined };

  it('reads the single link of older data as a list of one', () => {
    expect(linksOf({ ...plain, link: { label: 'Open reader', url: 'https://www.inoreader.com/' } }))
      .toEqual([{ label: 'Open reader', url: 'https://www.inoreader.com/' }]);
  });

  it('prefers the list, in order, over an old single link', () => {
    const a = { ...plain, link: { label: 'Old', url: 'https://old.example/' },
      links: [{ label: 'One', url: 'https://one.example/' }, { label: 'Two', url: 'https://two.example/' }] };
    expect(linksOf(a).map(l => l.label)).toEqual(['One', 'Two']);
  });

  it('keeps an emptied list empty rather than falling back to the old link', () => {
    expect(linksOf({ ...plain, links: [], link: { label: 'Old', url: 'https://old.example/' } })).toEqual([]);
  });

  it('drops a half-filled row and names an unnamed link by its site', () => {
    const a = { ...plain, links: [
      { label: 'No address', url: '  ' },
      { label: '  ', url: ' https://www.inoreader.com/all ' },
    ] };
    expect(linksOf(a)).toEqual([{ label: 'inoreader.com', url: 'https://www.inoreader.com/all' }]);
  });

  it('has none for an activity without links', () => {
    expect(linksOf(plain)).toEqual([]);
  });
});

describe('countdown switch', () => {
  const plank = byId('ra-plank');

  it('runs the countdown it has', () => {
    expect(timerOf(plank)).toBe(120);
  });

  it('has none while switched off, and keeps the minutes', () => {
    const off = { ...plank, timerOff: true };
    expect(timerOf(off)).toBe(0);
    expect(off.timerSec).toBe(120);
    expect(timerOf({ ...off, timerOff: undefined })).toBe(120);
  });

  it('shows the target on the tile while switched off', () => {
    const meta = metaFor({ ...plank, timerOff: true });
    expect(meta).not.toMatch(/timer/);
    expect(meta).toMatch(/^2 /);
  });

  it('has none without minutes, switched on or not', () => {
    expect(timerOf({ ...plank, timerSec: undefined })).toBe(0);
    expect(timerOf({ ...plank, timerSec: 0, timerOff: false })).toBe(0);
  });
});
