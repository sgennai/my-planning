// Reading signals (INT-44, decision D16): a few plain counts at the foot of
// Today, each from data already kept, saying what it counts and since when.
// No streaks, no goals, no charts. Records began when Intelligence did,
// 1 November 2026: a window reaching back further says so rather than
// implying a longer history.
import { FEEDS, type FeedId } from './feeds';
import type { FeedState } from './library';
import type { ReadingIndex } from './reading';
import type { ReviewIndex } from './review';
import { addDaysKey, dayKeyOf, formatDayCompact, weekStartKey, type DayKey } from '../routine/dates';

/** The first day anything could have been recorded. */
export const RECORDS_SINCE: DayKey = '2026-11-01';

export interface Signals {
  /**
   * Editions on this device not yet read (started ones included), per feed
   * in `FEEDS` order; `partial` while the feed is still downloading.
   */
  unread: { feedId: FeedId; count: number; partial: boolean }[];
  /** Editions read to the end or marked read, today included, from the synced reading records. */
  read7: number;
  read30: number;
  /** Takeaways whose last review fell this week. */
  reviewed: number;
  /** The Monday this week began. */
  weekStart: DayKey;
}

export function signalsOf(states: Partial<Record<FeedId, FeedState>>, reading: ReadingIndex, reviews: ReviewIndex, today: DayKey): Signals {
  const readDays = [...reading.values()].flatMap(r => (r.readAt ? [dayKeyOf(new Date(r.readAt))] : []));
  const inLast = (days: number) => {
    const from = addDaysKey(today, -(days - 1));
    return readDays.filter(d => d >= from && d <= today).length;
  };
  const weekStart = weekStartKey(today);
  return {
    unread: FEEDS.map(f => ({
      feedId: f.id,
      count: (states[f.id]?.editions ?? []).filter(e => !reading.get(e.driveFileId)?.readAt).length,
      partial: (states[f.id]?.pending ?? 0) > 0,
    })),
    read7: inLast(7),
    read30: inLast(30),
    reviewed: [...reviews.values()].filter(r => r.lastAt && dayKeyOf(new Date(r.lastAt)) >= weekStart).length,
    weekStart,
  };
}

/** "since 1 Nov" when the last `days` days reach back before the records begin. */
export function sinceNote(days: number, today: DayKey): string | null {
  return addDaysKey(today, -(days - 1)) < RECORDS_SINCE ? `since ${formatDayCompact(RECORDS_SINCE)}` : null;
}
