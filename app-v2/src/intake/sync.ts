// Bringing the device's copy up to date with Instapaper, and fetching bodies in the background.
// - A sync asks for what changed since the last one began (a minute early: applying a change twice
//   changes nothing). The first asks from the beginning. A sync cut short (offline, a large account)
//   goes on from where it stopped, its start time kept.
// - Bodies come one at a time, every unread article once, newest first: its length (the reading time)
//   and what the list lacked, and the article readable offline. A slow-down from Instapaper pauses the
//   fetch; an article Instapaper can't extract is marked so and not asked for again.
import { mergeSync, withParse, toFetch, type Article } from './articles';
import { IntakeError, type SyncPage } from './api';
import type { ParsedArticle } from './types';
import type { Body, SyncMeta } from './cache';

export interface SyncDeps {
  fetchChanges: (since: number, offset: number) => Promise<SyncPage>;
  loadMeta: () => Promise<SyncMeta>;
  saveMeta: (meta: SyncMeta) => Promise<void>;
  saveArticles: (list: Article[]) => Promise<void>;
  now: () => number;
}

/** Applies every change since the last sync; returns the articles that changed. Throws IntakeError. */
export async function syncLibrary(current: ReadonlyMap<number, Article>, deps: SyncDeps): Promise<Article[]> {
  const meta = await deps.loadMeta();
  const startedAt = meta.pending?.startedAt ?? Math.floor(deps.now() / 1000);
  const since = meta.pending?.since ?? meta.since ?? 1;
  let offset = meta.pending?.offset ?? 0;
  const all = new Map(current);
  const changed = new Map<number, Article>();
  for (;;) {
    const page = await deps.fetchChanges(since, offset);
    const merged = mergeSync(all, page.bookmarks, page.deletedIds, deps.now());
    for (const a of merged) { all.set(a.id, a); changed.set(a.id, a); }
    await deps.saveArticles(merged);
    if (page.complete || page.nextOffset === null) break;
    offset = page.nextOffset;
    await deps.saveMeta({ ...meta, pending: { since, offset, startedAt } });
  }
  await deps.saveMeta({ since: Math.max(1, startedAt - 60), pending: null, lastSyncAt: deps.now() });
  return [...changed.values()];
}

export interface FetchDeps {
  fetchArticle: (id: number) => Promise<ParsedArticle>;
  saveBody: (body: Body) => Promise<void>;
  saveArticles: (list: Article[]) => Promise<void>;
  now: () => number;
}

export type FetchOutcome = { article: Article } | { stop: IntakeError };

/** Fetches one article's body and records what it says. A stop means: don't go on for now. */
export async function fetchOne(a: Article, deps: FetchDeps): Promise<FetchOutcome> {
  try {
    const p = await deps.fetchArticle(a.id);
    if (p.html) await deps.saveBody({ id: a.id, html: p.html, images: p.images, words: p.words, paywalled: p.paywalled, direction: p.direction, fetchedAt: deps.now() });
    const next = withParse(a, p);
    await deps.saveArticles([next]);
    return { article: next };
  } catch (e) {
    const err = e instanceof IntakeError ? e : new IntakeError('upstream', String(e));
    if (err.code === 'unavailable' || err.code === 'not-found') {
      const next: Article = { ...a, content: 'unavailable' };
      await deps.saveArticles([next]);
      return { article: next };
    }
    return { stop: err };
  }
}

export { toFetch };
