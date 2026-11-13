// What the executive memos share (INT-50, INT-51, INT-52): the quiet bar
// (history, the feed's name, the run's date and time between the older and
// newer editions' chevrons, a 2px reading line), the relevant topics, Save, a
// question to ask, the briefs' folded contents and their chapters, the
// related editions' fold, and the end (footer, then quiet tools).
import { useState, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { Markdown } from './Markdown';
import type { Edition } from './parse';
import type { Related } from './related';
import type { SaveInput } from './saved';
import type { PartTone } from './briefs';
import { feedById } from './feeds';
import { useEditionActions } from './context';
import { barDate, chapterTitle, memoDate, shortDate, two, TOPICS_SHOWN, type Chapter, type Field, type MemoBrand } from './memo';

/** Related editions shown before "Show more", and how many more each time. */
const RELATED_FIRST = 5;
const RELATED_MORE = 10;

export const Bookmark = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" aria-hidden>
    <path d="M6 4.75A1.75 1.75 0 0 1 7.75 3h8.5A1.75 1.75 0 0 1 18 4.75V21l-6-4-6 4z" />
  </svg>
);
export const Chevron = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

/**
 * Save to Takeaways, and Saved: one per question or line; a term's, the mark
 * alone. `also` are other records holding the same words (a question saved
 * from elsewhere in the edition): any of them shows as saved, and removing
 * removes that one; saving writes `input`.
 */
export function MemoSave({ input, also = [], name, quiet = false }: { input: SaveInput; also?: SaveInput[]; name: string; quiet?: boolean }) {
  const { savedItem, toggleSave } = useEditionActions();
  const found = [input, ...also].find(i => savedItem(i));
  const saved = !!found;
  const props = {
    type: 'button' as const,
    'aria-pressed': saved,
    'aria-label': saved ? `Remove saved ${name}` : `Save ${name}`,
    title: saved ? 'Saved to Takeaways' : 'Save to Takeaways',
    onClick: () => toggleSave(found ?? input),
  };
  if (quiet) return <button className="memo-mark" {...props}><Bookmark /></button>;
  return <button className="memo-save" {...props}><Bookmark /><span>{saved ? 'Saved' : 'Save'}</span></button>;
}

/** A question to ask, in the memo's quotation type, with its label and Save. */
export function MemoQuestion({ label, markdown, input, also, name }: { label: string; markdown: string; input: SaveInput; also: SaveInput[]; name: string }) {
  return (
    <div className="memo-question">
      <div className="memo-question-top">
        <span className="memo-question-label">{label}</span>
        <MemoSave input={input} also={also} name={name} />
      </div>
      <blockquote><Markdown>{markdown}</Markdown></blockquote>
    </div>
  );
}

/** The briefs' table of contents' place (`intel-memo-contents`). */
export const CONTENTS = 'memo-contents';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * "In this edition · n developments", folded: each development's heading,
 * numbered, its link scrolling to it (`go`); then, where a memo has one, the
 * way to its closing (`after`).
 */
export function MemoContents({ chapters, open, onToggle, go, after }: {
  chapters: Chapter[];
  open: boolean;
  onToggle: (open: boolean) => void;
  go: (id: string) => (e: MouseEvent) => void;
  after?: { id: string; label: string } | null;
}) {
  return (
    <details className="memo-toc" id={`intel-${CONTENTS}`} open={open} onToggle={e => onToggle(e.currentTarget.open)} tabIndex={-1}>
      <summary><Chevron /> In this edition <span className="memo-toc-count">· {plural(chapters.length, 'development')}</span></summary>
      <ol className="memo-toc-list">
        {chapters.map((c, i) => (
          <li key={c.id}>
            <span className="memo-toc-n" aria-hidden>{two(i + 1)}</span>
            <a href={`#intel-${c.id}`} onClick={go(c.id)}><Markdown inline heading>{chapterTitle(c.title, i + 1)}</Markdown></a>
          </li>
        ))}
        {after && (
          <li>
            <span className="memo-toc-n" aria-hidden>{two(chapters.length + 1)}</span>
            <a href={`#intel-${after.id}`} onClick={go(after.id)}>{after.label}</a>
          </li>
        )}
      </ol>
    </details>
  );
}

/** A question field's block: its label, the records its Save reads and writes, and its name for Save. */
export interface ChapterAsk { label: string; input: SaveInput; also: SaveInput[]; name: string }

interface ChapterProps {
  chapter: Chapter;
  n: number;
  total: number;
  /** Where "Next development →" (or the way to the closing) goes. */
  next: { id: string; label: string } | null;
  /** Each field's look, by its tone ("memo-field--sources"). */
  tones: Partial<Record<PartTone, string>>;
  /** A field to show as a question to ask, with Save; null shows it as its words. */
  ask: (field: Field) => ChapterAsk | null;
  go: (id: string) => (e: MouseEvent) => void;
  toContents: (e: MouseEvent) => void;
}

/**
 * A development as a chapter: "Development 01 / 03" and "Back to contents ↑",
 * its heading less the number the kicker gives, its labelled fields in a
 * margin column (or its words as written, when it has none), and the way on.
 */
export function MemoChapter({ chapter, n, total, next, tones, ask, go, toContents }: ChapterProps) {
  const titleId = `memo-dev-${chapter.id}`;
  return (
    <section className="memo-dev" id={`intel-${chapter.id}`} data-section={chapter.id} aria-labelledby={titleId} tabIndex={-1}>
      <div className="memo-dev-kicker">
        <span>Development {two(n)} / {two(total)}</span>
        <a href={`#intel-${CONTENTS}`} className="memo-minor" onClick={toContents}>Back to contents <span aria-hidden>↑</span></a>
      </div>
      <h2 className="memo-dev-title" id={titleId}><Markdown inline heading>{chapterTitle(chapter.title, n)}</Markdown></h2>
      {chapter.fields ? (
        <div className="memo-fields">
          {chapter.fields.map((f, i) => {
            const asked = ask(f);
            return (
              <div key={i} className={`memo-field${tones[f.tone] ? ` ${tones[f.tone]}` : ''}`}>
                {f.label ? <h3 className="memo-field-label"><Markdown inline>{f.label}</Markdown></h3> : <span className="memo-field-label" />}
                <div className="memo-field-content">
                  {asked
                    ? <MemoQuestion label={asked.label} markdown={f.markdown} input={asked.input} also={asked.also} name={asked.name} />
                    : <div className="memo-prose"><Markdown>{f.markdown}</Markdown></div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="memo-prose memo-dev-text"><Markdown>{chapter.markdown}</Markdown></div>
      )}
      {next && (
        <div className="memo-chapter-nav">
          <a href={`#intel-${next.id}`} className="memo-next" onClick={go(next.id)}>{next.label} <span aria-hidden>→</span></a>
        </div>
      )}
    </section>
  );
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
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={newer ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} />
      </svg>
    </button>
  );
}

export interface BarProps {
  brand: MemoBrand;
  edition: Edition;
  /** The sticky bar, and the reading line along its foot. */
  barRef: RefObject<HTMLElement | null>;
  fillRef: RefObject<HTMLDivElement | null>;
  onHistory?: () => void;
  historyOpen?: boolean;
  /** The editions either side of this one in the feed (newest first), for the bar's chevrons. */
  adjacent?: { older: Edition | null; newer: Edition | null };
  onOpenAdjacent?: (e: Edition) => void;
}

export function MemoBar({ brand, edition, barRef, fillRef, onHistory, historyOpen = false, adjacent, onOpenAdjacent }: BarProps) {
  return (
    <header className="memo-bar" ref={barRef} data-sticky>
      <div className="memo-brand">
        {onHistory && (
          <button
            type="button"
            className="memo-hamburger"
            aria-label={brand.history}
            aria-controls="memo-history"
            aria-expanded={historyOpen}
            title={brand.browse}
            onClick={onHistory}
          >
            <svg width="21" height="21" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="1.7" strokeLinecap="round" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
        )}
        <span className="memo-brand-text">{brand.name}</span>
      </div>
      <div className="memo-bar-right">
        {adjacent && <Step to={adjacent.older} newer={false} onOpen={onOpenAdjacent} />}
        <span className="memo-bar-date">{barDate(edition.editionDate, edition.time)}</span>
        {adjacent && <Step to={adjacent.newer} newer onOpen={onOpenAdjacent} />}
      </div>
      <div className="memo-track" aria-hidden><div className="memo-fill" ref={fillRef} /></div>
    </header>
  );
}

/** The edition's relevant topics: the first three, then "+n topics". */
export function Topics({ label, topics }: { label: string; topics: string[] }) {
  const [all, setAll] = useState(false);
  const shown = topics.slice(0, TOPICS_SHOWN), more = topics.slice(TOPICS_SHOWN);
  return (
    <div className="memo-topics" id="memo-topics">
      <span className="memo-topics-head">{label}</span>
      <span className="memo-topics-list">
        {shown.map((t, i) => <span key={`${i}-${t}`}>{i > 0 && <span className="memo-dot" aria-hidden />}<b>{t}</b></span>)}
        {all && more.map((t, i) => <span key={`m${i}-${t}`}><span className="memo-dot" aria-hidden />{t}</span>)}
      </span>
      {more.length > 0 && (
        <button type="button" className="memo-more-topics" aria-expanded={all} aria-controls="memo-topics" onClick={() => setAll(a => !a)}>
          {all ? 'Show less' : `+${more.length} topic${more.length === 1 ? '' : 's'}`}
        </button>
      )}
    </div>
  );
}

/** A fold of reference at the memo's end: the topic map. */
export function RefFold({ id, section, summary, children }: { id?: string; section?: string; summary: ReactNode; children: ReactNode }) {
  return (
    <details className="memo-ref" id={id} data-section={section}>
      <summary><Chevron /><span>{summary}</span></summary>
      {children}
    </details>
  );
}

/** Other editions sharing a topic (`related.ts`): five, then "Show more"; how many, when `counted`. */
export function RelatedFold({ edition, related, onOpen, counted = false }: { edition: Edition; related: Related[]; onOpen?: (e: Edition) => void; counted?: boolean }) {
  const [shown, setShown] = useState(RELATED_FIRST);
  if (!related.length) return null;
  return (
    <details className="memo-ref memo-ref--related">
      <summary>
        <Chevron />
        <span>Related by topic{counted && <span className="memo-ref-note"> · {related.length} edition{related.length === 1 ? '' : 's'}</span>}</span>
      </summary>
      <ol className="memo-related">
        {related.slice(0, shown).map(({ edition: e, shares }) => (
          <li key={e.driveFileId}>
            <button type="button" className="memo-related-item" onClick={() => onOpen?.(e)}>
              <span className="memo-related-title">{e.title}</span>
              <span className="memo-related-meta">
                {shortDate(e.editionDate)} {e.editionDate.slice(0, 4)}{e.time && ` · ${e.time}`}
                {e.feedId !== edition.feedId && ` · ${feedById(e.feedId)?.name ?? e.feedId}`}
              </span>
              <span className="memo-related-shares">Shared: {shares.join(' · ')}</span>
            </button>
          </li>
        ))}
      </ol>
      {related.length > shown && (
        <button type="button" className="memo-related-more" onClick={() => setShown(c => c + RELATED_MORE)}>
          Show more ({related.length - shown})
        </button>
      )}
    </details>
  );
}

export interface EndProps {
  brand: MemoBrand;
  edition: Edition;
  read: boolean;
  editionSaved: boolean;
  onToggleRead?: () => void;
  onToggleEditionSave?: () => void;
}

/** The footer, then the edition's own actions, quiet. */
export function MemoEnd({ brand, edition, read, editionSaved, onToggleRead, onToggleEditionSave }: EndProps) {
  return (
    <>
      <footer className="memo-footer">
        <span>{brand.name} · End of edition</span>
        <span>{memoDate(edition.editionDate)}</span>
      </footer>
      <div className="memo-tools">
        {onToggleRead && <button type="button" aria-pressed={read} onClick={onToggleRead}>{read ? 'Read · Mark as unread' : 'Mark as read'}</button>}
        {onToggleEditionSave && <button type="button" aria-pressed={editionSaved} onClick={onToggleEditionSave}>{editionSaved ? 'Edition saved to Takeaways' : 'Save this edition'}</button>}
        <a href={edition.sourceUrl} target="_blank" rel="noopener noreferrer">Open original in Google Docs</a>
      </div>
    </>
  );
}
