// The sync and the background fetch against stand-ins: no duplicates, a cut-short sync resumed, deletions
// kept, an article Instapaper can't extract set aside, a slow-down stopping the fetch.
import { describe, it, expect } from 'vitest';
import { syncLibrary, fetchOne, fetchBodies, RETRY_AFTER_MS, IN_A_ROW } from './sync';
import { IntakeError, type SyncPage } from './api';
import type { Article, SyncedBookmark } from './articles';
import type { Body, SyncMeta } from './cache';

const bm = (id: number): SyncedBookmark => ({
  id, url: `https://example.com/${id}`, title: `T${id}`, description: null, image: null, author: null, savedAt: id, publishedAt: null,
  archived: false, liked: false, folderId: null, tags: [], category: 0, instapaperProgress: 0, privateSource: null,
});

function store(meta: SyncMeta = { since: null, pending: null, lastSyncAt: null }) {
  const saved = new Map<number, Article>();
  const metas: SyncMeta[] = [];
  let current = meta;
  return {
    saved, metas,
    loadMeta: async () => current,
    saveMeta: async (m: SyncMeta) => { current = m; metas.push(m); },
    saveArticles: async (list: Article[]) => { for (const a of list) saved.set(a.id, a); },
    now: () => 2_000_000_000_000,
  };
}

describe('syncing', () => {
  it('asks from the beginning the first time, follows every page, and next time asks from its start', async () => {
    const s = store();
    const asked: [number, number][] = [];
    const pages: SyncPage[] = [
      { bookmarks: [bm(1), bm(2)], deletedIds: [], complete: false, nextOffset: 2 },
      { bookmarks: [bm(3)], deletedIds: [], complete: true, nextOffset: null },
    ];
    const changed = await syncLibrary(new Map(), { ...s, fetchChanges: async (since, offset) => { asked.push([since, offset]); return pages.shift()!; } });
    expect(asked).toEqual([[1, 0], [1, 2]]);
    expect(changed.map(a => a.id)).toEqual([1, 2, 3]);
    expect(s.metas.at(-1)).toEqual({ since: 2_000_000_000 - 60, pending: null, lastSyncAt: 2_000_000_000_000, signed: true });
  });

  it('once after Phase 2, a device synced before it asks for the whole library again (its pictures signed), then goes on as before', async () => {
    const s = store({ since: 1_900_000_000, pending: { since: 1_900_000_000, offset: 500, startedAt: 1_950_000_000 }, lastSyncAt: 1 });
    const asked: [number, number][] = [];
    const page: SyncPage = { bookmarks: [bm(1)], deletedIds: [], complete: true, nextOffset: null };
    await syncLibrary(new Map(), { ...s, fetchChanges: async (since, offset) => { asked.push([since, offset]); return page; } });
    await syncLibrary(new Map(s.saved), { ...s, fetchChanges: async (since, offset) => { asked.push([since, offset]); return page; } });
    expect(asked).toEqual([[1, 0], [2_000_000_000 - 60, 0]]);
    expect(s.metas.at(-1)?.signed).toBe(true);
  });

  it('a second sync of the same bookmarks adds nothing new', async () => {
    const s = store();
    const page: SyncPage = { bookmarks: [bm(1), bm(2)], deletedIds: [], complete: true, nextOffset: null };
    await syncLibrary(new Map(), { ...s, fetchChanges: async () => page });
    await syncLibrary(new Map(s.saved), { ...s, fetchChanges: async () => page });
    expect([...s.saved.keys()]).toEqual([1, 2]);
  });

  it('a sync cut short goes on from where it stopped, keeping its start time', async () => {
    const s = store();
    let call = 0;
    const failing = async (): Promise<SyncPage> => {
      if (call++ === 0) return { bookmarks: [bm(1)], deletedIds: [], complete: false, nextOffset: 500 };
      throw new IntakeError('offline', "You're offline.");
    };
    await expect(syncLibrary(new Map(), { ...s, fetchChanges: failing })).rejects.toMatchObject({ code: 'offline' });
    expect(s.metas.at(-1)?.pending).toEqual({ since: 1, offset: 500, startedAt: 2_000_000_000 });
    const asked: [number, number][] = [];
    await syncLibrary(new Map(s.saved), { ...s, now: () => 2_000_000_900_000, fetchChanges: async (since, offset) => { asked.push([since, offset]); return { bookmarks: [bm(2)], deletedIds: [], complete: true, nextOffset: null }; } });
    expect(asked).toEqual([[1, 500]]);
    expect(s.metas.at(-1)).toMatchObject({ since: 2_000_000_000 - 60, pending: null });
    expect([...s.saved.keys()]).toEqual([1, 2]);
  });

  it('a deleted bookmark is kept, marked removed', async () => {
    const s = store({ since: 100, pending: null, lastSyncAt: 1 });
    const kept = new Map<number, Article>([[5, { ...bm(5), domain: 'example.com', firstSeenAt: 1, removedAt: null, content: 'cached', words: 900, lead: null }]]);
    const changed = await syncLibrary(kept, { ...s, fetchChanges: async () => ({ bookmarks: [], deletedIds: [5], complete: true, nextOffset: null }) });
    expect(changed).toEqual([{ ...kept.get(5)!, removedAt: 2_000_000_000_000 }]);
  });
});

describe('fetching a body', () => {
  const a: Article = { ...bm(7), domain: 'example.com', firstSeenAt: 1, removedAt: null, content: 'none', words: null, lead: null };
  const deps = () => {
    const bodies: Body[] = [], articles: Article[] = [];
    return { bodies, articles, saveBody: async (b: Body) => { bodies.push(b); }, saveArticles: async (l: Article[]) => { articles.push(...l); }, now: () => 42 };
  };

  it('keeps the body on the device and records its length', async () => {
    const d = deps();
    const out = await fetchOne(a, { ...d, fetchArticle: async () => ({ id: 7, title: null, author: null, authorUrl: null, publishedAt: null, thumbnail: null, description: null, category: 0, html: '<p>words</p>', images: [], words: 460, paywalled: false, direction: 'ltr', sigs: { 'https://img.example.com/1.jpg': 'sig1' } }) });
    expect('article' in out && out.article).toMatchObject({ content: 'cached', words: 460 });
    expect(d.bodies).toEqual([{ id: 7, html: '<p>words</p>', images: [], words: 460, paywalled: false, direction: 'ltr', fetchedAt: 42, sigs: { 'https://img.example.com/1.jpg': 'sig1' } }]);
  });

  it("sets aside an article Instapaper can't extract, so it isn't asked for again", async () => {
    const d = deps();
    const out = await fetchOne(a, { ...d, fetchArticle: async () => { throw new IntakeError('unavailable', 'x'); } });
    expect('article' in out && out.article.content).toBe('unavailable');
    expect(d.bodies).toEqual([]);
  });

  it('stops on a slow-down or offline, recording nothing', async () => {
    for (const code of ['rate-limited', 'offline', 'auth-failed'] as const) {
      const d = deps();
      const out = await fetchOne(a, { ...d, fetchArticle: async () => { throw new IntakeError(code, 'x', code === 'rate-limited' ? 30 : null); } });
      expect('stop' in out && out.stop.code).toBe(code);
      expect(d.articles).toEqual([]);
    }
  });
});

describe('an article that does not come', () => {
  const base: Article = { ...bm(7), domain: 'example.com', firstSeenAt: 1, removedAt: null, content: 'none', words: null, lead: null };
  const deps = () => ({ saveBody: async () => {}, saveArticles: async () => {}, now: () => 1000 });
  const slow = async () => { throw new IntakeError('unreachable', 'x'); };

  it('is set aside and asked for again after 10 minutes, an hour, 6 hours, then left to its original', async () => {
    let a = base;
    for (const wait of RETRY_AFTER_MS) {
      const out = await fetchOne(a, { ...deps(), fetchArticle: slow });
      expect('failed' in out && out.failed).toBe(true);
      a = (out as { article: Article }).article;
      expect([a.content, a.retryAt]).toEqual(['none', 1000 + wait]);
    }
    const last = await fetchOne(a, { ...deps(), fetchArticle: slow });
    expect((last as { article: Article }).article).toMatchObject({ content: 'unavailable', tries: 4, retryAt: null });
  });

  it("is passed over: the rest still come", async () => {
    const list = new Map<number, Article>([1, 2, 3].map(id => [id, { ...base, id, savedAt: id }]));
    const asked: number[] = [];
    const end = await fetchBodies({
      ...deps(), sleep: async () => {}, alive: () => true, onProgress: () => {},
      list: () => [...list.values()], onArticle: a => list.set(a.id, a),
      fetchArticle: async id => {
        asked.push(id);
        if (id === 3) throw new IntakeError('unreachable', 'x');
        return { id, title: null, author: null, authorUrl: null, publishedAt: null, thumbnail: null, description: null, category: 0, html: '<p>x</p>', images: [], words: 230, paywalled: false, direction: 'ltr' };
      },
    });
    expect(asked).toEqual([3, 2, 1]);
    expect(end).toEqual({ stopped: null, failed: 1 });
    expect([...list.values()].map(a => a.content)).toEqual(['cached', 'cached', 'none']);
  });

  it(`${IN_A_ROW} in a row: Instapaper isn't answering, so the fetch stops until next time`, async () => {
    const list = new Map<number, Article>([1, 2, 3, 4, 5].map(id => [id, { ...base, id, savedAt: id }]));
    const asked: number[] = [];
    const end = await fetchBodies({
      ...deps(), sleep: async () => {}, alive: () => true, onProgress: () => {},
      list: () => [...list.values()], onArticle: a => list.set(a.id, a),
      fetchArticle: async id => { asked.push(id); throw new IntakeError('upstream', 'x'); },
    });
    expect(asked).toEqual([5, 4, 3]);
    expect(end.stopped?.code).toBe('unreachable');
    expect(end.failed).toBe(3);
  });

  it('a slow-down waits and goes on; offline stops at once, marking nothing', async () => {
    const list = new Map<number, Article>([[1, { ...base, id: 1 }]]);
    const waits: number[] = [];
    let calls = 0;
    const end = await fetchBodies({
      ...deps(), sleep: async ms => { waits.push(ms); }, alive: () => true, onProgress: () => {},
      list: () => [...list.values()], onArticle: a => list.set(a.id, a),
      fetchArticle: async id => {
        if (calls++ === 0) throw new IntakeError('rate-limited', 'x', 30);
        return { id, title: null, author: null, authorUrl: null, publishedAt: null, thumbnail: null, description: null, category: 0, html: '<p>x</p>', images: [], words: 230, paywalled: false, direction: 'ltr' };
      },
    });
    expect(waits[0]).toBe(30_000);
    expect(end).toEqual({ stopped: null, failed: 0 });
    const offline = await fetchBodies({
      ...deps(), sleep: async () => {}, alive: () => true, onProgress: () => {},
      list: () => [{ ...base, id: 9 }], onArticle: () => { throw new Error('nothing to record'); },
      fetchArticle: async () => { throw new IntakeError('offline', 'x'); },
    });
    expect(offline).toEqual({ stopped: expect.objectContaining({ code: 'offline' }), failed: 0 });
  });
});
