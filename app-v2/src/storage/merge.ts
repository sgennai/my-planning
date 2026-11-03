import { mergeReading, READING_TYPE, type ReadingRecord } from '../intelligence/reading';
import { mergeReview, REVIEW_TYPE, type ReviewRecord } from '../intelligence/review';

// Merging a synced record that both devices changed since they last synced.
//
// Most records are small and last-write-wins is fine. The routine's activity
// list is not: it is one record holding every activity, so a device that had
// not caught up and saved anything (an edit, or the start-up migration that
// adjusts seeded labels and photos) used to replace the whole list and erase
// the other device's newer edits. Each activity carries its own `updatedAt`,
// stamped by every real edit (settings, reorder, archive, the Plan screen) and
// never by a migration, so the two lists merge activity by activity.

interface Stamped {
  id: string;
  updatedAt?: string;
}

/**
 * Both lists, one entry per activity id: the more recently edited version of
 * each, with an activity added on either side kept. On a tie the local one
 * stays, which is what this device last showed. Nothing is ever dropped, as
 * activities are archived, not deleted.
 */
export function mergeActivityLists<T extends Stamped>(local: T[], remote: T[]): T[] {
  const theirs = new Map(remote.map(a => [a.id, a]));
  const merged = local.map(a => {
    const r = theirs.get(a.id);
    if (!r) return a;
    theirs.delete(a.id);
    return (r.updatedAt ?? '') > (a.updatedAt ?? '') ? r : a;
  });
  return [...merged, ...theirs.values()];
}

/**
 * A `progressLog` record held by both this device and the server, combined
 * instead of the later copy replacing the other, for the two kinds where
 * replacing loses something: an edition's reading (D11: a device that had not
 * caught up must not make it unread, or its progress go back) and a
 * takeaway's review (D12). Null for every other kind, which stays
 * last-write-wins. Applied on every pull, so a stale copy that reached the
 * server anyway is corrected by the next device that holds a better one.
 */
export function mergeLogRecord(local: unknown, remote: unknown): unknown | null {
  const type = (local as { type?: unknown } | null)?.type;
  if (!type || type !== (remote as { type?: unknown } | null)?.type) return null;
  if (type === READING_TYPE) return mergeReading(local as ReadingRecord, remote as ReadingRecord);
  if (type === REVIEW_TYPE) return mergeReview(local as ReviewRecord, remote as ReviewRecord);
  return null;
}
