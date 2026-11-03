// Takeaways back for review (INT-40, decision D7): the questions, lines,
// terms and passages you keep come back for a short recall, spaced by the
// Practice section's own intervals: rated 1 (not yet) a takeaway returns
// tomorrow, 5 (knew it) in a month.
//
// One synced record per takeaway in `progressLog` (`rv:<takeaway id>`), last
// write wins like reading state, so two devices converge. A takeaway without
// one is in review from the day after it was kept if it is a question, a
// line, a term or a passage; a section joins only when added; an edition
// never (its title is nothing to recall). Days are Paris days.
import type { SavedInsight, SavedKind } from './saved';
import { addDaysKey, dayKeyOf, dayNameShort, formatDayCompact, type DayKey } from '../routine/dates';
import { practiceIntervalDays } from '../practice/practice-logic';

export const REVIEW_TYPE = 'intel-review';

export interface ReviewValue {
  /** In review; false once taken out (or a section never added). */
  on: boolean;
  /** The Paris day it is due. */
  due: DayKey;
  /** The last rating, 1–5; null before the first. */
  confidence: number | null;
  /** How many times it has been rated. */
  count: number;
  lastAt: string | null;
}

export interface ReviewRecord {
  id: string;
  type: typeof REVIEW_TYPE;
  /** The takeaway's id. */
  refId: string;
  at: string;
  value: ReviewValue;
}

export type ReviewIndex = Map<string, ReviewValue>;

export const reviewId = (takeawayId: string) => `rv:${takeawayId}`;

/** The ratings, in the Practice section's words where it has them. */
export const RATINGS: { value: number; label: string }[] = [
  { value: 1, label: 'Not yet' },
  { value: 2, label: 'A little' },
  { value: 3, label: 'Fairly well' },
  { value: 4, label: 'Well' },
  { value: 5, label: 'Knew it' },
];

/** At most this many in one go; "Review n more" follows. */
export const SESSION_SIZE = 10;

const BY_DEFAULT: SavedKind[] = ['labelled', 'term', 'passage'];

function isReview(rec: unknown): rec is ReviewRecord {
  const r = rec as ReviewRecord | null;
  return !!r && r.type === REVIEW_TYPE && typeof r.refId === 'string' && !!r.value;
}

export function reviewIndex(log: unknown[] | undefined): ReviewIndex {
  const index: ReviewIndex = new Map();
  for (const rec of log || []) if (isReview(rec)) index.set(rec.refId, rec.value);
  return index;
}

/** Whether a takeaway can be reviewed at all. */
export const canReview = (item: SavedInsight) => item.kind !== 'edition';

export interface ReviewStatus {
  on: boolean;
  /** The day it is due, while in review. */
  due: DayKey | null;
  confidence: number | null;
  count: number;
}

/** Where a takeaway stands: out of review, or in it and due on a day. */
export function statusOf(item: SavedInsight, index: ReviewIndex): ReviewStatus {
  const r = index.get(item.id);
  if (r) return { on: r.on, due: r.on ? r.due : null, confidence: r.confidence, count: r.count };
  if (BY_DEFAULT.includes(item.kind)) {
    return { on: true, due: addDaysKey(dayKeyOf(new Date(item.savedAt)), 1), confidence: null, count: 0 };
  }
  return { on: false, due: null, confidence: null, count: 0 };
}

const isDue = (s: ReviewStatus, today: DayKey) => s.on && !!s.due && s.due <= today;

/**
 * What is due today, least known first (as the Practice section orders its
 * batches: one never rated before any), then the longest waiting, then the
 * one kept first.
 */
export function dueOf(saved: SavedInsight[], index: ReviewIndex, today: DayKey): SavedInsight[] {
  return saved
    .map(item => ({ item, s: statusOf(item, index) }))
    .filter(x => isDue(x.s, today))
    .sort((a, b) => (a.s.confidence ?? 0) - (b.s.confidence ?? 0)
      || a.s.due!.localeCompare(b.s.due!)
      || a.item.savedAt.localeCompare(b.item.savedAt))
    .map(x => x.item);
}

/** How many come due on a given day (not before it). */
export function dueOn(saved: SavedInsight[], index: ReviewIndex, day: DayKey): number {
  return saved.filter(item => statusOf(item, index).due === day).length;
}

/** The day a rating sends a takeaway back for review. */
export const dueAfter = (confidence: number, today: DayKey) => addDaysKey(today, practiceIntervalDays(confidence));

/** `at` is when it was done: which of two devices' actions came later (`mergeReview`). */
function put(log: unknown[] | undefined, takeawayId: string, value: ReviewValue, now: Date): unknown[] {
  const id = reviewId(takeawayId);
  const record: ReviewRecord = { id, type: REVIEW_TYPE, refId: takeawayId, at: now.toISOString(), value };
  return [...(log || []).filter(r => (r as { id?: string })?.id !== id), record];
}

/** Rated 1–5: it comes back after the Practice section's interval for that rating. */
export function withRating(log: unknown[] | undefined, item: SavedInsight, confidence: number, now = new Date()): unknown[] {
  const before = reviewIndex(log).get(item.id);
  return put(log, item.id, {
    on: true,
    due: dueAfter(confidence, dayKeyOf(now)),
    confidence,
    count: (before?.count ?? 0) + 1,
    lastAt: now.toISOString(),
  }, now);
}

/** Into review (back the next day) or out of it, keeping what it knew. */
export function withReviewing(log: unknown[] | undefined, item: SavedInsight, on: boolean, now = new Date()): unknown[] {
  const before = reviewIndex(log).get(item.id);
  const today = dayKeyOf(now);
  return put(log, item.id, {
    on,
    due: on ? addDaysKey(today, 1) : (before?.due ?? today),
    confidence: before?.confidence ?? null,
    count: before?.count ?? 0,
    lastAt: before?.lastAt ?? null,
  }, now);
}

/**
 * One takeaway's review as two devices left it (decision D12): the later
 * action stands (a rating, or taking it out), and the count keeps the higher.
 * Either order gives the same result.
 */
export function mergeReview(a: ReviewRecord, b: ReviewRecord): ReviewRecord {
  const later = a.at !== b.at ? (a.at > b.at ? a : b) : JSON.stringify(a.value) > JSON.stringify(b.value) ? a : b;
  return { ...later, value: { ...later.value, count: Math.max(a.value.count, b.value.count) } };
}

/** A takeaway removed takes its review with it. */
export function withoutReview(log: unknown[] | undefined, takeawayId: string): unknown[] {
  const id = reviewId(takeawayId);
  const all = log || [];
  return all.some(r => (r as { id?: string })?.id === id) ? all.filter(r => (r as { id?: string })?.id !== id) : all;
}

export type ReviewKind = 'question' | 'line' | 'term' | 'passage' | 'section';

/** What a takeaway is, for counting and for asking. */
export function reviewKindOf(item: SavedInsight): ReviewKind {
  if (item.kind === 'term') return 'term';
  if (item.kind === 'passage') return 'passage';
  if (item.kind === 'labelled') return /question/i.test(item.label ?? '') ? 'question' : 'line';
  return 'section';
}

const NAMES: Record<ReviewKind, [string, string]> = {
  question: ['question', 'questions'],
  line: ['line to rehearse', 'lines to rehearse'],
  term: ['term', 'terms'],
  passage: ['passage', 'passages'],
  section: ['section', 'sections'],
};

/** "2 questions", "1 term"…, in that order, for what is due. */
export function kindsOf(items: SavedInsight[]): string[] {
  const counts = new Map<ReviewKind, number>();
  for (const item of items) counts.set(reviewKindOf(item), (counts.get(reviewKindOf(item)) ?? 0) + 1);
  return (Object.keys(NAMES) as ReviewKind[])
    .filter(k => counts.get(k))
    .map(k => `${counts.get(k)} ${NAMES[k][counts.get(k) === 1 ? 0 : 1]}`);
}

/** What the card asks before showing what was kept. */
export function cueOf(item: SavedInsight): { prompt: string; reveal: string } {
  switch (reviewKindOf(item)) {
    case 'term': return { prompt: 'What does it mean?', reveal: 'Show the meaning' };
    case 'question': return { prompt: 'What would you ask a customer about this?', reveal: 'Show what you kept' };
    case 'line': return {
      prompt: /respon|answer|reply/i.test(item.label ?? '') ? 'How would you respond?' : 'How would you put it?',
      reveal: 'Show what you kept',
    };
    case 'passage': return { prompt: 'What was the point?', reveal: 'Show what you kept' };
    default: return { prompt: 'What were the main points?', reveal: 'Show what you kept' };
  }
}

/** About half a minute a card. */
export const minutesFor = (n: number) => Math.max(1, Math.round(n / 2));

const AFTER: Record<number, string> = { 1: 'tomorrow', 3: 'in 3 days', 7: 'in a week', 14: 'in 2 weeks', 30: 'in a month' };

/** When a rating sends it back: "tomorrow", "in a week"… */
export function whenText(confidence: number): string {
  const days = practiceIntervalDays(confidence);
  return AFTER[days] ?? `in ${days} days`;
}

/** A day it is due: "tomorrow", else "Thu 5 Nov". */
export const dayText = (day: DayKey, today: DayKey) =>
  (day === addDaysKey(today, 1) ? 'tomorrow' : `${dayNameShort(day)} ${formatDayCompact(day)}`);
