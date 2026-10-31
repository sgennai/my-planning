// @vitest-environment jsdom
// The working copy against a real (fake) IndexedDB: a sync has just written
// another device's tick into the database, and this device taps a tick of
// its own while the app reads the database back in. Before storage/live.ts
// the read could win, and the next save marked the tap's tick deleted.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { readData, saveData, adoptSnapshot, initDB, STORES, _resetForTest } from './db';
import { createLiveData } from './live';
import { makeDefaultData } from '../main-app';
import { setCompletion, buildCompletionIndex, stateOf } from '../routine/engine';

type Data = { progressLog: unknown[]; prefs?: Record<string, unknown>; [k: string]: unknown };
const DAY = '2026-10-31';

const tick = (d: Data, refId: string): Data =>
  ({ ...d, progressLog: setCompletion(d.progressLog, refId, DAY, 'done') });
const ticked = (d: Data | null, refId: string) =>
  !!d && stateOf(buildCompletionIndex(d.progressLog as never), refId, DAY) === 'done';

/** What a sync's pull does: writes the record straight into the database. */
async function arriveFromOtherDevice(refId: string) {
  const [record] = setCompletion([], refId, DAY, 'done') as { id: string }[];
  const db = await initDB();
  await db.put(STORES.PROGRESS_LOG, { ...record, updatedAt: new Date().toISOString() });
}

let shown: Data[];
let start: Data;

beforeEach(async () => {
  _resetForTest();
  const db = await initDB();
  const tx = db.transaction(Object.values(STORES), 'readwrite');
  for (const s of Object.values(STORES)) await tx.objectStore(s).clear();
  await tx.done;
  start = makeDefaultData() as unknown as Data;
  await saveData(start);
  shown = [];
});

/** A working copy whose database reads can be interrupted by `during`. */
function live(during?: (read: number) => void) {
  let reads = 0;
  const copy = createLiveData<Data>(d => shown.push(d), {
    read: async () => {
      const d = (await readData()) as unknown as Data | null;
      during?.(++reads);
      return d;
    },
    save: saveData,
    adopt: adoptSnapshot,
  });
  copy.start(start);
  return copy;
}

describe('the working copy after a sync', () => {
  it('keeps a tick tapped while the database was being read back in', async () => {
    await arriveFromOtherDevice('ra-wall-sit');
    const copy = live(read => { if (read === 1) copy.edit(tick(copy.current()!, 'ra-plank')); });

    expect(await copy.refresh()).toBe(true);
    expect(ticked(copy.current(), 'ra-plank')).toBe(true);
    expect(ticked(copy.current(), 'ra-wall-sit')).toBe(true);

    // The next save, of anything, keeps both.
    await copy.edit({ ...copy.current()!, prefs: { ...copy.current()!.prefs, theme: 'dark' } });
    const db = (await readData()) as unknown as Data;
    expect(ticked(db, 'ra-plank')).toBe(true);
    expect(ticked(db, 'ra-wall-sit')).toBe(true);
    expect(shown[shown.length - 1]).toBe(copy.current());
  });

  it('reads only once the edits already made are saved', async () => {
    await arriveFromOtherDevice('ra-wall-sit');
    const copy = live();
    void copy.edit(tick(start, 'ra-plank'));
    expect(await copy.refresh()).toBe(true);
    expect(ticked(copy.current(), 'ra-plank')).toBe(true);
    expect(ticked(copy.current(), 'ra-wall-sit')).toBe(true);
  });

  it('keeps the working copy while edits keep arriving, and owes a refresh', async () => {
    await arriveFromOtherDevice('ra-wall-sit');
    let busy = true;
    const copy = live(() => { if (busy) copy.edit(tick(copy.current()!, 'ra-plank')); });
    expect(await copy.refresh()).toBe(false);
    expect(copy.behind()).toBe(true);
    expect(ticked(copy.current(), 'ra-plank')).toBe(true);

    busy = false;
    expect(await copy.refresh()).toBe(true);
    expect(copy.behind()).toBe(false);
    expect(ticked(copy.current(), 'ra-wall-sit')).toBe(true);
    expect(ticked(copy.current(), 'ra-plank')).toBe(true);
  });

  it('saves edits in the order they were made', async () => {
    const copy = live();
    void copy.edit(tick(start, 'ra-plank'));
    await copy.edit(start);
    expect(ticked((await readData()) as unknown as Data, 'ra-plank')).toBe(false);
  });
});
