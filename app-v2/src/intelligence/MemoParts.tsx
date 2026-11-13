// What the executive memos share (INT-50, INT-51): the quiet bar (history,
// the feed's name, the run's date and time between the older and newer
// editions' chevrons, a 2px reading line), the relevant topics, Save, the
// related editions' fold, and the end (footer, then quiet tools).
import { useState, type ReactNode, type RefObject } from 'react';
import type { Edition } from './parse';
import type { Related } from './related';
import type { SaveInput } from './saved';
import { feedById } from './feeds';
import { useEditionActions } from './context';
import { barDate, memoDate, shortDate, TOPICS_SHOWN, type MemoBrand } from './memo';

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
