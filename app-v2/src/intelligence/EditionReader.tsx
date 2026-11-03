// One edition at reading size: the run's feed, date and time (Paris), its
// title and topics, an index of its sections that stays at the top of the
// reader, then every section of the document in its order and its words.
//
// What you do with it is yours and syncs: how far you have read (reported
// as you scroll), Mark as read, and Takeaways, where a section, a question,
// a term, the whole edition or text you select can be kept.
import { Component, createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Markdown } from './Markdown';
import { splitSections, type Edition, type Section } from './parse';
import { presentSection, displayOrder, shortTitle, copyText, readingMinutes, type Presentation, type Term } from './present';
import type { Development, Part } from './briefs';
import { feedById } from './feeds';
import { EditionActionsContext, useEditionActions, type EditionActions } from './context';
import { useEdgeFade } from './useEdgeFade';
import { findSaved, type SaveInput, type SavedInsight } from './saved';
import type { ReadingIndex } from './reading';
import { noticeOf, type EditionFlag } from './conformance';
import type { Related } from './related';
import { formatDayAnchor, dayNameShort, formatDayCompact } from '../routine/dates';
import { IconExternal, IconCopy, IconCheck, IconBookmark, IconChevronDown } from '../ui/icons';

type Note = (text: string) => void;

function copy(markdown: string, onNote: Note) {
  const text = copyText(markdown);
  if (!navigator.clipboard) { onNote("Couldn't copy"); return; }
  navigator.clipboard.writeText(text).then(() => onNote('Copied'), () => onNote("Couldn't copy"));
}

interface ToolsProps {
  edition: Edition;
  read: boolean;
  saved: boolean;
  onToggleRead?: () => void;
  onToggleSave?: () => void;
}

/** The edition's actions: in the hero on an iPad, in the top bar on a phone. */
export function EditionTools({ edition, read, saved, onToggleRead, onToggleSave }: ToolsProps) {
  return (
    <div className="intel-tools">
      {onToggleRead && (
        <button
          type="button"
          className={`intel-tool${read ? ' on' : ''}`}
          aria-pressed={read}
          aria-label={read ? 'Read. Mark as unread' : 'Mark as read'}
          title={read ? 'Mark as unread' : 'Mark as read'}
          onClick={onToggleRead}
        ><IconCheck /></button>
      )}
      {onToggleSave && (
        <button
          type="button"
          className={`intel-tool intel-tool--save${saved ? ' on' : ''}`}
          aria-pressed={saved}
          aria-label={saved ? 'Saved to Takeaways. Remove' : 'Save edition to Takeaways'}
          title={saved ? 'Saved to Takeaways' : 'Save to Takeaways'}
          onClick={onToggleSave}
        ><IconBookmark /></button>
      )}
      <a
        className="intel-tool"
        href={edition.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open original in Google Docs"
        title="Open original"
      ><IconExternal /></a>
    </div>
  );
}

function CopyButton({ markdown, label }: { markdown: string; label: string }) {
  const { note } = useEditionActions();
  return (
    <button type="button" className="intel-chipbtn" onClick={() => copy(markdown, note)} aria-label={`Copy: ${label}`}>
      <IconCopy /><span>Copy</span>
    </button>
  );
}

function SaveButton({ input, name }: { input: SaveInput; name: string }) {
  const { savedItem, toggleSave } = useEditionActions();
  const saved = !!savedItem(input);
  return (
    <button
      type="button"
      className={`intel-chipbtn intel-chipbtn--save${saved ? ' on' : ''}`}
      aria-pressed={saved}
      aria-label={saved ? `${name}: saved to Takeaways. Remove` : `Save ${name} to Takeaways`}
      onClick={() => toggleSave(input)}
    >
      <IconBookmark /><span>{saved ? 'Saved' : 'Save'}</span>
    </button>
  );
}

function TermCard({ term, section }: { term: Term; section: Section }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`intel-term${open ? ' is-open' : ''}`}>
      <button type="button" className="intel-term-face" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {term.n && <span className="intel-term-n">{term.n}</span>}
        <b><Markdown inline>{term.term}</Markdown></b>
        {open
          ? <span className="intel-term-def"><Markdown inline>{term.definition}</Markdown></span>
          : <span className="intel-term-hint">Tap to reveal</span>}
      </button>
      {open && (
        <div className="intel-term-actions">
          <SaveButton
            name={term.term}
            input={{ kind: 'term', sectionId: section.id, sectionTitle: section.title, label: term.term, text: term.definition }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Today's topics first, under the document's own label; the whole map (often
 * some thirty topics) one tap away, with today's still lit. A map that marks
 * nothing as today's shows whole.
 */
function TopicMap({ topics, label, highlighted }: { topics: string[]; label: string | null; highlighted: string[] }) {
  const [whole, setWhole] = useState(false);
  const on = new Set(highlighted.map(t => t.toLowerCase()));
  const today = topics.filter(t => on.has(t.toLowerCase()));
  const cloud = (list: string[]) => (
    <ul className="intel-cloud">
      {list.map((t, i) => <li key={`${i}-${t}`} className={on.has(t.toLowerCase()) ? 'on' : undefined}>{t}</li>)}
    </ul>
  );
  if (!today.length) return cloud(topics);
  return (
    <>
      {label && <p className="intel-legend"><i aria-hidden />{label}</p>}
      {cloud(today)}
      <button type="button" className="intel-linkbtn" aria-expanded={whole} onClick={() => setWhole(w => !w)}>
        {whole ? 'Hide the full map' : `All topics (${topics.length})`}
      </button>
      {whole && cloud(topics)}
    </>
  );
}

function Labelled({ label, text, section, className }: { label: string; text: string; section: Section; className: string }) {
  return (
    <div className={className}>
      <h3 className="intel-question-label"><Markdown inline>{label}</Markdown></h3>
      <div className="intel-question-text"><Markdown>{text}</Markdown></div>
      <div className="intel-question-actions">
        <CopyButton markdown={text} label={label} />
        <SaveButton name={label} input={{ kind: 'labelled', sectionId: section.id, sectionTitle: section.title, label, text }} />
      </div>
    </div>
  );
}

/** Which developments are folded away; all are open until folded. */
interface Folds { isOpen: (id: string) => boolean; toggle: (id: string) => void }
const FoldsContext = createContext<Folds>({ isOpen: () => true, toggle: () => {} });

function FoldButton({ id, name }: { id: string; name: string }) {
  const { isOpen, toggle } = useContext(FoldsContext);
  const open = isOpen(id);
  return (
    <button
      type="button"
      className={`intel-fold${open ? '' : ' is-folded'}`}
      aria-expanded={open}
      aria-controls={`intel-body-${id}`}
      aria-label={open ? `Fold ${name}` : `Open ${name}`}
      onClick={() => toggle(id)}
    ><IconChevronDown /></button>
  );
}

const ASKS: Part['tone'][] = ['question', 'response', 'quote'];

/** A development's labelled parts: what happened, what it means, what to ask. */
/** Labelled parts; each label is a heading one level under what holds them. */
function Parts({ parts, sectionId, sectionTitle, level }: { parts: Part[]; sectionId: string; sectionTitle: string; level: 3 | 4 }) {
  const Label = level === 3 ? 'h3' : 'h4';
  return (
    <div className="intel-parts">
      {parts.map((part, i) => (
        <div key={i} className={`intel-part is-${part.tone}`}>
          {part.label && <Label className="intel-part-label"><Markdown inline>{part.label}</Markdown></Label>}
          {part.markdown && <div className="intel-md"><Markdown>{part.markdown}</Markdown></div>}
          {part.label && part.markdown && ASKS.includes(part.tone) && (
            <div className="intel-question-actions">
              <CopyButton markdown={part.markdown} label={part.label} />
              <SaveButton name={part.label} input={{ kind: 'labelled', sectionId, sectionTitle, label: part.label, text: part.markdown }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** One of the Sales Brief's developments, as a card that folds. */
function DevelopmentCard({ dev }: { dev: Development }) {
  const { isOpen } = useContext(FoldsContext);
  const { savedItem, toggleSave } = useEditionActions();
  const input: SaveInput = { kind: 'section', sectionId: dev.id, sectionTitle: dev.title, text: dev.markdown };
  const saved = !!savedItem(input);
  const name = shortTitle(dev.title);
  return (
    <article className="intel-dev" id={`intel-${dev.id}`}>
      <div className="intel-dev-head">
        <h3><Markdown inline heading>{dev.title}</Markdown></h3>
        <button
          type="button"
          className={`intel-sec-save${saved ? ' on' : ''}`}
          aria-pressed={saved}
          aria-label={saved ? `${name}: saved to Takeaways. Remove` : `Save the development ${name} to Takeaways`}
          onClick={() => toggleSave(input)}
        ><IconBookmark /></button>
        <FoldButton id={dev.id} name={name} />
      </div>
      {isOpen(dev.id) && (
        <div id={`intel-body-${dev.id}`}>
          <Parts parts={dev.parts} sectionId={dev.id} sectionTitle={dev.title} level={4} />
        </div>
      )}
    </article>
  );
}

function Asked({ markdown, label, section }: { markdown: string; label: string; section: Section }) {
  return (
    <div className="intel-question">
      <div className="intel-question-text"><Markdown>{markdown}</Markdown></div>
      <div className="intel-question-actions">
        <CopyButton markdown={markdown} label={label} />
        <SaveButton name={label} input={{ kind: 'labelled', sectionId: section.id, sectionTitle: section.title, label, text: markdown }} />
      </div>
    </div>
  );
}

function SectionBody({ p, section }: { p: Presentation; section: Section }) {
  switch (p.kind) {
    case 'summary':
      return <div className="intel-summary"><div className="intel-md"><Markdown>{p.markdown}</Markdown></div></div>;
    case 'callout':
      return p.tone === 'question'
        ? <Asked markdown={p.markdown} label={shortTitle(section.title)} section={section} />
        : <div className={`intel-callout is-${p.tone}`}><div className="intel-md"><Markdown>{p.markdown}</Markdown></div></div>;
    case 'question-list':
      return (
        <div className="intel-questions">
          {p.items.map((q, i) => <Asked key={i} markdown={q} label={shortTitle(section.title)} section={section} />)}
        </div>
      );
    case 'points':
      return (
        <ul className="intel-points">
          {p.items.map((item, i) => (
            <li key={i}><b><Markdown inline>{item.lead}</Markdown></b><span><Markdown inline>{item.text}</Markdown></span></li>
          ))}
        </ul>
      );
    case 'watchlist':
      return (
        <dl className="intel-watchlist">
          {p.items.map((item, i) => (
            <div key={i}><dt><Markdown inline>{item.name}</Markdown></dt><dd><Markdown inline>{item.text}</Markdown></dd></div>
          ))}
        </dl>
      );
    case 'development':
      return <Parts parts={p.parts} sectionId={section.id} sectionTitle={section.title} level={3} />;
    case 'developments':
      return (
        <>
          {p.themes && <ul className="intel-topics" aria-label="Themes">{p.themes.map((t, i) => <li key={`${i}-${t}`}>{t}</li>)}</ul>}
          {p.intro && <div className="intel-md"><Markdown>{p.intro}</Markdown></div>}
          <div className="intel-devs">{p.items.map(d => <DevelopmentCard key={d.id} dev={d} />)}</div>
        </>
      );
    case 'lead':
      return (
        <>
          <p className="intel-lead"><Markdown inline>{p.lead}</Markdown></p>
          {p.rest && <div className="intel-md"><Markdown>{p.rest}</Markdown></div>}
        </>
      );
    case 'topics':
      return <TopicMap topics={p.topics} label={p.label} highlighted={p.highlighted} />;
    case 'numbered':
      return (
        <ol className="intel-steps">
          {p.items.map((item, i) => (
            <li key={i} className="intel-step">
              <span className="intel-step-n" aria-hidden>{item.n}</span>
              <h3><Markdown inline>{item.title}</Markdown></h3>
              {item.body && <div className="intel-md"><Markdown>{item.body}</Markdown></div>}
            </li>
          ))}
        </ol>
      );
    case 'quotes':
      return <div className="intel-md intel-quotes"><Markdown>{p.markdown}</Markdown></div>;
    case 'questions':
      return (
        <div className="intel-questions">
          {p.items.map((q, i) => <Labelled key={i} {...q} section={section} className="intel-question" />)}
        </div>
      );
    case 'vocabulary':
      return (
        <>
          <div className="intel-terms">{p.terms.map((t, i) => <TermCard key={i} term={t} section={section} />)}</div>
          {p.notes.map((n, i) => <Labelled key={i} {...n} section={section} className="intel-rehearse" />)}
        </>
      );
    default:
      return <div className="intel-md"><Markdown>{p.markdown}</Markdown></div>;
  }
}

function SectionSave({ section }: { section: Section }) {
  const { savedItem, toggleSave } = useEditionActions();
  const input: SaveInput = { kind: 'section', sectionId: section.id, sectionTitle: section.title, text: section.markdown };
  const saved = !!savedItem(input);
  const name = shortTitle(section.title);
  return (
    <button
      type="button"
      className={`intel-sec-save${saved ? ' on' : ''}`}
      aria-pressed={saved}
      aria-label={saved ? `${name}: saved to Takeaways. Remove` : `Save the section ${name} to Takeaways`}
      onClick={() => toggleSave(input)}
    ><IconBookmark /></button>
  );
}

/** One edition that cannot be drawn leaves the rest of the section working. */
class EditionBoundary extends Component<{ sourceUrl: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error('[intel] could not show an edition:', error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="intel-empty">
        <h2>This edition couldn't be shown</h2>
        <p>The original is still in Google Docs.</p>
        <a className="ds-btn" href={this.props.sourceUrl} target="_blank" rel="noopener noreferrer"><IconExternal />Open original</a>
      </div>
    );
  }
}

interface Props {
  edition: Edition;
  /** The element the edition scrolls in. */
  scroller: RefObject<HTMLElement | null>;
  onNote: Note;
  /** False where the actions sit in a top bar instead (the phone). */
  heroActions?: boolean;
  reading?: ReadingIndex;
  saved?: SavedInsight[];
  onToggleRead?: () => void;
  onToggleSave?: (input: SaveInput) => void;
  /** How far down (0–1) and in which section, as you scroll. */
  onPosition?: (progress: number, section: string | null) => void;
  /** Open at this section rather than the top. */
  startAt?: string | null;
  /** What conformance says about this document (`conformance.ts`). */
  flags?: EditionFlag[];
  /** Other editions sharing a topic (`related.ts`), shown after the last section. */
  related?: Related[];
  onOpenRelated?: (edition: Edition) => void;
}

/** Other editions listing a topic this one lists: a reason to look, saying which topics. */
function RelatedEditions({ items, onOpen }: { items: Related[]; onOpen?: (e: Edition) => void }) {
  return (
    <section className="intel-related" aria-labelledby="intel-related-title">
      <h2 id="intel-related-title" className="intel-eyebrow">Related by topic</h2>
      <ol className="intel-eds">
        {items.map(({ edition: e, shares }) => (
          <li key={e.driveFileId}>
            <button type="button" className="intel-ed" onClick={() => onOpen?.(e)}>
              <span className="intel-ed-date">
                {feedById(e.feedId)?.label} · {dayNameShort(e.editionDate)} {formatDayCompact(e.editionDate)}{e.time && ` · ${e.time}`}
              </span>
              <span className="intel-ed-title">{e.title}</span>
              <span className="intel-related-why">Shares: {shares.join(', ')}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Reader({
  edition, scroller, onNote, heroActions = true, reading, saved = [], onToggleRead, onToggleSave, onPosition, startAt, flags = [],
  related = [], onOpenRelated,
}: Props) {
  // Where the briefing ends, before what follows it (Related): reading to here is reading it all.
  const endRef = useRef<HTMLDivElement>(null);
  const sections = useMemo(() => splitSections(edition.markdownBody), [edition.markdownBody]);
  const displayed = useMemo(() => displayOrder(edition.feedId, sections), [edition.feedId, sections]);
  const presented = useMemo(
    () => new Map(displayed.map(s => [s.id, presentSection(edition.feedId, s)])),
    [edition.feedId, displayed],
  );
  // The index: every titled section, and the developments inside one.
  const indexed = useMemo(() => displayed.filter(s => s.title && s.role !== 'title').flatMap(s => {
    const own = { id: s.id, label: shortTitle(s.title), sub: false };
    const p = presented.get(s.id);
    return p?.kind === 'developments' ? [own, ...p.items.map(d => ({ id: d.id, label: shortTitle(d.title), sub: true }))] : [own];
  }), [displayed, presented]);
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const folds = useMemo<Folds>(() => ({
    isOpen: id => !folded.has(id),
    toggle: id => setFolded(prev => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    }),
  }), [folded]);
  const feed = feedById(edition.feedId);
  const record = reading?.get(edition.driveFileId);
  const articleRef = useRef<HTMLElement | null>(null);
  const indexRef = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState<string | null>(startAt ?? indexed[0]?.id ?? null);
  const [indexRowRef, indexFade] = useEdgeFade<HTMLDivElement>(active);
  const [selection, setSelection] = useState<SaveInput | null>(null);

  const actions = useMemo<EditionActions>(() => ({
    savedItem: input => findSaved(saved, edition, input),
    toggleSave: input => onToggleSave?.(input),
    note: onNote,
  }), [saved, edition, onToggleSave, onNote]);

  const offsetOf = (id: string) => {
    const el = scroller.current;
    const node = document.getElementById(`intel-${id}`);
    if (!el || !node) return null;
    return node.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - (indexRef.current?.offsetHeight ?? 0);
  };

  // Opens at its top, or where you are sent (the section you were reading).
  // On a phone the scrolling pane appears with the edition, and is only
  // attached once this has run: then it waits a frame, still before paint.
  useLayoutEffect(() => {
    const place = () => {
      const el = scroller.current;
      if (!el) return;
      const top = startAt ? offsetOf(startAt) : null;
      el.scrollTo({ top: top ?? 0 });
    };
    if (scroller.current) { place(); return; }
    const frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
    // Only on opening: the edition is keyed, so this runs once per edition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The section being read is the last one whose heading has passed under the
  // index; how far down you are is reported with it.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = el.getBoundingClientRect().top + (indexRef.current?.offsetHeight ?? 0) + 8;
      let current = indexed[0]?.id ?? null;
      for (const s of indexed) {
        const node = document.getElementById(`intel-${s.id}`);
        if (node && node.getBoundingClientRect().top <= line) current = s.id;
      }
      // The end is the briefing's own, before Related: its last line clear
      // of the reader's foot, as the very bottom used to be.
      const room = el.scrollHeight - el.clientHeight;
      const end = endRef.current;
      const ownRoom = end
        ? end.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop
          + parseFloat(getComputedStyle(el).paddingBottom || '0') - el.clientHeight
        : room;
      const reach = ownRoom > 0 ? Math.min(room, ownRoom) : room;
      const atEnd = room > 0 && el.scrollTop >= reach - 4;
      if (atEnd && indexed.length) current = indexed[indexed.length - 1].id;
      setActive(current);
      if (room > 0) onPosition?.(atEnd ? 1 : Math.min(1, el.scrollTop / reach), current);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, [scroller, indexed, onPosition]);

  // Text selected in the edition can be saved: iOS lets a web app add nothing
  // to its own selection menu, so a button appears at the foot instead. It
  // lingers a moment after the selection goes, as a tap on it can clear the
  // selection before the tap lands.
  useEffect(() => {
    let hide = 0;
    const onChange = () => {
      const sel = document.getSelection();
      const text = sel && !sel.isCollapsed ? sel.toString().trim() : '';
      const node = sel?.anchorNode;
      const el = node ? (node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement) : null;
      window.clearTimeout(hide);
      if (text.length >= 3 && el && articleRef.current?.contains(el) && !el.closest('button')) {
        const id = el.closest('section.intel-sec')?.id.replace(/^intel-/, '') ?? null;
        const section = sections.find(s => s.id === id);
        setSelection({ kind: 'passage', sectionId: section?.id ?? null, sectionTitle: section?.title || null, text });
      } else {
        hide = window.setTimeout(() => setSelection(null), 600);
      }
    };
    document.addEventListener('selectionchange', onChange);
    return () => { document.removeEventListener('selectionchange', onChange); window.clearTimeout(hide); };
  }, [sections]);

  const savePassage = () => {
    if (!selection) return;
    if (findSaved(saved, edition, selection)) onNote('Already in Takeaways');
    else onToggleSave?.(selection);
    document.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  // Going to a section opens it first if it was folded away.
  const goTo = (id: string) => {
    if (folded.has(id)) setFolded(prev => { const next = new Set(prev); next.delete(id); return next; });
    setActive(id);
    requestAnimationFrame(() => {
      const el = scroller.current;
      const top = offsetOf(id);
      if (!el || top === null) return;
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    });
  };

  const progress = record && !record.readAt && record.progress > 0 ? Math.round(record.progress * 100) : null;
  const resumeAt = record && !record.readAt ? indexed.find(s => s.id === record.section) : undefined;
  const editionInput: SaveInput = { kind: 'edition', text: edition.title };
  // A suspected import is for the feed's status only; it is never proof.
  const notices = flags.filter(f => f.kind !== 'possibly-imported').map(noticeOf).filter((n): n is string => !!n);
  const imported = flags.some(f => f.kind === 'imported');

  return (
    <EditionActionsContext.Provider value={actions}>
      <article className="intel-col" aria-labelledby={`intel-title-${edition.driveFileId}`} ref={articleRef}>
        <header className="intel-hero">
          <div className="intel-hero-top">
            <span className="intel-eyebrow">
              {feed?.label ?? edition.feedId} · {formatDayAnchor(edition.editionDate)}{edition.time && ` · ${edition.time}`}
            </span>
            {heroActions && (
              <EditionTools
                edition={edition}
                read={!!record?.readAt}
                saved={!!findSaved(saved, edition, editionInput)}
                onToggleRead={onToggleRead}
                onToggleSave={onToggleSave && (() => onToggleSave(editionInput))}
              />
            )}
          </div>
          <h1 className="intel-title" id={`intel-title-${edition.driveFileId}`}>{edition.title}</h1>
          {edition.topics.length > 0 && (
            <ul className="intel-topics" aria-label="Topics">
              {edition.topics.map((t, i) => <li key={`${i}-${t}`}>{t}</li>)}
            </ul>
          )}
          <p className="intel-meta">
            {readingMinutes(edition.markdownBody)} min read
            {imported && <span className="intel-tag" title="Imported by hand, not published by the schedule">Imported</span>}
            {record?.readAt && ' · Read'}
            {progress !== null && ` · ${progress}% read`}
            {resumeAt && resumeAt.id !== active && (
              <> · <button type="button" className="intel-resume" onClick={() => goTo(resumeAt.id)}>
                Continue from “{resumeAt.label}”
              </button></>
            )}
          </p>
          {notices.map(n => <p key={n} className="intel-notice" role="note">{n}</p>)}
        </header>

        {indexed.length > 1 && (
          <nav className="intel-index" aria-label="In this edition" ref={indexRef}>
            <div className={`intel-index-row${indexFade}`} ref={indexRowRef}>
              {indexed.map(a => (
                <button
                  key={a.id}
                  type="button"
                  data-id={a.id}
                  className={a.sub ? 'is-sub' : undefined}
                  aria-current={active === a.id ? 'true' : undefined}
                  onClick={() => goTo(a.id)}
                >{a.label}</button>
              ))}
            </div>
          </nav>
        )}

        <FoldsContext.Provider value={folds}>
        {displayed.map(s => s.role === 'title' ? (
          // The document's own title line, and what it says before its first section.
          <div key={s.id} id={`intel-${s.id}`} className="intel-doc-title">
            <p className="intel-doc-title-text"><Markdown inline heading>{s.title}</Markdown></p>
            {s.markdown && <div className="intel-md"><Markdown>{s.markdown}</Markdown></div>}
          </div>
        ) : (
          <section key={s.id} id={`intel-${s.id}`} className={`intel-sec${presented.get(s.id)?.kind === 'development' ? ' intel-sec--dev' : ''}`}>
            {s.title && (
              <div className="intel-sec-head">
                <h2><Markdown inline heading>{s.title}</Markdown></h2>
                {onToggleSave && <SectionSave section={s} />}
                {presented.get(s.id)?.kind === 'development' && <FoldButton id={s.id} name={shortTitle(s.title)} />}
              </div>
            )}
            {folds.isOpen(s.id) && (
              <div id={`intel-body-${s.id}`}>
                <SectionBody p={presented.get(s.id)!} section={s} />
              </div>
            )}
          </section>
        ))}
        </FoldsContext.Provider>
        <div ref={endRef} aria-hidden="true" />
        {related.length > 0 && <RelatedEditions items={related} onOpen={onOpenRelated} />}

        {selection && onToggleSave && (
          <button
            type="button"
            className="intel-selsave"
            // Keeps the selection where a mouse would otherwise clear it.
            onMouseDown={e => e.preventDefault()}
            onClick={savePassage}
          ><IconBookmark />Save to Takeaways</button>
        )}
      </article>
    </EditionActionsContext.Provider>
  );
}

export function EditionReader(props: Props) {
  return (
    <EditionBoundary key={props.edition.driveFileId} sourceUrl={props.edition.sourceUrl}>
      <Reader {...props} />
    </EditionBoundary>
  );
}
