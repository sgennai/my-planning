// Today: the newest edition of each feed, in the order they are best read
// (AI Challenge, then the sales brief, then customer engagement), with where
// you are in each, how old it is, and a few of its own lines. Below, every
// other edition still unread, newest first, so that days of editions piling
// up are not hidden behind the newest. Only what Drive already holds:
// nothing is generated, and a feed with no edition just says so.
import { useId, useMemo, useState } from 'react';
import { FEEDS, feedById } from './feeds';
import { splitSections, newestFirst, type Edition } from './parse';
import { previewOf, shortTitle } from './present';
import { readingState, type ReadingIndex } from './reading';
import type { FeedState } from './library';
import type { FeedId } from './feeds';
import { formatDayAnchor, dayNameShort, formatDayCompact, daysBetween, type DayKey } from '../routine/dates';
import { PublishingAlert, PublishingPanel } from './Publishing';
import type { Run } from './schedule';
import type { SavedInsight } from './saved';
import { kindsOf, minutesFor } from './review';
import { IconReview } from '../ui/icons';

/** How many older unread editions show before "Show all". */
const FIRST_FEW = 5;

interface Props {
  states: Partial<Record<FeedId, FeedState>>;
  reading: ReadingIndex;
  loading: boolean;
  /** Whether Drive has answered for this feed since the section opened. */
  checked: (feedId: FeedId) => boolean;
  /** Today in Paris. */
  today: DayKey;
  /** Now, on the screen's minute clock: for feed health. */
  now: number;
  /** Each feed's expected runs (`schedule.ts`). */
  health: Partial<Record<FeedId, Run[]>>;
  onOpen: (edition: Edition) => void;
  onOpenFeed: (feedId: FeedId) => void;
  /** The short label conformance gives the edition, if any. */
  labelOf: (edition: Edition) => string | null;
  onStatus: () => void;
  /** Takeaways due for review today, and how many come due tomorrow. */
  review: { due: SavedInsight[]; tomorrow: number };
  onReview: () => void;
}

/** Takeaways waiting for review, after the day's editions; only when some are due. */
function ReviewCard({ due, tomorrow, onReview }: Props['review'] & { onReview: () => void }) {
  return (
    <section className="intel-today-card intel-review-waiting" aria-labelledby="intel-review-waiting">
      <div className="intel-today-top">
        <span className="intel-eyebrow intel-review-eyebrow"><IconReview aria-hidden />Review</span>
      </div>
      <h2 className="intel-today-title" id="intel-review-waiting">{due.length} {due.length === 1 ? 'takeaway' : 'takeaways'} to review</h2>
      <p className="intel-today-preview">
        Questions, terms and lines you kept, back for a quick recall before they fade. About {minutesFor(Math.min(due.length, 10))} {minutesFor(Math.min(due.length, 10)) === 1 ? 'minute' : 'minutes'}.
      </p>
      <ul className="intel-topics" aria-label="To review">{kindsOf(due).map(k => <li key={k}>{k}</li>)}</ul>
      <div className="intel-today-actions">
        <button type="button" className="ds-btn ds-btn--primary" onClick={onReview}>Start review</button>
        {tomorrow > 0 && <span className="intel-review-later">{tomorrow} more tomorrow</span>}
      </div>
    </section>
  );
}

/** "Today", "Yesterday", or the date, with how long ago once that is more than a day. */
function dayOf(date: DayKey, today: DayKey): { day: string; ago: string | null } {
  const days = daysBetween(date, today);
  if (days === 0) return { day: 'Today', ago: null };
  if (days === 1) return { day: 'Yesterday', ago: null };
  return { day: `${dayNameShort(date)} ${formatDayCompact(date)}`, ago: days > 1 ? `${days} days ago` : null };
}

function TodayCard({ edition, reading, onOpen, label, today, olderUnread, onOpenFeed }: {
  edition: Edition; reading: ReadingIndex; onOpen: (e: Edition) => void; label: string | null;
  today: DayKey; olderUnread: number; onOpenFeed: (feedId: FeedId) => void;
}) {
  const sections = useMemo(() => splitSections(edition.markdownBody), [edition.markdownBody]);
  const preview = useMemo(() => previewOf(sections), [sections]);
  const state = readingState(edition, reading);
  const record = reading.get(edition.driveFileId);
  const at = state === 'started' ? sections.find(s => s.id === record?.section && s.title) : undefined;
  const badge = state === 'new' ? 'New'
    : state === 'updated' ? 'Updated'
      : state === 'read' ? 'Read'
        : `${Math.round((record?.progress ?? 0) * 100)}% read`;
  const action = state === 'started' ? (at ? `Continue · ${shortTitle(at.title)}` : 'Continue')
    : state === 'read' ? 'Read again' : 'Read';

  const { day, ago } = dayOf(edition.editionDate, today);
  // The card's buttons say which feed and edition they are for.
  const id = useId();

  return (
    <article className={`intel-today-card is-${state}`}>
      <div className="intel-today-top">
        <span className="intel-eyebrow">
          <span id={`${id}-feed`}>{feedById(edition.feedId)?.label}</span> · {day}{edition.time && ` · ${edition.time}`}
          {ago && <span className="intel-age"> · {ago}</span>}
        </span>
        {label && <span className={`intel-tag${label === 'Imported' ? '' : ' is-alert'}`}>{label}</span>}
        <span className={`intel-badge is-${state}`}>{badge}</span>
      </div>
      <h2 className="intel-today-title" id={`${id}-title`}>{edition.title}</h2>
      {preview && <p className="intel-today-preview">{preview}</p>}
      {edition.topics.length > 0 && (
        <ul className="intel-topics" aria-label="Topics">
          {edition.topics.slice(0, 5).map((t, i) => <li key={`${i}-${t}`}>{t}</li>)}
        </ul>
      )}
      <div className="intel-today-actions">
        <button type="button" className={`ds-btn${state === 'read' ? '' : ' ds-btn--primary'}`} onClick={() => onOpen(edition)} aria-describedby={`${id}-title`}>
          {action}
        </button>
        {olderUnread > 0 && (
          <button type="button" className="intel-linkbtn" onClick={() => onOpenFeed(edition.feedId)} aria-describedby={`${id}-feed`}>
            {olderUnread} older unread
          </button>
        )}
      </div>
    </article>
  );
}

export function TodayView({ states, reading, loading, checked, today, now, health, onOpen, onOpenFeed, labelOf, onStatus, review, onReview }: Props) {
  const [showAll, setShowAll] = useState(false);
  const newest = FEEDS.map(f => states[f.id]?.editions[0]).filter((e): e is Edition => !!e);
  // Only a feed Drive has answered for is known to have nothing yet.
  const without = FEEDS.filter(f => checked(f.id) && !states[f.id]?.editions.length).map(f => f.label);
  // Unread is anything not read to the end or marked read, started or not.
  const unread = FEEDS.flatMap(f => states[f.id]?.editions ?? [])
    .filter(e => !reading.get(e.driveFileId)?.readAt)
    .sort(newestFirst);
  const onCards = new Set(newest.map(e => e.driveFileId));
  const older = unread.filter(e => !onCards.has(e.driveFileId));
  const olderIn = (feedId: FeedId) => older.filter(e => e.feedId === feedId).length;
  const listed = showAll ? older : older.slice(0, FIRST_FEW);

  return (
    <div className="intel-col intel-today">
      <h1 className="intel-vh">Today</h1>
      <PublishingAlert health={health} now={now} onStatus={onStatus} />
      <p className="intel-eyebrow intel-today-date">
        {formatDayAnchor(today)}{unread.length > 0 && <span className="intel-age"> · {unread.length} unread</span>}
      </p>
      {newest.map(e => (
        <TodayCard
          key={e.driveFileId}
          edition={e}
          reading={reading}
          onOpen={onOpen}
          label={labelOf(e)}
          today={today}
          olderUnread={olderIn(e.feedId)}
          onOpenFeed={onOpenFeed}
        />
      ))}
      {review.due.length > 0 && <ReviewCard {...review} onReview={onReview} />}
      {older.length > 0 && (
        <section className="intel-catchup" aria-labelledby="intel-catchup-title">
          <h2 id="intel-catchup-title" className="intel-eyebrow">Still unread · {older.length}</h2>
          <ol className="intel-eds">
            {listed.map(e => {
              const { day, ago } = dayOf(e.editionDate, today);
              const progress = reading.get(e.driveFileId)?.progress ?? 0;
              return (
                <li key={e.driveFileId}>
                  <button type="button" className="intel-ed" onClick={() => onOpen(e)}>
                    <span className="intel-ed-date">
                      {feedById(e.feedId)?.label} · {day}{e.time && ` · ${e.time}`}{ago && ` · ${ago}`}
                    </span>
                    <span className="intel-ed-title">{e.title}</span>
                    {progress > 0 && (
                      <>
                        <span className="intel-ed-bar" aria-hidden><i style={{ width: `${Math.round(progress * 100)}%` }} /></span>
                        <span className="intel-vh">, {Math.round(progress * 100)}% read</span>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
          {older.length > FIRST_FEW && (
            <button type="button" className="intel-linkbtn" onClick={() => setShowAll(v => !v)} aria-expanded={showAll}>
              {showAll ? 'Show fewer' : `Show all ${older.length}`}
            </button>
          )}
        </section>
      )}
      {!newest.length && (
        <div className="intel-empty" role="status">
          {loading ? <p>Loading editions…</p> : <><h2>Nothing to read yet</h2><p>Each briefing shows here once its scheduled task saves an edition to Google Drive.</p></>}
        </div>
      )}
      {newest.length > 0 && without.length > 0 && (
        <p className="intel-today-none">No edition yet: {without.join(', ')}.</p>
      )}
      <PublishingPanel health={health} now={now} onStatus={onStatus} />
    </div>
  );
}
