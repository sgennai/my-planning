// The note editor and the panel's reading notes (Phase 3), drawn for useReaderNotes (ReaderNotes.tsx).
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { cleanNote, type Annotation, type Placed } from './annotations';
import { readDraft, writeDraft } from './drafts';
import { Icon } from './ReaderParts';

/** Your notes are plain text, up to this long. */
const NOTE_MAX = 4000;
const short = (s: string, n = 70) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };

export interface Laid extends Placed { range: Range }
export type Missing = 'gone' | 'ambiguous';
export type Selected = { start: number; end: number; keyboard: boolean };
export type Editing = {
  mode: 'note' | 'takeaway';
  /** The highlight or article note it is for; null when made on saving (a new passage, a new article note). */
  id: string | null;
  /** The words selected, for a passage made on saving. */
  sel: { start: number; end: number } | null;
  /** A note on the whole article (no passage). */
  article: boolean;
  quote: string | null;
  initial: string;
  draftKey: string;
  canDelete: boolean;
  /** Where the focus goes back to. */
  from: HTMLElement | null;
};


// ── The editor: a note, or the insight beside a takeaway ───────────────────
export function NoteEditor({ editing: e, onSave, onDelete, onClose }: { editing: Editing; onSave: (text: string) => void; onDelete: () => void; onClose: () => void }) {
  const box = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const fieldId = useId();
  const [restored] = useState(() => { const d = readDraft(e.draftKey); return d !== null && d !== e.initial ? d : null; });
  const [text, setText] = useState(restored ?? e.initial);
  const [ask, setAsk] = useState<'discard' | 'delete' | null>(null);
  const dirty = cleanNote(text) !== cleanNote(e.initial);
  useEffect(() => {
    const d = box.current;
    if (!d) return;
    d.showModal();
    const f = field.current;
    if (f) { f.focus({ preventScroll: true }); f.setSelectionRange(f.value.length, f.value.length); }
    const from = e.from;
    return () => {
      if (d.open) d.close();
      // Back where it was opened from, or to the article when that was the selection's bar, now gone.
      if (from?.isConnected) from.focus({ preventScroll: true });
      else document.querySelector<HTMLElement>('.ikr-essay')?.focus({ preventScroll: true });
    };
    // Once, when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => writeDraft(e.draftKey, dirty ? text : null), 250);
    return () => window.clearTimeout(t);
  }, [text, dirty, e.draftKey]);
  const close = () => { writeDraft(e.draftKey, null); onClose(); };
  const cancel = () => { if (dirty) setAsk('discard'); else close(); };
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (e.mode === 'note' && !text.trim()) return;
    writeDraft(e.draftKey, null);
    onSave(text);
  };
  const takeaway = e.mode === 'takeaway';
  const title = takeaway ? 'Save to Takeaways' : e.article ? (e.id ? 'Your note on the article' : 'A note on the whole article') : e.id && e.initial ? 'Your note' : 'Add a note';
  return (
    <dialog
      ref={box} className="ikr-editor" aria-labelledby={titleId}
      onCancel={ev => { ev.preventDefault(); cancel(); }}
      onClick={ev => { if (ev.target === ev.currentTarget && !dirty) close(); }}
    >
      <form className="ikr-editor-box" onSubmit={submit}>
        <h2 className="ikr-editor-title" id={titleId}>{title}</h2>
        {e.quote && <blockquote className={`ikr-editor-quote${takeaway && e.article ? ' is-title' : ''}`}>{e.quote}</blockquote>}
        <label className="ikr-editor-label" htmlFor={fieldId}>{takeaway ? 'Your insight (optional)' : 'Your note'}</label>
        <textarea
          id={fieldId} ref={field} value={text} rows={5} maxLength={NOTE_MAX}
          onChange={ev => { setText(ev.target.value); setAsk(null); }}
          placeholder={takeaway ? 'Why it matters, in your words' : undefined}
        />
        {restored && <p className="ikr-editor-hint">What you were writing here was kept on this device.</p>}
        {takeaway && <p className="ikr-editor-hint">Saved in Takeaways with the article’s title, source and the way back here.</p>}
        {ask ? (
          <div className="ikr-editor-ask" role="group" aria-label={ask === 'discard' ? 'Discard your changes?' : 'Delete this note?'}>
            <p>{ask === 'discard' ? 'Discard what you changed?' : e.article ? 'Delete this note on the article?' : 'Delete this note? The highlight stays.'}</p>
            <div className="ikr-editor-actions">
              <button type="button" className="ikr-button" onClick={() => setAsk(null)}>{ask === 'discard' ? 'Keep writing' : 'Keep'}</button>
              <button type="button" className="ikr-button is-danger" onClick={ask === 'discard' ? close : () => { writeDraft(e.draftKey, null); onDelete(); }}>{ask === 'discard' ? 'Discard' : 'Delete note'}</button>
            </div>
          </div>
        ) : (
          <div className="ikr-editor-actions">
            {e.canDelete && <button type="button" className="ikr-editor-quiet" onClick={() => setAsk('delete')}>Delete note</button>}
            <span className="ikr-editor-gap" />
            <button type="button" className="ikr-button" onClick={cancel}>Cancel</button>
            <button type="submit" className="ikr-button is-primary" disabled={!takeaway && !text.trim()}>{takeaway ? 'Save to Takeaways' : 'Save note'}</button>
          </div>
        )}
      </form>
    </dialog>
  );
}

// ── In the panel: your reading notes, then keep what matters ───────────────
const LONG_QUOTE = 220;

export function ReadingNotes(p: {
  annotations: Annotation[];
  laid: { placed: Laid[]; missing: Map<string, Missing> };
  inTakeaways: (a: Annotation) => boolean;
  canSave: boolean;
  onGo: (id: string) => void;
  onEdit: (a: Annotation, from: HTMLElement) => void;
  onTakeaway: (a: Annotation, from: HTMLElement) => void;
  onRemove: (a: Annotation) => void;
  onArticleNote: (from: HTMLElement) => void;
  onSaveSelection: (from: HTMLElement) => void;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [whole, setWhole] = useState<Set<string>>(new Set());
  // In the article's order: where each stands now, else where it was kept.
  const at = new Map(p.laid.placed.map(x => [x.a.id, x.start]));
  const notes = p.annotations.filter(a => a.kind === 'article');
  const passages = p.annotations.filter(a => a.kind === 'passage')
    .sort((a, b) => (at.get(a.id) ?? a.anchor!.start) - (at.get(b.id) ?? b.anchor!.start));
  const items = [...notes, ...passages];

  const entry = (a: Annotation): ReactNode => {
    const missing = a.kind === 'passage' && !at.has(a.id);
    const quote = a.anchor?.quote ?? '';
    const long = quote.length > LONG_QUOTE;
    const open = whole.has(a.id);
    const tk = p.inTakeaways(a);
    return (
      <li key={a.id} className={`ikr-note${missing ? ' is-missing' : ''}`}>
        {a.kind === 'article'
          ? <p className="ikr-note-kind">On the whole article</p>
          : missing
            ? <p className="ikr-note-quote">{quote}</p>
            : (
              <button type="button" className="ikr-note-go" onClick={() => p.onGo(a.id)}>
                <span className="ik-vh">Go to the passage: </span>
                <span className={`ikr-note-quote${long && !open ? ' is-clamped' : ''}`}>{quote}</span>
              </button>
            )}
        {long && a.kind === 'passage' && (
          <button type="button" className="ikr-note-link" aria-expanded={open} onClick={() => setWhole(s => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })}>
            {open ? 'Show less' : 'Show all of it'}
          </button>
        )}
        {missing && <p className="ikr-note-flag">Passage unavailable: it can’t be found in this version of the article. Its words and your note are kept.</p>}
        {a.note && <p className="ikr-note-text">{a.note}</p>}
        {asking === a.id ? (
          <div className="ikr-note-ask" role="group" aria-label="Confirm">
            <p>{a.kind === 'article' ? 'Delete this note?' : a.note ? 'Remove the highlight and its note?' : 'Remove this highlight?'}{tk ? ' Its takeaway stays in Takeaways.' : ''}</p>
            <div className="ikr-note-actions">
              <button type="button" onClick={() => setAsking(null)}>Keep</button>
              <button type="button" className="is-danger" onClick={() => { setAsking(null); setMenu(null); p.onRemove(a); }}>{a.kind === 'article' ? 'Delete' : 'Remove'}</button>
            </div>
          </div>
        ) : (
          <div className="ikr-note-meta">
            {tk ? <span className="ikr-note-tk"><Icon name="takeaway" />In Takeaways</span> : <span />}
            <button type="button" className="ikr-note-more" aria-expanded={menu === a.id} onClick={() => setMenu(m => (m === a.id ? null : a.id))} aria-label={`${menu === a.id ? 'Close the actions' : 'More actions'}: ${a.kind === 'article' ? 'note on the article' : short(quote, 40)}`}>
              {menu === a.id ? 'Close' : 'More'}
            </button>
          </div>
        )}
        {menu === a.id && asking !== a.id && (
          <div className="ikr-note-actions">
            <button type="button" onClick={e => p.onEdit(a, e.currentTarget)}>{a.note ? 'Edit note' : 'Add note'}</button>
            {!tk && <button type="button" onClick={e => p.onTakeaway(a, e.currentTarget)}>Save to Takeaways</button>}
            <button type="button" onClick={() => setAsking(a.id)}>{a.kind === 'article' ? 'Delete note' : 'Remove'}</button>
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      <section className="ikr-card ikr-notes" aria-labelledby="ikr-card-notes">
        <h2 className="ikr-card-title" id="ikr-card-notes">Your reading notes</h2>
        {items.length
          ? <ol className="ikr-notes-list">{items.map(entry)}</ol>
          : <p className="ikr-card-text">Nothing highlighted yet. Select a sentence in the article, then choose Highlight, Add note or Save to Takeaways.</p>}
        <button type="button" className="ikr-rail-cta" onClick={e => p.onArticleNote(e.currentTarget)}>+ A note on the whole article</button>
      </section>
      <section className="ikr-card" aria-labelledby="ikr-card-keep">
        <h2 className="ikr-card-title" id="ikr-card-keep">Keep what matters</h2>
        <p className="ikr-card-text">Save a passage worth keeping to Takeaways, with your own words beside it if you like. Only what you choose is saved.</p>
        <button
          type="button" className="ikr-rail-cta" disabled={!p.canSave}
          onMouseDown={e => e.preventDefault()} onClick={e => p.onSaveSelection(e.currentTarget)}
        >+ Save a takeaway</button>
        {!p.canSave && <p className="ikr-card-hint">Select a passage in the article first.</p>}
      </section>
    </>
  );
}
