// The library's logic: merging a sync, what a parse adds, your reading, and finding and ordering.
import { describe, it, expect } from 'vitest';
import {
  mergeSync, withParse, readingIndex, statusOf, matchesFilter, matchesQuery, sortArticles, toFetch, domainOf, minutesOf,
  imageOf, descriptionOf, authorOf, titleOf, type Article, type SyncedBookmark,
} from './articles';

const bm = (id: number, extra: Partial<SyncedBookmark> = {}): SyncedBookmark => ({
  id, url: `https://www.example.com/a/${id}`, title: `Title ${id}`, description: 'Opening words', image: null, author: null,
  savedAt: 1_700_000_000 + id, publishedAt: null, archived: false, liked: false, folderId: null, tags: [], category: 0,
  instapaperProgress: 0, privateSource: null, ...extra,
});
const art = (id: number, extra: Partial<Article> = {}): Article => ({
  ...bm(id), domain: 'example.com', firstSeenAt: 1000, removedAt: null, content: 'none', words: null, lead: null, ...extra,
});

describe('a sync, merged', () => {
  it('adds new bookmarks with the day the device first had them, and their domain', () => {
    const [a] = mergeSync(new Map(), [bm(1)], [], 5000);
    expect(a).toMatchObject({ id: 1, domain: 'example.com', firstSeenAt: 5000, removedAt: null, content: 'none', words: null, lead: null });
  });

  it('updates Instapaper fields but keeps what the device found out', () => {
    const before = art(1, { firstSeenAt: 1000, content: 'cached', words: 900, lead: { image: 'https://i.example.com/l.jpg', description: null, author: 'A', publishedAt: null } });
    const [a] = mergeSync(new Map([[1, before]]), [bm(1, { title: 'Renamed', archived: true })], [], 9000);
    expect(a).toMatchObject({ title: 'Renamed', archived: true, firstSeenAt: 1000, content: 'cached', words: 900 });
    expect(a.lead?.author).toBe('A');
  });

  it('marks a deleted bookmark removed, never drops it, and returns it when it comes back', () => {
    const existing = new Map([[1, art(1)], [2, art(2)]]);
    const out = mergeSync(existing, [], [2, 99], 7000);
    expect(out).toEqual([{ ...art(2), removedAt: 7000 }]);
    const back = mergeSync(new Map([[2, out[0]]]), [bm(2)], [], 8000);
    expect(back[0].removedAt).toBeNull();
  });

  it('returns only what changed, once each', () => {
    const out = mergeSync(new Map(), [bm(1), bm(1, { title: 'Again' })], [], 1);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Again');
  });
});

describe('what a parse adds', () => {
  const parsed = { id: 1, title: 'T', author: 'By Line', authorUrl: null, publishedAt: 1_690_000_000, thumbnail: 'https://i.example.com/t.jpg', description: 'Summary', category: 0, html: '<p>x</p>', images: [], words: 1150, paywalled: false, direction: 'ltr' as const };

  it('gives the length, and fills only what the list lacked', () => {
    const a = withParse(art(1, { image: 'https://i.example.com/own.jpg', author: null, description: null }), parsed);
    expect([a.content, a.words, minutesOf(a.words)]).toEqual(['cached', 1150, 5]);
    expect(imageOf(a)).toBe('https://i.example.com/own.jpg');
    expect(authorOf(a)).toBe('By Line');
    expect(descriptionOf(a)).toBe('Summary');
  });

  it('a parse without a body leaves the article to its original', () => {
    expect(withParse(art(1), { ...parsed, html: null }).content).toBe('unavailable');
  });
});

describe('your reading', () => {
  const log = [
    { id: 'ar:1', type: 'intake-reading', value: { progress: 0.4 } },
    { id: 'ar:2', type: 'intake-reading', value: { progress: 0.9 } },
    { id: 'ac:2', type: 'intake-read-mark', value: { finished: true } },
    { id: 'ar:3', type: 'intake-reading', value: { progress: 0.01 } },
    { id: 'ir:abc', type: 'intel-reading', value: { progress: 1 } },
    { id: 'ac:4', type: 'intake-read-mark', value: { finished: true }, _deleted: true },
  ];
  const reading = readingIndex(log);

  it('reads only Intake records, finished only by the mark', () => {
    expect(statusOf(1, reading)).toBe('progress');
    expect(statusOf(2, reading)).toBe('finished');
    expect(statusOf(3, reading)).toBe('unread');
    expect(statusOf(4, reading)).toBe('unread');
    expect(statusOf(5, reading)).toBe('unread');
  });

  it("keeps Instapaper's archive and like apart from your status", () => {
    const archived = art(7, { archived: true, instapaperProgress: 1 });
    expect(statusOf(7, reading)).toBe('unread');
    expect(matchesFilter(archived, 'archived', reading)).toBe(true);
    expect(matchesFilter(archived, 'finished', reading)).toBe(false);
    expect(matchesFilter(archived, 'unread', reading)).toBe(true);
  });

  it('keeps a removed article out of every view but Removed', () => {
    const gone = art(1, { removedAt: 5 });
    for (const f of ['all', 'unread', 'progress', 'finished', 'archived', 'liked'] as const) expect(matchesFilter(gone, f, reading)).toBe(false);
    expect(matchesFilter(gone, 'removed', reading)).toBe(true);
  });
});

describe('finding and ordering', () => {
  it('matches every word in the title, source, byline, description or tags, accents and case aside', () => {
    const a = art(1, { title: 'Stratégie de données', domain: 'lesechos.fr', author: 'Anne', tags: ['ai'], lead: { image: null, description: null, author: null, publishedAt: null } });
    expect(matchesQuery(a, 'STRATEGIE echos')).toBe(true);
    expect(matchesQuery(a, 'anne ai')).toBe(true);
    expect(matchesQuery(a, 'strategie missing')).toBe(false);
    expect(matchesQuery(a, '   ')).toBe(true);
  });

  it('sorts by saved date, the day added, and length, unknown lengths last', () => {
    const list = [art(1, { savedAt: 10, firstSeenAt: 3, words: 2300 }), art(2, { savedAt: 30, firstSeenAt: 1, words: null }), art(3, { savedAt: 20, firstSeenAt: 2, words: 460 })];
    expect(sortArticles(list, 'saved-desc').map(a => a.id)).toEqual([2, 3, 1]);
    expect(sortArticles(list, 'saved-asc').map(a => a.id)).toEqual([1, 3, 2]);
    expect(sortArticles(list, 'added-desc').map(a => a.id)).toEqual([1, 3, 2]);
    expect(sortArticles(list, 'minutes-asc').map(a => a.id)).toEqual([3, 1, 2]);
  });

  it('fetches unread, not yet fetched articles, newest first', () => {
    const list = [art(1, { savedAt: 1 }), art(2, { savedAt: 5, archived: true }), art(3, { savedAt: 3, content: 'cached' }), art(4, { savedAt: 4 }), art(5, { savedAt: 6, removedAt: 1 }), art(6, { savedAt: 9, url: null })];
    expect(toFetch(list).map(a => a.id)).toEqual([4, 1]);
  });

  it('names what has no title by its source, and reads a domain without www', () => {
    expect(titleOf(art(1, { title: null }))).toBe('example.com');
    expect(domainOf('https://www.hbr.org/x')).toBe('hbr.org');
    expect(domainOf('not a url')).toBeNull();
    expect(minutesOf(100)).toBe(1);
    expect(minutesOf(null)).toBeNull();
  });
});
