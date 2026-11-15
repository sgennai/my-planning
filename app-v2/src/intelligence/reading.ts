// What you have read, synced, in `data.progressLog`, never written back to
// Google Drive. Two things, kept apart (INT-57):
//
// - Reading (`ir:<driveFileId>`, type `intel-reading`): how far down the
//   edition you have been, which only grows, and the section you were in
//   last, where it reopens. `readAt` is when the end was reached; it says
//   nothing about whether you count it as read (before INT-57 it did, and
//   Mark as read wrote it too, so old records carry it either way). Two
//   devices' copies combine (`mergeReading`, decision D11) rather than the
//   later replacing the other, so a device that had not caught up cannot take
//   progress back.
// - Read (`ic:<driveFileId>`, type `intel-read-mark`): only what you confirm,
//   with the reader's read button or Today's Mark read; the same again takes
//   it back. Opening, scrolling, reaching the end or keeping something from
//   it never marks it. One record per edition, last-write-wins like a routine
//   tick: the later of two devices' marks stands. Marking never touches the
//   reading record, so where you are in an edition stays as it was.
//
// No record from before INT-57 is taken as a confirmation: an edition read
// to the end then is unread until you mark it.
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
    /** When the end was reached (before INT-57, also when marked read); null before. Not whether it is read: see `ReadMark`. */
    readAt: string | null;
    /** When Mark as unread last started it over; absent if it never was. */
    resetAt?: string | null;
  };
}

export const readingId = (driveFileId: string) => `ir:${driveFileId}`;

export const READ_MARK_TYPE = 'intel-read-mark';

/** Read, as you confirmed it, or taken back, and when. */
export interface ReadMark { read: boolean; at: string }

export interface ReadMarkRecord {
  id: string;
  type: typeof READ_MARK_TYPE;
  /** The edition's Drive file id. */
  refId: string;
  /** When it was marked, or the mark taken back. */
  at: string;
  value: { feedId: FeedId; read: boolean };
}

export const readMarkId = (driveFileId: string) => `ic:${driveFileId}`;

function isReadMark(rec: unknown): rec is ReadMarkRecord {
  const r = rec as ReadMarkRecord | null;
  return !!r && r.type === READ_MARK_TYPE && typeof r.refId === 'string' && typeof r.value?.read === 'boolean' && typeof r.at === 'string';
}

function isReading(rec: unknown): rec is ReadingRecord {
  const r = rec as ReadingRecord | null;
  return !!r && r.type === READING_TYPE && typeof r.refId === 'string' && !!r.value;
}

/** An edition's reading, and its read mark if it has one. */
export type ReadingEntry = ReadingRecord['value'] & { mark?: ReadMark };
export type ReadingIndex = Map<string, ReadingEntry>;

/** Each edition's reading and read mark, from either record (an edition marked read from Today may never have been opened). */
export function readingIndex(log: unknown[] | undefined): ReadingIndex {
  const index: ReadingIndex = new Map();
  const marks: ReadMarkRecord[] = [];
  for (const rec of log || []) {
    if (isReading(rec)) index.set(rec.refId, rec.value);
    else if (isReadMark(rec)) marks.push(rec);
  }
  for (const m of marks) {
    const r = index.get(m.refId);
    const mark = { read: m.value.read, at: m.at };
    index.set(m.refId, r ? { ...r, mark } : { feedId: m.value.feedId, progress: 0, section: null, readAt: null, mark });
  }
  return index;
}

/** Read: marked read by you, and not taken back. */
export const isRead = (e: Pick<Edition, 'driveFileId'>, index: ReadingIndex) => !!index.get(e.driveFileId)?.mark?.read;

export type ReadingState = 'new' | 'started' | 'read' | 'updated';

/**
 * Imported editions (`origin: "backfill"`, INT-34) are the archive: listed,
 * searchable, read like any other, but never counted or flagged as unread.
 */
export const isArchive = (e: Pick<Edition, 'origin'>) => e.origin === 'backfill';

/** Unread for the lists and counts: not marked read, and not in the archive. */
export const countsAsUnread = (e: Edition, index: ReadingIndex) => !isArchive(e) && !isRead(e, index);

/**
 * Marked read (or marked read before Drive's copy last changed: updated);
 * else started, however far, even to the end; else new.
 */
export function readingState(edition: Edition, index: ReadingIndex): ReadingState {
  const r = index.get(edition.driveFileId);
  if (r?.mark?.read) return edition.modifiedTime > r.mark.at ? 'updated' : 'read';
  return r && r.progress > 0 ? 'started' : 'new';
}

function put(log: unknown[] | undefined, edition: Edition, value: ReadingRecord['value']): unknown[] {
  const id = readingId(edition.driveFileId);
  const record: ReadingRecord = { id, type: READING_TYPE, refId: edition.driveFileId, at: new Date().toISOString(), value };
  return [...(log || []).filter(r => (r as { id?: string })?.id !== id), record];
}

/**
 * Where you are now. Returns the log unchanged when nothing worth syncing
 * moved: a new section, a tenth more of the edition, or the end. Reaching the
 * end is noted (`readAt`); it does not mark the edition read.
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

/**
 * Marked read, or the mark taken back: the edition's one read mark, and
 * nothing else. Its reading (progress, section) is left as it was.
 */
export function withReadMark(log: unknown[] | undefined, edition: Pick<Edition, 'driveFileId' | 'feedId'>, read: boolean, now = new Date()): unknown[] {
  const id = readMarkId(edition.driveFileId);
  const record: ReadMarkRecord = { id, type: READ_MARK_TYPE, refId: edition.driveFileId, at: now.toISOString(), value: { feedId: edition.feedId, read } };
  return [...(log || []).filter(r => (r as { id?: string })?.id !== id), record];
}

/** Later first by `at`; a tie is settled by the content, so either order gives the same. */
const byTime = (a: ReadingRecord, b: ReadingRecord) =>
  (a.at !== b.at ? (a.at < b.at ? -1 : 1) : JSON.stringify(a.value) < JSON.stringify(b.value) ? -1 : 1);

/**
 * One edition's reading as two devices left it, combined (D11): the furthest
 * progress, the end reached if either reached it, and the section of the
 * later write. Before INT-57, Mark as unread started an edition over
 * (`resetAt`); records written then still combine so: of a copy from before
 * it, only an end reached after it and the section count. Either order gives
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
