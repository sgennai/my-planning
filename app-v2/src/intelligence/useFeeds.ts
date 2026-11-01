// The three feeds as this device knows them: the copy it already holds, at
// once, then whatever a refresh from Drive brings. It refreshes on opening the
// section, on the refresh button, and on coming back to the app after a while
// (a morning's edition should be there without a tap).
import { useCallback, useEffect, useRef, useState } from 'react';
import { cachedFeed, refreshFeed, type FeedState } from './library';
import { FEEDS, type FeedId } from './feeds';

const STALE_MS = 10 * 60 * 1000;

export interface FeedsView {
  states: Partial<Record<FeedId, FeedState>>;
  /** Feeds that have been refreshed from Drive since the section opened. */
  refreshed: Partial<Record<FeedId, true>>;
  refreshing: boolean;
  refresh: () => void;
}

/** This device's storage failing is a feed that cannot load, not a crash. */
const failed = (feedId: FeedId, e: unknown): FeedState => ({
  feedId, editions: [], missing: [], status: 'error', message: (e as Error).message, refreshedAt: null,
});

export function useFeeds(): FeedsView {
  const [states, setStates] = useState<FeedsView['states']>({});
  const [refreshed, setRefreshed] = useState<FeedsView['refreshed']>({});
  const [refreshing, setRefreshing] = useState(false);
  const running = useRef(false);
  const lastRefresh = useRef(0);

  const refresh = useCallback(() => {
    if (running.current) return;
    running.current = true;
    lastRefresh.current = Date.now();
    setRefreshing(true);
    Promise.all(FEEDS.map(async ({ id }) => {
      const state = await refreshFeed(id).catch(e => failed(id, e));
      setStates(prev => ({ ...prev, [id]: state }));
      setRefreshed(prev => ({ ...prev, [id]: true }));
    })).finally(() => {
      running.current = false;
      setRefreshing(false);
    });
  }, []);

  useEffect(() => {
    for (const { id } of FEEDS) {
      cachedFeed(id)
        .catch(e => failed(id, e))
        // A refresh that finished first has the newer word.
        .then(state => setStates(prev => (prev[id] ? prev : { ...prev, [id]: state })));
    }
    const start = setTimeout(refresh, 0);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh.current > STALE_MS) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(start); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);

  return { states, refreshed, refreshing, refresh };
}
