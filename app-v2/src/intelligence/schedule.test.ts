// Feed health: when each task's run is due in Paris whatever the clock
// change, and what a run counts as at any moment: not yet due, waited for,
// late, missing, published (or being written, or incomplete), or missed and
// imported later. Days before a feed started publishing are never expected.
import { describe, it, expect } from 'vitest';
import { parseEdition, type DriveFile } from './parse';
import { conformanceOf } from './conformance';
import { parisInstant, runsOf, runsOn, nextRunDay, describeSchedule, runText, type Run } from './schedule';
import { feedById, type FeedId } from './feeds';

const at = (iso: string) => Date.parse(iso);
const doc = (feed: FeedId, day: string, time: string, origin: string) =>
  `---\nschema_version: 1\ncontent_type: "${feed}"\nedition_date: "${day}"\ngenerated_at: "${day}T${time}:00+01:00"\norigin: "${origin}"\ntitle: "Edition of ${day}"\ntopics: []\n---\n\n## Challenge\n\nText.`;
const edition = (feed: FeedId, day: string, time: string, origin: 'scheduled' | 'backfill', createdTime: string, text?: string) => {
  const file: DriveFile = { id: `1${feed.slice(0, 4)}${day.replace(/-/g, '')}${origin}000000`, name: `${day}_${time.replace(':', '')}__${feed}`, createdTime, modifiedTime: createdTime };
  return parseEdition(feed, file, text ?? doc(feed, day, time, origin));
};
const states = (runs: Run[]) => runs.map(r => [r.day, r.state]);

describe('when a run is due', () => {
  it('is the Paris time that day, in winter and in summer', () => {
    expect(new Date(parisInstant('2026-11-02', '08:12')).toISOString()).toBe('2026-11-02T07:12:00.000Z');
    expect(new Date(parisInstant('2026-07-01', '08:00')).toISOString()).toBe('2026-07-01T06:00:00.000Z');
  });

  it('and across both clock changes', () => {
    expect(new Date(parisInstant('2026-03-28', '09:00')).toISOString()).toBe('2026-03-28T08:00:00.000Z');
    expect(new Date(parisInstant('2026-03-29', '09:00')).toISOString()).toBe('2026-03-29T07:00:00.000Z');
    expect(new Date(parisInstant('2026-10-24', '09:00')).toISOString()).toBe('2026-10-24T07:00:00.000Z');
    expect(new Date(parisInstant('2026-10-25', '09:00')).toISOString()).toBe('2026-10-25T08:00:00.000Z');
    expect(new Date(parisInstant('2026-10-26', '00:00')).toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });

  it('only on its days, and only from the day it started publishing', () => {
    const engagement = feedById('customer-engagement-brief')!.schedule;
    expect(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-06'].map(d => runsOn(engagement, d))).toEqual([false, true, false, true, true]);
    expect(runsOn(feedById('enterprise-ai-challenge')!.schedule, '2026-11-01')).toBe(false);
    expect(nextRunDay(engagement, at('2026-11-03T10:00:00Z'))).toBe('2026-11-04');
  });

  it('reads as the schedule does', () => {
    expect(describeSchedule(feedById('enterprise-ai-challenge')!.schedule)).toBe('Daily, around 08:12');
    expect(describeSchedule(feedById('customer-engagement-brief')!.schedule)).toBe('Mon, Wed and Fri at 08:00');
  });
});

describe('a flexible run (AI Challenge, around 08:12)', () => {
  const runs = (now: string, editions = [] as ReturnType<typeof edition>[]) =>
    runsOf('enterprise-ai-challenge', editions, conformanceOf(editions, at(now)).flags, at(now));

  it('is expected before its time, waited for after it, late three hours on, missing once its day is over', () => {
    expect(states(runs('2026-11-02T06:00:00Z'))).toEqual([['2026-11-02', 'upcoming']]);
    expect(states(runs('2026-11-02T09:00:00Z'))).toEqual([['2026-11-02', 'waiting']]);
    expect(states(runs('2026-11-02T12:00:00Z'))).toEqual([['2026-11-02', 'late']]);
    expect(states(runs('2026-11-02T22:59:00Z'))).toEqual([['2026-11-02', 'late']]);
    expect(states(runs('2026-11-02T23:01:00Z'))).toEqual([['2026-11-03', 'upcoming'], ['2026-11-02', 'missing']]);
  });

  it('published an hour late is simply published, at the time Drive got it', () => {
    const e = edition('enterprise-ai-challenge', '2026-11-02', '09:01', 'scheduled', '2026-11-02T08:02:12.000Z');
    const [run] = runs('2026-11-02T10:00:00Z', [e]);
    expect(run.state).toBe('published');
    expect(runText(run, feedById('enterprise-ai-challenge')!.schedule)).toBe('Published at 09:02');
  });

  it('a day only imported afterwards was missed, imported later', () => {
    const e = edition('enterprise-ai-challenge', '2026-11-02', '08:12', 'backfill', '2026-11-03T15:00:00.000Z');
    expect(states(runs('2026-11-03T16:00:00Z', [e]))).toEqual([['2026-11-03', 'late'], ['2026-11-02', 'recovered']]);
  });

  it('a document still being written, or published empty, says so', () => {
    const empty = edition('enterprise-ai-challenge', '2026-11-02', '09:01', 'scheduled', '2026-11-02T08:02:00.000Z', doc('enterprise-ai-challenge', '2026-11-02', '09:01', 'scheduled').split('\n\n## ')[0]);
    expect(runs('2026-11-02T08:10:00Z', [empty])[0].state).toBe('writing');
    expect(runs('2026-11-02T12:00:00Z', [empty])[0].state).toBe('incomplete');
  });
});

describe('an exact run (Customer Engagement, Mon, Wed and Fri at 08:00)', () => {
  const runs = (now: string) => runsOf('customer-engagement-brief', [], undefined, at(now));

  it('is waited for half an hour, late until three hours, then missing', () => {
    expect(states(runs('2026-11-02T06:59:00Z'))).toEqual([['2026-11-02', 'upcoming']]);
    expect(states(runs('2026-11-02T07:20:00Z'))).toEqual([['2026-11-02', 'waiting']]);
    expect(states(runs('2026-11-02T07:45:00Z'))).toEqual([['2026-11-02', 'late']]);
    expect(states(runs('2026-11-02T10:01:00Z'))).toEqual([['2026-11-02', 'missing']]);
  });

  it('is not expected on the days it does not run, nor before it started', () => {
    expect(states(runs('2026-11-03T12:00:00Z'))).toEqual([['2026-11-02', 'missing']]);
    expect(states(runs('2026-11-01T12:00:00Z'))).toEqual([]);
  });
});
