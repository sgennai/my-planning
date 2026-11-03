// What you have read, synced: one record per edition in `data.progressLog`
// (`ir:<driveFileId>`), last-write-wins per record like a routine tick, so
// two devices converge. Never written back to Google Drive.
//
// Progress is how far down the edition you have been, and only grows; the
// section is where you were last, which is where it reopens. Reaching the end
// marks it read; Mark as unread starts it over.
//
// Two devices' copies of a record combine (`mergeReading`, decision D11)
// rather than the later replacing the other, so a device that had not caught
// up cannot make an edition read elsewhere unread, or its progress go back.
import type { Edition } from './parse';
import type { FeedId } from './feeds';

export const READING_TYPE = 'intel-reading';
/** Close enough to the end to count as having read it all. */
const THE_END = 0.98;

export interface ReadingRecord {
  id: string;
  type: typeof READING_TYPE;
  /** The edition's Drive file id. */
  refId: string;
  at: string;
  value: {
    feedId: FeedId;
    /** 0–1, the furthest you have scrolled. */
    progress: number;
    /** The section you were reading last. */
    section: string | null;
    /** When it was read to the end or marked read; null while unread. */
    readAt: string | null;
    /** When Mark as unread last started it over; absent if it never was. */
    resetAt?: string | null;
  };
}

export const readingId = (driveFileId: string) => `ir:${driveFileId}`;

function isReading(rec: unknown): rec is ReadingRecord {
  const r = rec as ReadingRecord | null;
  return !!r && r.type === READING_TYPE && typeof r.refId === 'string' && !!r.value;
}

export type ReadingIndex = Map<string, ReadingRecord['value']>;

export function readingIndex(log: unknown[] | undefined): ReadingIndex {
  const index: ReadingIndex = new Map();
  for (const rec of log || []) if (isReading(rec)) index.set(rec.refId, rec.value);
  return index;
}

export type ReadingState = 'new' | 'started' | 'read' | 'updated';

/** New, started, read, or read before Drive's copy last changed. */
export function readingState(edition: Edition, index: ReadingIndex): ReadingState {
  const r = index.get(edition.driveFileId);
  if (r?.readAt) return edition.modifiedTime > r.readAt ? 'updated' : 'read';
  return r && r.progress > 0 ? 'started' : 'new';
}

function put(log: unknown[] | undefined, edition: Edition, value: ReadingRecord['value']): unknown[] {
  const id = readingId(edition.driveFileId);
  const record: ReadingRecord = { id, type: READING_TYPE, refId: edition.driveFileId, at: new Date().toISOString(), value };
  return [...(log || []).filter(r => (r as { id?: string })?.id !== id), record];
}

/**
 * Where you are now. Returns the log unchanged when nothing worth syncing
 * moved: a new section, a tenth more of the edition, or the end.
 */
export function withPosition(log: unknown[] | undefined, edition: Edition, progress: number, section: string | null): unknown[] {
  const before = readingIndex(log).get(edition.driveFileId);
  const furthest = Math.max(before?.progress ?? 0, Math.min(1, Math.max(0, progress)));
  const ended = furthest >= THE_END;
  const readAt = before?.readAt ?? (ended ? new Date().toISOString() : null);
  const moved = !before
    || section !== before.section
    || furthest - before.progress >= 0.1
    || (ended && !before.readAt);
  if (!moved || (furthest === 0 && !section)) return log || [];
  return put(log, edition, { feedId: edition.feedId, progress: ended ? 1 : furthest, section, readAt, ...keptReset(before) });
}

const keptReset = (before: ReadingRecord['value'] | undefined) => (before?.resetAt ? { resetAt: before.resetAt } : {});

/** Mark as read, or as unread, which starts the edition over. */
export function withRead(log: unknown[] | undefined, edition: Edition, read: boolean): unknown[] {
  const before = readingIndex(log).get(edition.driveFileId);
  const now = new Date().toISOString();
  return put(log, edition, read
    ? { feedId: edition.feedId, progress: before?.progress ?? 0, section: before?.section ?? null, readAt: now, ...keptReset(before) }
    : { feedId: edition.feedId, progress: 0, section: null, readAt: null, resetAt: now });
}

/** Later first by `at`; a tie is settled by the content, so either order gives the same. */
const byTime = (a: ReadingRecord, b: ReadingRecord) =>
  (a.at !== b.at ? (a.at < b.at ? -1 : 1) : JSON.stringify(a.value) < JSON.stringify(b.value) ? -1 : 1);

/**
 * One edition's reading as two devices left it, combined (D11): the furthest
 * progress, read if either read it, and the section of the later write. Mark
 * as unread starts it over: of a copy from before it (a device that had not
 * seen it), only a read after it and the section count. Either order gives
 * the same result, so every device and the server converge on it.
 */
export function mergeReading(a: ReadingRecord, b: ReadingRecord): ReadingRecord {
  const resetAt = [a.value.resetAt, b.value.resetAt].filter((t): t is string => !!t).sort().pop() ?? null;
  const current = [a, b].filter(r => (r.value.resetAt ?? null) === resetAt);
  const reads = [a, b].map(r => r.value.readAt).filter((t): t is string => !!t && (!resetAt || t > resetAt)).sort();
  const later = [a, b].sort(byTime)[1];
  return {
    ...later,
    value: {
      feedId: later.value.feedId,
      progress: Math.max(...current.map(r => r.value.progress)),
      section: later.value.section,
      readAt: reads.pop() ?? null,
      ...(resetAt && { resetAt }),
    },
  };
}
