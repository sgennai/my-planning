// The executive memos' workspace (INT-53), after the approved prototype
// `executive-memo-unified-paper-index.html`, one for the three feeds: a
// reading bar across it (Hide or Show editions, the edition's date, without
// the run's time since INT-58, between the older and newer editions' chevrons, the 2px reading line; the
// feed's name is the selected tab's above it, INT-54), then the paper index of editions beside the memo, each
// scrolling on its own. The index lists the feed's editions by month, newest
// first, each month opening and closing on its own, with a search; choosing an
// edition opens it beside the index, which stays (on a phone, where the index
// takes the whole width, the memo replaces it). Which edition, and whether the
// index shows, are the screen's (`IntelligenceScreen`); the index keeps its
// own months, search and filter, so that neither redraws the memo beside it;
// how a memo is drawn is the memo's. An edition you marked read (INT-57,
// `reading.ts`) is sage in the index, as the memo's read button is when on:
// read and chosen are apart, so each of the four combinations shows.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Edition } from './parse';
import type { FeedId } from './feeds';
import { headDate, indexGroups, monthKey, shortDate } from './memo';

/** The index's element, which the bar's toggle controls. */
const INDEX = 'memo-editions';

const plural = (n: number) => `${n} edition${n === 1 ? '' : 's'}`;

type Filter = 'all' | 'unread';

/** A feed's open months, kept on the device; its search, for the session. */
const monthsKey = (feedId: FeedId) => `my-planning-intel-months:${feedId}`;
const searchKey = (feedId: FeedId) => `my-planning-intel-search:${feedId}`;
function recall(store: () => Storage, key: string): string | null {
  try { return store().getItem(key); } catch { return null; }
}
function remember(store: () => Storage, key: string, value: string) {
  try { store().setItem(key, value); } catch { /* private browsing: not kept */ }
}
const local = () => localStorage;
const session = () => sessionStorage;
function storedMonths(feedId: FeedId): string[] {
  try {
    const keys = JSON.parse(recall(local, monthsKey(feedId)) ?? 'null');
    return Array.isArray(keys) ? keys.filter((k): k is string => typeof k === 'string') : [];
  } catch { return []; }
}

/** The bar's chevron to the older or the newer edition; faded where there is none. */
function Step({ to, newer, onOpen }: { to: Edition | null; newer: boolean; onOpen?: (e: Edition) => void }) {
  const which = newer ? 'Next edition' : 'Previous edition';
  return (
    <button
      type="button"
      className="memo-step"
      disabled={!to}
      aria-label={to ? `${which}: ${shortDate(to.editionDate)}, ${to.title}` : `${which}: none`}
      title={to ? `${which}: ${shortDate(to.editionDate)}` : undefined}
      onClick={() => to && onOpen?.(to)}
    ><span aria-hidden>{newer ? '›' : '‹'}</span></button>
  );
}

interface BarProps {
  /** The edition being read; none before the feed has one. */
  edition: Edition | null;
  /** Whether the index shows, and the toggle that shows or hides it. */
  shown: boolean;
  onToggle: () => void;
  toggleRef: RefObject<HTMLButtonElement | null>;
  /** The editions either side of this one in the feed (newest first). */
  adjacent?: { older: Edition | null; newer: Edition | null };
  onOpenAdjacent?: (e: Edition) => void;
  /** The reading line, painted by the reader as the memo scrolls. */
  fillRef: RefObject<HTMLDivElement | null>;
}

export function MemoReadbar({ edition, shown, onToggle, toggleRef, adjacent, onOpenAdjacent, fillRef }: BarProps) {
  const label = shown ? 'Hide editions' : 'Show editions';
  return (
    <header className="memo-readbar">
      <div className="memo-readbar-left">
        <button
          type="button"
          className="memo-editions-toggle"
          aria-expanded={shown}
          aria-controls={INDEX}
          aria-label={label}
          onClick={onToggle}
          ref={toggleRef}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M4 5h16M4 12h16M4 19h16" /></svg>
          <span className="memo-editions-toggle-label" aria-hidden>{label}</span>
        </button>
      </div>
      {edition && (
        <div className="memo-readbar-right">
          {adjacent && <Step to={adjacent.older} newer={false} onOpen={onOpenAdjacent} />}
          <span className="memo-readbar-date">{headDate(edition.editionDate)}</span>
          {adjacent && <Step to={adjacent.newer} newer onOpen={onOpenAdjacent} />}
        </div>
      )}
      <div className="memo-track" aria-hidden><div className="memo-fill" ref={fillRef} /></div>
    </header>
  );
}

interface IndexProps {
  /** Whose index: its months and search are kept per feed (the index is drawn anew for each). */
  feedId: FeedId;
  /** The feed's editions, newest first. */
  editions: Edition[];
  current: Edition | null;
  shown: boolean;
  /** Marked read by you (INT-57). */
  readOf: (e: Edition) => boolean;
  /** Counted as unread: not marked read, and not imported (the archive, D17). */
  unreadOf: (e: Edition) => boolean;
  /** Quiet words after an edition's date: "Updated", a problem with its document. */
  tagsOf: (e: Edition) => { text: string; alert: boolean }[];
  onChoose: (e: Edition) => void;
  onStatus: () => void;
  indexRef: RefObject<HTMLElement | null>;
  /** The feed's editions are still on their way (the memo says so). */
  loading?: boolean;
}

/**
 * The paper index: "Edition history", how many read and unread, the search,
 * All editions or Unread only; then the months, each with its count, open or shut on its own
 * (while searching, every month with a match shows, and closing one there
 * lasts until the search changes); the edition being read marked; the foot.
 * The month of the edition being read opens as the index is drawn and as
 * that edition changes (worked out while rendering, so it never shows shut);
 * a month closed by hand stays closed until then.
 */
export function MemoIndex({ feedId, editions, current, shown, readOf, unreadOf, tagsOf, onChoose, onStatus, indexRef, loading = false }: IndexProps) {
  const [open, setOpen] = useState<string[]>(() => storedMonths(feedId));
  const [seen, setSeen] = useState<string | null>(null);
  const reading = current?.driveFileId ?? null;
  if (reading !== seen) {
    setSeen(reading);
    const key = current && monthKey(current.editionDate);
    if (key && !open.includes(key)) setOpen([...open, key]);
  }
  useEffect(() => { remember(local, monthsKey(feedId), JSON.stringify(open)); }, [feedId, open]);
  const [query, setQuery] = useState(() => recall(session, searchKey(feedId)) ?? '');
  const search = (q: string) => { setQuery(q); remember(session, searchKey(feedId), q); };

  // All editions, or only those still to read: an edition marked read leaves
  // this list at once, while it stays open beside it.
  const [filter, setFilter] = useState<Filter>('all');
  const listed = useMemo(() => (filter === 'unread' ? editions.filter(unreadOf) : editions), [editions, filter, unreadOf]);
  const groups = useMemo(() => indexGroups(listed, query), [listed, query]);
  const read = editions.filter(readOf).length;
  const unread = editions.filter(unreadOf).length;
  const searching = !!query.trim();
  // Months shut while searching, until the search changes.
  const [shut, setShut] = useState<{ query: string; keys: string[] }>({ query, keys: [] });
  const shutNow = shut.query === query ? shut.keys : [];
  const isOpen = (key: string) => (searching ? !shutNow.includes(key) : open.includes(key));
  const toggle = (key: string) => {
    if (searching) setShut({ query, keys: shutNow.includes(key) ? shutNow.filter(k => k !== key) : [...shutNow, key] });
    else setOpen(open.includes(key) ? open.filter(k => k !== key) : [...open, key]);
  };
  const shownCount = groups.reduce((n, g) => n + g.editions.length, 0);

  // The edition being read stays in sight in the list: as it opens, as it
  // changes, as the index comes back.
  const listRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const box = listRef.current;
    const item = box?.querySelector('[aria-current="page"]');
    if (!box || !item || !shown) return;
    const b = box.getBoundingClientRect(), r = item.getBoundingClientRect();
    if (r.top < b.top || r.bottom > b.bottom) box.scrollTop += r.top - b.top - box.clientHeight / 3;
  }, [current, shown]);

  return (
    <aside id={INDEX} className="memo-editions" aria-label="Edition history" inert={!shown || undefined} ref={indexRef}>
      <div className="memo-editions-head">
        <h2>Edition history</h2>
        <div className="memo-editions-sub"><b>{read} read</b> · {unread} unread · {plural(editions.length)}</div>
        <label className="memo-editions-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
          <input type="search" placeholder="Search editions" autoComplete="off" aria-label="Search edition history" value={query} onChange={e => search(e.target.value)} />
        </label>
        <div className="memo-editions-filters" role="group" aria-label="Show">
          <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All editions</button>
          <button type="button" aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>Unread only</button>
        </div>
      </div>
      <nav className="memo-months" aria-label="Browse editions by month" ref={listRef}>
        {groups.map(g => {
          const here = isOpen(g.key);
          return (
            <div key={g.key} className="memo-month">
              <button
                type="button"
                className="memo-month-head"
                aria-expanded={here}
                aria-controls={`memo-month-${g.key}`}
                onClick={() => toggle(g.key)}
              >
                <span>{g.month}</span>
                <span className="memo-month-count"><span className="intel-vh">, </span>{g.editions.length}<span className="intel-vh"> {g.editions.length === 1 ? 'edition' : 'editions'}</span></span>
                <svg className="memo-month-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m9 5 7 7-7 7" /></svg>
              </button>
              <div className="memo-month-list" id={`memo-month-${g.key}`} hidden={!here}>
                {g.editions.map(e => {
                  const now = e === current;
                  const isRead = readOf(e);
                  return (
                    <button
                      key={e.driveFileId}
                      type="button"
                      className={`memo-edition${isRead ? ' is-read' : ''}`}
                      aria-current={now ? 'page' : undefined}
                      onClick={() => onChoose(e)}
                    >
                      <span className="memo-edition-date">
                        {shortDate(e.editionDate)}
                        {tagsOf(e).map(t => <span key={t.text} className={`memo-edition-tag${t.alert ? ' is-alert' : ''}`}><span className="intel-vh">, </span>{t.text}</span>)}
                      </span>
                      {/* Read in words too, not by colour alone. */}
                      <span className="intel-vh">{isRead ? ', read: ' : ': '}</span>
                      <span className="memo-edition-title">{e.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!groups.length && !loading && (
          <p className="memo-editions-empty">
            {!editions.length ? 'No editions yet.' : query.trim() ? 'No matching editions.' : 'No unread editions.'}
          </p>
        )}
      </nav>
      <div className="memo-editions-foot">
        <span>{plural(shownCount)}</span>
        <button type="button" onClick={onStatus}>Feed status</button>
      </div>
    </aside>
  );
}
