// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { loadData, saveData, initDB, STORES, _resetForTest } from './db';
import { makeDefaultData } from '../main-app';

describe('IndexedDB persistence — settings + Todoist config survive reload', () => {
  beforeEach(async () => {
    _resetForTest();
    const db = await initDB();
    const tx = db.transaction(Object.values(STORES), 'readwrite');
    for (const store of Object.values(STORES)) await tx.objectStore(store).clear();
    await tx.done;
  });

  it('round-trips calendars, todoist, todoistSlots, todoistPending, completedActions', async () => {
    const data: any = makeDefaultData();
    data.calendars = { ...data.calendars, proxyUrl: 'https://proxy.example/api', syncUrl: 'https://sync.example', syncSecret: 's3cr3t' };
    data.todoist = { token: 'tok-123', projectId: 'p1', projectName: 'Perso', daysAhead: 7 };
    data.todoistSlots = { 'task-1': 'morning', 'task-2': 'afternoon' };
    data.todoistPending = [{ id: 'pend-1', content: 'queued task' }];
    data.completedActions = [{ projectId: 'proj-1', actionId: 'a1', text: 'did it', completedAt: '2026-06-01T00:00:00.000Z' }];

    await saveData(data);

    // Simulate a fresh load (background sync / page reload reconstructs from IndexedDB)
    _resetForTest();
    const loaded: any = await loadData();

    expect(loaded.calendars.proxyUrl).toBe('https://proxy.example/api');
    expect(loaded.calendars.syncUrl).toBe('https://sync.example');
    expect(loaded.calendars.syncSecret).toBe('s3cr3t');
    expect(loaded.todoist).toEqual({ token: 'tok-123', projectId: 'p1', projectName: 'Perso', daysAhead: 7 });
    expect(loaded.todoistSlots).toEqual({ 'task-1': 'morning', 'task-2': 'afternoon' });
    expect(loaded.todoistPending).toEqual([{ id: 'pend-1', content: 'queued task' }]);
    expect(loaded.completedActions).toEqual([{ projectId: 'proj-1', actionId: 'a1', text: 'did it', completedAt: '2026-06-01T00:00:00.000Z' }]);
  });
});
