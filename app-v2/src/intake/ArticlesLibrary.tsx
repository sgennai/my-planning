// Intake › Articles: your Instapaper library as a list (dense, for many articles) or a bento grid (image-led
// cards, typographic where an article has no image). Both draw the same articles in the same order; search,
// filter and sort are the same, and switching keeps the first article in view where it was. The view,
// filter and sort are remembered on this device; the search and the place, for this session.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  FILTERS, SORTS, authorOf, descriptionOf, imageOf, matchesFilter, matchesQuery, minutesOf, sortArticles, statusOf, titleOf,
  type Article, type Filter, type Reading, type Sort,
} from './articles';
import type { LibraryStatus } from './useArticles';

type Mode = 'list' | 'bento';
interface Prefs { mode: Mode; filter: Filter; sort: Sort }

const PREFS_KEY = 'my-planning-intake-library';
const DEFAULTS: Prefs = { mode: 'list', filter: 'all', sort: 'saved-desc' };
function recallPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>;
    return {
      mode: p.mode === 'bento' ? 'bento' : 'list',
      filter: FILTERS.some(f => f.id === p.filter) ? p.filter! : DEFAULTS.filter,
      sort: SORTS.some(s => s.id === p.sort) ? p.sort! : DEFAULTS.sort,
    };
  } catch { return DEFAULTS; }
}
function rememberPrefs(p: Prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* private browsing: not remembered */ }
}
// Kept while the app runs: leaving Intake and coming back finds the search and the place.
const session: { query: string; place: Anchor | null } = { query: '', place: null };

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const DAY_YEAR = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const dateOf = (unix: number | null) => {
  if (!unix) return null;
  const d = new Date(unix * 1000);
  return (d.getFullYear() === new Date().getFullYear() ? DAY : DAY_YEAR).format(d);
};
const ago = (ms: number) => {
  const min = Math.round((Date.now() - ms) / 60000);
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago` : DAY.format(new Date(ms));
};

interface Props {
  articles: ReadonlyMap<number, Article> | null;
  status: LibraryStatus;
  reading: ReadonlyMap<number, Reading>;
  onRetry: () => void;
  onOpen: (id: number) => void;
}

export function ArticlesLibrary({ articles, status, reading, onRetry, onOpen }: Props) {
  const [prefs, setPrefs] = useState(recallPrefs);
  const [query, setQuery] = useState(session.query);
  const scroller = useRef<HTMLDivElement>(null);
  const keepInView = useRef<Anchor | null>(null);

  const all = useMemo(() => [...(articles?.values() ?? [])], [articles]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(f => [f.id, all.filter(a => matchesFilter(a, f.id, reading)).length])) as Record<Filter, number>, [all, reading]);
  const shown = useMemo(
    () => sortArticles(all.filter(a => matchesFilter(a, prefs.filter, reading) && matchesQuery(a, query)), prefs.sort),
    [all, prefs.filter, prefs.sort, reading, query],
  );

  const set = (patch: Partial<Prefs>) => {
    if (patch.mode && patch.mode !== prefs.mode) keepInView.current = anchorOf(scroller.current);
    const next = { ...prefs, ...patch };
    setPrefs(next);
    rememberPrefs(next);
  };

  // The place is noted on leaving (the list is still on the page then), and found again, once there is something
  // to scroll.
  useLayoutEffect(() => {
    const el = scroller.current;
    return () => { session.place = anchorOf(el); };
  }, []);
  const restored = useRef(false);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || restored.current || !all.length) return;
    restored.current = true;
    if (session.place) holdAnchor(el, session.place);
  }, [all.length]);
  // After switching views, the article that was first in view is where it was: at the top, the header too.
  useLayoutEffect(() => {
    const anchor = keepInView.current;
    keepInView.current = null;
    if (anchor && scroller.current) holdAnchor(scroller.current, anchor);
  }, [prefs.mode]);

  const toRead = counts.unread + counts.progress;
  return (
    <div className="ik-scroll" ref={scroller}>
      <div className="ik-library">
        <header className="ik-intro">
          <div>
            <p className="ik-eyebrow">Intake · Articles</p>
            <h1 className="ik-title">Reading library</h1>
            <p className="ik-sub">
              {articles === null ? 'Opening your library…' : (
                <>
                  {toRead} to read{counts.archived > 0 && ` · ${counts.archived} archived`}
                  {status.lastSyncAt && ` · Synced with Instapaper ${ago(status.lastSyncAt)}`}
                </>
              )}
            </p>
          </div>
          <div className="ik-modes" role="group" aria-label="Layout">
            <button type="button" aria-pressed={prefs.mode === 'list'} onClick={() => set({ mode: 'list' })}>List</button>
            <button type="button" aria-pressed={prefs.mode === 'bento'} onClick={() => set({ mode: 'bento' })}>Bento</button>
          </div>
        </header>

        <div className="ik-controls">
          <label className="ik-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
            <input
              type="search"
              value={query}
              onChange={e => { setQuery(e.target.value); session.query = e.target.value; }}
              placeholder="Search titles, sources, authors"
              aria-label="Search your articles"
              autoComplete="off"
            />
          </label>
          <label className="ik-sort">
            <span className="ik-vh">Sort</span>
            <select value={prefs.sort} onChange={e => set({ sort: e.target.value as Sort })}>
              {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        </div>
        <div className="ik-filters" role="group" aria-label="Show">
          {FILTERS.filter(f => f.id !== 'removed' || counts.removed > 0).map(f => (
            <button key={f.id} type="button" className={f.id === 'archived' || f.id === 'liked' ? 'is-instapaper' : undefined} aria-pressed={prefs.filter === f.id} onClick={() => set({ filter: f.id })}>
              {f.label}<span className="ik-count"><span className="ik-vh">, </span>{counts[f.id]}</span>
            </button>
          ))}
        </div>

        <StatusLine status={status} onRetry={onRetry} empty={!all.length} />

        {articles !== null && (shown.length ? (
          <ol className={`ik-articles ik-articles--${prefs.mode}`}>
            {shown.map((a, i) => (
              <li key={a.id} data-id={a.id}>
                {prefs.mode === 'list' ? <Row a={a} reading={reading} onOpen={onOpen} /> : <Card a={a} reading={reading} lead={i === 0} onOpen={onOpen} />}
              </li>
            ))}
          </ol>
        ) : all.length > 0 && (
          <p className="ik-empty" role="status">{query.trim() ? `No article matches “${query.trim()}”.` : `No ${FILTERS.find(f => f.id === prefs.filter)!.label.toLowerCase()} articles.`}</p>
        ))}
      </div>
    </div>
  );
}

/** The first article in view, and how far below the top of the scroller it starts (above it: negative). */
interface Anchor { id: number; offset: number }
function anchorOf(el: HTMLElement | null): Anchor | null {
  if (!el) return null;
  const top = el.getBoundingClientRect().top;
  const item = [...el.querySelectorAll<HTMLElement>('[data-id]')].find(i => i.getBoundingClientRect().bottom > top + 8);
  return item ? { id: Number(item.dataset.id), offset: item.getBoundingClientRect().top - top } : null;
}

/**
 * Puts the anchor's article back where it was, and keeps it there for a second while the articles around
 * it are first laid out: off screen they have an estimated size (content-visibility) until they come near,
 * which moves what follows them. A touch, wheel, key or click lets go at once.
 */
function holdAnchor(el: HTMLElement, anchor: Anchor) {
  const place = () => {
    const item = el.querySelector<HTMLElement>(`[data-id="${anchor.id}"]`);
    if (!item) return;
    const delta = item.getBoundingClientRect().top - el.getBoundingClientRect().top - anchor.offset;
    if (Math.abs(delta) >= 1) el.scrollTop += delta;
  };
  // In the next frame: scrolling from inside the observer lays out again at once, which it reports as a loop.
  const sizes = new ResizeObserver(() => requestAnimationFrame(place));
  const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
  const release = () => {
    sizes.disconnect();
    clearTimeout(timer);
    for (const ev of events) el.removeEventListener(ev, release);
  };
  for (const ev of events) el.addEventListener(ev, release, { once: true, passive: true });
  const timer = setTimeout(release, 1000);
  place();
  if (el.firstElementChild) sizes.observe(el.firstElementChild);
}

function StatusLine({ status, onRetry, empty }: { status: LibraryStatus; onRetry: () => void; empty: boolean }) {
  const e = status.error;
  if (e) {
    const text = {
      offline: empty ? "You're offline, and this device has no copy of your library yet." : "Offline. Showing the copy on this device.",
      'not-configured': "Instapaper isn't connected yet: its access token (INSTAPAPER_ACCESS_TOKEN) isn't set on the server.",
      'auth-failed': 'Instapaper refused the access token. Generate a new one on Instapaper and store it again.',
      'rate-limited': 'Instapaper asked to slow down. Try again in a minute.',
    }[e.code as string] ?? "Couldn't sync with Instapaper.";
    return (
      <div className={`ik-status${e.code === 'offline' ? '' : ' is-alert'}`} role="status">
        <span>{text}</span>
        {e.code !== 'not-configured' && <button type="button" onClick={onRetry}>Try again</button>}
      </div>
    );
  }
  if (status.phase === 'syncing' && empty) return <div className="ik-status" role="status">Bringing in your Instapaper library…</div>;
  if (status.fetching && status.fetching.total > 0) {
    return <div className="ik-status" role="status">Getting reading times and offline copies: {status.fetching.done} of {status.fetching.total}</div>;
  }
  // Why the background fetch ended before every article came, until the next sync.
  const end = status.fetchEnd;
  if (end) {
    const stop = end.stopped?.code;
    const text = !stop
      ? `${end.failed === 1 ? "1 article didn't" : `${end.failed} articles didn't`} come through from Instapaper in time. ${end.failed === 1 ? "It'll" : "They'll"} be tried again later.`
      : stop === 'offline' ? "Reading times paused: you're offline. The rest will come next time."
      : stop === 'quota' ? "Instapaper's limit on article text is reached for now. The remaining reading times will come later."
      : stop === 'unreachable' ? "Instapaper isn't answering for now. The remaining reading times will come next time."
      : "Couldn't get the remaining reading times. They'll come next time.";
    return (
      <div className="ik-status" role="status">
        <span>{text}</span>
        {stop && <button type="button" onClick={onRetry}>Try again</button>}
      </div>
    );
  }
  if (status.phase === 'ready' && empty) return <p className="ik-empty" role="status">Nothing saved in Instapaper yet.</p>;
  return null;
}

/** Your reading, and Instapaper's states, in words. */
function Meta({ a, reading, source = true }: { a: Article; reading: ReadonlyMap<number, Reading>; source?: boolean }) {
  const s = statusOf(a.id, reading);
  const r = reading.get(a.id);
  const min = minutesOf(a.words);
  return (
    <p className="ik-meta">
      {source && a.domain && <span>{a.domain}</span>}
      {a.savedAt && <span>Saved {dateOf(a.savedAt)}</span>}
      {min && <b>{min} min read</b>}
      <span className={`ik-state is-${s}`}>{s === 'finished' ? 'Finished' : s === 'progress' ? `In progress · ${Math.round((r?.progress ?? 0) * 100)}%` : 'Unread'}</span>
      {a.archived && <span className="ik-flag">Archived in Instapaper</span>}
      {a.liked && <span className="ik-flag">Liked in Instapaper</span>}
      {a.removedAt && <span className="ik-flag is-alert">Removed from Instapaper</span>}
      {a.content === 'unavailable' && <span className="ik-flag">Original only</span>}
      {a.keep && <span className="ik-flag">Kept offline</span>}
    </p>
  );
}

/** The article's image, or its source's initial on the theme's colours: never a stand-in photograph. */
function Thumb({ a, className }: { a: Article; className: string }) {
  const [failed, setFailed] = useState(false);
  const src = imageOf(a);
  return (
    <div className={`${className}${src && !failed ? '' : ' is-type'}`} aria-hidden>
      {src && !failed
        ? <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : <span>{(a.domain ?? titleOf(a)).replace(/^www\./, '').charAt(0).toUpperCase()}</span>}
    </div>
  );
}

// The title is the article's one control for the keyboard and screen readers; the row or card itself opens
// the article on a click anywhere in it (the title's own included, which reaches it too). Not the title's
// cover (`.ik-open::after`) alone: WebKit on a touch screen sends a tap's press to the cover but its release
// to what lies under it (the description, the picture), so the click went to neither: on the iPad only a tap
// on the title's very words opened the article.
function Open({ a }: { a: Article }) {
  return <button type="button" className="ik-open">{titleOf(a)}</button>;
}

function Row({ a, reading, onOpen }: { a: Article; reading: ReadonlyMap<number, Reading>; onOpen: (id: number) => void }) {
  const desc = descriptionOf(a);
  const author = authorOf(a);
  return (
    <div className="ik-row" onClick={() => onOpen(a.id)}>
      <Thumb a={a} className="ik-thumb" />
      <div className="ik-row-body">
        <h2 className="ik-row-title"><Open a={a} /></h2>
        {desc && <p className="ik-desc">{desc}</p>}
        {author && <p className="ik-author">{author}</p>}
        <Meta a={a} reading={reading} />
      </div>
    </div>
  );
}

function Card({ a, reading, lead, onOpen }: { a: Article; reading: ReadonlyMap<number, Reading>; lead: boolean; onOpen: (id: number) => void }) {
  const desc = descriptionOf(a);
  const image = !!imageOf(a);
  return (
    <div className={`ik-card${image ? '' : ' is-type'}${lead ? ' is-lead' : ''}`} onClick={() => onOpen(a.id)}>
      {image && <Thumb a={a} className="ik-card-img" />}
      <div className="ik-card-body">
        {a.domain && <p className="ik-source">{a.domain}</p>}
        <h2 className="ik-card-title"><Open a={a} /></h2>
        {desc && (!image || lead) && <p className="ik-desc">{desc}</p>}
        <Meta a={a} reading={reading} source={false} />
      </div>
    </div>
  );
}
