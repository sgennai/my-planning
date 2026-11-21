// Intake › Websites, after the approved prototype "Focus Desk Light" (websites-focus-desk-light.html): the sites
// you keep, as your own records (websites.ts), never demonstration content.
// - Pinned & ready: your pinned websites as large tiles, in your order (Arrange), each a link to the site. The
//   List / Bento switch below never changes them.
// - Browse by topic: every website, by topic, as a compact list (the default) or bento cards; the switch is for
//   all topics at once and is remembered on this device. Every website of a topic is shown in it, as in the
//   prototype: nothing is cut short. A row or card opens the site; its More button, the details.
// - Search (name, domain, description, topic, tags, note; every word, accents and case ignored) and the filters
//   (All, Pinned, a topic) apply to both; switching the view keeps them and the place in the page.
// - A website added while offline, or whose logo was not found yet, gets its logo later, one at a time while this
//   is open (site-logo.ts); a site that has none keeps its initials, and isn't asked again until you ask.
import '../styles/intake-websites.css';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  byName, categoriesOf, domainOf, matchesQuery, moveTo, newWebsite, normalizeUrl, pinPatch, pinnedOf, updateWebsite, updateWebsites,
  websitesOf, withWebsite, withoutWebsite, type Website, type WebsiteInput,
} from './websites';
import { lookUpSite, resolveLogo } from './site-logo';
import { BentoCard, IcGrid, IcList, IcPlus, IcSearch, IcSort, ListRow, PinnedTile } from './WebsiteParts';
import { ArrangeSheet, DetailsSheet, EditSheet } from './WebsiteSheets';

export type ContentChange = (change: (content: unknown[] | undefined) => unknown[]) => void;

type View = 'list' | 'bento';
/** 'all', 'pinned', or 'topic:<name>'. */
type Filter = string;
interface Prefs { view: View; filter: Filter }
const PREFS_KEY = 'my-planning-intake-websites';
function recallPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>;
    return { view: p.view === 'bento' ? 'bento' : 'list', filter: typeof p.filter === 'string' ? p.filter : 'all' };
  } catch { return { view: 'list', filter: 'all' }; }
}
function rememberPrefs(p: Prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* private browsing: not remembered */ }
}
// Kept while the app runs: leaving Intake and coming back finds the search, the open topics and the place.
const session = { query: '', scroll: 0 };

type Open = { kind: 'details'; id: string } | { kind: 'edit'; id: string | null; url?: string } | { kind: 'arrange' } | null;


/** The first website on screen and how far below the top of the scroller it is: kept where it was across a change of view. */
function anchorOf(scroller: HTMLElement | null): { id: string; top: number } | null {
  if (!scroller) return null;
  const top = scroller.getBoundingClientRect().top;
  for (const el of scroller.querySelectorAll<HTMLElement>('.ws-group .ws-site')) {
    const r = el.getBoundingClientRect();
    if (r.bottom > top + 8) return { id: el.dataset.site!, top: r.top - top };
  }
  return null;
}

export function WebsitesLibrary({ content, onChange }: { content: unknown[] | undefined; onChange: ContentChange }) {
  const [prefs, setPrefs] = useState(recallPrefs);
  const [query, setQuery] = useState(session.query);
  const [open, setOpen] = useState<Open>(null);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const keep = useRef<{ id: string; top: number } | null>(null);

  const sites = useMemo(() => websitesOf(content), [content]);
  const topics = useMemo(() => categoriesOf(sites), [sites]);
  const matching = useMemo(() => sites.filter(s => matchesQuery(s, query)), [sites, query]);
  const pinned = useMemo(() => pinnedOf(matching), [matching]);
  const filter = prefs.filter === 'all' || prefs.filter === 'pinned' || topics.some(t => `topic:${t.name}` === prefs.filter && t.count > 0) ? prefs.filter : 'all';
  const inView = useMemo(() => matching.filter(s => filter === 'all' || (filter === 'pinned' ? s.pinned : `topic:${s.category}` === filter)), [matching, filter]);
  const groups = useMemo(() => topics.map(t => ({ name: t.name, sites: inView.filter(s => s.category === t.name).sort(byName) })).filter(g => g.sites.length), [topics, inView]);

  const say = (text: string) => setToast({ text, key: Date.now() });
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const set = (patch: Partial<Prefs>) => {
    if (patch.view && patch.view !== prefs.view) keep.current = anchorOf(scroller.current);
    const next = { ...prefs, ...patch };
    setPrefs(next);
    rememberPrefs(next);
  };
  // The same website at the same height after a change of view.
  useLayoutEffect(() => {
    const k = keep.current, el = scroller.current;
    keep.current = null;
    if (!k || !el) return;
    const target = el.querySelector<HTMLElement>(`.ws-group .ws-site[data-site="${CSS.escape(k.id)}"]`);
    if (target) el.scrollTop += target.getBoundingClientRect().top - el.getBoundingClientRect().top - k.top;
  }, [prefs.view]);
  // The place on leaving, found again on coming back.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && session.scroll) el.scrollTop = session.scroll;
    return () => { session.scroll = el?.scrollTop ?? 0; };
  }, []);
  useEffect(() => { session.query = query; }, [query]);

  // ── Changes, each made on what is stored at that moment ──
  const save = (input: WebsiteInput, id: string | null) => {
    onChange(c => {
      const all = websitesOf(c);
      if (!id) return withWebsite(c, newWebsite(input, all));
      const was = all.find(s => s.id === id);
      if (!was) return c ?? [];
      const { pinned: wantPinned, logo, ...fields } = input;
      return updateWebsite(c, id, { ...fields, ...(logo !== undefined ? { logo } : {}), ...pinPatch(all, was, wantPinned) });
    });
    setOpen(id ? { kind: 'details', id } : null);
    say(id ? 'Changes saved' : `${input.name || domainOf(input.url)} saved`);
  };
  const togglePin = (site: Website) => {
    onChange(c => {
      const all = websitesOf(c);
      const now = all.find(s => s.id === site.id);
      return now ? updateWebsite(c, now.id, pinPatch(all, now, !now.pinned)) : c ?? [];
    });
    say(site.pinned ? `${site.name} unpinned` : `${site.name} pinned`);
  };
  const remove = (site: Website) => {
    onChange(c => withoutWebsite(c, site.id));
    setOpen(null);
    say(`${site.name} deleted`);
  };
  const move = (id: string, to: number) => onChange(c => updateWebsites(c, moveTo(websitesOf(c), id, to).map(m => ({ id: m.id, patch: { pinRank: m.pinRank } }))));

  // ── Logos still to find: one at a time, online, while this is open ──
  const tried = useRef(new Set<string>());
  const [finding, setFinding] = useState<string | null>(null);
  // Back online: the logos of websites saved meanwhile are looked for again.
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  // Stopped only on leaving: the look-up under way is not cancelled by the change of state that starting it makes.
  const finder = useRef<AbortController | null>(null);
  useEffect(() => () => finder.current?.abort(), []);
  useEffect(() => {
    if (finding || !online || navigator.onLine === false) return;
    const next = sites.find(s => s.logo === null && !tried.current.has(s.id));
    if (!next) return;
    tried.current.add(next.id);
    setFinding(next.id);
    const ctl = new AbortController();
    finder.current = ctl;
    void (async () => {
      try {
        const got = await lookUpSite(next.url, ctl.signal);
        const final = got.ok ? await resolveLogo(got.meta, ctl.signal)
          // An address that can't be a public website won't have one later either: noted, not asked again.
          : ['blocked', 'no-such-host', 'bad-url'].includes(got.code) ? { square: null, wide: null, palette: null, checkedAt: new Date().toISOString() } : null;
        if (final) {
          onChange(c => {
            const now = websitesOf(c).find(s => s.id === next.id);
            return now && now.logo === null && now.url === next.url ? updateWebsite(c, now.id, { logo: final }) : c ?? [];
          });
        }
      } catch { /* left for another time */ } finally {
        if (!ctl.signal.aborted) setFinding(null);
      }
    })();
  }, [sites, finding, online, onChange]);

  const current = open && open.kind !== 'arrange' && open.id ? sites.find(s => s.id === open.id) ?? null : null;
  const clearAll = () => { setQuery(''); set({ filter: 'all' }); };
  const queryUrl = query.includes('.') ? normalizeUrl(query) : null;

  return (
    <>
    <div className="ik-scroll ws-scroll" ref={scroller}>
      <section className="ws" aria-labelledby="ws-title">
        <div className="ws-top">
          <div className="ws-top-copy">
            <div className="ws-eyebrow">Intake / Websites</div>
            <h1 id="ws-title">Your essential web.</h1>
            <p className="ws-subtitle">The sources you trust, beautifully organized and always within reach.</p>
          </div>
          <div className="ws-tools">
            <label className="ws-search">
              <IcSearch />
              <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Quick find a source…" aria-label="Search your websites" enterKeyHint="search" />
            </label>
            <button type="button" className="ws-btn is-primary" onClick={() => setOpen({ kind: 'edit', id: null })}><IcPlus /> Add website</button>
          </div>
        </div>

        {sites.length === 0 ? (
          <div className="ws-welcome">
            <h2>Your essential web starts here.</h2>
            <p>Save the websites you come back to: paste an address and ROUTINE finds its name, description and logo. Pin the ones you open most; they wait at the top, one tap away.</p>
            <button type="button" className="ws-btn is-primary" onClick={() => setOpen({ kind: 'edit', id: null })}><IcPlus /> Add your first website</button>
          </div>
        ) : (
          <>
            <div className="ws-sectionbar ws-pin-head">
              <h2>Pinned &amp; ready</h2>
              <span className="ws-sectionbar-end">
                <span className="ws-count">{pinned.length} pinned · quick launch</span>
                <button type="button" className="ws-btn is-small" onClick={() => setOpen({ kind: 'arrange' })}><IcSort /> Arrange</button>
              </span>
            </div>
            <div className="ws-pins">
              {pinned.map(s => <PinnedTile key={s.id} site={s} />)}
              {pinned.length < 4 && !query && (
                <button type="button" className="ws-pin-blank" onClick={() => setOpen({ kind: 'arrange' })}>
                  <span className="ws-pin-blank-plus" aria-hidden="true">＋</span>
                  {pinned.length ? 'Pin another website' : 'Pin the websites you open most'}
                </button>
              )}
              {pinned.length === 0 && query && <p className="ws-quiet">No pinned website matches “{query}”.</p>}
            </div>

            <div className="ws-browse-head">
              <div>
                <div className="ws-eyebrow">Your source collection</div>
                <h2>Browse by topic<span className="ws-dot">.</span></h2>
                <p>All your websites, grouped by the subjects that matter to you.</p>
              </div>
              <div className="ws-mode-wrap">
                <span className="ws-mode-hint">Layout for all topics</span>
                <div className="ws-mode" role="group" aria-label="Layout for all topics">
                  <button type="button" aria-pressed={prefs.view === 'list'} className={prefs.view === 'list' ? 'is-on' : ''} onClick={() => set({ view: 'list' })}><IcList /><span>List</span></button>
                  <button type="button" aria-pressed={prefs.view === 'bento'} className={prefs.view === 'bento' ? 'is-on' : ''} onClick={() => set({ view: 'bento' })}><IcGrid /><span>Bento</span></button>
                </div>
              </div>
            </div>

            <div className="ws-filters" role="group" aria-label="Show">
              <button type="button" className={`ws-pill${filter === 'all' ? ' is-on' : ''}`} aria-pressed={filter === 'all'} onClick={() => set({ filter: 'all' })}>All <em>{sites.length}</em></button>
              <button type="button" className={`ws-pill${filter === 'pinned' ? ' is-on' : ''}`} aria-pressed={filter === 'pinned'} onClick={() => set({ filter: filter === 'pinned' ? 'all' : 'pinned' })}>★ Pinned <em>{sites.filter(s => s.pinned).length}</em></button>
              {topics.filter(t => t.count > 0).map(t => (
                <button key={t.name} type="button" className={`ws-pill${filter === `topic:${t.name}` ? ' is-on' : ''}`} aria-pressed={filter === `topic:${t.name}`} onClick={() => set({ filter: filter === `topic:${t.name}` ? 'all' : `topic:${t.name}` })}>{t.name} <em>{t.count}</em></button>
              ))}
            </div>

            {groups.length === 0 && (
              <div className="ws-empty">
                <p>No websites match {query ? <>“{query}”</> : 'this view'}{filter !== 'all' ? ' in this filter' : ''}.</p>
                <div className="ws-actions is-center">
                  <button type="button" className="ws-btn is-small" onClick={clearAll}>Clear search and filters</button>
                  {queryUrl && <button type="button" className="ws-btn is-small is-primary" onClick={() => { setOpen({ kind: 'edit', id: null, url: query }); }}><IcPlus /> Add {domainOf(queryUrl)}</button>}
                </div>
              </div>
            )}

            {groups.map(g => (
              <section key={g.name} className="ws-group" aria-labelledby={`ws-g-${g.name}`}>
                <div className="ws-sectionbar">
                  <h2 id={`ws-g-${g.name}`}>{g.name}</h2>
                  <span className="ws-count">{g.sites.length} {g.sites.length === 1 ? 'source' : 'sources'}</span>
                </div>
                <div className={`ws-links is-${prefs.view}`}>
                  {g.sites.map(s => prefs.view === 'list'
                    ? <ListRow key={s.id} site={s} onDetails={id => setOpen({ kind: 'details', id })} onPin={togglePin} />
                    : <BentoCard key={s.id} site={s} onDetails={id => setOpen({ kind: 'details', id })} onPin={togglePin} />)}
                </div>
              </section>
            ))}

            <div className="ws-endnote"><span>{inView.length} {inView.length === 1 ? 'source' : 'sources'} in this view</span><span>Made to be revisited, not just saved.</span></div>
          </>
        )}
      </section>
    </div>

      {open?.kind === 'details' && current && (
        <DetailsSheet site={current} onClose={() => setOpen(null)} onEdit={() => setOpen({ kind: 'edit', id: current.id })} onPin={togglePin} onDelete={remove} />
      )}
      {open?.kind === 'edit' && (open.id === null || current) && (
        <EditSheet
          sites={sites}
          editing={open.id ? current : null}
          startUrl={open.url}
          onSave={save}
          onClose={() => setOpen(open.id ? { kind: 'details', id: open.id } : null)}
          onShow={id => setOpen({ kind: 'details', id })}
        />
      )}
      {open?.kind === 'arrange' && <ArrangeSheet sites={sites} onMove={move} onPin={togglePin} onClose={() => setOpen(null)} />}
      <div className="ws-toast" role="status" aria-live="polite">{toast && <span key={toast.key}>{toast.text}</span>}</div>
    </>
  );
}
