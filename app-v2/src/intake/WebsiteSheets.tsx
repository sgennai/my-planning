// Intake › Websites: the sheets. Each is a modal <dialog> near the top of the screen (in the top layer, over the
// app's pill; the keyboard below leaves it in view), closed by its own button, Escape or a tap beside it.
// - Details: the website, its topic, tags and your note; Pin, Edit, Delete (asked in the sheet), Open website.
// - Add / Edit: paste an address and its name, description and logo are looked up (you can change all but the
//   logo; a look-up that fails never stops you saving); topic, tags, note, pinned. A website already in the
//   library at the same address is named, with a way to it, and not saved twice. Leaving with changes asks.
// - Arrange: the order of Pinned & ready (up and down, one step at a time), unpinning, and pinning others.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  categoriesOf, domainOf, findDuplicate, matchesQuery, normalizeUrl, pinnedOf, tagsFrom, byName,
  type Website, type WebsiteInput, type WebsiteLogo,
} from './websites';
import { lookUpSite, resolveLogo } from './site-logo';
import { IcCheck, IcClose, IcDown, IcEdit, IcOpen, IcStar, IcTrash, IcUp, SiteArt, SiteLogo } from './WebsiteParts';

function Sheet({ label, onDismiss, children, wide = false }: { label: string; onDismiss: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => { if (d?.open) d.close(); };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`ws-sheet${wide ? ' is-wide' : ''}`}
      aria-label={label}
      onCancel={e => { e.preventDefault(); onDismiss(); }}
      onClick={e => { if (e.target === e.currentTarget) onDismiss(); }}
    >
      <div className="ws-sheet-box">{children}</div>
    </dialog>
  );
}

function SheetHead({ eyebrow, title, id, onClose }: { eyebrow: string; title: string; id: string; onClose: () => void }) {
  return (
    <div className="ws-sheet-head">
      <div>
        <span className="ws-eyebrow">{eyebrow}</span>
        <h2 id={id}>{title}</h2>
      </div>
      <button type="button" className="ws-btn is-icon" onClick={onClose} aria-label="Close"><IcClose /></button>
    </div>
  );
}

// ── Details ────────────────────────────────────────────────────────────────

interface DetailsProps {
  site: Website;
  onClose: () => void;
  onEdit: () => void;
  onPin: (site: Website) => void;
  onDelete: (site: Website) => void;
}

export function DetailsSheet({ site, onClose, onEdit, onPin, onDelete }: DetailsProps) {
  const [asking, setAsking] = useState(false);
  return (
    <Sheet label={site.name} onDismiss={onClose}>
      <SheetHead eyebrow="Website · your collection" title={site.name} id="ws-details-title" onClose={onClose} />
      <SiteArt site={site} className="is-sheet">
        <span className="ws-card-logo"><SiteLogo site={site} shape="plate" /></span>
      </SiteArt>
      <p className="ws-domainline">{domainOf(site.url)} · {site.category}</p>
      {site.description ? <p className="ws-sheet-text">{site.description}</p> : <p className="ws-sheet-text is-none">No description yet.</p>}
      {site.tags.length > 0 && (
        <>
          <div className="ws-label">Tags</div>
          <div className="ws-tags">{site.tags.map(t => <span key={t}>{t}</span>)}</div>
        </>
      )}
      <div className="ws-label">Why I saved it</div>
      <p className={`ws-note${site.note ? '' : ' is-none'}`}>{site.note || 'No note yet: add one with Edit.'}</p>
      {asking ? (
        <div className="ws-ask" role="alert">
          <p>Delete “{site.name}” from your websites? It goes from all your devices.</p>
          <div className="ws-actions">
            <button type="button" className="ws-btn" onClick={() => setAsking(false)}>Cancel</button>
            <button type="button" className="ws-btn is-danger" onClick={() => onDelete(site)}>Delete website</button>
          </div>
        </div>
      ) : (
        <div className="ws-actions is-split">
          <div className="ws-actions">
            <button type="button" className={`ws-btn is-icon${site.pinned ? ' is-pinned' : ''}`} aria-pressed={site.pinned} onClick={() => onPin(site)} aria-label={site.pinned ? 'Unpin' : 'Pin to Pinned & ready'} title={site.pinned ? 'Unpin' : 'Pin'}><IcStar /></button>
            <button type="button" className="ws-btn is-icon" onClick={onEdit} aria-label="Edit" title="Edit"><IcEdit /></button>
            <button type="button" className="ws-btn is-icon" onClick={() => setAsking(true)} aria-label="Delete" title="Delete"><IcTrash /></button>
          </div>
          <a className="ws-btn is-primary" href={site.url} target="_blank" rel="noopener noreferrer">Open website <IcOpen /></a>
        </div>
      )}
    </Sheet>
  );
}

// ── Add / Edit ─────────────────────────────────────────────────────────────

const NEW_TOPIC = '\u0000new';

interface EditProps {
  sites: Website[];
  editing: Website | null;
  /** The address to start with (pasted into the search, say). */
  startUrl?: string;
  onSave: (input: WebsiteInput, id: string | null) => void;
  onClose: () => void;
  onShow: (id: string) => void;
}

type Look = { phase: 'idle' } | { phase: 'looking'; what: 'details' | 'logo' } | { phase: 'done'; read: boolean } | { phase: 'failed'; message: string };

export function EditSheet({ sites, editing, startUrl = '', onSave, onClose, onShow }: EditProps) {
  const start = useMemo(() => ({
    url: editing?.url ?? startUrl,
    name: editing?.name ?? '',
    description: editing?.description ?? '',
    category: editing?.category ?? categoriesOf(sites)[0].name,
    tags: editing?.tags.join(', ') ?? '',
    note: editing?.note ?? '',
    pinned: editing?.pinned ?? false,
  }), [editing, sites, startUrl]);
  const [f, setF] = useState(start);
  const [newTopic, setNewTopic] = useState('');
  // The logo found, and the address it was found for: kept only for that address.
  const [found, setFound] = useState<{ logo: WebsiteLogo | null; for: string | null }>({ logo: editing?.logo ?? null, for: editing ? normalizeUrl(editing.url) : null });
  const [look, setLook] = useState<Look>({ phase: 'idle' });
  const touched = useRef({ name: !!editing, description: !!editing });
  const looked = useRef<string | null>(editing ? normalizeUrl(editing.url) : null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const url = normalizeUrl(f.url);
  const duplicate = url ? findDuplicate(sites, url, editing?.id) : undefined;
  const topics = categoriesOf(sites);
  const category = f.category === NEW_TOPIC ? newTopic.trim() : f.category;
  const logo = url && found.for === url ? found.logo : null;
  const dirty = JSON.stringify(f) !== JSON.stringify(start) || found.logo !== (editing?.logo ?? null) || newTopic !== '';
  const set = (patch: Partial<typeof f>) => setF(prev => ({ ...prev, ...patch }));

  /** The site's details and logo, for this address; the name and description only where you haven't written your own. */
  // The address in the field now (kept as it is typed): a look-up's answer is used only while it is still the
  // address it was asked for.
  const current = useRef(url);
  const stale = (ctl: AbortController, address: string) => ctl.signal.aborted || current.current !== address;

  const lookUp = async (address: string, logoOnly = false) => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    looked.current = address;
    setLook({ phase: 'looking', what: logoOnly ? 'logo' : 'details' });
    try {
      const got = await lookUpSite(address, ctl.signal);
      if (stale(ctl, address)) return;
      if (!got.ok) { setLook({ phase: 'failed', message: got.message }); return; }
      if (!logoOnly) {
        setF(prev => ({
          ...prev,
          name: touched.current.name && prev.name.trim() ? prev.name : (got.meta.name ?? domainOf(got.meta.url)),
          description: touched.current.description && prev.description.trim() ? prev.description : (got.meta.description ?? prev.description),
        }));
      }
      setLook({ phase: 'looking', what: 'logo' });
      const got2 = await resolveLogo(got.meta, ctl.signal);
      if (stale(ctl, address)) return;
      setFound({ logo: got2, for: address });
      setLook({ phase: 'done', read: got.meta.read });
    } catch {
      if (!stale(ctl, address)) setLook({ phase: 'failed', message: "Couldn't look up that website." });
    }
  };

  // Another address typed: a look-up still under way for the one before is dropped at once, before its answer.
  const changeUrl = (text: string) => {
    const next = normalizeUrl(text);
    current.current = next;
    if (next !== looked.current) {
      abort.current?.abort();
      looked.current = null;
      setLook({ phase: 'idle' });
    }
    set({ url: text });
  };

  // A new address is looked up once it has rested for a moment (typing, or a paste).
  useEffect(() => {
    if (!url || duplicate || url === looked.current) return;
    const t = window.setTimeout(() => void lookUp(url), 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- looked up again only for a new address
  }, [url, duplicate]);

  const dismiss = () => {
    if (dirty && !window.confirm(editing ? `Discard your changes to “${editing.name}”?` : 'Discard this website?')) return;
    onClose();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!url || duplicate || !category) return;
    onSave({
      url,
      name: f.name.trim() || domainOf(url),
      description: f.description,
      category,
      tags: tagsFrom(f.tags),
      note: f.note,
      pinned: f.pinned,
      // Not found yet (still looking, or offline): left for the library to find later.
      logo,
    }, editing?.id ?? null);
  };
  const preview: Website | null = url ? {
    ...(editing ?? { id: 'ws:preview', type: 'intake-website', v: 1, pinRank: 0, createdAt: '', editedAt: '', stamps: {} }),
    url, name: f.name.trim() || domainOf(url), description: f.description, category: category || '', tags: [], note: '', pinned: f.pinned,
    logo,
  } as Website : null;

  const status = look.phase === 'looking'
    ? (look.what === 'details' ? 'Looking up this website…' : 'Finding its logo…')
    : look.phase === 'failed'
      ? `${look.message} You can fill in the details yourself.`
      : look.phase === 'done'
        ? (preview?.logo?.square || preview?.logo?.wide ? (look.read ? 'Details and logo found.' : 'Logo found. The site didn’t share its details: fill them in.') : (look.read ? 'Details found; no logo, so its initials will stand in.' : 'The site didn’t answer the look-up: fill in the details; its initials will stand in for a logo.'))
        : '';

  return (
    <Sheet label={editing ? `Edit ${editing.name}` : 'Add a website'} onDismiss={dismiss}>
      <SheetHead eyebrow="Your website collection" title={editing ? 'Edit website' : 'Add a website'} id="ws-edit-title" onClose={dismiss} />
      <form className="ws-form" onSubmit={submit} noValidate>
        <label htmlFor="ws-url">Website address</label>
        <input
          id="ws-url" name="url" type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="url"
          placeholder="https://example.com" value={f.url} onChange={e => changeUrl(e.target.value)} autoFocus={!editing} required
          aria-invalid={f.url.trim() !== '' && !url} aria-describedby="ws-url-status"
        />
        <div id="ws-url-status" className="ws-status" aria-live="polite">
          {f.url.trim() !== '' && !url && <span className="is-warn">That isn’t a web address: it starts with https:// or a name like example.com.</span>}
          {duplicate && (
            <span className="is-warn">Already in your websites as “{duplicate.name}”. <button type="button" className="ws-link" onClick={() => onShow(duplicate.id)}>Show it</button></span>
          )}
          {url && !duplicate && status && <span className={look.phase === 'failed' ? 'is-warn' : ''}>{status}</span>}
        </div>
        {preview && !duplicate && (
          <div className="ws-preview">
            <SiteLogo site={preview} shape="square" />
            <SiteLogo site={preview} shape="plate" />
            {editing && (
              <button type="button" className="ws-btn is-small" onClick={() => void lookUp(url!, true)} disabled={look.phase === 'looking'}>Find logo again</button>
            )}
          </div>
        )}
        <label htmlFor="ws-name">Name</label>
        <input id="ws-name" name="name" value={f.name} placeholder={url ? domainOf(url) : 'Website name'} onChange={e => { touched.current.name = true; set({ name: e.target.value }); }} />
        <label htmlFor="ws-desc">Short description</label>
        <textarea id="ws-desc" name="description" value={f.description} placeholder="What this site is good for" onChange={e => { touched.current.description = true; set({ description: e.target.value }); }} />
        <label htmlFor="ws-cat">Topic</label>
        <select id="ws-cat" name="category" value={f.category} onChange={e => set({ category: e.target.value })}>
          {topics.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
          <option value={NEW_TOPIC}>New topic…</option>
        </select>
        {f.category === NEW_TOPIC && (
          <input aria-label="New topic name" placeholder="New topic name" value={newTopic} onChange={e => setNewTopic(e.target.value)} autoFocus />
        )}
        <label htmlFor="ws-tags">Tags <small>(separated by commas)</small></label>
        <input id="ws-tags" name="tags" value={f.tags} placeholder="AI, research, leadership" onChange={e => set({ tags: e.target.value })} autoCapitalize="off" />
        <label htmlFor="ws-note">Private note</label>
        <textarea id="ws-note" name="note" value={f.note} placeholder="Why this one is worth keeping" onChange={e => set({ note: e.target.value })} />
        <label className="ws-check">
          <input type="checkbox" checked={f.pinned} onChange={e => set({ pinned: e.target.checked })} />
          <span>Pin to Pinned & ready</span>
        </label>
        <div className="ws-actions is-end">
          <button type="button" className="ws-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="ws-btn is-primary" disabled={!url || !!duplicate || !category}>{editing ? 'Save changes' : 'Save website'} <IcCheck /></button>
        </div>
      </form>
    </Sheet>
  );
}

// ── Arrange Pinned & ready ─────────────────────────────────────────────────

interface ArrangeProps {
  sites: Website[];
  onMove: (id: string, to: number) => void;
  onPin: (site: Website) => void;
  onClose: () => void;
}

export function ArrangeSheet({ sites, onMove, onPin, onClose }: ArrangeProps) {
  const [query, setQuery] = useState('');
  const pinned = pinnedOf(sites);
  const others = sites.filter(s => !s.pinned && matchesQuery(s, query)).sort(byName);
  return (
    <Sheet label="Arrange Pinned & ready" onDismiss={onClose}>
      <SheetHead eyebrow="Pinned & ready" title="Arrange your pinned websites" id="ws-arrange-title" onClose={onClose} />
      {pinned.length === 0 && <p className="ws-sheet-text is-none">Nothing pinned yet. Pin the websites you open most: they wait at the top, one tap away.</p>}
      <ol className="ws-arrange" aria-label="Pinned, in order">
        {pinned.map((s, i) => (
          <li key={s.id} className="ws-arrange-row">
            <SiteLogo site={s} shape="square" />
            <span className="ws-arrange-name"><strong>{s.name}</strong><small>{domainOf(s.url)}</small></span>
            <span className="ws-arrange-ctl">
              <button type="button" className="ws-btn is-icon" disabled={i === 0} onClick={() => onMove(s.id, i - 1)} aria-label={`Move ${s.name} earlier`}><IcUp /></button>
              <button type="button" className="ws-btn is-icon" disabled={i === pinned.length - 1} onClick={() => onMove(s.id, i + 1)} aria-label={`Move ${s.name} later`}><IcDown /></button>
              <button type="button" className="ws-btn is-small" onClick={() => onPin(s)} aria-label={`Unpin ${s.name}`}>Unpin</button>
            </span>
          </li>
        ))}
      </ol>
      {sites.some(s => !s.pinned) && (
        <>
          <div className="ws-label">Pin another website</div>
          {sites.length - pinned.length > 6 && (
            <input className="ws-arrange-find" type="search" placeholder="Find a website" aria-label="Find a website to pin" value={query} onChange={e => setQuery(e.target.value)} />
          )}
          <ul className="ws-arrange" aria-label="Not pinned">
            {others.map(s => (
              <li key={s.id} className="ws-arrange-row">
                <SiteLogo site={s} shape="square" />
                <span className="ws-arrange-name"><strong>{s.name}</strong><small>{domainOf(s.url)}</small></span>
                <button type="button" className="ws-btn is-small" onClick={() => onPin(s)} aria-label={`Pin ${s.name}`}><IcStar /> Pin</button>
              </li>
            ))}
            {others.length === 0 && <li className="ws-sheet-text is-none">No website matches “{query}”.</li>}
          </ul>
        </>
      )}
      <div className="ws-actions is-end">
        <button type="button" className="ws-btn is-primary" onClick={onClose}>Done</button>
      </div>
    </Sheet>
  );
}
