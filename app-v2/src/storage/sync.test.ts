// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { syncData, loadData, saveData, initDB, STORES, _resetForTest } from './db';

// Simulate remote D1 worker
let serverStore = new Map<string, any>();
let fetchCallCount = 0;

global.fetch = vi.fn(async (url: string, opts: any) => {
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
    const records = [];
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
    
    global.fetch.mockImplementationOnce(() => Promise.reject(new Error('Offline')));
    const data2 = { ...data1, featureFlags: { offline: true, changed: true } };
    await saveData(data2);
    
    const res = await syncData(SYNC_URL, SECRET);
    expect(res).toEqual([]); // failed silently
    
    global.fetch.mockRestore();
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
    expect(changes).toContainEqual({ id: 'todo-1', storeName: STORES.TODOS });
    
    const freshA = await loadData();
    expect(freshA.featureFlags.a).toBe(1);
    expect(freshA.todos).toContainEqual(expect.objectContaining({ title: 'Buy milk' }));
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
    expect(freshA.prefs.theme).toBe('light'); // Older remote change ignored
    
    const timeC = new Date(Date.now() + 5000).toISOString();
    serverStore.set(`${STORES.SINGLETONS}:prefs`, {
      id: 'prefs',
      storeName: STORES.SINGLETONS,
      updatedAt: timeC,
      payload: { id: 'prefs', value: { theme: 'dark' } }
    });

    const changes2 = await syncData(SYNC_URL, SECRET);
    expect(changes2).toContainEqual({ id: 'prefs', storeName: STORES.SINGLETONS });
    
    freshA = await loadData();
    expect(freshA.prefs.theme).toBe('dark'); // Newer remote change applied
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
});
