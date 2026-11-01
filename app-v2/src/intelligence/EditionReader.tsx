// One edition at reading size: the run's feed, date and time (Paris), its
// title and topics, an index of its sections that stays at the top of the
// reader, then every section of the document in its order and its words.
import { Component, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Markdown } from './Markdown';
import { splitSections, type Edition } from './parse';
import { presentSection, shortTitle, copyText, readingMinutes, type Presentation, type Term } from './present';
import { feedById } from './feeds';
import { formatDayAnchor } from '../routine/dates';
import { IconExternal, IconCopy } from '../ui/icons';

type Note = (text: string) => void;

function copy(markdown: string, onNote: Note) {
  const text = copyText(markdown);
  if (!navigator.clipboard) { onNote("Couldn't copy"); return; }
  navigator.clipboard.writeText(text).then(() => onNote('Copied'), () => onNote("Couldn't copy"));
}

/** The edition's actions: in the hero on an iPad, in the top bar on a phone. */
export function EditionActions({ edition }: { edition: Edition }) {
  return (
    <div className="intel-tools">
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

function CopyButton({ markdown, onNote, label }: { markdown: string; onNote: Note; label: string }) {
  return (
    <button type="button" className="intel-copy" onClick={() => copy(markdown, onNote)} aria-label={label}>
      <IconCopy /><span>Copy</span>
    </button>
  );
}

function TermCard({ term }: { term: Term }) {
  const [open, setOpen] = useState(false);
  return (
    <button type="button" className="intel-term" aria-expanded={open} onClick={() => setOpen(o => !o)}>
      {term.n && <span className="intel-term-n">{term.n}</span>}
      <b><Markdown inline>{term.term}</Markdown></b>
      {open
        ? <span className="intel-term-def"><Markdown inline>{term.definition}</Markdown></span>
        : <span className="intel-term-hint">Tap to reveal</span>}
    </button>
  );
}

function SectionBody({ p, onNote }: { p: Presentation; onNote: Note }) {
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
          {p.items.map((q, i) => (
            <div key={i} className="intel-question">
              <span className="intel-question-label"><Markdown inline>{q.label}</Markdown></span>
              <div className="intel-question-text"><Markdown>{q.text}</Markdown></div>
              <div className="intel-question-actions"><CopyButton markdown={q.text} onNote={onNote} label={`Copy: ${q.label}`} /></div>
            </div>
          ))}
        </div>
      );
    case 'vocabulary':
      return (
        <>
          <div className="intel-terms">{p.terms.map((t, i) => <TermCard key={i} term={t} />)}</div>
          {p.notes.map((n, i) => (
            <div key={i} className="intel-rehearse">
              <span className="intel-question-label"><Markdown inline>{n.label}</Markdown></span>
              <div className="intel-rehearse-text"><Markdown>{n.text}</Markdown></div>
              <div className="intel-question-actions"><CopyButton markdown={n.text} onNote={onNote} label={`Copy: ${n.label}`} /></div>
            </div>
          ))}
        </>
      );
    default:
      return <div className="intel-md"><Markdown>{p.markdown}</Markdown></div>;
  }
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
}

function Reader({ edition, scroller, onNote, heroActions = true }: Props) {
  const sections = useMemo(() => splitSections(edition.markdownBody), [edition.markdownBody]);
  const indexed = useMemo(() => sections.filter(s => s.title), [sections]);
  const feed = feedById(edition.feedId);
  const indexRef = useRef<HTMLElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState<string | null>(indexed[0]?.id ?? null);
  const [fade, setFade] = useState({ before: false, after: false });

  // The section being read is the last one whose heading has passed under the index.
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
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4 && indexed.length) current = indexed[indexed.length - 1].id;
      setActive(current);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, [scroller, indexed]);

  // The chips fade at an edge only while there are more of them that way.
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const check = () => setFade(prev => {
      const before = el.scrollLeft > 2;
      const after = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      return prev.before === before && prev.after === after ? prev : { before, after };
    });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener('scroll', check, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener('scroll', check); };
  }, []);

  // Keeps the current section's chip in view.
  useEffect(() => {
    const index = rowRef.current;
    const chip = index?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    if (!index || !chip) return;
    if (chip.offsetLeft < index.scrollLeft || chip.offsetLeft + chip.offsetWidth > index.scrollLeft + index.clientWidth) {
      index.scrollTo({ left: Math.max(0, chip.offsetLeft - 24) });
    }
  }, [active]);

  const goTo = (id: string) => {
    const el = scroller.current;
    const node = document.getElementById(`intel-${id}`);
    if (!el || !node) return;
    const top = node.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - (indexRef.current?.offsetHeight ?? 0);
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    setActive(id);
  };

  return (
    <article className="intel-col" aria-labelledby={`intel-title-${edition.driveFileId}`}>
      <header className="intel-hero">
        <div className="intel-hero-top">
          <span className="intel-eyebrow">
            {feed?.label ?? edition.feedId} · {formatDayAnchor(edition.editionDate)}{edition.time && ` · ${edition.time}`}
          </span>
          {heroActions && <EditionActions edition={edition} />}
        </div>
        <h1 className="intel-title" id={`intel-title-${edition.driveFileId}`}>{edition.title}</h1>
        {edition.topics.length > 0 && (
          <ul className="intel-topics" aria-label="Topics">
            {edition.topics.map((t, i) => <li key={`${i}-${t}`}>{t}</li>)}
          </ul>
        )}
        <p className="intel-meta">{readingMinutes(edition.markdownBody)} min read</p>
      </header>

      {indexed.length > 1 && (
        <nav className="intel-index" aria-label="Sections" ref={indexRef}>
          <div
            className={`intel-index-row${fade.before ? ' fade-before' : ''}${fade.after ? ' fade-after' : ''}`}
            ref={rowRef}
          >
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
          {s.title && <h2><Markdown inline>{s.title}</Markdown></h2>}
          <SectionBody p={presentSection(edition.feedId, s)} onNote={onNote} />
        </section>
      ))}
    </article>
  );
}

export function EditionReader(props: Props) {
  return (
    <EditionBoundary key={props.edition.driveFileId} sourceUrl={props.edition.sourceUrl}>
      <Reader {...props} />
    </EditionBoundary>
  );
}
