// Active Reading's highlights, notes and takeaways (Intake 2.0 Phase 3): read, select, highlight or note, review,
// save to Takeaways. What the reader adds to the article and to its panel:
// - a small bar by the words you select, once the selection is still (a finger has let go and the handles
//   rest; a mouse let go; Shift and the arrows paused): Highlight, Add note, Save to Takeaways. Its words are
//   taken as you made it, before the bar is touched (a tap there can clear the selection on iOS first), and
//   nothing is highlighted until you choose. It sits below the words on a touch screen (where iOS keeps its
//   own menu above them), above them with a mouse, on the other side when there is no room, and at the
//   foot of the reading area when neither has room. The browser's own selection is untouched: its handles,
//   its Copy and Share, scrolling.
// - a tap on the words of a highlight: the same bar for it (its note, Takeaways, Remove, which asks first);
// - a small editor for a note (yours, plain text; what you were writing kept on this device until you save
//   or discard it), or for the insight to save beside a takeaway;
// - in the panel: how many highlights, notes and takeaways, then Your reading notes in the article's order
//   (a note on the whole article first), each going back to its passage, then Keep what matters.
// Highlights are drawn by highlights.ts and found again by anchor.ts. Nothing here moves your reading place:
// going to a passage is not reading (`showPassage`, in ArticleReader).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from 'react';
import { anchorAt, indexText, offsetsOf, quoteText, rangeAt, resolve, type PassageAnchor, type TextIndex } from './anchor';
import {
  annotationsOf, cleanNote, countsOf, newArticleNote, newPassage, planHighlight, summaryOf, withAnnotation,
  withNote, withoutAnnotation, withTakeaway, type Annotation,
} from './annotations';
import { clearPaint, drawsHighlights, flash, hitAt, holdPaint, paint, unwrap, type Painted } from './highlights';
import { saveArticleInsight, savedOf, takeawayOf } from '../intelligence/saved';
import { authorOf, titleOf, type Article } from './articles';
import { dayKeyOf } from '../routine/dates';
import { Icon } from './ReaderParts';
import { NoteEditor, ReadingNotes, type Editing, type Laid, type Missing, type Selected } from './NotesParts';

export type ContentChange = (change: (content: unknown[] | undefined) => unknown[]) => void;

/** Where to go when the reader opens from a takeaway: its highlight, or its own copy of the passage. */
export interface JumpTarget {
  bookmarkId: number;
  annotationId: string | null;
  anchor: PassageAnchor | null;
  /** A new one each time, so the same passage can be asked for again. */
  key: number;
}

interface Options {
  article: Article;
  content: unknown[] | undefined;
  change: ContentChange;
  bodyRef: RefObject<HTMLElement | null>;
  scrollRef: RefObject<HTMLElement | null>;
  stageRef: RefObject<HTMLElement | null>;
  chromeRef: RefObject<HTMLElement | null>;
  /** The article's HTML as drawn (a new one when it is drawn again); null before. */
  drawn: unknown;
  overlay: boolean;
  closeSheet: () => void;
  /** Puts a passage just below the bar, which is not reading it. */
  showPassage: (range: Range) => void;
  jump: JumpTarget | null;
  onJumped: () => void;
}

/** A finger's selection is still once the handles have rested this long; a mouse's or the keys', this. */
const STILL_TOUCH_MS = 450;
const STILL_MS = 250;
/** The bar stays this long after the selection goes: on iOS a tap on it clears the selection first. */
const LINGER_MS = 700;

const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** The heading a passage sits under, if the article has headings. */
function headingBefore(root: Element, range: Range): string | null {
  let found: string | null = null;
  for (const h of root.querySelectorAll('h2, h3')) {
    if (range.comparePoint(h, 0) > 0) break;
    found = (h.textContent ?? '').replace(/\s+/g, ' ').trim() || found;
  }
  return found;
}

export function useReaderNotes(o: Options) {
  const { article, content, change, bodyRef, scrollRef, stageRef, chromeRef, drawn } = o;
  const id = article.id;
  const annotations = useMemo(() => annotationsOf(content, id), [content, id]);
  const saved = useMemo(() => savedOf(content), [content]);
  const inTakeaways = useCallback((a: Annotation) => !!takeawayOf(saved, a.id, a.takeawayId), [saved]);

  const ix = useRef<TextIndex | null>(null);
  const painted = useRef<Painted[]>([]);
  const [laid, setLaid] = useState<{ placed: Laid[]; missing: Map<string, Missing>; at: number }>({ placed: [], missing: new Map(), at: 0 });
  const [selected, setSelected] = useState<Selected | null>(null);
  const [tapped, setTapped] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const toastTimer = useRef(0);
  const say = useCallback((text: string, ms = 2400) => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, key: Date.now() });
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // ── Drawing: every passage found again in this text, and drawn ────────────
  useLayoutEffect(() => {
    const root = bodyRef.current;
    if (!drawn || !root) return;
    unwrap(root);
    let index = indexText(root);
    const found: Laid[] = [];
    const missing = new Map<string, Missing>();
    for (const a of annotations) {
      if (a.kind !== 'passage' || !a.anchor) continue;
      const f = resolve(index, a.anchor);
      const range = 'missing' in f ? null : rangeAt(index, f.start, f.end);
      if ('missing' in f || !range) { missing.set(a.id, 'missing' in f ? f.missing : 'gone'); continue; }
      found.push({ a, start: f.start, end: f.end, range });
    }
    const drawnNow = paint(root, found.map(p => ({ id: p.a.id, range: p.range, noted: !!p.a.note })));
    if (!drawsHighlights()) {
      // Spans split the text nodes: the same text, read again, and each range over its own spans.
      index = indexText(root);
      const byId = new Map(drawnNow.map(d => [d.id, d.range]));
      for (const p of found) p.range = byId.get(p.a.id) ?? p.range;
    }
    ix.current = index;
    painted.current = drawnNow;
    setLaid({ placed: found, missing, at: Date.now() });
  }, [drawn, annotations, bodyRef]);
  useEffect(() => () => clearPaint(null), []);
  // None drawn while the editor is open: WebKit would draw them on its title (see holdPaint).
  const editorOpen = !!editing;
  useLayoutEffect(() => (editorOpen ? holdPaint() : undefined), [editorOpen]);

  // ── Your selection, once it is still ──────────────────────────────────────
  const selectedRef = useRef<Selected | null>(null);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => {
    const sc = scrollRef.current;
    if (!drawn || !sc) return;
    let still = 0, linger = 0;
    let down = false;
    let keyboard = false;
    const check = () => {
      const root = bodyRef.current, index = ix.current;
      const sel = document.getSelection();
      if (!root || !index || !sel || sel.isCollapsed || !sel.rangeCount) {
        window.clearTimeout(linger);
        if (selectedRef.current) linger = window.setTimeout(() => setSelected(null), LINGER_MS);
        return;
      }
      const offsets = offsetsOf(index, sel.getRangeAt(0), root);
      window.clearTimeout(linger);
      if (!offsets) { setSelected(null); return; }
      setTapped(null);
      setConfirming(null);
      setSelected(prev => (prev && prev.start === offsets.start && prev.end === offsets.end ? prev : { ...offsets, keyboard }));
    };
    const soon = (ms: number) => { window.clearTimeout(still); if (!down) still = window.setTimeout(check, ms); };
    const onChange = () => soon(coarse() ? STILL_TOUCH_MS : STILL_MS);
    const onDown = () => { down = true; keyboard = false; window.clearTimeout(still); };
    const onUp = () => { if (!down) return; down = false; soon(coarse() ? STILL_TOUCH_MS : 120); };
    const onKey = (e: KeyboardEvent) => { if (e.shiftKey || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a')) keyboard = true; };
    document.addEventListener('selectionchange', onChange);
    sc.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(still);
      window.clearTimeout(linger);
      document.removeEventListener('selectionchange', onChange);
      sc.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [drawn, bodyRef, scrollRef]);

  const placedOf = useCallback((annotationId: string) => laid.placed.find(p => p.a.id === annotationId) ?? null, [laid]);
  const tappedAt = tapped ? placedOf(tapped) : null;
  // The highlight a selection lies inside, whose bar it gets instead of a new one.
  const plan = selected ? planHighlight(laid.placed, selected.start, selected.end) : null;
  const within = plan?.kind === 'existing' ? plan.a : null;
  const current = tappedAt?.a ?? within;

  const done = useCallback(() => {
    document.getSelection()?.removeAllRanges();
    setSelected(null);
    setTapped(null);
    setConfirming(null);
  }, []);

  // ── The bar: by the words, on whichever side has room ────────────────────
  const bar = useRef<HTMLDivElement>(null);
  const targetRange = useCallback((): Range | null => {
    if (tappedAt) return tappedAt.range;
    if (selected && ix.current) return rangeAt(ix.current, selected.start, selected.end);
    return null;
  }, [tappedAt, selected]);
  const place = useCallback(() => {
    const el = bar.current, sc = scrollRef.current, stage = stageRef.current;
    if (!el || !sc || !stage) return;
    const range = targetRange();
    const rects = range ? [...range.getClientRects()].filter(r => r.width > 0.5 && r.height > 0.5) : [];
    if (!rects.length) { el.hidden = true; return; }
    const box = sc.getBoundingClientRect();
    const top0 = box.top + (chromeRef.current?.offsetHeight ?? 0) + 8;
    let bottom0 = box.bottom - 8;
    const pill = document.querySelector('.shell-nav')?.getBoundingClientRect();
    if (pill && pill.height && pill.top < bottom0 && pill.bottom > box.top && pill.left < box.right && pill.right > box.left) bottom0 = Math.min(bottom0, pill.top - 8);
    const first = rects[0], last = rects[rects.length - 1];
    if (last.bottom < top0 || first.top > bottom0) { el.hidden = true; return; }
    el.style.visibility = 'hidden';
    el.hidden = false;
    const w = el.offsetWidth, h = el.offsetHeight;
    const touch = coarse();
    const below = last.bottom + (touch ? 30 : 10);
    const above = first.top - h - (touch ? 14 : 10);
    const fitsBelow = below + h <= bottom0 && last.bottom >= top0;
    const fitsAbove = above >= top0 && first.top <= bottom0;
    const side = touch ? (fitsBelow ? 'below' : fitsAbove ? 'above' : 'foot') : (fitsAbove ? 'above' : fitsBelow ? 'below' : 'foot');
    const top = side === 'below' ? below : side === 'above' ? above : bottom0 - h;
    const line = side === 'above' ? first : last;
    const left = Math.min(Math.max((line.left + line.right) / 2 - w / 2, box.left + 8), box.right - 8 - w);
    const s = stage.getBoundingClientRect();
    el.style.left = `${Math.round(left - s.left)}px`;
    el.style.top = `${Math.round(top - s.top)}px`;
    el.dataset.side = side;
    el.style.visibility = '';
  }, [targetRange, scrollRef, stageRef, chromeRef]);
  const shown = !!(selected || tappedAt) && !editing;
  useLayoutEffect(() => { if (shown) place(); }, [shown, place, confirming, laid]);
  useEffect(() => {
    const sc = scrollRef.current;
    if (!shown || !sc) return;
    let frame = 0;
    const later = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; place(); }); };
    sc.addEventListener('scroll', later, { passive: true });
    window.addEventListener('resize', later);
    return () => { cancelAnimationFrame(frame); sc.removeEventListener('scroll', later); window.removeEventListener('resize', later); };
  }, [shown, place, scrollRef]);
  // A selection made with the keys: the bar takes the focus, so it can be reached.
  useEffect(() => {
    if (selected?.keyboard && !editing) bar.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }, [selected, editing]);
  // A tap elsewhere closes a highlight's bar; Escape closes either.
  useEffect(() => {
    if (!shown) return;
    const onDown = (e: PointerEvent) => {
      if (tapped && !bar.current?.contains(e.target as Node)) { setTapped(null); setConfirming(null); }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || editing) return;
      e.stopPropagation();
      const back = !!bar.current?.contains(document.activeElement);
      done();
      if (back) scrollRef.current?.querySelector<HTMLElement>('.ikr-essay')?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey, true); };
  }, [shown, tapped, editing, done, scrollRef]);

  /** A tap on a highlight's words opens its bar (not on a link, a picture or a button, nor while selecting). */
  const onArticleClick = useCallback((e: MouseEvent<HTMLElement>) => {
    const t = e.target as Element;
    if (t.closest('a, button, img, input, textarea, .ikr-whole, .ikr-head')) return;
    const sel = document.getSelection();
    if (sel && !sel.isCollapsed) return;
    const hit = hitAt(painted.current, e.clientX, e.clientY);
    if (!hit) return;
    setSelected(null);
    setConfirming(null);
    setTapped(hit);
  }, []);

  // ── What you do ───────────────────────────────────────────────────────────
  const meta = useCallback(() => {
    const published = article.lead?.publishedAt ?? article.publishedAt;
    return {
      bookmarkId: id, url: article.url, title: titleOf(article), publication: article.domain, author: authorOf(article),
      published: published ? dayKeyOf(new Date(published * 1000)) : null,
    };
  }, [article, id]);

  /** The highlight for the words selected: the one they lie in, else a new one (overlapping others or not). */
  const ensure = useCallback((c: unknown[] | undefined, sel: { start: number; end: number }): { content: unknown[]; a: Annotation } | null => {
    const index = ix.current;
    if (!index) return null;
    const p = planHighlight(laid.placed, sel.start, sel.end);
    if (p.kind === 'existing') return { content: c ?? [], a: p.a };
    const a = newPassage(id, anchorAt(index, p.start, p.end));
    return { content: withAnnotation(c, a), a };
  }, [laid, id]);

  /** The selection, taken once: a second tap before the page catches up finds none (no duplicate). */
  const takeSelection = () => { const sel = selectedRef.current; selectedRef.current = null; return sel; };

  const highlight = () => {
    const sel = takeSelection();
    if (!sel) return;
    if (within) { say('Already highlighted'); done(); return; }
    change(c => ensure(c, sel)?.content ?? c ?? []);
    say('Highlighted');
    done();
  };

  const editNote = (a: Annotation | null, from: HTMLElement | null) => {
    const sel = a ? null : takeSelection();
    if (!a && !sel) return;
    const index = ix.current;
    const p = !a && sel ? planHighlight(laid.placed, sel.start, sel.end) : null;
    const target = a ?? (p?.kind === 'existing' ? p.a : null);
    const quote = target?.anchor ? target.anchor.quote : sel && index ? index.text.slice(sel.start, sel.end) : null;
    setEditing({
      mode: 'note', id: target?.id ?? null, sel: target ? null : sel, article: target?.kind === 'article',
      quote, initial: target?.note ?? '',
      draftKey: target ? `note:${target.id}` : `note:new:${id}:${sel!.start}-${sel!.end}`,
      canDelete: !!target?.note, from,
    });
    done();
  };

  const newNote = (from: HTMLElement | null) => setEditing({
    mode: 'note', id: null, sel: null, article: true, quote: null, initial: '', draftKey: `note:article:${id}`, canDelete: false, from,
  });

  const askTakeaway = (a: Annotation | null, from: HTMLElement | null) => {
    const sel = a ? null : takeSelection();
    if (!a && !sel) return;
    const p = !a && sel ? planHighlight(laid.placed, sel.start, sel.end) : null;
    const target = a ?? (p?.kind === 'existing' ? p.a : null);
    if (target && inTakeaways(target)) { say('Already in Takeaways'); done(); return; }
    const index = ix.current;
    const quote = target ? (target.anchor?.quote ?? null) : sel && index ? index.text.slice(sel.start, sel.end) : null;
    setEditing({
      mode: 'takeaway', id: target?.id ?? null, sel: target ? null : sel, article: target?.kind === 'article',
      quote: target?.kind === 'article' ? titleOf(article) : quote, initial: target?.note ?? '',
      draftKey: `takeaway:${target?.id ?? `${id}:${sel!.start}-${sel!.end}`}`, canDelete: false, from,
    });
    done();
  };

  const saving = useRef(false);
  const saveEditing = (text: string) => {
    const e = editing;
    if (!e || saving.current) return;
    saving.current = true;
    const root = bodyRef.current;
    if (e.mode === 'note') {
      const note = cleanNote(text);
      if (e.id) change(c => withNote(c, e.id!, note));
      else if (e.article) { if (note) change(c => withAnnotation(c, newArticleNote(id, note))); }
      else if (e.sel) {
        const sel = e.sel;
        change(c => { const r = ensure(c, sel); return r ? withNote(r.content, r.a.id, note) : c ?? []; });
      }
      say(note ? 'Note saved' : 'Note deleted');
    } else {
      const sel = e.sel;
      const range = sel && ix.current ? rangeAt(ix.current, sel.start, sel.end) : e.id ? placedOf(e.id)?.range ?? null : null;
      const section = root && range ? headingBefore(root, range) : null;
      const m = meta();
      change(c => {
        let next = c ?? [];
        let a: Annotation | undefined;
        if (e.id) a = annotationsOf(next, id).find(x => x.id === e.id);
        else if (sel) { const r = ensure(next, sel); if (r) { next = r.content; a = r.a; } }
        if (!a) return next;
        if (takeawayOf(savedOf(next), a.id, a.takeawayId)) return next;
        const out = saveArticleInsight(next, {
          ...m,
          kind: a.kind === 'article' ? 'edition' : 'passage',
          text: a.anchor ? quoteText(a.anchor.quote) : m.title,
          note: text,
          sectionTitle: a.kind === 'article' ? null : section,
          annotationId: a.id,
          anchor: a.anchor,
        });
        return withTakeaway(out.content, a.id, out.id);
      });
      say('Saved to Takeaways');
    }
    setEditing(null);
    done();
    window.setTimeout(() => { saving.current = false; }, 0);
  };

  const deleteNote = () => {
    const e = editing;
    if (!e?.id) return;
    const a = annotations.find(x => x.id === e.id);
    // A note on the whole article is only its note; a passage's note goes, its highlight stays.
    if (a?.kind === 'article') change(c => withoutAnnotation(c, e.id!));
    else change(c => withNote(c, e.id!, ''));
    say('Note deleted');
    setEditing(null);
  };

  const remove = (a: Annotation) => {
    change(c => withoutAnnotation(c, a.id));
    say(a.kind === 'article' ? 'Note deleted' : inTakeaways(a) ? 'Highlight removed. Its takeaway stays in Takeaways.' : 'Highlight removed', 3200);
    done();
  };

  /** Back to a passage: below the bar, brighter for a moment. Not reading it: nothing is written. */
  const goTo = useCallback((annotationId: string) => {
    const p = placedOf(annotationId);
    const root = bodyRef.current;
    if (!p || !root) return;
    if (o.overlay) o.closeSheet();
    requestAnimationFrame(() => {
      o.showPassage(p.range);
      flash(root, p.range, p.a.id);
    });
  }, [placedOf, bodyRef, o]);

  // From a takeaway: its highlight, else its own copy of the passage, else say so.
  const jumped = useRef<number | null>(null);
  useEffect(() => {
    const j = o.jump;
    const root = bodyRef.current, index = ix.current;
    if (!j || j.bookmarkId !== id || jumped.current === j.key || !drawn || !laid.at || !root || !index) return;
    jumped.current = j.key;
    const live = j.annotationId ? placedOf(j.annotationId) : null;
    let range = live?.range ?? null;
    if (!range && j.anchor) {
      const f = resolve(index, j.anchor);
      if (!('missing' in f)) range = rangeAt(index, f.start, f.end);
    }
    if (range) {
      const r = range;
      requestAnimationFrame(() => { o.showPassage(r); flash(root, r, live?.a.id ?? null); });
    } else if (j.anchor) {
      requestAnimationFrame(() => say("The passage you saved couldn't be found in this version of the article. Your takeaway keeps its words.", 7000));
    }
    o.onJumped();
  }, [o, id, drawn, laid, placedOf, bodyRef, say]);

  // ── What it shows ─────────────────────────────────────────────────────────
  const summary = summaryOf(countsOf(annotations, inTakeaways));

  const toolbar = shown ? (
    <div
      ref={bar} className="ikr-selbar" role="toolbar" aria-label={current ? 'Highlight' : 'Selected passage'} hidden
      // A mouse press here keeps the selection showing (its words are taken already).
      onMouseDown={e => { if (!(e.target as Element).closest('textarea')) e.preventDefault(); }}
    >
      {confirming && current ? (
        <>
          <span className="ikr-selbar-ask">{current.note ? 'Remove the highlight and its note?' : 'Remove this highlight?'}</span>
          <button type="button" className="is-danger" onClick={() => remove(current)}>Remove</button>
          <button type="button" onClick={() => setConfirming(null)}>Keep</button>
        </>
      ) : current ? (
        <>
          <button type="button" onClick={e => editNote(current, e.currentTarget)}><Icon name="note" />{current.note ? 'Edit note' : 'Add note'}</button>
          {inTakeaways(current)
            ? <button type="button" className="is-done" onClick={() => say('Already in Takeaways')}><Icon name="takeaway" />In Takeaways</button>
            : <button type="button" onClick={e => askTakeaway(current, e.currentTarget)} aria-label="Save to Takeaways"><Icon name="takeaway" /><span className="ikr-long">Save to Takeaways</span><span className="ikr-short" aria-hidden>Takeaway</span></button>}
          <button type="button" onClick={() => setConfirming(current.id)}>Remove</button>
        </>
      ) : (
        <>
          <button type="button" onClick={highlight}><Icon name="highlight" />Highlight</button>
          <button type="button" onClick={e => editNote(null, e.currentTarget)}><Icon name="note" />Add note</button>
          <button type="button" onClick={e => askTakeaway(null, e.currentTarget)} aria-label="Save to Takeaways"><Icon name="takeaway" /><span className="ikr-long">Save to Takeaways</span><span className="ikr-short" aria-hidden>Takeaway</span></button>
        </>
      )}
    </div>
  ) : null;

  const dialogs = editing ? (
    <NoteEditor
      key={editing.draftKey} editing={editing}
      onSave={saveEditing} onDelete={deleteNote} onClose={() => setEditing(null)}
    />
  ) : null;

  const panel = (
    <ReadingNotes
      annotations={annotations} laid={laid} inTakeaways={inTakeaways} canSave={!!selected}
      onGo={goTo}
      onEdit={(a, from) => editNote(a, from)}
      onTakeaway={(a, from) => askTakeaway(a, from)}
      onRemove={remove}
      onArticleNote={from => newNote(from)}
      onSaveSelection={from => askTakeaway(null, from)}
    />
  );

  const live = (
    <div className="ikr-toast" role="status" aria-live="polite">{toast && <span key={toast.key}>{toast.text}</span>}</div>
  );

  return { toolbar, dialogs, panel, live, summary, onArticleClick, editing: !!editing };
}
