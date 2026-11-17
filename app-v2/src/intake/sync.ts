// Bringing the device's copy up to date with Instapaper, and fetching bodies in the background.
// - A sync asks for what changed since the last one began (a minute early: applying a change twice
//   changes nothing). The first asks from the beginning. A sync cut short (offline, a large account)
//   goes on from where it stopped, its start time kept.
// - Bodies come one at a time, every unread article once, newest first: its length (the reading time)
//   and what the list lacked, and the article readable offline. A slow-down from Instapaper pauses the
//   fetch; an article Instapaper can't extract is marked so and not asked for again. One that doesn't come
//   (Instapaper too slow on it, or failing) is passed over and asked for again later, so it never holds up
//   the rest; several in a row mean Instapaper itself isn't answering, and the fetch stops until next time.
import { mergeSync, withParse, toFetch, type Article } from './articles';
import { IntakeError, type IntakeErrorCode, type SyncPage } from './api';
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

/** After a body didn't come: asked again in 10 minutes, then an hour, then 6 hours; a fourth time, the
 *  article is left to its original. */
export const RETRY_AFTER_MS = [10 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
/** The failures that belong to one article (or may): the others are Instapaper's, or the device's. */
const PASS_OVER: IntakeErrorCode[] = ['unreachable', 'upstream'];

/** `failed`: it didn't come, and is set aside until `retryAt`. A stop means: don't go on for now. */
export type FetchOutcome = { article: Article; failed?: boolean } | { stop: IntakeError };

/** Fetches one article's body and records what it says. */
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
    if (PASS_OVER.includes(err.code)) {
      const tries = (a.tries ?? 0) + 1;
      const next: Article = tries > RETRY_AFTER_MS.length
        ? { ...a, content: 'unavailable', tries, retryAt: null }
        : { ...a, tries, retryAt: deps.now() + RETRY_AFTER_MS[tries - 1] };
      await deps.saveArticles([next]);
      return { article: next, failed: true };
    }
    return { stop: err };
  }
}

export const PACE_MS = 2000;
export const SLOW_DOWN_MS = 60_000;
/** Articles in a row that don't come before the fetch takes it that Instapaper isn't answering. */
export const IN_A_ROW = 3;

export interface BodiesDeps extends FetchDeps {
  /** The device's articles as they are now. */
  list: () => Article[];
  /** Whether to go on (Intake still open). */
  alive: () => boolean;
  onArticle: (a: Article) => void;
  onProgress: (p: { done: number; total: number }) => void;
  sleep: (ms: number) => Promise<void>;
}

/** How a background fetch ended: what stopped it (nothing when it went through), and how many didn't come. */
export interface BodiesEnd { stopped: IntakeError | null; failed: number }

/** Fetches every body still to fetch, one every PACE_MS, newest first. */
export async function fetchBodies(deps: BodiesDeps): Promise<BodiesEnd> {
  const total = toFetch(deps.list(), deps.now()).length;
  let done = 0, failed = 0, inARow = 0;
  while (deps.alive()) {
    const next = toFetch(deps.list(), deps.now())[0];
    if (!next) break;
    deps.onProgress({ done, total });
    const out = await fetchOne(next, deps);
    if ('stop' in out) {
      if (out.stop.code !== 'rate-limited') return { stopped: out.stop, failed };
      await deps.sleep((out.stop.retryAfter ?? 0) * 1000 || SLOW_DOWN_MS);
      continue;
    }
    deps.onArticle(out.article);
    done++;
    if (out.failed) {
      failed++;
      if (++inARow >= IN_A_ROW) return { stopped: new IntakeError('unreachable', "Instapaper isn't answering."), failed };
    } else inARow = 0;
    await deps.sleep(PACE_MS);
  }
  return { stopped: null, failed };
}

export { toFetch };
