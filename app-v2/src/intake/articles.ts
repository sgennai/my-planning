// Intake's Articles: the library as each device keeps it (from Instapaper, through /api/intake) and what
// the app derives from it. Instapaper's fields stay as Instapaper gives them; what a parse adds (a lead
// image, a description, a byline) sits apart in `lead` and only fills a gap, never replacing them.
//
// Your own reading state is the app's, not Instapaper's, and it syncs between devices in `progressLog`:
// - `ar:<bookmarkId>`, type `intake-reading`: how far you have read, and your place (written by the reader);
// - `ac:<bookmarkId>`, type `intake-read-mark`: Finished, set only by your tap.
// Instapaper's archive, like and progress are shown as Instapaper's, never taken for those.
import type { SyncedBookmark, ParsedArticle } from './types';

export type { SyncedBookmark, ParsedArticle };

export interface Article extends SyncedBookmark {
  domain: string | null;
  /** When this device first had it: "added to ROUTINE". */
  firstSeenAt: number;
  /** When Instapaper said it was deleted. Kept, with everything you made from it. */
  removedAt: number | null;
  /** Whether its body is on this device. */
  content: 'none' | 'cached' | 'unavailable';
  words: number | null;
  /** What the parse found that the list lacked. */
  lead: { image: string | null; description: string | null; author: string | null; publishedAt: number | null } | null;
  /** Times in a row its body didn't come (Instapaper too slow, or failing), and when to ask again. */
  tries?: number;
  retryAt?: number | null;
}

export const READING_TYPE = 'intake-reading';
export const READ_MARK_TYPE = 'intake-read-mark';
export const readingId = (bookmarkId: number) => `ar:${bookmarkId}`;
export const readMarkId = (bookmarkId: number) => `ac:${bookmarkId}`;

export function domainOf(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, '') || null; } catch { return null; }
}

/** About 230 words a minute, never under one. */
export const minutesOf = (words: number | null): number | null => (words && words > 0 ? Math.max(1, Math.round(words / 230)) : null);

/** The image, description, byline and date to show: Instapaper's, or the parse's where it had none. */
export const imageOf = (a: Article) => a.image ?? a.lead?.image ?? null;
export const descriptionOf = (a: Article) => a.description ?? a.lead?.description ?? null;
export const authorOf = (a: Article) => a.author ?? a.lead?.author ?? null;
export const titleOf = (a: Article) => a.title ?? a.domain ?? a.url ?? 'Untitled';

/**
 * A sync's changes, applied: bookmarks updated or added (keeping what the device found out about them),
 * deleted ones marked, never dropped. Returns only the records that changed.
 */
export function mergeSync(existing: ReadonlyMap<number, Article>, bookmarks: SyncedBookmark[], deletedIds: number[], now: number): Article[] {
  const changed = new Map<number, Article>();
  for (const b of bookmarks) {
    const prev = existing.get(b.id);
    changed.set(b.id, {
      ...b,
      domain: domainOf(b.url),
      firstSeenAt: prev?.firstSeenAt ?? now,
      removedAt: null,
      content: prev?.content ?? 'none',
      words: prev?.words ?? null,
      lead: prev?.lead ?? null,
      ...(prev?.tries ? { tries: prev.tries, retryAt: prev.retryAt ?? null } : {}),
    });
  }
  for (const id of deletedIds) {
    const prev = changed.get(id) ?? existing.get(id);
    if (prev && prev.removedAt === null) changed.set(id, { ...prev, removedAt: now });
  }
  return [...changed.values()];
}

/** What a parse tells about an article: its length, and what the list lacked. */
export function withParse(a: Article, p: ParsedArticle): Article {
  return {
    ...a,
    content: p.html ? 'cached' : 'unavailable',
    words: p.words ?? a.words,
    lead: { image: p.thumbnail, description: p.description, author: p.author, publishedAt: p.publishedAt },
    tries: 0,
    retryAt: null,
  };
}

// ── Your reading ───────────────────────────────────────────────────────────
export interface Reading { progress: number; finished: boolean }
export type Status = 'unread' | 'progress' | 'finished';

interface LogRecord { id?: unknown; type?: unknown; refId?: unknown; value?: { progress?: unknown; finished?: unknown }; _deleted?: unknown }

export function readingIndex(log: unknown[] | undefined): Map<number, Reading> {
  const out = new Map<number, Reading>();
  for (const raw of log ?? []) {
    const r = raw as LogRecord;
    if (r?._deleted || typeof r?.id !== 'string') continue;
    const id = Number(r.id.slice(3));
    if (!Number.isInteger(id)) continue;
    const cur = out.get(id) ?? { progress: 0, finished: false };
    if (r.type === READING_TYPE && r.id.startsWith('ar:')) cur.progress = Math.max(cur.progress, Math.min(1, Number(r.value?.progress) || 0));
    else if (r.type === READ_MARK_TYPE && r.id.startsWith('ac:')) cur.finished = r.value?.finished === true;
    else continue;
    out.set(id, cur);
  }
  return out;
}

/** Finished only by your tap; in progress once you are past the opening. */
export function statusOf(id: number, reading: ReadonlyMap<number, Reading>): Status {
  const r = reading.get(id);
  if (r?.finished) return 'finished';
  return r && r.progress > 0.02 ? 'progress' : 'unread';
}

// ── Finding and ordering ───────────────────────────────────────────────────
export type Filter = 'all' | 'unread' | 'progress' | 'finished' | 'archived' | 'liked' | 'removed';
export type Sort = 'saved-desc' | 'saved-asc' | 'added-desc' | 'minutes-asc';

export const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'progress', label: 'In progress' },
  { id: 'finished', label: 'Finished' },
  { id: 'archived', label: 'Archived' },
  { id: 'liked', label: 'Liked' },
  { id: 'removed', label: 'Removed' },
];

export const SORTS: { id: Sort; label: string }[] = [
  { id: 'saved-desc', label: 'Recently saved' },
  { id: 'saved-asc', label: 'Oldest saved' },
  { id: 'added-desc', label: 'Recently added to ROUTINE' },
  { id: 'minutes-asc', label: 'Shortest read' },
];

/** Every article removed from Instapaper is out of every view but Removed. */
export function matchesFilter(a: Article, f: Filter, reading: ReadonlyMap<number, Reading>): boolean {
  if (f === 'removed') return a.removedAt !== null;
  if (a.removedAt !== null) return false;
  switch (f) {
    case 'all': return true;
    case 'archived': return a.archived;
    case 'liked': return a.liked;
    default: return statusOf(a.id, reading) === f;
  }
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Every word of the query, in the title, source, byline, description or tags (accents and case aside). */
export function matchesQuery(a: Article, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold([titleOf(a), a.domain, authorOf(a), descriptionOf(a), ...a.tags].filter(Boolean).join(' '));
  return words.every(w => hay.includes(w));
}

export function sortArticles(list: Article[], sort: Sort): Article[] {
  const by = (f: (a: Article) => number | null, dir: 1 | -1) => (a: Article, b: Article) => {
    const x = f(a), y = f(b);
    if (x === y) return (b.savedAt ?? 0) - (a.savedAt ?? 0) || b.id - a.id;
    if (x === null) return 1;
    if (y === null) return -1;
    return (x - y) * dir;
  };
  const order = {
    'saved-desc': by(a => a.savedAt, -1),
    'saved-asc': by(a => a.savedAt, 1),
    'added-desc': by(a => a.firstSeenAt, -1),
    'minutes-asc': by(a => minutesOf(a.words), 1),
  }[sort];
  return [...list].sort(order);
}

/** What the background fetch takes next: unread, never fetched and not waiting to be asked again, newest first. */
export function toFetch(list: Article[], now: number): Article[] {
  return sortArticles(list.filter(a => a.content === 'none' && !a.archived && a.removedAt === null && a.url && !((a.retryAt ?? 0) > now)), 'saved-desc');
}
