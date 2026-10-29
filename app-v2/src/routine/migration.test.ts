import { describe, it, expect } from 'vitest';
import { migrate } from '../storage/migrations';
import { SEED_ROUTINE_ACTIVITIES, BRIEFING_LINKS } from './model';
import { routineItemsFromActivities } from './derive';

describe('v27 routine migration', () => {
  it('seeds the routine when a device has none', () => {
    const { data, migrated } = migrate({ schemaVersion: 26 });
    expect(migrated).toBe(true);
    expect(data.routineActivities).toHaveLength(SEED_ROUTINE_ACTIVITIES.length);
    expect(data.routineActivities.map((a: { id: string }) => a.id)).toContain('ra-breakfast-stack');
  });

  it('never overwrites a routine the user has edited', () => {
    const mine = [{
      id: 'ra-mine', title: 'My own activity', group: 'movement', category: 'body',
      schedule: { type: 'daily' }, timing: { type: 'flexible' }, surface: 'routine',
      required: true, status: 'active', order: 10,
    }];
    const { data } = migrate({ schemaVersion: 27, routineActivities: mine });
    expect(data.routineActivities).toHaveLength(1);
    expect(data.routineActivities[0].id).toBe('ra-mine');
  });

  it('cannot duplicate activities when run repeatedly', () => {
    const first = migrate({ schemaVersion: 26 }).data;
    const second = migrate(first).data;
    const third = migrate(second).data;
    expect(third.routineActivities).toHaveLength(SEED_ROUTINE_ACTIVITIES.length);
    const ids = third.routineActivities.map((a: { id: string }) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('archives the pre-v27 timed routine instead of discarding it', () => {
    const legacy = [
      { id: 'sup-probiotic', title: 'Probiotic', days: [0, 1, 2, 3, 4, 5, 6], start: '07:15', duration: 10, category: 'supplement' },
      { id: 'cowork-mon-am', title: 'Co-working space', days: [1], start: '08:30', duration: 195, category: 'elsewhere' },
    ];
    const { data } = migrate({ schemaVersion: 26, routine: legacy });
    expect(data.routineArchive).toEqual(legacy);
    // The original key is left in place too — nothing is removed.
    expect(data.routine).toEqual(legacy);
  });

  it('takes the archive only once, so a later edit cannot overwrite it', () => {
    const original = [{ id: 'a', title: 'Original', days: [1], start: '09:00', duration: 10, category: 'focus' }];
    const first = migrate({ schemaVersion: 26, routine: original }).data;
    const second = migrate({ ...first, routine: [{ id: 'b', title: 'Changed', days: [2], start: '10:00', duration: 10, category: 'focus' }] }).data;
    expect(second.routineArchive).toEqual(original);
  });

  it('leaves the legacy completion map untouched', () => {
    const comps = {
      'micro-strength:h14:2026-10-28T00:00:00.000Z': true,
      'sup-probiotic:2026-10-28T00:00:00.000Z': true,
    };
    const { data } = migrate({ schemaVersion: 26, routineCompletions: comps });
    expect(data.routineCompletions).toEqual(comps);
  });

  it('gives the routine log somewhere to live', () => {
    const { data } = migrate({ schemaVersion: 26 });
    expect(Array.isArray(data.progressLog)).toBe(true);
  });

  it('preserves every other engine’s data through the bump', () => {
    const before = {
      schemaVersion: 26,
      projects: [{ id: 'p1', name: 'NEXT' }],
      todos: [{ id: 't1', title: 'Something' }],
      learning: [{ id: 'l1', kind: 'reading', title: 'An article' }],
      create: { ideas: [{ id: 'i1', hook: 'A hook' }], posts: [] },
      stories: [{ id: 's1', title: 'The big deal' }],
      practiceItems: [{ id: 'q1', track: 'interview', prompt: 'Why?' }],
    };
    const { data } = migrate(before);
    expect(data.projects[0].name).toBe('NEXT');
    expect(data.todos).toEqual(before.todos);
    expect(data.learning).toEqual(before.learning);
    expect(data.create.ideas[0].hook).toBe('A hook');
    expect(data.stories[0].title).toBe('The big deal');
    expect(data.practiceItems.find((p: { id: string }) => p.id === 'q1')).toBeTruthy();
  });

  it('hands the Plan calendar a usable routine straight after migration', () => {
    const { data } = migrate({ schemaVersion: 26 });
    const items = routineItemsFromActivities(data.routineActivities);
    expect(items.length).toBeGreaterThan(0);
    // Monday keeps the shape of the working day it had before the migration.
    const monday = items.filter(i => i.days.includes(1)).map(i => i.title);
    expect(monday).toEqual(expect.arrayContaining([
      '2h Focus Session', 'Co-working space', 'Drive to co-working', 'Drive home',
    ]));
    for (const item of items) {
      expect(item.start).toMatch(/^\d{2}:\d{2}$/);
      expect(item.duration).toBeGreaterThan(0);
      expect(item.days.length).toBeGreaterThan(0);
    }
  });
});

describe('v28 relabelling', () => {
  const stored = (over: Partial<Record<string, unknown>> = {}) => ({
    id: 'ra-1100-stack',
    title: '11:00 stack',
    group: 'midmorning',
    category: 'nourishment',
    schedule: { type: 'daily' },
    timing: { type: 'fixed', start: '11:00', durationMin: 10 },
    surface: 'both',
    required: true,
    status: 'active',
    order: 30,
    ...over,
  });

  it('brings pre-rename labels up to the current wording', () => {
    const { data } = migrate({ schemaVersion: 27, routineActivities: [stored()] });
    expect(data.routineActivities[0].title).toBe('Creatine + Vitamin D');
  });

  it('never clobbers a label the user has edited', () => {
    const mine = stored({ title: 'Morning supplements' });
    const { data } = migrate({ schemaVersion: 27, routineActivities: [mine] });
    expect(data.routineActivities[0].title).toBe('Morning supplements');
  });

  it('relabels anchors and descriptions only on an exact old-seed match', () => {
    const before = [
      { ...stored(), id: 'ra-wall-sit', title: 'Wall sit',
        timing: { type: 'anchored', anchor: 'while brushing teeth' }, description: 'Quadriceps.' },
      { ...stored(), id: 'ra-magnesium', title: 'Magnesium',
        timing: { type: 'anchored', anchor: 'any time I like' } },
    ];
    const { data } = migrate({ schemaVersion: 27, routineActivities: before });
    expect(data.routineActivities[0].timing.anchor).toBe('While brushing teeth');
    expect(data.routineActivities[0].description).toBeUndefined();
    // Edited anchor is left exactly as the user set it.
    expect(data.routineActivities[1].timing.anchor).toBe('any time I like');
  });

  it('changes no activity id, so completion history still resolves', () => {
    const before = [stored(), { ...stored(), id: 'ra-plank', title: 'Plank' }];
    const idsBefore = before.map(a => a.id);
    const { data } = migrate({ schemaVersion: 27, routineActivities: before });
    expect(data.routineActivities.map((a: { id: string }) => a.id)).toEqual(idsBefore);
  });

  it('is idempotent', () => {
    const once = migrate({ schemaVersion: 27, routineActivities: [stored()] }).data;
    const twice = migrate(once).data;
    expect(twice.routineActivities).toEqual(once.routineActivities);
  });
});

describe('briefing links', () => {
  const briefings = (over: Partial<Record<string, unknown>> = {}) => ({
    id: 'ra-chatgpt-tasks',
    title: 'ChatGPT briefings',
    description: "Today's outputs",
    group: 'learning',
    category: 'mind',
    schedule: { type: 'daily' },
    timing: { type: 'flexible' },
    surface: 'routine',
    required: true,
    status: 'active',
    order: 90,
    link: { label: 'Open ChatGPT', url: 'https://chatgpt.com/' },
    ...over,
  });

  it('gives the briefings tile its three conversations in place of the single link', () => {
    const { data, migrated } = migrate({ schemaVersion: 28, routineActivities: [briefings()] });
    expect(migrated).toBe(true);
    expect(data.routineActivities[0].links).toEqual(BRIEFING_LINKS);
    expect(data.routineActivities[0].link).toBeUndefined();
  });

  it('replaces a single link the user had already pointed elsewhere', () => {
    const mine = briefings({ link: { label: 'Open', url: 'https://chatgpt.com/c/something-else' } });
    const { data } = migrate({ schemaVersion: 28, routineActivities: [mine] });
    expect(data.routineActivities[0].links).toEqual(BRIEFING_LINKS);
  });

  it('never replaces a list the user already has, even an emptied one', () => {
    const own = [{ label: 'Mine', url: 'https://chatgpt.com/c/mine' }];
    const kept = migrate({ schemaVersion: 28, routineActivities: [briefings({ links: own })] }).data;
    expect(kept.routineActivities[0].links).toEqual(own);
    const emptied = migrate({ schemaVersion: 28, routineActivities: [briefings({ links: [] })] }).data;
    expect(emptied.routineActivities[0].links).toEqual([]);
  });

  it('leaves the links of every other activity alone, and settles after one pass', () => {
    const reader = { ...briefings(), id: 'ra-industry-reading', link: { label: 'Open reader', url: 'https://www.inoreader.com/' } };
    const once = migrate({ schemaVersion: 28, routineActivities: [briefings(), reader] });
    expect(once.data.routineActivities[1]).toEqual(reader);
    const twice = migrate(once.data);
    expect(twice.data.routineActivities).toEqual(once.data.routineActivities);
  });

  it('is already in place on a fresh seed', () => {
    const seeded = migrate({ schemaVersion: 26 }).data;
    const tile = seeded.routineActivities.find((a: { id: string }) => a.id === 'ra-chatgpt-tasks');
    expect(tile.links.map((l: { label: string }) => l.label)).toEqual(['AI Challenges', 'CEP Brief', 'AI Sales Debrief']);
  });
});

describe('replaced tile photos', () => {
  const seeded = (id: string, photo: string) => ({ ...SEED_ROUTINE_ACTIVITIES.find(a => a.id === id)!, photo });
  const photoOf = (list: { id: string; photo?: string }[], id: string) => list.find(a => a.id === id)!.photo;

  it('moves the wall sit and air squats from the seeded pictures to the new ones', () => {
    const { data } = migrate({ schemaVersion: 28, routineActivities: [
      seeded('ra-wall-sit', 'wallsit'), seeded('ra-air-squats', 'squats'),
    ] });
    expect(photoOf(data.routineActivities, 'ra-wall-sit')).toBe('wallsquat');
    expect(photoOf(data.routineActivities, 'ra-air-squats')).toBe('squatlow');
  });

  it('leaves a picture the user chose, and strength training keeps the shared one', () => {
    const { data } = migrate({ schemaVersion: 28, routineActivities: [
      seeded('ra-wall-sit', 'stretch'), seeded('ra-strength', 'squats'),
    ] });
    expect(photoOf(data.routineActivities, 'ra-wall-sit')).toBe('stretch');
    expect(photoOf(data.routineActivities, 'ra-strength')).toBe('squats');
  });

  it('settles after one pass', () => {
    const once = migrate({ schemaVersion: 28, routineActivities: [seeded('ra-air-squats', 'squats')] }).data;
    expect(migrate(once).data.routineActivities).toEqual(once.routineActivities);
  });
});
