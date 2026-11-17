// The Articles library for the screen: this device's copy at once, then a sync with Instapaper, then the
// bodies of unread articles fetched in the background, one every two seconds, while Intake is open.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Article } from './articles';
import { fetchArticle, fetchChanges, IntakeError, type IntakeErrorCode } from './api';
import { loadArticles, loadMeta, saveArticles, saveBody, saveMeta } from './cache';
import { fetchOne, syncLibrary, toFetch } from './sync';

const PACE_MS = 2000;
const SLOW_DOWN_MS = 60_000;

export interface LibraryStatus {
  phase: 'loading' | 'syncing' | 'ready' | 'error';
  error: { code: IntakeErrorCode; message: string } | null;
  lastSyncAt: number | null;
  /** Bodies still to fetch in the background, while it runs. */
  fetching: { done: number; total: number } | null;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function useArticles() {
  const [articles, setArticles] = useState<ReadonlyMap<number, Article> | null>(null);
  const [status, setStatus] = useState<LibraryStatus>({ phase: 'loading', error: null, lastSyncAt: null, fetching: null });
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
    try {
      const total = toFetch([...current.current.values()]).length;
      let done = 0;
      while (alive.current) {
        const next = toFetch([...current.current.values()])[0];
        if (!next) break;
        setStatus(s => ({ ...s, fetching: { done, total } }));
        const out = await fetchOne(next, { fetchArticle, saveBody, saveArticles, now: Date.now });
        if ('stop' in out) {
          if (out.stop.code !== 'rate-limited') break;
          await sleep((out.stop.retryAfter ?? 0) * 1000 || SLOW_DOWN_MS);
          continue;
        }
        apply([out.article]);
        done++;
        await sleep(PACE_MS);
      }
    } finally {
      fetching.current = false;
      if (alive.current) setStatus(s => ({ ...s, fetching: null }));
    }
  }, [apply]);

  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setStatus(s => ({ ...s, phase: 'syncing', error: null }));
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

  return { articles, status, refresh };
}
