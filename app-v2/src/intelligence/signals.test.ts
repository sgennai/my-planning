// Reading signals: what each count counts, over which days, and what it says
// when the records do not reach back that far or the archive is still
// downloading.
import { describe, it, expect } from 'vitest';
import { signalsOf, sinceNote } from './signals';
import type { FeedState } from './library';
import type { Edition } from './parse';
import { reviewIndex, type ReviewValue } from './review';
import type { ReadingIndex } from './reading';

const ed = (id: string): Edition => ({ driveFileId: id } as Edition);
const feed = (feedId: FeedState['feedId'], ids: string[], pending = 0): FeedState => ({
  feedId, editions: ids.map(ed), missing: [], status: 'ready', message: null, refreshedAt: null, pending,
});
const read = (readAt: string | null, progress = 1) => ({ feedId: 'enterprise-ai-challenge' as const, progress, section: null, readAt });
const review = (id: string, lastAt: string | null): unknown => ({
  id: `rv:${id}`, type: 'intel-review', refId: id, at: lastAt ?? '2026-11-01T00:00:00Z',
  value: { on: true, due: '2026-12-01', confidence: 3, count: 1, lastAt } satisfies ReviewValue,
});

describe('reading signals', () => {
  const reading: ReadingIndex = new Map([
    ['a1', read('2026-11-12T09:00:00Z')], // Thu 12 Nov, read
    ['a2', read(null, 0.4)], // started, unread
    ['s1', read('2026-11-06T09:00:00Z')], // 7 days before the 13th: outside the week window
    ['s2', read('2026-10-01T09:00:00Z')], // more than 30 days before the 13th
    ['gone', read('2026-11-13T07:00:00Z')], // no longer in Drive, still a read
  ]);
  const states = {
    'enterprise-ai-challenge': feed('enterprise-ai-challenge', ['a1', 'a2', 'a3']),
    'enterprise-ai-sales-brief': feed('enterprise-ai-sales-brief', ['s1', 's2'], 4),
  };
  const reviews = reviewIndex([review('is:1', '2026-11-09T08:00:00Z'), review('is:2', '2026-11-08T21:00:00Z'), review('is:3', null)]);

  it('counts unread per feed on this device, started ones included, and says when a feed is still downloading', () => {
    const s = signalsOf(states, reading, reviews, '2026-11-13');
    expect(s.unread).toEqual([
      { feedId: 'enterprise-ai-challenge', count: 2, partial: false },
      { feedId: 'enterprise-ai-sales-brief', count: 0, partial: true },
      { feedId: 'customer-engagement-brief', count: 0, partial: false },
    ]);
  });

  it('counts editions read over the last 7 and 30 days, today included, wherever they were read', () => {
    const s = signalsOf(states, reading, reviews, '2026-11-13');
    expect([s.read7, s.read30]).toEqual([2, 3]);
  });

  it('counts takeaways reviewed since Monday (Paris)', () => {
    const s = signalsOf(states, reading, reviews, '2026-11-13');
    expect(s.weekStart).toBe('2026-11-09');
    expect(s.reviewed).toBe(1); // Sunday 8 Nov, 22:00 in Paris, was last week
  });

  it('says "since 1 Nov" while a window reaches back before the records', () => {
    expect(sinceNote(30, '2026-11-03')).toBe('since 1 Nov');
    expect(sinceNote(7, '2026-11-07')).toBe(null);
    expect(sinceNote(30, '2026-11-30')).toBe(null);
    expect(sinceNote(30, '2026-11-29')).toBe('since 1 Nov');
  });
});
