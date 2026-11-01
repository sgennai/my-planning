// The Intelligence section: the ChatGPT briefings, read from private Google
// Docs in Drive through /api/intel, newest first, at reading size.
//
// iPad landscape and desktop: the editions on the left, the reader beside
// them. iPad portrait: the reader takes the width and "Editions" slides the
// list in. Phone: one pane at a time, the list and then the edition.
import '../styles/intelligence.css';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { feedById, type FeedId } from './feeds';
import { useFeeds } from './useFeeds';
import { EditionReader, EditionActions } from './EditionReader';
import type { Edition } from './parse';
import type { FeedState } from './library';
import { dayNameShort, formatDayCompact } from '../routine/dates';
import { IconRefresh, IconList, IconX, IconChevronLeft } from '../ui/icons';

/** The tabs, in the brief's order. */
const TABS: FeedId[] = ['enterprise-ai-sales-brief', 'enterprise-ai-challenge', 'customer-engagement-brief'];
const DEFAULT_FEED: FeedId = 'enterprise-ai-challenge';
const PHONE = '(orientation: portrait) and (max-width: 600px), (orientation: landscape) and (max-height: 520px)';
const PORTRAIT = '(orientation: portrait)';
const FEED_KEY = 'my-planning-intel-feed';
const editionKey = (feedId: FeedId) => `my-planning-intel-edition:${feedId}`;

function useMatches(query: string) {
  const subscribe = useCallback((onChange: () => void) => {
    const m = window.matchMedia(query);
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

// Each device remembers the last feed and edition it opened, as a reader app does.
function recall(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function remember(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* private browsing: not remembered */ }
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** A line under the header when the copy shown is not fresh from Drive. */
function statusOf(state: FeedState | undefined): { text: string; alert: boolean } | null {
  if (!state?.editions.length) return null; // the empty reader says it instead
  switch (state.status) {
    case 'offline': return { text: 'Offline. Showing the copy on this device.', alert: false };
    case 'not-configured': return { text: "Google Drive isn't connected. Showing the copy on this device.", alert: true };
    case 'error': return { text: `Couldn't refresh from Google Drive: ${state.message}`, alert: true };
  }
  if (state.missing.length) {
    return { text: `${plural(state.missing.length, 'edition')} in Drive couldn't be loaded.`, alert: true };
  }
  return null;
}

function Empty({ state, loading, onRetry }: { state: FeedState | undefined; loading: boolean; onRetry: () => void }) {
  const feed = feedById(state?.feedId ?? DEFAULT_FEED);
  const retry = <button type="button" className="ds-btn" onClick={onRetry}><IconRefresh />Try again</button>;
  let body: ReactNode;
  if (loading) body = <p>Loading editions…</p>;
  else if (state?.status === 'not-configured') {
    body = <><h2>Google Drive isn't connected</h2><p>The briefings are read from Google Drive with a key kept on the server. Nothing can show until it is in place.</p></>;
  } else if (state?.status === 'offline') {
    body = <><h2>You're offline</h2><p>Editions show here once this device has fetched them from Google Drive.</p>{retry}</>;
  } else if (state?.status === 'error') {
    body = <><h2>Couldn't reach Google Drive</h2><p>{state.message}</p>{retry}</>;
  } else if (state?.missing.length) {
    body = <><h2>Couldn't load the editions</h2><p>{plural(state.missing.length, 'edition')} in Drive couldn't be read.</p>{retry}</>;
  } else {
    body = <><h2>No editions yet</h2><p>{feed?.name} editions show here once its scheduled task saves one to Google Drive.</p></>;
  }
  return <div className="intel-empty" role="status">{body}</div>;
}

export function IntelligenceScreen() {
  const { states, refreshed, refreshing, refresh } = useFeeds();
  const phone = useMatches(PHONE);
  const portrait = useMatches(PORTRAIT);
  const mode = phone ? 'single' : portrait ? 'drawer' : 'rail';

  const [feedId, setFeedId] = useState<FeedId>(() => {
    const saved = recall(FEED_KEY) as FeedId | null;
    return saved && TABS.includes(saved) ? saved : DEFAULT_FEED;
  });
  const [chosen, setChosen] = useState<Partial<Record<FeedId, string>>>(() => {
    const out: Partial<Record<FeedId, string>> = {};
    for (const id of TABS) {
      const saved = recall(editionKey(id));
      if (saved) out[id] = saved;
    }
    return out;
  });
  const [drawer, setDrawer] = useState(false);
  const [pane, setPane] = useState<'list' | 'reader'>('list');
  const [note, setNote] = useState<{ text: string; at: number } | null>(null);
  const readerRef = useRef<HTMLDivElement | null>(null);

  const feed = feedById(feedId)!;
  const state = states[feedId];
  const editions = state?.editions ?? [];
  const edition = editions.find(e => e.driveFileId === chosen[feedId]) ?? editions[0] ?? null;
  const loading = !editions.length && !refreshed[feedId] && state?.status !== 'not-configured';
  const drawerOpen = drawer && mode === 'drawer';
  const status = statusOf(state);

  // A new edition opens at its top.
  const editionId = edition?.driveFileId;
  useEffect(() => { readerRef.current?.scrollTo({ top: 0 }); }, [editionId]);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 1800);
    return () => clearTimeout(t);
  }, [note]);
  const onNote = useCallback((text: string) => setNote({ text, at: Date.now() }), []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const switchFeed = (id: FeedId) => { setFeedId(id); remember(FEED_KEY, id); };
  const choose = (e: Edition) => {
    setChosen(prev => ({ ...prev, [feedId]: e.driveFileId }));
    remember(editionKey(feedId), e.driveFileId);
    setDrawer(false);
    setPane('reader');
  };

  const tabs = (
    <div className="ds-segment intel-tabs" role="tablist" aria-label="Briefings">
      {TABS.map(id => (
        <button key={id} type="button" role="tab" aria-selected={id === feedId} onClick={() => switchFeed(id)}>
          {feedById(id)!.label}
        </button>
      ))}
    </div>
  );
  const refreshButton = (
    <button
      type="button"
      className={`ds-icon-btn intel-refresh${refreshing ? ' is-busy' : ''}`}
      onClick={refresh}
      aria-label={refreshing ? 'Refreshing from Google Drive' : 'Refresh from Google Drive'}
      aria-busy={refreshing}
    ><IconRefresh /></button>
  );
  const statusLine = status && (
    <div className={`intel-status${status.alert ? ' is-alert' : ''}`} role="status">
      <span>{status.text}</span>
      <button type="button" onClick={refresh}>Try again</button>
    </div>
  );
  const noteLine = note && <div key={note.at} className="intel-note" role="status">{note.text}</div>;
  const empty = <Empty state={state} loading={loading} onRetry={refresh} />;

  const list = (head: ReactNode) => (
    <>
      <div className="intel-rail-head">
        <h2>{mode === 'single' ? feed.label : 'Editions'}</h2>
        {editions.length > 0 && <span className="intel-count">{editions.length}</span>}
        {head}
      </div>
      {editions.length > 0 && (
        <ol className="intel-eds">
          {editions.map(e => (
            <li key={e.driveFileId}>
              <button
                type="button"
                className="intel-ed"
                aria-current={mode !== 'single' && e === edition ? 'true' : undefined}
                onClick={() => choose(e)}
              >
                <span className="intel-ed-date">
                  {dayNameShort(e.editionDate)} {formatDayCompact(e.editionDate)}{e.time && ` · ${e.time}`}
                </span>
                <span className="intel-ed-title">{e.title}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </>
  );

  if (mode === 'single') {
    if (pane === 'reader' && edition) {
      return (
        <div className="intel intel--single">
          <div className="intel-bar">
            <button type="button" className="ds-icon-btn" onClick={() => setPane('list')} aria-label="Back to editions">
              <IconChevronLeft />
            </button>
            <b>{feed.label}</b>
            <span className="intel-grow" />
            <EditionActions edition={edition} />
          </div>
          <div className="intel-reader" ref={readerRef}>
            <EditionReader edition={edition} scroller={readerRef} onNote={onNote} heroActions={false} />
          </div>
          {noteLine}
        </div>
      );
    }
    return (
      <div className="intel intel--single">
        <div className="intel-head">{tabs}</div>
        {statusLine}
        <div className="intel-list">
          {list(<>
            <span className="intel-grow" />
            {refreshButton}
          </>)}
          {!editions.length && empty}
        </div>
        {noteLine}
      </div>
    );
  }

  return (
    <div className={`intel intel--${mode}${drawerOpen ? ' is-drawer-open' : ''}`}>
      <div className="intel-head">
        {mode === 'drawer' && (
          <button type="button" className="ds-btn intel-editions" onClick={() => setDrawer(true)} aria-expanded={drawerOpen}>
            <IconList />Editions
          </button>
        )}
        {tabs}
        <span className="intel-grow" />
        {refreshButton}
      </div>
      {statusLine}
      <div className="intel-body">
        {mode === 'rail' && <aside className="intel-rail" aria-label="Editions">{list(null)}</aside>}
        <div className="intel-reader" ref={readerRef}>
          {edition ? <EditionReader edition={edition} scroller={readerRef} onNote={onNote} /> : empty}
        </div>
      </div>
      {mode === 'drawer' && (
        <>
          <div className="intel-scrim" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="intel-drawer" aria-label="Editions" inert={!drawerOpen}>
            {list(<>
              <span className="intel-grow" />
              <button type="button" className="ds-icon-btn" onClick={() => setDrawer(false)} aria-label="Close editions"><IconX /></button>
            </>)}
          </aside>
        </>
      )}
      {noteLine}
    </div>
  );
}
