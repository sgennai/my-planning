// The Intelligence section: the ChatGPT briefings, read from private Google
// Docs in Drive through /api/intel, newest first, at reading size.
//
// Views: one per feed, Today (the Reading Queue, INT-55, `TodayView`: the
// newest of each feed, one previewed beside them) and Takeaways (the
// executive notebook and its meeting kit, INT-56, `SavedView`), under
// one top navigation (INT-54, `IntelligenceNav`): the feeds' folder tabs on
// the left, Today and Takeaways apart on the right, the selected tab running
// into what it opens. The three feeds are executive memos (INT-50, `MemoArticle`; INT-51,
// `SalesMemo`; INT-52, `EngagementMemo`) in one workspace (INT-53,
// `MemoWorkspace`): a reading bar across it, the paper index of the feed's
// editions by month beside the memo, both scrolling on their own, the index
// hidden or shown from the bar (one choice for the three feeds, kept on the
// device); on a phone the index takes the whole width when shown, and
// choosing an edition goes back to the memo. A feed without a memo would
// read as a brief: iPad landscape and desktop show the editions on the left
// and the reader beside them; iPad portrait slides the list in from
// "Editions"; a phone shows one pane at a time.
//
// The documents stay Google's (cached per device by `library.ts`); what you
// do with them (how far you read, what you keep) is yours and syncs, in
// `progressLog` and `content`.
import '../styles/intelligence.css';
import '../styles/memo.css';
import '../styles/today.css';
import '../styles/takeaways.css';
import '../styles/intel-jour-et-verre.css';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { FEEDS, feedById, type FeedId } from './feeds';
import { useFeeds } from './useFeeds';
import { useEdgeFade } from './useEdgeFade';
import { useModalFocus } from './useModalFocus';
import { useTextScale } from './useTextScale';
import { useReadingAnchor } from './useReadingAnchor';
import { topicIndex, relatedTo } from './related';
import { EditionReader, EditionTools } from './EditionReader';
import { MemoIndex, MemoReadbar } from './MemoWorkspace';
import { IntelligenceNav } from './IntelligenceNav';
import { memoBrand, shortDate } from './memo';
import { TodayView } from './TodayView';
import { FeedStatus } from './FeedStatus';
import { conformanceOf, labelOf, NEEDS_A_LOOK, type FeedConformance } from './conformance';
import { runsOf, dayLabel, describeSchedule, NEEDS_ATTENTION, type Run } from './schedule';
import { useClock } from '../ui/useClock';
import { SavedView } from './SavedView';
import { SearchView } from './SearchView';
import { ReviewView } from './ReviewView';
import { reviewIndex, dueOf, dueOn, withRating, withReviewing, withoutReview, SESSION_SIZE } from './review';
import { NO_FILTERS, type SearchFilters } from './search';
import type { Edition } from './parse';
import type { FeedState } from './library';
import { readingIndex, readingState, withPosition, withReadMark, isRead, isArchive, countsAsUnread, type Place } from './reading';
import {
  savedOf, saveInsight, removeInsight, updateInsight, findSaved, nameOf, type SaveInput, type SavedInsight,
} from './saved';
import { kitOf, withRole, withMembership, withKitLabel, withoutKit, type Role } from './kit';
import { wordsOf, NOTEBOOK_START, type NotebookState } from './notebook';
import { dayNameShort, formatDayCompact, dayKeyOf, addDaysKey } from '../routine/dates';
import { IconRefresh, IconList, IconX, IconChevronLeft, IconBookmark, IconPulse, IconSearch } from '../ui/icons';

// "Jour & verre", the Phase 1 pilot (INT-59): the three memo views in the
// theme of `styles/intel-jour-et-verre.css`. False, and they look as before.
const JOUR_ET_VERRE = true;

type View = 'today' | FeedId | 'saved' | 'search' | 'review';

/** The feeds' tabs, in the brief's order, then Today and Takeaways. */
const FEED_TABS: FeedId[] = ['enterprise-ai-sales-brief', 'enterprise-ai-challenge', 'customer-engagement-brief'];
const MORE_TABS: View[] = ['today', 'saved'];
const VIEWS: View[] = [...FEED_TABS, ...MORE_TABS];
const PHONE = '(orientation: portrait) and (max-width: 600px), (orientation: landscape) and (max-height: 520px)';
const PORTRAIT = '(orientation: portrait)';
const VIEW_KEY = 'my-planning-intel-view';
const editionKey = (feedId: FeedId) => `my-planning-intel-edition:${feedId}`;
/** Whether the memos' edition index is hidden, for the three feeds (iPad and wider). */
const INDEX_KEY = 'my-planning-intel-index';
/** A position is written once scrolling has rested this long. */
const POSITION_REST_MS = 1200;

const isFeed = (v: View): v is FeedId => (FEED_TABS as View[]).includes(v);
const tabId = (v: View) => `intel-tab-${v}`;
const PANEL = 'intel-panel';

const tabLabel = (v: View) => (v === 'today' ? 'Today' : v === 'saved' ? 'Takeaways' : feedById(v)!.label);

function useMatches(query: string) {
  const subscribe = useCallback((onChange: () => void) => {
    const m = window.matchMedia(query);
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

// Each device remembers the last view and the edition last opened in each feed.
function recall(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function remember(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* private browsing: not remembered */ }
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

interface Status { text: string; alert: boolean; action: 'retry' | 'details' | null }

/**
 * A line under the header: the copy shown is not fresh from Drive, or
 * something in the feed wants a look (with the details a tap away).
 */
function statusOf(state: FeedState | undefined, conformance: FeedConformance | undefined, runs: Run[] = []): Status | null {
  if (!state?.editions.length) return null; // the empty reader says it instead
  switch (state.status) {
    case 'offline': return { text: 'Offline. Showing the copy on this device.', alert: false, action: 'retry' };
    case 'not-configured': return { text: "Google Drive isn't connected. Showing the copy on this device.", alert: true, action: 'retry' };
    case 'error': return { text: `Couldn't refresh from Google Drive: ${state.message}`, alert: true, action: 'retry' };
  }
  if (state.pending) {
    const all = state.editions.length + state.missing.length + state.pending;
    return { text: `Downloading the archive: ${state.editions.length} of ${all} editions on this device.`, alert: false, action: null };
  }
  if (state.missing.length) {
    return { text: `${plural(state.missing.length, 'edition')} in Drive couldn't be loaded.`, alert: true, action: 'details' };
  }
  const off = runs.find(r => NEEDS_ATTENTION.includes(r.state));
  if (off) {
    const schedule = feedById(state.feedId)!.schedule;
    const text = off.state === 'late' ? `Today's edition hasn't arrived (${describeSchedule(schedule).toLowerCase()}).`
      : off.state === 'missing' ? `The edition of ${dayLabel(off.day)} is missing.`
        : `The edition of ${dayLabel(off.day)} was published incomplete.`;
    return { text, alert: true, action: 'details' };
  }
  const problems = (conformance?.problems ?? []).filter(p => NEEDS_A_LOOK.includes(p.flag.kind));
  if (problems.length) {
    const docs = new Set(problems.map(p => p.edition.driveFileId)).size;
    return { text: `${plural(docs, 'document')} in this feed ${docs === 1 ? 'needs' : 'need'} a look.`, alert: true, action: 'details' };
  }
  if (conformance?.problems.some(p => p.flag.kind === 'writing')) {
    return { text: 'An edition is still being written. It is checked again on each refresh.', alert: false, action: 'details' };
  }
  return null;
}

function Empty({ state, loading, onRetry }: { state: FeedState | undefined; loading: boolean; onRetry: () => void }) {
  const feed = state && feedById(state.feedId);
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

interface IntelData {
  progressLog?: unknown[];
  content?: unknown[];
}

/** A takeaway removed takes its review and its place in the meeting kit with it. */
const unsave = (d: IntelData & Record<string, unknown>, id: string) => ({
  ...d,
  content: withoutKit(removeInsight(d.content, id), id),
  progressLog: withoutReview(d.progressLog, id),
  lastModified: new Date().toISOString(),
});

interface Props {
  data: IntelData | null;
  onPersist: (mutator: (current: IntelData & Record<string, unknown>) => IntelData & Record<string, unknown>) => void;
}

export function IntelligenceScreen({ data, onPersist }: Props) {
  const { states, refreshed, refreshing, refresh } = useFeeds();
  const phone = useMatches(PHONE);
  const portrait = useMatches(PORTRAIT);
  const mode = phone ? 'single' : portrait ? 'drawer' : 'rail';

  const [view, setView] = useState<View>(() => {
    const saved = recall(VIEW_KEY) as View | null;
    return saved && (VIEWS.includes(saved) || saved === 'search') ? saved : 'today';
  });
  // The edition last opened in each feed on this device, as the section opened…
  const [remembered] = useState<Partial<Record<FeedId, string>>>(() => {
    const out: Partial<Record<FeedId, string>> = {};
    for (const id of FEED_TABS) {
      const saved = recall(editionKey(id));
      if (saved) out[id] = saved;
    }
    return out;
  });
  // …and the ones chosen since.
  const [chosen, setChosen] = useState<Partial<Record<FeedId, string>>>({});
  // Today's queue: the feed previewed (first, the AI Challenge) and whether the backlog is open, as left.
  const [todayFeed, setTodayFeed] = useState<FeedId>(FEEDS[0].id);
  const [backlogOpen, setBacklogOpen] = useState(false);
  // Takeaways' notebook: the item chosen, its view, the list's search and filters, as left.
  const [notebook, setNotebook] = useState<NotebookState>(NOTEBOOK_START);
  const onNotebook = useCallback((patch: Partial<NotebookState>) => setNotebook(n => ({ ...n, ...patch })), []);
  // Where an edition opened from Today or Takeaways should start.
  const [jump, setJump] = useState<{ driveFileId: string; sectionId: string | null } | null>(null);
  const [drawer, setDrawer] = useState(false);
  // The memos' edition index: shown or hidden beside the memo, the same in
  // every feed and kept on the device; on a phone, shown only when asked for.
  const [indexShown, setIndexShown] = useState(() => recall(INDEX_KEY) !== 'hidden');
  const [phoneIndex, setPhoneIndex] = useState(false);
  const [pane, setPane] = useState<'list' | 'reader'>('list');
  const [note, setNote] = useState<{ text: string; at: number } | null>(null);
  const readerRef = useRef<HTMLDivElement | null>(null);
  const [tabsRef, tabsFade] = useEdgeFade<HTMLDivElement>(view);

  const reading = useMemo(() => readingIndex(data?.progressLog), [data?.progressLog]);
  // What was unread when the section opened: the edition a feed opens on must
  // not change under you as you read.
  const [readingAtOpen] = useState(() => readingIndex(data?.progressLog));
  const saved = useMemo(() => savedOf(data?.content), [data?.content]);
  const reviews = useMemo(() => reviewIndex(data?.progressLog), [data?.progressLog]);
  const kit = useMemo(() => kitOf(data?.content), [data?.content]);
  // What each feed's documents look like, judged again every minute so that
  // one still being written gets its grace period and no more.
  const now = useClock(60_000);
  const conformance = useMemo(() => {
    const out: Partial<Record<FeedId, FeedConformance>> = {};
    for (const f of FEEDS) out[f.id] = conformanceOf(states[f.id]?.editions ?? [], now);
    return out;
  }, [states, now]);
  const [statusSheet, setStatusSheet] = useState<FeedId[] | null>(null);
  // Kept here, so a search is still there after opening one of its results.
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>(NO_FILTERS);
  // Each feed's expected runs and what became of them (feed health).
  const health = useMemo(() => {
    const out: Partial<Record<FeedId, Run[]>> = {};
    for (const f of FEEDS) out[f.id] = runsOf(f.id, states[f.id]?.editions ?? [], conformance[f.id]?.flags, now);
    return out;
  }, [states, conformance, now]);
  const savedFiles = useMemo(() => new Set(saved.map(s => s.driveFileId)), [saved]);
  // The topics a takeaway's edition lists, when the edition is on this device.
  const editionTopics = useMemo(
    () => new Map(FEEDS.flatMap(f => (states[f.id]?.editions ?? []).map(e => [e.driveFileId, e.topics] as const))),
    [states],
  );
  const topicsOf = useCallback((item: SavedInsight) => editionTopics.get(item.driveFileId) ?? [], [editionTopics]);
  // Every edition under its topics, for an edition's related ones.
  const topics = useMemo(() => topicIndex(FEEDS.flatMap(f => states[f.id]?.editions ?? [])), [states]);
  // Takeaways due for review today, and how many tomorrow.
  const today = dayKeyOf(new Date(now));
  const due = useMemo(() => dueOf(saved, reviews, today), [saved, reviews, today]);
  const dueTomorrow = useMemo(() => dueOn(saved, reviews, addDaysKey(today, 1)), [saved, reviews, today]);
  // A review in progress: its takeaways as it began, and where it was opened from.
  const [session, setSession] = useState<{ items: SavedInsight[]; from: View; key: number } | null>(null);

  const feedId = isFeed(view) ? view : null;
  const state = feedId ? states[feedId] : undefined;
  const editions = useMemo(() => state?.editions ?? [], [state]);

  // Which edition a feed opens on: the one chosen or read this session; else
  // the newest unread edition if it is newer than the one last opened (this
  // morning's); else the one last opened; else the newest.
  const edition = useMemo(() => {
    if (!feedId || !editions.length) return null;
    const pick = (id?: string) => (id ? editions.find(e => e.driveFileId === id) : undefined);
    const now = pick(chosen[feedId]);
    if (now) return now;
    const last = pick(remembered[feedId]);
    const unread = editions.find(e => !isArchive(e) && readingState(e, readingAtOpen) === 'new');
    if (unread && (!last || unread.sortKey > last.sortKey)) return unread;
    return last ?? editions[0];
  }, [feedId, editions, chosen, remembered, readingAtOpen]);
  const brand = memoBrand(feedId);
  const memo = !!brand;
  // The memo lists every related edition, a few at a time; the other readers the first few.
  const related = useMemo(() => (edition ? relatedTo(edition, topics, memo ? Infinity : undefined) : []), [edition, topics, memo]);
  // The memo's chevrons: the editions either side of this one, newest first as the feed keeps them.
  const adjacent = useMemo(() => {
    if (!memo || !edition) return undefined;
    const at = editions.indexOf(edition);
    return { older: editions[at + 1] ?? null, newer: at > 0 ? editions[at - 1] : null };
  }, [memo, edition, editions]);

  const loading = feedId ? !editions.length && !refreshed[feedId] && state?.status !== 'not-configured' : false;
  const drawerOpen = drawer && mode === 'drawer' && !!feedId && !memo;
  const shown = phone ? phoneIndex : indexShown;
  const status = feedId ? statusOf(state, conformance[feedId], health[feedId]) : null;
  const record = edition ? reading.get(edition.driveFileId) : undefined;
  // An edition opens where you are sent (a takeaway, a search result), else
  // at your place in it (INT-58), whether or not you read it to the end; a
  // record from before INT-58 knows only its section.
  const sent = !!edition && jump?.driveFileId === edition.driveFileId;
  const startAt = sent ? jump!.sectionId : null;
  const resume = sent || !record ? null : record.place ?? (record.section ? { section: record.section, within: 0 } : null);

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
  // A drawer takes focus as it opens, on the edition being read, and gives it back.
  const drawerRef = useRef<HTMLElement>(null);
  useModalFocus(drawerRef, drawerOpen, '[aria-current="true"]');

  // Showing or hiding the index. On a phone, where it covers the memo, the
  // focus goes to what is now in front: the edition being read in the index,
  // or the bar's toggle when the memo comes back.
  const toggleRef = useRef<HTMLButtonElement>(null);
  const indexRef = useRef<HTMLElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const focusNext = useRef<'index' | 'toggle' | null>(null);
  const toggleIndex = () => {
    if (phone) {
      focusNext.current = phoneIndex ? 'toggle' : 'index';
      setPhoneIndex(v => !v);
      return;
    }
    setIndexShown(v => { remember(INDEX_KEY, v ? 'hidden' : 'shown'); return !v; });
  };
  useEffect(() => {
    const next = focusNext.current;
    focusNext.current = null;
    if (next === 'toggle') toggleRef.current?.focus();
    if (next === 'index') {
      const index = indexRef.current;
      (index?.querySelector<HTMLElement>('[aria-current="page"]') ?? index?.querySelector<HTMLElement>('input'))?.focus({ preventScroll: true });
    }
  }, [shown, edition]);
  // Text at the size set on the iPad.
  const scale = useTextScale();
  // The reading place survives the iPad rotating and a new text size.
  useReadingAnchor(readerRef, `${view}:${edition?.driveFileId ?? ''}:${pane}`);
  const rootStyle = scale === 1 ? undefined : ({ '--intel-scale': scale } as CSSProperties);

  // ── Writes ──────────────────────────────────────────────────────────────
  const stamp = () => new Date().toISOString();

  // Scrolling reports often; the position is written when it rests, when the
  // edition changes, and when the section closes.
  const pending = useRef<{ edition: Edition; progress: number; section: string | null; place: Place } | null>(null);
  const restTimer = useRef(0);
  const flushPosition = useCallback(() => {
    window.clearTimeout(restTimer.current);
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    onPersist(d => {
      const log = d.progressLog || [];
      const next = withPosition(log, p.edition, p.progress, p.section, p.place);
      return next === log ? d : { ...d, progressLog: next, lastModified: stamp() };
    });
  }, [onPersist]);
  // An edition you act on is the one this feed shows until you pick another.
  const keep = useCallback((e: Edition) => {
    setChosen(prev => (prev[e.feedId] === e.driveFileId ? prev : { ...prev, [e.feedId]: e.driveFileId }));
    remember(editionKey(e.feedId), e.driveFileId);
  }, []);
  const onPosition = useCallback((progress: number, section: string | null, place: Place) => {
    if (!edition) return;
    keep(edition);
    if (pending.current && pending.current.edition !== edition) flushPosition();
    pending.current = { edition, progress, section, place };
    window.clearTimeout(restTimer.current);
    restTimer.current = window.setTimeout(flushPosition, POSITION_REST_MS);
  }, [edition, flushPosition, keep]);
  useEffect(() => flushPosition, [edition, flushPosition]);
  // A Home Screen app sent to the background may not run its timers again.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushPosition(); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [flushPosition]);
  // Today and Takeaways open at their top; an edition places itself.
  useEffect(() => { if (!isFeed(view)) readerRef.current?.scrollTo({ top: 0 }); }, [view]);

  // Read only when you say so (INT-57): the reader's read button and Today's
  // Mark read set the same mark, and the same again takes it back; where you
  // are in the edition stays as it was. From Today, which edition a feed
  // opens on stays as it was too.
  const markRead = (e: Edition) => {
    const read = !isRead(e, reading);
    onPersist(d => ({ ...d, progressLog: withReadMark(d.progressLog, e, read), lastModified: stamp() }));
    onNote(`${read ? 'Marked as read' : 'Marked as unread'} · ${shortDate(e.editionDate)}`);
  };
  const toggleRead = (e: Edition) => {
    keep(e);
    markRead(e);
  };

  const remove = (item: SavedInsight) => {
    if (!window.confirm(`Remove “${wordsOf(item)}” from Takeaways?`)) return;
    onPersist(d => unsave(d, item.id));
    onNote('Removed from Takeaways');
  };
  const rate = (item: SavedInsight, confidence: number) =>
    onPersist(d => ({ ...d, progressLog: withRating(d.progressLog, item, confidence), lastModified: stamp() }));
  const setReviewing = (item: SavedInsight, on: boolean) => {
    onPersist(d => ({ ...d, progressLog: withReviewing(d.progressLog, item, on), lastModified: stamp() }));
    onNote(on ? 'Added to review: it comes back tomorrow' : 'Taken out of review');
  };

  const toggleSave = useCallback((e: Edition, input: SaveInput) => {
    keep(e);
    const existing = findSaved(saved, e, input);
    if (existing) {
      if (!window.confirm(`Remove “${nameOf(existing)}” from Takeaways?`)) return;
      onPersist(d => unsave(d, existing.id));
      onNote('Removed from Takeaways');
    } else {
      onPersist(d => ({ ...d, content: saveInsight(d.content, e, input), lastModified: stamp() }));
      onNote('Saved to Takeaways');
    }
  }, [saved, onPersist, onNote, keep]);
  // The meeting kit: a takeaway's role and place in it, and the meeting's name (kit.ts).
  const content = (f: (c: unknown[] | undefined) => unknown[]) =>
    onPersist(d => { const next = f(d.content); return next === d.content ? d : { ...d, content: next, lastModified: stamp() }; });
  const setRole = (item: SavedInsight, role: Role) => content(c => withRole(c, item, role));
  const setInKit = (item: SavedInsight, inKit: boolean) => {
    if (!inKit && !window.confirm(`Take “${wordsOf(item)}” out of the meeting kit? It stays in Takeaways.`)) return;
    content(c => withMembership(c, item, inKit));
    onNote(inKit ? 'Added to the meeting kit' : 'Taken out of the meeting kit. It stays in Takeaways.');
  };
  const setKitLabel = (label: string) => content(c => withKitLabel(c, label));

  const toggleSaveHere = useCallback((input: SaveInput) => { if (edition) toggleSave(edition, input); }, [edition, toggleSave]);

  // ── Navigation ──────────────────────────────────────────────────────────
  const switchView = (v: View) => { setView(v); remember(VIEW_KEY, v); setDrawer(false); };
  // Opening an edition leaves a memo's index where it is, beside the memo; on
  // a phone, where the index covers the memo, the memo comes back.
  const choose = (e: Edition, sectionId: string | null = null) => {
    keep(e);
    setJump(sectionId ? { driveFileId: e.driveFileId, sectionId } : null);
    setDrawer(false);
    if (phone && phoneIndex) { focusNext.current = 'toggle'; setPhoneIndex(false); }
    setPane('reader');
  };
  const openEdition = (e: Edition, sectionId: string | null = null) => {
    switchView(e.feedId);
    choose(e, sectionId);
  };
  // A review is not remembered as the view to reopen on: it is a moment's.
  const startReview = (from: View, items = due.slice(0, SESSION_SIZE)) => {
    setSession({ items, from, key: Date.now() });
    setView('review');
    setDrawer(false);
  };
  const endReview = () => {
    const from = session?.from ?? 'today';
    setSession(null);
    switchView(from);
  };
  const openSaved = (item: SavedInsight) => {
    const e = states[item.feedId]?.editions.find(x => x.driveFileId === item.driveFileId);
    if (!e) { onNote("That edition isn't on this device. Its original is in Google Docs."); return; }
    openEdition(e, item.sectionId);
  };

  // ── Pieces ──────────────────────────────────────────────────────────────
  const navTab = (v: View) => ({ id: v, label: tabLabel(v), count: v === 'saved' ? saved.length : undefined });
  const nav = (tools: ReactNode, lead?: ReactNode, inert?: boolean) => (
    <IntelligenceNav
      feeds={FEED_TABS.map(navTab)}
      more={MORE_TABS.map(navTab)}
      view={view}
      onOpen={switchView}
      tabId={tabId}
      panel={PANEL}
      tabsRef={tabsRef}
      fade={tabsFade}
      lead={lead}
      tools={tools}
      inert={inert}
    />
  );
  // What the open tab shows, named by it.
  const panel = VIEWS.includes(view) ? { id: PANEL, role: 'tabpanel', 'aria-labelledby': tabId(view) } : {};
  const searchButton = (
    <button
      type="button"
      className={`intel-nav-icon intel-search-btn${view === 'search' ? ' on' : ''}`}
      onClick={() => switchView('search')}
      aria-label="Search every edition"
      aria-pressed={view === 'search'}
    ><IconSearch /></button>
  );
  const refreshButton = (
    <button
      type="button"
      className={`intel-nav-icon intel-refresh${refreshing ? ' is-busy' : ''}`}
      onClick={refresh}
      aria-label={refreshing ? 'Refreshing from Google Drive' : 'Refresh from Google Drive'}
      aria-busy={refreshing}
    ><IconRefresh /></button>
  );
  const statusLine = status && (
    <div className={`intel-status${status.alert ? ' is-alert' : ''}`} role="status" inert={drawerOpen || undefined}>
      <span>{status.text}</span>
      {status.action === 'retry' && <button type="button" onClick={refresh}>Try again</button>}
      {status.action === 'details' && <button type="button" onClick={() => feedId && setStatusSheet([feedId])}>Details</button>}
    </div>
  );
  const statusSheetView = statusSheet && (
    <FeedStatus
      feeds={statusSheet}
      states={states}
      conformance={conformance}
      health={health}
      onOpen={e => { setStatusSheet(null); openEdition(e); }}
      onClose={() => setStatusSheet(null)}
    />
  );
  const noteLine = note && <div key={note.at} className="intel-note" role="status">{note.text}</div>;
  // Today and Takeaways are the memos' paper, light in both themes (today.css, takeaways.css).
  const pageClass = view === 'today' ? ' intel--today' : view === 'saved' ? ' intel--saved' : '';

  const list = (head: ReactNode) => (
    <>
      <div className="intel-rail-head">
        {mode === 'single' && feedId ? <h1>{feedById(feedId)!.label}</h1> : <h2>Editions</h2>}
        {editions.length > 0 && <span className="intel-count">{editions.length}<span className="intel-vh"> editions</span></span>}
        {feedId && (
          <button type="button" className="intel-iconbtn" onClick={() => setStatusSheet([feedId])} aria-label="Feed status">
            <IconPulse />
          </button>
        )}
        {head}
      </div>
      {editions.length > 0 && (
        <ol className="intel-eds">
          {editions.map(e => {
            // An imported edition not opened yet is the archive's, not new.
            const s = isArchive(e) && readingState(e, reading) === 'new' ? 'archive' : readingState(e, reading);
            const r = reading.get(e.driveFileId);
            const label = labelOf(conformance[e.feedId]?.flags.get(e.driveFileId));
            return (
              <li key={e.driveFileId}>
                <button
                  type="button"
                  className={`intel-ed is-${s}`}
                  aria-current={mode !== 'single' && e === edition ? 'true' : undefined}
                  onClick={() => choose(e)}
                >
                  {(s === 'new' || s === 'updated') && <><i className="intel-ed-dot" aria-hidden /><span className="intel-vh">{s === 'new' ? 'Unread, ' : 'Updated, '}</span></>}
                  <span className="intel-ed-date">
                    {dayNameShort(e.editionDate)} {formatDayCompact(e.editionDate)}{e.time && ` · ${e.time}`}
                    {s === 'updated' && ' · Updated'}
                    {label && <span className={`intel-tag${label === 'Imported' ? '' : ' is-alert'}`}>{label}</span>}
                  </span>
                  {savedFiles.has(e.driveFileId) && <><span className="intel-ed-saved" aria-hidden><IconBookmark /></span><span className="intel-vh">, something saved, </span></>}
                  <span className="intel-ed-title">{e.title}</span>
                  {(s === 'started' || s === 'read') && (
                    <>
                      <span className="intel-ed-bar" aria-hidden>
                        <i style={{ width: `${s === 'read' ? 100 : Math.round((r?.progress ?? 0) * 100)}%` }} />
                      </span>
                      <span className="intel-vh">{s === 'read' ? ', read' : `, ${Math.round((r?.progress ?? 0) * 100)}% read`}</span>
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );

  const reader = edition && (
    <EditionReader
      edition={edition}
      scroller={readerRef}
      onNote={onNote}
      heroActions={mode !== 'single'}
      reading={reading}
      saved={saved}
      onToggleRead={() => toggleRead(edition)}
      onToggleSave={toggleSaveHere}
      onPosition={onPosition}
      startAt={startAt}
      resume={resume}
      flags={conformance[edition.feedId]?.flags.get(edition.driveFileId)}
      related={related}
      onOpenRelated={e => openEdition(e)}
      fill={memo ? fillRef : undefined}
    />
  );
  // The memos' workspace: the bar across it, the index and the memo side by side.
  const workspace = brand && feedId && (
    <div className={`memo-workspace${shown ? '' : ' is-hidden'}${phone ? ' memo-workspace--phone' : ''}`} {...panel}>
      <MemoReadbar
        edition={edition}
        shown={shown}
        onToggle={toggleIndex}
        toggleRef={toggleRef}
        adjacent={adjacent}
        onOpenAdjacent={e => choose(e)}
        fillRef={fillRef}
      />
      {statusLine}
      <div className="memo-columns">
        <MemoIndex
          key={feedId}
          feedId={feedId}
          editions={editions}
          current={edition}
          shown={shown}
          readOf={e => isRead(e, reading)}
          unreadOf={e => countsAsUnread(e, reading)}
          tagsOf={e => {
            const label = labelOf(conformance[e.feedId]?.flags.get(e.driveFileId));
            return [
              // Read, then changed in Drive.
              ...(readingState(e, reading) === 'updated' ? [{ text: 'Updated', alert: false }] : []),
              // Imported is most of the archive: the memo says it when one is open.
              ...(label && label !== 'Imported' ? [{ text: label, alert: true }] : []),
            ];
          }}
          onChoose={e => choose(e)}
          onStatus={() => setStatusSheet([feedId])}
          indexRef={indexRef}
          loading={loading}
        />
        <div className="intel-reader intel-reader--memo" ref={readerRef} inert={(phone && shown) || undefined}>
          {reader ?? <Empty state={state} loading={loading} onRetry={refresh} />}
        </div>
      </div>
    </div>
  );

  const page = view === 'search'
    ? (
      <SearchView
        states={states}
        query={query}
        filters={filters}
        onQuery={setQuery}
        onFilters={setFilters}
        onOpen={(e, sectionId) => openEdition(e, sectionId)}
        today={today}
        loading={!Object.keys(refreshed).length}
      />
    )
    : view === 'today'
    ? (
      <TodayView
        states={states}
        reading={reading}
        loading={!Object.keys(refreshed).length}
        checked={id => !!refreshed[id]}
        today={today}
        now={now}
        health={health}
        onOpen={e => openEdition(e)}
        onToggleRead={markRead}
        labelOf={e => labelOf(conformance[e.feedId]?.flags.get(e.driveFileId))}
        onStatus={() => setStatusSheet(FEEDS.map(f => f.id))}
        review={{ due, tomorrow: dueTomorrow }}
        onReview={() => startReview('today')}
        reviews={reviews}
        focus={todayFeed}
        onFocus={setTodayFeed}
        backlogOpen={backlogOpen}
        onBacklog={setBacklogOpen}
      />
    )
    : view === 'saved'
      ? (
        <SavedView
          saved={saved}
          reviews={reviews}
          today={today}
          due={due}
          kit={kit}
          topicsOf={topicsOf}
          state={notebook}
          onState={onNotebook}
          onOpen={openSaved}
          onPatch={(item, patch) => content(c => updateInsight(c, item.id, patch))}
          onRemove={remove}
          onNote={onNote}
          onReview={() => startReview('saved')}
          onReviewOne={item => startReview('saved', [item])}
          onReviewing={setReviewing}
          onRole={setRole}
          onKit={setInKit}
          onKitLabel={setKitLabel}
        />
      )
      : null;

  if (view === 'review' && session) {
    return (
      <div className={`intel intel--${mode} intel--review`} style={rootStyle}>
        <ReviewView
          key={session.key}
          items={session.items}
          today={today}
          backTo={session.from === 'saved' ? 'Takeaways' : 'Today'}
          moreDue={due.filter(d => !session.items.some(i => i.id === d.id)).length}
          onRate={rate}
          onStop={item => setReviewing(item, false)}
          onOpen={item => { setSession(null); openSaved(item); }}
          onMore={() => startReview(session.from)}
          onClose={endReview}
        />
        {noteLine}
      </div>
    );
  }

  if (workspace) {
    return (
      <div className={`intel intel--${mode} intel--memo${JOUR_ET_VERRE ? ' intel--jv' : ''}`} style={rootStyle}>
        {nav(<>{searchButton}{mode !== 'single' && refreshButton}</>)}
        {workspace}
        {noteLine}
        {statusSheetView}
      </div>
    );
  }

  if (mode === 'single') {
    if (feedId && pane === 'reader' && edition) {
      return (
        <div className="intel intel--single" style={rootStyle}>
          <div className="intel-bar">
            <button type="button" className="ds-icon-btn" onClick={() => setPane('list')} aria-label="Back to editions">
              <IconChevronLeft />
            </button>
            <b>{feedById(feedId)!.label}</b>
            <span className="intel-grow" />
            <EditionTools
              edition={edition}
              read={isRead(edition, reading)}
              saved={!!findSaved(saved, edition, { kind: 'edition', text: edition.title })}
              onToggleRead={() => toggleRead(edition)}
              onToggleSave={() => toggleSave(edition, { kind: 'edition', text: edition.title })}
            />
          </div>
          <div className="intel-reader" ref={readerRef}>{reader}</div>
          {noteLine}
          {statusSheetView}
        </div>
      );
    }
    return (
      <div className={`intel intel--single${pageClass}`} style={rootStyle}>
        {nav(searchButton)}
        {statusLine}
        <div className="intel-list" {...panel}>
          {page ?? (
            <>
              {list(<><span className="intel-grow" />{refreshButton}</>)}
              {!editions.length && <Empty state={state} loading={loading} onRetry={refresh} />}
            </>
          )}
        </div>
        {noteLine}
        {statusSheetView}
      </div>
    );
  }

  return (
    <div className={`intel intel--${mode}${pageClass}${drawerOpen ? ' is-drawer-open' : ''}`} style={rootStyle}>
      {nav(
        <>{searchButton}{refreshButton}</>,
        mode === 'drawer' && feedId && (
          <button type="button" className="ds-btn intel-editions" onClick={() => setDrawer(true)} aria-expanded={drawerOpen}>
            <IconList />Editions
          </button>
        ),
        drawerOpen,
      )}
      {statusLine}
      <div className="intel-body" inert={drawerOpen || undefined} {...panel}>
        {mode === 'rail' && feedId && <aside className="intel-rail" aria-label="Editions">{list(null)}</aside>}
        <div className="intel-reader" ref={readerRef}>
          {page ?? reader ?? <Empty state={state} loading={loading} onRetry={refresh} />}
        </div>
      </div>
      {mode === 'drawer' && feedId && (
        <>
          <div className="intel-scrim" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="intel-drawer" aria-label="Editions" inert={!drawerOpen} ref={drawerRef}>
            {list(<>
              <span className="intel-grow" />
              <button type="button" className="ds-icon-btn" onClick={() => setDrawer(false)} aria-label="Close editions"><IconX /></button>
            </>)}
          </aside>
        </>
      )}
      {noteLine}
      {statusSheetView}
    </div>
  );
}
