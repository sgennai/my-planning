// Your reading of an article, synced between your devices through the app's own records (`progressLog`),
// as Intelligence's editions are: never sent to Instapaper (D8). Three things, kept apart:
// - the place you were last (`place`), and the furthest you have read (`progress`), in one record
//   `ar:<bookmark id>` (type `intake-reading`), written as scrolling rests and on leaving the article;
// - Finished, only by your tap, in its own record `ac:<bookmark id>` (type `intake-read-mark`); taking it
//   back writes the same record again. Scrolling to the end marks nothing.
// When two devices both changed an article's reading before syncing, the copies combine (`mergeReading`,
// called by storage/merge.ts on every pull): the furthest progress of the two, and the place of the later
// write. The Finished mark stays last-write-wins, like a routine tick.
import type { Place } from './place';
import { samePlace } from './place';

export const READING_TYPE = 'intake-reading';
export const READ_MARK_TYPE = 'intake-read-mark';
export const readingId = (bookmarkId: number) => `ar:${bookmarkId}`;
export const readMarkId = (bookmarkId: number) => `ac:${bookmarkId}`;

export interface ReadingRecord {
  id: string;
  type: typeof READING_TYPE;
  /** The bookmark's id. */
  refId: string;
  /** When it was written. */
  at: string;
  value: {
    /** 0–1, the furthest you have read. */
    progress: number;
    /** Where it reopens; null: at the top. */
    place: Place | null;
  };
}

export interface ReadMarkRecord {
  id: string;
  type: typeof READ_MARK_TYPE;
  refId: string;
  at: string;
  value: { finished: boolean };
}

/** A tenth more read is worth a write even in the same place. */
const PROGRESS_STEP = 0.1;

const isRecord = (r: unknown, type: string): r is { id: string; type: string; refId: string; at: string; value: Record<string, unknown> } => {
  const x = r as { id?: unknown; type?: unknown; value?: unknown; _deleted?: unknown } | null;
  return !!x && !x._deleted && x.type === type && typeof x.id === 'string' && !!x.value;
};

export function readingOf(log: unknown[] | undefined, bookmarkId: number): ReadingRecord | null {
  const id = readingId(bookmarkId);
  const r = (log ?? []).find(x => (x as { id?: string })?.id === id);
  return isRecord(r, READING_TYPE) ? (r as unknown as ReadingRecord) : null;
}

const put = <T extends { id: string }>(log: unknown[] | undefined, record: T): unknown[] =>
  [...(log ?? []).filter(r => (r as { id?: string })?.id !== record.id), record];

/**
 * Where you are now. The log comes back unchanged when nothing worth syncing moved: the place by less than
 * about a line, and the progress by less than a tenth.
 */
export function withPosition(log: unknown[] | undefined, bookmarkId: number, progress: number, place: Place | null, now = new Date()): unknown[] {
  const before = readingOf(log, bookmarkId)?.value;
  const furthest = Math.max(before?.progress ?? 0, Math.min(1, Math.max(0, progress)));
  const moved = !before || !samePlace(place, before.place) || furthest - before.progress >= PROGRESS_STEP || (furthest === 1 && before.progress < 1);
  if (!moved || (!before && !place && furthest < 0.02)) return log ?? [];
  const record: ReadingRecord = { id: readingId(bookmarkId), type: READING_TYPE, refId: String(bookmarkId), at: now.toISOString(), value: { progress: furthest, place } };
  return put(log, record);
}

/** Finished, or taken back: the article's one mark, and nothing else. */
export function withFinished(log: unknown[] | undefined, bookmarkId: number, finished: boolean, now = new Date()): unknown[] {
  const record: ReadMarkRecord = { id: readMarkId(bookmarkId), type: READ_MARK_TYPE, refId: String(bookmarkId), at: now.toISOString(), value: { finished } };
  return put(log, record);
}

/**
 * One article's reading as two devices left it, combined: the furthest progress, and the place of the
 * later write (where you were last, on whichever device). Either order gives the same result.
 */
export function mergeReading(a: ReadingRecord, b: ReadingRecord): ReadingRecord {
  const later = a.at !== b.at ? (a.at > b.at ? a : b) : JSON.stringify(a.value) > JSON.stringify(b.value) ? a : b;
  return { ...later, value: { progress: Math.max(a.value.progress ?? 0, b.value.progress ?? 0), place: later.value.place ?? null } };
}
