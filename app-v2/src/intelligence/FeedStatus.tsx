// Feed status: what Drive holds for each feed, and anything in it that wants
// a look, so that whether the scheduled tasks publish as they should can be
// checked here rather than in Drive. Nothing is hidden or removed from here.
import { useEffect, useRef } from 'react';
import { useModalFocus } from './useModalFocus';
import { feedById, type FeedId } from './feeds';
import { parseEdition, type Edition } from './parse';
import { noticeOf, type FeedConformance } from './conformance';
import { describeSchedule, runText, dayLabel, type Run } from './schedule';
import type { FeedState } from './library';
import { dayNameShort, formatDayCompact } from '../routine/dates';
import { IconX } from '../ui/icons';

interface Props {
  feeds: FeedId[];
  states: Partial<Record<FeedId, FeedState>>;
  conformance: Partial<Record<FeedId, FeedConformance>>;
  health: Partial<Record<FeedId, Run[]>>;
  onOpen: (edition: Edition) => void;
  onClose: () => void;
}

const when = (e: { editionDate: string; time: string | null }) =>
  `${dayNameShort(e.editionDate)} ${formatDayCompact(e.editionDate)}${e.time ? ` · ${e.time}` : ''}`;

const originOf = (e: Edition) =>
  e.origin === 'scheduled' ? 'published by its schedule' : e.origin === 'backfill' ? 'imported' : 'origin not stated';

const checkedAt = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

function Feed({ feedId, state, conformance, runs = [], onOpen }: {
  feedId: FeedId; state?: FeedState; conformance?: FeedConformance; runs?: Run[]; onOpen: (e: Edition) => void;
}) {
  const feed = feedById(feedId)!;
  const editions = state?.editions ?? [];
  const newest = editions[0];
  const problems = conformance?.problems ?? [];
  const missing = state?.missing ?? [];
  return (
    <section className="intel-health" aria-labelledby={`intel-health-${feedId}`}>
      <h3 id={`intel-health-${feedId}`}>{feed.name}</h3>
      <dl>
        <div><dt>Schedule</dt><dd>{describeSchedule(feed.schedule)}, since {dayLabel(feed.schedule.since)}</dd></div>
        <div><dt>Editions</dt><dd>{editions.length}{state?.pending ? `, and ${state.pending} still downloading` : ''}</dd></div>
        <div><dt>Newest</dt><dd>{newest ? `${when(newest)}, ${originOf(newest)}` : 'None yet'}</dd></div>
        <div><dt>Last scheduled publication</dt><dd>{conformance?.lastScheduled ? when(conformance.lastScheduled) : 'None yet'}</dd></div>
        <div><dt>Checked with Drive</dt><dd>{state?.refreshedAt ? `at ${checkedAt(state.refreshedAt)}` : 'Not yet'}</dd></div>
      </dl>
      {state && state.status !== 'ready' && <p className="intel-health-alert">{state.message}</p>}
      {runs.length > 0 && (
        <>
          <h4 className="intel-health-sub">Recent runs</h4>
          <ul className="intel-runs">
            {runs.map(r => (
              <li key={r.day} className={`is-${r.state}`}><span>{dayLabel(r.day)}</span><span>{runText(r, feed.schedule)}</span></li>
            ))}
          </ul>
          {runs.some(r => r.state === 'missing') && (
            <p className="intel-health-help">
              To recover a missed edition: check the task's run in ChatGPT. If the briefing was written but not
              published, publish it to this feed's folder with its original date and time and
              {' '}<code>origin: "backfill"</code>. It then shows here as “Missed, imported later”.
            </p>
          )}
        </>
      )}
      {(problems.length > 0 || missing.length > 0) ? (
        <ul className="intel-health-list">
          {missing.map(m => {
            // The date the filename gives, rather than the filename itself.
            const named = parseEdition(feedId, m.file, '');
            return (
              <li key={m.file.id}>
                <b>{when(named)}</b>
                <p>This document couldn't be downloaded from Drive: {m.message}</p>
              </li>
            );
          })}
          {problems.map(({ edition, flag }, i) => (
            <li key={`${edition.driveFileId}-${i}`}>
              <button type="button" className="intel-linkbtn" onClick={() => onOpen(edition)}>
                {when(edition)} · {edition.title}
              </button>
              <p>{noticeOf(flag)}</p>
            </li>
          ))}
        </ul>
      ) : (
        editions.length > 0 && <p className="intel-health-ok">Every document follows the publication format.</p>
      )}
    </section>
  );
}

export function FeedStatus({ feeds, states, conformance, health, onOpen, onClose }: Props) {
  const sheet = useRef<HTMLDivElement>(null);
  useModalFocus(sheet, true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="ds-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby="intel-health-title"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="ds-modal intel-health-sheet" ref={sheet}>
        <div className="ds-modal-head">
          <h2 id="intel-health-title">Feed status</h2>
          <button type="button" className="ds-icon-btn" onClick={onClose} aria-label="Close"><IconX /></button>
        </div>
        {/* Focusable, so that a keyboard can scroll it. */}
        <div className="ds-modal-body" tabIndex={0}>
          {feeds.map(id => (
            <Feed key={id} feedId={id} state={states[id]} conformance={conformance[id]} runs={health[id]} onOpen={onOpen} />
          ))}
        </div>
      </div>
    </div>
  );
}
