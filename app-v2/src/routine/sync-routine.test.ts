// @vitest-environment jsdom
// Does routine work actually survive the trip between devices?
//
// These drive the real db.ts against a stand-in Worker, so they exercise the
// same push/pull/last-write-wins path production uses — rather than asserting
// that the code looks right.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  syncData, loadData, saveData, initDB, STORES, _resetForTest,
  pullAndReplaceFromWorker,
} from '../storage/db';
import { makeDefaultData } from '../main-app';
import { buildCompletionIndex, toggleActivity, stateOf, resolveActivity } from './engine';
import type { RoutineActivity } from './model';

const serverStore = new Map<string, Record<string, unknown>>();

(globalThis as unknown as { fetch: unknown }).fetch = vi.fn(async (url: string, opts: { body?: string }) => {
  if (url.includes('/sync/push')) {
    for (const r of JSON.parse(opts.body!)) {
      const key = `${r.storeName}:${r.id}`;
      const existing = serverStore.get(key) as { updatedAt: string } | undefined;
      if (!existing || r.updatedAt > existing.updatedAt) serverStore.set(key, { ...r });
    }
    return { ok: true, json: async () => ({}) };
  }
  if (url.includes('/sync/pull')) {
    const since = new URL(url, 'http://x').searchParams.get('since') || '';
    const records = [...serverStore.values()].filter(r => (r.updatedAt as string) > since);
    return { ok: true, json: async () => ({ records }) };
  }
  return { ok: false, statusText: 'Not found' };
});

const SYNC_URL = 'http://localhost/sync';
const SECRET = 'test-secret';
const TUESDAY = '2026-10-27';

/** Wipe the local database — i.e. become a different device. */
async function becomeOtherDevice() {
  _resetForTest();
  localStorage.clear();
  const db = await initDB();
  const tx = db.transaction(Object.values(STORES), 'readwrite');
  for (const store of Object.values(STORES)) await tx.objectStore(store).clear();
  await tx.done;
}

/**
 * What `loadOrCreate` in main-app.tsx does when it finds an empty database:
 * pull the Worker's records *before* writing any defaults, so local defaults
 * stamped `updatedAt = now` cannot beat the Worker's older records under
 * last-write-wins. Skipping this step is the difference between a device
 * that adopts your routine and one that silently overwrites it.
 */
async function bootFreshDevice() {
  await pullAndReplaceFromWorker(SYNC_URL, SECRET);
  const pulled = await loadData();
  if (!pulled) await saveData(defaults());
  localStorage.setItem('my-planning-sync-time', new Date().toISOString());
  return (await loadData()) as unknown as Data;
}

const find = (list: RoutineActivity[], id: string) => list.find(a => a.id === id)!;

/** The slice of app data these tests read and write. */
interface Data {
  routineActivities: RoutineActivity[];
  progressLog: unknown[];
  [key: string]: unknown;
}
const defaults = () => makeDefaultData() as unknown as Data;

describe('routine state across devices', () => {
  beforeEach(async () => {
    serverStore.clear();
    await becomeOtherDevice();
  });

  it('a tick on one device shows as ticked on another', async () => {
    // iPad: tick the plank on Tuesday, save, sync up.
    const ipad = defaults();
    const plank = find(ipad.routineActivities, 'ra-plank');
    ipad.progressLog = toggleActivity(ipad.progressLog, plank, TUESDAY, buildCompletionIndex([]));
    await saveData(ipad);
    await syncData(SYNC_URL, SECRET);

    // iPhone: fresh device, pull everything down.
    await becomeOtherDevice();
    await bootFreshDevice();

    const iphone = ((await loadData()) as unknown as Data);
    expect(stateOf(buildCompletionIndex(iphone.progressLog), 'ra-plank', TUESDAY)).toBe('done');
  });

  it('un-ticking on one device un-ticks on the other', async () => {
    const ipad = defaults();
    const plank = find(ipad.routineActivities, 'ra-plank');
    ipad.progressLog = toggleActivity(ipad.progressLog, plank, TUESDAY, buildCompletionIndex([]));
    await saveData(ipad);
    await syncData(SYNC_URL, SECRET);

    await becomeOtherDevice();
    await bootFreshDevice();
    const iphone = ((await loadData()) as unknown as Data);
    expect(stateOf(buildCompletionIndex(iphone.progressLog), 'ra-plank', TUESDAY)).toBe('done');

    // Un-tick here; the removal has to propagate as a tombstone, not linger.
    iphone.progressLog = toggleActivity(
      iphone.progressLog, find(iphone.routineActivities, 'ra-plank'), TUESDAY,
      buildCompletionIndex(iphone.progressLog));
    await saveData(iphone);
    await syncData(SYNC_URL, SECRET);

    await becomeOtherDevice();
    await bootFreshDevice();
    const back = ((await loadData()) as unknown as Data);
    expect(stateOf(buildCompletionIndex(back.progressLog), 'ra-plank', TUESDAY)).toBe(null);
  });

  it('two devices ticking different activities the same day keep both', async () => {
    // This is what the old whole-map singleton could not do.
    const a = defaults();
    a.progressLog = toggleActivity(a.progressLog, find(a.routineActivities, 'ra-plank'), TUESDAY, buildCompletionIndex([]));
    await saveData(a);
    await syncData(SYNC_URL, SECRET);

    await becomeOtherDevice();
    const b = defaults();
    b.progressLog = toggleActivity(b.progressLog, find(b.routineActivities, 'ra-magnesium'), TUESDAY, buildCompletionIndex([]));
    await saveData(b);
    await syncData(SYNC_URL, SECRET);

    const merged = ((await loadData()) as unknown as Data);
    const index = buildCompletionIndex(merged.progressLog);
    expect(stateOf(index, 'ra-plank', TUESDAY)).toBe('done');
    expect(stateOf(index, 'ra-magnesium', TUESDAY)).toBe('done');
  });

  it('a grouped activity arrives complete, not half-ticked', async () => {
    const ipad = defaults();
    const stack = find(ipad.routineActivities, 'ra-breakfast-stack');
    ipad.progressLog = toggleActivity(ipad.progressLog, stack, TUESDAY, buildCompletionIndex([]));
    await saveData(ipad);
    await syncData(SYNC_URL, SECRET);

    await becomeOtherDevice();
    await bootFreshDevice();

    const iphone = ((await loadData()) as unknown as Data);
    const row = resolveActivity(
      find(iphone.routineActivities, 'ra-breakfast-stack'),
      buildCompletionIndex(iphone.progressLog), TUESDAY);
    expect(row.done).toBe(true);
    expect(row.childrenDone).toBe(4);
  });

  it('an edited activity — name, icon, picture, days — travels too', async () => {
    const ipad = defaults();
    ipad.routineActivities = ipad.routineActivities.map((a: RoutineActivity) =>
      a.id === 'ra-plank'
        ? { ...a, title: 'Front plank', icon: 'bolt', photo: 'summit',
            schedule: { type: 'weekdays' as const, days: [1, 3, 5] as never },
            required: false }
        : a);
    await saveData(ipad);
    await syncData(SYNC_URL, SECRET);

    await becomeOtherDevice();
    await bootFreshDevice();

    const iphone = ((await loadData()) as unknown as Data);
    const plank = find(iphone.routineActivities, 'ra-plank');
    expect(plank.title).toBe('Front plank');
    expect(plank.icon).toBe('bolt');
    expect(plank.photo).toBe('summit');
    expect(plank.required).toBe(false);
    expect(plank.schedule).toEqual({ type: 'weekdays', days: [1, 3, 5] });
  });

  it('a new activity added on one device appears on the other', async () => {
    const ipad = defaults();
    ipad.routineActivities = [...ipad.routineActivities, {
      id: 'ra-custom-1', title: 'Cold shower', group: 'morning', category: 'body',
      schedule: { type: 'daily' }, timing: { type: 'flexible' },
      surface: 'routine', required: true, status: 'active', order: 999,
    }];
    await saveData(ipad);
    await syncData(SYNC_URL, SECRET);

    await becomeOtherDevice();
    await bootFreshDevice();

    const iphone = ((await loadData()) as unknown as Data);
    expect(find(iphone.routineActivities, 'ra-custom-1').title).toBe('Cold shower');
  });

  it('history survives a reload on the same device', async () => {
    const data = defaults();
    data.progressLog = toggleActivity(
      data.progressLog, find(data.routineActivities, 'ra-plank'), TUESDAY, buildCompletionIndex([]));
    await saveData(data);

    // Reload: drop the in-memory snapshot, read back from IndexedDB only.
    _resetForTest();
    const reloaded = ((await loadData()) as unknown as Data);
    expect(stateOf(buildCompletionIndex(reloaded.progressLog), 'ra-plank', TUESDAY)).toBe('done');
  });

  it('two established devices ticking the same day keep both ticks', async () => {
    await saveData(defaults());
    await syncData(SYNC_URL, SECRET);

    // iPad ticks the plank and pushes.
    const ipad = (await loadData()) as unknown as Data;
    await saveData({ ...ipad, progressLog: toggleActivity(
      ipad.progressLog, find(ipad.routineActivities, 'ra-plank'), TUESDAY,
      buildCompletionIndex(ipad.progressLog)) });
    await syncData(SYNC_URL, SECRET);

    // iPhone: its own database, established earlier, hasn't seen the plank.
    await becomeOtherDevice();
    const iphone = await bootFreshDevice();
    await saveData({ ...iphone, progressLog: toggleActivity(
      iphone.progressLog, find(iphone.routineActivities, 'ra-magnesium'), TUESDAY,
      buildCompletionIndex(iphone.progressLog)) });
    await syncData(SYNC_URL, SECRET);

    const index = buildCompletionIndex(((await loadData()) as unknown as Data).progressLog);
    expect(stateOf(index, 'ra-plank', TUESDAY)).toBe('done');
    expect(stateOf(index, 'ra-magnesium', TUESDAY)).toBe('done');
  });

  it('a stale base cannot silently delete an earlier tick', async () => {
    // Saving a progressLog that is missing a record tombstones it, and the
    // deletion syncs. This is why completion writes go through the updater
    // form of `persist` rather than a captured render closure.
    const base = defaults();
    await saveData(base);

    const first = { ...base, progressLog: toggleActivity(
      base.progressLog, find(base.routineActivities, 'ra-plank'), TUESDAY,
      buildCompletionIndex(base.progressLog)) };
    await saveData(first);

    // Building the next write on `first` — not on `base` — keeps both.
    const second = { ...first, progressLog: toggleActivity(
      first.progressLog, find(first.routineActivities, 'ra-magnesium'), TUESDAY,
      buildCompletionIndex(first.progressLog)) };
    await saveData(second);

    _resetForTest();
    const index = buildCompletionIndex(((await loadData()) as unknown as Data).progressLog);
    expect(stateOf(index, 'ra-plank', TUESDAY)).toBe('done');
    expect(stateOf(index, 'ra-magnesium', TUESDAY)).toBe('done');
  });

  it('on one device, a save built on an old copy of the list replaces it', async () => {
    // The activity list is one synced record. Between two devices that both
    // changed it, sync merges it per activity (storage/sync-merge.test.ts).
    // A single device saving twice is not a conflict: its later save is its
    // list, even one built on a stale copy, as here.
    await saveData(defaults());
    await syncData(SYNC_URL, SECRET);
    await becomeOtherDevice();
    const base = await bootFreshDevice();

    const renamed = { ...base, routineActivities: base.routineActivities.map((x: RoutineActivity) =>
      x.id === 'ra-plank' ? { ...x, title: 'Front plank' } : x) };
    await saveData(renamed);
    await syncData(SYNC_URL, SECRET);

    const added = { ...base, routineActivities: [...base.routineActivities, {
      id: 'ra-custom-2', title: 'Cold shower', group: 'morning', category: 'body',
      schedule: { type: 'daily' }, timing: { type: 'flexible' },
      surface: 'routine', required: true, status: 'active', order: 999,
    }] };
    await saveData(added);
    await syncData(SYNC_URL, SECRET);

    const final = ((await loadData()) as unknown as Data);
    // The later write won outright: the rename is gone.
    expect(find(final.routineActivities, 'ra-plank').title).toBe('2-minute plank');
    expect(find(final.routineActivities, 'ra-custom-2')).toBeTruthy();
  });
});
