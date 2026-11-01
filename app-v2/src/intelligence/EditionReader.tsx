// One edition at reading size: the run's feed, date and time (Paris), its
// title and topics, an index of its sections that stays at the top of the
// reader, then every section of the document in its order and its words.
//
// What you do with it is yours and syncs: how far you have read (reported
// as you scroll), Mark as read, and Takeaways, where a section, a question,
// a term, the whole edition or text you select can be kept.
import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Markdown } from './Markdown';
import { splitSections, type Edition, type Section } from './parse';
import { presentSection, shortTitle, copyText, readingMinutes, type Presentation, type Term } from './present';
import { feedById } from './feeds';
import { EditionActionsContext, useEditionActions, type EditionActions } from './context';
import { useEdgeFade } from './useEdgeFade';
import { findSaved, type SaveInput, type SavedInsight } from './saved';
import type { ReadingIndex } from './reading';
import { formatDayAnchor } from '../routine/dates';
import { IconExternal, IconCopy, IconCheck, IconBookmark } from '../ui/icons';

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

function Labelled({ label, text, section, className }: { label: string; text: string; section: Section; className: string }) {
  return (
    <div className={className}>
      <span className="intel-question-label"><Markdown inline>{label}</Markdown></span>
      <div className="intel-question-text"><Markdown>{text}</Markdown></div>
      <div className="intel-question-actions">
        <CopyButton markdown={text} label={label} />
        <SaveButton name={label} input={{ kind: 'labelled', sectionId: section.id, sectionTitle: section.title, label, text }} />
      </div>
    </div>
  );
}

function SectionBody({ p, section }: { p: Presentation; section: Section }) {
  switch (p.kind) {
    case 'lead':
      return (
        <>
          <p className="intel-lead"><Markdown inline>{p.lead}</Markdown></p>
          {p.rest && <div className="intel-md"><Markdown>{p.rest}</Markdown></div>}
        </>
      );
    case 'topics': {
      const on = new Set(p.highlighted.map(t => t.toLowerCase()));
      return (
        <>
          <ul className="intel-cloud">
            {p.topics.map((t, i) => <li key={`${i}-${t}`} className={on.has(t.toLowerCase()) ? 'on' : undefined}>{t}</li>)}
          </ul>
          {p.label && <p className="intel-legend"><i aria-hidden />{p.label}</p>}
        </>
      );
    }
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
}

function Reader({
  edition, scroller, onNote, heroActions = true, reading, saved = [], onToggleRead, onToggleSave, onPosition, startAt,
}: Props) {
  const sections = useMemo(() => splitSections(edition.markdownBody), [edition.markdownBody]);
  const indexed = useMemo(() => sections.filter(s => s.title), [sections]);
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
      const room = el.scrollHeight - el.clientHeight;
      const atEnd = room > 0 && el.scrollTop >= room - 4;
      if (atEnd && indexed.length) current = indexed[indexed.length - 1].id;
      setActive(current);
      if (room > 0) onPosition?.(atEnd ? 1 : el.scrollTop / room, current);
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

  const goTo = (id: string) => {
    const el = scroller.current;
    const top = offsetOf(id);
    if (!el || top === null) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    setActive(id);
  };

  const progress = record && !record.readAt && record.progress > 0 ? Math.round(record.progress * 100) : null;
  const resumeAt = record && !record.readAt ? indexed.find(s => s.id === record.section) : undefined;
  const editionInput: SaveInput = { kind: 'edition', text: edition.title };

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
            {record?.readAt && ' · Read'}
            {progress !== null && ` · ${progress}% read`}
            {resumeAt && resumeAt.id !== active && (
              <> · <button type="button" className="intel-resume" onClick={() => goTo(resumeAt.id)}>
                Continue from “{shortTitle(resumeAt.title)}”
              </button></>
            )}
          </p>
        </header>

        {indexed.length > 1 && (
          <nav className="intel-index" aria-label="Sections" ref={indexRef}>
            <div className={`intel-index-row${indexFade}`} ref={indexRowRef}>
              {indexed.map(s => (
                <button
                  key={s.id}
                  type="button"
                  data-id={s.id}
                  aria-current={active === s.id ? 'true' : undefined}
                  onClick={() => goTo(s.id)}
                >{shortTitle(s.title)}</button>
              ))}
            </div>
          </nav>
        )}

        {sections.map(s => (
          <section key={s.id} id={`intel-${s.id}`} className="intel-sec">
            {s.title && (
              <div className="intel-sec-head">
                <h2><Markdown inline>{s.title}</Markdown></h2>
                {onToggleSave && <SectionSave section={s} />}
              </div>
            )}
            <SectionBody p={presentSection(edition.feedId, s)} section={s} />
          </section>
        ))}

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
