// Your highlights and notes on an article (Intake 2.0 Phase 3), synced between your devices as the app's own
// records in `content`, beside Takeaways; never sent to Instapaper (D8). One record each, type
// `intake-annotation`:
// - `ih:<uuid>`, a passage: a highlight, with your note on it or not. `anchor` (anchor.ts) keeps its exact
//   words and what finds them again;
// - `in:<uuid>`, a note on the whole article (no anchor).
// `note` is your own writing, plain text ('' for none). `takeawayId` is the takeaway it was saved as
// (`is:<id>`, Intelligence's saved.ts): each lives on its own, removing one never removes the other.
//
// Between devices each record is last-write-wins, like a takeaway: the storage stamps every change, two
// highlights made on two devices are both kept, and the same note edited on two devices before they sync keeps
// the later edit. A removal stands (storage/merge.ts, `removalWins`): no copy from another device, edited
// offline or stamped by a clock running ahead, brings it back; highlighting the same words again makes a new
// record with its own id. Highlights may overlap: each stays its own record, with its own note and takeaway
// (`planHighlight`), and they are drawn as one. Finding a passage again writes nothing: a record changes only
// by your hand.
import { generateId } from '../ui/helpers';
import type { PassageAnchor } from './anchor';

export const ANNOTATION_TYPE = 'intake-annotation';

export interface Annotation {
  id: string;
  type: typeof ANNOTATION_TYPE;
  /** The record's shape, for a later change to tell. */
  v: 1;
  kind: 'passage' | 'article';
  bookmarkId: number;
  anchor: PassageAnchor | null;
  note: string;
  takeawayId: string | null;
  createdAt: string;
  /** Your last change to its note. */
  editedAt: string;
}

export const isAnnotation = (r: unknown): r is Annotation => {
  const x = r as Partial<Annotation> & { _deleted?: unknown } | null;
  return !!x && !x._deleted && x.type === ANNOTATION_TYPE && typeof x.id === 'string' && typeof x.bookmarkId === 'number'
    && (x.kind === 'article' || (x.kind === 'passage' && !!x.anchor && typeof x.anchor.quote === 'string'));
};

/** An article's notes, then its passages in the article's order (as they were kept). */
export function annotationsOf(content: unknown[] | undefined, bookmarkId: number): Annotation[] {
  const own = (content ?? []).filter((r): r is Annotation => isAnnotation(r) && r.bookmarkId === bookmarkId);
  const notes = own.filter(a => a.kind === 'article').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const passages = own.filter(a => a.kind === 'passage').sort((a, b) => a.anchor!.start - b.anchor!.start || a.createdAt.localeCompare(b.createdAt));
  return [...notes, ...passages];
}

const stamp = (now: Date) => now.toISOString();
/** Plain text, its ends trimmed: your words as you wrote them otherwise. */
export const cleanNote = (note: string) => note.replace(/\r\n?/g, '\n').trim();

export function newPassage(bookmarkId: number, anchor: PassageAnchor, note = '', now = new Date()): Annotation {
  return { id: `ih:${generateId()}`, type: ANNOTATION_TYPE, v: 1, kind: 'passage', bookmarkId, anchor, note: cleanNote(note), takeawayId: null, createdAt: stamp(now), editedAt: stamp(now) };
}

export function newArticleNote(bookmarkId: number, note: string, now = new Date()): Annotation {
  return { id: `in:${generateId()}`, type: ANNOTATION_TYPE, v: 1, kind: 'article', bookmarkId, anchor: null, note: cleanNote(note), takeawayId: null, createdAt: stamp(now), editedAt: stamp(now) };
}

/** Whether a record's id is a highlight's or a note's (`ih:`, `in:`). */
export const isAnnotationId = (id: string) => /^i[hn]:/.test(id);

const idOf = (r: unknown) => (r as { id?: unknown } | null)?.id;

/** The record added, or put in place of the one with its id. */
export function withAnnotation(content: unknown[] | undefined, a: Annotation): unknown[] {
  const list = content ?? [];
  const i = list.findIndex(r => idOf(r) === a.id);
  if (i < 0) return [...list, a];
  const next = list.slice();
  next[i] = a;
  return next;
}

export function withoutAnnotation(content: unknown[] | undefined, id: string): unknown[] {
  return (content ?? []).filter(r => idOf(r) !== id);
}

const update = (content: unknown[] | undefined, id: string, patch: (a: Annotation) => Annotation): unknown[] => {
  const a = (content ?? []).find((r): r is Annotation => isAnnotation(r) && r.id === id);
  return a ? withAnnotation(content, patch(a)) : content ?? [];
};

/** Your note on it, written, changed or emptied. Unchanged words write nothing. */
export function withNote(content: unknown[] | undefined, id: string, note: string, now = new Date()): unknown[] {
  const next = cleanNote(note);
  return update(content, id, a => (a.note === next ? a : { ...a, note: next, editedAt: stamp(now) }));
}

/** The takeaway it was saved as (or none). */
export function withTakeaway(content: unknown[] | undefined, id: string, takeawayId: string | null): unknown[] {
  return update(content, id, a => (a.takeawayId === takeawayId ? a : { ...a, takeawayId }));
}

/** A passage as it stands in the article now: its record and its offsets in the text. */
export interface Placed {
  a: Annotation;
  start: number;
  end: number;
}

/**
 * What highlighting the words from `start` to `end` does, among the highlights in place:
 * - inside one already (the same words, or fewer): that highlight, nothing new, so doing it twice makes one;
 * - otherwise a new highlight over those words, even where it overlaps others: each one keeps its own
 *   record, note and takeaway (nothing is joined or removed), and they are drawn as one.
 */
export type Plan =
  | { kind: 'new'; start: number; end: number }
  | { kind: 'existing'; a: Annotation };

export function planHighlight(placed: Placed[], start: number, end: number): Plan {
  const inside = placed.filter(p => p.start <= start && end <= p.end).sort((x, y) => (x.end - x.start) - (y.end - y.start));
  return inside.length ? { kind: 'existing', a: inside[0].a } : { kind: 'new', start, end };
}

export interface Counts {
  highlights: number;
  notes: number;
  takeaways: number;
}

export function countsOf(annotations: Annotation[], inTakeaways: (a: Annotation) => boolean): Counts {
  return {
    highlights: annotations.filter(a => a.kind === 'passage').length,
    notes: annotations.filter(a => a.note).length,
    takeaways: annotations.filter(inTakeaways).length,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "2 highlights · 1 note · 1 in Takeaways", leaving out what there is none of; null when there is nothing. */
export function summaryOf(c: Counts): string | null {
  const parts = [
    c.highlights && plural(c.highlights, 'highlight', 'highlights'),
    c.notes && plural(c.notes, 'note', 'notes'),
    c.takeaways && `${c.takeaways} in Takeaways`,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
