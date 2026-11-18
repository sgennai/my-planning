// The Articles library for the screen: this device's copy at once, then a sync with Instapaper, then the
// bodies of unread articles fetched in the background, one every two seconds, while Intake is open.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Article } from './articles';
import { fetchArticleNow, fetchArticleQueued, fetchChanges, IntakeError, type IntakeErrorCode } from './api';
import { loadArticles, loadMeta, saveArticles, saveBody, saveMeta } from './cache';
import { fetchBodies as fetchAll, fetchOne, syncLibrary, type BodiesEnd, type FetchOutcome } from './sync';

export interface LibraryStatus {
  phase: 'loading' | 'syncing' | 'ready' | 'error';
  error: { code: IntakeErrorCode; message: string } | null;
  lastSyncAt: number | null;
  /** Bodies still to fetch in the background, while it runs. */
  fetching: { done: number; total: number } | null;
  /** How the last background fetch ended, when it is worth saying: until the next sync. */
  fetchEnd: BodiesEnd | null;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export function useArticles() {
  const [articles, setArticles] = useState<ReadonlyMap<number, Article> | null>(null);
  const [status, setStatus] = useState<LibraryStatus>({ phase: 'loading', error: null, lastSyncAt: null, fetching: null, fetchEnd: null });
  const current = useRef<Map<number, Article>>(new Map());
  const alive = useRef(true);
  const running = useRef(false);
  const fetching = useRef(false);

  const apply = useCallback((list: Article[]) => {
    if (!list.length) return;
    const next = new Map(current.current);
    for (const a of list) next.set(a.id, a);
    current.current = next;
    if (alive.current) setArticles(next);
  }, []);

  const fetchBodies = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    let end: BodiesEnd | null = null;
    try {
      end = await fetchAll({
        fetchArticle: fetchArticleQueued, saveBody, saveArticles, now: Date.now, sleep,
        list: () => [...current.current.values()],
        alive: () => alive.current,
        onArticle: a => apply([a]),
        onProgress: p => setStatus(s => ({ ...s, fetching: p })),
      });
    } catch (e) {
      end = { stopped: e instanceof IntakeError ? e : new IntakeError('upstream', String(e)), failed: 0 };
    } finally {
      fetching.current = false;
      const said = end && (end.stopped || end.failed) ? end : null;
      if (alive.current) setStatus(s => ({ ...s, fetching: null, fetchEnd: said }));
    }
  }, [apply]);

  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setStatus(s => ({ ...s, phase: 'syncing', error: null, fetchEnd: null }));
    try {
      apply(await syncLibrary(current.current, { fetchChanges, loadMeta, saveMeta, saveArticles, now: Date.now }));
      if (alive.current) setStatus(s => ({ ...s, phase: 'ready', error: null, lastSyncAt: Date.now() }));
      void fetchBodies();
    } catch (e) {
      const err = e instanceof IntakeError ? e : new IntakeError('upstream', String(e));
      if (alive.current) setStatus(s => ({ ...s, phase: 'error', error: { code: err.code, message: err.message } }));
    } finally {
      running.current = false;
    }
  }, [apply, fetchBodies]);

  useEffect(() => {
    alive.current = true;
    (async () => {
      const [list, meta] = await Promise.all([loadArticles().catch(() => []), loadMeta().catch(() => null)]);
      if (!alive.current) return;
      current.current = new Map(list.map(a => [a.id, a]));
      setArticles(current.current);
      setStatus(s => ({ ...s, lastSyncAt: meta?.lastSyncAt ?? null }));
      void refresh();
    })();
    return () => { alive.current = false; };
  }, [refresh]);

  /** An article's body now, for the reader (opening one not yet here, or Try again on one set aside). */
  const fetchNow = useCallback(async (a: Article): Promise<FetchOutcome> => {
    const out = await fetchOne({ ...a, content: 'none', tries: 0, retryAt: null }, { fetchArticle: fetchArticleNow, saveBody, saveArticles, now: Date.now });
    if ('article' in out) {
      // Asked for by you: a failure here is said, not counted as a background try.
      const next = out.failed ? { ...a } : out.article;
      if (out.failed) await saveArticles([next]);
      apply([next]);
      return out.failed ? { stop: new IntakeError('unreachable', "Instapaper didn't return this article in time.") } : { article: next };
    }
    return out;
  }, [apply]);

  /** A change the reader made to an article on this device (Keep offline). */
  const update = useCallback(async (a: Article) => {
    await saveArticles([a]);
    apply([a]);
  }, [apply]);

  return { articles, status, refresh, fetchNow, update };
}
