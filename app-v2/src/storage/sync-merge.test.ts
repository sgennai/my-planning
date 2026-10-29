// @vitest-environment jsdom
// Two devices that have not caught up with each other, against a stand-in
// Worker that, like the real one, notes when each record reached it and hands
// out a cursor. Each device keeps its own database and sync markers, so these
// replay the two ways data was lost before the audit of 2026-10-29: a stale
// device's activity list replacing the other's newer edits, and changes made
// offline never reaching a device that had synced in between.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { syncData, loadData, saveData, initDB, STORES, _resetForTest } from './db';
import { mergeActivityLists } from './merge';
import { makeDefaultData } from '../main-app';
import { setCompletion, buildCompletionIndex, stateOf } from '../routine/engine';
import type { RoutineActivity } from '../routine/model';

// ── Stand-in Worker: last-write-wins by updatedAt, listed by arrival ─────────
let clock = Date.parse('2026-10-29T08:00:00.000Z');
const tick = (ms = 1000) => { clock += ms; return new Date(clock).toISOString(); };
const server = new Map<string, Record<string, unknown> & { updatedAt: string; serverAt: string }>();
const online = { value: true };
const pulls: { since: string; cursor: string }[] = [];

(globalThis as unknown as { fetch: unknown }).fetch = vi.fn(async (url: string, opts: { body?: string }) => {
  if (!online.value) throw new Error('offline');
  if (url.includes('/sync/push')) {
    const now = tick(1);
    for (const r of JSON.parse(opts.body!)) {
      const key = `${r.storeName}:${r.id}`;
      const existing = server.get(key);
      if (!existing || r.updatedAt > existing.updatedAt) server.set(key, { ...r, serverAt: now });
    }
    return { ok: true, json: async () => ({ ok: true }) };
  }
  if (url.includes('/sync/pull')) {
    const since = new URL(url, 'http://x').searchParams.get('since') || '';
    const cursor = tick(1);
    const records = [...server.values()].filter(r => r.serverAt > since)
      .map(r => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'serverAt')));
    pulls.push({ since, cursor });
    return { ok: true, json: async () => ({ records, cursor }) };
  }
  return { ok: false, statusText: 'Not found' };
});

// ── Devices: each its own IndexedDB contents and localStorage ────────────────
type Device = { rows: Record<string, unknown[]>; storage: Record<string, string> };
const SYNC_URL = 'http://localhost/sync';
const SECRET = 'test-secret';

async function snapshot(): Promise<Device> {
  const db = await initDB();
  const rows: Record<string, unknown[]> = {};
  for (const s of Object.values(STORES)) rows[s] = await db.getAll(s);
  return { rows, storage: { ...localStorage } };
}
async function restore(d: Device) {
  _resetForTest();
  const db = await initDB();
  const tx = db.transaction(Object.values(STORES), 'readwrite');
  for (const s of Object.values(STORES)) {
    await tx.objectStore(s).clear();
    for (const r of d.rows[s] || []) await tx.objectStore(s).put(r);
  }
  await tx.done;
  localStorage.clear();
  for (const [k, v] of Object.entries(d.storage)) localStorage.setItem(k, v);
}
/** Run `fn` as device `d` and keep what it leaves behind. */
async function as(d: Device, fn: () => Promise<void>): Promise<Device> {
  await restore(d);
  await fn();
  return snapshot();
}

type Data = { routineActivities: RoutineActivity[]; progressLog: unknown[]; [k: string]: unknown };
const read = async () => (await loadData()) as unknown as Data;
const save = async (d: Data) => { vi.setSystemTime(clock); await saveData(d); };
const sync = async () => { vi.setSystemTime(clock); return syncData(SYNC_URL, SECRET); };
const edit = (d: Data, id: string, patch: Partial<RoutineActivity>): Data => ({
  ...d,
  routineActivities: d.routineActivities.map(a => (a.id === id ? { ...a, ...patch, updatedAt: tick() } : a)),
});
const titleOf = (d: Data, id: string) => d.routineActivities.find(a => a.id === id)?.title;

/** Two devices that both start from the same synced routine. */
async function twoDevices(): Promise<[Device, Device]> {
  const blank: Device = { rows: {}, storage: {} };
  const ipad = await as(blank, async () => { await save(makeDefaultData() as unknown as Data); tick(); await sync(); });
  const iphone = await as(blank, async () => {
    tick();
    await sync();
  });
  // The iPhone's first pull hands it everything; mark it as caught up.
  return [ipad, await as(iphone, async () => { tick(); await sync(); })];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  server.clear();
  pulls.length = 0;
  online.value = true;
  clock = Date.parse('2026-10-29T08:00:00.000Z');
});

describe('two devices editing the routine', () => {
  it('a stale device adding an activity keeps the other device\'s rename', async () => {
    const [first, iphone] = await twoDevices();
    let ipad = first;
    // iPad renames the plank and syncs.
    ipad = await as(ipad, async () => { await save(edit(await read(), 'ra-plank', { title: 'Front plank' })); tick(); await sync(); });
    // The iPhone has not pulled since; it adds an activity from its older list.
    await as(iphone, async () => {
      const d = await read();
      tick();
      await save({ ...d, routineActivities: [...d.routineActivities, {
        ...d.routineActivities[0], id: 'ra-cold-shower', title: 'Cold shower', updatedAt: tick(),
      }] });
      tick();
      await sync();
      const after = await read();
      expect(titleOf(after, 'ra-plank')).toBe('Front plank');
      expect(titleOf(after, 'ra-cold-shower')).toBe('Cold shower');
    });
    // And the iPad gets the merged list back.
    await as(ipad, async () => {
      tick();
      await sync();
      const after = await read();
      expect(titleOf(after, 'ra-plank')).toBe('Front plank');
      expect(titleOf(after, 'ra-cold-shower')).toBe('Cold shower');
    });
  });

  it('a start-up migration on a stale device cannot undo a real edit', async () => {
    const [first, iphone] = await twoDevices();
    let ipad = first;
    ipad = await as(ipad, async () => { await save(edit(await read(), 'ra-wall-sit', { photo: 'stretch' })); tick(); await sync(); });
    // The iPhone opens an update whose migration rewrites the wall sit's photo
    // and the plank's title without stamping either, as relabel.ts does.
    await as(iphone, async () => {
      const d = await read();
      tick();
      await save({ ...d, routineActivities: d.routineActivities.map(a =>
        a.id === 'ra-wall-sit' ? { ...a, photo: 'yoga' }
          : a.id === 'ra-plank' ? { ...a, title: 'Plank (migrated)' } : a) });
      tick();
      await sync();
      const after = await read();
      // The real edit wins over the migration's...
      expect(after.routineActivities.find(a => a.id === 'ra-wall-sit')?.photo).toBe('stretch');
      // ...and the migration's change to an activity nobody edited stays.
      expect(titleOf(after, 'ra-plank')).toBe('Plank (migrated)');
    });
    await as(ipad, async () => {
      tick();
      await sync();
      const after = await read();
      expect(after.routineActivities.find(a => a.id === 'ra-wall-sit')?.photo).toBe('stretch');
      expect(titleOf(after, 'ra-plank')).toBe('Plank (migrated)');
    });
  });

  it('the same activity edited on both keeps the later edit', async () => {
    const [first, iphone] = await twoDevices();
    let ipad = first;
    ipad = await as(ipad, async () => { await save(edit(await read(), 'ra-plank', { title: 'iPad title' })); tick(); await sync(); });
    await as(iphone, async () => { await save(edit(await read(), 'ra-plank', { title: 'iPhone title' })); tick(); await sync(); });
    await as(ipad, async () => { tick(); await sync(); expect(titleOf(await read(), 'ra-plank')).toBe('iPhone title'); });
  });
});

describe('changes made offline', () => {
  it('reach a device that synced while the other was offline', async () => {
    let [ipad, iphone] = await twoDevices();
    // iPhone ticks the plank with no signal: stamped now, uploaded later.
    online.value = false;
    iphone = await as(iphone, async () => {
      const d = await read();
      await save({ ...d, progressLog: setCompletion(d.progressLog, 'ra-plank', '2026-10-29', 'done') });
      expect((await sync()).error).toBeTruthy();
    });
    online.value = true;
    // Meanwhile the iPad syncs, moving its cursor past the tick's own time.
    tick(60_000);
    ipad = await as(ipad, async () => { await sync(); });
    const ipadCursor = pulls[pulls.length - 1].cursor;
    // The iPhone gets signal and uploads the tick, stamped an hour ago.
    tick(3_600_000);
    await as(iphone, async () => { await sync(); });
    await as(ipad, async () => {
      tick();
      await sync();
      // The iPad asked for what reached the server since its last pull, by the
      // server's marker, not by its own clock.
      expect(pulls[pulls.length - 1].since).toBe(ipadCursor);
      expect(stateOf(buildCompletionIndex((await read()).progressLog), 'ra-plank', '2026-10-29')).toBe('done');
    });
  });
});

describe('mergeActivityLists', () => {
  const a = (id: string, updatedAt?: string, title = id) => ({ id, updatedAt, title });
  it('keeps each activity\'s newer version and every activity added on either side', () => {
    const merged = mergeActivityLists(
      [a('x', '2026-10-29T09:00:00Z', 'local x'), a('y', '2026-10-29T07:00:00Z', 'local y'), a('mine')],
      [a('x', '2026-10-29T08:00:00Z', 'remote x'), a('y', '2026-10-29T10:00:00Z', 'remote y'), a('theirs')],
    );
    expect(merged.map(m => m.title)).toEqual(['local x', 'remote y', 'mine', 'theirs']);
  });
  it('keeps the local version on a tie, and an unstamped one loses to a stamped one', () => {
    expect(mergeActivityLists([a('x', undefined, 'local')], [a('x', undefined, 'remote')])[0].title).toBe('local');
    expect(mergeActivityLists([a('x', undefined, 'local')], [a('x', '2026-10-29T08:00:00Z', 'remote')])[0].title).toBe('remote');
  });
});
