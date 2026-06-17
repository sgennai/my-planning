// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { syncData, loadData, saveData, initDB, STORES, _resetForTest, pullAndReplaceFromWorker, NEEDS_INITIAL_PULL_KEY } from './db';

// Simulate remote D1 worker
let serverStore = new Map<string, any>();
let fetchCallCount = 0;

(globalThis as any).fetch = vi.fn(async (url: string, opts: any) => {
  fetchCallCount++;
  
  if (url.includes('/sync/push')) {
    const records = JSON.parse(opts.body);
    for (const r of records) {
      const key = `${r.storeName}:${r.id}`;
      const existing = serverStore.get(key);
      if (!existing || r.updatedAt > existing.updatedAt) {
        serverStore.set(key, { ...r });
      }
    }
    return { ok: true, json: async () => ({}) } as Response;
  }
  
  if (url.includes('/sync/pull')) {
    const since = new URL(url).searchParams.get('since') || '';
    const records: any[] = [];
    for (const r of serverStore.values()) {
      if (r.updatedAt > since) records.push(r);
    }
    return { ok: true, json: async () => ({ records }) } as Response;
  }
  
  return { ok: false, statusText: 'Not found' } as Response;
});

import { makeDefaultData } from '../main-app';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('WP-2 Sync Test Suite', () => {
  beforeEach(async () => {
    serverStore.clear();
    fetchCallCount = 0;
    localStorage.clear();
    _resetForTest();
    
    // Clear IndexedDB
    const db = await initDB();
    const tx = db.transaction(Object.values(STORES), 'readwrite');
    for (const store of Object.values(STORES)) {
      await tx.objectStore(store).clear();
    }
    await tx.done;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const SYNC_URL = 'http://localhost/sync';
  const SECRET = 'test-secret';

  it('offline edit reconciles on reconnect', async () => {
    const data1 = makeDefaultData();
    data1.featureFlags = { offline: true };
    await saveData(data1);
    await syncData(SYNC_URL, SECRET);
    expect(serverStore.size).toBeGreaterThan(0);
    
    await sleep(10); // Ensure timestamp differs
    
    (globalThis as any).fetch.mockImplementationOnce(() => Promise.reject(new Error('Offline')));
    const data2 = { ...data1, featureFlags: { offline: true, changed: true } };
    await saveData(data2);
    
    const res = await syncData(SYNC_URL, SECRET);
    expect(res.pulledIds).toEqual([]);
    expect(res.error).toBeInstanceOf(Error); // failed silently, error surfaced in result
    
    (globalThis as any).fetch.mockRestore();
    await syncData(SYNC_URL, SECRET);
    
    const serverObj = serverStore.get(`${STORES.SINGLETONS}:featureFlags`);
    expect(serverObj.payload.value.changed).toBe(true);
  });

  it('two-device edits to different entities both survive (no whole-file overwrite)', async () => {
    const dataA = makeDefaultData();
    dataA.featureFlags = { a: 1 };
    await saveData(dataA);
    await syncData(SYNC_URL, SECRET);

    const timeB = new Date(Date.now() + 1000).toISOString();
    serverStore.set(`${STORES.TODOS}:todo-1`, {
      id: 'todo-1',
      storeName: STORES.TODOS,
      updatedAt: timeB,
      deleted: false,
      payload: { id: 'todo-1', title: 'Buy milk' }
    });

    const changes = await syncData(SYNC_URL, SECRET);
    expect(changes.pulledIds).toContainEqual({ id: 'todo-1', storeName: STORES.TODOS });
    
    const freshA = await loadData();
    expect(freshA!.featureFlags.a).toBe(1);
    expect(freshA!.todos).toContainEqual(expect.objectContaining({ title: 'Buy milk' }));
  });

  it('same-entity last-write-wins', async () => {
    const dataA = makeDefaultData();
    dataA.prefs.theme = 'light';
    await saveData(dataA);
    await syncData(SYNC_URL, SECRET);
    
    const timeB = new Date(Date.now() - 5000).toISOString();
    serverStore.set(`${STORES.SINGLETONS}:prefs`, {
      id: 'prefs',
      storeName: STORES.SINGLETONS,
      updatedAt: timeB,
      payload: { id: 'prefs', value: { theme: 'dark' } }
    });

    await syncData(SYNC_URL, SECRET);
    
    let freshA = await loadData();
    expect(freshA!.prefs.theme).toBe('light'); // Older remote change ignored
    
    const timeC = new Date(Date.now() + 5000).toISOString();
    serverStore.set(`${STORES.SINGLETONS}:prefs`, {
      id: 'prefs',
      storeName: STORES.SINGLETONS,
      updatedAt: timeC,
      payload: { id: 'prefs', value: { theme: 'dark' } }
    });

    const changes2 = await syncData(SYNC_URL, SECRET);
    expect(changes2.pulledIds).toContainEqual({ id: 'prefs', storeName: STORES.SINGLETONS });
    
    freshA = await loadData();
    expect(freshA!.prefs.theme).toBe('dark'); // Newer remote change applied
  });

  it('cost-guard confirming no excessive calls (free-tier constraint)', async () => {
    const data = makeDefaultData();
    await saveData(data);
    await syncData(SYNC_URL, SECRET);

    const countBefore = fetchCallCount;

    await syncData(SYNC_URL, SECRET);
    expect(fetchCallCount - countBefore).toBe(1); // Only pull

    await syncData(SYNC_URL, SECRET);
    expect(fetchCallCount - countBefore).toBe(2);
  });

  it('fresh device online: pull-first preserves Worker data, defaults do not overwrite', async () => {
    // Simulate laptop: save data with a distinctive setting and push to Worker
    const laptop = makeDefaultData();
    laptop.prefs.theme = 'dark';
    laptop.featureFlags = { fromLaptop: true };
    await saveData(laptop);
    await syncData(SYNC_URL, SECRET);
    expect(serverStore.size).toBeGreaterThan(0);

    // Simulate fresh device: clear IndexedDB and all localStorage
    _resetForTest();
    const db = await initDB();
    const wipe = db.transaction(Object.values(STORES), 'readwrite');
    for (const s of Object.values(STORES)) await wipe.objectStore(s).clear();
    await wipe.done;
    localStorage.clear();

    // Pull-before-save: unconditional force-apply of Worker records
    const { ok, error } = await pullAndReplaceFromWorker(SYNC_URL, SECRET);
    expect(ok).toBe(true);
    expect(error).toBeNull();

    // IndexedDB now contains the laptop's data
    const pulled = await loadData();
    expect(pulled).not.toBeNull();
    expect(pulled!.prefs.theme).toBe('dark');
    expect(pulled!.featureFlags).toEqual({ fromLaptop: true });

    // Normal sync after pull: Worker data must not be overwritten
    localStorage.setItem('my-planning-sync-time', new Date().toISOString());
    await syncData(SYNC_URL, SECRET);

    const serverPrefs = serverStore.get(`${STORES.SINGLETONS}:prefs`);
    expect(serverPrefs.payload.value.theme).toBe('dark');
    const serverFlags = serverStore.get(`${STORES.SINGLETONS}:featureFlags`);
    expect(serverFlags.payload.value.fromLaptop).toBe(true);
  });

  it('fresh device offline: flag prevents push, force-applies remote data on first online sync', async () => {
    // Seed Worker with laptop data using a fixed past timestamp (older than any default)
    const laptopTime = '2024-01-01T00:00:00.000Z';
    serverStore.set(`${STORES.SINGLETONS}:prefs`, {
      id: 'prefs', storeName: STORES.SINGLETONS,
      updatedAt: laptopTime, deleted: false,
      payload: { id: 'prefs', value: { theme: 'dark' } }
    });
    serverStore.set(`${STORES.SINGLETONS}:schemaVersion`, {
      id: 'schemaVersion', storeName: STORES.SINGLETONS,
      updatedAt: laptopTime, deleted: false,
      payload: { id: 'schemaVersion', value: 26 }
    });

    // Fresh device offline: defaults saved with updatedAt=now (newer than laptopTime)
    const fresh = makeDefaultData(); // prefs.theme defaults to 'light'
    await saveData(fresh);
    localStorage.setItem(NEEDS_INITIAL_PULL_KEY, 'true');

    // First online sync: flag detected → skip push, force-apply remote
    const result = await syncData(SYNC_URL, SECRET);
    expect(result.error).toBeNull();
    expect(result.pulledIds.length).toBeGreaterThan(0); // signals caller to reload

    // Flag cleared after successful pull
    expect(localStorage.getItem(NEEDS_INITIAL_PULL_KEY)).toBeNull();

    // Remote data wins (force-apply) despite being older than local defaults
    const loaded = await loadData();
    expect(loaded!.prefs.theme).toBe('dark'); // not the default 'light'

    // Worker prefs untouched (push was skipped entirely)
    const serverPrefs = serverStore.get(`${STORES.SINGLETONS}:prefs`);
    expect(serverPrefs.payload.value.theme).toBe('dark');
  });
});
