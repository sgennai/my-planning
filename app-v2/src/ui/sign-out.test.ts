// @vitest-environment jsdom
// Signing out of a device: the server is told first, then the briefings'
// cache and the offline copy of the app go. Nothing goes if the server could
// not be told, and the app's own database is never touched.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signOutOfThisDevice } from './sign-out';
import { cachedFeed, _closeLibrary } from '../intelligence/library';

let answer: 'ok' | 'offline' | 'refused' | 'no-gate';
const unregister = vi.fn(async () => true);
const deleted: string[] = [];

vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
  expect(url).toBe('/__auth/sign-out');
  expect(init.method).toBe('POST');
  if (answer === 'offline') throw new TypeError('Load failed');
  return new Response(null, { status: answer === 'ok' ? 204 : answer === 'no-gate' ? 404 : 403 });
}));
Object.defineProperty(navigator, 'serviceWorker', {
  configurable: true,
  value: { getRegistrations: async () => [{ unregister }] },
});
vi.stubGlobal('caches', {
  keys: async () => ['workbox-precache-v2', 'routine-photos'],
  delete: async (key: string) => { deleted.push(key); return true; },
});

const databases = async () => (await indexedDB.databases()).map(d => d.name).sort();

beforeEach(async () => {
  _closeLibrary();
  unregister.mockClear();
  deleted.length = 0;
  answer = 'ok';
  // The app's own database, and the briefings' cache with a connection open,
  // as when the Intelligence section is on screen.
  await new Promise<void>(res => { const r = indexedDB.open('my-planning-db', 1); r.onsuccess = () => { r.result.close(); res(); }; });
  await cachedFeed('enterprise-ai-challenge');
});

describe('signing out of this device', () => {
  it('tells the server, then drops the briefings and the offline app, keeping the app database', async () => {
    expect(await databases()).toEqual(['my-planning-db', 'my-planning-intel']);
    expect(await signOutOfThisDevice()).toBe('signed-out');
    expect(await databases()).toEqual(['my-planning-db']);
    expect(unregister).toHaveBeenCalled();
    expect(deleted).toEqual(['workbox-precache-v2', 'routine-photos']);
  });

  it('offline, it changes nothing and says so', async () => {
    answer = 'offline';
    expect(await signOutOfThisDevice()).toBe('offline');
    expect(await databases()).toEqual(['my-planning-db', 'my-planning-intel']);
    expect(unregister).not.toHaveBeenCalled();
    expect(deleted).toEqual([]);
  });

  it('refused by the server, it changes nothing', async () => {
    answer = 'refused';
    expect(await signOutOfThisDevice()).toBe('refused');
    expect(await databases()).toContain('my-planning-intel');
  });

  it('without the gate (local development), it still clears the device', async () => {
    answer = 'no-gate';
    expect(await signOutOfThisDevice()).toBe('signed-out');
    expect(await databases()).toEqual(['my-planning-db']);
  });
});
