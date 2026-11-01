// Today: the newest edition of each feed, in the order they are best read
// (AI Challenge, then the sales brief, then customer engagement), with where
// you are in each and a few of its own lines. Only what Drive already holds:
// nothing is generated, and a feed with no edition just says so.
import { useMemo } from 'react';
import { FEEDS, feedById } from './feeds';
import { splitSections, type Edition } from './parse';
import { previewOf, shortTitle } from './present';
import { readingState, type ReadingIndex } from './reading';
import type { FeedState } from './library';
import type { FeedId } from './feeds';
import { formatDayAnchor, todayKey, dayNameShort, formatDayCompact } from '../routine/dates';

interface Props {
  states: Partial<Record<FeedId, FeedState>>;
  reading: ReadingIndex;
  loading: boolean;
  onOpen: (edition: Edition) => void;
}

function TodayCard({ edition, reading, onOpen }: { edition: Edition; reading: ReadingIndex; onOpen: (e: Edition) => void }) {
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

  return (
    <article className={`intel-today-card is-${state}`}>
      <div className="intel-today-top">
        <span className="intel-eyebrow">
          {feedById(edition.feedId)?.label} · {dayNameShort(edition.editionDate)} {formatDayCompact(edition.editionDate)}
          {edition.time && ` · ${edition.time}`}
        </span>
        <span className={`intel-badge is-${state}`}>{badge}</span>
      </div>
      <h2 className="intel-today-title">{edition.title}</h2>
      {preview && <p className="intel-today-preview">{preview}</p>}
      {edition.topics.length > 0 && (
        <ul className="intel-topics" aria-label="Topics">
          {edition.topics.slice(0, 5).map((t, i) => <li key={`${i}-${t}`}>{t}</li>)}
        </ul>
      )}
      <div className="intel-today-actions">
        <button type="button" className={`ds-btn${state === 'read' ? '' : ' ds-btn--primary'}`} onClick={() => onOpen(edition)}>
          {action}
        </button>
      </div>
    </article>
  );
}

export function TodayView({ states, reading, loading, onOpen }: Props) {
  const newest = FEEDS.map(f => states[f.id]?.editions[0]).filter((e): e is Edition => !!e);
  const without = FEEDS.filter(f => !states[f.id]?.editions.length).map(f => f.label);

  return (
    <div className="intel-col intel-today">
      <p className="intel-eyebrow intel-today-date">{formatDayAnchor(todayKey())}</p>
      {newest.map(e => <TodayCard key={e.driveFileId} edition={e} reading={reading} onOpen={onOpen} />)}
      {!newest.length && (
        <div className="intel-empty" role="status">
          {loading ? <p>Loading editions…</p> : <><h2>Nothing to read yet</h2><p>Each briefing shows here once its scheduled task saves an edition to Google Drive.</p></>}
        </div>
      )}
      {newest.length > 0 && without.length > 0 && !loading && (
        <p className="intel-today-none">No edition yet: {without.join(', ')}.</p>
      )}
    </div>
  );
}
