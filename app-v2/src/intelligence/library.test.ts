// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openDB } from 'idb';
import { cachedFeed, refreshFeed, releaseLibrary, _closeLibrary, type FeedState } from './library';

const FEED = 'enterprise-ai-challenge' as const;
const doc = (date: string, title: string) =>
  `---\nschema_version: 1\ncontent_type: "${FEED}"\nedition_date: "${date}"\ngenerated_at: "${date}T08:20:00+01:00"\ntitle: "${title}"\ntopics: ["Risk"]\n---\n\n## Challenge\n${title} text.`;

let folder: { id: string; name: string; modifiedTime: string }[];
let texts: Record<string, string>;
let fetched: string[];
let mode: 'ok' | 'not-configured' | 'offline';
let complete: boolean | undefined;

vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  if (mode === 'offline') throw new TypeError('Load failed');
  if (mode === 'not-configured') return Response.json({ error: { code: 'not-configured', message: 'Google Drive is not connected yet.' } }, { status: 503 });
  if (url === `/api/intel/feeds/${FEED}`) return Response.json({ feedId: FEED, files: folder, ...(complete !== undefined && { complete }) });
  const id = decodeURIComponent(url.split('/').pop()!);
  fetched.push(id);
  if (!(id in texts)) return Response.json({ error: { code: 'google', message: 'Google Drive: internal error' } }, { status: 502 });
  const file = folder.find(f => f.id === id)!;
  return Response.json({ feedId: FEED, file, text: texts[id] });
}));

beforeEach(async () => {
  _closeLibrary();
  await new Promise<void>(res => { const r = indexedDB.deleteDatabase('my-planning-intel'); r.onsuccess = r.onerror = () => res(); });
  folder = [
    { id: 'doc-1101', name: '2026-11-01_0820__enterprise-ai-challenge', modifiedTime: '2026-11-01T07:25:00Z' },
    { id: 'doc-1102', name: '2026-11-02_0820__enterprise-ai-challenge', modifiedTime: '2026-11-02T07:25:00Z' },
  ];
  texts = { 'doc-1101': doc('2026-11-01', 'Shadow AI'), 'doc-1102': doc('2026-11-02', 'Agent sprawl') };
  fetched = [];
  mode = 'ok';
  complete = undefined;
});

/** A folder as Drive lists it: by name, newest first. */
const archive = (days: number) => {
  folder = [];
  texts = {};
  for (let i = days; i >= 1; i--) {
    const day = `2026-10-${String(i).padStart(2, '0')}`;
    folder.push({ id: `doc-10${String(i).padStart(2, '0')}`, name: `${day}_0820__enterprise-ai-challenge`, modifiedTime: `${day}T07:25:00Z` });
    texts[`doc-10${String(i).padStart(2, '0')}`] = doc(day, `Edition ${i}`);
  }
};

describe('the feed library', () => {
  it('fetches every edition the first time, newest first', async () => {
    const s = await refreshFeed(FEED);
    expect(s.status).toBe('ready');
    expect(s.editions.map(e => e.title)).toEqual(['Agent sprawl', 'Shadow AI']);
    expect(fetched.sort()).toEqual(['doc-1101', 'doc-1102']);
    expect(s.refreshedAt).not.toBeNull();
  });

  it('then fetches only what is new or changed', async () => {
    await refreshFeed(FEED);
    fetched = [];
    folder.push({ id: 'doc-1103', name: '2026-11-03_0820__enterprise-ai-challenge', modifiedTime: '2026-11-03T07:25:00Z' });
    texts['doc-1103'] = doc('2026-11-03', 'Model risk');
    folder[0] = { ...folder[0], modifiedTime: '2026-11-03T09:00:00Z' };
    texts['doc-1101'] = doc('2026-11-01', 'Shadow AI, corrected');
    const s = await refreshFeed(FEED);
    expect(fetched.sort()).toEqual(['doc-1101', 'doc-1103']);
    expect(s.editions.map(e => e.title)).toEqual(['Model risk', 'Agent sprawl', 'Shadow AI, corrected']);
  });

  it('opens from the device without Drive', async () => {
    await refreshFeed(FEED);
    mode = 'offline';
    const s = await cachedFeed(FEED);
    expect(s.editions.map(e => e.title)).toEqual(['Agent sprawl', 'Shadow AI']);
  });

  it('keeps its copy, and says why, when Drive cannot be reached or is not connected', async () => {
    await refreshFeed(FEED);
    mode = 'offline';
    const off = await refreshFeed(FEED);
    expect(off.status).toBe('offline');
    expect(off.editions).toHaveLength(2);
    mode = 'not-configured';
    const nc = await refreshFeed(FEED);
    expect(nc.status).toBe('not-configured');
    expect(nc.message).toBe('Google Drive is not connected yet.');
    expect(nc.editions).toHaveLength(2);
  });

  it('a document that fails is listed as missing; the others still read', async () => {
    delete texts['doc-1102'];
    const s = await refreshFeed(FEED);
    expect(s.status).toBe('ready');
    expect(s.editions.map(e => e.title)).toEqual(['Shadow AI']);
    expect(s.missing.map(m => [m.file.id, m.message])).toEqual([['doc-1102', 'Google Drive: internal error']]);
  });

  it('drops an edition taken out of the folder', async () => {
    await refreshFeed(FEED);
    folder = folder.filter(f => f.id !== 'doc-1101');
    const s = await refreshFeed(FEED);
    expect(s.editions.map(e => e.title)).toEqual(['Agent sprawl']);
    expect((await cachedFeed(FEED)).editions).toHaveLength(1);
  });

  it('an empty folder is an empty feed, not an error', async () => {
    folder = [];
    const s = await refreshFeed(FEED);
    expect(s).toMatchObject({ status: 'ready', editions: [], missing: [], pending: 0 });
  });
});

describe('a large archive', () => {
  it('shows the newest editions while the rest download', async () => {
    archive(20);
    const shown: FeedState[] = [];
    const s = await refreshFeed(FEED, state => shown.push(state));
    expect(shown.length).toBeGreaterThan(0);
    const first = shown[0];
    expect(first.editions.slice(0, 6).map(e => e.title)).toEqual([20, 19, 18, 17, 16, 15].map(i => `Edition ${i}`));
    expect(first.pending).toBe(20 - first.editions.length);
    expect(first.pending).toBeGreaterThan(0);
    expect(s.editions).toHaveLength(20);
    expect(s.pending).toBe(0);
  });

  it('a download cut short carries on from where it stopped', async () => {
    archive(10);
    const later = { 'doc-1002': texts['doc-1002'], 'doc-1001': texts['doc-1001'] };
    delete texts['doc-1002'];
    delete texts['doc-1001'];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await refreshFeed(FEED)).editions).toHaveLength(8);
    fetched = [];
    Object.assign(texts, later);
    expect((await refreshFeed(FEED)).editions).toHaveLength(10);
    expect(fetched.sort()).toEqual(['doc-1001', 'doc-1002']);
  });

  it('reads each document once a visit: an unchanged edition stays the same', async () => {
    const first = await refreshFeed(FEED);
    const again = await refreshFeed(FEED);
    expect(again.editions[0]).toBe(first.editions[0]);
    expect((await cachedFeed(FEED)).editions[1]).toBe(first.editions[1]);
    // Leaving the section lets go of them; the next visit reads them again.
    releaseLibrary();
    const next = await cachedFeed(FEED);
    expect(next.editions[0]).not.toBe(first.editions[0]);
    expect(next.editions[0].title).toBe(first.editions[0].title);
    // So does a new session.
    _closeLibrary();
    mode = 'offline';
    expect((await cachedFeed(FEED)).editions.map(e => e.title)).toEqual(['Agent sprawl', 'Shadow AI']);
  });

  it('keeps older editions when Drive lists a folder only in part', async () => {
    await refreshFeed(FEED);
    folder = folder.filter(f => f.id === 'doc-1102');
    complete = false;
    expect((await refreshFeed(FEED)).editions).toHaveLength(2);
    complete = true;
    expect((await refreshFeed(FEED)).editions).toHaveLength(1);
  });

  it('opens a copy stored by the earlier version of the app', async () => {
    _closeLibrary();
    const old = await openDB('my-planning-intel', 1, {
      upgrade(d) {
        d.createObjectStore('docs', { keyPath: 'id' });
        d.createObjectStore('lists', { keyPath: 'feedId' });
      },
    });
    await old.put('docs', { id: 'doc-1102', feedId: FEED, file: folder[1], text: texts['doc-1102'], fetchedAt: '2026-11-02T08:00:00Z' });
    await old.put('docs', { id: 'other', feedId: 'customer-engagement-brief', file: { id: 'other', name: 'x', modifiedTime: '2026-11-02T08:00:00Z' }, text: '', fetchedAt: '2026-11-02T08:00:00Z' });
    old.close();
    expect((await cachedFeed(FEED)).editions.map(e => e.title)).toEqual(['Agent sprawl']);
    await refreshFeed(FEED);
    expect(fetched).toEqual(['doc-1101']);
  });
});
