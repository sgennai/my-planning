// Feed health: the runs each task should have published, from its schedule in
// Europe/Paris time (clock changes included), and what became of each.
//
// The two flexible tasks run "around" their time and can start an hour late,
// so their run is late three hours after that time and missing only once its
// Paris day is over. The exact one is late after half an hour and missing
// after three hours. Days before a feed started publishing are not expected;
// an edition imported for a missed day shows as missed, imported later.
import { FEEDS, feedById, type FeedId, type FeedSchedule } from './feeds';
import type { Edition } from './parse';
import type { EditionFlag } from './conformance';
import { TZ, addDaysKey, dayOfWeek, dayKeyOf, clockOf, dayNameShort, formatDayCompact, type DayKey } from '../routine/dates';

export type RunState =
  | 'upcoming' | 'waiting' | 'late' | 'missing'
  | 'published' | 'writing' | 'incomplete' | 'recovered';

export interface Run {
  day: DayKey;
  /** When it was due, as an instant. */
  due: number;
  state: RunState;
  /** The day's edition, if Drive has one. */
  edition: Edition | null;
}

/** States that want a look. */
export const NEEDS_ATTENTION: RunState[] = ['late', 'missing', 'incomplete'];
/** How far back Feed status looks. */
export const HISTORY_DAYS = 14;

const MINUTE = 60_000;
const parts = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** How far Paris is ahead of UTC at an instant, in ms. */
function offsetAt(t: number): number {
  const p = Object.fromEntries(parts.formatToParts(new Date(t)).map(x => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
}

/** The instant a Paris wall-clock time falls on, that day. */
export function parisInstant(day: DayKey, hhmm: string): number {
  const [y, m, d] = day.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, min);
  // Read the offset back twice: a first guess can sit across a clock change.
  return wall - offsetAt(wall - offsetAt(wall));
}

export function runsOn(schedule: FeedSchedule, day: DayKey): boolean {
  return day >= schedule.since && (schedule.days === 'daily' || schedule.days.includes(dayOfWeek(day)));
}

function windowOf(schedule: FeedSchedule, day: DayKey) {
  const due = parisInstant(day, schedule.at);
  return schedule.flexible
    ? { due, lateAt: due + 180 * MINUTE, missingAt: parisInstant(addDaysKey(day, 1), '00:00') }
    : { due, lateAt: due + 30 * MINUTE, missingAt: due + 180 * MINUTE };
}

/** The runs expected over the last `history` Paris days, newest first. */
export function runsOf(
  feedId: FeedId, editions: Edition[], flags: Map<string, EditionFlag[]> | undefined, now: number, history = HISTORY_DAYS,
): Run[] {
  const schedule = feedById(feedId)!.schedule;
  const today = dayKeyOf(new Date(now));
  const runs: Run[] = [];
  for (let i = 0; i < history; i++) {
    const day = addDaysKey(today, -i);
    if (day < schedule.since) break;
    if (!runsOn(schedule, day)) continue;
    const { due, lateAt, missingAt } = windowOf(schedule, day);
    const ofDay = editions.filter(e => e.editionDate === day);
    const own = ofDay.find(e => e.origin !== 'backfill');
    let state: RunState;
    if (own) {
      const kinds = (flags?.get(own.driveFileId) ?? []).map(f => f.kind);
      state = kinds.includes('writing') ? 'writing' : kinds.includes('incomplete') ? 'incomplete' : 'published';
    } else if (ofDay.length) state = 'recovered';
    else state = now < due ? 'upcoming' : now < lateAt ? 'waiting' : now < missingAt ? 'late' : 'missing';
    runs.push({ day, due, state, edition: own ?? ofDay[0] ?? null });
  }
  return runs;
}

/** Runs that want a look over the last few days, across feeds, newest first. */
export function attentionOf(health: Partial<Record<FeedId, Run[]>>, now: number, days = 3): { feedId: FeedId; run: Run }[] {
  const since = now - days * 24 * 60 * 60 * 1000;
  return FEEDS.flatMap(f => (health[f.id] ?? [])
    .filter(r => NEEDS_ATTENTION.includes(r.state) && r.due >= since)
    .map(run => ({ feedId: f.id, run })))
    .sort((a, b) => b.run.due - a.run.due);
}

/** The next day the task runs after today, for "no run today". */
export function nextRunDay(schedule: FeedSchedule, now: number): DayKey {
  let day = addDaysKey(dayKeyOf(new Date(now)), 1);
  while (!runsOn(schedule, day)) day = addDaysKey(day, 1);
  return day;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const when = (s: FeedSchedule) => `${s.flexible ? 'around' : 'at'} ${s.at}`;

/** "Daily, around 08:12" · "Mon, Wed and Fri at 08:00". */
export function describeSchedule(s: FeedSchedule): string {
  if (s.days === 'daily') return `Daily, ${when(s)}`;
  const names = s.days.map(d => DAY_NAMES[d]);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  return `${list} ${when(s)}`;
}

export const dayLabel = (day: DayKey) => `${dayNameShort(day)} ${formatDayCompact(day)}`;

/** What became of a run, in a few words. */
export function runText(run: Run, schedule: FeedSchedule): string {
  const published = run.edition ? clockOf(new Date(run.edition.createdTime ?? run.edition.modifiedTime)) : '';
  switch (run.state) {
    case 'upcoming': return `Expected ${when(schedule)}`;
    case 'waiting': return `Not published yet · expected ${when(schedule)}`;
    case 'late': return `Late · expected ${when(schedule)}`;
    case 'missing': return 'Missing';
    case 'published': return `Published at ${published}`;
    case 'writing': return `Being written · started ${published}`;
    case 'incomplete': return `Published incomplete at ${published}`;
    case 'recovered': return 'Missed, imported later';
  }
}
