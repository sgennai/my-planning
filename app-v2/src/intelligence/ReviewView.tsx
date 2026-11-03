// A review of Takeaways (review.ts): one card at a time, a cue first (what
// would you ask, what does it mean), then what was kept and how well you knew
// it, which sets when it comes back. Each rating is kept as it is given, so
// ending part-way loses nothing. It ends on what comes back when.
import { useEffect, useRef, useState } from 'react';
import { Markdown } from './Markdown';
import { feedById } from './feeds';
import { shortTitle } from './present';
import type { SavedInsight } from './saved';
import { RATINGS, cueOf, dayText, dueAfter, reviewKindOf, whenText } from './review';
import { dayNameShort, formatDayCompact, type DayKey } from '../routine/dates';
import { IconCheck, IconX } from '../ui/icons';

interface Props {
  /** This review's takeaways, in order. */
  items: SavedInsight[];
  today: DayKey;
  /** Where the review was opened from, for the way back. */
  backTo: string;
  /** Due today beyond this review. */
  moreDue: number;
  onRate: (item: SavedInsight, confidence: number) => void;
  onStop: (item: SavedInsight) => void;
  onOpen: (item: SavedInsight) => void;
  onMore: () => void;
  onClose: () => void;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What the card is, over it. */
function eyebrowOf(item: SavedInsight): string {
  const section = item.sectionTitle ? shortTitle(item.sectionTitle) : null;
  switch (reviewKindOf(item)) {
    case 'term': return `Term${section ? ` · ${section}` : ''}`;
    case 'question': return `Question · ${item.label}`;
    case 'line': return `Line to rehearse · ${item.label}`;
    case 'passage': return `Passage${section ? ` · ${section}` : ''}`;
    default: return `Section · ${section ?? item.editionTitle}`;
  }
}

/** Where it came from: its section or its edition, and the day. */
function Source({ item }: { item: SavedInsight }) {
  const kind = reviewKindOf(item);
  const from = kind === 'term' || kind === 'section' || !item.sectionTitle ? item.editionTitle : shortTitle(item.sectionTitle);
  return (
    <p className="intel-review-from">
      From “{from}”<br />
      <span>{feedById(item.feedId)?.label} · {dayNameShort(item.editionDate)} {formatDayCompact(item.editionDate)}</span>
    </p>
  );
}

function Kept({ item }: { item: SavedInsight }) {
  if (item.kind === 'passage') return <blockquote className="intel-review-kept is-passage">{item.text}</blockquote>;
  return <div className={`intel-md intel-review-kept${item.kind === 'labelled' ? ' is-line' : ''}`}><Markdown>{item.text}</Markdown></div>;
}

export function ReviewView({ items, today, backTo, moreDue, onRate, onStop, onOpen, onMore, onClose }: Props) {
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(false);
  const [results, setResults] = useState<{ item: SavedInsight; confidence: number | null; time: number }[]>([]);
  const [started] = useState(() => Date.now());
  const heading = useRef<HTMLHeadingElement>(null);
  const kept = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const done = at >= items.length;
  const item = done ? null : items[at];

  // Each new card starts at its top, its question read out; revealing moves
  // to what was kept.
  useEffect(() => {
    scroller.current?.scrollTo?.({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [at]);
  useEffect(() => { if (shown) kept.current?.focus({ preventScroll: true }); }, [shown]);

  const next = (confidence: number | null) => {
    if (!item) return;
    if (confidence === null) onStop(item); else onRate(item, confidence);
    setResults(r => [...r, { item, confidence, time: Date.now() }]);
    setShown(false);
    setAt(i => i + 1);
  };

  const rated = results.filter(r => r.confidence !== null);
  const stopped = results.length - rated.length;
  const comingBack = new Map<DayKey, number>();
  for (const r of rated) {
    const day = dueAfter(r.confidence!, today);
    comingBack.set(day, (comingBack.get(day) ?? 0) + 1);
  }
  const minutes = results.length ? Math.max(1, Math.round((results[results.length - 1].time - started) / 60_000)) : 0;
  const progress = items.length ? Math.round((Math.min(at, items.length) / items.length) * 100) : 100;

  let card;
  if (!items.length) {
    card = (
      <article className="intel-review-card intel-review-done">
        <h2 ref={heading} tabIndex={-1}>Nothing to review today</h2>
        <p className="intel-review-help">What you keep in Takeaways comes back here, a day after you keep it.</p>
        <div className="intel-review-actions"><button type="button" className="ds-btn ds-btn--primary" onClick={onClose}>Back to {backTo}</button></div>
      </article>
    );
  } else if (done) {
    card = (
      <article className="intel-review-card intel-review-done">
        <span className="intel-review-check" aria-hidden><IconCheck /></span>
        <h2 ref={heading} tabIndex={-1}>Review done</h2>
        <p className="intel-review-help">
          {rated.length > 0 && `${plural(rated.length, 'takeaway')} in about ${plural(minutes, 'minute')}.`}
          {stopped > 0 && ` ${plural(stopped, 'takeaway')} taken out of review.`}
        </p>
        {comingBack.size > 0 && (
          <section aria-labelledby="intel-review-back">
            <h3 id="intel-review-back" className="intel-eyebrow">Coming back</h3>
            <ul className="intel-review-back">
              {[...comingBack].sort(([a], [b]) => a.localeCompare(b)).map(([day, n]) => (
                <li key={day}><b>{n}</b><span>{dayText(day, today).replace(/^t/, 'T')}</span></li>
              ))}
            </ul>
          </section>
        )}
        <div className="intel-review-actions">
          <button type="button" className="ds-btn ds-btn--primary" onClick={onClose}>Back to {backTo}</button>
          {moreDue > 0 && <button type="button" className="ds-btn" onClick={onMore}>Review {moreDue} more</button>}
        </div>
      </article>
    );
  } else if (item) {
    const cue = cueOf(item);
    const term = item.kind === 'term';
    card = (
      <article className="intel-review-card" key={item.id}>
        <p className="intel-eyebrow intel-review-kind">{eyebrowOf(item)}</p>
        {term
          ? <h2 ref={heading} tabIndex={-1} className="intel-review-term"><Markdown inline>{item.label ?? ''}</Markdown></h2>
          : <h2 ref={heading} tabIndex={-1} className="intel-review-prompt">{cue.prompt}</h2>}
        <Source item={item} />
        {term && <p className="intel-review-prompt">{cue.prompt}</p>}
        {!shown ? (
          <>
            <p className="intel-review-help">{term ? 'Put it in your own words first.' : 'Say it in your own words, then show what you kept.'}</p>
            <div className="intel-review-actions">
              <button type="button" className="ds-btn ds-btn--primary" onClick={() => setShown(true)}>{cue.reveal}</button>
              <span className="intel-grow" />
              <button type="button" className="ds-btn ds-btn--quiet" onClick={() => next(null)}>Stop reviewing this one</button>
            </div>
          </>
        ) : (
          <>
            <div ref={kept} tabIndex={-1} className="intel-review-answer" role="region" aria-label="What you kept">
              <Kept item={item} />
              {item.note && <p className="intel-review-note"><b>Your note:</b> {item.note}</p>}
              <button type="button" className="intel-linkbtn" onClick={() => onOpen(item)}>Open it in the edition</button>
            </div>
            <div className="intel-review-rate">
              <h3 id="intel-review-rate">How well did you know it?</h3>
              <div className="intel-rates" role="group" aria-labelledby="intel-review-rate">
                {RATINGS.map(r => (
                  <button key={r.value} type="button" className={`intel-rate${r.value === 5 ? ' is-top' : ''}`} onClick={() => next(r.value)}>
                    <b>{r.value}</b><span>{r.label}</span><small>{whenText(r.value)}</small>
                  </button>
                ))}
              </div>
              <div className="intel-review-actions">
                <span className="intel-review-help is-small">Each answer sets when it comes back.</span>
                <span className="intel-grow" />
                <button type="button" className="ds-btn ds-btn--quiet" onClick={() => next(null)}>Stop reviewing this one</button>
              </div>
            </div>
          </>
        )}
      </article>
    );
  }

  return (
    <>
      <div className="intel-review-bar">
        <button type="button" className="ds-icon-btn" onClick={onClose} aria-label={done || !items.length ? 'Close the review' : 'End the review'}><IconX /></button>
        <h1>Review</h1>
        <span className="intel-grow" />
        {items.length > 0 && (
          <>
            <span className="intel-review-count">{Math.min(at + 1, items.length)} of {items.length}</span>
            <div className="intel-review-progress" role="progressbar" aria-label="Review progress" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={Math.min(at, items.length)}>
              <i style={{ width: `${progress}%` }} />
            </div>
          </>
        )}
      </div>
      <div className="intel-review-body" ref={scroller}>{card}</div>
    </>
  );
}
