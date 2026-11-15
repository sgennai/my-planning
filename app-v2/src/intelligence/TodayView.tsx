// Today as the Reading Queue (INT-55), after Option 02 of the approved
// prototype `today-10-executive-memo.html`: the newest edition of each feed
// in a short list on the left, in the order they are best read (AI
// Challenge, then the sales brief, then customer engagement); the one chosen
// previewed on the right in its own words (`previewOf`), Open edition taking
// it to its memo. Choosing only previews: nothing is marked read until it is
// read to the end or marked so here. Below, every other edition still
// unread, newest first, so that days of editions piling up are not hidden
// behind the newest; then takeaways due for review, the reading counts and
// whether the tasks published. Only what Drive already holds: nothing is
// generated, and a feed with no edition just says so. A feed that publishes
// on some days only (Customer Engagement) shows its latest as that, dated,
// never as missing; a run that did not happen says so at the top
// (`PublishingAlert`), as everywhere else.
import { useId, useMemo, useRef, useState } from 'react';
import { FEEDS, feedById } from './feeds';
import { splitSections, newestFirst, type Edition } from './parse';
import { previewOf } from './present';
import { readingState, countsAsUnread, isArchive, isRead, type ReadingIndex, type ReadingState } from './reading';
import type { FeedState } from './library';
import type { FeedId } from './feeds';
import { dayNameShort, formatDayCompact, type DayKey } from '../routine/dates';
import { PublishingAlert, PublishingPanel } from './Publishing';
import type { Run } from './schedule';
import type { SavedInsight } from './saved';
import { kindsOf, minutesFor, type ReviewIndex } from './review';
import { signalsOf, sinceNote, type Signals } from './signals';
import { dayMonth, shortDate, two } from './memo';
import { IconChevronDown } from '../ui/icons';

/** How many older unread editions show before "Show all". */
const FIRST_FEW = 5;
/** How many of an edition's topics its preview shows. */
const TOPICS_SHOWN = 3;
/** When the preview goes under the feeds (today.css). */
const STACKED = '(max-width: 660px)';

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
  /** The full edition, in its feed's reader. */
  onOpen: (edition: Edition) => void;
  /** Mark as read, or as unread. */
  onToggleRead: (edition: Edition) => void;
  /** The short label conformance gives the edition, if any. */
  labelOf: (edition: Edition) => string | null;
  onStatus: () => void;
  /** Takeaways due for review today, and how many come due tomorrow. */
  review: { due: SavedInsight[]; tomorrow: number };
  onReview: () => void;
  /** Every takeaway's review, for "reviewed this week". */
  reviews: ReviewIndex;
  /** The feed previewed, and whether the backlog is open: the screen keeps them, so coming back finds them. */
  focus: FeedId;
  onFocus: (feedId: FeedId) => void;
  backlogOpen: boolean;
  onBacklog: (open: boolean) => void;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const percent = (e: Edition, reading: ReadingIndex) => Math.round((reading.get(e.driveFileId)?.progress ?? 0) * 100);

/** Where you are in an edition, in words: never by colour alone. */
function standing(e: Edition, state: ReadingState, reading: ReadingIndex): string {
  if (state === 'read') return 'Read';
  if (state === 'updated') return 'Updated since read';
  if (state === 'started') return `${percent(e, reading)}% read`;
  // An imported edition is the archive's, never unread (INT-34).
  return isArchive(e) ? 'From the archive' : 'Unread';
}

/** The preview's status: read, or the feed's latest, dated when it is not today's. */
function Status({ edition, state, today }: { edition: Edition; state: ReadingState; today: DayKey }) {
  if (state === 'read') return <span className="today-pill is-read"><span aria-hidden>✓</span>Read</span>;
  if (state === 'updated') return <span className="today-pill"><span aria-hidden>•</span>Updated since read</span>;
  const fresh = edition.editionDate === today;
  return (
    <span className={`today-pill${fresh ? '' : ' is-earlier'}`}>
      <span aria-hidden>•</span>{fresh ? 'Latest edition' : `Latest · ${shortDate(edition.editionDate)}`}
    </span>
  );
}

function Preview({ edition, reading, today, label, onOpen, onToggleRead }: {
  edition: Edition; reading: ReadingIndex; today: DayKey; label: string | null;
  onOpen: (e: Edition) => void; onToggleRead: (e: Edition) => void;
}) {
  const preview = useMemo(() => previewOf(splitSections(edition.markdownBody)), [edition.markdownBody]);
  const state = readingState(edition, reading);
  const id = useId();
  return (
    <>
      <div className="today-row">
        <span className="today-feed">{feedById(edition.feedId)?.label}</span>
        <span className="today-flags">
          {label && <span className={`intel-tag${label === 'Imported' ? '' : ' is-alert'}`}>{label}</span>}
          <Status edition={edition} state={state} today={today} />
        </span>
      </div>
      <div className="today-meta">
        {shortDate(edition.editionDate)}{edition.time && ` · ${edition.time}`}{state === 'started' && ` · ${percent(edition, reading)}% read`}
      </div>
      <h2 className="today-title" id={`${id}-title`}>{edition.title}</h2>
      {preview
        ? <p className="today-snip">{preview}</p>
        : <p className="today-snip is-quiet">Open the edition to read it in full.</p>}
      {edition.topics.length > 0 && (
        <ul className="today-chips" aria-label="Topics">
          {edition.topics.slice(0, TOPICS_SHOWN).map((t, i) => <li key={`${i}-${t}`}>{t}</li>)}
        </ul>
      )}
      <div className="today-actions">
        <button type="button" className="today-action is-primary" onClick={() => onOpen(edition)} aria-describedby={`${id}-title`}>
          Open edition<span aria-hidden> ↗</span>
        </button>
        <button type="button" className="today-thin" onClick={() => onToggleRead(edition)} aria-describedby={`${id}-title`}>
          {isRead(edition, reading) ? 'Mark unread' : 'Mark read'}
        </button>
      </div>
    </>
  );
}

/** A few plain counts, each saying what it counts and since when (signals.ts). */
function ReadingPanel({ signals: s, today }: { signals: Signals; today: DayKey }) {
  // Said once, after the longer window: the shorter one never starts earlier.
  const since = sinceNote(30, today);
  return (
    <section className="intel-publishing intel-signals" aria-labelledby="intel-signals-title">
      <div className="intel-publishing-head"><h2 id="intel-signals-title" className="intel-eyebrow">Your reading</h2></div>
      <dl>
        <div>
          <dt>Unread</dt>
          <dd>
            <span>
              {s.unread.map((u, i) => (
                <span key={u.feedId}>{i > 0 && ' · '}<span className="intel-nowrap">{feedById(u.feedId)?.label} {u.count}</span></span>
              ))}
            </span>
            {s.unread.some(u => u.partial) && <small>More are still downloading to this device.</small>}
          </dd>
        </div>
        <div>
          <dt>Read</dt>
          <dd>
            <span>{s.read7} in the last 7 days · {s.read30} in the last 30 days{since && <span className="intel-nowrap"> ({since})</span>}</span>
          </dd>
        </div>
        <div>
          <dt>Reviewed</dt>
          <dd><span>{plural(s.reviewed, 'takeaway')} this week, <span className="intel-nowrap">since {dayNameShort(s.weekStart)} {formatDayCompact(s.weekStart)}</span></span></dd>
        </div>
      </dl>
    </section>
  );
}

/** Takeaways waiting for review, after the backlog; only when some are due. */
function ReviewBox({ due, tomorrow, onReview }: Props['review'] & { onReview: () => void }) {
  const minutes = minutesFor(Math.min(due.length, 10));
  return (
    <section className="today-box today-review" aria-labelledby="today-review-title">
      <div className="today-box-head">
        <div>
          <div className="today-caps">Your takeaways</div>
          <h2 className="today-box-title" id="today-review-title">{due.length} {due.length === 1 ? 'takeaway' : 'takeaways'} to review</h2>
        </div>
        <button type="button" className="today-action" onClick={onReview}>Start review</button>
      </div>
      <p className="today-box-note">
        Questions, terms and lines you kept, back for a quick recall before they fade. About {minutes} {minutes === 1 ? 'minute' : 'minutes'}.
        {tomorrow > 0 && ` ${tomorrow} more tomorrow.`}
      </p>
      <ul className="today-chips" aria-label="To review">{kindsOf(due).map(k => <li key={k}>{k}</li>)}</ul>
    </section>
  );
}

export function TodayView({ states, reading, loading, checked, today, now, health, onOpen, onToggleRead, labelOf, onStatus, review, onReview, reviews, focus, onFocus, backlogOpen, onBacklog }: Props) {
  const [showAll, setShowAll] = useState(false);
  const signals = useMemo(() => signalsOf(states, reading, reviews, today), [states, reading, reviews, today]);
  const newest = FEEDS.map(f => states[f.id]?.editions[0]).filter((e): e is Edition => !!e);
  // Unread is anything not marked read, started or not, even read to the end (INT-57).
  const unread = FEEDS.flatMap(f => states[f.id]?.editions ?? [])
    .filter(e => countsAsUnread(e, reading))
    .sort(newestFirst);
  // The backlog: what the queue does not already show.
  const inQueue = new Set(newest.map(e => e.driveFileId));
  const older = unread.filter(e => !inQueue.has(e.driveFileId));
  const listed = showAll ? older : older.slice(0, FIRST_FEW);
  const chosen = states[focus]?.editions[0];
  const id = useId();
  const previewRef = useRef<HTMLElement>(null);
  // Where the preview sits under the feeds (a phone), choosing brings it into view.
  const choose = (feedId: FeedId) => {
    onFocus(feedId);
    if (!window.matchMedia?.(STACKED).matches) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    previewRef.current?.scrollIntoView?.({ block: 'start', behavior: still ? 'auto' : 'smooth' });
  };

  return (
    <div className="today-q">
      <header className="today-intro">
        <p className="today-kicker">The reading queue / {dayMonth(today)}</p>
        <h1 className="today-masthead">A clearer next step</h1>
        <p className="today-lede">
          Choose from the list <span className="today-wide">on the left</span><span className="today-narrow">above</span>; the briefing preview updates without changing your context.
        </p>
      </header>
      <PublishingAlert health={health} now={now} onStatus={onStatus} />

      <div className="today-shell">
        <div className="today-left">
          <div className="today-caps today-left-head" id={`${id}-feeds`}>Your three feeds</div>
          {/* Buttons, the one previewed pressed; each says its feed, its edition and where you are in it. */}
          <div role="group" aria-labelledby={`${id}-feeds`}>
            {FEEDS.map((f, i) => {
              const e = states[f.id]?.editions[0];
              const on = f.id === focus;
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`today-item${on ? ' is-on' : ''}`}
                  aria-pressed={on}
                  aria-controls={`${id}-preview`}
                  onClick={() => choose(f.id)}
                >
                  <span className="today-caps">{two(i + 1)} · {f.label}</span>
                  <strong>{e ? e.title : checked(f.id) ? 'No edition yet' : 'Loading…'}</strong>
                  {e && <span className="today-meta">{shortDate(e.editionDate)} · {standing(e, readingState(e, reading), reading)}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <section className="today-right" id={`${id}-preview`} aria-label="Preview" ref={previewRef}>
          {chosen ? (
            <Preview edition={chosen} reading={reading} today={today} label={labelOf(chosen)} onOpen={onOpen} onToggleRead={onToggleRead} />
          ) : (
            <div className="today-empty" role="status">
              {loading || !checked(focus)
                ? <p>Loading editions…</p>
                : <><h2 className="today-title">No edition yet</h2><p>Each briefing shows here once its scheduled task saves an edition to Google Drive.</p></>}
            </div>
          )}
        </section>
      </div>

      {newest.length > 0 && (
        <section className="today-box today-backlog" aria-labelledby={`${id}-backlog`}>
          <div className="today-box-head">
            <div>
              <div className="today-caps">Your backlog</div>
              <h2 className="today-box-title" id={`${id}-backlog`}>
                Still unread <span className="today-count">· {older.length ? plural(older.length, 'older edition') : 'nothing older'}</span>
              </h2>
            </div>
            {older.length > 0 && (
              <button type="button" className="today-action is-quiet" onClick={() => onBacklog(!backlogOpen)} aria-expanded={backlogOpen} aria-controls={`${id}-older`}>
                {backlogOpen ? 'Collapse' : 'Expand'}<IconChevronDown aria-hidden />
              </button>
            )}
          </div>
          {older.length === 0 ? (
            <p className="today-box-note">No earlier edition is waiting: the queue above is all there is to read.</p>
          ) : (
            <div className="today-backlog-body" id={`${id}-older`} hidden={!backlogOpen}>
              <ol>
                {listed.map(e => {
                  const progress = percent(e, reading);
                  return (
                    <li key={e.driveFileId}>
                      <span className="today-backlog-what">
                        <span className="today-caps">{feedById(e.feedId)?.label} · {shortDate(e.editionDate)}{progress > 0 && ` · ${progress}% read`}</span>
                        <span className="today-backlog-name" id={`${id}-${e.driveFileId}`}>{e.title}</span>
                      </span>
                      <button type="button" className="today-thin" onClick={() => onOpen(e)} aria-describedby={`${id}-${e.driveFileId}`}>
                        Open<span aria-hidden> ↗</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              {older.length > FIRST_FEW && (
                <button type="button" className="today-thin" onClick={() => setShowAll(v => !v)} aria-expanded={showAll}>
                  {showAll ? 'Show fewer' : `Show all ${older.length}`}
                </button>
              )}
            </div>
          )}
        </section>
      )}
      {review.due.length > 0 && <ReviewBox {...review} onReview={onReview} />}
      {newest.length > 0 && <ReadingPanel signals={signals} today={today} />}
      <PublishingPanel health={health} now={now} onStatus={onStatus} />
    </div>
  );
}
