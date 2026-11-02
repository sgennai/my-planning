// Whether the scheduled tasks published, at a glance, at the foot of Today:
// each feed's run today (or when it next runs), any missed run of the last
// days, and Feed status a tap away. A run that wants a look also says so at
// the top of Today (`PublishingAlert`).
import { FEEDS, type FeedId } from './feeds';
import { describeSchedule, nextRunDay, runText, dayLabel, attentionOf, NEEDS_ATTENTION, type Run } from './schedule';
import { dayKeyOf } from '../routine/dates';
import { IconChevronRight } from '../ui/icons';

type Health = Partial<Record<FeedId, Run[]>>;

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

export function PublishingAlert({ health, now, onStatus }: { health: Health; now: number; onStatus: () => void }) {
  const runs = attentionOf(health, now);
  if (!runs.length) return null;
  const feeds = new Set(runs.map(r => r.feedId)).size;
  return (
    <div className="intel-status is-alert" role="status">
      <span>{plural(feeds, 'briefing')} didn't publish as scheduled.</span>
      <button type="button" onClick={onStatus}>Feed status</button>
    </div>
  );
}

export function PublishingPanel({ health, now, onStatus }: { health: Health; now: number; onStatus: () => void }) {
  const today = dayKeyOf(new Date(now));
  return (
    <section className="intel-publishing" aria-labelledby="intel-publishing-title">
      <div className="intel-publishing-head">
        <h2 id="intel-publishing-title" className="intel-eyebrow">Publishing</h2>
        <button type="button" className="intel-publishing-open" onClick={onStatus}>
          Feed status<IconChevronRight />
        </button>
      </div>
      <ul>
        {FEEDS.map(f => {
          const runs = health[f.id] ?? [];
          const run = runs.find(r => r.day === today);
          const missed = runs.filter(r => r.day !== today && NEEDS_ATTENTION.includes(r.state));
          const state = run?.state ?? 'none';
          const text = run ? runText(run, f.schedule)
            : today < f.schedule.since ? `Starts ${dayLabel(f.schedule.since)}`
              : `No run today · next ${dayLabel(nextRunDay(f.schedule, now))}`;
          return (
            <li key={f.id} className={`is-${state}`}>
              <i aria-hidden />
              <span className="intel-publishing-feed">
                <b>{f.label}</b>
                <small>{describeSchedule(f.schedule)}</small>
              </span>
              <span className="intel-publishing-state">
                {text}
                {missed.length > 0 && (
                  <em>{missed.map(r => `${r.state === 'incomplete' ? 'Incomplete' : 'Missing'}: ${dayLabel(r.day)}`).join(' · ')}</em>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
