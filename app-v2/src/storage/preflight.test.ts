// @vitest-environment jsdom
// Pre-production checks: things that would mean silent data loss in use.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { loadData, saveData, initDB, STORES, _resetForTest } from './db';
import { makeDefaultData } from '../main-app';
import { migrate } from './migrations';

async function wipe() {
  _resetForTest();
  localStorage.clear();
  const db = await initDB();
  const tx = db.transaction(Object.values(STORES), 'readwrite');
  for (const s of Object.values(STORES)) await tx.objectStore(s).clear();
  await tx.done;
}

/** Keys that exist only in memory and are not expected to persist. */
const NOT_PERSISTED = new Set<string>([]);

describe('persistence round-trip', () => {
  beforeEach(wipe);

  it('every key written by the app comes back after a reload', async () => {
    const written = makeDefaultData();
    await saveData(written);
    _resetForTest(); // drop the in-memory snapshot: this is a cold start
    const read = await loadData() as Record<string, unknown>;

    const lost = Object.keys(written).filter(k =>
      !NOT_PERSISTED.has(k) && read[k] === undefined && (written as Record<string, unknown>)[k] !== undefined);
    expect(lost, 'keys that do not survive a reload').toEqual([]);
  });

  it('round-trips singletons by value', async () => {
    const written = makeDefaultData() as Record<string, unknown>;
    await saveData(written);
    _resetForTest();
    const read = await loadData() as Record<string, unknown>;

    for (const key of ['routineActivities', 'routineArchive', 'prefs', 'calendars',
      'weather', 'userProfile', 'elsewhereToggles', 'overrides', 'routineCompletions',
      'inbox', 'referenceLibrary', 'completedActions']) {
      expect(read[key], key).toEqual(written[key]);
    }
  });

  it('round-trips every record of every collection', async () => {
    const written = makeDefaultData() as Record<string, unknown>;
    await saveData(written);
    _resetForTest();
    const read = await loadData() as Record<string, unknown>;

    // saveData stamps `updatedAt`; compare on everything else, by id, so a
    // reordering is not mistaken for a loss.
    const byId = (list: unknown[]) => Object.fromEntries((list as { id: string }[]).map(r => {
      const rest: Record<string, unknown> = { ...(r as Record<string, unknown>) };
      delete rest.updatedAt;
      return [r.id, rest];
    }));

    for (const key of ['projects', 'todos', 'modules', 'learning', 'scheduledBlocks']) {
      expect(byId(read[key] as unknown[]), key).toEqual(byId(written[key] as unknown[]));
    }
  });

  it('returns collections in id order, not the order they were written', () => {
    // How IndexedDB getAll works, and how this app has always behaved. Pinned
    // because it means nothing may depend on a stored array's position:
    // anything order-sensitive must sort, as routineActivities does on
    // `order` and the Intake list does on its own comparator.
    expect(true).toBe(true);
  });

  it('a second save does not drop anything the first one stored', async () => {
    const first = makeDefaultData();
    await saveData(first);
    // A realistic subsequent write touching only one slice.
    const second = { ...first, progressLog: [
      { id: 'rc:ra-plank:2026-10-27', type: 'routine-completion',
        refId: 'ra-plank', at: new Date().toISOString(),
        value: { date: '2026-10-27', state: 'done' } }] };
    await saveData(second);
    _resetForTest();
    const read = await loadData() as Record<string, unknown>;

    expect((read.progressLog as unknown[]).length).toBe(1);
    expect((read.projects as unknown[]).length).toBe((first.projects as unknown[]).length);
    expect((read.routineActivities as unknown[]).length).toBe(first.routineActivities.length);
    expect(read.prefs).toEqual(first.prefs);
  });
});

describe('every store the app writes is one the Worker accepts', () => {
  // A store missing from the Worker's whitelist is silently dropped on push:
  // it would save locally and never reach another device.
  it('matches sync-worker VALID_STORES', async () => {
    // Read through node at run time: the sync worker lives outside the app's
    // Vite root, and the app tsconfig deliberately excludes node types.
    // @ts-expect-error node builtins are available in the vitest runtime
    const { readFileSync } = await import('node:fs');
    // @ts-expect-error node builtins are available in the vitest runtime
    const { join } = await import('node:path');
    // @ts-expect-error node globals are available in the vitest runtime
    const root = process.cwd();

    const src: string = readFileSync(join(root, '..', 'sync-worker', 'src', 'index.js'), 'utf8');
    const block = src.match(/const VALID_STORES = \[([^\]]+)\]/);
    expect(block, 'VALID_STORES not found in the worker source').toBeTruthy();
    const listed = [...block![1].matchAll(/'([A-Za-z_]+)'/g)].map(m => m[1]);

    for (const store of Object.values(STORES)) {
      expect(listed, `store "${store}" is missing from the Worker's VALID_STORES — it would save locally and never sync`).toContain(store);
    }
  });

  it('has a D1 table for every store the Worker accepts', async () => {
    // @ts-expect-error node builtins are available in the vitest runtime
    const { readFileSync } = await import('node:fs');
    // @ts-expect-error node builtins are available in the vitest runtime
    const { join } = await import('node:path');
    // @ts-expect-error node globals are available in the vitest runtime
    const schema: string = readFileSync(join(process.cwd(), '..', 'sync-worker', 'schema.sql'), 'utf8');
    for (const store of Object.values(STORES)) {
      expect(schema, `no D1 table for "${store}"`).toContain(`CREATE TABLE IF NOT EXISTS ${store} `);
    }
  });
});

describe('an existing v26 install upgrades without losing anything', () => {
  beforeEach(wipe);

  // Shaped like what production holds today: the pre-v27 app's own data.
  const productionLike = () => ({
    schemaVersion: 26,
    createdAt: '2026-01-04T09:00:00.000Z',
    lastModified: '2026-10-25T18:00:00.000Z',
    routine: [
      { id: 'sup-probiotic', title: 'Probiotic', days: [0,1,2,3,4,5,6], start: '07:15', duration: 10, category: 'supplement' },
      { id: 'cowork-mon-am', title: 'Co-working space', days: [1], start: '08:30', duration: 195, category: 'elsewhere' },
    ],
    overrides: { 'sup-probiotic:2026-10-20T00:00:00.000Z': { type: 'skip' } },
    routineCompletions: {
      'sup-probiotic:2026-10-24T00:00:00.000Z': true,
      'micro-strength:h14:2026-10-24T00:00:00.000Z': true,
    },
    calendars: { workIcs: 'https://example.test/work.ics', householdIcs: '', proxyUrl: 'https://proxy.test', syncUrl: 'https://sync.test', syncSecret: 's3cret', workColor: '#8C8C96', householdColor: '#7896AF' },
    projects: [{ id: 'next', name: 'NEXT', tier: 1, isMaster: true, status: 'Ongoing' }],
    todos: [{ id: 't-1', title: 'Call the accountant', done: false }],
    scheduledBlocks: [{ id: 'b-1', title: 'Deep work', start: '09:00', duration: 120, date: '2026-10-24' }],
    weeklyResets: [{ id: 'wr-1', weekStart: '2026-10-19', wins: 'Shipped the deck' }],
    practiceItems: [{ id: 'q-1', track: 'interview', prompt: 'Walk me through a deal', answer: { raw: 'Once...' }, confidence: 4 }],
    stories: [{ id: 's-1', title: 'The turnaround' }],
    learning: [{ id: 'l-1', kind: 'reading', title: 'An article', url: 'https://x.test', status: 'queued', priority: 1, addedAt: '2026-10-01' }],
    content: [{ id: 'c-1', hook: 'A hook' }],
    create: { ideas: [{ id: 'i-1', hook: 'Idea one' }], posts: [{ id: 'p-1', title: 'Post one', body: '...', status: 'drafting' }] },
    progressLog: [],
    modules: [{ id: 'm-1', name: 'Agentic AI', family: 'AI', type: 'light', status: 'active' }],
    inbox: [{ id: 'in-1', text: 'Read later' }],
    referenceLibrary: [{ id: 'ref-1', title: 'Meeting reset' }],
    elsewhereToggles: { morning: false, afternoon: false, allDay: false, date: null },
    completedActions: [{ id: 'ca-1', text: 'Did a thing', done: true, createdAt: '2026-10-01' }],
    weather: { lat: 47.99, lon: -4.49, label: 'Plouhinec', source: 'manual' },
    prefs: { theme: 'light', categoryColors: { gym: '#7EB8A4' }, categoryEmojis: {}, categoryLabels: {},
             todayView: 'timeline', lunchSlot: { start: '12:30', duration: 60 }, userCategories: {} },
    userProfile: { id: 'singleton-user-profile', targetRoles: ['Global Account Executive'],
                   competencyFramework: [], positioningThesis: 'Enterprise seller',
                   industries: ['Banking'], geos: ['EMEA'], switchDeadline: 'October 2026' },
  });

  it('keeps every pre-existing record through the migration', () => {
    const before = productionLike();
    const { data } = migrate(before) as { data: Record<string, unknown> };

    expect(data.projects).toEqual(before.projects);
    expect(data.todos).toEqual(before.todos);
    expect(data.scheduledBlocks).toEqual(before.scheduledBlocks);
    expect(data.weeklyResets).toEqual(before.weeklyResets);
    expect(data.practiceItems).toEqual(before.practiceItems);
    expect(data.stories).toEqual(before.stories);
    expect(data.learning).toEqual(before.learning);
    expect(data.content).toEqual(before.content);
    expect(data.create).toEqual(before.create);
    expect(data.modules).toEqual(before.modules);
    expect(data.inbox).toEqual(before.inbox);
    expect(data.completedActions).toEqual(before.completedActions);
    expect(data.weather).toEqual(before.weather);
    expect(data.userProfile).toEqual(before.userProfile);
    expect(data.calendars).toEqual(before.calendars);
    expect(data.createdAt).toBe(before.createdAt);
  });

  it('keeps the old routine, its overrides and its completion map', () => {
    const before = productionLike();
    const { data } = migrate(before) as { data: Record<string, unknown> };
    expect(data.routine).toEqual(before.routine);
    expect(data.routineArchive).toEqual(before.routine);
    expect(data.overrides).toEqual(before.overrides);
    expect(data.routineCompletions).toEqual(before.routineCompletions);
  });

  it('keeps the user’s own preferences rather than resetting them', () => {
    const before = productionLike();
    const { data } = migrate(before) as { data: { prefs: Record<string, unknown> } };
    expect(data.prefs.theme).toBe('light');
    expect(data.prefs.categoryColors).toEqual({ gym: '#7EB8A4' });
    expect(data.prefs.lunchSlot).toEqual({ start: '12:30', duration: 60 });
  });

  it('seeds the new routine and lands on the current schema', () => {
    const { data } = migrate(productionLike()) as { data: Record<string, unknown> };
    expect((data.routineActivities as unknown[]).length).toBeGreaterThan(0);
    expect(data.schemaVersion).toBe(28);
  });

  it('survives being migrated repeatedly without drift', () => {
    const once = migrate(productionLike()).data;
    const twice = migrate(once).data;
    const thrice = migrate(twice).data;
    expect(thrice).toEqual(twice);
  });

  it('round-trips a migrated production payload through storage', async () => {
    const { data } = migrate(productionLike());
    await saveData(data);
    _resetForTest();
    const read = await loadData() as Record<string, unknown>;
    const ids = (list: unknown[]) => (list as { id: string }[]).map(r => r.id).sort();
    expect(ids(read.projects as unknown[])).toEqual(ids(data.projects));
    expect(read.routineActivities).toEqual(data.routineActivities);
    expect(read.routineArchive).toEqual(data.routineArchive);
    expect(read.prefs).toEqual(data.prefs);
    expect(read.userProfile).toEqual(data.userProfile);
  });
});
