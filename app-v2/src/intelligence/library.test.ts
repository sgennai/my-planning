// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cachedFeed, refreshFeed, _closeLibrary } from './library';

const FEED = 'enterprise-ai-challenge' as const;
const doc = (date: string, title: string) =>
  `---\nschema_version: 1\ncontent_type: "${FEED}"\nedition_date: "${date}"\ngenerated_at: "${date}T08:20:00+01:00"\ntitle: "${title}"\ntopics: ["Risk"]\n---\n\n## Challenge\n${title} text.`;

let folder: { id: string; name: string; modifiedTime: string }[];
let texts: Record<string, string>;
let fetched: string[];
let mode: 'ok' | 'not-configured' | 'offline';

vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  if (mode === 'offline') throw new TypeError('Load failed');
  if (mode === 'not-configured') return Response.json({ error: { code: 'not-configured', message: 'Google Drive is not connected yet.' } }, { status: 503 });
  if (url === `/api/intel/feeds/${FEED}`) return Response.json({ feedId: FEED, files: folder });
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
});

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
    expect(s).toMatchObject({ status: 'ready', editions: [], missing: [] });
  });
});
