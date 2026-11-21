import { mergeReading, READING_TYPE, type ReadingRecord } from '../intelligence/reading';
import { mergeReview, REVIEW_TYPE, type ReviewRecord } from '../intelligence/review';
import { mergeReading as mergeArticleReading, READING_TYPE as ARTICLE_READING_TYPE, type ReadingRecord as ArticleReadingRecord } from '../intake/reading';
import { isAnnotationId } from '../intake/annotations';
import { isWebsiteId, mergeWebsite } from '../intake/websites';

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
 * instead of the later copy replacing the other, for the kinds where
 * replacing loses something: an edition's reading (D11: a device that had not
 * caught up must not make it unread, or its progress go back), an article's
 * reading in Intake (the same: the furthest progress, the later place) and a
 * takeaway's review (D12). Null for every other kind, which stays
 * last-write-wins. Applied on every pull, so a stale copy that reached the
 * server anyway is corrected by the next device that holds a better one.
 */
export function mergeLogRecord(local: unknown, remote: unknown): unknown | null {
  const type = (local as { type?: unknown } | null)?.type;
  if (!type || type !== (remote as { type?: unknown } | null)?.type) return null;
  if (type === READING_TYPE) return mergeReading(local as ReadingRecord, remote as ReadingRecord);
  if (type === REVIEW_TYPE) return mergeReview(local as ReviewRecord, remote as ReviewRecord);
  if (type === ARTICLE_READING_TYPE) return mergeArticleReading(local as ArticleReadingRecord, remote as ArticleReadingRecord);
  return null;
}

/**
 * Intake's highlights and notes (`ih:`, `in:` in `content`) and its websites (`ws:`): a removal stands. Otherwise
 * a highlight or note is last-write-wins like a takeaway, and a website merges field by field (below), but a copy
 * from a device that had not seen the removal (edited offline, or stamped by a clock running ahead) must never
 * bring back what you removed, so for these a removal wins over any copy of the same record, whatever the stamps
 * say. Highlighting the same words again, or saving the same address again, makes a new record with its own id.
 * Every other record is unchanged.
 */
export const removalWins = (storeName: string, id: string): boolean => storeName === 'content' && (isAnnotationId(id) || isWebsiteId(id));

/**
 * A `content` record held by both this device and the server, combined instead of the later copy replacing the
 * other, for Intake's websites: each field from the copy that changed it last (`mergeWebsite`), so a pin made on
 * one device and a note edited on another, both before they synced, are both kept. Null for every other record,
 * which stays last-write-wins.
 */
export function mergeContentRecord(local: unknown, remote: unknown): unknown | null {
  const id = (local as { id?: unknown } | null)?.id;
  if (typeof id !== 'string' || !isWebsiteId(id)) return null;
  return mergeWebsite(local, remote);
}
